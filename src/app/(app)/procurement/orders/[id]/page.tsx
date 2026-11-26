import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isSuperAdmin } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { addPOItem, deletePOItem, receiveLine, savePO, setPOStatus } from '@/lib/actions/procurement';
import { EXPENSE_CATEGORIES } from '@/lib/modules/registry';
import { humanize, valueTone } from '@/lib/modules/tones';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';
import { ConfirmButton } from '@/components/forms/confirm-button';
import { AttachmentsCard } from '@/components/operations/side-panels';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{children}</dd></div>
);

export default async function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const { id } = await params;
  const supabase = await createClient();
  const { data: po } = await supabase.from('purchase_orders').select('*, vendors(company_name, gstin), departments(name), purchase_requests!purchase_orders_request_id_fkey(request_code)').eq('id', id).maybeSingle();
  if (!po) notFound();

  const [{ data: items }, { data: receipts }, { data: files }, vendors, departments, invItems, categories] = await Promise.all([
    supabase.from('purchase_order_items').select('*').eq('po_id', id).order('created_at'),
    supabase.from('goods_receipts').select('id, receipt_code, quantity, received_on, invoice_number, notes, purchase_order_items(description)').eq('po_id', id).order('created_at', { ascending: false }),
    supabase.from('attachments').select('id, file_name, file_size, file_path, uploaded_by').eq('entity_type', 'po').eq('entity_id', id),
    refOptions(supabase, 'vendors', 'company_name', ['status', 'active']), refOptions(supabase, 'departments', 'name', ['is_active', 'true']),
    refOptions(supabase, 'inventory_items', 'item_code,name', ['is_active', 'true']), refOptions(supabase, 'asset_categories', 'name', ['is_active', 'true']),
  ]);
  const signed = await Promise.all((files ?? []).map(async (f: any) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(f.file_path, 3600);
    return { ...f, url: data?.signedUrl ?? null };
  }));

  const draft = po.status === 'draft';
  const canReceive = ['approved', 'ordered', 'partially_received'].includes(po.status);
  const st = (status: string, label: string, confirmText?: string, variant: 'primary' | 'outline' | 'destructive' = 'outline') =>
    <ConfirmButton key={status} label={label} variant={variant} size="md" confirmText={confirmText} action={setPOStatus.bind(null, id, status)} />;

  return (
    <>
      <Link href="/procurement/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All purchase orders</Link>
      <PageHeader title={po.po_number} description={`${po.vendors?.company_name ?? 'No vendor selected'}`}
        actions={<div className="flex flex-wrap gap-2">
          {draft && st('pending_approval', 'Submit for approval', 'Submit this order for approval? It cannot be edited afterwards.', 'primary')}
          {po.status === 'pending_approval' && isSuperAdmin(me.role) && st('approved', 'Approve', 'Approve this purchase order?', 'primary')}
          {po.status === 'pending_approval' && st('draft', 'Return to draft')}
          {po.status === 'approved' && st('ordered', 'Mark as ordered', undefined, 'primary')}
          {['draft', 'pending_approval', 'approved', 'ordered'].includes(po.status) && st('cancelled', 'Cancel order', 'Cancel this purchase order?', 'destructive')}
        </div>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Order details</CardTitle>
              <div className="flex items-center gap-2"><Badge tone={valueTone(po.status)}>{humanize(po.status)}</Badge>
                {draft && <FormDialog title="Edit order" triggerLabel="Edit" icon="edit" variant="outline" size="sm" hidden={{ id }} action={savePO} values={po}
                  fields={[{ name: 'vendor_id', label: 'Vendor', type: 'select', options: vendors }, { name: 'department_id', label: 'Department', type: 'select', options: departments },
                    { name: 'expense_category', label: 'Expense category', type: 'select', options: EXPENSE_CATEGORIES.map((c): [string, string] => [c, c]) }, { name: 'delivery_date', label: 'Expected delivery', type: 'date' },
                    { name: 'discount', label: 'Discount (INR)', type: 'money' }, { name: 'tax_rate', label: 'GST rate (%)', type: 'number' }, { name: 'shipping_charges', label: 'Shipping (INR)', type: 'money' },
                    { name: 'payment_terms', label: 'Payment terms', type: 'text' }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />}
              </div>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="PO date">{formatDate(po.po_date)}</Row><Row label="Vendor">{po.vendors?.company_name ?? '-'} {po.vendors?.gstin && <span className="text-xs text-muted-foreground">GSTIN {po.vendors.gstin}</span>}</Row>
                <Row label="Department">{po.departments?.name ?? '-'}</Row><Row label="Expense category">{po.expense_category ?? '-'}</Row>
                <Row label="Expected delivery">{po.delivery_date ? formatDate(po.delivery_date) : '-'}</Row><Row label="Payment terms">{po.payment_terms ?? '-'}</Row>
                {po.purchase_requests && <Row label="From request">{po.purchase_requests.request_code}</Row>}
                {po.notes && <Row label="Notes">{po.notes}</Row>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Items</CardTitle>
              {draft && <FormDialog title="Add item" triggerLabel="Add item" size="sm" action={addPOItem.bind(null, id)}
                fields={[{ name: 'description', label: 'Description', type: 'text', required: true, full: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true, default: 1 }, { name: 'unit_price', label: 'Unit price (INR, before GST)', type: 'money', required: true },
                  { name: 'receive_as', label: 'On receipt', type: 'select', required: true, default: 'none', options: [['none', 'Just record receipt'], ['inventory', 'Add to stock item'], ['asset', 'Register as assets']] },
                  { name: 'inventory_item_id', label: 'Stock item', type: 'select', options: invItems, hint: 'Needed when adding to stock.' }, { name: 'asset_category_id', label: 'Asset category', type: 'select', options: categories, hint: 'Needed when registering assets (one asset per unit).' }]} />}
            </CardHeader>
            {!(items ?? []).length ? <p className="p-5 text-sm text-muted-foreground">No items yet.</p> : (
              <Table>
                <THead><tr><TH>Description</TH><TH>Qty</TH><TH>Received</TH><TH>Unit price</TH><TH>Line total</TH><TH>On receipt</TH><TH /></tr></THead>
                <TBody>
                  {(items ?? []).map((i: any) => (
                    <TR key={i.id}>
                      <TD className="max-w-xs">{i.description}</TD><TD className="tabular-nums">{i.quantity}</TD><TD className="tabular-nums">{i.received_qty}</TD>
                      <TD className="tabular-nums">{formatINR(i.unit_price)}</TD><TD className="tabular-nums">{formatINR(i.line_total)}</TD><TD>{humanize(i.receive_as)}</TD>
                      <TD className="whitespace-nowrap text-right">
                        {canReceive && i.received_qty < i.quantity && <FormDialog title={`Receive: ${i.description.slice(0, 40)}`} triggerLabel="Receive" icon="none" size="sm" variant="outline" action={receiveLine.bind(null, i.id)} submitLabel="Record receipt"
                          intro={i.receive_as === 'inventory' ? 'Stock will be increased automatically.' : i.receive_as === 'asset' ? 'One asset record is created per unit received.' : undefined}
                          fields={[{ name: 'quantity', label: `Quantity received (pending ${i.quantity - i.received_qty})`, type: 'number', required: true, default: i.quantity - i.received_qty }, { name: 'invoice_number', label: 'Vendor invoice number', type: 'text' }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />}
                        {draft && <ConfirmButton label="Remove" variant="ghost" confirmText="Remove this item?" action={deletePOItem.bind(null, i.id)} />}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <CardContent className="border-t">
              <dl className="ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(po.subtotal)}</dd></div>
                <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">- {formatINR(po.discount)}</dd></div>
                <div className="flex justify-between"><dt>GST ({po.tax_rate}%)</dt><dd className="tabular-nums">{formatINR(po.tax_amount)}</dd></div>
                <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{formatINR(po.shipping_charges)}</dd></div>
                <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatINR(po.total)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Goods received</CardTitle></CardHeader>
            {!(receipts ?? []).length ? <p className="p-5 text-sm text-muted-foreground">Nothing received yet.</p> : (
              <Table>
                <THead><tr><TH>Receipt</TH><TH>Date</TH><TH>Item</TH><TH>Qty</TH><TH>Invoice</TH></tr></THead>
                <TBody>{(receipts ?? []).map((r: any) => <TR key={r.id}><TD className="font-mono text-xs">{r.receipt_code}</TD><TD>{formatDate(r.received_on)}</TD><TD>{r.purchase_order_items?.description}</TD><TD>{r.quantity}</TD><TD>{r.invoice_number ?? '-'}</TD></TR>)}</TBody>
              </Table>
            )}
          </Card>
        </div>
        <div><AttachmentsCard kind="po" entityId={id} path={`/procurement/orders/${id}`} title="Vendor invoices and documents" files={signed} canDelete={(by) => isAdmin(me.role) || by === me.id} /></div>
      </div>
    </>
  );
}
