// shell/backdrops.js — one canvas behind each movement intro, each computing a
// real object from its movement. Contract per backdrop:
//   prepare(w, h, opts) -> geom      (all the arithmetic, once per size)
//   paint(ctx, geom, w, h, t, opts)  (t ∈ [0, 1] is the reveal; cheap)
// The reveal runs once (about 2.4 s) when the intro first comes into view;
// after that the canvas is never touched again unless its box is resized.
// I and II read the exhibits' own verified data through their _test exports;
// III and IV are computed here.

import { palette as P, rafLoop } from '../core/canvas.js';

// Deterministic PRNG, so every visitor sees the same sand.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ease = (t) => 1 - Math.pow(1 - t, 3);
// Phones: centre a square figure in the band between the top of the intro and
// the lede, so the text pool does not swallow it; without that line, a third
// of the way down the first screen.
function portraitTop(h, side, clear) {
  return Number.isFinite(clear) && clear > 120 ? Math.max(8, (24 + clear - 14) / 2 - side / 2) : h * 0.32 - side / 2;
}

// ---------------- I · Origins — the Plimpton fan ----------------
// The fifteen rows of Plimpton 322 (the short side s and diagonal d, as
// transcribed and checked in sixty.js), each completed to a right triangle
// with an exact BigInt square root, scaled to one long side and sharing the
// right angle. Their hypotenuses fan from 44.76° down to 31.89°. Dashed in
// crimson, last: the 45° half-square, which no whole-number row can hold.
export function plimptonSlopes(rows) {
  return rows.map((r) => {
    const s = BigInt(r.s), d = BigInt(r.d), l2 = d * d - s * s;
    const l = BigInt(Math.round(Math.sqrt(Number(l2))));
    if (l * l !== l2) throw new Error('Plimpton row ' + r.row + ' is not a triple');
    return { row: r.row, slope: Number(s) / Number(l) };
  });
}

export async function originsBackdrop() {
  const { PLIMPTON_ROWS } = (await import('../exhibits/origins/sixty.js'))._test;
  const rows = plimptonSlopes(PLIMPTON_ROWS);
  return {
    prepare: (w, h, o = {}) => {
      let L = o.thumb ? w * 0.86 : o.portrait ? w * 0.72 : Math.min(w * 0.46, h * 0.58);
      // Wide screens: slide the fan right and down so the title sits in the empty
      // half-square above the dashed diagonal, and the rays pass beneath it.
      let ox = o.thumb ? w * 0.07 : o.portrait ? (w - L) / 2 : (w - L) / 2 + L * 0.26;
      let oy = o.thumb ? h * 0.93 : o.portrait ? h * 0.08 + L : Math.min(h * 0.97, h * 0.2 + L);
      // Phones: the whole fan above the lede, behind the title, so the text
      // pool does not swallow it.
      if (o.portrait && Number.isFinite(o.clear) && o.clear - 56 >= w * 0.5) {
        oy = o.clear - 16; L = Math.min(w * 0.72, oy - 40); ox = (w - L) / 2;
      }
      return { L, ox, oy };
    },
    paint: (ctx, { L, ox, oy }, w, h, t, o = {}) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = o.thumb ? 1 : 0.8;
      ctx.strokeStyle = P.goldDim; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + L, oy); ctx.lineTo(ox + L, oy - L); ctx.stroke();
      const shown = Math.floor(ease(Math.min(1, t / 0.8)) * rows.length);
      for (let i = 0; i < shown; i++) {
        const y = oy - L * rows[i].slope;
        ctx.globalAlpha = o.thumb ? 0.7 : 0.34;
        ctx.strokeStyle = P.gold;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + L, y); ctx.stroke();
        ctx.globalAlpha = o.thumb ? 0.9 : 0.65;
        ctx.fillStyle = P.goldBright;
        ctx.beginPath(); ctx.arc(ox + L, y, o.thumb ? 1.3 : 1.8, 0, 7); ctx.fill();
        if (!o.thumb) {
          ctx.globalAlpha = 0.5; ctx.fillStyle = P.inkDim;
          ctx.font = '10px ui-monospace, Menlo, monospace';
          ctx.fillText(String(rows[i].row), ox + L + 8, y + 3);
        }
      }
      if (t > 0.85) {                                      // the missing row, last
        ctx.globalAlpha = Math.min(1, (t - 0.85) / 0.15) * 0.9;
        ctx.lineWidth = o.thumb ? 1 : 1.1;
        ctx.strokeStyle = o.thumb ? P.crimson : (P.crimsonBright || P.crimson); ctx.setLineDash(o.thumb ? [3, 3] : [5, 6]);
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + L, oy - L); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    },
    caption: 'Behind this page: the fifteen rows of Plimpton 322 drawn as right triangles, ' +
      'scaled to one long side — and, dashed in red, the half-square that no row could hold.',
  };
}

// ---------------- II · Resonance — sand on a Chladni plate ----------------
// The nodal set of a square-plate mode, computed with the Chladni exhibit's
// own modeW / modeGrad. A random grain is kept only where |W| / |∇W| < δ, that
// is, within δ of a nodal line: the grains settle where the plate is still,
// which is the physics of the real experiment.
export async function resonanceBackdrop({ m = 5, n = 2, s = -1 } = {}) {
  const { modeW, modeGrad } = (await import('../exhibits/resonance/chladni.js'))._test;
  return {
    prepare: (w, h, o = {}) => {
      const side = o.thumb ? w : o.portrait ? w * 0.8 : Math.min(w * 0.62, h * 0.86);
      const x0 = (w - side) / 2, y0 = o.portrait ? portraitTop(h, side, o.clear) : (h - side) / 2;
      const rng = mulberry32(1787);                        // the year of Chladni's first figures, as a seed
      const tries = o.thumb ? 14000 : 70000, delta = o.thumb ? 0.012 : 0.0045;
      const gMax = 2 * Math.PI * (m + n);                  // |∇W| never exceeds this
      const pts = [];
      for (let i = 0; i < tries; i++) {
        const x = rng(), y = rng();
        const wv = Math.abs(modeW(x, y, m, n, s));
        if (wv > delta * gMax) continue;                   // cheap reject: far from every nodal line
        const [gx, gy] = modeGrad(x, y, m, n, s);
        if (wv < delta * Math.hypot(gx, gy)) pts.push(x0 + x * side, y0 + y * side);
      }
      return { pts, x0, y0, side };
    },
    paint: (ctx, { pts, x0, y0, side }, w, h, t, o = {}) => {
      ctx.clearRect(0, 0, w, h);
      if (!o.thumb) {
        ctx.strokeStyle = P.azureDim; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.8;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, side - 1, side - 1);
      }
      const k = Math.floor(ease(t) * (pts.length / 2));    // grains settle in random order
      ctx.fillStyle = P.ink; ctx.globalAlpha = o.thumb ? 0.75 : 0.34;
      const r = o.thumb ? 1 : 1.1;
      for (let i = 0; i < k; i++) ctx.fillRect(pts[2 * i], pts[2 * i + 1], r, r);
      ctx.globalAlpha = 1;
    },
    caption: `Behind this page: sand on a square plate in its (${m}, ${n}) figure, computed with ` +
      'Wheatstone’s shorthand from the Chladni exhibit — each grain kept only where the plate stands still.',
  };
}

// ---------------- III · Horizon — the diagonal, on a real list ----------------
// Row k is the binary expansion of 1/(k + 2), by exact long division. The red
// cells are the diagonal; the gold row beneath is that diagonal with every bit
// flipped, a number that differs from row k at digit k, and so is on no row.
export function binaryDigits(q, count) {                  // digits of 1/q after the binary point
  const out = new Uint8Array(count);
  let r = 1;
  for (let i = 0; i < count; i++) { r *= 2; if (r >= q) { out[i] = 1; r -= q; } }
  return out;
}
export function horizonBackdrop() {
  return {
    prepare: (w, h, o = {}) => {
      const cell = o.thumb ? 8 : 13;
      const span = o.thumb ? w : o.portrait ? w * 0.8 : Math.min(w * 0.6, h * 0.74);
      let N = Math.max(6, Math.floor(span / cell));
      let y0 = o.portrait ? h * 0.32 - (N + 1.6) * cell / 2 : (h - (N + 1.6) * cell) / 2;
      // The gold row is the point of the picture, so when the text leaves room
      // the whole list (and its gold row) sits above the lede, behind the title.
      const top = 24, bottom = Number.isFinite(o.clear) ? o.clear - 14 : 0;
      const fit = Math.floor((bottom - top) / cell - 1.6);
      if (!o.thumb && fit >= 14) {
        N = Math.min(N, fit);
        y0 = (top + bottom) / 2 - (N + 1.6) * cell / 2;
      }
      const rows = Array.from({ length: N }, (_, k) => binaryDigits(k + 2, N));
      const x0 = (w - N * cell) / 2;
      return { N, cell, rows, x0, y0 };
    },
    paint: (ctx, { N, cell, rows, x0, y0 }, w, h, t, o = {}) => {
      ctx.clearRect(0, 0, w, h);
      const shownRows = Math.floor(ease(Math.min(1, t / 0.7)) * N);
      const g = cell - 3;
      for (let k = 0; k < shownRows; k++) {
        for (let i = 0; i < N; i++) {
          const x = x0 + i * cell, y = y0 + k * cell;
          if (rows[k][i]) { ctx.globalAlpha = o.thumb ? 0.55 : 0.1; ctx.fillStyle = P.ink; ctx.fillRect(x, y, g, g); }
          else { ctx.globalAlpha = o.thumb ? 0.25 : 0.08; ctx.fillStyle = P.inkDim; ctx.fillRect(x + g / 2 - 0.5, y + g / 2 - 0.5, 1, 1); }
        }
      }
      if (t > 0.7) {                                        // the diagonal strikes
        const d = Math.min(N, Math.floor(((t - 0.7) / 0.3) * N));
        ctx.globalAlpha = o.thumb ? 0.95 : 0.7; ctx.strokeStyle = P.crimson; ctx.lineWidth = 1;
        for (let k = 0; k < d; k++) ctx.strokeRect(x0 + k * cell - 0.5, y0 + k * cell - 0.5, g + 1, g + 1);
        ctx.fillStyle = P.goldBright; ctx.globalAlpha = o.thumb ? 0.9 : 0.72;
        const yb = y0 + (N + 0.6) * cell;
        for (let k = 0; k < d; k++) {                       // the flipped diagonal: on no row
          if (!rows[k][k]) ctx.fillRect(x0 + k * cell, yb, g, g);
          else ctx.fillRect(x0 + k * cell + g / 2 - 1, yb + g / 2 - 1, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    },
    caption: 'Behind this page: the binary expansions of ½, ⅓, ¼, … one per row. Flip the red ' +
      'diagonal and you get the gold row, which differs from row k at digit k — and so is on no row at all.',
  };
}

// ---------------- IV · Engines — a curve over a finite field ----------------
// Every solution of y² = x³ + 7 (mod p). That is the equation of secp256k1
// (SEC 2), the curve Bitcoin signs with (BIP 340), here over a small prime
// instead of one near 2²⁵⁶. Mirror-symmetric about y = p/2, because (x, y) and
// (x, p − y) both solve it. The count includes the point at infinity.
export function curvePoints(p = 421, b = 7) {
  const pts = [];
  const byRes = new Map();
  for (let y = 0; y < p; y++) {
    const v = (y * y) % p;
    if (!byRes.has(v)) byRes.set(v, []);
    byRes.get(v).push(y);
  }
  for (let x = 0; x < p; x++) {
    const v = ((x * x % p) * x + b) % p;
    for (const y of byRes.get(v) || []) pts.push(x, y);
  }
  return { pts, count: pts.length / 2 + 1 };
}

export function enginesBackdrop({ p = 421 } = {}) {
  const { pts, count } = curvePoints(p);
  return {
    count,
    prepare: (w, h, o = {}) => {
      const side = o.thumb ? w * 0.94 : o.portrait ? w * 0.8 : Math.min(w * 0.56, h * 0.8);
      return { side, x0: (w - side) / 2, y0: o.portrait ? portraitTop(h, side, o.clear) : (h - side) / 2 };
    },
    paint: (ctx, { side, x0, y0 }, w, h, t, o = {}) => {
      ctx.clearRect(0, 0, w, h);
      const sx = side / p, xMax = ease(t) * p;            // the sweep: one x at a time, like the count
      if (!o.thumb) {
        // the field as a plot: two hairline axes with a tick every 60 residues
        const pad = 10;
        ctx.globalAlpha = 0.3; ctx.strokeStyle = P.verdigris || '#62b3a4'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x0 - pad + 0.5, y0); ctx.lineTo(x0 - pad + 0.5, y0 + side + pad + 0.5);
        ctx.lineTo(x0 + side, y0 + side + pad + 0.5);
        for (let v = 0; v <= p; v += 60) {
          const q = v * sx;
          ctx.moveTo(x0 + q, y0 + side + pad); ctx.lineTo(x0 + q, y0 + side + pad + 5);
          ctx.moveTo(x0 - pad, y0 + side - q); ctx.lineTo(x0 - pad - 5, y0 + side - q);
        }
        ctx.stroke();
        // (no drawn mirror line: it would strike through the epigraph; the
        // points show their own symmetry about y = p/2)
      }
      ctx.fillStyle = P.verdigris || '#62b3a4';
      ctx.globalAlpha = o.thumb ? 0.85 : 0.62;
      const r = o.thumb ? 1.6 : 2.4;
      for (let i = 0; i < pts.length; i += 2) {
        if (pts[i] > xMax) continue;
        ctx.fillRect(x0 + pts[i] * sx - r / 2, y0 + (p - 1 - pts[i + 1]) * sx - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
    },
    caption: `Behind this page: all ${count} points of y² = x³ + 7 over the integers mod ${p}, counting ` +
      'the point at infinity. It is the equation of the curve secp256k1, which Bitcoin signs with, ' +
      'shrunk from a 256-bit prime to a small one.',
  };
}
export const modernBackdrop = enginesBackdrop;             // the dossier's provisional name

// ---------------- mounting ----------------
// One canvas per intro, DPR capped at 1.5 (a backdrop is atmosphere, not a plate).
// prepare() runs in idle time once the intro is within a screen of the viewport;
// the reveal starts at 25% visibility, lasts 2.4 s, and then the loop stops for good.
export function mountBackdrop(section, bd, { reduced = false } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'mv-backdrop';
  cv.setAttribute('aria-hidden', 'true');
  section.prepend(cv);
  const ctx = cv.getContext('2d');
  let geom = null, key = '', t = reduced ? 1 : 0, revealed = reduced;

  // Where the lede begins, in canvas pixels (offsetTop ignores the scroll-reveal
  // translate). A backdrop may keep its key figure above this line.
  const lede = section.querySelector('.movement-lede');
  const clearLine = () => (lede && lede.offsetParent === section ? lede.offsetTop : NaN);

  function layout() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const clear = clearLine();
    const k = `${w}x${h}@${dpr}:${Math.round(clear)}`;
    if (k === key) return false;
    key = k;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { geom = bd.prepare(w, h, { portrait: h > w * 1.3, clear }); } catch { geom = null; }
    return true;
  }
  const paint = () => {
    if (!geom) return;
    try { bd.paint(ctx, geom, cv.clientWidth, cv.clientHeight, t); } catch { /* atmosphere only */ }
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));

  const loop = rafLoop((dt) => {
    t = Math.min(1, t + dt / 2.4);
    paint();
    if (t >= 1) loop.stop();
  });
  const near = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    near.disconnect();
    idle(() => { layout(); paint(); });
  }, { rootMargin: '100% 0px' });
  near.observe(section);
  const seen = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || revealed) return;
    revealed = true; seen.disconnect();
    if (!geom) layout();
    loop.start();
  }, { threshold: 0.25 });
  if (!revealed) seen.observe(section);

  let pending = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(() => { if (geom && layout()) paint(); }, 150);
  });
  ro.observe(cv);
  ro.observe(section);                                     // the lede can move without the canvas resizing
  return {
    canvas: cv,
    finish() { revealed = true; seen.disconnect(); loop.stop(); t = 1; layout(); if (!geom) { key = ''; layout(); } paint(); },
    destroy() { loop.stop(); near.disconnect(); seen.disconnect(); ro.disconnect(); clearTimeout(pending); cv.remove(); },
  };
}
