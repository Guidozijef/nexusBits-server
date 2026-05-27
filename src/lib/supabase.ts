import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

// ---- 全局 WebSocket 适配层 (WebSocket Polyfill) ----
// Node.js 18 环境原生不支持 WebSocket，而 Supabase 的 Realtime 客户端
// 在初始化时需要全局 WebSocket 构造函数。我们在此处引入 'ws' 库并进行全局挂载，
// 以兼容 Node.js 运行时，防止初始化时抛出 502 错误。
globalThis.WebSocket = ws as any;

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
