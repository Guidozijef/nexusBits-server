# NexusBits Server 后端 API 服务 + 前端集成

基于对 nexusBits 前端项目的全面分析，设计一套完整的 Hono + Supabase 后端服务，并将前端所有硬编码数据替换为 API 请求。

## 前端数据分析摘要

通过分析前端代码，提取出以下需要后端支持的数据模块：

| 模块 | 当前状态 | 需要接口 |
|------|---------|---------|
| **用户认证** (Login.vue) | 模拟登录，无真实验证 | ✅ 注册/登录/JWT |
| **商品列表** (Market.vue) | 硬编码4个baseItems，循环生成8个 | ✅ 首页推荐商品列表 |
| **商品分类** (AllAssets.vue) | 硬编码14个分类 + 48个商品 | ✅ 分类列表 + 分类筛选商品 |
| **商品详情** (Details.vue) | 完全硬编码固定数据 | ✅ 按ID获取商品详情 |
| **购物车** (Cart.vue + store.ts) | 前端内存 reactive store | ✅ 持久化购物车 |
| **订单** (Profile.vue) | 硬编码3条订单 | ✅ 订单CRUD |
| **用户信息** (Profile.vue) | 硬编码用户名/余额 | ✅ 用户信息/余额 |
| **充值** (Profile.vue) | 直接修改前端变量 | ✅ 充值接口 |
| **搜索** (Navbar.vue) | 有输入框但无功能 | ✅ 搜索接口 |

## User Review Required

> [!IMPORTANT]
> **Supabase 配置信息**：你需要提供 Supabase 项目的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`（以及可选的 `SUPABASE_SERVICE_ROLE_KEY`），这些需在 `.env` 中配置。

> [!IMPORTANT]
> **运行时选择**：计划使用 **Node.js** 作为 Hono 运行时（方便阿里云部署），而非 Bun。如果你更希望用 Bun，请告知。

> [!WARNING]
> **认证方案**：计划使用 Supabase Auth（内置的用户认证系统），而非自行实现 JWT。Supabase Auth 提供完整的注册/登录/Token 管理。如你需要自定义 JWT 方案，请说明。

## Open Questions

> [!IMPORTANT]
> **商品图片**：当前商品图片使用 Unsplash 外链，后端是否需要支持图片上传到 Supabase Storage？还是继续使用外链 URL 存储在数据库字段中即可？

---

## 一、数据库设计 (Supabase SQL)

### 1. 用户扩展表 `profiles`

Supabase Auth 自动管理 `auth.users` 表，我们创建 `profiles` 表存储额外信息：

```sql
-- 用户扩展信息表
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL DEFAULT '匿名用户',
  avatar_url TEXT,
  level VARCHAR(50) NOT NULL DEFAULT '标准',
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 新用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', '匿名用户'), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS 策略
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
```

### 2. 商品分类表 `categories`

```sql
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 插入默认分类数据
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
  ('支付网关', 'payment-gateways', 13);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are publicly readable" ON categories FOR SELECT TO anon, authenticated USING (true);
```

### 3. 商品表 `products`

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  long_description TEXT,         -- 详情页详细描述
  price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'NB',
  category_id INT NOT NULL REFERENCES categories(id),
  tag VARCHAR(100),              -- 标签（关联分类名或自定义）
  image_url TEXT,                -- 主图
  thumbnail_urls TEXT[],         -- 缩略图数组
  file_format VARCHAR(50),       -- 如 ".OBJ / .FBX"
  file_size VARCHAR(50),         -- 如 "142 MB"
  asset_type VARCHAR(50),        -- 如 "3D 模型"
  polygon_count VARCHAR(50),     -- 如 "45,200"
  license_type VARCHAR(50) NOT NULL DEFAULT '商业使用',
  update_policy VARCHAR(50) NOT NULL DEFAULT '终身',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否首页精选
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_products_name_search ON products USING GIN (to_tsvector('simple', name || ' ' || COALESCE(description, '')));

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are publicly readable" ON products FOR SELECT TO anon, authenticated USING (status = 'active');
```

### 4. 购物车表 `cart_items`

```sql
CREATE TABLE cart_items (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own cart" ON cart_items
  FOR ALL USING (auth.uid() = user_id);
```

### 5. 订单表 `orders` + `order_items`

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(50) NOT NULL UNIQUE,  -- 如 "#NXB-77291A"
  user_id UUID NOT NULL REFERENCES auth.users(id),
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT '已完成' CHECK (status IN ('待支付', '已完成', '已过期', '已取消')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,  -- 冗余存储，防止商品修改后订单数据丢失
  price DECIMAL(12, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );
```

### 6. 用户资产表 `user_assets` (购买后获得的资产)

```sql
CREATE TABLE user_assets (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  order_id INT REFERENCES orders(id),
  license_key VARCHAR(255),        -- 资产密钥
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own assets" ON user_assets
  FOR SELECT USING (auth.uid() = user_id);
```

### 7. 充值记录表 `recharge_records`

```sql
CREATE TABLE recharge_records (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recharge_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recharge records" ON recharge_records
  FOR SELECT USING (auth.uid() = user_id);
```

---

## 二、后端项目结构 (nexusBits-server)

```
nexusBits-server/
├── src/
│   ├── index.ts                  # 入口，Hono app 初始化
│   ├── lib/
│   │   └── supabase.ts           # Supabase client 初始化
│   ├── middleware/
│   │   └── auth.ts               # JWT 认证中间件
│   ├── routes/
│   │   ├── auth.ts               # 认证路由 (注册/登录)
│   │   ├── products.ts           # 商品路由 (列表/详情/搜索)
│   │   ├── categories.ts         # 分类路由
│   │   ├── cart.ts               # 购物车路由
│   │   ├── orders.ts             # 订单路由
│   │   └── user.ts               # 用户路由 (信息/余额/充值)
│   └── types/
│       └── index.ts              # TypeScript 类型定义
├── .env                          # 环境变量
├── .env.example                  # 环境变量模板
├── package.json
├── tsconfig.json
└── README.md
```

---

## 三、API 接口设计

### 认证模块 `/api/auth`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 注册新用户 | ❌ |
| POST | `/api/auth/login` | 邮箱密码登录 | ❌ |
| POST | `/api/auth/logout` | 注销 | ✅ |
| GET  | `/api/auth/me` | 获取当前用户信息 | ✅ |

### 商品模块 `/api/products`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/products` | 商品列表 (分页、筛选、搜索) | ❌ |
| GET | `/api/products/featured` | 首页精选商品 (限8条) | ❌ |
| GET | `/api/products/:id` | 商品详情 | ❌ |
| GET | `/api/products/search?q=xxx` | 搜索商品 | ❌ |

### 分类模块 `/api/categories`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/categories` | 全部分类列表 | ❌ |

### 购物车模块 `/api/cart`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/cart` | 获取当前用户购物车 | ✅ |
| POST | `/api/cart` | 添加商品到购物车 | ✅ |
| DELETE | `/api/cart/:productId` | 移除购物车商品 | ✅ |
| DELETE | `/api/cart` | 清空购物车 | ✅ |

### 订单模块 `/api/orders`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/orders` | 获取用户订单列表 (分页) | ✅ |
| POST | `/api/orders` | 创建订单 (从购物车结算) | ✅ |
| POST | `/api/orders/direct` | 直接购买 (立即支付) | ✅ |

### 用户模块 `/api/user`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/user/profile` | 获取用户 profile | ✅ |
| PUT | `/api/user/profile` | 更新用户 profile (昵称等) | ✅ |
| GET | `/api/user/balance` | 获取余额 | ✅ |
| POST | `/api/user/recharge` | 充值 | ✅ |
| GET | `/api/user/assets` | 获取已购资产列表 | ✅ |

---

## 四、前端改造计划 (nexusBits)

### 新增文件

#### [NEW] `src/api/index.ts` — API 请求封装层
- 封装 `fetch` 请求，统一处理 baseURL、请求头（Authorization Bearer token）、错误处理
- 导出各模块的 API 方法

#### [NEW] `src/api/auth.ts` — 认证 API
#### [NEW] `src/api/products.ts` — 商品 API
#### [NEW] `src/api/cart.ts` — 购物车 API
#### [NEW] `src/api/orders.ts` — 订单 API
#### [NEW] `src/api/user.ts` — 用户 API

---

### 修改文件

#### [MODIFY] `src/store.ts`
- 添加 `user` 状态（登录用户信息、token）
- 添加 `isLoggedIn` 计算属性
- 购物车改为 API 同步模式
- 余额从后端获取

#### [MODIFY] `src/views/Login.vue`
- `handleLogin` 改为调用 `POST /api/auth/login`
- 新增注册表单切换（调用 `POST /api/auth/register`）
- 登录成功后保存 token 到 localStorage + store

#### [MODIFY] `src/views/Market.vue`
- `latestItems` 改为 `onMounted` 调用 `GET /api/products/featured`
- 添加 loading 状态

#### [MODIFY] `src/views/AllAssets.vue`
- `categories` 改为 `GET /api/categories`
- `items` 改为 `GET /api/products?category=xxx&page=1&limit=12`
- 无限滚动改为 API 分页加载

#### [MODIFY] `src/views/Details.vue`
- 根据路由 `id` 调用 `GET /api/products/:id` 获取商品详情
- 购买/加购改为调用 API

#### [MODIFY] `src/views/Profile.vue`
- 用户信息从 `GET /api/user/profile` 获取
- 订单从 `GET /api/orders` 获取
- 充值调用 `POST /api/user/recharge`

#### [MODIFY] `src/components/Navbar.vue`
- 搜索框调用 `GET /api/products/search?q=xxx`
- 购物车数量从后端同步

#### [MODIFY] `src/router/index.ts`
- 添加路由守卫：需登录页面（profile、checkout）跳转登录

#### [MODIFY] `vite.config.ts`
- 添加 API proxy 配置用于开发环境

---

## 五、不需要写接口的部分（前端写死即可）

| 内容 | 理由 |
|------|------|
| Footer 链接/文案 | 静态页面信息 |
| Navbar 导航链接 | 固定路由结构 |
| Details 页注意事项文本 | 通用固定文案 |
| 支付方式选项（钱包/卡/加密货币）| UI 展示用，暂无真实支付集成 |

---

## 六、部署方案 (阿里云)

1. **Hono 使用 Node.js adapter** — `@hono/node-server`
2. 打包方式：`tsup` 编译 TypeScript → 产出 `dist/index.js`
3. 阿里云 ECS 部署：
   - 安装 Node.js 18+
   - `npm install --production && npm run build`
   - 使用 PM2 进程守护 `pm2 start dist/index.js --name nexusbits-api`
   - Nginx 反向代理到 Hono 监听端口（如 3001）
4. 环境变量通过 `.env` 或 PM2 ecosystem 文件配置

---

## Verification Plan

### Automated Tests
- 启动 Hono dev server，使用 curl/httpie 测试所有 API 端点
- 前端启动 dev server 并配置 API proxy，验证页面数据加载

### Manual Verification
- 注册新用户 → 登录 → 浏览商品 → 加入购物车 → 结算 → 查看订单
- 充值 → 验证余额变化
- 分类筛选 → 搜索 → 无限滚动加载
