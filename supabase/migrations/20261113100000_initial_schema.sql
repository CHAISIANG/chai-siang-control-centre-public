-- Chai Siang control centre: initial schema.
-- Row level security is ON for every table and no policies exist yet, so the public (anon) key
-- can read nothing. Access will be added with login + role policies in the next step.

create table public.salesmen (
  code        text primary key,
  name        text not null,
  area        text,
  created_at  timestamptz not null default now()
);

-- DA1 "Coverage & Net Sales": one row per salesman per month.
create table public.salesman_monthly (
  salesman_code text not null references public.salesmen(code) on delete cascade,
  year          int  not null,
  month         int  not null check (month between 1 and 12),
  rl_acct       int,
  active_acct   int,
  erc           numeric(6,2),
  sales_target  numeric(14,2),
  net_sales     numeric(14,2),
  primary key (salesman_code, year, month)
);

-- Customer Master.
create table public.customers (
  code            text primary key,
  name            text not null,
  sales_org       text,
  route_code      text,
  route_name      text,
  visit_day       text,
  visit_frequency text,
  payment_term    text,
  channel_code    text,
  channel         text,
  salesman_code   text references public.salesmen(code) on delete set null,
  created_on      date,
  latitude        numeric(9,6),
  longitude       numeric(9,6)
);
create index customers_salesman_idx on public.customers (salesman_code);

-- Promotional Discount report (claim support lines).
create table public.promo_lines (
  id                bigint generated always as identity primary key,
  promo_code        text,
  product_code      text,
  description       text,
  base_uom          text,
  uom               int,
  list_price        numeric(12,2),
  discount_value    numeric(12,2),
  customer_code     text references public.customers(code) on delete set null,
  customer_name     text,
  channel_code      text,
  channel           text,
  invoice_no        text,
  invoice_date      date,
  invoice_qty       numeric(12,2),
  invoice_discount  numeric(12,2),
  invoice_value     numeric(12,2),
  schemes_applied   text
);
create index promo_lines_customer_idx on public.promo_lines (customer_code);

-- PAF claims. `form_values` holds every cell typed into the form, keyed by Excel cell address.
create table public.claims (
  id             text primary key,
  form_key       text not null check (form_key in ('fixed','addbbf','offgrid','pkglp','pkgws','tnc')),
  customer_code  text references public.customers(code) on delete set null,
  customer_name  text not null,
  salesman_code  text references public.salesmen(code) on delete set null,
  amount         numeric(14,2) not null default 0,
  status         text not null default 'Draft'
                 check (status in ('Draft','Pending supervisor','Approved','Sent to principal','Paid','Rejected')),
  remark         text,
  form_values    jsonb not null default '{}'::jsonb,
  submitted_on   date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.claim_files (
  id          bigint generated always as identity primary key,
  claim_id    text not null references public.claims(id) on delete cascade,
  kind        text not null check (kind in ('photo','document')),
  file_name   text not null,
  storage_path text,
  created_at  timestamptz not null default now()
);

-- Lorry status board.
create table public.lorries (
  lorry_no    text primary key,
  driver      text,
  route       text,
  status      text not null check (status in ('On duty','Loading','Empty')),
  invoices    int  not null default 0,
  load_pct    int  not null default 0 check (load_pct between 0 and 100),
  updated_at  timestamptz not null default now()
);

-- Record of each uploaded Excel file.
create table public.upload_log (
  id           bigint generated always as identity primary key,
  report       text not null,
  file_name    text,
  row_count    int,
  status       text not null default 'OK',
  uploaded_at  timestamptz not null default now()
);

alter table public.salesmen          enable row level security;
alter table public.salesman_monthly  enable row level security;
alter table public.customers         enable row level security;
alter table public.promo_lines       enable row level security;
alter table public.claims            enable row level security;
alter table public.claim_files       enable row level security;
alter table public.lorries           enable row level security;
alter table public.upload_log        enable row level security;
