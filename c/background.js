/* One full-surface grid, one straight scanning front, one fixed interval. */
(function () {
  'use strict';
  const mounted = new WeakMap();
  window.initAlternativeBackground = function initAlternativeBackground(surface) {
    if (!surface) return function () {};
    mounted.get(surface)?.();
    const host = surface.querySelector('.alternative-background');
    if (!host) return function () {};
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    host.innerHTML = '<div class="tech-field" aria-hidden="true"><div class="tech-grid"></div><div class="tech-scan"><span class="scan-line"></span></div></div>';
    function resize() {
      if (disposed) return;
      host.style.setProperty('--scan-distance', Math.max(1, surface.getBoundingClientRect().height) + 'px');
    }
    function sync() {
      if (disposed) return;
      host.dataset.paused = String(document.hidden);
      host.dataset.reduced = String(reduced.matches);
    }
    const observer = new ResizeObserver(resize);
    const cleanup = function () {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      removeEventListener('pagehide', cleanup);
      host.replaceChildren();
      host.style.removeProperty('--scan-distance');
      delete host.dataset.paused;
      delete host.dataset.reduced;
      if (mounted.get(surface) === cleanup) mounted.delete(surface);
    };
    observer.observe(surface);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    addEventListener('pagehide', cleanup, { once: true });
    mounted.set(surface, cleanup);
    resize();
    sync();
    return cleanup;
  };
}());
