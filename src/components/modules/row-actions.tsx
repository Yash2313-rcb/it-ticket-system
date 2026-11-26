'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { runRowAction } from '@/lib/actions/modules';

export function RowActionButton({ configKey, actionKey, id, label, confirmText }: { configKey: string; actionKey: string; id: string; label: string; confirmText?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline" size="sm" disabled={pending}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(async () => {
          const r = await runRowAction(configKey, actionKey, id);
          if (r.error) alert(r.error);
          else if (configKey === 'purchase_requests' && r.id) window.location.href = `/procurement/orders/${r.id}`;
        });
      }}
    >
      {pending ? 'Working...' : label}
    </Button>
  );
}
