-- PAF chops: anyone who works on PAF claims may keep a chop for any customer in the customer list, not only for
-- customers appointed to them (owner's request, 26 Nov 2026). The chop is then reused on that customer's next claim.
-- The customer's signature on a claim still follows the claim's own rules (claim_sign is unchanged).

-- one check used everywhere; security definer so it does not depend on the customer list's own visibility rule
create or replace function public.chop_can_keep(p_customer text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select public.has_perm('page_claims') and exists (select 1 from public.customers c where c.code = p_customer)
$$;
revoke execute on function public.chop_can_keep(text) from public, anon;
grant execute on function public.chop_can_keep(text) to authenticated;

drop policy if exists customer_chops_read on public.customer_chops;
create policy customer_chops_read on public.customer_chops for select to authenticated using (public.chop_can_keep(customer_code));

drop policy if exists customer_chops_objects_read on storage.objects;
create policy customer_chops_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'customer-chops' and public.chop_can_keep((storage.foldername(name))[1]));
drop policy if exists customer_chops_objects_insert on storage.objects;
create policy customer_chops_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-chops' and public.chop_can_keep((storage.foldername(name))[1]));

create or replace function public.chop_save(p_customer text, p_path text, p_placement jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.customers where code = p_customer) then raise exception 'Customer not found.'; end if;
  if not public.chop_can_keep(p_customer) then raise exception 'You cannot keep a chop for this customer.' using errcode = '42501'; end if;
  if jsonb_typeof(p_placement) <> 'object' then raise exception 'The chop placement is not valid.'; end if;
  if left(coalesce(p_path, ''), length(p_customer) + 1) <> p_customer || '/' then raise exception 'The picture is not stored under this customer.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'customer-chops' and name = p_path) then raise exception 'The chop picture was not uploaded.'; end if;
  insert into public.customer_chops (customer_code, path, placement, updated_by, updated_by_name)
    values (p_customer, p_path, p_placement, (select auth.uid()), coalesce((select full_name from public.profiles where id = (select auth.uid())), ''))
    on conflict (customer_code) do update set path = excluded.path, placement = excluded.placement, updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name, updated_at = now();
end $$;

create or replace function public.chop_placement_save(p_customer text, p_placement jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.customers where code = p_customer) then raise exception 'Customer not found.'; end if;
  if not public.chop_can_keep(p_customer) then raise exception 'You cannot change the chop of this customer.' using errcode = '42501'; end if;
  if jsonb_typeof(p_placement) <> 'object' then raise exception 'The chop placement is not valid.'; end if;
  update public.customer_chops set placement = p_placement, updated_at = now() where customer_code = p_customer;
end $$;

create or replace function public.chop_remove(p_customer text) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.customers where code = p_customer) then raise exception 'Customer not found.'; end if;
  if not public.chop_can_keep(p_customer) then raise exception 'You cannot remove the chop of this customer.' using errcode = '42501'; end if;
  delete from public.customer_chops where customer_code = p_customer;
end $$;
