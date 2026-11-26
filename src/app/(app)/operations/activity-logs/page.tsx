import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { dayEndIso, dayStartIso, formatMinutes, nameMap, PRIORITY, TASK_STATUS, taskStatusTone, todayYmd } from '@/lib/ops';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

function shift(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolvePeriod(period: string, date: string) {
  if (period === 'week') {
    const d = new Date(`${date}T00:00:00Z`);
    const monday = shift(date, -((d.getUTCDay() + 6) % 7));
    return { from: monday, to: shift(monday, 6), prev: shift(monday, -7), next: shift(monday, 7), label: `Week of ${formatDate(monday)}` };
  }
  if (period === 'month') {
    const from = `${date.slice(0, 7)}-01`;
    const nextFirst = new Date(`${from}T00:00:00Z`);
    nextFirst.setUTCMonth(nextFirst.getUTCMonth() + 1);
    const prevFirst = new Date(`${from}T00:00:00Z`);
    prevFirst.setUTCMonth(prevFirst.getUTCMonth() - 1);
    const to = shift(nextFirst.toISOString().slice(0, 10), -1);
    return { from, to, prev: prevFirst.toISOString().slice(0, 10), next: nextFirst.toISOString().slice(0, 10), label: new Date(`${from}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }
  return { from: date, to: date, prev: shift(date, -1), next: shift(date, 1), label: formatDate(date) };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (<Card className="p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></Card>);
}

export default async function ActivityLogsPage({ searchParams }: { searchParams: Promise<{ period?: string; date?: string }> }) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/operations/tickets');

  const sp = await searchParams;
  const period = ['day', 'week', 'month'].includes(sp.period ?? '') ? (sp.period as string) : 'day';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? (sp.date as string) : todayYmd();
  const r = resolvePeriod(period, date);
  const supabase = await createClient();

  const [{ data: tasks }, { data: raised }, { data: resolved }, { data: audit }] = await Promise.all([
    supabase.from('tasks').select('id, task_code, title, task_date, status, priority, time_spent_minutes, performed_by, task_categories(name)').gte('task_date', r.from).lte('task_date', r.to).order('task_date', { ascending: false }).limit(500),
    supabase.from('tickets').select('id').gte('reported_at', dayStartIso(r.from)).lte('reported_at', dayEndIso(r.to)).limit(1000),
    supabase.from('tickets').select('id, ticket_code, title, resolved_at, time_taken_minutes, assigned_to').gte('resolved_at', dayStartIso(r.from)).lte('resolved_at', dayEndIso(r.to)).order('resolved_at', { ascending: false }).limit(200),
    isAdmin(me.role)
      ? supabase.from('activity_logs').select('id, action, entity_type, created_at').gte('created_at', dayStartIso(r.from)).lte('created_at', dayEndIso(r.to)).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: null as any }),
  ]);

  const t = tasks ?? [];
  const done = t.filter((x: any) => x.status === 'completed').length;
  const pending = t.filter((x: any) => ['pending', 'in_progress', 'on_hold'].includes(x.status)).length;
  const minutes = t.reduce((sum: number, x: any) => sum + (x.time_spent_minutes ?? 0), 0);
  const names = await nameMap(supabase, [...t.map((x: any) => x.performed_by), ...(resolved ?? []).map((x: any) => x.assigned_to)]);

  const link = (p: string, d: string) => `/operations/activity-logs?period=${p}&date=${d}`;
  const tab = (p: string, label: string) => (
    <Link key={p} href={link(p, date)} className={`rounded-md border px-3 py-1.5 text-sm ${period === p ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>{label}</Link>
  );

  return (
    <>
      <PageHeader title="Activity logs" description="What the IT team did: tasks, time spent and tickets resolved." />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {tab('day', 'Daily')}{tab('week', 'Weekly')}{tab('month', 'Monthly')}
        <Link href={link(period, r.prev)} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">Previous</Link>
        <span className="px-1 text-sm font-medium">{r.label}</span>
        <Link href={link(period, r.next)} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">Next</Link>
        <form className="ml-auto flex items-center gap-2">
          <input type="hidden" name="period" value={period} />
          <input type="date" name="date" defaultValue={date} aria-label="Jump to date" className="h-8 rounded-md border bg-card px-2 text-sm" />
          <button className="h-8 rounded-md border bg-card px-3 text-sm hover:bg-muted">Go</button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Tasks performed" value={t.length} />
        <Stat label="Completed" value={done} />
        <Stat label="Pending / in progress" value={pending} />
        <Stat label="Time spent" value={formatMinutes(minutes)} />
        <Stat label="Tickets raised" value={(raised ?? []).length} />
        <Stat label="Tickets resolved" value={(resolved ?? []).length} />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Tasks in this period</CardTitle></CardHeader>
          {!t.length ? <EmptyState title="No tasks recorded for this period" /> : (
            <Table>
              <THead><tr><TH>Task</TH><TH>Date</TH><TH>Category</TH><TH>Performed by</TH><TH>Priority</TH><TH>Time</TH><TH>Status</TH></tr></THead>
              <TBody>
                {t.map((x: any) => (
                  <TR key={x.id}>
                    <TD><Link href={`/operations/tasks/${x.id}`} className="text-primary hover:underline"><span className="font-mono text-xs">{x.task_code}</span> {x.title}</Link></TD>
                    <TD className="whitespace-nowrap">{formatDate(x.task_date)}</TD>
                    <TD>{x.task_categories?.name ?? '-'}</TD>
                    <TD>{names[x.performed_by] ?? '-'}</TD>
                    <TD>{PRIORITY[x.priority as keyof typeof PRIORITY]}</TD>
                    <TD className="whitespace-nowrap">{formatMinutes(x.time_spent_minutes)}</TD>
                    <TD><Badge tone={taskStatusTone(x.status)}>{TASK_STATUS[x.status as keyof typeof TASK_STATUS]}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>Tickets resolved in this period</CardTitle></CardHeader>
          {!(resolved ?? []).length ? <EmptyState title="No tickets resolved in this period" /> : (
            <Table>
              <THead><tr><TH>Ticket</TH><TH>Resolved</TH><TH>Resolved by</TH><TH>Time taken</TH></tr></THead>
              <TBody>
                {(resolved ?? []).map((x: any) => (
                  <TR key={x.id}>
                    <TD><Link href={`/operations/tickets/${x.id}`} className="text-primary hover:underline"><span className="font-mono text-xs">{x.ticket_code}</span> {x.title}</Link></TD>
                    <TD className="whitespace-nowrap">{formatDateTime(x.resolved_at)}</TD>
                    <TD>{names[x.assigned_to] ?? '-'}</TD>
                    <TD>{formatMinutes(x.time_taken_minutes)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        {audit && (
          <Card>
            <CardHeader><CardTitle>System changes (latest 20)</CardTitle></CardHeader>
            {!audit.length ? <EmptyState title="No system changes in this period" /> : (
              <ul className="divide-y text-sm">
                {audit.map((l: any) => (
                  <li key={l.id} className="flex justify-between gap-2 px-5 py-2.5">
                    <span>{l.action.toLowerCase()} {l.entity_type.replace(/_/g, ' ')}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
