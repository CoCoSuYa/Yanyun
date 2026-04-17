/**
 * 建议路由
 * /api/suggestions 全部端点（含已读标记）
 */
const express = require('express');
const router = express.Router();
const suggestionService = require('../services/suggestionService');
const { requireAdmin } = require('../middleware/auth');

// GET /api/suggestions
router.get('/', requireAdmin, (req, res) => {
  try {
    res.json(suggestionService.listSuggestions(req.query.adminId));
  } catch (e) {
    res.status(500).json({ error: '获取建议失败' });
  }
});

// POST /api/suggestions
router.post('/', async (req, res) => {
  const { userId, gameName, content, date } = req.body;
  if (!userId || !content) return res.status(400).json({ error: '参数缺失' });
  try {
    const result = await suggestionService.createSuggestion(userId, content);
    res.json(result);
  } catch (e) {
    console.error('提交建议失败:', e);
    res.status(500).json({ error: '提交建议失败' });
  }
});

// DELETE /api/suggestions/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await suggestionService.deleteSuggestion(req.params.id);
    res.json(result);
  } catch (e) {
    console.error('删除建议失败:', e);
    res.status(500).json({ error: '删除建议失败' });
  }
});

// POST /api/suggestions/:id/read
router.post('/:id/read', requireAdmin, async (req, res) => {
  const result = await suggestionService.markSuggestionRead(req.body.adminId, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
