import { createMiddleware } from 'hono/factory';
import type { Variables } from '../types';

// 内存中缓存 IP 访问次数的 Map。格式为: IP -> { count, resetTime }
const ipCache = new Map<string, { count: number; resetTime: number }>();

/**
 * 极简的内存 IP 限流中间件，用于防止暴力破解或刷注册接口。
 *
 * @param limit 在时间窗口内允许的最大请求次数
 * @param windowMs 时间窗口大小（毫秒）
 * @returns Hono 中间件
 */
export const rateLimitMiddleware = (limit: number, windowMs: number) => {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    // 优先从代理头获取客户端真实 IP（在 Nginx / Cloudflare 代理下生效）
    const xForwardedFor = c.req.header('x-forwarded-for');
    const xRealIp = c.req.header('x-real-ip');
    
    let ip = '127.0.0.1';
    if (xForwardedFor) {
      ip = (xForwardedFor.split(',')[0] || '').trim();
    } else if (xRealIp) {
      ip = xRealIp;
    } else {
      // 降级使用底层 Socket 地址
      const rawReq = c.env as any;
      if (rawReq?.incoming?.socket?.remoteAddress) {
        ip = rawReq.incoming.socket.remoteAddress;
      }
    }

    const now = Date.now();
    const record = ipCache.get(ip);

    // 如果没有记录，或者当前时间已超过窗口重置时间，则重新初始化窗口
    if (!record || now > record.resetTime) {
      ipCache.set(ip, {
        count: 1,
        resetTime: now + windowMs
      });
    } else {
      // 窗口期内累加计数
      record.count += 1;
      // 如果超过最大请求限制，直接拒绝服务并返回 429 Too Many Requests
      if (record.count > limit) {
        return c.json({
          success: false,
          error: '您的请求过于频繁，请稍后再试。'
        }, 429);
      }
    }

    await next();
  });
};
