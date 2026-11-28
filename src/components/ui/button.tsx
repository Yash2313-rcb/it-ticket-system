import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-[0.98]',
  outline: 'border bg-card shadow-sm hover:bg-muted active:scale-[0.98]',
  ghost: 'hover:bg-muted',
  destructive: 'bg-destructive text-white shadow-sm hover:opacity-90 active:scale-[0.98]',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-9 px-4 text-sm', icon: 'h-9 w-9' };

/** Class string for links that should look like buttons (e.g. download links). */
export const buttonClass = (variant: Variant = 'outline', size: Size = 'md', extra?: string) =>
  cn('inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', variants[variant], sizes[size], extra);

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(buttonClass(variant, size), 'disabled:pointer-events-none disabled:opacity-50', className)}
    {...props}
  />
));
Button.displayName = 'Button';
