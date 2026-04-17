/**
 * WebSocket 广播与连接处理
 */
const cache = require('../cache');

let wssInstance = null;

/** 用户对外安全字段（不含密码哈希） */
function safeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

/** 广播消息给所有已连接的 WebSocket 客户端 */
function broadcast(message) {
  if (!wssInstance) return;
  const payload = JSON.stringify(message);
  wssInstance.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
}

/** 初始化 WebSocket：注册连接处理 */
function initWebSocket(wss) {
  wssInstance = wss;
  wss.on('connection', (ws) => {
    const lottery = cache.getLottery();
    ws.send(JSON.stringify({
      type: 'init',
      data: {
        users: cache.getUsers().map(safeUser),
        teams: cache.getTeams(),
        lottery: {
          slots: lottery.slots,
          winners: lottery.winners || [],
          bannerClearedAt: lottery.bannerClearedAt,
          luckyDrawRemaining: Number(lottery.luckyDrawRemaining || 0),
          lastLuckyReset: lottery.lastLuckyReset || null
        }
      }
    }));
    ws.on('error', () => { });
  });
}

module.exports = { initWebSocket, broadcast, safeUser };
