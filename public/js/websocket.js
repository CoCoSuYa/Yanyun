// ====================================================
// WebSocket 连接 / 消息分发 / 轮询
// ====================================================
import { S, MOBILE_CONFIG } from './state.js';
import { api } from './api.js';
import { renderAll } from './render.js';
import { redrawWheel, updateWinnerBanner, renderLotteryRecords, LOT } from './lottery.js';

export function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    S.ws = new WebSocket(`${proto}//${location.host}`);
    S.ws.onopen = () => { clearPoll(); };
    S.ws.onmessage = e => onWSMsg(JSON.parse(e.data));
    S.ws.onclose = S.ws.onerror = () => { S.ws = null; startPoll(); };
  } catch { startPoll(); }
}

export function startPoll() {
  if (S.pollTimer) return;
  S.pollTimer = setInterval(async () => {
    try {
      const [us, ts] = await Promise.all([api('GET', '/api/users'), api('GET', '/api/teams')]);
      S.users = us; S.teams = ts; renderAll();
    } catch { }
  }, MOBILE_CONFIG.pollInterval);
}

export function clearPoll() { if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } }

function onWSMsg(msg) {
  switch (msg.type) {
    case 'init':
      S.users = msg.data.users; S.teams = msg.data.teams; renderAll();
      if (msg.data.lottery) {
        LOT.slots = msg.data.lottery.slots || [];
        LOT.winners = msg.data.lottery.winners || [];
        LOT.bannerClearedAt = msg.data.lottery.bannerClearedAt
          ? new Date(msg.data.lottery.bannerClearedAt).getTime() : 0;
        redrawWheel(); updateWinnerBanner();
      }
      break;
    case 'user_joined':
      if (!S.users.find(u => u.id === msg.data.id)) { S.users.push(msg.data); renderUserList(); }
      break;
    case 'user_updated': {
      const ui = S.users.findIndex(u => u.id === msg.data.id);
      if (ui !== -1) S.users[ui] = msg.data;
      if (S.user && S.user.id === msg.data.id) { S.user = msg.data; saveUser(msg.data); updateMyBadge(); }
      renderUserList();
      break;
    }
    case 'user_deleted': {
      S.users = S.users.filter(u => u.id !== msg.data.id);
      renderUserList();
      if (S.user && S.user.id === msg.data.id) {
        S.user = null;
        localStorage.removeItem('yanyun_user');
        updateMyBadge();
        toast(`您已被管理员移除江湖`);
      }
      break;
    }
    case 'team_created':
      if (!S.teams.find(t => t.id === msg.data.id)) { S.teams.push(msg.data); renderTeams(); }
      break;
    case 'team_updated': {
      const i = S.teams.findIndex(t => t.id === msg.data.id);
      if (i !== -1) S.teams[i] = msg.data; else S.teams.push(msg.data);
      renderTeams(); break;
    }
    case 'team_deleted':
      S.teams = S.teams.filter(t => t.id !== msg.data.id); renderTeams(); break;
    case 'lottery_update':
      LOT.slots = msg.data.slots || [];
      redrawWheel(); break;
    case 'lottery_slot_update':
      if (LOT.slots[msg.data.slotIndex] !== undefined)
        LOT.slots[msg.data.slotIndex].quantity = msg.data.quantity;
      redrawWheel(); break;
    case 'lottery_winner':
      LOT.winners.push(msg.data);
      if (!LOT.spinning) { updateWinnerBanner(); renderLotteryRecords(); }
      break;
    case 'lottery_banner_cleared': {
      LOT.bannerClearedAt = new Date(msg.data.clearedAt).getTime();
      const bt = document.getElementById('bannerTrack');
      if (bt) { bt.style.animation = 'none'; bt.dataset.content = ''; }
      document.getElementById('winnerBanner').style.display = 'none';
      break;
    }
    case 'lottery_winners_cleared':
      LOT.winners = [];
      LOT.bannerClearedAt = msg.data && msg.data.bannerClearedAt
        ? new Date(msg.data.bannerClearedAt).getTime() : Date.now();
      {
        const bt = document.getElementById('bannerTrack');
        if (bt) { bt.style.animation = 'none'; bt.dataset.content = ''; }
      }
      document.getElementById('winnerBanner').style.display = 'none';
      renderLotteryRecords(); break;
  }
}
