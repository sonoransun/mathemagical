// I·1 — One, Two, Many
// Subitizing (the perceptual edge near four), one-to-one correspondence (the
// pebble pouch), the first notation (grouping, carved beside the Border Cave and
// Ishango bones), and the compression argument for positional numerals.
//
// Data transcribed at build time and checked against sources:
// · Ishango columns, Jean de Heinzelin's reading as given by UNESCO's Portal to the
//   Heritage of Astronomy: G 11,13,17,19 (=60) · M 3,6,4,8,10,5,5,7 (=48) ·
//   D 11,21,19,9 (=60). The prime/lunar/base-12 readings are stories and live only
//   in the legend panel; O. Keller's doubts (Bibnum, Aug. 2010, quoted in
//   Pletser & Huylebrouck, arXiv:1607.00860) drive the "doubts" toggle.
// · Border Cave fibula, d'Errico et al., Phil. Trans. R. Soc. B 373 (2018):
//   29 notches numbered from the distal end; tool sets 1–8 · 10–12 ·
//   14–19, 21, 23–29 · then 9, 13, 20 and 22 "added in between already carved
//   notches".
// · Jevons, "The Power of Numerical Discrimination", Nature 3 (1871) 281–282,
//   as tabulated in the R package HistData ("Jevons"; 1,027 trials).

import { palette as P } from '../../core/canvas.js';
import { TAU, clamp } from '../../core/math.js';

/* ================= pure logic (exported for node tests) ================= */

// Deterministic PRNG (mulberry32) so trials are reproducible under test.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Place n dots in a w×h region, pairwise separation ≥ 2.6·r, kept r·2 clear of
// the edges. Rejection sampling with a jittered-grid fallback; the separation
// guarantee holds whenever the region can hold n dots at that spacing (always
// true for the exhibit's n ≤ 9 in a ~460×200 region).
export function genDots(n, w, h, r = 9, rng = Math.random) {
  const minSep = r * 2.6, pad = r * 2;
  const W = Math.max(1, w - pad * 2), H = Math.max(1, h - pad * 2);
  const sep2 = minSep * minSep;
  for (let attempt = 0; attempt < 40; attempt++) {
    const pts = [];
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      let placed = false;
      for (let t = 0; t < 150; t++) {
        const x = pad + rng() * W, y = pad + rng() * H;
        if (pts.every((p) => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) >= sep2)) {
          pts.push({ x, y }); placed = true; break;
        }
      }
      if (!placed) ok = false;
    }
    if (ok) return pts;
  }
  // Jittered grid: neighbouring cells are min(cw,ch) apart, jitter is bounded
  // by (min(cw,ch) − minSep)/2, so separation survives (diagonals included).
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (W / H)))) || 1;
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = W / cols, ch = H / rows;
  const jit = Math.max(0, (Math.min(cw, ch) - minSep) / 2);
  const order = [...Array(cols * rows).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pts = [];
  for (let k = 0; k < n; k++) {
    const c = order[k] % cols, rw = Math.floor(order[k] / cols);
    pts.push({
      x: pad + c * cw + cw / 2 + (rng() * 2 - 1) * jit,
      y: pad + rw * ch + ch / 2 + (rng() * 2 - 1) * jit,
    });
  }
  return pts;
}

// Shuffled deck of trial counts: every n in [lo, hi], `reps` times each.
export function makeDeck(rng = Math.random, lo = 1, hi = 9, reps = 2) {
  const deck = [];
  for (let rep = 0; rep < reps; rep++) for (let n = lo; n <= hi; n++) deck.push(n);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Digits of a non-negative integer in base b, most significant first.
export function toBase(n, b) {
  n = Math.max(0, Math.floor(n));
  if (n === 0) return [0];
  const out = [];
  while (n > 0) { out.unshift(n % b); n = Math.floor(n / b); }
  return out;
}

// Symbols a reader must take in to grasp a record of n:
//   tally    — one stroke per item: n
//   grouped  — completed five-groups read as single chunks, plus leftovers:
//              ⌊n/5⌋ + (n mod 5)
//   signs    — Egyptian hieroglyphic (sign-value): one sign per power of ten,
//              repeated — the decimal digit sum
//   digits   — positional decimal: ⌊log₁₀ n⌋ + 1
//   places   — positional base sixty: ⌊log₆₀ n⌋ + 1
//   bits     — positional binary: ⌊log₂ n⌋ + 1
export function compressionCounts(n) {
  n = Math.max(0, Math.floor(n));
  const s = String(n);
  let signs = 0;
  for (const ch of s) signs += ch.charCodeAt(0) - 48;
  return {
    tally: n,
    grouped: Math.floor(n / 5) + (n % 5),
    signs,
    digits: s.length,
    places: toBase(n, 60).length,
    bits: toBase(n, 2).length,
  };
}

// Robert Morris's approximate counter (CACM, 1978), in its base-2 form: the
// register keeps only v ≈ log₂(n + 1), and n is read back as 2^v − 1. Returns
// the exponent v and the bits the register needs to hold it: log log n.
export function morrisRegister(n) {
  n = Math.max(0, Math.floor(n));
  const v = Math.round(Math.log2(n + 1));
  return { v, bits: toBase(v, 2).length, estimate: 2 ** v - 1 };
}

// Per-n accuracy and mean correct-answer response time from a stats record
// { n: { tries, correct, rtSum, rtN } }. Unseen n → null.
export function statsSeries(stats, lo = 1, hi = 9) {
  const acc = [], rt = [];
  for (let n = lo; n <= hi; n++) {
    const s = stats[n];
    acc.push(s && s.tries ? s.correct / s.tries : null);
    rt.push(s && s.rtN ? s.rtSum / s.rtN : null);
  }
  return { acc, rt };
}

// The visitor's measured edge: scanning upward through the counts actually
// shown, the first count with any wrong answer. Returns null while there are
// no misses, else { flawlessTo (largest perfect count below it, or null), firstMiss }.
export function measuredEdge(stats, lo = 1, hi = 9) {
  let lastPerfect = null;
  for (let n = lo; n <= hi; n++) {
    const s = stats[n];
    if (!s || !s.tries) continue;
    if (s.correct < s.tries) return { flawlessTo: lastPerfect, firstMiss: n };
    lastPerfect = n;
  }
  return null;
}

// The visitor's edge, read so that one stray slip does not move it: scanning
// upward through the counts actually shown, the edge is the first count with a
// miss whose next shown count also has a miss (or which is the largest count
// shown), i.e. where the misses begin to persist. Misses below it are slips.
// Jevons's beans by this rule: 4 | 5. Returns null when no miss persists, else
// { edge, slips, below: [correct, tries], above: [correct, tries] }.
export function fitEdge(stats, lo = 1, hi = 9) {
  const shown = [];
  for (let n = lo; n <= hi; n++) {
    const s = stats[n];
    if (s && s.tries) shown.push({ n, c: s.correct, t: s.tries, miss: s.correct < s.tries });
  }
  let k = -1;
  for (let i = 0; i < shown.length; i++) {
    if (shown[i].miss && (i === shown.length - 1 || shown[i + 1].miss)) { k = i; break; }
  }
  if (k < 0) return null;
  const below = [0, 0], above = [0, 0], slips = [];
  shown.forEach((s, i) => {
    const b = i < k ? below : above;
    b[0] += s.c; b[1] += s.t;
    if (i < k && s.miss) slips.push(s.n);
  });
  return { edge: shown[k].n, slips, below, above };
}

// Jevons 1871: { beans: [correct, total] } over his 1,027 throws.
export const JEVONS_1871 = {
  3: [23, 23], 4: [65, 65], 5: [102, 107], 6: [120, 147], 7: [113, 156], 8: [76, 135],
  9: [76, 122], 10: [46, 107], 11: [26, 69], 12: [19, 45], 13: [6, 26], 14: [4, 14], 15: [2, 11],
};

// Canonical "dice face" arrangements in [−1, 1]²; for 5 the centre comes last.
export function diceLayout(n) {
  const C = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const map = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: C,
    5: [...C, [0, 0]],
    6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
    7: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1], [0, 0]],
    8: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    9: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  };
  return (map[n] || []).map(([x, y]) => ({ x, y }));
}

// Greedy word wrap with an injected measure(s) → width, so it is node-testable.
export function wrapText(measure, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (!cur || measure(next) <= maxW) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Rings of five for the carving: centres and radius for k rings in width W.
// One row while rings can sit ≥ 2.4 r apart at r ≥ 22, otherwise two rows.
export function ringLayout(k, W, y, maxR = 34) {
  const avail = Math.max(60, W - 40);
  let rows = 1, perRow = k;
  let spacing = Math.min(120, avail / Math.max(1, perRow));
  let r = Math.min(maxR, spacing / 2.4);
  if (r < 22 && k > 1) {
    rows = 2; perRow = Math.ceil(k / 2);
    spacing = Math.min(120, avail / perRow);
    r = Math.max(16, Math.min(maxR, spacing / 2.4));
  }
  const pts = [];
  for (let i = 0; i < k; i++) {
    const row = rows === 1 ? 0 : Math.floor(i / perRow);
    const inRow = rows === 1 ? k : (row === 0 ? perRow : k - perRow);
    const col = rows === 1 ? i : i - row * perRow;
    const x0 = W / 2 - (spacing * (inRow - 1)) / 2;
    pts.push({ x: x0 + col * spacing, y: y - (rows - 1 - row) * (2 * r + 18) });
  }
  return { r, rows, pts };
}

// Best-candidate sampling: of k random points in the box, the one farthest from
// every point in `others` (vertical distance counted double, since depth on the
// ground is foreshortened). Spreads a flock without a grid's regularity.
export function pickSpread(box, others, rng = Math.random, k = 14) {
  let best = null, bd = -1;
  for (let i = 0; i < k; i++) {
    const x = box.x0 + rng() * Math.max(0, box.x1 - box.x0);
    const y = box.y0 + rng() * Math.max(0, box.y1 - box.y0);
    let d = Infinity;
    for (const o of others) {
      const dx = o.x - x, dy = (o.y - y) * 2;
      d = Math.min(d, dx * dx + dy * dy);
    }
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best;
}

// The real notch groups. Columns run the length of the bone.
export const ISHANGO = {
  left: [11, 13, 17, 19],            // = 60
  middle: [3, 6, 4, 8, 10, 5, 5, 7], // = 48; 3→6 and 4→8 sit side by side
  right: [11, 21, 19, 9],            // = 60
};
export const LEBOMBO_NOTCHES = 29;   // the bone is a broken fragment; 29 may be partial

// d'Errico et al. 2018: sets by tool, as the paper numbers them (1–8 · 10–12 ·
// 14–19, 21, 23–29), then the notches "added in between already carved
// notches" (9, 13, 20 with a fourth edge; 22 probably with a fifth). The paper
// finds notches 1–8 fresher than the rest, "probably the last cut" of the three
// sets, and the insertions "incised after completion of the first three sets";
// it does not order the sets 10–12 and 14–29, so ours is a choice.
export const LEBOMBO_SETS = [
  { tool: 3, notches: [14, 15, 16, 17, 18, 19, 21, 23, 24, 25, 26, 27, 28, 29], later: false },
  { tool: 2, notches: [10, 11, 12], later: false },
  { tool: 1, notches: [1, 2, 3, 4, 5, 6, 7, 8], later: false },
  { tool: 4, notches: [9, 13, 20], later: true },
  { tool: 5, notches: [22], later: true },
];

// Timeline (seconds from the start of the carving) for the bone scene:
// your own stick, its split, the Border Cave sets, then Ishango's 16 groups.
export function carveTimeline(total) {
  const stick = [];
  let t = 0.2;
  for (let i = 0; i < total; i++) {
    stick.push(t);
    t += 0.05;
    if (i % 5 === 4) t += 0.12;
  }
  const split = t + 0.2;
  let u = split + 0.8;
  const leb = [];
  const setStart = [];
  for (const s of LEBOMBO_SETS) {
    if (s.later) u += 0.35;
    setStart.push(u);
    for (const n of s.notches) { leb.push({ notch: n, tool: s.tool, later: s.later, t: u }); u += s.later ? 0.22 : 0.055; }
    u += 0.28;
  }
  const ish0 = u + 0.45, ishStep = 0.24;
  const ish = [];
  for (let g = 0; g < 16; g++) ish.push(ish0 + g * ishStep);
  return { stick, split, leb, setStart, ish, ishStep, end: ish0 + 16 * ishStep };
}

// Notch positions for a count carved in fives on a stick: four uprights and a
// gate across them per full handful, then the remainder. x is relative to the
// first notch; returns the marks and the span they occupy.
export function stickMarks(total, pitch = 6, gap = 12) {
  const marks = [];
  const full = Math.floor(total / 5);
  let gx = 0;
  for (let g = 0; g * 5 < total; g++) {
    const n = Math.min(5, total - g * 5);
    for (let k = 0; k < n; k++) {
      if (k === 4 && g < full) marks.push({ gate: true, x0: gx - 2, x1: gx + 3 * pitch + 2 });
      else marks.push({ gate: false, x: gx + k * pitch });
    }
    gx += (n === 5 ? 3 * pitch : (n - 1) * pitch) + gap;
  }
  return { marks, width: Math.max(0, gx - gap) };
}

/* ================= small helpers (pure; no DOM at import) ================= */

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const TEXT_FAINT = '#8a8676';   // the site's --ink-faint text token (P.inkFaint is decorative)
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
function hexRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

// A run of plain strokes, one per item, clipped at maxX. Returns what fit.
function drawStrokeRun(ctx, x, y, count, opts = {}) {
  const pitch = opts.pitch ?? 5, h = opts.h ?? 26, maxX = opts.maxX ?? Infinity;
  let cx = x, drawn = 0;
  ctx.beginPath();
  while (drawn < count && cx <= maxX) {
    ctx.moveTo(Math.round(cx) + 0.5, y); ctx.lineTo(Math.round(cx) + 0.5, y + h);
    cx += pitch; drawn++;
  }
  ctx.stroke();
  return { drawn, endX: cx, overflow: drawn < count };
}

// Five-grouped tally: ||||-with-gate chunks, then leftover strokes.
function drawTallyRun(ctx, x, y, count, opts = {}) {
  const pitch = opts.pitch ?? 7, gap = opts.gap ?? 10, h = opts.h ?? 24;
  const maxX = opts.maxX ?? Infinity;
  const groups = Math.floor(count / 5), rem = count % 5;
  let cx = x, symbols = 0, overflow = false;
  ctx.beginPath();
  for (let g = 0; g < groups; g++) {
    if (cx + 3 * pitch > maxX) { overflow = true; break; }
    for (let i = 0; i < 4; i++) { ctx.moveTo(cx + i * pitch, y); ctx.lineTo(cx + i * pitch, y + h); }
    ctx.moveTo(cx - 2, y + h - 2); ctx.lineTo(cx + 3 * pitch + 2, y + 2);
    cx += 3 * pitch + gap; symbols++;
  }
  if (!overflow) {
    for (let i = 0; i < rem; i++) {
      if (cx > maxX) { overflow = true; break; }
      ctx.moveTo(cx, y); ctx.lineTo(cx, y + h);
      cx += pitch; symbols++;
    }
  }
  ctx.stroke();
  return { symbols, endX: cx, overflow };
}

// Egyptian hieroglyphic numeral signs, schematic line drawings in a ~10×18 box.
// p = power of ten (0 stroke · 1 hobble · 2 coil · 3 lotus · 4 finger · 5 tadpole · 6 Heh).
function drawHiero(ctx, p, x, y) {
  ctx.beginPath();
  switch (p) {
    case 0: ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2, y + 18); break;
    case 1: ctx.moveTo(x + 1, y + 18); ctx.lineTo(x + 1, y + 9); ctx.arc(x + 5, y + 9, 4, Math.PI, 0); ctx.lineTo(x + 9, y + 18); break;
    case 2: {
      const cx = x + 5, cy = y + 12;
      for (let k = 0; k <= 34; k++) {
        const a = (k / 34) * 3.2 * Math.PI, r = 0.6 + a * 0.42;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.lineTo(cx + 2, y + 2);
      break;
    }
    case 3:
      ctx.moveTo(x + 5, y + 18); ctx.lineTo(x + 5, y + 8);
      ctx.moveTo(x + 5, y + 8); ctx.quadraticCurveTo(x + 0, y + 6, x + 2, y + 1);
      ctx.moveTo(x + 5, y + 8); ctx.quadraticCurveTo(x + 10, y + 6, x + 8, y + 1);
      ctx.moveTo(x + 5, y + 14); ctx.quadraticCurveTo(x + 9, y + 13, x + 10, y + 10);
      break;
    case 4: ctx.moveTo(x + 4, y + 18); ctx.lineTo(x + 4, y + 5); ctx.quadraticCurveTo(x + 4, y + 1, x + 8, y + 2); ctx.lineTo(x + 9, y + 5); break;
    case 5:
      ctx.moveTo(x + 7, y + 13); ctx.arc(x + 4, y + 13, 3, 0, TAU);
      ctx.moveTo(x + 6, y + 10.5); ctx.quadraticCurveTo(x + 10, y + 7, x + 7, y + 1);
      break;
    default:
      ctx.moveTo(x + 7, y + 4); ctx.arc(x + 5, y + 4, 2, 0, TAU);
      ctx.moveTo(x + 5, y + 6); ctx.lineTo(x + 5, y + 13);
      ctx.lineTo(x + 1, y + 18); ctx.moveTo(x + 5, y + 13); ctx.lineTo(x + 9, y + 16);
      ctx.moveTo(x + 5, y + 8); ctx.lineTo(x + 1, y + 1);
      ctx.moveTo(x + 5, y + 8); ctx.lineTo(x + 9, y + 1);
  }
  ctx.stroke();
}

// Cuneiform stand-ins: vertical wedge (one) and corner wedge (ten), scale u.
function wedgeOne(ctx, x, y, u) {
  ctx.beginPath();
  ctx.moveTo(x - 0.2 * u, y); ctx.lineTo(x + 0.2 * u, y);
  ctx.lineTo(x + 0.05 * u, y + 0.34 * u); ctx.lineTo(x + 0.035 * u, y + 0.82 * u);
  ctx.lineTo(x - 0.035 * u, y + 0.82 * u); ctx.lineTo(x - 0.05 * u, y + 0.34 * u);
  ctx.closePath(); ctx.fill();
}
function wedgeTen(ctx, x, y, u) {
  ctx.beginPath();
  ctx.moveTo(x + 0.5 * u, y + 0.1 * u); ctx.lineTo(x, y + 0.36 * u); ctx.lineTo(x + 0.5 * u, y + 0.62 * u);
  ctx.lineTo(x + 0.5 * u, y + 0.48 * u); ctx.lineTo(x + 0.18 * u, y + 0.36 * u); ctx.lineTo(x + 0.5 * u, y + 0.24 * u);
  ctx.closePath(); ctx.fill();
}
// One sexagesimal digit (0..59) at (x, y); returns width drawn.
function drawSexDigit(ctx, v, x, y, u) {
  const tens = Math.floor(v / 10), ones = v % 10;
  let cx = x;
  for (let i = 0; i < tens; i++) { wedgeTen(ctx, cx, y, u); cx += 0.44 * u; }
  if (tens && ones) cx += 0.14 * u;
  if (ones) {
    const rows = ones <= 3 ? 1 : ones <= 8 ? 2 : 3;
    const per = Math.ceil(ones / rows);
    const su = rows === 1 ? u : (u * 1.12) / rows;
    for (let i = 0; i < ones; i++) {
      const r = Math.floor(i / per), c = i % per;
      wedgeOne(ctx, cx + 0.2 * u + c * 0.3 * u, y + r * su * 0.86, su);
    }
    cx += 0.2 * u + per * 0.3 * u;
  }
  if (!tens && !ones) cx += 0.3 * u;
  return cx - x;
}

/* ================= the exhibit ================= */

export default {
  id: 'tally',
  movement: 1,
  title: 'One, Two, Many',
  hook: 'Count a flock without knowing how to count.',
  era: 'c. 43,000 BP – 1834 · Border Cave, Ishango, Susa, Westminster',
  chronicle: [
    { year: -41050, date: 'c. 43,000 BP', text: 'At Border Cave in the Lebombo Mountains, someone notches a baboon fibula with four, possibly five, different cutting edges, coming back to squeeze new notches in between old ones; 29 survive on the broken shaft.' },
    { year: -18050, date: 'c. 20,000 BP', text: 'On the shore of Lake Edward, a quartz-tipped baboon fibula is cut with three columns of grouped notches: the <em>Ishango bone</em>, found in 1950.' },
    { year: -3300, date: 'c. 3300 BCE', text: 'At Susa, accountants press clay tokens into the outside of the hollow clay envelopes that hold them, so that each envelope shows what it contains.' },
    { year: 1739, date: '1739', text: 'David Hume’s <em>Treatise of Human Nature</em> defines equal numbers by pairing: one “has always an unite answering to every unite of the other.”' },
    { year: 1834, date: '16 October 1834', text: 'Eight years after the English Exchequer abolished its tally sticks, two cartloads of them are burned in the furnaces beneath the House of Lords, and the fire that follows destroys most of the Palace of Westminster.' },
    { year: 1871, date: '9 February 1871', text: 'In <em>Nature</em>, W. Stanley Jevons reports 1,027 glances at black beans: never wrong at three or four, wrong 5 times in 107 at five.' },
    { year: 1949, date: '1949', text: 'Kaufman, Lord, Reese and Volkmann name the instant, exact judgement of small numbers <em>subitizing</em>, from the Latin <em>subitus</em>, sudden.' },
    { year: 2023, date: 'October 2023', text: 'Single-neuron recordings in the human medial temporal lobe, by a Bonn–Tübingen team, find a boundary in number coding around four: sharp tuning below it, ratio-bound estimation above.' },
  ],
  today: `
    <p>The edge has now been seen inside the skull. In 2023 a team in Bonn and Tübingen recorded
    single neurons in the medial temporal lobes of neurosurgical patients as they judged numbers,
    and found the code itself changing near four: below it, cells tuned sharply to each small
    number; above it, tuning that blurs in proportion to size, the signature of estimation. The
    same Tübingen laboratory had already found number-tuned units arising unbidden in an
    artificial network trained only to recognize objects.</p>
    <p>The pouch has heirs too. A leftover pebble says <em>that</em> a sheep is missing, never
    <em>which</em>; Richard Hamming’s step, in 1950, was to lay the checks out so that the leftover
    spells the address of the error, the idea behind <a href="#ex-selfheal">The Checking
    Number</a>. And compression did not stop at
    the numeral. In 1978 Robert Morris of Bell Labs showed that one 8-bit byte could keep an
    approximate count of as many as 130,000 events. HyperLogLog, analysed by Philippe Flajolet
    and colleagues in 2007, keeps the same kind of frugal register to estimate how many
    <em>distinct</em> things a stream holds: beyond a billion, to about 2 percent, in 1.5
    kilobytes. A numeral grows with the
    logarithm of the count; these registers grow with the logarithm of the logarithm, and pay for
    it in exactness, the bargain <a href="#ex-lossy">The Art of Forgetting</a> strikes with every
    photograph.</p>
    <p>The oldest notation of all is still being standardized. Since Unicode 11.0 in June 2018,
    the five-bar tally and the East Asian tally that builds 正 stroke by stroke have had code
    points of their own.</p>`,
  sources: [
    { text: 'Francesco d’Errico et al., “From number sense to number symbols. An archaeological perspective,” <em>Philosophical Transactions of the Royal Society B</em> 373 (2018)', url: 'https://doi.org/10.1098/rstb.2016.0518' },
    { text: 'Royal Belgian Institute of Natural Sciences, “The Ishango bone”', url: 'https://www.naturalsciences.be/en/museum/exhibitions-activities/exhibitions/250-years-of-natural-sciences/the-ishango-bone' },
    { text: 'UNESCO Portal to the Heritage of Astronomy, “Ishango bone”', url: 'https://web.astronomicalheritage.net/show-entity?identity=4&idsubentity=1' },
    { text: 'W. Stanley Jevons, “The Power of Numerical Discrimination,” <em>Nature</em> 3 (1871) 281–282', url: 'https://doi.org/10.1038/003281a0' },
    { text: 'Lana M. Trick and Zenon W. Pylyshyn, “Why are small and large numbers enumerated differently?” <em>Psychological Review</em> 101 (1994) 80–102', url: 'https://doi.org/10.1037/0033-295X.101.1.80' },
    { text: 'Michael C. Frank, Daniel L. Everett, Evelina Fedorenko and Edward Gibson, “Number as a cognitive technology: Evidence from Pirahã language and cognition,” <em>Cognition</em> 108 (2008)', url: 'https://doi.org/10.1016/j.cognition.2008.04.007' },
    { text: 'Esther F. Kutter et al., “Distinct neuronal representation of small and large numbers in the human medial temporal lobe,” <em>Nature Human Behaviour</em> 7 (2023)', url: 'https://doi.org/10.1038/s41562-023-01709-3' },
    { text: '<em>The Dialogue concerning the Exchequer</em> (c. 1180), Avalon Project, Yale Law School', url: 'https://avalon.law.yale.edu/medieval/excheq.asp' },
    { text: 'Denise Schmandt-Besserat, token archive and essays, University of Texas at Austin', url: 'https://sites.utexas.edu/dsb/tokens/' },
    { text: 'Philippe Flajolet, Éric Fusy, Olivier Gandouet and Frédéric Meunier, “HyperLogLog: the analysis of a near-optimal cardinality estimation algorithm,” AofA 2007', url: 'https://dmtcs.episciences.org/3545' },
  ],
  alt: 'Four stations on one canvas: dots flash for a quarter of a second and your answers are charted beside Jevons’s 1871 data; sheep leave and return past a pebble pouch, or with the pouch left at home; pebbles are grouped in fives, carved on a split stick and set beside schematic Border Cave and Ishango bones; and a slider compares tally, grouped, Egyptian, decimal, base-sixty and binary records of a flock of up to seven million, with Morris’s approximate counter.',
  prose: `
    <p>Before arithmetic there is a reflex. One dot, two, three, four: a glimpse too brief to
    count through is enough to know exactly which, with no feeling of effort. The experiment is
    older than its name. In 1871 the economist William Stanley Jevons tossed black beans into a
    box, an uncertain number at a time, and named each total at once, “without the least
    hesitation.” In 1,027 throws he was never wrong at three beans or at four; at five he missed
    five times in 107, and at ten he was wrong more often than right. The limit, he suspected, “is
    not really a definite one, and it is almost sure to vary somewhat in different individuals.”
    Psychologists named the reflex in 1949, <em>subitizing</em>, from the Latin
    <em>subitus</em>, sudden, and have been mapping its edge ever since. It lies near four, a
    little lower for some people and some conditions, a little higher for others. Past it the mind
    must either count in series, at roughly 250 to 350 milliseconds an item, or estimate, and be
    only roughly right. The first station below runs
    the classic experiment on you. We ask you to take nothing in this essay on authority, so the
    edge is yours to find, and to fall off, personally.</p>
    <p>Mathematics begins as a technology for living beyond that edge, and its first invention
    is not the number. It is the <em>pairing</em>. A herder who drops one pebble in a pouch for
    every sheep that leaves the pen owns, by dusk, a question-answering machine: sheep come home,
    pebbles come out, and any pebble left over is a missing animal, a leftover small enough to see
    at a glance, which is exactly why the trick works. Nobody involved knows <em>how many</em>
    sheep there are, and nobody needs to.</p>
    <p>The Pirahã of the Amazon, whose language has no word for
    any exact quantity, not even <em>one</em>, show where the line falls: asked to lay out a row
    matching a row in front of them, they paired even large sets perfectly; asked to match a row
    they could no longer see, they faltered. Pairing needs no numbers. It needs a memory that
    outlasts the moment, and that is what the pouch is; the second station lets you leave it at
    home and see how far memory alone will carry you. David Hume wrote the rule down in 1739 —
    “when two numbers are so combin’d, as that the one has always an unite answering to every
    unite of the other, we pronounce them equal” — and in 1884 Gottlob Frege made it the ground of
    his definition of number. Keep that humble rule; in the essay’s third movement it becomes the
    instrument that <a href="#ex-cantor">weighs one infinity against another</a>.</p>
    <p>The pebbles were perishable; the notches survive. A baboon fibula from Border Cave in the
    Lebombo Mountains, between South Africa and Eswatini, carries 29 notches and an age of some
    43,000 years, and because it is a broken fragment, 29 need not be the carver’s total. Under
    the microscope it stops being a single act. The notches were cut with four, possibly five,
    different edges, and the last of them were squeezed in between notches already there. Someone
    came back to the bone, which is what a record is for.</p>
    <p>The Ishango bone, found in 1950 in excavations led by the Belgian geologist Jean de
    Heinzelin on the Congolese shore of Lake Edward, is another baboon fibula, about ten
    centimetres long, still tipped with a fragment of quartz. It is some
    20,000 years old and stranger still: three columns of notches cut in deliberate groups, and
    in the middle column a 3 beside a 6, a 4 beside an 8, pairs that look
    for all the world like doubling, though the column is worn enough that one sceptic reads its
    10 as a possible 9. What the columns meant, no one knows; the confident stories live in the
    panel below. What the bones show is enough: <em>grouping</em>. Nineteen scratches in a row are
    unreadable at a glance; nineteen as three handfuls and a remainder is not. Chunking marks back
    under the perceptual limit is the first act of notation, and it served minds exactly like
    ours. These bones record no deficiency of ancient brains; they are a workaround for
    <em>all</em> brains, yours included.</p>
    <p>The notch had a long afterlife, and English still keeps it. A <em>score</em> is twenty because Old Norse <em>skor</em> meant a notch, probably one
    cut in a stick for every twenty of a passing flock. To <em>tally</em> is to match, because a
    tally stick was split lengthwise through its notches and each party kept a half that fitted
    only its twin: the pouch’s one-to-one test, carved in wood. England’s Exchequer kept its
    accounts that way from the twelfth century until 1826, with a notch the thickness of a palm
    for a thousand pounds and a swelling grain of barley for one. In October 1834 two cartloads of
    the retired sticks went into the furnaces beneath the House of Lords, and, as Charles Dickens
    told it in 1855, “the panelling set fire to the House of Lords; the House of Lords
    set fire to the House of Commons.”</p>
    <p>Once marks exist, they beg to be compressed. A tally spends one mark per sheep. Grouped in
    fives it spends the same marks but asks for a fifth as many glances. Egypt’s hieroglyphs spend
    a sign per power of ten, repeated as often as needed: a carving from Karnak of around 1500 BCE
    needs fifteen signs to write 276. A positional numeral, the trick Babylon perfects two
    exhibits from here, spends one symbol per power, so seven million animals fit in seven
    digits. The last station lets you watch the notations part company as the flock grows: the
    tally walks out of the room, the handfuls follow it, and the numeral barely lengthens. That
    gap, linear against logarithmic, is the entire economic case for arithmetic, and it was
    visible three and a half thousand years before John Napier published his logarithms in
    1614.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;

    /* ---------- shared state ---------- */
    let phase = 'flash';        // 'flash' | 'pouch' | 'carve' | 'compress'
    let lastT = 0;              // rAF clock (s), updated every frame
    let dirty = true;           // redraw needed even if nothing animates
    let animating = true;       // the last frame asked for another
    const bus = audio.createBus('tally');
    const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep default */ }
    const fnt = (px, fam = MONO, style = '') => `${style ? style + ' ' : ''}${px}px ${fam}`;
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reduced = !!(mq && mq.matches);
    const onMotionPref = () => { reduced = !!(mq && mq.matches); dirty = true; };
    if (mq && mq.addEventListener) mq.addEventListener('change', onMotionPref);

    function sfx(kind, opts = {}, delay = 0) {
      try {
        const c = bus.context;
        if (!c) return;
        audio.drums[kind](bus, c.currentTime + delay, opts);
      } catch { /* audio is optional */ }
    }

    const style = document.createElement('style');
    style.textContent = `
      #ex-tally .tally-answers { display:grid; grid-template-columns:repeat(9, minmax(0, 2.6rem)); gap:.3rem;
        justify-content:center; margin:.6rem 0 .15rem; }
      #ex-tally .tally-answers .btn { min-width:0; padding-left:0; padding-right:0; font-family:var(--mono, monospace);
        font-variant-numeric:lining-nums tabular-nums; }
      #ex-tally .tally-hidden { display:none !important; }
      #ex-tally .tally-sub .controls { margin-top:.55rem; gap:.6rem 1rem; }
      #ex-tally .tally-phases { gap:.45rem .5rem; }
    `;
    stage.appendChild(style);

    /* ---------- layout ---------- */
    const phaseRow = ui.controlRow(stage);
    phaseRow.classList.add('tally-phases');
    const PHASES = [
      ['flash', 'I · the flash'],
      ['pouch', 'II · the pouch'],
      ['carve', 'III · the carving'],
      ['compress', 'IV · compression'],
    ];
    const phaseBtns = {};
    for (const [id, label] of PHASES) {
      const b = ui.button(phaseRow, label, () => setPhase(id), { small: true });
      b.type = 'button';
      phaseBtns[id] = b;
    }

    const quest = ui.questBanner(stage, '');
    const handle = cv.setupCanvas(stage, { height: 440 });
    handle.canvas.style.touchAction = 'pan-y';

    const sub = document.createElement('div');
    sub.className = 'tally-sub';
    stage.appendChild(sub);
    const subFlash = document.createElement('div');
    const subPouch = document.createElement('div');
    const subCarve = document.createElement('div');
    const subCompress = document.createElement('div');
    for (const d of [subFlash, subPouch, subCarve, subCompress]) sub.appendChild(d);

    const info = ui.readout(stage, '');
    const mathlineEl = ui.mathline(stage,
      'marks to record <em>n</em>:&nbsp; tally = n &nbsp;·&nbsp; grouped ≈ n/5 &nbsp;·&nbsp; ' +
      'Egyptian = digit sum of n &nbsp;·&nbsp; decimal = ⌊log₁₀ n⌋ + 1 &nbsp;·&nbsp; base sixty = ⌊log₆₀ n⌋ + 1 &nbsp;·&nbsp; ' +
      'binary = ⌊log₂ n⌋ + 1 &nbsp;·&nbsp; Morris’s counter ≈ log₂ log₂ n bits, for a rough count');
    ui.caption(stage,
      'Four stations, in order: fail to count; count without numbers; invent notation; discover ' +
      'compression. The flash charts your answers beside Jevons’s beans of 1871. The carving ends ' +
      'on the Border Cave fibula, notched set by set with the four squeezed-in notches last, as its ' +
      'microscopy suggests, and on the ' +
      'Ishango columns as Jean de Heinzelin read them: 11·13·17·19, then 3·6·4·8·10·5·5·7, then ' +
      '11·21·19·9. Both bones are drawn schematically.');
    ui.legendPanel(stage, `
      <p>The left column of the Ishango bone reads 11, 13, 17, 19 — the four primes between 10 and
      20 — and so the bone has been called the world’s first table of primes. In 1972 Alexander
      Marshack counted its notches as a lunar record of about five and a half months. Vladimir
      Pletser and Dirk Huylebrouck, noting that the side columns each sum to 60 and the middle to 48,
      proposed in 1999 a base-12 arithmetic on the equator twenty thousand years ago. The romance
      began with the discoverer: Jean de Heinzelin’s 1962 article in <em>Scientific American</em>
      suggested that the Ishango people may even have had a number system, and placed them more
      than 8,500 years ago, an age later work has more than doubled. The sceptics answer that several
      notches are worn, that one of the middle column’s fives is illegible and its ten may be a nine
      (Olivier Keller, 2010), and that four numbers make a thin book of number theory. The plainer
      reading asks less of the bone: a tally — of catches, of days, of debts, of something now
      unrecoverable — whose deliberate groupings are real, and whose primes are probably ours
      rather than the carver’s.</p>`);
    ui.speculationPanel(stage, `
      <p>Where did the marks go next? Denise Schmandt-Besserat’s reconstruction — an influential
      hypothesis, argued from thousands of finds, though not universally accepted — traces writing
      itself back to counting. For more than four thousand years before writing, Near Eastern
      farmers and accountants tracked goods with small clay tokens: cones, spheres, disks and
      ovoids, each shape one unit of one commodity, used one for one, three ovoids for three jars
      of oil. Tokens sealed inside a hollow clay envelope guaranteed a debt; some accountants, as
      envelopes from Susa of around 3300 BCE show, took to pressing the tokens into the soft outside
      before sealing them in, so the envelope advertised
      its contents — until someone noticed that once the surface is marked, the tokens inside are
      redundant. Flatten the envelope and you have a tablet; the impression has become a sign. On
      her account the tablet did one thing more. Around 3100 BCE the impressions that had meant
      measures of grain took on a second, abstract meaning as numbers, so that thirty-three jars of
      oil could be written with seven signs instead of thirty-three. The pouch’s pebbles had become
      numerals. The first writing, on this account, was a receipt, and literature is a very late
      use of bookkeeping.</p>`);

    /* ---------- quest & phase bookkeeping ---------- */
    const QUEST_DEFAULTS = {
      flash: 'Watch the field: a handful of dots will flash for a quarter of a second. ' +
             'Say how many you saw. No counting — there isn’t time.',
      pouch: 'Dawn. Open the pen, then drop one pebble in the pouch for every sheep that ' +
             'reaches the gate. The pouch will remember what you cannot.',
      carve: 'Too many pebbles to see at a glance. Herd them into handfuls of five — then ' +
             'carve the handfuls for keeps.',
      compress: 'Every mark is a sheep. Slide the flock toward seven million and watch six ' +
                'ways of writing it part company.',
    };
    const INFO_DEFAULTS = {
      flash: 'no trials yet. Your answers will be charted beside Jevons’s beans of 1871.',
      pouch: 'the pouch is the machine; you are only its power source.',
      carve: 'drag a pebble into a ring, or tap a pebble and then a ring.',
      bone: 'hover or tap a notch group on the Ishango bone.',
      compress: 'slide the flock. One notch is four millimetres of bone.',
    };
    const questSaved = {};
    function setQuest(html, done = false) {
      questSaved[phase] = { html, done };
      applyQuest();
    }
    function applyQuest() {
      const q = questSaved[phase] || { html: QUEST_DEFAULTS[phase], done: false };
      if (q.done) quest.done(q.html); else quest.set(q.html);
    }

    function showSub() {
      subFlash.classList.toggle('tally-hidden', phase !== 'flash');
      subPouch.classList.toggle('tally-hidden', phase !== 'pouch');
      subCarve.classList.toggle('tally-hidden', phase !== 'carve');
      subCompress.classList.toggle('tally-hidden', phase !== 'compress');
      mathlineEl.style.display = phase === 'compress' ? '' : 'none';
    }
    function syncTouch() {
      handle.canvas.style.touchAction = (phase === 'carve' && carve.stage === 'group') ? 'none' : 'pan-y';
    }

    function setPhase(p) {
      if (phase === 'flash' && p !== 'flash') stopFlash();
      phase = p;
      for (const [id] of PHASES) {
        phaseBtns[id].classList.toggle('active', id === p);
        phaseBtns[id].setAttribute('aria-pressed', String(id === p));
      }
      if (p === 'carve') ensureCarve();
      showSub();
      applyQuest();
      info.set(p === 'carve' && carve.stage === 'bone' ? INFO_DEFAULTS.bone : INFO_DEFAULTS[p]);
      handle.canvas.style.cursor = 'default';
      syncTouch();
      dirty = true;
    }

    /* ---------- canvas text helpers ---------- */
    function text(ctx, s, x, y, { font = fnt(11), color = TEXT_FAINT, align = 'left', base = 'alphabetic' } = {}) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
      ctx.fillText(s, x, y);
    }
    const wrapCache = new Map();
    function wrapped(ctx, s, x, y, maxW, lh, opts = {}) {
      ctx.font = opts.font || fnt(11);
      const key = `${ctx.font}|${Math.round(maxW)}|${s}`;
      let lines = wrapCache.get(key);
      if (!lines) {
        lines = wrapText((q) => ctx.measureText(q).width, s, maxW);
        if (wrapCache.size > 200) wrapCache.clear();
        wrapCache.set(key, lines);
      }
      lines.forEach((ln, i) => text(ctx, ln, x, y + i * lh, opts));
      return lines.length;
    }
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    }
    function offscreen(w, h) {
      const c = document.createElement('canvas');
      const d = handle.dpr || 1;
      c.width = Math.max(1, Math.round(w * d)); c.height = Math.max(1, Math.round(h * d));
      const g = c.getContext('2d');
      g.setTransform(d, 0, 0, d, 0, 0);
      return { c, g };
    }

    /* ================= station I — the flash ================= */

    const flash = {
      running: false, state: 'idle', deck: [], n: 0, dots: [], trialMode: 'scatter',
      tEnter: 0, onset: 0, stats: { scatter: {}, dice: {} }, count: { scatter: 0, dice: 0 },
      summaryShown: false, lastAnswer: 0, lastCorrect: false, lastRt: 0, mode: 'scatter',
    };
    const FIELD_H = 222;
    // Dots keep clear of a top strip (the trial tag) and a foot strip (the
    // feedback numeral), so neither can ever sit on a dot.
    const FIELD_TOP = 16, FIELD_FOOT = 34, DOT_H = FIELD_H - FIELD_TOP - FIELD_FOOT;
    const T_FIX = 0.55, T_SHOW = 0.25, T_MASK = 0.15, T_FEED = 1.05;
    const dotGlow = cv.glowSprite(P.gold, 36);
    let noise = null;           // offscreen backward mask, redrawn per trial

    const flashRow = ui.controlRow(subFlash);
    const beginBtn = ui.button(flashRow, '▶ flash the flock', () => {
      if (flash.running) stopFlash(); else startFlash();
    }, { primary: true });
    beginBtn.type = 'button';
    const diceToggle = ui.toggle(flashRow, {
      label: 'dots as dice faces', value: false,
      onChange: (v) => {
        flash.mode = v ? 'dice' : 'scatter';
        info.set(v ? 'from the next trial, dots fall in the patterns of dice faces. Does your edge move?'
          : 'from the next trial, dots are scattered at random again.');
        dirty = true;
      },
    });
    const answers = document.createElement('div');
    answers.className = 'tally-answers';
    answers.setAttribute('role', 'group');
    answers.setAttribute('aria-label', 'how many dots?');
    subFlash.appendChild(answers);
    const answerBtns = [];
    for (let k = 1; k <= 9; k++) {
      const b = ui.button(answers, String(k), () => answer(k), { small: true });
      b.type = 'button';
      answerBtns.push(b);
    }
    function setAnswers(on) { for (const b of answerBtns) b.disabled = !on; }
    setAnswers(false);

    function dotRegion() {
      const W = handle.width;
      const w = Math.min(W - 24, 560);
      return { x: Math.round((W - w) / 2), y: 12, w, h: FIELD_H };
    }
    function flashGoto(st, t) {
      flash.state = st;
      flash.tEnter = t;
      setAnswers(st === 'mask' || st === 'ask');
      if (st === 'show') flash.onset = performance.now();
      dirty = true;
    }
    function paintNoise(R) {
      if (!noise || noise.w !== R.w || noise.h !== R.h || noise.dpr !== handle.dpr) {
        const o = offscreen(R.w, R.h);
        noise = { ...o, w: R.w, h: R.h, dpr: handle.dpr };
      }
      const g = noise.g;
      g.clearRect(0, 0, R.w, R.h);
      g.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const x = 10 + rng() * (R.w - 20), y = 10 + rng() * (R.h - 20);
        const a = rng() * TAU, l = 5 + rng() * 14;
        g.strokeStyle = rng() < 0.55 ? rgba(P.goldBright, 0.75) : rgba(P.ink, 0.55);
        g.lineWidth = 1.2 + rng() * 2.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < 46; i++) {
        g.fillStyle = rng() < 0.6 ? rgba(P.goldBright, 0.8) : rgba(P.inkDim, 0.7);
        g.beginPath(); g.arc(10 + rng() * (R.w - 20), 10 + rng() * (R.h - 20), 1.5 + rng() * 4, 0, TAU); g.fill();
      }
    }
    function nextTrial(t) {
      if (!flash.deck.length) flash.deck = makeDeck(rng);
      flash.n = flash.deck.pop();
      flash.trialMode = flash.mode;
      const R = dotRegion();
      if (flash.trialMode === 'dice') {
        const L = diceLayout(flash.n);
        const s = Math.min(R.w, DOT_H) * 0.17;
        const rot = rng() < 0.5;
        const cx = R.w / 2 + (rng() * 2 - 1) * Math.min(R.w * 0.22, 90);
        const cy = FIELD_TOP + DOT_H / 2 + (rng() * 2 - 1) * 20;
        flash.dots = L.map((p) => ({ x: cx + (rot ? p.y : p.x) * s, y: cy + (rot ? p.x : p.y) * s }));
      } else {
        flash.dots = genDots(flash.n, R.w, DOT_H, 9, rng).map((d) => ({ x: d.x, y: d.y + FIELD_TOP }));
      }
      paintNoise(R);
      flashGoto('fixate', t);
    }
    function startFlash() {
      audio.ensureAudio();
      flash.running = true;
      beginBtn.textContent = '■ stop';
      nextTrial(lastT);
    }
    function stopFlash() {
      flash.running = false;
      beginBtn.textContent = '▶ flash the flock';
      flashGoto('idle', lastT);
    }
    function answer(k) {
      if (!flash.running || (flash.state !== 'mask' && flash.state !== 'ask')) return;
      audio.ensureAudio();
      const rt = performance.now() - flash.onset;
      const correct = k === flash.n;
      const mode = flash.trialMode;
      const book = flash.stats[mode];
      const s = (book[flash.n] ||= { tries: 0, correct: 0, rtSum: 0, rtN: 0 });
      s.tries++;
      if (correct) { s.correct++; s.rtSum += rt; s.rtN++; }
      flash.count[mode]++;
      flash.lastAnswer = k; flash.lastCorrect = correct; flash.lastRt = rt;
      if (correct) sfx('wood', { pitch: 980, level: 0.35 });
      else sfx('thock', { level: 0.45 });
      const tag = mode === 'dice' ? 'dice faces' : 'scattered';
      const were = `there ${flash.n === 1 ? 'was' : 'were'} ${flash.n}`;
      let line = correct
        ? `${were} — right, in ${Math.round(rt)} ms  ·  ${tag} trial ${flash.count[mode]}`
        : `${were} — you said ${k}  ·  ${tag} trial ${flash.count[mode]}`;
      if (flash.count.dice >= 6) {
        const ed = fitEdge(flash.stats.dice), es = fitEdge(flash.stats.scatter);
        const say = (e) => (e ? `edge at ${e.edge - 1} | ${e.edge}` : 'no edge yet');
        line += `\nas dice faces: ${say(ed)}  ·  scattered: ${say(es)}`;
      }
      info.set(line);
      if (flash.count.scatter >= 12) flashSummary();
      flashGoto('feedback', lastT);
    }
    function flashSummary() {
      const first = !flash.summaryShown;
      flash.summaryShown = true;
      const st = flash.stats.scatter;
      const e = fitEdge(st);
      const pct = (c, t) => (t ? `${Math.round((c / t) * 100)}%` : '—');
      const ms = (r, n) => (n ? `${Math.round(r / n)} ms` : '—');
      const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
      let head;
      if (!e) {
        const slips = Object.keys(st).filter((n) => st[n].correct < st[n].tries).length;
        head = `${flash.count.scatter} glances and ${slips ? 'only a stray slip' : 'not one miss'}: no edge yet. ` +
          'Keep going; the deck runs to nine.';
      } else {
        let lr = 0, ln = 0, hr = 0, hn = 0;
        for (let n = 1; n <= 9; n++) {
          const s = st[n];
          if (!s) continue;
          if (n < e.edge) { lr += s.rtSum; ln += s.rtN; } else { hr += s.rtSum; hn += s.rtN; }
        }
        const lo = WORD[e.edge - 1], hi = WORD[e.edge];
        head = `Your edge falls between ${lo} and ${hi}` +
          (e.slips.length ? ` (with a stray slip at ${e.slips.join(' and ')})` : '') +
          (e.below[1] ? `: below it ${pct(...e.below)} right, in ${ms(lr, ln)}; from ${hi} up, ${pct(...e.above)}, in ${ms(hr, hn)}.` : '.');
      }
      setQuest(`${head} Jevons’s beans in 1871, read the same way: between four and five, with 88 of 88 right at ` +
        'three and four and 102 of 107 at five. The notches begin where perception ends.' +
        (first ? ' Now try the dots as dice faces.' : ''), true);
    }

    function flashStep(t) {
      if (!flash.running) return false;
      const el = t - flash.tEnter;
      if (flash.state === 'fixate' && el > T_FIX) flashGoto('show', t);
      else if (flash.state === 'show' && el > T_SHOW) flashGoto('mask', t);
      else if (flash.state === 'mask' && el > T_MASK) flashGoto('ask', t);
      else if (flash.state === 'feedback' && el > T_FEED) nextTrial(t);
      return flash.state !== 'ask';
    }

    function drawFlash(ctx, W, H) {
      const R = dotRegion();
      // field
      roundRect(ctx, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 6);
      ctx.fillStyle = 'rgba(22,25,37,0.42)'; ctx.fill();
      ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke();
      const cx = R.x + R.w / 2;
      const cy = flash.state === 'idle' ? R.y + R.h / 2 : R.y + FIELD_TOP + DOT_H / 2;
      if (flash.state === 'idle') {
        const n = wrapped(ctx, 'A handful of dots will flash for a quarter of a second.', cx, cy - 8,
          R.w - 40, 20, { font: fnt(15, SERIF, 'italic'), color: P.inkDim, align: 'center' });
        wrapped(ctx, 'press ▶ flash the flock, then answer with the buttons or keys 1–9', cx, cy + 12 + (n - 1) * 20,
          R.w - 40, 15, { font: fnt(10.5), align: 'center' });
      } else if (flash.state === 'fixate') {
        ctx.strokeStyle = P.goldDim; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(Math.round(cx) - 7, Math.round(cy) + 0.5); ctx.lineTo(Math.round(cx) + 8, Math.round(cy) + 0.5);
        ctx.moveTo(Math.round(cx) + 0.5, Math.round(cy) - 7); ctx.lineTo(Math.round(cx) + 0.5, Math.round(cy) + 8);
        ctx.stroke();
      } else if (flash.state === 'show') {
        ctx.globalAlpha = 0.55;
        for (const d of flash.dots) dotGlow.draw(ctx, R.x + d.x, R.y + d.y, 1.3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.goldBright;
        ctx.beginPath();
        for (const d of flash.dots) { ctx.moveTo(R.x + d.x + 7.5, R.y + d.y); ctx.arc(R.x + d.x, R.y + d.y, 7.5, 0, TAU); }
        ctx.fill();
      } else if (flash.state === 'mask') {
        if (noise) ctx.drawImage(noise.c, R.x, R.y, R.w, R.h);
      } else if (flash.state === 'ask') {
        text(ctx, '?', cx, cy - 4, { font: fnt(38, SERIF), color: P.gold, align: 'center', base: 'middle' });
        text(ctx, 'how many? buttons below, or keys 1–9', cx, cy + 30, { font: fnt(10.5), align: 'center', base: 'middle' });
      } else if (flash.state === 'feedback') {
        const col = flash.lastCorrect ? P.verdant : P.crimsonBright;
        ctx.fillStyle = rgba(P.ink, 0.85);
        ctx.beginPath();
        for (const d of flash.dots) { ctx.moveTo(R.x + d.x + 6, R.y + d.y); ctx.arc(R.x + d.x, R.y + d.y, 6, 0, TAU); }
        ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (const d of flash.dots) { ctx.moveTo(R.x + d.x + 10.5, R.y + d.y); ctx.arc(R.x + d.x, R.y + d.y, 10.5, 0, TAU); }
        ctx.stroke();
        text(ctx, String(flash.n), cx, R.y + R.h - 23, { font: fnt(22), color: col, align: 'center', base: 'middle' });
        text(ctx, flash.lastCorrect ? `${Math.round(flash.lastRt)} ms` : `you said ${flash.lastAnswer}`,
          cx, R.y + R.h - 7, { font: fnt(10), align: 'center', base: 'middle' });
      }
      if (flash.state !== 'idle') {
        // drawn last, so the backward mask never buries it
        const tag = `${flash.trialMode === 'dice' ? 'dice faces' : 'scattered'} · trial ${flash.count[flash.trialMode] + (flash.state === 'feedback' ? 0 : 1)}`;
        text(ctx, tag, R.x + R.w - 10, R.y + 14, { font: fnt(10), align: 'right' });
      }
      const chY = R.y + R.h + 14;
      drawFlashCharts(ctx, W, chY, H - chY - 8);
    }

    function drawFlashCharts(ctx, W, y, h) {
      if (h < 70) return;
      const sS = statsSeries(flash.stats.scatter, 1, 9);
      const sD = statsSeries(flash.stats.dice, 1, 9);
      const anyS = sS.acc.some((v) => v !== null), anyD = sD.acc.some((v) => v !== null);
      const gap = 12;
      const totalW = Math.min(W - 24, 660);
      const pw = Math.floor((totalW - gap) / 2);
      const x1 = Math.round((W - totalW) / 2), x2 = x1 + pw + gap;
      const narrow = pw < 210;
      const edge = fitEdge(flash.stats.scatter);

      function panelFrame(x, title) {
        ctx.fillStyle = 'rgba(22,25,37,0.34)';
        ctx.fillRect(x, y, pw, h);
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, h - 1);
        text(ctx, title, x + 8, y + 16, { font: fnt(12.5, SERIF, 'italic'), color: P.inkDim });
      }
      const geom = (x) => {
        const px0 = x + (narrow ? 26 : 32), px1 = x + pw - 8, py0 = y + 38, py1 = y + h - 18;
        return { px0, px1, py0, py1, xAt: (n) => px0 + ((px1 - px0) * (n - 0.5)) / 9, step: (px1 - px0) / 9 };
      };
      function axis(g, x) {
        for (let n = 1; n <= 9; n++) text(ctx, String(n), g.xAt(n), y + h - 5, { font: fnt(9), align: 'center' });
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(g.px0, Math.round(g.py1) + 0.5); ctx.lineTo(g.px1, Math.round(g.py1) + 0.5); ctx.stroke();
      }
      function edgeLine(g, label) {
        if (!edge) return;
        const ex = Math.round(g.xAt(edge.edge - 0.5)) + 0.5;
        ctx.strokeStyle = rgba(P.crimsonBright, 0.8); ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        // only the labelled line reaches up to its label; the other stays clear of the legend
        ctx.beginPath(); ctx.moveTo(ex, label ? g.py0 - 14 : g.py0 - 4); ctx.lineTo(ex, g.py1); ctx.stroke();
        ctx.setLineDash([]);
        if (label) {
          const f = fnt(10.5, SERIF, 'italic');
          ctx.font = f;
          const lw = ctx.measureText('your edge').width;
          // beside the line, on whichever side has room; above the plot either way
          const right = ex + 4 + lw <= g.px1 || ex - 4 - lw < g.px0;
          text(ctx, 'your edge', right ? Math.min(ex + 4, g.px1 - lw) : ex - 4, g.py0 - 6,
            { font: f, color: P.crimsonBright, align: right ? 'left' : 'right' });
        }
      }

      // --- accuracy ---
      panelFrame(x1, 'accuracy');
      const A = geom(x1);
      const ya = (a) => A.py1 - a * (A.py1 - A.py0);
      ctx.strokeStyle = rgba(P.line, 0.9); ctx.lineWidth = 1;
      ctx.beginPath();
      for (const a of [0.5, 1]) { ctx.moveTo(A.px0, Math.round(ya(a)) + 0.5); ctx.lineTo(A.px1, Math.round(ya(a)) + 0.5); }
      ctx.stroke();
      text(ctx, '100%', A.px0 - 4, ya(1) + 3, { font: fnt(8.5), align: 'right' });
      text(ctx, '50%', A.px0 - 4, ya(0.5) + 3, { font: fnt(8.5), align: 'right' });
      // Jevons 1871 ghost
      ctx.strokeStyle = rgba(P.inkDim, 0.6); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath();
      for (let n = 3; n <= 9; n++) {
        const [c, tt] = JEVONS_1871[n];
        const px = A.xAt(n), py = ya(c / tt);
        if (n === 3) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = P.bg; ctx.strokeStyle = rgba(P.inkDim, 0.75);
      for (let n = 3; n <= 9; n++) {
        const [c, tt] = JEVONS_1871[n];
        ctx.beginPath(); ctx.arc(A.xAt(n), ya(c / tt), 2, 0, TAU); ctx.fill(); ctx.stroke();
      }
      // legend (right-aligned in the title row)
      {
        const lx = x1 + pw - 8, ly = y + 16;
        // the longest label whose dashed swatch still clears the panel title
        ctx.font = fnt(12.5, SERIF, 'italic'); const tw = ctx.measureText('accuracy').width;
        ctx.font = fnt(9.5);
        const lab = ['Jevons 1871 · beans', 'Jevons 1871', 'Jevons'].find((s) => 8 + tw + 10 + 20 + ctx.measureText(s).width + 8 <= pw) || 'Jevons';
        const w = ctx.measureText(lab).width;
        text(ctx, lab, lx, ly, { font: fnt(9.5), align: 'right' });
        ctx.strokeStyle = rgba(P.inkDim, 0.75); ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(lx - w - 20, ly - 3.5); ctx.lineTo(lx - w - 5, ly - 3.5); ctx.stroke();
        ctx.setLineDash([]);
      }
      const bw = Math.max(3, A.step * (anyD ? 0.3 : 0.44));
      const barCol = (a, dice) => (a >= 0.999 ? (dice ? P.azure : P.gold) : a >= 0.5 ? (dice ? P.azureDim : P.goldDim) : P.crimson);
      for (let n = 1; n <= 9; n++) {
        const a = sS.acc[n - 1], d = sD.acc[n - 1];
        const off = anyD ? bw * 0.58 : 0;
        if (a !== null) {
          const bh = Math.max(1.5, a * (A.py1 - A.py0));
          ctx.fillStyle = barCol(a, false);
          ctx.fillRect(Math.round(A.xAt(n) - off - bw / 2), A.py1 - bh, Math.round(bw), bh);
        }
        if (d !== null) {
          const bh = Math.max(1.5, d * (A.py1 - A.py0));
          ctx.fillStyle = barCol(d, true);
          ctx.fillRect(Math.round(A.xAt(n) + off - bw / 2), A.py1 - bh, Math.round(bw), bh);
        }
      }
      axis(A, x1);
      edgeLine(A, true);

      // --- response time ---
      panelFrame(x2, narrow ? 'ms to answer' : 'milliseconds to answer, when right');
      const Rg = geom(x2);
      let maxRt = 1000;
      for (const v of [...sS.rt, ...sD.rt]) if (v !== null && v > maxRt) maxRt = v;
      maxRt = Math.ceil(maxRt / 250) * 250;
      const yr = (v) => Rg.py1 - (v / maxRt) * (Rg.py1 - Rg.py0);
      ctx.strokeStyle = rgba(P.line, 0.9); ctx.lineWidth = 1;
      ctx.beginPath();
      for (const v of [maxRt / 2, maxRt]) { ctx.moveTo(Rg.px0, Math.round(yr(v)) + 0.5); ctx.lineTo(Rg.px1, Math.round(yr(v)) + 0.5); }
      ctx.stroke();
      text(ctx, String(maxRt), Rg.px0 - 4, yr(maxRt) + 3, { font: fnt(8.5), align: 'right' });
      text(ctx, String(maxRt / 2), Rg.px0 - 4, yr(maxRt / 2) + 3, { font: fnt(8.5), align: 'right' });
      if (anyD) {
        // beside the title when there is room, else on its own line beneath it
        ctx.font = fnt(12.5, SERIF, 'italic');
        const tw = ctx.measureText(narrow ? 'ms to answer' : 'milliseconds to answer, when right').width;
        ctx.font = fnt(9.5);
        const dw = ctx.measureText('dice').width, lw = dw + 4 + ctx.measureText('scattered ·').width;
        const ly = 8 + tw + 14 + lw <= pw ? y + 16 : y + 29;
        text(ctx, 'dice', x2 + pw - 8, ly, { font: fnt(9.5), color: P.azure, align: 'right' });
        text(ctx, 'scattered ·', x2 + pw - 12 - dw, ly, { font: fnt(9.5), color: P.gold, align: 'right' });
      }
      const line = (series, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
        ctx.beginPath();
        let pen = false;
        for (let n = 1; n <= 9; n++) {
          const v = series[n - 1];
          if (v === null) { pen = false; continue; }
          if (pen) ctx.lineTo(Rg.xAt(n), yr(v)); else ctx.moveTo(Rg.xAt(n), yr(v));
          pen = true;
        }
        ctx.stroke();
        ctx.fillStyle = col;
        for (let n = 1; n <= 9; n++) {
          const v = series[n - 1];
          if (v === null) continue;
          ctx.beginPath(); ctx.arc(Rg.xAt(n), yr(v), 2.5, 0, TAU); ctx.fill();
        }
      };
      line(sS.rt, P.gold);
      if (anyD) line(sD.rt, P.azure);
      axis(Rg, x2);
      edgeLine(Rg, false);

      if (!anyS && !anyD) {
        wrapped(ctx, 'your answers will stand beside his', (A.px0 + A.px1) / 2, ya(0.25) + 4,
          pw - 50, 13, { font: fnt(11.5, SERIF, 'italic'), color: TEXT_FAINT, align: 'center' });
        wrapped(ctx, 'waiting for your first right answer', (Rg.px0 + Rg.px1) / 2, yr(maxRt * 0.75) + 4,
          pw - 50, 13, { font: fnt(11.5, SERIF, 'italic'), color: TEXT_FAINT, align: 'center' });
      }
    }

    function onKey(e) {
      if (phase !== 'flash' || !flash.running || (flash.state !== 'mask' && flash.state !== 'ask')) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const tg = e.target;
      if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || ''))) return;
      const k = parseInt(e.key, 10);
      if (k >= 1 && k <= 9) { e.preventDefault(); answer(k); }
    }
    document.addEventListener('keydown', onKey);

    /* ================= station II — the pouch ================= */

    const pouch = {
      mode: 'idle',            // idle | dawn | day | dusk | night | resolved
      sheep: [], pebbles: 0, queue: [], active: -1, awaiting: false,
      nextAt: 0, dayUntil: 0, finished: false, strayCount: 0, playedId: 0, playedSize: 0,
      flights: [], threads: [],
      sky: { cur: 'idle', prev: null, t0: -10 },
      // "leave the pouch at home": the matching-from-memory condition
      memory: false, runMemory: false, autoAt: 0, missing: 0,
      score: { pouch: [0, 0], memory: [0, 0] },
    };
    // pebble heap positions (golden-spiral scatter, deterministic)
    const PEBBLE_SPOTS = [];
    for (let i = 0; i < 30; i++) {
      const a = i * 2.39996, r = 2.5 + 2.3 * Math.sqrt(i);
      PEBBLE_SPOTS.push({ dx: Math.cos(a) * r * 1.7, dy: -Math.abs(Math.sin(a) * r) * 0.85 - 3 });
    }
    const sunGlow = cv.glowSprite(P.goldBright, 128);
    const duskGlow = cv.glowSprite(P.crimsonBright, 128);
    const moonGlow = cv.glowSprite(P.azure, 96);
    const waitGlow = cv.glowSprite(P.gold, 64);
    const leftGlow = cv.glowSprite(P.crimsonBright, 32);

    function geo() {
      const W = handle.width, H = handle.height;
      const narrow = W < 600;
      const s = clamp(W / 820, 0.66, 1);
      // On a phone the pasture is deep rather than wide: a lower sky gives a
      // crowded pen and field room to spread toward the viewer.
      const groundY = Math.round(H * (narrow ? 0.54 : 0.64));
      const depth = narrow ? Math.min(78, H - 62 - 58 - groundY) : 28;
      const gateX = Math.round(narrow ? W * 0.42 : clamp(W * 0.32, 180, 340));
      const pouchX = Math.round(gateX + (narrow ? 52 : 84));
      const pouchY = H - 62;
      const hillX0 = Math.round(Math.max(gateX + 90, W * (narrow ? 0.7 : 0.58)));
      const hillH = Math.min(74, (W - hillX0) * 0.55);
      return { W, H, s, narrow, groundY, depth, gateX, pouchX, pouchY, hillX0, hillH };
    }
    function hillY(G, x) {
      if (x <= G.hillX0) return G.groundY;
      const t = Math.min(1, (x - G.hillX0) / (G.W - G.hillX0));
      const g = G.groundY;
      return (1 - t) * (1 - t) * g + 2 * (1 - t) * t * (g - G.hillH) + t * t * (g - 12);
    }
    // A free spot in the pen or the pasture, as far as possible from the animals
    // already there or heading there, so a flock of seventeen reads as seventeen.
    const IN_PEN = new Set(['pen', 'penned', 'toPen']);
    const IN_FIELD = new Set(['graze', 'leaving']);
    function spreadSpot(box, states, self) {
      const others = [];
      for (const o of pouch.sheep) if (o !== self && states.has(o.state)) others.push({ x: o.tx ?? o.x, y: o.dy });
      const p = pickSpread(box, others, rng);
      return { x: p.x, dy: p.y };
    }
    function penSpot(G, self) {
      return spreadSpot({ x0: 20 + 12 * G.s, x1: G.gateX - 38 - 14 * G.s, y0: -8, y1: G.depth }, IN_PEN, self);
    }
    function grazeSpot(G, self) {
      return spreadSpot({ x0: G.gateX + 56, x1: G.W - 34, y0: -8, y1: G.depth }, IN_FIELD, self);
    }
    function makeSheep(G) {
      const lobes = [];
      for (let i = 0; i < 6; i++) lobes.push({ x: -9 + rng() * 18, y: -6 + rng() * 8, r: 5.5 + rng() * 2.5 });
      lobes.push({ x: 0, y: -2, r: 8.5 }); // core mass
      const p = penSpot(G, null);
      return {
        x: p.x, dy: p.dy, y: 0, dir: rng() < 0.5 ? 1 : -1, walk: rng() * 9, moving: false, lobes,
        state: 'pen', tx: null, tdy: null, speed: 62 + rng() * 26, stray: false, delay: 0, nextWander: 0,
        phase: rng() * TAU,
      };
    }
    function setMode(m) {
      const skyOf = (x) => (x === 'resolved' ? 'night' : x);
      if (skyOf(m) !== pouch.sky.cur) pouch.sky = { cur: skyOf(m), prev: pouch.sky.cur, t0: lastT };
      pouch.mode = m;
      dirty = true;
    }
    function buildFlock() {
      const G = geo();
      const count = 12 + Math.floor(rng() * 6);          // 12–17: beyond subitizing
      const w = [0.35, 0.65, 0.85, 1];                    // 0–3 strays, weighted
      const roll = rng();
      let strayCount = w.findIndex((p) => roll < p);
      if (strayCount < 0) strayCount = 0;
      strayCount = Math.min(strayCount, count - 1);
      pouch.sheep = [];
      for (let i = 0; i < count; i++) pouch.sheep.push(makeSheep(G));
      pouch.strayCount = strayCount;                      // strays are chosen at midday
      pouch.pebbles = 0; pouch.queue = []; pouch.active = -1;
      pouch.awaiting = false; pouch.finished = false;
      pouch.flights = []; pouch.threads = [];
      pouch.runMemory = false; pouch.missing = 0;
      setMode('idle');
      syncPebbleBtn();
    }

    const idleQuest = () => (pouch.memory
      ? 'Dawn, and the pouch stays at home. Open the pen and watch the flock go out; tonight, ' +
        'memory alone must say whether it is whole.'
      : QUEST_DEFAULTS.pouch);
    const pouchRow = ui.controlRow(subPouch);
    const dawnBtn = ui.button(pouchRow, '☀ open the pen', () => {
      audio.ensureAudio();
      if (pouch.mode !== 'idle') return;
      pouch.runMemory = pouch.memory;
      setMode('dawn');
      pouch.playedId++; pouch.playedSize = pouch.sheep.length;
      pouch.queue = shuffledIdx();
      pouch.nextAt = lastT + 0.6;
      dawnBtn.classList.add('tally-hidden');
      memToggle.el.classList.add('tally-hidden');
      syncPebbleBtn();
      setQuest(pouch.runMemory
        ? 'No pouch today. The sheep file out on their own; watch them go, and hold on to what you can.'
        : 'The pen opens. Tap the pouch (or the pebble button) as each sheep reaches the gate — one pebble, one animal.');
    }, { primary: true });
    const memToggle = ui.toggle(pouchRow, {
      label: 'leave the pouch at home', value: false,
      onChange: (v) => {
        pouch.memory = v;
        info.set(v ? 'next morning the flock goes out with no pouch: at night you must judge from memory alone.'
          : INFO_DEFAULTS.pouch);
        if (pouch.mode === 'idle') setQuest(idleQuest());
        dirty = true;
      },
    });
    const pebbleBtn = ui.button(pouchRow, '● drop a pebble', () => { audio.ensureAudio(); pouchTap(lastT); });
    const wholeBtn = ui.button(pouchRow, 'the flock is whole', () => verdict(true));
    const missingBtn = ui.button(pouchRow, 'some are missing', () => verdict(false));
    const againBtn = ui.button(pouchRow, '↺ drive them out again', () => {
      buildFlock();
      dawnBtn.classList.remove('tally-hidden');
      memToggle.el.classList.remove('tally-hidden');
      againBtn.classList.add('tally-hidden');
      setQuest(idleQuest());
      info.set(scoreLine() || INFO_DEFAULTS.pouch);
    }, { small: true });
    for (const b of [dawnBtn, pebbleBtn, wholeBtn, missingBtn, againBtn]) b.type = 'button';
    for (const b of [pebbleBtn, wholeBtn, missingBtn, againBtn]) b.classList.add('tally-hidden');
    function scoreLine() {
      const [pr, pt] = pouch.score.pouch, [mr, mt] = pouch.score.memory;
      if (!mt) return '';
      return `nights judged right — from memory: ${mr} of ${mt}  ·  with the pouch: ${pt ? `${pr} of ${pt}` : 'none tried yet'}`;
    }
    function syncPebbleBtn() {
      const on = !pouch.runMemory && (pouch.mode === 'dawn' || pouch.mode === 'dusk');
      pebbleBtn.classList.toggle('tally-hidden', !on);
      pebbleBtn.disabled = !pouch.awaiting;
      pebbleBtn.textContent = pouch.mode === 'dusk' ? '○ take a pebble out' : '● drop a pebble';
    }
    buildFlock();

    function shuffledIdx(filter = () => true) {
      const idx = pouch.sheep.map((_, i) => i).filter((i) => filter(pouch.sheep[i]));
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      return idx;
    }

    function pebbleTick(add) {
      sfx('wood', { pitch: add ? 700 + rng() * 130 : 520 + rng() * 90, level: 0.4 });
    }
    function heapPos(G, i) {
      const p = PEBBLE_SPOTS[clamp(i, 0, PEBBLE_SPOTS.length - 1)];
      return { x: G.pouchX + p.dx, y: G.pouchY - 17 + p.dy };
    }
    const backOf = (G, s) => ({ x: s.x, y: s.y - 13 * G.s });
    function flyPebble(s, dir, spot) {
      pouch.flights.push({ s, dir, spot, t0: lastT, dur: reduced ? 0 : 0.36 });
      pouch.threads.push({ s, dir, spot, t0: lastT, dur: reduced ? 0.4 : 0.75 });
    }

    function pouchTap(t) {
      if (pouch.runMemory) {
        if (pouch.mode === 'dawn' || pouch.mode === 'dusk') info.set('no pouch today — the sheep pass the gate on their own.');
        return;
      }
      if (!pouch.awaiting || pouch.active < 0) {
        if (pouch.mode === 'dawn' || pouch.mode === 'dusk') info.set('one pebble, one sheep — wait for the next animal at the gate.');
        return;
      }
      passGate(t);
    }
    // The waiting sheep goes through the gate: with a pebble, unless the pouch
    // was left at home.
    function passGate(t) {
      const G = geo();
      const s = pouch.sheep[pouch.active];
      const withPebble = !pouch.runMemory;
      if (pouch.mode === 'dawn') {
        if (withPebble) {
          pouch.pebbles++;
          pebbleTick(true);
          flyPebble(s, 'in', pouch.pebbles - 1);
        }
        const g = grazeSpot(G, s);
        s.state = 'leaving'; s.tx = g.x; s.tdy = g.dy; s.dir = 1;
      } else if (pouch.mode === 'dusk') {
        if (withPebble) {
          pouch.pebbles = Math.max(0, pouch.pebbles - 1);
          pebbleTick(false);
          flyPebble(s, 'out', pouch.pebbles);
        }
        const p = penSpot(G, s);
        s.state = 'toPen'; s.tx = p.x; s.tdy = p.dy; s.dir = -1;
      }
      pouch.awaiting = false;
      pouch.active = -1;
      pouch.nextAt = t + 0.25;
      syncPebbleBtn();
      dirty = true;
    }

    function beginDay(t) {
      setMode('day');
      pouch.dayUntil = t + 2.6;
      const grazers = shuffledIdx((s) => s.state === 'graze');
      for (let i = 0; i < Math.min(pouch.strayCount, grazers.length); i++) {
        const s = pouch.sheep[grazers[i]];
        s.stray = true;
        s.delay = t + 0.4 + i * 0.7;
      }
      syncPebbleBtn();
      setQuest(pouch.runMemory
        ? 'Midday. The flock grazes, and nothing is keeping track of it but you. Watch the hill.'
        : 'Midday. The flock grazes; the pouch holds its pebbles. Watch the hill.');
    }
    function startDusk(t) {
      setMode('dusk');
      pouch.queue = shuffledIdx((s) => !s.stray);
      pouch.nextAt = t + 0.8;
      syncPebbleBtn();
      setQuest(pouch.runMemory
        ? 'Dusk. They come home on their own. Is it everyone?'
        : 'Dusk. Take a pebble out of the pouch for every sheep that comes home.');
    }
    function nightFall() {
      setMode('night');
      pouch.missing = pouch.sheep.filter((s) => s.stray && s.state === 'gone').length;
      syncPebbleBtn();
      wholeBtn.classList.remove('tally-hidden');
      missingBtn.classList.remove('tally-hidden');
      if (pouch.runMemory) {
        setQuest('Night. The pen is barred, and there is no pouch to ask. Is the flock whole?');
        info.set('no pebbles, no count: only what you remember of a flock you never counted.');
      } else {
        setQuest('Night. The pen is barred. Without counting anything — is the flock whole? Ask the pouch.');
        info.set('pebbles left in the pouch mean sheep left on the hill.');
      }
    }
    function verdict(saysWhole) {
      if (pouch.mode !== 'night') return;
      audio.ensureAudio();
      const miss = pouch.missing;          // equals the leftover pebbles whenever there is a pouch
      const whole = miss === 0;
      const right = saysWhole === whole;
      const book = pouch.score[pouch.runMemory ? 'memory' : 'pouch'];
      book[1]++; if (right) book[0]++;
      wholeBtn.classList.add('tally-hidden');
      missingBtn.classList.add('tally-hidden');
      const word = ['no', 'one', 'two', 'three', 'four'][Math.min(miss, 4)];
      const Word = word[0].toUpperCase() + word.slice(1);
      let msg;
      if (pouch.runMemory) {
        msg = whole
          ? (right ? 'Whole, and you were right, with nothing but memory to say so.'
            : 'The flock was whole. Without the pouch, doubt is all that is left.')
          : (right ? `Right: ${word} still out. Memory served tonight; the pouch never needs luck.`
            : `${Word} still on the hill. Memory could not hold a flock you never counted — a pouch could.`);
        if (!pouch.score.pouch[1]) msg += ' Now try a night with the pouch.';
      } else if (whole) {
        msg = right
          ? 'Whole — and the empty pouch already knew. You never counted, and never needed to.'
          : 'Look again: the pouch is empty. Every pebble found its sheep — the flock is whole.';
      } else {
        msg = (right ? 'The pouch agrees: ' : 'The pouch disagrees: ') +
          `${word} pebble${miss > 1 ? 's' : ''} with no sheep — ${word} animal${miss > 1 ? 's' : ''} still out. ` +
          'Someone should climb the hill…';
      }
      setQuest(msg, pouch.runMemory ? right : (whole || right));
      const sl = scoreLine();
      if (sl) info.set(sl);
      setMode('resolved');
      if (whole) {
        againBtn.classList.remove('tally-hidden');
        pouch.finished = true;
      } else {
        let i = 0;
        for (const s of pouch.sheep) {
          if (s.stray && s.state === 'gone') { s.delay = lastT + 0.9 + i * 0.9; i++; }
        }
      }
    }

    // Advance the pouch simulation; returns true while anything moves.
    function updatePouch(dt, t) {
      const G = geo();
      let moving = false;
      for (const s of pouch.sheep) {
        const onHill = s.state === 'strayOut' || s.state === 'strayHome';
        if (onHill) s.dy += (0 - s.dy) * Math.min(1, dt * 2.5);
        else if (s.tdy !== null) {
          s.dy += (s.tdy - s.dy) * Math.min(1, dt * 3.2);
          if (Math.abs(s.tdy - s.dy) < 0.3) { s.dy = s.tdy; s.tdy = null; }
          moving = true;
        }
        s.y = G.groundY + s.dy;
        if (onHill) s.y = Math.min(s.y, hillY(G, s.x) + 2);
        if (s.tx !== null) {
          const dx = s.tx - s.x;
          const trot = /^(toGate|toGateHome|stageOut|stageHome)$/.test(s.state) ? 1.7 : s.stray ? 1.3 : 1;
          const step = s.speed * trot * dt;
          s.moving = true; moving = true;
          s.dir = dx < 0 ? -1 : 1;
          if (Math.abs(dx) <= step) { s.x = s.tx; s.tx = null; s.moving = false; sheepArrived(s, t, G); }
          else { s.x += Math.sign(dx) * step; s.walk += (dt * s.speed) / 11; }
        } else s.moving = false;
        if (s.state === 'graze' && !s.moving && (pouch.mode === 'day' || pouch.mode === 'dawn') && t > s.nextWander) {
          s.nextWander = t + 3 + rng() * 6;
          if (rng() < 0.6) s.tx = clamp(s.x + (rng() - 0.5) * 90, G.gateX + 56, G.W - 34);
        }
        if (s.stray && s.state === 'graze' && pouch.mode === 'day' && t > s.delay && s.delay > 0) {
          s.state = 'strayOut'; s.tx = G.W + 60; s.delay = 0;
        }
        if (s.stray && s.state === 'gone' && pouch.mode === 'resolved' && s.delay > 0 && t > s.delay) {
          s.delay = 0; s.x = G.W + 50; s.dy = 0; s.state = 'strayHome'; s.tx = G.gateX + 16; s.dir = -1;
        }
      }
      if (pouch.mode === 'dawn' || pouch.mode === 'dusk') {
        if (pouch.runMemory && pouch.awaiting && pouch.active >= 0 && t >= pouch.autoAt) passGate(t);
        if (!pouch.awaiting && pouch.active === -1 && t >= pouch.nextAt) {
          if (pouch.queue.length) {
            const dawn = pouch.mode === 'dawn';
            pouch.active = pouch.queue.shift();
            const s = pouch.sheep[pouch.active];
            s.tdy = clamp(s.dy, -6, 14);
            if (dawn) { s.state = 'toGate'; s.tx = G.gateX - 18; }
            else { s.state = 'toGateHome'; s.tx = G.gateX + 18; }
            // the next animal in line walks up behind it and waits its turn
            const nx = pouch.queue[0];
            if (nx !== undefined) {
              const s2 = pouch.sheep[nx];
              s2.state = dawn ? 'stageOut' : 'stageHome';
              s2.tx = dawn ? G.gateX - 18 - 34 * G.s : G.gateX + 18 + 34 * G.s;
              s2.tdy = clamp(s2.dy, -6, 14);
            }
          } else if (pouch.mode === 'dawn') beginDay(t);
          else nightFall();
        }
      } else if (pouch.mode === 'day') {
        const straysGone = pouch.sheep.every((s) => !s.stray || s.state === 'gone');
        if (t >= pouch.dayUntil && straysGone) startDusk(t);
      } else if (pouch.mode === 'resolved' && !pouch.finished) {
        const allHome = pouch.sheep.every((s) => s.state === 'pen' || s.state === 'penned');
        if (allHome && pouch.pebbles === 0) {
          pouch.finished = true;
          setQuest(pouch.runMemory
            ? 'Found on the hill and walked home. With no pouch, only the search itself could have told you.'
            : 'Found on the hill, walked home, pebbles retired. The ledger balances — and still nobody counted.', true);
          againBtn.classList.remove('tally-hidden');
        }
      }
      pouch.flights = pouch.flights.filter((f) => t - f.t0 < f.dur);
      pouch.threads = pouch.threads.filter((f) => t - f.t0 < f.dur);
      const skyFading = !reduced && pouch.sky.prev && t - pouch.sky.t0 < 1.4;
      return moving || pouch.flights.length > 0 || pouch.threads.length > 0 || skyFading ||
        pouch.mode === 'dawn' || pouch.mode === 'day' || pouch.mode === 'dusk' ||
        (pouch.mode === 'resolved' && !pouch.finished);
    }
    function sheepArrived(s, t, G) {
      switch (s.state) {
        case 'toGate': s.state = 'waitGate'; pouch.awaiting = true; pouch.autoAt = t + 0.35; syncPebbleBtn(); break;
        case 'leaving': s.state = 'graze'; s.nextWander = t + 2 + rng() * 5; break;
        case 'strayOut': s.state = 'gone'; break;
        case 'toGateHome': s.state = 'waitHome'; pouch.awaiting = true; pouch.autoAt = t + 0.35; syncPebbleBtn(); break;
        case 'strayHome': {
          if (!pouch.runMemory) {
            pouch.pebbles = Math.max(0, pouch.pebbles - 1);
            pebbleTick(false);
            flyPebble(s, 'out', pouch.pebbles);
          }
          const p = penSpot(G, s);
          s.state = 'toPen'; s.tx = p.x; s.tdy = p.dy;
          break;
        }
        case 'toPen': s.state = 'penned'; break;
      }
    }

    // --- static scenery, cached per time of day ---
    const skyCache = new Map();
    const SKY = {
      idle: { top: '#090a10', low: '#12151f' },
      dawn: { top: '#0b0c14', low: '#2b2518', glow: P.gold, ga: 0.30, sun: [0.13, 0.62], disc: P.goldBright },
      day: { top: '#0f131d', low: '#1d212b', glow: P.goldBright, ga: 0.14, sun: [0.5, 0.2], disc: P.goldBright },
      dusk: { top: '#0c0b12', low: '#2c1715', glow: P.crimson, ga: 0.32, sun: [0.86, 0.66], disc: P.crimsonBright },
      night: { top: '#05060b', low: '#0d1422', glow: P.azureDim, ga: 0.16, moon: [0.84, 0.2], stars: true },
    };
    function cached(key, G, paint) {
      const k = `${key}|${G.W}|${G.H}|${handle.dpr}`;
      let c = skyCache.get(k);
      if (c) return c;
      const o = offscreen(G.W, G.H);
      paint(o.g, G);
      if (skyCache.size > 12) skyCache.clear();
      skyCache.set(k, o.c);
      return o.c;
    }
    const skyCanvas = (mode, G) => cached(mode, G, (g) => paintSky(g, mode, G));
    const landCanvas = (G) => cached('land', G, (g) => paintLand(g, G));
    function sunOf(mode, G) {
      const S = SKY[mode];
      return S && S.sun ? { x: G.W * S.sun[0], y: G.groundY * S.sun[1], disc: S.disc, dusk: mode === 'dusk' } : null;
    }
    function paintSky(g, mode, G) {
      const S = SKY[mode] || SKY.idle;
      const W = G.W, H = G.H, gy = G.groundY;
      const lin = g.createLinearGradient(0, 0, 0, gy);
      lin.addColorStop(0, S.top); lin.addColorStop(1, S.low);
      g.fillStyle = lin; g.fillRect(0, 0, W, gy);
      if (S.stars) {
        const r = mulberry32(1871);
        for (let i = 0; i < 70; i++) {
          const x = r() * W, y = r() * gy * 0.82, rad = 0.4 + r() * r() * 1.3;
          g.fillStyle = rgba(P.ink, 0.25 + r() * 0.6);
          g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
        }
      }
      if (S.sun) {
        const sx = W * S.sun[0], sy = gy * S.sun[1];
        const rad = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, 400) * 0.45);
        rad.addColorStop(0, rgba(S.glow, S.ga)); rad.addColorStop(1, rgba(S.glow, 0));
        g.fillStyle = rad; g.fillRect(0, 0, W, gy);
      }
      if (S.moon) {
        const mx = W * S.moon[0], my = gy * S.moon[1];
        const rad = g.createRadialGradient(mx, my, 0, mx, my, W * 0.35);
        rad.addColorStop(0, rgba(S.glow, S.ga)); rad.addColorStop(1, rgba(S.glow, 0));
        g.fillStyle = rad; g.fillRect(0, 0, W, gy);
        g.globalAlpha = 0.35; moonGlow.draw(g, mx, my, 0.8); g.globalAlpha = 1;
        // a crescent: the disc minus an offset disc, clipped to the first so the
        // part of the second that spills past the limb is never filled
        g.save();
        g.beginPath(); g.arc(mx, my, 11, 0, TAU); g.clip();
        g.fillStyle = rgba(P.ink, 0.92);
        g.beginPath();
        g.arc(mx, my, 11, 0, TAU);
        g.moveTo(mx + 5 + 9.5, my - 3);
        g.arc(mx + 5, my - 3, 9.5, 0, TAU, true);
        g.fill('evenodd');
        g.restore();
      }
    }
    function paintLand(g, G) {
      const W = G.W, H = G.H, gy = G.groundY;
      // far ridge
      g.fillStyle = 'rgba(6,7,11,0.72)';
      g.beginPath(); g.moveTo(0, gy);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, gy - 16 - 9 * Math.sin(x * 0.011 + 1.3) - 5 * Math.sin(x * 0.029));
      g.lineTo(W, gy); g.closePath(); g.fill();
      // the hill the strays cross
      g.fillStyle = '#10121a';
      g.beginPath(); g.moveTo(G.hillX0 - 30, gy);
      g.quadraticCurveTo(G.hillX0, gy, G.hillX0 + 2, gy - 0.5);
      for (let x = G.hillX0; x <= W; x += 4) g.lineTo(x, hillY(G, x));
      g.lineTo(W, gy); g.closePath(); g.fill();
      g.strokeStyle = rgba(P.line, 0.9); g.lineWidth = 1;
      g.beginPath();
      for (let x = G.hillX0; x <= W; x += 4) { const y = hillY(G, x); if (x === G.hillX0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      // ground
      const gr = g.createLinearGradient(0, gy, 0, H);
      gr.addColorStop(0, '#12141c'); gr.addColorStop(1, P.bg);
      g.fillStyle = gr; g.fillRect(0, gy, W, H - gy);
      g.strokeStyle = P.line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(W, gy + 0.5); g.stroke();
      const r2 = mulberry32(43000);
      g.strokeStyle = rgba(P.inkFaint, 0.22); g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < Math.round(W / 26); i++) {
        const x = r2() * W, y = gy + 6 + r2() * (H - gy - 12);
        g.moveTo(x, y); g.lineTo(x - 1.5, y - 3 - r2() * 3); g.moveTo(x + 2, y); g.lineTo(x + 3, y - 2 - r2() * 3);
      }
      g.stroke();
      // fence (the gate posts are drawn live)
      g.strokeStyle = '#5c584b'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath();
      for (let x = 14; x <= G.gateX - 44; x += 24) { g.moveTo(x, gy + 3); g.lineTo(x, gy - 30); }
      g.moveTo(10, gy - 11); g.lineTo(G.gateX - 38, gy - 11);
      g.moveTo(10, gy - 25); g.lineTo(G.gateX - 38, gy - 25);
      g.stroke();
      g.lineCap = 'butt';
    }

    // A woolly sheep. s: { x, y, dir, walk, moving, lobes, state }
    function drawSheep(ctx, s, t, scale) {
      const bob = s.moving && !reduced ? Math.abs(Math.sin(s.walk * 3)) * 1.6 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y + 14 * scale, 12 * scale, 2.6 * scale, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(s.x, s.y - bob);
      ctx.scale(s.dir < 0 ? -scale : scale, scale);
      const sw = s.moving && !reduced ? Math.sin(s.walk * 6) * 4 : 0;
      ctx.strokeStyle = '#5f5b4f';
      ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, 4); ctx.lineTo(-8 + sw, 14);
      ctx.moveTo(-3, 4); ctx.lineTo(-3 - sw, 14);
      ctx.moveTo(3, 4); ctx.lineTo(3 + sw, 14);
      ctx.moveTo(8, 4); ctx.lineTo(8 - sw, 14);
      ctx.stroke();
      ctx.beginPath();
      for (const l of s.lobes) { ctx.moveTo(l.x + l.r, l.y); ctx.arc(l.x, l.y, l.r, 0, TAU); }
      ctx.strokeStyle = P.bg; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.fillStyle = P.ink; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.arc(-2, -6, 5, 0, TAU); ctx.fill();
      const grazing = s.state === 'graze' && !s.moving;
      const hy = grazing ? (reduced ? 2.5 : Math.sin(t * 1.7 + s.phase) * 1.5 + 2.5) : -4;
      ctx.fillStyle = '#4f4b41';
      ctx.beginPath(); ctx.ellipse(12, hy, 4.6, 3.6, -0.25, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(10, hy - 2.6, 2.3, 1.3, -0.5, 0, TAU); ctx.fill();
      ctx.restore();
    }

    function drawPouchScene(ctx, W, H, t) {
      const G = geo();
      const sk = pouch.sky;
      const k = reduced || !sk.prev ? 1 : clamp((t - sk.t0) / 1.4, 0, 1);
      const e = easeInOut(k);
      if (k < 1) {
        ctx.drawImage(skyCanvas(sk.prev, G), 0, 0, W, H);
        ctx.globalAlpha = e;
        ctx.drawImage(skyCanvas(sk.cur, G), 0, 0, W, H);
        ctx.globalAlpha = 1;
      } else ctx.drawImage(skyCanvas(sk.cur, G), 0, 0, W, H);
      // the sun travels between times of day rather than cross-fading
      const a = sunOf(sk.cur, G), b = k < 1 ? sunOf(sk.prev, G) : null;
      let sun = null;
      if (k >= 1) sun = a;
      else if (a && b) sun = { x: b.x + (a.x - b.x) * e, y: b.y + (a.y - b.y) * e - Math.sin(Math.PI * e) * G.groundY * 0.08, disc: mixHex(b.disc, a.disc, e), dusk: e > 0.5 ? a.dusk : b.dusk };
      else if (b) sun = { ...b, x: b.x + e * 0.03 * W, y: b.y + e * (G.groundY - b.y + 18) };
      else if (a) sun = { ...a, y: G.groundY + 18 - e * (G.groundY + 18 - a.y) };
      if (sun) {
        ctx.globalAlpha = 0.55;
        (sun.dusk ? duskGlow : sunGlow).draw(ctx, sun.x, sun.y, 0.75);
        ctx.globalAlpha = 1;
        ctx.fillStyle = sun.disc;
        ctx.beginPath(); ctx.arc(sun.x, sun.y, 11, 0, TAU); ctx.fill();
      }
      ctx.drawImage(landCanvas(G), 0, 0, W, H);
      // gate posts (gold while a sheep waits)
      ctx.strokeStyle = pouch.awaiting ? P.gold : '#6d685a';
      ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(G.gateX - 36, G.groundY + 3); ctx.lineTo(G.gateX - 36, G.groundY - 36);
      ctx.moveTo(G.gateX + 2, G.groundY + 3); ctx.lineTo(G.gateX + 2, G.groundY - 36);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // the sheep being paired glows faintly
      if (pouch.awaiting && pouch.active >= 0 && !pouch.runMemory) {
        const s = pouch.sheep[pouch.active];
        ctx.globalAlpha = 0.45; waitGlow.draw(ctx, s.x, s.y, 1.1 * G.s); ctx.globalAlpha = 1;
      }
      const order = pouch.sheep.filter((s) => s.x < W + 40 && s.state !== 'gone').sort((a, b) => a.y - b.y);
      for (const s of order) drawSheep(ctx, s, t, G.s * (1 + s.dy * 0.004));
      drawPouchBag(ctx, G, t);
      // pebbles in flight, and the gold thread that pairs each with its sheep
      for (const th of pouch.threads) {
        const a = reduced ? 0.8 : 1 - (t - th.t0) / th.dur;
        const f = pouch.flights.find((q) => q.s === th.s && q.t0 === th.t0);
        const b = backOf(G, th.s);
        const end = f ? flightPos(G, f, t) : (th.dir === 'in' ? heapPos(G, th.spot) : b);
        ctx.strokeStyle = rgba(P.gold, 0.7 * clamp(a, 0, 1)); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      }
      for (const f of pouch.flights) {
        const p = flightPos(G, f, t);
        ctx.fillStyle = P.inkDim; ctx.strokeStyle = P.bg; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 4.4, 3.4, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }
    function flightPos(G, f, t) {
      const u = f.dur ? easeOut((t - f.t0) / f.dur) : 1;
      const heap = heapPos(G, f.spot), back = backOf(G, f.s);
      const a = f.dir === 'in' ? back : heap, b = f.dir === 'in' ? heap : back;
      const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 36;
      const x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x;
      const y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y;
      return { x, y };
    }
    function pouchPath(ctx, x, y) {
      ctx.beginPath();
      ctx.moveTo(x - 13, y - 14);
      ctx.bezierCurveTo(x - 42, y - 4, x - 38, y + 27, x, y + 27);
      ctx.bezierCurveTo(x + 38, y + 27, x + 42, y - 4, x + 13, y - 14);
      ctx.closePath();
    }
    function drawPouchBag(ctx, G, t) {
      const x = G.pouchX, y = G.pouchY;
      if (pouch.runMemory || (pouch.mode === 'idle' && pouch.memory)) {
        // the pouch left at home: only its outline, where it would have been
        pouchPath(ctx, x, y);
        ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(P.inkDim, 0.45); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.setLineDash([]);
        text(ctx, 'no pouch today', x, y + 44, { font: fnt(12, SERIF, 'italic'), color: TEXT_FAINT, align: 'center' });
        return;
      }
      const hot = pouch.awaiting;
      const night = pouch.mode === 'night' || pouch.mode === 'resolved';
      const leftoverGlow = night && pouch.pebbles > 0;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(x, y + 27, 34, 5.5, 0, 0, TAU); ctx.fill();
      if (hot) {
        ctx.globalAlpha = reduced ? 0.5 : 0.35 + 0.25 * Math.sin(t * 5);
        ctx.strokeStyle = P.gold; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y - 2, 46, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const body = ctx.createLinearGradient(0, y - 18, 0, y + 27);
      body.addColorStop(0, '#2c261b'); body.addColorStop(1, '#15120d');
      ctx.fillStyle = body;
      ctx.strokeStyle = hot ? P.gold : leftoverGlow ? P.crimson : P.goldDim;
      ctx.lineWidth = 1.5;
      pouchPath(ctx, x, y); ctx.fill(); ctx.stroke();
      // drawstring
      ctx.strokeStyle = P.goldDim; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 11); ctx.quadraticCurveTo(x, y - 7, x + 14, y - 11);
      ctx.moveTo(x + 9, y - 9); ctx.quadraticCurveTo(x + 17, y - 1, x + 13, y + 7);
      ctx.moveTo(x + 11, y - 9); ctx.quadraticCurveTo(x + 22, y - 3, x + 21, y + 4);
      ctx.stroke();
      // mouth
      ctx.fillStyle = '#0b0a07'; ctx.strokeStyle = P.goldDim; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x, y - 16, 15, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      // heap: pebbles already landed
      const inFlight = pouch.flights.filter((f) => f.dir === 'in').length;
      const n = Math.min(Math.max(0, pouch.pebbles - inFlight), PEBBLE_SPOTS.length);
      if (leftoverGlow) {
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < n; i++) { const p = heapPos(G, i); leftGlow.draw(ctx, p.x, p.y, 1); }
        ctx.globalAlpha = 1;
      }
      for (let i = 0; i < n; i++) {
        const p = heapPos(G, i);
        ctx.fillStyle = leftoverGlow ? P.crimsonBright : P.inkDim;
        ctx.strokeStyle = P.bg; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 4.4, 3.4, PEBBLE_SPOTS[i].dx * 0.05, 0, TAU);
        ctx.fill(); ctx.stroke();
      }
      text(ctx, 'the pouch', x, y + 44, { font: fnt(12, SERIF, 'italic'), color: TEXT_FAINT, align: 'center' });
    }

    /* ================= station III — the carving ================= */

    const carve = {
      stage: 'group', pebbles: [], rings: [], ringR: 34, drag: -1, sel: -1, dragOff: [0, 0],
      down: null, boneT0: 0, hover: null, rects: [], total: 0, allPlaced: false, flockId: -1,
      doubt: false, sfxDone: new Set(), tl: null,
    };
    const carveRow = ui.controlRow(subCarve);
    const autoBtn = ui.button(carveRow, 'group them for me', () => autoGroup(), { small: true });
    const carveBtn = ui.button(carveRow, '⚒ carve it for keeps', () => {
      if (!carve.allPlaced || carve.stage !== 'group') return;
      audio.ensureAudio();
      carve.stage = 'bone';
      carve.boneT0 = lastT;
      carve.tl = carveTimeline(carve.total);
      carve.sfxDone = new Set();
      carve.hover = null;
      carveBtn.classList.add('tally-hidden');
      autoBtn.classList.add('tally-hidden');
      stepBtn.classList.remove('tally-hidden');
      doubtToggle.el.classList.remove('tally-hidden');
      recarveBtn.classList.remove('tally-hidden');
      syncTouch();
      setQuest('Pebbles spill; notches keep. Your handfuls go onto a stick first — then two real bones take shape.');
      info.set(INFO_DEFAULTS.bone);
      dirty = true;
    }, { primary: true });
    // The Ishango groups answer to hover, tap or this button only once they are all carved.
    const ishDone = () => carve.stage === 'bone' && !!carve.tl && (reduced || lastT - carve.boneT0 >= carve.tl.end);
    const stepBtn = ui.button(carveRow, 'step through the groups', () => {
      if (carve.stage !== 'bone') return;
      // pressed mid-carving, it skips to the finished bones (cues passed over stay silent)
      if (!ishDone()) { carve.boneT0 = lastT - carve.tl.end; carve.rects = ishGroups(boneLayout(handle.width, handle.height)); }
      const i = carve.hover ? (carve.rects.findIndex((r) => r.row === carve.hover.row && r.gi === carve.hover.gi) + 1) % 16 : 0;
      const r = carve.rects[i];
      if (r) { carve.hover = r; info.set(boneHoverText(r)); dirty = true; }
    }, { small: true });
    const doubtToggle = ui.toggle(carveRow, {
      label: 'Keller’s doubts', value: false,
      onChange: (v) => {
        carve.doubt = v;
        info.set(v ? 'the sceptic’s reading: one of the middle column’s fives is illegible, and its ten may be a nine.'
          : 'de Heinzelin’s reading: 3, 6, 4, 8, 10, 5, 5, 7 in the middle column.');
        dirty = true;
      },
    });
    const recarveBtn = ui.button(carveRow, '↺ back to pebbles', () => { buildCarve(); }, { small: true });
    for (const b of [autoBtn, carveBtn, stepBtn, recarveBtn]) b.type = 'button';
    carveBtn.classList.add('tally-hidden');
    stepBtn.classList.add('tally-hidden');
    doubtToggle.el.classList.add('tally-hidden');
    recarveBtn.classList.add('tally-hidden');     // shown once the pebbles have been carved

    const SEAL_DUR = 0.55;
    function ringGeo() {
      const W = handle.width, H = handle.height;
      return ringLayout(carve.rings.length || 1, W, H - 92);
    }
    function slotPos(ri, slot) {
      const r = carve.rings[ri], R = carve.ringR;
      const L = diceLayout(r.cap);
      const p = L[slot] || { x: 0, y: 0 };
      return { x: r.x + p.x * 0.42 * R, y: r.y + p.y * 0.36 * R };
    }
    const pebR = () => ({ rx: 11 * (carve.ringR / 34), ry: 9 * (carve.ringR / 34) });

    function ensureCarve() {
      const untouched = carve.stage === 'group' && carve.pebbles.every((p) => p.ring === null);
      if (!carve.pebbles.length || (carve.flockId !== pouch.playedId && untouched)) buildCarve();
    }
    function buildCarve() {
      const W = handle.width, H = handle.height;
      carve.stage = 'group';
      carve.drag = -1; carve.sel = -1; carve.hover = null; carve.rects = [];
      carve.allPlaced = false;
      carveBtn.classList.add('tally-hidden');
      autoBtn.classList.remove('tally-hidden');
      stepBtn.classList.add('tally-hidden');
      doubtToggle.el.classList.add('tally-hidden');
      recarveBtn.classList.add('tally-hidden');
      carve.flockId = pouch.playedId;
      carve.total = pouch.playedId ? pouch.playedSize : 17;
      const k = Math.ceil(carve.total / 5);
      const lay = ringLayout(k, W, H - 92);
      carve.ringR = lay.r;
      carve.rings = lay.pts.map((p, i) => ({
        x: p.x, y: p.y, cap: i === k - 1 ? carve.total - 5 * (k - 1) : 5, members: [], sealed: false, sealT: 0,
      }));
      const top = 40, bottom = Math.min(...lay.pts.map((p) => p.y)) - lay.r - 20;
      const { rx } = pebR();
      const dots = genDots(carve.total, Math.max(120, W - 48), Math.max(80, bottom - top), rx, rng);
      carve.pebbles = dots.map((d) => ({ x: 24 + d.x, y: top + d.y, ring: null, slot: -1, tw: null }));
      questSaved.carve = null;
      syncTouch();
      if (phase === 'carve') { applyQuest(); info.set(INFO_DEFAULTS.carve); }
      dirty = true;
    }
    function relayoutCarve() {
      if (!carve.rings.length || carve.stage !== 'group') return;
      const lay = ringGeo();
      carve.ringR = lay.r;
      lay.pts.forEach((p, i) => { carve.rings[i].x = p.x; carve.rings[i].y = p.y; });
      const W = handle.width;
      carve.pebbles.forEach((p) => {
        p.tw = null;
        if (p.ring !== null) { const q = slotPos(p.ring, p.slot); p.x = q.x; p.y = q.y; }
        else p.x = clamp(p.x, 14, W - 14);
      });
    }
    function placeInRing(i, ri, { animate = true, delay = 0, dur = 0.2 } = {}) {
      const p = carve.pebbles[i], r = carve.rings[ri];
      if (r.sealed || r.members.length >= r.cap) return false;
      const used = new Set(r.members.map((m) => carve.pebbles[m].slot));
      let si = 0;
      while (used.has(si)) si++;
      r.members.push(i);
      p.ring = ri; p.slot = si;
      const q = slotPos(ri, si);
      const moveT = animate && !reduced ? dur : 0;
      p.tw = moveT ? { x0: p.x, y0: p.y, t0: lastT + delay, dur: moveT } : null;
      p.x = q.x; p.y = q.y;
      sfx('wood', { pitch: 640 + r.members.length * 55, level: 0.4 }, delay + moveT * 0.8);
      if (r.members.length === r.cap) {
        r.sealed = true; r.sealT = lastT + delay + moveT;
        sfx('wood', { pitch: 440, level: 0.45 }, delay + moveT + 0.09);
      }
      carveDropCheck();
      dirty = true;
      return true;
    }
    function unplace(i) {
      const p = carve.pebbles[i];
      if (p.ring === null) return;
      const r = carve.rings[p.ring];
      r.members = r.members.filter((m) => m !== i);
      p.ring = null; p.slot = -1;
      carve.allPlaced = false;
      carveBtn.classList.add('tally-hidden');
      autoBtn.classList.remove('tally-hidden');
    }
    function autoGroup() {
      if (carve.stage !== 'group') return;
      audio.ensureAudio();
      let delay = 0;
      carve.pebbles.forEach((p, i) => {
        if (p.ring !== null) return;
        const ri = carve.rings.findIndex((r) => !r.sealed && r.members.length < r.cap);
        if (ri < 0) return;
        placeInRing(i, ri, { delay, dur: 0.34 });
        if (!reduced) delay += 0.07;
      });
      carve.sel = -1;
      dirty = true;
    }
    function carveDropCheck() {
      carve.allPlaced = carve.pebbles.every((p) => p.ring !== null);
      if (carve.allPlaced) {
        carveBtn.classList.remove('tally-hidden');
        autoBtn.classList.add('tally-hidden');
        setQuest('Every pebble has its place in a handful — five at a glance, readable again. Now carve them, ' +
          'the way tallies were cut in wood and, long before that, in bone.');
      }
    }
    function pebbleDrawPos(p, t) {
      if (!p.tw) return { x: p.x, y: p.y, moving: false };
      const u = (t - p.tw.t0) / p.tw.dur;
      if (u >= 1) { p.tw = null; return { x: p.x, y: p.y, moving: false }; }
      if (u <= 0) return { x: p.tw.x0, y: p.tw.y0, moving: true };
      const e = easeOut(u);
      return { x: p.tw.x0 + (p.x - p.tw.x0) * e, y: p.tw.y0 + (p.y - p.tw.y0) * e, moving: true };
    }
    // Stroke geometry for the member in `slot` of a sealed ring: centre, length, rotation.
    function strokeFor(r, slot) {
      const R = carve.ringR, pitch = 0.27 * R, len = 0.9 * R;
      const L = diceLayout(r.cap);
      const idx = L.map((p, i) => ({ p, i })).filter((q) => !(r.cap === 5 && q.i === 4))
        .sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y).map((q) => q.i);
      if (r.cap >= 5 && slot === 4) {
        const w = 3 * pitch + 6, h = len - 4;
        return { x: r.x, y: r.y, len: Math.hypot(w, h), rot: Math.atan2(w, h) };
      }
      const k = idx.indexOf(slot);
      const n = r.cap >= 5 ? 4 : r.cap;
      return { x: r.x + (k - (n - 1) / 2) * pitch, y: r.y, len, rot: 0 };
    }

    function drawCarve(ctx, W, H, t) {
      if (carve.stage !== 'group') return drawBones(ctx, W, H, t);
      let anim = false;
      text(ctx, 'a season of sheep, poured out of the pouch', W / 2, 24,
        { font: fnt(13, SERIF, 'italic'), color: P.inkDim, align: 'center' });
      const R = carve.ringR;
      const { rx, ry } = pebR();
      for (const r of carve.rings) {
        const age = r.sealed ? (t - r.sealT) : -1;
        const ringA = r.sealed ? (reduced ? 0 : clamp(1 - age / 0.5, 0, 1)) : 1;
        if (ringA > 0) {
          ctx.globalAlpha = ringA;
          ctx.strokeStyle = r.members.length ? P.goldDim : '#5a574c';
          ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          // ghost slots invite the pebbles
          ctx.fillStyle = rgba(P.inkFaint, 0.35);
          const L = diceLayout(r.cap);
          for (let s = 0; s < L.length; s++) {
            if (r.members.some((m) => carve.pebbles[m].slot === s)) continue;
            const q = slotPos(carve.rings.indexOf(r), s);
            ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (r.sealed && age >= 0 && age < 0.5 && !reduced) anim = true;
      }
      // pebbles (and sealed handfuls morphing into strokes)
      for (let i = 0; i < carve.pebbles.length; i++) {
        const p = carve.pebbles[i];
        const pos = pebbleDrawPos(p, t);
        if (pos.moving) anim = true;
        const ring = p.ring !== null ? carve.rings[p.ring] : null;
        if (ring && ring.sealed && t >= ring.sealT) {
          const u = reduced ? 1 : clamp((t - ring.sealT) / SEAL_DUR, 0, 1);
          if (u < 1) anim = true;
          const e = easeInOut(u);
          const sg = strokeFor(ring, p.slot);
          const x = pos.x + (sg.x - pos.x) * e, y = pos.y + (sg.y - pos.y) * e;
          if (u < 1) {
            ctx.fillStyle = mixHex(P.inkDim, P.goldBright, e);
            ctx.beginPath();
            ctx.ellipse(x, y, rx + (1.2 - rx) * e, ry + (sg.len / 2 - ry) * e, sg.rot * e, 0, TAU);
            ctx.fill();
          } else {
            ctx.strokeStyle = P.goldBright; ctx.lineWidth = 2.3; ctx.lineCap = 'round';
            const dx = -Math.sin(sg.rot) * sg.len / 2, dy = Math.cos(sg.rot) * sg.len / 2;
            ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
            ctx.lineCap = 'butt';
          }
          continue;
        }
        const lifted = i === carve.drag;
        if (lifted) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(pos.x + 3, pos.y + 5, rx, ry, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = P.inkDim;
        ctx.strokeStyle = lifted || i === carve.sel ? P.gold : P.bg;
        ctx.lineWidth = lifted || i === carve.sel ? 1.8 : 1.4;
        ctx.beginPath(); ctx.ellipse(pos.x, pos.y, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.beginPath(); ctx.ellipse(pos.x - rx * 0.3, pos.y - ry * 0.35, rx * 0.45, ry * 0.3, -0.3, 0, TAU); ctx.fill();
      }
      const lowest = Math.max(...carve.rings.map((r) => r.y));
      const sealedAll = carve.rings.every((r) => r.sealed && t >= r.sealT + SEAL_DUR);
      if (sealedAll) {
        const k5 = carve.rings.filter((r) => r.cap === 5).length, rem = carve.total - 5 * k5;
        const WORD = ['no', 'one', 'two', 'three', 'four', 'five'];
        const phrase = `${WORD[k5] || k5} handful${k5 === 1 ? '' : 's'}${rem ? ` and ${WORD[rem]}` : ''}`;
        text(ctx, phrase, W / 2, Math.min(...carve.rings.map((r) => r.y)) - R - 48,
          { font: fnt(20, SERIF, 'italic'), color: P.goldBright, align: 'center' });
        text(ctx, `${carve.total}, read at a glance`, W / 2, Math.min(...carve.rings.map((r) => r.y)) - R - 26,
          { font: fnt(11), color: TEXT_FAINT, align: 'center' });
      }
      text(ctx, carve.allPlaced ? 'every handful sealed' : 'handfuls of five', W / 2, lowest + R + 22,
        { font: fnt(10.5), color: TEXT_FAINT, align: 'center' });
      return anim;
    }

    /* --- the bones --- */
    const ISH_ROWS = [ISHANGO.left, ISHANGO.middle, ISHANGO.right];
    const ROW_SUMS = ISH_ROWS.map((r) => r.reduce((a, b) => a + b, 0));
    const ROW_TAG = ['G', 'M', 'D'];
    const boneCache = new Map();

    function boneSprite(kind, len, girth) {
      len = Math.max(40, len);   // never a negative radius, even mid-resize
      const key = `${kind}|${Math.round(len)}|${girth}|${handle.dpr}`;
      let c = boneCache.get(key);
      if (c) return c;
      const pad = 10, w = len + pad * 2, h = girth + pad * 2 + 6;
      const { c: cnv, g } = offscreen(w, h);
      const x0 = pad, x1 = pad + len, cy = pad + girth / 2, tt = girth / 2;
      const r = mulberry32(kind === 'ish' ? 20000 : kind === 'leb' ? 43000 : 1826);
      // the silhouette, kept as a Path2D so fill, clip and outline share it
      const sil = new Path2D();
      if (kind === 'stick') {
        const rr = Math.min(5, tt);
        sil.moveTo(x0 + rr, cy - tt); sil.lineTo(x1 - rr, cy - tt); sil.quadraticCurveTo(x1, cy - tt, x1, cy);
        sil.quadraticCurveTo(x1, cy + tt, x1 - rr, cy + tt); sil.lineTo(x0 + rr, cy + tt);
        sil.quadraticCurveTo(x0, cy + tt, x0, cy); sil.quadraticCurveTo(x0, cy - tt, x0 + rr, cy - tt);
      } else if (kind === 'leb') {
        // a shaft fragment, fractured where it broke
        sil.moveTo(x0 + 8, cy - tt * 0.8);
        sil.quadraticCurveTo((x0 + x1) / 2, cy - tt * 1.12, x1 - 8, cy - tt * 0.75);
        for (const [dx, fy] of [[7, -0.5], [1, -0.15], [9, 0.2], [3, 0.5], [6, 0.8]]) sil.lineTo(x1 - 8 + dx, cy + fy * tt);
        sil.quadraticCurveTo((x0 + x1) / 2, cy + tt * 1.1, x0 + 8, cy + tt * 0.8);
        for (const [dx, fy] of [[-5, 0.45], [2, 0.1], [-7, -0.25], [0, -0.55]]) sil.lineTo(x0 + 8 + dx, cy + fy * tt);
      } else {
        sil.moveTo(x0 + 16, cy - tt * 0.78);
        sil.quadraticCurveTo((x0 + x1) / 2, cy - tt * 1.06, x1 - 16, cy - tt * 0.72);
        sil.bezierCurveTo(x1 + 4, cy - tt * 0.9, x1 + 4, cy + tt * 0.9, x1 - 16, cy + tt * 0.72);
        sil.quadraticCurveTo((x0 + x1) / 2, cy + tt * 1.06, x0 + 16, cy + tt * 0.78);
        sil.bezierCurveTo(x0 - 4, cy + tt * 0.95, x0 - 4, cy - tt * 0.95, x0 + 16, cy - tt * 0.78);
      }
      sil.closePath();
      // soft cast shadow on the ground below
      g.save();
      g.translate((x0 + x1) / 2, cy + tt + 2);
      g.scale(1, Math.max(0.12, 5 / Math.max(1, len / 2)));
      const sh = g.createRadialGradient(0, 0, 0, 0, 0, len / 2);
      sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh; g.beginPath(); g.arc(0, 0, len / 2, 0, TAU); g.fill();
      g.restore();
      // body: lengthwise light from above
      const grad = g.createLinearGradient(0, cy - tt, 0, cy + tt);
      if (kind === 'ish') { grad.addColorStop(0, '#866b4a'); grad.addColorStop(0.45, '#5d4832'); grad.addColorStop(1, '#33271b'); }
      else if (kind === 'leb') { grad.addColorStop(0, '#e2d9c0'); grad.addColorStop(0.5, '#b8ae93'); grad.addColorStop(1, '#79725f'); }
      else { grad.addColorStop(0, '#b0976a'); grad.addColorStop(0.55, '#8a7148'); grad.addColorStop(1, '#5c4a2e'); }
      g.fillStyle = grad; g.fill(sil);
      g.save(); g.clip(sil);
      // grain: long faint seeded curves, then a sheen along the upper edge
      g.strokeStyle = kind === 'ish' ? 'rgba(20,14,8,0.26)' : kind === 'leb' ? 'rgba(70,62,44,0.2)' : 'rgba(50,36,18,0.28)';
      g.lineWidth = 0.8;
      for (let i = 0; i < (kind === 'stick' ? 5 : 9); i++) {
        const yy = cy - tt + r() * girth, amp = 1 + r() * 2.5, ph = r() * 6;
        g.beginPath();
        for (let x = x0 - 6; x <= x1 + 6; x += 6) {
          const y = yy + Math.sin(x * 0.02 + ph) * amp;
          if (x === x0 - 6) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      const sheen = g.createLinearGradient(0, cy - tt, 0, cy - tt * 0.2);
      sheen.addColorStop(0, kind === 'ish' ? 'rgba(255,226,170,0.16)' : 'rgba(255,250,235,0.22)');
      sheen.addColorStop(1, 'rgba(255,250,235,0)');
      g.fillStyle = sheen; g.fillRect(x0 - 8, cy - tt - 2, len + 16, tt);
      g.restore();
      g.strokeStyle = kind === 'ish' ? 'rgba(232,200,124,0.3)' : 'rgba(10,11,16,0.55)';
      g.lineWidth = 1; g.stroke(sil);
      if (kind === 'ish') {
        // the quartz fragment fixed to one end ("topped with a fragment of quartz", RBINS)
        const qx = x1 - 3, qy = cy - 2;
        g.beginPath();
        g.moveTo(qx - 5, qy - 5); g.lineTo(qx + 4, qy - 7); g.lineTo(qx + 9, qy - 1); g.lineTo(qx + 5, qy + 6); g.lineTo(qx - 4, qy + 5);
        g.closePath();
        g.fillStyle = 'rgba(220,228,238,0.88)'; g.fill();
        g.strokeStyle = 'rgba(125,167,217,0.9)'; g.lineWidth = 0.8; g.stroke();
        g.beginPath(); g.moveTo(qx + 4, qy - 7); g.lineTo(qx + 1, qy); g.lineTo(qx + 5, qy + 6);
        g.moveTo(qx + 1, qy); g.lineTo(qx - 5, qy - 5);
        g.strokeStyle = 'rgba(125,167,217,0.55)'; g.stroke();
      }
      c = { c: cnv, w, h, pad, cyOff: cy - h / 2 };
      if (boneCache.size > 12) boneCache.clear();
      boneCache.set(key, c);
      return c;
    }
    function blitBone(ctx, spr, cx, cy) { ctx.drawImage(spr.c, cx - spr.w / 2, cy - spr.h / 2 - spr.cyOff, spr.w, spr.h); }
    function incision(ctx, x, y0, y1, w, lean, dark, lip) {
      const dx = Math.tan(lean) * (y1 - y0) / 2;
      ctx.strokeStyle = dark; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x - dx, y0); ctx.lineTo(x + dx, y1); ctx.stroke();
      if (lip) {
        ctx.strokeStyle = lip; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x - dx + w / 2 + 0.5, y0 + 0.5); ctx.lineTo(x + dx + w / 2 + 0.5, y1 - 0.5); ctx.stroke();
      }
    }
    const TOOL = {
      1: { w: 1.1, lean: -0.1, len: 0.62 },
      2: { w: 2.4, lean: 0, len: 0.66 },
      3: { w: 1.6, lean: -0.05, len: 0.64 },
      4: { w: 3.0, lean: 0.14, len: 0.56 },
      5: { w: 1.0, lean: 0.34, len: 0.42 },
    };

    function boneLayout(W, H) {
      const m = W < 520 ? 12 : 24;
      const sm = stickMarks(carve.total);
      const stickLen = Math.max(40, Math.min(Math.max(sm.width + 44, 150), W - 2 * m - 90));
      const lebLen = Math.max(40, Math.min(W - 2 * m, 400));
      const ishX0 = m + 16, ishX1 = W - m - 40;
      const ishLen = Math.max(40, Math.min(480, ishX1 - ishX0));
      return {
        m, narrow: W < 560,
        stick: { cx: W / 2, y: 54, len: stickLen, girth: 18, marks: sm },
        leb: { cx: W / 2, y: W < 560 ? 152 : 160, len: lebLen, girth: 28 },
        ish: { cx: (ishX0 + ishX1) / 2, y: W < 560 ? 298 : 314, len: ishLen, girth: 78 },
        H,
      };
    }
    function ishGroups(L) {
      const bx0 = L.ish.cx - L.ish.len / 2 + 18, bx1 = L.ish.cx + L.ish.len / 2 - 22;
      const usable = bx1 - bx0;
      const out = [];
      let flat = 0;
      for (let row = 0; row < 3; row++) {
        const arr = ISH_ROWS[row], total = ROW_SUMS[row];
        const est = usable / (total + arr.length * 2);
        const gp = clamp(est * 1.9, 5, 13);
        const pitch = (usable - gp * (arr.length - 1)) / total;
        const y = L.ish.y + (row - 1) * 23;
        let x = bx0;
        for (let gi = 0; gi < arr.length; gi++, flat++) {
          const count = arr[gi], w = pitch * count;
          out.push({ row, gi, count, flat, x: x - 3, y: y - 11, w: w + 6, h: 22, x0: x, pitch, cy: y });
          x += w + gp;
        }
      }
      return out;
    }

    function drawBones(ctx, W, H, t) {
      const el = reduced ? 1e9 : t - carve.boneT0;
      const tl = carve.tl || carveTimeline(carve.total);
      const L = boneLayout(W, H);
      // A cue sounds only when its moment has just been crossed; cues skipped
      // while the visitor was at another station are retired silently.
      const cue = (key, at, fn) => {
        if (el < at || carve.sfxDone.has(key)) return;
        carve.sfxDone.add(key);
        if (!reduced && el - at < 0.3) fn();
      };

      // ---- your stick, then the split ----
      const S = L.stick;
      const nSt = tl.stick.filter((x) => el >= x).length;
      const splitU = reduced ? 1 : easeInOut((el - tl.split) / 0.45);
      const gap = 5 * splitU;
      const spr = boneSprite('stick', S.len, S.girth);
      const sx0 = S.cx - S.marks.width / 2, half = S.girth / 2;
      const DARK = 'rgba(30,21,10,0.92)', LIP = 'rgba(255,236,190,0.35)';
      const halves = splitU > 0 ? [[-1, -gap], [1, gap]] : [[0, 0]];
      for (const [side, off] of halves) {
        ctx.save();
        ctx.translate(0, off);
        if (side) { ctx.beginPath(); ctx.rect(0, side < 0 ? 0 : S.y, W, side < 0 ? S.y : H - S.y); ctx.clip(); }
        blitBone(ctx, spr, S.cx, S.y);
        ctx.lineCap = 'round';
        for (let i = 0; i < nSt; i++) {
          const mk = S.marks.marks[i];
          if (!mk.gate) { incision(ctx, sx0 + mk.x, S.y - half + 3, S.y + half - 3, 1.7, 0, DARK, LIP); continue; }
          ctx.strokeStyle = DARK; ctx.lineWidth = 1.7;
          ctx.beginPath(); ctx.moveTo(sx0 + mk.x0, S.y + half - 4); ctx.lineTo(sx0 + mk.x1, S.y - half + 4); ctx.stroke();
          ctx.strokeStyle = LIP; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(sx0 + mk.x0 + 1.2, S.y + half - 3.2); ctx.lineTo(sx0 + mk.x1 + 1.2, S.y - half + 4.8); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        if (side) {
          // the freshly split face is paler than the weathered bark
          ctx.strokeStyle = rgba('#e6cf98', 0.55 * splitU); ctx.lineWidth = 1;
          const fy = S.y + (side < 0 ? -0.5 : 0.5);
          ctx.beginPath(); ctx.moveTo(S.cx - S.len / 2 + 2, fy); ctx.lineTo(S.cx + S.len / 2 - 2, fy); ctx.stroke();
        }
        ctx.restore();
      }
      for (let g = 0; g < Math.ceil(carve.total / 5); g++) cue('st' + g, tl.stick[Math.min(carve.total - 1, g * 5 + 4)], () => sfx('wood', { pitch: 760, level: 0.3 }));
      cue('split', tl.split, () => sfx('thock', { level: 0.35 }));
      const k5 = Math.floor(carve.total / 5), rem = carve.total % 5;
      const sumStr = [...Array(k5).fill('5'), ...(rem ? [String(rem)] : [])].join(' + ');
      text(ctx, `your flock of ${carve.total}, notched in fives`, S.cx, S.y - half - 12,
        { font: fnt(12.5, SERIF, 'italic'), color: P.inkDim, align: 'center' });
      text(ctx, `${carve.total} = ${sumStr}`, S.cx, S.y + half + 19, { font: fnt(10.5), color: P.gold, align: 'center' });
      if (splitU > 0) {
        const lx = S.cx + S.len / 2 + 10;
        ctx.globalAlpha = clamp(splitU * 1.6 - 0.4, 0, 1);
        text(ctx, 'stock', lx, S.y - gap - half / 2 + 4, { font: fnt(11.5, SERIF, 'italic'), color: TEXT_FAINT });
        text(ctx, 'foil', lx, S.y + gap + half / 2 + 4, { font: fnt(11.5, SERIF, 'italic'), color: TEXT_FAINT });
        wrapped(ctx, L.narrow ? 'split in two: each half fits only its twin'
          : 'split through the notches: each half fits only its twin', W / 2, S.y + half + 35, W - 2 * L.m, 13,
          { font: fnt(10), color: TEXT_FAINT, align: 'center' });
        ctx.globalAlpha = 1;
      }

      // ---- Border Cave ----
      const B = L.leb;
      const lebStart = tl.leb[0].t;
      if (el >= lebStart - 0.35) {
        const a = reduced ? 1 : clamp((el - lebStart + 0.35) / 0.35, 0, 1);
        ctx.globalAlpha = a;
        blitBone(ctx, boneSprite('leb', B.len, B.girth), B.cx, B.y);
        ctx.globalAlpha = 1;
        const bx0 = B.cx - B.len / 2 + 20, pitch = (B.len - 40) / LEBOMBO_NOTCHES;
        const lebEnd = tl.leb[tl.leb.length - 1].t + 0.3;
        ctx.lineCap = 'round';
        for (const nt of tl.leb) {
          if (el < nt.t) continue;
          const T = TOOL[nt.tool];
          const x = bx0 + (nt.notch - 0.5) * pitch;
          const hl = B.girth * T.len / 2;
          incision(ctx, x, B.y - hl, B.y + hl, T.w, T.lean, 'rgba(26,22,14,0.88)', 'rgba(255,250,235,0.45)');
          if (nt.later && el >= lebEnd) {
            ctx.fillStyle = P.azure;
            ctx.beginPath(); ctx.moveTo(x, B.y + B.girth / 2 + 4); ctx.lineTo(x - 3, B.y + B.girth / 2 + 9); ctx.lineTo(x + 3, B.y + B.girth / 2 + 9); ctx.closePath(); ctx.fill();
          }
        }
        ctx.lineCap = 'butt';
        LEBOMBO_SETS.forEach((s, i) => cue('leb' + i, tl.setStart[i], () => (s.later ? sfx('wood', { pitch: 520, level: 0.35 }) : sfx('thock', { level: 0.3 }))));
        const cy = B.y + B.girth / 2 + 24;
        const n1 = wrapped(ctx, L.narrow ? 'Border Cave · baboon fibula · c. 43,000 years'
          : 'Border Cave, Lebombo Mountains · baboon fibula · c. 43,000 years', W / 2, cy, W - 2 * L.m, 15,
          { font: fnt(12.5, SERIF, 'italic'), color: P.inkDim, align: 'center' });
        wrapped(ctx, L.narrow ? '29 notches, four or five edges · ▴ cut later, between older ones'
          : '29 notches from four or five cutting edges · ▴ cut later, between older ones · the sequence is incomplete',
        W / 2, cy + n1 * 15, W - 2 * L.m, 13, { font: fnt(10), align: 'center' });
      }

      // ---- Ishango ----
      const I = L.ish;
      const ish0 = tl.ish[0];
      carve.rects = ishGroups(L);
      if (el >= ish0 - 0.4) {
        const a = reduced ? 1 : clamp((el - ish0 + 0.4) / 0.4, 0, 1);
        ctx.globalAlpha = a;
        blitBone(ctx, boneSprite('ish', I.len, I.girth), I.cx, I.y);
        // face edges between the columns
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const dy of [-11.5, 11.5]) { ctx.moveTo(I.cx - I.len / 2 + 14, I.y + dy); ctx.lineTo(I.cx + I.len / 2 - 18, I.y + dy); }
        ctx.stroke();
        for (let row = 0; row < 3; row++) {
          const y = I.y + (row - 1) * 23;
          text(ctx, ROW_TAG[row], I.cx - I.len / 2 - 6, y + 4, { font: fnt(11.5, SERIF), color: P.inkDim, align: 'right' });
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        for (const r of carve.rects) {
          const gt = tl.ish[r.flat];
          if (el < gt) continue;
          const vis = clamp(Math.floor(((el - gt) / tl.ishStep) * (r.count + 1)), 0, r.count);
          const doubtNine = carve.doubt && r.row === 1 && r.gi === 4;
          for (let i = 0; i < vis; i++) {
            const nx = r.x0 + (i + 0.5) * r.pitch;
            const ghost = doubtNine && i === r.count - 1;
            incision(ctx, nx, r.cy - 7, r.cy + 7, Math.min(1.5, r.pitch * 0.42), 0,
              ghost ? 'rgba(10,8,5,0.35)' : 'rgba(10,8,5,0.92)', ghost ? null : 'rgba(232,200,124,0.32)');
          }
        }
        ctx.lineCap = 'butt';
        carve.rects.forEach((r) => cue('ish' + r.flat, tl.ish[r.flat], () => sfx('thock', { level: 0.26 })));
        // hover / partner outlines
        const hv = carve.hover;
        if (hv && el >= tl.end) {
          const partner = hv.row === 1 && hv.gi < 6 ? carve.rects.find((q) => q.row === 1 && q.gi === (hv.gi ^ 1)) : null;
          for (const [q, col] of [[partner, P.azure], [carve.rects.find((q) => q.row === hv.row && q.gi === hv.gi), P.goldBright]]) {
            if (!q) continue;
            roundRect(ctx, q.x + 0.5, q.y + 0.5, q.w, q.h, 3);
            ctx.fillStyle = rgba(col, 0.1); ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.stroke();
          }
        }
        if (el >= tl.end) {
          for (let row = 0; row < 3; row++) {
            const y = I.y + (row - 1) * 23;
            const doubtful = carve.doubt && row === 1;
            text(ctx, doubtful ? '48?' : String(ROW_SUMS[row]), I.cx + I.len / 2 + 14, y + 4,
              { font: fnt(11.5), color: doubtful ? P.crimsonBright : P.gold });
          }
          if (carve.doubt) {
            ctx.setLineDash([2, 2]); ctx.strokeStyle = P.crimsonBright; ctx.lineWidth = 1.1;
            for (const q of carve.rects.filter((q) => q.row === 1 && q.gi >= 4 && q.gi <= 6)) {
              roundRect(ctx, q.x + 1.5, q.y + 2.5, q.w - 2, q.h - 4, 2); ctx.stroke();
            }
            ctx.setLineDash([]);
          }
          const cy = I.y + I.girth / 2 + 24;
          const n1 = wrapped(ctx, L.narrow ? 'Ishango · Lake Edward · c. 20,000 years'
            : 'Ishango · Congolese shore of Lake Edward · c. 20,000 years', W / 2, cy, W - 2 * L.m, 15,
            { font: fnt(12.5, SERIF, 'italic'), color: P.inkDim, align: 'center' });
          wrapped(ctx, carve.doubt
            ? 'Keller, 2010: one of the fives is illegible, and the ten could be a nine'
            : 'schematic: the three columns side by side · the groups as Jean de Heinzelin read them',
          W / 2, cy + n1 * 15, W - 2 * L.m, 13, { font: fnt(10), color: carve.doubt ? P.crimsonBright : TEXT_FAINT, align: 'center' });
          if (!questSaved.carve || !questSaved.carve.done) {
            setQuest('Sixty, forty-eight, sixty — and in the middle row a 3 beside a 6, a 4 beside an 8. ' +
              'Doubling? Twenty thousand years on, the bone still isn’t saying.', true);
          }
        }
      }
      return !reduced && el < tl.end + 0.1;
    }

    function boneHoverText(r) {
      const col = `column ${ROW_TAG[r.row]}`;
      if (r.row === 0) return `${col}: ${r.count} notches. The column reads 11, 13, 17, 19 — the primes between 10 and 20 — and sums to 60.`;
      if (r.row === 2) return `${col}: ${r.count} notches. The column reads 11, 21, 19, 9 — 10 + 1, 20 + 1, 20 − 1, 10 − 1 — and sums to 60.`;
      const d = carve.doubt;
      const M = [
        '3 notches, and beside them 6: its double?',
        '6 notches, twice the 3 beside them?',
        '4 notches, and beside them 8: its double?',
        '8 notches, twice the 4 beside them?',
        d ? '10 notches on de Heinzelin’s count; Keller reads this group as possibly 9.' : '10 notches, and beside them 5: its half?',
        d ? '5 notches, one of two fives; Keller calls one of them illegible.' : '5 notches, half the 10 beside them — or one clean handful.',
        d ? 'another 5; Keller calls one of the two fives illegible.' : 'another 5.',
        '7 notches. On de Heinzelin’s count the column sums to 48.',
      ];
      return `${col}: ${M[r.gi]}`;
    }

    /* ================= station IV — compression ================= */

    const comp = { n: 7000, doneShown: false };
    const LOG_MAX = Math.log(7000000);
    const nFromSlider = (v) => Math.max(1, Math.round(Math.exp(v * LOG_MAX)));
    const compRow = ui.controlRow(subCompress);
    const compSlider = ui.slider(compRow, {
      label: 'the flock',
      min: 0, max: 1, step: 0.001,
      value: Math.log(comp.n) / LOG_MAX,
      format: (v) => `${math.formatBig(nFromSlider(v))} sheep`,
      onInput: (v) => {
        comp.n = nFromSlider(v);
        dirty = true;
        if (comp.n >= 7000000 && !comp.doneShown) {
          comp.doneShown = true;
          setQuest('The tally left the room kilometres ago. The numeral, four digits when this slider ' +
            'started, now spends seven — and Babylon, two exhibits on, writes it in four places.', true);
        }
      },
    });
    comp.n = nFromSlider(compSlider.value);   // sync with the browser's snapped slider value

    function fmtLen(marks) {
      const mm = marks * 4;               // one notch ≈ 4 mm of bone
      if (mm >= 1e6) { const km = mm / 1e6; return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`; }
      if (mm >= 1000) { const m = mm / 1000; return `${m >= 10 ? Math.round(m) : m.toFixed(1)} m`; }
      return `${Math.round(mm / 10)} cm`;
    }
    let fadeCache = null;
    function overflowFade(ctx, maxX, y, h) {
      if (!fadeCache || fadeCache.maxX !== maxX) {
        const g = ctx.createLinearGradient(maxX - 70, 0, maxX + 4, 0);
        g.addColorStop(0, 'rgba(10,11,16,0)'); g.addColorStop(1, P.bg);
        fadeCache = { maxX, g };
      }
      ctx.fillStyle = fadeCache.g;
      ctx.fillRect(maxX - 70, y, 78, h);
      text(ctx, '⋯', maxX + 7, y + h / 2 + 4, { font: fnt(13), color: TEXT_FAINT });
    }
    const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    const sup = (k) => String(k).split('').map((d) => SUP[+d]).join('');

    function drawCompress(ctx, W, H) {
      const n = comp.n;
      const c = compressionCounts(n);
      const fmt = (x) => math.formatBig(x);
      const left = W < 520 ? 14 : 22, right = W - left;
      const maxX = right - (W < 520 ? 22 : 64);
      const Y = [26, 100, 174, 238, 306, 362];
      const narrow = W < 520;
      const rows = [
        { long: 'tally — one mark per sheep', short: 'tally', count: `${fmt(c.tally)} mark${c.tally === 1 ? '' : 's'}` },
        { long: 'grouped in fives — the same marks, a fifth of the glances', short: 'in fives', count: `${fmt(c.grouped)} glance${c.grouped === 1 ? '' : 's'}` },
        { long: 'Egyptian hieroglyphs — a sign per power of ten, repeated', short: 'Egyptian', count: `${c.signs} sign${c.signs === 1 ? '' : 's'}` },
        { long: 'positional decimal — one digit per power of ten', short: 'decimal', count: `${c.digits} digit${c.digits === 1 ? '' : 's'}` },
        { long: 'Babylonian base sixty — one place per power of sixty', short: 'base sixty', count: `${c.places} place${c.places === 1 ? '' : 's'}` },
        { long: 'binary — one bit per power of two', short: 'binary', count: `${c.bits} bit${c.bits === 1 ? '' : 's'}` },
      ];
      // one register for every row: the long glosses only if all of them fit
      const allLong = rows.every((r) => {
        ctx.font = fnt(11.5); const cw = ctx.measureText(r.count).width;
        ctx.font = fnt(13, SERIF, 'italic');
        return ctx.measureText(r.long).width + cw + 24 < right - left;
      });
      rows.forEach((r, i) => {
        text(ctx, allLong ? r.long : r.short, left, Y[i], { font: fnt(13, SERIF, 'italic'), color: P.inkDim });
        text(ctx, r.count, right, Y[i], { font: fnt(11.5), color: P.gold, align: 'right' });
      });
      const noteFont = fnt(10.5);
      // 1 · raw tally
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.lineCap = 'butt';
      const r1 = drawStrokeRun(ctx, left + 2, Y[0] + 10, n, { pitch: 5, h: 26, maxX });
      if (r1.overflow) {
        overflowFade(ctx, maxX, Y[0] + 6, 34);
        text(ctx, narrow ? `…${fmt(n - r1.drawn)} more · a rod ${fmtLen(n)} long`
          : `…${fmt(n - r1.drawn)} more — a rod of notches ${fmtLen(n)} long, at 4 mm a notch`,
        left, Y[0] + 52, { font: noteFont });
      }
      // 2 · grouped in fives
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2;
      const r2 = drawTallyRun(ctx, left + 4, Y[1] + 10, n, { pitch: 6, gap: 9, h: 24, maxX });
      if (r2.overflow) {
        overflowFade(ctx, maxX, Y[1] + 6, 32);
        text(ctx, `…${fmt(c.grouped - r2.symbols)} more handfuls — still a hillside`, left, Y[1] + 52, { font: noteFont });
      }
      // 3 · Egyptian: a sign per power of ten, repeated
      {
        const digs = String(n).split('').map(Number);
        const top = digs.length - 1;
        let x = left + 2, clipped = false, drawnSigns = 0;
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.05; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 0; i < digs.length && !clipped; i++) {
          const p = top - i, d = digs[i];
          if (!d) continue;
          const adv = p === 0 ? 6 : 15;
          const gx = x;
          for (let k = 0; k < d; k++) {
            if (x + adv > maxX) { clipped = true; break; }
            ctx.save(); ctx.translate(x, Y[2] + 8); ctx.scale(1.3, 1.3);
            drawHiero(ctx, p, 0, 0);
            ctx.restore();
            x += adv; drawnSigns++;
          }
          text(ctx, p === 0 ? '1' : `10${sup(p)}`, (gx + x - (p === 0 ? 1 : 3)) / 2, Y[2] + 45, { font: fnt(9), align: 'center' });
          x += 12;
        }
        ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        if (clipped) { overflowFade(ctx, maxX, Y[2] + 6, 28); text(ctx, `…${c.signs - drawnSigns} more signs`, left + 90, Y[2] + 45, { font: noteFont }); }
      }
      // 4 · the positional numeral (digits grouped by space, not by commas)
      {
        const s = String(n);
        ctx.font = fnt(narrow ? 34 : 40);
        const dw = ctx.measureText('0').width, gp = dw * 0.32;
        let x = left;
        ctx.fillStyle = P.goldBright; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        for (let i = 0; i < s.length; i++) {
          ctx.fillText(s[i], x, Y[3] + 46);
          x += dw;
          if ((s.length - 1 - i) % 3 === 0 && i < s.length - 1) x += gp;
        }
      }
      // 5 · base sixty, as wedges and as transliteration
      {
        const d60 = toBase(n, 60);
        const u = narrow ? 17 : 20;
        let x = left + 2;
        ctx.fillStyle = P.inkDim;
        d60.forEach((v, i) => { x += drawSexDigit(ctx, v, x, Y[4] + 10, u); if (i < d60.length - 1) x += u * 0.55; });
        text(ctx, d60.join(','), x + 14, Y[4] + 27, { font: fnt(narrow ? 12 : 13.5), color: P.azure });
      }
      // 6 · binary, and Morris's register, which keeps only the exponent
      {
        const bits = n.toString(2);
        const f = fnt(narrow ? 12 : 13);
        ctx.font = f;
        const bw = ctx.measureText('0').width, gp = bw * 0.45;
        let x = left + 2;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        for (let i = 0; i < bits.length; i++) {
          ctx.fillStyle = bits[i] === '1' ? P.ink : TEXT_FAINT;
          ctx.fillText(bits[i], x, Y[5] + 23);
          x += bw;
          if ((bits.length - 1 - i) % 4 === 0 && i < bits.length - 1) x += gp;
        }
        const mr = morrisRegister(n);
        const vb = mr.v.toString(2);
        const long = `Morris, 1978: keep only the exponent, ${mr.v} = ${vb} in ${mr.bits} bit${mr.bits === 1 ? '' : 's'}, and read back roughly 2${sup(mr.v)}`;
        const short = `Morris, 1978: keep only the exponent, ${mr.v}, in ${mr.bits} bit${mr.bits === 1 ? '' : 's'}`;
        const shortest = `Morris: keep the exponent, ${mr.v}, in ${mr.bits} bit${mr.bits === 1 ? '' : 's'}`;
        const mf = fnt(12, SERIF, 'italic');
        ctx.font = mf;
        const fits = (s) => ctx.measureText(s).width < right - left;
        text(ctx, fits(long) ? long : fits(short) ? short : shortest, left, Y[5] + 42, { font: mf, color: P.verdigris });
      }
      if (c.digits >= 7) {
        text(ctx, 'seven digits hold what no hillside of bones could.', W / 2, H - 11,
          { font: fnt(13.5, SERIF, 'italic'), color: P.gold, align: 'center' });
      }
    }

    /* ---------- pointer handling ---------- */

    function pouchHit(px, py) {
      const G = geo();
      const dx = (px - G.pouchX) / 62, dy = (py - (G.pouchY - 4)) / 52;
      return dx * dx + dy * dy <= 1.6;
    }
    function pebbleAt(px, py) {
      const { rx } = pebR();
      const hr = Math.max(15, rx + 4);
      for (let i = carve.pebbles.length - 1; i >= 0; i--) {
        const p = carve.pebbles[i];
        if (p.ring !== null && carve.rings[p.ring].sealed) continue;
        if ((px - p.x) ** 2 + (py - p.y) ** 2 <= hr * hr) return i;
      }
      return -1;
    }
    function ringAt(px, py, slack = 18) {
      let best = -1, bd = Infinity;
      carve.rings.forEach((r, ri) => {
        if (r.sealed || r.members.length >= r.cap) return;
        const d = Math.hypot(px - r.x, py - r.y);
        if (d < carve.ringR + slack && d < bd) { bd = d; best = ri; }
      });
      return best;
    }
    function onDown(e) {
      const [px, py] = cv.pointerPos(handle, e);
      if (phase === 'pouch') {
        audio.ensureAudio();
        if (pouchHit(px, py)) pouchTap(lastT);
        else if (pouch.awaiting && !pouch.runMemory) info.set('tap the pouch itself — one pebble, one sheep.');
      } else if (phase === 'carve' && carve.stage === 'group') {
        const i = pebbleAt(px, py);
        if (i >= 0) {
          const p = carve.pebbles[i];
          unplace(i);
          p.tw = null;
          carve.drag = i;
          carve.down = { x: px, y: py, i };
          carve.dragOff = [p.x - px, p.y - py];
          try { handle.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        } else if (carve.sel >= 0) {
          const ri = ringAt(px, py);
          if (ri >= 0) { audio.ensureAudio(); placeInRing(carve.sel, ri, { dur: 0.3 }); }
          carve.sel = -1;
        }
        dirty = true;
      } else if (phase === 'carve' && carve.stage === 'bone' && ishDone()) {
        const hit = carve.rects.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null;
        if (hit) { carve.hover = hit; info.set(boneHoverText(hit)); dirty = true; }
      }
    }
    function onMove(e) {
      const [px, py] = cv.pointerPos(handle, e);
      let cursor = 'default';
      if (phase === 'pouch' && pouch.awaiting && !pouch.runMemory) {
        if (pouchHit(px, py)) cursor = 'pointer';
      } else if (phase === 'carve' && carve.stage === 'group') {
        if (carve.drag >= 0) {
          const p = carve.pebbles[carve.drag];
          p.x = clamp(px + carve.dragOff[0], 12, handle.width - 12);
          p.y = clamp(py + carve.dragOff[1], 12, handle.height - 12);
          cursor = 'grabbing';
          dirty = true;
        } else if (pebbleAt(px, py) >= 0) cursor = 'grab';
        else if (carve.sel >= 0 && ringAt(px, py) >= 0) cursor = 'pointer';
      } else if (phase === 'carve' && carve.stage === 'bone' && ishDone()) {
        const hit = carve.rects.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null;
        if (hit && (!carve.hover || carve.hover.row !== hit.row || carve.hover.gi !== hit.gi)) {
          carve.hover = hit;
          info.set(boneHoverText(hit));
          dirty = true;
        }
        if (hit) cursor = 'crosshair';
      }
      handle.canvas.style.cursor = cursor;
    }
    function onUp(e) {
      if (carve.drag >= 0) {
        const i = carve.drag, p = carve.pebbles[i];
        const [px, py] = cv.pointerPos(handle, e);
        const tap = carve.down && carve.down.i === i && Math.hypot(px - carve.down.x, py - carve.down.y) < 6;
        carve.drag = -1;
        if (tap && e.type !== 'pointercancel') {
          carve.sel = carve.sel === i ? -1 : i;
          if (carve.sel >= 0) info.set('now tap a ring to drop it in.');
        } else {
          const ri = ringAt(p.x, p.y, 14);
          if (ri >= 0) { audio.ensureAudio(); placeInRing(i, ri); }
          carve.sel = -1;
        }
        carve.down = null;
        dirty = true;
      }
      try { handle.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('pointerup', onUp);
    handle.canvas.addEventListener('pointercancel', onUp);

    /* ---------- resize: keep scene proportions ---------- */
    let prevW = handle.width;
    handle.onResize((w) => {
      dirty = true;
      skyCache.clear(); boneCache.clear(); fadeCache = null; noise = null;
      const f = w / prevW;
      if (!isFinite(f) || f <= 0 || f === 1) return;
      prevW = w;
      const depth = geo().depth;
      for (const s of pouch.sheep) {
        s.x *= f; if (s.tx !== null) s.tx *= f;
        s.dy = clamp(s.dy, -8, depth); if (s.tdy !== null) s.tdy = clamp(s.tdy, -8, depth);
      }
      for (const p of carve.pebbles) if (p.ring === null) p.x *= f;
      relayoutCarve();
    });

    /* ---------- main loop ---------- */
    // The exhibit keeps its own clock, advanced only by frames that run, so time
    // stands still while it is paused (off-screen or hidden tab) and a carving or
    // a day in the pasture resumes where it was left instead of leaping ahead.
    let clock = 0;
    function frame(dt) {
      clock += dt;
      const t = clock;
      lastT = t;
      let live = false;
      if (phase === 'flash') live = flashStep(t);
      else if (phase === 'pouch') live = updatePouch(dt, t);
      if (!dirty && !animating && !live) return;
      dirty = false;
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      let more = false;
      if (phase === 'flash') drawFlash(ctx, W, H);
      else if (phase === 'pouch') drawPouchScene(ctx, W, H, t);
      else if (phase === 'carve') more = drawCarve(ctx, W, H, t) === true;
      else drawCompress(ctx, W, H);
      animating = live || more;
    }
    const loop = cv.rafLoop(frame);
    loop.start();
    setPhase('flash');

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        if (flash.running) stopFlash();
        bus.mute();
      },
      resume() {
        bus.unmute();
        dirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        if (flash.running) stopFlash();
        document.removeEventListener('keydown', onKey);
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotionPref);
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointermove', onMove);
        handle.canvas.removeEventListener('pointerup', onUp);
        handle.canvas.removeEventListener('pointercancel', onUp);
        skyCache.clear(); boneCache.clear(); wrapCache.clear();
        bus.mute();
        bus.dispose();
        handle.destroy();
        style.remove();
      },
    };
  },
};

/* ================= test exports ================= */

export const _test = {
  mulberry32,
  genDots,
  makeDeck,
  compressionCounts,
  statsSeries,
  ISHANGO,
  LEBOMBO_NOTCHES,
  // v2 additions
  measuredEdge,
  JEVONS_1871,
  diceLayout,
  toBase,
  wrapText,
  ringLayout,
  LEBOMBO_SETS,
  carveTimeline,
  morrisRegister,
  pickSpread,
  stickMarks,
  fitEdge,
};
