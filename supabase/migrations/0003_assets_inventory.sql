-- =====================================================================
-- Phase 3 - Assets, allocation history, transfers, disposal, inventory.
-- Run after 0002. (vendors table is created here because assets and stock reference it.)
-- =====================================================================
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_idx on public.notifications(dedupe_key) where dedupe_key is not null;

-- ---------- vendors ---------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique,
  company_name text not null,
  contact_person text, mobile text, email text, address text,
  gstin text, pan text,
  category text not null default 'other' check (category in ('computer','hardware','printer','networking','software','amc','cctv','isp','other')),
  payment_terms text,
  bank_details text,
  status text not null default 'active' check (status in ('active','inactive')),
  remarks text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.vendors_code() returns trigger language plpgsql as $$
begin if new.vendor_code is null or btrim(new.vendor_code)='' then new.vendor_code := public.next_code('VND',4); end if; return new; end $$;
create trigger vendors_code_trg before insert on public.vendors for each row execute function public.vendors_code();
create trigger vendors_updated before update on public.vendors for each row execute function public.set_updated_at();
create trigger vendors_audit after insert or update or delete on public.vendors for each row execute function public.audit_row();

-- ---------- assets ----------------------------------------------------
create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, is_active boolean not null default true, sort_order int not null default 0
);
insert into public.asset_categories(name, sort_order) values
 ('Desktop Computers',1),('Laptops',2),('Printers',3),('Scanners',4),('Servers',5),('Network Switches',6),
 ('Routers',7),('Firewalls',8),('Wi-Fi Access Points',9),('CCTV Cameras',10),('DVR / NVR',11),
 ('Biometric Devices',12),('UPS',13),('Monitors',14),('Keyboards',15),('Mouse',16),('Projectors',17),
 ('Storage Devices',18),('Other IT Equipment',19);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null,
  category_id uuid references public.asset_categories(id),
  brand text, model_number text, serial_number text,
  purchase_date date, purchase_price numeric(14,2) check (purchase_price is null or purchase_price >= 0),
  vendor_id uuid references public.vendors(id) on delete set null,
  invoice_number text,
  warranty_start date, warranty_end date,
  amc_details text,
  department_id uuid references public.departments(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  location text,
  status text not null default 'available' check (status in ('available','assigned','in_use','under_maintenance','damaged','lost','retired','disposed')),
  condition text not null default 'good' check (condition in ('new','good','fair','poor')),
  specifications text, remarks text,
  purchase_order_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index assets_serial_idx on public.assets(lower(serial_number)) where serial_number is not null and serial_number <> '';
create index assets_status_idx on public.assets(status);
create index assets_dept_idx on public.assets(department_id);
create index assets_employee_idx on public.assets(employee_id);
create index assets_warranty_idx on public.assets(warranty_end);
create or replace function public.assets_code() returns trigger language plpgsql as $$
begin if new.asset_code is null or btrim(new.asset_code)='' then new.asset_code := public.next_code('AST',6); end if; return new; end $$;
create trigger assets_code_trg before insert on public.assets for each row execute function public.assets_code();
create trigger assets_updated before update on public.assets for each row execute function public.set_updated_at();
create trigger assets_audit after insert or update or delete on public.assets for each row execute function public.audit_row();

-- keep the ticket/task asset links honest now that assets exist
alter table public.tickets add constraint tickets_asset_fk foreign key (asset_id) references public.assets(id) on delete set null;
alter table public.tasks   add constraint tasks_asset_fk   foreign key (asset_id) references public.assets(id) on delete set null;

create table public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  department_id uuid references public.departments(id),
  assigned_on date not null default current_date,
  returned_on date,
  return_condition text,
  assigned_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create unique index asset_assignments_open_idx on public.asset_assignments(asset_id) where returned_on is null;
create index asset_assignments_employee_idx on public.asset_assignments(employee_id);

create table public.asset_transfers (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  from_department_id uuid references public.departments(id),
  to_department_id uuid references public.departments(id),
  from_employee_id uuid references public.employees(id),
  to_employee_id uuid references public.employees(id),
  transfer_date date not null default current_date,
  reason text,
  transferred_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.asset_disposals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.assets(id) on delete cascade,
  disposal_date date not null default current_date,
  method text not null check (method in ('sold','scrapped','donated','returned_to_vendor','other')),
  disposal_value numeric(14,2) default 0,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  maintenance_type text not null,
  service_date date not null default current_date,
  vendor_id uuid references public.vendors(id) on delete set null,
  technician text,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  description text,
  schedule_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index maintenance_records_asset_idx on public.maintenance_records(asset_id, service_date desc);
create trigger maintenance_records_audit after insert or update or delete on public.maintenance_records for each row execute function public.audit_row();

-- ---------- asset operations (atomic, role-checked) -------------------
create or replace function public.asset_assign(p_asset uuid, p_employee uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assets; e public.employees;
begin
  if not public.is_admin() then raise exception 'You do not have permission to assign assets'; end if;
  select * into a from public.assets where id = p_asset for update;
  if not found then raise exception 'Asset not found'; end if;
  if a.status <> 'available' then raise exception 'Only available assets can be assigned (current status: %)', a.status; end if;
  select * into e from public.employees where id = p_employee;
  if not found or e.status <> 'active' then raise exception 'Select an active employee'; end if;
  insert into public.asset_assignments(asset_id, employee_id, department_id, notes, assigned_by)
  values (p_asset, p_employee, e.department_id, p_notes, auth.uid());
  update public.assets set employee_id = p_employee, department_id = e.department_id, status = 'assigned' where id = p_asset;
end $$;

create or replace function public.asset_return(p_asset uuid, p_condition text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You do not have permission to receive asset returns'; end if;
  if p_condition not in ('new','good','fair','poor') then raise exception 'Invalid condition'; end if;
  update public.asset_assignments
     set returned_on = current_date, return_condition = p_condition,
         notes = nullif(btrim(coalesce(notes,'') || E'\n' || coalesce(p_notes,'')), '')
   where asset_id = p_asset and returned_on is null;
  if not found then raise exception 'This asset is not currently assigned'; end if;
  update public.assets set employee_id = null, status = 'available', condition = p_condition where id = p_asset;
end $$;

create or replace function public.asset_transfer(p_asset uuid, p_to_department uuid, p_to_employee uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assets; e public.employees; new_dept uuid;
begin
  if not public.is_admin() then raise exception 'You do not have permission to transfer assets'; end if;
  select * into a from public.assets where id = p_asset for update;
  if not found then raise exception 'Asset not found'; end if;
  if a.status in ('lost','retired','disposed') then raise exception 'A % asset cannot be transferred', a.status; end if;
  if p_to_department is null and p_to_employee is null then raise exception 'Select a department or an employee to transfer to'; end if;
  new_dept := p_to_department;
  if p_to_employee is not null then
    select * into e from public.employees where id = p_to_employee;
    if not found or e.status <> 'active' then raise exception 'Select an active employee'; end if;
    new_dept := e.department_id;
  end if;
  insert into public.asset_transfers(asset_id, from_department_id, to_department_id, from_employee_id, to_employee_id, reason, transferred_by)
  values (p_asset, a.department_id, new_dept, a.employee_id, p_to_employee, p_reason, auth.uid());
  update public.asset_assignments set returned_on = current_date, return_condition = a.condition where asset_id = p_asset and returned_on is null;
  if p_to_employee is not null then
    insert into public.asset_assignments(asset_id, employee_id, department_id, notes, assigned_by)
    values (p_asset, p_to_employee, new_dept, 'Transfer: ' || coalesce(p_reason,''), auth.uid());
    update public.assets set employee_id = p_to_employee, department_id = new_dept, status = 'assigned' where id = p_asset;
  else
    update public.assets set employee_id = null, department_id = new_dept,
      status = case when status in ('assigned','in_use') then 'available' else status end where id = p_asset;
  end if;
end $$;

create or replace function public.asset_dispose(p_asset uuid, p_method text, p_value numeric, p_date date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You do not have permission to dispose assets'; end if;
  if exists (select 1 from public.assets where id = p_asset and status = 'disposed') then raise exception 'This asset is already disposed'; end if;
  insert into public.asset_disposals(asset_id, disposal_date, method, disposal_value, reason, created_by)
  values (p_asset, coalesce(p_date, current_date), p_method, coalesce(p_value,0), p_reason, auth.uid());
  update public.asset_assignments set returned_on = current_date where asset_id = p_asset and returned_on is null;
  update public.assets set status = 'disposed', employee_id = null where id = p_asset;
end $$;

-- ---------- inventory -------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  name text not null,
  category text not null default 'Other IT Consumables',
  brand text, model text,
  unit text not null default 'nos',
  opening_stock numeric(14,2) not null default 0 check (opening_stock >= 0),
  available_qty numeric(14,2) not null default 0,
  min_stock numeric(14,2) not null default 0 check (min_stock >= 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  storage_location text,
  vendor_id uuid references public.vendors(id) on delete set null,
  remarks text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.inventory_items_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.item_code is null or btrim(new.item_code)='' then new.item_code := public.next_code('INV',4); end if;
    new.available_qty := new.opening_stock;
  end if;
  return new;
end $$;
create trigger inventory_items_before_trg before insert on public.inventory_items for each row execute function public.inventory_items_before();
create trigger inventory_items_updated before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger inventory_items_audit after insert or update or delete on public.inventory_items for each row execute function public.audit_row();

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  txn_type text not null check (txn_type in ('stock_in','stock_out','transfer','adjustment','damaged','returned')),
  quantity numeric(14,2) not null check (quantity <> 0),
  quantity_after numeric(14,2),
  txn_date date not null default current_date,
  employee_id uuid references public.employees(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  purpose text, reference text, unit_price numeric(14,2),
  from_location text, to_location text,
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_txn_item_idx on public.inventory_transactions(item_id, created_at desc);
create index inventory_txn_date_idx on public.inventory_transactions(txn_date);

create or replace function public.inventory_txn_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur numeric; delta numeric;
begin
  select available_qty into cur from public.inventory_items where id = new.item_id for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if new.txn_type = 'adjustment' then
    if auth.uid() is not null and not public.is_admin() then raise exception 'Only an administrator can post stock adjustments'; end if;
    delta := new.quantity;
  else
    if new.quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    delta := case new.txn_type when 'stock_in' then new.quantity when 'returned' then new.quantity
                               when 'stock_out' then -new.quantity when 'damaged' then -new.quantity else 0 end;
    if cur + delta < 0 then raise exception 'Insufficient stock: only % available', cur; end if;
  end if;
  new.quantity_after := cur + delta;
  update public.inventory_items
     set available_qty = cur + delta,
         storage_location = case when new.txn_type = 'transfer' and new.to_location is not null then new.to_location else storage_location end
   where id = new.item_id;
  return new;
end $$;
create trigger inventory_txn_before_trg before insert on public.inventory_transactions for each row execute function public.inventory_txn_before();
create trigger inventory_txn_audit after insert on public.inventory_transactions for each row execute function public.audit_row();

create or replace function public.inventory_low_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.min_stock > 0 and new.available_qty <= new.min_stock and new.available_qty < old.available_qty then
    insert into public.notifications(user_id, type, title, body, link, dedupe_key)
    values (null, 'low_stock', 'Low stock: ' || new.name, new.available_qty || ' ' || new.unit || ' left (minimum ' || new.min_stock || ')',
            '/inventory/low-stock', 'lowstock:' || new.id || ':' || to_char(current_date,'YYYY-MM'))
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger inventory_low_stock_trg after update of available_qty on public.inventory_items for each row execute function public.inventory_low_stock();

-- ---------- RLS ---------------------------------------------------------
alter table public.vendors enable row level security;
alter table public.asset_categories enable row level security;
alter table public.assets enable row level security;
alter table public.asset_assignments enable row level security;
alter table public.asset_transfers enable row level security;
alter table public.asset_disposals enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;

-- vendors hold bank details: administrators only
create policy vendors_select on public.vendors for select to authenticated using (public.is_admin());
create policy vendors_insert on public.vendors for insert to authenticated with check (public.is_admin());
create policy vendors_update on public.vendors for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy vendors_delete on public.vendors for delete to authenticated using (public.is_super_admin());

create policy asset_categories_select on public.asset_categories for select to authenticated using (true);
create policy asset_categories_write on public.asset_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy assets_select on public.assets for select to authenticated using (
  public.is_it_staff()
  or (employee_id is not null and employee_id = public.my_employee_id())
  or (public.current_role_key() = 'dept_head' and department_id is not null and department_id = public.my_department_id())
);
create policy assets_insert on public.assets for insert to authenticated with check (public.is_admin());
create policy assets_update on public.assets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy assets_delete on public.assets for delete to authenticated using (public.is_super_admin());

-- history tables are written only by the asset_* functions (no insert policy)
create policy asset_assignments_select on public.asset_assignments for select to authenticated using (
  public.is_it_staff() or employee_id = public.my_employee_id()
);
create policy asset_transfers_select on public.asset_transfers for select to authenticated using (public.is_it_staff());
create policy asset_disposals_select on public.asset_disposals for select to authenticated using (public.is_it_staff());

create policy maintenance_records_select on public.maintenance_records for select to authenticated using (public.is_it_staff());
create policy maintenance_records_insert on public.maintenance_records for insert to authenticated with check (public.is_admin());
create policy maintenance_records_update on public.maintenance_records for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy maintenance_records_delete on public.maintenance_records for delete to authenticated using (public.is_super_admin());

create policy inventory_items_select on public.inventory_items for select to authenticated using (public.is_it_staff());
create policy inventory_items_insert on public.inventory_items for insert to authenticated with check (public.is_admin());
create policy inventory_items_update on public.inventory_items for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_items_delete on public.inventory_items for delete to authenticated using (public.is_super_admin());

create policy inventory_txn_select on public.inventory_transactions for select to authenticated using (public.is_it_staff());
create policy inventory_txn_insert on public.inventory_transactions for insert to authenticated
  with check (public.is_it_staff() and performed_by = auth.uid());
