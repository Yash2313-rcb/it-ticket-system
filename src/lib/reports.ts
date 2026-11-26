import 'server-only';
import { formatDate } from '@/lib/utils';
import { currentFinancialYear } from '@/lib/modules/registry';
import { dayEndIso, dayStartIso, formatMinutes } from '@/lib/ops';

export type Cell = string | number | null;
export type ReportCol = { label: string; money?: boolean };
export type ReportResult = { columns: ReportCol[]; rows: Cell[][]; summary: [string, string | number][] };
export type Period = { from: string; to: string };
export type ReportDef = { key: string; group: string; title: string; description: string; period: boolean; run: (sb: any, p: Period) => Promise<ReportResult> };

const LIMIT = 20000;
const d = (v: string | null | undefined) => (v ? formatDate(v) : null);
const h = (label: string): ReportCol => ({ label });
const m = (label: string): ReportCol => ({ label, money: true });
const sum = (rows: any[], f: (r: any) => number) => rows.reduce((n, r) => n + f(r), 0);
const rupee = (n: number) => Math.round(n * 100) / 100;
const names = async (sb: any, ids: (string | null)[]) => {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  const map: Record<string, string> = {};
  if (u.length) { const { data } = await sb.rpc('profile_names', { ids: u }); (data ?? []).forEach((r: any) => { map[r.id] = r.full_name; }); }
  return map;
};
const group = <T,>(rows: T[], key: (r: T) => string) => { const g = new Map<string, T[]>(); rows.forEach((r) => { const k = key(r) || 'Unspecified'; g.set(k, [...(g.get(k) ?? []), r]); }); return g; };
const must = (res: { data: any; error: any }) => { if (res.error) throw new Error(res.error.message); return (res.data ?? []) as any[]; };
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const ASSET_SELECT = 'asset_code, name, brand, model_number, serial_number, status, condition, location, purchase_date, purchase_price, warranty_end, asset_categories(name), departments(name), employees(full_name), vendors(company_name)';
const assetRow = (a: any): Cell[] => [a.asset_code, a.name, a.asset_categories?.name ?? null, a.brand, a.model_number, a.serial_number, a.departments?.name ?? null, a.employees?.full_name ?? null, a.status, a.condition, d(a.purchase_date), a.purchase_price ?? null, d(a.warranty_end)];
const ASSET_COLS: ReportCol[] = [h('Asset ID'), h('Name'), h('Category'), h('Brand'), h('Model'), h('Serial no.'), h('Department'), h('Assigned to'), h('Status'), h('Condition'), h('Purchased'), m('Price'), h('Warranty ends')];

const assetList = (key: string, title: string, description: string, filter: (q: any) => any): ReportDef => ({
  key, group: 'C. Asset reports', title, description, period: false,
  run: async (sb) => { const rows = must(await filter(sb.from('assets').select(ASSET_SELECT).order('asset_code').limit(LIMIT))); return { columns: ASSET_COLS, rows: rows.map(assetRow), summary: [['Assets', rows.length], ['Total purchase value', rupee(sum(rows, (a) => Number(a.purchase_price ?? 0)))]] }; },
});

const txnReport = (key: string, title: string, description: string, types: string[]): ReportDef => ({
  key, group: 'D. Inventory reports', title, description, period: true,
  run: async (sb, p) => {
    const rows = must(await sb.from('inventory_transactions').select('txn_date, txn_type, quantity, purpose, reference, inventory_items(item_code, name, unit), employees(full_name), departments(name)').in('txn_type', types).gte('txn_date', p.from).lte('txn_date', p.to).order('txn_date').limit(LIMIT));
    return { columns: [h('Date'), h('Type'), h('Item ID'), h('Item'), h('Quantity'), h('Unit'), h('Employee'), h('Department'), h('Purpose / reference')],
      rows: rows.map((t) => [d(t.txn_date), t.txn_type, t.inventory_items?.item_code, t.inventory_items?.name, Number(t.quantity), t.inventory_items?.unit, t.employees?.full_name ?? null, t.departments?.name ?? null, [t.purpose, t.reference].filter(Boolean).join(' / ') || null]),
      summary: [['Transactions', rows.length], ['Total quantity', sum(rows, (t) => Number(t.quantity))]] };
  },
});

export const REPORTS: ReportDef[] = [
  // ---------------------------------------------------------------- A
  { key: 'daily-activity', group: 'A. Daily IT activity', title: 'Daily IT activity report', description: 'Tasks performed, completed and pending, tickets raised and resolved, and time spent.', period: true,
    run: async (sb, p) => {
      const tasks = must(await sb.from('tasks').select('task_code, title, task_date, status, time_spent_minutes, performed_by, task_categories(name)').gte('task_date', p.from).lte('task_date', p.to).order('task_date').limit(LIMIT));
      const raised = must(await sb.from('tickets').select('id').gte('reported_at', dayStartIso(p.from)).lte('reported_at', dayEndIso(p.to)).limit(LIMIT));
      const resolved = must(await sb.from('tickets').select('id').gte('resolved_at', dayStartIso(p.from)).lte('resolved_at', dayEndIso(p.to)).limit(LIMIT));
      const who = await names(sb, tasks.map((t) => t.performed_by));
      return { columns: [h('Task ID'), h('Date'), h('Title'), h('Category'), h('Performed by'), h('Status'), h('Minutes')], rows: tasks.map((t) => [t.task_code, d(t.task_date), t.title, t.task_categories?.name ?? null, who[t.performed_by] ?? null, t.status, t.time_spent_minutes]),
        summary: [['Tasks performed', tasks.length], ['Completed', tasks.filter((t) => t.status === 'completed').length], ['Pending / in progress', tasks.filter((t) => ['pending', 'in_progress', 'on_hold'].includes(t.status)).length], ['Time spent', formatMinutes(sum(tasks, (t) => t.time_spent_minutes ?? 0))], ['Tickets raised (employee queries)', raised.length], ['Tickets resolved', resolved.length]] };
    } },
  // ---------------------------------------------------------------- B
  { key: 'monthly-operations', group: 'B. Monthly IT operations', title: 'Monthly IT operations report', description: 'Ticket volume, resolution time and the most frequent IT issues by category.', period: true,
    run: async (sb, p) => {
      const tickets = must(await sb.from('tickets').select('status, time_taken_minutes, ticket_categories(name)').gte('reported_at', dayStartIso(p.from)).lte('reported_at', dayEndIso(p.to)).limit(LIMIT));
      const tasks = must(await sb.from('tasks').select('id').gte('task_date', p.from).lte('task_date', p.to).limit(LIMIT));
      const done = tickets.filter((t) => t.time_taken_minutes != null);
      const g = [...group(tickets, (t) => t.ticket_categories?.name)].map(([k, v]) => [k, v.length, v.filter((t) => ['open', 'assigned', 'in_progress', 'on_hold'].includes(t.status)).length] as Cell[]).sort((a, b) => Number(b[1]) - Number(a[1]));
      return { columns: [h('Issue category'), h('Tickets'), h('Still open')], rows: g,
        summary: [['Total tasks', tasks.length], ['Total tickets', tickets.length], ['Average resolution time', done.length ? formatMinutes(Math.round(sum(done, (t) => t.time_taken_minutes) / done.length)) : '-'], ['Pending complaints', tickets.filter((t) => ['open', 'assigned', 'in_progress', 'on_hold'].includes(t.status)).length]] };
    } },
  { key: 'monthly-tickets', group: 'B. Monthly IT operations', title: 'Monthly tickets report', description: 'Every ticket raised in the month with status, assignee and resolution time.', period: true,
    run: async (sb, p) => {
      const t = must(await sb.from('tickets').select('ticket_code, title, status, priority, reported_at, resolved_at, time_taken_minutes, assigned_to, reported_by, ticket_categories(name), employees(full_name), departments(name)').gte('reported_at', dayStartIso(p.from)).lte('reported_at', dayEndIso(p.to)).order('reported_at').limit(LIMIT));
      const who = await names(sb, t.flatMap((x) => [x.assigned_to, x.reported_by]));
      const open = ['open', 'assigned', 'in_progress', 'on_hold'];
      const done = t.filter((x) => x.time_taken_minutes != null);
      return { columns: [h('Ticket ID'), h('Reported'), h('Issue'), h('Category'), h('Raised for'), h('Department'), h('Priority'), h('Assigned to'), h('Status'), h('Resolved'), h('Time taken')],
        rows: t.map((x) => [x.ticket_code, d(x.reported_at), x.title, x.ticket_categories?.name ?? null, x.employees?.full_name ?? who[x.reported_by] ?? null, x.departments?.name ?? null, x.priority, who[x.assigned_to] ?? null, x.status, d(x.resolved_at), x.time_taken_minutes != null ? formatMinutes(x.time_taken_minutes) : null]),
        summary: [['Tickets raised', t.length], ['Resolved or closed', t.filter((x) => ['resolved', 'closed'].includes(x.status)).length], ['Still open', t.filter((x) => open.includes(x.status)).length], ['High / critical', t.filter((x) => ['high', 'critical'].includes(x.priority)).length], ['Average resolution time', done.length ? formatMinutes(Math.round(sum(done, (x) => x.time_taken_minutes) / done.length)) : '-']] };
    } },
  { key: 'department-issues', group: 'B. Monthly IT operations', title: 'Department-wise IT issues', description: 'Tickets raised per department.', period: true,
    run: async (sb, p) => {
      const t = must(await sb.from('tickets').select('status, departments(name)').gte('reported_at', dayStartIso(p.from)).lte('reported_at', dayEndIso(p.to)).limit(LIMIT));
      return { columns: [h('Department'), h('Tickets'), h('Open')], rows: [...group(t, (x) => x.departments?.name)].map(([k, v]) => [k, v.length, v.filter((x) => ['open', 'assigned', 'in_progress', 'on_hold'].includes(x.status)).length] as Cell[]).sort((a, b) => Number(b[1]) - Number(a[1])), summary: [['Tickets', t.length]] };
    } },
  // ---------------------------------------------------------------- C
  assetList('asset-register', 'Complete asset register', 'Every asset with category, holder and warranty.', (q) => q),
  assetList('assets-available', 'Available assets', 'Assets ready to be allocated.', (q) => q.eq('status', 'available')),
  assetList('assets-damaged', 'Damaged assets', 'Assets marked damaged.', (q) => q.eq('status', 'damaged')),
  assetList('assets-maintenance', 'Assets under maintenance', 'Assets currently in repair or service.', (q) => q.eq('status', 'under_maintenance')),
  { key: 'assets-by-department', group: 'C. Asset reports', title: 'Department-wise assets', description: 'Asset count and purchase value per department.', period: false,
    run: async (sb) => { const a = must(await sb.from('assets').select('purchase_price, departments(name)').neq('status', 'disposed').limit(LIMIT)); const g = [...group(a, (x) => x.departments?.name)].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.purchase_price ?? 0)))] as Cell[]).sort((x, y) => Number(y[1]) - Number(x[1])); return { columns: [h('Department'), h('Assets'), m('Purchase value')], rows: g, summary: [['Assets', a.length]] }; } },
  { key: 'assets-by-employee', group: 'C. Asset reports', title: 'Employee-wise asset allocation', description: 'Assets currently held by each employee.', period: false,
    run: async (sb) => { const a = must(await sb.from('assets').select('asset_code, name, serial_number, employees(emp_code, full_name, departments(name))').not('employee_id', 'is', null).limit(LIMIT)); const rows = a.map((x) => [x.employees?.emp_code, x.employees?.full_name, x.employees?.departments?.name ?? null, x.asset_code, x.name, x.serial_number] as Cell[]).sort((x, y) => String(x[1]).localeCompare(String(y[1]))); return { columns: [h('Emp ID'), h('Employee'), h('Department'), h('Asset ID'), h('Asset'), h('Serial no.')], rows, summary: [['Allocated assets', rows.length]] }; } },
  { key: 'warranty-expiry', group: 'C. Asset reports', title: 'Warranty expiry report', description: 'Assets with warranty ended or ending within 90 days.', period: false,
    run: async (sb) => { const a = must(await sb.from('assets').select('asset_code, name, warranty_end, asset_categories(name), vendors(company_name)').not('warranty_end', 'is', null).lte('warranty_end', plusDays(90)).not('status', 'in', '(disposed,retired,lost)').order('warranty_end').limit(LIMIT)); return { columns: [h('Asset ID'), h('Name'), h('Category'), h('Vendor'), h('Warranty ends'), h('Status')], rows: a.map((x) => [x.asset_code, x.name, x.asset_categories?.name ?? null, x.vendors?.company_name ?? null, d(x.warranty_end), x.warranty_end < today() ? 'Expired' : 'Expiring']), summary: [['Expired', a.filter((x) => x.warranty_end < today()).length], ['Expiring within 90 days', a.filter((x) => x.warranty_end >= today()).length]] }; } },
  { key: 'asset-purchases', group: 'C. Asset reports', title: 'Asset purchase history', description: 'Assets purchased in the period.', period: true,
    run: async (sb, p) => { const a = must(await sb.from('assets').select(ASSET_SELECT).gte('purchase_date', p.from).lte('purchase_date', p.to).order('purchase_date').limit(LIMIT)); return { columns: ASSET_COLS, rows: a.map(assetRow), summary: [['Assets purchased', a.length], ['Total value', rupee(sum(a, (x) => Number(x.purchase_price ?? 0)))]] }; } },
  { key: 'asset-disposals', group: 'C. Asset reports', title: 'Asset disposal report', description: 'Assets disposed in the period.', period: true,
    run: async (sb, p) => { const r = must(await sb.from('asset_disposals').select('disposal_date, method, disposal_value, reason, assets(asset_code, name, purchase_price)').gte('disposal_date', p.from).lte('disposal_date', p.to).order('disposal_date').limit(LIMIT)); return { columns: [h('Date'), h('Asset ID'), h('Asset'), h('Method'), m('Purchase price'), m('Value received'), h('Reason')], rows: r.map((x) => [d(x.disposal_date), x.assets?.asset_code, x.assets?.name, x.method, x.assets?.purchase_price ?? null, Number(x.disposal_value ?? 0), x.reason]), summary: [['Assets disposed', r.length], ['Value received', rupee(sum(r, (x) => Number(x.disposal_value ?? 0)))]] }; } },
  // ---------------------------------------------------------------- D
  { key: 'stock-current', group: 'D. Inventory reports', title: 'Current stock and valuation', description: 'Available quantity and value of every active item.', period: false,
    run: async (sb) => { const i = must(await sb.from('inventory_items').select('item_code, name, category, unit, available_qty, min_stock, unit_price, storage_location').eq('is_active', true).order('name').limit(LIMIT)); return { columns: [h('Item ID'), h('Item'), h('Category'), h('Available'), h('Unit'), h('Minimum'), m('Unit price'), m('Value'), h('Location')], rows: i.map((x) => [x.item_code, x.name, x.category, Number(x.available_qty), x.unit, Number(x.min_stock), Number(x.unit_price), rupee(Number(x.available_qty) * Number(x.unit_price)), x.storage_location]), summary: [['Items', i.length], ['Inventory valuation', rupee(sum(i, (x) => Number(x.available_qty) * Number(x.unit_price)))]] }; } },
  txnReport('stock-inward', 'Stock inward', 'Stock received or returned in the period.', ['stock_in', 'returned']),
  txnReport('stock-outward', 'Stock outward', 'Stock issued or written off in the period.', ['stock_out', 'damaged']),
  { key: 'stock-low', group: 'D. Inventory reports', title: 'Low and out-of-stock items', description: 'Items at or below minimum stock.', period: false,
    run: async (sb) => { const i = must(await sb.from('inventory_items').select('item_code, name, category, unit, available_qty, min_stock, vendors(company_name)').eq('is_active', true).limit(LIMIT)).filter((x) => Number(x.available_qty) <= Number(x.min_stock)); return { columns: [h('Item ID'), h('Item'), h('Category'), h('Available'), h('Minimum'), h('Unit'), h('Vendor'), h('Status')], rows: i.map((x) => [x.item_code, x.name, x.category, Number(x.available_qty), Number(x.min_stock), x.unit, x.vendors?.company_name ?? null, Number(x.available_qty) <= 0 ? 'Out of stock' : 'Low']), summary: [['Low stock', i.filter((x) => Number(x.available_qty) > 0).length], ['Out of stock', i.filter((x) => Number(x.available_qty) <= 0).length]] }; } },
  { key: 'stock-consumption', group: 'D. Inventory reports', title: 'Monthly consumption', description: 'Units issued per item in the period.', period: true,
    run: async (sb, p) => { const t = must(await sb.from('inventory_transactions').select('quantity, inventory_items(item_code, name, unit, unit_price)').eq('txn_type', 'stock_out').gte('txn_date', p.from).lte('txn_date', p.to).limit(LIMIT)); const g = [...group(t, (x) => `${x.inventory_items?.item_code} ${x.inventory_items?.name}`)].map(([k, v]) => [k, sum(v, (x) => Number(x.quantity)), v[0].inventory_items?.unit ?? null, rupee(sum(v, (x) => Number(x.quantity) * Number(v[0].inventory_items?.unit_price ?? 0)))] as Cell[]).sort((a, b) => Number(b[1]) - Number(a[1])); return { columns: [h('Item'), h('Units issued'), h('Unit'), m('Approx. value')], rows: g, summary: [['Items consumed', g.length]] }; } },
  // ---------------------------------------------------------------- E
  { key: 'purchase-requests', group: 'E. Purchase reports', title: 'Purchase requests', description: 'Requests raised in the period with their approval status.', period: true,
    run: async (sb, p) => { const r = must(await sb.from('purchase_requests').select('request_code, request_date, item_name, quantity, estimated_price, priority, approval_status, departments(name)').gte('request_date', p.from).lte('request_date', p.to).order('request_date').limit(LIMIT)); return { columns: [h('Request'), h('Date'), h('Item'), h('Qty'), m('Est. unit price'), h('Department'), h('Priority'), h('Approval')], rows: r.map((x) => [x.request_code, d(x.request_date), x.item_name, Number(x.quantity), Number(x.estimated_price ?? 0), x.departments?.name ?? null, x.priority, x.approval_status]), summary: [['Requests', r.length], ['Approved', r.filter((x) => ['approved', 'converted'].includes(x.approval_status)).length], ['Pending', r.filter((x) => x.approval_status === 'pending').length]] }; } },
  { key: 'approved-purchases', group: 'E. Purchase reports', title: 'Approved purchases', description: 'Purchase orders approved, ordered or received in the period.', period: true,
    run: async (sb, p) => { const o = must(await sb.from('purchase_orders').select('po_number, po_date, status, total, vendors(company_name)').in('status', ['approved', 'ordered', 'partially_received', 'received']).gte('po_date', p.from).lte('po_date', p.to).order('po_date').limit(LIMIT)); return { columns: [h('PO'), h('Date'), h('Vendor'), h('Status'), m('Total')], rows: o.map((x) => [x.po_number, d(x.po_date), x.vendors?.company_name ?? null, x.status, Number(x.total)]), summary: [['Orders', o.length], ['Total value', rupee(sum(o, (x) => Number(x.total)))]] }; } },
  { key: 'purchase-orders', group: 'E. Purchase reports', title: 'Purchase orders', description: 'All purchase orders raised in the period.', period: true,
    run: async (sb, p) => { const o = must(await sb.from('purchase_orders').select('po_number, po_date, status, subtotal, tax_amount, total, delivery_date, vendors(company_name), departments(name)').gte('po_date', p.from).lte('po_date', p.to).order('po_date').limit(LIMIT)); return { columns: [h('PO'), h('Date'), h('Vendor'), h('Department'), h('Status'), m('Subtotal'), m('GST'), m('Total'), h('Delivery')], rows: o.map((x) => [x.po_number, d(x.po_date), x.vendors?.company_name ?? null, x.departments?.name ?? null, x.status, Number(x.subtotal), Number(x.tax_amount), Number(x.total), d(x.delivery_date)]), summary: [['Orders', o.length], ['Total value', rupee(sum(o, (x) => Number(x.total)))]] }; } },
  { key: 'vendor-purchases', group: 'E. Purchase reports', title: 'Vendor-wise purchases', description: 'Purchase order value per vendor.', period: true,
    run: async (sb, p) => { const o = must(await sb.from('purchase_orders').select('total, vendors(company_name)').in('status', ['approved', 'ordered', 'partially_received', 'received']).gte('po_date', p.from).lte('po_date', p.to).limit(LIMIT)); const g = [...group(o, (x) => x.vendors?.company_name)].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.total)))] as Cell[]).sort((a, b) => Number(b[2]) - Number(a[2])); return { columns: [h('Vendor'), h('Orders'), m('Total')], rows: g, summary: [['Total', rupee(sum(o, (x) => Number(x.total)))]] }; } },
  { key: 'monthly-purchases', group: 'E. Purchase reports', title: 'Monthly purchase summary', description: 'Purchase value by month.', period: true,
    run: async (sb, p) => { const o = must(await sb.from('purchase_orders').select('po_date, total').in('status', ['approved', 'ordered', 'partially_received', 'received']).gte('po_date', p.from).lte('po_date', p.to).limit(LIMIT)); const g = [...group(o, (x) => String(x.po_date).slice(0, 7))].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.total)))] as Cell[]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))); return { columns: [h('Month'), h('Orders'), m('Total')], rows: g, summary: [['Total', rupee(sum(o, (x) => Number(x.total)))]] }; } },
  // ---------------------------------------------------------------- F
  { key: 'expenditure', group: 'F. Financial reports', title: 'Total IT expenditure', description: 'Expenses by category, including GST.', period: true,
    run: async (sb, p) => { const e = must(await sb.from('expenses').select('category, amount, gst_amount').gte('expense_date', p.from).lte('expense_date', p.to).limit(LIMIT)); const g = [...group(e, (x) => x.category)].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.amount))), rupee(sum(v, (x) => Number(x.gst_amount))), rupee(sum(v, (x) => Number(x.amount) + Number(x.gst_amount)))] as Cell[]).sort((a, b) => Number(b[4]) - Number(a[4])); return { columns: [h('Category'), h('Entries'), m('Amount'), m('GST'), m('Total')], rows: g, summary: [['Total expenditure', rupee(sum(e, (x) => Number(x.amount) + Number(x.gst_amount)))], ['Of which GST', rupee(sum(e, (x) => Number(x.gst_amount)))]] }; } },
  { key: 'monthly-expenses', group: 'F. Financial reports', title: 'Monthly IT expenses', description: 'Expenses by month.', period: true,
    run: async (sb, p) => { const e = must(await sb.from('expenses').select('expense_date, amount, gst_amount').gte('expense_date', p.from).lte('expense_date', p.to).limit(LIMIT)); const g = [...group(e, (x) => String(x.expense_date).slice(0, 7))].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.amount) + Number(x.gst_amount)))] as Cell[]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))); return { columns: [h('Month'), h('Entries'), m('Total incl. GST')], rows: g, summary: [['Total', rupee(sum(e, (x) => Number(x.amount) + Number(x.gst_amount)))]] }; } },
  { key: 'vendor-expenses', group: 'F. Financial reports', title: 'Vendor-wise expenses', description: 'Expense entries and bills per vendor.', period: true,
    run: async (sb, p) => { const e = must(await sb.from('expenses').select('amount, gst_amount, vendors(company_name)').gte('expense_date', p.from).lte('expense_date', p.to).limit(LIMIT)); const b = must(await sb.from('vendor_bills').select('grand_total, vendors(company_name)').neq('status', 'cancelled').gte('invoice_date', p.from).lte('invoice_date', p.to).limit(LIMIT)); const names2 = new Set([...e.map((x) => x.vendors?.company_name ?? 'No vendor'), ...b.map((x) => x.vendors?.company_name)]); const rows = [...names2].map((n) => { const ex = e.filter((x) => (x.vendors?.company_name ?? 'No vendor') === n); const bl = b.filter((x) => x.vendors?.company_name === n); return [n, rupee(sum(ex, (x) => Number(x.amount) + Number(x.gst_amount))), rupee(sum(bl, (x) => Number(x.grand_total))), rupee(sum(ex, (x) => Number(x.amount) + Number(x.gst_amount)) + sum(bl, (x) => Number(x.grand_total)))] as Cell[]; }).sort((a, b2) => Number(b2[3]) - Number(a[3])); return { columns: [h('Vendor'), m('Expenses'), m('Bills'), m('Total')], rows, summary: [['Vendors', rows.length]] }; } },
  { key: 'department-expenses', group: 'F. Financial reports', title: 'Department-wise expenses', description: 'Expenses per department.', period: true,
    run: async (sb, p) => { const e = must(await sb.from('expenses').select('amount, gst_amount, departments(name)').gte('expense_date', p.from).lte('expense_date', p.to).limit(LIMIT)); const g = [...group(e, (x) => x.departments?.name)].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.amount) + Number(x.gst_amount)))] as Cell[]).sort((a, b) => Number(b[2]) - Number(a[2])); return { columns: [h('Department'), h('Entries'), m('Total incl. GST')], rows: g, summary: [['Total', rupee(sum(e, (x) => Number(x.amount) + Number(x.gst_amount)))]] }; } },
  ...(['paid', 'unpaid', 'overdue'] as const).map((kind): ReportDef => ({
    key: `invoices-${kind}`, group: 'F. Financial reports', title: kind === 'paid' ? 'Paid invoices' : kind === 'unpaid' ? 'Unpaid and outstanding invoices' : 'Overdue invoices', description: kind === 'paid' ? 'Bills fully paid, by invoice date.' : kind === 'unpaid' ? 'Bills with an outstanding balance.' : 'Bills past their due date with an outstanding balance.', period: kind === 'paid',
    run: async (sb, p) => {
      let q = sb.from('vendor_bills').select('bill_code, invoice_number, invoice_date, due_date, grand_total, amount_paid, outstanding, status, vendors(company_name)').order('due_date').limit(LIMIT);
      q = kind === 'paid' ? q.eq('status', 'paid').gte('invoice_date', p.from).lte('invoice_date', p.to) : kind === 'unpaid' ? q.in('status', ['unpaid', 'partially_paid']) : q.in('status', ['unpaid', 'partially_paid']).lt('due_date', today());
      const b = must(await q);
      return { columns: [h('Bill'), h('Invoice'), h('Vendor'), h('Invoice date'), h('Due'), m('Total'), m('Paid'), m('Outstanding'), h('Status')], rows: b.map((x) => [x.bill_code, x.invoice_number, x.vendors?.company_name, d(x.invoice_date), d(x.due_date), Number(x.grand_total), Number(x.amount_paid), Number(x.outstanding), x.status]), summary: [['Bills', b.length], ['Total amount', rupee(sum(b, (x) => Number(x.grand_total)))], ['Outstanding', rupee(sum(b, (x) => Number(x.outstanding)))]] };
    },
  })),
  { key: 'outstanding-by-vendor', group: 'F. Financial reports', title: 'Outstanding payments by vendor', description: 'Pending vendor payments grouped by vendor.', period: false,
    run: async (sb) => { const b = must(await sb.from('vendor_bills').select('outstanding, due_date, vendors(company_name)').in('status', ['unpaid', 'partially_paid']).limit(LIMIT)); const g = [...group(b, (x) => x.vendors?.company_name)].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.outstanding))), rupee(sum(v.filter((x) => x.due_date && x.due_date < today()), (x) => Number(x.outstanding)))] as Cell[]).sort((a, c) => Number(c[2]) - Number(a[2])); return { columns: [h('Vendor'), h('Bills'), m('Outstanding'), m('Of which overdue')], rows: g, summary: [['Total outstanding', rupee(sum(b, (x) => Number(x.outstanding)))]] }; } },
  { key: 'gst-breakdown', group: 'F. Financial reports', title: 'GST breakdown', description: 'CGST, SGST and IGST on vendor bills by month (internal tracking only).', period: true,
    run: async (sb, p) => { const b = must(await sb.from('vendor_bills').select('invoice_date, subtotal, discount, cgst, sgst, igst').neq('status', 'cancelled').gte('invoice_date', p.from).lte('invoice_date', p.to).limit(LIMIT)); const g = [...group(b, (x) => String(x.invoice_date).slice(0, 7))].map(([k, v]) => [k, v.length, rupee(sum(v, (x) => Number(x.subtotal) - Number(x.discount))), rupee(sum(v, (x) => Number(x.cgst))), rupee(sum(v, (x) => Number(x.sgst))), rupee(sum(v, (x) => Number(x.igst)))] as Cell[]).sort((a, c) => String(a[0]).localeCompare(String(c[0]))); return { columns: [h('Month'), h('Bills'), m('Taxable value'), m('CGST'), m('SGST'), m('IGST')], rows: g, summary: [['Total GST', rupee(sum(b, (x) => Number(x.cgst) + Number(x.sgst) + Number(x.igst)))]] }; } },
  { key: 'budget-utilization', group: 'F. Financial reports', title: 'Budget utilisation (current financial year)', description: 'Annual budgets against actual expenses.', period: false,
    run: async (sb) => {
      const fy = currentFinancialYear(); const y = Number(fy.slice(0, 4));
      const b = must(await sb.from('budgets').select('category, department_id, allocated_amount, departments(name)').eq('financial_year', fy).is('month', null));
      const e = must(await sb.from('expenses').select('category, department_id, amount, gst_amount').gte('expense_date', `${y}-04-01`).lte('expense_date', `${y + 1}-03-31`).limit(LIMIT));
      const rows = b.map((x) => { const spent = sum(e.filter((r) => r.category === x.category && (!x.department_id || r.department_id === x.department_id)), (r) => Number(r.amount) + Number(r.gst_amount)); const al = Number(x.allocated_amount); return [x.category, x.departments?.name ?? 'All', al, rupee(spent), rupee(al - spent), al > 0 ? `${Math.round((spent / al) * 100)}%` : '-'] as Cell[]; });
      return { columns: [h('Category'), h('Department'), m('Allocated'), m('Actual'), m('Remaining'), h('Utilised')], rows, summary: [['Financial year', fy], ['Total allocated', rupee(sum(b, (x) => Number(x.allocated_amount)))]] };
    } },
  // ---------------------------------------------------------------- G
  { key: 'maintenance-completed', group: 'G. Maintenance reports', title: 'Maintenance completed', description: 'Completed maintenance visits in the period.', period: true,
    run: async (sb, p) => { const r = must(await sb.from('maintenance_schedules').select('schedule_code, maintenance_type, completion_date, cost, remarks, assets(asset_code, name)').eq('status', 'completed').gte('completion_date', p.from).lte('completion_date', p.to).order('completion_date').limit(LIMIT)); return { columns: [h('Schedule'), h('Asset'), h('Type'), h('Completed'), m('Cost'), h('Remarks')], rows: r.map((x) => [x.schedule_code, `${x.assets?.asset_code ?? ''} ${x.assets?.name ?? ''}`.trim() || null, x.maintenance_type, d(x.completion_date), Number(x.cost ?? 0), x.remarks]), summary: [['Completed', r.length], ['Cost', rupee(sum(r, (x) => Number(x.cost ?? 0)))]] }; } },
  { key: 'maintenance-pending', group: 'G. Maintenance reports', title: 'Pending and overdue maintenance', description: 'Scheduled maintenance not yet completed.', period: false,
    run: async (sb) => { const r = must(await sb.from('maintenance_schedules').select('schedule_code, maintenance_type, scheduled_date, assigned_to, assets(asset_code, name)').eq('status', 'scheduled').order('scheduled_date').limit(LIMIT)); const who = await names(sb, r.map((x) => x.assigned_to)); return { columns: [h('Schedule'), h('Asset'), h('Type'), h('Scheduled'), h('Technician'), h('Status')], rows: r.map((x) => [x.schedule_code, `${x.assets?.asset_code ?? ''} ${x.assets?.name ?? ''}`.trim() || null, x.maintenance_type, d(x.scheduled_date), who[x.assigned_to] ?? null, x.scheduled_date < today() ? 'Overdue' : 'Upcoming']), summary: [['Overdue', r.filter((x) => x.scheduled_date < today()).length], ['Upcoming', r.filter((x) => x.scheduled_date >= today()).length]] }; } },
  { key: 'amc-expiry', group: 'G. Maintenance reports', title: 'AMC expiry', description: 'AMC contracts ended or ending within 90 days.', period: false,
    run: async (sb) => { const r = must(await sb.from('amc_contracts').select('contract_code, contract_type, start_date, end_date, amount, renewal_status, assets(asset_code), vendors(company_name)').in('renewal_status', ['active', 'renewal_due', 'expired']).lte('end_date', plusDays(90)).order('end_date').limit(LIMIT)); return { columns: [h('Contract'), h('Asset'), h('Vendor'), h('Type'), h('Ends'), m('Amount'), h('Renewal status')], rows: r.map((x) => [x.contract_code, x.assets?.asset_code ?? null, x.vendors?.company_name ?? null, x.contract_type, d(x.end_date), Number(x.amount ?? 0), x.renewal_status]), summary: [['Contracts', r.length], ['Renewal value', rupee(sum(r, (x) => Number(x.amount ?? 0)))]] }; } },
  { key: 'repair-expenses', group: 'G. Maintenance reports', title: 'Repair and service expenses', description: 'Maintenance and repair costs recorded in the period.', period: true,
    run: async (sb, p) => { const r = must(await sb.from('maintenance_records').select('service_date, maintenance_type, technician, cost, description, assets(asset_code, name), vendors(company_name)').gte('service_date', p.from).lte('service_date', p.to).order('service_date').limit(LIMIT)); return { columns: [h('Date'), h('Asset'), h('Work'), h('Vendor'), h('Technician'), m('Cost'), h('Details')], rows: r.map((x) => [d(x.service_date), `${x.assets?.asset_code ?? ''} ${x.assets?.name ?? ''}`.trim(), x.maintenance_type, x.vendors?.company_name ?? null, x.technician, Number(x.cost), x.description]), summary: [['Records', r.length], ['Total cost', rupee(sum(r, (x) => Number(x.cost)))]] }; } },
];

export const REPORT_MAP = Object.fromEntries(REPORTS.map((r) => [r.key, r]));

export function defaultPeriod(): Period {
  const n = new Date();
  const from = new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1)).toISOString().slice(0, 10);
  return { from, to: n.toISOString().slice(0, 10) };
}
export const validYmd = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
