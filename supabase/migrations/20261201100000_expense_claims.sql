-- Expense claims: staff claim work expenses with receipts; Manager -> Finance -> Director approve; Finance pays.
-- Checks on limits and budgets only warn (on screen). The rules that protect money are checked here on the server.

-- ---------- roles and permissions ----------
insert into public.roles (name, label, is_system, is_super, sort) values ('director', 'Director', false, false, 12)
  on conflict (name) do nothing;
-- a Director sees everything Management sees, plus the final claim approval
insert into public.role_permissions (role, permission, allowed)
  select 'director', permission, allowed from public.role_permissions where role = 'management'
  on conflict do nothing;
insert into public.permissions (key, label, grp, sort) values
  ('exp_finance',  'Expense claims: Finance check and payment (step 2)', 'HR', 85),
  ('exp_director', 'Expense claims: final approval (step 3)', 'HR', 86),
  ('exp_reports',  'Expense claims: reports', 'HR', 87),
  ('exp_admin',    'Expense claims: categories and rules', 'HR', 88)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('finance', 'exp_finance'), ('director', 'exp_director'),
  ('finance', 'exp_reports'), ('director', 'exp_reports'), ('management', 'exp_reports'), ('hr', 'exp_reports'),
  ('finance', 'exp_admin'), ('management', 'exp_admin'), ('hr', 'exp_admin'), ('director', 'exp_admin'),
  ('finance', 'hr_self')
  on conflict do nothing;

-- ---------- tables ----------
create table public.expense_categories (
  code             text primary key,
  name             text not null,
  per_item_limit   numeric(12,2) check (per_item_limit is null or per_item_limit >= 0),
  monthly_budget   numeric(12,2) check (monthly_budget is null or monthly_budget >= 0),
  receipt_required boolean not null default true,
  mileage          boolean not null default false,
  active           boolean not null default true,
  sort             int not null default 0
);
insert into public.expense_categories (code, name, per_item_limit, monthly_budget, receipt_required, mileage, sort) values
  ('MIL', 'Mileage', null, 3000, false, true, 1),
  ('PKT', 'Parking & toll', 100, 1500, true, false, 2),
  ('MEL', 'Meals & entertainment', 200, 3000, true, false, 3),
  ('ACC', 'Accommodation', 350, 4000, true, false, 4),
  ('PHN', 'Phone & internet', 150, 1000, true, false, 5),
  ('OFF', 'Office supplies', 300, 1500, true, false, 6),
  ('TRN', 'Training & courses', 1500, 5000, true, false, 7),
  ('MED', 'Medical (outpatient)', 150, 2000, true, false, 8);

create table public.expense_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
insert into public.expense_settings (id, data) values (1, '{"monthlyLimit": 2000, "mileageRate": 0.6, "levels": {"manager": true, "finance": true, "director": true}}');

-- bank details for paying claims: only the person, Finance and HR can read them
create table public.expense_banks (
  emp_id       uuid primary key references public.hr_employees(id) on delete cascade,
  bank         text not null,
  account_name text not null,
  account_no   text not null check (account_no ~ '^[0-9]{8,17}$'),
  updated_at   timestamptz not null default now()
);

create sequence public.expense_no_seq;
create table public.expense_claims (
  id            uuid primary key default gen_random_uuid(),
  no            text not null unique,
  emp_id        uuid not null references public.hr_employees(id) on delete cascade,
  title         text not null,
  status        text not null default 'Draft' check (status in ('Draft','Pending manager','Pending finance','Pending director','Approved','Processing','Paid','Rejected')),
  route         int[] not null default '{}',   -- the approval steps this claim goes through, fixed when it is sent
  created_at    date not null,
  submitted_at  date,
  pay_ref       text,
  paid_at       date,
  pay_method    text,
  updated_at    timestamptz not null default now()
);
create index expense_claims_emp_idx on public.expense_claims (emp_id, created_at);
create index expense_claims_status_idx on public.expense_claims (status);

create table public.expense_items (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.expense_claims(id) on delete cascade,
  sort         int not null default 0,
  date         date not null,
  cat          text not null references public.expense_categories(code),
  description  text not null default '',
  amount       numeric(12,2) not null check (amount > 0),
  tax          text not null default 'none' check (tax in ('none','SV8','SV6','SL10','SL5')),
  receipt_path text,
  from_place   text,
  to_place     text,
  km           numeric(8,1) check (km is null or km > 0)
);
create index expense_items_claim_idx on public.expense_items (claim_id);

create table public.expense_steps (
  id        bigint generated always as identity primary key,
  claim_id  uuid not null references public.expense_claims(id) on delete cascade,
  on_date   date not null,
  by_emp    uuid references public.hr_employees(id) on delete set null,
  by_name   text,
  action    text not null check (action in ('Submitted','Approved','Rejected','Processing','Paid')),
  level     int check (level in (1,2,3)),
  note      text
);
create index expense_steps_claim_idx on public.expense_steps (claim_id);

-- ---------- helpers ----------
create or replace function public.exp_set() returns jsonb language sql stable security definer set search_path = '' as
$$ select data from public.expense_settings where id = 1 $$;

-- who may look at a person's claims: themselves, their manager, HR, Finance or a Director
create or replace function public.exp_can_see(p_emp uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select public.hr_can_see(p_emp) or public.has_perm('exp_finance') or public.has_perm('exp_director') $$;

-- staff whose login has a permission (for telling Finance or the Directors that a claim is waiting)
create or replace function public.exp_people(p_perm text) returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.hr_employees e join public.profiles p on p.id = e.profile_id join public.roles r on r.name = p.role
  where e.active and p.active and (r.is_super or exists (select 1 from public.role_permissions rp where rp.role = p.role and rp.permission = p_perm and rp.allowed))
$$;

create or replace function public.exp_status_for(p_level int) returns text language sql immutable set search_path = '' as
$$ select case p_level when 1 then 'Pending manager' when 2 then 'Pending finance' when 3 then 'Pending director' end $$;

create or replace function public.exp_who(p_emp uuid) returns text language sql stable security definer set search_path = '' as
$$ select coalesce((select name from public.hr_employees where id = p_emp), (select full_name from public.profiles where id = (select auth.uid())), 'Someone') $$;

-- tell the people who decide the claim's current step
create or replace function public.exp_notify_next(p_claim uuid) returns void language plpgsql security definer set search_path = '' as $$
declare c record; e record; t text;
begin
  select * into c from public.expense_claims where id = p_claim;
  select * into e from public.hr_employees where id = c.emp_id;
  t := format('Claim %s from %s (RM %s) is waiting for your approval.', c.no, split_part(e.name, ' ', 1),
       to_char((select sum(amount) from public.expense_items where claim_id = c.id), 'FM999,990.00'));
  if c.status = 'Pending manager' then perform public.hr_note(e.manager_id, t, '/hr/claims/approvals');
  elsif c.status = 'Pending finance' then perform public.hr_note(x, t, '/hr/claims/approvals') from public.exp_people('exp_finance') x where x <> c.emp_id;
  elsif c.status = 'Pending director' then perform public.hr_note(x, t, '/hr/claims/approvals') from public.exp_people('exp_director') x where x <> c.emp_id;
  elsif c.status = 'Approved' then
    perform public.hr_note(x, format('Claim %s from %s is fully approved and ready to pay.', c.no, split_part(e.name, ' ', 1)), '/hr/claims/payments') from public.exp_people('exp_finance') x;
  end if;
end $$;

-- ---------- actions ----------
-- save a draft, or send it. p_items: [{date, cat, description, amount, tax, receipt_path, from_place, to_place, km}]
create or replace function public.exp_save(p_id uuid, p_title text, p_items jsonb, p_send boolean) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.hr_me(); s jsonb := public.exp_set(); c record; cid uuid; x jsonb; cat record; n int := 0; amt numeric; km numeric;
  v_route int[] := '{}'; mgr uuid; today date := public.hr_today();
begin
  if me is null or not public.has_perm('hr_self') then raise exception 'Your login is not linked to an employee record. Ask HR.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the claim a short title.'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Bad items.'; end if;
  if p_send and jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item.'; end if;
  if p_id is not null then
    select * into c from public.expense_claims where id = p_id for update;
    if not found or c.emp_id <> me then raise exception 'That claim is not yours.' using errcode = '42501'; end if;
    if c.status <> 'Draft' then raise exception 'This claim has been sent and can no longer be changed.'; end if;
    cid := p_id;
    update public.expense_claims set title = trim(p_title), updated_at = now() where id = cid;
    delete from public.expense_items where claim_id = cid;
  else
    insert into public.expense_claims (no, emp_id, title, created_at)
      values (format('EC-%s-%s', extract(year from today), lpad(nextval('public.expense_no_seq')::text, 4, '0')), me, trim(p_title), today) returning id into cid;
  end if;
  for x in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    select * into cat from public.expense_categories where code = x->>'cat';
    if not found then raise exception 'Item %: unknown category.', n; end if;
    if not cat.active and p_send then raise exception 'Item %: % is no longer used. Pick another category.', n, cat.name; end if;
    if (x->>'date')::date > today then raise exception 'Item %: the date is in the future.', n; end if;
    if coalesce(x->>'receipt_path', '') <> '' and split_part(x->>'receipt_path', '/', 1) <> me::text then raise exception 'Item %: that receipt is not yours.', n; end if;
    km := nullif(x->>'km', '')::numeric;
    if cat.mileage then
      if p_send and coalesce(km, 0) <= 0 then raise exception 'Item %: enter the kilometres.', n; end if;
      amt := round(coalesce(km, 0) * (s->>'mileageRate')::numeric, 2);   -- mileage is always worked out here, at the set rate
    else
      amt := round(coalesce(nullif(x->>'amount', '')::numeric, 0), 2);
      if p_send and coalesce(trim(x->>'description'), '') = '' then raise exception 'Item %: describe what it was for.', n; end if;
    end if;
    if amt <= 0 then
      if p_send then raise exception 'Item %: the amount must be above zero.', n; end if;
      continue;   -- a draft may keep an unfinished line out
    end if;
    insert into public.expense_items (claim_id, sort, date, cat, description, amount, tax, receipt_path, from_place, to_place, km)
      values (cid, n, (x->>'date')::date, cat.code, coalesce(trim(x->>'description'), ''), amt, case when cat.mileage then 'none' else coalesce(nullif(x->>'tax', ''), 'none') end,
              nullif(x->>'receipt_path', ''), nullif(trim(x->>'from_place'), ''), nullif(trim(x->>'to_place'), ''), case when cat.mileage then km else null end);
  end loop;
  if p_send then
    select manager_id into mgr from public.hr_employees where id = me;
    if (s->'levels'->>'manager')::boolean and mgr is not null and mgr <> me then v_route := v_route || 1; end if;
    if (s->'levels'->>'finance')::boolean then v_route := v_route || 2; end if;
    if (s->'levels'->>'director')::boolean then v_route := v_route || 3; end if;
    update public.expense_claims set status = coalesce(public.exp_status_for(v_route[1]), 'Approved'), route = v_route, submitted_at = today, updated_at = now() where id = cid;
    insert into public.expense_steps (claim_id, on_date, by_emp, by_name, action) values (cid, today, me, public.exp_who(me), 'Submitted');
    perform public.exp_notify_next(cid);
  end if;
  return cid;
end $$;

create or replace function public.exp_delete_draft(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.expense_claims where id = p_id and emp_id = public.hr_me() and status = 'Draft';
  if not found then raise exception 'Only your own drafts can be deleted.'; end if;
end $$;

-- approve or reject at the claim's current step. Nobody decides their own claim.
create or replace function public.exp_decide(p_ids uuid[], p_action text, p_note text default null) returns int
  language plpgsql security definer set search_path = '' as $$
declare me uuid := public.hr_me(); c record; lvl int; nxt int; ok boolean; n int := 0; who text := public.exp_who(public.hr_me());
begin
  if p_action not in ('Approved','Rejected') then raise exception 'Unknown decision.'; end if;
  if p_action = 'Rejected' and coalesce(trim(p_note), '') = '' then raise exception 'Give a reason for rejecting.'; end if;
  for c in select * from public.expense_claims where id = any (p_ids) for update loop
    lvl := case c.status when 'Pending manager' then 1 when 'Pending finance' then 2 when 'Pending director' then 3 end;
    if lvl is null then raise exception 'Claim % is not waiting for approval.', c.no; end if;
    if c.emp_id = me then raise exception 'You cannot approve your own claim (%).', c.no; end if;
    ok := case lvl
      when 1 then me is not null and exists (select 1 from public.hr_employees where id = c.emp_id and manager_id = me)
      when 2 then public.has_perm('exp_finance')
      when 3 then public.has_perm('exp_director') end;
    if not ok then raise exception 'Claim % is not waiting for you.', c.no using errcode = '42501'; end if;
    insert into public.expense_steps (claim_id, on_date, by_emp, by_name, action, level, note) values (c.id, public.hr_today(), me, who, p_action, lvl, nullif(trim(p_note), ''));
    if p_action = 'Rejected' then
      update public.expense_claims set status = 'Rejected', updated_at = now() where id = c.id;
      perform public.hr_note(c.emp_id, format('Your claim %s was rejected by %s: %s', c.no, split_part(who, ' ', 1), trim(p_note)), '/hr/claims/' || c.id);
    else
      select min(r) into nxt from unnest(c.route) r where r > lvl;
      update public.expense_claims set status = coalesce(public.exp_status_for(nxt), 'Approved'), updated_at = now() where id = c.id;
      perform public.hr_note(c.emp_id, case when nxt is null then format('Your claim %s is fully approved and will be paid soon.', c.no)
        else format('Your claim %s was approved by %s; it is now with %s.', c.no, split_part(who, ' ', 1), case nxt when 2 then 'Finance' else 'a Director' end) end, '/hr/claims/' || c.id);
      perform public.exp_notify_next(c.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.exp_process(p_ids uuid[]) returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.has_perm('exp_finance') then raise exception 'Only Finance can process payments.' using errcode = '42501'; end if;
  with u as (update public.expense_claims set status = 'Processing', pay_method = 'Bank transfer', updated_at = now() where id = any (p_ids) and status = 'Approved' returning id)
  insert into public.expense_steps (claim_id, on_date, by_emp, by_name, action) select id, public.hr_today(), public.hr_me(), public.exp_who(public.hr_me()), 'Processing' from u;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.exp_paid(p_ids uuid[], p_ref text, p_paid_at date) returns int language plpgsql security definer set search_path = '' as $$
declare c record; n int := 0; missing text;
begin
  if not public.has_perm('exp_finance') then raise exception 'Only Finance can mark claims paid.' using errcode = '42501'; end if;
  if coalesce(trim(p_ref), '') = '' then raise exception 'Enter the transfer reference.'; end if;
  if p_paid_at > public.hr_today() then raise exception 'The payment date cannot be in the future.'; end if;
  select string_agg(distinct e.name, ', ') into missing from public.expense_claims ec join public.hr_employees e on e.id = ec.emp_id
    where ec.id = any (p_ids) and ec.status in ('Approved','Processing') and not exists (select 1 from public.expense_banks b where b.emp_id = ec.emp_id);
  if missing is not null then raise exception 'No bank details for %.', missing; end if;
  for c in select * from public.expense_claims where id = any (p_ids) and status in ('Approved','Processing') for update loop
    update public.expense_claims set status = 'Paid', pay_ref = trim(p_ref), paid_at = p_paid_at, pay_method = 'Bank transfer', updated_at = now() where id = c.id;
    insert into public.expense_steps (claim_id, on_date, by_emp, by_name, action, note) values (c.id, p_paid_at, public.hr_me(), public.exp_who(public.hr_me()), 'Paid', 'Ref ' || trim(p_ref));
    perform public.hr_note(c.emp_id, format('Your claim %s (RM %s) was paid on %s, ref %s.', c.no,
      to_char((select sum(amount) from public.expense_items where claim_id = c.id), 'FM999,990.00'), to_char(p_paid_at, 'DD Mon YYYY'), trim(p_ref)), '/hr/claims/' || c.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- who acts as Finance and as Director right now (for the screens)
create or replace function public.exp_roles() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'finance', coalesce((select jsonb_agg(x) from public.exp_people('exp_finance') x), '[]'),
    'directors', coalesce((select jsonb_agg(x) from public.exp_people('exp_director') x), '[]'))
  where public.has_perm('hr_self') or public.has_perm('exp_finance') or public.has_perm('exp_director')
$$;

-- ---------- access rules ----------
alter table public.expense_categories enable row level security;
alter table public.expense_settings   enable row level security;
alter table public.expense_banks      enable row level security;
alter table public.expense_claims           enable row level security;
alter table public.expense_items      enable row level security;
alter table public.expense_steps      enable row level security;

create policy expense_categories_read on public.expense_categories for select to authenticated using ((select public.has_perm('hr_self')) or (select public.has_perm('exp_finance')) or (select public.has_perm('exp_director')));
create policy expense_categories_write on public.expense_categories for all to authenticated using ((select public.has_perm('exp_admin'))) with check ((select public.has_perm('exp_admin')));
create policy expense_settings_read on public.expense_settings for select to authenticated using ((select public.has_perm('hr_self')) or (select public.has_perm('exp_finance')) or (select public.has_perm('exp_director')));
create policy expense_settings_write on public.expense_settings for update to authenticated using ((select public.has_perm('exp_admin'))) with check ((select public.has_perm('exp_admin')));
-- bank details: your own (read and write), Finance and HR read
create policy expense_banks_read on public.expense_banks for select to authenticated using (emp_id = (select public.hr_me()) or (select public.has_perm('exp_finance')) or (select public.has_perm('hr_admin')));
create policy expense_banks_insert on public.expense_banks for insert to authenticated with check (emp_id = (select public.hr_me()));
create policy expense_banks_update on public.expense_banks for update to authenticated using (emp_id = (select public.hr_me())) with check (emp_id = (select public.hr_me()));
-- claims: read by the people above; all changes go through the functions
create policy expense_claims_read on public.expense_claims for select to authenticated using (public.exp_can_see(emp_id));
create policy expense_items_read on public.expense_items for select to authenticated using (exists (select 1 from public.expense_claims c where c.id = claim_id and public.exp_can_see(c.emp_id)));
create policy expense_steps_read on public.expense_steps for select to authenticated using (exists (select 1 from public.expense_claims c where c.id = claim_id and public.exp_can_see(c.emp_id)));

do $$
declare f text;
begin
  foreach f in array array['exp_set()','exp_can_see(uuid)','exp_people(text)','exp_status_for(int)','exp_who(uuid)','exp_notify_next(uuid)',
    'exp_save(uuid,text,jsonb,boolean)','exp_delete_draft(uuid)','exp_decide(uuid[],text,text)','exp_process(uuid[])','exp_paid(uuid[],text,date)','exp_roles()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
  end loop;
  foreach f in array array['exp_can_see(uuid)','exp_save(uuid,text,jsonb,boolean)','exp_delete_draft(uuid)','exp_decide(uuid[],text,text)',
    'exp_process(uuid[])','exp_paid(uuid[],text,date)','exp_roles()'] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- receipts: private files in a folder per employee ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('expense-receipts', 'expense-receipts', false, 5242880, array['application/pdf','image/jpeg','image/png','image/heic'])
  on conflict (id) do nothing;
create policy expense_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and public.exp_can_see(((storage.foldername(name))[1])::uuid));
create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = (select public.hr_me())::text);

-- ---------- live updates ----------
alter publication supabase_realtime add table public.expense_claims;
