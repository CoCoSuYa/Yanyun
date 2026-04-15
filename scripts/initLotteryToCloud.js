#!/usr/bin/env node
/**
 * 初始化 lottery 表到云数据库
 * 从 MySQL 读取当前 lottery 数据，写入云库（_id: 'singleton'）
 */

const path = require('path');
require('dotenv-flow').config({ path: path.join(__dirname, '..') });

const db = require('../db/mysql');
const cloudbase = require('@cloudbase/node-sdk');

async function main() {
  console.log('[初始化] 开始初始化 lottery 表到云数据库...');
  
  // 1. 从 MySQL 读取 lottery 数据
  const [rows] = await db.query('SELECT * FROM lottery LIMIT 1');
  
  let mysqlLottery;
  if (!rows || rows.length === 0) {
    console.log('[初始化] MySQL 中没有 lottery 数据，使用默认值');
    mysqlLottery = {
      slots: JSON.stringify([]),
      winners: JSON.stringify([]),
      banner_cleared_at: null,
      last_clear: null
    };
  } else {
    mysqlLottery = rows[0];
    console.log('[初始化] 从 MySQL 读取到 lottery 数据');
    console.log('  - slots:', mysqlLottery.slots ? JSON.parse(mysqlLottery.slots).length + ' 个格子' : '空');
    console.log('  - winners:', mysqlLottery.winners ? JSON.parse(mysqlLottery.winners).length + ' 条记录' : '空');
    console.log('  - banner_cleared_at:', mysqlLottery.banner_cleared_at);
    console.log('  - last_clear:', mysqlLottery.last_clear);
  }
  
  // 2. 初始化云开发
  const env = process.env.MP_CLOUD_ENV;
  const secretId = process.env.CLOUD_SECRET_ID;
  const secretKey = process.env.CLOUD_SECRET_KEY;
  
  if (!env || !secretId || !secretKey) {
    console.error('[初始化] 缺少云开发环境变量');
    process.exit(1);
  }
  
  const app = cloudbase.init({ env, secretId, secretKey });
  const cloudDb = app.database();
  console.log('[初始化] 云开发初始化成功');
  
  // 3. 构造云库文档（snake_case 命名）
  const cloudDoc = {
    _id: 'singleton',
    slots: mysqlLottery.slots ? JSON.parse(mysqlLottery.slots) : [],
    winners: mysqlLottery.winners ? JSON.parse(mysqlLottery.winners) : [],
    banner_cleared_at: mysqlLottery.banner_cleared_at || null,
    last_clear: mysqlLottery.last_clear || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  console.log('[初始化] 准备写入云库文档...');
  
  // 4. 先尝试删除旧文档（如果存在）
  try {
    await cloudDb.collection('lottery').doc('singleton').remove();
    console.log('[初始化] 已删除旧文档');
  } catch (err) {
    console.log('[初始化] 旧文档不存在，跳过删除');
  }
  
  // 5. 写入新文档
  try {
    const result = await cloudDb.collection('lottery').add(cloudDoc);
    console.log('[初始化] ✓ lottery 表初始化成功');
    console.log('  - 云库文档 ID:', result.id || 'singleton');
    console.log('  - slots 数量:', cloudDoc.slots.length);
    console.log('  - winners 数量:', cloudDoc.winners.length);
    process.exit(0);
  } catch (err) {
    console.error('[初始化] ✗ 写入云库失败');
    console.error('  - 错误类型:', err.name || 'Unknown');
    console.error('  - 错误信息:', err.message);
    console.error('  - 错误代码:', err.code || 'N/A');
    process.exit(1);
  }
}

main();
