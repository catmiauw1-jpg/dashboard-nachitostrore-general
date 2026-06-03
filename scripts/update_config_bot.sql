-- Bot configuration values.
-- Run after migration 0008_bot_payment_flow.sql if you need to update defaults.

insert into public.bot_settings (key, value, notes)
values
  ('bot_global_active', 'true', 'Global kill switch for the WhatsApp bot.'),
  ('store_url', 'https://nachitostore.vercel.app', 'Public store URL sent when a customer writes before ordering.'),
  ('payment_gateway_enabled', 'false', 'Set to true after the payment provider is connected.'),
  ('payment_provider', 'manual_pending_gateway', 'Future value: pagosbolivia or banco_economico.'),
  ('payment_manual_message', 'Te pasaremos el QR para pagar. Cuando pagues, envia el comprobante.', 'Temporary payment copy before automatic QR.'),
  ('payment_qr_placeholder_url', '', 'Future QR image or signed URL.')
on conflict (key) do update
set value = excluded.value,
    notes = excluded.notes,
    updated_at = now();
