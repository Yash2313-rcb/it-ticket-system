-- =====================================================================
-- Phase 2 - IT Operations: daily tasks, helpdesk tickets, comments,
-- attachments (Supabase Storage), categories, RLS, auto IDs, audit.
-- Run AFTER 0001_foundation.sql.
-- =====================================================================

-- ---------- helper functions ------------------------------------------
create or replace function public.my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_department_id() returns uuid
language sql stable security definer set search_path = public as $$
  select e.department_id from public.employees e
  join public.profiles p on p.employee_id = e.id
  where p.id = auth.uid()
$$;

-- Lets any signed-in user resolve display names (e.g. "assigned to") without reading emails/roles.
create or replace function public.profile_names(ids uuid[]) returns table(id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from public.profiles p
  where p.id = any(ids) and auth.uid() is not null
$$;

-- ---------- categories ------------------------------------------------
create table public.task_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0
);
create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0
);

insert into public.task_categories(name, sort_order) values
  ('Hardware Installation',1),('Software Installation',2),('Network Configuration',3),
  ('Printer Maintenance',4),('Server Maintenance',5),('User Account Management',6),
  ('Troubleshooting',7),('Security Updates',8),('IT Infrastructure',9),('Other Activities',10);

insert into public.ticket_categories(name, sort_order) values
  ('Computer / Laptop',1),('Printer',2),('Internet / Network',3),('Email',4),('Software',5),
  ('ERP',6),('Password / Login',7),('CCTV',8),('Hardware',9),('Other IT Requests',10);

-- ---------- tickets ---------------------------------------------------
create table public.tickets (
  id                 uuid primary key default gen_random_uuid(),
  ticket_code        text not null unique,
  title              text not null,
  description        text,
  category_id        uuid references public.ticket_categories(id),
  priority           text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status             text not null default 'open' check (status in ('open','assigned','in_progress','on_hold','resolved','closed')),
  employee_id        uuid references public.employees(id) on delete set null,
  department_id      uuid references public.departments(id) on delete set null,
  reported_by        uuid references public.profiles(id) on delete set null,
  reported_at        timestamptz not null default now(),
  assigned_to        uuid references public.profiles(id) on delete set null,
  due_at             timestamptz,
  resolution_details text,
  resolved_at        timestamptz,
  time_taken_minutes int,
  asset_id           uuid,            -- FK to assets is added in Phase 3
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index tickets_status_idx on public.tickets(status);
create index tickets_assigned_idx on public.tickets(assigned_to);
create index tickets_reported_by_idx on public.tickets(reported_by);
create index tickets_employee_idx on public.tickets(employee_id);
create index tickets_reported_at_idx on public.tickets(reported_at desc);
create index tickets_due_idx on public.tickets(due_at) where status in ('open','assigned','in_progress','on_hold');

create or replace function public.tickets_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and (new.ticket_code is null or btrim(new.ticket_code) = '') then
    new.ticket_code := public.next_code('TKT', 6);
  end if;

  -- Response target by priority: critical 4h, high 8h, medium 24h, low 72h
  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    new.due_at := new.reported_at + case new.priority
      when 'critical' then interval '4 hours'
      when 'high'     then interval '8 hours'
      when 'medium'   then interval '24 hours'
      else interval '72 hours' end;
  end if;

  if tg_op = 'UPDATE' then
    if new.status in ('resolved','closed') and new.resolved_at is null then
      new.resolved_at := now();
      new.time_taken_minutes := greatest(0, round(extract(epoch from (now() - new.reported_at)) / 60))::int;
    elsif new.status not in ('resolved','closed') then
      new.resolved_at := null;
      new.time_taken_minutes := null;
    end if;
  end if;
  return new;
end $$;
create trigger tickets_before_trg before insert or update on public.tickets
  for each row execute function public.tickets_before();
create trigger tickets_updated before update on public.tickets for each row execute function public.set_updated_at();
create trigger tickets_audit after insert or update or delete on public.tickets for each row execute function public.audit_row();

-- notify admins of new tickets (shown in the Phase 6 notification centre)
create or replace function public.tickets_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, type, title, body, link)
  values (null,
          case when new.priority in ('high','critical') then 'ticket_high_priority' else 'ticket_new' end,
          (case when new.priority in ('high','critical') then 'High-priority ticket ' else 'New ticket ' end) || new.ticket_code,
          new.title,
          '/operations/tickets/' || new.id);
  return new;
end $$;
create trigger tickets_notify_trg after insert on public.tickets for each row execute function public.tickets_notify();

-- ---------- tasks -----------------------------------------------------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  task_code          text not null unique,
  title              text not null,
  description        text,
  category_id        uuid references public.task_categories(id),
  task_date          date not null default current_date,
  start_time         time,
  end_time           time,
  assigned_by        uuid references public.profiles(id) on delete set null,
  performed_by       uuid references public.profiles(id) on delete set null,
  department_id      uuid references public.departments(id) on delete set null,
  priority           text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status             text not null default 'pending' check (status in ('pending','in_progress','completed','on_hold','cancelled')),
  time_spent_minutes int check (time_spent_minutes is null or time_spent_minutes >= 0),
  ticket_id          uuid references public.tickets(id) on delete set null,
  asset_id           uuid,            -- FK to assets is added in Phase 3
  remarks            text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index tasks_date_idx on public.tasks(task_date desc);
create index tasks_status_idx on public.tasks(status);
create index tasks_performed_idx on public.tasks(performed_by);
create index tasks_ticket_idx on public.tasks(ticket_id);

create or replace function public.tasks_set_code() returns trigger
language plpgsql as $$
begin
  if new.task_code is null or btrim(new.task_code) = '' then
    new.task_code := public.next_code('TSK', 6);
  end if;
  return new;
end $$;
create trigger tasks_code before insert on public.tasks for each row execute function public.tasks_set_code();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.audit_row();

-- ---------- comments --------------------------------------------------
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments(task_id, created_at);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index ticket_comments_ticket_idx on public.ticket_comments(ticket_id, created_at);

-- ---------- attachments -------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('task','ticket')),
  entity_id    uuid not null,
  file_path    text not null unique,
  file_name    text not null,
  file_size    bigint,
  content_type text,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments(entity_type, entity_id);

insert into storage.buckets(id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ---------- Row Level Security ----------------------------------------
alter table public.task_categories  enable row level security;
alter table public.ticket_categories enable row level security;
alter table public.tickets          enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_comments    enable row level security;
alter table public.ticket_comments  enable row level security;
alter table public.attachments      enable row level security;

create policy task_categories_select on public.task_categories for select to authenticated using (true);
create policy task_categories_write on public.task_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ticket_categories_select on public.ticket_categories for select to authenticated using (true);
create policy ticket_categories_write on public.ticket_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- tickets: IT staff see all; reporters see their own; the requester's employee record and department heads see their department
create policy tickets_select on public.tickets for select to authenticated using (
  public.is_it_staff()
  or reported_by = auth.uid()
  or (employee_id is not null and employee_id = public.my_employee_id())
  or (public.current_role_key() = 'dept_head' and department_id is not null and department_id = public.my_department_id())
);
create policy tickets_insert on public.tickets for insert to authenticated with check (
  public.current_role_key() is not null
  and reported_by = auth.uid()
  and (public.is_it_staff() or employee_id is not distinct from public.my_employee_id())
);
create policy tickets_update on public.tickets for update to authenticated
  using (public.is_it_staff()) with check (public.is_it_staff());
create policy tickets_delete on public.tickets for delete to authenticated using (public.is_super_admin());

-- tasks: admins see everything; team members see tasks they performed, assigned or created
create policy tasks_select on public.tasks for select to authenticated using (
  public.is_admin()
  or (public.current_role_key() = 'it_member'
      and (performed_by = auth.uid() or created_by = auth.uid() or assigned_by = auth.uid()))
);
create policy tasks_insert on public.tasks for insert to authenticated with check (
  public.is_admin()
  or (public.current_role_key() = 'it_member' and performed_by = auth.uid() and created_by = auth.uid())
);
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_admin() or (public.current_role_key() = 'it_member' and performed_by = auth.uid()))
  with check (public.is_admin() or (public.current_role_key() = 'it_member' and performed_by = auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_super_admin());

-- comments follow the visibility of their parent record
create policy task_comments_select on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy ticket_comments_select on public.ticket_comments for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy ticket_comments_insert on public.ticket_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.tickets t where t.id = ticket_id));

-- attachments follow the visibility of the parent record
create policy attachments_select on public.attachments for select to authenticated using (
  (entity_type = 'task'   and exists (select 1 from public.tasks t   where t.id = entity_id))
  or (entity_type = 'ticket' and exists (select 1 from public.tickets k where k.id = entity_id))
);
create policy attachments_insert on public.attachments for insert to authenticated with check (
  uploaded_by = auth.uid() and (
    (entity_type = 'task'   and exists (select 1 from public.tasks t   where t.id = entity_id))
    or (entity_type = 'ticket' and exists (select 1 from public.tickets k where k.id = entity_id))
  )
);
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());

-- Storage: files live under <user id>/..., readable only when an attachment row is visible to the caller
create policy attachments_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy attachments_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and exists (select 1 from public.attachments a where a.file_path = storage.objects.name));
create policy attachments_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
