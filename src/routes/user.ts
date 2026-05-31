import { Hono } from 'hono';
import { createPocketBaseClient, getPocketBaseAdmin } from '../lib/pocketbase';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse, UpdateProfileBody, RechargeBody, Variables } from '../types';

const user = new Hono<{ Variables: Variables }>();

// 所有用户路由都需要身份认证
user.use('*', authMiddleware);

/**
 * 辅助函数：将 PocketBase 的 User Record 映射为 Hono/前端类型对应的 Profile 对象
 */
function mapProfile(record: any) {
  return {
    id: record.id,
    display_name: record.name || '匿名用户',
    avatar_url: record.avatar || null,
    level: record.level || '标准',
    role: record.role || 'user',
    balance: record.balance || 0,
    email: record.email || null,
    created_at: record.created,
    updated_at: record.updated
  };
}

/**
 * GET /api/user/profile
 * 获取当前登录用户的个人信息
 */
user.get('/profile', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const pb = createPocketBaseClient(token);

  try {
    const record = await pb.collection('users').getOne(userId);
    return c.json<ApiResponse>({ success: true, data: mapProfile(record) });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: '获取个人信息失败' }, 500);
  }
});

/**
 * PUT /api/user/profile
 * 修改当前登录用户的个人信息
 */
user.put('/profile', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const body = await c.req.json<UpdateProfileBody>();
  const pb = createPocketBaseClient(token);

  const updates: Record<string, any> = {};
  if (body.display_name !== undefined) updates.name = body.display_name;
  if (body.avatar_url !== undefined) updates.avatar = body.avatar_url;

  try {
    const record = await pb.collection('users').update(userId, updates);
    return c.json<ApiResponse>({ success: true, data: mapProfile(record), message: '更新成功' });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/user/balance
 * 获取当前账户余额
 */
user.get('/balance', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const pb = createPocketBaseClient(token);

  try {
    const record = await pb.collection('users').getOne(userId);
    return c.json<ApiResponse>({ success: true, data: { balance: record.balance } });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: '获取余额失败' }, 500);
  }
});

/**
 * POST /api/user/recharge
 * 用户模拟充值（充值操作使用 pbAdmin 安全更新余额）
 */
user.post('/recharge', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<RechargeBody>();

  const validAmounts = [100, 500, 1000, 2000, 5000, 10000];
  if (!body.amount || !validAmounts.includes(body.amount)) {
    return c.json<ApiResponse>({ success: false, error: '无效的充值金额' }, 400);
  }

  try {
    const pbAdmin = await getPocketBaseAdmin();

    // 1. 获取当前用户最新信息
    const userProfile = await pbAdmin.collection('users').getOne(userId);
    const balanceBefore = userProfile.balance;
    const balanceAfter = balanceBefore + body.amount;

    // 2. 更新账户余额
    await pbAdmin.collection('users').update(userId, {
      balance: balanceAfter
    });

    // 3. 写入充值记录表 recharge_records
    await pbAdmin.collection('recharge_records').create({
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
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/user/assets
 * 获取已购买的资产库列表
 */
user.get('/assets', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const pb = createPocketBaseClient(token);

  try {
    const records = await pb.collection('user_assets').getFullList({
      filter: `user_id = "${userId}"`,
      sort: '-created',
      expand: 'product_id'
    });

    const data = records.map((item: any) => ({
      id: item.id,
      user_id: item.user_id,
      product_id: item.product_id,
      order_id: item.order_id || null,
      license_key: item.license_key || null,
      remark: item.remark || null,
      acquired_at: item.acquired_at || item.created,
      product: item.expand?.product_id
        ? {
            id: item.expand.product_id.id,
            name: item.expand.product_id.name,
            price: item.expand.product_id.price,
            currency: item.expand.product_id.currency || 'NB',
            image_url: item.expand.product_id.image_url || null,
            tag: item.expand.product_id.tag || null
          }
        : null
    }));

    return c.json<ApiResponse>({ success: true, data });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

export default user;
