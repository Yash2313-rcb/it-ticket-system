import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

export default async function GoodsReceivedPage() {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const supabase = await createClient();
  const { data, error } = await supabase.from('goods_receipts').select('id, receipt_code, po_id, quantity, received_on, invoice_number, notes, purchase_orders(po_number, vendors(company_name)), purchase_order_items(description, receive_as)').order('created_at', { ascending: false }).limit(300);
  return (
    <>
      <PageHeader title="Goods received" description="Receipts are recorded on the purchase order. Receiving updates stock or registers new assets automatically." />
      <Card>
        {error ? <EmptyState title="Could not load receipts" hint={error.message} /> : !data?.length ? <EmptyState title="No goods received yet" hint="Open an approved or ordered purchase order and use Receive on an item." /> : (
          <Table>
            <THead><tr><TH>Receipt</TH><TH>Date</TH><TH>Purchase order</TH><TH>Vendor</TH><TH>Item</TH><TH>Qty</TH><TH>Invoice</TH></tr></THead>
            <TBody>
              {data.map((r: any) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.receipt_code}</TD><TD>{formatDate(r.received_on)}</TD>
                  <TD><Link className="text-primary hover:underline" href={`/procurement/orders/${r.po_id}`}>{r.purchase_orders?.po_number}</Link></TD>
                  <TD>{r.purchase_orders?.vendors?.company_name ?? '-'}</TD><TD>{r.purchase_order_items?.description}</TD><TD className="tabular-nums">{r.quantity}</TD><TD>{r.invoice_number ?? '-'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
