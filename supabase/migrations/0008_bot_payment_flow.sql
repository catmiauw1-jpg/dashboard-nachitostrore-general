-- Bot and payment-flow enhancements for Nachito Store.
-- This migration extends the existing PoleraFlow schema instead of creating
-- duplicate Spanish tables such as pedidos/conversaciones/mensajes.

alter table public.conversations
  add column if not exists bot_stage text,
  add column if not exists bot_paused_reason text,
  add column if not exists waflow_contact_id text,
  add column if not exists waflow_location_id text,
  add column if not exists chatwoot_conversation_id text,
  add column if not exists last_inbound_message_id text,
  add column if not exists messages_processed jsonb not null default '[]'::jsonb,
  add column if not exists payment_flow jsonb not null default '{}'::jsonb;

alter table public.orders
  add column if not exists bot_stage text,
  add column if not exists bot_conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists payment_choice text check (payment_choice is null or payment_choice in ('50%', 'completo')),
  add column if not exists payment_amount_due numeric(10, 2) check (payment_amount_due is null or payment_amount_due >= 0),
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists payment_qr_url text,
  add column if not exists payment_checkout_url text,
  add column if not exists payment_proof_urls text[] not null default '{}',
  add column if not exists payment_verified_at timestamptz,
  add column if not exists requires_manual_review boolean not null default false,
  add column if not exists custom_details jsonb not null default '{}'::jsonb;

alter table public.payments
  add column if not exists provider text,
  add column if not exists provider_payment_id text,
  add column if not exists qr_url text,
  add column if not exists checkout_url text,
  add column if not exists verification_payload jsonb not null default '{}'::jsonb,
  add column if not exists payment_choice text check (payment_choice is null or payment_choice in ('50%', 'completo'));

create table if not exists public.bot_settings (
  key text primary key,
  value text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null,
  previous_stage text,
  next_stage text,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'bot',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null default 'manual_pending_gateway',
  status text not null default 'pending',
  payment_choice text not null check (payment_choice in ('50%', 'completo')),
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'BOB',
  qr_url text,
  checkout_url text,
  external_reference text,
  proof_url text,
  verification_payload jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_bot_stage on public.conversations (bot_stage);
create index if not exists idx_conversations_waflow_contact on public.conversations (waflow_contact_id);
create index if not exists idx_conversations_chatwoot_conversation on public.conversations (chatwoot_conversation_id);
create index if not exists idx_orders_bot_conversation on public.orders (bot_conversation_id);
create index if not exists idx_orders_review on public.orders (requires_manual_review) where requires_manual_review = true;
create index if not exists idx_bot_events_conversation on public.bot_events (conversation_id, created_at desc);
create index if not exists idx_bot_events_order on public.bot_events (order_id, created_at desc);
create index if not exists idx_payment_requests_order on public.payment_requests (order_id, requested_at desc);
create index if not exists idx_payment_requests_conversation on public.payment_requests (conversation_id, requested_at desc);
create index if not exists idx_payment_requests_status on public.payment_requests (status, requested_at desc);

drop trigger if exists set_bot_settings_updated_at on public.bot_settings;
create trigger set_bot_settings_updated_at
before update on public.bot_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_requests_updated_at on public.payment_requests;
create trigger set_payment_requests_updated_at
before update on public.payment_requests
for each row execute function public.set_updated_at();

alter table public.bot_settings enable row level security;
alter table public.bot_events enable row level security;
alter table public.payment_requests enable row level security;

insert into public.bot_settings (key, value, notes)
values
  ('bot_global_active', 'true', 'Global kill switch for the WhatsApp bot.'),
  ('store_url', 'https://nachitostore.vercel.app', 'Public store URL sent when a customer writes before ordering.'),
  ('payment_gateway_enabled', 'false', 'Set to true when PagosBolivia/Banco Economico integration is ready.'),
  ('payment_provider', 'manual_pending_gateway', 'Future provider value: pagosbolivia or banco_economico.'),
  ('payment_manual_message', 'Te pasaremos el QR para pagar. Cuando pagues, envia el comprobante.', 'Temporary message while automatic QR is not connected.'),
  ('payment_qr_placeholder_url', '', 'Future QR image URL or signed URL. Keep empty until gateway is connected.')
on conflict (key) do update
set value = excluded.value,
    notes = excluded.notes,
    updated_at = now();

insert into storage.buckets (id, name, public)
values
  ('payment-proofs', 'payment-proofs', false),
  ('order-references', 'order-references', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Authenticated admins manage payment proofs" on storage.objects;
create policy "Authenticated admins manage payment proofs"
on storage.objects
for all
to authenticated
using (bucket_id = 'payment-proofs')
with check (bucket_id = 'payment-proofs');

drop policy if exists "Public can read order references" on storage.objects;
create policy "Public can read order references"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'order-references');

drop policy if exists "Authenticated admins manage order references" on storage.objects;
create policy "Authenticated admins manage order references"
on storage.objects
for all
to authenticated
using (bucket_id = 'order-references')
with check (bucket_id = 'order-references');

create or replace view public.dashboard_bot_payment_queue as
select
  pr.id as payment_request_id,
  pr.status as payment_request_status,
  pr.payment_choice,
  pr.amount,
  pr.currency,
  pr.provider,
  pr.qr_url,
  pr.checkout_url,
  pr.proof_url,
  pr.requested_at,
  pr.verified_at,
  o.id as order_id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.order_type,
  o.payment_status,
  o.order_status,
  o.requires_manual_review,
  c.id as conversation_id,
  c.bot_active,
  c.bot_stage,
  c.chatwoot_conversation_id
from public.payment_requests pr
left join public.orders o on o.id = pr.order_id
left join public.conversations c on c.id = pr.conversation_id
order by pr.requested_at desc;

comment on table public.payment_requests is 'Payment attempts created by the bot. Ready for a future QR/payment gateway integration.';
comment on table public.bot_settings is 'Editable bot configuration. The bot can read these values without code changes.';
comment on view public.dashboard_bot_payment_queue is 'Dashboard-ready queue for QR/payment proof review and future gateway verification.';
