// ====================================================
// 抽签独立页面入口
// ====================================================
import { api, showLoading, hideLoading } from './api.js';
import { S, amIAdmin } from './state.js';
import { loadUser } from './utils.js';
import {
    LOT, initLottery, updateSpinButton, renderSlotRing, redrawWheel, renderLotteryRecords,
    adminClearBanner, adminClearWinners, submitAddCount, submitAdminAddCount, updateWinnerBanner,
    openAddCountModal, closeAddCountModal, switchLotteryTab,
    exchangeContributionDraw, redeemShopItem, handleSpin
} from './lottery.js';

// 挂载全局函数
window.switchLotteryTab = switchLotteryTab;
window.exchangeContributionDraw = exchangeContributionDraw;
window.redeemShopItem = redeemShopItem;
window.handleSpin = handleSpin;
window.openAddCountModal = openAddCountModal;
window.closeAddCountModal = closeAddCountModal;
window.submitAddCount = submitAddCount;
window.submitAdminAddCount = submitAdminAddCount;
window.adminClearBanner = adminClearBanner;
window.adminClearWinners = adminClearWinners;

// 初始化
async function init() {
    showLoading('加载中...');

    try {
        // 加载用户数据
        const users = await api('GET', '/api/users');
        S.users = users;

        // 恢复用户状态
        const saved = loadUser();
        if (saved) {
            const found = users.find(u => u.id === saved.id && u.gameName === saved.gameName);
            if (found) S.user = found;
        }

        // 如果未登录，跳转回首页
        if (!S.user) {
            window.location.href = '/';
            return;
        }

        // 初始化抽签系统
        await initLottery();

        // 渲染抽签界面
        renderSlotRing();
        switchLotteryTab('draw');

        // 管理员显示管理Tab
        const adminBtn = document.getElementById('lotteryTabAdmin');
        if (adminBtn) adminBtn.style.display = amIAdmin() ? '' : 'none';

        hideLoading();
    } catch (e) {
        console.error('初始化失败:', e);
        hideLoading();
        Swal.fire({
            title: '加载失败',
            text: '请刷新页面重试',
            icon: 'error',
            customClass: { popup: 'swal-dark' }
        });
    }
}

// 启动
init();
