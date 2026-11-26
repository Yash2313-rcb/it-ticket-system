import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isItStaff } from '@/lib/permissions';
import { daysUntil } from '@/lib/modules/tones';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/dashboard');
  const { view } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from('assets').select('id, asset_code, name, warranty_start, warranty_end, status, asset_categories(name), vendors(company_name)').not('warranty_end', 'is', null).not('status', 'in', '(disposed,retired,lost)').order('warranty_end').limit(1000);
  const all = (data ?? []).map((a: any) => ({ ...a, left: daysUntil(a.warranty_end) as number }));
  const rows = all.filter((a: any) => view === 'expired' ? a.left < 0 : view === 'expiring' ? a.left >= 0 && a.left <= 60 : view === 'active' ? a.left > 60 : true);
  const counts = { expired: all.filter((a: any) => a.left < 0).length, expiring: all.filter((a: any) => a.left >= 0 && a.left <= 60).length, active: all.filter((a: any) => a.left > 60).length };
  return (
    <>
      <PageHeader title="Warranty tracking" description="Based on the warranty dates recorded on each asset." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[['expired', 'Expired', counts.expired], ['expiring', 'Expiring in 60 days', counts.expiring], ['active', 'In warranty', counts.active]].map(([k, l, n]) => (
          <Link key={k as string} href={`/maintenance/warranty?view=${k}`}><Card className="p-4 hover:bg-muted/40"><div className="text-sm text-muted-foreground">{l}</div><div className="text-2xl font-semibold tabular-nums">{n}</div></Card></Link>
        ))}
      </div>
      <Card>
        <form className="flex gap-2 border-b p-4"><Select name="view" defaultValue={view ?? ''} className="w-52" aria-label="View"><option value="">All warranties</option><option value="expired">Expired</option><option value="expiring">Expiring in 60 days</option><option value="active">In warranty</option></Select><Button type="submit" variant="outline">Apply</Button></form>
        {error ? <EmptyState title="Could not load warranties" hint={error.message} /> : !rows.length ? <EmptyState title="No warranties to show" hint="Enter warranty dates on assets to track them here." /> : (
          <Table>
            <THead><tr><TH>Asset</TH><TH>Category</TH><TH>Vendor</TH><TH>Warranty start</TH><TH>Warranty end</TH><TH>Status</TH></tr></THead>
            <TBody>
              {rows.map((a: any) => (
                <TR key={a.id}>
                  <TD><Link className="text-primary hover:underline" href={`/assets/${a.id}`}>{a.asset_code}</Link> {a.name}</TD><TD>{a.asset_categories?.name ?? '-'}</TD><TD>{a.vendors?.company_name ?? '-'}</TD>
                  <TD>{a.warranty_start ? formatDate(a.warranty_start) : '-'}</TD><TD>{formatDate(a.warranty_end)}</TD>
                  <TD>{a.left < 0 ? <Badge tone="danger">Expired {-a.left}d ago</Badge> : a.left <= 60 ? <Badge tone="warning">{a.left}d left</Badge> : <Badge tone="success">{a.left}d left</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
