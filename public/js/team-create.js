// ====================================================
// 创建队伍
// ====================================================
import { S } from './state.js';
import { todayStr, isPast, toLocalDTStr, weekday } from './utils.js';
import { api, showLoading, hideLoading } from './api.js';
import { openModal, closeModal, confirm2, toast, showGErr } from './ui.js';

export function handleCreateTeam() {
  if (!S.user) { S.pendingAction = handleCreateTeam; showIdentityModal(); return; }
  showCreateModal();
}

export function showCreateModal() {
  const now = new Date();
  let defDate = S.date;
  if (isPast(defDate)) defDate = todayStr();
  const defHour = String(now.getHours()).padStart(2, '0');
  const defMin = '00';

  openModal('聚义成队', `
<div class="fg">
  <label class="fl">预约人数 <span class="req">*</span></label>
  <select class="fs" id="c-type">
    <option value="五人本">五人本（5人）</option>
    <option value="十人本">十人本（10人）</option>
  </select>
</div>
<div class="fg">
  <label class="fl">打本目的 <span class="req">*</span></label>
  <select class="fs" id="c-purpose">
    <option value="日常">日常</option>
    <option value="天赋">天赋</option>
  </select>
</div>
<div class="fg">
  <label class="fl">打本日期 <span class="req">*</span></label>
  <select class="fs" id="c-date"></select>
</div>
<div class="fg">
  <label class="fl">开本时间 <span class="req">*</span></label>
  <select class="fs" id="c-hour"></select>
</div>
<div class="fh">仅可选择未来 7 天</div>
<div class="global-err" id="c-err"></div>
<div class="fbtns">
  <button class="btn btn-ghost" onclick="closeModal()">拂袖而去</button>
  <button class="btn btn-primary" onclick="submitCreate()">聚义成队</button>
</div>
  `);

  populateDateSelect('c-date', defDate, 7);
  populateHourSelect('c-hour', defHour + ':' + defMin);
}

export async function submitCreate() {
  const type = document.getElementById('c-type').value;
  const purpose = document.getElementById('c-purpose').value;
  const dateVal = document.getElementById('c-date').value;
  const hourVal = document.getElementById('c-hour').value;
  const errEl = document.getElementById('c-err');

  if (!dateVal) return showGErr(errEl, '请选择打本日期');
  if (!hourVal) return showGErr(errEl, '请选择开本时间');
  const dt = new Date(dateVal + 'T' + hourVal);
  if (isNaN(dt.getTime())) return showGErr(errEl, '时间格式错误');
  if (dt <= new Date()) return showGErr(errEl, '往昔不可追，请择他日');

  const localDate = dateVal;

  const existingUnfull = S.teams.filter(t =>
    t.type === type && t.members.length < t.maxSize && !isPast(t.date)
  );

  const doCreate = async () => {
    closeModal();
    showLoading('创建队伍中...');
    try {
      await api('POST', '/api/teams', { type, purpose, time: dt.toISOString(), date: localDate, userId: S.user.id });
      toast('队伍已建，广邀江湖同道！');
    } catch (e) { toast(e.message); }
    finally { hideLoading(); }
  };

  if (existingUnfull.length > 0) {
    confirm2('当前已有同类型未满队伍，确定要另起炉灶吗？', doCreate);
  } else {
    await doCreate();
  }
}

// ---- 下拉框填充工具 ----
export function populateDateSelect(selectId, defaultDate, futureDays) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= futureDays; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = `${d.getMonth() + 1}月${d.getDate()}日 周${weekday(d)}`;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = i === 0 ? `今日 ${label}` : label;
    if (val === defaultDate) opt.selected = true;
    sel.appendChild(opt);
  }
}

export function populateHourSelect(selectId, defaultTime) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '';
  const times = [];
  for (let h = 0; h < 24; h++) {
    times.push(String(h).padStart(2, '0') + ':00');
    times.push(String(h).padStart(2, '0') + ':30');
  }
  times.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === defaultTime) opt.selected = true;
    sel.appendChild(opt);
  });
}

// 延迟引用 auth 模块
let _showIdentityModalFn = null;
export function setAuthFn(fn) { _showIdentityModalFn = fn; }
function showIdentityModal(...args) {
  if (_showIdentityModalFn) return _showIdentityModalFn(...args);
}
