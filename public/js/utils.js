// ====================================================
// 日期工具 + LocalStorage + HTML转义
// ====================================================

export function todayStr() {
  return localDateStr(new Date());
}

export function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toLocalDTStr(d) {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function dateRange() {
  const arr = [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  for (let i = -7; i <= 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    arr.push(d);
  }
  return arr;
}

export function weekday(d) {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}

export function isPast(ds) { return ds < todayStr(); }
export function isToday(ds) { return ds === todayStr(); }

export function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDateLabel(ds) {
  const d = new Date(ds + 'T00:00:00');
  const m = d.getMonth() + 1, day = d.getDate();
  if (isToday(ds)) return `今日  ${m}月${day}日`;
  return `${m}月${day}日  周${weekday(d)}`;
}

// LocalStorage
export function saveUser(u) { localStorage.setItem('yanyun_user', JSON.stringify(u)); }
export function loadUser() {
  try { return JSON.parse(localStorage.getItem('yanyun_user') || 'null'); }
  catch { return null; }
}

// HTML 转义
export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
