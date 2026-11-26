import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  // Returns 0 until the Phase 2+ migrations are applied (the query simply fails and is ignored).
  const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false);
  return (
    <AppShell user={{ full_name: profile.full_name, email: profile.email, role: profile.role }} unread={count ?? 0}>
      {children}
    </AppShell>
  );
}
