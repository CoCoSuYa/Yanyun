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
    
    // 根据 result.deleted 判断成功/失败
    if (result.deleted === 0) {
      console.error(`[云同步] ✗ 用户 ${gameName} (${userId}) 删除失败：云库中不存在该文档（deleted=0）`);
    } else {
      console.log(`[云同步] ✓ 用户 ${gameName} (${userId}) 已从云库删除，删除数量: ${result.deleted}`);
    }
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

/**
 * 更新用户信息时同步到云库（失败不影响主流程）
 * @param {string} userId - 用户 ID
 * @param {Object} updates - 要更新的字段（camelCase 格式）
 */
async function syncUpdateUserToCloud(userId, updates) {
  const db = initCloud();
  if (!db) {
    console.warn(`[云同步] 跳过更新用户 ${userId}：云开发未配置`);
    return;
  }
  
  console.log(`[云同步] 开始同步更新用户 ${userId} 到云库...`);
  console.log(`[云同步] 更新字段: ${Object.keys(updates).join(', ')}`);
  
  try {
    // 转换为 snake_case
    const cloudUpdates = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.gameName !== undefined) cloudUpdates.game_name = updates.gameName;
    if (updates.mainStyle !== undefined) cloudUpdates.main_style = updates.mainStyle;
    if (updates.subStyle !== undefined) cloudUpdates.sub_style = updates.subStyle;
    if (updates.passwordHash !== undefined) cloudUpdates.password_hash = updates.passwordHash;
    if (updates.avatarUrl !== undefined) cloudUpdates.avatar_url = updates.avatarUrl;
    
    // 签到相关字段
    if (updates.signInCount !== undefined) cloudUpdates.sign_in_count = updates.signInCount;
    if (updates.lotteryCount !== undefined) cloudUpdates.lottery_count = updates.lotteryCount;
    if (updates.lastSignInDate !== undefined) cloudUpdates.last_sign_in_date = updates.lastSignInDate;
    if (updates.contributionPoints !== undefined) cloudUpdates.contribution_points = updates.contributionPoints;
    if (updates.consecutiveSignIns !== undefined) cloudUpdates.consecutive_sign_ins = updates.consecutiveSignIns;
    
    // 掘境游戏相关字段
    if (updates.juejinHighScore !== undefined) cloudUpdates.juejin_high_score = updates.juejinHighScore;
    if (updates.juejinLastPlayed !== undefined) cloudUpdates.juejin_last_played = updates.juejinLastPlayed;
    if (updates.juejinCompleted !== undefined) cloudUpdates.juejin_completed = updates.juejinCompleted;
    
    const result = await db.collection('users').doc(userId).update(cloudUpdates);
    
    // 根据 result.updated 判断成功/失败
    if (result.updated === 0) {
      console.error(`[云同步] ✗ 用户 ${userId} 更新失败：云库中不存在该文档（updated=0）`);
    } else {
      console.log(`[云同步] ✓ 用户 ${userId} 更新成功，更新数量: ${result.updated}`);
    }
  } catch (err) {
    console.error(`[云同步] ✗ 用户 ${userId} 更新失败`);
    console.error(`[云同步] 错误类型: ${err.name || 'Unknown'}`);
    console.error(`[云同步] 错误信息: ${err.message}`);
    console.error(`[云同步] 错误代码: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`[云同步] 错误堆栈:\n${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

/**
 * 新建队伍时同步到云库（失败不影响主流程）
 * @param {Object} team - 队伍对象（camelCase 格式）
 */
async function syncNewTeamToCloud(team) {
  const db = initCloud();
  if (!db) {
    console.warn(`[云同步] 跳过队伍 ${team.id}：云开发未配置`);
    return;
  }
  
  console.log(`[云同步] 开始同步队伍 ${team.id} (${team.type}) 到云库...`);
  
  try {
    // 构造云库文档（所有字段，snake_case 命名）
    const cloudDoc = {
      _id: team.id,
      type: team.type,
      purpose: team.purpose || '',
      date: team.date,
      time: team.time,
      leader_id: team.leaderId,
      members: team.members || [],  // 数组直接存储，云库原生支持
      max_size: team.maxSize || 10,
      full_notified: team.fullNotified || false,
      remind_sent: team.remindSent || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log(`[云同步] 准备写入云库文档，字段数: ${Object.keys(cloudDoc).length}，成员数: ${cloudDoc.members.length}`);
    const result = await db.collection('teams').add(cloudDoc);
    console.log(`[云同步] ✓ 队伍 ${team.id} (${team.type}) 同步成功，云库文档ID: ${result.id || team.id}`);
  } catch (err) {
    console.error(`[云同步] ✗ 队伍 ${team.id} 同步失败`);
    console.error(`[云同步] 错误类型: ${err.name || 'Unknown'}`);
    console.error(`[云同步] 错误信息: ${err.message}`);
    console.error(`[云同步] 错误代码: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`[云同步] 错误堆栈:\n${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

/**
 * 更新队伍时同步到云库（失败不影响主流程）
 * @param {string} teamId - 队伍 ID
 * @param {Object} updates - 要更新的字段（camelCase 格式）
 */
async function syncUpdateTeamToCloud(teamId, updates) {
  const db = initCloud();
  if (!db) {
    console.warn(`[云同步] 跳过更新队伍 ${teamId}：云开发未配置`);
    return;
  }
  
  console.log(`[云同步] 开始同步更新队伍 ${teamId} 到云库...`);
  console.log(`[云同步] 更新字段: ${Object.keys(updates).join(', ')}`);
  
  try {
    // 转换为 snake_case
    const cloudUpdates = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.members !== undefined) cloudUpdates.members = updates.members;
    if (updates.leaderId !== undefined) cloudUpdates.leader_id = updates.leaderId;
    if (updates.time !== undefined) cloudUpdates.time = updates.time;
    if (updates.date !== undefined) cloudUpdates.date = updates.date;
    if (updates.fullNotified !== undefined) cloudUpdates.full_notified = updates.fullNotified;
    if (updates.remindSent !== undefined) cloudUpdates.remind_sent = updates.remindSent;
    
    const result = await db.collection('teams').doc(teamId).update(cloudUpdates);
    
    // 根据 result.updated 判断成功/失败
    if (result.updated === 0) {
      console.error(`[云同步] ✗ 队伍 ${teamId} 更新失败：云库中不存在该文档（updated=0）`);
    } else {
      console.log(`[云同步] ✓ 队伍 ${teamId} 更新成功，更新数量: ${result.updated}`);
    }
  } catch (err) {
    console.error(`[云同步] ✗ 队伍 ${teamId} 更新失败`);
    console.error(`[云同步] 错误类型: ${err.name || 'Unknown'}`);
    console.error(`[云同步] 错误信息: ${err.message}`);
    console.error(`[云同步] 错误代码: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`[云同步] 错误堆栈:\n${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

/**
 * 删除队伍时同步删除云库数据（失败不影响主流程）
 * @param {string} teamId - 队伍 ID
 */
async function syncDeleteTeamFromCloud(teamId) {
  const db = initCloud();
  if (!db) {
    console.warn(`[云同步] 跳过删除队伍 ${teamId}：云开发未配置`);
    return;
  }
  
  console.log(`[云同步] 开始从云库删除队伍 ${teamId}...`);
  
  try {
    const result = await db.collection('teams').doc(teamId).remove();
    
    // 根据 result.deleted 判断成功/失败
    if (result.deleted === 0) {
      console.error(`[云同步] ✗ 队伍 ${teamId} 删除失败：云库中不存在该文档（deleted=0）`);
    } else {
      console.log(`[云同步] ✓ 队伍 ${teamId} 已从云库删除，删除数量: ${result.deleted}`);
    }
  } catch (err) {
    console.error(`[云同步] ✗ 队伍 ${teamId} 从云库删除失败`);
    console.error(`[云同步] 错误类型: ${err.name || 'Unknown'}`);
    console.error(`[云同步] 错误信息: ${err.message}`);
    console.error(`[云同步] 错误代码: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`[云同步] 错误堆栈:\n${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

/**
 * 更新抽奖数据时同步到云库（失败不影响主流程）
 * @param {Object} updates - 要更新的字段（camelCase 格式）
 */
async function syncUpdateLotteryToCloud(updates) {
  const db = initCloud();
  if (!db) {
    console.warn(`[云同步] 跳过更新抽奖数据：云开发未配置`);
    return;
  }
  
  console.log(`[云同步] 开始同步更新抽奖数据到云库...`);
  console.log(`[云同步] 更新字段: ${Object.keys(updates).join(', ')}`);
  
  try {
    // 转换为 snake_case
    const cloudUpdates = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.slots !== undefined) cloudUpdates.slots = updates.slots;
    if (updates.winners !== undefined) cloudUpdates.winners = updates.winners;
    if (updates.bannerClearedAt !== undefined) cloudUpdates.banner_cleared_at = updates.bannerClearedAt;
    if (updates.lastClear !== undefined) cloudUpdates.last_clear = updates.lastClear;
    
    // lottery 表是单例，固定 _id 为 'singleton'
    const result = await db.collection('lottery').doc('singleton').update(cloudUpdates);
    
    // 根据 result.updated 判断成功/失败
    if (result.updated === 0) {
      console.error(`[云同步] ✗ 抽奖数据更新失败：云库中不存在该文档（updated=0）`);
    } else {
      console.log(`[云同步] ✓ 抽奖数据更新成功，更新数量: ${result.updated}`);
    }
  } catch (err) {
    console.error(`[云同步] ✗ 抽奖数据更新失败`);
    console.error(`[云同步] 错误类型: ${err.name || 'Unknown'}`);
    console.error(`[云同步] 错误信息: ${err.message}`);
    console.error(`[云同步] 错误代码: ${err.code || 'N/A'}`);
    if (err.stack) {
      console.error(`[云同步] 错误堆栈:\n${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  }
}

module.exports = { 
  syncNewUserToCloud, 
  syncUpdateUserToCloud,
  syncDeleteUserFromCloud,
  syncNewTeamToCloud,
  syncUpdateTeamToCloud,
  syncDeleteTeamFromCloud,
  syncUpdateLotteryToCloud
};
