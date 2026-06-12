-- AI-assisted payment verification audit tables.
-- The bot still requires a Mercantil email plus customer proof before auto-confirming.

create table if not exists public.mercantil_payment_emails (
  id uuid primary key default gen_random_uuid(),
  email_id text unique,
  amount numeric(10, 2) not null check (amount >= 0),
  payer_name text,
  concept text,
  notification_number text,
  transaction_at_text text,
  email_timestamp text,
  body text not null,
  match_status text not null default 'unmatched',
  matched_payment_request_id uuid references public.payment_requests(id) on delete set null,
  match_reason text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mercantil_payment_emails_amount on public.mercantil_payment_emails (amount, received_at desc);
create index if not exists idx_mercantil_payment_emails_status on public.mercantil_payment_emails (match_status, received_at desc);

drop trigger if exists set_mercantil_payment_emails_updated_at on public.mercantil_payment_emails;
create trigger set_mercantil_payment_emails_updated_at
before update on public.mercantil_payment_emails
for each row execute function public.set_updated_at();

alter table public.mercantil_payment_emails enable row level security;

drop policy if exists "Service role manages mercantil payment emails" on public.mercantil_payment_emails;
create policy "Service role manages mercantil payment emails"
on public.mercantil_payment_emails
for all
to service_role
using (true)
with check (true);

comment on table public.mercantil_payment_emails is 'Mercantil email notifications used by the AI-assisted verifier. No public access.';
