// II.5 — The Fourier Atelier
// Draw a closed curve; the DFT turns it into a chain of spinning circles that
// redraws it, and the same coefficients, folded pair by pair into a
// PeriodicWave, become a timbre. The phase-scramble button is the movement's
// thesis in one gesture: keep every |c_k|, randomize every arg(c_k) — the eye
// loses the drawing, the ear keeps the tone. A second bench sums sine series
// against time and puts the Gibbs horn under a loupe.

import { dft, idft, signedFreq, TAU, clamp } from '../../core/math.js';

/* ==================== pure machinery (node-testable) ==================== */

const N = 256;          // samples per closed curve
const RECON_N = 512;    // cached reconstruction resolution
const MAXH = 128;       // max audio harmonic folded from ±k
const MAXH_1D = 128;    // harmonics available to the 1-D series
const BARS_1D = 32;     // harmonics shown (and editable) in the 1-D strip
const SLOTS_2D = 32;    // the 2-D strip shows signed k from −32 to +32
const CACHE_N = 1024;   // 1-D waveform cache resolution
const F0 = 110;         // audio fundamental, Hz
const SI_PI = 1.8519370;              // Si(π): the Gibbs peak of Σ sin(jx)/j
const GIBBS = 0.089490;               // overshoot as a fraction of the jump
const TONE_RMS = 0.42;                // fixed tone power (disableNormalization)
// The K slider walks this ladder: every step is visible below 8, and the
// fine refinements above 32 no longer eat three quarters of the travel.
const K_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 64, 80, 96, 128];

// Resample a closed polyline ([{re,im}, …], last point joins first) to `n`
// points spaced uniformly by arc length. Crucial for clean coefficients:
// a hand moves at uneven speed, and uneven parametrization smears the spectrum.
function resampleUniform(pts, n) {
  const M = pts.length;
  const cum = new Float64Array(M + 1);
  let L = 0;
  for (let i = 0; i < M; i++) {
    const a = pts[i], b = pts[(i + 1) % M];
    L += Math.hypot(b.re - a.re, b.im - a.im);
    cum[i + 1] = L;
  }
  const out = new Array(n);
  if (L === 0) {
    for (let i = 0; i < n; i++) out[i] = { re: pts[0].re, im: pts[0].im };
    return out;
  }
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / n) * L;
    while (seg < M - 1 && cum[seg + 1] < s) seg++;
    const a = pts[seg], b = pts[(seg + 1) % M];
    const d = cum[seg + 1] - cum[seg];
    const t = d > 0 ? (s - cum[seg]) / d : 0;
    out[i] = { re: a.re + (b.re - a.re) * t, im: a.im + (b.im - a.im) * t };
  }
  return out;
}

// DFT coefficients -> polar form with signed frequency. Kept polar so that a
// phase scramble can preserve each magnitude float-for-float.
function toPolar(coeffs) {
  const n = coeffs.length;
  return coeffs.map((c, k) => ({
    k,
    freq: signedFreq(k, n),
    mag: Math.hypot(c.re, c.im),
    phase: Math.atan2(c.im, c.re),
  }));
}

// Evaluate the epicycle sum over the given coefficient indices at curve
// fraction `frac` ∈ [0,1). With ALL indices and frac = n/N this reproduces
// sample z_n exactly (e^{2πi·f·n/N} = e^{2πi·k·n/N} when f ≡ k mod N).
function evalChain(polar, indices, frac) {
  let re = 0, im = 0;
  for (const i of indices) {
    const p = polar[i];
    const a = p.phase + TAU * p.freq * frac;
    re += p.mag * Math.cos(a);
    im += p.mag * Math.sin(a);
  }
  return { re, im };
}

// Keep every magnitude (same float, bit for bit), randomize every phase except
// DC — c_0 is the centroid, and scrambling it would only shove the wreck
// off-center. The magnitude spectrum is preserved exactly.
function scramblePhases(polar, rand = Math.random) {
  return polar.map((p) =>
    p.freq === 0 ? { ...p } : { ...p, phase: rand() * TAU - Math.PI });
}

// Indices of the non-DC coefficients, loudest first (ties: lowest frequency).
function sortIdxByMag(polar) {
  return polar
    .map((_, i) => i)
    .filter((i) => polar[i].freq !== 0)
    .sort((a, b) =>
      polar[b].mag - polar[a].mag ||
      Math.abs(polar[a].freq) - Math.abs(polar[b].freq));
}

// Indices of the non-DC coefficients in the classical order: k = +1, −1, +2,
// −2, … — the textbook partial sum, which JPEG's logic (keep the loudest)
// beats at every K.
function sortIdxByFreq(polar) {
  return polar
    .map((_, i) => i)
    .filter((i) => polar[i].freq !== 0)
    .sort((a, b) =>
      Math.abs(polar[a].freq) - Math.abs(polar[b].freq) ||
      polar[b].freq - polar[a].freq);
}

// Parseval bookkeeping: fraction of AC energy Σ|c_k|² outside the first K of
// a given ordering of the AC indices.
function residualFor(polar, idx, K) {
  let tot = 0, inc = 0;
  idx.forEach((i, rank) => {
    const e = polar[i].mag * polar[i].mag;
    tot += e;
    if (rank < K) inc += e;
  });
  return tot > 0 ? Math.max(0, 1 - inc / tot) : 0;
}

// Parseval bookkeeping: fraction of AC energy Σ|c_k|² outside the K loudest.
function residualEnergy(polar, K) {
  return residualFor(polar, sortIdxByMag(polar), K);
}

// The coherent fold: Re Σ c_k e^{ikωt}, the horizontal shadow of the drawing.
// c = m e^{iφ} at +j contributes m·cosφ·cos − m·sinφ·sin, at −j contributes
// m·cosφ·cos + m·sinφ·sin. Kept for reference and tests; the atelier's ear
// uses foldEnergy below, because here partial j = |c_j + conj(c_−j)| depends
// on the phases, which would let a scramble change the timbre.
function foldToWave(polar, included, maxHarm = MAXH) {
  const real = new Float32Array(maxHarm + 1);
  const imag = new Float32Array(maxHarm + 1);
  for (const i of included) {
    const p = polar[i];
    const j = Math.abs(p.freq);
    if (j === 0 || j > maxHarm) continue;
    const re = p.mag * Math.cos(p.phase);
    const im = p.mag * Math.sin(p.phase);
    real[j] += re;
    imag[j] += p.freq > 0 ? -im : im;
  }
  return { real, imag };
}

// The energy fold the atelier plays: partial j gets amplitude
// √(|c_j|² + |c_−j|²), the combined size of the two circles ±j, and the phase
// of the larger of the two (negated for a backward circle, whose horizontal
// shadow is |c|cos(jωt − φ)). Amplitudes depend on magnitudes alone, so a
// phase scramble provably leaves every partial's strength untouched.
// PeriodicWave convention: real = cosine terms, imag = sine terms.
function foldEnergy(polar, included, maxHarm = MAXH) {
  const real = new Float32Array(maxHarm + 1);
  const imag = new Float32Array(maxHarm + 1);
  const e = new Float64Array(maxHarm + 1);
  const dom = new Float64Array(maxHarm + 1);
  const th = new Float64Array(maxHarm + 1);
  for (const i of included) {
    const p = polar[i];
    const j = Math.abs(p.freq);
    if (j === 0 || j > maxHarm) continue;
    e[j] += p.mag * p.mag;
    if (p.mag > dom[j]) { dom[j] = p.mag; th[j] = p.freq > 0 ? p.phase : -p.phase; }
  }
  for (let j = 1; j <= maxHarm; j++) {
    if (!(e[j] > 0)) continue;
    const A = Math.sqrt(e[j]);
    real[j] = A * Math.cos(th[j]);
    imag[j] = -A * Math.sin(th[j]);
  }
  return { real, imag };
}

// One period of Σ real_j cos(jt) + imag_j sin(jt), sampled at n points.
function waveSamples(real, imag, n = 512) {
  const out = new Float64Array(n);
  const H = real.length - 1;
  const js = [];
  for (let j = 1; j <= H; j++) if (real[j] || imag[j]) js.push(j);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    let s = 0;
    for (const j of js) s += real[j] * Math.cos(j * t) + imag[j] * Math.sin(j * t);
    out[i] = s;
  }
  return out;
}

// Octave-band envelope fit of a magnitude spectrum mags[1..H]: in each band
// j ∈ [2^b, 2^(b+1)) take the largest |c|, drop bands that sit at the noise
// floor (the median of the top ~40% of j — a hand's tremor, or the sampling's
// own rounding), skip the fundamental band (the overall size, not the decay
// law), and fit log|c| against log j. Returns the exponent p in |c| ≈ 1/j^p,
// or null when fewer than three bands rise above the floor (a smooth curve
// whose circles sink into the floor within a few octaves).
function decayFit(mags, H, opts = {}) {
  let max = 0;
  for (let j = 1; j <= H; j++) if (mags[j] > max) max = mags[j];
  if (!(max > 0)) return null;
  const tail = [];
  for (let j = Math.floor(H * 0.62); j <= H; j++) tail.push(mags[j]);
  tail.sort((a, b) => a - b);
  const floor = opts.exact ? max * 1e-9   // an exact series has no noise floor
    : Math.max(tail.length ? tail[tail.length >> 1] : 0, max * 1e-9);
  const bands = [];
  for (let b = 0; (1 << b) <= H; b++) {
    let best = 0, bj = 0;
    const hi = Math.min(H + 1, 1 << (b + 1));
    for (let j = 1 << b; j < hi; j++) if (mags[j] > best) { best = mags[j]; bj = j; }
    if (bj) bands.push({ b, j: bj, m: best, ok: b >= 1 && best > floor * 6 });
  }
  const use = bands.filter((x) => x.ok);
  let p = null, c0 = 0;
  if (use.length >= 3) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const c = use.length;
    for (const x of use) {
      const lx = Math.log(x.j), ly = Math.log(x.m);
      sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly;
    }
    const den = c * sxx - sx * sx;
    if (Math.abs(den) > 1e-12) {
      const slope = (c * sxy - sx * sy) / den;
      p = -slope;
      c0 = (sy - slope * sx) / c;          // log-intercept of the fitted line
    }
  }
  return { p, c0, floor, max, bands, used: use.length };
}

// |c_j| folded over ±j for a polar spectrum: max(|c_j|, |c_−j|), j = 1..N/2−1.
function foldedMags(polar) {
  const n = polar.length, H = (n >> 1) - 1;
  const m = new Float64Array(H + 1);
  for (let j = 1; j <= H; j++) m[j] = Math.max(polar[j].mag, polar[n - j].mag);
  return { mags: m, H };
}

// The measured decay exponent p in |c_k| ≈ 1/k^p (octave-band envelope fit
// above the noise floor). Null if too little signal rises above the floor.
function decayExponent(polar) {
  const { mags, H } = foldedMags(polar);
  const f = decayFit(mags, H);
  return f ? f.p : null;
}

// Words for a decay exponent. A pen cannot draw a jump, so in the atelier a
// 1/k spectrum means roughness (a trembling hand), never a tear.
function decayLabel(p, oneD = false) {
  if (p == null) return oneD ? 'too few terms to measure a slope'
    : 'smooth: the circles sink into the noise floor within a few octaves';
  if (p < 1.4) return oneD ? 'the 1/j law of a jump: buzzy'
    : 'the 1/k law of roughness, a trembling hand (a pen cannot draw a jump)';
  if (p < 2.3) return oneD ? 'the 1/j² law of a corner: mellower' : 'the 1/k² law of corners: mellower';
  if (p < 2.8) return 'between the laws of corners (1/k²) and of bends (1/k³): sharp turns';
  if (p < 3.4) return 'the 1/k³ law of sudden bends in curvature: soft';
  return 'faster than 1/k³: smooth, nearly a pure tone';
}

/* ---------- Gibbs anatomy ---------- */

// Si(x) = ∫₀ˣ sin t / t dt, Simpson's rule (plenty for the loupe and tests).
function sineIntegral(x) {
  if (x === 0) return 0;
  const n = 2000, h = x / n;
  let s = 1 + Math.sin(x) / x;
  for (let i = 1; i < n; i++) { const t = i * h; s += (i % 2 ? 4 : 2) * Math.sin(t) / t; }
  return (s * h) / 3;
}

// Limits of the successive ripple heights beside a jump, as signed fractions
// of the jump: Si(kπ)/π − ½ → +0.0895, −0.0486, +0.0331, −0.0250, +0.0201, …
// They never shrink with more terms; they only crowd closer to the edge.
function rippleLimits(n = 5) {
  const out = [];
  for (let k = 1; k <= n; k++) out.push(sineIntegral(k * Math.PI) / Math.PI - 0.5);
  return out;
}

/* ---------- preset curves (unit box, y down) ---------- */

function polylineSample(verts, per) {
  const out = [];
  const M = verts.length;
  for (let i = 0; i < M; i++) {
    const a = verts[i], b = verts[(i + 1) % M];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      out.push({ re: a[0] + (b[0] - a[0]) * t, im: a[1] + (b[1] - a[1]) * t });
    }
  }
  return out;
}

function catmullRomClosed(ctrl, per = 24) {
  const M = ctrl.length, out = [];
  for (let i = 0; i < M; i++) {
    const p0 = ctrl[(i - 1 + M) % M], p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % M], p3 = ctrl[(i + 2) % M];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push({
        re: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        im: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      });
    }
  }
  return out;
}

const SCRIPT_PTS = [
  [-0.85, 0.55], [-0.35, 0.32], [0.28, -0.05], [0.55, -0.5], [0.35, -0.78],
  [-0.05, -0.72], [-0.32, -0.35], [-0.28, 0.12], [0.1, 0.5], [0.6, 0.55],
  [0.85, 0.35],
];

function presetPoints(name) {
  if (name === 'square') {
    const s = 0.62;
    return polylineSample([[-s, -s], [s, -s], [s, s], [-s, s]], 90);
  }
  if (name === 'star') {
    const verts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 0.82 : 0.34;
      verts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return polylineSample(verts, 36);
  }
  if (name === 'egg') {
    const out = [];
    for (let i = 0; i < 360; i++) {
      const th = (i / 360) * TAU;
      const r = 0.62 + 0.09 * Math.cos(2 * th + 0.8) + 0.045 * Math.sin(3 * th);
      out.push({ re: r * Math.cos(th), im: r * Math.sin(th) });
    }
    return out;
  }
  // 'script' — a cursive letter through hand-placed control points
  return catmullRomClosed(SCRIPT_PTS, 24);
}

/* ---------- 1-D bench series ---------- */

// square: Σ sin((2m+1)x)/(2m+1)  — jumps, |b_j| ~ 1/j
// saw:    Σ sin(jx)/j            — jumps, |b_j| ~ 1/j
// triangle: Σ (−1)^m sin((2m+1)x)/(2m+1)² — kink only, |b_j| ~ 1/j²
function waveAmps1D(type, nH = MAXH_1D) {
  const b = new Float64Array(nH + 1);
  for (let j = 1; j <= nH; j++) {
    if (type === 'square') b[j] = j % 2 ? 1 / j : 0;
    else if (type === 'saw') b[j] = 1 / j;
    else if (type === 'triangle') b[j] = j % 2 ? ((((j - 1) / 2) % 2 ? -1 : 1) / (j * j)) : 0;
  }
  return b;
}

// Σ_{j ≤ K} b_j sin(jx): K counts harmonic index, not terms.
function partialSum1D(b, K, x) {
  let s = 0;
  const top = Math.min(K, b.length - 1);
  for (let j = 1; j <= top; j++) s += b[j] * Math.sin(j * x);
  return s;
}

// Σ_{j ≤ Kh} b_j sin(jx + φ_j) — the bench with (possibly scrambled) phases.
function partialSumPh(b, ph, Kh, x) {
  let s = 0;
  const top = Math.min(Kh, b.length - 1);
  for (let j = 1; j <= top; j++) if (b[j]) s += b[j] * Math.sin(j * x + (ph ? ph[j] : 0));
  return s;
}

// The harmonic index of the K-th nonzero term: the slider counts terms, so
// "K = 2" on the square wave means sin x + sin 3x / 3.
function termsToHarm(b, K) {
  let c = 0, last = 0;
  for (let j = 1; j < b.length; j++) {
    if (b[j] !== 0) { c++; last = j; if (c >= K) return j; }
  }
  return last;
}

// Level just past the jump at x = 0 and the jump's height, for the two
// jumping presets (square jumps −π/4 → π/4, saw −π/2 → π/2).
function jumpInfo(type) {
  if (type === 'square') return { edge: Math.PI / 4, jump: Math.PI / 2 };
  if (type === 'saw') return { edge: Math.PI / 2, jump: Math.PI };
  return null;
}

// Highest peak of the K-term partial sum just right of the jump, measured
// against the jump's edge as a signed fraction of the jump. The square's horn
// falls toward GIBBS from above (13.66% at K = 1, 10.02% at K = 2); the saw's
// rises toward it from below (−18.17% at K = 1).
function overshoot1D(type, K, b = null, ph = null) {
  const J = jumpInfo(type);
  if (!J) return null;
  const amps = b || waveAmps1D(type, MAXH_1D);
  const Kh = termsToHarm(amps, K);
  if (Kh < 1) return null;
  const hi = Math.min(Math.PI * 0.999, (3.2 * Math.PI) / (Kh + 1));
  const M = 320;
  let bx = 0, bv = -Infinity;
  for (let i = 1; i <= M; i++) {
    const x = (hi * i) / M, v = partialSumPh(amps, ph, Kh, x);
    if (v > bv) { bv = v; bx = x; }
  }
  // golden-section polish around the best sample
  let a = Math.max(1e-9, bx - hi / M), c = Math.min(Math.PI, bx + hi / M);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 40; it++) {
    const x1 = c - g * (c - a), x2 = a + g * (c - a);
    if (partialSumPh(amps, ph, Kh, x1) > partialSumPh(amps, ph, Kh, x2)) c = x2; else a = x1;
  }
  bv = Math.max(bv, partialSumPh(amps, ph, Kh, (a + c) / 2));
  return (bv - J.edge) / J.jump;
}

// Split canvas label text into runs: plain, ^{superscript} and _{subscript},
// so exponents and indices can be set small and raised instead of as '^'.
// Returns [[level, text], …] with level 0, 1 (sup) or −1 (sub).
function richParts(s) {
  const out = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === '^' || c === '_') && s[i + 1] === '{') {
      const j = s.indexOf('}', i + 2);
      if (j > 0) {
        if (buf) out.push([0, buf]);
        buf = '';
        out.push([c === '^' ? 1 : -1, s.slice(i + 2, j)]);
        i = j;
        continue;
      }
    }
    buf += c;
  }
  if (buf) out.push([0, buf]);
  return out;
}

function randomPhases(n, rand = Math.random) {
  const ph = new Float64Array(n + 1);
  for (let j = 1; j <= n; j++) ph[j] = rand() * TAU - Math.PI;
  return ph;
}

// Self-test for tests.html: the claims the exhibit prints, checked.
function selfTest() {
  const ok = (c, m) => { if (!c) throw new Error('fourier selfTest: ' + m); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const pts = resampleUniform(presetPoints('script'), N);
  const rt = idft(dft(pts));
  let err = 0;
  pts.forEach((p, i) => { err = Math.max(err, Math.hypot(p.re - rt[i].re, p.im - rt[i].im)); });
  ok(err < 1e-9, 'DFT round trip');
  const pol = toPolar(dft(pts));
  // Parseval: mean-square gap at the samples = left-out energy.
  const idx = sortIdxByMag(pol), K = 16, inc = [0, ...idx.slice(0, K)];
  let ms = 0;
  pts.forEach((p, n) => { const z = evalChain(pol, inc, n / N); ms += (p.re - z.re) ** 2 + (p.im - z.im) ** 2; });
  ms /= N;
  let left = 0;
  idx.slice(K).forEach((i) => { left += pol[i].mag ** 2; });
  ok(near(ms, left, 1e-9 + left * 1e-6), 'Parseval bookkeeping');
  // scramble keeps magnitudes bit for bit, and the energy fold keeps partials
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const scr = scramblePhases(pol, rnd);
  ok(scr.every((p, i) => p.mag === pol[i].mag), 'scramble keeps |c_k|');
  const incl = idx.slice(0, 48);
  const a = foldEnergy(pol, incl), b = foldEnergy(scr, incl);
  for (let j = 1; j <= MAXH; j++) {
    const A = Math.hypot(a.real[j], a.imag[j]), B = Math.hypot(b.real[j], b.imag[j]);
    ok(near(A, B, 1e-6 * Math.max(1e-9, A)), 'energy fold is phase-blind at j = ' + j);
  }
  // decay classes of the presets
  const p = (name) => decayExponent(toPolar(dft(resampleUniform(presetPoints(name), N))));
  ok(near(p('square'), 2, 0.25), 'square decays like 1/k²');
  ok(near(p('star'), 2, 0.3), 'star decays like 1/k²');
  ok(p('egg') > 3.4, 'egg decays faster than 1/k³');
  // Gibbs numbers printed on the bench
  ok(near(overshoot1D('square', 1), 0.13662, 2e-4), 'square overshoot, one term');
  ok(near(overshoot1D('square', 2), 0.10021, 2e-4), 'square overshoot, two terms');
  ok(overshoot1D('square', 64) >= GIBBS - 1e-5, 'square horn never sinks below Gibbs');
  ok(near(overshoot1D('saw', 1), -0.18169, 2e-4), 'saw starts below the edge');
  const rl = rippleLimits(5);
  ok(near(rl[0], GIBBS, 2e-6), 'Gibbs constant');
  ok(near(2 * sineIntegral(Math.PI), 2 * SI_PI, 2e-6), 'Si(π)');
  ok(near(rl[1], -0.04859, 2e-5) && near(rl[4], 0.02011, 2e-5), 'ripple ladder');
  // the saw's horn climbs toward the limit from below and never passes it
  let prev = -Infinity;
  for (let k = 1; k <= 24; k++) {
    const o = overshoot1D('saw', k);
    ok(o >= prev - 1e-9 && o <= GIBBS + 1e-6, 'saw overshoot rises toward Gibbs, K = ' + k);
    prev = o;
  }
  // a lone backward circle sounds as its own horizontal shadow, |c| cos(jt − φ)
  const lone = pol.map((q) => ({ ...q, mag: 0 }));
  lone[N - 5] = { ...lone[N - 5], mag: 0.3, phase: -1.1 };
  const lw = foldEnergy(lone, [N - 5]);
  const ws = waveSamples(lw.real, lw.imag, 64);
  ws.forEach((v, i) => ok(near(v, 0.3 * Math.cos(5 * (i / 64) * TAU + 1.1), 1e-6), 'backward circle shadow'));
  // canvas labels: exponents and indices parse out
  ok(JSON.stringify(richParts('1/k^{2.4}')) === '[[0,"1/k"],[1,"2.4"]]', 'richParts sup');
  ok(JSON.stringify(richParts('|c_{k}|')) === '[[0,"|c"],[-1,"k"],[0,"|"]]', 'richParts sub');
  return true;
}

/* ==================== text ==================== */

const PROSE = `
    <p>On 21 December 1807 a memoir on the propagation of heat in solid bodies was read to the
    Institut in Paris. Its author, Joseph Fourier, was then prefect of the Isère, governing
    from Grenoble; nine years earlier he had sailed with Napoleon’s army to Egypt as a
    scientific adviser. Inside the memoir was one of the most consequential claims in
    mathematics: that <em>any</em> function, however jagged, kinked or freehand, can be
    assembled from perfectly smooth waves. Lagrange and Laplace, on the committee that judged
    it, objected to exactly that claim, and the memoir was refused publication; the full theory
    reached print only in 1822, as the <em>Théorie analytique de la chaleur</em>. In 1829
    Dirichlet proved the claim honest for any curve one could reasonably draw, and in 1873
    Paul du Bois-Reymond built a continuous function whose series diverges at a point, so
    “any” had been a promise too far.</p>
    <p>The atelier below takes Fourier literally. Sketch a closed shape and it is sampled at
    <code>N = 256</code> points spaced evenly along the stroke, each a complex number
    <code>z<sub>n</sub> = x<sub>n</sub> + iy<sub>n</sub></code>. The transform
    <code>c<sub>k</sub> = (1/N) Σ z<sub>n</sub> e<sup>−2πikn/N</sup></code> turns the
    stroke into a recipe of circles: the <em>k</em>-th has radius |c<sub>k</sub>| and turns
    <em>k</em> times per lap, backward when <em>k</em> is negative. Chain them tip to tail,
    loudest first, and the free end redraws your hand. This is Ptolemy’s astronomy turned
    inside out, circles riding on circles, and the old sneer that enough epicycles can fit
    anything turns out to be a theorem rather than an insult: in 1900 Lipót Fejér proved that
    if the circles are added slowest first and the successive chains are averaged, the
    average converges at every point of every continuous closed curve. The slider keeps
    only <em>K</em> circles, the largest unless you ask for the slowest, and Parseval’s
    identity keeps the books. The mean-square gap between your drawing and the chain’s is
    exactly <code>Σ|c<sub>k</sub>|²</code> over the circles left out, the left-out energy
    printed on the plate.</p>
    <p>Nor did the circles stay on paper. In 1872 William Thomson, the future Lord Kelvin,
    had a machine built in London that summed ten tidal components, each on a crank geared
    to one of the tide’s astronomical rhythms, and it could draw a year of one harbour’s
    tides in about four hours. Albert Michelson and Samuel Stratton, at the University of
    Chicago, called Kelvin’s the only practical instrument yet devised for adding harmonic
    motions, but its cord, they wrote, stretched too much to take many terms; in January 1898
    they described a machine of eighty elements that added the pull of springs instead, with
    periods running “in regular succession from one to eighty” and a pen to record the sum.
    The fastest arithmetic is older than any of these machines. In the autumn of 1805,
    fitting curves to the orbits of the new asteroids Pallas and Juno, Carl Friedrich Gauss
    split a transform of length <code>N₁N₂</code> into many small ones, the method we now call
    the fast Fourier transform, and left it in a Latin manuscript printed only in 1866, after
    his death. James Cooley and John Tukey published it afresh in 1965; Tukey had the idea
    at a meeting of President Kennedy’s Science Advisory Committee, where the talk included
    detecting Soviet nuclear tests from offshore seismometers. The atelier computes its 256
    coefficients the slow way, 65,536 products, because at this size nobody can tell.</p>
    <p>Now press <em>listen</em>. Each pair of circles ±<em>j</em> becomes one partial of a
    single tone on a 110&nbsp;Hz fundamental, the <em>j</em>-th harmonic, as strong as the two
    circles together. Here is the movement’s jewel: how fast |c<sub>k</sub>| dies as <em>k</em> grows
    tracks how smooth your curve is and, to the ear, how mellow it sounds. A genuine jump
    forces the coefficients to fade like <code>1/k</code>, which the ear hears as a reedy
    buzz. A corner, a kink in direction rather than a tear in position and the sharpest thing
    a pen can actually draw, gives <code>1/k²</code>, softer. A smooth egg’s circles shrink
    faster still, and it sounds almost like a pure tone. We met the corner’s law on the
    <a href="#ex-monochord">monochord</a>: a plucked string starts as a triangle with one
    corner, and its partials fall like <code>1/n²</code>. Draw a star, then an egg, and the
    small log–log plot on the plate measures the slope while you hear it; a trembling hand
    lays a floor of roughness under the whole spectrum, and the plot draws that floor rather
    than mistaking it for a tear.</p>
    <p>The second bench strips the story to a single wave against time, and the spectrum strip
    serves both benches, because it is the same machinery. Drag its bars and you mix a voice
    from near-pure partials by hand, as the drawbars of a Hammond organ have done since 1935.
    A square wave needs every odd harmonic at amplitude <code>1/j</code>, and cutting the
    series off anywhere leaves a horn beside each jump: 13.7% of the jump with one term, 10.0%
    with two, and then, as <em>K</em> grows, a horn that narrows but <em>never dies
    away</em>, settling at 8.95% and sinking no further. Henry Wilbraham, a young graduate of
    Trinity College, Cambridge, described it in 1848, and the paper was all but
    forgotten.</p>
    <p>It came back through the letters page of <em>Nature</em>. On 6 October 1898 the journal
    printed Michelson, writing from Chicago about the sawtooth series
    <code>2(sin x − ½ sin 2x + ⅓ sin 3x − …)</code>. He found “the idea that a real
    discontinuity can replace a sum of continuous curves” so “utterly at variance with the
    physicists’ notions of quantity” that he set the problem out plainly, so that the
    mathematicians could “at once point to the inconsistency if any there be.” J. Willard
    Gibbs replied from New Haven, describing the limit as a clean zigzag, and in
    <em>Nature</em> of 27 April 1899 wrote again “to correct a careless error”: the vertical
    strokes reach beyond the slanted ones. The differences of opinion, he added, came mostly
    from writers who meant the limit of the graphs and writers who meant the graph of the
    limit. Maxime Bôcher worked out the anatomy in 1906, calling it “the remarkable
    phenomenon first noticed by Gibbs,” and the name stayed with the second discoverer. The
    atelier can show only a gentler cousin, since no pen draws a jump: at low <em>K</em> a
    ripple runs along each straight edge and bunches at the corners, the integral of a horn,
    and unlike the horn it fades as the circles multiply.</p>
    <p>Every coefficient is two numbers, a magnitude and a phase, and the scramble button
    splits them apart: it keeps every |c<sub>k</sub>| to the last bit and throws every
    arg(c<sub>k</sub>) to chance. The two senses part company on the spot. The drawing collapses into a tumbleweed,
    because the eye needs the circles to line up: <em>shape lives in phase</em>. The tone
    barely flinches, because to a good first approximation the ear takes the magnitudes and
    lets the rest go: <em>timbre lives in magnitude</em>. Engineers met the same division of
    labour in pictures and in speech. In 1981 Alan Oppenheim and Jae Lim gathered the evidence
    that, in some situations, “many of the important features of a signal are preserved if
    only the phase is retained,” and the same fact is why an X-ray crystallographer, whose detector records only
    the strength of each diffracted ray, must win back every lost phase. One list of complex
    numbers, factored two ways by two organs: a piece of geometry and a piece of music that are
    the same mathematical object, which is this whole movement’s claim compressed into a
    button.</p>`;

const TODAY = `
    <p>A JPEG rounds away the faint cosine coefficients of every 8×8 block and keeps the
    strong ones, the <em>K</em> slider’s bargain in two dimensions
    (<a href="#ex-lossy">The Art of Forgetting</a>), and an MRI scanner never photographs the
    body at all: it samples the Fourier transform of a slice and rebuilds the image by running
    this atelier backwards. <a href="#ex-shor">Shor’s algorithm</a> hunts a hidden period
    with the same transform, spread across qubits.</p>
    <p>The scramble button has a twin the size of a planet. The Event Horizon Telescope, which
    on 10 April 2019 published the first image of a black hole’s shadow, in the galaxy M87,
    measures the Fourier transform of the sky, one spatial frequency for each pair of radio
    dishes at each moment. At its wavelength of 1.3 millimetres the phase recorded at each
    dish is thrown off by errors of that dish’s own, the very damage the scramble button does
    to a drawing, and the way back is the <em>closure phase</em>: add the phases around a
    triangle of three dishes and each station’s error cancels. X-ray crystallography loses its
    phases outright, and Herbert Hauptman and Jerome Karle shared the 1985 Nobel Prize in
    Chemistry for direct methods that win them back, leaning on the plain fact that electron
    density is never negative.</p>
    <p>In machine learning the transform has become a building block. A Fourier neural
    operator (Zongyi Li and colleagues, 2020) takes the transform of its input, applies learned
    weights to the lowest modes, discards the rest and transforms back: the <em>K</em> slider,
    made trainable. FourCastNet, built on the idea in 2022, produces a
    week-long global weather forecast in under two seconds.</p>`;

const LEGEND = `
    <p>Georg Ohm, the Ohm of electrical resistance, proposed in 1843 that the ear performs its
    own Fourier analysis, hearing a tone as a bundle of sinusoidal partials. August Seebeck
    objected, and Hermann von Helmholtz, in his <em>Lehre von den Tonempfindungen</em> of 1863
    (in English, <em>On the Sensations of Tone</em>), answered him and went further. He drove
    tuning forks with electromagnets, slid the phase of each partial by shading the mouths of
    their resonance chambers, and reported, in A. J. Ellis’s translation, “I have never
    experienced the slightest difference in the quality of tone.” The quality of the musical
    portion of a compound tone, he concluded, “depends solely on the number and relative strength of its partial
    simple tones, and in no respect on their differences of phase.” That sentence is the
    licence for the scramble button.</p>
    <p>Stated absolutely, it is a legend. In 1969 R. Plomp and H. J. M. Steeneken synthesized
    tones of equal loudness and pitch by computer and found that phase does change timbre,
    though its largest effect was smaller than tilting the spectrum by 2&nbsp;dB per octave,
    and weaker for high tones than for low ones, and the atelier’s 110&nbsp;Hz fundamental is
    a low one. The atelier holds the tone’s power fixed, as they held its loudness, so what a
    scramble changes is phase alone. Listen and judge the approximation yourself: the shape
    dies utterly, and the tone changes, if at all, far less than the picture does.</p>`;

/* ==================== the exhibit ==================== */

export default {
  id: 'fourier',
  movement: 2,
  title: 'The Fourier Atelier',
  hook: 'Draw any shape; circles rebuild it, and the same numbers become its voice.',
  era: '1805 – today · Grenoble, Paris, London, Chicago, New Haven',
  prose: PROSE,

  chronicle: [
    { year: 1805, date: 'autumn 1805', text: 'In Brunswick, fitting orbits to the new asteroids Pallas and Juno, Carl Friedrich Gauss works out a fast way to compute trigonometric coefficients, the method now called the <em>fast Fourier transform</em>; his Latin manuscript is printed only in 1866.' },
    { year: 1822, date: '1822', text: 'Joseph Fourier’s <em>Théorie analytique de la chaleur</em> is published in Paris, fifteen years after his memoir claiming that any function can be built from sines and cosines was read to the Institut.' },
    { year: 1848, date: '1848', text: 'Henry Wilbraham, a young Cambridge graduate, describes in the <em>Cambridge and Dublin Mathematical Journal</em> the overshoot of a Fourier series beside a jump, and is forgotten.' },
    { year: 1872, date: '1872', text: 'A. Légé & Co. of London build William Thomson’s tide-predicting machine, which sums ten tidal components on geared cranks and pulleys and draws a harbour’s tides for a year in about four hours.' },
    { year: 1898, date: 'January 1898', text: 'Albert Michelson and Samuel Stratton of the University of Chicago describe a harmonic analyser of eighty elements, summing the pull of springs where Kelvin’s tide machine had used a cord.' },
    { year: 1899, date: '27 April 1899', text: 'In <em>Nature</em>, J. Willard Gibbs corrects his letter of December: beside a jump the partial sums of a Fourier series overshoot by an amount that never shrinks away, so the limit of their graphs is not the graph of their limit.' },
    { year: 1965, date: '1965', text: 'James Cooley and John Tukey publish the fast Fourier transform in <em>Mathematics of Computation</em>; Tukey had the idea at a meeting of President Kennedy’s Science Advisory Committee where the talk included detecting Soviet nuclear tests.' },
    { year: 2019, date: '10 April 2019', text: 'The Event Horizon Telescope, which samples the Fourier transform of the sky with pairs of radio dishes, publishes the first image of a black hole’s shadow, in the galaxy M87.' },
  ],

  today: TODAY,

  sources: [
    { text: 'J. J. O’Connor and E. F. Robertson, “Jean Baptiste Joseph Fourier,” MacTutor History of Mathematics', url: 'https://mathshistory.st-andrews.ac.uk/Biographies/Fourier/' },
    { text: 'M. T. Heideman, D. H. Johnson and C. S. Burrus, “Gauss and the history of the fast Fourier transform,” <em>IEEE ASSP Magazine</em> 1(4) (1984) 14–21; and D. N. Rockmore, “The FFT: an algorithm the whole family can use,” <em>Computing in Science &amp; Engineering</em> 2(1) (2000) 60–64', url: 'https://doi.org/10.1109/MASSP.1984.1162257' },
    { text: 'A. A. Michelson and S. W. Stratton, “A new harmonic analyzer,” <em>American Journal of Science</em> (4) 5 (1898) 1–13', url: 'https://doi.org/10.2475/ajs.s4-5.25.1' },
    { text: 'A. A. Michelson, “Fourier’s series,” <em>Nature</em> 58 (1898) 544–545, with J. W. Gibbs’s letters of the same title, <em>Nature</em> 59 (1898) 200 and 59 (1899) 606', url: 'https://doi.org/10.1038/058544b0' },
    { text: 'M. Bôcher, “Introduction to the theory of Fourier’s series,” <em>Annals of Mathematics</em> 7 (1906) 81–152', url: 'https://doi.org/10.2307/1967238' },
    { text: 'E. Hewitt and R. E. Hewitt, “The Gibbs–Wilbraham phenomenon: an episode in Fourier analysis,” <em>Archive for History of Exact Sciences</em> 21 (1979) 129–160', url: 'https://doi.org/10.1007/BF00330404' },
    { text: 'H. von Helmholtz, <em>On the Sensations of Tone</em>, trans. A. J. Ellis, 4th ed. (1912, reprinting the revised 2nd ed. of 1885), pp. 119–126', url: 'https://archive.org/details/onsensationston01helmgoog' },
    { text: 'R. Plomp and H. J. M. Steeneken, “Effect of phase on the timbre of complex tones,” <em>J. Acoust. Soc. Am.</em> 46 (1969) 409–421', url: 'https://doi.org/10.1121/1.1911705' },
    { text: 'A. V. Oppenheim and J. S. Lim, “The importance of phase in signals,” <em>Proceedings of the IEEE</em> 69 (1981) 529–541', url: 'https://doi.org/10.1109/PROC.1981.12022' },
    { text: 'The Event Horizon Telescope Collaboration, “First M87 Event Horizon Telescope Results. IV. Imaging the Central Supermassive Black Hole,” <em>ApJ Letters</em> 875 (2019) L4', url: 'https://doi.org/10.3847/2041-8213/ab0e85' },
  ],

  alt: 'A drafting plate on which a closed curve is redrawn in gold by a chain of spinning azure circles, beside two small instruments, one period of the tone the same numbers make and a log–log plot of how fast the circles shrink; beneath, the spectrum as a strip of bars with a dashed waterline and a phase hand on each. A second bench sums sine waves against time and magnifies the Gibbs horn beside each jump.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const SERIF = getComputedStyle(document.body).fontFamily || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const LABEL = '#8a8676';                       // legible small text
    const GHOST = P.inkGhost || '#4a4840';
    const CRIM = P.crimsonBright || '#d97a68';
    const mq = (q) => (window.matchMedia ? window.matchMedia(q) : null);
    const RM = !!(mq('(prefers-reduced-motion: reduce)') || {}).matches;
    const COARSE = !!(mq('(pointer: coarse)') || {}).matches;

    /* ---------- scoped style ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-fourier .fr-tabs { gap: .45rem; margin: 0 0 .8rem; }
      #ex-fourier .fr-tabs .btn { letter-spacing: .04em; }
      #ex-fourier .fr-tabs .btn .fr-num { font-style: italic; color: ${P.azure}; margin-right: .45em; }
      #ex-fourier .fr-tabs .btn.active { border-color: ${P.azure}; background: rgba(125,167,217,.12); color: ${P.ink}; }
      #ex-fourier canvas.fr-cv { cursor: crosshair; touch-action: ${COARSE ? 'pan-y' : 'none'}; outline: none; }
      #ex-fourier canvas.fr-cv.fr-armed { touch-action: none; }
      #ex-fourier canvas.fr-cv:focus-visible { outline: 2px solid ${P.azure}; outline-offset: 2px; }
      #ex-fourier .fr-presets .btn.active { border-color: ${P.gold}; color: ${P.goldBright}; }
      #ex-fourier sub, #ex-fourier sup { line-height: 0; }
    `;
    stage.appendChild(styleEl);

    /* ---------- state ---------- */
    let view = '2d';            // '2d' atelier | '1d' bench
    let samples = null;         // resampled curve, N pts, unit coords
    let polarOrig = null;       // polar spectrum as drawn
    let polar = null;           // displayed (possibly scrambled, or mid-morph)
    let polarGoal = null;       // where the phases are heading
    let scrambled = false;
    let orderMode = 'mag';      // 'mag' loudest first | 'freq' lowest first
    let order = [], magOrder = [], freqOrder = [];
    let included = [];
    let inclFlags = new Uint8Array(N);
    let maxMagV = 0, waterMag = 0;
    let residMag = 0, residFreq = 0;
    let fit2 = null, mags2 = null;
    let kIdx = K_STEPS.indexOf(24);
    let K = K_STEPS[kIdx];
    let recon = null, reconN = 0;
    let frac = 0;
    const PERIOD = 12;          // seconds per lap
    let lapLeft = RM ? PERIOD : Infinity;   // reduced motion: one lap per action
    let morph = null;           // phase unravel/ravel animation
    let preset = 'script';

    let drawing = false;
    let awaiting = false;       // stroke released, DFT pending (debounce)
    let rawStroke = [];
    let dirtyTrunc = false;
    let armed = false;          // coarse pointers: drawing needs arming

    let type1d = 'square';
    let amps1d = waveAmps1D('square');
    let phases1d = new Float64Array(MAXH_1D + 1);
    let scrambled1d = false;
    let kh1d = 1;
    let nTerms1d = 1;           // nonzero terms actually summed (≤ K)
    let cache1d = new Float64Array(CACHE_N);
    let cache1dMax = 0;
    let dirty1d = true;
    let scroll1d = 0;
    let dragBar = false;
    let over1d = null;
    let fit1 = null;

    let tone = null;            // {real, imag, wave, peak, rms, scale}
    let hoverIdx = -1;          // polar index hovered in the 2-D strip
    let hoverHarm = 0;          // harmonic hovered in the 1-D strip
    let soloActive = false;
    let questDone = false;
    let layerDirty = true;

    let listening = false;
    let toneOsc = null, toneGain = null, soloV = null;
    let dftTimer = 0, waveTimer = 0, dipTimer = 0, resizeTimer = 0;
    const TONE_LEVEL = 0.28;

    const bus = audio.createBus('fourier');

    /* ---------- layout / canvas ---------- */
    const INS_ROW = 124;
    const stageInnerW = () => {
      const cs = getComputedStyle(stage);
      return Math.max(240, stage.getBoundingClientRect().width -
        parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
    };
    const stripH = (w) => (w < 480 ? 104 : 118);
    const heightFor = (w) => {
      if (w >= 760) return 560;
      return Math.round(clamp(w * 0.8, 240, 390)) + INS_ROW + stripH(w);
    };

    const tabs = ui.controlRow(stage);
    tabs.classList.add('fr-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Fourier atelier benches');
    const tabBtns = {};
    for (const [key, num, label] of [['2d', 'i', 'the atelier'], ['1d', 'ii', 'the bench']]) {
      const b = ui.button(tabs, label, () => setView(key), { small: true });
      b.innerHTML = `<span class="fr-num">${num}</span>${label}`;
      b.setAttribute('role', 'tab');
      tabBtns[key] = b;
    }

    const copts = { height: heightFor(stageInnerW()) };
    const handle = cv.setupCanvas(stage, copts);
    const cnv = handle.canvas;
    cnv.classList.add('fr-cv');
    cnv.tabIndex = 0;
    cnv.setAttribute('aria-label',
      'Fourier atelier. Draw a closed shape with a pointer; arrow keys step through the spectrum bars, and in the bench up and down set the selected bar.');
    const glow = cv.glowSprite(P.goldBright, 28);
    const glowA = cv.glowSprite(P.azure, 18);
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');
    const hasLS = 'letterSpacing' in handle.ctx;
    let L = null;

    const quest = ui.questBanner(stage,
      'Press <em>♪ listen</em>, then <em>⌀ scramble the phases</em> while the tone plays, and watch what survives.');

    const rowP = ui.controlRow(stage);
    rowP.classList.add('fr-presets');
    const presetBtns = {};
    for (const [key, label] of [['square', 'square'], ['star', 'star'], ['egg', 'egg'], ['script', 'script ℯ']]) {
      presetBtns[key] = ui.button(rowP, label, () => loadPreset(key), { small: true });
    }
    const clearB = ui.button(rowP, 'clear', doClear, { small: true });
    const benchBtns = {};
    for (const [key, label] of [['square', 'square wave'], ['saw', 'sawtooth'], ['triangle', 'triangle']]) {
      benchBtns[key] = ui.button(rowP, label, () => load1d(key), { small: true });
    }
    const armB = COARSE ? ui.button(rowP, '✎ draw', () => setArmed(!armed), { small: true }) : null;
    if (armB) armB.setAttribute('aria-pressed', 'false');

    const rowC = ui.controlRow(stage);
    const kSlider = ui.slider(rowC, {
      label: 'terms K', min: 0, max: K_STEPS.length - 1, step: 1, value: kIdx,
      format: (v) => String(K_STEPS[clamp(Math.round(v), 0, K_STEPS.length - 1)]),
      onInput: (v) => {
        kIdx = clamp(Math.round(v), 0, K_STEPS.length - 1);
        K = K_STEPS[kIdx];
        dirtyTrunc = true; dirty1d = true;
      },
    });
    const listenBtn = ui.button(rowC, '♪ listen', toggleListen, { primary: true });
    listenBtn.setAttribute('aria-pressed', 'false');
    const scrambleB = ui.button(rowC, '⌀ scramble the phases', doScramble);
    const restoreB = ui.button(rowC, '↺ restore the phases', doRestore);
    restoreB.disabled = true;
    const orderSel = ui.select(rowC, {
      label: 'circle order',
      options: [{ value: 'mag', label: 'loudest first' }, { value: 'freq', label: 'lowest first' }],
      value: 'mag',
      onChange: (v) => { orderMode = v === 'freq' ? 'freq' : 'mag'; dirtyTrunc = true; kickLap(); },
    });

    const info = ui.readout(stage, '');
    const mathEl = ui.mathline(stage, '');
    const captionEl = ui.caption(stage, '');
    ui.legendPanel(stage, LEGEND, 'the ear that ignored phase');

    // Formulas never break inside; the words around them may wrap on a phone.
    const nw = (h) => `<span style="white-space:nowrap">${h}</span>`;
    const MATH_2D = nw('z<sub>n</sub> ⟶ c<sub>k</sub> = (1/N) Σ<sub>n</sub> z<sub>n</sub> e<sup>−2πi·kn/N</sup>') + '<br>' +
      `circle k: radius ${nw('|c<sub>k</sub>|,')} ${nw('k turns per lap')}<br>` +
      `partial j: ${nw('√(|c<sub>j</sub>|² + |c<sub>−j</sub>|²)')} ${nw('at j·110 Hz')}`;
    const MATH_1D = nw('f(t) ≈ Σ<sub>j</sub> b<sub>j</sub> sin(jωt + φ<sub>j</sub>)') + '<br>' +
      `partial j: ${nw('|b<sub>j</sub>|')} ${nw('at j·110 Hz')}<br>` +
      `horn beside a jump: ${nw('Si(π)/π − ½')} ${nw('= 8.95% of the jump')}`;
    const CAP_2D = 'The strip along the foot is the spectrum, and both benches share it: hover or tap a bar, or ' +
      'step through the bars with the arrow keys, to light its circle and, while listening, solo its partial. ' +
      'The dashed waterline marks the faintest circle still inside <em>K</em>; the small hand on each bar is ' +
      'its phase, the only thing the scramble button touches.';
    const CAP_1D = 'Here the bars are sliders: drag one, or select it and press the arrow keys, to sculpt the wave ' +
      'by hand. The loupe beside the wave stretches with <em>K</em> to keep the horn in view. Its ripples ' +
      'settle toward fixed heights, about 8.95%, 4.86%, 3.31%, 2.50% and 2.01% of the jump, and more terms ' +
      'only squeeze them closer to the edge.';

    /* ---------- layout ---------- */
    function computeLayout() {
      const W = handle.width, H = handle.height;
      const sh = stripH(W);
      const wide = W >= 760;
      const narrow = W < 480;
      const o = { W, H, wide, narrow };
      if (wide) {
        const side = Math.round(clamp(W * 0.26, 220, 272));
        const mh = Math.max(120, H - sh);
        o.main = { x: 0, y: 0, w: W - side, h: mh };
        const gx = W - side + 2, gw = side - 16, gap = 14;
        const ih = Math.max(60, (mh - gap * 3) / 2);
        o.insA = { x: gx, y: gap, w: gw, h: ih };
        o.insB = { x: gx, y: gap * 2 + ih, w: gw, h: ih };
      } else {
        const mh = Math.max(120, H - sh - INS_ROW);
        o.main = { x: 0, y: 0, w: W, h: mh };
        const gap = 10, iw = Math.max(40, (W - gap * 3) / 2), ih = INS_ROW - gap - 6;
        o.insA = { x: gap, y: mh + 2, w: iw, h: ih };
        o.insB = { x: gap * 2 + iw, y: mh + 2, w: iw, h: ih };
      }
      const sy = H - sh;
      const pad = narrow ? 24 : 44;
      o.strip = { y: sy, h: sh, pad, innerW: Math.max(40, W - pad * 2) };
      o.strip.barTop = sy + (narrow ? 32 : 36);
      o.strip.barBot = H - 20;
      o.strip.maxH = Math.max(6, o.strip.barBot - o.strip.barTop);
      const m = o.main;
      o.cx = m.x + m.w / 2;
      o.cy = m.y + m.h / 2 + (narrow ? 8 : 10);
      o.S = Math.max(8, Math.min(m.w, m.h - 30) * (wide ? 0.46 : 0.42));
      L = o;
      layerDirty = true;
    }

    /* ---------- text helpers ---------- */
    function setSpacing(g, px) { if (hasLS) g.letterSpacing = `${px}px`; }
    function rubric(g, text, x, y, color = LABEL, size = 9.5, align = 'left', maxW = 0) {
      let s = size;
      g.font = `${s}px ${SERIF}`;
      setSpacing(g, s * 0.16);
      const T = text.toUpperCase();
      while (maxW && s > 7 && g.measureText(T).width > maxW) { s -= 0.5; g.font = `${s}px ${SERIF}`; setSpacing(g, s * 0.16); }
      g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
      g.fillText(T, x, y);
      setSpacing(g, 0);
    }
    // Draw text with ^{…} and _{…} runs set small and raised or lowered.
    function richWidth(g, parts, size, family, style) {
      let w = 0;
      for (const [lv, t] of parts) {
        g.font = `${style}${lv ? size * 0.68 : size}px ${family}`;
        w += g.measureText(t).width;
      }
      return w;
    }
    function rich(g, text, x, y, { size = 11, family = MONO, style = '', align = 'left', maxW = 0, color = null } = {}) {
      const parts = richParts(text);
      let sz = size, w = richWidth(g, parts, sz, family, style);
      while (maxW && sz > 7.5 && w > maxW) { sz -= 0.5; w = richWidth(g, parts, sz, family, style); }
      let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      if (color) g.fillStyle = color;
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      for (const [lv, t] of parts) {
        g.font = `${style}${lv ? sz * 0.68 : sz}px ${family}`;
        g.fillText(t, cx, y + (lv > 0 ? -sz * 0.4 : lv < 0 ? sz * 0.24 : 0));
        cx += g.measureText(t).width;
      }
      return w;
    }
    function fitFont(g, text, family, size, maxW, style = '') {
      let s = size;
      g.font = `${style}${s}px ${family}`;
      while (s > 7.5 && g.measureText(text).width > maxW) { s -= 0.5; g.font = `${style}${s}px ${family}`; }
      return s;
    }
    function panel(g, r) {
      g.fillStyle = 'rgba(13,15,22,0.92)';
      g.fillRect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h));
      g.strokeStyle = 'rgba(42,46,63,0.95)';
      g.lineWidth = 1;
      g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.max(0, Math.round(r.w) - 1), Math.max(0, Math.round(r.h) - 1));
    }
    const num = (x, d) => x.toFixed(d).replace('-', '−');
    function fmtPct(x) {
      if (x >= 10) return x.toFixed(0);
      if (x >= 1) return x.toFixed(1);
      if (x >= 0.01) return x.toFixed(2);
      if (x > 0) return '<0.01';
      return '0';
    }

    /* ---------- spectrum pipeline (2-D) ---------- */
    function computeSpectrum() {
      polarOrig = toPolar(dft(samples));
      polar = polarOrig;
      polarGoal = polarOrig;
      morph = null;
      scrambled = false;
      restoreB.disabled = true;
      magOrder = sortIdxByMag(polarOrig);
      freqOrder = sortIdxByFreq(polarOrig);
      const fm = foldedMags(polarOrig);
      mags2 = fm.mags;
      fit2 = decayFit(fm.mags, fm.H);
      dirtyTrunc = true;
      kickLap();
    }

    function rebuildRecon(n) {
      if (!polar) { recon = null; reconN = 0; return; }
      const idx = [0, ...included];
      if (!recon || reconN !== n) recon = new Float64Array(n * 2);
      reconN = n;
      for (let r = 0; r < n; r++) {
        const z = evalChain(polar, idx, r / n);
        recon[2 * r] = z.re;
        recon[2 * r + 1] = z.im;
      }
    }

    function rebuildTrunc() {
      dirtyTrunc = false;
      if (!polar) return;
      order = orderMode === 'freq' ? freqOrder : magOrder;
      included = order.slice(0, Math.min(K, order.length));
      inclFlags = new Uint8Array(N);
      for (const i of included) inclFlags[i] = 1;
      maxMagV = magOrder.length ? polar[magOrder[0]].mag : 0;
      waterMag = orderMode === 'mag' && included.length ? polar[included[included.length - 1]].mag : 0;
      residMag = residualFor(polar, magOrder, K);
      residFreq = residualFor(polar, freqOrder, K);
      rebuildRecon(morph ? RECON_N / 2 : RECON_N);
      if (view === '2d') { computeTone(); scheduleWaveUpdate(); }
      updateReadout();
      layerDirty = true;
    }

    /* ---------- the 1-D bench ---------- */
    function rebuild1d() {
      dirty1d = false;
      kh1d = termsToHarm(amps1d, K);
      nTerms1d = 0;
      for (let j = 1; j <= kh1d; j++) if (amps1d[j] !== 0) nTerms1d++;
      cache1dMax = 0;
      for (let i = 0; i < CACHE_N; i++) {
        const v = partialSumPh(amps1d, phases1d, kh1d, (i / CACHE_N) * TAU);
        cache1d[i] = v;
        const a = Math.abs(v);
        if (a > cache1dMax) cache1dMax = a;
      }
      over1d = !scrambled1d && jumpInfo(type1d) ? overshoot1D(type1d, K, amps1d, null) : null;
      const m = new Float64Array(MAXH_1D);
      for (let j = 1; j < MAXH_1D; j++) m[j] = Math.abs(amps1d[j]);
      fit1 = { ...(decayFit(m, MAXH_1D - 1, { exact: true }) || {}), mags: m };
      if (view === '1d') { computeTone(); scheduleWaveUpdate(); }
      updateReadout();
      layerDirty = true;
    }

    function tone1D() {
      const real = new Float32Array(MAXH_1D + 1);
      const imag = new Float32Array(MAXH_1D + 1);
      for (let j = 1; j <= kh1d; j++) {
        const b = amps1d[j];
        if (!b) continue;
        // b sin(jx + φ) = b cosφ · sin(jx) + b sinφ · cos(jx)
        real[j] = b * Math.sin(phases1d[j]);
        imag[j] = b * Math.cos(phases1d[j]);
      }
      return { real, imag };
    }

    // The tone the ear gets, at fixed power: amplitudes are phase-blind, and
    // with disableNormalization the level no longer follows the crest factor.
    function computeTone() {
      let arr = null;
      if (view === '2d') { if (polar && included.length) arr = foldEnergy(polar, included, MAXH); }
      else arr = tone1D();
      if (!arr) { tone = null; return; }
      let e = 0, qMax = 0;
      for (let j = 1; j < arr.real.length; j++) {
        const q = arr.real[j] * arr.real[j] + arr.imag[j] * arr.imag[j];
        e += q; if (q > qMax) qMax = q;
      }
      if (!(e > 1e-16)) { tone = null; return; }
      // count only audible partials: a circle the shape's symmetry forbids
      // still carries ~1e-17 of rounding, and is not a partial
      let np = 0;
      for (let j = 1; j < arr.real.length; j++) {
        if (arr.real[j] * arr.real[j] + arr.imag[j] * arr.imag[j] > qMax * 1e-10) np++;
      }
      const wave = waveSamples(arr.real, arr.imag, 512);
      let pk = 0;
      for (let i = 0; i < wave.length; i++) pk = Math.max(pk, Math.abs(wave[i]));
      const rms = Math.sqrt(e / 2);
      // fixed power unless a very peaky wave (crest above ~7) would overdrive the bus
      const fixed = TONE_RMS / rms, capped = 3 / Math.max(pk, 1e-9);
      const scale = Math.min(fixed, capped);
      tone = { real: arr.real, imag: arr.imag, wave, peak: pk, rms, scale, partials: np, limited: capped < fixed };
      layerDirty = true;
    }

    /* ---------- readout ---------- */
    function updateReadout() {
      if (view === '2d') {
        if (!polar) {
          info.set('draw a closed shape on the plate above, or start from a preset');
          return;
        }
        const Ku = included.length;
        const mine = orderMode === 'mag' ? residMag : residFreq;
        const other = orderMode === 'mag' ? residFreq : residMag;
        let s = `N = ${N} points · K = ${Ku} of ${order.length} circles, ${orderMode === 'mag' ? 'loudest' : 'lowest'} first · ` +
          `left out: ${fmtPct(mine * 100)}% of the energy (${orderMode === 'mag' ? 'lowest' : 'loudest'} first: ${fmtPct(other * 100)}%)`;
        const p = fit2 ? fit2.p : null;
        s += p != null ? `\n|c<sub>k</sub>| falls like 1/k<sup>${p.toFixed(1)}</sup> · ${decayLabel(p)}` : `\n${decayLabel(null)}`;
        if (scrambled) s += '\nphases scrambled: every |c<sub>k</sub>| kept to the last bit, every partial at its old strength';
        info.setHTML(s);
      } else {
        const hi = kh1d, nt = nTerms1d;
        const terms = `K = ${nt} term${nt === 1 ? '' : 's'}` + (nt < K
          ? (type1d === 'custom' ? ` (every bar you have raised, harmonics up to ${hi})` : ` (all this bench holds, harmonics up to ${hi})`)
          : hi > 1 ? ` (harmonics up to ${hi})` : '');
        const bj = 'b<sub>j</sub>';
        let s;
        if (type1d === 'square') s = `square wave · ${bj} = 1/j for odd j · ${terms}`;
        else if (type1d === 'saw') s = `sawtooth · ${bj} = 1/j · ${terms}`;
        else if (type1d === 'triangle') s = `triangle · ${bj} = ±1/j² for odd j · ${terms}`;
        else s = `your spectrum · ${terms} · drag the bars to reshape it`;
        if (scrambled1d) {
          s += jumpInfo(type1d)
            ? `\nphases scrambled: the jump is gone from the picture, not from the sound; every |${bj}| kept`
            : `\nphases scrambled: the wave changes shape, its spectrum does not; every |${bj}| kept`;
        } else if (over1d != null) {
          const pct = over1d * 100;
          const where = pct >= 0 ? `${num(pct, 1)}% of the jump past its edge` : `${num(-pct, 1)}% of the jump short of its edge`;
          s += `\nhighest peak: ${where}, ` + (type1d === 'square'
            ? `falling toward the Gibbs limit, ${(GIBBS * 100).toFixed(2)}%, and never below it`
            : `rising toward the Gibbs limit, ${(GIBBS * 100).toFixed(2)}%`);
        } else if (type1d === 'triangle') {
          s += '\na corner but no jump: no horn, and the fast 1/j² decay is why it hums instead of buzzing';
        }
        info.setHTML(s);
      }
    }

    /* ---------- curve sources ---------- */
    function kickLap() { if (RM) lapLeft = PERIOD; }

    function markPresets() {
      for (const [k, b] of Object.entries(presetBtns)) b.classList.toggle('active', view === '2d' && preset === k);
      for (const [k, b] of Object.entries(benchBtns)) b.classList.toggle('active', view === '1d' && type1d === k);
    }

    function loadPreset(name) {
      clearTimeout(dftTimer);
      drawing = false; awaiting = false;
      preset = name;
      samples = resampleUniform(presetPoints(name), N);
      computeSpectrum();
      markPresets();
    }

    function doClear() {
      clearTimeout(dftTimer);
      drawing = false; awaiting = false;
      samples = null; polar = null; polarOrig = null; polarGoal = null; morph = null;
      recon = null; order = []; included = []; magOrder = []; freqOrder = [];
      fit2 = null; mags2 = null; preset = null;
      scrambled = false; restoreB.disabled = true;
      clearHover();
      if (listening && view === '2d') stopListening();
      tone = null;
      markPresets();
      updateReadout();
      layerDirty = true;
    }

    function recomputeFromStroke() {
      awaiting = false;
      layerDirty = true;
      if (rawStroke.length < 8) return;
      samples = resampleUniform(rawStroke, N);
      preset = null;
      computeSpectrum();
      markPresets();
    }

    function load1d(type) {
      type1d = type;
      amps1d = waveAmps1D(type);
      phases1d = new Float64Array(MAXH_1D + 1);
      scrambled1d = false;
      morph = null;
      restoreB.disabled = true;
      dirty1d = true;
      markPresets();
    }

    /* ---------- scramble and restore (animated unless reduced motion) ---------- */
    const wrapPi = (d) => ((((d + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

    function startMorph2D(goal) {
      polarGoal = goal;
      if (RM || !polar) { polar = goal; morph = null; dirtyTrunc = true; return; }
      const from = new Float64Array(N), delta = new Float64Array(N);
      for (let i = 0; i < N; i++) { from[i] = polar[i].phase; delta[i] = wrapPi(goal[i].phase - from[i]); }
      morph = { kind: '2d', t: 0, dur: 0.95, from, delta };
    }

    function startMorph1D(goal) {
      if (RM) { phases1d = goal; morph = null; dirty1d = true; return; }
      const from = Float64Array.from(phases1d), delta = new Float64Array(MAXH_1D + 1);
      for (let j = 1; j <= MAXH_1D; j++) delta[j] = wrapPi(goal[j] - from[j]);
      morph = { kind: '1d', t: 0, dur: 0.95, from, delta, goal };
    }

    function stepMorph(dt) {
      morph.t += Math.min(dt, 0.05);
      const u = clamp(morph.t / morph.dur, 0, 1), e = ease(u);
      if (morph.kind === '2d') {
        if (!polarGoal) { morph = null; return; }
        if (u >= 1) {
          polar = polarGoal; morph = null;
          rebuildRecon(RECON_N); computeTone(); scheduleWaveUpdate(); updateReadout();
        } else {
          const { from, delta } = morph;
          polar = polarGoal.map((p, i) => ({ ...p, phase: from[i] + delta[i] * e }));
          rebuildRecon(RECON_N / 2);
          computeTone();
        }
      } else {
        const { from, delta, goal } = morph;
        if (u >= 1) { phases1d = goal; morph = null; }
        else {
          const ph = new Float64Array(MAXH_1D + 1);
          for (let j = 1; j <= MAXH_1D; j++) ph[j] = from[j] + delta[j] * e;
          phases1d = ph;
        }
        dirty1d = true;
      }
      layerDirty = true;
    }

    function doScramble() {
      audio.ensureAudio();
      if (view === '2d') {
        if (!polarOrig) return;
        startMorph2D(scramblePhases(polarGoal || polarOrig));
        scrambled = true;
        kickLap();
      } else {
        startMorph1D(randomPhases(MAXH_1D));
        scrambled1d = true;
        dirty1d = true;
      }
      restoreB.disabled = false;
      updateReadout();
      if (listening) {
        questDone = true;
        quest.done('The drawing died; the tone barely changed. Magnitude is for the ear, phase is for the eye.');
      } else if (!questDone) {
        quest.set('Now switch <em>♪ listen</em> on and scramble again: the ear will shrug at what just wrecked the eye.');
      }
    }

    function doRestore() {
      if (view === '2d') {
        if (!polarOrig) return;
        startMorph2D(polarOrig);
        scrambled = false;
        kickLap();
      } else {
        startMorph1D(new Float64Array(MAXH_1D + 1));
        scrambled1d = false;
        dirty1d = true;
      }
      restoreB.disabled = true;
      updateReadout();
    }

    /* ---------- audio ---------- */
    function currentWave() {
      const c = bus.context;
      if (!c || !tone) return null;
      const s = tone.scale;
      const re = new Float32Array(tone.real.length), im = new Float32Array(tone.imag.length);
      for (let j = 0; j < re.length; j++) { re[j] = tone.real[j] * s; im[j] = tone.imag[j] * s; }
      try { return c.createPeriodicWave(re, im, { disableNormalization: true }); }
      catch { return c.createPeriodicWave(re, im); }
    }

    function startListening() {
      audio.ensureAudio();
      if (!tone) computeTone();
      const w = currentWave();
      if (!w) { info.set('nothing to hear yet: draw something first, because the tone is the drawing'); return; }
      const c = bus.context;
      toneGain = c.createGain();
      toneGain.gain.value = 0;
      toneOsc = c.createOscillator();
      toneOsc.setPeriodicWave(w);
      toneOsc.frequency.value = F0;
      toneOsc.connect(toneGain).connect(bus.input);
      toneOsc.start();
      audio.rampTo(toneGain.gain, TONE_LEVEL, 0.03);
      listening = true;
      listenBtn.classList.add('active');
      listenBtn.setAttribute('aria-pressed', 'true');
      layerDirty = true;
    }

    function stopListening() {
      listening = false;
      listenBtn.classList.remove('active');
      listenBtn.setAttribute('aria-pressed', 'false');
      soloOff();
      clearTimeout(waveTimer); clearTimeout(dipTimer);
      layerDirty = true;
      if (!toneOsc) return;
      const c = bus.context, osc = toneOsc, g = toneGain;
      toneOsc = null; toneGain = null;
      audio.rampTo(g.gain, 0, 0.03);
      osc.stop(c.currentTime + 0.25);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
    }

    function toggleListen() {
      audio.ensureAudio();
      if (listening) stopListening();
      else startListening();
    }

    // Swapping a PeriodicWave mid-note clicks; dip the gain ~15 ms around it.
    function applyWave() {
      if (!listening || !toneOsc) return;
      const w = currentWave();
      audio.rampTo(toneGain.gain, 0, 0.005);
      clearTimeout(dipTimer);
      dipTimer = setTimeout(() => {
        if (!toneOsc) return;
        if (w) {
          toneOsc.setPeriodicWave(w);
          audio.rampTo(toneGain.gain, soloActive ? TONE_LEVEL * 0.25 : TONE_LEVEL, 0.02);
        }
      }, 18);
    }

    function scheduleWaveUpdate() {
      if (!listening) return;
      clearTimeout(waveTimer);
      waveTimer = setTimeout(applyWave, 90);
    }

    function soloOn(harm, magRel) {
      if (!listening || harm < 1) return;
      if (!soloV) soloV = audio.voice(bus, { type: 'sine', freq: F0 * harm, level: 0.3 });
      soloV.setFreq(F0 * harm);
      soloV.on(0.06 + 0.3 * clamp(magRel, 0, 1));
      soloActive = true;
      if (toneGain) audio.rampTo(toneGain.gain, TONE_LEVEL * 0.25, 0.05);
    }

    function soloOff() {
      soloActive = false;
      if (soloV) soloV.off();
      if (toneGain && listening) audio.rampTo(toneGain.gain, TONE_LEVEL, 0.08);
    }

    /* ---------- selection in the strip (hover, tap, keys) ---------- */
    function setHover2d(idx) {
      if (idx === hoverIdx) return;
      hoverIdx = idx;
      layerDirty = true;
      // only a circle inside K is in the tone: never solo a silent partial
      if (idx >= 0 && listening && maxMagV > 0 && inclFlags[idx] && !isNil(idx)) {
        soloOn(Math.abs(polar[idx].freq), polar[idx].mag / maxMagV);
      } else soloOff();
    }

    function setHover1d(j) {
      if (j === hoverHarm) return;
      hoverHarm = j;
      layerDirty = true;
      if (j >= 1 && listening && amps1d[j] !== 0 && j <= kh1d) soloOn(j, Math.abs(amps1d[j]));
      else soloOff();
    }

    function clearHover() {
      if (hoverIdx === -1 && hoverHarm === 0) return;
      hoverIdx = -1; hoverHarm = 0;
      layerDirty = true;
      soloOff();
    }

    // A coefficient the shape's symmetry forbids is zero up to rounding.
    const isNil = (idx) => !polar || !(polar[idx].mag > maxMagV * 1e-9);

    function stripSlot2d(x) {
      const s = L.strip;
      const slot = Math.floor(((x - s.pad) / s.innerW) * (2 * SLOTS_2D + 1));
      if (slot < 0 || slot > 2 * SLOTS_2D) return null;
      return slot - SLOTS_2D;
    }
    function stripHarm1d(x) {
      const s = L.strip;
      const j = 1 + Math.floor(((x - s.pad) / s.innerW) * BARS_1D);
      return j >= 1 && j <= BARS_1D ? j : 0;
    }

    function updateHover(x, y) {
      if (y < L.strip.y + 2) { clearHover(); return; }
      if (view === '2d') {
        if (!polar) { clearHover(); return; }
        const f = stripSlot2d(x);
        if (f == null || f === 0) { clearHover(); return; }
        const idx = f >= 0 ? f : f + N;
        setHover2d(idx);
      } else {
        const j = stripHarm1d(x);
        if (!j) { clearHover(); return; }
        setHover1d(j);
      }
    }

    function setBarFromPointer(x, y) {
      const s = L.strip;
      const j = stripHarm1d(x);
      if (!j) return;
      const h = clamp((s.barBot - y) / s.maxH, 0, 1);
      setBar(j, h);
    }

    // Bars are measured against a fixed reference, 1.0 = the fundamental of
    // every preset, so no bar rescales the others while you drag.
    function setBar(j, h) {
      if (type1d !== 'custom') {
        // the strip shows 32 harmonics: make "your spectrum" exactly what is shown
        for (let i = BARS_1D + 1; i <= MAXH_1D; i++) amps1d[i] = 0;
        type1d = 'custom';
        markPresets();
      }
      const sign = amps1d[j] < 0 ? -1 : 1;
      amps1d[j] = sign * clamp(h, 0, 1);
      dirty1d = true;
      hoverHarm = j;
      if (listening && h > 0) soloOn(j, h); else soloOff();
    }

    /* ---------- pointer interaction ---------- */
    function toWorld(x, y) {
      return { re: (x - L.cx) / L.S, im: (y - L.cy) / L.S };
    }
    function inMain(x, y) {
      const m = L.main;
      return x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h;
    }

    function setArmed(v) {
      armed = !!v;
      cnv.classList.toggle('fr-armed', armed);
      if (armB) {
        armB.classList.toggle('active', armed);
        armB.setAttribute('aria-pressed', String(armed));
      }
      layerDirty = true;
    }

    function onDown(e) {
      const [x, y] = cv.pointerPos(handle, e);
      const touchLocked = COARSE && !armed && e.pointerType === 'touch';
      if (y >= L.strip.y + 2) {
        if (view === '1d' && !touchLocked) {
          dragBar = true;
          setBarFromPointer(x, y);
          try { cnv.setPointerCapture(e.pointerId); } catch {}
        } else {
          // a locked touch (the page may be scrolling) only selects a bar;
          // '✎ shape the bars' arms the strip for dragging
          updateHover(x, y);   // a tap selects a bar
        }
        return;
      }
      if (view === '2d' && inMain(x, y) && !touchLocked) {
        drawing = true;
        rawStroke = [toWorld(x, y)];
        clearHover();
        layerDirty = true;
        try { cnv.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      }
    }

    function onMove(e) {
      const [x, y] = cv.pointerPos(handle, e);
      if (drawing) {
        const p = toWorld(x, y);
        const last = rawStroke[rawStroke.length - 1];
        if (Math.hypot(p.re - last.re, p.im - last.im) > 0.006) rawStroke.push(p);
        return;
      }
      if (dragBar) { setBarFromPointer(x, y); return; }
      const inStrip = y >= L.strip.y + 2;
      cnv.style.cursor = inStrip ? (view === '1d' ? 'ns-resize' : 'pointer')
        : view === '2d' && inMain(x, y) ? 'crosshair' : 'default';
      if (e.pointerType !== 'touch') updateHover(x, y);
    }

    function onUp(e) {
      if (drawing) {
        drawing = false;
        try { cnv.releasePointerCapture(e.pointerId); } catch {}
        layerDirty = true;
        if (rawStroke.length >= 8) {
          // DFT on pointer-up + debounce — never per pointermove.
          clearTimeout(dftTimer);
          awaiting = true;
          dftTimer = setTimeout(recomputeFromStroke, 120);
        }
        if (armed && view === '2d') setArmed(false);
      }
      if (dragBar) {
        dragBar = false;
        try { cnv.releasePointerCapture(e.pointerId); } catch {}
        scheduleWaveUpdate();
        updateReadout();
      }
    }

    function onLeave() { if (!drawing && !dragBar) clearHover(); }

    function onKey(e) {
      const k = e.key;
      if (k === 'Escape') { clearHover(); return; }
      if (view === '2d') {
        if (!polar || (k !== 'ArrowLeft' && k !== 'ArrowRight')) return;
        e.preventDefault();
        let f = hoverIdx >= 0 ? polar[hoverIdx].freq : 0;
        const d = k === 'ArrowRight' ? 1 : -1;
        for (let t = 0; t < 2 * SLOTS_2D; t++) {
          f += d;
          if (f > SLOTS_2D) f = -SLOTS_2D;
          if (f < -SLOTS_2D) f = SLOTS_2D;
          if (f !== 0 && !isNil(f >= 0 ? f : f + N)) break;
        }
        setHover2d(f >= 0 ? f : f + N);
      } else {
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          e.preventDefault();
          const j = hoverHarm || 1;
          setHover1d(clamp(j + (k === 'ArrowRight' ? 1 : -1), 1, BARS_1D));
        } else if ((k === 'ArrowUp' || k === 'ArrowDown') && hoverHarm) {
          e.preventDefault();
          const h = clamp(Math.abs(amps1d[hoverHarm]) + (k === 'ArrowUp' ? 0.05 : -0.05), 0, 1);
          setBar(hoverHarm, Math.round(h * 100) / 100);
          scheduleWaveUpdate();
        }
      }
    }

    cnv.addEventListener('pointerdown', onDown);
    cnv.addEventListener('pointermove', onMove);
    cnv.addEventListener('pointerup', onUp);
    cnv.addEventListener('pointercancel', onUp);
    cnv.addEventListener('pointerleave', onLeave);
    cnv.addEventListener('keydown', onKey);
    function unbindPointer() {
      cnv.removeEventListener('pointerdown', onDown);
      cnv.removeEventListener('pointermove', onMove);
      cnv.removeEventListener('pointerup', onUp);
      cnv.removeEventListener('pointercancel', onUp);
      cnv.removeEventListener('pointerleave', onLeave);
      cnv.removeEventListener('keydown', onKey);
    }

    /* ---------- view switch ---------- */
    function setView(v) {
      view = v;
      clearHover();
      morph = null;
      if (v === '2d' && polarGoal) polar = polarGoal;
      for (const [key, b] of Object.entries(tabBtns)) {
        b.classList.toggle('active', key === v);
        b.setAttribute('aria-selected', String(key === v));
      }
      for (const b of [...Object.values(presetBtns), clearB]) b.style.display = v === '2d' ? '' : 'none';
      for (const b of Object.values(benchBtns)) b.style.display = v === '1d' ? '' : 'none';
      orderSel.el.style.display = v === '2d' ? '' : 'none';
      if (armB) armB.textContent = v === '2d' ? '✎ draw' : '✎ shape the bars';
      restoreB.disabled = v === '2d' ? !scrambled : !scrambled1d;
      mathEl.innerHTML = v === '2d' ? MATH_2D : MATH_1D;
      captionEl.innerHTML = v === '2d' ? CAP_2D : CAP_1D;
      markPresets();
      if (v === '1d') dirty1d = true;
      else if (polar) dirtyTrunc = true;
      else tone = null;
      if (listening) {
        if (v === '2d' && !polar) stopListening();
        else { if (v === '1d') rebuild1d(); else rebuildTrunc(); applyWave(); }
      }
      updateReadout();
      layerDirty = true;
    }

    /* ---------- the static layer: plate, insets and strip ---------- */
    function renderLayer() {
      layerDirty = false;
      const dpr = handle.dpr || 1;
      const w = Math.max(1, Math.round(handle.width * dpr)), h = Math.max(1, Math.round(handle.height * dpr));
      if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
      const g = lctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, handle.width, handle.height);
      if (view === '2d') plate2D(g); else plate1DFrame(g);
      if (L.wide) {
        g.strokeStyle = 'rgba(42,46,63,0.8)'; g.lineWidth = 1;
        const x = Math.round(L.main.x + L.main.w) + 0.5;
        g.beginPath(); g.moveTo(x, 12); g.lineTo(x, L.main.h - 12); g.stroke();
      }
      // instruments
      if (view === '2d') {
        toneInset(g, L.insA);
        decayInset(g, L.insB, mags2, (N >> 1) - 1, fit2, false);
      } else {
        if (jumpInfo(type1d)) hornInset(g, L.insA); else toneInset(g, L.insA);
        decayInset(g, L.insB, fit1 ? fit1.mags : null, MAXH_1D - 1, fit1, true);
      }
      if (view === '2d') strip2D(g); else strip1D(g);
    }

    function plate2D(g) {
      const { main: m, cx, cy, S, narrow } = L;
      // the drafting table: a hairline cross and the unit circle, very faint
      g.strokeStyle = 'rgba(74,72,64,0.55)'; g.lineWidth = 1;
      g.setLineDash([1, 4]);
      g.beginPath();
      g.moveTo(Math.round(m.x + 14) + 0.5, Math.round(cy) + 0.5); g.lineTo(Math.round(m.x + m.w - 14) + 0.5, Math.round(cy) + 0.5);
      g.moveTo(Math.round(cx) + 0.5, Math.round(m.y + 40) + 0.5); g.lineTo(Math.round(cx) + 0.5, Math.round(m.y + m.h - 30) + 0.5);
      g.stroke();
      g.beginPath(); g.arc(cx, cy, Math.max(0, S), 0, TAU); g.stroke();
      g.setLineDash([]);

      if (!samples && !drawing && !awaiting) {
        const msg = COARSE && !armed ? 'press ✎ draw, then draw a closed shape here, or choose a preset'
          : 'draw a closed shape here, or choose a preset';
        fitFont(g, msg, SERIF, 15, m.w - 40, 'italic ');
        g.fillStyle = P.inkDim; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(msg, cx, cy);
        return;
      }
      if (drawing || awaiting) return;

      // your hand, faint
      g.strokeStyle = 'rgba(232,226,208,0.22)'; g.lineWidth = 1;
      g.beginPath();
      samples.forEach((p, i) => {
        const sx = cx + p.re * S, sy = cy + p.im * S;
        i ? g.lineTo(sx, sy) : g.moveTo(sx, sy);
      });
      g.closePath(); g.stroke();

      // the chain's whole loop, dim gold
      if (recon && reconN) {
        g.strokeStyle = P.goldDim; g.globalAlpha = 0.85; g.lineWidth = 1.2;
        g.beginPath();
        for (let r = 0; r < reconN; r++) {
          const sx = cx + recon[2 * r] * S, sy = cy + recon[2 * r + 1] * S;
          r ? g.lineTo(sx, sy) : g.moveTo(sx, sy);
        }
        g.closePath(); g.stroke();
        g.globalAlpha = 1;
      }

      // captions on the plate
      const tx = m.x + 16, ty = m.y + 22;
      if (armed) {
        fitFont(g, 'draw with one finger; lift to transform', SERIF, 13, narrow ? m.w - 130 : m.w * 0.62, 'italic ');
        g.fillStyle = P.azure; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText('draw with one finger; lift to transform', tx, ty);
      } else if (scrambled) {
        const t = narrow ? 'phases scrambled' : 'phases scrambled · every |c_{k}| kept';
        rich(g, t, tx, ty, { size: 13, family: SERIF, style: 'italic ', maxW: narrow ? m.w - 130 : m.w * 0.62, color: CRIM });
      } else {
        const nc = `${included.length} circle${included.length === 1 ? '' : 's'}, ${orderMode === 'mag' ? 'loudest' : 'lowest'} first`;
        const who = preset ? `the ${preset === 'script' ? 'script' : preset}` : 'your hand';
        const t = narrow ? nc : `${who}, redrawn by ${nc}`;
        fitFont(g, t, SERIF, 13, narrow ? m.w - 130 : m.w * 0.62, 'italic ');
        g.fillStyle = P.inkDim; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText(t, tx, ty);
      }
      // Parseval on the plate
      const res = (orderMode === 'mag' ? residMag : residFreq) * 100;
      const rx = m.x + m.w - 16;
      rubric(g, 'left-out energy', rx, ty - 4, LABEL, narrow ? 8 : 9, 'right');
      g.font = `${narrow ? 12 : 14}px ${MONO}`; g.fillStyle = P.gold; g.textAlign = 'right';
      g.fillText(`${fmtPct(res)}%`, rx, ty + (narrow ? 11 : 13));
      // key to the circles
      if (!narrow || m.w > 300) {
        const ky = m.y + m.h - 14;
        let kx = m.x + 16;
        g.lineWidth = 1.2;
        g.strokeStyle = 'rgba(125,167,217,0.8)';
        g.beginPath(); g.moveTo(kx, ky - 4); g.lineTo(kx + 18, ky - 4); g.stroke();
        kx += 24;
        g.font = `italic 11.5px ${SERIF}`; g.fillStyle = LABEL; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText('turns forward', kx, ky);
        kx += g.measureText('turns forward').width + 14;
        g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(kx, ky - 4); g.lineTo(kx + 18, ky - 4); g.stroke();
        g.setLineDash([]);
        kx += 24;
        g.fillText('backward', kx, ky);
      }
    }

    function plate1DFrame(g) {
      // the 1-D pane itself is drawn live (it scrolls while listening);
      // the layer only carries its quiet furniture
      const m = L.main;
      const t = type1d === 'custom' ? 'your spectrum'
        : type1d === 'square' ? 'square wave' : type1d === 'saw' ? 'sawtooth' : 'triangle';
      rubric(g, t, m.x + m.w - 16, m.y + 22, LABEL, L.narrow ? 8.5 : 9.5, 'right', m.w * 0.4);
    }

    /* ---------- instruments ---------- */
    function toneInset(g, r) {
      panel(g, r);
      const nar = r.w < 200;
      rubric(g, nar ? 'the tone' : 'the tone · one period', r.x + 10, r.y + 17, LABEL, nar ? 8.5 : 9.5, 'left', r.w - 20);
      if (listening) {
        g.font = `${nar ? 9 : 10}px ${MONO}`; g.fillStyle = P.goldBright; g.textAlign = 'right';
        g.fillText('♪ 110 Hz', r.x + r.w - 10, r.y + 17);
      }
      const x0 = r.x + 10, pw = Math.max(1, r.w - 20);
      const top = r.y + 26, bot = r.y + r.h - 22;
      const mid = (top + bot) / 2, amp = Math.max(1, (bot - top) / 2);
      g.strokeStyle = 'rgba(74,72,64,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, Math.round(mid) + 0.5); g.lineTo(x0 + pw, Math.round(mid) + 0.5); g.stroke();
      if (!tone) {
        g.font = `italic 11.5px ${SERIF}`; g.fillStyle = LABEL; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('nothing to hear yet', r.x + r.w / 2, mid - 10);
        g.textBaseline = 'alphabetic';
        return;
      }
      // fixed power: the same rms always fills the same height, so a
      // scramble shows up as a change of shape and crest, not of size
      const k = amp / (2.6 * tone.rms);
      const wv = tone.wave, n = wv.length;
      g.save();
      g.beginPath(); g.rect(r.x + 1, top - 2, r.w - 2, bot - top + 4); g.clip();
      g.strokeStyle = P.gold; g.lineWidth = 1.4; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const v = wv[i % n];
        const x = x0 + (i / n) * pw, y = mid - v * k;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.restore();
      g.font = `${nar ? 9 : 10}px ${MONO}`; g.fillStyle = LABEL; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      const crest = tone.peak / tone.rms;
      const foot = nar ? `crest ${crest.toFixed(2)}` : `${tone.partials} partials · crest ${crest.toFixed(2)}`;
      g.fillText(foot, x0, r.y + r.h - 8);
      const fw = g.measureText(foot).width;
      g.font = `italic ${nar ? 9.5 : 10.5}px ${SERIF}`;
      const note = tone.limited ? 'peak-limited' : 'power held fixed';
      if (x0 + fw + 14 + g.measureText(note).width < r.x + r.w - 10) {
        g.textAlign = 'right';
        g.fillText(note, r.x + r.w - 10, r.y + r.h - 8);
      }
    }

    function decayInset(g, r, mags, H, fit, oneD) {
      panel(g, r);
      const nar = r.w < 200;
      rubric(g, nar ? 'decay'
        : oneD ? 'how the harmonics shrink' : 'how the circles shrink',
      r.x + 10, r.y + 17, LABEL, nar ? 8.5 : 9.5, 'left', r.w - 20);
      const x0 = r.x + (nar ? 22 : 30), x1 = r.x + r.w - 10;
      const y0 = r.y + 28, y1 = r.y + r.h - 20;
      const DEC = 5;
      const LX = (j) => x0 + (Math.log2(j) / 7) * (x1 - x0);
      const LY = (m) => y0 + (-Math.log10(m) / DEC) * (y1 - y0);
      // axes
      g.strokeStyle = 'rgba(74,72,64,0.8)'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.round(x0) + 0.5, y0); g.lineTo(Math.round(x0) + 0.5, y1);
      g.lineTo(x1, Math.round(y1) + 0.5);
      g.stroke();
      g.font = `${nar ? 8.5 : 9}px ${MONO}`; g.fillStyle = LABEL; g.textBaseline = 'alphabetic';
      g.textAlign = 'center';
      for (const j of nar ? [1, 8, 64] : [1, 4, 16, 64]) g.fillText(String(j), LX(j), y1 + 11);
      g.textAlign = 'right';
      g.fillText('1', x0 - 4, y0 + 4);
      g.fillText(nar ? '−5' : '10⁻⁵', x0 - 4, y1);
      if (!mags || !fit || !(fit.max > 0)) {
        g.font = `italic 11px ${SERIF}`; g.textAlign = 'center'; g.fillStyle = LABEL;
        g.fillText('no spectrum yet', (x0 + x1) / 2, (y0 + y1) / 2);
        return;
      }
      g.save();
      g.beginPath(); g.rect(x0 + 1, y0 - 3, x1 - x0, y1 - y0 + 3); g.clip();
      // every coefficient, faint
      g.fillStyle = 'rgba(169,164,147,0.45)';
      for (let j = 1; j <= H; j++) {
        const m = mags[j] / fit.max;
        if (!(m > 1e-5)) continue;
        g.fillRect(LX(j) - 0.75, LY(m) - 0.75, 1.5, 1.5);
      }
      // the noise floor
      const fl = fit.floor / fit.max;
      if (!oneD && fl > 1.2e-5) {
        const y = Math.round(LY(fl)) + 0.5;
        g.strokeStyle = 'rgba(138,134,118,0.55)'; g.setLineDash([1, 3]);
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
        g.font = `italic 10px ${SERIF}`; g.fillStyle = LABEL; g.textAlign = 'left';
        g.fillText(oneD ? 'floor' : 'noise floor', x0 + 4, y - 3);
      }
      // reference slopes through the first band used in the fit
      const used = fit.bands ? fit.bands.filter((b) => b.ok) : [];
      const anchor = used[0] || (fit.bands && fit.bands[0]);
      if (anchor) {
        const aj = anchor.j, am = anchor.m / fit.max;
        const ref = (p, col, lab) => {
          g.strokeStyle = col; g.setLineDash([4, 3]); g.lineWidth = 1;
          g.beginPath();
          g.moveTo(LX(aj), LY(am));
          const je = 128, me = am * Math.pow(aj / je, p);
          g.lineTo(LX(je), LY(me));
          g.stroke(); g.setLineDash([]);
          // label where the line leaves the plot (the right edge, or the
          // floor), set wholly above the line: a falling line is highest at
          // the label's left end, so the baseline sits just over that point
          let jl = 120, ml = am * Math.pow(aj / jl, p);
          if (LY(ml) > y1 - 10) { ml = Math.pow(10, -DEC * ((y1 - 10 - y0) / (y1 - y0))); jl = aj * Math.pow(am / ml, 1 / p); }
          g.font = `italic ${nar ? 9.5 : 10.5}px ${SERIF}`;
          const wl = g.measureText(lab).width;
          const xr = Math.min(x1 - 2, LX(jl) - 2), xl = xr - wl;
          const jAt = Math.pow(2, ((xl - x0) / Math.max(1, x1 - x0)) * 7);
          const yl = LY(am * Math.pow(aj / Math.max(jAt, 1), p));
          return { lab, col, xr, xl, y: Math.max(y0 + 9, yl - 3), below: LY(ml) + 11 };
        };
        const la = ref(1, 'rgba(217,122,104,0.75)', oneD ? 'jump' : '1/k');
        const lb = ref(2, 'rgba(201,169,89,0.7)', oneD ? 'corner' : '1/k²');
        // a label must not sit on the fitted line or on the other label:
        // if it would, hang it under its own line instead
        const jOf = (x) => Math.pow(2, ((x - x0) / Math.max(1, x1 - x0)) * 7);
        const hitsFit = (q) => {
          if (fit.p == null || used.length < 2) return false;
          const ja = used[0].j, jb = used[used.length - 1].j;
          for (let x = q.xl; x <= q.xr; x += 3) {
            const j = jOf(x);
            if (j < ja || j > jb) continue;
            const yf = LY(Math.exp(fit.c0 - fit.p * Math.log(j)) / fit.max);
            if (yf > q.y - 10 && yf < q.y + 1.5) return true;
          }
          return false;
        };
        for (const q of [la, lb]) if (hitsFit(q)) q.y = Math.min(y1 - 2, q.below);
        if (Math.abs(la.y - lb.y) < 10 && la.xl < lb.xr && lb.xl < la.xr) lb.y = Math.min(y1 - 2, lb.below);
        g.font = `italic ${nar ? 9.5 : 10.5}px ${SERIF}`; g.textAlign = 'right';
        for (const q of [la, lb]) { g.fillStyle = q.col; g.fillText(q.lab, q.xr, q.y); }
      }
      // band maxima and the fitted line
      g.fillStyle = P.azure;
      for (const b of used) {
        g.beginPath(); g.arc(LX(b.j), LY(b.m / fit.max), 2.3, 0, TAU); g.fill();
      }
      if (fit.p != null && used.length >= 2) {
        const ja = used[0].j, jb = used[used.length - 1].j;
        const at = (j) => Math.exp(fit.c0 - fit.p * Math.log(j)) / fit.max;
        g.strokeStyle = P.azure; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(LX(ja), LY(at(ja))); g.lineTo(LX(jb), LY(at(jb))); g.stroke();
      }
      g.restore();
      // the measured law: in the empty upper right of a roomy plot, or
      // beside the short title of a small one
      if (fit.p != null) {
        rich(g, `≈ 1/${oneD ? 'j' : 'k'}^{${fit.p.toFixed(1)}}`, nar ? r.x + r.w - 10 : x1 - 2, nar ? r.y + 17 : y0 + 11,
          { size: nar ? 10.5 : 12.5, family: MONO, align: 'right', color: P.azure });
      }
    }

    // Gibbs's horn under a loupe that rescales with K: x = u·π/(h+1), so the
    // first peak always sits near u = 1, and the faint curve is the limit
    // 1/2 + Si(πu)/π the ripples settle into.
    const HORN_U0 = -0.8, HORN_U1 = 5.6;
    const hornLimit = (() => {
      const M = 140, out = new Float64Array(M + 1);
      for (let i = 0; i <= M; i++) {
        const u = HORN_U0 + ((HORN_U1 - HORN_U0) * i) / M;
        out[i] = 0.5 + sineIntegral(Math.PI * u) / Math.PI;
      }
      return out;
    })();
    const RIPPLE = rippleLimits(5);

    function hornInset(g, r) {
      panel(g, r);
      const nar = r.w < 200;
      rubric(g, nar ? 'the horn' : 'the horn, magnified', r.x + 10, r.y + 17, LABEL, nar ? 8.5 : 9.5, 'left', r.w - 70);
      const J = jumpInfo(type1d);
      const x0 = r.x + 10, x1 = r.x + r.w - 10;
      const y0 = r.y + 30, y1 = r.y + r.h - 20;
      const YLO = 0.62, YHI = 1.135;
      const UX = (u) => x0 + ((u - HORN_U0) / (HORN_U1 - HORN_U0)) * (x1 - x0);
      const VY = (v) => y1 - ((v - YLO) / (YHI - YLO)) * (y1 - y0);
      // levels: the edge (1) and the Gibbs limit (1 + 8.95%)
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(74,72,64,0.9)';
      g.beginPath(); g.moveTo(x0, Math.round(VY(1)) + 0.5); g.lineTo(x1, Math.round(VY(1)) + 0.5); g.stroke();
      g.strokeStyle = 'rgba(217,122,104,0.7)'; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(x0, Math.round(VY(1 + GIBBS)) + 0.5); g.lineTo(x1, Math.round(VY(1 + GIBBS)) + 0.5); g.stroke();
      g.setLineDash([]);
      g.save();
      g.beginPath(); g.rect(r.x + 1, y0 - 12, r.w - 2, y1 - y0 + 14); g.clip();
      // the limit profile
      g.strokeStyle = 'rgba(125,167,217,0.45)'; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < hornLimit.length; i++) {
        const u = HORN_U0 + ((HORN_U1 - HORN_U0) * i) / (hornLimit.length - 1);
        const x = UX(u), y = VY(hornLimit[i]);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      // the current partial sum, normalized so the jump runs 0 → 1
      const h = Math.max(1, kh1d);
      const M = Math.max(40, Math.round((x1 - x0) / 1.5));
      // stop short of the next jump (the square's at π), which a small K would reach
      const uMax = Math.min(HORN_U1, (0.92 * (type1d === 'square' ? Math.PI : TAU) * (h + 1)) / Math.PI);
      g.strokeStyle = P.gold; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i <= M; i++) {
        const u = HORN_U0 + ((HORN_U1 - HORN_U0) * i) / M;
        if (u > uMax) break;
        const x = (u * Math.PI) / (h + 1);
        const v = (partialSumPh(amps1d, phases1d, h, x) - (J.edge - J.jump)) / J.jump;
        const px = UX(u), py = VY(v);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
      g.restore();
      // the ripple ladder: limits of the successive heights, % of the jump
      // set on a dark halo, so the live curve passing through stays legible
      g.font = `${nar ? 8 : 9}px ${MONO}`; g.textAlign = 'center';
      g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(13,15,22,0.92)';
      const show = nar ? 3 : 5;
      for (let k = 1; k <= show; k++) {
        const d = RIPPLE[k - 1];
        const x = UX(k), y = VY(1 + d);
        const t = Math.abs(d * 100).toFixed(k === 1 ? 2 : 1) + (k === 1 ? '%' : '');
        const ty = d > 0 ? y - 6 : y + 13;
        g.strokeText(t, x, ty);
        g.fillStyle = k === 1 ? CRIM : LABEL;
        g.fillText(t, x, ty);
      }
      g.lineWidth = 1;
      g.font = `${nar ? 9 : 10}px ${MONO}`; g.fillStyle = LABEL; g.textAlign = 'left';
      g.fillText(scrambled1d ? 'phases scrambled' : nar ? `K = ${nTerms1d} · % of jump` : `K = ${nTerms1d} · per cent of the jump`, x0, r.y + r.h - 7);
    }

    /* ---------- the spectrum strip ---------- */
    function stripFrame(g, title) {
      const s = L.strip;
      g.strokeStyle = P.line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, Math.round(s.y) + 0.5); g.lineTo(L.W, Math.round(s.y) + 0.5); g.stroke();
      g.strokeStyle = 'rgba(74,72,64,0.9)';
      g.beginPath(); g.moveTo(s.pad, Math.round(s.barBot) + 0.5); g.lineTo(s.pad + s.innerW, Math.round(s.barBot) + 0.5); g.stroke();
      if (title) {
        fitFont(g, title, SERIF, L.narrow ? 11 : 12, L.W - 24, 'italic ');
        g.fillStyle = LABEL; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText(title, L.W / 2, s.y + 15);
      }
    }

    function hoverText(g, text, color = P.azure) {
      const s = L.strip;
      fitFont(g, text, MONO, L.narrow ? 9.5 : 10.5, L.W - 20);
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(text, L.W / 2, s.y + 15);
    }

    function phaseHands(g, list, rMax) {
      // list: [x, yTop, phase, bright]
      if (!list.length) return;
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(125,167,217,0.28)';
      g.beginPath();
      for (const [x, y] of list) { g.moveTo(x + rMax, y); g.arc(x, y, rMax, 0, TAU); }
      g.stroke();
      g.strokeStyle = 'rgba(125,167,217,0.95)'; g.lineWidth = 1.2;
      g.beginPath();
      for (const [x, y, ph] of list) { g.moveTo(x, y); g.lineTo(x + rMax * Math.cos(ph), y - rMax * Math.sin(ph)); }
      g.stroke();
    }

    function strip2D(g) {
      const s = L.strip;
      if (!polar || maxMagV <= 0) {
        stripFrame(g, '');
        const msg = 'the spectrum appears when there is a curve to transform';
        fitFont(g, msg, SERIF, 12.5, L.W - 30, 'italic ');
        g.fillStyle = LABEL; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(msg, L.W / 2, (s.barTop + s.barBot) / 2);
        g.textBaseline = 'alphabetic';
        return;
      }
      const hov = hoverIdx >= 0 ? polar[hoverIdx] : null;
      stripFrame(g, hov ? '' : L.narrow ? 'the spectrum, by signed frequency k' : 'the spectrum: signed frequency k, in turns per lap (negative k turns backward)');
      const slots = 2 * SLOTS_2D + 1;
      const slotW = s.innerW / slots;
      const bw = Math.max(1.5, slotW * 0.58);
      const hands = [];
      const rH = clamp(slotW * 0.3, 2, 4.2);
      for (let slot = 0; slot < slots; slot++) {
        const f = slot - SLOTS_2D;
        const xc = s.pad + (slot + 0.5) * slotW;
        if (f === 0) {
          g.fillStyle = LABEL;
          g.beginPath(); g.arc(xc, s.barBot - 2.5, 2, 0, TAU); g.fill();
          continue;
        }
        const idx = f >= 0 ? f : f + N;
        const mag = polar[idx].mag;
        const h = Math.sqrt(mag / maxMagV) * s.maxH;
        if (h < 0.5) continue;
        const isHov = idx === hoverIdx;
        g.fillStyle = isHov ? P.goldBright : inclFlags[idx] ? P.gold : 'rgba(109,106,94,0.5)';
        g.fillRect(xc - bw / 2, s.barBot - h, bw, h);
        if (slotW >= 7 && h >= 7) hands.push([xc, s.barBot - h - rH - 3, polar[idx].phase, inclFlags[idx]]);
      }
      phaseHands(g, hands, rH);
      // the waterline: the faintest circle still inside K
      if (orderMode === 'mag' && waterMag > 0 && included.length < magOrder.length) {
        const y = Math.round(s.barBot - Math.sqrt(waterMag / maxMagV) * s.maxH) + 0.5;
        g.strokeStyle = 'rgba(232,200,124,0.55)'; g.setLineDash([5, 4]); g.lineWidth = 1;
        g.beginPath(); g.moveTo(s.pad - 6, y); g.lineTo(s.pad + s.innerW + 6, y); g.stroke();
        g.setLineDash([]);
        if (!L.narrow) {
          g.font = `9.5px ${MONO}`; g.fillStyle = 'rgba(232,200,124,0.8)'; g.textAlign = 'left';
          g.fillText(`K = ${K}`, s.pad + s.innerW + 8 > L.W - 36 ? L.W - 38 : s.pad + s.innerW + 8, y + 3);
        }
      }
      // axis
      g.font = `${L.narrow ? 9 : 9.5}px ${MONO}`; g.fillStyle = LABEL; g.textBaseline = 'alphabetic';
      g.textAlign = 'left'; g.fillText(`−${SLOTS_2D}`, s.pad, L.H - 6);
      g.textAlign = 'center'; g.fillText('0', s.pad + s.innerW / 2, L.H - 6);
      g.textAlign = 'right'; g.fillText(`+${SLOTS_2D}`, s.pad + s.innerW, L.H - 6);
      if (hov) {
        const j = Math.abs(hov.freq);
        const kk = `k = ${hov.freq > 0 ? '+' : '−'}${j}`;
        let t, col = LABEL;
        if (isNil(hoverIdx)) {
          t = L.narrow ? `${kk} · |c| = 0` : `${kk} · |c| = 0: this shape’s symmetry allows no circle turning at this speed`;
        } else {
          const inK = inclFlags[hoverIdx];
          const mg = hov.mag >= 1e-3 ? hov.mag.toFixed(4) : num(hov.mag, 6);
          t = L.narrow
            ? `${kk} · |c| ${mg}${inK ? ` · ${j * F0} Hz` : ' · beyond K'}`
            : `${kk} · |c| = ${mg} · phase ${num(hov.phase * 180 / Math.PI, 0)}° · ` +
              (inK ? `partial ${j}, ${j * F0} Hz` : 'beyond K: not in the chain, not in the tone');
          if (inK) col = P.azure;
        }
        hoverText(g, t, col);
      }
    }

    function strip1D(g) {
      const s = L.strip;
      const hov = hoverHarm >= 1;
      stripFrame(g, hov ? '' : L.narrow ? 'harmonics j = 1 … 32: drag a bar' : 'harmonics j = 1 … 32, each a sine at j·110 Hz: drag a bar to set its amplitude');
      const slotW = s.innerW / BARS_1D;
      const bw = Math.max(3, slotW * 0.58);
      const hands = [];
      const rH = clamp(slotW * 0.3, 2, 4.2);
      for (let j = 1; j <= BARS_1D; j++) {
        const xc = s.pad + (j - 0.5) * slotW;
        const a = amps1d[j];
        const h = Math.min(1, Math.abs(a)) * s.maxH;
        const isHov = j === hoverHarm;
        g.fillStyle = isHov ? P.goldBright : j <= kh1d ? P.gold : 'rgba(109,106,94,0.5)';
        if (h >= 0.5) g.fillRect(xc - bw / 2, s.barBot - h, bw, h);
        g.fillStyle = isHov ? P.azure : 'rgba(125,167,217,0.4)';
        g.fillRect(xc - bw / 2, s.barBot - h - 2, bw, 2);
        if (a !== 0 && slotW >= 7 && h >= 7) {
          // phase of b·sin(jx + φ), drawn as the angle of the equivalent circle
          const ph = phases1d[j] + (a < 0 ? Math.PI : 0);
          hands.push([xc, s.barBot - h - rH - 5, ph, j <= kh1d]);
        }
      }
      phaseHands(g, hands, rH);
      g.font = `${L.narrow ? 9 : 9.5}px ${MONO}`; g.fillStyle = LABEL; g.textBaseline = 'alphabetic';
      g.textAlign = 'left'; g.fillText('1', s.pad + slotW / 2 - 3, L.H - 6);
      g.textAlign = 'right'; g.fillText(String(BARS_1D), s.pad + s.innerW, L.H - 6);
      if (hov) {
        const a = amps1d[hoverHarm];
        const t = `harmonic ${hoverHarm} · b = ${num(a, 3)} · ${hoverHarm * F0} Hz` + (hoverHarm > kh1d && a !== 0 ? ' · beyond K' : '');
        hoverText(g, t);
      }
    }

    /* ---------- live drawing ---------- */
    function draw(dt) {
      if (morph) stepMorph(dt);
      if (dirtyTrunc && polar) rebuildTrunc();
      if (dirty1d) rebuild1d();
      if (!L || L.W !== handle.width || L.H !== handle.height) computeLayout();
      if (layerDirty) renderLayer();
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      if (W < 2 || H < 2) return;
      ctx.drawImage(layer, 0, 0, W, H);
      if (view === '2d') live2D(ctx, dt);
      else live1D(ctx, dt);
    }

    function live2D(ctx, dt) {
      const { cx, cy, S } = L;
      if (drawing || awaiting) {
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        rawStroke.forEach((p, i) => {
          const sx = cx + p.re * S, sy = cy + p.im * S;
          i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
        });
        ctx.stroke();
        const p0 = rawStroke[0];
        glowA.draw(ctx, cx + p0.re * S, cy + p0.im * S, 0.7);
        ctx.font = `italic 13px ${SERIF}`; ctx.fillStyle = P.inkDim;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(awaiting ? 'transforming…' : 'release to transform', L.main.x + 16, L.main.y + 22);
        return;
      }
      if (!recon || !reconN || !included.length || maxMagV <= 0) return;

      if (lapLeft > 0) {
        const d = Math.min(dt, lapLeft);
        frac = (frac + d / PERIOD) % 1;
        if (RM) lapLeft -= d;
      }

      // the epicycle chain: positions first, then three batched paths
      const n = included.length;
      const px = new Float64Array(n + 1), py = new Float64Array(n + 1);
      px[0] = cx + polar[0].mag * Math.cos(polar[0].phase) * S;
      py[0] = cy + polar[0].mag * Math.sin(polar[0].phase) * S;
      for (let i = 0; i < n; i++) {
        const p = polar[included[i]];
        const a = p.phase + TAU * p.freq * frac;
        const r = p.mag * S;
        px[i + 1] = px[i] + r * Math.cos(a);
        py[i + 1] = py[i] + r * Math.sin(a);
      }

      // the comet: the last quarter-lap behind the pen, brightening toward it
      const penF = frac * reconN;
      const tail = Math.floor(reconN * 0.26);
      const SEG = 8;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let sgi = 0; sgi < SEG; sgi++) {
        const a0 = Math.floor(penF - tail + (tail * sgi) / SEG);
        const a1 = Math.floor(penF - tail + (tail * (sgi + 1)) / SEG);
        const u = (sgi + 1) / SEG;
        ctx.globalAlpha = 0.08 + 0.92 * u * u;
        ctx.strokeStyle = sgi === SEG - 1 ? P.goldBright : P.gold;
        ctx.lineWidth = 0.8 + 1.9 * u;
        ctx.beginPath();
        for (let q = a0; q <= a1; q++) {
          const rr = ((q % reconN) + reconN) % reconN;
          const sx = cx + recon[2 * rr] * S, sy = cy + recon[2 * rr + 1] * S;
          q === a0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        if (sgi === SEG - 1) ctx.lineTo(px[n], py[n]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';

      // circles turning forward (k > 0) solid, backward (k < 0) dashed
      ctx.lineWidth = 1;
      for (const dir of [1, -1]) {
        ctx.strokeStyle = dir > 0 ? 'rgba(125,167,217,0.30)' : 'rgba(125,167,217,0.24)';
        ctx.setLineDash(dir > 0 ? [] : [3, 3]);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const p = polar[included[i]];
          if ((p.freq > 0) !== (dir > 0)) continue;
          const r = p.mag * S;
          if (r <= 1.2) continue;
          ctx.moveTo(px[i] + r, py[i]);
          ctx.arc(px[i], py[i], r, 0, TAU);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(232,226,208,0.34)';
      ctx.beginPath();
      for (let i = 0; i < n; i++) { ctx.moveTo(px[i], py[i]); ctx.lineTo(px[i + 1], py[i + 1]); }
      ctx.stroke();

      // the selected circle, lit
      if (hoverIdx >= 0 && inclFlags[hoverIdx]) {
        const i = included.indexOf(hoverIdx);
        if (i >= 0) {
          const r = Math.max(1.5, polar[hoverIdx].mag * S);
          ctx.strokeStyle = P.azure; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(px[i], py[i], r, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px[i], py[i]); ctx.lineTo(px[i + 1], py[i + 1]); ctx.stroke();
        }
      }
      glowA.draw(ctx, px[0], py[0], 0.55);
      glow.draw(ctx, px[n], py[n], 0.9);
    }

    function ideal1d(t) {
      // limits of the three preset series (see waveAmps1D)
      if (type1d === 'square') return t < Math.PI ? Math.PI / 4 : -Math.PI / 4;
      if (type1d === 'saw') return (Math.PI - t) / 2;
      if (type1d === 'triangle') {
        const s = Math.PI / 4, pk = Math.PI * Math.PI / 8;
        if (t < Math.PI / 2) return s * t;
        if (t < 1.5 * Math.PI) return pk - s * (t - Math.PI / 2);
        return -pk + s * (t - 1.5 * Math.PI);
      }
      return null;
    }

    function live1D(ctx, dt) {
      const m = L.main;
      if (listening && !RM) scroll1d = (scroll1d + dt * 1.1) % TAU;
      const pad = L.narrow ? 14 : 40;
      const innerW = Math.max(40, m.w - pad * 2);
      const x0 = m.x + pad;
      const cy = m.y + m.h * 0.54;
      const J = jumpInfo(type1d);
      const idealPk = type1d === 'square' ? SI_PI / 2
        : type1d === 'saw' ? SI_PI
        : type1d === 'triangle' ? Math.PI * Math.PI / 8
        : cache1dMax;
      const yMax = Math.max(cache1dMax, idealPk, 1e-6) * 1.14;
      const yS = (m.h * 0.36) / yMax;
      const tAt = (px) => {
        let t = ((px / innerW) * 2 * TAU + scroll1d) % TAU;
        if (t < 0) t += TAU;
        return t;
      };
      const valAt = (t) => cache1d[Math.min(CACHE_N - 1, Math.floor((t / TAU) * CACHE_N))];

      // axis
      ctx.strokeStyle = 'rgba(74,72,64,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Math.round(cy) + 0.5); ctx.lineTo(x0 + innerW, Math.round(cy) + 0.5); ctx.stroke();

      // the ideal limit, faint (presets only), pen lifted across the jumps
      if (type1d !== 'custom') {
        ctx.strokeStyle = 'rgba(169,164,147,0.42)';
        ctx.beginPath();
        let pen = false, prev = 0;
        for (let px = 0; px <= innerW; px += 2) {
          const v = ideal1d(tAt(px));
          const sy = cy - v * yS;
          if (pen && Math.abs(v - prev) > yMax * 0.8) pen = false;
          prev = v;
          if (pen) ctx.lineTo(x0 + px, sy); else { ctx.moveTo(x0 + px, sy); pen = true; }
        }
        ctx.stroke();
      }

      // Gibbs limit for the jump waveforms, and the horns filled in crimson
      if (J && !scrambled1d) {
        const lvl = type1d === 'square' ? SI_PI / 2 : SI_PI;
        ctx.strokeStyle = 'rgba(217,122,104,0.75)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, Math.round(cy - lvl * yS) + 0.5); ctx.lineTo(x0 + innerW, Math.round(cy - lvl * yS) + 0.5);
        ctx.moveTo(x0, Math.round(cy + lvl * yS) + 0.5); ctx.lineTo(x0 + innerW, Math.round(cy + lvl * yS) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        // the label hangs under the lower line and under the deepest trough
        // (which dips past the line while K is small), where the wave never goes
        const lab = L.narrow ? 'Gibbs limit · 8.95%' : 'Gibbs limit: the jump × 8.95%, beyond each edge';
        fitFont(ctx, lab, SERIF, 12, innerW * 0.7, 'italic ');
        ctx.fillStyle = CRIM; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(lab, x0 + innerW, Math.round(cy + Math.max(lvl, cache1dMax) * yS) + 15);
        // horns: where the sum runs past the ideal near a jump
        const h = Math.max(1, kh1d);
        const reach = (2.4 * Math.PI) / (h + 1);
        const jumps = type1d === 'square' ? [0, Math.PI, TAU] : [0, TAU];
        ctx.fillStyle = 'rgba(217,122,104,0.26)';
        for (let px = 0; px <= innerW; px += 1) {
          const t = tAt(px);
          let near = false;
          for (const jt of jumps) if (Math.abs(t - jt) < reach) { near = true; break; }
          if (!near) continue;
          const v = valAt(t), id = ideal1d(t);
          if (Math.abs(v) > Math.abs(id) && Math.sign(v) === Math.sign(id)) {
            const y1 = cy - v * yS, y2 = cy - id * yS;
            ctx.fillRect(x0 + px, Math.min(y1, y2), 1, Math.abs(y2 - y1));
          }
        }
      }

      // for a few terms, each sine drawn faintly behind the sum
      if (kh1d > 0 && K <= 6) {
        ctx.strokeStyle = 'rgba(125,167,217,0.38)'; ctx.lineWidth = 1;
        for (let j = 1; j <= kh1d; j++) {
          const b = amps1d[j];
          if (!b) continue;
          ctx.beginPath();
          for (let px = 0; px <= innerW; px += 2) {
            const t = tAt(px);
            const sy = cy - b * Math.sin(j * t + phases1d[j]) * yS;
            px ? ctx.lineTo(x0 + px, sy) : ctx.moveTo(x0 + px, sy);
          }
          ctx.stroke();
        }
      }

      // the partial sum
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let px = 0; px <= innerW; px += 1.5) {
        const sy = cy - valAt(tAt(px)) * yS;
        px ? ctx.lineTo(x0 + px, sy) : ctx.moveTo(x0 + px, sy);
      }
      ctx.stroke();

      // the measured horn, marked at its crest just right of a visible jump
      if (J && !scrambled1d && over1d != null && !listening) {
        const h = Math.max(1, kh1d);
        const xPk = Math.PI / (h + 1);          // near the first crest
        const tpk = [xPk, TAU + xPk];
        for (const tp of tpk) {
          const px = ((tp - scroll1d) / (2 * TAU)) * innerW;
          if (px < 6 || px > innerW - 60) continue;
          const v = partialSumPh(amps1d, phases1d, h, xPk);
          const sy = cy - v * yS;
          ctx.font = `${L.narrow ? 10 : 11}px ${MONO}`; ctx.fillStyle = CRIM; ctx.textAlign = 'left';
          const t = `${over1d >= 0 ? '+' : '−'}${Math.abs(over1d * 100).toFixed(1)}%`;
          ctx.fillText(t, x0 + px + 6, sy - 6);
          break;
        }
      }

      // the formula
      const label = type1d === 'square' ? 'square = Σ_{m} sin((2m+1)ωt)/(2m+1)'
        : type1d === 'saw' ? 'saw = Σ_{j} sin(jωt)/j'
        : type1d === 'triangle' ? 'triangle = Σ_{m} (−1)^{m} sin((2m+1)ωt)/(2m+1)^{2}'
        : 'f = Σ_{j} b_{j} sin(jωt + φ_{j}), your bars';
      rich(ctx, label, m.x + 16, m.y + 22,
        { size: L.narrow ? 10 : 11.5, family: MONO, maxW: m.w * (L.narrow ? 0.62 : 0.56), color: P.inkDim });
      if (scrambled1d) {
        rich(ctx, 'phases scrambled · every |b_{j}| kept', m.x + 16, m.y + 41,
          { size: 12.5, family: SERIF, style: 'italic ', color: CRIM, maxW: m.w - 32 });
      }
    }

    /* ---------- resize ---------- */
    handle.onResize((w) => {
      const want = heightFor(w);
      if (want !== copts.height) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { copts.height = want; cnv.style.height = want + 'px'; }, 0);
      }
      computeLayout();
    });

    /* ---------- boot ---------- */
    computeLayout();
    const loop = cv.rafLoop(draw);
    loadPreset('script');
    setView('2d');
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        stopListening();
        if (soloV) { soloV.dispose(); soloV = null; }
        bus.mute();
        loop.stop();
      },
      resume() {
        bus.unmute();
        loop.start();
      },
      destroy() {
        loop.stop();
        clearTimeout(dftTimer); clearTimeout(waveTimer); clearTimeout(dipTimer); clearTimeout(resizeTimer);
        stopListening();
        if (soloV) { soloV.dispose(); soloV = null; }
        unbindPointer();
        bus.dispose();
        handle.destroy();
        styleEl.remove();
      },
    };
  },
};

/* ==================== tests ==================== */

export const _test = {
  resampleUniform,
  toPolar,
  evalChain,
  scramblePhases,
  sortIdxByMag,
  residualEnergy,
  foldToWave,
  decayExponent,
  catmullRomClosed,
  presetPoints,
  waveAmps1D,
  partialSum1D,
  spectrum: (points) => toPolar(dft(points)),
  roundtrip: (points) => idft(dft(points)),
  // v2 additions
  sortIdxByFreq,
  residualFor,
  foldEnergy,
  waveSamples,
  decayFit,
  foldedMags,
  decayLabel,
  sineIntegral,
  rippleLimits,
  partialSumPh,
  termsToHarm,
  jumpInfo,
  overshoot1D,
  randomPhases,
  K_STEPS,
  richParts,
  selfTest,
};
