'use client';

import { useState } from 'react';
import { Bell, Menu, Moon, Sun, LogOut, Search } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Sidebar } from './sidebar';
import { signOut } from '@/lib/actions/auth';
import { ROLE_LABELS, type Role } from '@/lib/permissions';

export function AppShell({ user, unread = 0, children }: { user: { full_name: string; email: string | null; role: Role }; unread?: number; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="app-root flex h-screen overflow-hidden">
      <aside className="no-print hidden lg:block"><Sidebar role={user.role} /></aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-64"><Sidebar role={user.role} onNavigate={() => setMobileOpen(false)} /></div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card px-4">
          <button className="rounded p-2 hover:bg-muted lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <form action="/search" role="search" className="relative hidden max-w-sm flex-1 sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input name="q" type="search" placeholder="Search tasks, tickets, assets, serials, invoices" aria-label="Global search" className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </form>
          <div className="flex-1" />
          <Link href="/search" className="rounded p-2 hover:bg-muted sm:hidden" aria-label="Search"><Search className="h-4 w-4" /></Link>
          <Link href="/notifications" className="relative rounded p-2 hover:bg-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <button className="rounded p-2 hover:bg-muted" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </button>
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-sm font-medium">{user.full_name || user.email}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
          </div>
          <form action={signOut}>
            <button className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted" type="submit">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </header>
        <main className="print-main flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
