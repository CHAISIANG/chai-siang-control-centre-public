-- Finance: clients, invoices (with SST), payments, recurring invoices and reminder log.
-- Money is numeric(14,2). Totals, balances and status are always computed in the database.

-- ---------- permissions ----------
insert into public.permissions (key, label, grp, sort) values
  ('page_finance',   'Finance: invoices, payments and clients (view)', 'Pages',   7),
  ('finance_manage', 'Finance: create and edit invoices, record payments', 'Finance', 60)
on conflict (key) do nothing;

insert into public.role_permissions (role, permission) values
  ('finance', 'page_finance'), ('finance', 'finance_manage'),
  ('management', 'page_finance'), ('supervisor', 'page_finance')
on conflict do nothing;

-- ---------- tables ----------
create table public.fin_settings (
  id               int primary key default 1 check (id = 1),
  company_name     text not null default 'Chai Siang Sdn Bhd',
  company_address  text not null default 'Add your company address in Finance settings',
  company_phone    text not null default '',
  company_email    text not null default '',
  reg_no           text not null default '',
  sst_no           text not null default '',
  tax_rate         numeric(5,2) not null default 8.00 check (tax_rate >= 0 and tax_rate <= 100),
  currency         text not null default 'RM',
  payment_terms_days int not null default 30 check (payment_terms_days >= 0),
  bank_name        text not null default '',
  bank_account_no  text not null default '',
  bank_account_name text not null default '',
  updated_at       timestamptz not null default now()
);
insert into public.fin_settings (id) values (1);

create table public.fin_clients (
  id             uuid primary key default gen_random_uuid(),
  company_name   text not null,
  contact_person text not null default '',
  email          text not null default '',
  phone          text not null default '',
  address        text not null default '',
  notes          text not null default '',
  created_at     timestamptz not null default now()
);

create table public.fin_counters (
  year int primary key,
  last int not null default 0
);

create table public.fin_invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text not null unique,
  client_id     uuid not null references public.fin_clients(id) on delete restrict,
  issue_date    date not null default current_date,
  due_date      date not null,
  status        text not null default 'unpaid' check (status in ('unpaid','partial','overdue','paid','void')),
  subtotal      numeric(14,2) not null default 0,
  tax_rate      numeric(5,2) not null default 8.00,
  tax_amount    numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  amount_paid   numeric(14,2) not null default 0,
  balance_due   numeric(14,2) not null default 0,
  recurrence    text check (recurrence in ('monthly','quarterly')),
  next_generate_date date,
  recurring_source uuid references public.fin_invoices(id) on delete set null,
  notes         text not null default '',
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  check (due_date >= issue_date),
  check ((recurrence is null) = (next_generate_date is null))
);
create index fin_invoices_client_idx on public.fin_invoices (client_id);
create index fin_invoices_status_idx on public.fin_invoices (status, due_date);

create table public.fin_invoice_items (
  id          bigint generated always as identity primary key,
  invoice_id  uuid not null references public.fin_invoices(id) on delete cascade,
  sort        int not null default 0,
  description text not null,
  qty         numeric(12,2) not null default 1 check (qty > 0),
  unit_price  numeric(14,2) not null default 0 check (unit_price >= 0),
  amount      numeric(14,2) not null default 0
);
create index fin_items_invoice_idx on public.fin_invoice_items (invoice_id);

create table public.fin_payments (
  id          bigint generated always as identity primary key,
  invoice_id  uuid not null references public.fin_invoices(id) on delete cascade,
  paid_on     date not null default current_date,
  amount      numeric(14,2) not null check (amount > 0),
  method      text not null default 'Bank transfer',
  reference   text not null default '',
  note        text not null default '',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index fin_payments_invoice_idx on public.fin_payments (invoice_id);

create table public.fin_reminders (
  id          bigint generated always as identity primary key,
  invoice_id  uuid not null references public.fin_invoices(id) on delete cascade,
  level       text not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index fin_reminders_invoice_idx on public.fin_reminders (invoice_id);

-- ---------- calculations ----------
-- Recompute one invoice: subtotal, SST, total, paid, balance and status.
create function public.fin_recalc(inv uuid) returns void
  language plpgsql security definer set search_path = '' as
$$
declare
  sub numeric(14,2); rate numeric(5,2); tax numeric(14,2); tot numeric(14,2); paid numeric(14,2);
  cur_status text; due date; bal numeric(14,2); new_status text;
begin
  select tax_rate, status, due_date into rate, cur_status, due from public.fin_invoices where id = inv;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into sub from public.fin_invoice_items where invoice_id = inv;
  select coalesce(sum(amount), 0) into paid from public.fin_payments where invoice_id = inv;
  tax := round(sub * rate / 100, 2);
  tot := sub + tax;
  bal := greatest(tot - paid, 0);
  if cur_status = 'void' then new_status := 'void';
  elsif tot > 0 and bal = 0 then new_status := 'paid';
  elsif due < current_date then new_status := 'overdue';
  elsif paid > 0 then new_status := 'partial';
  else new_status := 'unpaid';
  end if;
  update public.fin_invoices
     set subtotal = sub, tax_amount = tax, total = tot, amount_paid = paid, balance_due = bal, status = new_status
   where id = inv;
end;
$$;

create function public.fin_item_before() returns trigger
  language plpgsql set search_path = '' as
$$
begin
  new.amount := round(new.qty * new.unit_price, 2);
  return new;
end;
$$;
create trigger fin_item_before before insert or update on public.fin_invoice_items
  for each row execute function public.fin_item_before();

create function public.fin_after_child() returns trigger
  language plpgsql security definer set search_path = '' as
$$
begin
  if tg_op in ('INSERT','UPDATE') then perform public.fin_recalc(new.invoice_id); end if;
  if tg_op in ('DELETE','UPDATE') and (tg_op = 'DELETE' or old.invoice_id is distinct from new.invoice_id) then
    perform public.fin_recalc(old.invoice_id);
  end if;
  return null;
end;
$$;
create trigger fin_items_after after insert or update or delete on public.fin_invoice_items
  for each row execute function public.fin_after_child();
create trigger fin_payments_after after insert or update or delete on public.fin_payments
  for each row execute function public.fin_after_child();

-- A payment may not exceed what is still owed.
create function public.fin_payment_check() returns trigger
  language plpgsql set search_path = '' as
$$
declare tot numeric(14,2); paid numeric(14,2);
begin
  select total into tot from public.fin_invoices where id = new.invoice_id;
  select coalesce(sum(amount), 0) into paid from public.fin_payments
    where invoice_id = new.invoice_id and (tg_op = 'INSERT' or id <> new.id);
  if paid + new.amount > tot then
    raise exception 'Payment of % is more than the balance of % on this invoice.', new.amount, tot - paid;
  end if;
  return new;
end;
$$;
create trigger fin_payment_check before insert or update on public.fin_payments
  for each row execute function public.fin_payment_check();

-- Keep totals consistent when an invoice's own fields change (tax rate, due date, void).
create function public.fin_invoice_after() returns trigger
  language plpgsql security definer set search_path = '' as
$$
begin
  if new.tax_rate is distinct from old.tax_rate or new.due_date is distinct from old.due_date
     or (new.status = 'void') is distinct from (old.status = 'void') then
    perform public.fin_recalc(new.id);
  end if;
  return null;
end;
$$;
create trigger fin_invoice_after after update of tax_rate, due_date, status on public.fin_invoices
  for each row when (pg_trigger_depth() < 1) execute function public.fin_invoice_after();

-- Invoice numbers: INV-<year>-0001, never reused, unique.
create function public.fin_invoice_number() returns trigger
  language plpgsql security definer set search_path = '' as
$$
declare y int; n int;
begin
  if new.invoice_no is null or new.invoice_no = '' then
    y := extract(year from new.issue_date);
    insert into public.fin_counters (year, last) values (y, 1)
      on conflict (year) do update set last = public.fin_counters.last + 1
      returning last into n;
    new.invoice_no := 'INV-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;
alter table public.fin_invoices alter column invoice_no drop not null;
create trigger fin_invoice_number before insert on public.fin_invoices
  for each row execute function public.fin_invoice_number();
alter table public.fin_invoices alter column invoice_no set not null;

-- ---------- daily overdue check ----------
create function public.fin_mark_overdue() returns int
  language plpgsql security definer set search_path = '' as
$$
declare n int;
begin
  if auth.uid() is not null and not public.has_perm('page_finance') then return 0; end if;
  update public.fin_invoices set status = 'overdue'
   where status in ('unpaid','partial') and balance_due > 0 and due_date < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.fin_mark_overdue() from public, anon;
grant  execute on function public.fin_mark_overdue() to authenticated;

revoke execute on function public.fin_recalc(uuid), public.fin_item_before(), public.fin_after_child(),
  public.fin_payment_check(), public.fin_invoice_after(), public.fin_invoice_number() from public, anon, authenticated;

-- ---------- recurring: create the next invoice from a template invoice ----------
create function public.fin_generate_next(src uuid) returns uuid
  language plpgsql set search_path = '' as
$$
declare s public.fin_invoices; gen date; new_id uuid; terms int; step interval;
begin
  select * into s from public.fin_invoices where id = src;
  if not found or s.recurrence is null then raise exception 'This invoice is not a recurring invoice.'; end if;
  select payment_terms_days into terms from public.fin_settings where id = 1;
  gen := s.next_generate_date;
  insert into public.fin_invoices (client_id, issue_date, due_date, tax_rate, notes, recurring_source)
    values (s.client_id, gen, gen + terms, s.tax_rate, s.notes, coalesce(s.recurring_source, s.id))
    returning id into new_id;
  insert into public.fin_invoice_items (invoice_id, sort, description, qty, unit_price)
    select new_id, sort, description, qty, unit_price from public.fin_invoice_items where invoice_id = src;
  step := case s.recurrence when 'monthly' then interval '1 month' else interval '3 months' end;
  update public.fin_invoices set next_generate_date = (gen + step)::date where id = src;
  return new_id;
end;
$$;
revoke execute on function public.fin_generate_next(uuid) from public, anon;
grant  execute on function public.fin_generate_next(uuid) to authenticated;

-- ---------- row level security ----------
alter table public.fin_settings      enable row level security;
alter table public.fin_clients       enable row level security;
alter table public.fin_counters      enable row level security;
alter table public.fin_invoices      enable row level security;
alter table public.fin_invoice_items enable row level security;
alter table public.fin_payments      enable row level security;
alter table public.fin_reminders     enable row level security;

create policy fin_settings_read  on public.fin_settings for select to authenticated using ((select public.has_perm('page_finance')));
create policy fin_settings_write on public.fin_settings for update to authenticated
  using ((select public.has_perm('finance_manage'))) with check ((select public.has_perm('finance_manage')));

do $$
declare t text;
begin
  foreach t in array array['fin_clients','fin_invoices','fin_invoice_items','fin_payments','fin_reminders'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.has_perm(''page_finance'')))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(''finance_manage'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.has_perm(''finance_manage''))) with check ((select public.has_perm(''finance_manage'')))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_perm(''finance_manage'')))', t || '_delete', t);
  end loop;
end $$;
-- fin_counters has RLS on and no policies: only the numbering trigger (security definer) touches it.
-- Reminders are a log; nobody edits history.
drop policy fin_reminders_update on public.fin_reminders;
drop policy fin_reminders_delete on public.fin_reminders;
-- Payments are a ledger: record a correction by deleting the wrong row and adding the right one (finance_manage only).
