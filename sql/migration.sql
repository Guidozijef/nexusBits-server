-- ============================================================
-- NexusBits Database Schema
-- Run this SQL in your Supabase SQL Editor
-- ============================================================

-- ============================================
-- 1. PROFILES (用户扩展信息)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL DEFAULT '匿名用户',
  avatar_url TEXT,
  level VARCHAR(50) NOT NULL DEFAULT '标准',
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);


-- ============================================
-- 2. CATEGORIES (商品分类)
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, slug, sort_order) VALUES
  ('全部', 'all', 0),
  ('脚本', 'scripts', 1),
  ('模型', 'models', 2),
  ('UI组件', 'ui-components', 3),
  ('系统基建', 'infrastructure', 4),
  ('智能合约', 'smart-contracts', 5),
  ('音频资产', 'audio', 6),
  ('动画序列', 'animations', 7),
  ('环境材质', 'materials', 8),
  ('数据节点', 'data-nodes', 9),
  ('神经网络', 'neural-networks', 10),
  ('身份插件', 'identity-plugins', 11),
  ('安全协议', 'security-protocols', 12),
  ('支付网关', 'payment-gateways', 13)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are publicly readable" ON categories FOR SELECT TO anon, authenticated USING (true);


-- ============================================
-- 3. PRODUCTS (商品)
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  long_description TEXT,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'NB',
  category_id INT NOT NULL REFERENCES categories(id),
  tag VARCHAR(100),
  image_url TEXT,
  thumbnail_urls TEXT[],
  file_format VARCHAR(50),
  file_size VARCHAR(50),
  asset_type VARCHAR(50),
  polygon_count VARCHAR(50),
  license_type VARCHAR(50) NOT NULL DEFAULT '商业使用',
  update_policy VARCHAR(50) NOT NULL DEFAULT '终身',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are publicly readable" ON products FOR SELECT TO anon, authenticated USING (status = 'active');

-- ============================================
-- Seed product data (matching current frontend)
-- ============================================
INSERT INTO products (name, description, long_description, price, currency, category_id, tag, image_url, thumbnail_urls, file_format, file_size, asset_type, polygon_count, is_featured, sort_order) VALUES
(
  '量子认证协议 - 最新发布 1',
  '高级加密认证脚本，即插即用，抵抗量子级爆破。附带完整 API 文档。',
  '此量子认证协议是专为下一代分布式网络与去中心化应用架构打造的高级加密认证脚本。支持即插即用部署，内置量子级爆破防御机制，附带完整的 API 文档和集成示例代码。适用于 Web3、DeFi、企业级安全认证等场景。',
  0.45, 'NB', 2, '脚本',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80',
  ARRAY['https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=400&q=80&sig=1','https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=400&q=80&sig=2','https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=400&q=80&sig=3'],
  '.js / .ts', '2.3 MB', '脚本', NULL, TRUE, 1
),
(
  '星云3D资产包 - 最新发布 2',
  '包含 50+ 高精度玻璃态材质几何体，专为 WebGL 引擎优化。',
  '星云3D资产包包含超过50个高精度玻璃态材质几何体，所有资产均已在主流渲染引擎（如 Three.js, WebGL）中进行过深度优化，确保复杂场景下依然维持 60fps 以上的流畅体验。包含PBR材质贴图和预设灯光配置。',
  0.55, 'NB', 3, '模型',
  'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=800&q=80',
  ARRAY['https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=400&q=80&sig=1','https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=400&q=80&sig=2','https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=400&q=80&sig=3'],
  '.OBJ / .FBX', '142 MB', '3D 模型', '45,200', TRUE, 2
),
(
  '突触仪表盘套件 - 最新发布 3',
  '极简科幻风格 Vue 面板组件库，内置动态图表与深色主题支持。',
  '突触仪表盘套件是一套极简科幻风格的 Vue 面板组件库，内置动态图表与深色主题支持。完美适配数据大屏与科幻风仪表盘。包含 20+ 预制组件，支持自定义主题配色和响应式布局。',
  0.65, 'NB', 4, 'UI组件',
  'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=800&q=80',
  ARRAY['https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=400&q=80&sig=1','https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=400&q=80&sig=2','https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=400&q=80&sig=3'],
  '.vue', '8.5 MB', 'UI 组件库', NULL, TRUE, 3
),
(
  '核心节点许可 - 最新发布 4',
  '限量发行的底层网络节点许可，享受全网资产交易的手续费分红。',
  '核心节点许可是限量发行的底层网络节点运营许可证，持有者可享受全网资产交易的手续费分红。附带核心加密算法模块、预编译的节点客户端，以及可供前端直接调用的 API SDK。自适应玻璃态外壳能够根据当前网络的吞吐量和负载自动调节视觉反馈。',
  5.00, 'NB', 5, '系统基建',
  'https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=800&q=80',
  ARRAY['https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=400&q=80&sig=1','https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=400&q=80&sig=2','https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=400&q=80&sig=3'],
  '.bin / .key', '256 KB', '系统许可', NULL, TRUE, 4
),
(
  '量子认证协议 v2.0',
  '第二代量子加密认证，支持多链协议和零知识证明。',
  '第二代量子认证协议，在初代基础上新增多链协议支持和零知识证明机制。内置跨链身份验证桥接器，支持 EVM 兼容链和 Solana 生态，附带完整的 SDK 和文档。',
  0.75, 'NB', 2, '脚本',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80&sig=5',
  NULL, '.js / .ts', '3.1 MB', '脚本', NULL, TRUE, 5
),
(
  '深渊数据可视化引擎',
  '实时数据流可视化引擎，支持百万级数据点高帧率渲染。',
  '深渊数据可视化引擎是一款高性能实时数据流可视化工具，基于 WebGL 2.0 和计算着色器，支持百万级数据点的高帧率渲染。内置力导向图、时序热力图、3D 地理信息等多种可视化模式。',
  1.50, 'NB', 4, 'UI组件',
  'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=800&q=80&sig=6',
  NULL, '.js / .wasm', '18.7 MB', '可视化引擎', NULL, TRUE, 6
),
(
  '幻影代理网络套件',
  '去中心化代理网络基础设施，内置流量混淆和节点自动发现。',
  '幻影代理网络套件提供完整的去中心化代理网络基础设施解决方案，内置流量混淆算法和P2P节点自动发现机制。支持自定义路由策略，适用于隐私保护和分布式计算场景。',
  3.20, 'NB', 5, '系统基建',
  'https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=800&q=80&sig=7',
  NULL, '.bin / .conf', '45 MB', '网络工具', NULL, TRUE, 7
),
(
  '赛博合成音效库',
  '200+ 未来感音效样本，覆盖 UI 交互、环境、电子音乐创作。',
  '赛博合成音效库包含 200+ 未来感音效样本，涵盖 UI 交互音效、科幻环境音、电子音乐元素等分类。所有样本均以 48kHz / 24bit 高质量格式录制，支持 WAV 和 OGG 格式，可直接用于游戏、应用和多媒体项目。',
  0.90, 'NB', 7, '音频资产',
  'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=800&q=80&sig=8',
  NULL, '.wav / .ogg', '320 MB', '音频包', NULL, TRUE, 8
),
-- Additional non-featured products for AllAssets page
(
  '智能合约审计工具',
  'Solidity 智能合约静态分析和安全审计工具链，自动检测常见漏洞。',
  NULL, 2.10, 'NB', 6, '智能合约',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80&sig=9',
  NULL, '.js / .py', '12 MB', '开发工具', NULL, FALSE, 9
),
(
  '粒子动画序列包',
  '30+ 预制粒子动画效果，支持 CSS 和 Canvas 两种渲染模式。',
  NULL, 0.60, 'NB', 8, '动画序列',
  'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=800&q=80&sig=10',
  NULL, '.json / .css', '4.2 MB', '动画', NULL, FALSE, 10
),
(
  '全息环境材质贴图集',
  '高分辨率全息/赛博朋克风格 PBR 材质，支持各大 3D 引擎。',
  NULL, 1.80, 'NB', 9, '环境材质',
  'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=800&q=80&sig=11',
  NULL, '.png / .exr', '890 MB', '材质贴图', NULL, FALSE, 11
),
(
  '分布式数据节点管理器',
  '轻量级数据节点编排工具，支持自动扩缩容和健康检查。',
  NULL, 4.50, 'NB', 10, '数据节点',
  'https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=800&q=80&sig=12',
  NULL, '.go / .bin', '28 MB', '运维工具', NULL, FALSE, 12
),
(
  '神经网络推理加速器',
  '边缘端 AI 推理加速中间件，支持 ONNX 和 TensorFlow Lite 模型。',
  NULL, 6.00, 'NB', 11, '神经网络',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80&sig=13',
  NULL, '.wasm / .py', '56 MB', 'AI 工具', NULL, FALSE, 13
),
(
  '去中心化身份插件',
  'Web3 DID 身份验证插件，支持 MetaMask 和 WalletConnect。',
  NULL, 1.20, 'NB', 12, '身份插件',
  'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=800&q=80&sig=14',
  NULL, '.js', '1.8 MB', '插件', NULL, FALSE, 14
),
(
  '跨链支付网关SDK',
  '多链支付集成 SDK，支持 ETH、BSC、Polygon 等主流链。',
  NULL, 3.50, 'NB', 13, '安全协议',
  'https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=800&q=80&sig=15',
  NULL, '.ts / .sol', '5.6 MB', 'SDK', NULL, FALSE, 15
),
(
  '量子防护盾 v3',
  '企业级量子安全防护方案，支持后量子密码算法 CRYSTALS-Kyber。',
  NULL, 8.00, 'NB', 13, '安全协议',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80&sig=16',
  NULL, '.rs / .wasm', '15 MB', '安全方案', NULL, FALSE, 16
),
(
  '赛博地形生成器',
  '过程化赛博朋克城市地形生成，支持实时编辑和导出。',
  NULL, 2.80, 'NB', 3, '模型',
  'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&w=800&q=80&sig=17',
  NULL, '.fbx / .glb', '230 MB', '3D 生成器', NULL, FALSE, 17
),
(
  '分布式日志聚合器',
  '高性能日志收集和聚合服务，支持结构化查询和实时告警。',
  NULL, 1.60, 'NB', 10, '数据节点',
  'https://images.unsplash.com/photo-1518433278981-95ec50e64c20?auto=format&fit=crop&w=800&q=80&sig=18',
  NULL, '.go', '33 MB', '运维工具', NULL, FALSE, 18
),
(
  '全息 UI 动效库',
  '基于 GSAP 的高级全息 UI 动效组件集，开箱即用。',
  NULL, 0.95, 'NB', 8, '动画序列',
  'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=800&q=80&sig=19',
  NULL, '.js / .css', '6.3 MB', '动效库', NULL, FALSE, 19
),
(
  'DeFi 流动性机器人',
  '自动化做市和套利策略执行器，支持 Uniswap V3 和 PancakeSwap。',
  NULL, 12.00, 'NB', 6, '智能合约',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80&sig=20',
  NULL, '.sol / .ts', '4.1 MB', '交易工具', NULL, FALSE, 20
);


-- ============================================
-- 4. CART_ITEMS (购物车)
-- ============================================
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own cart" ON cart_items FOR ALL USING (auth.uid() = user_id);


-- ============================================
-- 5. ORDERS + ORDER_ITEMS (订单)
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT '已完成' CHECK (status IN ('待支付', '已完成', '已过期', '已取消')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own order items" ON order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
);


-- ============================================
-- 6. USER_ASSETS (用户已购资产)
-- ============================================
CREATE TABLE IF NOT EXISTS user_assets (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  order_id INT REFERENCES orders(id),
  license_key VARCHAR(255),
  remark TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add column to existing table if schema was already created
ALTER TABLE user_assets ADD COLUMN IF NOT EXISTS remark TEXT;

-- Drop the old unique constraint to allow multiple purchases of the same product (matching order count)
ALTER TABLE user_assets DROP CONSTRAINT IF EXISTS user_assets_user_id_product_id_key;

ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own assets" ON user_assets FOR SELECT USING (auth.uid() = user_id);

-- Data Migration: Reconstruct missing user assets for old completed orders
INSERT INTO user_assets (user_id, product_id, order_id, remark, acquired_at)
SELECT 
  o.user_id,
  oi.product_id,
  o.id as order_id,
  '历史订单迁移数据：系统自动补齐授权交付信息。' as remark,
  o.created_at as acquired_at
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.status = '已完成'
  AND NOT EXISTS (
    SELECT 1 
    FROM user_assets ua 
    WHERE ua.user_id = o.user_id 
      AND ua.product_id = oi.product_id 
      AND ua.order_id = o.id
  );


-- ============================================
-- 7. RECHARGE_RECORDS (充值记录)
-- ============================================
CREATE TABLE IF NOT EXISTS recharge_records (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recharge_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recharge records" ON recharge_records FOR SELECT USING (auth.uid() = user_id);
