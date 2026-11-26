import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { REPORT_MAP, defaultPeriod, validYmd } from '@/lib/reports';
import { formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { PrintButton } from '@/components/forms/confirm-button';

const MAX_ROWS = 500;

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me.role)) redirect('/dashboard');
  const { key } = await params;
  const def = REPORT_MAP[key];
  if (!def) notFound();
  const sp = await searchParams;
  const dp = defaultPeriod();
  const period = { from: validYmd(sp.from) ? sp.from! : dp.from, to: validYmd(sp.to) ? sp.to! : dp.to };
  const supabase = await createClient();
  const { data: org } = await supabase.from('system_settings').select('value').eq('key', 'organization_name').single();

  let res: Awaited<ReturnType<typeof def.run>> | null = null;
  let error: string | null = null;
  try { res = await def.run(supabase, period); } catch (e: any) { error = e?.message ?? 'Could not build this report.'; }
  const qs = def.period ? `&from=${period.from}&to=${period.to}` : '';
  const link = (fmt: string) => `/reports/export?report=${key}&format=${fmt}${qs}`;

  return (
    <>
      <Link href="/reports" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All reports</Link>
      <PageHeader title={def.title} description={def.description}
        actions={res ? (
          <div className="no-print flex flex-wrap gap-2">
            {['pdf', 'xlsx', 'csv'].map((f) => <a key={f} href={link(f)} className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" />{f === 'xlsx' ? 'Excel' : f.toUpperCase()}</a>)}
            <PrintButton />
          </div>
        ) : undefined} />
      {def.period && (
        <form className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Reporting period">
          <Input type="date" name="from" defaultValue={period.from} aria-label="From date" className="w-40" /><span className="text-muted-foreground">to</span>
          <Input type="date" name="to" defaultValue={period.to} aria-label="To date" className="w-40" /><Button type="submit" variant="outline">Update</Button>
        </form>
      )}
      <Card className="print-break p-6">
        <div className="mb-4 text-center">
          <div className="text-lg font-bold">{(org?.value as string) ?? ''}</div>
          <div className="font-semibold">{def.title}</div>
          <div className="text-xs text-muted-foreground">{def.period ? `Period: ${period.from} to ${period.to}` : 'Position as at today'} | Generated {new Date().toLocaleString('en-IN')} | Prepared by {me.full_name}</div>
        </div>
        {error ? <EmptyState title="Could not build this report" hint={error.includes('does not exist') ? 'Run the database migration for this module first.' : error} /> : res && (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {res.summary.map(([k, v]) => (<div key={k} className="rounded-md bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{typeof v === 'number' && /total|value|cost|amount|outstanding|expenditure|valuation|gst/i.test(k) ? formatINR(v) : v}</dd></div>))}
            </dl>
            {!res.rows.length ? <EmptyState title="No records for this report" /> : (
              <>
                <Table>
                  <THead><tr>{res.columns.map((c) => <TH key={c.label} className={c.money ? 'text-right' : ''}>{c.label}</TH>)}</tr></THead>
                  <TBody>{res.rows.slice(0, MAX_ROWS).map((r, i) => <TR key={i}>{r.map((v, j) => <TD key={j} className={res!.columns[j].money ? 'text-right tabular-nums' : ''}>{v === null || v === '' ? '-' : res!.columns[j].money && typeof v === 'number' ? formatINR(v) : String(v)}</TD>)}</TR>)}</TBody>
                </Table>
                {res.rows.length > MAX_ROWS && <p className="mt-2 text-xs text-muted-foreground">Showing the first {MAX_ROWS} of {res.rows.length} rows. Download the PDF, Excel or CSV for everything.</p>}
              </>
            )}
            <div className="mt-12 grid grid-cols-3 gap-8 text-sm">{['Prepared by', 'Verified by', 'Authorised signatory'].map((l) => <div key={l}><div className="h-10 border-b" /><div className="mt-1">{l}</div></div>)}</div>
          </>
        )}
      </Card>
    </>
  );
}
