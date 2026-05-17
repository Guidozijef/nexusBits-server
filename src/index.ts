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
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
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

// ---- Start Server ----
const port = parseInt(process.env.PORT || '3001');

console.log(`
╔══════════════════════════════════════════╗
║       🚀 NexusBits API Server           ║
║       Running on port ${port}              ║
║       http://localhost:${port}              ║
╚══════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
