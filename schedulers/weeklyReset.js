/**
 * 周一重置定时任务
 * 每小时检查一次，周一清空中奖记录并补充 2 个吉祥如意名额
 * 不清空用户抽签次数与贡献值
 */
const cache = require('../cache');
const lotteryDao = require('../dao/lotteryDao');
const { syncUpdateLotteryToCloud } = require('../utils/cloudSync');
const { broadcast } = require('../websocket/broadcast');

function toMySQLDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function checkWeeklyReset() {
  const now = new Date();
  if (now.getDay() !== 1) return;

  const thisMondayMidnight = new Date(now);
  thisMondayMidnight.setHours(0, 0, 0, 0);

  const lottery = cache.getLottery();
  const lastClear = lottery.lastClear ? new Date(lottery.lastClear) : new Date(0);

  if (lastClear < thisMondayMidnight) {
    const oldState = {
      winners: [...(lottery.winners || [])],
      lastClear: lottery.lastClear,
      bannerClearedAt: lottery.bannerClearedAt,
      luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0),
      lastLuckyReset: lottery.lastLuckyReset || null
    };

    lottery.winners = [];
    lottery.lastClear = now.toISOString();
    lottery.bannerClearedAt = lottery.lastClear;
    lottery.luckyDrawRemaining = Number(lottery.luckyDrawRemaining || 0) + 2;
    lottery.lastLuckyReset = lottery.lastClear;

    try {
      await lotteryDao.updateLottery({
        winners: JSON.stringify(lottery.winners),
        banner_cleared_at: toMySQLDateTime(new Date(lottery.bannerClearedAt)),
        last_clear: new Date(lottery.lastClear).getTime(),
        lucky_draw_remaining: Number(lottery.luckyDrawRemaining || 0),
        last_lucky_reset: toMySQLDateTime(new Date(lottery.lastLuckyReset))
      });

      syncUpdateLotteryToCloud({
        winners: lottery.winners,
        bannerClearedAt: lottery.bannerClearedAt,
        lastClear: new Date(lottery.lastClear).getTime(),
        luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0),
        lastLuckyReset: lottery.lastLuckyReset
      }).catch(err => {
        console.error('周一重置云同步失败:', err);
      });

      broadcast({
        type: 'lottery_winners_cleared',
        data: { bannerClearedAt: lottery.bannerClearedAt }
      });
      broadcast({
        type: 'lottery_state_update',
        data: {
          luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0),
          lastLuckyReset: lottery.lastLuckyReset
        }
      });
      console.log(`【周一重置】已自动清空本周中奖记录，并补充 2 个吉祥如意名额，当前剩余 ${lottery.luckyDrawRemaining}`);
    } catch (e) {
      console.error('周一重置数据库记录失败:', e);
      lottery.winners = oldState.winners;
      lottery.lastClear = oldState.lastClear;
      lottery.bannerClearedAt = oldState.bannerClearedAt;
      lottery.luckyDrawRemaining = oldState.luckyDrawRemaining;
      lottery.lastLuckyReset = oldState.lastLuckyReset;
    }
  }
}

function startWeeklyReset() {
  checkWeeklyReset();
  setInterval(checkWeeklyReset, 60 * 60 * 1000);
}

module.exports = { startWeeklyReset };
