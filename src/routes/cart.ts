import { Hono } from 'hono';
import { createSupabaseClient } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse, AddToCartBody, Variables } from '../types';

const cart = new Hono<{ Variables: Variables }>();

// All cart routes require authentication
cart.use('*', authMiddleware);

/**
 * GET /api/cart
 * Get current user's cart items with product details
 */
cart.get('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const supabase = createSupabaseClient(token);

  const { data, error } = await supabase
    .from('cart_items')
    .select('*, product:products(id, name, price, currency, image_url, tag)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({ success: true, data: data || [] });
});

/**
 * POST /api/cart
 * Add a product to the cart
 */
cart.post('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const body = await c.req.json<AddToCartBody>();

  if (!body.product_id) {
    return c.json<ApiResponse>({ success: false, error: '商品ID不能为空' }, 400);
  }

  const supabase = createSupabaseClient(token);

  // Check if already in cart
  const { data: existing } = await supabase
    .from('cart_items')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', body.product_id)
    .single();

  if (existing) {
    return c.json<ApiResponse>({ success: true, message: '商品已在购物车中', data: existing });
  }

  const { data, error } = await supabase
    .from('cart_items')
    .insert({ user_id: userId, product_id: body.product_id, quantity: 1 })
    .select('*, product:products(id, name, price, currency, image_url, tag)')
    .single();

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({ success: true, data, message: '已加入购物车' }, 201);
});

/**
 * DELETE /api/cart/:productId
 * Remove a specific product from cart
 */
cart.delete('/:productId', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const productId = parseInt(c.req.param('productId'));

  const supabase = createSupabaseClient(token);

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({ success: true, message: '已从购物车移除' });
});

/**
 * DELETE /api/cart
 * Clear the entire cart
 */
cart.delete('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const supabase = createSupabaseClient(token);

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId);

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({ success: true, message: '购物车已清空' });
});

export default cart;
