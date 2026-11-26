import Link from 'next/link';
import { Download } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isItStaff } from '@/lib/permissions';
import { applyTicketFilters, isTicketOverdue, nameMap, PRIORITY, priorityTone, TICKET_STATUS, ticketStatusTone } from '@/lib/ops';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { RaiseTicketDialog } from '@/components/operations/ticket-forms';

const PAGE_SIZE = 20;
type SP = { q?: string; status?: string; priority?: string; category?: string; assigned?: string; overdue?: string; from?: string; to?: string; page?: string };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireProfile();
  const staffUser = isItStaff(me.role);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  let query = supabase
    .from('tickets')
    .select('id, ticket_code, title, status, priority, reported_at, due_at, assigned_to, reported_by, ticket_categories(name), employees(full_name), departments(name)', { count: 'exact' })
    .order('reported_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = applyTicketFilters(query, sp, me.id);

  const [{ data, count, error }, { data: categories }, { data: staff }, { data: employees }] = await Promise.all([
    query,
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('sort_order'),
    staffUser
      ? supabase.from('profiles').select('id, full_name').in('role', ['super_admin', 'it_admin', 'it_member']).eq('is_active', true).order('full_name')
      : Promise.resolve({ data: [] as any[] }),
    staffUser
      ? supabase.from('employees').select('id, emp_code, full_name').eq('status', 'active').order('full_name')
      : Promise.resolve({ data: null as any }),
  ]);

  const names = await nameMap(supabase, (data ?? []).flatMap((t: any) => [t.assigned_to, t.reported_by]));
  const filtered = !!(sp.q || sp.status || sp.priority || sp.category || sp.assigned || sp.overdue || sp.from || sp.to);
  const exportQs = new URLSearchParams(Object.entries({ kind: 'tickets', ...sp }).filter(([k, v]) => v && k !== 'page') as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title={staffUser ? 'Helpdesk tickets' : 'My IT tickets'}
        description={staffUser ? 'Employee complaints and IT requests.' : 'Raise a problem or request and track its progress.'}
        actions={
          <>
            {staffUser && <a href={`/operations/export?${exportQs}`} className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Export CSV</a>}
            <RaiseTicketDialog categories={categories ?? []} employees={employees ?? undefined} />
          </>
        }
      />
      {staffUser && (
        <Card className="mb-4">
          <form action="/operations/tickets/report" method="get" className="flex flex-wrap items-center gap-2 p-4" aria-label="Monthly tickets report">
            <span className="text-sm font-medium">Monthly tickets report</span>
            <Input type="month" name="month" defaultValue={new Date().toISOString().slice(0, 7)} aria-label="Month" className="w-44" required />
            <Select name="format" defaultValue="pdf" className="w-32" aria-label="Format">
              <option value="pdf">PDF</option><option value="xlsx">Excel</option><option value="csv">CSV</option>
            </Select>
            <Button type="submit" variant="outline"><Download className="h-4 w-4" /> Download</Button>
          </form>
        </Card>
      )}
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="Search title or ticket ID" className="w-full sm:w-56" />
          <Select name="status" defaultValue={sp.status ?? ''} className="w-full sm:w-40">
            <option value="">Any status</option>
            <option value="active">All open</option>
            {Object.entries(TICKET_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select name="priority" defaultValue={sp.priority ?? ''} className="w-full sm:w-36">
            <option value="">Any priority</option>
            {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select name="category" defaultValue={sp.category ?? ''} className="w-full sm:w-48">
            <option value="">All categories</option>
            {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {staffUser && (
            <Select name="assigned" defaultValue={sp.assigned ?? ''} className="w-full sm:w-44">
              <option value="">Any assignee</option>
              <option value="me">Assigned to me</option>
              <option value="none">Unassigned</option>
              {staff?.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          )}
          <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={sp.overdue === '1'} className="h-4 w-4" /> Overdue only</label>
          <Button type="submit" variant="outline">Apply filters</Button>
          {filtered && <Link href="/operations/tickets" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </form>

        {error ? <EmptyState title="Could not load tickets" hint={error.message} /> : !data?.length ? (
          <EmptyState title={filtered ? 'No tickets match these filters' : 'No tickets yet'} hint={filtered ? 'Try different filters.' : 'Use Raise ticket to report an IT problem.'} />
        ) : (
          <Table>
            <THead><tr><TH>Ticket</TH><TH>Issue</TH><TH>Raised by</TH><TH>Category</TH><TH>Reported</TH><TH>Assigned to</TH><TH>Priority</TH><TH>Status</TH></tr></THead>
            <TBody>
              {data.map((t: any) => {
                const overdue = isTicketOverdue(t);
                return (
                  <TR key={t.id}>
                    <TD className="font-mono text-xs"><Link href={`/operations/tickets/${t.id}`} className="text-primary hover:underline">{t.ticket_code}</Link></TD>
                    <TD className="max-w-xs"><Link href={`/operations/tickets/${t.id}`} className="font-medium hover:underline">{t.title}</Link></TD>
                    <TD>{t.employees?.full_name ?? names[t.reported_by] ?? '-'}{t.departments?.name && <div className="text-xs text-muted-foreground">{t.departments.name}</div>}</TD>
                    <TD>{t.ticket_categories?.name ?? '-'}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(t.reported_at)}</TD>
                    <TD>{names[t.assigned_to] ?? <span className="text-muted-foreground">Unassigned</span>}</TD>
                    <TD><Badge tone={priorityTone(t.priority)}>{PRIORITY[t.priority as keyof typeof PRIORITY]}</Badge></TD>
                    <TD className="whitespace-nowrap"><Badge tone={ticketStatusTone(t.status)}>{TICKET_STATUS[t.status as keyof typeof TICKET_STATUS]}</Badge>{overdue && <Badge tone="danger" className="ml-1">Overdue</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/operations/tickets" params={{ q: sp.q, status: sp.status, priority: sp.priority, category: sp.category, assigned: sp.assigned, overdue: sp.overdue, from: sp.from, to: sp.to }} />
      </Card>
    </>
  );
}
