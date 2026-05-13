import { Hono } from 'hono';
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase';
import type { RegisterBody, LoginBody, ApiResponse } from '../types';

const auth = new Hono();

/**
 * POST /api/auth/register
 * Register a new user with email + password
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

  if (supabaseAdmin) {
    // Check if email or display_name already exists in profiles
    const { data: existingProfiles, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('email, display_name')
      .or(`email.eq.${email},display_name.eq.${nameToCheck}`);

    if (existingProfiles && existingProfiles.length > 0) {
      const emailExists = existingProfiles.some((p: any) => p.email === email);
      const nameExists = existingProfiles.some((p: any) => p.display_name === nameToCheck);

      if (emailExists) {
        return c.json<ApiResponse>({ success: false, error: '该邮箱已被注册' }, 400);
      }
      if (nameExists) {
        return c.json<ApiResponse>({ success: false, error: '该昵称已被使用，请换一个' }, 400);
      }
    }
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: nameToCheck }
    }
  });

  if (error) {
    return c.json<ApiResponse>({ success: false, error: error.message }, 400);
  }

  return c.json<ApiResponse>({
    success: true,
    data: {
      user: data.user,
      session: null // Force login step after verification
    },
    message: '注册成功！请前往您的邮箱点击验证链接，验证完成后即可登录。'
  }, 201);
});

/**
 * POST /api/auth/login
 * Login with email + password
 */
auth.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>();
  const { email, password } = body;

  if (!email || !password) {
    return c.json<ApiResponse>({ success: false, error: '邮箱和密码不能为空' }, 400);
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const errorMsg = error.message === 'Invalid login credentials' ? '邮箱或密码错误' : error.message;
    return c.json<ApiResponse>({ success: false, error: errorMsg }, 401);
  }

  return c.json<ApiResponse>({
    success: true,
    data: {
      user: data.user,
      session: data.session
    },
    message: '登录成功'
  });
});

/**
 * POST /api/auth/logout
 */
auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createSupabaseClient(token);
    await supabase.auth.signOut();
  }

  return c.json<ApiResponse>({ success: true, message: '已注销' });
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
auth.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();
  const { refresh_token } = body;

  if (!refresh_token) {
    return c.json<ApiResponse>({ success: false, error: 'refresh_token 不能为空' }, 400);
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token });

  if (error) {
    return c.json<ApiResponse>({ success: false, error: '刷新令牌失败' }, 401);
  }

  return c.json<ApiResponse>({
    success: true,
    data: { session: data.session }
  });
});

export default auth;
