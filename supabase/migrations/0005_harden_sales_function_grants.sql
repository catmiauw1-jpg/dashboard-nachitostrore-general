revoke execute on function public.check_api_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.reserve_base_garment_stock(text, text, integer) from public, anon, authenticated;
revoke execute on function public.adjust_base_garment_stock(text, text, integer) from public, anon, authenticated;

grant execute on function public.check_api_rate_limit(text, integer, integer) to service_role;
grant execute on function public.reserve_base_garment_stock(text, text, integer) to service_role;
grant execute on function public.adjust_base_garment_stock(text, text, integer) to service_role;
