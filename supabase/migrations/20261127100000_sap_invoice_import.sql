-- SAP invoice import: the pack-item list, and a record of every import file made,
-- so the screen can warn about invoices already imported and carton prices that changed.

insert into public.permissions (key, label, grp, sort) values
  ('sap_import', 'Convert SAP invoice exports into the import file', 'Finance', 65)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('finance', 'sap_import'), ('management', 'sap_import')
  on conflict do nothing;

-- Items whose loose quantity is a pack (twin packs, 3-packs ...), shown as "Pack" instead of "Unit".
create table public.sap_pack_items (
  item_code   text primary key,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- One row per import file made.
create table public.sap_import_batches (
  id              bigint generated always as identity primary key,
  file_name       text not null,
  made_at         timestamptz not null default now(),
  made_by         uuid,
  made_by_name    text,
  invoices        int not null,
  lines           int not null,
  net_total       numeric(14,2) not null,
  doc_from        date,
  doc_to          date
);

-- The lines that went into each import file.
create table public.sap_import_lines (
  id          bigint generated always as identity primary key,
  batch_id    bigint not null references public.sap_import_batches (id) on delete cascade,
  doc_no      text not null,
  doc_date    date,
  customer    text,
  item_code   text not null,
  uom         text not null,
  qty         numeric(14,3) not null,
  unit_price  numeric(16,6) not null,
  amount      numeric(14,2) not null,
  discount    numeric(14,2) not null default 0
);
create index sap_import_lines_doc_idx  on public.sap_import_lines (doc_no);
create index sap_import_lines_item_idx on public.sap_import_lines (item_code, doc_date desc);
create index sap_import_lines_batch_idx on public.sap_import_lines (batch_id);

alter table public.sap_pack_items     enable row level security;
alter table public.sap_import_batches enable row level security;
alter table public.sap_import_lines   enable row level security;

create policy sap_pack_items_read on public.sap_pack_items for select to authenticated using ((select public.has_perm('sap_import')));
create policy sap_import_batches_read on public.sap_import_batches for select to authenticated using ((select public.has_perm('sap_import')));
create policy sap_import_lines_read on public.sap_import_lines for select to authenticated using ((select public.has_perm('sap_import')));
-- A wrong batch can be removed (its lines go with it), so those invoices can be imported again.
create policy sap_import_batches_delete on public.sap_import_batches for delete to authenticated using ((select public.has_perm('sap_import')));
-- No other write policies: changes go through the two functions below.

-- Replace the whole pack-item list. p_items: [{"item_code": "...", "description": "..."}]
create or replace function public.sap_pack_replace(p_items jsonb)
  returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.has_perm('sap_import') then
    raise exception 'You cannot change the pack-item list' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The list is empty';
  end if;
  delete from public.sap_pack_items where true;
  insert into public.sap_pack_items (item_code, description, updated_by)
    select distinct on (trim(x->>'item_code')) trim(x->>'item_code'), nullif(trim(x->>'description'), ''), (select auth.uid())
    from jsonb_array_elements(p_items) x
    where coalesce(trim(x->>'item_code'), '') <> '';
  get diagnostics n = row_count;
  return n;
end $$;

-- Record an import file. p_lines: the rows of the file as made by the screen.
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
  insert into public.sap_import_lines (batch_id, doc_no, doc_date, customer, item_code, uom, qty, unit_price, amount, discount)
    select b, x->>'doc_no', (x->>'doc_date')::date, x->>'customer', x->>'item_code', x->>'uom',
           (x->>'qty')::numeric, (x->>'unit_price')::numeric, (x->>'amount')::numeric, coalesce((x->>'discount')::numeric, 0)
    from jsonb_array_elements(p_lines) x;
  return b;
end $$;

revoke execute on function public.sap_pack_replace(jsonb) from public, anon;
revoke execute on function public.sap_import_record(text, jsonb) from public, anon;
grant  execute on function public.sap_pack_replace(jsonb) to authenticated;
grant  execute on function public.sap_import_record(text, jsonb) to authenticated;

-- The last carton price imported for each item, to spot price changes. Runs with the caller's rights (RLS applies).
create or replace function public.sap_last_prices(p_items text[])
  returns table (item_code text, unit_price numeric, doc_no text, doc_date date)
  language sql stable security invoker set search_path = '' as $$
  select distinct on (l.item_code) l.item_code, l.unit_price, l.doc_no, l.doc_date
  from public.sap_import_lines l
  where l.item_code = any (p_items)
  order by l.item_code, l.doc_date desc nulls last, l.id desc
$$;
revoke execute on function public.sap_last_prices(text[]) from public, anon;
grant  execute on function public.sap_last_prices(text[]) to authenticated;
