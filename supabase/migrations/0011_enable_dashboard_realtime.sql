do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'orders',
    'conversations',
    'customers',
    'expenses',
    'products',
    'base_garment_stock'
  ]
  loop
    if to_regclass(format('public.%I', realtime_table)) is not null then
      execute format('alter table public.%I replica identity full', realtime_table);

      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end if;
  end loop;
end $$;
