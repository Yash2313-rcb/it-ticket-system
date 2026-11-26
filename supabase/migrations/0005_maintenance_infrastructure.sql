-- =====================================================================
-- Phase 5 - AMC, preventive maintenance, software licences, network
-- infrastructure, documents, generalised attachments. Run after 0004.
-- (Warranty tracking reads asset warranty dates; there is no separate warranties table.)
-- =====================================================================

create table public.amc_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_code text not null unique,
  asset_id uuid references public.assets(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  contract_type text not null default 'amc' check (contract_type in ('amc','cmc','warranty_extension','support','other')),
  start_date date not null, end_date date not null,
  amount numeric(14,2) default 0 check (amount is null or amount >= 0),
  service_frequency text, service_contact text,
  renewal_status text not null default 'active' check (renewal_status in ('active','renewal_due','renewed','expired','cancelled')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create or replace function public.amc_code() returns trigger language plpgsql as $$
begin if new.contract_code is null or btrim(new.contract_code)='' then new.contract_code := public.next_code('AMC',4); end if; return new; end $$;
create trigger amc_code_trg before insert on public.amc_contracts for each row execute function public.amc_code();
create trigger amc_updated before update on public.amc_contracts for each row execute function public.set_updated_at();
create trigger amc_audit after insert or update or delete on public.amc_contracts for each row execute function public.audit_row();

create table public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_code text not null unique,
  asset_id uuid references public.assets(id) on delete cascade,
  maintenance_type text not null check (maintenance_type in ('computer','printer','server','network','firewall','cctv','ups','antivirus_update','backup_verification','other')),
  scheduled_date date not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  checklist text,
  interval_days int check (interval_days is null or interval_days > 0), -- recurring when set
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  completion_date date,
  cost numeric(14,2) default 0,
  remarks text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index maintenance_schedules_date_idx on public.maintenance_schedules(scheduled_date) where status = 'scheduled';
create or replace function public.mnt_code() returns trigger language plpgsql as $$
begin if new.schedule_code is null or btrim(new.schedule_code)='' then new.schedule_code := public.next_code('MNT',6); end if; return new; end $$;
create trigger mnt_code_trg before insert on public.maintenance_schedules for each row execute function public.mnt_code();
create trigger mnt_updated before update on public.maintenance_schedules for each row execute function public.set_updated_at();
create trigger mnt_audit after insert or update or delete on public.maintenance_schedules for each row execute function public.audit_row();

create or replace function public.maintenance_complete(p_id uuid, p_cost numeric, p_remarks text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.maintenance_schedules;
begin
  select * into s from public.maintenance_schedules where id = p_id for update;
  if not found then raise exception 'Schedule not found'; end if;
  if not (public.is_admin() or (public.current_role_key() = 'it_member' and s.assigned_to = auth.uid())) then
    raise exception 'Only an administrator or the assigned technician can complete this';
  end if;
  if s.status <> 'scheduled' then raise exception 'This maintenance is already %', s.status; end if;
  update public.maintenance_schedules set status = 'completed', completion_date = current_date, cost = coalesce(p_cost,0), remarks = coalesce(p_remarks, remarks) where id = p_id;
  if s.asset_id is not null then
    insert into public.maintenance_records(asset_id, maintenance_type, service_date, cost, description, schedule_id, technician, created_by)
    values (s.asset_id, s.maintenance_type, current_date, coalesce(p_cost,0), coalesce(p_remarks, s.checklist), s.id,
            (select full_name from public.profiles where id = s.assigned_to), auth.uid());
  end if;
  if s.interval_days is not null then
    insert into public.maintenance_schedules(schedule_code, asset_id, maintenance_type, scheduled_date, assigned_to, checklist, interval_days)
    values ('', s.asset_id, s.maintenance_type, current_date + s.interval_days, s.assigned_to, s.checklist, s.interval_days);
  end if;
end $$;

create table public.software_licenses (
  id uuid primary key default gen_random_uuid(),
  software_name text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  category text not null default 'other' check (category in ('office','antivirus','operating_system','erp','accounting','cloud','other')),
  license_type text not null default 'subscription' check (license_type in ('perpetual','subscription','oem','volume','open_source')),
  license_key text,
  license_count int not null default 1 check (license_count > 0),
  purchase_date date, expiry_date date,
  renewal_cost numeric(14,2) default 0,
  subscription_type text not null default 'yearly' check (subscription_type in ('monthly','quarterly','yearly','none')),
  renewal_status text not null default 'active' check (renewal_status in ('active','renewal_due','renewed','expired','cancelled')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger licenses_updated before update on public.software_licenses for each row execute function public.set_updated_at();
create trigger licenses_audit after insert or update or delete on public.software_licenses for each row execute function public.audit_row();

create table public.license_assignments (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.software_licenses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  assigned_on date not null default current_date,
  unique (license_id, employee_id)
);
create or replace function public.license_seat_guard() returns trigger language plpgsql as $$
declare seats int; used int;
begin
  select license_count into seats from public.software_licenses where id = new.license_id;
  select count(*) into used from public.license_assignments where license_id = new.license_id;
  if used >= seats then raise exception 'All % seats of this licence are already allocated', seats; end if;
  return new;
end $$;
create trigger license_seat_guard_trg before insert on public.license_assignments for each row execute function public.license_seat_guard();

create table public.network_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  device_name text not null,
  device_type text not null check (device_type in ('server','router','switch','firewall','access_point','internet','cctv','nvr_dvr','rack','ups','other')),
  ip_address text, mac_address text, location text, model text, serial_number text,
  network_segment text, installation_date date,
  responsible_person uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive','faulty','retired')),
  remarks text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.net_code() returns trigger language plpgsql as $$
begin if new.device_code is null or btrim(new.device_code)='' then new.device_code := public.next_code('NET',4); end if; return new; end $$;
create trigger net_code_trg before insert on public.network_devices for each row execute function public.net_code();
create trigger net_updated before update on public.network_devices for each row execute function public.set_updated_at();
create trigger net_audit after insert or update or delete on public.network_devices for each row execute function public.audit_row();

create table public.ip_addresses (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null unique,
  network_segment text,
  device_id uuid references public.network_devices(id) on delete set null,
  assigned_to text,
  status text not null default 'in_use' check (status in ('in_use','free','reserved')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger ip_updated before update on public.ip_addresses for each row execute function public.set_updated_at();
create trigger ip_audit after insert or update or delete on public.ip_addresses for each row execute function public.audit_row();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  doc_code text not null unique,
  title text not null,
  category text not null default 'other' check (category in ('purchase_invoice','purchase_order','asset_document','warranty_certificate','amc_agreement','software_license','network_diagram','maintenance_report','vendor_agreement','it_policy','other')),
  description text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create or replace function public.doc_code() returns trigger language plpgsql as $$
begin if new.doc_code is null or btrim(new.doc_code)='' then new.doc_code := public.next_code('DOC',6); end if; return new; end $$;
create trigger doc_code_trg before insert on public.documents for each row execute function public.doc_code();
create trigger documents_audit after insert or update or delete on public.documents for each row execute function public.audit_row();

-- ---------- generalised attachments --------------------------------------
alter table public.attachments drop constraint attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('task','ticket','asset','bill','payment','po','document','maintenance','license','contract','expense','vendor'));

create or replace function public.attachment_access(p_type text, p_id uuid, p_write boolean) returns boolean
language sql stable as $$
  select case p_type
    when 'task'   then exists (select 1 from public.tasks t where t.id = p_id)
    when 'ticket' then exists (select 1 from public.tickets k where k.id = p_id)
    when 'asset'  then public.is_it_staff()
    when 'document' then case when p_write then public.is_admin() else public.is_it_staff() end
    else public.is_admin() end
$$;

drop policy attachments_select on public.attachments;
drop policy attachments_insert on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using (public.attachment_access(entity_type, entity_id, false));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.attachment_access(entity_type, entity_id, true));

-- ---------- RLS ------------------------------------------------------------
alter table public.amc_contracts enable row level security;
alter table public.maintenance_schedules enable row level security;
alter table public.software_licenses enable row level security;
alter table public.license_assignments enable row level security;
alter table public.network_devices enable row level security;
alter table public.ip_addresses enable row level security;
alter table public.documents enable row level security;

create policy amc_select on public.amc_contracts for select to authenticated using (public.is_it_staff());
create policy amc_insert on public.amc_contracts for insert to authenticated with check (public.is_admin());
create policy amc_update on public.amc_contracts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy amc_delete on public.amc_contracts for delete to authenticated using (public.is_super_admin());

create policy mnt_select on public.maintenance_schedules for select to authenticated using (public.is_it_staff());
create policy mnt_insert on public.maintenance_schedules for insert to authenticated with check (public.is_admin());
create policy mnt_update on public.maintenance_schedules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mnt_delete on public.maintenance_schedules for delete to authenticated using (public.is_super_admin());

-- licence keys are sensitive: administrators only
create policy lic_select on public.software_licenses for select to authenticated using (public.is_admin());
create policy lic_insert on public.software_licenses for insert to authenticated with check (public.is_admin());
create policy lic_update on public.software_licenses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lic_delete on public.software_licenses for delete to authenticated using (public.is_super_admin());
create policy licassign_select on public.license_assignments for select to authenticated using (public.is_admin());
create policy licassign_write on public.license_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- network details are sensitive: IT staff read, administrators write
create policy net_select on public.network_devices for select to authenticated using (public.is_it_staff());
create policy net_insert on public.network_devices for insert to authenticated with check (public.is_admin());
create policy net_update on public.network_devices for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy net_delete on public.network_devices for delete to authenticated using (public.is_super_admin());
create policy ip_select on public.ip_addresses for select to authenticated using (public.is_it_staff());
create policy ip_insert on public.ip_addresses for insert to authenticated with check (public.is_admin());
create policy ip_update on public.ip_addresses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ip_delete on public.ip_addresses for delete to authenticated using (public.is_super_admin());

create policy docs_select on public.documents for select to authenticated using (public.is_it_staff());
create policy docs_insert on public.documents for insert to authenticated with check (public.is_admin() and uploaded_by = auth.uid());
create policy docs_update on public.documents for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy docs_delete on public.documents for delete to authenticated using (public.is_super_admin());
