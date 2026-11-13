-- Customer purchase order tracking: PO -> order check -> invoice -> delivery -> signed proof.
-- Anyone with page_finance can read. finance_manage can change. Business rules live here, not only in the screens.

create table public.fin_pos (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.fin_clients(id) on delete restrict,
  po_no          text not null check (length(trim(po_no)) > 0),
  po_date        date not null,
  req_date       date not null,
  so_no          text,
  keyed_by       text not null check (length(trim(keyed_by)) > 0),
  checked_by     text,
  invoice_id     uuid references public.fin_invoices(id) on delete set null,
  delivered_date date,
  driver         text,
  route          text,
  proof_path     text,
  note           text not null default '',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  check (req_date >= po_date),
  check (checked_by is null or lower(trim(checked_by)) <> lower(trim(keyed_by))),
  check (invoice_id is null or checked_by is not null),
  check (delivered_date is null or invoice_id is not null)
);
create unique index fin_pos_client_pono on public.fin_pos (client_id, lower(trim(po_no)));
create unique index fin_pos_invoice on public.fin_pos (invoice_id) where invoice_id is not null;
create index fin_pos_req_idx on public.fin_pos (req_date);

create table public.fin_po_lines (
  id        bigint generated always as identity primary key,
  po_id     uuid not null references public.fin_pos(id) on delete cascade,
  sort      int not null default 0,
  sku       text not null check (length(trim(sku)) > 0),
  descr     text not null default '',
  po_qty    numeric(12,2) not null check (po_qty > 0),
  po_price  numeric(14,2) not null check (po_price >= 0),
  inv_qty   numeric(12,2) check (inv_qty >= 0),
  inv_price numeric(14,2) check (inv_price >= 0),
  del_qty   numeric(12,2) check (del_qty >= 0)
);
create index fin_po_lines_po_idx on public.fin_po_lines (po_id, sort);

-- The reason staff gave for a problem. issue_key is "kind:item", for example "short:HC-DISH-750".
create table public.fin_po_reasons (
  po_id      uuid not null references public.fin_pos(id) on delete cascade,
  issue_key  text not null,
  reason     text not null check (length(trim(reason)) >= 3),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (po_id, issue_key)
);

-- Rules that look at other tables.
create or replace function public.fin_po_guard() returns trigger language plpgsql set search_path = public as $$
declare inv record;
begin
  if new.invoice_id is not null then
    select client_id, issue_date into inv from public.fin_invoices where id = new.invoice_id;
    if inv.client_id is distinct from new.client_id then raise exception 'That invoice belongs to a different customer.'; end if;
    if inv.issue_date < new.po_date then raise exception 'The invoice date cannot be before the PO date.'; end if;
    if new.delivered_date is not null and new.delivered_date < inv.issue_date then raise exception 'The delivery date cannot be before the invoice date.'; end if;
  end if;
  if new.delivered_date is not null and new.delivered_date > current_date then raise exception 'The delivery date cannot be in the future.'; end if;
  return new;
end $$;
create trigger fin_po_guard_t before insert or update on public.fin_pos for each row execute function public.fin_po_guard();

-- Row level security
alter table public.fin_pos        enable row level security;
alter table public.fin_po_lines   enable row level security;
alter table public.fin_po_reasons enable row level security;
do $$
declare t text;
begin
  foreach t in array array['fin_pos','fin_po_lines','fin_po_reasons'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.has_perm(''page_finance'')))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(''finance_manage'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.has_perm(''finance_manage''))) with check ((select public.has_perm(''finance_manage'')))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_perm(''finance_manage'')))', t || '_delete', t);
  end loop;
end $$;

-- Each step is one function so it either fully happens or not at all. They run as the signed-in person, so the policies above apply.
create or replace function public.po_create(p_client uuid, p_po_no text, p_po_date date, p_req_date date, p_so_no text, p_keyed_by text, p_lines jsonb)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid; l jsonb; n int := 0;
begin
  if p_req_date < p_po_date then raise exception 'The requested delivery date cannot be before the PO date.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one PO line.'; end if;
  if exists (select 1 from fin_pos where client_id = p_client and lower(trim(po_no)) = lower(trim(p_po_no))) then
    raise exception 'This customer already has a PO numbered %. Open it instead of keying it twice.', trim(p_po_no);
  end if;
  insert into fin_pos (client_id, po_no, po_date, req_date, so_no, keyed_by, note)
    values (p_client, trim(p_po_no), p_po_date, p_req_date, nullif(trim(coalesce(p_so_no, '')), ''), trim(p_keyed_by), 'Order keyed, waiting for second check.') returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into fin_po_lines (po_id, sort, sku, descr, po_qty, po_price)
      values (v_id, n, trim(l->>'sku'), coalesce(nullif(trim(l->>'descr'), ''), trim(l->>'sku')), (l->>'qty')::numeric, (l->>'price')::numeric);
    n := n + 1;
  end loop;
  return v_id;
end $$;

create or replace function public.po_mark_checked(p_id uuid, p_checker text) returns void language plpgsql set search_path = public as $$
declare k text;
begin
  select keyed_by into k from fin_pos where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
  if length(trim(coalesce(p_checker, ''))) = 0 then raise exception 'Enter the name of the person who checked.'; end if;
  if lower(trim(p_checker)) = lower(trim(k)) then raise exception 'The checker must be a different person from the one who keyed the order.'; end if;
  update fin_pos set checked_by = trim(p_checker), note = '' where id = p_id;
end $$;

create or replace function public.po_link_invoice(p_id uuid, p_invoice uuid, p_lines jsonb) returns void language plpgsql set search_path = public as $$
declare p record; i int := 0; l jsonb;
begin
  select * into p from fin_pos where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
  if p.checked_by is null then raise exception 'The order must be checked against the PO before it is invoiced.'; end if;
  if exists (select 1 from fin_pos where invoice_id = p_invoice and id <> p_id) then raise exception 'That invoice is already linked to another PO.'; end if;
  if jsonb_array_length(p_lines) <> (select count(*) from fin_po_lines where po_id = p_id) then raise exception 'Enter the quantity and price for every line.'; end if;
  update fin_pos set invoice_id = p_invoice, note = '' where id = p_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    update fin_po_lines set inv_qty = (l->>'qty')::numeric, inv_price = (l->>'price')::numeric
      where id = (select id from fin_po_lines where po_id = p_id order by sort, id offset i limit 1);
    i := i + 1;
  end loop;
end $$;

create or replace function public.po_record_delivery(p_id uuid, p_date date, p_driver text, p_route text, p_qty jsonb, p_proof_path text) returns void language plpgsql set search_path = public as $$
declare p record; i int := 0; q jsonb;
begin
  select * into p from fin_pos where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
  if p.invoice_id is null then raise exception 'Link the invoice before recording the delivery.'; end if;
  if length(trim(coalesce(p_driver, ''))) = 0 then raise exception 'Enter the driver.'; end if;
  if jsonb_array_length(p_qty) <> (select count(*) from fin_po_lines where po_id = p_id) then raise exception 'Enter the delivered quantity for every line.'; end if;
  update fin_pos set delivered_date = p_date, driver = trim(p_driver), route = coalesce(nullif(trim(coalesce(p_route, '')), ''), '–'), proof_path = p_proof_path, note = '' where id = p_id;
  for q in select * from jsonb_array_elements(p_qty) loop
    update fin_po_lines set del_qty = (q #>> '{}')::numeric
      where id = (select id from fin_po_lines where po_id = p_id order by sort, id offset i limit 1);
    i := i + 1;
  end loop;
end $$;

create or replace function public.po_set_proof(p_id uuid, p_path text) returns void language plpgsql set search_path = public as $$
begin
  update fin_pos set proof_path = p_path where id = p_id and delivered_date is not null;
  if not found then raise exception 'Record the delivery before uploading the signed copy.'; end if;
end $$;

create or replace function public.po_add_reason(p_id uuid, p_key text, p_reason text) returns void language plpgsql set search_path = public as $$
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a short reason.'; end if;
  insert into fin_po_reasons (po_id, issue_key, reason) values (p_id, p_key, trim(p_reason))
    on conflict (po_id, issue_key) do update set reason = excluded.reason, created_by = auth.uid(), created_at = now();
end $$;

revoke all on function public.po_create(uuid, text, date, date, text, text, jsonb) from public, anon;
revoke all on function public.po_mark_checked(uuid, text) from public, anon;
revoke all on function public.po_link_invoice(uuid, uuid, jsonb) from public, anon;
revoke all on function public.po_record_delivery(uuid, date, text, text, jsonb, text) from public, anon;
revoke all on function public.po_set_proof(uuid, text) from public, anon;
revoke all on function public.po_add_reason(uuid, text, text) from public, anon;
grant execute on function public.po_create(uuid, text, date, date, text, text, jsonb) to authenticated;
grant execute on function public.po_mark_checked(uuid, text) to authenticated;
grant execute on function public.po_link_invoice(uuid, uuid, jsonb) to authenticated;
grant execute on function public.po_record_delivery(uuid, date, text, text, jsonb, text) to authenticated;
grant execute on function public.po_set_proof(uuid, text) to authenticated;
grant execute on function public.po_add_reason(uuid, text, text) to authenticated;

-- Private bucket for signed delivery copies. First path segment = PO id.
insert into storage.buckets (id, name, public) values ('po-proofs', 'po-proofs', false) on conflict do nothing;
create policy po_proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'po-proofs' and (select public.has_perm('page_finance')));
create policy po_proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'po-proofs' and (select public.has_perm('finance_manage')) and exists (select 1 from public.fin_pos p where p.id::text = (storage.foldername(name))[1]));
create policy po_proofs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'po-proofs' and (select public.has_perm('finance_manage')));
