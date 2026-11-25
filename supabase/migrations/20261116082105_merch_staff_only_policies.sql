-- Applied directly to the live database on 2026-11-16 and brought into the repo on 2026-11-24 from supabase_migrations.schema_migrations.
create or replace function public.merch_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active is not false and p.role in ('super_admin','supervisor'))
$$;
revoke all on function public.merch_is_staff() from public, anon;
grant execute on function public.merch_is_staff() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['merch_settings','merch_skus','merch_rates','merch_salesmen','merch_stores','merch_visits'] loop
    execute format('drop policy "signed-in users only" on public.%I', t);
    execute format('create policy "staff only" on public.%I for all to authenticated using (public.merch_is_staff()) with check (public.merch_is_staff())', t);
  end loop;
end $$;
