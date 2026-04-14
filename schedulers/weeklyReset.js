/**
 * 周一重置定时任务
 * 每小时检查一次，周一零点重置抽签次数+清空中奖记录
 * 已去除：云同步
 */
const cache = require('../cache');
const userDao = require('../dao/userDao');
const lotteryDao = require('../dao/lotteryDao');
const { broadcast } = require('../websocket/broadcast');

async function checkWeeklyReset() {
  const now = new Date();
  if (now.getDay() !== 1) return;
  const thisMondayMidnight = new Date(now);
  thisMondayMidnight.setHours(0, 0, 0, 0);
  const lottery = cache.getLottery();
  const lastClear = lottery.lastClear ? new Date(lottery.lastClear) : new Date(0);

  if (lastClear < thisMondayMidnight) {
    const oldWinners = lottery.winners;
    const oldLastClear = lottery.lastClear;

    lottery.winners = [];
    lottery.lastClear = now.toISOString();

    try {
      await lotteryDao.updateLottery({
        winners: JSON.stringify(lottery.winners),
        banner_cleared_at: new Date(lottery.lastClear).toISOString().slice(0, 19).replace('T', ' '),
        last_clear: new Date(lottery.lastClear).getTime()
      });

      // 重置所有用户的抽签次数为1次
      const users = cache.getUsers();
      for (const user of users) {
        user.lotteryCount = 1;
        await userDao.updateUser(user.id, { lottery_count: 1 });
      }

      broadcast({ type: 'lottery_winners_cleared' });
      console.log('【周一重置】已自动清空本周中奖记录，并将所有用户抽签次数重置为1次');
    } catch (e) {
      console.error('周一重置数据库记录失败:', e);
      lottery.winners = oldWinners;
      lottery.lastClear = oldLastClear;
    }
  }
}

function startWeeklyReset() {
  checkWeeklyReset();
  setInterval(checkWeeklyReset, 60 * 60 * 1000);
}

module.exports = { startWeeklyReset };
