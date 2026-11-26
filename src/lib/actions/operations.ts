'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile, profileWithRole } from '@/lib/auth';
import { emptyToNull } from '@/lib/utils';
import { enumKeys, PRIORITY, TASK_STATUS, TICKET_STATUS } from '@/lib/ops';
import type { Role } from '@/lib/permissions';

export type ActionState = { ok?: boolean; error?: string; id?: string };

const IT_STAFF: Role[] = ['super_admin', 'it_admin', 'it_member'];
const ADMINS: Role[] = ['super_admin', 'it_admin'];
const DENIED = 'You do not have permission to do this.';

const dbError = (msg: string) => {
  if (msg.includes('row-level security')) return DENIED;
  if (msg.includes('violates foreign key')) return 'A selected record no longer exists.';
  return msg;
};

const uuidOrNull = z.string().uuid().nullable();
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Enter a valid time').nullable();

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// ---------------------------------------------------------------- tasks
const taskSchema = z.object({
  id: uuidOrNull,
  title: z.string().trim().min(3, 'Enter a task title (at least 3 characters)').max(200),
  description: z.string().nullable(),
  category_id: uuidOrNull,
  task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the task date'),
  start_time: time,
  end_time: time,
  assigned_by: uuidOrNull,
  performed_by: uuidOrNull,
  department_id: uuidOrNull,
  priority: z.enum(enumKeys(PRIORITY)),
  status: z.enum(enumKeys(TASK_STATUS)),
  time_spent_minutes: z.string().regex(/^\d{1,5}$/, 'Time spent must be a whole number of minutes').nullable(),
  ticket_id: uuidOrNull,
  remarks: z.string().nullable(),
});

export async function saveTask(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await profileWithRole(IT_STAFF);
  if (!me) return { error: DENIED };

  const parsed = taskSchema.safeParse({
    id: emptyToNull(fd.get('id')),
    title: fd.get('title') ?? '',
    description: emptyToNull(fd.get('description')),
    category_id: emptyToNull(fd.get('category_id')),
    task_date: fd.get('task_date') ?? '',
    start_time: emptyToNull(fd.get('start_time')),
    end_time: emptyToNull(fd.get('end_time')),
    assigned_by: emptyToNull(fd.get('assigned_by')),
    performed_by: emptyToNull(fd.get('performed_by')),
    department_id: emptyToNull(fd.get('department_id')),
    priority: fd.get('priority') ?? 'medium',
    status: fd.get('status') ?? 'pending',
    time_spent_minutes: emptyToNull(fd.get('time_spent_minutes')),
    ticket_id: emptyToNull(fd.get('ticket_id')),
    remarks: emptyToNull(fd.get('remarks')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, time_spent_minutes, ...rest } = parsed.data;
  if (rest.start_time && rest.end_time && toMinutes(rest.end_time) <= toMinutes(rest.start_time)) {
    return { error: 'End time must be after the start time.' };
  }

  // Time spent: use the entered value, otherwise work it out from start and end time.
  let minutes: number | null = time_spent_minutes ? Number(time_spent_minutes) : null;
  if (minutes === null && rest.start_time && rest.end_time) minutes = toMinutes(rest.end_time) - toMinutes(rest.start_time);

  const values = {
    ...rest,
    time_spent_minutes: minutes,
    performed_by: me.role === 'it_member' ? me.id : rest.performed_by ?? me.id,
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('tasks').update(values).eq('id', id);
    if (error) return { error: dbError(error.message) };
  } else {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...values, task_code: '', created_by: me.id, assigned_by: values.assigned_by ?? me.id })
      .select('id')
      .single();
    if (error) return { error: dbError(error.message) };
    revalidatePath('/operations/tasks');
    return { ok: true, id: data?.id };
  }

  revalidatePath('/operations/tasks');
  revalidatePath(`/operations/tasks/${id}`);
  revalidatePath('/dashboard');
  return { ok: true, id };
}

export async function setTaskStatus(id: string, status: string): Promise<ActionState> {
  if (!(await profileWithRole(IT_STAFF))) return { error: DENIED };
  if (!(status in TASK_STATUS)) return { error: 'Invalid status.' };
  const supabase = await createClient();
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) return { error: dbError(error.message) };
  revalidatePath('/operations/tasks');
  revalidatePath(`/operations/tasks/${id}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

// -------------------------------------------------------------- tickets
const ticketSchema = z.object({
  title: z.string().trim().min(3, 'Enter a short issue title').max(200),
  description: z.string().trim().min(5, 'Describe the problem so IT can help'),
  category_id: z.string().uuid('Select a category'),
  priority: z.enum(enumKeys(PRIORITY)),
  employee_id: uuidOrNull,
});

export async function createTicket(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active) return { error: DENIED };
  const isStaff = IT_STAFF.includes(me.role);

  const parsed = ticketSchema.safeParse({
    title: fd.get('title') ?? '',
    description: fd.get('description') ?? '',
    category_id: fd.get('category_id') ?? '',
    priority: fd.get('priority') ?? 'medium',
    employee_id: emptyToNull(fd.get('employee_id')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Employees and department heads always raise tickets for their own linked employee record.
  const employeeId = isStaff ? parsed.data.employee_id : me.employee_id;

  const supabase = await createClient();
  let departmentId: string | null = null;
  if (employeeId) {
    const { data: emp } = await supabase.from('employees').select('department_id').eq('id', employeeId).maybeSingle();
    departmentId = emp?.department_id ?? null;
  }

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      ticket_code: '',
      title: parsed.data.title,
      description: parsed.data.description,
      category_id: parsed.data.category_id,
      priority: parsed.data.priority,
      employee_id: employeeId,
      department_id: departmentId,
      reported_by: me.id,
    })
    .select('id')
    .single();
  if (error) return { error: dbError(error.message) };

  revalidatePath('/operations/tickets');
  revalidatePath('/dashboard');
  return { ok: true, id: data?.id };
}

const ticketUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(enumKeys(TICKET_STATUS)),
  priority: z.enum(enumKeys(PRIORITY)),
  assigned_to: uuidOrNull,
  category_id: uuidOrNull,
  resolution_details: z.string().nullable(),
});

export async function updateTicket(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await profileWithRole(IT_STAFF);
  if (!me) return { error: DENIED };

  const parsed = ticketUpdateSchema.safeParse({
    id: fd.get('id'),
    status: fd.get('status'),
    priority: fd.get('priority'),
    assigned_to: emptyToNull(fd.get('assigned_to')),
    category_id: emptyToNull(fd.get('category_id')),
    resolution_details: emptyToNull(fd.get('resolution_details')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, ...v } = parsed.data;
  if ((v.status === 'resolved' || v.status === 'closed') && !v.resolution_details) {
    return { error: 'Enter the resolution details before resolving or closing the ticket.' };
  }
  let status: string = v.status;
  if (v.assigned_to && status === 'open') status = 'assigned';
  if (!v.assigned_to && status === 'assigned') status = 'open';

  const supabase = await createClient();
  const { error } = await supabase.from('tickets').update({ ...v, status }).eq('id', id);
  if (error) return { error: dbError(error.message) };

  revalidatePath('/operations/tickets');
  revalidatePath(`/operations/tickets/${id}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

// ------------------------------------------------------------- comments
export async function addComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active) return { error: DENIED };
  const kind = String(fd.get('kind'));
  const entityId = String(fd.get('entity_id'));
  const body = String(fd.get('body') ?? '').trim();
  if (!z.string().uuid().safeParse(entityId).success) return { error: 'Invalid record.' };
  if (body.length < 1) return { error: 'Write a comment first.' };
  if (body.length > 4000) return { error: 'Comment is too long (4000 characters maximum).' };

  const supabase = await createClient();
  const { error } =
    kind === 'task'
      ? await supabase.from('task_comments').insert({ task_id: entityId, author_id: me.id, body })
      : kind === 'ticket'
        ? await supabase.from('ticket_comments').insert({ ticket_id: entityId, author_id: me.id, body })
        : { error: { message: 'Invalid comment type.' } };
  if (error) return { error: dbError(error.message) };

  revalidatePath(`/operations/${kind}s/${entityId}`);
  return { ok: true };
}

// ---------------------------------------------------------- attachments
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip'];
const MAX_BYTES = 10 * 1024 * 1024;
const ATTACH_KINDS = ['task', 'ticket', 'asset', 'bill', 'payment', 'po', 'document', 'maintenance', 'license', 'contract', 'expense', 'vendor'];

export async function uploadAttachment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active) return { error: DENIED };
  const kind = String(fd.get('kind'));
  const entityId = String(fd.get('entity_id'));
  const file = fd.get('file');
  if (!ATTACH_KINDS.includes(kind)) return { error: 'Invalid record.' };
  if (!z.string().uuid().safeParse(entityId).success) return { error: 'Invalid record.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  if (file.size > MAX_BYTES) return { error: 'File is larger than 10 MB.' };
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.includes(ext)) return { error: `File type .${ext} is not allowed. Allowed: ${ALLOWED_EXT.join(', ')}.` };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${me.id}/${kind}/${entityId}/${Date.now()}-${safeName}`;

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined });
  if (upErr) return { error: `Upload failed: ${upErr.message}` };

  const { error } = await supabase.from('attachments').insert({
    entity_type: kind,
    entity_id: entityId,
    file_path: path,
    file_name: file.name,
    file_size: file.size,
    content_type: file.type || null,
    uploaded_by: me.id,
  });
  if (error) {
    await supabase.storage.from('attachments').remove([path]);
    return { error: dbError(error.message) };
  }
  const back = String(fd.get('path') ?? '');
  revalidatePath(back.startsWith('/') ? back : '/', back.startsWith('/') ? 'page' : 'layout');
  return { ok: true };
}

export async function deleteAttachment(id: string): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active) return { error: DENIED };
  const supabase = await createClient();
  const { data: att } = await supabase.from('attachments').select('file_path, entity_type, entity_id, uploaded_by').eq('id', id).maybeSingle();
  if (!att) return { error: 'Attachment not found.' };
  if (att.uploaded_by !== me.id && !ADMINS.includes(me.role)) return { error: DENIED };

  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) return { error: dbError(error.message) };
  await supabase.storage.from('attachments').remove([att.file_path]);
  revalidatePath('/', 'layout');
  return { ok: true };
}
