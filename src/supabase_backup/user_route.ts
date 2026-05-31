import { Hono } from 'hono';
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse, UpdateProfileBody, RechargeBody, Variables } from '../types';

const user = new Hono<{ Variables: Variables }>();

// All user routes require authentication
user.use('*', authMiddleware);

/**
 * GET /api/user/profile
 * Get current user's profile
 */
user.get('/profile', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const supabase = createSupabaseClient(token);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return c.json<ApiResponse>({ success: false, error: '获取个人信息失败' }, 500);
  }

  return c.json<ApiResponse>({ success: true, data });
});

/**
 * PUT /api/user/profile
 * Update current user's profile
 */
user.put('/profile', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const body = await c.req.json<UpdateProfileBody>();
  const supabase = createSupabaseClient(token);

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({ success: true, data, message: '更新成功' });
});

/**
 * GET /api/user/balance
 * Get current balance
 */
user.get('/balance', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const supabase = createSupabaseClient(token);

  const { data, error } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return c.json<ApiResponse>({ success: false, error: '获取余额失败' }, 500);
  }

  return c.json<ApiResponse>({ success: true, data: { balance: data.balance } });
});

/**
 * POST /api/user/recharge
 * Recharge balance (simulated — in production, integrate real payment)
 */
user.post('/recharge', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<RechargeBody>();

  const validAmounts = [100, 500, 1000, 2000, 5000, 10000];
  if (!body.amount || !validAmounts.includes(body.amount)) {
    return c.json<ApiResponse>({ success: false, error: '无效的充值金额' }, 400);
  }

  // Get current balance
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    return c.json<ApiResponse>({ success: false, error: '获取用户信息失败' }, 500);
  }

  const balanceBefore = profile.balance;
  const balanceAfter = balanceBefore + body.amount;

  // Update balance
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) {
    return c.json<ApiResponse>({ success: false, error: updateError.message }, 500);
  }

  // Record recharge
  await supabaseAdmin.from('recharge_records').insert({
    user_id: userId,
    amount: body.amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter
  });

  return c.json<ApiResponse>({
    success: true,
    data: { balance: balanceAfter },
    message: `成功充值 ${body.amount} NX`
  });
});

/**
 * GET /api/user/assets
 * Get user's purchased assets
 */
user.get('/assets', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const supabase = createSupabaseClient(token);

  const { data, error } = await supabase
    .from('user_assets')
    .select('*, product:products(id, name, price, currency, image_url, tag)')
    .eq('user_id', userId)
    .order('acquired_at', { ascending: false });

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({ success: true, data: data || [] });
});

export default user;
