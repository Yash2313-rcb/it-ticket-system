import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isItStaff } from '@/lib/permissions';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

export default async function LowStockPage() {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/dashboard');
  const supabase = await createClient();
  const { data, error } = await supabase.from('inventory_items').select('id, item_code, name, category, unit, available_qty, min_stock, storage_location, vendors(company_name)').eq('is_active', true).order('name').limit(2000);
  const low = (data ?? []).filter((i: any) => Number(i.available_qty) <= Number(i.min_stock));
  low.sort((a: any, b: any) => Number(a.available_qty) - Number(b.available_qty));
  return (
    <>
      <PageHeader title="Low stock" description="Items at or below their minimum stock level." />
      <Card>
        {error ? <EmptyState title="Could not load stock" hint={error.message} /> : !low.length ? <EmptyState title="No items are low on stock" /> : (
          <Table>
            <THead><tr><TH>Item</TH><TH>Category</TH><TH>Available</TH><TH>Minimum</TH><TH>Location</TH><TH>Vendor</TH><TH /></tr></THead>
            <TBody>
              {low.map((i: any) => (
                <TR key={i.id}>
                  <TD><span className="font-mono text-xs">{i.item_code}</span> {i.name}</TD><TD>{i.category}</TD>
                  <TD className="font-semibold text-destructive tabular-nums">{i.available_qty} {i.unit}</TD><TD className="tabular-nums">{i.min_stock}</TD>
                  <TD>{i.storage_location ?? '-'}</TD><TD>{i.vendors?.company_name ?? '-'}</TD>
                  <TD>{Number(i.available_qty) <= 0 ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="warning">Low</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">To reorder, <Link className="text-primary hover:underline" href="/procurement/requests">raise a purchase request</Link>.</p>
    </>
  );
}
