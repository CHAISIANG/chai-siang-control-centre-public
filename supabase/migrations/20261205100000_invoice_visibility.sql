-- Who can follow an invoice to its scanned proof of delivery (POD):
-- Logistics and Finance see every invoice; Management, Directors and supervisors see every invoice;
-- a salesman sees only the invoices of his own customers. Changing a delivery still needs delivery_update.
-- Damaged stock stays with Logistics.

create or replace function public.delivery_can_see(p_agent text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select public.has_perm('page_logistics') or public.has_perm('page_finance')
      or (public.has_perm('page_customers') and coalesce(public.in_scope(p_agent), false))
$$;
revoke execute on function public.delivery_can_see(text) from public, anon;
grant  execute on function public.delivery_can_see(text) to authenticated;

drop policy if exists delivery_jobs_read on public.delivery_jobs;
create policy delivery_jobs_read on public.delivery_jobs for select to authenticated
  using (public.delivery_can_see(agent));

drop policy if exists delivery_events_read on public.delivery_events;
create policy delivery_events_read on public.delivery_events for select to authenticated
  using (exists (select 1 from public.delivery_jobs j where j.doc_no = delivery_events.doc_no and public.delivery_can_see(j.agent)));

drop policy if exists delivery_exceptions_read on public.delivery_exceptions;
create policy delivery_exceptions_read on public.delivery_exceptions for select to authenticated
  using (exists (select 1 from public.delivery_jobs j where j.doc_no = delivery_exceptions.doc_no and public.delivery_can_see(j.agent)));

-- the scans: whoever may see the invoice may open its scan
drop policy if exists pod_scans_read on storage.objects;
create policy pod_scans_read on storage.objects for select to authenticated
  using (bucket_id = 'pod-scans' and exists (select 1 from public.delivery_jobs j where j.doc_no = (storage.foldername(name))[1] and public.delivery_can_see(j.agent)));
