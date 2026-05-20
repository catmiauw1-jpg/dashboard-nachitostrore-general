-- Seed real Nachito Store catalog products into Supabase.
-- Excludes template/mockup products used only for custom-order examples.

insert into public.products (
  id,
  name,
  category,
  web_category,
  description,
  base_price,
  colors,
  sizes,
  image_url,
  is_hidden,
  is_sold_out
) values
  ('web-tokyo-ghoul-kaneki', 'Tokyo Ghoul - Kaneki', 'Oversize', 'anime', 'Polera oversize de anime "Tokyo Ghoul".', 175, array['Blanco arena']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-tokyo-ghoul-kaneki.png', false, false),
  ('web-dennis-rodman', 'Dennis Rodman', 'Oversize', 'basket', 'Polera oversize de basket "Dennis Rodman".', 180, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-dennis-rodman.png', false, false),
  ('web-anthony-edwards', 'Anthony Edwards', 'Oversize', 'basket', 'Polera oversize de basket "Anthony Edwards".', 165, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-anthony-edwards.png', false, false),
  ('web-forever-kobe', 'Forever Kobe', 'Oversize', 'basket', 'Polera oversize de basket "Forever Kobe".', 165, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-forever-kobe.png', false, false),
  ('web-iverson-vs-kobe', 'Iverson vs Kobe', 'Oversize', 'basket', 'Polera oversize de basket "Iverson vs Kobe".', 165, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-iverson-vs-kobe.png', false, false),
  ('web-arizona-silhouette-streetwear', 'Arizona Silhouette Streetwear', 'Oversize', 'streetwear', 'Polera oversize streetwear "Arizona Silhouette Streetwear".', 165, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-arizona-silhouette-streetwear.png', false, false),
  ('web-new-start-anime-streetwear', 'New Start Anime Streetwear', 'Oversize', 'streetwear', 'Polera oversize streetwear "New Start Anime Streetwear".', 165, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-new-start-anime-streetwear.png', false, false),
  ('web-three-aesthetic-cats', 'Three Aesthetic Cats', 'Oversize', 'gatos', 'Polera oversize de gatos "Three Aesthetic Cats".', 145, array['Blanco arena']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-three-aesthetic-cats.png', false, false),
  ('web-cat-with-guitar', 'Cat with Guitar', 'Oversize', 'gatos', 'Polera oversize de gatos "Cat with Guitar".', 145, array['Blanco arena']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-cat-with-guitar.png', false, false),
  ('web-evolucion-meme', 'Evolucion-Meme', 'Oversize', 'meme', 'Polera oversize negra con diseno "Evolucion".', 145, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-evolucion-meme.png', false, false)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  web_category = excluded.web_category,
  description = excluded.description,
  base_price = excluded.base_price,
  colors = excluded.colors,
  sizes = excluded.sizes,
  image_url = excluded.image_url,
  is_hidden = excluded.is_hidden,
  is_sold_out = excluded.is_sold_out;
