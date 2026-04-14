/**
 * 签到服务
 * 签到/状态查询
 * 已去除：云同步；直接调用 achievementService 替代自调 API
 */
const cache = require('../cache');
const userDao = require('../dao/userDao');
const { broadcast } = require('../websocket/broadcast');

// 延迟引用避免循环依赖
let _achievementService = null;
function getAchievementService() {
  if (!_achievementService) _achievementService = require('./achievementService');
  return _achievementService;
}

async function signIn(userId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const today = new Date().toISOString().split('T')[0];
  const lastSignIn = user.lastSignInDate ? user.lastSignInDate.split('T')[0] : null;

  if (lastSignIn === today) {
    return { error: '今日已签到', alreadySignedIn: true, status: 400 };
  }

  if (!user.signInCount) user.signInCount = 0;
  if (!user.contributionPoints) user.contributionPoints = 0;
  if (!user.consecutiveSignIns) user.consecutiveSignIns = 0;

  // 计算连续签到
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const lastSignInDate = lastSignIn ? new Date(lastSignIn) : null;
  const daysSinceLastSignIn = lastSignInDate
    ? Math.floor((new Date() - lastSignInDate) / (1000 * 60 * 60 * 24))
    : Infinity;

  if (lastSignIn === yesterdayStr) {
    user.consecutiveSignIns++;
  } else if (daysSinceLastSignIn <= 1) {
    // 今天或昨天签到过，保持连签
  } else {
    user.consecutiveSignIns = 1;
  }

  const bonusPoints = 10 + Math.min(user.consecutiveSignIns - 1, 5);
  user.contributionPoints += bonusPoints;
  user.signInCount++;
  user.lotteryCount = (user.lotteryCount || 0) + 1;
  user.lastSignInDate = new Date().toISOString();

  try {
    await userDao.updateUser(user.id, {
      sign_in_count: user.signInCount,
      lottery_count: user.lotteryCount,
      last_sign_in_date: user.lastSignInDate.split('T')[0],
      contribution_points: user.contributionPoints,
      consecutive_sign_ins: user.consecutiveSignIns
    });

    const result = {
      ok: true,
      signInCount: user.signInCount,
      lotteryCount: user.lotteryCount,
      lastSignInDate: user.lastSignInDate,
      contributionPoints: user.contributionPoints,
      earnedPoints: bonusPoints
    };

    // 直接调用 achievementService（替代自调 API 反模式）
    setImmediate(async () => {
      try {
        const achResult = await getAchievementService().checkAchievements(userId, 'signin');
        if (achResult.newAchievements && achResult.newAchievements.length > 0) {
          broadcast({ type: 'achievement', userId, achievement: achResult.newAchievements[0] });
        }
      } catch (e) { }
    });

    return result;
  } catch (e) {
    user.signInCount--;
    user.lotteryCount--;
    user.lastSignInDate = lastSignIn ? new Date(lastSignIn).toISOString() : null;
    console.error('签到写入数据库失败:', e);
    return { error: '风云涌动，签到失败', status: 500 };
  }
}

function getSignInStatus(userId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const today = new Date().toISOString().split('T')[0];
  const lastSignIn = user.lastSignInDate ? user.lastSignInDate.split('T')[0] : null;
  const alreadySignedIn = lastSignIn === today;

  return {
    signInCount: user.signInCount || 0,
    lastSignInDate: user.lastSignInDate,
    alreadySignedIn
  };
}

module.exports = { signIn, getSignInStatus };
