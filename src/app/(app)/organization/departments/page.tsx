import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { ImportDialog } from '@/components/import/import-dialog';
import { DepartmentDialog } from '@/components/organization/department-dialog';

export default async function DepartmentsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from('departments').select('id, code, name, description, is_active, employees(count)').order('name');
  const canWrite = can.writeDepartments(profile.role);

  return (
    <>
      <PageHeader title="Departments" description="Departments used for employees, assets, budgets and reports." actions={canWrite ? <><ImportDialog importKey="departments" title="Departments" /><DepartmentDialog /></> : undefined} />
      <Card>
        {error ? <EmptyState title="Could not load departments" hint={error.message} /> : !data?.length ? (
          <EmptyState title="No departments yet" hint={canWrite ? 'Add your first department, for example Production or Stores.' : 'An administrator has not added departments yet.'} />
        ) : (
          <Table>
            <THead><tr><TH>Code</TH><TH>Name</TH><TH>Description</TH><TH>Employees</TH><TH>Status</TH>{canWrite && <TH />}</tr></THead>
            <TBody>
              {data.map((d: any) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.code}</TD>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="max-w-xs truncate text-muted-foreground">{d.description ?? '-'}</TD>
                  <TD>{d.employees?.[0]?.count ?? 0}</TD>
                  <TD><Badge tone={d.is_active ? 'success' : 'neutral'}>{d.is_active ? 'Active' : 'Inactive'}</Badge></TD>
                  {canWrite && <TD className="text-right"><DepartmentDialog department={d} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
