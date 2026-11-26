import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/permissions';

export type SessionProfile = {
  id: string;
  email: string | null;
  full_name: string;
  role: Role;
  is_active: boolean;
  employee_id: string | null;
};

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, employee_id')
    .eq('id', user.id)
    .single();

  return (data as SessionProfile | null) ?? null;
});

export async function requireProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (!profile.is_active) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login?error=inactive');
  }
  return profile;
}

/** For server actions: returns the profile if the role is allowed, otherwise null. */
export async function profileWithRole(allowed: Role[]): Promise<SessionProfile | null> {
  const p = await getSessionProfile();
  if (!p || !p.is_active || !allowed.includes(p.role)) return null;
  return p;
}
