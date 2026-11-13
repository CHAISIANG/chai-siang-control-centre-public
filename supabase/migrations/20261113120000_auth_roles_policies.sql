-- Login profiles, role helpers, row level security policies and the claim-files bucket.

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  role          text not null default 'pending'
                check (role in ('pending','management','supervisor','department','salesperson')),
  dept          text check (dept in ('Sales','Logistics','Finance')),
  salesman_code text references public.salesmen(code) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Helpers read the signed-in person's profile. security definer + fixed search_path avoids recursion in policies.
create function public.my_role() returns text
  language sql stable security definer set search_path = '' as
$$ select role from public.profiles where id = (select auth.uid()) $$;

create function public.my_salesman() returns text
  language sql stable security definer set search_path = '' as
$$ select salesman_code from public.profiles where id = (select auth.uid()) $$;

create function public.my_dept() returns text
  language sql stable security definer set search_path = '' as
$$ select dept from public.profiles where id = (select auth.uid()) $$;

-- The first person to sign up becomes management. Everyone after that waits as 'pending' until management assigns a role.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as
$$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when exists (select 1 from public.profiles) then 'pending' else 'management' end
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.my_role(), public.my_salesman(), public.my_dept(), public.handle_new_user() from public, anon;
grant  execute on function public.my_role(), public.my_salesman(), public.my_dept() to authenticated;

-- Claim numbers: PAF-2026-0414, 0415, ...
create sequence public.claim_no start 414;
alter table public.claims
  alter column id set default ('PAF-2026-' || lpad(nextval('public.claim_no')::text, 4, '0')),
  alter column submitted_on set default current_date;

-- ---------- policies ----------
-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.my_role()) = 'management');
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.my_role()) = 'management') with check ((select public.my_role()) = 'management');

-- reference data: staff see everything, a salesperson sees only their own rows
create policy salesmen_read on public.salesmen for select to authenticated
  using ((select public.my_role()) in ('management','supervisor','department') or code = (select public.my_salesman()));
create policy salesman_monthly_read on public.salesman_monthly for select to authenticated
  using ((select public.my_role()) in ('management','supervisor','department') or salesman_code = (select public.my_salesman()));
create policy customers_read on public.customers for select to authenticated
  using ((select public.my_role()) in ('management','supervisor','department') or salesman_code = (select public.my_salesman()));
create policy promo_lines_read on public.promo_lines for select to authenticated
  using ((select public.my_role()) in ('management','supervisor','department')
         or exists (select 1 from public.customers c where c.code = customer_code and c.salesman_code = (select public.my_salesman())));

-- claims: staff see all; a salesperson sees and edits their own; only the supervisor approves
create policy claims_read on public.claims for select to authenticated
  using ((select public.my_role()) in ('management','supervisor','department') or salesman_code = (select public.my_salesman()));
create policy claims_insert on public.claims for insert to authenticated
  with check (
    (select public.my_role()) in ('supervisor','department')
    or ((select public.my_role()) = 'salesperson' and salesman_code = (select public.my_salesman()) and status in ('Draft','Pending supervisor'))
  );
create policy claims_update on public.claims for update to authenticated
  using (
    (select public.my_role()) = 'supervisor'
    or ((select public.my_role()) = 'salesperson' and salesman_code = (select public.my_salesman()) and status = 'Draft')
  )
  with check (
    (select public.my_role()) = 'supervisor'
    or ((select public.my_role()) = 'salesperson' and salesman_code = (select public.my_salesman()) and status in ('Draft','Pending supervisor'))
  );
create policy claims_delete on public.claims for delete to authenticated
  using (
    (select public.my_role()) = 'supervisor'
    or ((select public.my_role()) = 'salesperson' and salesman_code = (select public.my_salesman()) and status = 'Draft')
  );

create policy claim_files_read on public.claim_files for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy claim_files_write on public.claim_files for insert to authenticated
  with check (exists (select 1 from public.claims c where c.id = claim_id
    and ((select public.my_role()) in ('supervisor','department') or (c.salesman_code = (select public.my_salesman()) and c.status = 'Draft'))));
create policy claim_files_delete on public.claim_files for delete to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id
    and ((select public.my_role()) = 'supervisor' or (c.salesman_code = (select public.my_salesman()) and c.status = 'Draft'))));

-- lorries and uploads: staff read; logistics, supervisor and management write
create policy lorries_read on public.lorries for select to authenticated
  using ((select public.my_role()) in ('management','supervisor','department'));
create policy lorries_write on public.lorries for all to authenticated
  using ((select public.my_role()) in ('management','supervisor') or ((select public.my_role()) = 'department' and (select public.my_dept()) = 'Logistics'))
  with check ((select public.my_role()) in ('management','supervisor') or ((select public.my_role()) = 'department' and (select public.my_dept()) = 'Logistics'));

create policy upload_log_read on public.upload_log for select to authenticated
  using ((select public.my_role()) in ('management','supervisor','department'));
create policy upload_log_insert on public.upload_log for insert to authenticated
  with check ((select public.my_role()) in ('management','supervisor','department'));

-- Private bucket for claim photos and documents, first path segment = claim id.
insert into storage.buckets (id, name, public) values ('claim-files', 'claim-files', false) on conflict do nothing;
create policy claim_files_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1]));
create policy claim_files_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1]
    and ((select public.my_role()) in ('supervisor','department') or (c.salesman_code = (select public.my_salesman()) and c.status = 'Draft'))));
create policy claim_files_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1]
    and ((select public.my_role()) = 'supervisor' or (c.salesman_code = (select public.my_salesman()) and c.status = 'Draft'))));
