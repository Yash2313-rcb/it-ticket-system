import 'server-only';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { refOptions } from '@/lib/module-fields';
import { friendlyDbError } from '@/lib/db-error';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, type ImportField, type ImportSpec } from './spec';
import type { Role } from '@/lib/permissions';
import { toYmd } from './dates';
import type { SheetData } from './adapter';

export type ImportResult = {
  ok?: boolean;
  error?: string;
  mode?: 'check' | 'import';
  total?: number;
  valid?: number;
  imported?: number;
  errors?: { row: number; message: string }[];
  moreErrors?: number;
  matched?: string[];
  ignored?: string[];
  /** Remarks about how the file was read (derived values, moved text, skipped columns). */
  notes?: string[];
};

const MAX_SHOWN_ERRORS = 40;
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normNoParens = (s: unknown) => norm(String(s ?? '').replace(/\(.*?\)/g, ' '));
const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/** Column headers a person might reasonably type for a field. */
const aliases = (f: ImportField) => new Set([norm(f.label), normNoParens(f.label), norm(f.name), norm(f.name.replace(/_id$/, ''))].filter(Boolean));

export async function readSheet(file: File): Promise<SheetData | { error: string }> {
  if (!file || file.size === 0) return { error: 'Choose a CSV or Excel file first.' };
  if (file.size > MAX_IMPORT_BYTES) return { error: 'The file is larger than 5 MB. Split it into smaller files.' };
  const name = file.name.toLowerCase();
  if (!/\.(csv|xlsx|xls|xlsm|tsv|txt)$/.test(name)) return { error: 'Use a .csv or .xlsx file.' };
  let wb: XLSX.WorkBook;
  try {
    if (/\.(csv|tsv|txt)$/.test(name)) {
      const text = new TextDecoder('utf-8').decode(await file.arrayBuffer()).replace(/^\uFEFF/, '');
      wb = XLSX.read(text, { type: 'string', raw: true }); // raw: keep "007" and phone numbers exactly as typed
    } else {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    }
  } catch {
    return { error: 'This file could not be read. Save it again as .xlsx or .csv and retry.' };
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { error: 'The file has no sheet with data.' };
  const startRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
  const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true, blankrows: true });
  const kept: { cells: unknown[]; no: number }[] = [];
  all.forEach((cells, i) => { if (cells.some((c) => !isBlank(c))) kept.push({ cells, no: startRow + i + 1 }); }); // no = the row number shown in Excel
  if (kept.length < 2) return { error: 'The file needs a header row and at least one data row.' };
  return { headers: kept[0].cells.map((h) => String(h ?? '').trim()), rows: kept.slice(1).map((k) => k.cells), rowNos: kept.slice(1).map((k) => k.no) };
}

type Coerced = { value?: any; skip?: true; error?: string; warn?: string };

function coerce(f: ImportField, raw: unknown, refs: Map<string, Map<string, string>>): Coerced {
  if (isBlank(raw)) {
    if (f.default !== undefined && f.default !== null) return { value: f.default };
    if (f.required) return { error: `${f.label} is required.` };
    if (f.type === 'checkbox') return { value: false };
    if (f.type === 'select' && !f.ref) return { skip: true }; // let the database default apply
    return { value: null };
  }
  const text = raw instanceof Date ? '' : typeof raw === 'number' ? String(raw) : String(raw).trim();

  switch (f.type) {
    case 'number':
    case 'money': {
      const s = text.replace(/[₹,\s]|rs\.?|inr/gi, '');
      if (!/^-?\d+(\.\d+)?$/.test(s)) return { error: `${f.label} must be a number (got "${text}").` };
      const n = Number(s);
      const min = f.min ?? (f.type === 'money' ? 0 : undefined);
      if (min !== undefined && n < min) return { error: `${f.label} cannot be less than ${min}.` };
      return { value: n };
    }
    case 'date': {
      const ymd = toYmd(raw);
      return ymd ? { value: ymd } : { error: `${f.label} must be a date such as 2026-04-01 or 01/04/2026 (got "${text}").` };
    }
    case 'email':
      return z.string().email().safeParse(text).success ? { value: text } : { error: `${f.label} is not a valid email address.` };
    case 'checkbox':
      return { value: /^(y|yes|true|1|active|on)$/i.test(text) };
    case 'select': {
      if (f.ref) {
        if (z.string().uuid().safeParse(text).success) return { value: text };
        const id = text.split('||').map((t) => refs.get(f.name)?.get(norm(t))).find(Boolean); // "A||B" = try A, then B
        if (!id && f.lenient) return { value: null, warn: text };
        return id ? { value: id } : { error: `${f.label} "${text}" was not found. Use a name exactly as it appears in the app.` };
      }
      const hit = (f.options ?? []).find(([val, label]) => norm(val) === norm(text) || norm(label) === norm(text));
      if (!hit) return { error: `${f.label} "${text}" is not allowed. Choose one of: ${(f.options ?? []).map(([, l]) => l).join(', ')}.` };
      return { value: f.name === 'month' ? Number(hit[0]) : hit[0] };
    }
    case 'textarea':
      return text.length > 4000 ? { error: `${f.label} is too long.` } : { value: text };
    default:
      return text.length > 500 ? { error: `${f.label} is too long (500 characters max).` } : { value: text };
  }
}

export async function runImport(spec: ImportSpec, me: { id: string; role: Role }, file: File, mode: 'check' | 'import', supabase: any): Promise<ImportResult> {
  const read = await readSheet(file);
  if ('error' in read) return { error: read.error, mode };
  let sheet: SheetData = read;
  let notes: string[] = [];
  let usedByAdapter: { matched: string[]; ignored: string[] } | null = null;
  if (spec.adapter?.detect(sheet.headers)) {
    const out = spec.adapter.convert(sheet);
    if ('error' in out) return { error: out.error, mode };
    sheet = out.sheet; notes = out.notes; usedByAdapter = { matched: out.matched, ignored: out.ignored };
  }
  if (sheet.rows.length > MAX_IMPORT_ROWS) return { error: `The file has ${sheet.rows.length.toLocaleString('en-IN')} rows. Import at most ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} at a time.`, mode };

  const fields = spec.fields.filter((f) => !f.roles || f.roles.includes(me.role));

  // Match file columns to fields
  const colFor = new Map<string, number>();
  const used = new Set<number>();
  for (const f of fields) {
    const a = aliases(f);
    const idx = sheet.headers.findIndex((h, i) => !used.has(i) && a.has(norm(h)) );
    const idx2 = idx >= 0 ? idx : sheet.headers.findIndex((h, i) => !used.has(i) && a.has(normNoParens(h)));
    if (idx2 >= 0) { colFor.set(f.name, idx2); used.add(idx2); }
  }
  const matched = usedByAdapter?.matched ?? fields.filter((f) => colFor.has(f.name)).map((f) => f.label);
  const ignored = usedByAdapter?.ignored ?? sheet.headers.filter((h, i) => h && !used.has(i));
  const missing = fields.filter((f) => f.required && !colFor.has(f.name) && (f.default === undefined || f.default === null));
  if (missing.length) {
    return { error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.map((f) => f.label).join(', ')}. Download the template to see the expected columns.`, mode, matched, ignored };
  }
  if (!matched.length) return { error: 'None of the column headings matched. Download the template and keep its first row.', mode, ignored };

  // Lookup lists for dropdown-style references (department name -> id, vendor name -> id, ...)
  const refs = new Map<string, Map<string, string>>();
  await Promise.all(fields.filter((f) => f.ref && colFor.has(f.name)).map(async (f) => {
    const list = await refOptions(supabase, f.ref!.table, f.ref!.label, f.ref!.where);
    const m = new Map<string, string>();
    for (const [id, label] of list) {
      m.set(norm(label), id);
      label.split(' - ').forEach((part) => { if (!m.has(norm(part))) m.set(norm(part), id); });
    }
    refs.set(f.name, m);
  }));

  const unmatched = new Map<string, number>(); // lenient references that were not found, with how many rows
  const good: { row: number; values: Record<string, any> }[] = [];
  const errors: { row: number; message: string }[] = [];
  sheet.rows.forEach((cells, i) => {
    const rowNo = sheet.rowNos?.[i] ?? i + 2; // matches the row number in Excel
    const values: Record<string, any> = {};
    const problems: string[] = [];
    for (const f of fields) {
      const col = colFor.get(f.name);
      // A column that is not in the file at all falls back to the field default (or is skipped).
      const c = coerce(f, col === undefined ? '' : cells[col], refs);
      if (c.warn) unmatched.set(c.warn, (unmatched.get(c.warn) ?? 0) + 1);
      if (c.error) problems.push(c.error);
      else if (!c.skip) values[f.name] = c.value;
    }
    if (!problems.length && spec.validate) { const msg = spec.validate(values); if (msg) problems.push(msg); }
    if (problems.length) errors.push({ row: rowNo, message: problems.join(' ') });
    else good.push({ row: rowNo, values });
  });

  if (unmatched.size) {
    const names = [...unmatched.keys()];
    const rowsAffected = [...unmatched.values()].reduce((a, b) => a + b, 0);
    notes = [...notes, `${rowsAffected} ${rowsAffected === 1 ? 'row names' : 'rows name'} someone who is not an employee in the app yet (${names.slice(0, 12).join(', ')}${names.length > 12 ? ', ...' : ''}). Those assets will be saved without an assignee. To assign them, import the employees first and then check this file again.`];
  }
  const base: ImportResult = { mode, total: sheet.rows.length, valid: good.length, matched, ignored, notes };
  const shown = (list: { row: number; message: string }[]) => ({ errors: list.slice(0, MAX_SHOWN_ERRORS), moreErrors: Math.max(0, list.length - MAX_SHOWN_ERRORS) });

  if (mode === 'check') return { ...base, ok: true, ...shown(errors) };
  if (!good.length) return { ...base, error: 'No valid rows to import. Fix the problems listed and try again.', ...shown(errors) };

  // Save: batches of 100, falling back to one-by-one when a batch is rejected so we can say which row failed.
  const prepared = good.map((g) => {
    const v = { ...g.values };
    spec.finish?.(v);
    if (spec.codeField && (v[spec.codeField] === null || v[spec.codeField] === undefined)) v[spec.codeField] = '';
    if (spec.codeField && !(spec.codeField in v)) v[spec.codeField] = '';
    if (spec.stampCreator) v[spec.stampCreator] = me.id;
    return { row: g.row, v };
  });
  let imported = 0;
  let handled = 0;
  const failed: { row: number; message: string }[] = [];
  const strip = (v: Record<string, any>) => { const o = { ...v }; (spec.virtual ?? []).forEach((k) => delete o[k]); return o; };
  const save = (list: typeof prepared) => {
    const q = supabase.from(spec.table).insert(list.map((b) => strip(b.v)));
    return spec.afterInsert ? q.select('id') : q;
  };
  const finishBatch = async (list: typeof prepared, data: any[] | null) => {
    imported += list.length;
    if (spec.afterInsert && data) {
      const r = await spec.afterInsert(list.map((b, i) => ({ row: b.row, values: b.v, id: data[i]?.id })).filter((x) => x.id), supabase);
      failed.push(...r.errors); handled += r.done;
    }
  };
  for (let i = 0; i < prepared.length; i += 100) {
    const batch = prepared.slice(i, i + 100);
    const { error, data } = await save(batch);
    if (!error) { await finishBatch(batch, data); continue; }
    for (const b of batch) {
      const { error: e, data: d } = await save([b]);
      if (e) failed.push({ row: b.row, message: friendlyDbError(e.message) });
      else await finishBatch([b], d);
    }
  }
  if (handled) notes = [...notes, `${handled} ${handled === 1 ? 'asset was' : 'assets were'} assigned to employees.`];
  const all = [...errors, ...failed].sort((a, b) => a.row - b.row);
  return { ...base, notes, ok: imported > 0, imported, error: imported === 0 ? 'Nothing was imported.' : undefined, ...shown(all) };
}
