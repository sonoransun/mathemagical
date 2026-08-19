// III — The Strange Loop
// Hofstadter's MIU game and its unreachable MU; arithmetization; a working
// quine and the diagonal lemma building Gödel's sentence live; the fully
// playable Kirby–Paris hydra with an ε₀ ordinal meter; Goodstein sequences
// computed in hereditary base notation with BigInt.
//
// Everything interactive here computes the real object: the BFS really
// enumerates MIU theorems, the fixed point is really constructed by
// substitution, the hydra ordinal really decreases (core ordCmp checks it),
// and the Goodstein values are the actual hereditary-base computation.

import {
  clamp, formatBig, digitsInBase,
  ordCmp, ordIsFinite, ordSumOfOmegaPows, ordToString,
} from '../../core/math.js';

/* ==================== MIU (Hofstadter 1979) ====================
   Axiom MI. Rules: (I) xI → xIU, (II) Mx → Mxx, (III) xIIIy → xUy,
   (IV) xUUy → xy. MU is underivable: the I-count mod 3 starts at 1
   and no rule can ever make it 0. */

function iCount(s) {
  let n = 0;
  for (const ch of s) if (ch === 'I') n++;
  return n;
}

// All distinct legal successor strings of s (length-capped so rule II
// cannot explode). Returns [{rule: 1..4, to}], deduped by (rule, result).
function miuMoves(s, maxLen = 40) {
  const out = [];
  const seen = new Set();
  const push = (rule, to) => {
    const key = rule + ':' + to;
    if (!seen.has(key)) { seen.add(key); out.push({ rule, to }); }
  };
  if (s.endsWith('I') && s.length + 1 <= maxLen) push(1, s + 'U');
  if (s.length >= 2 && s.length * 2 - 1 <= maxLen) push(2, 'M' + s.slice(1) + s.slice(1));
  for (let i = 1; i <= s.length - 3; i++) {
    if (s.startsWith('III', i)) push(3, s.slice(0, i) + 'U' + s.slice(i + 3));
  }
  for (let i = 1; i <= s.length - 2; i++) {
    if (s.startsWith('UU', i)) push(4, s.slice(0, i) + s.slice(i + 2));
  }
  return out;
}

// Incremental breadth-first enumeration of every theorem reachable from MI
// without ever growing past maxLen letters. step(budget) expands up to
// `budget` strings; done/found/count are live.
function makeBFS(maxLen = 15, cap = 400000) {
  const seen = new Set(['MI']);
  const queue = ['MI'];
  let qi = 0;
  return {
    found: false,
    done: false,
    get count() { return seen.size; },
    latest() { return queue[Math.min(qi, queue.length - 1)]; },
    step(budget = 400) {
      let k = 0;
      while (qi < queue.length && k < budget && seen.size < cap) {
        const s = queue[qi++];
        for (const m of miuMoves(s, maxLen)) {
          if (!seen.has(m.to)) {
            seen.add(m.to);
            queue.push(m.to);
            if (m.to === 'MU') this.found = true;
          }
        }
        k++;
      }
      if (qi >= queue.length || seen.size >= cap) this.done = true;
      return this.done;
    },
  };
}

// Run the BFS to completion synchronously (for tests).
function miuBFS(maxLen = 12, cap = 400000) {
  const b = makeBFS(maxLen, cap);
  while (!b.step(5000)) { /* pump */ }
  return { found: b.found, count: b.count };
}

// Arithmetization, Hofstadter's own coding: M,I,U → digits 3,1,0.
// MI = 31, MU = 30, MIU = 310. Strings become numbers; "derivable"
// becomes a property of numbers.
function godelNumber(s) {
  let digits = '';
  for (const ch of s) digits += ch === 'M' ? '3' : ch === 'I' ? '1' : '0';
  return BigInt(digits);
}

/* ==================== quine & diagonal lemma ====================
   A real, runnable JS quine (blueprint + copier), and a toy quotation
   language in which the diagonal-lemma substitution is performed
   mechanically: diag(⌜s⌝) = ⌜s with every □ replaced by ⌜s⌝⌝. */

const QUINE = `var s = "console.log('var s = ' + JSON.stringify(s) + '; eval(s)')"; eval(s)`;

// Execute a program capturing its console.log output. Pure enough for node.
function runQuine(src) {
  let out = '';
  const fake = { log: (...a) => { out += a.join(' '); } };
  try {
    new Function('console', src)(fake);
  } catch (e) {
    return null; // an embedding that forbids Function() — caller handles
  }
  return out;
}

const quote = (s) => '⌜' + s + '⌝';
// The diagonalization operator: substitute the quotation of s into s itself.
const diagOp = (s) => s.split('□').join(quote(s));

// For a property name P, build the template T = P(diag(□)) and its fixed
// point G = T[□ := ⌜T⌝]. Then evaluating diag(⌜T⌝) yields ⌜G⌝: the sentence
// G asserts P of its own quotation.
function buildFixedPoint(pname) {
  const T = pname + '(diag(□))';
  const G = T.split('□').join(quote(T));
  return { T, G };
}

// Evaluate the diag(⌜…⌝) term inside a sentence. Returns the quotation it
// denotes. For fixed points, evalDiag(G) === quote(G).
function evalDiag(sentence) {
  const m = sentence.match(/diag\(⌜(.*)⌝\)/s);
  if (!m) return null;
  return quote(diagOp(m[1]));
}

/* ==================== the Kirby–Paris hydra ====================
   A hydra is a rooted tree: node = { kids: [...] }; a head is a leaf.
   Chop a head on turn n: remove it; if its parent is not the root, the
   grandparent sprouts n fresh copies of the maimed parent subtree.
   Ordinal: ord(node) = Σ ω^ord(child) — a bare head contributes ω⁰ = 1.
   Every chop strictly decreases the root ordinal, so Hercules always
   wins; PA cannot prove this (Kirby–Paris 1982). */

function hNode(...kids) { return { kids }; }

function hClone(node) {
  const c = { kids: node.kids.map(hClone) };
  if (node.b !== undefined) c.b = node.b; // birth time, UI-only, preserved
  return c;
}

function hydraOrd(node) {
  return ordSumOfOmegaPows(node.kids.map(hydraOrd));
}

// Paths (arrays of child indices) to every head, leftmost-deepest first.
function hydraLeafPaths(node, base = [], out = []) {
  node.kids.forEach((k, i) => {
    const p = [...base, i];
    if (k.kids.length === 0) out.push(p);
    else hydraLeafPaths(k, p, out);
  });
  return out;
}

function hydraSize(node) {
  let n = 1;
  for (const k of node.kids) n += hydraSize(k);
  return n;
}

// Pure chop: returns { tree, regrown } where regrown (or null) locates the
// freshly sprouted copies: { path: path-of-grandparent, from, count }.
function hydraChop(root, path, n) {
  const t = hClone(root);
  const chain = [t];
  let cur = t;
  for (const i of path) { cur = cur.kids[i]; chain.push(cur); }
  if (cur.kids.length !== 0) throw new Error('hydraChop: not a head');
  const parent = chain[chain.length - 2];
  parent.kids.splice(path[path.length - 1], 1);
  let regrown = null;
  if (path.length >= 2) {
    const gp = chain[chain.length - 3];
    const pIdx = path[path.length - 2];
    const copies = [];
    for (let i = 0; i < n; i++) copies.push(hClone(parent));
    gp.kids.splice(pIdx + 1, 0, ...copies);
    regrown = { path: path.slice(0, -2), from: pIdx + 1, count: n };
  }
  return { tree: t, regrown };
}

function defaultHydra() {
  // ord = ω² + ω + 1
  return hNode(hNode(hNode(), hNode()), hNode(hNode()), hNode());
}

/* ==================== Goodstein sequences (1944) ====================
   Write n in hereditary base b (every exponent, and every exponent's
   exponent, also in base b); bump every b to b+1; subtract 1. Every such
   sequence reaches 0 — and PA cannot prove that (Kirby–Paris 1982). */

// Value of n after rewriting its hereditary base-b form with base b+1.
function bumpEval(n, b) {
  const B = BigInt(b), B1 = BigInt(b + 1);
  if (n < B) return n;
  const ds = digitsInBase(n, b); // most significant first, digits < b
  const top = ds.length - 1;
  let total = 0n;
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    if (!d) continue;
    const e = bumpEval(BigInt(top - i), b); // hereditary bump of the exponent
    total += BigInt(d) * B1 ** e;
  }
  return total;
}

function goodsteinNext(n, b) { return bumpEval(n, b) - 1n; }

// The sequence from `seed` (base starts at 2). Returns BigInt values,
// terminated flag true iff 0 was reached within maxSteps.
function goodsteinSeq(seed, maxSteps = 40) {
  let v = BigInt(seed), b = 2;
  const values = [v];
  let terminated = v === 0n;
  for (let i = 0; i < maxSteps && !terminated; i++) {
    v = goodsteinNext(v, b);
    b++;
    values.push(v);
    if (v === 0n) terminated = true;
  }
  return { values, terminated };
}

// Replace the base by ω: the ordinal of n's hereditary base-b form,
// in core Cantor-normal-form representation. Strictly decreases along
// any Goodstein sequence.
function goodsteinOrd(n, b) {
  const B = BigInt(b);
  if (n < B) return Number(n);
  const ds = digitsInBase(n, b);
  const top = ds.length - 1;
  const terms = [];
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    if (!d) continue;
    terms.push([goodsteinOrd(BigInt(top - i), b), d]);
  }
  if (terms.length === 1 && ordIsFinite(terms[0][0]) && terms[0][0] === 0) return terms[0][1];
  return { terms };
}

// Pretty hereditary base-b notation, e.g. 2·3^3 + 2·3 + 2  or  2^(2^2).
function hereditaryStr(n, b) {
  const B = BigInt(b);
  if (n < B) return n.toString();
  const ds = digitsInBase(n, b);
  const top = ds.length - 1;
  const parts = [];
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    if (!d) continue;
    const k = top - i;
    if (k === 0) { parts.push(String(d)); continue; }
    let pow;
    if (k === 1) pow = String(b);
    else {
      const es = hereditaryStr(BigInt(k), b);
      pow = `${b}^${/^\d+$/.test(es) ? es : `(${es})`}`;
    }
    parts.push(d === 1 ? pow : `${d}·${pow}`);
  }
  return parts.join(' + ');
}

// Schematic altitude of an ordinal on a 0..1 ruler whose right edge is ε₀.
// Display aid only — the Cantor normal form is the true meter.
function ordAltitude(o) {
  const towerH = (x) => {
    if (ordIsFinite(x)) return x === 0 ? 0 : x / (x + 6);
    const [e, c] = x.terms[0];
    return 1 + towerH(e) + 0.12 * Math.min(1, (c - 1) / 4)
      + 0.05 * Math.min(1, (x.terms.length - 1) / 4);
  };
  return clamp(1 - Math.pow(0.55, towerH(o)), 0, 0.995);
}

/* ==================== the exhibit ==================== */

const PROSE = `
    <p>In 1979 Douglas Hofstadter opened <em>Gödel, Escher, Bach</em> with a puzzle small
    enough to fit on an index card. You are given one string, <code>MI</code>, and four
    rules: you may append <code>U</code> to any string ending in <code>I</code>; you may
    double everything after the <code>M</code>; you may replace any <code>III</code> with
    <code>U</code>; you may delete any <code>UU</code>. The challenge: produce
    <code>MU</code>. It feels like a lock that must open — the rules are so permissive, the
    target so short. Play the first act below before reading on; the machine will happily
    deal you every legal move.</p>
    <p>You will not produce it, and the reason is worth more than the puzzle. Count the
    <code>I</code>s. You begin with one; doubling turns <em>n</em> into 2<em>n</em>, and the
    only rule that destroys <code>I</code>s removes three at a time. Neither operation can
    ever make the count a multiple of 3 — and <code>MU</code> has zero <code>I</code>s, which
    is a multiple of 3. Notice what just happened. That little argument is not a derivation
    <em>in</em> the system: no sequence of the four rules states it, checks it, or could even
    express it. You stepped outside, reasoned <em>about</em> the machine, and settled a
    question the machine can never settle about itself. Now read <code>M</code>,
    <code>I</code>, <code>U</code> as the digits 3, 1, 0, and every string becomes a number —
    <code>MU</code> is 30, <code>MIU</code> is 310 — so that <em>derivable</em> becomes a
    property of numbers, as concrete as <em>even</em>. This is arithmetization, the first
    move of Gödel's 1931 construction: any theory that can talk about numbers can, through
    such a coding, talk about its own proofs.</p>
    <p>The second move is self-reference, and it is a technique, not a paradox. A program
    prints itself by carrying a blueprint and a copier: <em>print this text, then print it
    again in quotes</em>. The second act runs a working quine, then performs the same trick
    on sentences — the diagonal lemma: for <em>any</em> property <code>P(x)</code> there is a
    sentence <code>G</code>, built by pure mechanical substitution, that is provably
    equivalent to <code>P(⌜G⌝)</code> — "<code>P</code> holds of my own code." Choose for
    <code>P</code> the property <em>is not provable</em>, and you have constructed Gödel's
    sentence before your eyes. The theorem it yields is exact: every consistent, effectively
    axiomatizable theory extending Robinson arithmetic <code>Q</code> is incomplete (Gödel
    1931, sharpened by Rosser 1936). And by the second incompleteness theorem, no such theory
    satisfying the derivability conditions — Peano arithmetic, ZFC — can prove its own
    consistency.</p>
    <p>A fair objection: <code>G</code> is a lawyer's sentence, engineered for the loophole.
    Does incompleteness ever touch mathematics anyone would do on purpose? It does, and the
    third act lets you fight one instance barehanded. The hydra is a tree; you chop a head,
    and on turn <em>n</em> the beast sprouts <em>n</em> copies of the maimed branch one level
    closer to the root. Growth outruns cutting — visibly, absurdly — yet Hercules cannot
    lose: <em>every</em> strategy kills <em>every</em> hydra (Kirby–Paris, 1982). The proof
    hangs an ordinal below ε₀ on the beast and watches it strictly fall with every chop; and
    — same paper — Peano arithmetic cannot prove the theorem, because the induction it needs
    climbs exactly to ε₀, the ceiling of PA's strength that Gentzen had identified in 1936.
    Goodstein's theorem of 1944, the hydra's arithmetic twin, shares the fate: every
    Goodstein sequence reaches zero, PA cannot prove it, and the sequence seeded at 4 — whose
    first values amble along as 4, 26, 41, 60, 83 — takes 3·2<sup>402653211</sup> − 2 steps
    to get there, a step-count with about 121 million digits. The unprovable is not exotic.
    It grows in the garden.</p>
    <p>There is a coda to the walls, and it points at the next room. Löb's theorem (1955)
    says a theory cannot even trust hypothetical proofs of itself: if PA proves
    "<em>if φ is provable, then φ</em>," then PA already proves φ outright. So we climb: PA,
    then PA + Con(PA), then PA + Con(PA + Con(PA)) — an endless tower in which each theory
    certifies the floor below and never its own. Proof theory turns the climb into a ruler
    that measures theories by the ordinals their induction can reach — ω<sup>ω</sup> for
    primitive recursive arithmetic, ε₀ for PA. Next door, that ruler is laid against
    computation itself.</p>`;

export default {
  id: 'loop',
  movement: 3,
  title: 'The Strange Loop',
  hook: 'A sentence builds itself out of its own blueprint and says: you cannot prove me.',
  prose: PROSE,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const MONO = 'ui-monospace, Menlo, monospace';
    const now = () => performance.now() / 1000;

    const bus = audio.createBus('loop');

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-loop .acts { display:flex; gap:.5rem; flex-wrap:wrap; margin:.4rem 0 .9rem; }
      #ex-loop .miu-cur { font:600 1.5rem ${MONO}; letter-spacing:.14em; color:${P.goldBright};
        text-align:center; margin:.5rem 0 .15rem; word-break:break-all; }
      #ex-loop .miu-godel { font:.8rem ${MONO}; color:${P.inkDim}; text-align:center;
        margin-bottom:.4rem; word-break:break-all; }
      #ex-loop .chips { display:flex; flex-wrap:wrap; gap:.4rem; justify-content:center;
        margin:.5rem 0; min-height:2.2rem; }
      #ex-loop .chips .btn { font-family:${MONO}; }
      #ex-loop .hist { font:.78rem ${MONO}; color:${P.inkFaint}; max-height:4.6em;
        overflow-y:auto; margin:.4rem 0; line-height:1.7; word-break:break-all; }
      #ex-loop .reveal { display:none; border-left:2px solid ${P.gold}; background:${P.panel};
        padding:.7rem .9rem; margin:.8rem 0; border-radius:0 8px 8px 0; font-size:.92rem;
        color:${P.ink}; }
      #ex-loop .reveal.shown { display:block; animation: exloop-fadeup .6s both; }
      #ex-loop .boxes { display:flex; flex-wrap:wrap; gap:.9rem; align-items:flex-start; }
      #ex-loop .box { flex:1 1 320px; background:${P.panel}; border:1px solid ${P.line};
        border-radius:8px; padding:.8rem .9rem; min-width:0; }
      #ex-loop .box .bx-title { font:.72rem ${MONO}; letter-spacing:.16em;
        text-transform:uppercase; color:${P.inkFaint}; margin-bottom:.5rem; }
      #ex-loop .box pre { font:.78rem/1.5 ${MONO}; color:${P.ink}; background:${P.bg};
        border:1px solid ${P.line}; border-radius:6px; padding:.5rem .6rem;
        overflow-x:auto; margin:.4rem 0; white-space:pre-wrap; word-break:break-all; }
      #ex-loop .fp-line { font:.8rem/1.6 ${MONO}; margin:.45rem 0; word-break:break-all;
        animation: exloop-fadeup .55s both; }
      #ex-loop .fp-line .fp-tag { color:${P.inkFaint}; font-size:.72rem; display:block; }
      #ex-loop .gs-table { font:.76rem/1.6 ${MONO}; max-height:280px; overflow:auto;
        border:1px solid ${P.line}; border-radius:6px; margin:.5rem 0; background:${P.bg}; }
      #ex-loop .gs-row { display:grid; grid-template-columns:2.6rem 2.8rem 1fr 1fr minmax(6rem,.6fr);
        gap:.7rem; padding:.18rem .55rem; border-bottom:1px solid ${P.line}22; }
      #ex-loop .gs-row.gs-head { position:sticky; top:0; background:${P.panel};
        color:${P.inkFaint}; border-bottom:1px solid ${P.line}; }
      #ex-loop .gs-note { font-size:.86rem; color:${P.inkDim}; font-style:italic; margin:.4rem 0; }
      #ex-loop .stretch { border-top:1px solid ${P.line}; margin-top:1.6rem; padding-top:.9rem; }
      #ex-loop .stretch .st-title { font:.72rem ${MONO}; letter-spacing:.2em;
        text-transform:uppercase; color:${P.goldDim}; margin-bottom:.6rem; }
      #ex-loop .stretch p { font-size:.94rem; color:${P.inkDim}; margin:.55rem 0; }
      #ex-loop .stretch p code { font-family:${MONO}; color:${P.azure}; }
      @keyframes exloop-fadeup { from { opacity:0; transform:translateY(5px); }
        to { opacity:1; transform:none; } }
    `;
    stage.appendChild(style);

    /* ---------- act tabs ---------- */
    const tabsRow = document.createElement('div');
    tabsRow.className = 'acts';
    stage.appendChild(tabsRow);
    const actWraps = {};
    const tabBtns = {};
    let act = 1;
    for (const [n, label] of [[1, 'I · the MU game'], [2, 'II · the mirror'], [3, 'III · the hydra']]) {
      tabBtns[n] = ui.button(tabsRow, label, () => showAct(n), { small: true });
    }
    for (const n of [1, 2, 3]) {
      const d = document.createElement('div');
      d.style.display = 'none';
      stage.appendChild(d);
      actWraps[n] = d;
    }
    function showAct(n) {
      act = n;
      for (const k of [1, 2, 3]) {
        actWraps[k].style.display = k === n ? '' : 'none';
        tabBtns[k].classList.toggle('active', k === n);
        tabBtns[k].classList.toggle('primary', k === n);
      }
      animUntil = now() + 1.2;
    }

    // shared redraw window: canvases repaint only while something moves
    let animUntil = 0;
    const poke = (dur = 1.0) => { animUntil = now() + dur; };

    /* ================== ACT I — the MU game ================== */
    const a1 = actWraps[1];
    const quest = ui.questBanner(a1, 'Derive <code>MU</code>. The axiom is <code>MI</code>; the four rules deal themselves below.');

    let cur = 'MI';
    let hist = ['MI'];
    let moveCount = 0;
    let revealed = false;
    let bfs = null;          // makeBFS instance while enumerating
    let bfsSched = null;     // ticking sound scheduler
    let pulse = { t0: -9, from: 1, to: 1 };
    const BFS_LEN = 22;   // ≈ 38,000 distinct theorems — enumerable in seconds

    const curLine = document.createElement('div');
    curLine.className = 'miu-cur';
    a1.appendChild(curLine);
    const godelLine = document.createElement('div');
    godelLine.className = 'miu-godel';
    a1.appendChild(godelLine);

    const chips = document.createElement('div');
    chips.className = 'chips';
    a1.appendChild(chips);

    const a1ctl = ui.controlRow(a1);
    ui.button(a1ctl, '↶ undo', () => {
      if (hist.length < 2) return;
      hist.pop();
      cur = hist[hist.length - 1];
      pulse = { t0: now(), from: iCount(cur) % 3, to: iCount(cur) % 3 };
      refreshMIU(); poke();
    }, { small: true });
    ui.button(a1ctl, '⟲ back to MI', () => {
      cur = 'MI'; hist = ['MI'];
      pulse = { t0: now(), from: 1, to: 1 };
      refreshMIU(); poke();
    }, { small: true });
    const bfsBtn = ui.button(a1ctl, '⚙ enumerate every theorem', toggleBFS);
    const bfsOut = ui.readout(a1, 'the machine can also play by itself — exhaustively.');

    const histLine = document.createElement('div');
    histLine.className = 'hist';
    a1.appendChild(histLine);

    const compass = cv.setupCanvas(a1, { height: 190 });
    compass.onResize(() => poke());

    const revealBox = document.createElement('div');
    revealBox.className = 'reveal';
    revealBox.innerHTML =
      `Watch the compass: rule II doubles the <code>I</code>-count (1 ↔ 2 mod 3), rule III` +
      ` subtracts three (no move at all, mod 3), rules I and IV leave it alone. The count` +
      ` starts at 1 and can never reach a multiple of 3 — and <code>MU</code> needs zero.` +
      ` You have just proved a theorem <em>about</em> the system that no derivation` +
      ` <em>inside</em> it could ever be: the rules rewrite strings; they do not talk about` +
      ` strings. That gap between playing and knowing is the whole subject of this exhibit.`;
    a1.appendChild(revealBox);

    ui.caption(a1,
      'Rules — I: x<code>I</code> → x<code>IU</code> · II: <code>M</code>x → <code>M</code>xx · ' +
      'III: x<code>III</code>y → x<code>U</code>y · IV: x<code>UU</code>y → xy. ' +
      'The enumeration is honest but finite (strings kept ≤ ' + BFS_LEN + ' letters); ' +
      'the search proves nothing by itself — the mod-3 compass is the proof.');

    const shortStr = (s) => s.length <= 26 ? s : s.slice(0, 12) + '…' + s.slice(-12);
    const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
    const RULE_PITCH = { 1: 830, 2: 620, 3: 990, 4: 520 };

    function refreshMIU() {
      curLine.textContent = cur;
      godelLine.textContent = `as a number: ${godelNumber(cur)}  ·  I-count ${iCount(cur)} ≡ ${iCount(cur) % 3} (mod 3)`;
      chips.replaceChildren();
      const moves = miuMoves(cur, 40);
      for (const m of moves.slice(0, 14)) {
        ui.button(chips, `${ROMAN[m.rule]} → ${shortStr(m.to)}`, () => applyMove(m), { small: true });
      }
      if (moves.length > 14) {
        const more = document.createElement('span');
        more.className = 'miu-godel';
        more.textContent = `(+ ${moves.length - 14} more moves not shown)`;
        chips.appendChild(more);
      }
      if (moves.length === 0) {
        const dead = document.createElement('span');
        dead.className = 'miu-godel';
        dead.textContent = 'no legal moves under this exhibit’s 40-letter cap — undo, or start over';
        chips.appendChild(dead);
      }
      histLine.innerHTML = hist.map((s) =>
        `${s}<span style="color:${P.azureDim}">(${iCount(s) % 3})</span>`).join(' → ');
      histLine.scrollTop = histLine.scrollHeight;
    }

    function applyMove(m) {
      audio.ensureAudio();
      const from = iCount(cur) % 3;
      cur = m.to;
      hist.push(cur);
      moveCount++;
      pulse = { t0: now(), from, to: iCount(cur) % 3 };
      audio.drums.wood(bus, bus.context.currentTime, { level: 0.4, pitch: RULE_PITCH[m.rule] });
      refreshMIU();
      poke();
      if (moveCount >= 10) reveal();
    }

    function reveal() {
      if (revealed) return;
      revealed = true;
      revealBox.classList.add('shown');
      quest.done('You cannot derive <code>MU</code> — and now you can <em>prove</em> that, from outside the rules.');
      poke(2);
    }

    function toggleBFS() {
      audio.ensureAudio();
      if (bfs && !bfs.done) { stopBFS(); bfsOut.set(`paused at ${formatBig(bfs.count)} theorems — MU not among them.`); return; }
      bfs = makeBFS(BFS_LEN);
      bfsBtn.classList.add('active');
      bfsBtn.textContent = '⏸ enumerating…';
      startBfsSound();
      poke();
    }
    function startBfsSound() {
      if (bfsSched) bfsSched.stop();
      bfsSched = audio.createScheduler((t) => {
        if (!bfs || bfs.done) return null;
        audio.drums.hat(bus, t, { level: 0.1 });
        return t + 0.09;
      });
      bfsSched.start();
    }
    function stopBFS() {
      if (bfsSched) { bfsSched.stop(); bfsSched = null; }
      if (bfs) bfs.done = true;
      bfsBtn.classList.remove('active');
      bfsBtn.textContent = '⚙ enumerate every theorem';
    }
    function pumpBFS() {
      if (!bfs || bfs.done) return;
      bfs.step(350);
      if (bfs.done) {
        const n = bfs.count;
        stopBFS();
        bfsOut.set(`done: every theorem reachable without growing past ${BFS_LEN} letters — ` +
          `${formatBig(n)} strings. MU is not among them.`);
        audio.drums.thock(bus, bus.context.currentTime, { level: 0.5 });
        reveal();
      } else {
        bfsOut.set(`theorem ${formatBig(bfs.count)} reached · latest ${shortStr(bfs.latest())} · MU not among them`);
      }
    }

    function drawCompass(t) {
      const { ctx, width: W, height: H } = compass;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2 + 8, R = Math.min(H * 0.30, W * 0.16);
      const pos = {
        0: [cx, cy - R * 1.25],
        1: [cx - R * 1.9, cy + R * 0.8],
        2: [cx + R * 1.9, cy + R * 0.8],
      };
      ctx.font = '11px ' + MONO;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      // rule II swap arrows between 1 and 2
      ctx.strokeStyle = P.azureDim; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pos[1][0] + 16, pos[1][1] - 8);
      ctx.quadraticCurveTo(cx, cy - R * 0.1, pos[2][0] - 16, pos[2][1] - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pos[2][0] - 16, pos[2][1] + 10);
      ctx.quadraticCurveTo(cx, cy + R * 1.5, pos[1][0] + 16, pos[1][1] + 10); ctx.stroke();
      ctx.fillStyle = P.azure;
      ctx.fillText('rule II: ×2 swaps 1 ↔ 2', cx, cy + R * 0.28);
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('rules I, IV: count unchanged · rule III: −3 ≡ 0', cx, cy + R * 1.65);

      // residue nodes
      for (const r of [1, 2]) {
        const [x, y] = pos[r];
        const active = iCount(cur) % 3 === r;
        const pt = clamp((now() - pulse.t0) / 0.35, 0, 1);
        const rad = active ? 13 + (1 - pt) * 5 : 11;
        ctx.fillStyle = active ? P.goldBright : P.panel;
        ctx.strokeStyle = active ? P.gold : P.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = active ? P.bg : P.inkDim;
        ctx.fillText(String(r), x, y);
      }
      // the unreachable island: residue 0, where MU lives
      const [x0, y0] = pos[0];
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = P.crimson; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x0, y0, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.crimson;
      ctx.fillText('0', x0, y0);
      ctx.fillText('MU lives here — no rule ever lands', x0, y0 - 28);
      ctx.fillStyle = P.inkFaint;
      ctx.textAlign = 'left';
      ctx.fillText('I-count mod 3', 8, 14);
    }

    /* ================== ACT II — the mirror ================== */
    const a2 = actWraps[2];
    const boxes = document.createElement('div');
    boxes.className = 'boxes';
    a2.appendChild(boxes);

    // -- box A: the quine --
    const boxA = document.createElement('div');
    boxA.className = 'box';
    boxes.appendChild(boxA);
    boxA.innerHTML = `<div class="bx-title">a program that prints itself</div>`;
    const quinePre = document.createElement('pre');
    quinePre.textContent = QUINE;
    boxA.appendChild(quinePre);
    const qCtl = ui.controlRow(boxA);
    const qOut = document.createElement('pre');
    qOut.style.display = 'none';
    const qVerdict = ui.readout(boxA, 'blueprint (the string s) + copier (JSON.stringify) = self.');
    boxA.appendChild(qOut);
    ui.button(qCtl, '▶ run it', () => {
      audio.ensureAudio();
      audio.drums.wood(bus, bus.context.currentTime, { level: 0.35, pitch: 700 });
      const out = runQuine(QUINE);
      if (out === null) {
        qVerdict.set('this embedding forbids running strings as code — the text above still speaks for itself.');
        return;
      }
      qOut.textContent = out;
      qOut.style.display = '';
      qVerdict.set(out === QUINE
        ? '✓ output = source, character for character. The program contains its own blueprint.'
        : '✗ mismatch — which would be a bug, not a theorem.');
    }, { small: true });

    // -- box B: the fixed-point factory --
    const boxB = document.createElement('div');
    boxB.className = 'box';
    boxes.appendChild(boxB);
    boxB.innerHTML = `<div class="bx-title">the fixed-point factory (diagonal lemma)</div>`;
    const FP_PROPS = {
      Even: { desc: 'has an even number of symbols', test: (g) => Array.from(g).length % 2 === 0 },
      Long: { desc: 'has more than 100 symbols', test: (g) => Array.from(g).length > 100 },
      Unprovable: { desc: 'is not provable', test: null },
    };
    const fpCtl = ui.controlRow(boxB);
    const fpSel = ui.select(fpCtl, {
      label: 'a property P of sentences',
      options: [
        { value: 'Even', label: '“…has an even number of symbols”' },
        { value: 'Long', label: '“…has more than 100 symbols”' },
        { value: 'Unprovable', label: '“…is not provable”' },
      ],
      value: 'Even',
    });
    const fpOut = document.createElement('div');
    boxB.appendChild(fpOut);
    ui.button(fpCtl, 'construct the sentence that says P of itself', () => {
      audio.ensureAudio();
      buildFP(fpSel.value);
    }, { small: true });

    function fpLine(i, tag, body, color) {
      const d = document.createElement('div');
      d.className = 'fp-line';
      d.style.animationDelay = (i * 0.45) + 's';
      d.innerHTML = `<span class="fp-tag">${tag}</span><span style="color:${color}">${body}</span>`;
      fpOut.appendChild(d);
    }
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    function buildFP(pname) {
      const t0 = bus.context.currentTime;
      for (let i = 0; i < 5; i++) {
        audio.playTone(bus, { freq: 420 * Math.pow(2, i / 12 * 2), dur: 0.18, level: 0.22, when: t0 + i * 0.45 });
      }
      fpOut.replaceChildren();
      const { T, G } = buildFixedPoint(pname);
      const prop = FP_PROPS[pname];
      fpLine(0, 'the template T — P applied to a self-substitution, with a blank □:', esc(T), P.ink);
      fpLine(1, 'quote it:', esc(quote(T)), P.inkDim);
      fpLine(2, 'fill T’s blank with T’s own quotation — this is G:', esc(G), P.goldBright);
      fpLine(3, 'now evaluate the diag(…) inside G. diag substitutes a quoted string into itself:',
        `diag(${esc(quote(T))}) = ${esc(evalDiag(G))}`, P.azure);
      const fixed = evalDiag(G) === quote(G);
      fpLine(4, 'so G speaks of exactly one sentence — itself:',
        fixed ? `G ↔ ${pname}(⌜G⌝) — “I ${prop.desc}.”` : 'construction error', P.verdant);
      if (prop.test) {
        const n = Array.from(G).length;
        const truth = prop.test(G);
        fpLine(5, 'and is it true? just count:',
          `G has ${n} symbols — G is ${truth ? 'true' : 'false'}, and perfectly harmless. ` +
          `A fixed point need not be true; it need only refer.`, P.inkDim);
      } else {
        fpLine(5, 'and is it true? here counting stops helping:',
          'If the theory is consistent, G is unprovable — a proof of G would be checkable, ' +
          'so the theory would also prove “G is provable,” contradicting G itself. Ruling out a ' +
          '<em>refutation</em> of G took ω-consistency (Gödel 1931) or a cleverer predicate ' +
          '(Rosser 1936). Seen from outside: unprovable, and therefore — being exactly the claim ' +
          'of its own unprovability — true.', P.inkDim);
      }
    }

    ui.caption(a2,
      'The corner quotes ⌜…⌝ are a toy Gödel numbering. In arithmetic, quotation is a number ' +
      'and <code>diag</code> is a primitive recursive function; the substitution this widget ' +
      'performs is, symbol for symbol, the diagonal lemma: for any formula P(x) there is a ' +
      'sentence G with T ⊢ G ↔ P(⌜G⌝).');

    /* ================== ACT III — the hydra ================== */
    const a3 = actWraps[3];
    const hydraQuest = ui.questBanner(a3,
      'Slay the hydra: click its glowing heads. On turn <em>n</em> a deep chop regrows <em>n</em> copies of the maimed branch.');

    const subRow = document.createElement('div');
    subRow.className = 'acts';
    a3.appendChild(subRow);
    const hydraTabBtn = ui.button(subRow, 'the hydra', () => showSub('hydra'), { small: true });
    const gsTabBtn = ui.button(subRow, 'Goodstein sequences', () => showSub('goodstein'), { small: true });
    const hydraWrap = document.createElement('div');
    const gsWrap = document.createElement('div');
    a3.appendChild(hydraWrap); a3.appendChild(gsWrap);
    let sub = 'hydra';
    function showSub(s) {
      sub = s;
      hydraWrap.style.display = s === 'hydra' ? '' : 'none';
      gsWrap.style.display = s === 'goodstein' ? '' : 'none';
      hydraTabBtn.classList.toggle('active', s === 'hydra');
      gsTabBtn.classList.toggle('active', s === 'goodstein');
      poke();
    }

    /* ---- hydra state ---- */
    const NODE_CAP = 2500;
    let tree, turn, hOrd, hPrevOrd, flashes, capped;
    function markAll(node, b) { node.b = b; node.kids.forEach((k) => markAll(k, b)); }
    function resetHydra() {
      tree = defaultHydra();
      markAll(tree, 0);
      turn = 1; hOrd = hydraOrd(tree); hPrevOrd = null;
      flashes = []; capped = false; autoplay = false; autoAcc = 0;
      autoBtn.classList.remove('active');
      hydraQuest.set('Slay the hydra: click its glowing heads. On turn <em>n</em> a deep chop regrows <em>n</em> copies of the maimed branch.');
      layoutHydra(); updateHydraMeter(); poke();
    }

    // layout: leaves get consecutive slots, parents sit at the mean; depth = y
    let hSlots = 1, hDepth = 1, drawList = [];
    function layoutHydra() {
      let slot = 0; hDepth = 1; drawList = [];
      (function walk(node, depth, path) {
        node.d = depth;
        hDepth = Math.max(hDepth, depth);
        if (node.kids.length === 0) {
          node.lx = slot++;
        } else {
          node.kids.forEach((k, i) => walk(k, depth + 1, [...path, i]));
          node.lx = node.kids.reduce((a, k) => a + k.lx, 0) / node.kids.length;
        }
        drawList.push({ node, path, leaf: node.kids.length === 0 && depth > 0 });
      })(tree, 0, []);
      hSlots = Math.max(slot, 1);
    }

    const hydraCanvas = cv.setupCanvas(hydraWrap, { height: 400 });
    hydraCanvas.canvas.style.touchAction = 'manipulation';
    hydraCanvas.onResize(() => poke());
    const headSprite = cv.glowSprite(P.gold, 28);
    const jointSprite = cv.glowSprite(P.azureDim, 18);

    const hCtl = ui.controlRow(hydraWrap);
    const autoBtn = ui.button(hCtl, '⚔ let Hercules play (leftmost head)', () => {
      audio.ensureAudio();
      autoplay = !autoplay;
      autoBtn.classList.toggle('active', autoplay);
      poke();
    });
    ui.button(hCtl, '⟲ a fresh hydra', () => resetHydra(), { small: true });
    const ordLine = ui.mathline(hydraWrap, '');
    const hydReadout = ui.readout(hydraWrap, '');
    ui.caption(hydraWrap,
      'The rule (Kirby–Paris 1982): a head is a leaf. Chop it; if it grew from deeper than the ' +
      'root, the grandparent sprouts <em>n</em> copies of the branch it left behind on turn ' +
      '<em>n</em>. Heads on the root just die. The meter: each node’s ordinal is the sum of ' +
      'ω<sup>(child’s ordinal)</sup>; a bare head counts ω⁰ = 1. Every chop strictly lowers α — ' +
      'so Hercules always wins. PA cannot prove that: the descent climbs down through ε₀, past ' +
      'the reach of induction on ℕ. The altitude bar is schematic — ε₀ has no drawing to scale.');

    let autoplay = false, autoAcc = 0;

    function hydraPixel(node, W, H) {
      const padL = 26, padR = 26, top = 56;
      const x = padL + (hSlots === 1 ? (W - padL - padR) / 2 : (node.lx / (hSlots - 1)) * (W - padL - padR));
      const levelH = Math.min(78, (H - top - 60) / Math.max(hDepth, 1));
      const y = (H - 46) - node.d * levelH;
      return [x, y];
    }

    function updateHydraMeter() {
      const alive = tree.kids.length > 0;
      ordLine.innerHTML = alive
        ? `α = <span style="color:${P.goldBright}">${ordToString(hOrd)}</span>` +
          (hPrevOrd != null ? ` <span style="color:${P.inkFaint}">(was ${ordToString(hPrevOrd)} — strictly larger)</span>` : '')
        : `α = 0 <span style="color:${P.inkFaint}">— the descent is complete</span>`;
      hydReadout.set(alive
        ? `turn ${turn} · heads ${hydraLeafPaths(tree).length} · nodes ${hydraSize(tree)}` +
          ` · a deep chop now regrows ${turn} ${turn === 1 ? 'copy' : 'copies'}` +
          (capped ? ` · past ${NODE_CAP} nodes this finite canvas allows only root-level chops — the theorem is unbothered; restart for the full rule` : '')
        : `slain on turn ${turn - 1} — as it had to be`);
    }

    function doChop(path) {
      if (tree.kids.length === 0) return;
      if (capped && path.length >= 2) return; // regrowth blocked past the cap
      audio.ensureAudio();
      const t = now();
      // flash where the head was
      let n = tree; for (const i of path) n = n.kids[i];
      const [fx, fy] = hydraPixel(n, hydraCanvas.width, hydraCanvas.height);
      flashes.push({ x: fx, y: fy, t0: t });
      if (flashes.length > 24) flashes.shift();

      const res = hydraChop(tree, path, turn);
      tree = res.tree;
      if (res.regrown) {
        let gp = tree; for (const i of res.regrown.path) gp = gp.kids[i];
        for (let i = res.regrown.from; i < res.regrown.from + res.regrown.count; i++) markAll(gp.kids[i], t);
      }
      hPrevOrd = hOrd;
      hOrd = hydraOrd(tree);
      turn++;
      capped = hydraSize(tree) > NODE_CAP;
      layoutHydra();
      updateHydraMeter();
      poke(1.2);

      const when = bus.context.currentTime;
      audio.drums.thock(bus, when, { level: 0.5 });
      audio.playTone(bus, { freq: 170 + 640 * ordAltitude(hOrd), dur: 0.3, level: 0.3, when });
      if (res.regrown) audio.drums.rim(bus, when + 0.1, { level: 0.28 });
      if (tree.kids.length === 0) {
        [523.25, 659.25, 784, 1046.5].forEach((f, i) =>
          audio.playTone(bus, { freq: f, dur: 0.5, level: 0.3, when: when + 0.15 + i * 0.13 }));
        hydraQuest.done('The hydra is dead — as it always must be. The ordinal had nowhere left to fall.');
        autoplay = false;
        autoBtn.classList.remove('active');
      }
    }

    hydraCanvas.canvas.addEventListener('pointerdown', (e) => {
      if (act !== 3 || sub !== 'hydra') return;
      const [px, py] = cv.pointerPos(hydraCanvas, e);
      let best = null, bestD = 20;
      for (const d of drawList) {
        if (!d.leaf) continue;
        const [x, y] = hydraPixel(d.node, hydraCanvas.width, hydraCanvas.height);
        const dist = Math.hypot(px - x, py - y);
        if (dist < bestD) { bestD = dist; best = d.path; }
      }
      if (best) doChop(best);
    });

    function drawHydra(t) {
      const { ctx, width: W, height: H } = hydraCanvas;
      ctx.clearRect(0, 0, W, H);

      // altitude bar toward ε₀
      const bx = 40, bw = W - 60, by = 16;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.stroke();
      ctx.font = '10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = P.inkFaint;
      for (const [fr, lab] of [[0, '0'], [0.45, 'ω'], [0.7, 'ω^ω'], [0.834, 'ω^ω^ω'], [1, 'ε₀']]) {
        ctx.fillRect(bx + fr * bw - 0.5, by - 3, 1, 6);
        ctx.fillText(lab, bx + fr * bw, by + 6);
      }
      const mfr = ordAltitude(hOrd);
      ctx.fillStyle = P.goldBright;
      ctx.beginPath(); ctx.arc(bx + mfr * bw, by, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.inkFaint; ctx.textAlign = 'left';
      ctx.fillText('α', bx - 14, by - 5);

      // ground
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(20, H - 40); ctx.lineTo(W - 20, H - 40); ctx.stroke();

      // edges then nodes (drawList is post-order: children first)
      for (const d of drawList) {
        const node = d.node;
        if (node === tree) continue;
        let parent = tree;
        for (let i = 0; i < d.path.length - 1; i++) parent = parent.kids[d.path[i]];
        const [x1, y1] = hydraPixel(parent, W, H);
        const [x2, y2] = hydraPixel(node, W, H);
        const alpha = clamp((t - (node.b || 0)) / 0.5, 0.12, 1);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = d.leaf ? P.goldDim : P.azureDim;
        ctx.lineWidth = d.leaf ? 1.3 : 1.8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo((x1 + x2) / 2 + (x2 - x1) * 0.12, (y1 + y2) / 2 + 8, x2, y2);
        ctx.stroke();
      }
      for (const d of drawList) {
        const node = d.node;
        const [x, y] = hydraPixel(node, W, H);
        const alpha = node === tree ? 1 : clamp((t - (node.b || 0)) / 0.5, 0.12, 1);
        ctx.globalAlpha = alpha;
        if (node === tree) {
          ctx.fillStyle = P.ink;
          ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = P.inkFaint; ctx.font = '10px ' + MONO;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('root', x, y + 10);
        } else if (d.leaf) {
          headSprite.draw(ctx, x, y, 1);
        } else {
          jointSprite.draw(ctx, x, y, 0.8);
        }
      }
      ctx.globalAlpha = 1;

      // chop flashes
      for (const f of flashes) {
        const ft = (t - f.t0) / 0.45;
        if (ft < 0 || ft > 1) continue;
        ctx.strokeStyle = P.crimson;
        ctx.globalAlpha = 1 - ft;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 + ft * 22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (tree.kids.length === 0) {
        ctx.fillStyle = P.verdant;
        ctx.font = '13px ' + MONO;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('α = 0 · the hydra is dead · every strategy wins — PA just can’t say so', W / 2, H / 2);
      }
    }

    /* ---- Goodstein subview ---- */
    const GS_MAX_ROWS = 30;
    let gsSeed = 3, gsVal = 3n, gsBase = 2, gsStepN = 0, gsDone = false, gsRun = false, gsAcc = 0;

    const gsCtl = ui.controlRow(gsWrap);
    ui.stepper(gsCtl, {
      label: 'seed', min: 2, max: 12, value: 3,
      onChange: (v) => { gsSeed = v; gsReset(); },
    });
    ui.button(gsCtl, 'step', () => { audio.ensureAudio(); gsStep(); }, { small: true });
    const gsRunBtn = ui.button(gsCtl, '▶ run', () => {
      audio.ensureAudio();
      gsRun = !gsRun;
      gsRunBtn.classList.toggle('active', gsRun);
      gsRunBtn.textContent = gsRun ? '⏸ pause' : '▶ run';
    });
    ui.button(gsCtl, '⟲ reset', () => gsReset(), { small: true });

    ui.mathline(gsWrap,
      'write the value in hereditary base <em>b</em> · bump every <em>b</em> to <em>b</em>+1 · subtract 1');
    const gsTable = document.createElement('div');
    gsTable.className = 'gs-table';
    gsWrap.appendChild(gsTable);
    const gsNote = document.createElement('div');
    gsNote.className = 'gs-note';
    gsWrap.appendChild(gsNote);
    ui.caption(gsWrap,
      'Replace the base by ω and the hereditary form becomes an ordinal below ε₀ — the same ' +
      'meter as the hydra’s, and it strictly falls at every step even as the value soars. ' +
      'That descent is why every Goodstein sequence dies at 0, and induction up to ε₀ is why ' +
      'PA cannot follow the argument (Kirby–Paris 1982).');

    const fmtVal = (v) => {
      const s = v.toString();
      return s.length <= 21 ? formatBig(v) : `≈ ${s[0]}.${s.slice(1, 4)}·10^${s.length - 1}`;
    };
    function gsRow(cells, head = false, color = null) {
      const r = document.createElement('div');
      r.className = 'gs-row' + (head ? ' gs-head' : '');
      for (const c of cells) {
        const d = document.createElement('div');
        d.innerHTML = c;
        if (color) d.style.color = color;
        r.appendChild(d);
      }
      gsTable.appendChild(r);
      gsTable.scrollTop = gsTable.scrollHeight;
    }
    function gsSeedNote() {
      if (gsSeed === 3) return 'Seed 3 dies politely. Watch the ordinal column do the killing.';
      if (gsSeed === 4) return 'Seed 4 reaches 0 after exactly 3·2^402653211 − 2 steps — a step-count ' +
        'with about 121 million digits. We show the first ' + GS_MAX_ROWS + '; the ordinal shows why the end is certain.';
      return 'Sequence lengths grow with the Hardy hierarchy at ε₀ — faster than any function PA can prove total. ' +
        'Finite, every one of them; provably so only from beyond PA.';
    }
    function gsReset() {
      gsVal = BigInt(gsSeed); gsBase = 2; gsStepN = 0; gsDone = false;
      gsRun = false; gsAcc = 0;
      gsRunBtn.classList.remove('active');
      gsRunBtn.textContent = '▶ run';
      gsTable.replaceChildren();
      gsRow(['step', 'base', 'hereditary form', 'ordinal (base → ω)', 'value'], true);
      gsNote.textContent = gsSeedNote();
    }
    function gsStep() {
      if (gsDone || gsStepN > GS_MAX_ROWS) return;
      const ord = goodsteinOrd(gsVal, gsBase);
      gsRow([String(gsStepN), String(gsBase),
        `<span style="color:${P.gold}">${hereditaryStr(gsVal, gsBase)}</span>`,
        `<span style="color:${P.azure}">${ordToString(ord)}</span>`,
        fmtVal(gsVal)]);
      audio.playTone(bus, {
        freq: 200 + 700 * (1 - ordAltitude(ord)), dur: 0.16, level: 0.25,
        when: bus.context.currentTime,
      });
      if (gsVal === 0n) {
        gsDone = true; gsRun = false;
        gsRunBtn.classList.remove('active');
        gsRunBtn.textContent = '▶ run';
        gsNote.textContent = `reached 0 at step ${gsStepN} — Goodstein’s theorem, in the flesh.`;
        audio.playTone(bus, { freq: 1046.5, dur: 0.5, level: 0.3, when: bus.context.currentTime + 0.1 });
        return;
      }
      gsVal = goodsteinNext(gsVal, gsBase);
      gsBase++;
      gsStepN++;
      if (gsStepN >= GS_MAX_ROWS && !gsDone) {
        gsRun = false;
        gsRunBtn.classList.remove('active');
        gsRunBtn.textContent = '▶ run';
        gsNote.textContent = 'paused at ' + GS_MAX_ROWS + ' rows — ' + gsSeedNote();
      }
    }

    /* ================== exploratory stretch: the tower & the ruler ================== */
    const stretch = document.createElement('div');
    stretch.className = 'stretch';
    stage.appendChild(stretch);
    stretch.innerHTML = `
      <div class="st-title">coda · the tower and the ruler</div>
      <p>Löb’s theorem (1955) is the wall at its starkest: if PA proves
      <code>Prov(⌜φ⌝) → φ</code> — “any proof of φ would be right” — then PA already proves
      <code>φ</code>. A theory cannot even trust <em>hypothetical</em> proofs of itself; the
      second incompleteness theorem is the special case <code>φ = (0=1)</code>. So the
      consistency tower climbs forever: PA ⊂ PA + Con(PA) ⊂ PA + Con(PA + Con(PA)) ⊂ … —
      each floor certifies the one below and is blind to its own.</p>
      <p>Proof theory turns the tower into a ruler. Gentzen proved PA consistent in 1936 using
      induction up to ε₀ and nothing stronger — ε₀ is <em>exactly</em> PA’s proof-theoretic
      ordinal, the ceiling your hydra meter climbed. Weaker and stronger theories get their own
      marks: ω<sup>ω</sup> for primitive recursive arithmetic, Γ₀ for ATR₀ at the edge of
      predicativity (Feferman–Schütte). Strength is not a slogan; it is an ordinal.</p>`;
    const ruler = cv.setupCanvas(stretch, { height: 110 });
    function drawRuler() {
      const { ctx, width: W } = ruler;
      ctx.clearRect(0, 0, W, 110);
      const x0 = 24, x1 = W - 24, y = 62;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1 - 7, y - 4); ctx.lineTo(x1, y); ctx.lineTo(x1 - 7, y + 4); ctx.stroke();
      ctx.font = '11px ' + MONO; ctx.textAlign = 'center';
      const marks = [
        [0.04, '0', '', P.inkFaint],
        [0.16, 'ω', '', P.inkFaint],
        [0.34, 'ω^ω', 'PRA', P.ink],
        [0.58, 'ε₀', 'PA — the hydra’s ceiling', P.goldBright],
        [0.8, 'Γ₀', 'ATR₀ · edge of predicativity', P.azure],
      ];
      for (const [fr, lab, theory, col] of marks) {
        const x = x0 + fr * (x1 - x0);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
        ctx.fillStyle = col;
        ctx.fillText(lab, x, y + 22);
        if (theory) { ctx.fillStyle = P.inkDim; ctx.fillText(theory, x, y - 18); }
      }
      ctx.fillStyle = P.inkFaint; ctx.textAlign = 'right';
      ctx.fillText('…ZFC, far off every chart', x1, y + 40);
    }
    ruler.onResize(() => drawRuler());
    ui.caption(stretch,
      'Each theory measured by the ordinal its induction can reach. Next door, five states and ' +
      'two symbols turn this ruler on computation itself.');

    /* ================== main loop & lifecycle ================== */
    function draw(dt, t) {
      // background pumps that must run even without repaints
      if (act === 1 && bfs && !bfs.done) { pumpBFS(); poke(0.3); }
      if (act === 3 && sub === 'hydra' && autoplay && tree.kids.length > 0) {
        autoAcc += dt;
        if (autoAcc > 0.5) {
          autoAcc = 0;
          const heads = hydraLeafPaths(tree);
          // past the node cap only root-level chops (no regrowth) stay open
          const pick = capped ? heads.find((p) => p.length === 1) : heads[0];
          if (pick) doChop(pick);
          else { autoplay = false; autoBtn.classList.remove('active'); }
        }
      }
      if (act === 3 && sub === 'goodstein' && gsRun && !gsDone) {
        gsAcc += dt;
        if (gsAcc > 0.42) { gsAcc = 0; gsStep(); }
      }
      if (t > animUntil) return; // idle: skip repaints entirely
      if (act === 1) drawCompass(t);
      else if (act === 3 && sub === 'hydra') drawHydra(t);
    }
    const loop = cv.rafLoop(draw);

    refreshMIU();
    resetHydra();
    gsReset();
    showSub('hydra');
    showAct(1);
    drawRuler();
    loop.start();

    return {
      pause() {
        loop.stop();
        if (bfsSched) { bfsSched.stop(); bfsSched = null; }
        bus.mute();
      },
      resume() {
        bus.unmute();
        if (bfs && !bfs.done) startBfsSound();
        loop.start();
        poke();
      },
      destroy() {
        loop.stop();
        if (bfsSched) { bfsSched.stop(); bfsSched = null; }
        bus.dispose();
        compass.destroy(); hydraCanvas.destroy(); ruler.destroy();
        style.remove();
      },
    };
  },
};

/* ==================== tests (pure, node-runnable) ==================== */

export const _test = {
  // MIU
  iCount, miuMoves, makeBFS, miuBFS, godelNumber,
  // quine & diagonal lemma
  QUINE, runQuine, quote, diagOp, buildFixedPoint, evalDiag,
  // hydra
  hNode, hClone, hydraOrd, hydraLeafPaths, hydraSize, hydraChop, defaultHydra,
  // Goodstein
  bumpEval, goodsteinNext, goodsteinSeq, goodsteinOrd, hereditaryStr,
  // display helper
  ordAltitude,
};
