/**
 * 签到路由
 * POST /api/sign-in, GET /api/sign-in/status
 */
const express = require('express');
const router = express.Router();
const signInService = require('../services/signInService');

// POST /api/sign-in
router.post('/', async (req, res) => {
  const result = await signInService.signIn(req.body.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// GET /api/sign-in/status
router.get('/status', async (req, res) => {
  const result = signInService.getSignInStatus(req.query.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
