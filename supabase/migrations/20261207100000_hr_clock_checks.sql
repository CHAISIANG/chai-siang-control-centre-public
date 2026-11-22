-- Clock-in checks by staff type.
--   Office and warehouse staff: scan a code on the office screen that changes every minute (optional), and/or be
--   near the office (optional). Field staff (sales, drivers): never blocked by distance; location recorded; selfie
--   optional. Clocking out is never blocked. Anything unusual is flagged for HR, who mark it fine or not accepted.
-- Every rule is decided here, not on the phone: the screen only shows the answer.

-- ---------- permission for the office screen (so a reception login does not need full HR access) ----------
insert into public.permissions (key, label, grp, sort) values
  ('hr_office_screen', 'HR: show the office clock-in screen (code that changes every minute)', 'HR', 83)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values ('management', 'hr_office_screen'), ('hr', 'hr_office_screen')
  on conflict do nothing;

-- ---------- columns ----------
alter table public.hr_employees add column work_type text not null default 'office' check (work_type in ('office','field'));
alter table public.hr_attendance
  add column in_acc       int,
  add column out_lat      double precision,
  add column out_lng      double precision,
  add column method       text check (method in ('qr','gps')),
  add column selfie_path  text,
  add column flags        text[] check (flags <@ array['far_in','far_out','no_gps','weak_gps']::text[]),
  add column review_ok    boolean,
  add column review_by    text,
  add column review_at    timestamptz,
  add column review_note  text;

-- ---------- the office screen's secret: only the database can read it ----------
create table public.hr_office_secret (id int primary key default 1 check (id = 1), secret text not null);
alter table public.hr_office_secret enable row level security;
revoke all on public.hr_office_secret from public, anon, authenticated;
insert into public.hr_office_secret (secret) values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

create or replace function public.hr_code_seconds() returns int language sql stable security definer set search_path = '' as
$$ select greatest(15, coalesce((public.hr_set()->>'qrSeconds')::int, 60)) $$;
create or replace function public.hr_code_at(p_slot bigint) returns text language sql stable security definer set search_path = '' as $$
  select lpad(((('x' || substr(md5(s.secret || ':' || p_slot), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0')
  from public.hr_office_secret s where s.id = 1
$$;
create or replace function public.hr_code_slot() returns bigint language sql stable security definer set search_path = '' as
$$ select floor(extract(epoch from now()) / public.hr_code_seconds())::bigint $$;

/** For the office screen: the code now, and how many seconds until it changes. */
create or replace function public.hr_office_code() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare secs int := public.hr_code_seconds();
begin
  if not (public.has_perm('hr_office_screen') or public.has_perm('hr_admin')) then raise exception 'Only HR or the office screen login can show the clock-in code.' using errcode = '42501'; end if;
  return jsonb_build_object('code', public.hr_code_at(public.hr_code_slot()), 'seconds', secs,
    'left', secs - (floor(extract(epoch from now()))::bigint % secs));
end $$;

-- ---------- clock in and out ----------
drop function if exists public.hr_clock(double precision, double precision);
create or replace function public.hr_clock(p_lat double precision default null, p_lng double precision default null, p_acc double precision default null,
                                           p_code text default null, p_selfie text default null) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.hr_me(); s jsonb := public.hr_set(); e record; a record; now_min int; dist double precision;
  phase text; fix boolean := p_lat is not null and p_lng is not null; far boolean; qr boolean := false; v_flags text[] := '{}';
  radius double precision := coalesce((s->>'gpsRadiusM')::float, 200); n bigint;
begin
  if me is null or not public.has_perm('hr_self') then raise exception 'Your login is not linked to an employee record. Ask HR.' using errcode = '42501'; end if;
  if fix and (p_lat not between -90 and 90 or p_lng not between -180 and 180) then raise exception 'That location is not valid.'; end if;
  select * into e from public.hr_employees where id = me;
  now_min := extract(hour from now() at time zone 'Asia/Kuala_Lumpur')::int * 60 + extract(minute from now() at time zone 'Asia/Kuala_Lumpur')::int;
  select * into a from public.hr_attendance where emp_id = me and date = public.hr_today() for update;
  phase := case when not found or a.in_min is null then 'in' when a.out_min is null then 'out' else 'done' end;
  if phase = 'done' then raise exception 'You have already clocked out today.'; end if;
  if phase = 'out' and now_min <= a.in_min then raise exception 'Clock-out must be after clock-in.'; end if;

  if fix then dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - (s->>'officeLat')::float) / 2), 2)
              + cos(radians((s->>'officeLat')::float)) * cos(radians(p_lat)) * power(sin(radians(p_lng - (s->>'officeLng')::float) / 2), 2))); end if;
  far := dist is not null and dist > radius;
  if fix and coalesce(p_acc, 0) > 300 then v_flags := array_append(v_flags, 'weak_gps'); end if;
  if p_code is not null then
    n := public.hr_code_slot();
    qr := p_code in (public.hr_code_at(n), public.hr_code_at(n - 1));
  end if;

  if e.work_type = 'field' then
    if phase = 'in' and coalesce((s->>'fieldSelfie')::boolean, false) then
      if p_selfie is null then raise exception 'Take a selfie to clock in.'; end if;
      if split_part(p_selfie, '/', 1) <> me::text or not exists (select 1 from storage.objects o where o.bucket_id = 'hr-selfies' and o.name = p_selfie) then
        raise exception 'The selfie did not upload. Take it again.';
      end if;
    end if;
    if not fix then v_flags := array_append(v_flags, 'no_gps'); end if;
  elsif phase = 'in' then
    if coalesce((s->>'qrRequired')::boolean, false) and not qr then
      raise exception '%', case when p_code is null then 'Scan the code on the office screen to clock in.' else 'That office code has expired or is wrong. Scan the screen again.' end;
    end if;
    if coalesce((s->>'gpsRequired')::boolean, false) then
      if not fix then raise exception 'Share your location to clock in.'; end if;
      if far then raise exception 'You are % m from the office. Clock in when you are there.', round(dist); end if;
    end if;
    if not fix then v_flags := array_append(v_flags, 'no_gps'); elsif far then v_flags := array_append(v_flags, 'far_in'); end if;
  else
    if not fix then v_flags := array_append(v_flags, 'no_gps'); elsif far then v_flags := array_append(v_flags, 'far_out'); end if;
  end if;

  if phase = 'in' then
    insert into public.hr_attendance (emp_id, date, in_min, lat, lng, in_acc, method, selfie_path, flags)
      values (me, public.hr_today(), now_min, p_lat, p_lng, round(p_acc)::int, case when qr then 'qr' else 'gps' end, p_selfie, nullif(v_flags, '{}'))
      on conflict (emp_id, date) do update set in_min = excluded.in_min, lat = excluded.lat, lng = excluded.lng, in_acc = excluded.in_acc,
        method = excluded.method, selfie_path = excluded.selfie_path, flags = excluded.flags,
        review_ok = null, review_by = null, review_at = null, review_note = null, updated_at = now();
    return 'in';
  end if;
  update public.hr_attendance set out_min = now_min, out_lat = p_lat, out_lng = p_lng, updated_at = now(),
    flags = nullif(array(select distinct x from unnest(coalesce(a.flags, '{}') || v_flags) x order by 1), '{}'),
    -- a new flag means HR has something new to look at
    review_ok = case when cardinality(v_flags) > 0 then null else review_ok end,
    review_by = case when cardinality(v_flags) > 0 then null else review_by end,
    review_at = case when cardinality(v_flags) > 0 then null else review_at end,
    review_note = case when cardinality(v_flags) > 0 then null else review_note end
    where emp_id = me and date = a.date;
  return 'out';
end $$;

/** HR marks a flagged clock-in as fine, or not accepted with a reason. */
create or replace function public.hr_clock_review(p_emp uuid, p_date date, p_ok boolean, p_note text) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('hr_admin') then raise exception 'Only HR can check clock-ins.' using errcode = '42501'; end if;
  if p_ok is null then raise exception 'Choose fine or not accepted.'; end if;
  if not p_ok and coalesce(trim(p_note), '') = '' then raise exception 'Say what was wrong, so it is on record.'; end if;
  update public.hr_attendance set review_ok = p_ok, review_note = nullif(trim(p_note), ''), review_at = now(),
    review_by = (select full_name from public.profiles where id = (select auth.uid()))
    where emp_id = p_emp and date = p_date and cardinality(flags) > 0;
  if not found then raise exception 'There is no flagged clock-in for that day.'; end if;
end $$;

-- ---------- selfies: private, a folder per employee, readable by the same people who see their attendance ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('hr-selfies', 'hr-selfies', false, 1048576, array['image/jpeg','image/png'])
  on conflict (id) do nothing;
create policy hr_selfies_read on storage.objects for select to authenticated
  using (bucket_id = 'hr-selfies' and public.hr_can_see(((storage.foldername(name))[1])::uuid));
create policy hr_selfies_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-selfies' and (storage.foldername(name))[1] = (select public.hr_me())::text);

-- ---------- who may run what ----------
revoke execute on function public.hr_code_seconds() from public, anon, authenticated;
revoke execute on function public.hr_code_at(bigint) from public, anon, authenticated;
revoke execute on function public.hr_code_slot() from public, anon, authenticated;
revoke execute on function public.hr_office_code() from public, anon;
revoke execute on function public.hr_clock(double precision, double precision, double precision, text, text) from public, anon;
revoke execute on function public.hr_clock_review(uuid, date, boolean, text) from public, anon;
grant execute on function public.hr_office_code() to authenticated;
grant execute on function public.hr_clock(double precision, double precision, double precision, text, text) to authenticated;
grant execute on function public.hr_clock_review(uuid, date, boolean, text) to authenticated;
