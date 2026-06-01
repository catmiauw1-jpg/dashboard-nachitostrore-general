-- Idempotency table for external WhatsApp/Waflow webhooks.
-- Prevents duplicated bot replies when the provider sends the same event twice.

create table if not exists public.webhook_events (
  event_key text primary key,
  provider text not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_webhook_events_received_at on public.webhook_events (received_at);

alter table public.webhook_events enable row level security;
