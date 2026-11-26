'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { saveEmployee, setEmployeeStatus, type ActionState } from '@/lib/actions/organization';

type Employee = {
  id: string; emp_code: string; full_name: string; department_id: string | null; designation: string | null;
  email: string | null; phone: string | null; location: string | null; joining_date: string | null; status: string;
};

export function EmployeeDialog({ employee, departments }: { employee?: Employee; departments: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveEmployee, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);

  return (
    <>
      {employee ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${employee.full_name}`}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
      ) : (
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add employee</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={employee ? 'Edit employee' : 'Add employee'}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={employee?.id ?? ''} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee ID" htmlFor="emp_code" hint={employee ? undefined : 'Leave blank to generate automatically (EMP-0001).'}>
              <Input id="emp_code" name="emp_code" defaultValue={employee?.emp_code} readOnly={!!employee} />
            </Field>
            <Field label="Full name" htmlFor="full_name" required><Input id="full_name" name="full_name" defaultValue={employee?.full_name} required /></Field>
            <Field label="Department" htmlFor="department_id" required>
              <Select id="department_id" name="department_id" defaultValue={employee?.department_id ?? ''} required>
                <option value="" disabled>Select department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Designation" htmlFor="designation"><Input id="designation" name="designation" defaultValue={employee?.designation ?? ''} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={employee?.email ?? ''} /></Field>
            <Field label="Contact number" htmlFor="phone"><Input id="phone" name="phone" defaultValue={employee?.phone ?? ''} /></Field>
            <Field label="Location" htmlFor="location"><Input id="location" name="location" defaultValue={employee?.location ?? ''} placeholder="Plant / office / floor" /></Field>
            <Field label="Joining date" htmlFor="joining_date"><Input id="joining_date" name="joining_date" type="date" defaultValue={employee?.joining_date ?? ''} /></Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={employee?.status ?? 'active'}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save employee'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function EmployeeStatusButton({ id, name, status }: { id: string; name: string; status: string }) {
  const [pending, start] = useTransition();
  const next = status === 'active' ? 'inactive' : 'active';
  return (
    <Button
      variant="ghost" size="sm" disabled={pending}
      onClick={() => {
        if (next === 'inactive' && !confirm(`Mark ${name} as inactive? Their records and asset history are kept.`)) return;
        start(async () => { const r = await setEmployeeStatus(id, next); if (r.error) alert(r.error); });
      }}
    >
      {next === 'inactive' ? 'Deactivate' : 'Reactivate'}
    </Button>
  );
}
