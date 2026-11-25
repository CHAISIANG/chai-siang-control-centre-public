-- The document reader also reads scanned POD pages (kind 'pod'). Its usage log has to accept that kind.
alter table public.po_read_log drop constraint po_read_log_kind_check;
alter table public.po_read_log add constraint po_read_log_kind_check check (kind in ('po', 'invoice', 'pod'));
