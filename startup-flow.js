/* Shared demo startup clock. Network probing is real; task readiness is simulated. */
(function () {
  'use strict';
  const CHECK_MS = 5000;
  const SLOWDOWN_MS = 25000;
  const DEADLINE_MS = 40000;
  const PROBE_TIMEOUT_MS = 1200;
  const FULL_SAMPLE = { quality: 1, downloadMbps: 32.6, simulated: true };
  const scriptURL = new URL(document.currentScript?.src || 'startup-flow.js', document.baseURI);
  const stages = ['思考中', '梳理任务信息', '分析执行顺序', '准备 AI 工具', '整理工具上下文', '准备平台环境', '检查执行条件', '规划采集路径', '整理判断规则', '准备执行会话', '检查启动状态', '即将开始执行'];

  window.createYoduStartupFlow = function createYoduStartupFlow(options = {}) {
    const clock = typeof options.now === 'function' ? options.now : () => performance.now();
    const fetcher = options.fetcher || ((...args) => fetch(...args));
    const online = options.online || (() => navigator.onLine !== false);
    const probeURL = new URL(options.probeURL || 'network-check.txt', scriptURL);
    const readyAt = Number.isFinite(options.readyAt) ? Math.max(CHECK_MS, options.readyAt) : 38000;
    function sampleFrom(value, fallback = FULL_SAMPLE) {
      const input = value || {};
      return {
        quality: Number.isFinite(input.quality) ? Math.max(0, Math.min(1, input.quality)) : fallback.quality,
        downloadMbps: Number.isFinite(input.downloadMbps) ? Math.max(0, input.downloadMbps) : fallback.downloadMbps,
        simulated: true
      };
    }
    const defaultSample = sampleFrom(options.networkSample);
    const requests = new Set();
    let phase = 'idle', position = 0, anchor = clock(), playing = false, attempt = 0;
    let network = 'pending', results = [], disposed = false;
    let networkSample = sampleFrom(defaultSample);

    function isOnline() {
      try { return online() !== false; } catch (_) { return false; }
    }
    function elapsed() {
      return position + (playing ? Math.max(0, clock() - anchor) : 0);
    }
    function cancelRequests() {
      [...requests].forEach(request => request.cancel());
    }
    function terminal(next, time) {
      phase = next;
      position = Math.min(DEADLINE_MS, time);
      playing = false;
      cancelRequests();
    }
    function networkOK() {
      if (networkSample.quality < .25) return false;
      if (network === 'good') return true;
      function poor() {
        networkSample = sampleFrom({ quality: .12, downloadMbps: .6 });
        return false;
      }
      if (!isOnline() || options.forceNetworkFailure === true) return poor();
      const success = results.filter(result => result.ok).map(result => result.latency).sort((a, b) => a - b);
      if (success.length < 2) return poor();
      const middle = Math.floor(success.length / 2);
      const median = success.length % 2 ? success[middle] : (success[middle - 1] + success[middle]) / 2;
      return median <= 1000 || poor();
    }
    function stageAt(time) {
      if (phase === 'idle') return '准备启动';
      if (phase === 'checking') return '正在检测网络';
      if (phase === 'complete') return '启动就绪';
      if (phase !== 'starting') return '';
      const thinkingAt = CHECK_MS + 1200;
      if (time < thinkingAt) return '网络状态良好';
      const span = Math.max(1, Math.min(readyAt, DEADLINE_MS) - thinkingAt);
      return stages[Math.min(stages.length - 1, Math.floor((time - thinkingAt) / span * stages.length))];
    }
    function progressAt(time) {
      if (phase === 'complete') return 1;
      if (phase === 'timeout') return .99;
      if (phase !== 'starting') return 0;
      if (time <= SLOWDOWN_MS) {
        const portion = Math.max(0, time - CHECK_MS) / (SLOWDOWN_MS - CHECK_MS);
        return .9 * portion * portion;
      }
      // Reserve the final 1% for readiness, and keep moving until the deadline.
      return Math.min(.99, .9 + .09 * (time - SLOWDOWN_MS) / (DEADLINE_MS - SLOWDOWN_MS));
    }
    function read() {
      let time = elapsed();
      if (!disposed && (phase === 'checking' || phase === 'starting')) {
        // The deadline wins if the UI resumes after the permitted startup window.
        if (time >= DEADLINE_MS) terminal('timeout', DEADLINE_MS);
        else if (phase === 'checking' && time >= CHECK_MS) {
          if (networkOK()) { network = 'good'; phase = 'starting'; }
          else terminal('network-error', time);
        }
        if (phase === 'starting' && options.forceTimeout !== true && time >= readyAt) terminal('complete', time);
      }
      time = Math.min(DEADLINE_MS, elapsed());
      return {
        phase, elapsed: time,
        progress: progressAt(time),
        playing, attempt, stage: stageAt(time), networkSample: { ...networkSample }
      };
    }
    function notify(epoch) {
      if (disposed || epoch !== attempt || typeof options.onChange !== 'function') return;
      options.onChange(read());
    }
    function probe(epoch, index) {
      const controller = new AbortController();
      const began = clock();
      let settled = false, timer;
      const request = {
        cancel() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          controller.abort();
          requests.delete(request);
        }
      };
      function finish(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        requests.delete(request);
        if (disposed || epoch !== attempt) return;
        results.push({ ok, latency: Math.max(0, clock() - began) });
        notify(epoch);
      }
      requests.add(request);
      timer = setTimeout(() => { controller.abort(); finish(false); }, PROBE_TIMEOUT_MS);
      const url = new URL(probeURL.href);
      url.searchParams.set('probe', `${epoch}-${index}-${Math.floor(began)}`);
      Promise.resolve().then(() => {
        if (settled || disposed || epoch !== attempt) return null;
        return fetcher(url.href, { cache: 'no-store', signal: controller.signal });
      }).then(response => { if (response) finish(response.ok === true); }, () => finish(false));
    }
    function reset(next, time, run, sample = defaultSample) {
      cancelRequests();
      attempt++;
      results = [];
      network = 'pending';
      networkSample = sampleFrom(sample);
      phase = next;
      position = time;
      anchor = clock();
      playing = run;
    }
    function start({ networkSample: override } = {}) {
      if (disposed) return read();
      reset('checking', 0, true, sampleFrom(override, defaultSample));
      const epoch = attempt;
      if (options.forceNetworkFailure === true || !isOnline()) {
        Promise.resolve().then(() => notify(epoch));
      } else {
        for (let index = 0; index < 3; index++) probe(epoch, index);
      }
      return read();
    }
    function pause() {
      read();
      if (disposed || !playing) return read();
      position = elapsed();
      playing = false;
      return read();
    }
    function resume() {
      if (disposed) return read();
      read();
      if (phase === 'idle' || phase === 'network-error' || phase === 'timeout' || phase === 'complete') return start();
      if (!playing) { anchor = clock(); playing = true; }
      return read();
    }
    function showcase(next) {
      if (disposed) return read();
      if (next === 'checking') return start();
      if (next === 'network-error') return start({ networkSample: { quality: .18, downloadMbps: .8, simulated: true } });
      const times = { starting: CHECK_MS, timeout: 40000, complete: 38000 };
      if (!Object.prototype.hasOwnProperty.call(times, next)) return read();
      reset(next, times[next], next === 'starting', FULL_SAMPLE);
      if (next === 'starting') network = 'good';
      return read();
    }
    function dispose() {
      if (disposed) return;
      position = elapsed();
      playing = false;
      disposed = true;
      attempt++;
      cancelRequests();
    }
    return { start, pause, resume, read, showcase, dispose };
  };
})();
