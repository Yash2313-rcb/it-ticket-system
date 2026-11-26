import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { addPayment, cancelBill, saveBill } from '@/lib/actions/procurement';
import { humanize, valueTone } from '@/lib/modules/tones';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';
import { ConfirmButton } from '@/components/forms/confirm-button';
import { AttachmentsCard } from '@/components/operations/side-panels';
import { billFields } from '@/components/finance/bill-fields';

const L = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (<div className={`flex justify-between ${bold ? 'border-t pt-1 font-semibold' : ''}`}><dt>{k}</dt><dd className="tabular-nums">{v}</dd></div>);

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const { id } = await params;
  const supabase = await createClient();
  const { data: b } = await supabase.from('vendor_bills').select('*, vendors(company_name, gstin), purchase_orders(po_number)').eq('id', id).maybeSingle();
  if (!b) notFound();
  const [{ data: payments }, { data: files }, vendors, pos] = await Promise.all([
    supabase.from('vendor_payments').select('id, payment_date, amount, mode, reference, remarks').eq('bill_id', id).order('payment_date', { ascending: false }),
    supabase.from('attachments').select('id, file_name, file_size, file_path, uploaded_by').in('entity_type', ['bill', 'payment']).eq('entity_id', id),
    refOptions(supabase, 'vendors', 'company_name', ['status', 'active']), refOptions(supabase, 'purchase_orders', 'po_number'),
  ]);
  const signed = await Promise.all((files ?? []).map(async (f: any) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(f.file_path, 3600);
    return { ...f, url: data?.signedUrl ?? null };
  }));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = ['unpaid', 'partially_paid'].includes(b.status) && b.due_date && b.due_date < today;
  const open = b.status !== 'cancelled' && Number(b.outstanding) > 0;

  return (
    <>
      <Link href="/finance/bills" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All bills</Link>
      <PageHeader title={`${b.bill_code}: invoice ${b.invoice_number}`} description={b.vendors?.company_name}
        actions={<div className="flex flex-wrap gap-2">
          {open && <FormDialog title="Record payment" triggerLabel="Record payment" action={addPayment.bind(null, id)} submitLabel="Save payment"
            fields={[{ name: 'payment_date', label: 'Payment date', type: 'date', required: true, default: today }, { name: 'amount', label: `Amount (outstanding ${formatINR(b.outstanding)})`, type: 'money', required: true, default: Number(b.outstanding) },
              { name: 'mode', label: 'Payment mode', type: 'select', required: true, default: 'bank_transfer', options: [['cash', 'Cash'], ['cheque', 'Cheque'], ['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['card', 'Card'], ['other', 'Other']] },
              { name: 'reference', label: 'Transaction reference', type: 'text' }, { name: 'remarks', label: 'Remarks', type: 'textarea' }]} />}
          {b.status !== 'cancelled' && Number(b.amount_paid) === 0 && <FormDialog title="Edit bill" triggerLabel="Edit" icon="edit" variant="outline" fields={billFields(vendors, pos)} values={b} hidden={{ id }} action={saveBill} />}
          {b.status !== 'cancelled' && Number(b.amount_paid) === 0 && <ConfirmButton label="Cancel bill" variant="destructive" size="md" confirmText="Cancel this bill?" action={cancelBill.bind(null, id)} />}
        </div>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Bill details</CardTitle><div className="flex gap-2"><Badge tone={valueTone(b.status)}>{humanize(b.status)}</Badge>{overdue && <Badge tone="danger">Overdue</Badge>}</div></CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <dl className="space-y-1 text-sm">
                <div><dt className="text-muted-foreground">Invoice date</dt><dd>{formatDate(b.invoice_date)}</dd></div>
                <div><dt className="text-muted-foreground">Due date</dt><dd>{b.due_date ? formatDate(b.due_date) : '-'}</dd></div>
                <div><dt className="text-muted-foreground">Vendor GSTIN</dt><dd>{b.vendors?.gstin ?? '-'}</dd></div>
                <div><dt className="text-muted-foreground">Purchase order</dt><dd>{b.purchase_orders?.po_number ?? '-'}</dd></div>
                {b.description && <div><dt className="text-muted-foreground">Description</dt><dd>{b.description}</dd></div>}
              </dl>
              <dl className="space-y-1 text-sm">
                <L k="Subtotal" v={formatINR(b.subtotal)} /><L k="Discount" v={`- ${formatINR(b.discount)}`} />
                {b.tax_treatment === 'intra_state' && <><L k={`CGST (${b.gst_rate / 2}%)`} v={formatINR(b.cgst)} /><L k={`SGST (${b.gst_rate / 2}%)`} v={formatINR(b.sgst)} /></>}
                {b.tax_treatment === 'inter_state' && <L k={`IGST (${b.gst_rate}%)`} v={formatINR(b.igst)} />}
                {b.tax_treatment === 'exempt' && <L k="GST" v="Exempt" />}
                <L k="Other charges" v={formatINR(b.other_charges)} /><L k="Grand total" v={formatINR(b.grand_total)} bold />
                <L k="Amount paid" v={formatINR(b.amount_paid)} /><L k="Outstanding" v={formatINR(b.outstanding)} bold />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payments ({(payments ?? []).length})</CardTitle></CardHeader>
            {!(payments ?? []).length ? <p className="p-5 text-sm text-muted-foreground">No payments recorded.</p> : (
              <Table>
                <THead><tr><TH>Date</TH><TH>Amount</TH><TH>Mode</TH><TH>Reference</TH><TH>Remarks</TH></tr></THead>
                <TBody>{(payments ?? []).map((p: any) => <TR key={p.id}><TD>{formatDate(p.payment_date)}</TD><TD className="tabular-nums">{formatINR(p.amount)}</TD><TD>{humanize(p.mode)}</TD><TD>{p.reference ?? '-'}</TD><TD>{p.remarks ?? '-'}</TD></TR>)}</TBody>
              </Table>
            )}
          </Card>
        </div>
        <div><AttachmentsCard kind="bill" entityId={id} path={`/finance/bills/${id}`} title="Invoice and payment proofs" files={signed} canDelete={(by) => isAdmin(me.role) || by === me.id} /></div>
      </div>
    </>
  );
}
