-- Master data: one clean record per item, customer group and supplier.
-- These are kept apart from the weekly report tables on purpose: reloading a report must never wipe what people have filled in.

insert into public.permissions (key, label, grp, sort) values
  ('page_master',   'Master data (items, customer groups, suppliers)', 'Pages', 7),
  ('master_manage', 'Edit and upload master data',                     'Master data', 60)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('management', 'page_master'), ('supervisor', 'page_master'), ('finance', 'page_master'),
  ('management', 'master_manage'), ('supervisor', 'master_manage')
  on conflict do nothing;

create table public.item_master (
  code            text primary key,
  description     text,
  barcode         text,
  category        text,
  brand           text,
  pack_size       text,
  pcs_per_carton  int check (pcs_per_carton is null or pcs_per_carton > 0),
  carton_price    numeric(12,2) check (carton_price is null or carton_price >= 0),
  batch_tracked   boolean not null default true,
  shelf_life_days int check (shelf_life_days is null or shelf_life_days > 0),
  active          boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
create unique index item_master_barcode_key on public.item_master (barcode) where barcode is not null;

-- Not tied to the customers table (a report reload replaces that); linked by customer code.
create table public.customer_groups (
  customer_code text primary key,
  class         text check (class in ('A','B','C')),
  group_name    text,
  region        text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

create table public.suppliers (
  code           text primary key,
  name           text not null,
  payment_terms  text,
  contact_person text,
  email          text,
  claims_email   text,
  active         boolean not null default true,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

create function public.master_stamp() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := (select auth.uid()); return new; end $$;
revoke execute on function public.master_stamp() from public, anon, authenticated;
create trigger item_master_stamp before insert or update on public.item_master for each row execute function public.master_stamp();
create trigger customer_groups_stamp before insert or update on public.customer_groups for each row execute function public.master_stamp();
create trigger suppliers_stamp before insert or update on public.suppliers for each row execute function public.master_stamp();

alter table public.item_master enable row level security;
alter table public.customer_groups enable row level security;
alter table public.suppliers enable row level security;

create policy item_master_read   on public.item_master for select to authenticated using ((select public.has_perm('page_master')));
create policy item_master_insert on public.item_master for insert to authenticated with check ((select public.has_perm('master_manage')));
create policy item_master_update on public.item_master for update to authenticated using ((select public.has_perm('master_manage'))) with check ((select public.has_perm('master_manage')));
create policy item_master_delete on public.item_master for delete to authenticated using ((select public.has_perm('master_manage')));

create policy customer_groups_read   on public.customer_groups for select to authenticated using ((select public.has_perm('page_master')));
create policy customer_groups_insert on public.customer_groups for insert to authenticated with check ((select public.has_perm('master_manage')));
create policy customer_groups_update on public.customer_groups for update to authenticated using ((select public.has_perm('master_manage'))) with check ((select public.has_perm('master_manage')));
create policy customer_groups_delete on public.customer_groups for delete to authenticated using ((select public.has_perm('master_manage')));

create policy suppliers_read   on public.suppliers for select to authenticated using ((select public.has_perm('page_master')));
create policy suppliers_insert on public.suppliers for insert to authenticated with check ((select public.has_perm('master_manage')));
create policy suppliers_update on public.suppliers for update to authenticated using ((select public.has_perm('master_manage'))) with check ((select public.has_perm('master_manage')));
create policy suppliers_delete on public.suppliers for delete to authenticated using ((select public.has_perm('master_manage')));
