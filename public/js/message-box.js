// ====================================================
// 信箱：告示 / 建议箱
// ====================================================
import { S } from './state.js';
import { api, showLoading, hideLoading } from './api.js';
import { openModal, closeModal, toast } from './ui.js';
import { esc, todayStr } from './utils.js';
import { amIAdmin } from './state.js';

// ---- 未读状态 ----
export let msgUnreadState = {
  hasUnreadNotice: false,
  hasUnreadSuggestion: false,
  noticeViewed: false,
  suggestionViewed: false
};

let cachedNotices = null;

export function setCachedNotices(n) { cachedNotices = n; }
export function getCachedNotices() { return cachedNotices; }
export function clearCachedNotices() { cachedNotices = null; }

export function updateMsgBadge() {
  const badge = document.getElementById('msgBadge');
  if (!badge) return;
  if (!S.user || !S.user.id) { badge.style.display = 'none'; return; }

  const isAdmin = S.user && S.user.isAdmin;
  const showBadge = (!msgUnreadState.noticeViewed && msgUnreadState.hasUnreadNotice) ||
    (isAdmin && !msgUnreadState.suggestionViewed && msgUnreadState.hasUnreadSuggestion);
  badge.style.display = showBadge ? 'block' : 'none';
}

export function markMsgAsRead(type) {
  if (type === 'notices') msgUnreadState.noticeViewed = true;
  else if (type === 'suggestions') msgUnreadState.suggestionViewed = true;
  updateMsgBadge();
}

export async function markAsRead(type, id) {
  if (!S.user) return;
  try {
    if (type === 'notices') {
      await api('POST', '/api/notices/' + id + '/read', { userId: S.user.id });
    } else if (type === 'suggestions' && S.user.isAdmin) {
      await api('POST', '/api/suggestions/' + id + '/read', { adminId: S.user.id });
    }
  } catch (e) { console.error('标记已读失败:', e); }
}

// 检查未读消息（登录后调用）
export async function checkUnreadMessages() {
  if (!S.user) return;
  try {
    const isAdmin = S.user.isAdmin;
    const noticesPromise = api('GET', '/api/notices?userId=' + S.user.id);
    const suggestionsPromise = isAdmin ? api('GET', '/api/suggestions?adminId=' + S.user.id) : Promise.resolve(null);

    const [notices, suggestions] = await Promise.all([noticesPromise, suggestionsPromise]);
    cachedNotices = notices;

    if (notices && notices.length > 0) {
      msgUnreadState.hasUnreadNotice = notices.some(n => !n.isRead);
    } else {
      msgUnreadState.hasUnreadNotice = false;
    }

    if (isAdmin && suggestions) {
      msgUnreadState.hasUnreadSuggestion = suggestions.length > 0 && suggestions.some(s => !s.isRead);
    }

    updateMsgBadge();
  } catch (e) { console.error('检查未读消息失败:', e); }
}

// 登录后弹窗最新未读告示
export async function showLatestUnreadNotice() {
  if (!S.user) return;
  if (S.user.isAdmin) return;

  try {
    const notices = cachedNotices !== null
      ? cachedNotices
      : await api('GET', '/api/notices?userId=' + S.user.id);

    const unreadNotices = notices ? notices.filter(n => !n.isRead) : [];
    if (unreadNotices.length === 0) return;

    unreadNotices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latestNotice = unreadNotices[0];

    Swal.fire({
      title: '最新告示',
      html: `<div style="text-align:left;padding:10px 0;white-space:pre-wrap;">${esc(latestNotice.content)}</div>`,
      confirmButtonText: '我已知晓',
      customClass: { popup: 'swal-dark' },
      allowOutsideClick: false,
    }).then(async () => {
      try {
        const noticeId = latestNotice._id || latestNotice.id;
        await api('POST', '/api/notices/' + noticeId + '/read', { userId: S.user.id });
        cachedNotices = null;
        msgUnreadState.noticeViewed = true;
        msgUnreadState.hasUnreadNotice = false;
        updateMsgBadge();
        loadNotices();
      } catch (e) { console.error('标记已读失败:', e); }
    });
  } catch (e) { console.error('获取最新告示失败:', e); }
}

// ---- 信箱弹窗 UI ----

// 延迟引用 auth 模块
let _showIdentityModalFn = null;
export function setAuthFn(fn) { _showIdentityModalFn = fn; }

function showIdentityModal(...args) { if (_showIdentityModalFn) _showIdentityModalFn(...args); }

export function showMsgBox() {
  if (!S.user || !S.user.id) { showIdentityModal(); return; }
  document.getElementById('msgBoxModal').classList.add('show');
  renderMsgTabs();
  switchMsgTab('notices');
}

export function hideMsgBox() {
  document.getElementById('msgBoxModal').classList.remove('show');
}

export function renderMsgTabs() {
  const tabsWrap = document.getElementById('msgTabs');
  const isAdmin = S.user && S.user.isAdmin;
  let html = `<div class="msgbox-tab active" onclick="switchMsgTab('notices', this)">告示</div>`;
  if (isAdmin) html += `<div class="msgbox-tab" onclick="switchMsgTab('postNotice', this)">贴告示</div>`;
  html += `<div class="msgbox-tab" onclick="switchMsgTab('suggestions', this)">建议箱</div>`;
  tabsWrap.innerHTML = html;
}

export function switchMsgTab(tabId, el) {
  if (el) {
    document.querySelectorAll('.msgbox-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  } else {
    const first = document.querySelector('.msgbox-tab');
    if (first) first.classList.add('active');
  }
  document.querySelectorAll('.msg-panel').forEach(p => p.classList.remove('active'));
  const pnl = document.getElementById('panel-' + tabId);
  if (pnl) pnl.classList.add('active');

  if (tabId === 'notices') loadNotices();
  if (tabId === 'suggestions') loadSuggestions();
}

export async function loadNotices() {
  const container = document.getElementById('noticesList');
  container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">加载中...</div>';
  try {
    const userId = S.user ? S.user.id : '';
    const notices = await api('GET', '/api/notices?userId=' + userId);
    if (!notices.length) {
      container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">暂无告示</div>';
      msgUnreadState.hasUnreadNotice = false;
      updateMsgBadge();
      return;
    }
    const isAdmin = S.user && S.user.isAdmin;
    const hasUnread = notices.some(n => !n.isRead);
    msgUnreadState.hasUnreadNotice = hasUnread;
    updateMsgBadge();

    container.innerHTML = notices.map(n => `
    <div class="msg-item ${n.isRead ? 'msg-item-read' : ''}">
      <div class="msg-item-head">
        <span class="msg-item-title">${esc(n.title || '无标题')}</span>
        ${!n.isRead ? '<span class="msg-unread-dot"></span>' : ''}
      </div>
      <div class="msg-item-content-preview" style="display:none;">${esc(n.content)}</div>
      <div class="msg-item-content" onclick="openMsgDetail(this.parentElement, '告示详情'); markMsgAsRead('notices'); markAsRead('notices', '${n.id}');">${esc(n.content)}</div>
      ${isAdmin ? `<button class="msg-delete-btn" style="display:block;" onclick="deleteMsg(event, 'notices', '${n.id}')">删除</button>` : ''}
    </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;color:#ff4d4f;padding:20px;">加载失败</div>';
  }
}

export async function loadSuggestions() {
  const container = document.getElementById('suggestionsWrap');
  const isAdmin = S.user && S.user.isAdmin;
  if (!isAdmin) {
    container.innerHTML = `
      <div class="msg-form">
        <textarea id="sugContent" class="msg-textarea" placeholder="江湖路长，有什么心里话、吐槽、或者建议，请尽情在此书写..."></textarea>
        <button class="msg-submit" id="sugSubmit" onclick="submitSuggestion()">提交建议</button>
      </div>`;
    return;
  }

  container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">加载中...</div>';
  try {
    const sugs = await api('GET', '/api/suggestions?adminId=' + S.user.id);
    if (!sugs.length) {
      container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">暂无建议</div>';
      msgUnreadState.hasUnreadSuggestion = false;
      updateMsgBadge();
      return;
    }

    const hasUnread = sugs.some(s => !s.isRead);
    msgUnreadState.hasUnreadSuggestion = hasUnread;
    updateMsgBadge();

    // 为每个建议查找作者名字和格式化日期
    const sugsWithAuthor = sugs.map(s => {
      const author = S.users.find(u => u.id === s.authorId);
      const authorName = author ? author.gameName : '未知用户';
      const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('zh-CN') : '';
      return { ...s, authorName, date };
    });

    container.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;">` + sugsWithAuthor.map(s => `
    <div class="msg-item msg-item-suggestion ${s.isRead ? 'msg-item-read' : ''}" data-suggestion-id="${s.id}">
      <div class="msg-item-head-suggestion">
        <div class="msg-item-left">
          <span class="msg-item-author">${esc(s.authorName)}</span>
          <span class="msg-item-date">${s.date}</span>
          ${!s.isRead ? '<span class="msg-unread-dot"></span>' : ''}
        </div>
        <button class="msg-delete-btn-top" onclick="deleteMsg(event, 'suggestions', '${s.id}')">删除</button>
      </div>
      <div class="msg-item-content-preview" style="display:none;">${esc(s.content)}</div>
      <div class="msg-item-content" onclick="openSuggestionDetail(event, '${s.id}')">${esc(s.content)}</div>
    </div>
    `).join('') + `</div>`;
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;color:#ff4d4f;padding:20px;">加载失败</div>';
  }
}

export async function submitSuggestion() {
  if (!S.user) return Swal.fire({ title: '请先登录', text: '留名后方可投递建议', icon: 'warning', customClass: { popup: 'swal-dark' } });
  const btn = document.getElementById('sugSubmit');
  const content = document.getElementById('sugContent').value.trim();
  if (!content) return;
  btn.disabled = true;
  btn.textContent = '提交中...';
  try {
    await api('POST', '/api/suggestions', { userId: S.user.id, gameName: S.user.gameName, content, date: todayStr() });
    document.getElementById('sugContent').value = '';
    await Swal.fire({ title: '提交成功', text: '感谢你的建议，管理员会认真阅读的！', icon: 'success', customClass: { popup: 'swal-dark' } });
  } catch (e) {
    console.error('提交建议失败:', e);
    Swal.fire({ title: '失败', text: '提交失败，请重试', icon: 'error', customClass: { popup: 'swal-dark' } });
  } finally {
    btn.disabled = false;
    btn.textContent = '提交建议';
  }
}

export async function postNotice() {
  const btn = document.getElementById('noticeSubmit');
  const content = document.getElementById('noticeContent').value.trim();
  if (!content) return;
  btn.disabled = true;
  btn.textContent = '张贴中...';
  try {
    await api('POST', '/api/notices', { adminId: S.user.id, content, date: todayStr() });
    document.getElementById('noticeContent').value = '';
    await Swal.fire({ title: '成功', text: '告示已广而告之', icon: 'success', customClass: { popup: 'swal-dark' } });
    switchMsgTab('notices');
  } catch (e) {
    console.error('发布告示失败:', e);
    Swal.fire({ title: '失败', text: '贴告示失败，请重试', icon: 'error', customClass: { popup: 'swal-dark' } });
  } finally {
    btn.disabled = false;
    btn.textContent = '发布张贴';
  }
}

export async function deleteMsg(e, type, id) {
  e.stopPropagation();
  const confirmed = await Swal.fire({
    title: '确认删除？',
    text: '删除后无法恢复',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    customClass: { popup: 'swal-dark' }
  });
  if (!confirmed.isConfirmed) return;

  try {
    await api('DELETE', `/api/${type}/${id}?adminId=${S.user.id}`);
    await Swal.fire({ title: '成功', text: '删除成功', icon: 'success', customClass: { popup: 'swal-dark' }, timer: 1500, showConfirmButton: false });
    if (type === 'notices') loadNotices();
    if (type === 'suggestions') loadSuggestions();
  } catch (err) {
    console.error('删除失败:', err);
    Swal.fire({ title: '失败', text: '删除失败', icon: 'error', customClass: { popup: 'swal-dark' } });
  }
}

export function openMsgDetail(el, title) {
  const previewEl = el.querySelector('.msg-item-content-preview');
  if (!previewEl) return;
  const content = previewEl.textContent;
  if (!content || content.trim() === '') return;
  const formattedContent = esc(content).replace(/\n/g, '<br>');
  Swal.fire({
    title: title,
    html: `<div style="text-align:left;white-space:pre-wrap;">${formattedContent}</div>`,
    customClass: { popup: 'swal-dark' },
    confirmButtonText: '关闭',
    confirmButtonColor: '#c8a45e'
  });
}

export async function markSuggestionRead(e, suggestionId) {
  e.stopPropagation();
  if (!S.user || !S.user.isAdmin) return;
  try {
    await api('POST', `/api/suggestions/${suggestionId}/read`, { adminId: S.user.id });
    
    // 更新UI状态
    const suggestionEl = document.querySelector(`[data-suggestion-id="${suggestionId}"]`);
    if (suggestionEl) {
      suggestionEl.classList.add('msg-item-read');
      const unreadDot = suggestionEl.querySelector('.msg-unread-dot');
      if (unreadDot) unreadDot.remove();
      const readBtn = suggestionEl.querySelector('.msg-read-btn');
      if (readBtn) readBtn.disabled = true;
    }
    
    // 重新检查未读状态
    await checkUnreadMessages();
  } catch (err) {
    console.error('标记已读失败:', err);
    toast('标记失败');
  }
}

export function openSuggestionDetail(e, suggestionId) {
  e.stopPropagation();
  const el = e.target.closest('.msg-item');
  if (!el) return;
  
  const previewEl = el.querySelector('.msg-item-content-preview');
  if (!previewEl) return;
  const content = previewEl.textContent;
  if (!content || content.trim() === '') return;
  
  const formattedContent = esc(content).replace(/\n/g, '<br>');
  
  Swal.fire({
    title: '建议详情',
    html: `
      <div style="text-align:left;white-space:pre-wrap;">${formattedContent}</div>
      <div style="margin-top:20px;">
        <button id="swalMarkReadBtn" class="swal2-confirm swal2-styled" style="background-color:#c8a45e;">阅</button>
      </div>
    `,
    customClass: { popup: 'swal-dark' },
    showConfirmButton: false,
    showCloseButton: false,
    didOpen: () => {
      const markReadBtn = document.getElementById('swalMarkReadBtn');
      if (markReadBtn) {
        markReadBtn.onclick = async () => {
          if (!S.user || !S.user.isAdmin) return;
          try {
            await api('POST', `/api/suggestions/${suggestionId}/read`, { adminId: S.user.id });
            
            // 更新UI状态
            const suggestionEl = document.querySelector(`[data-suggestion-id="${suggestionId}"]`);
            if (suggestionEl) {
              suggestionEl.classList.add('msg-item-read');
              const unreadDot = suggestionEl.querySelector('.msg-unread-dot');
              if (unreadDot) unreadDot.remove();
            }
            
            // 重新检查未读状态
            await checkUnreadMessages();
            
            Swal.close();
            toast('已标记为已读');
          } catch (err) {
            console.error('标记已读失败:', err);
            toast('标记失败');
          }
        };
      }
    }
  });
}

window.markSuggestionRead = markSuggestionRead;
window.openSuggestionDetail = openSuggestionDetail;
