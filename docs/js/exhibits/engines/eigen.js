// IV.5 — 0.85
// Repetition is a filter. Apply one linear map again and again and every
// direction dies at the rate of its eigenvalue except one. Three instruments:
//   · the ladder — Theon's side-and-diameter rule as a 2×2 matrix sweeping
//     every direction of the plane onto its eigenvector (and φ's twin);
//   · the web   — PageRank by real power iteration with damping d on an
//     editable little web: exact π, the live spectrum of the Google matrix,
//     the error against the 2·dᵏ bound, and a random surfer;
//   · the drum  — the same web as springs: graph-Laplacian modes, the Fiedler
//     vector's nodal cut, and a strike that sounds √λ.
//
// Conventions: edges are [from, to]. S is column-stochastic, row-major in a
// Float64Array, S[i·n + j] = P(j → i). A page with no out-links gets the
// uniform column 1/n (Moler, EXM ch. 7), which reproduces Moler's published
// ranks. Self-links and duplicates are ignored (Bryan & Leise: "you don't get
// to vote for yourself"). The damping is called d, as Brin & Page wrote it.

/* ======================= pure core (node-testable) ======================= */

export function outLists(n, edges) {
  const out = Array.from({ length: n }, () => []);
  const seen = new Set();
  for (const [a, b] of edges) {
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) continue;
    const key = a * 64 + b;
    if (seen.has(key)) continue;
    seen.add(key); out[a].push(b);
  }
  for (const o of out) o.sort((p, q) => p - q);
  return out;
}

export function linkMatrix(n, edges) {
  const out = outLists(n, edges), S = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    const d = out[j].length;
    if (!d) for (let i = 0; i < n; i++) S[i * n + j] = 1 / n;
    else for (const i of out[j]) S[i * n + j] = 1 / d;
  }
  return S;
}

// A weighted chain (Markov's own letter counts): column j normalised by its sum.
export function chainMatrix(n, wedges) {
  const S = new Float64Array(n * n), tot = new Float64Array(n);
  for (const [a, b, w] of wedges) { S[b * n + a] += w; tot[a] += w; }
  for (let j = 0; j < n; j++) {
    if (tot[j] > 0) for (let i = 0; i < n; i++) S[i * n + j] /= tot[j];
    else for (let i = 0; i < n; i++) S[i * n + j] = 1 / n;
  }
  return S;
}

export const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
export const uniform = (n) => new Float64Array(n).fill(1 / n);
export const basis = (n, i) => { const e = new Float64Array(n); e[i] = 1; return e; };

// One click of the power method, never forming G:  x′ = d·S·x + (1 − d)·v.
export function googleStep(S, x, alpha, v = null) {
  const n = x.length, y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += S[i * n + j] * x[j];
    y[i] = alpha * s + (1 - alpha) * (v ? v[i] : 1 / n);
  }
  return y;
}

export function pagerankPower(S, n, alpha, { x0 = null, v = null, tol = 1e-10, maxIter = 10000 } = {}) {
  let x = x0 ? Float64Array.from(x0) : uniform(n);
  const residuals = [];
  for (let k = 1; k <= maxIter; k++) {
    const y = googleStep(S, x, alpha, v);
    const r = l1(x, y);
    residuals.push(r);
    x = y;
    if (r < tol) return { x, iters: k, residuals };
  }
  return { x, iters: maxIter, residuals };
}

// Dense Gaussian elimination with partial pivoting.
export function solve(A, b, n) {
  A = Float64Array.from(A); b = Float64Array.from(b);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) {
      for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; }
      const t = b[c]; b[c] = b[p]; b[p] = t;
    }
    const d = A[c * n + c];
    if (d === 0) continue;
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    x[r] = A[r * n + r] ? s / A[r * n + r] : 0;
  }
  return x;
}

// Exact PageRank for d < 1: (I − dS)π = (1 − d)v.
export function pagerankExact(S, n, alpha, v = null) {
  const A = new Float64Array(n * n), b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i * n + j] = (i === j ? 1 : 0) - alpha * S[i * n + j];
    b[i] = (1 - alpha) * (v ? v[i] : 1 / n);
  }
  return solve(A, b, n);
}

// d = 1: the limit may depend on the start (islands) or never arrive (rings).
// The honest "where it goes" is the Cesàro average after a burn-in; averaging
// over 2520 = lcm(1…10) clicks cancels every period a small web can have.
export function cesaroLimit(S, n, x0, burn = 3000, avg = 2520) {
  let x = Float64Array.from(x0);
  for (let k = 0; k < burn; k++) x = googleStep(S, x, 1);
  const acc = new Float64Array(n);
  for (let k = 0; k < avg; k++) { x = googleStep(S, x, 1); for (let i = 0; i < n; i++) acc[i] += x[i]; }
  for (let i = 0; i < n; i++) acc[i] /= avg;
  return acc;
}

export function googleMatrix(S, n, alpha, v = null) {
  const G = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    G[i * n + j] = alpha * S[i * n + j] + (1 - alpha) * (v ? v[i] : 1 / n);
  return G;
}

// Faddeev–LeVerrier: monic characteristic polynomial, c[0] = 1.
export function charPoly(A, n) {
  const c = new Float64Array(n + 1); c[0] = 1;
  let M = new Float64Array(n * n);
  for (let k = 1; k <= n; k++) {
    const AM = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += A[i * n + t] * M[t * n + j];
      AM[i * n + j] = s + (i === j ? c[k - 1] : 0);
    }
    M = AM;
    let tr = 0;
    for (let i = 0; i < n; i++) for (let t = 0; t < n; t++) tr += A[i * n + t] * M[t * n + i];
    c[k] = -tr / k;
  }
  return c;
}

// Aberth–Ehrlich simultaneous root finder; roots as complex pairs [re, im].
export function polyRoots(c, iters = 500) {
  const n = c.length - 1;
  if (n < 1) return [];
  const ev = (z) => {
    let pr = 1, pi = 0, dr = 0, di = 0;
    for (let k = 1; k <= n; k++) {
      const ndr = dr * z[0] - di * z[1] + pr, ndi = dr * z[1] + di * z[0] + pi;
      dr = ndr; di = ndi;
      const npr = pr * z[0] - pi * z[1] + c[k], npi = pr * z[1] + pi * z[0];
      pr = npr; pi = npi;
    }
    return [pr, pi, dr, di];
  };
  let bound = 0; for (let k = 1; k <= n; k++) bound = Math.max(bound, Math.abs(c[k]));
  const R = 1 + bound;
  const z = Array.from({ length: n }, (_, k) => [R * 0.5 * Math.cos(2 * Math.PI * k / n + 0.4), R * 0.5 * Math.sin(2 * Math.PI * k / n + 0.4)]);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let k = 0; k < n; k++) {
      const [pr, pi, dr, di] = ev(z[k]);
      const den = dr * dr + di * di;
      if (den === 0) continue;
      const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
      let sr = 0, si = 0;
      for (let j = 0; j < n; j++) if (j !== k) {
        const ar = z[k][0] - z[j][0], ai = z[k][1] - z[j][1], d2 = ar * ar + ai * ai || 1e-300;
        sr += ar / d2; si += -ai / d2;
      }
      const tr = 1 - (qr * sr - qi * si), ti = -(qr * si + qi * sr), t2 = tr * tr + ti * ti || 1e-300;
      const wr = (qr * tr + qi * ti) / t2, wi = (qi * tr - qr * ti) / t2;
      z[k][0] -= wr; z[k][1] -= wi;
      moved = Math.max(moved, Math.hypot(wr, wi));
    }
    if (moved < 1e-15) break;
  }
  return z;
}

// Display-ready spectrum: tiny roots snapped to 0 (a defective zero splits
// into a ring of radius ≈ ε^(1/m)), sorted by modulus, ties by argument.
export function spectrum(A, n) {
  const roots = polyRoots(charPoly(A, n));
  for (const r of roots) {
    if (Math.hypot(r[0], r[1]) < 0.02) { r[0] = 0; r[1] = 0; }
    if (Math.abs(r[1]) < 1e-6) r[1] = 0;
  }
  const arg = (r) => { const a = Math.atan2(r[1], r[0]); return a < 0 ? a + 2 * Math.PI : a; };
  roots.sort((a, b) => {
    const d = Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]);
    return Math.abs(d) > 1e-7 ? d : arg(a) - arg(b);
  });
  return roots;
}

// |λ₂|: the largest modulus once one copy of the eigenvalue 1 is set aside.
export function secondModulus(roots) {
  let skipped = false, best = 0;
  for (const r of roots) {
    if (!skipped && Math.hypot(r[0] - 1, r[1]) < 1e-6) { skipped = true; continue; }
    best = Math.max(best, Math.hypot(r[0], r[1]));
  }
  return best;
}
export const multiplicityOfOne = (roots) => roots.filter((r) => Math.hypot(r[0] - 1, r[1]) < 1e-5).length;

// Clicks until the bound 2·rateᵏ falls below tol.
export const clicksTo = (rate, tol = 1e-6) => (rate >= 1 ? Infinity : rate <= 0 ? 1 : Math.ceil(Math.log(tol / 2) / Math.log(rate)));

/* ---------- the drum: the undirected graph Laplacian L = D − A ---------- */

export function undirectedEdges(n, edges) {
  const seen = new Set(), out = [];
  for (let [a, b] of edges) {
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) continue;
    if (a > b) [a, b] = [b, a];
    const key = a * 64 + b;
    if (seen.has(key)) continue;
    seen.add(key); out.push([a, b]);
  }
  return out;
}

export function laplacian(n, edges) {
  const L = new Float64Array(n * n);
  for (const [a, b] of undirectedEdges(n, edges)) {
    L[a * n + b] -= 1; L[b * n + a] -= 1; L[a * n + a] += 1; L[b * n + b] += 1;
  }
  return L;
}

// Cyclic Jacobi rotations for a symmetric matrix; eigenvalues ascending.
export function jacobiEigen(Ain, n, sweeps = 60) {
  const A = Float64Array.from(Ain), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let s = 0; s < sweeps; s++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const th = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - sn * akq; A[k * n + q] = sn * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - sn * aqk; A[q * n + k] = sn * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k * n + p], vkq = V[k * n + q];
        V[k * n + p] = c * vkp - sn * vkq; V[k * n + q] = sn * vkp + c * vkq;
      }
    }
  }
  const idx = [...Array(n).keys()].sort((a, b) => A[a * n + a] - A[b * n + b]);
  return {
    values: idx.map((i) => (Math.abs(A[i * n + i]) < 1e-12 ? 0 : A[i * n + i])),
    vectors: idx.map((i) => Array.from({ length: n }, (_, k) => V[k * n + i])),
  };
}

// The web as springs. Each vector's sign is fixed (first clear entry positive)
// so the colours do not flicker from one edit to the next.
export function drumModes(n, edges) {
  const { values, vectors } = jacobiEigen(laplacian(n, edges), n);
  for (const v of vectors) {
    const k = v.findIndex((x) => Math.abs(x) > 1e-6);
    if (k >= 0 && v[k] < 0) for (let i = 0; i < n; i++) v[i] = -v[i];
  }
  const l2 = n > 1 ? values[1] : 0;
  const connected = l2 > 1e-9;
  const degenerate = n > 2 && connected && Math.abs(values[2] - l2) < 1e-7;
  return { values, vectors, lambda2: l2, fiedler: n > 1 ? vectors[1] : [0], connected, degenerate };
}

// A strike at `node`: mode k ≥ 2 sounds at base·√(λ_k/λ₂) Hz with amplitude
// ∝ |u_k(node)|, normalised to the loudest (the chladni.js strike rule).
// λ₁ = 0 is rigid drift and stays silent.
export function strikePartials(modes, node, base = 110, maxHz = 1800) {
  const { values, vectors, lambda2 } = modes;
  if (!(lambda2 > 1e-9)) return [];
  const out = [];
  for (let k = 1; k < values.length; k++) {
    const f = base * Math.sqrt(values[k] / lambda2);
    const a = Math.abs(vectors[k][node]);
    if (f <= maxHz && a > 1e-6) out.push({ k, f, a });
  }
  const mx = Math.max(0, ...out.map((p) => p.a));
  if (mx <= 0) return [];
  for (const p of out) p.a /= mx;
  return out;
}

/* ---------- Theon's ladder and Fibonacci's ---------- */

export function iterate2(M, v, k) {
  const out = [v.slice()];
  for (let i = 0; i < k; i++) { v = [M[0] * v[0] + M[1] * v[1], M[2] * v[0] + M[3] * v[1]]; out.push(v.slice()); }
  return out;
}
export function eig2(M) {
  const tr = M[0] + M[3], det = M[0] * M[3] - M[1] * M[2];
  const disc = Math.sqrt(tr * tr / 4 - det);
  const l1v = tr / 2 + disc, l2v = tr / 2 - disc;
  const vec = (l) => { const x = M[1], y = l - M[0]; const h = Math.hypot(x, y); return [x / h, y / h]; };
  return { l1: l1v, l2: l2v, v1: vec(l1v), v2: vec(l2v), det };
}
// Direction (angle in [0, π)) after one application of M.
export function mapDirection(M, a) {
  const x = Math.cos(a), y = Math.sin(a);
  let b = Math.atan2(M[2] * x + M[3] * y, M[0] * x + M[1] * y);
  if (b < 0) b += Math.PI;
  if (b >= Math.PI) b -= Math.PI;
  return b;
}

/* ---------- the random surfer ---------- */

// Dossier form (out-lists, uniform teleport). RNG order is fixed for seeded
// anchors: if out-degree > 0, u1 (follow if u1 < d) then u2 picks the link;
// otherwise one draw picks the teleport target.
export function surferHop(outAdj, n, at, alpha, rand = Math.random, v = null) {
  const outs = outAdj[at];
  if (outs.length && rand() < alpha) return { to: outs[Math.floor(rand() * outs.length)], teleport: false };
  if (v) {
    let u = rand(), acc = 0;
    for (let i = 0; i < n; i++) { acc += v[i]; if (u < acc) return { to: i, teleport: true }; }
    return { to: n - 1, teleport: true };
  }
  return { to: Math.floor(rand() * n), teleport: true };
}

// The general walk the exhibit runs: it follows the columns of S itself, so
// weighted chains and personalised jumps sample exactly G = dS + (1 − d)v1ᵀ.
// With uniform v and plain links it draws the same numbers as surferHop.
export function surferStep(S, n, at, alpha, rand = Math.random, v = null, dangling = null) {
  const pick = (u, w) => { let acc = 0; for (let i = 0; i < n; i++) { acc += w(i); if (u < acc) return i; } return n - 1; };
  const jump = (u) => (v ? pick(u, (i) => v[i]) : Math.min(n - 1, Math.floor(u * n)));
  if (!(dangling && dangling[at])) {
    if (rand() < alpha) return { to: pick(rand(), (i) => S[i * n + at]), teleport: false };
    return { to: jump(rand()), teleport: true };
  }
  if (!v) return { to: Math.floor(rand() * n), teleport: true };
  if (rand() < alpha) return { to: Math.floor(rand() * n), teleport: true };
  return { to: jump(rand()), teleport: true };
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the quest ---------- */

export function inDegrees(n, edges) {
  const d = new Array(n).fill(0), out = outLists(n, edges);
  for (let j = 0; j < n; j++) for (const i of out[j]) d[i]++;
  return d;
}
// Won when a page with the fewest incoming links ranks strictly first while
// some other page has more incoming links than it.
export function questWon(n, edges, pi) {
  if (n < 3) return false;
  let top = 0;
  for (let i = 1; i < n; i++) if (pi[i] > pi[top]) top = i;
  for (let i = 0; i < n; i++) if (i !== top && pi[i] > pi[top] - 1e-9) return false;
  const d = inDegrees(n, edges), lo = Math.min(...d);
  return d[top] === lo && d.some((x) => x > lo);
}

/* ======================= presets ======================= */

const MOLER_EDGES = [[0, 1], [0, 5], [1, 2], [1, 3], [2, 3], [2, 4], [2, 5], [3, 0], [5, 0]];
const BL_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 0], [3, 0], [3, 2]];
// Markov 1913: V→V 1104, V→C 8638 − 1104 = 7534, C→C 11,361 − 7534 = 3827.
const ONEGIN_WEDGES = [[0, 0, 1104], [0, 1, 7534], [1, 0, 7534], [1, 1, 3827]];
const RING5 = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]];
const TRAP_EDGES = [[0, 1], [0, 2], [1, 2], [2, 0], [2, 3], [3, 4], [4, 3]];
const ISLAND_EDGES = [[0, 1], [1, 0], [2, 3], [3, 2]];
// The presets use aperiodic versions (a triangle with one chord), so that at
// d = 1 the trap drains and the islands settle instead of flickering with
// period 2; the dossier's anchors above are still tested.
const TRAP6 = [[0, 1], [0, 2], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 3], [3, 5]];
const ISLANDS6 = [[0, 1], [1, 2], [2, 0], [0, 2], [3, 4], [4, 5], [5, 3], [3, 5]];
const LETTERS = 'ABCDEFGHIJKL';

const WEB_PRESETS = {
  moler: {
    label: 'Moler’s tiny web', d: 0.85, n: 6, names: [...'ABCDEF'], edges: MOLER_EDGES,
    pos: [[0.10, 0.50], [0.38, 0.12], [0.62, 0.42], [0.36, 0.86], [0.92, 0.18], [0.80, 0.84]],
  },
  bl: {
    label: 'Bryan & Leise’s four pages', d: 0.85, n: 4, names: ['1', '2', '3', '4'], edges: BL_EDGES,
    pos: [[0.18, 0.22], [0.82, 0.20], [0.20, 0.80], [0.80, 0.80]],
  },
  onegin: {
    label: 'Markov’s Onegin (two states)', d: 1, n: 2, names: ['V', 'C'], subs: ['vowel', 'consonant'],
    wedges: ONEGIN_WEDGES, locked: true, pos: [[0.22, 0.56], [0.78, 0.56]],
  },
  ring: {
    label: 'a ring of five', d: 1, n: 5, names: [...'ABCDE'], edges: RING5,
    pos: [0, 1, 2, 3, 4].map((k) => [0.5 + 0.44 * Math.sin(2 * Math.PI * k / 5), 0.5 - 0.44 * Math.cos(2 * Math.PI * k / 5)]),
  },
  trap: {
    label: 'a spider trap', d: 1, n: 6, names: [...'ABCDEF'], edges: TRAP6,
    pos: [[0.06, 0.24], [0.16, 0.82], [0.38, 0.44], [0.70, 0.18], [0.96, 0.50], [0.72, 0.84]],
  },
  islands: {
    label: 'two islands', d: 1, n: 6, names: [...'ABCDEF'], edges: ISLANDS6,
    pos: [[0.04, 0.20], [0.32, 0.50], [0.06, 0.84], [0.96, 0.20], [0.68, 0.50], [0.94, 0.84]],
  },
};

function drumPreset(key, web) {
  if (key === 'string') {
    const n = 8;
    return { n, names: [...'ABCDEFGH'], edges: [...Array(n - 1).keys()].map((i) => [i, i + 1]), fit: 'wide',
      pos: [...Array(n).keys()].map((i) => [i / (n - 1), 0.5]) };
  }
  if (key === 'ring') {
    const n = 8;
    return { n, names: [...'ABCDEFGH'], edges: [...Array(n).keys()].map((i) => [i, (i + 1) % n]), fit: 'square',
      pos: [...Array(n).keys()].map((k) => [0.5 + 0.46 * Math.sin(2 * Math.PI * k / n), 0.5 - 0.46 * Math.cos(2 * Math.PI * k / n)]) };
  }
  if (key === 'barbell') {
    const edges = [];
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { edges.push([a, b]); edges.push([a + 4, b + 4]); }
    edges.push([3, 4]);
    const L = (cx, a) => [cx + 0.17 * Math.cos(a), 0.5 - 0.30 * Math.sin(a)];
    const pos = [L(0.2, Math.PI / 2), L(0.2, Math.PI), L(0.2, -Math.PI / 2), L(0.2, 0),
      L(0.8, Math.PI), L(0.8, Math.PI / 2), L(0.8, 0), L(0.8, -Math.PI / 2)];
    return { n: 8, names: [...'ABCDEFGH'], edges, pos, fit: 'wide' };
  }
  return { n: web.n, names: web.names.slice(), edges: web.edges ? web.edges.slice() : [[0, 1]], pos: web.pos.map((p) => p.slice()), fit: 'square' };
}

/* ======================= the essay ======================= */

export default {
  id: 'eigen',
  movement: 4,
  title: '0.85',
  hook: 'Pour all the importance onto one page and let it flow along the links. Each click keeps at most 0.85 of its memory of where it began, and what survives is the web’s own eigenvector.',
  era: '1873 – today · chess tables, Pushkin’s vowels, the Web',
  prose: `
    <p>Repetition is a filter. The side-and-diameter numbers that Theon of Smyrna recorded
    some nineteen centuries ago climb by one fixed rule, (q, p) → (q + p, 2q + p), and a rule
    of that kind is a matrix: it stretches some directions of the plane and squeezes others.
    Apply it again and again and every starting direction is swept onto the one it stretches
    most, the line p = √2·q. That surviving line is the matrix’s <em>eigenvector</em>, from
    the German <em>eigen</em>, “own”, which David Hilbert attached to such quantities in 1904,
    and its stretch, 1 + √2, is the eigenvalue. The only other direction the matrix keeps is
    multiplied by 1 − √2 at every rung, shrinking and changing sign. That minus sign is why
    the meter p² − 2q² flipped between −1 and +1 in <a href="#ex-diagonal">the diagonal’s
    hunt</a>, and its size, set against the stretch of 1 + √2, is why each rung lands about
    5.83 times closer to √2 than the last.</p>
    <p>Andrei Markov came to the same arithmetic by way of a quarrel. His Moscow rival
    Pavel Nekrasov had claimed in 1902 that “independence is a necessary condition for the law
    of large numbers”; Markov’s answer, a paper dated 1906, tied each trial to the one before
    it in a chain and showed that the averages settle all the same. On 23 January 1913 he laid
    a chain over Pushkin. He took 20,000 letters of <em>Eugene Onegin</em>, the whole first
    chapter and sixteen stanzas of the second, and counted 8,638 vowels. A vowel followed a
    vowel with probability 0.128 and followed a consonant with probability 0.663. Those two
    numbers define a two-state chain whose eigenvector predicts that 43.2 per cent of the
    letters are vowels, as he had counted. Markov also printed their difference,
    δ = 0.128 − 0.663 = −0.535. It is the chain’s second eigenvalue, and it is negative for
    Theon’s reason: vowels and consonants prefer to alternate, so the chain overshoots its
    balance and swings back.</p>
    <p>In April 1998, at the Seventh World Wide Web Conference in Brisbane, two Stanford
    graduate students, Sergey Brin and Lawrence Page, described a search engine whose
    prototype held at least 24 million pages. Its ranking rested on a circular definition,
    that a page is important when important pages link to it, and a circular definition is
    exactly what an eigenvector resolves. They imagined a “random surfer” who “keeps clicking
    on links, never hitting ‘back’ but eventually gets bored and starts on another random
    page.” The share of time the surfer spends on a page is its PageRank, which, they wrote,
    “corresponds to the principal eigenvector of the normalized link matrix of the Web.” A
    link is a vote, split among the voter’s links and weighted by the voter’s own rank. In
    Cleve Moler’s six-page teaching web below, pages A, D and F each have two incoming links,
    and they settle at 0.321, 0.137 and 0.201.</p>
    <p>The boredom is not decoration: without it the arithmetic breaks. On a ring of pages
    the rank circulates forever, and Georg Frobenius explained why in 1912. A chain that
    cycles with period h has h eigenvalues on the unit circle, spaced like the h-th roots of
    unity, and none of them ever fades. A cluster of pages that link only among themselves
    swallows everything that enters, and two separate islands leave the eigenvalue 1
    doubled, so the ranking depends on where you start. “We usually set d to 0.85,” Brin and Page wrote, so
    that 15 per cent of the time the surfer jumps anywhere at all. Every entry of the matrix
    is then positive, and a theorem Oskar Perron proved in 1907, whose origins the historian
    Thomas Hawkins traced to continued fractions, guarantees a single ranking with every page
    above zero. Each click then shrinks the distance from that ranking by at least the
    factor d, and in 2003 Taher Haveliwala and Sepandar Kamvar showed why, on the real Web,
    it does no better in the long run: every eigenvalue but the first has modulus at most d,
    and exactly d on any web that, like the real one, holds two or more islands that no link
    leaves.</p>
    <p><a href="#ex-chladni">Chladni’s sand</a> gathered on the still lines of an
    eigenfunction of a vibrating plate; the surfer’s footprints gather on an eigenvector of
    the web. The two are cousins rather than twins, since a plate belongs to a symmetric
    operator and a web to a lopsided one, but turn every link into a spring and the web
    becomes a drum in earnest. Its overtones are the square roots of the eigenvalues of the
    graph’s Laplacian, and its second eigenvector, studied by Miroslav Fiedler in 1973 and
    1975, changes sign across a nodal line that tends to cut the network where it is
    thinnest. A path of springs is a string again, and that vector is its fundamental, a
    sampled cosine.</p>
    <p>The idea would not stay invented. The Austrian chess player Oscar Gelbfuhs re-scored
    tournaments by iteration in 1873. Edmund Landau, not yet twenty, proposed the fixed point
    itself in 1895, in his first published paper. John R. Seeley found it again in 1949
    without knowing of Landau, Teh-Hsing Wei again in a Cambridge dissertation of 1952; Leo
    Katz damped it in 1953, and Gabriel Pinski and Francis Narin ranked physics journals with
    it in 1976, all before there was a Web to rank. Each of them let the scores vote for one
    another, and each arrived at a ranking that the votes themselves confirm.</p>`,

  chronicle: [
    { year: 1873, date: '1873', text: 'The Austrian chess player Oscar Gelbfuhs proposes re-scoring a tournament by iteration: each player is credited with the scores of the players they beat, half for draws, and the procedure is repeated.' },
    { year: 1895, date: '1895', text: 'In his first published paper, Edmund Landau, not yet twenty, proposes ranking chess players by the fixed point of that iteration, an eigenvector.' },
    { year: 1907, date: 'June 1907', text: 'Oskar Perron proves in <em>Mathematische Annalen</em> that a matrix of positive numbers has a single largest eigenvalue, real and positive, with an eigenvector whose entries are all positive.' },
    { year: 1913, date: '23 January 1913', text: 'Andrei Markov tells the St Petersburg Academy of Sciences that in 20,000 letters of Pushkin’s <em>Eugene Onegin</em> a vowel follows a vowel with probability 0.128 and a consonant with probability 0.663, now remembered as the first application of his chains.' },
    { year: 1953, date: 'March 1953', text: 'Leo Katz’s “status index” counts every chain of choices leading to a person, each step discounted by a constant factor: an ancestor of PageRank’s damping.' },
    { year: 1998, date: 'April 1998', text: 'In Brisbane, Sergey Brin and Lawrence Page describe Google. Its PageRank “corresponds to the principal eigenvector of the normalized link matrix of the Web,” with a damping factor d usually set to 0.85.' },
    { year: 2003, date: '2003', text: 'Taher Haveliwala and Sepandar Kamvar prove that every eigenvalue of the Google matrix other than 1 has modulus at most the damping factor, and exactly that value whenever the web holds two or more separate clusters of pages that no link leaves.' },
    { year: 2025, date: 'December 2025', text: 'Google’s guide to its ranking systems, updated on 10 December 2025, says PageRank “has evolved a lot” since launch and “continues to be part of our core ranking systems.”' },
  ],

  today: `
    <p>PageRank is one ranking system among many inside Google search, and Google says so. Its guide to
    ranking systems, updated in December 2025, lists PageRank among its link-analysis systems
    as one of the “core ranking systems used when Google first launched,” notes that it “has
    evolved a lot since then,” and says that it “continues to be part of our core ranking
    systems.” In May 2002 the matrix already had about 2.7 billion rows and was recomputed
    about once a month; Cleve Moler called it “the world’s largest matrix computation.”</p>
    <p>The personalized walk, in which boredom always leads home, runs in recommendation.
    Twitter’s Who to Follow service, launched in the summer of 2010, built each user’s
    “circle of trust” from “an egocentric random walk (similar to personalized PageRank)”,
    as its engineers described it in 2013, over a graph that by August 2012 held more than
    20 billion edges among active users.
    David Gleich’s 2015 survey finds PageRank in bibliometrics, road networks, biology,
    chemistry, neuroscience and physics.</p>
    <p>Other eigenvectors do other work. The top two principal components of the genotypes
    of 1,387 Europeans redraw the map of Europe, and a person’s DNA can place their origin
    “often to within a few hundred kilometres” (Novembre and colleagues, 2008). The
    eigenvector with the second smallest eigenvalue of a graph of pixels cuts a photograph
    into regions (Shi and Malik, 2000), and the graph convolutional network of Thomas Kipf
    and Max Welling (2017), a neural network that learns on graphs, was motivated as “a
    localized first-order approximation of spectral graph convolutions”, filters defined on
    the eigenvectors of a graph’s Laplacian.</p>`,

  sources: [
    { text: 'Sergey Brin &amp; Lawrence Page, “The Anatomy of a Large-Scale Hypertextual Web Search Engine”, <em>Computer Networks and ISDN Systems</em> 30 (1998) 107–117', url: 'https://snap.stanford.edu/class/cs224w-readings/Brin98Anatomy.pdf' },
    { text: 'A. A. Markov, “An Example of Statistical Investigation of the Text <em>Eugene Onegin</em> Concerning the Connection of Samples in Chains” (1913), trans. Gloria Custance &amp; David Link, <em>Science in Context</em> 19 (2006) 591–600', url: 'https://doi.org/10.1017/S0269889706001074' },
    { text: 'G. P. Basharin, A. N. Langville &amp; V. A. Naumov, “The life and work of A. A. Markov”, <em>Linear Algebra and its Applications</em> 386 (2004) 3–26', url: 'https://doi.org/10.1016/j.laa.2003.12.041' },
    { text: 'Oskar Perron, “Zur Theorie der Matrices”, <em>Mathematische Annalen</em> 64 (1907) 248–263', url: 'https://doi.org/10.1007/BF01449896' },
    { text: 'Thomas Hawkins, “Continued fractions and the origins of the Perron–Frobenius theorem”, <em>Archive for History of Exact Sciences</em> 62 (2008) 655–717', url: 'https://doi.org/10.1007/s00407-008-0026-x' },
    { text: 'Taher H. Haveliwala &amp; Sepandar D. Kamvar, “The Second Eigenvalue of the Google Matrix”, Stanford University technical report (2003)', url: 'https://nlp.stanford.edu/pubs/secondeigenvalue.pdf' },
    { text: 'Kurt Bryan &amp; Tanya Leise, “The $25,000,000,000 Eigenvector: The Linear Algebra behind Google”, <em>SIAM Review</em> 48 (2006) 569–581', url: 'https://www.rose-hulman.edu/~bryan/googleFinalVersionFixed.pdf' },
    { text: 'Cleve Moler, <em>Experiments with MATLAB</em>, chapter 7, “Google PageRank” (2011)', url: 'https://www.mathworks.com/moler/exm/chapters/pagerank.pdf' },
    { text: 'Sebastiano Vigna, “Spectral Ranking”, <em>Network Science</em> 4 (2016) 433–445; revised as arXiv:0912.0238 (2019)', url: 'https://arxiv.org/abs/0912.0238' },
    { text: 'Google Search Central, “A guide to Google Search ranking systems” (updated 10 December 2025)', url: 'https://developers.google.com/search/docs/appearance/ranking-systems-guide' },
  ],

  alt: 'A small web of pages drawn as gold discs whose areas are their ranks, joined by curved links along which particles of rank flow, beside the eigenvalues of the Google matrix, a plot of the error shrinking click by click, and a strip comparing the ranks with a random surfer’s visits; two more tabs show Theon’s ladder as a matrix sweeping every direction onto one line, and the web as a drum of springs split by its Fiedler vector.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const VG = P.verdigris, CRB = P.crimsonBright, GHOST = P.inkGhost;
    // '#rrggbb' → [r, g, b], and back to an rgba() string at a given alpha
    const rgbOf = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    const rgba = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;
    const SERIF = (getComputedStyle(document.body).fontFamily || '').trim() || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const TAU = 2 * Math.PI;
    const bus = audio.createBus('eigen');
    const preexisting = new Set(stage.children);   // destroy() removes only what init added
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

    /* ---------------- scoped style ---------------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-eigen .eg-tabs{display:flex;flex-wrap:wrap;gap:.45rem;margin:0 0 .8rem;}
      #ex-eigen .eg-tabs .btn{letter-spacing:.04em;}
      #ex-eigen .eg-tabs .btn.active{border-color:${VG};color:${P.ink};background:${rgba(VG, 0.13)};}
      #ex-eigen .eg-grid{display:grid;grid-template-columns:minmax(0,1.72fr) minmax(0,1fr);
        grid-template-rows:254px 254px 100px;gap:8px;}
      #ex-eigen .eg-cell{min-width:0;position:relative;}
      #ex-eigen .eg-main{grid-row:1 / 3;}
      #ex-eigen .eg-strip{grid-column:1 / -1;}
      #ex-eigen .eg-side canvas,#ex-eigen .eg-strip canvas{touch-action:pan-y;}
      #ex-eigen .eg-main canvas{cursor:crosshair;}
      #ex-eigen .eg-main.eg-still canvas{cursor:default;touch-action:pan-y;}
      #ex-eigen .readout{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:.7rem;line-height:1.6;min-height:3.3em;}
      #ex-eigen .eg-ctl[hidden]{display:none!important;}
      #ex-eigen .eg-ctl .controls{margin:.8rem 0 .2rem;}
      #ex-eigen .eg-main canvas:focus{outline:none;}
      #ex-eigen .eg-main canvas:focus-visible{outline:1px dashed ${P.goldDim};outline-offset:-3px;}
      #ex-eigen .eg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}
      @media (max-width:760px){
        #ex-eigen .eg-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:340px 210px 100px;}
        #ex-eigen .eg-main{grid-row:auto;grid-column:1 / -1;}
      }
      @media (max-width:520px){
        #ex-eigen .eg-grid{grid-template-columns:minmax(0,1fr);grid-template-rows:330px 220px 200px 112px;}
      }`;
    stage.appendChild(style);

    /* ---------------- layout ---------------- */
    const quest = ui.questBanner(stage, '');
    const tabRow = document.createElement('div');
    tabRow.className = 'eg-tabs';
    stage.appendChild(tabRow);
    const grid = document.createElement('div');
    grid.className = 'eg-grid';
    stage.appendChild(grid);
    const cell = (cls) => { const d = document.createElement('div'); d.className = 'eg-cell ' + cls; grid.appendChild(d); return d; };
    const cMain = cell('eg-main'), cS1 = cell('eg-side'), cS2 = cell('eg-side'), cStrip = cell('eg-strip');
    const hMain = cv.setupCanvas(cMain), hS1 = cv.setupCanvas(cS1), hS2 = cv.setupCanvas(cS2), hStrip = cv.setupCanvas(cStrip);
    hMain.canvas.setAttribute('role', 'img');
    for (const h of [hS1, hS2, hStrip]) h.canvas.setAttribute('aria-hidden', 'true');

    const ctlBox = (m) => { const d = document.createElement('div'); d.className = 'eg-ctl'; d.dataset.mode = m; stage.appendChild(d); return d; };
    const ctlLadder = ctlBox('ladder'), ctlWeb = ctlBox('web'), ctlDrum = ctlBox('drum');
    const info = ui.readout(stage, '');
    const cap = ui.caption(stage, '');

    let mode = 'web';
    const dirty = { main: true, s1: true, s2: true, strip: true };
    const dirtyAll = () => { dirty.main = dirty.s1 = dirty.s2 = dirty.strip = true; };
    for (const h of [hMain, hS1, hS2, hStrip]) h.onResize(() => { dirtyAll(); layoutCache = null; });

    /* ---------------- drawing helpers ---------------- */
    function clear(h) {
      const { ctx, width: W, height: H } = h;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    }
    function title(ctx, text, x, y, color = P.inkDim) {
      ctx.save();
      ctx.font = `600 11.5px ${SERIF}`;
      let t = text;
      if ('fontVariantCaps' in ctx) ctx.fontVariantCaps = 'all-small-caps'; else t = text.toUpperCase();
      if ('letterSpacing' in ctx) ctx.letterSpacing = '1.6px';
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(t, x, y);
      const w = ctx.measureText(t).width;
      ctx.restore();
      return w;
    }
    function label(ctx, text, x, y, { color = P.inkDim, size = 11, font = MONO, align = 'left', base = 'alphabetic', italic = false, bg = false } = {}) {
      ctx.font = `${italic ? 'italic ' : ''}${size}px ${font}`;
      ctx.textAlign = align; ctx.textBaseline = base;
      if (bg) {
        const w = ctx.measureText(text).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        const yc = base === 'middle' ? y : base === 'top' ? y + size * 0.5 : base === 'bottom' ? y - size * 0.5 : y - size * 0.35;
        ctx.fillStyle = rgba(P.bg, 0.82);
        ctx.fillRect(x0 - 4, yc - size * 0.72, w + 8, size * 1.44);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }
    const SUPD = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    const sup = (k) => String(k).replace('-', '−').split('').map((c) => (c === '−' ? '⁻' : SUPD[c] || c)).join('');
    function sci(e) {
      if (!(e > 0)) return '0';
      if (e >= 0.001) return e.toFixed(e >= 0.1 ? 3 : 4);
      const ex = Math.floor(Math.log10(e)), m = e / Math.pow(10, ex);
      return `${m.toFixed(1)}×10${sup(ex)}`;
    }
    const fmtInt = (k) => k.toLocaleString('en-US');
    // a long period in the unit a person would use
    const fmtPeriod = (sec) => (sec < 120 ? `${Math.round(sec)} s` : sec < 7200 ? `${Math.round(sec / 60)} minutes`
      : sec < 172800 ? `${Math.round(sec / 3600)} hours` : sec < 2 * 3.15576e7 ? `${fmtInt(Math.round(sec / 86400))} days`
        : `${fmtInt(Math.round(sec / 3.15576e7))} years`);
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    function star(ctx, x, y, r, color) {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
        k ? ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) : ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    function arrowHead(ctx, x, y, ang, size, color) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - size * Math.cos(ang - 0.42), y - size * Math.sin(ang - 0.42));
      ctx.lineTo(x - size * Math.cos(ang + 0.42), y - size * Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    const sprGold = cv.glowSprite(P.goldBright, 16);
    const sprVG = cv.glowSprite(VG, 14);
    const sprAz = cv.glowSprite(P.azure, 24);
    const sprHalo = cv.glowSprite(P.gold, 64);
    const sprComet = cv.glowSprite('#fff1cf', 34);
    const sprCrim = cv.glowSprite(P.crimson, 28);

    /* ---------------- clocks and a lookahead scheduler ---------------- */
    // Visual playheads read the same clock the audio is scheduled on. If the
    // audio context cannot run, a run falls back to the page clock, silently.
    function pickClock() {
      let c = null;
      try { c = audio.ensureAudio(); } catch { c = null; }
      if (c && c.state !== 'closed') return { audio: true, ctx: c, now: () => c.currentTime, born: performance.now() };
      return { audio: false, ctx: null, now: () => performance.now() / 1000, born: performance.now() };
    }
    const quietClock = () => ({ audio: false, ctx: null, now: () => performance.now() / 1000, born: performance.now() });
    function makeSched(clock, tick) {
      let timer = null, next = null;
      const pump = () => {
        const t = clock.now();
        // a throttled timer (background tab) must not fire a backlog of events at once
        if (next !== null && next < t - 0.25) next = t + 0.02;
        while (next !== null && next < t + 0.12) { const r = tick(next); next = r == null ? null : r; }
        if (next === null && timer) { clearInterval(timer); timer = null; }
      };
      return {
        start(delay = 0.05) { this.stop(); next = clock.now() + delay; pump(); if (next !== null) timer = setInterval(pump, 25); },
        stop() { if (timer) { clearInterval(timer); timer = null; } next = null; },
        get on() { return timer !== null; },
      };
    }
    const stalled = (clock) => clock.audio && clock.ctx.state !== 'running' && performance.now() - clock.born > 800;

    /* =========================================================== */
    /* ======================== THE WEB ========================== */
    /* =========================================================== */

    let web = null;              // { n, names, subs, pos, edges | wedges, locked, key }
    let S = null, dangling = [], links = [], specS = [], specG = [], lam2 = 0, oneMult = 1;
    let dampD = 0.85, home = -1, vVec = null;
    let target = null;           // the answer the current run converges to
    let xL = null;               // logical iterate (may run ahead of the eye)
    let xA = null, xB = null, animAt = 0, animDur = 0.2, animClock = quietClock();
    let kL = 0, errHist = [];
    let poured = false, pourPage = -1;
    let flow = null;             // { clock, sched, queue, period }
    // Clicks per second: the first few slowly, so the eye can follow the pour.
    const clickPeriod = (k) => (k < 3 ? 0.62 : k < 6 ? 0.42 : 0.27);
    let voices = null, chordFade = null;
    const surf = { on: false, run: null, at: 0, hops: 0, counts: [], bored: 0, anim: null, trail: [], ff: 0 };
    let parts = [], dust = [];
    let layoutCache = null;
    let hover = null, drag = null, lastTap = null, flash = null;
    let questStage = 'pour', brokeSeen = false, rigShown = false;

    function loadWeb(key) {
      const p = WEB_PRESETS[key];
      web = { key, n: p.n, names: p.names.slice(), subs: p.subs ? p.subs.slice() : null,
        pos: p.pos.map((q) => q.slice()), edges: p.edges ? p.edges.map((e) => e.slice()) : null,
        wedges: p.wedges || null, locked: !!p.locked };
      home = -1; homeToggle.set(false); kbSel = -1;
      dampD = p.d; dSlider.set(p.d);
      stopFlow(); stopSurfer();
      surf.hops = 0; surf.counts = new Array(web.n).fill(0); surf.bored = 0; surf.at = 0; surf.trail = []; surf.anim = null;
      rebuild();
      xL = Float64Array.from(target); xA = xB = Float64Array.from(target);
      kL = 0; errHist = []; poured = false; pourPage = -1;
      parts = []; dust = [];
      dirtyAll(); updateReadout();
    }

    function rebuild() {
      const n = web.n;
      S = web.wedges ? chainMatrix(n, web.wedges) : linkMatrix(n, web.edges);
      const out = web.wedges ? null : outLists(n, web.edges);
      dangling = [...Array(n).keys()].map((j) => (out ? out[j].length === 0 : false));
      links = [];
      for (let j = 0; j < n; j++) if (!dangling[j]) for (let i = 0; i < n; i++) if (S[i * n + j] > 0) links.push({ j, i, w: S[i * n + j] });
      specS = spectrum(S, n);
      if (home >= n) home = -1;
      if (surf.counts.length !== n) { surf.counts = new Array(n).fill(0); surf.hops = 0; surf.bored = 0; }
      if (surf.at >= n) surf.at = 0;
      parts = [];
      recomputeDamped(true);
    }

    function targetFrom(x0) {
      return dampD < 1 ? pagerankExact(S, web.n, dampD, vVec) : cesaroLimit(S, web.n, x0 || uniform(web.n));
    }
    function recomputeDamped(resetHistory) {
      // a run in flight was computed with the old matrix: rewind it to what
      // the eye has seen, and restart it on the same clock afterwards
      const clk = haltFlowQuiet();
      vVec = home >= 0 ? basis(web.n, home) : null;
      specG = spectrum(googleMatrix(S, web.n, dampD, vVec), web.n);
      lam2 = secondModulus(specG);
      oneMult = multiplicityOfOne(specG);
      target = targetFrom(poured && pourPage >= 0 && pourPage < web.n ? basis(web.n, pourPage) : uniform(web.n));
      if (resetHistory && xL && xL.length === web.n) {
        kL = 0; errHist = [{ k: 0, e: l1(xL, target) }];
      }
      dirty.s1 = dirty.s2 = dirty.strip = dirty.main = true;
      if (clk) startFlow(0.03, clk);
      if (mode === 'web') checkQuest();
    }

    /* ---------- geometry ---------- */
    function geom() {
      if (layoutCache) return layoutCache;
      const W = hMain.width, H = hMain.height, m = Math.min(W, H);
      const narrow = W < 480;
      const cx = W / 2, cy = H / 2 + (narrow ? 12 : 8);
      const s = m * 0.72;
      const sx = Math.min(W * 0.8, s * 1.32);
      const ringR = m * (narrow ? 0.44 : 0.47), ringRx = Math.min(W * 0.48, ringR * (sx / s) * 1.02);
      const discK = s * 0.2;
      layoutCache = { W, H, cx, cy, s, sx, ringR, ringRx, discK };
      return layoutCache;
    }
    const nodeXY = (i, g) => [g.cx + (web.pos[i][0] - 0.5) * g.sx, g.cy + (web.pos[i][1] - 0.5) * g.s];
    const toUnit = (x, y, g) => [(x - g.cx) / g.sx + 0.5, (y - g.cy) / g.s + 0.5];
    const discR = (xi, g) => Math.max(4, g.discK * Math.sqrt(Math.max(0, xi)));

    function shownX(now) {
      if (!xA || !xB) return xL;
      const t = animDur > 0 ? ease((now - animAt) / animDur) : 1;
      if (t >= 1) return xB;
      const out = new Float64Array(xB.length);
      for (let i = 0; i < out.length; i++) out[i] = xA[i] + (xB[i] - xA[i]) * t;
      return out;
    }
    const animating = () => xA && xB && animClock.now() - animAt < animDur;

    // Link paths: a quadratic Bézier bowed to the left of travel, so a
    // reciprocal pair separates; a self-loop (Markov's V→V) is a small circle.
    function linkGeom(L, g, x) {
      const [x0, y0] = nodeXY(L.j, g), [x2, y2] = nodeXY(L.i, g);
      const rj = discR(x[L.j], g), ri = discR(x[L.i], g);
      if (L.i === L.j) {
        const lr = 15 + rj * 0.25, cxL = x0, cyL = y0 - rj - lr + 4;
        return { loop: true, cxL, cyL, lr, a0: Math.PI / 2 + 0.55, a1: Math.PI / 2 - 0.55 + TAU, len: lr * (TAU - 1.1) };
      }
      const dx = x2 - x0, dy = y2 - y0, len = Math.hypot(dx, dy) || 1;
      const bow = 0.17 * len;
      const x1 = (x0 + x2) / 2 + (dy / len) * bow, y1 = (y0 + y2) / 2 - (dx / len) * bow;
      const P = (t) => { const u = 1 - t; return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]; };
      let lo = 0, hi = 0.5;
      for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2, p = P(m); (Math.hypot(p[0] - x0, p[1] - y0) < rj + 2 ? (lo = m) : (hi = m)); }
      const tS = hi;
      lo = 0.5; hi = 1;
      for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2, p = P(m); (Math.hypot(p[0] - x2, p[1] - y2) > ri + 3 ? (lo = m) : (hi = m)); }
      const tE = lo;
      return { loop: false, P, tS, tE, x1, y1, x0, y0, x2, y2, len: len * 1.04 * (tE - tS) };
    }
    function pathPoint(G, u) {
      if (G.loop) { const a = G.a0 + (G.a1 - G.a0) * u; return [G.cxL + G.lr * Math.cos(a), G.cyL + G.lr * Math.sin(a)]; }
      return G.P(G.tS + (G.tE - G.tS) * u);
    }

    /* ---------- particles: rank on the move ---------- */
    const PART_CAP = 240, RATE = 80, GAP = 0.085;
    function spawnParticles(dt, x, g, geoms) {
      const live = flow || surf.on || animating();
      if (reduced && !live) return;
      const k = RATE * dt * (live ? 1 : 0.7);
      for (let li = 0; li < links.length; li++) {
        if (parts.length >= PART_CAP) break;
        const L = links[li], flux = dampD * L.w * x[L.j];
        L.cool = (L.cool || 0) - dt;
        if (L.cool <= 0 && Math.random() < k * flux) { parts.push({ li, u: 0, speed: 105 / Math.max(30, geoms[li].len) }); L.cool = GAP; }
      }
      // boredom: dust rains in from the teleport ring and evaporates back up
      if (dampD < 1 || dangling.some(Boolean)) {
        let dangMass = 0;
        for (let j = 0; j < web.n; j++) if (dangling[j]) dangMass += x[j];
        for (let i = 0; i < web.n && dust.length < 90; i++) {
          const rain = (1 - dampD) * (vVec ? vVec[i] : 1 / web.n) + dampD * dangMass / web.n;
          const up = (1 - dampD) * x[i] + (dangling[i] ? dampD * x[i] : 0);
          if (Math.random() < k * rain) dust.push(makeDust(i, g, false));
          if (Math.random() < k * up) dust.push(makeDust(i, g, true));
        }
      }
    }
    function makeDust(i, g, up) {
      const [nx, ny] = nodeXY(i, g);
      const a = Math.atan2((ny - g.cy) / g.ringR, (nx - g.cx) / g.ringRx) + (Math.random() - 0.5) * 0.9;
      const rx = g.cx + g.ringRx * Math.cos(a), ry = g.cy + g.ringR * Math.sin(a);
      return up ? { i, x0: nx, y0: ny, x1: rx, y1: ry, u: 0, dur: 1.4 + Math.random() * 0.5, up }
        : { i, x0: rx, y0: ry, x1: nx, y1: ny, u: 0, dur: 1.4 + Math.random() * 0.5, up };
    }

    /* ---------- drawing the web ---------- */
    function drawWeb(dt, now) {
      const h = hMain, { ctx } = h, g = geom();
      const x = shownX(now) || target;
      clear(h);
      const geoms = links.map((L) => linkGeom(L, g, x));

      // the teleport channel
      ctx.save();
      ctx.strokeStyle = VG; ctx.globalAlpha = dampD < 1 ? 0.34 : 0.14; ctx.lineWidth = 1;
      ctx.setLineDash([2, 7]); ctx.lineDashOffset = reduced ? 0 : -(now * 6) % 9;
      ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.ringRx, g.ringR, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      const boredTxt = dampD < 1 ? `boredom · 1 − d = ${Math.round((1 - dampD) * 100)}%` : 'no boredom · d = 1';
      label(ctx, boredTxt, g.cx, g.cy - g.ringR - 7, { color: dampD < 1 ? VG : P.inkFaint, size: 11, font: SERIF, align: 'center', italic: true });

      // links: width ∝ the rank they carry each click
      for (let li = 0; li < links.length; li++) {
        const L = links[li], G = geoms[li], flux = dampD * L.w * x[L.j];
        const hot = hover && hover.kind === 'link' && hover.li === li;
        ctx.strokeStyle = hot ? CRB : P.azure;
        ctx.globalAlpha = hot ? 0.9 : 0.34 + Math.min(0.4, flux * 1.4);
        ctx.lineWidth = 0.8 + Math.min(3.2, flux * 9);
        ctx.beginPath();
        if (G.loop) ctx.arc(G.cxL, G.cyL, G.lr, G.a0, G.a1);
        else {
          const s0 = G.P(G.tS), s1 = G.P(G.tE);
          // control point of the sub-curve [tS, tE]
          const t0 = G.tS, t1 = G.tE;
          const q = (t) => [(1 - t) * G.x0 + t * G.x1, (1 - t) * G.y0 + t * G.y1];
          const r = (t) => [(1 - t) * G.x1 + t * G.x2, (1 - t) * G.y1 + t * G.y2];
          const qa = q(t0), ra = r(t0);
          const c = [qa[0] + (ra[0] - qa[0]) * ((t1 - t0) / (1 - t0)), qa[1] + (ra[1] - qa[1]) * ((t1 - t0) / (1 - t0))];
          ctx.moveTo(s0[0], s0[1]); ctx.quadraticCurveTo(c[0], c[1], s1[0], s1[1]);
        }
        ctx.stroke();
        if (web.wedges) {
          const [lx, ly] = G.loop ? [G.cxL, G.cyL - G.lr - 9] : pathPoint(G, 0.5);
          const off = G.loop ? 0 : (L.j < L.i ? -13 : 13);
          label(ctx, L.w.toFixed(3), lx, ly + off, { color: P.azure, size: 11, align: 'center', base: 'middle', bg: true });
        }
        ctx.globalAlpha = hot ? 1 : 0.8;
        const e = pathPoint(G, 1), e0 = pathPoint(G, 0.96);
        arrowHead(ctx, e[0], e[1], Math.atan2(e[1] - e0[1], e[0] - e0[0]), 7, hot ? CRB : P.azure);
        ctx.globalAlpha = 1;
      }

      // particles
      spawnParticles(dt, x, g, geoms);
      ctx.globalCompositeOperation = 'lighter';
      for (let p = parts.length - 1; p >= 0; p--) {
        const q = parts[p]; q.u += q.speed * dt;
        if (q.u >= 1 || q.li >= geoms.length) { parts.splice(p, 1); continue; }
        const [px, py] = pathPoint(geoms[q.li], q.u);
        ctx.globalAlpha = Math.min(1, q.u * 6, (1 - q.u) * 6) * (surf.on ? 0.4 : 0.8);
        sprGold.draw(ctx, px, py, 0.62);
      }
      for (let p = dust.length - 1; p >= 0; p--) {
        const q = dust[p]; q.u += dt / q.dur;
        if (q.u >= 1 || q.i >= web.n) { dust.splice(p, 1); continue; }
        const t = q.up ? q.u * q.u : 1 - (1 - q.u) * (1 - q.u);
        ctx.globalAlpha = Math.sin(Math.PI * q.u) * 0.75;
        sprVG.draw(ctx, q.x0 + (q.x1 - q.x0) * t, q.y0 + (q.y1 - q.y0) * t, 0.7);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // the rubber band while dragging a new link
      if (drag && drag.moved) {
        const [sx0, sy0] = nodeXY(drag.from, g);
        ctx.strokeStyle = P.goldBright; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(drag.x, drag.y); ctx.stroke(); ctx.setLineDash([]);
        arrowHead(ctx, drag.x, drag.y, Math.atan2(drag.y - sy0, drag.x - sx0), 8, P.goldBright);
        ctx.globalAlpha = 1;
      }

      // pages: area ∝ rank; the thin ring is the exact answer
      for (let i = 0; i < web.n; i++) {
        const [nx, ny] = nodeXY(i, g), r = discR(x[i], g), rT = discR(target[i], g);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.28;
        sprHalo.draw(ctx, nx, ny, (r * 2.7) / 64);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (dangling[i]) {
          ctx.fillStyle = rgba(P.gold, 0.16);
          ctx.beginPath(); ctx.arc(nx, ny, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = P.gold; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.setLineDash([1.5, 3.5]); ctx.strokeStyle = P.goldDim;
          ctx.beginPath(); ctx.arc(nx, ny, r + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        } else {
          const grd = ctx.createRadialGradient(nx - r * 0.3, ny - r * 0.35, r * 0.1, nx, ny, r);
          grd.addColorStop(0, P.goldBright); grd.addColorStop(0.75, P.gold); grd.addColorStop(1, P.goldDim);
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(nx, ny, r, 0, TAU); ctx.fill();
        }
        // ghost ring at the exact π
        ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(nx, ny, rT, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        if (i === home) {
          ctx.strokeStyle = VG; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(nx, ny, Math.max(r, rT) + 9, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(nx, ny, Math.max(r, rT) + 13, 0, TAU); ctx.stroke();
        }
        if (hover && hover.kind === 'node' && hover.i === i) {
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(nx, ny, Math.max(r, rT) + 4, 0, TAU); ctx.stroke();
        }
        if (kbShown(i)) {
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.arc(nx, ny, Math.max(r, rT) + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // the surfer, under the names so its glow never hides them
      drawSurfer(ctx, g, now);
      for (let i = 0; i < web.n; i++) {
        const [nx, ny] = nodeXY(i, g), r = discR(x[i], g), rT = discR(target[i], g);
        // name inside a big disc, beside a small one
        const nm = web.names[i];
        if (r >= 13 && !dangling[i]) label(ctx, nm, nx, ny + 1, { color: P.bg, size: Math.min(20, 9 + r * 0.32), font: SERIF, align: 'center', base: 'middle' });
        else label(ctx, nm, nx + Math.max(r, rT) + 5, ny - Math.max(r, rT) * 0.55, { color: P.ink, size: 14, font: SERIF, align: 'left', base: 'middle' });
        const vy = ny + Math.max(r, rT) + 13 + (i === home ? 12 : 0);
        label(ctx, x[i].toFixed(3), nx, vy, { color: P.inkDim, size: 10.5, align: 'center', base: 'middle' });
        if (web.subs) label(ctx, web.subs[i], nx, vy + 15, { color: P.inkDim, size: 12.5, font: SERIF, align: 'center', base: 'middle', italic: true });
      }

      if (flash && now - flash.at < 0.6) {
        ctx.globalAlpha = 1 - (now - flash.at) / 0.6;
        sprCrim.draw(ctx, flash.x, flash.y, 1.4);
        ctx.globalAlpha = 1;
      }
      if (g.W >= 560) title(ctx, WEB_PRESETS[web.key].label.replace(/ \(.*\)$/, ''), 12, 20);
      if (web.locked) label(ctx, 'Markov’s counts are data: this chain cannot be edited', 12, g.H - 12, { color: P.inkDim, size: 11.5, font: SERIF, italic: true });
    }

    function drawSurfer(ctx, g, now) {
      if (!surf.on && !surf.anim && surf.hops === 0) return;
      let px, py, tele = false;
      const a = surf.anim;
      if (a && surf.run) {
        const u = Math.max(0, Math.min(1, (surf.run.clock.now() - a.at) / a.dur));
        const [x0, y0] = nodeXY(a.from, g), [x1, y1] = nodeXY(a.to, g);
        if (a.teleport) {
          tele = true;
          const ang0 = Math.atan2(y0 - g.cy, x0 - g.cx), ang1 = Math.atan2(y1 - g.cy, x1 - g.cx);
          const rx = (ang) => [g.cx + g.ringRx * Math.cos(ang), g.cy + g.ringR * Math.sin(ang)];
          if (u < 0.5) { const [qx, qy] = rx(ang0), t = u * 2; px = x0 + (qx - x0) * t; py = y0 + (qy - y0) * t; }
          else { const [qx, qy] = rx(ang1), t = (u - 0.5) * 2; px = qx + (x1 - qx) * t; py = qy + (y1 - qy) * t; }
        } else {
          const li = links.findIndex((L) => L.j === a.from && L.i === a.to);
          if (li >= 0) { const G = linkGeom(links[li], g, shownX(now) || target); [px, py] = pathPoint(G, u); }
          else { px = x0 + (x1 - x0) * u; py = y0 + (y1 - y0) * u; }
        }
      } else { [px, py] = nodeXY(surf.at, g); }
      surf.trail.push([px, py, tele]);
      if (surf.trail.length > 14) surf.trail.shift();
      ctx.globalCompositeOperation = 'lighter';
      for (let t = 0; t < surf.trail.length; t++) {
        const [tx, ty, tt] = surf.trail[t];
        ctx.globalAlpha = (t / surf.trail.length) * 0.5;
        (tt ? sprVG : sprGold).draw(ctx, tx, ty, 0.9);
      }
      ctx.globalAlpha = 1;
      (tele ? sprVG : sprComet).draw(ctx, px, py, tele ? 1.7 : 1.25);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = tele ? VG : '#fff6e0'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(px, py, 7.5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* ---------- the spectrum of G ---------- */
    function drawSpectrum() {
      const h = hS1, { ctx, width: W, height: H } = h;
      clear(h);
      title(ctx, 'the spectrum of G', 12, 19);
      const R = Math.max(30, Math.min(W - 44, H - 64) / 2), cx = W / 2 + 6, cy = 30 + (H - 52) / 2 + 2;
      const X = (re) => cx + re * R, Y = (im) => cy - im * R;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - R - 12, cy); ctx.lineTo(cx + R + 12, cy); ctx.moveTo(cx, cy - R - 10); ctx.lineTo(cx, cy + R + 10); ctx.stroke();
      ctx.strokeStyle = P.inkFaint; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      if (dampD < 0.999) {
        ctx.strokeStyle = VG; ctx.setLineDash([3, 4]); ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(cx, cy, R * dampD, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        const a = -2.35;
        label(ctx, `d = ${dampD.toFixed(2)}`, cx + (R * dampD + 5) * Math.cos(a), cy + (R * dampD + 5) * Math.sin(a), { color: VG, size: 10.5, align: 'right', base: 'bottom', bg: true });
        // where the eigenvalues sit at d = 1, and the radius each one slides along
        let skip = false;
        for (const r of specS) {
          if (!skip && Math.hypot(r[0] - 1, r[1]) < 1e-6) { skip = true; continue; }
          if (Math.hypot(r[0], r[1]) < 1e-6) continue;
          ctx.strokeStyle = GHOST; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(r[0]), Y(r[1])); ctx.stroke();
          ctx.strokeStyle = P.inkFaint;
          ctx.beginPath(); ctx.arc(X(r[0]), Y(r[1]), 3.5, 0, TAU); ctx.stroke();
        }
      }
      label(ctx, '1', X(1) + 6, cy + 4, { color: P.inkFaint, size: 10, base: 'top' });
      label(ctx, '−1', X(-1) - 6, cy + 4, { color: P.inkFaint, size: 10, align: 'right', base: 'top' });
      // the computed eigenvalues of G
      let oneDone = false;
      const pts = [];
      for (const r of specG) {
        const isOne = !oneDone && Math.hypot(r[0] - 1, r[1]) < 1e-6;
        if (isOne) oneDone = true;
        pts.push({ r, isOne, m: Math.hypot(r[0], r[1]) });
      }
      for (const p of pts) {
        const px = X(p.r[0]), py = Y(p.r[1]);
        if (!p.isOne && lam2 > 0.01 && Math.abs(p.m - lam2) < 1e-6) {
          ctx.strokeStyle = CRB; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(px, py, 7.5, 0, TAU); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pts) if (!p.isOne) sprAz.draw(ctx, X(p.r[0]), Y(p.r[1]), 0.75);
      ctx.globalCompositeOperation = 'source-over';
      for (const p of pts) {
        if (p.isOne) { star(ctx, X(1), cy, 8, P.goldBright); continue; }
        ctx.fillStyle = P.azure; ctx.beginPath(); ctx.arc(X(p.r[0]), Y(p.r[1]), 2.6, 0, TAU); ctx.fill();
      }
      // multiplicities
      const seen = [];
      for (const p of pts) {
        if (seen.some((q) => Math.hypot(q.r[0] - p.r[0], q.r[1] - p.r[1]) < 2e-3)) continue;
        const m = pts.filter((q) => Math.hypot(q.r[0] - p.r[0], q.r[1] - p.r[1]) < 2e-3).length;
        seen.push(p);
        if (m > 1) label(ctx, `×${m}`, X(p.r[0]) + 7, Y(p.r[1]) - 7, { color: p.isOne ? P.goldBright : P.azure, size: 10.5, base: 'bottom' });
      }
      if (web.key === 'onegin' && dampD >= 0.999) {
        const r = specG.find((q) => Math.abs(q[0] + 0.535) < 0.01);
        if (r) label(ctx, 'Markov’s δ', X(r[0]), Y(0) - 14, { color: CRB, size: 12.5, font: SERIF, align: 'center', italic: true, bg: true });
      }
      const l2txt = oneMult > 1 ? 'λ = 1 is repeated' : `|λ₂| = ${lam2.toFixed(3)}`;
      label(ctx, l2txt, 12, H - 10, { color: CRB, size: 11 });
    }

    /* ---------- forgetting: the error, click by click ---------- */
    function drawConvergence() {
      const h = hS2, { ctx, width: W, height: H } = h;
      clear(h);
      title(ctx, 'forgetting', 12, 19);
      label(ctx, '‖xₖ − π‖₁', W - 12, 19, { color: P.inkDim, size: 10.5, align: 'right' });
      const x0 = 42, x1 = W - 14, y0 = 32, y1 = H - 24;
      const LTOP = 0.5, LBOT = -10;
      const Yl = (lg) => y0 + ((LTOP - lg) / (LTOP - LBOT)) * (y1 - y0);
      const kMax = errHist.length ? errHist[errHist.length - 1].k : 0;
      const K = Math.max(24, Math.ceil((kMax + 3) / 12) * 12);
      const Xk = (k) => x0 + (k / K) * (x1 - x0);
      ctx.lineWidth = 1;
      for (let lg = 0; lg >= LBOT; lg -= 2) {
        ctx.strokeStyle = lg === -6 ? P.verdant : P.line; ctx.globalAlpha = lg === -6 ? 0.55 : 1;
        if (lg === -6) ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x0, Yl(lg)); ctx.lineTo(x1, Yl(lg)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        label(ctx, lg === 0 ? '1' : `10${sup(lg)}`, x0 - 5, Yl(lg), { color: lg === -6 ? P.verdant : P.inkDim, size: 10, align: 'right', base: 'middle' });
      }
      label(ctx, `clicks 0 … ${K}`, x1, y1 + 15, { color: P.inkDim, size: 10, align: 'right' });
      const clampL = (e) => Math.max(LBOT, Math.min(LTOP, Math.log10(Math.max(e, 1e-12))));
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); ctx.clip();
      if (dampD < 1) {
        ctx.strokeStyle = P.inkDim; ctx.setLineDash([5, 4]);
        ctx.beginPath();
        for (let k = 0; k <= K; k++) { const y = Yl(clampL(2 * Math.pow(dampD, k))); k ? ctx.lineTo(Xk(k), y) : ctx.moveTo(Xk(k), y); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (errHist.length && lam2 > 1e-6 && lam2 < 1) {
        const e0 = errHist[0].e;
        ctx.strokeStyle = CRB; ctx.setLineDash([1.5, 3.5]); ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let k = 0; k <= K; k++) { const y = Yl(clampL(e0 * Math.pow(lam2, k))); k ? ctx.lineTo(Xk(k), y) : ctx.moveTo(Xk(k), y); }
        ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      }
      if (errHist.length > 1) {
        ctx.strokeStyle = P.goldDim; ctx.beginPath();
        errHist.forEach((p, idx) => { const y = Yl(clampL(p.e)); idx ? ctx.lineTo(Xk(p.k), y) : ctx.moveTo(Xk(p.k), y); });
        ctx.stroke();
      }
      for (const p of errHist) {
        ctx.fillStyle = p.e < 1e-6 ? P.verdant : P.gold;
        ctx.beginPath(); ctx.arc(Xk(p.k), Yl(clampL(p.e)), 2.3, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // legend
      const ly = y0 + 8;
      if (dampD < 1) label(ctx, '2·dᵏ bound', x1 - 4, ly, { color: P.inkDim, size: 10, align: 'right', bg: true });
      if (errHist.length && lam2 < 1 && lam2 > 1e-6) label(ctx, '|λ₂|ᵏ slope', x1 - 4, ly + 14, { color: CRB, size: 10, align: 'right', bg: true });
      if (!errHist.length || errHist.length === 1 && !flow) label(ctx, 'pour on a page to start', (x0 + x1) / 2, Yl(-3), { color: P.inkDim, size: 12.5, font: SERIF, align: 'center', base: 'middle', italic: true, bg: true });
      else if (lam2 >= 0.9999 && oneMult === 1) label(ctx, 'never settles', (x0 + x1) / 2, Yl(-3), { color: CRB, size: 12, font: SERIF, align: 'center', italic: true });
    }

    /* ---------- the strip: iteration against the walk ---------- */
    function drawHist(now) {
      const h = hStrip, { ctx, width: W, height: H } = h;
      clear(h);
      const x = shownX(now) || target;
      const n = web.n;
      const narrow = W < 460;
      const left = narrow ? 12 : 150, right = W - 14, base = H - 20, top = narrow ? 44 : 14;
      title(ctx, 'rank against the walk', 12, 19);
      if (!narrow) {
        ctx.fillStyle = P.gold; ctx.fillRect(12, 34, 10, 8);
        label(ctx, 'iterate xₖ', 28, 41, { color: P.inkDim, size: 10.5 });
        ctx.fillStyle = P.azure; ctx.fillRect(12, 50, 10, 8);
        label(ctx, 'surfer visits', 28, 57, { color: P.inkDim, size: 10.5 });
        ctx.fillStyle = P.ink; ctx.fillRect(12, 69, 10, 1.5);
        label(ctx, 'exact π', 28, 73, { color: P.inkDim, size: 10.5 });
      }
      let vmax = 0.5;
      for (let i = 0; i < n; i++) vmax = Math.max(vmax, target[i] * 1.3);
      const Yv = (v) => base - Math.min(1, v / vmax) * (base - top);
      const col = (right - left) / n, bw = Math.min(16, col * 0.3);
      const hops = surf.hops;
      for (let i = 0; i < n; i++) {
        const cxb = left + col * (i + 0.5);
        ctx.fillStyle = P.gold;
        ctx.fillRect(cxb - bw - 1, Yv(x[i]), bw, base - Yv(x[i]));
        if (x[i] > vmax) label(ctx, '▲', cxb - bw / 2 - 1, top - 2, { color: P.goldBright, size: 9, align: 'center' });
        if (hops > 0) {
          const f = surf.counts[i] / hops;
          ctx.fillStyle = P.azure; ctx.fillRect(cxb + 1, Yv(f), bw, base - Yv(f));
        }
        ctx.fillStyle = P.ink;
        ctx.fillRect(cxb - bw - 4, Yv(target[i]) - 0.75, 2 * bw + 8, 1.5);
        label(ctx, web.names[i], cxb, base + 13, { color: i === home ? VG : P.inkDim, size: 12, font: SERIF, align: 'center' });
      }
      ctx.strokeStyle = P.line; ctx.beginPath(); ctx.moveTo(left - 4, base + 0.5); ctx.lineTo(right, base + 0.5); ctx.stroke();
      if (narrow) label(ctx, 'gold: iterate xₖ · blue: surfer · line: π', 12, 34, { color: P.inkDim, size: 10 });
    }

    /* ---------- the run: power iteration on the audio clock ---------- */
    function voicesOn(clock) {
      if (!clock.audio) return;
      if (chordFade) { clearTimeout(chordFade); timers.delete(chordFade); chordFade = null; }
      if (voices && voices.length !== web.n) { voices.forEach((v) => v.dispose()); voices = null; }
      if (!voices) voices = [...Array(web.n).keys()].map((i) => audio.voice(bus, { freq: 55 * (i + 2), level: 0, attack: 0.06, release: 0.3 }));
    }
    // Loudness² ∝ rank: Σ amp² is constant because Σ x = 1.
    function chordAt(x, t) {
      if (!voices) return;
      for (let i = 0; i < voices.length && i < x.length; i++) audio.rampTo(voices[i].gain.gain, 0.3 * Math.sqrt(Math.max(0, x[i])), 0.05, t);
    }
    function voicesOff(slow = true) {
      if (!voices) return;
      const vs = voices; voices = null;
      if (!slow) { vs.forEach((v) => v.dispose()); return; }
      const c = audio.getContext();
      if (c) vs.forEach((v) => audio.rampTo(v.gain.gain, 0, 0.35));
      chordFade = later(() => { vs.forEach((v) => v.dispose()); chordFade = null; }, 1600);
    }

    function startFlow(delay = 0.05, clock = null) {
      stopFlow(false);
      clock = clock || pickClock();
      const run = { clock, queue: [], period: clickPeriod(kL), done: false };
      flow = run;
      voicesOn(clock);
      if (clock.audio) chordAt(xL, clock.now() + 0.01);
      run.sched = makeSched(clock, (t) => {
        if (flow !== run) return null;
        xL = googleStep(S, xL, dampD, vVec);
        kL++;
        const e = l1(xL, target);
        const period = clickPeriod(kL);
        run.queue.push({ x: xL, k: kL, e, at: t, dur: period });
        if (clock.audio) chordAt(xL, t);
        if (e < 1e-10 || kL >= 400) { run.done = true; return null; }
        return t + period;
      });
      run.sched.start(delay);
      flowBtn.textContent = '⏸ pause';
      flowBtn.classList.add('active');
    }
    function haltFlowQuiet() {
      if (!flow) return null;
      const clock = flow.clock;
      flow.sched.stop(); flow.queue.length = 0;
      if (xB && xB.length === web.n) xL = Float64Array.from(xB);
      flow = null;
      return clock;
    }
    function stopFlow(settle = true) {
      if (!flow) return;
      flow.sched.stop();
      // rewind the logical state to what the eye has seen
      if (settle && xB) { xL = Float64Array.from(xB); const last = errHist[errHist.length - 1]; kL = last ? last.k : 0; }
      flow = null;
      voicesOff(true);
      flowBtn.textContent = '▶ flow';
      flowBtn.classList.remove('active');
    }
    function consumeFlow() {
      if (!flow) return;
      if (stalled(flow.clock)) { const q = flow.queue; flow.queue = []; if (q.length) { xL = q[q.length - 1].x; kL = q[q.length - 1].k; } startFlow(0.02, quietClock()); return; }
      const now = flow.clock.now();
      let changed = false;
      while (flow.queue.length && flow.queue[0].at <= now) {
        const q = flow.queue.shift();
        xA = shownX(animClock.now()) || q.x; xB = q.x; animAt = q.at; animDur = q.dur * 0.92; animClock = flow.clock;
        errHist.push({ k: q.k, e: q.e });
        changed = true;
        if (dampD >= 0.999 && q.k >= 5 && q.e > 1e-3 && ['ring', 'trap', 'islands'].includes(web.key)) brokeSeen = true;
        if ((q.e < 1e-6 && questStage === 'pour' && poured) || (q.e < 1e-4 && questStage === 'break')) onConverged();
      }
      if (changed) { dirty.s2 = true; updateReadout(); }
      if (!flow.sched.on && !flow.queue.length && now > animAt + animDur) {
        const done = flow.done;
        stopFlow(false);
        if (done) onConverged();
      }
    }
    function pour(i) {
      poured = true; pourPage = i;
      xL = basis(web.n, i);
      target = targetFrom(xL);
      xA = shownX(animClock.now()) || xL; xB = Float64Array.from(xL);
      animClock = quietClock(); animAt = animClock.now(); animDur = 0.35;
      kL = 0; errHist = [{ k: 0, e: l1(xL, target) }];
      dirty.s2 = dirty.strip = true;
      const c = pickClock();
      if (c.audio) audio.playTone(bus, { freq: 55 * (i + 2), dur: 0.5, level: 0.32, attack: 0.01, release: 0.25 });
      if (flow) stopFlow(false);
      startFlow(0.45, c);
      updateReadout();
    }
    function stepOnce() {
      if (flow) stopFlow(true);
      if (!poured && errHist.length <= 1) { poured = true; pourPage = argMin(target); xL = basis(web.n, pourPage); target = targetFrom(xL); kL = 0; errHist = [{ k: 0, e: l1(xL, target) }]; }
      const prev = shownX(animClock.now()) || xL;
      xL = googleStep(S, xL, dampD, vVec); kL++;
      const e = l1(xL, target);
      errHist.push({ k: kL, e });
      xA = prev; xB = xL; animClock = quietClock(); animAt = animClock.now(); animDur = 0.3;
      const c = pickClock();
      if (c.audio) for (let i = 0; i < web.n; i++) if (xL[i] > 1e-4) audio.playTone(bus, { freq: 55 * (i + 2), dur: 0.6, level: 0.3 * Math.sqrt(xL[i]), attack: 0.02, release: 0.3 });
      dirty.s2 = dirty.strip = true; updateReadout();
      if (e < 1e-6) onConverged();
    }
    const argMin = (v) => { let b = 0; for (let i = 1; i < v.length; i++) if (v[i] < v[b]) b = i; return b; };
    const argMax = (v) => { let b = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[b]) b = i; return b; };

    /* ---------- the surfer ---------- */
    function startSurfer(clock = null) {
      stopSurferRun();
      clock = clock || pickClock();
      const period = 1 / 6;
      const run = { clock, queue: [], period };
      surf.run = run; surf.on = true;
      run.sched = makeSched(clock, (t) => {
        if (surf.run !== run) return null;
        const from = surf.at;
        const s = surferStep(S, web.n, from, dampD, Math.random, vVec, dangling);
        surf.at = s.to; surf.hops++; surf.counts[s.to]++; if (s.teleport) surf.bored++;
        run.queue.push({ from, to: s.to, teleport: s.teleport, at: t });
        if (clock.audio) {
          if (s.teleport) breath(t);
          else audio.playTone(bus, { freq: 55 * (s.to + 2), dur: 0.2, level: 0.26, attack: 0.006, release: 0.12, when: t + 0.08 });
        }
        return t + period;
      });
      run.sched.start(0.05);
      surferBtn.textContent = '⏸ surfer';
      surferBtn.classList.add('active');
    }
    function stopSurferRun() { if (surf.run) { surf.run.sched.stop(); surf.run = null; } }
    function stopSurfer() {
      stopSurferRun(); surf.on = false; surf.anim = null; surf.ff = 0;
      surferBtn.textContent = '◉ release a surfer'; surferBtn.classList.remove('active');
    }
    function consumeSurfer() {
      if (surf.run) {
        if (stalled(surf.run.clock)) { startSurfer(quietClock()); return; }
        const now = surf.run.clock.now();
        let changed = false;
        while (surf.run.queue.length && surf.run.queue[0].at <= now) {
          const q = surf.run.queue.shift();
          surf.anim = { ...q, dur: surf.run.period * 0.9 };
          changed = true;
        }
        if (changed) { dirty.strip = true; throttledReadout(); }
      }
      if (surf.ff > 0) {
        const chunk = Math.min(2000, surf.ff);
        for (let h = 0; h < chunk; h++) {
          const s = surferStep(S, web.n, surf.at, dampD, Math.random, vVec, dangling);
          surf.at = s.to; surf.hops++; surf.counts[s.to]++; if (s.teleport) surf.bored++;
        }
        surf.ff -= chunk; surf.anim = null;
        dirty.strip = true;
        if (surf.ff > 0) throttledReadout(); else updateReadout();   // the final count always shows
      }
    }
    // A teleport is a short breath of filtered noise.
    function breath(t) {
      const c = bus.context;
      if (!c) return;
      try {
        const src = c.createBufferSource(); src.buffer = audio.noiseBuffer();
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.8;
        const gn = c.createGain();
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.16, t + 0.03); gn.gain.setTargetAtTime(0.0001, t + 0.05, 0.05);
        src.connect(f).connect(gn).connect(bus.input);
        src.start(t); src.stop(t + 0.35);
        src.onended = () => { try { src.disconnect(); f.disconnect(); gn.disconnect(); } catch {} };
      } catch { /* silent */ }
    }

    /* ---------- editing the web ---------- */
    function hitNode(px, py, g, x) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < web.n; i++) {
        const [nx, ny] = nodeXY(i, g), r = Math.max(discR(x[i], g), discR(target[i], g), 12) + 5;
        const dd = Math.hypot(px - nx, py - ny);
        if (dd < r && dd < bd) { bd = dd; best = i; }
      }
      return best;
    }
    function hitLink(px, py, g, x) {
      let best = -1, bd = 7;
      links.forEach((L, li) => {
        const G = linkGeom(L, g, x);
        for (let s = 0; s <= 20; s++) {
          const [qx, qy] = pathPoint(G, s / 20), dd = Math.hypot(px - qx, py - qy);
          if (dd < bd) { bd = dd; best = li; }
        }
      });
      return best;
    }
    function afterEdit() {
      rebuild();
      if (!flow) startFlow(0.25);
      dirtyAll(); updateReadout();
    }
    function addLink(a, b) {
      if (web.locked || a === b) return;
      if (web.edges.some(([p, q]) => p === a && q === b)) return;
      web.edges.push([a, b]);
      afterEdit();
    }
    function cutLink(li) {
      if (web.locked) return;
      const L = links[li];
      web.edges = web.edges.filter(([p, q]) => !(p === L.j && q === L.i));
      afterEdit();
    }
    function addPage(px, py, g) {
      if (web.locked || web.n >= 12) return;
      let [u, v] = toUnit(px, py, g);
      u = Math.max(-0.15, Math.min(1.15, u)); v = Math.max(0.02, Math.min(0.98, v));
      const used = new Set(web.names);
      const nm = /^\d+$/.test(web.names[0]) ? String(web.n + 1) : [...LETTERS].find((c) => !used.has(c)) || '?';
      web.names.push(nm); web.pos.push([u, v]); web.n++;
      const grow = (a) => { const b = new Float64Array(web.n); b.set(a); return b; };
      xL = grow(xL); xA = grow(xA || xL); xB = grow(xB || xL);
      surf.counts.push(0);
      afterEdit();
    }
    function removePage(i) {
      if (web.locked || web.n <= 2) return;
      const n = web.n;
      web.edges = web.edges.filter(([a, b]) => a !== i && b !== i).map(([a, b]) => [a > i ? a - 1 : a, b > i ? b - 1 : b]);
      web.names.splice(i, 1); web.pos.splice(i, 1); web.n = n - 1;
      const shrink = (a) => { const b = new Float64Array(n - 1); let s = 0; for (let k = 0, t = 0; k < n; k++) if (k !== i) { b[t++] = a[k]; s += a[k]; } if (s > 0) for (let k = 0; k < n - 1; k++) b[k] /= s; else b.fill(1 / (n - 1)); return b; };
      xL = shrink(xL); xA = shrink(xA || xL); xB = shrink(xB || xL);
      surf.counts.splice(i, 1); surf.hops = surf.counts.reduce((p, q) => p + q, 0);
      if (home === i) { home = -1; homeToggle.set(false); } else if (home > i) home--;
      if (pourPage === i) { pourPage = -1; poured = false; } else if (pourPage > i) pourPage--;
      if (surf.at >= web.n || surf.at === i) surf.at = 0;
      afterEdit();
    }
    function setHome(i) {
      home = i;
      recomputeDamped(true);
      if (!flow) startFlow(0.2);
      updateReadout();
    }

    const cnv = hMain.canvas;
    let longTimer = null;
    const clearLong = () => { if (longTimer) { clearTimeout(longTimer); timers.delete(longTimer); longTimer = null; } };
    let grabTouch = false;        // a touch that began on a page drags a link, not the page
    function onDown(e) {
      grabTouch = false;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (mode === 'drum') { drumDown(e); return; }
      if (mode !== 'web') return;
      const [px, py] = cv.pointerPos(hMain, e), g = geom(), x = shownX(animClock.now()) || target;
      const i = hitNode(px, py, g, x);
      if (i >= 0) {
        grabTouch = e.pointerType === 'touch';
        drag = { from: i, sx: px, sy: py, x: px, y: py, moved: false, id: e.pointerId };
        try { cnv.setPointerCapture(e.pointerId); } catch {}
        if (e.pointerType !== 'mouse') {
          clearLong();
          longTimer = later(() => { longTimer = null; if (drag && !drag.moved && drag.from === i) { drag = null; removePage(i); } }, 650);
        }
        return;
      }
      const li = hitLink(px, py, g, x);
      drag = { from: -1, link: li, sx: px, sy: py, x: px, y: py, moved: false, id: e.pointerId };
    }
    function onMove(e) {
      if (mode !== 'web') return;
      const [px, py] = cv.pointerPos(hMain, e), g = geom(), x = shownX(animClock.now()) || target;
      if (drag) {
        drag.x = px; drag.y = py;
        if (!drag.moved && Math.hypot(px - drag.sx, py - drag.sy) > 6) { drag.moved = true; clearLong(); }
        dirty.main = true;
        return;
      }
      const i = hitNode(px, py, g, x);
      const nh = i >= 0 ? { kind: 'node', i } : (() => { const li = hitLink(px, py, g, x); return li >= 0 ? { kind: 'link', li } : null; })();
      if (JSON.stringify(nh) !== JSON.stringify(hover)) { hover = nh; dirty.main = true; cnv.style.cursor = nh ? 'pointer' : 'crosshair'; }
    }
    function onUp(e) {
      if (mode !== 'web' || !drag) { drag = null; return; }
      clearLong();
      const d0 = drag; drag = null;
      try { cnv.releasePointerCapture(e.pointerId); } catch {}
      const [px, py] = cv.pointerPos(hMain, e), g = geom(), x = shownX(animClock.now()) || target;
      if (d0.from >= 0) {
        if (!d0.moved) { if (homeToggle.value) setHome(d0.from); else pour(d0.from); return; }
        const j = hitNode(px, py, g, x);
        if (j >= 0 && j !== d0.from) addLink(d0.from, j);
        dirty.main = true;
        return;
      }
      if (d0.link >= 0 && !d0.moved) {
        const [fx, fy] = pathPoint(linkGeom(links[d0.link], g, x), 0.5);
        flash = { x: fx, y: fy, at: performance.now() / 1000 };
        cutLink(d0.link); hover = null; return;
      }
      if (!d0.moved) {
        const t = performance.now();
        if (lastTap && t - lastTap.t < 380 && Math.hypot(px - lastTap.x, py - lastTap.y) < 24) { lastTap = null; addPage(px, py, g); }
        else lastTap = { t, x: px, y: py };
      }
    }
    function onContext(e) {
      if (mode !== 'web') return;
      e.preventDefault();
      const [px, py] = cv.pointerPos(hMain, e), g = geom(), x = shownX(animClock.now()) || target;
      const i = hitNode(px, py, g, x);
      if (i >= 0) { drag = null; removePage(i); }
    }
    const onCancel = () => { drag = null; grabTouch = false; clearLong(); };
    const onLeave = () => { if (hover) { hover = null; dirty.main = true; } };
    // Pointer events fire before touch events: cancelling this touchstart keeps
    // the page from scrolling away while a link is being drawn with a finger.
    const onTouchStart = (e) => { if (grabTouch && mode === 'web') e.preventDefault(); };

    // The keyboard path: arrows choose a page (or a node of the drum), Enter or
    // Space pours onto it (makes it home, or strikes it), Delete removes it.
    let kbSel = -1;
    const sr = document.createElement('span');
    sr.className = 'eg-sr'; sr.setAttribute('aria-live', 'polite');
    cMain.appendChild(sr);
    function kbAnnounce() {
      if (mode === 'web' && kbSel >= 0 && kbSel < web.n) {
        const deg = web.edges ? inDegrees(web.n, web.edges)[kbSel] : -1;
        sr.textContent = `page ${web.names[kbSel]}, rank ${target[kbSel].toFixed(3)}${deg >= 0 ? `, ${deg} incoming link${deg === 1 ? '' : 's'}` : ''}. ` +
          (homeToggle.value ? 'Enter makes it home.' : 'Enter pours all the rank onto it.');
      } else if (mode === 'drum' && kbSel >= 0 && kbSel < drum.g.n) {
        sr.textContent = `node ${drum.g.names[kbSel]}, Fiedler value ${drum.modes.fiedler[kbSel].toFixed(3)}. Enter strikes it.`;
      }
    }
    function onKey(e) {
      if (mode === 'ladder' || e.altKey || e.ctrlKey || e.metaKey) return;
      const n = mode === 'web' ? web.n : drum.g.n, k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
        const step = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
        kbSel = kbSel < 0 || kbSel >= n ? (step > 0 ? 0 : n - 1) : (kbSel + step + n) % n;
        dirty.main = true; e.preventDefault(); kbAnnounce();
        return;
      }
      if (kbSel < 0 || kbSel >= n) return;
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        if (mode === 'drum') strike(kbSel);
        else if (homeToggle.value) setHome(kbSel);
        else pour(kbSel);
        dirty.main = true;
      } else if ((k === 'Delete' || k === 'Backspace') && mode === 'web' && !web.locked && web.n > 2) {
        e.preventDefault();
        removePage(kbSel);
        kbSel = Math.min(kbSel, web.n - 1); kbAnnounce();
      }
    }
    const kbShown = (i) => i === kbSel && document.activeElement === cnv;
    const onFocusChange = () => { dirty.main = true; };

    cnv.addEventListener('pointerdown', onDown);
    cnv.addEventListener('pointermove', onMove);
    cnv.addEventListener('pointerup', onUp);
    cnv.addEventListener('pointercancel', onCancel);
    cnv.addEventListener('pointerleave', onLeave);
    cnv.addEventListener('contextmenu', onContext);
    cnv.addEventListener('touchstart', onTouchStart, { passive: false });
    cnv.addEventListener('keydown', onKey);
    cnv.addEventListener('focus', onFocusChange);
    cnv.addEventListener('blur', onFocusChange);

    /* ---------- quest ---------- */
    const QUEST = {
      pour: 'Click any page to pour all the importance onto it, and watch the flow settle into the faint rings.',
      rig: 'Rig the ranking: make a page with the fewest incoming links rank first. Drag from page to page to add a link; click a link to cut it.',
      break: 'Now break it. Choose <em>a ring of five</em>, where d is 1, and pour. Then drag d down from 1 until it settles.',
      free: 'Double-click empty space for a new page; right-click or long-press a page to remove it. Then try the drum.',
    };
    function setQuest(s) { questStage = s; if (mode === 'web') quest.set(QUEST[s]); }
    function onConverged() {
      updateReadout();
      if (questStage === 'pour' && poured) {
        quest.done(`It forgot where it began. Pour on any other page and it ends in the same picture: the eigenvector, with ${web.names[argMax(target)]} on top.`);
        questStage = 'pour-done';
        later(() => { if (questStage === 'pour-done') setQuest('rig'); }, 5200);
      } else if (questStage === 'break' && brokeSeen && dampD < 1 && ['ring', 'trap', 'islands'].includes(web.key)) {
        quest.done(`Healed. At d = ${dampD.toFixed(2)} every eigenvalue but the gold 1 sits inside the dashed circle, and the rank settles at last.`);
        questStage = 'break-done';
        later(() => { if (questStage === 'break-done') setQuest('free'); }, 6500);
      }
    }
    function checkQuest() {
      if (['pour', 'pour-done', 'rig'].includes(questStage) && web.edges && dampD < 1 && questWon(web.n, web.edges, target)) {
        const deg = inDegrees(web.n, web.edges), top = argMax(target);
        let other = -1; for (let i = 0; i < web.n; i++) if (deg[i] > deg[top] && (other < 0 || target[i] > target[other])) other = i;
        quest.done(`Rigged. ${web.names[top]} has ${deg[top]} incoming link${deg[top] === 1 ? '' : 's'} and ranks first at ${target[top].toFixed(3)}; ${web.names[other]} has ${deg[other]} and only ${target[other].toFixed(3)}. A vote counts by the rank of the voter.`);
        questStage = 'rig-done';
        later(() => { if (questStage === 'rig-done') setQuest('break'); }, 7000);
      }
    }

    /* ---------- web readout ---------- */
    let lastReadout = 0;
    function throttledReadout() { const t = performance.now(); if (t - lastReadout > 180) { lastReadout = t; updateReadout(); } }
    function updateReadout() {
      if (mode !== 'web') return;
      const last = errHist[errHist.length - 1];
      const lines = [];
      if (last && (poured || errHist.length > 1)) lines.push(`click ${last.k} · distance from π ${sci(last.e)}${lam2 < 1 && lam2 > 1e-6 ? ` · shrinking about ×${lam2.toFixed(3)} per click` : ''}`);
      else lines.push(`at rest: every disc sits in its ring, ${web.wedges ? 'the chain’s stationary vector' : 'the exact PageRank'} π = (${Array.from(target).map((v) => v.toFixed(3)).join(', ')})`);
      if (dampD < 1) lines.push(`d = ${dampD.toFixed(2)} · |λ₂| = ${lam2.toFixed(3)} ≤ d · the bound 2·dᵏ falls below 10⁻⁶ after ${fmtInt(clicksTo(dampD))} clicks`);
      else if (oneMult > 1) lines.push(`d = 1 · the eigenvalue 1 appears ${oneMult} times: the answer depends on where you pour`);
      else if (lam2 >= 0.9999) lines.push('d = 1 · other eigenvalues sit on the unit circle: the rank circulates and never settles');
      else {
        const empty = [...Array(web.n).keys()].filter((i) => target[i] < 1e-6);
        const full = [...Array(web.n).keys()].filter((i) => target[i] >= 1e-6);
        if (empty.length) lines.push(`d = 1 · everything drains into {${full.map((i) => web.names[i]).join(' ')}}; the other pages end with nothing`);
        else lines.push(`d = 1 · no boredom, yet |λ₂| = ${lam2.toFixed(3)} < 1, so this chain still settles`);
      }
      if (surf.hops > 0) lines.push(`surfer ${fmtInt(surf.hops)} hops · visits differ from π by ${l1(surf.counts.map((c) => c / surf.hops), target).toFixed(3)} · bored ${(100 * surf.bored / surf.hops).toFixed(1)}% of the time`);
      info.set(lines.join('\n'));
    }

    /* ---------- web controls ---------- */
    const rowW1 = ui.controlRow(ctlWeb), rowW2 = ui.controlRow(ctlWeb);
    const presetSel = ui.select(rowW1, {
      label: 'web', value: 'moler',
      options: Object.entries(WEB_PRESETS).map(([k, p]) => ({ value: k, label: p.label })),
      onChange: (k) => { loadWeb(k); updateCaption(); },
    });
    const dSlider = ui.slider(rowW1, {
      label: 'damping d', min: 0, max: 1, step: 0.01, value: 0.85,
      format: (v) => (v >= 1 ? '1 · no boredom' : v.toFixed(2)),
      onInput: (v) => {
        dampD = v;
        recomputeDamped(true);
        if (flow) { /* keep flowing toward the new answer */ } else if (poured) startFlow(0.15);
        updateReadout();
      },
    });
    const homeToggle = ui.toggle(rowW1, {
      label: 'bored surfers go home', value: false,
      onChange: (on) => {
        if (!on) { home = -1; recomputeDamped(true); if (!flow && poured) startFlow(0.2); }
        updateCaption(); updateReadout();
      },
    });
    const flowBtn = ui.button(rowW2, '▶ flow', () => {
      if (flow) { stopFlow(true); updateReadout(); return; }
      if (!poured || errHist.length === 0 || (errHist[errHist.length - 1].e < 1e-9)) { pour(argMin(target)); return; }
      startFlow();
    }, { primary: true });
    ui.button(rowW2, 'one click', stepOnce, { small: true });
    const surferBtn = ui.button(rowW2, '◉ release a surfer', () => {
      if (surf.on) { stopSurfer(); updateReadout(); return; }
      startSurfer();
    }, { small: true });
    ui.button(rowW2, '10,000 hops at once', () => { surf.ff += 10000; }, { small: true });
    ui.button(rowW2, 'clear visits', () => { surf.hops = 0; surf.bored = 0; surf.counts = new Array(web.n).fill(0); surf.trail = []; dirty.strip = true; updateReadout(); }, { small: true });

    /* =========================================================== */
    /* ======================= THE LADDER ======================== */
    /* =========================================================== */

    const LADDERS = {
      theon: { M: [1, 1, 2, 1], name: 'Theon’s ladder', rule: '(q, p) → (q + p, 2q + p)', target: Math.SQRT2, sym: '√2',
        meter: (q, p) => p * p - 2 * q * q, meterTxt: 'p² − 2q²', l1: '1 + √2', l2: '1 − √2' },
      fib: { M: [0, 1, 1, 1], name: 'Fibonacci’s ladder', rule: '(q, p) → (p, q + p)', target: (1 + Math.sqrt(5)) / 2, sym: 'φ',
        meter: (q, p) => p * p - p * q - q * q, meterTxt: 'p² − pq − q²', l1: 'φ', l2: '−1/φ' },
    };
    const FAN = 72, MAX_RUNG = 14;
    const lad = { kind: 'theon', rung: 0, vecs: [[1, 1]], fan: [], fanFrom: [], at: 0, dur: 0.75, sound: false, drone: null, tone: null };
    function ladderReset() {
      const L = LADDERS[lad.kind];
      lad.rung = 0; lad.vecs = iterate2(L.M, [1, 1], MAX_RUNG);
      lad.fan = [...Array(FAN).keys()].map((j) => (j + 0.5) * Math.PI / FAN);
      lad.fanFrom = lad.fan.slice(); lad.at = performance.now() / 1000 - 10;
      if (lad.tone) lad.tone.setFreq(220 * ratioAt(0), 0.2);
      if (lad.drone) lad.drone.setFreq(220 * L.target, 0.2);
      dirtyAll(); ladderReadout();
    }
    const ratioAt = (r) => lad.vecs[r][1] / lad.vecs[r][0];
    function ladderNext() {
      if (lad.rung >= MAX_RUNG) return;
      const L = LADDERS[lad.kind], now = performance.now() / 1000;
      const u = ease((now - lad.at) / lad.dur);
      lad.fanFrom = lad.fan.map((a, j) => lerpAngle(lad.fanFrom[j], a, u));
      lad.fan = lad.fan.map((a) => mapDirection(L.M, a));
      lad.rung++; lad.at = now;
      if (lad.tone) lad.tone.setFreq(220 * ratioAt(lad.rung), 0.35);
      else { try { audio.ensureAudio(); audio.playTone(bus, { freq: 220 * ratioAt(lad.rung), dur: 0.5, level: 0.22 }); } catch {} }
      dirtyAll(); ladderReadout();
      if (mode === 'ladder' && lad.rung >= 5 && !lad.questDone) {
        lad.questDone = true;
        quest.done(lad.kind === 'theon'
          ? 'At 41/29 the two tones beat about once every eleven seconds; at 99/70, about once a minute. The beat slows 5.83-fold per rung: the ear is hearing the ratio of the two eigenvalues.'
          : 'At 13/8 the beat is 1.5 per second, at 21/13 one every 1.7 seconds. Fibonacci’s ladder converges more slowly: its errors shrink by 1/φ² ≈ 0.382 per rung.');
      }
    }
    function lerpAngle(a, b, u) {
      let d = b - a;
      if (d > Math.PI / 2) d -= Math.PI; else if (d < -Math.PI / 2) d += Math.PI;
      return a + d * u;
    }
    function ladderSound(on) {
      lad.sound = on;
      if (on) {
        try { audio.ensureAudio(); } catch { return; }
        const L = LADDERS[lad.kind];
        lad.drone = audio.voice(bus, { freq: 220 * L.target, level: 0.2, attack: 0.3, release: 0.4, pan: -0.25 });
        lad.tone = audio.voice(bus, { freq: 220 * ratioAt(lad.rung), level: 0.2, attack: 0.3, release: 0.4, pan: 0.25 });
        lad.drone.on(); lad.tone.on();
      } else {
        if (lad.drone) { lad.drone.dispose(); lad.tone.dispose(); }
        lad.drone = lad.tone = null;
      }
      dirty.strip = true;
    }
    function ladderReadout() {
      if (mode !== 'ladder') return;
      const L = LADDERS[lad.kind], [q, p] = lad.vecs[lad.rung];
      const err = p / q - L.target;
      const ratio = Math.abs(eig2(L.M).l2 / eig2(L.M).l1);
      info.set(`rung ${lad.rung} · (q, p) = (${fmtInt(q)}, ${fmtInt(p)}) · p/q = ${(p / q).toFixed(9)} · ${L.meterTxt} = ${L.meter(q, p) > 0 ? '+' : '−'}1\n` +
        `error p/q − ${L.sym} = ${err < 0 ? '−' : '+'}${sci(Math.abs(err))} · shrinking ×${ratio.toFixed(4)} per rung, sign flipping · beat ${beatHz() >= 0.001 ? beatHz().toFixed(3) : sci(beatHz())} Hz`);
    }
    const beatHz = () => Math.abs(220 * ratioAt(lad.rung) - 220 * LADDERS[lad.kind].target);

    function drawLadderMain(now) {
      const h = hMain, { ctx, width: W, height: H } = h, L = LADDERS[lad.kind];
      clear(h);
      const narrow = W < 480;
      const cx = W / 2, cy = narrow ? H / 2 - 4 : H / 2 + 6, R = narrow ? Math.min(W * 0.4, H * 0.33) : Math.min(W * 0.46, H * 0.42);
      const u = ease((now - lad.at) / lad.dur);
      const E = eig2(L.M);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - R - 10, cy); ctx.lineTo(cx + R + 10, cy); ctx.moveTo(cx, cy - R - 10); ctx.lineTo(cx, cy + R + 10); ctx.stroke();
      label(ctx, 'q', cx + R + 14, cy, { color: P.inkDim, size: 14, font: SERIF, base: 'middle', italic: true });
      label(ctx, 'p', cx, cy - R - 16, { color: P.inkDim, size: 14, font: SERIF, align: 'center', italic: true });
      ctx.strokeStyle = GHOST; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      // every starting direction, all under the same matrix
      ctx.strokeStyle = P.azure; ctx.lineWidth = 1;
      for (let j = 0; j < FAN; j++) {
        const a = lerpAngle(lad.fanFrom[j], lad.fan[j], u), dx = Math.cos(a) * R, dy = Math.sin(a) * R;
        ctx.globalAlpha = 0.2;
        ctx.beginPath(); ctx.moveTo(cx - dx, cy + dy); ctx.lineTo(cx + dx, cy - dy); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // the two directions the matrix keeps
      const ang = (v) => Math.atan2(v[1], v[0]);
      const a1 = ang(E.v1), a2 = ang(E.v2);
      const R2 = R * 1.1;
      ctx.strokeStyle = CRB; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(cx - Math.cos(a2) * R2, cy + Math.sin(a2) * R2); ctx.lineTo(cx + Math.cos(a2) * R2, cy - Math.sin(a2) * R2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = P.gold; ctx.globalAlpha = 0.35; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(cx - Math.cos(a1) * R2, cy + Math.sin(a1) * R2); ctx.lineTo(cx + Math.cos(a1) * R2, cy - Math.sin(a1) * R2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - Math.cos(a1) * R2, cy + Math.sin(a1) * R2); ctx.lineTo(cx + Math.cos(a1) * R2, cy - Math.sin(a1) * R2); ctx.stroke();
      const lx1 = cx + Math.cos(a1) * R2, ly1 = cy - Math.sin(a1) * R2;
      const lx2 = cx - Math.cos(a2) * R2, ly2 = cy + Math.sin(a2) * R2;
      if (!narrow) {
        label(ctx, `λ₁ = ${L.l1} ≈ ${E.l1.toFixed(3)}`, lx1 + 8, ly1 + 2, { color: P.goldBright, size: 12, base: 'middle', bg: true });
        label(ctx, 'survives', lx1 + 8, ly1 + 17, { color: P.gold, size: 13, font: SERIF, base: 'middle', italic: true, bg: true });
        label(ctx, `λ₂ = ${L.l2} ≈ ${E.l2.toFixed(3)}`, lx2 + 8, ly2 - 4, { color: CRB, size: 12, base: 'middle', bg: true });
        label(ctx, 'dies, flipping sign', lx2 + 8, ly2 + 11, { color: CRB, size: 13, font: SERIF, base: 'middle', italic: true, bg: true });
      } else {
        label(ctx, `λ₁ = ${L.l1} ≈ ${E.l1.toFixed(3)} survives`, 12, H - 30, { color: P.goldBright, size: 11.5 });
        label(ctx, `λ₂ = ${L.l2} ≈ ${E.l2.toFixed(3)} dies`, 12, H - 13, { color: CRB, size: 11.5 });
      }
      // Theon's own vectors, normalised; older rungs fade
      const vecAng = (r) => Math.atan2(lad.vecs[r][1], lad.vecs[r][0]);
      for (let r = Math.max(0, lad.rung - 4); r <= lad.rung; r++) {
        let a = vecAng(r);
        if (r === lad.rung && r > 0) a = vecAng(r - 1) + (vecAng(r) - vecAng(r - 1)) * u;
        const age = lad.rung - r;
        const tipx = cx + Math.cos(a) * R * 0.92, tipy = cy - Math.sin(a) * R * 0.92;
        ctx.strokeStyle = age ? P.goldDim : P.goldBright; ctx.globalAlpha = age ? 0.7 - age * 0.13 : 1; ctx.lineWidth = age ? 1.2 : 2.4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipx, tipy); ctx.stroke();
        arrowHead(ctx, tipx, tipy, Math.atan2(tipy - cy, tipx - cx), age ? 7 : 11, age ? P.goldDim : P.goldBright);
        ctx.globalAlpha = 1;
      }
      const [q, p] = lad.vecs[lad.rung];
      const aT = vecAng(lad.rung);
      const bx = cx + Math.cos(aT) * R * 0.5, by = cy - Math.sin(aT) * R * 0.5;
      label(ctx, `(${fmtInt(q)}, ${fmtInt(p)})`, bx - 12, by - 6, { color: P.ink, size: 13, align: 'right', base: 'bottom', bg: true });
      title(ctx, `${L.name} as a matrix`, 12, 20);
      if (!narrow) {
        label(ctx, L.rule, 12, 38, { color: P.inkDim, size: 11.5 });
        label(ctx, `M = [${L.M[0]} ${L.M[1]}; ${L.M[2]} ${L.M[3]}]`, 12, 54, { color: P.inkDim, size: 11.5 });
        label(ctx, 'every faint line is a starting direction; each rung applies the same matrix to all of them', W / 2, H - 12, { color: P.inkDim, size: 12.5, font: SERIF, align: 'center', italic: true });
      }
    }
    function drawLadderTable() {
      const h = hS1, { ctx, width: W, height: H } = h, L = LADDERS[lad.kind];
      clear(h);
      const tw = title(ctx, 'the rungs', 12, 19);
      const tStr = L.target.toFixed(9);
      // the rule sits beside the title when the main canvas has no room for it,
      // or on a footer line of its own when the panel is too narrow for both
      let ruleFoot = false;
      if (hMain.width < 480) {
        ctx.font = `10.5px ${MONO}`;
        if (ctx.measureText(L.rule).width <= W - 24 - tw - 16) label(ctx, L.rule, W - 12, 19, { color: P.inkDim, size: 10.5, align: 'right' });
        else ruleFoot = true;
      }
      const rowH = 18, rows = Math.max(3, Math.floor((H - 74 - (ruleFoot ? 16 : 0)) / rowH));
      const first = Math.max(0, lad.rung - rows + 1);
      const narrow = W < 300;
      const cq = narrow ? 44 : 58, cp = narrow ? 92 : 118, cr = narrow ? 102 : 132;
      label(ctx, 'q', cq, 38, { color: P.inkDim, size: 12, font: SERIF, align: 'right', italic: true });
      label(ctx, 'p', cp, 38, { color: P.inkDim, size: 12, font: SERIF, align: 'right', italic: true });
      label(ctx, 'p/q', cr, 38, { color: P.inkDim, size: 12, font: SERIF, italic: true });
      if (!narrow) label(ctx, L.meterTxt, W - 12, 38, { color: P.inkDim, size: 11, align: 'right' });
      for (let r = first; r <= lad.rung; r++) {
        const y = 56 + (r - first) * rowH;
        const [q, p] = lad.vecs[r];
        const cur = r === lad.rung;
        label(ctx, fmtInt(q), cq, y, { color: cur ? P.ink : P.inkDim, size: 11.5, align: 'right' });
        label(ctx, fmtInt(p), cp, y, { color: cur ? P.ink : P.inkDim, size: 11.5, align: 'right' });
        const s = (p / q).toFixed(narrow ? 7 : 9);
        let k = 0; while (k < s.length && s[k] === tStr[k]) k++;
        ctx.font = `11.5px ${MONO}`; ctx.textAlign = 'left';
        ctx.fillStyle = cur ? P.goldBright : P.gold; ctx.fillText(s.slice(0, k), cr, y);
        const w = ctx.measureText(s.slice(0, k)).width;
        ctx.fillStyle = cur ? P.inkDim : P.inkFaint; ctx.fillText(s.slice(k), cr + w, y);
        if (!narrow) { const m = L.meter(q, p); label(ctx, m > 0 ? '+1' : '−1', W - 12, y, { color: m > 0 ? P.gold : CRB, size: 11.5, align: 'right' }); }
      }
      label(ctx, `${L.sym} = ${L.target.toFixed(narrow ? 7 : 9)}`, cr, H - 10, { color: P.gold, size: 11 });
      if (ruleFoot) label(ctx, L.rule, 12, H - 27, { color: P.inkDim, size: 10.5 });
    }
    function drawLadderError() {
      const h = hS2, { ctx, width: W, height: H } = h, L = LADDERS[lad.kind];
      clear(h);
      title(ctx, 'the error, alternating', 12, 19);
      const x0 = 42, x1 = W - 14, y0 = 34, y1 = H - 24;
      const LBOT = -14, LTOP = 0;
      const Yl = (lg) => y0 + ((LTOP - lg) / (LTOP - LBOT)) * (y1 - y0);
      const K = Math.max(8, lad.rung + 1);
      const Xr = (r) => x0 + (r / K) * (x1 - x0);
      for (let lg = 0; lg >= LBOT; lg -= 2) {
        ctx.strokeStyle = P.line; ctx.beginPath(); ctx.moveTo(x0, Yl(lg)); ctx.lineTo(x1, Yl(lg)); ctx.stroke();
        label(ctx, lg === 0 ? '1' : `10${sup(lg)}`, x0 - 5, Yl(lg), { color: P.inkDim, size: 10, align: 'right', base: 'middle' });
      }
      const E = eig2(L.M), rate = Math.abs(E.l2 / E.l1);
      const e0 = Math.abs(ratioAt(0) - L.target);
      ctx.strokeStyle = CRB; ctx.setLineDash([1.5, 3.5]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(Xr(0), Yl(Math.log10(e0))); ctx.lineTo(Xr(K), Yl(Math.max(LBOT, Math.log10(e0) + K * Math.log10(rate)))); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 1;
      for (let r = 0; r <= lad.rung; r++) {
        const e = ratioAt(r) - L.target, lg = Math.max(LBOT, Math.log10(Math.abs(e) || 1e-16));
        const px = Xr(r), py = Yl(lg);
        const over = e > 0;
        ctx.fillStyle = over ? P.gold : CRB;
        ctx.beginPath();
        if (over) { ctx.moveTo(px, py - 5); ctx.lineTo(px - 4.5, py + 3); ctx.lineTo(px + 4.5, py + 3); }
        else { ctx.moveTo(px, py + 5); ctx.lineTo(px - 4.5, py - 3); ctx.lineTo(px + 4.5, py - 3); }
        ctx.fill();
      }
      label(ctx, `× ${rate.toFixed(4)} per rung${W >= 330 ? ' = |λ₂/λ₁|' : ''}`, 12, y1 + 15, { color: CRB, size: 10.5 });
      label(ctx, '▲ over  ▼ under', x1, y1 + 15, { color: P.inkDim, size: 10, align: 'right' });
    }
    function drawLadderBeat(now) {
      const h = hStrip, { ctx, width: W, height: H } = h, L = LADDERS[lad.kind];
      clear(h);
      const f = beatHz();
      const tw = title(ctx, 'what the ear hears', 12, 19);
      // a beat slower than the six seconds on show is named by its period
      const slow = f > 0 && f < 1 / 6 ? `, one every ${fmtPeriod(1 / f)}` : '';
      const full = `220·${L.sym} = ${(220 * L.target).toFixed(3)} Hz against 220·p/q = ${(220 * ratioAt(lad.rung)).toFixed(3)} Hz · beat ${f >= 0.001 ? f.toFixed(3) : sci(f)} Hz${slow} · 6 seconds shown`;
      ctx.font = `10.5px ${MONO}`;
      const wide = ctx.measureText(full).width <= W - 24 - tw - 20;
      const left = 12, right = W - 12, mid = wide ? H / 2 + 8 : H / 2 + 16, amp = wide ? (H - 44) / 2 : (H - 60) / 2;
      if (wide) label(ctx, full, W - 12, 19, { color: P.inkDim, size: 10.5, align: 'right' });
      else label(ctx, `beat ${f >= 0.001 ? f.toFixed(3) : sci(f)} Hz${slow} · 6 s shown`, 12, 35, { color: P.inkDim, size: 10.5 });
      const span = 6;
      ctx.fillStyle = P.gold; ctx.globalAlpha = 0.5;
      ctx.beginPath();
      const N = Math.max(40, Math.floor(right - left));
      if (f > 30) { ctx.rect(left, mid - amp, right - left, 2 * amp); }
      else {
        for (let s = 0; s <= N; s++) { const t = (s / N) * span; ctx.lineTo(left + (s / N) * (right - left), mid - amp * Math.abs(Math.cos(Math.PI * f * t))); }
        for (let s = N; s >= 0; s--) { const t = (s / N) * span; ctx.lineTo(left + (s / N) * (right - left), mid + amp * Math.abs(Math.cos(Math.PI * f * t))); }
      }
      ctx.fill(); ctx.globalAlpha = 1;
      if (f > 30) label(ctx, 'too fast to count: heard as roughness', W / 2, mid, { color: P.bg, size: 12, font: SERIF, align: 'center', base: 'middle', italic: true });
      if (lad.sound) {
        const t = (now % span) / span, x = left + t * (right - left);
        ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(x, mid - amp - 3); ctx.lineTo(x, mid + amp + 3); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }

    // ladder controls
    const rowL = ui.controlRow(ctlLadder);
    ui.select(rowL, {
      label: 'ladder', value: 'theon',
      options: [{ value: 'theon', label: 'Theon’s: √2' }, { value: 'fib', label: 'Fibonacci’s: φ' }],
      onChange: (k) => { if (!LADDERS[k]) return; lad.kind = k; lad.questDone = false; if (lad.sound) { ladderSound(false); ladderReset(); ladderSound(true); } else ladderReset(); ladderQuest(); updateCaption(); },
    });
    ui.button(rowL, 'next rung ▸', ladderNext, { primary: true });
    ui.button(rowL, 'back to (1, 1)', () => { ladderReset(); }, { small: true });
    const listenToggle = ui.toggle(rowL, { label: '♪ hear it converge', value: false, onChange: (on) => ladderSound(on) });
    function ladderQuest() {
      if (mode !== 'ladder') return;
      if (lad.questDone) return;
      quest.set(lad.kind === 'theon'
        ? 'Turn on the sound and climb the ladder until the two tones stop beating to your ear.'
        : 'Climb Fibonacci’s ladder and compare: its second eigenvalue, −1/φ, is larger beside its first, so it forgets more slowly.');
    }

    /* =========================================================== */
    /* ======================== THE DRUM ========================= */
    /* =========================================================== */

    const drum = { key: 'barbell', g: null, modes: null, strikes: [], last: null };
    const SLOW = 110 / 1.25;     // the drawn motion runs this many times slower than the sound
    function loadDrum(key) {
      drum.key = key;
      drum.g = drumPreset(key, web);
      drum.modes = drumModes(drum.g.n, drum.g.edges);
      drum.strikes = []; drum.last = null;
      dirtyAll(); drumReadout();
    }
    function drumGeom() {
      const W = hMain.width, H = hMain.height, g = drum.g;
      const wide = g.fit === 'wide';
      const sx = wide ? Math.min(W * 0.8, H * 1.9) : Math.min(W, H) * 0.74;
      const sy = wide ? H * 0.62 : Math.min(W, H) * 0.74;
      return { W, H, cx: W / 2, cy: H / 2 + 4, sx, sy };
    }
    const drumXY = (i, G) => [G.cx + (drum.g.pos[i][0] - 0.5) * G.sx, G.cy + (drum.g.pos[i][1] - 0.5) * G.sy];
    function fiedlerColor(v, vmax) {
      const t = Math.max(-1, Math.min(1, v / (vmax || 1)));
      const mix = (a, b, u) => a.map((c, k) => Math.round(c + (b[k] - c) * u));
      const hex = (c) => '#' + c.map((q) => q.toString(16).padStart(2, '0')).join('');
      const ink = rgbOf(P.ink), az = rgbOf(P.azure), cr = rgbOf(P.crimson);
      return hex(t >= 0 ? mix(ink, az, Math.pow(t, 0.7)) : mix(ink, cr, Math.pow(-t, 0.7)));
    }
    // An impulse at node j rings as Σₖ uₖ(i)·uₖ(j)·sin(ωₖt)/ωₖ, each mode
    // decaying; drawn SLOW times slower than it sounds, scaled to ~30 px.
    function strikeShape(node) {
      const M = drum.modes, n = drum.g.n, w2 = Math.sqrt(M.lambda2);
      const modes = [];
      for (let k = 1; k < n; k++) {
        if (!(M.values[k] > 1e-9) || !(w2 > 0)) continue;
        const wk = Math.sqrt(M.values[k]);
        modes.push({ k, c: M.vectors[k][node] * (w2 / wk), om: TAU * (110 * wk / w2) / SLOW, tau: 2.6 * (w2 / wk) + 0.5 });
      }
      let B = 1e-9;
      for (let i = 0; i < n; i++) { let sum = 0; for (const m of modes) sum += Math.abs(m.c * M.vectors[m.k][i]); B = Math.max(B, sum); }
      return { modes, scale: 30 / B };
    }
    function displacement(i, now) {
      let y = 0;
      const M = drum.modes;
      for (const s of drum.strikes) {
        const t = now - s.t0;
        if (t < 0 || t > 6 || !s.shape) continue;
        for (const m of s.shape.modes) y += s.shape.scale * m.c * M.vectors[m.k][i] * Math.sin(m.om * t) * Math.exp(-t / m.tau);
      }
      return Math.max(-44, Math.min(44, y));
    }
    function drawDrumMain(now) {
      const h = hMain, { ctx, width: W, height: H } = h, g = drum.g, M = drum.modes, G = drumGeom();
      clear(h);
      const u = M.fiedler, vmax = Math.max(...u.map(Math.abs));
      drum.strikes = drum.strikes.filter((s) => now - s.t0 < 6);
      const pos = [...Array(g.n).keys()].map((i) => { const [x, y] = drumXY(i, G); return [x, y + displacement(i, now)]; });
      const E = undirectedEdges(g.n, g.edges);
      ctx.strokeStyle = P.inkDim; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
      for (const [a, b] of E) { ctx.beginPath(); ctx.moveTo(pos[a][0], pos[a][1]); ctx.lineTo(pos[b][0], pos[b][1]); ctx.stroke(); }
      ctx.globalAlpha = 1;
      // the nodal line: where u₂ changes sign along a spring
      if (M.connected) {
        ctx.fillStyle = P.goldBright;
        for (const [a, b] of E) {
          if (u[a] * u[b] >= 0) continue;
          const t = u[a] / (u[a] - u[b]);
          const [ax, ay] = drumXY(a, G), [bx, by] = drumXY(b, G);
          const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
          const len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
          for (let s = -8; s <= 8; s++) {
            ctx.globalAlpha = 0.95 - Math.abs(s) * 0.09;
            ctx.beginPath(); ctx.arc(mx + nx * s * 3.4 + ((s * 7) % 3 - 1) * 0.6, my + ny * s * 3.4, 1.4, 0, TAU); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      for (const s of drum.strikes) {
        const t = now - s.t0; if (t > 1.2) continue;
        const [sx0, sy0] = drumXY(s.node, G);
        ctx.strokeStyle = P.goldBright; ctx.globalAlpha = 1 - t / 1.2; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(sx0, sy0, 15 + t * 42, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (let i = 0; i < g.n; i++) {
        const [x, y] = pos[i], col = fiedlerColor(u[i], vmax);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
        (u[i] < 0 ? sprCrim : sprAz).draw(ctx, x, y, 1.4);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 13.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = P.bg; ctx.lineWidth = 1.5; ctx.stroke();
        if (kbShown(i)) {
          ctx.strokeStyle = P.goldBright; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.arc(x, y, 19, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        label(ctx, g.names[i], x, y + 1, { color: P.bg, size: 13.5, font: SERIF, align: 'center', base: 'middle' });
      }
      title(ctx, 'the web as springs', 12, 20);
      const note = !M.connected ? 'disconnected: λ₂ = 0, and the drum falls apart'
        : M.degenerate ? 'λ₂ is doubled: this cut could sit at any angle, like Chladni’s twin modes'
          : 'dotted: the nodal line, where the Fiedler vector changes sign';
      label(ctx, note, W / 2, H - 12, { color: M.connected && !M.degenerate ? P.inkDim : CRB, size: 12.5, font: SERIF, align: 'center', italic: true });
      label(ctx, `motion slowed ${Math.round(SLOW)}×`, W - 12, 20, { color: P.inkFaint, size: 10.5, align: 'right' });
    }
    function drawDrumLadder(now) {
      const h = hS1, { ctx, width: W, height: H } = h, M = drum.modes;
      clear(h);
      title(ctx, 'the overtones √λₖ', 12, 19);
      if (!M.connected) { label(ctx, 'no λ₂, no fundamental', W / 2, H / 2, { color: CRB, size: 12.5, font: SERIF, align: 'center', italic: true }); return; }
      const vals = M.values.slice(1);
      const ratios = vals.map((v) => Math.sqrt(v / M.lambda2));
      const top = Math.max(2, Math.ceil(ratios[ratios.length - 1]));
      const y0 = 34, y1 = H - 22, xL0 = 44, xR = W - 14;
      const Y = (r) => y1 - (r / top) * (y1 - y0);
      for (let k = 1; k <= top; k++) {
        ctx.strokeStyle = GHOST; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(xL0 - 4, Y(k)); ctx.lineTo(xR, Y(k)); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, `${k}×`, xL0 - 9, Y(k), { color: P.inkDim, size: 10, align: 'right', base: 'middle' });
      }
      label(ctx, '0 · rigid drift, silent', xL0, y1 + 13, { color: P.inkFaint, size: 10 });
      const last = drum.last && now - drum.last.t0 < 6 ? drum.last : null;
      const groups = [];
      ratios.forEach((r, idx) => { const gq = groups.find((q) => Math.abs(q.r - r) < 1e-6); if (gq) gq.ks.push(idx + 1); else groups.push({ r, ks: [idx + 1] }); });
      // labels: keep them at least 12 px apart, with a leader when nudged
      const ly = groups.map((gq) => Y(gq.r));
      for (let q = 1; q < ly.length; q++) ly[q] = Math.min(ly[q], ly[q - 1] - 12);
      if (ly.length) ly[ly.length - 1] = Math.max(ly[ly.length - 1], y0 - 2);
      for (let q = ly.length - 2; q >= 0; q--) ly[q] = Math.max(ly[q], ly[q + 1] + 12);
      for (const [gi, gq] of groups.entries()) {
        const y = Y(gq.r);
        let a = 0;
        if (last) for (const p of last.partials) if (gq.ks.includes(p.k)) a = Math.max(a, p.a);
        const decay = last ? Math.exp(-(now - last.t0) / 1.6) : 0;
        ctx.strokeStyle = P.azure; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(xL0 + 4, y); ctx.lineTo(xL0 + 60, y); ctx.stroke();
        ctx.globalAlpha = 1;
        if (a > 0 && decay > 0.01) { ctx.fillStyle = P.goldBright; ctx.globalAlpha = decay; ctx.fillRect(xL0 + 4, y - 2, 56 * a, 4); ctx.globalAlpha = 1; }
        const txt = `λ = ${vals[gq.ks[0] - 1].toFixed(3)}${gq.ks.length > 1 ? `  ×${gq.ks.length}` : ''}`;
        if (Math.abs(ly[gi] - y) > 1) { ctx.strokeStyle = GHOST; ctx.beginPath(); ctx.moveTo(xL0 + 61, y); ctx.lineTo(xL0 + 66, ly[gi]); ctx.stroke(); }
        label(ctx, txt, xL0 + 68, ly[gi], { color: gq.ks[0] === 1 ? CRB : P.inkDim, size: 10.5, base: 'middle' });
      }
    }
    function drawDrumFiedler() {
      const h = hS2, { ctx, width: W, height: H } = h, M = drum.modes, g = drum.g;
      clear(h);
      title(ctx, 'the Fiedler vector u₂', 12, 19);
      const u = M.fiedler, vmax = Math.max(1e-9, ...u.map(Math.abs));
      const x0 = 16, x1 = W - 16, mid = (36 + H - 24) / 2, amp = (H - 92) / 2;
      ctx.strokeStyle = P.line; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke(); ctx.setLineDash([]);
      const Xi = (i) => x0 + ((i + 0.5) / g.n) * (x1 - x0);
      if (drum.key === 'string') {
        ctx.strokeStyle = P.gold; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.beginPath();
        const sgn = Math.sign(u[0]) || 1, A = vmax / Math.cos(Math.PI / (2 * g.n));
        for (let s = 0; s <= 120; s++) {
          const jj = -0.5 + (s / 120) * g.n, val = sgn * A * Math.cos(Math.PI * (jj + 0.5) / g.n);
          const px = Xi(jj);
          const py = mid - (val / vmax) * amp;
          s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
        label(ctx, 'gold: cos(π(j + ½)/n), the string’s fundamental', W - 12, H - 8, { color: P.gold, size: 10.5, align: 'right' });
      }
      for (let i = 0; i < g.n; i++) {
        const px = Xi(i), py = mid - (u[i] / vmax) * amp, col = u[i] < 0 ? P.crimson : P.azure;
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, mid); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, TAU); ctx.fill();
        label(ctx, g.names[i], px, u[i] < 0 ? mid - 8 : mid + 14, { color: P.inkDim, size: 11, font: SERIF, align: 'center' });
      }
      if (!M.connected) label(ctx, 'λ₂ = 0: no single cut', W - 12, 19, { color: CRB, size: 10.5, align: 'right' });
    }
    function drawDrumStrip(now) {
      const h = hStrip, { ctx, width: W, height: H } = h;
      clear(h);
      const last = drum.last;
      title(ctx, last ? `the strike at ${drum.g.names[last.node]}` : 'the strike', 12, 19);
      const left = 16, right = W - 16, base = H - 22, top = W >= 560 ? 30 : 42;
      const fmax = 110 * Math.max(4.4, ...(last ? last.partials.map((p) => p.f / 110 + 0.4) : [4.4]));
      const X = (f) => left + (f / fmax) * (right - left);
      for (let k = 1; 110 * k < fmax; k++) {
        ctx.strokeStyle = GHOST; ctx.beginPath(); ctx.moveTo(X(110 * k), top); ctx.lineTo(X(110 * k), base); ctx.stroke();
        label(ctx, `${110 * k}`, X(110 * k), base + 13, { color: P.inkFaint, size: 9.5, align: 'center' });
      }
      ctx.strokeStyle = P.line; ctx.beginPath(); ctx.moveTo(left, base + 0.5); ctx.lineTo(right, base + 0.5); ctx.stroke();
      if (W >= 560) label(ctx, 'Hz · faint lines: the harmonic series of 110', W - 12, 19, { color: P.inkDim, size: 10.5, align: 'right' });
      else label(ctx, 'Hz · faint: harmonics of 110', 12, 34, { color: P.inkDim, size: 10.5 });
      if (!last) { label(ctx, 'tap a node, or press strike', W / 2, (top + base) / 2, { color: P.inkDim, size: 12.5, font: SERIF, align: 'center', base: 'middle', italic: true, bg: true }); return; }
      const decay = Math.exp(-(now - last.t0) / 2.2);
      for (const p of last.partials) {
        const x = X(p.f), y = base - p.a * (base - top) * (0.35 + 0.65 * decay);
        ctx.strokeStyle = p.k === 1 ? CRB : P.goldBright; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    let liveOsc = 0;
    function strike(node) {
      const M = drum.modes;
      const partials = strikePartials(M, node, 110);
      const now = performance.now() / 1000;
      const s = { node, t0: now, partials, shape: strikeShape(node) };
      drum.strikes.push(s); drum.last = s;
      if (drum.strikes.length > 4) drum.strikes.shift();
      let c = null;
      try { c = audio.ensureAudio(); } catch { c = null; }
      if (c) {
        const t = c.currentTime + 0.01;
        for (const p of partials) {
          if (liveOsc >= 24) break;
          const tau = 0.45 + 1.6 * Math.sqrt(110 / p.f);
          try {
            const o = c.createOscillator(), gn = c.createGain();
            o.frequency.value = p.f;
            gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.26 * p.a, t + 0.006); gn.gain.setTargetAtTime(0.0001, t + 0.01, tau);
            o.connect(gn).connect(bus.input); o.start(t); o.stop(t + tau * 6);
            liveOsc++;
            o.onended = () => { liveOsc--; try { o.disconnect(); gn.disconnect(); } catch {} };
          } catch { /* silent */ }
        }
      }
      if (mode === 'drum' && !drum.questDone && M.connected) {
        drum.questDone = true;
        const lo = partials.length ? Math.min(...partials.map((p) => p.f)) : 110;
        quest.done(`A strike excites each mode as much as that mode moves where you struck. The lowest partial, ${lo.toFixed(0)} Hz, belongs to λ₂, the algebraic connectivity, and it is loudest far from the nodal line.`);
      }
      drumReadout();
    }
    function drumDown(e) {
      const [px, py] = cv.pointerPos(hMain, e), G = drumGeom();
      let best = -1, bd = 26;
      for (let i = 0; i < drum.g.n; i++) { const [x, y] = drumXY(i, G), dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = i; } }
      if (best >= 0) strike(best);
    }
    function drumReadout() {
      if (mode !== 'drum') return;
      const M = drum.modes, g = drum.g;
      if (!M.connected) { info.set('λ₂ = 0 · a disconnected graph has no single fundamental: the drum falls apart\nadd links in the web tab and come back'); return; }
      const pos = [], neg = [];
      M.fiedler.forEach((v, i) => (v >= 0 ? pos : neg).push(g.names[i]));
      const ratios = M.values.slice(1).map((v) => Math.sqrt(v / M.lambda2));
      const uniq = []; for (const r of ratios) if (!uniq.some((q) => Math.abs(q - r) < 1e-6)) uniq.push(r);
      let line1 = `λ₂ = ${M.lambda2.toFixed(4)}${drum.key === 'barbell' ? ' = 3 − √7' : ''} · the algebraic connectivity · the cut splits {${neg.join(' ')}} from {${pos.join(' ')}}`;
      let line2 = `overtone ratios ${uniq.slice(0, 7).map((r) => r.toFixed(2)).join(' : ')}${uniq.length > 7 ? ' …' : ''}`;
      if (drum.last) {
        const fs = [...new Set(drum.last.partials.map((p) => p.f.toFixed(0)))].map(Number).sort((a, b) => a - b);
        line2 += ` · last strike ${fs.slice(0, 5).join(', ')}${fs.length > 5 ? ' …' : ''} Hz`;
      }
      info.set(line1 + '\n' + line2);
    }
    const rowD = ui.controlRow(ctlDrum);
    const drumSel = ui.select(rowD, {
      label: 'drum', value: 'barbell',
      options: [{ value: 'barbell', label: 'the barbell: two cliques, one bridge' }, { value: 'string', label: 'a string of eight' },
        { value: 'ring', label: 'a ring of eight' }, { value: 'web', label: 'your web, as springs' }],
      onChange: (k) => { loadDrum(k); drumQuest(); updateCaption(); },
    });
    ui.button(rowD, 'strike ▸', () => {
      const u = drum.modes.fiedler; let b = 0; for (let i = 1; i < u.length; i++) if (Math.abs(u[i]) > Math.abs(u[b])) b = i;
      strike(drum.last ? (drum.last.node + 1) % drum.g.n : b);
    }, { primary: true });
    function drumQuest() {
      if (mode !== 'drum' || drum.questDone) return;
      quest.set('Strike the drum: tap a node, or press strike. Listen for the lowest partial, then try the string, whose lowest overtones are nearly harmonic.');
    }

    /* =========================================================== */
    /* ===================== modes, captions ===================== */
    /* =========================================================== */

    const CAPTIONS = {
      web: () => 'Disc areas are ranks, which always add up to one; the thin rings mark the exact answer, solved directly. Gold particles carry rank along the links; green dust is boredom, rising to the dotted ring and raining back in. Each page sounds a harmonic of 55 Hz (110, 165, 220 Hz and on up), its amplitude squared in proportion to its rank, so the chord keeps its power and changes only its colour until the iteration converges.' +
        (home >= 0 ? ' With “go home” on, a bored surfer always jumps back to the ringed page: Brin and Page’s personalization, in which boredom leads home.' : ' Turn on “bored surfers go home” and click a page to personalize the ranking around it.'),
      ladder: () => 'Seventy-two faint lines stand for every starting direction; each rung multiplies all of them by the same matrix and they are swept onto the gold line. The crimson direction is the only other one the matrix keeps, and it is repelled. J. J. Sylvester in 1883 called eigenvalues “latent roots”, latent “in a somewhat similar sense as vapour may be said to be latent in water or smoke in a tobacco-leaf.” The sound pairs a fixed tone at 220·' + LADDERS[lad.kind].sym + ' Hz with one at 220·p/q; they beat at the difference, which shrinks by the same factor as the error.',
      drum: () => 'Links become springs of equal stiffness between equal masses, and the colours are the Fiedler vector: the second eigenvector of the graph Laplacian L = D − A, crimson on one side of zero and blue on the other. The dotted marks cross every spring whose ends move in opposite directions, a discrete nodal line like the sand on Chladni’s plate. A strike sounds each mode at 110·√(λₖ/λ₂) Hz, as loud as that mode moves where you struck.',
    };
    function updateCaption() { cap.innerHTML = CAPTIONS[mode](); }
    const ALT = {
      web: 'A web of pages drawn as gold discs sized by rank, with curved links carrying rank, a spectrum plot, an error plot and a bar strip. Arrow keys choose a page; Enter pours all the rank onto it; Delete removes it.',
      ladder: 'A fan of lines through the origin being swept, rung by rung, onto the gold eigenvector line of Theon’s matrix.',
      drum: 'A graph of springs coloured by its Fiedler vector, with a dotted nodal line and the overtone ladder beside it. Arrow keys choose a node; Enter strikes it.',
    };
    const tabs = {
      ladder: ui.button(tabRow, 'prologue · Theon’s ladder', () => setMode('ladder'), { small: true }),
      web: ui.button(tabRow, 'the web', () => setMode('web'), { small: true }),
      drum: ui.button(tabRow, 'the drum', () => setMode('drum'), { small: true }),
    };
    function setMode(m) {
      if (m === mode && tabs[m].classList.contains('active')) return;
      if (mode === 'web' && m !== 'web') { stopFlow(true); stopSurfer(); }
      if (mode === 'ladder' && m !== 'ladder' && lad.sound) { ladderSound(false); listenToggle.set(false); }
      mode = m;
      for (const [k, b] of Object.entries(tabs)) { b.classList.toggle('active', k === m); b.setAttribute('aria-pressed', k === m ? 'true' : 'false'); }
      ctlLadder.hidden = m !== 'ladder'; ctlWeb.hidden = m !== 'web'; ctlDrum.hidden = m !== 'drum';
      cMain.classList.toggle('eg-still', m === 'ladder');
      hMain.canvas.setAttribute('aria-label', ALT[m]);
      hMain.canvas.tabIndex = m === 'ladder' ? -1 : 0;
      kbSel = -1; sr.textContent = '';
      if (m === 'drum') { if (drum.key === 'web' || !drum.modes) loadDrum(drum.key); drumQuest(); drumReadout(); }
      if (m === 'web') { setQuest(questStage.endsWith('-done') ? ({ 'pour-done': 'rig', 'rig-done': 'break', 'break-done': 'free' })[questStage] : questStage); updateReadout(); }
      if (m === 'ladder') { ladderQuest(); if (lad.questDone) quest.done(); ladderReadout(); }
      hover = null; drag = null;
      updateCaption(); dirtyAll();
    }

    /* ---------------- the frame ---------------- */
    function frame(dt) {
      const nowP = performance.now() / 1000;
      if (mode === 'web') {
        consumeFlow(); consumeSurfer();
        const aNow = animClock.now();
        const moving = !!flow || surf.on || animating() || parts.length > 0 || dust.length > 0 || (!reduced);
        if (moving || dirty.main) { drawWeb(dt, aNow); dirty.main = false; }
        if (animating() || dirty.strip) { drawHist(aNow); dirty.strip = false; }
        if (dirty.s1) { drawSpectrum(); dirty.s1 = false; }
        if (dirty.s2) { drawConvergence(); dirty.s2 = false; }
      } else if (mode === 'ladder') {
        const moving = nowP - lad.at < lad.dur + 0.05;
        if (moving || dirty.main) { drawLadderMain(nowP); dirty.main = false; }
        if (dirty.s1) { drawLadderTable(); dirty.s1 = false; }
        if (dirty.s2) { drawLadderError(); dirty.s2 = false; }
        if (lad.sound || dirty.strip) { drawLadderBeat(nowP); dirty.strip = false; }
      } else {
        const ringing = drum.strikes.some((s) => nowP - s.t0 < 6);
        if (ringing || dirty.main) { drawDrumMain(nowP); dirty.main = false; }
        if (ringing || dirty.s1) { drawDrumLadder(nowP); dirty.s1 = false; }
        if (dirty.s2) { drawDrumFiedler(); dirty.s2 = false; }
        if (ringing || dirty.strip) { drawDrumStrip(nowP); dirty.strip = false; }
      }
    }
    const loop = cv.rafLoop(frame);

    /* ---------------- start ---------------- */
    ui.legendPanel(stage, `
      <p><em>“PageRank is Google’s ranking.”</em> Google’s own guide calls it one of its core
      ranking systems, one of several that analyse links, and says it has “evolved a lot” since
      the company launched.</p>
      <p><em>“PageRank counts links.”</em> In the four-page web of Kurt Bryan and Tanya Leise’s
      paper “The $25,000,000,000 Eigenvector” (the figure was Google’s approximate market value
      when it went public in 2004), page 3 is linked from every other page, yet at d = 1 page 1
      ranks first, 12/31 against 9/31, because page 3 spends its whole vote on page 1. The
      preset is above.</p>
      <p><em>“0.85 was derived.”</em> Brin and Page wrote only “We usually set d to 0.85.” It
      trades speed against fidelity to the links. Their printed formula,
      PR(A) = (1 − d) + d(PR(T₁)/C(T₁) + … + PR(Tₙ)/C(Tₙ)), makes the ranks add up to the
      number of pages rather than to one, although the next sentence says they form a
      probability distribution. The idea survived its typography.</p>
      <p><em>“Markov invented his chains to study poetry.”</em> He built them in 1906 to refute
      Nekrasov; <em>Onegin</em> came seven years later, as an example.</p>`);
    ui.speculationPanel(stage, `
      <p>Is importance really an eigenvector? The circular definition, that what matters is
      what is endorsed by what matters, is a modelling choice rather than a law of nature, and
      it invites gaming; Brin and Page already hoped that personalization could make it “nearly
      impossible to deliberately mislead the system in order to get a higher ranking.” Yet much
      the same fixed point was reached from chess tables in 1895, from sociometric data in 1949 and
      1953, from citations in 1976 and from the Web in 1998, several times by people who did not
      know of the others. Whether a structure found so often was found rather than made is the
      question this essay asked at the start, and will ask again at the end.</p>`);

    loadWeb('moler');
    loadDrum('barbell');
    ladderReset();
    setMode('web');
    setQuest('pour');
    loop.start();

    // A hidden tab stops the frames; keep it from sounding in the background too.
    let paused = false;
    function onVisibility() {
      if (document.hidden) bus.mute();
      else if (!paused) bus.unmute();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return {
      pause() {
        paused = true;
        loop.stop();
        stopFlow(true); stopSurfer();
        if (lad.sound) { ladderSound(false); listenToggle.set(false); }
        voicesOff(false);
        bus.mute();
      },
      resume() { paused = false; if (!document.hidden) bus.unmute(); dirtyAll(); loop.start(); },
      destroy() {
        loop.stop();
        stopFlow(false); stopSurfer();
        if (lad.sound) ladderSound(false);
        voicesOff(false);
        for (const id of timers) clearTimeout(id);
        timers.clear();
        cnv.removeEventListener('pointerdown', onDown);
        cnv.removeEventListener('pointermove', onMove);
        cnv.removeEventListener('pointerup', onUp);
        cnv.removeEventListener('pointercancel', onCancel);
        cnv.removeEventListener('pointerleave', onLeave);
        cnv.removeEventListener('contextmenu', onContext);
        cnv.removeEventListener('touchstart', onTouchStart);
        cnv.removeEventListener('keydown', onKey);
        cnv.removeEventListener('focus', onFocusChange);
        cnv.removeEventListener('blur', onFocusChange);
        document.removeEventListener('visibilitychange', onVisibility);
        sr.remove();
        bus.dispose();
        for (const h of [hMain, hS1, hS2, hStrip]) h.destroy();
        style.remove();
        for (const c of [...stage.children]) if (!preexisting.has(c)) c.remove();
      },
    };
  },
};

/* ======================= tests ======================= */

function selfTest() {
  const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} vs ${b}`); };
  const nearV = (a, b, tol, what) => b.forEach((v, i) => near(a[i], v, tol, `${what}[${i}]`));
  // A1 Moler's tiny web (EXM ch. 7: 0.3210 0.1705 0.1066 0.1368 0.0643 0.2007)
  const S = linkMatrix(6, MOLER_EDGES);
  const pi = pagerankExact(S, 6, 0.85);
  nearV(pi, [0.32101694, 0.17054304, 0.10659163, 0.13679259, 0.06431180, 0.20074400], 1e-7, 'Moler π');
  if (pagerankPower(S, 6, 0.85, { tol: 1e-6 }).iters !== 24) throw new Error('Moler: 24 clicks to 1e-6');
  // A2 spectra: eig(G) = {1} ∪ 0.85·eig(S)∖{1}; |λ₂| = 0.586729
  const sG = spectrum(googleMatrix(S, 6, 0.85), 6);
  near(secondModulus(sG), 0.586729, 1e-5, '|λ₂(G)|');
  near(sG[1][0], -0.586729, 1e-5, 'λ₂ real');
  near(secondModulus(spectrum(S, 6)), 0.690269, 1e-5, '|λ₂(S)|');
  // A3 Bryan & Leise: d = 1 gives [12, 4, 9, 6]/31
  const Sb = linkMatrix(4, BL_EDGES);
  nearV(pagerankPower(Sb, 4, 1, { tol: 1e-13 }).x, [12 / 31, 4 / 31, 9 / 31, 6 / 31], 1e-9, 'Bryan–Leise');
  nearV(pagerankExact(Sb, 4, 0.85), [0.3682, 0.1418, 0.2880, 0.2021], 5e-5, 'Bryan–Leise d = 0.85');
  // A4 the printed 1998 formula sums to N, not 1
  { const ones = new Float64Array(4).fill(1); let x = ones; for (let k = 0; k < 400; k++) x = googleStep(Sb, x, 0.85, ones); near(x.reduce((a, b) => a + b, 0), 4, 1e-9, '1998 formula sum'); nearV(x, [1.4726, 0.5672, 1.1518, 0.8083], 5e-5, '1998 formula'); }
  // A5 Markov's Onegin: π_V = 8638/19999, λ₂ = δ = −0.535338
  const On = chainMatrix(2, ONEGIN_WEDGES);
  near(pagerankPower(On, 2, 1, { tol: 1e-14 }).x[0], 8638 / 19999, 1e-9, 'Onegin π_V');
  near(spectrum(On, 2)[1][0], 1104 / 8638 - 7534 / 11361, 1e-9, 'Onegin δ');
  { let x = basis(2, 0); const seq = [1, 0.1278, 0.5947, 0.3448, 0.4786]; for (let k = 1; k < 5; k++) { x = googleStep(On, x, 1); near(x[0], seq[k], 5e-5, `Onegin step ${k}`); } }
  // A6 Theon: (985, 1393); λ = 1 ± √2; error ratio → −(3 − 2√2)
  const T = iterate2([1, 1, 2, 1], [1, 1], 8);
  if (T[8][0] !== 985 || T[8][1] !== 1393) throw new Error('Theon rung 8');
  T.forEach(([q, p], k) => { if (p * p - 2 * q * q !== (k % 2 ? 1 : -1)) throw new Error('Theon meter'); });
  near(eig2([1, 1, 2, 1]).l1, 1 + Math.SQRT2, 1e-12, 'Theon λ₁');
  near((T[8][1] / T[8][0] - Math.SQRT2) / (T[7][1] / T[7][0] - Math.SQRT2), -(3 - 2 * Math.SQRT2), 1e-4, 'Theon ratio');
  near(Math.abs(220 * 7 / 5 - 220 * Math.SQRT2), 3.1270, 1e-4, 'beat 7/5');
  near(mapDirection([1, 1, 2, 1], Math.atan(Math.SQRT2)), Math.atan(Math.SQRT2), 1e-12, 'eigendirection fixed');
  // A7 Fibonacci: φ and −1/φ
  near(eig2([0, 1, 1, 1]).l1, (1 + Math.sqrt(5)) / 2, 1e-12, 'φ');
  // A8 ring of five, d = 0.85, ten clicks from e₀: 0.2 + 0.8·0.85¹⁰
  const Sr = linkMatrix(5, RING5);
  { let x = basis(5, 0); for (let k = 0; k < 10; k++) x = googleStep(Sr, x, 0.85); near(x[0], 0.2 + 0.8 * Math.pow(0.85, 10), 1e-12, 'ring'); }
  spectrum(Sr, 5).forEach((r) => near(Math.hypot(r[0], r[1]), 1, 1e-7, 'ring |λ| = 1'));
  // A9 two islands: λ₂(G) = d exactly (Haveliwala–Kamvar)
  const sI = spectrum(googleMatrix(linkMatrix(4, ISLAND_EDGES), 4, 0.85), 4);
  near(sI[1][0], 0.85, 1e-7, 'islands λ₂ = d');
  // A10 spider trap
  const St = linkMatrix(5, TRAP_EDGES);
  nearV(pagerankExact(St, 5, 0.85), [0.0805, 0.0642, 0.1188, 0.3819, 0.3546], 5e-5, 'trap d = 0.85');
  nearV(cesaroLimit(St, 5, uniform(5)), [0, 0, 0, 0.5, 0.5], 1e-3, 'trap d = 1');
  // A11 the bound ‖xₖ − π‖₁ ≤ 2dᵏ, and 90 clicks to 1e-6
  for (let i = 0; i < 6; i++) { let x = basis(6, i); for (let k = 0; k <= 60; k++) { if (l1(x, pi) > 2 * Math.pow(0.85, k) + 1e-15) throw new Error('bound'); x = googleStep(S, x, 0.85); } }
  if (clicksTo(0.85, 1e-6) !== 90 || clicksTo(0.85, 1e-8) !== 118) throw new Error('clicksTo');
  // A12 personalized on D (dangling column uniform)
  nearV(pagerankExact(S, 6, 0.85, basis(6, 3)), [0.3500, 0.1519, 0.0677, 0.2369, 0.0224, 0.1711], 5e-5, 'personalized');
  // A13 Laplacians: path, cycle, barbell
  const P6 = drumModes(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  P6.values.forEach((v, k) => near(v, 2 - 2 * Math.cos(Math.PI * k / 6), 1e-9, `P6 λ${k}`));
  P6.fiedler.forEach((v, j) => near(v, Math.cos(Math.PI * (j + 0.5) / 6) / Math.sqrt(3), 1e-6, `P6 u₂[${j}]`));
  const C6 = drumModes(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
  nearV(C6.values, [0, 1, 1, 3, 3, 4], 1e-9, 'C6'); if (!C6.degenerate) throw new Error('C6 degenerate');
  const bb = drumPreset('barbell');
  const B = drumModes(8, bb.edges);
  near(B.lambda2, 3 - Math.sqrt(7), 1e-9, 'barbell λ₂'); near(B.values[7], 3 + Math.sqrt(7), 1e-9, 'barbell λmax');
  if (B.fiedler.slice(0, 4).some((v) => v <= 0) || B.fiedler.slice(4).some((v) => v >= 0)) throw new Error('barbell cut');
  near(strikePartials(B, 0, 110).find((p) => p.k === 7).f / 110, Math.sqrt((3 + Math.sqrt(7)) / (3 - Math.sqrt(7))), 1e-9, 'barbell clang');
  // A14 the surfer: seeded runs reproduce; both forms agree; L1 < 0.02 at 1e5 hops
  const out = outLists(6, MOLER_EDGES), dang = out.map((o) => o.length === 0);
  { const r1 = mulberry32(1), r2 = mulberry32(1); let a = 0, b = 0; for (let h = 0; h < 2000; h++) { a = surferHop(out, 6, a, 0.85, r1).to; b = surferStep(S, 6, b, 0.85, r2, null, dang).to; if (a !== b) throw new Error('surfer forms disagree'); } }
  { const r = mulberry32(1); let at = 0; const cnt = new Float64Array(6); for (let h = 1; h <= 100000; h++) { at = surferHop(out, 6, at, 0.85, r).to; cnt[at]++; if (h === 100) near(l1(cnt.map((c) => c / h), pi), 0.1018, 5e-4, 'surfer @100'); } near(l1(cnt.map((c) => c / 1e5), pi), 0.0049, 5e-4, 'surfer @1e5'); }
  // the presets' aperiodic trap and islands: d = 1 drains / stays put; λ₂(G) = d for islands
  nearV(cesaroLimit(linkMatrix(6, TRAP6), 6, basis(6, 0)), [0, 0, 0, 0.4, 0.2, 0.4], 1e-6, 'trap6');
  { let x = basis(6, 0); const S6 = linkMatrix(6, ISLANDS6); for (let k = 0; k < 300; k++) x = googleStep(S6, x, 1); nearV(x, [0.4, 0.2, 0.4, 0, 0, 0], 1e-9, 'islands6');
    near(secondModulus(spectrum(googleMatrix(S6, 6, 0.85), 6)), 0.85, 1e-6, 'islands6 λ₂'); if (multiplicityOfOne(spectrum(S6, 6)) !== 2) throw new Error('islands6 double 1'); }
  // the quest is winnable from Moler's web in one cut
  if (questWon(6, MOLER_EDGES, pi)) throw new Error('quest won at start');
  const cut = MOLER_EDGES.filter(([a, b]) => !(a === 3 && b === 0));
  if (!questWon(6, cut, pagerankExact(linkMatrix(6, cut), 6, 0.85))) throw new Error('quest unwinnable');
  return true;
}

export const _test = {
  outLists, linkMatrix, chainMatrix, googleStep, pagerankPower, pagerankExact, solve, cesaroLimit,
  googleMatrix, charPoly, polyRoots, spectrum, secondModulus, multiplicityOfOne, clicksTo,
  undirectedEdges, laplacian, jacobiEigen, drumModes, strikePartials, iterate2, eig2, mapDirection,
  surferHop, surferStep, mulberry32, inDegrees, questWon, l1, uniform, basis, drumPreset,
  MOLER_EDGES, BL_EDGES, ONEGIN_WEDGES, RING5, TRAP_EDGES, ISLAND_EDGES, TRAP6, ISLANDS6, WEB_PRESETS,
  selfTest,
};
