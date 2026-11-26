import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { saveBill } from '@/lib/actions/procurement';
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
import { billFields } from '@/components/finance/bill-fields';

const PAGE_SIZE = 20;
type SP = { q?: string; status?: string; vendor?: string; from?: string; to?: string; page?: string };

export default async function BillsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  let q: any = supabase.from('vendor_bills').select('id, bill_code, invoice_number, invoice_date, due_date, grand_total, amount_paid, outstanding, status, vendors(company_name)', { count: 'exact' }).order('invoice_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ' ').trim(); if (t) q = q.or(`invoice_number.ilike.%${t}%,bill_code.ilike.%${t}%`); }
  if (sp.status === 'overdue') q = q.in('status', ['unpaid', 'partially_paid']).lt('due_date', today);
  else if (sp.status === 'pending') q = q.in('status', ['unpaid', 'partially_paid']);
  else if (sp.status) q = q.eq('status', sp.status);
  if (sp.vendor) q = q.eq('vendor_id', sp.vendor);
  if (sp.from) q = q.gte('invoice_date', sp.from);
  if (sp.to) q = q.lte('invoice_date', sp.to);

  const [{ data, count, error }, vendors, pos] = await Promise.all([q, refOptions(supabase, 'vendors', 'company_name', ['status', 'active']), refOptions(supabase, 'purchase_orders', 'po_number')]);
  const filtered = !!(sp.q || sp.status || sp.vendor || sp.from || sp.to);

  return (
    <>
      <PageHeader title="Vendor bills" description="Internal tracking of IT purchase invoices and GST. Not a replacement for statutory accounting or GST filing."
        actions={<FormDialog title="Record vendor bill" triggerLabel="Record bill" onDoneHref="/finance/bills/{id}" action={saveBill} submitLabel="Save bill" fields={billFields(vendors, pos)} />} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="Invoice or bill number" className="w-full sm:w-52" />
          <Select name="status" defaultValue={sp.status ?? ''} className="w-full sm:w-44" aria-label="Status">
            <option value="">Any status</option><option value="pending">All pending</option><option value="overdue">Overdue</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option>
          </Select>
          <Select name="vendor" defaultValue={sp.vendor ?? ''} className="w-full sm:w-52" aria-label="Vendor"><option value="">All vendors</option>{vendors.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Input name="from" type="date" defaultValue={sp.from} aria-label="From date" className="w-full sm:w-40" /><Input name="to" type="date" defaultValue={sp.to} aria-label="To date" className="w-full sm:w-40" />
          <Button type="submit" variant="outline">Apply filters</Button>
          {filtered && <Link href="/finance/bills" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </form>
        {error ? <EmptyState title="Could not load bills" hint={error.message} /> : !data?.length ? <EmptyState title={filtered ? 'No bills match these filters' : 'No bills recorded yet'} /> : (
          <Table>
            <THead><tr><TH>Bill</TH><TH>Invoice</TH><TH>Vendor</TH><TH>Invoice date</TH><TH>Due</TH><TH>Total</TH><TH>Paid</TH><TH>Outstanding</TH><TH>Status</TH></tr></THead>
            <TBody>
              {data.map((b: any) => {
                const overdue = ['unpaid', 'partially_paid'].includes(b.status) && b.due_date && b.due_date < today;
                return (
                  <TR key={b.id}>
                    <TD><Link className="font-mono text-xs text-primary hover:underline" href={`/finance/bills/${b.id}`}>{b.bill_code}</Link></TD>
                    <TD>{b.invoice_number}</TD><TD>{b.vendors?.company_name}</TD><TD className="whitespace-nowrap">{formatDate(b.invoice_date)}</TD><TD className="whitespace-nowrap">{b.due_date ? formatDate(b.due_date) : '-'}</TD>
                    <TD className="tabular-nums">{formatINR(b.grand_total)}</TD><TD className="tabular-nums">{formatINR(b.amount_paid)}</TD><TD className="tabular-nums">{formatINR(b.outstanding)}</TD>
                    <TD className="whitespace-nowrap"><Badge tone={valueTone(b.status)}>{humanize(b.status)}</Badge>{overdue && <Badge tone="danger" className="ml-1">Overdue</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/finance/bills" params={{ q: sp.q, status: sp.status, vendor: sp.vendor, from: sp.from, to: sp.to }} />
      </Card>
    </>
  );
}
