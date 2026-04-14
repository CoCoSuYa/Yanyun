/**
 * 管理员路由
 * /api/admin
 */
const express = require('express');
const router = express.Router();
const cache = require('../cache');
const userDao = require('../dao/userDao');
const { requireAdmin } = require('../middleware/auth');
const { toCamelCaseUser } = require('../utils/format');

// POST /api/admin/fix-avatars
router.post('/fix-avatars', requireAdmin, async (req, res) => {
  try {
    const mysqlDb = require('../db/mysql');
    const result = await mysqlDb.query(
      `UPDATE users SET avatar_url = REPLACE(REPLACE(REPLACE(avatar_url, ' ', ''), '\\n', ''), '\\r', '')
       WHERE avatar_url LIKE '% %' OR avatar_url LIKE '%\\n%' OR avatar_url LIKE '%\\r%'`
    );

    // 重新加载用户数据到内存
    const mysqlUsers = await userDao.getAllUsers();
    cache.setUsers(mysqlUsers.map(toCamelCaseUser));

    res.json({ ok: true, affectedRows: result.affectedRows });
  } catch (e) {
    console.error('清理avatar_url失败:', e);
    res.status(500).json({ error: '清理失败' });
  }
});

module.exports = router;
