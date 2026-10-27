'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'a', 'background.js'), 'utf8');

// A small browser boundary: record rendered paths and schedule real callback order.
// Assertions concern visible movement and lifecycle behavior, not curve formulas.
function harness() {
  let now = 0, nextFrame = 0;
  const frames = new Map();
  const mutations = new Set(), resizes = new Set();
  const canvases = [];

  function events(target = {}) {
    const listeners = new Map();
    Object.assign(target, {
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); }
    });
    target.listenerCount = () => [...listeners.values()].reduce((sum, group) => sum + group.size, 0);
    return target;
  }

  function mutation(target, type, attributeName) {
    for (const observer of mutations) {
      for (const [observed, options] of observer.targets) {
        if (type === 'attributes' && observed === target && options.attributes &&
            (!options.attributeFilter || options.attributeFilter.includes(attributeName))) {
          observer.records.push({ type, target, attributeName });
        } else if (type === 'childList' && options.childList &&
                   (observed === target || options.subtree && observed === document.documentElement)) {
          observer.records.push({ type, target });
        }
      }
    }
  }

  class Element {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.parentNode = null;
      this.root = false;
      this.dataset = new Proxy({}, {
        set: (values, key, value) => {
          values[key] = String(value);
          // DOM attribute setters notify even when the assigned value is unchanged.
          const attribute = 'data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
          mutation(this, 'attributes', attribute);
          return true;
        },
        deleteProperty: (values, key) => { delete values[key]; return true; }
      });
    }
    get isConnected() { return this.root || Boolean(this.parentNode?.isConnected); }
    setAttribute() {}
    append(child) { child.parentNode = this; this.children.push(child); mutation(this, 'childList'); }
    prepend(child) { child.parentNode = this; this.children.unshift(child); mutation(this, 'childList'); }
    remove() {
      if (!this.parentNode) return;
      const parent = this.parentNode;
      parent.children.splice(parent.children.indexOf(this), 1);
      this.parentNode = null;
      mutation(parent, 'childList');
    }
    getBoundingClientRect() { return { width: 390, height: 780 }; }
  }

  function canvas() {
    const element = new Element('canvas');
    const paintings = [];
    let current = [], currentPath = [];
    const context = {
      clearRect() { current = []; paintings.push(current); },
      beginPath() { currentPath = []; },
      moveTo(...coordinates) { currentPath.push(['move', ...coordinates]); },
      bezierCurveTo(...coordinates) { currentPath.push(['curve', ...coordinates]); },
      stroke() { current.push(currentPath.slice()); },
      createLinearGradient() { return { addColorStop() {} }; },
      setTransform() {}
    };
    element.getContext = kind => kind === '2d' ? context : null;
    element.paintings = paintings;
    canvases.push(element);
    return element;
  }

  const document = events({ hidden: false });
  document.documentElement = new Element('html');
  document.documentElement.root = true;
  document.createElement = tag => tag === 'canvas' ? canvas() : new Element(tag);
  const surface = new Element('main');
  document.documentElement.append(surface);
  const reducedMotion = events({ matches: false });

  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = new Map(); this.records = []; mutations.add(this); }
    observe(target, options) { this.targets.set(target, options); }
    disconnect() { this.targets.clear(); this.records = []; }
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); resizes.add(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }

  const context = events({
    document, MutationObserver, ResizeObserver, devicePixelRatio: 1,
    matchMedia: () => reducedMotion,
    performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  function flushMutations() {
    for (let pass = 0; pass < 10; pass++) {
      const queued = [...mutations].filter(observer => observer.records.length);
      if (!queued.length) return;
      for (const observer of queued) {
        const records = observer.records.splice(0);
        observer.callback(records);
      }
    }
    throw new Error('Mutation callbacks did not settle');
  }
  return {
    surface, canvases,
    mount: () => context.mountTaskStartupBends(surface),
    setPaused(value) { surface.dataset.paused = String(value); flushMutations(); },
    frame(ms = 40) {
      flushMutations();
      now += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(now));
      flushMutations();
    },
    geometry(element = canvases.at(-1)) { return JSON.stringify(element.paintings.at(-1)); },
    pendingFrames: () => frames.size,
    activeObservers: () => [...mutations, ...resizes].filter(observer => observer.targets.size).length,
    listeners: () => context.listenerCount() + document.listenerCount() + reducedMotion.listenerCount()
  };
}

{
  const h = harness();
  const cleanup = h.mount();
  h.setPaused(false);
  const initial = h.geometry();
  // The screen controller writes the same data-paused value on every frame.
  for (let i = 0; i < 40; i++) { h.setPaused(false); h.frame(); }
  assert.notEqual(h.geometry(), initial, 'arc paths must move despite repeated same-value pause notifications');
  assert.equal(h.pendingFrames(), 1, 'a mounted playing background must keep one animation callback');

  h.setPaused(true);
  const paused = h.geometry();
  for (let i = 0; i < 12; i++) { h.setPaused(true); h.frame(); }
  assert.equal(h.geometry(), paused, 'pausing must freeze the rendered arc paths');
  assert.equal(h.pendingFrames(), 0, 'pausing must stop scheduling animation');

  h.setPaused(false);
  for (let i = 0; i < 20; i++) { h.setPaused(false); h.frame(); }
  assert.notEqual(h.geometry(), paused, 'resuming must continue moving the rendered arcs');
  cleanup();
  console.log('PASS arc movement survives same-value pause writes; pause freezes and resume continues');
}

{
  const h = harness();
  const firstCleanup = h.mount();
  h.setPaused(false);
  h.frame();
  const oldCanvas = h.canvases[0];
  const secondCleanup = h.mount();
  const oldPaints = oldCanvas.paintings.length;
  assert.equal(h.surface.children.length, 1, 'remounting must replace the previous visual layer');
  firstCleanup();
  assert.equal(h.surface.children.length, 1, 'stale cleanup must not remove the new instance');
  for (let i = 0; i < 5; i++) h.frame();
  assert.equal(oldCanvas.paintings.length, oldPaints, 'the replaced canvas must no longer draw');

  secondCleanup();
  secondCleanup();
  assert.equal(h.surface.children.length, 0, 'cleanup must remove its visual layer');
  assert.equal(h.pendingFrames(), 0, 'cleanup must cancel scheduled animation');
  assert.equal(h.activeObservers(), 0, 'cleanup must disconnect observers');
  assert.equal(h.listeners(), 0, 'cleanup must remove lifecycle listeners');
  assert.equal(h.surface.dataset.bendsReady, undefined, 'cleanup must clear the readiness marker');
  const paints = h.canvases.map(element => element.paintings.length);
  h.setPaused(false); h.frame();
  assert.deepEqual(h.canvases.map(element => element.paintings.length), paints, 'a disposed instance must stay inert');
  console.log('PASS remount isolation and idempotent cleanup release layers, observers, listeners and animation');
}

console.log('All arc background checks passed');
