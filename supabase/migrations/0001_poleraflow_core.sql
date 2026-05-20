-- PoleraFlow core database for Nachito Store.
-- Run this in Supabase SQL Editor before connecting production data.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null check (category in ('Oversize', 'Regular', 'Personalizada')),
  web_category text not null default 'catalogo',
  description text not null default '',
  base_price numeric(10, 2) not null check (base_price >= 0),
  colors text[] not null default '{}',
  sizes text[] not null default '{}',
  image_url text,
  image_urls text[] not null default '{}',
  is_hidden boolean not null default false,
  is_sold_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  size text not null,
  color text not null,
  sku text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size, color)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  channel text not null default 'WhatsApp',
  address text,
  preferred_size text,
  preferred_color text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  order_type text not null check (order_type in ('Catálogo', 'Personalizada')),
  payment_status text not null default 'Pendiente',
  order_status text not null default 'Esperando pago',
  sales_channel text not null default 'WhatsApp',
  delivery_method text,
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  product_name text not null,
  size text,
  color text,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  line_total numeric(10, 2) generated always as (quantity * unit_price) stored,
  is_custom boolean not null default false,
  custom_description text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  status text not null default 'Pendiente',
  method text,
  proof_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  amount numeric(10, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  phone text not null,
  bot_active boolean not null default true,
  status text not null default 'Bot activo',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  source text not null default 'whatsapp',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_products_public on public.products (is_hidden, web_category, created_at desc);
create index if not exists idx_product_variants_product on public.product_variants (product_id);
create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_status on public.orders (order_status, payment_status);
create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_payments_order on public.payments (order_id);
create index if not exists idx_conversations_phone on public.conversations (phone);
create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at desc);

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_product_variants_updated_at on public.product_variants;
create trigger set_product_variants_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Public can read visible products" on public.products;
create policy "Public can read visible products"
on public.products
for select
to anon, authenticated
using (is_hidden = false);

drop policy if exists "Authenticated admins manage products" on public.products;
create policy "Authenticated admins manage products"
on public.products
for all
to authenticated
using (true)
with check (true);

-- Private business tables: service role can access them from Next.js API routes.
-- Later, when admin login is enabled, add authenticated policies per admin user.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Authenticated admins upload product images" on storage.objects;
create policy "Authenticated admins upload product images"
on storage.objects
for all
to authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');
