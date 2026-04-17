/**
 * 贡献值服务
 * 贡献值查询
 */
const cache = require('../cache');
const lotteryService = require('./lotteryService');

function getContribution(userId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };
  return {
    contributionPoints: user.contributionPoints || 0,
    exchangeRate: lotteryService.CONTRIBUTION_COST_PER_DRAW
  };
}

async function exchangeToLotteryCount(userId, times) {
  return await lotteryService.exchangeContributionForDraw(userId, times);
}

module.exports = { getContribution, exchangeToLotteryCount };
