-- ============================================================
-- NexusBits DB Migration: Product Variants Support
-- Please run this script in your Supabase SQL Editor
-- ============================================================

-- 1. Add JSONB variant columns to `products` table
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS types JSONB,
  ADD COLUMN IF NOT EXISTS packages JSONB,
  ADD COLUMN IF NOT EXISTS durations JSONB;

-- 2. Add variant recording columns to `order_items` table
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS package_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS duration_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS variant_type VARCHAR(200);

-- 3. Populate existing products with default variant data
-- Utilizing hierarchical relational filters (type_idxs and pkg_ids)
UPDATE products 
SET 
  types = '["标准账号", "高级代充"]'::jsonb,
  packages = '[
    { "id": 1, "name": "基础版", "price": 38, "features": ["标准响应", "支持基础模型", "无并发支持"], "type_idxs": [0] },
    { "id": 2, "name": "Pro 进阶版", "price": 178, "features": ["优先响应", "支持高级模型", "支持插件生态"], "recommended": true, "type_idxs": [0] },
    { "id": 3, "name": "代充专属套餐", "price": 299, "features": ["极速到账", "安全质保", "1v1专属客服"], "type_idxs": [1] },
    { "id": 4, "name": "通用旗舰至尊版", "price": 999, "features": ["全类型通用", "无限量使用", "附赠全部资产"] }
  ]'::jsonb,
  durations = '[
    { "id": 1, "name": "1个月 (试用)", "price_modifier": 0, "pkg_ids": [1] },
    { "id": 2, "name": "12个月 (优惠质保30天)", "price_modifier": 10, "pkg_ids": [1, 2] },
    { "id": 3, "name": "单次直充", "price_modifier": 0, "pkg_ids": [3] },
    { "id": 4, "name": "终身全程质保", "price_modifier": 50, "tag": "热门" }
  ]'::jsonb
WHERE id > 0;
