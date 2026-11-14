-- Fix: recording a delivery must also accept an invoice linked by its printed number (not only a Finance-module invoice).
create or replace function public.po_record_delivery(p_id uuid, p_date date, p_driver text, p_route text, p_lines jsonb, p_proof_path text) returns void language plpgsql set search_path = public as $$
declare p record; i int := 0; q jsonb; r record; v_out text; v_qty numeric; v_reason text;
begin
  select * into p from fin_pos where id = p_id;
  if not found then raise exception 'PO not found.'; end if;
  if p.invoice_id is null and p.ext_invoice_no is null then raise exception 'Link the invoice before recording the delivery.'; end if;
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
