/**
 * 成就路由
 * /api/achievements
 */
const express = require('express');
const router = express.Router();
const achievementService = require('../services/achievementService');

// GET /api/achievements/:userId
router.get('/:userId', (req, res) => {
  const result = achievementService.getUserAchievements(req.params.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// POST /api/achievements/check
router.post('/check', async (req, res) => {
  const { userId, type } = req.body;
  const result = await achievementService.checkAchievements(userId, type);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// POST /api/achievements/trigger
router.post('/trigger', async (req, res) => {
  const { userId, tag } = req.body;
  const result = await achievementService.triggerAchievement(userId, tag);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
