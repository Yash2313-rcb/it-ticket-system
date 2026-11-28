'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Menu, Moon, Sun, LogOut, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sidebar } from './sidebar';
import { signOut } from '@/lib/actions/auth';
import { ROLE_LABELS, type Role } from '@/lib/permissions';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export function AppShell({ user, unread = 0, children }: { user: { full_name: string; email: string | null; role: Role }; unread?: number; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Close the mobile menu after navigating, and start each page at the top.
  useEffect(() => { setMobileOpen(false); mainRef.current?.scrollTo({ top: 0 }); }, [pathname]);

  // "/" focuses search, Esc closes the mobile menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-root flex h-screen overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <aside className="no-print hidden lg:block"><Sidebar role={user.role} /></aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-64 animate-slide-up"><Sidebar role={user.role} onNavigate={() => setMobileOpen(false)} /></div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card/90 px-4 backdrop-blur">
          <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <form action="/search" role="search" className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input ref={searchRef} name="q" type="search" placeholder="Search tasks, tickets, assets, serials, invoices" aria-label="Global search" className="h-9 w-full rounded-md border bg-background pl-8 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <kbd className="pointer-events-none absolute right-2 top-2 hidden rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground md:block">/</kbd>
          </form>
          <div className="flex-1" />
          <Link href="/search" className="rounded-md p-2 hover:bg-muted sm:hidden" aria-label="Search"><Search className="h-4 w-4" /></Link>
          <Link href="/notifications" className="relative rounded-md p-2 hover:bg-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <button className="rounded-md p-2 hover:bg-muted" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </button>
          <div className="ml-1 flex items-center gap-2.5 border-l pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden="true">{initials(user.full_name || user.email || '')}</div>
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{user.full_name || user.email}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
            </div>
            <form action={signOut}>
              <button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted" type="submit" aria-label="Sign out">
                <LogOut className="h-4 w-4" /> <span className="hidden md:inline">Sign out</span>
              </button>
            </form>
          </div>
        </header>
        <main id="main" ref={mainRef} className="print-main flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1400px]">{children}</div></main>
      </div>
    </div>
  );
}
