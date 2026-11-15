-- Claim approval flow:
--   salesman submits -> supervisor checks -> Colgate (principal) gives the final approval -> finance marks Paid.
-- Salesmen and supervisors can edit, delete or pull back a claim until the next person has approved it.
-- Every step is written to a history log. Status can only change through claim_action(), never by a plain update.

-- ---------- statuses ----------
alter table public.claims drop constraint if exists claims_status_check;
update public.claims set status = case status
  when 'Approved' then 'Pending Colgate'
  when 'Sent to principal' then 'Pending Colgate'
  when 'Rejected' then 'Returned'
  else status end;
alter table public.claims add constraint claims_status_check
  check (status in ('Draft','Pending supervisor','Pending Colgate','Approved by Colgate','Paid','Returned'));

alter table public.claims
  add column if not exists salesman_name  text,
  add column if not exists principal_name text,
  add column if not exists principal_on   date;
update public.claims c set salesman_name = s.name from public.salesmen s where s.code = c.salesman_code and c.salesman_name is null;

-- ---------- the Colgate login role and the new permission ----------
insert into public.roles (name, label, is_system, is_super, sort) values ('principal', 'Colgate (principal)', true, false, 35)
  on conflict (name) do nothing;
insert into public.permissions (key, label, grp, sort) values
  ('claims_pay', 'Mark approved claims as Paid', 'Claims', 24)
  on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('principal', 'page_claims'),
  ('finance', 'claims_pay')
  on conflict do nothing;

-- ---------- history log ----------
create table if not exists public.claim_events (
  id            bigint generated always as identity primary key,
  claim_id      text not null,          -- no foreign key: the history stays after a claim is deleted
  at            timestamptz not null default now(),
  actor         uuid,
  actor_name    text,
  action        text not null,
  from_status   text,
  to_status     text,
  note          text,
  customer_name text,
  amount        numeric(14,2)
);
create index if not exists claim_events_claim_idx on public.claim_events (claim_id, at);
alter table public.claim_events enable row level security;
drop policy if exists claim_events_read on public.claim_events;
create policy claim_events_read on public.claim_events for select to authenticated
  using ((select public.has_perm('claims_approve')) or exists (select 1 from public.claims c where c.id = claim_id));
-- no insert / update / delete policy: only the functions below write to it

create or replace function public.claim_log(p_id text, p_action text, p_from text, p_to text, p_note text, p_customer text, p_amount numeric)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.claim_events (claim_id, actor, actor_name, action, from_status, to_status, note, customer_name, amount)
  values (p_id, (select auth.uid()), coalesce((select full_name from public.profiles where id = (select auth.uid())), 'System'), p_action, p_from, p_to, nullif(trim(p_note), ''), p_customer, p_amount);
end $$;
revoke execute on function public.claim_log(text, text, text, text, text, text, numeric) from public, anon, authenticated;

-- ---------- who may edit or delete ----------
-- Supervisor: until Colgate has approved. Salesman (own customers' claims only): until the supervisor has acted.
create or replace function public.claim_can_edit(p_status text, p_salesman text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select (public.has_perm('claims_approve') and p_status in ('Draft','Returned','Pending supervisor','Pending Colgate'))
      or (public.has_perm('claims_edit_draft') and public.in_scope(p_salesman) and p_status in ('Draft','Returned','Pending supervisor'))
$$;
revoke execute on function public.claim_can_edit(text, text) from public, anon;
grant  execute on function public.claim_can_edit(text, text) to authenticated;

-- ---------- claim policies ----------
drop policy if exists claims_read on public.claims;
drop policy if exists claims_insert on public.claims;
drop policy if exists claims_update on public.claims;
drop policy if exists claims_update_approve on public.claims;
drop policy if exists claims_update_edit on public.claims;
drop policy if exists claims_delete on public.claims;
drop policy if exists claim_files_read on public.claim_files;
drop policy if exists claim_files_write on public.claim_files;
drop policy if exists claim_files_delete on public.claim_files;
drop policy if exists claim_files_objects_read on storage.objects;
drop policy if exists claim_files_objects_insert on storage.objects;
drop policy if exists claim_files_objects_delete on storage.objects;

-- Colgate sees only claims the supervisor has approved, and nothing else.
create policy claims_read on public.claims for select to authenticated
  using (((select public.has_perm('page_claims')) and public.in_scope(salesman_code))
      or ((select public.my_role()) = 'principal' and status in ('Pending Colgate','Approved by Colgate','Paid')));
create policy claims_insert on public.claims for insert to authenticated
  with check ((select public.has_perm('claims_create')) and public.in_scope(salesman_code) and status = 'Draft');
create policy claims_update on public.claims for update to authenticated
  using ((select public.claim_can_edit(status, salesman_code)))
  with check ((select public.claim_can_edit(status, salesman_code)));
create policy claims_delete on public.claims for delete to authenticated
  using ((select public.claim_can_edit(status, salesman_code)));

create policy claim_files_read on public.claim_files for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy claim_files_write on public.claim_files for insert to authenticated
  with check (exists (select 1 from public.claims c where c.id = claim_id and public.claim_can_edit(c.status, c.salesman_code)));
create policy claim_files_delete on public.claim_files for delete to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id and public.claim_can_edit(c.status, c.salesman_code)));

create policy claim_files_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1]));
create policy claim_files_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1] and public.claim_can_edit(c.status, c.salesman_code)));
create policy claim_files_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'claim-files' and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1] and public.claim_can_edit(c.status, c.salesman_code)));

-- ---------- triggers: status moves only through claim_action, edits and deletes are logged ----------
create or replace function public.claims_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.claim_action', true), '') <> '1' then
    if new.status is distinct from old.status then
      raise exception 'A claim moves between steps only through the approval buttons' using errcode = '42501';
    end if;
    new.principal_name := old.principal_name;
    new.principal_on := old.principal_on;
    new.submitted_on := old.submitted_on;
  end if;
  return new;
end $$;
drop trigger if exists claims_guard on public.claims;
create trigger claims_guard before update on public.claims for each row execute function public.claims_guard();

create or replace function public.claims_log_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.claim_log(new.id, 'Created', null, new.status, null, new.customer_name, new.amount);
  elsif tg_op = 'DELETE' then
    perform public.claim_log(old.id, 'Deleted', old.status, null, null, old.customer_name, old.amount);
    return old;
  elsif coalesce(current_setting('app.claim_action', true), '') <> '1' and old.status <> 'Draft'
        and (old.form_values, old.amount, old.customer_name, old.remark, old.form_key) is distinct from (new.form_values, new.amount, new.customer_name, new.remark, new.form_key) then
    perform public.claim_log(new.id, 'Edited', old.status, new.status, null, new.customer_name, new.amount);
  end if;
  return new;
end $$;
revoke execute on function public.claims_guard() from public, anon, authenticated;
revoke execute on function public.claims_log_change() from public, anon, authenticated;
drop trigger if exists claims_log_change on public.claims;
create trigger claims_log_change after insert or update or delete on public.claims for each row execute function public.claims_log_change();

-- ---------- the approval steps ----------
-- submit | pull_back | supervisor_approve | return (note required) | principal_approve | mark_paid
create or replace function public.claim_action(p_id text, p_action text, p_note text default null) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  c public.claims%rowtype;
  to_s text;
  who text := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  label text;
  role_ text := public.my_role();
begin
  select * into c from public.claims where id = p_id for update;
  if not found then raise exception 'Claim not found'; end if;
  if not (((public.has_perm('page_claims') and public.in_scope(c.salesman_code))
        or (role_ = 'principal' and c.status in ('Pending Colgate','Approved by Colgate','Paid')))) then
    raise exception 'You cannot open this claim' using errcode = '42501';
  end if;

  if p_action = 'submit' and c.status in ('Draft','Returned') and public.claim_can_edit(c.status, c.salesman_code) then
    to_s := 'Pending supervisor'; label := 'Submitted to the supervisor';
  elsif p_action = 'pull_back' and c.status = 'Pending supervisor' and public.claim_can_edit(c.status, c.salesman_code) then
    to_s := 'Draft'; label := 'Pulled back to draft';
  elsif p_action = 'supervisor_approve' and c.status = 'Pending supervisor' and public.has_perm('claims_approve') then
    to_s := 'Pending Colgate'; label := 'Approved and sent to Colgate';
  elsif p_action = 'return' and ((c.status in ('Pending supervisor','Pending Colgate') and public.has_perm('claims_approve'))
                              or (c.status = 'Pending Colgate' and role_ = 'principal')) then
    if coalesce(trim(p_note), '') = '' then raise exception 'Write the reason for returning the claim'; end if;
    to_s := 'Returned'; label := 'Returned to the salesman';
  elsif p_action = 'principal_approve' and c.status = 'Pending Colgate' and role_ = 'principal' then
    to_s := 'Approved by Colgate'; label := 'Approved. Final approval given';
  elsif p_action = 'mark_paid' and c.status = 'Approved by Colgate' and public.has_perm('claims_pay') then
    to_s := 'Paid'; label := 'Marked as Paid';
  else
    raise exception 'That step is not allowed for this claim now' using errcode = '42501';
  end if;

  perform set_config('app.claim_action', '1', true);
  update public.claims set
    status = to_s, updated_at = now(),
    submitted_on = case when p_action = 'submit' then current_date else submitted_on end,
    principal_name = case when p_action = 'principal_approve' then who when p_action in ('return','pull_back') then null else principal_name end,
    principal_on   = case when p_action = 'principal_approve' then current_date when p_action in ('return','pull_back') then null else principal_on end
  where id = p_id;
  perform set_config('app.claim_action', '', true);
  perform public.claim_log(p_id, label, c.status, to_s, p_note, c.customer_name, c.amount);
  return to_s;
end $$;
revoke execute on function public.claim_action(text, text, text) from public, anon;
grant  execute on function public.claim_action(text, text, text) to authenticated;
