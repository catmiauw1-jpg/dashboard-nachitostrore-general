-- Seed current deployed PoleraFlow products into Supabase.
-- Source: https://admin-dhasboard.vercel.app/api/public/products
-- Run after 0001_poleraflow_core.sql.

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
  ('web-evoluci-n-meme', 'Evoluci?n-Meme', 'Oversize', 'meme', 'Polera oversize negra con dise?o &ldquo;Evoluci?n&rdquo;.', 145, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '/imported-products/web-evoluci-n-meme.png', false, false),
  ('web-negro-frente', 'Negro Frente', 'Oversize', 'catalogo', 'Base negra oversize con DTF frontal de alta calidad.', 145, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-arena-posterior', 'Arena Posterior', 'Oversize', 'catalogo', 'Estampado solo posterior con acabado resistente.', 155, array['Blanco arena']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-negro-posterior', 'Negro Posterior', 'Oversize', 'catalogo', 'Polera oversize negra con arte DTF en la espalda.', 155, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-diseno-arena', 'Diseño Arena', 'Oversize', 'catalogo', 'Base clara para frase, logo o arte personalizado.', 155, array['Blanco arena']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-diseno-negro', 'Diseño Negro', 'Oversize', 'catalogo', 'Arte personalizado sobre base negra con colores intensos.', 165, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-frente-posterior-arena', 'Frente + Posterior Arena', 'Oversize', 'catalogo', 'Estampado doble para una pieza más completa.', 170, array['Blanco arena']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-frente-posterior-negro', 'Frente + Posterior Negro', 'Oversize', 'catalogo', 'DTF frontal y posterior con planchado a presión profesional.', 175, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-arena-edicion-foto', 'Arena Edición Foto', 'Oversize', 'catalogo', 'Boceto para imagen, ilustración o gráfico grande.', 165, array['Blanco arena']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('web-negro-edicion-foto', 'Negro Edición Foto', 'Oversize', 'catalogo', 'Placeholder para un diseño especial del catálogo.', 165, array['Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('prod-oversize-hueso', 'Oversize blanco hueso', 'Oversize', 'catalogo', '', 160, array['Blanco hueso', 'Negro', 'Arena']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false),
  ('prod-negra-minimal', 'Polera negra minimal', 'Regular', 'catalogo', '', 130, array['Negro', 'Blanco']::text[], array['S', 'M', 'L']::text[], '', false, false),
  ('prod-regular-blanca', 'Regular blanco básico', 'Regular', 'catalogo', '', 120, array['Blanco', 'Negro']::text[], array['S', 'M', 'L', 'XL']::text[], '', false, false)
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
