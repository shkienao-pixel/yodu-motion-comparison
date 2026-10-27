'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'startup-flow.js'), 'utf8');

async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }
function harness(options = {}) {
  let time = 0, online = true, nextTimer = 0;
  const timers = new Map(), requests = [], changes = [];
  const context = {
    URL, AbortController, Promise, navigator: { get onLine() { return online; } },
    performance: { now: () => time },
    document: { baseURI: 'http://example.test/', currentScript: { src: 'http://example.test/startup-flow.js' } },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, due: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, init) {
      return new Promise((resolve, reject) => {
        const record = { url, init, resolve, reject };
        requests.push(record);
        if (!options.ignoreAbort) init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  const flow = context.createYoduStartupFlow({
    ...options.flow,
    onChange(state) { changes.push(state); if (options.readInChange) flow.read(); }
  });
  return {
    flow, requests, changes, timers,
    setOnline(value) { online = value; },
    async advance(ms) {
      const target = time + ms;
      for (;;) {
        let selected, due = Infinity;
        for (const [id, timer] of timers) if (timer.due < due && timer.due <= target) { selected = id; due = timer.due; }
        if (selected === undefined) break;
        const timer = timers.get(selected); timers.delete(selected); time = due; timer.fn(); await flush();
      }
      time = target; await flush();
    },
    async resolve(indices, ok = true) {
      for (const index of indices) requests[index].resolve({ ok });
      await flush();
    },
    async begin() { flow.start(); await flush(); },
    async goodNetwork() {
      await this.advance(100);
      await this.resolve([requests.length - 3, requests.length - 2, requests.length - 1]);
      await this.advance(4900);
      assert.equal(flow.read().phase, 'starting');
    }
  };
}

(async () => {
  {
    const h = harness({ readInChange: true });
    assert.equal(h.flow.read().phase, 'idle');
    assert.equal(h.flow.read().networkSample.quality, 1);
    assert.equal(h.flow.read().networkSample.downloadMbps, 32.6);
    assert.equal(h.flow.read().networkSample.simulated, true);
    assert.equal(h.requests.length, 0);
    await h.begin();
    assert.equal(h.flow.read().networkSample.quality, 1, 'full quality must be available on the first checking frame');
    const sample = h.flow.read().networkSample;
    sample.quality = 0;
    assert.equal(h.flow.read().networkSample.quality, 1, 'returned samples must not mutate controller state');
    assert.equal(h.requests.length, 3);
    assert.ok(h.requests.every(r => r.init.cache === 'no-store'));
    assert.equal(new Set(h.requests.map(r => r.url)).size, 3);
    await h.advance(100); await h.resolve([0, 1, 2]);
    await h.advance(4899);
    assert.equal(h.flow.read().phase, 'checking');
    const notices = h.changes.length;
    h.flow.read(); h.flow.read();
    assert.equal(h.changes.length, notices, 'read must never notify recursively');
    await h.advance(1);
    assert.equal(h.flow.read().phase, 'starting');
    assert.equal(h.flow.read().stage, '网络状态良好');
    await h.advance(1200);
    assert.equal(h.flow.read().stage, '思考中');
    await h.advance(31800);
    assert.equal(h.flow.read().phase, 'complete');
    assert.equal(h.flow.read().progress, 1);
    assert.equal(h.flow.read().playing, false);
    console.log('PASS 5s network gate, whole-line stages, 38s readiness and non-recursive reads');
  }
  {
    const h = harness();
    await h.begin(); await h.advance(100); await h.resolve([0, 1, 2], false); await h.advance(4900);
    assert.equal(h.flow.read().phase, 'network-error');
    assert.equal(h.flow.read().playing, false);
    assert.equal(h.flow.read().progress, 0);
    assert.equal(h.flow.read().networkSample.quality, .12);
    assert.equal(h.flow.read().networkSample.downloadMbps, .6);
    assert.equal(h.flow.read().networkSample.simulated, true);
    await h.begin(); await h.goodNetwork();
    assert.equal(h.flow.read().attempt, 2);
    assert.equal(h.flow.read().elapsed, 5000);
    console.log('PASS bad network blocks startup; a fresh attempt recovers with real probes');
  }
  {
    const slow = harness();
    await slow.begin(); await slow.advance(1100); await slow.resolve([0, 1, 2]); await slow.advance(3900);
    assert.equal(slow.flow.read().phase, 'network-error', 'successful but slow probes must fail the latency check');
    const mixed = harness();
    await mixed.begin(); await mixed.advance(100); await mixed.resolve([0]); await mixed.advance(100); await mixed.resolve([1]);
    await mixed.advance(950); await mixed.resolve([2]); await mixed.advance(3850);
    assert.equal(mixed.flow.read().phase, 'starting', 'one slow outlier must not dominate the median');
    console.log('PASS latency median identifies slow links without rejecting a single outlier');
  }
  {
    const h = harness({ flow: { forceTimeout: true } });
    await h.begin();
    await h.advance(100); await h.resolve([0, 1, 2]);
    assert.equal(h.flow.read().progress, 0, 'network checking must not advance the startup bar');
    await h.advance(4900);
    assert.equal(h.flow.read().progress, 0, 'the bar starts at zero after the 5s network check');
    const increments = [];
    let previous = h.flow.read().progress;
    for (const expected of [.05625, .225, .50625]) {
      await h.advance(5000);
      const value = h.flow.read().progress;
      assert.ok(Math.abs(value - expected) < 1e-10);
      increments.push(value - previous);
      previous = value;
    }
    await h.advance(4999);
    assert.ok(h.flow.read().progress < .9);
    await h.advance(1);
    assert.equal(h.flow.read().elapsed, 25000);
    assert.equal(h.flow.read().progress, .9, '25 seconds from starting the task must equal 90 percent');
    increments.push(h.flow.read().progress - previous);
    assert.ok(increments.every((value, index) => index === 0 || value > increments[index - 1]), 'equal time intervals must advance increasingly quickly before 25s');
    await h.advance(7500);
    assert.ok(Math.abs(h.flow.read().progress - .945) < 1e-10, 'the remaining 15s run at the slower rate, reserving 100 percent for readiness');
    await h.advance(6000);
    assert.ok(h.flow.read().progress > .98 && h.flow.read().progress < .99, 'progress keeps moving until the deadline');
    await h.advance(1500);
    assert.equal(h.flow.read().phase, 'timeout');
    assert.equal(h.flow.read().progress, .99, 'timeout retains 99 percent');
    await h.begin();
    assert.equal(h.flow.read().progress, 0, 'retry resets the staged progress');
    console.log('PASS accelerating progress reaches 90% at 25s, slow final 15s caps at 99%, and timeout/retry retain correct progress');
  }
  {
    const h = harness({ flow: { forceTimeout: true } });
    await h.begin(); await h.goodNetwork(); await h.advance(34999);
    assert.equal(h.flow.read().phase, 'starting');
    assert.ok(h.flow.read().progress < .99 && h.flow.read().progress > .98);
    await h.advance(1);
    assert.equal(h.flow.read().phase, 'timeout');
    assert.equal(h.flow.read().elapsed, 40000);
    assert.equal(h.flow.read().playing, false);
    await h.advance(20000);
    assert.equal(h.flow.read().phase, 'timeout');
    const late = harness();
    await late.begin(); await late.goodNetwork(); await late.advance(38000);
    assert.equal(late.flow.read().phase, 'timeout', 'a late render beyond the hard deadline must not become success');
    console.log('PASS 40s hard deadline wins and stays terminal after late readiness');
  }
  {
    const h = harness();
    await h.begin(); await h.advance(100); await h.resolve([0, 1, 2]); await h.advance(900);
    h.flow.pause(); await h.advance(10000);
    assert.equal(h.flow.read().elapsed, 1000);
    assert.equal(h.flow.read().phase, 'checking');
    h.flow.resume(); await h.advance(4000);
    assert.equal(h.flow.read().phase, 'starting');
    assert.equal(h.flow.read().elapsed, 5000);
    console.log('PASS explicit pause freezes elapsed while resume preserves the attempt');
  }
  {
    const h = harness({ ignoreAbort: true });
    await h.begin();
    const firstSignals = h.requests.map(r => r.init.signal);
    await h.begin();
    assert.ok(firstSignals.every(signal => signal.aborted));
    await h.advance(100); await h.resolve([0, 1, 2]);
    assert.equal(h.changes.length, 0, 'stale successes must never notify or enter the new network result');
    await h.resolve([3, 4, 5], false); await h.advance(4900);
    assert.equal(h.flow.read().phase, 'network-error');
    assert.equal(h.flow.read().attempt, 2);
    console.log('PASS restarting aborts old probes and ignores their late successes');
  }
  {
    const h = harness({ ignoreAbort: true });
    await h.begin(); await h.advance(1200);
    assert.ok(h.requests.every(r => r.init.signal.aborted));
    assert.equal(h.flow.read().phase, 'checking');
    await h.resolve([0, 1, 2]); await h.advance(3800);
    assert.equal(h.flow.read().phase, 'network-error');
    const disposed = harness({ ignoreAbort: true });
    await disposed.begin(); disposed.flow.dispose();
    assert.equal(disposed.timers.size, 0);
    assert.ok(disposed.requests.every(r => r.init.signal.aborted));
    await disposed.resolve([0, 1, 2]);
    assert.equal(disposed.changes.length, 0);
    console.log('PASS 1200ms probe aborts and disposal prevent delayed state changes');
  }
  {
    const h = harness();
    h.setOnline(false); await h.begin();
    assert.equal(h.requests.length, 0);
    await h.advance(5000);
    assert.equal(h.flow.read().phase, 'network-error');
    h.setOnline(true); await h.begin(); await h.goodNetwork();
    assert.equal(h.flow.read().phase, 'starting');
    console.log('PASS offline detection and fresh online recovery');
  }
  {
    const h = harness();
    h.flow.showcase('network-error'); await flush();
    assert.equal(h.flow.read().phase, 'checking');
    assert.equal(h.flow.read().elapsed, 0);
    assert.equal(h.flow.read().networkSample.quality, .18);
    assert.equal(h.flow.read().networkSample.downloadMbps, .8);
    assert.equal(h.requests.length, 3);
    await h.advance(100); await h.resolve([0, 1, 2]); await h.advance(4899);
    assert.equal(h.flow.read().phase, 'checking', 'poor quality still gets the full 5s check');
    await h.advance(1);
    assert.equal(h.flow.read().phase, 'network-error');
    assert.equal(h.flow.read().networkSample.quality, .18);
    await h.begin();
    assert.equal(h.requests.length, 6, 'restart after a showcase must perform fresh probes');
    assert.equal(h.flow.read().networkSample.quality, 1);
    assert.equal(h.flow.read().networkSample.downloadMbps, 32.6);
    await h.goodNetwork();
    assert.equal(h.flow.read().phase, 'starting');
    console.log('PASS poor-quality showcase checks for 5s, then a normal retry restores full quality and recovers');
  }
  {
    const h = harness({ ignoreAbort: true });
    await h.begin();
    h.flow.showcase('starting');
    assert.ok(h.requests.every(r => r.init.signal.aborted));
    assert.equal(h.flow.read().stage, '网络状态良好');
    assert.equal(h.flow.read().elapsed, 5000);
    assert.equal(h.flow.read().networkSample.quality, 1);
    await h.resolve([0, 1, 2], false);
    assert.equal(h.flow.read().phase, 'starting');
    h.flow.showcase('timeout');
    assert.equal(h.flow.read().phase, 'timeout');
    assert.equal(h.flow.read().elapsed, 40000);
    assert.equal(h.flow.read().progress, .99);
    assert.equal(h.flow.read().networkSample.quality, 1);
    h.flow.showcase('complete');
    assert.equal(h.flow.read().progress, 1);
    assert.equal(h.flow.read().elapsed, 38000);
    assert.equal(h.flow.read().networkSample.quality, 1);
    h.flow.showcase('checking'); await flush();
    assert.equal(h.flow.read().phase, 'checking');
    assert.equal(h.flow.read().elapsed, 0);
    assert.equal(h.requests.length, 6);
    assert.equal(h.flow.read().attempt, 5);
    console.log('PASS direct scenario entry, attempt isolation and restart recovery');
  }
  {
    const low = harness();
    low.flow.start({ networkSample: { quality: .249, downloadMbps: 2.4, simulated: true } }); await flush();
    await low.advance(100); await low.resolve([0, 1, 2]); await low.advance(4900);
    assert.equal(low.flow.read().phase, 'network-error', 'quality below one bar must fail despite healthy fetch probes');
    assert.equal(low.flow.read().networkSample.quality, .249);
    const boundary = harness();
    boundary.flow.start({ networkSample: { quality: .25, downloadMbps: 2.5, simulated: true } }); await flush();
    await boundary.goodNetwork();
    assert.equal(boundary.flow.read().phase, 'starting', 'one full bar is the inclusive quality boundary');
    assert.equal(boundary.flow.read().networkSample.quality, .25);
    const defaulted = harness({ flow: { networkSample: { quality: .6, downloadMbps: 12.5 } } });
    defaulted.flow.start({ networkSample: { quality: .1, downloadMbps: .5 } }); await flush();
    defaulted.flow.start(); await flush();
    assert.equal(defaulted.flow.read().networkSample.quality, .6);
    assert.equal(defaulted.flow.read().networkSample.downloadMbps, 12.5);
    assert.equal(defaulted.flow.read().networkSample.simulated, true);
    assert.equal(defaulted.requests.length, 6);
    console.log('PASS inclusive .25 threshold and per-attempt sample overrides without default contamination');
  }
  console.log('All startup flow checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
