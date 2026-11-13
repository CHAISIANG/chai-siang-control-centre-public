-- Sample finance data: 3 fictional Malaysian clients and 5 invoices covering every status.
-- Dates are relative to today so the dashboard always shows paid, partial, due soon, overdue and current invoices.
-- Run once:  supabase db query --remote -f supabase/samples/finance_sample.sql
-- Remove:    delete from public.fin_invoices; delete from public.fin_clients; update public.fin_counters set last = 0;

with c as (
  insert into public.fin_clients (company_name, contact_person, email, phone, address) values
    ('Sri Murni Trading Sdn Bhd',     'Nurul Aina',  'accounts@srimurni.example',   '+60 3-5521 8800', 'No. 12, Jalan Perusahaan 3, Shah Alam, 40000 Selangor'),
    ('Makmur Runcit Enterprise',      'Tan Wei Ming','makmur.runcit@example.com',   '+60 12-334 5566', '88, Lorong Maju, Taman Pelangi, 80400 Johor Bahru, Johor'),
    ('Lim & Sons Supermarket Sdn Bhd','Lim Kah Hoe', 'finance@limsons.example',     '+60 4-228 7711', '45, Lebuh Chulia, 10200 George Town, Pulau Pinang')
  returning id, company_name
), ids as (
  select
    (select id from c where company_name like 'Sri Murni%') as a,
    (select id from c where company_name like 'Makmur%')    as b,
    (select id from c where company_name like 'Lim%')       as d
), inv as (
  insert into public.fin_invoices (client_id, issue_date, due_date, tax_rate, notes, recurrence, next_generate_date)
  select a, current_date - 75, current_date - 45, 8, 'Monthly distribution service, October', null::text, null::date from ids
  union all select b, current_date - 40, current_date - 10, 8, 'Warehouse handling, October', null::text, null::date from ids
  union all select d, current_date - 20, current_date + 10, 8, 'Cold chain delivery, November', 'monthly', current_date + 10 from ids
  union all select a, current_date - 27, current_date + 3, 8, 'Merchandising support, November', null::text, null::date from ids
  union all select b, current_date - 60, current_date - 30, 8, 'Promotion display setup', null::text, null::date from ids
  returning id, client_id, notes
)
insert into public.fin_invoice_items (invoice_id, sort, description, qty, unit_price)
select i.id, 1, 'Distribution service fee', 1, case i.notes when 'Monthly distribution service, October' then 8200 when 'Warehouse handling, October' then 3150 when 'Cold chain delivery, November' then 12400 when 'Merchandising support, November' then 4600 else 2500 end from inv i
union all select i.id, 2, 'Fuel and handling surcharge', 1, case i.notes when 'Monthly distribution service, October' then 640 when 'Warehouse handling, October' then 220 when 'Cold chain delivery, November' then 960 when 'Merchandising support, November' then 150 else 150 end from inv i;

-- Payments: the oldest invoice is fully paid; the Makmur October invoice is part paid.
insert into public.fin_payments (invoice_id, paid_on, amount, method, reference)
select id, current_date - 50, total, 'Bank transfer', 'TRF-88213' from public.fin_invoices where notes = 'Promotion display setup';
insert into public.fin_payments (invoice_id, paid_on, amount, method, reference)
select id, current_date - 5, 1500, 'Bank transfer', 'TRF-90412' from public.fin_invoices where notes = 'Warehouse handling, October';
