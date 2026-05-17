import { Hono } from 'hono';
import { createSupabaseClient } from '../lib/supabase';
import type { ApiResponse, PaginatedResponse, Product, Variables } from '../types';

const products = new Hono<{ Variables: Variables }>();

const PUBLIC_PRODUCT_FIELDS = 'id, name, description, long_description, price, currency, category_id, tag, image_url, thumbnail_urls, file_format, file_size, asset_type, polygon_count, license_type, update_policy, status, is_featured, sort_order, created_at, updated_at, types, packages, durations, notices';

/**
 * GET /api/products
 * List products with pagination, category filter, and search
 * Query params: page, limit, category_id, search
 */
products.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '12');
  const categoryId = c.req.query('category_id');
  const search = c.req.query('search');
  const offset = (page - 1) * limit;

  const supabase = createSupabaseClient();

  // Build query
  let query = supabase
    .from('products')
    .select(`${PUBLIC_PRODUCT_FIELDS}, category:categories(id, name, slug)`, { count: 'exact' })
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  // Category filter (skip if "all" or not provided)
  if (categoryId && categoryId !== '0') {
    query = query.eq('category_id', parseInt(categoryId));
  }

  // Search filter
  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<PaginatedResponse<Product>>({
    success: true,
    data: data || [],
    total: count || 0,
    page,
    limit
  });
});

/**
 * GET /api/products/featured
 * Get featured products for the homepage (limited to 8)
 */
products.get('/featured', async (c) => {
  const limit = parseInt(c.req.query('limit') || '8');
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('products')
    .select(`${PUBLIC_PRODUCT_FIELDS}, category:categories(id, name, slug)`)
    .eq('status', 'active')
    .eq('is_featured', true)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({
    success: true,
    data: data || []
  });
});

/**
 * GET /api/products/search
 * Search products by keyword
 */
products.get('/search', async (c) => {
  const q = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '20');

  if (!q || q.trim().length === 0) {
    return c.json<ApiResponse>({ success: true, data: [] });
  }

  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, currency, tag, image_url')
    .eq('status', 'active')
    .or(`name.ilike.%${q}%,description.ilike.%${q}%,tag.ilike.%${q}%`)
    .limit(limit);

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse>({ success: true, data: data || [] });
});

/**
 * GET /api/products/:id
 * Get product detail by ID
 */
products.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json<ApiResponse>({ success: false, error: '无效的商品ID' }, 400);
  }

  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('products')
    .select(`${PUBLIC_PRODUCT_FIELDS}, category:categories(id, name, slug)`)
    .eq('id', id)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return c.json<ApiResponse>({ success: false, error: '商品不存在' }, 404);
  }

  return c.json<ApiResponse>({ success: true, data });
});

export default products;
