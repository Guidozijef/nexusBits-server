import { Hono } from 'hono';
import { createPocketBaseClient, getPocketBaseAdmin } from '../lib/pocketbase';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import type { RegisterBody, LoginBody, ApiResponse } from '../types';

const auth = new Hono();

/**
 * POST /api/auth/register
 * 注册新用户，邮箱和密码，同时自动初始化标准用户的扩展字段
 */
auth.post('/register', rateLimitMiddleware(5, 10 * 60 * 1000), async (c) => {
  const body = await c.req.json<RegisterBody>();
  const { email, password, display_name } = body;

  if (!email || !password) {
    return c.json<ApiResponse>({ success: false, error: '邮箱和密码不能为空' }, 400);
  }

  if (password.length < 8) {
    return c.json<ApiResponse>({ success: false, error: '密码长度至少8位' }, 400);
  }

  const nameToCheck = display_name || email.split('@')[0];

  try {
    const pbAdmin = await getPocketBaseAdmin();

    // 使用管理员客户端检查邮箱或昵称是否在 PocketBase 中已存在
    const existing = await pbAdmin.collection('users').getList(1, 1, {
      filter: `email = "${email}" || name = "${nameToCheck}"`
    });

    if (existing.totalItems > 0) {
      const emailExists = existing.items.some((u: any) => u.email === email);
      const nameExists = existing.items.some((u: any) => u.name === nameToCheck);

      if (emailExists) {
        return c.json<ApiResponse>({ success: false, error: '该邮箱已被注册' }, 400);
      }
      if (nameExists) {
        return c.json<ApiResponse>({ success: false, error: '该昵称已被使用，请换一个' }, 400);
      }
    }

    // 使用管理员客户端创建用户并直接将 verified 设置为 true，规避由于邮件服务未配置导致新用户无法验证登录的问题
    const userRecord = await pbAdmin.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name: nameToCheck,
      level: '标准',
      role: 'user',
      balance: 0.00,
      verified: true
    });

    // 注册成功后，直接使用新创建的用户凭证进行登录认证，实现注册即自动登录
    const pb = createPocketBaseClient();
    const authData = await pb.collection('users').authWithPassword(email, password);

    return c.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: userRecord.id,
          email: userRecord.email
        },
        session: {
          access_token: authData.token,
          refresh_token: authData.token
        }
      },
      message: '注册成功，已自动为您登录！'
    }, 201);
  } catch (err: any) {
    // 捕获并解析 PocketBase 底层具体的属性校验失败细节
    let friendlyError = err.message;
    if (err.data && err.data.data) {
      const details = Object.entries(err.data.data);
      if (details.length > 0) {
        const errorMsgs = details.map(([field, item]: [string, any]) => {
          const fieldMap: Record<string, string> = {
            email: '邮箱',
            password: '密码',
            passwordConfirm: '确认密码',
            name: '昵称',
            username: '用户名'
          };
          const friendlyField = fieldMap[field] || field;
          
          // 对常见英文报错内容进行汉化翻译
          let msg = item.message || '';
          if (msg.includes('must be between 8 and')) {
            msg = '长度必须在 8 到 72 位之间';
          } else if (msg.includes('invalid or already in use')) {
            msg = '格式不正确或已被占用';
          } else if (msg.includes('already in use')) {
            msg = '已被占用';
          }
          return `${friendlyField}: ${msg}`;
        });
        friendlyError = errorMsgs.join('; ');
      }
    }
    return c.json<ApiResponse>({ success: false, error: friendlyError }, 400);
  }
});

/**
 * POST /api/auth/login
 * 登录支持使用 邮箱 或 昵称 登录
 */
auth.post('/login', rateLimitMiddleware(10, 5 * 60 * 1000), async (c) => {
  const body = await c.req.json<LoginBody>();
  const { email, password } = body;

  if (!email || !password) {
    return c.json<ApiResponse>({ success: false, error: '账号和密码不能为空' }, 400);
  }

  const pb = createPocketBaseClient();
  let loginEmail = email;

  // 如果输入不包含 '@'，假定其为用户昵称 (display_name/name)
  if (!email.includes('@')) {
    try {
      // 获取管理员权限客户端以绕过 users 集合的 API Rules 限制 (Get an admin client to bypass the user collection's API Rules restrictions)
      const adminPb = await getPocketBaseAdmin();
      const matched = await adminPb.collection('users').getList(1, 1, {
        filter: `name = "${email}"`
      });

      // 获取第一个匹配的用户记录并确保邮箱字段存在 (Get the first matched user record and ensure the email field exists)
      const firstMatchedUser = matched.items[0];
      if (firstMatchedUser && firstMatchedUser.email) {
        loginEmail = firstMatchedUser.email;
      } else {
        return c.json<ApiResponse>({ success: false, error: '账号或密码错误' }, 401);
      }
    } catch (err: any) {
      console.error('昵称匹配查询失败:', err.message);
      return c.json<ApiResponse>({ success: false, error: '账号或密码错误' }, 401);
    }
  }

  try {
    // 调用 PocketBase 密码授权登录
    const authData = await pb.collection('users').authWithPassword(loginEmail, password);

    return c.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: authData.record.id,
          email: authData.record.email
        },
        session: {
          access_token: authData.token,
          refresh_token: authData.token // PocketBase Token 无独立 refresh token，返回相同 JWT
        }
      },
      message: '登录成功'
    });
  } catch (err: any) {
    const errorMsg = err.message.includes('Failed to authenticate') ? '账号或密码错误' : err.message;
    return c.json<ApiResponse>({ success: false, error: errorMsg }, 401);
  }
});

/**
 * POST /api/auth/logout
 */
auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const pb = createPocketBaseClient(token);
    // 清除客户端 Token 授权状态
    pb.authStore.clear();
  }

  return c.json<ApiResponse>({ success: true, message: '已注销' });
});

/**
 * POST /api/auth/refresh
 * 刷新 Token
 */
auth.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();
  const { refresh_token } = body;

  if (!refresh_token) {
    return c.json<ApiResponse>({ success: false, error: 'refresh_token 不能为空' }, 400);
  }

  try {
    const pb = createPocketBaseClient(refresh_token);
    const authData = await pb.collection('users').authRefresh();

    return c.json<ApiResponse>({
      success: true,
      data: {
        session: {
          access_token: authData.token,
          refresh_token: authData.token
        }
      }
    });
  } catch {
    return c.json<ApiResponse>({ success: false, error: '刷新令牌失败' }, 401);
  }
});

export default auth;
