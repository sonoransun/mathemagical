// I — The Scribe's Loaves
// Egyptian unit fractions as a technology of fairness: cut real loaves with
// real knives, serve identical plates, out-optimize a greedy apprentice, and
// walk off the papyrus straight into a problem that is still open (1948–).
//
// Historical data verified against the Rhind Mathematical Papyrus literature
// (dates, scribe, opening problems, the complete 2/n table) and the
// Erdős–Straus record (posed 1948, machine-checked to 10^17, unproven).
// The Eye-of-Horus grain-fraction story appears only inside the legend panel,
// marked as the doubted tale it is.

import { Frac, TAU, clamp } from '../../core/math.js';

/* ==================== pure logic (node-testable, no DOM) ==================== */

const unit = (d) => new Frac(1n, BigInt(d));

// Fibonacci–Sylvester greedy expansion of p/q: at every step bite off the
// largest unit fraction not exceeding the remainder. Returns the unit
// denominators as BigInts — distinct and strictly increasing by construction.
// (Described by Fibonacci in the Liber Abaci, 1202; proved to terminate by
// Sylvester, 1880. The scribes of the Rhind papyrus routinely beat it.)
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

// The complete 2/n table of the Rhind Mathematical Papyrus (recto), as the
// scribe Ahmes recorded it (~1550 BCE). Keys are the odd n; values the unit
// denominators. Transcribed from the standard published table and re-verified
// exactly (see _test / selfCheckTable): every entry sums to 2/n.
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

// Erdős–Straus (1948): does 4/n = 1/x + 1/y + 1/z always have a solution in
// positive integers? Exact bounded search for the first few solutions with
// x ≤ y ≤ z. BigInt throughout; returns arrays [x, y, z] of BigInts.
export function erdosStraus(n, maxSolutions = 3) {
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
    const yHi = (2n * q) / p;                 // need r − 1/y ≤ 1/y for z ≥ y
    for (; y <= yHi && out.length < maxSolutions; y++) {
      const num = p * y - q;                  // r − 1/y = num / (q·y)
      if (num <= 0n) continue;
      const den = q * y;
      if (den % num === 0n) {
        const z = den / num;
        if (z >= y) out.push([x, y, z]);
      }
    }
  }
  return out;
}

// The apprentice's working, one papyrus line at a time (pure strings).
export function greedyNarrative(p, q) {
  const steps = [];
  let r = new Frac(BigInt(p), BigInt(q));
  steps.push(`Asked for <b>${p} ÷ ${q}</b>, the apprentice measures the share: ${r} of a loaf each.`);
  while (!r.isZero() && r.n > 0n) {
    if (r.n === 1n) {
      steps.push(`${r} is itself a single unit part. He cuts it, serves it, and bows.`);
      break;
    }
    const d = (r.d + r.n - 1n) / r.n;
    const rest = r.sub(unit(d));
    steps.push(`The largest unit part not exceeding ${r} is <b>1/${d}</b>. He serves one to each worker. Remainder: ${rest}.`);
    r = rest;
  }
  const dens = greedyExpand(p, q);
  steps.push(`His deal: <b>${dens.map((d) => '1/' + d).join(' + ')}</b> — ${dens.length} kind${dens.length === 1 ? '' : 's'} of piece, the thinnest 1/${dens[dens.length - 1]}.`);
  return steps;
}

const densSum = (dens) => dens.map((d) => '1/' + d).join(' + ');

/* ================================ exhibit ================================ */

const KNIVES = [2, 3, 4, 5, 6, 7];
const KNIFE_GLYPHS = { 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 6: '⅙', 7: '⅐' };
const MAX_PIECES = 150;
const MAX_DEN = 1000;
const MONO = '11px ui-monospace, Menlo, Consolas, monospace';

export default {
  id: 'loaves',
  movement: 1,
  title: 'The Scribe’s Loaves',
  hook: 'Divide three loaves among four workers so that no one can complain.',
  prose: `
    <p>Around 1550 BCE a scribe who signs himself Ahmes sat down to copy — from a roll already
    three centuries old, written under Amenemhat III — the closest thing the Bronze Age has left
    us to a mathematics textbook. He opens with a boast worthy of the subject: <em>accurate
    reckoning, the entrance into the knowledge of all things, all mysteries, all secrets</em>.
    And then, immediately: bread. The first six problems of the Rhind papyrus divide 1, 2, 6, 7,
    8 and 9 loaves among ten men. This is payroll, not philosophy — Egyptian wages were paid in
    bread and beer, and a foreman who could not split loaves beyond dispute had a mutiny by
    afternoon.</p>
    <p>The scribes' arithmetic obeys one strange rule: <em>no numerators</em>. Apart from a
    special sign for 2/3, every quantity is a whole number plus a sum of <em>distinct unit
    fractions</em> — never <code>3/4</code>, always <code>1/2 + 1/4</code>. Our reflex is to call
    this clumsy, so try the alternative. Cut each of three loaves into a big three-quarter piece
    and a sliver; three workers stride off with a heavy hunk each and the fourth is handed three
    slivers. The shares are equal and the fourth man is furious. Now deal every worker a half and
    a quarter: four <em>identical</em> plates, and the complaint dies before it is spoken. We
    cannot interview Ahmes about his notation — but hand anyone a knife and it explains itself.
    A unit fraction is a thing you can actually cut, and a sum of distinct ones is a deal every
    eye can audit at a glance.</p>
    <p>Because Egyptian multiplication worked by doubling, the chore that recurred forever was
    doubling a fraction, and the papyrus opens with a table for it: 2/n as unit fractions for
    every odd n up to 101. The obvious method is the greedy one — bite off the largest unit
    fraction that fits, repeat — which Fibonacci described in 1202 and Sylvester proved correct
    in 1880. Ahmes had it beaten three millennia in advance. For 2/9, greedy grabs <code>1/5</code>
    and leaves the sliver <code>1/45</code>; the papyrus records <code>2/9 = 1/6 + 1/18</code> —
    the same number of cuts, but rounder, more even, kinder to the next doubling. Entry after
    entry makes such choices. It is the oldest surviving table that was not merely computed but
    <em>engineered</em>: someone weighed alternatives and chose — and below, with the same knives,
    you can try to out-choose both him and his greedy apprentice.</p>
    <p>The myth says Egyptian fractions were a dead end, abandoned for better notation and best
    forgotten. In truth they kept Mediterranean ledgers running for another three thousand years
    (the Greek fraction tables of Akhmim and the medieval abacists, Fibonacci included, all
    speak them fluently) — and
    mathematically the game never closed at all. In 1948 Erdős and Straus asked whether
    <code>4/n</code> can always be written as just <em>three</em> unit fractions. Computers have
    confirmed it for every n up to 10<sup>17</sup>. Nobody has proved it. The scribe's game is
    the oldest game still being played, and it is not finished.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-loaves .knife-lab { font-family: var(--mono); font-size: .74rem; letter-spacing: .12em;
        color: var(--ink-faint); align-self: center; margin-right: .2rem; }
      #ex-loaves .papyrus { border: 1px solid var(--gold-dim); background: rgba(201,169,89,.05);
        border-radius: 4px; padding: .7rem 1rem; margin-top: .7rem; font-size: .95rem;
        color: var(--ink-dim); min-height: 2.2rem; }
      #ex-loaves .papyrus b { color: var(--gold); font-weight: 600; }
      #ex-loaves .papyrus .pline { opacity: 0; animation: loaves-fade .5s ease forwards; margin: .28rem 0; }
      #ex-loaves .papyrus .pwait { color: var(--ink-faint); font-style: italic; }
      @keyframes loaves-fade { to { opacity: 1; } }
      #ex-loaves .shelf { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .6rem; }
      #ex-loaves .shelf-title { font-family: var(--mono); font-size: .72rem; letter-spacing: .14em;
        color: var(--ink-faint); margin-top: 1.1rem; }
      #ex-loaves .shelf-entry { border: 1px solid var(--line); background: var(--bg-panel);
        border-radius: 3px; padding: .3rem .6rem; font-family: var(--mono); font-size: .8rem;
        color: var(--ink-dim); }
      #ex-loaves .shelf-entry b { color: var(--gold); font-weight: 600; }
      #ex-loaves .eg { text-decoration: overline; color: var(--gold-bright); padding: 0 .06em; }
      #ex-loaves .hint-line { color: var(--ink-dim); font-style: italic; font-size: .95rem;
        margin: .5rem 0 0; border-left: 2px solid var(--gold-dim); padding-left: .8rem; }
    `;
    stage.appendChild(style);

    /* ---------- state ---------- */
    const QUESTS = [
      {
        loaves: 3, workers: 4,
        banner: 'A foreman’s commission: serve <b>3 loaves to 4 workers</b> — every plate identical, ' +
                'no bread left on the table, and no plate carrying two pieces of the same size.',
        hint: 'Halve every loaf: six halves, four workers — serve four, and two halves remain. ' +
              'A half, halved again, is a quarter.',
      },
      {
        loaves: 2, workers: 5,
        banner: 'The scribe’s own doubling: <b>2 loaves to 5 workers</b>. The papyrus does it with two kinds of piece.',
        hint: 'Cut both loaves into thirds — six thirds, five workers. One third remains on the table; ' +
              'the fifth knife turns it into fifteenths.',
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
    let lastChk = null;
    let plateSums = [];           // cached per-worker sum strings
    let hoverId = 0;
    let pending = null;           // { id, x0, y0 } — maybe click (cut), maybe drag
    let dragId = 0;
    let dragOver = -1;            // worker index under the dragged piece
    let pointer = [0, 0];
    let note = null;              // { text, until }
    let pulses = [];              // celebration rings { x, y, start }
    let appr = null;              // apprentice animation { steps, shown, nextAt }
    let lastT = 0;
    let knife = 2;
    const solvedKeys = new Set();
    const geo = { loaves: [], workers: [], loafR: 60, plateRx: 46, pieceR: 34 };

    const bus = audio.createBus('loaves');

    /* ---------- DOM ---------- */
    const quest = ui.questBanner(stage, QUESTS[0].banner);
    const handle = cv.setupCanvas(stage, { height: 470 });
    const canvas = handle.canvas;
    canvas.style.touchAction = 'none';

    const knivesRow = ui.controlRow(stage);
    const knifeLab = document.createElement('span');
    knifeLab.className = 'knife-lab';
    knifeLab.textContent = 'KNIFE';
    knivesRow.appendChild(knifeLab);
    const knifeBtns = {};
    for (const k of KNIVES) {
      knifeBtns[k] = ui.button(knivesRow, KNIFE_GLYPHS[k], () => setKnife(k), { small: true });
      knifeBtns[k].title = `cut a piece into ${k} equal parts`;
    }
    const undoBtn = ui.button(knivesRow, 'undo', () => { undo(); }, { small: true });
    const gatherBtn = ui.button(knivesRow, 'gather the loaves', () => { snapshot(); resetPieces(); refresh(); }, { small: true });
    const hintBtn = ui.button(knivesRow, 'hint', showHint, { small: true });
    const skipBtn = ui.button(knivesRow, 'skip', () => advance(false), { small: true });
    const nextBtn = ui.button(knivesRow, 'take the next commission →', () => advance(true), { primary: true });
    nextBtn.style.display = 'none';

    const meter = ui.readout(stage, '');
    const hintDiv = document.createElement('p');
    hintDiv.className = 'hint-line';
    hintDiv.style.display = 'none';
    stage.appendChild(hintDiv);
    ui.caption(stage,
      'Click a piece to cut it with the chosen knife; drag pieces onto plates — and back, if you regret. ' +
      'The meter demands identical plates, an empty table, and (the scribe’s rule) no plate holding two pieces of the same size.');

    // -- apprentice / challenge corner (revealed after the quest ladder) --
    const challWrap = document.createElement('div');
    stage.appendChild(challWrap);
    challWrap.style.display = 'none';
    ui.caption(challWrap,
      'The commissions are done — and an apprentice arrives, trained in the greedy rule: always serve the largest ' +
      'unit piece that fits. He is fast, and correct, and beatable. Beat him on the thinness of the worst sliver, or on the number of piece kinds.');
    const challRow = ui.controlRow(challWrap);
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
    const loavesStep = ui.stepper(challRow, {
      label: 'loaves', min: 1, max: 4, value: 3,
      onChange: () => startCustom(),
    });
    const workersStep = ui.stepper(challRow, {
      label: 'workers', min: 2, max: 9, value: 5,
      onChange: () => startCustom(),
    });
    loavesStep.el.style.display = 'none';
    workersStep.el.style.display = 'none';
    const summonBtn = ui.button(challRow, 'summon the apprentice', summonApprentice);
    const papyrus = document.createElement('div');
    papyrus.className = 'papyrus';
    papyrus.innerHTML = '<div class="pwait">The apprentice waits, brush ready.</div>';
    challWrap.appendChild(papyrus);

    // -- the shelf: the visitor's own table --
    const shelfTitle = document.createElement('div');
    shelfTitle.className = 'shelf-title';
    shelfTitle.textContent = 'YOUR TABLE OF DEALS';
    stage.appendChild(shelfTitle);
    const shelf = document.createElement('div');
    shelf.className = 'shelf';
    stage.appendChild(shelf);
    const shelfNote = ui.caption(stage,
      'The scribes wrote a unit fraction as the number with a mouth-sign drawn above it; Egyptologists print ' +
      'that as an overline — <span class="eg">4</span> means 1/4. Your fair deals collect here, your own hieratic table.');

    // -- the full 2/n table, Ahmes vs. the greedy knife --
    const tableWrap = document.createElement('div');
    stage.appendChild(tableWrap);
    tableWrap.style.display = 'none';
    ui.caption(tableWrap,
      'The papyrus’ full table against the apprentice, all fifty entries: step through the odd numbers and watch who wins.');
    const tableRow = ui.controlRow(tableWrap);
    const tableStep = ui.stepper(tableRow, {
      label: 'the table, 2/n', min: 3, max: 101, step: 2, value: 13,
      format: (v) => `2/${v}`,
      onChange: (v) => tableOut.setHTML(tableEntryHTML(v)),
    });
    const tableOut = ui.readout(tableWrap, '');

    // -- the stretch: Erdős–Straus, the oldest game's open problem --
    ui.caption(stage,
      '<b>The oldest game still has an open problem.</b> In 1948 Paul Erdős and Ernst Straus conjectured that ' +
      '<code>4/n</code> is always the sum of just <em>three</em> unit fractions. Machines have verified every n up to ' +
      '10<sup>17</sup>; no proof exists. Dial an n and watch the solutions — and how wildly the thinnest slice jumps.');
    const esRow = ui.controlRow(stage);
    const esStep = ui.stepper(esRow, {
      label: 'Erdős–Straus, 4/n', min: 2, max: 300, value: 5,
      format: (v) => `4/${v}`,
      onChange: (v) => esOut.setHTML(esHTML(v)),
    });
    const esOut = ui.readout(stage, '');

    ui.legendPanel(stage,
      '<p>The wedjat — the eye of Horus, torn to pieces by Set and made whole again by Thoth — was long said to ' +
      'hide in its parts the scribes’ grain fractions: 1/2, 1/4, 1/8, 1/16, 1/32 and 1/64 of a hekat of corn. Add the ' +
      'god’s pieces and you reach only 63/64; the missing sixty-fourth, the story goes, is supplied by Thoth himself ' +
      'for the honest scribe. It is a beautiful tale, assembled by Egyptologists early in the twentieth century — and ' +
      'taken apart by them in the twenty-first: the sign-histories show these “eye parts” descending from ordinary ' +
      'hieratic corn-measure marks, not from the god’s anatomy. The fractions are real; the wounded eye is a story ' +
      'we told about them.</p>');

    /* ---------- deal & piece machinery ---------- */

    function setKnife(k) {
      knife = k;
      for (const kk of KNIVES) knifeBtns[kk].classList.toggle('active', kk === k);
    }
    setKnife(2);

    function resetPieces() {
      pieces = [];
      for (let i = 0; i < deal.loaves; i++) {
        pieces.push({
          id: nextId++, den: 1, loaf: i, at: 'table', worker: -1,
          x: 0, y: 0, r: 0, a0: -Math.PI / 2, a1: -Math.PI / 2 + TAU,
          tx: 0, ty: 0, tr: 0, ta0: -Math.PI / 2, ta1: -Math.PI / 2 + TAU,
        });
      }
      layoutTargets(handle.width, handle.height);
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
      dragId = 0; pending = null;
      papyrus.innerHTML = '<div class="pwait">The apprentice waits, brush ready.</div>';
      nextBtn.style.display = 'none';
      hintDiv.style.display = 'none';
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
      refresh();
    }

    function plateDens() {
      const plates = Array.from({ length: deal.workers }, () => []);
      for (const p of pieces) if (p.at === 'plate' && p.worker >= 0) plates[p.worker].push(p.den);
      return plates;
    }

    function tableLeft() {
      let s = new Frac(0n, 1n);
      for (const p of pieces) if (p.at === 'table') s = s.add(unit(p.den));
      return s;
    }

    function doCut(p) {
      if (p.at !== 'table') { flash('bring it back to the table to cut it'); refuseSound(); return; }
      if (p.den * knife > MAX_DEN) { flash('the knife cannot cut finer than the crumb'); refuseSound(); return; }
      if (pieces.length + knife - 1 > MAX_PIECES) { flash('the table is drowning in pieces — gather some back'); refuseSound(); return; }
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
      audio.drums.rim(bus, bus.context.currentTime, { level: 0.4 });
      audio.drums.wood(bus, bus.context.currentTime + 0.01, { level: 0.3, pitch: 900 + 60 * Math.log2(p.den * knife) });
      refresh();
    }

    function servePiece(p, w) {
      snapshot();
      p.at = 'plate'; p.worker = w;
      audio.drums.wood(bus, bus.context.currentTime, { level: 0.4, pitch: 420 + 55 * Math.log2(p.den + 1) });
      refresh();
    }

    function returnPiece(p) {
      snapshot();
      p.at = 'table'; p.worker = -1;
      audio.drums.wood(bus, bus.context.currentTime, { level: 0.25, pitch: 300 });
      refresh();
    }

    /* ---------- fairness, celebration, shelf ---------- */

    function refresh() {
      const plates = plateDens();
      lastChk = checkFairness({ loaves: deal.loaves, workers: deal.workers, plates });
      plateSums = plates.map((pl) => {
        let s = new Frac(0n, 1n);
        for (const d of pl) s = s.add(unit(d));
        return s.isZero() ? '·' : s.toString();
      });
      meter.setHTML(meterHTML(lastChk));
      if (lastChk.scribal && !celebrated) celebrate(plates[0].map(Number).sort((a, b) => a - b));
      else if (lastChk.fair && !lastChk.scribal && !fairChimed) {
        fairChimed = true;
        const t0 = bus.context.currentTime;
        audio.playTone(bus, { freq: 392, dur: 0.3, level: 0.3, when: t0 });
        audio.playTone(bus, { freq: 440, dur: 0.35, level: 0.3, when: t0 + 0.12 });
      }
      // re-arm once the deal is disturbed, so a *different* fair deal for the
      // same commission can also be found, celebrated, and shelved
      if (!lastChk.scribal) celebrated = false;
    }

    function meterHTML(chk) {
      const ok = `<span style="color:${P.verdant}">✓</span>`;
      const dim = `<span style="color:${P.inkFaint}">·</span>`;
      const left = tableLeft();
      const leftAmt = left.d === 1n
        ? `${left} ${left.n === 1n ? 'loaf' : 'loaves'}`
        : `${left} of a loaf`;
      const leftStr = left.isZero()
        ? `table empty ${ok}`
        : `on the table: <span style="color:${P.gold}">${leftAmt}</span>`;
      let line = `${leftStr}&ensp;·&ensp;plates identical ${chk.identical && chk.served.n !== 0n ? ok : dim}` +
                 `&ensp;·&ensp;no repeated size ${chk.distinct && chk.served.n !== 0n ? ok : dim}`;
      if (chk.scribal) {
        const dens = plateDens()[0].map(Number).sort((a, b) => a - b);
        line = `<span style="color:${P.goldBright}">☑ ${deal.workers} identical plates — each worker holds ` +
               `${densSum(dens)} = ${chk.share}. No one can complain.</span>`;
      } else if (chk.fair) {
        line += `<br><span style="color:${P.gold}">Fair — every plate matches. But Ahmes never writes the same part twice: ` +
                `gather the loaves and try unequal knives.</span>`;
      }
      return line;
    }

    function celebrate(dens) {
      celebrated = true;
      solvedKeys.add(`${deal.loaves}/${deal.workers}`);
      for (const w of geo.workers) pulses.push({ x: w.x, y: w.plateY, start: lastT });
      const t0 = bus.context.currentTime;
      [392, 493.88, 587.33, 783.99].forEach((f, i) =>
        audio.playTone(bus, { freq: f, dur: 0.5, level: 0.32, when: t0 + i * 0.09 }));
      audio.playTone(bus, { freq: 196, dur: 1.1, level: 0.18, type: 'triangle', when: t0 });
      shelfAdd(dens);
      quest.done(phase === 'quest' ? questVerdict(dens) : raceVerdict(dens));
      if (phase === 'quest') nextBtn.style.display = '';
    }

    function questVerdict(dens) {
      const sh = Frac.of(deal.loaves, deal.workers);
      let out = `No one can complain: each worker holds ${densSum(dens)} = ${sh}.`;
      const ah = sh.n === 2n ? AHMES_TABLE[Number(sh.d)] : null;
      if (ah && ah.length === dens.length && ah.every((d, i) => d === dens[i])) {
        out += ' It is the very entry Ahmes copied onto the papyrus, thirty-six centuries ago.';
      }
      return out;
    }

    function raceVerdict(dens) {
      const g = greedyDens;
      const vMax = dens[dens.length - 1], gMax = g[g.length - 1];
      const sameAsGreedy = dens.length === g.length && dens.every((d, i) => d === g[i]);
      const sh = Frac.of(deal.loaves, deal.workers);
      const ah = sh.n === 2n ? AHMES_TABLE[Number(sh.d)] : null;
      const ahMatch = ah && ah.length === dens.length && ah.every((d, i) => d === dens[i]);
      let out;
      if (sameAsGreedy) {
        out = `You and the apprentice made the very same deal: ${densSum(dens)}.`;
      } else if (dens.length < g.length || vMax < gMax) {
        out = `You have out-scribed the apprentice — your thinnest piece is 1/${vMax} against his 1/${gMax}` +
              (dens.length < g.length ? `, and in fewer kinds (${dens.length} against ${g.length})` : '') + '.';
      } else {
        out = `Fair and scribal — though the apprentice’s deal (${densSum(g)}) is leaner. The knives are still out.`;
      }
      if (ahMatch) out += ' And it is the very entry on the papyrus — you and Ahmes agree across thirty-six centuries.';
      else if (ah) out += ` The papyrus, for the record, says ${densSum(ah)}.`;
      return out;
    }

    function shelfAdd(dens) {
      const key = `${deal.loaves}÷${deal.workers}=${dens.join(',')}`;
      if (shelf.querySelector(`[data-key="${key}"]`)) return;
      const e = document.createElement('div');
      e.className = 'shelf-entry';
      e.dataset.key = key;
      e.innerHTML = `<b>${deal.loaves} ÷ ${deal.workers}</b> = ${densSum(dens)}&ensp;` +
                    dens.map((d) => `<span class="eg">${d}</span>`).join(' ');
      shelf.appendChild(e);
    }

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
      tableOut.setHTML(tableEntryHTML(tableStep.value));
      challSel.set('9');
      startChallenge(2, 9);
    }

    function startChallenge(L, W) {
      newDeal(L, W);
      quest.set(`Beat the apprentice at <b>${L} ÷ ${W}</b>: his greedy rule reaches a thinnest piece of ` +
                `1/${greedyDens[greedyDens.length - 1]} in ${greedyDens.length} kinds. The papyrus does better. Can you?`);
    }

    function startCustom() {
      let L = loavesStep.value, W = workersStep.value;
      if (L >= W) { L = W - 1; loavesStep.set(L); }
      newDeal(L, W);
      quest.set(`Your own commission: <b>${L} loaves to ${W} workers</b> — each share ${Frac.of(L, W)}. ` +
                `The apprentice would reach 1/${greedyDens[greedyDens.length - 1]}; the shelf awaits your deal.`);
    }

    function summonApprentice() {
      audio.ensureAudio();
      papyrus.innerHTML = '';
      appr = { steps: greedyNarrative(deal.loaves, deal.workers), shown: 0, nextAt: 0 };
    }

    /* ---------- the 2/n table explorer ---------- */

    function tableEntryHTML(n) {
      const a = AHMES_TABLE[n];
      const g = greedyExpand(2, n).map(Number);
      if (!a) return '';
      const aMax = a[a.length - 1], gMax = g[g.length - 1];
      const same = a.length === g.length && a.every((d, i) => d === g[i]);
      let verdict;
      if (same) {
        verdict = 'Here the greedy knife and the papyrus agree exactly.';
      } else if (aMax < gMax) {
        const ratio = gMax / aMax;
        verdict = `Ahmes’ thinnest part is 1/${aMax} against greedy’s 1/${gMax}` +
                  (ratio >= 2 ? ` — ${ratio % 1 === 0 ? ratio : ratio.toFixed(1)}× thicker bread` : '') +
                  (a.length > g.length ? `, bought with an extra part` : '') + '. The table is engineered.';
      } else {
        const evens = a.filter((d) => d % 2 === 0).length;
        verdict = (evens >= a.length - 1)
          ? `On paper the apprentice wins this row — but Ahmes’ parts (${a.join(', ')}) are even and double cleanly. ` +
            `He optimized for his arithmetic, not for ours.`
          : `The apprentice wins this row on both counts; the table’s reasons here are its own — scholars still argue over its system.`;
      }
      const solved = solvedKeys.has(`2/${n}`) ? `<span style="color:${P.verdant}"> · you have dealt this one yourself</span>` : '';
      return `Ahmes:&ensp;<span style="color:${P.gold}">2/${n} = ${densSum(a)}</span>&ensp;(${a.length} parts)<br>` +
             `greedy:&ensp;<span style="color:${P.azure}">2/${n} = ${densSum(g)}</span>&ensp;(${g.length} parts)<br>` +
             `<span style="color:${P.inkDim}">${verdict}</span>${solved}`;
    }

    /* ---------- Erdős–Straus explorer ---------- */

    const esCache = new Map();
    function esFirstZ(n) {
      if (!esCache.has(n)) {
        const s = erdosStraus(n, 1);
        esCache.set(n, s.length ? s[0][2] : null);
      }
      return esCache.get(n);
    }

    function esHTML(n) {
      const sols = erdosStraus(n, 2);
      const lines = sols.map(([x, y, z]) =>
        `<span style="color:${P.gold}">4/${n} = 1/${x} + 1/${y} + 1/${z}</span>`).join('&ensp;·&ensp;');
      const win = [];
      for (let m = Math.max(2, n - 3); m <= Math.min(300, n + 3); m++) {
        const z = esFirstZ(m);
        win.push(m === n
          ? `<b style="color:${P.goldBright}">${m}→${z}</b>`
          : `<span style="color:${P.inkFaint}">${m}→${z}</span>`);
      }
      return `${lines || 'searching…'}<br>` +
             `<span style="color:${P.inkDim}">first-found thinnest slice z, nearby:</span> ${win.join('  ')}`;
    }

    /* ---------- layout & drawing ---------- */

    function layoutTargets(W, H) {
      const L = deal.loaves, K = deal.workers;
      const R = clamp(Math.min(66, (W - 100) / (2.6 * L)), 34, 66);
      geo.loafR = R;
      const loafDx = Math.min(2.7 * R + 16, L > 1 ? (W - 150) / (L - 1) : 0);
      geo.loaves = [];
      for (let i = 0; i < L; i++) {
        geo.loaves.push({ x: W / 2 + (i - (L - 1) / 2) * loafDx, y: 122, r: R });
      }
      const ws = Math.min(118, (W - 60) / K);
      geo.ws = ws;
      geo.plateRx = Math.min(48, ws * 0.42);
      geo.pieceR = Math.min(34, geo.plateRx * 0.85);
      geo.workers = [];
      const plateY = H - 62;
      for (let j = 0; j < K; j++) {
        geo.workers.push({ x: W / 2 + (j - (K - 1) / 2) * ws, plateY });
      }
      // pack table pieces per loaf
      for (let i = 0; i < L; i++) {
        const lp = pieces.filter((p) => p.at === 'table' && p.loaf === i && p.id !== dragId);
        const spanSum = lp.reduce((s, p) => s + TAU / p.den, 0);
        const gap = lp.length > 1 ? Math.min(0.05, Math.max(0, (TAU - spanSum) / lp.length)) : 0;
        let cursor = -Math.PI / 2;
        for (const p of lp) {
          const span = TAU / p.den;
          const mid = cursor + span / 2;
          const off = p.den === 1 ? 0 : 3.5;
          p.ta0 = cursor; p.ta1 = cursor + span;
          p.tx = geo.loaves[i].x + Math.cos(mid) * off;
          p.ty = geo.loaves[i].y + Math.sin(mid) * off;
          p.tr = geo.loaves[i].r;
          cursor += span + gap;
        }
      }
      // pack plate pieces per worker, fanned upward
      for (let j = 0; j < K; j++) {
        const pp = pieces.filter((p) => p.at === 'plate' && p.worker === j && p.id !== dragId)
                         .sort((a, b) => a.den - b.den);
        const gap = 0.06;
        const total = pp.reduce((s, p) => s + TAU / p.den, 0) + gap * Math.max(0, pp.length - 1);
        let cursor = -Math.PI / 2 - Math.min(total, TAU) / 2;
        for (const p of pp) {
          const span = TAU / p.den;
          p.ta0 = cursor; p.ta1 = cursor + span;
          p.tx = geo.workers[j].x;
          p.ty = geo.workers[j].plateY - 8;
          p.tr = geo.pieceR;
          cursor += span + gap;
        }
      }
    }

    function drawPiece(ctx, p, hovered) {
      ctx.beginPath();
      if (p.a1 - p.a0 >= TAU - 1e-6) {
        ctx.arc(p.x, p.y, p.r, 0, TAU);
      } else {
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, p.r, p.a0, p.a1);
        ctx.closePath();
      }
      ctx.fillStyle = P.gold + 'd2';
      ctx.fill();
      ctx.strokeStyle = P.bg;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // crust along the outer arc
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, p.r - 2), p.a0 + 0.02, p.a1 - 0.02);
      ctx.strokeStyle = P.goldDim;
      ctx.lineWidth = 4;
      ctx.stroke();
      if (p.den === 1) {
        // score marks on a whole loaf
        ctx.strokeStyle = P.goldDim;
        ctx.lineWidth = 2;
        for (let s = -1; s <= 1; s++) {
          ctx.beginPath();
          ctx.moveTo(p.x + s * p.r * 0.28 - p.r * 0.22, p.y - p.r * 0.25);
          ctx.lineTo(p.x + s * p.r * 0.28 + p.r * 0.22, p.y + p.r * 0.25);
          ctx.stroke();
        }
      }
      if (hovered) {
        ctx.beginPath();
        if (p.a1 - p.a0 >= TAU - 1e-6) ctx.arc(p.x, p.y, p.r + 1.5, 0, TAU);
        else { ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, p.r + 1.5, p.a0, p.a1); ctx.closePath(); }
        ctx.strokeStyle = P.goldBright;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    function draw(dt, t) {
      lastT = t;
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      layoutTargets(W, H);

      const ease = 1 - Math.exp(-dt * 11);
      for (const p of pieces) {
        if (p.id === dragId) {
          const span = TAU / p.den;
          p.tx = pointer[0]; p.ty = pointer[1];
          p.ta0 = -Math.PI / 2 - span / 2; p.ta1 = -Math.PI / 2 + span / 2;
          p.tr = geo.loafR * 0.85;
        }
        p.x += (p.tx - p.x) * ease;
        p.y += (p.ty - p.y) * ease;
        p.r += (p.tr - p.r) * ease;
        p.a0 += (p.ta0 - p.a0) * ease;
        p.a1 += (p.ta1 - p.a1) * ease;
      }

      // the baker's table
      const bandB = 224;
      ctx.fillStyle = P.panel;
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      roundRect(ctx, 24, 20, W - 48, bandB - 20, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.inkFaint;
      ctx.font = MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('THE TABLE', 38, 40);

      // workers & plates
      const fairNow = lastChk && lastChk.scribal;
      for (let j = 0; j < geo.workers.length; j++) {
        const wkr = geo.workers[j];
        // head & shoulders
        ctx.strokeStyle = j === dragOver ? P.goldBright : P.inkFaint;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(wkr.x, wkr.plateY - geo.pieceR - 46, 7, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(wkr.x, wkr.plateY - geo.pieceR - 16, 15, Math.PI + 0.55, TAU - 0.55);
        ctx.stroke();
        // plate
        ctx.beginPath();
        ctx.ellipse(wkr.x, wkr.plateY, geo.plateRx, geo.plateRx * 0.28, 0, 0, TAU);
        ctx.fillStyle = P.panel;
        ctx.fill();
        ctx.strokeStyle = fairNow ? P.verdant : (j === dragOver ? P.goldBright : P.line);
        ctx.lineWidth = j === dragOver ? 2 : 1.2;
        ctx.stroke();
        // held sum
        ctx.fillStyle = fairNow ? P.verdant : P.inkDim;
        ctx.font = MONO;
        ctx.textAlign = 'center';
        ctx.fillText(plateSums[j] || '·', wkr.x, wkr.plateY + 24);
      }

      // pieces: table first, then plates, dragged last
      const dragged = pieces.find((p) => p.id === dragId);
      for (const p of pieces) if (p.at === 'table' && p.id !== dragId) drawPiece(ctx, p, p.id === hoverId);
      for (const p of pieces) if (p.at === 'plate' && p.id !== dragId) drawPiece(ctx, p, p.id === hoverId);
      if (dragged) drawPiece(ctx, dragged, true);

      // celebration rings
      for (const pu of pulses) {
        const age = t - pu.start;
        if (age > 1 || age < 0) continue;
        ctx.beginPath();
        ctx.arc(pu.x, pu.y - 10, 18 + age * 95, 0, TAU);
        ctx.strokeStyle = P.goldBright + Math.floor((1 - age) * 200).toString(16).padStart(2, '0');
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      pulses = pulses.filter((pu) => t - pu.start <= 1);

      // hover tooltip: the piece's size
      const hp = pieces.find((p) => p.id === hoverId);
      if (hp && !dragged) {
        ctx.fillStyle = P.ink;
        ctx.font = MONO;
        ctx.textAlign = 'left';
        ctx.fillText(hp.den === 1 ? '1 loaf' : `1/${hp.den}`, pointer[0] + 14, pointer[1] - 10);
      }

      // transient note
      if (note && t < note.until) {
        ctx.fillStyle = P.crimson;
        ctx.font = MONO;
        ctx.textAlign = 'center';
        ctx.fillText(note.text, W / 2, bandB + 22);
      }

      // apprentice papyrus animation (time comes from the rAF loop, so it
      // freezes cleanly when the exhibit is paused)
      if (appr && appr.shown < appr.steps.length && t >= appr.nextAt) {
        const line = document.createElement('div');
        line.className = 'pline';
        line.innerHTML = appr.steps[appr.shown];
        papyrus.appendChild(line);
        audio.drums.wood(bus, bus.context.currentTime, { level: 0.25, pitch: 700 + appr.shown * 40 });
        appr.shown++;
        appr.nextAt = t + 1.25;
      }
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function flash(text) { note = { text, until: lastT + 2.6 }; }

    function refuseSound() {
      audio.ensureAudio();
      audio.drums.thock(bus, bus.context.currentTime, { level: 0.3 });
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
          if (a > p.a1) continue;
        }
        if (!best || p.den > best.den) best = p;   // prefer the smaller piece (easier to grab slivers)
      }
      return best;
    }

    function hitWorker(x, y) {
      if (y < 250) return -1;
      for (let j = 0; j < geo.workers.length; j++) {
        if (Math.abs(x - geo.workers[j].x) < geo.ws / 2) return j;
      }
      return -1;
    }

    function onDown(e) {
      audio.ensureAudio();
      const [x, y] = cv.pointerPos(handle, e);
      pointer = [x, y];
      const p = hitPiece(x, y);
      if (p) {
        pending = { id: p.id, x0: x, y0: y };
        canvas.setPointerCapture(e.pointerId);
      }
    }

    function onMove(e) {
      const [x, y] = cv.pointerPos(handle, e);
      pointer = [x, y];
      if (pending && !dragId) {
        const dx = x - pending.x0, dy = y - pending.y0;
        if (dx * dx + dy * dy > 49) {
          dragId = pending.id;
          audio.drums.wood(bus, bus.context.currentTime, { level: 0.2, pitch: 340 });
        }
      }
      if (dragId) {
        dragOver = hitWorker(x, y);
        canvas.style.cursor = 'grabbing';
      } else {
        const p = hitPiece(x, y);
        hoverId = p ? p.id : 0;
        canvas.style.cursor = p ? 'pointer' : 'default';
      }
    }

    function onUp(e) {
      const [x, y] = cv.pointerPos(handle, e);
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
      if (dragId) {
        const p = pieces.find((q) => q.id === dragId);
        const w = hitWorker(x, y);
        dragId = 0; dragOver = -1;
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
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', () => { pending = null; dragId = 0; dragOver = -1; });

    /* ---------- boot ---------- */

    startQuest(0);
    tableOut.setHTML(tableEntryHTML(tableStep.value));
    esOut.setHTML(esHTML(esStep.value));
    const loop = cv.rafLoop(draw);
    loop.start();

    return {
      pause() { loop.stop(); bus.mute(); },
      resume() { bus.unmute(); loop.start(); },
      destroy() { loop.stop(); bus.dispose(); handle.destroy(); style.remove(); },
    };
  },
};

/* ---------- pure exports for node tests ---------- */

export const _test = {
  greedyExpand, checkFairness, verifyExpansion,
  AHMES_TABLE, selfCheckTable, erdosStraus, greedyNarrative,
};
