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
      notices: body.notices
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

export default app;
