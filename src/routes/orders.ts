import { Hono } from 'hono';
import { createPocketBaseClient, getPocketBaseAdmin } from '../lib/pocketbase';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse, PaginatedResponse, Order, DirectBuyBody, Variables } from '../types';

const orders = new Hono<{ Variables: Variables }>();

// 所有订单路由都需要身份认证
orders.use('*', authMiddleware);

/**
 * 生成包含品牌前缀的唯一订单号。
 * 格式为: #NXB-时戳部分(6位大写36进制) + 随机部分(4位大写36进制)
 * 示例: #NXB-7G7S20ABCD
 *
 * @returns 格式化后的唯一订单号字符串
 */
function generateOrderNo(): string {
  const offset = Date.now() - 1767225600000;
  const timePart = offset.toString(36).toUpperCase().slice(-6);
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, 'X');
  const uniqueCode = `${timePart}${randomPart}`.substring(0, 10);
  return `#NXB-${uniqueCode}`;
}

/**
 * GET /api/orders
 * 分页获取当前用户的所有订单，并展开子项 (order_items)
 */
orders.get('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');

  const pb = createPocketBaseClient(token);

  try {
    // PocketBase 支持使用 order_items(order_id) 反向展开属于该订单的所有细项
    const resultList = await pb.collection('orders').getList(page, limit, {
      filter: `user_id = "${userId}"`,
      sort: '-created',
      expand: 'order_items(order_id)'
    });

    const mappedOrders: Order[] = resultList.items.map((order: any) => {
      const rawItems = order.expand?.['order_items(order_id)'] || [];
      const items = rawItems.map((item: any) => ({
        id: item.id,
        order_id: item.order_id,
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        package_name: item.package_name || null,
        duration_name: item.duration_name || null,
        variant_type: item.variant_type || null
      }));

      return {
        id: order.id,
        order_no: order.order_no,
        user_id: order.user_id,
        total_amount: order.total_amount,
        status: order.status,
        created_at: order.created,
        updated_at: order.updated,
        items: items
      };
    });

    return c.json<PaginatedResponse<Order>>({
      success: true,
      data: mappedOrders,
      total: resultList.totalItems,
      page,
      limit
    });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/orders
 * 购物车结算下单
 * 扣除用户余额，创建 orders 与 order_items 记录，清除购物车，并发放已购资产授权
 */
orders.post('/', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const pb = createPocketBaseClient(token);

  try {
    // 1. 获取购物车中所有物品及商品详情
    const cartItems = await pb.collection('cart_items').getFullList({
      filter: `user_id = "${userId}"`,
      expand: 'product_id'
    });

    if (!cartItems || cartItems.length === 0) {
      return c.json<ApiResponse>({ success: false, error: '购物车为空' }, 400);
    }

    // 2. 计算结算总价
    const totalAmount = cartItems.reduce((sum, item) => {
      const price = item.expand?.product_id?.price || 0;
      return sum + price * item.quantity;
    }, 0);

    // 3. 获取用户余额信息，为保证资金账目安全，使用 pbAdmin 读写
    const pbAdmin = await getPocketBaseAdmin();
    const userProfile = await pbAdmin.collection('users').getOne(userId);

    if (userProfile.balance < totalAmount) {
      return c.json<ApiResponse>({ success: false, error: '余额不足，请先充值' }, 400);
    }

    // 4. 创建订单主记录
    const orderNo = generateOrderNo();
    const orderRecord = await pbAdmin.collection('orders').create({
      order_no: orderNo,
      user_id: userId,
      total_amount: totalAmount,
      status: '处理中'
    });

    // 5. 逐条写入订单细项 order_items
    const orderItemsMapped = [];
    for (const item of cartItems) {
      const prodName = item.expand?.product_id?.name || 'Unknown';
      const prodPrice = item.expand?.product_id?.price || 0;
      
      const orderItem = await pbAdmin.collection('order_items').create({
        order_id: orderRecord.id,
        product_id: item.product_id,
        product_name: prodName,
        price: prodPrice,
        quantity: item.quantity
      });

      orderItemsMapped.push({
        id: orderItem.id,
        order_id: orderItem.order_id,
        product_id: orderItem.product_id,
        product_name: orderItem.product_name,
        price: orderItem.price,
        quantity: orderItem.quantity
      });
    }

    // 6. 扣除余额并更新用户信息
    const finalBalance = userProfile.balance - totalAmount;
    await pbAdmin.collection('users').update(userId, {
      balance: finalBalance
    });

    // 7. 发放资产授权密钥 user_assets
    for (const item of cartItems) {
      const prodName = item.expand?.product_id?.name || '虚拟商品';
      await pbAdmin.collection('user_assets').create({
        user_id: userId,
        product_id: item.product_id,
        order_id: orderRecord.id,
        license_key: `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        remark: `系统自动生成备注：授权成功！您购买的《${prodName}》已放入您的资产库。订单编号为：${orderRecord.order_no}。如有售后需求，请联系客服获取专有交付包。`
      });
    }

    // 8. 结算完成后清除购物车
    for (const item of cartItems) {
      await pb.collection('cart_items').delete(item.id);
    }

    return c.json<ApiResponse>({
      success: true,
      data: {
        id: orderRecord.id,
        order_no: orderRecord.order_no,
        user_id: orderRecord.user_id,
        total_amount: orderRecord.total_amount,
        status: orderRecord.status,
        created_at: orderRecord.created,
        updated_at: orderRecord.updated,
        items: orderItemsMapped,
        new_balance: finalBalance
      },
      message: '支付成功！资源已发放至您的仓库。'
    }, 201);
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/orders/direct
 * 立即支付购买单个商品
 */
orders.post('/direct', async (c) => {
  const userId = c.get('userId');
  const token = c.get('accessToken');
  const body = await c.req.json<DirectBuyBody>();

  if (!body.product_id) {
    return c.json<ApiResponse>({ success: false, error: '商品ID不能为空' }, 400);
  }

  const pb = createPocketBaseClient(token);

  try {
    // 获取商品详情
    const product = await pb.collection('products').getOne(body.product_id);

    if (product.status !== 'active') {
      return c.json<ApiResponse>({ success: false, error: '商品不存在或已下架' }, 404);
    }

    // 根据选择的多属性规格（类型/套餐/时长）计算单价
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
        unitPrice = dur.price_modifier;
        durName = dur.name;
      }
    }

    const totalAmount = unitPrice * qty;

    // 检查并扣减用户余额 (Admin 权限操作)
    const pbAdmin = await getPocketBaseAdmin();
    const userProfile = await pbAdmin.collection('users').getOne(userId);

    if (userProfile.balance < totalAmount) {
      return c.json<ApiResponse>({ success: false, error: '余额不足，请先充值' }, 400);
    }

    // 创建订单记录
    const orderRecord = await pbAdmin.collection('orders').create({
      order_no: generateOrderNo(),
      user_id: userId,
      total_amount: totalAmount,
      status: '处理中'
    });

    // 写入订单详情项
    const orderItemRecord = await pbAdmin.collection('order_items').create({
      order_id: orderRecord.id,
      product_id: product.id,
      product_name: product.name,
      price: unitPrice,
      quantity: qty,
      package_name: pkgName,
      duration_name: durName,
      variant_type: typeName
    });

    // 扣减用户账户余额
    const finalBalance = userProfile.balance - totalAmount;
    await pbAdmin.collection('users').update(userId, {
      balance: finalBalance
    });

    // 生成资产授权记录
    await pbAdmin.collection('user_assets').create({
      user_id: userId,
      product_id: product.id,
      order_id: orderRecord.id,
      license_key: `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      remark: `系统自动生成备注：授权成功！您购买的《${product.name}》已放入您的资产库。订单编号为：${orderRecord.order_no}。如有售后需求，请联系客服获取专有交付包。`
    });

    return c.json<ApiResponse>({
      success: true,
      data: {
        order: {
          id: orderRecord.id,
          order_no: orderRecord.order_no,
          user_id: orderRecord.user_id,
          total_amount: orderRecord.total_amount,
          status: orderRecord.status,
          created_at: orderRecord.created,
          updated_at: orderRecord.updated,
          items: [{
            id: orderItemRecord.id,
            order_id: orderItemRecord.order_id,
            product_id: orderItemRecord.product_id,
            product_name: orderItemRecord.product_name,
            price: orderItemRecord.price,
            quantity: orderItemRecord.quantity,
            package_name: orderItemRecord.package_name,
            duration_name: orderItemRecord.duration_name,
            variant_type: orderItemRecord.variant_type
          }]
        },
        new_balance: finalBalance
      },
      message: '支付成功！资源已发放至您的仓库。'
    }, 201);
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

export default orders;
