-- Collection follow-up: what the salesman did about each overdue invoice (promised to pay, dispute, ...).
-- Kept apart from ar_invoices on purpose: the weekly aging upload replaces that table, and these notes must survive it.
-- An invoice that no longer appears in the next aging report has been paid, so its status simply stops showing.

insert into public.permissions (key, label, grp, sort) values
  ('collections_update', 'Record collection status on invoices', 'Customers', 25)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('salesperson', 'collections_update'), ('supervisor', 'collections_update'), ('management', 'collections_update')
  on conflict do nothing;

create table public.collection_status (
  doc_no        text primary key,             -- same number as ar_invoices.doc_no; no foreign key so a report reload never wipes it
  cust_code     text not null,
  agent         text,
  status        text not null check (status in ('No contact yet','Contacted','Promised to pay','Payment on the way','Dispute','Partly paid')),
  promise_date  date,
  remark        text,
  amount        numeric(14,2),                -- outstanding when last updated
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_by_name text
);
create index collection_status_cust_idx on public.collection_status (cust_code);

create table public.collection_events (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  doc_no        text not null,
  cust_code     text not null,
  agent         text,
  status        text not null,
  promise_date  date,
  remark        text,
  actor         uuid,
  actor_name    text
);
create index collection_events_cust_idx on public.collection_events (cust_code, at);

alter table public.collection_status enable row level security;
alter table public.collection_events enable row level security;

-- Same reach as the aging report itself: a salesman sees their own agent's invoices, supervisors and management see all.
create policy collection_status_read on public.collection_status for select to authenticated
  using ((select public.has_perm('page_customers')) and public.in_scope('MY01S' || lpad(agent, 5, '0')));
create policy collection_events_read on public.collection_events for select to authenticated
  using ((select public.has_perm('page_customers')) and public.in_scope('MY01S' || lpad(agent, 5, '0')));
-- No insert, update or delete policy: statuses change only through collection_set().

-- Set the status of one or more open invoices. p_remark and p_promise replace what was there.
create or replace function public.collection_set(p_docs text[], p_status text, p_promise date default null, p_remark text default null)
  returns int language plpgsql security definer set search_path = '' as $$
declare
  inv record;
  n int := 0;
  who text := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
begin
  if not (public.has_perm('collections_update') and public.has_perm('page_customers')) then
    raise exception 'You cannot record collection status' using errcode = '42501';
  end if;
  if p_status not in ('No contact yet','Contacted','Promised to pay','Payment on the way','Dispute','Partly paid') then
    raise exception 'Unknown status';
  end if;
  if p_status = 'Promised to pay' and p_promise is null then
    raise exception 'Enter the date the customer promised to pay';
  end if;
  if p_promise is not null and p_promise < current_date - 7 then
    raise exception 'The promised date is too far in the past';
  end if;
  for inv in select doc_no, cust_code, agent, outstanding from public.ar_invoices where doc_no = any (p_docs) for update loop
    -- a salesman can only touch their own agent's invoices
    if not public.in_scope('MY01S' || lpad(inv.agent, 5, '0')) then
      raise exception 'Invoice % is not one of your customers', inv.doc_no using errcode = '42501';
    end if;
    insert into public.collection_status (doc_no, cust_code, agent, status, promise_date, remark, amount, updated_at, updated_by, updated_by_name)
    values (inv.doc_no, inv.cust_code, inv.agent, p_status, p_promise, nullif(trim(p_remark), ''), inv.outstanding, now(), (select auth.uid()), who)
    on conflict (doc_no) do update set status = excluded.status, promise_date = excluded.promise_date, remark = excluded.remark,
      amount = excluded.amount, agent = excluded.agent, cust_code = excluded.cust_code, updated_at = now(), updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name;
    insert into public.collection_events (doc_no, cust_code, agent, status, promise_date, remark, actor, actor_name)
    values (inv.doc_no, inv.cust_code, inv.agent, p_status, p_promise, nullif(trim(p_remark), ''), (select auth.uid()), who);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'None of those invoices is open any more'; end if;
  return n;
end $$;
revoke execute on function public.collection_set(text[], text, date, text) from public, anon;
grant  execute on function public.collection_set(text[], text, date, text) to authenticated;
