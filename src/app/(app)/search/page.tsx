import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

type Hit = { href: string; title: string; sub?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireProfile();
  const { q: raw } = await searchParams;
  const term = (raw ?? '').replace(/[%,()]/g, ' ').trim();
  const supabase = await createClient();
  const staff = isItStaff(me.role);
  const admin = isAdmin(me.role);
  const like = `%${term}%`;
  const groups: { label: string; hits: Hit[] }[] = [];

  if (term.length >= 2) {
    const run = async (label: string, query: any, map: (r: any) => Hit) => {
      const { data } = await query;
      if (data?.length) groups.push({ label, hits: data.map(map) });
    };
    await Promise.all([
      staff && run('Tasks', supabase.from('tasks').select('id, task_code, title').or(`task_code.ilike.${like},title.ilike.${like}`).limit(8), (r) => ({ href: `/operations/tasks/${r.id}`, title: `${r.task_code} ${r.title}` })),
      run('Tickets', supabase.from('tickets').select('id, ticket_code, title, status').or(`ticket_code.ilike.${like},title.ilike.${like}`).limit(8), (r) => ({ href: `/operations/tickets/${r.id}`, title: `${r.ticket_code} ${r.title}`, sub: r.status })),
      run('Assets', supabase.from('assets').select('id, asset_code, name, serial_number').or(`asset_code.ilike.${like},name.ilike.${like},serial_number.ilike.${like}`).limit(8), (r) => ({ href: `/assets/${r.id}`, title: `${r.asset_code} ${r.name}`, sub: r.serial_number ? `Serial ${r.serial_number}` : undefined })),
      staff && run('Employees', supabase.from('employees').select('id, emp_code, full_name, designation').or(`full_name.ilike.${like},emp_code.ilike.${like}`).limit(8), (r) => ({ href: `/organization/employees?q=${encodeURIComponent(r.emp_code)}`, title: `${r.full_name} (${r.emp_code})`, sub: r.designation })),
      staff && run('Inventory items', supabase.from('inventory_items').select('id, item_code, name').or(`item_code.ilike.${like},name.ilike.${like}`).limit(8), (r) => ({ href: `/inventory?q=${encodeURIComponent(r.item_code)}`, title: `${r.item_code} ${r.name}` })),
      admin && run('Vendors', supabase.from('vendors').select('id, vendor_code, company_name').or(`company_name.ilike.${like},vendor_code.ilike.${like}`).limit(8), (r) => ({ href: `/procurement/vendors?q=${encodeURIComponent(r.vendor_code)}`, title: `${r.company_name} (${r.vendor_code})` })),
      admin && run('Vendor bills', supabase.from('vendor_bills').select('id, bill_code, invoice_number').or(`invoice_number.ilike.${like},bill_code.ilike.${like}`).limit(8), (r) => ({ href: `/finance/bills/${r.id}`, title: `Invoice ${r.invoice_number}`, sub: r.bill_code })),
      admin && run('Purchase orders', supabase.from('purchase_orders').select('id, po_number').ilike('po_number', like).limit(8), (r) => ({ href: `/procurement/orders/${r.id}`, title: r.po_number })),
      admin && run('Software', supabase.from('software_licenses').select('id, software_name').ilike('software_name', like).limit(8), (r) => ({ href: `/software?q=${encodeURIComponent(r.software_name)}`, title: r.software_name })),
    ]);
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader title="Search" description={term ? `Results for "${term}"` : 'Search tasks, tickets, assets, serial numbers, employees, vendors, invoices, purchase orders, stock and software.'} />
      {term.length < 2 ? <Card><EmptyState title="Type at least two characters in the search box" /></Card> : !groups.length ? <Card><EmptyState title="No results" hint="Check the spelling, or search by ID, serial number or invoice number." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.label}>
              <CardHeader><CardTitle>{g.label}</CardTitle></CardHeader>
              <ul className="divide-y text-sm">{g.hits.map((h) => (<li key={h.href + h.title}><Link href={h.href} className="block px-5 py-2.5 hover:bg-muted/50"><span className="font-medium">{h.title}</span>{h.sub && <span className="ml-2 text-xs text-muted-foreground">{h.sub}</span>}</Link></li>))}</ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
