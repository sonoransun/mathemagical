// I — Sixty
// Sexagesimal place value: two wedges, fifty-nine digits, no zero, no mark for
// where the whole numbers end; reciprocal tables and the regular numbers;
// Plimpton 322 — Pythagorean triples twelve centuries before Pythagoras — and
// the half-square that no whole-number row can hold.
//
// Sources checked at build time (September 2026): E. Robson, “Words and
// Pictures: New Light on Plimpton 322”, Amer. Math. Monthly 109 (2002)
// 105–120 (dating, headings, Figs. 3–4, reciprocal pairs, “teachers’ problem
// lists”); O. Neugebauer, The Exact Sciences in Antiquity (Dover 1969) §11 and
// note ad 14 (the zero sign); D. E. Knuth, “Ancient Babylonian Algorithms”,
// CACM 15 (1972) 671–677; C. Proust, “Floating calculation in Mesopotamia”
// (arXiv 2302.13607); R. K. Englund, “Proto-Cuneiform Account-Books and
// Journals” (CDLI 2004); Fowler & Robson, Historia Math. 25 (1998) on YBC 7289;
// the Wikipedia “Plimpton 322” transliteration table as a cross-check.

import {
  digitsInBase, baseExpansion, isRegular, gcdBig, formatBig, TAU,
} from '../../core/math.js';

/* ================= pure data & logic (node-testable) ================= */

// Plimpton 322 (Old Babylonian, probably Larsa; Robson dates it 1822–1784 BCE).
// Columns II (short side s) and III (diagonal d) in tablet order, corrected.
// `sw` / `dw` record what the clay ACTUALLY writes where that differs; `cIw`
// is column I as written where it differs from the computed (d/l)², with
// `cIbad` the indices of the wrong places; `lost` counts the places of column
// I (after the leading 1, which every row has lost) that the break has taken
// (Robson 2002, Fig. 3). Row 15 follows Robson's correction (56 → 28); the
// other possible correction (53 → 1,46, Neugebauer) is kept in `alt`.
// The shell's Movement I backdrop reads { row, s, d } from this array.
export const PLIMPTON_ROWS = [
  { row: 1, s: 119n, d: 169n, lost: 1 },
  { row: 2, s: 3367n, d: 4825n, dw: 11521n, lost: 2,
    cIw: [1, 56, 56, 58, 14, 56, 15], cIbad: [5],
    note: 'Two slips. Column III writes 3,12,1 (11,521) where 1,20,25 (4,825) belongs, and column I runs 50 and 6 together as 56.' },
  { row: 3, s: 4601n, d: 6649n, lost: 2 },
  { row: 4, s: 12709n, d: 18541n },
  { row: 5, s: 65n, d: 97n },
  { row: 6, s: 319n, d: 481n },
  { row: 7, s: 2291n, d: 3541n },
  { row: 8, s: 799n, d: 1249n, colIErr: true,
    cIw: [1, 41, 33, 59, 3, 45], cIbad: [3],
    note: 'Column I writes 59 where 45,14 belongs: the sum of the two places, perhaps a slip in the calculation behind it.' },
  { row: 9, s: 481n, d: 769n, sw: 541n,
    note: 'The clay writes 9,1 (541) for 8,1 (481): one wedge too many, a copying slip.' },
  { row: 10, s: 4961n, d: 8161n },
  { row: 11, s: 45n, d: 75n,
    note: '45 and 1,15 share a factor of 15. Read as ;45 and 1;15 they are the (3, 4, 5) triangle scaled to a long side of 1.' },
  { row: 12, s: 1679n, d: 2929n },
  { row: 13, s: 161n, d: 289n, sw: 25921n,
    note: 'The clay writes 7,12,1 (25,921) where 2,41 (161) belongs, and 25,921 = 161²: a square copied where its root belonged.' },
  { row: 14, s: 1771n, d: 3229n },
  { row: 15, s: 28n, d: 53n, sw: 56n, alt: { s: 56n, d: 106n, dw: 53n },
    note: 'The clay writes 56 and 53, which is no triple. Halve 56 to 28 (Robson) and it is (28, 45, 53); double 53 to 1,46 (Neugebauer) and it is (56, 90, 106). Either way, the same shape.' },
];

// Column I as it should read, (d/l)² with the leading 1, transcribed from
// Robson 2002 Fig. 3 / the Wikipedia table — checked against the computation.
const COL_I_SOURCE = [
  '1;59,00,15', '1;56,56,58,14,50,06,15', '1;55,07,41,15,33,45', '1;53,10,29,32,52,16',
  '1;48,54,01,40', '1;47,06,41,40', '1;43,11,56,28,26,40', '1;41,33,45,14,03,45',
  '1;38,33,36,36', '1;35,10,02,28,27,24,26,40', '1;33,45', '1;29,21,54,02,15',
  '1;27,00,03,45', '1;25,48,51,35,06,40', '1;23,13,46,40',
];

// The reciprocal pairs Robson (Fig. 4) restores on the lost left part.
const PAIRS_SOURCE = { 1: ['2;24', '0;25'], 2: ['2;22,13,20', '0;25,18,45'], 15: ['1;48', '0;33,20'] };

// YBC 7289's √2, 1;24,51,10 = 305,470 / 216,000.
export const YBC_SQRT2 = { num: 305470n, den: 216000n, sex: '1;24,51,10', diag30: '42;25,35' };

// Integer square root of a non-negative BigInt (Newton), exact-checkable.
export function isqrtBig(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

// Long side l with s² + l² = d², or null if d² − s² is not a perfect square.
export function longSideOf(s, d) {
  const m = d * d - s * s;
  if (m <= 0n) return null;
  const r = isqrtBig(m);
  return r * r === m ? r : null;
}

// Neugebauer–Sachs generating pair: p > q with s : l : d = p²−q² : 2pq : p²+q²
// (allowing a common scale factor, needed for row 11's 15×(3,4,5)).
export function pqOf(s, d) {
  const attempt = (S, D) => {
    if ((D + S) % 2n !== 0n) return null;
    const a = (D + S) / 2n, b = (D - S) / 2n;
    const p = isqrtBig(a), q = isqrtBig(b);
    return (p * p === a && q * q === b && q > 0n) ? { p, q } : null;
  };
  let r = attempt(s, d), scale = 1n;
  if (!r) {
    const g = gcdBig(s, d);
    if (g > 1n) { r = attempt(s / g, d / g); scale = g; }
  }
  return r ? { p: r.p, q: r.q, scale } : null;
}

// The reciprocal pair behind a row (Bruins; Robson): x = (d+s)/l and
// 1/x = (d−s)/l, each in lowest terms. x·(1/x) = (d²−s²)/l² = 1, and
// s/l = (x − 1/x)/2, d/l = (x + 1/x)/2. In lowest terms x = p/q, so the same
// numbers give Neugebauer's generating pair for every row, row 15 included.
export function recipPair(s, d) {
  s = BigInt(s); d = BigInt(d);
  const l = longSideOf(s, d);
  if (l === null) return null;
  const g1 = gcdBig(d + s, l), g2 = gcdBig(d - s, l);
  return { l, x: [(d + s) / g1, l / g1], xi: [(d - s) / g2, l / g2] };
}

// Sexagesimal digits of a BigInt, most significant first.
export function sexOf(x) { return digitsInBase(BigInt(x), 60); }
export function sexStr(x) { return sexOf(x).join(','); }

// "1;59,00,15"-style string for n/d in base 60 (fraction places zero-padded;
// no semicolon when there is no fraction; an empty integer part for n < d).
export function fracSexStr(n, d, maxD = 16) {
  n = BigInt(n); d = BigInt(d);
  const int = n / d, rem = n % d;
  const e = baseExpansion(rem, d, 60, maxD);
  const ip = int > 0n ? sexOf(int).join(',') : '';
  const fp = e.digits.map((x) => String(x).padStart(2, '0')).join(',');
  return ip + (fp ? ';' + fp : '') + (e.terminates ? '' : '…');
}
// The same, with an explicit 0 before the semicolon: "0;25".
export function sexDisp(n, d) {
  const s = fracSexStr(n, d);
  return s.startsWith(';') ? '0' + s : s;
}

// Column I, (d/l)², as sexagesimal places: [1, f1, f2, …].
export function colIDigits(s, d) {
  s = BigInt(s); d = BigInt(d);
  const l = longSideOf(s, d);
  const num = d * d, den = l * l;
  const e = baseExpansion(num % den, den, 60, 16);
  return [Number(num / den), ...e.digits];
}

// All readings of a row of stamped columns. cells: [{v: 0..59, ph: bool}],
// leftmost first. Interior empty columns without a placeholder are ambiguous:
// each may be a real (zero) place or mere spacing. Returns the distinct base
// values (before the ×60^k magnitude ambiguity, which never goes away).
export function interpretations(cells) {
  const marked = cells.map((c, i) => ({ v: c.v || 0, ph: !!c.ph, i }))
    .filter((c) => c.v > 0 || c.ph);
  if (!marked.length) return { baseValues: [], gaps: 0 };
  const lo = marked[0].i, hi = marked[marked.length - 1].i;
  const span = cells.slice(lo, hi + 1).map((c) => ({ v: c.v || 0, ph: !!c.ph }));
  const gapIdx = [];
  span.forEach((c, j) => { if (!c.ph && c.v === 0) gapIdx.push(j); });
  const vals = new Set();
  for (let m = 0; m < (1 << gapIdx.length); m++) {
    let v = 0n;
    span.forEach((c, j) => {
      const gi = gapIdx.indexOf(j);
      if (gi >= 0 && !((m >> gi) & 1)) return;   // this gap read as spacing
      v = v * 60n + BigInt(c.v);
    });
    vals.add(v.toString());
  }
  const baseValues = [...vals].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { baseValues, gaps: gapIdx.length };
}

// Every full reading of the stamped columns, with the power of sixty that
// each column carries in it (null = an empty column read as mere spacing,
// undefined = outside the number). `scales` lists the ×60^k shifts tried.
// Sorted by value. The stamping table cycles through these.
export function readings(cells, scales = [-1, 0, 1, 2]) {
  const n = cells.length;
  const idx = [];
  cells.forEach((c, i) => { if ((c.v || 0) > 0 || c.ph) idx.push(i); });
  if (!idx.length) return [];
  const lo = idx[0], hi = idx[idx.length - 1];
  const gaps = [];
  for (let i = lo; i <= hi; i++) if (!cells[i].ph && !((cells[i].v || 0) > 0)) gaps.push(i);
  const out = [], seen = new Set();
  for (let m = 0; m < (1 << gaps.length); m++) {
    const base = new Array(n).fill(undefined);
    let p = 0, v = 0n;
    for (let i = hi; i >= lo; i--) {
      const gi = gaps.indexOf(i);
      if (gi >= 0 && !((m >> gi) & 1)) { base[i] = null; continue; }
      base[i] = p;
      v += BigInt(cells[i].v || 0) * 60n ** BigInt(p);
      p++;
    }
    for (const k of scales) {
      const num = k >= 0 ? v * 60n ** BigInt(k) : v;
      const den = k >= 0 ? 1n : 60n ** BigInt(-k);
      const g = gcdBig(num, den) || 1n;
      const key = (num / g) + '/' + (den / g);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ num, den, k, powers: base.map((q) => (q == null ? q : q + k)) });
    }
  }
  out.sort((a, b) => { const x = a.num * b.den, y = b.num * a.den; return x < y ? -1 : x > y ? 1 : 0; });
  return out;
}

// Canonical wedge layout for a digit 1..59: corner wedges (tens) left,
// vertical wedges (units) right, rows of three. Unit-square coordinates.
export function digitGroup(v) {
  const t = Math.floor(v / 10), u = v % 10;
  const marks = [];
  const tRows = Math.ceil(t / 3), uRows = Math.ceil(u / 3);
  const tCols = Math.min(t, 3), uCols = Math.min(u, 3);
  const TW = 0.56, TH = 0.46, UW = 0.36, UH = 0.78, UROW = 0.34;
  for (let i = 0; i < t; i++) {
    const r = Math.floor(i / 3), n = Math.min(3, t - r * 3), c = i - r * 3;
    const off = (tCols - n) * TW / 2;                 // center short rows
    marks.push({ g: 't', x: off + c * TW, y: r * (TH + 0.06) });
  }
  const ux0 = t ? tCols * TW + 0.16 : 0;
  for (let i = 0; i < u; i++) {
    const r = Math.floor(i / 3), n = Math.min(3, u - r * 3), c = i - r * 3;
    const off = (uCols - n) * UW / 2;
    marks.push({ g: 'u', x: ux0 + off + c * UW, y: r * UROW });
  }
  const w = u ? ux0 + uCols * UW : tCols * TW;
  const h = Math.max(tRows * (TH + 0.06), u ? UH + (uRows - 1) * UROW : 0, 0.5);
  return { marks, w, h };
}

export function factorize(n) {
  const out = [];
  for (let p = 2; p * p <= n; p++) while (n % p === 0) { out.push(p); n /= p; }
  if (n > 1) out.push(n);
  return out;
}

// Does 1/b terminate in base `base`?  (b's primes all divide the base.)
export function terminatesIn(b, base) { return baseExpansion(1, b, base, 64).terminates; }

// Knuth (1972) counts "exactly 231" regular numbers of at most six sexagesimal
// places whose first place is 1 or 2. (His letter in CACM 19(2), 1976, corrects
// the claim that Inakibit-Anu's table holds all of them, so the page no longer
// makes it; the count itself is plain arithmetic and is checked here.)
export function regularMantissas(maxPlaces = 6, leads = [1, 2]) {
  const set = new Set();
  const lim = 60n ** BigInt(maxPlaces);
  // every mantissa has a representative not divisible by 60, below 60^maxPlaces
  for (let pa = 1n; pa < lim * 60n; pa *= 2n) {
    for (let pb = pa; pb < lim * 60n; pb *= 3n) {
      for (let pc = pb; pc < lim * 60n; pc *= 5n) {
        let x = pc;
        while (x % 60n === 0n) x /= 60n;
        const dg = sexOf(x);
        if (dg.length <= maxPlaces && leads.includes(dg[0])) set.add(x.toString());
      }
    }
  }
  return set.size;
}

// Robson's reading of a row, step by step (Robson 2002, §4): a regular
// reciprocal pair x, 1/x; half their difference and half their sum, the short
// side and diagonal of a triangle whose long side is 1; the square of the
// half-sum, which is column I, "from which 1 is torn out, so that the short side
// comes up"; then common factors cleared to whole numbers. In floating notation
// the net factor is the long side l with its trailing zero places dropped.
export function recipeOf(s, d) {
  s = BigInt(s); d = BigInt(d);
  const rp = recipPair(s, d);
  if (!rp) return null;
  const { l } = rp;
  const lp = sexOf(l);
  while (lp.length > 1 && lp[lp.length - 1] === 0) lp.pop();
  return {
    l, x: sexDisp(...rp.x), xi: sexDisp(...rp.xi),
    half: { diff: sexDisp(s, l), sum: sexDisp(d, l) },
    colI: fracSexStr(d * d, l * l), torn: sexDisp(s * s, l * l),
    factor: lp.join(','), s: sexStr(s), d: sexStr(d),
  };
}

// The half-square would need x − 1/x = 2, that is x = 1 + √2. Its first
// sexagesimal places (floor, from an exact integer square root).
export function onePlusRoot2Places(places = 4) {
  const r = isqrtBig(2n * 60n ** BigInt(2 * (places - 1)));   // √2 · 60^(places−1)
  const dg = sexOf(r);
  dg[0] += 1;
  return dg;
}

// Seconds between beats when two tones at f·a and f·b sound together.
export function beatSeconds(a, b, f) { return 1 / Math.abs(f * a - f * b); }

// Period, in cycles of the lower tone, of the sum sin(t) + sin(r t), r = n/d.
export function periodCycles(n, d) { const g = Number(gcdBig(BigInt(n), BigInt(d))); return d / g; }

/* ================= self-tests ================= */

function runTests() {
  let count = 0;
  const ok = (cond, msg) => { count++; if (!cond) throw new Error('sixty _test #' + count + ': ' + msg); };
  const R = (n) => PLIMPTON_ROWS[n - 1];

  ok(PLIMPTON_ROWS.length === 15, '15 rows');
  PLIMPTON_ROWS.forEach((r, i) => ok(r.row === i + 1, 'row numbering'));

  for (const r of PLIMPTON_ROWS) {
    const l = longSideOf(r.s, r.d);
    ok(l !== null, `row ${r.row}: d²−s² must be a perfect square`);
    ok(r.s * r.s + l * l === r.d * r.d, `row ${r.row}: s²+l²=d²`);
    ok(isRegular(Number(l)), `row ${r.row}: long side ${l} is regular`);
    const rp = recipPair(r.s, r.d);
    ok(rp && rp.l === l, `row ${r.row}: reciprocal pair exists`);
    const [a, b] = rp.x, [c, e] = rp.xi;
    ok(a * c === b * e, `row ${r.row}: x · 1/x = 1`);
    ok([a, b, c, e].every((k) => isRegular(Number(k))), `row ${r.row}: x and 1/x are regular fractions`);
    ok(r.s * 2n * b * e === l * (a * e - c * b), `row ${r.row}: s/l = (x − 1/x)/2`);
    ok(r.d * 2n * b * e === l * (a * e + c * b), `row ${r.row}: d/l = (x + 1/x)/2`);
    // x = p/q in lowest terms is also Neugebauer's generating pair
    const p = a, q = b;
    ok(r.s * (2n * p * q) === l * (p * p - q * q), `row ${r.row}: s/l = (p²−q²)/2pq`);
    ok(r.d * (2n * p * q) === l * (p * p + q * q), `row ${r.row}: d/l = (p²+q²)/2pq`);
    ok(fracSexStr(r.d * r.d, l * l) === COL_I_SOURCE[r.row - 1], `row ${r.row}: column I = (d/l)² as transcribed`);
    ok(colIDigits(r.s, r.d).join(',') === COL_I_SOURCE[r.row - 1].replace(';', ',').split(',').map(Number).join(','),
      `row ${r.row}: colIDigits`);
    if (r.row < 15) {
      const pq = pqOf(r.s, r.d);
      ok(pq && pq.p === p && pq.q === q, `row ${r.row}: pqOf agrees with the reciprocal pair`);
    }
  }
  // The reciprocal pairs Robson restores (Fig. 4).
  for (const [row, [xs, xis]] of Object.entries(PAIRS_SOURCE)) {
    const r = R(+row), rp = recipPair(r.s, r.d);
    ok(sexDisp(...rp.x) === xs && sexDisp(...rp.xi) === xis, `row ${row}: pair ${xs} · ${xis}`);
  }

  // The scribal slips, tied to the tablet's written sexagesimal forms.
  ok(R(1).s === 119n && R(1).d === 169n && longSideOf(119n, 169n) === 120n, 'row 1 = (119,120,169)');
  ok(pqOf(119n, 169n).p === 12n && pqOf(119n, 169n).q === 5n, 'row 1 generated by (12,5)');
  ok(R(2).dw === 11521n && sexStr(11521n) === '3,12,1' && sexStr(4825n) === '1,20,25', 'row 2 error');
  ok(R(2).cIw.join(',') === '1,56,56,58,14,56,15' && colIDigits(R(2).s, R(2).d).slice(5, 7).join(',') === '50,6',
    'row 2 column I runs 50 and 6 together');
  ok(R(8).cIw[3] === 59 && colIDigits(R(8).s, R(8).d)[3] + colIDigits(R(8).s, R(8).d)[4] === 59, 'row 8: 59 = 45 + 14');
  ok(R(9).sw === 541n && sexStr(541n) === '9,1' && sexStr(481n) === '8,1' && 541n - 481n === 60n, 'row 9 error');
  ok(R(13).sw === 25921n && 25921n === 161n * 161n && sexStr(25921n) === '7,12,1' && sexStr(161n) === '2,41', 'row 13 error is 161²');
  ok(R(15).sw === 56n && R(15).sw === 2n * R(15).s && R(15).d === 53n, 'row 15: Robson halves 56 to 28');
  ok(longSideOf(56n, 53n) === null, 'row 15 as written is no triple');
  ok(longSideOf(28n, 53n) === 45n && longSideOf(56n, 106n) === 90n, 'row 15: both corrections are triples');
  ok(R(15).alt.dw === 53n && R(15).alt.d === 106n, 'row 15: Neugebauer doubles 53 to 1,46');
  ok(pqOf(56n, 106n).p === 9n && pqOf(56n, 106n).q === 5n, 'row 15 (Neugebauer) generated by (9,5)');
  ok(28n * 90n === 56n * 45n, 'row 15: the two corrections have the same shape');
  ok(pqOf(45n, 75n).p === 2n && pqOf(45n, 75n).q === 1n && pqOf(45n, 75n).scale === 15n, 'row 11 = 15×(3,4,5)');
  ok(fracSexStr(2, 1) === '2', 'no dangling semicolon');

  // The march: 44.76° down to 31.89°.
  const ang = (r) => Math.atan2(Number(r.s), Number(longSideOf(r.s, r.d))) * 180 / Math.PI;
  ok(ang(R(1)).toFixed(2) === '44.76' && ang(R(15)).toFixed(2) === '31.89', 'angles 44.76° … 31.89°');
  for (let i = 1; i < 15; i++) ok(ang(R(i)) > ang(R(i + 1)), `row ${i} steeper than row ${i + 1}`);

  // The exhibit's core arithmetic claim: 1/3 terminates in base 60 (;20),
  // never in base 10.
  const e60 = baseExpansion(1, 3, 60);
  ok(e60.terminates === true && e60.digits.length === 1 && e60.digits[0] === 20, '1/3 = ;20 in base 60');
  ok(baseExpansion(1, 3, 10).terminates === false, '1/3 does not terminate in base 10');
  ok(fracSexStr(1, 3) === ';20', 'fracSexStr(1/3)');
  ok(fracSexStr(1, 8) === ';07,30', 'igi 8 = 7,30');
  ok(fracSexStr(1, 27) === ';02,13,20', 'igi 27 = 2,13,20');
  ok(fracSexStr(169n * 169n, 120n * 120n) === '1;59,00,15', 'row 1 column I restores to 1;59,00,15');
  ok(fracSexStr(12, 5) === '2;24' && fracSexStr(5, 12) === ';25', 'row 1 reciprocal pair 2;24 / ;25');

  // Termination in base 60 ⇔ regular divisor, for the whole dial range.
  let n60 = 0, n10 = 0;
  for (let b = 2; b <= 30; b++) {
    ok(terminatesIn(b, 60) === isRegular(b), `1/${b} terminates in base 60 iff ${b} is regular`);
    ok(terminatesIn(b, 30) === terminatesIn(b, 60), `base 30 ends exactly where base 60 does (${b})`);
    if (terminatesIn(b, 60)) n60++;
    if (terminatesIn(b, 10)) n10++;
  }
  ok(n60 === 17 && n10 === 8, '17 of 2…30 end in base sixty, 8 in base ten');
  ok(regularMantissas(6, [1, 2]) === 231, 'Knuth: exactly 231 six-place regular numbers begin with 1 or 2');

  // Robson's recipe, row by row.
  const rc1 = recipeOf(119n, 169n);
  ok(rc1.x === '2;24' && rc1.xi === '0;25' && rc1.half.diff === '0;59,30' && rc1.half.sum === '1;24,30' &&
    rc1.colI === '1;59,00,15' && rc1.torn === '0;59,00,15' && rc1.factor === '2' && rc1.s === '1,59' && rc1.d === '2,49',
    'row 1 recipe: 2;24 · 0;25 → 0;59,30 · 1;24,30 → 1;59,00,15 → 1,59 · 2,49');
  ok(recipeOf(45n, 75n).factor === '1' && recipeOf(45n, 75n).half.diff === '0;45', 'row 11: nothing to clear');
  ok(recipeOf(28n, 53n).x === '1;48' && recipeOf(28n, 53n).xi === '0;33,20' && recipeOf(28n, 53n).factor === '45',
    'row 15 (Robson): 1;48 · 0;33,20, cleared by 45');
  for (const r of PLIMPTON_ROWS) {
    const rc = recipeOf(r.s, r.d);
    ok(rc.colI === COL_I_SOURCE[r.row - 1], `row ${r.row}: recipe reaches column I`);
    ok(rc.torn === sexDisp(r.s * r.s, rc.l * rc.l) && rc.torn === '0' + COL_I_SOURCE[r.row - 1].slice(1),
      `row ${r.row}: tear out 1 and the short side's square is left`);
    const f = BigInt(sexOf(rc.l).reverse().findIndex((v) => v !== 0));   // trailing zero places
    ok(rc.l === rc.factor.split(',').reduce((a, v) => a * 60n + BigInt(v), 0n) * 60n ** f, `row ${r.row}: factor is l, floated`);
  }
  // Robson 2002, p. 113: none of the pairs "is more than four sexagesimal places long, and they are
  // listed in decreasing numerical order".
  const floatPlaces = (str) => str.replace(/^0;/, '').split(/[;,]/).length;
  for (let i = 0; i < 15; i++) {
    const rc = recipeOf(R(i + 1).s, R(i + 1).d), rp = recipPair(R(i + 1).s, R(i + 1).d);
    ok(floatPlaces(rc.x) <= 4 && floatPlaces(rc.xi) <= 4, `row ${i + 1}: the pair has at most four places`);
    if (i < 14) {
      const nx = recipPair(R(i + 2).s, R(i + 2).d).x;
      ok(rp.x[0] * nx[1] > nx[0] * rp.x[1], `row ${i + 1}: x is larger than the next row's`);
    }
  }
  // The standard reciprocal table (MLC 1670, in Robson's Fig. 9), read with the same machinery.
  ok(fracSexStr(1, 16) === ';03,45' && fracSexStr(1, 54) === ';01,06,40' && fracSexStr(1, 64) === ';00,56,15' &&
    fracSexStr(1, 81) === ';00,44,26,40', 'igi 16, 54, 1,4 and 1,21 as the school table gives them');
  // Neugebauer's check on YBC 7289: (1;24,51,10)² = 1;59,59,59,38,1,40.
  ok(fracSexStr(YBC_SQRT2.num ** 2n, YBC_SQRT2.den ** 2n) === '1;59,59,59,38,01,40', 'YBC 7289 squared, as Neugebauer computes it');

  // The missing row: x = 1 + √2 = 2;24,51,10,… — row 1's x is its first two places.
  ok(onePlusRoot2Places(4).join(',') === '2,24,51,10' && onePlusRoot2Places(5)[4] === 7, '1 + √2 = 2;24,51,10,07…');
  ok(recipeOf(119n, 169n).x === '2;24', 'row 1 starts from the first two places of 1 + √2');

  // YBC 7289.
  ok(fracSexStr(YBC_SQRT2.num, YBC_SQRT2.den) === '1;24,51,10', 'YBC 7289: 1;24,51,10');
  ok(fracSexStr(30n * YBC_SQRT2.num, YBC_SQRT2.den) === '42;25,35', 'YBC 7289: 30 × √2 = 42;25,35');
  const ybc = Number(YBC_SQRT2.num) / Number(YBC_SQRT2.den);
  ok(Math.abs(Math.SQRT2 - ybc) < 6.1e-7 && (Math.SQRT2 - ybc) / Math.SQRT2 < 1 / 2e6, 'YBC 7289: better than one part in two million');
  const beat = beatSeconds(Math.SQRT2, ybc, 240);
  ok(beat > 6900 && beat < 7000, 'at 240 Hz, one beat in about 1 h 56 min');

  // Ambiguity engine.
  const flat = (r) => r.baseValues.map(String).join('|');
  ok(flat(interpretations([{ v: 1 }])) === '1', 'single wedge');
  ok(flat(interpretations([{ v: 1 }, { v: 0 }, { v: 5 }])) === '65|3605', 'gap ambiguity');
  ok(flat(interpretations([{ v: 1 }, { v: 0, ph: true }, { v: 5 }])) === '3605', 'placeholder pins the gap');
  ok(flat(interpretations([{ v: 1 }, { v: 0 }, { v: 0 }, { v: 1 }])) === '61|3601|216001', 'double gap');
  ok(interpretations([{ v: 0 }, { v: 0 }]).baseValues.length === 0, 'empty clay');
  const rd = readings([{ v: 0 }, { v: 1 }, { v: 0 }, { v: 0 }]);
  ok(rd.length === 4 && rd[0].den === 60n && rd[1].num === 1n && rd[3].num === 3600n, 'one wedge: 1⁄60, 1, 60, 3,600');
  ok(rd[1].powers[1] === 0 && rd[1].powers[0] === undefined && rd[3].powers[1] === 2, 'powers per column');
  const rg = readings([{ v: 1 }, { v: 0 }, { v: 1 }, { v: 0 }]);
  ok(rg.length === 8 && rg.some((x) => x.num === 61n && x.den === 1n && x.powers[1] === null) &&
    rg.some((x) => x.num === 3601n && x.den === 1n && x.powers[1] === 1), 'gap: 61 (spacing) or 3,601 (a place)');
  ok(readings([{ v: 1 }, { v: 0, ph: true }, { v: 1 }, { v: 0 }]).length === 4, 'placeholder: only the scale floats');

  // Wedge layout sanity.
  ok(digitGroup(59).marks.length === 14, '59 = 5 tens + 9 units');
  ok(digitGroup(7).marks.length === 7 && digitGroup(7).w > 0, 'units layout');

  // The coda's periods: 5:4 and 7:4 both close every 4 cycles.
  ok(periodCycles(5, 4) === 4 && periodCycles(7, 4) === 4 && periodCycles(3, 2) === 2 && periodCycles(11, 8) === 8, 'periods');

  return `ok — ${count} assertions passed`;
}

export const _test = {
  PLIMPTON_ROWS, isqrtBig, longSideOf, pqOf, sexOf, sexStr, fracSexStr,
  interpretations, digitGroup, factorize, run: runTests,
  recipPair, sexDisp, colIDigits, readings, terminatesIn, regularMantissas,
  beatSeconds, periodCycles, YBC_SQRT2, recipeOf, onePlusRoot2Places,
};

/* ================= the exhibit ================= */

export default {
  id: 'sixty',
  movement: 1,
  title: 'Sixty',
  hook: 'Why your clock still speaks Babylonian — and how to divide by 3 with no remainder, ever.',
  era: 'c. 3300–300 BCE · Uruk, Ur, Nippur, Larsa',
  chronicle: [
    { year: -3200, date: 'c. 3300–3000 BCE', text: 'In the account books of Uruk, administrators press the round ends of two styli into clay to count by 1, 10, 60, 600 and 3,600, with a different sign for every step: base sixty, a thousand years before place value.' },
    { year: -2050, date: 'c. 2100–2000 BCE', text: 'Under the Third Dynasty of Ur, tables of reciprocals show a new way of writing numbers: two wedges build every digit from 1 to 59, and a digit’s column, not its shape, says what it is worth.' },
    { year: -1800, date: 'c. 1822–1784 BCE', text: 'Probably at Larsa, a scribe rules the tablet now called <em>Plimpton 322</em>: fifteen right triangles with whole-number sides, sorted from nearly a half-square down to about 32 degrees.' },
    { year: -300, date: 'by 300 BCE', text: 'Babylonian astronomers and scribes mark an empty sexagesimal place with a borrowed punctuation mark of two slanted wedges; no safe example puts it at the end of a number, so context still decides how large a number is.' },
    { year: 150, date: 'c. 150 CE', text: 'In Alexandria, Ptolemy’s <em>Almagest</em> divides the circle into 360 degrees and computes in sixtieths; medieval Latin later names the first and second sixtieths <em>minuta prima</em> and <em>secunda</em>, our minute and second.' },
    { year: 1793, date: 'November 1793', text: 'Revolutionary France decrees a day of ten hours, each of a hundred minutes of a hundred seconds; its compulsory use ends in 1795, and the clock stays sexagesimal.' },
    { year: 1945, date: '1945', text: 'Otto Neugebauer and Abraham Sachs publish Plimpton 322 in <em>Mathematical Cuneiform Texts</em> and recognize its columns as the sides of right triangles, Pythagorean triples some twelve centuries before Pythagoras.' },
    { year: 2017, date: 'August 2017', text: 'Daniel Mansfield and Norman Wildberger call Plimpton 322 “exact sexagesimal trigonometry”, their university announces “the world’s oldest and most accurate trigonometric table”, and critics, among them Evelyn Lamb in <em>Scientific American</em>, call it hype.' },
  ],
  today: `
    <p>Sixty never left the clock. The second is still a sixtieth of a sixtieth of an hour, although
    since 1967 it has been defined as 9,192,631,770 periods of the radiation from one transition
    of the caesium-133 atom, and metrologists are preparing to redefine it with optical clocks,
    possibly in 2030. The best-known attempt to decimalize the day, revolutionary France’s
    ten-hour clock, was decreed in November 1793 and abolished in 1795. Every satellite fix is a measurement in seconds as well: a
    receiver solves for its own clock error alongside its position, the engine of
    <a href="#ex-whereami">One More Circle</a>.</p>
    <p>Place value found new work. In Richard Hamming’s code of 1950 the failed checks, written as a
    binary numeral, spell the position of the damaged bit, because where a 1 stands says what it is
    worth (<a href="#ex-selfheal">The Checking Number</a>). The scribes’ regular numbers set the pace
    of signal processing: a fast Fourier transform runs quickest on lengths built from small primes,
    so a signal is padded out to such a length, and SciPy’s FFTPACK module finds the next one made
    only of 2s, 3s and 5s. Its manual calls them “5-smooth numbers, regular numbers, or Hamming
    numbers.” Edsger Dijkstra, crediting the puzzle to Hamming, popularized the task of listing
    them in order in <em>A Discipline of Programming</em> (1976). Donald Knuth had already pointed
    to an ancestor: a table from Seleucid Uruk, whose colophon names the priest Inakibit-Anu as its
    author, listing regular numbers of up to six places with their reciprocals, in order, “the
    earliest known example of a large file that has been sorted.”</p>
    <p>Smoothness has become a weapon too. The strongest classical ways to factor a large number,
    the quadratic and number field sieves, gather enormous numbers of values that break entirely
    into small primes and combine them. That is how the 250-digit RSA-250 fell in February 2020,
    after about 2,700 core-years of computing. In September 2026 Eric Lu announced that he and
    colleagues at Cognition had split RSA-260, 260 digits long, running a number field sieve on
    graphics processors.</p>`,
  sources: [
    { text: 'Eleanor Robson, “Words and Pictures: New Light on Plimpton 322”, <em>American Mathematical Monthly</em> 109 (2002) 105–120', url: 'https://doi.org/10.1080/00029890.2002.11919845' },
    { text: 'Eleanor Robson, “Neither Sherlock Holmes nor Babylon: A Reassessment of Plimpton 322”, <em>Historia Mathematica</em> 28 (2001) 167–206', url: 'https://doi.org/10.1006/hmat.2001.2317' },
    { text: 'Otto Neugebauer, <em>The Exact Sciences in Antiquity</em> (2nd ed. 1957; Dover 1969), §§10–11 and notes', url: 'https://archive.org/details/exactsciencesina0000neug_c0r3' },
    { text: 'Donald E. Knuth, “Ancient Babylonian Algorithms”, <em>Communications of the ACM</em> 15 (1972) 671–677', url: 'https://doi.org/10.1145/361454.361514' },
    { text: 'Christine Proust, “Floating calculation in Mesopotamia” (2023)', url: 'https://arxiv.org/abs/2302.13607' },
    { text: 'Robert K. Englund, “Proto-Cuneiform Account-Books and Journals” (Cuneiform Digital Library Initiative, 2004)', url: 'https://cdli.earth/files-up/publications/englund2004a.pdf' },
    { text: 'David Fowler and Eleanor Robson, “Square Root Approximations in Old Babylonian Mathematics: YBC 7289 in Context”, <em>Historia Mathematica</em> 25 (1998) 366–378', url: 'https://doi.org/10.1006/hmat.1998.2209' },
    { text: 'Cuneiform Digital Library Initiative, Plimpton 322 (P254790), Rare Book and Manuscript Library, Columbia University', url: 'https://cdli.earth/artifacts/254790' },
    { text: 'Daniel F. Mansfield and N. J. Wildberger, “Plimpton 322 is Babylonian exact sexagesimal trigonometry”, <em>Historia Mathematica</em> 44 (2017) 395–419', url: 'https://doi.org/10.1016/j.hm.2017.08.001' },
    { text: 'BIPM, Resolution 1 of the 13th CGPM (1967): the caesium definition of the second', url: 'https://www.bipm.org/en/committees/cg/cgpm/13-1967/resolution-1' },
  ],
  alt: 'Four stations: a clay slab where wedges are stamped into four columns while labels beneath them run through every value the marks could mean; a race that unfolds 1 divided by 2 to 30 in base ten and base sixty over a grid that sorts the divisors; Plimpton 322 drawn in wedges with its broken edge, its restored signs and its slips in crimson, beside the chosen row’s right triangle among all fifteen and the dashed half-square no row can hold, with the row worked out beneath from its reciprocal pair; and ratio keys over an oscilloscope of two tones.',
  prose: `
    <p>Every clock face is a small Babylonian colony. Sixty seconds to the minute, sixty minutes
    to the hour, three hundred sixty degrees around the circle: when you say <em>quarter past</em>,
    you are doing arithmetic in base sixty. The words are fossils too. Medieval Latin called a
    sixtieth part the <em>pars minuta prima</em>, the first small part, and a sixtieth of that the
    <em>secunda pars minuta</em>: our minute and our second. Sixty is older than the notation that
    made it famous. On account tablets from Uruk, more than five thousand years old, administrators
    pressed the round ends of two styli into clay to count by ones, tens, sixties, six hundreds and
    thirty-six hundreds, with a different sign for every step. The leap came in the century before
    2000 BCE, under the Third Dynasty of Ur. Scribes kept just two marks, a vertical wedge for
    <em>one</em> and a corner wedge for <em>ten</em>, clustered them into every digit from 1 to 59,
    and let the column say the rest: move a wedge one place to the left and it is worth sixty times
    more. It is our decimal trick with a larger base, and the oldest place-value system we know,
    more than two thousand years older than the Indian numerals we write today.</p>
    <p>Something is missing, though, and you will feel its absence at the clay below: there is no
    zero, and no mark for where the whole numbers end. The same lone wedge meant 1, or 60, or 3,600,
    or <code>1/60</code>; a gap between digits might be an empty place or a scribe’s loose spacing.
    Donald Knuth called these “floating-point sexagesimal numbers” in a notation “that did not
    include any exponent part”, and for the scribes that was the point. Place value was a
    calculating notation, kept for multiplying and taking reciprocals, where the size of a number
    can wait until the end, as on a slide rule; sheep and barley were counted in other systems,
    whose signs carried their own size. Only in the first millennium BCE did an empty place get a
    sign of its own. A table of squares from Kish, which its excavator tentatively placed around
    500 BCE, marks a few empty places with a sign written like 30; by 300 BCE a borrowed
    punctuation mark of two slanted wedges was in full use. It could open a number or sit between
    digits, but Otto Neugebauer knew no safe example of it at the end, where it would have told 20
    from twenty sixties. “In all periods,” he wrote, “the context alone decides the absolute value of a
    sexagesimally written number.” Zero as a number in its own right, something you may add and
    multiply, waits for Brahmagupta, in India, in 628 CE.</p>
    <p>Why did so unwieldy-sounding a base conquer the clock? Because of how it divides. A scribe
    never did long division. To divide by <code>b</code> was to multiply by its reciprocal, its
    <em>igi</em>, read from a table, and in the schools of Nippur, where more than nine hundred
    mathematical exercises survive, the table of reciprocals came first among the numerical tables a
    student learned. A reciprocal has a finite entry exactly when <code>1/b</code> ends in your
    base. In base ten, 1/3 stutters forever, 0.333…; in base sixty it is simply <code>;20</code>,
    twenty sixtieths, done. The divisors that come out even are the numbers built only from 2, 3 and
    5, the <em>regular</em> numbers: seventeen of the whole numbers from 2 to 30, against base
    ten’s eight. The rest the scribes marked <em>igi nu</em>, “no reciprocal”, and when a problem
    about a cistern forced a division by 7, the text said so plainly: “The reciprocal of 7 does not
    exist; what will give 1,10 when multiplied by 7?” Race the two bases below and watch the same
    sorting happen under your hands.</p>
    <p>Then there is the tablet. Plimpton 322 was written around 1800 BCE, probably at Larsa, and
    Eleanor Robson narrows it to 1822–1784 BCE because its layout, with a heading over every column
    and a last column headed “its name”, matches half a dozen administrative tables from the
    kingdom of Larsa, all dated within those years. The
    New York publisher George Plimpton bought it from the dealer Edgar J. Banks for ten dollars in
    about 1922. It is a broken slab of clay some 13 by 9 centimetres, ruled into four columns and
    fifteen rows, and its second and third columns, headed “square-side of the short side” and
    “square-side of the diagonal”, hold the sides of fifteen right triangles with whole-number
    sides, beginning with <code>119,&nbsp;169</code> and reaching as high as
    <code>12709,&nbsp;18541</code>: Pythagorean-triple data, twelve
    centuries before Pythagoras. Neugebauer and Abraham Sachs, who published it in 1945, noticed
    that every row can be generated from a pair of regular numbers <code>p,&nbsp;q</code> by
    <code>(p²−q²,&nbsp;2pq,&nbsp;p²+q²)</code>. The reading first put forward by Evert Bruins and argued in
    full by Robson uses the scribes’ own tools instead: each row starts from a reciprocal pair
    <code>x,&nbsp;1/x</code>, is worked by cut-and-paste geometry and scaled down to whole numbers, and
    the first column keeps one intermediate result. The tablet looks less like a discovery than a
    teacher’s problem list, fifteen versions of one exercise, each guaranteed to come out clean.
    Even its slips testify. In row 13 it writes 7,12,1, that is 25,921, where 2,41 (161) belongs,
    and 25,921 is exactly <code>161²</code>: a hand mid-calculation, copying a square where its
    root belonged.</p>
    <p>The rows are sorted by the ratio of diagonal to long side, each triangle on average about a
    degree shallower than the last: from 44.76°, just shy of the half-square, down to 31.89°. Run
    your pointer down them and watch the march; then notice the slot it never fills. The simplest
    right triangle of all, width equal to length, the diagonal of a square, has no row here and
    could have none on any tablet, because no whole numbers satisfy <code>d²&nbsp;=&nbsp;2·l²</code>. The
    scribes knew that diagonal well. A student’s round hand tablet now at Yale, YBC 7289, draws a
    square with its diagonals and writes along one of them <code>1;24,51,10</code>, the square root
    of two to better than one part in two million, a value Ptolemy was still using for his table of
    chords nearly two thousand years later. Sound it against the true value at 240 hertz and you
    would wait almost two hours for a single beat. Babylon could approximate the diagonal superbly.
    It could not write it in whole numbers, and <a href="#ex-diagonal">The Diagonal</a> is the
    reason why.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const bus = audio.createBus('sixty');

    const cssVar = (name, fb) => {
      try { return getComputedStyle(stage).getPropertyValue(name).trim() || fb; } catch { return fb; }
    };
    const SERIF = () => {
      try { return getComputedStyle(document.body).fontFamily || 'Georgia, serif'; } catch { return 'Georgia, serif'; }
    };
    const MONO = cssVar('--mono', 'ui-monospace, Menlo, monospace');
    const INK_FAINT = cssVar('--ink-faint', '#8a8676');
    const font = (px, { italic = false, mono = false, weight = '' } = {}) =>
      `${italic ? 'italic ' : ''}${weight ? weight + ' ' : ''}${Math.max(6, px)}px ${mono ? MONO : SERIF()}`;

    const mq = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reduced = !!(mq && mq.matches);

    /* ---------- colour helpers (all derived from the house palette) ---------- */
    // '#rrggbb' or 'rgb(r,g,b)' (so that mixes can be mixed again).
    const rgbOf = (h) => (h[0] === '#' ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
      : (h.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number));
    const mix = (a, b, t, alpha = 1) => {
      const A = rgbOf(a), B = rgbOf(b);
      const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
      return alpha < 1 ? `rgba(${c[0]},${c[1]},${c[2]},${alpha})` : `rgb(${c[0]},${c[1]},${c[2]})`;
    };
    const rgba = (h, a) => { const c = rgbOf(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
    // Fired clay at night: gold-leaf earth warmed with a little vermilion and
    // pushed toward the page's dark, so gold wedges still read as the ink.
    const CLAY = mix(mix(P.goldDim, P.crimson, 0.22), P.bg, 0.56);         // ≈ rgb(72,53,37)
    const TONES = {
      gold: { body: P.gold, lit: P.goldBright, shade: P.goldDim },
      sel: { body: P.goldBright, lit: mix(P.goldBright, P.ink, 0.55), shade: P.gold },
      slip: { body: P.crimson, lit: P.crimsonBright, shade: mix(P.crimson, P.bg, 0.4) },
      slipSel: { body: P.crimsonBright, lit: mix(P.crimsonBright, P.ink, 0.5), shade: P.crimson },
      azure: { body: P.azure, lit: mix(P.azure, P.ink, 0.5), shade: P.azureDim },
      dim: { body: P.inkDim, lit: P.ink, shade: mix(P.inkDim, P.bg, 0.45) },
      ghost: { body: P.goldDim, lit: P.goldDim, shade: P.goldDim },
      drop: { flat: true, body: 'rgba(0,0,0,0.42)' },          // the impression's shadow in the clay
    };

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-sixty canvas { touch-action: pan-y; }
      #ex-sixty canvas:focus-visible { outline: 2px solid ${P.goldBright}; outline-offset: 3px; }
      #ex-sixty .sxty-label { font-variant: small-caps; letter-spacing: .22em;
        color: var(--mv, ${P.gold}); font-size: .82rem; margin: 2.3rem 0 .7rem;
        border-top: 1px solid ${P.line}; padding-top: .8rem; }
      #ex-sixty .sxty-label:first-of-type { margin-top: .2rem; border-top: none; padding-top: 0; }
      #ex-sixty .sxty-label b { font-weight: normal; color: ${INK_FAINT}; letter-spacing: .12em; }
      #ex-sixty .sxty-dim { color: ${P.inkDim}; font-size: .8rem; font-family: ${MONO};
        margin: .45rem 0 .25rem; min-height: 1.2em; line-height: 1.55; overflow-wrap: anywhere; }
      #ex-sixty .sxty-dim em { color: ${P.goldBright}; font-style: normal; }
      #ex-sixty .sxty-dim q { font-family: var(--serif, serif); font-style: italic; color: ${P.ink};
        font-size: .92rem; quotes: '“' '”'; }
      #ex-sixty .sxty-sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      #ex-sixty .sxty-race { font-family: ${MONO}; background: ${P.bg};
        border: 1px solid ${P.line}; border-radius: 4px; padding: .75rem .95rem;
        margin: .6rem 0; line-height: 1.9; font-size: .95rem; }
      #ex-sixty .sxty-race .lane { display: grid; grid-template-columns: 4.9em 1fr; align-items: baseline; }
      #ex-sixty .sxty-race .lab { color: ${INK_FAINT}; font-size: .78rem; letter-spacing: .06em; }
      #ex-sixty .sxty-race .digits { overflow-wrap: anywhere; min-width: 0; }
      #ex-sixty .sxty-race .pre { color: ${P.inkDim}; }
      #ex-sixty .sxty-race i { font-style: normal; color: ${P.ink}; }
      #ex-sixty .sxty-race i.rep { color: ${P.inkDim}; border-bottom: 1px dotted ${P.crimson}; }
      #ex-sixty .sxty-race .endmark { font-family: var(--serif, serif); font-style: italic;
        color: ${P.goldBright}; margin-left: .55em; }
      #ex-sixty .sxty-race .dots { font-family: var(--serif, serif); font-style: italic;
        color: ${P.crimsonBright}; margin-left: .35em; }
      @media (prefers-reduced-motion: no-preference) {
        #ex-sixty .sxty-race i, #ex-sixty .sxty-race .endmark, #ex-sixty .sxty-race .dots {
          animation: sxty-in .28s ease-out both; }
        #ex-sixty .sxty-cell { transition: background .35s, border-color .35s, color .35s; }
      }
      @keyframes sxty-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
      #ex-sixty .sxty-race i { display: inline-block; }
      #ex-sixty .sxty-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(2.85rem, 1fr));
        gap: 5px; margin: .55rem 0 .3rem; }
      #ex-sixty .sxty-cell { position: relative; font-family: ${MONO}; font-size: .82rem;
        padding: .42em 0 .5em; text-align: center; background: ${P.panel};
        border: 1px solid ${P.line}; border-radius: 3px; color: ${P.inkDim}; cursor: pointer; }
      #ex-sixty .sxty-cell:hover { border-color: ${P.goldDim}; color: ${P.ink}; }
      #ex-sixty .sxty-cell:focus-visible { outline: 2px solid ${P.goldBright}; outline-offset: 1px; }
      #ex-sixty .sxty-cell.gold { border-color: ${P.gold}; color: ${P.goldBright};
        background: linear-gradient(180deg, ${rgba(P.gold, 0.16)}, ${rgba(P.gold, 0.04)}); }
      #ex-sixty .sxty-cell.crimson { border-color: ${rgba(P.crimson, 0.8)}; color: ${P.crimsonBright};
        background: ${rgba(P.crimson, 0.07)}; }
      #ex-sixty .sxty-cell.now { box-shadow: 0 0 0 1px ${P.azure} inset; }
      #ex-sixty .sxty-cell.t10::after { content: ''; position: absolute; left: 50%; bottom: 3px;
        width: 14px; height: 2px; margin-left: -7px; border-radius: 1px; background: ${P.azure}; }
      #ex-sixty .sxty-cell small { display: block; font-size: .54rem; letter-spacing: 0; white-space: nowrap;
        color: ${INK_FAINT}; line-height: 1.1; min-height: 1.1em; margin-top: .1em; }
      #ex-sixty .sxty-cell.crimson small { color: ${rgba(P.crimsonBright, 0.85)}; }
      #ex-sixty .sxty-cell.gold small { color: ${P.goldDim}; }
      #ex-sixty .sxty-legend { display: flex; flex-wrap: wrap; gap: .35rem 1.2rem; font-size: .76rem;
        color: ${P.inkDim}; margin: .2rem 0 .1rem; }
      #ex-sixty .sxty-legend span::before { content: ''; display: inline-block; width: .7em; height: .7em;
        margin-right: .4em; vertical-align: -.05em; border-radius: 2px; border: 1px solid; }
      #ex-sixty .sxty-legend .lg-g::before { border-color: ${P.gold}; background: ${rgba(P.gold, 0.18)}; }
      #ex-sixty .sxty-legend .lg-c::before { border-color: ${P.crimson}; background: ${rgba(P.crimson, 0.1)}; }
      #ex-sixty .sxty-legend .lg-a::before { border: 0; height: 2px; width: .9em; vertical-align: .2em; background: ${P.azure}; }
      #ex-sixty .sxty-tabwrap { display: flex; flex-wrap: wrap; gap: 14px; align-items: stretch; }
      #ex-sixty .sxty-tab { flex: 3 1 400px; min-width: 0; }
      #ex-sixty .sxty-pan { flex: 2 1 290px; min-width: 0; }
      #ex-sixty .sxty-recipe { margin: .75rem 0 .35rem; border: 1px solid ${P.line}; border-radius: 4px;
        background: linear-gradient(180deg, ${rgba(P.gold, 0.045)}, ${rgba(P.gold, 0)} 70%);
        padding: .65rem .95rem .8rem; }
      #ex-sixty .sxty-recipe .rh { display: flex; flex-wrap: wrap; justify-content: space-between;
        align-items: baseline; gap: .15rem 1.2rem; margin-bottom: .55rem; }
      #ex-sixty .sxty-recipe .rh b { font-weight: normal; font-variant: small-caps; letter-spacing: .16em;
        font-size: .8rem; color: var(--mv, ${P.gold}); }
      #ex-sixty .sxty-recipe .rh i { color: ${INK_FAINT}; font-size: .78rem; }
      #ex-sixty .sxty-recipe ol { list-style: none; margin: 0; padding: 0; display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .65rem 1.3rem; counter-reset: st; }
      @media (max-width: 1000px) { #ex-sixty .sxty-recipe ol { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { #ex-sixty .sxty-recipe ol { grid-template-columns: minmax(0, 1fr); } }
      #ex-sixty .sxty-recipe li { counter-increment: st; position: relative; padding-left: 1.5rem; min-width: 0; }
      #ex-sixty .sxty-recipe li::before { content: counter(st, lower-roman) '.'; position: absolute; left: 0;
        top: .02rem; font-style: italic; color: ${P.goldDim}; font-size: .85rem; }
      #ex-sixty .sxty-recipe .k { display: block; font-style: italic; color: ${P.inkDim}; font-size: .82rem;
        line-height: 1.35; }
      #ex-sixty .sxty-recipe .v { display: block; font-family: ${MONO}; font-size: .84rem; color: ${P.ink};
        margin-top: .2rem; line-height: 1.5; overflow-wrap: anywhere; }
      #ex-sixty .sxty-recipe .v .az { color: ${P.azure}; }
      #ex-sixty .sxty-recipe .v .au { color: ${P.goldBright}; }
      #ex-sixty .sxty-recipe .v .cr { color: ${P.crimsonBright}; font-family: var(--serif, serif);
        font-style: italic; font-size: .8rem; }
      #ex-sixty .sxty-recipe .v .dim { color: ${INK_FAINT}; }
      #ex-sixty .sxty-keys { display: flex; flex-wrap: wrap; gap: 6px; margin: .6rem 0; }
      #ex-sixty .sxty-key { font-family: ${MONO}; background: ${P.panel};
        border: 1px solid ${P.goldDim}; border-radius: 4px; color: ${P.ink};
        padding: .38em .62em; cursor: pointer; line-height: 1.25; }
      #ex-sixty .sxty-key small { display: block; color: ${INK_FAINT}; font-size: .66rem;
        font-family: var(--serif, serif); font-style: italic; }
      #ex-sixty .sxty-key.off7 { border-color: ${rgba(P.crimson, 0.85)}; }
      #ex-sixty .sxty-key.active { background: ${P.gold}; border-color: ${P.gold}; color: ${P.bg}; }
      #ex-sixty .sxty-key.active small { color: ${P.bg}; }
      #ex-sixty .sxty-key.off7.active { background: ${P.crimson}; border-color: ${P.crimson}; }
    `;
    stage.appendChild(style);

    const el = (tag, cls, parent, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      (parent || stage).appendChild(e);
      return e;
    };
    const label = (html) => { const d = el('div', 'sxty-label'); d.innerHTML = html; return d; };
    const dimLine = (parent) => el('div', 'sxty-dim', parent);
    const liveRegion = () => { const d = el('div', 'sxty-sr'); d.setAttribute('aria-live', 'polite'); return d; };
    const noScrollKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Home', 'End']);

    /* ---------- seeded noise, clay texture ---------- */
    function mulberry32(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // One pre-rendered clay surface per canvas size; blitted inside a clip.
    function makeClay(w, h, dpr, seed) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = CLAY; g.fillRect(0, 0, w, h);
      const rnd = mulberry32(seed);
      const blobs = Math.round(6 + w * h / 12000);
      for (let i = 0; i < blobs; i++) {                    // broad, quiet mottling, light and dark in balance
        const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 90;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rnd() < 0.55 ? rgba(P.goldBright, 0.03) : 'rgba(0,0,0,0.045)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      const n = Math.min(6000, Math.round(w * h / 30));   // grit: pits and specks of temper
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, s = 0.4 + rnd() * 0.9;
        g.fillStyle = rnd() < 0.55 ? `rgba(0,0,0,${0.08 + rnd() * 0.16})` : rgba(P.goldBright, 0.03 + rnd() * 0.07);
        g.fillRect(x, y, s, s);
      }
      g.lineWidth = 0.6;                                    // a few hairline cracks, with a lit lip
      for (let i = 0; i < 9; i++) {
        const x = rnd() * w, y = rnd() * h, a = rnd() * TAU, L = 8 + rnd() * 28;
        const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
        g.strokeStyle = `rgba(0,0,0,${0.16 + rnd() * 0.12})`;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = rgba(P.goldBright, 0.05);
        g.beginPath(); g.moveTo(x, y + 0.8); g.lineTo(x2, y2 + 0.8); g.stroke();
      }
      // raking light from the upper left, then a soft fall-off to the rim
      const lg = g.createLinearGradient(0, 0, w * 0.55, h * 1.1);
      lg.addColorStop(0, rgba(P.goldBright, 0.07)); lg.addColorStop(1, rgba(P.goldBright, 0));
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
      const vg = g.createRadialGradient(w * 0.45, h * 0.42, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.30)');
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
      return c;
    }
    const clayCache = new Map();
    function clayFor(key, w, h, dpr, seed) {
      const k = `${key}:${Math.round(w)}x${Math.round(h)}@${dpr}`;
      let c = clayCache.get(key);
      if (!c || c.k !== k) { c = { k, tex: makeClay(Math.max(1, w), Math.max(1, h), dpr, seed) }; clayCache.set(key, c); }
      return c.tex;
    }
    // Pillowy rounded rectangle.
    function slabPath(ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      const b = Math.min(3, w * 0.01, h * 0.01);            // gentle bulge
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.quadraticCurveTo(x + w / 2, y - b, x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.quadraticCurveTo(x + w + b, y + h / 2, x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.quadraticCurveTo(x + w / 2, y + h + b, x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.quadraticCurveTo(x - b, y + h / 2, x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
    function incise(ctx, x0, y0, x1, y1) {                  // a ruling pressed into clay
      ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = rgba(P.goldBright, 0.07);
      const dx = y0 === y1 ? 0 : 1, dy = y0 === y1 ? 1 : 0;
      ctx.beginPath(); ctx.moveTo(x0 + dx, y0 + dy); ctx.lineTo(x1 + dx, y1 + dy); ctx.stroke();
    }

    /* ---------- wedges, as stylus impressions ---------- */
    // Vertical wedge centred on x, head at y, height ≈ 0.74 s. A body, a
    // shaded left facet and a lit top facet read as an impression in clay.
    function wedgeUnit(ctx, x, y, s, t, ghost) {
      if (!(s > 0.6)) return;
      ctx.beginPath();
      ctx.moveTo(x - 0.17 * s, y); ctx.lineTo(x + 0.17 * s, y);
      ctx.lineTo(x + 0.045 * s, y + 0.30 * s); ctx.lineTo(x + 0.03 * s, y + 0.74 * s);
      ctx.lineTo(x - 0.03 * s, y + 0.74 * s); ctx.lineTo(x - 0.045 * s, y + 0.30 * s);
      ctx.closePath();
      if (ghost) { ctx.stroke(); return; }
      ctx.fillStyle = t.body; ctx.fill();
      if (t.flat) return;
      ctx.fillStyle = t.shade;
      ctx.beginPath(); ctx.moveTo(x - 0.17 * s, y); ctx.lineTo(x, y + 0.11 * s); ctx.lineTo(x - 0.045 * s, y + 0.30 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = t.lit;
      ctx.beginPath(); ctx.moveTo(x - 0.17 * s, y); ctx.lineTo(x + 0.17 * s, y); ctx.lineTo(x, y + 0.11 * s);
      ctx.closePath(); ctx.fill();
    }
    // Corner wedge (Winkelhaken), top-left at (x, y), 0.5 s by 0.42 s.
    function wedgeTen(ctx, x, y, s, t, ghost) {
      if (!(s > 0.6)) return;
      ctx.beginPath();
      ctx.moveTo(x + 0.5 * s, y); ctx.lineTo(x, y + 0.21 * s); ctx.lineTo(x + 0.5 * s, y + 0.42 * s);
      ctx.lineTo(x + 0.5 * s, y + 0.30 * s); ctx.lineTo(x + 0.17 * s, y + 0.21 * s);
      ctx.lineTo(x + 0.5 * s, y + 0.12 * s);
      ctx.closePath();
      if (ghost) { ctx.stroke(); return; }
      ctx.fillStyle = t.body; ctx.fill();
      if (t.flat) return;
      ctx.fillStyle = t.lit;
      ctx.beginPath(); ctx.moveTo(x + 0.5 * s, y); ctx.lineTo(x, y + 0.21 * s); ctx.lineTo(x + 0.17 * s, y + 0.21 * s);
      ctx.lineTo(x + 0.5 * s, y + 0.12 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = t.shade;
      ctx.beginPath(); ctx.moveTo(x, y + 0.21 * s); ctx.lineTo(x + 0.17 * s, y + 0.21 * s); ctx.lineTo(x + 0.26 * s, y + 0.27 * s);
      ctx.closePath(); ctx.fill();
    }
    // Digit v (1..59) with its top-left corner at (x, y), wedge scale u.
    function drawDigit(ctx, v, x, y, u, t, ghost) {
      const g = digitGroup(v);
      if (!ghost && u >= 4.5 && !t.flat) {                  // shadow first: the wedge sits in the clay
        const o = Math.min(1.6, Math.max(0.7, u * 0.06));
        for (const m of g.marks) {
          if (m.g === 't') wedgeTen(ctx, x + m.x * u + o, y + m.y * u + o, u, TONES.drop);
          else wedgeUnit(ctx, x + m.x * u + 0.18 * u + o, y + m.y * u + o, u, TONES.drop);
        }
      }
      for (const m of g.marks) {
        if (m.g === 't') wedgeTen(ctx, x + m.x * u, y + m.y * u, u, t, ghost);
        else wedgeUnit(ctx, x + m.x * u + 0.18 * u, y + m.y * u, u, t, ghost);
      }
      return g.w * u;
    }
    // The late separation sign: two small wedges pressed obliquely, one
    // above the other. Centred on (x, y).
    function drawPlaceholder(ctx, x, y, u, t) {
      for (const [dx, dy] of [[-0.12 * u, -0.34 * u], [0.1 * u, 0.12 * u]]) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(-0.8);
        if (u >= 4.5) wedgeUnit(ctx, 0.9, -0.3 * u + 0.9, 0.82 * u, TONES.drop);
        wedgeUnit(ctx, 0, -0.3 * u, 0.82 * u, t);
        ctx.restore();
      }
    }
    // A row of sexagesimal places, top-aligned; zeros are blank spaces, as on
    // Old Babylonian tablets. toneAt(i) / ghostAt(i) style each place.
    const PLACE_GAP = 0.5, ZERO_W = 0.6, DIGIT_H = 1.46;
    const placeW = (d) => (d === 0 ? ZERO_W : digitGroup(d).w);
    const placesWidth = (digs) => digs.reduce((w, d, i) => w + placeW(d) + (i ? PLACE_GAP : 0), 0);
    function drawPlaces(ctx, digs, x, yTop, u, toneAt, ghostAt) {
      let cx = x;
      digs.forEach((d, i) => {
        if (i) cx += PLACE_GAP * u;
        if (d !== 0) {
          const ghost = ghostAt ? ghostAt(i) : false;
          if (ghost) { ctx.strokeStyle = rgba(P.goldBright, 0.42); ctx.lineWidth = 0.8; }
          drawDigit(ctx, d, cx, yTop, u, toneAt(i), ghost);
        }
        cx += placeW(d) * u;
      });
      return cx - x;
    }

    let glow = null;
    const glowGold = () => (glow || (glow = cv.glowSprite(P.goldBright, 64)));

    /* ======================= STATION I — the stamping table ======================= */
    label('i · the stamping table');
    const wrap1 = el('div');
    const h1 = cv.setupCanvas(wrap1, { height: 262 });
    h1.canvas.tabIndex = 0;
    h1.canvas.setAttribute('role', 'application');
    h1.canvas.setAttribute('aria-roledescription', 'stamping table');
    h1.canvas.setAttribute('aria-label',
      'A clay slab with four place-value columns. Left and right arrows choose a column; 1 stamps a one-wedge, ' +
      '0 a ten-wedge, P the placeholder; Backspace smooths the last mark away. The readings are announced.');
    h1.canvas.style.touchAction = 'pan-y';
    const NCOLS = 4;
    const cols = Array.from({ length: NCOLS }, () => ({ t: 0, u: 0, ph: false }));
    const history = [];
    let tool = 'one';
    let hoverCol = -1, cursorCol = -1;
    let dirty1 = true;
    let stampAnim = null;                                   // { i, t0 }

    const tools1 = ui.controlRow(stage);
    const toolBtns = {};
    const setTool = (t) => {
      tool = t;
      for (const k in toolBtns) {
        toolBtns[k].classList.toggle('active', k === t);
        toolBtns[k].setAttribute('aria-pressed', String(k === t));
      }
    };
    toolBtns.one = ui.button(tools1, 'one-wedge', () => setTool('one'), { small: true });
    toolBtns.ten = ui.button(tools1, 'ten-wedge', () => setTool('ten'), { small: true });
    toolBtns.ph = ui.button(tools1, 'placeholder', () => setTool('ph'), { small: true });
    const undoBtn = ui.button(tools1, 'smooth one away', () => undoStamp(), { small: true });
    ui.button(tools1, 'wipe the clay', () => {
      for (const c of cols) { c.t = 0; c.u = 0; c.ph = false; }
      history.length = 0;
      stampChanged(true);
    }, { small: true });
    setTool('one');

    const ctlRead = ui.controlRow(stage);
    ctlRead.style.alignItems = 'stretch';
    ctlRead.style.gap = '.5rem';
    const flicker = ui.readout(ctlRead, '—');
    flicker.el.style.flex = '1 1 16rem';
    flicker.el.style.minHeight = '2.1em';
    flicker.el.setAttribute('aria-hidden', 'true');
    const nextBtn = ui.button(ctlRead, 'next reading ›', () => { stepReading(1, true); }, { small: true });
    const context1 = dimLine();
    const live1 = liveRegion();
    const quest1 = ui.questBanner(stage,
      'Write sixty-one: stamp a single wedge in one column, and a single wedge in the column to its right.');
    ui.caption(stage,
      'Two marks were the scribes’ whole numeral system: a vertical wedge for one, a corner wedge for ten. ' +
      'Columns carry powers of sixty, but nothing on the clay says <em>which</em> powers, so the readout and the ' +
      'labels under the clay run through every number your marks could mean. For a scribe multiplying, that ' +
      'was a convenience rather than a defect. The placeholder, a punctuation mark of two slanted wedges in ' +
      'full use by 300 BCE, goes <em>between</em> digits here. Late texts also set it before digits, but no safe ' +
      'example ends a number with it, and only there could it have told 20 from twenty sixties.');

    let quest1Stage = 0;
    let flickList = [];                                     // readings()
    let flickIdx = 0, flickAt = 0;

    const cellsNow = () => cols.map((c) => ({ v: c.t * 10 + c.u, ph: c.ph }));
    function trimmedSig() {
      const cells = cellsNow();
      let lo = 0, hi = cells.length - 1;
      while (lo <= hi && cells[lo].v === 0 && !cells[lo].ph) lo++;
      while (hi >= lo && cells[hi].v === 0 && !cells[hi].ph) hi--;
      return cells.slice(lo, hi + 1).map((c) => (c.ph ? 'P' : c.v)).join('|');
    }
    // A reading in our numerals: whole part, then any sixtieths as a fraction.
    const fmtReading = (r) => {
      if (r.den === 1n) return formatBig(r.num);
      const w = r.num / r.den, f = r.num % r.den;
      const frac = `${formatBig(f)}⁄${formatBig(r.den)}`;
      return w === 0n ? frac : f === 0n ? formatBig(w) : `${formatBig(w)} + ${frac}`;
    };
    const placeLabel = (p) => (p === -1 ? '×1⁄60' : p === 0 ? '×1' : p === 1 ? '×60' : p === 2 ? '×3,600'
      : p === 3 ? '×216,000' : '×60' + String(p).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]));

    function renderReadout() {
      if (!flickList.length) { flicker.setHTML('<span style="color:' + INK_FAINT + '">smooth clay</span>'); return; }
      if (flickList.length === 1) { flicker.setHTML(`<b>${fmtReading(flickList[0])}</b>`); return; }
      if (reduced) {
        const all = flickList.map((r, i) => (i === flickIdx ? `<b>${fmtReading(r)}</b>` : fmtReading(r)));
        flicker.setHTML('could mean  ' + all.join(' · '));
        return;
      }
      const cur = flickList[flickIdx % flickList.length];
      flicker.setHTML(`could mean  <b>${fmtReading(cur)}</b>  <span style="color:${INK_FAINT}">` +
        `(${(flickIdx % flickList.length) + 1} of ${flickList.length})</span>`);
    }
    function stepReading(d, manual) {
      if (flickList.length < 2) return;
      flickIdx = (flickIdx + d + flickList.length) % flickList.length;
      if (manual) flickAt = performance.now() / 1000 + 2.5;   // let the visitor read it
      renderReadout(); dirty1 = true;
    }

    function stampChanged(wiped) {
      const cells = cellsNow();
      const { gaps } = interpretations(cells);
      flickList = readings(cells);
      const anyPh = cols.some((c) => c.ph);
      flickIdx = 0; flickAt = performance.now() / 1000 + 1.6;
      if (!flickList.length) {
        context1.textContent = wiped ? 'smooth clay: choose a tool, then press it into a column' : '';
      } else if (gaps === 0 && anyPh) {
        context1.textContent = 'the gap is pinned; the scale still floats: ×60 for each larger place, or sixtieths';
      } else if (gaps > 0) {
        context1.textContent = `${flickList.length} readings from the same marks: the empty column may or may not be a place`;
      } else {
        context1.textContent = `one set of marks, ${flickList.length} readings: nothing on the clay fixes the scale`;
      }
      nextBtn.disabled = flickList.length < 2;
      undoBtn.disabled = history.length === 0;
      renderReadout();
      const shown = flickList.slice(0, 12).map(fmtReading).join(', ');
      live1.textContent = flickList.length ? `Your marks could mean ${shown}${flickList.length > 12 ? ', and more' : ''}.` : 'The clay is smooth.';

      // quest ladder: 61 → 1|gap|1 → 1|placeholder|1
      const sig = trimmedSig();
      if (quest1Stage === 0 && sig === '1|1') {
        quest1Stage = 1;
        quest1.set('Now write three thousand six hundred and one: wedge, <em>empty column</em>, wedge.');
      } else if (quest1Stage === 1 && sig === '1|0|1') {
        quest1Stage = 2;
        quest1.set('The clay cannot say whether you meant 61 or 3,601: watch the labels squirm. ' +
          'Pick the <em>placeholder</em> and stamp the empty middle column.');
      } else if (quest1Stage === 2 && sig === '1|P|1') {
        quest1Stage = 3;
        quest1.done('3,601, and no argument, at least between the digits. The sign took more than a thousand ' +
          'years to arrive, and no safe example ever ends a number with it: the scale still came from context.');
      }
      dirty1 = true;
    }

    const geo1 = () => {
      const W = Math.max(60, h1.width), H = Math.max(60, h1.height);
      const slab = { x: 8, y: 10, w: Math.max(40, W - 16), h: Math.max(40, H - 58) };
      return { W, H, slab, cw: slab.w / NCOLS, labY: slab.y + slab.h + 22 };
    };
    function colAt(x) {
      const g = geo1();
      const i = Math.floor((x - g.slab.x) / g.cw);
      return i >= 0 && i < NCOLS ? i : -1;
    }

    function stampAt(i) {
      if (i < 0 || i >= NCOLS) return;
      audio.ensureAudio();
      const now = bus.context.currentTime;
      const c = cols[i];
      const deny = (msg) => {
        context1.textContent = msg;
        audio.drums.rim(bus, now, { level: 0.22 });
        dirty1 = true;
      };
      if (tool === 'ph') {
        if (c.t + c.u > 0 || c.ph) return deny('the placeholder marks an empty place, and this column is not empty');
        const leftFull = cols.slice(0, i).some((k) => k.t + k.u > 0);
        const rightFull = cols.slice(i + 1).some((k) => k.t + k.u > 0);
        if (!rightFull && leftFull) {
          return deny('no safe example ends a number with the sign: the size of a number was left to context');
        }
        if (!leftFull && rightFull) {
          return deny('late texts do set it before digits, but here it would pin nothing, since the scale floats anyway: set it between two digits');
        }
        if (!leftFull) return deny('the sign marks an empty place between digits: stamp some digits first');
        c.ph = true;
        history.push({ i, k: 'ph' });
        audio.drums.thock(bus, now, { level: 0.45 });
        audio.drums.thock(bus, now + 0.09, { level: 0.36 });
      } else if (tool === 'one') {
        if (c.ph) return deny('this place is pinned empty; smooth the sign away to reuse it');
        if (c.u >= 9) return deny('nine is as far as the units go; a tenth would be a corner wedge');
        c.u++;
        history.push({ i, k: 'u' });
        audio.drums.thock(bus, now, { level: 0.55 });
        audio.drums.wood(bus, now, { pitch: 700 + i * 90, level: 0.1 });
      } else {
        if (c.ph) return deny('this place is pinned empty; smooth the sign away to reuse it');
        if (c.t >= 5) return deny('no digit reaches sixty: that is what the next column is for');
        c.t++;
        history.push({ i, k: 't' });
        audio.drums.thock(bus, now, { level: 0.6 });
        audio.drums.wood(bus, now, { pitch: 420 + i * 60, level: 0.1 });
      }
      stampAnim = reduced ? null : { i, t0: performance.now() / 1000 };
      stampChanged();
    }
    function undoStamp() {
      const h = history.pop();
      if (!h) return;
      const c = cols[h.i];
      if (h.k === 'u') c.u = Math.max(0, c.u - 1);
      else if (h.k === 't') c.t = Math.max(0, c.t - 1);
      else c.ph = false;
      // a smoothed digit may leave a placeholder with nothing on one side
      for (let i = 0; i < NCOLS; i++) {
        if (!cols[i].ph) continue;
        const l = cols.slice(0, i).some((k) => k.t + k.u > 0), r = cols.slice(i + 1).some((k) => k.t + k.u > 0);
        if (!l || !r) cols[i].ph = false;
      }
      audio.ensureAudio();
      audio.drums.hat(bus, bus.context.currentTime, { level: 0.08 });
      stampChanged();
    }

    h1.canvas.addEventListener('pointermove', (e) => {
      const [x] = cv.pointerPos(h1, e);
      const c = colAt(x);
      if (c !== hoverCol) { hoverCol = c; dirty1 = true; }
    });
    h1.canvas.addEventListener('pointerleave', () => { hoverCol = -1; dirty1 = true; });
    h1.canvas.addEventListener('pointerdown', (e) => {
      const [x] = cv.pointerPos(h1, e);
      const i = colAt(x);
      if (i < 0) return;
      cursorCol = i;
      if (e.button === 2 || e.shiftKey) { e.preventDefault(); undoStamp(); return; }
      stampAt(i);
    });
    h1.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    h1.canvas.addEventListener('focus', () => { if (cursorCol < 0) cursorCol = 0; dirty1 = true; });
    h1.canvas.addEventListener('blur', () => { dirty1 = true; });
    h1.canvas.addEventListener('keydown', (e) => {
      if (noScrollKeys.has(e.key)) e.preventDefault();
      if (e.key === 'ArrowLeft') { cursorCol = Math.max(0, cursorCol - 1); dirty1 = true; }
      else if (e.key === 'ArrowRight') { cursorCol = Math.min(NCOLS - 1, Math.max(0, cursorCol + 1)); dirty1 = true; }
      else if (e.key === '1' || e.key === 'u') { setTool('one'); stampAt(Math.max(0, cursorCol)); }
      else if (e.key === '0' || e.key === 't') { setTool('ten'); stampAt(Math.max(0, cursorCol)); }
      else if (e.key === 'p' || e.key === 'P') { setTool('ph'); stampAt(Math.max(0, cursorCol)); }
      else if (e.key === 'Enter' || e.key === ' ') stampAt(Math.max(0, cursorCol));
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); undoStamp(); }
    });
    h1.onResize(() => { dirty1 = true; });

    function draw1(tNow) {
      const { ctx } = h1;
      const g = geo1();
      const { W, H, slab, cw } = g;
      ctx.clearRect(0, 0, W, H);
      // tablet shadow, then clay
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      slabPath(ctx, slab.x, slab.y, slab.w, slab.h, 12);
      ctx.fillStyle = CLAY; ctx.fill();
      ctx.restore();
      ctx.save();
      slabPath(ctx, slab.x, slab.y, slab.w, slab.h, 12);
      ctx.clip();
      ctx.drawImage(clayFor('slab', W, H, h1.dpr, 322), 0, 0, W, H);
      const focusCol = document.activeElement === h1.canvas ? cursorCol : -1;
      for (let i = 0; i < NCOLS; i++) {
        const x = slab.x + i * cw;
        if (i === hoverCol || i === focusCol) {
          const gr = ctx.createLinearGradient(0, slab.y, 0, slab.y + slab.h);
          gr.addColorStop(0, rgba(P.goldBright, 0.08)); gr.addColorStop(1, rgba(P.goldBright, 0.02));
          ctx.fillStyle = gr; ctx.fillRect(x + 2, slab.y, cw - 4, slab.h);
        }
        if (i > 0) incise(ctx, Math.round(x) + 0.5, slab.y + 10, Math.round(x) + 0.5, slab.y + slab.h - 10);
      }
      slabPath(ctx, slab.x, slab.y, slab.w, slab.h, 12);          // inner bevel: the slab's thickness
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.stroke();
      ctx.restore();
      // slab rim
      slabPath(ctx, slab.x + 0.5, slab.y + 0.5, slab.w - 1, slab.h - 1, 12);
      ctx.strokeStyle = rgba(P.goldBright, 0.09); ctx.lineWidth = 1; ctx.stroke();
      if (focusCol >= 0) {
        ctx.strokeStyle = rgba(P.goldBright, 0.55); ctx.setLineDash([3, 3]);
        ctx.strokeRect(slab.x + focusCol * cw + 5.5, slab.y + 6.5, cw - 11, slab.h - 13);
        ctx.setLineDash([]);
      }

      // the marks
      const anim = stampAnim ? Math.min(1, (tNow - stampAnim.t0) / 0.3) : 1;
      if (stampAnim && anim >= 1) stampAnim = null;
      for (let i = 0; i < NCOLS; i++) {
        const x = slab.x + i * cw, c = cols[i], v = c.t * 10 + c.u;
        const cx = x + cw / 2, cy = slab.y + slab.h / 2;
        const pop = stampAnim && stampAnim.i === i ? 1 + 0.16 * Math.pow(1 - anim, 2) : 1;
        if (stampAnim && stampAnim.i === i) {
          ctx.globalAlpha = 0.55 * (1 - anim);
          glowGold().draw(ctx, cx, cy, Math.max(0.1, (cw / 64) * (0.6 + anim * 0.9)));
          ctx.globalAlpha = 1;
        }
        if (c.ph) {
          const u = Math.max(4, Math.min(52, cw * 0.4, slab.h * 0.36));
          ctx.save(); ctx.translate(cx, cy); ctx.scale(pop, pop);
          drawPlaceholder(ctx, 0, 0, u, TONES.azure);
          ctx.restore();
        } else if (v > 0) {
          const dg = digitGroup(v);
          const u = Math.max(3, Math.min(46, (cw - 24) / Math.max(dg.w, 1), (slab.h - 44) / Math.max(dg.h, 1)));
          ctx.save(); ctx.translate(cx, cy); ctx.scale(pop, pop);
          drawDigit(ctx, v, -(dg.w * u) / 2, -(dg.h * u) / 2, u, i === hoverCol ? TONES.sel : TONES.gold);
          ctx.restore();
        } else if (i === hoverCol || i === focusCol) {
          ctx.fillStyle = rgba(P.inkDim, 0.75);
          ctx.font = font(12, { italic: true });
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(tool === 'ph' ? 'the empty sign?' : 'press here', cx, cy);
        }
      }

      // what each column is worth in the reading now shown
      ctx.textBaseline = 'alphabetic';
      const cur = flickList.length ? flickList[flickIdx % flickList.length] : null;
      if (cur) {
        for (let i = 0; i < NCOLS; i++) {
          const p = cur.powers[i];
          if (p === undefined) continue;
          const x = slab.x + (i + 0.5) * cw;
          if (p === null) {
            ctx.font = font(12, { italic: true }); ctx.fillStyle = INK_FAINT; ctx.textAlign = 'center';
            ctx.fillText('spacing', x, g.labY);
          } else {
            ctx.font = font(12, { mono: true });
            ctx.fillStyle = p === 0 ? P.goldBright : p < 0 ? P.azure : P.gold;
            ctx.textAlign = 'center';
            ctx.fillText(placeLabel(p), x, g.labY);
          }
        }
        // the sexagesimal point: right of the column worth ×1, when that
        // column is on the clay (our semicolon; the scribes wrote nothing)
        const unitCol = cur.powers.findIndex((p) => p === 0);
        if (unitCol >= 0 && unitCol < NCOLS - 1) {
          const bx = Math.round(slab.x + (unitCol + 1) * cw) + 0.5;
          ctx.save();
          ctx.strokeStyle = rgba(P.goldBright, 0.45); ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(bx, slab.y + 14); ctx.lineTo(bx, slab.y + slab.h - 26); ctx.stroke();
          ctx.restore();
          ctx.fillStyle = P.goldBright;
          ctx.font = font(22, { weight: '600' }); ctx.textAlign = 'center';
          ctx.fillText(';', bx, slab.y + slab.h - 8);
        }
      } else {
        ctx.font = font(12, { italic: true }); ctx.fillStyle = INK_FAINT; ctx.textAlign = 'center';
        const one = 'each column: sixty times the one to its right, but which is the ones column?';
        if (ctx.measureText(one).width <= W - 20) ctx.fillText(one, W / 2, g.labY);
        else {
          ctx.fillText('each column is sixty times the one to its right,', W / 2, g.labY - 7);
          ctx.fillText('but which is the ones column?', W / 2, g.labY + 9);
        }
      }
      ctx.textAlign = 'left';
    }

    /* ======================= STATION II — the reciprocal race ======================= */
    label('ii · the reciprocal race');
    let divisor = 3;
    const ctl2 = ui.controlRow(stage);
    const divStep = ui.stepper(ctl2, {
      label: 'divide one by', min: 2, max: 30, value: divisor,
      format: (v) => String(v),
      onChange: (v) => { if (raceState) completeRace(); divisor = v; raceIdle(); markNow(); },
    });
    const runBtn = ui.button(ctl2, '▶ unfold 1/' + divisor, () => startRace(), { primary: true });
    ui.button(ctl2, 'fill in the whole table', () => fillAll(), { small: true });

    const raceBox = el('div', 'sxty-race');
    raceBox.setAttribute('aria-live', 'off');
    const grid = el('div', 'sxty-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Divisors from 2 to 30');
    const legend2 = el('div', 'sxty-legend');
    legend2.innerHTML = '<span class="lg-g">ends in base sixty</span><span class="lg-c"><em>igi nu</em>: no reciprocal</span>' +
      '<span class="lg-a">ends in base ten too</span>';
    const tallyLine = dimLine();
    const factLine = dimLine();
    const live2 = liveRegion();
    const math2 = ui.mathline(stage,
      '1⁄b ends in base 60  ⇔  b = 2<sup>i</sup>·3<sup>j</sup>·5<sup>k</sup>, the regular numbers');
    math2.style.display = 'none';
    const quest2 = ui.questBanner(stage,
      'Try divisors until the pattern shows: which of them come out even in base sixty, and what do those share?');
    ui.caption(stage,
      'Base ten ends only for divisors built from 2 and 5; base sixty for divisors built from 2, 3 and 5. ' +
      'One extra prime, and the difference underwrote a civilization of tables. A scribal reciprocal table is ' +
      'precisely the gold cells, igi 3 = 20, igi 8 = 7,30, igi 27 = 2,13,20, written without any mark of scale, ' +
      'while 7, 11 and 13 are passed over. More than a thousand years later, a table from Seleucid Uruk carried ' +
      'the same kind of list out to six sexagesimal places, sorted in order.');

    const igiOf = (b) => baseExpansion(1, b, 60, 16).digits.join(',');
    const cells2 = new Map();
    for (let b = 2; b <= 30; b++) {
      const cell = el('button', 'sxty-cell', grid);
      cell.type = 'button';
      cell.innerHTML = `${b}<small></small>`;
      cell.setAttribute('aria-label', `one divided by ${b}`);
      cell.addEventListener('click', () => {
        divisor = b; divStep.set(b); startRace(); markNow();
      });
      cells2.set(b, cell);
    }
    const tried = new Map();                                // b -> terminates in base 60
    let raceQueue = [];                                     // {at, fn}
    let raceSched = null, raceSub = null, raceEls = null, raceState = null;

    function markNow() {
      for (const [b, cell] of cells2) cell.classList.toggle('now', b === divisor);
      runBtn.textContent = '▶ unfold 1/' + divisor;
    }
    markNow();

    function raceIdle() {
      raceBox.innerHTML =
        '<div class="lane"><span class="lab">base 10</span><span class="digits"><span class="pre">0.</span></span></div>' +
        '<div class="lane"><span class="lab">base 60</span><span class="digits"><span class="pre">0;</span></span></div>';
      factLine.textContent = 'press unfold, or a number in the grid, to race the two bases';
    }
    raceIdle();

    function buildSeq(exp) {
      const CAP = 13;
      if (exp.terminates) return { digits: exp.digits.slice(), term: true, periodStart: -1 };
      const pre = exp.digits.slice(0, exp.periodStart);
      const per = exp.digits.slice(exp.periodStart);
      const out = pre.slice();
      while (out.length < CAP) out.push(...per);
      return { digits: out.slice(0, CAP), term: false, periodStart: exp.periodStart };
    }

    // Race sounds go through their own gain, so a reset silences notes that
    // the scheduler has already queued inside its lookahead.
    function newRaceSub() {
      const c = bus.context;
      const g = c.createGain();
      g.gain.value = 1;
      g.connect(bus.input);
      return { context: c, input: g };
    }
    function dropRaceSub() {
      if (!raceSub) return;
      const g = raceSub.input;
      audio.rampTo(g.gain, 0, 0.012);
      setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } }, 250);
      raceSub = null;
    }
    function stopRace() {
      if (raceSched) { raceSched.stop(); raceSched = null; }
      raceQueue = [];
      raceState = null;
      dropRaceSub();
    }

    function startRace() {
      audio.ensureAudio();
      if (raceState) completeRace();     // a race cut short still counts: record it silently
      stopRace();
      const b = divisor;
      const s10 = buildSeq(baseExpansion(1, b, 10, 64));
      const s60 = buildSeq(baseExpansion(1, b, 60, 64));
      raceBox.innerHTML =
        '<div class="lane"><span class="lab">base 10</span><span class="digits"><span class="pre">0.</span><span class="d10"></span></span></div>' +
        '<div class="lane"><span class="lab">base 60</span><span class="digits"><span class="pre">0;</span><span class="d60"></span></span></div>';
      raceEls = { d10: raceBox.querySelector('.d10'), d60: raceBox.querySelector('.d60') };
      raceState = { b, s10, s60, shown: { d10: 0, d60: 0 }, ended: { d10: false, d60: false } };
      factLine.textContent = '';
      raceSub = newRaceSub();
      const sub = raceSub;
      const STEP = 0.34;
      const maxLen = Math.max(s10.digits.length, s60.digits.length);
      let i = 0;
      raceSched = audio.createScheduler((t) => {
        if (i > maxLen) {
          raceQueue.push({ at: t, fn: () => finishRace(b, s60.term, s10.term) });
          return null;
        }
        for (const [side, seq] of [['d10', s10], ['d60', s60]]) {
          if (i < seq.digits.length) {
            const dg = seq.digits[i], idx = i;
            if (side === 'd10') audio.drums.wood(sub, t, { pitch: 500 + dg * 38, level: 0.24 });
            else audio.playTone(sub, { freq: 170 + dg * 7, dur: 0.16, level: 0.2, when: t, pan: 0.3 });
            raceQueue.push({ at: t, fn: () => revealDigit(side, seq, idx) });
          } else if (i === seq.digits.length) {
            const term = seq.term, sd = side;
            if (term) {
              audio.playTone(sub, { freq: 720, dur: 0.4, level: 0.26, when: t });
              audio.playTone(sub, { freq: 1080, dur: 0.5, level: 0.18, when: t + 0.06 });
            } else {
              audio.drums.wood(sub, t, { pitch: 180, level: 0.28 });
            }
            raceQueue.push({ at: t, fn: () => endSide(sd, term) });
          }
        }
        i++;
        return t + STEP;
      });
      raceSched.start();
    }

    function revealDigit(side, seq, idx) {
      if (!raceEls || !raceState) return;
      const e = document.createElement('i');
      const dg = seq.digits[idx];
      e.textContent = side === 'd60' ? (idx > 0 ? ',' : '') + String(dg).padStart(2, '0') : String(dg);
      if (!seq.term && idx >= seq.periodStart) e.className = 'rep';
      raceEls[side].appendChild(e);
      raceState.shown[side] = idx + 1;
    }
    function endSide(side, term) {
      if (!raceEls || !raceState || raceState.ended[side]) return;
      raceState.ended[side] = true;
      const e = document.createElement('span');
      if (term) { e.className = 'endmark'; e.textContent = 'it ends'; }
      else { e.className = 'dots'; e.textContent = '… forever'; }
      raceEls[side].appendChild(e);
    }
    // Finish a race at once, silently (used when the visitor scrolls away).
    function completeRace() {
      if (!raceState) return;
      const st = raceState;
      if (raceSched) { raceSched.stop(); raceSched = null; }
      raceQueue = [];
      dropRaceSub();
      for (const [side, seq] of [['d10', st.s10], ['d60', st.s60]]) {
        for (let i = st.shown[side]; i < seq.digits.length; i++) revealDigit(side, seq, i);
        endSide(side, seq.term);
      }
      finishRace(st.b, st.s60.term, st.s10.term);
    }
    function markCell(b, term60, term10) {
      const cell = cells2.get(b);
      if (!cell) return;
      cell.classList.remove('now');
      cell.classList.add(term60 ? 'gold' : 'crimson');
      cell.classList.toggle('t10', term10);
      cell.querySelector('small').textContent = term60 ? igiOf(b) : 'igi nu';
      cell.setAttribute('aria-label', `one divided by ${b}: ` + (term60 ? `ends in base sixty, igi ${igiOf(b)}` : 'never ends in base sixty, no reciprocal') +
        (term10 ? '; ends in base ten too' : ''));
    }
    function updateTally() {
      let g = 0, c = 0, t10 = 0;
      for (const [b, t] of tried) { t ? g++ : c++; if (terminatesIn(b, 10)) t10++; }
      const n = tried.size;
      tallyLine.innerHTML = n === 29
        ? `all 29 tried: <em>17</em> end in base sixty, <em>8</em> in base ten`
        : `${n} of 29 tried: ${g} ${g === 1 ? 'ends' : 'end'} in base sixty, ${t10} in base ten; ` +
          `${c} never ${c === 1 ? 'ends' : 'end'} in sixty`;
      if ((g >= 6 && c >= 3) || n === 29) {
        quest2.done('The clean divisors are exactly the numbers built from 2, 3 and 5, the scribes’ ' +
          '<em>regular</em> numbers. Every other divisor stutters forever, whatever the scribe does.');
        math2.style.display = '';
      }
    }
    function finishRace(b, term60, term10) {
      raceState = null;
      if (raceSub) {                      // let the last chime ring out, then let go
        const g = raceSub.input;
        raceSub = null;
        setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } }, 1500);
      }
      tried.set(b, term60);
      markCell(b, term60, term10);
      const fs = factorize(b).map((p) =>
        `<span style="color:${p === 2 || p === 3 || p === 5 ? P.goldBright : P.crimsonBright}">${p}</span>`);
      let html = `${b} = ${fs.join('·')}`;
      if (term60) html += ` · only sixty’s primes, so it ends: igi ${b} = <em>${igiOf(b)}</em>`;
      else if (b === 7) html += ' · a prime that sixty lacks. An Old Babylonian cistern problem, in Knuth’s translation: ' +
        '<q>The reciprocal of 7 does not exist; what will give 1,10 when multiplied by 7? 10 will.</q>';
      else html += ' · a prime that sixty lacks: <em>igi nu</em>, no reciprocal, and it stutters forever';
      factLine.innerHTML = html;
      live2.textContent = term60 ? `One over ${b} ends in base sixty.` : `One over ${b} never ends in base sixty.`;
      updateTally();
    }
    function fillAll() {
      stopRace();
      for (let b = 2; b <= 30; b++) {
        const t60 = terminatesIn(b, 60), t10 = terminatesIn(b, 10);
        tried.set(b, t60); markCell(b, t60, t10);
      }
      markNow();
      factLine.innerHTML = 'the gold cells, with their reciprocals, are a scribe’s <em>igi</em> table from 2 to 30';
      updateTally();
      audio.ensureAudio();
      const t0 = bus.context.currentTime;
      [2, 3, 4, 5, 6].forEach((k, j) => audio.playTone(bus, { freq: 220 * k / 2, dur: 0.5, level: 0.1, when: t0 + j * 0.07 }));
    }

    /* ======================= STATION III — the tablet ======================= */
    label('iii · the tablet · <b>plimpton 322</b>');
    const ctl3 = ui.controlRow(stage);
    let translit = false;
    ui.toggle(ctl3, {
      label: 'transliterate the wedges', value: false,
      onChange: (v) => { translit = v; dirty3 = true; },
    });
    const wrap3 = el('div', 'sxty-tabwrap');
    const tabBox = el('div', 'sxty-tab', wrap3);
    const panBox = el('div', 'sxty-pan', wrap3);
    const h3 = cv.setupCanvas(tabBox, { height: 492 });
    const hP = cv.setupCanvas(panBox, { height: 492 });
    for (const c of [h3.canvas, hP.canvas]) c.style.touchAction = 'pan-y';
    h3.canvas.tabIndex = 0;
    h3.canvas.setAttribute('role', 'application');
    h3.canvas.setAttribute('aria-roledescription', 'tablet');
    h3.canvas.setAttribute('aria-label', 'Plimpton 322, fifteen rows. Up and down arrows choose a row; Enter sounds it.');
    hP.canvas.setAttribute('role', 'img');
    hP.canvas.setAttribute('aria-label', 'The chosen row’s right triangle, drawn to one long side among the diagonals ' +
      'of all fifteen rows, with the dashed half-square that none of them reaches. Its numbers are read out ' +
      'when a row is chosen on the tablet.');
    const live3 = liveRegion();
    const recipeBox = el('div', 'sxty-recipe');
    ui.caption(stage,
      'Hover or tap the rows, or use the arrow keys. The tablet is drawn with its slips intact: crimson marks what ' +
      'the clay actually says, and the panel gives the corrected reading. Column I survives, but the break runs along ' +
      'its left edge. Robson restores a 1 at the start of every entry, as the heading requires, and a few more signs ' +
      'at the top; restored signs are outlined. ' +
      'The strip beneath the tablet works the chosen row her way, from a reciprocal pair to the numbers on the clay. ' +
      'The dashed slot above row 1 is not on the clay. It is the half-square, width equal to length, which no row ' +
      'could hold, and <em>The Diagonal</em> is why. A tap on a row sounds its short side, long side and diagonal as ' +
      'three pitches.');
    ui.legendPanel(stage, `
      <p><strong>“They chose sixty for its many divisors.”</strong> The story is old: Theon of Alexandria, in
      the fourth century CE, explained sixty as the smallest number divisible by 1, 2, 3, 4 and 5. It may even be
      partly true, but nobody knows. Robert Englund, who helped decipher the earliest accounts, is blunt: “No
      compelling explanation has been advanced for the numerical structure of the sexagesimal” system. Other
      candidates include older units of weight and measure, the bookkeepers’ artificial year of twelve thirty-day
      months, and counting the twelve finger segments of one hand with the five fingers of the other. What the
      divisors may help explain is survival. Astronomers carried sexagesimal fractions from Babylon into Greek,
      Arabic, Latin and Sanskrit tables, and there they stayed, perhaps because an hour or a degree splits evenly
      into halves, thirds, quarters, fifths, sixths, tenths, twelfths, fifteenths, twentieths and thirtieths.</p>
      <p><strong>“The Babylonians discovered trigonometry.”</strong> In 2017 Daniel Mansfield and Norman
      Wildberger called the tablet “exact sexagesimal trigonometry”, and their university’s press release went
      further: “the world’s oldest and most accurate trigonometric table.” Their trigonometry has no angles in it,
      only exact ratios, and that is the difficulty: a list of shapes sorted by ratio is what the reciprocal pairs,
      the column headings and the scribal schools already explain, in the scribes’ own terms. Old Babylonian
      geometry measured slopes, not angles. As Eleanor Robson had put it, “Any resemblance Plimpton 322 might bear
      to modern mathematics is in our minds, not his.”</p>
      <p>And Pythagoras? The relation <code>s² + l² = d²</code> was scribal routine twelve centuries before him.
      The tale that he sacrificed oxen for “that famous diagram” rests on two lines of verse whose context is unknown, and
      the <em>Stanford Encyclopedia of Philosophy</em> is plain: “there is not a jot of evidence for a proof by
      Pythagoras.” What Greek mathematics added was the demand for proof, and <em>The Diagonal</em> shows the
      crisis hiding inside it.</p>`);

    // per-row derived data (corrected mathematics; written forms for display)
    const ROWS = PLIMPTON_ROWS.map((r) => {
      const l = longSideOf(r.s, r.d);
      const rp = recipPair(r.s, r.d);
      const cI = colIDigits(r.s, r.d);
      return {
        ...r, l, rp,
        sShow: r.sw ?? r.s, dShow: r.dw ?? r.d,
        slope: Number(r.s) / Number(l),
        angle: Math.atan2(Number(r.s), Number(l)) * 180 / Math.PI,
        cI, cIShow: r.cIw || cI,
        x: sexDisp(...rp.x), xi: sexDisp(...rp.xi),
        p: rp.x[0], q: rp.x[1],
        rc: recipeOf(r.s, r.d),
      };
    });

    let sel = 1;              // 0 = the slot no row can fill; 1..15 rows
    let dirty3 = true, dirtyP = true;
    const setSel = (i, announce) => {
      i = Math.max(0, Math.min(15, i));
      if (i === sel) return;
      sel = i; dirty3 = dirtyP = true;
      renderRecipe();
      if (announce) live3.textContent = rowSummary(i);
    };

    // Robson's recipe for the chosen row, as DOM text (selectable, readable
    // by assistive technology, and free to redraw).
    const placesStr = (dg) => dg[0] + ';' + dg.slice(1).map((v) => String(v).padStart(2, '0')).join(',');
    function renderRecipe() {
      const step = (k, v) => `<li><span class="k">${k}</span><span class="v">${v}</span></li>`;
      if (sel === 0) {
        const r2 = onePlusRoot2Places(5);
        recipeBox.innerHTML = '<div class="rh"><b>the recipe, run backwards · the missing row</b>' +
          '<i>width equal to length</i></div><ol>' +
          step('for width to equal length, half the difference of the pair must be 1', 'x − 1⁄x = 2') +
          step('so the pair would have to start from', `<span class="az">x = 1 + √2</span><br>= ${placesStr(r2)},…`) +
          step('a number that never ends in base sixty, so no igi table can hold it',
            `<span class="az">1⁄x = √2 − 1</span><br>= ${placesStr([0, ...r2.slice(1)])},…`) +
          step('row 1, the nearest, starts from its first two places',
            `x = <span class="au">2;24</span> <span class="dim">· ${ROWS[0].angle.toFixed(2)}°</span>`) +
          '</ol>';
        return;
      }
      const r = ROWS[sel - 1], rc = r.rc;
      const clay = (t) => ` <span class="cr">clay: ${t}</span>`;
      recipeBox.innerHTML = `<div class="rh"><b>Robson’s recipe · row ${r.row}</b>` +
        '<i>the pairs stood on the lost part of the tablet, as Robson restores it</i></div><ol>' +
        step('a reciprocal pair, as in the igi tables',
          `<span class="az">x = ${rc.x}</span><br><span class="az">1⁄x = ${rc.xi}</span>`) +
        step('half their difference and half their sum: the short side and diagonal when the long side is 1',
          `${rc.half.diff}<br>${rc.half.sum}`) +
        step('square the half-sum for column I; tear out 1, and the short side comes up',
          `<span class="au">${rc.colI}</span>${r.cIw ? clay(placesStr(r.cIw)) : ''}<br>− 1 = (${rc.half.diff})²`) +
        step((rc.factor !== '1' ? `clear the common factors (in all, ×&nbsp;${rc.factor})`
          : 'already whole in floating notation' +
            (gcdBig(r.s, r.d) > 1n ? `; the shared factor ${gcdBig(r.s, r.d)} is left in` : '')) +
            ': columns II and III',
          `<span class="au">${rc.s}</span>${r.sw ? clay(sexStr(r.sw)) : ''}<br>` +
          `<span class="au">${rc.d}</span>${r.dw ? clay(sexStr(r.dw)) : ''}`) +
        '</ol>';
    }
    renderRecipe();
    function rowSummary(i) {
      if (i === 0) return 'The missing row: width equal to length. No whole numbers satisfy d squared equals 2 l squared.';
      const r = ROWS[i - 1];
      return `Row ${r.row}: short side ${formatBig(r.s)}, long side ${formatBig(r.l)}, diagonal ${formatBig(r.d)}.` +
        (r.note ? ' ' + r.note : '');
    }

    // Column I as numerals, its first n places: "(1);59,00,15" (the 1 is lost).
    const colIText = (cI, n) => cI.slice(0, n)
      .map((d, k) => (k === 0 ? '(1)' : (k === 1 ? ';' : ',') + String(d).padStart(2, '0'))).join('');

    // Layout of the tablet canvas; cached per size and mode.
    let g3cache = null;
    function geo3() {
      const W = Math.max(80, h3.width), H = Math.max(120, h3.height);
      const key = `${W}x${H}:${translit}`;
      if (g3cache && g3cache.key === key) return g3cache;
      const wide = W >= 540;
      const lostW = wide ? Math.min(96, W * 0.15) : 0;
      const x0 = 6 + lostW, x1 = W - 8;
      const top = 8, headH = wide ? 42 : 38, bottom = H - 8;
      const rowsTop = top + headH;
      const rh = Math.max(4, (bottom - 8 - rowsTop) / 16);
      const inner = Math.max(40, x1 - x0 - 8);
      // narrow and transliterated: column I's long numerals get the room
      const fr = wide ? [0.47, 0.2, 0.21, 0.12] : translit ? [0.5, 0.17, 0.17, 0.16] : [0.43, 0.22, 0.23, 0.12];
      let cx = x0 + 4;
      const colsG = fr.map((f) => { const c = { x: cx, w: inner * f }; cx += inner * f; return c; });
      // one wedge size for the whole tablet, as a scribe would write it
      let u = Math.min(rh * 0.5, 15);
      const w2 = Math.max(...ROWS.map((r) => placesWidth(sexOf(r.sShow))));
      const w3 = Math.max(...ROWS.map((r) => placesWidth(sexOf(r.dShow))));
      u = Math.min(u, (colsG[1].w - 10) / w2, (colsG[2].w - 10) / w3, (colsG[3].w - 8) / placesWidth([15]));
      const w1 = Math.max(...ROWS.map((r) => placesWidth(r.cIShow)));
      const u1 = (colsG[0].w - 12) / w1;
      const cIText = translit || u1 < 5.5;
      if (!cIText) u = Math.min(u, u1);
      const wedgesText = translit || u < 4;
      u = Math.max(1, u);
      // Numerals, when shown, are measured and shrunk to fit their columns.
      const tctx = h3.ctx;
      const monoMax = Math.max(8, Math.min(12, rh * 0.44));
      const fitMono = (strs, w) => {
        tctx.font = font(monoMax, { mono: true });
        const mw = Math.max(1, ...strs.map((s) => tctx.measureText(s).width));
        return monoMax * Math.min(1, Math.max(1, w) / mw);
      };
      const pxI = fitMono(ROWS.map((r) => colIText(r.cIShow, r.cIShow.length)), colsG[0].w - 8);
      const pxR = Math.min(fitMono(ROWS.map((r) => sexOf(r.sShow).join(',')), colsG[1].w - 10),
        fitMono(ROWS.map((r) => sexOf(r.dShow).join(',')), colsG[2].w - 10), fitMono(['KI.15'], colsG[3].w - 10));
      const monoPx = Math.max(7, cIText && wedgesText ? Math.min(pxI, pxR) : cIText ? pxI : pxR);
      // The break: just right of the signs each row has lost.
      const lostWidth = (r) => {
        const n = 1 + (r.lost || 0);
        if (cIText) { tctx.font = font(monoPx, { mono: true }); return tctx.measureText(colIText(r.cIShow, n)).width + 1; }
        return placesWidth(r.cIShow.slice(0, n)) * u + PLACE_GAP * u * 0.5;
      };
      const rnd = mulberry32(1945);
      const brk = [];
      const bx = (i) => colsG[0].x + lostWidth(ROWS[i]) + 2;
      brk.push([bx(0) + 5 + rnd() * 3, top]);
      brk.push([bx(0) + 2 + rnd() * 4, rowsTop - 4]);
      for (let i = 0; i < 15; i++) {
        const y = rowsTop + (i + 1) * rh;
        brk.push([bx(i) + rnd() * 3.5, y + rh * (0.1 + rnd() * 0.3)]);
        brk.push([bx(i) + 1 + rnd() * 4, y + rh * (0.55 + rnd() * 0.35)]);
      }
      brk.push([bx(14) + 2 + rnd() * 5, bottom]);
      g3cache = { key, W, H, wide, lostW, x0, x1, top, headH, rowsTop, bottom, rh, cols: colsG, u, cIText, wedgesText, monoPx, brk };
      return g3cache;
    }
    const rowTop3 = (g, i) => g.rowsTop + i * g.rh;     // i = 0 (slot) … 15
    function rowAt3(y) {
      const g = geo3();
      const i = Math.floor((y - g.rowsTop) / g.rh);
      return i >= 0 && i <= 15 ? i : -1;
    }

    function tabletPath(ctx, g) {
      const r = 12, right = g.x1, top = g.top, bottom = g.bottom;
      const b = g.brk;
      ctx.beginPath();
      ctx.moveTo(b[0][0], top);
      ctx.quadraticCurveTo((b[0][0] + right) / 2, top - 2.5, right - r, top);
      ctx.quadraticCurveTo(right, top, right, top + r);
      ctx.quadraticCurveTo(right + 2.5, (top + bottom) / 2, right, bottom - r);
      ctx.quadraticCurveTo(right, bottom, right - r, bottom);
      ctx.quadraticCurveTo((b[b.length - 1][0] + right) / 2, bottom + 2.5, b[b.length - 1][0], bottom);
      for (let i = b.length - 2; i >= 0; i--) ctx.lineTo(b[i][0], b[i][1]);
      ctx.closePath();
    }

    const HEAD_EN = [
      ['takiltum-square of the diagonal,', '1 torn out: the short side comes up'],
      ['square-side of', 'the short side'], ['square-side of', 'the diagonal'], ['its', 'name'],
    ];
    const HEAD_SHORT = [['takiltum'], ['short side'], ['diagonal'], ['name']];
    const HEAD_TR = [
      ['[ta]-ki-il-ti ṣi-li-ip-tim', '[ša 1 in]-na-as-sà-ḫu-ú-ma', 'SAG i-il-lu-ú'],
      ['ÍB.SI₈', 'SAG'], ['ÍB.SI₈', 'ṣi-li-ip-tim'], ['MU.BI.IM'],
    ];
    function fitLines(ctx, lines, maxW, sizes, italic) {
      for (const px of sizes) {
        ctx.font = font(px, { italic });
        if (lines.every((t) => ctx.measureText(t).width <= maxW)) return px;
      }
      return 0;
    }

    function draw3() {
      const { ctx } = h3;
      const g = geo3();
      const { W, H, rh, u } = g;
      ctx.clearRect(0, 0, W, H);

      // the lost left part: Robson's hypothetical reciprocal pairs
      if (g.lostW > 0) {
        const lx = 6, lw = g.lostW - 6;
        ctx.strokeStyle = rgba(P.azureDim, 0.55); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.strokeRect(lx + 0.5, g.top + 0.5, lw - 1, g.bottom - g.top - 1);
        ctx.setLineDash([]);
        ctx.font = font(11, { italic: true }); ctx.fillStyle = P.azure; ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('lost: x, 1⁄x ?', lx + lw / 2, g.top + 16);
        ctx.font = font(9.5, { italic: true }); ctx.fillStyle = rgba(P.azure, 0.75);
        ctx.fillText('after Robson', lx + lw / 2, g.top + 30);
        // one size for the column, fitted to its longest pair (row 10's 0;29,37,46,40)
        ctx.font = font(10, { mono: true });
        const widest = Math.max(...ROWS.map((r) => Math.max(ctx.measureText(r.x).width, ctx.measureText(r.xi).width)));
        const mp = Math.max(6, Math.min(10, rh * 0.36, 10 * (lw - 10) / Math.max(1, widest)));
        ctx.font = font(mp, { mono: true }); ctx.textAlign = 'right';
        for (let i = 0; i < 15; i++) {
          const r = ROWS[i], y = rowTop3(g, i + 1), on = sel === i + 1;
          ctx.fillStyle = on ? mix(P.azure, P.ink, 0.45) : rgba(P.azure, 0.55);
          ctx.fillText(r.x, lx + lw - 5, y + rh * 0.45);
          ctx.fillStyle = on ? P.azure : rgba(P.azureDim, 0.95);
          ctx.fillText(r.xi, lx + lw - 5, y + rh * 0.45 + mp + 1);
        }
      }

      // clay: shadow, texture, rim
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
      tabletPath(ctx, g); ctx.fillStyle = CLAY; ctx.fill();
      ctx.restore();
      ctx.save();
      tabletPath(ctx, g); ctx.clip();
      ctx.drawImage(clayFor('tablet', W, H, h3.dpr, 1822), 0, 0, W, H);
      // rulings
      for (let i = 1; i < 4; i++) {
        const x = Math.round(g.cols[i].x - 3) + 0.5;
        incise(ctx, x, g.top + 3, x, g.bottom - 3);
      }
      for (let i = 0; i <= 16; i++) {
        const y = Math.round(rowTop3(g, i)) + 0.5;
        incise(ctx, g.cols[0].x - 30, y, g.x1 - 3, y);
      }
      // the slot no row fills
      {
        const y = rowTop3(g, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(g.cols[0].x - 30, y + 1, g.x1 - g.cols[0].x + 30, rh - 1);
      }
      // selected row
      if (sel > 0) {
        const y = rowTop3(g, sel);
        const gr = ctx.createLinearGradient(g.cols[0].x, 0, g.x1, 0);
        gr.addColorStop(0, rgba(P.goldBright, 0.03)); gr.addColorStop(0.4, rgba(P.goldBright, 0.12));
        gr.addColorStop(1, rgba(P.goldBright, 0.05));
        ctx.fillStyle = gr; ctx.fillRect(g.cols[0].x - 30, y + 1, g.x1 - g.cols[0].x + 30, rh - 1);
      }
      tabletPath(ctx, g);                                           // inner bevel
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.stroke();
      ctx.restore();
      // rim and broken edge
      tabletPath(ctx, g);
      ctx.strokeStyle = rgba(P.goldBright, 0.1); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      g.brk.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = rgba(P.goldBright, 0.14); ctx.lineWidth = 0.8;
      ctx.beginPath();
      g.brk.forEach(([x, y], i) => (i ? ctx.lineTo(x + 1.5, y) : ctx.moveTo(x + 1.5, y)));
      ctx.stroke();

      // headings
      const heads = translit ? HEAD_TR : HEAD_EN;
      ctx.textBaseline = 'alphabetic';
      for (let c = 0; c < 4; c++) {
        const col = g.cols[c];
        const x0 = c === 0 ? g.brk[0][0] + 6 : col.x + 2;
        const maxW = Math.max(10, col.x + col.w - x0 - 8);
        let lines = heads[c];
        let px = fitLines(ctx, lines, maxW, lines.length > 2 ? [10, 9, 8] : [11, 10, 9, 8], !translit);
        if (!px) { lines = translit ? [heads[c][c === 1 || c === 2 ? 1 : 0]] : HEAD_SHORT[c]; px = fitLines(ctx, lines, maxW, [10, 9, 8, 7], !translit) || 7; }
        ctx.font = font(px, { italic: !translit });
        ctx.fillStyle = mix(P.inkDim, P.ink, 0.2);
        ctx.textAlign = c === 0 ? 'left' : 'right';
        const tx = c === 0 ? x0 : col.x + col.w - 6;
        const lh = px + 3;
        const y0 = g.top + (g.headH - lines.length * lh) / 2 + px;
        lines.forEach((t, k) => ctx.fillText(t, tx, y0 + k * lh));
      }

      // the slot
      {
        const y = rowTop3(g, 0);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = sel === 0 ? P.crimsonBright : rgba(P.crimson, 0.75);
        ctx.lineWidth = sel === 0 ? 1.5 : 1;
        ctx.strokeRect(Math.round(g.brk[1][0] + 6) + 0.5, Math.round(y + 3) + 0.5, Math.max(4, g.x1 - g.brk[1][0] - 14), Math.max(2, rh - 6));
        ctx.setLineDash([]);
        const msg = g.wide ? 'no row holds the half-square: width = length' : 'no row: width = length';
        ctx.font = font(Math.max(9, Math.min(12, rh * 0.45)), { italic: true });
        ctx.fillStyle = sel === 0 ? P.crimsonBright : rgba(P.crimsonBright, 0.85);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(msg, (g.brk[1][0] + g.x1) / 2, y + rh / 2 + 0.5);
        ctx.restore();
      }

      // the fifteen rows
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 15; i++) {
        const r = ROWS[i];
        const on = sel === i + 1;
        const y = rowTop3(g, i + 1), yTop = y + (rh - DIGIT_H * u) / 2, yMid = y + rh / 2;
        const tone = on ? TONES.sel : TONES.gold;
        const slipTone = on ? TONES.slipSel : TONES.slip;
        const nLost = 1 + (r.lost || 0);
        // column I, left-aligned from the lost edge
        const c1 = g.cols[0];
        if (g.cIText) {
          ctx.font = font(g.monoPx, { mono: true }); ctx.textAlign = 'left';
          let x = c1.x;
          r.cIShow.forEach((d, k) => {
            const txt = (k === 0 ? '' : k === 1 ? ';' : ',') + (k === 0 ? String(d) : String(d).padStart(2, '0'));
            const ghost = k < nLost;
            ctx.fillStyle = ghost ? rgba(P.goldBright, 0.38) : r.cIbad && r.cIbad.includes(k)
              ? P.crimsonBright : on ? P.goldBright : P.gold;
            const t = ghost && k === 0 ? '(1)' : txt;
            ctx.fillText(t, x, yMid);
            x += ctx.measureText(t).width + (k === 0 ? 1 : 0);
          });
        } else {
          drawPlaces(ctx, r.cIShow, c1.x, yTop, u,
            (k) => (r.cIbad && r.cIbad.includes(k) ? slipTone : tone), (k) => k < nLost);
        }
        // columns II–IV, right-aligned
        const cells = [[g.cols[1], sexOf(r.sShow), !!r.sw], [g.cols[2], sexOf(r.dShow), !!r.dw],
          [g.cols[3], sexOf(BigInt(r.row)), false]];
        cells.forEach(([col, digs, slip], k) => {
          const x1 = col.x + col.w - 6;
          if (g.wedgesText) {
            ctx.font = font(g.monoPx, { mono: true }); ctx.textAlign = 'right';
            ctx.fillStyle = slip ? P.crimsonBright : k === 2 ? P.inkDim : on ? P.goldBright : P.gold;
            ctx.fillText(k === 2 ? 'KI.' + r.row : digs.join(','), x1, yMid);
          } else {
            const w = placesWidth(digs) * u;
            drawPlaces(ctx, digs, x1 - w, yTop, u, () => (slip ? slipTone : k === 2 ? TONES.dim : tone));
          }
        });
        if (r.note) {
          ctx.fillStyle = on ? P.crimsonBright : rgba(P.crimson, 0.9);
          ctx.beginPath(); ctx.arc(g.x1 - 4.5, yMid, Math.max(0, on ? 2.4 : 1.8), 0, TAU); ctx.fill();
        }
      }
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

      // keyboard focus
      if (document.activeElement === h3.canvas) {
        const y = rowTop3(g, sel);
        ctx.strokeStyle = rgba(P.goldBright, 0.7); ctx.setLineDash([2, 3]);
        ctx.strokeRect(g.cols[0].x - 2.5, y + 1.5, g.x1 - g.cols[0].x - 2, rh - 3);
        ctx.setLineDash([]);
      }
    }

    /* ---------- the panel: the chosen triangle among all fifteen ---------- */
    // Rich text: paragraphs of {t, f: 'serif'|'italic'|'mono', c} segments,
    // wrapped at word boundaries to a measure.
    function layoutRich(ctx, paras, maxW, size) {
      const lines = [];
      const lh = Math.round(size * 1.5);
      for (const para of paras) {
        const sz = para.size || size;
        const fnt = (f) => font(sz, { mono: f === 'mono', italic: f === 'italic' });
        let line = [], w = 0;
        const flush = () => { lines.push({ items: line, h: Math.round(sz * 1.5) }); line = []; w = 0; };
        for (const seg of para.segs) {
          ctx.font = fnt(seg.f);
          const words = seg.t.split(/(\s+)/).filter((s) => s.length);
          for (const word of words) {
            const ww = ctx.measureText(word).width;
            if (/^\s+$/.test(word)) { if (line.length) { line.push({ t: word, f: fnt(seg.f), c: seg.c, w: ww }); w += ww; } continue; }
            if (w + ww > maxW && line.length) {
              while (line.length && /^\s+$/.test(line[line.length - 1].t)) { w -= line.pop().w; }
              flush();
            }
            line.push({ t: word, f: fnt(seg.f), c: seg.c, w: ww }); w += ww;
          }
        }
        if (line.length) flush();
        if (para.gap) lines.push({ items: [], h: para.gap });
      }
      return { lines, height: lines.reduce((s, l) => s + l.h, 0), lh };
    }
    function drawRich(ctx, lay, x, y) {
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      let cy = y;
      for (const line of lay.lines) {
        let cx = x;
        for (const it of line.items) { ctx.font = it.f; ctx.fillStyle = it.c; ctx.fillText(it.t, cx, cy + line.h * 0.72); cx += it.w; }
        cy += line.h;
      }
    }

    function panelText(which = sel) {
      const S = (t, c) => ({ t, f: 'serif', c: c || P.inkDim });
      const I = (t, c) => ({ t, f: 'italic', c: c || P.inkDim });
      const M = (t, c) => ({ t, f: 'mono', c: c || P.ink });
      if (which === 0) {
        return [
          { segs: [S('width = length means '), M('d² = 2·l²', P.crimsonBright), S(', and no whole numbers obey that, so no row can hold it.')], gap: 5 },
          { segs: [I('YBC 7289', P.ink), S(', a student’s round tablet at Yale, gives a square of side '), M('30'),
            S(' the diagonal '), M('42;25,35'), S(', from √2 = '), M('1;24,51,10', P.goldBright), S(' = '), M('1.41421296…')], gap: 5 },
          { segs: [S('That is off by '), M('6.0×10⁻⁷'), S('. At 240 Hz it and the true √2 would beat once every '), M('1 h 56 min', P.goldBright), S('.')], gap: 5 },
          { segs: [I('Tap the slot to hear √2 : 1, the tritone.', INK_FAINT)] },
        ];
      }
      const r = ROWS[which - 1];
      // (p²−q², 2pq, p²+q²) gives this row's shape; say so when the row is a multiple of it
      const base = r.p * r.p - r.q * r.q;
      const scaleNote = r.s === base ? '' : r.s % base === 0n ? `, × ${r.s / base}` : base % r.s === 0n ? `, ÷ ${base / r.s}` : '';
      const out = [
        { segs: [S('short side '), M(`${sexStr(r.s)} = ${formatBig(r.s)}`, P.gold), S('   diagonal '), M(`${sexStr(r.d)} = ${formatBig(r.d)}`)] },
        { segs: [S('long side, never written '), M(`${sexStr(r.l)} = ${formatBig(r.l)}`, P.azure)] },
        { segs: [M(`${formatBig(r.s)}² + ${formatBig(r.l)}² = ${formatBig(r.d)}²  ✓`, P.verdant)], gap: 4 },
        { segs: [S('generating pair  '), M(`p = ${r.p}, q = ${r.q}${scaleNote}`), I('  Neugebauer & Sachs', INK_FAINT)] },
        { segs: [S('and '), M('p⁄q'), S(' is Robson’s '), M(`x = ${r.x}`, P.azure), S(': the same numbers, read the scribes’ way')] },
      ];
      if (r.note) { out[out.length - 1].gap = 5; out.push({ segs: [I(r.note, P.crimsonBright)] }); }
      return out;
    }

    function drawYBC(ctx, cx, cy, R) {
      if (R < 8) return;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = CLAY; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.drawImage(clayFor('ybc', R * 2, R * 2, hP.dpr, 7289), cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
      ctx.strokeStyle = rgba(P.goldBright, 0.14); ctx.lineWidth = 1; ctx.stroke();
      // The square as the tablet is usually photographed: a diamond with a level
      // diagonal, √2 written above that diagonal, 30·√2 below it, 30 on a side.
      const h = R * 0.8;                                      // half-diagonal
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - h, cy); ctx.lineTo(cx, cy - h); ctx.lineTo(cx + h, cy); ctx.lineTo(cx, cy + h); ctx.closePath();
      ctx.moveTo(cx - h, cy); ctx.lineTo(cx + h, cy); ctx.moveTo(cx, cy - h); ctx.lineTo(cx, cy + h);
      ctx.stroke();
      const digs = [1, 24, 51, 10], digs2 = [42, 25, 35];                       // √2, and 30·√2
      // each row must fit the diamond's width at its far edge: w + 2·(height) ≤ 2h
      const lineH = DIGIT_H + 0.3;
      const v = Math.max(1.5, (2 * h * 0.94) / (Math.max(placesWidth(digs), placesWidth(digs2)) + 2 * lineH));
      const w = placesWidth(digs) * v, w2 = placesWidth(digs2) * v;
      drawPlaces(ctx, digs, cx - w / 2, cy - v * lineH, v, () => TONES.sel);
      drawPlaces(ctx, digs2, cx - w2 / 2, cy + v * 0.3, v, () => TONES.gold);
      const u = v * 1.1, g30 = digitGroup(30);
      ctx.save();
      ctx.translate(cx - h / 2, cy - h / 2); ctx.rotate(-Math.PI / 4);           // along the upper-left side
      drawDigit(ctx, 30, -(g30.w * u) / 2, -g30.h * u - 3, u, TONES.gold);
      ctx.restore();
      ctx.restore();
      ctx.font = font(11, { italic: true }); ctx.fillStyle = P.inkDim; ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('YBC 7289', cx, cy - R - 5);
    }

    // The figure keeps one size for every row: the text block is measured for
    // all sixteen choices and the tallest sets the layout.
    let gPcache = null;
    function geoP() {
      const W = Math.max(80, hP.width), H = Math.max(120, hP.height);
      const key = `${W}x${H}`;
      if (!gPcache || gPcache.key !== key) {
        const { ctx } = hP;
        const pad = 14, size = W < 340 ? 12 : 13;
        const lays = [];
        for (let i = 0; i <= 15; i++) lays.push(layoutRich(ctx, panelText(i), W - 2 * pad, size));
        const textH = Math.max(...lays.map((l) => l.height));
        const titleH = 30;
        const figTop = pad + titleH, figBot = Math.max(figTop + 40, H - pad - textH - 12);
        const fh = figBot - figTop, fw = W - 2 * pad;
        const L = Math.max(20, Math.min(fw - 70, fh - 22));
        const ox = pad + Math.max(0, (fw - L) / 2 - 24), oy = figBot - 16;
        gPcache = { key, W, H, pad, lays, figTop, figBot, L, ox, oy };
      }
      return gPcache;
    }
    function drawPanel() {
      const { ctx } = hP;
      const g = geoP();
      const { W, H, pad, L, ox, oy } = g;
      ctx.clearRect(0, 0, W, H);
      // title
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.font = font(17, { italic: true });
      ctx.fillStyle = sel === 0 ? P.crimsonBright : P.goldBright;
      ctx.fillText(sel === 0 ? 'The missing row' : `Row ${sel}`, pad, pad + 16);
      if (sel > 0) {
        const r = ROWS[sel - 1];
        const deg = `${r.angle.toFixed(2)}°`;
        ctx.textAlign = 'right';
        ctx.font = font(12, { mono: true }); ctx.fillStyle = P.inkDim;
        ctx.fillText(deg, W - pad, pad + 15);
        const nw = ctx.measureText(deg).width;
        ctx.font = font(11, { italic: true }); ctx.fillStyle = INK_FAINT;
        if (W > 300) ctx.fillText('in our degrees', W - pad - nw - 7, pad + 15);
      }
      ctx.textAlign = 'left';

      // the fan: every row's diagonal, scaled to one long side
      const X = ox + L;
      ctx.lineWidth = 1;
      for (let i = 0; i < 15; i++) {
        const y = oy - L * ROWS[i].slope;
        ctx.strokeStyle = rgba(P.azure, sel === i + 1 ? 0 : 0.22);
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, y); ctx.stroke();
        ctx.fillStyle = rgba(P.azure, 0.55);
        ctx.beginPath(); ctx.arc(X, y, 1.6, 0, TAU); ctx.fill();
      }
      // the half-square, which no row reaches
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = sel === 0 ? P.crimsonBright : rgba(P.crimson, 0.85);
      ctx.lineWidth = sel === 0 ? 1.6 : 1.1;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, oy - L); ctx.stroke();
      ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = rgba(P.crimson, 0.5);
      ctx.beginPath(); ctx.moveTo(X, oy - L * ROWS[0].slope - 3); ctx.lineTo(X, oy - L); ctx.stroke();
      ctx.restore();
      ctx.font = font(11, { italic: true }); ctx.fillStyle = P.crimsonBright;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('width = length', X - 14, oy - L - 5);

      // the chosen triangle
      const slope = sel === 0 ? 1 : ROWS[sel - 1].slope;
      const Y = oy - L * slope;
      ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.strokeStyle = P.azure; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, oy); ctx.stroke();
      ctx.strokeStyle = P.gold; ctx.beginPath(); ctx.moveTo(X, oy); ctx.lineTo(X, Y); ctx.stroke();
      if (sel === 0) {
        ctx.setLineDash([6, 5]); ctx.strokeStyle = P.crimsonBright;
      } else ctx.strokeStyle = P.ink;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, Y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
      ctx.strokeStyle = INK_FAINT; ctx.lineWidth = 1;
      ctx.strokeRect(X - 9.5, oy - 9.5, 9, 9);
      if (sel > 0) glowGold().draw(ctx, X, Y, 0.4);
      // angle arc
      const ar = Math.min(34, L * 0.18), th = Math.atan(slope);
      ctx.strokeStyle = rgba(P.inkDim, 0.6); ctx.beginPath(); ctx.arc(ox, oy, ar, -th, 0); ctx.stroke();
      // labels
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(12, { mono: true });
      if (sel > 0) {
        const r = ROWS[sel - 1];
        ctx.fillStyle = P.azure; ctx.textAlign = 'center';
        ctx.fillText(`l = ${formatBig(r.l)}`, ox + L / 2, oy + 15);
        ctx.fillStyle = P.gold; ctx.textAlign = 'left';
        const sl = `s = ${formatBig(r.s)}`;
        if (W - X > ctx.measureText(sl).width + 12) ctx.fillText(sl, X + 7, (oy + Y) / 2 + 4);
        else { ctx.textAlign = 'right'; ctx.fillText(sl, X - 7, (oy + Y) / 2 + 12); }
        ctx.fillStyle = P.ink; ctx.textAlign = 'right';
        const mx = ox + L * 0.5, my = oy - L * slope * 0.5;
        ctx.fillText(`d = ${formatBig(r.d)}`, mx - 8, my - 8);
      } else {
        ctx.fillStyle = P.azure; ctx.textAlign = 'center';
        ctx.fillText('l', ox + L / 2, oy + 15);
        ctx.fillStyle = P.gold; ctx.textAlign = 'left';
        ctx.fillText('s = l', X + 7, oy - L / 2 + 4);
        ctx.fillStyle = P.crimsonBright; ctx.textAlign = 'right';
        ctx.fillText('d = ?', ox + L * 0.5 - 8, oy - L * 0.5 - 8);
        // YBC 7289, in the empty half above the diagonal
        const R = Math.max(0, Math.min((L - 10) / 3.5, 66));
        if (R > 18) drawYBC(ctx, ox + R + 2, oy - L + R + 2, R);
      }
      ctx.textAlign = 'left';

      // text
      drawRich(ctx, g.lays[sel], pad, g.figBot + 8);
    }

    function soundRow(i) {
      audio.ensureAudio();
      const t0 = bus.context.currentTime;
      if (i === 0) {        // the missing half-square sings √2 : 1, the tritone
        audio.playTone(bus, { freq: 240, dur: 0.9, level: 0.24, when: t0 });
        audio.playTone(bus, { freq: 240 * Math.SQRT2, dur: 0.9, level: 0.24, when: t0 + 0.05 });
      } else {
        const r = ROWS[i - 1];
        const fl = 260, fs = 260 * Number(r.s) / Number(r.l), fd = 260 * Number(r.d) / Number(r.l);
        audio.playTone(bus, { freq: fs, dur: 0.3, level: 0.28, when: t0 });
        audio.playTone(bus, { freq: fl, dur: 0.3, level: 0.28, when: t0 + 0.14 });
        audio.playTone(bus, { freq: fd, dur: 0.45, level: 0.28, when: t0 + 0.28 });
      }
    }

    h3.canvas.addEventListener('pointermove', (e) => {
      const [, y] = cv.pointerPos(h3, e);
      const i = rowAt3(y);
      if (i >= 0) setSel(i);
    });
    h3.canvas.addEventListener('pointerdown', (e) => {
      const [, y] = cv.pointerPos(h3, e);
      const i = rowAt3(y);
      if (i < 0) return;
      setSel(i, true);
      soundRow(i);
    });
    h3.canvas.addEventListener('keydown', (e) => {
      if (noScrollKeys.has(e.key)) e.preventDefault();
      if (e.key === 'ArrowDown') setSel(sel + 1, true);
      else if (e.key === 'ArrowUp') setSel(sel - 1, true);
      else if (e.key === 'Home') setSel(0, true);
      else if (e.key === 'End') setSel(15, true);
      else if (e.key === 'Enter' || e.key === ' ') soundRow(sel);
    });
    h3.canvas.addEventListener('focus', () => { dirty3 = true; live3.textContent = rowSummary(sel); });
    h3.canvas.addEventListener('blur', () => { dirty3 = true; });
    // the fan answers too: point near a diagonal to choose its row
    function rayAt(x, y) {
      const g = geoP();
      if (x < g.ox + 6 || x > g.ox + g.L + 20 || y > g.oy + 4 || y < g.figTop - 4) return -1;
      const s = (g.oy - y) / Math.max(1, x - g.ox);
      let best = -1, bd = 0.03;
      if (Math.abs(s - 1) < bd) { best = 0; bd = Math.abs(s - 1); }
      ROWS.forEach((r, i) => { const d = Math.abs(s - r.slope); if (d < bd) { bd = d; best = i + 1; } });
      return best;
    }
    hP.canvas.addEventListener('pointermove', (e) => {
      const [x, y] = cv.pointerPos(hP, e);
      const i = rayAt(x, y);
      if (i >= 0) setSel(i);
    });
    hP.canvas.addEventListener('pointerdown', (e) => {
      const [x, y] = cv.pointerPos(hP, e);
      const i = rayAt(x, y);
      if (i >= 0) { setSel(i, true); soundRow(i); }
    });
    h3.onResize(() => { dirty3 = dirtyP = true; });
    hP.onResize(() => { dirtyP = true; });

    /* ======================= CODA — regular numbers are a tuning ======================= */
    label('coda · regular numbers are a tuning');
    ui.mathline(stage,
      '2:1 octave · 3:2 fifth · 5:4 major third: every 5-limit interval is a ratio of regular numbers');
    const keysRow = el('div', 'sxty-keys');
    const wrapS = el('div');
    const hS = cv.setupCanvas(wrapS, { height: 112 });
    hS.canvas.style.touchAction = 'pan-y';
    hS.canvas.setAttribute('role', 'img');
    hS.canvas.setAttribute('aria-label', 'An oscilloscope of the drone and the chosen interval, with their sum.');
    const keyLine = dimLine();
    keyLine.textContent = 'press a key: each sounds its ratio against a low drone';
    let scopeDirty = true;
    hS.onResize(() => { scopeDirty = true; });
    ui.caption(stage,
      'The regular numbers, built from 2, 3 and 5 alone, that make Babylonian division terminate are exactly the building blocks of ' +
      '5-limit just intonation: the octave, the fifth, the major third, and everything made from them. But ' +
      'membership is not sweetness. 9:8 and 15:8 are regular and restless, while 7:4, which no reciprocal table ' +
      'admits, closes its pattern every four cycles, as tidily as a major third; watch the scope. What the three ' +
      'primes buy is a <em>system</em>, a tuning you can write in the scribes’ own numbers. Movement II takes that ' +
      'system apart.');
    ui.speculationPanel(stage, `
      <p>What the tablet was for is still argued. This page follows Robson’s teacher’s list, but Daniel
      Mansfield has read Si.427, a field plan excavated at Sippar in 1894, as right angles laid out with the
      triples (5, 12, 13) and (8, 15, 17), and in 2021 he proposed that Plimpton 322 served surveyors
      instead.</p>
      <p>A larger question sits underneath. The wedges were invented, and so, as far as anyone can tell, was
      sixty. But once sixty was chosen, which divisions end was not a matter of taste: the regular numbers were
      settled before the first scribe pressed the first wedge, and would be the same for anyone, anywhere, who
      counts in sixties. The students of Nippur learned by heart a list no king could have amended. Perhaps that is
      the shape of all mathematics: a free choice of notation, and then a landscape that answers back.</p>`,
    'here the ground becomes conjecture');

    const RATIOS = [
      [1, 1, 'unison'], [9, 8, 'major tone'], [5, 4, 'major third'], [4, 3, 'fourth'], [3, 2, 'fifth'],
      [5, 3, 'major sixth'], [15, 8, 'major seventh'], [2, 1, 'octave'], [7, 4, '7th harmonic'], [11, 8, '11th harmonic'],
    ];
    const keyBtns = [];
    let activeKey = -1;
    let droneV = null, intV = null;
    const F0 = 220;
    RATIOS.forEach(([n, d, name], i) => {
      const reg = isRegular(n) && isRegular(d);
      const b = ui.button(keysRow, '', () => pressKey(i), { small: true });
      b.classList.add('sxty-key');
      if (!reg) b.classList.add('off7');
      b.innerHTML = `<span>${n}:${d}</span><small>${name}</small>`;
      b.setAttribute('aria-pressed', 'false');
      keyBtns.push(b);
    });

    function keysOff() {
      activeKey = -1;
      keyBtns.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      if (droneV) { droneV.off(); intV.off(); }
      keyLine.textContent = 'press a key: each sounds its ratio against a low drone';
      scopeDirty = true;
    }
    function pressKey(i) {
      audio.ensureAudio();
      if (activeKey === i) { keysOff(); return; }
      if (!droneV) {
        droneV = audio.voice(bus, { freq: F0, level: 0.24 });
        intV = audio.voice(bus, { type: 'triangle', freq: F0, level: 0.18 });
      }
      activeKey = i;
      keyBtns.forEach((b, j) => { b.classList.toggle('active', j === i); b.setAttribute('aria-pressed', String(j === i)); });
      const [n, d, name] = RATIOS[i];
      intV.setFreq(F0 * n / d);
      droneV.on(); intV.on();
      scopeDirty = true;
      const per = periodCycles(n, d);
      const reg = isRegular(n) && isRegular(d);
      const igi = (k) => (k === 1 ? '1' : igiOf(k));
      if (n === 1 && d === 1) {
        keyLine.textContent = '1:1, the same number twice: nothing to divide, nothing to beat';
      } else if (n === 9 || n === 15) {
        keyLine.textContent = `${n}:${d}, the ${name}: both terms regular (igi ${d} = ${igi(d)}), so it belongs to 5-limit tuning, ` +
          `and it is restless all the same; it closes every ${per} cycles`;
      } else if (reg) {
        keyLine.textContent = `${n}:${d}, the ${name}: both terms regular (igi ${d} = ${igi(d)}), a 5-limit interval; ` +
          `it closes every ${per} cycle${per === 1 ? '' : 's'}`;
      } else {
        const bad = isRegular(n) ? d : n;
        keyLine.textContent = `${n}:${d}: ${bad} is igi nu, so the ratio has no place in the scribe’s tables or in 5-limit ` +
          `tuning. Yet it closes every ${per} cycles` + (per === 4 ? ', as tidily as the major third' : '');
      }
    }

    function drawScope(t) {
      const { ctx } = hS;
      const W = Math.max(40, hS.width), H = Math.max(30, hS.height);
      ctx.clearRect(0, 0, W, H);
      const x0 = 8, x1 = W - 8, mid = H / 2 - 6, amp = Math.max(4, H * 0.3);
      ctx.strokeStyle = rgba(P.inkDim, 0.18); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Math.round(mid) + 0.5); ctx.lineTo(x1, Math.round(mid) + 0.5); ctx.stroke();
      if (activeKey < 0) {
        ctx.font = font(12, { italic: true }); ctx.fillStyle = INK_FAINT; ctx.textAlign = 'center';
        ctx.fillText('silence: choose a ratio', W / 2, H - 8);
        return;
      }
      const [n, d] = RATIOS[activeKey];
      const r = n / d, per = periodCycles(n, d);
      const CYCLES = 8;
      const phase = reduced ? 0 : (t * 0.35) % 1;
      const N = Math.max(40, Math.min(Math.round(x1 - x0), 480));
      const trace = (fn, color, lw) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const cyc = (i / N) * CYCLES + phase;
          const sx = x0 + (i / N) * (x1 - x0), sy = mid - fn(cyc) * amp;
          i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
        }
        ctx.stroke();
      };
      trace((c) => Math.sin(TAU * c) * 0.5, rgba(P.azure, 0.32), 1);
      trace((c) => Math.sin(TAU * r * c) * 0.5, rgba(P.gold, 0.32), 1);
      const reg = isRegular(n) && isRegular(d);
      trace((c) => 0.5 * (Math.sin(TAU * c) + Math.sin(TAU * r * c)), reg ? P.goldBright : P.crimsonBright, 1.6);
      // where the pattern closes: every `per` cycles of the drone
      for (let c = Math.ceil(phase / per) * per; c <= CYCLES + phase; c += per) {
        const x = x0 + ((c - phase) / CYCLES) * (x1 - x0);
        if (x < x0 - 1 || x > x1 + 1) continue;
        ctx.globalAlpha = 0.9;
        glowGold().draw(ctx, x, mid, 0.34);
        ctx.globalAlpha = 1;
      }
      ctx.font = font(12, { italic: true }); ctx.fillStyle = P.inkDim; ctx.textAlign = 'right';
      ctx.fillText(per > 1 ? `the pattern closes every ${per} cycles of the drone` : 'the pattern closes every cycle', x1, H - 6);
      ctx.textAlign = 'left';
    }

    /* ---------- master loop ---------- */
    const loop = cv.rafLoop((dt, t) => {
      const now = performance.now() / 1000;
      // station i: step through the readings (decorative motion: off under reduced motion)
      if (!reduced && flickList.length > 1 && now > flickAt) {
        flickAt = now + (flickList.length > 4 ? 1.0 : 1.3);
        stepReading(1, false);
      }
      if (stampAnim) dirty1 = true;
      if (dirty1) { dirty1 = false; draw1(now); }
      // station ii: consume the audio-clock queue
      if (raceQueue.length && bus.context) {
        const tc = bus.context.currentTime;
        while (raceQueue.length && raceQueue[0].at <= tc + 0.02) raceQueue.shift().fn();
      }
      // station iii
      if (dirty3) { dirty3 = false; draw3(); }
      if (dirtyP) { dirtyP = false; drawPanel(); }
      // coda scope: moves only while a key sounds
      if (activeKey >= 0 && !reduced) drawScope(t);
      else if (scopeDirty) { scopeDirty = false; drawScope(t); }
    });
    stampChanged(true);
    loop.start();

    const onMotion = () => {
      reduced = !!(mq && mq.matches);
      if (reduced) stampAnim = null;
      renderReadout(); dirty1 = true; scopeDirty = true;
    };
    if (mq && mq.addEventListener) mq.addEventListener('change', onMotion);

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        completeRace();
        keysOff();
        stampAnim = null;
        bus.mute();
      },
      resume() {
        bus.unmute();
        dirty1 = dirty3 = dirtyP = scopeDirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopRace();
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion);
        if (droneV) { droneV.dispose(); intV.dispose(); droneV = intV = null; }
        bus.dispose();
        h1.destroy(); h3.destroy(); hP.destroy(); hS.destroy();
        clayCache.clear();
        style.remove();
      },
    };
  },
};
