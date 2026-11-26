import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { isItStaff } from '@/lib/permissions';
import { REPORT_MAP } from '@/lib/reports';
import { toCsv, toPdf, toXlsx } from '@/lib/report-export';

export const runtime = 'nodejs';

/** Monthly tickets report for IT staff: /operations/tickets/report?month=2026-11&format=pdf|xlsx|csv */
export async function GET(req: NextRequest) {
  const me = await getSessionProfile();
  if (!me || !me.is_active || !isItStaff(me.role)) return new NextResponse('Not allowed', { status: 403 });

  const sp = req.nextUrl.searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get('month') ?? '') ? (sp.get('month') as string) : new Date().toISOString().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const period = { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
  const format = sp.get('format') ?? 'pdf';

  const def = REPORT_MAP['monthly-tickets'];
  const supabase = await createClient();
  const { data: org } = await supabase.from('system_settings').select('value').eq('key', 'organization_name').single();
  const orgName = (org?.value as string) ?? 'IT Department';
  let res;
  try { res = await def.run(supabase, period); } catch (e: any) { return new NextResponse(e?.message ?? 'Report failed', { status: 500 }); }

  const name = `monthly-tickets-${month}`;
  if (format === 'xlsx') return new NextResponse(new Uint8Array(toXlsx(orgName, def, period, res)), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}.xlsx"` } });
  if (format === 'csv') return new NextResponse(toCsv(def, res), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` } });
  return new NextResponse(new Uint8Array(toPdf(orgName, def, period, res, me.full_name)), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` } });
}
