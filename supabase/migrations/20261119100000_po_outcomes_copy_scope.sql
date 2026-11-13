-- PO tracking, part 2: PO hard copy, what happened to each item (dropped / cancelled / short), credit note step,
-- and a salesman view limited to their own orders.

-- ---------- permission for salesmen ----------
insert into public.permissions (key, label, grp, sort) values
  ('page_po_mine', 'My PO orders: key in and check own orders', 'Pages', 9)
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('salesperson', 'page_po_mine'), ('supervisor', 'page_po_mine'), ('management', 'page_po_mine')
on conflict do nothing;

-- ---------- columns ----------
alter table public.fin_pos
  add column salesman_code      text,
  add column po_copy_path       text,
  add column credit_raised_at   timestamptz;
create index fin_pos_salesman_idx on public.fin_pos (salesman_code);

alter table public.fin_po_lines
  add column outcome text not null default 'delivered' check (outcome in ('delivered','short','dropped','cancelled','substituted')),
  add column reason  text;

-- ---------- storage: salesmen may add and read files for their own POs ----------
drop policy po_proofs_read on storage.objects;
drop policy po_proofs_insert on storage.objects;
create policy po_proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'po-proofs' and (
    (select public.has_perm('page_finance'))
    or ((select public.has_perm('page_po_mine')) and exists (select 1 from public.fin_pos p where p.id::text = (storage.foldername(name))[1] and p.salesman_code is not null and p.salesman_code = (select public.my_salesman())))));
create policy po_proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'po-proofs' and exists (select 1 from public.fin_pos p where p.id::text = (storage.foldername(name))[1])
    and ((select public.has_perm('finance_manage'))
      or ((select public.has_perm('page_po_mine')) and exists (select 1 from public.fin_pos p where p.id::text = (storage.foldername(name))[1] and p.salesman_code is not null and p.salesman_code = (select public.my_salesman())))));

-- ---------- functions ----------
drop function public.po_create(uuid, text, date, date, text, text, jsonb);
drop function public.po_record_delivery(uuid, date, text, text, jsonb, text);

-- Keyed by the signed-in salesman (or by finance on a salesman's behalf). Runs with its own checks because salesmen have no Finance access.
create or replace function public.po_create(p_client uuid, p_po_no text, p_po_date date, p_req_date date, p_so_no text, p_keyed_by text, p_salesman_code text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; l jsonb; n int := 0; v_mgr boolean := has_perm('finance_manage'); v_mine boolean := has_perm('page_po_mine') and my_salesman() is not null;
  v_code text; v_name text;
begin
  if not (v_mgr or v_mine) then raise exception 'You do not have permission to key in POs.'; end if;
  if not exists (select 1 from fin_clients where id = p_client) then raise exception 'Choose the customer.'; end if;
  if v_mgr then v_code := coalesce(nullif(trim(coalesce(p_salesman_code, '')), ''), my_salesman()); else v_code := my_salesman(); end if;
  if v_mgr and v_code is not null and v_code = my_salesman() or not v_mgr then
    select coalesce(nullif(trim(full_name), ''), p_keyed_by) into v_name from profiles where id = auth.uid();
  else v_name := p_keyed_by; end if;
  if length(trim(coalesce(v_name, ''))) = 0 then raise exception 'Enter who is keying the order.'; end if;
  if p_req_date < p_po_date then raise exception 'The requested delivery date cannot be before the PO date.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one PO line.'; end if;
  if exists (select 1 from fin_pos where client_id = p_client and lower(trim(po_no)) = lower(trim(p_po_no))) then
    raise exception 'This customer already has a PO numbered %. Open it instead of keying it twice.', trim(p_po_no);
  end if;
  insert into fin_pos (client_id, po_no, po_date, req_date, so_no, keyed_by, salesman_code, note)
    values (p_client, trim(p_po_no), p_po_date, p_req_date, nullif(trim(coalesce(p_so_no, '')), ''), trim(v_name), v_code, 'Order keyed. Attach the PO copy, then it needs a second check.') returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into fin_po_lines (po_id, sort, sku, descr, po_qty, po_price)
      values (v_id, n, trim(l->>'sku'), coalesce(nullif(trim(l->>'descr'), ''), trim(l->>'sku')), (l->>'qty')::numeric, (l->>'price')::numeric);
    n := n + 1;
  end loop;
  return v_id;
end $$;

create or replace function public.po_set_copy(p_id uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (has_perm('finance_manage') or (has_perm('page_po_mine') and exists (select 1 from fin_pos where id = p_id and salesman_code is not null and salesman_code = my_salesman()))) then
    raise exception 'You can only attach a PO copy to your own orders.';
  end if;
  update fin_pos set po_copy_path = p_path where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
end $$;

create or replace function public.po_mark_checked(p_id uuid, p_checker text) returns void language plpgsql set search_path = public as $$
declare k text; c text;
begin
  select keyed_by, po_copy_path into k, c from fin_pos where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
  if c is null then raise exception 'Attach the customer''s PO copy before the second check.'; end if;
  if length(trim(coalesce(p_checker, ''))) = 0 then raise exception 'Enter the name of the person who checked.'; end if;
  if lower(trim(p_checker)) = lower(trim(k)) then raise exception 'The checker must be a different person from the one who keyed the order.'; end if;
  update fin_pos set checked_by = trim(p_checker), note = '' where id = p_id;
end $$;

-- p_lines = [{"qty": 98, "outcome": "short", "reason": "2 cartons damaged"}, ...] in line order.
create or replace function public.po_record_delivery(p_id uuid, p_date date, p_driver text, p_route text, p_lines jsonb, p_proof_path text) returns void language plpgsql set search_path = public as $$
declare p record; i int := 0; q jsonb; r record; v_out text; v_qty numeric; v_reason text;
begin
  select * into p from fin_pos where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
  if p.invoice_id is null then raise exception 'Link the invoice before recording the delivery.'; end if;
  if length(trim(coalesce(p_driver, ''))) = 0 then raise exception 'Enter the driver.'; end if;
  if jsonb_array_length(p_lines) <> (select count(*) from fin_po_lines where po_id = p_id) then raise exception 'Record what happened to every line.'; end if;
  update fin_pos set delivered_date = p_date, driver = trim(p_driver), route = coalesce(nullif(trim(coalesce(p_route, '')), ''), '–'), proof_path = p_proof_path, note = '' where id = p_id;
  for q in select * from jsonb_array_elements(p_lines) loop
    select id, sku, po_qty into r from fin_po_lines where po_id = p_id order by sort, id offset i limit 1;
    v_out := coalesce(q->>'outcome', 'delivered'); v_qty := coalesce((q->>'qty')::numeric, 0); v_reason := nullif(trim(coalesce(q->>'reason', '')), '');
    if v_out not in ('delivered','short','dropped','cancelled','substituted') then raise exception '%: unknown outcome.', r.sku; end if;
    if v_out <> 'delivered' and (v_reason is null or length(v_reason) < 3) then raise exception '%: write a reason for this outcome.', r.sku; end if;
    if v_out = 'delivered' then v_qty := r.po_qty; end if;
    if v_out in ('dropped','cancelled') then v_qty := 0; end if;
    if v_out = 'short' and not (v_qty > 0 and v_qty < r.po_qty) then raise exception '%: short delivered needs a quantity above 0 and below %.', r.sku, r.po_qty; end if;
    if v_qty < 0 or v_qty > r.po_qty then raise exception '%: the quantity received cannot be below 0 or above %.', r.sku, r.po_qty; end if;
    update fin_po_lines set del_qty = v_qty, outcome = v_out, reason = case when v_out = 'delivered' then null else v_reason end where id = r.id;
    i := i + 1;
  end loop;
end $$;

-- Finance has raised the credit note: the invoiced quantity now matches what was delivered (nothing for cancelled items).
create or replace function public.po_raise_credit(p_id uuid) returns void language plpgsql set search_path = public as $$
declare n int;
begin
  perform 1 from fin_pos where id = p_id and delivered_date is not null;
  if not found then raise exception 'The order has not been delivered yet.'; end if;
  update fin_po_lines set inv_qty = case when outcome = 'cancelled' then 0 else least(inv_qty, coalesce(del_qty, 0)) end
    where po_id = p_id and inv_qty is not null and inv_qty > case when outcome = 'cancelled' then 0 else coalesce(del_qty, 0) end;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'There is nothing to credit on this order.'; end if;
  update fin_pos set credit_raised_at = now() where id = p_id;
end $$;

-- One read path for everybody: Finance sees every PO, a salesman sees only their own.
create or replace function public.po_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.req_date desc, x.po_no), '[]'::jsonb) from (
    select p.id, p.client_id, c.company_name as customer, p.po_no, p.po_date, p.req_date, p.so_no, p.keyed_by, p.checked_by, p.salesman_code,
           p.invoice_id, i.invoice_no, i.issue_date as invoice_date, p.delivered_date, p.driver, p.route, p.proof_path, p.po_copy_path, p.note, p.credit_raised_at,
           (select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'descr', l.descr, 'po_qty', l.po_qty, 'po_price', l.po_price, 'inv_qty', l.inv_qty, 'inv_price', l.inv_price,
                     'del_qty', l.del_qty, 'outcome', l.outcome, 'reason', l.reason) order by l.sort, l.id), '[]'::jsonb) from fin_po_lines l where l.po_id = p.id) as lines,
           (select coalesce(jsonb_object_agg(r.issue_key, r.reason), '{}'::jsonb) from fin_po_reasons r where r.po_id = p.id) as reasons
    from fin_pos p join fin_clients c on c.id = p.client_id left join fin_invoices i on i.id = p.invoice_id
    where has_perm('page_finance') or (has_perm('page_po_mine') and p.salesman_code is not null and p.salesman_code = my_salesman())
  ) x
$$;

create or replace function public.po_clients() returns table (id uuid, company_name text) language sql stable security definer set search_path = public as $$
  select c.id, c.company_name from fin_clients c where has_perm('page_finance') or has_perm('page_po_mine') order by c.company_name
$$;

revoke all on function public.po_create(uuid, text, date, date, text, text, text, jsonb) from public, anon;
revoke all on function public.po_set_copy(uuid, text) from public, anon;
revoke all on function public.po_record_delivery(uuid, date, text, text, jsonb, text) from public, anon;
revoke all on function public.po_raise_credit(uuid) from public, anon;
revoke all on function public.po_list() from public, anon;
revoke all on function public.po_clients() from public, anon;
grant execute on function public.po_create(uuid, text, date, date, text, text, text, jsonb) to authenticated;
grant execute on function public.po_set_copy(uuid, text) to authenticated;
grant execute on function public.po_record_delivery(uuid, date, text, text, jsonb, text) to authenticated;
grant execute on function public.po_raise_credit(uuid) to authenticated;
grant execute on function public.po_list() to authenticated;
grant execute on function public.po_clients() to authenticated;
