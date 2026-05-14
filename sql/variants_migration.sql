-- ============================================================
-- NexusBits DB Migration: Product Variants Support
-- Please run this script in your Supabase SQL Editor
-- ============================================================

-- 1. Add JSONB variant columns to `products` table
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS types JSONB,
  ADD COLUMN IF NOT EXISTS packages JSONB,
  ADD COLUMN IF NOT EXISTS durations JSONB,
  ADD COLUMN IF NOT EXISTS notices JSONB;

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
  ]'::jsonb,
  notices = '[
    "此资产为数字加密虚拟商品，一经购买获取密钥后，<span class=\"text-error font-bold\">概不退款</span>。",
    "附带的商业授权允许您在无限制的最终商业项目中合法使用。",
    "严禁将原始模型与代码文件直接转售或进行任何形式的重新打包分发。",
    "如需部署至生产级主网环境，请务必确保您的宿主服务器具备足够资源支持其实时重构机制。"
  ]'::jsonb
WHERE id > 0;

-- Update one specific product to demonstrate rich text long_description
UPDATE products SET
  long_description = '<p>此量子认证协议是专为下一代分布式网络与去中心化应用架构打造的高级加密认证脚本。</p><br><p><strong>核心优势：</strong></p><ul><li>支持即插即用部署，内置量子级爆破防御机制。</li><li>附带完整的 API 文档和<span style="color:#00E5FF">集成示例代码</span>。</li></ul><br><img src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80" alt="Demonstration" />'
WHERE id = 1;
