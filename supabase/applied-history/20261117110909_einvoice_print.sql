-- Applied directly to the live database on 2026-11-17 and brought into the repo on 2026-11-24 from supabase_migrations.schema_migrations.
alter table public.fin_settings
  add column company_name_cn text not null default '',
  add column tin             text not null default '',
  add column company_mobile  text not null default '',
  add column late_interest   text not null default '1.5%';

create table public.einv_customers (
  cust_code     text primary key,
  bill_name     text,
  brn           text,
  tin           text,
  bill_address  text,
  ship_address  text,
  email         text,
  tel           text,
  terms         text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

create table public.einv_validations (
  doc_no        text primary key,
  uuid          text not null,
  long_id       text,
  qr_link       text,
  validated_at  text,
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

create or replace function public.einv_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
create trigger einv_customers_stamp   before insert or update on public.einv_customers   for each row execute function public.einv_stamp();
create trigger einv_validations_stamp before insert or update on public.einv_validations for each row execute function public.einv_stamp();
