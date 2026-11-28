'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILT_PHASE, NAV } from './nav-config';
import type { Role } from '@/lib/permissions';

export function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visible = NAV.filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.href || g.items.length > 0);

  const activeGroup = visible.find((g) => g.items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/')))?.label;
  const [open, setOpen] = useState<Record<string, boolean>>(activeGroup ? { [activeGroup]: true } : {});
  // Keep the section you are working in open when you navigate (e.g. via search or a link).
  useEffect(() => { if (activeGroup) setOpen((o) => (o[activeGroup] ? o : { ...o, [activeGroup]: true })); }, [activeGroup]);

  return (
    <nav className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground" aria-label="Main navigation">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
        <Server className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold">{process.env.NEXT_PUBLIC_APP_NAME ?? 'IT Operations'}</span>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {visible.map((g) => {
          const Icon = g.icon;
          if (g.href) {
            const active = pathname === g.href;
            return (
              <li key={g.label}>
                <Link href={g.href} onClick={onNavigate} className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-active', active && 'bg-sidebar-active font-medium text-white shadow-[inset_3px_0_0_hsl(var(--primary))]')}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {g.label}
                </Link>
              </li>
            );
          }
          const isOpen = !!open[g.label];
          return (
            <li key={g.label}>
              <button onClick={() => setOpen((o) => ({ ...o, [g.label]: !isOpen }))} aria-expanded={isOpen} className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-active', activeGroup === g.label && 'text-white')}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{g.label}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-sidebar-muted transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <ul className="ml-[22px] mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                  {g.items.map((i) => {
                    const active = pathname === i.href;
                    return (
                      <li key={i.href}>
                        <Link href={i.href} onClick={onNavigate} className={cn('flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-white', active && 'bg-sidebar-active font-medium text-white')}>
                          {i.label}
                          {i.phase > BUILT_PHASE && <span className="text-[10px] text-sidebar-muted">P{i.phase}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
