-- SAP import history: keep every column of the import file, so a file made earlier can be
-- viewed, corrected line by line and downloaded again.

alter table public.sap_import_lines
  add column customer_name  text,
  add column agent          text,
  add column doc_ref        text,
  add column description    text,
  add column suom_qty       numeric(14,3),     -- pieces per carton (SUOMQTY)
  add column split          boolean not null default false,
  add column sort           int,               -- order of the line in the file
  add column edited_at      timestamptz,
  add column edited_by_name text;

-- Finance can correct or remove single lines. Adding lines still goes only through sap_import_record().
create policy sap_import_lines_update on public.sap_import_lines for update to authenticated
  using ((select public.has_perm('sap_import'))) with check ((select public.has_perm('sap_import')));
create policy sap_import_lines_delete on public.sap_import_lines for delete to authenticated
  using ((select public.has_perm('sap_import')));

-- Only the figures of a line can be changed, never which file or invoice it belongs to.
create or replace function public.sap_line_edit() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.batch_id <> old.batch_id or new.doc_no <> old.doc_no or new.item_code <> old.item_code then
    raise exception 'Only quantity, unit, price, discount and amount can be changed';
  end if;
  new.edited_at := now();
  new.edited_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  return new;
end $$;
create trigger sap_import_lines_edit before update on public.sap_import_lines for each row execute function public.sap_line_edit();

-- Keep each file's totals right after any change to its lines.
create or replace function public.sap_batch_totals() returns trigger language plpgsql security definer set search_path = '' as $$
declare b bigint := coalesce(new.batch_id, old.batch_id);
begin
  update public.sap_import_batches t set
    invoices  = s.invoices, lines = s.lines, net_total = s.net_total, doc_from = s.doc_from, doc_to = s.doc_to
  from (select count(distinct doc_no)::int invoices, count(*)::int lines, coalesce(sum(amount), 0) net_total, min(doc_date) doc_from, max(doc_date) doc_to
        from public.sap_import_lines where batch_id = b) s
  where t.id = b;
  return null;
end $$;
create trigger sap_import_lines_totals after update or delete on public.sap_import_lines for each row execute function public.sap_batch_totals();

-- Record an import file with every column it holds.
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
  return b;
end $$;
