'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile, profileWithRole } from '@/lib/auth';
import { emptyToNull } from '@/lib/utils';
import type { ActionState } from '@/lib/actions/modules';
import { friendlyDbError } from '@/lib/db-error';

const done = () => revalidatePath('/', 'layout');

export async function assignLicense(licenseId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await profileWithRole(['super_admin', 'it_admin']))) return { error: 'You do not have permission to do this.' };
  const emp = emptyToNull(fd.get('employee_id'));
  if (!emp) return { error: 'Select an employee.' };
  const supabase = await createClient();
  const { error } = await supabase.from('license_assignments').insert({ license_id: licenseId, employee_id: emp });
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

export async function unassignLicense(id: string): Promise<ActionState> {
  if (!(await profileWithRole(['super_admin', 'it_admin']))) return { error: 'You do not have permission to do this.' };
  const supabase = await createClient();
  const { error } = await supabase.from('license_assignments').delete().eq('id', id);
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

const DOC_CATEGORIES = ['purchase_invoice', 'purchase_order', 'asset_document', 'warranty_certificate', 'amc_agreement', 'software_license', 'network_diagram', 'maintenance_report', 'vendor_agreement', 'it_policy', 'other'];
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'ppt', 'pptx'];

export async function uploadDocument(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await profileWithRole(['super_admin', 'it_admin']);
  if (!me) return { error: 'You do not have permission to do this.' };
  const title = emptyToNull(fd.get('title'));
  const category = String(fd.get('category') ?? 'other');
  const file = fd.get('file');
  if (!title) return { error: 'Enter a document title.' };
  if (!DOC_CATEGORIES.includes(category)) return { error: 'Select a category.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  if (file.size > 10 * 1024 * 1024) return { error: 'File is larger than 10 MB.' };
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.includes(ext)) return { error: `File type .${ext} is not allowed.` };

  const supabase = await createClient();
  const { data: doc, error } = await supabase.from('documents').insert({ doc_code: '', title, category, description: emptyToNull(fd.get('description')), uploaded_by: me.id }).select('id').single();
  if (error || !doc) return { error: friendlyDbError(error?.message ?? 'Could not save the document.') };

  const path = `${me.id}/document/${doc.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined });
  if (upErr) { await supabase.from('documents').delete().eq('id', doc.id); return { error: `Upload failed: ${upErr.message}` }; }
  const { error: aErr } = await supabase.from('attachments').insert({ entity_type: 'document', entity_id: doc.id, file_path: path, file_name: file.name, file_size: file.size, content_type: file.type || null, uploaded_by: me.id });
  if (aErr) { await supabase.storage.from('attachments').remove([path]); return { error: friendlyDbError(aErr.message) }; }
  done();
  return { ok: true, id: doc.id };
}

export async function markNotifications(ids: string[] | 'all'): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active) return { error: 'Not allowed.' };
  const supabase = await createClient();
  let q = supabase.from('notifications').update({ is_read: true });
  q = ids === 'all' ? q.eq('is_read', false) : q.in('id', ids);
  const { error } = await q;
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

export async function refreshAlerts(): Promise<ActionState & { created?: number }> {
  if (!(await profileWithRole(['super_admin', 'it_admin']))) return { error: 'Only administrators can refresh alerts.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('generate_alerts');
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true, created: Number(data ?? 0) };
}
