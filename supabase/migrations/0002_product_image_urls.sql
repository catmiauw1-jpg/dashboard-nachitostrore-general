alter table public.products
  add column if not exists image_urls text[] not null default '{}';

update public.products
set image_urls = array[image_url]
where image_url is not null
  and image_url <> ''
  and coalesce(array_length(image_urls, 1), 0) = 0;
