import { createMiddleware } from 'hono/factory';
import { createSupabaseClient } from '../lib/supabase';
import type { Variables } from '../types';

/**
 * Admin Middleware
 * Assumes authMiddleware has already run and populated userId and accessToken.
 * Fetches the user's profile and checks if role === 'admin'.
 */
export const adminMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');

  if (!userId || !token) {
    return c.json({ success: false, error: '未授权，请先登录' }, 401);
  }

  try {
    const supabase = createSupabaseClient(token);
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return c.json({ success: false, error: '无法获取用户信息' }, 403);
    }

    if (profile.role !== 'admin') {
      return c.json({ success: false, error: '权限不足，需要管理员权限' }, 403);
    }

    await next();
  } catch {
    return c.json({ success: false, error: '权限校验失败' }, 403);
  }
});
