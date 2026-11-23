-- Expense claims: an "Others" category for costs that fit no other one.
-- RM200 per item, RM1,000 a month per person, receipt required. Like every non-mileage category,
-- a claim cannot be sent without a description of what the item was for (checked in exp_save).
insert into public.expense_categories (code, name, per_item_limit, monthly_budget, receipt_required, mileage, active, sort)
values ('OTH', 'Others', 200, 1000, true, false, true, 9)
on conflict (code) do nothing;
