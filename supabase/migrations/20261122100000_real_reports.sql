-- Tables for the weekly Excel reports: open invoices (aging), sales by product and rep, and net sales by customer.
-- Coverage and net sales go into the existing salesman_monthly table. The data itself is loaded outside the code (see scripts/load-reports.mts).

-- Open invoices from the aging report. Age is worked out from due_date and as_at, so it matches the report date.
create table public.ar_invoices (
  doc_no      text primary key,
  doc_date    date,
  cust_code   text not null,           -- as printed in the aging, for example 123
  customer    text not null,
  terms       int,
  due_date    date,
  agent       text,                    -- agent 7 = salesman MY01S00007
  amount      numeric(14,2) not null default 0,
  outstanding numeric(14,2) not null,
  note        text,
  as_at       date not null
);
create index ar_invoices_cust_idx on public.ar_invoices (cust_code);
create index ar_invoices_agent_idx on public.ar_invoices (agent);

-- One row per invoice line from the sales by product and sales rep report.
create table public.sales_lines (
  id           bigint generated always as identity primary key,
  sale_date    date not null,
  invoice_no   text not null,
  product_code text not null,
  product_desc text,
  rep_code     text,
  rep_name     text,
  cust_code    text,
  cust_name    text,
  qty_cs       numeric(12,2) not null default 0,
  qty_ea       numeric(12,2) not null default 0,
  gross        numeric(14,2) not null default 0,
  promo_disc   numeric(14,2) not null default 0,
  qty_disc     numeric(14,2) not null default 0,
  inv_disc     numeric(14,2) not null default 0,
  net          numeric(14,2) not null default 0
);
create index sales_lines_date_idx on public.sales_lines (sale_date);
create index sales_lines_rep_idx on public.sales_lines (rep_code);

-- Net sales by customer: Jan to Dec in months[1..12].
create table public.customer_sales (
  code     text primary key,           -- MY01C00123
  name     text not null,
  year     int not null default 2026,
  months   numeric(14,2)[] not null,
  ytd      numeric(14,2) not null default 0,
  ytd_ams  numeric(14,2) not null default 0,
  py_ams   numeric(14,2) not null default 0,
  as_at    date
);

alter table public.ar_invoices    enable row level security;
alter table public.sales_lines    enable row level security;
alter table public.customer_sales enable row level security;

-- Management sees everything. A salesperson sees their own invoices (by agent), their own sales lines (by rep) and their own customers.
create policy ar_invoices_read on public.ar_invoices for select to authenticated
  using ((select public.sees_data()) and public.in_scope('MY01S' || lpad(agent, 5, '0')));
create policy sales_lines_read on public.sales_lines for select to authenticated
  using ((select public.sees_data()) and public.in_scope(rep_code));
create policy customer_sales_read on public.customer_sales for select to authenticated
  using ((select public.sees_data()) and ((select public.has_perm('view_all_data')) or exists (select 1 from public.customers c where c.code = customer_sales.code)));

-- No insert, update or delete policies: the browser can never change these. The loader runs as the database owner.

-- Summaries the screens read. They run as the signed-in person, so the policies above decide which rows are counted.
create or replace function public.sales_daily(p_rep text default null) returns table (sale_date date, net numeric, invoices bigint)
language sql stable set search_path = public as $$
  select l.sale_date, sum(l.net), count(distinct l.invoice_no) from public.sales_lines l where p_rep is null or l.rep_code = p_rep group by l.sale_date order by l.sale_date
$$;

create or replace function public.ar_summary() returns table (cust_code text, customer text, agent text, total numeric, b_current numeric, b_30 numeric, b_60 numeric, b_90 numeric, b_over90 numeric, oldest int, as_at date)
language sql stable set search_path = public as $$
  select a.cust_code, max(a.customer), max(a.agent), sum(a.outstanding),
    coalesce(sum(a.outstanding) filter (where a.as_at - a.due_date <= 0), 0),
    coalesce(sum(a.outstanding) filter (where a.as_at - a.due_date between 1 and 30), 0),
    coalesce(sum(a.outstanding) filter (where a.as_at - a.due_date between 31 and 60), 0),
    coalesce(sum(a.outstanding) filter (where a.as_at - a.due_date between 61 and 90), 0),
    coalesce(sum(a.outstanding) filter (where a.as_at - a.due_date > 90), 0),
    max(a.as_at - a.due_date), max(a.as_at)
  from public.ar_invoices a group by a.cust_code
$$;

revoke all on function public.sales_daily(text) from public, anon;
revoke all on function public.ar_summary() from public, anon;
grant execute on function public.sales_daily(text) to authenticated;
grant execute on function public.ar_summary() to authenticated;
