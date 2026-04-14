/**
 * 成就服务
 * 成就检查/触发
 * 已去除：云同步；消除自调 API 反模式
 */
const cache = require('../cache');
const userDao = require('../dao/userDao');

const ACHIEVEMENTS = [
  { id: 'signin_30', name: '初心不改', desc: '累计签到30天', type: 'signin', target: 30 },
  { id: 'signin_90', name: '坚持不懈', desc: '累计签到90天', type: 'signin', target: 90 },
  { id: 'signin_180', name: '半载相伴', desc: '累计签到180天', type: 'signin', target: 180 },
  { id: 'signin_365', name: '岁月如歌', desc: '累计签到365天', type: 'signin', target: 365 },
  { id: 'juejin_complete', name: '掘金之王', desc: '成功通关掘金玩法', type: 'juejin', target: 1 }
];

function getUserAchievements(userId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  return {
    achievements: user.achievements || [],
    signInCount: user.signInCount || 0,
    juejinCompleted: user.juejinCompleted || false
  };
}

async function checkAchievements(userId, type) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const newAchievements = [];
  const userAchievements = user.achievements || [];

  for (const ach of ACHIEVEMENTS) {
    if (ach.type !== type || userAchievements.includes(ach.id)) continue;

    let unlocked = false;
    if (type === 'signin') {
      unlocked = (user.signInCount || 0) >= ach.target;
    } else if (type === 'juejin') {
      unlocked = user.juejinCompleted === true;
    }

    if (unlocked) {
      userAchievements.push(ach.id);
      newAchievements.push({ id: ach.id, name: ach.name, desc: ach.desc });
    }
  }

  if (newAchievements.length > 0) {
    user.achievements = userAchievements;
    try {
      await userDao.updateUser(userId, { achievements: JSON.stringify(userAchievements) });
    } catch (e) {
      return { error: '保存失败', status: 500 };
    }
  }

  return { newAchievements, allAchievements: userAchievements };
}

async function triggerAchievement(userId, tag) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const tagMap = {
    '1': { id: 'signin_30', count: 30 },
    '2': { id: 'signin_90', count: 90 },
    '3': { id: 'signin_180', count: 180 },
    '4': { id: 'signin_365', count: 365 },
    '5': { id: 'juejin_complete', juejin: true }
  };

  const config = tagMap[String(tag)];
  if (!config) return { error: '无效的tag参数，请使用1-5', status: 400 };

  try {
    if (config.count) {
      user.signInCount = config.count;
      await userDao.updateUser(userId, { sign_in_count: config.count });
    } else if (config.juejin) {
      user.juejinCompleted = true;
      await userDao.updateUser(userId, { juejin_completed: 1 });
    }

    // 直接调用 checkAchievements 而非自调 API
    const type = config.count ? 'signin' : 'juejin';
    const achResult = await checkAchievements(userId, type);
    if (achResult.newAchievements && achResult.newAchievements.length > 0) {
      const { broadcast } = require('../websocket/broadcast');
      broadcast({ type: 'achievement', userId, achievement: achResult.newAchievements[0] });
      return { success: true, achievement: achResult.newAchievements[0] };
    }

    return { success: true, message: '成就已解锁或条件已设置' };
  } catch (e) {
    return { error: '触发失败', status: 500 };
  }
}

module.exports = {
  ACHIEVEMENTS,
  getUserAchievements,
  checkAchievements,
  triggerAchievement
};
