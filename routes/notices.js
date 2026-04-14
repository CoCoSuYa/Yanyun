/**
 * 公告路由
 * /api/notices 全部端点（含已读标记）
 */
const express = require('express');
const router = express.Router();
const noticeService = require('../services/noticeService');
const { requireAdmin } = require('../middleware/auth');

// GET /api/notices
router.get('/', (req, res) => {
  try {
    res.json(noticeService.listNotices(req.query.userId));
  } catch (e) {
    res.status(500).json({ error: '获取告示失败' });
  }
});

// POST /api/notices
router.post('/', requireAdmin, async (req, res) => {
  try {
    const result = await noticeService.createNotice(req.body.adminId, req.body.content);
    res.json(result);
  } catch (e) {
    console.error('发布告示失败:', e);
    res.status(500).json({ error: '发布告示失败' });
  }
});

// DELETE /api/notices/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await noticeService.deleteNotice(req.params.id);
    res.json(result);
  } catch (e) {
    console.error('删除告示失败:', e);
    res.status(500).json({ error: '删除告示失败' });
  }
});

// POST /api/notices/:id/read
router.post('/:id/read', async (req, res) => {
  const result = await noticeService.markNoticeRead(req.body.userId, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
