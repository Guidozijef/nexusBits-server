import { createMiddleware } from 'hono/factory';
import { createSupabaseClient } from '../lib/supabase';
import type { Variables } from '../types';

/**
 * JWT Auth Middleware
 * Extracts the Bearer token from Authorization header,
 * validates it against Supabase Auth, and sets userId + accessToken in context.
 */
export const authMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '未授权，请先登录' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const supabase = createSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return c.json({ success: false, error: '令牌无效或已过期' }, 401);
    }

    c.set('userId', user.id);
    c.set('accessToken', token);

    await next();
  } catch {
    return c.json({ success: false, error: '认证失败' }, 401);
  }
});
