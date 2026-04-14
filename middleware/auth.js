/**
 * 认证中间件
 * requireUser: 验证 userId 存在，挂 req.user
 * requireAdmin: 验证 userId 存在且 isAdmin
 */
const cache = require('../cache');
const { isAdminUser } = require('../utils/password');

function requireUser(req, res, next) {
  const userId = req.body.userId || req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: '缺少用户ID' });
  }
  const user = cache.getUsers().find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const adminId = req.body.adminId || req.query.adminId || req.body.userId || req.query.userId;
  if (!adminId) {
    return res.status(400).json({ error: '缺少管理员ID' });
  }
  const admin = cache.getUsers().find(u => u.id === adminId);
  if (!isAdminUser(admin)) {
    return res.status(403).json({ error: '无权限' });
  }
  req.admin = admin;
  next();
}

module.exports = { requireUser, requireAdmin };
