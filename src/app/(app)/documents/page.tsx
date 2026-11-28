import { redirect } from 'next/navigation';
import { Paperclip } from 'lucide-react';
import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isItStaff } from '@/lib/permissions';
import { uploadDocument } from '@/lib/actions/misc';
import { humanize } from '@/lib/modules/tones';
import { formatDate } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { FilterForm } from '@/components/forms/filter-form';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { FormDialog } from '@/components/forms/form-dialog';

const CATS = ['purchase_invoice', 'purchase_order', 'asset_document', 'warranty_certificate', 'amc_agreement', 'software_license', 'network_diagram', 'maintenance_report', 'vendor_agreement', 'it_policy', 'other'];
const PAGE_SIZE = 20;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  const me = await requireProfile();
  if (!isItStaff(me.role)) redirect('/dashboard');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q: any = supabase.from('documents').select('id, doc_code, title, category, description, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ' ').trim(); if (t) q = q.or(`title.ilike.%${t}%,doc_code.ilike.%${t}%,description.ilike.%${t}%`); }
  if (sp.category) q = q.eq('category', sp.category);
  const { data, count, error } = await q;
  const ids = (data ?? []).map((d: any) => d.id);
  const { data: files } = ids.length ? await supabase.from('attachments').select('entity_id, file_name, file_path, file_size').eq('entity_type', 'document').in('entity_id', ids) : { data: [] as any[] };
  const links = new Map<string, { name: string; url: string | null; size: number | null }>();
  await Promise.all((files ?? []).map(async (f: any) => {
    const { data: s } = await supabase.storage.from('attachments').createSignedUrl(f.file_path, 3600);
    links.set(f.entity_id, { name: f.file_name, url: s?.signedUrl ?? null, size: f.file_size });
  }));
  return (
    <>
      <PageHeader title="Document library" description="Invoices, agreements, certificates, diagrams and policies. Files open in a new tab (PDF and images preview in the browser)."
        actions={isAdmin(me.role) ? <FormDialog title="Upload document" triggerLabel="Upload document" action={uploadDocument} submitLabel="Upload"
          fields={[{ name: 'title', label: 'Title', type: 'text', required: true, full: true }, { name: 'category', label: 'Category', type: 'select', required: true, default: 'other', options: CATS.map((c): [string, string] => [c, humanize(c)]) }, { name: 'file', label: 'File (up to 10 MB)', type: 'file', required: true }, { name: 'description', label: 'Description', type: 'textarea' }]} /> : undefined} />
      <Card>
        <FilterForm className="flex flex-wrap gap-2 border-b p-4" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="Search title, ID, description" className="w-full sm:w-64" />
          <Select name="category" defaultValue={sp.category ?? ''} className="w-full sm:w-56" aria-label="Category"><option value="">All categories</option>{CATS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select>
          <Button type="submit" variant="outline">Apply filters</Button>{(sp.q || sp.category) && <Link href="/documents" className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear</Link>}
        </FilterForm>
        {error ? <EmptyState title="Could not load documents" hint={error.message} /> : !data?.length ? <EmptyState title="No documents found" /> : (
          <Table>
            <THead><tr><TH>ID</TH><TH>Title</TH><TH>Category</TH><TH>Uploaded</TH><TH>File</TH></tr></THead>
            <TBody>
              {data.map((d: any) => {
                const f = links.get(d.id);
                return (
                  <TR key={d.id}>
                    <TD className="font-mono text-xs">{d.doc_code}</TD><TD><div className="font-medium">{d.title}</div>{d.description && <div className="text-xs text-muted-foreground">{d.description}</div>}</TD>
                    <TD><Badge>{humanize(d.category)}</Badge></TD><TD>{formatDate(d.created_at)}</TD>
                    <TD>{f?.url ? <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Paperclip className="h-4 w-4" />{f.name}</a> : '-'}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/documents" params={{ q: sp.q, category: sp.category }} />
      </Card>
    </>
  );
}
