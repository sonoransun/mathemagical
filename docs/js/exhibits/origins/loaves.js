// I — The Scribe’s Loaves
// Egyptian unit fractions as a technology of fairness: cut real loaves with
// real knives, serve identical plates, out-choose a greedy apprentice, read
// the papyrus’s whole 2/n table against him, and walk off the papyrus into a
// problem that is still open (Erdős–Straus, 1948–).
//
// Sources checked at build time (September 2026):
//   T. E. Peet, The Rhind Mathematical Papyrus (1923): colophon (year 33 of
//     Apophis, copied from a writing of Amenemhat III’s reign), length c. 543 cm,
//     black and red inks, the recto of BM 10058 given to 2 ÷ the odd numbers
//     3…101, Problems 1–6 and 65, the r-sign “reduced in hieratic to a dot”,
//     the very rare 3/4, the Akhmim papyrus (6th–9th c. CE, 50 problems).
//   A. B. Chace, The Rhind Mathematical Papyrus I (1927), the opening line.
//   UCL Digital Egypt, UC 32159: Lahun 2/n table for n = 3…21, entries “exactly
//     the same as in the Rhind papyrus”.
//   Museo Egizio Cat. 1880 (Strike Papyrus): year 29 of Ramesses III, “we are
//     hungry!”, scribe Amennakht.
//   J. Ritter, “Horus-eye fractions” (2013): Möller 1911; third-millennium
//     cursive signs with no pictographic equivalents; Osing 1998.
//   erdosproblems.com/242 (edited 7 May 2026, still “open” on 23 Sep 2026):
//     verified to 10^18 (Mihnea & Bogdan, arXiv:2509.00128); Mordell’s six
//     classes mod 840. erdosproblems.com/tags/unit fractions: 49 problems, 29
//     solved; #283 “PROVED (LEAN)”, GPT-5.5 Pro prompted by Liam Price.
//   Bloom, JEMS 27 (2025) 4563–4589; Kawamura, STOC 2024
//     (doi:10.1145/3618260.3649757) and PNAS (2026); Quanta, 9 March 2022
//     (Pomerance, “It might be the oldest problem ever”); Gasarch et al.,
//     Mathematical Muffin Morsels (World Scientific, 2020), Alan Frank’s problem.
//   Moscow papyrus: 25 problems, 10 of them pefsu (Wikipedia → Clagett 1999).
//   UCL Digital Egypt, “The Lahun Papyri”: the Petrie Museum’s Lahun papyri (UC 32159
//     among them) date to the late 12th and early 13th Dynasties; the temple papers
//     in Berlin and Cairo to Senusret III and Amenemhat III.
//   Brooklyn Museum 37.1784Ea-b: small Rhind fragments (Edwin Smith, NY Hist. Soc.).
//   Acerbi, Byzantion 92 (2022): Rhabdas in the imperial fiscal administration.
//   Gardiner A2 (man with hand to mouth): determinative of wnm “eat”, swr
//     “drink”, ḥqr “be hungry” (Gardiner, Egyptian Grammar, p. 442).
// The Eye-of-Horus grain-fraction story appears only inside the legend panel.

import { Frac, TAU, clamp } from '../../core/math.js';

/* ==================== pure logic (node-testable, no DOM) ==================== */

const unit = (d) => new Frac(1n, BigInt(d));
const gcdN = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

// Fibonacci–Sylvester greedy expansion of p/q: at every step bite off the
// largest unit fraction not exceeding the remainder. Returns the unit
// denominators as BigInts — distinct and strictly increasing by construction.
// (Listed by Fibonacci in the Liber Abaci, 1202, as a last resort; rediscovered
// by Sylvester, 1880. The scribes of the Rhind papyrus routinely beat it.)
export function greedyExpand(p, q, maxTerms = 24) {
  let r = new Frac(BigInt(p), BigInt(q));
  const dens = [];
  while (!r.isZero() && r.n > 0n && dens.length < maxTerms) {
    const d = (r.d + r.n - 1n) / r.n;        // ceil(q/p), exactly
    dens.push(d);
    r = r.sub(unit(d));
  }
  return dens;
}

// The fairness meter. deal = { loaves, workers, plates } where plates[j]
// lists worker j's pieces as denominators (d meaning a piece of 1/d loaf).
//   fair    = all bread served AND every plate holds the identical multiset;
//   scribal = fair AND no plate repeats a size (Ahmes never writes 1/d twice).
// All arithmetic exact (core Frac) — no floats anywhere in the logic.
export function checkFairness(deal) {
  const { loaves, workers } = deal;
  const plates = deal.plates || [];
  if (!Array.isArray(plates) || plates.length !== workers) {
    return { fair: false, scribal: false, allServed: false, identical: false,
             distinct: false, served: new Frac(0n, 1n), share: null };
  }
  let served = new Frac(0n, 1n);
  for (const plate of plates) for (const d of plate) served = served.add(unit(d));
  const allServed = served.eq(Frac.of(loaves));
  const keys = plates.map((pl) => pl.map(Number).slice().sort((a, b) => a - b).join('+'));
  const identical = keys.every((k) => k === keys[0]);
  const distinct = plates.every((pl) => new Set(pl.map(Number)).size === pl.length);
  const fair = allServed && identical;
  return {
    fair, scribal: fair && distinct, allServed, identical, distinct, served,
    share: fair ? Frac.of(loaves, workers) : null,
  };
}

// Exact check that Σ 1/d over `dens` equals p/q, all denominators distinct.
export function verifyExpansion(p, q, dens) {
  let s = new Frac(0n, 1n);
  const seen = new Set();
  for (const d of dens) {
    const D = BigInt(d);
    if (D <= 0n || seen.has(D.toString())) return false;
    seen.add(D.toString());
    s = s.add(new Frac(1n, D));
  }
  return s.eq(new Frac(BigInt(p), BigInt(q)));
}

// The complete 2/n table of the Rhind Mathematical Papyrus (recto of BM 10058),
// as the scribe Ahmes copied it (c. 1550 BCE). Keys are the odd n; values the
// unit denominators. Transcribed from the standard published table and
// re-verified exactly (selfCheckTable): every entry sums to 2/n. The Lahun
// fragment UC 32159, two and a half centuries older, has the same entries
// for n = 3…21.
export const AHMES_TABLE = {
  3: [2, 6],
  5: [3, 15],
  7: [4, 28],
  9: [6, 18],
  11: [6, 66],
  13: [8, 52, 104],
  15: [10, 30],
  17: [12, 51, 68],
  19: [12, 76, 114],
  21: [14, 42],
  23: [12, 276],
  25: [15, 75],
  27: [18, 54],
  29: [24, 58, 174, 232],
  31: [20, 124, 155],
  33: [22, 66],
  35: [30, 42],
  37: [24, 111, 296],
  39: [26, 78],
  41: [24, 246, 328],
  43: [42, 86, 129, 301],
  45: [30, 90],
  47: [30, 141, 470],
  49: [28, 196],
  51: [34, 102],
  53: [30, 318, 795],
  55: [30, 330],
  57: [38, 114],
  59: [36, 236, 531],
  61: [40, 244, 488, 610],
  63: [42, 126],
  65: [39, 195],
  67: [40, 335, 536],
  69: [46, 138],
  71: [40, 568, 710],
  73: [60, 219, 292, 365],
  75: [50, 150],
  77: [44, 308],
  79: [60, 237, 316, 790],
  81: [54, 162],
  83: [60, 332, 415, 498],
  85: [51, 255],
  87: [58, 174],
  89: [60, 356, 534, 890],
  91: [70, 130],
  93: [62, 186],
  95: [60, 380, 570],
  97: [56, 679, 776],
  99: [66, 198],
  101: [101, 202, 303, 606],
};

// Every table entry must sum to 2/n exactly, with distinct denominators.
export function selfCheckTable() {
  return Object.entries(AHMES_TABLE).every(([n, dens]) => verifyExpansion(2, n, dens));
}

// The papyrus against the greedy knife, row by row. Pure numbers.
//   same: rows where the two agree; papyrus: rows where the papyrus keeps the
//   thicker thinnest piece; greedy: rows where greedy does.
export function tableStats() {
  const rows = [];
  const same = [], papyrus = [], greedy = [];
  for (const [ns, a] of Object.entries(AHMES_TABLE)) {
    const n = Number(ns);
    const g = greedyExpand(2, n).map(Number);
    const aMax = a[a.length - 1], gMax = g[g.length - 1];
    const isSame = a.length === g.length && a.every((d, i) => d === g[i]);
    rows.push({ n, a, g, aMax, gMax, same: isSame });
    if (isSame) same.push(n);
    else if (aMax < gMax) papyrus.push(n);
    else greedy.push(n);
  }
  rows.sort((x, y) => x.n - y.n);
  const finest = Math.max(...rows.map((r) => r.aMax));
  const greedyFinest = Math.max(...rows.map((r) => r.gMax));
  return { rows, same, papyrus, greedy, finest, greedyFinest };
}

// How the visitor's scribal deal compares with the apprentice's greedy one.
// A deal wins on the thinnest piece (a smaller largest denominator), or, with
// the same thinnest piece, on fewer kinds of piece.
export function raceOutcome(dens, greedy) {
  const v = dens.map(Number), g = greedy.map(Number);
  if (v.length === g.length && v.every((d, i) => d === g[i])) return 'same';
  const vMax = v[v.length - 1], gMax = g[g.length - 1];
  if (vMax < gMax) return 'thicker';
  if (vMax === gMax && v.length < g.length) return 'fewer';
  if (vMax === gMax && v.length === g.length) return 'tie';
  if (vMax === gMax) return 'more';            // same thinnest piece, but more kinds than his
  return 'leaner';
}

// The best deal the knives allow: distinct unit fractions summing to L/W whose
// denominators are 7-smooth (every piece a ½…⅐ knife can make is 1/d with d
// 7-smooth), minimising the thinnest piece. Used to certify the banners’
// claims (2 ÷ 5 cannot beat 1/15; 2 ÷ 7 reaches 1/21; 2 ÷ 9 reaches 1/18).
const smooth7 = (d) => { for (const p of [2, 3, 5, 7]) while (d % p === 0) d /= p; return d === 1; };
export function bestKnifeDeal(L, W, maxTerms = 20, maxDen = 1000) {
  const g0 = gcdN(L, W); L /= g0; W /= g0;
  const fill = (n, d, lo, M, left) => {
    if (n === 0) return [];
    if (left === 0) return null;
    for (let c = Math.max(lo, Math.ceil(d / n)); c < M && c * n <= left * d; c++) {
      if (!smooth7(c)) continue;
      let nn = n * c - d, dd = d * c;
      const g = gcdN(nn, dd) || 1; nn /= g; dd /= g;
      const r = fill(nn, dd, c + 1, M, left - 1);
      if (r) return [c, ...r];
    }
    return null;
  };
  for (let M = 2; M <= maxDen; M++) {
    if (!smooth7(M)) continue;
    let n = L * M - W, d = W * M;
    if (n < 0) continue;
    if (n === 0) return [M];
    const g = gcdN(n, d); n /= g; d /= g;
    const r = fill(n, d, 1, M, maxTerms - 1);
    if (r) return [...r, M];
  }
  return null;
}

// Erdős–Straus (1948): does 4/n = 1/x + 1/y + 1/z always have a solution in
// positive integers? Exact bounded search for the first few solutions with
// x ≤ y ≤ z (or x < y < z with distinct = true, the standard statement for
// n > 2). BigInt throughout; returns arrays [x, y, z] of BigInts.
export function erdosStraus(n, maxSolutions = 3, distinct = false) {
  const N = BigInt(n);
  if (N < 2n) return [];
  const out = [];
  const xLo = N / 4n + 1n;                    // need 1/x < 4/n
  const xHi = (3n * N) / 4n;                  // need 1/x ≥ (4/n)/3
  for (let x = xLo; x <= xHi && out.length < maxSolutions; x++) {
    // remainder r = 4/n − 1/x = (4x − n) / (nx), reduced
    let p = 4n * x - N, q = N * x;
    let a = p < 0n ? -p : p, b = q;
    while (b) [a, b] = [b, a % b];
    p /= a; q /= a;
    if (p <= 0n) continue;
    let y = (q + p - 1n) / p;                 // y ≥ ceil(q/p) so 1/y ≤ r
    if (y < x) y = x;
    if (distinct && y <= x) y = x + 1n;
    const yHi = (2n * q) / p;                 // need r − 1/y ≤ 1/y for z ≥ y
    for (; y <= yHi && out.length < maxSolutions; y++) {
      const num = p * y - q;                  // r − 1/y = num / (q·y)
      if (num <= 0n) continue;
      const den = q * y;
      if (den % num === 0n) {
        const z = den / num;
        if (distinct ? z > y : z >= y) out.push([x, y, z]);
      }
    }
  }
  return out;
}

// Every solution of 4/n = 1/x + 1/y + 1/z with x < y < z, n = 3…5000, in plain
// Numbers (exact: q² < 2^53 in this range). For each x the remainder
// p/q = 1/y + 1/z factors as (py − q)(pz − q) = q², so the solutions are the
// divisors a < q of q² with a ≡ −q (mod p). Returns
//   first   — the one a search taking the largest parts first meets first
//             (smallest x, then smallest y), as the greedy apprentice would;
//   leanest — the solution whose thinnest part 1/z is thickest;
//   count   — how many solutions there are in all.
const ES_LIMIT = 5000;   // esSolve’s exact range (q² < 2^53); the explorer’s stepper reaches it
function factorInto(map, m, k) {
  for (let p = 2; p * p <= m; p++) {
    while (m % p === 0) { map.set(p, (map.get(p) || 0) + k); m /= p; }
  }
  if (m > 1) map.set(m, (map.get(m) || 0) + k);
}
export function esSolve(n) {
  if (!Number.isInteger(n) || n < 3 || n > ES_LIMIT) return { first: null, leanest: null, count: 0 };
  let first = null, leanest = null, count = 0;
  const xLo = Math.floor(n / 4) + 1, xHi = Math.ceil((3 * n) / 4) - 1;
  for (let x = xLo; x <= xHi; x++) {
    let p = 4 * x - n, q = n * x;
    const g = gcdN(p, q); p /= g; q /= g;
    const f = new Map();
    factorInto(f, n, 2); factorInto(f, x, 2);
    const fg = new Map(); factorInto(fg, g, 2);
    for (const [pr, e] of fg) f.set(pr, f.get(pr) - e);
    let divs = [1];
    for (const [pr, e] of f) {
      if (!e) continue;
      const nd = [];
      for (const d of divs) { let v = d; for (let k = 0; k <= e && v < q; k++) { nd.push(v); v *= pr; } }
      divs = nd;
    }
    let byY = null, byZ = null;
    for (const a of divs) {
      if (a >= q || (a + q) % p) continue;
      const y = (a + q) / p;
      if (y <= x) continue;
      const b = (q * q) / a;
      if ((b + q) % p) continue;
      const z = (b + q) / p;
      if (z <= y) continue;
      count++;
      if (!byY || y < byY[1]) byY = [x, y, z];
      if (!byZ || z < byZ[2]) byZ = [x, y, z];
    }
    if (byY && !first) first = byY;
    if (byZ && (!leanest || byZ[2] < leanest[2])) leanest = byZ;
  }
  return { first, leanest, count };
}

// Mordell: any counterexample must lie in one of six classes mod 840; the
// smallest prime in each class (1009 ≡ 169, 1129 ≡ 289, 1201 ≡ 361,
// 1801 ≡ 121, 2521 ≡ 1, 3049 ≡ 529).
export const MORDELL_CLASSES = [1, 121, 169, 289, 361, 529];
export const MORDELL_PRIMES = [1009, 1129, 1201, 1801, 2521, 3049];
const isPrimeN = (n) => { if (n < 2) return false; for (let p = 2; p * p <= n; p++) if (n % p === 0) return false; return true; };

// The apprentice's working, one papyrus line at a time (pure strings).
// Key figures are set in red, as the Rhind scribe set his.
export function greedyNarrative(p, q) {
  const steps = [];
  let r = new Frac(BigInt(p), BigInt(q));
  steps.push(`Asked for <b>${p} ÷ ${q}</b>, the apprentice measures the share: ${r} of a loaf each.`);
  while (!r.isZero() && r.n > 0n) {
    if (r.n === 1n) {
      steps.push(`${r} is itself a single unit part. He cuts <span class="rub">1/${r.d}</span> for each worker, serves it, and bows.`);
      break;
    }
    const d = (r.d + r.n - 1n) / r.n;
    const rest = r.sub(unit(d));
    steps.push(`The largest unit part not above ${r} is <span class="rub">1/${d}</span>. He serves one to each worker. Still owed: ${rest}.`);
    r = rest;
  }
  const dens = greedyExpand(p, q);
  steps.push(`<span class="rub">His deal:</span> <b>${dens.map((d) => '1/' + d).join(' + ')}</b>, ${dens.length} kind${dens.length === 1 ? '' : 's'} of piece, the thinnest 1/${dens[dens.length - 1]}.`);
  return steps;
}

const densSum = (dens) => dens.map((d) => '1/' + d).join(' + ');
// Keep a sum like 1/8 + 1/52 + 1/104 on one line of the essay's text.
const nbCode = (html) => html.replace(/<code>([^<]*)<\/code>/g, (_, c) => `<code>${c.replace(/ /g, '\u00a0')}</code>`);
const fmtInt = (v) => Number(v).toLocaleString('en-US');

// Stage geometry (CSS px) for a canvas W wide, L loaves, K workers. Pure, so
// the layout can be checked under node: loaves never overlap, workers wrap to
// a second row before they get too small to tap, nothing leaves the canvas.
export function stageLayout(W, L, K, opts = {}) {
  const W0 = Math.max(160, W || 0);
  const pad = W0 < 480 ? 10 : 16;
  const ghosts = !!opts.ghosts && W0 >= 600;
  const ghostW = ghosts ? Math.min(250, W0 * 0.3) : 0;
  const left = pad, right = W0 - pad - (ghosts ? ghostW + 14 : 0);
  const regionW = right - left;
  const R = clamp(Math.min(62, (regionW - 24) / (2.3 * L)), 16, 62);
  const loafDx = L > 1 ? Math.max(2 * R + 4, Math.min(2.55 * R + 12, (regionW - 16 - 2 * R) / (L - 1))) : 0;
  const bandTop = 8;
  const labelH = W0 < 480 ? 24 : 30;
  const loafY = bandTop + labelH + R + 4;
  const bandB = loafY + R + 16;
  const cx = (left + right) / 2;
  const loaves = [];
  for (let i = 0; i < L; i++) loaves.push({ x: cx + (i - (L - 1) / 2) * loafDx, y: loafY, r: R });

  const minWs = 58;
  const perRowMax = Math.max(1, Math.floor((W0 - 2 * pad) / minWs));
  const rows = K <= perRowMax ? 1 : 2;
  const perRow = Math.ceil(K / rows);
  const ws = Math.min(128, (W0 - 2 * pad) / perRow);
  const plateRx = clamp(Math.min(ws * 0.4, ws / 2 - 9), 14, 50);   // leave air between neighbouring gauges
  const plateRy = plateRx * 0.3;
  const pieceR = clamp(plateRx * 0.8, 11, 40);
  const figS = ws >= 100 ? 1.2 : (ws < 70 ? 0.9 : 1);    // the seated figure's scale (1 ≈ 36 px tall)
  const figH = Math.max(62, Math.round(26 + 36 * figS));
  const rowH = pieceR + figH + 52;
  const plateY0 = bandB + 18 + figH + pieceR;
  const workers = [];
  for (let j = 0; j < K; j++) {
    const row = rows === 1 ? 0 : (j < perRow ? 0 : 1);
    const inRow = row === 0 ? Math.min(K, perRow) : K - perRow;
    const idx = row === 0 ? j : j - perRow;
    workers.push({ x: W0 / 2 + (idx - (inRow - 1) / 2) * ws, plateY: plateY0 + row * rowH, row });
  }
  const lastPlateY = plateY0 + (rows - 1) * rowH;
  const H = Math.round(lastPlateY + plateRy + 34);
  const ghostSlots = [];
  if (ghosts) {
    const gw = ghostW / 2;
    for (let k = 0; k < 2; k++) ghostSlots.push({ x: right + 14 + gw * (k + 0.5), y: loafY + 10, r: clamp(gw * 0.34, 16, 36) });
  }
  return { W: W0, H, pad, R, loafDx, bandTop, labelH, loafY, bandB, loaves, rows, perRow, ws, plateRx, plateRy,
           pieceR, figS, figH, workers, ghosts, ghostSlots, regionLeft: left, regionRight: right };
}

// Egyptian hieroglyphic numerals as inline SVG, with the mouth-sign r (“part”)
// set over the number to make it a unit fraction. Strokes (1), hobbles (10),
// coils of rope (100) and a lotus (1000), grouped in rows as on the monuments.
// Pure string output; stroke uses currentColor so it takes the text colour.
const EG_ROWS_NARROW = { 1: [1], 2: [2], 3: [3], 4: [4], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3] };
const EG_ROWS_WIDE = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3] };
const r2 = (v) => Math.round(v * 100) / 100;
// One sign of power p (0 stroke, 1 hobble, 2 coil of rope, 3 lotus) in a box whose
// top-left is (x, y) and height h (a full sign is 18 units tall). Strokes keep a
// fixed pitch however short they get, so a stack of them never runs together.
function egGlyph(p, x, y, h) {
  const s = h / 18;
  switch (p) {
    case 0: return { w: 3.6, d: `M${r2(x + 1.8)} ${r2(y + Math.min(1.2, h * 0.08))}V${r2(y + h)}` };
    case 1: {
      const w = Math.max(6.4, 10 * s), rr = (w - 2) / 2;
      return { w, d: `M${r2(x + 1)} ${r2(y + h)}V${r2(y + rr + 0.8)}A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w - 1)} ${r2(y + rr + 0.8)}V${r2(y + h)}` };
    }
    case 2: {
      const cx = x + 5.5 * s, cy = y + 11.5 * s;
      let d = '';
      for (let k = 0; k <= 30; k++) {
        const a = (k / 30) * 3.3 * Math.PI, rr = (0.5 + a * 0.44) * s;
        d += (k ? 'L' : 'M') + r2(cx + Math.cos(a) * rr) + ' ' + r2(cy + Math.sin(a) * rr);
      }
      d += `L${r2(cx + 1.8 * s)} ${r2(y + 1.5 * s)}`;
      return { w: 11 * s, d };
    }
    default: {
      const d = `M${r2(x + 5 * s)} ${r2(y + 18 * s)}V${r2(y + 8 * s)}` +
        `M${r2(x + 5 * s)} ${r2(y + 8 * s)}Q${r2(x)} ${r2(y + 6 * s)} ${r2(x + 2 * s)} ${r2(y + 1.5 * s)}` +
        `M${r2(x + 5 * s)} ${r2(y + 8 * s)}Q${r2(x + 10 * s)} ${r2(y + 6 * s)} ${r2(x + 8 * s)} ${r2(y + 1.5 * s)}` +
        `M${r2(x + 5 * s)} ${r2(y + 14 * s)}Q${r2(x + 9 * s)} ${r2(y + 13 * s)} ${r2(x + 10 * s)} ${r2(y + 10 * s)}`;
      return { w: 10 * s, d };
    }
  }
}
export function egyptianNumeralSVG(n, opts = {}) {
  n = Math.floor(Number(n));
  if (!(n >= 1 && n <= 9999)) return '';
  const fraction = opts.fraction !== false;
  const px = opts.height || 22;
  const digits = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
  let x = 0, d = '', firstW = 0;
  const GAP = 2.4, ROWGAP = 2;
  digits.forEach((c, i) => {
    if (!c) return;
    const p = 3 - i;
    const rows = (p === 0 ? EG_ROWS_NARROW : EG_ROWS_WIDE)[c];
    const h = (18 - (rows.length - 1) * ROWGAP) / rows.length;
    const unitW = egGlyph(p, 0, 0, h).w;
    const groupW = Math.max(...rows) * unitW;
    rows.forEach((cnt, ri) => {
      const rowY = ri * (h + ROWGAP);
      const x0 = x + (groupW - cnt * unitW) / 2;
      for (let k = 0; k < cnt; k++) d += egGlyph(p, x0 + k * unitW, rowY, h).d;
    });
    if (!firstW) firstW = groupW;
    x += groupW + GAP;
  });
  const numW = Math.max(4, x - GAP);
  let mouth = '';
  if (fraction) {
    // over a short number the mouth spans it; over a long one it sits on the
    // beginning of the number, as the scribes placed it
    const over = numW <= 18 ? numW : Math.max(firstW, 10);
    const mw = clamp(over * 0.95, 9, 16), m0 = Math.max(0, (over - mw) / 2);
    mouth = `<path d="M${r2(m0)} -3.6Q${r2(m0 + mw / 2)} -8.6 ${r2(m0 + mw)} -3.6Q${r2(m0 + mw / 2)} 1.2 ${r2(m0)} -3.6Z" fill="currentColor" stroke="none"/>`;
  }
  const top = fraction ? -8.2 : -1, vh = 19.6 - top;
  const w = r2((numW + 1.6) / vh * px);
  return `<svg class="eg-svg" xmlns="http://www.w3.org/2000/svg" viewBox="-0.8 ${top} ${r2(numW + 1.6)} ${r2(vh)}" ` +
    `width="${w}" height="${px}" aria-hidden="true" focusable="false">${mouth}` +
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// One call that exercises everything above; tests.html runs it in the browser.
export function selfTest() {
  const ok = (c, m) => { if (!c) throw new Error('loaves selfTest: ' + m); };
  ok(selfCheckTable(), 'a 2/n entry does not sum to 2/n');
  ok(Object.keys(AHMES_TABLE).length === 50, 'the table should have fifty rows');
  const st = tableStats();
  ok(st.same.join() === '3,5,7,11,23', 'rows where the papyrus equals greedy');
  ok(st.papyrus.length === 44 && st.greedy.join() === '13', 'papyrus 44, greedy only at 2/13');
  ok(st.finest === 890 && st.greedyFinest === 5151, 'finest parts 1/890 and 1/5151');
  ok(greedyExpand(2, 9).map(Number).join() === '5,45', 'greedy 2/9');
  ok(checkFairness({ loaves: 3, workers: 4, plates: [[2, 4], [4, 2], [2, 4], [2, 4]] }).scribal, '3 ÷ 4 scribal');
  ok(!checkFairness({ loaves: 3, workers: 4, plates: [[4, 4, 4], [4, 4, 4], [4, 4, 4], []] }).fair, 'unequal plates');
  ok(bestKnifeDeal(2, 5).join() === '3,15', '2 ÷ 5 cannot beat 1/15');
  ok(bestKnifeDeal(2, 7).join() === '6,14,21', '2 ÷ 7 reaches 1/21');
  ok(bestKnifeDeal(2, 9).join() === '6,18', '2 ÷ 9 reaches 1/18');
  ok(raceOutcome([6, 14, 21], [4, 28]) === 'thicker' && raceOutcome([3, 15], [3, 15]) === 'same', 'race outcomes');
  ok(raceOutcome([2, 5, 20], [2, 4, 20]) === 'tie' && raceOutcome([2, 30], [2, 4, 20]) === 'leaner', 'race tie/leaner');
  ok(raceOutcome([3, 4, 5, 20], [2, 4, 20]) === 'more', 'race: same thinnest, more kinds');
  const e = esSolve(1009);
  ok(e.first.join() === '253,85096,1974822872' && e.leanest.join() === '260,10090,52468', '4/1009');
  for (const n of [3, 4, 5, 7, 121, 1009, 3049]) {
    for (const s of [esSolve(n).first, esSolve(n).leanest]) {
      const [x, y, z] = s.map(BigInt);
      ok(x < y && y < z && 4n * x * y * z === BigInt(n) * (y * z + x * z + x * y), `4/${n} = 1/x + 1/y + 1/z`);
    }
  }
  ok(MORDELL_PRIMES.every((p, i) => isPrimeN(p) && MORDELL_CLASSES.includes(p % 840)) && new Set(MORDELL_PRIMES.map((p) => p % 840)).size === 6, 'Mordell primes');
  for (const [W, L, K] of [[330, 4, 9], [330, 3, 4], [1000, 3, 4], [620, 2, 7]]) {
    const g = stageLayout(W, L, K);
    for (let i = 1; i < L; i++) ok(g.loaves[i].x - g.loaves[i - 1].x >= 2 * g.R, `loaves overlap at ${W}px`);
    ok(g.loaves[0].x - g.R >= 0 && g.loaves[L - 1].x + g.R <= W, `loaves leave the canvas at ${W}px`);
    ok(g.ws >= 56, `workers too narrow at ${W}px`);
  }
  for (const [W, L, K] of [[1000, 4, 9], [640, 3, 7], [1280, 2, 5]]) {
    const g = stageLayout(W, L, K, { ghosts: true });
    ok(g.loaves[0].x - g.R >= g.regionLeft - 0.5 && g.loaves[L - 1].x + g.R <= g.regionRight + 0.5, `loaves reach the ghost plates at ${W}px`);
  }
  for (const [W, L, K] of [[330, 4, 9], [390, 2, 9], [520, 3, 9], [1000, 3, 4], [620, 2, 7], [1000, 1, 2]]) {
    const g = stageLayout(W, L, K);
    for (const w of g.workers) {
      const top = w.plateY - 1.35 * g.pieceR - 9 - 36 * g.figS;       // head of the seated figure
      ok(top >= g.bandB + 18, `a figure rises into the table band at ${W}px`);
      if (w.row === 1) ok(top >= g.workers[0].plateY + g.plateRy + 24, `the second row crowds the first at ${W}px`);
    }
    ok(g.H >= g.workers[K - 1].plateY + g.plateRy + 24, `the plate labels leave the canvas at ${W}px`);
  }
  ok(egyptianNumeralSVG(4).startsWith('<svg') && egyptianNumeralSVG(890).includes('path'), 'hieroglyphic numerals');
  return true;
}

/* ================================ exhibit ================================ */

const KNIVES = [2, 3, 4, 5, 6, 7];
const KNIFE_GLYPHS = { 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 6: '⅙', 7: '⅐' };
const MAX_PIECES = 150;
const MAX_DEN = 1000;
const MONO_FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FAINT = '#8a8676';     // the page's --ink-faint: legible as small text on the dark ground

const CHALLENGES = {
  5: (g) => `At <b>2 ÷ 5</b> the papyrus and the apprentice agree: ${densSum(g)}. With these knives no deal ` +
            `keeps a thicker thinnest piece. Tie him if you can.`,
  7: (g) => `At <b>2 ÷ 7</b> the papyrus agrees with him too (${densSum(g)}), but a third kind of piece buys a ` +
            `thicker thinnest slice. Find it, and you out-scribe them both.`,
  9: (g) => `Beat the apprentice at <b>2 ÷ 9</b>: his greedy rule leaves a thinnest piece of 1/${g[g.length - 1]}. ` +
            `The papyrus does better. Can you?`,
};

export default {
  id: 'loaves',
  movement: 1,
  title: 'The Scribe’s Loaves',
  hook: 'Divide three loaves among four workers so that no one can complain.',
  era: 'c. 1800 BCE – 2026 · Lahun, Thebes, Akhmim, Pisa',
  chronicle: [
    { year: -1800, date: 'c. 1800 BCE', text: 'At Lahun, the town beside the pyramid of Senusret II, a scribe writes out 2 divided by the odd numbers as sums of unit fractions; the surviving fragment, from 2/3 to 2/21, matches the later Rhind papyrus entry for entry.' },
    { year: -1550, date: 'c. 1550 BCE', text: 'In year 33 of the Hyksos king Apophis, the scribe Ahmes copies the <em>Rhind Mathematical Papyrus</em> from a writing of Amenemhat III’s reign: a table of 2 divided by every odd number from 3 to 101, then loaves shared among ten men.' },
    { year: -1158, date: 'c. 1158 BCE', text: 'In year 29 of Ramesses III, their grain rations unpaid, the tomb-builders of Deir el-Medina walk past the control post shouting “We are hungry!”; the scribe Amennakht records the strike on a papyrus now in Turin.' },
    { year: 700, date: '6th–9th c. CE', text: 'A Greek papyrus book found in the cemeteries of Akhmim, in Upper Egypt, still writes every fraction as unit parts (and 2/3), in tables and in fifty problems that include sharing earnings among workmen.' },
    { year: 1202, date: '1202', text: 'In Pisa, Fibonacci’s <em>Liber Abaci</em> teaches unit fractions to Latin Europe, listing the greedy method among its techniques as a last resort.' },
    { year: 1858, date: '1858', text: 'Alexander Henry Rhind buys the papyrus in Luxor; it was said to have been found in a small building near the Ramesseum.' },
    { year: 1948, date: '1948', text: 'Paul Erdős and Ernst Straus ask whether every 4/n splits into just three unit fractions; though computers have checked every n up to 10¹⁸, it remains unproved.' },
    { year: 2021, date: 'December 2021', text: 'Thomas Bloom proves a conjecture of Erdős and Graham: any set of whole numbers with positive upper density contains finitely many whose reciprocals add up to exactly 1.' },
  ],
  today: nbCode(`
    <p>The scribe’s question is live research. In December 2021 Thomas Bloom proved a conjecture of
    Erdős and Graham: any set of whole numbers that takes up a positive share of the integers,
    however small, contains finitely many whose reciprocals add up to exactly 1. “It might be the
    oldest problem ever,” Carl Pomerance told <em>Quanta</em>. With Bhavik Mehta, Bloom then had
    the Lean proof assistant check every step of the proof. His online database of Erdős’s problems
    lists some fifty about unit fractions, about twenty of them still open. One it now marks as
    proved, #283, fell to an argument that the language model GPT-5.5 Pro gave when Liam Price
    prompted it, and that proof, too, has been verified in Lean.</p>
    <p>The apprentice’s contest has modern cousins. Alan Frank asked how to share five muffins among
    three students so that nobody is left with a tiny sliver. The best possible smallest piece is
    5/12, and the question for any number of muffins and students has grown into a book,
    <em>Mathematical Muffin Morsels: Nobody Wants a Small Piece</em>. Unit fractions also measure
    load. A chore that must recur at least once every <i>a</i> days takes 1/<i>a</i> of the calendar,
    and in 2024 Akitoshi Kawamura proved a conjecture of 1993: any set of such chores whose loads add
    up to at most 5/6 can be scheduled. The threshold is itself a scribe’s sum,
    <code>1/2 + 1/3</code>, because chores due every second day and every third day leave no free
    day for anything else.</p>
    <p>The scribe’s one <i>n</i>-th is a reciprocal, and reciprocals still do the dividing. To divide
    by <i>b</i> modulo a prime, a computer multiplies by the one number that, times <i>b</i>, leaves
    remainder 1, and Euclid’s algorithm, run backwards, finds it. On the small curve of
    <a href="#ex-handshake">The Handshake</a>, every chord’s slope is such a division. The question
    closest to the papyrus stays open. In 2025 Spiridon Mihnea and Dumitru C. Bogdan extended the
    check of Erdős and Straus’s <code>4/n</code> to every n up to 10<sup>18</sup>, and nobody has a
    proof.</p>`),
  sources: [
    { text: 'T. Eric Peet, <em>The Rhind Mathematical Papyrus, British Museum 10057 and 10058</em> (1923)', url: 'https://archive.org/details/Peet_1923' },
    { text: 'Arnold Buffum Chace, <em>The Rhind Mathematical Papyrus</em>, vol. I: Free Translation and Commentary (1927), Wikisource', url: 'https://en.wikisource.org/wiki/Page:The_Rhind_Mathematical_Papyrus,_Volume_I.pdf/65' },
    { text: 'Annette Imhausen, <em>Mathematics in Ancient Egypt: A Contextual History</em> (Princeton University Press, 2016)', url: 'https://press.princeton.edu/books/hardcover/9780691117133/mathematics-in-ancient-egypt' },
    { text: 'Annette Imhausen, “Ancient Egyptian mathematics: new perspectives on old sources,” <em>The Mathematical Intelligencer</em> 28 (2006) 19–27', url: 'https://doi.org/10.1007/BF02986998' },
    { text: 'UCL Digital Egypt, “Lahun Papyri: table texts,” UC 32159 (archived copy)', url: 'https://web.archive.org/web/2016/http://www.digitalegypt.ucl.ac.uk/lahun/uc32159.html' },
    { text: 'Jim Ritter, “Horus-eye fractions,” <em>The Encyclopedia of Ancient History</em> (Wiley-Blackwell, 2013)', url: 'https://doi.org/10.1002/9781444338386.wbeah21178' },
    { text: 'Museo Egizio, Turin, Strike Papyrus, Cat. 1880', url: 'https://collezioni.museoegizio.it/en-GB/material/Cat_1880' },
    { text: 'Thomas F. Bloom and Christian Elsholtz, “Egyptian fractions,” survey (2022)', url: 'https://arxiv.org/abs/2210.04496' },
    { text: 'Thomas F. Bloom, “On a density conjecture about unit fractions,” <em>Journal of the European Mathematical Society</em> 27 (2025) 4563–4589', url: 'https://doi.org/10.4171/JEMS/1456' },
    { text: 'Thomas F. Bloom, Erdős Problem #242: the Erdős–Straus conjecture, erdosproblems.com', url: 'https://www.erdosproblems.com/242' },
  ],
  alt: 'A baker’s table laid on a reed mat, with round loaves you cut into equal sectors with knives from a half to a seventh and drag onto the plates of two to nine workers, each drawn as the hieroglyph of a seated man with his hand to his mouth; every piece is labelled in Egyptian unit-fraction notation and a gauge under each plate fills toward the fair share. Below it, a chart of the Rhind papyrus’s fifty 2/n entries against the greedy rule, and a strip of solutions to Erdős and Straus’s 4/n.',
  prose: nbCode(`
    <p>Around 1550 BCE, in the thirty-third year of the Hyksos king Apophis, a scribe named Ahmes
    finished copying a roll which, he tells us, reproduced a writing made under Amenemhat III, two
    or three centuries before. It is the fullest mathematical text to survive from pharaonic Egypt:
    more than eighty problems on a roll some five and a half metres long, written in black, with
    headings and the figures that matter picked out in red. Its two main pieces are now in the
    British Museum. It opens with a promise worthy of the subject, “Accurate reckoning. The entrance into the
    knowledge of all existing things and all obscure secrets,” as Arnold Buffum Chace translated it
    in 1927, and then, before a single problem, with a table: two divided by every odd number from 3
    to 101. Only after it, and a short table of tenths, does the bread arrive. The first six problems
    share 1, 2, 6, 7, 8 and 9 loaves among ten men.</p>
    <p>This is payroll, not philosophy. Of the twenty-five problems on the Rhind’s nearest rival, the
    papyrus now in Moscow, ten reckon the strength of bread and beer: how many loaves or jugs a
    measure of grain should yield. Egyptian workmen were paid in rations of grain, which became their
    bread and their beer, and when the grain did not come, somebody wrote it down. In year 29
    of Ramesses III, nearly four centuries after Ahmes, the tomb-builders of Deir el-Medina walked
    past the control post shouting “We are hungry!”, and the scribe Amennakht recorded the strike on
    a papyrus now in Turin. The Rhind papyrus knows, too, that fair is not always equal: its Problem 65
    shares a hundred loaves among a crew of ten in which a sailor, a foreman and a watchman draw
    double. A share that every eye could check was not a courtesy. It was how the state kept its
    builders at work.</p>
    <p>The scribes’ arithmetic obeys one strange rule: <em>no numerators</em>. Apart from 2/3, which
    had a sign of its own (a sign for 3/4 is very rare), every quantity is a whole number plus a sum
    of <em>distinct unit fractions</em>, so that three quarters is written <code>1/2 + 1/4</code>. The
    script itself says so. In hieroglyphs a fifth is the numeral five beneath the mouth-sign
    <em>r</em>, “part”; in the scribe’s quick hieratic the mouth shrinks to a dot. Even the one
    numerator allowed is spent at once: in Problem 4, seven loaves among ten men is
    <code>2/3 + 1/30</code> each. Twice a thirteenth is never written as such. Doubled, a thirteenth
    becomes <code>1/8 + 1/52 + 1/104</code>.</p>
    <p>Our reflex is to call this clumsy, so try the alternative. Cut each of three loaves into a big
    three-quarter piece and a sliver; three workers stride off with a heavy hunk each and the fourth
    is handed three slivers. The shares are equal and the fourth man is furious. Now deal every
    worker a half and a quarter: four <em>identical</em> plates, and the complaint dies before it is
    spoken. Nobody can ask Ahmes why he wrote as he did, but a knife makes the case for him. A unit
    fraction is a thing you can actually cut, and a sum of distinct ones is a deal every eye can
    audit at a glance.</p>
    <p>Egyptian multiplication worked by doubling, so the chore that came back forever was doubling a
    part, and a table spared the scribe from working the same one out twice. The obvious way to
    build such a table is the greedy one: bite off the largest unit fraction that fits, and repeat.
    Fibonacci listed it in 1202 as his method of last resort, and J. J. Sylvester rediscovered it in
    1880. The scribes had beaten it long before, and not Ahmes alone. A fragment from Lahun, the
    town beside the pyramid of Senusret II, carries the same table from 2/3 to 2/21, entry for entry,
    and the papers found there date from the late Twelfth and early Thirteenth Dynasties, the age of
    the writing Ahmes says he copied. For 2/9 greedy grabs <code>1/5</code> and leaves the sliver <code>1/45</code>; the papyrus has
    <code>1/6 + 1/18</code>. Across its fifty rows the table agrees with greedy five times and keeps a
    thicker thinnest piece forty-four times, twenty-four of them without a single extra part. It
    never cuts finer than 1/890, while greedy would carve 2/101 down to 1/5151, and only at 2/13 does
    greedy do better on paper. Scholars still argue over how the entries were chosen, but someone
    weighed alternatives and chose, and below, with the same knives, you can try to out-choose both
    the scribe and a greedy apprentice.</p>
    <p>The myth says Egyptian fractions were a dead end, abandoned for better notation. In truth they
    stayed in use for some three thousand years. A Greek papyrus book from Akhmim, written between
    the sixth and ninth centuries CE, still avoids every fraction but unit parts and 2/3 as it shares
    out workmen’s earnings; Fibonacci taught unit fractions to Latin Europe; in fourteenth-century
    Constantinople the fiscal official Nicholas Rhabdas was still writing fractions as strings of
    them. And the game never closed. In 1948 Paul Erdős and Ernst Straus asked whether
    <code>4/n</code> can always be split into just <em>three</em> unit fractions. Louis Mordell showed
    that any failure must hide in six classes of numbers modulo 840, and computers have checked every
    n up to 10<sup>18</sup>. Nobody has a proof. The scribe’s game is still being played, and it is
    not finished.</p>`),

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep default */ }
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reduce = !!(mq && mq.matches);
    const onMotion = () => { reduce = !!(mq && mq.matches); dirty = true; };
    if (mq && mq.addEventListener) mq.addEventListener('change', onMotion);

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-loaves .lv-plate { position: relative; }
      #ex-loaves .lv-plate canvas:focus { outline: none; }
      #ex-loaves .lv-plate canvas:focus-visible { box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 0 0 2px var(--gold-bright); }
      #ex-loaves .knife-lab { font-size: .78rem; font-variant-caps: all-small-caps; letter-spacing: .16em;
        color: var(--ink-dim); align-self: center; margin-right: .15rem; }
      #ex-loaves .knives { gap: .5rem .55rem; }
      #ex-loaves .knives .btn.small { min-width: 2.3rem; }
      #ex-loaves .knives .btn.knife { font-family: var(--serif); font-size: 1rem; line-height: 1; padding: .34rem .5rem; }
      #ex-loaves .knives .sep { width: 1px; align-self: stretch; background: var(--line); margin: 0 .2rem; }
      @media (max-width: 560px) { #ex-loaves .knives .sep { display: none; } }
      #ex-loaves .lv-rubric { display: flex; align-items: baseline; gap: .7rem; margin: 2.1rem 0 .2rem;
        color: var(--gold); font-size: .86rem; font-variant-caps: all-small-caps; letter-spacing: .2em; }
      #ex-loaves .lv-rubric::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--gold-dim), transparent); opacity: .6; }
      #ex-loaves .lv-rubric .num { font-family: var(--serif); color: var(--crimson-bright); letter-spacing: .08em; }
      #ex-loaves .papyrus { position: relative; border: 1px solid rgba(201,169,89,.34); border-radius: 3px;
        padding: .8rem 1.1rem; margin-top: .8rem; font-size: .95rem; color: var(--ink-dim); min-height: 2.4rem;
        background-color: rgba(201,169,89,.045);
        background-image:
          repeating-linear-gradient(0deg, rgba(201,169,89,.05) 0 1px, transparent 1px 3px),
          repeating-linear-gradient(90deg, rgba(201,169,89,.025) 0 1px, transparent 1px 7px);
        box-shadow: inset 0 0 24px rgba(0,0,0,.35); }
      #ex-loaves .papyrus b { color: var(--gold-bright); font-weight: 600; }
      #ex-loaves .papyrus .rub { color: var(--crimson-bright); }
      #ex-loaves .papyrus .pline { opacity: 0; animation: loaves-fade .5s ease forwards; margin: .3rem 0; }
      #ex-loaves .papyrus .pwait { color: var(--ink-faint); font-style: italic; }
      @keyframes loaves-fade { to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { #ex-loaves .papyrus .pline { animation: none; opacity: 1; } }
      #ex-loaves .shelf { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .7rem; min-height: 1rem; }
      #ex-loaves .shelf-empty { color: var(--ink-faint); font-style: italic; font-size: .92rem; }
      #ex-loaves .shelf-entry { display: inline-flex; align-items: center; gap: .55rem; border: 1px solid var(--line);
        background: var(--bg-panel); border-radius: 3px; padding: .32rem .65rem; font-family: var(--mono); font-size: .8rem;
        color: var(--ink-dim); cursor: default; text-align: left; }
      #ex-loaves button.shelf-entry { cursor: pointer; }
      #ex-loaves button.shelf-entry:hover { border-color: var(--gold-dim); }
      #ex-loaves .shelf-entry b { color: var(--gold); font-weight: 600; }
      #ex-loaves .shelf-entry .hg { display: inline-flex; gap: .3rem; color: var(--gold-bright); align-items: flex-end; }
      #ex-loaves .shelf-entry .gs { font-family: var(--serif); font-style: italic; font-size: .9rem; color: var(--gold-bright); align-self: center; }
      #ex-loaves .shelf-entry .as-papyrus { color: var(--crimson-bright); font-family: var(--serif); font-style: italic; font-size: .82rem; }
      #ex-loaves .eg { text-decoration: overline; color: var(--gold-bright); padding: 0 .06em; }
      #ex-loaves .eg-inline { display: inline-flex; vertical-align: -0.28em; color: var(--gold-bright); margin: 0 .1em; }
      #ex-loaves .hint-line { color: var(--ink-dim); font-style: italic; font-size: .95rem;
        margin: .6rem 0 0; border-left: 2px solid var(--gold-dim); padding-left: .8rem; }
      #ex-loaves .lv-chart { margin-top: .6rem; }
      #ex-loaves .lv-chart canvas { cursor: pointer; }
      #ex-loaves .tally-line { color: var(--ink-faint); font-size: .86rem; font-style: italic; margin: .45rem .2rem 0; text-wrap: pretty; }
      #ex-loaves .es-presets { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
      #ex-loaves .es-presets .lab { font-size: .72rem; font-variant-caps: all-small-caps; letter-spacing: .14em; color: var(--ink-dim); margin-right: .2rem; }
      #ex-loaves .es-presets .btn.active { border-color: var(--gold); color: var(--gold-bright); }
      #ex-loaves .readout .esl { display: inline-block; min-width: 7.2em; color: var(--ink-faint); }
      #ex-loaves .controls.lv-bottom { align-items: flex-end; }
      @media (max-width: 560px) {
        #ex-loaves .readout .esl { display: block; min-width: 0; font-size: .82em; letter-spacing: .04em; }
        #ex-loaves .readout .esl ~ .esl { margin-top: .3rem; }
      }
    `;
    stage.appendChild(style);

    /* ---------- state ---------- */
    const QUESTS = [
      {
        loaves: 3, workers: 4,
        banner: 'A foreman’s commission: serve <b>3 loaves to 4 workers</b>, every plate identical, ' +
                'no bread left on the table, and no plate carrying two pieces of the same size.',
        hint: 'Halve every loaf: six halves, four workers. Serve four, and two halves remain. ' +
              'A half, halved again, is a quarter.',
      },
      {
        loaves: 2, workers: 5,
        banner: 'The scribe’s own doubling: <b>2 loaves to 5 workers</b>. The papyrus does it with two kinds of piece.',
        hint: 'Cut both loaves into thirds: six thirds, five workers. One third remains on the table, ' +
              'and the fifth knife turns it into fifteenths.',
      },
      {
        loaves: 2, workers: 7,
        banner: 'Harder dough: <b>2 loaves to 7 workers</b>. Two kinds of piece still suffice.',
        hint: 'Quarters first: eight of them, seven workers. Meet the leftover quarter with the seventh knife.',
      },
    ];

    let phase = 'quest';          // 'quest' | 'challenge'
    let qi = 0;                   // quest index
    let deal = { loaves: 3, workers: 4 };
    let greedyDens = [];          // apprentice's expansion for the current deal (Numbers)
    let pieces = [];              // { id, den, loaf, at:'table'|'plate', worker, x,y,r,a0,a1, tx,ty,tr,ta0,ta1 }
                                  // array order IS table order: cuts splice children in place
    let nextId = 1;
    let undoStack = [];
    let celebrated = false;
    let fairChimed = false;
    let hetepSaid = false;
    let lastChk = null;
    let plateInfo = [];           // per worker: { text, ratio, full, over }
    let hoverId = 0;
    let pending = null;           // { id, x0, y0 } — maybe click (cut), maybe drag
    let dragId = 0;
    let dragOver = -1;            // worker index under the dragged piece
    let pointer = [0, 0];
    let pointerIn = false;
    let note = null;              // { text, until }
    let pulses = [];              // celebration rings { x, y, start }
    let cutFx = null;             // { x, y, r, angles, t0, crumbs }
    let hetepAt = -1;             // time the ḥtp sign began to appear
    let appr = null;              // apprentice animation { steps, shown, nextAt, dens }
    let papyrusGhost = null;      // the papyrus's entry, revealed after a scribal deal
    let lastT = 0;
    let knife = 2;
    let everServed = false;
    let focusId = 0;              // keyboard-focused piece
    let kbActive = false;
    let hasFocus = false;
    let dirty = true;             // something changed: draw a frame
    let layoutDirty = true;       // piece targets need re-packing
    const solvedKeys = new Set();
    const shelfDeals = [];
    let geo = stageLayout(600, 3, 4);

    const bus = audio.createBus('loaves');
    const now = () => bus.context.currentTime;

    /* ---------- DOM ---------- */
    const quest = ui.questBanner(stage, QUESTS[0].banner);
    const plateWrap = document.createElement('div');
    plateWrap.className = 'lv-plate';
    stage.appendChild(plateWrap);
    const heightFor = (w) => stageLayout(w, deal.loaves, deal.workers, { ghosts: phase === 'challenge' }).H;
    const handle = cv.setupCanvas(plateWrap, {
      get height() { return heightFor(plateWrap.getBoundingClientRect().width || 600); },
    });
    const canvas = handle.canvas;
    // The table is most of a phone's screen: let a finger that lands on bare table scroll the
    // essay, and claim the gesture (touchstart, below) only when it lands on a piece of bread.
    canvas.style.touchAction = 'manipulation';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label',
      'The baker’s table: loaves to cut and plates to serve. Arrow keys choose a piece, Enter cuts it with the chosen knife, ' +
      'a number key serves it to that worker, Backspace returns it to the table, U undoes.');

    const knivesRow = ui.controlRow(stage);
    knivesRow.classList.add('knives');
    const knifeLab = document.createElement('span');
    knifeLab.className = 'knife-lab';
    knifeLab.textContent = 'knife';
    knivesRow.appendChild(knifeLab);
    const knifeBtns = {};
    for (const k of KNIVES) {
      const b = ui.button(knivesRow, KNIFE_GLYPHS[k], () => setKnife(k), { small: true });
      b.classList.add('knife');
      b.title = `cut a piece into ${k} equal parts`;
      b.setAttribute('aria-label', `knife: cut into ${k} equal parts`);
      knifeBtns[k] = b;
    }
    const sep = document.createElement('span'); sep.className = 'sep'; knivesRow.appendChild(sep);
    ui.button(knivesRow, 'undo', () => { undo(); }, { small: true });
    ui.button(knivesRow, 'gather the loaves', () => { snapshot(); resetPieces(); refresh(); }, { small: true });
    const hintBtn = ui.button(knivesRow, 'hint', showHint, { small: true });
    const skipBtn = ui.button(knivesRow, 'skip', () => advance(), { small: true });
    const nextBtn = ui.button(knivesRow, 'take the next commission →', () => advance(), { primary: true });
    nextBtn.style.display = 'none';

    const meter = ui.readout(stage, '');
    meter.el.setAttribute('aria-live', 'polite');
    const hintDiv = document.createElement('p');
    hintDiv.className = 'hint-line';
    hintDiv.style.display = 'none';
    stage.appendChild(hintDiv);
    ui.caption(stage,
      'Click a loaf or a piece to cut it with the chosen knife; drag pieces onto the plates, and back to the table if you ' +
      'regret it. Pieces are labelled as Egyptologists print the scribes’ parts: <span class="eg">4</span> is a quarter. ' +
      'The gauge under each plate fills toward the fair share, and the meter demands identical plates, an empty table and ' +
      '(the scribe’s rule) no plate holding two pieces of the same size. Each worker is the hieroglyph of a seated man with his ' +
      'hand to his mouth, which the scribes wrote after words for eating, drinking and being hungry. From the keyboard: Tab to the table, arrows to ' +
      'choose, Enter to cut, a number to serve that worker, Backspace to take it back.');

    // -- the apprentice (revealed after the quest ladder) --
    const challWrap = document.createElement('div');
    stage.appendChild(challWrap);
    challWrap.style.display = 'none';
    rubric(challWrap, '', 'the greedy apprentice');
    ui.caption(challWrap,
      'The commissions are done, and an apprentice arrives, trained in the greedy rule: always serve the largest ' +
      'unit piece that fits. He is fast, and correct, and beatable. Beat him on the thickness of the thinnest piece, ' +
      'or, at equal thickness, on the number of kinds of piece.');
    const challRow = ui.controlRow(challWrap);
    challRow.classList.add('lv-bottom');
    const challSel = ui.select(challRow, {
      label: 'commission',
      options: [
        { value: '5', label: '2 loaves ÷ 5' },
        { value: '7', label: '2 loaves ÷ 7' },
        { value: '9', label: '2 loaves ÷ 9' },
        { value: 'custom', label: 'your own commission' },
      ],
      value: '9',
      onChange: (v) => {
        if (v === 'custom') {
          loavesStep.el.style.display = '';
          workersStep.el.style.display = '';
          startCustom();
        } else {
          loavesStep.el.style.display = 'none';
          workersStep.el.style.display = 'none';
          startChallenge(2, parseInt(v, 10));
        }
      },
    });
    const loavesStep = ui.stepper(challRow, { label: 'loaves', min: 1, max: 4, value: 3, onChange: () => startCustom() });
    const workersStep = ui.stepper(challRow, { label: 'workers', min: 2, max: 9, value: 5, onChange: () => startCustom() });
    loavesStep.el.style.display = 'none';
    workersStep.el.style.display = 'none';
    ui.button(challRow, 'summon the apprentice', summonApprentice);
    const papyrus = document.createElement('div');
    papyrus.className = 'papyrus';
    papyrus.innerHTML = '<div class="pwait">The apprentice waits, brush ready.</div>';
    challWrap.appendChild(papyrus);

    // -- the shelf: the visitor's own table --
    rubric(stage, '', 'your table of parts');
    const shelf = document.createElement('div');
    shelf.className = 'shelf';
    stage.appendChild(shelf);
    ui.caption(stage,
      `In hieroglyphs a unit fraction is its number set beneath the mouth-sign <em>r</em>, “part”: ` +
      `<span class="eg-inline">${egyptianNumeralSVG(4, { height: 21 })}</span> is a quarter (a half had a sign of its own, read <em>gs</em>). In the hieratic of the Rhind ` +
      `papyrus the mouth shrinks to a dot, and Egyptologists print it as an overline, <span class="eg">4</span>. Your fair ` +
      `deals collect here, a table of parts in your own hand.`);

    // -- the full 2/n table, the papyrus against the greedy knife --
    const tableWrap = document.createElement('div');
    stage.appendChild(tableWrap);
    tableWrap.style.display = 'none';
    rubric(tableWrap, '', 'the papyrus’s table');
    ui.caption(tableWrap,
      'All fifty rows of the table against the apprentice’s rule. Each column is one 2/n; the dot marks the thinnest ' +
      'piece the row needs, higher meaning thinner. Step through the rows, or tap a column.');
    const tableRow = ui.controlRow(tableWrap);
    const tableStep = ui.stepper(tableRow, {
      label: 'the table, 2/n', min: 3, max: 101, step: 2, value: 9,
      format: (v) => `2/${v}`,
      onChange: () => showTableRow(),
    });
    const chartWrap = document.createElement('div');
    chartWrap.className = 'lv-chart';
    tableWrap.appendChild(chartWrap);
    const chart = cv.setupCanvas(chartWrap, { get height() { return (chartWrap.getBoundingClientRect().width || 600) < 480 ? 150 : 170; } });
    chart.canvas.setAttribute('role', 'img');
    const tableOut = ui.readout(tableWrap, '');
    const STATS = tableStats();
    const tally = document.createElement('p');
    tally.className = 'tally-line';
    tally.textContent = `Fifty rows: the papyrus and greedy agree ${STATS.same.length} times; the papyrus keeps the thicker ` +
      `thinnest piece ${STATS.papyrus.length} times; greedy does, ${STATS.greedy.length === 1 ? 'once' : STATS.greedy.length + ' times'} ` +
      `(${STATS.greedy.map((n) => '2/' + n).join(', ')}). The papyrus never cuts finer than 1/${STATS.finest}; greedy reaches 1/${STATS.greedyFinest}.`;
    tableWrap.appendChild(tally);
    chart.canvas.setAttribute('aria-label',
      `Chart of the thinnest piece in each row of the 2/n table, papyrus against greedy. ${tally.textContent}`);

    // -- the stretch: Erdős–Straus, the game's open problem --
    rubric(stage, '', 'four over n');
    ui.caption(stage,
      '<b>The game is not finished.</b> In 1948 Paul Erdős and Ernst Straus conjectured that <code>4/n</code> is, for every n ' +
      'above 2, a sum of just <em>three</em> distinct unit fractions. It is enough to settle the primes; computers have checked ' +
      'every n up to 10<sup>18</sup>, and no proof exists. Dial an n. The first answer ' +
      'a search meets when it takes the largest parts first, as the apprentice does, often ends in an absurd sliver; the leanest ' +
      'answer, the one a scribe would choose, is gentler. The buttons jump to the smallest prime in each of the six classes ' +
      'modulo 840 where Louis Mordell showed any failure must hide. Checking is not proving: a machine can confirm a ' +
      'quintillion cases and leave the question open.');
    const esRow = ui.controlRow(stage);
    esRow.classList.add('lv-bottom');
    const esStep = ui.stepper(esRow, {
      label: 'Erdős–Straus, 4/n', min: 3, max: ES_LIMIT, value: 97,
      format: (v) => `4/${v}`,
      onChange: (v) => setES(v),
    });
    const presets = document.createElement('div');
    presets.className = 'es-presets';
    esRow.appendChild(presets);
    const presetLab = document.createElement('span');
    presetLab.className = 'lab';
    presetLab.textContent = 'Mordell’s six';
    presets.appendChild(presetLab);
    const presetBtns = MORDELL_PRIMES.map((p) => {
      const b = ui.button(presets, String(p), () => setES(p), { small: true });
      b.setAttribute('aria-label', `four over ${p}`);
      return b;
    });
    const stripWrap = document.createElement('div');
    stripWrap.className = 'lv-chart';
    stage.appendChild(stripWrap);
    const strip = cv.setupCanvas(stripWrap, { height: 124 });
    strip.canvas.setAttribute('role', 'img');
    strip.canvas.setAttribute('aria-label',
      'Strip chart for n from 3 to 300: the thinnest part of the leanest solution of 4/n in gold, and of the first solution a largest-part-first search finds in blue; the blue dots leap orders of magnitude above the gold.');
    const esOut = ui.readout(stage, '');

    ui.legendPanel(stage,
      '<p>The wedjat, the eye of Horus torn out by Set and restored by Thoth, has long been said to hide the scribes’ ' +
      'grain fractions in its parts: 1/2, 1/4, 1/8, 1/16, 1/32 and 1/64 of a hekat. Add them and you reach only 63/64; ' +
      'the missing sixty-fourth, the story goes, Thoth supplies to the honest scribe. The pairing was proposed by the ' +
      'Berlin Egyptologist Georg Möller in 1911 and repeated for most of a century. Then Jim Ritter traced the signs ' +
      'back. At their origin, in the third millennium BCE, they were cursive accounting marks with no pictures behind ' +
      'them; hieroglyphic versions were improvised later, especially in the New Kingdom, and by the early centuries CE ' +
      'priests with a taste for numerology had indeed begun to link measures of capacity with the Eye. The fractions ' +
      'are older than the eye. The eye is a story that priests, and then scholars, told about them.</p>');

    function rubric(parent, num, text) {
      const r = document.createElement('div');
      r.className = 'lv-rubric';
      r.innerHTML = (num ? `<span class="num">${num}</span>` : '') + `<span>${text}</span>`;
      parent.appendChild(r);
      return r;
    }

    /* ---------- sprites (made once) ---------- */
    const TEX = 256;
    const breadTex = makeBreadTexture(TEX);
    const breadPat = (() => {
      try {
        const pat = handle.ctx.createPattern(breadTex, 'no-repeat');
        return pat && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function' ? pat : null;
      } catch { return null; }
    })();
    const crumbGlow = cv.glowSprite(P.goldBright, 14);
    const plateGlow = cv.glowSprite(P.verdant, 72);
    let bandCache = null, bandKey = '';

    function makeBreadTexture(S) {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      const r = S / 2;
      const grad = g.createRadialGradient(r * 0.9, r * 0.82, r * 0.04, r, r, r);
      grad.addColorStop(0, '#f1dca6');
      grad.addColorStop(0.5, '#e3c47f');
      grad.addColorStop(0.76, '#d0ad63');
      grad.addColorStop(0.87, '#b18c47');
      grad.addColorStop(0.94, '#8a6a33');
      grad.addColorStop(1, '#5f4621');
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      let seed = 2718281;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let i = 0; i < 150; i++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * r * 0.84;
        const x = r + Math.cos(a) * rr, y = r + Math.sin(a) * rr;
        const light = rnd() < 0.45;
        g.fillStyle = light ? `rgba(250,236,196,${0.18 + rnd() * 0.22})` : `rgba(120,86,38,${0.12 + rnd() * 0.18})`;
        g.beginPath();
        g.ellipse(x, y, 0.8 + rnd() * 2.2, 0.6 + rnd() * 1.4, rnd() * Math.PI, 0, TAU);
        g.fill();
      }
      // a faint sheen along the crust
      g.strokeStyle = 'rgba(255,238,196,0.16)';
      g.lineWidth = S * 0.012;
      g.beginPath(); g.arc(r, r, r * 0.9, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
      return c;
    }

    function buildBand(W) {
      const key = `${W}|${geo.bandB}|${handle.dpr}`;
      if (key === bandKey && bandCache) return;
      bandKey = key;
      const dpr = handle.dpr || 1;
      const h = Math.max(1, Math.ceil(geo.bandB + 2));
      const c = bandCache || document.createElement('canvas');
      c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, h);
      const x0 = geo.pad * 0.6, y0 = geo.bandTop, w = Math.max(0, W - 2 * x0), bh = Math.max(0, geo.bandB - y0);
      roundRect(g, x0, y0, w, bh, 6);
      g.fillStyle = P.panel; g.fill();
      g.save();
      roundRect(g, x0, y0, w, bh, 6); g.clip();
      // reeds: fine horizontal fibres, bound across at intervals
      for (let y = y0 + 3; y < y0 + bh; y += 4) {
        g.fillStyle = (Math.round(y) % 8 < 4) ? 'rgba(201,169,89,0.045)' : 'rgba(0,0,0,0.12)';
        g.fillRect(x0, y, w, 1);
      }
      const step = w < 500 ? 46 : 64;
      for (let x = x0 + step / 2; x < x0 + w; x += step) {
        g.fillStyle = 'rgba(201,169,89,0.07)';
        g.fillRect(Math.round(x) - 2, y0, 1, bh);
        g.fillRect(Math.round(x) + 1, y0, 1, bh);
      }
      const vg = g.createLinearGradient(0, y0, 0, y0 + bh);
      vg.addColorStop(0, 'rgba(10,11,16,0.0)'); vg.addColorStop(1, 'rgba(10,11,16,0.35)');
      g.fillStyle = vg; g.fillRect(x0, y0, w, bh);
      g.restore();
      roundRect(g, x0 + 0.5, y0 + 0.5, w - 1, bh - 1, 6);
      g.strokeStyle = 'rgba(201,169,89,0.22)'; g.lineWidth = 1; g.stroke();
      // the label
      g.fillStyle = P.inkDim;
      g.font = `${W < 480 ? 11 : 12}px ${SERIF}`;
      try { g.letterSpacing = '2.5px'; } catch { /* older engines */ }
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('THE TABLE', x0 + 12, y0 + geo.labelH / 2 + 1);
      try { g.letterSpacing = '0px'; } catch { /* ignore */ }
      bandCache = c;
    }

    /* ---------- deal & piece machinery ---------- */

    function setKnife(k) {
      knife = k;
      for (const kk of KNIVES) {
        knifeBtns[kk].classList.toggle('active', kk === k);
        knifeBtns[kk].setAttribute('aria-pressed', String(kk === k));
      }
      dirty = true;
    }
    setKnife(2);

    function relayout() {
      const W = handle.width;
      geo = stageLayout(W, deal.loaves, deal.workers, { ghosts: phase === 'challenge' });
      layoutDirty = true;
      dirty = true;
      // the canvas height follows the layout; nudge the observer when it changes
      if (Math.abs(geo.H - handle.height) > 0.5) canvas.style.height = geo.H + 'px';
    }

    function resetPieces() {
      pieces = [];
      for (let i = 0; i < deal.loaves; i++) {
        pieces.push({
          id: nextId++, den: 1, loaf: i, at: 'table', worker: -1,
          x: 0, y: 0, r: 0, a0: -Math.PI / 2, a1: -Math.PI / 2 + TAU,
          tx: 0, ty: 0, tr: 0, ta0: -Math.PI / 2, ta1: -Math.PI / 2 + TAU,
        });
      }
      focusId = 0;
      layoutTargets();
      for (const p of pieces) { p.x = p.tx; p.y = p.ty; p.r = p.tr; }
    }

    function newDeal(L, W) {
      deal = { loaves: L, workers: W };
      greedyDens = greedyExpand(L, W).map(Number);
      undoStack = [];
      celebrated = false;
      fairChimed = false;
      pulses = [];
      appr = null;
      papyrusGhost = null;
      hetepAt = -1;
      cutFx = null;
      dragId = 0; pending = null;
      papyrus.innerHTML = '<div class="pwait">The apprentice waits, brush ready.</div>';
      nextBtn.style.display = 'none';
      hintDiv.style.display = 'none';
      relayout();
      resetPieces();
      refresh();
    }

    function snapshot() {
      undoStack.push(pieces.map((p) => ({ ...p })));
      if (undoStack.length > 60) undoStack.shift();
    }

    function undo() {
      if (!undoStack.length) return;
      pieces = undoStack.pop();
      dragId = 0; pending = null;
      if (!pieces.some((p) => p.id === focusId)) focusId = 0;
      refresh();
    }

    function plateDens() {
      const plates = Array.from({ length: deal.workers }, () => []);
      for (const p of pieces) if (p.at === 'plate' && p.worker >= 0 && p.worker < deal.workers) plates[p.worker].push(p.den);
      return plates;
    }

    function tableLeft() {
      let s = new Frac(0n, 1n);
      for (const p of pieces) if (p.at === 'table') s = s.add(unit(p.den));
      return s;
    }

    function doCut(p) {
      audio.ensureAudio();
      if (p.at !== 'table') { flash('bring it back to the table to cut it'); refuseSound(); return; }
      if (p.den * knife > MAX_DEN) { flash('the knife cannot cut finer than a crumb'); refuseSound(); return; }
      if (pieces.length + knife - 1 > MAX_PIECES) { flash('the table is drowning in pieces: gather some back'); refuseSound(); return; }
      snapshot();
      const span = (p.a1 - p.a0) / knife;
      const kids = [];
      for (let j = 0; j < knife; j++) {
        kids.push({
          id: nextId++, den: p.den * knife, loaf: p.loaf,
          at: 'table', worker: -1,
          x: p.x, y: p.y, r: p.r,
          a0: p.a0 + j * span, a1: p.a0 + (j + 1) * span,
          tx: p.x, ty: p.y, tr: p.r, ta0: p.a0 + j * span, ta1: p.a0 + (j + 1) * span,
        });
      }
      pieces.splice(pieces.indexOf(p), 1, ...kids);
      if (focusId === p.id) focusId = kids[0].id;
      if (!reduce) {
        const angles = [];
        for (let j = (p.den === 1 ? 0 : 1); j < knife; j++) angles.push(p.a0 + j * span);
        const crumbs = [];
        for (let j = 0; j < Math.min(6, knife); j++) {
          const a = p.a0 + (j + 0.5) * span;
          crumbs.push({ a, v: 36 + 22 * ((j * 37) % 5) / 5 });
        }
        cutFx = { x: p.x, y: p.y, r: p.r, angles, t0: lastT, crumbs };
      }
      const t0 = now();
      audio.drums.rim(bus, t0, { level: 0.4 });
      audio.drums.wood(bus, t0 + 0.01, { level: 0.3, pitch: 900 + 60 * Math.log2(p.den * knife) });
      refresh();
    }

    function servePiece(p, w) {
      if (p.at === 'plate' && p.worker === w) { refresh(); return; }
      snapshot();
      p.at = 'plate'; p.worker = w;
      everServed = true;
      audio.drums.wood(bus, now(), { level: 0.4, pitch: 420 + 55 * Math.log2(p.den + 1) });
      refresh();
    }

    function returnPiece(p) {
      snapshot();
      p.at = 'table'; p.worker = -1;
      audio.drums.wood(bus, now(), { level: 0.25, pitch: 300 });
      refresh();
    }

    /* ---------- fairness, celebration, shelf ---------- */

    function refresh() {
      const plates = plateDens();
      lastChk = checkFairness({ loaves: deal.loaves, workers: deal.workers, plates });
      const share = Frac.of(deal.loaves, deal.workers);
      plateInfo = plates.map((pl) => {
        let s = new Frac(0n, 1n);
        for (const d of pl) s = s.add(unit(d));
        const c = s.cmp(share);
        const ratio = Number(s.n * 10000n / s.d) / 10000 / (deal.loaves / deal.workers);
        return { text: s.isZero() ? '·' : s.toString(), ratio, full: c === 0, over: c > 0, repeat: new Set(pl).size !== pl.length };
      });
      meter.setHTML(meterHTML(lastChk));
      if (lastChk.scribal && !celebrated) celebrate(plates[0].map(Number).sort((a, b) => a - b));
      else if (lastChk.fair && !lastChk.scribal && !fairChimed) {
        fairChimed = true;
        const t0 = now();
        audio.playTone(bus, { freq: 392, dur: 0.3, level: 0.3, when: t0 });
        audio.playTone(bus, { freq: 440, dur: 0.35, level: 0.3, when: t0 + 0.12 });
      }
      // re-arm once the deal is disturbed, so a *different* fair deal for the
      // same commission can also be found, celebrated, and shelved
      if (!lastChk.scribal) { celebrated = false; if (hetepAt >= 0 && !lastChk.fair) hetepAt = -1; }
      if (!lastChk.fair) fairChimed = false;
      layoutDirty = true;
      dirty = true;
    }

    function meterHTML(chk) {
      const ok = `<span style="color:${P.verdant}">✓</span>`;
      const dim = `<span style="color:${FAINT}">○</span>`;
      const left = tableLeft();
      const whole = left.n / left.d, rest = left.sub(Frac.of(Number(whole)));
      const leftAmt = left.d === 1n
        ? `${left} ${left.n === 1n ? 'loaf' : 'loaves'}`
        : whole > 0n ? `${whole} + ${rest} loaves` : `${left} of a loaf`;
      const leftStr = left.isZero()
        ? `table empty ${ok}`
        : `on the table: <span style="color:${P.gold}">${leftAmt}</span>`;
      let line = `${leftStr}&ensp;·&ensp;plates identical ${chk.identical && chk.served.n !== 0n ? ok : dim}` +
                 `&ensp;·&ensp;no repeated size ${chk.distinct && chk.served.n !== 0n ? ok : dim}`;
      if (chk.scribal) {
        const dens = plateDens()[0].map(Number).sort((a, b) => a - b);
        line = `<span style="color:${P.goldBright}">${deal.workers} identical plates: each worker holds ` +
               `${densSum(dens)} = ${chk.share}. No one can complain.</span>`;
      } else if (chk.fair) {
        line += `<br><span style="color:${P.gold}">Fair: every plate matches. But the scribes never write the same part twice; ` +
                `gather the loaves and try unequal knives.</span>`;
      }
      return line;
    }

    function celebrate(dens) {
      celebrated = true;
      solvedKeys.add(`${deal.loaves}/${deal.workers}`);
      for (const w of geo.workers) pulses.push({ x: w.x, y: w.plateY, start: lastT });
      if (hetepAt < 0) hetepAt = lastT;
      const t0 = now();
      [392, 493.88, 587.33, 783.99].forEach((f, i) =>
        audio.playTone(bus, { freq: f, dur: 0.5, level: 0.32, when: t0 + i * 0.09 }));
      audio.playTone(bus, { freq: 196, dur: 1.1, level: 0.18, type: 'triangle', when: t0 });
      shelfAdd(dens);
      const sh = Frac.of(deal.loaves, deal.workers);
      const ah = sh.n === 2n ? AHMES_TABLE[Number(sh.d)] : null;
      if (phase === 'challenge' && ah) papyrusGhost = ah.slice();
      quest.done(phase === 'quest' ? questVerdict(dens) : raceVerdict(dens));
      if (phase === 'quest') nextBtn.style.display = '';
      if (tableWrap.style.display !== 'none') showTableRow();
      dirty = true;
    }

    function questVerdict(dens) {
      const sh = Frac.of(deal.loaves, deal.workers);
      let out = `No one can complain: each worker holds ${densSum(dens)} = ${sh}.`;
      const ah = sh.n === 2n ? AHMES_TABLE[Number(sh.d)] : null;
      if (ah && ah.length === dens.length && ah.every((d, i) => d === dens[i])) {
        out += ' It is the very entry Ahmes copied onto the papyrus, some thirty-six centuries ago.';
      }
      if (!hetepSaid) {
        hetepSaid = true;
        out += ' The Egyptian for it is <em>ḥtp</em>, “satisfied, at peace”, and the sign that writes it is a loaf of bread on a reed mat.';
      }
      return out;
    }

    function raceVerdict(dens) {
      const g = greedyDens;
      const vMax = dens[dens.length - 1], gMax = g[g.length - 1];
      const sh = Frac.of(deal.loaves, deal.workers);
      const ah = sh.n === 2n ? AHMES_TABLE[Number(sh.d)] : null;
      const ahMatch = ah && ah.length === dens.length && ah.every((d, i) => d === dens[i]);
      const outcome = raceOutcome(dens, g);
      let out;
      if (outcome === 'same') {
        out = `You and the apprentice made the very same deal: ${densSum(dens)}.`;
      } else if (outcome === 'thicker') {
        out = `You have out-scribed the apprentice: your thinnest piece is 1/${vMax} against his 1/${gMax}` +
              (dens.length > g.length ? `, bought with ${dens.length - g.length === 1 ? 'one more kind' : (dens.length - g.length) + ' more kinds'} of piece` : '') +
              (dens.length < g.length ? `, and in fewer kinds (${dens.length} against ${g.length})` : '') + '.';
      } else if (outcome === 'fewer') {
        out = `Your thinnest piece matches his, 1/${vMax}, and you used fewer kinds of piece (${dens.length} against ${g.length}).`;
      } else if (outcome === 'tie') {
        out = `A tie on the thinnest piece, 1/${vMax}, in as many kinds as his (${densSum(g)}).`;
      } else if (outcome === 'more') {
        out = `Your thinnest piece matches his, 1/${vMax}, but his deal (${densSum(g)}) needs fewer kinds of piece. ` +
              `The knives are still out.`;
      } else {
        out = `Fair and scribal, though the apprentice’s deal (${densSum(g)}) keeps a thicker thinnest piece. The knives are still out.`;
      }
      if (ahMatch) out += ' And it is the very entry on the papyrus: you and Ahmes agree across thirty-six centuries.';
      else if (ah) out += ` The papyrus, for the record, says ${densSum(ah)}.`;
      return out;
    }

    function shelfAdd(dens) {
      const key = `${deal.loaves}÷${deal.workers}=${dens.join(',')}`;
      if (shelfDeals.some((d) => d.key === key)) return;
      shelfDeals.push({ key, L: deal.loaves, W: deal.workers, dens: dens.slice() });
      shelfDeals.sort((a, b) => (a.L / a.W) - (b.L / b.W) || a.W - b.W || a.dens.length - b.dens.length);
      renderShelf();
    }

    function renderShelf() {
      shelf.textContent = '';
      if (!shelfDeals.length) {
        const e = document.createElement('div');
        e.className = 'shelf-empty';
        e.textContent = 'Nothing yet: your first fair deal will be written here.';
        shelf.appendChild(e);
        return;
      }
      for (const d of shelfDeals) {
        const isRow = d.L === 2 && d.W % 2 === 1 && AHMES_TABLE[d.W];
        const e = document.createElement(isRow ? 'button' : 'div');
        e.className = 'shelf-entry';
        if (isRow) { e.type = 'button'; e.title = `show row 2/${d.W} of the papyrus’s table`; }
        const ah = isRow ? AHMES_TABLE[d.W] : null;
        const asPap = ah && ah.length === d.dens.length && ah.every((x, i) => x === d.dens[i]);
        e.innerHTML = `<b>${d.L} ÷ ${d.W}</b><span>= ${densSum(d.dens)}</span>` +
          `<span class="hg" aria-hidden="true">${d.dens.map((x) => x === 2 ? '<span class="gs" title="a half had a sign of its own, read gs">gs</span>' : egyptianNumeralSVG(x, { height: 21 })).join('')}</span>` +
          (asPap ? '<span class="as-papyrus">as the papyrus</span>' : '');
        e.setAttribute('aria-label', `${d.L} loaves among ${d.W}: ${densSum(d.dens)}${asPap ? ', the papyrus’s own entry' : ''}`);
        if (isRow) e.addEventListener('click', () => { if (tableWrap.style.display !== 'none') { tableStep.set(d.W); showTableRow(); } });
        shelf.appendChild(e);
      }
    }
    renderShelf();

    /* ---------- quest flow ---------- */

    function startQuest(i) {
      qi = i;
      phase = 'quest';
      quest.set(QUESTS[i].banner);
      hintBtn.style.display = '';
      skipBtn.style.display = '';
      newDeal(QUESTS[i].loaves, QUESTS[i].workers);
    }

    function showHint() {
      if (phase !== 'quest') return;
      hintDiv.textContent = QUESTS[qi].hint;
      hintDiv.style.display = '';
    }

    function advance() {
      if (qi < QUESTS.length - 1) startQuest(qi + 1);
      else enterChallenge();
    }

    function enterChallenge() {
      phase = 'challenge';
      hintBtn.style.display = 'none';
      skipBtn.style.display = 'none';
      challWrap.style.display = '';
      tableWrap.style.display = '';
      challSel.set('9');
      startChallenge(2, 9);
      showTableRow();
    }

    function startChallenge(L, W) {
      newDeal(L, W);
      const text = CHALLENGES[W] ? CHALLENGES[W](greedyDens) :
        `Beat the apprentice at <b>${L} ÷ ${W}</b>: his thinnest piece is 1/${greedyDens[greedyDens.length - 1]}.`;
      quest.set(text);
    }

    function startCustom() {
      let L = loavesStep.value, W = workersStep.value;
      if (L >= W) { L = W - 1; loavesStep.set(L); }
      newDeal(L, W);
      quest.set(`Your own commission: <b>${L} loaves to ${W} workers</b>, each share ${Frac.of(L, W)}. ` +
                `The apprentice would reach 1/${greedyDens[greedyDens.length - 1]} in ${greedyDens.length} ` +
                `kind${greedyDens.length === 1 ? '' : 's'} of piece; the shelf awaits your deal.`);
    }

    function summonApprentice() {
      audio.ensureAudio();
      papyrus.innerHTML = '';
      appr = { steps: greedyNarrative(deal.loaves, deal.workers), shown: 0, nextAt: 0, dens: greedyDens.slice() };
      dirty = true;
    }

    /* ---------- the 2/n table explorer ---------- */

    function tableEntryHTML(n) {
      const a = AHMES_TABLE[n];
      if (!a) return '';
      const g = greedyExpand(2, n).map(Number);
      const aMax = a[a.length - 1], gMax = g[g.length - 1];
      const same = a.length === g.length && a.every((d, i) => d === g[i]);
      let verdict;
      if (same) {
        verdict = 'Here the greedy knife and the papyrus agree exactly.';
      } else if (aMax < gMax) {
        const ratio = gMax / aMax;
        const extra = a.length - g.length;
        verdict = `The papyrus’s thinnest part is 1/${aMax} against greedy’s 1/${gMax}` +
                  (ratio >= 2 ? `, ${ratio % 1 === 0 ? ratio : ratio.toFixed(1)} times thicker bread` : '') +
                  (extra > 0 ? `, bought with ${extra === 1 ? 'one more part' : extra + ' more parts'}` : '') + '.';
      } else {
        const evens = a.every((d) => d % 2 === 0);
        verdict = `On paper greedy wins this row: 1/${gMax} against the papyrus’s 1/${aMax}.` +
          (evens ? ` Every part the papyrus chose here is even, and an even part doubles cleanly (twice 1/8 is 1/4); ` +
                   `whether that was the reason, no one can say.` : '');
      }
      const solved = solvedKeys.has(`2/${n}`) ? `<br><span style="color:${P.verdant}">You have dealt this one yourself.</span>` : '';
      return `<span class="esl">papyrus</span><span style="color:${P.gold}">2/${n} = ${densSum(a)}</span>  (${a.length}&nbsp;parts)<br>` +
             `<span class="esl">greedy</span><span style="color:${P.azure}">2/${n} = ${densSum(g)}</span>  (${g.length}&nbsp;parts)<br>` +
             `<span style="color:${P.inkDim}">${verdict}</span>${solved}`;
    }

    function showTableRow() {
      tableOut.setHTML(tableEntryHTML(tableStep.value));
      drawChart();
    }

    function chartGeom() {
      const W = chart.width, H = chart.height;
      const narrow = W < 480;
      const L = narrow ? 40 : 46, R = 10, T = narrow ? 26 : 30, B = 24;   // room for “1/1000”
      const lo = Math.log10(2), hi = Math.log10(8000);
      const pw = Math.max(1, W - L - R), ph = Math.max(1, H - T - B);
      const xOf = (i) => L + (i + 0.5) * pw / STATS.rows.length;
      const yOf = (d) => T + ph - (Math.log10(d) - lo) / (hi - lo) * ph;
      return { W, H, L, R, T, B, pw, ph, xOf, yOf, narrow };
    }

    function drawChart() {
      const { ctx } = chart;
      const G = chartGeom();
      const { W, H, L, T, pw, ph, xOf, yOf, narrow } = G;
      ctx.clearRect(0, 0, W, H);
      if (W < 60 || H < 40) return;
      const sel = tableStep.value;
      // grid
      ctx.font = `${narrow ? 9 : 10}px ${MONO_FAMILY}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const d of [10, 100, 1000]) {
        const y = Math.round(yOf(d)) + 0.5;
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
        ctx.fillStyle = FAINT;
        ctx.fillText('1/' + d, L - 4, y);
      }
      // legend
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = `italic ${narrow ? 11 : 12}px ${SERIF}`;
      const ly = 16;
      let lx = L;
      ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(lx + 3, ly - 4, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = P.inkDim; ctx.fillText('the papyrus', lx + 10, ly); lx += 10 + ctx.measureText('the papyrus').width + 14;
      ctx.fillStyle = P.azure; ctx.beginPath(); ctx.arc(lx + 3, ly - 4, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = P.inkDim; ctx.fillText('greedy', lx + 10, ly); lx += 10 + ctx.measureText('greedy').width + 14;
      if (!narrow) { ctx.fillStyle = FAINT; ctx.fillText('thinnest piece in each row; higher is thinner', lx, ly); }
      // selection band
      const si = STATS.rows.findIndex((r) => r.n === sel);
      const colW = pw / STATS.rows.length;
      if (si >= 0) {
        ctx.fillStyle = 'rgba(201,169,89,0.09)';
        ctx.fillRect(xOf(si) - colW / 2, T - 4, colW, ph + 8);
      }
      // stems and dots
      for (let i = 0; i < STATS.rows.length; i++) {
        const r = STATS.rows[i];
        const x = xOf(i), ya = yOf(r.aMax), yg = yOf(r.gMax);
        ctx.strokeStyle = r.aMax < r.gMax ? 'rgba(201,169,89,0.35)' : 'rgba(125,167,217,0.45)';
        ctx.lineWidth = 1;
        if (!r.same) { ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x, yg); ctx.stroke(); }
        ctx.fillStyle = P.azure;
        ctx.beginPath(); ctx.arc(x, yg, Math.max(0, narrow ? 1.8 : 2.2), 0, TAU); ctx.fill();
        ctx.fillStyle = P.gold;
        ctx.beginPath(); ctx.arc(x, ya, Math.max(0, narrow ? 2.2 : 2.7), 0, TAU); ctx.fill();
        if (r.same) { ctx.strokeStyle = P.azure; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, ya, narrow ? 3.6 : 4.4, 0, TAU); ctx.stroke(); }
        if (solvedKeys.has(`2/${r.n}`)) {
          ctx.fillStyle = P.verdant;
          ctx.beginPath(); ctx.arc(x, T + ph + 6, 1.8, 0, TAU); ctx.fill();
        }
      }
      if (si >= 0) {
        const r = STATS.rows[si];
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(xOf(si), yOf(r.aMax), 6, 0, TAU); ctx.stroke();
      }
      // x labels: the selected row is named in gold, and a fixed mark gives way to it
      ctx.font = `10px ${MONO_FAMILY}`;
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      let selBox = null;
      if (si >= 0) {
        const t = '2/' + sel, w = ctx.measureText(t).width;
        const x0 = clamp(xOf(si) - w / 2, L - colW / 2, L + pw + colW / 2 - w);
        selBox = [x0, x0 + w];
        ctx.fillStyle = P.goldBright;
        ctx.fillText(t, x0, H - 5);
      }
      ctx.fillStyle = FAINT;
      for (const n of narrow ? [3, 51, 101] : [3, 25, 51, 75, 101]) {
        if (n === sel) continue;
        const i = (n - 3) / 2, t = '2/' + n, w = ctx.measureText(t).width;
        const x0 = i === 0 ? xOf(i) - colW / 2 : (n === 101 ? xOf(i) + colW / 2 - w : xOf(i) - w / 2);
        if (selBox && x0 < selBox[1] + 8 && x0 + w > selBox[0] - 8) continue;
        ctx.fillText(t, x0, H - 5);
      }
    }

    function onChartPick(e) {
      const [x] = cv.pointerPos(chart, e);
      const G = chartGeom();
      const i = clamp(Math.floor((x - G.L) / (G.pw / STATS.rows.length)), 0, STATS.rows.length - 1);
      tableStep.set(STATS.rows[i].n);
      showTableRow();
    }
    chart.canvas.addEventListener('pointerdown', onChartPick);
    chart.onResize(() => drawChart());

    /* ---------- Erdős–Straus explorer ---------- */

    const ES_MAX = 300;
    const esData = new Array(ES_MAX + 1).fill(null);
    let esNext = 3;
    let esN = 97;

    function setES(n) {
      esN = n;
      esStep.set(n);          // the Mordell buttons lie beyond the strip, but not beyond the stepper
      presetBtns.forEach((b, i) => b.classList.toggle('active', MORDELL_PRIMES[i] === n));
      esOut.setHTML(esHTML(n));
      drawStrip();
    }

    function esHTML(n) {
      const s = n <= ES_MAX && esData[n] ? esData[n] : esSolve(n);
      if (n <= ES_MAX) esData[n] = s;
      if (!s.first) return 'searching…';
      const fmt = ([x, y, z]) => `4/${n} = 1/${fmtInt(x)} + 1/${fmtInt(y)} + 1/${fmtInt(z)}`;
      const cls = n % 840;
      const notes = [];
      notes.push(`${s.count} solution${s.count === 1 ? '' : 's'} in all`);
      if (isPrimeN(n)) notes.push(`${n} is prime`);
      if (MORDELL_CLASSES.includes(cls)) notes.push(`${n} ≡ ${cls} (mod 840), one of Mordell’s six classes`);
      const same = s.first.join() === s.leanest.join();
      return `<span class="esl">first found</span><span style="color:${P.azure}">${fmt(s.first)}</span><br>` +
             `<span class="esl">leanest</span><span style="color:${P.gold}">${fmt(s.leanest)}</span>` +
             (same ? `<span style="color:${FAINT}">  (the same)</span>` : '') + '<br>' +
             `<span style="color:${P.inkDim}">${notes.join('\u00a0· ')}</span>`;
    }

    function drawStrip() {
      const { ctx, width: W, height: H } = strip;
      ctx.clearRect(0, 0, W, H);
      if (W < 60 || H < 40) return;
      const narrow = W < 480;
      const L = narrow ? 30 : 40, R = 10, T = 26, B = 22;
      const pw = Math.max(1, W - L - R), ph = Math.max(1, H - T - B);
      const lo = 0.5, hi = 9;
      const xOf = (n) => L + (n - 3) / (ES_MAX - 3) * pw;
      const yOf = (z) => T + ph - (clamp(Math.log10(z), lo, hi) - lo) / (hi - lo) * ph;
      ctx.font = `10px ${MONO_FAMILY}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const e of [2, 5, 8]) {
        const y = Math.round(yOf(10 ** e)) + 0.5;
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
        ctx.fillStyle = FAINT;
        ctx.fillText(`10${e === 2 ? '²' : e === 5 ? '⁵' : '⁸'}`, L - 4, y);
      }
      // Mordell's classes within the strip
      ctx.strokeStyle = 'rgba(217,122,104,0.55)'; ctx.lineWidth = 1;
      for (let n = 3; n <= ES_MAX; n++) {
        if (!MORDELL_CLASSES.includes(n % 840)) continue;
        const x = Math.round(xOf(n)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, T + ph + 2); ctx.lineTo(x, T + ph + 7); ctx.stroke();
      }
      for (let n = 3; n <= ES_MAX; n++) {
        const s = esData[n];
        if (!s || !s.first) continue;
        const x = xOf(n);
        ctx.fillStyle = 'rgba(125,167,217,0.7)';
        ctx.fillRect(x - 0.9, yOf(s.first[2]) - 0.9, 1.8, 1.8);
        ctx.fillStyle = P.gold;
        ctx.fillRect(x - 1, yOf(s.leanest[2]) - 1, 2, 2);
      }
      // legend
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = `italic ${narrow ? 11 : 12}px ${SERIF}`;
      let lx = L;
      ctx.fillStyle = P.gold; ctx.fillRect(lx, 10, 5, 5);
      ctx.fillStyle = P.inkDim; ctx.fillText('leanest, 1/z', lx + 9, 16); lx += 9 + ctx.measureText('leanest, 1/z').width + 14;
      ctx.fillStyle = P.azure; ctx.fillRect(lx, 10, 5, 5);
      ctx.fillStyle = P.inkDim; ctx.fillText('first found', lx + 9, 16); lx += 9 + ctx.measureText('first found').width + 14;
      // the red ticks are drawn at every width, so name them wherever the words fit
      const mlab = narrow ? 'Mordell' : 'Mordell’s classes';
      if (lx + 8 + ctx.measureText(mlab).width <= W - R) {
        ctx.strokeStyle = 'rgba(217,122,104,0.7)'; ctx.beginPath(); ctx.moveTo(lx + 2, 9); ctx.lineTo(lx + 2, 16); ctx.stroke();
        ctx.fillStyle = FAINT; ctx.fillText(mlab, lx + 8, 16);
      }
      // selection, and the ends of the axis where they do not collide with it
      ctx.font = `10px ${MONO_FAMILY}`;
      ctx.textBaseline = 'alphabetic';
      let selX = null;
      if (esN <= ES_MAX && esData[esN]) {
        const x = Math.round(xOf(esN)) + 0.5;
        ctx.strokeStyle = 'rgba(232,200,124,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, T - 2); ctx.lineTo(x, T + ph + 2); ctx.stroke();
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(xOf(esN), yOf(esData[esN].leanest[2]), 4.5, 0, TAU); ctx.stroke();
        selX = clamp(x, L + 22, L + pw - 22);
        ctx.fillStyle = P.goldBright;
        ctx.textAlign = 'center';
        ctx.fillText(`n = ${esN}`, selX, H - 5);
      } else if (esN > ES_MAX) {
        selX = L + pw;
        ctx.fillStyle = FAINT; ctx.textAlign = 'right';
        ctx.fillText(`n = ${esN} lies beyond this strip`, L + pw, H - 5);
      }
      ctx.fillStyle = FAINT;
      if (selX === null || selX - L > 44) { ctx.textAlign = 'left'; ctx.fillText('n = 3', L, H - 5); }
      if (selX === null || L + pw - selX > 44) { ctx.textAlign = 'right'; ctx.fillText('300', L + pw, H - 5); }
    }

    function onStripPick(e) {
      const [x] = cv.pointerPos(strip, e);
      const narrow = strip.width < 480;
      const L = narrow ? 30 : 40, pw = Math.max(1, strip.width - L - 10);
      const n = clamp(Math.round(3 + (x - L) / pw * (ES_MAX - 3)), 3, ES_MAX);
      setES(n);
    }
    strip.canvas.addEventListener('pointerdown', onStripPick);
    strip.canvas.style.cursor = 'pointer';
    strip.onResize(() => drawStrip());

    function esWork() {
      // fill the strip a few values of n per frame, so start-up never stalls
      if (esNext > ES_MAX) return false;
      const t0 = performance.now();
      while (esNext <= ES_MAX && performance.now() - t0 < 1.2) {
        if (!esData[esNext]) esData[esNext] = esSolve(esNext);
        esNext++;
      }
      if (esNext > ES_MAX || esNext % 40 < 6) drawStrip();
      return true;
    }

    /* ---------- layout & drawing ---------- */

    function layoutTargets() {
      layoutDirty = false;
      const L = deal.loaves, K = deal.workers;
      const byLoaf = Array.from({ length: L }, () => []);
      const byWorker = Array.from({ length: K }, () => []);
      for (const p of pieces) {
        if (p.id === dragId) continue;
        if (p.at === 'table') { if (byLoaf[p.loaf]) byLoaf[p.loaf].push(p); }
        else if (byWorker[p.worker]) byWorker[p.worker].push(p);
      }
      for (let i = 0; i < L; i++) {
        const lp = byLoaf[i];
        const lf = geo.loaves[i];
        if (!lf) continue;
        const spanSum = lp.reduce((s, p) => s + TAU / p.den, 0);
        const gap = lp.length > 1 ? Math.min(0.05, Math.max(0, (TAU - spanSum) / lp.length)) : 0;
        let cursor = -Math.PI / 2;
        for (const p of lp) {
          const span = TAU / p.den;
          const mid = cursor + span / 2;
          const off = p.den === 1 ? 0 : 3;
          p.ta0 = cursor; p.ta1 = cursor + span;
          p.tx = lf.x + Math.cos(mid) * off;
          p.ty = lf.y + Math.sin(mid) * off;
          p.tr = lf.r;
          cursor += span + gap;
        }
      }
      for (let j = 0; j < K; j++) {
        const pp = byWorker[j].sort((a, b) => a.den - b.den);
        const wk = geo.workers[j];
        if (!wk) continue;
        const gap = 0.07;
        const total = pp.reduce((s, p) => s + TAU / p.den, 0) + gap * Math.max(0, pp.length - 1);
        let cursor = -Math.PI / 2 - Math.min(total, TAU) / 2;
        // a fan wider than a half-circle hangs below its centre: lift it onto the plate
        const lift = total > Math.PI ? Math.min(geo.pieceR * Math.sin(Math.min(total - Math.PI, Math.PI) / 2), geo.pieceR * 0.35) : 0;
        for (const p of pp) {
          const span = TAU / p.den;
          p.ta0 = cursor; p.ta1 = cursor + span;
          p.tx = wk.x;
          p.ty = wk.plateY - geo.plateRy * 0.4 - lift;
          p.tr = geo.pieceR;
          cursor += span + gap;
        }
      }
    }

    function sectorPath(ctx, p, grow = 0) {
      const r = Math.max(0, p.r + grow);
      ctx.beginPath();
      if (p.a1 - p.a0 >= TAU - 1e-6) {
        ctx.arc(p.x, p.y, r, 0, TAU);
      } else {
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, r, p.a0, p.a1);
        ctx.closePath();
      }
    }

    function drawEgNum(ctx, text, x, y, size, color) {
      ctx.font = `600 ${size}px ${MONO_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y + size * 0.06);
      const w = ctx.measureText(text).width;
      ctx.fillRect(Math.round(x - w / 2 - 0.5), Math.round(y - size * 0.62), Math.round(w + 1), Math.max(1, size * 0.09));
    }

    const labelW = new Map();
    function drawPiece(ctx, p, lifted) {
      if (p.r < 0.5) return;
      if (lifted) {
        ctx.save();
        ctx.translate(3, 6);
        sectorPath(ctx, p);
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fill();
        ctx.restore();
      }
      sectorPath(ctx, p);
      if (breadPat) {
        const s = (2 * p.r) / TEX;
        breadPat.setTransform(new DOMMatrix([s, 0, 0, s, p.x - p.r, p.y - p.r]));
        ctx.fillStyle = breadPat;
      } else {
        ctx.fillStyle = P.gold;
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,11,16,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (p.den === 1 && p.r > 10) {
        // the baker's score marks on a whole loaf
        ctx.lineCap = 'round';
        const slash = (cx, cy) => {
          ctx.beginPath();
          ctx.moveTo(cx - p.r * 0.17, cy - p.r * 0.3);
          ctx.quadraticCurveTo(cx + p.r * 0.02, cy - p.r * 0.02, cx + p.r * 0.17, cy + p.r * 0.3);
        };
        for (let s = -1; s <= 1; s++) {
          const cx = p.x + s * p.r * 0.3;
          slash(cx, p.y);
          ctx.strokeStyle = 'rgba(110,78,34,0.75)'; ctx.lineWidth = Math.max(1, p.r * 0.05); ctx.stroke();
          slash(cx - 0.9, p.y - 0.9);
          ctx.strokeStyle = 'rgba(250,234,190,0.32)'; ctx.lineWidth = Math.max(0.6, p.r * 0.018); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        return;
      }
      // the part's name, Egyptological style, where it fits
      const span = p.a1 - p.a0;
      if (p.den > 1 && p.r >= 15) {
        const size = clamp(p.r * 0.27, 9, 13);
        const text = String(p.den);
        let w = labelW.get(text + '|' + size);
        if (w == null) {
          ctx.font = `600 ${size}px ${MONO_FAMILY}`;
          w = ctx.measureText(text).width;
          labelW.set(text + '|' + size, w);
        }
        const rl = span >= Math.PI - 1e-3 ? p.r * 0.5 : p.r * 0.6;
        const chord = 2 * rl * Math.sin(Math.min(span, Math.PI) / 2);
        if (chord >= w + 5 && p.r - rl >= size * 0.55) {
          const mid = (p.a0 + p.a1) / 2;
          drawEgNum(ctx, text, p.x + Math.cos(mid) * rl, p.y + Math.sin(mid) * rl, size, 'rgba(58,40,14,0.82)');
        }
      }
    }

    function drawWorker(ctx, j, wk, fairNow) {
      const info = plateInfo[j] || { text: '·', ratio: 0, full: false, over: false, repeat: false };
      const over = j === dragOver;
      const pr = geo.pieceR, rx = geo.plateRx, ry = geo.plateRy;
      const baseY = wk.plateY - pr * 1.35 - 9;   // clear of the tallest fan a plate can hold
      const fs = geo.figS || 1;
      const headY = baseY - 31 * fs;
      const ink = over ? P.goldBright : (fairNow ? P.gold : P.inkFaint);
      // figure: the hieroglyph A2, a seated man with his hand to his mouth,
      // which the scribes wrote after words for eating, drinking, being hungry
      drawEater(ctx, wk.x - 1.6 * fs, baseY, fs, ink);
      // plate
      if (fairNow && pulses.length && !reduce) plateGlow.draw(ctx, wk.x, wk.plateY, 0.5);
      ctx.beginPath();
      ctx.ellipse(wk.x, wk.plateY, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
      ctx.fillStyle = '#1b1f2d';
      ctx.fill();
      ctx.strokeStyle = fairNow ? P.verdant : (over ? P.goldBright : (lastChk && lastChk.fair ? P.gold : P.line));
      ctx.lineWidth = over ? 2 : 1.2;
      ctx.stroke();
      // share gauge along the plate's lower rim
      const grx = Math.max(0, rx + 5), gry = Math.max(0, ry + 4.5);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(74,72,64,0.7)';
      ctx.beginPath(); ctx.ellipse(wk.x, wk.plateY, grx, gry, 0, Math.PI, 0, true); ctx.stroke();
      const f = clamp(info.ratio, 0, 1);
      if (f > 0) {
        ctx.strokeStyle = info.over ? P.crimsonBright : (info.full ? P.verdant : P.gold);
        ctx.beginPath(); ctx.ellipse(wk.x, wk.plateY, grx, gry, 0, Math.PI, Math.PI - f * Math.PI, true); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // held sum
      ctx.font = `${geo.ws < 70 ? 10 : 11}px ${MONO_FAMILY}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = info.over ? P.crimsonBright : (info.full ? P.verdant : P.inkDim);
      ctx.fillText(info.text, wk.x, wk.plateY + ry + 20);
      if (hasFocus && kbActive && j < 9) {
        ctx.fillStyle = FAINT;
        ctx.font = `10px ${MONO_FAMILY}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(j + 1), wk.x - 11 * fs, headY + 2);
      }
    }

    // Gardiner A2, facing right; (x, y) is the middle of its base, s = 1 is about 36 px tall.
    function drawEater(ctx, x, y, s, color) {
      ctx.save();
      ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = color; ctx.strokeStyle = color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();                                   // head, with a short nose
      ctx.ellipse(0.6, -31.2, 4.3, 4.6, 0, 0, TAU);
      ctx.moveTo(4.4, -31.8); ctx.lineTo(6.1, -30.2); ctx.lineTo(4.4, -29.4); ctx.closePath();
      ctx.fill();
      ctx.beginPath();                                   // body, kneeling on one heel, one knee raised
      ctx.moveTo(-1.6, -27.4);
      ctx.lineTo(2.4, -27.2);
      ctx.quadraticCurveTo(4.6, -24.6, 3.9, -19.5);
      ctx.quadraticCurveTo(3.5, -16, 2.6, -14.2);
      ctx.quadraticCurveTo(4.8, -13.2, 8, -15);
      ctx.quadraticCurveTo(10.8, -15.6, 10.4, -12.4);
      ctx.lineTo(9.8, -2);
      ctx.lineTo(11.4, -1.4);
      ctx.lineTo(11.2, 0);
      ctx.lineTo(-5.6, 0);
      ctx.quadraticCurveTo(-8.2, 0, -7.6, -3.4);
      ctx.bezierCurveTo(-6.6, -11, -6.2, -20.5, -1.6, -27.4);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2.3;                               // the arm, hand raised to the mouth
      ctx.beginPath(); ctx.moveTo(1.8, -24.6); ctx.lineTo(8, -19.4); ctx.lineTo(6.3, -28.4); ctx.stroke();
      ctx.restore();
    }

    function drawGhostPlate(ctx, slot, dens, shown, color, label, waiting) {
      const { x, y, r } = slot;
      const rx = r * 1.3, ry = rx * 0.3;
      const py = y + r * 0.16;            // the plate's centre: the fan's point rests on it, as on the workers’ plates
      ctx.save();
      if (waiting) ctx.globalAlpha = 0.5;
      ctx.font = `italic 12px ${SERIF}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = color;
      ctx.fillText(label, x, y - r - 12);
      ctx.beginPath();
      ctx.ellipse(x, py, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      if (waiting) {
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.arc(x, y, Math.max(0, r * 0.8), Math.PI * 1.08, Math.PI * 1.92);   // where the fan will open
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const gap = 0.07;
      const list = dens.slice(0, shown);
      const total = list.reduce((s, d) => s + TAU / d, 0) + gap * Math.max(0, list.length - 1);
      let cursor = -Math.PI / 2 - Math.min(total, TAU) / 2;
      for (const d of list) {
        const span = TAU / d;
        ctx.beginPath();
        if (span >= TAU - 1e-6) ctx.arc(x, y, Math.max(0, r), 0, TAU);
        else { ctx.moveTo(x, y); ctx.arc(x, y, Math.max(0, r), cursor, cursor + span); ctx.closePath(); }
        ctx.fillStyle = color === P.azure ? 'rgba(125,167,217,0.16)' : 'rgba(217,122,104,0.16)';
        ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
        cursor += span + gap;
      }
      if (waiting) {
        ctx.font = `italic 11px ${SERIF}`;
        ctx.fillStyle = P.inkDim;
        ctx.fillText(waiting, x, py + ry + 15);
      } else {
        ctx.font = `10px ${MONO_FAMILY}`;
        ctx.fillStyle = P.inkDim;
        ctx.fillText(list.length ? densSum(list) : '…', x, py + ry + 15);
      }
      ctx.restore();
    }

    function drawHetep(ctx, x, y, alpha) {
      // Gardiner R4: a loaf standing on a reed mat, the sign that writes ḥtp.
      // (x, y) is the centre of the mat's top edge.
      ctx.save();
      ctx.globalAlpha = alpha;
      const w = 34, h = 6;
      ctx.fillStyle = P.goldBright;
      ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, h);
      ctx.fillStyle = 'rgba(22,25,37,0.8)';
      for (let k = 1; k < 8; k++) ctx.fillRect(Math.round(x - w / 2 + (k * w) / 8), Math.round(y) + 1, 1, h - 2);
      ctx.fillStyle = P.goldBright;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.bezierCurveTo(x - 5.8, y - 9, x - 3.2, y - 15, x, y - 15);
      ctx.bezierCurveTo(x + 3.2, y - 15, x + 5.8, y - 9, x + 5, y);
      ctx.closePath();
      ctx.fill();
      ctx.font = `italic 13px ${SERIF}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = P.gold;
      ctx.fillText('ḥtp, satisfied', x - w / 2 - 10, y + 4);
      ctx.restore();
    }

    function draw(dt, t) {
      lastT = t;
      esWork();
      const { ctx, width: W, height: H } = handle;
      if (W < 40 || H < 40) return;

      // apprentice papyrus lines (time from the rAF loop, so it freezes when paused)
      if (appr && appr.shown < appr.steps.length) {
        if (t >= appr.nextAt) {
          const line = document.createElement('div');
          line.className = 'pline';
          line.innerHTML = appr.steps[appr.shown];
          papyrus.appendChild(line);
          audio.drums.wood(bus, now(), { level: 0.25, pitch: 700 + appr.shown * 40 });
          appr.shown++;
          appr.nextAt = t + (reduce ? 0.6 : 1.25);
          dirty = true;
        }
      }
      if (note && t >= note.until) { note = null; dirty = true; }

      if (layoutDirty) layoutTargets();
      const ease = reduce ? 1 : 1 - Math.exp(-dt * 11);
      let moving = false;
      for (const p of pieces) {
        if (p.id === dragId) {
          const span = TAU / p.den;
          p.tx = pointer[0]; p.ty = pointer[1];
          p.ta0 = -Math.PI / 2 - span / 2; p.ta1 = -Math.PI / 2 + span / 2;
          p.tr = Math.min(geo.R * 0.85, 56);
        }
        const d = Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) + Math.abs(p.tr - p.r) +
                  30 * (Math.abs(p.ta0 - p.a0) + Math.abs(p.ta1 - p.a1));
        if (d < 0.08) { p.x = p.tx; p.y = p.ty; p.r = p.tr; p.a0 = p.ta0; p.a1 = p.ta1; continue; }
        moving = true;
        p.x += (p.tx - p.x) * ease;
        p.y += (p.ty - p.y) * ease;
        p.r += (p.tr - p.r) * ease;
        p.a0 += (p.ta0 - p.a0) * ease;
        p.a1 += (p.ta1 - p.a1) * ease;
      }
      const fxLive = (cutFx && t - cutFx.t0 < 0.45) || pulses.length ||
                     (hetepAt >= 0 && t - hetepAt < 0.5 && !reduce) || dragId;
      // idle: nothing moved and nothing changed, so the last frame still stands
      if (!dirty && !moving && !fxLive) return;
      dirty = false;

      ctx.clearRect(0, 0, W, H);
      buildBand(W);
      if (bandCache) ctx.drawImage(bandCache, 0, 0, W, Math.max(1, Math.ceil(geo.bandB + 2)));

      // the label row: a first hint, then the ḥtp sign once a deal satisfies
      const labelY = geo.bandTop + geo.labelH / 2 + 1;
      const rightX = W - geo.pad * 0.6 - 12;
      if (hetepAt >= 0 && lastChk && lastChk.fair) {
        const a = reduce ? 1 : clamp((t - hetepAt) / 0.45, 0, 1);
        drawHetep(ctx, rightX - 17, labelY + 3, a);
      } else if (!everServed) {
        ctx.font = `italic ${W < 480 ? 11 : 12}px ${SERIF}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = FAINT;
        ctx.fillText(W < 480 ? 'tap a loaf to cut · drag to serve' : 'click a loaf to cut it · drag a piece to a plate', rightX, labelY);
      }

      // the apprentice's plate and the papyrus's, when there is room
      if (phase === 'challenge' && geo.ghosts) {
        if (appr) drawGhostPlate(ctx, geo.ghostSlots[0], appr.dens, clamp(appr.shown - 1, 0, appr.dens.length), P.azure, 'the apprentice');
        else drawGhostPlate(ctx, geo.ghostSlots[0], [], 0, P.azure, 'the apprentice', 'not yet summoned');
        const sh = Frac.of(deal.loaves, deal.workers);
        if (papyrusGhost) drawGhostPlate(ctx, geo.ghostSlots[1], papyrusGhost, papyrusGhost.length, P.crimsonBright, 'the papyrus');
        else if (sh.n === 2n && AHMES_TABLE[Number(sh.d)]) drawGhostPlate(ctx, geo.ghostSlots[1], [], 0, P.crimsonBright, 'the papyrus', 'after your deal');
      }

      // workers & plates
      const fairNow = !!(lastChk && lastChk.scribal);
      for (let j = 0; j < geo.workers.length; j++) drawWorker(ctx, j, geo.workers[j], fairNow);

      // pieces: table first, then plates, dragged last
      const dragged = dragId ? pieces.find((p) => p.id === dragId) : null;
      for (const p of pieces) if (p.at === 'table' && p.id !== dragId) drawPiece(ctx, p, false);
      for (const p of pieces) if (p.at === 'plate' && p.id !== dragId) drawPiece(ctx, p, false);
      const hp = hoverId && !dragged ? pieces.find((p) => p.id === hoverId) : null;
      if (hp) {
        sectorPath(ctx, hp, 1.5);
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.6; ctx.stroke();
      }
      let kbPiece = null;
      if (hasFocus && kbActive) {
        kbPiece = pieces.find((p) => p.id === focusId) || null;
        if (kbPiece) {
          ctx.setLineDash([4, 3]);
          sectorPath(ctx, kbPiece, 3);
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // where the chosen knife would fall, on the piece under the pointer (or the keyboard's focus)
      const pv = !dragged && ((hp && pointerIn) ? hp : kbPiece);
      if (pv && pv.at === 'table' && pv.den * knife <= MAX_DEN && pv.r > 8 && !(cutFx && t - cutFx.t0 < 0.45)) {
        const span = (pv.a1 - pv.a0) / knife;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(52,36,12,0.62)';
        for (let j = (pv.a1 - pv.a0 >= TAU - 1e-6 ? 0 : 1); j < knife; j++) {
          const a = pv.a0 + j * span;
          ctx.beginPath();
          ctx.moveTo(pv.x + Math.cos(a) * 2, pv.y + Math.sin(a) * 2);
          ctx.lineTo(pv.x + Math.cos(a) * Math.max(0, pv.r - 1.5), pv.y + Math.sin(a) * Math.max(0, pv.r - 1.5));
          ctx.stroke();
        }
        ctx.restore();
      }
      if (dragged) {
        drawPiece(ctx, dragged, true);
        const tag = dragged.den === 1 ? '1 loaf' : `1/${dragged.den}`;
        ctx.font = `12px ${MONO_FAMILY}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = P.ink;
        ctx.fillText(tag, dragged.x, dragged.y - dragged.r - 8);
      }

      // the knife's stroke and a few crumbs
      if (cutFx) {
        const age = t - cutFx.t0;
        if (age >= 0.45 || age < 0) cutFx = null;
        else {
          const a = 1 - age / 0.45;
          ctx.strokeStyle = `rgba(232,200,124,${(0.9 * a).toFixed(3)})`;
          ctx.lineWidth = 1.5;
          for (const ang of cutFx.angles) {
            ctx.beginPath();
            ctx.moveTo(cutFx.x, cutFx.y);
            ctx.lineTo(cutFx.x + Math.cos(ang) * (cutFx.r + 6), cutFx.y + Math.sin(ang) * (cutFx.r + 6));
            ctx.stroke();
          }
          ctx.globalAlpha = a;
          for (const c of cutFx.crumbs) {
            const d = cutFx.r + c.v * age;
            crumbGlow.draw(ctx, cutFx.x + Math.cos(c.a) * d, cutFx.y + Math.sin(c.a) * d + 60 * age * age, 0.6);
          }
          ctx.globalAlpha = 1;
        }
      }

      // celebration rings
      if (pulses.length) {
        for (const pu of pulses) {
          for (let k = 0; k < 2; k++) {
            const age = t - pu.start - k * 0.18;
            if (age > 1 || age < 0 || reduce) continue;
            ctx.beginPath();
            ctx.ellipse(pu.x, pu.y, Math.max(0, geo.plateRx + 4 + age * 40), Math.max(0, geo.plateRy + 3 + age * 14), 0, 0, TAU);
            ctx.strokeStyle = `rgba(232,200,124,${((1 - age) * 0.7).toFixed(3)})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }
        pulses = pulses.filter((pu) => t - pu.start <= 1.2);
        if (!pulses.length) dirty = true;
      }

      // hover tooltip: the piece's size (touch users see it on the dragged piece)
      if (hp && pointerIn) {
        let tag = hp.den === 1 ? '1 loaf' : `1/${hp.den}`;
        if (hp.at === 'table') tag += hp.den * knife <= MAX_DEN ? ` → ${knife} × 1/${hp.den * knife}` : ' · too fine to cut';
        ctx.font = `12px ${MONO_FAMILY}`;
        const tw = ctx.measureText(tag).width;
        const tx = clamp(pointer[0] + 14, 4, W - tw - 10), ty = clamp(pointer[1] - 12, 14, H - 6);
        ctx.fillStyle = 'rgba(10,11,16,0.8)';
        ctx.fillRect(tx - 4, ty - 12, tw + 8, 17);
        ctx.fillStyle = P.ink;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(tag, tx, ty);
      }

      // transient note
      if (note) {
        ctx.font = `italic 13px ${SERIF}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = P.crimsonBright;
        ctx.fillText(note.text, W / 2, geo.bandB + 16);
      }
    }

    function roundRect(ctx, x, y, w, h, r) {
      w = Math.max(0, w); h = Math.max(0, h);
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function flash(text) { note = { text, until: lastT + 2.6 }; dirty = true; }

    function refuseSound() {
      audio.ensureAudio();
      audio.drums.thock(bus, now(), { level: 0.3 });
    }

    /* ---------- pointer interaction ---------- */

    function hitPiece(x, y) {
      let best = null;
      for (const p of pieces) {
        if (p.id === dragId) continue;
        const dx = x - p.x, dy = y - p.y;
        if (dx * dx + dy * dy > (p.r + 2) * (p.r + 2)) continue;
        if (p.a1 - p.a0 < TAU - 1e-6) {
          let a = Math.atan2(dy, dx);
          while (a < p.a0) a += TAU;
          while (a > p.a0 + TAU) a -= TAU;
          if (a > p.a1) continue;
        }
        if (!best || p.den > best.den) best = p;   // prefer the smaller piece (easier to grab slivers)
      }
      return best;
    }

    function hitWorker(x, y) {
      for (let j = 0; j < geo.workers.length; j++) {
        const wk = geo.workers[j];
        if (Math.abs(x - wk.x) < geo.ws / 2 && y > wk.plateY - geo.pieceR - geo.figH - 2 && y < wk.plateY + geo.plateRy + 30) return j;
      }
      return -1;
    }

    function onDown(e) {
      audio.ensureAudio();
      kbActive = false;
      const [x, y] = cv.pointerPos(handle, e);
      pointer = [x, y];
      pointerIn = e.pointerType === 'mouse';
      const p = hitPiece(x, y);
      if (p) {
        pending = { id: p.id, x0: x, y0: y };
        try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      dirty = true;
    }

    function onMove(e) {
      const [x, y] = cv.pointerPos(handle, e);
      pointer = [x, y];
      if (e.pointerType === 'mouse') pointerIn = true;
      if (pending && !dragId) {
        const dx = x - pending.x0, dy = y - pending.y0;
        if (dx * dx + dy * dy > 49) {
          dragId = pending.id;
          layoutDirty = true;
          audio.drums.wood(bus, now(), { level: 0.2, pitch: 340 });
        }
      }
      if (dragId) {
        dragOver = hitWorker(x, y);
        canvas.style.cursor = 'grabbing';
        dirty = true;
      } else {
        const p = hitPiece(x, y);
        const id = p ? p.id : 0;
        if (id !== hoverId || id) dirty = true;
        hoverId = id;
        canvas.style.cursor = p ? 'pointer' : 'default';
      }
    }

    function onUp(e) {
      const [x, y] = cv.pointerPos(handle, e);
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (dragId) {
        const p = pieces.find((q) => q.id === dragId);
        const w = hitWorker(x, y);
        dragId = 0; dragOver = -1;
        layoutDirty = true;
        if (p) {
          if (w >= 0) servePiece(p, w);
          else if (p.at === 'plate') returnPiece(p);
          else refresh();
        }
      } else if (pending) {
        const p = pieces.find((q) => q.id === pending.id);
        if (p) doCut(p);
      }
      pending = null;
      if (e.pointerType !== 'mouse') { hoverId = 0; pointerIn = false; }
      dirty = true;
    }

    function onCancel() { pending = null; dragId = 0; dragOver = -1; layoutDirty = true; dirty = true; }
    function onTouchStart(e) {
      if (e.touches.length !== 1) return;          // two fingers: let the page pinch
      const r = canvas.getBoundingClientRect(), tt = e.touches[0];
      if (hitPiece(tt.clientX - r.left, tt.clientY - r.top)) e.preventDefault();
    }
    function onLeave() { pointerIn = false; if (!dragId) { hoverId = 0; dirty = true; } }

    /* ---------- keyboard ---------- */

    function focusOrder() {
      return [...pieces.filter((p) => p.at === 'table'), ...pieces.filter((p) => p.at === 'plate').sort((a, b) => a.worker - b.worker || a.den - b.den)];
    }
    function onKey(e) {
      const order = focusOrder();
      if (!order.length) return;
      let fp = order.find((p) => p.id === focusId);
      if (!fp) { fp = order[0]; focusId = fp.id; }
      const k = e.key;
      let handled = true;
      audio.ensureAudio();
      if (k === 'ArrowRight' || k === 'ArrowDown') {
        focusId = order[(order.indexOf(fp) + 1) % order.length].id;
      } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
        focusId = order[(order.indexOf(fp) - 1 + order.length) % order.length].id;
      } else if (k === 'Enter' || k === ' ') {
        doCut(fp);
      } else if (/^[1-9]$/.test(k)) {
        const w = Number(k) - 1;
        if (w < deal.workers) {
          const nextTable = order.filter((p) => p.at === 'table' && p.id !== fp.id);
          servePiece(fp, w);
          if (nextTable.length) focusId = nextTable[0].id;
        } else handled = false;
      } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
        if (fp.at === 'plate') returnPiece(fp);
      } else if (k === 'u' || k === 'U' || ((e.metaKey || e.ctrlKey) && k === 'z')) {
        undo();
      } else handled = false;
      if (handled) { e.preventDefault(); kbActive = true; dirty = true; }
    }
    const onFocus = () => { hasFocus = true; dirty = true; };
    const onBlur = () => { hasFocus = false; dirty = true; };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('focus', onFocus);
    canvas.addEventListener('blur', onBlur);
    handle.onResize(() => {
      const prevW = geo.W;
      geo = stageLayout(handle.width, deal.loaves, deal.workers, { ghosts: phase === 'challenge' });
      layoutDirty = true;
      dirty = true;
      if (prevW !== geo.W) {
        // snap pieces to their new homes rather than sliding across the table
        layoutTargets();
        for (const p of pieces) { p.x = p.tx; p.y = p.ty; p.r = p.tr; p.a0 = p.ta0; p.a1 = p.ta1; }
      }
    });

    /* ---------- boot ---------- */

    startQuest(0);
    setES(esN);
    showTableRow();
    const loop = cv.rafLoop(draw);
    loop.start();

    return {
      pause() { loop.stop(); bus.mute(); },
      resume() { bus.unmute(); dirty = true; loop.start(); },
      destroy() {
        loop.stop();
        bus.dispose();
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion);
        chart.canvas.removeEventListener('pointerdown', onChartPick);
        strip.canvas.removeEventListener('pointerdown', onStripPick);
        handle.destroy(); chart.destroy(); strip.destroy();
        style.remove();
      },
    };
  },
};

/* ---------- pure exports for node tests ---------- */

export const _test = {
  greedyExpand, checkFairness, verifyExpansion,
  AHMES_TABLE, selfCheckTable, erdosStraus, greedyNarrative,
  // added in the 2026 expansion
  esSolve, tableStats, raceOutcome, bestKnifeDeal, stageLayout, egyptianNumeralSVG,
  MORDELL_CLASSES, MORDELL_PRIMES, selfTest,
};
