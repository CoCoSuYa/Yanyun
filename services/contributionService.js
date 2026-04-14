/**
 * 贡献值服务
 * 贡献值查询
 * 已去除：云同步
 */
const cache = require('../cache');

function getContribution(userId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };
  return { contributionPoints: user.contributionPoints || 0 };
}

module.exports = { getContribution };
