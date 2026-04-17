/**
 * 用户路由
 * GET/POST/PUT/DELETE /api/users, POST /api/users/avatar, POST /api/users/set-checkin-days
 */
const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const { requireAdmin } = require('../middleware/auth');

// GET /api/users
router.get('/', (req, res) => {
  res.json(userService.listUsers());
});

// POST /api/users
router.post('/', async (req, res) => {
  const result = await userService.createUser(req.body);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(result.status || 201).json(result.user);
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const { gameName, mainStyle, subStyle, oldPassword, newPassword } = req.body;
  const result = await userService.updateUser(req.params.id, { gameName, mainStyle, subStyle, oldPassword, newPassword });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.user);
});

// POST /api/users/avatar
router.post('/avatar', async (req, res) => {
  const { userId, fileName, contentType, dataUrl } = req.body || {};
  const result = await userService.uploadAvatar(userId, { fileName, contentType, dataUrl });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const result = await userService.deleteUser(req.params.id, req.body.adminId || req.query.adminId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// POST /api/users/set-checkin-days
router.post('/set-checkin-days', async (req, res) => {
  const { username, days } = req.body;
  const result = await userService.setCheckinDays(username, days);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
