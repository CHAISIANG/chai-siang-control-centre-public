-- PAF claims: delivered invoices. The salesman types an invoice number; the database checks it is the salesman's own,
-- for the claim's customer, delivered and with a scanned POD. The app then copies that POD into the claim's files
-- (kind 'pod'), so the supervisor and Colgate see the proof of delivery with the claim.

alter table public.claim_files drop constraint if exists claim_files_kind_check;
alter table public.claim_files add constraint claim_files_kind_check check (kind in ('photo', 'document', 'pod'));
alter table public.claim_files
  add column if not exists invoice_no text,          -- for kind 'pod': the invoice it proves, without the SAP 101 prefix
  add column if not exists invoice_date date,
  add column if not exists invoice_amount numeric(14,2);
alter table public.claim_files add constraint claim_files_pod_has_invoice check (kind <> 'pod' or invoice_no is not null);
-- one POD per invoice on a claim
create unique index if not exists claim_files_pod_once on public.claim_files (claim_id, invoice_no) where kind = 'pod';

-- ---------- find a delivered invoice and its POD for a claim ----------
create or replace function public.claim_invoice_pod(p_doc text, p_customer text)
  returns table (doc_no text, doc_date date, amount numeric, pod_path text, pod_file text)
  language plpgsql stable security definer set search_path = '' as $$
declare j record; d text;
begin
  if not (public.has_perm('claims_create') or public.has_perm('claims_edit_draft') or public.has_perm('claims_approve')) then
    raise exception 'You cannot add invoices to claims.' using errcode = '42501';
  end if;
  d := regexp_replace(upper(btrim(coalesce(p_doc, ''))), '\s+', ' ', 'g');
  d := regexp_replace(d, '^101(?=S)', '');                  -- the delivery list keeps the SAP number 101S...; people type S...
  if d ~ '^B[ _-]?[0-9]{3,6}$' then d := 'B ' || substring(d from '[0-9]+'); end if;
  if d = '' then raise exception 'Type an invoice number.'; end if;
  select * into j from public.delivery_jobs x where x.doc_no in (d, '101' || d) limit 1;
  if not found then raise exception 'Invoice % is not in the delivery list.', d; end if;
  if not public.delivery_can_see(j.agent) then raise exception 'Invoice % is not one of your invoices.', d; end if;
  if j.customer is distinct from p_customer then raise exception 'Invoice % is for another customer, not the one on this claim.', d; end if;
  if j.status = 'Failed' then raise exception 'Invoice % failed delivery, so it has no signed POD.', d; end if;
  if j.status in ('Invoiced', 'Picked', 'Loaded') then raise exception 'Invoice % has not been delivered yet.', d; end if;
  if j.status <> 'Completed' or j.pod_path is null then raise exception 'Invoice % is delivered, but its signed POD is not scanned yet. Ask the warehouse to upload it.', d; end if;
  return query select d, j.doc_date, j.amount, j.pod_path, j.pod_file;
end $$;

revoke execute on function public.claim_invoice_pod(text, text) from public, anon;
grant execute on function public.claim_invoice_pod(text, text) to authenticated;
