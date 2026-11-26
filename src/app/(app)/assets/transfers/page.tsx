import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { assetOp } from '@/lib/actions/assets';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';

export default async function TransfersPage() {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/my-assets');
  const admin = isAdmin(me.role);
  const supabase = await createClient();
  const [{ data, error }, assets, employees, departments] = await Promise.all([
    supabase.from('asset_transfers').select('id, asset_id, transfer_date, reason, assets(asset_code, name), from_dept:departments!asset_transfers_from_department_id_fkey(name), to_dept:departments!asset_transfers_to_department_id_fkey(name), from_emp:employees!asset_transfers_from_employee_id_fkey(full_name), to_emp:employees!asset_transfers_to_employee_id_fkey(full_name)').order('created_at', { ascending: false }).limit(200),
    admin ? supabase.from('assets').select('id, asset_code, name').not('status', 'in', '(lost,retired,disposed)').order('asset_code').limit(1000).then((r: any) => (r.data ?? []).map((x: any): [string, string] => [x.id, `${x.asset_code} - ${x.name}`])) : Promise.resolve([] as [string, string][]),
    admin ? refOptions(supabase, 'employees', 'emp_code,full_name', ['status', 'active']) : Promise.resolve([] as [string, string][]),
    admin ? refOptions(supabase, 'departments', 'name', ['is_active', 'true']) : Promise.resolve([] as [string, string][]),
  ]);
  return (
    <>
      <PageHeader title="Asset transfers" description="Moves between departments and employees. Each transfer updates the asset's current holder."
        actions={admin ? <FormDialog title="Transfer asset" triggerLabel="New transfer" action={assetOp.bind(null, 'transfer')} submitLabel="Transfer"
          fields={[{ name: 'asset_id', label: 'Asset', type: 'select', required: true, options: assets }, { name: 'to_department_id', label: 'To department', type: 'select', options: departments }, { name: 'to_employee_id', label: 'To employee', type: 'select', options: employees, hint: 'Choosing an employee also moves the asset into their department.' }, { name: 'reason', label: 'Reason', type: 'textarea' }]} /> : undefined} />
      <Card>
        {error ? <EmptyState title="Could not load transfers" hint={error.message} /> : !data?.length ? <EmptyState title="No transfers yet" /> : (
          <Table>
            <THead><tr><TH>Date</TH><TH>Asset</TH><TH>From</TH><TH>To</TH><TH>Reason</TH></tr></THead>
            <TBody>
              {data.map((t: any) => (
                <TR key={t.id}>
                  <TD className="whitespace-nowrap">{formatDate(t.transfer_date)}</TD>
                  <TD><Link href={`/assets/${t.asset_id}`} className="text-primary hover:underline">{t.assets?.asset_code}</Link> {t.assets?.name}</TD>
                  <TD>{[t.from_emp?.full_name, t.from_dept?.name].filter(Boolean).join(', ') || '-'}</TD>
                  <TD>{[t.to_emp?.full_name, t.to_dept?.name].filter(Boolean).join(', ') || '-'}</TD>
                  <TD>{t.reason ?? '-'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
