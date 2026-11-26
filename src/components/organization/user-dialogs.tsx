'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { UserPlus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { createUser, updateUser, type ActionState } from '@/lib/actions/organization';
import { ALL_ROLES, ROLE_LABELS, type Role } from '@/lib/permissions';

export function CreateUserDialog({ employees }: { employees: { id: string; emp_code: string; full_name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createUser, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);

  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Create user</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create user">
        <form action={action} className="space-y-4">
          <Field label="Full name" htmlFor="u_name" required><Input id="u_name" name="full_name" required /></Field>
          <Field label="Email" htmlFor="u_email" required><Input id="u_email" name="email" type="email" required /></Field>
          <Field label="Temporary password" htmlFor="u_pw" required hint="At least 8 characters. Share it with the user securely.">
            <Input id="u_pw" name="password" type="password" minLength={8} autoComplete="new-password" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="u_role" required>
              <Select id="u_role" name="role" defaultValue="employee">
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </Field>
            <Field label="Linked employee" htmlFor="u_emp" hint="Lets the user see their own assets and requests.">
              <Select id="u_emp" name="employee_id" defaultValue="">
                <option value="">Not linked</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.emp_code} - {e.full_name}</option>)}
              </Select>
            </Field>
          </div>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Creating...' : 'Create user'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function UserRowControls({ id, role, isActive, isSelf }: { id: string; role: Role; isActive: boolean; isSelf: boolean }) {
  const [r, setR] = useState<Role>(role);
  const [active, setActive] = useState(isActive);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (nextRole: Role, nextActive: boolean) => {
    setError(null);
    start(async () => {
      const res = await updateUser(id, nextRole, nextActive);
      if (res.error) { setError(res.error); setR(role); setActive(isActive); }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={r} disabled={pending || isSelf} aria-label="Role" className="h-8 w-44"
        onChange={(e) => { const v = e.target.value as Role; setR(v); save(v, active); }}
      >
        {ALL_ROLES.map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}
      </Select>
      <Button
        variant="outline" size="sm" disabled={pending || isSelf}
        onClick={() => { const v = !active; setActive(v); save(r, v); }}
      >
        {active ? 'Deactivate' : 'Reactivate'}
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
