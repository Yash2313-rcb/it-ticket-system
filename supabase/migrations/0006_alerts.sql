-- =====================================================================
-- Phase 6 - Notifications and expiry reminders.
-- generate_alerts() is idempotent (dedupe_key). Call it from the app (Notifications > Refresh alerts),
-- from the optional cron route /api/cron/alerts, or schedule it with pg_cron:
--   select cron.schedule('it-alerts', '0 3 * * *', $$select public.generate_alerts()$$);
-- =====================================================================
create or replace function public.generate_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Not allowed'; end if;

  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'warranty_expiry', 'Warranty expiring: ' || a.asset_code, a.name || ' ends ' || to_char(a.warranty_end,'DD Mon YYYY'), '/assets/' || a.id, 'warranty:' || a.id || ':' || a.warranty_end
  from public.assets a where a.warranty_end between current_date and current_date + 30 and a.status not in ('disposed','retired','lost')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'amc_expiry', 'AMC ending: ' || k.contract_code, 'Ends ' || to_char(k.end_date,'DD Mon YYYY'), '/maintenance/amc', 'amc:' || k.id || ':' || k.end_date
  from public.amc_contracts k where k.end_date between current_date and current_date + 30 and k.renewal_status in ('active','renewal_due')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'license_expiry', 'Licence expiring: ' || l.software_name, 'Expires ' || to_char(l.expiry_date,'DD Mon YYYY'), '/software/renewals', 'lic:' || l.id || ':' || l.expiry_date
  from public.software_licenses l where l.expiry_date between current_date and current_date + 30 and l.renewal_status in ('active','renewal_due')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'maintenance_overdue', 'Maintenance overdue: ' || m.schedule_code, 'Was due ' || to_char(m.scheduled_date,'DD Mon YYYY'), '/maintenance/schedule', 'mnt:' || m.id
  from public.maintenance_schedules m where m.status = 'scheduled' and m.scheduled_date < current_date
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'task_overdue', 'Task overdue: ' || t.task_code, t.title, '/operations/tasks/' || t.id, 'task:' || t.id
  from public.tasks t where t.task_date < current_date and t.status in ('pending','in_progress')
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'payment_due', 'Vendor payment due: ' || b.bill_code, 'Outstanding ' || b.outstanding || ' due ' || to_char(b.due_date,'DD Mon YYYY'), '/finance/bills/' || b.id, 'bill:' || b.id || ':' || b.due_date
  from public.vendor_bills b where b.status in ('unpaid','partially_paid') and b.due_date is not null and b.due_date <= current_date + 7
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'low_stock', 'Low stock: ' || i.name, i.available_qty || ' ' || i.unit || ' left (minimum ' || i.min_stock || ')', '/inventory/low-stock', 'lowstock:' || i.id || ':' || to_char(current_date,'YYYY-MM')
  from public.inventory_items i where i.is_active and i.min_stock > 0 and i.available_qty <= i.min_stock
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  -- budget overspend (annual and monthly budgets, expenses matched on department + category)
  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  select null, 'budget_overspend', 'Over budget: ' || b.category, b.financial_year || ' spent ' || s.spent || ' of ' || b.allocated_amount, '/finance/budgets', 'budget:' || b.id || ':' || to_char(current_date,'YYYY-MM')
  from public.budgets b
  cross join lateral (
    select coalesce(sum(e.amount + e.gst_amount), 0) as spent from public.expenses e
    where e.category = b.category
      and (b.department_id is null or e.department_id = b.department_id)
      and e.expense_date >= make_date(split_part(b.financial_year,'-',1)::int, 4, 1)
      and e.expense_date <  make_date(split_part(b.financial_year,'-',1)::int + 1, 4, 1)
      and (b.month is null or extract(month from e.expense_date) = b.month)
  ) s
  where s.spent > b.allocated_amount
  on conflict do nothing;
  get diagnostics c = row_count; n := n + c;

  return n;
end $$;

-- notifications: allow marking as read (policy exists) and let admins clear their own view
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid() or (user_id is null and public.is_super_admin()));
