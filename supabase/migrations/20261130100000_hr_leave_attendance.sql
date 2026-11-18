-- HR: leave and attendance for Chai Siang staff, following the Employment Act 1955 (as amended 2022).
-- Every rule that matters is checked here on the server, not only on screen. Times are Malaysia time.

-- ---------- roles and permissions ----------
insert into public.roles (name, label, is_system, is_super, sort) values
  ('hr', 'HR', false, false, 45),
  ('staff', 'Staff (HR only)', false, false, 70)
  on conflict (name) do nothing;
insert into public.permissions (key, label, grp, sort) values
  ('hr_self',    'HR: own leave and attendance (clock in, apply leave)', 'HR', 80),
  ('hr_approve', 'HR: approve leave for their team, see team attendance', 'HR', 81),
  ('hr_admin',   'HR: manage staff, holidays, settings and reports', 'HR', 82)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('management', 'hr_self'), ('supervisor', 'hr_self'), ('salesperson', 'hr_self'), ('logistics', 'hr_self'),
  ('finance', 'hr_self'), ('hr', 'hr_self'), ('staff', 'hr_self'),
  ('management', 'hr_approve'), ('supervisor', 'hr_approve'), ('hr', 'hr_approve'),
  ('management', 'hr_admin'), ('hr', 'hr_admin')
  on conflict do nothing;

-- ---------- tables ----------
create table public.hr_employees (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  position    text not null default '',
  dept        text not null default '',
  gender      text not null check (gender in ('F','M')),
  state       text not null default 'Selangor',
  joined      date not null,
  manager_id  uuid references public.hr_employees(id) on delete set null,
  hr_role     text not null default 'employee' check (hr_role in ('employee','manager','hr')),
  email       text,
  phone       text,
  active      boolean not null default true,
  profile_id  uuid unique references public.profiles(id) on delete set null,  -- their login, linked by email
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (manager_id is null or manager_id <> id)
);
create unique index hr_employees_email_idx on public.hr_employees (lower(email)) where email is not null and email <> '';

create table public.hr_holidays (
  id     bigint generated always as identity primary key,
  date   date not null,
  name   text not null,
  scope  text not null default 'Federal',   -- 'Federal' or a state name
  unique (date, scope)
);

create table public.hr_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
insert into public.hr_settings (id, data) values (1, '{
  "workStart": "09:00", "workEnd": "18:00", "lunchStart": "13:00", "lunchEnd": "14:00", "lateAfterMin": 15,
  "gpsRequired": false, "gpsRadiusM": 200, "officeLat": 3.2389, "officeLng": 101.6802,
  "carryMaxDays": 5, "carryExpiry": "03-31", "otWeekday": 1.5, "otRestDay": 2.0, "otPublicHoliday": 3.0, "restDays": [0, 6]
}');

create table public.hr_leave_requests (
  id             uuid primary key default gen_random_uuid(),
  emp_id         uuid not null references public.hr_employees(id) on delete cascade,
  type           text not null check (type in ('AL','SL','HL','EL','ML','UL')),
  from_date      date not null,
  to_date        date not null,
  half           text not null default '' check (half in ('','AM','PM')),
  days           numeric(6,1) not null check (days > 0),
  reason         text not null,
  status         text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Cancelled')),
  applied_at     date not null,
  created_at     timestamptz not null default now(),
  decided_by     uuid references public.hr_employees(id) on delete set null,
  decided_by_name text,
  decided_at     date,
  decision_note  text,
  mc_path        text,
  check (to_date >= from_date)
);
create index hr_leave_emp_idx on public.hr_leave_requests (emp_id, from_date);
create index hr_leave_dates_idx on public.hr_leave_requests (from_date, to_date) where status in ('Pending','Approved');

create table public.hr_attendance (
  emp_id     uuid not null references public.hr_employees(id) on delete cascade,
  date       date not null,
  in_min     int check (in_min between 0 and 1439),
  out_min    int check (out_min between 0 and 1439),
  lat        double precision,
  lng        double precision,
  source     text not null default 'app' check (source in ('app','hr')),
  note       text,
  by_name    text,
  updated_at timestamptz not null default now(),
  primary key (emp_id, date),
  check (out_min is null or in_min is null or out_min > in_min)
);

create table public.hr_adjustments (
  id         bigint generated always as identity primary key,
  emp_id     uuid not null references public.hr_employees(id) on delete cascade,
  type       text not null check (type in ('AL','SL','HL','EL','ML')),
  days       numeric(6,1) not null check (days <> 0),
  reason     text not null,
  by_name    text,
  on_date    date not null,
  created_at timestamptz not null default now()
);

create table public.hr_carry (
  emp_id  uuid not null references public.hr_employees(id) on delete cascade,
  year    int not null,
  days    numeric(6,1) not null check (days >= 0),
  source  text not null default 'auto' check (source in ('auto','hr')),
  set_at  timestamptz not null default now(),
  primary key (emp_id, year)
);

create table public.hr_notes (
  id      bigint generated always as identity primary key,
  to_emp  uuid not null references public.hr_employees(id) on delete cascade,
  text    text not null,
  href    text,
  sent_at timestamptz not null default now(),
  read    boolean not null default false
);
create index hr_notes_to_idx on public.hr_notes (to_emp, sent_at desc);

-- ---------- helpers ----------
create or replace function public.hr_today() returns date language sql stable set search_path = '' as
$$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

create or replace function public.hr_me() returns uuid language sql stable security definer set search_path = '' as
$$ select id from public.hr_employees where profile_id = (select auth.uid()) and active limit 1 $$;

create or replace function public.hr_is_admin() returns boolean language sql stable security definer set search_path = '' as
$$ select public.has_perm('hr_admin') $$;

-- may the signed-in person see this employee's leave and attendance: themselves, their manager, or HR
create or replace function public.hr_can_see(p_emp uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_perm('hr_admin')
      or p_emp = public.hr_me()
      or exists (select 1 from public.hr_employees e where e.id = p_emp and e.manager_id is not null and e.manager_id = public.hr_me())
$$;

-- who decides a person's leave: their direct manager, otherwise an HR person
create or replace function public.hr_approver(p_emp uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select manager_id from public.hr_employees where id = p_emp),
    (select id from public.hr_employees where hr_role = 'hr' and active and id <> p_emp order by code limit 1))
$$;

create or replace function public.hr_set() returns jsonb language sql stable security definer set search_path = '' as
$$ select data from public.hr_settings where id = 1 $$;

create or replace function public.hr_is_working(p_day date, p_state text) returns boolean language sql stable security definer set search_path = '' as $$
  select not (extract(dow from p_day)::int in (select jsonb_array_elements_text(public.hr_set()->'restDays')::int))
     and not exists (select 1 from public.hr_holidays h where h.date = p_day and (h.scope = 'Federal' or h.scope = p_state))
$$;

-- leave days between two dates: working days only; a half day is 0.5; maternity counts calendar days
create or replace function public.hr_leave_days(p_from date, p_to date, p_half text, p_state text, p_type text) returns numeric
  language sql stable security definer set search_path = '' as $$
  select case
    when p_to < p_from then 0
    when p_type = 'ML' then (p_to - p_from + 1)::numeric
    when coalesce(p_half, '') <> '' and p_from = p_to then case when public.hr_is_working(p_from, p_state) then 0.5 else 0 end
    else (select count(*)::numeric from generate_series(p_from, p_to, interval '1 day') g(d) where public.hr_is_working(g.d::date, p_state))
  end
$$;

create or replace function public.hr_years(p_joined date, p_on date) returns int language sql immutable set search_path = '' as
$$ select greatest(0, extract(year from age(p_on, p_joined))::int) $$;

-- yearly entitlement; null means no limit (unpaid). Service counted on 1 January.
create or replace function public.hr_entitlement(p_type text, p_joined date, p_gender text, p_year int) returns numeric
  language sql immutable set search_path = '' as $$
  select case p_type
    when 'AL' then case when public.hr_years(p_joined, make_date(p_year,1,1)) < 2 then 8 when public.hr_years(p_joined, make_date(p_year,1,1)) < 5 then 12 else 16 end
    when 'SL' then case when public.hr_years(p_joined, make_date(p_year,1,1)) < 2 then 14 when public.hr_years(p_joined, make_date(p_year,1,1)) < 5 then 18 else 22 end
    when 'HL' then 60
    when 'EL' then 2
    when 'ML' then case when p_gender = 'F' then 98 else 0 end
    else null end::numeric
$$;

-- balance of one leave type in a year. p_auto_carry: also work out carry-over that HR has not fixed yet.
create or replace function public.hr_balance(p_emp uuid, p_type text, p_year int, p_auto_carry boolean default true)
  returns table (total numeric, used numeric, pending numeric, available numeric)
  language plpgsql stable security definer set search_path = '' as $$
declare
  e record; s jsonb := public.hr_set(); ent numeric; adj numeric; c numeric := 0; c_used numeric := 0; expiry date; cap numeric := 'Infinity';
begin
  select * into e from public.hr_employees where id = p_emp;
  ent := public.hr_entitlement(p_type, e.joined, e.gender, p_year);
  select coalesce(sum(days) filter (where status = 'Approved'), 0), coalesce(sum(days) filter (where status = 'Pending'), 0)
    into used, pending from public.hr_leave_requests where emp_id = p_emp and type = p_type and extract(year from from_date) = p_year;
  if ent is null then total := null; available := null; return next; return; end if;
  select coalesce(sum(days), 0) into adj from public.hr_adjustments where emp_id = p_emp and type = p_type and extract(year from on_date) = p_year;
  if p_type = 'AL' then
    c := coalesce((select days from public.hr_carry where emp_id = p_emp and year = p_year), case when p_auto_carry then public.hr_carry_into(p_emp, p_year) else 0 end);
    expiry := make_date(p_year, split_part(s->>'carryExpiry', '-', 1)::int, split_part(s->>'carryExpiry', '-', 2)::int);
    select coalesce(sum(case when r.to_date <= expiry then r.days else public.hr_leave_days(r.from_date, expiry, '', e.state, 'AL') end), 0)
      into c_used from public.hr_leave_requests r where r.emp_id = p_emp and r.type = 'AL' and r.status = 'Approved' and extract(year from r.from_date) = p_year and r.from_date <= expiry;
    c_used := least(c, c_used);
    if public.hr_today() > expiry then c := c_used; end if;   -- unused carry-over expires
  end if;
  if p_type in ('SL','HL') then   -- sick and hospitalisation together: at most 60 days a year
    cap := 60 - used - pending - coalesce((select sum(days) from public.hr_leave_requests where emp_id = p_emp and status = 'Approved'
             and type = case when p_type = 'SL' then 'HL' else 'SL' end and extract(year from from_date) = p_year), 0);
  end if;
  total := ent + adj + c;
  available := greatest(0, least(total - used - pending, cap));
  return next;
end $$;

-- annual leave carried into a year: what HR fixed, or last year's leftover up to the limit
create or replace function public.hr_carry_into(p_emp uuid, p_year int) returns numeric language plpgsql stable security definer set search_path = '' as $$
declare stored numeric; e record; b record;
begin
  select days into stored from public.hr_carry where emp_id = p_emp and year = p_year;
  if stored is not null then return stored; end if;
  select * into e from public.hr_employees where id = p_emp;
  if e.joined > make_date(p_year - 1, 12, 31) then return 0; end if;
  select * into b from public.hr_balance(p_emp, 'AL', p_year - 1, false);
  return least((public.hr_set()->>'carryMaxDays')::numeric, greatest(0, coalesce(b.total, 0) - b.used));
end $$;

create or replace function public.hr_note(p_to uuid, p_text text, p_href text) returns void language sql security definer set search_path = '' as
$$ insert into public.hr_notes (to_emp, text, href) select p_to, p_text, p_href where p_to is not null $$;

create or replace function public.hr_type_name(p_type text) returns text language sql immutable set search_path = '' as $$
  select case p_type when 'AL' then 'annual leave' when 'SL' then 'sick leave' when 'HL' then 'hospitalisation leave'
    when 'EL' then 'emergency leave' when 'ML' then 'maternity leave' else 'unpaid leave' end
$$;

-- ---------- actions ----------
-- link the signed-in login to their employee record, matched by email
create or replace function public.hr_link_me() returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := public.hr_me(); mail text;
begin
  if me is not null or (select auth.uid()) is null then return me; end if;
  select email into mail from auth.users where id = (select auth.uid());
  update public.hr_employees set profile_id = (select auth.uid()), updated_at = now()
    where lower(email) = lower(mail) and profile_id is null and active returning id into me;
  return me;
end $$;

create or replace function public.hr_apply(p_type text, p_from date, p_to date, p_half text, p_reason text, p_mc_path text default null)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := public.hr_me(); e record; n numeric; b record; today date := public.hr_today(); rid uuid; clash record;
begin
  if me is null or not public.has_perm('hr_self') then raise exception 'Your login is not linked to an employee record. Ask HR.' using errcode = '42501'; end if;
  select * into e from public.hr_employees where id = me;
  if p_to < p_from then raise exception 'The end date is before the start date.'; end if;
  if p_type = 'ML' and e.gender <> 'F' then raise exception 'Maternity leave is for female employees.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Write a short reason.'; end if;
  if p_type in ('AL','UL','ML') and p_from < today then raise exception '% must start today or later.', initcap(public.hr_type_name(p_type)); end if;
  if p_type = 'EL' and p_from < today - 2 then raise exception 'Emergency leave can be backdated by 48 hours at most.'; end if;
  if p_to > today + 400 then raise exception 'That is too far ahead.'; end if;
  n := public.hr_leave_days(p_from, p_to, case when p_from = p_to then coalesce(p_half, '') else '' end, e.state, p_type);
  if n <= 0 then raise exception 'These dates are all rest days or public holidays, so no leave is needed.'; end if;
  if ((p_type = 'SL' and n > 2) or p_type = 'HL') and coalesce(p_mc_path, '') = '' then raise exception 'Attach the medical certificate (MC).'; end if;
  if p_mc_path is not null and split_part(p_mc_path, '/', 1) <> me::text then raise exception 'That file does not belong to you.'; end if;
  select * into clash from public.hr_leave_requests where emp_id = me and status in ('Pending','Approved') and from_date <= p_to and to_date >= p_from limit 1;
  if found then raise exception 'You already have % on %.', public.hr_type_name(clash.type), clash.from_date; end if;
  select * into b from public.hr_balance(me, p_type, extract(year from p_from)::int);
  if b.available is not null and n > b.available then raise exception 'Not enough %: % days left.', public.hr_type_name(p_type), b.available; end if;
  insert into public.hr_leave_requests (emp_id, type, from_date, to_date, half, days, reason, applied_at, mc_path)
    values (me, p_type, p_from, p_to, case when p_from = p_to then coalesce(p_half, '') else '' end, n, trim(p_reason), today, p_mc_path) returning id into rid;
  perform public.hr_note(public.hr_approver(me), format('%s applied for %s %s of %s (%s%s).', split_part(e.name, ' ', 1), n, case when n = 1 then 'day' else 'days' end,
    public.hr_type_name(p_type), to_char(p_from, 'DD Mon'), case when p_to <> p_from then ' – ' || to_char(p_to, 'DD Mon') else '' end), '/hr/approvals');
  return rid;
end $$;

create or replace function public.hr_cancel(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.hr_leave_requests set status = 'Cancelled' where id = p_id and emp_id = public.hr_me() and status = 'Pending';
  if not found then raise exception 'Only your own requests that are still waiting can be cancelled.'; end if;
end $$;

create or replace function public.hr_decide(p_ids uuid[], p_status text, p_note text default null) returns int language plpgsql security definer set search_path = '' as $$
declare me uuid := public.hr_me(); admin boolean := public.has_perm('hr_admin'); r record; n int := 0; who text;
begin
  if p_status not in ('Approved','Rejected') then raise exception 'Unknown decision.'; end if;
  if p_status = 'Rejected' and coalesce(trim(p_note), '') = '' then raise exception 'Give a reason for rejecting.'; end if;
  who := coalesce((select name from public.hr_employees where id = me), (select full_name from public.profiles where id = (select auth.uid())), 'HR');
  for r in select * from public.hr_leave_requests where id = any (p_ids) for update loop
    if r.status <> 'Pending' then continue; end if;
    if r.emp_id = me then raise exception 'You cannot decide your own leave.'; end if;
    if not (admin or (me is not null and public.hr_approver(r.emp_id) = me and public.has_perm('hr_approve'))) then
      raise exception 'You can only decide leave for your own team.' using errcode = '42501';
    end if;
    update public.hr_leave_requests set status = p_status, decided_by = me, decided_by_name = who, decided_at = public.hr_today(), decision_note = nullif(trim(p_note), '') where id = r.id;
    perform public.hr_note(r.emp_id, format('Your %s on %s%s was %s by %s%s', public.hr_type_name(r.type), to_char(r.from_date, 'DD Mon'),
      case when r.to_date <> r.from_date then ' – ' || to_char(r.to_date, 'DD Mon') else '' end, lower(p_status), split_part(who, ' ', 1),
      case when coalesce(trim(p_note), '') <> '' then ': ' || trim(p_note) else '.' end), '/hr/leave');
    n := n + 1;
  end loop;
  return n;
end $$;

-- clock in, or out if already in. The server's own clock is used, so a phone's wrong time cannot change it.
create or replace function public.hr_clock(p_lat double precision default null, p_lng double precision default null) returns text
  language plpgsql security definer set search_path = '' as $$
declare me uuid := public.hr_me(); s jsonb := public.hr_set(); now_min int; a record; dist double precision;
begin
  if me is null or not public.has_perm('hr_self') then raise exception 'Your login is not linked to an employee record. Ask HR.' using errcode = '42501'; end if;
  now_min := extract(hour from now() at time zone 'Asia/Kuala_Lumpur')::int * 60 + extract(minute from now() at time zone 'Asia/Kuala_Lumpur')::int;
  if (s->>'gpsRequired')::boolean then
    if p_lat is null or p_lng is null then raise exception 'Share your location to clock in.'; end if;
    dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - (s->>'officeLat')::float) / 2), 2)
            + cos(radians((s->>'officeLat')::float)) * cos(radians(p_lat)) * power(sin(radians(p_lng - (s->>'officeLng')::float) / 2), 2)));
    if dist > (s->>'gpsRadiusM')::float then raise exception 'You are % m from the office. Clock in when you are there.', round(dist); end if;
  end if;
  select * into a from public.hr_attendance where emp_id = me and date = public.hr_today() for update;
  if not found then
    insert into public.hr_attendance (emp_id, date, in_min, lat, lng) values (me, public.hr_today(), now_min, p_lat, p_lng); return 'in';
  elsif a.in_min is null then
    update public.hr_attendance set in_min = now_min, lat = p_lat, lng = p_lng, updated_at = now() where emp_id = me and date = a.date; return 'in';
  elsif a.out_min is null then
    if now_min <= a.in_min then raise exception 'Clock-out must be after clock-in.'; end if;
    update public.hr_attendance set out_min = now_min, updated_at = now() where emp_id = me and date = a.date; return 'out';
  end if;
  raise exception 'You have already clocked out today.';
end $$;

create or replace function public.hr_set_attendance(p_emp uuid, p_date date, p_in int, p_out int, p_note text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('hr_admin') then raise exception 'Only HR can enter attendance by hand.' using errcode = '42501'; end if;
  if p_date > public.hr_today() then raise exception 'That date has not happened yet.'; end if;
  if p_out <= p_in then raise exception 'Clock-out must be after clock-in.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Say why it was entered by hand.'; end if;
  insert into public.hr_attendance (emp_id, date, in_min, out_min, source, note, by_name)
    values (p_emp, p_date, p_in, p_out, 'hr', trim(p_note), (select full_name from public.profiles where id = (select auth.uid())))
    on conflict (emp_id, date) do update set in_min = excluded.in_min, out_min = excluded.out_min, source = 'hr', note = excluded.note, by_name = excluded.by_name, updated_at = now();
end $$;

create or replace function public.hr_adjust(p_emp uuid, p_type text, p_days numeric, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('hr_admin') then raise exception 'Only HR can adjust leave.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' or p_days = 0 then raise exception 'Enter the days and a reason.'; end if;
  insert into public.hr_adjustments (emp_id, type, days, reason, by_name, on_date)
    values (p_emp, p_type, p_days, trim(p_reason), (select full_name from public.profiles where id = (select auth.uid())), public.hr_today());
end $$;

create or replace function public.hr_set_carry(p_emp uuid, p_year int, p_days numeric) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('hr_admin') then raise exception 'Only HR can change carry-over.' using errcode = '42501'; end if;
  if p_days < 0 or p_days > (public.hr_set()->>'carryMaxDays')::numeric then raise exception 'Carry-over must be between 0 and % days.', public.hr_set()->>'carryMaxDays'; end if;
  insert into public.hr_carry (emp_id, year, days, source) values (p_emp, p_year, p_days, 'hr')
    on conflict (emp_id, year) do update set days = excluded.days, source = 'hr', set_at = now();
end $$;

-- who is away, for the team calendar: names, dates and leave type only, never the reason
create or replace function public.hr_calendar(p_from date, p_to date)
  returns table (id uuid, emp_id uuid, type text, from_date date, to_date date, half text, days numeric, status text)
  language sql stable security definer set search_path = '' as $$
  select r.id, r.emp_id, r.type, r.from_date, r.to_date, r.half, r.days, r.status
  from public.hr_leave_requests r join public.hr_employees e on e.id = r.emp_id
  where (public.has_perm('hr_self') or public.has_perm('hr_admin')) and e.active
    and r.status in ('Pending','Approved') and r.from_date <= p_to and r.to_date >= p_from
$$;

-- 1 January: fix last year's leftover annual leave as this year's carry-over (up to the limit)
create or replace function public.hr_close_year() returns int language plpgsql security definer set search_path = '' as $$
declare y int := extract(year from public.hr_today())::int; e record; n int := 0;
begin
  for e in select id from public.hr_employees where active and not exists (select 1 from public.hr_carry c where c.emp_id = hr_employees.id and c.year = y) loop
    insert into public.hr_carry (emp_id, year, days, source) values (e.id, y, public.hr_carry_into(e.id, y), 'auto');
    n := n + 1;
  end loop;
  return n;
end $$;

-- add or update staff from the Excel template; matched by employee code, manager given by their code
create or replace function public.hr_import_employees(p_rows jsonb) returns int language plpgsql security definer set search_path = '' as $$
declare x jsonb; n int := 0;
begin
  if not public.has_perm('hr_admin') then raise exception 'Only HR can import staff.' using errcode = '42501'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(x->>'code'), '') = '' or coalesce(trim(x->>'name'), '') = '' then raise exception 'Every row needs an employee code and a name.'; end if;
    if coalesce(x->>'gender', '') not in ('F','M') then raise exception 'Gender for % must be F or M.', x->>'code'; end if;
    insert into public.hr_employees (code, name, position, dept, gender, state, joined, hr_role, email, phone, active)
    values (upper(trim(x->>'code')), trim(x->>'name'), coalesce(x->>'position', ''), coalesce(x->>'dept', ''), x->>'gender', coalesce(nullif(x->>'state', ''), 'Selangor'),
            (x->>'joined')::date, coalesce(nullif(x->>'hr_role', ''), 'employee'), nullif(trim(x->>'email'), ''), nullif(trim(x->>'phone'), ''), coalesce((x->>'active')::boolean, true))
    on conflict (code) do update set name = excluded.name, position = excluded.position, dept = excluded.dept, gender = excluded.gender, state = excluded.state,
      joined = excluded.joined, hr_role = excluded.hr_role, email = excluded.email, phone = excluded.phone, active = excluded.active, updated_at = now();
    n := n + 1;
  end loop;
  -- second pass, once everyone exists: who reports to whom
  update public.hr_employees e set manager_id = m.id, updated_at = now()
    from jsonb_array_elements(p_rows) as j(rec) join public.hr_employees m on m.code = upper(trim(j.rec->>'manager_code'))
    where e.code = upper(trim(j.rec->>'code')) and coalesce(trim(j.rec->>'manager_code'), '') <> '' and m.id <> e.id;
  return n;
end $$;

-- ---------- access rules ----------
alter table public.hr_employees      enable row level security;
alter table public.hr_holidays       enable row level security;
alter table public.hr_settings       enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_attendance     enable row level security;
alter table public.hr_adjustments    enable row level security;
alter table public.hr_carry          enable row level security;
alter table public.hr_notes          enable row level security;

-- staff see the staff list (names and positions for approvals and the calendar); HR manages it
create policy hr_employees_read on public.hr_employees for select to authenticated using ((select public.has_perm('hr_self')) or (select public.has_perm('hr_admin')));
create policy hr_employees_write on public.hr_employees for all to authenticated using ((select public.has_perm('hr_admin'))) with check ((select public.has_perm('hr_admin')));
create policy hr_holidays_read on public.hr_holidays for select to authenticated using ((select public.has_perm('hr_self')) or (select public.has_perm('hr_admin')));
create policy hr_holidays_write on public.hr_holidays for all to authenticated using ((select public.has_perm('hr_admin'))) with check ((select public.has_perm('hr_admin')));
create policy hr_settings_read on public.hr_settings for select to authenticated using ((select public.has_perm('hr_self')) or (select public.has_perm('hr_admin')));
create policy hr_settings_write on public.hr_settings for update to authenticated using ((select public.has_perm('hr_admin'))) with check ((select public.has_perm('hr_admin')));
-- leave, attendance, adjustments and carry: yourself, your manager, or HR. Changes only through the functions above.
create policy hr_leave_read on public.hr_leave_requests for select to authenticated using (public.hr_can_see(emp_id));
create policy hr_attendance_read on public.hr_attendance for select to authenticated using (public.hr_can_see(emp_id));
create policy hr_adjustments_read on public.hr_adjustments for select to authenticated using (public.hr_can_see(emp_id));
create policy hr_carry_read on public.hr_carry for select to authenticated using (public.hr_can_see(emp_id));
-- your own updates: read them and mark them read
create policy hr_notes_read on public.hr_notes for select to authenticated using (to_emp = (select public.hr_me()));
create policy hr_notes_mark on public.hr_notes for update to authenticated using (to_emp = (select public.hr_me())) with check (to_emp = (select public.hr_me()));

do $$
declare f text;
begin
  foreach f in array array['hr_today()','hr_me()','hr_is_admin()','hr_can_see(uuid)','hr_approver(uuid)','hr_set()','hr_is_working(date,text)',
    'hr_leave_days(date,date,text,text,text)','hr_years(date,date)','hr_entitlement(text,date,text,int)','hr_balance(uuid,text,int,boolean)',
    'hr_carry_into(uuid,int)','hr_note(uuid,text,text)','hr_type_name(text)','hr_link_me()','hr_apply(text,date,date,text,text,text)','hr_cancel(uuid)',
    'hr_decide(uuid[],text,text)','hr_clock(double precision,double precision)','hr_set_attendance(uuid,date,int,int,text)','hr_adjust(uuid,text,numeric,text)',
    'hr_set_carry(uuid,int,numeric)','hr_calendar(date,date)','hr_close_year()','hr_import_employees(jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
  end loop;
  foreach f in array array['hr_today()','hr_me()','hr_can_see(uuid)','hr_balance(uuid,text,int,boolean)','hr_link_me()','hr_apply(text,date,date,text,text,text)',
    'hr_cancel(uuid)','hr_decide(uuid[],text,text)','hr_clock(double precision,double precision)','hr_set_attendance(uuid,date,int,int,text)',
    'hr_adjust(uuid,text,numeric,text)','hr_set_carry(uuid,int,numeric)','hr_calendar(date,date)','hr_import_employees(jsonb)'] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- hr_note and hr_close_year are internal: only other functions and the yearly job call them

-- ---------- medical certificates: private files, in a folder per employee ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('hr-mc', 'hr-mc', false, 5242880, array['application/pdf','image/jpeg','image/png'])
  on conflict (id) do nothing;
create policy hr_mc_read on storage.objects for select to authenticated
  using (bucket_id = 'hr-mc' and public.hr_can_see(((storage.foldername(name))[1])::uuid));
create policy hr_mc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-mc' and (storage.foldername(name))[1] = (select public.hr_me())::text);

-- ---------- live updates: new notes and leave decisions reach open screens at once ----------
alter publication supabase_realtime add table public.hr_notes, public.hr_leave_requests;

-- ---------- the yearly job: 00:05 on 1 January, Malaysia time (16:05 UTC on 31 December) ----------
select cron.schedule('hr-close-year', '5 16 31 12 *', $$select public.hr_close_year()$$);
