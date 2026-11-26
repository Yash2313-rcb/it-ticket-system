import Link from 'next/link';

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const link = 'rounded-md border px-3 py-1.5 text-sm hover:bg-muted';
  const off = 'pointer-events-none opacity-40';
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>{total === 0 ? 'No records' : `${from}-${to} of ${total}`}</span>
      <div className="flex gap-2">
        <Link href={href(page - 1)} className={`${link} ${page <= 1 ? off : ''}`} aria-disabled={page <= 1}>Previous</Link>
        <Link href={href(page + 1)} className={`${link} ${page >= pages ? off : ''}`} aria-disabled={page >= pages}>Next</Link>
      </div>
    </div>
  );
}
