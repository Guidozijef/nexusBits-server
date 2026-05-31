import { Hono } from 'hono';
import { createPocketBaseClient, getPocketBaseAdmin } from '../lib/pocketbase';
import type { RegisterBody, LoginBody, ApiResponse } from '../types';

const auth = new Hono();

/**
 * POST /api/auth/register
 * 注册新用户，邮箱和密码，同时自动初始化标准用户的扩展字段
 */
auth.post('/register', async (c) => {
  const body = await c.req.json<RegisterBody>();
  const { email, password, display_name } = body;

  if (!email || !password) {
    return c.json<ApiResponse>({ success: false, error: '邮箱和密码不能为空' }, 400);
  }

  if (password.length < 6) {
    return c.json<ApiResponse>({ success: false, error: '密码长度至少6位' }, 400);
  }

  const nameToCheck = display_name || email.split('@')[0];
  const pb = createPocketBaseClient();

  try {
    // 检查邮箱或昵称是否在 PocketBase 中已存在
    const existing = await pb.collection('users').getList(1, 1, {
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

    // 创建 PocketBase 用户记录
    const userRecord = await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name: nameToCheck,
      level: '标准',
      role: 'user',
      balance: 0.00
    });

    // 请求 PocketBase 发送账户验证邮件（如果后台开启了邮箱验证）
    try {
      await pb.collection('users').requestVerification(email);
    } catch (e) {
      // 验证邮件发送失败不阻断注册成功流程
      console.warn('发送验证邮件失败:', e);
    }

    return c.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: userRecord.id,
          email: userRecord.email
        },
        session: null // 提示用户去邮箱进行链接验证后才能登录
      },
      message: '注册成功！请前往您的邮箱点击验证链接，验证完成后即可登录。'
    }, 201);
  } catch (err: any) {
    return c.json<ApiResponse>({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/auth/login
 * 登录支持使用 邮箱 或 昵称 登录
 */
auth.post('/login', async (c) => {
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
