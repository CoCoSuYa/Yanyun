// ====================================================
// 初始化入口：加载所有模块，绑定全局函数，启动应用
// ====================================================
import { S } from './state.js';
import { todayStr, loadUser, dateRange } from './utils.js';
import { api } from './api.js';
import { connectWS, startPoll } from './websocket.js';
import {
  renderAll, renderDateRow, renderUserList, renderTeams,
  updateMyBadge, forceRenderUserList,
  setSelectDateFn, setHandleCardClickFn, setShowKickPopupFn,
  setCheckPendingJoinFn, setRenderLotteryRecordsFn
} from './render.js';
import {
  selectDate, toggleSidebar, handleMyBadgeClick,
  handleCardClick, showKickPopup, checkPendingJoin,
  doJoin, doLeave, doKick, doDissolve, applyTeamResult,
  handleUserItemClick, setupDateSwipe, doLogout,
  setEditModalFn as teamSetEditModalFn,
  setShowEditTimeModalFn as teamSetShowEditTimeModalFn,
  setAuthFns as teamSetAuthFns
} from './team.js';
import { handleCreateTeam, submitCreate, setAuthFn as createSetAuthFn } from './team-create.js';
import { showIdentityModal, switchAuthTab, submitLogin, submitRegister,
  showEditModal, submitEdit, showEditTimeModal, setOnLoginCallbacks } from './auth.js';
import {
  LOT, initLottery, handleLotteryEntryClick, openLottery, closeLottery,
  handleSpin, updateSpinButton, renderSlotRing, redrawWheel, renderLotteryRecords,
  adminClearBanner, adminClearWinners, submitAddCount, updateWinnerBanner,
  openAddCountModal, closeAddCountModal
} from './lottery.js';
import {
  initSignIn, initSignInFromUserData, updateSignInFloat, doSignIn
} from './signin.js';
import {
  showMsgBox, hideMsgBox, renderMsgTabs, switchMsgTab as _switchMsgTab,
  loadNotices, loadSuggestions, submitSuggestion, postNotice,
  deleteMsg, openMsgDetail, markMsgAsRead,
  checkUnreadMessages, showLatestUnreadNotice,
  msgUnreadState, updateMsgBadge, clearCachedNotices, setCachedNotices,
  setAuthFn as msgSetAuthFn
} from './message-box.js';
import { toggleBgm, nextBgm, initBgm } from './bgm.js';
import { initLazyLoading, setupImageRetry } from './images.js';
import { closeModal, toast as uiToast } from './ui.js';

// ---- 绑定模块间的依赖关系（避免循环 import）----

// render.js 需要的回调函数
setSelectDateFn(selectDate);
setHandleCardClickFn(handleCardClick);
setShowKickPopupFn(showKickPopup);
setCheckPendingJoinFn(checkPendingJoin);
setRenderLotteryRecordsFn(renderLotteryRecords);

// team.js 需要 auth 模块的弹窗函数
teamSetAuthFns({ showIdentityModal });

// team-create.js 需要 auth 模块
createSetAuthFn(showIdentityModal);

// auth.js 需要登录后的回调
setOnLoginCallbacks({
  onInitSignIn: () => { clearCachedNotices(); initSignInFromUserData(); },
  checkUnreadMessages,
  showLatestUnreadNotice,
  checkPendingJoin
});

// message-box.js 需要 auth 模块
msgSetAuthFn(showIdentityModal);

// websocket.js 需要的渲染函数（通过全局引用避免循环）
// 注意：websocket.js 已经直接 import 了需要的函数

// ---- 将需要被 HTML onclick 调用的函数挂载到 window ----
window.toggleSidebar = toggleSidebar;
window.handleMyBadgeClick = handleMyBadgeClick;
window.handleCreateTeam = handleCreateTeam;
window.submitCreate = submitCreate;
window.showIdentityModal = showIdentityModal;
window.switchAuthTab = switchAuthTab;
window.submitLogin = submitLogin;
window.submitRegister = submitRegister;
window.showEditModal = showEditModal;
window.submitEdit = submitEdit;
window.doLogout = doLogout;
window.handleCardClick = handleCardClick; // buildCard 内部用
window.handleSpin = handleSpin;
window.openLottery = openLottery;
window.closeLottery = closeLottery;
window.openAddCountModal = openAddCountModal;
window.closeAddCountModal = closeAddCountModal;
window.submitAddCount = submitAddCount;
window.adminClearBanner = adminClearBanner;
window.adminClearWinners = adminClearWinners;
window.doSignIn = doSignIn;
window.toggleBgm = toggleBgm;
window.nextBgm = nextBgm;
window.handleLotteryEntryClick = handleLotteryEntryClick;
window.showMsgBox = showMsgBox;
window.hideMsgBox = hideMsgBox;
window.switchMsgTab = _switchMsgTab;
window.loadNotices = loadNotices;
window.loadSuggestions = loadSuggestions;
window.submitSuggestion = submitSuggestion;
window.postNotice = postNotice;
window.deleteMsg = deleteMsg;
window.openMsgDetail = openMsgDetail;
window.markMsgAsRead = markMsgAsRead;

// ui.js 的 closeModal 和 toast 也挂载（HTML 内联 onclick 使用）
window.closeModal = closeModal;
window.toast = uiToast;

// ---- 补充 team.js 需要的 auth 模块绑定 ----
teamSetEditModalFn(showEditModal);
teamSetShowEditTimeModalFn(showEditTimeModal);

// ---- 启动应用 ----
async function init() {
  const t0 = performance.now();
  console.log('[性能] init开始');

  // Loading
  const { showLoading, hideLoading } = await import('./api.js');
  showLoading('初始化中...');

  S.date = todayStr();

  // 读取分享链接参数
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam) {
    S.pendingJoin = joinParam;
    history.replaceState({}, '', location.pathname);
  }
  console.log(`[性能] 参数处理完成: ${(performance.now() - t0).toFixed(2)}ms`);

  // 一次性加载核心数据
  const t1 = performance.now();
  try {
    const [us, ts] = await Promise.all([
      api('GET', '/api/users'),
      api('GET', '/api/teams')
    ]);
    console.log(`[性能] API请求完成: ${(performance.now() - t1).toFixed(2)}ms`);

    S.users = us;
    S.teams = ts;

    // 恢复用户状态
    const saved = loadUser();
    if (saved) {
      const found = us.find(u => u.id === saved.id && u.gameName === saved.gameName);
      if (found) S.user = found;
    }
    console.log(`[性能] 数据处理完成: ${(performance.now() - t1).toFixed(2)}ms`);
  } catch (e) {
    console.error('数据加载失败:', e);
  }

  // 渲染核心内容
  const t2 = performance.now();
  updateMyBadge();
  console.log(`[性能] updateMyBadge: ${(performance.now() - t2).toFixed(2)}ms`);

  const t3 = performance.now();
  renderDateRow();
  console.log(`[性能] renderDateRow: ${(performance.now() - t3).toFixed(2)}ms`);

  const t4 = performance.now();
  renderUserList(true);
  console.log(`[性能] renderUserList: ${(performance.now() - t4).toFixed(2)}ms`);

  const t5 = performance.now();
  renderTeams();
  console.log(`[性能] renderTeams: ${(performance.now() - t5).toFixed(2)}ms`);

  setupDateSwipe();
  hideLoading();
  console.log(`[性能] init总耗时: ${(performance.now() - t0).toFixed(2)}ms`);

  // WebSocket 连接
  connectWS();

  setTimeout(() => {
    if (!S.ws || S.ws.readyState !== 1) startPoll();
  }, 1500);

  // 次要功能延迟加载
  setTimeout(() => {
    if (S.user) {
      initSignIn();
      checkUnreadMessages();
      showLatestUnreadNotice();
    }
    initLottery().catch(e => console.warn('抽奖初始化失败:', e));
    initBgm().catch(e => console.warn('BGM初始化失败:', e));
  }, 300);
}

// 启动
init();
