/**
 * 贡献值路由
 * GET /api/contribution/:userId
 * POST /api/contribution/exchange
 */
const express = require('express');
const router = express.Router();
const contributionService = require('../services/contributionService');

router.post('/exchange', async (req, res) => {
  const { userId, times } = req.body;
  const result = await contributionService.exchangeToLotteryCount(userId, times);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.get('/:userId', (req, res) => {
  const result = contributionService.getContribution(req.params.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
