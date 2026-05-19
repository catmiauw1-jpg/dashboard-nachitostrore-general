# PoleraFlow

Dashboard administrativo para una tienda de poleras y poleras personalizadas.

## Incluye

- Dashboard en Next.js + TypeScript.
- Gestión local de pedidos, productos y stock.
- API local para catálogo:
  - `GET /api/products`
  - `POST /api/products`
  - `PATCH /api/products`
  - `GET /api/public/products`
- Subida local de imágenes:
  - `POST /api/uploads`
- Datos mock preparados para conectar luego Supabase, n8n y WhatsApp.

## Ejecutar

```bash
npm install
npm run dev
```

Abrir:

```text
http://127.0.0.1:3000
```
