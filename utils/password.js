/**
 * 密码工具
 */
const crypto = require('crypto');

const PWD_SALT = 'yanyun16_';

function hashPassword(pw) {
  return crypto.createHash('sha256').update(PWD_SALT + pw).digest('hex');
}

const DEFAULT_PWD_HASH = hashPassword('123456');

/** 管理员判断：通过 isAdmin 字段，不依赖特定游戏名 */
function isAdminUser(u) { return !!(u && u.isAdmin); }

module.exports = { hashPassword, PWD_SALT, DEFAULT_PWD_HASH, isAdminUser };
