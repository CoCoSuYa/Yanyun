const cloudbase = require('@cloudbase/node-sdk');

let cloudDb = null;

// 初始化云开发（延迟加载）
function initCloud() {
  if (cloudDb) return cloudDb;
  
  const env = process.env.MP_CLOUD_ENV;
  const secretId = process.env.CLOUD_SECRET_ID;
  const secretKey = process.env.CLOUD_SECRET_KEY;
  
  if (!env || !secretId || !secretKey) {
    console.warn('[云同步] 缺少云开发环境变量，双写功能不可用');
    console.warn('[云同步] 需要配置: MP_CLOUD_ENV, CLOUD_SECRET_ID, CLOUD_SECRET_KEY');
    return null;
  }
  
  try {
    const app = cloudbase.init({ env, secretId, secretKey });
    cloudDb = app.database();
    console.log('[云同步] 云开发初始化成功');
    return cloudDb;
  } catch (err) {
    console.error('[云同步] 初始化失败:', err.message);
    return null;
  }
}

/**
 * 新建用户时同步到云库（失败不影响主流程）
 * @param {Object} user - 用户对象（camelCase 格式）
 */
async function syncNewUserToCloud(user) {
  const db = initCloud();
  if (!db) {
    console.warn(`[云同步] 跳过用户 ${user.gameName} (${user.id})：云开发未配置`);
    return;
  }
  
  console.log(`[云同步] 开始同步用户 ${user.gameName} (${user.id}) 到云库...`);
  
  try {
    // 构造云库文档（所有字段，snake_case 命名）
    const cloudDoc = {
      _id: user.id,
      game_name: user.gameName,
      guild_name: user.guildName,
      main_style: user.mainStyle,
      sub_style: user.subStyle || '',
      password_hash: user.passwordHash,
      avatar_url: user.avatarUrl || '',
      is_admin: user.isAdmin || false,
      lottery_count: user.lotteryCount || 1,
      sign_in_count: user.signInCount || 0,
      last_sign_in_date: user.lastSignInDate || null,
      read_notice_ids: user.readNoticeIds || [],
      read_suggestion_ids: user.readSuggestionIds || [],
      contribution_points: user.contributionPoints || 0,
      consecutive_sign_ins: user.consecutiveSignIns || 0,
      juejin_high_score: user.juejinHighScore || 0,
      achievements: user.achievements || [],
      juejin_completed: user.juejinCompleted || false,
      open_id: user.openId || null,
      juejin_last_played: user.juejinLastPlayed || null,
      
      // 小程序相关字段（新建时用默认值，避免 null 可能的兼容性问题）
      mp_quota: { invite: 0, full: 0, remind: 0 },
      invite_log: {},  // 空对象，后续更新时转换日期格式
      pending_invites: [],
      
      // 时间戳（ISO 8601 格式）
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log(`[云同步] 准备写入云库文档，字段数: ${Object.keys(cloudDoc).length}`);
    const result = await db.collection('users').add(cloudDoc);
    console.log(`[云同步] ✓ 用户 ${user.gameName} (${user.id}) 同步成功，云库文档ID: ${result.id || user.id}`);
  } catch (err) {
    // 失败只打日志，不抛异常（不影响主流程）
    console.error(`[云同步] ✗ 用户 ${user.gameName} (${user.id}) 同步失败`);
    console.error(`[云同步] 错误类型: ${err.name || 'Unknown'}`);
    console.error(`[云同步] 错误信息: ${err.message}`);
    console.error(`[云同步] 错误代码: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`[云同步] 错误堆栈:\n${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

/**
 * 删除用户时同步删除云库数据（失败不影响主流程）
 * @param {string} userId - 用户 ID
 * @param {string} gameName - 用户游戏名（用于日志）
 */
async function syncDeleteUserFromCloud(userId, gameName) {
  const db = initCloud();
  if (!db) {
    console.warn(`[云同步] 跳过删除用户 ${gameName} (${userId})：云开发未配置`);
    return;
  }
  
  console.log(`[云同步] 开始从云库删除用户 ${gameName} (${userId})...`);
  
  try {
    const result = await db.collection('users').doc(userId).remove();
    console.log(`[云同步] ✓ 用户 ${gameName} (${userId}) 已从云库删除，删除数量: ${result.deleted || 1}`);
  } catch (err) {
    // 失败只打日志，不抛异常（不影响主流程）
    console.error(`[云同步] ✗ 用户 ${gameName} (${userId}) 从云库删除失败`);
    console.error(`[云同步] 错误类型: ${err.name || 'Unknown'}`);
    console.error(`[云同步] 错误信息: ${err.message}`);
    console.error(`[云同步] 错误代码: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`[云同步] 错误堆栈:\n${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

module.exports = { syncNewUserToCloud, syncDeleteUserFromCloud };
