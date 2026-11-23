-- Lorry list: our own lorries with size, what they hold, the usual driver, condition, and the dates that must not lapse.
-- Everyone who sees Logistics can read it; people with "fleet_manage" change it, only through the functions below,
-- and every condition change is kept as history. A lorry in the workshop or off the road cannot be loaded.

insert into public.permissions (key, label, grp, sort) values
  ('fleet_manage', 'Logistics: add lorries and change their condition and dates', 'Logistics', 60)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('management', 'fleet_manage'), ('director', 'fleet_manage'), ('supervisor', 'fleet_manage'), ('logistics', 'fleet_manage'), ('warehouse', 'fleet_manage')
  on conflict do nothing;

create table public.fleet_lorries (
  no              text primary key check (no ~ '^[A-Z]{1,4} ?[0-9]{1,4} ?[A-Z]{0,2}$'),
  size            text not null default '3 tonne' check (size in ('1 tonne','3 tonne','5 tonne','10 tonne','Other')),
  pallets         int check (pallets is null or pallets >= 0),
  cartons         int check (cartons is null or cartons >= 0),
  driver          text not null default '',
  condition       text not null default 'Good' check (condition in ('Good','Needs service','In workshop','Off road')),
  road_tax        date,
  insurance       date,
  puspakom        date,
  last_service    date,
  next_service    date,
  notes           text not null default '',
  updated_at      timestamptz not null default now(),
  updated_by      text
);
create table public.fleet_events (
  id        bigint generated always as identity primary key,
  lorry_no  text not null references public.fleet_lorries(no) on update cascade on delete cascade,
  at        timestamptz not null default now(),
  by_name   text,
  condition text not null,
  note      text
);
create index fleet_events_lorry_idx on public.fleet_events (lorry_no, at desc);

alter table public.fleet_lorries enable row level security;
alter table public.fleet_events enable row level security;
create policy fleet_lorries_read on public.fleet_lorries for select to authenticated using ((select public.has_perm('page_logistics')));
create policy fleet_events_read on public.fleet_events for select to authenticated using ((select public.has_perm('page_logistics')));

create or replace function public.fleet_who() returns text language sql stable security definer set search_path = '' as
$$ select coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Logistics') $$;

/** Plates are kept as "WXY 1234" (or "WXY 1234 A"): "wxy1234" and "WXY 1234" are the same lorry. */
create or replace function public.fleet_plate(p text) returns text language sql immutable set search_path = '' as
$$ select btrim(regexp_replace(regexp_replace(upper(coalesce(p, '')), '\s+', '', 'g'), '^([A-Z]+)([0-9]+)([A-Z]*)$', '\1 \2 \3')) $$;

/** Add a lorry, or save one (p_was = its plate before the edit, null for a new one). */
create or replace function public.fleet_save(p_was text, p_row jsonb) returns text language plpgsql security definer set search_path = '' as $$
declare v_no text := public.fleet_plate(p_row->>'no'); was text := nullif(public.fleet_plate(p_was), ''); old_cond text; who text := public.fleet_who();
  cond text := coalesce(nullif(p_row->>'condition', ''), 'Good');
begin
  if not public.has_perm('fleet_manage') then raise exception 'You cannot change the lorry list.' using errcode = '42501'; end if;
  if v_no !~ '^[A-Z]{1,4} ?[0-9]{1,4} ?[A-Z]{0,2}$' then raise exception 'Enter the plate like WXY 1234.'; end if;
  if cond not in ('Good','Needs service','In workshop','Off road') then raise exception 'Pick a condition.'; end if;
  if was is not null then
    select condition into old_cond from public.fleet_lorries where fleet_lorries.no = was for update;
    if not found then raise exception 'Lorry % is not on the list.', was; end if;
  end if;
  if exists (select 1 from public.fleet_lorries l where l.no = v_no and l.no is distinct from was) then raise exception '% is already on the list.', v_no; end if;
  if was is null then
    insert into public.fleet_lorries (no, updated_by) values (v_no, who);
  elsif was <> v_no then
    update public.fleet_lorries set no = v_no where fleet_lorries.no = was;   -- history follows the new plate
  end if;
  update public.fleet_lorries l set
    size = coalesce(nullif(p_row->>'size', ''), '3 tonne'), pallets = nullif(p_row->>'pallets', '')::int, cartons = nullif(p_row->>'cartons', '')::int,
    driver = btrim(coalesce(p_row->>'driver', '')), condition = cond,
    road_tax = nullif(p_row->>'roadTax', '')::date, insurance = nullif(p_row->>'insurance', '')::date, puspakom = nullif(p_row->>'puspakom', '')::date,
    last_service = nullif(p_row->>'lastService', '')::date, next_service = nullif(p_row->>'nextService', '')::date,
    notes = btrim(coalesce(p_row->>'notes', '')), updated_at = now(), updated_by = who
    where l.no = v_no;
  if was is null or old_cond is distinct from cond then
    insert into public.fleet_events (lorry_no, by_name, condition, note) values (v_no, who, cond, case when was is null then coalesce(nullif(p_row->>'note', ''), 'Added') else nullif(btrim(coalesce(p_row->>'notes', '')), '') end);
  end if;
  return v_no;
end $$;

/** Change a lorry's condition. Anything but Good needs a short reason. */
create or replace function public.fleet_condition(p_no text, p_condition text, p_note text) returns void language plpgsql security definer set search_path = '' as $$
declare v_no text := public.fleet_plate(p_no); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_perm('fleet_manage') then raise exception 'You cannot change the lorry list.' using errcode = '42501'; end if;
  if p_condition not in ('Good','Needs service','In workshop','Off road') then raise exception 'Pick a condition.'; end if;
  if p_condition <> 'Good' and v_note is null then raise exception 'Say what is wrong, so the next person knows.'; end if;
  update public.fleet_lorries set condition = p_condition, notes = case when p_condition = 'Good' then notes else v_note end, updated_at = now(), updated_by = public.fleet_who()
    where fleet_lorries.no = v_no;
  if not found then raise exception 'Lorry % is not on the list.', v_no; end if;
  insert into public.fleet_events (lorry_no, by_name, condition, note) values (v_no, public.fleet_who(), p_condition, v_note);
end $$;

create or replace function public.fleet_remove(p_no text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('fleet_manage') then raise exception 'You cannot change the lorry list.' using errcode = '42501'; end if;
  delete from public.fleet_lorries where no = public.fleet_plate(p_no);
  if not found then raise exception 'That lorry is not on the list.'; end if;
end $$;

/** Add or update many lorries from the Excel list, all or nothing. */
create or replace function public.fleet_import(p_rows jsonb) returns int language plpgsql security definer set search_path = '' as $$
declare x jsonb; n int := 0; v_no text;
begin
  if not public.has_perm('fleet_manage') then raise exception 'You cannot change the lorry list.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Bad list.'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    v_no := public.fleet_plate(x->>'no');
    perform public.fleet_save(case when exists (select 1 from public.fleet_lorries l where l.no = v_no) then v_no end, x || jsonb_build_object('note', 'Imported'));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- loading: a lorry in the workshop or off the road cannot be loaded ----------
create or replace function public.delivery_load(p_docs text[], p_vehicle jsonb, p_route text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare lorry record;
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot update deliveries.' using errcode = '42501'; end if;
  if coalesce(btrim(p_route), '') = '' then raise exception 'Enter the route.'; end if;
  if coalesce(p_vehicle->>'kind', '') = 'own' then
    if coalesce(btrim(p_vehicle->>'lorryNo'), '') = '' or coalesce(btrim(p_vehicle->>'driver'), '') = '' then raise exception 'Enter the lorry number and the driver.'; end if;
    select * into lorry from public.fleet_lorries where no = public.fleet_plate(p_vehicle->>'lorryNo');
    if found and lorry.condition in ('In workshop','Off road') then raise exception 'Lorry % is %: it cannot be loaded.', lorry.no, lower(lorry.condition); end if;
  elsif coalesce(p_vehicle->>'kind', '') = 'third' then
    if coalesce(btrim(p_vehicle->>'transporter'), '') = '' then raise exception 'Enter the transporter.'; end if;
  else raise exception 'Choose our own lorry or a 3rd-party transporter.'; end if;
  return public.delivery_move(p_docs, 'Picked', 'Loaded', jsonb_build_object('vehicle', p_vehicle, 'route', btrim(p_route), 'fail_reason', ''), 'Manifest signed');
end $$;

-- ---------- who may run what ----------
revoke execute on function public.fleet_who() from public, anon, authenticated;
revoke execute on function public.fleet_save(text, jsonb), public.fleet_condition(text, text, text), public.fleet_remove(text), public.fleet_import(jsonb) from public, anon;
grant execute on function public.fleet_save(text, jsonb), public.fleet_condition(text, text, text), public.fleet_remove(text), public.fleet_import(jsonb) to authenticated;
revoke execute on function public.delivery_load(text[], jsonb, text) from public, anon;
grant execute on function public.delivery_load(text[], jsonb, text) to authenticated;
