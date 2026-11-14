-- Usage log for the document reader. It records who used it, when, which model and how many tokens, never the document itself.
create table public.po_read_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('po','invoice')),
  model         text not null,
  ok            boolean not null,
  error         text,
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz not null default now()
);
create index po_read_log_user_day on public.po_read_log (user_id, created_at);
create index po_read_log_day on public.po_read_log (created_at);
alter table public.po_read_log enable row level security;
-- Only Finance managers can see the usage. Rows are written by the reader function itself (service role), never by the browser.
create policy po_read_log_read on public.po_read_log for select to authenticated using ((select public.has_perm('finance_manage')));
