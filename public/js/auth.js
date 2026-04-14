// ====================================================
// 身份验证：登录 / 注册 / 修改信息
// ====================================================
import { S } from './state.js';
import { api } from './api.js';
import { openModal, closeModal, toast, showGErr, setButtonLoading } from './ui.js';
import { esc, saveUser } from './utils.js';
import { updateMyBadge, renderUserList, forceRenderUserList } from './render.js';

// ---- 修改信息 ----
export function showEditModal() {
  openModal('修改信息', `
<div class="fg">
  <label class="fl">游戏名 <span class="req">*</span></label>
  <input class="fi" id="e-name" value="${esc(S.user.gameName)}" maxlength="20">
</div>
<div class="fg">
  <label class="fl">百业名</label>
  <input class="fi" value="${esc(S.user.guildName)}" disabled style="opacity:.5;cursor:not-allowed;">
  <div class="fh">百业名不可修改</div>
</div>
<div class="fg">
  <label class="fl">主流派 <span class="req">*</span></label>
  <input class="fi" id="e-main" value="${esc(S.user.mainStyle)}" maxlength="2">
</div>
<div class="fg">
  <label class="fl">副流派</label>
  <input class="fi" id="e-sub" value="${esc(S.user.subStyle || '')}" placeholder="选填，最多2个汉字" maxlength="2">
</div>
<div style="border-top:1px solid var(--border);margin:14px 0 12px;"></div>
<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;letter-spacing:.5px;">
  ▸ 修改密码（不改则留空）
</div>
<div class="fg">
  <label class="fl">当前密码</label>
  <input class="fi" id="e-oldpwd" type="password" placeholder="若要改密码请填写当前密码" autocomplete="off">
</div>
<div class="fg">
  <label class="fl">新密码</label>
  <input class="fi" id="e-newpwd" type="password" placeholder="至少6位" autocomplete="new-password">
</div>
<div class="fg">
  <label class="fl">确认新密码</label>
  <input class="fi" id="e-newpwd2" type="password" placeholder="再次输入新密码" autocomplete="new-password">
</div>
<div class="global-err" id="e-err"></div>
<div class="fbtns">
  <button class="btn btn-ghost" onclick="closeModal()">拂袖而去</button>
  <button class="btn btn-primary" onclick="submitEdit()">落笔成册</button>
</div>
  `);
}

export async function submitEdit() {
  const name = document.getElementById('e-name').value.trim();
  const main = document.getElementById('e-main').value.trim();
  const sub = document.getElementById('e-sub').value.trim();
  const oldPwd = document.getElementById('e-oldpwd').value;
  const newPwd = document.getElementById('e-newpwd').value;
  const newPwd2 = document.getElementById('e-newpwd2').value;
  const errEl = document.getElementById('e-err');

  if (!name) return showGErr(errEl, '游戏名不可为空');
  if (!main) return showGErr(errEl, '主流派不可为空');
  if (!/^[\u4e00-\u9fa5]{1,2}$/.test(main)) return showGErr(errEl, '主流派仅允许最多2个中文字符');
  if (sub && !/^[\u4e00-\u9fa5]{1,2}$/.test(sub)) return showGErr(errEl, '副流派仅允许最多2个中文字符');

  if (newPwd) {
    if (!oldPwd) return showGErr(errEl, '请输入当前密码');
    if (newPwd.length < 6) return showGErr(errEl, '新密码不可少于6位');
    if (newPwd !== newPwd2) return showGErr(errEl, '两次密码输入不一致');
  }

  const body = { gameName: name, mainStyle: main, subStyle: sub };
  if (newPwd) { body.oldPassword = oldPwd; body.newPassword = newPwd; }

  try {
    const updated = await api('PUT', `/api/users/${S.user.id}`, body);
    S.user = updated;
    saveUser(updated);
    closeModal();
    updateMyBadge();
    toast(newPwd ? '信息与密码已更新！' : '信息已更新，江湖重塑！');
  } catch (e) { showGErr(errEl, e.message); }
}

// ---- 登录/注册弹窗 ----
export function showIdentityModal(defaultTab) {
  defaultTab = defaultTab || 'login';
  openModal('踏入江湖', `
  <div class="auth-tabs">
  <button class="auth-tab${defaultTab === 'login' ? ' active' : ''}" id="tab-login" onclick="switchAuthTab('login')">登录</button>
  <button class="auth-tab${defaultTab === 'register' ? ' active' : ''}" id="tab-register" onclick="switchAuthTab('register')">注册</button>
</div>

<!-- 登录面板 -->
<div class="auth-panel${defaultTab === 'login' ? ' active' : ''}" id="panel-login">
  <div class="fg">
    <label class="fl">游戏名 <span class="req">*</span></label>
    <input class="fi" id="l-name" placeholder="请输入游戏名" maxlength="20">
  </div>
  <div class="fg">
    <label class="fl">密码 <span class="req">*</span></label>
    <input class="fi" id="l-pwd" type="password" placeholder="请输入密码">
  </div>
  <div class="global-err" id="l-err"></div>
  <div class="fbtns">
    <button class="btn btn-ghost" onclick="closeModal()">拂袖而去</button>
    <button class="btn btn-primary" onclick="submitLogin()">踏入江湖</button>
  </div>
</div>

<!-- 注册面板 -->
<div class="auth-panel${defaultTab === 'register' ? ' active' : ''}" id="panel-register">
  <div class="fg">
    <label class="fl">游戏名 <span class="req">*</span></label>
    <input class="fi" id="r-name" placeholder="请输入游戏名" maxlength="20">
  </div>
  <div class="fg">
    <label class="fl">百业名 <span class="req">*</span></label>
    <input class="fi" id="r-guild" placeholder="仅限「百舸争流」成员">
    <div class="fh">非百舸争流成员无法使用此功能</div>
  </div>
  <div class="fg">
    <label class="fl">主流派 <span class="req">*</span></label>
    <input class="fi" id="r-main" placeholder="最多2个汉字" maxlength="2">
  </div>
  <div class="fg">
    <label class="fl">副流派</label>
    <input class="fi" id="r-sub" placeholder="选填，最多2个汉字" maxlength="2">
  </div>
  <div class="fg">
    <label class="fl">密码 <span class="req">*</span></label>
    <input class="fi" id="r-pwd" type="password" placeholder="至少6位">
  </div>
  <div class="fg">
    <label class="fl">确认密码 <span class="req">*</span></label>
    <input class="fi" id="r-pwd2" type="password" placeholder="再次输入密码">
  </div>
  <div class="global-err" id="r-err"></div>
  <div class="fbtns">
    <button class="btn btn-ghost" onclick="closeModal()">拂袖而去</button>
    <button class="btn btn-primary" onclick="submitRegister()">投名江湖</button>
  </div>
  </div>
  `, false);
}

export function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('panel-login').classList.toggle('active', tab === 'login');
  document.getElementById('panel-register').classList.toggle('active', tab === 'register');
}

export async function submitLogin() {
  const name = document.getElementById('l-name').value.trim();
  const pwd = document.getElementById('l-pwd').value;
  const errEl = document.getElementById('l-err');

  if (!name) return showGErr(errEl, '游戏名不可为空');
  if (!pwd) return showGErr(errEl, '密码不可为空');

  setButtonLoading(document.getElementById('l-name'), true);
  try {
    const user = await api('POST', '/api/auth/login', { gameName: name, password: pwd });
    onLoginSuccess(user);
  } catch (e) {
    showGErr(errEl, e.message);
  } finally {
    setButtonLoading(document.getElementById('l-name'), false);
  }
}

export async function submitRegister() {
  const name = document.getElementById('r-name').value.trim();
  const guild = document.getElementById('r-guild').value.trim();
  const main = document.getElementById('r-main').value.trim();
  const sub = document.getElementById('r-sub').value.trim();
  const pwd = document.getElementById('r-pwd').value;
  const pwd2 = document.getElementById('r-pwd2').value;
  const errEl = document.getElementById('r-err');

  if (!name) return showGErr(errEl, '游戏名不可为空');
  if (!guild) return showGErr(errEl, '百业名不可为空');
  if (guild !== '百舸争流') return showGErr(errEl, '非本百业游侠，暂无法使用此功能');
  if (!main) return showGErr(errEl, '主流派不可为空');
  if (!/^[\u4e00-\u9fa5]{1,2}$/.test(main)) return showGErr(errEl, '主流派仅允许最多2个中文字符');
  if (sub && !/^[\u4e00-\u9fa5]{1,2}$/.test(sub)) return showGErr(errEl, '副流派仅允许最多2个中文字符');
  if (!pwd || pwd.length < 6) return showGErr(errEl, '密码不可少于6位');
  if (pwd !== pwd2) return showGErr(errEl, '两次密码输入不一致');

  setButtonLoading(document.getElementById('r-name'), true);
  try {
    const user = await api('POST', '/api/users', { gameName: name, guildName: guild, mainStyle: main, subStyle: sub, password: pwd });
    onLoginSuccess(user);
  } catch (e) {
    showGErr(errEl, e.message);
  } finally {
    setButtonLoading(document.getElementById('r-name'), false);
  }
}

// 延迟引用其他模块（避免循环依赖）
let _onLoginSuccessFns = null;

export function setOnLoginCallbacks(callbacks) {
  _onLoginSuccessFns = callbacks;
}

function onLoginSuccess(user) {
  S.user = user;
  saveUser(user);
  closeModal();
  updateMyBadge();
  renderUserList();
  toast(`欢迎，${user.gameName}！江湖在望`);
  if (S.pendingAction) {
    const fn = S.pendingAction; S.pendingAction = null;
    fn();
  }
  checkPendingJoin();

  // 触发登录后回调
  if (_onLoginSuccessFns) {
    _onLoginSuccessFns.onInitSignIn?.();
    _onLoginSuccessFns.checkUnreadMessages?.();
    _onLoginSuccessFns.showLatestUnreadNotice?.();
  }
}

function checkPendingJoin() {
  // 通过 init.js 设置的回调调用 team.js 的 checkPendingJoin
  if (_onLoginSuccessFns && _onLoginSuccessFns.checkPendingJoin) {
    _onLoginSuccessFns.checkPendingJoin();
  }
}

// ---- 修改队伍时间弹窗（供 team.js 回调调用）----
export function showEditTimeModal(team) {
  openModal('修改开本时间', `
<div class="fg">
  <label class="fl">当前时间</label>
  <input class="fi" id="e-time-old" value="${team.time}" disabled style="opacity:.5">
</div>
<div class="fg">
  <label class="fl">新时间 <span class="req">*</span></label>
  <input class="fi" id="e-time-new" type="time" value="${team.time}">
</div>
<div class="global-err" id="e-time-err"></div>
<div class="fbtns">
  <button class="btn btn-ghost" onclick="closeModal()">取消</button>
  <button class="btn btn-primary" onclick="submitTeamTimeEdit('${team.id}')">确认修改</button>
</div>
  `);
}

window.submitTeamTimeEdit = async function(teamId) {
  const newTime = document.getElementById('e-time-new').value;
  const errEl = document.getElementById('e-time-err');
  if (!newTime) return showGErr(errEl, '请选择时间');
  try {
    await api('PUT', `/api/teams/${teamId}/time`, { adminId: S.user.id, time: newTime });
    closeModal();
    renderTeams();
    toast('开本时间已更新');
  } catch (e) {
    showGErr(errEl, e.message);
  }
};
