import { Hono } from 'hono';
import { createSupabaseClient } from '../lib/supabase';
import type { ApiResponse, Category } from '../types';

const categories = new Hono();

/**
 * GET /api/categories
 * Get all categories sorted by sort_order
 */
categories.get('/', async (c) => {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 500);
  }

  return c.json<ApiResponse<Category[]>>({
    success: true,
    data: data || []
  });
});

export default categories;
