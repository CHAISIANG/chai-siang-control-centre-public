-- Roles, editable permissions, protected super admin, and permission-based row level security.

-- ---------- catalog ----------
create table public.roles (
  name       text primary key,
  label      text not null,
  is_system  boolean not null default false,
  is_super   boolean not null default false,
  sort       int not null default 100
);
create table public.permissions (
  key    text primary key,
  label  text not null,
  grp    text not null,
  sort   int not null default 100
);
create table public.role_permissions (
  role        text not null references public.roles(name) on delete cascade on update cascade,
  permission  text not null references public.permissions(key) on delete cascade,
  allowed     boolean not null default true,
  primary key (role, permission)
);
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

insert into public.roles (name, label, is_system, is_super, sort) values
  ('super_admin', 'Super admin',          true, true, 0),
  ('management',  'Management',           true, false, 10),
  ('supervisor',  'Supervisor',           true, false, 20),
  ('salesperson', 'Salesperson',          true, false, 30),
  ('logistics',   'Logistics',            false, false, 40),
  ('finance',     'Finance',              false, false, 50),
  ('pending',     'Waiting for access',   true, false, 999);

insert into public.permissions (key, label, grp, sort) values
  ('page_dashboard',  'Dashboard',                                   'Pages', 1),
  ('page_sales',      'Sales and coverage',                          'Pages', 2),
  ('page_customers',  'Customers and credit',                        'Pages', 3),
  ('page_logistics',  'Logistics',                                   'Pages', 4),
  ('page_claims',     'Claims (PAF forms)',                          'Pages', 5),
  ('page_upload',     'Data upload',                                 'Pages', 6),
  ('view_all_data',   'See everyone''s data, not only own customers','Data', 10),
  ('claims_create',   'Create and submit claims',                    'Claims', 20),
  ('claims_edit_draft','Edit draft claims',                          'Claims', 21),
  ('claims_approve',  'Approve or reject claims',                    'Claims', 22),
  ('lorries_manage',  'Update the lorry board',                      'Logistics', 30),
  ('verify_daily',    'Tick the daily verification',                 'Dashboard', 40),
  ('users_manage',    'Create, edit and delete users',               'Admin', 50),
  ('roles_manage',    'Edit roles and permissions',                  'Admin', 51);

insert into public.role_permissions (role, permission)
select r, p from (values
  ('management','page_dashboard'),('management','page_sales'),('management','page_customers'),('management','page_logistics'),('management','page_claims'),('management','page_upload'),('management','view_all_data'),
  ('supervisor','page_dashboard'),('supervisor','page_sales'),('supervisor','page_customers'),('supervisor','page_logistics'),('supervisor','page_claims'),('supervisor','page_upload'),('supervisor','view_all_data'),
  ('supervisor','claims_create'),('supervisor','claims_edit_draft'),('supervisor','claims_approve'),('supervisor','lorries_manage'),('supervisor','verify_daily'),
  ('salesperson','page_dashboard'),('salesperson','page_sales'),('salesperson','page_customers'),('salesperson','page_claims'),('salesperson','claims_create'),('salesperson','claims_edit_draft'),
  ('logistics','page_dashboard'),('logistics','page_logistics'),('logistics','view_all_data'),('logistics','lorries_manage'),
  ('finance','page_dashboard'),('finance','page_customers'),('finance','page_claims'),('finance','page_upload'),('finance','view_all_data')
) as t(r, p);

-- ---------- drop the old role-name policies and helpers ----------
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists salesmen_read on public.salesmen;
drop policy if exists salesman_monthly_read on public.salesman_monthly;
drop policy if exists customers_read on public.customers;
drop policy if exists promo_lines_read on public.promo_lines;
drop policy if exists claims_read on public.claims;
drop policy if exists claims_insert on public.claims;
drop policy if exists claims_update on public.claims;
drop policy if exists claims_delete on public.claims;
drop policy if exists claim_files_read on public.claim_files;
drop policy if exists claim_files_write on public.claim_files;
drop policy if exists claim_files_delete on public.claim_files;
drop policy if exists lorries_read on public.lorries;
drop policy if exists lorries_write on public.lorries;
drop policy if exists upload_log_read on public.upload_log;
drop policy if exists upload_log_insert on public.upload_log;
drop policy if exists claim_files_objects_read on storage.objects;
drop policy if exists claim_files_objects_insert on storage.objects;
drop policy if exists claim_files_objects_delete on storage.objects;
drop function if exists public.my_role();
drop function if exists public.my_dept();

-- ---------- profiles ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop column if exists dept;
alter table public.profiles
  add column if not exists active    boolean not null default true,
  add column if not exists protected boolean not null default false;
alter table public.profiles
  add constraint profiles_role_fkey foreign key (role) references public.roles(name) on update cascade;

-- Nobody gets access by signing up. New logins start as 'pending' until a user manager assigns a role.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as
$$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- helpers ----------
create function public.my_role() returns text
  language sql stable security definer set search_path = '' as
$$ select role from public.profiles where id = (select auth.uid()) and active $$;

create or replace function public.my_salesman() returns text
  language sql stable security definer set search_path = '' as
$$ select salesman_code from public.profiles where id = (select auth.uid()) and active $$;

-- Super admin always passes. Everyone else needs the permission ticked on their role.
create function public.has_perm(p text) returns boolean
  language sql stable security definer set search_path = '' as
$$
  select coalesce((
    select r.is_super or exists (
      select 1 from public.role_permissions rp where rp.role = pr.role and rp.permission = p and rp.allowed
    )
    from public.profiles pr join public.roles r on r.name = pr.role
    where pr.id = (select auth.uid()) and pr.active
  ), false)
$$;

create function public.sees_data() returns boolean
  language sql stable security definer set search_path = '' as
$$ select public.has_perm('page_dashboard') or public.has_perm('page_sales') or public.has_perm('page_customers') or public.has_perm('page_claims') $$;

-- A row belongs to the person when they may see all data, or it is their own salesman's row.
create function public.in_scope(code text) returns boolean
  language sql stable security definer set search_path = '' as
$$ select public.has_perm('view_all_data') or (code is not null and code = public.my_salesman()) $$;

revoke execute on function public.my_role(), public.my_salesman(), public.has_perm(text), public.sees_data(), public.in_scope(text) from public, anon;
grant  execute on function public.my_role(), public.my_salesman(), public.has_perm(text), public.sees_data(), public.in_scope(text) to authenticated;

-- ---------- policies ----------
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_perm('users_manage')));

create policy roles_read on public.roles for select to authenticated using (true);
create policy roles_insert on public.roles for insert to authenticated
  with check ((select public.has_perm('roles_manage')) and not is_super and not is_system);
create policy roles_update on public.roles for update to authenticated
  using ((select public.has_perm('roles_manage')) and not is_super)
  with check ((select public.has_perm('roles_manage')) and not is_super);
create policy roles_delete on public.roles for delete to authenticated
  using ((select public.has_perm('roles_manage')) and not is_system and not is_super);

create policy permissions_read on public.permissions for select to authenticated using (true);

create policy role_permissions_read on public.role_permissions for select to authenticated
  using ((select public.has_perm('roles_manage')) or role = (select public.my_role()));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using ((select public.has_perm('roles_manage')) and role <> 'super_admin')
  with check ((select public.has_perm('roles_manage')) and role <> 'super_admin');

create policy salesmen_read on public.salesmen for select to authenticated
  using ((select public.sees_data()) and public.in_scope(code));
create policy salesman_monthly_read on public.salesman_monthly for select to authenticated
  using ((select public.sees_data()) and public.in_scope(salesman_code));
create policy customers_read on public.customers for select to authenticated
  using ((select public.sees_data()) and public.in_scope(salesman_code));
create policy promo_lines_read on public.promo_lines for select to authenticated
  using ((select public.sees_data()) and ((select public.has_perm('view_all_data'))
         or exists (select 1 from public.customers c where c.code = customer_code)));

create policy claims_read on public.claims for select to authenticated
  using ((select public.has_perm('page_claims')) and public.in_scope(salesman_code));
create policy claims_insert on public.claims for insert to authenticated
  with check ((select public.has_perm('claims_create')) and public.in_scope(salesman_code) and status in ('Draft','Pending supervisor'));
create policy claims_update_approve on public.claims for update to authenticated
  using ((select public.has_perm('claims_approve'))) with check ((select public.has_perm('claims_approve')));
create policy claims_update_edit on public.claims for update to authenticated
  using ((select public.has_perm('claims_edit_draft')) and status = 'Draft' and public.in_scope(salesman_code))
  with check ((select public.has_perm('claims_edit_draft')) and public.in_scope(salesman_code) and status in ('Draft','Pending supervisor'));
create policy claims_delete on public.claims for delete to authenticated
  using ((select public.has_perm('claims_approve'))
         or ((select public.has_perm('claims_edit_draft')) and status = 'Draft' and public.in_scope(salesman_code)));

create policy claim_files_read on public.claim_files for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy claim_files_write on public.claim_files for insert to authenticated
  with check (exists (select 1 from public.claims c where c.id = claim_id
    and ((select public.has_perm('claims_approve')) or ((select public.has_perm('claims_edit_draft')) and c.status = 'Draft'))));
create policy claim_files_delete on public.claim_files for delete to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id
    and ((select public.has_perm('claims_approve')) or ((select public.has_perm('claims_edit_draft')) and c.status = 'Draft'))));

create policy lorries_read on public.lorries for select to authenticated using ((select public.has_perm('page_logistics')));
create policy lorries_write on public.lorries for all to authenticated
  using ((select public.has_perm('lorries_manage'))) with check ((select public.has_perm('lorries_manage')));

create policy upload_log_read on public.upload_log for select to authenticated using ((select public.has_perm('page_upload')));
create policy upload_log_insert on public.upload_log for insert to authenticated with check ((select public.has_perm('page_upload')));

create policy claim_files_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1]));
create policy claim_files_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1]
    and ((select public.has_perm('claims_approve')) or ((select public.has_perm('claims_edit_draft')) and c.status = 'Draft'))));
create policy claim_files_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1]
    and ((select public.has_perm('claims_approve')) or ((select public.has_perm('claims_edit_draft')) and c.status = 'Draft'))));

-- ---------- super admin protection ----------
-- A protected profile cannot be deleted, switched off or re-roled by the API, the app or the dashboard's user list.
-- Only a database owner (SQL editor) can change it, for example: update public.profiles set protected = false where ...
create function public.protect_profile() returns trigger
  language plpgsql set search_path = '' as
$$
begin
  if tg_op = 'DELETE' then
    if old.protected and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'This account is protected and cannot be deleted.';
    end if;
    return old;
  end if;
  if old.protected and current_user not in ('postgres', 'supabase_admin')
     and (new.role is distinct from old.role or new.protected is distinct from old.protected or new.active is distinct from old.active) then
    raise exception 'This account is protected and cannot be changed.';
  end if;
  return new;
end;
$$;
create trigger protect_profile_write before update or delete on public.profiles
  for each row execute function public.protect_profile();

create function public.protect_auth_user() returns trigger
  language plpgsql set search_path = '' as
$$
begin
  if exists (select 1 from public.profiles p where p.id = old.id and p.protected)
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'This account is protected and cannot be deleted.';
  end if;
  return old;
end;
$$;
create trigger protect_auth_user_delete before delete on auth.users
  for each row execute function public.protect_auth_user();
revoke execute on function public.protect_profile(), public.protect_auth_user() from public, anon, authenticated;

-- ---------- the super admin ----------
-- The one login that exists today (the owner's) becomes the protected super admin.
update public.profiles set role = 'super_admin', protected = true
where id = (select id from public.profiles order by created_at limit 1);
