-- =====================================================================
-- Phase 1 - Core foundation
-- Roles, profiles, departments, employees, audit log, notifications,
-- settings, auto-ID generator, RLS.
-- Run in Supabase SQL editor (or `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helpers ---------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Auto-ID generator: next_code('EMP', 4) -> EMP-0001
create table public.id_counters (
  prefix     text primary key,
  last_value bigint not null default 0
);

create or replace function public.next_code(p text, width int default 4) returns text
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.id_counters(prefix, last_value) values (p, 1)
  on conflict (prefix) do update set last_value = public.id_counters.last_value + 1
  returning last_value into v;
  return p || '-' || lpad(v::text, width, '0');
end $$;

-- ---------- roles & permissions --------------------------------------
create table public.roles (
  key         text primary key,
  name        text not null,
  description text,
  sort_order  int not null default 0
);

create table public.permissions (
  key         text primary key,
  module      text not null,
  description text
);

create table public.role_permissions (
  role_key       text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

insert into public.roles(key, name, description, sort_order) values
  ('super_admin', 'Super Admin',          'Full system access, users, settings, approvals', 1),
  ('it_admin',    'IT Administrator',     'Runs daily IT operations, assets, purchases, reports', 2),
  ('it_member',   'IT Team Member',       'Works assigned tasks, tickets and maintenance', 3),
  ('dept_head',   'Department Head',      'Raises requests, views department assets, approves where authorised', 4),
  ('employee',    'Employee',             'Raises complaints and requests, sees own assets', 5);

insert into public.permissions(key, module, description) values
  ('users.manage',        'organization', 'Create users and change roles'),
  ('employees.read',      'organization', 'View employee directory'),
  ('employees.write',     'organization', 'Create and edit employees'),
  ('departments.write',   'organization', 'Create and edit departments'),
  ('settings.manage',     'settings',     'Change application settings'),
  ('audit.read',          'settings',     'View audit log'),
  ('tasks.manage',        'operations',   'Create and manage tasks'),
  ('tasks.update_own',    'operations',   'Update status of assigned tasks'),
  ('tickets.manage',      'operations',   'Manage all tickets'),
  ('tickets.create',      'operations',   'Raise a ticket'),
  ('assets.manage',       'assets',       'Create and manage assets'),
  ('inventory.manage',    'inventory',    'Manage stock'),
  ('purchases.manage',    'procurement',  'Manage requests, POs, vendors'),
  ('purchases.approve',   'procurement',  'Approve purchases and expenses'),
  ('finance.manage',      'finance',      'Record bills, payments, expenses'),
  ('reports.view',        'reports',      'Access reports');

insert into public.role_permissions(role_key, permission_key)
select 'super_admin', key from public.permissions;

insert into public.role_permissions(role_key, permission_key) values
  ('it_admin','employees.read'),('it_admin','employees.write'),('it_admin','departments.write'),
  ('it_admin','tasks.manage'),('it_admin','tickets.manage'),('it_admin','assets.manage'),
  ('it_admin','inventory.manage'),('it_admin','purchases.manage'),('it_admin','finance.manage'),
  ('it_admin','reports.view'),
  ('it_member','employees.read'),('it_member','tasks.update_own'),('it_member','tickets.manage'),
  ('dept_head','employees.read'),('dept_head','tickets.create'),('dept_head','purchases.approve'),
  ('employee','tickets.create');

-- ---------- departments ----------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null unique,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- employees --------------------------------------------------
create table public.employees (
  id            uuid primary key default gen_random_uuid(),
  emp_code      text not null unique,
  full_name     text not null,
  department_id uuid references public.departments(id) on delete restrict,
  designation   text,
  email         text unique,
  phone         text,
  location      text,
  joining_date  date,
  status        text not null default 'active' check (status in ('active','inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index employees_department_idx on public.employees(department_id);
create index employees_name_idx on public.employees(lower(full_name));
create index employees_status_idx on public.employees(status);

create or replace function public.employees_set_code() returns trigger
language plpgsql as $$
begin
  if new.emp_code is null or btrim(new.emp_code) = '' then
    new.emp_code := public.next_code('EMP', 4);
  end if;
  return new;
end $$;
create trigger employees_code before insert on public.employees
  for each row execute function public.employees_set_code();

-- ---------- profiles (1:1 with auth.users) -----------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        text not null default 'employee' references public.roles(key),
  employee_id uuid references public.employees(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);

-- First user ever created becomes Super Admin; everyone else starts as Employee.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles(id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when first_user then 'super_admin' else 'employee' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- role helper functions (used by RLS) ------------------------
create or replace function public.current_role_key() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_key() in ('super_admin','it_admin'), false)
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_key() = 'super_admin', false)
$$;

create or replace function public.is_it_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_key() in ('super_admin','it_admin','it_member'), false)
$$;

create or replace function public.has_permission(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_permissions rp
    where rp.role_key = public.current_role_key() and rp.permission_key = p
  )
$$;

-- ---------- audit log ---------------------------------------------------
create table public.activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,          -- INSERT / UPDATE / DELETE / custom
  entity_type text not null,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs(created_at desc);
create index activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_id text;
begin
  if tg_op = 'INSERT' then v_new := to_jsonb(new); v_id := v_new->>'id';
  elsif tg_op = 'UPDATE' then v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := v_new->>'id';
  else v_old := to_jsonb(old); v_id := v_old->>'id';
  end if;
  insert into public.activity_logs(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), tg_op, tg_table_name, v_id, jsonb_build_object('old', v_old, 'new', v_new));
  return coalesce(new, old);
end $$;

-- ---------- notifications ----------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade, -- null = all admins
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

-- ---------- system settings ----------------------------------------------
create table public.system_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.system_settings(key, value) values
  ('organization_name', '"Your Manufacturing Company"'),
  ('financial_year_start_month', '4');

-- ---------- triggers: updated_at + audit --------------------------------
create trigger departments_updated before update on public.departments for each row execute function public.set_updated_at();
create trigger employees_updated   before update on public.employees   for each row execute function public.set_updated_at();
create trigger profiles_updated    before update on public.profiles    for each row execute function public.set_updated_at();

create trigger departments_audit after insert or update or delete on public.departments for each row execute function public.audit_row();
create trigger employees_audit   after insert or update or delete on public.employees   for each row execute function public.audit_row();
create trigger profiles_audit    after insert or update or delete on public.profiles    for each row execute function public.audit_row();

-- ---------- Row Level Security -------------------------------------------
alter table public.id_counters      enable row level security;  -- no policies: only security-definer fns touch it
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.departments      enable row level security;
alter table public.employees        enable row level security;
alter table public.profiles         enable row level security;
alter table public.activity_logs    enable row level security;
alter table public.notifications    enable row level security;
alter table public.system_settings  enable row level security;

-- roles / permissions: readable by any signed-in user, changed only by migrations
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_it_staff());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- departments: everyone signed-in can read; admins write; only super admin deletes
create policy departments_select on public.departments for select to authenticated using (true);
create policy departments_insert on public.departments for insert to authenticated with check (public.is_admin());
create policy departments_update on public.departments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy departments_delete on public.departments for delete to authenticated using (public.is_super_admin());

-- employees: IT staff and department heads read the directory; employees read only their own record
create policy employees_select on public.employees for select to authenticated
  using (
    public.is_it_staff()
    or public.current_role_key() = 'dept_head'
    or id = (select employee_id from public.profiles where id = auth.uid())
  );
create policy employees_insert on public.employees for insert to authenticated with check (public.is_admin());
create policy employees_update on public.employees for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy employees_delete on public.employees for delete to authenticated using (public.is_super_admin());

-- audit log: admins read; rows are written only by the security-definer trigger
create policy activity_logs_select on public.activity_logs for select to authenticated using (public.is_admin());

-- notifications
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() or (user_id is null and public.is_admin()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid() or (user_id is null and public.is_admin()))
  with check (user_id = auth.uid() or (user_id is null and public.is_admin()));

-- settings
create policy settings_select on public.system_settings for select to authenticated using (true);
create policy settings_update on public.system_settings for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
