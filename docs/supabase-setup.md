# Supabase Setup For PoleraFlow

Supabase project:

- URL: `https://aufrcfevyfkhkecycyeq.supabase.co`
- Public key type: publishable key

## 1. Create The Database

Open Supabase Dashboard, go to **SQL Editor**, and run:

1. `supabase/migrations/0001_poleraflow_core.sql`
2. `supabase/seed-products.sql`

The first file creates tables, indexes, RLS policies and the `product-images` storage bucket.
The second file imports the current products from the dashboard.

## 2. Configure Vercel

In Vercel, open the dashboard project and add these environment variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://aufrcfevyfkhkecycyeq.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Get `SUPABASE_SERVICE_ROLE_KEY` from Supabase:

`Project Settings > API > service_role`

Keep it private. It must only live in Vercel and local `.env.local`, never in Nachito Store and never committed to Git.

## 3. Deploy Again

After adding env vars, redeploy the Vercel dashboard.

Then test:

```txt
https://admin-dhasboard.vercel.app/api/public/products
```

It should return only visible products.

## 4. How The System Works

- Nachito Store reads public visible products from `/api/public/products`.
- PoleraFlow dashboard writes products through `/api/products`.
- Product images upload to Supabase Storage bucket `product-images`.
- If the service role key is missing, PoleraFlow falls back to local JSON while developing.

## 5. Next Security Step

Before selling this as a system, add admin login. The service role key protects server API routes, but the dashboard UI still needs authentication so only you can access it.
