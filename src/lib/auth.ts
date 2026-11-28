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

/** User id from the session cookie without a network call. Middleware has already verified the
 *  session with Supabase (getUser) and refreshed it on this request, and every database query below
 *  runs with this JWT, so row level security still decides what is returned. */
async function sessionUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const uid = await sessionUserId(supabase);
  if (!uid) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, employee_id')
    .eq('id', uid)
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
