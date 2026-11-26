import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { humanize, valueTone } from '@/lib/modules/tones';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

export default async function MyAssetsPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  // Row Level Security limits this: employees see their own assets, department heads see their department's.
  const { data, error } = await supabase.from('assets').select('id, asset_code, name, serial_number, status, condition, warranty_end, employees(full_name), departments(name), asset_categories(name)').neq('status', 'disposed').order('asset_code').limit(500);
  const head = me.role === 'dept_head';
  return (
    <>
      <PageHeader title={head ? 'Department assets' : 'My assets'} description={head ? 'IT assets held in your department.' : 'IT assets assigned to you. Report a problem from My IT tickets.'} />
      <Card>
        {error ? <EmptyState title="Could not load assets" hint={error.message} /> : !data?.length ? <EmptyState title="No assets" hint="Assets appear here once IT assigns them to you." /> : (
          <Table>
            <THead><tr><TH>Asset ID</TH><TH>Name</TH><TH>Category</TH><TH>Serial no.</TH>{head && <TH>Held by</TH>}<TH>Condition</TH><TH>Warranty ends</TH><TH>Status</TH></tr></THead>
            <TBody>
              {data.map((a: any) => (
                <TR key={a.id}>
                  <TD><Link className="font-medium text-primary hover:underline" href={`/assets/${a.id}`}>{a.asset_code}</Link></TD>
                  <TD>{a.name}</TD><TD>{a.asset_categories?.name ?? '-'}</TD><TD>{a.serial_number ?? '-'}</TD>{head && <TD>{a.employees?.full_name ?? '-'}</TD>}
                  <TD>{humanize(a.condition)}</TD><TD>{a.warranty_end ? formatDate(a.warranty_end) : '-'}</TD><TD><Badge tone={valueTone(a.status)}>{humanize(a.status)}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
