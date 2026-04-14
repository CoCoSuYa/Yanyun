// ====================================================
// UI 组件：Modal / Popup / Confirm / Toast / 全局错误提示
// ====================================================

let _modal = null;
let _modalCloseOnOverlay = true;

export function openModal(title, body, closeOnOverlay = true) {
  closeModal();
  _modalCloseOnOverlay = closeOnOverlay;
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.id = '_ov';
  ov.innerHTML = `<div class="modal"><div class="modal-title">${title}</div>${body}</div>`;
  if (closeOnOverlay) {
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
  }
  document.body.appendChild(ov);
  _modal = ov;
  return ov.querySelector('.modal');
}

export function closeModal() { _modal?.remove(); _modal = null; }

let _popup = null;
let _popupHandler = null;

export function showPopup(e, actions) {
  closePopup();
  const p = document.createElement('div');
  p.className = 'popup';
  actions.forEach(({ label, danger, fn, isInfo }) => {
    const b = document.createElement('button');
    b.className = `pop-btn${danger ? ' pop-danger' : ''}${isInfo ? ' pop-info' : ''}`;
    b.textContent = label;
    if (fn) {
      b.onclick = ev => { ev.stopPropagation(); closePopup(); fn(); };
    } else {
      b.style.cursor = 'default';
      b.style.opacity = '0.8';
    }
    p.appendChild(b);
  });
  document.body.appendChild(p);
  _popup = p;

  const x = e.clientX, y = e.clientY;
  p.style.cssText = `top:${y}px;left:${x}px`;
  requestAnimationFrame(() => {
    const r = p.getBoundingClientRect();
    if (r.right > innerWidth - 8) p.style.left = (x - r.width) + 'px';
    if (r.bottom > innerHeight - 8) p.style.top = (y - r.height) + 'px';
  });

  _popupHandler = () => closePopup();
  setTimeout(() => { if (_popup) document.addEventListener('click', _popupHandler); }, 0);
}

export function closePopup() {
  if (_popupHandler) {
    document.removeEventListener('click', _popupHandler);
    _popupHandler = null;
  }
  if (_popup) { _popup.remove(); _popup = null; }
}

export function confirm2(msg, ok) {
  const el = document.createElement('div');
  el.className = 'confirm-wrap';
  el.innerHTML = `<div class="confirm-box">
<div class="confirm-msg">${msg}</div>
<div class="fbtns">
  <button class="btn btn-ghost" id="_cn">再想想</button>
  <button class="btn btn-primary" id="_cy">确认</button>
</div></div>`;
  document.body.appendChild(el);
  el.querySelector('#_cn').onclick = () => el.remove();
  el.querySelector('#_cy').onclick = () => { el.remove(); ok(); };
}

let _toastT = null;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  clearTimeout(_toastT);
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  _toastT = setTimeout(() => t.remove(), 3000);
}

export function showGErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }
