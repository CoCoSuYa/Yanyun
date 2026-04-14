// sync-monitor.js - 云库到 MySQL 的持续同步监控
// 用法: pm2 start sync-monitor.js --name yanyun-sync

const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');
require('dotenv-flow').config();

// 初始化云开发
cloud.init({ 
  env: process.env.MP_CLOUD_ENV,
  secretId: process.env.CLOUD_SECRET_ID,
  secretKey: process.env.CLOUD_SECRET_KEY
});
const db = cloud.database();

// MySQL 连接池
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Xiaxue961124',
  database: 'yanyun',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// 需要同步的集合
const COLLECTIONS = ['users', 'teams', 'notices', 'suggestions'];

// 轮询间隔（10秒）
const POLL_INTERVAL = 10000;

// 并发限制器
function createConcurrencyLimiter(limit) {
  let running = 0;
  const queue = [];
  
  return function(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      drain();
    });
    
    function drain() {
      while (running < limit && queue.length > 0) {
        running++;
        const { fn, resolve, reject } = queue.shift();
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            running--;
            drain();
          });
      }
    }
  };
}

// 同步单个集合
async function syncCollection(collectionName) {
  try {
    // 查询云库中 _dataSource 为 'cloud' 的记录（即小程序端产生的变更）
    // 这些记录需要同步回 MySQL
    const res = await db.collection(collectionName)
      .where({
        _dataSource: 'cloud'
      })
      .limit(100)
      .get();
    
    if (res.data.length === 0) return;
    
    console.log(`[${collectionName}] 发现 ${res.data.length} 条潜在变更`);
    
    // 并发同步（限制 5 个）
    const limit = createConcurrencyLimiter(5);
    const tasks = res.data.map(doc => 
      limit(() => checkAndSync(collectionName, doc))
    );
    
    await Promise.all(tasks);
    
  } catch (err) {
    console.error(`[${collectionName}] 同步失败:`, err.message);
  }
}

// 核心逻辑：版本比较 + 决定是否同步
async function checkAndSync(tableName, cloudDoc) {
  const conn = await pool.getConnection();
  try {
    // 1. 从 sync_state 查当前 MySQL 版本
    const [rows] = await conn.query(
      'SELECT version FROM sync_state WHERE table_name = ? AND record_id = ?',
      [tableName, cloudDoc._id]
    );
    
    const mysqlVersion = rows.length > 0 ? rows[0].version : 0;
    const cloudVersion = cloudDoc._syncVersion || 0;
    
    // 2. 版本比较：云库版本 <= MySQL 版本 → 跳过
    if (cloudVersion <= mysqlVersion) {
      return;
    }
    
    // 3. 云库版本更新 → 同步到 MySQL
    await conn.beginTransaction();
    
    try {
      // UPSERT 业务数据
      await upsertRecord(conn, tableName, cloudDoc);
      
      // 更新 sync_state
      await conn.query(
        `INSERT INTO sync_state (table_name, record_id, version, data_source, synced_at)
         VALUES (?, ?, ?, 'cloud', NOW())
         ON DUPLICATE KEY UPDATE 
           version = VALUES(version),
           data_source = 'cloud',
           synced_at = NOW()`,
        [tableName, cloudDoc._id, cloudVersion]
      );
      
      await conn.commit();
      console.log(`[${tableName}/${cloudDoc._id}] v${mysqlVersion} → v${cloudVersion} ✓`);
      
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    
  } catch (err) {
    console.error(`[${tableName}/${cloudDoc._id}] 同步失败:`, err.message);
  } finally {
    conn.release();
  }
}

// 动态 UPSERT（自动适配不同表的字段）
async function upsertRecord(conn, tableName, cloudDoc) {
  // 过滤掉云库内部字段和同步元数据字段
  // 云库数据统一使用 snake_case 格式（与 MySQL 一致），直接透传即可
  const skipFields = new Set(['_id', '_openid', '_syncVersion', '_dataSource', 'updated_at', '_createdAt', 'id']);
  
  // 数据清洗函数：过滤数组中的无效值
  function cleanArray(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(item => 
      item !== null && 
      item !== undefined && 
      item !== 'undefined' && 
      item !== 'null' &&
      item !== ''
    );
  }
  
  // 日期类型字段映射（MySQL 列名 → 类型）
  // date 类型只存 YYYY-MM-DD，timestamp/datetime 存 YYYY-MM-DD HH:MM:SS
  const dateTypeFields = {
    // MySQL 列名 → 类型
    'last_sign_in_date': 'date',       // date 类型，只需要 YYYY-MM-DD
    'created_at': 'timestamp',
    'updated_at': 'timestamp',
  };
  
  // 将云库日期值转为 MySQL 格式
  function toMySQLDate(val, mysqlType) {
    if (val === null || val === undefined) return null;
    
    let dateStr = '';
    if (val instanceof Date) {
      dateStr = val.toISOString();
    } else if (typeof val === 'string') {
      dateStr = val;
    } else if (typeof val === 'number') {
      // Unix timestamp (毫秒)
      dateStr = new Date(val).toISOString();
    } else {
      return val;
    }
    
    if (mysqlType === 'date') {
      // date 类型只需要 YYYY-MM-DD
      const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : dateStr;
    } else {
      // timestamp/datetime: YYYY-MM-DD HH:MM:SS
      const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
      return match ? `${match[1]} ${match[2]}` : dateStr;
    }
  }
  
  // 准备数据（云库 snake_case 直接映射到 MySQL snake_case）
  const mysqlFields = [];
  const values = [];
  
  for (const [field, value] of Object.entries(cloudDoc)) {
    if (skipFields.has(field)) continue;
    
    mysqlFields.push(field);
    
    // 处理特殊类型
    if (value === null || value === undefined) {
      values.push(null);
    } else if (dateTypeFields[field]) {
      // 日期字段：按 MySQL 列类型转格式
      values.push(toMySQLDate(value, dateTypeFields[field]));
    } else if (Array.isArray(value)) {
      // 清洗数组，过滤无效值
      const cleanedArray = cleanArray(value);
      values.push(JSON.stringify(cleanedArray));
    } else if (typeof value === 'object') {
      values.push(JSON.stringify(value));
    } else if (typeof value === 'boolean') {
      values.push(value ? 1 : 0);
    } else {
      values.push(value);
    }
  }
  
  if (mysqlFields.length === 0) {
    console.warn(`[${tableName}/${cloudDoc._id}] 无有效字段，跳过`);
    return;
  }
  
  const placeholders = mysqlFields.map(() => '?').join(', ');
  const updates = mysqlFields.map(f => `${f} = VALUES(${f})`).join(', ');
  
  await conn.query(
    `INSERT INTO ${tableName} (id, ${mysqlFields.join(', ')})
     VALUES (?, ${placeholders})
     ON DUPLICATE KEY UPDATE ${updates}`,
    [cloudDoc._id, ...values]
  );
}

// 主循环
async function startMonitor() {
  console.log('[监控同步] 启动');
  console.log(`  轮询间隔: ${POLL_INTERVAL / 1000} 秒`);
  console.log(`  监控集合: ${COLLECTIONS.join(', ')}`);
  console.log(`  云环境: ${process.env.MP_CLOUD_ENV}`);
  console.log('');
  
  // 环境变量检查
  if (!process.env.MP_CLOUD_ENV || !process.env.CLOUD_SECRET_ID || !process.env.CLOUD_SECRET_KEY) {
    console.error('❌ 缺少必要的环境变量！');
    console.error('   需要: MP_CLOUD_ENV, CLOUD_SECRET_ID, CLOUD_SECRET_KEY');
    process.exit(1);
  }
  
  while (true) {
    for (const collection of COLLECTIONS) {
      await syncCollection(collection);
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

// 优雅退出
process.on('SIGINT', async () => {
  console.log('\n[监控同步] 收到退出信号，正在关闭...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[监控同步] 收到退出信号，正在关闭...');
  await pool.end();
  process.exit(0);
});

// 启动
startMonitor().catch(err => {
  console.error('[监控同步] 致命错误:', err);
  process.exit(1);
});
