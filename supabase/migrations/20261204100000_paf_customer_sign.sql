-- PAF claims: the customer's chop (kept per customer) and the customer's signature, taken on the salesman's phone.
-- A claim cannot go to the supervisor, or from the supervisor to Colgate, without the customer's chop and signature.
-- Changing the claim after the customer signed clears the signature. The signature can only be set through claim_sign().

-- ---------- the chop library: one chop per customer ----------
create table public.customer_chops (
  customer_code   text primary key references public.customers (code) on delete cascade,
  path            text not null,            -- the picture in the private customer-chops bucket
  placement       jsonb not null,           -- where it sat the last time: {x, y, size, rot, white, ink}
  updated_by      uuid,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
alter table public.customer_chops enable row level security;
create policy customer_chops_read on public.customer_chops for select to authenticated
  using ((select public.has_perm('page_claims')) and exists (select 1 from public.customers c where c.code = customer_code and public.in_scope(c.salesman_code)));
-- no write policies: changes only through the functions below

-- ---------- what the customer signed, on the claim ----------
alter table public.claims
  add column sign_required        boolean not null default true,
  add column sign_signature_path  text,
  add column sign_chop_path       text,
  add column sign_chop_placement  jsonb,
  add column signer_name          text,
  add column signed_at            timestamptz,
  add column signed_by_name       text;
-- claims already sent on for approval were chopped on paper: they do not need the new signature
update public.claims set sign_required = false where status not in ('Draft','Returned');

-- sign columns are never written directly, and a claim made by a direct insert never starts signed
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
  if coalesce(current_setting('app.claim_sign', true), '') <> '1' then
    new.sign_required := old.sign_required;
    new.sign_signature_path := old.sign_signature_path; new.sign_chop_path := old.sign_chop_path; new.sign_chop_placement := old.sign_chop_placement;
    new.signer_name := old.signer_name; new.signed_at := old.signed_at; new.signed_by_name := old.signed_by_name;
    -- the claim changed after the customer signed: the signature no longer counts
    if old.signed_at is not null and (old.form_values, old.customer_name, old.customer_code, old.form_key) is distinct from (new.form_values, new.customer_name, new.customer_code, new.form_key) then
      new.sign_signature_path := null; new.sign_chop_path := null; new.sign_chop_placement := null;
      new.signer_name := null; new.signed_at := null; new.signed_by_name := null;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.claims_guard() from public, anon, authenticated;

create or replace function public.claims_sign_insert_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  new.sign_required := true;
  new.sign_signature_path := null; new.sign_chop_path := null; new.sign_chop_placement := null;
  new.signer_name := null; new.signed_at := null; new.signed_by_name := null;
  return new;
end $$;
revoke execute on function public.claims_sign_insert_guard() from public, anon, authenticated;
drop trigger if exists claims_sign_insert_guard on public.claims;
create trigger claims_sign_insert_guard before insert on public.claims for each row execute function public.claims_sign_insert_guard();

-- ---------- private files ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('customer-chops', 'customer-chops', false, 2097152, array['image/png','image/jpeg'])
  on conflict (id) do nothing;
create policy customer_chops_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'customer-chops' and public.has_perm('page_claims')
         and exists (select 1 from public.customers c where c.code = (storage.foldername(name))[1] and public.in_scope(c.salesman_code)));
create policy customer_chops_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-chops' and public.has_perm('page_claims')
         and exists (select 1 from public.customers c where c.code = (storage.foldername(name))[1] and public.in_scope(c.salesman_code)));
-- the signature and the chop copy on a claim live in the existing claim-files bucket, under the claim's folder,
-- so whoever may see the claim (the supervisor, Colgate) sees them too.

-- ---------- keep a customer's chop ----------
create or replace function public.chop_save(p_customer text, p_path text, p_placement jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * into c from public.customers where code = p_customer;
  if not found then raise exception 'Customer not found.'; end if;
  if not (public.has_perm('page_claims') and public.in_scope(c.salesman_code)) then raise exception 'You cannot keep a chop for this customer.' using errcode = '42501'; end if;
  if jsonb_typeof(p_placement) <> 'object' then raise exception 'The chop placement is not valid.'; end if;
  if left(coalesce(p_path, ''), length(p_customer) + 1) <> p_customer || '/' then raise exception 'The picture is not stored under this customer.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'customer-chops' and name = p_path) then raise exception 'The chop picture was not uploaded.'; end if;
  insert into public.customer_chops (customer_code, path, placement, updated_by, updated_by_name)
    values (p_customer, p_path, p_placement, (select auth.uid()), coalesce((select full_name from public.profiles where id = (select auth.uid())), ''))
    on conflict (customer_code) do update set path = excluded.path, placement = excluded.placement, updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name, updated_at = now();
end $$;
create or replace function public.chop_placement_save(p_customer text, p_placement jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * into c from public.customers where code = p_customer;
  if not found then raise exception 'Customer not found.'; end if;
  if not (public.has_perm('page_claims') and public.in_scope(c.salesman_code)) then raise exception 'You cannot change the chop of this customer.' using errcode = '42501'; end if;
  if jsonb_typeof(p_placement) <> 'object' then raise exception 'The chop placement is not valid.'; end if;
  update public.customer_chops set placement = p_placement, updated_at = now() where customer_code = p_customer;
end $$;
create or replace function public.chop_remove(p_customer text) returns void
  language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * into c from public.customers where code = p_customer;
  if not found then raise exception 'Customer not found.'; end if;
  if not (public.has_perm('page_claims') and public.in_scope(c.salesman_code)) then raise exception 'You cannot remove the chop of this customer.' using errcode = '42501'; end if;
  delete from public.customer_chops where customer_code = p_customer;
end $$;

-- ---------- the customer signs ----------
create or replace function public.claim_sign(p_id text, p_signature_path text, p_chop_path text, p_placement jsonb, p_signer text) returns void
  language plpgsql security definer set search_path = '' as $$
declare c public.claims%rowtype; who text := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
begin
  select * into c from public.claims where id = p_id for update;
  if not found then raise exception 'Claim not found'; end if;
  if not (public.has_perm('page_claims') and public.in_scope(c.salesman_code) and public.claim_can_edit(c.status, c.salesman_code)) then raise exception 'You cannot sign this claim now.' using errcode = '42501'; end if;
  if coalesce(btrim(p_signer), '') = '' then raise exception 'Enter the customer''s name.'; end if;
  if jsonb_typeof(p_placement) <> 'object' then raise exception 'The chop placement is not valid.'; end if;
  if left(coalesce(p_signature_path, ''), length(p_id) + 1) <> p_id || '/' or left(coalesce(p_chop_path, ''), length(p_id) + 1) <> p_id || '/' then raise exception 'The files are not stored under this claim.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'claim-files' and name = p_signature_path) then raise exception 'The signature was not uploaded.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'claim-files' and name = p_chop_path) then raise exception 'The chop was not uploaded.'; end if;
  perform set_config('app.claim_sign', '1', true);
  update public.claims set sign_signature_path = p_signature_path, sign_chop_path = p_chop_path, sign_chop_placement = p_placement,
    signer_name = btrim(p_signer), signed_at = now(), signed_by_name = who, updated_at = now() where id = p_id;
  perform set_config('app.claim_sign', '', true);
  perform public.claim_log(p_id, 'Customer signed', c.status, c.status, btrim(p_signer), c.customer_name, c.amount);
end $$;

-- ---------- the rule: no step forward without the customer's chop and signature ----------
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
  if p_action in ('submit', 'supervisor_approve') and c.sign_required and (c.signed_at is null or c.sign_signature_path is null or c.sign_chop_path is null) then
    raise exception 'The customer must sign the claim first, with their chop and signature.';
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

-- ---------- function access ----------
revoke execute on function public.chop_save(text, text, jsonb), public.chop_placement_save(text, jsonb), public.chop_remove(text), public.claim_sign(text, text, text, jsonb, text) from public, anon;
grant  execute on function public.chop_save(text, text, jsonb), public.chop_placement_save(text, jsonb), public.chop_remove(text), public.claim_sign(text, text, text, jsonb, text) to authenticated;
revoke execute on function public.claim_action(text, text, text) from public, anon;
grant  execute on function public.claim_action(text, text, text) to authenticated;
