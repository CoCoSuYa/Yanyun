/**
 * 抽奖服务
 * 配置/抽签/清空/设定次数
 * 已去除：云同步
 */
const cache = require('../cache');
const userDao = require('../dao/userDao');
const lotteryDao = require('../dao/lotteryDao');
const { broadcast } = require('../websocket/broadcast');
const { isAdminUser } = require('../utils/password');
const { syncUpdateLotteryToCloud } = require('../utils/cloudSync');

function getLottery() {
  const lottery = cache.getLottery();
  return { slots: lottery.slots, winners: lottery.winners || [], bannerClearedAt: lottery.bannerClearedAt };
}

async function updateSlot(adminId, idx, { text, quantity, isWinning }) {
  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return { error: '非管理员，无此权限', status: 403 };

  const lottery = cache.getLottery();
  if (idx < 0 || idx >= lottery.slots.length) return { error: '格子不存在', status: 400 };

  const oldSlot = { ...lottery.slots[idx] };
  if (text !== undefined) lottery.slots[idx].text = String(text).substring(0, 8);
  if (quantity !== undefined) lottery.slots[idx].quantity = parseInt(quantity);
  if (isWinning !== undefined) lottery.slots[idx].isWinning = Boolean(isWinning);

  try {
    await lotteryDao.updateLottery({ slots: JSON.stringify(lottery.slots) });
    
    // 异步同步到云库（不阻塞主流程，失败打印日志）
    syncUpdateLotteryToCloud({ slots: lottery.slots }).catch(err => {
      console.error(`[转盘配置] 云同步失败: ${err.message}`);
    });
    
    broadcast({ type: 'lottery_update', data: { slots: lottery.slots } });
    return { slot: lottery.slots[idx] };
  } catch (e) {
    console.error('更新签诗配置失败:', e);
    lottery.slots[idx] = oldSlot;
    return { error: '风云涌动，改运失败', status: 500 };
  }
}

async function spin(userId) {
  const users = cache.getUsers();
  const lottery = cache.getLottery();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '请先踏入江湖，方可抽签问天', status: 401 };

  if (!user.lotteryCount) user.lotteryCount = 0;
  if (user.lotteryCount <= 0) return { error: '本周抽签次数已用尽，请待周一重置', status: 403 };

  const winIdx = Math.floor(Math.random() * lottery.slots.length);
  const slot = lottery.slots[winIdx];
  user.lotteryCount--;

  // 非中奖格
  if (!slot.isWinning) {
    try {
      await userDao.updateUser(user.id, { lottery_count: user.lotteryCount });
      return {
        slotIndex: winIdx, won: false, prize: slot.text,
        message: '江湖路远，此签未显贵气，游侠且再试一次',
        remainingCount: user.lotteryCount
      };
    } catch (e) {
      user.lotteryCount++;
      return { error: '天机混乱，抽签未能落笔', status: 500 };
    }
  }

  // 中奖格但奖品已空
  if (slot.quantity === 0) {
    try {
      await userDao.updateUser(user.id, { lottery_count: user.lotteryCount });
      return {
        slotIndex: winIdx, won: false, prize: slot.text,
        message: '此签缘分已尽，已被他人捷足先登，来日方长',
        remainingCount: user.lotteryCount
      };
    } catch (e) {
      user.lotteryCount++;
      return { error: '天机混乱，抽签未能落笔', status: 500 };
    }
  }

  // 中奖！扣减数量并记录
  if (slot.quantity > 0) slot.quantity--;

  const winner = {
    gameName: user.gameName,
    prize: slot.text,
    slotIndex: winIdx,
    timestamp: new Date().toISOString()
  };
  lottery.winners.push(winner);

  try {
    await lotteryDao.updateLottery({
      slots: JSON.stringify(lottery.slots),
      winners: JSON.stringify(lottery.winners)
    });
    await userDao.updateUser(user.id, { lottery_count: user.lotteryCount });

    // 异步同步到云库（不阻塞主流程，失败打印日志）
    syncUpdateLotteryToCloud({ 
      slots: lottery.slots, 
      winners: lottery.winners 
    }).catch(err => {
      console.error(`[用户抽奖] 云同步失败: ${err.message}`);
    });

    broadcast({ type: 'lottery_slot_update', data: { slotIndex: winIdx, quantity: slot.quantity } });
    broadcast({ type: 'lottery_winner', data: winner });

    return {
      slotIndex: winIdx, won: true, prize: slot.text,
      message: `签落天成！恭喜 ${user.gameName} 喜得「${slot.text}」！`,
      remainingCount: user.lotteryCount
    };
  } catch (e) {
    if (slot.quantity >= 0) slot.quantity++;
    lottery.winners.pop();
    user.lotteryCount++;
    console.error('抽签写入数据库失败:', e);
    return { error: '天机混乱，抽签未能落笔，请重拾竹片', status: 500 };
  }
}

async function clearBanner(adminId) {
  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return { error: '非管理员，无此权限', status: 403 };

  const lottery = cache.getLottery();
  const oldBannerClearedAt = lottery.bannerClearedAt;
  lottery.bannerClearedAt = new Date().toISOString();

  try {
    await lotteryDao.updateLottery({
      banner_cleared_at: new Date(lottery.bannerClearedAt).toISOString().slice(0, 19).replace('T', ' ')
    });
    
    // 异步同步到云库（不阻塞主流程，失败打印日志）
    syncUpdateLotteryToCloud({ 
      bannerClearedAt: lottery.bannerClearedAt 
    }).catch(err => {
      console.error(`[清空轮播] 云同步失败: ${err.message}`);
    });
    
    broadcast({ type: 'lottery_banner_cleared', data: { clearedAt: lottery.bannerClearedAt } });
    return { ok: true };
  } catch (e) {
    console.error('清空轮播失败:', e);
    lottery.bannerClearedAt = oldBannerClearedAt;
    return { error: '风云涌动，清理失败', status: 500 };
  }
}

async function clearWinners(adminId) {
  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return { error: '非管理员，无此权限', status: 403 };

  const lottery = cache.getLottery();
  const oldWinners = lottery.winners;
  const oldBanner = lottery.bannerClearedAt;
  const oldLastClear = lottery.lastClear;

  lottery.winners = [];
  lottery.bannerClearedAt = new Date().toISOString();
  lottery.lastClear = new Date().toISOString();

  try {
    await lotteryDao.updateLottery({
      winners: JSON.stringify(lottery.winners),
      banner_cleared_at: new Date(lottery.bannerClearedAt).toISOString().slice(0, 19).replace('T', ' '),
      last_clear: new Date(lottery.lastClear).getTime()
    });
    
    // 异步同步到云库（不阻塞主流程，失败打印日志）
    syncUpdateLotteryToCloud({ 
      winners: lottery.winners,
      bannerClearedAt: lottery.bannerClearedAt,
      lastClear: lottery.lastClear
    }).catch(err => {
      console.error(`[清空中奖记录] 云同步失败: ${err.message}`);
    });
    
    broadcast({ type: 'lottery_winners_cleared', data: { bannerClearedAt: lottery.bannerClearedAt } });
    return { ok: true };
  } catch (e) {
    console.error('清空中奖记录失败:', e);
    lottery.winners = oldWinners;
    lottery.bannerClearedAt = oldBanner;
    lottery.lastClear = oldLastClear;
    return { error: '风云涌动，清空失败', status: 500 };
  }
}

async function setLotteryCount(adminId, targetUserId, count) {
  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return { error: '非管理员，无此权限', status: 403 };

  const targetUser = users.find(u => u.id === targetUserId);
  if (!targetUser) return { error: '目标用户不存在', status: 404 };

  const setCount = parseInt(count);
  if (isNaN(setCount) || setCount < 0) return { error: '次数必须为非负整数', status: 400 };

  const oldCount = targetUser.lotteryCount || 0;
  targetUser.lotteryCount = setCount;

  try {
    await userDao.updateUser(targetUser.id, { lottery_count: targetUser.lotteryCount });
    return { ok: true, gameName: targetUser.gameName, newCount: targetUser.lotteryCount };
  } catch (e) {
    console.error('设定抽签次数失败:', e);
    targetUser.lotteryCount = oldCount;
    return { error: '风云涌动，操作失败', status: 500 };
  }
}

module.exports = {
  getLottery,
  updateSlot,
  spin,
  clearBanner,
  clearWinners,
  setLotteryCount
};
