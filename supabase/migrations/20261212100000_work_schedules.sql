-- Two work schedules. The office team rests on the set rest days (Saturday and Sunday). The Saturday team
-- (logistics, sales, merchandisers) works every Saturday, full day, except the Saturdays of the month in
-- satOffWeeks (the 2nd), and rests on the other rest days. Leave is counted on each person's own schedule.

alter table public.hr_employees add column schedule text not null default 'office' check (schedule in ('office','saturday'));
update public.hr_employees set schedule = 'saturday' where upper(dept) in ('LOGISTICS','LOGISTIC','SALES','MECHANDISER','MERCHANDISER');
update public.hr_settings set data = data || jsonb_build_object('satOffWeeks', coalesce(data->'satOffWeeks', '[2]'::jsonb)) where id = 1;

/** Whether a day is a working day for someone in this state on this schedule. */
create or replace function public.hr_is_working(p_day date, p_state text, p_schedule text) returns boolean language sql stable security definer set search_path = '' as $$
  select case
           when coalesce(p_schedule, 'office') = 'saturday' and extract(dow from p_day)::int = 6
             then not (ceil(extract(day from p_day) / 7.0)::int in (select jsonb_array_elements_text(coalesce(public.hr_set()->'satOffWeeks', '[2]'::jsonb))::int))
           else not (extract(dow from p_day)::int in (select jsonb_array_elements_text(public.hr_set()->'restDays')::int))
         end
     and not exists (select 1 from public.hr_holidays h where h.date = p_day and (h.scope = 'Federal' or h.scope = p_state))
$$;
-- the two-argument form stays for anything that does not know the schedule: it means the office team
create or replace function public.hr_is_working(p_day date, p_state text) returns boolean language sql stable security definer set search_path = '' as
$$ select public.hr_is_working(p_day, p_state, 'office') $$;

/** Leave days between two dates on a person's schedule (maternity leave counts calendar days). */
create or replace function public.hr_leave_days(p_from date, p_to date, p_half text, p_state text, p_type text, p_schedule text) returns numeric language sql stable security definer set search_path = '' as $$
  select case
    when p_to < p_from then 0
    when p_type = 'ML' then (p_to - p_from + 1)::numeric
    when coalesce(p_half, '') <> '' and p_from = p_to then case when public.hr_is_working(p_from, p_state, p_schedule) then 0.5 else 0 end
    else (select count(*)::numeric from generate_series(p_from, p_to, interval '1 day') g(d) where public.hr_is_working(g.d::date, p_state, p_schedule))
  end
$$;
create or replace function public.hr_leave_days(p_from date, p_to date, p_half text, p_state text, p_type text) returns numeric language sql stable security definer set search_path = '' as
$$ select public.hr_leave_days(p_from, p_to, p_half, p_state, p_type, 'office') $$;

-- applying for leave and the balance count on the person's own schedule
CREATE OR REPLACE FUNCTION public.hr_apply(p_type text, p_from date, p_to date, p_half text, p_reason text, p_mc_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  n := public.hr_leave_days(p_from, p_to, case when p_from = p_to then coalesce(p_half, '') else '' end, e.state, p_type, e.schedule);
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
end $function$
;

CREATE OR REPLACE FUNCTION public.hr_balance(p_emp uuid, p_type text, p_year integer, p_auto_carry boolean DEFAULT true)
 RETURNS TABLE(total numeric, used numeric, pending numeric, available numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select coalesce(sum(case when r.to_date <= expiry then r.days else public.hr_leave_days(r.from_date, expiry, '', e.state, 'AL', e.schedule) end), 0)
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
end $function$
;

-- importing staff: new logistics, sales and merchandiser staff start on the Saturday team; an update keeps the schedule HR set
CREATE OR REPLACE FUNCTION public.hr_import_employees(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare x jsonb; n int := 0;
begin
  if not public.has_perm('hr_admin') then raise exception 'Only HR can import staff.' using errcode = '42501'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(x->>'code'), '') = '' or coalesce(trim(x->>'name'), '') = '' then raise exception 'Every row needs an employee code and a name.'; end if;
    if coalesce(x->>'gender', '') not in ('F','M') then raise exception 'Gender for % must be F or M.', x->>'code'; end if;
    insert into public.hr_employees (code, name, position, dept, gender, state, joined, hr_role, email, phone, active, schedule)
    values (upper(trim(x->>'code')), trim(x->>'name'), coalesce(x->>'position', ''), coalesce(x->>'dept', ''), x->>'gender', coalesce(nullif(x->>'state', ''), 'Selangor'),
            (x->>'joined')::date, coalesce(nullif(x->>'hr_role', ''), 'employee'), nullif(trim(x->>'email'), ''), nullif(trim(x->>'phone'), ''), coalesce((x->>'active')::boolean, true),
            case when upper(coalesce(x->>'dept', '')) in ('LOGISTICS','LOGISTIC','SALES','MECHANDISER','MERCHANDISER') then 'saturday' else 'office' end)
    on conflict (code) do update set name = excluded.name, position = excluded.position, dept = excluded.dept, gender = excluded.gender, state = excluded.state,
      joined = excluded.joined, hr_role = excluded.hr_role, email = excluded.email, phone = excluded.phone, active = excluded.active, updated_at = now();
    n := n + 1;
  end loop;
  -- second pass, once everyone exists: who reports to whom
  update public.hr_employees e set manager_id = m.id, updated_at = now()
    from jsonb_array_elements(p_rows) as j(rec) join public.hr_employees m on m.code = upper(trim(j.rec->>'manager_code'))
    where e.code = upper(trim(j.rec->>'code')) and coalesce(trim(j.rec->>'manager_code'), '') <> '' and m.id <> e.id;
  return n;
end $function$
;

revoke execute on function public.hr_is_working(date, text, text), public.hr_leave_days(date, date, text, text, text, text) from public, anon, authenticated;
