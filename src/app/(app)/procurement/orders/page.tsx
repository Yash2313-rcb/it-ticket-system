import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { savePO } from '@/lib/actions/procurement';
import { EXPENSE_CATEGORIES } from '@/lib/modules/registry';
import { humanize, valueTone } from '@/lib/modules/tones';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';

const PAGE_SIZE = 20;
const PO_STATUSES = ['draft', 'pending_approval', 'approved', 'ordered', 'partially_received', 'received', 'cancelled'];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; vendor?: string; page?: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q: any = supabase.from('purchase_orders').select('id, po_number, po_date, status, total, delivery_date, vendors(company_name), departments(name)', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ' ').trim(); if (t) q = q.ilike('po_number', `%${t}%`); }
  if (sp.status) q = q.eq('status', sp.status);
  if (sp.vendor) q = q.eq('vendor_id', sp.vendor);
  const [{ data, count, error }, vendors, departments] = await Promise.all([q, refOptions(supabase, 'vendors', 'company_name', ['status', 'active']), refOptions(supabase, 'departments', 'name', ['is_active', 'true'])]);

  return (
    <>
      <PageHeader title="Purchase orders" description="Create a draft, add items, submit for approval, then receive goods."
        actions={<FormDialog title="New purchase order" triggerLabel="New purchase order" onDoneHref="/procurement/orders/{id}" action={savePO} submitLabel="Create draft"
          fields={[
            { name: 'vendor_id', label: 'Vendor', type: 'select', options: vendors }, { name: 'department_id', label: 'Department', type: 'select', options: departments },
            { name: 'expense_category', label: 'Expense category (for budgets)', type: 'select', options: EXPENSE_CATEGORIES.map((c): [string, string] => [c, c]) }, { name: 'delivery_date', label: 'Expected delivery', type: 'date' },
            { name: 'discount', label: 'Discount (INR)', type: 'money', default: 0 }, { name: 'tax_rate', label: 'GST rate (%)', type: 'number', default: 18 },
            { name: 'shipping_charges', label: 'Shipping charges (INR)', type: 'money', default: 0 }, { name: 'payment_terms', label: 'Payment terms', type: 'text' }, { name: 'notes', label: 'Notes', type: 'textarea' },
          ]} />} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="PO number" className="w-full sm:w-48" />
          <Select name="status" defaultValue={sp.status ?? ''} className="w-full sm:w-48" aria-label="Status"><option value="">Any status</option>{PO_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
          <Select name="vendor" defaultValue={sp.vendor ?? ''} className="w-full sm:w-56" aria-label="Vendor"><option value="">All vendors</option>{vendors.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Button type="submit" variant="outline">Apply filters</Button>
          {(sp.q || sp.status || sp.vendor) && <Link href="/procurement/orders" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </form>
        {error ? <EmptyState title="Could not load purchase orders" hint={error.message} /> : !data?.length ? <EmptyState title="No purchase orders yet" /> : (
          <Table>
            <THead><tr><TH>PO number</TH><TH>Date</TH><TH>Vendor</TH><TH>Department</TH><TH>Total</TH><TH>Delivery</TH><TH>Status</TH></tr></THead>
            <TBody>
              {data.map((p: any) => (
                <TR key={p.id}>
                  <TD><Link className="font-medium text-primary hover:underline" href={`/procurement/orders/${p.id}`}>{p.po_number}</Link></TD>
                  <TD>{formatDate(p.po_date)}</TD><TD>{p.vendors?.company_name ?? '-'}</TD><TD>{p.departments?.name ?? '-'}</TD>
                  <TD className="tabular-nums">{formatINR(p.total)}</TD><TD>{p.delivery_date ? formatDate(p.delivery_date) : '-'}</TD>
                  <TD><Badge tone={valueTone(p.status)}>{humanize(p.status)}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/procurement/orders" params={{ q: sp.q, status: sp.status, vendor: sp.vendor }} />
      </Card>
    </>
  );
}
