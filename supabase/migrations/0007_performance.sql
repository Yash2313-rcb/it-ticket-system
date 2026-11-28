-- 0007_performance.sql
-- Speed-ups: trigram search indexes, missing foreign-key indexes, and a single-call dashboard.
-- Safe to run more than once. Run AFTER 0001-0006.

-- 1. Fast "contains" search (ilike '%text%') ------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

create index if not exists tickets_title_trgm      on public.tickets            using gin (title extensions.gin_trgm_ops);
create index if not exists tickets_code_trgm       on public.tickets            using gin (ticket_code extensions.gin_trgm_ops);
create index if not exists tasks_title_trgm        on public.tasks              using gin (title extensions.gin_trgm_ops);
create index if not exists tasks_code_trgm         on public.tasks              using gin (task_code extensions.gin_trgm_ops);
create index if not exists assets_name_trgm        on public.assets             using gin (name extensions.gin_trgm_ops);
create index if not exists assets_code_trgm        on public.assets             using gin (asset_code extensions.gin_trgm_ops);
create index if not exists assets_serial_trgm      on public.assets             using gin (serial_number extensions.gin_trgm_ops);
create index if not exists assets_brand_trgm       on public.assets             using gin (brand extensions.gin_trgm_ops);
create index if not exists employees_name_trgm     on public.employees          using gin (full_name extensions.gin_trgm_ops);
create index if not exists employees_code_trgm     on public.employees          using gin (emp_code extensions.gin_trgm_ops);
create index if not exists employees_email_trgm    on public.employees          using gin (email extensions.gin_trgm_ops);
create index if not exists inventory_name_trgm     on public.inventory_items    using gin (name extensions.gin_trgm_ops);
create index if not exists inventory_code_trgm     on public.inventory_items    using gin (item_code extensions.gin_trgm_ops);
create index if not exists vendors_name_trgm       on public.vendors            using gin (company_name extensions.gin_trgm_ops);
create index if not exists vendors_code_trgm       on public.vendors            using gin (vendor_code extensions.gin_trgm_ops);
create index if not exists bills_invoice_trgm      on public.vendor_bills       using gin (invoice_number extensions.gin_trgm_ops);
create index if not exists po_number_trgm          on public.purchase_orders    using gin (po_number extensions.gin_trgm_ops);
create index if not exists software_name_trgm      on public.software_licenses  using gin (software_name extensions.gin_trgm_ops);
create index if not exists devices_name_trgm       on public.network_devices    using gin (device_name extensions.gin_trgm_ops);
create index if not exists requests_item_trgm      on public.purchase_requests  using gin (item_name extensions.gin_trgm_ops);

-- 2. Foreign keys that had no index (joins, filters and ON DELETE checks all scan without these) --
create index if not exists tickets_category_idx          on public.tickets(category_id);
create index if not exists tickets_department_idx        on public.tickets(department_id);
create index if not exists tickets_asset_idx             on public.tickets(asset_id);
create index if not exists tasks_category_idx            on public.tasks(category_id);
create index if not exists tasks_department_idx          on public.tasks(department_id);
create index if not exists tasks_asset_idx               on public.tasks(asset_id);
create index if not exists tasks_created_by_idx          on public.tasks(created_by);
create index if not exists task_comments_author_idx      on public.task_comments(author_id);
create index if not exists ticket_comments_author_idx    on public.ticket_comments(author_id);
create index if not exists profiles_employee_idx         on public.profiles(employee_id);
create index if not exists assets_category_idx           on public.assets(category_id);
create index if not exists assets_vendor_idx             on public.assets(vendor_id);
create index if not exists assets_created_idx            on public.assets(created_at desc);
create index if not exists asset_assignments_asset_idx   on public.asset_assignments(asset_id, assigned_on desc);
create index if not exists asset_transfers_asset_idx     on public.asset_transfers(asset_id);
create index if not exists asset_disposals_asset_idx     on public.asset_disposals(asset_id);
create index if not exists inventory_items_vendor_idx    on public.inventory_items(vendor_id);
create index if not exists inventory_txn_employee_idx    on public.inventory_transactions(employee_id);
create index if not exists purchase_requests_dept_idx    on public.purchase_requests(department_id);
create index if not exists purchase_orders_vendor_idx    on public.purchase_orders(vendor_id);
create index if not exists purchase_orders_dept_idx      on public.purchase_orders(department_id);
create index if not exists purchase_orders_request_idx   on public.purchase_orders(request_id);
create index if not exists purchase_orders_date_idx      on public.purchase_orders(po_date);
create index if not exists goods_receipts_po_idx         on public.goods_receipts(po_id);
create index if not exists vendor_bills_vendor_idx       on public.vendor_bills(vendor_id);
create index if not exists vendor_bills_po_idx           on public.vendor_bills(po_id);
create index if not exists expenses_vendor_idx           on public.expenses(vendor_id);
create index if not exists expenses_department_idx       on public.expenses(department_id);
create index if not exists budgets_department_idx        on public.budgets(department_id);
create index if not exists amc_asset_idx                 on public.amc_contracts(asset_id);
create index if not exists amc_vendor_idx                on public.amc_contracts(vendor_id);
create index if not exists amc_end_idx                   on public.amc_contracts(end_date);
create index if not exists maintenance_schedules_asset_idx on public.maintenance_schedules(asset_id);
create index if not exists software_vendor_idx           on public.software_licenses(vendor_id);
create index if not exists software_expiry_idx           on public.software_licenses(expiry_date);
create index if not exists license_assignments_license_idx on public.license_assignments(license_id);
create index if not exists ip_addresses_device_idx       on public.ip_addresses(device_id);

-- 3. Dashboard in ONE round trip -------------------------------------------------------------
-- Replaces ~35 queries that downloaded up to 20,000 rows each and added them up in the browser server.
-- SECURITY INVOKER: row level security still decides what each person can see.
create or replace function public.dashboard_stats(
  p_from timestamptz, p_to timestamptz, p_from_day date, p_to_day date, p_fy text, p_fy_start date
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_staff boolean := public.is_it_staff();
  v_admin boolean := public.is_admin();
  v_now   timestamptz := now();
  v_m6    date := (date_trunc('month', current_date) - interval '5 months')::date;
  v_m12   date := (date_trunc('month', current_date) - interval '11 months')::date;
  v_open  text[] := array['open','assigned','in_progress','on_hold'];
  r jsonb := '{}'::jsonb;
begin
  -- Tickets: every role (RLS limits the rows an employee can count)
  r := r || jsonb_build_object('tickets', jsonb_build_object(
    'open',     (select count(*) from tickets where status = any(v_open)),
    'resolved', (select count(*) from tickets where status in ('resolved','closed') and resolved_at between p_from and p_to),
    'overdue',  (select count(*) from tickets where status = any(v_open) and due_at < v_now),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('name', n, 'value', c) order by c desc)
      from (select coalesce(tc.name, 'Uncategorised') n, count(*) c
            from tickets t left join ticket_categories tc on tc.id = t.category_id
            where t.reported_at between p_from and p_to group by 1) x), '[]'::jsonb)));

  r := r || jsonb_build_object('departments', (select count(*) from departments where is_active));

  if v_staff then
    r := r || jsonb_build_object('tasks', jsonb_build_object(
      'total',       (select count(*) from tasks where task_date between p_from_day and p_to_day),
      'completed',   (select count(*) from tasks where task_date between p_from_day and p_to_day and status = 'completed'),
      'pending',     (select count(*) from tasks where task_date between p_from_day and p_to_day and status = 'pending'),
      'in_progress', (select count(*) from tasks where task_date between p_from_day and p_to_day and status = 'in_progress'),
      'by_status', coalesce((select jsonb_object_agg(status, c) from (select status, count(*) c from tasks where task_date between p_from_day and p_to_day group by 1) x), '{}'::jsonb)));

    r := r || jsonb_build_object('employees', jsonb_build_object(
      'total',  (select count(*) from employees),
      'active', (select count(*) from employees where status = 'active'),
      'joined', (select count(*) from employees where joining_date between p_from_day and p_to_day),
      'by_dept', coalesce((
        select jsonb_agg(jsonb_build_object('name', n, 'employees', c) order by c desc)
        from (select coalesce(d.name, 'Unassigned') n, count(*) c
              from employees e left join departments d on d.id = e.department_id
              where e.status = 'active' group by 1) x), '[]'::jsonb)));

    r := r || jsonb_build_object('assets', jsonb_build_object(
      'total', (select count(*) from assets),
      'by_status', coalesce((select jsonb_object_agg(status, c) from (select status, count(*) c from assets group by 1) x), '{}'::jsonb),
      'expired_warranties', (select count(*) from assets where warranty_end < current_date and status not in ('disposed','retired','lost')),
      'by_dept', coalesce((
        select jsonb_agg(jsonb_build_object('name', n, 'value', c) order by c desc)
        from (select coalesce(d.name, 'Unassigned') n, count(*) c
              from assets a left join departments d on d.id = a.department_id
              where a.status <> 'disposed' group by 1 order by 2 desc limit 12) x), '[]'::jsonb)));

    r := r || jsonb_build_object('inventory', jsonb_build_object(
      'items',  (select count(*) from inventory_items where is_active),
      'low',    (select count(*) from inventory_items where is_active and min_stock > 0 and available_qty <= min_stock),
      'out',    (select count(*) from inventory_items where is_active and available_qty <= 0),
      'issued', (select coalesce(sum(quantity), 0) from inventory_transactions where txn_type = 'stock_out' and txn_date between p_from_day and p_to_day),
      'consumption', coalesce((
        select jsonb_agg(jsonb_build_object('key', to_char(m, 'YYYY-MM'), 'value', coalesce(s.v, 0)) order by m)
        from generate_series(v_m6, date_trunc('month', current_date)::date, interval '1 month') m
        left join (select date_trunc('month', txn_date)::date mm, sum(quantity) v from inventory_transactions
                   where txn_type = 'stock_out' and txn_date >= v_m6 group by 1) s on s.mm = m::date), '[]'::jsonb)));

    r := r || jsonb_build_object('maintenance', jsonb_build_object(
      'upcoming', (select count(*) from maintenance_schedules where status = 'scheduled' and scheduled_date between current_date and current_date + 30),
      'amc_expiring', (select count(*) from amc_contracts where renewal_status in ('active','renewal_due') and end_date between current_date and current_date + 30)));
  end if;

  if v_admin then
    r := r || jsonb_build_object('users', (select count(*) from profiles where is_active));
    r := r || jsonb_build_object('events', (select count(*) from activity_logs where created_at between p_from and p_to));
    r := r || jsonb_build_object('recent', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'action', action, 'entity_type', entity_type, 'created_at', created_at))
      from (select id, action, entity_type, created_at from activity_logs order by created_at desc limit 8) x), '[]'::jsonb));

    r := r || jsonb_build_object('finance', jsonb_build_object(
      'purchases', (select coalesce(sum(total), 0) from purchase_orders where status in ('approved','ordered','partially_received','received') and po_date between p_from_day and p_to_day),
      'expenses',  (select coalesce(sum(amount + gst_amount), 0) from expenses where expense_date between p_from_day and p_to_day),
      'pending_total', (select coalesce(sum(outstanding), 0) from vendor_bills where status not in ('paid','cancelled')),
      'unpaid_count',  (select count(*) from vendor_bills where status not in ('paid','cancelled')),
      'paid_count',    (select count(*) from vendor_bills where status = 'paid' and invoice_date between p_from_day and p_to_day),
      'budget_total',  (select coalesce(sum(allocated_amount), 0) from budgets where financial_year = p_fy and month is null),
      'spent_fy',      (select coalesce(sum(amount + gst_amount), 0) from expenses where expense_date >= p_fy_start),
      'expense_months', coalesce((
        select jsonb_agg(jsonb_build_object('key', to_char(m, 'YYYY-MM'), 'value', round(coalesce(s.v, 0))) order by m)
        from generate_series(v_m12, date_trunc('month', current_date)::date, interval '1 month') m
        left join (select date_trunc('month', expense_date)::date mm, sum(amount + gst_amount) v from expenses
                   where expense_date >= v_m12 group by 1) s on s.mm = m::date), '[]'::jsonb),
      'purchase_months', coalesce((
        select jsonb_agg(jsonb_build_object('key', to_char(m, 'YYYY-MM'), 'value', round(coalesce(s.v, 0))) order by m)
        from generate_series(v_m6, date_trunc('month', current_date)::date, interval '1 month') m
        left join (select date_trunc('month', po_date)::date mm, sum(total) v from purchase_orders
                   where status in ('approved','ordered','partially_received','received') and po_date >= v_m6 group by 1) s on s.mm = m::date), '[]'::jsonb)));
  end if;

  return r;
end $$;
grant execute on function public.dashboard_stats(timestamptz, timestamptz, date, date, text, date) to authenticated;

analyze;
