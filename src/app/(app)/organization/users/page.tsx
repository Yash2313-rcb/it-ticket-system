import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can, ROLE_LABELS, type Role } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { CreateUserDialog, UserRowControls } from '@/components/organization/user-dialogs';

export default async function UsersPage() {
  const me = await requireProfile();
  if (!can.manageUsers(me.role)) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: users, error }, { data: employees }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, is_active, created_at, employees(emp_code, full_name)').order('created_at'),
    supabase.from('employees').select('id, emp_code, full_name').eq('status', 'active').order('full_name'),
  ]);

  return (
    <>
      <PageHeader title="User management" description="Who can sign in, and what they can see. Permissions are enforced by the database, not just the screens." actions={<CreateUserDialog employees={employees ?? []} />} />
      <Card>
        {error ? <EmptyState title="Could not load users" hint={error.message} /> : !users?.length ? <EmptyState title="No users" /> : (
          <Table>
            <THead><tr><TH>Name</TH><TH>Email</TH><TH>Linked employee</TH><TH>Created</TH><TH>Status</TH><TH>Role and access</TH></tr></THead>
            <TBody>
              {users.map((u: any) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.full_name || '-'}</TD>
                  <TD>{u.email}</TD>
                  <TD>{u.employees ? `${u.employees.emp_code} - ${u.employees.full_name}` : '-'}</TD>
                  <TD className="whitespace-nowrap">{formatDate(u.created_at)}</TD>
                  <TD>
                    <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Active' : 'Deactivated'}</Badge>
                    <span className="sr-only">{ROLE_LABELS[u.role as Role]}</span>
                  </TD>
                  <TD><UserRowControls id={u.id} role={u.role} isActive={u.is_active} isSelf={u.id === me.id} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
