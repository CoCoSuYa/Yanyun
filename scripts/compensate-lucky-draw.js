/**
 * 补签脚本：为本周补充 2 个吉祥如意名额
 * 用法：node scripts/compensate-lucky-draw.js
 * 
 * 原因：weeklyReset.js 中 last_clear 字段使用了 .getTime() 存储数字时间戳到 TIMESTAMP 列，
 * 导致 MySQL 存储异常，周一重置判断失败，本周吉祥如意名额未补充。
 * 该 bug 已修复（改用 toMySQLDateTime 格式化），此脚本用于补偿本周缺失的名额。
 */
const path = require('path');
const fs = require('fs');

// 加载环境变量
; (function loadEnvLocal() {
    try {
        const f = path.join(__dirname, '..', '.env.local');
        if (!fs.existsSync(f)) return;
        fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        });
    } catch { }
})();

const cache = require('../cache');
const lotteryDao = require('../dao/lotteryDao');
const { syncUpdateLotteryToCloud } = require('../utils/cloudSync');

function toMySQLDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function compensate() {
    try {
        await cache.loadData();
        const lottery = cache.getLottery();

        const before = Number(lottery.luckyDrawRemaining || 0);
        lottery.luckyDrawRemaining = before + 2;
        lottery.lastLuckyReset = new Date().toISOString();

        await lotteryDao.updateLottery({
            lucky_draw_remaining: lottery.luckyDrawRemaining,
            last_lucky_reset: toMySQLDateTime(new Date(lottery.lastLuckyReset))
        });

        syncUpdateLotteryToCloud({
            luckyDrawRemaining: lottery.luckyDrawRemaining,
            lastLuckyReset: lottery.lastLuckyReset
        }).catch(err => {
            console.error('云同步失败:', err);
        });

        console.log(`✅ 补签成功！吉祥如意名额：${before} → ${lottery.luckyDrawRemaining}`);
        process.exit(0);
    } catch (e) {
        console.error('❌ 补签失败:', e);
        process.exit(1);
    }
}

compensate();
