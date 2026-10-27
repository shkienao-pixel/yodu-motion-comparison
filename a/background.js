/* Two soft purple arcs drawn with independent cubic curves. No dependencies. */
(() => {
  'use strict';
  const instances = new WeakMap();

  window.mountTaskStartupBends = function (surface) {
    if (!surface) return () => {};
    instances.get(surface)?.();

    const layer = document.createElement('div');
    layer.className = 'purple-arc-background';
    layer.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    layer.append(canvas);
    surface.prepend(layer);
    const context = canvas.getContext('2d');
    if (!context) {
      layer.remove();
      return () => {};
    }

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1, height = 1, frame = 0, previous = 0, painted = 0, elapsed = 0;
    let disposed = false;
    let lastPaused = surface.dataset.paused === 'true';

    function curve(which) {
      // Independent cubic geometry: two opposed ribbons sweep around the content.
      const sweep = (1 - Math.cos(elapsed * Math.PI / 10)) / 2;
      const bend = Math.sin(elapsed * Math.PI / 8) * .035;
      context.beginPath();
      if (which === 0) {
        context.moveTo(width * (.40 + .36 * sweep), height * -.09);
        context.bezierCurveTo(
          width * (.43 + .30 * sweep), height * (.17 + bend),
          width * (.35 + .23 * sweep), height * (.35 + .12 * sweep),
          width * -.14, height * (.49 + .22 * sweep)
        );
      } else {
        context.moveTo(width * 1.14, height * (.36 + .22 * sweep));
        context.bezierCurveTo(
          width * (.59 + .19 * sweep), height * (.39 + .17 * sweep),
          width * (.36 + .22 * sweep), height * (.66 + bend),
          width * (.16 + .48 * sweep), height * 1.12
        );
      }
    }

    function paint() {
      context.clearRect(0, 0, width, height);
      const breath = 1 + Math.sin(elapsed * Math.PI / 9) * .06;
      const swell = Math.sin(elapsed * Math.PI / 10) ** 2;
      const sweep = (1 - Math.cos(elapsed * Math.PI / 10)) / 2;
      // Broad translucent light surrounds the richer, softly blurred center.
      const strokes = [
        [.23, .062, .055],
        [.11, .031, .16],
        [.044, .014, .43],
        [.020, .006, .53]
      ];
      context.lineCap = 'round';
      for (let arc = 0; arc < 2; arc++) {
        for (const [weight, blur, opacity] of strokes) {
          const tint = context.createLinearGradient(0, 0, 0, height);
          const rgba = alpha => `rgba(161, 67, 231, ${opacity * alpha * breath})`;
          if (arc === 0) {
            tint.addColorStop(0, rgba(.58));
            tint.addColorStop(.25, rgba(.96));
            tint.addColorStop(.48, rgba(.84));
            tint.addColorStop(1, rgba(.12));
          } else {
            tint.addColorStop(0, rgba(.10));
            tint.addColorStop(.42, rgba(.95));
            tint.addColorStop(.62, rgba(.94));
            tint.addColorStop(1, rgba(.16 + .55 * sweep));
          }
          const widthGain = weight < .03 ? 1 + 2 * swell : weight < .06 ? 1 + swell : 1 + .45 * swell;
          context.lineWidth = width * weight * widthGain;
          context.filter = `blur(${width * blur}px)`;
          context.strokeStyle = tint;
          curve(arc);
          context.stroke();
        }
      }
      context.filter = 'none';
    }

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    }

    function animate(now) {
      frame = 0;
      if (disposed) return;
      if (!surface.isConnected) return cleanup();
      if (document.hidden || reducedMotion.matches || surface.dataset.paused === 'true') return;
      elapsed += previous ? Math.min((now - previous) / 1000, .08) : 0;
      previous = now;
      if (now - painted >= 1000 / 30) {
        paint();
        painted = now;
      }
      frame = requestAnimationFrame(animate);
    }

    function resume() {
      stop();
      if (disposed) return;
      if (!surface.isConnected) return cleanup();
      if (document.hidden) return;
      paint();
      if (!reducedMotion.matches && surface.dataset.paused !== 'true') {
        frame = requestAnimationFrame(animate);
      }
    }

    function resize() {
      if (disposed) return;
      const bounds = surface.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const scale = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      paint();
    }

    function cleanup() {
      if (disposed) return;
      disposed = true;
      stop();
      resizeObserver.disconnect();
      stateObserver.disconnect();
      reducedMotion.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pagehide', cleanup);
      layer.remove();
      if (instances.get(surface) === cleanup) {
        instances.delete(surface);
        delete surface.dataset.bendsReady;
      }
    }

    const resizeObserver = new ResizeObserver(resize);
    const stateObserver = new MutationObserver(records => {
      if (!surface.isConnected) cleanup();
      else if (records.some(record => record.type === 'attributes')) {
        const paused = surface.dataset.paused === 'true';
        if (paused !== lastPaused) {
          lastPaused = paused;
          resume();
        }
      }
    });
    instances.set(surface, cleanup);
    resizeObserver.observe(surface);
    stateObserver.observe(surface, { attributes: true, attributeFilter: ['data-paused'] });
    stateObserver.observe(document.documentElement, { childList: true, subtree: true });
    reducedMotion.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pagehide', cleanup);
    surface.dataset.bendsReady = 'true';
    resize();
    resume();
    return cleanup;
  };
})();
