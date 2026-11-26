import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { assetOp } from '@/lib/actions/assets';
import { humanize } from '@/lib/modules/tones';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';

export default async function DisposalPage() {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/my-assets');
  const admin = isAdmin(me.role);
  const supabase = await createClient();
  const [{ data, error }, assets] = await Promise.all([
    supabase.from('asset_disposals').select('id, asset_id, disposal_date, method, disposal_value, reason, assets(asset_code, name, purchase_price)').order('disposal_date', { ascending: false }).limit(300),
    admin ? supabase.from('assets').select('id, asset_code, name').neq('status', 'disposed').order('asset_code').limit(1000).then((r: any) => (r.data ?? []).map((x: any): [string, string] => [x.id, `${x.asset_code} - ${x.name}`])) : Promise.resolve([] as [string, string][]),
  ]);
  return (
    <>
      <PageHeader title="Asset disposal" description="Disposed assets keep their full history. Disposal cannot be undone."
        actions={admin ? <FormDialog title="Dispose asset" triggerLabel="Dispose asset" action={assetOp.bind(null, 'dispose')} submitLabel="Dispose asset"
          intro="The asset will be returned from any employee and marked Disposed."
          fields={[{ name: 'asset_id', label: 'Asset', type: 'select', required: true, options: assets }, { name: 'method', label: 'Method', type: 'select', required: true, default: 'scrapped', options: [['sold', 'Sold'], ['scrapped', 'Scrapped'], ['donated', 'Donated'], ['returned_to_vendor', 'Returned to vendor'], ['other', 'Other']] }, { name: 'disposal_date', label: 'Disposal date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) }, { name: 'disposal_value', label: 'Value received (INR)', type: 'money', default: 0 }, { name: 'reason', label: 'Reason', type: 'textarea', required: true }]} /> : undefined} />
      <Card>
        {error ? <EmptyState title="Could not load disposals" hint={error.message} /> : !data?.length ? <EmptyState title="No assets disposed yet" /> : (
          <Table>
            <THead><tr><TH>Asset</TH><TH>Date</TH><TH>Method</TH><TH>Purchase price</TH><TH>Value received</TH><TH>Reason</TH></tr></THead>
            <TBody>
              {data.map((d: any) => (
                <TR key={d.id}>
                  <TD><Link href={`/assets/${d.asset_id}`} className="text-primary hover:underline">{d.assets?.asset_code}</Link> {d.assets?.name}</TD>
                  <TD>{formatDate(d.disposal_date)}</TD><TD>{humanize(d.method)}</TD><TD>{d.assets?.purchase_price ? formatINR(d.assets.purchase_price) : '-'}</TD><TD>{formatINR(d.disposal_value)}</TD><TD>{d.reason ?? '-'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
