import { Server } from 'lucide-react';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <Server className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold">{process.env.NEXT_PUBLIC_APP_NAME ?? 'IT Operations Platform'}</h1>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 font-semibold">Sign in</h2>
          {sp.error === 'inactive' && (
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">This account is deactivated. Contact the IT administrator.</p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
