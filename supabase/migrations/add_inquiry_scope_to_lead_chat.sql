alter table public.lead_chat_messages
  add column if not exists inquiry_id uuid null references public.lead_inquiries(id) on delete cascade;

create index if not exists idx_lead_chat_messages_inquiry_id_created_at
  on public.lead_chat_messages(inquiry_id, created_at asc);

alter table public.lead_chat_notifications
  add column if not exists inquiry_id uuid null references public.lead_inquiries(id) on delete cascade;

create index if not exists idx_lead_chat_notifications_inquiry_id
  on public.lead_chat_notifications(inquiry_id, created_at desc);
