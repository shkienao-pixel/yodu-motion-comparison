/* Alternative B: restrained, abstract light drifting across a white surface. */
(function () {
  'use strict';
  const activeSurfaces = new WeakMap();
  window.initAlternativeBackground = function initAlternativeBackground(surface) {
    if (!surface) return function () {};
    activeSurfaces.get(surface)?.();
    const host = surface.querySelector('.alternative-background');
    if (!host) return function () {};
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    host.innerHTML = '<div class="haze-field" aria-hidden="true"><span class="haze-wash haze-wash-upper"></span><span class="haze-wash haze-wash-side"></span><span class="haze-wash haze-wash-lower"></span></div>';
    function sync() {
      if (disposed) return;
      host.dataset.paused = String(document.hidden);
      host.dataset.reduced = String(reducedMotion.matches);
    }
    const cleanup = function () {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
      window.removeEventListener('pagehide', cleanup);
      host.replaceChildren();
      delete host.dataset.paused;
      delete host.dataset.reduced;
      if (activeSurfaces.get(surface) === cleanup) activeSurfaces.delete(surface);
    };
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    window.addEventListener('pagehide', cleanup, { once: true });
    activeSurfaces.set(surface, cleanup);
    sync();
    return cleanup;
  };
}());
