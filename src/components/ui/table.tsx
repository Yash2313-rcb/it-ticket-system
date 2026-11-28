import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="max-h-[70vh] w-full overflow-auto">
      <table className={cn('data-table w-full text-sm', className)} {...props} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground" {...p} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y" {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn('transition-colors hover:bg-muted/50', className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn('whitespace-nowrap bg-muted px-4 py-2.5 font-semibold', className)} {...p} />;
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-4 py-3 align-middle', className)} {...p} />;

/** Column header that sorts the list when clicked (state lives in the URL, so it survives refresh and sharing). */
export function SortTH({ label, href, active, dir }: { label: string; href: string; active: boolean; dir: 'asc' | 'desc' }) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TH aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link href={href} prefetch={false} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
        {label}<Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
      </Link>
    </TH>
  );
}
