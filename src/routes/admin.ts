import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { createPocketBaseClient } from '../lib/pocketbase';
import type { Variables } from '../types';

const app = new Hono<{ Variables: Variables }>();

// 所有管理后台接口均需要登录校验与管理员权限校验
app.use('*', authMiddleware, adminMiddleware);

// 辅助映射函数：Profile
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

// 辅助映射函数：Product
function mapProductRecord(item: any) {
  return {
    id: item.id,
    name: item.name,
    description: item.description || null,
    long_description: item.long_description || null,
    price: item.price,
    currency: item.currency || 'NB',
    category_id: item.category_id,
    tag: item.tag || null,
    image_url: item.image_url || null,
    thumbnail_urls: item.thumbnail_urls || null,
    file_format: item.file_format || null,
    file_size: item.file_size || null,
    asset_type: item.asset_type || null,
    polygon_count: item.polygon_count || null,
    license_type: item.license_type || '商业使用',
    update_policy: item.update_policy || '终身',
    status: item.status || 'draft',
    is_featured: item.is_featured || false,
    sort_order: item.sort_order || 0,
    types: item.types || null,
    packages: item.packages || null,
    durations: item.durations || null,
    notices: item.notices || null,
    admin_note: item.admin_note || null,
    cost: item.cost || 0,
    created_at: item.created,
    updated_at: item.updated,
    category: item.expand?.category_id
      ? {
          id: item.expand.category_id.id,
          name: item.expand.category_id.name
        }
      : undefined
  };
}

// --- 用户管理 (User Management) ---

/**
 * GET /api/admin/users
 * 获取用户列表
 */
app.get('/users', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  
  try {
    const resultList = await pb.collection('users').getList(1, 100, {
      sort: '-created'
    });

    const data = resultList.items.map(mapProfile);
    return c.json({ success: true, data, total: resultList.totalItems });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// --- 商品管理 (Product Management) ---

/**
 * GET /api/admin/products
 * 获取所有商品列表（支持按名称、分类和状态筛选）
 */
app.get('/products', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const { name, category_id, status } = c.req.query();
  
  const filterList = [];
  if (name) {
    filterList.push(`name ~ "${name.replace(/"/g, '\\"')}"`);
  }
  if (category_id) {
    filterList.push(`category_id = "${category_id}"`);
  }
  if (status) {
    filterList.push(`status = "${status}"`);
  }
  const filterString = filterList.join(' && ');

  try {
    const resultList = await pb.collection('products').getList(1, 100, {
      filter: filterString,
      sort: '-created',
      expand: 'category_id'
    });

    const data = resultList.items.map(mapProductRecord);
    return c.json({ success: true, data, total: resultList.totalItems });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/admin/products/:id
 * 编辑商品时获取商品详情（包含 admin_note）
 */
app.get('/products/:id', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  
  try {
    const record = await pb.collection('products').getOne(id, {
      expand: 'category_id'
    });
    return c.json({ success: true, data: mapProductRecord(record) });
  } catch (err: any) {
    return c.json({ success: false, error: '商品不存在' }, 404);
  }
});

/**
 * POST /api/admin/products
 * 创建商品
 */
app.post('/products', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const body = await c.req.json();
  
  if (!body.name || !body.price || !body.category_id) {
    return c.json({ success: false, error: '缺少必填字段' }, 400);
  }

  try {
    const record = await pb.collection('products').create({
      name: body.name,
      description: body.description,
      long_description: body.long_description,
      price: parseFloat(body.price),
      currency: body.currency || 'NB',
      category_id: body.category_id,
      tag: body.tag,
      image_url: body.image_url,
      thumbnail_urls: body.thumbnail_urls,
      file_format: body.file_format,
      file_size: body.file_size,
      asset_type: body.asset_type,
      polygon_count: body.polygon_count,
      license_type: body.license_type || '商业使用',
      update_policy: body.update_policy || '终身',
      status: body.status || 'draft',
      is_featured: body.is_featured || false,
      sort_order: body.sort_order || 0,
      types: body.types || [],
      packages: body.packages || [],
      durations: body.durations || [],
      notices: body.notices || [],
      admin_note: body.admin_note,
      cost: body.cost ? parseFloat(body.cost) : 0
    });

    return c.json({ success: true, data: mapProductRecord(record) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * PUT /api/admin/products/:id
 * 更新商品
 */
app.put('/products/:id', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const record = await pb.collection('products').update(id, {
      name: body.name,
      description: body.description,
      long_description: body.long_description,
      price: parseFloat(body.price),
      currency: body.currency,
      category_id: body.category_id,
      tag: body.tag,
      image_url: body.image_url,
      thumbnail_urls: body.thumbnail_urls,
      file_format: body.file_format,
      file_size: body.file_size,
      asset_type: body.asset_type,
      polygon_count: body.polygon_count,
      license_type: body.license_type,
      update_policy: body.update_policy,
      status: body.status,
      is_featured: body.is_featured,
      sort_order: body.sort_order,
      types: body.types,
      packages: body.packages,
      durations: body.durations,
      notices: body.notices,
      admin_note: body.admin_note,
      cost: body.cost ? parseFloat(body.cost) : 0
    });

    return c.json({ success: true, data: mapProductRecord(record) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * PUT /api/admin/products/:id/status
 * 快速更新商品状态
 */
app.put('/products/:id/status', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  const { status } = await c.req.json();

  if (!['active', 'draft', 'archived'].includes(status)) {
    return c.json({ success: false, error: '无效的状态' }, 400);
  }

  try {
    const record = await pb.collection('products').update(id, { status });
    return c.json({ success: true, data: mapProductRecord(record) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * DELETE /api/admin/products/:id
 * 删除商品
 */
app.delete('/products/:id', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const id = c.req.param('id');

  try {
    await pb.collection('products').delete(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// --- 分类管理 (Category Management) ---

/**
 * POST /api/admin/categories
 * 新增分类
 */
app.post('/categories', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const { name, sort_order } = await c.req.json();

  if (!name) {
    return c.json({ success: false, error: '分类名称必填' }, 400);
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  try {
    const record = await pb.collection('categories').create({
      name,
      slug,
      sort_order: sort_order || 0
    });
    return c.json({ success: true, data: record });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * PUT /api/admin/categories/:id
 * 修改分类
 */
app.put('/categories/:id', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  const { name, sort_order } = await c.req.json();

  if (!name) {
    return c.json({ success: false, error: '分类名称必填' }, 400);
  }

  try {
    const record = await pb.collection('categories').update(id, {
      name,
      sort_order: sort_order || 0
    });
    return c.json({ success: true, data: record });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * DELETE /api/admin/categories/:id
 * 删除分类（如果分类下有商品，则不允许删除）
 */
app.delete('/categories/:id', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const id = c.req.param('id');

  try {
    // 检查是否有商品正在使用该分类
    const countResult = await pb.collection('products').getList(1, 1, {
      filter: `category_id = "${id}"`
    });

    if (countResult.totalItems > 0) {
      return c.json({ success: false, error: '该分类下还有商品，不能删除' }, 400);
    }

    await pb.collection('categories').delete(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// --- 订单管理与发货备注交付 (Order Management) ---

/**
 * GET /api/admin/orders
 * 管理后台获取订单列表（支持分页、按单号/状态筛选，按邮箱/昵称搜索下单人）
 */
app.get('/orders', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const { order_no, search, status, page = '1', limit = '10' } = c.req.query();
  
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  try {
    // 1. 如果有全局搜索词，先在用户表中模糊匹配用户 ID
    let userIds: string[] = [];
    if (search) {
      const matchedUsers = await pb.collection('users').getFullList({
        filter: `email ~ "${search.replace(/"/g, '\\"')}" || name ~ "${search.replace(/"/g, '\\"')}"`
      });
      userIds = matchedUsers.map(u => u.id);
    }

    // 2. 拼接订单过滤条件
    const filterList = [];
    if (order_no) {
      filterList.push(`order_no ~ "${order_no.replace(/"/g, '\\"')}"`);
    }
    if (status) {
      filterList.push(`status = "${status}"`);
    }
    if (search) {
      const subConditions = [`order_no ~ "${search.replace(/"/g, '\\"')}"`];
      if (userIds.length > 0) {
        const idFilters = userIds.map(uid => `user_id = "${uid}"`).join(' || ');
        subConditions.push(`(${idFilters})`);
      }
      filterList.push(`(${subConditions.join(' || ')})`);
    }
    const filterString = filterList.join(' && ');

    // 3. 分页拉取订单信息，并级联展开下单人 (user_id) 和订单细项 order_items
    const resultList = await pb.collection('orders').getList(pageNum, limitNum, {
      filter: filterString,
      sort: '-created',
      expand: 'user_id,order_items(order_id)'
    });

    const orders = resultList.items;

    // 4. 并行加载订单细项中涉及的授权资产 (user_assets) 以及产品内部备注 (admin_note)
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const productIds: string[] = [];
      orders.forEach((o: any) => {
        const items = o.expand?.['order_items(order_id)'] || [];
        items.forEach((item: any) => {
          if (item.product_id) productIds.push(item.product_id);
        });
      });
      const uniqueProductIds = [...new Set(productIds)];

      const assetsFilter = orderIds.map(oid => `order_id = "${oid}"`).join(' || ') || 'id = ""';
      const productsFilter = uniqueProductIds.map(pid => `id = "${pid}"`).join(' || ') || 'id = ""';

      const [assetsResult, productsResult] = await Promise.all([
        pb.collection('user_assets').getFullList({ filter: assetsFilter }),
        pb.collection('products').getFullList({ filter: productsFilter })
      ]);

      // 5. 在内存中组合拼装数据，保持与原接口的响应格式完全一致
      orders.forEach((order: any) => {
        // 下单人基本信息
        order.profile = order.expand?.user_id
          ? {
              id: order.expand.user_id.id,
              display_name: order.expand.user_id.name || '匿名用户',
              email: order.expand.user_id.email,
              avatar_url: order.expand.user_id.avatar || null
            }
          : null;

        // 订单细项
        const rawItems = order.expand?.['order_items(order_id)'] || [];
        order.items = rawItems.map((item: any) => {
          const matchedAsset = assetsResult.find(a => a.product_id === item.product_id && a.order_id === order.id);
          const matchedProduct = productsResult.find(p => p.id === item.product_id);
          
          return {
            id: item.id,
            order_id: item.order_id,
            product_id: item.product_id,
            product_name: item.product_name,
            price: item.price,
            quantity: item.quantity,
            package_name: item.package_name || null,
            duration_name: item.duration_name || null,
            variant_type: item.variant_type || null,
            asset_id: matchedAsset?.id || null,
            remark: matchedAsset?.remark || '',
            product_admin_note: matchedProduct?.admin_note || ''
          };
        });
      });
    }

    return c.json({ success: true, data: orders, total: resultList.totalItems });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * PUT /api/admin/orders/:orderId/products/:productId/remark
 * 管理员为某笔订单中购买的商品更新发货交付信息（备注），并自动将订单状态标记为“已完成”
 */
app.put('/orders/:orderId/products/:productId/remark', async (c) => {
  const pb = createPocketBaseClient(c.get('accessToken'));
  const orderId = c.req.param('orderId');
  const productId = c.req.param('productId');
  const { remark } = await c.req.json();

  try {
    // 1. 获取订单主信息拿到关联的用户 id
    const orderRecord = await pb.collection('orders').getOne(orderId);

    // 2. 检查对应的资产记录 user_assets 是否已存在
    const assetsList = await pb.collection('user_assets').getList(1, 1, {
      filter: `order_id = "${orderId}" && product_id = "${productId}"`
    });

    let resultAsset;
    const firstAsset = assetsList.items[0];
    if (firstAsset) {
      // 若已存在，则更新该资产的备注内容
      resultAsset = await pb.collection('user_assets').update(firstAsset.id, {
        remark
      });
    } else {
      // 若未找到，则重新补发一条资产授权信息
      resultAsset = await pb.collection('user_assets').create({
        user_id: orderRecord.user_id,
        product_id: productId,
        order_id: orderId,
        remark: remark,
        license_key: `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      });
    }

    // 3. 将订单状态自动标记为“已完成”
    await pb.collection('orders').update(orderId, {
      status: '已完成'
    });

    return c.json({ success: true, data: resultAsset });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
