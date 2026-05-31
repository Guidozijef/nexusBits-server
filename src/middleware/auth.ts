import { createMiddleware } from 'hono/factory';
import { createPocketBaseClient } from '../lib/pocketbase';
import type { Variables } from '../types';

/**
 * JWT 认证中间件
 * 从 Authorization 头解析 Bearer Token，通过 PocketBase 进行有效性校验，
 * 验证通过后将 userId 和 accessToken 存入 Hono 上下文环境中。
 */
export const authMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: '未授权，请先登录' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const pb = createPocketBaseClient(token);
    // 通过调用 authRefresh，请求 PocketBase 服务端校验并刷新该用户的 Token。
    // 如果 Token 无效、过期或被撤销，将抛出异常，进入 catch 块。
    const authData = await pb.collection('users').authRefresh();

    if (!authData || !authData.record) {
      return c.json({ success: false, error: '令牌无效或已过期' }, 401);
    }

    c.set('userId', authData.record.id);
    c.set('accessToken', token);

    await next();
  } catch (err: any) {
    return c.json({ success: false, error: '认证失败，令牌无效或已过期' }, 401);
  }
});
