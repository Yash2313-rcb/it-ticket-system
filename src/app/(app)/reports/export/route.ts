import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { isAdmin } from '@/lib/permissions';
import { REPORT_MAP, defaultPeriod, validYmd } from '@/lib/reports';
import { toCsv, toPdf, toXlsx } from '@/lib/report-export';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const me = await getSessionProfile();
  if (!me || !me.is_active || !isAdmin(me.role)) return new NextResponse('Not allowed', { status: 403 });
  const sp = req.nextUrl.searchParams;
  const def = REPORT_MAP[sp.get('report') ?? ''];
  const format = sp.get('format') ?? 'csv';
  if (!def) return new NextResponse('Unknown report', { status: 404 });
  const dp = defaultPeriod();
  const period = { from: validYmd(sp.get('from') ?? undefined) ? sp.get('from')! : dp.from, to: validYmd(sp.get('to') ?? undefined) ? sp.get('to')! : dp.to };

  const supabase = await createClient();
  const { data: org } = await supabase.from('system_settings').select('value').eq('key', 'organization_name').single();
  const orgName = (org?.value as string) ?? 'IT Department';
  let res;
  try { res = await def.run(supabase, period); } catch (e: any) { return new NextResponse(e?.message ?? 'Report failed', { status: 500 }); }

  const name = `${def.key}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'xlsx') {
    return new NextResponse(new Uint8Array(toXlsx(orgName, def, period, res)), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}.xlsx"` } });
  }
  if (format === 'pdf') {
    return new NextResponse(new Uint8Array(toPdf(orgName, def, period, res, me.full_name)), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` } });
  }
  return new NextResponse(toCsv(def, res), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` } });
}
