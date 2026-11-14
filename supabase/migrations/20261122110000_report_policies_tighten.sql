-- Who owes us is more sensitive than sales figures: only roles that have the Customers or Finance page may read open invoices.
-- Customer sales need the Customers or Sales page. (Before this, any role that could see the dashboard could read them.)
drop policy ar_invoices_read on public.ar_invoices;
create policy ar_invoices_read on public.ar_invoices for select to authenticated
  using (((select public.has_perm('page_customers')) or (select public.has_perm('page_finance'))) and public.in_scope('MY01S' || lpad(agent, 5, '0')));

drop policy customer_sales_read on public.customer_sales;
create policy customer_sales_read on public.customer_sales for select to authenticated
  using (((select public.has_perm('page_customers')) or (select public.has_perm('page_sales')))
    and ((select public.has_perm('view_all_data')) or exists (select 1 from public.customers c where c.code = customer_sales.code)));
