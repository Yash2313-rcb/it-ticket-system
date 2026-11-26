import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Count rows in a table. Returns null when the table does not exist yet
 * (module not built / migration not run) so the UI can say so honestly
 * instead of showing a fake zero.
 */
export async function safeCount(
  supabase: SupabaseClient,
  table: string,
  apply?: (q: any) => any,
): Promise<number | null> {
  let q: any = supabase.from(table).select('*', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}
