/**
 * 贡献值结算定时任务
 * 每晚23:50扫描队伍并发放贡献值
 * 已去除：云同步
 */
const cache = require('../cache');
const userDao = require('../dao/userDao');

async function checkTeamContributions() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  if (hour !== 23 || minute !== 50) return;

  const today = now.toISOString().split('T')[0];
  const processedKey = `team_contribution_${today}`;

  if (global[processedKey]) return;
  global[processedKey] = true;

  console.log(`[贡献值] 开始扫描 ${today} 的队伍...`);

  const teams = cache.getTeams();
  const todayTeams = teams.filter(t => t.date === today);
  const userPoints = {};

  for (const team of todayTeams) {
    const points = team.maxSize === 10 ? 100 : 50;
    for (const member of team.members) {
      userPoints[member.userId] = (userPoints[member.userId] || 0) + points;
    }
  }

  const users = cache.getUsers();
  for (const [userId, points] of Object.entries(userPoints)) {
    const user = users.find(u => u.id === userId);
    if (user) {
      if (!user.contributionPoints) user.contributionPoints = 0;
      user.contributionPoints += points;
      try {
        await userDao.updateUser(userId, { contribution_points: user.contributionPoints });
        console.log(`[贡献值] ${user.gameName} 获得 ${points} 贡献值`);
      } catch (e) {
        console.error(`[贡献值] 更新失败: ${user.gameName}`, e);
      }
    }
  }

  console.log(`[贡献值] 扫描完成，共处理 ${Object.keys(userPoints).length} 位玩家`);
}

function startContributionSettlement() {
  setInterval(checkTeamContributions, 60 * 1000);
}

module.exports = { startContributionSettlement };
