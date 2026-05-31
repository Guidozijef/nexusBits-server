import { Hono } from 'hono';
import { createPocketBaseClient } from '../lib/pocketbase';
import type { ApiResponse, PaginatedResponse, Product, Variables } from '../types';

const products = new Hono<{ Variables: Variables }>();

/**
 * 辅助函数：将 PocketBase 的 Record 映射为符合 Hono/前端类型的 Product 对象 (Helper: Map PocketBase Record to Product type)
 */
function mapProductRecord(item: any): Product {
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
    created_at: item.created,
    updated_at: item.updated,
    types: item.types || null,
    packages: item.packages || null,
    durations: item.durations || null,
    notices: item.notices || null,
    admin_note: item.admin_note || null,
    cost: item.cost || 0,
    category: item.expand?.category_id
      ? {
          id: item.expand.category_id.id,
          name: item.expand.category_id.name,
          slug: item.expand.category_id.slug,
          sort_order: item.expand.category_id.sort_order
        }
      : undefined
  };
}

/**
 * GET /api/products
 * 商品列表接口，支持分页、按分类筛选和关键字搜索 (Product listing endpoint, sorted by newest created time)
 */
products.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '12');
  const categoryId = c.req.query('category_id');
  const search = c.req.query('search');

  const pb = createPocketBaseClient();

  // 构建 PocketBase 过滤条件 (Construct PocketBase filter conditions)
  const filterList: string[] = ["status = 'active'"];

  if (categoryId && categoryId !== '0' && categoryId !== 'all') {
    filterList.push(`category_id = "${categoryId}"`);
  }

  if (search) {
    const cleanSearch = search.replace(/"/g, '\\"');
    filterList.push(`(name ~ "${cleanSearch}" || description ~ "${cleanSearch}")`);
  }

  const filterString = filterList.join(' && ');

  try {
    const resultList = await pb.collection('products').getList(page, limit, {
      filter: filterString,
      sort: '-created', // 保证最新的数据展示在最前面 (Ensure the newest data is shown first)
      expand: 'category_id'
    });

    const mappedData = resultList.items.map(mapProductRecord);

    return c.json<PaginatedResponse<Product>>({
      success: true,
      data: mappedData,
      total: resultList.totalItems,
      page,
      limit
    });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/products/featured
 * 获取精选商品列表（限制数量，默认 8 个，最新的排前面）(Get featured products, sorted by newest)
 */
products.get('/featured', async (c) => {
  const limit = parseInt(c.req.query('limit') || '8');
  const pb = createPocketBaseClient();

  try {
    const resultList = await pb.collection('products').getList(1, limit, {
      filter: "status = 'active' && is_featured = true",
      sort: '-created', // 最新的精选排在最前面 (Newest featured products first)
      expand: 'category_id'
    });

    const mappedData = resultList.items.map(mapProductRecord);

    return c.json<ApiResponse>({
      success: true,
      data: mappedData
    });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/products/search
 * 快速搜索商品，按最新时间排序 (Search products, sorted by newest)
 */
products.get('/search', async (c) => {
  const q = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '20');

  if (!q || q.trim().length === 0) {
    return c.json<ApiResponse>({ success: true, data: [] });
  }

  const pb = createPocketBaseClient();
  const cleanQ = q.replace(/"/g, '\\"');

  try {
    const resultList = await pb.collection('products').getList(1, limit, {
      filter: `status = 'active' && (name ~ "${cleanQ}" || description ~ "${cleanQ}" || tag ~ "${cleanQ}")`,
      sort: '-created', // 搜索结果也按最新时间排序 (Search results sorted by newest)
      expand: 'category_id'
    });

    const data = resultList.items.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      currency: item.currency || 'NB',
      tag: item.tag || null,
      image_url: item.image_url || null
    }));

    return c.json<ApiResponse>({ success: true, data });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/products/:id
 * 获取商品详情（通过字符串 ID） (Get single product details by string ID)
 */
products.get('/:id', async (c) => {
  const id = c.req.param('id');

  if (!id || id.trim().length === 0) {
    return c.json<ApiResponse>({ success: false, error: '无效的商品ID' }, 400);
  }

  const pb = createPocketBaseClient();

  try {
    const record = await pb.collection('products').getOne(id, {
      expand: 'category_id'
    });

    if (record.status !== 'active') {
      return c.json<ApiResponse>({ success: false, error: '商品未上架' }, 404);
    }

    return c.json<ApiResponse>({
      success: true,
      data: mapProductRecord(record)
    });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: '商品不存在' }, 404);
  }
});

export default products;
