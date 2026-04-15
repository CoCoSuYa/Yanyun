/**
 * 队伍服务
 * CRUD/加入/退出/踢人/排序/改时间/解散
 * 已去除：云同步、满员微信通知
 */
const { v4: uuidv4 } = require('uuid');
const cache = require('../cache');
const teamDao = require('../dao/teamDao');
const userDao = require('../dao/userDao');
const { broadcast } = require('../websocket/broadcast');
const { isAdminUser } = require('../utils/password');
const { syncNewTeamToCloud, syncUpdateTeamToCloud, syncDeleteTeamFromCloud } = require('../utils/cloudSync');

async function createTeam({ type, purpose, time, date, userId }) {
  const users = cache.getUsers();
  const teams = cache.getTeams();

  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const teamTime = new Date(time);
  if (isNaN(teamTime.getTime()) || teamTime <= new Date())
    return { error: '往昔不可追，请择他日', status: 400 };

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
  
  // 异步同步到云库（不阻塞主流程，失败静默处理）
  syncNewTeamToCloud(team).catch(() => {});
  
  broadcast({ type: 'team_created', data: team });
  return { team, status: 201 };
}

function getTeam(id) {
  return cache.getTeams().find(t => t.id === id) || null;
}

async function joinTeam(teamId, userId) {
  const users = cache.getUsers();
  const teams = cache.getTeams();
  const team = teams.find(t => t.id === teamId);
  if (!team) return { error: '队伍不存在', status: 404 };

  if (team.members.length >= team.maxSize)
    return { error: '队伍已满员，暂难容纳更多游侠', status: 400 };

  if (new Date(team.time) <= new Date())
    return { error: '此队已过开本时间，无法加入', status: 400 };

  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  if (team.members.find(m => m.userId === userId))
    return { error: '您已在此队伍中', status: 400 };

  const newMember = {
    userId: user.id,
    gameName: user.gameName,
    mainStyle: user.mainStyle,
    subStyle: user.subStyle
  };
  team.members.push(newMember);

  // 乐观更新：先广播再异步写库
  broadcast({ type: 'team_updated', data: team });

  // 异步后台写入数据库（不阻塞响应）
  (async () => {
    try {
      await teamDao.updateTeam(team.id, { members: JSON.stringify(team.members) });
      
      // 异步同步到云库（不阻塞主流程，失败静默处理）
      syncUpdateTeamToCloud(team.id, { members: team.members }).catch(() => {});
    } catch (e) {
      console.error('入队写入数据库失败:', e);
      team.members = team.members.filter(m => m.userId !== userId);
      broadcast({ type: 'team_updated', data: team });
      return;
    }

    // 满员标记（仅MySQL持久化，不再发送微信通知）
    if (team.members.length >= team.maxSize && !team.fullNotified) {
      team.fullNotified = true;
      try {
        await teamDao.updateTeam(team.id, { full_notified: 1 });
        
        // 异步同步到云库（不阻塞主流程，失败静默处理）
        syncUpdateTeamToCloud(team.id, { fullNotified: true }).catch(() => {});
      } catch (e) {
        console.error('更新满员标记失败:', e);
      }
    }
  })();

  return { team };
}

async function leaveTeam(teamId, userId) {
  const teams = cache.getTeams();
  const teamIndex = teams.findIndex(t => t.id === teamId);
  if (teamIndex === -1) return { error: '队伍不存在', status: 404 };

  const team = teams[teamIndex];
  const oldMembers = [...team.members];
  const oldLeaderId = team.leaderId;
  team.members = team.members.filter(m => m.userId !== userId);

  try {
    if (team.members.length === 0) {
      await teamDao.deleteTeam(teamId);
      teams.splice(teamIndex, 1);
      
      // 异步同步到云库（删除队伍）
      syncDeleteTeamFromCloud(teamId).catch(() => {});
      
      broadcast({ type: 'team_deleted', data: { id: teamId } });
      return { dissolved: true };
    }

    if (team.leaderId === userId) {
      team.leaderId = team.members[0].userId;
    }

    await teamDao.updateTeam(teamId, {
      members: JSON.stringify(team.members),
      leader_id: team.leaderId
    });
    
    // 异步同步到云库（更新 members 和 leaderId）
    syncUpdateTeamToCloud(teamId, { 
      members: team.members, 
      leaderId: team.leaderId 
    }).catch(() => {});

    broadcast({ type: 'team_updated', data: team });
    return { team };
  } catch (e) {
    console.error('退队数据库失败:', e);
    team.members = oldMembers;
    team.leaderId = oldLeaderId;
    return { error: '风云涌动，退队失败', status: 500 };
  }
}

async function kickMember(teamId, leaderId, targetUserId) {
  const teams = cache.getTeams();
  const teamIndex = teams.findIndex(t => t.id === teamId);
  if (teamIndex === -1) return { error: '队伍不存在', status: 404 };

  const team = teams[teamIndex];
  if (team.leaderId !== leaderId) return { error: '非队长无此权限', status: 403 };
  if (leaderId === targetUserId) return { error: '队长不可逐自身', status: 400 };

  const oldMembers = [...team.members];
  team.members = team.members.filter(m => m.userId !== targetUserId);

  try {
    if (team.members.length === 0) {
      await teamDao.deleteTeam(teamId);
      teams.splice(teamIndex, 1);
      broadcast({ type: 'team_deleted', data: { id: teamId } });
      return { dissolved: true };
    }

    await teamDao.updateTeam(teamId, { members: JSON.stringify(team.members) });
    broadcast({ type: 'team_updated', data: team });
    return { team };
  } catch (e) {
    console.error('踢人数据库失败:', e);
    team.members = oldMembers;
    return { error: '风云涌动，操作失败', status: 500 };
  }
}

async function reorderMembers(teamId, leaderId, members) {
  const teams = cache.getTeams();
  const team = teams.find(t => t.id === teamId);
  if (!team) return { error: '队伍不存在', status: 404 };
  if (team.leaderId !== leaderId) return { error: '非队长无此权限', status: 403 };

  const oldMembers = team.members;
  team.members = members;

  try {
    await teamDao.updateTeam(teamId, { members: JSON.stringify(members) });
    broadcast({ type: 'team_updated', data: team });
    return { team };
  } catch (e) {
    team.members = oldMembers;
    return { error: '风云涌动，调兵谴将失败', status: 500 };
  }
}

async function changeTeamTime(teamId, leaderId, time, date) {
  const teams = cache.getTeams();
  const team = teams.find(t => t.id === teamId);
  if (!team) return { error: '队伍不存在', status: 404 };
  if (team.leaderId !== leaderId) return { error: '非队长无此权限', status: 403 };

  const newTime = new Date(time);
  if (isNaN(newTime.getTime()) || newTime <= new Date())
    return { error: '时间不可早于当前时刻', status: 400 };

  const oldTime = team.time;
  const oldDate = team.date;
  team.time = newTime.toISOString();
  if (date) team.date = date;

  try {
    await teamDao.updateTeam(teamId, { time: team.time, date: team.date });
    
    // 异步同步到云库（更新 time 和 date）
    syncUpdateTeamToCloud(teamId, { 
      time: team.time, 
      date: team.date 
    }).catch(() => {});
    
    broadcast({ type: 'team_updated', data: team });
    return { team };
  } catch (e) {
    team.time = oldTime;
    team.date = oldDate;
    return { error: '风云涌动，改期失败', status: 500 };
  }
}

async function dissolveTeam(teamId, adminId) {
  const users = cache.getUsers();
  const teams = cache.getTeams();
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return { error: '非管理员，无此权限', status: 403 };

  const teamIndex = teams.findIndex(t => t.id === teamId);
  if (teamIndex === -1) return { error: '队伍不存在', status: 404 };

  try {
    await teamDao.deleteTeam(teamId);
    teams.splice(teamIndex, 1);
    
    // 异步同步到云库（删除队伍）
    syncDeleteTeamFromCloud(teamId).catch(() => {});
    
    broadcast({ type: 'team_deleted', data: { id: teamId } });
    return { success: true };
  } catch (e) {
    return { error: '风云涌动，解散失败', status: 500 };
  }
}

module.exports = {
  createTeam,
  getTeam,
  joinTeam,
  leaveTeam,
  kickMember,
  reorderMembers,
  changeTeamTime,
  dissolveTeam
};
