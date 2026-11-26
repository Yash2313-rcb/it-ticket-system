'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { profileWithRole } from '@/lib/auth';
import { emptyToNull } from '@/lib/utils';
import type { ActionState } from '@/lib/actions/modules';
import { friendlyDbError } from '@/lib/db-error';

const ADMINS = ['super_admin', 'it_admin'] as const;
const DENIED = 'You do not have permission to do this.';
const uuidN = z.string().uuid().nullable();
const num = (s: string | null, label: string, min = 0): number | string => {
  if (s === null) return 0;
  if (!/^\d+(\.\d+)?$/.test(s)) return `${label} must be a number.`;
  const n = Number(s);
  return n < min ? `${label} cannot be less than ${min}.` : n;
};
const done = () => revalidatePath('/', 'layout');

// ----------------------------------------------------------- purchase orders
export async function savePO(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await profileWithRole([...ADMINS]);
  if (!me) return { error: DENIED };
  const id = emptyToNull(fd.get('id'));
  const parsed = z.object({
    vendor_id: uuidN, department_id: uuidN, expense_category: z.string().nullable(), delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    payment_terms: z.string().nullable(), notes: z.string().nullable(),
  }).safeParse({
    vendor_id: emptyToNull(fd.get('vendor_id')), department_id: emptyToNull(fd.get('department_id')), expense_category: emptyToNull(fd.get('expense_category')),
    delivery_date: emptyToNull(fd.get('delivery_date')), payment_terms: emptyToNull(fd.get('payment_terms')), notes: emptyToNull(fd.get('notes')),
  });
  if (!parsed.success) return { error: 'Check the order details (delivery date format, selections).' };
  const discount = num(emptyToNull(fd.get('discount')), 'Discount');
  const tax = num(emptyToNull(fd.get('tax_rate')), 'GST rate');
  const ship = num(emptyToNull(fd.get('shipping_charges')), 'Shipping charges');
  for (const x of [discount, tax, ship]) if (typeof x === 'string') return { error: x };
  if ((tax as number) > 100) return { error: 'GST rate cannot exceed 100.' };

  const values = { ...parsed.data, discount, tax_rate: tax, shipping_charges: ship };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from('purchase_orders').update(values).eq('id', id).select('id');
    if (error) return { error: friendlyDbError(error.message) };
    if (!data?.length) return { error: 'Only draft purchase orders can be edited.' };
    done();
    return { ok: true, id };
  }
  const { data, error } = await supabase.from('purchase_orders').insert({ ...values, po_number: '', created_by: me.id }).select('id').single();
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true, id: data?.id };
}

export async function addPOItem(poId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await profileWithRole([...ADMINS]))) return { error: DENIED };
  const description = emptyToNull(fd.get('description'));
  if (!description) return { error: 'Enter the item description.' };
  const qty = num(emptyToNull(fd.get('quantity')), 'Quantity', 0.01);
  const price = num(emptyToNull(fd.get('unit_price')), 'Unit price');
  for (const x of [qty, price]) if (typeof x === 'string') return { error: x };
  if (qty === 0) return { error: 'Enter the quantity.' };
  const receiveAs = String(fd.get('receive_as') ?? 'none');
  if (!['none', 'inventory', 'asset'].includes(receiveAs)) return { error: 'Invalid receiving option.' };
  const inv = emptyToNull(fd.get('inventory_item_id'));
  const cat = emptyToNull(fd.get('asset_category_id'));
  if (receiveAs === 'inventory' && !inv) return { error: 'Select the stock item that this will be added to.' };
  if (receiveAs === 'asset' && !cat) return { error: 'Select the asset category for the new assets.' };

  const supabase = await createClient();
  const { error } = await supabase.from('purchase_order_items').insert({
    po_id: poId, description, quantity: qty, unit_price: price, receive_as: receiveAs,
    inventory_item_id: receiveAs === 'inventory' ? inv : null, asset_category_id: receiveAs === 'asset' ? cat : null,
  });
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

export async function deletePOItem(itemId: string): Promise<ActionState> {
  if (!(await profileWithRole([...ADMINS]))) return { error: DENIED };
  const supabase = await createClient();
  const { error } = await supabase.from('purchase_order_items').delete().eq('id', itemId);
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

export async function setPOStatus(poId: string, status: string): Promise<ActionState> {
  if (!(await profileWithRole([...ADMINS]))) return { error: DENIED };
  const supabase = await createClient();
  const { error } = await supabase.rpc('po_set_status', { p_po: poId, p_status: status });
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

export async function receiveLine(itemId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await profileWithRole([...ADMINS]))) return { error: DENIED };
  const qty = num(emptyToNull(fd.get('quantity')), 'Quantity', 0.01);
  if (typeof qty === 'string') return { error: qty };
  const supabase = await createClient();
  const { error } = await supabase.rpc('receive_po_line', { p_item: itemId, p_qty: qty, p_invoice: emptyToNull(fd.get('invoice_number')), p_notes: emptyToNull(fd.get('notes')) });
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

// ------------------------------------------------------------------- bills
export async function saveBill(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await profileWithRole([...ADMINS]);
  if (!me) return { error: DENIED };
  const id = emptyToNull(fd.get('id'));
  const vendor = emptyToNull(fd.get('vendor_id'));
  const invoice = emptyToNull(fd.get('invoice_number'));
  if (!vendor) return { error: 'Select the vendor.' };
  if (!invoice) return { error: 'Enter the invoice number.' };
  const date = emptyToNull(fd.get('invoice_date'));
  const due = emptyToNull(fd.get('due_date'));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Enter the invoice date.' };
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'Enter a valid due date.' };
  if (due && due < date) return { error: 'The due date cannot be before the invoice date.' };
  const subtotal = num(emptyToNull(fd.get('subtotal')), 'Subtotal');
  const discount = num(emptyToNull(fd.get('discount')), 'Discount');
  const other = num(emptyToNull(fd.get('other_charges')), 'Other charges');
  const rate = num(emptyToNull(fd.get('gst_rate')), 'GST rate');
  for (const x of [subtotal, discount, other, rate]) if (typeof x === 'string') return { error: x };
  if ((discount as number) > (subtotal as number)) return { error: 'Discount cannot exceed the subtotal.' };
  const treatment = String(fd.get('tax_treatment') ?? 'intra_state');
  if (!['intra_state', 'inter_state', 'exempt'].includes(treatment)) return { error: 'Select a GST treatment.' };

  const values = {
    vendor_id: vendor, invoice_number: invoice, invoice_date: date, due_date: due, po_id: emptyToNull(fd.get('po_id')),
    description: emptyToNull(fd.get('description')), subtotal, discount, other_charges: other, gst_rate: rate, tax_treatment: treatment, notes: emptyToNull(fd.get('notes')),
  };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from('vendor_bills').update(values).eq('id', id).select('id');
    if (error) return { error: friendlyDbError(error.message) };
    if (!data?.length) return { error: DENIED };
    done();
    return { ok: true, id };
  }
  const { data, error } = await supabase.from('vendor_bills').insert({ ...values, bill_code: '', created_by: me.id }).select('id').single();
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true, id: data?.id };
}

export async function addPayment(billId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await profileWithRole([...ADMINS]);
  if (!me) return { error: DENIED };
  const amount = num(emptyToNull(fd.get('amount')), 'Amount', 0.01);
  if (typeof amount === 'string') return { error: amount };
  if (amount === 0) return { error: 'Enter the payment amount.' };
  const date = emptyToNull(fd.get('payment_date'));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Enter the payment date.' };
  const mode = String(fd.get('mode') ?? 'bank_transfer');
  const supabase = await createClient();
  const { error } = await supabase.from('vendor_payments').insert({
    bill_id: billId, payment_date: date, amount, mode, reference: emptyToNull(fd.get('reference')), remarks: emptyToNull(fd.get('remarks')), created_by: me.id,
  });
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}

export async function cancelBill(billId: string): Promise<ActionState> {
  if (!(await profileWithRole([...ADMINS]))) return { error: DENIED };
  const supabase = await createClient();
  const { count } = await supabase.from('vendor_payments').select('*', { count: 'exact', head: true }).eq('bill_id', billId);
  if ((count ?? 0) > 0) return { error: 'A bill with payments cannot be cancelled.' };
  const { error } = await supabase.from('vendor_bills').update({ status: 'cancelled' }).eq('id', billId);
  if (error) return { error: friendlyDbError(error.message) };
  done();
  return { ok: true };
}
