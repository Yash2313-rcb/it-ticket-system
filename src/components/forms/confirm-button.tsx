'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function ConfirmButton({
  label, confirmText, action, variant = 'outline', size = 'sm',
}: {
  label: string; confirmText?: string; variant?: 'primary' | 'outline' | 'ghost' | 'destructive'; size?: 'sm' | 'md';
  action: () => Promise<{ ok?: boolean; error?: string }>;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant} size={size} disabled={pending}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(async () => { const r = await action(); if (r.error) alert(r.error); });
      }}
    >
      {pending ? 'Working...' : label}
    </Button>
  );
}

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return <Button variant="outline" onClick={() => window.print()} className="no-print">{label}</Button>;
}
