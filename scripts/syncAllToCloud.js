#!/usr/bin/env node
/**
 * 全量同步脚本：将 MySQL 用户与 lottery 单例同步到云数据库
 * 用法：node scripts/syncAllToCloud.js
 */

const path = require('path');
require('dotenv-flow').config({ path: path.join(__dirname, '..') });

const db = require('../db/mysql');
const cloudbase = require('@cloudbase/node-sdk');

let cloudDb = null;

// 初始化云开发
function initCloud() {
  if (cloudDb) return cloudDb;

  const env = process.env.MP_CLOUD_ENV;
  const secretId = process.env.CLOUD_SECRET_ID;
  const secretKey = process.env.CLOUD_SECRET_KEY;

  if (!env || !secretId || !secretKey) {
    console.error('[全量同步] 缺少云开发环境变量');
    process.exit(1);
  }

  try {
    const app = cloudbase.init({ env, secretId, secretKey });
    cloudDb = app.database();
    console.log('[全量同步] 云开发初始化成功');
    return cloudDb;
  } catch (err) {
    console.error('[全量同步] 初始化失败:', err.message);
    process.exit(1);
  }
}

// 同步单个用户到云库
async function syncUserToCloud(user) {
  const cdb = initCloud();

  const cloudDoc = {
    _id: user.id,
    game_name: user.game_name,
    guild_name: user.guild_name,
    main_style: user.main_style,
    sub_style: user.sub_style || '',
    password_hash: user.password_hash,
    avatar_url: user.avatar_url || '',
    is_admin: user.is_admin || false,
    lottery_count: user.lottery_count || 1,
    sign_in_count: user.sign_in_count || 0,
    last_sign_in_date: user.last_sign_in_date || null,
    read_notice_ids: user.read_notice_ids ? JSON.parse(user.read_notice_ids) : [],
    read_suggestion_ids: user.read_suggestion_ids ? JSON.parse(user.read_suggestion_ids) : [],
    contribution_points: user.contribution_points || 0,
    coins: user.coins || 0,
    total_coins_earned: user.total_coins_earned || 0,
    consecutive_sign_ins: user.consecutive_sign_ins || 0,
    juejin_high_score: user.juejin_high_score || 0,
    achievements: user.achievements ? JSON.parse(user.achievements) : [],
    juejin_completed: user.juejin_completed || false,
    open_id: user.open_id || null,
    juejin_last_played: user.juejin_last_played || null,

    // 小程序相关字段（用默认值）
    mp_quota: user.mp_quota ? JSON.parse(user.mp_quota) : { invite: 0, full: 0, remind: 0 },
    invite_log: user.invite_log ? JSON.parse(user.invite_log) : {},
    pending_invites: user.pending_invites ? JSON.parse(user.pending_invites) : [],

    created_at: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
    updated_at: user.updated_at ? new Date(user.updated_at).toISOString() : new Date().toISOString()
  };

  // 先尝试更新，如果不存在则添加
  try {
    const result = await cdb.collection('users').doc(user.id).update(cloudDoc);
    if (result.updated > 0) {
      return { success: true, action: 'updated' };
    } else {
      // 文档不存在，尝试添加
      await cdb.collection('users').add(cloudDoc);
      return { success: true, action: 'added' };
    }
  } catch (err) {
    if (err.code === 'DATABASE_DOCUMENT_NOT_EXIST') {
      // 文档不存在，添加
      await cdb.collection('users').add(cloudDoc);
      return { success: true, action: 'added' };
    }
    throw err;
  }
}

async function syncLotteryToCloud() {
  const cdb = initCloud();
  const [rows] = await db.query('SELECT * FROM lottery LIMIT 1');
  const lottery = rows[0];

  if (!lottery) {
    console.log('[全量同步] lottery 表暂无数据，跳过单例同步');
    return;
  }

  const cloudDoc = {
    _id: 'singleton',
    slots: lottery.slots ? JSON.parse(lottery.slots) : [],
    winners: lottery.winners ? JSON.parse(lottery.winners) : [],
    banner_cleared_at: lottery.banner_cleared_at ? new Date(lottery.banner_cleared_at).toISOString() : null,
    last_clear: lottery.last_clear ? new Date(lottery.last_clear).toISOString() : null,
    lucky_draw_remaining: Number(lottery.lucky_draw_remaining || 0),
    last_lucky_reset: lottery.last_lucky_reset ? new Date(lottery.last_lucky_reset).toISOString() : null,
    updated_at: lottery.updated_at ? new Date(lottery.updated_at).toISOString() : new Date().toISOString()
  };

  try {
    const result = await cdb.collection('lottery').doc('singleton').update(cloudDoc);
    if (result.updated > 0) {
      console.log('[全量同步] ✓ lottery 单例更新成功');
    } else {
      await cdb.collection('lottery').add(cloudDoc);
      console.log('[全量同步] ✓ lottery 单例新增成功');
    }
  } catch (err) {
    if (err.code === 'DATABASE_DOCUMENT_NOT_EXIST') {
      await cdb.collection('lottery').add(cloudDoc);
      console.log('[全量同步] ✓ lottery 单例新增成功');
      return;
    }
    throw err;
  }
}

async function main() {
  console.log('[全量同步] 开始同步所有用户到云库...');
  console.log('[全量同步] 时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  try {
    const [users] = await db.query('SELECT * FROM users ORDER BY created_at');
    console.log(`[全量同步] 共 ${users.length} 个用户待同步\n`);

    let success = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        await syncUserToCloud(user);
        success++;
        process.stdout.write(`\r[全量同步] 进度: ${i + 1}/${users.length} | 成功: ${success} | 失败: ${failed}`);
      } catch (err) {
        failed++;
        errors.push({ user: user.game_name, id: user.id, error: err.message });
        process.stdout.write(`\r[全量同步] 进度: ${i + 1}/${users.length} | 成功: ${success} | 失败: ${failed}`);
      }
    }

    console.log(`\n\n[全量同步] 用户完成：成功 ${success}，失败 ${failed}`);

    await syncLotteryToCloud();
    console.log('[全量同步] lottery 单例同步完成');

    if (errors.length > 0) {
      console.log('\n[全量同步] 失败详情:');
      errors.forEach(e => console.log(`  - ${e.user} (${e.id}): ${e.error}`));
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n[全量同步] 异常:', err);
    process.exit(1);
  }
}

main();
