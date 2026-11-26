import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { formatMinutes, nameMap, PRIORITY, priorityTone, TASK_STATUS, taskStatusTone, todayYmd } from '@/lib/ops';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TaskDialog } from '@/components/operations/task-dialog';
import { AttachmentsCard, CommentsCard } from '@/components/operations/side-panels';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="grid grid-cols-3 gap-2 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{children}</dd></div>);
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/operations/tickets');
  const { id } = await params;
  const supabase = await createClient();

  const { data: task } = await supabase
    .from('tasks')
    .select('*, task_categories(name), departments(name), tickets(id, ticket_code, title)')
    .eq('id', id)
    .maybeSingle();
  if (!task) notFound();

  const [{ data: comments }, { data: files }, { data: categories }, { data: departments }, { data: staff }, { data: tickets }] = await Promise.all([
    supabase.from('task_comments').select('id, author_id, body, created_at').eq('task_id', id).order('created_at'),
    supabase.from('attachments').select('id, file_name, file_size, file_path, uploaded_by').eq('entity_type', 'task').eq('entity_id', id).order('created_at'),
    supabase.from('task_categories').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').in('role', ['super_admin', 'it_admin', 'it_member']).eq('is_active', true).order('full_name'),
    supabase.from('tickets').select('id, ticket_code, title').in('status', ['open', 'assigned', 'in_progress', 'on_hold']).limit(100),
  ]);

  const names = await nameMap(supabase, [task.performed_by, task.assigned_by, task.created_by, ...(comments ?? []).map((c: any) => c.author_id)]);
  const signed = await Promise.all((files ?? []).map(async (f: any) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(f.file_path, 3600);
    return { ...f, url: data?.signedUrl ?? null };
  }));

  const lockSelf = me.role === 'it_member';
  const staffOptions = lockSelf ? (staff ?? []).filter((p: any) => p.id === me.id) : staff ?? [];
  const canEdit = isAdmin(me.role) || task.performed_by === me.id;
  const ticketOptions = [...(tickets ?? [])];
  if (task.tickets && !ticketOptions.find((t: any) => t.id === task.tickets.id)) ticketOptions.push(task.tickets);

  return (
    <>
      <Link href="/operations/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All tasks</Link>
      <PageHeader
        title={`${task.task_code}: ${task.title}`}
        actions={canEdit ? <TaskDialog task={task} categories={categories ?? []} departments={departments ?? []} staff={staffOptions} tickets={ticketOptions} currentUserId={me.id} lockSelf={lockSelf} today={todayYmd()} /> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle>
              <div className="flex gap-2">
                <Badge tone={taskStatusTone(task.status)}>{TASK_STATUS[task.status as keyof typeof TASK_STATUS]}</Badge>
                <Badge tone={priorityTone(task.priority)}>{PRIORITY[task.priority as keyof typeof PRIORITY]}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {task.description && <p className="mb-4 whitespace-pre-wrap text-sm">{task.description}</p>}
              <dl className="divide-y">
                <Row label="Category">{task.task_categories?.name ?? '-'}</Row>
                <Row label="Task date">{formatDate(task.task_date)}</Row>
                <Row label="Time">{task.start_time ? `${task.start_time.slice(0, 5)} to ${task.end_time?.slice(0, 5) ?? '?'}` : '-'} ({formatMinutes(task.time_spent_minutes)})</Row>
                <Row label="Assigned by">{names[task.assigned_by] ?? '-'}</Row>
                <Row label="Performed by">{names[task.performed_by] ?? '-'}</Row>
                <Row label="Department served">{task.departments?.name ?? '-'}</Row>
                <Row label="Related ticket">{task.tickets ? <Link className="text-primary hover:underline" href={`/operations/tickets/${task.tickets.id}`}>{task.tickets.ticket_code} - {task.tickets.title}</Link> : '-'}</Row>
                <Row label="Remarks">{task.remarks ?? '-'}</Row>
                <Row label="Recorded">{formatDateTime(task.created_at)} by {names[task.created_by] ?? '-'}</Row>
              </dl>
            </CardContent>
          </Card>
          <CommentsCard kind="task" entityId={id} comments={comments ?? []} names={names} />
        </div>
        <div>
          <AttachmentsCard kind="task" entityId={id} files={signed} canDelete={(by) => isAdmin(me.role) || by === me.id} />
        </div>
      </div>
    </>
  );
}
