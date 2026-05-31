import PocketBase from 'pocketbase';

// ============================================================
// PocketBase 客户端初始化与管理模块
// ============================================================

const pocketbaseUrl = (process.env.POCKETBASE_URL || 'http://47.109.109.134:8090').trim();
const adminEmail = (process.env.POCKETBASE_ADMIN_EMAIL || '').trim();
const adminPassword = (process.env.POCKETBASE_ADMIN_PASSWORD || '').trim();

// 缓存的管理员客户端实例
let cachedAdminClient: PocketBase | null = null;

/**
 * 获取一个常规的 PocketBase 客户端实例。
 * 如果传入了 token，该实例将被自动赋予该用户的授权状态。
 *
 * @param token 可选的用户 JWT 授权令牌
 * @returns PocketBase 客户端实例
 */
export function createPocketBaseClient(token?: string): PocketBase {
  const pb = new PocketBase(pocketbaseUrl);
  if (token) {
    pb.authStore.save(token, null);
  }
  return pb;
}

/**
 * 获取经管理员账号登录授权的 PocketBase 客户端。
 * 内部实现了 Token 有效性检查与复用缓存，避免在高并发请求下重复发起 Admin 登录请求。
 *
 * @returns 经过 Admin 认证的 PocketBase 客户端实例
 */
export async function getPocketBaseAdmin(): Promise<PocketBase> {
  if (cachedAdminClient && cachedAdminClient.authStore.isValid && cachedAdminClient.authStore.isAdmin) {
    return cachedAdminClient;
  }

  const pb = new PocketBase(pocketbaseUrl);
  
  if (!adminEmail || !adminPassword) {
    throw new Error('未配置 POCKETBASE_ADMIN_EMAIL 或 POCKETBASE_ADMIN_PASSWORD 环境变量。');
  }

  try {
    // 使用管理员账号密码进行认证登录 (Authenticate using the admin account credentials)
    await pb.admins.authWithPassword(adminEmail, adminPassword);
    cachedAdminClient = pb;
    return pb;
  } catch (err: any) {
    console.error('❌ PocketBase 管理员登录失败:', err.message);
    throw new Error(`无法获取 PocketBase 管理员权限: ${err.message}`);
  }
}
