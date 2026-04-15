/**
 * 掘金游戏服务
 * 分数/排行榜/通关
 * 已去除：云同步；直接调用 achievementService 替代自调 API
 */
const cache = require('../cache');
const userDao = require('../dao/userDao');
const { broadcast } = require('../websocket/broadcast');
const { syncUpdateUserToCloud } = require('../utils/cloudSync');

// 延迟引用避免循环依赖
let _achievementService = null;
function getAchievementService() {
  if (!_achievementService) _achievementService = require('./achievementService');
  return _achievementService;
}

async function submitScore(userId, score) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const oldScore = user.juejinHighScore || 0;
  const updated = score > oldScore;

  const earnedPoints = Math.floor(score / 1000);
  if (!user.contributionPoints) user.contributionPoints = 0;
  user.contributionPoints += earnedPoints;

  if (updated) {
    user.juejinHighScore = score;
  }

  try {
    await userDao.updateUser(userId, {
      juejin_high_score: updated ? score : user.juejinHighScore,
      juejin_last_played: new Date().toISOString().slice(0, 19).replace('T', ' '),
      contribution_points: user.contributionPoints
    });
    
    // 异步同步到云库（不阻塞主流程，失败静默处理）
    syncUpdateUserToCloud(userId, {
      juejinHighScore: updated ? score : user.juejinHighScore,
      juejinLastPlayed: new Date().toISOString().slice(0, 19).replace('T', ' '),
      contributionPoints: user.contributionPoints
    }).catch(() => {});
  } catch (e) {
    return { error: '保存失败', status: 500 };
  }

  const sorted = users
    .filter(u => u.juejinHighScore > 0)
    .sort((a, b) => b.juejinHighScore - a.juejinHighScore);
  const rank = sorted.findIndex(u => u.id === userId) + 1;

  return { updated, highScore: user.juejinHighScore, rank, earnedPoints };
}

function getLeaderboard(limit = 10) {
  const users = cache.getUsers();
  return users
    .filter(u => u.juejinHighScore > 0)
    .sort((a, b) => b.juejinHighScore - a.juejinHighScore)
    .slice(0, limit)
    .map((u, index) => ({
      rank: index + 1,
      userId: u.id,
      gameName: u.gameName,
      avatarUrl: u.avatarUrl || '/img/default-avatar.jpg',
      highScore: u.juejinHighScore
    }));
}

function getUserScore(userId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const sorted = users
    .filter(u => u.juejinHighScore > 0)
    .sort((a, b) => b.juejinHighScore - a.juejinHighScore);
  const rank = sorted.findIndex(u => u.id === user.id) + 1;

  return {
    userId: user.id,
    gameName: user.gameName,
    avatarUrl: user.avatarUrl || '/img/default-avatar.jpg',
    highScore: user.juejinHighScore || 0,
    rank: rank || 0
  };
}

async function completeGame(userId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };
  if (user.juejinCompleted) return { alreadyCompleted: true };

  user.juejinCompleted = true;
  try {
    await userDao.updateUser(userId, { juejin_completed: 1 });
    
    // 异步同步到云库（不阻塞主流程，失败静默处理）
    syncUpdateUserToCloud(userId, {
      juejinCompleted: true
    }).catch(() => {});
  } catch (e) {
    return { error: '保存失败', status: 500 };
  }

  // 直接调用 achievementService（替代自调 API 反模式）
  setImmediate(async () => {
    try {
      const achResult = await getAchievementService().checkAchievements(userId, 'juejin');
      if (achResult.newAchievements && achResult.newAchievements.length > 0) {
        broadcast({ type: 'achievement', userId, achievement: achResult.newAchievements[0] });
      }
    } catch (e) { }
  });

  return { success: true };
}

module.exports = { submitScore, getLeaderboard, getUserScore, completeGame };
