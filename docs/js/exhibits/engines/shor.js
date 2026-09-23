// IV·7 — The Period Engine
// Shor's algorithm in miniature, computed honestly: the multiplicative orbit of
// a mod N (the circle of fifths' multiplicative twin), the counting register of
// Q = 2^L slots (N² ≤ Q < 2N²), the comb left when the second register is
// observed, the real radix-2 Fourier transform of that comb (layer by layer),
// measurements sampled from the exact output law, and Euclid's continued
// fraction reading the period r off c/Q — then gcd(a^{r/2} ± 1, N).
//
// This is a CLASSICAL simulation: it stores all Q amplitudes, so it shows the
// mechanism, not a speed-up. Every sound is a number on screen: the register is
// clocked at F = 1760 slots per second, so a comb of spacing r buzzes at F/r Hz,
// a measurement c sounds at F·c/Q, and the beat against a convergent d/r is
// F·|c/Q − d/r| ≤ F/(2Q) — Shor's bound (5.13), made audible.
//
// Sources for every number are in `sources` and in the verification notes of
// the build; anchors are asserted in _test.selfTest().

import { convergents as cfConvergents } from '../../core/math.js';

/* =========================================================================
   Pure computational core (no DOM) — exported through _test.
   ========================================================================= */

const F_SLOT = 1760; // register slots per second (the audio clock of the comb)

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// a^e mod N by square-and-multiply; exact while N < 2^26.
function modPow(a, e, N) {
  let r = 1 % N, b = ((a % N) + N) % N;
  while (e > 0) {
    if (e & 1) r = (r * b) % N;
    b = (b * b) % N;
    e = Math.floor(e / 2);
  }
  return r;
}

// The orbit 1, a, a², … up to (not including) the return to 1; null if a is not a unit.
function orbit(a, N) {
  if (gcd(a, N) !== 1) return null;
  const out = [1 % N];
  let y = a % N;
  while (y !== 1 % N) {
    out.push(y);
    y = (y * a) % N;
    if (out.length > N) return null;
  }
  return out;
}
function order(a, N) { const o = orbit(a, N); return o ? o.length : 0; }

function isPrimePower(n) {
  if (n < 2) return false;
  for (let p = 2; p * p <= n; p++) {
    if (n % p === 0) { while (n % p === 0) n /= p; return n === 1; }
  }
  return true; // a prime is p¹
}
// Shor's filter: odd, composite, not a prime power (those are split classically).
// The page keeps N ≤ 127 so that Q ≤ 16384.
function isValidModulus(N) {
  return Number.isInteger(N) && N >= 15 && N <= 127 && N % 2 === 1 && !isPrimePower(N);
}
function validModuli(max = 127) {
  const out = [];
  for (let n = 15; n <= max; n++) if (isValidModulus(n)) out.push(n);
  return out;
}

// Q = 2^L with N² ≤ Q < 2N² (Shor §5).
function registerSize(N) { let Q = 1; while (Q < N * N) Q *= 2; return Q; }
function log2int(Q) { let L = 0; while ((1 << L) < Q) L++; return L; }

// M_k = #{x in [0, Q) : x ≡ k (mod r)}.
function cosetSize(k, r, Q) { return Math.floor((Q - k - 1) / r) + 1; }

// |Σ_{b<M} e^{2πi b r c/Q}|² — exact integer test for rc ≡ 0 (mod Q) first.
function kernel(M, r, c, Q) {
  const rho = (r * c) % Q;
  if (rho === 0) return M * M;
  const t = rho / Q;
  const s1 = Math.sin(Math.PI * M * t), s2 = Math.sin(Math.PI * t);
  return (s1 * s1) / (s2 * s2);
}

// The exact marginal law of the counting register (Shor 1997, eq. 5.7), in the
// two-kernel form: only the coset sizes q and q+1 occur (Q = q·r + s).
function shorDistribution(r, Q) {
  const P = new Float64Array(Q);
  const q = Math.floor(Q / r), s = Q - q * r;
  for (let c = 0; c < Q; c++) {
    P[c] = (s * kernel(q + 1, r, c, Q) + (r - s) * kernel(q, r, c, Q)) / (Q * Q);
  }
  return P;
}

// The law of c given that the second register was observed as a^k.
function condDistribution(k, r, Q) {
  const M = cosetSize(k, r, Q);
  const P = new Float64Array(Q);
  for (let c = 0; c < Q; c++) P[c] = kernel(M, r, c, Q) / (Q * M);
  return P;
}

// Radix-2 in-place FFT, decimation in time, the QFT's sign e^{+2πi xc/Q}, unnormalized.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      const h = len >> 1;
      for (let j = 0; j < h; j++) {
        const ar = re[i + j + h], ai = im[i + j + h];
        const vr = ar * cr - ai * ci, vi = ar * ci + ai * cr;
        re[i + j + h] = re[i + j] - vr; im[i + j + h] = im[i + j] - vi;
        re[i + j] += vr; im[i + j] += vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// The QFT (Shor's A_Q) of the comb k, k+r, k+2r, … with amplitudes 1/√M_k.
function qftComb(k, r, Q) {
  const re = new Float64Array(Q), im = new Float64Array(Q);
  const M = cosetSize(k, r, Q), amp = 1 / Math.sqrt(M);
  for (let x = k; x < Q; x += r) re[x] = amp;
  fft(re, im);
  const s = 1 / Math.sqrt(Q);
  for (let c = 0; c < Q; c++) { re[c] *= s; im[c] *= s; }
  return { re, im, M };
}

function bitReverse(i, L) { let r = 0; for (let b = 0; b < L; b++) { r = (r << 1) | (i & 1); i >>= 1; } return r; }

// The same transform as L unitary butterfly layers (decimation in frequency,
// each butterfly scaled by 1/√2), keeping |amplitude|² after every layer. Like
// Shor's circuit, the last layer leaves the answer in bit-reversed order; the
// final snapshot reads the bits backwards. Returns { stages, re, im }.
function qftStages(re0, im0) {
  const n = re0.length, L = log2int(n);
  const re = Float64Array.from(re0), im = im0 ? Float64Array.from(im0) : new Float64Array(n);
  const tr = new Float64Array(n >> 1 || 1), ti = new Float64Array(n >> 1 || 1);
  for (let j = 0; j < n >> 1; j++) { tr[j] = Math.cos(2 * Math.PI * j / n); ti[j] = Math.sin(2 * Math.PI * j / n); }
  const mag = () => { const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = re[i] * re[i] + im[i] * im[i]; return m; };
  const stages = [mag()];
  const s = Math.SQRT1_2;
  for (let len = n; len >= 2; len >>= 1) {
    const h = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < h; j++) {
        const a = i + j, b = a + h;
        const ur = re[a], ui = im[a], vr = re[b], vi = im[b];
        re[a] = (ur + vr) * s; im[a] = (ui + vi) * s;
        const dr = (ur - vr) * s, di = (ui - vi) * s;
        const wr = tr[j * step], wi = ti[j * step];
        re[b] = dr * wr - di * wi; im[b] = dr * wi + di * wr;
      }
    }
    stages.push(mag());
  }
  const oRe = new Float64Array(n), oIm = new Float64Array(n);
  for (let c = 0; c < n; c++) { const b = bitReverse(c, L); oRe[c] = re[b]; oIm[c] = im[b]; }
  for (let c = 0; c < n; c++) { re[c] = oRe[c]; im[c] = oIm[c]; }
  stages.push(mag());
  return { stages, re, im };
}

// f(x) = a^x mod N for every slot of the register.
function registerValues(a, N, Q) {
  const v = new Uint8Array(Q);
  let y = 1 % N;
  for (let x = 0; x < Q; x++) { v[x] = y; y = (y * a) % N; }
  return v;
}
// The first register after the second is observed as y: amplitude 1/√M on {x : f(x) = y}.
function combFor(values, y) {
  const Q = values.length;
  let M = 0;
  for (let x = 0; x < Q; x++) if (values[x] === y) M++;
  const re = new Float64Array(Q), amp = M ? 1 / Math.sqrt(M) : 0;
  for (let x = 0; x < Q; x++) if (values[x] === y) re[x] = amp;
  return { re, M };
}

// Exact continued fraction of c/Q by Euclid's algorithm, with the ladder
// [dividend, quotient, divisor, remainder] of each division.
function cfOfRatio(c, Q) {
  const terms = [], ladder = [];
  let a = c, b = Q;
  while (b > 0) {
    const q = Math.floor(a / b), rem = a % b;
    terms.push(q); ladder.push([a, q, b, rem]);
    a = b; b = rem;
  }
  return { terms, ladder };
}

// Any exponent e with a^e ≡ 1 is a multiple of the order: divide out primes
// while the power still returns to 1, and what is left is the order itself.
function leastExponent(a, e, N) {
  let R = e;
  for (let p = 2; p <= R; p++) {
    while (R % p === 0 && modPow(a, R / p, N) === 1 % N) R /= p;
  }
  return R;
}

// Shor's classical post-processing, textbook form: take the last convergent
// p/q of c/Q with q < N and test a^q ≡ 1 (mod N). A shot that lands between
// the peaks can name a multiple of the period (2¹² ≡ 1 mod 15 from c = 21 of
// 256, where the period is 4), so an accepted q is cut down to the least
// exponent; `found` keeps what the fraction said and `reduced` flags the cut.
function recoverPeriod(c, Q, N, a) {
  const { terms, ladder } = cfOfRatio(c, Q);
  const conv = cfConvergents(terms);
  let pick = 0;
  conv.forEach(([, q], i) => { if (q < N) pick = i; });
  const cand = conv[pick];
  const residue = modPow(a, cand[1], N);
  const ok = cand[1] > 0 && residue === 1 % N;
  const r = ok ? leastExponent(a, cand[1], N) : 0;
  return { c, Q, terms, ladder, conv, pick, cand, residue, r, found: ok ? cand[1] : 0, reduced: ok && r !== cand[1] };
}

// Shor's advice when d and r share a factor: also try 2q, 3q, … (below N).
// When the candidate q divides r (a real peak), the first hit is r itself. With
// an undersized register q need not divide r, so a hit is only a multiple of the
// order, and it is cut down to the least exponent.
function tryMultiples(a, q, N, maxMult = 12) {
  const tried = [];
  if (q < 1) return { r: 0, tried };
  for (let m = 2; m <= maxMult && m * q < N; m++) {
    const res = modPow(a, m * q, N);
    tried.push({ m, e: m * q, res });
    if (res === 1 % N) {
      const found = m * q, R = leastExponent(a, found, N);
      return { r: R, m, found, reduced: R !== found, tried };
    }
  }
  return { r: 0, tried };
}

// Miller's reduction as Shor gives it: gcd(a^{r/2} ± 1, N).
function factorFromPeriod(a, r, N) {
  if (!r) return { ok: false, why: 'no period' };
  if (r % 2) return { ok: false, why: 'odd period' };
  const h = modPow(a, r / 2, N);
  if (h === N - 1) return { ok: false, why: 'a^(r/2) ≡ −1', h };
  if (h === 1 % N) return { ok: false, why: 'a^(r/2) ≡ 1', h }; // r was not the least exponent
  const f1 = gcd(h - 1, N), f2 = gcd(h + 1, N);
  return { ok: f1 > 1 && f1 < N, h, f1, f2 };
}

// The Bristol (2012) escape for a square base with odd order: a = b², so
// (b^r)² = a^r ≡ 1 and h = b^r splits N unless h ≡ ±1.
function squareRootSplit(a, r, N) {
  if (!r || r % 2 === 0) return null;
  const b = Math.round(Math.sqrt(a));
  if (b * b !== a) return null;
  const h = modPow(b, r, N);
  if (h === 1 || h === N - 1) return null;
  return { b, h, f1: gcd(h - 1, N), f2: gcd(h + 1, N) };
}

// For each outcome c: does one textbook shot (no multiples) yield r?
function successMask(a, N, Q) {
  const r = order(a, N);
  const m = new Uint8Array(Q);
  for (let c = 0; c < Q; c++) m[c] = recoverPeriod(c, Q, N, a).r === r ? 1 : 0;
  return m;
}
// Exact probability that one run of the textbook pipeline returns r.
function shotSuccess(a, N, Q = registerSize(N)) {
  const r = order(a, N);
  const P = shorDistribution(r, Q);
  const m = successMask(a, N, Q);
  let s = 0;
  for (let c = 0; c < Q; c++) if (m[c]) s += P[c];
  return s;
}
function totient(n) { let t = 0; for (let i = 1; i <= n; i++) if (gcd(i, n) === 1) t++; return t; }

// The r likeliest outcomes: round(jQ/r) — a maximally even rhythm E(r, Q).
function peakCentres(r, Q) { const out = []; for (let j = 0; j < r; j++) out.push(Math.round(j * Q / r) % Q); return out; }
function euclidOnsets(r, Q) { const s = []; for (let i = 0; i < r; i++) s.push(Math.floor(i * Q / r)); return s; }
function isRotation(A, B, Q) {
  const setB = new Set(B.map((x) => ((x % Q) + Q) % Q));
  if (setB.size !== new Set(A).size) return false;
  for (const s of B) {
    const shift = s - A[0];
    if (A.every((x) => setB.has((((x + shift) % Q) + Q) % Q))) return true;
  }
  return false;
}

// Inverse-CDF sampling: the first index whose cumulative weight exceeds u·total.
function sampleIndex(P, u) {
  let tot = 0;
  for (let i = 0; i < P.length; i++) tot += P[i];
  let acc = 0;
  const target = u * tot;
  for (let i = 0; i < P.length; i++) { acc += P[i]; if (acc > target) return i; }
  return P.length - 1;
}

// Euclid's carving of a c × Q rectangle into squares, as runs: level i holds
// terms[i+1] squares of one side. Units: the rectangle is Q wide and c tall.
function euclidRuns(c, Q) {
  const runs = [];
  let x = 0, y = 0, w = Q, h = c, level = 0;
  while (w > 0 && h > 0) {
    if (w >= h) { const n = Math.floor(w / h); runs.push({ level, n, side: h, x, y, dir: 'x' }); x += n * h; w -= n * h; }
    else { const n = Math.floor(h / w); runs.push({ level, n, side: w, x, y, dir: 'y' }); y += n * w; h -= n * w; }
    level++;
  }
  return runs;
}

// The comb as sound: one Hann pulse of H samples per occupied slot, DC removed
// (the ear cannot hear the c = 0 line). Looping it is the Q-periodic extension
// that the discrete Fourier transform assumes.
function combPulseTrain(occ, H) {
  const Q = occ.length, out = new Float32Array(Q * H);
  const win = new Float32Array(H);
  for (let i = 0; i < H; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / H);
  let sum = 0;
  for (let x = 0; x < Q; x++) {
    if (!occ[x]) continue;
    const o = x * H;
    for (let i = 0; i < H; i++) { out[o + i] = win[i]; sum += win[i]; }
  }
  const mean = sum / out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  return out;
}
const combPitch = (r, F = F_SLOT) => F / r;
const toneOf = (c, Q, F = F_SLOT) => F * c / Q;
const beatHz = (c, Q, p, q, F = F_SLOT) => Math.abs(F * (c / Q - p / q));

// Roetteler, Naehrig, Svore & Lauter (2017): at most 9n + 2⌈log₂ n⌉ + 10 logical qubits.
const eccQubits = (n) => 9 * n + 2 * Math.ceil(Math.log2(n)) + 10;

function selfTest() {
  const eq = (x, y, msg) => { if (JSON.stringify(x) !== JSON.stringify(y)) throw new Error(`${msg}: got ${JSON.stringify(x)}, want ${JSON.stringify(y)}`); };
  const near = (x, y, tol, msg) => { if (!(Math.abs(x - y) <= tol)) throw new Error(`${msg}: got ${x}, want ${y}`); };

  // orders and orbits
  eq([order(7, 15), order(11, 15), order(2, 15), order(14, 15), order(2, 21), order(4, 21), order(5, 33), order(2, 13)],
    [4, 2, 4, 2, 6, 3, 10, 12], 'orders');
  eq(orbit(7, 15), [1, 7, 4, 13], 'orbit 7 mod 15');
  eq(orbit(2, 21), [1, 2, 4, 8, 16, 11], 'orbit 2 mod 21');
  eq(orbit(5, 33), [1, 5, 25, 26, 31, 23, 16, 14, 4, 20], 'orbit 5 mod 33');
  eq(orbit(2, 13), [1, 2, 4, 8, 3, 6, 12, 11, 9, 5, 10, 7], 'orbit 2 mod 13');
  // Vandersypen et al. 2001: a = 2, 7, 8, 13 have a⁴ ≡ 1; a = 4, 11, 14 have a² ≡ 1 (mod 15)
  eq([2, 4, 7, 8, 11, 13, 14].map((x) => order(x, 15)), [4, 2, 4, 4, 2, 4, 2], 'orders mod 15');
  eq(orbit(6, 15), null, 'non-unit has no orbit');

  // the lock filter
  const V = validModuli(127);
  eq(V.slice(0, 8), [15, 21, 33, 35, 39, 45, 51, 55], 'valid moduli');
  if (V.includes(25) || V.includes(27) || V.includes(121) || V.includes(125) || V.includes(22)) throw new Error('filter admits a prime power or an even number');

  // register sizes
  eq([15, 21, 33, 35, 91, 127].map(registerSize), [256, 512, 2048, 2048, 16384, 16384], 'registerSize');

  // coset sizes (Q = 256, r = 10): 26 ×6 then 25 ×4
  eq(Array.from({ length: 10 }, (_, k) => cosetSize(k, 10, 256)), [26, 26, 26, 26, 26, 26, 25, 25, 25, 25], 'coset sizes');

  // historical distributions
  eq(Array.from(shorDistribution(4, 8)).map((p) => +p.toFixed(12)), [0.25, 0, 0.25, 0, 0.25, 0, 0.25, 0], 'IBM 2001, a = 7');
  eq(Array.from(shorDistribution(2, 8)).map((p) => +p.toFixed(12)), [0.5, 0, 0, 0, 0.5, 0, 0, 0], 'IBM 2001, a = 11');
  eq(Array.from(shorDistribution(3, 4)).map((p) => +p.toFixed(12)), [0.375, 0.25, 0.125, 0.25], 'Bristol 2012');
  const P10 = shorDistribution(10, 256);
  near(P10[0] * 65536, 6556, 1e-8, 'Fig. 5.1 P(0)');
  near(P10[128] * 65536, 6556, 1e-8, 'Fig. 5.1 P(128)');
  near(P10.reduce((s, v) => s + v, 0), 1, 1e-12, 'Fig. 5.1 total');
  const maxima = [];
  for (let c = 0; c < 256; c++) if (P10[c] > P10[(c + 255) % 256] && P10[c] > P10[(c + 1) % 256]) maxima.push(c);
  eq(maxima, [0, 26, 51, 77, 102, 128, 154, 179, 205, 230], 'Fig. 5.1 peaks');
  eq(maxima, peakCentres(10, 256), 'peaks are round(jQ/r)');

  // the FFT, the butterfly layers and the closed forms agree
  for (const [r, Q] of [[10, 256], [6, 512], [4, 256], [3, 4], [10, 2048]]) {
    const marg = shorDistribution(r, Q);
    const acc = new Float64Array(Q);
    for (let k = 0; k < r; k++) {
      const { re, im, M } = qftComb(k, r, Q);
      const cond = condDistribution(k, r, Q);
      const occ = new Float64Array(Q); for (let x = k; x < Q; x += r) occ[x] = 1 / Math.sqrt(M);
      const st = qftStages(occ);
      for (let c = 0; c < Q; c++) {
        const p = re[c] * re[c] + im[c] * im[c];
        near(p, cond[c], 1e-12, `FFT vs closed form (r=${r}, Q=${Q}, k=${k}, c=${c})`);
        near(st.re[c], re[c], 1e-12, `butterflies vs FFT re (r=${r}, Q=${Q})`);
        near(st.im[c], im[c], 1e-12, `butterflies vs FFT im (r=${r}, Q=${Q})`);
        acc[c] += (M / Q) * p;
      }
      const last = st.stages[st.stages.length - 1];
      let tot = 0; for (let c = 0; c < Q; c++) tot += last[c];
      near(tot, 1, 1e-6, 'unitary layers keep total probability (float32 snapshots)');
    }
    for (let c = 0; c < Q; c++) near(acc[c], marg[c], 1e-12, `marginal (r=${r}, Q=${Q})`);
  }
  // the page's comb (from real values of a^x mod N) equals the textbook comb
  {
    const vals = registerValues(7, 15, 256);
    const { re, M } = combFor(vals, 13);
    if (M !== 64 || re[3] === 0 || re[7] === 0 || re[4] !== 0) throw new Error('comb for 7^x mod 15 = 13');
  }

  // continued fractions and period recovery
  const R = (c, Q, N, a) => recoverPeriod(c, Q, N, a);
  let t = R(77, 256, 33, 5);
  eq(t.terms, [0, 3, 3, 12, 2], 'cf 77/256');
  eq(t.conv, [[0, 1], [1, 3], [3, 10], [37, 123], [77, 256]], 'convergents 77/256');
  eq([t.cand, t.r], [[3, 10], 10], 'recover 77/256');
  eq(t.ladder, [[77, 0, 256, 77], [256, 3, 77, 25], [77, 3, 25, 2], [25, 12, 2, 1], [2, 2, 1, 0]], 'Euclid ladder 77/256');
  t = R(26, 256, 33, 5); eq([t.terms, t.cand, t.r], [[0, 9, 1, 5, 2], [1, 10], 10], 'recover 26/256');
  t = R(51, 256, 33, 5); eq([t.terms, t.cand, t.r, t.residue], [[0, 5, 51], [1, 5], 0, 23], 'recover 51/256 fails');
  eq(tryMultiples(5, 5, 33).r, 10, 'multiples rescue 51/256');
  eq(tryMultiples(5, 5, 33).reduced, false, 'a true divisor needs no reduction');
  eq([tryMultiples(4, 4, 21).found, tryMultiples(4, 4, 21).r], [12, 3], 'undersized register: 4¹² ≡ 1 reduces to 4³ ≡ 1');
  eq(factorFromPeriod(4, 6, 21).why, 'a^(r/2) ≡ 1', 'a non-minimal exponent is refused');
  t = R(128, 256, 33, 5); eq([t.cand, t.r], [[1, 2], 0], 'recover 128/256 fails');
  t = R(85, 512, 21, 2); eq([t.terms, t.cand, t.r], [[0, 6, 42, 2], [1, 6], 6], 'recover 85/512');
  t = R(427, 512, 21, 2); eq([t.terms, t.cand, t.r], [[0, 1, 5, 42, 2], [5, 6], 6], 'recover 427/512');
  t = R(171, 512, 21, 2); eq([t.cand, t.r, t.residue], [[1, 3], 0, 8], 'recover 171/512 fails');
  t = R(192, 256, 15, 7); eq([t.terms, t.cand, t.r], [[0, 1, 3], [3, 4], 4], 'recover 192/256');
  t = R(64, 256, 15, 7); eq([t.cand, t.r], [[1, 4], 4], 'recover 64/256');
  t = R(6, 8, 15, 7); eq([t.cand, t.r], [[3, 4], 4], 'IBM 2001 readout 6 of 8');
  t = R(3, 4, 21, 4); eq([t.cand, t.r, t.residue], [[3, 4], 0, 4], 'two bits cannot resolve thirds');
  for (const c of [0, 1, 2, 3]) if (R(c, 4, 21, 4).r) throw new Error('Bristol register should never recover r');

  // the split
  const F = (a, r, N) => factorFromPeriod(a, r, N);
  eq([F(7, 4, 15).h, F(7, 4, 15).f1, F(7, 4, 15).f2], [4, 3, 5], 'split 15 with 7');
  eq([F(11, 2, 15).f1, F(11, 2, 15).f2], [5, 3], 'split 15 with 11');
  eq([F(2, 6, 21).h, F(2, 6, 21).f1, F(2, 6, 21).f2], [8, 7, 3], 'split 21 with 2');
  eq([F(5, 10, 33).h, F(5, 10, 33).f1, F(5, 10, 33).f2], [23, 11, 3], 'split 33 with 5');
  eq([F(2, 12, 91).h, F(2, 12, 91).f1, F(2, 12, 91).f2], [64, 7, 13], 'split 91 with 2');
  eq([F(14, 2, 15).ok, F(14, 2, 15).why], [false, 'a^(r/2) ≡ −1'], '14 mod 15 fails');
  eq([F(4, 3, 21).ok, F(4, 3, 21).why], [false, 'odd period'], '4 mod 21 fails');
  const sq = squareRootSplit(4, 3, 21);
  eq([sq.b, sq.h, sq.f1, sq.f2], [2, 8, 7, 3], 'Bristol: 2³ = 8, gcd(7, 21), gcd(9, 21)');

  // a shot between the peaks can name a multiple of the period; it is cut down to the order
  t = R(21, 256, 15, 2); eq([t.cand, t.found, t.r, t.reduced], [[1, 12], 12, 4, true], '2¹² ≡ 1 mod 15 names a multiple of r = 4');
  for (const [N, a] of [[15, 2], [15, 7], [21, 2], [21, 5], [33, 5], [35, 2]]) {
    const Q = registerSize(N), ro = order(a, N);
    for (let c = 0; c < Q; c++) { const x = R(c, Q, N, a); if (x.r && x.r !== ro) throw new Error(`recoverPeriod named ${x.r}, not the order ${ro} (${a} mod ${N}, c = ${c})`); }
  }

  // exact single-shot success of the textbook pipeline (last convergent below N, then a^q ≡ 1)
  near(shotSuccess(7, 15, 256), 0.5, 1e-12, 'success 7 mod 15');
  near(shotSuccess(2, 21, 512), 0.321079, 5e-7, 'success 2 mod 21');
  near(shotSuccess(5, 33, 2048), 0.391452, 5e-7, 'success 5 mod 33');
  for (const [a, N] of [[7, 15], [2, 21], [5, 33]]) {
    const r = order(a, N);
    if (shotSuccess(a, N) < totient(r) / (3 * r)) throw new Error(`Shor's bound φ(r)/3r fails for ${a} mod ${N}`);
  }

  // theorem: a peak within 1/(2Q) of d/r (r < N) always shows d/r as a convergent
  for (let N = 3; N <= 24; N++) {
    const Q = registerSize(N);
    for (let r = 1; r < N; r++) for (let d = 0; d < r; d++) {
      for (let c = 0; c < Q; c++) {
        if (Math.abs(2 * (c * r - d * Q)) > r) continue; // |c/Q − d/r| ≤ 1/(2Q)
        const g = gcd(d, r), dd = d / g, rr = r / g;
        const conv = cfConvergents(cfOfRatio(c, Q).terms);
        if (!conv.some(([p, q]) => p === dd && q === rr)) throw new Error(`peak ${c}/${Q} misses ${dd}/${rr}`);
      }
    }
  }
  // peak centres are E(r, Q) up to rotation; sharp peaks iff r is a power of 2 (Sixty's rule in base 2)
  for (const Q of [8, 256, 512, 2048]) for (let r = 1; r <= Math.min(32, Q); r++) {
    if (!isRotation(peakCentres(r, Q), euclidOnsets(r, Q), Q)) throw new Error(`E(${r},${Q}) rotation`);
  }
  for (let r = 1; r <= 32; r++) {
    const P = shorDistribution(r, 1024);
    let off = 0; for (let c = 0; c < 1024; c++) if ((c * r) % 1024 !== 0) off += P[c];
    const pow2 = (r & (r - 1)) === 0;
    if (pow2 !== (off < 1e-12)) throw new Error(`sharpness at r = ${r}`);
  }

  // the r likeliest outcomes are exactly the peak centres round(jQ/r)
  for (const [r, Q] of [[3, 8], [10, 256], [6, 512], [12, 2048], [126, 16384]]) {
    const P = shorDistribution(r, Q);
    const top = Array.from(P.keys()).sort((i, j) => P[j] - P[i]).slice(0, r).sort((i, j) => i - j);
    eq(top, peakCentres(r, Q).slice().sort((i, j) => i - j), `likeliest outcomes (r=${r}, Q=${Q})`);
  }
  // an independent naive sum over the comb agrees with the closed form
  for (const [r, Q] of [[5, 32], [7, 128]]) {
    const P = shorDistribution(r, Q);
    for (let c = 0; c < Q; c++) {
      let s = 0;
      for (let k = 0; k < r; k++) {
        let re = 0, im = 0;
        for (let x = k; x < Q; x += r) { const th = 2 * Math.PI * ((x * c) % Q) / Q; re += Math.cos(th); im += Math.sin(th); }
        s += re * re + im * im;
      }
      near(P[c], s / (Q * Q), 1e-12, `naive sum (r=${r}, Q=${Q}, c=${c})`);
    }
  }
  // for odd N the two gcds multiply back to N
  for (const N of validModuli(63)) for (let x = 2; x < N; x++) {
    if (gcd(x, N) !== 1) continue;
    const f = factorFromPeriod(x, order(x, N), N);
    if (f.ok && f.f1 * f.f2 !== N) throw new Error(`split of ${N} by ${x}`);
  }

  // Euclid's carving matches the continued fraction and fills the rectangle
  eq(euclidRuns(77, 256).map((u) => u.n), [3, 3, 12, 2], 'carving 77 × 256');
  eq(euclidRuns(77, 256).reduce((s, u) => s + u.n * u.side * u.side, 0), 77 * 256, 'carving area');

  // sound arithmetic
  near(combPitch(4), 440, 1e-12, 'comb pitch r = 4');
  near(combPitch(10), 176, 1e-12, 'comb pitch r = 10');
  near(beatHz(77, 256, 3, 10), 1.375, 1e-12, 'beat 77/256 vs 3/10');
  near(F_SLOT / (2 * 256), 3.4375, 1e-12, 'Shor bound as a beat');
  near(beatHz(192, 256, 3, 4), 0, 1e-12, 'unison when r is a power of 2');
  near(toneOf(77, 256), 529.375, 1e-9, 'measured tone 77/256');
  const pt = combPulseTrain(Uint8Array.from([1, 0, 0, 0, 1, 0, 0, 0]), 10);
  if (pt.length !== 80 || Math.abs(pt.reduce((s, v) => s + v, 0)) > 1e-4) throw new Error('pulse train');
  const flat = combPulseTrain(new Uint8Array(8).fill(1), 10);
  if (Math.max(...flat.map(Math.abs)) > 0.6) throw new Error('uniform register should be nearly flat');

  // sampling and resource arithmetic
  eq([sampleIndex([0, 0, 1, 0], 0.5), sampleIndex([0.5, 0.5], 0.49), sampleIndex([0.5, 0.5], 0.51)], [2, 0, 1], 'inverse CDF');
  eq(eccQubits(256), 2330, 'Roetteler et al. at n = 256');
  return true;
}

export const _test = {
  gcd, modPow, orbit, order, isPrimePower, isValidModulus, validModuli, registerSize, cosetSize,
  kernel, shorDistribution, condDistribution, fft, qftComb, qftStages, registerValues, combFor,
  cfOfRatio, convergents: cfConvergents, leastExponent, recoverPeriod, tryMultiples, factorFromPeriod, squareRootSplit,
  successMask, shotSuccess, totient, peakCentres, euclidOnsets, isRotation, sampleIndex, euclidRuns,
  combPulseTrain, combPitch, toneOf, beatHz, eccQubits, F_SLOT, selfTest,
};

/* =========================================================================
   Words
   ========================================================================= */

const PROSE = `
<p>Hardy’s consolation, the sentence that opened this movement, was true when he wrote it in
November 1940: no one had yet found a use in war for the theory of numbers. In February 1978
Ronald Rivest, Adi Shamir and Leonard Adleman published a lock built from it, one that anyone
can close and only the keeper of a number’s two prime factors can open, and the difficulty of
factoring went to work guarding secrets. Sixteen years later Peter Shor, at AT&amp;T Bell
Laboratories in Murray Hill, showed how a quantum computer could pick it.</p>
<p>His paper was presented at the Symposium on Foundations of Computer Science in Santa Fe,
20–22 November 1994, where it followed Daniel Simon’s paper on the power of quantum
computation; Simon’s algorithm, Shor wrote, “inspired the work.” Its first move is old and
almost musical. To split <em>N</em>, pick a number <em>a</em> and listen to its powers modulo
<em>N</em>. For <code>a = 7</code> and <code>N = 15</code> they run 1, 7, 4, 13 and then 1 again:
a loop of four, the multiplicative cousin of the <a href="#ex-fifths">circle of fifths</a>, which
walks round twelve notes by adding seven. Once the loop’s length <em>r</em> is known, a reduction
Shor credits to Gary Miller’s 1976 paper finishes the job. <code>7⁴ − 1</code> is a multiple of
15, so <code>(7² − 1)(7² + 1) = 48 × 50</code> is too, and Euclid’s algorithm pulls the factors
out: <code>gcd(48, 15) = 3</code>, <code>gcd(50, 15) = 5</code>. The only difficulty is the length.
For a 2,048-bit modulus the loop can be a number hundreds of digits long, and nobody lives long
enough to hear it close.</p>
<p>Shor’s machine never walks the loop. It puts a register of <em>L</em> qubits, with
<code>Q = 2ᴸ</code> at least <em>N</em>², into an equal superposition of every <em>x</em> from 0
to <em>Q</em> − 1, computes <code>aˣ mod N</code> for all of them in one pass, and then applies a
Fourier transform, the transform of the <a href="#ex-fourier">Atelier</a>, by a construction that
is, in Shor’s words, “essentially the standard fast Fourier transform (FFT) algorithm adapted for
a quantum computer.” Then it is measured, once. A measurement returns a single number
<em>c</em>, not a list of answers; but interference has piled most of the probability close to
multiples of <em>Q</em>/<em>r</em>, so <em>c</em>/<em>Q</em> lands, with good odds, within
<code>1/(2Q)</code> of a fraction <em>d</em>/<em>r</em>.</p>
<p>Reading <em>r</em> out of that fraction is the oldest step in the recipe. Expanding
<em>c</em>/<em>Q</em> as a continued fraction is Euclid’s algorithm again, the subtraction of
squares from a rectangle that never halts for a square’s diagonal; here it must halt, because
<em>c</em>/<em>Q</em> is rational. The expansion finds all the best approximations of
<em>c</em>/<em>Q</em> by fractions, and because <em>Q</em> is at least <em>N</em>² only one
fraction with a denominator below <em>N</em> can be that close. For the first of those facts
Shor cites <em>An Introduction to the Theory of Numbers</em>, the textbook Hardy wrote with
E. M. Wright. The continued fraction is the same machine that found 7/12 inside log₂(3/2) and
explained the twelve-note octave. Shor’s own figure, drawn for <code>Q = 256</code> and
<code>r = 10</code>, is the case of factoring 33 with <code>a = 5</code>: one of its peaks,
<code>c = 77</code>, expands as <code>[0; 3, 3, 12, 2]</code>, and the convergent 3/10 names
the period.</p>
<p>Building the machine has proved far harder than imagining it. In December 2001 a team from
IBM’s Almaden Research Center and Stanford factored 15 with seven nuclear spins in a
custom-made molecule, steered by about three hundred radio-frequency pulses; in 2012 a group in
Bristol factored 21 with photons. Both circuits were simplified in advance for their single
number (for 15, every possible period is 2 or 4), and in 2013 John Smolin, Graeme Smith and
Alexander Vargo showed that shortcuts of that kind can “factor” any product of two distinct odd
primes, concluding that “the correct measure of difficulty … is not the size of number factored,
but the length of the period found.” The stage below keeps the same honesty. It is a classical
simulation that stores all <em>Q</em> amplitudes, so it can show you the mechanism but not the
speed.</p>
<p>The recipe is already changing the world it threatens. Published estimates of the machine
needed to factor a 2,048-bit RSA modulus fell from twenty million noisy qubits running for eight
hours (Craig Gidney and Martin Ekerå, 2019) to fewer than a million running for under a week
(Gidney, May 2025), and preprints in 2026, built on other error-correcting codes, went lower
still. The elliptic-curve keys of <a href="#ex-handshake">the handshake</a> are, in the words of
a 2017 estimate, “an easier target than RSA.” Messages recorded today could be read on the day
such a machine exists, so the locks are being changed before it does. On 13 August 2024 NIST
published FIPS 203, a way of agreeing on keys built on lattices that, the standard says, “is
believed to be secure, even against adversaries who possess a quantum computer.”</p>`;

const TODAY = `
<p>Every secure web connection begins with a key exchange, and the classical ones (RSA,
Diffie–Hellman, elliptic curves) rest on exactly the two problems Shor’s paper names: factoring
and discrete logarithms. Since Chrome 131 reached the stable channel on 12 November 2024,
Google’s browser has paired its elliptic-curve exchange with ML-KEM, the lattice scheme of FIPS
203. Signal added CRYSTALS-Kyber to its protocol in September 2023, Apple’s iMessage PQ3 began
rolling out with iOS 17.4 in 2024, and on 28 October 2025 Cloudflare reported that over half of
the human-initiated traffic reaching it was protected with post-quantum encryption.</p>
<p>The deadline is set by the harvest, not by the machine: what is recorded now can be read
later. NIST’s November 2024 draft transition plan proposes disallowing RSA and elliptic-curve
signatures and key establishment after 2035. No machine able to run Shor’s algorithm at that
size exists yet. Craig Gidney’s May 2025 estimate for RSA-2048 asks for under a million noisy
qubits running for under a week, assuming a 0.1% gate error and a surface-code cycle of one
microsecond; a February 2026 preprint by Paul Webster and colleagues, on the same assumptions
but with quantum low-density parity-check codes, asks for fewer than a hundred thousand.</p>`;

const LEGEND = `
<p>“A quantum computer tries every factor at once.” It does not. Each run ends in one
measurement and returns one number, usually near a multiple of <em>Q</em>/<em>r</em>, and
that is useful only because the problem hides a period that interference can concentrate.
Nothing on the stage above ever tries a factor; the factors come out of Euclid’s algorithm
afterwards, on paper.</p>
<p>“Quantum computers have already factored large numbers.” The celebrated laboratory runs of
Shor’s algorithm factored 15 (2001, and again on trapped ions in 2016) and 21 (2012). In 2025
Peter Gutmann and Stephan Neuhaus matched the published quantum factoring records “using a
VIC-20 8-bit home computer from 1981, an abacus, and a dog.” And the December 2022 preprint that
suggested 372 qubits might threaten RSA-2048 used a different, heuristic method whose own authors
wrote that “the quantum speedup of the algorithm is unclear”; Scott Aaronson’s reply was titled
“Cargo Cult Quantum Factoring.”</p>`;

const SPECULATION = `
<p>When will a machine run this at 2,048 bits? Nobody knows, and this page names no year. The
published estimates have fallen fast, from twenty million noisy qubits for eight hours in 2019 to
under a million for under a week in May 2025, and to under a hundred thousand in a February 2026
preprint, each on stated assumptions (a 0.1% gate error, a one-microsecond cycle). Google’s
below-threshold surface-code memory, reported in <em>Nature</em> in December 2024, used 101
physical qubits to protect a single logical one. How quickly engineering closes a gap of that
size is a forecast, not a fact.</p>
<p>Nor is the recipe finished. In 2023 Oded Regev, who in 2005 introduced the learning-with-errors
problem beneath the new lattice locks, published a quantum factoring algorithm that runs a
smaller circuit √n + 4 times and replaces Shor’s continued fractions with lattice reduction. “The
reader might recall a similar phenomenon occurring in Shor’s algorithm,” he writes, and he says
it is “currently not clear” whether the idea helps real machines. The lattice locks themselves
are believed, not proved, to resist quantum attack, which is why in March 2025 NIST chose a
backup built on different mathematics: HQC, founded on error-correcting codes, the machinery of
the checking number earlier in this movement.</p>`;

const CAPTION = `A classical simulation, and it says so: the page stores all <em>Q</em> amplitudes
and runs the real Fourier transform on them, so it shows the mechanism, not a speed-up. Observing
the second register before the transform is a teaching device: the odds for <em>c</em> are the
same either way, and Shor himself, “for clarity,” observes both registers at the end. The register is clocked at
1,760 slots a second, so a comb of spacing <em>r</em> sounds at 1760/<em>r</em> Hz and a
measurement at 1760·<em>c</em>/<em>Q</em> Hz; the beat between that tone and the chosen
convergent’s is Shor’s bound |<em>c</em>/<em>Q</em> − <em>d</em>/<em>r</em>| ≤ 1/(2<em>Q</em>),
heard. Each residue <em>y</em> of the orbit sounds at 220·2<sup><em>y</em>/<em>N</em></sup> Hz.`;

/* =========================================================================
   The exhibit
   ========================================================================= */

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((d) => SUP[+d] ?? d).join('');
const fmtInt = (n) => n.toLocaleString('en-US');

const REPLAYS = {
  free: { label: 'your own lock' },
  fig51: { label: 'Shor’s Figure 5.1', N: 33, a: 5, Q: 256 },
  ibm7: { label: 'IBM Almaden 2001, a = 7', N: 15, a: 7, Q: 8 },
  ibm11: { label: 'IBM Almaden 2001, a = 11', N: 15, a: 11, Q: 8 },
  bristol: { label: 'Bristol 2012', N: 21, a: 4, Q: 4 },
};
const REPLAY_NOTES = {
  fig51: 'Shor’s Figure 5.1: “The value r = 10 could occur when factoring 33 if x were chosen to be 5, for example” (his x is our a). He took q = 256, below 33², so the peaks stay legible; summed over the ten possible observations, the exact law puts 6556/65536 ≈ 0.100 on c = 0 and on c = 128.',
  ibm7: 'IBM Almaden and Stanford, Nature, December 2001: a = 7 on a three-qubit register. The published spectra read 0, 2, 4 and 6, so r = 8/2 = 4 and gcd(7² ± 1, 15) = 3, 5. The molecules were an ensemble: the readout was an average over many copies, not one sample.',
  ibm11: 'The “easy” case of the same 2001 experiment: a = 11. The readout was 0 and 4, so r = 8/4 = 2 and gcd(11 ± 1, 15) = 3, 5.',
  bristol: 'Bristol, Nature Photonics 2012: N = 21 with a = 4, of order 3, to two bits of precision. The expected outcomes 00, 01, 10, 11 have probabilities 3/8, 1/4, 1/8, 1/4, which the photons matched with a fidelity of 99 ± 4%. They chose 21 because factoring 15 only ever gives periods 2 or 4.',
};

export default {
  id: 'shor',
  movement: 4,
  title: 'The Period Engine',
  hook: 'Find the hidden rhythm in the powers of 7 mod 15, hear it as a pitch, and let a continued fraction split the number. The recipe is now forcing the internet to change its locks.',
  prose: PROSE,
  era: '1940–2026 · Cambridge, Murray Hill, Santa Fe, Almaden, Gaithersburg',
  chronicle: [
    { year: 1940, date: 'November 1940', text: 'G. H. Hardy’s <em>A Mathematician’s Apology</em> tells its readers that “real mathematics has no effects on war,” and that no warlike use has yet been found for the theory of numbers.' },
    { year: 1978, date: 'February 1978', text: 'Rivest, Shamir and Adleman publish RSA in <em>Communications of the ACM</em>, making the difficulty of factoring into a public-key lock.' },
    { year: 1994, date: '20–22 Nov 1994', text: 'At FOCS in Santa Fe, Peter Shor of AT&amp;T Bell Labs shows that a quantum computer could factor integers and take discrete logarithms in polynomial time, by finding a period.' },
    { year: 2001, date: 'December 2001', text: 'IBM Almaden and Stanford factor 15 with Shor’s algorithm on seven nuclear spins in one molecule, driven by about 300 radio-frequency pulses.' },
    { year: 2013, date: 'July 2013', text: 'Smolin, Smith and Vargo show that a “compiled” Shor circuit can “factor” any product of two distinct odd primes with two qubits, and argue that the real measure of difficulty is the length of the period found.' },
    { year: 2024, date: '13 August 2024', text: 'NIST publishes FIPS 203: ML-KEM, a lattice-based way of agreeing on keys that is believed to be secure even against quantum computers.' },
    { year: 2025, date: 'May 2025', text: 'Craig Gidney estimates that RSA-2048 could be factored in under a week with fewer than a million noisy qubits, down from twenty million in 2019.' },
    { year: 2025, date: 'October 2025', text: 'Cloudflare reports that over half of the human-initiated traffic it carries is protected by post-quantum encryption.' },
  ],
  today: TODAY,
  sources: [
    { text: 'P. W. Shor, “Algorithms for quantum computation: discrete logarithms and factoring,” <em>Proc. 35th FOCS</em>, Santa Fe, 20–22 Nov 1994, pp. 124–134; expanded as “Polynomial-Time Algorithms for Prime Factorization and Discrete Logarithms on a Quantum Computer,” <em>SIAM J. Comput.</em> 26(5):1484–1509, 1997 (Figure 5.1)', url: 'https://arxiv.org/abs/quant-ph/9508027' },
    { text: 'G. H. Hardy, <em>A Mathematician’s Apology</em> (Cambridge, 1940), §28', url: 'https://archive.org/details/AMathematiciansApology-G.h.Hardy' },
    { text: 'L. M. K. Vandersypen et al., “Experimental realization of Shor’s quantum factoring algorithm using nuclear magnetic resonance,” <em>Nature</em> 414:883–887 (2001)', url: 'https://arxiv.org/abs/quant-ph/0112176' },
    { text: 'E. Martín-López et al., “Experimental realisation of Shor’s quantum factoring algorithm using qubit recycling,” <em>Nature Photonics</em> 6:773–776 (2012)', url: 'https://arxiv.org/abs/1111.4147' },
    { text: 'J. A. Smolin, G. Smith, A. Vargo, “Oversimplifying quantum factoring,” <em>Nature</em> 499:163–165 (2013)', url: 'https://doi.org/10.1038/nature12290' },
    { text: 'C. Gidney, “How to factor 2048 bit RSA integers with less than a million noisy qubits” (May 2025)', url: 'https://arxiv.org/abs/2505.15917' },
    { text: 'P. Webster et al., “The Pinnacle Architecture: Reducing the cost of breaking RSA-2048 to 100 000 physical qubits using quantum LDPC codes” (preprint, February 2026)', url: 'https://arxiv.org/abs/2602.11457' },
    { text: 'M. Roetteler, M. Naehrig, K. M. Svore, K. Lauter, “Quantum resource estimates for computing elliptic curve discrete logarithms,” ASIACRYPT 2017', url: 'https://arxiv.org/abs/1706.06752' },
    { text: 'NIST, FIPS 203, <em>Module-Lattice-Based Key-Encapsulation Mechanism Standard</em> (13 August 2024), and IR 8547 (Initial Public Draft), <em>Transition to Post-Quantum Cryptography Standards</em> (November 2024)', url: 'https://csrc.nist.gov/pubs/fips/203/final' },
    { text: 'Cloudflare, “State of the post-quantum Internet in 2025” (28 October 2025)', url: 'https://blog.cloudflare.com/pq-2025/' },
  ],
  alt: 'Three linked figures: a circle of residues on which the powers of a mod N trace a gold star polygon; a wide strip of the counting register that turns from a coloured barcode into a comb and then, through the Fourier transform’s butterfly layers, into a spectrum of peaks at multiples of Q/r, with measured outcomes collecting beneath; and a panel where Euclid’s algorithm carves the measured fraction c/Q into squares and a convergent names the period r.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const VERD = P.verdigris;
    const CRIM_B = P.crimsonBright;
    const SERIF = getComputedStyle(document.body).fontFamily || 'Georgia, serif';
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const smallScreen = (window.innerWidth || 1024) < 620;

    const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rgba = (c, al) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
    const RGB = { gold: hexRGB(P.gold), goldB: hexRGB(P.goldBright), verd: hexRGB(VERD), azure: hexRGB(P.azure), azureDim: hexRGB(P.azureDim), crim: hexRGB(CRIM_B), ink: hexRGB(P.ink), dim: hexRGB(P.inkDim), faint: hexRGB(P.inkFaint), verdant: hexRGB(P.verdant), line: hexRGB(P.line), bg: hexRGB(P.bg) };
    // the four illuminator's pigments, cycled: the colour of orbit index k
    const PIG = [RGB.gold, RGB.verd, RGB.azure, RGB.crim];
    const hueOf = (k, r) => {
      if (r <= 1) return PIG[0];
      const t = (k / r) * 4, i = Math.floor(t) % 4, f = t - Math.floor(t);
      const A = PIG[i], B = PIG[(i + 1) % 4];
      return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
    };
    const lerpRGB = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];

    /* ---------- scoped style ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-shor .shor-grid { display:grid; grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);
        grid-template-areas:"orbit frac" "reg reg"; gap:1.1rem 1.2rem; margin:.9rem 0 .2rem; }
      #ex-shor .shor-cell { min-width:0; }
      #ex-shor .shor-cell.orbit { grid-area:orbit; } #ex-shor .shor-cell.frac { grid-area:frac; display:flex; flex-direction:column; }
      #ex-shor .shor-cell.reg { grid-area:reg; }
      @media (max-width: 760px) { #ex-shor .shor-grid { grid-template-columns:minmax(0,1fr); grid-template-areas:"orbit" "reg" "frac"; } }
      #ex-shor .shor-h { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:.1rem .8rem;
        margin:0 0 .4rem .1rem; font-size:.8rem; letter-spacing:.14em; font-variant-caps:all-small-caps; color:${P.inkDim}; }
      #ex-shor .shor-h b { font-weight:400; color:${VERD}; letter-spacing:.1em; margin-right:.35em; }
      #ex-shor .shor-h .meta { font-family:${MONO}; font-variant-caps:normal; letter-spacing:0; font-size:.72rem; color:${P.inkFaint}; }
      #ex-shor .shor-frac { flex:1; background:${P.bg}; border-radius:2px; box-shadow:0 0 0 1px rgba(0,0,0,.55);
        padding:.75rem .95rem .85rem; color:${P.inkDim}; font-size:.9rem; line-height:1.5; min-height:18rem; }
      #ex-shor .shor-frac canvas { background:transparent; box-shadow:none; }
      #ex-shor .fr-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:.2rem .9rem; margin-bottom:.35rem; }
      #ex-shor .fr-big { font-size:1.12rem; color:${P.ink}; font-variant-numeric:lining-nums tabular-nums; }
      #ex-shor .fr-big i { color:${P.goldBright}; }
      #ex-shor .fr-mono { font-family:${MONO}; font-size:.76rem; color:${P.inkFaint}; font-variant-numeric:lining-nums tabular-nums; }
      #ex-shor .fr-row { font-family:${MONO}; font-size:.76rem; line-height:1.7; margin:.18rem 0; overflow-wrap:anywhere;
        font-variant-numeric:lining-nums tabular-nums; }
      #ex-shor .fr-row .lab { font-family:${SERIF}; font-variant-caps:all-small-caps; letter-spacing:.12em; font-size:.82rem; color:${P.inkFaint}; margin-right:.5em; }
      #ex-shor .fr-ladder span { white-space:nowrap; margin-right:.9em; color:${P.inkDim}; }
      #ex-shor .fr-ladder b, #ex-shor .fr-cf b { font-weight:400; color:${P.azure}; }
      #ex-shor .fr-conv span { display:inline-block; padding:0 .34rem; margin:.08rem .06rem; border:1px solid transparent; border-radius:3px; color:${P.inkDim}; transition:color .2s, border-color .2s, box-shadow .2s; }
      #ex-shor .fr-conv span.far { color:${P.inkFaint}; opacity:.5; }
      #ex-shor .fr-conv span.now { color:${P.azure}; border-color:${P.azureDim}; }
      #ex-shor .fr-conv span.pick { color:${P.ink}; border-color:${VERD}; box-shadow:0 0 12px ${rgba(RGB.verd, 0.28)}; }
      #ex-shor .fr-verdict { margin:.35rem 0 .1rem; font-size:.95rem; }
      #ex-shor .fr-verdict.ok { color:${P.verdant}; } #ex-shor .fr-verdict.bad { color:${CRIM_B}; }
      #ex-shor .fr-verdict .m { font-family:${MONO}; font-size:.8rem; font-variant-numeric:lining-nums tabular-nums; }
      #ex-shor .fr-split { margin-top:.45rem; padding-top:.45rem; border-top:1px solid ${P.line}; }
      #ex-shor .fr-split .eq { font-size:1.45rem; color:${P.ink}; letter-spacing:.02em; font-variant-numeric:lining-nums; }
      #ex-shor .fr-split .p1 { color:${P.goldBright}; } #ex-shor .fr-split .p2 { color:${P.azure}; }
      #ex-shor .fr-actions { display:flex; flex-wrap:wrap; gap:.5rem; margin-top:.5rem; }
      #ex-shor .fr-empty { font-style:italic; color:${P.inkFaint}; margin:.4rem 0 0; }
      #ex-shor .shor-eng { gap:.7rem 1rem; }
      #ex-shor .shor-steps { display:flex; flex-wrap:wrap; gap:.4rem; }
      #ex-shor .shor-steps .btn.done { color:${P.inkDim}; }
      #ex-shor .shor-steps .btn.done::after { content:" ✓"; color:${VERD}; }
      #ex-shor .shor-steps .btn.next { border-color:${VERD}; color:${P.ink}; box-shadow:0 0 0 1px ${rgba(RGB.verd, 0.25)} inset; }
      #ex-shor .shor-extra { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:.4rem; margin-top:.45rem; min-height:1.9rem; }
      #ex-shor .controls .ctl { max-width:100%; }
      #ex-shor select.sel { max-width:100%; }
      #ex-shor .readout { white-space:pre-wrap; }
      #ex-shor .mathline .shor-f { display:inline-block; max-width:100%; white-space:normal; margin:.15rem 1.1rem; }
      #ex-shor .mathline .shor-f .nw { white-space:nowrap; }
      @media (max-width: 760px) { #ex-shor .shor-extra { justify-content:flex-start; } #ex-shor .shor-frac { min-height:0; } }
    `;
    stage.appendChild(styleEl);

    /* ---------- state ---------- */
    const VALID = validModuli(127);
    let N = 15, a = 7, Qover = null, replay = 'free';
    let Q = 256, L = 8, r = 4, values = null, orb = null, lucky = false, phiN = 8;
    let step = 0;                       // 0 lock · 1 superposed · 2 observed · 3 transformed
    let yObs = 1, kOff = 0;             // observed second register and the comb's offset
    let combRe = null, combM = 0;
    let spec = null, specRe = null, specIm = null, specMax = 1;
    let morph = null;                   // { stages, t0, kind, dur }
    let dials = null;                   // { from:[], to:[], t0, kind }
    let hist = null, histMax = 0, shots = [];
    let mask = null;
    let last = null;                    // analysis of the latest measurement
    let lastC = -1;
    let rQuantum = 0, rHeard = false, splitRes = null, rescued = false;
    let beads = [];
    let cfAnim = null;                  // { t0, kind, steps:[{at, conv}], levelAt:[] }
    let edgeQueue = [], litEdges = -1, curRes = -1, curUntil = 0;
    let questStage = 1, questWin = '';
    let running = false;                // run-the-engine automation
    let timers = [];

    const bus = audio.createBus('shor');
    let scheduler = null, regTone = null, live = [];

    /* ---------- DOM ---------- */
    const quest = ui.questBanner(stage, '');

    const lockRow = ui.controlRow(stage);
    const nStep = ui.stepper(lockRow, {
      label: 'the lock N', min: 0, max: VALID.length - 1, value: VALID.indexOf(15),
      format: (i) => String(VALID[i]),
      onChange: (i) => { audio.ensureAudio(); replay = 'free'; replaySel.set('free'); setLock(VALID[i], defaultA(VALID[i]), null); },
    });
    let aStep = null;
    const aHolder = document.createElement('div');
    aHolder.style.display = 'contents';
    lockRow.appendChild(aHolder);
    const drawBtn = ui.button(lockRow, 'draw a at random', () => {
      audio.ensureAudio();
      replay = 'free'; replaySel.set('free');
      setLock(N, 2 + Math.floor(Math.random() * (N - 2)), null);
    }, { small: true });
    const replaySel = ui.select(lockRow, {
      label: 'replay a published run',
      options: Object.entries(REPLAYS).map(([value, o]) => ({ value, label: o.label })),
      value: 'free',
      onChange: (v) => {
        audio.ensureAudio();
        replay = v;
        const R = REPLAYS[v];
        if (v === 'free') setLock(N, a, null);
        else { nStep.set(VALID.indexOf(R.N)); setLock(R.N, R.a, R.Q); }
      },
    });
    const orbitBtn = ui.button(lockRow, '♪ play the orbit', playOrbit, { small: true });

    const grid = document.createElement('div');
    grid.className = 'shor-grid';
    stage.appendChild(grid);
    const mkCell = (cls, num, name) => {
      const cell = document.createElement('div');
      cell.className = 'shor-cell ' + cls;
      const h = document.createElement('div');
      h.className = 'shor-h';
      h.innerHTML = `<span><b>${num}</b>·&ensp;${name}</span><span class="meta"></span>`;
      cell.appendChild(h);
      grid.appendChild(cell);
      return { cell, meta: h.querySelector('.meta') };
    };
    const cA = mkCell('orbit', 'i', 'the orbit');
    const cC = mkCell('frac', 'iii', 'the fraction');
    const cB = mkCell('reg', 'ii', 'the counting register');

    const hA = cv.setupCanvas(cA.cell, { height: smallScreen ? 300 : 336 });
    const hB = cv.setupCanvas(cB.cell, { height: smallScreen ? 236 : 262 });
    const regRow = document.createElement('div');
    regRow.className = 'shor-extra';
    cB.cell.appendChild(regRow);
    const card = document.createElement('div');
    card.className = 'shor-frac';
    cC.cell.appendChild(card);
    const cardHead = document.createElement('div'); card.appendChild(cardHead);
    const rectHold = document.createElement('div'); card.appendChild(rectHold);
    const hC = cv.setupCanvas(rectHold, { height: smallScreen ? 96 : 112 });
    const cardBody = document.createElement('div'); card.appendChild(cardBody);
    for (const [h, lab] of [[hA, 'The orbit of a modulo N drawn on a circle of residues'], [hB, 'The counting register: barcode, comb and spectrum'], [hC, 'Euclid’s carving of the measured fraction into squares']]) {
      h.canvas.setAttribute('role', 'img'); h.canvas.setAttribute('aria-label', lab);
    }

    const engRow = ui.controlRow(stage);
    engRow.classList.add('shor-eng');
    const runBtn = ui.button(engRow, '▶ run the engine', () => { audio.ensureAudio(); runEngine(); }, { primary: true });
    const stepsWrap = document.createElement('div'); stepsWrap.className = 'shor-steps'; engRow.appendChild(stepsWrap);
    const s1 = ui.button(stepsWrap, '① superpose', () => { audio.ensureAudio(); cancelRun(); doSuperpose(); }, { small: true });
    const s2 = ui.button(stepsWrap, '② observe f(x)', () => { audio.ensureAudio(); cancelRun(); doObserve(); }, { small: true });
    const s3 = ui.button(stepsWrap, '③ transform', () => { audio.ensureAudio(); cancelRun(); doQFT(); }, { small: true });
    const s4 = ui.button(stepsWrap, '④ measure c', () => { audio.ensureAudio(); cancelRun(); doMeasure(); }, { small: true });
    const s5 = ui.button(stepsWrap, '⑤ split N', () => { audio.ensureAudio(); cancelRun(); doSplit(); }, { small: true });
    const shiftBtn = ui.button(regRow, 'shift the comb by one slot', () => { audio.ensureAudio(); cancelRun(); shiftComb(); }, { small: true });
    const manyBtn = ui.button(regRow, '×20 fresh runs', () => { audio.ensureAudio(); cancelRun(); manyRuns(20); }, { small: true });
    const resetBtn = ui.button(regRow, 'clear the register', () => { cancelRun(); setLock(N, a, Qover); }, { small: true });

    const info = ui.readout(stage, '');
    ui.mathline(stage, '<span class="shor-f"><span class="nw">a<sup>r</sup> ≡ 1 (mod N)&nbsp; ⇒</span>&nbsp; <span class="nw">N divides (a<sup>r/2</sup> − 1)(a<sup>r/2</sup> + 1)</span></span>' +
      '<span class="shor-f"><span class="nw">|c/Q − d/r| ≤ 1/(2Q)</span></span>');
    ui.caption(stage, CAPTION);
    ui.legendPanel(stage, LEGEND);
    ui.speculationPanel(stage, SPECULATION);

    /* ---------- clocks ---------- */
    const audioRunning = () => { const c = audio.getContext(); return !!(c && c.state === 'running'); };
    const clockKind = () => (audioRunning() ? 'audio' : 'perf');
    const clockNow = (kind) => (kind === 'audio' && audio.getContext() ? audio.getContext().currentTime : performance.now() / 1000);
    const later = (ms, fn) => { const id = setTimeout(() => { timers = timers.filter((t) => t !== id); fn(); }, ms); timers.push(id); };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

    let dirtyA = true, dirtyB = true, dirtyC = true;
    const dirtyAll = () => { dirtyA = dirtyB = dirtyC = true; };
    hA.onResize(() => { dirtyA = true; });
    hB.onResize(() => { dirtyB = true; });
    hC.onResize(() => { dirtyC = true; });

    /* ---------- the lock ---------- */
    function defaultA(n) {
      if (n === 15) return 7;
      for (let x = 2; x < n; x++) if (gcd(x, n) === 1 && factorFromPeriod(x, order(x, n), n).ok) return x;
      return 2;
    }
    // the base stepper is rebuilt only when N (its range) changes, so keyboard focus survives
    let aStepN = 0;
    function syncAStepper() {
      if (aStep && aStepN === N) { aStep.set(a); return; }
      if (aStep) aStep.el.remove();
      aStepN = N;
      aStep = ui.stepper(aHolder, {
        label: 'the base a', min: 2, max: N - 1, value: a,
        onChange: (v) => { audio.ensureAudio(); replay = 'free'; replaySel.set('free'); setLock(N, v, null); },
      });
    }

    function setLock(n, base, qOverride) {
      clearTimers(); running = false; runBtn.classList.remove('active');
      stopAllSound();
      N = n; a = Math.max(2, Math.min(n - 1, base)); Qover = qOverride;
      Q = Qover || registerSize(N); L = log2int(Q);
      lucky = gcd(a, N) !== 1;
      orb = lucky ? null : orbit(a, N);
      r = lucky ? 0 : orb.length;
      phiN = totient(N);
      values = registerValues(a, N, Q);
      step = 0; yObs = 1; kOff = 0; combRe = null; combM = 0;
      spec = specRe = specIm = null; specMax = 1; morph = null; dials = null;
      hist = new Uint32Array(Q); histMax = 0; shots = []; mask = null; pExact = null; summary = '';
      last = null; lastC = -1; rQuantum = 0; rHeard = false; splitRes = null;
      beads = []; cfAnim = null; edgeQueue = []; litEdges = -1; curRes = -1;
      nStep.set(VALID.indexOf(N));
      syncAStepper();
      if (lucky) splitRes = luckySplit();
      refreshAll();
      if (lucky) { const f = splitRes; soundChord(f.f1, f.f2); }
    }

    function luckySplit() {
      const { ladder } = cfOfRatio(N, a); // Euclid on (N, a): N = q·a + rem, …
      const g = gcd(a, N);
      return { lucky: true, ok: true, f1: g, f2: N / g, ladder };
    }

    /* ---------- the engine's steps ---------- */
    function doSuperpose() {
      if (lucky) return;
      if (step >= 1) { step = 1; spec = null; morph = null; dials = null; }
      step = 1;
      refreshAll();
    }
    function observeOffset(x0) {
      yObs = values[x0];
      kOff = x0 % r;
      const cmb = combFor(values, yObs);
      combRe = cmb.re; combM = cmb.M;
    }
    function doObserve() {
      if (lucky) return;
      if (step < 1) step = 1;
      observeOffset(Math.floor(Math.random() * Q));
      step = 2; spec = null; morph = null; dials = null;
      playRegisterTone();
      refreshAll();
    }
    function computeSpectrum(keepStages) {
      const st = qftStages(combRe);
      specRe = st.re; specIm = st.im;
      spec = st.stages[st.stages.length - 1];
      specMax = 0; for (let c = 0; c < Q; c++) if (spec[c] > specMax) specMax = spec[c];
      return keepStages ? st.stages : null;
    }
    function morphDur() { return reduceMotion ? 0 : Math.min(2.2, 0.9 + 0.11 * (L + 1)); }
    function doQFT(instant = false) {
      if (lucky) return;
      if (step < 2) { if (step < 1) step = 1; observeOffset(Math.floor(Math.random() * Q)); }
      const stages = computeSpectrum(true);
      step = 3; dials = null;
      morph = (instant || reduceMotion) ? null : { stages, t0: clockNow('perf'), kind: 'perf', dur: morphDur() };
      if (!mask) mask = successMask(a, N, Q);
      refreshAll();
    }
    function sampleC(force) {
      // a fresh run: new observation of the second register, same transform
      if (shots.length > 0) { observeOffset(Math.floor(Math.random() * Q)); computeSpectrum(false); }
      return force != null ? force : sampleIndex(spec, Math.random());
    }
    function doMeasure(opts = {}) {
      if (lucky) return null;
      if (step < 3) doQFT(true);
      morph = null;
      const c = sampleC(opts.forceC);
      const res = analyse(c);
      shots.push({ c, ok: res.r === r });
      const land = reduceMotion ? 0 : 0.6;
      const kind = clockKind();
      beads.push({ c, t0: clockNow(kind) + (opts.delay || 0), kind, dur: land });
      if (reduceMotion) landBead(beads.pop());
      if (!opts.silent) {
        last = res; lastC = c;
        const sweep = soundMeasurement(res, land, opts.fast);
        cfAnim = sweep;
        if (res.r) rQuantum = res.r;
        renderCard();
      } else {
        const fc = toneOf(c, Q);
        const ctx = audio.getContext();
        if (ctx && fc > 45) audio.playTone(bus, { freq: fc, dur: 0.09, level: 0.1, when: ctx.currentTime + land + (opts.delay || 0) });
      }
      refreshAll();
      return res;
    }
    let pExact = null;
    function exactSuccess() {
      if (pExact == null) {
        if (!mask) mask = successMask(a, N, Q);
        const Pm = shorDistribution(r, Q);
        pExact = 0; for (let c = 0; c < Q; c++) if (mask[c]) pExact += Pm[c];
      }
      return pExact;
    }
    function analyse(c) {
      const res = recoverPeriod(c, Q, N, a);
      res.rho = (r * c) % Q; if (res.rho > Q / 2) res.rho -= Q;   // {rc}_Q in (−Q/2, Q/2]
      res.window = Math.abs(res.rho) <= r / 2;                     // Shor (5.11)
      res.multiples = null;
      return res;
    }
    function useMultiples() {
      if (!last || last.r) return;
      audio.ensureAudio();
      const m = tryMultiples(a, last.cand[1], N);
      last.multiples = m;
      if (m.r) {
        rQuantum = m.r;
        if (!rescued && questStage === 2) { rescued = true; questStage = 3; }
        const ctx = audio.getContext();
        if (ctx) audio.playTone(bus, { freq: F_SLOT / m.r * Math.pow(2, Math.max(0, Math.ceil(Math.log2(110 * m.r / F_SLOT)))), dur: 0.5, level: 0.22, when: ctx.currentTime + 0.02 });
      } else {
        const ctx = audio.getContext(); if (ctx) audio.drums.rim(bus, ctx.currentTime + 0.02, { level: 0.35 });
      }
      renderCard(); refreshAll();
    }
    function doSplit() {
      if (lucky) return;
      const rr = rQuantum || (rHeard ? r : 0);
      if (!rr) { info.set('The period is not known yet. Measure until a convergent names it, or play the orbit and hear it.'); return; }
      let f = factorFromPeriod(a, rr, N);
      if (!f.ok) {
        const sq = squareRootSplit(a, rr, N);
        if (sq) f = { ok: true, viaSquare: true, ...sq };
      }
      splitRes = { ...f, r: rr, route: rQuantum ? 'quantum' : 'heard' };
      if (f.ok) {
        soundChord(f.f1, f.f2);
        if (splitRes.route === 'quantum' && questStage === 1) {
          if (last && last.multiples && last.multiples.r) { questStage = 3; rescued = true; }
          else {
            questStage = 2;
            questWin = `<em>${N}</em> = ${f.f1} × ${f.f2}, read from one measurement, <em>c</em> = ${lastC}.`;
          }
        }
      } else {
        const ctx = audio.getContext(); if (ctx) audio.drums.rim(bus, ctx.currentTime + 0.02, { level: 0.4 });
      }
      renderCard(); refreshAll();
    }
    function shiftComb() {
      if (lucky) return;
      if (step < 2) { doObserve(); return; }
      const x0 = ((kOff + 1) % r);
      const before = step === 3 && dialsVisible() ? dialAngles() : null;
      observeOffset(x0);
      if (step === 3) {
        computeSpectrum(false); morph = null;
        if (before) dials = { from: before, to: dialAngles(), t0: clockNow('perf'), kind: 'perf', dur: reduceMotion ? 0 : 0.7 };
      }
      playRegisterTone();
      refreshAll();
      info.set(`The comb moves to offset k = ${kOff}: slots ${kOff}, ${kOff + r}, ${kOff + 2 * r}, … now hold ${a}ˣ ≡ ${yObs}.` +
        (step === 3 ? ' Every bar of the spectrum keeps its height; only the phases (the small dials) turn, and a measurement cannot see phases.' :
          ' The buzz you hear has the same pitch: the ear, like the measurement, keeps magnitudes and discards phase.'));
    }
    function manyRuns(n) {
      if (lucky) return;
      if (step < 3) doQFT(true);
      morph = null;
      const before = shots.length;
      for (let i = 0; i < n; i++) doMeasure({ silent: true, delay: reduceMotion ? 0 : i * 0.07 });
      const got = shots.slice(before).filter((s) => s.ok).length;
      summary = `${n} fresh runs: ${got} found r = ${r} from a single measurement.`;
      refreshAll();
    }
    let summary = '';

    function runEngine() {
      if (lucky) { info.set('This a already shares a factor with N; draw another a to see the engine run.'); return; }
      cancelRun();
      running = true; runBtn.classList.add('active');
      let t = 0;
      if (step < 1) { later(t, doSuperpose); t += 1000; }
      if (step < 2) { later(t, doObserve); t += 2600; }
      if (step < 3) { later(t, () => doQFT()); t += morphDur() * 1000 + 900; }
      later(t, () => autoMeasure(0));
    }
    function autoMeasure(n) {
      const res = doMeasure({ fast: true });
      if (!res) { stopRunning(); return; }
      const wait = (cfAnim ? cfAnim.total : 1.5) * 1000 + 400;
      if (res.r) { later(wait, () => { doSplit(); stopRunning(); }); return; }
      const m = tryMultiples(a, res.cand[1], N);
      if (m.r && res.cand[1] > 1) { later(wait, () => { useMultiples(); later(1300, () => { doSplit(); stopRunning(); }); }); return; }
      if (n < 5) later(wait, () => autoMeasure(n + 1)); else stopRunning();
    }
    function stopRunning() { running = false; runBtn.classList.remove('active'); }
    function cancelRun() { clearTimers(); stopRunning(); }

    /* ---------- sound ---------- */
    function stopAllSound() {
      if (scheduler) { scheduler.stop(); scheduler = null; }
      edgeQueue = [];
      if (regTone) {
        const { src, g } = regTone; regTone = null;
        try { audio.rampTo(g.gain, 0, 0.02); src.stop((audio.getContext()?.currentTime || 0) + 0.12); } catch {}
      }
      for (const v of live) {
        try { audio.rampTo(v.g.gain, 0, 0.02); v.osc.stop((audio.getContext()?.currentTime || 0) + 0.12); } catch {}
      }
      live = [];
    }

    function playOrbit() {
      audio.ensureAudio();
      cancelRun();
      if (scheduler) { scheduler.stop(); scheduler = null; }
      edgeQueue = []; litEdges = -1; curRes = -1;
      if (lucky) {
        // the powers of a non-unit never return to 1: play them until they repeat
        const seq = [1 % N]; let y = a % N;
        while (!seq.includes(y) && seq.length < 24) { seq.push(y); y = (y * a) % N; }
        let i = 0;
        scheduler = audio.createScheduler((t) => {
          if (i >= seq.length) return null;
          audio.playTone(bus, { freq: 220 * Math.pow(2, seq[i] / N), dur: 0.3, level: 0.24, type: 'triangle', when: t });
          edgeQueue.push({ idx: -1, y: seq[i], at: t, until: t + 0.3 }); i++;
          return t + 0.26;
        });
        scheduler.start();
        info.set(`${a} shares the factor ${gcd(a, N)} with ${N}, so its powers ${seq.join(', ')}, … never come back to 1. No period; Euclid already won.`);
        return;
      }
      const dur = Math.max(0.12, Math.min(0.3, 7 / orb.length));
      let i = 0;
      scheduler = audio.createScheduler((t) => {
        if (i > orb.length) return null;
        const y = i === orb.length ? orb[0] : orb[i];
        audio.playTone(bus, { freq: 220 * Math.pow(2, y / N), dur: dur * 1.35, level: 0.26, type: 'triangle', when: t });
        edgeQueue.push({ idx: i, y, at: t, until: t + dur * 1.35 });
        i++;
        return t + dur;
      });
      scheduler.start();
    }

    function playRegisterTone() {
      const ctx = audio.ensureAudio();
      if (regTone) { const { src, g } = regTone; regTone = null; try { audio.rampTo(g.gain, 0, 0.015); src.stop(ctx.currentTime + 0.08); } catch {} }
      if (!combRe) return;
      const H = Math.max(8, Math.round(ctx.sampleRate / F_SLOT));
      const occ = new Uint8Array(Q);
      for (let x = 0; x < Q; x++) occ[x] = combRe[x] > 0 ? 1 : 0;
      let oct = 0;
      while (F_SLOT * Math.pow(2, oct) / r < 55) oct++;
      regOct = oct;
      const data = combPulseTrain(occ, H);
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.playbackRate.value = F_SLOT * Math.pow(2, oct) * H / ctx.sampleRate; // set before start
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp).connect(g).connect(bus.input);
      const t = ctx.currentTime + 0.03;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.12);
      g.gain.setValueAtTime(0.15, t + 1.9);
      g.gain.linearRampToValueAtTime(0, t + 2.4);
      src.start(t); src.stop(t + 2.5);
      const me = { src, g, lp };
      src.onended = () => { try { src.disconnect(); lp.disconnect(); g.disconnect(); } catch {} if (regTone === me) regTone = null; };
      regTone = me;
    }
    let regOct = 0;

    // A tone that walks through frequencies on a fixed schedule (like playTone, one node chain).
    function sweepVoice(points, { level = 0.18, when, hold = 1.6, type = 'sine', glide = 0.14 }) {
      const ctx = bus.context;
      const osc = ctx.createOscillator(); osc.type = type;
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(points[0].f, when);
      for (let i = 1; i < points.length; i++) {
        osc.frequency.setValueAtTime(points[i - 1].f, Math.max(when, points[i].t - glide));
        osc.frequency.exponentialRampToValueAtTime(points[i].f, points[i].t);
      }
      const end = points[points.length - 1].t + hold;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(level, when + 0.05);
      g.gain.setValueAtTime(level, end);
      g.gain.linearRampToValueAtTime(0, end + 0.4);
      osc.connect(g).connect(bus.input);
      osc.start(when); osc.stop(end + 0.5);
      const v = { osc, g };
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} live = live.filter((x) => x !== v); };
      live.push(v);
      return end + 0.4;
    }

    // Measurement ping at F·c/Q, then the candidate voice climbing the convergents.
    function soundMeasurement(res, land, fast) {
      const kind = clockKind();
      const t0 = clockNow(kind) + land;
      const stepDur = fast ? 0.34 : 0.46;
      const convIdx = [];
      for (let i = 0; i <= res.pick; i++) if (res.conv[i][0] > 0) convIdx.push(i);
      const steps = convIdx.map((i, j) => ({ at: t0 + 0.35 + j * stepDur, conv: i }));
      const hold = fast ? 1.3 : 2.4;
      const total = land + 0.35 + Math.max(1, steps.length) * stepDur + hold;
      const anim = { t0, kind, steps, total, levelsAt: [] };
      // Euclid's levels appear with the convergents they produce
      for (let lv = 0; lv < res.terms.length - 1; lv++) anim.levelsAt.push(t0 + 0.1 + lv * Math.min(stepDur, 1.4 / Math.max(1, res.terms.length)));
      const ctx = audio.getContext();
      if (!ctx || kind !== 'audio') return anim;
      const fc = toneOf(res.c, Q);
      if (fc < 45 || !steps.length) { audio.drums.wood(bus, t0, { level: 0.3, pitch: 330 }); return anim; }
      const pts = steps.map((s) => ({ t: s.at, f: F_SLOT * res.conv[s.conv][0] / res.conv[s.conv][1] }));
      audio.playTone(bus, { freq: fc, dur: 0.18, level: 0.3, when: t0, attack: 0.004, release: 0.1 });
      sweepVoice([{ t: t0 + 0.05, f: fc }, { t: pts[pts.length - 1].t + hold, f: fc }], { level: 0.16, when: t0 + 0.05, hold: 0.01, glide: 0.001 });
      sweepVoice(pts, { level: 0.14, when: pts[0].t, hold, glide: 0.16 });
      return anim;
    }

    function soundChord(p1, p2) {
      const ctx = audio.getContext();
      if (!ctx || !(p1 > 1 && p2 > 1)) return;
      let base = 55;
      while (base * Math.max(p1, p2) > 1100 && base > 7) base /= 2;
      const t = ctx.currentTime + 0.03;
      audio.playTone(bus, { freq: base * p1, dur: 1.8, level: 0.24, when: t, attack: 0.02, release: 0.5, pan: -0.25 });
      audio.playTone(bus, { freq: base * p2, dur: 1.8, level: 0.2, when: t + 0.12, attack: 0.02, release: 0.5, pan: 0.25 });
    }

    /* ---------- text: quest, readout, headers, steps ---------- */
    function refreshAll() {
      updateQuest(); updateInfo(); updateHeads(); updateSteps(); renderCard(); dirtyAll();
    }
    function updateQuest() {
      if (questStage === 1) quest.set(`Split <em>${N}</em> with the engine: superpose, observe, transform and measure, then let a continued fraction name the period.`);
      else if (questStage === 2) quest.done(`${questWin || 'Split by the engine.'} Next, when a convergent names only part of the period, rescue it with Shor’s advice and try its small multiples.`);
      else quest.done('Rescued: the small multiples of a convergent’s denominator restored the period, as Shor advised. Now open a replay and hear the runs that really happened.');
    }
    function updateInfo() {
      const qbits = `Q = ${fmtInt(Q)} = 2${sup(L)} slots (${L} qubits)`;
      const cond = Qover ? `Q set by the replay, below N² = ${N * N}` : `N² = ${fmtInt(N * N)} ≤ Q < 2N²`;
      let t = '';
      if (lucky) {
        const g = gcd(a, N);
        t = `Lucky draw: gcd(${a}, ${N}) = ${g}, so ${N} = ${g} × ${N / g} fell out of Euclid’s algorithm before any quantum step. Shor’s recipe starts with exactly this check.`;
      } else if (step === 0) {
        t = `N = ${N}, a = ${a} · ${qbits}; ${cond}. The period r is hidden; the engine’s job is to find it without walking the orbit.`;
      } else if (step === 1) {
        t = `All ${fmtInt(Q)} pairs (x, ${a}ˣ mod ${N}) are held at once, each with amplitude 1/√${fmtInt(Q)}. A measurement now would return one pair at random. The colours repeat every r slots, but nothing can read them yet.`;
      } else if (step === 2) {
        t = `Second register observed: ${yObs}. The first register collapses to the ${fmtInt(combM)} slots with ${a}ˣ ≡ ${yObs}: x = ${kOff}, ${kOff + r}, ${kOff + 2 * r}, … a comb of spacing r at an offset k = ${kOff} that nobody controls. Measuring it now would give one tooth, useless. Heard: a buzz at 1760/r` + (regOct ? ` (up ${regOct} octave${regOct > 1 ? 's' : ''})` : '') + '.';
      } else {
        const w = Q / r;
        const sp = exactSuccess();
        t = `After the transform the probability sits near multiples of Q/r = ${Number.isInteger(w) ? w : w.toFixed(2)}; the r likeliest outcomes, round(jQ/r), are as evenly spaced as integers allow (the Euclidean rhythm E(r, Q)).` +
          (shots.length ? `\nRuns ${shots.length} · r found in one shot ${shots.filter((s) => s.ok).length} · exact chance per run ${sp.toFixed(3)}` +
            (Q >= N * N ? ` (Shor’s guarantee φ(r)/3r = ${(totient(r) / (3 * r)).toFixed(3)})` : ' (Shor’s guarantee needs Q ≥ N², and this register is smaller)') : '') +
          (summary ? `\n${summary}` : '');
      }
      if (replay !== 'free' && REPLAY_NOTES[replay]) t = REPLAY_NOTES[replay] + '\n' + t;
      info.set(t);
    }
    function updateHeads() {
      cA.meta.textContent = lucky ? `gcd(${a}, ${N}) = ${gcd(a, N)}` : `${a}ˣ mod ${N} · φ(${N}) = ${phiN} units`;
      const stName = lucky ? 'not needed' : ['all |0⟩', 'superposed', 'comb', morph ? 'transforming' : 'spectrum'][step];
      cB.meta.textContent = `Q = ${fmtInt(Q)} · ${L} qubits · ${stName}`;
      cC.meta.textContent = last ? `c/Q = ${last.c}/${fmtInt(Q)}` : (lucky ? 'Euclid alone' : 'waiting for a measurement');
    }
    function updateSteps() {
      const cls = (b, done, next, disabled) => {
        b.classList.toggle('done', !!done); b.classList.toggle('next', !!next && !done); b.disabled = !!disabled;
      };
      const known = !!(rQuantum || rHeard);
      const splitDone = !!(splitRes && !splitRes.lucky);
      cls(s1, step >= 1, step === 0, lucky);
      cls(s2, step >= 2, step === 1, lucky);
      cls(s3, step >= 3, step === 2, lucky);
      cls(s4, shots.length > 0, step === 3 && !shots.length, lucky);
      cls(s5, splitDone && splitRes.ok, known && !splitDone, lucky || !known);
      shiftBtn.style.display = !lucky && step >= 2 ? '' : 'none';
      manyBtn.style.display = !lucky && step >= 3 ? '' : 'none';
      resetBtn.style.display = !lucky && step >= 1 ? '' : 'none';
      runBtn.disabled = lucky;
      orbitBtn.textContent = lucky ? '♪ play the powers' : '♪ play the orbit';
    }

    /* ---------- the fraction card ---------- */
    function renderCard() {
      dirtyC = true;
      if (lucky) {
        const f = splitRes;
        cardHead.innerHTML = `<div class="fr-head"><span class="fr-big">gcd(<i>${a}</i>, ${N})</span><span class="fr-mono">Euclid, before any quantum step</span></div>`;
        cardBody.innerHTML =
          `<div class="fr-row fr-ladder"><span class="lab">Euclid</span>${f.ladder.map(([x, q, y, rem]) => `<span>${x} = <b>${q}</b>·${y}${rem ? ` + ${rem}` : ''}</span>`).join('')}</div>` +
          `<div class="fr-verdict ok">A lucky draw: the base already shares a factor with ${N}.</div>` +
          `<div class="fr-split"><span class="eq">${N} = <span class="p1">${f.f1}</span> × <span class="p2">${f.f2}</span></span></div>`;
        return;
      }
      if (!last) {
        cardHead.innerHTML = `<div class="fr-head"><span class="fr-big"><i>c</i> / <i>Q</i></span><span class="fr-mono">Q = ${fmtInt(Q)}</span></div>`;
        cardBody.innerHTML = `<p class="fr-empty">When the machine is measured its answer lands here as a fraction <em>c</em>/<em>Q</em>. Euclid’s algorithm carves the fraction into squares, the anthyphairesis that never ends for a square’s diagonal; for a rational number it must end, and one of its convergents names the period.</p>` +
          (replay === 'bristol' ? bristolNote() : '');
        return;
      }
      const R = last;
      const val = R.c / Q;
      cardHead.innerHTML = `<div class="fr-head"><span class="fr-big"><i>c</i> = ${R.c} &nbsp;of&nbsp; <i>Q</i> = ${fmtInt(Q)}</span>` +
        `<span class="fr-mono">c/Q = ${val.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0')}${R.window ? ' · inside a peak window' : ' · between peaks'}</span></div>`;
      if (R.c === 0) {
        cardBody.innerHTML = `<div class="fr-verdict bad">c = 0 is the peak at 0/r, the one every period shares: 0/${fmtInt(Q)} has no continued fraction to speak of and says nothing about r. Measure again.</div>` +
          (replay === 'bristol' ? bristolNote() : '');
        return;
      }
      const steps = R.ladder.slice(1).map(([x, q, y, rem]) => `<span>${x} = <b>${q}</b>·${y}${rem ? ` + ${rem}` : ''}</span>`);
      const cf = `[${R.terms[0]}; ${R.terms.slice(1).join(', ')}]`;
      const conv = R.conv.map(([p, q], i) => `<span data-i="${i}" class="${i === R.pick ? 'pick' : ''}${q >= N ? ' far' : ''}">${p}/${q}</span>`).join('');
      let verdict;
      if (R.r && R.reduced) {
        verdict = `<div class="fr-verdict ok"><span class="m">${a}${sup(R.found)} mod ${N} = 1</span> ✓ &nbsp;but ${R.found} is only a multiple of the period: the least power that returns to 1 is <span class="m">${a}${sup(R.r)}</span>, so r = ${R.r}</div>`;
      } else if (R.r) {
        verdict = `<div class="fr-verdict ok"><span class="m">${a}${sup(R.cand[1])} mod ${N} = 1</span> ✓ &nbsp;the period is r = ${R.r}</div>`;
      } else {
        verdict = `<div class="fr-verdict bad"><span class="m">${a}${sup(R.cand[1])} mod ${N} = ${R.residue}</span> ✗ &nbsp;${failWhy(R)}</div>`;
        if (R.multiples) {
          const m = R.multiples;
          verdict += m.r
            ? `<div class="fr-row"><span class="lab">multiples</span>${m.tried.map((u) => `${a}${sup(u.e)} ≡ ${u.res}`).join(' · ')}${m.reduced ? ` · but ${m.found} is only a multiple of the period: the least power that returns to 1 is ${a}${sup(m.r)}` : ''} → <span style="color:${P.verdant}">r = ${m.r}</span></div>`
            : `<div class="fr-row"><span class="lab">multiples</span>${m.tried.length ? m.tried.map((u) => `${a}${sup(u.e)} ≡ ${u.res}`).join(' · ') + ' · ' : ''}none returns to 1: measure again</div>`;
        }
      }
      const fc = toneOf(R.c, Q);
      const [p, q] = R.cand;
      const beat = p > 0 && fc < 45 ? `<div class="fr-row"><span class="lab">heard</span>${fc.toFixed(2)} Hz is below hearing; the fraction speaks for itself</div>`
        : p > 0 ? `<div class="fr-row"><span class="lab">heard</span>${fc.toFixed(2)} Hz against ${(F_SLOT * p / q).toFixed(2)} Hz · beat ${beatHz(R.c, Q, p, q).toFixed(3)} Hz${R.window && R.r ? ` ≤ 1760/(2Q) = ${(F_SLOT / (2 * Q)).toFixed(3)} Hz` : ''}${R.r && (R.r & (R.r - 1)) === 0 && beatHz(R.c, Q, p, q) < 1e-9 ? ' · unison: r is a power of two, and 1/r ends in binary' : ''}</div>` : '';
      let split = '';
      if (splitRes && !splitRes.lucky) {
        const f = splitRes;
        if (f.ok && f.viaSquare) {
          split = `<div class="fr-split"><div class="fr-row"><span class="lab">split</span>odd period, but ${a} = ${f.b}²: ${f.b}${sup(f.r)} ≡ ${f.h} · gcd(${f.h - 1}, ${N}) = ${f.f1} · gcd(${f.h + 1}, ${N}) = ${f.f2}</div><span class="eq">${N} = <span class="p1">${f.f1}</span> × <span class="p2">${f.f2}</span></span></div>`;
        } else if (f.ok) {
          const half = f.r / 2;
          split = `<div class="fr-split"><div class="fr-row"><span class="lab">split</span>${a}${sup(half)} ≡ ${f.h} · gcd(${f.h - 1}, ${N}) = ${f.f1} · gcd(${f.h + 1}, ${N}) = ${f.f2}</div><span class="eq">${N} = <span class="p1">${f.f1}</span> × <span class="p2">${f.f2}</span></span>${f.route === 'heard' ? ' <span class="fr-mono">(period heard, not measured)</span>' : ''}</div>`;
        } else {
          const why = f.why === 'odd period' ? `r = ${f.r} is odd, so a<sup>r/2</sup> does not exist`
            : f.why === 'a^(r/2) ≡ 1' ? `${a}${sup(f.r / 2)} ≡ 1: ${f.r} is not the least period`
            : `${a}${sup(f.r / 2)} ≡ −1 (mod ${N}), so both gcds are trivial`;
          split = `<div class="fr-split"><div class="fr-verdict bad">${why}. Shor’s recipe fails for this base; draw a new a.</div></div>`;
        }
      }
      cardBody.innerHTML =
        `<div class="fr-row fr-ladder"><span class="lab">Euclid</span>${steps.join('')}</div>` +
        `<div class="fr-row fr-cf"><span class="lab">fraction</span>${R.c}/${Q} = ${cf.replace(/(\d+)/g, '<b>$1</b>')}</div>` +
        `<div class="fr-row fr-conv"><span class="lab">convergents</span>${conv}</div>` +
        verdict + beat + split +
        `<div class="fr-actions"></div>` + (replay === 'bristol' ? bristolNote() : '');
      const act = cardBody.querySelector('.fr-actions');
      if (!R.r && R.c > 0 && !R.multiples && R.cand[1] > 1) ui.button(act, 'try small multiples (Shor’s advice)', () => { cancelRun(); useMultiples(); }, { small: true });
      if (Qover) ui.button(act, `rerun with Shor’s register, Q = ${fmtInt(registerSize(N))}`, () => { replay = 'free'; replaySel.set('free'); setLock(N, a, null); }, { small: true });
      syncConvHighlight(true);
    }
    // Why a shot failed, diagnosed with what the simulation knows (the true r):
    // a shared factor in d/r, a register too coarse to resolve d/r, or a miss.
    function failWhy(R) {
      const d = Math.round(R.c * r / Q) % r;
      if (R.window && gcd(d, r) > 1) return `the peak was ${d}/${r} = ${d / gcd(d, r)}/${r / gcd(d, r)}: d and r share a factor, so the fraction names only part of r`;
      if (R.window) return `c sits on the peak at ${d}/${r}, but a register this small cannot tell the continued fraction so`;
      return `c fell between the peaks, and ${R.cand[0]}/${R.cand[1]} is only a nearby fraction`;
    }
    function bristolNote() {
      return `<p class="fr-empty" style="margin-top:.5rem">Two bits cannot resolve thirds: 1/4 and 3/4 sit 1/12 from 1/3 and 2/3, too far for a continued fraction to find them (its guarantee needs less than 1/(2r²) = 1/18), so no convergent names r = 3, and r = 3 would be odd anyway. But 4 = 2², so the odd period still splits 21: 2³ = 8, gcd(7, 21) = 7 and gcd(9, 21) = 3, a route the Bristol paper notes for square bases.</p>`;
    }
    let convShown = -2;
    function syncConvHighlight(force) {
      if (!last || lucky) return;
      let cur = -1;
      if (cfAnim) {
        const now = clockNow(cfAnim.kind);
        for (const s of cfAnim.steps) if (now >= s.at) cur = s.conv;
        if (now > cfAnim.t0 + cfAnim.total) cur = -1;
      }
      if (!force && cur === convShown) return;
      convShown = cur;
      cardBody.querySelectorAll('.fr-conv span[data-i]').forEach((el) => el.classList.toggle('now', +el.dataset.i === cur && cur !== last.pick));
    }

    /* ---------- drawing: i · the orbit ---------- */
    const glowGold = cv.glowSprite(P.goldBright, 44);
    const glowVerd = cv.glowSprite(VERD, 40);
    const beadSprite = cv.glowSprite(P.goldBright, 22);

    function resPos(y, R, cx, cy) {
      const ang = (y / N) * Math.PI * 2 - Math.PI / 2;
      return [cx + R * Math.cos(ang), cy + R * Math.sin(ang)];
    }
    function drawOrbit() {
      const { ctx, width: W, height: H } = hA;
      ctx.clearRect(0, 0, W, H);
      const labels = N <= 45;
      const cx = W / 2, cy = H / 2;
      const R = Math.max(40, Math.min(W, H) / 2 - (labels ? 30 : 20));
      const orbitKnown = rHeard || !!rQuantum || (splitRes && splitRes.ok && !splitRes.lucky);
      const f1 = splitRes && splitRes.ok ? splitRes.f1 : 0, f2 = splitRes && splitRes.ok ? splitRes.f2 : 0;

      // the ring
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      // after the split: the non-units become two families of spokes
      if (f1 > 1) {
        for (let y = 0; y < N; y++) {
          const in1 = y % f1 === 0, in2 = y % f2 === 0;
          if (!in1 && !in2) continue;
          const [x2, y2] = resPos(y, R, cx, cy);
          const [x1, y1] = resPos(y, R * 0.22, cx, cy);
          ctx.strokeStyle = in1 && in2 ? rgba(RGB.ink, 0.22) : in1 ? rgba(RGB.gold, 0.3) : rgba(RGB.azure, 0.3);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }

      // cosets of ⟨a⟩, faint (the other orbits of the same step)
      if (!lucky && orb && (litEdges >= 0 || orbitKnown)) {
        const seen = new Uint8Array(N);
        for (const o of orb) seen[o] = 1;
        let drawn = 0;
        ctx.strokeStyle = rgba(RGB.line, 0.95); ctx.lineWidth = 1;
        for (let g = 2; g < N && drawn * r < 400; g++) {
          if (seen[g] || gcd(g, N) !== 1) continue;
          const cos = orb.map((o) => (o * g) % N);
          cos.forEach((c) => { seen[c] = 1; });
          if (r >= 2) {
            ctx.beginPath();
            cos.forEach((c, i) => { const [x, y] = resPos(c, R, cx, cy); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
            ctx.closePath(); ctx.stroke();
          }
          drawn++;
        }
      }

      // the orbit: lit edge by edge while it plays, whole once r is known
      if (!lucky && orb && (litEdges >= 0 || orbitKnown)) {
        const upto = orbitKnown && litEdges < 0 ? r : Math.min(litEdges, r);
        const path = () => {
          ctx.beginPath();
          for (let i = 0; i <= upto; i++) { const [x, y] = resPos(orb[i % r], R, cx, cy); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        };
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(RGB.gold, 0.14); ctx.lineWidth = 6; path(); ctx.stroke();
        ctx.strokeStyle = P.gold; ctx.lineWidth = 1.5; path(); ctx.stroke();
      }

      // residues
      ctx.font = `10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const orbIndex = new Int16Array(N).fill(-1);
      if (orb) orb.forEach((o, i) => { orbIndex[o] = i; });
      for (let y = 0; y < N; y++) {
        const [x, yy] = resPos(y, R, cx, cy);
        const unit = gcd(y, N) === 1;
        const k = orbIndex[y];
        if (!unit) {
          const in1 = f1 > 1 && y % f1 === 0, in2 = f2 > 1 && y % f2 === 0;
          if (in1 || in2) {
            ctx.fillStyle = in1 && in2 ? P.ink : in1 ? P.goldBright : P.azure;
            ctx.beginPath(); ctx.arc(x, yy, 3.4, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.strokeStyle = P.inkFaint; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x, yy, 2.7, 0, Math.PI * 2); ctx.stroke();
          }
        } else if (k >= 0 && f1 <= 1 && (step === 1 || step === 2 || (step === 3 && !shots.length))) {
          // while the register is visible, orbit members wear the loupe's colours
          ctx.fillStyle = rgba(hueOf(k, r), 1);
          ctx.beginPath(); ctx.arc(x, yy, 3.6, 0, Math.PI * 2); ctx.fill();
        } else if (k >= 0 && (orbitKnown || (litEdges >= 0 && k <= litEdges))) {
          // gold on the orbit; plain ink once gold and azure name the factor families
          ctx.fillStyle = f1 > 1 ? P.ink : P.goldBright;
          ctx.beginPath(); ctx.arc(x, yy, f1 > 1 ? 2.6 : 3.3, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = unit ? P.inkDim : P.inkFaint;
          ctx.beginPath(); ctx.arc(x, yy, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        if (lucky && y === a) {
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, yy, 7, 0, Math.PI * 2); ctx.stroke();
        }
        if (labels) {
          const [lx, ly] = resPos(y, R + 15, cx, cy);
          ctx.fillStyle = y === curRes ? P.goldBright : k >= 0 && (orbitKnown || (litEdges >= 0 && k <= litEdges)) ? P.inkDim : rgba(RGB.faint, 0.75);
          ctx.fillText(String(y), lx, ly);
        }
      }

      // the observed value of the second register
      if (!lucky && step >= 2 && f1 <= 1) {
        const [x, yy] = resPos(yObs, R, cx, cy);
        glowVerd.draw(ctx, x, yy, 0.5);
        ctx.strokeStyle = VERD; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(x, yy, 8, 0, Math.PI * 2); ctx.stroke();
      }
      // the note now sounding
      if (curRes >= 0) {
        const [x, yy] = resPos(curRes, R, cx, cy);
        glowGold.draw(ctx, x, yy, 1);
        ctx.fillStyle = P.goldBright; ctx.beginPath(); ctx.arc(x, yy, 4.2, 0, Math.PI * 2); ctx.fill();
      }

      // the centre: what is known, on a dark hub so the chords do not cut the words
      const hubR = R * 0.68;
      const hub = ctx.createRadialGradient(cx, cy, 0, cx, cy, hubR);
      hub.addColorStop(0, rgba(RGB.bg, 0.92)); hub.addColorStop(0.7, rgba(RGB.bg, 0.8)); hub.addColorStop(1, rgba(RGB.bg, 0));
      ctx.fillStyle = hub; ctx.fillRect(cx - hubR, cy - hubR, 2 * hubR, 2 * hubR);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(RGB.bg, 0.92); ctx.lineWidth = 5;
      const txt = (t, x, y) => { ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
      const big = Math.round(Math.min(34, R * 0.3));
      // "aˣ mod N" with a true superscript, centred, outlined for legibility
      function powText(b, e, rest, x, y, size) {
        ctx.textAlign = 'left';
        const f1 = `italic ${size}px ${SERIF}`, f2 = `italic ${Math.round(size * 0.7)}px ${SERIF}`;
        ctx.font = f1; const w1 = ctx.measureText(b).width, w3 = ctx.measureText(rest).width;
        ctx.font = f2; const w2 = ctx.measureText(e).width + 1;
        let X = x - (w1 + w2 + w3) / 2;
        ctx.font = f1; txt(b, X, y); X += w1;
        ctx.font = f2; txt(e, X + 0.5, y - size * 0.42); X += w2;
        ctx.font = f1; txt(rest, X, y);
        ctx.textAlign = 'center';
      }
      if (lucky) {
        ctx.fillStyle = P.inkDim; ctx.font = `italic 15px ${SERIF}`;
        txt(`gcd(${a}, ${N})`, cx, cy - big * 0.55);
        ctx.fillStyle = P.goldBright; ctx.font = `${big}px ${SERIF}`;
        txt(`= ${gcd(a, N)}`, cx, cy + big * 0.35);
        ctx.fillStyle = P.inkFaint; ctx.font = `italic 12px ${SERIF}`;
        txt('no period needed', cx, cy + big * 0.35 + 20);
        return;
      }
      ctx.fillStyle = P.inkDim; ctx.font = `italic 15px ${SERIF}`;
      powText(String(a), 'x', ` mod ${N}`, cx, cy - big * 0.62, 15);
      ctx.font = `${big}px ${SERIF}`;
      const known = orbitKnown;
      ctx.fillStyle = known ? P.goldBright : P.inkFaint;
      txt(known ? `r = ${r}` : 'r = ?', cx, cy + big * 0.3);
      ctx.font = `italic 12px ${SERIF}`; ctx.fillStyle = P.inkFaint;
      const how = rQuantum ? (last && last.multiples && last.multiples.r ? `from c = ${last.c} and a multiple` : `read from c = ${last ? last.c : '…'}`)
        : rHeard ? `heard in ${r} note${r > 1 ? 's' : ''}` : 'hidden';
      txt(how, cx, cy + big * 0.3 + 19);
      if (f1 > 1) {
        ctx.font = `${Math.round(big * 0.56)}px ${SERIF}`;
        const parts = [[`${N} = `, P.ink], [String(f1), P.goldBright], [' × ', P.ink], [String(f2), P.azure]];
        const tw = parts.reduce((s, [t]) => s + ctx.measureText(t).width, 0);
        let x = cx - tw / 2;
        ctx.textAlign = 'left';
        for (const [t, col] of parts) { ctx.fillStyle = col; txt(t, x, cy + big * 0.3 + 44); x += ctx.measureText(t).width; }
        ctx.textAlign = 'center';
      }
    }

    /* ---------- drawing: ii · the counting register ---------- */
    function regGeom() {
      const W = hB.width, H = hB.height;
      const padL = 14, padR = 14, innerW = W - padL - padR;
      const yLoupe = 12, hLoupe = 30;
      const yBars = 72;
      const yHistBase = H - 10, hHist = smallScreen ? 30 : 34;
      const yAxis = yHistBase - hHist - 36;
      const hBars = yAxis - yBars;
      const cellTarget = smallScreen ? 21 : 25;
      const nCells = Math.max(1, Math.min(Q, Math.floor(innerW / cellTarget)));
      return { W, H, padL, padR, innerW, yLoupe, hLoupe, yBars, hBars, yAxis, yHistBase, hHist, nCells, slotW: innerW / Q };
    }
    const xOf = (G, x) => G.padL + (x + 0.5) * G.innerW / Q;
    // the first caption that fits the width (canvas text never wraps)
    const fit = (ctx, options, maxW) => options.find((t) => ctx.measureText(t).width <= maxW) || options[options.length - 1];

    // Draw an array of non-negative values as bars across the full register,
    // reducing by per-pixel max when there are more slots than pixels.
    function drawBars(ctx, G, vals, norm, colorAt, minH = 0, halo = null) {
      const base = G.yBars + G.hBars;
      if (G.slotW >= 1.25) {
        const bw = Math.max(1, Math.min(G.slotW * 0.74, G.slotW - 0.6, 40));
        for (let x = 0; x < Q; x++) {
          const v = vals[x] / norm;
          if (v <= 0 && !minH) continue;
          const h = Math.max(minH, v * G.hBars);
          if (halo && v > 0.04 && bw < 8) { ctx.fillStyle = halo; ctx.fillRect(xOf(G, x) - bw / 2 - 3, base - h, bw + 6, h); }
          ctx.fillStyle = colorAt(x, v);
          ctx.fillRect(xOf(G, x) - bw / 2, base - h, bw, h);
        }
      } else {
        const px = Math.floor(G.innerW);
        for (let p = 0; p < px; p++) {
          const x0 = Math.floor(p * Q / px), x1 = Math.max(x0 + 1, Math.floor((p + 1) * Q / px));
          let m = 0, arg = x0;
          for (let x = x0; x < x1; x++) if (vals[x] > m) { m = vals[x]; arg = x; }
          const v = m / norm;
          if (v <= 0 && !minH) continue;
          const h = Math.max(minH, v * G.hBars);
          if (halo && v > 0.04) { ctx.fillStyle = halo; ctx.fillRect(G.padL + p - 3, base - h, 7, h); }
          ctx.fillStyle = colorAt(arg, v);
          ctx.fillRect(G.padL + p, base - h, 1, h);
        }
      }
    }

    function dialsVisible() {
      const G = regGeom();
      return !lucky && step === 3 && r <= 16 && G.innerW / r >= 28 && specRe;
    }
    function dialAngles() {
      return peakCentres(r, Q).map((c) => Math.atan2(specIm[c], specRe[c]));
    }

    function drawRegister() {
      const { ctx } = hB;
      const G = regGeom();
      ctx.clearRect(0, 0, G.W, G.H);
      const base = G.yBars + G.hBars;

      if (lucky) {
        ctx.fillStyle = P.inkFaint; ctx.font = `italic 14px ${SERIF}`; ctx.textAlign = 'center';
        ctx.fillText(`gcd(${a}, ${N}) = ${gcd(a, N)}: the register is never switched on.`, G.W / 2, G.H / 2);
        return;
      }

      // --- the loupe: the first slots, with the value a^x mod N each holds ---
      // (after the transform the input register is gone; the row then carries
      // the phase dials, or a note)
      const cw = Math.min(64, G.innerW / G.nCells);
      const showText = cw >= 17;
      if (step < 3) {
        for (let x = 0; x < G.nCells; x++) {
          const X = G.padL + x * cw;
          const col = hueOf(x % r, r);
          let fillA = 0, strokeA = 0.35, textCol = rgba(RGB.faint, 0.6);
          const inComb = step === 2 && values[x] === yObs;
          if (step === 1) { fillA = 0.2; strokeA = 0.7; textCol = P.ink; }
          else if (step === 2) { fillA = inComb ? 0.3 : 0.035; strokeA = inComb ? 1 : 0.16; textCol = inComb ? P.ink : rgba(RGB.faint, 0.42); }
          const c0 = inComb ? RGB.goldB : col;
          if (fillA) { ctx.fillStyle = rgba(c0, fillA); ctx.fillRect(X + 1, G.yLoupe, cw - 2, G.hLoupe); }
          ctx.strokeStyle = step === 0 ? P.line : rgba(c0, strokeA);
          ctx.lineWidth = 1;
          ctx.strokeRect(X + 1.5, G.yLoupe + 0.5, cw - 3, G.hLoupe - 1);
          if (showText) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            if (step >= 1) { ctx.fillStyle = textCol; ctx.font = `11px ${MONO}`; ctx.fillText(String(values[x]), X + cw / 2, G.yLoupe + 15); }
            ctx.fillStyle = rgba(RGB.faint, 0.75); ctx.font = `8px ${MONO}`;
            ctx.fillText(String(x), X + cw / 2, G.yLoupe + G.hLoupe - 4);
          }
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint;
        const loupeCap = step === 0 ? [`the first ${G.nCells} of ${fmtInt(Q)} slots, magnified`, `slots 0–${G.nCells - 1}, magnified`] :
          step === 1 ? [`slot x holds ${a}ˣ mod ${N}; its colour is the place in the orbit`, `slot x holds ${a}ˣ mod ${N}`] :
          [`observed ${yObs}: only the slots with ${a}ˣ ≡ ${yObs} survive, at offset k = ${kOff}`, `observed ${yObs}: offset k = ${kOff}`];
        ctx.fillText(fit(ctx, loupeCap, G.innerW), G.padL, G.yLoupe + G.hLoupe + 15);

        // magnifier lines from the loupe down to its slots in the full register
        // a bracket marks which slots of the full register the loupe magnifies
        if (G.nCells < Q) {
          const xr = G.padL + G.nCells * G.innerW / Q;
          ctx.fillStyle = rgba(RGB.dim, 0.035);
          ctx.fillRect(G.padL, G.yBars, xr - G.padL, G.hBars);
          ctx.strokeStyle = rgba(RGB.dim, 0.35); ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(G.padL + 0.5, G.yBars - 1); ctx.lineTo(G.padL + 0.5, G.yBars - 5.5);
          ctx.lineTo(xr - 0.5, G.yBars - 5.5); ctx.lineTo(xr - 0.5, G.yBars - 1); ctx.stroke();
          if (xr < G.padL + G.innerW - 90) {
            ctx.font = `italic 10px ${SERIF}`; ctx.fillStyle = rgba(RGB.dim, 0.6);
            ctx.fillText('magnified above', xr + 6, G.yBars - 2);
          }
        }
      } else if (!morph && !dialsVisible()) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint;
        ctx.fillText(fit(ctx, ['the comb is gone: the transform has turned it into the spectrum below, and its offset survives only as phases', 'the comb has become the spectrum below'], G.innerW), G.padL, G.yLoupe + 18);
      }

      // --- the full register ---
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(G.padL, base + 0.5); ctx.lineTo(G.padL + G.innerW, base + 0.5); ctx.stroke();

      if (step === 0) {
        if (G.slotW >= 3) {
          ctx.fillStyle = rgba(RGB.line, 0.9);
          for (let x = 0; x < Q; x++) ctx.fillRect(xOf(G, x) - 0.5, base - 6, 1, 6);
        } else {
          ctx.fillStyle = rgba(RGB.line, 0.6); ctx.fillRect(G.padL, base - 6, G.innerW, 6);
        }
        ctx.fillStyle = P.inkFaint; ctx.font = `italic 14px ${SERIF}`; ctx.textAlign = 'center';
        ctx.fillText(fit(ctx, [`${fmtInt(Q)} slots, ${L} qubits, every one reading |0⟩`, `${L} qubits, all |0⟩`], G.innerW - 10), G.padL + G.innerW / 2, G.yBars + G.hBars * 0.5);
      } else if (step === 1) {
        // amplitudes on the comb's scale: 1/√Q everywhere, against 1/√M ≈ √(r/Q) after the observation
        const ones = new Float32Array(Q).fill(1 / Math.sqrt(r));
        const coloured = G.slotW >= 1.25;
        drawBars(ctx, G, ones, 1, (x) => coloured ? rgba(hueOf(x % r, r), 0.66) : rgba(RGB.azure, 0.36));
        ctx.textAlign = 'right'; ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint;
        ctx.fillText(fit(ctx, [`every slot at amplitude 1/√${fmtInt(Q)}`, `amplitude 1/√${fmtInt(Q)}`], G.innerW / 2), G.padL + G.innerW, base - G.hBars / Math.sqrt(r) - 6);
      } else if (step === 2) {
        const vals = new Float32Array(Q);
        for (let x = 0; x < Q; x++) vals[x] = combRe[x] > 0 ? 1 : (G.slotW >= 1.25 ? 1 / Math.sqrt(r) : 0); // ghosts of the old amplitude
        drawBars(ctx, G, vals, 1, (x) => (combRe[x] > 0 ? P.goldBright : rgba(hueOf(x % r, r), 0.07)));
        ctx.textAlign = 'right'; ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint;
        const amp = [`${fmtInt(combM)} survivors at amplitude 1/√${fmtInt(combM)}`, `amplitude 1/√${fmtInt(combM)}`];
        const tw = ctx.measureText(fit(ctx, amp, G.innerW / 2)).width;
        ctx.fillStyle = rgba(RGB.bg, 0.85); ctx.fillRect(G.padL + G.innerW - tw - 6, G.yBars + 3, tw + 6, 15);
        ctx.fillStyle = P.inkDim; ctx.fillText(fit(ctx, amp, G.innerW / 2), G.padL + G.innerW - 2, G.yBars + 14);
      } else if (step === 3) {
        if (morph) {
          const tt = Math.min(1, (clockNow(morph.kind) - morph.t0) / Math.max(1e-6, morph.dur));
          const S = morph.stages.length - 1;
          const pos = tt * S, i0 = Math.min(S - 1, Math.floor(pos)), f = pos - i0;
          const e = f * f * (3 - 2 * f);
          const A = morph.stages[i0], B = morph.stages[i0 + 1];
          let mA = 0, mB = 0;
          for (let x = 0; x < Q; x++) { if (A[x] > mA) mA = A[x]; if (B[x] > mB) mB = B[x]; }
          const vals = new Float32Array(Q);
          for (let x = 0; x < Q; x++) vals[x] = (1 - e) * A[x] / (mA || 1) + e * B[x] / (mB || 1);
          const col = lerpRGB(RGB.goldB, RGB.verd, tt);
          drawBars(ctx, G, vals, 1, (x, v) => rgba(col, 0.35 + 0.65 * Math.min(1, v * 1.4)));
          ctx.textAlign = 'left'; ctx.font = `italic 12px ${SERIF}`; ctx.fillStyle = P.inkDim;
          let lab = i0 < S - 1 ? `the FFT’s butterfly layer ${Math.min(L, i0 + 1)} of ${L}, which Shor’s circuit mirrors with ${L} one-qubit gates and ${L * (L - 1) / 2} two-qubit phase shifts`
            : 'the last layer leaves the answer bit-reversed: read the qubits backwards';
          if (ctx.measureText(lab).width > G.innerW) lab = i0 < S - 1 ? `butterfly layer ${Math.min(L, i0 + 1)} of ${L}` : 'reading the qubits backwards';
          ctx.fillText(lab, G.padL, G.yLoupe + 18);
          // layer ticks
          for (let i = 0; i < S; i++) {
            ctx.fillStyle = i <= i0 ? rgba(RGB.verd, 0.9) : P.line;
            ctx.fillRect(G.padL + i * 14, G.yLoupe + 28, 10, 3);
          }
          if (tt >= 1) { morph = null; dirtyB = true; updateHeads(); updateInfo(); }
        } else {
          // peak windows and their centres, E(r, Q)
          // Shor's windows |c − jQ/r| ≤ 1/2, one slot wide, where legible
          const cents = peakCentres(r, Q);
          if (G.slotW <= 12) {
            ctx.fillStyle = rgba(RGB.verdant, 0.07);
            for (let j = 0; j < r; j++) ctx.fillRect(G.padL + (j * Q / r) * G.slotW - 1, G.yBars, Math.max(2, G.slotW) + 2, G.hBars);
          }
          drawBars(ctx, G, spec, specMax, (x, v) => (mask && mask[x] ? rgba(RGB.verd, 0.55 + 0.45 * Math.min(1, v * 2)) : rgba(RGB.verd, 0.3 + 0.25 * v)), 0, rgba(RGB.verd, 0.09));
          // measured c
          if (lastC >= 0) {
            const X = xOf(G, lastC);
            ctx.strokeStyle = rgba(RGB.goldB, 0.85); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(X + 0.5, G.yBars); ctx.lineTo(X + 0.5, base); ctx.stroke();
            ctx.font = `11px ${MONO}`; ctx.textBaseline = 'alphabetic';
            const lab = `c = ${lastC}`;
            const tw = ctx.measureText(lab).width;
            const right = X + 6 + tw < G.padL + G.innerW;
            ctx.textAlign = right ? 'left' : 'right';
            ctx.fillStyle = rgba(RGB.bg, 0.85); ctx.fillRect(right ? X + 3 : X - tw - 7, G.yBars + 2, tw + 4, 14);
            ctx.fillStyle = P.goldBright; ctx.fillText(lab, right ? X + 5 : X - 5, G.yBars + 13);
          }
          // phase dials above the peaks: the offset lives only here
          if (dialsVisible()) {
            let ang = dialAngles();
            let tt = 1;
            if (dials) {
              tt = dials.dur ? Math.min(1, (clockNow(dials.kind) - dials.t0) / dials.dur) : 1;
              const e = tt * tt * (3 - 2 * tt);
              ang = dials.to.map((to, j) => { let d = to - dials.from[j]; d = Math.atan2(Math.sin(d), Math.cos(d)); return dials.from[j] + d * e; });
              if (tt >= 1) { dials = null; dirtyB = true; }
            }
            const Y = G.yLoupe + G.hLoupe / 2;
            const rad = G.innerW / r < 40 ? 7 : 8.5, hand = rad - 2.2;
            cents.forEach((c0, j) => {
              const X = Math.max(G.padL + rad + 0.5, xOf(G, c0));
              ctx.strokeStyle = rgba(RGB.verd, 0.22); ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(xOf(G, c0) + 0.5, Y + rad + 1.5); ctx.lineTo(xOf(G, c0) + 0.5, G.yBars); ctx.stroke();
              ctx.fillStyle = P.bg; ctx.strokeStyle = P.line;
              ctx.beginPath(); ctx.arc(X, Y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
              ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
              const hx = X + hand * Math.cos(-ang[j]), hy = Y + hand * Math.sin(-ang[j]);
              ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(hx, hy); ctx.stroke();
              ctx.lineCap = 'butt';
              ctx.fillStyle = P.goldBright; ctx.beginPath(); ctx.arc(hx, hy, 1.6, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = P.inkFaint; ctx.beginPath(); ctx.arc(X, Y, 1.1, 0, Math.PI * 2); ctx.fill();
            });
            ctx.textAlign = 'left'; ctx.font = `italic 11px ${SERIF}`;
            let cap = 'the phase of each peak: the comb’s offset survives only here, and no measurement can see it';
            if (ctx.measureText(cap).width > G.innerW - 20) cap = 'phases: the offset lives only here, unseen';
            const cwid = ctx.measureText(cap).width;
            ctx.fillStyle = rgba(RGB.bg, 0.92); ctx.fillRect(G.padL + 16, G.yLoupe + G.hLoupe + 6, cwid + 8, 15);
            ctx.fillStyle = P.inkFaint; ctx.fillText(cap, G.padL + 20, G.yLoupe + G.hLoupe + 17);
          }
        }
      }

      // axis
      ctx.textBaseline = 'alphabetic'; ctx.font = `10px ${MONO}`; ctx.fillStyle = P.inkFaint;
      ctx.textAlign = 'left'; ctx.fillText(step === 3 && !morph ? 'c = 0' : 'x = 0', G.padL, G.yAxis + 16);
      ctx.textAlign = 'right'; ctx.fillText(`${step === 3 && !morph ? 'Q' : 'Q'} = ${fmtInt(Q)}`, G.padL + G.innerW, G.yAxis + 16);
      if (step === 3 && !morph) {
        const cents = peakCentres(r, Q);
        const spacing = G.innerW / r;
        const rightW = ctx.measureText(`Q = ${fmtInt(Q)}`).width;
        const leftW = ctx.measureText('c = 0').width;
        ctx.textAlign = 'center';
        cents.forEach((c0, j) => {
          const X = xOf(G, c0);
          ctx.fillStyle = rgba(RGB.verdant, 0.8);
          ctx.fillRect(X - 0.5, G.yAxis + 2, 1, 4);
          const g = gcd(j, r);
          const lab = `${j / g}/${r / g}`;
          const hw = ctx.measureText(lab).width / 2;
          if (j > 0 && spacing >= 30 && X + hw < G.padL + G.innerW - rightW - 8 && X - hw > G.padL + leftW + 8) {
            ctx.fillStyle = mask && mask[c0] ? P.inkDim : rgba(RGB.crim, 0.75);
            ctx.fillText(lab, X, G.yAxis + 16);
          }
        });
      }

      // histogram of measured c
      if (step === 3 || shots.length) {
        const hb = G.yHistBase;
        ctx.strokeStyle = P.line; ctx.beginPath(); ctx.moveTo(G.padL, hb + 0.5); ctx.lineTo(G.padL + G.innerW, hb + 0.5); ctx.stroke();
        const hm = Math.max(4, histMax);
        if (G.slotW >= 1.25) {
          const bw = Math.max(1.5, Math.min(G.slotW * 0.8, 8));
          for (let c = 0; c < Q; c++) {
            if (!hist[c]) continue;
            const h = hist[c] / hm * G.hHist;
            ctx.fillStyle = mask && mask[c] ? rgba(RGB.verd, 0.9) : rgba(RGB.crim, 0.8);
            ctx.fillRect(xOf(G, c) - bw / 2, hb - h, bw, h);
          }
        } else {
          const px = Math.floor(G.innerW);
          for (let p = 0; p < px; p++) {
            const x0 = Math.floor(p * Q / px), x1 = Math.max(x0 + 1, Math.floor((p + 1) * Q / px));
            let s = 0, good = 0;
            for (let c = x0; c < x1; c++) { s += hist[c]; if (mask && mask[c]) good += hist[c]; }
            if (!s) continue;
            const h = Math.min(1, s / hm) * G.hHist;
            ctx.fillStyle = good * 2 >= s ? rgba(RGB.verd, 0.9) : rgba(RGB.crim, 0.8);
            ctx.fillRect(G.padL + p - 0.5, hb - h, 2, h);
          }
        }
        ctx.textAlign = 'left'; ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint;
        const hl = shots.length ? [`${shots.length} run${shots.length > 1 ? 's' : ''} · green outcomes name r at once, red ones do not`, `${shots.length} run${shots.length > 1 ? 's' : ''} · green names r, red does not`] : ['measured values of c will collect here', 'measurements collect here'];
        ctx.fillText(fit(ctx, hl, G.innerW - 70), G.padL, hb - G.hHist - 4);
      }

      // beads falling from the spectrum into the tally
      for (const b of beads) {
        const now = clockNow(b.kind);
        const t = b.dur ? (now - b.t0) / b.dur : 1;
        if (t < 0) continue;
        const e = Math.min(1, t) * Math.min(1, t);
        const X = xOf(G, b.c);
        const Y = G.yBars + e * (G.yHistBase - 4 - G.yBars);
        beadSprite.draw(ctx, X, Y, 1);
      }
    }
    function landBead(b) {
      hist[b.c]++; if (hist[b.c] > histMax) histMax = hist[b.c];
      dirtyB = true;
    }

    /* ---------- drawing: iii · Euclid's squares ---------- */
    function drawRect() {
      const { ctx, width: W, height: H } = hC;
      ctx.clearRect(0, 0, W, H);
      let c, QQ;
      if (lucky) { c = a; QQ = N; }
      else if (last && last.c > 0) { c = last.c; QQ = Q; }
      else {
        // placeholder: an empty c × Q frame
        const w = Math.min(W - 16, 320), h = Math.min(H - 16, w * 0.3);
        ctx.strokeStyle = rgba(RGB.azureDim, 0.45); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.strokeRect((W - w) / 2 + 0.5, (H - h) / 2 + 0.5, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = P.inkFaint; ctx.font = `italic 12px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(last && last.c === 0 ? 'c = 0: an empty rectangle' : 'a c × Q rectangle, waiting', W / 2, H / 2);
        return;
      }
      const runs = euclidRuns(c, QQ);
      const maxW = W - 16, maxH = H - 14;
      const s = Math.min(maxW / QQ, maxH / c);
      const w = QQ * s, h = c * s, x0 = (W - w) / 2, y0 = (H - h) / 2;
      let reveal = runs.length;
      let active = -1;
      if (cfAnim && !lucky) {
        const now = clockNow(cfAnim.kind);
        reveal = 0;
        cfAnim.levelsAt.forEach((t) => { if (now >= t) reveal++; });
        if (reveal < runs.length) active = reveal - 1;
        if (now >= cfAnim.t0 + cfAnim.total) reveal = runs.length;
      }
      ctx.strokeStyle = rgba(RGB.azure, 0.55); ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
      const cols = [RGB.azure, RGB.verd];
      for (const run of runs) {
        if (run.level >= reveal) break;
        const side = run.side * s;
        const col = cols[run.level % 2];
        const isActive = run.level === active;
        const X = x0 + run.x * s, Y = y0 + run.y * s;
        const len = run.n * side;
        ctx.fillStyle = rgba(col, isActive ? 0.2 : 0.08 + 0.02 * (run.level % 2));
        if (run.dir === 'x') ctx.fillRect(X, Y, len, side); else ctx.fillRect(X, Y, side, len);
        if (side >= 2.2) {
          ctx.strokeStyle = rgba(col, isActive ? 1 : 0.75);
          ctx.lineWidth = 1;
          for (let i = 0; i < run.n; i++) {
            const sx = run.dir === 'x' ? X + i * side : X, sy = run.dir === 'x' ? Y : Y + i * side;
            ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(0, side - 1), Math.max(0, side - 1));
          }
        }
        if (side >= 17) {
          ctx.fillStyle = rgba(col, 1); ctx.font = `${side >= 30 ? 11 : 9}px ${MONO}`;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(`${run.side}`, X + 4, Y + 3);
          if (run.n > 1 && side >= 30) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = rgba(col, 0.8); ctx.fillText(`×${run.n}`, X + side - 4, Y + side - 3); }
        }
      }
    }

    /* ---------- the loop ---------- */
    function frame() {
      // orbit notes arriving on the audio clock
      const actx = audio.getContext();
      if (actx && (edgeQueue.length || curRes >= 0)) {
        const now = actx.currentTime;
        while (edgeQueue.length && edgeQueue[0].at <= now) {
          const e = edgeQueue.shift();
          curRes = e.y; curUntil = e.until;
          if (e.idx >= 0) {
            litEdges = e.idx;
            if (e.idx === r) { rHeard = true; litEdges = -1; updateSteps(); updateInfoHeard(); }
          }
          dirtyA = true;
        }
        if (curRes >= 0 && now > curUntil && !edgeQueue.length) { curRes = -1; dirtyA = true; }
      }
      // beads landing
      if (beads.length) {
        dirtyB = true;
        for (let i = beads.length - 1; i >= 0; i--) {
          const b = beads[i];
          if (clockNow(b.kind) - b.t0 >= b.dur) { beads.splice(i, 1); landBead(b); }
        }
        if (!beads.length) updateInfo();
      }
      if (morph || dials) dirtyB = true;
      if (cfAnim) {
        dirtyC = true;
        syncConvHighlight(false);
        if (clockNow(cfAnim.kind) > cfAnim.t0 + cfAnim.total + 0.1) { cfAnim = null; syncConvHighlight(true); dirtyC = true; }
      }
      if (dirtyA) { dirtyA = false; drawOrbit(); }
      if (dirtyB) { dirtyB = false; drawRegister(); }
      if (dirtyC) { dirtyC = false; drawRect(); }
    }
    function updateInfoHeard() {
      info.set(`${a}ˣ mod ${N}: ${orb.join(' → ')} → 1 · the period r = ${r}, heard in ${r} notes · the powers fill 1 of ${phiN / r} coset${phiN / r > 1 ? 's' : ''} of the ${phiN} units (the faint polygons are the others). Each residue y sounds at 220·2^(y/${N}) Hz. For a 2,048-bit N the loop would be far too long to hear.`);
    }

    const loop = cv.rafLoop(frame);
    setLock(15, 7, null);
    loop.start();

    return {
      pause() { loop.stop(); cancelRun(); stopAllSound(); bus.mute(); litEdges = -1; curRes = -1; dirtyA = true; },
      resume() { bus.unmute(); dirtyAll(); loop.start(); },
      destroy() {
        loop.stop(); cancelRun(); stopAllSound(); bus.dispose();
        hA.destroy(); hB.destroy(); hC.destroy(); styleEl.remove();
      },
      // exposed for the verification harness only
      _debug: { doSuperpose, doObserve, doQFT, doMeasure, doSplit, shiftComb, manyRuns, useMultiples, runEngine, playOrbit, setLock, get state() { return { N, a, Q, r, step, lastC, rQuantum, shots: shots.length, split: splitRes, yObs, kOff, phases: specRe ? dialAngles().map((x) => +x.toFixed(3)) : null }; } },
    };
  },
};
