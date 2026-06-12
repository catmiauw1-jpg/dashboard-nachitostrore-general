-- Harden public tables created after the initial schema.
-- Server routes use the service role, so these policies do not expose admin data.

alter table if exists public.base_garment_stock enable row level security;
alter table if exists public.api_rate_limits enable row level security;
alter table if exists public.webhook_events enable row level security;
alter table if exists public.bot_settings enable row level security;
alter table if exists public.bot_events enable row level security;
alter table if exists public.payment_requests enable row level security;

drop policy if exists "Public can read base garment stock" on public.base_garment_stock;
create policy "Public can read base garment stock"
on public.base_garment_stock
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins manage base garment stock" on public.base_garment_stock;
create policy "Authenticated admins manage base garment stock"
on public.base_garment_stock
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Service role manages api rate limits" on public.api_rate_limits;
create policy "Service role manages api rate limits"
on public.api_rate_limits
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages webhook events" on public.webhook_events;
create policy "Service role manages webhook events"
on public.webhook_events
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages bot settings" on public.bot_settings;
create policy "Service role manages bot settings"
on public.bot_settings
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages bot events" on public.bot_events;
create policy "Service role manages bot events"
on public.bot_events
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages payment requests" on public.payment_requests;
create policy "Service role manages payment requests"
on public.payment_requests
for all
to service_role
using (true)
with check (true);
