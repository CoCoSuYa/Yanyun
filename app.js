/**
 * Express 应用配置
 * 中间件注册、静态服务、路由挂载、WS初始化、share.html渲染
 */
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const cache = require('./cache');
const { initWebSocket } = require('./websocket/broadcast');

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const teamRoutes = require('./routes/teams');
const lotteryRoutes = require('./routes/lottery');
const signinRoutes = require('./routes/signin');
const noticeRoutes = require('./routes/notices');
const suggestionRoutes = require('./routes/suggestions');
const gameRoutes = require('./routes/games');
const achievementRoutes = require('./routes/achievements');
const adminRoutes = require('./routes/admin');
const musicRoutes = require('./routes/music');
const contributionRoutes = require('./routes/contribution');

function createApp() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // 目录初始化
  const avatarDir = path.join(__dirname, 'public', 'uploads', 'avatars');
  const musicDir = path.join(__dirname, 'public', 'music');
  if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
  if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });

  // 中间件
  app.use(express.json({ limit: '6mb' }));

  // 分享页面（动态渲染 OG 标签）
  app.get('/share.html', (req, res) => {
    const teamId = req.query.join;
    let html = fs.readFileSync(path.join(__dirname, 'public', 'share.html'), 'utf-8');

    if (!teamId) return res.send(html);

    const teams = cache.getTeams();
    const users = cache.getUsers();
    const team = teams.find(t => t.id === teamId);
    const leader = team ? users.find(u => u.id === team.leaderId) : null;
    const leaderAvatar = leader && leader.avatarUrl ? leader.avatarUrl : '/img/default-avatar.jpg';

    const ogTags = `
  <meta property="og:title" content="点击卡片直接入队">
  <meta property="og:description" content="燕云十六声 · 江湖相邀共赴约">
  <meta property="og:image" content="http://${req.get('host')}${leaderAvatar}">
  <meta property="og:url" content="http://${req.get('host')}/share.html?join=${teamId}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="燕云十六声">`;

    html = html.replace('</head>', ogTags + '\n</head>');
    res.send(html);
  });

  // 静态服务
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads/avatars', express.static(avatarDir));

  // 路由挂载
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/lottery', lotteryRoutes);
  app.use('/api/sign-in', signinRoutes);
  app.use('/api/notices', noticeRoutes);
  app.use('/api/suggestions', suggestionRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/achievements', achievementRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/music', musicRoutes);
  app.use('/api/contribution', contributionRoutes);

  // WebSocket 初始化
  initWebSocket(wss);

  return { app, server };
}

module.exports = { createApp };
