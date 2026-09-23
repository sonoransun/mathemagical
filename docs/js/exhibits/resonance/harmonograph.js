// II.3 — The Harmonograph
// Two tones drive x and y. A rational ratio p:q draws a closed figure; near it
// the figure precesses at exactly |q·f1 − p·f2| Hz, the generalized beat, so
// the wah you hear is the rotation you see. Three panels: a triggered
// oscilloscope (with the two waves drawn as a construction below and beside
// the figure), the Victorian damped-pendulum harmonograph on smoked paper,
// and a third voice that turns a triad into a closed space curve whose knot
// type is computed live (Alexander polynomial from the crossings of a shadow).
//
// Sources checked at build time (Sept 2026): Dean and Bowditch, Memoirs of the
// American Academy of Arts and Sciences 3(2) (1815), pp. 241–245 and 413–436
// (282 vs 286 swings; 67 swings near the octave); Rayleigh, Theory of Sound I
// (1877) §60; Goold, Benham, Kerr & Wilberforce, Harmonic Vibrations and
// Vibration Figures (1909), preface and pp. 29–35; Plomp, JASA 42 (1967);
// Chaieb et al., Front. Psychiatry 6:70 (2015); Bogle, Hearst, Jones &
// Stoilov, JKTR 3 (1994). Knot identifications below were recomputed here
// (7-crossing shadows; Δ = 2 − 5t + 2t² is 6₁, Δ = 2 − 3t + 2t² is 5₂).

import { TAU, clamp, continuedFraction, convergents } from '../../core/math.js';

/* ---------------- pure logic (node-testable) ---------------- */

// The generalized beat: a Lissajous figure near the rational ratio p:q
// precesses (returns to its own shape) at exactly |q·f1 − p·f2| Hz.
function precessionHz(f1, f2, p, q) {
  return Math.abs(q * f1 - p * f2);
}

// The point generator: x = sin(2π f1 t + φ), y = sin(2π f2 t).
// Periodic iff f1/f2 is rational; for f1/f2 = p/q the period is q/f2.
function lissajousPoint(t, { f1, f2, phase = 0 }) {
  return [Math.sin(TAU * f1 * t + phase), Math.sin(TAU * f2 * t)];
}

// The Victorian machine: damped pendulums. x = e^(−d1·t)·sin(2π f1 t + φ), etc.
function harmonographPoint(t, { f1, f2, phase = 0, d1 = 0.16, d2 = 0.19 }) {
  return [
    Math.exp(-d1 * t) * Math.sin(TAU * f1 * t + phase),
    Math.exp(-d2 * t) * Math.sin(TAU * f2 * t),
  ];
}

// A three-frequency Lissajous curve in R^3, parameter u ∈ [0, 2π).
function knotPoint(u, n, ph) {
  return [
    Math.sin(n[0] * u + ph[0]),
    Math.sin(n[1] * u + ph[1]),
    Math.sin(n[2] * u + ph[2]),
  ];
}

// Deepest continued-fraction convergent p/q of x with q ≤ maxDen — the
// "nearest simple ratio" the ear and eye are both measuring against.
function nearestRatio(x, maxDen = 12) {
  const cv = convergents(continuedFraction(x, 24));
  let best = cv[0];
  for (const [p, q] of cv) if (q <= maxDen) best = [p, q];
  return [best[0], best[1]];
}

const INTERVAL_NAMES = {
  '1:1': 'unison', '2:1': 'octave', '3:2': 'perfect fifth', '4:3': 'perfect fourth',
  '5:4': 'major third', '6:5': 'minor third', '5:3': 'major sixth',
  '8:5': 'minor sixth', '9:8': 'major second', '7:4': 'harmonic seventh',
};
function intervalName(p, q) {
  return INTERVAL_NAMES[`${p}:${q}`] || null;
}

// Symmetric naming for display (either tone may be the higher one).
const DYAD_NAMES = {
  ...INTERVAL_NAMES,
  '3:1': 'twelfth', '4:1': 'two octaves', '5:2': 'major tenth', '9:5': 'minor seventh',
  '15:8': 'major seventh', '7:2': 'octave and harmonic seventh', '7:3': 'octave and septimal minor third',
  '7:6': 'septimal minor third',
};
function dyadName(a, b) {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return DYAD_NAMES[`${hi}:${lo}`] || null;
}
// “a unison”, “an octave”: the article follows the sound, not the letter.
function withArticle(name) {
  if (!name) return 'no simple name';
  return (/^(?:[aeio]|u(?!ni))/i.test(name) ? 'an ' : 'a ') + name;
}

function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

// Octave-transposed pens for the ink panel. The pen for y swings K times
// slower than the tone; the pen for x is placed so that the generalized beat
// is kept exactly: q·pf1 − p·pf2 = q·f1 − p·f2.
function penFrequencies(f1, f2, p, q, K) {
  const pf2 = f2 / K;
  const pf1 = (p / q) * pf2 + (f1 - (p / q) * f2);
  return [pf1, pf2];
}
// Power-of-two divisor that opens successive passes to about gapPx pixels
// (pass spacing ≈ A·d/pf2 for amplitude A px and damping d per second).
function penDivisor(f2, A, d, gapPx = 2.6) {
  const want = (f2 * gapPx) / Math.max(1e-6, A * d);
  return 2 ** clamp(Math.round(Math.log2(Math.max(1, want))), 0, 8);
}

// Relative phase (in turns) that fixes a p:q figure's shape. It advances by
// exactly one turn per tumble, i.e. at q·f1 − p·f2 turns per second.
function relativePhase(c1, c2, p, q) {
  const v = q * c1 - p * c2;
  return v - Math.floor(v);
}

/* ----- knots: crossings of the x–y shadow → Alexander polynomial ----- */
// Polynomials are arrays of BigInt coefficients, index = power of t.
const pTrim = (p) => { p = p.slice(); while (p.length > 1 && p[p.length - 1] === 0n) p.pop(); return p; };
const pAdd = (a, b) => { const n = Math.max(a.length, b.length); const r = []; for (let i = 0; i < n; i++) r.push((a[i] || 0n) + (b[i] || 0n)); return pTrim(r); };
const pNeg = (a) => a.map((x) => -x);
const pSub = (a, b) => pAdd(a, pNeg(b));
const pMul = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0n); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; return pTrim(r); };
const pZero = (a) => a.length === 1 && a[0] === 0n;
function pDiv(a, b) { // exact division
  a = pTrim(a); b = pTrim(b);
  if (pZero(a)) return [0n];
  const q = new Array(Math.max(1, a.length - b.length + 1)).fill(0n);
  let r = a.slice();
  const lb = b[b.length - 1];
  while (!pZero(r) && r.length >= b.length) {
    const lr = r[r.length - 1];
    if (lr % lb !== 0n) throw new Error('inexact');
    const c = lr / lb, sh = r.length - b.length;
    q[sh] = c;
    r = pSub(r, new Array(sh).fill(0n).concat(b.map((x) => x * c)));
  }
  if (!pZero(r)) throw new Error('remainder');
  return pTrim(q);
}
function pDet(M) { // fraction-free Bareiss determinant over Z[t]
  const n = M.length;
  if (n === 0) return [1n];
  M = M.map((row) => row.map((x) => x.slice()));
  let prev = [1n], sign = 1n;
  for (let k = 0; k < n - 1; k++) {
    if (pZero(M[k][k])) {
      let sw = -1;
      for (let i = k + 1; i < n; i++) if (!pZero(M[i][k])) { sw = i; break; }
      if (sw < 0) return [0n];
      [M[k], M[sw]] = [M[sw], M[k]]; sign = -sign;
    }
    for (let i = k + 1; i < n; i++) for (let j = k + 1; j < n; j++) {
      M[i][j] = pDiv(pSub(pMul(M[i][j], M[k][k]), pMul(M[i][k], M[k][j])), prev);
    }
    prev = M[k][k];
  }
  return M[n - 1][n - 1].map((x) => x * sign);
}

// Crossings of the curve's x–y shadow, with heights (z) at each strand.
function shadowCrossings(n, ph, N) {
  const X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = knotPoint((TAU * i) / N, n, ph);
    X[i] = x; Y[i] = y; Z[i] = z;
  }
  const res = [];
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    const ax = X[i], ay = Y[i], bx = X[i2], by = Y[i2];
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minY = Math.min(ay, by), maxY = Math.max(ay, by);
    for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) continue;
      const j2 = (j + 1) % N;
      const cx = X[j], cy = Y[j], dx = X[j2], dy = Y[j2];
      if (maxX < Math.min(cx, dx) || Math.max(cx, dx) < minX) continue;
      if (maxY < Math.min(cy, dy) || Math.max(cy, dy) < minY) continue;
      const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-18) continue;
      const qx = cx - ax, qy = cy - ay;
      const t = (qx * sy - qy * sx) / den;
      const w = (qx * ry - qy * rx) / den;
      if (t < 0 || t >= 1 || w < 0 || w >= 1) continue;
      const za = Z[i] + t * (Z[i2] - Z[i]);
      const zc = Z[j] + w * (Z[j2] - Z[j]);
      res.push({ s1: i + t, s2: j + w, z1: za, z2: zc, d1: [rx, ry], d2: [sx, sy], gap: Math.abs(za - zc) });
    }
  }
  return res;
}

// Alexander polynomial (normalized: lowest power t⁰, positive constant term),
// the crossing count of the x–y shadow, the determinant |Δ(−1)| and the
// smallest height gap at a crossing (how close the curve comes to itself).
function knotInvariant(n, ph, N = 1600) {
  const res = shadowCrossings(n, ph, N);
  const c = res.length;
  if (c === 0) return { crossings: 0, poly: [1], det: 1, minGap: Infinity };
  const ev = [];
  res.forEach((x, k) => {
    const over1 = x.z1 > x.z2;
    ev.push({ s: x.s1, k, over: over1, dir: x.d1 });
    ev.push({ s: x.s2, k, over: !over1, dir: x.d2 });
  });
  ev.sort((a, b) => a.s - b.s);
  const info = res.map(() => ({}));
  let cur = c - 1;
  for (const e of ev) {
    if (e.over) { info[e.k].over = cur; info[e.k].overDir = e.dir; }
    else { info[e.k].inArc = cur; info[e.k].underDir = e.dir; cur = (cur + 1) % c; info[e.k].outArc = cur; }
  }
  const M = [];
  for (let k = 0; k < c; k++) {
    const I = info[k];
    const o = I.overDir, u = I.underDir;
    const sgn = o[0] * u[1] - o[1] * u[0] > 0 ? 1 : -1;
    const row = Array.from({ length: c }, () => [0n]);
    const put = (j, p) => { row[j] = pAdd(row[j], p); };
    if (sgn > 0) { put(I.over, [1n, -1n]); put(I.inArc, [0n, 1n]); put(I.outArc, [-1n]); }
    else { put(I.over, [-1n, 1n]); put(I.inArc, [1n]); put(I.outArc, [0n, -1n]); }
    M.push(row);
  }
  let poly = pTrim(pDet(M.slice(0, c - 1).map((r) => r.slice(0, c - 1))));
  let lo = 0; while (lo < poly.length - 1 && poly[lo] === 0n) lo++;
  poly = poly.slice(lo);
  if (poly[0] < 0n) poly = pNeg(poly);
  const num = poly.map(Number);
  const det = Math.abs(num.reduce((s, v, i) => s + (i % 2 ? -v : v), 0));
  let minGap = Infinity;
  for (const x of res) minGap = Math.min(minGap, x.gap);
  return { crossings: c, poly: num, det, minGap };
}

// Names are given only where the identification is rigorous: every knot with
// at most 10 crossings has Δ ≠ 1, and among knots with at most 7 crossings
// these polynomials occur once each.
const KNOT_NAMES = {
  '2,-3,2': '5₂, the three-twist knot', '2,-5,2': '6₁, the stevedore knot',
  '4,-7,4': 'the knot 7₄', '3,-5,3': 'the knot 7₂',
  '1,-3,1': '4₁, the figure-eight knot', '1,-1,1': '3₁, the trefoil',
};
function knotName(poly, crossings) {
  const key = poly.join(',');
  if (key === '1') return crossings <= 10 ? 'the unknot' : null;
  if (crossings > 7) return null;
  return KNOT_NAMES[key] || null;
}

const SUP = ['', '', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function formatPoly(poly) {
  let s = '';
  poly.forEach((c, i) => {
    if (c === 0) return;
    const mag = Math.abs(c);
    const term = i === 0 ? String(mag) : `${mag === 1 ? '' : mag}t${i === 1 ? '' : SUP[i] || '^' + i}`;
    s += s ? (c < 0 ? ' − ' : ' + ') + term : (c < 0 ? '−' : '') + term;
  });
  return s || '0';
}

// For a triple with exactly one odd frequency (the others even), the curve
// satisfies P(u + π) = P(u) with that coordinate reversed, so it passes
// through itself wherever that coordinate vanishes: n_odd points u ∈ [0, π).
function doublePoints(n, ph) {
  const odd = n.map((k) => k % 2 !== 0);
  if (odd.filter(Boolean).length !== 1) return [];
  const i = odd.indexOf(true);
  const out = [];
  for (let k = 0; k < 2 * n[i]; k++) {
    let u = (k * Math.PI - ph[i]) / n[i];
    u = ((u % TAU) + TAU) % TAU;
    if (u < Math.PI - 1e-9) out.push(u);
  }
  return out.sort((a, b) => a - b);
}

/* ---------------- voicings (third-voice panel) ---------------- */

// Frequencies are ratio × 55 Hz. Default phases (sine convention) chosen and
// checked with knotInvariant: 2:3:5 ties 6₁ and 2:3:7 ties 5₂ (both on 7-
// crossing shadows); 3:4:5 is knotted (Δ ≠ 1) on a 17-crossing shadow.
const CHORDS = [
  { n: [4, 5, 6], ph: [1.17, 0.42, 0.0], label: '4:5:6 · major triad, close', desc: 'the major triad in close position' },
  { n: [3, 4, 5], ph: [1.17, 0.42, 1.3963], label: '3:4:5 · second inversion', desc: 'the same triad, second inversion' },
  { n: [2, 3, 5], ph: [1.7708, 3.0708, 1.5708], label: '2:3:5 · open, E a tenth up', desc: 'open: C, G, and the E a tenth above' },
  { n: [2, 3, 7], ph: [1.7708, 2.2708, 1.5708], label: '2:3:7 · with a harmonic seventh', desc: 'C, G, and a harmonic seventh an octave up' },
];
const KNOT_BASE = 55;
const SNAPS = [[1, 1], [2, 1], [3, 2], [4, 3], [5, 4], [5, 3]];
const SNAP_LABEL = { '1:1': 'unison', '2:1': 'octave', '3:2': 'fifth', '4:3': 'fourth', '5:4': 'maj. third', '5:3': 'maj. sixth' };

/* ---------------- the exhibit ---------------- */

export default {
  id: 'harmonograph',
  movement: 2,
  title: 'The Harmonograph',
  hook: 'What a chord looks like.',
  era: '1815 – today · Burlington, Paris, London, Soesterberg',
  prose: `
    <p>Send one tone to your left ear and another to your right, and let each steer a point of
    light: the left tone pushes it east and west, the right tone north and south. A chord
    becomes a drawing. Jules Lissajous made such drawings famous in 1857, with small mirrors
    fixed to two tuning forks set at right angles, a beam of light bounced off both onto a
    screen, and persistence of vision to hold the racing spot still. What the forks knew is this
    movement’s refrain: <em>the figure closes exactly when the frequency ratio is rational</em>.
    Sound a perfect fifth, <code>3:2</code>, and the light folds into a pretzel that presses three
    times against each side of its frame and twice against the top and bottom. The ratio can be
    read off the glass like a fraction, and the laboratories read it. Their steadiness, Lord
    Rayleigh wrote in 1877, “is a very severe test of the accuracy with which the ratio is
    attained.”</p>
    <p>Lissajous also watched what happens when the ratio <em>almost</em> holds: forks a shade
    out of tune drew an ellipse that turned over and over. The theorem of this exhibit says how
    fast. Tune <em>x</em> to 331&nbsp;Hz against <em>y</em>’s 220, a whisker sharp of a true fifth,
    and the figure no longer closes. It precesses, tumbling through every version of itself at
    exactly <code>|q·f₁ − p·f₂| = |2·331 − 3·220| = 2</code> turns per second. That expression is the beat
    frequency, generalized. At unison it collapses to the familiar <code>|f₁ − f₂|</code>: detune
    by 0.3&nbsp;Hz and the ellipse rolls over once every 3.33 seconds while your ears report one
    slow <em>wah</em> every 3.33 seconds. These are not two phenomena that happen to agree. The wah
    <em>is</em> the rotation, reported by a different sense. The ear has been caught obeying the
    same law: in 1967 R.&nbsp;Plomp, at the Institute for Perception in Soesterberg, found that two
    pure tones near a simple ratio <em>m</em>:<em>n</em> can be heard to beat <code>mN − nM</code>
    times per second, the same expression under other letters.</p>
    <p>Before Lissajous there was Bowditch, and before Bowditch a mistuned unison that the Earth
    drew. In a memoir printed in 1815, James Dean, professor of mathematics and natural philosophy
    at the University of Vermont, worked out how our planet looks from the Moon: almost fixed in the
    lunar sky, but wandering as
    the Moon librates, and in the time the Moon rocks 79½ times in longitude it rocks 80½ times
    in latitude. One extra rock in eighty is a slow beat. The Earth’s path opens from a slanting
    line into an oval, narrows to the opposite slant and opens again, the whole cycle taking “one
    or two days less than six years.” Dean noted that a ball hung from a forked thread would
    imitate it. In the same volume Nathaniel Bowditch, reading Dean, worked out the pendulum’s curves,
    hung a lead ball about half an inch across, and counted: the cycle closed after 282 swings,
    against the 286 his equations predicted. A second pendulum, tuned near an octave, rolled its
    parabola over into another and back in 67 swings, “which agrees with the theory.”</p>
    <p>Here the eye is the steadier instrument, and the ear the stranger one. Through loudspeakers
    a mistuned unison beats loudly: the two waves meet in the room and genuinely cancel and
    reinforce. Through headphones, the way this exhibit sends them, the left tone never reaches the
    right ear, and yet the slow wah is still there. It is a <em>binaural beat</em>, first reported
    by Heinrich Wilhelm Dove in 1839 and assembled in the brainstem, where neurons that compare
    the phase of the sound at the two ears fire at a rate that follows the difference. That phase
    difference is exactly what the ellipse draws. A mistuned fifth is subtler still. The power of
    the combined wave never swells; only its shape cycles, and the faint flutter Plomp measured
    comes, his experiments suggested, from how the two tones overlap along the cochlea, not from
    any distortion the ear adds. The oscilloscope needs none of this machinery. It shows the sour fifth tumbling
    at exactly the rate the arithmetic demands, as plainly as the sour unison. Whatever else
    consonance may be, on this screen it is simply the visible smallness of a fraction.</p>
    <p>The Victorians built this exhibit out of hardware. Hugh Blackburn’s pendulum, first shown
    in 1844, was a heavy weight on a forked cord that traced its orbit in sand or lampblack; Hubert
    Airy tied a pencil to a vibrating shoot of acacia and let it write; and in 1874 S.&nbsp;C. Tisley
    and Spiller, of London, showed the <em>harmonograph</em> “in practically its present form,”
    two pendulums swinging at right angles with one pen under their combined influence. The
    machine adds one thing to the oscilloscope: friction. Each swing is a shade smaller than the
    last, <code>x = A·e<sup>−dt</sup>·sin(2πf₁t + φ)</code>, so ink that would merely
    retrace itself lays every pass just inside the one before. The tumble becomes a woven spiral,
    the decay a perspective drawing of time; the machine’s whole charm is a damping term. In the
    pendulum panel the pens swing several octaves below the tones, slow enough for the loops to
    open, yet they keep the tones’ beat and the tones’ decay, so the sound dies away at the rate
    the drawing shrinks and you hear the figure converge. When Newton &amp; Co. published a manual
    of the art, <em>Harmonic Vibrations and Vibration Figures</em>, in 1909, two London publishers
    had already turned it down as unprofitable, and its editor admitted that the results were
    “not directly utilitarian in character, although a use may be found for them some day.”</p>
    <p>One more axis remains. Give a third tone the <em>z</em> direction and a triad becomes a
    closed curve in space, a loop you can turn in your hands. Its three shadows on the walls are
    the chord’s three intervals: for the major triad <code>4:5:6</code>, a major third
    <code>4:5</code>, a minor third <code>5:6</code>, and the fifth <code>4:6</code>, which is
    <code>2:3</code> traced twice over. That doubling is exactly why the close-position curve
    passes through itself, at five points you can see marked. Open the voicing to
    <code>2:3:5</code>, C and G with the E a tenth above, and no two frequencies share a factor.
    The curve comes apart into an embedded loop, and with the right phases it ties a genuine knot,
    the stevedore. With a harmonic seventh, <code>2:3:7</code>, it ties the three-twist knot, the
    example Bogle, Hearst, Jones and Stoilov gave in 1994 when they named these <em>Lissajous
    knots</em>, prompted by the shapes of DNA. One of the four, Vaughan Jones, had won a Fields
    Medal four years earlier for work that included a new polynomial invariant of knots. Their
    paper also found the limit: a Lissajous knot must have Arf invariant zero, so the trefoil, the
    simplest knot there is, can never be played by any chord of pure tones.</p>`,

  chronicle: [
    { year: 1815, date: '1815', text: 'In the <em>Memoirs</em> of the American Academy of Arts and Sciences, James Dean of the University of Vermont shows that the Earth, seen from the Moon, wanders through a slowly turning near-unison figure that a ball on a forked thread can imitate; in the same volume Nathaniel Bowditch works out the curves and counts the pendulum’s cycle at 282 swings against the 286 he predicted.' },
    { year: 1857, date: '1857', text: 'Jules Lissajous publishes his <em>Mémoire sur l’étude optique des mouvements vibratoires</em>, throwing the figures of two tuning forks set at right angles onto a screen with mirrors and a beam of light.' },
    { year: 1874, date: '1874', text: 'S. C. Tisley and Spiller, of London, show the pendulum <em>harmonograph</em> “in practically its present form”: two pendulums swinging at right angles, one pen under their combined influence.' },
    { year: 1932, date: '1932', text: 'Henri de Bellescize describes a receiver whose local oscillator is held in step with the incoming wave, the idea now called the <em>phase-locked loop</em>.' },
    { year: 1967, date: '1967', text: 'R. Plomp, at the Institute for Perception in Soesterberg, reports that two pure tones near a simple ratio <em>m</em>:<em>n</em> can be heard to beat <em>mN − nM</em> times per second, and finds evidence that the beat does not come from distortion inside the ear.' },
    { year: 1994, date: '1994', text: 'Bogle, Hearst, Jones and Stoilov define <em>Lissajous knots</em>, prompted by the shapes of DNA, and prove that the trefoil can never be one.' },
    { year: 2005, date: 'June 2005', text: 'Bernhard Gleich and Jürgen Weizenecker introduce magnetic particle imaging, many of whose scanners come to sweep a point of zero field through the body along Lissajous paths.' },
    { year: 2016, date: '2016', text: 'Jerobeam Fenderson and Hansi3D release the album <em>Oscilloscope Music</em>, stereo sound written so that its own waveform, on a scope’s two axes, draws the picture.' },
  ],

  today: `
    <p>The rule drawn here, that two oscillations near the ratio <em>p</em>:<em>q</em> slip past
    each other at <code>|q·f₁ − p·f₂|</code> turns a second, is the working principle of the
    <em>phase-locked loop</em>. Henri de Bellescize described one in 1932, a receiver whose local
    oscillator is held in step with the incoming wave. A modern frequency synthesizer divides a
    fast oscillator by <em>N</em> and a quartz reference by <em>M</em>, compares the two phases,
    which slip at a rate proportional to <code>M·f<sub>out</sub> − N·f<sub>ref</sub></code>, and steers the oscillator
    until the slip stops. The figure closes, and the output is exactly <em>N</em>/<em>M</em> times
    the crystal. Such loops set the frequencies of radios and the clocks of processors, and
    satellite-navigation receivers track each satellite’s carrier with phase- or frequency-locked
    loops, the first step toward <a href="#ex-whereami">finding where they are</a>.</p>
    <p>The curve itself now steers instruments. In <em>magnetic particle imaging</em>, introduced
    by Bernhard Gleich and Jürgen Weizenecker in 2005 and fast enough by 2009 to film a beating
    mouse heart in three dimensions every 21.5 milliseconds, a single point of zero magnetic field
    is swept through the body and a nanoparticle tracer answers wherever it passes; most
    experimental scanners sweep that point along either a raster or a Lissajous path. Some
    high-speed atomic-force microscopes scan in Lissajous figures too, because two pure sine
    motions have none of the sharp turnarounds of a raster to shake the scanner’s own resonances.
    And from 2014 to 2025 ESA’s Gaia charted
    the Milky Way from a Lissajous-type orbit around the Sun–Earth point L2, a loop 263,000 by
    707,000 by 370,000 kilometres that it rounded every 180 days.</p>
    <p>The stereo scope is an instrument again. Jerobeam Fenderson and Hansi3D write
    <em>Oscilloscope Music</em>, most recently the 2024 EP <em>N-Spheres</em>, so that its left and
    right channels, wired to a scope’s horizontal and vertical axes, draw the animation you watch;
    James Ball’s open-source osci-render turns 3-D models and text into sound for the same screen.
    The knots are live mathematics too. Christoph Lamm proved in 1997 that there are infinitely many Lissajous knots, and in 2011
    Pierre-Vincent Koseleff and Daniel Pecker showed that if the sines are exchanged for Chebyshev
    polynomials, every knot there is can be drawn this way.</p>`,

  sources: [
    { text: 'James Dean, “An investigation of the apparent motion of the earth, viewed from the moon, arising from the moon’s librations,” and Nathaniel Bowditch, “On the motion of a pendulum suspended from two points,” <em>Memoirs of the American Academy of Arts and Sciences</em> 3, part 2 (1815) 241–245 and 413–436', url: 'https://archive.org/details/sim_american-academy-of-arts-and-sciences-boston-memoirs_1809_3' },
    { text: 'J. J. O’Connor and E. F. Robertson, “Jules Antoine Lissajous,” MacTutor History of Mathematics', url: 'https://mathshistory.st-andrews.ac.uk/Biographies/Lissajous/' },
    { text: 'John William Strutt, Lord Rayleigh, <em>The Theory of Sound</em>, vol. 1 (London: Macmillan, 1877), §60', url: 'https://archive.org/details/theorysound06raylgoog' },
    { text: 'Joseph Goold, Charles E. Benham, Richard Kerr and L. R. Wilberforce, ed. H. C. Newton, <em>Harmonic Vibrations and Vibration Figures</em> (London: Newton &amp; Co., 1909)', url: 'https://archive.org/details/in.ernet.dli.2015.222057' },
    { text: 'R. Plomp, “Beats of Mistuned Consonances,” <em>Journal of the Acoustical Society of America</em> 42 (1967) 462–474', url: 'https://doi.org/10.1121/1.1910602' },
    { text: 'Leila Chaieb, Elke C. Wilpert, Thomas P. Reber and Juergen Fell, “Auditory Beat Stimulation and its Effects on Cognition and Mood States,” <em>Frontiers in Psychiatry</em> 6:70 (2015)', url: 'https://doi.org/10.3389/fpsyt.2015.00070' },
    { text: 'M. G. V. Bogle, J. E. Hearst, V. F. R. Jones and L. Stoilov, “Lissajous Knots,” <em>Journal of Knot Theory and Its Ramifications</em> 3 (1994) 121–140', url: 'https://doi.org/10.1142/S0218216594000095' },
    { text: 'Henri de Bellescize, “Synchronizing system,” U.S. Patent 1,990,428 (filed 29 September 1932, granted 5 February 1935)', url: 'https://patents.google.com/patent/US1990428A/en' },
    { text: 'F. Werner, N. Gdaniec and T. Knopp, “First experimental comparison between the Cartesian and the Lissajous trajectory for magnetic particle imaging,” <em>Physics in Medicine and Biology</em> 62 (2017) 3407–3421', url: 'https://doi.org/10.1088/1361-6560/aa6177' },
    { text: 'Jerobeam Fenderson and Hansi3D, <em>Oscilloscope Music</em>', url: 'https://oscilloscopemusic.com/' },
  ],

  alt: 'Two tones drawn as a glowing Lissajous figure in a square frame, with the left-ear wave hanging below it and the right-ear wave beside it, a corner dial whose bead turns once per beat, and the nearest ratio set in type above a strip that plots the tumble against time; a second panel lets two damped pendulums weave lace on smoked paper, and a third turns a three-tone chord into a closed curve in space, with the chord’s three intervals as shadows on the walls and its knot named from the crossings.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const SERIF = getComputedStyle(document.body).fontFamily || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const LABEL = '#8a8676';                       // legible small text (visual.md F4)
    const GHOST = P.inkGhost || '#4a4840';
    const CRIM = P.crimsonBright || '#d97a68';
    const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ---------- scoped style ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-harmonograph .hg-tabs { gap: .45rem; margin: 0 0 .8rem; }
      #ex-harmonograph .hg-tabs .btn { letter-spacing: .04em; }
      #ex-harmonograph .hg-tabs .btn .hg-num { font-style: italic; color: ${P.azure}; margin-right: .45em; }
      #ex-harmonograph .hg-tabs .btn.active { border-color: ${P.azure}; background: rgba(125,167,217,.12); color: ${P.ink}; }
      #ex-harmonograph .hg-sr { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
      #ex-harmonograph .exhibit-stage canvas:focus-visible { outline: 2px solid ${P.azure}; outline-offset: 2px; }
      #ex-harmonograph .hg-snaps .btn .hg-r { font-family: ${MONO}; font-size: .92em; margin-right: .35em; color: ${P.gold}; }
      #ex-harmonograph .hg-snaps .btn.active .hg-r { color: ${P.goldBright}; }
      #ex-harmonograph .stage-caption code { white-space: nowrap; }
    `;
    stage.appendChild(styleEl);

    /* ---------- state ---------- */
    let mode = 'scope';            // 'scope' | 'ink' | 'knot'
    let f2 = 220;                  // y / right-ear frequency (Hz)
    let f1base = 330;              // x / left-ear frequency before detune
    let det = 0;                   // detune applied to x (Hz); boots closed, as the prose promises
    let snap = '3:2';              // active snap label or null
    let phaseTarget = Math.PI / 2; // φ on x (picture only)
    let phaseDisp = Math.PI / 2;   // smoothed φ used for drawing
    let c1 = 0, c2 = 0;            // accumulated cycles of x and y (the visual clock)
    let lastAT = -1;               // last audio-clock reading, or −1
    let nr = [3, 2];               // cached nearest ratio for current f1/f2
    let soundOn = false;
    let together = false;          // both tones in both ears (a physical beat)
    let pen = null;                // ink-panel pen
    let chordIdx = 2;              // third-voice voicing (2:3:5, the stevedore)
    let phZ = CHORDS[chordIdx].ph[2];
    let knotInfo = null;           // cached invariant for the current voicing
    let yaw = 0.62, pitch = 0.38, dragging = false, dragX = 0, dragY = 0, dragged = false;
    let knotFitS = 80;
    let spotClock = 0;             // decorative reading guide on the scope figure
    let taps = [];                 // tap-the-beat times (s)
    let tapMarks = [];             // the same taps on the drawing clock, for the beat track
    // The beat track: the figure's relative phase ψ (in turns) over the last
    // few seconds, sampled on the drawing clock. It wraps once per tumble.
    const HIST = 360, TRACK_S = 8;    // the track shows at most 8 s, fewer when the beat is quick
    const trackSpan = (prec) => clamp(5 / Math.max(prec, 1e-6), 2.5, TRACK_S);
    const histT = new Float64Array(HIST), histP = new Float32Array(HIST);
    let histN = 0, histHead = 0;
    let dirty = true;
    let questNextAt = 0, clockNow = 0;

    const DX = 0.16, DY = 0.19;    // ink damping (1/s)
    const LVL = 0.14, LVLM = 0.1, LVL3 = 0.11;
    const f1 = () => f1base + det;
    const chord = () => CHORDS[chordIdx];

    /* ---------- audio ---------- */
    const bus = audio.createBus('harmonograph');
    let sx = null, sy = null;      // split pair: x hard left, y hard right
    let mx = null, my = null;      // together pair: both centred
    let vz = null;                 // third voice, centred

    /* ---------- layout / canvas ---------- */
    const stageInnerW = () => {
      const cs = getComputedStyle(stage);
      return Math.max(260, stage.getBoundingClientRect().width - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
    };
    const heightFor = (w) => (w >= 560 ? 480 : Math.round(clamp(w, 300, 480)));

    const tabs = ui.controlRow(stage);
    tabs.classList.add('hg-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Harmonograph panels');
    const TABS = [['scope', 'i', 'the scope'], ['ink', 'ii', 'the pendulums'], ['knot', 'iii', 'a third voice']];
    const tabBtns = {};
    for (const [key, num, label] of TABS) {
      const b = ui.button(tabs, label, () => setMode(key), { small: true });
      b.innerHTML = `<span class="hg-num">${num}</span>${label}`;
      b.type = 'button';
      tabBtns[key] = b;
    }

    const copts = { height: heightFor(stageInnerW()) };
    const handle = cv.setupCanvas(stage, copts);
    handle.canvas.setAttribute('role', 'img');
    const goldGlow = cv.glowSprite(P.goldBright, 30);
    const L = {};
    let resizeTimer = 0;

    const row1 = ui.controlRow(stage);
    const soundBtn = ui.button(row1, '♪ sound the dyad', toggleSound, { primary: true });
    soundBtn.setAttribute('aria-pressed', 'false');
    const f1Slider = ui.slider(row1, {
      label: 'x — left ear', min: 110, max: 880, step: 0.1, value: f1base,
      format: (v) => `${v.toFixed(1)} Hz`,
      onInput: (v) => { f1base = v; snap = null; onFreqsChanged(); },
    });
    const f2Slider = ui.slider(row1, {
      label: 'y — right ear', min: 110, max: 440, step: 1, value: f2,
      format: (v) => `${v.toFixed(0)} Hz`,
      onInput: (v) => {
        f2 = v;
        if (snap) { const [p, q] = snap.split(':').map(Number); f1base = (f2 * p) / q; f1Slider.set(f1base); }
        onFreqsChanged();
      },
    });
    const detSlider = ui.slider(row1, {
      label: 'detune x', min: -3, max: 3, step: 0.01, value: det,
      format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} Hz`,
      onInput: (v) => { det = v; onFreqsChanged(); },
    });
    const phSlider = ui.slider(row1, {
      label: 'phase of x, φ', min: 0, max: 360, step: 1, value: 90,
      format: (v) => `${v.toFixed(0)}°`,
      onInput: (v) => { phaseTarget = (v * Math.PI) / 180; if (mode === 'ink') resetPen(); dirty = true; },
    });
    const chordSel = ui.select(row1, {
      label: 'voicing', value: String(chordIdx),
      options: CHORDS.map((c, i) => ({ value: String(i), label: c.label })),
      onChange: (v) => {
        chordIdx = +v; phZ = chord().ph[2];
        phzSlider.set(Math.round((phZ * 180) / Math.PI));
        analyseKnot(true); setFreqsNow(); refreshReadout(); dirty = true;
      },
    });
    const phzSlider = ui.slider(row1, {
      label: 'phase of z', min: 0, max: 360, step: 1, value: Math.round((phZ * 180) / Math.PI),
      format: (v) => `${v.toFixed(0)}°`,
      onInput: (v) => { phZ = (v * Math.PI) / 180; analyseKnot(false); dirty = true; },
    });

    const row2 = ui.controlRow(stage);
    row2.classList.add('hg-snaps');
    const snapBtns = SNAPS.map(([p, q]) => {
      const key = `${p}:${q}`;
      const b = ui.button(row2, key, () => applySnap(p, q), { small: true });
      b.innerHTML = `<span class="hg-r">${key}</span>${SNAP_LABEL[key]}`;
      b.dataset.snap = key;
      return b;
    });

    const row3 = ui.controlRow(stage);
    const togetherToggle = ui.toggle(row3, {
      label: 'both tones in both ears', value: false,
      onChange: (v) => { together = v; if (soundOn) { ensureVoices(); setFreqsNow(); applyGains(0.04); } refreshReadout(); },
    });
    const tapBtn = ui.button(row3, 'tap each wah', tapBeat, { small: true });
    tapBtn.setAttribute('aria-label', 'tap once for each beat you hear; the readout compares your rate with the arithmetic');
    const penBtn = ui.button(row3, '⟳ drop the pen again', () => { resetPen(); if (soundOn) applyGains(0.02); }, { small: true });
    const saveBtn = ui.button(row3, 'keep the drawing', saveDrawing, { small: true });

    const quest = ui.questBanner(stage, '');
    const info = ui.readout(stage, '');
    info.el.setAttribute('aria-live', 'polite');
    const capEl = ui.caption(stage, '');
    ui.speculationPanel(stage,
      'The screen shows that small fractions close. Whether we <em>like</em> them is a separate ' +
      'question. In 2016 Josh McDermott and colleagues played chords to the Tsimane’, a people of the ' +
      'Bolivian Amazon with little exposure to Western music. They reacted to acoustic roughness much ' +
      'as Westerners do, yet rated consonant and dissonant chords as equally pleasant. In 2020 the same ' +
      'group found that Tsimane’ listeners, like Westerners, more often mistook notes in simple ratios ' +
      'for a single sound. The fraction may be heard everywhere; the pleasure in it may be learned.',
      'is consonance the fraction?');

    /* ---------- quests ---------- */
    // Each quest belongs to one panel; the banner shows the first unfinished
    // quest of the panel in view, and hides itself where none remains.
    const QUESTS = [
      {
        panel: 'scope',
        text: 'Snap to <em>1:1 unison</em>, set the detune to <em>+0.30 Hz</em> and press ♪. Count: the ellipse ' +
          'tumbles once every 3.33 s, at exactly the rate of the wah in your ears.',
        ok: () => soundOn && nr[0] === 1 && nr[1] === 1 && det >= 0.2 && det <= 0.4,
        done: () => 'You have seen a beat. The wah and the tumble are one number, |f₁ − f₂|, and near any ratio ' +
          '<em>p</em>:<em>q</em> the same law reads |q·f₁ − p·f₂|.',
      },
      {
        panel: 'scope',
        text: 'Bowditch’s octave: snap to <em>2:1</em> and detune by <em>−0.50 Hz</em>. The parabola rolls over ' +
          'into its mirror image and back every 2 s, as his lead ball did in 67 swings.',
        ok: () => nr[0] === 2 && nr[1] === 1 && Math.abs(det) >= 0.3 && Math.abs(det) <= 0.7,
        done: () => {
          const b = precessionHz(f1(), f2, 2, 1);
          return `The same law with <em>p</em> = 2, <em>q</em> = 1: |1·f₁ − 2·f₂| = ${b.toFixed(2)} Hz, one roll ` +
            `every ${(1 / b).toFixed(2)} s. Bowditch counted his in swings of the pendulum, not seconds.`;
        },
      },
      {
        panel: 'scope',
        text: 'Plomp’s fifth: snap to <em>3:2</em>, detune by <em>+1.00 Hz</em>, press ♪ and switch on ' +
          '<em>both tones in both ears</em>. The figure tumbles twice a second; listen for the faint flutter.',
        ok: () => soundOn && together && nr[0] === 3 && nr[1] === 2 && det >= 0.9 && det <= 1.1,
        done: () => `Twice a second: |2·${f1().toFixed(2)} − 3·${f2.toFixed(0)}| = ${precessionHz(f1(), f2, 3, 2).toFixed(2)}. ` +
          'Plomp wrote the law as <em>mN − nM</em> beats per second in 1967; it is the same fraction, drawn and heard.',
      },
      {
        panel: 'ink',
        text: 'Press ♪ while the pens are drawing and keep listening: the tones fade exactly as the swing does, ' +
          'and when the lace is finished the sound is gone.',
        ok: () => soundOn && pen && !pen.done && pen.t >= 10,
        done: () => 'Ten seconds in, the x pen swings at a fifth of its first width, e<sup>−0.16·10</sup> ≈ 0.20, ' +
          'and the x tone has faded by the same factor: one decay, drawn and heard.',
      },
      {
        panel: 'knot',
        text: 'Give the chord a third voice: choose <em>2:3:5</em> and turn the phase of <em>z</em> until the ' +
          'stevedore knot comes untied.',
        ok: () => chordIdx === 2 && knotInfo && knotInfo.name === 'the unknot',
        done: () => 'Untied, and the three frequencies never changed. A knot can change only where the curve ' +
          'passes through itself: same chord, different knot.',
      },
    ];
    const questDone = QUESTS.map(() => false);
    let questShown = -1;           // index on show, −1 none, −2 a finished quest's message
    function updateQuest() {
      if (questNextAt) {
        if (clockNow < questNextAt) return;
        questNextAt = 0; questShown = -1;
      }
      const i = QUESTS.findIndex((Q, k) => !questDone[k] && Q.panel === mode);
      if (i < 0) {
        if (questShown !== -1 || quest.el.style.display !== 'none') { quest.el.style.display = 'none'; questShown = -1; }
        return;
      }
      if (i !== questShown) { quest.set(QUESTS[i].text); quest.el.style.display = ''; questShown = i; }
      if (QUESTS[i].ok()) {
        questDone[i] = true;
        quest.done(QUESTS[i].done());
        questShown = -2;
        questNextAt = clockNow + 7;
      }
    }

    /* ---------- control refresh ---------- */
    function refreshControls() {
      const tone = mode !== 'knot';
      for (const [key] of TABS) {
        const on = key === mode;
        tabBtns[key].classList.toggle('active', on);
        tabBtns[key].setAttribute('aria-pressed', String(on));
      }
      f1Slider.el.style.display = tone ? '' : 'none';
      f2Slider.el.style.display = tone ? '' : 'none';
      detSlider.el.style.display = tone ? '' : 'none';
      phSlider.el.style.display = tone ? '' : 'none';
      chordSel.el.style.display = tone ? 'none' : '';
      phzSlider.el.style.display = tone ? 'none' : '';
      row2.style.display = tone ? '' : 'none';
      row3.style.display = tone ? '' : 'none';
      for (const b of snapBtns) b.classList.toggle('active', b.dataset.snap === snap);
      tapBtn.style.display = mode === 'scope' ? '' : 'none';
      penBtn.style.display = mode === 'ink' ? '' : 'none';
      saveBtn.style.display = mode === 'ink' ? '' : 'none';
      soundBtn.textContent = soundOn ? '■ silence' : mode === 'knot' ? '♪ sound the chord' : '♪ sound the dyad';
      soundBtn.classList.toggle('active', soundOn);
      soundBtn.setAttribute('aria-pressed', String(soundOn));
      handle.canvas.style.touchAction = mode === 'knot' ? 'none' : 'pan-y';
      handle.canvas.tabIndex = mode === 'knot' ? 0 : -1;
      handle.canvas.style.cursor = mode === 'knot' ? (dragging ? 'grabbing' : 'grab') : '';
      handle.canvas.setAttribute('aria-label', mode === 'knot'
        ? 'A three-tone chord drawn as a closed curve in space; drag or use the arrow keys to turn it. The readout below names its knot.'
        : mode === 'ink' ? 'Two damped pendulums drawing lace on smoked paper. The readout below gives the pens’ frequencies.'
          : 'A Lissajous figure drawn by the two tones, with each tone’s wave beside it. The readout below gives the ratio and the beat.');
    }

    function setCaption() {
      if (mode === 'scope') capEl.innerHTML =
        'The stereo field is the coordinate system: left channel to <em>x</em>, right channel to <em>y</em>. ' +
        'Below and beside the frame hang the two tones themselves, time running down and across, triggered ' +
        'like a laboratory scope so that an exact ratio stands still; the spot and its dotted lines show one ' +
        'instant being built from both. The notches count the ratio (sides : top), and the bead in the corner ' +
        'dial turns once per beat. On a wide screen the beat track plots that turning against time, one drop ' +
        'per tumble, and lays your taps beside it so the two rates can be compared. φ turns the picture only.';
      else if (mode === 'ink') capEl.innerHTML =
        'Ink on smoked paper: <code>x = e<sup>−0.16t</sup>·sin(2πf₁′t + φ)</code>, ' +
        '<code>y = e<sup>−0.19t</sup>·sin(2πf₂′t)</code>. The pens swing octaves below the tones but keep ' +
        'their beat, <code>q·f₁′ − p·f₂′ = q·f₁ − p·f₂</code>, and their decay, so every twist in the lace is ' +
        'a beat you can hear, and the tone fades as the swing does. Any change of tuning drops the pen again.';
      else capEl.innerHTML =
        'A triad as a curve in space: drag to turn it. Depth runs from azure (far) to gold (near), and the near ' +
        'strand always breaks the far one, as in a knot diagram. The faint shadows on the walls are the chord’s ' +
        'three intervals. The readout counts the crossings of one shadow and computes the Alexander polynomial ' +
        'from them; the phase of <em>z</em> can change the knot, never the chord.';
    }

    /* ---------- audio ---------- */
    function ensureVoices() {
      if (!sx) {
        sx = audio.voice(bus, { freq: f1(), level: LVL, pan: -1 });
        sy = audio.voice(bus, { freq: f2, level: LVL, pan: 1 });
      }
      if (together && !mx) {
        mx = audio.voice(bus, { freq: f1(), level: LVLM, pan: 0 });
        my = audio.voice(bus, { freq: f2, level: LVLM, pan: 0 });
      }
      if (mode === 'knot' && !vz) vz = audio.voice(bus, { freq: chord().n[2] * KNOT_BASE, level: LVL3, pan: 0 });
    }

    function setFreqsNow() {
      let fx = f1(), fy = f2;
      if (mode === 'knot') { const n = chord().n; fx = n[0] * KNOT_BASE; fy = n[1] * KNOT_BASE; if (vz) vz.setFreq(n[2] * KNOT_BASE); }
      if (sx) { sx.setFreq(fx); sy.setFreq(fy); }
      if (mx) { mx.setFreq(fx); my.setFreq(fy); }
    }

    // Every gain in one place: sound on/off, split or together, the ink
    // envelope (the tone dies exactly as the swing does), the third voice.
    function applyGains(tau = 0.03) {
      if (!bus.context) return;
      const on = soundOn ? 1 : 0;
      let ex = 1, ey = 1;
      if (mode === 'ink' && pen) {
        if (pen.done) { ex = 0; ey = 0; } else { ex = Math.exp(-DX * pen.t); ey = Math.exp(-DY * pen.t); }
      }
      const a = on * (together ? 0 : 1), b = on * (together ? 1 : 0);
      if (sx) { audio.rampTo(sx.gain.gain, LVL * ex * a, tau); audio.rampTo(sy.gain.gain, LVL * ey * a, tau); }
      if (mx) { audio.rampTo(mx.gain.gain, LVLM * ex * b, tau); audio.rampTo(my.gain.gain, LVLM * ey * b, tau); }
      if (vz) audio.rampTo(vz.gain.gain, on * (mode === 'knot' ? LVL3 : 0), tau);
    }

    function toggleSound() {
      audio.ensureAudio();
      soundOn = !soundOn;
      lastAT = -1;
      if (soundOn) {
        if (mode === 'ink' && pen && pen.done) resetPen();
        ensureVoices();
        setFreqsNow();
      }
      applyGains(soundOn ? 0.02 : 0.03);
      refreshControls();
      refreshReadout();
    }

    function onFreqsChanged() {
      nr = nearestRatio(f1() / f2);
      setFreqsNow();               // glides — no clicks on slider drags
      if (mode === 'ink') resetPen();
      refreshControls();
      refreshReadout();
      dirty = true;
    }

    function applySnap(p, q) {
      snap = `${p}:${q}`;
      f1base = (f2 * p) / q;
      f1Slider.set(f1base);
      onFreqsChanged();
      // retune and resync: the picture starts from the canonical figure
      c1 = (p / q) * c2; c1 -= Math.floor(c1);
    }

    /* ---------- the beat, tapped ---------- */
    function tapBeat() {
      const t = performance.now() / 1000;
      if (taps.length && t - taps[taps.length - 1] > 8) taps = [];
      taps.push(t);
      if (taps.length > 9) taps.shift();
      tapMarks.push(clockNow);
      if (tapMarks.length > 16) tapMarks.shift();
      refreshReadout();
      dirty = true;
    }
    function tapRate() {
      if (taps.length < 3) return null;
      if (performance.now() / 1000 - taps[taps.length - 1] > 12) return null;
      const span = taps[taps.length - 1] - taps[0];
      return span > 0 ? (taps.length - 1) / span : null;
    }

    /* ---------- modes ---------- */
    function setMode(m) {
      if (mode === m) return;
      mode = m;
      if (m === 'ink') resetPen(); else pen = null;
      if (m === 'knot') analyseKnot(true);
      if (soundOn) { ensureVoices(); setFreqsNow(); applyGains(0.03); }
      refreshControls();
      refreshReadout();
      setCaption();
      dirty = true;
    }

    /* ---------- the pendulums ---------- */
    let inkCv = null, inkCtx = null;
    function makeInkLayer() {
      const s = L.ink.s, dpr = handle.dpr || 1;
      inkCv = document.createElement('canvas');
      inkCv.width = Math.max(1, Math.round(s * dpr));
      inkCv.height = Math.max(1, Math.round(s * dpr));
      inkCtx = inkCv.getContext('2d');
      inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function paintGround() {
      const s = L.ink.s, g = inkCtx;
      g.globalAlpha = 1;
      g.fillStyle = P.bg;
      g.fillRect(0, 0, s, s);
      const rg = g.createRadialGradient(s * 0.5, s * 0.46, 0, s * 0.5, s * 0.5, s * 0.72);
      rg.addColorStop(0, '#191c26');
      rg.addColorStop(0.62, '#11131b');
      rg.addColorStop(1, '#08090d');
      g.fillStyle = rg;
      g.fillRect(0, 0, s, s);
      // soot grain: a fixed, seeded scatter (the same card every time)
      let seed = 0x2545f491;
      const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
      g.fillStyle = '#e8e2d0';
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = 0.012 + rnd() * 0.03;
        g.fillRect(rnd() * s, rnd() * s, 0.8, 0.8);
      }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(201,169,89,0.22)';
      g.lineWidth = 1;
      g.strokeRect(6.5, 6.5, s - 13, s - 13);
    }
    function penAmp() { return Math.max(40, L.ink.s / 2 - 22); }
    function resetPen() {
      if (!L.ink) return;
      if (!inkCv) makeInkLayer();
      paintGround();
      const [p, q] = nr;
      const K = penDivisor(f2, penAmp(), DY);
      const [pf1, pf2] = penFrequencies(f1(), f2, p, q, K);
      pen = { t: 0, a: 0, b: 0, px: null, py: null, done: false, K, pf1, pf2, p, q };
      if (RM) advancePen(60);      // reduced motion: the finished card at once
      dirty = true;
      refreshReadout();
    }
    // Integrate the pens for d seconds, inking the layer.
    function advancePen(d) {
      if (!pen || pen.done) return;
      const s = L.ink.s, A = penAmp(), cx = s / 2, cy = s / 2;
      const perSec = Math.max(pen.pf1, pen.pf2) * 56;
      const steps = Math.min(RM ? 400000 : 5000, Math.max(2, Math.ceil(d * perSec)));
      const h = d / steps;
      const phi = phaseTarget;
      const g = inkCtx;
      g.strokeStyle = '#efe7d2';
      g.lineWidth = 0.7;
      g.lineJoin = 'round';
      let amp = Math.max(Math.exp(-DX * pen.t), Math.exp(-DY * pen.t));
      const chunk = 600;
      for (let i0 = 0; i0 < steps && !pen.done; i0 += chunk) {
        g.globalAlpha = 0.14 + 0.5 * amp;
        g.beginPath();
        if (pen.px == null) {
          pen.px = cx + A * Math.sin(TAU * pen.a + phi);
          pen.py = cy - A * Math.sin(TAU * pen.b);
        }
        g.moveTo(pen.px, pen.py);
        const i1 = Math.min(steps, i0 + chunk);
        for (let i = i0; i < i1; i++) {
          pen.t += h; pen.a += pen.pf1 * h; pen.b += pen.pf2 * h;
          const x = cx + A * Math.exp(-DX * pen.t) * Math.sin(TAU * pen.a + phi);
          const y = cy - A * Math.exp(-DY * pen.t) * Math.sin(TAU * pen.b);
          g.lineTo(x, y);
          pen.px = x; pen.py = y;
        }
        g.stroke();
        pen.a -= Math.floor(pen.a); pen.b -= Math.floor(pen.b);
        amp = Math.max(Math.exp(-DX * pen.t), Math.exp(-DY * pen.t));
        if (amp < 0.045) pen.done = true;
      }
      g.globalAlpha = 1;
      if (pen.done) {
        if (soundOn) { soundOn = false; applyGains(0.2); refreshControls(); }
        refreshReadout();
      }
    }

    function saveDrawing() {
      if (!inkCv || !inkCv.toBlob) return;
      inkCv.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `harmonograph-${nr[0]}-${nr[1]}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    }

    /* ---------- the third voice ---------- */
    let knotTimer = 0, knotLast = 0;
    function analyseKnot(now) {
      const run = () => {
        knotLast = performance.now();
        const c = chord();
        const n = c.n, ph = [c.ph[0], c.ph[1], phZ];
        const coprime = gcdInt(n[0], n[1]) === 1 && gcdInt(n[1], n[2]) === 1 && gcdInt(n[0], n[2]) === 1;
        if (!coprime) {
          knotInfo = { singular: true, points: doublePoints(n, ph).length };
        } else {
          const k = knotInvariant(n, ph, 1600);
          knotInfo = { ...k, name: k.minGap < 0.02 ? null : knotName(k.poly, k.crossings), near: k.minGap < 0.02 };
        }
        refreshReadout();
        dirty = true;
      };
      clearTimeout(knotTimer);
      const since = performance.now() - knotLast;
      if (now || since > 60) run();
      else knotTimer = setTimeout(run, 60 - since);
    }

    /* ---------- readout ---------- */
    // The readout is an aria-live region (and, on narrow screens, the visible
    // summary), so it changes only when the state it describes changes: no
    // ticking clocks here. Numbers stay on the line with their units, and a
    // separator stays with the item before it when the line wraps.
    const NB = '\u00a0', SEP = '\u00a0\u00a0·\u00a0 ';
    const fmtHz = (v, d = 2) => `${v.toFixed(d)}${NB}Hz`;
    const signed = (v, d = 2) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(d)}`;
    const OCT = ['no octaves', 'one octave', 'two octaves', 'three octaves', 'four octaves', 'five octaves', 'six octaves', 'seven octaves', 'eight octaves'];
    function verdict(prec) {
      if (prec < 0.005) return 'closed: the figure stands still';
      if (prec > 10) return 'too fast to follow: a shimmer to the eye, roughness to the ear';
      return `one tumble every ${(1 / prec).toFixed(2)}${NB}s`;
    }
    function knotLine() {
      const k = knotInfo;
      if (!k) return '';
      if (k.singular) return `passes through itself at ${k.points} points, for every choice of phase`;
      const poly = `Δ(t) = ${formatPoly(k.poly)}`;
      const who = k.near ? 'the curve almost touches itself here'
        : k.name ? k.name
          : k.poly.length > 1 ? `knotted (Δ ≠ 1 proves it); ${k.crossings} crossings are too many to name it here`
            : 'no knot this polynomial can see';
      return `${poly}${SEP}${who}`;
    }
    let lastReadout = null;
    function setReadout(s) { if (s !== lastReadout) { lastReadout = s; info.set(s); } }
    function refreshReadout() {
      if (mode === 'knot') {
        const c = chord();
        const fr = c.n.map((k) => k * KNOT_BASE);
        let s = `x:y:z = ${c.n.join(':')}${SEP}${fr.join(', ')}${NB}Hz${SEP}phase of z ${Math.round((phZ * 180) / Math.PI)}°`;
        if (knotInfo && !knotInfo.singular) s += `${SEP}${knotInfo.crossings} crossings in the x–y shadow`;
        s += `\n${knotLine()}`;
        setReadout(s);
        return;
      }
      const [p, q] = nr;
      const prec = precessionHz(f1(), f2, p, q);
      const name = dyadName(p, q);
      let s = `${p}:${q}${name ? ` ${name}` : ''}${SEP}|${q}·f₁ − ${p}·f₂| = ${fmtHz(prec)}${SEP}${verdict(prec)}`;
      s += `\nx ${fmtHz(f1())} (left)${SEP}y ${fmtHz(f2)} (right)${together ? `${SEP}both tones in both ears` : ''}`;
      if (mode === 'ink' && pen) {
        s += `\npens ${pen.pf1.toFixed(2)} and ${fmtHz(pen.pf2)}, the tones lowered ${OCT[Math.round(Math.log2(pen.K))] || ''}`;
        s += pen.done ? `${SEP}the pen has come to rest` : `${SEP}the pen is drawing`;
      }
      const tr = mode === 'scope' ? tapRate() : null;
      if (tr) s += `\nyour taps: ${fmtHz(tr)}, one every ${(1 / tr).toFixed(2)}${NB}s`;
      setReadout(s);
    }

    /* ---------- drawing helpers ---------- */
    const hasLS = 'letterSpacing' in handle.ctx;
    function setSpacing(ctx, px) { if (hasLS) ctx.letterSpacing = `${px}px`; }
    function rubric(ctx, text, x, y, color = LABEL, size = 9.5, align = 'left') {
      ctx.font = `${size}px ${SERIF}`;
      setSpacing(ctx, size * 0.16);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text.toUpperCase(), x, y);
      setSpacing(ctx, 0);
    }
    function fitSize(ctx, text, family, size, maxW, style = '') {
      let s = size;
      ctx.font = `${style}${s}px ${family}`;
      while (s > 8 && ctx.measureText(text).width > maxW) { s -= 0.5; ctx.font = `${style}${s}px ${family}`; }
      return s;
    }
    function hairline(ctx, x, y, w) {
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x), Math.round(y) + 0.5);
      ctx.lineTo(Math.round(x + w), Math.round(y) + 0.5);
      ctx.stroke();
    }
    // Numerals of a ratio in their tones' colours: x gold, y azure, z ink.
    function ratioText(ctx, parts, x, y, size, align = 'left') {
      const cols = [P.gold, P.azure, P.ink];
      ctx.font = `${size}px ${SERIF}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const sep = ' : ';
      let total = 0;
      parts.forEach((v, i) => { total += ctx.measureText(String(v)).width + (i ? ctx.measureText(sep).width : 0); });
      let cx = align === 'center' ? x - total / 2 : x;
      parts.forEach((v, i) => {
        if (i) { ctx.fillStyle = GHOST; ctx.fillText(sep, cx, y); cx += ctx.measureText(sep).width; }
        ctx.fillStyle = cols[i]; ctx.fillText(String(v), cx, y); cx += ctx.measureText(String(v)).width;
      });
    }
    // A run of text segments on one baseline; a segment with `sup` is set
    // smaller and raised, so exponents read as mathematics, not as code.
    function mathRun(ctx, segs, x, y, size, family) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      let cx = x;
      for (const s of segs) {
        const sz = s.sup ? Math.round(size * 0.72 * 2) / 2 : size;
        ctx.font = `${sz}px ${family}`;
        ctx.fillStyle = s.color || P.ink;
        ctx.fillText(s.t, cx, s.sup ? y - size * 0.42 : y);
        cx += ctx.measureText(s.t).width;
      }
      return cx - x;
    }
    function panelBox(ctx, r) {
      ctx.fillStyle = '#0d0f16';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(42,46,63,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
    }
    function tag(ctx, text, x, y, color, size = 10.5) {
      ctx.font = `italic ${size}px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(13,15,22,0.86)';
      ctx.fillRect(x - 3, y - 2, w + 6, size + 5);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    /* ---------- layout ---------- */
    function computeLayout() {
      const W = handle.width, H = handle.height;
      const wide = W >= 560;
      const M = wide ? 22 : 12;
      const showCard = W >= 760;
      const cardW = showCard ? Math.round(clamp(W * 0.29, 230, 300)) : 0;
      const cardGap = showCard ? 44 : 0;
      const availW = W - 2 * M - (showCard ? cardW + cardGap : 0);
      // scope: figure, waves below and beside, dial in the corner
      const Pn = wide ? 92 : Math.round(clamp(W * 0.19, 54, 72));
      const G = wide ? 14 : 9;
      const s = Math.max(60, Math.min(H - 2 * M - Pn - G, availW - Pn - G));
      const groupW = s + G + Pn;
      const totalS = groupW + (showCard ? cardGap + cardW : 0);
      const x0 = M + Math.max(0, (W - 2 * M - totalS) / 2);
      const y0 = M + Math.max(0, (H - 2 * M - groupW) / 2);
      L.wide = wide; L.card = showCard; L.M = M;
      L.scope = {
        x0, y0, s, A: s / 2 - 7, cx: x0 + s / 2, cy: y0 + s / 2, Pn, G,
        bottom: { x: x0, y: y0 + s + G, w: s, h: Pn },
        right: { x: x0 + s + G, y: y0, w: Pn, h: s },
        corner: { x: x0 + s + G, y: y0 + s + G, w: Pn, h: Pn },
        card: showCard ? { x: x0 + groupW + cardGap, y: y0, w: cardW, h: groupW } : null,
      };
      // ink: the card of smoked paper
      const si = Math.max(60, Math.min(H - 2 * M, availW));
      const totalI = si + (showCard ? cardGap + cardW : 0);
      const xi = M + Math.max(0, (W - 2 * M - totalI) / 2), yi = M + Math.max(0, (H - 2 * M - si) / 2);
      const prevS = L.ink ? L.ink.s : 0;
      L.ink = { x0: xi, y0: yi, s: si, card: showCard ? { x: xi + si + cardGap, y: yi, w: cardW, h: si } : null };
      // knot: a view, and the card beside it. With a card the view is square,
      // like the scope and the paper: the height limits the fit at every yaw
      // and pitch, so a wider view would only add dead space, and the square
      // keeps the card in the same place in all three panels.
      const vwAvail = Math.max(60, W - 2 * M - (showCard ? cardW + cardGap : 0));
      const vw = showCard ? Math.min(vwAvail, Math.max(60, H - 2 * M)) : vwAvail;
      const totalK = vw + (showCard ? cardGap + cardW : 0);
      const xk = M + Math.max(0, (W - 2 * M - totalK) / 2);
      L.knot = { x0: xk, y0: M, w: vw, h: H - 2 * M, card: showCard ? { x: xk + vw + cardGap, y: M, w: cardW, h: H - 2 * M } : null };
      if (Math.round(prevS) !== Math.round(si) || !inkCv) { makeInkLayer(); if (mode === 'ink') resetPen(); }
      fitKnot();
      info.el.classList.toggle('hg-sr', showCard);
    }

    /* ---------- the scope ---------- */
    function drawScope() {
      const { ctx, width: W, height: H } = handle;
      const S = L.scope;
      const [p, q] = nr;
      const F1 = f1(), F2 = f2;
      const T = q / F2;
      const A = Math.max(0, S.A);
      const phi = phaseDisp;
      // trigger on the most recent start of a q-cycle block of y
      const k = Math.floor(c2 / q) * q;
      const delta = (c2 - k) / F2;
      const c1t = c1 - F1 * delta;
      const X = (tau) => Math.sin(TAU * (c1t + F1 * tau) + phi);
      const Y = (tau) => Math.sin(TAU * F2 * tau);

      ctx.fillStyle = P.bg;
      ctx.fillRect(0, 0, W, H);

      // graticule and frame. The frame is the figure's whole box, so its edges
      // line up with the two wave panels; the curve sits `gap` px inside it.
      const gap = Math.max(0, S.s / 2 - A);
      const fx = Math.round(S.x0) + 0.5, fy = Math.round(S.y0) + 0.5, fw = Math.max(0, Math.round(S.s) - 1);
      ctx.strokeStyle = 'rgba(74,72,64,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, Math.round(S.cy) + 0.5); ctx.lineTo(fx + fw, Math.round(S.cy) + 0.5);
      ctx.moveTo(Math.round(S.cx) + 0.5, fy); ctx.lineTo(Math.round(S.cx) + 0.5, fy + fw);
      for (let i = -4; i <= 4; i++) {
        if (!i) continue;
        const o = (i / 5) * A;
        ctx.moveTo(Math.round(S.cx + o) + 0.5, Math.round(S.cy) - 2.5); ctx.lineTo(Math.round(S.cx + o) + 0.5, Math.round(S.cy) + 3.5);
        ctx.moveTo(Math.round(S.cx) - 2.5, Math.round(S.cy + o) + 0.5); ctx.lineTo(Math.round(S.cx) + 3.5, Math.round(S.cy + o) + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = P.line;
      ctx.strokeRect(fx, fy, fw, fw);

      // the figure: one window of the triggered signal, phosphor-style
      const N = Math.round(clamp(150 * Math.max(p, q), 480, 3200));
      const band = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const all = new Path2D();
      const vnorm = Math.sqrt(F1 * F1 + F2 * F2);
      let px = 0, py = 0, pb = -1;
      for (let i = 0; i <= N; i++) {
        const tau = -T + (T * i) / N;
        const ax = TAU * (c1t + F1 * tau) + phi, ay = TAU * F2 * tau;
        const x = S.cx + A * Math.sin(ax), y = S.cy - A * Math.sin(ay);
        if (i === 0) { all.moveTo(x, y); px = x; py = y; continue; }
        all.lineTo(x, y);
        const vx = F1 * Math.cos(ax), vy = F2 * Math.cos(ay);
        const sp = Math.sqrt(vx * vx + vy * vy) / vnorm;
        const b = sp < 0.3 ? 0 : sp < 0.55 ? 1 : sp < 0.8 ? 2 : 3;
        if (b !== pb) band[b].moveTo(px, py);
        band[b].lineTo(x, y);
        pb = b; px = x; py = y;
      }
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.16; ctx.strokeStyle = P.goldDim; ctx.lineWidth = 5; ctx.stroke(all);
      ctx.globalAlpha = 0.34; ctx.strokeStyle = P.gold; ctx.lineWidth = 2.2; ctx.stroke(all);
      const BA = [1, 0.8, 0.58, 0.4];
      ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.15;
      for (let b = 3; b >= 0; b--) { ctx.globalAlpha = BA[b]; ctx.stroke(band[b]); }
      ctx.globalAlpha = 1;

      // tangency notches: x touches the sides p times, y the top and bottom q
      // times; each notch bridges the gap from the point of contact to the frame
      if (p <= 9 && q <= 9) {
        const nl = Math.max(4, gap);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = P.gold;
        ctx.beginPath();
        const m0 = Math.ceil(2 * ((c1t - F1 * T) * TAU - TAU / 4 + phi) / TAU) - 2;
        for (let m = m0; m < m0 + 4 * p + 6; m++) {
          const tau = ((0.25 + m / 2 - phi / TAU) - c1t) / F1;
          if (tau < -T - 1e-9 || tau >= 0) continue;
          const side = (((m % 2) + 2) % 2) === 0 ? 1 : -1;
          const y = S.cy - A * Y(tau), x = S.cx + side * A;
          ctx.moveTo(x, y); ctx.lineTo(x + side * nl, y);
        }
        ctx.stroke();
        ctx.strokeStyle = P.azure;
        ctx.beginPath();
        for (let m = 0; m < 2 * q + 2; m++) {
          const tau = -T + (0.25 + m / 2) / F2;
          if (tau >= 0) continue;
          const up = m % 2 === 0 ? 1 : -1;
          const x = S.cx + A * X(tau), y = S.cy - up * A;
          ctx.moveTo(x, y); ctx.lineTo(x, y - up * nl);
        }
        ctx.stroke();
      }

      // the two tones: x hangs below (time running down), y beside (time running right)
      const Bp = S.bottom, Rp = S.right;
      panelBox(ctx, Bp); panelBox(ctx, Rp);
      const padB = 7;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = P.gold; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const nb = Math.round(clamp(p * 44, 90, 1400));
      for (let i = 0; i <= nb; i++) {
        const tau = -T + (T * i) / nb;
        const x = S.cx + A * X(tau), y = Bp.y + padB + ((Bp.h - 2 * padB) * i) / nb;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = P.azure;
      ctx.beginPath();
      const nr2 = Math.round(clamp(q * 44, 90, 1400));
      for (let i = 0; i <= nr2; i++) {
        const tau = -T + (T * i) / nr2;
        const x = Rp.x + padB + ((Rp.w - 2 * padB) * i) / nr2, y = S.cy - A * Y(tau);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // the reading guide: one instant, built from both tones
      const period = 2.4 * Math.max(p, q);
      const fr = RM ? 0.62 : (spotClock / period) % 1;
      const ts = -T + fr * T;
      const hx = S.cx + A * X(ts), hy = S.cy - A * Y(ts);
      const by = Bp.y + padB + (Bp.h - 2 * padB) * fr;
      const rx = Rp.x + padB + (Rp.w - 2 * padB) * fr;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = P.gold;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, by); ctx.stroke();
      ctx.strokeStyle = P.azure;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(rx, hy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(hx, by, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = P.azure; ctx.beginPath(); ctx.arc(rx, hy, 2.6, 0, TAU); ctx.fill();
      goldGlow.draw(ctx, hx, hy, 0.62);
      ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(hx, hy, 1.6, 0, TAU); ctx.fill();

      // panel tags
      const shortTags = Bp.w < 260;
      tag(ctx, shortTags ? 'x · left' : 'x · left ear', Bp.x + 6, Bp.y + 5, P.gold);
      tag(ctx, shortTags ? 'y · right' : 'y · right ear', Rp.x + 6, Rp.y + 5, P.azure);
      ctx.font = `italic 10px ${SERIF}`;
      ctx.fillStyle = GHOST;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'right';
      ctx.fillText('t ↓', Bp.x + Bp.w - 6, Bp.y + Bp.h - 6);
      ctx.fillText('t →', Rp.x + Rp.w - 6, Rp.y + Rp.h - 6);

      // corner dial: the ratio, and a bead that turns once per beat
      const Cc = S.corner;
      const dcx = Cc.x + Cc.w / 2, dcy = Cc.y + Cc.h / 2, dr = Math.max(4, Cc.w / 2 - 9);
      const psi = relativePhase(c1 + phi / TAU, c2, p, q);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(dcx, dcy, dr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = GHOST;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.moveTo(dcx + Math.sin(a) * (dr - 3), dcy - Math.cos(a) * (dr - 3));
        ctx.lineTo(dcx + Math.sin(a) * dr, dcy - Math.cos(a) * dr);
      }
      ctx.stroke();
      const ang = psi * TAU;
      const bx = dcx + Math.sin(ang) * dr, byy = dcy - Math.cos(ang) * dr;
      goldGlow.draw(ctx, bx, byy, 0.5);
      ctx.fillStyle = P.goldBright; ctx.beginPath(); ctx.arc(bx, byy, 2.4, 0, TAU); ctx.fill();
      const rs = fitSize(ctx, `${p} : ${q}`, SERIF, Math.round(Cc.w * 0.25), dr * 1.55);
      ratioText(ctx, [p, q], dcx, dcy + rs * 0.34, rs, 'center');

      if (S.card) drawScopeCard(S.card);
    }

    function drawScopeCard(C) {
      const { ctx } = handle;
      const [p, q] = nr;
      const prec = precessionHz(f1(), f2, p, q);
      const name = dyadName(p, q);
      let y = C.y + 12;
      rubric(ctx, 'nearest simple ratio', C.x, y);
      y += 46;
      ratioText(ctx, [p, q], C.x - 2, y, 44);
      y += 26;
      ctx.font = `italic 17px ${SERIF}`; ctx.fillStyle = P.inkDim; ctx.textAlign = 'left';
      ctx.fillText(withArticle(name), C.x, y);
      y += 22; hairline(ctx, C.x, y, C.w); y += 24;
      rubric(ctx, 'the generalized beat', C.x, y);
      y += 22;
      const formula = `|${q} × ${f1().toFixed(2)} − ${p} × ${f2.toFixed(2)}|`;
      const ms = fitSize(ctx, formula, MONO, 13, C.w);
      ctx.fillStyle = P.ink; ctx.fillText(formula, C.x, y);
      y += 20;
      ctx.font = `${ms}px ${MONO}`; ctx.fillStyle = P.goldBright;
      ctx.fillText(`= ${prec.toFixed(2)} Hz`, C.x, y);
      y += 24;
      const v = verdict(prec);
      const vs = fitSize(ctx, v, SERIF, 15.5, C.w, 'italic ');
      ctx.font = `italic ${vs}px ${SERIF}`; ctx.fillStyle = P.ink;
      ctx.fillText(v, C.x, y);
      y += 20; hairline(ctx, C.x, y, C.w); y += 24;
      rubric(ctx, 'the two tones', C.x, y);
      y += 22;
      const tone = (label, hz, side, col) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(C.x + 4, y - 4, 3, 0, TAU); ctx.fill();
        ctx.font = `13px ${MONO}`; ctx.fillStyle = P.ink; ctx.textAlign = 'left';
        ctx.fillText(`${label}  ${hz.toFixed(2).padStart(7, ' ')} Hz`, C.x + 14, y);
        ctx.font = `italic 13px ${SERIF}`; ctx.fillStyle = LABEL; ctx.textAlign = 'right';
        ctx.fillText(side, C.x + C.w, y);
        ctx.textAlign = 'left';
        y += 21;
      };
      tone('x', f1(), 'left ear', P.gold);
      tone('y', f2, 'right ear', P.azure);
      ctx.font = `italic 12.5px ${SERIF}`; ctx.fillStyle = LABEL;
      ctx.fillText(together ? 'both tones now reach both ears' : `detune ${signed(det)} Hz`, C.x, y);
      y += 16; hairline(ctx, C.x, y, C.w); y += 22;
      const span = trackSpan(prec);
      const spanTxt = `last ${Number.isInteger(span) ? span : span.toFixed(1)} s`;
      ctx.font = `9.5px ${SERIF}`; setSpacing(ctx, 9.5 * 0.16);
      const rubW = ctx.measureText('THE BEAT, SEEN AND TAPPED').width;
      setSpacing(ctx, 0);
      ctx.font = `9.5px ${MONO}`;
      const spanFits = rubW + ctx.measureText(spanTxt).width + 12 <= C.w;
      rubric(ctx, spanFits ? 'the beat, seen and tapped' : 'the beat, tapped', C.x, y);
      ctx.font = `9.5px ${MONO}`; ctx.fillStyle = GHOST; ctx.textAlign = 'right';
      ctx.fillText(spanTxt, C.x + C.w, y);
      ctx.textAlign = 'left';
      y += 10;
      drawBeatTrack(ctx, C.x, y, C.w, 34, prec, span);
      y += 34 + 18;
      const tr = tapRate();
      ctx.font = `italic 13px ${SERIF}`; ctx.fillStyle = LABEL;
      const legend = tr ? `your taps ${tr.toFixed(2)} Hz · the figure ${prec.toFixed(2)} Hz`
        : prec < 0.005 ? 'closed: there is no beat to tap'
          : prec > 6 ? 'faster than a hand can tap'
            : 'tap each wah; your taps fall here';
      ctx.font = `italic ${fitSize(ctx, legend, SERIF, 13, C.w, 'italic ')}px ${SERIF}`;
      ctx.fillText(legend, C.x, y);
    }

    // ψ as a sawtooth against time (gold), one drop per tumble, and the
    // visitor's taps as azure ticks on the same clock.
    function drawBeatTrack(ctx, x, y, w, h, prec, span) {
      ctx.strokeStyle = 'rgba(42,46,63,0.95)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x), Math.round(y) + 0.5); ctx.lineTo(Math.round(x + w), Math.round(y) + 0.5);
      ctx.moveTo(Math.round(x), Math.round(y + h) + 0.5); ctx.lineTo(Math.round(x + w), Math.round(y + h) + 0.5);
      ctx.stroke();
      const X = (t) => x + w * (1 - (clockNow - t) / span);
      const Yp = (v) => y + h - 3 - (h - 6) * v;
      if (prec <= 6) {
        ctx.strokeStyle = P.gold; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        let prev = -1;
        for (let k = histN - 1; k >= 0; k--) {
          const i = (histHead + HIST - 1 - k) % HIST;
          if (clockNow - histT[i] > span) continue;
          const v = histP[i], px = X(histT[i]), py = Yp(v);
          if (prev < 0 || Math.abs(v - prev) > 0.5) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          prev = v;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(201,169,89,0.10)';
        ctx.fillRect(x, y + 3, w, h - 6);
      }
      ctx.strokeStyle = P.azure; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const t of tapMarks) {
        if (clockNow - t > span || t > clockNow) continue;
        const px = Math.round(X(t)) + 0.5;
        ctx.moveTo(px, y + 2); ctx.lineTo(px, y + h - 2);
      }
      ctx.stroke();
    }

    /* ---------- the pendulums ---------- */
    function drawInk(d) {
      const { ctx, width: W, height: H } = handle;
      if (!pen) resetPen();
      if (!pen) return;
      if (!pen.done && d > 0) advancePen(d);
      const I = L.ink;
      ctx.fillStyle = P.bg;
      ctx.fillRect(0, 0, W, H);
      if (inkCv) ctx.drawImage(inkCv, I.x0, I.y0, I.s, I.s);
      if (!pen.done && pen.px != null) {
        goldGlow.draw(ctx, I.x0 + pen.px, I.y0 + pen.py, 0.55);
        ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(I.x0 + pen.px, I.y0 + pen.py, 1.4, 0, TAU); ctx.fill();
      }
      if (!I.card) {
        ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = LABEL; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(pen.done ? 'the pen has come to rest' : `t = ${pen.t.toFixed(1)} s`, I.x0 + 14, I.y0 + I.s - 14);
        return;
      }
      const C = I.card;
      const [p, q] = [pen.p, pen.q];
      const name = dyadName(p, q);
      let y = C.y + 12;
      rubric(ctx, 'two damped pendulums', C.x, y);
      y += 46;
      ratioText(ctx, [p, q], C.x - 2, y, 44);
      y += 26;
      ctx.font = `italic 17px ${SERIF}`; ctx.fillStyle = P.inkDim; ctx.textAlign = 'left';
      ctx.fillText(withArticle(name), C.x, y);
      y += 22; hairline(ctx, C.x, y, C.w); y += 24;
      rubric(ctx, 'the pens', C.x, y);
      y += 22;
      ctx.font = `13px ${MONO}`; ctx.fillStyle = P.ink;
      ctx.fillText(`x ${pen.pf1.toFixed(2)} Hz   y ${pen.pf2.toFixed(2)} Hz`, C.x, y);
      y += 20;
      ctx.font = `italic 14px ${SERIF}`; ctx.fillStyle = P.inkDim;
      ctx.fillText(`the tones lowered ${OCT[Math.round(Math.log2(pen.K))] || ''}`, C.x, y);
      y += 20; hairline(ctx, C.x, y, C.w); y += 24;
      rubric(ctx, 'what the pens keep', C.x, y);
      y += 22;
      const prec = precessionHz(f1(), f2, p, q);
      const kept = `|q·f₁′ − p·f₂′| = ${prec.toFixed(2)} Hz`;
      fitSize(ctx, kept, MONO, 13, C.w);        // sets the font, shrunk to fit
      ctx.fillStyle = P.goldBright; ctx.fillText(kept, C.x, y);
      y += 23;
      // each pen's decay, set in the same columns as the pens' frequencies
      ctx.font = `13px ${MONO}`;
      const yCol = ctx.measureText(`x ${pen.pf1.toFixed(2)} Hz   `).width;
      mathRun(ctx, [{ t: 'x ' }, { t: 'e' }, { t: '−0.16t', sup: true }], C.x, y, 13, MONO);
      mathRun(ctx, [{ t: 'y ' }, { t: 'e' }, { t: '−0.19t', sup: true }], C.x + yCol, y, 13, MONO);
      y += 20; hairline(ctx, C.x, y, C.w); y += 24;
      rubric(ctx, 'the drawing', C.x, y);
      y += 22;
      const amp = Math.max(Math.exp(-DX * pen.t), Math.exp(-DY * pen.t));
      ctx.font = `italic 15px ${SERIF}`; ctx.fillStyle = P.ink;
      ctx.fillText(pen.done ? 'the pen has come to rest' : `t = ${pen.t.toFixed(1)} s, swing at ${Math.round(amp * 100)}%`, C.x, y);
      // a slim gauge of the swing
      y += 14;
      ctx.fillStyle = P.line; ctx.fillRect(C.x, y, C.w, 2);
      ctx.fillStyle = P.gold; ctx.fillRect(C.x, y, C.w * (pen.done ? 0 : amp), 2);
    }

    /* ---------- the third voice ---------- */
    const KB = 1.12;
    const NBAND = 14;
    const FAR = hexToRgb(P.azureDim), NEAR = hexToRgb(P.goldBright);
    function hexToRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
    const BAND_COL = [], BAND_W = [], BAND_A = [];
    for (let b = 0; b < NBAND; b++) {
      const t = (b + 0.5) / NBAND;
      BAND_COL.push(`rgb(${FAR.map((v, i) => Math.round(v + (NEAR[i] - v) * t)).join(',')})`);
      BAND_W.push(1 + 2.2 * t);
      BAND_A.push(0.38 + 0.62 * t);
    }
    const MK = 720;
    const PX = new Float64Array(MK + 1), PY = new Float64Array(MK + 1), PZ = new Float64Array(MK + 1);
    const CAM = 5;
    function rotator(yw, pt) {
      const cyw = Math.cos(yw), syw = Math.sin(yw), cp = Math.cos(pt), sp = Math.sin(pt);
      return (x, y, z) => {
        const X1 = x * cyw + z * syw;
        const Z1 = -x * syw + z * cyw;
        const Y1 = y * cp - Z1 * sp;
        const Z2 = y * sp + Z1 * cp;
        const k = CAM / (CAM - Z2);
        return [X1 * k, Y1 * k, Z2];
      };
    }
    const CORNERS = [];
    for (const a of [-KB, KB]) for (const b of [-KB, KB]) for (const c of [-KB, KB]) CORNERS.push([a, b, c]);
    function fitKnot() {
      if (!L.knot) return;
      const V = L.knot;
      const hw = Math.max(20, V.w / 2 - 6), hh = Math.max(20, V.h / 2 - 22);
      // Fit the three far walls (every corner but the nearest) at any yaw, so
      // the view never breathes as it turns.
      let mx = 1e-6, my = 1e-6;
      for (let k = 0; k < 24; k++) {
        const R = rotator((k / 24) * TAU, pitch);
        const pr = CORNERS.map((c) => R(c[0], c[1], c[2]));
        let near = 0;
        for (let i = 1; i < pr.length; i++) if (pr[i][2] > pr[near][2]) near = i;
        pr.forEach(([X, Y], i) => { if (i !== near) { mx = Math.max(mx, Math.abs(X)); my = Math.max(my, Math.abs(Y)); } });
      }
      knotFitS = Math.max(10, Math.min(hw / mx, hh / my));
    }

    function drawKnot(dtRaf) {
      const { ctx, width: W, height: H } = handle;
      if (!dragging && !RM) yaw += dtRaf * 0.2;
      ctx.fillStyle = P.bg;
      ctx.fillRect(0, 0, W, H);
      const V = L.knot;
      const cx = V.x0 + V.w / 2, cy = V.y0 + V.h / 2 - 2;
      const S = knotFitS;
      const c = chord();
      const n = c.n, ph = [c.ph[0], c.ph[1], phZ];
      const R = rotator(yaw, pitch);
      const scr = (v) => [cx + S * v[0], cy - S * v[1]];
      const sp = Math.sin(pitch), cyw = Math.cos(yaw), syw = Math.sin(yaw), cpp = Math.cos(pitch);
      // the three far walls, each with its shadow
      const ys = sp >= 0 ? -KB : KB;
      const xs = syw * cpp >= 0 ? KB : -KB;
      const zs = cyw * cpp >= 0 ? -KB : KB;
      const walls = [
        { fix: 1, v: ys, a: 0, b: 2 },   // floor: x–z
        { fix: 0, v: xs, a: 1, b: 2 },   // side wall: y–z
        { fix: 2, v: zs, a: 0, b: 1 },   // back wall: x–y
      ];
      const labels = [];
      for (const w of walls) {
        const quad = [[-KB, -KB], [KB, -KB], [KB, KB], [-KB, KB]].map(([u, v]) => {
          const p3 = [0, 0, 0]; p3[w.fix] = w.v; p3[w.a] = u; p3[w.b] = v;
          return scr(R(p3[0], p3[1], p3[2]));
        });
        ctx.fillStyle = 'rgba(125,167,217,0.028)';
        ctx.strokeStyle = 'rgba(42,46,63,0.95)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        quad.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = P.inkDim; ctx.globalAlpha = 0.22; ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i <= 360; i++) {
          const u = (TAU * i) / 360;
          const q3 = knotPoint(u, n, ph);
          q3[w.fix] = w.v;
          const [x, y] = scr(R(q3[0], q3[1], q3[2]));
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        // label anchor: the floor's front edge, a wall's top edge
        const edges = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([i, j]) => ({ x: (quad[i][0] + quad[j][0]) / 2, y: (quad[i][1] + quad[j][1]) / 2 }));
        const e = w.fix === 1 ? edges.reduce((m, v) => (v.y > m.y ? v : m)) : edges.reduce((m, v) => (v.y < m.y ? v : m));
        const A = n[w.a], B = n[w.b], g = gcdInt(A, B);
        const nm = dyadName(A / g, B / g);
        labels.push({ x: e.x, y: e.y + (w.fix === 1 ? 16 : -7), ratio: `${A}:${B}`, name: g > 1 ? `${nm || `${A / g}:${B / g}`}, twice` : nm || '' });
      }
      // the curve, depth-banded; near strands cut gaps in far ones
      for (let i = 0; i <= MK; i++) {
        const [x, y, z] = knotPoint((TAU * i) / MK, n, ph);
        const r = R(x, y, z);
        PX[i] = cx + S * r[0]; PY[i] = cy - S * r[1]; PZ[i] = r[2];
      }
      const paths = Array.from({ length: NBAND }, () => new Path2D());
      const lastB = new Int16Array(NBAND).fill(-2);
      for (let i = 0; i < MK; i++) {
        const zm = (PZ[i] + PZ[i + 1]) / 2;
        const b = clamp(Math.floor(((zm + 1.75) / 3.5) * NBAND), 0, NBAND - 1);
        if (lastB[b] !== i - 1) paths[b].moveTo(PX[i], PY[i]);
        paths[b].lineTo(PX[i + 1], PY[i + 1]);
        lastB[b] = i;
      }
      for (let b = 0; b < NBAND; b++) {
        ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
        ctx.globalAlpha = 1; ctx.strokeStyle = P.bg; ctx.lineWidth = BAND_W[b] + 3.4;
        ctx.stroke(paths[b]);
        ctx.lineCap = 'round';
        ctx.globalAlpha = BAND_A[b]; ctx.strokeStyle = BAND_COL[b]; ctx.lineWidth = BAND_W[b];
        ctx.stroke(paths[b]);
      }
      ctx.globalAlpha = 1;
      // the double points of a close voicing
      if (knotInfo && knotInfo.singular) {
        for (const u of doublePoints(n, ph)) {
          const q3 = knotPoint(u, n, ph);
          const [x, y] = scr(R(q3[0], q3[1], q3[2]));
          ctx.strokeStyle = CRIM; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU); ctx.stroke();
        }
      }
      // wall labels
      for (const lb of labels) {
        const x = clamp(lb.x, V.x0 + 40, V.x0 + V.w - 40), y = clamp(lb.y, V.y0 + 10, V.y0 + V.h + 6);
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
        ctx.font = `11px ${MONO}`;
        const rw = ctx.measureText(lb.ratio).width;
        ctx.font = `italic 11.5px ${SERIF}`;
        const nw = lb.name ? ctx.measureText(' ' + lb.name).width : 0;
        const x0 = x - (rw + nw) / 2;
        ctx.textAlign = 'left';
        ctx.font = `11px ${MONO}`; ctx.fillStyle = P.inkDim; ctx.fillText(lb.ratio, x0, y);
        if (lb.name) { ctx.font = `italic 11.5px ${SERIF}`; ctx.fillStyle = LABEL; ctx.fillText(' ' + lb.name, x0 + rw, y); }
      }
      if (!dragged && L.wide) {
        ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = GHOST; ctx.textAlign = 'left';
        ctx.fillText('drag to turn · arrow keys', V.x0 + 2, V.y0 + V.h + 6);
      }
      if (V.card) drawKnotCard(V.card);
    }

    function drawKnotCard(C) {
      const { ctx } = handle;
      const c = chord();
      let y = C.y + 12;
      rubric(ctx, 'the chord', C.x, y);
      y += 44;
      ratioText(ctx, c.n, C.x - 2, y, 40);
      y += 24;
      const ds = fitSize(ctx, c.desc, SERIF, 15.5, C.w, 'italic ');
      ctx.font = `italic ${ds}px ${SERIF}`; ctx.fillStyle = P.inkDim; ctx.textAlign = 'left';
      ctx.fillText(c.desc, C.x, y);
      y += 20;
      ctx.font = `12.5px ${MONO}`; ctx.fillStyle = LABEL;
      ctx.fillText(c.n.map((k) => `${k * KNOT_BASE}`).join(' · ') + ' Hz', C.x, y);
      y += 16; hairline(ctx, C.x, y, C.w); y += 24;
      rubric(ctx, 'three shadows, three intervals', C.x, y);
      y += 22;
      const pairs = [[0, 1, 'x–y'], [1, 2, 'y–z'], [0, 2, 'x–z']];
      for (const [i, j, lab] of pairs) {
        const A = c.n[i], B = c.n[j], g = gcdInt(A, B);
        const nm = dyadName(A / g, B / g) || `${A / g}:${B / g}`;
        ctx.font = `12.5px ${MONO}`; ctx.fillStyle = LABEL; ctx.fillText(lab, C.x, y);
        ctx.fillStyle = P.ink; ctx.fillText(`${A}:${B}`, C.x + 34, y);
        const txt = g > 1 ? `${nm}, traced twice` : nm;
        const ns = fitSize(ctx, txt, SERIF, 14, C.w - 78, 'italic ');
        ctx.font = `italic ${ns}px ${SERIF}`; ctx.fillStyle = g > 1 ? CRIM : P.inkDim;
        ctx.fillText(txt, C.x + 78, y);
        y += 20;
      }
      y += 2; hairline(ctx, C.x, y, C.w); y += 24;
      const k = knotInfo;
      rubric(ctx, k && k.singular ? 'the curve' : 'the knot', C.x, y);
      y += 24;
      if (!k) return;
      if (k.singular) {
        ctx.font = `italic 15.5px ${SERIF}`; ctx.fillStyle = CRIM;
        ctx.fillText(`passes through itself at ${k.points} points,`, C.x, y);
        y += 20;
        ctx.fillStyle = P.inkDim;
        ctx.fillText('for every choice of phase', C.x, y);
        return;
      }
      const poly = `Δ(t) = ${formatPoly(k.poly)}`;
      const psz = fitSize(ctx, poly, SERIF, 19, C.w);
      ctx.font = `${psz}px ${SERIF}`; ctx.fillStyle = P.goldBright;
      ctx.fillText(poly, C.x, y);
      y += 22;
      const who = k.near ? 'the curve almost touches itself here' : k.name ? k.name : k.poly.length > 1 ? 'knotted: Δ ≠ 1 proves it' : 'no knot this polynomial can see';
      const ws = fitSize(ctx, who, SERIF, 15.5, C.w, 'italic ');
      ctx.font = `italic ${ws}px ${SERIF}`; ctx.fillStyle = k.near ? CRIM : P.ink;
      ctx.fillText(who, C.x, y);
      y += 20;
      ctx.font = `12px ${MONO}`; ctx.fillStyle = LABEL;
      ctx.fillText(`${k.crossings} crossings in the x–y shadow · det ${k.det}`, C.x, y);
    }

    /* ---------- the loop ---------- */
    function stepClock(dt) {
      const ac = bus.context;
      if (soundOn && ac && ac.state === 'running') {
        const at = ac.currentTime;
        const d = lastAT < 0 ? dt : at - lastAT;
        lastAT = at;
        return clamp(d, 0, 0.25);
      }
      lastAT = -1;
      return clamp(dt, 0, 0.05);
    }

    function draw(dt) {
      dt = clamp(dt, 0, 0.1);
      clockNow += dt;
      const d = stepClock(dt);            // physics time: the audio clock when sound is on
      c1 += f1() * d; c1 -= Math.floor(c1);
      c2 = (c2 + f2 * d) % 27720;         // lcm(1..12): every q ≤ 12 divides it
      const dphi = phaseTarget - phaseDisp;
      const settling = Math.abs(dphi) > 1e-4;
      if (settling) phaseDisp += dphi * Math.min(1, dt * 8); else phaseDisp = phaseTarget;
      if (!RM) spotClock += dt;
      if (mode === 'scope' && (histN === 0 || clockNow - histT[(histHead + HIST - 1) % HIST] >= 1 / 40)) {
        histT[histHead] = clockNow;
        histP[histHead] = relativePhase(c1 + phaseDisp / TAU, c2, nr[0], nr[1]);
        histHead = (histHead + 1) % HIST;
        histN = Math.min(HIST, histN + 1);
      }
      updateQuest();
      if (mode === 'knot') {
        if (!RM || dragging || dirty) { drawKnot(dt); dirty = false; }
      } else if (mode === 'ink') {
        if (pen && pen.done && !dirty) return;
        drawInk(d);
        if (soundOn) applyGains(0.08);
        dirty = false;
      } else {
        const still = RM && !settling && precessionHz(f1(), f2, nr[0], nr[1]) < 1e-9;
        if (!still || dirty) { drawScope(); dirty = false; }
      }
    }

    /* ---------- pointer and keys (third voice) ---------- */
    const onDown = (e) => {
      if (mode !== 'knot') return;
      dragging = true; dragged = true; dragX = e.clientX; dragY = e.clientY;
      handle.canvas.style.cursor = 'grabbing';
      try { handle.canvas.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e) => {
      if (!dragging || mode !== 'knot') return;
      yaw += (e.clientX - dragX) * 0.008;
      const np = clamp(pitch + (e.clientY - dragY) * 0.008, -1.4, 1.4);
      if (np !== pitch) { pitch = np; fitKnot(); }
      dragX = e.clientX; dragY = e.clientY;
      dirty = true;
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.canvas.style.cursor = mode === 'knot' ? 'grab' : '';
      try { handle.canvas.releasePointerCapture(e.pointerId); } catch {}
    };
    const onKey = (e) => {
      if (mode !== 'knot') return;
      const k = e.key;
      if (k === 'ArrowLeft') yaw -= 0.12;
      else if (k === 'ArrowRight') yaw += 0.12;
      else if (k === 'ArrowUp') { pitch = clamp(pitch - 0.1, -1.4, 1.4); fitKnot(); }
      else if (k === 'ArrowDown') { pitch = clamp(pitch + 0.1, -1.4, 1.4); fitKnot(); }
      else return;
      e.preventDefault();
      dragged = true; dirty = true;
    };
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('pointerup', onUp);
    handle.canvas.addEventListener('pointercancel', onUp);
    handle.canvas.addEventListener('keydown', onKey);

    handle.onResize((w) => {
      const want = heightFor(w);
      if (want !== copts.height) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { copts.height = want; handle.canvas.style.height = want + 'px'; }, 0);
      }
      computeLayout();
      dirty = true;
    });

    /* ---------- boot ---------- */
    computeLayout();
    nr = nearestRatio(f1() / f2);
    analyseKnot(true);
    refreshControls();
    refreshReadout();
    setCaption();
    updateQuest();
    const loop = cv.rafLoop(draw);
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        bus.mute();
      },
      resume() {
        bus.unmute();
        lastAT = -1;
        dirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        clearTimeout(resizeTimer);
        clearTimeout(knotTimer);
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointermove', onMove);
        handle.canvas.removeEventListener('pointerup', onUp);
        handle.canvas.removeEventListener('pointercancel', onUp);
        handle.canvas.removeEventListener('keydown', onKey);
        for (const v of [sx, sy, mx, my, vz]) if (v) v.dispose();
        bus.dispose();
        handle.destroy();
        styleEl.remove();
      },
    };
  },
};

export const _test = {
  precessionHz,
  lissajousPoint,
  harmonographPoint,
  knotPoint,
  nearestRatio,
  intervalName,
  dyadName,
  penFrequencies,
  penDivisor,
  relativePhase,
  knotInvariant,
  knotName,
  formatPoly,
  doublePoints,
  CHORDS,
};
