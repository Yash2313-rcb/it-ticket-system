import type { ModuleConfig } from './types';

export const getPath = (row: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), row);
const clean = (s: string) => s.replace(/[%,()]/g, ' ').trim();

/** Columns people may sort by: direct columns only (not joined tables). */
export const sortableColumns = (cfg: ModuleConfig) => cfg.cols.filter((c) => !c.path.includes('.')).map((c) => c.path);

/** Base filter + search + dropdown filters + sort, shared by the list page and the export. */
export function applyModuleQuery(q: any, cfg: ModuleConfig, sp: Record<string, string | undefined>) {
  if (cfg.base) q = cfg.base.op === 'eq' ? q.eq(cfg.base.col, cfg.base.value) : cfg.base.op === 'in' ? q.in(cfg.base.col, cfg.base.value as string[]) : q.not(cfg.base.col, 'in', `(${(cfg.base.value as string[]).join(',')})`);
  if (sp.q && cfg.search.length) {
    const t = clean(sp.q);
    if (t) q = q.or(cfg.search.map((c) => `${c}.ilike.%${t}%`).join(','));
  }
  for (const f of cfg.filters ?? []) if (sp[f.name]) q = q.eq(f.name, sp[f.name]);

  const sortCol = sp.sort && sortableColumns(cfg).includes(sp.sort) ? sp.sort : null;
  const ascending = sortCol ? sp.dir !== 'desc' : cfg.order[1];
  q = q.order(sortCol ?? cfg.order[0], { ascending });
  if ((sortCol ?? cfg.order[0]) !== 'id') q = q.order('id', { ascending: true }); // stable paging when values tie
  return q;
}
