import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'FATAL: Missing Supabase environment variables. SUPABASE_SERVICE_ROLE_KEY is required for the proxy to function.'
  );
  // Create a dummy client that will throw errors if used
  // This prevents a hard crash on module load and allows the proxy to return a clean error
  supabaseAdmin = {
    from: () => {
      throw new Error('Supabase Admin Client not initialized due to missing environment variables.');
    },
    auth: {
      getUser: () => {
        throw new Error('Supabase Admin Client not initialized due to missing environment variables.');
      }
    }
  } as any;
} else {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
}

function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase Admin Client not initialized. Check server logs for details on missing environment variables.');
  }
  return supabaseAdmin;
}

export { getSupabaseAdminClient };