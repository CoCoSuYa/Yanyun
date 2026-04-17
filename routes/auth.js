/**
 * 认证路由
 * POST /api/auth/login
 */
const express = require('express');
const router = express.Router();
const userService = require('../services/userService');

router.post('/login', (req, res) => {
  const { gameName, password } = req.body;
  if (!gameName || !password) {
    return res.status(400).json({ error: '游戏名与密码不可为空' });
  }

  const result = userService.login(gameName, password);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json(result.user);
});

module.exports = router;
