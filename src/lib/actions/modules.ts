'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { emptyToNull } from '@/lib/utils';
import { MODULES } from '@/lib/modules/registry';
import { friendlyDbError } from '@/lib/db-error';

export type ActionState = { ok?: boolean; error?: string; id?: string };

const DENIED = 'You do not have permission to do this.';

export async function saveRecord(key: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getSessionProfile();
  const cfg = MODULES[key];
  if (!me || !me.is_active || !cfg) return { error: DENIED };

  const id = emptyToNull(fd.get('id'));
  const allowed = id ? cfg.writeRoles : cfg.createRoles ?? cfg.writeRoles;
  if (!allowed.includes(me.role)) return { error: DENIED };

  const v: Record<string, any> = {};
  for (const f of cfg.fields) {
    if (f.roles && !f.roles.includes(me.role)) continue;
    if (id && f.readOnlyOnEdit) continue;
    if (!id && f.editOnly) continue;

    const raw = fd.get(f.name);
    if (f.type === 'checkbox') { v[f.name] = raw === 'on'; continue; }
    const s = emptyToNull(raw);
    if (s === null) {
      if (f.required) return { error: `Enter ${f.label.toLowerCase()}.` };
      if (f.type !== 'select') v[f.name] = null; // blank optional selects keep the column default
      else if (f.ref || !f.required) v[f.name] = f.ref ? null : undefined;
      if (v[f.name] === undefined) delete v[f.name];
      continue;
    }
    if (f.type === 'number' || f.type === 'money') {
      if (!/^-?\d+(\.\d+)?$/.test(s)) return { error: `${f.label} must be a number.` };
      const n = Number(s);
      const min = f.min ?? (f.type === 'money' ? 0 : undefined);
      if (min !== undefined && n < min) return { error: `${f.label} cannot be less than ${min}.` };
      v[f.name] = n;
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: `Enter a valid ${f.label.toLowerCase()}.` };
      v[f.name] = s;
    } else if (f.type === 'email') {
      if (!z.string().email().safeParse(s).success) return { error: 'Enter a valid email address.' };
      v[f.name] = s;
    } else if (f.type === 'select') {
      if (f.ref) {
        if (!z.string().uuid().safeParse(s).success) return { error: `Select a valid ${f.label.toLowerCase()}.` };
      } else if (f.name === 'month' ? !/^(?:[1-9]|1[0-2])$/.test(s) : !(f.options ?? []).some(([val]) => val === s)) {
        return { error: `Select a valid ${f.label.toLowerCase()}.` };
      }
      v[f.name] = f.name === 'month' ? Number(s) : s;
    } else {
      if (s.length > (f.type === 'textarea' ? 4000 : 500)) return { error: `${f.label} is too long.` };
      v[f.name] = s;
    }
  }

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from(cfg.table).update(v).eq('id', id).select('id');
    if (error) return { error: friendlyDbError(error.message) };
    if (!data?.length) return { error: DENIED };
  } else {
    if (cfg.codeField) v[cfg.codeField] = '';
    if (cfg.stampCreator) v[cfg.stampCreator] = me.id;
    if (cfg.beforeInsert) await cfg.beforeInsert(v, { meId: me.id, employeeId: me.employee_id, supabase });
    const { data, error } = await supabase.from(cfg.table).insert(v).select('id').single();
    if (error) return { error: friendlyDbError(error.message) };
    revalidatePath('/', 'layout');
    return { ok: true, id: data?.id };
  }
  revalidatePath('/', 'layout');
  return { ok: true, id };
}

export async function runRowAction(key: string, actionKey: string, id: string, _prev?: ActionState, fd?: FormData): Promise<ActionState> {
  const me = await getSessionProfile();
  if (!me || !me.is_active) return { error: DENIED };
  const cfg = MODULES[key];
  const act = cfg?.rowActions?.find((a) => a.key === actionKey);
  if (!cfg || !act || !act.roles.includes(me.role)) return { error: DENIED };
  const supabase = await createClient();

  if (key === 'purchase_requests' && actionKey === 'convert') {
    const { data, error } = await supabase.rpc('convert_request_to_po', { p_request: id });
    if (error) return { error: friendlyDbError(error.message) };
    revalidatePath('/', 'layout');
    return { ok: true, id: data as string };
  }
  if (key === 'maintenance_schedules' && actionKey === 'complete') {
    const cost = emptyToNull(fd?.get('cost') ?? null);
    if (cost !== null && !/^\d+(\.\d+)?$/.test(cost)) return { error: 'Cost must be a number.' };
    const { error } = await supabase.rpc('maintenance_complete', { p_id: id, p_cost: cost ? Number(cost) : 0, p_remarks: emptyToNull(fd?.get('remarks') ?? null) });
    if (error) return { error: friendlyDbError(error.message) };
    revalidatePath('/', 'layout');
    return { ok: true };
  }
  return { error: 'Unknown action.' };
}
