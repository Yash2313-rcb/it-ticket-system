import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can, isAdmin } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SettingsForm } from '@/components/organization/settings-form';

export default async function SettingsPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile.role)) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: setting }, { data: logs }] = await Promise.all([
    supabase.from('system_settings').select('value').eq('key', 'organization_name').single(),
    supabase.from('activity_logs').select('id, action, entity_type, entity_id, created_at, actor_id').order('created_at', { ascending: false }).limit(25),
  ]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
          <CardContent><SettingsForm organizationName={(setting?.value as string) ?? ''} canEdit={can.manageSettings(profile.role)} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Audit log (latest 25 changes)</CardTitle></CardHeader>
          {!logs?.length ? <EmptyState title="No activity recorded yet" /> : (
            <Table>
              <THead><tr><TH>When</TH><TH>Action</TH><TH>Record type</TH><TH>Record ID</TH></tr></THead>
              <TBody>
                {logs.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap">{formatDateTime(l.created_at)}</TD>
                    <TD>{l.action}</TD>
                    <TD>{l.entity_type}</TD>
                    <TD className="font-mono text-xs">{l.entity_id}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
