// core/canvas.js — HiDPI canvas setup, animation loops, pan/zoom, drawing helpers.
// No top-level DOM access: everything happens inside functions, so this module
// is importable under node (for tests) without a browser.

// Create a devicePixelRatio-aware canvas filling `parent`'s width.
// opts: { height: CSS px (or aspect: w/h ratio), interactive: bool }
// Returns a handle; ctx is scaled so all drawing uses CSS-pixel units.
export function setupCanvas(parent, opts = {}) {
  const canvas = document.createElement('canvas');
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const handle = {
    canvas, ctx,
    width: 0, height: 0,
    dpr: 1,
    _resizeCbs: [],
    onResize(cb) { this._resizeCbs.push(cb); },
    destroy() { ro.disconnect(); canvas.remove(); },
  };

  function resize() {
    const rect = parent.getBoundingClientRect();
    const cssW = Math.max(50, rect.width - paddingX(parent));
    const cssH = opts.height != null ? opts.height
      : opts.aspect ? cssW / opts.aspect
      : Math.max(50, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    handle.width = cssW; handle.height = cssH; handle.dpr = dpr;
    for (const cb of handle._resizeCbs) cb(cssW, cssH);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(parent);
  resize();
  return handle;
}

function paddingX(el) {
  const cs = getComputedStyle(el);
  return parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
}

// Registry of started loops — lets tooling force a frame while the tab is
// hidden (rAF is suspended in background tabs). Harmless in production.
const activeLoops = new Set();
export function tickAll(dt = 0.016) {
  const errs = [];
  for (const l of [...activeLoops]) {
    try { l.tick(dt); } catch (e) { errs.push(e.message); }
  }
  if (typeof window !== 'undefined') {
    window.__mmTickInfo = { loops: activeLoops.size, errs };
  }
}

// requestAnimationFrame loop. fn(dt, t) with dt in seconds (clamped), t in seconds.
// Returns { start, stop, tick, running }. Auto-pauses while the document is
// hidden and resumes when it becomes visible again.
export function rafLoop(fn) {
  let want = false;      // caller wants the loop running
  let running = false;   // a frame is actually scheduled
  let rafId = 0, last = 0;
  function frame(ms) {
    if (!running) return;
    const t = ms / 1000;
    const dt = last ? Math.min(t - last, 0.1) : 0.016;
    last = t;
    fn(dt, t);
    rafId = requestAnimationFrame(frame);
  }
  function startRaf() {
    if (running) return;
    running = true; last = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stopRaf() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  }
  const onVis = () => { if (document.hidden) stopRaf(); else if (want) startRaf(); };
  const self = {
    start() {
      if (want) return;
      want = true;
      activeLoops.add(self);
      document.addEventListener('visibilitychange', onVis);
      if (!document.hidden) startRaf();
    },
    stop() {
      want = false;
      activeLoops.delete(self);
      stopRaf();
      document.removeEventListener('visibilitychange', onVis);
    },
    // Run exactly one frame now (useful for tests / hidden-tab rendering).
    tick(dt = 0.016) { fn(dt, performance.now() / 1000); },
    get running() { return want; },
  };
  return self;
}

// Pan/zoom state for a canvas handle. World <-> screen transforms plus
// pointer/wheel bindings. opts: { minScale, maxScale, scale, x, y }
export class PanZoom {
  constructor(handle, opts = {}) {
    this.handle = handle;
    this.scale = opts.scale ?? 1;
    this.x = opts.x ?? 0;                 // world coord at screen centre
    this.y = opts.y ?? 0;
    this.minScale = opts.minScale ?? 1e-4;
    this.maxScale = opts.maxScale ?? 1e6;
    this.onChange = opts.onChange || null;
  }
  worldToScreen(wx, wy) {
    return [
      (wx - this.x) * this.scale + this.handle.width / 2,
      (wy - this.y) * -this.scale + this.handle.height / 2,   // y up in world
    ];
  }
  screenToWorld(sx, sy) {
    return [
      (sx - this.handle.width / 2) / this.scale + this.x,
      -(sy - this.handle.height / 2) / this.scale + this.y,
    ];
  }
  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const [nsx, nsy] = this.worldToScreen(wx, wy);
    this.x += (nsx - sx) / this.scale;
    this.y -= (nsy - sy) / this.scale;
    this.onChange && this.onChange();
  }
  // Bind drag-pan + wheel-zoom. Returns an unbind function.
  bind() {
    const c = this.handle.canvas;
    let dragging = false, lx = 0, ly = 0;
    const down = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; c.setPointerCapture(e.pointerId); };
    const move = (e) => {
      if (!dragging) return;
      this.x -= (e.clientX - lx) / this.scale;
      this.y += (e.clientY - ly) / this.scale;
      lx = e.clientX; ly = e.clientY;
      this.onChange && this.onChange();
    };
    const up = (e) => { dragging = false; try { c.releasePointerCapture(e.pointerId); } catch {} };
    const wheel = (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(1.0015, -e.deltaY));
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
    };
  }
}

// Translucent fill over the whole canvas — persistent-trail effect.
// color must be a CSS color WITHOUT alpha; alpha given separately.
export function fadeTrail(handle, alpha = 0.08, color = '#0a0b10') {
  const { ctx, width, height } = handle;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// Pointer position in canvas CSS-pixel coordinates.
export function pointerPos(handle, e) {
  const rect = handle.canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

// Tiny chart primitive: line or bar data in a rect of the canvas.
// spec: { x, y, w, h, data: number[], min?, max?, kind: 'line'|'bar',
//         color?, axisColor?, labels?: {x?: string, y?: string} }
export function miniChart(ctx, spec) {
  const { x, y, w, h, data } = spec;
  const kind = spec.kind || 'line';
  const color = spec.color || '#c9a959';
  const axis = spec.axisColor || '#2a2e3f';
  let lo = spec.min ?? Math.min(...data, 0);
  let hi = spec.max ?? Math.max(...data);
  if (hi === lo) hi = lo + 1;
  const sx = (i) => x + (i / Math.max(1, data.length - (kind === 'line' ? 1 : 0))) * w;
  const sy = (v) => y + h - ((v - lo) / (hi - lo)) * h;

  ctx.save();
  ctx.strokeStyle = axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);

  if (kind === 'bar') {
    const bw = Math.max(1, (w / data.length) * 0.7);
    ctx.fillStyle = color;
    data.forEach((v, i) => {
      const bx = sx(i) + ((w / data.length) - bw) / 2;
      ctx.fillRect(bx, sy(v), bw, y + h - sy(v));
    });
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => { i ? ctx.lineTo(sx(i), sy(v)) : ctx.moveTo(sx(i), sy(v)); });
    ctx.stroke();
  }

  if (spec.labels) {
    ctx.fillStyle = '#6d6a5e';
    ctx.font = '10px ui-monospace, Menlo, monospace';
    if (spec.labels.x) ctx.fillText(spec.labels.x, x + w / 2 - ctx.measureText(spec.labels.x).width / 2, y + h + 12);
    if (spec.labels.y) { ctx.save(); ctx.translate(x - 6, y + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(spec.labels.y, -ctx.measureText(spec.labels.y).width / 2, 0); ctx.restore(); }
  }
  ctx.restore();
}

// Pre-render a soft glowing dot to an offscreen canvas; blit with drawImage.
// Far cheaper than shadowBlur per dot. Returns { canvas, size, draw(ctx, x, y, scale) }.
export function glowSprite(color = '#c9a959', size = 24) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + 'cc');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return {
    canvas: c, size,
    draw(ctx, x, y, scale = 1) {
      const s = size * scale;
      ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
    },
  };
}

// House palette, importable by exhibits so colors stay consistent.
export const palette = {
  bg: '#0a0b10', panel: '#161925', line: '#2a2e3f',
  ink: '#e8e2d0', inkDim: '#a9a493', inkFaint: '#6d6a5e',
  gold: '#c9a959', goldBright: '#e8c87c', goldDim: '#8a7440',
  azure: '#7da7d9', azureDim: '#4a6a94',
  crimson: '#c05b4d', verdant: '#7fae7a',
};
