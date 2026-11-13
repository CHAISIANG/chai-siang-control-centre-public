-- Collections: reminder log details, editable reminder templates, collection notes, client language, auto-reminder switch.
-- Real emails are sent by the send-reminders edge function (Resend). Automatic reminders are OFF until someone switches them on.

alter table public.fin_clients
  add column language text not null default 'en' check (language in ('en','zh'));

alter table public.fin_invoices
  add column collection_notes text not null default '';

alter table public.fin_settings
  add column auto_reminders boolean not null default false,
  add column reminder_hour int not null default 9 check (reminder_hour between 0 and 23);

alter table public.fin_reminders alter column level drop not null;
alter table public.fin_reminders
  add column channel  text not null default 'email' check (channel in ('email','whatsapp')),
  add column template text,
  add column lang     text,
  add column subject  text,
  add column status   text not null default 'sent' check (status in ('sent','failed')),
  add column error    text,
  add column auto     boolean not null default false;

create table public.fin_reminder_templates (
  id         text primary key check (id in ('friendly','followup','firm','final')),
  sort       int not null,
  name       text not null,
  tone       text not null,
  when_text  text not null,
  from_day   int not null,
  to_day     int not null,
  en_subject text not null,
  en_body    text not null,
  zh_subject text not null,
  zh_body    text not null
);
alter table public.fin_reminder_templates enable row level security;
create policy fin_templates_read on public.fin_reminder_templates for select to authenticated using ((select public.has_perm('page_finance')));
create policy fin_templates_update on public.fin_reminder_templates for update to authenticated
  using ((select public.has_perm('finance_manage'))) with check ((select public.has_perm('finance_manage')));

insert into public.fin_reminder_templates (id, sort, name, tone, when_text, from_day, to_day, en_subject, en_body, zh_subject, zh_body) values
  ('friendly', 1, 'Friendly nudge', 'Warm, assumes it was missed', '1 to 14 days past due', 1, 14, 'Friendly reminder: invoice {invoice_no}', 'Dear {contact},

I hope you are well. Our records show that invoice {invoice_no} for {amount}, due on {due_date}, is still open.

If you have already paid, please ignore this note and send us the transfer slip so we can update our records. If not, we would appreciate payment at your convenience.

Thank you for your continued support.

{company}', '温馨提醒：发票 {invoice_no}', '{contact} 您好，

希望您一切顺利。我们的记录显示，发票 {invoice_no}（金额 {amount}，到期日 {due_date}）目前仍未付款。

如您已经付款，请忽略此信息，并把转账凭证发给我们以便更新记录；如尚未付款，烦请尽快安排。

感谢您一直以来的支持。

{company}'),
  ('followup', 2, 'Polite follow-up', 'Courteous, asks for a date', '15 to 30 days past due', 15, 30, 'Follow-up: invoice {invoice_no} is {days_overdue} days overdue', 'Dear {contact},

We wrote earlier about invoice {invoice_no} for {amount}, which fell due on {due_date} and is now {days_overdue} days overdue.

Could you please let us know when we can expect payment? If there is a problem with the invoice or delivery, tell us and we will sort it out right away.

Thank you.

{company}', '跟进：发票 {invoice_no} 已逾期 {days_overdue} 天', '{contact} 您好，

我们之前曾就发票 {invoice_no}（金额 {amount}，到期日 {due_date}）与您联系，目前已逾期 {days_overdue} 天。

请告知预计付款日期。如发票或送货有任何问题，请及时告诉我们，我们会马上处理。

谢谢。

{company}'),
  ('firm', 3, 'Firm notice', 'Direct, sets a deadline', '31 to 60 days past due', 31, 60, 'Overdue notice: invoice {invoice_no} ({amount})', 'Dear {contact},

Invoice {invoice_no} for {amount} was due on {due_date} and is now {days_overdue} days overdue. Despite our earlier reminders we have not received payment.

Please settle the full amount within 7 days of this notice. Until then, new orders may be placed on hold.

If you have already paid, send us the proof of payment today.

{company}', '逾期通知：发票 {invoice_no}（{amount}）', '{contact} 您好，

发票 {invoice_no}（金额 {amount}）已于 {due_date} 到期，现已逾期 {days_overdue} 天。虽经多次提醒，我们仍未收到款项。

请于收到本通知后 7 天内结清全部款项。在此之前，新订单可能会暂缓处理。

如已付款，请今天把付款凭证发给我们。

{company}'),
  ('final', 4, 'Final demand', 'Formal, states next steps', 'Over 60 days past due', 61, 9999, 'FINAL DEMAND: invoice {invoice_no} ({amount})', 'Dear {contact},

Invoice {invoice_no} for {amount} was due on {due_date} and is now {days_overdue} days overdue. This is our final demand.

If payment in full is not received within 7 days, we will suspend your account and may refer the matter for recovery, which could add costs to you.

To discuss a payment arrangement, contact us immediately.

{company}', '最后通知：发票 {invoice_no}（{amount}）', '{contact} 您好，

发票 {invoice_no}（金额 {amount}）已于 {due_date} 到期，现已逾期 {days_overdue} 天。这是我们的最后通知。

如 7 天内仍未收到全额款项，我们将暂停您的账户，并可能转交追讨，由此产生的费用或由您承担。

如需商讨付款安排，请立即与我们联系。

{company}');

-- Needed to call the edge function from the daily schedule (the schedule itself is created separately, because it holds a secret).
create extension if not exists pg_net with schema extensions;
