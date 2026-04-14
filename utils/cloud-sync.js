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

/**
 * 将记录加入双写队列
 * @param {string} collection - 集合名（users/teams/notices/suggestions/lottery）
 * @param {string} recordId - 记录 ID
 * @param {object} data - 要同步的数据（camelCase 格式）
 * @param {string} operation - 操作类型：'create' | 'update' | 'delete'
 */
function queueCloudSync(collection, recordId, data, operation = 'update') {
  if (!cloudDb) {
    console.warn('[云同步] 云开发未初始化，跳过双写');
    return;
  }

  syncQueue.push({
    collection,
    recordId,
    data,
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
    const tasks = batch.map(task => syncToCloud(task));
    
    await Promise.allSettled(tasks);
    
    // 短暂延迟，避免过载
    await sleep(100);
  }

  processing = false;
}

/**
 * 执行单个云库同步任务
 */
async function syncToCloud(task) {
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

    // 2. 同步到云库（带版本号和来源标记）
    const cloudData = {
      ...data,
      _syncVersion: newVersion,
      _dataSource: 'mysql',
      updatedAt: new Date().toISOString()
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
      // update：先尝试 update，失败则 add（幂等）
      try {
        await cloudDb.collection(collection).doc(recordId).update(cloudData);
        console.log(`[云同步] ✓ ${collection}/${recordId} 更新成功 (v${newVersion})`);
      } catch (e) {
        if (e.code === 'DATABASE_DOCUMENT_NOT_EXIST') {
          await cloudDb.collection(collection).add({ _id: recordId, ...cloudData });
          console.log(`[云同步] ✓ ${collection}/${recordId} 创建成功（补录） (v${newVersion})`);
        } else {
          throw e;
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
