import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { ToastProvider } from '@/components/ui/toast';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // Profile and unread count are independent, so fetch them together instead of one after the other.
  const [profile, { count }] = await Promise.all([
    requireProfile(),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ]);
  return (
    <ToastProvider>
      <AppShell user={{ full_name: profile.full_name, email: profile.email, role: profile.role }} unread={count ?? 0}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
