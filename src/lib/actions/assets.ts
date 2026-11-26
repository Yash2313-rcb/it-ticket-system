'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { emptyToNull } from '@/lib/utils';
import type { ActionState } from '@/lib/actions/modules';
import { friendlyDbError } from '@/lib/db-error';

const uuid = z.string().uuid();

/** op = assign | return | transfer | dispose. The database functions re-check the caller's role. */
export async function assetOp(op: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active) return { error: 'You do not have permission to do this.' };
  const asset = emptyToNull(fd.get('asset_id'));
  if (!asset || !uuid.safeParse(asset).success) return { error: 'Select an asset.' };
  const supabase = await createClient();

  let res: { error: { message: string } | null };
  if (op === 'assign') {
    const emp = emptyToNull(fd.get('employee_id'));
    if (!emp) return { error: 'Select the employee.' };
    res = await supabase.rpc('asset_assign', { p_asset: asset, p_employee: emp, p_notes: emptyToNull(fd.get('notes')) });
  } else if (op === 'return') {
    res = await supabase.rpc('asset_return', { p_asset: asset, p_condition: String(fd.get('condition') ?? 'good'), p_notes: emptyToNull(fd.get('notes')) });
  } else if (op === 'transfer') {
    res = await supabase.rpc('asset_transfer', {
      p_asset: asset, p_to_department: emptyToNull(fd.get('to_department_id')), p_to_employee: emptyToNull(fd.get('to_employee_id')), p_reason: emptyToNull(fd.get('reason')),
    });
  } else if (op === 'dispose') {
    const value = emptyToNull(fd.get('disposal_value'));
    if (value !== null && !/^\d+(\.\d+)?$/.test(value)) return { error: 'Disposal value must be a number.' };
    res = await supabase.rpc('asset_dispose', {
      p_asset: asset, p_method: String(fd.get('method') ?? 'scrapped'), p_value: value ? Number(value) : 0,
      p_date: emptyToNull(fd.get('disposal_date')), p_reason: emptyToNull(fd.get('reason')),
    });
  } else return { error: 'Unknown action.' };

  if (res.error) return { error: friendlyDbError(res.error.message) };
  revalidatePath('/', 'layout');
  return { ok: true };
}
