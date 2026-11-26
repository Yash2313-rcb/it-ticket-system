'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { emptyToNull } from '@/lib/utils';
import type { ActionState } from '@/lib/actions/modules';
import { friendlyDbError } from '@/lib/db-error';

const TYPES = ['stock_in', 'stock_out', 'transfer', 'adjustment', 'damaged', 'returned'];

export async function postStock(type: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active || !['super_admin', 'it_admin', 'it_member'].includes(me.role)) return { error: 'You do not have permission to do this.' };
  if (!TYPES.includes(type)) return { error: 'Unknown stock operation.' };

  const item = emptyToNull(fd.get('item_id'));
  if (!item || !z.string().uuid().safeParse(item).success) return { error: 'Select an item.' };
  const qtyRaw = emptyToNull(fd.get('quantity'));
  if (type === 'transfer' && qtyRaw === null) { /* quantity is informational for transfers */ }
  const qty = qtyRaw === null ? (type === 'transfer' ? 1 : NaN) : Number(qtyRaw);
  if (!Number.isFinite(qty) || qty === 0) return { error: 'Enter a quantity.' };
  if (type !== 'adjustment' && qty < 0) return { error: 'Quantity must be greater than zero.' };

  const employee = emptyToNull(fd.get('employee_id'));
  const purpose = emptyToNull(fd.get('purpose'));
  if (type === 'stock_out' && (!employee || !purpose)) return { error: 'Enter the employee and the purpose for issuing stock.' };
  if (type === 'transfer' && !emptyToNull(fd.get('to_location'))) return { error: 'Enter the new storage location.' };
  if (type === 'adjustment' && !purpose) return { error: 'Enter the reason for the adjustment.' };

  const date = emptyToNull(fd.get('txn_date'));
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Enter a valid date.' };

  const supabase = await createClient();
  const { error } = await supabase.from('inventory_transactions').insert({
    item_id: item, txn_type: type, quantity: qty, txn_date: date ?? undefined,
    employee_id: employee, department_id: emptyToNull(fd.get('department_id')), purpose,
    reference: emptyToNull(fd.get('reference')), from_location: emptyToNull(fd.get('from_location')), to_location: emptyToNull(fd.get('to_location')),
    performed_by: me.id,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath('/', 'layout');
  return { ok: true };
}
