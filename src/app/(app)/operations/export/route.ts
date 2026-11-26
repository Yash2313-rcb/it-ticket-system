import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { isItStaff } from '@/lib/permissions';
import { applyTaskFilters, applyTicketFilters, nameMap, PRIORITY, TASK_STATUS, TICKET_STATUS } from '@/lib/ops';

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(',')).join('\r\n');

export async function GET(req: NextRequest) {
  const me = await getSessionProfile();
  if (!me || !me.is_active || !isItStaff(me.role)) return new NextResponse('Not allowed', { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const supabase = await createClient();
  const stamp = new Date().toISOString().slice(0, 10);

  if (sp.kind === 'tickets') {
    let q: any = supabase
      .from('tickets')
      .select('ticket_code, title, status, priority, reported_at, resolved_at, time_taken_minutes, assigned_to, reported_by, resolution_details, ticket_categories(name), employees(full_name), departments(name)')
      .order('reported_at', { ascending: false })
      .limit(5000);
    q = applyTicketFilters(q, sp, me.id);
    const { data, error } = await q;
    if (error) return new NextResponse(error.message, { status: 500 });
    const names = await nameMap(supabase, (data ?? []).flatMap((t: any) => [t.assigned_to, t.reported_by]));
    const rows: unknown[][] = [['Ticket ID', 'Title', 'Category', 'Raised for', 'Department', 'Reported', 'Assigned to', 'Priority', 'Status', 'Resolved', 'Minutes taken', 'Resolution']];
    (data ?? []).forEach((t: any) => rows.push([
      t.ticket_code, t.title, t.ticket_categories?.name, t.employees?.full_name ?? names[t.reported_by], t.departments?.name,
      t.reported_at, names[t.assigned_to], PRIORITY[t.priority as keyof typeof PRIORITY], TICKET_STATUS[t.status as keyof typeof TICKET_STATUS],
      t.resolved_at, t.time_taken_minutes, t.resolution_details,
    ]));
    return new NextResponse(toCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="tickets-${stamp}.csv"` } });
  }

  let q: any = supabase
    .from('tasks')
    .select('task_code, title, task_date, start_time, end_time, status, priority, time_spent_minutes, performed_by, assigned_by, remarks, task_categories(name), departments(name)')
    .order('task_date', { ascending: false })
    .limit(5000);
  q = applyTaskFilters(q, sp);
  const { data, error } = await q;
  if (error) return new NextResponse(error.message, { status: 500 });
  const names = await nameMap(supabase, (data ?? []).flatMap((t: any) => [t.performed_by, t.assigned_by]));
  const rows: unknown[][] = [['Task ID', 'Title', 'Category', 'Date', 'Start', 'End', 'Assigned by', 'Performed by', 'Department', 'Priority', 'Status', 'Minutes spent', 'Remarks']];
  (data ?? []).forEach((t: any) => rows.push([
    t.task_code, t.title, t.task_categories?.name, t.task_date, t.start_time?.slice(0, 5), t.end_time?.slice(0, 5),
    names[t.assigned_by], names[t.performed_by], t.departments?.name, PRIORITY[t.priority as keyof typeof PRIORITY],
    TASK_STATUS[t.status as keyof typeof TASK_STATUS], t.time_spent_minutes, t.remarks,
  ]));
  return new NextResponse(toCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="tasks-${stamp}.csv"` } });
}
