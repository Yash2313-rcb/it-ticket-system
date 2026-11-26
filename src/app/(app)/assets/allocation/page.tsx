import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { assetOp } from '@/lib/actions/assets';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';

export default async function AllocationPage() {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/my-assets');
  const admin = isAdmin(me.role);
  const supabase = await createClient();
  const [{ data: rows, error }, available, employees] = await Promise.all([
    supabase.from('asset_assignments').select('id, asset_id, assigned_on, returned_on, return_condition, assets(asset_code, name), employees(emp_code, full_name), departments(name)').order('assigned_on', { ascending: false }).limit(200),
    admin ? refOptions(supabase, 'assets', 'asset_code,name', ['status', 'available']) : Promise.resolve([] as [string, string][]),
    admin ? refOptions(supabase, 'employees', 'emp_code,full_name', ['status', 'active']) : Promise.resolve([] as [string, string][]),
  ]);
  const current = (rows ?? []).filter((r: any) => !r.returned_on);
  const history = (rows ?? []).filter((r: any) => r.returned_on);

  const table = (list: any[], isCurrent: boolean) => !list.length ? <EmptyState title={isCurrent ? 'No assets are currently allocated' : 'No returned allocations yet'} /> : (
    <Table>
      <THead><tr><TH>Asset</TH><TH>Employee</TH><TH>Department</TH><TH>Allocated</TH>{!isCurrent && <TH>Returned</TH>}<TH>Receipts</TH>{isCurrent && admin && <TH />}</tr></THead>
      <TBody>
        {list.map((r: any) => (
          <TR key={r.id}>
            <TD><Link href={`/assets/${r.asset_id}`} className="text-primary hover:underline">{r.assets?.asset_code}</Link> {r.assets?.name}</TD>
            <TD>{r.employees?.full_name} <span className="text-xs text-muted-foreground">{r.employees?.emp_code}</span></TD>
            <TD>{r.departments?.name ?? '-'}</TD><TD>{formatDate(r.assigned_on)}</TD>
            {!isCurrent && <TD>{formatDate(r.returned_on)} {r.return_condition && <Badge>{r.return_condition}</Badge>}</TD>}
            <TD className="whitespace-nowrap"><Link className="text-primary hover:underline" href={`/assets/receipt/${r.id}`}>Handover</Link>{!isCurrent && <> | <Link className="text-primary hover:underline" href={`/assets/receipt/${r.id}?type=return`}>Return</Link></>}</TD>
            {isCurrent && admin && <TD className="text-right"><FormDialog title="Record return" triggerLabel="Return" icon="none" variant="outline" size="sm" hidden={{ asset_id: r.asset_id }} action={assetOp.bind(null, 'return')} submitLabel="Record return"
              fields={[{ name: 'condition', label: 'Condition on return', type: 'select', required: true, default: 'good', options: [['new', 'New'], ['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor']] }, { name: 'notes', label: 'Notes', type: 'textarea' }]} /></TD>}
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <>
      <PageHeader title="Asset allocation" description="Who holds which asset, with the full history and printable receipts."
        actions={admin ? <FormDialog title="Assign asset" triggerLabel="Assign asset" action={assetOp.bind(null, 'assign')} submitLabel="Assign"
          fields={[{ name: 'asset_id', label: 'Available asset', type: 'select', required: true, options: available }, { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: employees }, { name: 'notes', label: 'Notes', type: 'textarea' }]} /> : undefined} />
      {error && <p className="mb-4 text-sm text-destructive">{error.message}</p>}
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Currently allocated ({current.length})</CardTitle></CardHeader>{table(current, true)}</Card>
        <Card><CardHeader><CardTitle>Allocation history</CardTitle></CardHeader>{table(history, false)}</Card>
      </div>
    </>
  );
}
