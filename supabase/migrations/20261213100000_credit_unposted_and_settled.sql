-- Credit check: receipts that are in the daily payment file but not yet posted in the aging, and supermarket invoices
-- Finance has settled by hand from a collection summary. Neither changes the aging (ar_invoices); they sit beside it.

-- ---------- receipts from the daily payment file ----------
-- One row per receipt line. Loaded by the daily job with payments_load; nobody writes to it from the app.
create table public.payment_receipts (
  id          uuid primary key default gen_random_uuid(),
  receipt_no  text not null,                 -- for example TOR04-02559
  paid_on     date not null,
  customer    text not null,                 -- full code, MY01C + 5 digits
  doc_no      text not null,                 -- invoice number as in the aging (101 prefix removed)
  amount      numeric(14,2) not null check (amount > 0),
  file_name   text,
  loaded_at   timestamptz not null default now(),
  unique (receipt_no, doc_no)
);
create index payment_receipts_doc_idx on public.payment_receipts (doc_no);
create index payment_receipts_cust_idx on public.payment_receipts (customer);

-- ---------- supermarket invoices settled by hand ----------
create table public.credit_settled (
  id            uuid primary key default gen_random_uuid(),
  doc_no        text not null unique,        -- one settlement per invoice; "open again" deletes the row
  customer      text not null,
  customer_name text,
  sales_rep     text not null,
  amount        numeric(14,2) not null,
  settled_on    date not null,
  summary_ref   text,                        -- which collection summary
  note          text,
  by_id         uuid,
  by_name       text,
  created_at    timestamptz not null default now()
);

alter table public.payment_receipts enable row level security;
alter table public.credit_settled enable row level security;
create policy payment_receipts_read on public.payment_receipts for select to authenticated
  using ((select public.has_perm('sap_import')) or (select public.has_perm('credit_approve')));
create policy credit_settled_read on public.credit_settled for select to authenticated
  using ((select public.has_perm('sap_import')) or (select public.has_perm('credit_approve')));
-- no write policies: changes only through the functions below

-- ---------- load receipt lines (run by the daily job, not by people) ----------
-- p_rows: [{receipt_no, paid_on, customer, doc_no, amount}]. Safe to run twice for the same file.
create or replace function public.payments_load(p_rows jsonb, p_file text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare n int; total int := jsonb_array_length(p_rows);
begin
  -- a receipt that lists the same invoice twice adds up; running the same file again replaces, it does not double
  insert into public.payment_receipts (receipt_no, paid_on, customer, doc_no, amount, file_name)
    select x->>'receipt_no', min((x->>'paid_on')::date), min(x->>'customer'), x->>'doc_no', sum((x->>'amount')::numeric), nullif(trim(p_file), '')
    from jsonb_array_elements(p_rows) x
    where (x->>'amount')::numeric > 0
    group by x->>'receipt_no', x->>'doc_no'
    on conflict (receipt_no, doc_no) do update set amount = excluded.amount, paid_on = excluded.paid_on, file_name = excluded.file_name;
  get diagnostics n = row_count;
  return jsonb_build_object('lines', total, 'saved', n);
end $$;

-- ---------- receipts for invoices still open in the aging ----------
-- The aging only drops an invoice (or part of it) when Finance posts the receipt in SQL. So for an invoice still open,
-- what the receipts add up to, minus what the aging has already taken off (amount - outstanding), has not been posted yet.
-- Never more than the invoice still owes.
create or replace function public.credit_unposted(p_customers text[])
  returns table (customer text, doc_no text, paid numeric, paid_on date, receipt text)
  language sql stable security definer set search_path = '' as $$
  with i as (select a.doc_no, a.amount, a.outstanding,
                    case when a.cust_code ~ '^[0-9]+$' then 'MY01C' || lpad(a.cust_code, 5, '0') else a.cust_code end as code
             from public.ar_invoices a where a.outstanding > 0),
       s as (select r.customer, r.doc_no, sum(r.amount) as got, max(r.paid_on) as last_on, string_agg(distinct r.receipt_no, ', ') as receipts
             from public.payment_receipts r where r.customer = any (p_customers) group by r.customer, r.doc_no)
  select s.customer, s.doc_no,
         least(greatest(s.got - greatest(i.amount - i.outstanding, 0), 0), i.outstanding)::numeric(14,2),
         s.last_on, s.receipts
  from s join i on i.doc_no = s.doc_no and i.code = s.customer
  where (public.has_perm('sap_import') or public.has_perm('credit_approve'))
    and s.got - greatest(i.amount - i.outstanding, 0) > 0
$$;

-- ---------- supermarket invoices ----------
-- Open supermarket invoices in the aging that Finance has not marked settled.
create or replace function public.supermarket_open()
  returns table (doc_no text, customer text, customer_name text, sales_rep text, amount numeric, due_date date)
  language sql stable security definer set search_path = '' as $$
  with i as (select a.*, case when a.cust_code ~ '^[0-9]+$' then 'MY01C' || lpad(a.cust_code, 5, '0') else a.cust_code end as code
             from public.ar_invoices a where a.outstanding > 0)
  select i.doc_no, i.code, coalesce(c.name, i.customer), 'MY01S' || lpad(coalesce(nullif(i.agent, ''), '0'), 5, '0'), i.outstanding, i.due_date
  from i join public.customers c on c.code = i.code
  where (public.has_perm('sap_import') or public.has_perm('credit_approve'))
    and lower(trim(coalesce(c.channel, ''))) = 'supermarket'
    and not exists (select 1 from public.credit_settled s where s.doc_no = i.doc_no)
  order by c.name, i.due_date, i.doc_no
$$;

create or replace function public.supermarket_settle(p_docs text[], p_date date, p_ref text, p_note text) returns int
  language plpgsql security definer set search_path = '' as $$
declare n int; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if not public.has_perm('credit_approve') then raise exception 'Only Finance or Management can mark supermarket invoices settled.' using errcode = '42501'; end if;
  if coalesce(array_length(p_docs, 1), 0) = 0 then raise exception 'Tick at least one invoice.'; end if;
  if p_date is null then raise exception 'Pick the date it was settled.'; end if;
  if p_date > today then raise exception 'The settled date cannot be in the future.'; end if;
  insert into public.credit_settled (doc_no, customer, customer_name, sales_rep, amount, settled_on, summary_ref, note, by_id, by_name)
    select o.doc_no, o.customer, o.customer_name, o.sales_rep, o.amount, p_date, nullif(trim(p_ref), ''), nullif(trim(p_note), ''),
           (select auth.uid()), coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Finance')
    from public.supermarket_open() o where o.doc_no = any (p_docs)
    on conflict (doc_no) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'These invoices are already settled or are not open supermarket invoices.'; end if;
  return n;
end $$;

create or replace function public.supermarket_unsettle(p_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('credit_approve') then raise exception 'Only Finance or Management can open a settled invoice again.' using errcode = '42501'; end if;
  delete from public.credit_settled where id = p_id;
  if not found then raise exception 'Not found.'; end if;
end $$;

revoke execute on function public.payments_load(jsonb, text), public.credit_unposted(text[]), public.supermarket_open(),
  public.supermarket_settle(text[], date, text, text), public.supermarket_unsettle(uuid) from public, anon, authenticated;
-- the daily job runs as the database owner; people only use the read and settle functions
grant execute on function public.credit_unposted(text[]), public.supermarket_open(),
  public.supermarket_settle(text[], date, text, text), public.supermarket_unsettle(uuid) to authenticated;

alter publication supabase_realtime add table public.credit_settled;
