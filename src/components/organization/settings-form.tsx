'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { saveSettings, type ActionState } from '@/lib/actions/organization';

export function SettingsForm({ organizationName, canEdit }: { organizationName: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSettings, {});
  return (
    <form action={action} className="max-w-md space-y-4">
      <Field label="Organization name" htmlFor="organization_name" hint="Printed on reports, handover receipts and QR labels.">
        <Input id="organization_name" name="organization_name" defaultValue={organizationName} disabled={!canEdit} required />
      </Field>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-success">Settings saved.</p>}
      {canEdit && <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save settings'}</Button>}
    </form>
  );
}
