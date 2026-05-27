// ==============================================================================
// NexusBits API 后端 PM2 进程守护配置文件 (ecosystem.config.cjs)
//
// 使用说明：
// 1. 本项目使用 Bun 运行，因此配置中指定了 interpreter 为 'bun'。
// 2. 在部署时，请替换 env_production 里的数据库敏感密钥为您的生产环境真实密钥。
// 3. 运行命令启动：pm2 start ecosystem.config.cjs --env production
// ==============================================================================

module.exports = {
  apps: [
    {
      // 应用在 PM2 中显示的别名
      name: 'nexusbits-server',

      // 🚨 强制指定工作目录为服务器上项目的绝对路径，防止在不同目录下执行 pm2 命令导致找不到文件
      cwd: '/root/nexusBits-server',

      // 🚨 使用 Node.js（通过 tsx）运行，替代 Bun
      // Bun 的原生 TLS 实现在 Linux 上存在 segfault 崩溃问题，导致 502
      script: 'node_modules/.bin/tsx',

      // 🚨 传递给 tsx 运行程序的参数，等价于手动执行 `npx tsx src/index.ts`
      args: 'src/index.ts',

      // 执行模式：由于 Bun 对 PM2 cluster 集群模式支持尚不完善，此处采用 'fork' 模式运行
      exec_mode: 'fork',

      // 实例数量，单实例 fork 运行
      instances: 1,

      // 异常崩溃自动重启
      autorestart: true,

      // 是否开启热重载监听（开发环境建议开启，生产环境建议设为 false 以防状态变动导致频繁意外重启）
      watch: false,

      // 内存过载自动重启限制。当单进程内存超过 1GB 时自动安全重启
      max_memory_restart: '1G',

      // ----------------------------------------------------------------------------
      // 生产环境配置（运行时通过 --env production 载入）
      // ----------------------------------------------------------------------------
      env_production: {
        // 设置 Node/Bun 运行时的生产模式环境标志
        NODE_ENV: 'production',

        // API 监听的内部端口
        PORT: 3001,

        // 🚨 Supabase 配置 — PM2 启动时 .env 文件的自动加载不可靠，必须在此处显式声明
        // 请将下方的值替换为您的 Supabase 项目真实密钥
        SUPABASE_URL: 'https://ysxuyguvsgfqfqqkcsgf.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_OymCl9ioV61yVXM82ImC9g_7Un5irGc',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_mjTpFsI015JiI3gSnPZe9w_Nf7Zwc-t',
      },

      // ----------------------------------------------------------------------------
      // 开发环境默认配置
      // ----------------------------------------------------------------------------
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
      }
    }
  ]
};
