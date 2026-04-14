// ====================================================
// API 封装 + Loading 管理
// ====================================================

export async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || '请求失败');
  return data;
}

let globalLoadingEl = null;
const regionLoadings = new Map();

export function showLoading(message = '加载中...') {
  if (globalLoadingEl) return;
  globalLoadingEl = document.createElement('div');
  globalLoadingEl.className = 'loading-overlay';
  globalLoadingEl.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">${message}</div>
  `;
  document.body.appendChild(globalLoadingEl);
}

export function hideLoading() {
  if (!globalLoadingEl) return;
  globalLoadingEl.classList.add('hiding');
  setTimeout(() => {
    globalLoadingEl?.remove();
    globalLoadingEl = null;
  }, 200);
}

export function showRegionLoading(elementId) {
  const el = document.getElementById(elementId);
  if (!el || regionLoadings.has(elementId)) return;
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-region';
  loadingEl.innerHTML = '<div class="loading-spinner"></div>';
  el.style.position = 'relative';
  el.appendChild(loadingEl);
  regionLoadings.set(elementId, loadingEl);
}

export function hideRegionLoading(elementId) {
  const loadingEl = regionLoadings.get(elementId);
  if (loadingEl) {
    loadingEl.remove();
    regionLoadings.delete(elementId);
  }
}

export function setButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.disabled = true;
    button.classList.add('btn-loading');
  } else {
    button.disabled = false;
    button.classList.remove('btn-loading');
  }
}

export async function apiWithLoading(method, url, body, options = {}) {
  const { showGlobal, showButton, message } = options;
  if (showGlobal) showLoading(message);
  if (showButton) setButtonLoading(showButton, true);
  try {
    const result = await api(method, url, body);
    return result;
  } finally {
    if (showGlobal) hideLoading();
    if (showButton) setButtonLoading(showButton, false);
  }
}
