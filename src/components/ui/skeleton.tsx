import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="animate-fade-in">
      <div className="mb-6 space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-72" /></div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="rounded-lg border bg-card p-4">
        <Skeleton className="mb-4 h-9 w-64" />
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="mb-2 h-10 w-full" />)}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
