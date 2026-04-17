/**
 * 燕云十六声预约组队服务器 - 启动入口
 * 仅负责：加载环境变量、创建应用、加载数据、启动定时任务、启动监听
 */
const path = require('path');
const fs = require('fs');

// 加载 .env.local（生产环境用系统环境变量，本地用文件）
;(function loadEnvLocal() {
  try {
    const f = path.join(__dirname, '.env.local');
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  } catch { }
})();

const { createApp } = require('./app');
const { loadData } = require('./cache');
const { startWeeklyReset } = require('./schedulers/weeklyReset');
const { startContributionSettlement } = require('./schedulers/contributionSettlement');

// 启动
(async () => {
  await loadData();

  const { app, server } = createApp();

  // 启动定时任务
  startWeeklyReset();
  startContributionSettlement();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n⚔  燕云十六声预约组队服务器已启动`);
    console.log(`   访问地址: http://localhost:${PORT}\n`);
  });
})();
