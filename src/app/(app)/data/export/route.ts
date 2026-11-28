import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { MODULES } from '@/lib/modules/registry';
import { applyModuleQuery, getPath } from '@/lib/modules/query';

export const dynamic = 'force-dynamic';
const LIMIT = 20000;

/** Spreadsheet formulas typed into a cell would run when the file is opened, so neutralise them. */
const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const cfg = MODULES[sp.key ?? ''];
  const me = await getSessionProfile();
  if (!me || !me.is_active || !cfg || !cfg.readRoles.includes(me.role)) return new NextResponse('Not allowed', { status: 403 });

  const supabase = await createClient();
  const q = applyModuleQuery(supabase.from(cfg.table).select(cfg.select).limit(LIMIT), cfg, sp);
  const { data, error } = await q;
  if (error) return new NextResponse(error.message, { status: 500 });

  // Columns shown on screen; modules without a table view (budgets) export their form fields.
  const cols = cfg.cols.length
    ? cfg.cols.map((c) => ({ label: c.label, path: c.path }))
    : cfg.fields.filter((f) => f.type !== 'file').map((f) => ({ label: f.label, path: f.name }));
  const rows = (data as any[]).map((r) => Object.fromEntries(cols.map((c) => [c.label, safe(getPath(r, c.path) ?? '')])));

  const sheet = XLSX.utils.json_to_sheet(rows, { header: cols.map((c) => c.label) });
  sheet['!cols'] = cols.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));
  const stamp = new Date().toISOString().slice(0, 10);
  if (sp.format === 'csv') {
    return new NextResponse('\uFEFF' + XLSX.utils.sheet_to_csv(sheet), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${cfg.key}-${stamp}.csv"` } });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, cfg.title.slice(0, 31));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${cfg.key}-${stamp}.xlsx"` } });
}
