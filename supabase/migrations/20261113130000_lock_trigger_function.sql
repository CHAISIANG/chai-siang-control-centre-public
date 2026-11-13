-- The signup trigger function must not be callable through the API by signed-in users.
revoke execute on function public.handle_new_user() from authenticated;
