import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { getImportSpec } from '@/lib/import/spec';
import { refOptions } from '@/lib/module-fields';

export const dynamic = 'force-dynamic';

const EXAMPLE: Record<string, string> = { number: '10', money: '1500', date: '2026-04-01', email: 'name@company.com', checkbox: 'Yes', text: '', textarea: '' };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') ?? '';
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
  const me = await getSessionProfile();
  const spec = getImportSpec(key);
  if (!me || !me.is_active || !spec || !spec.roles.includes(me.role)) return new NextResponse('Not allowed', { status: 403 });

  const supabase = await createClient();
  const fields = spec.fields.filter((f) => !f.roles || f.roles.includes(me.role));

  const guide: string[][] = [['Column', 'Required', 'What to enter']];
  const example: string[] = [];
  for (const f of fields) {
    let what = f.hint ? `${f.hint} ` : '';
    let ex = EXAMPLE[f.type] ?? '';
    if (f.ref) {
      const list = (await refOptions(supabase, f.ref.table, f.ref.label, f.ref.where)).map(([, l]) => l);
      what += list.length ? `Must match an existing name: ${list.slice(0, 25).join(' | ')}${list.length > 25 ? ' | ...' : ''}` : 'No records exist yet, so leave this blank or add them first.';
      ex = list[0] ?? '';
    } else if (f.type === 'select') {
      what += `One of: ${(f.options ?? []).map(([, l]) => l).join(' | ')}`;
      ex = (f.options ?? []).find(([v]) => v === f.default)?.[1] ?? f.options?.[0]?.[1] ?? '';
    } else if (f.type === 'date') what += 'Format 2026-04-01 or 01/04/2026 (day first).';
    else if (f.type === 'money' || f.type === 'number') what += 'Numbers only.';
    else if (f.type === 'checkbox') what += 'Yes or No.';
    const needed = f.required && (f.default === undefined || f.default === null);
    guide.push([f.label, needed ? 'Yes' : 'No', what.trim() || 'Free text']);
    example.push(ex);
  }

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([fields.map((f) => f.label), example]);
  sheet['!cols'] = fields.map((f) => ({ wch: Math.max(14, f.label.length + 2) }));
  XLSX.utils.book_append_sheet(wb, sheet, 'Import');
  const g = XLSX.utils.aoa_to_sheet(guide);
  g['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, g, 'How to fill');

  const name = `${spec.key}-import-template`;
  if (format === 'csv') {
    const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(sheet);
    return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` } });
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${name}.xlsx"` } });
}
