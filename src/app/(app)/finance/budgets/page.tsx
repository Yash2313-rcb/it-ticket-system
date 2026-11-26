import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { moduleFormFields } from '@/lib/module-fields';
import { saveRecord } from '@/lib/actions/modules';
import { currentFinancialYear, financialYearOptions } from '@/lib/modules/registry';
import { formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const sp = await searchParams;
  const fyOptions = financialYearOptions();
  const fy = fyOptions.some(([v]) => v === sp.fy) ? (sp.fy as string) : currentFinancialYear();
  const startYear = Number(fy.slice(0, 4));
  const from = `${startYear}-04-01`;
  const to = `${startYear + 1}-03-31`;

  const supabase = await createClient();
  const [{ data: budgets, error }, { data: expenses }, { data: orders }, createFields, editFields] = await Promise.all([
    supabase.from('budgets').select('*, departments(name)').eq('financial_year', fy).order('category'),
    supabase.from('expenses').select('category, department_id, expense_date, amount, gst_amount').gte('expense_date', from).lte('expense_date', to).limit(20000),
    supabase.from('purchase_orders').select('expense_category, department_id, total').in('status', ['approved', 'ordered', 'partially_received']).gte('po_date', from).lte('po_date', to).limit(5000),
    moduleFormFields(supabase, 'budgets', me.role, 'create'), moduleFormFields(supabase, 'budgets', me.role, 'edit'),
  ]);

  const rows = (budgets ?? []).map((b: any) => {
    const matches = (e: any) => e.category === b.category && (!b.department_id || e.department_id === b.department_id);
    const actual = (expenses ?? []).filter((e: any) => matches(e) && (!b.month || new Date(e.expense_date).getMonth() + 1 === b.month)).reduce((s: number, e: any) => s + Number(e.amount) + Number(e.gst_amount), 0);
    const committed = b.month ? 0 : (orders ?? []).filter((o: any) => o.expense_category === b.category && (!b.department_id || o.department_id === b.department_id)).reduce((s: number, o: any) => s + Number(o.total), 0);
    const allocated = Number(b.allocated_amount);
    return { ...b, actual, committed, remaining: allocated - actual, pct: allocated > 0 ? (actual / allocated) * 100 : 0, over: actual > allocated, risk: actual + committed > allocated };
  });
  const totals = rows.filter((r: any) => !r.month).reduce((t: any, r: any) => ({ a: t.a + Number(r.allocated_amount), s: t.s + r.actual }), { a: 0, s: 0 });

  return (
    <>
      <PageHeader title="Budget management" description="Allocated budget against actual expenses (including GST). Pending commitments are approved purchase orders not yet billed as expenses."
        actions={<FormDialog title="Add budget" triggerLabel="Add budget" fields={createFields.map((f: any) => f.name === 'financial_year' ? { ...f, default: fy } : f)} action={saveRecord.bind(null, 'budgets')} />} />
      <form className="mb-4 flex items-center gap-2" aria-label="Financial year">
        <Select name="fy" defaultValue={fy} className="w-44">{fyOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Button type="submit" variant="outline">Show</Button>
        <span className="ml-auto text-sm text-muted-foreground">Annual budgets total {formatINR(totals.a)}, spent {formatINR(totals.s)}{totals.a > 0 ? ` (${((totals.s / totals.a) * 100).toFixed(0)}%)` : ''}</span>
      </form>
      <Card>
        {error ? <EmptyState title="Could not load budgets" hint={error.message} /> : !rows.length ? <EmptyState title={`No budgets for FY ${fy}`} hint="Add a budget per category (and department, if you want to split it)." /> : (
          <Table>
            <THead><tr><TH>Category</TH><TH>Department</TH><TH>Period</TH><TH>Allocated</TH><TH>Actual</TH><TH>Remaining</TH><TH>Commitments</TH><TH>Utilised</TH><TH /></tr></THead>
            <TBody>
              {rows.map((r: any) => (
                <TR key={r.id}>
                  <TD>{r.category}</TD><TD>{r.departments?.name ?? 'All'}</TD><TD>{r.month ? MONTHS[r.month - 1] : 'Annual'}</TD>
                  <TD className="tabular-nums">{formatINR(r.allocated_amount)}</TD><TD className="tabular-nums">{formatINR(r.actual)}</TD>
                  <TD className={`tabular-nums ${r.remaining < 0 ? 'text-destructive' : ''}`}>{formatINR(r.remaining)}</TD><TD className="tabular-nums">{r.month ? '-' : formatINR(r.committed)}</TD>
                  <TD className="whitespace-nowrap"><Badge tone={r.over ? 'danger' : r.risk || r.pct >= 80 ? 'warning' : 'success'}>{r.pct.toFixed(0)}%</Badge>{r.over && <span className="ml-1 text-xs text-destructive">Overspent</span>}{!r.over && r.risk && <span className="ml-1 text-xs text-warning">With commitments</span>}</TD>
                  <TD className="text-right"><FormDialog title="Edit budget" triggerLabel="Edit" icon="edit" variant="ghost" size="sm" fields={editFields} values={r} hidden={{ id: r.id }} action={saveRecord.bind(null, 'budgets')} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
