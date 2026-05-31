import { Hono } from 'hono';
import { createPocketBaseClient } from '../lib/pocketbase';
import type { ApiResponse, Category } from '../types';

const categories = new Hono();

/**
 * GET /api/categories
 * 获取全部分类，并按 sort_order 升序排序
 */
categories.get('/', async (c) => {
  const pb = createPocketBaseClient();

  try {
    const records = await pb.collection('categories').getFullList({
      sort: 'sort_order'
    });

    const data: Category[] = records.map((item: any) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      sort_order: item.sort_order
    }));

    return c.json<ApiResponse<Category[]>>({
      success: true,
      data: data
    });
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

export default categories;
