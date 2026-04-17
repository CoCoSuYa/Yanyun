// ====================================================
// BGM 播放控制（多曲目 + 随机切歌）
// ====================================================
import { S } from './state.js';
import { api } from './api.js';
import { esc } from './utils.js';

let bgmList = [];
let bgmCurrentIdx = -1;
let bgmHasPlayed = false;

function updateBgmTrackName(name) {
  const container = document.getElementById('bgmTrackInfo');
  if (!container) return;
  container.innerHTML = `<span class="bgm-track-name" id="bgmTrackNameText">${esc(name || '未知曲目')}</span>`;
  const textEl = document.getElementById('bgmTrackNameText');
  const duration = 6 + (name ? name.length : 4) * 0.5;
  textEl.style.animation = `bgmMarquee ${duration}s linear infinite`;
}

function pickRandomBgmIndex(excludeIdx = -1) {
  if (!bgmList.length) return -1;
  if (bgmList.length === 1) return 0;
  let idx = -1;
  do { idx = Math.floor(Math.random() * bgmList.length); }
  while (idx === excludeIdx);
  return idx;
}

function applyBgmTrack(index) {
  const audio = document.getElementById('bgmAudio');
  if (!audio || index < 0 || index >= bgmList.length) return;
  bgmCurrentIdx = index;
  audio.src = bgmList[index].url;
  updateBgmTrackName(bgmList[index].name);
}

export async function initBgm() {
  try {
    const tracks = await api('GET', '/api/music');
    bgmList = Array.isArray(tracks) ? tracks.filter(track => track && track.url) : [];
  } catch (e) {
    console.warn('获取 BGM 列表失败:', e);
    bgmList = [];
  }

  if (!bgmList.length) {
    updateBgmTrackName('暂无可用曲目');
    return;
  }

  const initialIdx = pickRandomBgmIndex();
  applyBgmTrack(initialIdx);

  const audio = document.getElementById('bgmAudio');
  audio.play().then(() => {
    bgmHasPlayed = true;
    document.getElementById('bgmBtn').classList.add('playing');
  }).catch(() => {});
}

export function toggleBgm() {
  const bgmAudio = document.getElementById('bgmAudio');
  const bgmBtn = document.getElementById('bgmBtn');
  if (bgmAudio.paused) {
    bgmAudio.play().then(() => {
      bgmHasPlayed = true;
      bgmBtn.classList.add('playing');
    }).catch(e => console.warn('BGM 播放被浏览器拦截:', e));
  } else {
    bgmAudio.pause();
    bgmBtn.classList.remove('playing');
  }
}

export function nextBgm() {
  if (!bgmList.length) return;
  const audio = document.getElementById('bgmAudio');
  const bgmBtn = document.getElementById('bgmBtn');
  const nextBtn = document.getElementById('bgmNext');
  const wasPlaying = !audio.paused;
  const idx = pickRandomBgmIndex(bgmCurrentIdx);

  nextBtn.classList.remove('skip-flash');
  void nextBtn.offsetWidth;
  nextBtn.classList.add('skip-flash');
  nextBtn.addEventListener('animationend', () => nextBtn.classList.remove('skip-flash'), { once: true });

  applyBgmTrack(idx);

  if (wasPlaying) {
    audio.play().then(() => bgmBtn.classList.add('playing')).catch(() => {});
  }
}

function unlockAudio() {
  const bgmAudio = document.getElementById('bgmAudio');
  const bgmBtn = document.getElementById('bgmBtn');
  if (!bgmHasPlayed && bgmAudio && bgmAudio.paused && bgmAudio.src) {
    bgmAudio.play().then(() => {
      bgmHasPlayed = true;
      bgmBtn.classList.add('playing');
      document.removeEventListener('click', unlockAudio, { capture: true });
    }).catch(() => {});
  } else if (bgmHasPlayed) {
    document.removeEventListener('click', unlockAudio, { capture: true });
  }
}
document.addEventListener('click', unlockAudio, { capture: true });
