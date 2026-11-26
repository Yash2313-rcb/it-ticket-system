'use client';

import { useActionState, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { createTicket, updateTicket, type ActionState } from '@/lib/actions/operations';
import { PRIORITY, TICKET_STATUS } from '@/lib/ops';

type Opt = { id: string; name: string };

export function RaiseTicketDialog({ categories, employees }: { categories: Opt[]; employees?: { id: string; emp_code: string; full_name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createTicket, {});
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      if (state.id) router.push(`/operations/tickets/${state.id}`);
    }
  }, [state, router]);

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Raise ticket</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Raise an IT ticket">
        <form action={action} className="space-y-4">
          <Field label="Issue title" htmlFor="k_title" required><Input id="k_title" name="title" placeholder="e.g. Printer in Stores not printing" required /></Field>
          <Field label="What is happening?" htmlFor="k_desc" required><Textarea id="k_desc" name="description" required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="k_cat" required>
              <Select id="k_cat" name="category_id" defaultValue="" required>
                <option value="" disabled>Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="k_prio">
              <Select id="k_prio" name="priority" defaultValue="medium">
                {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
          </div>
          {employees && (
            <Field label="Raised for employee" htmlFor="k_emp" hint="Choose the employee who reported the problem, if different from you.">
              <Select id="k_emp" name="employee_id" defaultValue="">
                <option value="">Not specified</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.emp_code} - {e.full_name}</option>)}
              </Select>
            </Field>
          )}
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Submitting...' : 'Submit ticket'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function TicketManageForm({
  ticket, staff, categories,
}: {
  ticket: { id: string; status: string; priority: string; assigned_to: string | null; category_id: string | null; resolution_details: string | null };
  staff: { id: string; full_name: string }[];
  categories: Opt[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateTicket, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={ticket.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="m_status">
          <Select id="m_status" name="status" defaultValue={ticket.status}>
            {Object.entries(TICKET_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="m_prio">
          <Select id="m_prio" name="priority" defaultValue={ticket.priority}>
            {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Assigned IT person" htmlFor="m_assign">
          <Select id="m_assign" name="assigned_to" defaultValue={ticket.assigned_to ?? ''}>
            <option value="">Unassigned</option>
            {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Category" htmlFor="m_cat">
          <Select id="m_cat" name="category_id" defaultValue={ticket.category_id ?? ''}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Resolution details" htmlFor="m_res" hint="Required when the status is Resolved or Closed.">
        <Textarea id="m_res" name="resolution_details" defaultValue={ticket.resolution_details ?? ''} />
      </Field>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-success">Ticket updated.</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Update ticket'}</Button>
    </form>
  );
}
