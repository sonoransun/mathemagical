// I — Sixty
// Sexagesimal place value: two wedges, fifty-nine digits, no zero; reciprocal
// tables and the regular numbers; Plimpton 322 — Pythagorean triples a
// millennium before Pythagoras — and the row no tablet ever holds.

import {
  digitsInBase, baseExpansion, isRegular, gcdBig, formatBig, TAU,
} from '../../core/math.js';

/* ================= pure data & logic (node-testable) ================= */

// Plimpton 322 (~1800 BCE, probably Larsa). Columns II (short side s) and
// III (diagonal d) in tablet order, corrected readings, transcribed from the
// Wikipedia article "Plimpton 322" (which follows Neugebauer–Sachs / Robson /
// Friberg). `sw` / `dw` record what the tablet ACTUALLY writes where that
// differs (the scribal errors); rendering shows the written value, the
// mathematics uses the corrected one.
export const PLIMPTON_ROWS = [
  { row: 1, s: 119n, d: 169n },
  { row: 2, s: 3367n, d: 4825n, dw: 11521n,
    note: 'slip: tablet writes 3,12,1 (= 11,521) for the diagonal — corrected 1,20,25 (= 4,825)' },
  { row: 3, s: 4601n, d: 6649n },
  { row: 4, s: 12709n, d: 18541n },
  { row: 5, s: 65n, d: 97n },
  { row: 6, s: 319n, d: 481n },
  { row: 7, s: 2291n, d: 3541n },
  { row: 8, s: 799n, d: 1249n, colIErr: true,
    note: 'slip (first column, broken edge): two adjacent digits written as their sum' },
  { row: 9, s: 481n, d: 769n, sw: 541n,
    note: 'slip: tablet writes 9,1 (= 541) for the width — corrected 8,1 (= 481)' },
  { row: 10, s: 4961n, d: 8161n },
  { row: 11, s: 45n, d: 75n,
    note: '45 and 1,15 share factor 15 — likely meant as ;45 and 1;15, i.e. ¾ and 1¼: the (3,4,5) triangle' },
  { row: 12, s: 1679n, d: 2929n },
  { row: 13, s: 161n, d: 289n, sw: 25921n,
    note: 'slip: tablet writes 7,12,1 (= 25,921) where 2,41 (= 161) belongs — and 25,921 = 161²: the scribe squared a column too soon' },
  { row: 14, s: 1771n, d: 3229n },
  { row: 15, s: 56n, d: 106n, dw: 53n,
    note: 'slip: tablet writes 53 — either the diagonal doubles to 1,46 (= 106) or the width halves to 28 (both fixes give a true triple)' },
];

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

// Neugebauer generating pair: p > q with s : l : d  =  p²−q² : 2pq : p²+q²
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

// Sexagesimal digits of a BigInt, most significant first.
export function sexOf(x) { return digitsInBase(BigInt(x), 60); }
export function sexStr(x) { return sexOf(x).join(','); }

// "1;59,00,15"-style string for n/d in base 60 (fraction digits zero-padded).
export function fracSexStr(n, d, maxD = 16) {
  n = BigInt(n); d = BigInt(d);
  const int = n / d, rem = n % d;
  const e = baseExpansion(rem, d, 60, maxD);
  const ip = int > 0n ? sexOf(int).join(',') : '';
  const fp = e.digits.map((x) => String(x).padStart(2, '0')).join(',');
  return ip + ';' + fp + (e.terminates ? '' : '…');
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

/* ================= self-tests ================= */

function runTests() {
  let count = 0;
  const ok = (cond, msg) => { count++; if (!cond) throw new Error('sixty _test #' + count + ': ' + msg); };

  ok(PLIMPTON_ROWS.length === 15, '15 rows');
  PLIMPTON_ROWS.forEach((r, i) => ok(r.row === i + 1, 'row numbering'));

  for (const r of PLIMPTON_ROWS) {
    const l = longSideOf(r.s, r.d);
    ok(l !== null, `row ${r.row}: d²−s² must be a perfect square`);
    ok(r.s * r.s + l * l === r.d * r.d, `row ${r.row}: s²+l²=d²`);
    ok(isRegular(Number(l)), `row ${r.row}: long side ${l} is regular (Robson's reading needs this)`);
    const pq = pqOf(r.s, r.d);
    ok(pq !== null, `row ${r.row}: generating pair exists`);
    const { p, q, scale } = pq;
    ok(p > q && q > 0n, `row ${r.row}: p>q>0`);
    ok(isRegular(Number(p)) && isRegular(Number(q)), `row ${r.row}: p,q regular`);
    void scale;
    ok(r.s * (2n * p * q) === l * (p * p - q * q), `row ${r.row}: s/l = (p²−q²)/2pq`);
    ok(r.d * (2n * p * q) === l * (p * p + q * q), `row ${r.row}: d/l = (p²+q²)/2pq`);
  }

  // Specific corrected values & the scribal errors, tied to the tablet's
  // written sexagesimal forms (per Wikipedia's transcription).
  const R = (n) => PLIMPTON_ROWS[n - 1];
  ok(R(1).s === 119n && R(1).d === 169n && longSideOf(119n, 169n) === 120n, 'row 1 = (119,120,169)');
  ok(pqOf(119n, 169n).p === 12n && pqOf(119n, 169n).q === 5n, 'row 1 generated by (12,5)');
  ok(R(2).dw === 11521n && sexStr(11521n) === '3,12,1' && sexStr(4825n) === '1,20,25', 'row 2 error');
  ok(R(9).sw === 541n && sexStr(541n) === '9,1' && sexStr(481n) === '8,1' && 541n - 481n === 60n, 'row 9 error');
  ok(R(13).sw === 25921n && 25921n === 161n * 161n && sexStr(25921n) === '7,12,1' && sexStr(161n) === '2,41', 'row 13 error is 161²');
  ok(R(15).dw === 53n && R(15).d === 2n * 53n, 'row 15 error: written diagonal is half');
  ok(longSideOf(28n, 53n) === 45n, 'row 15 alternative fix (28,45,53) is also a triple');
  ok(pqOf(56n, 106n).p === 9n && pqOf(56n, 106n).q === 5n, 'row 15 generated by (9,5)');
  ok(pqOf(45n, 75n).p === 2n && pqOf(45n, 75n).q === 1n && pqOf(45n, 75n).scale === 15n, 'row 11 = 15×(3,4,5)');

  // The exhibit's core arithmetic claim: 1/3 terminates in base 60 (;20),
  // never in base 10.
  const e60 = baseExpansion(1, 3, 60);
  ok(e60.terminates === true && e60.digits.length === 1 && e60.digits[0] === 20, '1/3 = ;20 in base 60');
  const e10 = baseExpansion(1, 3, 10);
  ok(e10.terminates === false, '1/3 does not terminate in base 10');
  ok(fracSexStr(1, 3) === ';20', 'fracSexStr(1/3)');
  ok(fracSexStr(1, 8) === ';07,30', 'igi 8 = 7,30');
  ok(fracSexStr(169n * 169n, 120n * 120n) === '1;59,00,15', 'row 1 column I restores to 1;59,00,15');
  ok(fracSexStr(12, 5) === '2;24' && fracSexStr(5, 12) === ';25', "row 1 reciprocal pair 2;24 / ;25");

  // Termination in base 60 ⇔ regular divisor, for the whole dial range.
  for (let b = 2; b <= 30; b++) {
    ok(baseExpansion(1, b, 60, 64).terminates === isRegular(b),
      `1/${b} terminates in base 60 iff ${b} is regular`);
  }

  // Ambiguity engine.
  const flat = (r) => r.baseValues.map(String).join('|');
  ok(flat(interpretations([{ v: 1 }])) === '1', 'single wedge');
  ok(flat(interpretations([{ v: 1 }, { v: 0 }, { v: 5 }])) === '65|3605', 'gap ambiguity');
  ok(flat(interpretations([{ v: 1 }, { v: 0, ph: true }, { v: 5 }])) === '3605', 'placeholder pins the gap');
  ok(flat(interpretations([{ v: 1 }, { v: 0 }, { v: 0 }, { v: 1 }])) === '61|3601|216001', 'double gap');
  ok(interpretations([{ v: 0 }, { v: 0 }]).baseValues.length === 0, 'empty clay');

  // Wedge layout sanity.
  ok(digitGroup(59).marks.length === 14, '59 = 5 tens + 9 units');
  ok(digitGroup(7).marks.length === 7 && digitGroup(7).w > 0, 'units layout');

  return `ok — ${count} assertions passed`;
}

export const _test = {
  PLIMPTON_ROWS, isqrtBig, longSideOf, pqOf, sexOf, sexStr, fracSexStr,
  interpretations, digitGroup, factorize, run: runTests,
};

/* ================= the exhibit ================= */

export default {
  id: 'sixty',
  movement: 1,
  title: 'Sixty',
  hook: 'Why your clock still speaks Babylonian — and how to divide by 3 with no remainder, ever.',
  prose: `
    <p>Every clock face is a small Babylonian colony. Sixty seconds to the minute, sixty
    minutes to the hour, three hundred sixty degrees around a circle: when you say
    <em>quarter past</em>, you are doing arithmetic in base sixty, in a notation invented
    roughly four thousand years ago. Between about 2100 and 1800 BCE — the accounting
    houses of Ur, then the school-rooms of Old Babylonian cities like Larsa and Nippur —
    scribes built history's first place-value number system out of exactly two marks
    pressed into wet clay: a vertical wedge meaning <em>one</em>, a corner wedge meaning
    <em>ten</em>. Clustered, the two compose every digit from 1 to 59; shift one column
    left and the same wedge is worth sixty times more. It is our decimal trick with a
    larger base — invented some four thousand years ago, roughly twenty-five centuries
    before the decimal version was born in India.</p>
    <p>Something is missing, though, and you will feel its absence at the clay below:
    there is no zero. No sign for an empty column — and no way even to say <em>how
    big</em> a number is. The same lone wedge meant 1, or 60, or 3,600, or for that
    matter <code>1/60</code>; a gap between digits might be an empty place or a scribe's
    loose spacing. Context decided, the way it decides for us when a clock says "ten to
    three" or a grocer says "three fifty." Around 300 BCE, Seleucid-era astronomers
    finally introduced a placeholder — two small slanted wedges — but only ever
    <em>between</em> digits: a number still could not end in zero, and the sign never
    stood alone as a quantity. Zero as a genuine number, a thing you may add and
    multiply, arrives with Brahmagupta in India, 628 CE.</p>
    <p>Why did so unwieldy-sounding a base conquer the clock? Because of how it divides.
    A Babylonian scribe never performed long division; to divide by <code>b</code> was to
    multiply by its reciprocal, looked up in a table of <em>igi</em> — and a reciprocal
    has a finite table entry exactly when <code>1/b</code> terminates in your base. In
    base ten, 1/3 stutters forever: 0.333…; in base sixty it is simply <code>;20</code> —
    twenty sixtieths, done. The divisors that come out even in base sixty are the numbers
    built only from 2, 3 and 5 — the scribes' <em>regular</em> numbers — and they are far
    more plentiful than base ten's meagre clan of 2s and 5s. Race the two bases below and
    you can rediscover the regular numbers the way a student in Nippur once did: by
    noticing which divisions end.</p>
    <p>Then there is the tablet. Plimpton 322, written around 1800 BCE, probably at
    Larsa, is a palm-sized piece of clay ruled into four columns and fifteen rows; its
    second and third columns hold, in sexagesimal wedges, the short side and diagonal of
    fifteen right triangles with whole-number sides — <code>119, 169</code> up to
    <code>12709, 18541</code>. That is Pythagorean-triple data, tabulated a thousand
    years before Pythagoras. Otto Neugebauer showed that every row springs from a pair of
    regular numbers <code>p, q</code> via <code>(p²−q², 2pq, p²+q²)</code>; Eleanor
    Robson's now-mainstream reading goes further — the first column tracks
    <em>reciprocal pairs</em> <code>x, 1/x</code> straight out of the igi tables, and the
    tablet is most plausibly a teacher's answer key: the deep structure of sixty,
    applied. Even the scribal slips testify. In row 13 the tablet writes 7,12,1 — that is
    25,921 — where 2,41 (161) belongs, and 25,921 is exactly <code>161²</code>: a human
    hand, mid-calculation, squaring one column too soon.</p>
    <p>The rows are sorted, steadily, by the ratio of diagonal to long side — from a
    triangle just shy of the half-square down to one near thirty-one degrees. Run your
    pointer down them and watch the march; then notice the slot the march never fills.
    The simplest right triangle of all — width equal to length, the diagonal of a square
    — appears in no row of this tablet, and in no row of any tablet ever excavated. The
    scribes who hunted down 12,709 and 18,541 could not write the one triangle a child
    would draw first. They left the top slot empty, and Exhibit 5 is the terrible,
    wonderful reason why.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const bus = audio.createBus('sixty');
    const FONT = () => getComputedStyle(document.body).fontFamily;
    const MONO = 'ui-monospace, Menlo, monospace';

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-sixty .sxty-label { font-variant: small-caps; letter-spacing: .22em;
        color: ${P.inkFaint}; font-size: .82rem; margin: 2.1rem 0 .55rem;
        border-top: 1px solid ${P.line}; padding-top: .75rem; }
      #ex-sixty .sxty-label:first-of-type { margin-top: .4rem; border-top: none; padding-top: 0; }
      #ex-sixty .sxty-dim { color: ${P.inkFaint}; font-size: .8rem; font-family: ${MONO};
        margin: .35rem 0 .2rem; min-height: 1.1em; }
      #ex-sixty .sxty-race { font-family: ${MONO}; background: ${P.panel};
        border: 1px solid ${P.line}; border-radius: 6px; padding: .7rem .9rem;
        margin: .5rem 0; line-height: 2; overflow-x: auto; white-space: nowrap; }
      #ex-sixty .sxty-race .lab { color: ${P.inkFaint}; display: inline-block; width: 5.2em; }
      #ex-sixty .sxty-race i { font-style: normal; color: ${P.ink}; margin-right: .15em; }
      #ex-sixty .sxty-race i.rep { border-bottom: 1px dotted ${P.crimson}; color: ${P.inkDim}; }
      #ex-sixty .sxty-race .endmark { color: ${P.goldBright}; margin-left: .4em; }
      #ex-sixty .sxty-race .dots { color: ${P.crimson}; margin-left: .2em; }
      #ex-sixty .sxty-grid { display: flex; flex-wrap: wrap; gap: 5px; margin: .5rem 0; }
      #ex-sixty .sxty-cell { font-family: ${MONO}; font-size: .8rem; width: 2.2em;
        padding: .28em 0; text-align: center; background: ${P.panel};
        border: 1px solid ${P.line}; border-radius: 4px; color: ${P.inkDim};
        cursor: pointer; }
      #ex-sixty .sxty-cell:hover { border-color: ${P.inkFaint}; }
      #ex-sixty .sxty-cell.gold { border-color: ${P.gold}; color: ${P.goldBright}; }
      #ex-sixty .sxty-cell.crimson { border-color: ${P.crimson}; color: ${P.crimson}; }
      #ex-sixty .sxty-cell.now { outline: 1px solid ${P.azure}; }
      #ex-sixty .sxty-keys { display: flex; flex-wrap: wrap; gap: 6px; margin: .5rem 0; }
      #ex-sixty .sxty-key { font-family: ${MONO}; background: ${P.panel};
        border: 1px solid ${P.gold}; border-radius: 6px; color: ${P.ink};
        padding: .35em .6em; cursor: pointer; line-height: 1.25; }
      #ex-sixty .sxty-key small { display: block; color: ${P.inkFaint}; font-size: .68rem; }
      #ex-sixty .sxty-key.off7 { border-color: ${P.crimson}; }
      #ex-sixty .sxty-key.active { background: ${P.gold}; color: ${P.bg}; }
      #ex-sixty .sxty-key.active small { color: ${P.bg}; }
      #ex-sixty .sxty-key.off7.active { background: ${P.crimson}; }
    `;
    stage.appendChild(style);

    const label = (txt) => {
      const d = document.createElement('div');
      d.className = 'sxty-label'; d.textContent = txt;
      stage.appendChild(d); return d;
    };
    const dimLine = (parent) => {
      const d = document.createElement('div');
      d.className = 'sxty-dim'; (parent || stage).appendChild(d); return d;
    };

    /* ---------- wedge drawing (shared) ---------- */
    function drawUnit(ctx, x, y, s) {           // vertical wedge, head at top
      ctx.beginPath();
      ctx.moveTo(x - 0.17 * s, y); ctx.lineTo(x + 0.17 * s, y);
      ctx.lineTo(x + 0.045 * s, y + 0.30 * s); ctx.lineTo(x + 0.03 * s, y + 0.74 * s);
      ctx.lineTo(x - 0.03 * s, y + 0.74 * s); ctx.lineTo(x - 0.045 * s, y + 0.30 * s);
      ctx.closePath(); ctx.fill();
    }
    function drawTen(ctx, x, y, s) {            // corner wedge (Winkelhaken)
      ctx.beginPath();
      ctx.moveTo(x + 0.5 * s, y); ctx.lineTo(x, y + 0.21 * s); ctx.lineTo(x + 0.5 * s, y + 0.42 * s);
      ctx.lineTo(x + 0.5 * s, y + 0.30 * s); ctx.lineTo(x + 0.17 * s, y + 0.21 * s);
      ctx.lineTo(x + 0.5 * s, y + 0.12 * s);
      ctx.closePath(); ctx.fill();
    }
    // Draw digit v (1..59) with top-left corner at (x,y), wedge scale u.
    // Returns drawn width in px.
    function drawDigit(ctx, v, x, y, u, color) {
      const g = digitGroup(v);
      ctx.fillStyle = color;
      for (const m of g.marks) {
        if (m.g === 't') drawTen(ctx, x + m.x * u, y + m.y * u, u);
        else drawUnit(ctx, x + m.x * u + 0.18 * u, y + m.y * u, u);
      }
      return g.w * u;
    }
    function digitWidthUnits(v) { return digitGroup(v).w; }
    function drawPlaceholder(ctx, x, y, u, color) {   // two slanted wedges
      ctx.save(); ctx.fillStyle = color;
      for (const dx of [0, 0.3 * u]) {
        ctx.save();
        ctx.translate(x + dx, y + 0.1 * u);
        ctx.rotate(-0.62);
        drawUnit(ctx, 0, 0, 0.62 * u);
        ctx.restore();
      }
      ctx.restore();
    }

    /* ============ STATION 1 — the stamping table ============ */
    label('i · the stamping table');
    const wrap1 = document.createElement('div'); stage.appendChild(wrap1);
    const h1 = cv.setupCanvas(wrap1, { height: 235 });
    const NCOLS = 4;
    const cols = Array.from({ length: NCOLS }, () => ({ t: 0, u: 0, ph: false }));
    let tool = 'one';
    let hoverCol = -1;
    let dirty1 = true;

    const tools1 = ui.controlRow(stage);
    const toolBtns = {};
    const setTool = (t) => {
      tool = t;
      for (const k in toolBtns) toolBtns[k].classList.toggle('active', k === t);
    };
    toolBtns.one = ui.button(tools1, 'one-wedge', () => setTool('one'), { small: true });
    toolBtns.ten = ui.button(tools1, 'ten-wedge', () => setTool('ten'), { small: true });
    toolBtns.ph = ui.button(tools1, 'placeholder', () => setTool('ph'), { small: true });
    ui.button(tools1, 'wipe the clay', () => {
      for (const c of cols) { c.t = 0; c.u = 0; c.ph = false; }
      dirty1 = true; stampChanged(true);
    }, { small: true });
    setTool('one');

    const flicker = ui.readout(stage, '—');
    const context1 = dimLine(stage);
    const quest1 = ui.questBanner(stage,
      'Write sixty-one: stamp a single wedge in one column, and a single wedge in the column to its right.');
    ui.caption(stage,
      'Two marks were the scribes’ whole numeral system: a vertical wedge for one, a corner wedge ' +
      'for ten. Columns carry powers of sixty — but nothing on the clay says <em>which</em> powers, so the ' +
      'readout lists every number your marks could mean. The placeholder (two slanted wedges, Seleucid era, ' +
      '~300 BCE) may only be stamped <em>between</em> digits: a number still could not end in zero.');

    let quest1Stage = 0;
    let flickList = ['—'];
    let flickIdx = 0, flickAt = 0;

    function trimmedDigits() {
      const cells = cols.map((c) => ({ v: c.t * 10 + c.u, ph: c.ph }));
      let lo = 0, hi = cells.length - 1;
      while (lo <= hi && cells[lo].v === 0 && !cells[lo].ph) lo++;
      while (hi >= lo && cells[hi].v === 0 && !cells[hi].ph) hi--;
      return cells.slice(lo, hi + 1);
    }

    function stampChanged(wiped) {
      const cells = cols.map((c) => ({ v: c.t * 10 + c.u, ph: c.ph }));
      const { baseValues, gaps } = interpretations(cells);
      const anyPh = cols.some((c) => c.ph);
      if (!baseValues.length) {
        flickList = ['—']; context1.textContent = wiped ? 'smooth clay — stamp something' : '';
      } else if (gaps === 0 && anyPh) {
        // the placeholder pins the internal places; magnitude stays contextual
        flickList = [formatBig(baseValues[0])];
        context1.textContent =
          'pinned — though scale still comes from context: sixty times more for each larger place, or sixtieths';
      } else {
        const out = [];
        for (const v of baseValues) {
          out.push(formatBig(v) + '⁄60');
          out.push(formatBig(v));
          out.push(formatBig(v * 60n));
          out.push(formatBig(v * 3600n));
        }
        flickList = out;
        context1.textContent = gaps > 0
          ? out.length + ' readings from the same marks — the empty column may or may not be a place'
          : 'one set of marks, ' + out.length + ' readings — nothing on the clay fixes the scale';
      }
      flickIdx = 0; flickAt = 0;

      // quest ladder: 61 → 3601-with-gap → placeholder
      const t = trimmedDigits();
      const sig = t.map((c) => (c.ph ? 'P' : c.v)).join('|');
      if (quest1Stage === 0 && sig === '1|1') {
        quest1Stage = 1;
        quest1.set('Now write three-thousand-six-hundred-and-one: wedge, <em>empty column</em>, wedge.');
      } else if (quest1Stage === 1 && sig === '1|0|1') {
        quest1Stage = 2;
        quest1.set('The clay cannot say whether you meant 61 or 3601 — watch the readout squirm. ' +
          'Pick the <em>placeholder</em> tool and stamp the empty middle column.');
      } else if (quest1Stage === 2 && sig === '1|P|1') {
        quest1Stage = 3;
        quest1.done('3601, and no argument. The scribes waited some fifteen centuries for that sign — ' +
          'and even then it could not end a number.');
      }
      dirty1 = true;
    }
    stampChanged(true);

    function colAt(x) {
      const cw = (h1.width - 20) / NCOLS;
      const i = Math.floor((x - 10) / cw);
      return i >= 0 && i < NCOLS ? i : -1;
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
      audio.ensureAudio();
      const now = bus.context.currentTime;
      const c = cols[i];
      const deny = (msg) => {
        context1.textContent = msg;
        audio.drums.rim(bus, now, { level: 0.25 });
        dirty1 = true;
      };
      if (tool === 'ph') {
        if (c.t + c.u > 0 || c.ph) return deny('the placeholder marks an empty place — this column is not empty');
        const leftFull = cols.slice(0, i).some((k) => k.t + k.u > 0 || k.ph);
        const rightFull = cols.slice(i + 1).some((k) => k.t + k.u > 0 || k.ph);
        if (!leftFull || !rightFull) {
          return deny('the scribes only ever wrote it between digits — a number could not end in zero (that takes Brahmagupta, 628 CE)');
        }
        c.ph = true;
        audio.drums.thock(bus, now, { level: 0.5 });
        audio.drums.thock(bus, now + 0.09, { level: 0.4 });
      } else if (tool === 'one') {
        if (c.ph) return deny('this place is pinned empty — wipe the clay to reuse it');
        if (c.u >= 9) return deny('nine is as far as the units go — a tenth would be a corner wedge');
        c.u++;
        audio.drums.thock(bus, now, { level: 0.55 });
        audio.drums.wood(bus, now, { pitch: 700 + i * 90, level: 0.12 });
      } else {
        if (c.ph) return deny('this place is pinned empty — wipe the clay to reuse it');
        if (c.t >= 5) return deny('no digit reaches sixty — that is what the next column is for');
        c.t++;
        audio.drums.thock(bus, now, { level: 0.6 });
        audio.drums.wood(bus, now, { pitch: 420 + i * 60, level: 0.12 });
      }
      stampChanged();
    });
    h1.onResize(() => { dirty1 = true; });

    function draw1() {
      const { ctx, width: W, height: H } = h1;
      ctx.clearRect(0, 0, W, H);
      const cw = (W - 20) / NCOLS;
      for (let i = 0; i < NCOLS; i++) {
        const x = 10 + i * cw;
        ctx.fillStyle = i === hoverCol ? P.panel : 'transparent';
        ctx.fillRect(x + 3, 12, cw - 6, H - 24);
        ctx.strokeStyle = i === hoverCol ? P.goldDim : P.line;
        ctx.strokeRect(x + 3.5, 12.5, cw - 6, H - 24);
        const c = cols[i];
        const v = c.t * 10 + c.u;
        if (c.ph) {
          drawPlaceholder(ctx, x + cw / 2 - 10, H / 2 - 8, 34, P.azure);
        } else if (v > 0) {
          const g = digitGroup(v);
          const u = Math.min(48, (cw - 22) / Math.max(g.w, 1), (H - 50) / Math.max(g.h, 1));
          const gx = x + cw / 2 - (g.w * u) / 2;
          const gy = H / 2 - (g.h * u) / 2;
          drawDigit(ctx, v, gx, gy, u, i === hoverCol ? P.goldBright : P.gold);
        } else if (i === hoverCol) {
          ctx.fillStyle = P.inkFaint;
          ctx.font = '11px ' + MONO;
          ctx.textAlign = 'center';
          ctx.fillText('stamp', x + cw / 2, H / 2 + 4);
        }
      }
      // faint hint that columns rise in value to the left
      ctx.fillStyle = P.inkFaint;
      ctx.font = '10px ' + MONO;
      ctx.textAlign = 'left';  ctx.fillText('…×60×60×60?', 12, H - 4);
      ctx.textAlign = 'right'; ctx.fillText('×1? ×60? ⁄60?', W - 12, H - 4);
    }

    /* ============ STATION 2 — the reciprocal race ============ */
    label('ii · the reciprocal race');
    let divisor = 3;
    const ctl2 = ui.controlRow(stage);
    const divStep = ui.stepper(ctl2, {
      label: 'divide one by', min: 2, max: 30, value: divisor,
      format: (v) => String(v),
      onChange: (v) => { divisor = v; stopRace(); raceIdle(); markNow(); },
    });
    const runBtn = ui.button(ctl2, '▶ unfold 1/' + divisor, startRace, { primary: true });

    const raceBox = document.createElement('div');
    raceBox.className = 'sxty-race'; stage.appendChild(raceBox);
    const grid = document.createElement('div');
    grid.className = 'sxty-grid'; stage.appendChild(grid);
    const factLine = dimLine(stage);
    const math2 = ui.mathline(stage,
      '1⁄b ends in base 60 ⇔ b = 2<sup>i</sup>·3<sup>j</sup>·5<sup>k</sup> — the regular numbers');
    math2.style.display = 'none';
    const quest2 = ui.questBanner(stage,
      'Try divisors until the pattern shows: which of them come out even in base sixty — and what do those share?');
    ui.caption(stage,
      'Base ten terminates only for divisors built from 2 and 5; base sixty for divisors built from 2, 3 ' +
      'and 5 — one extra prime, and the difference underwrote a civilization of tables. A scribal ' +
      '<em>igi</em> table is precisely the gold cells: igi 3 = 20, igi 8 = 7,30, igi 27 = 2,13,20… ' +
      'while 7, 11, 13 are simply skipped.');

    const cells2 = new Map();
    for (let b = 2; b <= 30; b++) {
      const cell = document.createElement('button');
      cell.className = 'sxty-cell'; cell.textContent = String(b);
      cell.addEventListener('click', () => {
        divisor = b; divStep.set(b); stopRace(); markNow(); startRace();
      });
      grid.appendChild(cell); cells2.set(b, cell);
    }
    const tried = new Map();          // b -> terminates (bool)
    let raceQueue = [];               // {at, fn}
    let raceSched = null;
    let raceEls = null;

    function markNow() {
      for (const [b, cell] of cells2) cell.classList.toggle('now', b === divisor);
      runBtn.textContent = '▶ unfold 1/' + divisor;
    }
    markNow();

    function raceIdle() {
      raceBox.innerHTML =
        '<div><span class="lab">base 10</span><span>0.</span></div>' +
        '<div><span class="lab">base 60</span><span>0;</span></div>';
      factLine.textContent = 'press unfold to race the two bases';
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

    function stopRace() {
      if (raceSched) { raceSched.stop(); raceSched = null; }
      raceQueue = [];
    }

    function startRace() {
      audio.ensureAudio();
      stopRace();
      const b = divisor;
      const s10 = buildSeq(baseExpansion(1, b, 10, 64));
      const s60 = buildSeq(baseExpansion(1, b, 60, 64));
      raceBox.innerHTML =
        '<div><span class="lab">base 10</span><span>0.</span><span class="d10"></span></div>' +
        '<div><span class="lab">base 60</span><span>0;</span><span class="d60"></span></div>';
      raceEls = { d10: raceBox.querySelector('.d10'), d60: raceBox.querySelector('.d60') };
      factLine.textContent = '';
      const STEP = 0.34;
      const maxLen = Math.max(s10.digits.length, s60.digits.length);
      let i = 0;
      raceSched = audio.createScheduler((t) => {
        if (i > maxLen) {
          raceQueue.push({ at: t, fn: () => finishRace(b, s60.term) });
          return null;
        }
        for (const [side, seq] of [['d10', s10], ['d60', s60]]) {
          if (i < seq.digits.length) {
            const dg = seq.digits[i], idx = i;
            if (side === 'd10') audio.drums.wood(bus, t, { pitch: 500 + dg * 38, level: 0.26 });
            else audio.playTone(bus, { freq: 170 + dg * 7, dur: 0.16, level: 0.2, when: t, pan: 0.3 });
            raceQueue.push({ at: t, fn: () => revealDigit(side, seq, idx) });
          } else if (i === seq.digits.length) {
            const term = seq.term, sd = side;
            if (term) {
              audio.playTone(bus, { freq: 720, dur: 0.4, level: 0.28, when: t });
              audio.playTone(bus, { freq: 1080, dur: 0.5, level: 0.2, when: t + 0.06 });
            } else {
              audio.drums.wood(bus, t, { pitch: 180, level: 0.3 });
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
      if (!raceEls) return;
      const el = document.createElement('i');
      const dg = seq.digits[idx];
      el.textContent = (side === 'd60' && idx > 0 ? ',' : '') + dg;
      if (!seq.term && idx >= seq.periodStart) el.className = 'rep';
      raceEls[side].appendChild(el);
    }
    function endSide(side, term) {
      if (!raceEls) return;
      const el = document.createElement('span');
      if (term) { el.className = 'endmark'; el.textContent = '— it ends.'; }
      else { el.className = 'dots'; el.textContent = '… forever'; }
      raceEls[side].appendChild(el);
    }
    function finishRace(b, term60) {
      tried.set(b, term60);
      const cell = cells2.get(b);
      if (cell) { cell.classList.remove('now'); cell.classList.add(term60 ? 'gold' : 'crimson'); }
      const fs = factorize(b).map((p) =>
        `<span style="color:${p === 2 || p === 3 || p === 5 ? P.goldBright : P.crimson}">${p}</span>`);
      factLine.innerHTML = `${b} = ${fs.join('·')}` +
        (term60 ? ' — every factor divides sixty’s primes: it ends'
                : ' — a stranger prime in the works: it stutters forever');
      let g = 0, c = 0;
      for (const t of tried.values()) (t ? g++ : c++);
      if (g >= 6 && c >= 3) {
        quest2.done('The clean divisors are exactly the numbers built from 2, 3 and 5 — the scribes’ ' +
          '<em>regular</em> numbers. Every other divisor stutters forever, whatever the scribe does.');
        math2.style.display = '';
      }
    }

    /* ============ STATION 3 — the tablet ============ */
    label('iii · the tablet · plimpton 322');
    const ctl3 = ui.controlRow(stage);
    let translit = false;
    ui.toggle(ctl3, {
      label: 'transliterate the wedges', value: false,
      onChange: (v) => { translit = v; dirty3 = true; },
    });
    const wrap3 = document.createElement('div'); stage.appendChild(wrap3);
    const h3 = cv.setupCanvas(wrap3, { height: 480 });
    ui.caption(stage,
      'Hover the rows. The tablet is drawn with its scribal errors intact — crimson-marked rows show what ' +
      'the clay actually says; the panel gives the corrected reading. Column I, broken on the physical ' +
      'tablet, is restored in the panel as (diagonal⁄length)². The rows march from just under 45° down ' +
      'toward 31° — and the slot above row 1, the half-square with width equal to length, is empty. It is ' +
      'empty on every tablet ever found. Exhibit 5, <em>The Diagonal</em>, is why.');
    ui.legendPanel(stage, `
      <p><strong>“They chose sixty for its many divisors.”</strong> Seductive, and unsupported: the
      origin of the base is simply unknown — candidate stories include a merger of older metrological units
      and finger-joint counting (twelve joints told off on five fingers). What the divisors <em>do</em>
      explain is survival: sexagesimal outlived the language that wrote it because minutes, seconds and
      degrees divide so cleanly by 2, 3, 4, 5, 6, 10, 12, 15, 20 and 30.</p>
      <p><strong>“The Babylonians discovered trigonometry.”</strong> In 2017 a widely reported paper
      re-branded Plimpton 322 as “the world’s oldest trig table.” But Old Babylonian mathematics
      has no concept of measured angle, no arc, no circle-ratio; the tablet’s own logic runs on exact
      reciprocal pairs. Reading sines into it projects our textbook backward onto their clay — a useful
      cautionary tale, because the tablet is astonishing enough as what it actually is.</p>
      <p>And Pythagoras? The relation <code>s² + l² = d²</code> was scribal routine a thousand years before
      him; no ancient evidence connects the man himself to a proof of the theorem bearing his name. What the
      Greeks added was the <em>proof</em> — and Exhibit 5 shows the crisis hiding inside it.</p>`);

    // precompute per-row derived data (corrected math; written forms for display)
    const ROWS = PLIMPTON_ROWS.map((r) => {
      const l = longSideOf(r.s, r.d);
      const pq = pqOf(r.s, r.d);
      const sN = Number(r.s), lN = Number(l);
      return {
        ...r, l, pq,
        sShow: r.sw ?? r.s, dShow: r.dw ?? r.d,
        angle: Math.atan2(sN, lN) * 180 / Math.PI,
        colI: fracSexStr(r.d * r.d, l * l),
        x: fracSexStr(pq.p, pq.q), xi: fracSexStr(pq.q, pq.p),
      };
    });

    let sel = 1;            // 0 = the ghost row (missing half-square), 1..15 rows
    let dirty3 = true;
    const geo3 = () => {
      const W = h3.width, H = h3.height;
      const tabX = 8, tabW = Math.max(240, Math.min(W * 0.52, 430));
      const headH = 26, top = 8 + headH;
      const rh = (H - top - 10) / 16;                      // ghost + 15 rows
      const stripX = tabX + tabW + 10, stripW = 34;
      const panX = stripX + stripW + 12, panW = W - panX - 6;
      return { W, H, tabX, tabW, headH, top, rh, stripX, stripW, panX, panW };
    };
    const rowAt = (x, y) => {
      const g = geo3();
      if (x < g.tabX || x > g.stripX + g.stripW) return -1;
      const i = Math.floor((y - g.top) / g.rh);
      return i >= 0 && i <= 15 ? i : -1;
    };
    h3.canvas.addEventListener('pointermove', (e) => {
      const [x, y] = cv.pointerPos(h3, e);
      const i = rowAt(x, y);
      if (i >= 0 && i !== sel) { sel = i; dirty3 = true; }
    });
    h3.canvas.addEventListener('pointerdown', (e) => {
      const [x, y] = cv.pointerPos(h3, e);
      const i = rowAt(x, y);
      if (i < 0) return;
      audio.ensureAudio();
      const t0 = bus.context.currentTime;
      if (i === 0) {      // the missing half-square sings the tritone (√2 = 600¢)
        audio.playTone(bus, { freq: 240, dur: 0.9, level: 0.26, when: t0 });
        audio.playTone(bus, { freq: 240 * Math.SQRT2, dur: 0.9, level: 0.26, when: t0 + 0.05 });
      } else {
        const r = ROWS[i - 1];
        const fl = 260, fs = 260 * Number(r.s) / Number(r.l), fd = 260 * Number(r.d) / Number(r.l);
        audio.playTone(bus, { freq: fs, dur: 0.3, level: 0.3, when: t0 });
        audio.playTone(bus, { freq: fl, dur: 0.3, level: 0.3, when: t0 + 0.14 });
        audio.playTone(bus, { freq: fd, dur: 0.45, level: 0.3, when: t0 + 0.28 });
      }
      if (i !== sel) { sel = i; dirty3 = true; }
    });
    h3.onResize(() => { dirty3 = true; });

    // draw a sexagesimal number (wedges or transliteration), right-aligned in a cell
    function drawSexNumber(ctx, valueBig, x1, yMid, cellW, rh, color) {
      const digs = sexOf(valueBig);
      if (translit) {
        ctx.fillStyle = color;
        ctx.font = Math.min(13, rh * 0.52) + 'px ' + MONO;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(digs.join(','), x1, yMid);
        return;
      }
      const GAP = 0.55;
      let units = 0;
      for (const d of digs) units += Math.max(digitWidthUnits(d), 0.5) + GAP;
      units -= GAP;
      const u = Math.min(rh * 0.55, (cellW - 6) / Math.max(units, 1));
      let x = x1 - units * u;
      for (const d of digs) {
        const w = Math.max(digitWidthUnits(d), 0.5);
        if (d === 0) {          // (never on the real tablet; safety)
          ctx.fillStyle = P.inkFaint; ctx.fillRect(x, yMid, w * u, 1);
        } else {
          const g = digitGroup(d);
          drawDigit(ctx, d, x, yMid - (g.h * u) / 2, u, color);
        }
        x += (w + GAP) * u;
      }
    }

    function draw3() {
      const { ctx } = h3;
      const g = geo3();
      ctx.clearRect(0, 0, g.W, g.H);

      // tablet body
      ctx.fillStyle = P.panel;
      ctx.fillRect(g.tabX, 6, g.tabW, g.H - 12);
      ctx.strokeStyle = P.line;
      ctx.strokeRect(g.tabX + 0.5, 6.5, g.tabW, g.H - 13);

      const cS = { x: g.tabX + 6, w: g.tabW * 0.40 };
      const cD = { x: g.tabX + 8 + g.tabW * 0.40, w: g.tabW * 0.40 };
      const cN = { x: g.tabX + 10 + g.tabW * 0.80, w: g.tabW * 0.20 - 14 };

      ctx.fillStyle = P.inkFaint;
      ctx.font = '10px ' + MONO;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'right';
      ctx.fillText('width', cS.x + cS.w, 8 + 12);
      ctx.fillText('diagonal', cD.x + cD.w, 8 + 12);
      ctx.fillText('name', cN.x + cN.w, 8 + 12);
      ctx.textAlign = 'left';
      ctx.fillText('(col I broken off)', g.tabX + 6, 8 + 12);

      // ghost row — the missing half-square
      const gy = g.top, rh = g.rh;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = sel === 0 ? P.crimson : P.line;
      ctx.strokeRect(g.tabX + 4.5, gy + 2.5, g.tabW - 9, rh - 5);
      ctx.setLineDash([]);
      ctx.fillStyle = sel === 0 ? P.crimson : P.inkFaint;
      ctx.font = 'italic 11px ' + FONT();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('the missing row — width = length', g.tabX + g.tabW / 2, gy + rh / 2);
      ctx.restore();

      // the fifteen rows
      for (let i = 0; i < 15; i++) {
        const r = ROWS[i];
        const y = g.top + (i + 1) * rh, yMid = y + rh / 2;
        if (sel === i + 1) {
          ctx.fillStyle = 'rgba(201,169,89,0.10)';
          ctx.fillRect(g.tabX + 2, y + 1, g.tabW - 4, rh - 2);
        }
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(g.tabX + 4, y); ctx.lineTo(g.tabX + g.tabW - 4, y); ctx.stroke();
        const col = sel === i + 1 ? P.goldBright : P.gold;
        drawSexNumber(ctx, r.sShow, cS.x + cS.w, yMid, cS.w, rh, r.sw ? P.crimson : col);
        drawSexNumber(ctx, r.dShow, cD.x + cD.w, yMid, cD.w, rh, r.dw ? P.crimson : col);
        drawSexNumber(ctx, BigInt(r.row), cN.x + cN.w, yMid, cN.w, rh, P.inkDim);
        if (r.note) {
          ctx.fillStyle = P.crimson;
          ctx.beginPath(); ctx.arc(g.tabX + g.tabW - 8, yMid, 2.2, 0, TAU); ctx.fill();
        }
      }

      // angle strip: 45° (top) … 31° (bottom)
      const aTop = 45, aBot = 31;
      const sy = (a) => g.top + rh / 2 + (aTop - a) / (aTop - aBot) * (15 * rh);
      ctx.strokeStyle = P.line;
      ctx.beginPath();
      ctx.moveTo(g.stripX + 8, sy(45)); ctx.lineTo(g.stripX + 8, sy(31)); ctx.stroke();
      ctx.font = '9px ' + MONO; ctx.fillStyle = P.inkFaint; ctx.textAlign = 'left';
      ctx.fillText('45°', g.stripX + 13, sy(45) + 3);
      ctx.fillText('31°', g.stripX + 13, sy(31) + 3);
      for (let i = 0; i < 15; i++) {
        const a = ROWS[i].angle;
        ctx.strokeStyle = sel === i + 1 ? P.goldBright : P.azure;
        ctx.lineWidth = sel === i + 1 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(g.stripX + 3, sy(a)); ctx.lineTo(g.stripX + 13, sy(a)); ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = P.crimson;
      ctx.beginPath(); ctx.arc(g.stripX + 8, sy(45), 3.4, 0, TAU); ctx.stroke();

      drawPanel3(ctx, g);
    }

    function drawPanel3(ctx, g) {
      const px = g.panX, pw = Math.max(g.panW, 60);
      const triH = g.H * 0.40;
      ctx.font = '11px ' + MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const line = (txt, i, color) => {
        ctx.fillStyle = color || P.inkDim;
        ctx.fillText(txt, px, 26 + triH + 18 * i, pw);
      };

      if (sel === 0) {
        // the half-square that cannot exist
        const side = Math.min(pw - 30, triH - 30);
        const x0 = px + 10, y0 = 20 + side;
        ctx.strokeStyle = P.azure;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + side, y0); ctx.stroke();
        ctx.strokeStyle = P.gold;
        ctx.beginPath(); ctx.moveTo(x0 + side, y0); ctx.lineTo(x0 + side, y0 - side); ctx.stroke();
        ctx.strokeStyle = P.crimson; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + side, y0 - side); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.crimson;
        ctx.fillText('d = ?', x0 + side / 2 - 14, y0 - side / 2 - 8);
        line('the row every tablet lacks', 0, P.crimson);
        line('width = length  ⇒  d² = 2·l²', 1);
        line('no whole numbers obey that.', 2);
        line('none. ever. (click to hear it —', 3);
        line('the interval is √2, the tritone)', 4);
        line('→ V · The Diagonal', 5, P.gold);
        return;
      }

      const r = ROWS[sel - 1];
      // triangle, right angle at bottom-right
      const lN = Number(r.l), sN = Number(r.s), dN = Number(r.d);
      const sc = Math.min((pw - 24) / lN, (triH - 40) / sN);
      const w = lN * sc, hgt = sN * sc;
      const x0 = px + (pw - w) / 2, y0 = 24 + (triH - 30 + hgt) / 2;
      ctx.strokeStyle = P.azure; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke();
      ctx.strokeStyle = P.gold;
      ctx.beginPath(); ctx.moveTo(x0 + w, y0); ctx.lineTo(x0 + w, y0 - hgt); ctx.stroke();
      ctx.strokeStyle = P.ink;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0 - hgt); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = P.inkFaint;
      ctx.strokeRect(x0 + w - 8, y0 - 8, 8, 8);
      ctx.fillStyle = P.azure;  ctx.fillText('l = ' + formatBig(r.l), x0 + w / 2 - 26, y0 + 14);
      ctx.fillStyle = P.gold;
      ctx.fillText('s', Math.min(x0 + w + 5, px + pw - 10), y0 - hgt / 2);
      ctx.fillStyle = P.ink;    ctx.fillText('d', x0 + w / 2 - 10, y0 - hgt / 2 - 6);

      line(`row ${r.row} · width ${sexStr(r.s)} = ${formatBig(r.s)}`, 0, P.ink);
      line(`diagonal ${sexStr(r.d)} = ${formatBig(r.d)}`, 1, P.ink);
      line(`${formatBig(r.s)}² + ${formatBig(r.l)}² = ${formatBig(r.d)}²  ✓`, 2, P.verdant);
      line(`angle ${r.angle.toFixed(2)}° · col I: ${r.colI}`, 3);
      line(`Neugebauer: p=${r.pq.p} q=${r.pq.q}` +
        (r.pq.scale > 1n ? ` (×${r.pq.scale})` : '') + ' → (p²−q², 2pq, p²+q²)', 4);
      line(`Robson: x = p⁄q = ${r.x} and 1⁄x = ${r.xi}`, 5);
      line('— a reciprocal pair from the igi tables', 6);
      if (r.note) {
        ctx.font = '10px ' + MONO;
        // word-wrap the note into the panel
        const words = r.note.split(' ');
        let ln = '', li = 0;
        for (const wd of words) {
          const test = ln ? ln + ' ' + wd : wd;
          if (ctx.measureText(test).width > pw - 4 && ln) {
            line(ln, 7.5 + li * 0.78, P.crimson); li++; ln = wd;
          } else ln = test;
        }
        if (ln) line(ln, 7.5 + li * 0.78, P.crimson);
        ctx.font = '11px ' + MONO;
      }
    }

    /* ============ CODA — regular numbers are consonance ============ */
    label('coda · regular numbers are consonance');
    ui.mathline(stage,
      '2:1 octave · 3:2 fifth · 5:4 major third — every 5-limit interval is a ratio of regular numbers');
    const keysRow = document.createElement('div');
    keysRow.className = 'sxty-keys'; stage.appendChild(keysRow);
    const wrapS = document.createElement('div'); stage.appendChild(wrapS);
    const hS = cv.setupCanvas(wrapS, { height: 92 });
    const keyLine = dimLine(stage);
    keyLine.textContent = 'press a key — each sounds its ratio against a low drone';
    hS.onResize(() => { scopeWasIdle = false; });
    ui.caption(stage,
      'The 2-, 3-, 5-smooth numbers that make Babylonian division terminate are exactly the numbers whose ' +
      'ratios build 5-limit just intonation. The same three primes that make a division come out even make ' +
      'two tones lock. Smoothness is consonance — and Movement II lives there.');

    const RATIOS = [
      [1, 1, 'unison'], [9, 8, 'tone'], [5, 4, 'third'], [4, 3, 'fourth'], [3, 2, 'fifth'],
      [5, 3, 'sixth'], [15, 8, 'seventh'], [2, 1, 'octave'], [7, 4, '7th harmonic'], [11, 8, '11th'],
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
      keyBtns.push(b);
    });

    function keysOff() {
      activeKey = -1;
      keyBtns.forEach((b) => b.classList.remove('active'));
      if (droneV) { droneV.off(); intV.off(); }
      keyLine.textContent = 'press a key — each sounds its ratio against a low drone';
    }
    function pressKey(i) {
      audio.ensureAudio();
      if (activeKey === i) { keysOff(); return; }
      if (!droneV) {
        droneV = audio.voice(bus, { freq: F0, level: 0.26 });
        intV = audio.voice(bus, { type: 'triangle', freq: F0, level: 0.2 });
      }
      activeKey = i;
      keyBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      const [n, d] = RATIOS[i];
      intV.setFreq(F0 * n / d);
      droneV.on(); intV.on();
      const reg = isRegular(n) && isRegular(d);
      if (n === 1 && d === 1) {
        keyLine.textContent = '1:1 — the same number twice; nothing to divide, nothing to beat';
      } else if (reg) {
        const igi = (k) => (k === 1 ? '1' : baseExpansion(1, k, 60, 8).digits.join(','));
        keyLine.textContent =
          `${n}:${d} locks — both regular: igi ${d} = ${igi(d)}` +
          (n > 1 ? `, igi ${n} = ${igi(n)}` : '') + ' — both stand in the scribe’s table';
      } else {
        const bad = isRegular(n) ? d : n;
        keyLine.textContent =
          `${n}:${d} rubs — ${bad} has no igi; the tables skip it, and 5-limit harmony does too`;
      }
    }

    function drawScope(t) {
      const { ctx, width: W, height: H } = hS;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = P.line;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
      if (activeKey < 0) {
        ctx.strokeStyle = P.inkFaint;
        ctx.beginPath(); ctx.moveTo(6, H / 2); ctx.lineTo(W - 6, H / 2); ctx.stroke();
        return;
      }
      const [n, d] = RATIOS[activeKey];
      const r = n / d;
      const CYCLES = 8;
      const phase = (t * 0.35) % 1;
      // period markers: the sum repeats every d cycles of the low tone
      ctx.strokeStyle = P.goldDim;
      for (let c = d; c < CYCLES; c += d) {
        const x = 6 + (c / CYCLES) * (W - 12);
        ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, H - 4); ctx.stroke();
      }
      ctx.strokeStyle = isRegular(n) && isRegular(d) ? P.gold : P.crimson;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const N = Math.min(W - 12, 420);
      for (let i = 0; i <= N; i++) {
        const cyc = (i / N) * CYCLES + phase;
        const y = 0.5 * (Math.sin(TAU * cyc) + Math.sin(TAU * r * cyc));
        const sx = 6 + (i / N) * (W - 12);
        const sy = H / 2 - y * (H * 0.4);
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = P.inkFaint;
      ctx.font = '10px ' + MONO;
      ctx.textAlign = 'right';
      ctx.fillText(d > 1 ? `the pattern closes every ${d} cycles` : 'the pattern closes every cycle', W - 8, H - 6);
      ctx.textAlign = 'left';
    }

    /* ---------- master loop ---------- */
    let scopeWasIdle = false;
    const loop = cv.rafLoop((dt, t) => {
      // station 1: flicker
      if (t > flickAt) {
        flickAt = t + (flickList.length > 4 ? 0.55 : 0.9);
        const cur = flickList[flickIdx % flickList.length];
        flickIdx++;
        flicker.setHTML(flickList.length === 1 ? `<b>${cur}</b>` : `could mean  <b>${cur}</b>`);
      }
      if (dirty1) { dirty1 = false; draw1(); }
      // station 2: consume audio-clock queue
      if (raceQueue.length) {
        const now = bus.context ? bus.context.currentTime : 0;
        while (raceQueue.length && raceQueue[0].at <= now + 0.02) raceQueue.shift().fn();
      }
      // station 3
      if (dirty3) { dirty3 = false; draw3(); }
      // coda scope
      if (activeKey >= 0) { drawScope(t); scopeWasIdle = false; }
      else if (!scopeWasIdle) { scopeWasIdle = true; drawScope(t); }
    });
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        stopRace();
        keysOff();
        bus.mute();
      },
      resume() {
        bus.unmute();
        dirty1 = dirty3 = true;
        scopeWasIdle = false;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopRace();
        if (droneV) { droneV.dispose(); intV.dispose(); droneV = intV = null; }
        bus.dispose();
        h1.destroy(); h3.destroy(); hS.destroy();
        style.remove();
      },
    };
  },
};
