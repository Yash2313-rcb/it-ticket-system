-- =====================================================================
-- Phase 4 - Purchase requests, purchase orders, goods receipt, vendor bills
-- (Indian GST), payments, expenses, budgets. Run after 0003.
-- This is an internal IT purchase/expense tracker, not a statutory accounting or GST filing system.
-- =====================================================================

-- ---------- purchase requests -------------------------------------------
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  requested_by uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  request_date date not null default current_date,
  item_name text not null,
  description text,
  quantity numeric(14,2) not null default 1 check (quantity > 0),
  estimated_price numeric(14,2) default 0 check (estimated_price is null or estimated_price >= 0), -- per unit
  reason text,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','converted')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  po_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.purchase_requests_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.request_code is null or btrim(new.request_code)='' then new.request_code := public.next_code('PR',6); end if;
    new.approval_status := 'pending';
  elsif new.approval_status in ('approved','rejected') and new.approval_status is distinct from old.approval_status then
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;
create trigger purchase_requests_before_trg before insert or update on public.purchase_requests for each row execute function public.purchase_requests_before();
create trigger purchase_requests_updated before update on public.purchase_requests for each row execute function public.set_updated_at();
create trigger purchase_requests_audit after insert or update or delete on public.purchase_requests for each row execute function public.audit_row();

create or replace function public.purchase_requests_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, type, title, body, link, dedupe_key)
  values (null, 'purchase_approval', 'Purchase request ' || new.request_code || ' needs approval', new.item_name, '/procurement/requests', 'pr:' || new.id)
  on conflict do nothing;
  return new;
end $$;
create trigger purchase_requests_notify_trg after insert on public.purchase_requests for each row execute function public.purchase_requests_notify();

-- ---------- purchase orders -----------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  po_date date not null default current_date,
  vendor_id uuid references public.vendors(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  expense_category text,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','ordered','partially_received','received','cancelled')),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_rate numeric(5,2) not null default 18 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(14,2) not null default 0,
  shipping_charges numeric(14,2) not null default 0 check (shipping_charges >= 0),
  total numeric(14,2) not null default 0,
  delivery_date date,
  payment_terms text,
  notes text,
  request_id uuid references public.purchase_requests(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.purchase_requests add constraint purchase_requests_po_fk foreign key (po_id) references public.purchase_orders(id) on delete set null;
alter table public.assets add constraint assets_po_fk foreign key (purchase_order_id) references public.purchase_orders(id) on delete set null;

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  description text not null,
  quantity numeric(14,2) not null check (quantity > 0),
  received_qty numeric(14,2) not null default 0 check (received_qty >= 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  receive_as text not null default 'none' check (receive_as in ('none','inventory','asset')),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  asset_category_id uuid references public.asset_categories(id) on delete set null,
  created_at timestamptz not null default now()
);
create index po_items_po_idx on public.purchase_order_items(po_id);

create or replace function public.po_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.po_number is null or btrim(new.po_number)='' then new.po_number := public.next_code('PO',6); end if;
    new.status := 'draft';
    new.subtotal := 0;
  else
    select coalesce(sum(line_total),0) into new.subtotal from public.purchase_order_items where po_id = new.id;
  end if;
  new.tax_amount := round(greatest(new.subtotal - new.discount, 0) * new.tax_rate / 100, 2);
  new.total := greatest(new.subtotal - new.discount, 0) + new.tax_amount + new.shipping_charges;
  return new;
end $$;
create trigger po_before_trg before insert or update on public.purchase_orders for each row execute function public.po_before();
create trigger po_updated before update on public.purchase_orders for each row execute function public.set_updated_at();
create trigger po_audit after insert or update or delete on public.purchase_orders for each row execute function public.audit_row();

create or replace function public.po_items_guard() returns trigger language plpgsql as $$
declare st text; pid uuid;
begin
  pid := case when tg_op = 'DELETE' then old.po_id else new.po_id end;
  select status into st from public.purchase_orders where id = pid;
  if tg_op in ('INSERT','DELETE') and st is distinct from 'draft' then raise exception 'Only draft purchase orders can be edited'; end if;
  if tg_op = 'UPDATE' and st is distinct from 'draft'
     and (new.quantity <> old.quantity or new.unit_price <> old.unit_price) then raise exception 'Only draft purchase orders can be edited'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger po_items_guard_trg before insert or update or delete on public.purchase_order_items for each row execute function public.po_items_guard();

create or replace function public.po_items_after() returns trigger language plpgsql as $$
begin
  update public.purchase_orders set updated_at = now() where id = case when tg_op = 'DELETE' then old.po_id else new.po_id end;
  return null;
end $$;
create trigger po_items_after_trg after insert or update or delete on public.purchase_order_items for each row execute function public.po_items_after();

create or replace function public.po_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending_approval' and old.status is distinct from 'pending_approval' then
    insert into public.notifications(user_id, type, title, body, link, dedupe_key)
    values (null, 'purchase_approval', 'Purchase order ' || new.po_number || ' awaits approval', 'Total ' || new.total, '/procurement/orders/' || new.id, 'po:' || new.id || ':' || extract(epoch from now())::bigint)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger po_notify_trg after update of status on public.purchase_orders for each row execute function public.po_notify();

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_code text not null unique,
  po_id uuid not null references public.purchase_orders(id) on delete restrict,
  po_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  quantity numeric(14,2) not null check (quantity > 0),
  received_on date not null default current_date,
  invoice_number text,
  notes text,
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create trigger goods_receipts_audit after insert on public.goods_receipts for each row execute function public.audit_row();

create or replace function public.po_set_status(p_po uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text; v uuid;
begin
  select status, vendor_id into cur, v from public.purchase_orders where id = p_po for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if p_status = 'approved' then
    if not public.is_super_admin() then raise exception 'Only a Super Admin can approve purchase orders'; end if;
    if cur <> 'pending_approval' then raise exception 'Only orders pending approval can be approved'; end if;
  else
    if not public.is_admin() then raise exception 'You do not have permission to change purchase orders'; end if;
    if p_status = 'pending_approval' then
      if cur <> 'draft' then raise exception 'Only draft orders can be submitted'; end if;
      if v is null then raise exception 'Select a vendor before submitting'; end if;
      if not exists (select 1 from public.purchase_order_items where po_id = p_po) then raise exception 'Add at least one item before submitting'; end if;
    elsif p_status = 'ordered' then
      if cur <> 'approved' then raise exception 'Only approved orders can be marked as ordered'; end if;
    elsif p_status = 'draft' then
      if cur <> 'pending_approval' then raise exception 'Only orders pending approval can be returned to draft'; end if;
    elsif p_status = 'cancelled' then
      if cur not in ('draft','pending_approval','approved','ordered') then raise exception 'This order can no longer be cancelled'; end if;
      if exists (select 1 from public.goods_receipts where po_id = p_po) then raise exception 'Goods were already received against this order'; end if;
    else raise exception 'Invalid status change';
    end if;
  end if;
  update public.purchase_orders set status = p_status, approved_by = case when p_status = 'approved' then auth.uid() else approved_by end where id = p_po;
end $$;

create or replace function public.receive_po_line(p_item uuid, p_qty numeric, p_invoice text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare it public.purchase_order_items; po public.purchase_orders; i int; remaining_items int;
begin
  if not public.is_admin() then raise exception 'You do not have permission to receive goods'; end if;
  select * into it from public.purchase_order_items where id = p_item for update;
  if not found then raise exception 'Order line not found'; end if;
  select * into po from public.purchase_orders where id = it.po_id for update;
  if po.status not in ('approved','ordered','partially_received') then raise exception 'Goods can only be received against approved or ordered purchase orders'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter the received quantity'; end if;
  if p_qty > it.quantity - it.received_qty then raise exception 'Received quantity exceeds the pending quantity (%)', it.quantity - it.received_qty; end if;

  insert into public.goods_receipts(receipt_code, po_id, po_item_id, quantity, invoice_number, notes, received_by)
  values (public.next_code('GRN',6), po.id, it.id, p_qty, p_invoice, p_notes, auth.uid());
  update public.purchase_order_items set received_qty = received_qty + p_qty where id = it.id;

  if it.receive_as = 'inventory' and it.inventory_item_id is not null then
    insert into public.inventory_transactions(item_id, txn_type, quantity, reference, unit_price, purpose, performed_by)
    values (it.inventory_item_id, 'stock_in', p_qty, po.po_number, it.unit_price, 'Goods receipt', auth.uid());
  elsif it.receive_as = 'asset' then
    if p_qty <> trunc(p_qty) or p_qty > 200 then raise exception 'Assets are registered one per unit: enter a whole quantity up to 200'; end if;
    for i in 1..p_qty::int loop
      insert into public.assets(asset_code, name, category_id, purchase_date, purchase_price, vendor_id, invoice_number, purchase_order_id, status, condition)
      values ('', it.description, it.asset_category_id, current_date, it.unit_price, po.vendor_id, p_invoice, po.id, 'available', 'new');
    end loop;
  end if;

  select count(*) into remaining_items from public.purchase_order_items where po_id = po.id and received_qty < quantity;
  update public.purchase_orders set status = case when remaining_items = 0 then 'received' else 'partially_received' end where id = po.id;
end $$;

create or replace function public.convert_request_to_po(p_request uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.purchase_requests; new_po uuid;
begin
  if not public.is_admin() then raise exception 'You do not have permission to create purchase orders'; end if;
  select * into r from public.purchase_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.approval_status <> 'approved' then raise exception 'Only approved requests can be converted'; end if;
  insert into public.purchase_orders(po_number, department_id, request_id, created_by, notes)
  values ('', r.department_id, r.id, auth.uid(), 'From request ' || r.request_code || ': ' || coalesce(r.reason,''))
  returning id into new_po;
  insert into public.purchase_order_items(po_id, description, quantity, unit_price)
  values (new_po, r.item_name || coalesce(' - ' || r.description, ''), r.quantity, coalesce(r.estimated_price,0));
  update public.purchase_requests set approval_status = 'converted', po_id = new_po where id = r.id;
  return new_po;
end $$;

-- ---------- vendor bills (GST computed on the server side) ----------------
create table public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  bill_code text not null unique,
  invoice_number text not null,
  invoice_date date not null default current_date,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  po_id uuid references public.purchase_orders(id) on delete set null,
  description text,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_treatment text not null default 'intra_state' check (tax_treatment in ('intra_state','inter_state','exempt')),
  gst_rate numeric(5,2) not null default 18 check (gst_rate >= 0 and gst_rate <= 100),
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  other_charges numeric(14,2) not null default 0 check (other_charges >= 0),
  grand_total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  outstanding numeric(14,2) not null default 0,
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid','cancelled')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (vendor_id, invoice_number)
);
create index vendor_bills_due_idx on public.vendor_bills(due_date) where status in ('unpaid','partially_paid');

create or replace function public.vendor_bills_before() returns trigger language plpgsql as $$
declare taxable numeric;
begin
  if tg_op = 'INSERT' then
    if new.bill_code is null or btrim(new.bill_code)='' then new.bill_code := public.next_code('BILL',6); end if;
    new.amount_paid := 0;
  end if;
  taxable := greatest(new.subtotal - new.discount, 0);
  if new.tax_treatment = 'intra_state' then
    new.cgst := round(taxable * new.gst_rate / 200, 2); new.sgst := new.cgst; new.igst := 0;
  elsif new.tax_treatment = 'inter_state' then
    new.igst := round(taxable * new.gst_rate / 100, 2); new.cgst := 0; new.sgst := 0;
  else new.cgst := 0; new.sgst := 0; new.igst := 0; new.gst_rate := 0; end if;
  new.grand_total := taxable + new.cgst + new.sgst + new.igst + new.other_charges;
  new.outstanding := greatest(new.grand_total - new.amount_paid, 0);
  if new.status <> 'cancelled' then
    new.status := case when new.grand_total > 0 and new.outstanding <= 0.004 then 'paid'
                       when new.amount_paid > 0 then 'partially_paid' else 'unpaid' end;
  end if;
  return new;
end $$;
create trigger vendor_bills_before_trg before insert or update on public.vendor_bills for each row execute function public.vendor_bills_before();
create trigger vendor_bills_updated before update on public.vendor_bills for each row execute function public.set_updated_at();
create trigger vendor_bills_audit after insert or update or delete on public.vendor_bills for each row execute function public.audit_row();

create table public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.vendor_bills(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null default 'bank_transfer' check (mode in ('cash','cheque','bank_transfer','upi','card','other')),
  reference text, remarks text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index vendor_payments_bill_idx on public.vendor_payments(bill_id);

create or replace function public.vendor_payments_before() returns trigger language plpgsql as $$
declare b public.vendor_bills;
begin
  select * into b from public.vendor_bills where id = new.bill_id for update;
  if b.status = 'cancelled' then raise exception 'This bill is cancelled'; end if;
  if new.amount > b.outstanding + 0.004 then raise exception 'Payment exceeds the outstanding amount (%)', b.outstanding; end if;
  return new;
end $$;
create trigger vendor_payments_before_trg before insert on public.vendor_payments for each row execute function public.vendor_payments_before();

create or replace function public.vendor_payments_after() returns trigger language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  bid := case when tg_op = 'DELETE' then old.bill_id else new.bill_id end;
  update public.vendor_bills set amount_paid = (select coalesce(sum(amount),0) from public.vendor_payments where bill_id = bid) where id = bid;
  return null;
end $$;
create trigger vendor_payments_after_trg after insert or delete on public.vendor_payments for each row execute function public.vendor_payments_after();
create trigger vendor_payments_audit after insert or update or delete on public.vendor_payments for each row execute function public.audit_row();

-- ---------- expenses & budgets --------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_code text not null unique,
  expense_date date not null default current_date,
  category text not null,
  description text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  gst_amount numeric(14,2) not null default 0 check (gst_amount >= 0),
  payment_mode text, payment_reference text,
  department_id uuid references public.departments(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  remarks text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses(expense_date);
create or replace function public.expenses_code() returns trigger language plpgsql as $$
begin if new.expense_code is null or btrim(new.expense_code)='' then new.expense_code := public.next_code('EXP',6); end if; return new; end $$;
create trigger expenses_code_trg before insert on public.expenses for each row execute function public.expenses_code();
create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function public.audit_row();

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  financial_year text not null check (financial_year ~ '^\d{4}-\d{2}$'), -- e.g. 2026-27 (April to March)
  department_id uuid references public.departments(id) on delete cascade,
  category text not null,
  month int check (month between 1 and 12), -- calendar month; null = annual budget
  allocated_amount numeric(14,2) not null check (allocated_amount >= 0),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index budgets_unique_idx on public.budgets(financial_year, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), category, coalesce(month, 0));
create trigger budgets_updated before update on public.budgets for each row execute function public.set_updated_at();
create trigger budgets_audit after insert or update or delete on public.budgets for each row execute function public.audit_row();

-- ---------- RLS -------------------------------------------------------------
alter table public.purchase_requests enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.vendor_bills enable row level security;
alter table public.vendor_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.budgets enable row level security;

create policy pr_select on public.purchase_requests for select to authenticated using (
  public.is_admin() or requested_by = auth.uid()
  or (public.current_role_key() = 'dept_head' and department_id is not null and department_id = public.my_department_id())
);
create policy pr_insert on public.purchase_requests for insert to authenticated
  with check (public.current_role_key() is not null and requested_by = auth.uid());
create policy pr_update on public.purchase_requests for update to authenticated
  using (public.is_admin() or (public.current_role_key() = 'dept_head' and department_id = public.my_department_id()))
  with check (public.is_admin() or (public.current_role_key() = 'dept_head' and department_id = public.my_department_id()));
create policy pr_delete on public.purchase_requests for delete to authenticated using (public.is_super_admin());

create policy po_select on public.purchase_orders for select to authenticated using (public.is_admin());
create policy po_insert on public.purchase_orders for insert to authenticated with check (public.is_admin());
create policy po_update on public.purchase_orders for update to authenticated using (public.is_admin() and status = 'draft') with check (public.is_admin());
create policy po_delete on public.purchase_orders for delete to authenticated using (public.is_super_admin() and status in ('draft','cancelled'));
create policy poi_select on public.purchase_order_items for select to authenticated using (public.is_admin());
create policy poi_write on public.purchase_order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy grn_select on public.goods_receipts for select to authenticated using (public.is_admin());

create policy bills_select on public.vendor_bills for select to authenticated using (public.is_admin());
create policy bills_insert on public.vendor_bills for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy bills_update on public.vendor_bills for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bills_delete on public.vendor_bills for delete to authenticated using (public.is_super_admin() and amount_paid = 0);
create policy payments_select on public.vendor_payments for select to authenticated using (public.is_admin());
create policy payments_insert on public.vendor_payments for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy payments_delete on public.vendor_payments for delete to authenticated using (public.is_super_admin());

create policy expenses_select on public.expenses for select to authenticated using (public.is_admin());
create policy expenses_insert on public.expenses for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy expenses_update on public.expenses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy expenses_delete on public.expenses for delete to authenticated using (public.is_super_admin());

create policy budgets_select on public.budgets for select to authenticated using (public.is_admin());
create policy budgets_insert on public.budgets for insert to authenticated with check (public.is_admin());
create policy budgets_update on public.budgets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy budgets_delete on public.budgets for delete to authenticated using (public.is_super_admin());
