import 'dotenv/config';
import crypto from 'crypto';
import PocketBase from 'pocketbase';

// ============================================================
// Supabase to PocketBase Data Migration & Schema Creation Script
// ============================================================

const SUPABASE_URL = 'https://ysxuyguvsgfqfqqkcsgf.supabase.co';
const SUPABASE_KEY = 'sb_secret_mjTpFsI015JiI3gSnPZe9w_Nf7Zwc-t';

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://47.109.109.134:8090';
const PB_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@example.com';
const PB_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'your_admin_password';

/**
 * 辅助函数：根据 Supabase 的 UUID 或数字 ID 生成 PocketBase 要求的 15 位数字字母 ID
 */
function toPocketBaseId(sourceId: string | number): string {
  const hash = crypto.createHash('md5').update(String(sourceId)).digest('hex');
  return hash.substring(0, 15).toLowerCase();
}

/**
 * 辅助函数：获取 Supabase 数据
 */
async function fetchFromSupabase(table: string): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`获取 Supabase 表 ${table} 失败: ${response.statusText}`);
  }

  // 强制转换为 any[] 以解决 TypeScript 返回类型校验问题 (Force cast to any[] to solve TypeScript return type check)
  return (await response.json()) as any[];
}

/**
 * 自动在 PocketBase 中检测并创建所有业务集合 (Collections)
 */
async function ensureSchema(pb: PocketBase) {
  console.log('\n--- 开始检测并建立 PocketBase 数据表结构 ---');

  // 1. 更新系统自带的 users 集合以包含额外字段
  try {
    const usersCollection = await pb.collections.getOne('users');
    const schema = usersCollection.schema || [];
    
    const requiredFields: any[] = [
      { name: 'level', type: 'text', options: { min: null, max: null, pattern: '' } },
      { name: 'role', type: 'text', options: { min: null, max: null, pattern: '' } },
      { name: 'balance', type: 'number', options: { min: null, max: null, noDecimal: false } }
    ];

    let updated = false;
    for (const f of requiredFields) {
      if (!schema.some((existing: any) => existing.name === f.name)) {
        schema.push(f);
        updated = true;
        console.log(`➕ 准备为 users 表添加字段: ${f.name}`);
      }
    }

    if (updated) {
      usersCollection.schema = schema;
      await pb.collections.update('users', usersCollection);
      console.log('✅ 系统 users 表扩展字段成功！');
    } else {
      console.log('✅ 系统 users 表扩展字段已就绪。');
    }
  } catch (err: any) {
    console.error('❌ 更新 users 表结构失败:', err.message);
  }

  // 定义固定的 15 位数字字母集合 ID (Define fixed 15-character alphanumeric collection IDs)
  const CATEGORIES_COL_ID = 'category1111111';
  const PRODUCTS_COL_ID = 'products1111111';
  const ORDERS_COL_ID = 'orders111111111';
  const CART_ITEMS_COL_ID = 'cartitems111111';
  const ORDER_ITEMS_COL_ID = 'orderitems11111';
  const RECHARGE_RECORDS_COL_ID = 'rechargerecord1';
  const USER_ASSETS_COL_ID = 'userassets11111';
  const USERS_COL_ID = '_pb_users_auth_';

  // 辅助函数：删除已存在的旧集合以进行干净重建 (Helper to delete existing old collections for clean rebuild)
  const deleteCollectionIfExists = async (name: string) => {
    try {
      await pb.collections.delete(name);
      console.log(`🗑️ 已清理旧的 "${name}" 集合`);
    } catch {
      // 忽略集合不存在的情况 (Ignore if the collection does not exist)
    }
  };

  // 辅助函数：创建集合
  const createCollectionIfMissing = async (colData: any) => {
    try {
      await pb.collections.getOne(colData.id);
      console.log(`✅ 集合 "${colData.name}" (ID: ${colData.id}) 已存在。`);
    } catch (err: any) {
      try {
        await pb.collections.create(colData);
        console.log(`🎉 成功创建集合 "${colData.name}" (ID: ${colData.id})。`);
      } catch (createErr: any) {
        console.error(`❌ 创建集合 "${colData.name}" 失败，详细错误信息:`, JSON.stringify(createErr.response?.data, null, 2));
        throw createErr;
      }
    }
  };

  // 先清理旧集合以防 ID 冲突或外键关联失效 (Clean up old collections first to avoid ID conflicts)
  await deleteCollectionIfExists('user_assets');
  await deleteCollectionIfExists('order_items');
  await deleteCollectionIfExists('orders');
  await deleteCollectionIfExists('cart_items');
  await deleteCollectionIfExists('recharge_records');
  await deleteCollectionIfExists('products');
  await deleteCollectionIfExists('categories');

  // 2. 创建 categories 集合 (Create categories collection)
  await createCollectionIfMissing({
    id: CATEGORIES_COL_ID,
    name: 'categories',
    type: 'base',
    schema: [
      { name: 'name', type: 'text', required: true },
      { name: 'slug', type: 'text', required: true },
      { name: 'sort_order', type: 'number' }
    ],
    listRule: '', // 公开读取
    viewRule: '',
    createRule: null, // 禁止客户端写入
    updateRule: null,
    deleteRule: null
  });

  // 3. 创建 products 集合 (Create products collection)
  await createCollectionIfMissing({
    id: PRODUCTS_COL_ID,
    name: 'products',
    type: 'base',
    schema: [
      { name: 'name', type: 'text', required: true },
      { name: 'description', type: 'text' },
      { name: 'long_description', type: 'text' },
      { name: 'price', type: 'number', required: true },
      { name: 'currency', type: 'text' },
      { name: 'category_id', type: 'relation', required: true, options: { collectionId: CATEGORIES_COL_ID, cascadeDelete: true, maxSelect: 1 } },
      { name: 'tag', type: 'text' },
      { name: 'image_url', type: 'text' },
      { name: 'thumbnail_urls', type: 'json', options: { maxSize: 2000000 } },
      { name: 'file_format', type: 'text' },
      { name: 'file_size', type: 'text' },
      { name: 'asset_type', type: 'text' },
      { name: 'polygon_count', type: 'text' },
      { name: 'license_type', type: 'text' },
      { name: 'update_policy', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'is_featured', type: 'bool' },
      { name: 'sort_order', type: 'number' },
      { name: 'types', type: 'json', options: { maxSize: 2000000 } },
      { name: 'packages', type: 'json', options: { maxSize: 2000000 } },
      { name: 'durations', type: 'json', options: { maxSize: 2000000 } },
      { name: 'notices', type: 'json', options: { maxSize: 2000000 } },
      { name: 'admin_note', type: 'text' },
      { name: 'cost', type: 'number' }
    ],
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null
  });

  // 4. 创建 cart_items 集合 (Create cart_items collection)
  await createCollectionIfMissing({
    id: CART_ITEMS_COL_ID,
    name: 'cart_items',
    type: 'base',
    schema: [
      { name: 'user_id', type: 'relation', required: true, options: { collectionId: USERS_COL_ID, cascadeDelete: true, maxSelect: 1 } },
      { name: 'product_id', type: 'relation', required: true, options: { collectionId: PRODUCTS_COL_ID, cascadeDelete: true, maxSelect: 1 } },
      { name: 'quantity', type: 'number', required: true }
    ],
    listRule: 'user_id = @request.auth.id', // 仅允许用户读取自己的购物车
    viewRule: 'user_id = @request.auth.id',
    createRule: null, // 禁止客户端写入（由后端代劳以保持逻辑控制）
    updateRule: null,
    deleteRule: null
  });

  // 5. 创建 orders 集合 (Create orders collection)
  await createCollectionIfMissing({
    id: ORDERS_COL_ID,
    name: 'orders',
    type: 'base',
    schema: [
      { name: 'order_no', type: 'text', required: true },
      { name: 'user_id', type: 'relation', required: true, options: { collectionId: USERS_COL_ID, maxSelect: 1 } },
      { name: 'total_amount', type: 'number', required: true },
      { name: 'status', type: 'text' }
    ],
    listRule: 'user_id = @request.auth.id',
    viewRule: 'user_id = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null
  });

  // 6. 创建 order_items 集合 (Create order_items collection)
  await createCollectionIfMissing({
    id: ORDER_ITEMS_COL_ID,
    name: 'order_items',
    type: 'base',
    schema: [
      { name: 'order_id', type: 'relation', required: true, options: { collectionId: ORDERS_COL_ID, cascadeDelete: true, maxSelect: 1 } },
      { name: 'product_id', type: 'relation', required: true, options: { collectionId: PRODUCTS_COL_ID, maxSelect: 1 } },
      { name: 'product_name', type: 'text', required: true },
      { name: 'price', type: 'number', required: true },
      { name: 'quantity', type: 'number', required: true },
      { name: 'package_name', type: 'text' },
      { name: 'duration_name', type: 'text' },
      { name: 'variant_type', type: 'text' }
    ],
    listRule: 'order_id.user_id = @request.auth.id',
    viewRule: 'order_id.user_id = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null
  });

  // 7. 创建 recharge_records 集合 (Create recharge_records collection)
  await createCollectionIfMissing({
    id: RECHARGE_RECORDS_COL_ID,
    name: 'recharge_records',
    type: 'base',
    schema: [
      { name: 'user_id', type: 'relation', required: true, options: { collectionId: USERS_COL_ID, cascadeDelete: true, maxSelect: 1 } },
      { name: 'amount', type: 'number', required: true },
      { name: 'balance_before', type: 'number' },
      { name: 'balance_after', type: 'number' }
    ],
    listRule: 'user_id = @request.auth.id',
    viewRule: 'user_id = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null
  });

  // 8. 创建 user_assets 集合 (Create user_assets collection)
  await createCollectionIfMissing({
    id: USER_ASSETS_COL_ID,
    name: 'user_assets',
    type: 'base',
    schema: [
      { name: 'user_id', type: 'relation', required: true, options: { collectionId: USERS_COL_ID, cascadeDelete: true, maxSelect: 1 } },
      { name: 'product_id', type: 'relation', required: true, options: { collectionId: PRODUCTS_COL_ID, maxSelect: 1 } },
      { name: 'order_id', type: 'relation', options: { collectionId: ORDERS_COL_ID, maxSelect: 1 } },
      { name: 'license_key', type: 'text' },
      { name: 'remark', type: 'text' }
    ],
    listRule: 'user_id = @request.auth.id',
    viewRule: 'user_id = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null
  });

  console.log('✅ 数据表结构配置完成。\n');
}

async function migrate() {
  console.log('🚀 开始数据库迁移 (Supabase -> PocketBase)...');
  console.log(`Supabase 地址: ${SUPABASE_URL}`);
  console.log(`PocketBase 地址: ${POCKETBASE_URL}`);

  // 1. 初始化 PocketBase 并登录管理员 (Admin)
  const pb = new PocketBase(POCKETBASE_URL);
  try {
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
    console.log('✅ PocketBase 管理员登录成功');
  } catch (err: any) {
    console.error('❌ PocketBase 管理员登录失败，请确认 .env 中的配置是否正确：', err.message);
    process.exit(1);
  }

  // 2. 检测并创建数据结构
  await ensureSchema(pb);

  // 3. 迁移分类表 (categories)
  console.log('\n--- 1. 迁移分类 (categories) ---');
  let supabaseCategories: any[] = [];
  try {
    supabaseCategories = await fetchFromSupabase('categories');
    console.log(`从 Supabase 获取到 ${supabaseCategories.length} 个分类`);
  } catch (err: any) {
    console.error('获取分类失败:', err.message);
  }

  const categoryIdMap = new Map<number, string>();
  for (const cat of supabaseCategories) {
    const pbId = toPocketBaseId(`category_${cat.id}`);
    categoryIdMap.set(cat.id, pbId);

    try {
      await pb.collection('categories').getOne(pbId);
      console.log(`分类 "${cat.name}" 已存在，跳过。`);
    } catch {
      await pb.collection('categories').create({
        id: pbId,
        name: cat.name,
        slug: cat.slug,
        sort_order: cat.sort_order,
        created: cat.created_at
      });
      console.log(`已成功迁移分类: ${cat.name} (ID: ${pbId})`);
    }
  }

  // 4. 迁移商品表 (products)
  console.log('\n--- 2. 迁移商品 (products) ---');
  let supabaseProducts: any[] = [];
  try {
    supabaseProducts = await fetchFromSupabase('products');
    console.log(`从 Supabase 获取到 ${supabaseProducts.length} 个商品`);
  } catch (err: any) {
    console.error('获取商品失败:', err.message);
  }

  const productIdMap = new Map<number, string>();
  for (const prod of supabaseProducts) {
    const pbId = toPocketBaseId(`product_${prod.id}`);
    productIdMap.set(prod.id, pbId);

    const pbCategoryId = categoryIdMap.get(prod.category_id);
    if (!pbCategoryId) {
      console.warn(`⚠️ 商品 ${prod.name} 关联的分类 ID ${prod.category_id} 不存在于 PocketBase 中，跳过。`);
      continue;
    }

    try {
      await pb.collection('products').getOne(pbId);
      console.log(`商品 "${prod.name}" 已存在，跳过。`);
    } catch {
      await pb.collection('products').create({
        id: pbId,
        name: prod.name,
        description: prod.description,
        long_description: prod.long_description,
        price: parseFloat(prod.price),
        currency: prod.currency,
        category_id: pbCategoryId,
        tag: prod.tag,
        image_url: prod.image_url,
        thumbnail_urls: prod.thumbnail_urls,
        file_format: prod.file_format,
        file_size: prod.file_size,
        asset_type: prod.asset_type,
        polygon_count: prod.polygon_count,
        license_type: prod.license_type,
        update_policy: prod.update_policy,
        status: prod.status,
        is_featured: prod.is_featured,
        sort_order: prod.sort_order,
        types: prod.types || [],
        packages: prod.packages || [],
        durations: prod.durations || [],
        notices: prod.notices || [],
        admin_note: prod.admin_note,
        cost: prod.cost ? parseFloat(prod.cost) : 0,
        created: prod.created_at,
        updated: prod.updated_at
      });
      console.log(`已成功迁移商品: ${prod.name} (ID: ${pbId})`);
    }
  }

  // 5. 迁移用户表 (profiles -> users)
  console.log('\n--- 3. 迁移用户 (profiles -> users) ---');
  let supabaseProfiles: any[] = [];
  try {
    supabaseProfiles = await fetchFromSupabase('profiles');
    console.log(`从 Supabase 获取到 ${supabaseProfiles.length} 个用户`);
  } catch (err: any) {
    console.error('获取用户 Profile 失败:', err.message);
  }

  const userIdMap = new Map<string, string>();
  for (const prof of supabaseProfiles) {
    const pbId = toPocketBaseId(prof.id);
    userIdMap.set(prof.id, pbId);

    try {
      await pb.collection('users').getOne(pbId);
      console.log(`用户 "${prof.display_name}" 已存在，跳过。`);
    } catch {
      await pb.collection('users').create({
        id: pbId,
        email: prof.email || `${pbId}@example.com`,
        emailVisibility: true,
        password: 'UserResetPassword123!',
        passwordConfirm: 'UserResetPassword123!',
        name: prof.display_name,
        avatar: prof.avatar_url,
        level: prof.level,
        role: prof.role,
        balance: parseFloat(prof.balance),
        created: prof.created_at,
        updated: prof.updated_at
      });
      console.log(`已成功迁移用户: ${prof.display_name} (ID: ${pbId})`);
    }
  }

  // 6. 迁移购物车 (cart_items)
  console.log('\n--- 4. 迁移购物车 (cart_items) ---');
  let supabaseCartItems: any[] = [];
  try {
    supabaseCartItems = await fetchFromSupabase('cart_items');
    console.log(`从 Supabase 获取到 ${supabaseCartItems.length} 条购物车记录`);
  } catch (err: any) {
    console.error('获取购物车记录失败:', err.message);
  }

  for (const item of supabaseCartItems) {
    const pbId = toPocketBaseId(`cart_${item.id}`);
    const pbUserId = userIdMap.get(item.user_id);
    const pbProductId = productIdMap.get(item.product_id);

    if (!pbUserId || !pbProductId) {
      console.warn(`⚠️ 购物车记录因关联关系缺失被跳过。User: ${item.user_id}, Product: ${item.product_id}`);
      continue;
    }

    try {
      await pb.collection('cart_items').getOne(pbId);
      console.log(`购物车记录 ${pbId} 已存在，跳过。`);
    } catch {
      await pb.collection('cart_items').create({
        id: pbId,
        user_id: pbUserId,
        product_id: pbProductId,
        quantity: item.quantity,
        created: item.created_at
      });
      console.log(`已成功迁移购物车记录: User: ${pbUserId} -> Product: ${pbProductId}`);
    }
  }

  // 7. 迁移订单表 (orders)
  console.log('\n--- 5. 迁移订单 (orders) ---');
  let supabaseOrders: any[] = [];
  try {
    supabaseOrders = await fetchFromSupabase('orders');
    console.log(`从 Supabase 获取到 ${supabaseOrders.length} 条订单记录`);
  } catch (err: any) {
    console.error('获取订单失败:', err.message);
  }

  const orderIdMap = new Map<number, string>();
  for (const ord of supabaseOrders) {
    const pbId = toPocketBaseId(`order_${ord.id}`);
    orderIdMap.set(ord.id, pbId);

    const pbUserId = userIdMap.get(ord.user_id);
    if (!pbUserId) {
      console.warn(`⚠️ 订单 ${ord.order_no} 关联的用户 ID ${ord.user_id} 在 PB 中不存在，跳过。`);
      continue;
    }

    try {
      await pb.collection('orders').getOne(pbId);
      console.log(`订单 "${ord.order_no}" 已存在，跳过。`);
    } catch {
      await pb.collection('orders').create({
        id: pbId,
        order_no: ord.order_no,
        user_id: pbUserId,
        total_amount: parseFloat(ord.total_amount),
        status: ord.status,
        created: ord.created_at,
        updated: ord.updated_at
      });
      console.log(`已成功迁移订单: ${ord.order_no} (ID: ${pbId})`);
    }
  }

  // 8. 迁移订单详情项 (order_items)
  console.log('\n--- 6. 迁移订单详情项 (order_items) ---');
  let supabaseOrderItems: any[] = [];
  try {
    supabaseOrderItems = await fetchFromSupabase('order_items');
    console.log(`从 Supabase 获取到 ${supabaseOrderItems.length} 条订单细项记录`);
  } catch (err: any) {
    console.error('获取订单细项失败:', err.message);
  }

  for (const item of supabaseOrderItems) {
    const pbId = toPocketBaseId(`order_item_${item.id}`);
    const pbOrderId = orderIdMap.get(item.order_id);
    const pbProductId = productIdMap.get(item.product_id);

    if (!pbOrderId || !pbProductId) {
      console.warn(`⚠️ 订单细项关联缺失。Order: ${item.order_id}, Product: ${item.product_id}`);
      continue;
    }

    try {
      await pb.collection('order_items').getOne(pbId);
      console.log(`订单细项 ${pbId} 已存在，跳过。`);
    } catch {
      await pb.collection('order_items').create({
        id: pbId,
        order_id: pbOrderId,
        product_id: pbProductId,
        product_name: item.product_name,
        price: parseFloat(item.price),
        quantity: item.quantity,
        package_name: item.package_name,
        duration_name: item.duration_name,
        variant_type: item.variant_type,
        created: item.created_at
      });
      console.log(`已成功迁移订单细项: Order: ${pbOrderId} -> Product: ${item.product_name}`);
    }
  }

  // 9. 迁移充值记录 (recharge_records)
  console.log('\n--- 7. 迁移充值记录 (recharge_records) ---');
  let supabaseRechargeRecords: any[] = [];
  try {
    supabaseRechargeRecords = await fetchFromSupabase('recharge_records');
    console.log(`从 Supabase 获取到 ${supabaseRechargeRecords.length} 条充值记录`);
  } catch (err: any) {
    console.error('获取充值记录失败:', err.message);
  }

  for (const rec of supabaseRechargeRecords) {
    const pbId = toPocketBaseId(`recharge_${rec.id}`);
    const pbUserId = userIdMap.get(rec.user_id);

    if (!pbUserId) {
      console.warn(`⚠️ 充值记录关联的用户 ID ${rec.user_id} 不存在于 PB，跳过。`);
      continue;
    }

    try {
      await pb.collection('recharge_records').getOne(pbId);
      console.log(`充值记录 ${pbId} 已存在，跳过。`);
    } catch (err: any) {
      try {
        await pb.collection('recharge_records').create({
          id: pbId,
          user_id: pbUserId,
          amount: parseFloat(rec.amount),
          balance_before: parseFloat(rec.balance_before),
          balance_after: parseFloat(rec.balance_after),
          created: rec.created_at
        });
        console.log(`已成功迁移充值记录: User: ${pbUserId}, Amount: ${rec.amount}`);
      } catch (createErr: any) {
        console.error(`❌ 迁移充值记录失败 (ID: ${pbId})，错误详情:`, JSON.stringify(createErr.response?.data, null, 2));
        throw createErr;
      }
    }
  }

  // 10. 迁移已购资产授权 (user_assets)
  console.log('\n--- 8. 迁移用户资产授权 (user_assets) ---');
  let supabaseUserAssets: any[] = [];
  try {
    supabaseUserAssets = await fetchFromSupabase('user_assets');
    console.log(`从 Supabase 获取到 ${supabaseUserAssets.length} 条用户资产授权`);
  } catch (err: any) {
    console.error('获取用户资产失败:', err.message);
  }

  for (const asset of supabaseUserAssets) {
    const pbId = toPocketBaseId(`asset_${asset.id}`);
    const pbUserId = userIdMap.get(asset.user_id);
    const pbProductId = productIdMap.get(asset.product_id);
    const pbOrderId = asset.order_id ? orderIdMap.get(asset.order_id) : null;

    if (!pbUserId || !pbProductId) {
      console.warn(`⚠️ 资产授权记录关联缺失。User: ${asset.user_id}, Product: ${asset.product_id}`);
      continue;
    }

    try {
      await pb.collection('user_assets').getOne(pbId);
      console.log(`资产授权 ${pbId} 已存在，跳过。`);
    } catch {
      await pb.collection('user_assets').create({
        id: pbId,
        user_id: pbUserId,
        product_id: pbProductId,
        order_id: pbOrderId,
        license_key: asset.license_key,
        remark: asset.remark,
        acquired_at: asset.acquired_at
      });
      console.log(`已成功迁移资产授权: User: ${pbUserId} -> Product: ${pbProductId}`);
    }
  }

  console.log('\n🎉 所有数据及表结构迁移成功！');
}

migrate().catch(err => {
  console.error('❌ 迁移过程中发生致命错误:', err);
});
