import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { qrSvg, siteOrigin } from '@/lib/qr';
import { moduleFormFields, refOptions } from '@/lib/module-fields';
import { daysUntil, humanize, valueTone } from '@/lib/modules/tones';
import { formatDate, formatDateTime, formatINR } from '@/lib/utils';
import { saveRecord } from '@/lib/actions/modules';
import { assetOp } from '@/lib/actions/assets';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormDialog } from '@/components/forms/form-dialog';
import { AttachmentsCard } from '@/components/operations/side-panels';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2 break-words">{children}</dd></div>
);

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const { data: a } = await supabase.from('assets').select('*, asset_categories(name), departments(name), employees(id, emp_code, full_name), vendors(company_name)').eq('id', id).maybeSingle();
  if (!a) notFound();

  const staff = isItStaff(me.role);
  const admin = isAdmin(me.role);
  const [assignments, transfers, records, disposal, tickets, tasks, files, qr, employees, departments, editFields] = await Promise.all([
    supabase.from('asset_assignments').select('id, assigned_on, returned_on, return_condition, notes, employees(emp_code, full_name), departments(name)').eq('asset_id', id).order('assigned_on', { ascending: false }),
    staff ? supabase.from('asset_transfers').select('id, transfer_date, reason, from_dept:departments!asset_transfers_from_department_id_fkey(name), to_dept:departments!asset_transfers_to_department_id_fkey(name), from_emp:employees!asset_transfers_from_employee_id_fkey(full_name), to_emp:employees!asset_transfers_to_employee_id_fkey(full_name)').eq('asset_id', id) : Promise.resolve({ data: [] as any[] }),
    staff ? supabase.from('maintenance_records').select('id, maintenance_type, service_date, technician, cost, description').eq('asset_id', id).order('service_date', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    staff ? supabase.from('asset_disposals').select('disposal_date, method, disposal_value, reason').eq('asset_id', id).maybeSingle() : Promise.resolve({ data: null as any }),
    staff ? supabase.from('tickets').select('id, ticket_code, title, status').eq('asset_id', id).limit(20) : Promise.resolve({ data: [] as any[] }),
    staff ? supabase.from('tasks').select('id, task_code, title, status').eq('asset_id', id).limit(20) : Promise.resolve({ data: [] as any[] }),
    supabase.from('attachments').select('id, file_name, file_size, file_path, uploaded_by').eq('entity_type', 'asset').eq('entity_id', id),
    siteOrigin().then((o) => qrSvg(`${o}/assets/${id}`)),
    admin ? refOptions(supabase, 'employees', 'emp_code,full_name', ['status', 'active']) : Promise.resolve([] as [string, string][]),
    admin ? refOptions(supabase, 'departments', 'name', ['is_active', 'true']) : Promise.resolve([] as [string, string][]),
    admin ? moduleFormFields(supabase, 'assets', me.role, 'edit') : Promise.resolve([]),
  ]);

  const signed = await Promise.all((files.data ?? []).map(async (f: any) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(f.file_path, 3600);
    return { ...f, url: data?.signedUrl ?? null };
  }));

  const left = daysUntil(a.warranty_end);
  const warranty = !a.warranty_end ? 'No warranty recorded' : left! < 0 ? `Expired ${formatDate(a.warranty_end)}` : `Active until ${formatDate(a.warranty_end)} (${left} days left)`;
  const open = (assignments.data ?? []).find((x: any) => !x.returned_on);

  // lifecycle timeline
  const events: { date: string; label: string }[] = [];
  if (a.purchase_date) events.push({ date: a.purchase_date, label: `Purchased${a.vendors?.company_name ? ` from ${a.vendors.company_name}` : ''}${a.purchase_price ? ` for ${formatINR(a.purchase_price)}` : ''}` });
  events.push({ date: a.created_at, label: 'Registered in the asset register' });
  (assignments.data ?? []).forEach((x: any) => {
    events.push({ date: x.assigned_on, label: `Allocated to ${x.employees?.full_name ?? 'employee'}` });
    if (x.returned_on) events.push({ date: x.returned_on, label: `Returned by ${x.employees?.full_name ?? 'employee'}${x.return_condition ? ` (${x.return_condition})` : ''}` });
  });
  (transfers.data ?? []).forEach((t: any) => events.push({ date: t.transfer_date, label: `Transferred to ${t.to_emp?.full_name ?? t.to_dept?.name ?? '-'}${t.reason ? `: ${t.reason}` : ''}` }));
  (records.data ?? []).forEach((r: any) => events.push({ date: r.service_date, label: `${r.maintenance_type}${r.cost ? ` (${formatINR(r.cost)})` : ''}` }));
  if (a.warranty_end) events.push({ date: a.warranty_end, label: 'Warranty end date' });
  if (disposal.data) events.push({ date: disposal.data.disposal_date, label: `Disposed: ${humanize(disposal.data.method)}` });
  events.sort((x, y) => x.date.localeCompare(y.date));

  const assignable = a.status === 'available';
  const returnable = !!open;
  const transferable = !['lost', 'retired', 'disposed'].includes(a.status);

  return (
    <>
      <Link href="/assets" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-print"><ArrowLeft className="h-4 w-4" /> All assets</Link>
      <PageHeader
        title={`${a.asset_code}: ${a.name}`}
        actions={admin ? (
          <div className="flex flex-wrap gap-2 no-print">
            {assignable && <FormDialog title="Assign asset" triggerLabel="Assign" icon="none" hidden={{ asset_id: id }} action={assetOp.bind(null, 'assign')} submitLabel="Assign asset"
              fields={[{ name: 'employee_id', label: 'Employee', type: 'select', required: true, options: employees }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />}
            {returnable && <FormDialog title="Record return" triggerLabel="Return" icon="none" variant="outline" hidden={{ asset_id: id }} action={assetOp.bind(null, 'return')} submitLabel="Record return"
              fields={[{ name: 'condition', label: 'Condition on return', type: 'select', required: true, default: a.condition, options: [['new', 'New'], ['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor']] }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />}
            {transferable && <FormDialog title="Transfer asset" triggerLabel="Transfer" icon="none" variant="outline" hidden={{ asset_id: id }} action={assetOp.bind(null, 'transfer')} submitLabel="Transfer"
              fields={[{ name: 'to_department_id', label: 'To department', type: 'select', options: departments }, { name: 'to_employee_id', label: 'To employee', type: 'select', options: employees, hint: 'Choosing an employee also moves the asset into their department.' }, { name: 'reason', label: 'Reason', type: 'textarea' }]} />}
            <FormDialog title="Edit asset" triggerLabel="Edit" icon="edit" variant="outline" fields={editFields} values={a} hidden={{ id }} action={saveRecord.bind(null, 'assets')} />
            {a.status !== 'disposed' && <FormDialog title="Dispose asset" triggerLabel="Dispose" icon="none" variant="outline" hidden={{ asset_id: id }} action={assetOp.bind(null, 'dispose')} submitLabel="Dispose asset"
              intro="Disposal is permanent: the asset keeps its history but can no longer be assigned."
              fields={[{ name: 'method', label: 'Method', type: 'select', required: true, default: 'scrapped', options: [['sold', 'Sold'], ['scrapped', 'Scrapped'], ['donated', 'Donated'], ['returned_to_vendor', 'Returned to vendor'], ['other', 'Other']] }, { name: 'disposal_date', label: 'Disposal date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) }, { name: 'disposal_value', label: 'Value received (INR)', type: 'money', default: 0 }, { name: 'reason', label: 'Reason', type: 'textarea', required: true }]} />}
          </div>
        ) : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle><div className="flex gap-2"><Badge tone={valueTone(a.status)}>{humanize(a.status)}</Badge><Badge tone={valueTone(a.condition)}>{humanize(a.condition)} condition</Badge></div></CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="Category">{a.asset_categories?.name ?? '-'}</Row>
                <Row label="Brand / model">{[a.brand, a.model_number].filter(Boolean).join(' ') || '-'}</Row>
                <Row label="Serial number">{a.serial_number ?? '-'}</Row>
                <Row label="Assigned to">{a.employees ? `${a.employees.full_name} (${a.employees.emp_code})` : '-'}</Row>
                <Row label="Department">{a.departments?.name ?? '-'}</Row>
                <Row label="Location">{a.location ?? '-'}</Row>
                <Row label="Warranty"><Badge tone={a.warranty_end ? (left! < 0 ? 'danger' : left! <= 30 ? 'warning' : 'success') : 'neutral'}>{warranty}</Badge></Row>
                {staff && <Row label="Purchase">{a.purchase_date ? formatDate(a.purchase_date) : '-'}{a.purchase_price ? `, ${formatINR(a.purchase_price)}` : ''}{a.invoice_number ? `, invoice ${a.invoice_number}` : ''}</Row>}
                {staff && <Row label="Vendor">{a.vendors?.company_name ?? '-'}</Row>}
                {a.specifications && <Row label="Specifications"><span className="whitespace-pre-wrap">{a.specifications}</span></Row>}
                {a.amc_details && <Row label="AMC details"><span className="whitespace-pre-wrap">{a.amc_details}</span></Row>}
                {a.remarks && <Row label="Remarks">{a.remarks}</Row>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Allocation history</CardTitle></CardHeader>
            {!(assignments.data ?? []).length ? <p className="p-5 text-sm text-muted-foreground">Never allocated.</p> : (
              <Table>
                <THead><tr><TH>Employee</TH><TH>Department</TH><TH>From</TH><TH>To</TH><TH>Receipts</TH></tr></THead>
                <TBody>
                  {(assignments.data ?? []).map((x: any) => (
                    <TR key={x.id}>
                      <TD>{x.employees?.full_name} <span className="text-xs text-muted-foreground">{x.employees?.emp_code}</span></TD>
                      <TD>{x.departments?.name ?? '-'}</TD><TD>{formatDate(x.assigned_on)}</TD><TD>{x.returned_on ? formatDate(x.returned_on) : <Badge tone="info">Current</Badge>}</TD>
                      <TD className="whitespace-nowrap">{staff && <><Link className="text-primary hover:underline" href={`/assets/receipt/${x.id}`}>Handover</Link>{x.returned_on && <> | <Link className="text-primary hover:underline" href={`/assets/receipt/${x.id}?type=return`}>Return</Link></>}</>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {staff && (
            <Card>
              <CardHeader><CardTitle>Maintenance and repairs</CardTitle></CardHeader>
              {!(records.data ?? []).length ? <p className="p-5 text-sm text-muted-foreground">No maintenance recorded.</p> : (
                <Table>
                  <THead><tr><TH>Date</TH><TH>Work</TH><TH>Technician</TH><TH>Cost</TH><TH>Details</TH></tr></THead>
                  <TBody>{(records.data ?? []).map((r: any) => <TR key={r.id}><TD className="whitespace-nowrap">{formatDate(r.service_date)}</TD><TD>{humanize(r.maintenance_type)}</TD><TD>{r.technician ?? '-'}</TD><TD>{formatINR(r.cost)}</TD><TD>{r.description ?? '-'}</TD></TR>)}</TBody>
                </Table>
              )}
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 border-l pl-4">
                {events.map((e, i) => (<li key={i} className="text-sm"><span className="text-xs text-muted-foreground">{formatDate(e.date)}</span><div>{e.label}</div></li>))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="print-break">
            <CardHeader><CardTitle>QR code</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center gap-2 text-center">
              <div className="h-44 w-44 rounded bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} aria-label={`QR code for ${a.asset_code}`} />
              <div className="font-mono text-sm">{a.asset_code}</div>
              {staff && <Link href={`/assets/qr-codes?q=${a.asset_code}`} className="text-sm text-primary hover:underline no-print">Printable label</Link>}
            </CardContent>
          </Card>
          <div className="no-print"><AttachmentsCard kind="asset" entityId={id} path={`/assets/${id}`} title="Invoice, image and documents" files={signed} canDelete={(by) => admin || by === me.id} /></div>
          {staff && (
            <Card>
              <CardHeader><CardTitle>Linked tickets and tasks</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {!(tickets.data ?? []).length && !(tasks.data ?? []).length && <p className="text-muted-foreground">None linked.</p>}
                {(tickets.data ?? []).map((t: any) => <div key={t.id}><Link className="text-primary hover:underline" href={`/operations/tickets/${t.id}`}>{t.ticket_code}</Link> {t.title}</div>)}
                {(tasks.data ?? []).map((t: any) => <div key={t.id}><Link className="text-primary hover:underline" href={`/operations/tasks/${t.id}`}>{t.task_code}</Link> {t.title}</div>)}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Registered {formatDateTime(a.created_at)}.</p>
    </>
  );
}
