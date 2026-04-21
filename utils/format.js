/**
 * 格式化工具函数
 * 集中管理 snake_case→camelCase 转换、日期格式化等
 */

// ---------- 日期工具 ----------

/** ISO 8601 → MySQL DATETIME (YYYY-MM-DD HH:MM:SS) */
function toMySQLDateTime(isoString) {
  if (!isoString) return null;
  return isoString.replace('T', ' ').replace('Z', '').substring(0, 19);
}

/** 当前日期字符串 YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 格式化打本时间为可读字符串 YYYY-MM-DD HH:MM */
function formatTeamTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 生成古风日期标题（如：二〇二六年四月十五日） */
function toChineseDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const chineseNumbers = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  const yearStr = year.toString().split('').map(digit => chineseNumbers[parseInt(digit)]).join('');

  let monthStr = '';
  if (month === 10) monthStr = '十';
  else if (month === 11) monthStr = '十一';
  else if (month === 12) monthStr = '十二';
  else monthStr = chineseNumbers[month];

  let dayStr = '';
  if (day < 10) {
    dayStr = chineseNumbers[day];
  } else if (day === 10) {
    dayStr = '初十';
  } else if (day < 20) {
    dayStr = '十' + chineseNumbers[day - 10];
  } else if (day === 20) {
    dayStr = '二十';
  } else if (day < 30) {
    dayStr = '廿' + chineseNumbers[day - 20];
  } else if (day === 30) {
    dayStr = '三十';
  } else {
    dayStr = '卅' + chineseNumbers[day - 30];
  }

  return `${yearStr}年${monthStr}月${dayStr}日`;
}

// ---------- 数据格式转换（MySQL row → 内存对象） ----------

/** 解析 JSON 字段（兼容 string/object） */
function parseJSON(value, fallback) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value || fallback;
}

/** MySQL users row → 内存 user 对象（不含云相关字段） */
function toCamelCaseUser(u) {
  return {
    id: u.id,
    gameName: u.game_name,
    guildName: u.guild_name,
    mainStyle: u.main_style,
    subStyle: u.sub_style,
    passwordHash: u.password_hash,
    avatarUrl: u.avatar_url,
    isAdmin: !!u.is_admin,
    signInCount: u.sign_in_count,
    lastSignInDate: u.last_sign_in_date,
    lotteryCount: u.lottery_count,
    coins: Number(u.coins || 0),
    totalCoinsEarned: Number(u.total_coins_earned || 0),
    readNoticeIds: parseJSON(u.read_notice_ids, []),
    readSuggestionIds: parseJSON(u.read_suggestion_ids, []),
    juejinHighScore: u.juejin_high_score,
    juejinCompleted: !!u.juejin_completed,
    achievements: parseJSON(u.achievements, []),
    contributionPoints: u.contribution_points,
    consecutiveSignIns: u.consecutive_sign_ins,
    juejinLastPlayed: u.juejin_last_played || null
  };
}

/** MySQL teams row → 内存 team 对象 */
function toCamelCaseTeam(t) {
  let timeValue = t.time;
  if (timeValue && /^\d{2}:\d{2}:\d{2}$/.test(timeValue) && t.date) {
    timeValue = `${t.date}T${timeValue}.000Z`;
  }
  return {
    id: t.id,
    type: t.type,
    purpose: t.purpose,
    date: t.date,
    time: timeValue,
    leaderId: t.leader_id,
    members: parseJSON(t.members, []),
    maxSize: t.max_size || 10,
    fullNotified: !!t.full_notified,
    remindSent: !!t.remind_sent,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

/** MySQL notices row → 内存 notice 对象 */
function toCamelCaseNotice(n) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    authorId: n.author_id,
    createdAt: n.created_at
  };
}

/** MySQL suggestions row → 内存 suggestion 对象 */
function toCamelCaseSuggestion(s) {
  return {
    id: s.id,
    content: s.content,
    authorId: s.author_id,
    createdAt: s.created_at
  };
}

/** MySQL lottery row → 内存 lottery 对象 */
function toLotteryObject(mysqlLottery) {
  return mysqlLottery ? {
    slots: parseJSON(mysqlLottery.slots, []),
    winners: parseJSON(mysqlLottery.winners, []),
    bannerClearedAt: mysqlLottery.banner_cleared_at,
    lastClear: mysqlLottery.last_clear ? new Date(Number(mysqlLottery.last_clear)).toISOString() : null,
    luckyDrawRemaining: Number(mysqlLottery.lucky_draw_remaining || 0),
    lastLuckyReset: mysqlLottery.last_lucky_reset || null
  } : {
    slots: [],
    winners: [],
    bannerClearedAt: new Date(0).toISOString(),
    lastClear: null,
    luckyDrawRemaining: 2,
    lastLuckyReset: null
  };
}

module.exports = {
  toMySQLDateTime,
  todayStr,
  formatTeamTime,
  toChineseDate,
  parseJSON,
  toCamelCaseUser,
  toCamelCaseTeam,
  toCamelCaseNotice,
  toCamelCaseSuggestion,
  toLotteryObject
};
