import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { humanize } from '@/lib/modules/tones';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

const PAGE_SIZE = 25;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; page?: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q: any = supabase.from('vendor_payments').select('id, bill_id, payment_date, amount, mode, reference, vendor_bills(bill_code, invoice_number, vendors(company_name))', { count: 'exact' }).order('payment_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.from) q = q.gte('payment_date', sp.from);
  if (sp.to) q = q.lte('payment_date', sp.to);
  const { data, count, error } = await q;
  const total = (data ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  return (
    <>
      <PageHeader title="Payments" description="All vendor payments. Record a payment from the bill it belongs to." />
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Input name="from" type="date" defaultValue={sp.from} aria-label="From date" className="w-full sm:w-40" /><Input name="to" type="date" defaultValue={sp.to} aria-label="To date" className="w-full sm:w-40" />
          <Button type="submit" variant="outline">Apply</Button>{(sp.from || sp.to) && <Link href="/finance/payments" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </form>
        {error ? <EmptyState title="Could not load payments" hint={error.message} /> : !data?.length ? <EmptyState title="No payments recorded" /> : (
          <Table>
            <THead><tr><TH>Date</TH><TH>Vendor</TH><TH>Bill</TH><TH>Invoice</TH><TH>Amount</TH><TH>Mode</TH><TH>Reference</TH></tr></THead>
            <TBody>
              {data.map((p: any) => (
                <TR key={p.id}>
                  <TD>{formatDate(p.payment_date)}</TD><TD>{p.vendor_bills?.vendors?.company_name}</TD>
                  <TD><Link className="font-mono text-xs text-primary hover:underline" href={`/finance/bills/${p.bill_id}`}>{p.vendor_bills?.bill_code}</Link></TD><TD>{p.vendor_bills?.invoice_number}</TD>
                  <TD className="tabular-nums">{formatINR(p.amount)}</TD><TD>{humanize(p.mode)}</TD><TD>{p.reference ?? '-'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="border-t px-4 py-2 text-sm text-muted-foreground">Total on this page: <span className="font-medium text-foreground">{formatINR(total)}</span></div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/finance/payments" params={{ from: sp.from, to: sp.to }} />
      </Card>
    </>
  );
}
