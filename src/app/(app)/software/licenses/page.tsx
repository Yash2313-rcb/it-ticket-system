import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { assignLicense, unassignLicense } from '@/lib/actions/misc';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';
import { ConfirmButton } from '@/components/forms/confirm-button';

export default async function LicenseAllocationPage({ searchParams }: { searchParams: Promise<{ license?: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const { license } = await searchParams;
  const supabase = await createClient();
  const [{ data: licenses }, { data: seats }, employees] = await Promise.all([
    supabase.from('software_licenses').select('id, software_name, license_count').order('software_name'),
    supabase.from('license_assignments').select('license_id'),
    refOptions(supabase, 'employees', 'emp_code,full_name', ['status', 'active']),
  ]);
  const used = new Map<string, number>();
  (seats ?? []).forEach((s: any) => used.set(s.license_id, (used.get(s.license_id) ?? 0) + 1));
  const selected = (licenses ?? []).find((l: any) => l.id === license);
  const { data: assigned } = selected
    ? await supabase.from('license_assignments').select('id, assigned_on, employees(emp_code, full_name, designation, departments(name))').eq('license_id', selected.id).order('assigned_on', { ascending: false })
    : { data: [] as any[] };

  return (
    <>
      <PageHeader title="License allocation" description="Assign licence seats to employees. Seats cannot be over-allocated."
        actions={selected ? <FormDialog title={`Assign ${selected.software_name}`} triggerLabel="Assign seat" action={assignLicense.bind(null, selected.id)} submitLabel="Assign"
          fields={[{ name: 'employee_id', label: 'Employee', type: 'select', required: true, options: employees }]} /> : undefined} />
      <form className="mb-4 flex gap-2"><Select name="license" defaultValue={license ?? ''} className="w-72" aria-label="Licence"><option value="">Select a licence</option>{(licenses ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.software_name} ({used.get(l.id) ?? 0}/{l.license_count})</option>)}</Select><Button type="submit" variant="outline">Show</Button></form>
      <Card>
        {!selected ? <EmptyState title="Choose a licence" hint="Pick a licence above to see and manage who holds its seats." /> : (
          <>
            <CardHeader><CardTitle>{selected.software_name}</CardTitle><Badge tone={(used.get(selected.id) ?? 0) >= selected.license_count ? 'warning' : 'success'}>{used.get(selected.id) ?? 0} of {selected.license_count} seats used</Badge></CardHeader>
            {!(assigned ?? []).length ? <EmptyState title="No seats allocated" /> : (
              <Table>
                <THead><tr><TH>Employee</TH><TH>Department</TH><TH>Designation</TH><TH>Assigned on</TH><TH /></tr></THead>
                <TBody>
                  {(assigned ?? []).map((a: any) => (
                    <TR key={a.id}><TD>{a.employees?.full_name} <span className="text-xs text-muted-foreground">{a.employees?.emp_code}</span></TD><TD>{a.employees?.departments?.name ?? '-'}</TD><TD>{a.employees?.designation ?? '-'}</TD><TD>{formatDate(a.assigned_on)}</TD>
                      <TD className="text-right"><ConfirmButton label="Remove" variant="ghost" confirmText="Free this seat?" action={unassignLicense.bind(null, a.id)} /></TD></TR>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </Card>
    </>
  );
}
