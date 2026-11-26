import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { daysUntil, humanize, valueTone } from '@/lib/modules/tones';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

export default async function RenewalsPage() {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const supabase = await createClient();
  const [{ data: lic, error }, { data: amc }] = await Promise.all([
    supabase.from('software_licenses').select('id, software_name, expiry_date, renewal_cost, renewal_status, vendors(company_name)').not('expiry_date', 'is', null).not('renewal_status', 'in', '(cancelled,renewed)').order('expiry_date').limit(500),
    supabase.from('amc_contracts').select('id, contract_code, end_date, amount, renewal_status, vendors(company_name)').not('renewal_status', 'in', '(cancelled,renewed)').order('end_date').limit(500),
  ]);
  const horizon = 90;
  const licenses = (lic ?? []).map((l: any) => ({ ...l, left: daysUntil(l.expiry_date) as number })).filter((l: any) => l.left <= horizon);
  const contracts = (amc ?? []).map((c: any) => ({ ...c, left: daysUntil(c.end_date) as number })).filter((c: any) => c.left <= horizon);
  const cost = licenses.reduce((s: number, l: any) => s + Number(l.renewal_cost ?? 0), 0) + contracts.reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
  const badge = (left: number) => left < 0 ? <Badge tone="danger">Expired {-left}d ago</Badge> : <Badge tone={left <= 30 ? 'warning' : 'neutral'}>{left}d left</Badge>;
  return (
    <>
      <PageHeader title="Renewals" description={`Licences and AMC contracts expired or expiring within ${horizon} days. Estimated renewal cost: ${formatINR(cost)}.`} />
      <div className="space-y-6">
        <Card>
          <div className="border-b px-5 py-3 text-sm font-semibold">Software licences</div>
          {error ? <EmptyState title="Could not load licences" hint={error.message} /> : !licenses.length ? <EmptyState title="No licences due for renewal" /> : (
            <Table><THead><tr><TH>Software</TH><TH>Vendor</TH><TH>Expires</TH><TH>When</TH><TH>Renewal cost</TH><TH>Status</TH></tr></THead>
              <TBody>{licenses.map((l: any) => <TR key={l.id}><TD>{l.software_name}</TD><TD>{l.vendors?.company_name ?? '-'}</TD><TD>{formatDate(l.expiry_date)}</TD><TD>{badge(l.left)}</TD><TD className="tabular-nums">{l.renewal_cost ? formatINR(l.renewal_cost) : '-'}</TD><TD><Badge tone={valueTone(l.renewal_status)}>{humanize(l.renewal_status)}</Badge></TD></TR>)}</TBody></Table>
          )}
          <div className="border-t px-5 py-2 text-xs text-muted-foreground">Update the renewal status in <Link className="text-primary hover:underline" href="/software">Software inventory</Link>.</div>
        </Card>
        <Card>
          <div className="border-b px-5 py-3 text-sm font-semibold">AMC contracts</div>
          {!contracts.length ? <EmptyState title="No AMC contracts due for renewal" /> : (
            <Table><THead><tr><TH>Contract</TH><TH>Vendor</TH><TH>Ends</TH><TH>When</TH><TH>Amount</TH><TH>Status</TH></tr></THead>
              <TBody>{contracts.map((c: any) => <TR key={c.id}><TD className="font-mono text-xs">{c.contract_code}</TD><TD>{c.vendors?.company_name ?? '-'}</TD><TD>{formatDate(c.end_date)}</TD><TD>{badge(c.left)}</TD><TD className="tabular-nums">{c.amount ? formatINR(c.amount) : '-'}</TD><TD><Badge tone={valueTone(c.renewal_status)}>{humanize(c.renewal_status)}</Badge></TD></TR>)}</TBody></Table>
          )}
        </Card>
      </div>
    </>
  );
}
