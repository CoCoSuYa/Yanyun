const express = require('express');
const router = express.Router();
const lotteryService = require('../services/lotteryService');

router.get('/', (req, res) => {
  res.json(lotteryService.getLottery());
});

router.get('/shop-items', (req, res) => {
  res.json({ items: lotteryService.getShopItems() });
});

router.post('/spin', async (req, res) => {
  const result = await lotteryService.draw(req.body.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.post('/exchange', async (req, res) => {
  const { userId, times } = req.body;
  const result = await lotteryService.exchangeContributionForDraw(userId, times);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.post('/redeem', async (req, res) => {
  const { userId, itemId } = req.body;
  const result = await lotteryService.redeemShopItem(userId, itemId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.post('/clear-banner', async (req, res) => {
  const result = await lotteryService.clearBanner(req.body.adminId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.post('/clear-winners', async (req, res) => {
  const result = await lotteryService.clearWinners(req.body.adminId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.post('/add-count', async (req, res) => {
  const { adminId, targetUserId, count } = req.body;
  const result = await lotteryService.setLotteryCount(adminId, targetUserId, count);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
