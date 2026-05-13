import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

const isValidUrl = (url: string) => {
  return url.startsWith('http://') || url.startsWith('https://');
};

const hasValidCreds = supabaseUrl && isValidUrl(supabaseUrl) && supabaseAnonKey && !supabaseUrl.includes('your_supabase_url_here');

if (!hasValidCreds) {
  console.warn(`
⚠️  [Warning] Supabase is not fully configured or contains default values.
👉  Please open 'nexusBits-server/.env' and configure:
    - SUPABASE_URL (must start with https://)
    - SUPABASE_ANON_KEY
    - SUPABASE_SERVICE_ROLE_KEY
  `);
}

// Service role client — bypasses RLS, used for admin operations.
// Initialized only if valid credentials exist to avoid crash on startup.
export const supabaseAdmin: SupabaseClient = hasValidCreds
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null as any;

// Create a per-request client using the user's JWT token
export function createSupabaseClient(accessToken?: string): SupabaseClient {
  if (!hasValidCreds) {
    throw new Error('Supabase client is not configured. Please check your .env file.');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
