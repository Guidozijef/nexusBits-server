import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { createSupabaseClient } from '../lib/supabase';
import type { Variables } from '../types';

const app = new Hono<{ Variables: Variables }>();

// All admin routes require auth and admin privileges
app.use('*', authMiddleware, adminMiddleware);

// --- User Management ---

app.get('/users', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  
  const { data, error, count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data, total: count });
});

// --- Product Management ---

// Get all products with filtering
app.get('/products', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const { name, category_id, status } = c.req.query();
  
  let query = supabase
    .from('products')
    .select(`
      *,
      category:categories(id, name)
    `, { count: 'exact' });

  if (name) {
    query = query.ilike('name', `%${name}%`);
  }
  if (category_id) {
    query = query.eq('category_id', category_id);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false });

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data, total: count });
});

// Get single product for editing (includes admin_note)
app.get('/products/:id', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(id, name)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return c.json({ success: false, error: error?.message || '商品不存在' }, 404);
  }

  return c.json({ success: true, data });
});

// Create product
app.post('/products', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const body = await c.req.json();
  
  // Basic validation (can be expanded)
  if (!body.name || !body.price || !body.category_id) {
    return c.json({ success: false, error: '缺少必填字段' }, 400);
  }

  const { data, error } = await supabase
    .from('products')
    .insert([{
      name: body.name,
      description: body.description,
      long_description: body.long_description,
      price: body.price,
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
      types: body.types,
      packages: body.packages,
      durations: body.durations,
      notices: body.notices,
      admin_note: body.admin_note,
      cost: body.cost || 0
    }])
    .select()
    .single();

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data });
});

// Update product
app.put('/products/:id', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  const body = await c.req.json();

  const { data, error } = await supabase
    .from('products')
    .update({
      name: body.name,
      description: body.description,
      long_description: body.long_description,
      price: body.price,
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
      cost: body.cost,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data });
});

// Update product status
app.put('/products/:id/status', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  const { status } = await c.req.json();

  if (!['active', 'draft', 'archived'].includes(status)) {
    return c.json({ success: false, error: '无效的状态' }, 400);
  }

  const { data, error } = await supabase
    .from('products')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data });
});

// Delete product
app.delete('/products/:id', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const id = c.req.param('id');

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true });
});

// --- Category Management ---

// Create category
app.post('/categories', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const { name, icon, sort_order } = await c.req.json();

  if (!name) {
    return c.json({ success: false, error: '分类名称必填' }, 400);
  }

  const { data, error } = await supabase
    .from('categories')
    .insert([{ name, icon, sort_order: sort_order || 0 }])
    .select()
    .single();

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data });
});

// Update category
app.put('/categories/:id', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const id = c.req.param('id');
  const { name, icon, sort_order } = await c.req.json();

  if (!name) {
    return c.json({ success: false, error: '分类名称必填' }, 400);
  }

  const { data, error } = await supabase
    .from('categories')
    .update({ name, icon, sort_order: sort_order || 0 })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data });
});

// Delete category
app.delete('/categories/:id', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const id = c.req.param('id');

  // Check if there are products in this category
  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id);

  if (countError) {
    return c.json({ success: false, error: countError.message }, 500);
  }

  if (count && count > 0) {
    return c.json({ success: false, error: '该分类下还有商品，不能删除' }, 400);
  }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true });
});

// --- Order Management ---

// Get all orders with filtering and pagination
app.get('/orders', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const { order_no, search, status, page = '1', limit = '10' } = c.req.query();
  
  const from = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const to = from + parseInt(limit, 10) - 1;

  let userIds: string[] = [];
  if (search) {
    // Look up users matching search term (email or display name)
    const { data: matchedUsers } = await supabase
      .from('profiles')
      .select('id')
      .or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
    if (matchedUsers && matchedUsers.length > 0) {
      userIds = matchedUsers.map(u => u.id);
    }
  }

  let query = supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*)
    `, { count: 'exact' });

  if (order_no) {
    query = query.ilike('order_no', `%${order_no}%`);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    if (userIds.length > 0) {
      query = query.or(`user_id.in.(${userIds.join(',')}),order_no.ilike.%${search}%`);
    } else {
      query = query.ilike('order_no', `%${search}%`);
    }
  }

  const { data: orders, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  // Load and merge profiles, user_assets and product admin_notes in-memory
  if (orders && orders.length > 0) {
    const uniqueUserIds = [...new Set(orders.map(o => o.user_id))];
    const orderIds = orders.map(o => o.id);
    
    // Extract unique product IDs from order items
    const productIds: number[] = [];
    orders.forEach((o: any) => {
      if (o.items) {
        o.items.forEach((item: any) => {
          if (item.product_id) {
            productIds.push(item.product_id);
          }
        });
      }
    });
    const uniqueProductIds = [...new Set(productIds)];

    // Concurrently fetch profiles, assets and product notes in separate clean queries
    const [profilesResult, assetsResult, productsResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, email, avatar_url').in('id', uniqueUserIds),
      supabase.from('user_assets').select('*').in('order_id', orderIds),
      supabase.from('products').select('id, admin_note').in('id', uniqueProductIds)
    ]);

    const profiles = profilesResult.data || [];
    const assets = assetsResult.data || [];
    const products = productsResult.data || [];

    orders.forEach((order: any) => {
      // Bind profile in-memory
      order.profile = profiles.find(p => p.id === order.user_id) || null;

      // Bind assets and product notes in-memory to items
      order.items = order.items.map((item: any) => {
        const asset = assets.find(a => a.product_id === item.product_id && a.order_id === order.id);
        const product = products.find(p => p.id === item.product_id);
        return {
          ...item,
          asset_id: asset?.id || null,
          remark: asset?.remark || '',
          product_admin_note: product?.admin_note || ''
        };
      });
    });
  }

  return c.json({ success: true, data: orders, total: count });
});

// Update or create remark for a purchased product in an order
app.put('/orders/:orderId/products/:productId/remark', async (c) => {
  const supabase = createSupabaseClient(c.get('accessToken'));
  const orderId = parseInt(c.req.param('orderId'), 10);
  const productId = parseInt(c.req.param('productId'), 10);
  const { remark } = await c.req.json();

  // 1. Fetch order details to retrieve user_id
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('user_id')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return c.json({ success: false, error: '未找到该订单信息' }, 404);
  }

  // 2. Check if a user_asset record already exists for this order + product
  const { data: existingAsset } = await supabase
    .from('user_assets')
    .select('id')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .maybeSingle();

  let result;
  if (existingAsset) {
    // Update existing remark
    result = await supabase
      .from('user_assets')
      .update({ remark, acquired_at: new Date().toISOString() })
      .eq('id', existingAsset.id)
      .select()
      .single();
  } else {
    // Reconstruct asset if missing
    result = await supabase
      .from('user_assets')
      .insert([{
        user_id: order.user_id,
        product_id: productId,
        order_id: orderId,
        remark: remark,
        license_key: `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      }])
      .select()
      .single();
  }

  if (result.error) {
    return c.json({ success: false, error: result.error.message }, 500);
  }

  // 3. Automatically update the order status to '已完成' since remarks/delivery info is updated
  await supabase
    .from('orders')
    .update({ status: '已完成', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  return c.json({ success: true, data: result.data });
});

export default app;
