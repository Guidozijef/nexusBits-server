import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

// ---- 全局 WebSocket 适配层 (WebSocket Polyfill) ----
// Node.js 运行时原生不支持 WebSocket，而 Supabase Realtime 模块在初始化时
// 需要全局 WebSocket 构造函数。此处引入 'ws' 并在 globalThis 上挂载，以兼容 Node.js。
globalThis.WebSocket = ws as any;

// 从环境变量中读取 Supabase 访问配置。
// 当使用 Nginx 转发模式时，SUPABASE_URL 将指向本地代理地址 (例如 http://127.0.0.1/supabase)。
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

/**
 * 校验给定的 URL 是否为合法的 HTTP 或 HTTPS 地址。
 *
 * @param url 待校验的 URL 字符串
 * @returns 是否为合法 URL
 */
const isValidUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://');
};

// 检查是否配置了有效的凭证，并且排除了默认占位符。
const hasValidCreds =
  supabaseUrl &&
  isValidUrl(supabaseUrl) &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your_supabase_url_here');

if (!hasValidCreds) {
  console.warn(`
⚠️  [Warning] Supabase 配置不完整或包含默认值。
👉  请检查 'nexusBits-server/.env' 并配置以下环境变量:
    - SUPABASE_URL (必须是以 http:// 或 https:// 开头的合法 URL。本地 Nginx 代理通常为 http://127.0.0.1/supabase)
    - SUPABASE_ANON_KEY
    - SUPABASE_SERVICE_ROLE_KEY
  `);
}

/**
 * Supabase 管理员客户端 (Service Role 客户端)。
 * 该客户端绕过行级安全策略 (RLS)，仅用于后端管理操作。
 * 在初始化时，如果 SUPABASE_URL 指向的是本地 Nginx 代理，请求将被透明地转发至 Supabase 官方服务器，
 * 同时本地 Nginx 代理应限制仅允许 127.0.0.1 访问以确保安全。
 */
export const supabaseAdmin: SupabaseClient = hasValidCreds
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null as any;

/**
 * 创建用于单次请求的 Supabase 客户端。
 * 根据用户传入的 Access Token (JWT) 初始化客户端头部，从而在请求数据库时激活 Supabase 的 RLS 行级权限策略。
 *
 * @param accessToken 用户的 JWT 访问令牌
 * @returns 针对当前请求初始化的 Supabase 客户端实例
 */
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
