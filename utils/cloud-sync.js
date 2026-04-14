const cloudbase = require('@cloudbase/node-sdk');
const db = require('../db/mysql');

// 初始化云开发（使用环境变量）
const CB_ENV = process.env.CLOUD_ENV || process.env.MP_CLOUD_ENV;
const CB_SID = process.env.CLOUD_SECRET_ID;
const CB_SKEY = process.env.CLOUD_SECRET_KEY;

if (!CB_ENV || !CB_SID || !CB_SKEY) {
  console.error('[云同步] 缺少云开发环境变量，双写功能将不可用');
}

let cloudDb = null;
if (CB_ENV && CB_SID && CB_SKEY) {
  const appCb = cloudbase.init({ env: CB_ENV, secretId: CB_SID, secretKey: CB_SKEY });
  cloudDb = appCb.database();
}

// 双写队列（内存队列 + 并发控制）
const syncQueue = [];
let processing = false;
const MAX_CONCURRENT = 3;  // 最多 3 个并发
const MAX_RETRIES = 3;      // 最多重试 3 次

// camelCase → snake_case 字段映射（云库统一使用 snake_case，与 MySQL 一致）
const CAMEL_TO_SNAKE = {
  gameName: 'game_name',
  guildName: 'guild_name',
  mainStyle: 'main_style',
  subStyle: 'sub_style',
  passwordHash: 'password_hash',
  avatarUrl: 'avatar_url',
  isAdmin: 'is_admin',
  lotteryCount: 'lottery_count',
  signInCount: 'sign_in_count',
  lastSignInDate: 'last_sign_in_date',
  readNoticeIds: 'read_notice_ids',
  readSuggestionIds: 'read_suggestion_ids',
  contributionPoints: 'contribution_points',
  consecutiveSignIns: 'consecutive_sign_ins',
  juejinHighScore: 'juejin_high_score',
  juejinCompleted: 'juejin_completed',
  juejinLastPlayed: 'juejin_last_played',
  openId: 'open_id',
  mpQuota: 'mp_quota',
  inviteLog: 'invite_log',
  pendingInvites: 'pending_invites',
  leaderId: 'leader_id',
  leaderOpenId: 'leader_open_id',
  fullNotified: 'full_notified',
  remindSent: 'remind_sent',
  maxSize: 'max_size',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  lastClear: 'last_clear',
  bannerClearedAt: 'banner_cleared_at',
};

/**
 * 将 camelCase 键名转为 snake_case
 * 内部字段（_syncVersion, _dataSource）和 members 数组内的字段保持不变
 */
function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // 跳过内部同步字段和 _id
    if (key.startsWith('_')) {
      result[key] = value;
      continue;
    }
    const snakeKey = CAMEL_TO_SNAKE[key] || key;
    // 如果值本身就是 snake_case 的（如从 MySQL 直接取出的数据），直接透传
    result[snakeKey] = value;
  }
  return result;
}

/**
 * 将记录加入双写队列
 * @param {string} collection - 集合名（users/teams/notices/suggestions/lottery）
 * @param {string} recordId - 记录 ID
 * @param {object} data - 要同步的数据（支持 camelCase 或 snake_case，会自动转 snake_case）
 * @param {string} operation - 操作类型：'create' | 'update' | 'delete'
 */
function queueCloudSync(collection, recordId, data, operation = 'update') {
  if (!cloudDb) {
    console.warn('[云同步] 云开发未初始化，跳过双写');
    return;
  }

  // 统一转换为 snake_case
  const snakeData = toSnakeCase(data);

  syncQueue.push({
    collection,
    recordId,
    data: snakeData,
    operation,
    retries: 0,
    addedAt: Date.now()
  });

  // 触发队列处理（非阻塞）
  if (!processing) {
    setImmediate(() => processQueue());
  }
}

/**
 * 处理队列（并发控制 + 失败重试）
 */
async function processQueue() {
  if (processing || syncQueue.length === 0) return;
  processing = true;

  while (syncQueue.length > 0) {
    // 取出最多 MAX_CONCURRENT 个任务并发执行
    const batch = syncQueue.splice(0, MAX_CONCURRENT);
    const tasks = batch.map(task => doSync(task));
    
    await Promise.allSettled(tasks);
    
    // 短暂延迟，避免过载
    await sleep(100);
  }

  processing = false;
}

/**
 * 执行单个云库同步任务
 */
async function doSync(task) {
  const { collection, recordId, data, operation, retries } = task;

  try {
    // 1. 先更新 sync_state 表，版本号 +1
    const [row] = await db.query(
      'SELECT version FROM sync_state WHERE table_name = ? AND record_id = ? FOR UPDATE',
      [collection, recordId]
    );
    
    const newVersion = (row?.version ?? 0) + 1;
    
    await db.query(
      `INSERT INTO sync_state (table_name, record_id, version, data_source, synced_at)
       VALUES (?, ?, ?, 'mysql', NOW())
       ON DUPLICATE KEY UPDATE version = ?, data_source = 'mysql', synced_at = NOW()`,
      [collection, recordId, newVersion, newVersion]
    );

    // 2. 同步到云库（带版本号和来源标记，字段名统一 snake_case）
    const cloudData = {
      ...data,
      _syncVersion: newVersion,
      _dataSource: 'mysql',
      updated_at: new Date().toISOString()
    };

    if (operation === 'delete') {
      await cloudDb.collection(collection).doc(recordId).remove();
      console.log(`[云同步] ✓ ${collection}/${recordId} 删除成功`);
    } else if (operation === 'create') {
      await cloudDb.collection(collection).add({
        _id: recordId,
        ...cloudData
      });
      console.log(`[云同步] ✓ ${collection}/${recordId} 创建成功 (v${newVersion})`);
    } else {
      // update：先尝试 update，检查是否实际更新了文档
      const updateResult = await cloudDb.collection(collection).doc(recordId).update(cloudData);
      if (updateResult.updated > 0) {
        console.log(`[云同步] ✓ ${collection}/${recordId} 更新成功 (v${newVersion})`);
      } else {
        // 文档不存在，执行 add（补录）
        try {
          await cloudDb.collection(collection).add({ _id: recordId, ...cloudData });
          console.log(`[云同步] ✓ ${collection}/${recordId} 创建成功（补录） (v${newVersion})`);
        } catch (addErr) {
          // add 也可能因 _id 冲突失败（并发场景），此时再试一次 update
          if (addErr.code === 'DATABASE_DOCUMENT_ALREADY_EXIST') {
            await cloudDb.collection(collection).doc(recordId).update(cloudData);
            console.log(`[云同步] ✓ ${collection}/${recordId} 更新成功（并发重试） (v${newVersion})`);
          } else {
            throw addErr;
          }
        }
      }
    }

  } catch (err) {
    console.error(`[云同步] ✗ ${collection}/${recordId} 失败:`, err.message);
    
    // 失败重试
    if (retries < MAX_RETRIES) {
      task.retries++;
      syncQueue.push(task);  // 放回队列尾部
      console.log(`[云同步] → ${collection}/${recordId} 将重试 (${task.retries}/${MAX_RETRIES})`);
    } else {
      console.error(`[云同步] ✗ ${collection}/${recordId} 重试次数耗尽，放弃同步`);
    }
  }
}

/**
 * 获取队列状态（用于监控）
 */
function getQueueStatus() {
  return {
    pending: syncQueue.length,
    processing,
    oldestTask: syncQueue.length > 0 ? Date.now() - syncQueue[0].addedAt : 0
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  queueCloudSync,
  getQueueStatus
};
