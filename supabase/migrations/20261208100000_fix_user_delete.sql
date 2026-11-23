-- Deleting a login failed with "Database error deleting user": the guard that stops the super admin being deleted
-- runs as Supabase's auth service, which may not read public.profiles. Run the guard as its owner instead, so it can
-- look up whether the account is protected. The rule itself is unchanged.
create or replace function public.protect_auth_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = old.id and p.protected)
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'This account is protected and cannot be deleted.';
  end if;
  return old;
end;
$$;
revoke execute on function public.protect_auth_user() from public, anon, authenticated;
