import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { safeCount } from '@/lib/queries';
import { resolveRange } from '@/lib/date-range';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { OPEN_TICKET_STATUSES, TASK_STATUS } from '@/lib/ops';
import { formatDateTime, formatINR } from '@/lib/utils';
import { currentFinancialYear } from '@/lib/modules/registry';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DeptChart } from '@/components/dashboard/dept-chart';
import { SimpleBar } from '@/components/dashboard/bar-chart';

const RANGES = [
  ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'],
] as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function lastMonths(n: number) {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: `${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` });
  }
  return out;
}
const rows = async (p: PromiseLike<{ data: any; error: any }>) => { const r = await p; return r.error ? null : (r.data as any[]); };

function Stat({ label, value, pending, href, tone, money, suffix }: { label: string; value: number | null; pending?: string; href?: string; tone?: 'danger'; money?: boolean; suffix?: string }) {
  const body = (
    <Card className="p-4 transition-colors hover:bg-muted/40">
      <div className="text-sm text-muted-foreground">{label}</div>
      {value === null ? (
        <div className="mt-1 text-sm text-muted-foreground">{pending ?? 'Available in a later phase'}</div>
      ) : (
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'danger' && value > 0 ? 'text-destructive' : ''}`}>{money ? formatINR(value) : value.toLocaleString('en-IN')}{suffix}</div>
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
  const fromDay = fromIso.slice(0, 10);
  const toDay = toIso.slice(0, 10);
  const nowIso = new Date().toISOString();

  const [employees, activeEmployees, departments, users, joined, events] = await Promise.all([
    staff ? safeCount(supabase, 'employees') : Promise.resolve(null),
    staff ? safeCount(supabase, 'employees', (q) => q.eq('status', 'active')) : Promise.resolve(null),
    safeCount(supabase, 'departments', (q) => q.eq('is_active', true)),
    admin ? safeCount(supabase, 'profiles', (q) => q.eq('is_active', true)) : Promise.resolve(null),
    staff ? safeCount(supabase, 'employees', (q) => q.gte('joining_date', fromDay).lte('joining_date', toDay)) : Promise.resolve(null),
    admin ? safeCount(supabase, 'activity_logs', (q) => q.gte('created_at', fromIso).lte('created_at', toIso)) : Promise.resolve(null),
  ]);

  // Phases 3-5: assets, inventory, finance, maintenance (null = module data unavailable)
  const todayStr = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const fyStart = `${currentFinancialYear().slice(0, 4)}-04-01`;
  const months12 = lastMonths(12);
  const months6 = lastMonths(6);
  const [assetRows, stockRows, issuedRows, poRows, expenseRows, billRows, budgetRows, upcomingMaint, expiringAmc, outRows] = await Promise.all([
    staff ? rows(supabase.from('assets').select('status, warranty_end, departments(name)').limit(20000)) : Promise.resolve(null),
    staff ? rows(supabase.from('inventory_items').select('available_qty, min_stock').eq('is_active', true).limit(20000)) : Promise.resolve(null),
    staff ? rows(supabase.from('inventory_transactions').select('quantity, txn_date').eq('txn_type', 'stock_out').gte('txn_date', `${months6[0].key}-01`).limit(20000)) : Promise.resolve(null),
    admin ? rows(supabase.from('purchase_orders').select('po_date, total, status').in('status', ['approved', 'ordered', 'partially_received', 'received']).gte('po_date', `${months12[0].key}-01`).limit(20000)) : Promise.resolve(null),
    admin ? rows(supabase.from('expenses').select('expense_date, amount, gst_amount').gte('expense_date', `${months12[0].key}-01`).limit(20000)) : Promise.resolve(null),
    admin ? rows(supabase.from('vendor_bills').select('status, outstanding, invoice_date').neq('status', 'cancelled').limit(20000)) : Promise.resolve(null),
    admin ? rows(supabase.from('budgets').select('category, department_id, allocated_amount').eq('financial_year', currentFinancialYear()).is('month', null)) : Promise.resolve(null),
    staff ? safeCount(supabase, 'maintenance_schedules', (q) => q.eq('status', 'scheduled').gte('scheduled_date', todayStr).lte('scheduled_date', in30)) : Promise.resolve(null),
    staff ? safeCount(supabase, 'amc_contracts', (q) => q.in('renewal_status', ['active', 'renewal_due']).gte('end_date', todayStr).lte('end_date', in30)) : Promise.resolve(null),
    Promise.resolve(null),
  ]);
  void outRows;
  const countStatus = (list: string[]) => (assetRows ? assetRows.filter((a) => list.includes(a.status)).length : null);
  const assetTotal = assetRows ? assetRows.length : null;
  const expiredWarranties = assetRows ? assetRows.filter((a) => a.warranty_end && a.warranty_end < todayStr && !['disposed', 'retired', 'lost'].includes(a.status)).length : null;
  const lowStock = stockRows ? stockRows.filter((i) => Number(i.min_stock) > 0 && Number(i.available_qty) <= Number(i.min_stock)).length : null;
  const outOfStock = stockRows ? stockRows.filter((i) => Number(i.available_qty) <= 0).length : null;
  const inRangeDay = (d: string) => d >= fromDay && d <= toDay;
  const issuedInRange = issuedRows ? issuedRows.filter((t) => inRangeDay(t.txn_date)).reduce((n, t) => n + Number(t.quantity), 0) : null;
  const purchasesInRange = poRows ? poRows.filter((p) => inRangeDay(p.po_date)).reduce((n, p) => n + Number(p.total), 0) : null;
  const expensesInRange = expenseRows ? expenseRows.filter((e) => inRangeDay(e.expense_date)).reduce((n, e) => n + Number(e.amount) + Number(e.gst_amount), 0) : null;
  const pendingBills = billRows ? billRows.filter((b) => b.status !== 'paid') : null;
  const pendingPayments = pendingBills ? pendingBills.reduce((n, b) => n + Number(b.outstanding), 0) : null;
  const paidBills = billRows ? billRows.filter((b) => b.status === 'paid' && inRangeDay(b.invoice_date)).length : null;
  const budgetTotal = budgetRows ? budgetRows.reduce((n, b) => n + Number(b.allocated_amount), 0) : null;
  const spentFy = expenseRows ? expenseRows.filter((e) => e.expense_date >= fyStart).reduce((n, e) => n + Number(e.amount) + Number(e.gst_amount), 0) : null;
  const budgetUse = budgetTotal && budgetTotal > 0 && spentFy !== null ? Math.round((spentFy / budgetTotal) * 100) : null;
  const sumMonth = (list: any[] | null, dateKey: string, valueFn: (r: any) => number, months: { key: string; label: string }[]) =>
    list ? months.map((m) => ({ name: m.label, value: Math.round(list.filter((r) => String(r[dateKey]).slice(0, 7) === m.key).reduce((n, r) => n + valueFn(r), 0)) })) : [];
  const expenseChart = sumMonth(expenseRows, 'expense_date', (e) => Number(e.amount) + Number(e.gst_amount), months12);
  const purchaseChart = sumMonth(poRows, 'po_date', (p) => Number(p.total), months6);
  const consumptionChart = sumMonth(issuedRows, 'txn_date', (t) => Number(t.quantity), months6);
  const byDept = new Map<string, number>();
  (assetRows ?? []).filter((a) => a.status !== 'disposed').forEach((a) => byDept.set(a.departments?.name ?? 'Unassigned', (byDept.get(a.departments?.name ?? 'Unassigned') ?? 0) + 1));
  const deptAssetChart = [...byDept.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);
  const lifecycle = new Map<string, number>();
  (assetRows ?? []).forEach((a) => lifecycle.set(a.status, (lifecycle.get(a.status) ?? 0) + 1));
  const lifecycleChart = [...lifecycle.entries()].map(([k, value]) => ({ name: k.replace(/_/g, ' '), value }));

  // Phase 2: operations (task counts follow the date filter; open and overdue tickets are current state)
  const inRange = (q: any) => q.gte('task_date', fromDay).lte('task_date', toDay);
  const [tasksTotal, tasksDone, tasksPending, tasksProgress, ticketsOpen, ticketsResolved, ticketsOverdue] = await Promise.all([
    staff ? safeCount(supabase, 'tasks', inRange) : Promise.resolve(null),
    staff ? safeCount(supabase, 'tasks', (q) => inRange(q).eq('status', 'completed')) : Promise.resolve(null),
    staff ? safeCount(supabase, 'tasks', (q) => inRange(q).eq('status', 'pending')) : Promise.resolve(null),
    staff ? safeCount(supabase, 'tasks', (q) => inRange(q).eq('status', 'in_progress')) : Promise.resolve(null),
    safeCount(supabase, 'tickets', (q) => q.in('status', OPEN_TICKET_STATUSES)),
    safeCount(supabase, 'tickets', (q) => q.in('status', ['resolved', 'closed']).gte('resolved_at', fromIso).lte('resolved_at', toIso)),
    safeCount(supabase, 'tickets', (q) => q.in('status', OPEN_TICKET_STATUSES).lt('due_at', nowIso)),
  ]);

  const [{ data: perDept }, { data: taskRows }, { data: ticketRows }] = await Promise.all([
    staff ? supabase.from('employees').select('departments(name)').eq('status', 'active') : Promise.resolve({ data: [] as any[] }),
    staff ? supabase.from('tasks').select('status').gte('task_date', fromDay).lte('task_date', toDay).limit(5000) : Promise.resolve({ data: [] as any[] }),
    supabase.from('tickets').select('ticket_categories(name)').gte('reported_at', fromIso).lte('reported_at', toIso).limit(5000),
  ]);

  const counts = new Map<string, number>();
  (perDept ?? []).forEach((r: any) => {
    const name = r.departments?.name ?? 'Unassigned';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  const deptData = [...counts.entries()].map(([name, n]) => ({ name, employees: n })).sort((a, b) => b.employees - a.employees);

  const statusCounts = new Map<string, number>();
  (taskRows ?? []).forEach((r: any) => statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1));
  const taskChart = Object.entries(TASK_STATUS).map(([k, label]) => ({ name: label, value: statusCounts.get(k) ?? 0 }));

  const catCounts = new Map<string, number>();
  (ticketRows ?? []).forEach((r: any) => {
    const name = r.ticket_categories?.name ?? 'Uncategorised';
    catCounts.set(name, (catCounts.get(name) ?? 0) + 1);
  });
  const ticketChart = [...catCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const { data: recent } = admin
    ? await supabase.from('activity_logs').select('id, action, entity_type, created_at').order('created_at', { ascending: false }).limit(8)
    : { data: null };

  return (
    <>
      <PageHeader title="Dashboard" description={`Showing: ${range.label}`} />

      <form className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Date range">
        {RANGES.map(([k, label]) => (
          <Link key={k} href={`/dashboard?range=${k}`} className={`rounded-md border px-3 py-1.5 ${range.key === k ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>{label}</Link>
        ))}
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={sp.from} className="h-8 rounded-md border bg-card px-2" aria-label="From date" required />
        <span className="text-muted-foreground">to</span>
        <input type="date" name="to" defaultValue={sp.to} className="h-8 rounded-md border bg-card px-2" aria-label="To date" required />
        <button className={`rounded-md border px-3 py-1.5 ${range.key === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>Custom range</button>
      </form>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold">IT operations</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {staff && <Stat label="Total tasks" value={tasksTotal} href="/operations/tasks" />}
          {staff && <Stat label="Completed tasks" value={tasksDone} href="/operations/tasks?status=completed" />}
          {staff && <Stat label="Pending tasks" value={tasksPending} href="/operations/tasks?status=pending" />}
          {staff && <Stat label="In progress tasks" value={tasksProgress} href="/operations/tasks?status=in_progress" />}
          <Stat label="Open tickets" value={ticketsOpen} href="/operations/tickets?status=active" />
          <Stat label="Resolved tickets" value={ticketsResolved} href="/operations/tickets?status=resolved" />
          <Stat label="Overdue tickets" value={ticketsOverdue} href="/operations/tickets?overdue=1" tone="danger" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Task and resolved-ticket counts follow the date filter. Open and overdue tickets show the current position.</p>
      </section>

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Organization</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Total employees" value={employees} href="/organization/employees" />
            <Stat label="Active employees" value={activeEmployees} />
            <Stat label="Active departments" value={departments} href="/organization/departments" />
            <Stat label={`Joined (${range.label.toLowerCase()})`} value={joined} />
            {admin && <Stat label="Active user accounts" value={users} href="/organization/users" />}
          </div>
        </section>
      )}

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Assets</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Total IT assets" value={assetTotal} href="/assets" pending="Run migration 0003" />
            <Stat label="In use / assigned" value={countStatus(['assigned', 'in_use'])} href="/assets?status=assigned" />
            <Stat label="Available" value={countStatus(['available'])} href="/assets?status=available" />
            <Stat label="Under maintenance" value={countStatus(['under_maintenance'])} href="/assets?status=under_maintenance" />
            <Stat label="Damaged" value={countStatus(['damaged'])} href="/assets?status=damaged" />
            <Stat label="Disposed" value={countStatus(['disposed'])} href="/assets/disposal" />
          </div>
        </section>
      )}

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Inventory</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Stock items" value={stockRows ? stockRows.length : null} href="/inventory" pending="Run migration 0003" />
            <Stat label="Low stock items" value={lowStock} href="/inventory/low-stock" tone="danger" />
            <Stat label="Out of stock" value={outOfStock} href="/inventory/low-stock" tone="danger" />
            <Stat label={`Stock issued (${range.label.toLowerCase()})`} value={issuedInRange} href="/inventory/stock-out" />
          </div>
        </section>
      )}

      {admin && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Finance</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label={`IT purchases (${range.label.toLowerCase()})`} value={purchasesInRange} money href="/procurement/orders" pending="Run migration 0004" />
            <Stat label={`IT expenses (${range.label.toLowerCase()})`} value={expensesInRange} money href="/finance/expenses" />
            <Stat label="Pending vendor payments" value={pendingPayments} money href="/finance/bills?status=pending" />
            <Stat label="Unpaid bills" value={pendingBills ? pendingBills.length : null} href="/finance/bills?status=pending" />
            <Stat label={`Paid bills (${range.label.toLowerCase()})`} value={paidBills} href="/finance/bills?status=paid" />
            <Stat label="Budget used (this FY)" value={budgetUse} suffix="%" href="/finance/budgets" pending="No budget set" tone={budgetUse !== null && budgetUse > 100 ? 'danger' : undefined} />
          </div>
        </section>
      )}

      {staff && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Maintenance</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Maintenance due in 30 days" value={upcomingMaint} href="/maintenance/schedule" pending="Run migration 0005" />
            <Stat label="Expired warranties" value={expiredWarranties} href="/maintenance/warranty?view=expired" tone="danger" />
            <Stat label="AMC contracts expiring (30 days)" value={expiringAmc} href="/maintenance/amc" />
            <Stat label="Pending repairs (damaged / in repair)" value={assetRows ? assetRows.filter((a) => ['damaged', 'under_maintenance'].includes(a.status)).length : null} href="/assets?status=damaged" />
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
              {deptData.length ? <DeptChart data={deptData} /> : <EmptyState title="No employee data yet" hint="Add departments and employees under Organization to see this chart." />}
            </CardContent>
          </Card>
        )}
        {staff && assetRows && (
          <Card>
            <CardHeader><CardTitle>Department-wise IT assets</CardTitle></CardHeader>
            <CardContent>{deptAssetChart.length ? <SimpleBar data={deptAssetChart} label="Assets" /> : <EmptyState title="No assets yet" />}</CardContent>
          </Card>
        )}
        {staff && assetRows && (
          <Card>
            <CardHeader><CardTitle>Asset lifecycle distribution</CardTitle></CardHeader>
            <CardContent>{lifecycleChart.length ? <SimpleBar data={lifecycleChart} label="Assets" /> : <EmptyState title="No assets yet" />}</CardContent>
          </Card>
        )}
        {admin && expenseRows && (
          <Card>
            <CardHeader><CardTitle>Monthly IT expenses (INR, last 12 months)</CardTitle></CardHeader>
            <CardContent>{expenseChart.some((d) => d.value > 0) ? <SimpleBar data={expenseChart} label="INR" /> : <EmptyState title="No expenses recorded" />}</CardContent>
          </Card>
        )}
        {admin && poRows && (
          <Card>
            <CardHeader><CardTitle>Purchase trends (INR, last 6 months)</CardTitle></CardHeader>
            <CardContent>{purchaseChart.some((d) => d.value > 0) ? <SimpleBar data={purchaseChart} label="INR" /> : <EmptyState title="No approved purchases yet" />}</CardContent>
          </Card>
        )}
        {staff && issuedRows && (
          <Card>
            <CardHeader><CardTitle>Inventory consumption (units issued, last 6 months)</CardTitle></CardHeader>
            <CardContent>{consumptionChart.some((d) => d.value > 0) ? <SimpleBar data={consumptionChart} label="Units" /> : <EmptyState title="No stock issued yet" />}</CardContent>
          </Card>
        )}
        {admin && (
          <Card>
            <CardHeader><CardTitle>Recent changes</CardTitle><span className="text-xs text-muted-foreground">{events ?? 0} in range</span></CardHeader>
            {!recent?.length ? <EmptyState title="Nothing recorded yet" /> : (
              <ul className="divide-y text-sm">
                {recent.map((l: any) => (
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
