-- Credit approvals and reminders update on screen as soon as someone asks, decides or ticks. Row security still applies.
alter publication supabase_realtime add table public.credit_approvals, public.credit_reminders;
