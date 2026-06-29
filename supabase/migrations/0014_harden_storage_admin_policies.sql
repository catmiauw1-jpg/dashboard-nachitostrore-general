-- Limit direct Storage writes to the allow-listed PoleraFlow administrators.
-- Server routes use the service role and are not affected by these policies.

drop policy if exists "Authenticated admins upload product images" on storage.objects;
drop policy if exists "PoleraFlow admins manage product images" on storage.objects;
create policy "PoleraFlow admins manage product images"
on storage.objects
for all
to authenticated
using (bucket_id = 'product-images' and public.is_poleraflow_admin())
with check (bucket_id = 'product-images' and public.is_poleraflow_admin());

drop policy if exists "Authenticated admins manage payment proofs" on storage.objects;
drop policy if exists "PoleraFlow admins manage payment proofs" on storage.objects;
create policy "PoleraFlow admins manage payment proofs"
on storage.objects
for all
to authenticated
using (bucket_id = 'payment-proofs' and public.is_poleraflow_admin())
with check (bucket_id = 'payment-proofs' and public.is_poleraflow_admin());

drop policy if exists "Authenticated admins manage order references" on storage.objects;
drop policy if exists "PoleraFlow admins manage order references" on storage.objects;
create policy "PoleraFlow admins manage order references"
on storage.objects
for all
to authenticated
using (bucket_id = 'order-references' and public.is_poleraflow_admin())
with check (bucket_id = 'order-references' and public.is_poleraflow_admin());

do $$
begin
  alter table public.order_items replica identity full;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    execute 'alter publication supabase_realtime add table public.order_items';
  end if;
end $$;
insert into storage.buckets (id, name, public)
values ('order-references', 'order-references', false)
on conflict (id) do update set public = false;

drop policy if exists "Public can read order references" on storage.objects;
drop policy if exists "Public reads order references" on storage.objects;
