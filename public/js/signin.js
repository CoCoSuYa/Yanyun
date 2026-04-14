// ====================================================
// 签到功能
// ====================================================
import { S } from './state.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { saveUser } from './utils.js';
import { renderUserList } from './render.js';
import { updateSpinButton } from './lottery.js';

export let signInState = {
  alreadySignedIn: false,
  signInCount: 0
};

export async function initSignIn() {
  if (!S.user) return;
  try {
    const result = await api('GET', `/api/sign-in/status?userId=${S.user.id}`);
    signInState.alreadySignedIn = result.alreadySignedIn;
    signInState.signInCount = result.signInCount;
    updateSignInFloat();
  } catch (e) {
    console.error('获取签到状态失败:', e);
  }
}

export function initSignInFromUserData() {
  if (!S.user) return;
  const today = new Date().toISOString().split('T')[0];
  const lastSignIn = S.user.lastSignInDate ? S.user.lastSignInDate.split('T')[0] : null;
  signInState.alreadySignedIn = lastSignIn === today;
  signInState.signInCount = S.user.signInCount || 0;
  updateSignInFloat();
}

export function updateSignInFloat() {
  const float = document.getElementById('signInFloat');
  const btn = document.getElementById('signInBtn');
  if (!float || !btn) return;

  if (!S.user) { float.style.display = 'none'; return; }

  if (signInState.alreadySignedIn) {
    float.style.display = 'none';
  } else {
    float.style.display = 'block';
    btn.disabled = false;
    btn.querySelector('.sign-in-text').textContent = '每日签到';
  }
}

export async function doSignIn() {
  if (!S.user) { toast('请先登录'); return; }
  if (signInState.alreadySignedIn) { toast('今日已签到'); return; }

  const btn = document.getElementById('signInBtn');
  btn.disabled = true;
  btn.querySelector('.sign-in-text').textContent = '签到中...';

  try {
    const result = await api('POST', '/api/sign-in', { userId: S.user.id });

    signInState.alreadySignedIn = true;
    signInState.signInCount = result.signInCount;
    S.user.lotteryCount = result.lotteryCount;
    S.user.signInCount = result.signInCount;
    S.user.contributionPoints = result.contributionPoints;
    saveUser(S.user);
    const currentUserIndex = S.users.findIndex(u => u.id === S.user.id);
    if (currentUserIndex !== -1) {
      S.users[currentUserIndex] = {
        ...S.users[currentUserIndex],
        signInCount: result.signInCount,
        lotteryCount: result.lotteryCount,
        contributionPoints: result.contributionPoints
      };
    }
    renderUserList();
    updateSpinButton();

    document.getElementById('signInCountDisplay').textContent = result.signInCount;
    document.getElementById('signInSuccessOverlay').style.display = 'flex';

    setTimeout(() => {
      document.getElementById('signInSuccessOverlay').style.display = 'none';
      document.getElementById('signInFloat').style.display = 'none';
    }, 3000);

  } catch (e) {
    if (e.alreadySignedIn) {
      signInState.alreadySignedIn = true;
      updateSignInFloat();
      toast('今日已签到');
    } else {
      toast(e.message || '签到失败');
      btn.disabled = false;
      btn.querySelector('.sign-in-text').textContent = '每日签到';
    }
  }
}
