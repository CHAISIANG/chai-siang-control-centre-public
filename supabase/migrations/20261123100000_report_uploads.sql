-- Daily report uploads from the Data Upload page. The browser can never write to the report tables;
-- it calls these functions, which check the person may upload and replace each report in one step (all or nothing).

alter table public.upload_log add column uploaded_by uuid default auth.uid(), add column detail text;

-- Salesmen who are never loaded (their rows are skipped and any that exist are removed). Read only by the functions below.
create table public.report_exclusions (code text primary key, note text);
insert into public.report_exclusions (code, note) values
  ('MY01S00006', 'never load'), ('MY01S00013', 'never load'), ('MY01S00015', 'never load'), ('MY01S00018', 'never load');
alter table public.report_exclusions enable row level security;

create or replace function public.report_guard() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('page_upload') then raise exception 'Your role cannot upload reports.'; end if;
end $$;

-- ---------- aging: open invoices, replaced in full ----------
create or replace function public.load_aging(p_rows jsonb, p_file text, p_as_at date) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; tot numeric;
begin
  perform public.report_guard();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The aging file has no invoices, so nothing was changed.'; end if;
  if jsonb_array_length(p_rows) > 20000 then raise exception 'The aging file is too large.'; end if;
  if p_as_at is null then raise exception 'The aging report date could not be worked out.'; end if;
  delete from public.ar_invoices where true;
  insert into public.ar_invoices (doc_no, doc_date, cust_code, customer, terms, due_date, agent, amount, outstanding, note, as_at)
    select x.doc, x.doc_date, x.cust_code, x.customer, x.terms, x.due_date, x.agent, coalesce(x.amount, 0), x.outstanding, nullif(x.note, ''), p_as_at
    from jsonb_to_recordset(p_rows) as x(doc text, doc_date date, cust_code text, customer text, terms int, due_date date, agent text, amount numeric, outstanding numeric, note text)
    where coalesce(x.doc, '') <> '' and coalesce(x.cust_code, '') <> '' and x.outstanding is not null
    on conflict (doc_no) do update set outstanding = excluded.outstanding, as_at = excluded.as_at;
  get diagnostics n = row_count;
  select coalesce(sum(outstanding), 0) into tot from public.ar_invoices;
  insert into public.upload_log (report, file_name, row_count, status, detail) values ('Aging', left(p_file, 200), n, 'OK', 'as at ' || p_as_at || ', total ' || tot);
  return jsonb_build_object('rows', n, 'total', tot);
end $$;

-- ---------- net sales by customer, replaced in full ----------
create or replace function public.load_customers(p_rows jsonb, p_file text, p_as_at date) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; tot numeric;
begin
  perform public.report_guard();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The customer file has no rows, so nothing was changed.'; end if;
  if jsonb_array_length(p_rows) > 20000 then raise exception 'The customer file is too large.'; end if;
  delete from public.customer_sales where true;
  insert into public.customer_sales (code, name, year, months, ytd, ytd_ams, py_ams, as_at)
    select x.code, x.name, 2026, array(select jsonb_array_elements_text(x.months)::numeric), coalesce(x.ytd, 0), coalesce(x.ytd_ams, 0), coalesce(x.py_ams, 0), p_as_at
    from jsonb_to_recordset(p_rows) as x(code text, name text, months jsonb, ytd numeric, ytd_ams numeric, py_ams numeric)
    where x.code ~ '^MY[0-9A-Z]+$' and coalesce(x.name, '') <> ''
    on conflict (code) do update set ytd = excluded.ytd;
  get diagnostics n = row_count;
  select coalesce(sum(ytd), 0) into tot from public.customer_sales;
  insert into public.upload_log (report, file_name, row_count, status, detail) values ('Net Sales by Customer', left(p_file, 200), n, 'OK', 'year to date ' || tot);
  return jsonb_build_object('rows', n, 'total', tot);
end $$;

-- ---------- sales lines: replaced for the dates the file covers ----------
create or replace function public.load_products(p_rows jsonb, p_file text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; d1 date; d2 date; tot numeric;
begin
  perform public.report_guard();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The sales file has no invoice lines, so nothing was changed.'; end if;
  if jsonb_array_length(p_rows) > 60000 then raise exception 'The sales file is too large.'; end if;
  select min(x.sale_date), max(x.sale_date) into d1, d2 from jsonb_to_recordset(p_rows) as x(sale_date date);
  if d1 is null then raise exception 'The sales file has no dates.'; end if;
  delete from public.sales_lines where sale_date between d1 and d2;
  insert into public.sales_lines (sale_date, invoice_no, product_code, product_desc, rep_code, rep_name, cust_code, cust_name, qty_cs, qty_ea, gross, promo_disc, qty_disc, inv_disc, net)
    select x.sale_date, x.invoice_no, x.product_code, x.product_desc, x.rep_code, x.rep_name, x.cust_code, x.cust_name, coalesce(x.qty_cs, 0), coalesce(x.qty_ea, 0), coalesce(x.gross, 0), coalesce(x.promo_disc, 0), coalesce(x.qty_disc, 0), coalesce(x.inv_disc, 0), coalesce(x.net, 0)
    from jsonb_to_recordset(p_rows) as x(sale_date date, invoice_no text, product_code text, product_desc text, rep_code text, rep_name text, cust_code text, cust_name text, qty_cs numeric, qty_ea numeric, gross numeric, promo_disc numeric, qty_disc numeric, inv_disc numeric, net numeric)
    where x.sale_date is not null and coalesce(x.invoice_no, '') <> '' and not exists (select 1 from public.report_exclusions e where e.code = x.rep_code);
  get diagnostics n = row_count;
  select coalesce(sum(net), 0) into tot from public.sales_lines where sale_date between d1 and d2;
  insert into public.upload_log (report, file_name, row_count, status, detail) values ('Sales by Products and Sales Rep', left(p_file, 200), n, 'OK', d1 || ' to ' || d2 || ', net ' || tot);
  return jsonb_build_object('rows', n, 'net', tot, 'from', d1, 'to', d2);
end $$;

-- ---------- coverage and net sales: each month in the file is updated ----------
-- p_reps = [{"code": "MY01S00002", "name": "...", "months": [{"m": 1, "rl": 16, "active": 15, "erc": 93.75, "target": 1059125, "sales": 1059125.5}, ...]}, ...]
create or replace function public.load_coverage(p_reps jsonb, p_file text, p_year int) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  perform public.report_guard();
  if jsonb_typeof(p_reps) <> 'array' or jsonb_array_length(p_reps) = 0 then raise exception 'The coverage file has no salesmen, so nothing was changed.'; end if;
  if jsonb_array_length(p_reps) > 200 then raise exception 'The coverage file is too large.'; end if;
  if p_year is null or p_year < 2020 or p_year > 2100 then raise exception 'The year is not valid.'; end if;
  delete from public.salesmen where code in (select code from public.report_exclusions);
  insert into public.salesmen (code, name)
    select r.code, initcap(lower(trim(r.name))) from jsonb_to_recordset(p_reps) as r(code text, name text)
    where r.code ~ '^MY[0-9A-Z]+S[0-9]+$' and coalesce(trim(r.name), '') <> '' and not exists (select 1 from public.report_exclusions e where e.code = r.code)
    on conflict (code) do nothing;
  get diagnostics n = row_count;
  insert into public.salesman_monthly (salesman_code, year, month, rl_acct, active_acct, erc, sales_target, net_sales)
    select r.code, p_year, mo.m, mo.rl, mo.active, mo.erc, mo.target, mo.sales
    from jsonb_to_recordset(p_reps) as r(code text, months jsonb)
    cross join lateral jsonb_to_recordset(r.months) as mo(m int, rl int, active int, erc numeric, target numeric, sales numeric)
    where r.code ~ '^MY[0-9A-Z]+S[0-9]+$' and mo.m between 1 and 12 and exists (select 1 from public.salesmen s where s.code = r.code)
    on conflict (salesman_code, year, month) do update set rl_acct = excluded.rl_acct, active_acct = excluded.active_acct, erc = excluded.erc, sales_target = excluded.sales_target, net_sales = excluded.net_sales;
  get diagnostics m = row_count;
  insert into public.upload_log (report, file_name, row_count, status, detail) values ('Coverage and Net Sales', left(p_file, 200), m, 'OK', 'year ' || p_year);
  return jsonb_build_object('rows', m, 'new_salesmen', n);
end $$;

revoke all on function public.report_guard() from public, anon;
revoke all on function public.load_aging(jsonb, text, date) from public, anon;
revoke all on function public.load_customers(jsonb, text, date) from public, anon;
revoke all on function public.load_products(jsonb, text) from public, anon;
revoke all on function public.load_coverage(jsonb, text, int) from public, anon;
grant execute on function public.report_guard() to authenticated;
grant execute on function public.load_aging(jsonb, text, date) to authenticated;
grant execute on function public.load_customers(jsonb, text, date) to authenticated;
grant execute on function public.load_products(jsonb, text) to authenticated;
grant execute on function public.load_coverage(jsonb, text, int) to authenticated;
