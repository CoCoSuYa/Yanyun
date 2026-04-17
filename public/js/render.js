// ====================================================
// 渲染：用户列表 / 日期行 / 队伍卡片 / 个人徽章
// ====================================================
import { S } from './state.js';
import { esc, localDateStr, isPast, isToday, weekday, fmtTime, fmtDateLabel, dateRange } from './utils.js';
import { amIAdmin } from './state.js';
import { updateLazyLoading } from './images.js';

export function getUserAvatar(u) {
  const url = u && u.avatarUrl && String(u.avatarUrl).trim() ? String(u.avatarUrl).trim() : '';
  // 验证URL是否有效：必须是相对路径或绝对URL，不能是空字符串或无效字符
  if (!url || url === 'null' || url === 'undefined' || url === '') {
    return 'img/default-avatar.jpg';
  }
  // 如果是相对路径，确保以/或img/开头
  if (!url.startsWith('/') && !url.startsWith('http') && !url.startsWith('img/')) {
    return 'img/default-avatar.jpg';
  }
  return url;
}

export function getRankLabel(rank) {
  const rankTitles = ['魁首', '亚元', '季元', '亚魁', '经魁', '六俊', '七杰', '八英', '九豪', '十贤'];
  return rankTitles[rank - 1] || `第${rank}名`;
}

let renderUserListTimer = null;
let lastUserListHash = '';

function getUserListHash() {
  return S.users.map(u => `${u.id}-${u.signInCount}-${u.avatarUrl}`).join('|');
}

export function renderUserList(immediate = false) {
  const currentHash = getUserListHash();
  if (currentHash === lastUserListHash) return;
  lastUserListHash = currentHash;

  clearTimeout(renderUserListTimer);
  if (immediate) {
    _doRenderUserList();
  } else {
    renderUserListTimer = setTimeout(() => { _doRenderUserList(); }, 100);
  }
}

function _doRenderUserList() {
  const el = document.getElementById('userList');
  const sortedUsers = [...S.users].sort((a, b) => {
    const signDiff = (b.signInCount || 0) - (a.signInCount || 0);
    if (signDiff !== 0) return signDiff;
    return String(a.gameName || '').localeCompare(String(b.gameName || ''), 'zh-CN');
  });

  document.getElementById('userCount').textContent = `共 ${sortedUsers.length} 位`;
  el.innerHTML = sortedUsers.map((u, index) => {
    const me = S.user && u.id === S.user.id;
    const avatar = getUserAvatar(u);
    const signInCount = u.signInCount || 0;
    // 注意：handleUserItemClick 通过 init.js 挂载到 window，onclick 字符串在运行时解析
    return `<div class="user-item${me ? ' me' : ''}" onclick="handleUserItemClick(event, '${u.id}')">
      <div class="user-avatar-wrap">
        <img class="user-avatar lazy-avatar"
             data-src="${esc(avatar)}"
             src="img/default-avatar.jpg"
             alt=""
             onerror="this.onerror=null;this.src='img/default-avatar.jpg'">
      </div>
      <div class="user-info">
        <span class="user-name">${esc(u.gameName)}${me ? ' ◆' : ''}</span>
        <span class="style-tag">${esc(u.mainStyle)}${u.subStyle ? ` · ${esc(u.subStyle)}` : ''}</span>
      </div>
      <div class="user-meta">
        <span class="user-rank">${getRankLabel(index + 1)}</span>
        <span class="user-sign-days">${signInCount}天</span>
      </div>
    </div>`;
  }).join('');

  updateLazyLoading();
}

export function forceRenderUserList() {
  clearTimeout(renderUserListTimer);
  lastUserListHash = '';
  _doRenderUserList();
}

// selectDate 由 init.js 从 team.js 导入并挂载到 window
let _selectDateFn = null;
export function setSelectDateFn(fn) { _selectDateFn = fn; }

export function renderDateRow() {
  const row = document.getElementById('dateRow');
  row.innerHTML = '';
  dateRange().forEach(d => {
    const ds = localDateStr(d);
    const el = document.createElement('div');
    el.className = `date-btn${ds === S.date ? ' active' : ''}${isPast(ds) ? ' past' : ''}${isToday(ds) ? ' today' : ''}`;
    el.innerHTML = `<span class="dd">${d.getDate()}</span><span class="dw">${isToday(ds) ? '今日' : '周' + weekday(d)}</span>`;
    if (_selectDateFn) { el.onclick = () => _selectDateFn(ds); }
    row.appendChild(el);
    if (ds === S.date) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 50);
  });
}

// handleCardClick / showKickPopup 由 init.js 设置（避免循环依赖）
let _handleCardClickFn = null;
export function setHandleCardClickFn(fn) { _handleCardClickFn = fn; }

let _showKickPopupFn = null;
export function setShowKickPopupFn(fn) { _showKickPopupFn = fn; }

export function renderTeams() {
  const wrap = document.getElementById('teamsWrap');
  const list = S.teams
    .filter(t => t.date === S.date)
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  wrap.innerHTML = `<div class="date-label">${fmtDateLabel(S.date)}</div>`;

  if (!list.length) {
    const tip = isPast(S.date) ? '往昔已逝，此日无队可寻' : '此日尚无队伍\n江湖路宽，可率先聚义';
    wrap.innerHTML += `<div class="empty-tip">${tip}</div>`;
    return;
  }
  list.forEach(t => wrap.appendChild(buildCard(t)));
}

function buildCard(team) {
  const isMine = S.user && team.members.some(m => m.userId === S.user.id);
  const isFull = team.members.length >= team.maxSize;
  const isLeader = S.user && team.leaderId === S.user.id;

  const card = document.createElement('div');
  card.className = `team-card${isMine ? ' mine' : ''}${isFull ? ' full' : ''}`;

  let slots = '';
  for (let i = 0; i < team.maxSize; i++) {
    const m = team.members[i];
    if (m) {
      const ldr = m.userId === team.leaderId;
      slots += `<div class="slot${ldr ? ' leader' : ''}" data-uid="${m.userId}">
    <div class="sn">${esc(m.gameName)}</div>
    <div class="sm">${esc(m.mainStyle)}</div>
    ${m.subStyle ? `<div class="ss">${esc(m.subStyle)}</div>` : ''}
  </div>`;
    } else {
      slots += `<div class="slot empty">虚位</div>`;
    }
  }

  card.innerHTML = `
<div class="team-top">
  <span class="tag-purpose">${esc(team.purpose)}</span>
  <span class="tag-type">${esc(team.type)}</span>
  <span class="tag-time">⏰ ${fmtTime(team.time)}</span>
</div>
<div class="members-row">${slots}</div>
<div class="card-foot">
  <span class="count-tag${isFull ? ' full-tag' : ''}">${team.members.length}/${team.maxSize} 人${isFull ? ' · 已满员' : ''}</span>
</div>`;

  card.addEventListener('click', e => {
    const slotEl = e.target.closest('.slot:not(.empty)');
    if (slotEl && isLeader) {
      const uid = slotEl.dataset.uid;
      if (uid !== S.user.id) { _showKickPopupFn?.(e, team, uid); return; }
    }
    _handleCardClickFn?.(e, team);
  });

  return card;
}

export function updateMyBadge() {
  const DEFAULT_AVATAR = 'img/default-avatar.jpg';
  const nameEl = document.getElementById('myName');
  const avatarEl = document.getElementById('myAvatar');

  if (avatarEl) {
    avatarEl.alt = '';
    avatarEl.onerror = () => {
      avatarEl.onerror = null;
      avatarEl.src = DEFAULT_AVATAR;
    };
  }

  if (S.user) {
    if (nameEl) nameEl.textContent = S.user.gameName;
    if (avatarEl) {
      const url = (S.user.avatarUrl && String(S.user.avatarUrl).trim()) ? String(S.user.avatarUrl).trim() : '';
      avatarEl.src = url || DEFAULT_AVATAR;
    }
  } else {
    if (nameEl) nameEl.textContent = '未登录';
    if (avatarEl) avatarEl.src = DEFAULT_AVATAR;
  }

  const clearBtn = document.getElementById('clearBannerBtn');
  if (clearBtn) clearBtn.style.display = (amIAdmin()) ? '' : 'none';
}

// checkPendingJoin 由 init.js 设置
let _checkPendingJoinFn = null;
export function setCheckPendingJoinFn(fn) { _checkPendingJoinFn = fn; }

// renderLotteryRecords 由 init.js 设置
let _renderLotteryRecordsFn = null;
export function setRenderLotteryRecordsFn(fn) { _renderLotteryRecordsFn = fn; }

export function renderAll() {
  renderUserList();
  renderDateRow();
  renderTeams();
  updateMyBadge();
  _checkPendingJoinFn?.();
  _renderLotteryRecordsFn?.();
}
