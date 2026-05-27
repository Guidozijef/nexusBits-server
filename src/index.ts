import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import categoryRoutes from './routes/categories';
import cartRoutes from './routes/cart';
import orderRoutes from './routes/orders';
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';

const app = new Hono();

// ---- Global Middleware ----
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'https://nexus.zijef.xyz', 'http://nexus.zijef.xyz'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}));

// ---- Health Check ----
app.get('/', (c) => {
  return c.json({
    name: 'NexusBits API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// ---- API Routes ----
app.route('/api/auth', authRoutes);
app.route('/api/products', productRoutes);
app.route('/api/categories', categoryRoutes);
app.route('/api/cart', cartRoutes);
app.route('/api/orders', orderRoutes);
app.route('/api/user', userRoutes);
app.route('/api/admin', adminRoutes);

// ---- 404 Handler ----
app.notFound((c) => {
  return c.json({ success: false, error: '接口不存在' }, 404);
});

// ---- Error Handler ----
app.onError((err, c) => {
  console.error('Server Error:', err);
  return c.json({ success: false, error: '服务器内部错误' }, 500);
});

// ---- 进程级错误兜底，防止未捕获的异常导致 Bun 进程崩溃 (502) ----
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

// ---- Start Server ----
const port = parseInt(process.env.PORT || '3001');

console.log(`
╔══════════════════════════════════════════╗
║       🚀 NexusBits API Server           ║
║       Running on port ${port}              ║
║       http://localhost:${port}              ║
╚══════════════════════════════════════════╝
`);

// 🚨 使用 Bun.serve() 显式启动，替代 export default { fetch } 模式
// export default 模式没有 error 回调，请求处理中任何底层异常都会直接崩溃进程
const server = Bun.serve({
  port,
  // 包裹 app.fetch，确保所有异常都被捕获并返回 500，而非进程崩溃
  fetch: async (req: Request) => {
    try {
      return await app.fetch(req);
    } catch (err) {
      console.error('⚠️ Unhandled fetch error:', err);
      return new Response(
        JSON.stringify({ success: false, error: '服务器内部错误' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
  // Bun 底层网络/解析错误的兜底回调
  error(error: Error) {
    console.error('⚠️ Bun Server Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: '服务器错误' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  },
});

console.log(`✅ Server is listening on ${server.hostname}:${server.port}`);
