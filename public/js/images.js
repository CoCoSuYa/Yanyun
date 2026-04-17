// ====================================================
// 图片懒加载 + 加载重试
// ====================================================

let lazyImageObserver = null;

export function initLazyLoading() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.lazy-avatar').forEach(img => {
      if (img.dataset.src) img.src = img.dataset.src;
    });
    return;
  }

  lazyImageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.classList.remove('lazy-avatar');
          observer.unobserve(img);
        }
      }
    });
  }, { rootMargin: '50px' });

  document.querySelectorAll('.lazy-avatar').forEach(img => {
    lazyImageObserver.observe(img);
  });
}

export function updateLazyLoading() {
  if (lazyImageObserver) {
    document.querySelectorAll('.lazy-avatar').forEach(img => {
      lazyImageObserver.observe(img);
    });
  } else {
    initLazyLoading();
  }
}

const IMAGE_RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000
};

export function setupImageRetry(img) {
  let retryCount = 0;

  img.onerror = function () {
    retryCount++;
    if (retryCount <= IMAGE_RETRY_CONFIG.maxRetries) {
      setTimeout(() => {
        const originalSrc = this.dataset.src || this.src;
        if (originalSrc && originalSrc !== 'img/default-avatar.jpg') {
          this.src = `${originalSrc}?retry=${retryCount}`;
        }
      }, IMAGE_RETRY_CONFIG.retryDelay * retryCount);
    } else {
      this.onerror = null;
      this.src = 'img/default-avatar.jpg';
    }
  };
}
