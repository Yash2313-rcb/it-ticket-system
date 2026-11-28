'use client';

import { useActionState, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import type { FormField } from '@/lib/modules/types';

export type DialogState = { ok?: boolean; error?: string; id?: string };

export function FormDialog({
  title, triggerLabel, icon = 'plus', variant = 'primary', size = 'md', fields, values, hidden, action,
  submitLabel = 'Save', intro, onDoneHref,
}: {
  title: string;
  triggerLabel: string;
  icon?: 'plus' | 'edit' | 'none';
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  fields: FormField[];
  values?: Record<string, any> | null;
  hidden?: Record<string, string>;
  action: (prev: DialogState, fd: FormData) => Promise<DialogState>;
  submitLabel?: string;
  intro?: string;
  onDoneHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DialogState, FormData>(action, {});
  const { toast } = useToast();
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      toast(submitLabel === 'Save' ? 'Saved.' : `${submitLabel}: done.`);
      if (onDoneHref) window.location.href = onDoneHref.replace('{id}', state.id ?? '');
    }
  }, [state, onDoneHref, toast, submitLabel]);

  const initial = (f: FormField) => {
    const v = values && f.name in values ? values[f.name] : f.default;
    return v === null || v === undefined ? '' : v;
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {icon === 'plus' && <Plus className="h-4 w-4" />}
        {icon === 'edit' && <Pencil className="h-3.5 w-3.5" />}
        {triggerLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <form action={formAction} className="space-y-4">
          {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
          {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `f_${f.name}`;
              const full = f.full || f.type === 'textarea';
              const v = initial(f);
              return (
                <Field key={f.name} label={f.label} htmlFor={id} required={f.required} hint={f.hint} className={full ? 'sm:col-span-2' : undefined}>
                  {f.type === 'textarea' ? (
                    <Textarea id={id} name={f.name} defaultValue={String(v)} required={f.required} placeholder={f.placeholder} />
                  ) : f.type === 'select' ? (
                    <Select id={id} name={f.name} defaultValue={String(v)} required={f.required}>
                      {!f.required && <option value="">Not set</option>}
                      {f.required && v === '' && <option value="" disabled>Select</option>}
                      {(f.options ?? []).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </Select>
                  ) : f.type === 'file' ? (
                    <Input id={id} name={f.name} type="file" required={f.required} className="h-auto py-1.5" />
                  ) : f.type === 'checkbox' ? (
                    <label className="flex h-9 items-center gap-2 text-sm"><input id={id} type="checkbox" name={f.name} defaultChecked={!!v} className="h-4 w-4" /> Yes</label>
                  ) : (
                    <Input
                      id={id} name={f.name} defaultValue={String(v)} required={f.required} placeholder={f.placeholder}
                      type={f.type === 'money' || f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                      step={f.type === 'money' ? '0.01' : f.type === 'number' ? 'any' : undefined}
                      min={f.type === 'money' ? 0 : undefined}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Saving...' : submitLabel}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
