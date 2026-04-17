/**
 * 音乐路由
 * GET /api/music
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const musicDir = path.join(__dirname, '..', 'public', 'music');

function listMusicTracks() {
  if (!fs.existsSync(musicDir)) return [];
  return fs.readdirSync(musicDir)
    .filter(file => /\.mp3$/i.test(file))
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' }))
    .map(file => ({
      id: file,
      url: `/music/${encodeURIComponent(file)}`,
      name: path.parse(file).name,
      fileName: file,
    }));
}

router.get('/', (req, res) => {
  try {
    res.json(listMusicTracks());
  } catch (e) {
    console.error('获取音乐列表失败:', e);
    res.status(500).json({ error: '获取音乐列表失败' });
  }
});

module.exports = router;
