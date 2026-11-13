-- Distributor ordering portal: accounts, catalogue, orders. Orders are placed only through portal_place_order(),
-- which checks stock, works out discounts and enforces the credit limit inside the database.

-- ---------- permissions and role ----------
insert into public.permissions (key, label, grp, sort) values
  ('page_portal',   'Distributor orders: view orders and accounts', 'Pages', 8),
  ('portal_manage', 'Distributor orders: approve orders, edit accounts and products', 'Portal', 70)
on conflict (key) do nothing;
insert into public.roles (name, label, is_system, is_super, sort) values ('distributor', 'Distributor (portal login)', true, false, 60)
on conflict (name) do nothing;
insert into public.role_permissions (role, permission) values
  ('management', 'page_portal'), ('supervisor', 'page_portal'), ('supervisor', 'portal_manage')
on conflict do nothing;

-- ---------- tables ----------
create table public.portal_accounts (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  code         text not null unique,
  company_name text not null,
  tier         text not null default 'Silver' check (tier in ('Bronze','Silver','Gold','Platinum')),
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  outstanding  numeric(14,2) not null default 0 check (outstanding >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.portal_products (
  sku        text primary key,
  barcode    text not null default '',
  name       text not null,
  size       text not null default '',
  category   text not null check (category in ('Toothpaste','Toothbrushes','Mouthwash','Personal Care','Home Care')),
  per_carton int not null check (per_carton > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  stock      int not null default 0 check (stock >= 0),
  tiers      jsonb not null default '[]',
  promo      text,
  bundle     boolean not null default false,
  art        text not null default 'tube' check (art in ('tube','brush','bottle','pump','bar','pack')),
  active     boolean not null default true,
  sort       int not null default 100
);

create table public.portal_counters (year int primary key, last int not null default 0);

create table public.portal_orders (
  id         uuid primary key default gen_random_uuid(),
  ref        text not null unique,
  user_id    uuid not null references public.portal_accounts(user_id),
  status     text not null default 'Pending approval' check (status in ('Pending approval','Approved','Out for delivery','Delivered','Cancelled')),
  gross      numeric(14,2) not null,
  saving     numeric(14,2) not null,
  total      numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index portal_orders_user_idx on public.portal_orders (user_id, created_at desc);

create table public.portal_order_lines (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.portal_orders(id) on delete cascade,
  sku          text not null references public.portal_products(sku) on update cascade,
  name         text not null,
  size         text not null default '',
  cartons      int not null check (cartons > 0),
  per_carton   int not null,
  unit_price   numeric(12,2) not null,
  discount_pct numeric(5,2) not null default 0,
  carton_net   numeric(12,2) not null,
  line_total   numeric(14,2) not null
);
create index portal_lines_order_idx on public.portal_order_lines (order_id);

-- ---------- row level security ----------
alter table public.portal_accounts    enable row level security;
alter table public.portal_products    enable row level security;
alter table public.portal_counters    enable row level security;
alter table public.portal_orders      enable row level security;
alter table public.portal_order_lines enable row level security;

create function public.is_portal_account() returns boolean
  language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.portal_accounts where user_id = (select auth.uid()) and active) $$;
revoke execute on function public.is_portal_account() from public, anon;
grant  execute on function public.is_portal_account() to authenticated;

create policy portal_accounts_read on public.portal_accounts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('page_portal')));
create policy portal_accounts_update on public.portal_accounts for update to authenticated
  using ((select public.has_perm('portal_manage'))) with check ((select public.has_perm('portal_manage')));

create policy portal_products_read on public.portal_products for select to authenticated
  using ((active and (select public.is_portal_account())) or (select public.has_perm('page_portal')));
create policy portal_products_write on public.portal_products for update to authenticated
  using ((select public.has_perm('portal_manage'))) with check ((select public.has_perm('portal_manage')));
create policy portal_products_insert on public.portal_products for insert to authenticated
  with check ((select public.has_perm('portal_manage')));

create policy portal_orders_read on public.portal_orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('page_portal')));
create policy portal_lines_read on public.portal_order_lines for select to authenticated
  using (exists (select 1 from public.portal_orders o where o.id = order_id and (o.user_id = (select auth.uid()) or (select public.has_perm('page_portal')))));
-- No insert/update/delete policies on orders or lines: they change only through the functions below.

-- ---------- place an order ----------
-- p_lines: [{"sku": "TP-CH-150", "cartons": 5}, ...]. Prices, discounts, stock and credit are all decided here, never by the browser.
create function public.portal_place_order(p_lines jsonb) returns jsonb
  language plpgsql security definer set search_path = '' as
$$
declare
  acct public.portal_accounts;
  l record; p public.portal_products;
  pct numeric; net numeric; line_amt numeric;
  gross numeric := 0; total numeric := 0; n_cartons int := 0;
  committed numeric; y int; n int; new_ref text; oid uuid;
begin
  select * into acct from public.portal_accounts where user_id = (select auth.uid()) and active;
  if not found then raise exception 'Your distributor account is not active.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Your cart is empty.'; end if;

  if exists (select 1 from (select (e ->> 'sku') as sku, sum((e ->> 'cartons')::int) as cartons from jsonb_array_elements(p_lines) e group by 1) x
             where x.sku is null or x.cartons < 1 or x.cartons > 10000) then
    raise exception 'Cartons must be between 1 and 10,000.';
  end if;

  -- First pass: lock products in a fixed order, check stock, work out totals.
  for l in select (e ->> 'sku')::text as sku, sum((e ->> 'cartons')::int)::int as cartons from jsonb_array_elements(p_lines) e group by 1 order by 1 loop
    select * into p from public.portal_products where sku = l.sku and active for update;
    if not found then raise exception 'Product % is not available.', l.sku; end if;
    if p.stock < l.cartons then raise exception '% has only % carton(s) left.', p.name, p.stock; end if;
    select coalesce(max((t ->> 'pct')::numeric), 0) into pct from jsonb_array_elements(p.tiers) t where (t ->> 'min')::int <= l.cartons;
    net := round(round(p.unit_price * p.per_carton, 2) * (1 - pct / 100), 2);
    line_amt := round(net * l.cartons, 2);
    gross := gross + round(p.unit_price * p.per_carton, 2) * l.cartons;
    total := total + line_amt;
    n_cartons := n_cartons + l.cartons;
  end loop;

  -- Credit: what they already owe, plus orders not yet delivered, plus this order.
  select acct.outstanding + coalesce(sum(o.total), 0) into committed
    from public.portal_orders o where o.user_id = acct.user_id and o.status in ('Pending approval','Approved','Out for delivery');
  if committed + total > acct.credit_limit then
    raise exception 'This order would take you over your credit limit. Available credit is RM %.', to_char(greatest(acct.credit_limit - committed, 0), 'FM999,999,990.00');
  end if;

  y := extract(year from now());
  insert into public.portal_counters (year, last) values (y, 4821) on conflict (year) do update set last = public.portal_counters.last + 1 returning last into n;
  new_ref := 'PO-' || y || '-' || n;
  insert into public.portal_orders (ref, user_id, gross, saving, total) values (new_ref, acct.user_id, gross, gross - total, total) returning id into oid;

  for l in select (e ->> 'sku')::text as sku, sum((e ->> 'cartons')::int)::int as cartons from jsonb_array_elements(p_lines) e group by 1 order by 1 loop
    select * into p from public.portal_products where sku = l.sku;
    select coalesce(max((t ->> 'pct')::numeric), 0) into pct from jsonb_array_elements(p.tiers) t where (t ->> 'min')::int <= l.cartons;
    net := round(round(p.unit_price * p.per_carton, 2) * (1 - pct / 100), 2);
    insert into public.portal_order_lines (order_id, sku, name, size, cartons, per_carton, unit_price, discount_pct, carton_net, line_total)
      values (oid, p.sku, p.name, p.size, l.cartons, p.per_carton, p.unit_price, pct, net, round(net * l.cartons, 2));
    update public.portal_products set stock = stock - l.cartons where sku = l.sku;
  end loop;

  return jsonb_build_object('ref', new_ref, 'total', total, 'cartons', n_cartons);
end;
$$;
revoke execute on function public.portal_place_order(jsonb) from public, anon;
grant  execute on function public.portal_place_order(jsonb) to authenticated;

-- ---------- staff: move an order along ----------
create function public.portal_set_order_status(p_id uuid, p_status text) returns void
  language plpgsql security definer set search_path = '' as
$$
declare o public.portal_orders;
begin
  if not public.has_perm('portal_manage') then raise exception 'You do not have permission to change orders.'; end if;
  select * into o from public.portal_orders where id = p_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if not ((o.status = 'Pending approval' and p_status in ('Approved','Cancelled'))
       or (o.status = 'Approved' and p_status in ('Out for delivery','Cancelled'))
       or (o.status = 'Out for delivery' and p_status = 'Delivered')) then
    raise exception 'An order that is % cannot be set to %.', o.status, p_status;
  end if;
  update public.portal_orders set status = p_status where id = p_id;
  if p_status = 'Cancelled' then
    update public.portal_products p set stock = p.stock + l.cartons from public.portal_order_lines l where l.order_id = p_id and l.sku = p.sku;
  elsif p_status = 'Delivered' then
    update public.portal_accounts set outstanding = outstanding + o.total where user_id = o.user_id;
  end if;
end;
$$;
revoke execute on function public.portal_set_order_status(uuid, text) from public, anon;
grant  execute on function public.portal_set_order_status(uuid, text) to authenticated;

-- Sample catalogue (invented prices and stock). Replace with your real products from the Distributors page.
insert into public.portal_products (sku, barcode, name, size, category, per_carton, unit_price, stock, tiers, promo, bundle, art, sort) values
  ('TP-CH-150', '9556001100158', 'Colgate Total Charcoal Deep Clean', '150g', 'Toothpaste', 24, 7.9, 420, '[{"min":5,"pct":3},{"min":10,"pct":5},{"min":20,"pct":8}]'::jsonb, 'Promo: free 1 carton per 20', false, 'tube', 10),
  ('TP-MF-160', '9556001100165', 'Colgate MaxFresh Cooling Crystal', '160g', 'Toothpaste', 24, 6.85, 960, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'tube', 20),
  ('TP-CP-225', '9556001100172', 'Colgate Cavity Protection Great Regular', '225g', 'Toothpaste', 24, 8.4, 310, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'tube', 30),
  ('TP-HB-100', '9556001100189', 'Colgate Herbal Whitening', '100g', 'Toothpaste', 48, 4.6, 35, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'tube', 40),
  ('TP-SF-75', '9556001100196', 'Colgate Kids Strawberry Fun', '75g', 'Toothpaste', 48, 3.95, 0, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'tube', 50),
  ('TB-SC-12', '9556001100202', 'Colgate Slim Soft Charcoal Toothbrush', 'Single pack', 'Toothbrushes', 144, 4.3, 180, '[{"min":5,"pct":3},{"min":10,"pct":5},{"min":20,"pct":8}]'::jsonb, null, false, 'brush', 60),
  ('TB-ZZ-12', '9556001100219', 'Colgate ZigZag Medium Toothbrush', 'Twin pack', 'Toothbrushes', 72, 6.6, 240, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, true, 'brush', 70),
  ('TB-KD-12', '9556001100226', 'Colgate Kids Soft Toothbrush Bundle', '3 + 1 free', 'Toothbrushes', 48, 9.9, 64, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, 'Bundle: 3 + 1 free', true, 'pack', 80),
  ('MW-PX-500', '9556001100233', 'Colgate Plax Peppermint Fresh Mouthwash', '500ml', 'Mouthwash', 12, 12.8, 150, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'bottle', 90),
  ('MW-PX-250', '9556001100240', 'Colgate Plax Alcohol Free Mouthwash', '250ml', 'Mouthwash', 24, 7.2, 28, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'bottle', 100),
  ('PC-PN-500', '9556001100257', 'Palmolive Naturals Milk & Honey Shower Gel', '500ml', 'Personal Care', 12, 11.5, 275, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'pump', 110),
  ('PC-PN-400', '9556001100264', 'Palmolive Aroma Shampoo Fresh', '400ml', 'Personal Care', 12, 13.2, 120, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, 'Promo: RM1 off per unit', false, 'pump', 120),
  ('PC-PT-4', '9556001100271', 'Protex Fresh Antibacterial Soap Bar', '4 x 70g', 'Personal Care', 24, 8.75, 510, '[{"min":5,"pct":3},{"min":10,"pct":5},{"min":20,"pct":8}]'::jsonb, null, true, 'bar', 130),
  ('HC-AJ-750', '9556001100288', 'Ajax Lemon Dishwashing Liquid', '750ml', 'Home Care', 12, 6.3, 380, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'pump', 140),
  ('HC-AJ-900', '9556001100295', 'Ajax Floor Cleaner Citrus', '900ml', 'Home Care', 12, 7.45, 90, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, null, false, 'bottle', 150),
  ('HC-SL-1L', '9556001100301', 'Softlan Fabric Softener Spring Fresh', '1L', 'Home Care', 12, 9.6, 22, '[{"min":5,"pct":2},{"min":10,"pct":4},{"min":20,"pct":6}]'::jsonb, 'Promo: 2 free units per carton', false, 'bottle', 160);
