// ====================================================
// 移动端检测与优化配置 + 全局状态
// ====================================================
export const DEVICE = {
  isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
  isSlowNetwork: false
};

if ('connection' in navigator) {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    DEVICE.isSlowNetwork = conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
  }
}

export const MOBILE_CONFIG = {
  pollInterval: DEVICE.isMobile ? 10000 : 5000,
  initialUserLimit: DEVICE.isMobile ? 30 : 100,
  disableAnimations: DEVICE.isSlowNetwork
};

export const S = {
  user: null,
  users: [],
  teams: [],
  date: null,
  ws: null,
  pollTimer: null,
  pendingAction: null,
  pendingJoin: null,
};

export function amIAdmin() { return !!(S.user && S.user.isAdmin); }
