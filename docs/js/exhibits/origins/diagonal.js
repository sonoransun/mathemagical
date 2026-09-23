// I — The Diagonal
// Incommensurability: the side and diagonal of a square share no common
// measure. Four stations: the Pell near-misses on the integer lattice (with
// the even/odd proof and its picture of descent), reciprocal subtraction that
// never halts, the Eudoxus–Dedekind cut sorted by whole numbers alone, and
// what an irrational ratio looks and sounds like.

import { pellPairs, convergents, TAU, clamp, lerp, cents, formatBig } from '../../core/math.js';

/* ================= pure logic (node-testable) ================= */

// Exact p² − 2q² on BigInt — the meter that never reads zero.
export function meter2(p, q) {
  p = BigInt(p); q = BigInt(q);
  return p * p - 2n * q * q;
}

// Reciprocal subtraction (anthyphairesis) on whole numbers: subtract the
// shorter from the longer until the two agree. Returns every intermediate
// pair; halts at the common measure (the gcd).
export function anthyphairesis(a, b, cap = 256) {
  a = BigInt(a); b = BigInt(b);
  if (a <= 0n || b <= 0n) throw new Error('anthyphairesis wants positive lengths');
  const pairs = [[a, b]];
  let n = 0;
  while (a !== b && n < cap) {
    if (a > b) a -= b; else b -= a;
    pairs.push([a, b]);
    n++;
  }
  return { pairs, halted: a === b, gcd: a === b ? a : null };
}

// Continued fraction of a/b by Euclid's algorithm (exact, BigInt).
export function cfOfRatio(a, b) {
  a = BigInt(a); b = BigInt(b);
  const terms = [];
  while (b > 0n && terms.length < 64) {
    terms.push(Number(a / b));
    [a, b] = [b, a % b];
  }
  return terms;
}

// √2 = [1; 2, 2, 2, …] — first n terms.
export function sqrt2Terms(n) {
  const t = [];
  for (let i = 0; i < n; i++) t.push(i === 0 ? 1 : 2);
  return t;
}

// Numeric value of x + y·√2 (BigInt coefficients) without catastrophic
// cancellation: when the direct sum nearly cancels, use the conjugate:
// x + y√2 = (x² − 2y²) / (x − y√2).
export function sdValue(x, y) {
  x = BigInt(x); y = BigInt(y);
  if (y === 0n) return Number(x);
  const direct = Number(x) + Number(y) * Math.SQRT2;
  if (Math.abs(direct) >= 1) return direct;
  const num = x * x - 2n * y * y;                    // exact, stays tiny here
  const den = Number(x) - Number(y) * Math.SQRT2;    // no cancellation when direct is small
  return Number(num) / den;
}

// Human-readable x + y√2 (rod lengths are positive, so one of these forms).
export function fmtSD(x, y) {
  x = BigInt(x); y = BigInt(y);
  if (y === 0n) return x.toString();
  const ay = y < 0n ? -y : y;
  const rt = ay === 1n ? '√2' : `${ay}√2`;
  if (x === 0n) return y > 0n ? rt : `−${rt}`;
  if (y > 0n && x > 0n) return `${x} + ${rt}`;
  if (y > 0n) return `${rt} − ${-x}`;
  return `${x} − ${rt}`;
}

// The golden twin: x + y·φ with φ = (1 + √5)/2, exact coefficients. Its
// conjugate uses ψ = (1 − √5)/2, and (x + yφ)(x + yψ) = x² + xy − y².
const PHI = (1 + Math.sqrt(5)) / 2;
const PSI = (1 - Math.sqrt(5)) / 2;
export function phiValue(x, y) {
  x = BigInt(x); y = BigInt(y);
  if (y === 0n) return Number(x);
  const direct = Number(x) + Number(y) * PHI;
  if (Math.abs(direct) >= 1) return direct;
  const num = x * x + x * y - y * y;
  const den = Number(x) + Number(y) * PSI;
  return Number(num) / den;
}
export function fmtPhi(x, y) {
  x = BigInt(x); y = BigInt(y);
  if (y === 0n) return x.toString();
  const ay = y < 0n ? -y : y;
  const ph = ay === 1n ? 'φ' : `${ay}φ`;
  if (x === 0n) return y > 0n ? ph : `−${ph}`;
  if (y > 0n && x > 0n) return `${x} + ${ph}`;
  if (y > 0n) return `${ph} − ${-x}`;
  return `${x} − ${ph}`;
}

// Stern–Brocot mediant descent toward √2: start with 1/1 < √2 < 2/1, test the
// mediant with the exact whole-number meter, tighten the trap. Eudoxus' sorting
// move — no √2 required, only p² vs 2q². Returns n steps.
export function cutSteps(n) {
  let lo = [1n, 1n], hi = [2n, 1n];
  const steps = [];
  for (let i = 0; i < n; i++) {
    const m = [lo[0] + hi[0], lo[1] + hi[1]];
    const s = meter2(m[0], m[1]);
    const side = s < 0n ? 'less' : 'greater';   // s === 0n is impossible; proved upstairs
    if (s < 0n) lo = m; else hi = m;
    steps.push({ p: m[0], q: m[1], side, lo, hi });
  }
  return steps;
}

// Theon's rung-to-rung rule and its inverse. On ANY lattice point the meter
// keeps its size and flips its sign: (2q+p)² − 2(q+p)² = −(p² − 2q²).
export function ladderUp(q, p) {
  q = BigInt(q); p = BigInt(p);
  return [q + p, 2n * q + p];
}
export function ladderDown(q, p) {
  q = BigInt(q); p = BigInt(p);
  const nq = p - q, np = 2n * q - p;
  if (nq < 0n || np < 0n || (nq === 0n && np === 0n)) return null;
  return [nq, np];
}

// The descent picture: two q×q squares in opposite corners of a p×p square
// overlap in a (2q−p)² square and leave two (p−q)² corners bare, and
// p² − 2q² = bare − overlap. A perfect fit would give a smaller perfect fit.
export function descentPicture(q, p) {
  q = BigInt(q); p = BigInt(p);
  const o = 2n * q - p, c = p - q;
  return { q, p, o, c, overlap: o * o, bare: 2n * c * c, meter: p * p - 2n * q * q };
}

// The half-square chain behind the second station. With C fixed at the origin,
// triangle T0 has A = (−1, 1), B = (−1, 0): right angle at B, AC the diagonal.
// Marking AE = AB on AC and raising the perpendicular at E to meet BC at F
// gives the half-square (F, E, C). Because C stays put, the step is linear:
// A′ = (2 − √2)·B, B′ = (1 − 1/√2)·A. Returns n + 1 triangles.
export function halfSquareChain(n) {
  const k1 = 2 - Math.SQRT2, k2 = 1 - Math.SQRT1_2;
  let A = [-1, 1], B = [-1, 0];
  const out = [{ A, B }];
  for (let i = 0; i < n; i++) {
    const nA = [k1 * B[0], k1 * B[1]];
    const nB = [k2 * A[0], k2 * A[1]];
    A = nA; B = nB;
    out.push({ A, B });
  }
  return out;
}

// Historical witnesses that are also lattice points (q, p).
export const WITNESSES = [
  { key: 'plato', q: 5, p: 7, title: 'Plato’s rational diameter · (5, 7)',
    tag: 'Plato, Republic 546c',
    note: 'Plato’s “rational diameter” of a square of side five: 49 falls one short of 50 (<em>Republic</em> 546c).' },
  { key: 'a0', q: 29, p: 41, title: 'A0 paper ÷ 29 · (29, 41)',
    tag: 'A0 sheet ÷ 29',
    note: 'An A0 sheet measures 841 × 1189 millimetres: this rung taken twenty-nine times.' },
  { key: 'a4', q: 70, p: 99, title: 'A4 paper ÷ 3 · (70, 99)',
    tag: 'A4 sheet ÷ 3',
    note: 'An A4 sheet measures 210 × 297 millimetres: this rung taken three times.' },
  { key: 'sulba', q: 408, p: 577, title: 'the Śulbasūtras · (408, 577)',
    tag: 'Śulbasūtra 577/408',
    note: 'The Āpastamba and Kātyāyana Śulbasūtras: 1 + 1/3 + 1/(3·4) − 1/(3·4·34) = 577/408, a rung of the same ladder.' },
  { key: 'ybc', q: 21600, p: 30547, title: 'YBC 7289 · (21600, 30547)',
    tag: 'YBC 7289',
    note: 'YBC 7289’s 1;24,51,10 is 30547/21600: the meter reads −791, yet the value is within six ten-millionths of √2. The rung 1393/985 is closer still, with numbers some twenty times smaller.' },
];

// Nice tick/grid step from {1, 2, 5} × 10^k whose on-screen size ≥ minPx.
export function niceStep(pxPerUnit, minPx) {
  const raw = minPx / Math.max(pxPerUnit, 1e-300);
  const k = Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    const s = m * Math.pow(10, k);
    if (s >= raw * (1 - 1e-12)) return s;
  }
  return 10 * Math.pow(10, k);
}

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
export function sup(n) { return String(n).split('').map((c) => SUP[c] ?? c).join(''); }

// 1.234e-5 → '1.2 × 10⁻⁵' (two significant figures; plain form near 1).
export function sci(x, sig = 2) {
  if (!Number.isFinite(x) || x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e <= 3) return x.toPrecision(sig).replace('-', '−');
  const m = x / Math.pow(10, e);
  return `${m.toFixed(sig - 1).replace('-', '−')} × 10${sup(e)}`;
}

// 'p/q' → [p, q] as positive BigInts, or null.
export function parseFrac(s) {
  const m = /^\s*(\d{1,18})\s*[/:∕÷]\s*(\d{1,18})\s*$/.exec(String(s || ''));
  if (!m) return null;
  const p = BigInt(m[1]), q = BigInt(m[2]);
  if (p <= 0n || q <= 0n) return null;
  return [p, q];
}

// Lissajous x = sin 2πt, y = sin 2π√2t returns to x = 0 after every whole
// sweep q; y then misses its start by |sin 2π(q√2 − p)| of the radius. The
// misses shrink fastest at the ladder's rungs.
export function lissMiss(q) {
  const f = q * Math.SQRT2;
  return Math.abs(Math.sin(TAU * (f - Math.round(f))));
}

// Ratio buttons: the convergents of √2 (Theon's rungs as p : q).
export function ladderRatios(n) {
  return convergents(sqrt2Terms(n)).map(([p, q]) => ({ p, q, label: `${p} : ${q}` }));
}

// Anthyphairesis as a tiling: each subtraction carves a square of the shorter
// side from the remaining rectangle. Returns the squares and what is left.
export function carveSquares(a, b, steps) {
  let R = { x: 0, y: 0, w: a, h: b };
  const sq = [];
  for (let i = 0; i < steps && R.w > 0 && R.h > 0; i++) {
    if (R.w >= R.h) { sq.push({ x: R.x, y: R.y, s: R.h, from: 'A' }); R = { x: R.x + R.h, y: R.y, w: R.w - R.h, h: R.h }; }
    else { sq.push({ x: R.x, y: R.y, s: R.w, from: 'B' }); R = { x: R.x, y: R.y + R.w, w: R.w, h: R.h - R.w }; }
  }
  return { squares: sq, rest: R };
}

const PELL = pellPairs(40);                       // [p, q] BigInt pairs
const PELLN = PELL.map(([p, q]) => [Number(q), Number(p)]); // world [x=q, y=p]

function selfTest() {
  let n = 0;
  const ok = (c, m) => { n++; if (!c) throw new Error('diagonal _test #' + n + ': ' + m); };
  ok(meter2(17, 12) === 1n && meter2(7, 5) === -1n, 'near-misses read ±1');
  PELL.forEach(([p, q], i) => ok(meter2(p, q) === (i % 2 ? 1n : -1n), 'Theon: the meter alternates'));
  for (const [q, p] of [[3, 4], [5, 9], [12, 17], [100, 141], [7, 1]]) {
    const [uq, up] = ladderUp(q, p);
    ok(meter2(up, uq) === -meter2(p, q), 'ladder up flips the sign, keeps the size');
    const d = ladderDown(uq, up);
    ok(d && d[0] === BigInt(q) && d[1] === BigInt(p), 'down undoes up');
  }
  let r = [12n, 17n];
  const chain = [];
  while (r) { chain.push(r.join(',')); r = ladderDown(r[0], r[1]); }
  ok(chain.join(' ') === '12,17 5,7 2,3 1,1 0,1', 'descent from (12, 17)');
  const dp = descentPicture(12, 17);
  ok(dp.overlap === 49n && dp.bare === 50n && dp.meter === dp.bare - dp.overlap, 'descent picture 49 vs 50');
  const a4 = anthyphairesis(297, 210);
  ok(a4.halted && a4.gcd === 3n && a4.pairs.length - 1 === 10, 'A4 halts at 3 mm after 10 subtractions');
  ok(cfOfRatio(297, 210).join() === '1,2,2,2,2,2', 'A4 = [1; 2, 2, 2, 2, 2]');
  ok(cfOfRatio(15, 9).join() === '1,1,2', '15/9 = [1; 1, 2]');
  ok(297 === 3 * 99 && 210 === 3 * 70 && 841 === 29 * 29 && 1189 === 29 * 41, 'paper sizes are rungs');
  const wm = WITNESSES.map((w) => meter2(w.p, w.q).toString()).join();
  ok(wm === '-1,-1,1,1,-791', 'witness meters');
  ok(Math.abs(30547 / 21600 - Math.SQRT2) < 6.1e-7 && Math.abs(30547 / 21600 - Math.SQRT2) > 5.9e-7, 'YBC 7289 error');
  ok(Math.abs(1393 / 985 - Math.SQRT2) < Math.abs(30547 / 21600 - Math.SQRT2), '1393/985 is closer');
  ok(Math.abs(577 / 408 - (1 + 1 / 3 + 1 / 12 - 1 / (3 * 4 * 34))) < 1e-15, 'Śulbasūtra sum');
  const sides = cutSteps(7).map((s) => s.side[0]).join('');
  ok(sides === 'gllggll', 'the verdicts come in pairs');
  // conjugate evaluation stays accurate deep down: (√2 − 1)^k
  let x = 0n, y = 1n, xx = 1n, yy = 0n;           // diagonal √2, side 1
  for (let k = 0; k < 24; k++) {
    if (sdValue(x, y) > sdValue(xx, yy)) { x -= xx; y -= yy; } else { xx -= x; yy -= y; }
  }
  const small = Math.min(sdValue(x, y), sdValue(xx, yy));
  ok(small > 0 && Math.abs(Math.log(small) / Math.log(Math.SQRT2 - 1) - 12) < 0.51, 'sdValue deep');
  ok(Math.abs(phiValue(-1, 1) - (PHI - 1)) < 1e-15 && fmtPhi(-1, 1) === 'φ − 1' && fmtPhi(2, -1) === '2 − φ', 'phi rods');
  const T = halfSquareChain(4);
  for (const { A, B } of T) {
    const ab = Math.hypot(A[0] - B[0], A[1] - B[1]), bc = Math.hypot(B[0], B[1]), ac = Math.hypot(A[0], A[1]);
    ok(Math.abs(ab - bc) < 1e-12 && Math.abs(ac - Math.SQRT2 * ab) < 1e-12, 'each link is a half-square');
    ok(Math.abs((A[0] - B[0]) * B[0] + (A[1] - B[1]) * B[1]) < 1e-12, 'right angle at B');
  }
  ok(Math.abs(Math.hypot(T[1].A[0] - T[1].B[0], T[1].A[1] - T[1].B[1]) - (Math.SQRT2 - 1)) < 1e-12, 'shrinks by √2 − 1');
  ok(Math.abs(T[2].A[0] / T[0].A[0] - (Math.SQRT2 - 1) ** 2) < 1e-12, 'same picture every second step');
  ok(sci(1.234e-5) === '1.2 × 10⁻⁵' && sci(0.25) === '0.25', 'sci');
  ok(parseFrac('17/12')[0] === 17n && parseFrac('0/3') === null && parseFrac('x') === null, 'parseFrac');
  ok(Math.abs(lissMiss(12) - 0.1844) < 1e-3 && lissMiss(29) < lissMiss(12), 'near-returns tighten');
  ok(ladderRatios(5).map((r) => r.label).join() === '1 : 1,3 : 2,7 : 5,17 : 12,41 : 29', 'ratio buttons');
  const cs = carveSquares(15, 9, 3);
  ok(cs.squares.map((s) => s.s).join() === '9,6,3' && cs.rest.w === 3 && cs.rest.h === 3, 'carving 15 × 9');
  ok(niceStep(46, 30) === 1 && niceStep(1, 30) === 50 && niceStep(0.001, 30) === 50000, 'niceStep');
  // independent cross-checks: Theon's rule from (1, 1) regenerates pellPairs,
  // the mediants are the Stern–Brocot path, and every rung's picture is off by one
  let rung = [1n, 1n];
  for (let i = 0; i < 12; i++) {
    ok(rung[0] === PELL[i][1] && rung[1] === PELL[i][0], 'ladderUp from (1, 1) is pellPairs');
    const dpi = descentPicture(rung[0], rung[1]);
    ok(dpi.bare - dpi.overlap === dpi.meter && (dpi.meter === 1n || dpi.meter === -1n), 'bare − overlap = ±1 on every rung');
    rung = ladderUp(rung[0], rung[1]);
  }
  ok(cutSteps(7).map((st) => `${st.p}/${st.q}`).join() === '3/2,4/3,7/5,10/7,17/12,24/17,41/29', 'mediant path');
  ok(lissMiss(29) < lissMiss(28) && lissMiss(29) < lissMiss(30) && lissMiss(70) < lissMiss(69), 'near-returns fall on the rungs');
  ok(meter2(99, 70) === 1n && meter2(1189, 841) === meter2(41, 29) * 841n, 'paper meters');
  return n;
}

/* ================= the exhibit ================= */

export default {
  id: 'diagonal',
  movement: 1,
  title: 'The Diagonal',
  hook: 'Hunt for the fraction that measures a square’s diagonal — and hear why you will never find it.',
  era: 'c. 1800 BCE – 1872 · Mesopotamia, Athens, Alexandria, Zürich',
  chronicle: [
    { year: -1700, date: 'c. 1800–1600 BCE', text: 'On a small round school tablet now in the Yale Babylonian Collection, <em>YBC 7289</em>, a student draws a square with side 30, crosses it with both diagonals and writes 1;24,51,10 along one of them: √2 to within about six ten-millionths.' },
    { year: -370, date: '4th c. BCE', text: 'In Plato’s <em>Theaetetus</em>, the geometer Theodorus of Cyrene proves the sides of squares of area 3, 5 and onward incommensurable one case at a time, “up to the root of seventeen square units, at which point, for some reason, he stopped.”' },
    { year: -350, date: '4th c. BCE', text: 'Aristotle, explaining proof by contradiction, cites the standard example: the diagonal of the square is incommensurable with the side “because odd numbers are equal to evens if it is supposed to be commensurate.”' },
    { year: 115, date: '1st–2nd c. CE', text: 'Theon of Smyrna, in a handbook for readers of Plato, gives the rule for side and diagonal numbers, (1, 1), (2, 3), (5, 7), (12, 17) and on, each diagonal’s square one short of or one over twice its side’s.' },
    { year: 1872, date: '1872', text: 'In <em>Stetigkeit und irrationale Zahlen</em>, Richard Dedekind defines an irrational number as a cut in the fractions. He dates the idea to 24 November 1858, in Zürich.' },
    { year: 1922, date: '1922', text: 'Germany adopts DIN 476, Walter Porstmann’s paper sizes, whose sides stand as the side and diagonal of a square; they become ISO 216 and the United Nations’ document format in 1975.' },
    { year: 2006, date: '2006', text: 'In <em>The Seventeen Provers of the World</em>, Freek Wiedijk has the irrationality of √2 formalized in seventeen proof assistants, to compare how machines check mathematics.' },
    { year: 2025, date: 'June 2025', text: 'Teck Por Lim computes √2 to 28 trillion decimal places. Whether its digits are <em>normal</em>, every string turning up with its fair frequency, remains unproved.' },
  ],
  today: `
    <p>The diagonal is lying on your desk. A sheet of A4 paper measures 210 by 297 millimetres,
    exactly three times the rung (70, 99) of Theon’s ladder, whose meter reads +1, and the
    square-metre A0 sheet it is halved down from, 841 by 1189, is the rung (29, 41) taken
    twenty-nine times. The paper is designed around √2, because a rectangle whose sides stand as
    the side and diagonal of a square is the only one that keeps its shape when folded in half; the
    whole numbers are the near-misses that manufacturing forces on it. Equal temperament goes the
    other way: its tritone, six equal semitones, is exactly √2, a ratio no two whole-number string
    lengths can give.</p>
    <p>The four steps of the proof became a test piece for machine mathematics. Freek
    Wiedijk chose the theorem over the infinitude of the primes, “because it involves the real
    numbers,” when he compared seventeen proof assistants in 2006, and it heads his list of a
    hundred landmark theorems, now checked by machine in thirteen systems, Lean and Rocq among them.
    Theon’s ladder is itself a small machine: one 2 × 2 matrix applied again and again, its output
    swinging onto the direction of √2. That is power iteration, the method behind Google’s
    PageRank, which Movement IV runs on a web of pages in <a href="#ex-eigen">0.85</a>. And the
    hunt for near-misses, widened to <code>x² − dy² = 1</code>, became in 2002 a problem a quantum
    computer could solve in polynomial time: Sean Hallgren extended the period-finding of
    <a href="#ex-shor">The Period Engine</a> to a period that is irrational, and the same method
    breaks the Buchmann–Williams key exchange.</p>
    <p>What no one can yet do is say much about the digits. Of the first million decimal places of
    √2, each digit from 0 to 9 fills between 98,924 and 100,441, close to a fair share, yet no one
    has proved that √2 is <em>normal</em>, every string of digits turning up in the long run at its
    fair frequency, in any base; no irrational algebraic number has been proved normal at all. A
    theorem of David Bailey, Jonathan Borwein, Richard Crandall and Carl Pomerance, published in
    2004, guarantees only that the first N binary digits of √2 include more than some constant
    times √N ones, where a fair share would be N/2. We have known for some twenty-four centuries
    that the diagonal never repeats. We still cannot prove that it plays no favourites.</p>`,
  sources: [
    { text: 'David Fowler and Eleanor Robson, “Square Root Approximations in Old Babylonian Mathematics: YBC 7289 in Context,” <em>Historia Mathematica</em> 25 (1998) 366–378', url: 'https://doi.org/10.1006/hmat.1998.2209' },
    { text: 'Plato, <em>Republic</em> 546c, trans. Paul Shorey (Perseus Digital Library)', url: 'https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0168:book=8:section=546c' },
    { text: 'Theon of Smyrna, <em>Mathematics Useful for Understanding Plato</em>, trans. Robert and Deborah Lawlor from the 1892 edition of J. Dupuis (Wizards Bookshelf, 1979)' },
    { text: 'Carl Huffman, “Pythagoreanism,” <em>Stanford Encyclopedia of Philosophy</em>', url: 'https://plato.stanford.edu/entries/pythagoreanism/' },
    { text: 'Kurt von Fritz, “The Discovery of Incommensurability by Hippasus of Metapontum,” <em>Annals of Mathematics</em> 46 (1945) 242–264', url: 'https://doi.org/10.2307/1969021' },
    { text: 'Wilbur R. Knorr, “The Impact of Modern Mathematics on Ancient Mathematics,” <em>Revue d’histoire des mathématiques</em> 7 (2001) 121–135', url: 'https://www.numdam.org/item/RHM_2001__7_1_121_0/' },
    { text: 'Richard Dedekind, <em>Essays on the Theory of Numbers</em> (1872, 1888), trans. W. W. Beman (Open Court, 1901)', url: 'https://www.gutenberg.org/ebooks/21016' },
    { text: 'Freek Wiedijk, ed., <em>The Seventeen Provers of the World</em>, LNAI 3600 (Springer, 2006)', url: 'https://doi.org/10.1007/11542384' },
    { text: 'Sean Hallgren, “Polynomial-time quantum algorithms for Pell’s equation and the principal ideal problem,” <em>Journal of the ACM</em> 54 (2007)', url: 'https://doi.org/10.1145/1206035.1206039' },
    { text: 'Markus Kuhn, “International standard paper sizes,” University of Cambridge', url: 'https://www.cl.cam.ac.uk/~mgk25/iso-paper.html' },
  ],
  alt: 'An integer lattice where a crimson marker hunts for whole numbers p and q with p² = 2q², the near-misses glowing as a gold staircase along the √2 ray; below it, two bronze rods subtracted one from the other beside a nest of ever-smaller half-squares, a number line on which fractions are sorted into less and greater around a hidden cut, and a Lissajous figure that closes for 3 : 2 and never closes for √2 : 1.',
  prose: `
    <p>Draw a square and lay a rod along its diagonal. Nothing could be more concrete: you can
    see the length, cut a cord to match it, carry it across the room. Now try to <em>say</em>
    it. If the side counts as 1, the diagonal counts as what? Philolaus of Croton, who wrote what
    was probably the first Pythagorean book, put the creed in two sentences: “all things that
    are known have number. For it is not possible that anything whatsoever be understood or known
    without this.” If the diagonal can be known, then some fraction <code>p/q</code> must fit it:
    whole numbers with <code>p² = 2q²</code>. Try <code>7/5</code>: 49 against 50, off by one.
    Try <code>17/12</code>: 289 against 288, off by one the other way. The hunt keeps almost
    succeeding, which is the cruellest way to fail.</p>
    <p>The near-misses are not scattered; they climb a ladder. Plato knew one rung by name. In
    the <em>Republic</em> he calls 7 the “rational diameter” of a square of side five, the whole
    number whose square falls one short of the true diagonal’s 50, and sets it beside the
    “irrational” one. Some five centuries later Theon of Smyrna, writing a handbook for readers
    of Plato, gave the rule: from any rung <code>(q, p)</code> the next is
    <code>(q + p, 2q + p)</code>, carrying (1, 1) to (2, 3) to (5, 7) to (12, 17) to (29, 41), the
    meter <code>p² − 2q²</code> flipping −1, +1, −1 forever and never once reading 0, “in such a
    way that these diagonals and these sides will always be expressible.” Sayable, that is, in
    whole numbers, at the price of being wrong by one. Modern books call the sides the Pell
    numbers; the diagonals are half their companions, the Pell–Lucas numbers. The first station sets you loose on the
    lattice to find the staircase yourself.</p>
    <p>The Greeks could do better than fail repeatedly: they could prove the failure final. The
    earliest witness is Aristotle, who cites the argument in passing as the standard example of
    proof by contradiction: the diagonal is incommensurable with the side “because odd numbers
    are equal to evens if it is supposed to be commensurate.” Suppose <code>p/q</code> is in lowest
    terms and <code>p² = 2q²</code>; then p² is even, so p is even; write <code>p = 2r</code> and
    the same equation forces q to be even too, though we had cancelled every common factor. The
    assumption devours itself. (The tidy version once printed in Euclid’s <em>Elements</em> as
    X.117 is a later interpolation; the argument is older than the book.) In Plato’s
    <em>Theaetetus</em> the geometer Theodorus proves the sides of squares of area 3, 5 and
    onward incommensurable one case at a time, “up to the root of seventeen square units, at
    which point, for some reason, he stopped.” He began at three; two, it seems, was already
    settled. The <em>Republic</em> calls such a length <em>arrhētos</em>, unsayable, and the other
    Greek word, <em>alogos</em>, means without <em>logos</em>, which meant both ratio and word.
    Neither means unknown, and neither means approximate. The diagonal is exactly as long as it
    is. It has no name in the language of whole numbers.</p>
    <p>Run Theon’s ladder backwards and it becomes a proof of its own. From any rung
    <code>(q, p)</code> step down to <code>(p − q, 2q − p)</code>: (12, 17) returns to (5, 7),
    then (2, 3), then (1, 1), the meter flipping its sign at every step and never changing its
    size. A point that read 0 would step down to a smaller point reading 0, and that to a smaller
    one, forever, through whole numbers that cannot fall forever. And <code>(p − q, 2q − p)</code>
    is exactly what two strokes of subtraction do to a side and a diagonal at the second station.
    The ladder, the subtraction and the proof are one rule, seen three times.</p>
    <p>But how would anyone first come to <em>suspect</em> such a thing? No ancient text tells
    us. One celebrated reconstruction, Kurt von Fritz’s of 1945, runs through what Donald Knuth
    called “the oldest nontrivial algorithm which still is important to computer programmers.” To
    compare two lengths, subtract the shorter from the longer, again and again:
    <em>anthyphairesis</em>, the Euclidean algorithm done with rods instead of symbols. Set it
    loose on 15 and 9 and it halts in three subtractions at 3, their common measure. Set it on the
    side and diagonal of a square and every second subtraction leaves a smaller square with its
    own side and diagonal, the same scene shrunk by √2 − 1, forever: in the bracket shorthand of
    continued fractions, <code>√2 = [1; 2, 2, 2, …]</code>, one 2 for every return of the scene.
    Euclid made this the test. If the remainder never measures the one before it, says Book X,
    Proposition 2, the magnitudes are incommensurable. A measuring procedure that cannot finish is
    what irrationality <em>is</em>, and Movement III will ask the same question of procedures in
    general: <a href="#ex-beavers">which ones never halt?</a></p>
    <p>This also closes a ledger opened two exhibits ago. <a href="#ex-sixty">Plimpton 322</a>
    tabulates whole-number right triangles more than a millennium before Pythagoras, who, despite
    the theorem’s name, is not known to have proved it. The simplest right triangle of all, the
    half-square, appears in no row of that tablet or any other, because its row would read
    <code>p² = 2q²</code>. The scribes were not blind to the diagonal. On a small round school
    tablet now at Yale, YBC 7289, a student of the same age drew a square, wrote 30 along its
    side, crossed it with both diagonals, and wrote along one of them 1;24,51,10, which is √2 to
    within six ten-millionths, and beneath it 42;25,35, the diagonal itself. The same number
    turns up in an Old Babylonian list of standard coefficients. It is superb arithmetic, and
    nothing on the tablet asks whether those four sexagesimal places could ever be the last. That
    question belongs to the Greeks.</p>
    <p>And the shock carried its own cure. Later historians would call it a crisis, though the
    geometers of the next century show little sign of one. Book V of the <em>Elements</em>, a
    theory tradition credits to Eudoxus, declares two ratios equal when every whole-number ratio
    falls on the same side of both: <em>less</em> for one means <em>less</em> for the other,
    <em>greater</em> for one means <em>greater</em> for the other. Eudoxus never said the sorting
    <em>was</em> the ratio; his magnitudes were already lying on the page. That step dates from 24
    November 1858, the day Richard Dedekind, teaching the calculus for the first time at the
    Polytechnic in Zürich, found what he called the essence of continuity. A sorting of the
    fractions into two piles with no fraction at the seam, he saw, can simply be declared a number.
    “We create a new, an irrational number,” he wrote in 1872, and his first example was a whole number that is not a
    square, sorted by exactly the test of the third station: is <code>p²</code> less or greater
    than <code>2q²</code>? His proof that no fraction sits at the seam is Theon’s ladder run
    backwards. Sixteen years later he found the idea already set out in Euclid’s definition of
    equal ratios: “this same most ancient conviction,” he wrote, “has been the source of my
    theory.”</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const SQ2 = Math.SQRT2;

    /* ---------- house type & colour for canvas text ---------- */
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep default */ }
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const fnt = (px, fam, style = '') => `${style ? style + ' ' : ''}${px}px ${fam}`;
    const FAINT = '#8a8676';                     // --ink-faint (legible as text)
    const GHOST = P.inkGhost || '#4a4840';
    const HALO = 'rgba(10, 11, 16, 0.92)';
    const CRIMSON_T = P.crimsonBright || '#d97a68';
    const crisp = (v) => Math.round(v) + 0.5;
    const R = (v) => Math.max(0, v);             // never a negative radius or size

    function label(ctx, s, x, y, o = {}) {
      ctx.font = o.font || fnt(11, MONO);
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.base || 'alphabetic';
      if (o.pill) {
        // a quiet plate behind text that sits over busy ink
        const w = ctx.measureText(s).width, h = parseFloat(/([\d.]+)px/.exec(ctx.font)[1]);
        const al = o.align || 'left', bl = o.base || 'alphabetic';
        const bx = al === 'right' ? x - w : al === 'center' ? x - w / 2 : x;
        const by = bl === 'top' ? y : bl === 'middle' ? y - h / 2 : bl === 'bottom' ? y - h : y - h * 0.8;
        const px = bx - 5, py = by - 3, pw = w + 10, ph = h + 6, r = 3;
        ctx.fillStyle = o.pill;
        ctx.beginPath();
        ctx.moveTo(px + r, py); ctx.arcTo(px + pw, py, px + pw, py + ph, r); ctx.arcTo(px + pw, py + ph, px, py + ph, r);
        ctx.arcTo(px, py + ph, px, py, r); ctx.arcTo(px, py, px + pw, py, r); ctx.closePath();
        ctx.fill();
      }
      if (o.halo !== false && !o.pill) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = o.haloW || 4;
        ctx.strokeStyle = o.haloColor || HALO;
        ctx.strokeText(s, x, y);
      }
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.fillStyle = o.color || P.ink;
      ctx.fillText(s, x, y);
      ctx.globalAlpha = 1;
    }
    const fmtN = (x) => formatBig(x).replace('-', '−');
    // a pressed-looking button that says so to assistive technology too
    const setOn = (b, on) => { b.classList.toggle('active', !!on); b.setAttribute('aria-pressed', String(!!on)); };
    const rgba = (hex, a) => {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };

    /* ---------- reduced motion (decorative motion only) ---------- */
    let RM = false, mql = null;
    const onRM = () => {
      RM = !!(mql && mql.matches);
      s1dirty = s2dirty = s3dirty = s4dirty = true;
      if (RM) staticSound(); else if (static4) { static4 = false; resetTrace(); }
    };
    try {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      RM = mql.matches;
      if (mql.addEventListener) mql.addEventListener('change', onRM);
    } catch { mql = null; }

    /* ---------- scoped style ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-diagonal canvas{touch-action:pan-y;}
      #ex-diagonal .dg-lattice canvas{touch-action:none;cursor:crosshair;}
      #ex-diagonal .dg-lattice canvas:focus-visible{outline:2px solid ${P.goldBright};outline-offset:2px;}
      #ex-diagonal .dg-surface{position:relative;}
      #ex-diagonal .dg-title{display:flex;align-items:center;gap:.7rem;font-variant-caps:all-small-caps;
        letter-spacing:.2em;color:var(--mv, ${P.gold});font-size:.95rem;margin:3rem 0 .9rem;line-height:1.3;}
      #ex-diagonal .dg-title:first-of-type{margin-top:.2rem;}
      #ex-diagonal .dg-title::before{content:'';flex:none;width:.8em;height:.8em;border:1px solid currentColor;
        background:linear-gradient(to top right,transparent calc(50% - .7px),${P.crimson} calc(50% - .7px),${P.crimson} calc(50% + .7px),transparent calc(50% + .7px));}
      #ex-diagonal .dg-title::after{content:'';flex:1;height:1px;min-width:1rem;
        background:linear-gradient(90deg,${rgba(P.gold, 0.45)},transparent);}
      #ex-diagonal .dg-title .dg-num{font-variant-numeric:lining-nums;opacity:.85;}
      #ex-diagonal .dg-zoom{position:absolute;top:8px;right:8px;display:flex;gap:6px;}
      #ex-diagonal .dg-zoom button{width:30px;height:30px;padding:0;border-radius:15px;border:1px solid ${P.line};
        background:${rgba('#161925', 0.88)};color:${P.inkDim};font:15px/1 ${MONO};cursor:pointer;}
      #ex-diagonal .dg-zoom button:hover{border-color:${P.goldDim};color:${P.goldBright};}
      #ex-diagonal .dg-zoom button:focus-visible{outline:2px solid ${P.goldBright};outline-offset:1px;}
      #ex-diagonal .dg-meter{text-align:center;font-size:1.05rem;margin-top:.9rem;padding:.6rem .8rem;color:${P.ink};}
      #ex-diagonal .dg-meter .dg-eq{display:block;letter-spacing:.02em;}
      #ex-diagonal .dg-meter .dg-v{color:${P.azure};}
      #ex-diagonal .dg-meter .dg-near{color:${P.goldBright};}
      #ex-diagonal .dg-meter .dg-note{display:block;font-family:var(--serif, ${SERIF});font-style:italic;
        font-size:.9rem;color:${P.inkDim};margin-top:.25rem;white-space:normal;}
      #ex-diagonal .dg-proof{display:none;border:1px solid ${P.line};border-left:4px solid ${P.crimson};
        border-radius:0 6px 6px 0;padding:1.1rem 1.3rem;margin:1.1rem 0;background:${rgba('#161925', 0.55)};}
      #ex-diagonal .dg-proof.open{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,15.5rem);gap:1.2rem 1.6rem;align-items:start;}
      #ex-diagonal .dg-proof.won{border-left-color:${P.gold};}
      #ex-diagonal .dg-proof-head{grid-column:1/-1;font-variant-caps:all-small-caps;letter-spacing:.18em;
        color:${P.crimson};font-size:.85rem;}
      #ex-diagonal .dg-proof.won .dg-proof-head{color:${P.gold};}
      #ex-diagonal .dg-step{margin:.1rem 0 .7rem;color:${P.inkDim};opacity:0;transform:translateY(5px);
        transition:opacity .45s ease,transform .45s ease;font-size:.97rem;line-height:1.6;}
      #ex-diagonal .dg-step.shown{opacity:1;transform:none;}
      #ex-diagonal .dg-step.dg-fire{color:${P.ink};}
      #ex-diagonal .dg-step .dg-qed{color:${P.gold};font-size:1.15em;margin-left:.45em;}
      #ex-diagonal .dg-step button{margin-left:.6em;vertical-align:baseline;}
      #ex-diagonal .dg-fig .controls{margin:.5rem 0 0;gap:.5rem;justify-content:center;}
      #ex-diagonal .dg-fig-note{font-style:italic;font-size:.86rem;color:${P.inkDim};margin:.55rem 0 0;line-height:1.5;}
      #ex-diagonal .dg-fig-note b{font-style:normal;font-weight:normal;font-family:${MONO};font-size:.8rem;color:${P.goldBright};}
      #ex-diagonal .dg-seg{display:flex;flex-wrap:wrap;gap:.45rem;margin:0 0 .8rem;}
      #ex-diagonal .dg-input{font-family:${MONO};font-size:.85rem;color:${P.ink};background:#0a0b10;
        border:1px solid ${P.line};border-radius:5px;padding:.38rem .6rem;width:8.5em;max-width:100%;}
      #ex-diagonal .dg-input:focus-visible{outline:2px solid ${P.goldBright};outline-offset:1px;}
      #ex-diagonal .dg-try{display:inline-flex;align-items:center;gap:.5rem;flex-wrap:wrap;}
      #ex-diagonal .dg-try label{font-size:.8rem;font-variant-caps:all-small-caps;letter-spacing:.14em;color:${P.inkDim};}
      #ex-diagonal .dg-mono{font-family:${MONO};font-size:.82em;}
      @media (max-width: 700px){
        #ex-diagonal .dg-proof.open{grid-template-columns:minmax(0,1fr);}
        #ex-diagonal .dg-fig{max-width:17rem;margin:0 auto;width:100%;}
        #ex-diagonal .dg-title{letter-spacing:.11em;font-size:.88rem;gap:.55rem;margin-top:2.4rem;}
      }
      @media (prefers-reduced-motion: reduce){
        #ex-diagonal .dg-step{transition:none;transform:none;}
      }`;
    stage.appendChild(style);

    const bus = audio.createBus('diagonal');
    const audioNow = () => (audio.getContext() ? audio.getContext().currentTime : 0);
    const title = (num, txt) => {
      const d = document.createElement('div');
      d.className = 'dg-title';
      d.innerHTML = `<span class="dg-num">${num}</span><span>${txt}</span>`;
      stage.appendChild(d);
      return d;
    };

    // HiDPI canvas whose height follows its width (phones get taller plates).
    const surfaces = [];
    function surface(parent, heightFor, cls = '') {
      const wrap = document.createElement('div');
      wrap.className = 'dg-surface' + (cls ? ' ' + cls : '');
      parent.appendChild(wrap);
      const canvas = document.createElement('canvas');
      wrap.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const h = {
        wrap, canvas, ctx, width: 0, height: 0, dpr: 1, cbs: [],
        onResize(cb) { this.cbs.push(cb); },
        destroy() { ro.disconnect(); wrap.remove(); },
      };
      function resize() {
        const w = Math.max(60, Math.floor(wrap.getBoundingClientRect().width || 0));
        const hh = Math.max(60, Math.round(heightFor(w)));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (w === h.width && hh === h.height && dpr === h.dpr) return;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(hh * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = hh + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        h.width = w; h.height = hh; h.dpr = dpr;
        for (const cb of h.cbs) cb(w, hh);
      }
      const ro = new ResizeObserver(() => resize());
      ro.observe(wrap);
      resize();
      surfaces.push(h);
      return h;
    }

    const spriteDim = cv.glowSprite(P.goldDim, 26);
    const spriteLit = cv.glowSprite(P.goldBright, 36);
    const spriteAz = cv.glowSprite(P.azure, 22);

    /* =====================================================================
       station 1 · the hunt
       ===================================================================== */

    title('i', 'the hunt');
    const quest = ui.questBanner(stage,
      'Drag the <em>crimson marker</em>, or tap any lattice point, to find a spot (q, p) where ' +
      'the meter reads exactly 0: whole numbers with p² = 2q².');
    const S1 = surface(stage, (w) => (w < 560 ? 400 : 450), 'dg-lattice');
    const cnv1 = S1.canvas;
    cnv1.tabIndex = 0;
    cnv1.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight + - Enter U D');
    cnv1.setAttribute('role', 'application');
    cnv1.setAttribute('aria-roledescription', 'lattice');
    cnv1.setAttribute('aria-label', 'The integer lattice of sides q and diagonals p. Arrow keys move the marker, U and D climb the ladder a rung up or down, plus and minus zoom, Enter flies to the next rung. The meter below reads p squared minus twice q squared.');
    const pz = new cv.PanZoom(S1, { scale: 46, x: 4, y: 4.5, minScale: 0.004, maxScale: 220 });

    function homeView() {
      const W = S1.width, H = S1.height;
      const s = clamp(Math.min(W, H) / 9.5, 30, 50);
      const ox = W < 560 ? 34 : Math.max(46, W * 0.12), oy = H - 40;
      return { x: (W / 2 - ox) / s, y: (oy - H / 2) / s, s };
    }
    {
      const h0 = homeView();
      pz.x = h0.x; pz.y = h0.y; pz.scale = h0.s;
    }

    let mq = 3, mp = 4;              // marker at (q, p): the meter reads −2
    const found = new Set();         // discovered rungs (indices into PELL)
    let latestRung = -1;
    let igniteCount = 0;
    let proved = false;
    let s1dirty = true;
    let fly = null;                  // camera flight
    let rings = [];                  // ignition rings { q, p, t }
    let lastTick = 0;
    let witnessKey = '';

    // zoom overlay
    const zoomBox = document.createElement('div');
    zoomBox.className = 'dg-zoom';
    S1.wrap.appendChild(zoomBox);
    const zbtn = (txt, aria, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn);
      zoomBox.appendChild(b);
      return b;
    };
    zbtn('+', 'zoom in', () => zoomBy(1.8));
    zbtn('−', 'zoom out', () => zoomBy(1 / 1.8));
    zbtn('⌂', 'back to the start', () => { const h = homeView(); flyTo(h.x, h.y, h.s); });

    const meterBox = ui.readout(stage, '');
    meterBox.el.classList.add('dg-meter');
    meterBox.el.setAttribute('aria-live', 'polite');

    const row1 = ui.controlRow(stage);
    ui.button(row1, 'why does zero never come?', toggleProof, { primary: true });
    ui.button(row1, '✦ fly to the next rung', flyToNext, { small: true });
    const downBtn = ui.button(row1, '↙ a rung down', () => stepLadder(-1), { small: true });
    const upBtn = ui.button(row1, 'a rung up ↗', () => stepLadder(1), { small: true });
    downBtn.title = '(q, p) → (p − q, 2q − p)';
    upBtn.title = '(q, p) → (q + p, 2q + p)';
    const witnessSel = ui.select(row1, {
      label: 'go to a witness',
      options: [{ value: '', label: '—' }, ...WITNESSES.map((w) => ({ value: w.key, label: w.title }))],
      value: '',
      onChange: (k) => goWitness(k),
    });

    /* ----- the proof panel ----- */
    const proof = document.createElement('div');
    proof.className = 'dg-proof';
    stage.appendChild(proof);
    const proofHead = document.createElement('div');
    proofHead.className = 'dg-proof-head';
    proofHead.textContent = 'why zero never comes';
    proof.appendChild(proofHead);
    const proofSteps = document.createElement('div');
    proofSteps.setAttribute('aria-live', 'polite');
    proof.appendChild(proofSteps);
    const figBox = document.createElement('div');
    figBox.className = 'dg-fig';
    proof.appendChild(figBox);
    let SF = null, figNote = null, figIdx = 3;       // descent picture, default (12, 17)

    const PROOF = [
      ['Suppose the hunt could end: some marker gives <code>p² = 2q²</code> exactly. Cancel any common factor first, so that p and q are not both even. Hold on to that; it is the whole proof.', 'look at p'],
      ['<code>p² = 2q²</code> says p² is even. An odd number times itself is odd, so p itself must be even. Write <code>p = 2r</code>.', 'substitute'],
      ['Then <code>(2r)² = 2q²</code>, so <code>4r² = 2q²</code>, so <code>q² = 2r²</code>: the same equation again, one floor down. So q is even too.', 'but wait'],
      ['Both are even, though we cancelled every common factor: in Aristotle’s words, “odd numbers are equal to evens if it is supposed to be commensurate.” The assumption has destroyed itself; the fraction never existed. The meter can flicker ±1 forever, but it never reads 0.<span class="dg-qed">∎</span>', null],
    ];
    let proofStarted = false;

    function toggleProof() {
      proof.classList.toggle('open');
      if (proof.classList.contains('open')) {
        if (!proofStarted) { proofStarted = true; revealStep(0); }
        buildFigure();
        drawFigure();
      }
    }
    function revealStep(i, focusNext = false) {
      const [text, next] = PROOF[i];
      const div = document.createElement('div');
      div.className = 'dg-step' + (next === null ? ' dg-fire' : '');
      div.innerHTML = text;
      if (next !== null) {
        // each prompt gives way to the step it asks for, so the finished proof reads clean
        const b = ui.button(div, next + ' →', () => {
          const had = document.activeElement === b;
          b.remove();
          revealStep(i + 1, had);
        }, { small: true });
        if (focusNext) requestAnimationFrame(() => { try { b.focus({ preventScroll: true }); } catch { /* old browsers */ } });
      }
      proofSteps.appendChild(div);
      if (RM) div.classList.add('shown');
      else requestAnimationFrame(() => div.classList.add('shown'));
      if (next === null) {
        proved = true;
        proof.classList.add('won');
        quest.done('Proved: <code>p² = 2q²</code> has no whole-number solution. The hunt was never winnable. The diagonal is <em>arrhētos</em>, unsayable in whole numbers, and now you know why.');
        s1dirty = true;
        audio.ensureAudio();
        audio.playTone(bus, { freq: 220, dur: 1.4, level: 0.25 });
        audio.playTone(bus, { freq: 440, dur: 1.4, level: 0.2 });
      }
    }

    function buildFigure() {
      if (SF) return;
      SF = surface(figBox, (w) => clamp(w, 160, 250));
      SF.canvas.setAttribute('role', 'img');
      SF.canvas.setAttribute('aria-label', 'Two equal squares set in opposite corners of a larger square, overlapping in the middle and leaving two corners bare; the note below gives the counts.');
      SF.onResize(() => drawFigure());
      const row = ui.controlRow(figBox);
      ui.button(row, '◂ a rung down', () => { figIdx = Math.max(0, figIdx - 1); drawFigure(); }, { small: true });
      ui.button(row, 'a rung up ▸', () => { figIdx = Math.min(7, figIdx + 1); drawFigure(); }, { small: true });
      figNote = document.createElement('p');
      figNote.className = 'dg-fig-note';
      figBox.appendChild(figNote);
    }

    function drawFigure() {
      if (!SF) return;
      const { ctx, width: W, height: H } = SF;
      ctx.clearRect(0, 0, W, H);
      const [pB, qB] = PELL[figIdx];
      const d = descentPicture(qB, pB);
      const p = Number(pB), q = Number(qB), o = Number(d.o), c = Number(d.c);
      const m = 18;
      const size = R(Math.min(W, H) - 2 * m);
      const cell = size / p;
      const x0 = (W - size) / 2, y0 = (H - size) / 2 + 4;       // room above for the caption
      const X = (u) => x0 + u * cell;               // u in cells, origin bottom-left
      const Y = (v) => y0 + size - v * cell;
      // the p × p square
      ctx.fillStyle = rgba('#0a0b10', 1);
      ctx.fillRect(x0, y0, size, size);
      // two q × q squares, bottom-left (gold) and top-right (azure)
      ctx.fillStyle = rgba(P.gold, 0.17);
      ctx.fillRect(X(0), Y(q), q * cell, q * cell);
      ctx.fillStyle = rgba(P.azure, 0.17);
      ctx.fillRect(X(p - q), Y(p), q * cell, q * cell);
      // bare corners
      if (c > 0) {
        ctx.save();
        for (const [u, v] of [[0, q], [q, 0]]) {
          ctx.beginPath();
          ctx.rect(X(u), Y(v + c), c * cell, c * cell);
          ctx.fillStyle = rgba(P.crimson, 0.22);
          ctx.fill();
          ctx.save(); ctx.clip();
          ctx.strokeStyle = rgba(P.crimson, 0.55);
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = -c * cell; k < c * cell * 2; k += 6) {
            ctx.moveTo(X(u) + k, Y(v)); ctx.lineTo(X(u) + k + c * cell, Y(v + c));
          }
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
      // overlap, covered twice
      if (o > 0) {
        ctx.fillStyle = rgba(P.goldBright, 0.2);
        ctx.fillRect(X(p - q), Y(q), o * cell, o * cell);
      }
      // cell grid
      if (cell >= 4.5) {
        ctx.strokeStyle = 'rgba(232, 226, 208, 0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 1; k < p; k++) {
          ctx.moveTo(crisp(X(k)), y0); ctx.lineTo(crisp(X(k)), y0 + size);
          ctx.moveTo(x0, crisp(Y(k))); ctx.lineTo(x0 + size, crisp(Y(k)));
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = P.gold;
      ctx.strokeRect(X(0), Y(q), q * cell, q * cell);
      ctx.strokeStyle = P.azure;
      ctx.strokeRect(X(p - q), Y(p), q * cell, q * cell);
      if (o > 0) {
        ctx.strokeStyle = P.goldBright;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(X(p - q), Y(q), o * cell, o * cell);
      }
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 1;
      ctx.strokeRect(crisp(x0), crisp(y0), Math.round(size), Math.round(size));
      // counts
      if (o > 0 && o * cell >= 18) label(ctx, fmtN(o * o), X(p - q) + (o * cell) / 2, Y(q) + (o * cell) / 2, { font: fnt(12, MONO), color: P.goldBright, align: 'center', base: 'middle' });
      if (c > 0 && c * cell >= 16) {
        label(ctx, fmtN(c * c), X(c / 2), Y(q + c / 2), { font: fnt(11, MONO), color: CRIMSON_T, align: 'center', base: 'middle' });
        label(ctx, fmtN(c * c), X(q + c / 2), Y(c / 2), { font: fnt(11, MONO), color: CRIMSON_T, align: 'center', base: 'middle' });
      }
      label(ctx, `${p} × ${p}`, W / 2, y0 - 4, { font: fnt(10.5, MONO), color: FAINT, align: 'center', base: 'bottom' });
      if (figNote) {
        const mm = d.meter;
        const x = (a, b) => `${a}&nbsp;×&nbsp;${b}`;
        const bare = c > 0 ? `leave two ${x(c, c)} corners, <b>${fmtN(2 * c * c)}</b>, bare` : 'leave nothing bare';
        const below = ladderDown(qB, pB);
        const tail = below && (below[0] > 0n)
          ? `Off by one again, and the numbers are the rung (${below[0]},&nbsp;${below[1]}) below.`
          : 'Off by one, at the foot of the ladder.';
        figNote.innerHTML =
          `${x(p, p)} = <b>${fmtN(p * p)}</b>. Two ${x(q, q)} squares, <b>${fmtN(2 * q * q)}</b>, overlap in ${x(o, o)} = <b>${fmtN(o * o)}</b> and ${bare}: ` +
          `the meter reads <b>${mm > 0n ? '+' : ''}${fmtN(mm)}</b>. ${tail} If the two squares ever filled the big one exactly, the overlap ` +
          `would equal the bare corners, a smaller square equal to two others, and then a smaller one, forever.`;
      }
    }

    /* ----- meter & marker ----- */
    function updateMeter() {
      const pB = BigInt(mp), qB = BigInt(mq);
      const v = meter2(pB, qB);
      const av = v < 0n ? -v : v;
      let cls = 'dg-v', note = '';
      const w = WITNESSES.find((x) => x.q === mq && x.p === mp);
      if (mq === 0 && mp === 0) note = '0/0 names no length; stand the marker off the corner.';
      else if (mq === 0) note = 'With q = 0 there is no ratio at all.';
      else if (v === 0n) { cls = 'dg-near'; note = 'Zero?'; }
      else if (av === 1n) { cls = 'dg-near'; note = 'A near-miss: whole numbers can come no closer than one.'; }
      else {
        const r = mp / mq;
        note = `${mp}/${mq} ≈ ${r.toPrecision(r >= 10 ? 7 : 6)}, ${v > 0n ? 'above' : 'below'} √2.`;
      }
      if (w) note = w.note;
      meterBox.setHTML(
        `<span class="dg-eq">${fmtN(pB)}² − 2 · ${fmtN(qB)}² = ` +
        `<span class="${cls}">${v > 0n ? '+' : ''}${fmtN(v)}</span></span>` +
        `<span class="dg-note">${note}</span>`);
      if (!w && witnessKey) { witnessKey = ''; witnessSel.set(''); }

      if (av === 1n) {
        const idx = PELL.findIndex(([pp, qq]) => pp === pB && qq === qB);
        if (idx >= 0 && !found.has(idx)) ignite(idx);
      }
      downBtn.disabled = !ladderDown(mq, mp);
    }

    function ignite(idx) {
      found.add(idx);
      latestRung = idx;
      igniteCount++;
      rings = rings.filter((r) => !r.beckon);
      if (!RM) rings.push({ q: PELLN[idx][0], p: PELLN[idx][1], t: 0 });
      if (idx >= 1 && idx <= 7) { figIdx = idx; drawFigure(); }
      const r = PELLN[idx][1] / PELLN[idx][0];
      audio.ensureAudio();
      audio.playTone(bus, { freq: 220, dur: 0.9, level: 0.24 });
      audio.playTone(bus, { freq: 220 * r, dur: 0.9, level: 0.24 });
      if (!proved) {
        if (igniteCount >= 3) {
          quest.set('Rung after rung: ±1 forever, 0 never. When you want to know <em>why</em>, open the proof below the lattice.');
        } else if (igniteCount === 1) {
          quest.set('A near-miss: the meter reads ±1. Each gold rung is built from the last, (q, p) → (q + p, 2q + p). Climb the staircase. Zero is still wanted.');
        }
      }
      s1dirty = true;
    }

    function placeMarker(q, p, { tick = true } = {}) {
      q = clamp(Math.round(q), 0, 9e15);
      p = clamp(Math.round(p), 0, 9e15);
      if (q === mq && p === mp) return false;
      mq = q; mp = p;
      const now = performance.now();
      if (tick && now - lastTick > 70 && audio.getContext()) {
        const v = meter2(BigInt(mp), BigInt(mq));
        const av = Math.min(Number(v < 0n ? -v : v), 1e6);
        audio.drums.wood(bus, audioNow(), { level: 0.11, pitch: 420 + 520 * Math.exp(-av / 8) });
        lastTick = now;
      }
      updateMeter();
      s1dirty = true;
      return true;
    }

    function markerOnScreen(margin = 24) {
      const [x, y] = pz.worldToScreen(mq, mp);
      return x > margin && x < S1.width - margin && y > margin && y < S1.height - margin;
    }

    function flyTo(x, y, s, dur = 1.15) {
      s = clamp(s, pz.minScale, pz.maxScale);
      if (RM) { pz.x = x; pz.y = y; pz.scale = s; fly = null; s1dirty = true; return; }
      const sMin = Math.min(pz.scale, s);
      const dist = Math.hypot(x - pz.x, y - pz.y) * sMin;
      const span = Math.max(120, Math.min(S1.width, S1.height));
      fly = { t: 0, x0: pz.x, y0: pz.y, s0: pz.scale, x1: x, y1: y, s1: s, hop: dist > span ? Math.log(dist / span) : 0, dur };
    }
    function stepFly(dt) {
      if (!fly) return;
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      const e = fly.t * fly.t * (3 - 2 * fly.t);
      const ls = lerp(Math.log(fly.s0), Math.log(fly.s1), e) - fly.hop * Math.sin(Math.PI * e);
      pz.scale = clamp(Math.exp(ls), pz.minScale, pz.maxScale);
      pz.x = lerp(fly.x0, fly.x1, e);
      pz.y = lerp(fly.y0, fly.y1, e);
      s1dirty = true;
      if (fly.t >= 1) fly = null;
    }
    function zoomBy(f) {
      const s = clamp(pz.scale * f, pz.minScale, pz.maxScale);
      flyTo(pz.x, pz.y, s, 0.45);
    }
    function nextIdx() {
      let idx = 0;
      while (found.has(idx)) idx++;
      return idx < PELLN.length ? idx : -1;
    }
    // a view with the origin in the lower-left corner, as at home, that holds
    // (q, p) clear of the ledger; its scale is null when the point is too far
    function cornerView(q, p, minScale) {
      const W = S1.width, H = S1.height;
      const ox = W < 560 ? 34 : Math.max(46, W * 0.12), oy = H - 40;
      const room = W >= 760 ? W - 270 : W - 24;
      const s = Math.min(50, (room - ox) / Math.max(1, q), (oy - 48) / Math.max(1, p));
      return s >= minScale ? { x: (W / 2 - ox) / s, y: (oy - H / 2) / s, s } : null;
    }
    function flyToNext() {
      const idx = nextIdx();
      if (idx < 0) return;
      const [qx, py] = PELLN[idx];
      const v = cornerView(qx, py, 26);
      if (v) flyTo(v.x, v.y, v.s);
      else flyTo(qx, py, Math.max(26, Math.min(pz.scale, 46)));
      // once the camera lands, a ring closes on the rung still wanted
      rings = rings.filter((r) => !r.beckon);
      rings.push({ q: qx, p: py, t: RM ? 0 : -1.05, beckon: true });
      s1dirty = true;
    }
    function frameMarker() {
      if (markerOnScreen(36)) return;
      const W = S1.width, H = S1.height;
      const fit = Math.min((W * 0.72) / Math.max(1, mq), (H * 0.72) / Math.max(1, mp));
      if (fit >= 12) { flyTo(mq, mp, Math.min(pz.scale, 46)); return; }
      // frame the whole climb from the corner; too far out to see, go and stand by it
      const v = cornerView(mq, mp, 0.02);
      if (v) flyTo(v.x, v.y, v.s); else flyTo(mq, mp, 30);
    }
    function stepLadder(dir) {
      const nxt = dir > 0 ? ladderUp(mq, mp) : ladderDown(mq, mp);
      if (!nxt) return;
      const [nq, np] = nxt.map(Number);
      if (nq > 9e15 || np > 9e15) return;
      audio.ensureAudio();
      placeMarker(nq, np);
      frameMarker();
    }
    function goWitness(key) {
      const w = WITNESSES.find((x) => x.key === key);
      if (!w) return;
      audio.ensureAudio();
      placeMarker(w.q, w.p);
      witnessKey = key;
      witnessSel.set(key);
      updateMeter();
      flyTo(w.q, w.p, w.key === 'ybc' ? 30 : Math.max(24, Math.min(pz.scale, 40)));
    }

    // pointer: drag the marker when grabbed, otherwise pan; a tap plants the
    // marker (snapping to a visible rung); two fingers pinch-zoom.
    const pts = new Map();
    let drag1 = null;            // 'marker' | 'pan' | 'pinch'
    let tap = null, pinch = null;
    cnv1.addEventListener('pointerdown', (e) => {
      audio.ensureAudio();
      try { cnv1.focus({ preventScroll: true }); } catch { /* old browsers */ }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      try { cnv1.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      fly = null;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
        drag1 = 'pinch'; tap = null;
        return;
      }
      const [px, py] = cv.pointerPos(S1, e);
      const [mx, my] = pz.worldToScreen(mq, mp);
      const grab = e.pointerType === 'touch' ? 30 : 22;
      drag1 = Math.hypot(px - mx, py - my) < grab ? 'marker' : 'pan';
      tap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    });
    cnv1.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (drag1 === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const rect = cnv1.getBoundingClientRect();
        pz.x -= (mx - pinch.mx) / pz.scale;
        pz.y += (my - pinch.my) / pz.scale;
        if (pinch.d > 4) pz.zoomAt(mx - rect.left, my - rect.top, d / pinch.d);
        pinch = { d, mx, my };
        s1dirty = true;
        return;
      }
      if (tap) tap.moved += Math.hypot(e.clientX - prev[0], e.clientY - prev[1]);
      if (drag1 === 'pan') {
        if (tap && tap.moved < 5) return;
        pz.x -= (e.clientX - prev[0]) / pz.scale;
        pz.y += (e.clientY - prev[1]) / pz.scale;
        s1dirty = true;
      } else if (drag1 === 'marker') {
        const [px, py] = cv.pointerPos(S1, e);
        const [wx, wy] = pz.screenToWorld(px, py);
        placeMarker(wx, wy);
      }
    });
    const endPointer = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      try { cnv1.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (drag1 === 'pinch') { if (pts.size === 0) drag1 = null; tap = null; return; }
      if (e.type === 'pointerup' && drag1 === 'pan' && tap && tap.moved < 6 && performance.now() - tap.t < 600) {
        const [px, py] = cv.pointerPos(S1, e);
        plantAt(px, py);
      }
      drag1 = null; tap = null;
    };
    cnv1.addEventListener('pointerup', endPointer);
    cnv1.addEventListener('pointercancel', endPointer);
    function plantAt(px, py) {
      // snap to a drawn rung when the tap lands on its glow
      let best = -1, bd = 16;
      for (let i = 0; i < PELLN.length; i++) {
        if (!rungShown(i)) continue;
        const [sx, sy] = pz.worldToScreen(PELLN[i][0], PELLN[i][1]);
        const d = Math.hypot(px - sx, py - sy);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) { placeMarker(PELLN[best][0], PELLN[best][1]); return; }
      const [wx, wy] = pz.screenToWorld(px, py);
      placeMarker(wx, wy);
    }
    cnv1.addEventListener('wheel', (e) => {
      // zoom only once the lattice has focus (or with ctrl/⌘), so the page still scrolls
      if (document.activeElement !== cnv1 && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      fly = null;
      const rect = cnv1.getBoundingClientRect();
      pz.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(1.0015, -e.deltaY));
      s1dirty = true;
    }, { passive: false });
    cnv1.addEventListener('keydown', (e) => {
      const big = e.shiftKey ? 10 : 1;
      let handled = true;
      switch (e.key) {
        case 'ArrowRight': placeMarker(mq + big, mp); break;
        case 'ArrowLeft': placeMarker(mq - big, mp); break;
        case 'ArrowUp': placeMarker(mq, mp + big); break;
        case 'ArrowDown': placeMarker(mq, mp - big); break;
        case '+': case '=': zoomBy(1.5); break;
        case '-': case '_': zoomBy(1 / 1.5); break;
        case 'Enter': case 'n': flyToNext(); break;
        case 'u': stepLadder(1); break;
        case 'd': stepLadder(-1); break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        audio.ensureAudio();
        if (e.key.startsWith('Arrow') && !markerOnScreen(30)) { pz.x = mq; pz.y = mp; s1dirty = true; }
      }
    });

    function revealAll() { return proved || igniteCount >= 3; }
    function rungShown(i) {
      if (found.has(i)) return true;
      if (revealAll()) return true;
      return igniteCount >= 1 && i === nextIdx();
    }

    function stepLattice(dt) {
      stepFly(dt);
      if (rings.length) {
        for (const r of rings) r.t += dt / (r.beckon ? (RM ? 2.4 : 1.3) : 0.8);
        rings = rings.filter((r) => r.t < 1);
        s1dirty = true;
      }
    }

    function drawLattice() {
      const { ctx, width: W, height: H } = S1;
      ctx.clearRect(0, 0, W, H);
      const sc = pz.scale;
      const [wx0, wy1] = pz.screenToWorld(0, 0);     // left, top
      const [wx1, wy0] = pz.screenToWorld(W, H);     // right, bottom
      const [ox, oy] = pz.worldToScreen(0, 0);

      // labels claim room as they are set, and yield when it is taken
      const boxes = [];
      const claim = (b) => { boxes.push(b); return b; };
      const isFree = (b) => b.x >= 2 && b.x + b.w <= W - 2 && b.y >= 2 && b.y + b.h <= H - 2 &&
        boxes.every((o) => b.x + b.w < o.x || b.x > o.x + o.w || b.y + b.h < o.y || b.y > o.y + o.h);
      const boxOf = (s, x, y, font, align = 'left', base = 'alphabetic') => {
        ctx.font = font;
        const w = ctx.measureText(s).width;
        const h = parseFloat(/([\d.]+)px/.exec(font)[1]) * 1.15;
        const bx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        const by = base === 'top' ? y : base === 'middle' ? y - h / 2 : base === 'bottom' ? y - h : y - h * 0.8;
        return { x: bx - 3, y: by - 2, w: w + 6, h: h + 4 };
      };
      // try each candidate spot in turn and keep the first free one; the
      // words are set last, above every glow
      const texts = [];
      const place = (s, spots, o, pad = 0) => {
        for (const [x, y, align, base] of spots) {
          const b = boxOf(s, x, y, o.font, align, base);
          if (!isFree(pad ? { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad } : b)) continue;
          claim(b);
          texts.push([s, x, y, { ...o, align, base }]);
          return true;
        }
        return false;
      };
      claim({ x: W - 132, y: 0, w: 132, h: 46 });                      // zoom buttons
      if (W >= 760) claim({ x: W - 260, y: 40, w: 260, h: 60 + LEDGER_ROWS * 19 + 34 });
      claim(boxOf('↑ p, diagonals', 12, 12, fnt(12.5, SERIF, 'italic'), 'left', 'top'));
      claim(boxOf('q, sides →', W - 12, H - 24, fnt(12.5, SERIF, 'italic'), 'right'));
      claim({ x: 0, y: H - 18, w: W, h: 18 });                          // the rulers
      claim({ x: 0, y: 30, w: 36, h: H - 48 });

      // ruled grid
      const step = niceStep(sc, 30);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(P.line, 0.75);
      ctx.beginPath();
      const i0 = Math.ceil(wx0 / step), i1 = Math.floor(wx1 / step);
      const j0 = Math.ceil(wy0 / step), j1 = Math.floor(wy1 / step);
      if (i1 - i0 < 400 && j1 - j0 < 400) {
        for (let i = i0; i <= i1; i++) { if (i === 0) continue; const x = crisp(pz.worldToScreen(i * step, 0)[0]); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let j = j0; j <= j1; j++) { if (j === 0) continue; const y = crisp(pz.worldToScreen(0, j * step)[1]); ctx.moveTo(0, y); ctx.lineTo(W, y); }
      }
      ctx.stroke();
      // axes
      ctx.strokeStyle = rgba(P.inkDim, 0.35);
      ctx.beginPath();
      if (ox >= 0 && ox <= W) { ctx.moveTo(crisp(ox), 0); ctx.lineTo(crisp(ox), H); }
      if (oy >= 0 && oy <= H) { ctx.moveTo(0, crisp(oy)); ctx.lineTo(W, crisp(oy)); }
      ctx.stroke();

      // lattice points, warmer where the meter is small (never singling out ±1)
      if (sc >= 13 && (wx1 - wx0 + 1) * (wy1 - wy0 + 1) <= 7000) {
        const buckets = [[], [], []];
        for (let x = Math.max(0, Math.ceil(wx0)); x <= wx1; x++) {
          for (let y = Math.max(0, Math.ceil(wy0)); y <= wy1; y++) {
            const m = Math.abs(y * y - 2 * x * x);
            buckets[x === 0 || y === 0 ? 2 : m <= 2 ? 0 : m <= 7 ? 1 : 2].push(x, y);
          }
        }
        const cols = [rgba(P.gold, 0.6), rgba(P.inkDim, 0.42), rgba(P.inkDim, 0.22)];
        const rad = clamp(sc / 22, 1, 1.6);
        buckets.forEach((b, k) => {
          ctx.fillStyle = cols[k];
          for (let n = 0; n < b.length; n += 2) {
            const [sx, sy] = pz.worldToScreen(b[n], b[n + 1]);
            ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
          }
        });
      }

      // visible stretch of a ray p = k·q (q ≥ 0)
      const qRange = (k) => {
        const t0 = Math.max(0, wx0 - 1, (wy0 - 1) / k);
        const t1 = Math.min(wx1 + 1, (wy1 + 1) / k);
        return t1 > t0 ? [t0, t1] : null;
      };

      // the meter's own level sets, p² − 2q² = ±1: they hug the ray
      if (igniteCount >= 1 && sc >= 3) {
        const rg = qRange(SQ2);
        if (rg) {
          for (const k of [1, -1]) {
            ctx.strokeStyle = rgba(P.gold, 0.42);
            ctx.lineWidth = 1;
            ctx.setLineDash(k > 0 ? [] : [3, 4]);
            ctx.beginPath();
            let started = false;
            const dq = 2.5 / sc;
            for (let t = Math.max(rg[0], k < 0 ? SQ2 / 2 : 0); t <= rg[1] + dq; t += dq) {
              const p = Math.sqrt(Math.max(0, 2 * t * t + k));
              const [sx, sy] = pz.worldToScreen(t, p);
              if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }

      // the √2 ray
      const rr = qRange(SQ2);
      if (rr) {
        const [ax, ay] = pz.worldToScreen(rr[0], rr[0] * SQ2);
        const [bx, by] = pz.worldToScreen(rr[1], rr[1] * SQ2);
        ctx.strokeStyle = P.azure;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // faint ray through the marker: its slope against the diagonal's
      if (mq > 0 || mp > 0) {
        const k = mq > 0 ? mp / mq : Infinity;
        ctx.strokeStyle = rgba(P.crimson, 0.32);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (Number.isFinite(k) && k > 0) {
          const rg = qRange(k);
          if (rg) {
            const [ax, ay] = pz.worldToScreen(rg[0], rg[0] * k);
            const [bx, by] = pz.worldToScreen(rg[1], rg[1] * k);
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
          }
        } else if (k === 0) { ctx.moveTo(Math.max(0, ox), crisp(oy)); ctx.lineTo(W, crisp(oy)); }
        else { ctx.moveTo(crisp(ox), Math.min(H, oy)); ctx.lineTo(crisp(ox), 0); }
        ctx.stroke();
      }

      // the staircase through discovered rungs, brightening toward the newest
      const maxFound = found.size ? Math.max(...found) : 0;
      ctx.lineWidth = 1.4;
      for (let i = 0; i + 1 < PELLN.length; i++) {
        if (!found.has(i) || !found.has(i + 1)) continue;
        const [ax, ay] = pz.worldToScreen(PELLN[i][0], PELLN[i][1]);
        const [bx, by] = pz.worldToScreen(PELLN[i + 1][0], PELLN[i + 1][1]);
        if (Math.max(ax, bx) < -50 || Math.min(ax, bx) > W + 50 || Math.max(ay, by) < -50 || Math.min(ay, by) > H + 50) continue;
        ctx.strokeStyle = rgba(P.gold, 0.3 + 0.5 * ((i + 1) / Math.max(1, maxFound)));
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }

      // the marker's own label is set first, so nothing else lands on it
      const [mx, my] = pz.worldToScreen(mq, mp);
      const mOn = mx > -40 && mx < W + 40 && my > -40 && my < H + 40;
      let mLab = null;
      if (mOn) {
        const txt = `(${fmtN(mq)}, ${fmtN(mp)})`;
        const mf = fnt(11.5, MONO);
        ctx.font = mf;
        const tw = ctx.measureText(txt).width;
        const right = mx + 16 + tw < W - 8;
        const left = mx - 16 - tw > 6;
        const above = my - 16 > 44;
        if (right || left) {
          mLab = { txt, x: right ? mx + 16 : mx - 16, y: above ? my - 14 : my + 16, align: right ? 'left' : 'right', base: above ? 'bottom' : 'top', font: mf };
        } else {
          // too wide for either side (huge numbers on a phone): centre it clear of the crosshair
          mLab = { txt, x: clamp(mx, tw / 2 + 6, W - tw / 2 - 6), y: above ? my - 18 : my + 19, align: 'center', base: above ? 'bottom' : 'top', font: mf, pill: 'rgba(10, 11, 16, 0.88)' };
        }
        claim({ x: mx - 15, y: my - 15, w: 30, h: 30 });
        claim(boxOf(txt, mLab.x, mLab.y, mf, mLab.align, mLab.base));
      }

      // standing on YBC 7289: the tablet itself, in the corner
      // (lower right: the ray runs off to the lower left, the ledger sits above)
      if (mOn && mq === 21600 && mp === 30547 && sc >= 6) {
        const r = W < 560 ? 50 : 62;
        const tx = W - 40 - r, ty = H - 44 - r;
        claim({ x: tx - r - 4, y: ty - r - 4, w: 2 * r + 8, h: 2 * r + 8 });
        claim({ x: tx - r - 112, y: ty + r - 20, w: 108, h: 22 });
        drawTablet(ctx, tx, ty, r);
      }

      // historical witnesses: their names are set before the rungs' numbers
      const wits = [];
      for (const w of WITNESSES) {
        if (w.key !== 'ybc') {
          const idx = PELLN.findIndex(([q, p]) => q === w.q && p === w.p);
          if (!found.has(idx) && witnessKey !== w.key) continue;
        }
        const [sx, sy] = pz.worldToScreen(w.q, w.p);
        if (sx < -12 || sx > W + 12 || sy < -12 || sy > H + 12) continue;
        wits.push([w, sx, sy]);
        claim({ x: sx - 11, y: sy - 11, w: 22, h: 22 });
      }
      for (const [w, sx, sy] of wits) {
        place(w.tag, [[sx - 19, sy + 14, 'right', 'top'], [sx + 19, sy + 14, 'left', 'top'],
          [sx - 19, sy - 14, 'right', 'bottom'], [sx + 19, sy - 14, 'left', 'bottom']],
        { font: fnt(12, SERIF, 'italic'), color: P.azure });
      }

      // rungs, labelled where there is room
      for (let i = PELLN.length - 1; i >= 0; i--) {
        if (!rungShown(i)) continue;
        const [qx, py] = PELLN[i];
        const [sx, sy] = pz.worldToScreen(qx, py);
        if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
        const lit = found.has(i);
        (lit ? spriteLit : spriteDim).draw(ctx, sx, sy, lit ? 1.05 : 0.72);
        if (lit) {
          ctx.fillStyle = P.goldBright;
          ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, TAU); ctx.fill();
          if (!(mLab && PELLN[i][0] === mq && PELLN[i][1] === mp)) {
            place(`${fmtN(PELL[i][0])}/${fmtN(PELL[i][1])}`,
              [[sx + 10, sy + 5, 'left', 'top'], [sx - 10, sy - 5, 'right', 'bottom']],
              { font: fnt(11, MONO), color: P.goldBright });
          }
        }
      }

      // the witnesses' diamonds, cut out of the glow
      for (const [w, sx, sy] of wits) {
        if (w.key === 'ybc') spriteAz.draw(ctx, sx, sy, 0.8);
        ctx.beginPath();
        ctx.moveTo(sx, sy - 11); ctx.lineTo(sx + 11, sy); ctx.lineTo(sx, sy + 11); ctx.lineTo(sx - 11, sy); ctx.closePath();
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = 'rgba(10, 11, 16, 0.85)'; ctx.lineWidth = 3.6; ctx.stroke();
        ctx.strokeStyle = P.azure; ctx.lineWidth = 1.4; ctx.stroke();
      }

      // the ray's name, wherever along it there is room
      // (first with a wide berth from everything already set, then without)
      if (rr) {
        let done = false;
        for (const pad of [18, 0]) {
          for (const f of [0.62, 0.45, 0.78, 0.3, 0.9]) {
            const tl = lerp(rr[0], rr[1], f);
            const [lx, ly] = pz.worldToScreen(tl, tl * SQ2);
            if (place('p = √2 · q', [[lx + 12, ly + 4, 'left', 'top'], [lx - 12, ly - 4, 'right', 'bottom']],
              { font: fnt(13, SERIF, 'italic'), color: P.azure }, pad)) { done = true; break; }
          }
          if (done) break;
        }
      }

      // ignition rings
      for (const r of rings) {
        if (r.t < 0) continue;
        const [sx, sy] = pz.worldToScreen(r.q, r.p);
        const e = 1 - (1 - r.t) * (1 - r.t);
        if (r.beckon) {
          // a dashed ring that closes on the rung still to be found
          ctx.strokeStyle = rgba(P.goldBright, RM ? 0.8 : 0.9 * Math.sin(Math.PI * Math.min(1, r.t)));
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(sx, sy, R(RM ? 16 : 44 - 30 * e), 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
        ctx.strokeStyle = rgba(P.goldBright, 0.75 * (1 - r.t));
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, R(8 + 34 * e), 0, TAU); ctx.stroke();
      }

      for (const t of texts) label(ctx, ...t);

      // the marker
      if (mOn) {
        ctx.strokeStyle = P.crimson;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 7.5, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 4, my);
        ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 14, my);
        ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 4);
        ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 14);
        ctx.stroke();
        ctx.fillStyle = CRIMSON_T;
        ctx.beginPath(); ctx.arc(mx, my, 2, 0, TAU); ctx.fill();
        label(ctx, mLab.txt, mLab.x, mLab.y, { font: mLab.font, color: CRIMSON_T, align: mLab.align, base: mLab.base, pill: mLab.pill });
      } else {
        // an arrow at the rim toward the marker
        const ang = Math.atan2(my - H / 2, mx - W / 2);
        const ex = clamp(W / 2 + Math.cos(ang) * W, 14, W - 14);
        const ey = clamp(H / 2 + Math.sin(ang) * H, 14, H - 14);
        ctx.fillStyle = CRIMSON_T;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      if (W >= 760) drawLedger(ctx, W);

      // margins: axis names and a ruler
      label(ctx, '↑ p, diagonals', 12, 12, { font: fnt(12.5, SERIF, 'italic'), color: P.inkDim, base: 'top' });
      label(ctx, 'q, sides →', W - 12, H - 24, { font: fnt(12.5, SERIF, 'italic'), color: P.inkDim, align: 'right' });
      ctx.font = fnt(9.5, MONO);
      const every = step * sc >= 44 ? 1 : 2;
      for (let i = Math.max(1, i0); i <= i1; i++) {
        if (i % every) continue;
        const x = pz.worldToScreen(i * step, 0)[0];
        if (x < 8 || x > W - 110) continue;
        label(ctx, fmtN(Math.round(i * step)), x + 3, H - 6, { font: fnt(9.5, MONO), color: FAINT, alpha: 0.9 });
      }
      for (let j = Math.max(1, j0); j <= j1; j++) {
        if (j % every) continue;
        const y = pz.worldToScreen(0, j * step)[1];
        if (y < 34 || y > H - 30) continue;
        label(ctx, fmtN(Math.round(j * step)), 5, y - 3, { font: fnt(9.5, MONO), color: FAINT, alpha: 0.9 });
      }
    }

    // YBC 7289 as a round school tablet: a square turned on its point, both
    // diagonals, 30 along one side, 1;24,51,10 and 42;25,35 on the diagonal.
    function drawTablet(ctx, cx, cy, r) {
      ctx.save();
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, 'rgba(92, 78, 52, 0.96)');
      g.addColorStop(1, 'rgba(46, 39, 28, 0.96)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(P.gold, 0.55); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R(r - 0.5), 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(10, 11, 16, 0.35)';
      ctx.beginPath(); ctx.arc(cx, cy, R(r - 4), 0, TAU); ctx.stroke();
      // the square, incised (turned on its point, as the tablet is usually shown)
      const d = r * 0.72;
      // the numbers, transliterated, each on a patch of smoothed clay: the
      // incised vertical diagonal stops short of them
      const fs = r < 56 ? 10 : 11;
      const f = fnt(fs, SERIF);
      const band = fs + 4;
      ctx.font = f;
      ctx.fillStyle = 'rgba(72, 62, 44, 1)';
      for (const [s, y0] of [['1;24,51,10', cy - 2 - band], ['42;25,35', cy + 2]]) {
        const w = ctx.measureText(s).width + 6;
        ctx.fillRect(cx - w / 2, y0, w, band);
      }
      ctx.lineJoin = 'round';
      const incise = () => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath();
        ctx.moveTo(cx - d, cy); ctx.lineTo(cx + d, cy);
        ctx.moveTo(cx, cy - d); ctx.lineTo(cx, cy - 2 - band);
        ctx.moveTo(cx, cy + 2 + band); ctx.lineTo(cx, cy + d);
      };
      incise();
      ctx.strokeStyle = 'rgba(10, 11, 16, 0.55)'; ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.strokeStyle = rgba(P.goldBright, 0.8); ctx.lineWidth = 1;
      ctx.stroke();
      label(ctx, '1;24,51,10', cx, cy - 4, { font: f, color: P.goldBright, align: 'center', base: 'bottom', halo: false });
      label(ctx, '42;25,35', cx, cy + 4, { font: f, color: P.goldBright, align: 'center', base: 'top', halo: false });
      ctx.save();
      ctx.translate(cx - d / 2, cy - d / 2); ctx.rotate(-Math.PI / 4);
      label(ctx, '30', 0, -3, { font: f, color: P.goldBright, align: 'center', base: 'bottom', halo: false });
      ctx.restore();
      label(ctx, 'c. 1800–1600 BCE', cx - r - 8, cy + r - 4, { font: fnt(11, SERIF, 'italic'), color: P.inkDim, align: 'right' });
      ctx.restore();
    }

    // Theon's table, filled in as the rungs are found (wide screens only)
    const LEDGER_ROWS = 8;
    function drawLedger(ctx, W) {
      const w = 236, x = W - w - 12, y = 48;
      const rowH = 19, h = 58 + LEDGER_ROWS * rowH + (proved ? 22 : 0);
      ctx.fillStyle = 'rgba(18, 20, 29, 0.9)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = rgba(P.gold, 0.28);
      ctx.lineWidth = 1;
      ctx.strokeRect(crisp(x), crisp(y), w - 1, h - 1);
      label(ctx, 'the ledger', x + 12, y + 20, { font: fnt(13.5, SERIF, 'italic'), color: P.gold, halo: false });
      label(ctx, `${found.size} found`, x + w - 12, y + 20, { font: fnt(10.5, MONO), color: FAINT, align: 'right', halo: false });
      const cq = x + 64, cp = x + 128, cm = x + w - 14;
      const hy = y + 40;
      label(ctx, 'q', cq, hy, { font: fnt(11.5, SERIF, 'italic'), color: FAINT, align: 'right', halo: false });
      label(ctx, 'p', cp, hy, { font: fnt(11.5, SERIF, 'italic'), color: FAINT, align: 'right', halo: false });
      label(ctx, 'p² − 2q²', cm, hy, { font: fnt(11.5, SERIF, 'italic'), color: FAINT, align: 'right', halo: false });
      ctx.strokeStyle = rgba(P.line, 1);
      ctx.beginPath(); ctx.moveTo(x + 10, crisp(hy + 6)); ctx.lineTo(x + w - 10, crisp(hy + 6)); ctx.stroke();
      for (let i = 0; i < LEDGER_ROWS; i++) {
        const yy = hy + 8 + (i + 1) * rowH - 4;
        const f = found.has(i);
        const isNew = i === latestRung;
        if (f) {
          const [pB, qB] = PELL[i];
          const col = isNew ? P.goldBright : P.gold;
          label(ctx, fmtN(qB), cq, yy, { font: fnt(11.5, MONO), color: col, align: 'right', halo: false });
          label(ctx, fmtN(pB), cp, yy, { font: fnt(11.5, MONO), color: col, align: 'right', halo: false });
          label(ctx, i % 2 ? '+1' : '−1', cm, yy, { font: fnt(11.5, MONO), color: col, align: 'right', halo: false });
        } else {
          for (const cx of [cq, cp, cm]) label(ctx, '·', cx - 3, yy, { font: fnt(11.5, MONO), color: GHOST, align: 'right', halo: false });
        }
      }
      if (proved) {
        label(ctx, 'and never 0', cm, hy + 8 + (LEDGER_ROWS + 1) * rowH, { font: fnt(12, SERIF, 'italic'), color: CRIMSON_T, align: 'right', halo: false });
      }
    }

    S1.onResize(() => { s1dirty = true; });
    updateMeter();

    ui.caption(stage,
      'Drag the marker, or tap a lattice point to plant it; drag the grid to pan; pinch, or click the ' +
      'grid and scroll, to zoom (arrow keys move the marker; u and d climb the ladder). The gold rungs ' +
      'lie on two hyperbolas, p² − 2q² = +1 and −1, which hug the √2 ray ever closer and never touch it. ' +
      'Proclus, in the fifth century CE, credited the rule that builds them to the Pythagoreans and ' +
      'called it an “elegant theorem”.');
    ui.legendPanel(stage,
      `<p>As the story goes, the discovery escaped, and the man who let it out, Hippasus of
      Metapontum, was drowned at sea for his impiety. It is a perfect story, which should already
      make us suspicious, and it is a splice. Iamblichus, writing around 300 CE, says Hippasus
      drowned for making public the dodecahedron. Of the man who revealed the incommensurable he
      tells two stories, without naming him: that he was expelled and a tomb built for him, as
      though he were dead, or that he too was drowned. Plutarch, two centuries earlier, knows only
      a scandal. No ancient source connects Hippasus with the irrational; modern scholars joined
      the tales. What the record supports is duller and stranger. The discovery was made by the
      late fifth century BCE, the Pythagorean communities lasted into the fourth, and Greek
      mathematics did not collapse. It grew teeth.</p>`);

    /* =====================================================================
       station 2 · the subtraction that cannot end
       ===================================================================== */

    title('ii', 'the subtraction that cannot end');
    const seg2 = document.createElement('div');
    seg2.className = 'dg-seg';
    stage.appendChild(seg2);
    const MODES = {
      int: { label: '15 and 9', a: [15n, 0n], b: [9n, 0n], kind: 'int' },
      a4: { label: 'an A4 sheet', a: [297n, 0n], b: [210n, 0n], kind: 'int', unit: ' mm' },
      sd: { label: 'a square', a: [0n, 1n], b: [1n, 0n], kind: 'sd' },
      phi: { label: 'a pentagon', a: [0n, 1n], b: [1n, 0n], kind: 'phi' },
    };
    const modeBtns = {};
    for (const k of Object.keys(MODES)) modeBtns[k] = ui.button(seg2, MODES[k].label, () => setMode2(k), { small: true });

    const S2 = surface(stage, (w) => (w >= 600 ? 310 : 150 + Math.min(w - 24, 240) + 24));
    S2.canvas.setAttribute('role', 'img');
    S2.canvas.setAttribute('aria-label', 'Two rods, the longer repeatedly shortened by the shorter, beside a figure of what each cut leaves: squares carved from a rectangle, a nest of half-squares, or pentagrams inside pentagons. The readout below gives the lengths.');
    const row2 = ui.controlRow(stage);
    const subBtn = ui.button(row2, '− subtract the shorter from the longer', doSubtract, { primary: true });
    const runBtn = ui.button(row2, 'let it run »', toggleRun, { small: true });
    const cfLine = ui.mathline(stage, '');
    const out2 = ui.readout(stage, '');
    ui.caption(stage,
      'Reciprocal subtraction, <em>anthyphairesis</em>, is the Euclidean algorithm done with rods, and ' +
      'Book X, Proposition 2 of the <em>Elements</em> makes it a test: if the remainder never measures ' +
      'the one before it, the magnitudes are incommensurable. On 15 and 9 it halts at their common ' +
      'measure. On an A4 sheet it halts too, at 3 millimetres, after spelling out √2’s own ' +
      '[1; 2, 2, 2, 2, 2]: the rounding to whole millimetres is what lets it stop. On a square’s ' +
      'diagonal and side every second cut leaves a smaller half-square, and on a regular pentagon ' +
      'the diagonals of each pentagon draw a smaller one inside it, forever.');
    ui.speculationPanel(stage,
      `<p>No ancient text tells us how incommensurability was found. In 1945 Kurt von Fritz argued
      for the regular pentagon, where mutual subtraction visibly never ends because, as he put it,
      the diameters of the pentagon form a new regular pentagon in the centre, and so on in an
      infinite process. Aristotle mentions in passing a definition of “the same ratio” by
      <em>antanairesis</em>, reciprocal subtraction, and many scholars read it as the trace of an
      early theory of proportion built on the very procedure above; David Fowler rebuilt such a
      theory in <em>The Mathematics of Plato’s Academy</em>. The even-and-odd proof may have come
      first, or the subtraction, or a picture. Each reconstruction fits the fragments, and none is
      attested. Younger still is the “foundational crisis” that popular histories attach to the
      moment. Paul Tannery sketched it in 1887, Helmut Hasse and Heinrich Scholz named it in 1928,
      and Wilbur Knorr, in a lecture of 1975, called it “a modern fiction”.</p>`);

    let mode2 = 'int';
    let rodA = { x: 15n, y: 0n }, rodB = { x: 9n, y: 0n };
    let anim2 = null;            // { rod: 'A'|'B', t, cut }
    let halted2 = false, capped2 = false;
    let terms2 = [], curCount = 0, subCount = 0;
    let S2px = 1, S2t = 1;       // rod scale, eased (the auto-zoom)
    let z2 = 0, z2t = 0;         // figure zoom, in scenes
    let runOn = false, runAcc = 0;
    let s2dirty = true;
    let origA = 15, origB = 9;
    const SUB_CAP = { sd: 25, phi: 24 };

    const kind2 = () => MODES[mode2].kind;
    // 15 and 9 keep one scale, so the halt shows against the original rods;
    // the A4 sheet and the irrational pairs zoom to keep the shrinking rods in view
    const rodScale = (L, va, vb) => (L.x1 - L.x0) / (mode2 === 'int' ? Math.max(origA, origB) : Math.max(va, vb));
    function val2(r) {
      const k = kind2();
      return k === 'sd' ? sdValue(r.x, r.y) : k === 'phi' ? phiValue(r.x, r.y) : Number(r.x);
    }
    const fmt2 = (r) => {
      const k = kind2();
      return k === 'sd' ? fmtSD(r.x, r.y) : k === 'phi' ? fmtPhi(r.x, r.y) : r.x.toString() + (MODES[mode2].unit || '');
    };

    function layout2() {
      const W = S2.width, H = S2.height;
      if (W >= 600) {
        const size = Math.min(H - 40, Math.floor(W * 0.36));
        const fig = { x: W - size - 22, y: (H - size) / 2, size };
        return { fig, x0: 26, x1: fig.x - 46, yA: H / 2 - 40, yB: H / 2 + 40, wide: true };
      }
      const size = Math.min(W - 24, 240);
      return { fig: { x: (W - size) / 2, y: 150, size }, x0: 16, x1: W - 16, yA: 50, yB: 112, wide: false };
    }

    function setMode2(m) {
      mode2 = m;
      for (const k of Object.keys(modeBtns)) setOn(modeBtns[k], k === m);
      const M = MODES[m];
      rodA = { x: M.a[0], y: M.a[1] };
      rodB = { x: M.b[0], y: M.b[1] };
      origA = val2(rodA); origB = val2(rodB);
      anim2 = null; halted2 = false; capped2 = false;
      terms2 = []; curCount = 0; subCount = 0;
      z2 = z2t = 0;
      runOn = false; runAcc = 0;
      setOn(runBtn, false);
      subBtn.disabled = false; runBtn.disabled = false;
      const L = layout2();
      S2px = S2t = (L.x1 - L.x0) / Math.max(origA, origB);
      refresh2();
      s2dirty = true;
    }

    function cfText() {
      const k = kind2();
      const name = mode2 === 'int' ? '15/9' : mode2 === 'a4' ? '297/210' : k === 'sd' ? '√2' : 'φ';
      if (!terms2.length) return `${name} = [ … ]`;
      const rest = terms2.slice(1).join(', ');
      if (halted2) {
        const g = anthyphairesis(MODES[mode2].a[0], MODES[mode2].b[0]).gcd;
        const red = `${MODES[mode2].a[0] / g}/${MODES[mode2].b[0] / g}`;
        return `${name} = ${red} = [${terms2[0]}; ${rest}]`;
      }
      return `${name} = [${terms2[0]};${rest ? ' ' + rest + ',' : ''} …]`;
    }

    function refresh2() {
      cfLine.innerHTML = cfText();
      const k = kind2();
      const u = MODES[mode2].unit || '';
      if (halted2) {
        const g = Number(rodA.x);
        out2.set(`The rods agree at ${g}${u}: the common measure. It fits ${origA / g} times into ${origA} and ${origB / g} times into ${origB}, ` +
          `so ${origA} : ${origB} = ${origA / g} : ${origB / g}. The algorithm halts after ${subCount} subtraction${subCount === 1 ? '' : 's'}.`);
      } else if (capped2) {
        out2.set(`${subCount} subtractions, ${Math.floor(subCount / 2)} scenes down, and the picture has not changed; it never will. ` +
          '(We must stop somewhere; the mathematics doesn’t.)');
      } else if (k === 'int') {
        const a = Number(rodA.x), b = Number(rodB.x);
        out2.set(subCount === 0
          ? `Two rods, ${a}${u} and ${b}${u}. Take the shorter from the longer, and repeat.`
          : `Now ${a}${u} and ${b}${u}: take the ${Math.min(a, b)} from the ${Math.max(a, b)}. (${subCount} so far.)`);
      } else {
        const a = val2(rodA), b = val2(rodB);
        const scene = Math.floor(subCount / 2);
        const f = k === 'sd' ? '(√2 − 1)' : '1/φ²';
        const tail = subCount === 0 ? 'Take the side from the diagonal.'
          : subCount % 2 === 0 ? `Scene ${scene}: a smaller ${k === 'sd' ? 'half-square' : 'pentagon'}, its sides shrunk by ${k === 'sd' ? `(√2 − 1)${sup(scene)}` : `(1/φ²)${sup(scene)}`}.`
            : `The leftover is marked in crimson; one more cut completes scene ${scene + 1}, ×${f}.`;
        out2.set(`Now ${fmt2(rodA)} ≈ ${a.toPrecision(6)} and ${fmt2(rodB)} ≈ ${b.toPrecision(6)}. ${tail}`);
      }
    }

    function doSubtract() {
      if (anim2 || halted2 || capped2) return;
      audio.ensureAudio();
      const va = val2(rodA), vb = val2(rodB);
      anim2 = { rod: va >= vb ? 'A' : 'B', t: 0, cut: Math.min(va, vb) };
      audio.drums.wood(bus, audioNow(), { level: 0.28, pitch: 560 + 70 * (curCount % 4) });
      s2dirty = true;
    }

    function commitSubtract() {
      const longer = anim2.rod === 'A' ? rodA : rodB;
      const shorter = anim2.rod === 'A' ? rodB : rodA;
      const next = { x: longer.x - shorter.x, y: longer.y - shorter.y };
      if (anim2.rod === 'A') rodA = next; else rodB = next;
      anim2 = null;
      curCount++; subCount++;
      const va = val2(rodA), vb = val2(rodB);
      const k = kind2();
      const equal = k === 'int' ? rodA.x === rodB.x : false;
      if (equal) {
        terms2.push(curCount + 1);        // Euclid would subtract once more to reach zero
        curCount = 0;
        halted2 = true; runOn = false; setOn(runBtn, false);
        subBtn.disabled = true; runBtn.disabled = true;
        audio.drums.thock(bus, audioNow(), { level: 0.5 });
        const g = Number(rodA.x);
        const hi = origA / g, lo = origB / g;
        audio.playTone(bus, { freq: 220, dur: 1.3, level: 0.24 });
        audio.playTone(bus, { freq: 220 * hi / lo, dur: 1.3, level: 0.24 });
      } else {
        const swapped = (next === rodA ? va < vb : vb < va);
        if (swapped) {
          terms2.push(curCount);
          curCount = 0;
          audio.drums.wood(bus, audioNow() + 0.02, { level: 0.2, pitch: 880 });
        }
        if (k !== 'int' && subCount >= SUB_CAP[k]) {
          capped2 = true; runOn = false; setOn(runBtn, false);
          subBtn.disabled = true; runBtn.disabled = true;
          audio.drums.thock(bus, audioNow(), { level: 0.4 });
        }
      }
      const L = layout2();
      S2t = rodScale(L, va, vb);
      if (k !== 'int') z2t = Math.floor(subCount / 2);
      refresh2();
      s2dirty = true;
    }

    function toggleRun() {
      if (halted2 || capped2) return;
      runOn = !runOn;
      setOn(runBtn, runOn);
      if (runOn) { audio.ensureAudio(); runAcc = 0.45; }
    }

    function step2(dt) {
      if (anim2) {
        anim2.t += dt / (RM ? 0.18 : 0.42);
        if (anim2.t >= 1) commitSubtract();
        s2dirty = true;
      }
      if (runOn && !anim2 && !halted2 && !capped2) {
        runAcc += dt;
        if (runAcc >= 0.55) { runAcc = 0; doSubtract(); }
      }
      if (Math.abs(S2t - S2px) > 1e-9 * S2t) {
        S2px = RM ? S2t : S2px * Math.pow(S2t / S2px, Math.min(1, dt * 4));
        if (Math.abs(S2t - S2px) < 1e-4 * S2t) S2px = S2t;
        s2dirty = true;
      }
      if (Math.abs(z2t - z2) > 1e-4) {
        z2 = RM ? z2t : z2 + (z2t - z2) * Math.min(1, dt * 3.2);
        if (Math.abs(z2t - z2) < 1e-3) z2 = z2t;
        s2dirty = true;
      }
    }

    function rodPath(ctx, x, y, w, h) {
      const r = Math.min(3, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
    const BRONZE = {
      gold: ['#f1d99a', P.gold, '#6e5b30'],
      azure: ['#b9cfea', '#6f93c0', '#33507a'],
    };
    function drawRod(ctx, x, y, w, tone, alpha = 1) {
      const h = 14;
      w = R(w);
      if (w <= 0) return;
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      const c = BRONZE[tone];
      g.addColorStop(0, c[0]); g.addColorStop(0.42, c[1]); g.addColorStop(1, c[2]);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      rodPath(ctx, x, y - h / 2, Math.max(1.5, w), h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      if (w > 6) { ctx.beginPath(); ctx.moveTo(x + 2, y - h / 2 + 2.5); ctx.lineTo(x + w - 2, y - h / 2 + 2.5); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    function draw2() {
      const { ctx, width: W, height: H } = S2;
      ctx.clearRect(0, 0, W, H);
      const L = layout2();
      const k = kind2();
      const va = val2(rodA), vb = val2(rodB);
      const pxA = va * S2px, pxB = vb * S2px;
      const x0 = L.x0;

      // names above the rods
      const names = () => {
        if (k === 'int') return ['', ''];
        if (subCount % 2 === 1 || anim2) return ['', ''];
        return va >= vb ? ['diagonal', 'side'] : ['side', 'diagonal'];
      };
      const [nA, nB] = names();
      for (const [y, r, nm, tone] of [[L.yA, rodA, nA, 'gold'], [L.yB, rodB, nB, 'azure']]) {
        label(ctx, fmt2(r), x0, y - 15, { font: fnt(12, MONO), color: tone === 'gold' ? P.goldBright : P.azure, halo: false });
        if (nm) {
          ctx.font = fnt(12, MONO);
          const off = ctx.measureText(fmt2(r)).width + 10;
          label(ctx, nm, x0 + off, y - 15, { font: fnt(12.5, SERIF, 'italic'), color: P.inkDim, halo: false });
        }
      }

      // ghosts of the original rods, tiled by the common measure (after a halt)
      if (halted2 && Math.max(origA, origB) * S2px <= L.x1 - L.x0 + 1) {
        const g = Number(rodA.x);
        for (const [y, len] of [[L.yA, origA], [L.yB, origB]]) {
          const w = len * S2px;
          ctx.strokeStyle = rgba(P.verdant, 0.55);
          ctx.lineWidth = 1;
          rodPath(ctx, x0 + 0.5, y + 12.5, R(w - 1), 6);
          ctx.stroke();
          ctx.beginPath();
          const n = Math.round(len / g);
          const every = Math.max(1, Math.ceil(4 / (g * S2px)));
          for (let i = 1; i < n; i += every) { const x = crisp(x0 + i * g * S2px); ctx.moveTo(x, y + 12); ctx.lineTo(x, y + 19); }
          ctx.stroke();
        }
      }

      // the rods (the one being cut is drawn short, and the off-cut falls away)
      const cutPx = anim2 ? anim2.cut * S2px : 0;
      const e = anim2 ? anim2.t : 0;
      drawRod(ctx, x0, L.yA, anim2 && anim2.rod === 'A' ? pxA - cutPx : pxA, 'gold');
      drawRod(ctx, x0, L.yB, anim2 && anim2.rod === 'B' ? pxB - cutPx : pxB, 'azure');
      if (anim2) {
        const y = anim2.rod === 'A' ? L.yA : L.yB;
        const keep = (anim2.rod === 'A' ? pxA : pxB) - cutPx;
        ctx.save();
        ctx.translate(x0 + keep + cutPx / 2 + e * 34, y + e * e * 16);
        ctx.rotate(e * 0.09);
        drawRod(ctx, -cutPx / 2, 0, cutPx, anim2.rod === 'A' ? 'gold' : 'azure', R(1 - e) * 0.9);
        ctx.restore();
      }

      // unit ticks, where units are wide enough to see
      if (k === 'int' && S2px >= 5 && !halted2) {
        ctx.strokeStyle = 'rgba(10, 11, 16, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [y, v] of [[L.yA, Number(rodA.x)], [L.yB, Number(rodB.x)]]) {
          for (let u = 1; u < v; u++) { const x = crisp(x0 + u * S2px); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); }
        }
        ctx.stroke();
      }

      // the bracket: what the next cut takes away
      if (!halted2 && !capped2 && !anim2 && Math.abs(pxA - pxB) > 0.5) {
        const longerA = va >= vb;
        const y = longerA ? L.yA : L.yB;
        const px = Math.max(pxA, pxB), cp = Math.min(pxA, pxB);
        ctx.strokeStyle = rgba(P.crimson, 0.8);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(crisp(x0 + px - cp), y + 10); ctx.lineTo(crisp(x0 + px - cp), y + 15);
        ctx.lineTo(crisp(x0 + px), y + 15); ctx.lineTo(crisp(x0 + px), y + 10);
        ctx.stroke();
      }
      if (halted2) {
        label(ctx, 'halts', L.x1, L.yA - 15, { font: fnt(13, SERIF, 'italic'), color: P.verdant, align: 'right', halo: false });
      }
      // how far the auto-zoom has carried us
      const mag = S2px / ((L.x1 - L.x0) / Math.max(origA, origB));
      if (mag > 1.5) {
        label(ctx, `magnified ×${mag < 10 ? mag.toFixed(1) : fmtN(Math.round(mag))}`, L.x1, L.yB - 15,
          { font: fnt(10.5, MONO), color: FAINT, align: 'right', halo: false });
      }

      // the figure
      const F = L.fig;
      ctx.save();
      ctx.beginPath(); ctx.rect(F.x, F.y, F.size, F.size); ctx.clip();
      ctx.fillStyle = 'rgba(22, 25, 37, 0.35)';
      ctx.fillRect(F.x, F.y, F.size, F.size);
      if (k === 'int') drawTiling(ctx, F);
      else if (k === 'sd') drawHalfSquares(ctx, F);
      else drawPentagrams(ctx, F);
      ctx.restore();
      ctx.strokeStyle = rgba(P.line, 1);
      ctx.lineWidth = 1;
      ctx.strokeRect(crisp(F.x), crisp(F.y), Math.round(F.size), Math.round(F.size));
      if (!L.wide) {
        // a hairline between rods and figure on phones
        ctx.strokeStyle = rgba(P.line, 0.6);
        ctx.beginPath(); ctx.moveTo(16, crisp(F.y - 14)); ctx.lineTo(W - 16, crisp(F.y - 14)); ctx.stroke();
      }
    }

    // integers: the rectangle is carved into squares, one per subtraction
    function drawTiling(ctx, F) {
      const a = origA, b = origB;
      const { squares, rest } = carveSquares(a, b, subCount);
      const s0 = (F.size - 26) / Math.max(a, b);
      const restLong = Math.max(rest.w, rest.h) || 1;
      const zoom = halted2 ? clamp((0.2 * Math.max(a, b)) / restLong, 1, 8) : clamp((0.3 * Math.max(a, b)) / restLong, 1, 8);
      const s = s0 * zoom;
      const f = 1 - 1 / zoom;
      const cx = lerp(a / 2, rest.x + rest.w / 2, f), cy = lerp(b / 2, rest.y + rest.h / 2, f);
      const X = (u) => F.x + F.size / 2 + (u - cx) * s;
      const Y = (v) => F.y + F.size / 2 + (v - cy) * s;
      ctx.fillStyle = 'rgba(10, 11, 16, 0.9)';
      ctx.fillRect(X(0), Y(0), a * s, b * s);
      squares.forEach((q, i) => {
        const tone = q.from === 'A' ? P.gold : P.azure;
        ctx.fillStyle = rgba(tone, i === squares.length - 1 && !halted2 ? 0.26 : 0.13);
        ctx.fillRect(X(q.x), Y(q.y), q.s * s, q.s * s);
        ctx.strokeStyle = rgba(tone, 0.75);
        ctx.lineWidth = 1;
        ctx.strokeRect(X(q.x) + 0.5, Y(q.y) + 0.5, R(q.s * s - 1), R(q.s * s - 1));
        const qcx = X(q.x) + (q.s * s) / 2, qcy = Y(q.y) + (q.s * s) / 2;
        if (q.s * s > 34 && qcx > F.x + 14 && qcx < F.x + F.size - 14 && qcy > F.y + 12 && qcy < F.y + F.size - 24) {
          label(ctx, String(q.s), qcx, qcy, { font: fnt(11, MONO), color: rgba(tone === P.gold ? P.goldBright : P.azure, 0.9), align: 'center', base: 'middle' });
        }
      });
      if (halted2) {
        ctx.fillStyle = rgba(P.verdant, 0.35);
        ctx.fillRect(X(rest.x), Y(rest.y), rest.w * s, rest.h * s);
        ctx.strokeStyle = P.verdant;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(X(rest.x), Y(rest.y), rest.w * s, rest.h * s);
      } else if (rest.w > 0 && rest.h > 0) {
        ctx.strokeStyle = rgba(P.crimson, 0.9);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(X(rest.x) + 0.5, Y(rest.y) + 0.5, R(rest.w * s - 1), R(rest.h * s - 1));
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 1;
      ctx.strokeRect(X(0), Y(0), a * s, b * s);
      const u = MODES[mode2].unit ? ' mm' : '';
      if (zoom < 1.3) {
        label(ctx, `${a}${u}`, X(a / 2), Y(0) - 5, { font: fnt(10.5, MONO), color: FAINT, align: 'center', base: 'bottom' });
      }
      label(ctx, halted2 ? `measure ${rest.w}${u}` : `${subCount} cut${subCount === 1 ? '' : 's'}`, F.x + 8, F.y + F.size - 8,
        { font: fnt(10.5, MONO), color: halted2 ? P.verdant : FAINT });
    }

    // √2: the nest of half-squares, each built from the leftover of the last
    const HS = halfSquareChain(40);
    function drawHalfSquares(ctx, F) {
      const w = (1 - Math.cos(Math.PI * z2)) / 2;                    // 0 on even scenes, 1 on odd
      const m = 1 + (SQ2 - 1) * w;                                   // odd scenes lie flatter
      const s = ((F.size * 0.74) * Math.pow(1 + SQ2, z2)) / m;
      const Cx = F.x + F.size * 0.9, Cy = F.y + F.size * (0.9 - 0.2 * w);
      const X = (u) => Cx + u * s, Y = (v) => Cy - v * s;
      const cur = Math.floor(subCount / 2);
      const lo = Math.max(0, Math.floor(z2) - 2);
      for (let n = lo; n < HS.length; n++) {
        const { A, B } = HS[n];
        const leg = Math.hypot(A[0] - B[0], A[1] - B[1]) * s;
        if (leg < 1.2) break;
        const past = n < cur, now = n === cur;
        const alpha = now ? 1 : past ? 0.4 : clamp(0.75 - 0.12 * (n - cur), 0.16, 0.75);
        ctx.globalAlpha = alpha;
        // faint fill
        ctx.fillStyle = rgba(P.gold, now ? 0.07 : 0.03);
        ctx.beginPath(); ctx.moveTo(X(A[0]), Y(A[1])); ctx.lineTo(X(B[0]), Y(B[1])); ctx.lineTo(Cx, Cy); ctx.closePath(); ctx.fill();
        // legs: the side
        ctx.strokeStyle = P.azure; ctx.lineWidth = now ? 1.8 : 1.1;
        ctx.beginPath(); ctx.moveTo(X(A[0]), Y(A[1])); ctx.lineTo(X(B[0]), Y(B[1])); ctx.lineTo(Cx, Cy); ctx.stroke();
        // hypotenuse: the diagonal
        ctx.strokeStyle = P.gold; ctx.lineWidth = now ? 1.8 : 1.1;
        ctx.beginPath(); ctx.moveTo(X(A[0]), Y(A[1])); ctx.lineTo(Cx, Cy); ctx.stroke();
        // the compass: mark the side off along the diagonal
        const E = [A[0] - A[0] / SQ2, A[1] - A[1] / SQ2];
        if (now || past) {
          const a0 = Math.atan2(-(B[1] - A[1]), B[0] - A[0]);
          const a1 = Math.atan2(-(0 - A[1]), 0 - A[0]);
          ctx.strokeStyle = rgba(P.ink, 0.35); ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          ctx.arc(X(A[0]), Y(A[1]), R(leg), a0, a0 + d, d < 0);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // the leftover of the diagonal, once it has been cut
        if (subCount >= 2 * n + 1 && n <= cur) {
          ctx.strokeStyle = CRIMSON_T; ctx.lineWidth = now ? 2.6 : 1.6;
          ctx.beginPath(); ctx.moveTo(X(E[0]), Y(E[1])); ctx.lineTo(Cx, Cy); ctx.stroke();
        }
        if (now && leg > 70) {
          const n2 = n % 2 === 0;
          // the side: upright scenes name the left leg from outside, clear of
          // the nest; tilted ones name the leg from B to C
          if (n2) {
            label(ctx, 'side', X(A[0]) - 8, (Y(A[1]) + Y(B[1])) / 2, { font: fnt(12, SERIF, 'italic'), color: P.azure, align: 'right', base: 'middle' });
          } else {
            const bx = (X(B[0]) + Cx) / 2, by = (Y(B[1]) + Cy) / 2;
            label(ctx, 'side', bx + 8, by - 4, { font: fnt(12, SERIF, 'italic'), color: P.azure, align: 'left', base: 'bottom' });
          }
          // the diagonal, named outside its hypotenuse
          const hx = (X(A[0]) + Cx) / 2, hy = (Y(A[1]) + Cy) / 2;
          if (n2) label(ctx, 'diagonal', hx + 9, hy - 7, { font: fnt(12, SERIF, 'italic'), color: P.goldBright, base: 'bottom' });
          else label(ctx, 'diagonal', hx, hy + 7, { font: fnt(12, SERIF, 'italic'), color: P.goldBright, align: 'center', base: 'top' });
        }
      }
      ctx.globalAlpha = 1;
      sceneTag(ctx, F, cur, `×(√2 − 1)${sup(cur)}`);
    }

    // φ: pentagrams inside pentagrams, von Fritz's candidate
    function drawPentagrams(ctx, F) {
      // centre the current pentagon's outline, point up on even scenes, down on odd
      const w = (1 - Math.cos(Math.PI * z2)) / 2;
      const cx = F.x + F.size / 2, cy = F.y + F.size / 2 + F.size * 0.044 * (1 - 2 * w);
      const R0 = F.size * 0.46 * Math.pow(PHI * PHI, z2);
      const cur = Math.floor(subCount / 2);
      const lo = Math.max(0, Math.floor(z2) - 1);
      for (let n = lo; n < 40; n++) {
        const r = R0 * Math.pow(PHI, -2 * n);
        if (r < 1.5) break;
        const th = -Math.PI / 2 + n * Math.PI / 5;
        const V = [];
        for (let i = 0; i < 5; i++) V.push([cx + r * Math.cos(th + (i * TAU) / 5), cy + r * Math.sin(th + (i * TAU) / 5)]);
        const now = n === cur;
        ctx.globalAlpha = now ? 1 : n < cur ? 0.35 : clamp(0.7 - 0.13 * (n - cur), 0.16, 0.7);
        ctx.strokeStyle = P.azure; ctx.lineWidth = now ? 1.7 : 1.1;
        ctx.beginPath(); V.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = P.gold; ctx.lineWidth = now ? 1.5 : 1;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = V[i], b = V[(i + 2) % 5]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
        if (now) {
          // one diagonal, and the stretch of it longer than a side
          const a = V[0], b = V[2];
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          if (subCount % 2 === 1) {
            const t = 1 / PHI;                        // side / diagonal
            ctx.strokeStyle = CRIMSON_T; ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(lerp(a[0], b[0], t), lerp(a[1], b[1], t)); ctx.lineTo(b[0], b[1]); ctx.stroke();
          }
          ctx.strokeStyle = P.azure; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(V[2][0], V[2][1]); ctx.lineTo(V[3][0], V[3][1]); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      sceneTag(ctx, F, cur, `×(1/φ²)${sup(cur)}`);
    }
    function sceneTag(ctx, F, cur, factor) {
      const o = { font: fnt(10.5, MONO), color: FAINT, align: 'right', pill: 'rgba(10, 11, 16, 0.82)' };
      label(ctx, `scene ${cur}`, F.x + F.size - 10, F.y + 18, o);
      if (cur > 0) label(ctx, factor, F.x + F.size - 10, F.y + 35, o);
    }

    S2.onResize(() => {
      const L = layout2();
      const va = val2(rodA), vb = val2(rodB);
      S2px = S2t = rodScale(L, va, vb);
      s2dirty = true;
    });

    /* =====================================================================
       station 3 · the cut that became a number
       ===================================================================== */

    title('iii', 'the cut that became a number');
    const S3 = surface(stage, (w) => (w >= 620 ? 250 : 300));
    S3.canvas.setAttribute('role', 'img');
    S3.canvas.setAttribute('aria-label', 'A number line near the square root of two, with fractions sorted into a less pile and a greater pile around a hidden cut. The readout below gives the current trap.');
    const row3 = ui.controlRow(stage);
    const dropBtn = ui.button(row3, 'sort the next fraction', dropNext, { primary: true });
    ui.button(row3, 'reset', reset3, { small: true });
    const tryBox = document.createElement('div');
    tryBox.className = 'dg-try';
    row3.appendChild(tryBox);
    const tryLab = document.createElement('label');
    tryLab.textContent = 'or sort your own';
    const tryIn = document.createElement('input');
    tryIn.className = 'dg-input';
    tryIn.type = 'text';
    tryIn.inputMode = 'numeric';
    tryIn.placeholder = 'e.g. 99/70';
    tryIn.setAttribute('aria-label', 'a fraction p/q to sort against the cut');
    tryIn.id = 'dg-try-input';
    tryLab.htmlFor = tryIn.id;
    tryBox.appendChild(tryLab);
    tryBox.appendChild(tryIn);
    ui.button(tryBox, 'sort it', () => sortOwn(), { small: true });
    tryIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sortOwn(); } });
    const out3 = ui.readout(stage, '');
    ui.caption(stage,
      'Book V of the <em>Elements</em>, a theory tradition credits to Eudoxus, declares two ratios equal ' +
      'when every whole-number ratio sorts the same way against both. Dedekind, in 1872, took the last ' +
      'step: a sorting with no fraction at its seam <em>is</em> a number. Listen as the fractions fall. ' +
      'After the first, the verdicts come in pairs, less, less, greater, greater: the twos of the second ' +
      'station, heard as a rhythm. The ringed fractions are Theon’s rungs. What a number <em>is</em> ' +
      'stays open until Movement III.');

    const CUT_CAP = 28;
    let lo3, hi3, landed3, chip3, view3, viewT3, s3dirty = true, auto3 = 0;

    function reset3() {
      lo3 = [1n, 1n]; hi3 = [2n, 1n];
      landed3 = [];
      chip3 = null;
      view3 = { a: 0.9, b: 2.1 };
      viewT3 = { a: 0.9, b: 2.1 };
      auto3 = 0;
      s3dirty = true;
      dropBtn.disabled = false;
      dropBtn.textContent = 'sort the next fraction';
      out3.set('Somewhere between 1/1 and 2/1 hides the diagonal. Sort fractions against it using whole-number arithmetic alone: is p² less or greater than 2q²?');
    }
    reset3();

    const isRungPQ = (p, q) => { const m = meter2(p, q); return m === 1n || m === -1n; };

    function landFraction(p, q, manual) {
      const s = meter2(p, q);
      const side = s < 0n ? 'less' : 'greater';
      const v = Number(p) / Number(q);
      const loV = Number(lo3[0]) / Number(lo3[1]), hiV = Number(hi3[0]) / Number(hi3[1]);
      let tightened = false;
      if (side === 'less' && v > loV) { lo3 = [p, q]; tightened = true; }
      if (side === 'greater' && v < hiV) { hi3 = [p, q]; tightened = true; }
      chip3 = { p, q, v, side, rung: isRungPQ(p, q), manual, t: RM ? 1 : 0 };
      if (RM) { landed3.push(chip3); chip3 = null; }
      audio.drums.wood(bus, audioNow(), { level: 0.22, pitch: side === 'less' ? 520 : 640 });
      const nl = Number(lo3[0]) / Number(lo3[1]), nh = Number(hi3[0]) / Number(hi3[1]);
      const pad = (nh - nl) * 0.85;
      viewT3 = { a: Math.min(nl - pad, v - (nh - nl) * 0.3), b: Math.max(nh + pad, v + (nh - nl) * 0.3) };
      if (manual && !tightened) viewT3 = { a: Math.min(view3.a, v - 0.05 * Math.abs(v)), b: Math.max(view3.b, v + 0.05 * Math.abs(v)) };
      s3dirty = true;
      return { s, side, tightened };
    }

    function trapText() {
      const width = Number(hi3[0]) / Number(hi3[1]) - Number(lo3[0]) / Number(lo3[1]);
      return `${lo3[0]}/${lo3[1]} < the cut < ${hi3[0]}/${hi3[1]} · trap width ${sci(width)}` +
        (width < 1e-4 ? ' · the two piles alone have pinned a point no fraction occupies' : '');
    }

    function dropNext() {
      if (chip3) return;
      audio.ensureAudio();
      const m = [lo3[0] + hi3[0], lo3[1] + hi3[1]];
      landFraction(m[0], m[1], false);
      auto3++;
      out3.set(trapText());
      if (auto3 >= CUT_CAP) {
        dropBtn.disabled = true;
        dropBtn.textContent = '…and so on, forever';
      }
    }

    function sortOwn() {
      if (chip3) { landed3.push(chip3); chip3 = null; }
      const f = parseFrac(tryIn.value);
      if (!f) { out3.set('Type a fraction of positive whole numbers, like 17/12 or 1393/985.'); return; }
      const [p, q] = f;
      if (landed3.some((d) => d.p * q === p * d.q)) { out3.set(`${p}/${q} has already been sorted.`); return; }
      audio.ensureAudio();
      const pp = p * p, qq = 2n * q * q;
      const r = landFraction(p, q, true);
      out3.set(`${p}² = ${fmtN(pp)} and 2 · ${q}² = ${fmtN(qq)}, so p² is ${r.side} than 2q²: ${p}/${q} goes on the ${r.side} pile` +
        `${r.tightened ? ' and tightens the trap' : ', outside the trap'}. ` + trapText());
    }

    function step3(dt) {
      let moving = false;
      if (chip3) {
        chip3.t += dt / 0.5;
        if (chip3.t >= 1) { landed3.push(chip3); chip3 = null; }
        moving = true;
      }
      const ease = RM ? 1 : Math.min(1, dt * 2.4);
      if (Math.abs(view3.a - viewT3.a) > 1e-15 || Math.abs(view3.b - viewT3.b) > 1e-15) {
        view3.a = lerp(view3.a, viewT3.a, ease);
        view3.b = lerp(view3.b, viewT3.b, ease);
        if (Math.abs(view3.a - viewT3.a) < 1e-4 * (viewT3.b - viewT3.a)) view3.a = viewT3.a;
        if (Math.abs(view3.b - viewT3.b) < 1e-4 * (viewT3.b - viewT3.a)) view3.b = viewT3.b;
        moving = true;
      }
      if (moving) s3dirty = true;
    }

    function layout3() {
      const W = S3.width, H = S3.height;
      if (W >= 620) return { wide: true, lx0: 150, lx1: W - 150, yLine: Math.round(H * 0.6), pileY: 34, rows: 7 };
      return { wide: false, lx0: 18, lx1: W - 18, yLine: H - 86, pileY: 28, rows: 4 };
    }

    function draw3() {
      const { ctx, width: W, height: H } = S3;
      ctx.clearRect(0, 0, W, H);
      const L = layout3();
      const span = Math.max(1e-300, view3.b - view3.a);
      const X = (v) => L.lx0 + ((v - view3.a) / span) * (L.lx1 - L.lx0);
      const y = L.yLine;

      // ticks sized to their labels
      let tick = niceStep((L.lx1 - L.lx0) / span, 1);
      const dec = (t) => Math.max(0, -Math.floor(Math.log10(t) + 1e-9));
      ctx.font = fnt(10, MONO);
      for (let guard = 0; guard < 8; guard++) {
        const wlab = ctx.measureText((view3.a + span / 2).toFixed(dec(tick))).width + 22;
        if (tick * ((L.lx1 - L.lx0) / span) >= wlab) break;
        tick = niceStep((L.lx1 - L.lx0) / span, wlab);
      }
      ctx.strokeStyle = rgba(P.inkDim, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.lx0 - 12, crisp(y)); ctx.lineTo(L.lx1 + 12, crisp(y)); ctx.stroke();
      const k0 = Math.ceil(view3.a / tick), k1 = Math.floor(view3.b / tick);
      if (k1 - k0 < 60) {
        for (let kk = k0; kk <= k1; kk++) {
          const v = kk * tick;
          const x = crisp(X(v));
          ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
          label(ctx, v.toFixed(dec(tick)), x, y + 9, { font: fnt(10, MONO), color: FAINT, align: 'center', base: 'top', halo: false });
        }
      }

      // the trap
      const loV = Number(lo3[0]) / Number(lo3[1]);
      const hiV = Number(hi3[0]) / Number(hi3[1]);
      const tx0 = clamp(X(loV), -10, W + 10), tx1 = clamp(X(hiV), -10, W + 10);
      const band = ctx.createLinearGradient(0, y - 30, 0, y);
      band.addColorStop(0, rgba(P.gold, 0));
      band.addColorStop(1, rgba(P.gold, 0.24));
      ctx.fillStyle = band;
      ctx.fillRect(tx0, y - 30, R(tx1 - tx0), 30);

      // the hidden cut
      const cx = X(SQ2);
      ctx.strokeStyle = P.crimson;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(crisp(cx), y - 40); ctx.lineTo(crisp(cx), y + 4); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, landed3.length >= 6 ? 'the cut: no fraction stands here' : 'the cut', clamp(cx, 90, W - 90), y - 45,
        { font: fnt(12.5, SERIF, 'italic'), color: CRIMSON_T, align: 'center', base: 'bottom' });

      // landed fractions
      for (const d of landed3) {
        const x = X(d.v);
        if (x < -20 || x > W + 20) continue;
        ctx.fillStyle = d.side === 'less' ? P.gold : P.azure;
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
        if (d.rung) {
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, 6.5, 0, TAU); ctx.stroke();
        }
      }
      // the current best from each side
      ctx.font = fnt(11.5, MONO);
      const lt = `${lo3[0]}/${lo3[1]} <`, ht = `< ${hi3[0]}/${hi3[1]}`;
      const lw = ctx.measureText(lt).width, hw = ctx.measureText(ht).width;
      let lx = clamp(tx0 - 6, lw + 4, W - 4), hx = clamp(tx1 + 6, 4, W - hw - 4);
      if (hx < lx + 10) { const mid = (lx + hx) / 2; lx = mid - 5; hx = mid + 5; }
      label(ctx, lt, lx, y + 30, { font: fnt(11.5, MONO), color: P.goldBright, align: 'right', base: 'top' });
      label(ctx, ht, hx, y + 30, { font: fnt(11.5, MONO), color: P.azure, base: 'top' });

      // falling chip
      if (chip3) {
        const x = X(chip3.v);
        const e = chip3.t * chip3.t;
        const yy = lerp(y - (L.wide ? 110 : 70), y, e);
        ctx.fillStyle = chip3.side === 'less' ? P.gold : P.azure;
        ctx.beginPath(); ctx.arc(clamp(x, 6, W - 6), yy, 4.5, 0, TAU); ctx.fill();
        label(ctx, `${chip3.p}/${chip3.q}`, clamp(x, 40, W - 40), yy - 9, { font: fnt(12, MONO), color: chip3.side === 'less' ? P.goldBright : P.azure, align: 'center', base: 'bottom' });
      }

      // the two piles
      const pile = (side) => landed3.filter((d) => d.side === side).slice().reverse();
      const drawPile = (side, x, align) => {
        const list = pile(side);
        const tone = side === 'less' ? P.goldBright : P.azure;
        const count = `· ${list.length}`;
        ctx.font = fnt(13.5, SERIF, 'italic');
        const nw = ctx.measureText(side).width;
        ctx.font = fnt(11, MONO);
        const cw = ctx.measureText(count).width;
        const wx = align === 'left' ? x : x - cw - 6;
        label(ctx, side, wx, L.pileY, { font: fnt(13.5, SERIF, 'italic'), color: tone, align, halo: false });
        label(ctx, count, align === 'left' ? x + nw + 6 : x, L.pileY, { font: fnt(11, MONO), color: FAINT, align, halo: false });
        list.slice(0, L.rows).forEach((d, i) => {
          const s = `${d.rung ? '✦ ' : ''}${d.p}/${d.q}`;
          label(ctx, s, x, L.pileY + 20 + i * 16, { font: fnt(11.5, MONO), color: tone, align, alpha: clamp(1 - i * 0.12, 0.35, 1), halo: false });
        });
        if (list.length > L.rows) label(ctx, '⋮', x, L.pileY + 20 + L.rows * 16, { font: fnt(11.5, MONO), color: FAINT, align, halo: false });
      };
      drawPile('less', 16, 'left');
      drawPile('greater', W - 16, 'right');
    }
    S3.onResize(() => { s3dirty = true; });

    /* =====================================================================
       station 4 · the sound of incommensurability
       ===================================================================== */

    title('iv', 'the sound of incommensurability');
    const S4 = surface(stage, (w) => (w >= 600 ? 330 : Math.min(w - 28, 250) + 12 + 24 + 104 + 30));
    S4.canvas.setAttribute('role', 'img');
    S4.canvas.setAttribute('aria-label', 'A Lissajous figure traced by the chosen ratio, closing for whole-number ratios and never closing for the square root of two, beside a window of the two waves and their sum. The readout below describes the ratio.');
    const row4 = ui.controlRow(stage);
    const playBtn4 = ui.button(row4, '♪ sound the ratio', togglePlay4, { primary: true });
    const RL = [...ladderRatios(5).map((r) => ({ ...r, irr: false })), { irr: true, label: '√2 : 1' }];
    const ratioBtns = RL.map((r, i) => ui.button(row4, r.label, () => setRatio(i), { small: true }));
    const fastBtn = ui.button(row4, '×10 »', () => { fast4 = !fast4; setOn(fastBtn, fast4); if (RM) staticSound(); }, { small: true });
    fastBtn.setAttribute('aria-label', 'ten times faster');
    setOn(fastBtn, false);
    const out4 = ui.readout(stage, '');
    ui.caption(stage,
      'Both pictures are drawn from the ratio you hear, slowed about five-hundredfold: x follows the ' +
      'lower tone, y the upper. A whole-number ratio closes the figure, and the ladder’s ratios close in ' +
      'ever more elaborate ones; √2 : 1 never closes, though it nearly does at every rung, and the crimson ' +
      'ticks mark by how much. The ear gives up before the mathematics does: at 41 : 29 the summed wave ' +
      'still repeats, fewer than eight times a second, yet the pair sits half a cent from √2. The first ' +
      'musical experiment on record that could actually have worked is credited to Hippasus himself: four ' +
      'bronze discs of equal diameter, their thicknesses in whole-number ratios, which sound the concords ' +
      'when struck. The chord falls silent as you leave; Movement II begins with the string that makes it.');

    let ri = 1;                     // current ratio index (start at 3 : 2)
    let rVal = 1.5, rClose = 2;     // numeric ratio; sweeps to closure (null = never)
    let tau4 = 0, closed4 = false;  // trace parameter, in x-sweeps
    let lastPt = null;
    let playing4 = false, fast4 = false;
    let vx = null, vy = null;
    let off4 = null, offCtx4 = null;      // accumulated Lissajous curve
    let scope4 = null, scopeCtx4 = null;  // static waveform window
    let L4 = 2;                           // scope window length in x-sweeps
    let flash4 = 0;                       // the closing flash
    let marks4 = [];                      // near-returns { q, p, miss }
    let static4 = false;                  // reduced motion: drawn once, not traced
    let s4dirty = true;
    const RATE4 = 0.45;                   // x-sweeps per second
    const NEAR = convergents(sqrt2Terms(9)).slice(1).map(([p, q]) => ({ p, q }));   // 3/2 … 577/408

    function lissGeom() {
      const W = S4.width, H = S4.height;
      if (W >= 600) {
        const size = Math.min(H - 28, Math.floor(W * 0.42));
        const lx = 14, ly = (H - size) / 2;
        const sx = lx + size + 28, sw = W - sx - 16;
        const sh = Math.min(Math.round(size * 0.66), 200);
        return { lx, ly, size, sx, sw, sh, sy: Math.round((H - sh) / 2) - 8, wide: true };
      }
      const size = Math.min(W - 28, 250);
      const lx = (W - size) / 2, ly = 12;
      return { lx, ly, size, sx: 14, sw: W - 28, sh: 104, sy: ly + size + 24, wide: false };
    }
    const lissR = (g) => R(g.size / 2 - 14);
    function lissPoint(t, g = lissGeom()) {
      const r = lissR(g);
      return [g.lx + g.size / 2 + Math.sin(TAU * t) * r, g.ly + g.size / 2 - Math.sin(TAU * rVal * t) * r];
    }

    function ensureSurfaces() {
      const g = lissGeom();
      const dpr = S4.dpr || 1;
      const need = Math.max(2, Math.round(g.size * dpr));
      if (!off4 || off4.width !== need) {
        off4 = document.createElement('canvas');
        off4.width = off4.height = need;
        offCtx4 = off4.getContext('2d');
        offCtx4.setTransform(dpr, 0, 0, dpr, 0, 0);
        retrace();
      }
      const sw = Math.max(2, Math.round(g.sw * dpr)), sh = Math.max(2, Math.round(g.sh * dpr));
      if (!scope4 || scope4.width !== sw || scope4.height !== sh) {
        scope4 = document.createElement('canvas');
        scope4.width = sw; scope4.height = sh;
        scopeCtx4 = scope4.getContext('2d');
        scopeCtx4.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScope();
      }
    }

    function strokeTrace(tA, tB, k = 1) {
      if (!offCtx4 || tB <= tA) return;
      const g = lissGeom();
      const c = offCtx4;
      const irr = rClose === null;
      c.save();
      c.globalCompositeOperation = irr ? 'lighter' : 'source-over';
      c.strokeStyle = P.gold;
      // the open curve starts bright and thins as its sweeps pile up
      c.globalAlpha = (irr ? clamp(0.62 / Math.sqrt(Math.max(1, tau4)), 0.24, 0.62) : 0.85) * k;
      c.lineWidth = irr ? 1.1 : 1.3;
      c.lineJoin = 'round';
      c.beginPath();
      const steps = Math.max(1, Math.ceil((tB - tA) * 180));
      const [x0, y0] = lissPoint(tA, g);
      c.moveTo(x0 - g.lx, y0 - g.ly);
      for (let s = 1; s <= steps; s++) {
        const [x, y] = lissPoint(tA + ((tB - tA) * s) / steps, g);
        c.lineTo(x - g.lx, y - g.ly);
      }
      c.stroke();
      c.restore();
    }

    // Re-render the trace (after a resize, and every few sweeps for √2). A
    // closing figure is drawn whole; the open one keeps an exposure of its last
    // EXPO sweeps, the oldest fading, so the weave never burns to a solid block.
    const EXPO = 40;
    let lastRetrace = 0;
    function retrace() {
      if (!offCtx4) return;
      const dpr = S4.dpr || 1;
      offCtx4.clearRect(0, 0, off4.width / dpr, off4.height / dpr);
      lastRetrace = tau4;
      if (tau4 <= 0) return;
      if (rClose !== null) { strokeTrace(0, Math.min(tau4, rClose)); return; }
      for (let a = Math.max(0, tau4 - EXPO); a < tau4; a += 1) {
        const b = Math.min(tau4, a + 1);
        strokeTrace(a, b, clamp(1 - (tau4 - b) / EXPO, 0.08, 1));
      }
    }

    function resetTrace() {
      tau4 = 0; closed4 = false; lastPt = null; flash4 = 0; marks4 = []; lastRetrace = 0;
      if (offCtx4) {
        const dpr = S4.dpr || 1;
        offCtx4.clearRect(0, 0, off4.width / dpr, off4.height / dpr);
      }
    }

    function drawScope() {
      if (!scopeCtx4) return;
      const dpr = S4.dpr || 1;
      const w = scope4.width / dpr, hh = scope4.height / dpr;
      const c = scopeCtx4;
      c.clearRect(0, 0, w, hh);
      const mid = hh / 2, amp = hh * 0.4;
      const N = Math.max(240, Math.min(1600, Math.round(L4 * 60)));
      const wave = (fn, color, lw, alpha) => {
        c.strokeStyle = color; c.lineWidth = lw; c.globalAlpha = alpha;
        c.beginPath();
        for (let i = 0; i <= N; i++) {
          const u = (i / N) * L4;
          const y = mid - fn(u) * amp;
          if (i) c.lineTo((i / N) * w, y); else c.moveTo(0, y);
        }
        c.stroke(); c.globalAlpha = 1;
      };
      c.strokeStyle = rgba(P.line, 0.8); c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, crisp(mid)); c.lineTo(w, crisp(mid)); c.stroke();
      wave((u) => Math.sin(TAU * u) * 0.5, P.goldDim, 1, 0.7);
      wave((u) => Math.sin(TAU * rVal * u) * 0.5, P.azureDim, 1, 0.7);
      wave((u) => (Math.sin(TAU * u) + Math.sin(TAU * rVal * u)) / 2, P.ink, 1.4, 0.95);
    }

    function setRatio(i) {
      ri = i;
      const r = RL[i];
      rVal = r.irr ? SQ2 : r.p / r.q;
      rClose = r.irr ? null : r.q;
      L4 = r.irr ? 8 : Math.max(r.q, 2);
      ratioBtns.forEach((b, j) => setOn(b, j === i));
      resetTrace();
      drawScope();
      if (playing4 && vy) vy.setFreq(220 * rVal, 0.08);
      const c = cents(rVal / SQ2);
      out4.set(r.irr
        ? '√2 : 1 = 1.41421…, the equal-tempered tritone. The summed wave never repeats; the figure never closes.'
        : `${r.label} = ${rVal.toFixed(5)}, ${c > 0 ? '+' : '−'}${Math.abs(c).toFixed(c > -1 && c < 1 ? 2 : 1)} ¢ from √2. ` +
          `The summed wave repeats ${220 / r.q >= 20 ? Math.round(220 / r.q) : (220 / r.q).toFixed(1)} times a second; the figure closes after ${r.q} sweep${r.q === 1 ? '' : 's'}.`);
      if (RM) staticSound();
      s4dirty = true;
    }

    // reduced motion: draw the figure whole, once
    function staticSound() {
      static4 = true;
      ensureSurfaces();
      resetTrace();
      if (rClose !== null) { tau4 = rClose; closed4 = true; strokeTrace(0, rClose); }
      else {
        tau4 = 60;
        retrace();
        marks4 = NEAR.filter((n) => n.q <= 60).map((n) => ({ ...n, miss: lissMiss(n.q) }));
      }
      s4dirty = true;
    }

    function togglePlay4() {
      audio.ensureAudio();
      playing4 = !playing4;
      if (playing4 && !vx) {
        vx = audio.voice(bus, { freq: 220, level: 0.2 });
        vy = audio.voice(bus, { freq: 220 * rVal, level: 0.2 });
      }
      if (playing4) {
        vy.setFreq(220 * rVal, 0.03);
        vx.on(); vy.on();
      } else if (vx) {
        vx.off(); vy.off();
      }
      playBtn4.textContent = playing4 ? '■ silence' : '♪ sound the ratio';
      playBtn4.classList.toggle('active', playing4);
    }
    // stop the voices without touching the AudioContext (safe inside pause)
    function stopPlay4() {
      if (!playing4) return;
      playing4 = false;
      if (vx) { vx.off(); vy.off(); }
      playBtn4.textContent = '♪ sound the ratio';
      playBtn4.classList.remove('active');
    }

    function step4(dt) {
      ensureSurfaces();
      if (flash4 > 0) { flash4 = Math.max(0, flash4 - dt / 0.7); s4dirty = true; }
      if (static4) return;
      const tNew = tau4 + dt * RATE4 * (fast4 ? 10 : 1);
      if (!closed4) {
        const end = rClose !== null ? Math.min(tNew, rClose) : tNew;
        strokeTrace(tau4, end);
        if (rClose !== null && tNew >= rClose) { closed4 = true; flash4 = 1; }
        if (rClose === null) {
          for (const n of NEAR) if (tau4 < n.q && tNew >= n.q) marks4.push({ ...n, miss: lissMiss(n.q) });
        }
      }
      tau4 = tNew;
      if (rClose === null && tau4 - lastRetrace >= 2) retrace();
      s4dirty = true;
    }

    function draw4() {
      const { ctx, width: W, height: H } = S4;
      ctx.clearRect(0, 0, W, H);
      const g = lissGeom();
      const dpr = S4.dpr || 1;

      // the Lissajous plate
      ctx.fillStyle = 'rgba(22, 25, 37, 0.35)';
      ctx.fillRect(g.lx, g.ly, g.size, g.size);
      ctx.strokeStyle = rgba(P.line, 1);
      ctx.lineWidth = 1;
      ctx.strokeRect(crisp(g.lx), crisp(g.ly), Math.round(g.size), Math.round(g.size));
      const cxm = g.lx + g.size / 2, cym = g.ly + g.size / 2;
      ctx.strokeStyle = rgba(P.line, 0.55);
      ctx.beginPath();
      ctx.moveTo(crisp(cxm), g.ly + 6); ctx.lineTo(crisp(cxm), g.ly + g.size - 6);
      ctx.moveTo(g.lx + 6, crisp(cym)); ctx.lineTo(g.lx + g.size - 6, crisp(cym));
      ctx.stroke();
      if (off4) ctx.drawImage(off4, 0, 0, off4.width, off4.height, g.lx, g.ly, g.size, g.size);

      // the closing flash: the whole closed curve, once, in bright gold
      if (flash4 > 0 && rClose !== null) {
        ctx.save();
        ctx.globalAlpha = 0.9 * flash4;
        ctx.strokeStyle = P.goldBright;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const N = Math.min(6000, Math.ceil(rClose * 180));
        for (let i = 0; i <= N; i++) {
          const [x, y] = lissPoint((i / N) * rClose, g);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // near-returns at the rungs: back at x = start, missing in y
      if (rClose === null && marks4.length) {
        const r = lissR(g);
        ctx.strokeStyle = CRIMSON_T;
        ctx.lineWidth = 1.4;
        for (const m of marks4) {
          const [, yq] = lissPoint(m.q, g);
          ctx.beginPath(); ctx.moveTo(cxm - 6, yq); ctx.lineTo(cxm + 6, yq); ctx.stroke();
        }
        const last = marks4[marks4.length - 1];
        const [, yl] = lissPoint(last.q, g);
        ctx.strokeStyle = rgba(P.crimson, 0.7);
        ctx.beginPath(); ctx.moveTo(cxm + 9, cym); ctx.lineTo(cxm + 9, yl); ctx.stroke();
        const px = last.miss * r;
        const ty = Math.min(cym, yl) - 4;
        label(ctx, `${last.p} : ${last.q}`, cxm + 16, ty - 3, { font: fnt(11, MONO), color: CRIMSON_T, base: 'bottom', pill: 'rgba(10, 11, 16, 0.86)' });
        label(ctx, `missed by ${px < 10 ? px.toFixed(1) : Math.round(px)} px`, cxm + 16, ty + 3, { font: fnt(11.5, SERIF, 'italic'), color: CRIMSON_T, base: 'top', pill: 'rgba(10, 11, 16, 0.86)' });
      }
      // the start
      ctx.strokeStyle = rgba(P.ink, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cxm, cym, 3.5, 0, TAU); ctx.stroke();

      // the moving head
      if (!static4) {
        const [hx, hy] = lissPoint(tau4, g);
        spriteLit.draw(ctx, hx, hy, 0.62);
        ctx.fillStyle = P.goldBright;
        ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, TAU); ctx.fill();
      }

      // status in the corner of the plate
      const PILL = 'rgba(10, 11, 16, 0.86)';
      if (closed4) label(ctx, `closed after ${rClose} sweep${rClose === 1 ? '' : 's'} ✓`, g.lx + 10, g.ly + 9, { font: fnt(11, MONO), color: P.verdant, base: 'top', pill: PILL });
      else if (rClose === null) label(ctx, tau4 > 8 ? `open after ${Math.floor(tau4)} sweeps` : 'open', g.lx + 10, g.ly + 9, { font: fnt(11, MONO), color: CRIMSON_T, base: 'top', pill: PILL });
      else label(ctx, `${Math.floor(tau4)} of ${rClose} sweeps`, g.lx + 10, g.ly + 9, { font: fnt(11, MONO), color: FAINT, base: 'top', pill: PILL });
      label(ctx, `${RL[ri].label}`, g.lx + g.size - 10, g.ly + g.size - 10, { font: fnt(12, MONO), color: P.goldBright, align: 'right', pill: PILL });

      // the scope: a fixed window of both waves and their sum, with a playhead
      if (scope4) {
        const sh = scope4.height / dpr;
        ctx.fillStyle = 'rgba(22, 25, 37, 0.35)';
        ctx.fillRect(g.sx, g.sy, g.sw, sh);
        ctx.drawImage(scope4, 0, 0, scope4.width, scope4.height, g.sx, g.sy, g.sw, sh);
        ctx.strokeStyle = rgba(P.line, 1);
        ctx.lineWidth = 1;
        ctx.strokeRect(crisp(g.sx), crisp(g.sy), Math.round(g.sw), Math.round(sh));
        if (!static4) {
          const u = ((tau4 % L4) / L4) * g.sw;
          ctx.strokeStyle = rgba(P.gold, 0.6);
          ctx.beginPath(); ctx.moveTo(crisp(g.sx + u), g.sy); ctx.lineTo(crisp(g.sx + u), g.sy + sh); ctx.stroke();
        }
        const yb = g.sy + sh + 8;
        if (rClose !== null) {
          ctx.strokeStyle = rgba(P.verdant, 0.8);
          ctx.beginPath(); ctx.moveTo(g.sx + 0.5, yb); ctx.lineTo(g.sx + 0.5, yb + 5); ctx.lineTo(g.sx + g.sw - 0.5, yb + 5); ctx.lineTo(g.sx + g.sw - 0.5, yb); ctx.stroke();
          label(ctx, `one period: ${rClose} sweep${rClose === 1 ? '' : 's'} of the lower tone`, g.sx + g.sw / 2, yb + 9, { font: fnt(12, SERIF, 'italic'), color: P.inkDim, align: 'center', base: 'top', halo: false });
        } else {
          label(ctx, 'no window holds a repeat', g.sx + g.sw / 2, yb + 4, { font: fnt(12, SERIF, 'italic'), color: CRIMSON_T, align: 'center', base: 'top', halo: false });
        }
        label(ctx, 'lower', g.sx + 6, g.sy + 6, { font: fnt(10, MONO), color: P.gold, base: 'top', alpha: 0.9 });
        label(ctx, 'upper', g.sx + 48, g.sy + 6, { font: fnt(10, MONO), color: P.azure, base: 'top', alpha: 0.9 });
        label(ctx, 'sum', g.sx + 90, g.sy + 6, { font: fnt(10, MONO), color: P.ink, base: 'top', alpha: 0.9 });
      }
    }
    S4.onResize(() => { off4 = null; scope4 = null; ensureSurfaces(); if (static4) staticSound(); s4dirty = true; });

    /* ================= shared loop & lifecycle ================= */

    setMode2('int');
    setRatio(1);
    if (RM) staticSound();

    const loop = cv.rafLoop((dt) => {
      stepLattice(dt);
      if (s1dirty) { s1dirty = false; drawLattice(); }
      step2(dt);
      if (s2dirty) { s2dirty = false; draw2(); }
      step3(dt);
      if (s3dirty) { s3dirty = false; draw3(); }
      step4(dt);
      if (s4dirty) { s4dirty = false; draw4(); }
    });
    loop.start();

    return {
      pause() {
        loop.stop();
        stopPlay4();
        runOn = false;
        setOn(runBtn, false);
        pts.clear(); drag1 = null; tap = null;
        bus.mute();
      },
      resume() {
        bus.unmute();
        s1dirty = s2dirty = s3dirty = s4dirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopPlay4();
        if (vx) { vx.dispose(); vy.dispose(); vx = vy = null; }
        bus.dispose();
        if (mql && mql.removeEventListener) mql.removeEventListener('change', onRM);
        for (const s of surfaces) s.destroy();
        style.remove();
      },
    };
  },
};

/* ================= node-testable exports ================= */

export const _test = {
  meter2,
  anthyphairesis,
  cfOfRatio,
  sqrt2Terms,
  sdValue,
  fmtSD,
  cutSteps,
  pellPairs,
  convergents,
  phiValue,
  fmtPhi,
  ladderUp,
  ladderDown,
  descentPicture,
  halfSquareChain,
  carveSquares,
  WITNESSES,
  niceStep,
  sci,
  sup,
  parseFrac,
  lissMiss,
  ladderRatios,
  run: selfTest,
};
