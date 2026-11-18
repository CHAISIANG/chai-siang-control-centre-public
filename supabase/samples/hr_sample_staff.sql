-- Five made-up staff for trying HR before the real staff list is imported. All names, emails and phones are fictional.
-- Remove them later on the Employees page (untick "Still working here") or with:
--   delete from public.hr_employees where code like 'DEMO%';
insert into public.hr_employees (code, name, position, dept, gender, state, joined, hr_role, email, phone) values
  ('DEMO5', 'Lim Wei Jie', 'HR & Admin Manager', 'HR', 'M', 'Selangor', '2016-01-04', 'hr', 'demo-weijie@example.com', '012-000 0005'),
  ('DEMO1', 'Ahmad Faizal bin Rahman', 'Operations Manager', 'Operations', 'M', 'Selangor', '2018-03-01', 'manager', 'demo-ahmad@example.com', '012-000 0001'),
  ('DEMO2', 'Nurul Aisyah binti Hassan', 'Admin Executive', 'Operations', 'F', 'Selangor', '2023-06-12', 'employee', 'demo-nurul@example.com', '012-000 0002'),
  ('DEMO3', 'Tan Mei Ling', 'Account Clerk', 'Finance', 'F', 'Selangor', '2025-02-03', 'employee', 'demo-meiling@example.com', '012-000 0003'),
  ('DEMO4', 'Rajesh a/l Subramaniam', 'Storekeeper', 'Warehouse', 'M', 'Selangor', '2020-09-01', 'employee', 'demo-rajesh@example.com', '012-000 0004')
on conflict (code) do nothing;
update public.hr_employees e set manager_id = m.id from public.hr_employees m
  where m.code = case e.code when 'DEMO1' then 'DEMO5' when 'DEMO2' then 'DEMO1' when 'DEMO3' then 'DEMO5' when 'DEMO4' then 'DEMO1' end;
