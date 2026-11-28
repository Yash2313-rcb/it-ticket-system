import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { refOptions } from '@/lib/module-fields';
import { postStock } from '@/lib/actions/inventory';
import { humanize } from '@/lib/modules/tones';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { FilterForm } from '@/components/forms/filter-form';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';
import type { FormField } from '@/lib/modules/types';

const PAGE_SIZE = 25;
const TYPE_LABEL: Record<string, string> = { stock_in: 'Stock in', stock_out: 'Stock out', transfer: 'Transfer', adjustment: 'Adjustment', damaged: 'Damaged', returned: 'Returned' };
const today = () => new Date().toISOString().slice(0, 10);

export async function StockPage({ title, description, basePath, types, sp, dialogs }: {
  title: string; description: string; basePath: string; types: string[]; sp: Record<string, string | undefined>;
  dialogs: { type: string; label: string; adminOnly?: boolean }[];
}) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/dashboard');
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);

  let q: any = supabase.from('inventory_transactions')
    .select('id, txn_type, quantity, quantity_after, txn_date, purpose, reference, from_location, to_location, inventory_items(item_code, name, unit), employees(full_name), departments(name)', { count: 'exact' })
    .in('txn_type', types).order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.item) q = q.eq('item_id', sp.item);
  if (sp.type && types.includes(sp.type)) q = q.eq('txn_type', sp.type);
  if (sp.from) q = q.gte('txn_date', sp.from);
  if (sp.to) q = q.lte('txn_date', sp.to);

  const [{ data, count, error }, items, employees, departments] = await Promise.all([
    q,
    supabase.from('inventory_items').select('id, item_code, name, unit, available_qty').eq('is_active', true).order('name').limit(1000).then((r: any) => (r.data ?? []).map((x: any): [string, string] => [x.id, `${x.item_code} - ${x.name} (${x.available_qty} ${x.unit})`])),
    refOptions(supabase, 'employees', 'emp_code,full_name', ['status', 'active']),
    refOptions(supabase, 'departments', 'name', ['is_active', 'true']),
  ]);

  const fieldsFor = (type: string): FormField[] => {
    const base: FormField[] = [{ name: 'item_id', label: 'Item', type: 'select', required: true, options: items }];
    const date: FormField = { name: 'txn_date', label: 'Date', type: 'date', required: true, default: today() };
    if (type === 'stock_in') return [...base, { name: 'quantity', label: 'Quantity received', type: 'number', required: true }, date, { name: 'reference', label: 'Invoice / PO reference', type: 'text' }, { name: 'purpose', label: 'Remarks', type: 'textarea' }];
    if (type === 'returned') return [...base, { name: 'quantity', label: 'Quantity returned', type: 'number', required: true }, date, { name: 'employee_id', label: 'Returned by', type: 'select', options: employees }, { name: 'purpose', label: 'Remarks', type: 'textarea' }];
    if (type === 'stock_out') return [...base, { name: 'quantity', label: 'Quantity issued', type: 'number', required: true }, date, { name: 'employee_id', label: 'Issued to (employee)', type: 'select', required: true, options: employees }, { name: 'department_id', label: 'Department', type: 'select', options: departments }, { name: 'purpose', label: 'Purpose', type: 'textarea', required: true }];
    if (type === 'damaged') return [...base, { name: 'quantity', label: 'Quantity damaged', type: 'number', required: true }, date, { name: 'purpose', label: 'What happened', type: 'textarea' }];
    if (type === 'transfer') return [...base, { name: 'to_location', label: 'New storage location', type: 'text', required: true }, { name: 'from_location', label: 'From location', type: 'text' }, date, { name: 'purpose', label: 'Remarks', type: 'textarea' }];
    return [...base, { name: 'quantity', label: 'Adjustment (+ or -)', type: 'number', required: true, hint: 'Use a negative number to reduce stock. Administrators only.' }, date, { name: 'purpose', label: 'Reason', type: 'textarea', required: true }];
  };

  const filtered = !!(sp.item || sp.type || sp.from || sp.to);
  return (
    <>
      <PageHeader title={title} description={description}
        actions={<>{dialogs.filter((d) => !d.adminOnly || isAdmin(me.role)).map((d, i) => (
          <FormDialog key={d.type} title={d.label} triggerLabel={d.label} variant={i === 0 ? 'primary' : 'outline'} icon={i === 0 ? 'plus' : 'none'} fields={fieldsFor(d.type)} action={postStock.bind(null, d.type)} submitLabel="Post" />
        ))}</>} />
      <Card>
        <FilterForm className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Select name="item" defaultValue={sp.item ?? ''} className="w-full sm:w-64" aria-label="Item"><option value="">All items</option>{items.map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}</Select>
          {types.length > 1 && <Select name="type" defaultValue={sp.type ?? ''} className="w-full sm:w-40" aria-label="Type"><option value="">All types</option>{types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select>}
          <Input name="from" type="date" defaultValue={sp.from} aria-label="From date" className="w-full sm:w-40" />
          <Input name="to" type="date" defaultValue={sp.to} aria-label="To date" className="w-full sm:w-40" />
          <Button type="submit" variant="outline">Apply filters</Button>
          {filtered && <Link href={basePath} className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </FilterForm>
        {error ? <EmptyState title="Could not load transactions" hint={error.message} /> : !data?.length ? <EmptyState title="No transactions yet" /> : (
          <Table>
            <THead><tr><TH>Date</TH><TH>Type</TH><TH>Item</TH><TH>Quantity</TH><TH>Balance after</TH><TH>Employee</TH><TH>Department</TH><TH>Purpose / reference</TH></tr></THead>
            <TBody>
              {data.map((t: any) => (
                <TR key={t.id}>
                  <TD className="whitespace-nowrap">{formatDate(t.txn_date)}</TD>
                  <TD><Badge tone={['stock_in', 'returned'].includes(t.txn_type) ? 'success' : t.txn_type === 'damaged' ? 'danger' : 'neutral'}>{TYPE_LABEL[t.txn_type] ?? humanize(t.txn_type)}</Badge></TD>
                  <TD>{t.inventory_items?.item_code} {t.inventory_items?.name}</TD>
                  <TD className="tabular-nums">{t.txn_type === 'transfer' ? '-' : `${t.quantity} ${t.inventory_items?.unit ?? ''}`}</TD>
                  <TD className="tabular-nums">{t.quantity_after}</TD>
                  <TD>{t.employees?.full_name ?? '-'}</TD><TD>{t.departments?.name ?? '-'}</TD>
                  <TD className="max-w-xs">{t.txn_type === 'transfer' ? `${t.from_location ?? '?'} to ${t.to_location}` : [t.purpose, t.reference].filter(Boolean).join(' / ') || '-'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath={basePath} params={{ item: sp.item, type: sp.type, from: sp.from, to: sp.to }} />
      </Card>
    </>
  );
}

export { formatINR };
