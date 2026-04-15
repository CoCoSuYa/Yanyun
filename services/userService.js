/**
 * 用户服务
 * 注册/登录/修改/删除/头像上传
 */
const { v4: uuidv4 } = require('uuid');
const cache = require('../cache');
const userDao = require('../dao/userDao');
const teamDao = require('../dao/teamDao');
const { broadcast, safeUser } = require('../websocket/broadcast');
const { hashPassword } = require('../utils/password');
const { getAvatarExtension, removeUserAvatarFiles, avatarDir } = require('../utils/avatar');
const { syncNewUserToCloud, syncUpdateUserToCloud, syncDeleteUserFromCloud } = require('../utils/cloudSync');
const { syncUpdateTeamToCloud } = require('../utils/cloudSync');
const fs = require('fs');
const path = require('path');

function login(gameName, password) {
  const users = cache.getUsers();
  const user = users.find(u => u.gameName === gameName.trim());
  if (!user) return { error: '此游戏名尚未登录江湖，请先注册', status: 401 };
  if (user.passwordHash !== hashPassword(password)) return { error: '密码有误，请重新确认', status: 401 };
  return { user: safeUser(user) };
}

function listUsers() {
  return cache.getUsers().map(safeUser);
}

async function createUser({ gameName, guildName, mainStyle, subStyle, password }) {
  const users = cache.getUsers();

  if (guildName !== '百舸争流') return { error: '非本百业游侠，暂无法使用此功能', status: 400 };
  if (!mainStyle || !/^[\u4e00-\u9fa5]{1,2}$/.test(mainStyle)) return { error: '主流派仅允许最多2个中文字符', status: 400 };
  if (subStyle && !/^[\u4e00-\u9fa5]{1,2}$/.test(subStyle)) return { error: '副流派仅允许最多2个中文字符', status: 400 };
  if (!password || password.length < 6) return { error: '密码不可少于6位', status: 400 };

  const existing = users.find(u => u.gameName === gameName.trim());
  if (existing) return { error: '此名已被江湖同侪占用，请另择他名', status: 409 };

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

  await userDao.createUser({
    id: user.id,
    game_name: user.gameName,
    guild_name: user.guildName,
    main_style: user.mainStyle,
    sub_style: user.subStyle,
    password_hash: user.passwordHash,
    avatar_url: '',
    is_admin: false,
    lottery_count: 1,
    sign_in_count: 0,
    contribution_points: 0,
    consecutive_sign_ins: 0,
    juejin_high_score: 0,
    juejin_completed: false
  });

  users.push(user);
  
  // 异步同步到云库（不阻塞主流程，失败静默处理）
  syncNewUserToCloud(user).catch(() => {});
  
  broadcast({ type: 'user_joined', data: safeUser(user) });
  return { user: safeUser(user), status: 201 };
}

async function updateUser(userId, { gameName, mainStyle, subStyle, oldPassword, newPassword }) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  if (!gameName || !gameName.trim()) return { error: '游戏名不可为空', status: 400 };
  if (!mainStyle || !/^[\u4e00-\u9fa5]{1,2}$/.test(mainStyle)) return { error: '主流派仅允许最多2个中文字符', status: 400 };
  if (subStyle && !/^[\u4e00-\u9fa5]{1,2}$/.test(subStyle)) return { error: '副流派仅允许最多2个中文字符', status: 400 };

  const nameConflict = users.find(u => u.gameName === gameName.trim() && u.id !== userId);
  if (nameConflict) return { error: '此名已被江湖同侪占用，请另择他名', status: 409 };

  if (newPassword) {
    if (!oldPassword) return { error: '请输入当前密码', status: 400 };
    if (user.passwordHash !== hashPassword(oldPassword)) return { error: '当前密码有误', status: 401 };
    if (newPassword.length < 6) return { error: '新密码不可少于6位', status: 400 };
    user.passwordHash = hashPassword(newPassword);
  }

  user.gameName = gameName.trim();
  user.mainStyle = mainStyle;
  user.subStyle = subStyle || '';

  const updateData = {
    game_name: user.gameName,
    main_style: user.mainStyle,
    sub_style: user.subStyle
  };
  if (newPassword) updateData.password_hash = user.passwordHash;
  await userDao.updateUser(user.id, updateData);

  // 异步同步到云库（不阻塞主流程，失败静默处理）
  const cloudUpdateData = {
    gameName: user.gameName,
    mainStyle: user.mainStyle,
    subStyle: user.subStyle
  };
  if (newPassword) cloudUpdateData.passwordHash = user.passwordHash;
  syncUpdateUserToCloud(user.id, cloudUpdateData).catch(() => {});

  // 级联更新 teams 中的成员信息
  const teams = cache.getTeams();
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
      await teamDao.updateTeam(team.id, { members: JSON.stringify(team.members) });
      
      // 异步同步到云库（更新队伍成员信息）
      syncUpdateTeamToCloud(team.id, { members: team.members }).catch(() => {});
    }
  }

  broadcast({ type: 'user_updated', data: safeUser(user) });
  affectedTeams.forEach(t => broadcast({ type: 'team_updated', data: t }));
  return { user: safeUser(user) };
}

async function uploadAvatar(userId, { fileName, contentType, dataUrl }) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  if (!dataUrl || typeof dataUrl !== 'string') return { error: '头像数据不能为空', status: 400 };

  const matched = dataUrl.match(/^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/);
  if (!matched) return { error: '头像格式不受支持', status: 400 };

  const ext = getAvatarExtension(fileName, contentType || matched[1]);
  if (!ext) return { error: '头像格式不受支持', status: 400 };

  const buffer = Buffer.from(matched[3], 'base64');
  if (buffer.length > 3 * 1024 * 1024) return { error: '头像不能超过 3MB', status: 400 };

  removeUserAvatarFiles(user.id);
  const avatarFileName = `${user.id}${ext}`;
  const avatarFilePath = path.join(avatarDir, avatarFileName);
  fs.writeFileSync(avatarFilePath, buffer);

  user.avatarUrl = `/uploads/avatars/${avatarFileName}`;
  await userDao.updateUser(user.id, { avatar_url: user.avatarUrl });
  
  // 异步同步到云库（不阻塞主流程，失败打印日志）
  syncUpdateUserToCloud(user.id, { avatarUrl: user.avatarUrl }).catch(err => {
    console.error(`[头像上传] 云同步失败: ${err.message}`);
  });

  broadcast({ type: 'user_updated', data: safeUser(user) });
  return { avatarUrl: user.avatarUrl, user: safeUser(user) };
}

async function deleteUser(targetUserId, adminId) {
  const users = cache.getUsers();
  const teams = cache.getTeams();

  const targetUser = users.find(u => u.id === targetUserId);
  if (!targetUser) return { error: '用户不存在', status: 404 };
  if (targetUserId === adminId) return { error: '不能删除自己', status: 400 };

  // 1. 删除该用户创建的所有队伍
  const userCreatedTeams = teams.filter(t => t.leaderId === targetUserId);
  for (const team of userCreatedTeams) {
    const idx = teams.indexOf(team);
    if (idx !== -1) teams.splice(idx, 1);
    try {
      await teamDao.deleteTeam(team.id);
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
      try {
        await teamDao.updateTeam(team.id, { members: JSON.stringify(team.members) });
      } catch (e) {
        console.error('更新队伍成员失败:', e);
      }
      broadcast({ type: 'team_updated', data: team });
    }
  }

  // 3. 从内存中移除用户
  cache.setUsers(users.filter(u => u.id !== targetUserId));

  // 4. 从MySQL删除用户
  await userDao.deleteUser(targetUserId);

  // 5. 异步从云库删除用户（不阻塞主流程，失败静默处理）
  syncDeleteUserFromCloud(targetUserId, targetUser.gameName).catch(() => {});

  broadcast({ type: 'user_deleted', data: { id: targetUserId, gameName: targetUser.gameName } });
  return { success: true, message: `已删除游侠 ${targetUser.gameName}` };
}

async function setCheckinDays(username, days) {
  const users = cache.getUsers();
  const user = users.find(u => u.gameName === username);
  if (!user) return { error: '用户不存在', status: 404 };

  await userDao.updateUser(user.id, { sign_in_count: days });
  user.signInCount = days;
  return { success: true, gameName: user.gameName, signInCount: days };
}

module.exports = {
  login,
  listUsers,
  createUser,
  updateUser,
  uploadAvatar,
  deleteUser,
  setCheckinDays
};
