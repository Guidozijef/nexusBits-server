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
-- We will use the exact JSON structures that were previously mocked in the frontend
UPDATE products 
SET 
  types = '["账号", "代充", "家庭组账号", "下载号"]'::jsonb,
  packages = '[
    { "id": 1, "name": "基础版", "price": 38, "features": ["标准响应速度", "支持基础模型", "无并发支持"] },
    { "id": 2, "name": "Pro 进阶版", "price": 178, "features": ["优先响应速度", "支持高级模型 (GPT-4等)", "支持插件生态", "高并发额度"], "recommended": true },
    { "id": 3, "name": "Ultra 旗舰版", "price": 599, "features": ["极速专属通道", "所有顶级模型首发访问", "无限量使用", "专属一对一客服支持"] }
  ]'::jsonb,
  durations = '[
    { "id": 1, "name": "12个月(优惠质保30天)", "price_modifier": 10 },
    { "id": 2, "name": "12个月(学生优惠质保20天)", "price_modifier": 0 },
    { "id": 3, "name": "30天(全程质保)", "price_modifier": 21, "tag": "热门" }
  ]'::jsonb
WHERE id > 0;
