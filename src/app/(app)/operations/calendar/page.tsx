import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isItStaff } from '@/lib/permissions';
import { dayEndIso, dayStartIso, OPEN_TICKET_STATUSES, todayYmd } from '@/lib/ops';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/operations/tickets');

  const sp = await searchParams;
  const today = todayYmd();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? (sp.m as string) : today.slice(0, 7);
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const startOffset = (first.getUTCDay() + 6) % 7;
  const fromYmd = `${month}-01`;
  const toYmd = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const supabase = await createClient();
  const [{ data: tasks }, { data: tickets }] = await Promise.all([
    supabase.from('tasks').select('id, task_code, title, task_date, status').gte('task_date', fromYmd).lte('task_date', toYmd).order('start_time', { nullsFirst: false }).limit(1000),
    supabase.from('tickets').select('id, ticket_code, title, due_at, status').in('status', OPEN_TICKET_STATUSES).gte('due_at', dayStartIso(fromYmd)).lte('due_at', dayEndIso(toYmd)).limit(500),
  ]);

  const byDay: Record<string, { kind: 'task' | 'ticket'; id: string; label: string; status: string }[]> = {};
  (tasks ?? []).forEach((t: any) => {
    (byDay[t.task_date] ??= []).push({ kind: 'task', id: t.id, label: `${t.task_code} ${t.title}`, status: t.status });
  });
  (tickets ?? []).forEach((t: any) => {
    const day = new Date(new Date(t.due_at).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    (byDay[day] ??= []).push({ kind: 'ticket', id: t.id, label: `${t.ticket_code} due`, status: t.status });
  });

  const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <>
      <PageHeader title="Calendar" description="Tasks by date, and open tickets by response deadline." />
      <div className="mb-4 flex items-center gap-2">
        <Link href={`/operations/calendar?m=${prev}`} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">Previous</Link>
        <h2 className="min-w-40 text-center font-semibold">{first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
        <Link href={`/operations/calendar?m=${next}`} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">Next</Link>
        <Link href="/operations/calendar" className="ml-2 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">Today</Link>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-lg border bg-card">
          {WEEKDAYS.map((d) => <div key={d} className="border-b bg-muted/60 px-2 py-2 text-xs font-medium text-muted-foreground">{d}</div>)}
          {cells.map((day, i) => {
            const ymd = day ? `${month}-${String(day).padStart(2, '0')}` : '';
            const items = day ? byDay[ymd] ?? [] : [];
            return (
              <div key={i} className={cn('min-h-28 border-b border-r p-1.5 text-xs', !day && 'bg-muted/30', ymd === today && 'bg-primary/5')}>
                {day && <div className={cn('mb-1 font-medium', ymd === today && 'text-primary')}>{day}</div>}
                <ul className="space-y-1">
                  {items.slice(0, 3).map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <Link
                        href={`/operations/${it.kind}s/${it.id}`}
                        className={cn('block truncate rounded px-1.5 py-0.5', it.kind === 'ticket' ? 'bg-destructive/15 text-destructive' : it.status === 'completed' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary')}
                        title={it.label}
                      >{it.label}</Link>
                    </li>
                  ))}
                  {items.length > 3 && <li className="px-1 text-muted-foreground">+{items.length - 3} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Blue: task. Green: completed task. Red: open ticket reaching its response deadline.</p>
    </>
  );
}
