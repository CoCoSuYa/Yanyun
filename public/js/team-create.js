// ====================================================
// 创建队伍
// ====================================================
import { S } from './state.js';
import { todayStr, isPast, toLocalDTStr } from './utils.js';
import { api, showLoading, hideLoading } from './api.js';
import { openModal, closeModal, confirm2, toast, showGErr } from './ui.js';

export function handleCreateTeam() {
  if (!S.user) { S.pendingAction = handleCreateTeam; showIdentityModal(); return; }
  showCreateModal();
}

export function showCreateModal() {
  const now = new Date();
  const min = toLocalDTStr(new Date(now.getTime() + 60000));
  const max = toLocalDTStr(new Date(now.getTime() + 7 * 24 * 3600 * 1000));
  let defDate = S.date;
  if (isPast(defDate)) defDate = todayStr();
  const def = defDate + 'T20:00';

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
  <label class="fl">打本时间 <span class="req">*</span></label>
  <input type="datetime-local" class="fi" id="c-time" value="${def}" min="${min}" max="${max}">
  <div class="fh">仅可选择未来 7 天</div>
</div>
<div class="global-err" id="c-err"></div>
<div class="fbtns">
  <button class="btn btn-ghost" onclick="closeModal()">拂袖而去</button>
  <button class="btn btn-primary" onclick="submitCreate()">聚义成队</button>
</div>
  `);
}

export async function submitCreate() {
  const type = document.getElementById('c-type').value;
  const purpose = document.getElementById('c-purpose').value;
  const timeVal = document.getElementById('c-time').value;
  const errEl = document.getElementById('c-err');

  if (!timeVal) return showGErr(errEl, '请选择打本时间');
  const dt = new Date(timeVal);
  if (dt <= new Date()) return showGErr(errEl, '往昔不可追，请择他日');

  const localDate = timeVal.split('T')[0];

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

// 延迟引用 auth 模块
let _showIdentityModalFn = null;
export function setAuthFn(fn) { _showIdentityModalFn = fn; }
function showIdentityModal(...args) {
  if (_showIdentityModalFn) return _showIdentityModalFn(...args);
}
