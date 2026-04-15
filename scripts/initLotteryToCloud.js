#!/usr/bin/env node
/**
 * Lottery 表初始化脚本：将 MySQL 中的 lottery 数据同步到云数据库
 * 用法：node scripts/initLotteryToCloud.js
 */

const path = require('path');
require('dotenv-flow').config({ path: path.join(__dirname, '..') });

const db = require('../db/mysql');
const cloudbase = require('@cloudbase/node-sdk');

async function main() {
  console.log('[初始化] 开始从 MySQL 读取 lottery 数据...');
  
  try {
    const [rows] = await db.query('SELECT * FROM lottery LIMIT 1');
    
    const mysqlLottery = rows && rows.length > 0 ? rows[0] : {
      slots: '[]',
      winners: '[]',
      banner_cleared_at: null,
      last_clear: null
    };
    
    console.log('[初始化] MySQL 数据:');
    console.log('  - slots:', mysqlLottery.slots ? JSON.parse(mysqlLottery.slots).length + ' 个格子' : '空');
    console.log('  - winners:', mysqlLottery.winners ? JSON.parse(mysqlLottery.winners).length + ' 条记录' : '空');
    
    // 初始化云开发
    const app = cloudbase.init({
      env: process.env.MP_CLOUD_ENV,
      secretId: process.env.CLOUD_SECRET_ID,
      secretKey: process.env.CLOUD_SECRET_KEY
    });
    const cloudDb = app.database();
    
    // 构造云库文档
    const cloudDoc = {
      _id: 'singleton',
      slots: JSON.parse(mysqlLottery.slots || '[]'),
      winners: JSON.parse(mysqlLottery.winners || '[]'),
      banner_cleared_at: mysqlLottery.banner_cleared_at || null,
      last_clear: mysqlLottery.last_clear || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // 先删除旧文档（如果存在）
    try {
      await cloudDb.collection('lottery').doc('singleton').remove();
      console.log('[初始化] 已删除旧文档');
    } catch (e) {
      console.log('[初始化] 旧文档不存在，跳过删除');
    }
    
    // 添加新文档
    const result = await cloudDb.collection('lottery').add(cloudDoc);
    console.log('[初始化] ✓ 成功！云库文档 ID:', result.id || 'singleton');
    console.log('  - slots:', cloudDoc.slots.length, '个');
    console.log('  - winners:', cloudDoc.winners.length, '条');
    
    process.exit(0);
  } catch (err) {
    console.error('[初始化] 失败:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
