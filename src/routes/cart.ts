import { Hono } from 'hono';
import { createPocketBaseClient } from '../lib/pocketbase';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse, AddToCartBody, Variables } from '../types';

const cart = new Hono<{ Variables: Variables }>();

// 所有购物车路由都需要认证身份
cart.use('*', authMiddleware);

/**
 * GET /api/cart
 * 获取当前用户的购物车物品，并展开（expand）关联的商品详情
 */
cart.get('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const pb = createPocketBaseClient(token);

  try {
    const records = await pb.collection('cart_items').getFullList({
      filter: `user_id = "${userId}"`,
      sort: '-created',
      expand: 'product_id'
    });

    const data = records.map((item: any) => ({
      id: item.id,
      user_id: item.user_id,
      product_id: item.product_id,
      quantity: item.quantity,
      created_at: item.created,
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

/**
 * POST /api/cart
 * 添加商品到购物车中，若商品已存在，则直接返回
 */
cart.post('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const body = await c.req.json<AddToCartBody>();

  if (!body.product_id) {
    return c.json<ApiResponse>({ success: false, error: '商品ID不能为空' }, 400);
  }

  const pb = createPocketBaseClient(token);

  try {
    // 检查是否已经在购物车中
    const existing = await pb.collection('cart_items').getList(1, 1, {
      filter: `user_id = "${userId}" && product_id = "${body.product_id}"`
    });

    if (existing.totalItems > 0) {
      return c.json<ApiResponse>({
        success: true,
        message: '商品已在购物车中',
        data: existing.items[0]
      });
    }

    // 创建购物车记录
    const newRecord = await pb.collection('cart_items').create({
      user_id: userId,
      product_id: body.product_id,
      quantity: 1
    });

    // 重新获取带商品信息的完整记录
    const recordWithProduct = await pb.collection('cart_items').getOne(newRecord.id, {
      expand: 'product_id'
    });

    const data = {
      id: recordWithProduct.id,
      user_id: recordWithProduct.user_id,
      product_id: recordWithProduct.product_id,
      quantity: recordWithProduct.quantity,
      created_at: recordWithProduct.created,
      product: recordWithProduct.expand?.product_id
        ? {
            id: recordWithProduct.expand.product_id.id,
            name: recordWithProduct.expand.product_id.name,
            price: recordWithProduct.expand.product_id.price,
            currency: recordWithProduct.expand.product_id.currency || 'NB',
            image_url: recordWithProduct.expand.product_id.image_url || null,
            tag: recordWithProduct.expand.product_id.tag || null
          }
        : null
    };

    return c.json<ApiResponse>({ success: true, data, message: '已加入购物车' }, 201);
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * DELETE /api/cart/:productId
 * 从购物车移除指定商品
 */
cart.delete('/:productId', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const productId = c.req.param('productId');

  const pb = createPocketBaseClient(token);

  try {
    // PocketBase 无法根据过滤条件直接 delete，需先查询出记录 id，再逐条删除
    const matched = await pb.collection('cart_items').getFullList({
      filter: `user_id = "${userId}" && product_id = "${productId}"`
    });

    for (const rec of matched) {
      await pb.collection('cart_items').delete(rec.id);
    }

    return c.json<ApiResponse>({ success: true, message: '已从购物车移除' });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * DELETE /api/cart
 * 清空购物车
 */
cart.delete('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const pb = createPocketBaseClient(token);

  try {
    const matched = await pb.collection('cart_items').getFullList({
      filter: `user_id = "${userId}"`
    });

    for (const rec of matched) {
      await pb.collection('cart_items').delete(rec.id);
    }

    return c.json<ApiResponse>({ success: true, message: '购物车已清空' });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

export default cart;
