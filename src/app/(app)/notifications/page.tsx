import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { markNotifications, refreshAlerts } from '@/lib/actions/misc';
import { humanize } from '@/lib/modules/tones';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmButton } from '@/components/forms/confirm-button';

export default async function NotificationsPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from('notifications').select('id, type, title, body, link, is_read, created_at').order('created_at', { ascending: false }).limit(150);
  const admin = isAdmin(me.role);
  return (
    <>
      <PageHeader title="Notifications" description="Alerts for tickets, low stock, expiries, maintenance, payments and budgets."
        actions={<>
          {admin && <ConfirmButton label="Refresh alerts" size="md" action={refreshAlerts} />}
          <ConfirmButton label="Mark all as read" size="md" action={markNotifications.bind(null, 'all')} />
        </>} />
      <Card>
        {error ? <EmptyState title="Could not load notifications" hint={error.message.includes('does not exist') ? 'Run the latest database migrations.' : error.message} /> : !data?.length ? <EmptyState title="No notifications" hint={admin ? 'Use Refresh alerts to check for expiring warranties, licences, overdue work and low stock.' : undefined} /> : (
          <ul className="divide-y">
            {data.map((n: any) => (
              <li key={n.id} className={`flex items-start justify-between gap-3 px-5 py-3 text-sm ${n.is_read ? '' : 'bg-primary/5'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">{!n.is_read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}<Badge>{humanize(n.type)}</Badge>
                    {n.link ? <Link href={n.link} className="font-medium hover:underline">{n.title}</Link> : <span className="font-medium">{n.title}</span>}</div>
                  {n.body && <p className="mt-1 text-muted-foreground">{n.body}</p>}
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
