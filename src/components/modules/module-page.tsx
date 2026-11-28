import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MODULES } from '@/lib/modules/registry';
import { daysUntil, humanize, valueTone } from '@/lib/modules/tones';
import type { Col, FormField, ModuleConfig } from '@/lib/modules/types';
import { formatDate, formatINR } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { buttonClass } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, THead, TBody, TR, TH, TD, SortTH } from '@/components/ui/table';
import { FilterForm } from '@/components/forms/filter-form';
import { ImportDialog } from '@/components/import/import-dialog';
import { applyModuleQuery, getPath, sortableColumns } from '@/lib/modules/query';
import { getImportSpec } from '@/lib/import/spec';
import { FormDialog } from '@/components/forms/form-dialog';
import { RowActionButton } from './row-actions';
import { saveRecord, runRowAction } from '@/lib/actions/modules';

const PAGE_SIZE = 20;

const get = getPath;

async function loadOptions(supabase: any, ref: NonNullable<import('@/lib/modules/types').ModField['ref']>): Promise<[string, string][]> {
  const cols = ref.label.split(',');
  let q = supabase.from(ref.table).select(`id, ${cols.join(', ')}`).order(cols[0]).limit(1000);
  if (ref.where) q = q.eq(ref.where[0], ref.where[1] === 'true' ? true : ref.where[1]);
  const { data } = await q;
  return (data ?? []).map((r: any): [string, string] => [r.id, cols.map((c) => r[c]).filter(Boolean).join(' - ') || r.id]);
}

function Cell({ col, row }: { col: Col; row: any }) {
  const v = get(row, col.path);
  if (v === null || v === undefined || v === '') return <span className="text-muted-foreground">-</span>;
  switch (col.type) {
    case 'money': return <span className="tabular-nums">{formatINR(Number(v))}</span>;
    case 'date': return <>{formatDate(v)}</>;
    case 'number': return <span className="tabular-nums">{Number(v).toLocaleString('en-IN')}</span>;
    case 'bool': return <>{v ? 'Yes' : 'No'}</>;
    case 'badge': return <Badge tone={valueTone(v)}>{humanize(v)}</Badge>;
    case 'qty': {
      const min = col.minPath ? Number(get(row, col.minPath)) : 0;
      const low = Number(v) <= min && min > 0;
      return <span className={`tabular-nums ${low || Number(v) <= 0 ? 'font-semibold text-destructive' : ''}`}>{Number(v).toLocaleString('en-IN')}{low && <Badge tone="danger" className="ml-2">Low</Badge>}</span>;
    }
    case 'expiry': {
      const d = daysUntil(v);
      return <>{formatDate(v)}{d !== null && d < 0 && <Badge tone="danger" className="ml-2">Expired</Badge>}{d !== null && d >= 0 && d <= 30 && <Badge tone="warning" className="ml-2">{d}d left</Badge>}</>;
    }
    case 'due': {
      const d = daysUntil(v);
      const overdue = row.status === 'scheduled' && d !== null && d < 0;
      return <>{formatDate(v)}{overdue && <Badge tone="danger" className="ml-2">Overdue</Badge>}</>;
    }
    default: {
      const text = String(v);
      return col.href ? <Link href={col.href.replace('{id}', row.id)} className="font-medium text-primary hover:underline">{text}</Link> : <>{text}</>;
    }
  }
}

export async function ModulePage({ configKey, basePath, sp, extra }: { configKey: string; basePath: string; sp: Record<string, string | undefined>; extra?: React.ReactNode }) {
  const cfg: ModuleConfig = MODULES[configKey];
  const me = await requireProfile();
  if (!cfg.readRoles.includes(me.role)) redirect('/dashboard');

  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);

  let q: any = supabase.from(cfg.table).select(cfg.select, { count: 'exact' }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  q = applyModuleQuery(q, cfg, sp);

  const refFields = cfg.fields.filter((f) => f.ref);
  const [result, ...refOptions] = await Promise.all([q, ...refFields.map((f) => loadOptions(supabase, f.ref!))]);
  const { data, count, error } = result;
  const refMap = new Map(refFields.map((f, i) => [f.name, refOptions[i]]));

  const toForm = (roleCheck: boolean): FormField[] =>
    cfg.fields
      .filter((f) => !f.roles || f.roles.includes(me.role) || !roleCheck)
      .map((f) => ({ name: f.name, label: f.label, type: f.type, required: f.required, hint: f.hint, full: f.full, placeholder: f.placeholder, default: f.default, options: f.ref ? refMap.get(f.name) : f.options }));

  const canCreate = (cfg.createRoles ?? cfg.writeRoles).includes(me.role);
  const canEdit = cfg.writeRoles.includes(me.role);
  const createFields = toForm(true).filter((f) => !cfg.fields.find((x) => x.name === f.name)?.editOnly);
  const editFields = toForm(true).filter((f) => !cfg.fields.find((x) => x.name === f.name)?.readOnlyOnEdit);
  const filters = (cfg.filters ?? []).map((f) => ({
    ...f,
    options: f.options.length ? f.options : refMap.get(f.name) ?? [],
  }));
  const filtered = !!(sp.q || filters.some((f) => sp[f.name]));
  const visibleActions = (row: any) => (cfg.rowActions ?? []).filter((a) => a.roles.includes(me.role) && (!a.when || row[a.when[0]] === a.when[1]));
  const importSpec = getImportSpec(cfg.key);
  const canImport = !!importSpec && importSpec.roles.includes(me.role);
  const sortable = new Set(sortableColumns(cfg));
  const dir = sp.dir === 'desc' ? 'desc' : 'asc';
  const baseParams: Record<string, string | undefined> = { q: sp.q, ...Object.fromEntries(filters.map((f) => [f.name, sp[f.name]])) };
  const sortHref = (path: string) => {
    const p = new URLSearchParams();
    Object.entries(baseParams).forEach(([k, v]) => v && p.set(k, v));
    p.set('sort', path);
    p.set('dir', sp.sort === path && dir === 'asc' ? 'desc' : 'asc');
    return `${basePath}?${p.toString()}`;
  };
  const exportQs = new URLSearchParams(Object.entries({ key: cfg.key, ...baseParams, sort: sp.sort, dir: sp.dir }).filter(([, v]) => v) as [string, string][]).toString();
  const showActionsCol = canEdit || (cfg.rowActions ?? []).some((a) => a.roles.includes(me.role));

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={
          <>
            <a href={`/data/export?${exportQs}`} className={buttonClass('outline')}><Download className="h-4 w-4" /> Export</a>
            {canImport && <ImportDialog importKey={cfg.key} title={cfg.title} />}
            {canCreate && <FormDialog title={`Add ${cfg.singular}`} triggerLabel={`Add ${cfg.singular}`} fields={createFields} action={saveRecord.bind(null, cfg.key)} />}
          </>
        }
      />
      {extra}
      <Card>
        <FilterForm className="flex flex-wrap gap-2 border-b p-4" role="search" hidden={{ sort: sp.sort, dir: sp.dir }}>
          {cfg.search.length > 0 && <Input name="q" defaultValue={sp.q} placeholder={`Search ${cfg.title.toLowerCase()}`} className="w-full sm:w-64" />}
          {filters.map((f) => (
            <Select key={f.name} name={f.name} defaultValue={sp[f.name] ?? ''} className="w-full sm:w-48" aria-label={f.label}>
              <option value="">{f.label}</option>
              {f.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </Select>
          ))}
          {filtered && <Link href={basePath} className="inline-flex h-9 items-center px-2 text-sm text-primary hover:underline">Clear filters</Link>}
        </FilterForm>
        {error ? <EmptyState title={`Could not load ${cfg.title.toLowerCase()}`} hint={error.message.includes('does not exist') ? 'The database migration for this module has not been run yet.' : error.message} /> : !data?.length ? (
          <EmptyState title={filtered ? 'Nothing matches these filters' : `No ${cfg.title.toLowerCase()} yet`} hint={filtered ? 'Try different filters.' : canCreate ? `Use Add ${cfg.singular} to create the first one.` : undefined} />
        ) : (
          <Table>
            <THead><tr>{cfg.cols.map((c) => sortable.has(c.path) ? <SortTH key={c.label} label={c.label} href={sortHref(c.path)} active={(sp.sort ?? '') === c.path} dir={dir} /> : <TH key={c.label}>{c.label}</TH>)}{showActionsCol && <TH />}</tr></THead>
            <TBody>
              {data.map((row: any) => (
                <TR key={row.id}>
                  {cfg.cols.map((c) => <TD key={c.label} className={c.type === 'money' || c.type === 'number' ? 'whitespace-nowrap' : undefined}><Cell col={c} row={row} /></TD>)}
                  {showActionsCol && (
                    <TD className="whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {visibleActions(row).map((a) => a.fields ? (
                          <FormDialog key={a.key} title={a.label} triggerLabel={a.label} icon="none" variant="outline" size="sm" fields={a.fields} action={runRowAction.bind(null, cfg.key, a.key, row.id)} submitLabel={a.label} />
                        ) : (
                          <RowActionButton key={a.key} configKey={cfg.key} actionKey={a.key} id={row.id} label={a.label} confirmText={a.confirm} />
                        ))}
                        {canEdit && <FormDialog title={`Edit ${cfg.singular}`} triggerLabel="Edit" icon="edit" variant="ghost" size="sm" fields={editFields} values={row} hidden={{ id: row.id }} action={saveRecord.bind(null, cfg.key)} />}
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath={basePath} params={{ ...baseParams, sort: sp.sort, dir: sp.dir }} />
      </Card>
    </>
  );
}
