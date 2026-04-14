/**
 * 队伍路由
 * /api/teams 全部端点
 */
const express = require('express');
const router = express.Router();
const teamService = require('../services/teamService');
const cache = require('../cache');
const { requireAdmin } = require('../middleware/auth');

// GET /api/teams
router.get('/', (req, res) => {
  res.json(cache.getTeams());
});

// GET /api/teams/:id
router.get('/:id', (req, res) => {
  const team = teamService.getTeam(req.params.id);
  if (!team) return res.status(404).json({ error: '队伍不存在' });
  res.json(team);
});

// POST /api/teams
router.post('/', async (req, res) => {
  const result = await teamService.createTeam(req.body);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(result.status || 201).json(result.team);
});

// POST /api/teams/:id/join
router.post('/:id/join', async (req, res) => {
  const result = await teamService.joinTeam(req.params.id, req.body.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.team || result);
});

// POST /api/teams/:id/leave
router.post('/:id/leave', async (req, res) => {
  const result = await teamService.leaveTeam(req.params.id, req.body.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.team || result);
});

// POST /api/teams/:id/kick
router.post('/:id/kick', async (req, res) => {
  const { leaderId, targetUserId } = req.body;
  const result = await teamService.kickMember(req.params.id, leaderId, targetUserId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.team || result);
});

// PUT /api/teams/:id/order
router.put('/:id/order', async (req, res) => {
  const { leaderId, members } = req.body;
  const result = await teamService.reorderMembers(req.params.id, leaderId, members);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.team);
});

// PUT /api/teams/:id/time
router.put('/:id/time', async (req, res) => {
  const { leaderId, time, date } = req.body;
  const result = await teamService.changeTeamTime(req.params.id, leaderId, time, date);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.team);
});

// POST /api/teams/:id/dissolve
router.post('/:id/dissolve', requireAdmin, async (req, res) => {
  const result = await teamService.dissolveTeam(req.params.id, req.body.adminId || req.query.adminId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
