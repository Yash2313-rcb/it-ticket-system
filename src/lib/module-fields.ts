import 'server-only';
import { MODULES } from '@/lib/modules/registry';
import type { FormField } from '@/lib/modules/types';
import type { Role } from '@/lib/permissions';

export async function refOptions(supabase: any, table: string, label: string, where?: [string, string]): Promise<[string, string][]> {
  const cols = label.split(',');
  let q = supabase.from(table).select(`id, ${cols.join(', ')}`).order(cols[0]).limit(1000);
  if (where) q = q.eq(where[0], where[1] === 'true' ? true : where[1]);
  const { data } = await q;
  return (data ?? []).map((r: any): [string, string] => [r.id, cols.map((c) => r[c]).filter(Boolean).join(' - ') || r.id]);
}

/** Form fields for a registry module, with reference lists loaded (for pages that open the same form outside ModulePage). */
export async function moduleFormFields(supabase: any, key: string, role: Role, mode: 'create' | 'edit'): Promise<FormField[]> {
  const cfg = MODULES[key];
  const fields = cfg.fields.filter((f) => (!f.roles || f.roles.includes(role)) && (mode === 'edit' ? !f.readOnlyOnEdit : !f.editOnly));
  return Promise.all(fields.map(async (f): Promise<FormField> => ({
    name: f.name, label: f.label, type: f.type, required: f.required, hint: f.hint, full: f.full, placeholder: f.placeholder, default: f.default,
    options: f.ref ? await refOptions(supabase, f.ref.table, f.ref.label, f.ref.where) : f.options,
  })));
}
