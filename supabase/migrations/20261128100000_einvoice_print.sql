-- E-invoice print: the data the fixed A4 layout needs that we did not hold yet.
--  * company details shown in the top part (kept here, never in the code)
--  * each customer's BRN, TIN, billing and delivery address, email and phone
--  * the LHDN MyInvois validation of each invoice (UUID, QR link, validation date)

alter table public.fin_settings
  add column company_name_cn text not null default '',
  add column tin             text not null default '',
  add column company_mobile  text not null default '',
  add column late_interest   text not null default '1.5%';

create table public.einv_customers (
  cust_code     text primary key,
  bill_name     text,           -- name printed on the invoice, if different from the SAP name
  brn           text,
  tin           text,
  bill_address  text,           -- up to 4 lines, separated by line breaks
  ship_address  text,           -- blank = same as billing
  email         text,
  tel           text,
  terms         text,           -- blank = from the customer's payment term
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

create table public.einv_validations (
  doc_no        text primary key,  -- the invoice number (SAP document number)
  uuid          text not null,
  long_id       text,
  qr_link       text,              -- MyInvois share link the QR code points to
  validated_at  text,              -- as printed, e.g. 17/11/2026 15:30:34
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

alter table public.einv_customers   enable row level security;
alter table public.einv_validations enable row level security;

do $$
declare t text;
begin
  foreach t in array array['einv_customers', 'einv_validations'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.has_perm(''sap_import'')))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(''sap_import'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.has_perm(''sap_import''))) with check ((select public.has_perm(''sap_import'')))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_perm(''sap_import'')))', t || '_delete', t);
  end loop;
end $$;

-- who changed it, and when
create or replace function public.einv_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
create trigger einv_customers_stamp   before insert or update on public.einv_customers   for each row execute function public.einv_stamp();
create trigger einv_validations_stamp before insert or update on public.einv_validations for each row execute function public.einv_stamp();
