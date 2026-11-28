import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function windowed(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const box = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm';
  const off = 'pointer-events-none opacity-40';
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>{total === 0 ? 'No records' : `Showing ${from}-${to} of ${total.toLocaleString('en-IN')}`}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Link href={href(current - 1)} aria-label="Previous page" aria-disabled={current <= 1} tabIndex={current <= 1 ? -1 : undefined} className={cn(box, 'hover:bg-muted', current <= 1 && off)}><ChevronLeft className="h-4 w-4" /></Link>
          {windowed(current, pages).map((n, i) => n === '…'
            ? <span key={`gap${i}`} className="px-1">…</span>
            : <Link key={n} href={href(n)} aria-current={n === current ? 'page' : undefined} className={cn(box, n === current ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{n}</Link>)}
          <Link href={href(current + 1)} aria-label="Next page" aria-disabled={current >= pages} tabIndex={current >= pages ? -1 : undefined} className={cn(box, 'hover:bg-muted', current >= pages && off)}><ChevronRight className="h-4 w-4" /></Link>
        </div>
      )}
    </nav>
  );
}
