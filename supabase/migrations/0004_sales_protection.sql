-- Production safety helpers for Nachito Store web orders.

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_api_rate_limits_reset_at on public.api_rate_limits (reset_at);

create or replace function public.check_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  delete from public.api_rate_limits where reset_at < v_now - interval '10 minutes';

  insert into public.api_rate_limits (bucket_key, request_count, reset_at, updated_at)
  values (p_bucket_key, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  on conflict (bucket_key) do update
    set request_count =
      case
        when public.api_rate_limits.reset_at <= v_now then 1
        else public.api_rate_limits.request_count + 1
      end,
      reset_at =
      case
        when public.api_rate_limits.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
        else public.api_rate_limits.reset_at
      end,
      updated_at = v_now
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

create or replace function public.reserve_base_garment_stock(
  p_color text,
  p_size text,
  p_quantity integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quantity integer := greatest(1, coalesce(p_quantity, 1));
begin
  update public.base_garment_stock
  set stock_quantity = stock_quantity - v_quantity,
      updated_at = now()
  where lower(trim(color)) = lower(trim(p_color))
    and lower(trim(size)) = lower(trim(p_size))
    and stock_quantity >= v_quantity;

  return found;
end;
$$;

create or replace function public.adjust_base_garment_stock(
  p_color text,
  p_size text,
  p_delta integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.base_garment_stock
  set stock_quantity = greatest(0, stock_quantity + coalesce(p_delta, 0)),
      updated_at = now()
  where lower(trim(color)) = lower(trim(p_color))
    and lower(trim(size)) = lower(trim(p_size));

  return found;
end;
$$;
