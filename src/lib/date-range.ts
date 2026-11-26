export type RangeKey = 'today' | 'week' | 'month' | 'year' | 'custom';

export type ResolvedRange = { key: RangeKey; from: Date; to: Date; label: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function resolveRange(params: { range?: string; from?: string; to?: string }): ResolvedRange {
  const now = new Date();
  const key = (['today', 'week', 'month', 'year', 'custom'].includes(params.range ?? '')
    ? params.range
    : 'month') as RangeKey;

  if (key === 'today') return { key, from: startOfDay(now), to: endOfDay(now), label: 'Today' };

  if (key === 'week') {
    const day = (now.getDay() + 6) % 7; // Monday = 0
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - day));
    return { key, from, to: endOfDay(now), label: 'This week' };
  }

  if (key === 'year') {
    return { key, from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now), label: 'This year' };
  }

  if (key === 'custom' && params.from && params.to) {
    const from = new Date(params.from);
    const to = new Date(params.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return { key, from: startOfDay(from), to: endOfDay(to), label: `${params.from} to ${params.to}` };
    }
  }

  return { key: 'month', from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now), label: 'This month' };
}
