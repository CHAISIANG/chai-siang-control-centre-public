-- Delivery tracking: every invoice that goes into the SAP import file becomes a delivery job that moves
-- Invoiced > Picked > Loaded > Delivered > Completed (the signed document scanned). Failed deliveries can be planned again.
-- Exceptions (rejected, short, refused to sign...) and damaged stock found in the warehouse are logged separately.
-- Every change goes through the functions below, which check the steps again; nobody writes to the tables directly.

-- ---------- role and permissions ----------
insert into public.roles (name, label, is_system, is_super, sort) values ('warehouse', 'Warehouse / logistics clerk', false, false, 45)
  on conflict (name) do nothing;
insert into public.permissions (key, label, grp, sort) values
  ('delivery_update', 'Deliveries: pick, load, deliver, scan POD, log exceptions', 'Logistics', 71),
  ('damage_log',      'Damaged stock: log items found in the warehouse',           'Logistics', 72),
  ('damage_decide',   'Damaged stock: decide return, claim, rework or write-off',   'Logistics', 73)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('warehouse', 'page_logistics'), ('warehouse', 'delivery_update'), ('warehouse', 'damage_log'),
  ('management', 'delivery_update'), ('management', 'damage_log'), ('management', 'damage_decide'),
  ('director', 'delivery_update'), ('director', 'damage_log'), ('director', 'damage_decide'),
  ('supervisor', 'delivery_update'), ('supervisor', 'damage_log'), ('supervisor', 'damage_decide')
  on conflict do nothing;

-- ---------- tables ----------
create table public.delivery_jobs (
  doc_no        text primary key,
  doc_date      date,
  customer      text not null,
  customer_name text,
  agent         text,
  amount        numeric(14,2) not null default 0,
  doc_case      text not null default 'DO' check (doc_case in ('DO','NO_DO')),
  status        text not null default 'Invoiced' check (status in ('Invoiced','Picked','Loaded','Delivered','Completed','Failed')),
  vehicle       jsonb,                      -- {kind: own|third, lorryNo, driver, transporter, vehicleNo}
  route         text,
  pod_path      text,                       -- file in the private pod-scans bucket
  pod_file      text,
  fail_reason   text,
  batch_id      bigint,                     -- the SAP import file it came from
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index delivery_jobs_status_idx on public.delivery_jobs (status, doc_date);

create table public.delivery_events (
  id       bigint generated always as identity primary key,
  doc_no   text not null references public.delivery_jobs (doc_no) on delete cascade,
  at       timestamptz not null default now(),
  status   text not null,
  by_name  text,
  by_user  uuid,
  note     text
);
create index delivery_events_doc_idx on public.delivery_events (doc_no, id);

create table public.delivery_exceptions (
  id          uuid primary key default gen_random_uuid(),
  doc_no      text not null references public.delivery_jobs (doc_no) on delete cascade,
  kind        text not null check (kind in ('Rejected goods','Short delivery','Refused to sign','Damaged or leaking on arrival','Wrong item','Document lost','Customer closed','3rd-party failure')),
  detail      text not null check (btrim(detail) <> ''),
  qty         numeric(12,2),
  note_no     text,
  status      text not null default 'Open' check (status in ('Open','Resolved')),
  by_name     text,
  at          date not null,
  resolution  text,
  resolved_at date
);
create index delivery_exceptions_doc_idx on public.delivery_exceptions (doc_no);

create table public.damaged_stock (
  id           uuid primary key default gen_random_uuid(),
  found_on     date not null,
  item_code    text not null check (btrim(item_code) <> ''),
  description  text,
  qty          numeric(12,2) not null check (qty > 0),
  uom          text not null default 'Carton',
  zone         text not null default 'F',
  cause        text not null check (cause in ('Crushed','Leaking','Wet','Expired','Other')),
  photo_path   text,
  by_name      text,
  decision     text check (decision in ('Return to principal','Claim','Rework','Write-off')),
  decided_by   text,
  decided_on   date,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------- who can read ----------
alter table public.delivery_jobs       enable row level security;
alter table public.delivery_events     enable row level security;
alter table public.delivery_exceptions enable row level security;
alter table public.damaged_stock       enable row level security;
create policy delivery_jobs_read       on public.delivery_jobs       for select to authenticated using ((select public.has_perm('page_logistics')));
create policy delivery_events_read     on public.delivery_events     for select to authenticated using ((select public.has_perm('page_logistics')));
create policy delivery_exceptions_read on public.delivery_exceptions for select to authenticated using ((select public.has_perm('page_logistics')));
create policy damaged_stock_read       on public.damaged_stock       for select to authenticated using ((select public.has_perm('page_logistics')));
-- no write policies: changes only through the functions

-- ---------- moving jobs along ----------
create or replace function public.delivery_who() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Warehouse')
$$;

-- internal: move the invoices that are in status p_from to p_to; the rest are skipped and named
create or replace function public.delivery_move(p_docs text[], p_from text, p_to text, p_patch jsonb, p_note text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare d text; j record; done int := 0; skipped jsonb := '[]'::jsonb; who text := public.delivery_who();
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot update deliveries.' using errcode = '42501'; end if;
  foreach d in array coalesce(p_docs, array[]::text[]) loop
    select * into j from public.delivery_jobs where doc_no = d for update;
    if not found then skipped := skipped || to_jsonb(d || ' is not in the delivery list'); continue; end if;
    if j.status <> p_from then skipped := skipped || to_jsonb(d || ' is ' || j.status || ', not ' || p_from); continue; end if;
    update public.delivery_jobs set status = p_to, updated_at = now(),
      vehicle     = case when p_patch ? 'vehicle' then p_patch->'vehicle' else vehicle end,
      route       = case when p_patch ? 'route' then p_patch->>'route' else route end,
      fail_reason = case when p_patch ? 'fail_reason' then nullif(p_patch->>'fail_reason', '') else fail_reason end
      where doc_no = d;
    insert into public.delivery_events (doc_no, status, by_name, by_user, note) values (d, p_to, who, (select auth.uid()), p_note);
    done := done + 1;
  end loop;
  return jsonb_build_object('done', done, 'skipped', skipped);
end $$;

create or replace function public.delivery_pick(p_docs text[]) returns jsonb language sql security definer set search_path = '' as $$
  select public.delivery_move(p_docs, 'Invoiced', 'Picked', '{}'::jsonb, 'Second check signed')
$$;
create or replace function public.delivery_load(p_docs text[], p_vehicle jsonb, p_route text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot update deliveries.' using errcode = '42501'; end if;
  if coalesce(btrim(p_route), '') = '' then raise exception 'Enter the route.'; end if;
  if coalesce(p_vehicle->>'kind', '') = 'own' then
    if coalesce(btrim(p_vehicle->>'lorryNo'), '') = '' or coalesce(btrim(p_vehicle->>'driver'), '') = '' then raise exception 'Enter the lorry number and the driver.'; end if;
  elsif coalesce(p_vehicle->>'kind', '') = 'third' then
    if coalesce(btrim(p_vehicle->>'transporter'), '') = '' then raise exception 'Enter the transporter.'; end if;
  else raise exception 'Choose our own lorry or a 3rd-party transporter.'; end if;
  return public.delivery_move(p_docs, 'Picked', 'Loaded', jsonb_build_object('vehicle', p_vehicle, 'route', btrim(p_route), 'fail_reason', ''), 'Manifest signed');
end $$;
create or replace function public.delivery_deliver(p_docs text[]) returns jsonb language sql security definer set search_path = '' as $$
  select public.delivery_move(p_docs, 'Loaded', 'Delivered', '{}'::jsonb, 'Signed document received')
$$;
create or replace function public.delivery_fail(p_doc text, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give the reason the delivery failed.'; end if;
  return public.delivery_move(array[p_doc], 'Loaded', 'Failed', jsonb_build_object('fail_reason', btrim(p_reason)), btrim(p_reason));
end $$;
create or replace function public.delivery_replan(p_doc text) returns jsonb language sql security definer set search_path = '' as $$
  select public.delivery_move(array[p_doc], 'Failed', 'Picked', jsonb_build_object('fail_reason', ''), 'Re-planned')
$$;
create or replace function public.delivery_set_case(p_doc text, p_case text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot update deliveries.' using errcode = '42501'; end if;
  if p_case not in ('DO','NO_DO') then raise exception 'Choose With DO or No DO.'; end if;
  update public.delivery_jobs set doc_case = p_case, updated_at = now() where doc_no = p_doc and status = 'Invoiced';
  if not found then raise exception 'The document type can only change before picking.'; end if;
end $$;

-- attach the scanned, signed document (already uploaded to the pod-scans bucket) and complete the job
create or replace function public.delivery_attach_pod(p_doc text, p_path text, p_file text) returns void language plpgsql security definer set search_path = '' as $$
declare j record;
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot update deliveries.' using errcode = '42501'; end if;
  select * into j from public.delivery_jobs where doc_no = p_doc for update;
  if not found then raise exception 'Invoice % is not in the delivery list.', p_doc; end if;
  if j.status = 'Completed' then raise exception '% already has a POD.', p_doc; end if;
  if j.status <> 'Delivered' then raise exception '% is %, a POD can only be attached once it is Delivered.', p_doc, j.status; end if;
  if left(coalesce(p_path, ''), length(p_doc) + 1) <> p_doc || '/' then raise exception 'The file is not stored under this invoice.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'pod-scans' and name = p_path) then raise exception 'The scan was not uploaded.'; end if;
  update public.delivery_jobs set status = 'Completed', pod_path = p_path, pod_file = nullif(btrim(p_file), ''), updated_at = now() where doc_no = p_doc;
  insert into public.delivery_events (doc_no, status, by_name, by_user, note) values (p_doc, 'Completed', public.delivery_who(), (select auth.uid()), 'POD scanned');
end $$;

-- ---------- exceptions ----------
create or replace function public.delivery_exception_log(p_doc text, p_kind text, p_detail text, p_qty numeric, p_note_no text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot log exceptions.' using errcode = '42501'; end if;
  if not exists (select 1 from public.delivery_jobs where doc_no = p_doc) then raise exception 'Choose an invoice from the delivery list.'; end if;
  if coalesce(btrim(p_detail), '') = '' then raise exception 'Describe what happened.'; end if;
  insert into public.delivery_exceptions (doc_no, kind, detail, qty, note_no, by_name, at)
    values (p_doc, p_kind, btrim(p_detail), p_qty, nullif(btrim(p_note_no), ''), public.delivery_who(), (now() at time zone 'Asia/Kuala_Lumpur')::date) returning id into i;
  return i;
end $$;
create or replace function public.delivery_exception_resolve(p_id uuid, p_resolution text, p_note_no text) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot settle exceptions.' using errcode = '42501'; end if;
  if coalesce(btrim(p_resolution), '') = '' then raise exception 'Say how it was settled.'; end if;
  update public.delivery_exceptions set status = 'Resolved', resolution = btrim(p_resolution), note_no = coalesce(nullif(btrim(p_note_no), ''), note_no),
    resolved_at = (now() at time zone 'Asia/Kuala_Lumpur')::date where id = p_id and status = 'Open';
  if not found then raise exception 'That exception is already settled.'; end if;
end $$;

-- ---------- damaged stock ----------
create or replace function public.damaged_log(p_item_code text, p_description text, p_qty numeric, p_uom text, p_cause text, p_photo_path text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  if not public.has_perm('damage_log') then raise exception 'You cannot log damaged stock.' using errcode = '42501'; end if;
  if coalesce(btrim(p_item_code), '') = '' then raise exception 'Enter the item code.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity above zero.'; end if;
  insert into public.damaged_stock (found_on, item_code, description, qty, uom, cause, photo_path, by_name)
    values ((now() at time zone 'Asia/Kuala_Lumpur')::date, btrim(p_item_code), btrim(coalesce(p_description, '')), p_qty, coalesce(nullif(btrim(p_uom), ''), 'Carton'), p_cause, nullif(btrim(p_photo_path), ''), public.delivery_who())
    returning id into i;
  return i;
end $$;
create or replace function public.damaged_decide(p_id uuid, p_decision text, p_note text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('damage_decide') then raise exception 'Only the supervisor, Management or a Director can decide.' using errcode = '42501'; end if;
  if p_decision not in ('Return to principal','Claim','Rework','Write-off') then raise exception 'Choose a decision.'; end if;
  if p_decision = 'Write-off' and coalesce(btrim(p_note), '') = '' then raise exception 'A write-off needs a written reason.'; end if;
  update public.damaged_stock set decision = p_decision, decided_by = public.delivery_who(), decided_on = (now() at time zone 'Asia/Kuala_Lumpur')::date, note = nullif(btrim(p_note), '')
    where id = p_id and decision is null;
  if not found then raise exception 'This item already has a decision.'; end if;
end $$;

-- ---------- the SAP import creates the delivery jobs ----------
create or replace function public.sap_import_record(p_file text, p_lines jsonb)
  returns bigint language plpgsql security definer set search_path = '' as $$
declare
  b bigint;
  who text := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
begin
  if not public.has_perm('sap_import') then
    raise exception 'You cannot record SAP imports' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'There are no lines to record';
  end if;
  insert into public.sap_import_batches (file_name, made_by, made_by_name, invoices, lines, net_total, doc_from, doc_to)
    select coalesce(nullif(trim(p_file), ''), 'SAP export'), (select auth.uid()), who,
           count(distinct x->>'doc_no'), count(*), coalesce(sum((x->>'amount')::numeric), 0),
           min((x->>'doc_date')::date), max((x->>'doc_date')::date)
    from jsonb_array_elements(p_lines) x
    returning id into b;
  insert into public.sap_import_lines (batch_id, sort, doc_no, doc_date, customer, customer_name, agent, doc_ref, item_code, description,
                                       uom, qty, unit_price, amount, discount, suom_qty, split)
    select b, n::int, x->>'doc_no', (x->>'doc_date')::date, x->>'customer', x->>'customer_name', x->>'agent', nullif(x->>'doc_ref', ''),
           x->>'item_code', x->>'description', x->>'uom', (x->>'qty')::numeric, (x->>'unit_price')::numeric, (x->>'amount')::numeric,
           coalesce((x->>'discount')::numeric, 0), (x->>'suom_qty')::numeric, coalesce((x->>'split')::boolean, false)
    from jsonb_array_elements(p_lines) with ordinality as t(x, n);
  -- each invoice becomes a delivery job (an invoice that already has one keeps it)
  with ins as (
    insert into public.delivery_jobs (doc_no, doc_date, customer, customer_name, agent, amount, batch_id)
      select x->>'doc_no', min((x->>'doc_date')::date), max(x->>'customer'), max(x->>'customer_name'), max(x->>'agent'), round(sum((x->>'amount')::numeric), 2), b
      from jsonb_array_elements(p_lines) x group by x->>'doc_no'
      on conflict (doc_no) do nothing
      returning doc_no
  )
  insert into public.delivery_events (doc_no, status, by_name, by_user, note) select doc_no, 'Invoiced', who, (select auth.uid()), 'SAP import' from ins;
  return b;
end $$;

-- removing an import file also removes the delivery jobs nobody has touched yet; jobs already moved on stay
create or replace function public.delivery_batch_removed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.delivery_jobs j where j.batch_id = old.id and j.status = 'Invoiced'
    and not exists (select 1 from public.delivery_events e where e.doc_no = j.doc_no and e.status <> 'Invoiced');
  return old;
end $$;
create trigger sap_import_batch_removed after delete on public.sap_import_batches for each row execute function public.delivery_batch_removed();

-- ---------- scans and photos: private files ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('pod-scans', 'pod-scans', false, 10485760, array['application/pdf','image/jpeg','image/png','image/heic'])
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('damage-photos', 'damage-photos', false, 5242880, array['image/jpeg','image/png','image/heic'])
  on conflict (id) do nothing;
create policy pod_scans_read on storage.objects for select to authenticated
  using (bucket_id = 'pod-scans' and public.has_perm('page_logistics'));
create policy pod_scans_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pod-scans' and public.has_perm('delivery_update'));
create policy damage_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'damage-photos' and public.has_perm('page_logistics'));
create policy damage_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'damage-photos' and public.has_perm('damage_log'));

-- ---------- function access ----------
do $$
declare f text;
begin
  foreach f in array array[
    'delivery_who()', 'delivery_move(text[], text, text, jsonb, text)', 'delivery_pick(text[])', 'delivery_load(text[], jsonb, text)', 'delivery_deliver(text[])',
    'delivery_fail(text, text)', 'delivery_replan(text)', 'delivery_set_case(text, text)', 'delivery_attach_pod(text, text, text)',
    'delivery_exception_log(text, text, text, numeric, text)', 'delivery_exception_resolve(uuid, text, text)',
    'damaged_log(text, text, numeric, text, text, text)', 'damaged_decide(uuid, text, text)', 'delivery_batch_removed()']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    if f not in ('delivery_move(text[], text, text, jsonb, text)', 'delivery_batch_removed()') then execute format('grant execute on function public.%s to authenticated', f); end if;
  end loop;
end $$;

-- ---------- live updates ----------
alter publication supabase_realtime add table public.delivery_jobs, public.delivery_exceptions, public.damaged_stock;
