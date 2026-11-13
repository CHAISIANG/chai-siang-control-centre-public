-- Small key/value settings that must not live in the code, for example the company line printed at the top of PAF claim forms.
-- Anyone who can open claims may read them. They are changed by the database owner (SQL editor), never from the app.
create table public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to authenticated
  using ((select public.has_perm('page_claims')));
