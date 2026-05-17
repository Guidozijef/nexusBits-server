import { Hono } from 'hono';
import crypto from 'crypto';
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse, PaginatedResponse, Order, DirectBuyBody, Variables } from '../types';

const orders = new Hono<{ Variables: Variables }>();

// All order routes require authentication
orders.use('*', authMiddleware);

/**
 * Generate a unique order number using UUID (e.g. NXB-7B8B1A2C9C4D4E3F8F1A2B3C4D5E6F7A)
 */
function generateOrderNo(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return `#NXB-${uuid}`;
}

/**
 * GET /api/orders
 * Get current user's orders with pagination
 */
orders.get('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');
  const offset = (page - 1) * limit;

  const supabase = createSupabaseClient(token);

  const { data, error, count } = await supabase
    .from('orders')
    .select('*, items:order_items(id, product_id, product_name, price, quantity)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<PaginatedResponse<Order>>({
    success: true,
    data: data || [],
    total: count || 0,
    page,
    limit
  });
});

/**
 * POST /api/orders
 * Create order from cart (checkout)
 * Deducts balance, creates order + order_items, clears cart, grants assets
 */
orders.post('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const supabase = createSupabaseClient(token);

  // 1. Get cart items with product details
  const { data: cartItems, error: cartError } = await supabase
    .from('cart_items')
    .select('*, product:products(id, name, price)')
    .eq('user_id', userId);

  if (cartError) {
    return c.json<ApiResponse>({ success: false, error: cartError.message }, 500);
  }

  if (!cartItems || cartItems.length === 0) {
    return c.json<ApiResponse>({ success: false, error: '购物车为空' }, 400);
  }

  // 2. Calculate total
  const totalAmount = cartItems.reduce((sum, item) => {
    return sum + (item.product?.price || 0) * item.quantity;
  }, 0);

  // 3. Check balance (use admin to bypass RLS for financial operations)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    return c.json<ApiResponse>({ success: false, error: '获取用户信息失败' }, 500);
  }

  if (profile.balance < totalAmount) {
    return c.json<ApiResponse>({ success: false, error: '余额不足，请先充值' }, 400);
  }

  // 4. Create order
  const orderNo = generateOrderNo();
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_no: orderNo,
      user_id: userId,
      total_amount: totalAmount,
      status: '已完成'
    })
    .select()
    .single();

  if (orderError) {
    return c.json<ApiResponse>({ success: false, error: orderError.message }, 500);
  }

  // 5. Create order items
  const orderItems = cartItems.map(item => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product?.name || 'Unknown',
    price: item.product?.price || 0,
    quantity: item.quantity
  }));

  await supabaseAdmin.from('order_items').insert(orderItems);

  // 6. Deduct balance
  await supabaseAdmin
    .from('profiles')
    .update({ balance: profile.balance - totalAmount, updated_at: new Date().toISOString() })
    .eq('id', userId);

  // 7. Grant user_assets
  const assets = cartItems.map(item => ({
    user_id: userId,
    product_id: item.product_id,
    order_id: order.id,
    license_key: `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    remark: `系统自动生成备注：授权成功！您购买的《${item.product?.name || '虚拟商品'}》已放入您的资产库。订单编号为：${order.order_no}。如有售后需求，请联系客服获取专有交付包。`
  }));

  await supabaseAdmin.from('user_assets').upsert(assets, { onConflict: 'user_id,product_id' });

  // 8. Clear cart
  await supabase.from('cart_items').delete().eq('user_id', userId);

  return c.json<ApiResponse>({
    success: true,
    data: { ...order, items: orderItems, new_balance: profile.balance - totalAmount },
    message: '支付成功！资源已发放至您的仓库。'
  }, 201);
});

/**
 * POST /api/orders/direct
 * Direct purchase a single product (立即支付)
 */
orders.post('/direct', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const body = await c.req.json<DirectBuyBody>();

  if (!body.product_id) {
    return c.json<ApiResponse>({ success: false, error: '商品ID不能为空' }, 400);
  }

  // Get product
  const supabase = createSupabaseClient(token);
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, name, price, types, packages, durations')
    .eq('id', body.product_id)
    .eq('status', 'active')
    .single();

  if (productError || !product) {
    return c.json<ApiResponse>({ success: false, error: '商品不存在' }, 404);
  }

  // Compute price based on variants
  const qty = body.quantity || 1;
  let unitPrice = product.price;
  let pkgName = null;
  let durName = null;
  let typeName = null;

  if (body.type_idx !== undefined && product.types && product.types[body.type_idx]) {
    typeName = product.types[body.type_idx];
  }

  if (body.pkg_id && product.packages) {
    const pkg = (product.packages as any[]).find((p: any) => p.id === body.pkg_id);
    if (pkg) {
      if (pkg.type_idxs && body.type_idx !== undefined && !pkg.type_idxs.includes(body.type_idx)) {
        return c.json<ApiResponse>({ success: false, error: '安全拦截：该套餐不适用于当前选择的类型组合' }, 400);
      }
      unitPrice = pkg.price;
      pkgName = pkg.name;
    }
  }

  if (body.dur_id && product.durations) {
    const dur = (product.durations as any[]).find((d: any) => d.id === body.dur_id);
    if (dur) {
      if (dur.pkg_ids && body.pkg_id !== undefined && !dur.pkg_ids.includes(body.pkg_id)) {
        return c.json<ApiResponse>({ success: false, error: '安全拦截：该时长选项不适用于当前选择的套餐' }, 400);
      }
      unitPrice += dur.price_modifier;
      durName = dur.name;
    }
  }

  const totalAmount = unitPrice * qty;

  // Check balance
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();

  if (!profile || profile.balance < totalAmount) {
    return c.json<ApiResponse>({ success: false, error: '余额不足，请先充值' }, 400);
  }

  // Create order
  const orderNo = generateOrderNo();
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_no: orderNo,
      user_id: userId,
      total_amount: totalAmount,
      status: '已完成'
    })
    .select()
    .single();

  if (orderError) {
    return c.json<ApiResponse>({ success: false, error: orderError.message }, 500);
  }

  // Create order item
  await supabaseAdmin.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    product_name: product.name,
    price: unitPrice,
    quantity: qty,
    package_name: pkgName,
    duration_name: durName,
    variant_type: typeName
  });

  // Deduct balance
  const newBalance = profile.balance - totalAmount;
  await supabaseAdmin
    .from('profiles')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId);

  // Grant asset
  await supabaseAdmin.from('user_assets').upsert({
    user_id: userId,
    product_id: product.id,
    order_id: order.id,
    license_key: `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    remark: `系统自动生成备注：授权成功！您购买的《${product.name}》已放入您的资产库。订单编号为：${order.order_no}。如有售后需求，请联系客服获取专有交付包。`
  }, { onConflict: 'user_id,product_id' });

  return c.json<ApiResponse>({
    success: true,
    data: { order, new_balance: newBalance },
    message: '支付成功！资源已发放至您的仓库。'
  }, 201);
});

export default orders;
