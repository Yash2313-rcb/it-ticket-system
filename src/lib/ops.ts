import type { SupabaseClient } from '@supabase/supabase-js';

export const TASK_STATUS = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
} as const;
export type TaskStatus = keyof typeof TASK_STATUS;

export const PRIORITY = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' } as const;
export type Priority = keyof typeof PRIORITY;

export const TICKET_STATUS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  on_hold: 'On hold',
  resolved: 'Resolved',
  closed: 'Closed',
} as const;
export type TicketStatus = keyof typeof TICKET_STATUS;

export const OPEN_TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'on_hold'];

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export const taskStatusTone = (s: string): Tone =>
  ({ pending: 'warning', in_progress: 'info', completed: 'success', on_hold: 'neutral', cancelled: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral';
export const ticketStatusTone = (s: string): Tone =>
  ({ open: 'warning', assigned: 'info', in_progress: 'info', on_hold: 'neutral', resolved: 'success', closed: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral';
export const priorityTone = (p: string): Tone =>
  ({ low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' } as Record<string, Tone>)[p] ?? 'neutral';

export function enumKeys<T extends Record<string, string>>(o: T): [keyof T & string, ...(keyof T & string)[]] {
  return Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
}

export function formatMinutes(m: number | null | undefined) {
  if (m === null || m === undefined) return '-';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function isTicketOverdue(t: { status: string; due_at: string | null }) {
  return !!t.due_at && OPEN_TICKET_STATUSES.includes(t.status) && new Date(t.due_at).getTime() < Date.now();
}

/** Org time zone used for day boundaries on reports (IST). */
export const TZ_OFFSET = '+05:30';
export const dayStartIso = (ymd: string) => new Date(`${ymd}T00:00:00${TZ_OFFSET}`).toISOString();
export const dayEndIso = (ymd: string) => new Date(`${ymd}T23:59:59.999${TZ_OFFSET}`).toISOString();

export const todayYmd = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const clean = (s: string) => s.replace(/[%,()]/g, ' ').trim();

type Sp = Record<string, string | undefined>;

export function applyTaskFilters(q: any, sp: Sp) {
  if (sp.q) {
    const t = clean(sp.q);
    if (t) q = q.or(`title.ilike.%${t}%,task_code.ilike.%${t}%`);
  }
  if (sp.status) q = q.eq('status', sp.status);
  if (sp.priority) q = q.eq('priority', sp.priority);
  if (sp.category) q = q.eq('category_id', sp.category);
  if (sp.by) q = q.eq('performed_by', sp.by);
  if (sp.from) q = q.gte('task_date', sp.from);
  if (sp.to) q = q.lte('task_date', sp.to);
  return q;
}

export function applyTicketFilters(q: any, sp: Sp, myId: string) {
  if (sp.q) {
    const t = clean(sp.q);
    if (t) q = q.or(`title.ilike.%${t}%,ticket_code.ilike.%${t}%`);
  }
  if (sp.status === 'active') q = q.in('status', OPEN_TICKET_STATUSES);
  else if (sp.status) q = q.eq('status', sp.status);
  if (sp.priority) q = q.eq('priority', sp.priority);
  if (sp.category) q = q.eq('category_id', sp.category);
  if (sp.assigned === 'me') q = q.eq('assigned_to', myId);
  else if (sp.assigned === 'none') q = q.is('assigned_to', null);
  else if (sp.assigned) q = q.eq('assigned_to', sp.assigned);
  if (sp.overdue === '1') q = q.in('status', OPEN_TICKET_STATUSES).lt('due_at', new Date().toISOString());
  if (sp.from) q = q.gte('reported_at', dayStartIso(sp.from));
  if (sp.to) q = q.lte('reported_at', dayEndIso(sp.to));
  return q;
}

/** Resolve profile ids to display names (works for every role via the profile_names() function). */
export async function nameMap(supabase: SupabaseClient, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const map: Record<string, string> = {};
  if (!unique.length) return map;
  const { data } = await supabase.rpc('profile_names', { ids: unique });
  (data ?? []).forEach((r: any) => { map[r.id] = r.full_name || 'Unnamed user'; });
  return map;
}
