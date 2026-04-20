const cache = require('../cache');
const userDao = require('../dao/userDao');
const lotteryDao = require('../dao/lotteryDao');
const { broadcast, safeUser } = require('../websocket/broadcast');
const { isAdminUser } = require('../utils/password');
const { syncUpdateLotteryToCloud, syncUpdateUserToCloud } = require('../utils/cloudSync');

const SPECIAL_FORTUNE = '吉祥如意';
const SPECIAL_REWARD = 60000;
const CONTRIBUTION_COST_PER_DRAW = 1000;

const FORTUNE_CONFIG = [
  { key: '大凶', minCoins: 100, maxCoins: 150 },
  { key: '中凶', minCoins: 150, maxCoins: 200 },
  { key: '小凶', minCoins: 200, maxCoins: 300 },
  { key: '小吉', minCoins: 300, maxCoins: 400 },
  { key: '吉', minCoins: 400, maxCoins: 550 },
  { key: '中吉', minCoins: 550, maxCoins: 750 },
  { key: '大吉', minCoins: 750, maxCoins: 1000 }
];

const SHOP_ITEMS = [
  { id: 'skin_6', name: '6元皮', price: 60000 },
  { id: 'monthly_card', name: '月卡一张', price: 300000 },
  { id: 'skin_68', name: '战令/68元皮', price: 680000 },
  { id: 'skin_128', name: '128元皮', price: 1280000 },
  { id: 'skin_258', name: '258元皮', price: 2580000 }
];

function getLottery() {
  const lottery = cache.getLottery();
  return {
    fortunes: FORTUNE_CONFIG,
    winners: lottery.winners || [],
    bannerClearedAt: lottery.bannerClearedAt,
    luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0),
    shopItems: SHOP_ITEMS
  };
}

function getShopItems() {
  return SHOP_ITEMS;
}

function getShopItemById(itemId) {
  return SHOP_ITEMS.find(item => item.id === itemId) || null;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildRecord({ user, type, fortune, coins, itemName }) {
  const timestamp = new Date().toISOString();
  if (type === 'exchange') {
    return {
      type,
      gameName: user.gameName,
      prize: itemName,
      itemName,
      costCoins: getShopItemByIdByName(itemName)?.price || 0,
      timestamp
    };
  }

  return {
    type: 'draw',
    gameName: user.gameName,
    prize: `${fortune} · ${coins}钱`,
    fortune,
    coins,
    timestamp
  };
}

function getShopItemByIdByName(name) {
  return SHOP_ITEMS.find(item => item.name === name) || null;
}

function pickFortune(lottery) {
  const normalPool = [...FORTUNE_CONFIG];
  const canHitSpecial = Number(lottery.luckyDrawRemaining || 0) > 0;

  if (canHitSpecial) {
    const roll = Math.random();
    if (roll < 0.02) {
      return { fortune: SPECIAL_FORTUNE, coins: SPECIAL_REWARD, isSpecial: true };
    }
  }

  const picked = normalPool[Math.floor(Math.random() * normalPool.length)];
  return {
    fortune: picked.key,
    coins: randomInt(picked.minCoins, picked.maxCoins),
    isSpecial: false
  };
}

async function syncUserLotteryState(user) {
  syncUpdateUserToCloud(user.id, {
    lotteryCount: user.lotteryCount,
    contributionPoints: user.contributionPoints,
    coins: user.coins,
    totalCoinsEarned: user.totalCoinsEarned
  }).catch(err => {
    console.error(`[抽奖用户同步] 云同步失败: ${err.message}`);
  });
}

async function draw(userId) {
  const users = cache.getUsers();
  const lottery = cache.getLottery();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '请先踏入江湖，方可抽签问天', status: 401 };

  if (!user.lotteryCount) user.lotteryCount = 0;
  if (!user.coins) user.coins = 0;
  if (!user.totalCoinsEarned) user.totalCoinsEarned = 0;
  if (user.lotteryCount <= 0) return { error: '抽签次数不足，请先签到或兑换', status: 403 };

  const oldState = {
    lotteryCount: user.lotteryCount,
    coins: user.coins,
    totalCoinsEarned: user.totalCoinsEarned,
    luckyDrawRemaining: lottery.luckyDrawRemaining,
    winnersLength: lottery.winners.length
  };

  const result = pickFortune(lottery);
  user.lotteryCount -= 1;
  user.coins += result.coins;
  user.totalCoinsEarned += result.coins;
  if (result.isSpecial) {
    lottery.luckyDrawRemaining = Math.max(0, Number(lottery.luckyDrawRemaining || 0) - 1);
  }

  const record = buildRecord({
    user,
    type: 'draw',
    fortune: result.fortune,
    coins: result.coins
  });
  lottery.winners.push(record);

  try {
    await userDao.updateUser(user.id, {
      lottery_count: user.lotteryCount,
      coins: user.coins,
      total_coins_earned: user.totalCoinsEarned
    });
    await lotteryDao.updateLottery({
      winners: JSON.stringify(lottery.winners),
      lucky_draw_remaining: Number(lottery.luckyDrawRemaining || 0)
    });

    syncUserLotteryState(user);
    syncUpdateLotteryToCloud({
      winners: lottery.winners,
      luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0)
    }).catch(err => {
      console.error(`[抽奖奖池同步] 云同步失败: ${err.message}`);
    });

    broadcast({ type: 'user_updated', data: safeUser(user) });
    broadcast({
      type: 'lottery_state_update',
      data: {
        luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0)
      }
    });
    broadcast({ type: 'lottery_winner', data: record });

    return {
      won: true,
      fortune: result.fortune,
      prize: `${result.coins}钱`,
      coins: result.coins,
      remainingCount: user.lotteryCount,
      currentCoins: user.coins,
      luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0),
      message: result.isSpecial
        ? `天命大开！${user.gameName} 抽中「${SPECIAL_FORTUNE}」，获得 ${SPECIAL_REWARD} 钱！`
        : `签落天成！${user.gameName} 抽中「${result.fortune}」，获得 ${result.coins} 钱！`
    };
  } catch (e) {
    user.lotteryCount = oldState.lotteryCount;
    user.coins = oldState.coins;
    user.totalCoinsEarned = oldState.totalCoinsEarned;
    lottery.luckyDrawRemaining = oldState.luckyDrawRemaining;
    lottery.winners.length = oldState.winnersLength;
    console.error('抽签写入数据库失败:', e);
    return { error: '天机混乱，抽签未能落笔，请稍后再试', status: 500 };
  }
}

async function exchangeContributionForDraw(userId, times = 1) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const drawTimes = parseInt(times, 10);
  if (isNaN(drawTimes) || drawTimes <= 0) return { error: '兑换次数必须为正整数', status: 400 };

  if (!user.contributionPoints) user.contributionPoints = 0;
  if (!user.lotteryCount) user.lotteryCount = 0;

  const cost = drawTimes * CONTRIBUTION_COST_PER_DRAW;
  if (user.contributionPoints < cost) {
    return { error: `贡献值不足，兑换${drawTimes}次需要${cost}贡献值`, status: 400 };
  }

  const oldContribution = user.contributionPoints;
  const oldLotteryCount = user.lotteryCount;
  user.contributionPoints -= cost;
  user.lotteryCount += drawTimes;

  try {
    await userDao.updateUser(user.id, {
      contribution_points: user.contributionPoints,
      lottery_count: user.lotteryCount
    });

    syncUserLotteryState(user);
    broadcast({ type: 'user_updated', data: safeUser(user) });

    return {
      ok: true,
      exchangedTimes: drawTimes,
      costContribution: cost,
      remainingContribution: user.contributionPoints,
      lotteryCount: user.lotteryCount,
      message: `兑换成功，获得 ${drawTimes} 次抽签机会`
    };
  } catch (e) {
    user.contributionPoints = oldContribution;
    user.lotteryCount = oldLotteryCount;
    console.error('贡献兑换抽签次数失败:', e);
    return { error: '风云涌动，兑换失败', status: 500 };
  }
}

async function redeemShopItem(userId, itemId) {
  const users = cache.getUsers();
  const lottery = cache.getLottery();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  const item = getShopItemById(itemId);
  if (!item) return { error: '商品不存在', status: 404 };

  if (!user.coins) user.coins = 0;
  if (user.coins < item.price) {
    return { error: `钱余额不足，兑换「${item.name}」需要 ${item.price} 钱`, status: 400 };
  }

  const oldCoins = user.coins;
  const oldWinnersLength = lottery.winners.length;
  user.coins -= item.price;

  const record = buildRecord({ user, type: 'exchange', itemName: item.name });
  lottery.winners.push(record);

  try {
    await userDao.updateUser(user.id, { coins: user.coins });
    await lotteryDao.updateLottery({ winners: JSON.stringify(lottery.winners) });

    syncUserLotteryState(user);
    syncUpdateLotteryToCloud({ winners: lottery.winners }).catch(err => {
      console.error(`[商城兑换同步] 云同步失败: ${err.message}`);
    });

    broadcast({ type: 'user_updated', data: safeUser(user) });
    broadcast({ type: 'lottery_winner', data: record });

    return {
      ok: true,
      item,
      currentCoins: user.coins,
      message: `兑换成功，已兑换「${item.name}」`
    };
  } catch (e) {
    user.coins = oldCoins;
    lottery.winners.length = oldWinnersLength;
    console.error('商城兑换写入数据库失败:', e);
    return { error: '风云涌动，兑换失败', status: 500 };
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

    syncUpdateLotteryToCloud({ bannerClearedAt: lottery.bannerClearedAt }).catch(err => {
      console.error(`[清空轮播] 云同步失败: ${err.message}`);
    });

    broadcast({ type: 'lottery_banner_cleared', data: { clearedAt: lottery.bannerClearedAt } });
    return { ok: true };
  } catch (e) {
    lottery.bannerClearedAt = oldBannerClearedAt;
    console.error('清空轮播失败:', e);
    return { error: '风云涌动，清理失败', status: 500 };
  }
}

async function clearWinners(adminId) {
  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return { error: '非管理员，无此权限', status: 403 };

  const lottery = cache.getLottery();
  const oldWinners = [...lottery.winners];
  const oldBanner = lottery.bannerClearedAt;
  const oldLastClear = lottery.lastClear;

  lottery.winners = [];
  lottery.bannerClearedAt = new Date().toISOString();
  lottery.lastClear = new Date().toISOString();

  try {
    await lotteryDao.updateLottery({
      winners: JSON.stringify(lottery.winners),
      banner_cleared_at: new Date(lottery.bannerClearedAt).toISOString().slice(0, 19).replace('T', ' '),
      last_clear: new Date(lottery.lastClear).toISOString().slice(0, 19).replace('T', ' ')
    });

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
    lottery.winners = oldWinners;
    lottery.bannerClearedAt = oldBanner;
    lottery.lastClear = oldLastClear;
    console.error('清空中奖记录失败:', e);
    return { error: '风云涌动，清空失败', status: 500 };
  }
}

async function setLotteryCount(adminId, targetUserId, count) {
  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (!isAdminUser(admin)) return { error: '非管理员，无此权限', status: 403 };

  const targetUser = users.find(u => u.id === targetUserId);
  if (!targetUser) return { error: '目标用户不存在', status: 404 };

  const setCount = parseInt(count, 10);
  if (isNaN(setCount) || setCount < 0) return { error: '次数必须为非负整数', status: 400 };

  const oldCount = targetUser.lotteryCount || 0;
  targetUser.lotteryCount = setCount;

  try {
    await userDao.updateUser(targetUser.id, { lottery_count: targetUser.lotteryCount });
    syncUserLotteryState(targetUser);
    broadcast({ type: 'user_updated', data: safeUser(targetUser) });
    return { ok: true, gameName: targetUser.gameName, newCount: targetUser.lotteryCount };
  } catch (e) {
    targetUser.lotteryCount = oldCount;
    console.error('设定抽签次数失败:', e);
    return { error: '风云涌动，操作失败', status: 500 };
  }
}

module.exports = {
  CONTRIBUTION_COST_PER_DRAW,
  FORTUNE_CONFIG,
  SPECIAL_FORTUNE,
  SPECIAL_REWARD,
  SHOP_ITEMS,
  getLottery,
  getShopItems,
  draw,
  redeemShopItem,
  exchangeContributionForDraw,
  clearBanner,
  clearWinners,
  setLotteryCount
};
