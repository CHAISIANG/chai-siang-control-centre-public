-- Lock functions that only the database itself should run.
-- Supabase gives every new function to the signed-in role by default, so revoking from
-- "public, anon" alone left these callable from the app's API. The app never calls them;
-- other security-definer functions, triggers and the yearly job still run them as owner.
--   sap_batch_totals, delivery_batch_removed : trigger functions
--   delivery_move   : inner step of delivery_pick/load/deliver/fail/replan; called directly it
--                     could jump a job to any status (for example Completed with no POD scan)
--   hr_note, exp_notify_next : would let anyone post a notice with any text and link to anyone
--   hr_close_year   : the 31 Dec job; called early it would close the leave year
--   hr_carry_into, hr_balance : would show any employee's leave balance
do $$
declare f text;
begin
  foreach f in array array[
    'sap_batch_totals()',
    'delivery_batch_removed()',
    'delivery_move(text[],text,text,jsonb,text)',
    'hr_note(uuid,text,text)',
    'exp_notify_next(uuid)',
    'hr_close_year()',
    'hr_carry_into(uuid,int)',
    'hr_balance(uuid,text,int,boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
