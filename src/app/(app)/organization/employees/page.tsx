import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmployeeDialog, EmployeeStatusButton } from '@/components/organization/employee-dialog';

const PAGE_SIZE = 20;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string; status?: string; page?: string }> }) {
  const profile = await requireProfile();
  if (!can.viewEmployees(profile.role)) redirect('/dashboard');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  const { data: departments } = await supabase.from('departments').select('id, name').eq('is_active', true).order('name');

  let query = supabase
    .from('employees')
    .select('id, emp_code, full_name, department_id, designation, email, phone, location, joining_date, status, departments(name)', { count: 'exact' })
    .order('full_name')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, ' ').trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,emp_code.ilike.%${term}%,email.ilike.%${term}%,designation.ilike.%${term}%`);
  }
  if (sp.dept) query = query.eq('department_id', sp.dept);
  if (sp.status === 'active' || sp.status === 'inactive') query = query.eq('status', sp.status);

  const { data, count, error } = await query;
  const canWrite = can.writeEmployees(profile.role);
  const filtered = !!(sp.q || sp.dept || sp.status);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Employee directory. Assets, tickets and requests link back to these records."
        actions={canWrite ? <EmployeeDialog departments={departments ?? []} /> : undefined}
      />
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="Search name, ID, email, designation" className="w-full sm:w-72" />
          <Select name="dept" defaultValue={sp.dept ?? ''} className="w-full sm:w-48">
            <option value="">All departments</option>
            {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select name="status" defaultValue={sp.status ?? ''} className="w-full sm:w-36">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Button type="submit" variant="outline">Apply filters</Button>
          {filtered && <Link href="/organization/employees" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </form>

        {error ? <EmptyState title="Could not load employees" hint={error.message} /> : !data?.length ? (
          <EmptyState
            title={filtered ? 'No employees match these filters' : 'No employees yet'}
            hint={filtered ? 'Try a different search or clear the filters.' : canWrite ? 'Add departments first, then add employees.' : undefined}
          />
        ) : (
          <Table>
            <THead><tr><TH>ID</TH><TH>Name</TH><TH>Department</TH><TH>Designation</TH><TH>Contact</TH><TH>Location</TH><TH>Joined</TH><TH>Status</TH>{canWrite && <TH />}</tr></THead>
            <TBody>
              {data.map((e: any) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.emp_code}</TD>
                  <TD className="font-medium">{e.full_name}</TD>
                  <TD>{e.departments?.name ?? '-'}</TD>
                  <TD>{e.designation ?? '-'}</TD>
                  <TD><div>{e.email ?? '-'}</div><div className="text-xs text-muted-foreground">{e.phone ?? ''}</div></TD>
                  <TD>{e.location ?? '-'}</TD>
                  <TD className="whitespace-nowrap">{formatDate(e.joining_date)}</TD>
                  <TD><Badge tone={e.status === 'active' ? 'success' : 'neutral'}>{e.status === 'active' ? 'Active' : 'Inactive'}</Badge></TD>
                  {canWrite && (
                    <TD className="whitespace-nowrap text-right">
                      <EmployeeDialog employee={e} departments={departments ?? []} />
                      <EmployeeStatusButton id={e.id} name={e.full_name} status={e.status} />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/organization/employees" params={{ q: sp.q, dept: sp.dept, status: sp.status }} />
      </Card>
    </>
  );
}
