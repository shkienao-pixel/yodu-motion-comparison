/* Equal-spaced token lanes, with a seamless left-to-right transport. */
(function () {
  'use strict';
  const mounted = new WeakMap();
  let instance = 0;
  window.initAlternativeBackground = function initAlternativeBackground(surface) {
    if (!surface) return function () {};
    mounted.get(surface)?.();
    const host = surface.querySelector('.alternative-background');
    if (!host) return function () {};
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const id = 'token-flow-mask-' + (++instance);
    const widths = [18,30,42,24,42,18,30,24,36,24,30,18];
    const period = 480;
    let disposed = false;
    function lane(row) {
      let x = 0;
      const blocks = widths.map((_, index) => {
        const width = widths[(index + row % 4) % widths.length];
        const kind = index === row % 12 ? 'token-accent' : (index + row) % 5 === 0 ? 'token-outline' : 'token-base';
        const block = `<rect class="token-block ${kind}" x="${x}" y="0" width="${width}" height="8" rx="1.5"/>`;
        x += width + 12;
        return block;
      }).join('');
      const phase = -((row * 7) % 24) * .5;
      return `<g class="token-lane" transform="translate(0 ${16 + row * 34})"><g class="token-strip" style="--token-phase:${phase}s"><g>${blocks}</g><g transform="translate(${period} 0)">${blocks}</g></g></g>`;
    }
    host.innerHTML = `<svg class="token-field" viewBox="0 0 390 780" preserveAspectRatio="none" fill="none" aria-hidden="true"><defs><linearGradient id="${id}-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity=".72"/><stop offset=".22" stop-color="white" stop-opacity=".95"/><stop offset=".33" stop-color="white" stop-opacity=".55"/><stop offset=".40" stop-color="white" stop-opacity=".09"/><stop offset=".58" stop-color="white" stop-opacity=".09"/><stop offset=".67" stop-color="white" stop-opacity=".6"/><stop offset=".84" stop-color="white" stop-opacity=".95"/><stop offset="1" stop-color="white" stop-opacity=".72"/></linearGradient><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="390" height="780"><rect x="0" y="0" width="390" height="780" fill="url(#${id}-fade)"/></mask></defs><g mask="url(#${id})">${Array.from({length:23},(_,row)=>lane(row)).join('')}</g></svg>`;
    function sync() {
      if (disposed) return;
      host.dataset.paused = String(document.hidden);
      host.dataset.reduced = String(reduced.matches);
    }
    const cleanup = function () {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      removeEventListener('pagehide', cleanup);
      if (mounted.get(surface) === cleanup) {
        host.replaceChildren();
        delete host.dataset.paused;
        delete host.dataset.reduced;
        mounted.delete(surface);
      }
    };
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    addEventListener('pagehide', cleanup, {once:true});
    mounted.set(surface, cleanup);
    sync();
    return cleanup;
  };
}());
