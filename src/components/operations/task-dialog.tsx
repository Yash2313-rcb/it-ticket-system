'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { saveTask, setTaskStatus, type ActionState } from '@/lib/actions/operations';
import { PRIORITY, TASK_STATUS } from '@/lib/ops';

type Opt = { id: string; name: string };
type Person = { id: string; full_name: string };

export type TaskRow = {
  id: string; title: string; description: string | null; category_id: string | null; task_date: string;
  start_time: string | null; end_time: string | null; assigned_by: string | null; performed_by: string | null;
  department_id: string | null; priority: string; status: string; time_spent_minutes: number | null;
  ticket_id: string | null; remarks: string | null;
};

export function TaskDialog({
  task, categories, departments, staff, tickets, currentUserId, lockSelf, today,
}: {
  task?: TaskRow; categories: Opt[]; departments: Opt[]; staff: Person[];
  tickets: { id: string; ticket_code: string; title: string }[];
  currentUserId: string; lockSelf: boolean; today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTask, {});
  useEffect(() => { if (state.ok) setOpen(false); }, [state]);

  return (
    <>
      {task ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit task</Button>
      ) : (
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add task</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={task ? 'Edit task' : 'Add task'}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={task?.id ?? ''} />
          <Field label="Task title" htmlFor="t_title" required><Input id="t_title" name="title" defaultValue={task?.title} required /></Field>
          <Field label="Description" htmlFor="t_desc"><Textarea id="t_desc" name="description" defaultValue={task?.description ?? ''} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="t_cat">
              <Select id="t_cat" name="category_id" defaultValue={task?.category_id ?? ''}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Task date" htmlFor="t_date" required><Input id="t_date" name="task_date" type="date" defaultValue={task?.task_date ?? today} required /></Field>
            <Field label="Start time" htmlFor="t_start"><Input id="t_start" name="start_time" type="time" defaultValue={task?.start_time?.slice(0, 5) ?? ''} /></Field>
            <Field label="End time" htmlFor="t_end"><Input id="t_end" name="end_time" type="time" defaultValue={task?.end_time?.slice(0, 5) ?? ''} /></Field>
            <Field label="Assigned by" htmlFor="t_by">
              <Select id="t_by" name="assigned_by" defaultValue={task?.assigned_by ?? currentUserId}>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Performed by" htmlFor="t_perf" hint={lockSelf ? 'Team members record their own work.' : undefined}>
              <Select id="t_perf" name="performed_by" defaultValue={task?.performed_by ?? currentUserId} disabled={lockSelf}>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Department served" htmlFor="t_dept">
              <Select id="t_dept" name="department_id" defaultValue={task?.department_id ?? ''}>
                <option value="">Not specified</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Related ticket" htmlFor="t_ticket">
              <Select id="t_ticket" name="ticket_id" defaultValue={task?.ticket_id ?? ''}>
                <option value="">None</option>
                {tickets.map((k) => <option key={k.id} value={k.id}>{k.ticket_code} - {k.title.slice(0, 40)}</option>)}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="t_prio">
              <Select id="t_prio" name="priority" defaultValue={task?.priority ?? 'medium'}>
                {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Status" htmlFor="t_status">
              <Select id="t_status" name="status" defaultValue={task?.status ?? 'pending'}>
                {Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Time spent (minutes)" htmlFor="t_spent" hint="Leave blank to calculate from start and end time.">
              <Input id="t_spent" name="time_spent_minutes" type="number" min={0} defaultValue={task?.time_spent_minutes ?? ''} />
            </Field>
          </div>
          <Field label="Remarks" htmlFor="t_rem"><Textarea id="t_rem" name="remarks" defaultValue={task?.remarks ?? ''} /></Field>
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save task'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function TaskStatusSelect({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Task status" className="h-8 w-36" value={value} disabled={pending}
      onChange={(e) => {
        const prev = value;
        const next = e.target.value;
        setValue(next);
        start(async () => {
          const r = await setTaskStatus(id, next);
          if (r.error) { setValue(prev); alert(r.error); }
        });
      }}
    >
      {Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </Select>
  );
}
