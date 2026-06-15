-- Restrict direct Supabase access to PoleraFlow admins.
-- Server APIs continue using the service role; this protects browser/realtime access.

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

insert into public.admin_users (email)
values ('mateoclaros31@gmail.com')
on conflict (email) do nothing;

create or replace function public.is_poleraflow_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_poleraflow_admin() from public;
grant execute on function public.is_poleraflow_admin() to authenticated;

drop policy if exists "Service role manages admin users" on public.admin_users;
create policy "Service role manages admin users"
on public.admin_users
for all
to service_role
using (true)
with check (true);

drop policy if exists "PoleraFlow admins read admin users" on public.admin_users;
create policy "PoleraFlow admins read admin users"
on public.admin_users
for select
to authenticated
using (public.is_poleraflow_admin());

drop policy if exists "Authenticated admins manage products" on public.products;
drop policy if exists "PoleraFlow admins manage products" on public.products;
create policy "PoleraFlow admins manage products"
on public.products
for all
to authenticated
using (public.is_poleraflow_admin())
with check (public.is_poleraflow_admin());

drop policy if exists "Authenticated admins manage base garment stock" on public.base_garment_stock;
drop policy if exists "PoleraFlow admins manage base garment stock" on public.base_garment_stock;
create policy "PoleraFlow admins manage base garment stock"
on public.base_garment_stock
for all
to authenticated
using (public.is_poleraflow_admin())
with check (public.is_poleraflow_admin());

drop policy if exists "PoleraFlow admins read customers" on public.customers;
create policy "PoleraFlow admins read customers"
on public.customers
for select
to authenticated
using (public.is_poleraflow_admin());

drop policy if exists "PoleraFlow admins read orders" on public.orders;
create policy "PoleraFlow admins read orders"
on public.orders
for select
to authenticated
using (public.is_poleraflow_admin());

drop policy if exists "PoleraFlow admins read expenses" on public.expenses;
create policy "PoleraFlow admins read expenses"
on public.expenses
for select
to authenticated
using (public.is_poleraflow_admin());

drop policy if exists "PoleraFlow admins read conversations" on public.conversations;
create policy "PoleraFlow admins read conversations"
on public.conversations
for select
to authenticated
using (public.is_poleraflow_admin());

drop policy if exists "PoleraFlow admins read order items" on public.order_items;
create policy "PoleraFlow admins read order items"
on public.order_items
for select
to authenticated
using (public.is_poleraflow_admin());

drop policy if exists "PoleraFlow admins read messages" on public.messages;
create policy "PoleraFlow admins read messages"
on public.messages
for select
to authenticated
using (public.is_poleraflow_admin());
