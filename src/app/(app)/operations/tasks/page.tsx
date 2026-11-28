import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { applyTaskFilters, formatMinutes, nameMap, PRIORITY, priorityTone, TASK_STATUS, taskStatusTone, todayYmd } from '@/lib/ops';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { FilterForm } from '@/components/forms/filter-form';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TaskDialog, TaskStatusSelect } from '@/components/operations/task-dialog';

const PAGE_SIZE = 20;
type SP = { q?: string; status?: string; priority?: string; category?: string; by?: string; from?: string; to?: string; page?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/operations/tickets');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  let query = supabase
    .from('tasks')
    .select('id, task_code, title, task_date, status, priority, time_spent_minutes, performed_by, task_categories(name), departments(name)', { count: 'exact' })
    .order('task_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = applyTaskFilters(query, sp);

  const [{ data, count, error }, { data: categories }, { data: departments }, { data: staff }, { data: tickets }] = await Promise.all([
    query,
    supabase.from('task_categories').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').in('role', ['super_admin', 'it_admin', 'it_member']).eq('is_active', true).order('full_name'),
    supabase.from('tickets').select('id, ticket_code, title').in('status', ['open', 'assigned', 'in_progress', 'on_hold']).order('reported_at', { ascending: false }).limit(100),
  ]);

  const names = await nameMap(supabase, (data ?? []).map((t: any) => t.performed_by));
  const lockSelf = me.role === 'it_member';
  const staffOptions = lockSelf ? (staff ?? []).filter((p: any) => p.id === me.id) : staff ?? [];
  const filtered = !!(sp.q || sp.status || sp.priority || sp.category || sp.by || sp.from || sp.to);
  const exportQs = new URLSearchParams(Object.entries({ kind: 'tasks', ...sp }).filter(([k, v]) => v && k !== 'page') as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Daily tasks"
        description={lockSelf ? 'Your assigned and recorded IT work.' : 'All IT work recorded by the team.'}
        actions={
          <>
            <a href={`/operations/export?${exportQs}`} className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Export CSV</a>
            <TaskDialog categories={categories ?? []} departments={departments ?? []} staff={staffOptions} tickets={tickets ?? []} currentUserId={me.id} lockSelf={lockSelf} today={todayYmd()} />
          </>
        }
      />
      <Card>
        <FilterForm className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="Search title or task ID" className="w-full sm:w-56" />
          <Select name="status" defaultValue={sp.status ?? ''} className="w-full sm:w-36">
            <option value="">Any status</option>
            {Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select name="priority" defaultValue={sp.priority ?? ''} className="w-full sm:w-36">
            <option value="">Any priority</option>
            {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select name="category" defaultValue={sp.category ?? ''} className="w-full sm:w-48">
            <option value="">All categories</option>
            {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {isAdmin(me.role) && (
            <Select name="by" defaultValue={sp.by ?? ''} className="w-full sm:w-44">
              <option value="">Anyone</option>
              {staff?.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          )}
          <Input name="from" type="date" defaultValue={sp.from} aria-label="From date" className="w-full sm:w-40" />
          <Input name="to" type="date" defaultValue={sp.to} aria-label="To date" className="w-full sm:w-40" />
          <Button type="submit" variant="outline">Apply filters</Button>
          {filtered && <Link href="/operations/tasks" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </FilterForm>

        {error ? <EmptyState title="Could not load tasks" hint={error.message} /> : !data?.length ? (
          <EmptyState title={filtered ? 'No tasks match these filters' : 'No tasks recorded yet'} hint={filtered ? 'Try different filters.' : 'Use Add task to record the first piece of IT work.'} />
        ) : (
          <Table>
            <THead><tr><TH>Task ID</TH><TH>Title</TH><TH>Date</TH><TH>Category</TH><TH>Performed by</TH><TH>Priority</TH><TH>Time</TH><TH>Status</TH></tr></THead>
            <TBody>
              {data.map((t: any) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs"><Link href={`/operations/tasks/${t.id}`} className="text-primary hover:underline">{t.task_code}</Link></TD>
                  <TD className="max-w-xs"><Link href={`/operations/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>{t.departments?.name && <div className="text-xs text-muted-foreground">{t.departments.name}</div>}</TD>
                  <TD className="whitespace-nowrap">{formatDate(t.task_date)}</TD>
                  <TD>{t.task_categories?.name ?? '-'}</TD>
                  <TD>{names[t.performed_by] ?? '-'}</TD>
                  <TD><Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority as keyof typeof PRIORITY]}</Badge></TD>
                  <TD className="whitespace-nowrap">{formatMinutes(t.time_spent_minutes)}</TD>
                  <TD>
                    {me.role === 'it_member' || isAdmin(me.role)
                      ? <TaskStatusSelect id={t.id} status={t.status} />
                      : <Badge tone={taskStatusTone(t.status)}>{TASK_STATUS[t.status as keyof typeof TASK_STATUS]}</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/operations/tasks" params={{ q: sp.q, status: sp.status, priority: sp.priority, category: sp.category, by: sp.by, from: sp.from, to: sp.to }} />
      </Card>
    </>
  );
}
