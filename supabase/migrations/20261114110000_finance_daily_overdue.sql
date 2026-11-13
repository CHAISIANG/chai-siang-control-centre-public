-- Mark invoices overdue every day at 00:05 Malaysia time (16:05 UTC the day before).
create extension if not exists pg_cron;
select cron.schedule('fin-mark-overdue-daily', '5 16 * * *', $$select public.fin_mark_overdue()$$);
