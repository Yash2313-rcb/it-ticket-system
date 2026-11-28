import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveRange } from '@/lib/date-range';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { TASK_STATUS } from '@/lib/ops';
import { formatDateTime, formatINR } from '@/lib/utils';
import { currentFinancialYear } from '@/lib/modules/registry';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { FilterForm } from '@/components/forms/filter-form';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DeptChart } from '@/components/dashboard/dept-chart';
import { SimpleBar } from '@/components/dashboard/bar-chart';

const RANGES = [
  ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'],
] as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
const series = (list: { key: string; value: number }[] | undefined) => (list ?? []).map((m) => ({ name: monthLabel(m.key), value: Number(m.value) }));
const num = (v: unknown) => (v === undefined || v === null ? null : Number(v));

function Stat({ label, value, pending, href, tone, money, suffix }: { label: string; value: number | null; pending?: string; href?: string; tone?: 'danger'; money?: boolean; suffix?: string }) {
  const danger = tone === 'danger' && value !== null && value > 0;
  const body = (
    <Card className={`relative overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${danger ? 'border-destructive/40' : ''}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${danger ? 'bg-destructive' : 'bg-primary/60'}`} aria-hidden="true" />
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {value === null ? (
        <div className="mt-1.5 text-sm text-muted-foreground">{pending ?? 'Not available'}</div>
      ) : (
        <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${danger ? 'text-destructive' : ''}`}>{money ? formatINR(value) : value.toLocaleString('en-IN')}{suffix}</div>
      )}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const supabase = await createClient();
  const admin = isAdmin(profile.role);
  const staff = isItStaff(profile.role);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const fy = currentFinancialYear();

  // One database call returns every number on this page (see supabase/migrations/0007_performance.sql).
  const { data: stats, error } = await supabase.rpc('dashboard_stats', {
    p_from: fromIso, p_to: toIso, p_from_day: fromIso.slice(0, 10), p_to_day: toIso.slice(0, 10),
    p_fy: fy, p_fy_start: `${fy.slice(0, 4)}-04-01`,
  });

  if (error || !stats) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card><EmptyState title="The dashboard could not load" hint={/dashboard_stats/.test(error?.message ?? '') ? 'Run supabase/migrations/0007_performance.sql in the Supabase SQL editor, then refresh.' : error?.message} /></Card>
      </>
    );
  }

  const t = stats.tasks, tk = stats.tickets, em = stats.employees, a = stats.assets, inv = stats.inventory, f = stats.finance, mt = stats.maintenance;
  const aStatus = (list: string[]) => (a ? list.reduce((n, k) => n + Number(a.by_status?.[k] ?? 0), 0) : null);
  const budgetUse = f && Number(f.budget_total) > 0 ? Math.round((Number(f.spent_fy) / Number(f.budget_total)) * 100) : null;
  const lc = a ? Object.entries(a.by_status as Record<string, number>).map(([k, value]) => ({ name: k.replace(/_/g, ' '), value: Number(value) })) : [];
  const taskChart = Object.entries(TASK_STATUS).map(([k, label]) => ({ name: label, value: Number(t?.by_status?.[k] ?? 0) }));
  const ticketChart = ((tk?.by_category ?? []) as { name: string; value: number }[]).map((c) => ({ name: c.name, value: Number(c.value) }));
  const deptData = ((em?.by_dept ?? []) as { name: string; employees: number }[]).map((d) => ({ name: d.name, employees: Number(d.employees) }));
  const recent = (stats.recent ?? []) as { id: number; action: string; entity_type: string; created_at: string }[];
  const lower = range.label.toLowerCase();

  return (
    <>
      <PageHeader title="Dashboard" description={`Showing: ${range.label}`} />

      <FilterForm className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Date range">
        {RANGES.map(([k, label]) => (
          <Link key={k} href={`/dashboard?range=${k}`} className={`rounded-full border px-3.5 py-1.5 transition-colors ${range.key === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>{label}</Link>
        ))}
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={sp.from} className="h-8 rounded-md border bg-card px-2" aria-label="From date" required />
        <span className="text-muted-foreground">to</span>
        <input type="date" name="to" defaultValue={sp.to} className="h-8 rounded-md border bg-card px-2" aria-label="To date" required />
        <button className={`rounded-full border px-3.5 py-1.5 ${range.key === 'custom' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>Custom range</button>
      </FilterForm>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold">IT operations</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {staff && <Stat label="Total tasks" value={num(t?.total)} href="/operations/tasks" />}
          {staff && <Stat label="Completed tasks" value={num(t?.completed)} href="/operations/tasks?status=completed" />}
          {staff && <Stat label="Pending tasks" value={num(t?.pending)} href="/operations/tasks?status=pending" />}
          {staff && <Stat label="In progress tasks" value={num(t?.in_progress)} href="/operations/tasks?status=in_progress" />}
          <Stat label="Open tickets" value={num(tk?.open)} href="/operations/tickets?status=active" />
          <Stat label="Resolved tickets" value={num(tk?.resolved)} href="/operations/tickets?status=resolved" />
          <Stat label="Overdue tickets" value={num(tk?.overdue)} href="/operations/tickets?overdue=1" tone="danger" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Task and resolved-ticket counts follow the date filter. Open and overdue tickets show the current position.</p>
      </section>

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Organization</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Total employees" value={num(em?.total)} href="/organization/employees" />
            <Stat label="Active employees" value={num(em?.active)} />
            <Stat label="Active departments" value={num(stats.departments)} href="/organization/departments" />
            <Stat label={`Joined (${lower})`} value={num(em?.joined)} />
            {admin && <Stat label="Active user accounts" value={num(stats.users)} href="/organization/users" />}
          </div>
        </section>
      )}

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Assets</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Total IT assets" value={num(a?.total)} href="/assets" />
            <Stat label="In use / assigned" value={aStatus(['assigned', 'in_use'])} href="/assets?status=assigned" />
            <Stat label="Available" value={aStatus(['available'])} href="/assets?status=available" />
            <Stat label="Under maintenance" value={aStatus(['under_maintenance'])} href="/assets?status=under_maintenance" />
            <Stat label="Damaged" value={aStatus(['damaged'])} href="/assets?status=damaged" />
            <Stat label="Disposed" value={aStatus(['disposed'])} href="/assets/disposal" />
          </div>
        </section>
      )}

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Inventory</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Stock items" value={num(inv?.items)} href="/inventory" />
            <Stat label="Low stock items" value={num(inv?.low)} href="/inventory/low-stock" tone="danger" />
            <Stat label="Out of stock" value={num(inv?.out)} href="/inventory/low-stock" tone="danger" />
            <Stat label={`Stock issued (${lower})`} value={num(inv?.issued)} href="/inventory/stock-out" />
          </div>
        </section>
      )}

      {admin && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Finance</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label={`IT purchases (${lower})`} value={num(f?.purchases)} money href="/procurement/orders" />
            <Stat label={`IT expenses (${lower})`} value={num(f?.expenses)} money href="/finance/expenses" />
            <Stat label="Pending vendor payments" value={num(f?.pending_total)} money href="/finance/bills?status=pending" />
            <Stat label="Unpaid bills" value={num(f?.unpaid_count)} href="/finance/bills?status=pending" />
            <Stat label={`Paid bills (${lower})`} value={num(f?.paid_count)} href="/finance/bills?status=paid" />
            <Stat label="Budget used (this FY)" value={budgetUse} suffix="%" href="/finance/budgets" pending="No budget set" tone={budgetUse !== null && budgetUse > 100 ? 'danger' : undefined} />
          </div>
        </section>
      )}

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Maintenance</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Maintenance due in 30 days" value={num(mt?.upcoming)} href="/maintenance/schedule" />
            <Stat label="Expired warranties" value={num(a?.expired_warranties)} href="/maintenance/warranty?view=expired" tone="danger" />
            <Stat label="AMC contracts expiring (30 days)" value={num(mt?.amc_expiring)} href="/maintenance/amc" />
            <Stat label="Pending repairs (damaged / in repair)" value={aStatus(['damaged', 'under_maintenance'])} href="/assets?status=damaged" />
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {staff && (
          <Card>
            <CardHeader><CardTitle>Task completion statistics</CardTitle></CardHeader>
            <CardContent>
              {taskChart.some((d) => d.value > 0) ? <SimpleBar data={taskChart} label="Tasks" /> : <EmptyState title="No tasks in this period" hint="Record tasks under IT Operations to see this chart." />}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Ticket categories</CardTitle></CardHeader>
          <CardContent>
            {ticketChart.length ? <SimpleBar data={ticketChart} label="Tickets" /> : <EmptyState title="No tickets in this period" />}
          </CardContent>
        </Card>
        {staff && (
          <Card>
            <CardHeader><CardTitle>Active employees by department</CardTitle></CardHeader>
            <CardContent>
              {deptData.length ? <DeptChart data={deptData} /> : <EmptyState title="No employee data yet" hint="Add departments and employees under Organization, or import them from a spreadsheet." />}
            </CardContent>
          </Card>
        )}
        {staff && a && (
          <Card>
            <CardHeader><CardTitle>Department-wise IT assets</CardTitle></CardHeader>
            <CardContent>{(a.by_dept as any[]).length ? <SimpleBar data={(a.by_dept as any[]).map((d) => ({ name: d.name, value: Number(d.value) }))} label="Assets" /> : <EmptyState title="No assets yet" />}</CardContent>
          </Card>
        )}
        {staff && a && (
          <Card>
            <CardHeader><CardTitle>Asset lifecycle distribution</CardTitle></CardHeader>
            <CardContent>{lc.length ? <SimpleBar data={lc} label="Assets" /> : <EmptyState title="No assets yet" />}</CardContent>
          </Card>
        )}
        {admin && f && (
          <Card>
            <CardHeader><CardTitle>Monthly IT expenses (INR, last 12 months)</CardTitle></CardHeader>
            <CardContent>{series(f.expense_months).some((d) => d.value > 0) ? <SimpleBar data={series(f.expense_months)} label="INR" /> : <EmptyState title="No expenses recorded" />}</CardContent>
          </Card>
        )}
        {admin && f && (
          <Card>
            <CardHeader><CardTitle>Purchase trends (INR, last 6 months)</CardTitle></CardHeader>
            <CardContent>{series(f.purchase_months).some((d) => d.value > 0) ? <SimpleBar data={series(f.purchase_months)} label="INR" /> : <EmptyState title="No approved purchases yet" />}</CardContent>
          </Card>
        )}
        {staff && inv && (
          <Card>
            <CardHeader><CardTitle>Inventory consumption (units issued, last 6 months)</CardTitle></CardHeader>
            <CardContent>{series(inv.consumption).some((d) => d.value > 0) ? <SimpleBar data={series(inv.consumption)} label="Units" /> : <EmptyState title="No stock issued yet" />}</CardContent>
          </Card>
        )}
        {admin && (
          <Card>
            <CardHeader><CardTitle>Recent changes</CardTitle><span className="text-xs text-muted-foreground">{num(stats.events) ?? 0} in range</span></CardHeader>
            {!recent.length ? <EmptyState title="Nothing recorded yet" /> : (
              <ul className="divide-y text-sm">
                {recent.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
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
