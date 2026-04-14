/**
 * 全量重新同步：清空云库 → 从 MySQL 重新写入（snake_case 字段名）
 * 用法：在服务器上 node resync_cloud.js
 */
const cloudbase = require('@cloudbase/node-sdk');
const db = require('./db/mysql');
require('dotenv').config({ path: '.env.local' });

const CB_ENV = process.env.CLOUD_ENV || process.env.MP_CLOUD_ENV;
const CB_SID = process.env.CLOUD_SECRET_ID;
const CB_SKEY = process.env.CLOUD_SECRET_KEY;

if (!CB_ENV || !CB_SID || !CB_SKEY) {
  console.error('缺少云开发环境变量');
  process.exit(1);
}

const app = cloudbase.init({ env: CB_ENV, secretId: CB_SID, secretKey: CB_SKEY });
const cloudDb = app.database();

async function clearCollection(name) {
  // 分批删除（每次最多 100 条）
  let deleted = 0;
  while (true) {
    const res = await cloudDb.collection(name).limit(100).get();
    if (res.data.length === 0) break;
    for (const doc of res.data) {
      try {
        await cloudDb.collection(name).doc(doc._id).remove();
        deleted++;
      } catch (e) {
        console.error(`  删除 ${name}/${doc._id} 失败:`, e.message);
      }
    }
    console.log(`  已删除 ${deleted} 条...`);
  }
  return deleted;
}

async function resync() {
  try {
    console.log('=== 开始全量重新同步 ===\n');

    // 1. 清空云库集合
    for (const col of ['users', 'teams', 'notices']) {
      console.log(`清空 ${col}...`);
      const count = await clearCollection(col);
      console.log(`  ${col} 清空完成，共删除 ${count} 条\n`);
    }

    // 2. 从 MySQL 读取全量数据并写入云库
    // users
    console.log('同步 users...');
    const mysqlUsers = await db.query('SELECT * FROM users');
    for (const u of mysqlUsers) {
      try {
        await cloudDb.collection('users').add({
          _id: u.id,
          game_name: u.game_name,
          guild_name: u.guild_name,
          main_style: u.main_style,
          sub_style: u.sub_style,
          password_hash: u.password_hash,
          avatar_url: u.avatar_url,
          is_admin: u.is_admin,
          lottery_count: u.lottery_count,
          sign_in_count: u.sign_in_count,
          last_sign_in_date: u.last_sign_in_date,
          read_notice_ids: typeof u.read_notice_ids === 'string' ? JSON.parse(u.read_notice_ids || '[]') : (u.read_notice_ids || []),
          read_suggestion_ids: typeof u.read_suggestion_ids === 'string' ? JSON.parse(u.read_suggestion_ids || '[]') : (u.read_suggestion_ids || []),
          contribution_points: u.contribution_points,
          consecutive_sign_ins: u.consecutive_sign_ins,
          juejin_high_score: u.juejin_high_score,
          achievements: typeof u.achievements === 'string' ? JSON.parse(u.achievements || '[]') : (u.achievements || []),
          juejin_completed: u.juejin_completed,
          open_id: u.open_id || null,
          mp_quota: typeof u.mp_quota === 'string' ? JSON.parse(u.mp_quota || '{"invite":0,"full":0,"remind":0}') : (u.mp_quota || { invite: 0, full: 0, remind: 0 }),
          invite_log: typeof u.invite_log === 'string' ? JSON.parse(u.invite_log || '[]') : (u.invite_log || []),
          pending_invites: typeof u.pending_invites === 'string' ? JSON.parse(u.pending_invites || '[]') : (u.pending_invites || []),
          juejin_last_played: u.juejin_last_played,
          created_at: u.created_at,
          updated_at: u.updated_at,
          _syncVersion: 1,
          _dataSource: 'mysql',
        });
      } catch (e) {
        console.error(`  写入 users/${u.id} 失败:`, e.message);
      }
    }
    console.log(`  users 同步完成: ${mysqlUsers.length} 条\n`);

    // teams
    console.log('同步 teams...');
    const mysqlTeams = await db.query('SELECT * FROM teams');
    for (const t of mysqlTeams) {
      try {
        await cloudDb.collection('teams').add({
          _id: t.id,
          type: t.type,
          purpose: t.purpose,
          date: t.date,
          time: t.time,
          leader_id: t.leader_id,
          members: typeof t.members === 'string' ? JSON.parse(t.members || '[]') : (t.members || []),
          max_size: t.max_size,
          full_notified: t.full_notified,
          remind_sent: t.remind_sent,
          created_at: t.created_at,
          updated_at: t.updated_at,
          _syncVersion: 1,
          _dataSource: 'mysql',
        });
      } catch (e) {
        console.error(`  写入 teams/${t.id} 失败:`, e.message);
      }
    }
    console.log(`  teams 同步完成: ${mysqlTeams.length} 条\n`);

    // notices
    console.log('同步 notices...');
    const mysqlNotices = await db.query('SELECT * FROM notices');
    for (const n of mysqlNotices) {
      try {
        await cloudDb.collection('notices').add({
          _id: n.id,
          content: n.content,
          date: n.date,
          created_at: n.created_at,
          _syncVersion: 1,
          _dataSource: 'mysql',
        });
      } catch (e) {
        console.error(`  写入 notices/${n.id} 失败:`, e.message);
      }
    }
    console.log(`  notices 同步完成: ${mysqlNotices.length} 条\n`);

    // 3. 重置 sync_state 表
    console.log('重置 sync_state...');
    await db.query('DELETE FROM sync_state');
    for (const u of mysqlUsers) {
      await db.query(
        'INSERT INTO sync_state (table_name, record_id, version, data_source, synced_at) VALUES (?, ?, 1, \'mysql\', NOW())',
        ['users', u.id]
      );
    }
    for (const t of mysqlTeams) {
      await db.query(
        'INSERT INTO sync_state (table_name, record_id, version, data_source, synced_at) VALUES (?, ?, 1, \'mysql\', NOW())',
        ['teams', t.id]
      );
    }
    for (const n of mysqlNotices) {
      await db.query(
        'INSERT INTO sync_state (table_name, record_id, version, data_source, synced_at) VALUES (?, ?, 1, \'mysql\', NOW())',
        ['notices', n.id]
      );
    }
    console.log(`  sync_state 重置完成\n`);

    console.log('=== 全量重新同步完成 ===');
    process.exit(0);
  } catch (e) {
    console.error('同步失败:', e);
    process.exit(1);
  }
}

resync();
