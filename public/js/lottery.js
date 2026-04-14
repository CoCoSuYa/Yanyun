// ====================================================
// 抽奖系统：状态 + 渲染 + 动画 + 管理员编辑 + Banner
// ====================================================
import { S, amIAdmin } from './state.js';
import { api, showLoading, hideLoading } from './api.js';
import { openModal, closeModal, toast } from './ui.js';
import { esc } from './utils.js';

export const LOT = {
  slots: [],
  winners: [],
  bannerClearedAt: 0,
  currentPos: 0,
  spinning: false,
  animId: null,
};

const SLOT_POS = [
  { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 },
  { r: 2, c: 6 }, { r: 3, c: 6 },
  { r: 4, c: 6 }, { r: 4, c: 5 }, { r: 4, c: 4 }, { r: 4, c: 3 }, { r: 4, c: 2 }, { r: 4, c: 1 },
  { r: 3, c: 1 }, { r: 2, c: 1 },
];

// ---------- 初始化 ----------
export async function initLottery() {
  try {
    const data = await api('GET', '/api/lottery');
    LOT.slots = data.slots || [];
    LOT.winners = data.winners || [];
    LOT.bannerClearedAt = data.bannerClearedAt ? new Date(data.bannerClearedAt).getTime() : 0;
    updateWinnerBanner();
  } catch (e) { /* WS init 补偿 */ }
}

// ---------- 浮标入口 ----------
let _lotteryEntryExpanded = false;

function _collapseLotteryEntry() {
  const el = document.getElementById('lotteryEntry');
  clearTimeout(el._timer);
  el.classList.remove('visible');
  _lotteryEntryExpanded = false;
}

export function showLotteryEntryBriefly() {
  if (_lotteryEntryExpanded) return;
  const el = document.getElementById('lotteryEntry');
  _lotteryEntryExpanded = true;
  el.classList.add('visible');
  el._timer = setTimeout(_collapseLotteryEntry, 2500);
}

export function handleLotteryEntryClick() {
  const el = document.getElementById('lotteryEntry');
  clearTimeout(el._timer);
  if (!_lotteryEntryExpanded) {
    _lotteryEntryExpanded = true;
    el.classList.add('visible');
    el._timer = setTimeout(_collapseLotteryEntry, 3000);
  } else {
    _collapseLotteryEntry();
    openLottery();
  }
}

// ---------- 弹窗开关 ----------
export function openLottery() {
  document.getElementById('lotteryOverlay').style.display = 'flex';
  document.getElementById('lotteryResult').style.display = 'none';
  renderSlotRing();
  renderLotteryRecords();
  updateSpinButton();

  const addCountBtn = document.getElementById('addCountBtn');
  if (addCountBtn) {
    addCountBtn.style.display = amIAdmin() ? 'block' : 'none';
  }
}

export function updateSpinButton() {
  const btn = document.getElementById('spinBtn');
  if (!btn) return;

  if (!S.user) {
    btn.textContent = '求签问天';
    btn.disabled = false;
    return;
  }

  const count = S.user.lotteryCount || 0;
  btn.textContent = `求签问天（剩余${count}次）`;
  btn.disabled = count <= 0;
}

export function closeLottery() {
  document.getElementById('lotteryOverlay').style.display = 'none';
  if (LOT.animId) { clearTimeout(LOT.animId); LOT.animId = null; }
}

// ---------- 设定抽签次数弹窗 ----------
export function openAddCountModal() {
  if (!amIAdmin()) { toast('非管理员，无此权限'); return; }

  const select = document.getElementById('targetUserSelect');
  select.innerHTML = '<option value="">请选择用户</option>';
  S.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.gameName} (当前${u.lotteryCount || 0}次)`;
    select.appendChild(opt);
  });

  document.getElementById('addCountInput').value = '';
  document.getElementById('addCountOverlay').style.display = 'flex';
}

export function closeAddCountModal() {
  document.getElementById('addCountOverlay').style.display = 'none';
}

// ---------- 方格轨道渲染 ----------
function slotCellHTML(slot, i, isAdmin) {
  const isEmpty = slot.quantity === 0;
  const badge = (isAdmin && slot.isWinning) ? '<div class="slot-win-badge">★</div>' : '';
  const qty = (slot.isWinning && slot.quantity >= 0) ? `<div class="slot-cell-qty">×${slot.quantity}</div>` : '';
  return badge + `<div class="slot-cell-text">${esc(slot.text || '谢谢参与')}</div>` + qty;
}

export function renderSlotRing() {
  const wrap = document.getElementById('slotRingWrap');
  if (!wrap) return;
  const isAdmin = amIAdmin();

  wrap.querySelectorAll('.slot-cell').forEach(el => el.remove());
  const center = document.getElementById('slotCenter');

  (LOT.slots.length ? LOT.slots : Array(16).fill({ text: '谢谢参与', quantity: -1, isWinning: false }))
    .forEach((slot, i) => {
      const pos = SLOT_POS[i];
      const cell = document.createElement('div');
      cell.className = [
        'slot-cell',
        slot.quantity === 0 ? 'empty' : '',
        i === LOT.currentPos ? 'active' : '',
        (isAdmin && !LOT.spinning) ? 'admin-editable' : '',
      ].filter(Boolean).join(' ');
      cell.dataset.idx = i;
      cell.style.gridRow = pos.r;
      cell.style.gridColumn = pos.c;
      cell.innerHTML = slotCellHTML(slot, i, isAdmin);
      if (isAdmin && !LOT.spinning) cell.onclick = () => adminEditSlot(i);
      wrap.insertBefore(cell, center);
    });

  const hint = document.getElementById('adminWheelHint');
  if (hint) hint.style.display = isAdmin ? 'block' : 'none';

  const btn = document.getElementById('spinBtn');
  if (btn && !LOT.spinning) btn.disabled = false;
}

// 轻量刷新（WS 推送时调用）
export function redrawWheel() {
  const wrap = document.getElementById('slotRingWrap');
  if (!wrap) return;
  const isAdmin = amIAdmin();
  wrap.querySelectorAll('.slot-cell[data-idx]').forEach(cell => {
    const i = parseInt(cell.dataset.idx);
    const slot = LOT.slots[i];
    if (!slot) return;
    cell.className = [
      'slot-cell',
      slot.quantity === 0 ? 'empty' : '',
      i === LOT.currentPos ? 'active' : '',
      (isAdmin && !LOT.spinning) ? 'admin-editable' : '',
    ].filter(Boolean).join(' ');
    cell.innerHTML = slotCellHTML(slot, i, isAdmin);
    cell.onclick = (isAdmin && !LOT.spinning) ? () => adminEditSlot(i) : null;
  });
}

// ---------- 跑格动画 ----------
function animateSlotRun(startPos, targetPos, n, onDone) {
  const stepsToTarget = ((targetPos - startPos) % n + n) % n || n;
  const positions = [];
  for (let i = 0; i <= stepsToTarget; i++) positions.push((startPos + i) % n);

  let step = 0;
  function tick() {
    highlightCell(positions[step]);
    LOT.currentPos = positions[step];
    step++;
    if (step >= positions.length) { LOT.animId = null; onDone(); return; }

    const progress = step / positions.length;
    const delay = 45 + (260 - 45) * Math.pow(progress, 2.2);
    LOT.animId = setTimeout(tick, delay);
  }
  tick();
}

function highlightCell(idx) {
  document.querySelectorAll('#slotRingWrap .slot-cell[data-idx]').forEach(cell => {
    if (parseInt(cell.dataset.idx) === idx) cell.classList.add('active');
    else cell.classList.remove('active');
  });
}

// ---------- 抽奖逻辑 ----------
export async function handleSpin() {
  if (LOT.spinning) return;
  if (!S.user) { toast('请先踏入江湖，方可抽签问天'); return; }

  const count = S.user.lotteryCount || 0;
  if (count <= 0) {
    toast('本周抽签次数已用尽，请待周一重置');
    return;
  }

  LOT.spinning = true;
  const btn = document.getElementById('spinBtn');
  btn.disabled = true; btn.textContent = '签途漫漫…';
  document.getElementById('lotteryResult').style.display = 'none';
  document.querySelectorAll('.slot-cell').forEach(el => {
    el.classList.remove('admin-editable'); el.onclick = null;
  });

  const n = LOT.slots.length || 16;
  const MIN_FAST_LAPS = 1;
  let fastSteps = 0;
  let pendingResult = null;
  let apiError = null;

  function fastTick() {
    LOT.currentPos = (LOT.currentPos + 1) % n;
    highlightCell(LOT.currentPos);
    fastSteps++;

    const doneMinLaps = fastSteps >= MIN_FAST_LAPS * n;

    if (doneMinLaps && apiError) {
      LOT.spinning = false;
      updateSpinButton();
      renderSlotRing();
      toast(apiError);
      return;
    }

    if (doneMinLaps && pendingResult) {
      animateSlotRun(LOT.currentPos, pendingResult.slotIndex, n, () => {
        showSpinResult(pendingResult);
      });
      return;
    }

    LOT.animId = setTimeout(fastTick, 45);
  }

  fastTick();

  // 同时发出 API 请求
  try {
    pendingResult = await api('POST', '/api/lottery/spin', { userId: S.user.id });
  } catch (e) {
    apiError = e.message;
  }
}

function showSpinResult(result) {
  const btn = document.getElementById('spinBtn');
  LOT.currentPos = result.slotIndex;
  LOT.spinning = false;

  if (S.user && result.remainingCount !== undefined) {
    S.user.lotteryCount = result.remainingCount;
    const userInList = S.users.find(u => u.id === S.user.id);
    if (userInList) {
      userInList.lotteryCount = result.remainingCount;
    }
    const select = document.getElementById('targetUserSelect');
    if (select) {
      S.users.forEach(u => {
        const opt = Array.from(select.options).find(o => o.value === u.id);
        if (opt) opt.textContent = `${u.gameName} (当前${u.lotteryCount || 0}次)`;
      });
    }
  }

  updateSpinButton();

  const el = document.getElementById('lotteryResult');
  el.style.display = 'block';
  el.className = 'lottery-result ' + (result.won ? 'won' : 'lost');
  el.textContent = result.message;

  if (result.won && LOT.slots[result.slotIndex]) {
    const q = LOT.slots[result.slotIndex].quantity;
    if (q > 0) LOT.slots[result.slotIndex].quantity = q - 1;
  }
  renderSlotRing();
  updateWinnerBanner();
  renderLotteryRecords();
}

// ---------- 管理员编辑格子 ----------
function adminEditSlot(slotIdx) {
  if (LOT.spinning) return;
  const slot = LOT.slots[slotIdx];
  if (!slot) return;
  const qty = slot.quantity;
  const isWinning = !!slot.isWinning;
  let qtyOpts = `<option value="-1"${qty === -1 ? ' selected' : ''}>无限</option>`;
  for (let i = 0; i <= 10; i++) {
    qtyOpts += `<option value="${i}"${qty === i ? ' selected' : ''}>${i === 0 ? '0（已空）' : i}</option>`;
  }
  openModal('编辑签文', `
<div class="fg">
  <label class="fl">签文内容 <span class="req">*</span></label>
  <input class="fi" id="slotText" value="${esc(slot.text || '')}" maxlength="8" placeholder="最多8字">
</div>
<div class="fg">
  <label class="fl" style="display:flex;align-items:center;gap:8px;cursor:pointer">
    <input type="checkbox" id="slotIsWinning" ${isWinning ? 'checked' : ''}
      style="width:16px;height:16px;accent-color:var(--gold);cursor:pointer"
      onchange="document.getElementById('slotQtyRow').style.display=this.checked?'':'none'">
    <span>此格为中奖格 ★</span>
  </label>
  <div class="fh">勾选后抽中此格将触发恭喜提示及顶部播报</div>
</div>
<div class="fg" id="slotQtyRow" style="${isWinning ? '' : 'display:none'}">
  <label class="fl">剩余数量</label>
  <select class="fs" id="slotQty">${qtyOpts}</select>
  <div class="fh">选"无限"则不限制抽取次数</div>
</div>
<div class="fbtns">
  <button class="btn btn-ghost" onclick="closeModal()">取消</button>
  <button class="btn btn-primary" onclick="submitSlotEdit(${slotIdx})">落笔成册</button>
</div>
  `);
}

window.submitSlotEdit = async function(slotIdx) {
  const text = document.getElementById('slotText').value.trim();
  const isWinning = document.getElementById('slotIsWinning').checked;
  const qtyEl = document.getElementById('slotQty');
  const qty = qtyEl ? parseInt(qtyEl.value) : -1;
  if (!text) { toast('签文不可为空'); return; }
  try {
    const updated = await api('PUT', `/api/lottery/slots/${slotIdx}`, { adminId: S.user.id, text, quantity: qty, isWinning });
    if (LOT.slots[slotIdx] !== undefined) LOT.slots[slotIdx] = updated;
    closeModal();
    renderSlotRing();
    toast('签文已落定');
  } catch (e) { toast(e.message); }
};

// ---------- 中奖记录渲染 ----------
export function renderLotteryRecords() {
  const list = document.getElementById('recordsList');
  const clearBtn = document.getElementById('clearRecordsBtn');
  if (!list) return;

  const isAdmin = amIAdmin();
  if (clearBtn) clearBtn.style.display = isAdmin ? '' : 'none';

  if (!LOT.winners.length) {
    list.innerHTML = '<div class="records-empty">尚无得道者，江湖等待奇缘</div>';
    return;
  }

  const rows = [...LOT.winners].reverse().map(w => {
    const d = new Date(w.timestamp);
    const time = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<tr>
  <td>${esc(w.gameName)}</td>
  <td>${esc(w.prize)}</td>
  <td style="color:var(--text-muted)">${time}</td>
:</tr>`;
  }).join('');

  list.innerHTML = `<table class="records-table">
<thead><tr><th>游侠</th><th>所得</th><th>时辰</th></tr></thead>
<tbody>${rows}</tbody>
  </table>`;
}

// ---------- 管理员操作 ----------
export async function adminClearBanner() {
  if (!amIAdmin()) return;
  try {
    await api('POST', '/api/lottery/clear-banner', { adminId: S.user.id });
    toast('轮播已清空');
  } catch (e) { toast(e.message); }
}

export async function adminClearWinners() {
  if (!amIAdmin()) return;
  try {
    await api('POST', '/api/lottery/clear-winners', { adminId: S.user.id });
    toast('中奖记录已清空，江湖焕然一新');
  } catch (e) { toast(e.message); }
}

export async function submitAddCount() {
  const targetUserId = document.getElementById('targetUserSelect').value;
  const count = parseInt(document.getElementById('addCountInput').value);

  if (!targetUserId) { toast('请选择用户'); return; }
  if (isNaN(count) || count < 0) { toast('请输入有效的次数'); return; }

  showLoading('设定中...');
  try {
    const result = await api('POST', '/api/lottery/add-count', {
      adminId: S.user.id,
      targetUserId,
      count
    });
    toast(`已将 ${result.gameName} 的抽签次数设定为 ${result.newCount} 次`);

    const targetUser = S.users.find(u => u.id === targetUserId);
    if (targetUser) targetUser.lotteryCount = result.newCount;
    if (S.user && S.user.id === targetUserId) S.user.lotteryCount = result.newCount;
    updateSpinButton();

    const select = document.getElementById('targetUserSelect');
    if (select) {
      S.users.forEach(u => {
        const opt = Array.from(select.options).find(o => o.value === u.id);
        if (opt) opt.textContent = `${u.gameName} (当前${u.lotteryCount || 0}次)`;
      });
    }

    closeAddCountModal();
  } catch (e) {
    toast(e.message || '操作失败');
  } finally {
    hideLoading();
  }
}

// ---------- 中奖 Banner ----------
export function updateWinnerBanner() {
  const banner = document.getElementById('winnerBanner');
  const track = document.getElementById('bannerTrack');
  if (!banner || !track) return;

  const oneHourAgo = Date.now() - 3600 * 1000;
  const clearedAt = LOT.bannerClearedAt || 0;
  const cutoff = Math.max(oneHourAgo, clearedAt);
  const recent = (LOT.winners || []).filter(w => new Date(w.timestamp).getTime() > cutoff);

  if (!recent.length) {
    banner.style.display = 'none';
    track.style.animation = 'none';
    track.dataset.content = '';
    return;
  }

  const content = recent.map(w => `${esc(w.gameName)} 喜得「${esc(w.prize)}」`).join('　　⚔　　');

  if (track.dataset.content === content && banner.style.display !== 'none') return;

  track.dataset.content = content;
  track.innerHTML = content;

  const dur = Math.min(Math.max(content.length * 0.18, 8), 25);

  track.style.animation = 'none';
  track.offsetWidth;
  track.style.animation = `bannerMarquee ${dur}s linear infinite`;

  banner.style.display = 'flex';
}

setInterval(updateWinnerBanner, 60000);
