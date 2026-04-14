/**
 * 抽奖路由
 * /api/lottery 全部端点
 */
const express = require('express');
const router = express.Router();
const lotteryService = require('../services/lotteryService');

// GET /api/lottery
router.get('/', (req, res) => {
  res.json(lotteryService.getLottery());
});

// PUT /api/lottery/slots/:idx
router.put('/slots/:idx', async (req, res) => {
  const { adminId, text, quantity, isWinning } = req.body;
  const result = await lotteryService.updateSlot(adminId, parseInt(req.params.idx), { text, quantity, isWinning });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.slot);
});

// POST /api/lottery/spin
router.post('/spin', async (req, res) => {
  const result = await lotteryService.spin(req.body.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// POST /api/lottery/clear-banner
router.post('/clear-banner', async (req, res) => {
  const result = await lotteryService.clearBanner(req.body.adminId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// POST /api/lottery/clear-winners
router.post('/clear-winners', async (req, res) => {
  const result = await lotteryService.clearWinners(req.body.adminId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// POST /api/lottery/add-count
router.post('/add-count', async (req, res) => {
  const { adminId, targetUserId, count } = req.body;
  const result = await lotteryService.setLotteryCount(adminId, targetUserId, count);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
