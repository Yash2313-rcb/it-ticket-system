import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  success: 'bg-success/15 text-success ring-success/30',
  warning: 'bg-warning/15 text-warning ring-warning/30',
  danger: 'bg-destructive/15 text-destructive ring-destructive/30',
  info: 'bg-primary/15 text-primary ring-primary/30',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}
