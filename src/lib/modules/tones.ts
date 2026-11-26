import type { Tone } from '@/lib/ops';

export const humanize = (v: string | null | undefined) =>
  !v ? '-' : v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const GOOD = ['active', 'paid', 'completed', 'approved', 'received', 'in_use', 'available', 'renewed', 'free', 'new', 'good', 'resolved'];
const WARN = ['pending', 'draft', 'scheduled', 'renewal_due', 'unpaid', 'partially_paid', 'ordered', 'pending_approval', 'partially_received', 'reserved', 'assigned', 'fair', 'medium', 'high', 'under_maintenance', 'converted'];
const BAD = ['rejected', 'cancelled', 'expired', 'damaged', 'lost', 'faulty', 'overdue', 'poor', 'critical', 'disposed'];

export const valueTone = (v: string | null | undefined): Tone =>
  !v ? 'neutral' : GOOD.includes(v) ? 'success' : BAD.includes(v) ? 'danger' : WARN.includes(v) ? 'warning' : 'neutral';

export const daysUntil = (ymd: string | null | undefined) => {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00Z`).getTime();
  const t = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((d - t) / 86400000);
};
