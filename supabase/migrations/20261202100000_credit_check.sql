-- Credit check on SAP invoices. For salesmen 04, 11, 17, 21 and 22: a customer with anything past due in the latest
-- aging report needs Finance or Management approval before the invoice goes into the import file. Supermarkets are
-- not held; their sales rep is reminded to chase the payment. The server works out the aging itself.

insert into public.permissions (key, label, grp, sort) values
  ('credit_approve', 'Approve invoices of customers with overdue payments', 'Finance', 66)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('finance', 'credit_approve'), ('management', 'credit_approve'), ('director', 'credit_approve')
  on conflict do nothing;

create table public.credit_approvals (
  id              uuid primary key default gen_random_uuid(),
  doc_no          text not null,
  customer        text not null,
  customer_name   text,
  sales_rep       text not null,
  amount          numeric(14,2) not null,
  overdue         numeric(14,2) not null,
  oldest_days     int not null,
  buckets         numeric(14,2)[] not null,       -- not due, 1-30, 31-60, 61-90, over 90
  as_at           date,                           -- date of the aging report used
  file_name       text,
  status          text not null default 'Waiting' check (status in ('Waiting','Approved','Rejected')),
  asked_by        uuid,
  asked_by_name   text,
  asked_at        date not null,
  note            text,
  decided_by      uuid,
  decided_by_name text,
  decided_at      date,
  decision_note   text,
  created_at      timestamptz not null default now()
);
-- one open (or approved) request per invoice; a rejected invoice can be asked again
create unique index credit_approvals_open_idx on public.credit_approvals (doc_no) where status in ('Waiting','Approved');
create index credit_approvals_status_idx on public.credit_approvals (status, asked_at);

create table public.credit_reminders (
  id            uuid primary key default gen_random_uuid(),
  doc_no        text not null unique,
  customer      text not null,
  customer_name text,
  sales_rep     text not null,
  amount        numeric(14,2) not null,
  overdue       numeric(14,2) not null,
  oldest_days   int not null,
  sent_on       date not null,
  seen          boolean not null default false,
  seen_at       timestamptz
);
create index credit_reminders_rep_idx on public.credit_reminders (sales_rep, seen);

-- ---------- the aging of some customers, worked out from the latest aging report ----------
create or replace function public.credit_aging(p_customers text[])
  returns table (code text, name text, channel text, owed numeric, overdue numeric, oldest_days int, buckets numeric[], as_at date)
  language sql stable security definer set search_path = '' as $$
  -- the aging report keeps a short customer number; the customer list and SAP use the full code (MY01C + the number padded to 5 digits)
  with t as (select (now() at time zone 'Asia/Kuala_Lumpur')::date as d),
       i as (select a.*, case when a.cust_code ~ '^[0-9]+$' then 'MY01C' || lpad(a.cust_code, 5, '0') else a.cust_code end as code
             from public.ar_invoices a)
  select i.code,
         coalesce(max(c.name), max(i.customer)),
         max(c.channel),
         round(sum(i.outstanding), 2),
         round(coalesce(sum(i.outstanding) filter (where i.due_date < t.d), 0), 2),
         coalesce(max(t.d - i.due_date) filter (where i.due_date < t.d and i.outstanding > 0), 0)::int,
         array[
           round(coalesce(sum(i.outstanding) filter (where i.due_date >= t.d), 0), 2),
           round(coalesce(sum(i.outstanding) filter (where t.d - i.due_date between 1 and 30), 0), 2),
           round(coalesce(sum(i.outstanding) filter (where t.d - i.due_date between 31 and 60), 0), 2),
           round(coalesce(sum(i.outstanding) filter (where t.d - i.due_date between 61 and 90), 0), 2),
           round(coalesce(sum(i.outstanding) filter (where t.d - i.due_date > 90), 0), 2)],
         max(i.as_at)
  from i cross join t left join public.customers c on c.code = i.code
  where (public.has_perm('sap_import') or public.has_perm('credit_approve')) and i.code = any (p_customers) and i.outstanding > 0
  group by i.code
$$;

-- ---------- ask: the server decides, from its own aging, which invoices are held and which only remind ----------
-- p_cases: [{doc_no, customer, customer_name, sales_rep, amount}]
create or replace function public.credit_ask(p_cases jsonb, p_file text, p_note text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  x jsonb; a record; who text; asked int := 0; reminded int := 0; skipped int := 0; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  checked text[] := array['MY01S00004','MY01S00011','MY01S00017','MY01S00021','MY01S00022'];
begin
  if not public.has_perm('sap_import') then raise exception 'You cannot ask for credit approval.' using errcode = '42501'; end if;
  who := coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Finance');
  for x in select * from jsonb_array_elements(p_cases) loop
    if not (x->>'sales_rep' = any (checked)) then skipped := skipped + 1; continue; end if;
    select * into a from public.credit_aging(array[x->>'customer']);
    if not found or a.overdue <= 0 then skipped := skipped + 1; continue; end if;   -- nothing past due: no approval needed
    if lower(trim(coalesce(a.channel, ''))) = 'supermarket' then
      insert into public.credit_reminders (doc_no, customer, customer_name, sales_rep, amount, overdue, oldest_days, sent_on)
        values (x->>'doc_no', a.code, a.name, x->>'sales_rep', (x->>'amount')::numeric, a.overdue, a.oldest_days, today)
        on conflict (doc_no) do nothing;
      if found then reminded := reminded + 1; end if;
    else
      if exists (select 1 from public.credit_approvals where doc_no = x->>'doc_no' and status in ('Waiting','Approved')) then continue; end if;
      insert into public.credit_approvals (doc_no, customer, customer_name, sales_rep, amount, overdue, oldest_days, buckets, as_at, file_name, asked_by, asked_by_name, asked_at, note)
        values (x->>'doc_no', a.code, a.name, x->>'sales_rep', (x->>'amount')::numeric, a.overdue, a.oldest_days, a.buckets, a.as_at, nullif(trim(p_file), ''),
                (select auth.uid()), who, today, nullif(trim(p_note), ''));
      asked := asked + 1;
    end if;
  end loop;
  return jsonb_build_object('asked', asked, 'reminded', reminded, 'skipped', skipped);
end $$;

create or replace function public.credit_decide(p_id uuid, p_status text, p_note text) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('credit_approve') then raise exception 'Only Finance or Management can approve.' using errcode = '42501'; end if;
  if p_status not in ('Approved','Rejected') then raise exception 'Unknown decision.'; end if;
  if p_status = 'Rejected' and coalesce(trim(p_note), '') = '' then raise exception 'Give a reason for rejecting.'; end if;
  update public.credit_approvals set status = p_status, decided_by = (select auth.uid()),
    decided_by_name = coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Finance'),
    decided_at = (now() at time zone 'Asia/Kuala_Lumpur')::date, decision_note = nullif(trim(p_note), '')
    where id = p_id and status = 'Waiting';
  if not found then raise exception 'This request has already been decided.'; end if;
end $$;

create or replace function public.credit_seen(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.credit_reminders set seen = true, seen_at = now()
    where id = p_id and not seen and public.has_perm('page_customers') and public.in_scope(sales_rep);
  if not found then raise exception 'That reminder is not yours or is already ticked.'; end if;
end $$;

alter table public.credit_approvals enable row level security;
alter table public.credit_reminders enable row level security;
-- requests: the finance team that asks and the people who approve
create policy credit_approvals_read on public.credit_approvals for select to authenticated
  using ((select public.has_perm('sap_import')) or (select public.has_perm('credit_approve')));
-- reminders: a sales rep sees their own; management and Finance see all
create policy credit_reminders_read on public.credit_reminders for select to authenticated
  using (((select public.has_perm('page_customers')) and public.in_scope(sales_rep)) or (select public.has_perm('sap_import')) or (select public.has_perm('credit_approve')));
-- no write policies: changes only through the functions above

revoke execute on function public.credit_aging(text[]), public.credit_ask(jsonb, text, text), public.credit_decide(uuid, text, text), public.credit_seen(uuid) from public, anon;
grant  execute on function public.credit_aging(text[]), public.credit_ask(jsonb, text, text), public.credit_decide(uuid, text, text), public.credit_seen(uuid) to authenticated;
