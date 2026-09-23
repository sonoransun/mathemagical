// II.4 — Chladni Figures
// A driven square plate: sand walks down the plate's time-averaged motion and
// gathers on the nodal lines of the very mode you are hearing. Two plates share
// the stage. Wheatstone's 1833 shorthand superposes cosine twins,
//   w(x,y) = cos θ·cos(mπx)cos(nπy) + sin θ·cos(nπx)cos(mπy),  (x,y) ∈ [0,1]²,
// with the stiff-plate scaling f ∝ m² + n² (θ = ±45° are the classic ± twins).
// Ritz's free plate is the real thing: the biharmonic plate with free edges,
// solved here at run time by the Rayleigh–Ritz method on a Legendre basis
// (degree < 16 per direction, split by the square's symmetries, cyclic Jacobi).
// At ν = 0.3 it reproduces Leissa's NASA SP-160 tables (Table 4.65 and
// neighbours: 13.47, 19.5961, 24.2702, 34.8011, 61.0932, 63.687, …, λ = ωa²√(ρh/D))
// to four or five figures; at ν = 0 the diagonal cross and the ring merge at
// 22.373 = 4.7300², the free–free beam's value, as the free-edge conditions
// predict for a Poisson ratio of zero.
//
// Sand: grains descend the time average E = |Σ Hₖ φₖ|² of the driven plate (complex
// modal responses Hₖ), with a mobility that vanishes where the plate is too still to
// throw them, so figures settle as lines. The readout counts nodal domains by flood
// fill; for the shorthand (the free-rimmed square membrane) it shows Courant's 1923
// bound, reached on this slider only by (1,1), (2,0)+ and (2,2), three of the five
// Courant-sharp tones Helffer & Persson Sundqvist (Moscow Math. J. 15, 2015) found.
//
// Kac section: the Gordon–Webb–Wolpert pair in its familiar half-square form,
// at Cleve Moler's coordinates (MathWorks blog, 6 Aug 2012):
//   drum1 = [0 0 2 2 3 2 1 1; 0 1 3 2 2 1 1 0], drum2 = [1 0 0 2 2 3 2 1; 0 1 2 2 3 2 1 1],
// and the twenty eigenvalues Moler computed with the 5-point Laplacian on a grid
// of spacing h = 1/32. The gridded drums are themselves isospectral, so the two
// computed columns agree to ~13 digits; as values for the true drums they are
// good to ~3 figures (λ₉ is exactly 5π² ≈ 49.348; the grid gives 49.213).
// The seven tiles below are the reflection tiling (every shared edge a mirror,
// Buser–Conway–Doyle–Semmler 1994); in these coordinates the ninth
// eigenfunction is sin πx·sin 2πy + sin 2πx·sin πy, which vanishes on every
// tile edge of both drums (Moler, Part 2, 13 Aug 2012, in flipped coordinates).

const PI = Math.PI;
const F_SCALE = 55;           // Hz per unit of m² + n²  → (1,1) sounds at 110 Hz (A2)
const BASE = 2 * F_SCALE;     // both plates are tuned to share this lowest tone
const MAXM = 8;               // complete below FHI: 9² = 81 > FHI/F_SCALE = 72
const FLO = 90, FHI = 3960;   // slider range, Hz (log-mapped)
const RMAX = FHI / BASE;      // ladder span, ×1 … ×36
const ZETA = 0.014;           // the ear's resonance: half-power half-width 1.4 %, wide enough to sweep into
const ZETA_SAND = 0.0004;     // off-resonant neighbours leak in as through brass, Q ≈ 1250 (a plate rings for seconds)
const GRID = 128;             // field grid, cells per side
const NU0 = 0.3;              // Leissa's tables use ν = 0.3
const RITZ_N = 16;            // Legendre degrees 0…15 per direction

/* ---------------- pure algorithmic core (node-testable) ---------------- */

// Degenerate-pair mode shape on the unit square (the shell's backdrop uses this).
function modeW(x, y, m, n, s = 1) {
  return Math.cos(m * PI * x) * Math.cos(n * PI * y)
       + s * Math.cos(n * PI * x) * Math.cos(m * PI * y);
}

// Analytic gradient of modeW.
function modeGrad(x, y, m, n, s = 1) {
  const cmx = Math.cos(m * PI * x), smx = Math.sin(m * PI * x);
  const cnx = Math.cos(n * PI * x), snx = Math.sin(n * PI * x);
  const cmy = Math.cos(m * PI * y), smy = Math.sin(m * PI * y);
  const cny = Math.cos(n * PI * y), sny = Math.sin(n * PI * y);
  return [
    -m * PI * smx * cny - s * n * PI * snx * cmy,
    -n * PI * cmx * sny - s * m * PI * cnx * smy,
  ];
}

const modeK = (m, n) => m * m + n * n;
const modeFreq = (m, n) => F_SCALE * modeK(m, n);

// Ordered pairs (m, n), m, n ≥ 0, with m² + n² = k: the shorthand's multiplicity.
function reps(k) {
  const out = [];
  for (let m = 0; m * m <= k; m++) {
    const r = k - m * m, n = Math.round(Math.sqrt(r));
    if (n * n === r) out.push([m, n]);
  }
  return out;
}
const isSumOfTwoSquares = (k) => reps(k).length > 0;

// Every shorthand mode (m ≥ n ≥ 0) on the slider, sorted by m² + n², i.e. by
// frequency. (1,0) is left out: w = cos πx ± cos πy is a membrane's mode, but a
// free plate has nothing below its twisting (1,1) figure — and it sits below FLO.
function buildCatalog() {
  const cat = [];
  for (let m = 1; m <= MAXM; m++)
    for (let n = 0; n <= m; n++) {
      const k = modeK(m, n), f = F_SCALE * k;
      if (f < FLO || f > FHI) continue;
      cat.push({ m, n, k, f, twin: m !== n });
    }
  cat.sort((a, b) => a.k - b.k || b.m - a.m);
  return cat;
}

// Steady-state response of a mode at fk to a drive at f, normalised so the peak
// is −i (quadrature, magnitude 1). Returns [re, im].
function modeResponse(f, fk, zeta = ZETA) {
  const r = f / fk, a = 1 - r * r, b = 2 * zeta * r, d = a * a + b * b;
  return [(2 * zeta * a) / d, (-2 * zeta * b) / d];
}

// Energy response |H|² of every catalog mode; best = strongest.
function resonanceWeights(f, catalog) {
  const weights = catalog.map((e) => {
    const [re, im] = modeResponse(f, e.f);
    return re * re + im * im;
  });
  let best = 0;
  for (let i = 1; i < weights.length; i++) if (weights[i] > weights[best]) best = i;
  return { weights, best, res: weights[best] };
}

// A strike at (px, py) excites each mode in proportion to its displacement there
// (a point impulse projects onto every eigenspace). For a twin pair the blow
// chooses the mixture itself: c·φ(m,n) + s·φ(n,m) with (c, s) ∝ (φmn(p), φnm(p)).
// Stiffer modes couple less. `rand` is accepted for backward compatibility.
function strikeExcitation(px, py, catalog, rand) { // eslint-disable-line no-unused-vars
  const out = [];
  for (const e of catalog) {
    const A = Math.cos(e.m * PI * px) * Math.cos(e.n * PI * py);
    const B = Math.cos(e.n * PI * px) * Math.cos(e.m * PI * py);
    let amp, c = 1, s = 0;
    if (e.twin) { amp = Math.hypot(A, B); if (amp > 1e-12) { c = A / amp; s = B / amp; } }
    else amp = Math.abs(A);
    const a = amp * Math.pow(BASE / e.f, 0.35);
    out.push({ m: e.m, n: e.n, k: e.k, f: e.f, c, s, a });
  }
  out.sort((a, b) => b.a - a.a);
  const top = out.slice(0, 8);
  const mx = top.length ? top[0].a : 0;
  if (mx < 1e-9) return [];
  for (const e of top) e.a /= mx;
  return top;
}

// slider position (0..1) ↔ frequency, log-mapped
const tToF = (t) => FLO * Math.pow(FHI / FLO, t);
const fToT = (f) => Math.log(f / FLO) / Math.log(FHI / FLO);

/* ------------- Ritz's free plate: Rayleigh–Ritz on Legendre products ------------- */

function gaussLegendre(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((PI * (i + 0.75)) / (n + 0.5)), pp = 1;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const dz = p1 / pp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = z; w[i] = 2 / ((1 - z * z) * pp * pp);
  }
  return { x, w };
}

// Orthonormal Legendre polynomials on [−1, 1] and their first two derivatives,
// via P'ₙ₊₁ = P'ₙ₋₁ + (2n+1)Pₙ (no singularity at ±1).
function legendreTables(N, xs) {
  const K = xs.length, P = [], D1 = [], D2 = [];
  for (let i = 0; i < N; i++) { P.push(new Float64Array(K)); D1.push(new Float64Array(K)); D2.push(new Float64Array(K)); }
  for (let k = 0; k < K; k++) {
    const x = xs[k];
    P[0][k] = 1;
    if (N > 1) { P[1][k] = x; D1[1][k] = 1; }
    for (let n = 1; n + 1 < N; n++) {
      P[n + 1][k] = ((2 * n + 1) * x * P[n][k] - n * P[n - 1][k]) / (n + 1);
      D1[n + 1][k] = D1[n - 1][k] + (2 * n + 1) * P[n][k];
      D2[n + 1][k] = D2[n - 1][k] + (2 * n + 1) * D1[n][k];
    }
  }
  for (let i = 0; i < N; i++) {
    const s = Math.sqrt((2 * i + 1) / 2);
    for (let k = 0; k < K; k++) { P[i][k] *= s; D1[i][k] *= s; D2[i][k] *= s; }
  }
  return { P, D1, D2 };
}

// Cyclic Jacobi for a symmetric n×n matrix (row-major). V holds eigenvectors in columns.
function jacobiEigen(Ain, n) {
  const A = Float64Array.from(Ain), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0, diag = 0;
    for (let p = 0; p < n; p++) {
      diag += A[p * n + p] * A[p * n + p];
      for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
    }
    if (off <= 1e-28 * diag) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const th = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k * n + p], vkq = V[k * n + q];
        V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
      }
    }
  }
  const vals = new Float64Array(n);
  for (let i = 0; i < n; i++) vals[i] = A[i * n + i];
  return { vals, V };
}

// The completely free square plate, side 2 on [−1,1]²: minimise the strain energy
//   ∫∫ w_xx² + w_yy² + 2ν w_xx w_yy + 2(1−ν) w_xy²   against   ∫∫ w²
// over products of orthonormal Legendre polynomials. The basis splits by parity
// in x and y and, for equal parities, by symmetry about the diagonal. Returns
// modes sorted by λ = ωa²√(ρh/D); `twin` marks the eo class, whose partner is
// its transpose (the square's genuine, symmetry-enforced degeneracy).
function ritzFreePlate(nu = NU0, N = RITZ_N) {
  const { x, w } = gaussLegendre(N + 4);
  const T = legendreTables(N, x);
  const nq = x.length;
  const dot = (a, b) => { let s = 0; for (let q = 0; q < nq; q++) s += w[q] * a[q] * b[q]; return s; };
  const A1 = [], A2 = [], B = [];
  for (let i = 0; i < N; i++) {
    A1.push(new Float64Array(N)); A2.push(new Float64Array(N)); B.push(new Float64Array(N));
    for (let k = 0; k < N; k++) {
      A1[i][k] = dot(T.D1[i], T.D1[k]);
      A2[i][k] = dot(T.D2[i], T.D2[k]);
      B[i][k] = dot(T.D2[i], T.P[k]);
    }
  }
  const Kof = (i, j, k, l) =>
    (j === l ? A2[i][k] : 0) + (i === k ? A2[j][l] : 0)
    + nu * (B[i][k] * B[l][j] + B[k][i] * B[j][l])
    + 2 * (1 - nu) * A1[i][k] * A1[j][l];
  const modes = [];
  const solve = (cols, cls, twin) => {
    const n = cols.length, K = new Float64Array(n * n);
    for (let a = 0; a < n; a++) for (let b = a; b < n; b++) {
      let v = 0;
      for (const [i, j, wa] of cols[a]) for (const [k, l, wb] of cols[b]) v += wa * wb * Kof(i, j, k, l);
      K[a * n + b] = v; K[b * n + a] = v;
    }
    const { vals, V } = jacobiEigen(K, n);
    for (let e = 0; e < n; e++) {
      if (!(vals[e] > 1e-6)) continue;                       // rigid-body motions
      const terms = new Map();
      for (let a = 0; a < n; a++) {
        const va = V[a * n + e];
        if (!va) continue;
        for (const [i, j, wa] of cols[a]) terms.set(i * N + j, (terms.get(i * N + j) || 0) + va * wa);
      }
      const I = [], J = [], C = [];
      for (const [key, c] of terms) { I.push((key / N) | 0); J.push(key % N); C.push(c); }
      modes.push({ lam: 4 * Math.sqrt(vals[e]), cls, twin, I, J, C, N });
    }
  };
  const r2 = Math.SQRT1_2;
  for (const p of [0, 1]) {
    const sym = [], anti = [];
    for (let i = p; i < N; i += 2) for (let j = i; j < N; j += 2) {
      if (i === j) sym.push([[i, i, 1]]);
      else { sym.push([[i, j, r2], [j, i, r2]]); anti.push([[i, j, r2], [j, i, -r2]]); }
    }
    solve(sym, p ? 'oo+' : 'ee+', false);
    solve(anti, p ? 'oo−' : 'ee−', false);
  }
  const mixed = [];
  for (let i = 0; i < N; i += 2) for (let j = 1; j < N; j += 2) mixed.push([[i, j, 1]]);
  solve(mixed, 'eo', true);
  modes.sort((a, b) => a.lam - b.lam);
  return modes;
}

// A Ritz mode's value at (x, y) ∈ [0,1]² (L²-normalised on the side-2 square).
function ritzValueAt(mode, x, y) {
  const T = legendreTables(mode.N, [2 * x - 1, 2 * y - 1]);
  let s = 0;
  for (let t = 0; t < mode.C.length; t++) s += mode.C[t] * T.P[mode.I[t]][0] * T.P[mode.J[t]][1];
  return s;
}

// A Ritz mode sampled on the (G+1)² grid, W[gy·(G+1)+gx] at (gx/G, gy/G), max |W| = 1.
function ritzModeGrid(mode, Tg, G = GRID) {
  const n1 = G + 1, W = new Float32Array(n1 * n1), col = new Float64Array(n1);
  const byI = new Map();
  for (let t = 0; t < mode.C.length; t++) {
    const i = mode.I[t];
    if (!byI.has(i)) byI.set(i, []);
    byI.get(i).push(t);
  }
  for (const [i, ts] of byI) {
    col.fill(0);
    for (const t of ts) { const Pj = Tg.P[mode.J[t]], c = mode.C[t]; for (let g = 0; g < n1; g++) col[g] += c * Pj[g]; }
    const Pi = Tg.P[i];
    for (let gy = 0; gy < n1; gy++) {
      const cy = col[gy];
      if (!cy) continue;
      const row = gy * n1;
      for (let gx = 0; gx < n1; gx++) W[row + gx] += Pi[gx] * cy;
    }
  }
  let mx = 0;
  for (let q = 0; q < W.length; q++) { const a = Math.abs(W[q]); if (a > mx) mx = a; }
  if (mx > 0) for (let q = 0; q < W.length; q++) W[q] /= mx;
  return W;
}

// Zero set of a sampled field by marching squares → [x0,y0,x1,y1,…] in unit coords.
function nodalSegments(F, n1) {
  const out = [], G = n1 - 1, b = 1e-7;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const a = F[gy * n1 + gx] + b, bb = F[gy * n1 + gx + 1] + b;
    const c = F[(gy + 1) * n1 + gx + 1] + b, d = F[(gy + 1) * n1 + gx] + b;
    const sa = a > 0, sb = bb > 0, sc = c > 0, sd = d > 0;
    if (sa === sb && sb === sc && sc === sd) continue;
    const top = sa !== sb ? [gx + a / (a - bb), gy] : null;
    const right = sb !== sc ? [gx + 1, gy + bb / (bb - c)] : null;
    const bottom = sd !== sc ? [gx + d / (d - c), gy + 1] : null;
    const left = sa !== sd ? [gx, gy + a / (a - d)] : null;
    const pts = [top, right, bottom, left].filter(Boolean);
    const push = (p, q) => out.push(p[0] / G, p[1] / G, q[0] / G, q[1] / G);
    if (pts.length === 2) push(pts[0], pts[1]);
    else if (pts.length === 4) {
      if (((a + bb + c + d) / 4 > 0) === sa) { push(top, right); push(bottom, left); }
      else { push(top, left); push(right, bottom); }
    }
  }
  return new Float32Array(out);
}

// Nodal domains of a sampled field: 4-connected regions of one sign. Grid points
// within about ¾ of a cell of the zero set (|F| < ¾·|∇F|, in cell units) belong to no
// region, so two regions that only touch at a crossing or at the rim are never
// joined through it. Specks of fewer than `minPts` points are ignored.
function nodalDomains(F, n1, minPts = 4) {
  const N = n1 * n1, lab = new Int32Array(N), stack = new Int32Array(N);
  const skip = new Uint8Array(N);
  let mx = 0;
  for (let q = 0; q < N; q++) { const a = Math.abs(F[q]); if (a > mx) mx = a; }
  if (!(mx > 0)) return 0;
  for (let y = 0; y < n1; y++) for (let x = 0; x < n1; x++) {
    const q = y * n1 + x;
    const gx = x === 0 ? F[q + 1] - F[q] : x === n1 - 1 ? F[q] - F[q - 1] : (F[q + 1] - F[q - 1]) / 2;
    const gy = y === 0 ? F[q + n1] - F[q] : y === n1 - 1 ? F[q] - F[q - n1] : (F[q + n1] - F[q - n1]) / 2;
    if (Math.abs(F[q]) <= Math.max(1e-9 * mx, 0.75 * Math.hypot(gx, gy))) skip[q] = 1;
  }
  let count = 0, next = 0;
  for (let s = 0; s < N; s++) {
    if (skip[s] || lab[s]) continue;
    const sg = F[s] > 0;
    next++;
    let top = 0, size = 0;
    stack[top++] = s; lab[s] = next;
    while (top) {
      const q = stack[--top];
      size++;
      const x = q % n1, y = (q / n1) | 0;
      const nb = [x > 0 ? q - 1 : -1, x < n1 - 1 ? q + 1 : -1, y > 0 ? q - n1 : -1, y < n1 - 1 ? q + n1 : -1];
      for (const r of nb) {
        if (r < 0 || skip[r] || lab[r] || (F[r] > 0) !== sg) continue;
        lab[r] = next; stack[top++] = r;
      }
    }
    if (size >= minPts) count++;
  }
  return count;
}

// Courant's bound for the shorthand's tone m² + n² = k. The shorthand's cosines are the
// modes of a square membrane with a free rim (Neumann), whose spectrum, counted with
// multiplicity from the constant mode up, is every a² + b² with a, b ≥ 0. A tone whose
// first index in that list is K can cut the square into at most K nodal domains
// (Courant 1923).
function courantIndex(k) {
  let below = 0;
  for (let a = 0; a * a < k; a++) for (let b = 0; a * a + b * b < k; b++) below++;
  return below + 1;
}

/* ------------- Gordon–Webb–Wolpert data (verified — see header) ------------- */

const DRUM_A = [[0, 0], [0, 1], [2, 3], [2, 2], [3, 2], [2, 1], [1, 1], [1, 0]];
const DRUM_B = [[1, 0], [0, 1], [0, 2], [2, 2], [2, 3], [3, 2], [2, 1], [1, 1]];
// Each drum holds two whole unit squares; the reflection tiling splits them along
// these diagonals (the other tile edges lie on the unit grid).
const DRUM_A_DIAGS = [[[1, 0], [0, 1]], [[2, 1], [1, 2]]];
const DRUM_B_DIAGS = [[[0, 1], [1, 2]], [[2, 1], [1, 2]]];
// The seven half-square tiles of each drum.
const DRUM_A_TILES = [
  [[0, 0], [1, 0], [0, 1]], [[1, 0], [1, 1], [0, 1]], [[0, 1], [1, 1], [1, 2]],
  [[1, 1], [2, 1], [1, 2]], [[2, 1], [2, 2], [1, 2]], [[1, 2], [2, 2], [2, 3]], [[2, 1], [3, 2], [2, 2]],
];
const DRUM_B_TILES = [
  [[1, 0], [1, 1], [0, 1]], [[0, 1], [1, 1], [1, 2]], [[0, 1], [1, 2], [0, 2]],
  [[1, 1], [2, 1], [1, 2]], [[2, 1], [2, 2], [1, 2]], [[2, 1], [3, 2], [2, 2]], [[2, 2], [3, 2], [2, 3]],
];

// First 20 Dirichlet eigenvalues computed on these polygons by Moler (2012):
// 5-point finite-difference Laplacian, h = 1/32, MATLAB eigs.
const GWW_EIGS = [
  10.165879621248989, 14.630600866993412, 20.717633982094981,
  26.115126153750705, 28.983478457829740, 36.774063407607322,
  42.283017757114585, 46.034233949715308, 49.213425509524733,
  52.126973962396342, 57.063486161172904, 63.350675017756465,
  67.491111510445251, 70.371453210957910, 75.709992784621988,
  83.153242199788906, 84.673734481953971, 88.554340162610174,
  94.230337192953158, 97.356922250794767,
];
const NINTH_EXACT = 5 * PI * PI;

// The ninth eigenfunction of both drums, in the drawing's coordinates.
const kacNinth = (x, y) => Math.sin(PI * x) * Math.sin(2 * PI * y) + Math.sin(2 * PI * x) * Math.sin(PI * y);

function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function polygonPerimeter(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ------------------------------- the exhibit ------------------------------- */

export default {
  id: 'chladni',
  movement: 2,
  title: 'Chladni Figures',
  hook: 'Sand finds the silence inside a sound.',
  era: '1787 – today · Wittenberg, Paris, Göttingen, Espoo',
  prose: `
    <p>In 1787 Ernst Chladni, a doctor of philosophy and law at Wittenberg, published a
    book of figures that, as he later wrote, no one had yet seen. His first instrument was
    a brass disc from a grinding machine, clamped by a peg at its centre in a vice. He had
    read of the Abbé Mazzocchi’s bells, played with violin bows, and he knew the figures
    Georg Christoph Lichtenberg raised in resin dust on electrified plates; so he drew a bow
    across the edge of the disc, strewed sand on it, and watched a star of ten or twelve
    rays appear. The sand, his book explains, “is thrown off the vibrating places and lies
    quietly on the places that do not vibrate.” A plate ringing at one pitch divides itself
    into regions swinging up and down in opposition, and the boundaries between them, the
    <em>nodal lines</em>, do not move at all. The sand is not decoration; it is a
    measurement, a portrait of the tone drawn by the sound’s own hand. Bow the plate below
    and sweep its pitch: the tone swells each time it meets a resonance, and the sand walks
    into the figure that frequency owns. Strike the plate instead and many tones ring at
    once; Chladni found that a mere blow gives mixed tones, too faint and too brief to draw
    a figure, which is why the bow was “absolutely necessary.”</p>
    <p>He took the figures on the road. In Paris the Emperor summoned him and watched the
    sand move, and in 1809 the Institut de France, at Napoleon’s wish, offered “all the
    scholars of Europe” a gold medal worth 3,000 francs for “the mathematical theory of the
    vibrations of elastic surfaces,” compared with experiment. The Institut’s own programme
    admitted that nobody had even the differential equations. Lagrange judged the analysis
    of the day unequal to the task, and a single contestant came forward: Sophie Germain,
    self-taught, shut out as a woman from the École Polytechnique, who had once sent
    Lagrange her work under a student’s name, “M. LeBlanc.” Her first memoir failed and her
    second earned an honourable mention. Her third won, and the prize was announced on
    8 January 1816 at a public session she did not attend. Her equation was right and her
    conditions at the plate’s edge were wrong. Gustav Kirchhoff found the right ones in
    1850, and in 1909 Walther Ritz, who died of tuberculosis that July at thirty-one,
    computed the tones of a free square plate, the problem he chose to show off the method
    that now bears his name.</p>
    <p>The figures on this plate begin from an older shortcut. In 1833 Charles Wheatstone
    explained Chladni’s patterns as two simple vibrations of one pitch laid over each other,
    which for a square gives <code>w(x,y) = cos mπx·cos nπy ± cos nπx·cos mπy</code>. A
    single cosine product would only ever draw a grid, but the modes <code>(m,n)</code> and
    <code>(n,m)</code> are twins with one frequency, and twins are free to superpose, so the
    plate folds its grids into diagonals, crosses and stars. (The pair
    <code>(1,2)+(2,1)</code> vanishes along the whole anti-diagonal; turn the twin dial and
    watch a figure pass through a plain grid into its own reflection.) Rayleigh saw that
    these forms belong strictly to a membrane whose rim is free to slide, and that they
    “resemble the figures obtained by means of sand on a square plate more closely than
    might have been expected. The sequence of tones is however quite different.” A real
    plate obeys the fourth-order equation <code>∇⁴w = k⁴w</code>, and with its edges free
    the square has no known solution in closed form. Switch the stage to Ritz’s plate to
    see its figures as they are computed: the ring rounds out, straight lines begin to bow,
    and every tone moves.</p>
    <p>Now listen rather than look. In the shorthand the resonances stand at 2, 4, 5, 8, 9,
    10 and 13 times a base, every one a sum of two squares, the arithmetic Pierre de Fermat
    laid out for Marin Mersenne on Christmas Day, 1640. The rungs 3, 6, 7, 11 and 12 are
    simply missing, and where a number is a sum of two squares in two ways, as
    25 = 5² + 0² = 4² + 3², two unrelated figures share a pitch. Measured from the lowest,
    the partials sit at 1, 2, 2½, 4, 4½, 5, 6½: no longer the string’s 1, 2, 3, 4. The true
    plate is stranger still. For a metal with Poisson’s ratio 0.3, Ritz’s method puts a
    free square’s first tones at 1, 1.45, 1.80 and 2.58 times the lowest, ratios that no
    fundamental gathers. Rayleigh reasoned that the diagonal cross and the ring, twins in
    the shorthand, “should have exactly the same pitch” whatever the metal, and noted that
    Chladni had heard them more than a whole tone apart. Chladni was right. They part by
    nearly a major third, and meet only in a material that does not thin when it is
    stretched. That is why strings sing and plates clang: harmonic partials fuse into one
    pitch, inharmonic ones shimmer and beat, and bell-founders cut metal from the inside of
    a bell to drag its stubborn partials toward harmony. The geometry of the resonator is
    the timbre.</p>
    <p>In 1882 the spectroscopist Arthur Schuster declared that it “would baffle the most
    skillful mathematicians to solve the inverse problem and to find out the shape of a
    bell by means of the sounds which it is capable of sending out.” In 1966 Mark Kac, who
    credited the problem to Salomon Bochner, gave it its most charming form: <em>can one
    hear the shape of a drum?</em> Much of a drum is audible. Hermann Weyl showed in 1911
    that the high overtones count its area; finer asymptotics recover its perimeter, and a
    smoothly bounded drum even confesses how many holes it has. Yet in 1992 Carolyn Gordon,
    David Webb and Scott Wolpert found two different plane drums that share every
    frequency, with every multiplicity, whether their rims are clamped or free.</p>
    <p>In the form in which the pair is usually drawn, each drum is folded by reflection
    from seven identical half-squares, and one of the shared tones can be written down
    exactly: the ninth, 5π², is a single triangle’s lowest hum reflected into all seven
    tiles of both drums. Strike them both below. The same frequencies ring from each, and
    the failure to tell them apart is not yours; it is a theorem. In 1994 Peter Buser, John
    Conway, Peter Doyle and Klaus-Dieter Semmler went further, with a pair that sounds alike
    even in loudness when each is struck at one special point: “one really can’t hear the
    shape of a drum.” The answer to Kac is no, and the deeper lesson of this whole movement
    is how much of a shape a sound already is.</p>`,

  chronicle: [
    { year: 1787, date: '1787', text: 'In Leipzig, Ernst Chladni of Wittenberg publishes <em>Entdeckungen über die Theorie des Klanges</em>, with eleven copperplates of figures drawn in sand on bowed plates.' },
    { year: 1809, date: '1809', text: 'After Napoleon watches Chladni’s sand figures, the Institut de France offers a gold medal worth 3,000 francs for “the mathematical theory of the vibrations of elastic surfaces.”' },
    { year: 1816, date: '8 January 1816', text: 'Sophie Germain, for years the contest’s only entrant, wins the Institut’s prize on her third attempt, with the right equation for a vibrating plate but the wrong conditions at its edge.' },
    { year: 1909, date: '1909', text: 'Walther Ritz computes the tones of a square plate with free edges, the problem he chose to demonstrate his new method; he dies of tuberculosis that July, aged thirty-one.' },
    { year: 1966, date: 'April 1966', text: 'Mark Kac asks in the <em>American Mathematical Monthly</em>: “Can one hear the shape of a drum?”' },
    { year: 1992, date: '1992', text: 'Carolyn Gordon, David Webb and Scott Wolpert answer Mark Kac’s question: two different plane drums can share every frequency, with their rims clamped or free.' },
    { year: 2016, date: 'September 2016', text: 'At Aalto University a single piezoelectric element, driving a five-centimetre silicon plate from its centre, plays chosen notes that steer several objects across the plate at once, each to its own destination.' },
    { year: 2022, date: '2022', text: 'In the <em>Annals of Mathematics</em>, Hamid Hezari and Steve Zelditch publish their proof that a nearly circular ellipse can be heard: its spectrum singles it out among all smooth plane domains.' },
  ],

  today: `
    <p>Chladni’s sand never retired. Violin makers still read the figures as they carve;
    the patterns, in the words of the music acoustics group at the University of New South
    Wales, “provide feedback to the maker during the process of scraping the plate to its
    final shape.” In 2016 engineers at Aalto University turned the demonstration into a
    machine. On a 50-millimetre square of silicon driven by a single piezoelectric element,
    they learned how objects drift under each of 59 notes, then played sequences of notes
    that steered several objects at once, from plant seeds to droplets on carriers, each to
    its own target; by 2021 they were arranging up to a hundred sub-millimetre particles
    into shapes of their choosing. Shrink the plate to a channel 350 micrometres wide and a
    standing ultrasonic wave sorts the particles flowing through it by size and density: in
    2007 Thomas Laurell’s group at Lund split red cells, platelets and leukocytes into
    separate outlets.</p>
    <p>The mathematics travelled further than the sand. The shorthand’s products of two
    cosines are the sixty-four patterns a JPEG keeps or forgets in every 8×8 block
    (<a href="#ex-lossy">The Art of Forgetting</a>). Every sand figure is an eigenvector of
    its plate, and the links of the web have one too, which ranks their pages
    (<a href="#ex-eigen">0.85</a>). Kac’s question is still answered one shape at a time.
    In 1994 the isospectral pair was built as two thin microwave cavities, and at least 54
    of their measured resonances agreed to a few parts in ten thousand. In 2022 Hamid
    Hezari and Steve Zelditch published a proof that a nearly circular ellipse is singled
    out by its spectrum among all smooth domains. Before them only the disk was known to be heard that
    way, and for a plain reason: area and perimeter are audible, and no other shape encloses
    so much with so little.</p>`,

  sources: [
    { text: 'E. F. F. Chladni, <em>Entdeckungen über die Theorie des Klanges</em> (Leipzig, 1787)', url: 'https://archive.org/details/entdeckungenuber00chla' },
    { text: 'E. F. F. Chladni, <em>Traité d’acoustique</em> (Paris, 1809), with the Institut’s prize programme', url: 'https://archive.org/details/traitdacoustiqu00chlagoog' },
    { text: 'J. J. O’Connor and E. F. Robertson, “Sophie Germain,” MacTutor History of Mathematics', url: 'https://mathshistory.st-andrews.ac.uk/Biographies/Germain/' },
    { text: 'Lord Rayleigh, <em>The Theory of Sound</em>, vol. 1, 2nd ed. (1894), ch. X, §§ 223–227', url: 'https://archive.org/details/theorysound07raylgoog' },
    { text: 'A. W. Leissa, <em>Vibration of Plates</em>, NASA SP-160 (1969), § 4.3.15 and Tables 4.60–4.67', url: 'https://ntrs.nasa.gov/citations/19700009156' },
    { text: 'M. Kac, “Can One Hear the Shape of a Drum?”, <em>American Mathematical Monthly</em> 73 (1966) 1–23', url: 'https://doi.org/10.2307/2313748' },
    { text: 'C. Gordon, D. Webb and S. Wolpert, “One cannot hear the shape of a drum,” <em>Bull. Amer. Math. Soc.</em> 27 (1992) 134–138', url: 'https://arxiv.org/abs/math/9207215' },
    { text: 'P. Buser, J. Conway, P. Doyle and K.-D. Semmler, “Some planar isospectral domains,” <em>Int. Math. Res. Notices</em> (1994) 391–400', url: 'https://arxiv.org/abs/1005.1839' },
    { text: 'O. Giraud and K. Thas, “Hearing shapes of drums: mathematical and physical aspects of isospectrality,” <em>Rev. Mod. Phys.</em> 82 (2010) 2213', url: 'https://arxiv.org/abs/1101.1239' },
    { text: 'C. Moler, “Can One Hear the Shape of a Drum?” Parts 1–2, <em>Cleve’s Corner</em>, MathWorks (August 2012)', url: 'https://blogs.mathworks.com/cleve/2012/08/06/can-one-hear-the-shape-of-a-drum-part-1-eigenvalues/' },
  ],

  alt: 'A square brass plate strewn with three thousand grains of sand that gather on its nodal lines when a tone is sounded, beside a ladder comparing a string’s harmonics, the cosine shorthand’s tones and a real free plate’s tones on one scale of octaves; below, two differently shaped drums, each folded from seven half-square triangles, share one ladder of twenty tones.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const wheatCat = buildCatalog();
    const doc = stage.ownerDocument || document;
    const SERIF = (() => { try { return getComputedStyle(doc.body).fontFamily || 'Georgia, serif'; } catch { return 'Georgia, serif'; } })();
    const MONO = (() => {
      try { return getComputedStyle(doc.documentElement).getPropertyValue('--mono').trim() || 'ui-monospace, Menlo, monospace'; }
      catch { return 'ui-monospace, Menlo, monospace'; }
    })();
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => !!(mq && mq.matches);

    /* ---------- scoped style ---------- */
    const style = doc.createElement('style');
    style.textContent = `
      #ex-chladni .ch-wrap { position: relative; }
      #ex-chladni .ch-wrap canvas:focus-visible { outline: 2px solid var(--gold-bright, #e8c87c); outline-offset: 2px; }
      #ex-chladni .controls.ch-row2 { margin-top: .2rem; }
      #ex-chladni .ch-nu[hidden] { display: none; }
      #ex-chladni .ch-kac-head { margin: 2.6rem auto .9rem; text-align: center; font-family: var(--serif, Georgia, serif);
        font-style: italic; font-size: 1.12rem; color: var(--gold-bright, #e8c87c); text-wrap: balance; }
      #ex-chladni .ch-kac-head .ch-by { display: block; margin-top: .2rem; font-style: normal; font-size: .72rem;
        letter-spacing: .18em; font-variant-caps: all-small-caps; color: var(--ink-dim, #a9a493); }
      #ex-chladni .ch-kac-row { justify-content: center; }
      #ex-chladni .ch-nw { white-space: nowrap; }
    `;
    stage.appendChild(style);

    /* ---------- state ---------- */
    let model = 'wheat';                        // 'wheat' | 'ritz'
    let theta = PI / 4;                         // twin mix
    let nu = NU0;
    let powder = 'sand';                        // 'sand' | 'lyco'
    let showTheory = false;
    let driveOn = false;
    let driveF = modeFreq(3, 1);                // the plate "was last bowed" at (3,1)
    let driveRes = 0, nearest = null;           // nearest catalog entry at driveF
    let strike = null;                          // {t0, modes:[{e, c, s, a, tau}]}
    let strikeFx = null;                        // {x, y, t0}
    let kacStrike = null;                       // {drum, x, y, t0, parts}
    let ninthOn = false, ninthT0 = 0;
    let needsDraw = true, kacDirty = true, ladderDirty = true, fieldDirty = true;
    let questStage = 0;                         // 0: find the ring; 1: find the split; 2: done
    let questTimer = 0;
    const questSeen = { cross: false, ring: false };
    let ritzCat = null, ritzNu = null;
    const ritzGrids = new Map();

    const bus = audio.createBus('chladni');
    let sweep = null;
    let liveVoices = 0;

    /* ---------- grids ---------- */
    const N1 = GRID + 1, NN = N1 * N1;
    const E = new Float32Array(NN), Ex = new Float32Array(NN), Ey = new Float32Array(NN);
    const R = new Float32Array(NN), Q = new Float32Array(NN), TMP = new Float32Array(NN), SHAPE = new Float32Array(NN);
    const Cg = [];
    for (let k = 0; k <= MAXM; k++) {
      const c = new Float32Array(N1);
      for (let g = 0; g <= GRID; g++) c[g] = Math.cos((k * PI * g) / GRID);
      Cg.push(c);
    }
    const gridXs = [];
    for (let g = 0; g <= GRID; g++) gridXs.push((2 * g) / GRID - 1);
    let TgCache = null;
    const Tg = () => (TgCache || (TgCache = legendreTables(RITZ_N, gridXs)));

    function ensureRitz() {
      if (ritzCat && ritzNu === nu) return ritzCat;
      const modes = ritzFreePlate(nu, RITZ_N);
      const lam1 = modes[0].lam;
      ritzCat = [];
      for (const md of modes) {
        const f = (BASE * md.lam) / lam1;
        if (f > FHI * 1.02) break;
        ritzCat.push({ ritz: md, lam: md.lam, ratio: md.lam / lam1, f, twin: md.twin, cls: md.cls });
      }
      ritzCat.forEach((e, i) => { e.idx = i; });
      // the three figures everyone draws first get their names back
      for (const [cls, name] of [['oo+', 'the cross of centre lines'], ['ee−', 'the diagonal cross'], ['ee+', 'the ring']]) {
        const e = ritzCat.find((q) => q.cls === cls);
        if (e) e.name = name;
      }
      ritzNu = nu;
      ritzGrids.clear();
      return ritzCat;
    }
    const gridOf = (e) => {
      let g = ritzGrids.get(e.idx);
      if (!g) { g = ritzModeGrid(e.ritz, Tg(), GRID); ritzGrids.set(e.idx, g); }
      return g;
    };
    const catalog = () => (model === 'wheat' ? wheatCat : ensureRitz());

    // add w·(c·φA + s·φB) to buf, normalised so the shape's peak is ≤ 1
    function addShape(buf, e, c, s, w) {
      if (!w) return;
      const nrm = e.twin ? 1 / Math.max(1e-6, Math.abs(c) + Math.abs(s)) : 1;
      if (e.m != null) {
        const cm = Cg[e.m], cn = Cg[e.n];
        if (!e.twin) {
          for (let gy = 0; gy < N1; gy++) { const wy = w * cm[gy], row = gy * N1; for (let gx = 0; gx < N1; gx++) buf[row + gx] += cm[gx] * wy; }
        } else {
          const a = w * c * nrm, b = w * s * nrm;
          for (let gy = 0; gy < N1; gy++) {
            const ay = a * cn[gy], by = b * cm[gy], row = gy * N1;
            for (let gx = 0; gx < N1; gx++) buf[row + gx] += cm[gx] * ay + cn[gx] * by;
          }
        }
        return;
      }
      const Wg = gridOf(e);
      if (!e.twin) { for (let q = 0; q < NN; q++) buf[q] += w * Wg[q]; return; }
      const a = w * c * nrm, b = w * s * nrm;
      for (let gy = 0; gy < N1; gy++) {
        const row = gy * N1;
        for (let gx = 0; gx < N1; gx++) buf[row + gx] += a * Wg[row + gx] + b * Wg[gx * N1 + gy];
      }
    }

    /* ---------- sand ---------- */
    const NP = 3000;
    const sx = new Float32Array(NP), sy = new Float32Array(NP), gs = new Float32Array(NP);
    for (let i = 0; i < NP; i++) gs[i] = 1.15 + 0.75 * Math.random();
    function scatterSand() {
      for (let i = 0; i < NP; i++) { sx[i] = 0.004 + 0.992 * Math.random(); sy[i] = 0.004 + 0.992 * Math.random(); }
      needsDraw = true;
    }
    // Lay the grains where a finished figure would leave them: near the zero set of
    // modeW, within a few thousandths of the plate, plus a few strays.
    function settleSand(m, n, s) {
      let k = 0, tries = 0;
      const sig = 0.0042;
      while (k < NP && tries < 400000) {
        tries++;
        const x = 0.004 + 0.992 * Math.random(), y = 0.004 + 0.992 * Math.random();
        if (Math.random() < 0.015) { sx[k] = x; sy[k] = y; k++; continue; }
        const wv = modeW(x, y, m, n, s);
        const [gx, gy] = modeGrad(x, y, m, n, s);
        const d = Math.abs(wv) / Math.max(1e-6, Math.hypot(gx, gy));
        if (d < 3 * sig && Math.random() < Math.exp(-(d * d) / (sig * sig))) { sx[k] = x; sy[k] = y; k++; }
      }
      for (; k < NP; k++) { sx[k] = Math.random(); sy[k] = Math.random(); }
      needsDraw = true;
    }

    /* ---------- DOM ---------- */
    const wrap1 = doc.createElement('div');
    wrap1.className = 'ch-wrap';
    stage.appendChild(wrap1);
    const handle = cv.setupCanvas(wrap1, { get height() { return plateLayout(wrap1.getBoundingClientRect().width || 700).H; } });
    handle.canvas.tabIndex = 0;
    handle.canvas.setAttribute('role', 'button');             // Enter or Space strikes it; [ and ] step

    const row1 = ui.controlRow(stage);
    const driveBtn = ui.button(row1, '⏻ bow the plate', toggleDrive, { primary: true });
    driveBtn.setAttribute('aria-pressed', 'false');
    const freqSlider = ui.slider(row1, {
      label: 'drive frequency', min: 0, max: 1, step: 0.0005, value: fToT(driveF),
      format: (t) => `${Math.round(tToF(t))} Hz`,
      onInput: (t) => applyFrequency(tToF(t)),
    });
    const prevBtn = ui.button(row1, '◂', () => stepResonance(-1), { small: true });
    prevBtn.setAttribute('aria-label', 'previous resonance');
    prevBtn.title = 'previous resonance ( [ )';
    const nextBtn = ui.button(row1, '▸', () => stepResonance(1), { small: true });
    nextBtn.setAttribute('aria-label', 'next resonance');
    nextBtn.title = 'next resonance ( ] )';
    const modeSel = ui.select(row1, {
      label: 'jump to a mode', options: [{ value: '', label: '' }],
      onChange: (v) => {
        const e = catalog()[parseInt(v, 10)];
        if (!e) return;
        prefer = e;
        freqSlider.set(fToT(e.f));
        applyFrequency(e.f);
      },
    });

    const row2 = ui.controlRow(stage);
    row2.classList.add('ch-row2');
    const modelSel = ui.select(row2, {
      label: 'the plate',
      options: [{ value: 'wheat', label: 'Wheatstone’s shorthand' }, { value: 'ritz', label: 'Ritz’s free plate' }],
      value: 'wheat',
      onChange: (v) => setModel(v),
    });
    const twinSlider = ui.slider(row2, {
      label: 'twin dial θ', min: -90, max: 90, step: 1, value: 45,
      format: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}°`,
      onInput: (v) => { theta = (v * PI) / 180; fieldDirty = true; applyFrequency(driveF); },
    });
    const nuSlider = ui.slider(row2, {
      label: 'Poisson’s ratio ν', min: 0, max: 0.45, step: 0.01, value: NU0,
      format: (v) => v.toFixed(2),
      onInput: (v) => { nu = v; scheduleRitz(); },
    });
    nuSlider.el.classList.add('ch-nu');
    nuSlider.el.hidden = true;
    const theoryTgl = ui.toggle(row2, { label: 'nodal lines', value: false, onChange: (v) => { showTheory = v; needsDraw = true; } });
    const powderTgl = ui.toggle(row2, { label: 'lycopodium', value: false, onChange: (v) => { powder = v ? 'lyco' : 'sand'; needsDraw = true; } });
    ui.button(row2, 'scatter the sand', () => { scatterSand(); }, { small: true });

    const formula = ui.mathline(stage, '');
    const info = ui.readout(stage, '');
    const quest = ui.questBanner(stage,
      'Hunt the resonances: sweep until the sand snaps into a figure. Somewhere in the lowest ' +
      'octave hides a square balanced on its corner.');
    ui.caption(stage,
      'One sine drives the plate. Near each resonance the response swells and 3,000 grains walk down the ' +
      'plate’s average motion to its nodal lines; between resonances the plate barely stirs. Click or tap the ' +
      'plate, or press Enter on it, to strike it: every tone the blow excites rings at once, the stiffer ones ' +
      'die first, and the sand, pushed toward places where all of them are still, rarely finds a figure. The ' +
      'ladder sets three spectra on one scale of octaves, tuned to one lowest tone: a string’s harmonics ' +
      '(gold), the shorthand’s sums of two squares (blue; missing numbers dotted, twins doubled) and the free ' +
      'plate as Ritz’s method computes it (ivory). The readout counts nodal domains, the pieces a figure cuts ' +
      'the plate into. Richard Courant proved in 1923 that the k-th tone of a membrane makes at most k of them, ' +
      'and for the free-rimmed square membrane whose modes the shorthand draws, Bernard Helffer and Mikael ' +
      'Persson Sundqvist showed in 2015 that only five tones make exactly k. Three are on this slider: (1,1), ' +
      'the square on its corner, and (2,2). Light powder does the opposite of sand: Michael Faraday showed in ' +
      '1831 that currents of air carry lycopodium to where the plate moves most, and that in thinned air it ' +
      'settles on the nodal lines like sand.');

    // --- Kac / GWW section ---
    const kacHead = doc.createElement('p');
    kacHead.className = 'ch-kac-head';
    kacHead.innerHTML = '“Can one hear the shape of a drum?”<span class="ch-by">Mark Kac, 1966</span>';
    stage.appendChild(kacHead);
    const wrap2 = doc.createElement('div');
    wrap2.className = 'ch-wrap';
    stage.appendChild(wrap2);
    const handle2 = cv.setupCanvas(wrap2, { get height() { return kacLayout(wrap2.getBoundingClientRect().width || 700).H; } });
    handle2.canvas.setAttribute('role', 'img');
    handle2.canvas.setAttribute('aria-label',
      'Two drums, A and B, each made of seven half-square triangles, with one shared ladder of twenty tones between them.');
    const kacRow = ui.controlRow(stage);
    kacRow.classList.add('ch-kac-row');
    ui.button(kacRow, 'strike drum A', () => strikeDrum(0, 0.62, 0.48), { small: true });
    ui.button(kacRow, 'strike drum B', () => strikeDrum(1, 0.62, 1.48), { small: true });
    const ninthBtn = ui.button(kacRow, 'the ninth tone, 5π²', () => toggleNinth(), { small: true });
    ninthBtn.setAttribute('aria-pressed', 'false');
    const kacInfo = ui.readout(stage,
      `area 7⁄2 and perimeter 6 + 3√2 ≈ ${polygonPerimeter(DRUM_A).toFixed(3)} for both drums · click either to strike it`);
    ui.caption(stage,
      'The drums are the Gordon–Webb–Wolpert pair in its familiar form, drawn at the coordinates Cleve Moler ' +
      'used in 2012; the tint marks the seven half-square tiles, each the mirror image of its neighbours. Both ' +
      'have area 7⁄2 and perimeter 6 + 3√2, the two things Weyl’s law lets an ear detect. The partials are the ' +
      'first twelve of twenty eigenvalues Moler computed on a grid of spacing 1⁄32. The gridded drums are ' +
      'themselves isospectral, so their lists agree to thirteen digits, but as values for the true drums they ' +
      'are good to only two or three: the ninth is exactly 5π² ≈ 49.348, and the grid gives 49.213. We give both ' +
      'drums the same partials at the same loudness, because the theorem is about which frequencies can ' +
      'sound; a real stick would excite them in proportions that depend on where it lands.');

    /* ---------- layout ---------- */
    function plateLayout(W) {
      W = Math.max(160, W);
      if (W < 600) {
        const pad = 10, head = 30;
        const S = Math.max(120, Math.min(W - 2 * pad, 520));
        const x0 = Math.round((W - S) / 2), y0 = head;
        const ly = y0 + S + 34, lh = 96;
        return { stacked: true, S, x0, y0, lx: pad, ly, lw: Math.max(40, W - 2 * pad), lh, H: ly + lh + 30 };
      }
      const pad = 18, head = 44;
      const S = Math.round(Math.max(220, Math.min(470, W * 0.5)));
      const lx = pad + S + 38;
      return { stacked: false, S, x0: pad, y0: head, lx, ly: head, lw: Math.max(40, W - lx - pad), lh: S, H: head + S + 24 };
    }
    function kacLayout(W) {
      W = Math.max(160, W);
      const mobile = W < 600;
      const midW = mobile ? 50 : 104, gap = mobile ? 8 : 34, pad = mobile ? 6 : 20;
      const top = mobile ? 26 : 34, bottom = mobile ? 30 : 38;
      const side = Math.max(48, Math.min(mobile ? 170 : 250, (W - midW - 2 * gap - 2 * pad) / 2));
      const H = Math.round(top + side + bottom);
      const cx = W / 2;
      const LA = { ox: cx - midW / 2 - gap - side, oy: top, sc: side / 3, side };
      const LB = { ox: cx + midW / 2 + gap, oy: top, sc: side / 3, side };
      return { W, H, mobile, midW, side, top, LA, LB, cx };
    }

    /* ---------- drive field & audio ---------- */
    // The resonance nearest the bow answers with a broad peak (ZETA) so that a sweep can
    // find it by ear. Every other mode leaks in as it would through a brass plate that
    // rings for seconds (ZETA_SAND), with the complex amplitude whose phase flips across
    // its own resonance. Among figures that share a pitch exactly, 25 = 5² + 0² = 4² + 3²
    // and the like, one is chosen, as Chladni chose with his fingers and his bow: the
    // one picked from the list, or else the first.
    let prefer = null;
    function computeDrive() {
      const cat = catalog();
      let best = null, bestW = -1;
      for (const e of cat) {
        const [re, im] = modeResponse(driveF, e.f);
        const w2 = re * re + im * im;
        if (w2 > bestW) { bestW = w2; best = e; }
      }
      if (!best) return { act: [], best: null, res: 0 };
      const lead = prefer && prefer !== best && Math.abs(prefer.f - best.f) < 1e-6 && cat.includes(prefer) ? prefer : best;
      const act = [];
      for (const e of cat) {
        if (e !== lead && Math.abs(e.f - lead.f) < 1e-6) continue;
        const [re, im] = modeResponse(driveF, e.f, e === lead ? ZETA : ZETA_SAND);
        const w2 = re * re + im * im;
        if (e === lead || w2 > 1e-4) act.push({ e, re, im, w2 });
      }
      act.sort((a, b) => b.w2 - a.w2);
      return { act: act.slice(0, 6), best: lead, res: bestW };
    }
    let drive = { act: [], best: null, res: 0 };

    function applyFrequency(f) {
      driveF = Math.min(FHI, Math.max(FLO, f));
      drive = computeDrive();
      nearest = drive.best;
      driveRes = drive.res;
      fieldDirty = true; needsDraw = true; ladderDirty = true;
      if (driveOn && sweep) {
        sweep.setFreq(driveF, 0.06);
        sweep.on(0.05 + 0.28 * Math.sqrt(driveRes));
      }
      const idx = catalog().indexOf(nearest);
      if (idx >= 0 && modeSel.select.value !== String(idx)) modeSel.select.value = String(idx);
      updateTheory();
      updateText();
      checkQuest();
    }

    function modeName(e) {
      if (!e) return '';
      if (e.m != null) return `(${e.m},${e.n})`;
      return `tone ${e.idx + 1}`;
    }
    const deg = () => Math.round((theta * 180) / PI);
    const signWord = () => (deg() === 45 ? '+' : deg() === -45 ? '−' : `θ ${deg() > 0 ? '+' : deg() < 0 ? '−' : ''}${Math.abs(deg())}°`);
    // the free plate's symmetry classes, in words (the square's two centre lines and two diagonals)
    const CLS_WORDS = {
      'ee+': 'as symmetric as the square itself',
      'ee−': 'changes sign across the diagonals',
      'oo+': 'changes sign across both centre lines',
      'oo−': 'changes sign across the centre lines and the diagonals',
      eo: 'one of a twin pair, changes sign across one centre line',
    };
    const nw = (s) => `<span class="ch-nw">${s}</span>`;
    const pieces = (n) => `${n} nodal domain${n === 1 ? '' : 's'}`;   // never broken across lines

    function updateText() {
      const e = nearest;
      if (!e) return;
      const pct = Math.round(driveRes * 100);
      if (e.m != null) {
        const c = Math.cos(theta), s = Math.sin(theta);
        let fm;
        const cx = (k) => (k === 0 ? '1' : `cos ${k === 1 ? '' : k}πx`), cy = (k) => (k === 0 ? '' : `cos ${k === 1 ? '' : k}πy`);
        const term = (a, b) => [cx(a), cy(b)].filter((t) => t && t !== '1').join('·') || '1';
        // operators travel with the term after them, so a narrow line breaks as a typesetter would
        if (!e.twin) fm = nw(`w = ${term(e.m, e.n)}`);
        else if (Math.abs(deg()) === 45) fm = `${nw(`w = ${term(e.m, e.n)}`)} ${nw(`${s * c > 0 ? '+' : '−'} ${term(e.n, e.m)}`)}`;
        else fm = `${nw(`w = ${c.toFixed(2)}·${term(e.m, e.n)}`)} ${nw(`${s >= 0 ? '+' : '−'} ${Math.abs(s).toFixed(2)}·${term(e.n, e.m)}`)}`;
        const rp = reps(e.k).filter(([a, b]) => a >= b).map(([a, b]) => `${a}² + ${b}²`);
        formula.innerHTML = `${fm}&ensp;${nw(`·&ensp;f ∝ m² + n² = ${e.k}`)}`;
        const K = courantIndex(e.k);
        info.set(
          `f = ${Math.round(driveF)} Hz · ${driveOn ? `response ${pct}%` : 'the plate is silent'} · nearest mode ${modeName(e)}` +
          `${e.twin ? ` ${signWord()}` : ''} at ${e.f} Hz, ×${fmtRatio(e.f / BASE)} the lowest` +
          (rp.length > 1 ? ` · ${e.k} = ${rp.join(' = ')}: ${rp.length} figures share this pitch` : '') +
          (domains ? ` · ${pieces(domains)}${domains === K ? ', as many as Courant’s theorem allows' : ` (Courant’s bound: ${K})`}` : ''));
      } else {
        formula.innerHTML = `${nw('∇⁴w = k⁴w,')} ${nw('free edges,')} ${nw(`ν = ${nu.toFixed(2)}`)}&ensp;${nw(`·&ensp;λ = ${e.lam.toFixed(2)}`)}` +
          `&ensp;${nw(`·&ensp;×${e.ratio.toFixed(3)} the lowest`)}`;
        info.set(
          `f = ${Math.round(driveF)} Hz · ${driveOn ? `response ${pct}%` : 'the plate is silent'} · nearest: the free plate’s ${modeName(e)}` +
          `${e.name ? `, ${e.name},` : ''} at ${Math.round(e.f)} Hz · ${CLS_WORDS[e.cls] || e.cls}` +
          `${e.twin ? ` (${signWord()})` : ''}${domains ? ` · ${pieces(domains)}` : ''}`);
      }
      handle.canvas.setAttribute('aria-label',
        `${model === 'wheat' ? 'Wheatstone’s shorthand' : 'Ritz’s free plate'}, ${driveOn ? 'bowed' : 'silent'} at ` +
        `${Math.round(driveF)} Hz; nearest mode ${modeName(e)}. Press Enter to strike the plate, [ and ] to step between resonances.`);
    }
    function fmtRatio(r) {
      const t = Math.round(r * 2) / 2;
      if (Math.abs(t - r) < 1e-9) return Number.isInteger(t) ? String(t) : `${Math.floor(t)}½`;
      return r.toFixed(2);
    }

    function toggleDrive() {
      audio.ensureAudio();
      driveOn = !driveOn;
      driveBtn.classList.toggle('active', driveOn);
      driveBtn.setAttribute('aria-pressed', String(driveOn));
      driveBtn.textContent = driveOn ? '⏻ lift the bow' : '⏻ bow the plate';
      if (driveOn) {
        if (!sweep) sweep = audio.voice(bus, { freq: driveF, level: 0, attack: 0.12, release: 0.3 });
        sweep.setFreq(driveF, 0.02);
        sweep.on(0.05 + 0.28 * Math.sqrt(driveRes));
      } else if (sweep) sweep.off();
      fieldDirty = true; needsDraw = true; ladderDirty = true;
      applyFrequency(driveF);
    }
    function driveOffQuietly() {
      driveOn = false;
      if (sweep) sweep.off();
      driveBtn.classList.remove('active');
      driveBtn.setAttribute('aria-pressed', 'false');
      driveBtn.textContent = '⏻ bow the plate';
      fieldDirty = true; ladderDirty = true;
      updateText();
    }

    function stepResonance(dir) {
      const fs = [...new Set(catalog().map((e) => Math.round(e.f * 100) / 100))].sort((a, b) => a - b);
      let target = null;
      if (dir > 0) target = fs.find((f) => f > driveF * 1.004);
      else for (let i = fs.length - 1; i >= 0; i--) if (fs[i] < driveF / 1.004) { target = fs[i]; break; }
      if (target == null) return;
      freqSlider.set(fToT(target));
      applyFrequency(target);
    }

    function rebuildModeSelect() {
      const sel = modeSel.select;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      const cat = catalog();
      cat.forEach((e, i) => {
        const o = doc.createElement('option');
        o.value = String(i);
        o.textContent = e.m != null
          ? `(${e.m},${e.n}) · ${e.f} Hz`
          : `tone ${i + 1} · ${Math.round(e.f)} Hz${e.name ? ` · ${e.name}` : e.twin ? ' · a twin pair' : ''}`;
        sel.appendChild(o);
      });
      if (nearest) sel.value = String(cat.indexOf(nearest));
    }

    function setModel(v) {
      model = v === 'ritz' ? 'ritz' : 'wheat';
      nuSlider.el.hidden = model !== 'ritz';
      strike = null;
      rebuildModeSelect();
      ladderDirty = true;
      applyFrequency(driveF);
      if (nearest) modeSel.select.value = String(catalog().indexOf(nearest));
    }

    let ritzPending = 0;
    function scheduleRitz() {
      if (ritzPending) return;
      ritzPending = requestAnimationFrame(() => {
        ritzPending = 0;
        ensureRitz();
        strike = null;
        rebuildModeSelect();
        ladderDirty = true;
        applyFrequency(driveF);
      });
    }

    /* ---------- the theory overlay and the antiphase tint ---------- */
    let theorySeg = null, theoryPath = null, theoryKey = '', domains = 0;
    const tintA = doc.createElement('canvas'), tintB = doc.createElement('canvas');
    const TINT = 72;
    tintA.width = tintA.height = tintB.width = tintB.height = TINT;
    let tintReady = false;

    function updateTheory() {
      const e = nearest;
      if (!e) return;
      const key = `${model}|${nu}|${e.m != null ? `${e.m},${e.n}` : e.idx}|${e.twin ? deg() : ''}`;
      if (key === theoryKey) return;
      theoryKey = key;
      SHAPE.fill(0);
      addShape(SHAPE, e, Math.cos(theta), Math.sin(theta), 1);
      theorySeg = nodalSegments(SHAPE, N1);
      domains = nodalDomains(SHAPE, N1);
      theoryPath = null;
      // tint: crimson where the shape is up, azure where it is down (and swapped)
      const ga = tintA.getContext('2d'), gb = tintB.getContext('2d');
      const ia = ga.createImageData(TINT, TINT), ib = gb.createImageData(TINT, TINT);
      const cr = [192, 91, 77], az = [125, 167, 217];
      for (let ty = 0; ty < TINT; ty++) for (let tx = 0; tx < TINT; tx++) {
        const gx = Math.round(((tx + 0.5) / TINT) * GRID), gy = Math.round(((ty + 0.5) / TINT) * GRID);
        const v = SHAPE[gy * N1 + gx], a = Math.min(255, Math.pow(Math.abs(v), 0.7) * 255);
        const p = (ty * TINT + tx) * 4, up = v > 0 ? cr : az, dn = v > 0 ? az : cr;
        ia.data[p] = up[0]; ia.data[p + 1] = up[1]; ia.data[p + 2] = up[2]; ia.data[p + 3] = a;
        ib.data[p] = dn[0]; ib.data[p + 1] = dn[1]; ib.data[p + 2] = dn[2]; ib.data[p + 3] = a;
      }
      ga.putImageData(ia, 0, 0); gb.putImageData(ib, 0, 0);
      tintReady = true;
    }

    /* ---------- quest ---------- */
    function checkQuest() {
      if (!driveOn || !nearest || driveRes < 0.9) return;
      const e = nearest;
      if (questStage === 0 && model === 'wheat' && e.m === 2 && e.n === 0 && Math.abs(deg() - 45) <= 8) {
        questStage = 1;
        quest.done(`Found it: (2,0) with the + sign, at ${e.f} Hz. In the shorthand the sand rests on the square ` +
          '|x − ½| + |y − ½| = ½, balanced on its corner; turn the twin dial to −45° and the same pitch draws the two ' +
          'diagonals instead.');
        questTimer = setTimeout(() => {
          questTimer = 0;
          if (questStage !== 1) return;
          quest.set('Now set the plate to Ritz’s free plate and find those two figures again, the ring and the ' +
            'diagonal cross. On a real plate they are no longer twins.');
        }, 6000);
        return;
      }
      if (questStage === 0 && model === 'wheat' && e.m === 2 && e.n === 0 && Math.abs(deg() + 45) <= 8) {
        quest.set('Close: this is (2,0) with the minus sign, and at the same pitch it draws the two diagonals. ' +
          'Turn the twin dial back to +45° for the square on its corner.');
        return;
      }
      if (questStage === 1 && model === 'ritz') {
        if (e.cls === 'ee−' && e === firstOf('ee−')) questSeen.cross = true;
        if (e.cls === 'ee+' && e === firstOf('ee+')) questSeen.ring = true;
        if (questSeen.cross && questSeen.ring) {
          questStage = 2;
          const c = firstOf('ee−'), r = firstOf('ee+');
          const gap = Math.abs(12 * Math.log2(r.f / c.f));
          const pitch = `Both found. At ν = ${nu.toFixed(2)} the cross sounds at ${Math.round(c.f)} Hz and the ring at ` +
            `${Math.round(r.f)} Hz, `;
          quest.done(gap > 2
            ? `${pitch}${gap.toFixed(1)} semitones apart: Chladni, Rayleigh reported, found “a difference of more than ` +
              'a whole tone.” Slide Poisson’s ratio to 0 and the twins meet again.'
            : `${pitch}${gap < 0.05 ? 'one pitch' : `only ${gap.toFixed(1)} semitones apart`}. Chladni, Rayleigh reported, ` +
              'found “a difference of more than a whole tone”; slide Poisson’s ratio up toward a metal’s 0.3 and watch them part.');
        }
      }
    }
    const firstOf = (cls) => catalog().find((e) => e.cls === cls);

    /* ---------- striking ---------- */
    // one decaying partial: attack, then a pure exponential with time constant tau
    function ring(opts) {
      if (liveVoices >= 28) return;
      const c = bus.context;
      if (!c) return;
      liveVoices++;
      const t0 = opts.when ?? c.currentTime;
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = opts.freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(opts.level, t0 + (opts.attack ?? 0.005));
      g.gain.setTargetAtTime(0, t0 + (opts.attack ?? 0.005), opts.tau);
      osc.connect(g); g.connect(bus.input);
      osc.start(t0);
      osc.stop(t0 + (opts.attack ?? 0.005) + 7 * opts.tau);
      osc.onended = () => { liveVoices--; try { osc.disconnect(); g.disconnect(); } catch { /* gone */ } };
    }
    const nowS = () => performance.now() / 1000;

    function strikePlate(px, py) {
      audio.ensureAudio();
      let modes = [];
      if (model === 'wheat') {
        modes = strikeExcitation(px, py, wheatCat).map((m) => ({
          e: wheatCat.find((q) => q.m === m.m && q.n === m.n), c: m.c, s: m.s, a: m.a, f: m.f,
        }));
      } else {
        const out = [];
        for (const e of ensureRitz()) {
          let c = 1, s = 0, amp;
          const A = ritzValueAt(e.ritz, px, py);
          if (e.twin) {
            const B = ritzValueAt(e.ritz, py, px);
            amp = Math.hypot(A, B);
            if (amp > 1e-12) { c = A / amp; s = B / amp; }
          } else amp = Math.abs(A);
          out.push({ e, c, s, a: amp * Math.pow(BASE / e.f, 0.35), f: e.f });
        }
        out.sort((a, b) => b.a - a.a);
        modes = out.slice(0, 8);
        const mx = modes.length ? modes[0].a : 0;
        if (mx < 1e-9) modes = [];
        for (const m of modes) m.a /= mx;
      }
      if (!modes.length) return;
      for (const m of modes) m.tau = 2.6 * Math.pow(BASE / m.f, 0.55);
      const t0 = nowS();
      strike = { t0, modes };
      strikeFx = { x: px, y: py, t0 };
      const c = bus.context;
      if (c) {
        const at = c.currentTime + 0.02;
        audio.drums.rim(bus, at, { level: 0.18 });
        for (const m of modes) ring({ freq: m.f, when: at, tau: m.tau, level: 0.3 * Math.pow(m.a, 0.9) });
      }
      fieldDirty = true; needsDraw = true; ladderDirty = true;
    }

    /* ---------- field assembly ---------- */
    // The bow's field is kept as its complex amplitude R + iQ, which is smooth and
    // crosses zero cleanly on a nodal line; the grains read it directly (see stepSand).
    // A strike's partials ring incoherently, so they are summed as energies in E.
    let hasDrive = false, hasStrike = false;
    function assembleField(t) {
      E.fill(0);
      hasDrive = false; hasStrike = false;
      if (driveOn && drive.act.length) {
        R.fill(0); Q.fill(0);
        const c = Math.cos(theta), s = Math.sin(theta);
        for (const a of drive.act) { addShape(R, a.e, c, s, a.re); addShape(Q, a.e, c, s, a.im); }
        hasDrive = true;
      }
      if (strike) {
        const age = t - strike.t0;
        let live = 0;
        for (const m of strike.modes) {
          const A = m.a * Math.exp(-age / m.tau);
          if (A < 0.03) continue;
          live++;
          TMP.fill(0);
          addShape(TMP, m.e, m.c, m.s, 1);
          const A2 = A * A;
          for (let q = 0; q < NN; q++) E[q] += A2 * TMP[q] * TMP[q];
        }
        if (!live) strike = null; else hasStrike = true;
      }
      if (!hasDrive && !hasStrike) return false;
      if (!hasStrike) return true;
      const h = GRID / 2;
      for (let gy = 0; gy < N1; gy++) {
        const row = gy * N1;
        for (let gx = 0; gx < N1; gx++) {
          const q = row + gx;
          Ex[q] = gx === 0 ? (E[q + 1] - E[q]) * GRID : gx === GRID ? (E[q] - E[q - 1]) * GRID : (E[q + 1] - E[q - 1]) * h;
          Ey[q] = gy === 0 ? (E[q + N1] - E[q]) * GRID : gy === GRID ? (E[q] - E[q - N1]) * GRID : (E[q + N1] - E[q - N1]) * h;
        }
      }
      return true;
    }

    /* ---------- physics ---------- */
    // Sand hops where the plate can throw it and walks down the time-averaged motion E.
    // Where the plate barely moves it cannot lift a grain at all: the mobility
    // amp²/(amp² + HOLD²) fades to nothing there, so grains that reach a nodal line stay
    // on it instead of sliding along it. For the bowed plate, E and its slope come from
    // the interpolated amplitude R + iQ, not from interpolating E itself: E is quadratic
    // across a line, and its interpolant would leave a floor of about |∇w|²h²/8 on the line,
    // enough at high modes to let grains drift along it into beads. A grain thrown by the
    // plate lands at random, a distance that grows with the square of the plate's speed
    // (HOP, capped), so sand already lying in one figure is scattered and redrawn when the
    // tone changes, instead of sliding along its old lines. Lycopodium is carried the
    // other way, gently, by Faraday's air currents, and billows in heaps over the antinodes.
    const ETA = 0.55, JIT = 0.011, HOLD = 0.05, HOP = 0.45, HOP_CAP = 0.15;
    function stepSand(dt) {
      const dtn = Math.min(dt, 0.033) * 60;
      const MS = 0.0065 * dtn;
      const lyco = powder === 'lyco';
      for (let i = 0; i < NP; i++) {
        const x = sx[i], y = sy[i];
        const fx = x * GRID, fy = y * GRID;
        const ix = Math.min(GRID - 1, fx | 0), iy = Math.min(GRID - 1, fy | 0);
        const tx = fx - ix, ty = fy - iy, q = iy * N1 + ix;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        let e = 0, gx = 0, gy = 0;
        if (hasDrive) {
          const r0 = R[q], r1 = R[q + 1], r2 = R[q + N1], r3 = R[q + N1 + 1];
          const q0 = Q[q], q1 = Q[q + 1], q2 = Q[q + N1], q3 = Q[q + N1 + 1];
          const r = w00 * r0 + w10 * r1 + w01 * r2 + w11 * r3, qq = w00 * q0 + w10 * q1 + w01 * q2 + w11 * q3;
          const rx = ((1 - ty) * (r1 - r0) + ty * (r3 - r2)) * GRID, ry = ((1 - tx) * (r2 - r0) + tx * (r3 - r1)) * GRID;
          const qx = ((1 - ty) * (q1 - q0) + ty * (q3 - q2)) * GRID, qy = ((1 - tx) * (q2 - q0) + tx * (q3 - q1)) * GRID;
          e = r * r + qq * qq; gx = 2 * (r * rx + qq * qx); gy = 2 * (r * ry + qq * qy);
        }
        if (hasStrike) {
          e += w00 * E[q] + w10 * E[q + 1] + w01 * E[q + N1] + w11 * E[q + N1 + 1];
          gx += w00 * Ex[q] + w10 * Ex[q + 1] + w01 * Ex[q + N1] + w11 * Ex[q + N1 + 1];
          gy += w00 * Ey[q] + w10 * Ey[q + 1] + w01 * Ey[q + N1] + w11 * Ey[q + N1 + 1];
        }
        const e0 = Math.max(0, e), amp = Math.sqrt(e0);
        const mob = lyco ? 0.16 : e0 / (e0 + HOLD * HOLD);
        const dir = lyco ? 1 : -1;
        let stx = dir * 0.5 * ETA * mob * gx * dt, sty = dir * 0.5 * ETA * mob * gy * dt;
        if (stx > MS) stx = MS; else if (stx < -MS) stx = -MS;
        if (sty > MS) sty = MS; else if (sty < -MS) sty = -MS;
        // (a light grain resting on a nodal line is still stirred by the air, so it
        // cannot sit on the line's unstable balance forever)
        const jm = lyco ? JIT * (0.2 + 1.4 * Math.min(1, amp * 2.5)) * dtn
          : (JIT * Math.min(1.4, amp) * mob + HOP * Math.min(HOP_CAP, e0)) * dtn;
        let nx = x + stx + (Math.random() - 0.5) * jm;
        let ny = y + sty + (Math.random() - 0.5) * jm;
        if (nx < 0.004) nx = 0.004; else if (nx > 0.996) nx = 0.996;
        if (ny < 0.004) ny = 0.004; else if (ny > 0.996) ny = 0.996;
        sx[i] = nx; sy[i] = ny;
      }
    }

    /* ---------- cached layers ---------- */
    const plateLayer = doc.createElement('canvas');
    let plateLayerKey = '';
    function renderPlateLayer(S, dpr) {
      const key = `${S}|${dpr}`;
      if (key === plateLayerKey) return;
      plateLayerKey = key;
      const px = Math.max(1, Math.round(S * dpr));
      plateLayer.width = plateLayer.height = px;
      const g = plateLayer.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = P.panel;
      g.fillRect(0, 0, S, S);
      // a faint warmth, brightest a little above centre, as a lamp on brass
      const rg = g.createRadialGradient(S * 0.42, S * 0.36, S * 0.05, S * 0.5, S * 0.5, S * 0.78);
      rg.addColorStop(0, 'rgba(201,169,89,0.10)');
      rg.addColorStop(0.6, 'rgba(201,169,89,0.035)');
      rg.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = rg;
      g.fillRect(0, 0, S, S);
      // turning marks: the plate began as a disc on a grinding machine
      g.strokeStyle = 'rgba(232,200,124,0.035)';
      g.lineWidth = 0.6;
      for (let r = 6; r < S * 0.72; r += 3.2 + (r % 7) * 0.35) {
        g.beginPath(); g.arc(S / 2, S / 2, r, 0, 2 * PI); g.stroke();
      }
      // bevel: light on the upper-left edges, shadow on the lower-right
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(232,200,124,0.30)';
      g.beginPath(); g.moveTo(0.5, S - 0.5); g.lineTo(0.5, 0.5); g.lineTo(S - 0.5, 0.5); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.moveTo(S - 0.5, 0.5); g.lineTo(S - 0.5, S - 0.5); g.lineTo(0.5, S - 0.5); g.stroke();
    }

    const glow = cv.glowSprite(P.goldBright, 22);
    const DEN = 48, den = new Uint16Array(DEN * DEN);

    const ladderLayer = doc.createElement('canvas');
    let ladderKey = '';

    /* ---------- drawing: plate ---------- */
    let plateRect = { x: 0, y: 0, s: 1 };
    function setFont(ctx, px, family, opts = {}) {
      ctx.font = `${opts.italic ? 'italic ' : ''}${opts.weight || 400} ${px}px ${family}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = opts.track || '0px';
      if ('fontVariantCaps' in ctx) ctx.fontVariantCaps = opts.caps || 'normal';
    }
    function resetFont(ctx) {
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      if ('fontVariantCaps' in ctx) ctx.fontVariantCaps = 'normal';
    }

    function draw(dt, t) {
      const moving = driveOn || strike || strikeFx;
      if (!moving && !needsDraw && !ladderDirty) return;
      if (fieldDirty || strike) { if (assembleField(t)) { stepSand(dt); } fieldDirty = !!strike; }
      else if (driveOn) stepSand(dt);
      needsDraw = false;

      const { ctx, width: W, height: H, dpr } = handle;
      if (W < 20 || H < 20) return;
      const L = plateLayout(W);
      const { S, x0, y0 } = L;
      plateRect = { x: x0, y: y0, s: S };
      ctx.clearRect(0, 0, W, H);

      // header over the plate
      setFont(ctx, L.stacked ? 12 : 13, SERIF, { caps: 'all-small-caps', track: '1.6px' });
      ctx.fillStyle = P.inkDim; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(model === 'wheat' ? 'Wheatstone’s shorthand' : `Ritz’s free plate`, x0, y0 - 11);
      resetFont(ctx);
      setFont(ctx, 11, MONO);
      ctx.textAlign = 'right';
      ctx.fillStyle = driveOn ? P.crimsonBright : P.inkFaint;
      const stat = driveOn ? `${Math.round(driveF)} Hz` : strike ? 'struck' : 'silent';
      ctx.fillText(model === 'ritz' ? `ν ${nu.toFixed(2)} · ${stat}` : stat, x0 + S, y0 - 11);

      renderPlateLayer(S, dpr);
      ctx.drawImage(plateLayer, x0, y0, S, S);

      // antiphase tint: the two halves of the vibration, slowed to a breath
      if (driveOn && tintReady && driveRes > 0.02) {
        const amp = 0.34 * Math.min(1, Math.sqrt(driveRes));
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if (reduced()) {
          ctx.globalAlpha = amp * 0.6;
          ctx.drawImage(tintA, x0, y0, S, S);
        } else {
          const ph = Math.cos(2 * PI * 0.55 * t);
          if (ph > 0) { ctx.globalAlpha = amp * ph; ctx.drawImage(tintA, x0, y0, S, S); }
          else { ctx.globalAlpha = -amp * ph; ctx.drawImage(tintB, x0, y0, S, S); }
        }
        ctx.restore();
      }

      // the theory: zero set of the nearest mode
      if (showTheory && theorySeg && theorySeg.length) {
        if (!theoryPath || theoryPath.S !== S || theoryPath.x0 !== x0 || theoryPath.y0 !== y0) {
          const p = new Path2D();
          for (let i = 0; i < theorySeg.length; i += 4) {
            p.moveTo(x0 + theorySeg[i] * S, y0 + theorySeg[i + 1] * S);
            p.lineTo(x0 + theorySeg[i + 2] * S, y0 + theorySeg[i + 3] * S);
          }
          theoryPath = { p, S, x0, y0 };
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, S, S); ctx.clip();
        ctx.strokeStyle = P.azure; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.1;
        ctx.setLineDash([4, 3]);
        ctx.stroke(theoryPath.p);
        ctx.restore();
      }

      // sand: a soft shadow, then two tones of grain, then a glow where it has gathered
      const lyco = powder === 'lyco';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      for (let i = 0; i < NP; i++) {
        const r = gs[i];
        ctx.rect(x0 + sx[i] * S - r / 2 + 0.6, y0 + sy[i] * S - r / 2 + 0.8, r, r);
      }
      ctx.fill();
      den.fill(0);
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = pass; i < NP; i += 2) {
          if (pass === 0 && i % 6 === 0) continue;
          const r = gs[i];
          ctx.rect(x0 + sx[i] * S - r / 2, y0 + sy[i] * S - r / 2, r, r);
        }
        if (pass === 1) for (let i = 0; i < NP; i += 6) {
          const r = gs[i] * 0.9;
          ctx.rect(x0 + sx[i] * S - r / 2, y0 + sy[i] * S - r / 2, r, r);
        }
        ctx.fillStyle = lyco ? (pass ? '#d9cf8f' : '#f1e7b0') : (pass ? P.gold : P.goldBright);
        ctx.globalAlpha = lyco ? 0.62 : 0.92;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!lyco) {
        for (let i = 0; i < NP; i++) den[Math.min(DEN - 1, (sy[i] * DEN) | 0) * DEN + Math.min(DEN - 1, (sx[i] * DEN) | 0)]++;
        const thr = 7, cell = S / DEN;
        ctx.globalCompositeOperation = 'lighter';
        for (let q = 0; q < den.length; q++) {
          const n = den[q];
          if (n < thr) continue;
          ctx.globalAlpha = Math.min(0.2, 0.012 * (n - thr + 2));
          glow.draw(ctx, x0 + ((q % DEN) + 0.5) * cell, y0 + (((q / DEN) | 0) + 0.5) * cell, Math.max(0.2, cell / 11));
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // the strike: a ring that spreads (or a still mark, if motion is reduced)
      if (strikeFx) {
        const age = t - strikeFx.t0;
        const px = x0 + strikeFx.x * S, py = y0 + strikeFx.y * S;
        if (age > 0.7) strikeFx = null;
        else if (reduced()) {
          ctx.strokeStyle = P.azure; ctx.globalAlpha = Math.max(0, 1 - age / 0.7); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py); ctx.moveTo(px, py - 6); ctx.lineTo(px, py + 6); ctx.stroke();
        } else {
          ctx.save();
          ctx.beginPath(); ctx.rect(x0, y0, S, S); ctx.clip();
          for (let k = 0; k < 2; k++) {
            const a = age - k * 0.12;
            if (a <= 0) continue;
            ctx.strokeStyle = P.azure; ctx.globalAlpha = Math.max(0, 0.9 - a / 0.6); ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.arc(px, py, Math.max(0, 4 + a * S * 0.8), 0, 2 * PI); ctx.stroke();
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      drawLadder(ctx, L, t);
      if (moving) needsDraw = true;
    }

    /* ---------- drawing: the ladder ---------- */
    const LOG_RMAX = Math.log2(RMAX);
    // Above three octaves the rungs crowd into a barcode; let them recede so the eye
    // rests where the story is (1, 2, 2½, 4 …) while the density stays legible.
    const fadeA = (r) => (r <= 8 ? 1 : Math.max(0.28, 1 - 0.72 * (Math.log2(r / 8) / Math.log2(RMAX / 8))));
    function ladderColumns(L) {
      const left = 28, right = 50;
      const inner = Math.max(30, L.lw - left - right);
      const cw = inner / 3;
      return { x: L.lx + left, cw, cols: [0, 1, 2].map((i) => L.lx + left + cw * (i + 0.5)), inner };
    }
    const rungY = (L, r) => {
      const top = L.ly + 4, bot = L.ly + L.lh - 4;
      return bot - (Math.log2(Math.max(1, r)) / LOG_RMAX) * (bot - top);
    };
    const rungX = (L, r) => {
      const x0 = L.lx + 86, x1 = L.lx + L.lw - 8;
      return x0 + (Math.log2(Math.max(1, r)) / LOG_RMAX) * Math.max(10, x1 - x0);
    };

    function drawLadderStatic(L, dpr) {
      const cat = catalog();
      const key = `${L.lx}|${L.ly}|${L.lw}|${L.lh}|${L.stacked}|${dpr}|${model}|${nu}`;
      if (key === ladderKey) return;
      ladderKey = key;
      const Wl = L.lw + 20, Hl = L.lh + (L.stacked ? 40 : 56);
      const offX = L.lx - 10, offY = L.ly - (L.stacked ? 12 : 46);
      ladderLayer.width = Math.max(1, Math.round(Wl * dpr));
      ladderLayer.height = Math.max(1, Math.round(Hl * dpr));
      ladderLayer._off = [offX, offY, Wl, Hl];
      const g = ladderLayer.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, -offX * dpr, -offY * dpr);
      g.clearRect(offX, offY, Wl, Hl);
      const colours = [P.gold, P.azure, P.ink];
      const titles = ['string', 'shorthand', 'free plate'];
      const subs = ['f ∝ n', 'f ∝ m² + n²', `Ritz, ν ${nu.toFixed(2)}`];
      const dimA = (i) => (i === 0 ? 0.85 : (i === 1) === (model === 'wheat') ? 1 : 0.5);
      const wheatRatios = wheatCat.map((e) => e.k / 2);
      const ritz = ensureRitz();

      if (!L.stacked) {
        const C = ladderColumns(L);
        // octave hairlines, ×1 … ×32, with their pitches (A2 … A7)
        for (let o = 0; o <= 5; o++) {
          const r = 2 ** o, y = Math.round(rungY(L, r)) + 0.5;
          g.strokeStyle = P.line; g.globalAlpha = 0.9; g.lineWidth = 1;
          g.beginPath(); g.moveTo(C.x - 4, y); g.lineTo(C.x + C.inner + 4, y); g.stroke();
          g.globalAlpha = 1;
          setFont(g, 10, MONO); g.fillStyle = P.inkFaint; g.textBaseline = 'middle';
          g.textAlign = 'right'; g.fillText(`×${r}`, C.x - 8, y);
          g.textAlign = 'left'; g.fillText(`${BASE * r}`, C.x + C.inner + 8, y);
        }
        setFont(g, 10, MONO); g.fillStyle = P.inkFaint; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText('Hz', C.x + C.inner + 8, rungY(L, 32) - 12);
        // column titles, and their laws in mono beneath
        for (let i = 0; i < 3; i++) {
          g.globalAlpha = dimA(i);
          setFont(g, 13, SERIF, { caps: 'all-small-caps', track: '1.6px' });
          g.fillStyle = colours[i]; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
          g.fillText(titles[i], C.cols[i], L.ly - 25);
          resetFont(g);
          g.globalAlpha = Math.max(0.75, dimA(i));
          setFont(g, 10, MONO); g.fillStyle = dimA(i) === 1 ? P.inkDim : P.inkFaint;
          g.fillText(subs[i], C.cols[i], L.ly - 11);
        }
        g.globalAlpha = 1;
        const half = Math.min(34, C.cw * 0.3);
        // a rung, faded with height; `dbl` spreads twins into parallel strokes
        const rung = (i, r, mult = 1, alpha = 1) => {
          const y = Math.round(rungY(L, r)) + 0.5;
          g.globalAlpha = dimA(i) * fadeA(r) * alpha;
          g.beginPath();
          for (let j = 0; j < mult; j++) {
            const off = (j - (mult - 1) / 2) * 2.4;
            g.moveTo(C.cols[i] - half, y + off); g.lineTo(C.cols[i] + half, y + off);
          }
          g.stroke();
        };
        // labels sit on a knockout of the ground, so hairlines never strike through them
        const labelled = (i, list, fmt) => {
          let lastY = Infinity;
          setFont(g, 9.5, MONO); g.textAlign = 'left'; g.textBaseline = 'middle';
          for (const r of list) {
            const y = rungY(L, r);
            if (lastY - y < 11) continue;
            if (r > 7) break;
            const s = fmt(r), tw = g.measureText(s).width, lx = C.cols[i] + half + 5;
            g.globalAlpha = 1; g.fillStyle = P.bg;
            g.fillRect(lx - 2, Math.round(y) - 6, tw + 4, 12);
            g.globalAlpha = Math.max(0.6, dimA(i)); g.fillStyle = P.inkFaint;
            g.fillText(s, lx, y);
            lastY = y;
          }
          g.globalAlpha = 1;
        };
        // string: every harmonic
        g.strokeStyle = colours[0]; g.lineWidth = 1.2;
        for (let n = 1; n <= RMAX; n++) rung(0, n);
        labelled(0, Array.from({ length: 8 }, (_, i) => i + 1), (r) => String(r));
        // shorthand: rungs at k/2, drawn once per distinct k, with the square's multiplicity
        const seen = new Set();
        g.strokeStyle = colours[1]; g.lineWidth = 1.2;
        for (const e of wheatCat) {
          if (seen.has(e.k)) continue;
          seen.add(e.k);
          rung(1, e.k / 2, Math.min(4, reps(e.k).length));
        }
        // the numbers no two squares can make, below 16, as dotted ghosts
        g.setLineDash([1.5, 2.5]); g.strokeStyle = P.azureDim; g.lineWidth = 1;
        for (let k = 3; k < 16; k++) if (!isSumOfTwoSquares(k)) rung(1, k / 2, 1, 0.9);
        g.setLineDash([]);
        labelled(1, [...new Set(wheatRatios)], (r) => fmtRatio(r));
        // free plate: Ritz tones, twin pairs doubled
        g.strokeStyle = colours[2]; g.lineWidth = 1.2;
        for (const e of ritz) rung(2, e.ratio, e.twin ? 2 : 1, 0.9);
        labelled(2, ritz.map((e) => e.ratio), (r) => (Math.abs(r - 1) < 1e-9 ? '1' : r.toFixed(2)));
        g.globalAlpha = 1;
      } else {
        // phone: three horizontal strips on one log axis
        const rowsY = [L.ly + 16, L.ly + 48, L.ly + 80];
        const xa = rungX(L, 1), xb = rungX(L, RMAX);
        for (let o = 0; o <= 5; o++) {
          const x = Math.round(rungX(L, 2 ** o)) + 0.5;
          g.strokeStyle = P.line; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, L.ly + 2); g.lineTo(x, L.ly + L.lh - 2); g.stroke();
          setFont(g, 9.5, MONO); g.fillStyle = P.inkFaint; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
          g.fillText(`×${2 ** o}`, x, L.ly + L.lh + 11);
        }
        for (let i = 0; i < 3; i++) {
          g.globalAlpha = dimA(i);
          setFont(g, 11, SERIF, { caps: 'all-small-caps', track: '1.1px' });
          g.fillStyle = colours[i]; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText(titles[i], L.lx, rowsY[i]);
          resetFont(g);
          g.strokeStyle = colours[i]; g.lineWidth = 1.1;
          const tick = (r, dbl) => {
            const x = Math.round(rungX(L, r)) + 0.5;
            g.globalAlpha = dimA(i) * fadeA(r);
            g.beginPath();
            if (dbl) { g.moveTo(x - 1.1, rowsY[i] - 9); g.lineTo(x - 1.1, rowsY[i] + 9); g.moveTo(x + 1.1, rowsY[i] - 9); g.lineTo(x + 1.1, rowsY[i] + 9); }
            else { g.moveTo(x, rowsY[i] - 9); g.lineTo(x, rowsY[i] + 9); }
            g.stroke();
          };
          if (i === 0) for (let n = 1; n <= RMAX; n++) tick(n, false);
          if (i === 1) { const s2 = new Set(); for (const e of wheatCat) if (!s2.has(e.k)) { s2.add(e.k); tick(e.k / 2, reps(e.k).length > 1); } }
          if (i === 2) for (const e of ritz) tick(e.ratio, e.twin);
          g.globalAlpha = 1;
        }
        g.strokeStyle = P.line; g.globalAlpha = 0.6;
        g.beginPath(); g.moveTo(xa, L.ly + L.lh - 2); g.lineTo(xb, L.ly + L.lh - 2); g.stroke();
        g.globalAlpha = 1;
      }
      resetFont(g);
    }

    function drawLadder(ctx, L, t) {
      if (L.lw < 60) return;
      drawLadderStatic(L, handle.dpr);
      ladderDirty = false;
      const [ox, oy, Wl, Hl] = ladderLayer._off;
      ctx.drawImage(ladderLayer, ox, oy, Wl, Hl);
      const cat = catalog();
      const lit = new Map();
      if (driveOn) for (const a of drive.act) lit.set(a.e, Math.max(lit.get(a.e) || 0, a.w2));
      if (strike) {
        const age = t - strike.t0;
        for (const m of strike.modes) lit.set(m.e, Math.max(lit.get(m.e) || 0, m.a * Math.exp(-age / m.tau)));
      }
      const col = model === 'wheat' ? 1 : 2;
      if (!L.stacked) {
        const C = ladderColumns(L), half = Math.min(34, C.cw * 0.3);
        for (const [e, v] of lit) {
          if (v < 0.03 || !cat.includes(e)) continue;
          const y = rungY(L, e.f / BASE), xc = C.cols[col];
          ctx.strokeStyle = P.goldBright;
          ctx.globalAlpha = 0.22 * v; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(xc - half - 3, y); ctx.lineTo(xc + half + 3, y); ctx.stroke();
          ctx.globalAlpha = Math.min(1, 0.35 + v); ctx.lineWidth = 1.6 + 1.4 * v;
          ctx.beginPath(); ctx.moveTo(xc - half, y); ctx.lineTo(xc + half, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (driveOn) {
          // the bow's pitch: a dashed level across each ladder (not through the labels
          // beside them), and the frequency in the Hz column
          const y = Math.round(rungY(L, driveF / BASE)) + 0.5;
          ctx.strokeStyle = P.crimsonBright; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          for (const xc of C.cols) { ctx.moveTo(xc - half - 6, y); ctx.lineTo(xc + half + 4, y); }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          setFont(ctx, 10, MONO); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const label = `${Math.round(driveF)}`;
          const ly = y, lx = C.x + C.inner + 8;
          ctx.fillStyle = P.bg; ctx.fillRect(lx - 3, ly - 7, ctx.measureText(label).width + 6, 14);
          ctx.fillStyle = P.crimsonBright; ctx.fillText(label, lx, ly);
        }
      } else {
        const rowsY = [L.ly + 16, L.ly + 48, L.ly + 80];
        for (const [e, v] of lit) {
          if (v < 0.03 || !cat.includes(e)) continue;
          const x = rungX(L, e.f / BASE), yc = rowsY[col];
          ctx.strokeStyle = P.goldBright;
          ctx.globalAlpha = 0.25 * v; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(x, yc - 11); ctx.lineTo(x, yc + 11); ctx.stroke();
          ctx.globalAlpha = Math.min(1, 0.4 + v); ctx.lineWidth = 1.5 + 1.2 * v;
          ctx.beginPath(); ctx.moveTo(x, yc - 10); ctx.lineTo(x, yc + 10); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (driveOn) {
          const x = Math.round(rungX(L, driveF / BASE)) + 0.5;
          ctx.strokeStyle = P.crimsonBright; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x, L.ly); ctx.lineTo(x, L.ly + L.lh); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      resetFont(ctx);
    }

    /* ---------- drawing: the drums ---------- */
    const ninthLayers = [doc.createElement('canvas'), doc.createElement('canvas')];
    let ninthKey = '';
    function renderNinth(K, dpr) {
      const key = `${K.side}|${dpr}`;
      if (key === ninthKey) return;
      ninthKey = key;
      [DRUM_A, DRUM_B].forEach((poly, d) => {
        const c = ninthLayers[d], n = Math.max(8, Math.round(K.side * dpr));
        c.width = c.height = n;
        const g = c.getContext('2d'), img = g.createImageData(n, n);
        for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
          const wx = ((px + 0.5) / n) * 3, wy = 3 - ((py + 0.5) / n) * 3;
          if (!pointInPolygon(wx, wy, poly)) continue;
          const u = kacNinth(wx, wy) / 2, p = (py * n + px) * 4;
          const col = u > 0 ? [192, 91, 77] : [125, 167, 217];
          img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2];
          img.data[p + 3] = Math.min(255, Math.pow(Math.abs(u), 0.6) * 170);
        }
        g.putImageData(img, 0, 0);
      });
    }

    function drawDrum(ctx, K, L, poly, tiles, ringing, ripple, d, t) {
      const X = (wx) => L.ox + wx * L.sc, Y = (wy) => L.oy + (3 - wy) * L.sc;
      const path = new Path2D();
      poly.forEach(([wx, wy], i) => (i ? path.lineTo(X(wx), Y(wy)) : path.moveTo(X(wx), Y(wy))));
      path.closePath();
      ctx.fillStyle = P.panel;
      ctx.fill(path);
      // tiles, alternately tinted: the tint is the sign of the ninth tone
      tiles.forEach((tri) => {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        ctx.fillStyle = kacNinth(cx, cy) > 0 ? 'rgba(201,169,89,0.10)' : 'rgba(125,167,217,0.05)';
        ctx.beginPath();
        tri.forEach(([wx, wy], i) => (i ? ctx.lineTo(X(wx), Y(wy)) : ctx.moveTo(X(wx), Y(wy))));
        ctx.closePath(); ctx.fill();
      });
      if (ninthOn) {
        const age = t - ninthT0;
        ctx.globalAlpha = reduced() ? 1 : Math.min(1, age / 0.5);
        ctx.drawImage(ninthLayers[d], L.ox, L.oy, L.side, L.side);
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = ninthOn ? 'rgba(232,226,208,0.55)' : P.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      tiles.forEach((tri) => {
        tri.forEach(([wx, wy], i) => (i ? ctx.lineTo(X(wx), Y(wy)) : ctx.moveTo(X(wx), Y(wy))));
        ctx.closePath();
      });
      ctx.stroke();
      if (ripple) {
        const { wx, wy, age } = ripple;
        for (let r = 0; r < 3; r++) {
          const a = age - r * 0.14;
          if (a < 0) continue;
          ctx.strokeStyle = P.azure;
          ctx.globalAlpha = Math.max(0, 0.7 - a * 0.55);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(X(wx), Y(wy), Math.max(0, a * L.sc * 2.4), 0, 2 * PI);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (ringing) {
        ctx.strokeStyle = P.goldBright; ctx.globalAlpha = 0.25; ctx.lineWidth = 6;
        ctx.stroke(path); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = ringing ? P.goldBright : P.ink;
      ctx.lineWidth = ringing ? 2 : 1.3;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }

    function drawKac(t) {
      const moving = kacStrike || (ninthOn && t - ninthT0 < 0.6);
      if (!moving && !kacDirty) return;
      kacDirty = false;
      const { ctx, width: W, height: H, dpr } = handle2;
      if (W < 20 || H < 20) return;
      ctx.clearRect(0, 0, W, H);
      const K = kacLayout(W);
      kacGeom = K;
      if (ninthOn) renderNinth(K, dpr);

      let ringingDrum = -1, ripple = null, age = 0;
      if (kacStrike) {
        age = t - kacStrike.t0;
        if (age > 3.2) kacStrike = null;
        else {
          ringingDrum = kacStrike.drum;
          if (age < 1.4 && !reduced()) ripple = { wx: kacStrike.x, wy: kacStrike.y, age };
        }
      }
      drawDrum(ctx, K, K.LA, DRUM_A, DRUM_A_TILES, ringingDrum === 0, ringingDrum === 0 ? ripple : null, 0, t);
      drawDrum(ctx, K, K.LB, DRUM_B, DRUM_B_TILES, ringingDrum === 1, ringingDrum === 1 ? ripple : null, 1, t);

      setFont(ctx, K.mobile ? 11.5 : 13, SERIF, { caps: 'all-small-caps', track: '1.6px' });
      ctx.fillStyle = P.inkDim; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('drum a', K.LA.ox + K.side / 2, K.top + K.side + (K.mobile ? 20 : 26));
      ctx.fillText('drum b', K.LB.ox + K.side / 2, K.top + K.side + (K.mobile ? 20 : 26));
      resetFont(ctx);

      // the one ladder between them: rungs at √λ
      const lx = K.cx, top = K.top + 4, bot = K.top + K.side - 4;
      const s1 = Math.sqrt(GWW_EIGS[0]), sN = Math.sqrt(GWW_EIGS[GWW_EIGS.length - 1]);
      const half = K.midW * 0.3;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx + 0.5, top - 2); ctx.lineTo(lx + 0.5, bot + 2); ctx.stroke();
      for (let i = 0; i < GWW_EIGS.length; i++) {
        const y = Math.round(bot - ((Math.sqrt(GWW_EIGS[i]) - s1) / (sN - s1)) * (bot - top)) + 0.5;
        let lit = 0;
        if (kacStrike && i < kacStrike.parts.length) {
          const p = kacStrike.parts[i];
          lit = Math.max(0, Math.exp(-age / p.tau));
        }
        const nine = ninthOn && i === 8;
        if (lit > 0.02 || nine) {
          const v = nine ? 1 : lit;
          ctx.strokeStyle = nine ? P.crimsonBright : P.goldBright;
          ctx.globalAlpha = 0.25 * v; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(lx - half - 2, y); ctx.lineTo(lx + half + 2, y); ctx.stroke();
          ctx.globalAlpha = Math.min(1, 0.45 + v); ctx.lineWidth = 1.4 + 1.2 * v;
        } else { ctx.strokeStyle = P.azureDim; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.1; }
        ctx.beginPath(); ctx.moveTo(lx - half, y); ctx.lineTo(lx + half, y); ctx.stroke();
        ctx.globalAlpha = 1;
        if (nine && !K.mobile) {
          setFont(ctx, 10, MONO); ctx.fillStyle = P.crimsonBright; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('5π²', lx + half + 5, y);
        }
      }
      setFont(ctx, K.mobile ? 9.5 : 10, MONO); ctx.fillStyle = P.inkDim; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(K.mobile ? '√λ' : '√λ₁ … √λ₂₀', lx, bot + (K.mobile ? 20 : 26));
      resetFont(ctx);
      setFont(ctx, K.mobile ? 10.5 : 12, SERIF, { caps: 'all-small-caps', track: K.mobile ? '1px' : '1.4px' });
      ctx.fillStyle = P.inkDim;
      ctx.fillText('one spectrum', lx, top - (K.mobile ? 11 : 14));
      resetFont(ctx);
      if (moving) kacDirty = true;
    }

    /* ---------- striking a drum; the ninth tone ---------- */
    const KAC_BASE = 196;                                    // Hz for √λ₁ (G3)
    function strikeDrum(which, wx, wy) {
      audio.ensureAudio();
      const t0 = nowS();
      const c = bus.context;
      const parts = [];
      const at = c ? c.currentTime + 0.02 : 0;
      if (c) audio.drums.thock(bus, at, { level: 0.3 });
      for (let i = 0; i < 12; i++) {
        const f = KAC_BASE * Math.sqrt(GWW_EIGS[i] / GWW_EIGS[0]);
        const tau = Math.min(1.6, Math.max(0.35, 1.5 * Math.sqrt(GWW_EIGS[0] / GWW_EIGS[i])));
        if (c) ring({ freq: f, when: at, tau, level: 0.26 / (1 + 0.45 * i) });
        parts.push({ i, f, tau });
      }
      kacStrike = { drum: which, x: wx, y: wy, t0, parts };
      kacDirty = true;
      kacInfo.set(`drum ${which === 0 ? 'A' : 'B'} struck: the same twelve partials ring from either drum, ` +
        `λ₁ … λ₁₂ as computed on Moler’s grid · area 7⁄2 and perimeter 6 + 3√2 for both`);
    }
    function toggleNinth() {
      ninthOn = !ninthOn;
      ninthBtn.classList.toggle('active', ninthOn);
      ninthBtn.setAttribute('aria-pressed', String(ninthOn));
      ninthT0 = nowS();
      kacDirty = true;
      if (ninthOn) {
        audio.ensureAudio();
        const c = bus.context;
        if (c) ring({ freq: KAC_BASE * Math.sqrt(NINTH_EXACT / GWW_EIGS[0]), when: c.currentTime + 0.02, tau: 1.4, level: 0.26 });
        kacInfo.set('the ninth tone, exactly 5π² ≈ 49.348: the lowest vibration of one half-square, reflected ' +
          'across every edge into all seven tiles of both drums; red and blue swing in opposition, and every tile ' +
          'edge is still');
      } else {
        kacInfo.set(`area 7⁄2 and perimeter 6 + 3√2 ≈ ${polygonPerimeter(DRUM_A).toFixed(3)} for both drums · click either to strike it`);
      }
    }

    /* ---------- pointer & keyboard ---------- */
    const onPlateDown = (e) => {
      const [mx, my] = cv.pointerPos(handle, e);
      const { x, y, s } = plateRect;
      if (mx < x || my < y || mx > x + s || my > y + s) return;
      strikePlate((mx - x) / s, (my - y) / s);
    };
    const onPlateKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); strikePlate(0.21, 0.33); }
      else if (e.key === '[') { e.preventDefault(); stepResonance(-1); }
      else if (e.key === ']') { e.preventDefault(); stepResonance(1); }
    };
    handle.canvas.addEventListener('pointerdown', onPlateDown);
    handle.canvas.addEventListener('keydown', onPlateKey);
    handle.canvas.style.cursor = 'pointer';

    let kacGeom = null;
    const onKacDown = (e) => {
      if (!kacGeom) return;
      const [mx, my] = cv.pointerPos(handle2, e);
      const drums = [[kacGeom.LA, DRUM_A], [kacGeom.LB, DRUM_B]];
      for (let d = 0; d < 2; d++) {
        const [L, poly] = drums[d];
        const wx = (mx - L.ox) / L.sc, wy = 3 - (my - L.oy) / L.sc;
        if (pointInPolygon(wx, wy, poly)) { strikeDrum(d, wx, wy); return; }
      }
    };
    handle2.canvas.addEventListener('pointerdown', onKacDown);
    handle2.canvas.style.cursor = 'pointer';

    const onResize = () => { needsDraw = true; ladderDirty = true; theoryPath = null; };
    handle.onResize(onResize);
    handle2.onResize(() => { kacDirty = true; });

    /* ---------- main loop ---------- */
    const loop = cv.rafLoop((dt, t) => { const now = nowS(); draw(dt, now); drawKac(now); });

    // First view: the plate still holds the figure it drew the last time it was bowed.
    rebuildModeSelect();
    applyFrequency(driveF);
    settleSand(3, 1, 1);
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        bus.mute();
        if (driveOn) driveOffQuietly();          // never resume into a surprise drone
      },
      resume() {
        bus.unmute();
        needsDraw = true; kacDirty = true; ladderDirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        if (ritzPending) cancelAnimationFrame(ritzPending);
        if (questTimer) clearTimeout(questTimer);
        handle.canvas.removeEventListener('pointerdown', onPlateDown);
        handle.canvas.removeEventListener('keydown', onPlateKey);
        handle2.canvas.removeEventListener('pointerdown', onKacDown);
        if (sweep) { sweep.dispose(); sweep = null; }
        bus.dispose();
        handle.destroy(); handle2.destroy();
        style.remove();
      },
    };
  },
};

/* ------------------------------- test surface ------------------------------- */

export const _test = {
  F_SCALE, FLO, FHI, BASE, ZETA, GRID, MAXM,
  modeW, modeGrad, modeK, modeFreq, reps, isSumOfTwoSquares,
  buildCatalog, modeResponse, resonanceWeights, strikeExcitation,
  tToF, fToT,
  gaussLegendre, legendreTables, jacobiEigen, ritzFreePlate, ritzValueAt, ritzModeGrid, nodalSegments,
  nodalDomains, courantIndex, ZETA_SAND,
  DRUM_A, DRUM_B, DRUM_A_DIAGS, DRUM_B_DIAGS, DRUM_A_TILES, DRUM_B_TILES,
  GWW_EIGS, NINTH_EXACT, kacNinth, polygonArea, polygonPerimeter, pointInPolygon,
};
