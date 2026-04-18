// ====================================================
// 抽奖系统：摇签 + 商城 + 记录 + Banner
// ====================================================
import { S, amIAdmin } from './state.js';
import { api, showLoading, hideLoading } from './api.js';
import { toast } from './ui.js';
import { esc } from './utils.js';

const FORTUNE_ORDER = ['大凶', '中凶', '小凶', '小吉', '吉', '中吉', '大吉'];
const SPECIAL_FORTUNE = '吉祥如意';
const DEFAULT_EXCHANGE_RATE = 1000;
const SHAKE_STAGE_MS = 1450;
const DROP_STAGE_MS = 900;
const RESULT_STAGE_MS = 420;

export const LOT = {
  fortunes: [],
  winners: [],
  bannerClearedAt: 0,
  luckyDrawRemaining: 0,
  lastLuckyReset: null,
  shopItems: [],
  spinning: false,
  animId: null,
  activeTab: 'draw',
  lastResult: null,
  exchangeRate: DEFAULT_EXCHANGE_RATE,
  soundEnabled: false,
  audioCtx: null,
  shakeCycleId: null,
};

// ---------- 初始化 ----------
export async function initLottery() {
  try {
    const [lotteryData, contributionData] = await Promise.all([
      api('GET', '/api/lottery'),
      S.user ? api('GET', `/api/contribution/${S.user.id}`).catch(() => null) : Promise.resolve(null)
    ]);

    syncLotteryState(lotteryData || {});
    LOT.winners = lotteryData.winners || [];
    LOT.shopItems = lotteryData.shopItems || [];
    if (contributionData && contributionData.exchangeRate) {
      LOT.exchangeRate = contributionData.exchangeRate;
    }

    renderLotteryRecords();
    updateWinnerBanner();
    renderShopList();
    updateSpinButton();
    renderUserLotterySummary();
  } catch (e) {
    /* WS init 补偿 */
  }
}

export function syncLotteryState(data = {}) {
  if (Array.isArray(data.fortunes)) LOT.fortunes = data.fortunes;
  if (Array.isArray(data.shopItems)) LOT.shopItems = data.shopItems;
  if (Array.isArray(data.winners)) LOT.winners = data.winners;
  if (data.bannerClearedAt !== undefined) {
    LOT.bannerClearedAt = data.bannerClearedAt ? new Date(data.bannerClearedAt).getTime() : 0;
  }
  if (data.luckyDrawRemaining !== undefined) {
    LOT.luckyDrawRemaining = Number(data.luckyDrawRemaining || 0);
  }
  if (data.lastLuckyReset !== undefined) {
    LOT.lastLuckyReset = data.lastLuckyReset || null;
  }

  renderFortuneTable();
  renderLuckyRemaining();
  renderUserLotterySummary();
}

// ---------- 页面入口 ----------
export function openLotteryPage() {
  window.location.href = '/?view=lottery';
}

// ---------- 弹窗开关 ----------
export function openLottery() {
  const overlay = document.getElementById('lotteryOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderLotteryShell();
  switchLotteryTab(LOT.activeTab || 'draw');
  renderLotteryRecords();
  renderShopList();
  renderFortuneTable();
  renderLuckyRemaining();
  renderUserLotterySummary();
  updateSpinButton();

  const adminBtn = document.getElementById('lotteryTabAdmin');
  if (adminBtn) adminBtn.style.display = amIAdmin() ? '' : 'none';

  const addCountBtn = document.getElementById('addCountBtn');
  if (addCountBtn) addCountBtn.style.display = 'none';
}

export function closeLottery() {
  const overlay = document.getElementById('lotteryOverlay');
  if (overlay) overlay.style.display = 'none';
  if (LOT.animId) {
    clearTimeout(LOT.animId);
    LOT.animId = null;
  }
  if (LOT.shakeCycleId) {
    clearInterval(LOT.shakeCycleId);
    LOT.shakeCycleId = null;
  }
  LOT.spinning = false;
}

export function updateSpinButton() {
  const btn = document.getElementById('spinBtn');
  if (!btn) return;

  if (LOT.spinning) {
    btn.textContent = '摇签中…';
    btn.disabled = true;
    return;
  }

  if (!S.user) {
    btn.textContent = '求签问天';
    btn.disabled = false;
    return;
  }

  const count = Number(S.user.lotteryCount || 0);
  btn.textContent = `求签问天（剩余${count}次）`;
  btn.disabled = count <= 0;
}

// ---------- 设定抽签次数弹窗 ----------
export function openAddCountModal() {
  if (!amIAdmin()) {
    toast('非管理员，无此权限');
    return;
  }

  const select = document.getElementById('targetUserSelect');
  if (!select) return;
  select.innerHTML = '<option value="">请选择用户</option>';
  S.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.gameName} (当前${u.lotteryCount || 0}次)`;
    select.appendChild(opt);
  });

  const countInput = document.getElementById('addCountInput');
  if (countInput) countInput.value = '';
  const overlay = document.getElementById('addCountOverlay');
  if (overlay) overlay.style.display = 'flex';
}

export function closeAddCountModal() {
  const overlay = document.getElementById('addCountOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ---------- 主界面渲染 ----------
function renderLotteryShell() {
  const root = document.getElementById('lotteryContent');
  if (!root) return;

  root.innerHTML = `
    <div class="lottery-topbar lottery-topbar-compact">
      <div class="lottery-stat-card">
        <span class="lottery-stat-label">我的钱袋</span>
        <strong class="lottery-stat-main" id="lotteryCoinBalance">0 钱</strong>
      </div>
      <div class="lottery-stat-card">
        <span class="lottery-stat-label">抽签次数</span>
        <strong class="lottery-stat-main" id="lotteryCountValue">0</strong>
      </div>
      <div class="lottery-stat-card">
        <span class="lottery-stat-label">贡献值</span>
        <strong class="lottery-stat-main" id="lotteryContributionValue">0</strong>
      </div>
    </div>
    <button id="exchangeDrawBtn" class="btn btn-ghost lottery-exchange-btn" onclick="exchangeContributionDraw()">使用1000贡献兑换1次抽签</button>

    <div class="lottery-tabs">
      <button id="lotteryTabDraw" class="lottery-tab-btn" onclick="switchLotteryTab('draw')">摇签</button>
      <button id="lotteryTabShop" class="lottery-tab-btn" onclick="switchLotteryTab('shop')">商城</button>
      <button id="lotteryTabAdmin" class="lottery-tab-btn" style="display:none" onclick="switchLotteryTab('admin')">管理</button>
    </div>

    <div id="lotteryDrawPanel" class="lottery-tab-panel">
      <div class="draw-layout">
        <div class="draw-main-card">
          <div class="draw-scene" id="drawScene">
            <div class="draw-scene-glow"></div>
            <div class="draw-lucky-badge">吉祥如意剩余 <span id="luckyRemainInline">0</span></div>
            <div class="draw-stick-shadow" id="drawStickShadow"></div>
            <div class="draw-stick" id="drawStick">
              <div class="draw-stick-top"></div>
              <div class="draw-stick-body"></div>
              <div class="draw-stick-bottom"></div>
            </div>
            <div class="fortune-jar-wrap">
              <div class="fortune-jar-coins"></div>
              <div class="fortune-jar" id="fortuneJar">
                <div class="fortune-jar-mouth"></div>
                <div class="fortune-jar-sticks">
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
                <div class="fortune-jar-body"></div>
                <div class="fortune-jar-base"></div>
              </div>
            </div>
            <div class="draw-stage-text" id="drawStageText">静心凝神，摇签问天</div>
          </div>
          <div id="lotteryResult" class="lottery-result lottery-result-empty">求签之前，先静心片刻</div>
          <button id="spinBtn" class="btn btn-primary lottery-spin-btn" onclick="handleSpin()">求签问天</button>
        </div>

        <div class="draw-side-card">
          <div class="draw-card-title">本周得道者</div>
          <div class="records-section records-section-plain" id="recordsSection">
            <div class="records-hd">
              <span class="records-title">⚔ 本周得道者</span>
              <div class="records-actions">
                <button id="clearBannerBtnInner" class="btn btn-ghost records-mini-btn" style="display:none" onclick="adminClearBanner()">清空轮播</button>
                <button id="clearRecordsBtn" class="btn btn-ghost records-mini-btn" style="display:none" onclick="adminClearWinners()">清空记录</button>
              </div>
            </div>
            <div id="recordsList"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="lotteryShopPanel" class="lottery-tab-panel" style="display:none">
      <div class="shop-layout">
        <div class="shop-summary-card">
          <div class="shop-summary-title">钱庄兑换</div>
          <div class="shop-summary-desc">兑换结果将进入统一轮播与中奖记录，便于全服同步展示。</div>
          <div class="shop-summary-highlight">当前余额：<span id="shopCoinBalance">0 钱</span></div>
        </div>
        <div id="shopItemList" class="shop-item-list"></div>
      </div>
    </div>

    <div id="lotteryAdminPanel" class="lottery-tab-panel" style="display:none">
      <div class="admin-layout">
        <div class="admin-card">
          <div class="admin-card-title">设定抽签次数</div>
          <div class="admin-card-desc">为指定用户设定抽签次数（覆盖当前值）</div>
          <div class="admin-form-body">
            <div class="form-group">
              <label for="adminUserSelect">选择用户：</label>
              <select id="adminUserSelect" class="form-select">
                <option value="">请选择用户</option>
              </select>
            </div>
            <div class="form-group">
              <label for="adminCountInput">设定次数：</label>
              <input type="number" id="adminCountInput" class="form-input" min="0" placeholder="请输入次数" />
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="submitAdminAddCount()">提交</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const clearBannerBtnInner = document.getElementById('clearBannerBtnInner');
  if (clearBannerBtnInner) clearBannerBtnInner.style.display = amIAdmin() ? '' : 'none';
  const clearRecordsBtn = document.getElementById('clearRecordsBtn');
  if (clearRecordsBtn) clearRecordsBtn.style.display = amIAdmin() ? '' : 'none';
  const adminTab = document.getElementById('lotteryTabAdmin');
  if (adminTab) adminTab.style.display = amIAdmin() ? '' : 'none';
  const addCountBtn = document.getElementById('addCountBtn');
  if (addCountBtn) addCountBtn.style.display = amIAdmin() ? '' : 'none';
}

export function switchLotteryTab(tab) {
  LOT.activeTab = ['shop', 'admin'].includes(tab) ? tab : 'draw';

  const drawPanel = document.getElementById('lotteryDrawPanel');
  const shopPanel = document.getElementById('lotteryShopPanel');
  const adminPanel = document.getElementById('lotteryAdminPanel');
  const drawBtn = document.getElementById('lotteryTabDraw');
  const shopBtn = document.getElementById('lotteryTabShop');
  const adminBtn = document.getElementById('lotteryTabAdmin');

  if (drawPanel) drawPanel.style.display = LOT.activeTab === 'draw' ? 'block' : 'none';
  if (shopPanel) shopPanel.style.display = LOT.activeTab === 'shop' ? 'block' : 'none';
  if (adminPanel) adminPanel.style.display = LOT.activeTab === 'admin' ? 'block' : 'none';
  if (drawBtn) drawBtn.classList.toggle('active', LOT.activeTab === 'draw');
  if (shopBtn) shopBtn.classList.toggle('active', LOT.activeTab === 'shop');
  if (adminBtn) adminBtn.classList.toggle('active', LOT.activeTab === 'admin');

  if (LOT.activeTab === 'admin') {
    populateAdminUserSelect();
  }

  renderUserLotterySummary();
  renderFortuneTable();
  renderLuckyRemaining();
  renderShopList();
  renderLotteryRecords();
  updateSpinButton();
}

function renderFortuneTable() {
  const el = document.getElementById('fortuneTable');
  if (!el) return;

  const items = Array.isArray(LOT.fortunes) && LOT.fortunes.length
    ? LOT.fortunes
    : FORTUNE_ORDER.map((key, index) => ({
      key,
      minCoins: [100, 150, 200, 300, 400, 550, 750][index],
      maxCoins: [150, 200, 300, 400, 550, 750, 1000][index]
    }));

  const rows = items.map(item => `
    <div class="fortune-row ${fortuneToneClass(item.key)}">
      <span class="fortune-name">${esc(item.key)}</span>
    </div>
  `).join('');

  el.innerHTML = rows + `
    <div class="fortune-row fortune-special">
      <span class="fortune-name">${SPECIAL_FORTUNE}</span>
    </div>
  `;
}

function renderLuckyRemaining() {
  const ids = ['luckyRemainInline', 'luckyRemainBadge'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(Number(LOT.luckyDrawRemaining || 0));
  });
}

function renderUserLotterySummary() {
  const coinBalance = Number(S.user?.coins || 0);
  const lotteryCount = Number(S.user?.lotteryCount || 0);
  const contributionPoints = Number(S.user?.contributionPoints || 0);

  const balanceEls = ['lotteryCoinBalance', 'shopCoinBalance'];
  balanceEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${coinBalance} 钱`;
  });

  const countEl = document.getElementById('lotteryCountValue');
  if (countEl) countEl.textContent = String(lotteryCount);

  const contributionEl = document.getElementById('lotteryContributionValue');
  if (contributionEl) contributionEl.textContent = String(contributionPoints);

  const exchangeBtn = document.getElementById('exchangeDrawBtn');
  if (exchangeBtn) {
    exchangeBtn.disabled = !S.user || contributionPoints < LOT.exchangeRate;
    exchangeBtn.textContent = `${LOT.exchangeRate}贡献换1签`;
  }
}

function renderShopList() {
  const el = document.getElementById('shopItemList');
  if (!el) return;

  if (!LOT.shopItems.length) {
    el.innerHTML = '<div class="records-empty">商城尚未开张</div>';
    return;
  }

  const currentCoins = Number(S.user?.coins || 0);
  el.innerHTML = LOT.shopItems.map(item => {
    const affordable = currentCoins >= Number(item.price || 0);
    return `
      <div class="shop-item-card ${affordable ? 'affordable' : 'locked'}">
        <div class="shop-item-main">
          <div class="shop-item-name">${esc(item.name)}</div>
          <div class="shop-item-price">${Number(item.price)} 钱</div>
        </div>
        <button class="btn ${affordable ? 'btn-primary' : 'btn-ghost'} shop-redeem-btn"
          onclick="redeemShopItem('${esc(item.id)}')" ${S.user ? '' : 'disabled'}>
          ${affordable ? '立即兑换' : '钱数不足'}
        </button>
      </div>
    `;
  }).join('');
}

// ---------- 占位兼容函数 ----------
export function renderSlotRing() {
  renderLotteryShell();
  renderFortuneTable();
  renderLuckyRemaining();
}

export function redrawWheel() {
  renderLotteryShell();
  switchLotteryTab(LOT.activeTab || 'draw');
}

// ---------- 抽奖逻辑 ----------
export async function handleSpin() {
  if (LOT.spinning) return;
  if (!S.user) {
    toast('请先踏入江湖，方可抽签问天');
    return;
  }

  const count = Number(S.user.lotteryCount || 0);
  if (count <= 0) {
    toast('抽签次数不足，请先签到或用贡献值兑换');
    return;
  }

  LOT.spinning = true;
  LOT.lastResult = null;
  updateSpinButton();
  setDrawSceneState('shaking', '签筒摇动，天意未明…');
  setLotteryResult('摇签之中，且听天命', 'pending');
  unlockAudio();
  playShakeLoop();

  let pendingResult = null;
  let apiError = null;

  LOT.animId = setTimeout(async () => {
    try {
      pendingResult = await api('POST', '/api/lottery/spin', { userId: S.user.id });
    } catch (e) {
      apiError = e.message || '抽签失败';
    }
  }, 80);

  setTimeout(() => {
    setDrawSceneState('dropping', '灵签坠落，静待签文');
    playResultSound(pendingResult);
  }, SHAKE_STAGE_MS);

  setTimeout(() => {
    LOT.spinning = false;
    if (apiError) {
      setDrawSceneState('', '天机混乱，请稍后再试');
      setLotteryResult(apiError, 'lost');
      updateSpinButton();
      return;
    }

    if (!pendingResult) {
      setDrawSceneState('', '签意未至，请稍候重试');
      setLotteryResult('签文未能落定，请稍后再试', 'lost');
      updateSpinButton();
      return;
    }

    LOT.lastResult = pendingResult;
    applySpinResultToUser(pendingResult);
    syncLotteryState({ luckyDrawRemaining: pendingResult.luckyDrawRemaining });
    showSpinResult(pendingResult);
  }, SHAKE_STAGE_MS + DROP_STAGE_MS + RESULT_STAGE_MS);
}

function applySpinResultToUser(result) {
  if (!S.user) return;

  if (result.remainingCount !== undefined) S.user.lotteryCount = result.remainingCount;
  if (result.currentCoins !== undefined) S.user.coins = result.currentCoins;
  if (result.coins !== undefined) {
    S.user.totalCoinsEarned = Number(S.user.totalCoinsEarned || 0) + Number(result.coins || 0);
  }

  const userInList = S.users.find(u => u.id === S.user.id);
  if (userInList) {
    if (result.remainingCount !== undefined) userInList.lotteryCount = result.remainingCount;
    if (result.currentCoins !== undefined) userInList.coins = result.currentCoins;
    if (S.user.totalCoinsEarned !== undefined) userInList.totalCoinsEarned = S.user.totalCoinsEarned;
  }

  syncAdminUserOptions();
}

function showSpinResult(result) {
  const isSpecial = result.fortune === SPECIAL_FORTUNE;
  const tone = isSpecial ? 'special' : fortuneToneClass(result.fortune);
  setDrawSceneState(isSpecial ? 'special' : 'revealed', '');
  setLotteryResult(`
    <div class="result-fortune ${tone}">${esc(result.fortune || '签文')}</div>
    <div class="result-desc">${esc(result.message || '')}</div>
  `, isSpecial ? 'special' : 'won', true);
  renderUserLotterySummary();
  updateSpinButton();
  renderShopList();
  renderLotteryRecords();
  if (isSpecial) updateWinnerBanner();
}

function setLotteryResult(content, type = '', isHTML = false) {
  const el = document.getElementById('lotteryResult');
  if (!el) return;
  el.className = `lottery-result ${type ? `lottery-result-${type}` : ''}`.trim();
  if (isHTML) el.innerHTML = content;
  else el.textContent = content;
}

function setDrawSceneState(stateClass = '', text = '') {
  const scene = document.getElementById('drawScene');
  const jar = document.getElementById('fortuneJar');
  const stick = document.getElementById('drawStick');
  const stageText = document.getElementById('drawStageText');

  if (scene) scene.className = `draw-scene ${stateClass}`.trim();
  if (jar) jar.className = `fortune-jar ${stateClass}`.trim();
  if (stick) stick.className = `draw-stick ${stateClass}`.trim();
  if (stageText) stageText.textContent = text || '静心凝神，摇签问天';
}

// ---------- 贡献值兑换 / 商城兑换 ----------
export async function exchangeContributionDraw() {
  if (!S.user) {
    toast('请先登录后再兑换');
    return;
  }

  showLoading('兑换中...');
  try {
    const result = await api('POST', '/api/lottery/exchange', { userId: S.user.id, times: 1 });
    S.user.contributionPoints = Number(result.remainingContribution || 0);
    S.user.lotteryCount = Number(result.lotteryCount || 0);

    const userInList = S.users.find(u => u.id === S.user.id);
    if (userInList) {
      userInList.contributionPoints = S.user.contributionPoints;
      userInList.lotteryCount = S.user.lotteryCount;
    }

    syncAdminUserOptions();
    renderUserLotterySummary();
    updateSpinButton();
    toast(result.message || '兑换成功');
  } catch (e) {
    toast(e.message || '兑换失败');
  } finally {
    hideLoading();
  }
}

export async function redeemShopItem(itemId) {
  if (!S.user) {
    toast('请先登录后再兑换');
    return;
  }

  const item = LOT.shopItems.find(v => v.id === itemId);
  if (!item) {
    toast('商品不存在');
    return;
  }

  showLoading('兑换中...');
  try {
    const result = await api('POST', '/api/lottery/redeem', { userId: S.user.id, itemId });
    if (result.currentCoins !== undefined) S.user.coins = Number(result.currentCoins || 0);

    const userInList = S.users.find(u => u.id === S.user.id);
    if (userInList) userInList.coins = Number(S.user.coins || 0);

    renderUserLotterySummary();
    renderShopList();
    renderLotteryRecords();
    updateWinnerBanner();
    toast(result.message || `已兑换${item.name}`);
  } catch (e) {
    toast(e.message || '兑换失败');
  } finally {
    hideLoading();
  }
}

function syncAdminUserOptions() {
  const select = document.getElementById('targetUserSelect');
  if (!select) return;
  S.users.forEach(u => {
    const opt = Array.from(select.options).find(o => o.value === u.id);
    if (opt) opt.textContent = `${u.gameName} (当前${u.lotteryCount || 0}次)`;
  });
}

function populateAdminUserSelect() {
  const select = document.getElementById('adminUserSelect');
  if (!select) return;
  select.innerHTML = '<option value="">请选择用户</option>';
  S.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.gameName} (当前${u.lotteryCount || 0}次)`;
    select.appendChild(opt);
  });
  const countInput = document.getElementById('adminCountInput');
  if (countInput) countInput.value = '';
}

export async function submitAdminAddCount() {
  const targetUserId = document.getElementById('adminUserSelect')?.value;
  const count = parseInt(document.getElementById('adminCountInput')?.value, 10);

  if (!targetUserId) {
    toast('请选择用户');
    return;
  }
  if (isNaN(count) || count < 0) {
    toast('请输入有效的次数');
    return;
  }

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
    populateAdminUserSelect();
    renderUserLotterySummary();
    updateSpinButton();
  } catch (e) {
    toast(e.message || '操作失败');
  } finally {
    hideLoading();
  }
}

// ---------- 中奖记录渲染 ----------
export function renderLotteryRecords() {
  const list = document.getElementById('recordsList');
  const clearBtn = document.getElementById('clearRecordsBtn');
  const clearBannerBtn = document.getElementById('clearBannerBtnInner');
  if (!list) return;

  const isAdmin = amIAdmin();
  if (clearBtn) clearBtn.style.display = isAdmin ? '' : 'none';
  if (clearBannerBtn) clearBannerBtn.style.display = isAdmin ? '' : 'none';

  if (!LOT.winners.length) {
    list.innerHTML = '<div class="records-empty">尚无得道者，江湖等待奇缘</div>';
    return;
  }

  const rows = [...LOT.winners].reverse().map(w => {
    const d = new Date(w.timestamp);
    const time = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const typeLabel = w.type === 'exchange' ? '兑换' : '求签';
    return `<tr>
      <td>${esc(w.gameName)}</td>
      <td>${esc(typeLabel)}</td>
      <td>${esc(w.prize)}</td>
      <td style="color:var(--text-muted)">${time}</td>
    </tr>`;
  }).join('');

  list.innerHTML = `<table class="records-table">
    <thead><tr><th>游侠</th><th>类型</th><th>所得</th><th>时辰</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---------- 管理员操作 ----------
export async function adminClearBanner() {
  if (!amIAdmin()) return;
  try {
    await api('POST', '/api/lottery/clear-banner', { adminId: S.user.id });
    toast('轮播已清空');
  } catch (e) {
    toast(e.message);
  }
}

export async function adminClearWinners() {
  if (!amIAdmin()) return;
  try {
    await api('POST', '/api/lottery/clear-winners', { adminId: S.user.id });
    toast('中奖记录已清空，江湖焕然一新');
  } catch (e) {
    toast(e.message);
  }
}

export async function submitAddCount() {
  const targetUserId = document.getElementById('targetUserSelect')?.value;
  const count = parseInt(document.getElementById('addCountInput')?.value, 10);

  if (!targetUserId) {
    toast('请选择用户');
    return;
  }
  if (isNaN(count) || count < 0) {
    toast('请输入有效的次数');
    return;
  }

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
    syncAdminUserOptions();
    renderUserLotterySummary();
    updateSpinButton();
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
  const recent = (LOT.winners || []).filter(w => {
    const isBannerWorthy = w.type === 'exchange' || w.fortune === SPECIAL_FORTUNE;
    return isBannerWorthy && new Date(w.timestamp).getTime() > cutoff;
  });

  if (!recent.length) {
    banner.style.display = 'none';
    track.style.animation = 'none';
    track.dataset.content = '';
    return;
  }

  const content = recent.map(w => {
    const prefix = w.type === 'exchange' ? '钱庄兑得' : '喜得';
    return `${esc(w.gameName)} ${prefix}「${esc(w.prize)}」`;
  }).join('　　⚔　　');

  if (track.dataset.content === content && banner.style.display !== 'none') return;

  track.dataset.content = content;
  track.innerHTML = content;

  const dur = Math.min(Math.max(content.length * 0.18, 8), 25);
  track.style.animation = 'none';
  track.offsetWidth;
  track.style.animation = `bannerMarquee ${dur}s linear infinite`;
  banner.style.display = 'flex';
}

// ---------- 音效 ----------
function unlockAudio() {
  if (LOT.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    LOT.audioCtx = LOT.audioCtx || new AudioCtx();
    LOT.soundEnabled = true;
  } catch {
    LOT.soundEnabled = false;
  }
}

function playShakeLoop() {
  if (!LOT.audioCtx) return;
  if (LOT.shakeCycleId) clearInterval(LOT.shakeCycleId);
  const ctx = LOT.audioCtx;
  let tick = 0;
  const totalTicks = Math.floor(SHAKE_STAGE_MS / 120);
  function shakeTick() {
    tick++;
    const intensity = Math.min(tick / 6, 1);
    playWoodKnock(ctx, 0.03 * intensity);
    if (Math.random() < 0.4) playBambooClatter(ctx, 0.02 * intensity);
  }
  shakeTick();
  LOT.shakeCycleId = setInterval(shakeTick, 100 + Math.random() * 40);
  setTimeout(() => {
    if (LOT.shakeCycleId) { clearInterval(LOT.shakeCycleId); LOT.shakeCycleId = null; }
    playWoodKnock(ctx, 0.06);
  }, SHAKE_STAGE_MS);
}

function playResultSound(result) {
  if (!LOT.audioCtx) return;
  const ctx = LOT.audioCtx;
  const fortune = result?.fortune || '';
  if (fortune === SPECIAL_FORTUNE) {
    playChime(ctx, [523, 659, 784, 1047], 0.35, 0.12);
    setTimeout(() => playChime(ctx, [587, 740, 880, 1175], 0.3, 0.10), 250);
    setTimeout(() => playBell(ctx, 1318, 0.8, 0.08), 500);
    return;
  }
  if (fortune === '大吉' || fortune === '中吉') {
    playChime(ctx, [523, 659, 784], 0.25, 0.08);
    setTimeout(() => playBell(ctx, 1047, 0.4, 0.06), 200);
    return;
  }
  if (fortune === '吉' || fortune === '小吉') {
    playChime(ctx, [440, 523, 659], 0.2, 0.06);
    return;
  }
  playWoodBlock(ctx, 260, 0.15, 0.04);
  setTimeout(() => playWoodBlock(ctx, 220, 0.2, 0.03), 120);
}

function playWoodKnock(ctx, vol) {
  const now = ctx.currentTime;
  const bufSize = ctx.sampleRate * 0.03;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 800 + Math.random() * 400; bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start(now); src.stop(now + 0.08);
}

function playBambooClatter(ctx, vol) {
  const now = ctx.currentTime;
  const freq = 1800 + Math.random() * 1200;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.025);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.04);
}

function playChime(ctx, freqs, duration, vol) {
  const now = ctx.currentTime;
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    const g = ctx.createGain();
    const t = now + i * 0.06;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol * (1 - i * 0.15), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + duration + 0.05);
  });
}

function playBell(ctx, freq, duration, vol) {
  const now = ctx.currentTime;
  [1, 2.4, 3.0, 4.5].forEach((partial, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * partial;
    const g = ctx.createGain();
    const pVol = vol / (i + 1);
    g.gain.setValueAtTime(pVol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration / (i + 1));
    osc.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + duration + 0.05);
  });
}

function playWoodBlock(ctx, freq, duration, vol) {
  const now = ctx.currentTime;
  const bufSize = ctx.sampleRate * 0.05;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = Math.sin(2 * Math.PI * freq * i / ctx.sampleRate) * Math.exp(-i / (bufSize * 0.2));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(g); g.connect(ctx.destination);
  src.start(now); src.stop(now + duration + 0.05);
}

function playTone(freq, duration = 0.08, type = 'sine', gainValue = 0.05) {
  if (!LOT.audioCtx) return;
  const ctx = LOT.audioCtx;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function fortuneToneClass(fortune) {
  switch (fortune) {
    case '大凶': return 'tone-bad';
    case '中凶': return 'tone-bad';
    case '小凶': return 'tone-low';
    case '小吉': return 'tone-good';
    case '吉': return 'tone-good';
    case '中吉': return 'tone-great';
    case '大吉': return 'tone-great';
    case SPECIAL_FORTUNE: return 'tone-special';
    default: return '';
  }
}

window.switchLotteryTab = switchLotteryTab;
window.exchangeContributionDraw = exchangeContributionDraw;
window.redeemShopItem = redeemShopItem;
window.openLotteryPage = openLotteryPage;
window.submitAdminAddCount = submitAdminAddCount;

setInterval(updateWinnerBanner, 60000);
