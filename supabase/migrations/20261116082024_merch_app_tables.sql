-- Applied directly to the live database on 2026-11-16 and brought into the repo on 2026-11-24 from supabase_migrations.schema_migrations.
create table public.merch_settings (
  id int primary key default 1 check (id = 1),
  rules jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.merch_skus (
  id text primary key, name text not null, brand text not null,
  unit_cost numeric(10,2) not null, carton_qty int not null,
  carton_promo_unit_cost numeric(10,2) not null, margin_per_unit numeric(10,2) not null,
  hero boolean not null default false, heavy boolean not null default false
);
create table public.merch_rates (
  id text primary key, task text not null, standard_label text not null,
  standard_cost numeric(10,2) not null, budget_label text not null, budget_cost numeric(10,2) not null
);
create table public.merch_salesmen (
  id uuid primary key default gen_random_uuid(),
  name text not null, area text not null default '', phone text not null default ''
);
create table public.merch_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null, owner text not null default '', area text not null default '',
  type text not null default 'Supermarket',
  salesman_id uuid references public.merch_salesmen(id) on delete set null,
  last_visit date,
  share_of_shelf int not null default 0, empty_facings int not null default 0,
  missing_price_tags int not null default 0,
  hero_at_eye boolean not null default false, heavy_lower boolean not null default false,
  monthly_order numeric(12,2) not null default 0, note text not null default ''
);
create table public.merch_visits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.merch_stores(id) on delete cascade,
  visited_at timestamptz not null default now(),
  status text not null,
  total_standard numeric(12,2) not null, total_optimized numeric(12,2) not null,
  note text not null default ''
);
do $$
declare t text;
begin
  foreach t in array array['merch_settings','merch_skus','merch_rates','merch_salesmen','merch_stores','merch_visits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "signed-in users only" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

insert into public.merch_settings (id, rules) values (1, '{"visitEveryDays":14,"minShareOfShelf":40,"maxEmptyFacings":2,"maxMissingPriceTags":0,"cartonThreshold":8,"heroAtEyeLevel":true,"heavyOnLowerShelf":true}');

insert into public.merch_skus values
('ct150','Colgate Total 150g','Colgate',9.2,24,8.4,1.8,true,false),
('ow100','Colgate Optic White 100g','Colgate',8.5,24,7.8,1.7,true,false),
('cm200','Colgate MaxFresh 200g','Colgate',7.9,24,7.2,1.5,false,false),
('pm750','Palmolive Shampoo 750ml','Palmolive',18.5,12,17.0,3.2,false,false),
('sl1l','Softlan Blue 1L','Softlan',11.9,12,10.9,2.1,false,true),
('glo1l','Glo Floor Cleaner 1L','Glo',8.9,12,8.1,1.6,false,true),
('aj500','Ajax Multi-Surface 500ml','Ajax',6.4,12,5.8,1.2,false,false),
('pt100','Protex Soap 100g','Protex',2.9,48,2.6,0.7,false,false);

insert into public.merch_rates values
('labor','Merchandiser labour (per hour)','Full shelf reset (2 hrs)',30,'Quick tidy only (1 hr)',15),
('tag','Missing price tag','New printed tag',0.8,'Handwritten tag',0.2),
('strip','Torn shelf strip','New shelf strip',3,'Tape repair',0.5),
('wobbler','Expired promo wobbler','New promo wobbler',2.5,'Clip strip',1),
('dented','Dented / damaged box','Replace unit',9,'Clearance sticker',0.2),
('display','Display unit','Floor stand',45,'Clip strip',6);

insert into public.merch_salesmen (name, area, phone) values
('Ahmad Faizal','Petaling Jaya','012-345 6789'),
('Lim Wei Jie','Kuala Lumpur','016-222 3344'),
('Siti Nurhaliza','Klang','019-888 1122');

insert into public.merch_stores (name, owner, area, type, salesman_id, last_visit, share_of_shelf, empty_facings, missing_price_tags, hero_at_eye, heavy_lower, monthly_order, note)
select v.name, v.owner, v.area, v.type, (select id from public.merch_salesmen where name = v.sm), current_date - v.days, v.share, v.oos, v.tags, v.hero, v.heavy, v.ord, v.note
from (values
('Pasaraya Maju','Encik Rahman','Petaling Jaya','Supermarket','Ahmad Faizal',6,46,1,0,true,true,4200,'Well kept. Good promo support.'),
('Kedai Runcit Ah Seng','Mr Tan Ah Seng','Petaling Jaya','Mini market','Ahmad Faizal',21,28,5,3,false,true,980,'Competitor Darlie taking eye level.'),
('99 Speedmart Bangsar','Chain - Manager Kumar','Kuala Lumpur','Chain','Lim Wei Jie',9,38,3,1,true,false,3100,'Softlan on mid shelf, should be lower.'),
('Mydin Cheras','Puan Zaiton','Kuala Lumpur','Hypermarket','Lim Wei Jie',13,44,2,0,true,true,7600,'Strong store. Ask for end-cap.'),
('Kedai Borong Klang Jaya','Mr Wong','Klang','Wholesale','Siti Nurhaliza',30,31,6,2,false,false,1500,'Not visited for a month. Dusty shelf.'),
('Econsave Klang','Puan Aminah','Klang','Supermarket','Siti Nurhaliza',11,41,2,0,true,true,3900,'On track.')
) as v(name,owner,area,type,sm,days,share,oos,tags,hero,heavy,ord,note);
