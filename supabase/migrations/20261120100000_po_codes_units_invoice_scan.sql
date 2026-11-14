-- PO tracking, part 3: customer item codes with carton sizes and agreed prices, a delivery window,
-- invoices linked by their printed number (with a scan), instead of only Finance-module invoices.

-- ---------- customer item codes ----------
create table public.fin_item_codes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.fin_clients(id) on delete cascade,
  cust_code  text not null check (length(trim(cust_code)) > 0),
  barcode    text not null default '',
  our_code   text not null check (length(trim(our_code)) > 0),
  descr      text not null default '',
  pack       int  not null check (pack > 0),
  ctn_price  numeric(14,2) not null check (ctn_price >= 0),
  created_at timestamptz not null default now()
);
create unique index fin_item_codes_uq on public.fin_item_codes (client_id, lower(trim(cust_code)));
alter table public.fin_item_codes enable row level security;
create policy fin_item_codes_read   on public.fin_item_codes for select to authenticated using ((select public.has_perm('page_finance')));
create policy fin_item_codes_insert on public.fin_item_codes for insert to authenticated with check ((select public.has_perm('finance_manage')));
create policy fin_item_codes_update on public.fin_item_codes for update to authenticated using ((select public.has_perm('finance_manage'))) with check ((select public.has_perm('finance_manage')));
create policy fin_item_codes_delete on public.fin_item_codes for delete to authenticated using ((select public.has_perm('finance_manage')));

-- A code that saved POs use cannot be deleted.
create or replace function public.fin_item_code_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from fin_po_lines l join fin_pos p on p.id = l.po_id where p.client_id = old.client_id and lower(trim(l.cust_code)) = lower(trim(old.cust_code))) then
    raise exception '% is used by a saved PO, so it cannot be removed.', old.cust_code;
  end if;
  return old;
end $$;
create trigger fin_item_code_guard_t before delete on public.fin_item_codes for each row execute function public.fin_item_code_guard();

-- ---------- columns ----------
alter table public.fin_pos
  add column win_from            date,
  add column ext_invoice_no      text,
  add column ext_invoice_date    date,
  add column invoice_scan_path   text;
update public.fin_pos set win_from = po_date where win_from is null;
alter table public.fin_pos alter column win_from set not null;
alter table public.fin_pos add constraint fin_pos_window_ok check (win_from <= req_date);
alter table public.fin_pos add constraint fin_pos_one_invoice check (invoice_id is null or ext_invoice_no is null);
alter table public.fin_pos add constraint fin_pos_ext_date check (ext_invoice_no is null or ext_invoice_date is not null);
create unique index fin_pos_ext_invoice on public.fin_pos (lower(trim(ext_invoice_no))) where ext_invoice_no is not null;

-- The earlier rules said "invoice_id"; an invoice can now also be a printed number.
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.fin_pos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%invoice_id IS%' and conname not in ('fin_pos_one_invoice') loop
    execute format('alter table public.fin_pos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.fin_pos add constraint fin_pos_invoiced_needs_check check ((invoice_id is null and ext_invoice_no is null) or checked_by is not null);
alter table public.fin_pos add constraint fin_pos_delivery_needs_invoice check (delivered_date is null or invoice_id is not null or ext_invoice_no is not null);

alter table public.fin_po_lines
  add column cust_code   text,
  add column unit        text check (unit in ('units','cartons')),
  add column entered_qty numeric(12,2);

create or replace function public.fin_po_guard() returns trigger language plpgsql set search_path = public as $$
declare inv record; d date;
begin
  if new.invoice_id is not null then
    select client_id, issue_date into inv from public.fin_invoices where id = new.invoice_id;
    if inv.client_id is distinct from new.client_id then raise exception 'That invoice belongs to a different customer.'; end if;
    d := inv.issue_date;
  elsif new.ext_invoice_no is not null then
    d := new.ext_invoice_date;
  end if;
  if d is not null then
    if d < new.po_date then raise exception 'The invoice date cannot be before the PO date.'; end if;
    if new.delivered_date is not null and new.delivered_date < d then raise exception 'The delivery date cannot be before the invoice date.'; end if;
  end if;
  if new.delivered_date is not null and new.delivered_date > current_date then raise exception 'The delivery date cannot be in the future.'; end if;
  return new;
end $$;

-- ---------- functions ----------
drop function public.po_create(uuid, text, date, date, text, text, text, jsonb);
drop function public.po_link_invoice(uuid, uuid, jsonb);

-- p_lines = [{"code": "221001", "qty": 312, "unit": "units", "price": 20.93}, ...] using the customer's own codes.
-- The item list turns each line into our item, whole cartons and the agreed carton price.
create or replace function public.po_create(p_client uuid, p_po_no text, p_po_date date, p_win_from date, p_win_to date, p_so_no text, p_keyed_by text, p_salesman_code text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; l jsonb; n int := 0; m record; v_mgr boolean := has_perm('finance_manage'); v_mine boolean := has_perm('page_po_mine') and my_salesman() is not null;
  v_code text; v_name text; v_qty numeric; v_unit text; v_price numeric; v_ctns numeric;
begin
  if not (v_mgr or v_mine) then raise exception 'You do not have permission to key in POs.'; end if;
  if not exists (select 1 from fin_clients where id = p_client) then raise exception 'Choose the customer.'; end if;
  if v_mgr then v_code := coalesce(nullif(trim(coalesce(p_salesman_code, '')), ''), my_salesman()); else v_code := my_salesman(); end if;
  if (v_mgr and v_code is not null and v_code = my_salesman()) or not v_mgr then
    select coalesce(nullif(trim(full_name), ''), p_keyed_by) into v_name from profiles where id = auth.uid();
  else v_name := p_keyed_by; end if;
  if length(trim(coalesce(v_name, ''))) = 0 then raise exception 'Enter who is keying the order.'; end if;
  if length(trim(coalesce(p_po_no, ''))) = 0 then raise exception 'Enter the customer''s PO number.'; end if;
  if p_win_to < p_win_from then raise exception 'The delivery window cannot end before it starts.'; end if;
  if p_win_to < p_po_date then raise exception 'The delivery window cannot end before the PO date.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one PO line.'; end if;
  if exists (select 1 from fin_pos where client_id = p_client and lower(trim(po_no)) = lower(trim(p_po_no))) then
    raise exception 'This customer already has a PO numbered %. Open it instead of keying it twice.', trim(p_po_no);
  end if;
  insert into fin_pos (client_id, po_no, po_date, win_from, req_date, so_no, keyed_by, salesman_code, note)
    values (p_client, trim(p_po_no), p_po_date, p_win_from, p_win_to, nullif(trim(coalesce(p_so_no, '')), ''), trim(v_name), v_code, 'Order keyed. Attach the PO copy, then it needs a second check.') returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    select * into m from fin_item_codes where client_id = p_client and lower(trim(cust_code)) = lower(trim(coalesce(l->>'code', '')));
    if not found then raise exception 'Line %: code % is not in the customer''s item list. Add it first.', n, coalesce(l->>'code', '(blank)'); end if;
    v_qty := (l->>'qty')::numeric; v_unit := coalesce(l->>'unit', 'units'); v_price := (l->>'price')::numeric;
    if not (v_qty > 0) then raise exception 'Line %: enter a quantity above 0.', n; end if;
    if v_unit not in ('units', 'cartons') then raise exception 'Line %: unit must be units or cartons.', n; end if;
    v_ctns := case when v_unit = 'cartons' then v_qty else v_qty / m.pack end;
    if v_ctns <> trunc(v_ctns) then raise exception 'Line %: % units is not a whole number of cartons (% per carton).', n, v_qty, m.pack; end if;
    if abs((case when v_unit = 'cartons' then v_price / m.pack else v_price end) - m.ctn_price / m.pack) >= 0.005 then
      raise exception 'Line %: the price differs from the agreed price. Confirm it with the customer, or update the item list.', n;
    end if;
    insert into fin_po_lines (po_id, sort, sku, descr, po_qty, po_price, cust_code, unit, entered_qty)
      values (v_id, n - 1, m.our_code, coalesce(nullif(trim(m.descr), ''), m.our_code), v_ctns, m.ctn_price, m.cust_code, v_unit, v_qty);
  end loop;
  return v_id;
end $$;

-- Link either a Finance-module invoice (p_invoice) or an invoice by its printed number (p_ext_no + p_ext_date).
-- p_lines = [{"qty": cartons, "price": price per carton}, ...] as printed on the invoice.
create or replace function public.po_link_invoice(p_id uuid, p_invoice uuid, p_ext_no text, p_ext_date date, p_lines jsonb) returns void language plpgsql set search_path = public as $$
declare p record; i int := 0; l jsonb; v_ext text := nullif(trim(coalesce(p_ext_no, '')), '');
begin
  select * into p from fin_pos where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
  if p.checked_by is null then raise exception 'The order must be checked against the PO before it is invoiced.'; end if;
  if (p_invoice is null) = (v_ext is null) then raise exception 'Choose a Finance invoice or type the printed invoice number, not both.'; end if;
  if v_ext is not null and p_ext_date is null then raise exception 'Enter the invoice date.'; end if;
  if p_invoice is not null and exists (select 1 from fin_pos where invoice_id = p_invoice and id <> p_id) then raise exception 'That invoice is already linked to another PO.'; end if;
  if v_ext is not null and exists (select 1 from fin_pos where lower(trim(ext_invoice_no)) = lower(v_ext) and id <> p_id) then raise exception 'That invoice number is already linked to another PO.'; end if;
  if jsonb_array_length(p_lines) <> (select count(*) from fin_po_lines where po_id = p_id) then raise exception 'Enter the cartons and price for every line.'; end if;
  update fin_pos set invoice_id = p_invoice, ext_invoice_no = v_ext, ext_invoice_date = case when v_ext is null then null else p_ext_date end, note = '' where id = p_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    update fin_po_lines set inv_qty = (l->>'qty')::numeric, inv_price = (l->>'price')::numeric
      where id = (select id from fin_po_lines where po_id = p_id order by sort, id offset i limit 1);
    i := i + 1;
  end loop;
end $$;

create or replace function public.po_set_invoice_scan(p_id uuid, p_path text) returns void language plpgsql set search_path = public as $$
begin
  update fin_pos set invoice_scan_path = p_path where id = p_id and (invoice_id is not null or ext_invoice_no is not null);
  if not found then raise exception 'Link the invoice before attaching its scan.'; end if;
end $$;

-- Everything the screens need to read, scoped like po_list().
create or replace function public.po_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.req_date desc, x.po_no), '[]'::jsonb) from (
    select p.id, p.client_id, c.company_name as customer, p.po_no, p.po_date, p.win_from, p.req_date, p.so_no, p.keyed_by, p.checked_by, p.salesman_code,
           p.invoice_id, coalesce(i.invoice_no, p.ext_invoice_no) as invoice_no, coalesce(i.issue_date, p.ext_invoice_date) as invoice_date, p.invoice_scan_path,
           p.delivered_date, p.driver, p.route, p.proof_path, p.po_copy_path, p.note, p.credit_raised_at,
           (select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'descr', l.descr, 'po_qty', l.po_qty, 'po_price', l.po_price, 'inv_qty', l.inv_qty, 'inv_price', l.inv_price,
                     'del_qty', l.del_qty, 'outcome', l.outcome, 'reason', l.reason, 'cust_code', l.cust_code) order by l.sort, l.id), '[]'::jsonb) from fin_po_lines l where l.po_id = p.id) as lines,
           (select coalesce(jsonb_object_agg(r.issue_key, r.reason), '{}'::jsonb) from fin_po_reasons r where r.po_id = p.id) as reasons
    from fin_pos p join fin_clients c on c.id = p.client_id left join fin_invoices i on i.id = p.invoice_id
    where has_perm('page_finance') or (has_perm('page_po_mine') and p.salesman_code is not null and p.salesman_code = my_salesman())
  ) x
$$;

create or replace function public.po_item_codes() returns table (id uuid, client_id uuid, cust_code text, barcode text, our_code text, descr text, pack int, ctn_price numeric)
language sql stable security definer set search_path = public as $$
  select k.id, k.client_id, k.cust_code, k.barcode, k.our_code, k.descr, k.pack, k.ctn_price from fin_item_codes k
  where has_perm('page_finance') or has_perm('page_po_mine') order by k.client_id, k.cust_code
$$;

revoke all on function public.po_create(uuid, text, date, date, date, text, text, text, jsonb) from public, anon;
revoke all on function public.po_link_invoice(uuid, uuid, text, date, jsonb) from public, anon;
revoke all on function public.po_set_invoice_scan(uuid, text) from public, anon;
revoke all on function public.po_item_codes() from public, anon;
grant execute on function public.po_create(uuid, text, date, date, date, text, text, text, jsonb) to authenticated;
grant execute on function public.po_link_invoice(uuid, uuid, text, date, jsonb) to authenticated;
grant execute on function public.po_set_invoice_scan(uuid, text) to authenticated;
grant execute on function public.po_item_codes() to authenticated;
