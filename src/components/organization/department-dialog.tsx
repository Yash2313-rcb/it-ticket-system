'use client';

import { useActionState, useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { saveDepartment, type ActionState } from '@/lib/actions/organization';

type Dept = { id: string; code: string; name: string; description: string | null; is_active: boolean };

export function DepartmentDialog({ department }: { department?: Dept }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveDepartment, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);

  return (
    <>
      {department ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${department.name}`}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
      ) : (
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add department</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={department ? 'Edit department' : 'Add department'}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={department?.id ?? ''} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Code" htmlFor="code" required><Input id="code" name="code" defaultValue={department?.code} maxLength={12} required /></Field>
            <Field label="Name" htmlFor="name" required className="sm:col-span-2"><Input id="name" name="name" defaultValue={department?.name} required /></Field>
          </div>
          <Field label="Description" htmlFor="description"><Textarea id="description" name="description" defaultValue={department?.description ?? ''} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={department?.is_active ?? true} className="h-4 w-4" /> Active
          </label>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save department'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
