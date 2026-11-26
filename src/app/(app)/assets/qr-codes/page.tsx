import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isItStaff } from '@/lib/permissions';
import { qrSvg, siteOrigin } from '@/lib/qr';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { PrintButton } from '@/components/forms/confirm-button';

const PER_PAGE = 48;

export default async function QrCodesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/my-assets');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q: any = supabase.from('assets').select('id, asset_code, name, serial_number, departments(name)', { count: 'exact' }).neq('status', 'disposed').order('asset_code').range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ' ').trim(); if (t) q = q.or(`asset_code.ilike.%${t}%,name.ilike.%${t}%,serial_number.ilike.%${t}%`); }
  if (sp.category) q = q.eq('category_id', sp.category);
  const [{ data, count }, { data: cats }, origin] = await Promise.all([q, supabase.from('asset_categories').select('id, name').order('sort_order'), siteOrigin()]);
  const labels = await Promise.all((data ?? []).map(async (a: any) => ({ ...a, svg: await qrSvg(`${origin}/assets/${a.id}`) })));
  const { data: org } = await supabase.from('system_settings').select('value').eq('key', 'organization_name').single();
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.category ? { category: sp.category } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Asset QR codes" description="Print labels and stick them on equipment. Scanning opens the asset page (sign-in required)." actions={<PrintButton label="Print labels" />} />
      <form className="no-print mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Asset ID, name or serial" className="w-full sm:w-64" />
        <Select name="category" defaultValue={sp.category ?? ''} className="w-full sm:w-52"><option value="">All categories</option>{cats?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Button type="submit" variant="outline">Apply</Button>
      </form>
      {!labels.length ? <EmptyState title="No assets to label" /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {labels.map((a: any) => (
            <div key={a.id} className="print-break flex flex-col items-center rounded-lg border bg-white p-3 text-center text-black">
              <div className="h-36 w-36" dangerouslySetInnerHTML={{ __html: a.svg }} />
              <div className="mt-1 font-mono text-sm font-semibold">{a.asset_code}</div>
              <div className="w-full truncate text-xs">{a.name}</div>
              {a.serial_number && <div className="w-full truncate text-[10px]">S/N {a.serial_number}</div>}
              <div className="text-[10px] text-gray-600">{(org?.value as string) ?? ''}</div>
            </div>
          ))}
        </div>
      )}
      <div className="no-print mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page} of {pages} ({count ?? 0} assets)</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={qs(page - 1)}>Previous</Link>}
          {page < pages && <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={qs(page + 1)}>Next</Link>}
        </div>
      </div>
    </>
  );
}
