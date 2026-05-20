create table if not exists public.base_garment_stock (
  id uuid primary key default gen_random_uuid(),
  color text not null,
  size text not null,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  min_stock integer not null default 1 check (min_stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (color, size)
);

drop trigger if exists set_base_garment_stock_updated_at on public.base_garment_stock;
create trigger set_base_garment_stock_updated_at
before update on public.base_garment_stock
for each row execute function public.set_updated_at();

insert into public.base_garment_stock (color, size, stock_quantity, min_stock) values
  ('Blanco arena', 'M', 2, 1),
  ('Blanco arena', 'L', 5, 1),
  ('Blanco arena', 'XL', 3, 1),
  ('Negro', 'M', 3, 1),
  ('Negro', 'L', 3, 1),
  ('Negro', 'XL', 2, 1)
on conflict (color, size) do update set
  stock_quantity = excluded.stock_quantity,
  min_stock = excluded.min_stock;
