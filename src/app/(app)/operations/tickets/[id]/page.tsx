import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { formatMinutes, isTicketOverdue, nameMap, PRIORITY, priorityTone, TASK_STATUS, taskStatusTone, TICKET_STATUS, ticketStatusTone } from '@/lib/ops';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TicketManageForm } from '@/components/operations/ticket-forms';
import { AttachmentsCard, CommentsCard } from '@/components/operations/side-panels';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{children}</dd></div>);
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireProfile();
  const staffUser = isItStaff(me.role);
  const { id } = await params;
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from('tickets')
    .select('*, ticket_categories(name), departments(name), employees(emp_code, full_name, designation)')
    .eq('id', id)
    .maybeSingle();
  if (!ticket) notFound();

  const [{ data: comments }, { data: files }, { data: categories }, { data: staff }, { data: linkedTasks }] = await Promise.all([
    supabase.from('ticket_comments').select('id, author_id, body, created_at').eq('ticket_id', id).order('created_at'),
    supabase.from('attachments').select('id, file_name, file_size, file_path, uploaded_by').eq('entity_type', 'ticket').eq('entity_id', id).order('created_at'),
    staffUser ? supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('sort_order') : Promise.resolve({ data: [] as any[] }),
    staffUser
      ? supabase.from('profiles').select('id, full_name').in('role', ['super_admin', 'it_admin', 'it_member']).eq('is_active', true).order('full_name')
      : Promise.resolve({ data: [] as any[] }),
    staffUser ? supabase.from('tasks').select('id, task_code, title, status').eq('ticket_id', id).order('task_date') : Promise.resolve({ data: [] as any[] }),
  ]);

  const names = await nameMap(supabase, [ticket.reported_by, ticket.assigned_to, ...(comments ?? []).map((c: any) => c.author_id)]);
  const signed = await Promise.all((files ?? []).map(async (f: any) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(f.file_path, 3600);
    return { ...f, url: data?.signedUrl ?? null };
  }));
  const overdue = isTicketOverdue(ticket);

  return (
    <>
      <Link href="/operations/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All tickets</Link>
      <PageHeader title={`${ticket.ticket_code}: ${ticket.title}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <div className="flex gap-2">
                <Badge tone={ticketStatusTone(ticket.status)}>{TICKET_STATUS[ticket.status as keyof typeof TICKET_STATUS]}</Badge>
                <Badge tone={priorityTone(ticket.priority)}>{PRIORITY[ticket.priority as keyof typeof PRIORITY]}</Badge>
                {overdue && <Badge tone="danger">Overdue</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 whitespace-pre-wrap text-sm">{ticket.description}</p>
              <dl className="divide-y">
                <Row label="Raised for">{ticket.employees ? `${ticket.employees.full_name} (${ticket.employees.emp_code})` : names[ticket.reported_by] ?? '-'}</Row>
                <Row label="Department">{ticket.departments?.name ?? '-'}</Row>
                <Row label="Category">{ticket.ticket_categories?.name ?? '-'}</Row>
                <Row label="Reported">{formatDateTime(ticket.reported_at)} by {names[ticket.reported_by] ?? '-'}</Row>
                <Row label="Response target">{formatDateTime(ticket.due_at)}</Row>
                <Row label="Assigned to">{names[ticket.assigned_to] ?? 'Unassigned'}</Row>
                {ticket.resolved_at && <Row label="Resolved">{formatDateTime(ticket.resolved_at)} (took {formatMinutes(ticket.time_taken_minutes)})</Row>}
                {ticket.resolution_details && <Row label="Resolution"><span className="whitespace-pre-wrap">{ticket.resolution_details}</span></Row>}
              </dl>
            </CardContent>
          </Card>

          {staffUser && (
            <Card>
              <CardHeader><CardTitle>Manage ticket</CardTitle></CardHeader>
              <CardContent>
                <TicketManageForm
                  key={`${ticket.updated_at}`}
                  ticket={{ id: ticket.id, status: ticket.status, priority: ticket.priority, assigned_to: ticket.assigned_to, category_id: ticket.category_id, resolution_details: ticket.resolution_details }}
                  staff={staff ?? []} categories={categories ?? []}
                />
              </CardContent>
            </Card>
          )}

          <CommentsCard kind="ticket" entityId={id} comments={comments ?? []} names={names} />
        </div>

        <div className="space-y-6">
          <AttachmentsCard kind="ticket" entityId={id} files={signed} canDelete={(by) => isAdmin(me.role) || by === me.id} />
          {staffUser && (
            <Card>
              <CardHeader><CardTitle>Linked tasks ({linkedTasks?.length ?? 0})</CardTitle></CardHeader>
              <CardContent>
                {!linkedTasks?.length ? <p className="text-sm text-muted-foreground">No tasks linked. Add a task and pick this ticket as the related ticket.</p> : (
                  <ul className="space-y-2 text-sm">
                    {linkedTasks.map((t: any) => (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <Link href={`/operations/tasks/${t.id}`} className="truncate text-primary hover:underline">{t.task_code} {t.title}</Link>
                        <Badge tone={taskStatusTone(t.status)}>{TASK_STATUS[t.status as keyof typeof TASK_STATUS]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
