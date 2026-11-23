-- Delivery exceptions keep their papers: the credit note, debit note, GRN, photos of the goods, or any other scan.
-- Files live in a private bucket in a folder per exception. Whoever may see the invoice may open them
-- (Logistics, Finance, management, the salesman for his own customers); people who update deliveries add them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('exception-docs', 'exception-docs', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
  on conflict (id) do nothing;

create table public.delivery_exception_docs (
  id            uuid primary key default gen_random_uuid(),
  exception_id  uuid not null references public.delivery_exceptions(id) on delete cascade,
  kind          text not null check (kind in ('Credit note','Debit note','GRN','Photo','Other')),
  number        text,
  file_name     text not null,
  path          text not null unique,
  by_name       text,
  at            date not null default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  check (kind not in ('Credit note','Debit note','GRN') or coalesce(btrim(number), '') <> '')
);
create index delivery_exception_docs_exc_idx on public.delivery_exception_docs (exception_id);
alter table public.delivery_exception_docs enable row level security;

/** Whether the signed-in person may see this exception (the same rule as its invoice). */
create or replace function public.exception_can_see(p_exception uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.delivery_exceptions e join public.delivery_jobs j on j.doc_no = e.doc_no
                 where e.id = p_exception and public.delivery_can_see(j.agent))
$$;
create policy delivery_exception_docs_read on public.delivery_exception_docs for select to authenticated using (public.exception_can_see(exception_id));

create policy exception_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'exception-docs' and public.exception_can_see(nullif((storage.foldername(name))[1], '')::uuid));
create policy exception_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exception-docs' and (select public.has_perm('delivery_update'))
              and exists (select 1 from public.delivery_exceptions e where e.id::text = (storage.foldername(name))[1]));

/**
 * Record papers already uploaded to the exception's folder. Each item: kind, number (needed for a credit note,
 * debit note or GRN), file (name) and path. The first numbered paper also fills the exception's note number if empty.
 */
create or replace function public.delivery_exception_docs_add(p_id uuid, p_docs jsonb) returns int language plpgsql security definer set search_path = '' as $$
declare x jsonb; n int := 0; v_kind text; v_no text; v_path text;
begin
  if not public.has_perm('delivery_update') then raise exception 'You cannot add documents to exceptions.' using errcode = '42501'; end if;
  if not exists (select 1 from public.delivery_exceptions where id = p_id) then raise exception 'That exception does not exist.'; end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) = 0 then raise exception 'Choose at least one photo or scan.'; end if;
  for x in select * from jsonb_array_elements(p_docs) loop
    n := n + 1;
    v_kind := x->>'kind'; v_no := nullif(btrim(coalesce(x->>'number', '')), ''); v_path := x->>'path';
    if v_kind not in ('Credit note','Debit note','GRN','Photo','Other') then raise exception 'Document %: choose what it is.', n; end if;
    if v_kind in ('Credit note','Debit note','GRN') and v_no is null then raise exception 'Document %: enter the % number.', n, v_kind; end if;
    if split_part(coalesce(v_path, ''), '/', 1) <> p_id::text then raise exception 'Document %: it is not in this exception''s folder.', n; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'exception-docs' and o.name = v_path) then raise exception 'Document % did not upload. Try again.', n; end if;
    insert into public.delivery_exception_docs (exception_id, kind, number, file_name, path, by_name)
      values (p_id, v_kind, v_no, coalesce(nullif(btrim(x->>'file'), ''), split_part(v_path, '/', 2)), v_path, public.delivery_who());
  end loop;
  update public.delivery_exceptions e set note_no = (select d.number from public.delivery_exception_docs d where d.exception_id = p_id and d.number is not null and d.kind <> 'Other' order by d.at, d.id limit 1)
    where e.id = p_id and coalesce(btrim(e.note_no), '') = '';
  return n;
end $$;

revoke execute on function public.exception_can_see(uuid) from public, anon;
grant execute on function public.exception_can_see(uuid) to authenticated;
revoke execute on function public.delivery_exception_docs_add(uuid, jsonb) from public, anon;
grant execute on function public.delivery_exception_docs_add(uuid, jsonb) to authenticated;
