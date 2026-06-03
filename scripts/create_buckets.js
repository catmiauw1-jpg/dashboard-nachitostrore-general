const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const buckets = [
  { id: "product-images", public: true },
  { id: "order-references", public: true },
  { id: "payment-proofs", public: false }
];

async function main() {
  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  for (const bucket of buckets) {
    const found = existing?.some((item) => item.id === bucket.id || item.name === bucket.id);

    if (found) {
      const { error } = await supabase.storage.updateBucket(bucket.id, { public: bucket.public });
      if (error) throw error;
      console.log(`Updated bucket ${bucket.id}`);
      continue;
    }

    const { error } = await supabase.storage.createBucket(bucket.id, { public: bucket.public });
    if (error) throw error;
    console.log(`Created bucket ${bucket.id}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
