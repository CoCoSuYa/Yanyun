/**
 * 掘金游戏路由
 * /api/games/juejin 全部端点
 */
const express = require('express');
const router = express.Router();
const gameService = require('../services/gameService');

// POST /api/games/juejin/score
router.post('/juejin/score', async (req, res) => {
  const result = await gameService.submitScore(req.body.userId, req.body.score);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// GET /api/games/juejin/leaderboard
router.get('/juejin/leaderboard', (req, res) => {
  res.json({ leaderboard: gameService.getLeaderboard(parseInt(req.query.limit) || 10) });
});

// GET /api/games/juejin/user/:userId
router.get('/juejin/user/:userId', (req, res) => {
  const result = gameService.getUserScore(req.params.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// POST /api/games/juejin/complete
router.post('/juejin/complete', async (req, res) => {
  const result = await gameService.completeGame(req.body.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
