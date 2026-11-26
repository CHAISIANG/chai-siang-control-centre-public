-- Products by principal: each product (item_master) belongs to one principal (a row in suppliers), and can carry a
-- product group (products that count as one SKU in MSS / focus brand reports, e.g. the MP and normal pack).
-- Who may view and edit stays as before (page_master to view, master_manage to edit).

alter table public.item_master
  add column if not exists principal_code text references public.suppliers (code) on update cascade on delete set null,
  add column if not exists product_group  text;
create index if not exists item_master_principal_idx on public.item_master (principal_code);
create index if not exists item_master_group_idx on public.item_master (product_group);
