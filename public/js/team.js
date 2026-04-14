// ====================================================
// 队伍交互：选日期 / 入队 / 离队 / 踢人 / 解散 / 邀约
// ====================================================
import { S, amIAdmin } from './state.js';
import { isPast, todayStr, toLocalDTStr, esc, dateRange, localDateStr } from './utils.js';
import { api, showLoading, hideLoading } from './api.js';
import { openModal, closeModal, showPopup, toast, confirm2 } from './ui.js';
import { renderTeams, updateMyBadge, renderUserList, forceRenderUserList, renderDateRow } from './render.js';

export function selectDate(ds, dir) {
  S.date = ds;
  renderDateRow();
  renderTeams();
  if (dir) {
    const wrap = document.getElementById('teamsWrap');
    const cls = dir === 'left' ? 'slide-left' : 'slide-right';
    wrap.classList.remove('slide-left', 'slide-right');
    void wrap.offsetWidth;
    wrap.classList.add(cls);
    wrap.addEventListener('animationend', () => wrap.classList.remove(cls), { once: true });
  }
}

export function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const open = sb.classList.toggle('open');
  if (open) {
    const mask = document.createElement('div');
    mask.className = 'sidebar-mask'; mask.id = 'sbMask';
    mask.onclick = () => { sb.classList.remove('open'); mask.remove(); };
    document.body.appendChild(mask);
  } else {
    document.getElementById('sbMask')?.remove();
  }
}

export function handleMyBadgeClick() {
  if (!S.user) { showIdentityModal(); return; }
  const badge = document.getElementById('myBadge');
  const rect = badge.getBoundingClientRect();
  const fakeE = { clientX: rect.right, clientY: rect.bottom, currentTarget: badge };
  const contributionPoints = S.user.contributionPoints || 0;
  showPopup(fakeE, [
    { label: `贡献值：${contributionPoints}`, fn: null, isInfo: true },
    { label: '个人中心', fn: () => window.location.href = '/profile.html' },
    { label: '修改信息', fn: showEditModal },
    { label: '暂别江湖', danger: true, fn: doLogout },
  ]);
}

// ---------- 队伍操作 API ----------
export function applyTeamResult(result, teamId) {
  if (result && result.dissolved) {
    S.teams = S.teams.filter(t => t.id !== teamId);
  } else if (result && result.id) {
    const i = S.teams.findIndex(t => t.id === result.id);
    if (i !== -1) S.teams[i] = result; else S.teams.push(result);
  }
  renderTeams();
}

export async function doJoin(team) {
  showLoading('入队中...');
  try {
    const res = await api('POST', `/api/teams/${team.id}/join`, { userId: S.user.id });
    applyTeamResult(res, team.id);
    toast('已入队，江湖再聚！');
  } catch (e) { toast(e.message); }
  finally { hideLoading(); }
}

export async function doLeave(team) {
  showLoading('离队中...');
  try {
    const res = await api('POST', `/api/teams/${team.id}/leave`, { userId: S.user.id });
    applyTeamResult(res, team.id);
    toast('已辞队而去');
  } catch (e) { toast(e.message); }
  finally { hideLoading(); }
}

export async function doKick(team, uid) {
  showLoading('处理中...');
  try {
    const res = await api('POST', `/api/teams/${team.id}/kick`, { leaderId: S.user.id, targetUserId: uid });
    applyTeamResult(res, team.id);
    toast('已发出逐客令');
  } catch (e) { toast(e.message); }
  finally { hideLoading(); }
}

export async function doDissolve(team) {
  confirm2('确定要散伙议事，解散此队伍吗？', async () => {
    showLoading('解散中...');
    try {
      await api('POST', `/api/teams/${team.id}/dissolve`, { adminId: S.user.id });
      applyTeamResult({ dissolved: true }, team.id);
      toast('队伍已解散');
    } catch (e) { toast(e.message); }
    finally { hideLoading(); }
  });
}

// ---------- 点击队伍卡片 ----------
export function handleCardClick(e, team) {
  if (!S.user) { S.pendingAction = () => handleCardClick(e, team); showIdentityModal(); return; }
  if (isPast(S.date) && !amIAdmin()) {
    toast('往昔队伍不可相邀，请择他日再聚');
    return;
  }

  const fresh = S.teams.find(t => t.id === team.id) || team;
  const isMine = fresh.members.some(m => m.userId === S.user.id);
  const isFull = fresh.members.length >= fresh.maxSize;
  const isLeader = fresh.leaderId === S.user.id;
  const isAdmin = amIAdmin();

  const teamTimePassed = new Date(fresh.time) <= new Date();
  const actions = [];

  if (isMine) {
    if (isLeader) {
      actions.push({ label: '修改时间', fn: () => showEditTimeModal(fresh) });
    }
    actions.push({ label: '分享队伍', fn: () => copyShareLink(fresh) });
    actions.push({ label: '辞队而去', danger: true, fn: () => doLeave(fresh) });
  } else {
    if (isFull) { toast('队伍已满员，暂难容纳更多游侠'); return; }
    if (teamTimePassed) { toast('此队已过开本时间，无法加入'); return; }
    actions.push({ label: '入队相邀', fn: () => doJoin(fresh) });
  }

  if (isAdmin) {
    actions.push({ label: '修改时间', fn: () => showEditTimeModal(fresh) });
    actions.push({ label: '散伙议事', danger: true, fn: () => doDissolve(fresh) });
  }

  // 非队长也可以分享（通过复制链接）
  if (!isLeader && isMine && !actions.find(a => a.label === '分享队伍')) {
    actions.splice(actions.length - 1, 0, { label: '分享队伍', fn: () => copyShareLink(fresh) });
  }

  if (!actions.length) return;
  showPopup(e, actions);
}

// 复制队伍分享链接
function copyShareLink(team) {
  const url = `${location.origin}${location.pathname}?join=${team.id}`;
  navigator.clipboard.writeText(url).then(() => {
    toast('链接已复制，可发送给好友');
  }).catch(() => {
    // fallback: 显示链接让用户手动复制
    openModal('复制邀请链接', `<div style="word-break:break-all;font-size:13px;color:var(--text-dim);padding:8px 0">${esc(url)}</div><div class="fbtns"><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
  });
}

export function showKickPopup(e, team, uid) {
  showPopup(e, [{ label: '逐客令', danger: true, fn: () => doKick(team, uid) }]);
}

// ---------- 分享链接自动入队 ----------
export function checkPendingJoin() {
  if (!S.pendingJoin || !S.user) return;
  if (!S.teams.length) return;

  const teamId = S.pendingJoin;
  S.pendingJoin = null;

  const team = S.teams.find(t => t.id === teamId);
  if (!team) { toast('此队已散，缘分已尽'); return; }
  if (team.members.some(m => m.userId === S.user.id)) return;
  if (team.members.length >= team.maxSize) { toast('此队已满员，有缘再聚'); return; }

  const leader = team.members.find(m => m.userId === team.leaderId);
  openModal('应约入队', `
<div style="text-align:center;padding:8px 0 16px">
  <div style="font-size:16px;color:var(--gold-light);letter-spacing:2px;margin-bottom:12px">江湖邀约</div>
  <div style="font-size:13px;color:var(--text-dim);line-height:2">
    队长：${esc(leader ? leader.gameName : '未知')}<br>
    人数：${team.members.length} / ${team.maxSize}<br>
    日期：${team.date}
  </div>
</div>
<div class="fbtns">
  <button class="btn btn-ghost" onclick="closeModal()">婉拒</button>
  <button class="btn btn-primary" onclick="closeModal();doJoinById('${teamId}')">应约入队</button>
</div>
  `);
}

// 全局函数：供 HTML onclick 调用
window.doJoinById = async function(teamId) {
  const team = S.teams.find(t => t.id === teamId);
  if (team) await doJoin(team);
};

// ---------- 登出 ----------
export function doLogout() {
  S.user = null;
  localStorage.removeItem('yanyun_user');
  updateMyBadge();
  renderUserList();
  toast('已离开江湖，后会有期');
}

// ---------- 日期滑动 ----------
export function setupDateSwipe() {
  const wrap = document.getElementById('teamsWrap');
  let startX = 0, startY = 0, moved = false;

  wrap.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = false;
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) + 8) {
      moved = true;
      e.preventDefault();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', e => {
    if (!moved) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 50) return;

    const dates = dateRange().map(d => localDateStr(d));
    const idx = dates.indexOf(S.date);
    if (dx < 0 && idx < dates.length - 1) {
      selectDate(dates[idx + 1], 'left');
    } else if (dx > 0 && idx > 0) {
      selectDate(dates[idx - 1], 'right');
    }
  }, { passive: true });
}

// 引用 auth 模块的弹窗（避免循环依赖，延迟引用）
let _showIdentityModalFn = null;
export function setAuthFns(fns) { _showIdentityModalFn = fns.showIdentityModal; }

function showIdentityModal(...args) {
  if (_showIdentityModalFn) _showIdentityModalFn(...args);
}

let _showEditModalFn = null;
export function setEditModalFn(fn) { _showEditModalFn = fn; }
function showEditModal() { if (_showEditModalFn) _showEditModalFn(); }

let _showEditTimeModalFn = null;
export function setShowEditTimeModalFn(fn) { _showEditTimeModalFn = fn; }
function showEditTimeModal(team) { if (_showEditTimeModalFn) _showEditTimeModalFn(team); }

// 用户列表点击
export function handleUserItemClick(event, userId) {
  const user = S.users.find(u => u.id === userId);
  if (!user) return;

  const me = S.user && user.id === S.user.id;
  const actions = [];

  if (me) {
    actions.push({ label: '查看身份', fn: () => handleMyBadgeClick() });
  }

  if (amIAdmin() && !me) {
    actions.push({ label: '请离百业', danger: true, fn: () => deleteUser(user.id, user.gameName) });
  }

  if (!actions.length) return;
  showPopup(event, actions);
}

async function deleteUser(userId, gameName) {
  const result = await Swal.fire({
    title: '确认删除',
    html: `确定要删除游侠 <strong>${gameName}</strong> 吗？<br><br>此操作将：<br>• 删除该用户创建的所有队伍<br>• 从其他队伍中移除该用户<br>• 删除该用户的所有邀请记录`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    customClass: { popup: 'swal-dark' },
    confirmButtonColor: '#d33',
  });

  if (!result.isConfirmed) return;

  const loadingSwal = Swal.fire({
    title: '删除中...',
    html: '正在清理该用户的相关数据',
    allowOutsideClick: false,
    customClass: { popup: 'swal-dark' },
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    await api('DELETE', '/api/users/' + userId, { adminId: S.user.id });
    loadingSwal.close();
    await Swal.fire({
      title: '删除成功',
      text: `游侠 ${gameName} 已从江湖除名`,
      icon: 'success',
      customClass: { popup: 'swal-dark' },
      timer: 1500,
      showConfirmButton: false
    });
  } catch (e) {
    loadingSwal.close();
    Swal.fire({
      title: '删除失败',
      text: e.message || '操作失败，请重试',
      icon: 'error',
      customClass: { popup: 'swal-dark' }
    });
  }
}
