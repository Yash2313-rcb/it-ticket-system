'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { profileWithRole } from '@/lib/auth';
import { emptyToNull } from '@/lib/utils';
import { ALL_ROLES, type Role } from '@/lib/permissions';

export type ActionState = { ok?: boolean; error?: string };

const ADMINS: Role[] = ['super_admin', 'it_admin'];
const dbError = (msg: string) => {
  if (msg.includes('duplicate key')) return 'That code, name or email already exists.';
  if (msg.includes('foreign key')) return 'This record is still in use elsewhere.';
  if (msg.includes('row-level security')) return 'You do not have permission to do this.';
  return msg;
};

// ---------------- departments ----------------
const departmentSchema = z.object({
  id: z.string().uuid().nullable(),
  code: z.string().trim().min(1, 'Enter a department code').max(12).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2, 'Enter the department name').max(80),
  description: z.string().nullable(),
  is_active: z.boolean(),
});

export async function saveDepartment(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await profileWithRole(ADMINS))) return { error: 'You do not have permission to do this.' };
  const parsed = departmentSchema.safeParse({
    id: emptyToNull(fd.get('id')),
    code: fd.get('code') ?? '',
    name: fd.get('name') ?? '',
    description: emptyToNull(fd.get('description')),
    is_active: fd.get('is_active') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('departments').update(values).eq('id', id)
    : await supabase.from('departments').insert(values);
  if (error) return { error: dbError(error.message) };

  revalidatePath('/organization/departments');
  revalidatePath('/organization/employees');
  return { ok: true };
}

// ---------------- employees ----------------
const employeeSchema = z.object({
  id: z.string().uuid().nullable(),
  emp_code: z.string().nullable(),
  full_name: z.string().trim().min(2, 'Enter the employee name').max(120),
  department_id: z.string().uuid('Select a department'),
  designation: z.string().nullable(),
  email: z.string().email('Enter a valid email address').nullable(),
  phone: z.string().regex(/^[0-9+\-\s()]{7,15}$/, 'Enter a valid phone number').nullable(),
  location: z.string().nullable(),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid joining date').nullable(),
  status: z.enum(['active', 'inactive']),
});

export async function saveEmployee(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await profileWithRole(ADMINS))) return { error: 'You do not have permission to do this.' };
  const parsed = employeeSchema.safeParse({
    id: emptyToNull(fd.get('id')),
    emp_code: emptyToNull(fd.get('emp_code')),
    full_name: fd.get('full_name') ?? '',
    department_id: fd.get('department_id') ?? '',
    designation: emptyToNull(fd.get('designation')),
    email: emptyToNull(fd.get('email')),
    phone: emptyToNull(fd.get('phone')),
    location: emptyToNull(fd.get('location')),
    joining_date: emptyToNull(fd.get('joining_date')),
    status: fd.get('status') ?? 'active',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, emp_code, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('employees').update(rest).eq('id', id) // emp_code is immutable once issued
    : await supabase.from('employees').insert({ ...rest, emp_code: emp_code ?? '' }); // blank -> trigger generates EMP-0001
  if (error) return { error: dbError(error.message) };

  revalidatePath('/organization/employees');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setEmployeeStatus(id: string, status: 'active' | 'inactive'): Promise<ActionState> {
  if (!(await profileWithRole(ADMINS))) return { error: 'You do not have permission to do this.' };
  const supabase = await createClient();
  const { error } = await supabase.from('employees').update({ status }).eq('id', id);
  if (error) return { error: dbError(error.message) };
  revalidatePath('/organization/employees');
  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------- users (super admin only) ----------------
const createUserSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the full name'),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(ALL_ROLES as [Role, ...Role[]]),
  employee_id: z.string().uuid().nullable(),
});

export async function createUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await profileWithRole(['super_admin']))) return { error: 'Only a Super Admin can create users.' };
  const parsed = createUserSchema.safeParse({
    full_name: fd.get('full_name') ?? '',
    email: fd.get('email') ?? '',
    password: fd.get('password') ?? '',
    role: fd.get('role') ?? 'employee',
    employee_id: emptyToNull(fd.get('employee_id')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });
  if (error || !data.user) return { error: error?.message ?? 'Could not create the user.' };

  // The signup trigger created the profile as 'employee'; apply the chosen role and employee link.
  const { error: pErr } = await admin
    .from('profiles')
    .update({ role: parsed.data.role, employee_id: parsed.data.employee_id, full_name: parsed.data.full_name })
    .eq('id', data.user.id);
  if (pErr) return { error: `User created but role could not be set: ${pErr.message}` };

  revalidatePath('/organization/users');
  return { ok: true };
}

export async function updateUser(id: string, role: Role, is_active: boolean): Promise<ActionState> {
  const me = await profileWithRole(['super_admin']);
  if (!me) return { error: 'Only a Super Admin can change users.' };
  if (!ALL_ROLES.includes(role)) return { error: 'Invalid role.' };
  if (me.id === id && (role !== 'super_admin' || !is_active)) {
    return { error: 'You cannot remove your own Super Admin access or deactivate yourself.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role, is_active }).eq('id', id);
  if (error) return { error: dbError(error.message) };
  revalidatePath('/organization/users');
  return { ok: true };
}

// ---------------- settings ----------------
export async function saveSettings(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await profileWithRole(['super_admin']))) return { error: 'Only a Super Admin can change settings.' };
  const name = String(fd.get('organization_name') ?? '').trim();
  if (name.length < 2) return { error: 'Enter the organization name.' };
  const supabase = await createClient();
  const { error } = await supabase.from('system_settings').update({ value: name, updated_at: new Date().toISOString() }).eq('key', 'organization_name');
  if (error) return { error: dbError(error.message) };
  revalidatePath('/settings');
  return { ok: true };
}
