alter table public.messages
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text not null default 'local',
  add column if not exists delivery_error text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

create index if not exists idx_messages_provider_message_id
on public.messages (provider_message_id)
where provider_message_id is not null;

create index if not exists idx_messages_delivery_status
on public.messages (delivery_status, created_at desc);
