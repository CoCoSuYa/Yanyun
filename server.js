const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const fs = require('fs');

// MySQL DAO
const userDao = require('./dao/userDao');
const teamDao = require('./dao/teamDao');
const lotteryDao = require('./dao/lotteryDao');
const noticeDao = require('./dao/noticeDao');
const suggestionDao = require('./dao/suggestionDao');

// 加载 .env.local（生产环境用系统环境变量，本地用文件）
; (function loadEnvLocal() {
  try {
    const f = path.join(__dirname, '.env.local');
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  } catch { }
})();

const MP_APPID = process.env.MP_APPID || '';
const MP_APPSECRET = process.env.MP_APPSECRET || '';
const MP_TEMPLATES = {
  invite: process.env.MP_TEMPLATE_INVITE || '',
  full: process.env.MP_TEMPLATE_FULL || '',
  remind: process.env.MP_TEMPLATE_REMIND || '',
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const avatarDir = path.join(__dirname, 'public', 'uploads', 'avatars');
const musicDir = path.join(__dirname, 'public', 'music');

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

if (!fs.existsSync(musicDir)) {
  fs.mkdirSync(musicDir, { recursive: true });
}

app.use(express.json({ limit: '6mb' }));

// 动态渲染分享页面的Open Graph标签
app.get('/share.html', (req, res) => {
  const teamId = req.query.join;
  let html = fs.readFileSync(path.join(__dirname, 'public/share.html'), 'utf-8');

  if (!teamId) {
    return res.send(html);
  }

  const team = teams.find(t => t.id === teamId);
  const leader = team ? users.find(u => u.id === team.leaderId) : null;
  const leaderAvatar = leader && leader.avatar ? leader.avatar : '/img/default-avatar.jpg';

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

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads/avatars', express.static(avatarDir));

// ---------- 密码工具 ----------
const PWD_SALT = 'yanyun16_';
function hashPassword(pw) {
  return crypto.createHash('sha256').update(PWD_SALT + pw).digest('hex');
}
const DEFAULT_PWD_HASH = hashPassword('123456');

// 管理员判断：通过 isAdmin 字段，不依赖特定游戏名
function isAdminUser(u) { return !!(u && u.isAdmin); }

const cloudbase = require('@cloudbase/node-sdk');

// 测试环境时如果不填 CloudBase，可以直接从系统环境拉取
const CB_ENV = process.env.CLOUD_ENV || process.env.MP_CLOUD_ENV;
const CB_SID = process.env.CLOUD_SECRET_ID;
const CB_SKEY = process.env.CLOUD_SECRET_KEY;

if (!CB_ENV || !CB_SID || !CB_SKEY) {
  console.error('[FATAL] 缺少必要的云开发环境变量: CLOUD_ENV, CLOUD_SECRET_ID, CLOUD_SECRET_KEY');
  process.exit(1);
}

const appCb = cloudbase.init({
  env: CB_ENV,
  secretId: CB_SID,
  secretKey: CB_SKEY
});
const db = appCb.database();

// ---------- 缓存与数据加载 ----------
// 为了保证 WebSocket 广播和页面直出的性能，我们依然在内存中维护一份数据副本。
// 但所有写操作必须先写入云数据库，成功后再更新内存广播。
let users = [];
let teams = [];
let lottery = { slots: [], winners: [] };
let notices = [];
let suggestions = [];

// ---------- 成就系统 ----------
const ACHIEVEMENTS = [
  { id: 'signin_30', name: '初心不改', desc: '累计签到30天', type: 'signin', target: 30 },
  { id: 'signin_90', name: '坚持不懈', desc: '累计签到90天', type: 'signin', target: 90 },
  { id: 'signin_180', name: '半载相伴', desc: '累计签到180天', type: 'signin', target: 180 },
  { id: 'signin_365', name: '岁月如歌', desc: '累计签到365天', type: 'signin', target: 365 },
  { id: 'juejin_complete', name: '掘金之王', desc: '成功通关掘金玩法', type: 'juejin', target: 1 }
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()} - ${String(d.getMonth() + 1).padStart(2, '0')
    }-${String(d.getDate()).padStart(2, '0')}`;
}


// 异步同步到云数据库（不阻塞主流程）
function syncToCloud(collection, id, data) {
  setImmediate(async () => {
    try {
      await db.collection(collection).where({ id }).update(data);
    } catch (e) {
      console.error(`[同步失败] ${collection}/${id}:`, e.message);
    }
  });
}

async function loadData() {
  try {
    const t0 = Date.now();
    console.log('正在从MySQL加载数据...');

    // 并行加载所有数据
    const [mysqlUsers, mysqlLottery, mysqlNotices, mysqlSuggestions] = await Promise.all([
      userDao.getAllUsers(),
      lotteryDao.getLottery(),
      noticeDao.getAllNotices(),
      suggestionDao.getAllSuggestions()
    ]);

    // 转换MySQL数据格式
    users = mysqlUsers.map(u => ({
      id: u.id,
      gameName: u.game_name,
      guildName: u.guild_name,
      mainStyle: u.main_style,
      subStyle: u.sub_style,
      passwordHash: u.password_hash,
      avatarUrl: u.avatar_url,
      isAdmin: !!u.is_admin,
      signInCount: u.sign_in_count,
      lastSignInDate: u.last_sign_in_date,
      lotteryCount: u.lottery_count,
      readNoticeIds: typeof u.read_notice_ids === 'string' ? JSON.parse(u.read_notice_ids) : (u.read_notice_ids || []),
      readSuggestionIds: typeof u.read_suggestion_ids === 'string' ? JSON.parse(u.read_suggestion_ids) : (u.read_suggestion_ids || []),
      juejinHighScore: u.juejin_high_score,
      juejinCompleted: !!u.juejin_completed,
      achievements: typeof u.achievements === 'string' ? JSON.parse(u.achievements) : (u.achievements || []),
      openId: u.open_id,
      contributionPoints: u.contribution_points,
      consecutiveSignIns: u.consecutive_sign_ins,
      mpQuota: typeof u.mp_quota === 'string' ? JSON.parse(u.mp_quota) : (u.mp_quota || { invite: 0, full: 0, remind: 0 }),
      inviteLog: typeof u.invite_log === 'string' ? JSON.parse(u.invite_log) : (u.invite_log || {}),
      pendingInvites: typeof u.pending_invites === 'string' ? JSON.parse(u.pending_invites) : (u.pending_invites || []),
      juejinLastPlayed: u.juejin_last_played || null
    }));

    // 转换notices数据
    notices = mysqlNotices.map(n => ({
      id: n.id,
      title: n.title,
      content: n.content,
      authorId: n.author_id,
      createdAt: n.created_at
    }));

    // 转换suggestions数据
    suggestions = mysqlSuggestions.map(s => ({
      id: s.id,
      content: s.content,
      authorId: s.author_id,
      createdAt: s.created_at
    }));

    // 加载teams（从MySQL）
    const t3 = Date.now();
    const mysqlTeams = await teamDao.getAllTeams();
    teams = mysqlTeams.map(t => {
      let timeValue = t.time;
      // 兼容旧数据：如果 time 是 HH:MM:SS 格式，结合 date 补全为 ISO 字符串
      if (timeValue && /^\d{2}:\d{2}:\d{2}$/.test(timeValue) && t.date) {
        timeValue = `${t.date}T${timeValue}.000Z`;
      }
      return {
        id: t.id,
        type: t.type,
        purpose: t.purpose,
        date: t.date,
        time: timeValue,
        leaderId: t.leader_id,
        members: typeof t.members === 'string' ? JSON.parse(t.members) : (t.members || []),
        maxSize: t.max_size || 10,
        fullNotified: !!t.full_notified,
        remindSent: !!t.remind_sent,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      };
    });
    console.log(`[性能] 加载teams耗时: ${Date.now() - t3}ms`);

    lottery = mysqlLottery ? {
      slots: typeof mysqlLottery.slots === 'string' ? JSON.parse(mysqlLottery.slots) : (mysqlLottery.slots || []),
      winners: typeof mysqlLottery.winners === 'string' ? JSON.parse(mysqlLottery.winners) : (mysqlLottery.winners || []),
      bannerClearedAt: mysqlLottery.banner_cleared_at,
      lastClear: mysqlLottery.last_clear || null
    } : {
      slots: Array(16).fill({ text: '谢谢参与', quantity: -1, isWinning: false }),
      winners: [],
      bannerClearedAt: new Date(0).toISOString(),
      lastClear: null
    };

    console.log(`✅ 已从MySQL加载 ${users.length} 名游侠, ${notices.length} 条公告, ${suggestions.length} 条建议`);
    console.log(`[性能] loadData总耗时: ${Date.now() - t0}ms`);
  } catch (e) {
    console.error('❌ 从MySQL加载数据失败:', e.message);
  }
}

// ---------- WebSocket 广播 ----------
function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
}

// 用户对外安全字段（不含密码哈希、openId、邀请日志、邀请待处理列表）
function safeUser(u) {
  const { passwordHash, openId, inviteLog, pendingInvites, ...rest } = u;
  return rest;
}

function getAvatarExtension(fileName = '', contentType = '') {
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/gif') return '.gif';
  return '';
}

function removeUserAvatarFiles(userId) {
  if (!fs.existsSync(avatarDir)) return;
  const prefix = `${userId}.`;
  for (const file of fs.readdirSync(avatarDir)) {
    if (file.startsWith(prefix)) {
      fs.unlinkSync(path.join(avatarDir, file));
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      users: users.map(safeUser), teams,
      lottery: { slots: lottery.slots, winners: lottery.winners || [], bannerClearedAt: lottery.bannerClearedAt }
    }
  }));
  ws.on('error', () => { });
});

// ---------- 登录 ----------
app.post('/api/auth/login', (req, res) => {
  const { gameName, password } = req.body;
  if (!gameName || !password)
    return res.status(400).json({ error: '游戏名与密码不可为空' });

  const user = users.find(u => u.gameName === gameName.trim());
  if (!user)
    return res.status(401).json({ error: '此游戏名尚未登录江湖，请先注册' });

  if (user.passwordHash !== hashPassword(password))
    return res.status(401).json({ error: '密码有误，请重新确认' });

  res.json(safeUser(user));
});

// ---------- 用户接口 ----------
app.get('/api/users', (req, res) => {
  res.json(users.map(safeUser));
});

app.post('/api/users', async (req, res) => {
  const { gameName, guildName, mainStyle, subStyle, password } = req.body;

  if (!gameName || !gameName.trim())
    return res.status(400).json({ error: '游戏名不可为空' });

  if (guildName !== '百舸争流')
    return res.status(400).json({ error: '非本百业游侠，暂无法使用此功能' });

  if (!mainStyle || !/^[\u4e00-\u9fa5]{1,2}$/.test(mainStyle))
    return res.status(400).json({ error: '主流派仅允许最多2个中文字符' });

  if (subStyle && !/^[\u4e00-\u9fa5]{1,2}$/.test(subStyle))
    return res.status(400).json({ error: '副流派仅允许最多2个中文字符' });

  if (!password || password.length < 6)
    return res.status(400).json({ error: '密码不可少于6位' });

  const existing = users.find(u => u.gameName === gameName.trim());
  if (existing)
    return res.status(409).json({ error: '此名已被江湖同侪占用，请另择他名' });

  const user = {
    id: uuidv4(),
    gameName: gameName.trim(),
    guildName,
    mainStyle,
    subStyle: subStyle || '',
    passwordHash: hashPassword(password),
    lotteryCount: 1,
    signInCount: 0,
    lastSignInDate: null,
    readNoticeIds: [],
    readSuggestionIds: [],
    contributionPoints: 0,
    consecutiveSignIns: 0
  };

  try {
    // 写入MySQL
    await userDao.createUser({
      id: user.id,
      game_name: user.gameName,
      guild_name: user.guildName,
      main_style: user.mainStyle,
      sub_style: user.subStyle,
      password_hash: user.passwordHash,
      avatar_url: '',
      open_id: '',
      is_admin: false,
      lottery_count: 1,
      sign_in_count: 0,
      contribution_points: 0,
      consecutive_sign_ins: 0,
      juejin_high_score: 0,
      juejin_completed: false
    });

    // 更新内存
    users.push(user);

    // 异步同步到云数据库
    syncToCloud('users', user.id, user);

    broadcast({ type: 'user_joined', data: safeUser(user) });
    res.status(201).json(safeUser(user));
  } catch (e) {
    console.error('新建用户失败:', e);
    res.status(500).json({ error: '风云涌动，天机难测，请稍后再试' });
  }
});

// 修改用户信息（含可选改密码）
app.put('/api/users/:id', async (req, res) => {
  const { gameName, mainStyle, subStyle, oldPassword, newPassword } = req.body;
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  if (!gameName || !gameName.trim())
    return res.status(400).json({ error: '游戏名不可为空' });

  if (!mainStyle || !/^[\u4e00-\u9fa5]{1,2}$/.test(mainStyle))
    return res.status(400).json({ error: '主流派仅允许最多2个中文字符' });

  if (subStyle && !/^[\u4e00-\u9fa5]{1,2}$/.test(subStyle))
    return res.status(400).json({ error: '副流派仅允许最多2个中文字符' });

  const nameConflict = users.find(u => u.gameName === gameName.trim() && u.id !== req.params.id);
  if (nameConflict)
    return res.status(409).json({ error: '此名已被江湖同侪占用，请另择他名' });

  // 改密码（可选）
  if (newPassword) {
    if (!oldPassword) return res.status(400).json({ error: '请输入当前密码' });
    if (user.passwordHash !== hashPassword(oldPassword))
      return res.status(401).json({ error: '当前密码有误' });
    if (newPassword.length < 6) return res.status(400).json({ error: '新密码不可少于6位' });
    user.passwordHash = hashPassword(newPassword);
  }

  user.gameName = gameName.trim();
  user.mainStyle = mainStyle;
  user.subStyle = subStyle || '';

  // 更新云端 Users 表
  try {
    const updateData = {
      game_name: user.gameName,
      main_style: user.mainStyle,
      sub_style: user.subStyle
    };
    if (newPassword) {
      updateData.password_hash = user.passwordHash;
    }
    await userDao.updateUser(user.id, updateData);
    const cloudUpdateData = {
      gameName: user.gameName,
      mainStyle: user.mainStyle,
      subStyle: user.subStyle
    };
    if (newPassword) {
      cloudUpdateData.passwordHash = user.passwordHash;
    }
    syncToCloud('users', user.id, cloudUpdateData);

    // 级联更新 teams（内存与云端）
    const affectedTeams = [];
    for (const team of teams) {
      let changed = false;
      team.members.forEach(m => {
        if (m.userId === user.id) {
          m.gameName = user.gameName;
          m.mainStyle = user.mainStyle;
          m.subStyle = user.subStyle;
          changed = true;
        }
      });
      if (changed) {
        affectedTeams.push(team);
        await teamDao.updateTeam(team.id, {
          members: JSON.stringify(team.members)
        });
        syncToCloud('teams', team.id, { members: team.members });
      }
    }

    broadcast({ type: 'user_updated', data: safeUser(user) });
    affectedTeams.forEach(t => broadcast({ type: 'team_updated', data: t }));

    res.json(safeUser(user));
  } catch (e) {
    console.error('更新用户写入云数据库失败:', e);
    res.status(500).json({ error: '天机难测，资料更新失败' });
  }
});

app.post('/api/users/avatar', async (req, res) => {
  const { userId, fileName, contentType, dataUrl } = req.body || {};
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: '头像数据不能为空' });
  }

  const matched = dataUrl.match(/^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/);
  if (!matched) {
    return res.status(400).json({ error: '头像格式不受支持' });
  }

  const ext = getAvatarExtension(fileName, contentType || matched[1]);
  if (!ext) {
    return res.status(400).json({ error: '头像格式不受支持' });
  }

  try {
    const buffer = Buffer.from(matched[3], 'base64');
    if (buffer.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: '头像不能超过 3MB' });
    }

    removeUserAvatarFiles(user.id);
    const avatarFileName = `${user.id}${ext}`;
    const avatarFilePath = path.join(avatarDir, avatarFileName);
    fs.writeFileSync(avatarFilePath, buffer);

    user.avatarUrl = `/uploads/avatars/${avatarFileName}`;
    await userDao.updateUser(user.id, { avatar_url: user.avatarUrl });
    syncToCloud('users', user.id, { avatarUrl: user.avatarUrl });

    broadcast({ type: 'user_updated', data: safeUser(user) });
    res.json({ avatarUrl: user.avatarUrl, user: safeUser(user) });
  } catch (e) {
    console.error('头像上传失败:', e);
    res.status(500).json({ error: '头像保存失败，请稍后再试' });
  }
});

// 删除用户（管理员权限）
app.delete('/api/users/:id', async (req, res) => {
  const { adminId } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!admin || !isAdminUser(admin)) {
    return res.status(403).json({ error: '无权限' });
  }

  const targetUserId = req.params.id;
  const targetUser = users.find(u => u.id === targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 不能删除管理员自己
  if (targetUserId === adminId) {
    return res.status(400).json({ error: '不能删除自己' });
  }

  try {
    // 1. 删除该用户创建的所有队伍
    const userCreatedTeams = teams.filter(t => t.leaderId === targetUserId);
    for (const team of userCreatedTeams) {
      // 从内存中移除
      teams = teams.filter(t => t.id !== team.id);
      // 从云端删除
      try {
        await teamDao.deleteTeam(team.id);
        setImmediate(async () => {
          try {
            await db.collection('teams').doc(team.id).remove();
          } catch (e) {
            console.error(`[同步失败] 删除team/${team.id}:`, e.message);
          }
        });
      } catch (e) {
        console.error('删除队伍失败:', e);
      }
      broadcast({ type: 'team_deleted', data: { id: team.id } });
    }

    // 2. 从其他队伍中移除该用户
    for (const team of teams) {
      const memberIndex = team.members.findIndex(m => m.userId === targetUserId);
      if (memberIndex !== -1) {
        team.members.splice(memberIndex, 1);
        // 更新云端
        try {
          await teamDao.updateTeam(team.id, {
            members: JSON.stringify(team.members)
          });
          syncToCloud('teams', team.id, { members: team.members });
        } catch (e) {
          console.error('更新队伍成员失败:', e);
        }
        broadcast({ type: 'team_updated', data: team });
      }
    }

    // 3. 删除该用户的所有邀请记录
    for (const user of users) {
      let changed = false;
      if (user.pendingInvites) {
        const originalLength = user.pendingInvites.length;
        user.pendingInvites = user.pendingInvites.filter(inv => inv.fromUserId !== targetUserId);
        if (user.pendingInvites.length !== originalLength) {
          changed = true;
          try {
            await userDao.updateUser(user.id, { pending_invites: JSON.stringify(user.pendingInvites) });
            syncToCloud('users', user.id, { pendingInvites: user.pendingInvites });
          } catch (e) {
            console.error('更新邀请记录失败:', e);
          }
        }
      }
    }

    // 4. 从内存中移除用户
    users = users.filter(u => u.id !== targetUserId);

    // 5. 从MySQL删除用户
    try {
      await userDao.deleteUser(targetUserId);
      console.log(`已从MySQL删除用户 ${targetUser.gameName}`);
    } catch (e) {
      console.error('删除用户MySQL失败:', e);
    }

    // 异步同步到云数据库
    setImmediate(async () => {
      try {
        const deleteRes = await db.collection('users').where({ id: targetUserId }).remove();
        console.log(`已从云端删除用户 ${targetUser.gameName}，删除了 ${deleteRes.deleted} 条记录`);
      } catch (e) {
        console.error('[同步失败] 删除用户云端失败:', e.message);
      }
    });

    // 广播用户被删除
    broadcast({ type: 'user_deleted', data: { id: targetUserId, gameName: targetUser.gameName } });

    res.json({ success: true, message: `已删除游侠 ${targetUser.gameName} ` });
  } catch (e) {
    console.error('删除用户失败:', e);
    res.status(500).json({ error: '删除失败' });
  }
});

// ---------- 队伍接口 ----------
app.get('/api/teams', (req, res) => {
  res.json(teams);
});

app.get('/api/teams/:id', (req, res) => {
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: '队伍不存在' });
  res.json(team);
});

app.post('/api/teams', async (req, res) => {
  const { type, purpose, time, date, userId } = req.body;

  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const teamTime = new Date(time);
  if (isNaN(teamTime.getTime()) || teamTime <= new Date())
    return res.status(400).json({ error: '往昔不可追，请择他日' });

  const maxSize = type === '五人本' ? 5 : 10;
  const dateStr = date || teamTime.toISOString().split('T')[0];

  const team = {
    id: uuidv4(),
    type,
    purpose,
    time,
    date: dateStr,
    leaderId: userId,
    members: [{
      userId: user.id,
      gameName: user.gameName,
      mainStyle: user.mainStyle,
      subStyle: user.subStyle
    }],
    maxSize,
    fullNotified: false,
    remindSent: false
  };

  try {
    await teamDao.createTeam({
      id: team.id,
      type: team.type,
      purpose: team.purpose,
      date: team.date,
      time: team.time,
      leader_id: team.leaderId,
      members: team.members,
      max_size: team.maxSize,
      full_notified: team.fullNotified,
      remind_sent: team.remindSent
    });
    teams.push(team);
    syncToCloud('teams', team.id, team);
    broadcast({ type: 'team_created', data: team });
    res.status(201).json(team);
  } catch (e) {
    console.error('新建队伍写入云数据库失败:', e);
    res.status(500).json({ error: '号令群雄失败，天机难测' });
  }
});

app.post('/api/teams/:id/join', async (req, res) => {
  const { userId } = req.body;
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: '队伍不存在' });

  if (team.members.length >= team.maxSize)
    return res.status(400).json({ error: '队伍已满员，暂难容纳更多游侠' });

  if (new Date(team.time) <= new Date())
    return res.status(400).json({ error: '此队已过开本时间，无法加入' });

  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  if (team.members.find(m => m.userId === userId))
    return res.status(400).json({ error: '您已在此队伍中' });

  // 乐观更新：先更新内存状态
  const newMember = {
    userId: user.id,
    gameName: user.gameName,
    mainStyle: user.mainStyle,
    subStyle: user.subStyle
  };
  team.members.push(newMember);

  // 立即广播并返回响应（不等待数据库写入）
  broadcast({ type: 'team_updated', data: team });
  res.json(team);

  // 异步后台写入数据库（不阻塞响应）
  ; (async () => {
    try {
      await teamDao.updateTeam(team.id, {
        members: JSON.stringify(team.members)
      });
      syncToCloud('teams', team.id, { members: team.members });
    } catch (e) {
      console.error('入队写入云数据库失败:', e);
      // 写入失败：回滚内存状态并通过 WebSocket 广播回滚
      team.members = team.members.filter(m => m.userId !== userId);
      broadcast({ type: 'team_updated', data: team });
      return;
    }

    // 满员时通知队长（每支队伍只通知一次）
    if (team.members.length >= team.maxSize && !team.fullNotified) {
      team.fullNotified = true;
      try {
        team.fullNotified = true;
        await teamDao.updateTeam(team.id, { full_notified: 1 });
        syncToCloud('teams', team.id, { fullNotified: true });
        const leader = users.find(u => u.id === team.leaderId);
        if (leader && leader.openId && leader.mpQuota && leader.mpQuota.full > 0) {
          leader.mpQuota.full--;
          await userDao.updateUser(leader.id, { mp_quota: JSON.stringify(leader.mpQuota) });
          syncToCloud('users', leader.id, { mpQuota: leader.mpQuota });
          sendSubscribeMsg(leader.openId, 'full', {
            thing4: { value: `${leader.gameName}·${team.type} `.substring(0, 20) },
            time15: { value: formatTeamTime(team.time) },
            thing7: { value: '游侠已经聚齐，百舸争流，请做好准备。' },
          }, 'pages/jianghu/jianghu');
        }
      } catch (e) {
        console.error('满员通知失败:', e);
      }
    }
  })();
});

app.post('/api/teams/:id/leave', async (req, res) => {
  const { userId } = req.body;
  const teamIndex = teams.findIndex(t => t.id === req.params.id);
  if (teamIndex === -1) return res.status(404).json({ error: '队伍不存在' });

  const team = teams[teamIndex];
  const oldMembers = [...team.members];
  const oldLeaderId = team.leaderId;
  team.members = team.members.filter(m => m.userId !== userId);

  try {
    if (team.members.length === 0) {
      await teamDao.deleteTeam(req.params.id);
      teams.splice(teamIndex, 1);
      setImmediate(async () => {
        try {
          await db.collection('teams').where({ id: req.params.id }).remove();
        } catch (e) {
          console.error(`[同步失败] 删除team/${req.params.id}:`, e.message);
        }
      });
      broadcast({ type: 'team_deleted', data: { id: req.params.id } });
      return res.json({ dissolved: true });
    }

    if (team.leaderId === userId) {
      team.leaderId = team.members[0].userId;
    }

    await teamDao.updateTeam(req.params.id, {
      members: JSON.stringify(team.members),
      leader_id: team.leaderId
    });
    syncToCloud('teams', req.params.id, {
      members: team.members,
      leaderId: team.leaderId
    });

    broadcast({ type: 'team_updated', data: team });
    res.json(team);
  } catch (e) {
    console.error('退队同步云端失败:', e);
    // 回滚内存
    team.members = oldMembers;
    team.leaderId = oldLeaderId;
    res.status(500).json({ error: '风云涌动，退队失败' });
  }
});

app.post('/api/teams/:id/kick', async (req, res) => {
  const { leaderId, targetUserId } = req.body;
  const teamIndex = teams.findIndex(t => t.id === req.params.id);
  if (teamIndex === -1) return res.status(404).json({ error: '队伍不存在' });

  const team = teams[teamIndex];
  if (team.leaderId !== leaderId)
    return res.status(403).json({ error: '非队长无此权限' });

  if (leaderId === targetUserId)
    return res.status(400).json({ error: '队长不可逐自身' });

  const oldMembers = [...team.members];
  team.members = team.members.filter(m => m.userId !== targetUserId);

  try {
    if (team.members.length === 0) {
      await teamDao.deleteTeam(req.params.id);
      teams.splice(teamIndex, 1);
      setImmediate(async () => {
        try {
          await db.collection('teams').where({ id: req.params.id }).remove();
        } catch (e) {
          console.error(`[同步失败] 删除team/${req.params.id}:`, e.message);
        }
      });
      broadcast({ type: 'team_deleted', data: { id: req.params.id } });
      return res.json({ dissolved: true });
    }

    await teamDao.updateTeam(req.params.id, {
      members: JSON.stringify(team.members)
    });
    syncToCloud('teams', req.params.id, { members: team.members });
    broadcast({ type: 'team_updated', data: team });
    res.json(team);
  } catch (e) {
    console.error('踢人同步云端失败:', e);
    team.members = oldMembers;
    res.status(500).json({ error: '风云涌动，操作失败' });
  }
});

app.put('/api/teams/:id/order', async (req, res) => {
  const { leaderId, members } = req.body;
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: '队伍不存在' });
  if (team.leaderId !== leaderId)
    return res.status(403).json({ error: '非队长无此权限' });

  const oldMembers = team.members;
  team.members = members;

  try {
    await teamDao.updateTeam(req.params.id, {
      members: JSON.stringify(members)
    });
    syncToCloud('teams', req.params.id, { members });
    broadcast({ type: 'team_updated', data: team });
    res.json(team);
  } catch (e) {
    team.members = oldMembers;
    res.status(500).json({ error: '风云涌动，调兵谴将失败' });
  }
});

app.put('/api/teams/:id/time', async (req, res) => {
  const { leaderId, time, date } = req.body;
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: '队伍不存在' });
  if (team.leaderId !== leaderId)
    return res.status(403).json({ error: '非队长无此权限' });

  const newTime = new Date(time);
  if (isNaN(newTime.getTime()) || newTime <= new Date())
    return res.status(400).json({ error: '时间不可早于当前时刻' });

  const oldTime = team.time;
  const oldDate = team.date;
  team.time = newTime.toISOString();
  if (date) team.date = date;

  try {
    await teamDao.updateTeam(req.params.id, {
      time: team.time,
      date: team.date
    });
    syncToCloud('teams', req.params.id, { time: team.time, date: team.date });
    broadcast({ type: 'team_updated', data: team });
    res.json(team);
  } catch (e) {
    team.time = oldTime;
    team.date = oldDate;
    res.status(500).json({ error: '风云涌动，改期失败' });
  }
});

app.post('/api/teams/:id/dissolve', async (req, res) => {
  const { adminId } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin))
    return res.status(403).json({ error: '非管理员，无此权限' });

  const teamIndex = teams.findIndex(t => t.id === req.params.id);
  if (teamIndex === -1) return res.status(404).json({ error: '队伍不存在' });

  try {
    await teamDao.deleteTeam(req.params.id);
    teams.splice(teamIndex, 1);
    setImmediate(async () => {
      try {
        await db.collection('teams').where({ id: req.params.id }).remove();
      } catch (e) {
        console.error(`[同步失败] 删除team/${req.params.id}:`, e.message);
      }
    });
    broadcast({ type: 'team_deleted', data: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '风云涌动，解散失败' });
  }
});

// ---------- 周一零点自动重置抽签次数和清空中奖记录 ----------
async function checkWeeklyReset() {
  const now = new Date();
  if (now.getDay() !== 1) return; // 仅周一
  const thisMondayMidnight = new Date(now);
  thisMondayMidnight.setHours(0, 0, 0, 0);
  const lastClear = lottery.lastClear ? new Date(lottery.lastClear) : new Date(0);

  if (lastClear < thisMondayMidnight) {
    const oldWinners = lottery.winners;
    const oldLastClear = lottery.lastClear;

    lottery.winners = [];
    lottery.lastClear = now.toISOString();

    try {
      // 更新MySQL（转换为 MySQL DATETIME 格式）
      await lotteryDao.updateLottery({
        winners: JSON.stringify(lottery.winners),
        banner_cleared_at: new Date(lottery.lastClear).toISOString().slice(0, 19).replace('T', ' '),
        last_clear: lottery.lastClear
      });

      // 异步同步到云数据库
      syncToCloud('lottery', 'global_state', {
        winners: lottery.winners,
        lastClear: lottery.lastClear
      });

      // 重置所有用户的抽签次数为1次（覆盖现有剩余次数）
      for (const user of users) {
        user.lotteryCount = 1;
        // 逐个更新云端数据
        await userDao.updateUser(user.id, { lottery_count: 1 });
        syncToCloud('users', user.id, { lotteryCount: 1 });
      }

      broadcast({ type: 'lottery_winners_cleared' });
      console.log('【周一重置】已自动清空本周中奖记录，并将所有用户抽签次数重置为1次');
    } catch (e) {
      console.error('周一重置云端记录失败:', e);
      lottery.winners = oldWinners;
      lottery.lastClear = oldLastClear;
    }
  }
}
checkWeeklyReset();
setInterval(checkWeeklyReset, 60 * 60 * 1000); // 每小时检查一次

// ---------- 微信工具函数 ----------
let _wxToken = { token: '', expires: 0 };

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); } });
    }).on('error', reject);
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ raw: b }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getWxToken() {
  if (Date.now() < _wxToken.expires) return _wxToken.token;
  if (!MP_APPID || !MP_APPSECRET) throw new Error('MP_APPID/MP_APPSECRET 未配置');
  const data = await httpsGet(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${MP_APPID}&secret=${MP_APPSECRET}`
  );
  if (!data.access_token) throw new Error('获取微信token失败: ' + JSON.stringify(data));
  _wxToken = { token: data.access_token, expires: Date.now() + (data.expires_in - 120) * 1000 };
  return _wxToken.token;
}

// 发送订阅消息（静默失败，不影响主流程）
async function sendSubscribeMsg(openId, type, templateData, page) {
  if (!MP_APPID || !MP_APPSECRET || !openId) return;
  const templateId = MP_TEMPLATES[type];
  if (!templateId) return;
  try {
    const token = await getWxToken();
    const payload = { touser: openId, template_id: templateId, data: templateData };
    if (page) payload.page = page;
    const res = await httpsPost(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      payload
    );
    if (res.errcode && res.errcode !== 0) {
      console.log(`[MP] 订阅消息发送失败 [${type}] openId=${openId}: ${res.errmsg}`);
    }
  } catch (e) {
    console.error('[MP] 发送订阅消息异常:', e.message);
  }
}

// 格式化打本时间为可读字符串
function formatTeamTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- 5分钟开本提醒调度器 ----------
async function checkTeamReminders() {
  const now = Date.now();
  const soon = now + 5 * 60 * 1000; // 5分钟后
  const window = 60 * 1000;          // ±1分钟窗口，防止漏触发

  for (const team of teams) {
    if (team.remindSent) continue;
    const teamTime = new Date(team.time).getTime();
    if (teamTime >= soon - window && teamTime <= soon + window) {
      team.remindSent = true;
      try {
        team.remindSent = true;
        await teamDao.updateTeam(team.id, { remind_sent: 1 });
        syncToCloud('teams', team.id, { remindSent: true });
      } catch (e) {
        console.error('更新队伍提醒状态失败:', e);
      }

      const leaderUser = users.find(u => u.id === team.leaderId);
      const leaderName = leaderUser ? leaderUser.gameName : '队长';
      const msg = {
        thing4: { value: `${leaderName}·${team.type}`.substring(0, 20) },
        date5: { value: formatTeamTime(team.time) },
        thing7: { value: '该死，敌人势大，速速增援！' },
      };

      for (const m of team.members) {
        const u = users.find(u => u.id === m.userId);
        if (u && u.openId && u.mpQuota && u.mpQuota.remind > 0) {
          u.mpQuota.remind--;
          sendSubscribeMsg(u.openId, 'remind', msg, 'pages/jianghu/jianghu');
          try {
            await userDao.updateUser(u.id, { mp_quota: JSON.stringify(u.mpQuota) });
            syncToCloud('users', u.id, { mpQuota: u.mpQuota });
          } catch (e) {
            console.error('更新扣除提醒额度失败:', e);
          }
        }
      }
      console.log(`[MP] 已发送开本提醒: ${team.type} ${formatTeamTime(team.time)}`);
    }
  }
}
setInterval(checkTeamReminders, 60 * 1000); // 每分钟检查一次

// ---------- 小程序接口 ----------

// 绑定账号：小程序验证游戏名+密码，将 openId 存入用户记录
app.post('/api/mp/bind', async (req, res) => {
  const { gameName, password, openId } = req.body;
  if (!gameName || !password || !openId)
    return res.status(400).json({ error: '参数不完整' });

  const user = users.find(u => u.gameName === gameName.trim());
  if (!user) return res.status(401).json({ error: '游戏名不存在' });
  if (user.passwordHash !== hashPassword(password))
    return res.status(401).json({ error: '密码有误' });

  // 若该 openId 已绑定其他账号，先解绑旧账号
  const old = users.find(u => u.openId === openId && u.id !== user.id);
  if (old) {
    old.openId = null;
    try {
      await userDao.updateUser(old.id, { open_id: null });
      syncToCloud('users', old.id, { openId: null });
    } catch (e) { }
  }

  user.openId = openId;
  if (!user.mpQuota) user.mpQuota = { invite: 0, full: 0, remind: 0 };
  if (!user.inviteLog) user.inviteLog = {};

  try {
    await userDao.updateUser(user.id, {
      open_id: user.openId,
      mp_quota: JSON.stringify(user.mpQuota),
      invite_log: JSON.stringify(user.inviteLog)
    });
    syncToCloud('users', user.id, {
      openId: user.openId,
      mpQuota: user.mpQuota,
      inviteLog: user.inviteLog
    });
    res.json({ user: safeUser(user) });
  } catch (e) {
    console.error('绑定小程序同步云端失败', e);
    res.status(500).json({ error: '绑定失败，请稍后重试' });
  }
});

// 查询指定用户的令牌额度
app.get('/api/mp/quota/:userId', (req, res) => {
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ quotas: user.mpQuota || { invite: 0, full: 0, remind: 0 } });
});

// 小程序授权后增加令牌额度
app.post('/api/mp/quota/add', async (req, res) => {
  const { userId, openId, accepted } = req.body;
  if (!userId || !Array.isArray(accepted))
    return res.status(400).json({ error: '参数不完整' });

  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  if (!user.mpQuota) user.mpQuota = { invite: 0, full: 0, remind: 0 };
  if (openId && !user.openId) user.openId = openId;

  const map = {
    [MP_TEMPLATES.invite]: 'invite',
    [MP_TEMPLATES.full]: 'full',
    [MP_TEMPLATES.remind]: 'remind',
  };
  accepted.forEach(tplId => {
    const key = map[tplId];
    if (key) user.mpQuota[key]++;
  });

  try {
    await userDao.updateUser(user.id, {
      mp_quota: JSON.stringify(user.mpQuota),
      open_id: user.openId
    });
    syncToCloud('users', user.id, {
      mpQuota: user.mpQuota,
      openId: user.openId
    });
    res.json({ quotas: user.mpQuota });
  } catch (e) {
    console.error('更新额度同步云端失败', e);
    res.status(500).json({ error: '更新失败，请稍后重试' });
  }
});

// 通过 openId 查找绑定用户（小程序启动时恢复登录态）
app.get('/api/mp/userByOpenId/:openId', (req, res) => {
  const user = users.find(u => u.openId === req.params.openId);
  if (!user) return res.status(404).json({ error: '未绑定' });
  res.json({ user: safeUser(user) });
});

// 可邀请用户列表：已绑定 openId 且邀约令 > 0
app.get('/api/mp/users/invitable', (req, res) => {
  const list = users
    .filter(u => u.openId && u.mpQuota && u.mpQuota.invite > 0)
    .map(u => ({ id: u.id, gameName: u.gameName, mainStyle: u.mainStyle, subStyle: u.subStyle, inviteQuota: u.mpQuota.invite }));
  res.json(list);
});

// 队长发起邀请
app.post('/api/mp/invite', async (req, res) => {
  const { fromUserId, targetUserId, teamId } = req.body;
  if (!fromUserId || !targetUserId || !teamId)
    return res.status(400).json({ error: '参数不完整' });

  const from = users.find(u => u.id === fromUserId);
  const target = users.find(u => u.id === targetUserId);
  const team = teams.find(t => t.id === teamId);
  if (!from) return res.status(404).json({ error: '邀请人不存在' });
  if (!target) return res.status(404).json({ error: '目标用户不存在' });
  if (!team) return res.status(404).json({ error: '队伍不存在' });

  if (!target.openId)
    return res.status(400).json({ error: '该用户未绑定小程序，无法通知' });
  if (!target.mpQuota || target.mpQuota.invite <= 0)
    return res.status(400).json({ error: '该用户邀约令不足，无法发送邀请通知' });

  // 每天每人最多被邀请3次
  const today = todayStr();
  if (!target.inviteLog) target.inviteLog = {};
  const todayCount = target.inviteLog[today] || 0;
  if (todayCount >= 3)
    return res.status(429).json({ error: '该用户今日邀约次数已达上限（3次）' });

  target.inviteLog[today] = todayCount + 1;
  target.mpQuota.invite--;

  // 写入待处理邀请列表（供小程序悬浮窗展示）
  if (!target.pendingInvites) target.pendingInvites = [];
  const inviteRecord = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    teamId: team.id,
    fromUserId: from.id,
    fromGameName: from.gameName,
    teamType: team.type,
    teamPurpose: team.purpose || '',
    teamTime: team.time,
    leaderName: (users.find(u => u.id === team.leaderId) || {}).gameName || '',
    memberCount: (team.members || []).length,
    maxMembers: team.maxSize || 5,
    createdAt: new Date().toISOString(),
  };
  target.pendingInvites.push(inviteRecord);

  try {
    await userDao.updateUser(target.id, {
      invite_log: JSON.stringify(target.inviteLog),
      mp_quota: JSON.stringify(target.mpQuota),
      pending_invites: JSON.stringify(target.pendingInvites)
    });
    syncToCloud('users', target.id, {
      inviteLog: target.inviteLog,
      mpQuota: target.mpQuota,
      pendingInvites: target.pendingInvites
    });
  } catch (e) {
    console.error('发送邀请同步至云端失败:', e);
    // 回滚内存
    target.pendingInvites.pop();
    target.mpQuota.invite++;
    target.inviteLog[today]--;
    return res.status(500).json({ error: '风云涌动，飞鸽传书失败，请稍后再试' });
  }

  sendSubscribeMsg(target.openId, 'invite', {
    name1: { value: `${from.gameName}·${team.type}`.substring(0, 20) },
    thing5: { value: '悬赏已至，此役棘手，请速支援！' },
    date3: { value: formatTeamTime(team.time) },
  }, 'pages/tianming/tianming?autoOpen=1');

  res.json({ ok: true });
});

// 查询待处理邀请列表（小程序悬浮窗用）
app.get('/api/mp/invites/:userId', (req, res) => {
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user.pendingInvites || []);
});

// 剔除一条邀请（接受或拒绝后调用）
app.delete('/api/mp/invites/:userId/:inviteId', async (req, res) => {
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (!user.pendingInvites) user.pendingInvites = [];
  const before = user.pendingInvites.length;

  const oldPending = user.pendingInvites;
  user.pendingInvites = user.pendingInvites.filter(inv => inv.id !== req.params.inviteId);
  if (user.pendingInvites.length === before)
    return res.status(404).json({ error: '邀请记录不存在' });

  try {
    await userDao.updateUser(user.id, {
      pending_invites: JSON.stringify(user.pendingInvites)
    });
    syncToCloud('users', user.id, { pendingInvites: user.pendingInvites });
    res.json({ ok: true });
  } catch (e) {
    console.error('删除邀请同步至云端失败:', e);
    user.pendingInvites = oldPending;
    res.status(500).json({ error: '风云涌动，清理卷宗失败' });
  }
});

// ---------- 抽奖接口 ----------
app.get('/api/lottery', (req, res) => {
  res.json({ slots: lottery.slots, winners: lottery.winners || [], bannerClearedAt: lottery.bannerClearedAt });
});

app.put('/api/lottery/slots/:idx', async (req, res) => {
  const { adminId, text, quantity, isWinning } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin))
    return res.status(403).json({ error: '非管理员，无此权限' });

  const idx = parseInt(req.params.idx);
  if (idx < 0 || idx >= lottery.slots.length)
    return res.status(400).json({ error: '格子不存在' });

  const oldSlot = { ...lottery.slots[idx] };
  if (text !== undefined) lottery.slots[idx].text = String(text).substring(0, 8);
  if (quantity !== undefined) lottery.slots[idx].quantity = parseInt(quantity);
  if (isWinning !== undefined) lottery.slots[idx].isWinning = Boolean(isWinning);

  try {
    // 更新MySQL
    await lotteryDao.updateLottery({
      slots: JSON.stringify(lottery.slots)
    });

    // 异步同步到云数据库
    syncToCloud('lottery', 'global_state', { slots: lottery.slots });

    broadcast({ type: 'lottery_update', data: { slots: lottery.slots } });
    res.json(lottery.slots[idx]);
  } catch (e) {
    console.error('更新签诗配置失败:', e);
    lottery.slots[idx] = oldSlot;
    res.status(500).json({ error: '风云涌动，改运失败' });
  }
});

app.post('/api/lottery/spin', async (req, res) => {
  const { userId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: '请先踏入江湖，方可抽签问天' });

  // 检查抽签次数
  if (!user.lotteryCount) user.lotteryCount = 0;
  if (user.lotteryCount <= 0) {
    return res.status(403).json({ error: '本周抽签次数已用尽，请待周一重置' });
  }

  // 等概率：从全部格子随机选一格
  const winIdx = Math.floor(Math.random() * lottery.slots.length);
  const slot = lottery.slots[winIdx];

  // 扣减抽签次数
  user.lotteryCount--;

  // ── 非中奖格：安慰提示，不记录不广播 ──
  if (!slot.isWinning) {
    try {
      await userDao.updateUser(user.id, { lottery_count: user.lotteryCount });
      syncToCloud('users', user.id, { lotteryCount: user.lotteryCount });
      return res.json({
        slotIndex: winIdx,
        won: false,
        prize: slot.text,
        message: '江湖路远，此签未显贵气，游侠且再试一次',
        remainingCount: user.lotteryCount
      });
    } catch (e) {
      user.lotteryCount++; // 回滚
      return res.status(500).json({ error: '天机混乱，抽签未能落笔' });
    }
  }

  // ── 中奖格但奖品已空 ──
  if (slot.quantity === 0) {
    try {
      await userDao.updateUser(user.id, { lottery_count: user.lotteryCount });
      syncToCloud('users', user.id, { lotteryCount: user.lotteryCount });
      return res.json({
        slotIndex: winIdx,
        won: false,
        prize: slot.text,
        message: '此签缘分已尽，已被他人捷足先登，来日方长',
        remainingCount: user.lotteryCount
      });
    } catch (e) {
      user.lotteryCount++; // 回滚
      return res.status(500).json({ error: '天机混乱，抽签未能落笔' });
    }
  }

  // ── 中奖！扣减数量并记录 ──
  if (slot.quantity > 0) slot.quantity--;

  const winner = {
    gameName: user.gameName,
    prize: slot.text,
    slotIndex: winIdx,
    timestamp: new Date().toISOString()
  };
  lottery.winners.push(winner);

  try {
    // 更新MySQL
    await lotteryDao.updateLottery({
      slots: JSON.stringify(lottery.slots),
      winners: JSON.stringify(lottery.winners)
    });
    await userDao.updateUser(user.id, { lottery_count: user.lotteryCount });

    // 异步同步到云数据库
    syncToCloud('lottery', 'global_state', {
      slots: lottery.slots,
      winners: lottery.winners
    });
    syncToCloud('users', user.id, { lotteryCount: user.lotteryCount });

    broadcast({ type: 'lottery_slot_update', data: { slotIndex: winIdx, quantity: slot.quantity } });
    broadcast({ type: 'lottery_winner', data: winner });

    res.json({
      slotIndex: winIdx,
      won: true,
      prize: slot.text,
      message: `签落天成！恭喜 ${user.gameName} 喜得「${slot.text}」！`,
      remainingCount: user.lotteryCount
    });
  } catch (e) {
    // 回滚内存
    if (slot.quantity >= 0) slot.quantity++;
    lottery.winners.pop();
    user.lotteryCount++;
    console.error('抽签同步云端失败:', e);
    res.status(500).json({ error: '天机混乱，抽签未能落笔，请重拾竹片' });
  }
});

// 管理员清空轮播（只影响 banner 展示，不删记录）
app.post('/api/lottery/clear-banner', async (req, res) => {
  const { adminId } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin))
    return res.status(403).json({ error: '非管理员，无此权限' });

  const oldBannerClearedAt = lottery.bannerClearedAt;
  lottery.bannerClearedAt = new Date().toISOString();

  try {
    // 更新MySQL（转换为 MySQL DATETIME 格式）
    await lotteryDao.updateLottery({
      banner_cleared_at: new Date(lottery.bannerClearedAt).toISOString().slice(0, 19).replace('T', ' ')
    });

    // 异步同步到云数据库
    syncToCloud('lottery', 'global_state', { bannerClearedAt: lottery.bannerClearedAt });

    broadcast({ type: 'lottery_banner_cleared', data: { clearedAt: lottery.bannerClearedAt } });
    res.json({ ok: true });
  } catch (e) {
    console.error('清空轮播失败:', e);
    lottery.bannerClearedAt = oldBannerClearedAt;
    res.status(500).json({ error: '风云涌动，清理失败' });
  }
});

// 管理员清空中奖记录（同时也清空 banner）
app.post('/api/lottery/clear-winners', async (req, res) => {
  const { adminId } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin))
    return res.status(403).json({ error: '非管理员，无此权限' });

  const oldWinners = lottery.winners;
  const oldBanner = lottery.bannerClearedAt;
  const oldLastClear = lottery.lastClear;

  lottery.winners = [];
  lottery.bannerClearedAt = new Date().toISOString();
  lottery.lastClear = new Date().toISOString();

  try {
    // 更新MySQL（转换为 MySQL DATETIME 格式）
    await lotteryDao.updateLottery({
      winners: JSON.stringify(lottery.winners),
      banner_cleared_at: new Date(lottery.bannerClearedAt).toISOString().slice(0, 19).replace('T', ' '),
      last_clear: lottery.lastClear
    });

    // 异步同步到云数据库
    syncToCloud('lottery', 'global_state', {
      winners: lottery.winners,
      bannerClearedAt: lottery.bannerClearedAt,
      lastClear: lottery.lastClear
    });

    broadcast({ type: 'lottery_winners_cleared', data: { bannerClearedAt: lottery.bannerClearedAt } });
    res.json({ ok: true });
  } catch (e) {
    console.error('清空中奖记录失败:', e);
    lottery.winners = oldWinners;
    lottery.bannerClearedAt = oldBanner;
    lottery.lastClear = oldLastClear;
    res.status(500).json({ error: '风云涌动，清空失败' });
  }
});

// 管理员设定用户抽签次数
app.post('/api/lottery/add-count', async (req, res) => {
  const { adminId, targetUserId, count } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin))
    return res.status(403).json({ error: '非管理员，无此权限' });

  const targetUser = users.find(u => u.id === targetUserId);
  if (!targetUser) return res.status(404).json({ error: '目标用户不存在' });

  const setCount = parseInt(count);
  if (isNaN(setCount) || setCount < 0)
    return res.status(400).json({ error: '次数必须为非负整数' });

  const oldCount = targetUser.lotteryCount || 0;
  targetUser.lotteryCount = setCount;

  try {
    await userDao.updateUser(targetUser.id, { lottery_count: targetUser.lotteryCount });
    syncToCloud('users', targetUser.id, { lotteryCount: targetUser.lotteryCount });
    res.json({
      ok: true,
      gameName: targetUser.gameName,
      newCount: targetUser.lotteryCount
    });
  } catch (e) {
    console.error('设定抽签次数同步云端失败:', e);
    targetUser.lotteryCount = oldCount;
    res.status(500).json({ error: '风云涌动，操作失败' });
  }
});

// ====================================================
// 签到系统
// ====================================================

// 签到接口
app.post('/api/sign-in', async (req, res) => {
  const { userId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const today = new Date().toISOString().split('T')[0];
  const lastSignIn = user.lastSignInDate ? user.lastSignInDate.split('T')[0] : null;

  if (lastSignIn === today) {
    return res.status(400).json({ error: '今日已签到', alreadySignedIn: true });
  }

  if (!user.signInCount) user.signInCount = 0;
  if (!user.contributionPoints) user.contributionPoints = 0;
  if (!user.consecutiveSignIns) user.consecutiveSignIns = 0;

  // 计算连续签到
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // 计算距离上次签到的天数
  const lastSignInDate = lastSignIn ? new Date(lastSignIn) : null;
  const daysSinceLastSignIn = lastSignInDate
    ? Math.floor((new Date() - lastSignInDate) / (1000 * 60 * 60 * 24))
    : Infinity;

  if (lastSignIn === yesterdayStr) {
    // 昨天签到了，连签+1
    user.consecutiveSignIns++;
  } else if (daysSinceLastSignIn <= 1) {
    // 今天或昨天签到过，保持连签（补偿场景或同日多次请求）
    // user.consecutiveSignIns 保持不变
  } else {
    // 中断超过1天，重置连签
    user.consecutiveSignIns = 1;
  }

  // 计算贡献值：10 + min(连续天数-1, 5)
  const bonusPoints = 10 + Math.min(user.consecutiveSignIns - 1, 5);
  user.contributionPoints += bonusPoints;
  user.signInCount++;
  user.lotteryCount = (user.lotteryCount || 0) + 1;
  user.lastSignInDate = new Date().toISOString();

  try {
    await userDao.updateUser(user.id, {
      sign_in_count: user.signInCount,
      lottery_count: user.lotteryCount,
      last_sign_in_date: user.lastSignInDate.split('T')[0], // 只保存日期部分
      contribution_points: user.contributionPoints,
      consecutive_sign_ins: user.consecutiveSignIns
    });
    syncToCloud('users', user.id, {
      signInCount: user.signInCount,
      lotteryCount: user.lotteryCount,
      lastSignInDate: user.lastSignInDate,
      contributionPoints: user.contributionPoints,
      consecutiveSignIns: user.consecutiveSignIns
    });
    res.json({
      ok: true,
      signInCount: user.signInCount,
      lotteryCount: user.lotteryCount,
      lastSignInDate: user.lastSignInDate,
      contributionPoints: user.contributionPoints,
      earnedPoints: bonusPoints
    });

    // 异步检测签到成就
    setImmediate(async () => {
      try {
        const checkRes = await fetch(`http://localhost:${PORT}/api/achievements/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, type: 'signin' })
        });
        const data = await checkRes.json();
        if (data.newAchievements && data.newAchievements.length > 0) {
          broadcast({ type: 'achievement', userId, achievement: data.newAchievements[0] });
        }
      } catch (e) { }
    });
  } catch (e) {
    // 回滚
    user.signInCount--;
    user.lotteryCount--;
    user.lastSignInDate = lastSignIn ? new Date(lastSignIn).toISOString() : null;
    console.error('签到同步云端失败:', e);
    res.status(500).json({ error: '风云涌动，签到失败' });
  }
});

// 获取签到状态
app.get('/api/sign-in/status', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: '缺少用户ID' });

  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const today = new Date().toISOString().split('T')[0];
  const lastSignIn = user.lastSignInDate ? user.lastSignInDate.split('T')[0] : null;
  const alreadySignedIn = lastSignIn === today;

  res.json({
    signInCount: user.signInCount || 0,
    lastSignInDate: user.lastSignInDate,
    alreadySignedIn
  });
});

// ====================================================
// 信箱（告示与建议）
// ====================================================

// 1. 获取告示列表 (全员可用)
app.get('/api/notices', async (req, res) => {
  try {
    const userId = req.query.userId;
    let noticesList = [...notices]; // 使用内存中的数据

    // 如果用户已登录，添加已读状态
    if (userId) {
      const user = users.find(u => u.id === userId);
      if (user && user.readNoticeIds) {
        const readIds = user.readNoticeIds;
        noticesList = noticesList.map(n => ({
          ...n,
          isRead: readIds.includes(n.id)
        }));
      }
    }

    res.json(noticesList);
  } catch (e) {
    res.status(500).json({ error: '获取告示失败' });
  }
});

// 2. 发布告示 (仅管理员)
app.post('/api/notices', async (req, res) => {
  const { adminId, content, date } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return res.status(403).json({ error: '无权限' });
  try {
    const noticeId = uuidv4();
    const createdAt = new Date().toISOString();

    // 生成古风日期标题
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const chineseNumbers = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

    // 转换年份为中文数字
    const yearStr = year.toString().split('').map(digit => chineseNumbers[parseInt(digit)]).join('');

    // 转换月份为古风格式
    let monthStr = '';
    if (month === 10) monthStr = '十';
    else if (month === 11) monthStr = '十一';
    else if (month === 12) monthStr = '十二';
    else monthStr = chineseNumbers[month];

    // 转换日期为古风格式
    let dayStr = '';
    if (day < 10) {
      dayStr = chineseNumbers[day];
    } else if (day === 10) {
      dayStr = '初十';
    } else if (day < 20) {
      dayStr = '十' + chineseNumbers[day - 10];
    } else if (day === 20) {
      dayStr = '二十';
    } else if (day < 30) {
      dayStr = '廿' + chineseNumbers[day - 20];
    } else if (day === 30) {
      dayStr = '三十';
    } else {
      dayStr = '卅' + chineseNumbers[day - 30];
    }

    const title = `${yearStr}年${monthStr}月${dayStr}日`;

    // 写入MySQL
    await noticeDao.createNotice({
      id: noticeId,
      title,
      content,
      author_id: adminId,
      created_at: createdAt
    });

    // 更新内存
    const newNotice = { id: noticeId, title, content, authorId: adminId, createdAt };
    notices.unshift(newNotice);

    // 异步同步到云数据库
    syncToCloud('notices', noticeId, { content, date, createdAt });

    res.json({ id: noticeId, content, date });
  } catch (e) {
    console.error('发布告示失败:', e);
    res.status(500).json({ error: '发布告示失败' });
  }
});

// 3. 删除告示 (仅管理员)
app.delete('/api/notices/:id', async (req, res) => {
  const adminId = req.query.adminId || req.body.adminId;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return res.status(403).json({ error: '无权限' });
  try {
    const noticeId = req.params.id;

    // 从MySQL删除
    await noticeDao.deleteNotice(noticeId);

    // 从内存删除
    notices = notices.filter(n => n.id !== noticeId);

    // 异步同步到云数据库
    setImmediate(async () => {
      try {
        await db.collection('notices').doc(noticeId).remove();
      } catch (e) {
        console.error(`[同步失败] 删除notice/${noticeId}:`, e.message);
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('删除告示失败:', e);
    res.status(500).json({ error: '删除告示失败' });
  }
});

// 4. 获取建议列表 (仅管理员)
app.get('/api/suggestions', async (req, res) => {
  const adminId = req.query.adminId;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return res.status(403).json({ error: '无权限' });
  try {
    let suggestionsList = [...suggestions]; // 使用内存中的数据

    // 添加已读状态
    if (admin && admin.readSuggestionIds) {
      const readIds = admin.readSuggestionIds;
      suggestionsList = suggestionsList.map(s => ({
        ...s,
        isRead: readIds.includes(s.id)
      }));
    }

    res.json(suggestionsList);
  } catch (e) {
    res.status(500).json({ error: '获取建议失败' });
  }
});

// 5. 提交建议 (全员可用)
app.post('/api/suggestions', async (req, res) => {
  const { userId, gameName, content, date } = req.body;
  if (!userId || !content) return res.status(400).json({ error: '参数缺失' });
  try {
    const suggestionId = uuidv4();
    const createdAt = new Date().toISOString();

    // 写入MySQL
    await suggestionDao.createSuggestion({
      id: suggestionId,
      content,
      author_id: userId,
      created_at: createdAt
    });

    // 更新内存
    const newSuggestion = { id: suggestionId, content, authorId: userId, createdAt };
    suggestions.unshift(newSuggestion);

    // 异步同步到云数据库
    syncToCloud('suggestions', suggestionId, { userId, gameName, content, date, createdAt });

    res.json({ id: suggestionId, content, date });
  } catch (e) {
    console.error('提交建议失败:', e);
    res.status(500).json({ error: '提交建议失败' });
  }
});

// 6. 删除建议 (仅管理员)
app.delete('/api/suggestions/:id', async (req, res) => {
  const adminId = req.query.adminId || req.body.adminId;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return res.status(403).json({ error: '无权限' });
  try {
    const suggestionId = req.params.id;

    // 从MySQL删除
    await suggestionDao.deleteSuggestion(suggestionId);

    // 从内存删除
    suggestions = suggestions.filter(s => s.id !== suggestionId);

    // 异步同步到云数据库
    setImmediate(async () => {
      try {
        await db.collection('suggestions').doc(suggestionId).remove();
      } catch (e) {
        console.error(`[同步失败] 删除suggestion/${suggestionId}:`, e.message);
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('删除建议失败:', e);
    res.status(500).json({ error: '删除建议失败' });
  }
});

// 7. 标记告示已读
app.post('/api/notices/:id/read', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: '用户ID缺失' });

  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  try {
    // 初始化readNoticeIds如果不存在
    if (!user.readNoticeIds) {
      user.readNoticeIds = [];
    }

    // 如果不在已读列表中，添加进去
    const noticeId = req.params.id;
    if (!user.readNoticeIds.includes(noticeId)) {
      user.readNoticeIds.push(noticeId);
      // 同步到数据库
      await userDao.updateUser(userId, { read_notice_ids: JSON.stringify(user.readNoticeIds) });
      syncToCloud('users', userId, { readNoticeIds: user.readNoticeIds });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('标记告示已读失败:', e);
    res.status(500).json({ error: '标记已读失败' });
  }
});

// 8. 标记建议已读 (仅管理员)
app.post('/api/suggestions/:id/read', async (req, res) => {
  const { adminId } = req.body;
  if (!adminId) return res.status(400).json({ error: '管理员ID缺失' });

  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return res.status(403).json({ error: '无权限' });

  try {
    // 初始化readSuggestionIds如果不存在
    if (!admin.readSuggestionIds) {
      admin.readSuggestionIds = [];
    }

    // 如果不在已读列表中，添加进去
    const suggestionId = req.params.id;
    if (!admin.readSuggestionIds.includes(suggestionId)) {
      admin.readSuggestionIds.push(suggestionId);
      // 同步到数据库
      await userDao.updateUser(adminId, { read_suggestion_ids: JSON.stringify(admin.readSuggestionIds) });
      syncToCloud('users', adminId, { readSuggestionIds: admin.readSuggestionIds });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('标记建议已读失败:', e);
    res.status(500).json({ error: '标记已读失败' });
  }
});

// 管理员清理avatar_url空格
app.post('/api/admin/fix-avatars', async (req, res) => {
  const { adminId } = req.body;
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return res.status(403).json({ error: '无权限' });

  try {
    const mysqlDb = require('./db/mysql');
    const result = await mysqlDb.query(
      `UPDATE users SET avatar_url = REPLACE(REPLACE(REPLACE(avatar_url, ' ', ''), '\\n', ''), '\\r', '')
       WHERE avatar_url LIKE '% %' OR avatar_url LIKE '%\\n%' OR avatar_url LIKE '%\\r%'`
    );

    // 重新加载用户数据到内存
    const mysqlUsers = await userDao.getAllUsers();
    users = mysqlUsers.map(u => ({
      id: u.id,
      gameName: u.game_name,
      guildName: u.guild_name,
      mainStyle: u.main_style,
      subStyle: u.sub_style,
      passwordHash: u.password_hash,
      avatarUrl: u.avatar_url,
      openId: u.open_id,
      isAdmin: !!u.is_admin,
      signInCount: u.sign_in_count,
      lastSignInDate: u.last_sign_in_date,
      lotteryCount: u.lottery_count || 0,
      readNoticeIds: typeof u.read_notice_ids === 'string' ? JSON.parse(u.read_notice_ids) : (u.read_notice_ids || []),
      readSuggestionIds: typeof u.read_suggestion_ids === 'string' ? JSON.parse(u.read_suggestion_ids) : (u.read_suggestion_ids || []),
      contributionPoints: u.contribution_points || 0,
      consecutiveSignIns: u.consecutive_sign_ins || 0,
      juejinHighScore: u.juejin_high_score || 0,
      juejinCompleted: !!u.juejin_completed,
      achievements: typeof u.achievements === 'string' ? JSON.parse(u.achievements) : (u.achievements || []),
      mpQuota: typeof u.mp_quota === 'string' ? JSON.parse(u.mp_quota) : (u.mp_quota || { invite: 0, full: 0, remind: 0 }),
      inviteLog: typeof u.invite_log === 'string' ? JSON.parse(u.invite_log) : (u.invite_log || {}),
      pendingInvites: typeof u.pending_invites === 'string' ? JSON.parse(u.pending_invites) : (u.pending_invites || []),
      juejinLastPlayed: u.juejin_last_played || null
    }));

    // 异步同步到云数据库
    setImmediate(async () => {
      for (const user of users) {
        try {
          await db.collection('users').doc(user.id).update({
            avatarUrl: user.avatarUrl
          });
        } catch (e) {
          console.error(`[同步失败] fix-avatars users/${user.id}:`, e.message);
        }
      }
    });

    res.json({ ok: true, affectedRows: result.affectedRows });
  } catch (e) {
    console.error('清理avatar_url失败:', e);
    res.status(500).json({ error: '清理失败' });
  }
});

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

app.get('/api/music', (req, res) => {
  try {
    res.json(listMusicTracks());
  } catch (e) {
    console.error('获取音乐列表失败:', e);
    res.status(500).json({ error: '获取音乐列表失败' });
  }
});

// ---------- 掘金游戏接口 ----------
app.post('/api/games/juejin/score', async (req, res) => {
  const { userId, score } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const oldScore = user.juejinHighScore || 0;
  const updated = score > oldScore;

  // 计算贡献值：每1000分=1贡献值
  const earnedPoints = Math.floor(score / 1000);
  if (!user.contributionPoints) user.contributionPoints = 0;
  user.contributionPoints += earnedPoints;

  if (updated) {
    user.juejinHighScore = score;
  }

  try {
    await userDao.updateUser(userId, {
      juejin_high_score: updated ? score : user.juejinHighScore,
      juejin_last_played: new Date().toISOString(),
      contribution_points: user.contributionPoints
    });
    syncToCloud('users', userId, {
      juejinHighScore: updated ? score : user.juejinHighScore,
      juejinLastPlayed: new Date().toISOString(),
      contributionPoints: user.contributionPoints
    });
  } catch (e) {
    return res.status(500).json({ error: '保存失败' });
  }

  const sorted = users
    .filter(u => u.juejinHighScore > 0)
    .sort((a, b) => b.juejinHighScore - a.juejinHighScore);
  const rank = sorted.findIndex(u => u.id === userId) + 1;

  res.json({ updated, highScore: user.juejinHighScore, rank, earnedPoints });
});

app.get('/api/games/juejin/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const leaderboard = users
    .filter(u => u.juejinHighScore > 0)
    .sort((a, b) => b.juejinHighScore - a.juejinHighScore)
    .slice(0, limit)
    .map((u, index) => ({
      rank: index + 1,
      userId: u.id,
      gameName: u.gameName,
      avatarUrl: u.avatarUrl || '/img/default-avatar.jpg',
      highScore: u.juejinHighScore
    }));
  res.json({ leaderboard });
});

app.get('/api/games/juejin/user/:userId', (req, res) => {
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const sorted = users
    .filter(u => u.juejinHighScore > 0)
    .sort((a, b) => b.juejinHighScore - a.juejinHighScore);
  const rank = sorted.findIndex(u => u.id === user.id) + 1;

  res.json({
    userId: user.id,
    gameName: user.gameName,
    avatarUrl: user.avatarUrl || '/img/default-avatar.jpg',
    highScore: user.juejinHighScore || 0,
    rank: rank || 0
  });
});

// ---------- 成就系统接口 ----------
app.get('/api/achievements/:userId', (req, res) => {
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    achievements: user.achievements || [],
    signInCount: user.signInCount || 0,
    juejinCompleted: user.juejinCompleted || false
  });
});

app.post('/api/achievements/check', async (req, res) => {
  const { userId, type } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const newAchievements = [];
  const userAchievements = user.achievements || [];

  for (const ach of ACHIEVEMENTS) {
    if (ach.type !== type || userAchievements.includes(ach.id)) continue;

    let unlocked = false;
    if (type === 'signin') {
      unlocked = (user.signInCount || 0) >= ach.target;
    } else if (type === 'juejin') {
      unlocked = user.juejinCompleted === true;
    }

    if (unlocked) {
      userAchievements.push(ach.id);
      newAchievements.push({ id: ach.id, name: ach.name, desc: ach.desc });
    }
  }

  if (newAchievements.length > 0) {
    user.achievements = userAchievements;
    try {
      await userDao.updateUser(userId, { achievements: JSON.stringify(userAchievements) });
      syncToCloud('users', userId, { achievements: userAchievements });
    } catch (e) {
      return res.status(500).json({ error: '保存失败' });
    }
  }

  res.json({ newAchievements, allAchievements: userAchievements });
});

app.post('/api/games/juejin/complete', async (req, res) => {
  const { userId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.juejinCompleted) return res.json({ alreadyCompleted: true });

  user.juejinCompleted = true;
  try {
    await userDao.updateUser(userId, { juejin_completed: 1 });
    syncToCloud('users', userId, { juejinCompleted: true });
  } catch (e) {
    return res.status(500).json({ error: '保存失败' });
  }

  setImmediate(async () => {
    try {
      const checkRes = await fetch(`http://localhost:${PORT}/api/achievements/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'juejin' })
      });
      const data = await checkRes.json();
      if (data.newAchievements && data.newAchievements.length > 0) {
        broadcast({ type: 'achievement', userId, achievement: data.newAchievements[0] });
      }
    } catch (e) { }
  });

  res.json({ success: true });
});

// ---------- 测试成就触发接口 ----------
app.post('/api/achievements/trigger', async (req, res) => {
  const { userId, tag } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const tagMap = {
    '1': { id: 'signin_30', count: 30 },
    '2': { id: 'signin_90', count: 90 },
    '3': { id: 'signin_180', count: 180 },
    '4': { id: 'signin_365', count: 365 },
    '5': { id: 'juejin_complete', juejin: true }
  };

  const config = tagMap[String(tag)];
  if (!config) return res.status(400).json({ error: '无效的tag参数，请使用1-5' });

  try {
    if (config.count) {
      user.signInCount = config.count;
      await userDao.updateUser(userId, { sign_in_count: config.count });
      syncToCloud('users', userId, { signInCount: config.count });

      const checkRes = await fetch(`http://localhost:${PORT}/api/achievements/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'signin' })
      });
      const data = await checkRes.json();
      if (data.newAchievements && data.newAchievements.length > 0) {
        broadcast({ type: 'achievement', userId, achievement: data.newAchievements[0] });
        return res.json({ success: true, achievement: data.newAchievements[0] });
      }
    } else if (config.juejin) {
      user.juejinCompleted = true;
      await userDao.updateUser(userId, { juejin_completed: 1 });
      syncToCloud('users', userId, { juejinCompleted: true });

      const checkRes = await fetch(`http://localhost:${PORT}/api/achievements/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'juejin' })
      });
      const data = await checkRes.json();
      if (data.newAchievements && data.newAchievements.length > 0) {
        broadcast({ type: 'achievement', userId, achievement: data.newAchievements[0] });
        return res.json({ success: true, achievement: data.newAchievements[0] });
      }
    }
    res.json({ success: true, message: '成就已解锁或条件已设置' });
  } catch (e) {
    res.status(500).json({ error: '触发失败' });
  }
});

// 设置签到天数API（测试用）
app.post('/api/users/set-checkin-days', async (req, res) => {
  const { username, days } = req.body;
  if (!username || days === undefined) {
    return res.status(400).json({ error: '缺少username或days参数' });
  }

  const user = users.find(u => u.gameName === username);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  try {
    await userDao.updateUser(user.id, { sign_in_count: days });
    syncToCloud('users', user.id, { signInCount: days });
    user.signInCount = days;
    res.json({ success: true, gameName: user.gameName, signInCount: days });
  } catch (e) {
    res.status(500).json({ error: '设置失败' });
  }
});

// ---------- 贡献值系统 ----------
// 每晚23:50扫描队伍并发放贡献值
async function checkTeamContributions() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 只在23:50执行
  if (hour !== 23 || minute !== 50) return;

  const today = now.toISOString().split('T')[0];
  const processedKey = `team_contribution_${today}`;

  // 检查今天是否已处理过
  if (global[processedKey]) return;
  global[processedKey] = true;

  console.log(`[贡献值] 开始扫描 ${today} 的队伍...`);

  const todayTeams = teams.filter(t => t.date === today);
  const userPoints = {};

  for (const team of todayTeams) {
    const points = team.maxSize === 10 ? 100 : 50;
    for (const member of team.members) {
      userPoints[member.userId] = (userPoints[member.userId] || 0) + points;
    }
  }

  for (const [userId, points] of Object.entries(userPoints)) {
    const user = users.find(u => u.id === userId);
    if (user) {
      if (!user.contributionPoints) user.contributionPoints = 0;
      user.contributionPoints += points;
      try {
        await userDao.updateUser(userId, { contribution_points: user.contributionPoints });
        syncToCloud('users', userId, { contributionPoints: user.contributionPoints });
        console.log(`[贡献值] ${user.gameName} 获得 ${points} 贡献值`);
      } catch (e) {
        console.error(`[贡献值] 更新失败: ${user.gameName}`, e);
      }
    }
  }

  console.log(`[贡献值] 扫描完成，共处理 ${Object.keys(userPoints).length} 位玩家`);
}

setInterval(checkTeamContributions, 60 * 1000); // 每分钟检查一次

// 获取用户贡献值
app.get('/api/contribution/:userId', (req, res) => {
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ contributionPoints: user.contributionPoints || 0 });
});

// ---------- 启动 ----------
loadData();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n⚔  燕云十六声预约组队服务器已启动`);
  console.log(`   访问地址: http://localhost:${PORT}\n`);
});
