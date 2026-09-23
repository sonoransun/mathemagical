// IV.6 — The Descent
// Cauchy's step of 18 October 1847, run live. Rosenblatt's perceptron finds a
// line (and, on XOR, returns to its own starting state: a proved loop); a small
// network bends the line with gradients computed by reverse mode; the same rule
// winds a boundary through the CMU two-spirals benchmark; a scan line turns the
// learned function into a waveform whose loudest partial counts the arms; a
// power iteration on Hessian–vector products measures the loss's sharpest
// curvature as it climbs to 2/η (the edge of stability, Cohen et al. 2021); and
// a one-dimensional bowl shows why 2/λ is the whole story on a quadratic.
//
// Everything drawn is computed. No top-level DOM/window/Audio access: the first
// half of this file is pure logic, importable (and tested) under node.
//
// Facts used on this page were checked against: Lemaréchal, Doc. Math. ISMP
// (2012) 251–254 (Cauchy, C. R. Acad. Sci. 25 (1847) 536–538); Cornell
// Chronicle, 25 Sep 2019 (the July 1958 ONR demonstration); Freund & Schapire,
// Machine Learning 37 (1999) (Block 1962, Novikoff 1962); Griewank, Doc. Math.
// ISMP (2012) 389–400 (Linnainmaa 1970, Werbos 1982, Wolfe 1982); Nature
// 323:533 (9 Oct 1986); the CMU benchmark file "two-spirals" (Lang & Witbrock
// 1988: 138 weights, ~20,000 epochs); Cybenko, MCSS 2 (1989); Cohen et al.,
// ICLR 2021; Krizhevsky et al., NeurIPS 2012; Silver et al., arXiv:1712.01815;
// Hubert et al., Nature 651 (online 12 Nov 2025); nobelprize.org (8 and 9 Oct
// 2024); ECMWF (25 Feb 2025); Google DeepMind (21 July 2025). The two 2026
// items in `today` (the Jacobian counterexample, 19 Jul 2026; FLT in Lean,
// Anthropic, 4 Sep 2026) are the ones The Telescope cites and sources.

/* ======================================================================
   PART 1 — THE ENGINE (pure; exported via _test)
   ====================================================================== */

const TAU = 2 * Math.PI;
const SEP_U = [0.6, -0.8, 0.1];       // the line that generates the separable points
const SPIRAL_R = 6.5;

// Seeded PRNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- datasets ---------- */

// The CMU Neural Network Benchmark "two-spirals" generator (two-spirals.c by
// Matt White, after Alexis Wieland of MITRE): for i = 0..96·density,
// angle = iπ/(16·density), radius = R(104·density − i)/(104·density);
// (x, y) is class 1 and (−x, −y) class 0. 194 points, three turns.
// (The C source falls back to PI = 3.1416 when PI is undefined; Math.PI moves
// the points negligibly.)
export function twoSpirals(density = 1, maxR = SPIRAL_R) {
  const pts = [];
  const n = 96 * density;
  for (let i = 0; i <= n; i++) {
    const angle = (i * Math.PI) / (16 * density);
    const radius = (maxR * (104 * density - i)) / (104 * density);
    const x = radius * Math.cos(angle), y = radius * Math.sin(angle);
    pts.push({ x, y, label: 1 });
    pts.push({ x: -x, y: -y, label: 0 });
  }
  return pts;
}
// The same points scaled by 1/6.5 into [−1, 1] (raw coordinates saturate tanh).
export function spiralsScaled() {
  return twoSpirals().map((p) => ({ x: p.x / SPIRAL_R, y: p.y / SPIRAL_R, label: p.label }));
}
export function xorData() {
  return [
    { x: -1, y: -1, label: 0 }, { x: 1, y: 1, label: 0 },
    { x: -1, y: 1, label: 1 }, { x: 1, y: -1, label: 1 },
  ];
}
export function andData() {
  return [
    { x: -1, y: -1, label: 0 }, { x: -1, y: 1, label: 0 },
    { x: 1, y: -1, label: 0 }, { x: 1, y: 1, label: 1 },
  ];
}
// n points uniform on [−1,1]², labelled by the side of u·(x, y, 1), rejecting a
// margin band |u·x̃| < margin so that some line separates them with room to spare.
export function separable(seed, n = 40, u = SEP_U, margin = 0.1) {
  const rnd = mulberry32(seed);
  const pts = [];
  while (pts.length < n) {
    const x = 2 * rnd() - 1, y = 2 * rnd() - 1;
    const s = u[0] * x + u[1] * y + u[2];
    if (Math.abs(s) < margin) continue;
    pts.push({ x, y, label: s > 0 ? 1 : 0 });
  }
  return pts;
}

/* ---------- the perceptron (Rosenblatt 1958; Block 1962, Novikoff 1962) ---------- */

// One visit: labels 0/1 become t = −1/+1, x̃ = (x, y, 1). A mistake is
// t·(w·x̃) ≤ 0, and then w ← w + t·x̃. Returns true on a mistake (w mutated).
export function perceptronVisit(w, p) {
  const t = p.label ? 1 : -1;
  if (t * (w[0] * p.x + w[1] * p.y + w[2]) <= 0) {
    w[0] += t * p.x; w[1] += t * p.y; w[2] += t;
    return true;
  }
  return false;
}
export function perceptronEpoch(w, pts) {
  let m = 0;
  for (const p of pts) if (perceptronVisit(w, p)) m++;
  return m;
}
// Train from w = 0 until a clean pass (converged) or until the state at the end
// of a pass equals the state at the start of an earlier pass (a proved cycle —
// the snapshot-and-compare verdict of III.3).
export function perceptronTrain(pts, maxEpochs = 1000) {
  const w = [0, 0, 0];
  const seen = new Map();
  let total = 0;
  for (let e = 0; e < maxEpochs; e++) {
    const key = w.join(',');
    if (!seen.has(key)) seen.set(key, e);
    const m = perceptronEpoch(w, pts);
    total += m;
    if (m === 0) return { w, mistakes: total, epochs: e + 1, converged: true, cycle: null };
    const k2 = w.join(',');
    if (seen.has(k2)) return { w, mistakes: total, epochs: e + 1, converged: false, cycle: { from: seen.get(k2), at: e + 1 } };
  }
  return { w, mistakes: total, epochs: maxEpochs, converged: false, cycle: null };
}
// Block–Novikoff: if the (augmented) unit vector u gives t·u·x̃ ≥ γ > 0 for every
// point and ‖x̃‖ ≤ R, the perceptron makes at most (R/γ)² mistakes.
export function novikoffBound(pts, u) {
  const nu = Math.hypot(u[0], u[1], u[2]);
  let R = 0, g = Infinity;
  for (const p of pts) {
    const t = p.label ? 1 : -1;
    R = Math.max(R, Math.hypot(p.x, p.y, 1));
    g = Math.min(g, (t * (u[0] * p.x + u[1] * p.y + u[2])) / nu);
  }
  return g > 0 ? (R / g) ** 2 : Infinity;
}

/* ---------- the network: tanh hidden layers, sigmoid output, cross-entropy ---------- */

// Flat parameter layout. Layer l: W (nout × nin, row-major) then b (nout).
export function mlpLayout(sizes) {
  const layers = [];
  let off = 0;
  for (let l = 0; l < sizes.length - 1; l++) {
    const nin = sizes[l], nout = sizes[l + 1];
    layers.push({ nin, nout, W: off, b: off + nin * nout });
    off += nin * nout + nout;
  }
  return { sizes: sizes.slice(), layers, nParams: off };
}
// Weights N(0, 1/n_in) by Box–Muller over mulberry32; biases 0.
export function mlpInit(sizes, seed = 1) {
  const L = mlpLayout(sizes);
  const rnd = mulberry32(seed);
  const theta = new Float64Array(L.nParams);
  for (const ly of L.layers) {
    const s = Math.sqrt(1 / ly.nin);
    for (let i = 0; i < ly.nin * ly.nout; i++) {
      const u = 1 - rnd(), v = rnd();
      theta[ly.W + i] = s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
  }
  return { L, theta };
}
export function makeActs(L) { return L.sizes.map((n) => new Float64Array(n)); }

const sigmoid = (z) => 1 / (1 + Math.exp(-z));   // exp overflow gives 0 or 1, never NaN

// Forward pass for one input; acts[l] receives layer l's activations. Returns q.
export function mlpForward(L, theta, x, y, acts) {
  let a = acts ? acts[0] : new Float64Array(2);
  a[0] = x; a[1] = y;
  const nl = L.layers.length;
  for (let l = 0; l < nl; l++) {
    const ly = L.layers[l];
    const out = acts ? acts[l + 1] : new Float64Array(ly.nout);
    const nin = ly.nin;
    for (let j = 0; j < ly.nout; j++) {
      let z = theta[ly.b + j];
      const row = ly.W + j * nin;
      for (let i = 0; i < nin; i++) z += theta[row + i] * a[i];
      out[j] = l === nl - 1 ? sigmoid(z) : Math.tanh(z);
    }
    a = out;
  }
  return a[0];
}

const WORK = new WeakMap();
function workFor(L) {
  let w = WORK.get(L);
  if (!w) {
    const n = L.nParams;
    w = {
      acts: makeActs(L), deltas: L.sizes.map((k) => new Float64Array(k)),
      tp: new Float64Array(n), tm: new Float64Array(n), g1: new Float64Array(n), g0: new Float64Array(n),
      hv: new Float64Array(n),
    };
    WORK.set(L, w);
  }
  return w;
}

// Reverse mode (backpropagation): the batch loss and its full gradient.
// δ_out = q − t; δ_l = (W_{l+1}ᵀ δ_{l+1}) ⊙ (1 − h_l²); ∂L/∂W_l = δ_l h_{l−1}ᵀ.
export function lossAndGrad(L, theta, pts, grad) {
  const { acts, deltas } = workFor(L);
  grad.fill(0);
  let loss = 0;
  const nl = L.layers.length;
  const eps = 1e-12;
  for (const p of pts) {
    const q = mlpForward(L, theta, p.x, p.y, acts);
    const t = p.label;
    loss += -(t * Math.log(q + eps) + (1 - t) * Math.log(1 - q + eps));
    deltas[nl][0] = q - t;
    for (let l = nl - 1; l >= 0; l--) {
      const ly = L.layers[l];
      const ain = acts[l], dout = deltas[l + 1], din = deltas[l];
      const nin = ly.nin;
      din.fill(0);
      for (let j = 0; j < ly.nout; j++) {
        const d = dout[j];
        grad[ly.b + j] += d;
        const row = ly.W + j * nin;
        for (let i = 0; i < nin; i++) {
          grad[row + i] += d * ain[i];
          din[i] += d * theta[row + i];
        }
      }
      if (l > 0) for (let i = 0; i < nin; i++) din[i] *= 1 - ain[i] * ain[i];
    }
  }
  const n = pts.length;
  for (let k = 0; k < grad.length; k++) grad[k] /= n;
  return loss / n;
}
export function lossOnly(L, theta, pts) {
  const acts = makeActs(L);
  let loss = 0;
  for (const p of pts) {
    const q = mlpForward(L, theta, p.x, p.y, acts);
    loss += -(p.label * Math.log(q + 1e-12) + (1 - p.label) * Math.log(1 - q + 1e-12));
  }
  return loss / pts.length;
}
// 'argmax': q > ½ ⇔ class 1. '40-20-40' (the CMU reporting criterion): a 1 must
// be in the top 40% of the output range, a 0 in the bottom 40%.
export function accuracy(L, theta, pts, criterion = 'argmax') {
  const acts = makeActs(L);
  let ok = 0;
  for (const p of pts) {
    const q = mlpForward(L, theta, p.x, p.y, acts);
    if (criterion === '40-20-40') ok += p.label ? (q >= 0.6 ? 1 : 0) : (q <= 0.4 ? 1 : 0);
    else ok += (q > 0.5) === (p.label === 1) ? 1 : 0;
  }
  return ok / pts.length;
}

// Multiply-adds per training point ("connection crossings", in Fahlman's term):
// forward Σ nin·nout; backward the same for weight gradients plus the same again
// for the deltas of every layer except the input's. Finite differences need two
// forward passes per parameter.
export function macCounts(sizes) {
  const L = mlpLayout(sizes);
  let fwd = 0, back = 0;
  L.layers.forEach((ly, l) => {
    fwd += ly.nin * ly.nout;
    back += ly.nin * ly.nout;
    if (l > 0) back += ly.nin * ly.nout;
  });
  return { forward: fwd, backward: back, total: fwd + back, ratio: (fwd + back) / fwd,
    fdPasses: 2 * L.nParams, fdMacs: 2 * L.nParams * fwd, nParams: L.nParams };
}
// Lang & Witbrock's shortcut network: every unit sees every earlier layer.
export function shortcutParamCount(sizes) {
  let total = 0, below = sizes[0];
  for (let l = 1; l < sizes.length; l++) { total += sizes[l] * below + sizes[l]; below += sizes[l]; }
  return total;
}

// Cauchy's step, w ← w − η∇L(w), or Polyak's heavy ball: v ← βv − η∇L, w ← w + v.
// Returns the loss at the point where the gradient was taken.
export function gdStep(L, theta, pts, lr, grad, vel = null, beta = 0) {
  const loss = lossAndGrad(L, theta, pts, grad);
  if (vel && beta > 0) {
    for (let k = 0; k < theta.length; k++) { vel[k] = beta * vel[k] - lr * grad[k]; theta[k] += vel[k]; }
  } else {
    for (let k = 0; k < theta.length; k++) theta[k] -= lr * grad[k];
  }
  return loss;
}

/* ---------- the bowl: L = ½λw² ---------- */

// Gradient descent multiplies w by (1 − ηλ) each step: converges iff 0 < ηλ < 2.
export function quadraticGD(lambda, lr, w0, steps) {
  let w = w0;
  const path = [w];
  for (let s = 0; s < steps; s++) { w = w - lr * lambda * w; path.push(w); }
  return path;
}
// Heavy ball on the same bowl; diverges iff λ > (2 + 2β)/η.
export function heavyBall(lambda, lr, beta, steps, w0 = 1) {
  let x = w0, v = 0;
  for (let s = 0; s < steps; s++) { v = beta * v - lr * lambda * x; x += v; }
  return x;
}

/* ---------- sharpness: top Hessian eigenvalue by power iteration ---------- */

// Hv ≈ [∇L(θ + hv) − ∇L(θ − hv)] / 2h.
export function hvp(L, theta, pts, v, out, h = 1e-4) {
  const w = workFor(L);
  const n = theta.length;
  for (let k = 0; k < n; k++) { w.tp[k] = theta[k] + h * v[k]; w.tm[k] = theta[k] - h * v[k]; }
  lossAndGrad(L, w.tp, pts, w.g1);
  lossAndGrad(L, w.tm, pts, w.g0);
  for (let k = 0; k < n; k++) out[k] = (w.g1[k] - w.g0[k]) / (2 * h);
  return out;
}
// One warm-started power-iteration step: returns vᵀHv, replaces v by Hv/‖Hv‖.
export function powerStep(L, theta, pts, v) {
  const Hv = hvp(L, theta, pts, v, workFor(L).hv);
  let dot = 0, nn = 0;
  for (let k = 0; k < v.length; k++) { dot += Hv[k] * v[k]; nn += Hv[k] * Hv[k]; }
  nn = Math.sqrt(nn);
  if (nn > 0) for (let k = 0; k < v.length; k++) v[k] = Hv[k] / nn;
  return dot;
}
export function randomUnit(n, seed = 7) {
  const rnd = mulberry32(seed);
  const v = new Float64Array(n);
  let s = 0;
  for (let k = 0; k < n; k++) { v[k] = rnd() - 0.5; s += v[k] * v[k]; }
  s = Math.sqrt(s);
  for (let k = 0; k < n; k++) v[k] /= s;
  return v;
}
export function sharpness(L, theta, pts, iters = 20, seed = 7) {
  const v = randomUnit(theta.length, seed);
  let lam = 0;
  for (let it = 0; it < iters; it++) lam = powerStep(L, theta, pts, v);
  return lam;
}

/* ---------- the scan line: the learned function as one period of a wave ---------- */

// Sample q along P0→P1 and back (so the period is continuous), map to 2q − 1,
// remove the mean.
export function scanlineWave(L, theta, x0, y0, x1, y1, N = 512) {
  const acts = makeActs(L);
  const w = new Float64Array(N);
  let mean = 0;
  for (let n = 0; n < N; n++) {
    const s = n < N / 2 ? (2 * n) / N : 2 - (2 * n) / N;
    const q = mlpForward(L, theta, x0 + s * (x1 - x0), y0 + s * (y1 - y0), acts);
    w[n] = 2 * q - 1; mean += w[n];
  }
  mean /= N;
  for (let n = 0; n < N; n++) w[n] -= mean;
  return w;
}
// Fourier-series coefficients of one period: w(t) ≈ Σ a_k cos(kωt) + b_k sin(kωt).
// Arrays are indexed 0..K (index 0, the mean, is zero): exactly what
// createPeriodicWave(real = a, imag = b) expects.
export function harmonicCoeffs(w, K = 64) {
  const N = w.length;
  const a = new Float32Array(K + 1), b = new Float32Array(K + 1);
  const mags = new Float64Array(K + 1);
  for (let k = 1; k <= K; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const ang = (TAU * k * n) / N;
      re += w[n] * Math.cos(ang); im += w[n] * Math.sin(ang);
    }
    a[k] = (2 / N) * re; b[k] = (2 / N) * im;
    mags[k] = Math.hypot(a[k], b[k]);
  }
  return { a, b, mags };
}
// |c_k| for k = 1..K, as a plain array.
export function harmonicMags(w, K = 32) {
  const { mags } = harmonicCoeffs(w, K);
  return Array.from(mags.slice(1));
}
export function rms(w) { let s = 0; for (let n = 0; n < w.length; n++) s += w[n] * w[n]; return Math.sqrt(s / w.length); }

// How many times the decision (q > ½) flips along a segment.
export function countCrossings(L, theta, x0, y0, x1, y1, n = 2000) {
  const acts = makeActs(L);
  let c = 0, prev = null;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const cur = mlpForward(L, theta, x0 + s * (x1 - x0), y0 + s * (y1 - y0), acts) > 0.5;
    if (prev !== null && cur !== prev) c++;
    prev = cur;
  }
  return c;
}

/* ---------- marching squares ---------- */

// Iso-line of a grid (row-major, nx × ny) at `level`, as flat segments
// [x0, y0, x1, y1, …] in grid-index coordinates (column, row).
export function contourSegments(g, nx, ny, level) {
  const out = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = g[j * nx + i], b = g[j * nx + i + 1];
      const c = g[(j + 1) * nx + i + 1], d = g[(j + 1) * nx + i];
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = () => [i + (level - a) / (b - a), j];
      const R = () => [i + 1, j + (level - b) / (c - b)];
      const B = () => [i + (level - d) / (c - d), j + 1];
      const Lf = () => [i, j + (level - a) / (d - a)];
      const seg = (p, q) => { out.push(p[0], p[1], q[0], q[1]); };
      const centre = (a + b + c + d) / 4 > level;
      switch (idx) {
        case 1: case 14: seg(Lf(), B()); break;
        case 2: case 13: seg(B(), R()); break;
        case 3: case 12: seg(Lf(), R()); break;
        case 4: case 11: seg(T(), R()); break;
        case 6: case 9: seg(T(), B()); break;
        case 7: case 8: seg(Lf(), T()); break;
        case 5: if (centre) { seg(Lf(), T()); seg(B(), R()); } else { seg(T(), R()); seg(Lf(), B()); } break;
        case 10: if (centre) { seg(T(), R()); seg(Lf(), B()); } else { seg(Lf(), T()); seg(B(), R()); } break;
        default: break;
      }
    }
  }
  return out;
}

// Fraction of grid cells inside the disk r ≤ rIn where two probability grids
// (n × n over [−E, E]², cell centres) fall on opposite sides of ½.
export function disagreeFraction(qa, qb, n, E, rIn = 1) {
  let inside = 0, dis = 0;
  for (let j = 0; j < n; j++) {
    const y = E - ((j + 0.5) * 2 * E) / n;
    for (let i = 0; i < n; i++) {
      const x = -E + ((i + 0.5) * 2 * E) / n;
      if (x * x + y * y > rIn * rIn) continue;
      inside++;
      if ((qa[j * n + i] > 0.5) !== (qb[j * n + i] > 0.5)) dis++;
    }
  }
  return inside ? dis / inside : 0;
}

/* ---------- verified anchors ---------- */

function check(cond, msg) { if (!cond) throw new Error('learner selfTest: ' + msg); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Returns true or throws. opts.quick skips the three training anchors (~2 s).
export function selfTest(opts = {}) {
  // (a) the CMU generator
  const S = twoSpirals();
  check(S.length === 194, 'spirals: 194 points');
  check(S[0].x === 6.5 && S[0].y === 0 && S[0].label === 1, 'spirals: first point (6.5, 0), class 1');
  check(S[1].x === -6.5 && S[1].label === 0, 'spirals: second point (−6.5, −0), class 0');
  check(near(S[192].x, 0.5, 1e-12) && Math.abs(S[192].y) < 1e-12 && S[192].label === 1, 'spirals: point 192 is (0.5, 0)');
  for (let i = 0; i <= 96; i++) check(near(Math.hypot(S[2 * i].x, S[2 * i].y), (6.5 * (104 - i)) / 104, 1e-12), 'spirals: radius ' + i);
  // (b) fourteen alternating labels on the diameter: at least 13 crossings for any perfect classifier
  const axis = S.filter((p) => Math.abs(p.y) < 1e-9).sort((p, q) => p.x - q.x);
  check(axis.length === 14, 'diameter: 14 points');
  for (let k = 0; k < 14; k++) {
    check(near(axis[k].x, -6.5 + k, 1e-9), 'diameter: x = ' + (-6.5 + k));
    check(axis[k].label === k % 2, 'diameter: alternating labels');
  }
  // (c) XOR: the perceptron returns to (0, 0, 0) after every pass
  const X = xorData();
  {
    const w = [0, 0, 0], trace = [];
    for (const p of X) { perceptronVisit(w, p); trace.push(w.join(',')); }
    check(trace.join(' ') === '1,1,-1 0,0,-2 -1,1,-1 0,0,0', 'XOR: first-pass trace');
    for (let e = 0; e < 50; e++) { check(perceptronEpoch(w, X) === 4, 'XOR: 4 mistakes a pass'); check(w.join(',') === '0,0,0', 'XOR: back to zero'); }
    const r = perceptronTrain(X, 1000);
    check(!r.converged && r.cycle && r.cycle.from === 0 && r.cycle.at === 1, 'XOR: cycle proved after one pass');
    // in every one of the 24 presentation orders the four corrections cancel (Σ t·x̃ = 0)
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q])));
    for (const order of perms([0, 1, 2, 3])) {
      const ro = perceptronTrain(order.map((i) => X[i]), 100);
      check(ro.cycle && ro.cycle.at === 1 && ro.mistakes === 4 && ro.w.join(',') === '0,0,0', 'XOR: order ' + order.join(''));
    }
  }
  // (d) AND: one mistake, w = (1, 1, −1), bound 9
  {
    const r = perceptronTrain(andData());
    check(r.converged && r.mistakes === 1 && r.w.join(',') === '1,1,-1', 'AND: one mistake');
    check(near(novikoffBound(andData(), [1, 1, -1]), 9, 1e-9), 'AND: Block–Novikoff bound 9');
  }
  // (e) separable seeds 1–5
  {
    const want = [8, 12, 2, 8, 4];
    for (let s = 1; s <= 5; s++) {
      const P = separable(s);
      const r = perceptronTrain(P, 10000);
      const b = novikoffBound(P, SEP_U);
      check(r.converged && r.mistakes === want[s - 1] && r.mistakes <= b, 'separable seed ' + s);
      if (s === 1) check(near(b, 177.78, 0.01), 'separable seed 1: bound 177.78');
    }
  }
  // (f) parameter counts
  for (const [s, n] of [[[2, 16, 16, 1], 337], [[2, 8, 8, 1], 105], [[2, 2, 1], 9], [[2, 3, 1], 13], [[2, 1, 1], 5]]) {
    check(mlpLayout(s).nParams === n, 'nParams ' + s.join('-'));
  }
  check(shortcutParamCount([2, 5, 5, 5, 1]) === 138, 'Lang–Witbrock: 138 weights');
  // (g) reverse mode agrees with central differences
  {
    const { L, theta } = mlpInit([2, 8, 8, 1], 42);
    const g = new Float64Array(L.nParams);
    const l0 = lossAndGrad(L, theta, S, g);
    check(near(l0, 0.72876404506500, 1e-9), 'initial loss seed 42');
    let mx = 0;
    const h = 1e-5;
    for (let k = 0; k < L.nParams; k++) {
      const tp = Float64Array.from(theta); tp[k] += h;
      const tm = Float64Array.from(theta); tm[k] -= h;
      mx = Math.max(mx, Math.abs((lossOnly(L, tp, S) - lossOnly(L, tm, S)) / (2 * h) - g[k]));
    }
    check(mx < 1e-8, 'gradient check: max error ' + mx);
  }
  // (h) the cheap gradient
  {
    const m = macCounts([2, 16, 16, 1]);
    check(m.forward === 304 && m.total === 880 && near(m.ratio, 2.8947, 1e-4) && m.fdPasses === 674 && m.fdMacs === 204896, 'macCounts');
  }
  // (i) the bowl and the heavy ball
  {
    const p = quadraticGD(4, 0.5, 1, 4);
    check(p.join(',') === '1,-1,1,-1,1', 'bowl: 1, −1, 1, −1 at η = 2/λ');
    check(near(quadraticGD(4, 0.49, 1, 20)[20], 0.4420, 1e-4) && near(quadraticGD(4, 0.51, 1, 20)[20], 2.1911, 1e-4), 'bowl: either side of 2/λ');
    check(Math.abs(heavyBall(4, 0.94, 0.9, 2000)) < 1e-40 && Math.abs(heavyBall(4, 0.96, 0.9, 2000)) > 1e100, 'heavy ball: threshold (2 + 2β)/λ');
  }
  // marching squares on a disc: every vertex near r = ½
  {
    const n = 41, g = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -1 + (2 * i) / (n - 1), y = -1 + (2 * j) / (n - 1); g[j * n + i] = x * x + y * y; }
    const seg = contourSegments(g, n, n, 0.25);
    check(seg.length > 40, 'contour: segments found');
    for (let k = 0; k < seg.length; k += 2) {
      const x = -1 + (2 * seg[k]) / (n - 1), y = -1 + (2 * seg[k + 1]) / (n - 1);
      check(Math.abs(Math.hypot(x, y) - 0.5) < 0.02, 'contour: on the circle');
    }
    const one = new Float32Array(16).fill(0.9), zero = new Float32Array(16).fill(0.1);
    check(disagreeFraction(one, one, 4, 1, 2) === 0 && disagreeFraction(one, zero, 4, 1, 2) === 1, 'disagreement');
  }
  // (k) XOR networks: one hidden unit is still a line
  for (let seed = 1; seed <= 3; seed++) {
    for (const [sizes, want] of [[[2, 1, 1], 0.75], [[2, 3, 1], 1]]) {
      const { L, theta } = mlpInit(sizes, seed);
      const g = new Float64Array(L.nParams), v = new Float64Array(L.nParams);
      let best = 0;
      for (let s = 1; s <= 3000; s++) { gdStep(L, theta, X, 0.5, g, v, 0.9); best = Math.max(best, accuracy(L, theta, X)); }
      check(best === want, `XOR ${sizes.join('-')} seed ${seed}: best ${best}`);
    }
  }
  if (opts.quick) return true;
  // (j)+(m) the spirals, seed 2: solved by step 4000; 13 crossings; the 13th harmonic loudest
  {
    const Ss = spiralsScaled();
    const { L, theta } = mlpInit([2, 16, 16, 1], 2);
    const g = new Float64Array(L.nParams), v = new Float64Array(L.nParams);
    const r0 = rms(scanlineWave(L, theta, -1, 0, 1, 0, 512));
    check(near(r0, 0.095, 0.01), 'untrained scan-line RMS ≈ 0.095');
    for (let s = 1; s <= 4000; s++) gdStep(L, theta, Ss, 0.3, g, v, 0.9);
    check(accuracy(L, theta, Ss) === 1, 'spirals seed 2 solved by step 4000');
    check(countCrossings(L, theta, -1, 0, 1, 0, 4000) === 13, 'spirals: 13 crossings on the diameter');
    const w = scanlineWave(L, theta, -1, 0, 1, 0, 512);
    const mags = harmonicMags(w, 64);
    let kmax = 0;
    mags.forEach((m, i) => { if (m > mags[kmax]) kmax = i; });
    check(kmax + 1 === 13, 'spirals: 13th harmonic dominates');
    check(rms(w) > 0.8, 'trained scan-line RMS > 0.8');
  }
  // (l) the edge of stability: plain descent, η = 0.5, curvature pinned near 2/η = 4
  {
    const Ss = spiralsScaled();
    const { L, theta } = mlpInit([2, 16, 16, 1], 1);
    const g = new Float64Array(L.nParams);
    check(sharpness(L, theta, Ss, 30) < 1, 'initial sharpness below 1');
    for (let s = 1; s <= 2000; s++) gdStep(L, theta, Ss, 0.5, g);
    const lam = sharpness(L, theta, Ss, 40);
    check(lam > 3.8 && lam < 4.2, 'edge of stability: λmax ' + lam.toFixed(3) + ' near 4');
  }
  return true;
}

/* ======================================================================
   PART 2 — THE EXHIBIT
   ====================================================================== */

const CHAPTERS = [
  { n: 1, name: 'i · the line', year: '1958' },
  { n: 2, name: 'ii · the bend', year: '1986' },
  { n: 3, name: 'iii · the spirals', year: '1988' },
  { n: 4, name: 'iv · the edge', year: '2021' },
];
const RULER_MARKS = [
  { v: 138, label: '138', note: 'Lang & Witbrock · 1988' },
  { v: 6e7, label: '60 million', note: 'AlexNet · 2012' },
  { v: 1.75e11, label: '175 billion', note: 'GPT-3 · 2020' },
];

const NUMW = ['no', 'one', 'two', 'three', 'four'];
const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtNum = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const fmtW = (w) => '(' + w.map((x) => fmtNum(Math.round(x * 100) / 100, Number.isInteger(Math.round(x * 100) / 100) ? 0 : 2)).join(', ') + ')';
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ordinal = (k) => k + (k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] || 'th');
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
// A colour `t` of the way from a to b (hex in, hex out).
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// A small history buffer that halves its resolution when full.
function history(cap = 1200) {
  return {
    vals: [], steps: [], stride: 1, cap,
    push(step, v) {
      if (step % this.stride !== 0) return;
      this.vals.push(v); this.steps.push(step);
      if (this.vals.length > this.cap) {
        this.vals = this.vals.filter((_, i) => i % 2 === 0);
        this.steps = this.steps.filter((_, i) => i % 2 === 0);
        this.stride *= 2;
      }
    },
    get last() { return this.vals.length ? this.vals[this.vals.length - 1] : NaN; },
    clear() { this.vals = []; this.steps = []; this.stride = 1; },
  };
}

export default {
  id: 'learner',
  movement: 4,
  title: 'The Descent',
  hook: 'In 1847 Cauchy wrote a rule for chasing planets: take a small step downhill. Here it untangles two spirals while you watch, and today it trains the machines that write proofs.',
  era: '1847–2025 · Paris, Buffalo, Helsinki, Toronto',
  prose: `
    <p>On 18 October 1847 Augustin-Louis Cauchy gave the Académie des sciences in Paris a
    three-page method for systems of equations that elimination could not untangle. He was
    thinking of astronomy: an orbit has six elements, and he wanted to solve for them
    directly. Take a function of the unknowns that is never negative, he wrote. To find where
    it is zero, it will suffice to make it decrease without end, <em>jusqu’à ce qu’elle
    s’évanouisse</em>, until it vanishes: find its slope along each unknown, and move every
    unknown a little against its slope. If the step is <em>suffisamment petit</em>, small
    enough, the function goes down; repeat, and it keeps going down until it vanishes, or at
    least until it reaches a minimum. He promised a fuller memoir;
    Claude Lemaréchal, retelling the story in 2012, reports that it does not seem to exist. In
    today’s notation the whole method is one line, <code>w ← w − η∇L(w)</code>, and
    everything on the stage below is that line, running.</p>
    <p>In July 1958 the U.S. Office of Naval Research unveiled an IBM 704 that, after 50
    trials, had taught itself to tell punch cards marked on the left from cards marked on the
    right. <em>The New Yorker</em> called Frank Rosenblatt’s perceptron “the first serious
    rival to the human brain ever devised.” The mathematics was more modest and has lasted
    longer. The perceptron learns by correcting its errors, and in the form that Block and
    Novikoff analysed in 1962 the rule is the humblest there is: when it gets a point wrong,
    add that point to its weights, or subtract it. They showed that if some line separates
    the data with room to spare, the rule makes at most <code>(R/γ)²</code> mistakes and then
    stops for good. Give it XOR, four points with opposite corners alike, and it never
    stops: from zero, each pass makes four corrections that cancel exactly, in whatever
    order the points arrive, and it is back where it began. No line can do it. The proof is four inequalities that contradict one another, the same
    shape of argument that sank the fraction for √2 in <a href="#ex-diagonal">The Diagonal</a>.
    In 1969 Marvin Minsky and Seymour Papert’s <em>Perceptrons</em> set out the limits of
    machines with a single layer of adjustable weights.</p>
    <p>A hidden layer bends the line. Two hidden units draw the two cuts XOR needs, and the
    output combines them. Now, though, Cauchy’s rule needs the slope of the error with respect
    to weights buried inside the network, and the answer is the chain rule run backwards: one
    sweep from the output to the inputs delivers every partial derivative at once. Seppo
    Linnainmaa wrote it down in his 1970 master’s thesis at Helsinki as a way to estimate
    accumulated rounding error, with no networks in sight; the idea, he later said, came to
    him on a sunny afternoon in a Copenhagen park. Paul Werbos applied it to neural networks
    in 1982, and on 9 October 1986 David Rumelhart, Geoffrey Hinton and Ronald Williams showed
    in <em>Nature</em> that hidden units trained this way come to represent important features
    of the task. The economy is the point. For the 337-weight network below, a forward pass
    costs 304 multiply-adds per point and the backward sweep brings the total to 880, under
    three forward passes. Measuring the slopes by nudging each weight both ways, one at a time,
    would take 674 forward passes.</p>
    <p>Then comes a benchmark of the late 1980s. Alexis Wieland of MITRE posted two
    spirals to the connectionists’ mailing list: 194 points coiled three times around the
    origin and around each other. It “appears to be a very difficult task for
    back-propagation networks,” say the Carnegie Mellon benchmark notes, and it is
    “impossible for a linear separator.” In 1988
    Kevin Lang and Michael Witbrock solved it with a 138-weight network and, using standard
    back-propagation, about 20,000 passes through the data. Press <em>listen</em> and the
    network’s belief along a scan line becomes one cycle of a waveform, and the data choose
    which partial rings. The fourteen training points on the horizontal diameter alternate
    colours, so a network that gets them all right must change its mind at least thirteen
    times along it; once it has, the thirteenth harmonic tends to be the loudest. You are
    hearing the arms.
    In 1989 George Cybenko proved that a single hidden layer of sigmoids can approximate
    “arbitrary decision regions” as closely as we like. That is Fourier’s sentence from the
    Atelier, with ridges in place of circles, and like Fourier’s it promises that a solution
    exists, not that descent will find it.</p>
    <p>Cauchy saw the one real danger: the step must be small enough. On a bowl of curvature
    λ, descent converges exactly when <code>η &lt; 2/λ</code>. At <code>2/λ</code> it
    rattles between the walls forever, and beyond it the walls throw it out. A network is not
    one bowl, and in 2021 Jeremy Cohen and colleagues reported what the classical theory did
    not predict: under full-batch gradient descent the loss’s sharpest curvature rises until
    it reaches about <code>2/η</code> and then hovers there, while the loss, jittering from
    step to step, still falls over the long run. They called it the <em>edge of
    stability</em>. The meter beside the plane measures it live, on this network’s own
    Hessian, and nobody yet fully knows why training thrives there.</p>
    <p>With momentum and random samples of the data, the same step trained the sixty million
    weights of the network with which Alex Krizhevsky, Ilya Sutskever and Hinton won the 2012
    ImageNet competition. In AlphaZero, “the parameters θ are adjusted by gradient descent on a
    loss function,” and AlphaProof, the prover that with AlphaGeometry 2 reached silver-medal
    standard at the 2024 International Mathematical Olympiad, was built in AlphaZero’s image. The kernel in
    <a href="#ex-telescope">The Telescope</a> does not ask who wrote a proof. Below, you can
    watch how the writer is grown.</p>`,

  chronicle: [
    { year: 1847, date: '18 October 1847', text: 'Augustin-Louis Cauchy presents to the Paris Académie des sciences a general method for simultaneous equations: step every unknown against its partial derivative, so that a never-negative function keeps decreasing. His motivating problem is the six elements of an orbit.' },
    { year: 1958, date: 'July 1958', text: 'The U.S. Office of Naval Research unveils Frank Rosenblatt’s <em>perceptron</em>: an IBM 704 that, after 50 trials, teaches itself to tell punch cards marked on the left from cards marked on the right.' },
    { year: 1969, date: '1969', text: 'Marvin Minsky and Seymour Papert publish <em>Perceptrons</em>, on the limits of machines with a single layer of adjustable weights. In 2024 the Nobel Committee for Physics, taking XOR as a simple example of those limits, wrote that the book “led to a hiatus funding-wise” for neural-network research.' },
    { year: 1970, date: '1970', text: 'In his master’s thesis at the University of Helsinki, Seppo Linnainmaa gives the reverse mode of differentiation, the chain rule run backwards, to estimate accumulated rounding error. He publishes it in English in <em>BIT</em> in 1976.' },
    { year: 1986, date: '9 October 1986', text: 'David Rumelhart, Geoffrey Hinton and Ronald Williams show in <em>Nature</em> that back-propagated gradients teach a network’s hidden units to represent features of its task.' },
    { year: 2012, date: '2012', text: 'AlexNet, a 60-million-parameter network by Alex Krizhevsky, Ilya Sutskever and Geoffrey Hinton, trained by stochastic gradient descent, wins the ILSVRC-2012 ImageNet competition with a top-5 error of 15.3%, against 26.2% for the next entry.' },
    { year: 2024, date: '8 October 2024', text: 'The Nobel Prize in Physics goes to John Hopfield and Geoffrey Hinton “for foundational discoveries and inventions that enable machine learning with artificial neural networks”.' },
    { year: 2025, date: '21 July 2025', text: 'Google DeepMind reports that an advanced Gemini Deep Think scored 35 of 42 at the International Mathematical Olympiad, graded by the Olympiad’s coordinators; a year earlier AlphaProof and AlphaGeometry 2 had reached silver-medal standard.' },
  ],

  today: `
    <p>The networks behind today’s image recognition, speech and language systems are trained
    by descendants of the loop on this stage: a forward pass, a reverse sweep of the chain rule,
    a small step downhill, repeated. What has changed is the count. GPT-3 had 175 billion
    parameters in 2020. In October 2024 the Nobel Prize in Physics went to John Hopfield and
    Geoffrey Hinton “for foundational discoveries and inventions that enable machine learning
    with artificial neural networks”, and half the chemistry prize to Demis Hassabis and John
    Jumper “for protein structure prediction”.</p>
    <p>On 25 February 2025 the European Centre for Medium-Range Weather Forecasts made its
    machine-learned forecasting system, AIFS, operational beside its physics-based model. It
    reports gains of up to 20% on some measures, tropical-cyclone tracks among them, for about
    a thousandth of the energy per forecast. In mathematics, AlphaProof, described in
    <em>Nature</em> in November 2025, learns to find formal proofs in Lean; with AlphaGeometry 2
    it reached silver-medal standard at the 2024 Olympiad after two to three days of
    computation. In July 2025 an advanced Gemini Deep Think scored 35 of 42 at the 2025
    Olympiad, officially graded, writing in natural language within the 4.5-hour limit.</p>
    <p>A year later the machines were at work on research mathematics: in July 2026 Levent Alpöge
    presented a counterexample to the Jacobian conjecture credited to an AI model, and that
    September AI agents wrote a Lean proof of Fermat’s Last Theorem some thirteen million lines
    long in eleven days. The Telescope tells both stories. The theory still trails the practice:
    why descent on such rugged landscapes finds good solutions, and why it thrives at the edge of
    stability where the classical analysis expects trouble, remain open research questions.</p>`,

  sources: [
    { text: 'C. Lemaréchal, “Cauchy and the Gradient Method”, <em>Documenta Mathematica</em>, Extra Volume ISMP (2012) 251–254, on Cauchy, <em>C. R. Acad. Sci. Paris</em> 25 (1847) 536–538', url: 'https://doi.org/10.4171/dms/6/27' },
    { text: 'M. Lefkowitz, “Professor’s perceptron paved the way for AI – 60 years too soon”, <em>Cornell Chronicle</em> (25 September 2019)', url: 'https://news.cornell.edu/stories/2019/09/professors-perceptron-paved-way-ai-60-years-too-soon' },
    { text: 'A. Griewank, “Who Invented the Reverse Mode of Differentiation?”, <em>Documenta Mathematica</em>, Extra Volume ISMP (2012) 389–400', url: 'https://doi.org/10.4171/dms/6/38' },
    { text: 'D. E. Rumelhart, G. E. Hinton &amp; R. J. Williams, “Learning representations by back-propagating errors”, <em>Nature</em> 323 (1986) 533–536', url: 'https://doi.org/10.1038/323533a0' },
    { text: 'CMU Neural Network Benchmark Collection: “Two Spirals” (after A. Wieland; results of K. Lang &amp; M. Witbrock, 1988)', url: 'https://www.cs.cmu.edu/afs/cs/project/ai-repository/ai/areas/neural/bench/cmu/0.html' },
    { text: 'G. Cybenko, “Approximation by superpositions of a sigmoidal function”, <em>Mathematics of Control, Signals and Systems</em> 2 (1989) 303–314', url: 'https://doi.org/10.1007/BF02551274' },
    { text: 'J. M. Cohen, S. Kaur, Y. Li, J. Z. Kolter &amp; A. Talwalkar, “Gradient Descent on Neural Networks Typically Occurs at the Edge of Stability”, ICLR 2021', url: 'https://arxiv.org/abs/2103.00065' },
    { text: 'Nobel Committee for Physics, Scientific Background to the Nobel Prize in Physics 2024', url: 'https://www.nobelprize.org/uploads/2024/11/advanced-physicsprize2024-3.pdf' },
    { text: 'ECMWF, “ECMWF’s AI forecasts become operational” (25 February 2025)', url: 'https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational' },
    { text: 'Google DeepMind, “Advanced version of Gemini with Deep Think officially achieves gold-medal standard at the International Mathematical Olympiad” (21 July 2025)', url: 'https://deepmind.google/blog/advanced-version-of-gemini-with-deep-think-officially-achieves-gold-medal-standard-at-the-international-mathematical-olympiad/' },
  ],

  alt: 'A square plane of gold and blue training points, shaded by a neural network’s confidence, with its decision boundary drawn as an ivory curve; beside it the network’s wiring, what each hidden unit sees, and live charts of the loss and of the loss’s sharpest curvature.',

  init(stage, core) {
    return mountLearner(stage, core);
  },
};

export const _test = {
  mulberry32, twoSpirals, spiralsScaled, xorData, andData, separable,
  perceptronVisit, perceptronEpoch, perceptronTrain, novikoffBound,
  mlpLayout, mlpInit, makeActs, mlpForward, lossAndGrad, lossOnly, accuracy,
  macCounts, shortcutParamCount, gdStep, quadraticGD, heavyBall,
  hvp, powerStep, randomUnit, sharpness, scanlineWave, harmonicCoeffs, harmonicMags, rms,
  countCrossings, contourSegments, disagreeFraction, selfTest,
  SEP_U, RULER_MARKS,
};

/* ---------- mounting ---------- */

function mountLearner(stage, core) {
  const { canvas: cv, audio, ui } = core;
  const P = cv.palette;
  const C = {
    bg: P.bg, panel: P.panel, line: P.line, ink: P.ink, inkDim: P.inkDim, inkFaint: P.inkFaint,
    gold: P.gold, goldBright: P.goldBright, goldDim: P.goldDim, azure: P.azure, azureDim: P.azureDim,
    crimson: P.crimson, crimsonBright: P.crimsonBright, verdant: P.verdant,
    verd: P.verdigris, verdDim: mixHex(P.verdigris, P.bg, 0.4),
  };
  const SERIF = (getComputedStyle(document.body).fontFamily || 'Georgia, serif');
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const bus = audio.createBus('learner');
  const cleanups = [];
  const listen = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); cleanups.push(() => el.removeEventListener(ev, fn, opts)); };
  const el = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const RGB = { bg: hexRgb(C.bg), gold: hexRgb(C.gold), azure: hexRgb(C.azure) };

  /* ---------- scoped style ---------- */
  const style = el('style', null, stage);
  style.textContent = `
    #ex-learner .lrn-tabs { display:flex; flex-wrap:wrap; gap:.45rem .5rem; margin:0 0 1rem; }
    #ex-learner .lrn-tab { font-family:var(--serif, Georgia, serif); font-size:.92rem; color:${C.inkDim};
      background:transparent; border:1px solid ${C.line}; border-radius:999px; padding:.3rem .95rem .34rem;
      cursor:pointer; transition:color .18s, border-color .18s, background-color .18s; line-height:1.3; }
    #ex-learner .lrn-tab .nm { font-variant:small-caps; letter-spacing:.07em; }
    #ex-learner .lrn-tab .yr { font-variant-numeric:oldstyle-nums; color:${C.inkFaint}; margin-left:.5em; font-size:.84rem; }
    #ex-learner .lrn-tab:hover { color:${C.ink}; border-color:${C.verdDim}; }
    #ex-learner .lrn-tab:focus-visible { outline:2px solid ${C.verd}; outline-offset:2px; }
    #ex-learner .lrn-tab[aria-selected="true"] { color:${C.ink}; border-color:${C.verd}; background:${rgba(C.verd, 0.1)}; }
    #ex-learner .lrn-tab[aria-selected="true"] .yr { color:${C.verd}; }
    #ex-learner .lrn-main { display:grid; grid-template-columns:minmax(0,1fr); gap:14px; }
    #ex-learner .lrn-main.two { grid-template-columns:minmax(0,59fr) minmax(0,41fr); }
    #ex-learner .lrn-main canvas { display:block; }
    #ex-learner canvas.lrn-plane { cursor:crosshair; touch-action:pan-y; }
    #ex-learner canvas.lrn-plane.dragging { touch-action:none; }
    #ex-learner canvas.lrn-plane:focus { outline:none; }
    #ex-learner canvas.lrn-plane:focus-visible { outline:2px solid ${C.verd}; outline-offset:2px; }
    #ex-learner .lrn-sub { display:none; margin-top:1.3rem; }
    #ex-learner .lrn-sub.show { display:block; }
    #ex-learner .lrn-h { font-variant:small-caps; letter-spacing:.14em; font-size:.82rem; color:${C.verd}; margin:0 0 .5rem .1rem; }
    #ex-learner .lrn-h i { font-variant:normal; letter-spacing:0; color:${C.inkDim}; margin-left:.4em; }
    #ex-learner .readout { white-space:pre-wrap; overflow-wrap:break-word; min-height:1.5em; line-height:1.6; margin-top:.2rem; }
    #ex-learner .nw { white-space:nowrap; }
    #ex-learner .exhibit-prose code { white-space:nowrap; }
    #ex-learner .readout b { color:${C.ink}; font-weight:600; }
    #ex-learner .readout .ok { color:${C.verdant}; }
    #ex-learner .readout .bad { color:${C.crimsonBright}; }
    #ex-learner .readout .edge { color:${C.verd}; }
    #ex-learner .readout .gold { color:${C.goldBright}; }
    #ex-learner .mathline { white-space:normal; line-height:1.75; font-size:.98rem; margin:1rem 0 .4rem; }
    #ex-learner .mathline .x { color:${C.crimsonBright}; }
    #ex-learner .mathline .d { color:${C.inkDim}; font-size:.86em; }
    #ex-learner .mathline .v { color:${C.verd}; }
    #ex-learner .controls { margin-top:.9rem; }
    #ex-learner .controls .btn[aria-pressed="true"] { background:${rgba(C.verd, 0.13)}; border-color:${C.verd}; color:${C.ink}; }
    #ex-learner .lrn-hide { display:none !important; }
    @media (max-width:560px) {
      #ex-learner .lrn-tabs { display:grid; grid-template-columns:1fr 1fr; }
      #ex-learner .lrn-tab { font-size:.8rem; padding:.3rem .4rem .34rem; white-space:nowrap; }
      #ex-learner .lrn-tab .yr { margin-left:.35em; font-size:.76rem; }
      #ex-learner .controls { gap:.7rem 1rem; }
    }
    @media (max-width:400px) { #ex-learner .lrn-tab .yr { display:none; } }
  `;

  /* ---------- DOM ---------- */
  const quest = ui.questBanner(stage, '');
  const tabsEl = el('div', 'lrn-tabs', stage);
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.setAttribute('aria-label', 'chapters of the descent');
  const tabs = CHAPTERS.map((c) => {
    const b = el('button', 'lrn-tab', tabsEl, `<span class="nm">${c.name}</span><span class="yr">${c.year}</span>`);
    b.type = 'button';
    b.id = 'ex-learner-tab-' + c.n;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'ex-learner-panel');
    listen(b, 'click', () => setChapter(c.n));
    listen(b, 'keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const k = (c.n - 1 + (e.key === 'ArrowRight' ? 1 : 3)) % 4;
      setChapter(k + 1);
      tabs[k].focus();
    });
    return b;
  });

  const mainEl = el('div', 'lrn-main', stage);
  mainEl.id = 'ex-learner-panel';
  mainEl.setAttribute('role', 'tabpanel');
  const colPlane = el('div', 'lrn-col', mainEl);
  const colSide = el('div', 'lrn-col', mainEl);
  function hiCanvas(parent, cls) {
    const c = el('canvas', cls, parent);
    const ctx = c.getContext('2d');
    const h = {
      canvas: c, ctx, width: 0, height: 0, dpr: 1,
      size(w, hh) {
        w = Math.max(40, Math.floor(w)); hh = Math.max(40, Math.floor(hh));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (w === h.width && hh === h.height && dpr === h.dpr) return false;
        h.width = w; h.height = hh; h.dpr = dpr;
        c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
        c.style.width = w + 'px'; c.style.height = hh + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
      },
    };
    return h;
  }
  const plane = hiCanvas(colPlane, 'lrn-plane');
  const side = hiCanvas(colSide, 'lrn-side');
  plane.canvas.setAttribute('role', 'img');
  side.canvas.setAttribute('role', 'img');
  side.canvas.setAttribute('aria-label', 'The model’s wiring, what its hidden units see, and charts of its loss and curvature.');

  const rowA = ui.controlRow(stage);
  const btnRun = ui.button(rowA, '▶ learn', () => onRun(), { primary: true });
  const btnStep = ui.button(rowA, 'one step', () => onStep());
  const btnReset = ui.button(rowA, 'reset', () => onReset());
  const btnReseed = ui.button(rowA, 'new points', () => onReseed());

  const rowB = ui.controlRow(stage);
  const dataSel = ui.select(rowB, {
    label: 'the points',
    options: [{ value: 'separable', label: 'forty that a line can split' }, { value: 'xor', label: 'XOR: opposite corners alike' }],
    value: 'separable',
    onChange: (v) => { setPerceptronData(v); },
  });
  const widthStep = ui.stepper(rowB, {
    label: 'hidden units', min: 1, max: 4, value: 1,
    onChange: (v) => { width = v; buildNet(); },
  });
  const etaSel = ui.select(rowB, {
    label: 'step size η',
    options: [{ value: '0.25', label: '0.25' }, { value: '0.5', label: '0.5' }, { value: '1', label: '1' }],
    value: '0.5',
    onChange: (v) => { eta = parseFloat(v); edgeTouched = false; if (net) { net.lamH.clear(); net.lossH.clear(); } refreshAll(); },
  });
  function toggleBtn(parent, label, fn, small) {
    const b = ui.button(parent, label, () => fn(b.getAttribute('aria-pressed') !== 'true'), { small: !!small });
    b.setAttribute('aria-pressed', 'false');
    return b;
  }
  const setPressed = (b, v) => { b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.classList.toggle('active', !!v); };
  const momBtn = toggleBtn(rowB, 'momentum β = 0.9', (v) => { beta = v ? 0.9 : 0; edgeTouched = false; setPressed(momBtn, v); if (net) { net.vel.fill(0); } refreshAll(); });
  const listenBtn = toggleBtn(rowB, '♬ listen', (v) => setListen(v));
  const turnBtn = ui.button(rowB, 'turn the scan line', () => turnScan(), { small: true });
  const lossBtn = toggleBtn(rowB, '♬ hear the loss', (v) => setHearLoss(v));
  const secondBtn = ui.button(rowB, 'second opinion', () => startSecond());
  const critBtn = toggleBtn(rowB, '40-20-40 criterion', (v) => { crit4 = v; setPressed(critBtn, v); if (net) net.acc4 = accuracy(net.L, net.theta, pts, '40-20-40'); refreshAll(); }, true);

  // Not a live region: it rewrites itself several times a second while training.
  // The quest banner (role="status") announces each milestone instead.
  const readout = ui.readout(stage, '');
  const mathEl = ui.mathline(stage, '');

  // the bowl (chapter iv)
  const bowlWrap = el('div', 'lrn-sub', stage);
  el('div', 'lrn-h', bowlWrap, 'the bowl <i>L = ½ λ w², where 2/λ decides everything</i>');
  const bowl = hiCanvas(bowlWrap, 'lrn-bowl');
  const bowlRow = ui.controlRow(bowlWrap);
  let bowlK = 1.9;
  const bowlSlider = ui.slider(bowlRow, {
    label: 'η × λ (step times curvature)', min: 0.05, max: 2.4, step: 0.01, value: bowlK,
    format: (v) => (Math.abs(v - 2) < 0.015 ? '2 exactly' : v.toFixed(2)),
    onInput: (v) => { bowlK = Math.abs(v - 2) < 0.015 ? 2 : v; restartBowl(); },
  });
  const bowlPresets = [['1.5', 1.5], ['2', 2], ['2.1', 2.1]].map(([lab, v]) =>
    ui.button(bowlRow, lab, () => { bowlK = v; bowlSlider.set(v); restartBowl(); }, { small: true }));
  void bowlPresets;

  // the ruler
  const rulerWrap = el('div', 'lrn-sub show', stage);
  el('div', 'lrn-h', rulerWrap, 'the ruler <i>how many weights were learned, on a logarithmic scale</i>');
  const ruler = hiCanvas(rulerWrap, 'lrn-ruler');

  ui.caption(stage,
    'Every picture here is computed as you watch: the field and its contours on a grid of forward passes, ' +
    'gradients by reverse mode, the curvature by power iteration on Hessian–vector products, and the scan line’s ' +
    'sound from the Fourier coefficients of the network’s own output. The two spirals are the CMU benchmark’s, ' +
    'after Alexis Wieland; the Lang–Witbrock figures are there for scale, not as a race, since the network, optimizer ' +
    'and success criterion all differ. Interactive network explorers have a lineage, notably TensorFlow Playground by ' +
    'Daniel Smilkov and Shan Carter; this one adds the history, the perceptron’s loop, the cost of a gradient, the ' +
    'sound and the curvature meter.');

  ui.legendPanel(stage, `
    <p>That Minsky and Papert proved neural networks cannot compute XOR, and so killed the field. Their analysis
    concerns perceptrons with a single layer of adjustable weights. Two-layer networks compute XOR — the one on
    this stage does, with two hidden units — and what was missing in 1969 was a practical way to train hidden
    layers. The book was influential, and the Nobel committee’s background for 2024 links it to “a hiatus
    funding-wise”, but the “official history” of the controversy is itself a subject of study (Mikel Olazaran,
    <em>Social Studies of Science</em>, 1996).</p>
    <p>That Hinton invented backpropagation in 1986. Reverse-mode differentiation was found several times,
    from the 1960s on: Andreas Griewank’s history names Ostrowski, Linnainmaa, Speelpenning and Werbos, among
    others, and the Nobel committee writes that Rumelhart, Hinton and Williams “reinvented” it. What their paper
    showed was what hidden units learn.</p>
    <p>That the perceptron was a thinking machine. The 1958 press was excited — the <em>New York Times</em>
    headline read “New Navy Device Learns By Doing” — but the feat on show was telling punch cards marked on the
    left from cards marked on the right.</p>`);

  const spec = ui.speculationPanel(stage, `
    <p>Press <em>second opinion</em> after the spirals are solved, and a second network, differing only in its
    random start, is trained to the same perfect score. Both put all 194 points on the right side, and yet they
    disagree over a sizeable share of the disk the data occupy, the crimson hatching, measured live. The data fix
    194 answers; the rest is each network’s own invention. Whether the regularities such networks find are
    discovered in the world or invented by the fitting is a small copy of the question the
    <a href="#ex-coda">last page</a> asks of mathematics itself.</p>
    <p>Nor does anyone yet have a full account of why descent works as well as it does on landscapes this rugged,
    or why it thrives at the edge of stability. The machines have already moved past olympiad problems with
    known solutions to a conjecture that had stood open since 1939; how far they will go is a forecast, not a
    fact.</p>`);
  void spec;

  /* ---------- state ---------- */
  let chapter = 1;
  let mode = 'perceptron';             // 'perceptron' | 'network'
  let dataKey = 'separable';           // 'separable' | 'xor' | 'spirals'
  let sepSeed = 1;
  let pts = separable(sepSeed);
  let E = 1.25;                        // half-width of the plane, in data units
  let bound = novikoffBound(pts, SEP_U);
  let eta = 0.5, beta = 0.9, width = 1, xorSeed = 1, spSeed = 1;
  let net = null, net2 = null, secondCount = 0;
  let training = false, training2 = false;
  let crit4 = false, listening = false, hearingLoss = false;
  let stepBudget = 10;
  let scanA = 0;                       // scan line angle (radians)
  let hover = null, drag = null;
  let fieldA = null, fieldB = null, segsA = null, segsB = null, hatch = null;
  let spectrum = null;
  let planeDirty = true, sideDirty = true, bowlDirty = true, rulerDirty = true, galleryDirty = true;
  let animUntil = 0, frameNo = 0;
  let edgeTouched = false, textDue = true, lastTextAt = 0, lastQuest = '';
  let lastWaveAt = -1, waveDirty = true;

  const pc = {
    w: [0, 0, 0], idx: 0, pass: 0, total: 0, passMistakes: 0, running: false, nextAt: 0,
    starts: new Map(), ghosts: [], lastHit: null, cursor: -1, verdict: null, passLog: [], trace: [[0, 0, 0]], cycle: null, lastTrace: null,
  };

  /* ---------- clocks & sound ---------- */
  // One monotonic clock for everything drawn. (The shared AudioContext is
  // created suspended at init and its currentTime sits still until the first
  // gesture resumes it, so mixing the two clocks would make ages jump.) Every
  // sound here is scheduled at the audio clock's own "now", in the same frame
  // as the picture it belongs to.
  function clock() { return performance.now() / 1000; }
  function soundReady() {
    const c = audio.getContext();
    return c && c.state === 'running' && audio.isEnabled && audio.isEnabled() ? c : null;
  }
  // One perceptron correction = one short wooden tick, panned by the point's x.
  function tick(p) {
    const c = soundReady();
    if (!c) return;
    const t = c.currentTime + 0.005;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(p.label ? 1174.66 : 880, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.002);
    g.gain.setTargetAtTime(1e-4, t + 0.004, 0.022);
    osc.connect(g);
    let out = g;
    if (c.createStereoPanner) {
      const pn = c.createStereoPanner();
      pn.pan.value = clamp(p.x / E, -0.9, 0.9);
      g.connect(pn); out = pn;
    }
    out.connect(bus.input);
    osc.start(t); osc.stop(t + 0.2);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); out.disconnect(); } catch { /* gone */ } };
  }
  function chime(freqs) {
    const c = soundReady();
    if (!c) return;
    freqs.forEach((f, i) => audio.playTone(bus, { freq: f, dur: 0.7, level: 0.22, when: c.currentTime + 0.02 + i * 0.11, release: 0.4 }));
  }

  // The scan-line voice: two oscillators at 55 Hz whose PeriodicWaves are the
  // network's own Fourier coefficients (unnormalized, so loudness is the wave's
  // own amplitude); new waves crossfade in over ~60 ms.
  let scanVoice = null;
  const SCAN_LEVEL = 0.24;
  function scanVoiceOn() {
    const c = audio.ensureAudio();
    if (scanVoice) return;
    const mk = () => {
      const o = c.createOscillator(); o.frequency.value = 55;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(bus.input); o.start();
      return { o, g };
    };
    scanVoice = { A: mk(), B: mk(), cur: 0 };
    waveDirty = true; lastWaveAt = -1;
  }
  function scanVoiceOff() {
    if (!scanVoice) return;
    const c = bus.context;
    for (const v of [scanVoice.A, scanVoice.B]) {
      audio.rampTo(v.g.gain, 0, 0.03);
      try { v.o.stop(c.currentTime + 0.25); } catch { /* stopped */ }
      const vv = v;
      v.o.onended = () => { try { vv.o.disconnect(); vv.g.disconnect(); } catch { /* gone */ } };
    }
    scanVoice = null;
  }
  function pushWave(coef) {
    if (!scanVoice) return;
    const c = bus.context;
    let pw;
    try { pw = c.createPeriodicWave(coef.a, coef.b, { disableNormalization: true }); } catch { return; }
    const nextIsB = scanVoice.cur === 0;
    const inV = nextIsB ? scanVoice.B : scanVoice.A;
    const outV = nextIsB ? scanVoice.A : scanVoice.B;
    inV.o.setPeriodicWave(pw);
    audio.rampTo(inV.g.gain, SCAN_LEVEL, 0.02);
    audio.rampTo(outV.g.gain, 0, 0.02);
    scanVoice.cur = nextIsB ? 1 : 0;
  }
  // The loss as pitch: 440·L/ln 2 Hz, so chance-level loss is A440 and each halving drops an octave.
  let lossVoice = null;
  const lossFreq = (L) => 440 * L / Math.LN2;
  function lossVoiceOn() {
    audio.ensureAudio();
    if (lossVoice) return;
    lossVoice = audio.voice(bus, { type: 'sine', freq: clamp(lossFreq(net ? net.loss : Math.LN2), 55, 1760), level: 0.1, attack: 0.08, release: 0.2 });
    lossVoice.on();
  }
  function lossVoiceOff() { if (lossVoice) { lossVoice.dispose(); lossVoice = null; } }

  function setListen(v) {
    listening = !!v && mode === 'network';
    setPressed(listenBtn, listening);
    if (listening) { scanVoiceOn(); refreshWave(true); } else { scanVoiceOff(); spectrum = null; }
    plane.canvas.classList.toggle('dragging', false);
    refreshAll();
  }
  function setHearLoss(v) {
    hearingLoss = !!v && mode === 'network';
    setPressed(lossBtn, hearingLoss);
    if (hearingLoss) lossVoiceOn(); else lossVoiceOff();
    refreshAll();
  }

  /* ---------- layout ---------- */
  let lastW = -1;
  function layout(force) {
    const W = mainEl.clientWidth;
    if (!W || (W === lastW && !force)) return;
    lastW = W;
    const two = W >= 700;
    mainEl.classList.toggle('two', two);
    const pw = colPlane.clientWidth || W, sw = colSide.clientWidth || W;
    const ps = Math.min(pw, two ? 720 : pw);
    plane.size(ps, ps);
    side.size(sw, two ? ps : sideHeight(sw));
    bowl.size(bowlWrap.clientWidth || W, W < 520 ? 250 : 200);
    ruler.size(rulerWrap.clientWidth || W, W < 520 ? 124 : 84);
    hatch = hatch && { ...hatch, img: null };
    planeDirty = sideDirty = bowlDirty = rulerDirty = true;
  }
  function sideHeight(w) {
    if (mode === 'perceptron') return Math.round(Math.max(520, Math.min(600, 200 + w)));
    const units = net ? net.sizes[net.sizes.length - 2] : 16;
    const cols = units > 4 ? 8 : 4;
    const th = (w - 28 - (cols - 1) * 4) / cols;
    const rows = Math.ceil(units / cols);
    const galH = rows * th + (rows - 1) * 4;
    return Math.round((168 + galH + 2 * 92) / 0.7);
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(mainEl);

  /* ---------- models ---------- */
  function makeNet(sizes, seed) {
    const { L, theta } = mlpInit(sizes, seed);
    const n = {
      sizes, L, theta, seed, grad: new Float64Array(L.nParams), vel: new Float64Array(L.nParams),
      step: 0, loss: lossOnly(L, theta, pts), acc: accuracy(L, theta, pts), acc4: accuracy(L, theta, pts, '40-20-40'),
      lossH: history(), lamH: history(), v: randomUnit(L.nParams, 7), lam: NaN, version: 1, solvedAt: null, best: 0,
      gradFresh: false, ups: new Uint8Array(200),
    };
    for (let i = 0; i < 16; i++) n.lam = powerStep(L, theta, pts, n.v);
    lossAndGrad(L, theta, pts, n.grad);
    n.lossH.push(0, n.loss); n.lamH.push(0, n.lam);
    n.best = n.acc;
    return n;
  }
  function buildNet() {
    stopTraining();
    stopSecond(true);
    secondCount = 0;
    if (dataKey === 'xor') net = makeNet([2, width, 1], xorSeed);
    else net = makeNet([2, 16, 16, 1], spSeed);
    edgeTouched = false;
    fieldA = null; segsA = null; galleryDirty = true;
    waveDirty = true;
    refreshAll();
    layout(true);
  }
  function threshold() { return beta > 0 ? (2 + 2 * beta) / eta : 2 / eta; }

  /* ---------- the perceptron runner (timed on the audio clock when it runs) ---------- */
  function pcReset() {
    pc.w = [0, 0, 0]; pc.idx = 0; pc.pass = 0; pc.total = 0; pc.passMistakes = 0; pc.running = false;
    pc.starts = new Map(); pc.ghosts = []; pc.lastHit = null; pc.cursor = -1; pc.verdict = null;
    pc.passLog = []; pc.trace = [[0, 0, 0]]; pc.cycle = null; pc.lastTrace = null;
  }
  function pcVisitOne(now) {
    if (pc.idx === 0) {
      const key = pc.w.join(',');
      if (!pc.starts.has(key)) pc.starts.set(key, pc.pass);
      pc.passMistakes = 0;
      pc.trace = [pc.w.slice()];
    }
    const p = pts[pc.idx];
    const before = pc.w.slice();
    const hit = perceptronVisit(pc.w, p);
    pc.cursor = pc.idx;
    if (hit) {
      pc.total++; pc.passMistakes++;
      pc.ghosts.push({ w: before, t: now });
      if (pc.ghosts.length > 40) pc.ghosts.shift();
      pc.lastHit = { i: pc.idx, t: now };
      pc.trace.push(pc.w.slice());
      tick(p);
    }
    pc.idx++;
    if (pc.idx >= pts.length) endPass();
    animUntil = Math.max(animUntil, now + 2.2);
    planeDirty = sideDirty = true;
    return hit;
  }
  function endPass() {
    pc.pass++; pc.idx = 0;
    pc.passLog.push(pc.passMistakes);
    pc.lastTrace = pc.trace.slice();
    if (pc.passMistakes === 0) {
      pc.verdict = 'converged'; pc.running = false; pc.cursor = -1;
      chime([659.25, 987.77]);
    } else {
      const key = pc.w.join(',');
      if (pc.starts.has(key) && !pc.cycle) {
        pc.cycle = { from: pc.starts.get(key), at: pc.pass, w: pc.w.slice() };
        pc.verdict = 'cycle';
      }
      if (pc.cycle && pc.pass >= pc.cycle.at + 7) { pc.running = false; pc.verdict = 'cycle-stopped'; pc.cursor = -1; }
      if (pc.pass >= 200) { pc.running = false; pc.cursor = -1; }
    }
    refreshAll();
  }
  function pcAdvance(now) {
    if (Math.abs(now - pc.nextAt) > 2) pc.nextAt = now;
    let guard = 0;
    while (pc.running && now >= pc.nextAt && guard++ < 50) {
      const at = pc.nextAt;
      const hit = pcVisitOne(now);
      pc.nextAt = at + (hit ? 0.24 : 0.045);
    }
  }

  /* ---------- the network runner ---------- */
  function trainNet(n, k) {
    const t0 = performance.now();
    for (let s = 0; s < k; s++) {
      const l = gdStep(n.L, n.theta, pts, eta, n.grad, n.vel, beta);
      n.lossH.push(n.step, l);
      n.ups[n.step % 200] = l > n.loss ? 1 : 0;
      n.loss = l; n.step++;
      if (!Number.isFinite(l)) break;
    }
    n.version++; n.gradFresh = true;
    n.acc = accuracy(n.L, n.theta, pts);
    if (crit4) n.acc4 = accuracy(n.L, n.theta, pts, '40-20-40');
    n.best = Math.max(n.best, n.acc);
    if (n.acc === 1 && n.solvedAt == null) n.solvedAt = n.step;
    const per = (performance.now() - t0) / Math.max(1, k);
    if (dataKey === 'spirals') stepBudget = clamp(Math.floor(6.5 / Math.max(per, 0.05)), 2, 12);
  }
  function stepsFor(n) {
    if (dataKey === 'xor') return n.step < 90 ? 1 : 12;
    return stepBudget;
  }
  // Seeds 1–10 of the spirals first reach 194/194 between steps 2,130 and 7,732
  // under node; seed 5 is the slow one, and the last-bit differences between
  // engines' Math.tanh/exp push it to 10,698 in Chrome. Chapter iii allows 16,000.
  const SPIRAL_CAP = 16000;
  function maxSteps() { return dataKey === 'xor' ? 1500 : chapter === 4 ? 9000 : SPIRAL_CAP; }
  function trainFrame() {
    const n = net;
    if (dataKey === 'xor' && n.step < 90 && frameNo % 3) { sideDirty = true; return; }
    trainNet(n, stepsFor(n));
    n.lam = powerStep(n.L, n.theta, pts, n.v);
    n.lamH.push(n.step, n.lam);
    if (chapter === 4 && !edgeTouched && n.lam >= 0.95 * threshold()) { edgeTouched = true; chime([783.99, 1174.66]); }
    if (hearingLoss && lossVoice) lossVoice.setFreq(clamp(lossFreq(n.loss), 55, 1760), 0.05);
    if (listening) waveDirty = true;
    let stop = false;
    if (!Number.isFinite(n.loss)) stop = true;
    if (n.step >= maxSteps()) stop = true;
    if (dataKey === 'xor' && n.acc === 1 && n.loss < 0.02) stop = true;
    if (n.solvedAt != null && !n.chimed) {
      n.chimed = true;
      if (dataKey === 'spirals') chime([523.25, 659.25, 783.99]);
      else if (dataKey === 'xor') chime([659.25, 987.77]);
    }
    if (stop) stopTraining();
    sideDirty = true;
    textDue = true;
  }
  function stopTraining() {
    if (!training) return;
    training = false;
    btnRun.textContent = mode === 'network' ? '▶ train' : '▶ learn';
    planeDirty = sideDirty = true;
    waveDirty = true;
    refreshAll();
  }

  function startSecond() {
    if (!net || dataKey !== 'spirals' || net.acc < 1 || training) return;
    audio.ensureAudio();
    secondCount++;
    net2 = makeNet(net.sizes, net.seed + secondCount);
    training2 = true; fieldB = null; segsB = null; hatch = null;
    secondBtn.disabled = true;
    refreshAll();
  }
  function stopSecond(discard) {
    training2 = false;
    if (discard) { net2 = null; fieldB = null; segsB = null; hatch = null; }
  }
  function secondFrame() {
    const n = net2;
    trainNet(n, stepBudget);
    const done = (n.solvedAt != null && n.step >= n.solvedAt + 400) || n.step >= SPIRAL_CAP;
    if (done) {
      training2 = false;
      fieldB = computeField(n, 112, fieldB); segsB = contourSegments(fieldB.q, fieldB.res, fieldB.res, 0.5);
      if (!fieldA || fieldA.res !== 112 || fieldA.version !== net.version) {
        fieldA = computeField(net, 112, fieldA); segsA = contourSets(fieldA); paintField(fieldA); galleryDirty = true;
      }
      hatch = { frac: disagreeFraction(fieldA.q, fieldB.q, 112, E, 1), img: null, bothPerfect: net.acc === 1 && n.acc === 1 };
      chime([440, 554.37]);
    } else if ((frameNo & 1) === 0) {
      fieldB = computeField(n, 48, fieldB); segsB = contourSegments(fieldB.q, fieldB.res, fieldB.res, 0.5);
    }
    planeDirty = true;
    textDue = true;
    if (!training2) refreshAll();
  }

  /* ---------- fields ---------- */
  function computeField(n, res, prev) {
    const L = n.L, th = n.theta;
    const last = L.sizes.length - 2;
    const nh = L.sizes[last];
    const f = prev && prev.res === res && prev.nh === nh ? prev
      : { res, nh, q: new Float32Array(res * res), hid: new Float32Array(res * res * nh) };
    const acts = makeActs(L);
    const d = (2 * E) / res;
    const rr = res * res;
    for (let j = 0; j < res; j++) {
      const y = E - (j + 0.5) * d;
      for (let i = 0; i < res; i++) {
        const x = -E + (i + 0.5) * d;
        const k = j * res + i;
        f.q[k] = mlpForward(L, th, x, y, acts);
        const h = acts[last];
        for (let u = 0; u < nh; u++) f.hid[u * rr + k] = h[u];
      }
    }
    f.version = n.version; f.E = E;
    return f;
  }
  function contourSets(f) {
    return {
      mid: contourSegments(f.q, f.res, f.res, 0.5),
      hi: contourSegments(f.q, f.res, f.res, 0.85),
      lo: contourSegments(f.q, f.res, f.res, 0.15),
    };
  }
  const fieldCan = document.createElement('canvas');
  const fieldCtx = fieldCan.getContext('2d');
  function paintField(f) {
    if (fieldCan.width !== f.res) { fieldCan.width = f.res; fieldCan.height = f.res; }
    const img = fieldCtx.createImageData(f.res, f.res);
    const d = img.data, bg = RGB.bg;
    for (let k = 0; k < f.q.length; k++) {
      const v = 2 * f.q[k] - 1;
      const m = Math.pow(Math.abs(v), 0.9) * 0.4;
      const c = v >= 0 ? RGB.gold : RGB.azure;
      d[4 * k] = bg[0] + (c[0] - bg[0]) * m;
      d[4 * k + 1] = bg[1] + (c[1] - bg[1]) * m;
      d[4 * k + 2] = bg[2] + (c[2] - bg[2]) * m;
      d[4 * k + 3] = 255;
    }
    fieldCtx.putImageData(img, 0, 0);
  }
  const galCan = document.createElement('canvas');
  const galCtx = galCan.getContext('2d');
  function paintGallery(f) {
    const n = f.res, nh = f.nh, rr = n * n;
    if (galCan.width !== n * nh || galCan.height !== n) { galCan.width = n * nh; galCan.height = n; }
    const img = galCtx.createImageData(n * nh, n);
    const d = img.data, bg = RGB.bg;
    for (let u = 0; u < nh; u++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const a = f.hid[u * rr + j * n + i];
          const m = Math.min(1, Math.abs(a)) * 0.7;
          const c = a >= 0 ? RGB.gold : RGB.azure;
          const o = 4 * (j * n * nh + u * n + i);
          d[o] = bg[0] + (c[0] - bg[0]) * m; d[o + 1] = bg[1] + (c[1] - bg[1]) * m; d[o + 2] = bg[2] + (c[2] - bg[2]) * m; d[o + 3] = 255;
        }
      }
    }
    galCtx.putImageData(img, 0, 0);
  }
  function updateFields() {
    if (mode !== 'network' || !net) return;
    const big = dataKey === 'spirals';
    const want = big && (training || training2) ? 64 : 112;
    if (fieldA && fieldA.version === net.version && fieldA.res === want && fieldA.E === E) return;
    if (training && big && (frameNo & 1)) return;
    fieldA = computeField(net, want, fieldA && fieldA.res === want ? fieldA : null);
    segsA = contourSets(fieldA);
    paintField(fieldA);
    galleryDirty = true;
    planeDirty = sideDirty = true;
  }

  /* ---------- the scan line ---------- */
  function scanEnds() {
    const r = dataKey === 'xor' ? 1.45 : 1.0;
    return [-r * Math.cos(scanA), -r * Math.sin(scanA), r * Math.cos(scanA), r * Math.sin(scanA)];
  }
  let scanCustom = null;           // [x0, y0, x1, y1] after a drag
  const scanPts = () => scanCustom || scanEnds();
  function turnScan() {
    scanCustom = null;
    scanA = (scanA + Math.PI / 8) % Math.PI;
    waveDirty = true; lastWaveAt = -1;
    refreshWave(true);
    planeDirty = true;
  }
  function refreshWave(force) {
    if (!listening || !net) return;
    const now = performance.now() / 1000;
    if (!force && (!waveDirty || now - lastWaveAt < 0.2)) return;
    lastWaveAt = now; waveDirty = false;
    const [x0, y0, x1, y1] = scanPts();
    const w = scanlineWave(net.L, net.theta, x0, y0, x1, y1, 512);
    const coef = harmonicCoeffs(w, 64);
    let kmax = 1;
    for (let k = 2; k <= 64; k++) if (coef.mags[k] > coef.mags[kmax]) kmax = k;
    // where the decision flips along the segment
    const acts = makeActs(net.L);
    const flips = [];
    let prev = null;
    const N = 800;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const cur = mlpForward(net.L, net.theta, x0 + s * (x1 - x0), y0 + s * (y1 - y0), acts) > 0.5;
      if (prev !== null && cur !== prev) flips.push(s - 0.5 / N);
      prev = cur;
    }
    spectrum = { mags: coef.mags, kmax, rms: rms(w), flips };
    pushWave(coef);
    planeDirty = sideDirty = true;
    textDue = true;
  }

  /* ---------- coordinates ---------- */
  const sc = () => plane.width / (2 * E);
  const X = (x) => plane.width / 2 + x * sc();
  const Y = (y) => plane.height / 2 - y * sc();
  const toWorld = (sx, sy) => [(sx - plane.width / 2) / sc(), -(sy - plane.height / 2) / sc()];

  /* ---------- glow sprites ---------- */
  const glowGold = cv.glowSprite(C.gold, 32);
  const glowAzure = cv.glowSprite(C.azure, 32);
  const glowCrimson = cv.glowSprite(C.crimson, 32);
  const glowVerd = cv.glowSprite(C.verd, 32);

  /* ---------- text helpers ---------- */
  const hasCaps = 'fontVariantCaps' in CanvasRenderingContext2D.prototype;
  const hasSpacing = 'letterSpacing' in CanvasRenderingContext2D.prototype;
  function caps(ctx, text, x, y, px, color, align = 'left') {
    ctx.save();
    ctx.font = `${hasCaps ? px + 1 : px - 1}px ${SERIF}`;
    if (hasCaps) ctx.fontVariantCaps = 'all-small-caps';
    if (hasSpacing) ctx.letterSpacing = (px * 0.13).toFixed(1) + 'px';
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(hasCaps ? text : text.toUpperCase(), x, y);
    const w = ctx.measureText(hasCaps ? text : text.toUpperCase()).width;
    ctx.restore();
    return w;
  }
  function txt(ctx, text, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.italic ? 'italic ' : ''}${o.px || 11}px ${o.mono ? MONO : SERIF}`;
    ctx.fillStyle = o.color || C.inkDim;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillText(text, x, y);
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  }
  function pill(ctx, text, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.px || 11}px ${o.mono === false ? SERIF : MONO}`;
    const w = ctx.measureText(text).width;
    const h = (o.px || 11) + 8;
    let bx = o.align === 'right' ? x - w - 12 : o.align === 'center' ? x - w / 2 - 6 : x;
    bx = clamp(bx, 4, (o.maxX || 1e9) - w - 16);
    ctx.fillStyle = rgba(C.bg, 0.78);
    ctx.strokeStyle = o.border || rgba(C.line, 1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx + 0.5, y - h / 2 + 0.5, w + 12, h, 4); else ctx.rect(bx + 0.5, y - h / 2 + 0.5, w + 12, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.color || C.ink;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, bx + 6, y + 1);
    ctx.restore();
    return w + 12;
  }

  /* ---------- the plane ---------- */
  function drawSegs(ctx, segs, f) {
    const d = (2 * E) / f.res;
    const s = sc();
    const ox = plane.width / 2, oy = plane.height / 2;
    ctx.beginPath();
    for (let k = 0; k < segs.length; k += 4) {
      const x0 = -E + (segs[k] + 0.5) * d, y0 = E - (segs[k + 1] + 0.5) * d;
      const x1 = -E + (segs[k + 2] + 0.5) * d, y1 = E - (segs[k + 3] + 0.5) * d;
      ctx.moveTo(ox + x0 * s, oy - y0 * s);
      ctx.lineTo(ox + x1 * s, oy - y1 * s);
    }
    ctx.stroke();
  }
  function clipHalf(w, sign) {
    const R = [[-E, -E], [E, -E], [E, E], [-E, E]];
    const f = (p) => sign * (w[0] * p[0] + w[1] * p[1] + w[2]);
    const out = [];
    for (let i = 0; i < 4; i++) {
      const a = R[i], b = R[(i + 1) % 4];
      const fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    return out;
  }
  function lineInView(w) {
    // the chord of w·x̃ = 0 across the view square
    const R = [[-E, -E], [E, -E], [E, E], [-E, E]];
    const f = (p) => w[0] * p[0] + w[1] * p[1] + w[2];
    const out = [];
    for (let i = 0; i < 4; i++) {
      const a = R[i], b = R[(i + 1) % 4];
      const fa = f(a), fb = f(b);
      if ((fa > 0) !== (fb > 0) && fa !== fb) { const t = fa / (fa - fb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    return out.length >= 2 ? out.slice(0, 2) : null;
  }
  function fillPoly(ctx, poly) {
    if (poly.length < 3) return;
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.closePath(); ctx.fill();
  }
  function drawBlade(ctx, w, alpha, width, glow) {
    const seg = lineInView(w);
    if (!seg) return null;
    const [a, b] = seg;
    ctx.save();
    ctx.lineCap = 'round';
    if (glow) {
      ctx.strokeStyle = rgba(C.goldBright, 0.14 * alpha); ctx.lineWidth = width + 7;
      ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke();
    }
    ctx.strokeStyle = rgba(glow ? C.goldBright : C.gold, alpha); ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke();
    ctx.restore();
    return seg;
  }
  function drawArrow(ctx, x0, y0, x1, y1, color, wdt) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = wdt; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - 5 * Math.cos(a), y1 - 5 * Math.sin(a)); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 8 * Math.cos(a - 0.38), y1 - 8 * Math.sin(a - 0.38));
    ctx.lineTo(x1 - 8 * Math.cos(a + 0.38), y1 - 8 * Math.sin(a + 0.38));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function wrongNet(p) { return (qAt(net, p.x, p.y) > 0.5) !== (p.label === 1); }
  const qActs = new Map();
  function qAt(n, x, y) {
    let a = qActs.get(n.L);
    if (!a) { a = makeActs(n.L); qActs.set(n.L, a); }
    return mlpForward(n.L, n.theta, x, y, a);
  }

  function drawPlane(now) {
    const ctx = plane.ctx, W = plane.width, H = plane.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (mode === 'network' && fieldA) {
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(fieldCan, 0, 0, W, H);
    } else if (mode === 'perceptron' && (pc.w[0] || pc.w[1] || pc.w[2])) {
      ctx.fillStyle = rgba(C.gold, 0.085); fillPoly(ctx, clipHalf(pc.w, 1));
      ctx.fillStyle = rgba(C.azure, 0.085); fillPoly(ctx, clipHalf(pc.w, -1));
    }

    // graticule: axes and, for the spirals, the unit circle the data fill
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.ink, 0.06);
    ctx.beginPath(); ctx.moveTo(X(-E), Y(0) + 0.5); ctx.lineTo(X(E), Y(0) + 0.5); ctx.moveTo(X(0) + 0.5, Y(-E)); ctx.lineTo(X(0) + 0.5, Y(E)); ctx.stroke();
    if (dataKey === 'spirals') {
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = rgba(C.ink, 0.09);
      ctx.beginPath(); ctx.arc(X(0), Y(0), sc(), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (mode === 'network' && net) {
      // first-layer hairlines: the straight cuts before later layers bend them
      const ly = net.L.layers[0];
      const next = net.L.layers[1];
      const out = new Float64Array(ly.nout);
      let omax = 1e-9;
      for (let j = 0; j < ly.nout; j++) {
        let s = 0;
        for (let k = 0; k < next.nout; k++) { const w = net.theta[next.W + k * next.nin + j]; s += w * w; }
        out[j] = Math.sqrt(s); omax = Math.max(omax, out[j]);
      }
      ctx.lineWidth = 0.8;
      for (let j = 0; j < ly.nout; j++) {
        const w = [net.theta[ly.W + 2 * j], net.theta[ly.W + 2 * j + 1], net.theta[ly.b + j]];
        const seg = lineInView(w);
        if (!seg) continue;
        const a = (dataKey === 'xor' ? 0.5 : 0.2) * (0.25 + 0.75 * out[j] / omax);
        ctx.strokeStyle = rgba(C.ink, a);
        ctx.beginPath(); ctx.moveTo(X(seg[0][0]), Y(seg[0][1])); ctx.lineTo(X(seg[1][0]), Y(seg[1][1])); ctx.stroke();
      }
      // disagreement hatching (second opinion)
      if (hatch && fieldB && fieldA && fieldA.res === fieldB.res) drawHatch(ctx);
      // contours: faint confidence lines, then the decision boundary
      if (segsA && fieldA) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.save();
        if (dataKey === 'spirals') { ctx.beginPath(); ctx.arc(X(0), Y(0), sc() * 1.06, 0, TAU); ctx.clip(); }
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = rgba(C.goldBright, 0.24); drawSegs(ctx, segsA.hi, fieldA);
        ctx.strokeStyle = rgba(C.azure, 0.26); drawSegs(ctx, segsA.lo, fieldA);
        ctx.restore();
        ctx.strokeStyle = rgba(C.ink, 0.14); ctx.lineWidth = 6; drawSegs(ctx, segsA.mid, fieldA);
        ctx.strokeStyle = rgba(C.ink, 0.92); ctx.lineWidth = 1.5; drawSegs(ctx, segsA.mid, fieldA);
      }
      if (segsB && fieldB && net2) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = rgba(C.crimsonBright, 0.85); ctx.lineWidth = 1.2;
        drawSegs(ctx, segsB, fieldB);
        ctx.setLineDash([]);
      }
    }

    if (mode === 'perceptron') {
      // ghosts: real past states, fading
      for (const g of pc.ghosts) {
        const age = Math.max(0, now - g.t);
        const a = 0.42 * Math.exp(-age / 1.4);
        if (a > 0.02) drawBlade(ctx, g.w, a, 1, false);
      }
      const seg = drawBlade(ctx, pc.w, 1, 2, true);
      if (seg) {
        const n2 = pc.w[0] * pc.w[0] + pc.w[1] * pc.w[1];
        let fx = (-pc.w[2] * pc.w[0]) / n2, fy = (-pc.w[2] * pc.w[1]) / n2;
        if (Math.abs(fx) > E * 0.85 || Math.abs(fy) > E * 0.85) { fx = (seg[0][0] + seg[1][0]) / 2; fy = (seg[0][1] + seg[1][1]) / 2; }
        const nn = Math.sqrt(n2);
        const len = 0.24 * E;
        drawArrow(ctx, X(fx), Y(fy), X(fx + (len * pc.w[0]) / nn), Y(fy + (len * pc.w[1]) / nn), C.goldBright, 1.6);
      }
    }

    // the points
    const big = pts.length < 10 ? 8 : pts.length < 60 ? 5 : 3.4;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const x = X(p.x), y = Y(p.y);
      ctx.globalAlpha = 0.6;
      (p.label ? glowGold : glowAzure).draw(ctx, x, y, (big * 3.6) / 32);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const x = X(p.x), y = Y(p.y);
      const wrong = mode === 'perceptron'
        ? (p.label ? 1 : -1) * (pc.w[0] * p.x + pc.w[1] * p.y + pc.w[2]) <= 0
        : net ? wrongNet(p) : false;
      ctx.beginPath(); ctx.arc(x, y, big, 0, TAU);
      ctx.fillStyle = p.label ? C.goldBright : C.azure; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = C.bg; ctx.stroke();
      if (wrong && (mode === 'network' || pc.pass > 0 || pc.idx > 0)) {
        ctx.beginPath(); ctx.arc(x, y, big + 3, 0, TAU);
        ctx.lineWidth = 1.3; ctx.strokeStyle = C.crimsonBright; ctx.stroke();
      }
    }
    if (mode === 'perceptron') {
      if (pc.cursor >= 0 && pc.running) {
        const p = pts[pc.cursor];
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), big + 6.5, 0, TAU);
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.ink, 0.7); ctx.stroke();
      }
      if (pc.lastHit) {
        const age = now - pc.lastHit.t;
        if (age >= 0 && age < 0.7) {
          const p = pts[pc.lastHit.i];
          const r = big + 4 + age * 34;
          ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), r, 0, TAU);
          ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C.crimsonBright, 0.85 * (1 - age / 0.7)); ctx.stroke();
        }
      }
    }

    // the scan line
    if (listening && mode === 'network') {
      const [x0, y0, x1, y1] = scanPts();
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
      ctx.setLineDash([]);
      if (spectrum) {
        for (const s of spectrum.flips) {
          const px = X(x0 + s * (x1 - x0)), py = Y(y0 + s * (y1 - y0));
          glowVerd.draw(ctx, px, py, 0.55);
          ctx.fillStyle = C.verd;
          ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 4, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 4, py); ctx.closePath(); ctx.fill();
        }
      }
      for (const [kx, ky] of [[x0, y0], [x1, y1]]) {
        ctx.beginPath(); ctx.arc(X(kx), Y(ky), 7, 0, TAU);
        ctx.fillStyle = C.bg; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.verd; ctx.stroke();
        ctx.beginPath(); ctx.arc(X(kx), Y(ky), 2.5, 0, TAU); ctx.fillStyle = C.verd; ctx.fill();
      }
      if (spectrum) {
        const lx = X(x0), ly = Y(y0);
        pill(ctx, `${spectrum.flips.length} crossings`, lx + (x1 > x0 ? 12 : -12), ly - 18, { color: C.verd, align: x1 > x0 ? 'left' : 'right', maxX: W, border: rgba(C.verdDim, 1) });
      }
      ctx.restore();
    }

    // hover: a real forward pass at the pointer
    if (hover && mode === 'network' && net && !drag) {
      ctx.beginPath(); ctx.arc(hover.sx, hover.sy, 5, 0, TAU);
      ctx.lineWidth = 1.2; ctx.strokeStyle = C.ink; ctx.stroke();
      const q = hover.q;
      pill(ctx, `q = ${q.toFixed(3)}`, hover.sx + 12, hover.sy - 14, { color: q > 0.5 ? C.goldBright : C.azure, maxX: W });
    }

    // plate frame and labels
    ctx.strokeStyle = rgba(C.ink, 0.12); ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.strokeStyle = rgba(C.gold, 0.5); ctx.lineWidth = 1.2;
    const cL = 12, m = 6;
    for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(cx, cy + dy * cL); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * cL, cy); ctx.stroke();
    }
    const tl = mode === 'perceptron'
      ? (pc.pass === 0 && pc.idx === 0 ? 'w = (0, 0, 0)' : `pass ${pc.pass + (pc.idx > 0 ? 1 : 0)} · w = ${fmtW(pc.w)}`)
      : net ? `step ${fmtInt(net.step)}` : '';
    if (tl) pill(ctx, tl, 12, 22, { px: 11, color: C.inkDim, border: 'rgba(0,0,0,0)' });
    const bl = dataKey === 'spirals' ? 'two spirals · 194 points · after Wieland'
      : dataKey === 'xor' ? 'XOR · four points' : `forty points · seed ${sepSeed}`;
    txt(ctx, bl, 16, H - 14, { italic: true, px: 12, color: C.inkFaint });
    ctx.restore();
    planeDirty = false;
  }

  let hatchCan = null;
  function drawHatch(ctx) {
    const W = plane.width, H = plane.height;
    if (!hatch.img || !hatchCan || hatchCan.width !== Math.round(W * plane.dpr)) {
      const n = fieldA.res;
      const mask = document.createElement('canvas'); mask.width = n; mask.height = n;
      const mc = mask.getContext('2d');
      const img = mc.createImageData(n, n);
      const d = (2 * E) / n;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          const x = -E + (i + 0.5) * d, y = E - (j + 0.5) * d;
          if (x * x + y * y > 1) continue;
          if ((fieldA.q[k] > 0.5) !== (fieldB.q[k] > 0.5)) img.data[4 * k + 3] = 255;
        }
      }
      mc.putImageData(img, 0, 0);
      hatchCan = document.createElement('canvas');
      hatchCan.width = Math.round(W * plane.dpr); hatchCan.height = Math.round(H * plane.dpr);
      const hc = hatchCan.getContext('2d');
      hc.scale(plane.dpr, plane.dpr);
      hc.strokeStyle = rgba(C.crimsonBright, 0.75); hc.lineWidth = 1.1;
      hc.beginPath();
      for (let t = -H; t < W + H; t += 6) { hc.moveTo(t, 0); hc.lineTo(t + H, H); }
      hc.stroke();
      hc.fillStyle = rgba(C.crimson, 0.16); hc.fillRect(0, 0, W, H);
      hc.globalCompositeOperation = 'destination-in';
      hc.imageSmoothingEnabled = true;
      hc.drawImage(mask, 0, 0, W, H);
      hatch.img = true;
    }
    ctx.drawImage(hatchCan, 0, 0, W, H);
  }

  /* ---------- the side panel ---------- */
  function header(ctx, left, right, x, y, w) {
    const lw = caps(ctx, left, x, y, 12, C.verd);
    if (right) {
      ctx.save(); ctx.font = `10.5px ${MONO}`;
      const rw = ctx.measureText(right).width;
      ctx.restore();
      if (lw + rw + 14 <= w) txt(ctx, right, x + w, y, { mono: true, px: 10.5, color: C.inkFaint, align: 'right' });
    }
    ctx.strokeStyle = rgba(C.ink, 0.08); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + 6.5); ctx.lineTo(x + w, y + 6.5); ctx.stroke();
  }
  function drawSide(now) {
    const ctx = side.ctx, W = side.width, H = side.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = rgba(C.ink, 0.1); ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    if (mode === 'perceptron') drawSidePerceptron(ctx, W, H, now);
    else if (net) drawSideNetwork(ctx, W, H, now);
    ctx.restore();
    sideDirty = false;
  }

  function drawSidePerceptron(ctx, W, H, now) {
    const pad = 14, iw = W - 2 * pad;
    let y = pad + 12;
    header(ctx, 'the perceptron', 'Rosenblatt, 1958', pad, y, iw);
    y += 18;
    // wiring: x, y, 1 → Σ → sign
    const dh = Math.min(150, H * 0.28);
    const xi = pad + 26, xo = pad + iw - 58;
    const ys = [y + dh * 0.2, y + dh * 0.5, y + dh * 0.8];
    const yo = y + dh * 0.5;
    const names = ['x', 'y', '1'];
    const wmax = Math.max(1, ...pc.w.map(Math.abs));
    for (let i = 0; i < 3; i++) {
      const w = pc.w[i];
      const a = Math.abs(w) / wmax;
      ctx.strokeStyle = w === 0 ? rgba(C.ink, 0.15) : rgba(w > 0 ? C.gold : C.azure, 0.35 + 0.6 * a);
      ctx.lineWidth = 0.8 + 2.6 * a;
      ctx.beginPath(); ctx.moveTo(xi + 9, ys[i]); ctx.lineTo(xo - 13, yo); ctx.stroke();
      const mx = xi + (xo - xi) * 0.34, my = ys[i] + (yo - ys[i]) * 0.34;
      pill(ctx, fmtNum(Math.round(w * 100) / 100, Number.isInteger(Math.round(w * 100) / 100) ? 0 : 2), mx, my, { align: 'center', color: w > 0 ? C.goldBright : w < 0 ? C.azure : C.inkDim, px: 10.5 });
      ctx.beginPath(); ctx.arc(xi, ys[i], 9, 0, TAU);
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = rgba(C.ink, 0.35); ctx.lineWidth = 1; ctx.stroke();
      txt(ctx, names[i], xi, ys[i] + 0.5, { italic: i < 2, px: 13, color: C.ink, align: 'center', base: 'middle' });
    }
    ctx.beginPath(); ctx.arc(xo, yo, 13, 0, TAU);
    ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.verd; ctx.lineWidth = 1.4; ctx.stroke();
    txt(ctx, 'Σ', xo, yo + 1, { px: 14, color: C.ink, align: 'center', base: 'middle' });
    ctx.strokeStyle = rgba(C.ink, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xo + 13, yo); ctx.lineTo(xo + 30, yo); ctx.stroke();
    txt(ctx, 'sign', xo + 34, yo + 0.5, { italic: true, px: 12, color: C.inkDim, base: 'middle' });
    y += dh + 10;
    txt(ctx, 'a mistake: t·(w·x̃) ≤ 0, then w ← w + t·x̃', pad, y, { mono: true, px: 10.5, color: C.inkDim });
    y += 24;

    // the ledger: one row of tally marks per pass (I.1's oldest notation)
    header(ctx, 'mistakes, pass by pass', '', pad, y, iw);
    y += 18;
    // XOR: the loop's ring sits below the ledger; its header is at H − 2R − 54 (see
    // below), and the last tally row must end clear of it.
    const ringR = Math.min(54, iw * 0.28);
    const rowsAvail = dataKey === 'xor' ? Math.max(2, Math.floor((H - 2 * ringR - 72 - y) / 17)) : 4;
    const log = pc.passLog.slice();
    if (pc.idx > 0) log.push(pc.passMistakes);
    const first = Math.max(0, log.length - rowsAvail);
    for (let r = first; r < log.length; r++) {
      const m = log[r];
      const live = r === log.length - 1 && pc.idx > 0;
      txt(ctx, `pass ${r + 1}`, pad, y + 4, { px: 11, color: live ? C.ink : C.inkFaint, italic: true });
      let x = pad + 58;
      ctx.strokeStyle = live ? C.goldBright : C.gold; ctx.lineWidth = 1.3;
      for (let k = 0; k < m && x < W - pad - 44; k++) {
        if (k % 5 === 4) { ctx.beginPath(); ctx.moveTo(x - 22, y + 5); ctx.lineTo(x + 2, y - 7); ctx.stroke(); x += 8; continue; }
        ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 5); ctx.stroke();
        x += 5.5;
      }
      if (m === 0 && !live) txt(ctx, '— none: converged', x, y + 4, { px: 11, color: C.verdant, italic: true });
      else txt(ctx, String(m), W - pad, y + 4, { mono: true, px: 10.5, color: C.inkDim, align: 'right' });
      y += 17;
    }
    if (!log.length) { txt(ctx, 'press ▶ learn', pad, y + 4, { italic: true, px: 11.5, color: C.inkFaint }); y += 17; }

    if (dataKey === 'separable') {
      // the journey of w in the (w₁, w₂) plane, against the direction u that made the points
      const jy = Math.max(y + 8, pad + 150);
      const jh = H - 70 - jy - 22;
      if (jh > 80) {
        header(ctx, 'the journey of w', 'dashed: u, the line that made the points', pad, jy + 4, iw);
        drawJourney(ctx, { x: pad, y: jy + 14, w: iw, h: jh });
      }
      // the Block–Novikoff bound, as a bar
      const by = H - 44;
      header(ctx, 'the Block–Novikoff bound', '', pad, by - 16, iw);
      const frac = clamp(pc.total / bound, 0, 1);
      ctx.fillStyle = rgba(C.ink, 0.07); ctx.fillRect(pad, by, iw, 8);
      ctx.fillStyle = C.gold; ctx.fillRect(pad, by, Math.max(pc.total ? 2 : 0, iw * frac), 8);
      txt(ctx, `${pc.total} mistake${pc.total === 1 ? '' : 's'} so far, of at most (R/γ)² = ${bound.toFixed(1)}`, pad, by + 24, { mono: true, px: 10.5, color: C.inkDim });
    } else {
      // XOR: the states of the latest pass, drawn as the loop they close
      const R = ringR, cy = H - R - 32, cx = W / 2;
      header(ctx, 'the loop', pc.cycle ? 'cycle detected' : '', pad, cy - R - 22, iw);
      // the states of the last completed pass (or of the pass under way), placed on a ring
      const known = !!(pc.lastTrace && pc.lastTrace.length > 1);
      const tr = known ? pc.lastTrace : pc.trace;
      const nS = known ? tr.length - 1 : 4;
      const nArcs = known ? nS : tr.length - 1;
      const nNodes = known ? nS : tr.length;
      const curIdx = pc.idx > 0 ? (pc.trace.length - 1) % nS : 0;
      const ang = (i) => -Math.PI / 2 + (i / nS) * TAU;
      const pos = (i) => [cx + R * Math.cos(ang(i)), cy + R * Math.sin(ang(i))];
      ctx.strokeStyle = rgba(pc.cycle ? C.crimsonBright : C.ink, 0.55); ctx.lineWidth = 1.2;
      ctx.fillStyle = ctx.strokeStyle;
      for (let i = 0; i < nArcs; i++) {
        const a0 = ang(i) + 0.28, a1 = ang(i + 1) - 0.28;
        ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
        const hx = cx + R * Math.cos(a1), hy = cy + R * Math.sin(a1);
        const ta = a1 + Math.PI / 2, tn = ta - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(hx + 5 * Math.cos(ta), hy + 5 * Math.sin(ta));
        ctx.lineTo(hx - 3 * Math.cos(ta) + 3.5 * Math.cos(tn), hy - 3 * Math.sin(ta) + 3.5 * Math.sin(tn));
        ctx.lineTo(hx - 3 * Math.cos(ta) - 3.5 * Math.cos(tn), hy - 3 * Math.sin(ta) - 3.5 * Math.sin(tn));
        ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < nNodes; i++) {
        const [px, py] = pos(i);
        const cur = i === curIdx && (known || pc.idx > 0 || pc.pass > 0);
        ctx.beginPath(); ctx.arc(px, py, cur ? 5 : 3.5, 0, TAU);
        ctx.fillStyle = cur ? C.goldBright : C.ink; ctx.fill();
        const c = Math.cos(ang(i));
        const right = c > 0.2, left = c < -0.2;
        const lx = px + (right ? 10 : left ? -10 : 0), ly = py + (py < cy - 1 ? -10 : py > cy + 1 ? 17 : 4);
        txt(ctx, fmtW(tr[i]), lx, ly, { mono: true, px: 10.5, color: i === 0 && pc.cycle ? C.crimsonBright : C.inkDim, align: right ? 'left' : left ? 'right' : 'center' });
      }
      if (!known && tr.length === 1) txt(ctx, 'one pass, drawn as it happens', cx, cy + 4, { italic: true, px: 11, color: C.inkFaint, align: 'center' });
      else if (pc.cycle) txt(ctx, 'back to the start', cx, cy + 4, { italic: true, px: 11, color: C.crimsonBright, align: 'center' });
    }
  }

  function drawJourney(ctx, r) {
    frameBox(ctx, r);
    // every state w has passed through this run: w₀ = 0, then one per correction
    const states = pc.ghosts.map((g) => g.w);
    if (pc.total > 0) states.push(pc.w);
    if (!states.length) states.push([0, 0, 0]);
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (const w of states) { x0 = Math.min(x0, w[0]); x1 = Math.max(x1, w[0]); y0 = Math.min(y0, w[1]); y1 = Math.max(y1, w[1]); }
    const hw = Math.max(0.75, (x1 - x0) / 2), hh = Math.max(0.75, (y1 - y0) / 2);
    const s = Math.min((r.w / 2 - 16) / hw, (r.h / 2 - 14) / hh);
    const cx = r.x + r.w / 2 - ((x0 + x1) / 2) * s, cy = r.y + r.h / 2 + ((y0 + y1) / 2) * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.strokeStyle = rgba(C.ink, 0.08); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r.x, cy + 0.5); ctx.lineTo(r.x + r.w, cy + 0.5); ctx.moveTo(cx + 0.5, r.y); ctx.lineTo(cx + 0.5, r.y + r.h); ctx.stroke();
    const un = Math.hypot(SEP_U[0], SEP_U[1]);
    ctx.setLineDash([4, 5]); ctx.strokeStyle = rgba(C.verd, 0.7); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (SEP_U[0] / un) * r.w, cy - (SEP_U[1] / un) * r.w); ctx.stroke();
    ctx.setLineDash([]);
    const ul = Math.min(r.h * 0.42, r.w * 0.3);
    txt(ctx, 'u', cx + (SEP_U[0] / un) * ul + 8, cy - (SEP_U[1] / un) * ul, { italic: true, px: 13, color: C.verd });
    for (let i = 1; i < states.length; i++) {
      const a = states[i - 1], b = states[i];
      const last = i === states.length - 1;
      drawArrow(ctx, cx + a[0] * s, cy - a[1] * s, cx + b[0] * s, cy - b[1] * s, last ? C.goldBright : rgba(C.gold, 0.35 + 0.5 * (i / states.length)), last ? 1.6 : 1.1);
    }
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fillStyle = C.inkDim; ctx.fill();
    ctx.restore();
    const cos = pc.total ? (pc.w[0] * SEP_U[0] + pc.w[1] * SEP_U[1]) / (Math.hypot(pc.w[0], pc.w[1]) * un || 1) : NaN;
    // top right: u points down and to the right, so its dashed ray leaves by the bottom edge
    txt(ctx, '(w₁, w₂), one arrow per correction', r.x + r.w - 6, r.y + 14, { italic: true, px: 10, color: C.inkFaint, align: 'right' });
    if (Number.isFinite(cos)) txt(ctx, `angle to u: ${(Math.acos(clamp(cos, -1, 1)) * 180 / Math.PI).toFixed(1)}°`, r.x + 6, r.y + r.h - 7, { mono: true, px: 10, color: C.inkDim });
  }

  function drawSideNetwork(ctx, W, H, now) {
    const pad = 14, iw = W - 2 * pad;
    const n = net;
    const m = macCounts(n.sizes);
    let y = pad + 12;
    header(ctx, 'the network', `[${n.sizes.join(', ')}] · ${fmtInt(n.L.nParams)} weights`, pad, y, iw);
    y += 12;
    const units = n.sizes[n.sizes.length - 2];
    const cols = units > 4 ? 8 : 4;
    const th = (iw - (cols - 1) * 4) / cols;
    const rows = Math.ceil(units / cols);
    const galH = rows * th + (rows - 1) * 4;
    const dh = clamp(H * 0.3, 140, 220);
    const chartH = Math.max(56, (H - 168 - galH - dh) / 2);
    drawDiagram(ctx, { x: pad, y, w: iw, h: dh }, n, now);
    y += dh + 4;
    const wide = iw >= 360;
    txt(ctx, wide ? `one gradient: ${fmtInt(m.total)} multiply-adds a point ≈ ${m.ratio.toFixed(1)} forward passes`
      : `gradient: ${fmtInt(m.total)} mult-adds ≈ ${m.ratio.toFixed(1)} forward passes`, pad, y + 10, { mono: true, px: 10, color: C.inkDim });
    txt(ctx, wide ? `by nudging each weight instead: ${fmtInt(m.fdPasses)} passes` : `by nudging each weight: ${fmtInt(m.fdPasses)} passes`, pad, y + 24, { mono: true, px: 10, color: C.inkFaint });
    y += 34;
    header(ctx, units > 4 ? 'what the last hidden layer sees' : 'what each hidden unit sees', '', pad, y + 12, iw);
    y += 20;
    if (fieldA && galleryDirty) { paintGallery(fieldA); galleryDirty = false; }
    if (fieldA) {
      ctx.imageSmoothingEnabled = true;
      for (let u = 0; u < units; u++) {
        const cx = pad + (u % cols) * (th + 4), cy = y + Math.floor(u / cols) * (th + 4);
        ctx.drawImage(galCan, u * fieldA.res, 0, fieldA.res, fieldA.res, cx, cy, th, th);
        ctx.strokeStyle = rgba(C.ink, 0.12); ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, th - 1, th - 1);
      }
    }
    y += galH + 16;
    // loss chart
    header(ctx, chapter === 4 ? 'loss, linear and zoomed' : 'loss', `${n.loss.toFixed(4)}`, pad, y + 4, iw);
    y += 12;
    lossChart(ctx, { x: pad, y, w: iw, h: chartH }, n);
    y += chartH + 20;
    if (chapter === 2) {
      header(ctx, 'the price of one gradient', '', pad, y + 4, iw);
      y += 12;
      costChart(ctx, { x: pad, y, w: iw, h: chartH });
    } else if (listening && spectrum && chapter === 3) {
      header(ctx, 'the scan line’s harmonics', `loudest: ${ordinal(spectrum.kmax)} · ${fmtInt(55 * spectrum.kmax)} Hz`, pad, y + 4, iw);
      y += 12;
      spectrumChart(ctx, { x: pad, y, w: iw, h: chartH });
    } else {
      const thr = threshold();
      const lamTxt = Number.isFinite(n.lam) && n.lam > 0 ? `≈ ${n.lam.toFixed(2)}` : '';
      header(ctx, 'curvature λ, estimated', lamTxt, pad, y + 4, iw);
      y += 12;
      curvChart(ctx, { x: pad, y, w: iw, h: chartH }, n, thr, now);
    }
  }

  function drawDiagram(ctx, r, n, now) {
    const sizes = n.sizes, nL = sizes.length;
    const xs = sizes.map((_, l) => r.x + 18 + (l * (r.w - 36)) / (nL - 1));
    const ys = sizes.map((k) => {
      const sp = k <= 1 ? 0 : Math.min((r.h - 16) / (k - 1), k <= 4 ? 34 : 20);
      const tot = sp * (k - 1);
      return Array.from({ length: k }, (_, i) => r.y + r.h / 2 - tot / 2 + i * sp);
    });
    const th = n.theta, g = n.grad;
    const sweepOn = training && !REDUCED;
    const G = nL - 1;
    const ph = ((now * 0.75) % 1) * (G + 1.2) - 0.6;          // runs from the output side to the input side
    ctx.save();
    ctx.lineCap = 'round';
    for (let l = 0; l < G; l++) {
      const ly = n.L.layers[l];
      let wmax = 1e-9, gmax = 1e-12;
      for (let k = 0; k < ly.nin * ly.nout; k++) { wmax = Math.max(wmax, Math.abs(th[ly.W + k])); gmax = Math.max(gmax, Math.abs(g[ly.W + k])); }
      const gi = G - 1 - l;                                      // 0 = the gap next to the output
      const I = sweepOn ? Math.exp(-(((ph - gi) / 0.55) ** 2)) : 0;
      for (let j = 0; j < ly.nout; j++) {
        for (let i = 0; i < ly.nin; i++) {
          const w = th[ly.W + j * ly.nin + i];
          const a = Math.abs(w) / wmax;
          ctx.strokeStyle = rgba(w >= 0 ? C.gold : C.azure, 0.08 + 0.5 * a * a);
          ctx.lineWidth = 0.4 + 1.9 * a;
          ctx.beginPath(); ctx.moveTo(xs[l], ys[l][i]); ctx.lineTo(xs[l + 1], ys[l + 1][j]); ctx.stroke();
        }
      }
      if (I > 0.02) {
        ctx.strokeStyle = C.verd;
        for (let j = 0; j < ly.nout; j++) {
          for (let i = 0; i < ly.nin; i++) {
            const gv = Math.abs(g[ly.W + j * ly.nin + i]) / gmax;
            const s = clamp(1 + Math.log10(gv + 1e-9) / 2.5, 0, 1);
            if (s < 0.05) continue;
            ctx.globalAlpha = 0.42 * I * s * s;
            ctx.lineWidth = 0.5 + 1.1 * s;
            ctx.beginPath(); ctx.moveTo(xs[l], ys[l][i]); ctx.lineTo(xs[l + 1], ys[l + 1][j]); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    // nodes: fills show the forward activations for the hovered input
    const acts = hover && hover.acts;
    for (let l = 0; l < nL; l++) {
      const k = sizes[l];
      const rad = l === 0 || l === nL - 1 ? 6.5 : clamp(((r.h - 16) / Math.max(k, 1)) * 0.3, 2.6, 6);
      for (let i = 0; i < k; i++) {
        let fill = C.bg;
        if (acts) {
          const a = l === nL - 1 ? 2 * acts[l][i] - 1 : l === 0 ? acts[l][i] : acts[l][i];
          fill = rgba(a >= 0 ? C.goldBright : C.azure, clamp(Math.abs(a), 0.06, 1));
        }
        ctx.beginPath(); ctx.arc(xs[l], ys[l][i], rad, 0, TAU);
        ctx.fillStyle = C.bg; ctx.fill();
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = l === nL - 1 ? C.verd : rgba(C.ink, 0.4); ctx.stroke();
      }
    }
    txt(ctx, 'x', xs[0] - 12, ys[0][0] + 0.5, { italic: true, px: 13, color: C.ink, align: 'right', base: 'middle' });
    txt(ctx, 'y', xs[0] - 12, ys[0][1] + 0.5, { italic: true, px: 13, color: C.ink, align: 'right', base: 'middle' });
    txt(ctx, 'q', xs[nL - 1] + 11, ys[nL - 1][0] + 0.5, { italic: true, px: 13, color: C.ink, base: 'middle' });
    if (training && !REDUCED) txt(ctx, '← gradient', r.x + r.w, r.y + r.h - 2, { italic: true, px: 10.5, color: C.verd, align: 'right' });
    ctx.restore();
  }

  function frameBox(ctx, r) {
    ctx.fillStyle = rgba(C.ink, 0.025); ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = rgba(C.ink, 0.1); ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }
  function lossChart(ctx, r, n) {
    if (chapter === 4) { lossChartLinear(ctx, r, n); return; }
    frameBox(ctx, r);
    const h = n.lossH;
    const vals = h.vals, steps = h.steps;
    let lo = 1e-3;
    for (const v of vals) if (v > 0 && v < lo) lo = v;
    const dmin = Math.floor(Math.log10(lo)), dmax = 0;
    const xMax = Math.max(dataKey === 'xor' ? 200 : 1000, n.step);
    const px = (s) => r.x + 30 + ((r.w - 36) * s) / xMax;
    const py = (v) => r.y + 4 + (r.h - 8) * (dmax - Math.log10(Math.max(v, 1e-9))) / (dmax - dmin);
    ctx.save();
    ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let d = dmin; d <= dmax; d++) {
      const yy = py(10 ** d);
      ctx.strokeStyle = rgba(C.ink, 0.06); ctx.beginPath(); ctx.moveTo(r.x + 30, yy); ctx.lineTo(r.x + r.w - 6, yy); ctx.stroke();
      ctx.fillStyle = C.inkFaint; ctx.fillText(d === 0 ? '1' : '10' + sup(d), r.x + 26, yy);
    }
    const yc = py(Math.LN2);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(C.ink, 0.28);
    ctx.beginPath(); ctx.moveTo(r.x + 30, yc); ctx.lineTo(r.x + r.w - 6, yc); ctx.stroke(); ctx.setLineDash([]);
    txt(ctx, 'chance · ln 2', r.x + r.w - 8, yc - 5, { italic: true, px: 10, color: C.inkFaint, align: 'right' });
    ctx.beginPath();
    for (let i = 0; i < vals.length; i++) { const X0 = px(steps[i]), Y0 = py(vals[i]); i ? ctx.lineTo(X0, Y0) : ctx.moveTo(X0, Y0); }
    ctx.strokeStyle = C.verd; ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.stroke();
    if (vals.length) { glowVerd.draw(ctx, px(steps[steps.length - 1]), py(vals[vals.length - 1]), 0.5); }
    if (n.solvedAt != null) {
      const sx = px(n.solvedAt);
      ctx.strokeStyle = rgba(C.verdant, 0.6); ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(sx, r.y + 3); ctx.lineTo(sx, r.y + r.h - 3); ctx.stroke(); ctx.setLineDash([]);
      txt(ctx, `all correct · ${fmtInt(n.solvedAt)}`, clamp(sx + 4, r.x + 32, r.x + r.w - 110), r.y + r.h - 6, { italic: true, px: 10, color: C.verdant });
    }
    ctx.restore();
  }
  // Chapter iv: the loss on a zoomed linear scale, where the edge of stability's
  // short-timescale jitter (non-monotone steps) is visible.
  function lossChartLinear(ctx, r, n) {
    frameBox(ctx, r);
    const vals = n.lossH.vals, steps = n.lossH.steps;
    let lo = Infinity, hi = -Infinity;
    for (const v of vals) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) return;
    if (hi - lo < 0.02) { const m = (hi + lo) / 2; lo = m - 0.01; hi = m + 0.01; }
    const padv = (hi - lo) * 0.08; lo -= padv; hi += padv;
    const xMax = Math.max(1000, n.step);
    const px = (s2) => r.x + 38 + ((r.w - 44) * s2) / xMax;
    const py = (v) => r.y + 4 + ((r.h - 8) * (hi - v)) / (hi - lo);
    ctx.save();
    const st = niceStep((hi - lo) / 3);
    ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) {
      const yy = py(v);
      ctx.strokeStyle = rgba(C.ink, 0.06); ctx.beginPath(); ctx.moveTo(r.x + 38, yy); ctx.lineTo(r.x + r.w - 6, yy); ctx.stroke();
      ctx.fillStyle = C.inkFaint; ctx.fillText(v.toFixed(st < 0.01 ? 3 : 2), r.x + 34, yy);
    }
    ctx.beginPath();
    for (let i = 0; i < vals.length; i++) { const X0 = px(steps[i]), Y0 = py(vals[i]); i ? ctx.lineTo(X0, Y0) : ctx.moveTo(X0, Y0); }
    ctx.strokeStyle = C.verd; ctx.lineWidth = 1.1; ctx.lineJoin = 'round'; ctx.stroke();
    let ups = 0;
    for (let i = 0; i < 200; i++) ups += n.ups[i];
    const recent = Math.min(200, n.step);
    if (recent >= 50) pill(ctx, ups ? `the loss rose on ${ups} of the last ${recent} steps` : `the loss fell on each of the last ${recent} steps`, r.x + r.w - 6, r.y + 12, { mono: false, px: 10, align: 'right', color: ups ? C.verd : C.inkFaint, border: 'rgba(0,0,0,0)', maxX: r.x + r.w });
    ctx.restore();
  }
  function sup(d) {
    const map = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    return String(d).split('').map((c) => map[c] || c).join('');
  }
  function curvChart(ctx, r, n, thr, now) {
    frameBox(ctx, r);
    const vals = n.lamH.vals, steps = n.lamH.steps;
    let vmax = thr * 1.35;
    for (const v of vals) if (Number.isFinite(v)) vmax = Math.max(vmax, v * 1.08);
    const xMax = Math.max(dataKey === 'xor' ? 200 : 1000, n.step);
    const px = (s) => r.x + 30 + ((r.w - 36) * s) / xMax;
    const py = (v) => r.y + r.h - 4 - ((r.h - 8) * clamp(v, 0, vmax)) / vmax;
    ctx.save();
    ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const stepv = niceStep(vmax / 3);
    for (let v = 0; v <= vmax; v += stepv) {
      const yy = py(v);
      ctx.strokeStyle = rgba(C.ink, 0.06); ctx.beginPath(); ctx.moveTo(r.x + 30, yy); ctx.lineTo(r.x + r.w - 6, yy); ctx.stroke();
      ctx.fillStyle = C.inkFaint; ctx.fillText(String(+v.toFixed(2)), r.x + 26, yy);
    }
    const touching = Number.isFinite(n.lam) && n.lam >= 0.93 * thr;
    const yt = py(thr);
    if (touching) { ctx.strokeStyle = rgba(C.verd, 0.25); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(r.x + 30, yt); ctx.lineTo(r.x + r.w - 6, yt); ctx.stroke(); }
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    ctx.strokeStyle = touching ? C.verd : C.crimsonBright;
    ctx.beginPath(); ctx.moveTo(r.x + 30, yt); ctx.lineTo(r.x + r.w - 6, yt); ctx.stroke(); ctx.setLineDash([]);
    const tl = beta > 0 ? `(2 + 2β)/η = ${thr.toFixed(2)}` : `2/η = ${thr.toFixed(2)}`;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < vals.length; i++) {
      if (!Number.isFinite(vals[i])) continue;
      const X0 = px(steps[i]), Y0 = py(vals[i]);
      started ? ctx.lineTo(X0, Y0) : ctx.moveTo(X0, Y0); started = true;
    }
    ctx.strokeStyle = C.azure; ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.stroke();
    // labels on their own dark pills, drawn after the trace, which often rides the line itself
    const thrCol = touching ? C.verd : C.crimsonBright;
    pill(ctx, tl, r.x + r.w - 6, clamp(yt - 10, r.y + 10, r.y + r.h - 10), { px: 10, align: 'right', color: thrCol, border: 'rgba(0,0,0,0)', maxX: r.x + r.w });
    if (touching && chapter === 4 && r.h >= 64) pill(ctx, 'the edge of stability, measured now', r.x + r.w - 6, r.y + r.h - 12, { mono: false, px: 10.5, align: 'right', color: C.verd, border: 'rgba(0,0,0,0)', maxX: r.x + r.w });
    void now;
    ctx.restore();
  }
  function costChart(ctx, r) {
    frameBox(ctx, r);
    // multiply-adds per training point, for the 337-weight spirals network (the prose's figures)
    const big = macCounts([2, 16, 16, 1]), here = macCounts(net.sizes);
    const rows = [
      { lab: 'forward pass', v: big.forward, h: here.forward, col: C.inkDim },
      { lab: 'reverse sweep', v: big.total, h: here.total, col: C.verd },
      { lab: 'nudging each weight', v: big.fdMacs, h: here.fdMacs, col: C.crimsonBright },
    ];
    const lx = r.x + 8, bx = r.x + Math.min(128, r.w * 0.36), bw = r.x + r.w - 58 - bx;
    const xv = (v) => bx + (bw * Math.log10(Math.max(v, 1))) / 5.4;
    const rh = (r.h - 16) / 3;
    rows.forEach((row, i) => {
      const yy = r.y + 5 + i * rh + rh / 2;
      txt(ctx, row.lab, lx, yy, { italic: true, px: 10.5, color: C.inkDim, base: 'middle' });
      ctx.fillStyle = row.col; ctx.fillRect(bx, yy - 3, Math.max(2, xv(row.v) - bx), 6);
      txt(ctx, fmtInt(row.v), xv(row.v) + 5, yy + 0.5, { mono: true, px: 10, color: row.col, base: 'middle' });
    });
    txt(ctx, `multiply-adds per point, 337 weights, log scale · here: ${rows.map((q) => fmtInt(q.h)).join(' · ')}`, r.x + 8, r.y + r.h - 5, { italic: true, px: 9.5, color: C.inkFaint });
  }
  function niceStep(x) {
    const p = 10 ** Math.floor(Math.log10(x));
    const f = x / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function spectrumChart(ctx, r) {
    frameBox(ctx, r);
    const mags = spectrum.mags;
    let mx = 1e-9;
    for (let k = 1; k <= 64; k++) mx = Math.max(mx, mags[k]);
    const bw = (r.w - 16) / 64;
    for (let k = 1; k <= 64; k++) {
      const h = ((r.h - 30) * mags[k]) / mx;
      const x = r.x + 8 + (k - 1) * bw;
      ctx.fillStyle = k === spectrum.kmax ? C.goldBright : rgba(C.ink, 0.35);
      ctx.fillRect(x + 0.5, r.y + r.h - 12 - h, Math.max(1, bw - 1.2), h);
    }
    for (const k of [1, 16, 32, 48, 64]) txt(ctx, String(k), r.x + 8 + (k - 0.5) * bw, r.y + r.h - 2, { mono: true, px: 9, color: C.inkFaint, align: 'center' });
    const kx = r.x + 8 + (spectrum.kmax - 0.5) * bw;
    txt(ctx, `${ordinal(spectrum.kmax)}`, kx, r.y + 13, { mono: true, px: 10.5, color: C.goldBright, align: 'center' });
  }

  /* ---------- the bowl ---------- */
  let bowlT0 = 0, bowlShown = 0;
  function restartBowl() { bowlT0 = performance.now() / 1000; bowlShown = 0; bowlDirty = true; }
  function drawBowl(now) {
    const ctx = bowl.ctx, W = bowl.width, H = bowl.height;
    const nshow = Math.min(24, Math.floor((now - bowlT0) / (REDUCED ? 0.001 : 0.16)));
    if (nshow === bowlShown && !bowlDirty) return;
    bowlShown = nshow;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = rgba(C.ink, 0.1); ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    const k = bowlK;
    const path = quadraticGD(1, k, 1.4, 24);
    const stack = W < 520;
    const scaleH = 44;
    // the panels stop 26 px above the scale, leaving a lane for the network's label
    const L = stack ? { x: 12, y: 10, w: W - 24, h: (H - scaleH - 26) * 0.5 } : { x: 12, y: 10, w: W * 0.42 - 12, h: H - scaleH - 22 };
    const Rr = stack ? { x: 12, y: L.y + L.h + 6, w: W - 24, h: (H - scaleH - 26) * 0.5 - 6 } : { x: W * 0.42 + 10, y: 10, w: W * 0.58 - 22, h: H - scaleH - 22 };
    // the parabola
    const wx = (w) => L.x + L.w / 2 + (w / 2.2) * (L.w / 2);
    const wy = (w) => L.y + L.h - 6 - ((0.5 * w * w) / 2.42) * (L.h - 16);
    ctx.strokeStyle = rgba(C.ink, 0.5); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const w = -2.2 + (4.4 * i) / 80; i ? ctx.lineTo(wx(w), wy(w)) : ctx.moveTo(wx(w), wy(w)); }
    ctx.stroke();
    const vis = (w) => Math.abs(w) <= 2.2;
    ctx.lineWidth = 1;
    for (let t = 0; t < nshow; t++) {
      const a = path[t], b = path[t + 1];
      if (!vis(a) || !vis(b)) break;
      ctx.strokeStyle = rgba(C.gold, 0.2 + 0.6 * (t + 1) / Math.max(1, nshow));
      ctx.beginPath(); ctx.moveTo(wx(a), wy(a)); ctx.lineTo(wx(b), wy(b)); ctx.stroke();
    }
    const cur = path[nshow];
    if (vis(cur)) { glowGold.draw(ctx, wx(cur), wy(cur), 0.9); ctx.beginPath(); ctx.arc(wx(cur), wy(cur), 4, 0, TAU); ctx.fillStyle = C.goldBright; ctx.fill(); }
    else { txt(ctx, 'thrown out of the bowl', L.x + L.w / 2, L.y + 16, { italic: true, px: 11.5, color: C.crimsonBright, align: 'center' }); }
    caps(ctx, 'the bowl', L.x + L.w / 2, L.y + 14, 11, C.inkFaint, 'center');
    // the iterates, as stems
    frameBox(ctx, Rr);
    const tx = (t) => Rr.x + 12 + ((Rr.w - 24) * t) / 24;
    const ty = (w) => Rr.y + Rr.h / 2 - (clamp(w, -2, 2) / 2) * (Rr.h / 2 - 8);
    ctx.strokeStyle = rgba(C.ink, 0.15);
    ctx.beginPath(); ctx.moveTo(Rr.x + 6, ty(0)); ctx.lineTo(Rr.x + Rr.w - 6, ty(0)); ctx.stroke();
    for (let t = 0; t <= nshow; t++) {
      const w = path[t];
      const out = Math.abs(w) > 2;
      ctx.strokeStyle = out ? C.crimsonBright : rgba(C.gold, 0.55);
      ctx.beginPath(); ctx.moveTo(tx(t), ty(0)); ctx.lineTo(tx(t), ty(w)); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx(t), ty(w), out ? 3 : 2.6, 0, TAU);
      ctx.fillStyle = out ? C.crimsonBright : C.goldBright; ctx.fill();
    }
    caps(ctx, 'wₜ, step by step', Rr.x + 8, Rr.y + 14, 11, C.inkFaint);
    const mult = 1 - k;
    const verdict = k < 1 ? 'slides straight down' : k === 1 ? 'lands in one step' : k < 2 ? 'settles, rocking side to side' : k === 2 ? 'rattles forever: 1, −1, 1, −1' : 'escapes, faster every step';
    const vtxt = stack ? `w × (${fmtNum(mult, 2)}) each step: it ${verdict.replace(', faster every step', '').replace(' side to side', '')}`
      : `each step multiplies w by 1 − ηλ = ${fmtNum(mult, 2)}: it ${verdict}`;
    txt(ctx, vtxt, Rr.x + Rr.w - 8, Rr.y + Rr.h - 8, { italic: true, px: stack ? 10.5 : 11, color: k > 2 ? C.crimsonBright : k === 2 ? C.goldBright : C.inkDim, align: 'right' });
    // the ηλ scale, with the live network's own ηλ
    const sy = H - scaleH + 14;
    const sx = (v) => 16 + ((W - 32) * v) / 2.4;
    ctx.fillStyle = rgba(C.verdant, 0.35); ctx.fillRect(sx(0), sy, sx(2) - sx(0), 3);
    ctx.fillStyle = rgba(C.crimsonBright, 0.6); ctx.fillRect(sx(2), sy, sx(2.4) - sx(2), 3);
    for (const v of [0, 1, 2]) txt(ctx, String(v), sx(v), sy + 16, { mono: true, px: 10, color: v === 2 ? C.ink : C.inkFaint, align: 'center' });
    txt(ctx, 'η · λ', W - 16, sy + 16, { italic: true, px: 11, color: C.inkFaint, align: 'right' });
    ctx.beginPath(); ctx.arc(sx(Math.min(k, 2.4)), sy + 1.5, 5, 0, TAU); ctx.fillStyle = C.goldBright; ctx.fill();
    if (net && dataKey === 'spirals' && Number.isFinite(net.lam)) {
      const v = eta * net.lam;
      const vx = sx(Math.min(v, 2.4));
      ctx.strokeStyle = C.verd; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(vx, sy - 8); ctx.lineTo(vx, sy + 10); ctx.stroke();
      const lab = `your network: η·λmax ≈ ${v.toFixed(2)}`;
      txt(ctx, lab, clamp(vx, 90, W - 90), sy - 12, { mono: true, px: 10, color: C.verd, align: 'center' });
    }
    ctx.restore();
    bowlDirty = false;
  }

  /* ---------- the ruler ---------- */
  function drawRuler() {
    const ctx = ruler.ctx, W = ruler.width, H = ruler.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    const pad = 22;
    const ay = Math.round(H - 38) + 0.5;
    const x = (v) => pad + ((W - 2 * pad) * Math.log10(v)) / 12;
    ctx.strokeStyle = rgba(C.ink, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, ay); ctx.lineTo(W - pad, ay); ctx.stroke();
    for (let d = 0; d <= 12; d++) {
      const xx = Math.round(x(10 ** d)) + 0.5;
      const major = d % 3 === 0;
      ctx.beginPath(); ctx.moveTo(xx, ay - (major ? 5 : 3)); ctx.lineTo(xx, ay + (major ? 5 : 3)); ctx.stroke();
      if (major) txt(ctx, d === 0 ? '1' : '10' + sup(d), xx, ay + 18, { mono: true, px: 10, color: C.inkFaint, align: 'center' });
    }
    const tierRight = [-1e9, -1e9];
    for (const mk of RULER_MARKS) {
      const xx = x(mk.v);
      ctx.font = `10.5px ${MONO}`;
      const w1 = ctx.measureText(mk.label).width;
      ctx.font = `italic 10.5px ${SERIF}`;
      const w2 = ctx.measureText(mk.note).width;
      const half = Math.max(w1, w2) / 2;
      const cx = clamp(xx, pad + half, W - pad - half);
      const tier = cx - half > tierRight[0] + 8 ? 0 : 1;
      tierRight[tier] = cx + half;
      const lift = tier * 27;
      ctx.strokeStyle = rgba(C.ink, 0.7); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(xx, ay - 11 - lift); ctx.lineTo(xx, ay); ctx.stroke();
      ctx.beginPath(); ctx.arc(xx, ay, 2.4, 0, TAU); ctx.fillStyle = C.ink; ctx.fill();
      txt(ctx, mk.label, cx, ay - 16 - lift, { mono: true, px: 10.5, color: C.ink, align: 'center' });
      txt(ctx, mk.note, cx, ay - 29 - lift, { italic: true, px: 10.5, color: C.inkDim, align: 'center' });
    }
    const nP = mode === 'perceptron' ? 3 : net ? net.L.nParams : 337;
    const xx = x(nP);
    glowGold.draw(ctx, xx, ay, 1.1);
    ctx.beginPath(); ctx.arc(xx, ay, 3.6, 0, TAU); ctx.fillStyle = C.goldBright; ctx.fill();
    const lab = `this stage · ${fmtInt(nP)}`;
    ctx.font = `10.5px ${MONO}`;
    const lw = ctx.measureText(lab).width;
    txt(ctx, lab, clamp(xx, pad + lw / 2, W - pad - lw / 2) + (W < 520 ? 0 : 0), ay + (W < 520 ? 34 : 32), { mono: true, px: 10.5, color: C.goldBright, align: 'center' });
    ctx.restore();
    rulerDirty = false;
  }

  /* ---------- text: readout, mathline, quest ---------- */
  function refreshReadout() {
    let h = '';
    if (mode === 'perceptron') {
      if (dataKey === 'separable') {
        if (pc.verdict === 'converged') h = `<span class="ok">converged</span>: a full pass with no mistakes, after <b>${pc.total}</b> correction${pc.total === 1 ? '' : 's'} · the Block–Novikoff bound, using the line that generated the points, is <b>${bound.toFixed(1)}</b>`;
        else if (pc.total || pc.idx) h = `pass ${pc.pass + 1} · ${pc.total} correction${pc.total === 1 ? '' : 's'} so far · bound (R/γ)² = ${bound.toFixed(1)}`;
        else h = `forty points, gold for +1 and blue for −1 · w starts at (0, 0, 0), which gets every point wrong`;
      } else {
        if (pc.cycle) {
          h = `after pass ${pc.cycle.at}, w is back to <b class="nw">${fmtW(pc.cycle.w)}</b>, the state it started from. ` +
            `<span class="bad">PROVED NON-CONVERGING</span> (cycle detected): the same four corrections will repeat forever` +
            (pc.verdict === 'cycle-stopped' ? ` · the demonstration stops itself after ${pc.pass} passes` : ` · ${pc.pass} passes, ${pc.total} corrections`);
        } else if (pc.total || pc.idx) h = `pass ${pc.pass + 1} · <span class="nw">w = ${fmtW(pc.w)}</span> · ${pc.total} corrections`;
        else h = 'XOR: gold where exactly one coordinate is positive · no line can split it';
      }
    } else if (net) {
      const n = net;
      const nPts = pts.length;
      const right = Math.round(n.acc * nPts);
      let s = `step <b>${fmtInt(n.step)}</b> · loss ${Number.isFinite(n.loss) ? n.loss.toFixed(4) : '∞'} · ` +
        `<b>${right}</b> of ${nPts} correct`;
      if (crit4 && dataKey === 'spirals') s += ` (by 40-20-40: ${Math.round(n.acc4 * nPts)})`;
      if (dataKey === 'xor') {
        if (width === 1 && n.step >= 300) s += ` · <span class="bad">stalled at ${Math.round(n.best * 100)}%</span>: one hidden unit is still one line (q &gt; ½ exactly when a·x + b·y + c is past a threshold). A theorem, not bad luck.`;
        else if (n.acc === 1) s += ` · <span class="ok">solved</span> at step ${fmtInt(n.solvedAt)}: the ${NUMW[width]} faint lines are the ${NUMW[width]} cuts of the hidden layer`;
        else if (!training && n.step >= maxSteps()) s += ` · <span class="bad">stuck</span> from seed ${n.seed}, though ${NUMW[width]} hidden units could solve it: the landscape is not a bowl. Reseed, or add a unit.`;
      } else {
        if (n.solvedAt != null) s += ` · <span class="ok">all correct</span> from step ${fmtInt(n.solvedAt)}`;
        else if (chapter === 3 && !training && n.step >= maxSteps()) s += ` · <span class="bad">not all correct</span> after ${fmtInt(n.step)} steps from seed ${n.seed}: descent promises nothing. Try another seed.`;
        if (chapter === 4 || training || n.step > 0) {
          const thr = threshold();
          // Power iteration finds the largest |λ|; for a moment after a spike that
          // can be a negative direction, which is not the curvature being tracked.
          if (Number.isFinite(n.lam) && n.lam > 0) s += ` · <span class="nw">λmax ≈ ${n.lam.toFixed(2)}</span> against <span class="nw">${beta > 0 ? '(2 + 2β)/η' : '2/η'} = ${thr.toFixed(2)}</span>`;
          if (chapter === 4 && n.lam >= 0.95 * thr) s += ` · <span class="edge">edge of stability (Cohen et al., 2021): measured on this network, now</span>`;
        }
        if (listening && spectrum) s += `\nscan line: ${spectrum.flips.length} crossings · loudest partial the ${ordinal(spectrum.kmax)}, ${fmtInt(55 * spectrum.kmax)} Hz · RMS ${spectrum.rms.toFixed(2)}`;
        if (hatch && net2) {
          const dis = `<b>${(hatch.frac * 100).toFixed(1)}%</b> of the disk the data occupy`;
          s += hatch.bothPerfect
            ? `\n<span class="bad">second opinion</span>: seed ${net.seed} and seed ${net2.seed} both put all 194 points on the right side, and disagree on ${dis}`
            : `\n<span class="bad">second opinion</span>: seed ${net2.seed} stopped at ${Math.round(net2.acc * 194)} of 194 after ${fmtInt(net2.step)} steps; the two disagree on ${dis}`;
        } else if (training2 && net2) {
          s += `\nsecond opinion: training seed ${net2.seed} · step ${fmtInt(net2.step)} · ${Math.round(net2.acc * 194)} of 194`;
        }
      }
      if (hearingLoss) s += `\nthe loss as pitch: ${fmtInt(clamp(lossFreq(n.loss), 55, 1760))} Hz${lossFreq(n.loss) < 55 ? ' (clamped at 55)' : ''} · chance-level loss, ln 2, is A440`;
      h = s;
    }
    readout.setHTML(h);
  }
  function refreshMath() {
    let h = '';
    if (chapter === 1 && dataKey === 'separable') {
      h = '<span class="nw">on a mistake:&nbsp; w ← w + t·x̃</span> &nbsp;<span class="d nw">x̃ = (x, y, 1), t = ±1</span>';
    } else if (chapter === 1) {
      h = '<span class="nw">−a − b + c ≤ 0</span> and <span class="nw">a + b + c ≤ 0</span> <span class="nw">⇒ 2c ≤ 0</span><br>' +
        '<span class="nw">−a + b + c &gt; 0</span> and <span class="nw">a − b + c &gt; 0</span> <span class="nw">⇒ 2c &gt; 0</span><br><span class="x">a contradiction: no line <span class="nw">a·x + b·y + c = 0</span> can split XOR</span>';
    } else if (chapter === 2) {
      h = '<span class="nw">δ<sub>out</sub> = q − t,</span> &nbsp; <span class="nw">δ<sub>ℓ</sub> = (W<sub>ℓ+1</sub><sup>T</sup> δ<sub>ℓ+1</sub>) ⊙ (1 − h<sub>ℓ</sub>²),</span> &nbsp; <span class="nw">∂L/∂W<sub>ℓ</sub> = δ<sub>ℓ</sub> h<sub>ℓ−1</sub><sup>T</sup></span> &nbsp;<span class="d nw">the chain rule, run backwards</span>';
    } else if (chapter === 3) {
      h = beta > 0
        ? `<span class="nw">v ← βv − η∇L(w),</span> &nbsp; <span class="nw">w ← w + v</span> &nbsp;<span class="d">Cauchy’s step with Polyak’s heavy ball (1964) · <span class="nw">η = ${eta}, β = ${beta}</span></span>`
        : `<span class="nw">w ← w − η∇L(w)</span> &nbsp;<span class="d">η = ${eta}</span>`;
    } else {
      h = beta > 0
        ? `<span class="nw">v ← βv − η∇L(w),</span> <span class="nw">w ← w + v</span> &nbsp;<span class="d">on a bowl, stable only while <span class="nw">λ &lt; (2 + 2β)/η</span></span>`
        : `<span class="nw">w ← w − η∇L(w)</span> &nbsp;<span class="d">on a bowl of curvature λ, stable exactly when</span> <span class="v nw">η &lt; 2/λ</span>`;
    }
    mathEl.innerHTML = h;
  }
  function refreshQuest() {
    const q = questText();
    const key = q[0] + '|' + q[1];
    if (key === lastQuest) return;
    lastQuest = key;
    if (q[0] === 'done') quest.done(q[1]); else quest.set(q[1]);
  }
  function questText() {
    const done = (h) => ['done', h], set = (h) => ['set', h];
    if (chapter === 1) {
      if (dataKey === 'separable') {
        if (pc.verdict === 'converged') return done(`Converged after ${pc.total} corrections, well inside the bound of ${bound.toFixed(1)}. Now switch the points to <b>XOR</b> and make the perceptron fail.`);
        else return set('Press <b>▶ learn</b>. Each mistake drags the gold line toward the point it got wrong; its ghosts are its real past states.');
      } else {
        if (pc.cycle) return done('Proved: no line will ever do it, and the machine says so by returning to its own start. Open <b>ii · the bend</b>.');
        else return set('Now make it fail: press <b>▶ learn</b> on XOR and listen to the loop.');
      }
    } else if (chapter === 2) {
      if (net && net.acc === 1 && width >= 2) return done(`${NUMW[width][0].toUpperCase() + NUMW[width].slice(1)} hidden units, ${NUMW[width]} cuts: XOR is solved. The gradient sweep lit the wiring from the output backwards. Open <b>iii · the spirals</b>.`);
      else if (width === 1 && net && net.step >= 300) return set('Stalled at 75%, as the theorem says it must. Step the hidden units up to <b>two</b> and train again.');
      else return set('Train with <b>one</b> hidden unit first, then with two. Hover over the plane to run a forward pass by hand.');
    } else if (chapter === 3) {
      if (hatch && hatch.bothPerfect) return done('Both networks are perfect on the data, and they disagree in the crimson regions. The data did not decide those.');
      else if (hatch) return done('The second network did not get every point right this time; the crimson regions are where the two disagree.');
      else if (net && net.solvedAt != null) return done(`All 194 points on their own side from step ${fmtInt(net.solvedAt)}. Press <b>♬ listen</b>, then ask for a <b>second opinion</b>.`);
      else return set('Press <b>▶ train</b> and watch the boundary wind itself between the arms.');
    } else {
      const thr = beta > 0 ? '(2 + 2β)/η' : '2/η';
      if (edgeTouched) return done(`Measured: the curvature has climbed to meet ${thr}. Keep training and watch it hover there, then change η, reset, and watch it find the new edge.`);
      else if (beta > 0) return set('Momentum is on, so the threshold moves to (2 + 2β)/η. With it this network tends to solve the spirals, and then its curvature relaxes far below the line. Turn momentum off to watch the edge.');
      else return set('Plain descent, no momentum. Press <b>▶ train</b> and watch the sharpest curvature climb toward the dashed line at 2/η.');
    }
  }
  function refreshControls() {
    const isP = mode === 'perceptron';
    const show = (e, v) => e.classList.toggle('lrn-hide', !v);
    btnRun.textContent = (isP ? pc.running : training) ? '❚❚ pause' : isP ? '▶ learn' : '▶ train';
    btnReseed.textContent = isP ? 'new points' : 'another seed';
    show(btnReseed, !(isP && dataKey === 'xor'));
    show(dataSel.el, chapter === 1);
    show(widthStep.el, chapter === 2);
    show(etaSel.el, chapter === 4);
    show(momBtn, chapter === 4);
    show(listenBtn, chapter === 3 || chapter === 2);
    show(turnBtn, (chapter === 3 || chapter === 2) && listening);
    show(lossBtn, chapter >= 2);
    show(secondBtn, chapter === 3);
    show(critBtn, chapter === 3);
    secondBtn.disabled = !(net && dataKey === 'spirals' && net.acc === 1 && !training && !training2);
    bowlWrap.classList.toggle('show', chapter === 4);
    tabs.forEach((t, i) => { t.setAttribute('aria-selected', i + 1 === chapter ? 'true' : 'false'); t.tabIndex = i + 1 === chapter ? 0 : -1; });
    mainEl.setAttribute('aria-labelledby', 'ex-learner-tab-' + chapter);
    plane.canvas.setAttribute('aria-label',
      isP ? `The perceptron’s line on ${dataKey === 'xor' ? 'the four XOR points' : 'forty separable points'}.`
        : `A network’s decision field on ${dataKey === 'xor' ? 'the four XOR points' : 'the two spirals'}; hover, or focus it and use the arrow keys, to run a forward pass.`);
    plane.canvas.tabIndex = isP ? -1 : 0;
  }
  function refreshAll() {
    refreshControls(); refreshReadout(); refreshMath(); refreshQuest();
    planeDirty = sideDirty = rulerDirty = bowlDirty = true;
  }

  /* ---------- actions ---------- */
  function onRun() {
    audio.ensureAudio();
    if (mode === 'perceptron') {
      if (pc.running) { pc.running = false; refreshAll(); return; }
      if (pc.verdict === 'converged' || pc.verdict === 'cycle-stopped') pcReset();
      pc.running = true;
      pc.nextAt = clock() + 0.05;
      refreshAll();
      return;
    }
    if (training) { stopTraining(); return; }
    if (!net || !Number.isFinite(net.loss) || net.step >= maxSteps() || (dataKey === 'xor' && net.acc === 1 && net.loss < 0.02)) buildNet();
    stopSecond(true);
    training = true;
    refreshAll();
  }
  function onStep() {
    audio.ensureAudio();
    if (mode === 'perceptron') {
      pc.running = false;
      if (pc.verdict === 'converged' || pc.verdict === 'cycle-stopped') pcReset();
      pcVisitOne(clock());
      refreshAll();
      return;
    }
    stopTraining();
    trainNet(net, 1);
    net.lam = powerStep(net.L, net.theta, pts, net.v); net.lamH.push(net.step, net.lam);
    waveDirty = true;
    refreshAll();
  }
  function onReset() {
    if (mode === 'perceptron') { pcReset(); refreshAll(); return; }
    buildNet();
  }
  function onReseed() {
    if (mode === 'perceptron') {
      sepSeed = (sepSeed % 9) + 1;
      pts = separable(sepSeed); bound = novikoffBound(pts, SEP_U);
      pcReset(); refreshAll(); return;
    }
    if (dataKey === 'xor') xorSeed = (xorSeed % 8) + 1; else spSeed = (spSeed % 6) + 1;
    buildNet();
  }
  function setPerceptronData(v) {
    dataKey = v;
    if (v === 'xor') { pts = xorData(); E = 1.7; } else { pts = separable(sepSeed); E = 1.25; bound = novikoffBound(pts, SEP_U); }
    pcReset();
    refreshAll();
  }

  function setChapter(n) {
    if (n === chapter && mode) { /* re-entering resets nothing */ }
    stopTraining(); stopSecond(true);
    pc.running = false;
    chapter = n;
    if (listening && n !== 3 && n !== 2) setListen(false);
    if (hearingLoss && n === 1) setHearLoss(false);
    scanCustom = null; scanA = 0; spectrum = null; hover = null;
    if (n === 1) {
      mode = 'perceptron';
      setPerceptronData(dataSel.value);
    } else {
      mode = 'network';
      if (n === 2) { dataKey = 'xor'; pts = xorData(); E = 1.7; eta = 0.5; beta = 0.9; }
      else if (n === 3) { dataKey = 'spirals'; pts = spiralsScaled(); E = 1.2; eta = 0.3; beta = 0.9; }
      else { dataKey = 'spirals'; pts = spiralsScaled(); E = 1.2; eta = parseFloat(etaSel.value); beta = momBtn.getAttribute('aria-pressed') === 'true' ? 0.9 : 0; }
      buildNet();
    }
    refreshAll();
    layout(true);
    if (listening) refreshWave(true);
  }

  /* ---------- pointer ---------- */
  function knobAt(sx, sy) {
    if (!listening || mode !== 'network') return -1;
    const [x0, y0, x1, y1] = scanPts();
    if (Math.hypot(sx - X(x0), sy - Y(y0)) < 16) return 0;
    if (Math.hypot(sx - X(x1), sy - Y(y1)) < 16) return 1;
    return -1;
  }
  let pendingHover = null;
  listen(plane.canvas, 'pointerdown', (e) => {
    const [sx, sy] = cv.pointerPos(plane, e);
    const k = knobAt(sx, sy);
    if (k >= 0) {
      drag = { k };
      scanCustom = scanPts().slice();
      plane.canvas.classList.add('dragging');
      try { plane.canvas.setPointerCapture(e.pointerId); } catch { /* ok */ }
      e.preventDefault();
    } else {
      pendingHover = [sx, sy];            // a tap probes the network too (touch has no hover)
    }
  });
  listen(plane.canvas, 'pointermove', (e) => {
    const [sx, sy] = cv.pointerPos(plane, e);
    if (drag) {
      const [wx, wy] = toWorld(sx, sy);
      const lim = E * 0.97;
      scanCustom[2 * drag.k] = clamp(wx, -lim, lim);
      scanCustom[2 * drag.k + 1] = clamp(wy, -lim, lim);
      waveDirty = true; planeDirty = true;
      return;
    }
    plane.canvas.style.cursor = knobAt(sx, sy) >= 0 ? 'grab' : 'crosshair';
    pendingHover = [sx, sy];
  });
  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    plane.canvas.classList.remove('dragging');
    try { plane.canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }
    refreshWave(true);
  };
  listen(plane.canvas, 'pointerup', endDrag);
  listen(plane.canvas, 'pointercancel', endDrag);
  listen(plane.canvas, 'pointerleave', () => { if (!drag) { hover = null; pendingHover = null; planeDirty = sideDirty = true; } });
  // Keyboard path for the probe: arrow keys walk it across the plane, Escape lifts it.
  listen(plane.canvas, 'keydown', (e) => {
    if (mode !== 'network' || !net) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === 'Escape') { hover = null; planeDirty = sideDirty = true; return; }
    if (!d) return;
    e.preventDefault();
    const stepPx = plane.width / (e.shiftKey ? 8 : 32);
    const sx = hover ? hover.sx : plane.width / 2, sy = hover ? hover.sy : plane.height / 2;
    pendingHover = [clamp(sx + d[0] * stepPx, 4, plane.width - 4), clamp(sy + d[1] * stepPx, 4, plane.height - 4)];
  });
  listen(plane.canvas, 'blur', () => { if (!drag) { hover = null; planeDirty = sideDirty = true; } });
  function applyHover() {
    if (!pendingHover) return;
    const [sx, sy] = pendingHover; pendingHover = null;
    if (mode !== 'network' || !net) { hover = null; return; }
    const [x, y] = toWorld(sx, sy);
    const acts = makeActs(net.L);
    const q = mlpForward(net.L, net.theta, x, y, acts);
    hover = { sx, sy, x, y, q, acts };
    planeDirty = sideDirty = true;
  }

  /* ---------- the loop ---------- */
  function frame() {
    frameNo++;
    const now = clock();
    if (mode === 'perceptron' && pc.running) pcAdvance(now);
    if (training && net) trainFrame();
    if (training2 && net2) secondFrame();
    updateFields();
    applyHover();
    if (hover && training && net) {
      hover.q = mlpForward(net.L, net.theta, hover.x, hover.y, hover.acts);
    }
    if (listening) refreshWave(false);
    const pnow = performance.now();
    if (textDue && (pnow - lastTextAt > 250 || !(training || training2))) {
      textDue = false; lastTextAt = pnow;
      refreshReadout(); refreshQuest();
      if (!training && !training2) refreshControls();
    }
    if (mode === 'perceptron' && now < animUntil) planeDirty = true;
    if (training && !REDUCED) sideDirty = true;
    if (planeDirty) drawPlane(now);
    if (sideDirty) drawSide(now);
    if (chapter === 4) {
      if (training) bowlDirty = true;
      drawBowl(performance.now() / 1000);
    }
    if (rulerDirty) drawRuler();
  }
  const loop = cv.rafLoop(frame);

  // first paint
  layout(true);
  setChapter(1);
  restartBowl();
  loop.start();

  let wasTraining = false;
  return {
    pause() {
      loop.stop();
      wasTraining = training;
      training = false;
      pc.running = false;
      if (listening) setListen(false);
      if (hearingLoss) setHearLoss(false);
      bus.mute();
    },
    resume() {
      bus.unmute();
      if (wasTraining && mode === 'network' && net) { training = true; wasTraining = false; }
      refreshAll();
      loop.start();
    },
    destroy() {
      loop.stop();
      training = false; pc.running = false;
      scanVoiceOff(); lossVoiceOff();
      ro.disconnect();
      for (const f of cleanups) f();
      bus.dispose();
      stage.innerHTML = '';
    },
  };
}
