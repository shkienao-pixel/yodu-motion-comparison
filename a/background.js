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

    function curve(which, drift) {
      context.beginPath();
      if (which === 0) {
        context.moveTo(width * (.59 + drift), height * -.09);
        context.bezierCurveTo(
          width * (.55 + drift), height * .20,
          width * (.50 + drift), height * .44,
          width * -.15, height * .60
        );
      } else {
        context.moveTo(width * 1.13, height * (.48 + drift));
        context.bezierCurveTo(
          width * (.63 - drift), height * .51,
          width * (.45 - drift), height * .73,
          width * (.42 - drift), height * 1.12
        );
      }
    }

    function paint() {
      context.clearRect(0, 0, width, height);
      const drift = Math.sin(elapsed * Math.PI / 12) * .012;
      const glow = 1 + Math.sin(elapsed * Math.PI / 9) * .08;
      // Wide faint halo, soft body, then a narrow luminous center.
      const strokes = [
        [.17, .045, .09],
        [.085, .024, .14],
        [.034, .010, .30],
        [.013, .005, .27]
      ];
      context.lineCap = 'round';
      for (let arc = 0; arc < 2; arc++) {
        for (const [weight, blur, opacity] of strokes) {
          context.lineWidth = width * weight;
          context.filter = `blur(${width * blur}px)`;
          context.strokeStyle = `rgba(167, 76, 232, ${opacity * glow})`;
          curve(arc, arc ? -drift : drift);
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
      else if (records.some(record => record.type === 'attributes')) resume();
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
