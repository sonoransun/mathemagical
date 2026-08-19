// III.3 — 47,176,870
// The busy beaver game: real interpreters running the proven champions,
// a halting-checker defeated by its own source, a five-state workbench,
// and the cliff walk out to where ZFC goes blind.
//
// DATA FIDELITY — every machine table and record below was transcribed at build
// time from primary sources, never reconstructed from memory:
//   BB(1)–BB(6), champion tables:  https://wiki.bbchallenge.org/wiki/BB(1) …BB(6)
//   BB(5) champion + 4098 ones:    https://wiki.bbchallenge.org/wiki/BB(5)
//   Antihydra table + pseudocode:  https://wiki.bbchallenge.org/wiki/Antihydra
//   BB(6) > 2↑↑↑5 (mxdys, 6/2025): https://wiki.bbchallenge.org/wiki/BB(6),
//                                  https://scottaaronson.blog/?p=8972
//   Erdős machine, 15 states:      Stérin–Woods 2021,
//                                  https://dna.hamilton.ie/2021-08-10-busy-beaver-15.html
//   ZFC at 745 states:             O'Rear, improved by Riebel 2023,
//                                  https://scottaaronson.blog/?p=7388

import { formatBig, digitsInBase, clamp } from '../../core/math.js';

/* ==================== Turing machine core (pure) ==================== */

const HALT = -1;

// Parse bbchallenge standard text format, e.g. "1RB1LC_1RC1RB_…".
// Each state row is two 3-char transitions (read-0, read-1): write, move, next.
// 'Z'/'H' halts; '---' (undefined) is treated as a halt when reached.
export function parseTM(code) {
  const rows = code.split('_');
  const n = rows.length;
  const write = new Int8Array(2 * n);
  const move = new Int8Array(2 * n);
  const next = new Int16Array(2 * n);
  for (let s = 0; s < n; s++) {
    for (let sym = 0; sym < 2; sym++) {
      const i = 2 * s + sym;
      const tr = (rows[s] || '').slice(3 * sym, 3 * sym + 3);
      if (!tr || tr === '---') { write[i] = sym; move[i] = 1; next[i] = HALT; continue; }
      write[i] = tr[0] === '1' ? 1 : 0;
      move[i] = tr[1] === 'R' ? 1 : -1;
      next[i] = (tr[2] === 'Z' || tr[2] === 'H') ? HALT : tr.charCodeAt(2) - 65;
    }
  }
  return { n, write, move, next, code };
}

function newRun(tm, size = 1 << 12) {
  const mid = size >> 1;
  return {
    tm, tape: new Int8Array(size), head: mid, origin: mid, state: 0,
    steps: 0, ones: 0, halted: false, minHead: mid, maxHead: mid,
  };
}

function growTape(r) {
  const old = r.tape, len = old.length, shift = len >> 1;
  const nt = new Int8Array(len * 2);
  nt.set(old, shift);
  r.tape = nt; r.head += shift; r.origin += shift;
  r.minHead += shift; r.maxHead += shift;
}

// Macro-step: run up to `budget` steps (or until halt). Returns steps done.
// The halting transition (…Z) writes, moves, and counts as a step — the
// convention under which S(5) = 47,176,870.
function runFor(r, budget) {
  let left = budget;
  const { write, move, next } = r.tm;
  while (left > 0 && !r.halted) {
    if (r.head < 1 || r.head > r.tape.length - 2) growTape(r);
    const tape = r.tape, hi = tape.length - 1;
    let head = r.head, state = r.state, ones = r.ones;
    let min = r.minHead, max = r.maxHead, done = 0;
    while (done < left && state >= 0 && head > 0 && head < hi) {
      const sym = tape[head];
      const i = (state << 1) | sym;
      const w = write[i];
      if (w !== sym) { tape[head] = w; ones += w - sym; }
      head += move[i];
      state = next[i];
      done++;
      if (head < min) min = head;
      else if (head > max) max = head;
    }
    r.head = head; r.state = state; r.ones = ones;
    r.minHead = min; r.maxHead = max;
    r.steps += done; r.halted = state < 0;
    left -= done;
  }
  return budget - left;
}

// Convenience (tests): run a machine to halt or budget.
export function runMachine(code, budget = 1e8, chunk = 1e7) {
  const r = newRun(parseTM(code));
  while (!r.halted && r.steps < budget) runFor(r, Math.min(chunk, budget - r.steps));
  return {
    halted: r.halted, steps: r.steps, ones: r.ones,
    extent: r.maxHead - r.minHead + 1,
  };
}

/* ---------- exact-configuration cycle detection (sound, not complete) ----------
   Key = (state, head offset from leftmost 1, tape content between outermost 1s).
   A repeated key is a genuine proof of non-halting: identical configuration up
   to translation on a blank-elsewhere tape means identical future, forever.
   Returning null (tape too wide) just means "not tracked". */

function configKey(r) {
  const t = r.tape;
  let L = r.minHead, R = r.maxHead;
  while (L <= R && t[L] === 0) L++;
  while (R >= L && t[R] === 0) R--;
  if (L > R) return r.state + '|b';        // blank tape: position irrelevant
  if (R - L >= 96) return null;
  let s = r.state + '|' + (r.head - L) + '|';
  for (let i = L; i <= R; i++) s += t[i];
  return s;
}

const CYCLE_STEPS = 10000;

function newVerdictRun(code, budget = 1e8) {
  return {
    r: newRun(parseTM(code)), budget,
    phase: 'cycle', seen: new Map(), verdict: null, cyc: null,
  };
}

// Advance a verdict run by up to frameBudget steps; sets v.verdict when known:
// 'halt' | 'nonhalt' (exact cycle proof) | 'unknown' (budget exhausted).
// Optional `store`: capture space-time rows at exact sample boundaries.
function pumpVerdict(v, frameBudget, store = null) {
  const r = v.r;
  let left = frameBudget;
  if (v.phase === 'cycle') {
    const lim = Math.min(CYCLE_STEPS, v.budget);
    while (left > 0 && !r.halted && r.steps < lim) {
      runFor(r, 1); left--;
      if (store && r.steps >= store.next) sampleRow(store, r);
      const key = configKey(r);
      if (key !== null) {
        const prev = v.seen.get(key);
        if (prev !== undefined) {
          v.verdict = 'nonhalt';
          v.cyc = { from: prev, at: r.steps };
          break;
        }
        v.seen.set(key, r.steps);
      }
    }
    if (!v.verdict) {
      if (r.halted) v.verdict = 'halt';
      else if (r.steps >= v.budget) v.verdict = 'unknown';
      else if (r.steps >= lim) { v.phase = 'macro'; v.seen = null; }
    }
  }
  if (!v.verdict && v.phase === 'macro' && left > 0) {
    while (left > 0 && !r.halted && r.steps < v.budget) {
      const k = Math.min(left, v.budget - r.steps,
        store ? Math.max(1, store.next - r.steps) : left);
      const did = runFor(r, k);
      left -= did;
      if (store && r.steps >= store.next) sampleRow(store, r);
      if (did === 0) break;
    }
    if (r.halted) v.verdict = 'halt';
    else if (r.steps >= v.budget) v.verdict = 'unknown';
  }
  if (store && r.halted &&
      (!store.rows.length || store.rows[store.rows.length - 1].step !== r.steps)) {
    sampleRow(store, r);
  }
  return frameBudget - left;
}

/* ---------- space-time row store (pure; typed arrays only) ---------- */

function newStore(maxRows = 260, interval = 1) {
  return { rows: [], maxRows, interval, next: 0 };
}

function sampleRow(store, r) {
  const L = r.minHead, R = r.maxHead;
  store.rows.push({
    step: r.steps,
    off: L - r.origin,
    head: r.head - r.origin,
    cells: r.tape.slice(L, R + 1),
  });
  store.next = r.steps + store.interval;
  if (store.rows.length > store.maxRows) {          // decimate: halve, stretch
    store.rows = store.rows.filter((_, i) => (i & 1) === 0);
    store.interval *= 2;
    store.next = store.rows[store.rows.length - 1].step + store.interval;
  }
}

// Run up to `budget` steps, capturing rows exactly at sample boundaries.
function pumpSampled(r, store, budget) {
  let left = budget;
  while (left > 0 && !r.halted) {
    const k = Math.min(left, Math.max(1, store.next - r.steps));
    const did = runFor(r, k);
    left -= did;
    if (r.steps >= store.next) sampleRow(store, r);
    if (did === 0) break;
  }
  if (r.halted && (!store.rows.length ||
      store.rows[store.rows.length - 1].step !== r.steps)) sampleRow(store, r);
  return budget - left;
}

/* ==================== champions (transcribed, verified) ==================== */
// Sources: wiki.bbchallenge.org/wiki/BB(1) … BB(5). The BB(5) table matches the
// design spec's verified Marxen–Buntrock table symbol for symbol.

export const CHAMPIONS = [
  { n: 1, steps: 1, ones: 1, code: '1RZ---',
    who: 'the one-state champion — write a 1, step right, stop' },
  { n: 2, steps: 6, ones: 4, code: '1RB1LB_1LA1RZ',
    who: 'the two-state champion' },
  { n: 3, steps: 21, ones: null, code: '1RB1RZ_1LB0RC_1LC1LA',
    who: 'proved by Shen Lin, 1963' },
  { n: 4, steps: 107, ones: 13, code: '1RB1LB_1LA0LC_1RZ1LD_1RD0RA',
    who: 'proved by Allen Brady, 1983' },
  { n: 5, steps: 47176870, ones: 4098, code: '1RB1LC_1RC1RB_1RD0LE_1LA1LD_1RZ0LA',
    who: 'found by Marxen & Buntrock, 1990 · proved by bbchallenge (Coq), July 2024' },
];

// Antihydra — 6-state cryptid, found June 28, 2024 (mxdys).
// Transcribed from https://wiki.bbchallenge.org/wiki/Antihydra
export const ANTIHYDRA = '1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA';

// Antihydra's halting condition, verbatim from the wiki's pseudocode:
//   h = 8; c = 0
//   while c != -1:  { if h even: c += 2 else: c -= 1;  h += h//2 }
// It halts iff c ever reaches −1 — iff at some point there have been strictly
// more than twice as many odd h-values as even ones.
export function hydraAdvance(h, c, n) {
  const out = { h, c, trace: [], halted: false };
  for (let i = 0; i < n; i++) {
    if (out.c === -1) { out.halted = true; break; }
    if (out.h % 2n === 0n) out.c += 2; else out.c -= 1;
    out.h += out.h / 2n;
    out.trace.push(out.c);
  }
  if (out.c === -1) out.halted = true;
  return out;
}

// Ternary digits of 2^n (most significant first) — the Erdős machine's quarry.
export function ternaryOfPow2(n) {
  return digitsInBase(1n << BigInt(n), 3);
}
export function hasTwoInTernary(n) {
  return ternaryOfPow2(n).includes(2);
}

/* ==================== the diagonal defeat (pure) ====================
   Programs are generator-function bodies; `yield` is one step of work, `SRC`
   is the program's own source (handed to it by the harness — self-reference
   made mechanical, as in III.2), `run(src, fuel)` is a sandboxed bounded
   runner. Checkers are plain total functions of (src, run).
   NOTE: only our own program texts are ever executed — every loop yields, so
   pumping a generator can always be paused. */

export const SAMPLE_PROGRAMS = [
  { name: 'the countdown', halts: true, src:
`let n = 9;
while (n > 0) { n--; yield; }
// n reached 0 — done` },
  { name: 'the blinker', halts: false, src:
`while (true) yield;
// it does nothing, forever` },
  { name: 'hailstone 27', halts: true, src:
`let n = 27;
while (n !== 1) { n = n % 2 ? 3 * n + 1 : n / 2; yield; }
// 27 reaches 1 after 111 hailstone jumps` },
];

export const CHECKERS = [
  { name: 'the pattern sniffer', blurb:
      'Reads the source. An unmistakable infinite loop means LOOPS; anything else means HALTS.',
    src:
`function checker(src) {
  if (src.includes('while (true)')) return 'loops';
  return 'halts';
}` },
  { name: 'the thousand-step runner', blurb:
      'No guessing — actually runs the program in a sandbox for 1,000 steps and reports what it saw.',
    src:
`function checker(src, run) {
  const result = run(src, 1000);
  if (result.halted) return 'halts'; // saw it stop
  return 'loops';                    // 1000 steps is plenty… surely
}` },
  { name: 'the pattern library', blurb:
      'A curated library of programs whose fate is known. Unknown code gets the optimistic default.',
    src:
`function checker(src) {
  if (src.includes('n--')) return 'halts';        // the countdown family
  if (src.includes('3 * n + 1')) return 'halts';  // verified hailstones
  if (src.includes('while (true) yield')) return 'loops'; // blinkers
  return 'halts';  // most programs halt. probably. right?
}` },
];

export function buildSpite(checkerSrc) {
  return `// the nemesis — it carries its judge inside itself
const checker = (${checkerSrc});
const verdict = checker(SRC, run); // "will I halt?" — asked about THIS source
if (verdict === 'halts') {
  while (true) yield;              // it said I stop? then I never will.
}
return;                            // it said I loop? watch me stop.`;
}

export function compileChecker(src) {
  return new Function('"use strict"; return (' + src + ');')();
}

function makeGen(src, run) {
  const f = new Function('SRC', 'run',
    '"use strict"; return (function* () {\n' + src + '\n})();');
  return f(src, run);
}

let simDepth = 0;

// Bounded sandbox run. Total by construction: fuel bounds the pump, a depth
// cap bounds nested simulations, and nested fuel strictly shrinks.
export function runSandbox(src, fuel) {
  if (simDepth >= 32) return { halted: false, ticks: 0, aborted: true };
  simDepth++;
  let ticks = 0;
  try {
    const innerRun = (s, f) =>
      runSandbox(s, Math.min(f, Math.max(0, fuel - ticks - 10)));
    const gen = makeGen(src, innerRun);
    while (ticks < fuel) {
      const { done } = gen.next();
      ticks++;
      if (done) return { halted: true, ticks };
    }
    return { halted: false, ticks };
  } catch (e) {
    return { halted: true, ticks, threw: true };   // a crash still halts
  } finally {
    simDepth--;
  }
}

// A REAL (depth-0) execution of a program: not a simulation — the genuine run,
// as a pumpable generator. Its nested `run` calls sandbox at depth 1, which is
// exactly where the checker's own prediction-time queries run. That identity is
// what makes the defeat a theorem rather than a coincidence.
export function makeRealRun(src) {
  simDepth = 0;
  return makeGen(src, (s, f) => runSandbox(s, f));
}

// The whole defeat, headless (used by tests; the UI stages the same steps).
// prediction and the spite program's own internal query are the SAME
// deterministic computation — so the mismatch is guaranteed, not lucky.
export function spiteOutcome(checkerSrc, watchFuel = 60000) {
  simDepth = 0;
  const checker = compileChecker(checkerSrc);
  const spite = buildSpite(checkerSrc);
  const prediction = checker(spite, (s, f) => runSandbox(s, f));
  const gen = makeRealRun(spite);
  let ticks = 0, halted = false;
  try {
    while (ticks < watchFuel) {
      ticks++;
      if (gen.next().done) { halted = true; break; }
    }
  } catch { halted = true; }
  return { prediction, actualHalts: halted, spite, ticks };
}

/* ==================== the tower (pure) ==================== */
// Floor k of the staircase holds 2↑↑k: 2, 4, 16, 65,536, 2^65,536, …
// 2↑↑↑5 = 2↑↑(2↑↑65,536): the height needed is the number found at floor
// 65,536 — the address of the floor you actually need.

export function towerFloorDigits(k) {          // exact for k ≤ 5
  if (k <= 4) return String([2n, 4n, 16n, 65536n][k - 1]).length;
  if (k === 5) return (2n ** 65536n).toString().length;   // 19,729
  return null;
}

/* ==================== the exhibit ==================== */

export default {
  id: 'beavers',
  movement: 3,
  title: '47,176,870',
  hook: 'Five states, two symbols, one blank tape — and the exact number of steps they can take before halting took six decades and a Coq proof to pin down. The number after it may be unknowable.',
  prose: `
    <p>In 1962, Tibor Radó asked a question with a child's rules and no bottom. Build a machine
    with <em>n</em> states and two symbols; give it a tape of zeros stretching to both horizons;
    let each state say what to write, which way to step, and where to go next, for each symbol it
    might read. Most such machines tumble into eternity — spinning in place, or marching off the
    edge of the tape forever. Some halt. Among the halting ones, one stops <em>last</em>, and its
    step count is the busy beaver number <code>BB(n)</code>. There are finitely many machines of
    each size, so this number exists, exactly, for every <em>n</em>. Radó's little game defines a
    sequence of perfectly ordinary positive integers — and no algorithm, however clever, can
    compute it.</p>
    <p>The sequence opens gently: <code>BB(1) = 1</code>, <code>BB(2) = 6</code>,
    <code>BB(3) = 21</code> (Shen Lin, 1963), <code>BB(4) = 107</code> (Allen Brady, 1983). Then
    the floor gives way. In 1990 Heiner Marxen and Jürgen Buntrock found a five-state machine that
    runs for <em>47,176,870</em> steps, prints 4,098 ones, and stops. Whether anything five-state
    could outlast it stayed open for thirty-four years — until July 2024, when the bbchallenge
    collaboration, an online community, partly pseudonymous, with the Coq proof assistant standing
    in for the referee, certified the final holdouts and made it official:
    <code>BB(5) = 47,176,870</code>. Every one of those forty-seven million steps is now, in the
    strictest sense of the word, a theorem. In the preserve below you can watch the entire proof
    happen — in about a second, or one step at a time.</p>
    <p>Why can't we simply keep going? Because a program that computed <code>BB</code> would decide
    the undecidable: to learn whether an <em>n</em>-state machine halts, compute <code>BB(n)</code>
    and run the machine that long — if it is still going, it never stops. So <code>BB</code>
    eventually outgrows <em>every</em> function any program can compute. The diagonal that stepped
    out of Cantor's list and hid inside Gödel's sentence detonates a third time here, and the first
    panel lets you pull the pin yourself: choose a halting-checker — its full source on the table —
    and the page will assemble, out of the checker's own code, a small program that does the
    opposite of whatever the checker predicts. You will watch an honest program be wrong, every
    time, for a reason you can read.</p>
    <p>Past five states the sequence does not so much grow as leave. The current six-state
    champion, found in June 2025 by a pseudonymous bbchallenge contributor known as mxdys, runs
    for more than <code>2↑↑↑5</code> steps — pentation: a tower of exponentials whose
    <em>height</em> is itself a tower 65,536 high. Six states also shelter the <em>Antihydra</em>,
    a machine that halts only if a certain coin-flip-like sequence goes wrong in a way no known
    technique can decide. Fifteen states suffice to encode a 1979 conjecture of Erdős about the
    ternary digits of powers of two. And at 745 states stands a machine that halts if and only if
    ZFC — the axioms beneath nearly all of mathematics — is inconsistent. By Gödel's second
    theorem, ZFC can never prove that machine runs forever, and so can never pin down
    <code>BB(745)</code>. The busy beaver numbers are not a puzzle inside mathematics; they are a
    ruler laid against its outer wall.</p>
    <p>Below: first the defeat, so the wall is felt before it is measured. Then the preserve, where
    all five proven champions run to their appointed ends. Then a workbench — five states of your
    own against 47,176,870. And then the cliff walk, out past the towers, to the place where the
    numbers still sit, exact as ever, where no theory we trust can reach them.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const bus = audio.createBus('beavers');
    const handles = [];          // canvas handles to destroy
    const CHAMP = 47176870;

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-beavers .bvr-tabs { display:flex; flex-wrap:wrap; gap:.5rem; margin:.2rem 0 1rem; }
      #ex-beavers .bvr-panel { display:none; }
      #ex-beavers .bvr-panel.on { display:block; }
      #ex-beavers pre.bvr-src { background:${P.panel}; border:1px solid ${P.line}; border-radius:6px;
        padding:.55rem .75rem; overflow-x:auto; font:0.74rem/1.55 ui-monospace,Menlo,monospace;
        color:${P.ink}; margin:.45rem 0; white-space:pre; }
      #ex-beavers .bvr-cards { display:flex; flex-direction:column; gap:.6rem; margin:.6rem 0; }
      #ex-beavers .bvr-card { border:1px solid ${P.line}; border-radius:8px; padding:.55rem .8rem; cursor:pointer; }
      #ex-beavers .bvr-card:hover { border-color:${P.goldDim}; }
      #ex-beavers .bvr-card.sel { border-color:${P.gold}; box-shadow:0 0 14px ${P.gold}33; }
      #ex-beavers .bvr-card h4 { margin:.05rem 0 .2rem; color:${P.gold}; font-size:.95rem; font-weight:600; }
      #ex-beavers .bvr-card .bvr-blurb { color:${P.inkDim}; font-size:.84rem; }
      #ex-beavers table.bvr-verdicts { width:100%; border-collapse:collapse;
        font:.78rem ui-monospace,Menlo,monospace; margin:.5rem 0; }
      #ex-beavers table.bvr-verdicts td, #ex-beavers table.bvr-verdicts th {
        border:1px solid ${P.line}; padding:.3rem .5rem; text-align:left; color:${P.inkDim}; }
      #ex-beavers table.bvr-verdicts th { color:${P.inkFaint}; font-weight:400; font-style:italic; }
      #ex-beavers .bvr-loopcount { font:1.35rem ui-monospace,Menlo,monospace; color:${P.azure};
        margin:.4rem 0; min-height:1.6em; }
      #ex-beavers .bvr-lanes { display:flex; gap:.8rem; flex-wrap:wrap; margin:.7rem 0 .2rem; }
      #ex-beavers .bvr-mini { flex:0 0 150px; max-width:150px; }
      #ex-beavers .bvr-lab { font:.7rem/1.45 ui-monospace,Menlo,monospace; color:${P.inkDim};
        margin-top:.3rem; min-height:3.6em; }
      #ex-beavers .bvr-biglab { font:.8rem/1.5 ui-monospace,Menlo,monospace; color:${P.inkDim};
        margin:.6rem 0 .3rem; }
      #ex-beavers .bvr-editor table { border-collapse:collapse; margin:.6rem 0; }
      #ex-beavers .bvr-editor td, #ex-beavers .bvr-editor th { border:1px solid ${P.line};
        padding:.28rem .45rem; text-align:center; }
      #ex-beavers .bvr-editor th { color:${P.inkFaint}; font:italic .78rem ui-monospace,Menlo,monospace; }
      #ex-beavers .bvr-editor .bvr-st { color:${P.gold}; font:600 .85rem ui-monospace,Menlo,monospace; }
      #ex-beavers .bvr-editor select { background:${P.panel}; color:${P.ink}; border:1px solid ${P.line};
        border-radius:4px; font:.78rem ui-monospace,Menlo,monospace; padding:1px 2px; margin:0 1px; }
      #ex-beavers .bvr-pair { display:flex; gap:.9rem; flex-wrap:wrap; margin:.5rem 0; }
      #ex-beavers .bvr-pair > div { flex:1 1 300px; min-width:260px; }
      #ex-beavers .bvr-verdict { font:.88rem ui-monospace,Menlo,monospace; color:${P.ink};
        margin:.5rem 0; min-height:1.5em; }
      #ex-beavers .bvr-station { display:none; }
      #ex-beavers .bvr-station.on { display:block; }
      #ex-beavers .bvr-ruler { position:relative; height:58px; margin:.9rem 0 1.1rem;
        border-bottom:1px solid ${P.line}; }
      #ex-beavers .bvr-mark { position:absolute; bottom:-5px; transform:translateX(-50%);
        cursor:pointer; text-align:center; background:none; border:none; padding:0; }
      #ex-beavers .bvr-mark i { display:block; width:9px; height:9px; border-radius:50%;
        margin:0 auto; font-style:normal; }
      #ex-beavers .bvr-mark span { font:.68rem ui-monospace,Menlo,monospace; color:${P.inkDim};
        display:block; margin-bottom:.35rem; white-space:nowrap; }
      #ex-beavers .bvr-tower { display:flex; flex-direction:column-reverse; align-items:center;
        gap:5px; margin:.8rem 0; }
      #ex-beavers .bvr-floor { background:${P.panel}; border:1px solid ${P.goldDim}; border-radius:6px;
        padding:.35rem .85rem; font:.8rem ui-monospace,Menlo,monospace; color:${P.ink};
        text-align:center; max-width:100%; overflow-wrap:anywhere; }
      #ex-beavers .bvr-floor.bvr-surrender { border-color:${P.crimson}; color:${P.crimson}; }
      #ex-beavers .bvr-bignum { font:2.1rem ui-monospace,Menlo,monospace; color:${P.goldBright};
        letter-spacing:.05em; text-align:center; margin:.9rem 0 .4rem;
        text-shadow:0 0 18px ${P.gold}55; }
      #ex-beavers table.bvr-tm { border-collapse:collapse; font:.8rem ui-monospace,Menlo,monospace;
        margin:.6rem auto; }
      #ex-beavers table.bvr-tm td, #ex-beavers table.bvr-tm th { border:1px solid ${P.line};
        padding:.26rem .55rem; color:${P.ink}; text-align:center; }
      #ex-beavers table.bvr-tm th { color:${P.inkFaint}; font-weight:400; font-style:italic; }
      #ex-beavers .bvr-note { color:${P.inkDim}; font-size:.86rem; font-style:italic; margin:.45rem 0; }
      #ex-beavers .bvr-zones { display:flex; height:26px; border-radius:6px; overflow:hidden;
        margin:.7rem 0 .2rem; border:1px solid ${P.line}; }
      #ex-beavers .bvr-zones div { font:.68rem ui-monospace,Menlo,monospace; color:${P.bg};
        display:flex; align-items:center; justify-content:center; white-space:nowrap; overflow:hidden; }
      #ex-beavers .bvr-ok { color:${P.verdant}; }
      #ex-beavers .bvr-bad { color:${P.crimson}; }
      #ex-beavers .bvr-open { color:${P.azure}; }
      #ex-beavers .bvr-unk { color:${P.inkFaint}; }
      #ex-beavers .bvr-gold { color:${P.goldBright}; }
    `;
    stage.appendChild(style);

    /* ---------- small helpers ---------- */
    const el = (tag, cls, parent, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (parent) parent.appendChild(e);
      if (html != null) e.innerHTML = html;
      return e;
    };
    const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const GOLD = hexRgb(P.gold), CRIM = hexRgb(P.crimson);
    const AZUR = hexRgb(P.azureDim), BRIGHT = hexRgb(P.goldBright), FAINT = hexRgb(P.inkFaint);

    // Render a row store into an offscreen canvas as a space-time diagram:
    // gold = 1-cells (intensity = density when decimated), crimson = head path.
    function renderStore(off, store, wCss, hCss, dpr) {
      const W = Math.max(2, Math.round(wCss * dpr));
      const H = Math.max(2, Math.round(hCss * dpr));
      if (off.width !== W) off.width = W;
      if (off.height !== H) off.height = H;
      const g = off.getContext('2d');
      const img = g.createImageData(W, H);
      const rows = store.rows;
      if (rows.length) {
        let lo = Infinity, hi = -Infinity;
        for (const row of rows) {
          if (row.off < lo) lo = row.off;
          const r2 = row.off + row.cells.length - 1;
          if (r2 > hi) hi = r2;
          if (row.head < lo) lo = row.head;
          if (row.head > hi) hi = row.head;
        }
        const span = Math.max(1, hi - lo + 1);
        const data = img.data;
        const rowH = H / rows.length;
        const perCol = Math.max(1, span / W);
        const col = new Float32Array(W);
        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri];
          const y0 = Math.floor(ri * rowH);
          const y1 = Math.max(y0 + 1, Math.floor((ri + 1) * rowH));
          col.fill(0);
          const cells = row.cells, base = row.off - lo;
          for (let ci = 0; ci < cells.length; ci++) {
            if (cells[ci]) col[Math.min(W - 1, Math.floor(((base + ci) / span) * W))] += 1;
          }
          for (let x = 0; x < W; x++) {
            const d = col[x];
            if (d > 0) {
              const a = Math.min(255, 80 + 175 * Math.min(1, d / perCol));
              for (let y = y0; y < y1; y++) {
                const p = (y * W + x) * 4;
                data[p] = GOLD[0]; data[p + 1] = GOLD[1]; data[p + 2] = GOLD[2]; data[p + 3] = a;
              }
            }
          }
          const hx = clamp(Math.floor(((row.head - lo) / span) * W), 0, W - 1);
          for (let y = y0; y < y1; y++) {
            const p = (y * W + hx) * 4;
            data[p] = CRIM[0]; data[p + 1] = CRIM[1]; data[p + 2] = CRIM[2]; data[p + 3] = 235;
          }
        }
      }
      g.putImageData(img, 0, 0);
    }

    function blit(handle, off) {
      const { ctx, width, height } = handle;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, width, height);
    }

    function tmTable(code) {
      const tm = parseTM(code);
      const rows = code.split('_');
      let h = '<table class="bvr-tm"><tr><th></th><th>read 0</th><th>read 1</th></tr>';
      for (let s = 0; s < tm.n; s++) {
        const c0 = rows[s].slice(0, 3), c1 = rows[s].slice(3, 6) || '---';
        const fmt = (t) => t === '---' ? `<span class="bvr-unk">---</span>`
          : /Z|H/.test(t[2]) ? `<span class="bvr-gold">${t}</span>` : t;
        h += `<tr><td class="bvr-gold">${String.fromCharCode(65 + s)}</td><td>${fmt(c0)}</td><td>${fmt(c1)}</td></tr>`;
      }
      return h + '</table>';
    }

    const chime = (freq, when = 0, level = 0.28, dur = 0.5) =>
      audio.playTone(bus, { freq, dur, level, when: bus.context.currentTime + when, type: 'sine' });

    /* ---------- tabs ---------- */
    const tabsRow = el('div', 'bvr-tabs', stage);
    const TABS = ['I · the defeat', 'II · the preserve', 'III · beat the beaver', 'IV · the cliff walk'];
    const panels = [];
    const tabBtns = [];
    let activeAct = 0;
    for (let i = 0; i < 4; i++) {
      tabBtns.push(ui.button(tabsRow, TABS[i], () => switchAct(i), { small: true }));
      panels.push(el('div', 'bvr-panel', stage));
    }
    function switchAct(i) {
      if (i === activeAct && panels[i].classList.contains('on')) return;
      if (activeAct === 1 && i !== 1) droneOff();
      activeAct = i;
      panels.forEach((p, j) => p.classList.toggle('on', j === i));
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      markAllDirty();
    }

    /* ================= ACT I — the defeat ================= */
    const act1 = panels[0];
    el('div', 'bvr-note', act1,
      'Three halting-checkers, source code on the table. Each is an honest, total procedure: ' +
      'it always answers, and on the little programs below it always answers correctly. Pick one.');

    const cards = el('div', 'bvr-cards', act1);
    let chosen = -1;
    const cardEls = CHECKERS.map((ch, i) => {
      const c = el('div', 'bvr-card', cards);
      el('h4', null, c, ch.name);
      el('div', 'bvr-blurb', c, ch.blurb);
      el('pre', 'bvr-src', c).textContent = ch.src;
      c.addEventListener('click', () => pickChecker(i));
      return c;
    });

    const trialWrap = el('div', null, act1);
    trialWrap.style.display = 'none';
    const trialTitle = el('div', 'bvr-note', trialWrap);
    const trialTable = el('table', 'bvr-verdicts', trialWrap);
    const nemesisControls = ui.controlRow(trialWrap);
    const assembleBtn = ui.button(nemesisControls, 'assemble its nemesis', assembleNemesis, { primary: true });

    const nemesisWrap = el('div', null, act1);
    nemesisWrap.style.display = 'none';
    const nemesisPre = el('pre', 'bvr-src', nemesisWrap);
    const nemesisNote = el('div', 'bvr-note', nemesisWrap,
      'One template, the checker\'s own source spliced in, and the fatal question asked of ' +
      '<code>SRC</code> — this very program\'s text. Note the honest <code>while (true)</code> ' +
      'sitting in plain view.');
    const runRow = ui.controlRow(nemesisWrap);
    const runNemBtn = ui.button(runRow, 'ask, then run it', runNemesis, { primary: true });
    const stopWatchBtn = ui.button(runRow, 'stop watching', stopWatching);
    stopWatchBtn.style.display = 'none';
    const predictEl = ui.readout(nemesisWrap, '');
    const loopCountEl = el('div', 'bvr-loopcount', nemesisWrap);
    const defeatEl = el('div', 'bvr-verdict', nemesisWrap);
    const scoreEl = el('div', 'bvr-note', act1, '');
    const closingEl = el('div', 'bvr-note', act1);
    closingEl.style.display = 'none';

    let spiteSrc = null, spiteGen = null, spiteTicks = 0, prediction = null;
    let watching = false, resolved = false, defeats = 0;

    function pickChecker(i) {
      chosen = i;
      cardEls.forEach((c, j) => c.classList.toggle('sel', j === i));
      stopWatching();
      nemesisWrap.style.display = 'none';
      predictEl.set(''); loopCountEl.textContent = ''; defeatEl.innerHTML = '';
      trialWrap.style.display = '';
      trialTitle.innerHTML = `<em>${CHECKERS[i].name}</em> on the warm-up programs — all correct:`;
      const fn = compileChecker(CHECKERS[i].src);
      let rows = '<tr><th>program</th><th>truth</th><th>verdict</th></tr>';
      for (const p of SAMPLE_PROGRAMS) {
        const v = fn(p.src, (s, f) => runSandbox(s, f));
        const right = (v === 'halts') === p.halts;
        rows += `<tr><td>${p.name}</td><td>${p.halts ? 'halts' : 'runs forever'}</td>` +
          `<td class="${right ? 'bvr-ok' : 'bvr-bad'}">${v.toUpperCase()} ${right ? '✓' : '✗'}</td></tr>`;
      }
      trialTable.innerHTML = rows;
    }

    function assembleNemesis() {
      if (chosen < 0) return;
      audio.ensureAudio();
      stopWatching();
      spiteSrc = buildSpite(CHECKERS[chosen].src);
      nemesisPre.textContent = spiteSrc;
      nemesisWrap.style.display = '';
      predictEl.set(''); loopCountEl.textContent = ''; defeatEl.innerHTML = '';
      resolved = false;
      audio.drums.wood(bus, bus.context.currentTime, { pitch: 660, level: 0.4 });
    }

    function runNemesis() {
      if (!spiteSrc) return;
      audio.ensureAudio();
      const fn = compileChecker(CHECKERS[chosen].src);
      prediction = fn(spiteSrc, (s, f) => runSandbox(s, f));
      predictEl.set(`${CHECKERS[chosen].name} has studied its nemesis and declares: ` +
        prediction.toUpperCase());
      spiteGen = makeRealRun(spiteSrc);
      spiteTicks = 0; watching = true; resolved = false;
      loopCountEl.textContent = 'running…';
      defeatEl.innerHTML = '';
      stopWatchBtn.style.display = 'none';
    }

    function stopWatching() {
      if (watching && !resolved) resolveDefeat(false);
      watching = false; spiteGen = null;
      stopWatchBtn.style.display = 'none';
      if (spiteTicks > 0 && resolved && prediction === 'halts') {
        loopCountEl.textContent =
          `stopped watching at ${formatBig(spiteTicks)} iterations — it has not stopped looping`;
      }
    }

    function resolveDefeat(halted) {
      if (resolved) return;
      resolved = true; defeats++;
      const t = bus.context.currentTime;
      audio.playTone(bus, { freq: 392, dur: 0.7, level: 0.2, when: t });
      audio.playTone(bus, { freq: 554.37, dur: 0.7, level: 0.2, when: t + 0.04 });
      defeatEl.innerHTML = halted
        ? `It said <b class="bvr-open">LOOPS</b> — and the program promptly ` +
          `<b class="bvr-ok">HALTED</b>, after ${formatBig(spiteTicks)} steps. Wrong.`
        : `It said <b class="bvr-ok">HALTS</b> — and the program is looping before your eyes. ` +
          `Its <em>only</em> exit branch required the verdict LOOPS. It will never stop. Wrong.`;
      scoreEl.innerHTML = `score — <b class="bvr-gold">the diagonal ${defeats}</b> · checkers 0`;
      closingEl.style.display = '';
      closingEl.innerHTML =
        'Nothing here exploited a weakness. The nemesis asks its judge about itself and does the ' +
        'opposite — so <em>any</em> total checker, however sophisticated, is wrong on some program ' +
        'built from its own source. That is Turing\'s 1936 theorem, and you just ran it. ' +
        'It is the reason the busy beaver numbers cannot be computed — only, one by one, ' +
        'at enormous cost, <em>known</em>.';
    }

    function tickAct1() {
      if (!watching || !spiteGen) return;
      try {
        for (let i = 0; i < 6000; i++) {
          spiteTicks++;
          if (spiteGen.next().done) {
            watching = false; spiteGen = null;
            loopCountEl.textContent = `halted after ${formatBig(spiteTicks)} steps`;
            resolveDefeat(true);
            return;
          }
        }
      } catch (e) {
        watching = false; spiteGen = null;
        loopCountEl.textContent = 'the program crashed — which is a halt';
        resolveDefeat(true);
        return;
      }
      loopCountEl.textContent = `${formatBig(spiteTicks)} iterations and counting…`;
      if (!resolved && spiteTicks >= 12000 && prediction === 'halts') {
        resolveDefeat(false);
        stopWatchBtn.style.display = '';
      }
    }

    /* ================= ACT II — the preserve ================= */
    const act2 = panels[1];
    const raceQuest = ui.questBanner(act2,
      'Run all five proven champions to their ends — BB(5) wants the full throttle.');

    const raceControls = ui.controlRow(act2);
    const releaseBtn = ui.button(raceControls, '▶ release the beavers', releaseBeavers, { primary: true });
    const holdBtn = ui.button(raceControls, '⏸ hold', toggleHold);
    const stepBtn = ui.button(raceControls, 'step ×1', stepOnce);
    const speedSl = ui.slider(raceControls, {
      label: 'throttle (steps/sec)', min: 1, max: 7.7, step: 0.05, value: 1.4,
      format: (v) => formatBig(Math.round(Math.pow(10, v))),
    });
    const throttleBtn = ui.button(raceControls, 'full throttle', () => { speedSl.set(7.7); });

    const laneRow = el('div', 'bvr-lanes', act2);
    const lanes = CHAMPIONS.map((meta) => {
      const lane = { meta, run: null, store: null, dirty: false, lastRender: 0,
        off: document.createElement('canvas'), handle: null, labEl: null };
      if (meta.n < 5) {
        const wrap = el('div', 'bvr-mini', laneRow);
        lane.handle = cv.setupCanvas(wrap, { height: 96 });
        lane.labEl = el('div', 'bvr-lab', wrap);
      }
      return lane;
    });
    const bigLane = lanes[4];
    bigLane.labEl = el('div', 'bvr-biglab', act2);
    const bigWrap = el('div', null, act2);
    bigLane.handle = cv.setupCanvas(bigWrap, { height: 330 });
    lanes.forEach((l) => {
      handles.push(l.handle);
      l.handle.onResize(() => { l.dirty = true; });
    });
    ui.caption(act2,
      'Space-time diagrams: every row is a snapshot of the tape (gold — the 1s, with brightness as ' +
      'density; the red thread — the head), time flowing downward, rows decimated as a run outgrows ' +
      'them. BB(1)–BB(4) finish while you watch; open the throttle and 47,176,870 steps unfurl in ' +
      'about a second. Machines transcribed from the bbchallenge wiki.');

    let racePlaying = false, raceStarted = false, raceAcc = 0;
    let droneVoice = null, droneAudible = false;

    function droneOn() {
      if (!droneVoice) droneVoice = audio.voice(bus, { type: 'triangle', freq: 60, level: 0.11 });
      if (!droneAudible) { droneVoice.on(0.11); droneAudible = true; }
    }
    function droneOff() {
      if (droneVoice && droneAudible) { droneVoice.off(); droneAudible = false; }
    }

    function resetRace() {
      for (const lane of lanes) {
        lane.run = newRun(parseTM(lane.meta.code));
        lane.store = newStore(lane.meta.n === 5 ? 260 : 130,
          lane.meta.n === 5 ? Math.ceil(lane.meta.steps / 258) : 1);
        sampleRow(lane.store, lane.run);
        lane.dirty = true;
        lane.lastRender = 0;
      }
      raceAcc = 0;
      raceQuest.set('Run all five proven champions to their ends — BB(5) wants the full throttle.');
    }

    function releaseBeavers() {
      audio.ensureAudio();
      resetRace();
      raceStarted = true;
      racePlaying = true;
      holdBtn.textContent = '⏸ hold';
      releaseBtn.textContent = '↻ release again';
      audio.drums.wood(bus, bus.context.currentTime, { pitch: 880, level: 0.4 });
      droneOn();
    }

    function toggleHold() {
      if (!raceStarted) return;
      audio.ensureAudio();
      racePlaying = !racePlaying;
      holdBtn.textContent = racePlaying ? '⏸ hold' : '▶ resume';
      if (!racePlaying) droneOff();
      else if (!lanes[4].run.halted) droneOn();
    }

    function stepOnce() {
      if (!raceStarted) { releaseBeavers(); racePlaying = false; holdBtn.textContent = '▶ resume'; droneOff(); }
      audio.ensureAudio();
      for (const lane of lanes) {
        if (lane.run.halted) continue;
        pumpSampled(lane.run, lane.store, 1);
        lane.dirty = true;
        if (lane.run.halted) laneHalted(lane);
      }
    }

    function laneHalted(lane) {
      const t = bus.context.currentTime;
      chime(261.63 * Math.pow(2, lane.meta.n / 4), 0, 0.26);
      if (lane.meta.n === 5) {
        racePlaying = false;
        droneOff();
        chime(523.25, 0.1, 0.3); chime(659.25, 0.22, 0.3); chime(783.99, 0.34, 0.3, 0.9);
        raceQuest.done('47,176,870 steps · 4,098 ones — everything you just watched is now a theorem.');
      } else {
        audio.drums.wood(bus, t, { pitch: 440 + 120 * lane.meta.n, level: 0.3 });
      }
    }

    function laneLabel(lane) {
      const m = lane.meta, r = lane.run;
      const status = !r ? '' : r.halted
        ? `<span class="bvr-ok">✓ ${formatBig(r.steps)} steps · ${r.ones} ones</span>`
        : `${formatBig(r.steps)} / ${formatBig(m.steps)} steps…`;
      if (m.n === 5) {
        const pct = r ? Math.min(100, (r.steps / m.steps) * 100) : 0;
        return `<b class="bvr-gold">BB(5) = 47,176,870</b> · <code>${m.code}</code><br>` +
          `${status}${r && !r.halted ? ` · ${pct.toFixed(1)}%` : ''} — ${m.who}`;
      }
      return `<b class="bvr-gold">BB(${m.n}) = ${m.steps}</b><br>${status}<br>` +
        `<span class="bvr-unk">${m.who}</span>`;
    }

    function renderLane(lane, now) {
      renderStore(lane.off, lane.store, lane.handle.width, lane.handle.height, lane.handle.dpr);
      blit(lane.handle, lane.off);
      lane.labEl.innerHTML = laneLabel(lane);
      lane.dirty = false;
      lane.lastRender = now;
    }

    function tickAct2(dt) {
      if (racePlaying && raceStarted) {
        const sps = Math.pow(10, speedSl.value);
        raceAcc += sps * dt;
        let n = Math.floor(raceAcc);
        if (n > 0) {
          raceAcc -= n;
          n = Math.min(n, 2500000);
          for (const lane of lanes) {
            if (lane.run.halted) continue;
            pumpSampled(lane.run, lane.store, n);
            lane.dirty = true;
            if (lane.run.halted) laneHalted(lane);
          }
        }
        const bb5 = lanes[4];
        if (!bb5.run.halted && droneVoice) {
          droneOn();                 // recovers after a lifecycle pause
          droneVoice.setFreq(60 * Math.pow(2, 3.2 * (bb5.run.steps / CHAMP)), 0.08);
        }
      }
      const now = performance.now() / 1000;
      for (const lane of lanes) {
        if (lane.run && lane.dirty && (now - lane.lastRender > 0.14 || lane.run.halted)) {
          renderLane(lane, now);
        }
      }
    }

    /* ================= ACT III — beat the beaver ================= */
    const act3 = panels[2];
    const beatQuest = ui.questBanner(act3,
      'Five states of your own. Make them outlast <b>47,176,870</b> — or learn, honestly, why you cannot.');

    const editor = el('div', 'bvr-editor', act3);
    const edTable = el('table', null, editor);
    const edCells = [];       // [state][sym] = {w, d, nx} selects
    {
      const hr = el('tr', null, edTable);
      el('th', null, hr, 'state'); el('th', null, hr, 'read 0'); el('th', null, hr, 'read 1');
      for (let s = 0; s < 5; s++) {
        const tr = el('tr', null, edTable);
        el('td', 'bvr-st', tr, String.fromCharCode(65 + s));
        edCells.push([0, 1].map((sym) => {
          const td = el('td', null, tr);
          const mk = (opts) => {
            const sel = el('select', null, td);
            for (const o of opts) el('option', null, sel, o).value = o;
            sel.addEventListener('change', editorChanged);
            return sel;
          };
          return { w: mk(['0', '1']), d: mk(['L', 'R']), nx: mk(['A', 'B', 'C', 'D', 'E', 'Z']) };
        }));
      }
    }
    const presetRow = ui.controlRow(act3);
    ui.button(presetRow, 'four-state inheritance', () => setEditor('1RB1LB_1LA0LC_1RZ1LD_1RD0RA_1RZ1RZ'), { small: true });
    ui.button(presetRow, 'load the champion', () => setEditor(CHAMPIONS[4].code), { small: true });
    ui.button(presetRow, 'scramble', scramble, { small: true });
    const runRow3 = ui.controlRow(act3);
    const runBtn3 = ui.button(runRow3, '▶ run — verdict in three flavours', runSandboxTM, { primary: true });
    const stopBtn3 = ui.button(runRow3, 'stop', stopSandbox);
    const verdictEl = el('div', 'bvr-verdict', act3, 'edit the table, then run.');
    const bestEl = el('div', 'bvr-note', act3, '');

    const pair = el('div', 'bvr-pair', act3);
    const yourWrap = el('div', null, pair);
    el('div', 'bvr-biglab', yourWrap, 'your beaver');
    const yourHandle = cv.setupCanvas(yourWrap, { height: 250 });
    const champWrap = el('div', null, pair);
    const champLab = el('div', 'bvr-biglab', champWrap, 'the champion — 47,176,870');
    const champHandle = cv.setupCanvas(champWrap, { height: 250 });
    handles.push(yourHandle, champHandle);
    yourHandle.onResize(() => { yourDirty = true; });
    champHandle.onResize(() => { champDirty = true; });
    const yourOff = document.createElement('canvas');
    const champOff = document.createElement('canvas');
    ui.caption(act3,
      'Three honest verdicts: <b>HALTED</b> (a certificate — the run itself), <b>PROVED ' +
      'NON-HALTING</b> (an exact configuration recurred, so the machine repeats forever), or ' +
      '<b>UNKNOWN</b> (10⁸ steps of patience exhausted). Verifying is possible where deciding is ' +
      'not — though our snapshot-hash detector is a toy next to bbchallenge\'s real deciders. ' +
      'UNKNOWN is what undecidability feels like from the inside.');

    let sandbox = null, sandboxStore = null, sandboxRunning = false;
    let yourDirty = false, champDirty = false, yourLast = 0, champLast = 0;
    let best = null;
    let champStore = null, champBg = null;   // background champion computation

    function setEditor(code) {
      const rows = code.split('_');
      for (let s = 0; s < 5; s++) {
        for (const sym of [0, 1]) {
          const tr = (rows[s] || '1RZ1RZ').slice(sym * 3, sym * 3 + 3) || '1RZ';
          const c = edCells[s][sym];
          c.w.value = tr[0]; c.d.value = tr[1]; c.nx.value = tr[2];
        }
      }
      editorChanged();
    }
    function buildCode() {
      return edCells.map((row) =>
        row.map((c) => c.w.value + c.d.value + c.nx.value).join('')).join('_');
    }
    function scramble() {
      for (const row of edCells) for (const c of row) {
        c.w.value = Math.random() < 0.55 ? '1' : '0';
        c.d.value = Math.random() < 0.5 ? 'L' : 'R';
        c.nx.value = Math.random() < 0.08 ? 'Z' : 'ABCDE'[Math.floor(Math.random() * 5)];
      }
      if (!edCells.some((row) => row.some((c) => c.nx.value === 'Z'))) {
        edCells[Math.floor(Math.random() * 5)][Math.floor(Math.random() * 2)].nx.value = 'Z';
      }
      editorChanged();
    }
    function editorChanged() {
      stopSandbox();
      verdictEl.innerHTML = `<code>${buildCode()}</code> — ready.`;
    }

    function ensureChampion() {
      if (champStore) return;
      const raceLane = lanes[4];
      if (raceLane.run && raceLane.run.halted) {          // reuse the race's rows
        champStore = raceLane.store;
        champDirty = true;
        return;
      }
      if (!champBg) {
        champBg = { r: newRun(parseTM(CHAMPIONS[4].code)),
          store: newStore(260, Math.ceil(CHAMP / 258)) };
        sampleRow(champBg.store, champBg.r);
        champLab.innerHTML = 'the champion — computing its 47,176,870 steps for you…';
      }
    }

    function runSandboxTM() {
      audio.ensureAudio();
      sandbox = newVerdictRun(buildCode(), 1e8);
      sandboxStore = newStore(240, 1);
      sampleRow(sandboxStore, sandbox.r);
      sandboxRunning = true;
      verdictEl.innerHTML = 'running…';
      ensureChampion();
      audio.drums.wood(bus, bus.context.currentTime, { pitch: 700, level: 0.35 });
    }
    function stopSandbox() {
      if (sandboxRunning) verdictEl.innerHTML = 'stopped.';
      sandboxRunning = false;
    }

    function finishVerdict() {
      sandboxRunning = false;
      yourDirty = true;
      const r = sandbox.r, t = bus.context.currentTime;
      if (sandbox.verdict === 'halt') {
        const s = r.steps;
        verdictEl.innerHTML = `<span class="bvr-ok">HALTED</span> after ` +
          `<b>${formatBig(s)}</b> steps · ${formatBig(r.ones)} ones — the champion: 47,176,870.`;
        if (best === null || s > best) best = s;
        bestEl.innerHTML = `your best halting run: <b class="bvr-gold">${formatBig(best)}</b> steps` +
          ` — ${(100 * best / CHAMP).toFixed(best > 1000 ? 2 : 5)}% of the record.`;
        if (s === CHAMP) {
          beatQuest.done('47,176,870 — you found the champion (or its mirror). Nothing five-state does better: that is a theorem.');
          chime(523.25, 0, 0.3); chime(659.25, 0.12, 0.3); chime(783.99, 0.24, 0.3, 0.9);
        } else {
          chime(392, 0, 0.26); chime(523.25, 0.1, 0.26);
        }
      } else if (sandbox.verdict === 'nonhalt') {
        verdictEl.innerHTML = `<span class="bvr-open">PROVED NON-HALTING</span> — the exact ` +
          `configuration of step ${formatBig(sandbox.cyc.from)} recurred at step ` +
          `${formatBig(sandbox.cyc.at)} (period ${formatBig(sandbox.cyc.at - sandbox.cyc.from)}). ` +
          `It repeats forever; no budget required.`;
        chime(220, 0, 0.24); chime(330, 0.1, 0.24);
      } else {
        verdictEl.innerHTML = `<span class="bvr-unk">UNKNOWN</span> — still running after ` +
          `10⁸ steps, and our cycle proof never triggered. It may halt at step 10⁸ + 1; it may ` +
          `run forever. <em>We cannot tell, and for machines in general, nothing can.</em>`;
        audio.drums.thock(bus, t, { level: 0.5 });
      }
    }

    function tickAct3() {
      if (sandboxRunning && sandbox) {
        pumpVerdict(sandbox, sandbox.phase === 'cycle' ? 4000 : 2200000, sandboxStore);
        yourDirty = true;
        if (sandbox.verdict) finishVerdict();
      }
      if (champBg && !champStore) {
        pumpSampled(champBg.r, champBg.store, 2200000);
        champDirty = true;
        if (champBg.r.halted) {
          champStore = champBg.store;
          champBg = null;
          champLab.innerHTML = 'the champion — 47,176,870';
        }
      }
      const now = performance.now() / 1000;
      if (sandboxStore && yourDirty && (now - yourLast > 0.14 || !sandboxRunning)) {
        renderStore(yourOff, sandboxStore, yourHandle.width, yourHandle.height, yourHandle.dpr);
        blit(yourHandle, yourOff);
        yourDirty = false; yourLast = now;
        if (sandbox && sandboxRunning) {
          verdictEl.innerHTML = `running… <b>${formatBig(sandbox.r.steps)}</b> steps`;
        }
      }
      const cs = champStore || (champBg && champBg.store);
      if (cs && champDirty && (now - champLast > 0.2 || champStore)) {
        renderStore(champOff, cs, champHandle.width, champHandle.height, champHandle.dpr);
        blit(champHandle, champOff);
        champDirty = false; champLast = now;
      }
    }

    setEditor('1RB1LB_1LA0LC_1RZ1LD_1RD0RA_1RZ1RZ');
    el('div', 'bvr-note', act3,
      'You inherit Brady\'s four-state champion, idling one state: it will halt at 107. Four ' +
      'states bought 107 steps; the fifth bought Marxen and Buntrock forty-seven million. ' +
      'Scramble, tinker, reason — the record is not hiding, it is just <em>far</em>.');

    /* ================= ACT IV — the cliff walk ================= */
    const act4 = panels[3];
    el('div', 'bvr-note', act4,
      'A walk along the axis of machine sizes, from the last number we know to the wall no ' +
      'theory we trust can see past. The scale is logarithmic; the vertigo is not.');

    const ruler = el('div', 'bvr-ruler', act4);
    const MARKS = [
      { label: '1–4', n: 4, color: P.verdant, st: 0, tip: 'settled by hand' },
      { label: '5', n: 5, color: P.gold, st: 0, tip: 'settled by Coq, 2024' },
      { label: '6', n: 6, color: P.azure, st: 1, tip: 'open — cryptids live here' },
      { label: '15', n: 15, color: P.azure, st: 3, tip: 'contains a 1979 Erdős conjecture' },
      { label: '745', n: 745, color: P.crimson, st: 4, tip: 'ZFC goes blind' },
    ];
    for (const mk of MARKS) {
      const b = el('button', 'bvr-mark', ruler);
      b.style.left = (Math.log10(mk.n) / 3 * 96 + 2) + '%';
      b.title = mk.tip;
      el('span', null, b, mk.label);
      el('i', null, b).style.background = mk.color;
      b.addEventListener('click', () => { audio.ensureAudio(); goStation(mk.st); });
    }

    const navRow = ui.controlRow(act4);
    const prevBtn = ui.button(navRow, '◁ back', () => goStation(station - 1), { small: true });
    const stTitle = el('div', 'bvr-note', navRow);
    const nextBtn = ui.button(navRow, 'onward ▷', () => goStation(station + 1), { small: true });
    const stationEls = [];
    const ST_NAMES = ['the number', 'the tower', 'the antihydra', 'the Erdős machine', 'the wall'];
    for (let i = 0; i < 5; i++) stationEls.push(el('div', 'bvr-station', act4));
    let station = 0;
    function goStation(i) {
      station = clamp(i, 0, 4);
      stationEls.forEach((s, j) => s.classList.toggle('on', j === station));
      stTitle.innerHTML = `station ${station + 1} / 5 — <em>${ST_NAMES[station]}</em>`;
      prevBtn.disabled = station === 0;
      nextBtn.disabled = station === 4;
      if (audio.getContext()) audio.drums.wood(bus, bus.context.currentTime, { pitch: 540, level: 0.22 });
    }

    /* --- station 0: the number --- */
    {
      const s = stationEls[0];
      el('div', 'bvr-bignum', s, '47,176,870');
      el('div', 'bvr-note', s,
        '= BB(5). Found by Marxen and Buntrock in 1990; proved maximal in July 2024 by the ' +
        'bbchallenge collaboration, with a Coq certificate anyone can re-check in an afternoon.');
      el('div', 'bvr-note', s,
        'At one step per second, this run is a year and a half of unbroken work. Your browser ' +
        'just did it in about a second — and the theorem says nothing five-state does better. ' +
        'It halts on a tape bearing exactly 4,098 ones.');
      el('div', 'bvr-note', s,
        'For thirty-four years this number sat one inch past the edge of human knowledge. ' +
        'The next station is what the edge looks like now.');
    }

    /* --- station 1: the tower --- */
    let towerK = 0, p65536str = null;
    {
      const s = stationEls[1];
      el('div', 'bvr-note', s,
        'BB(6) is not a bigger number; it is a different <em>kind</em> of number. The current ' +
        'champion — mxdys, June 2025 — runs for more than <code>2↑↑↑5</code> steps. To feel what ' +
        'pentation means, build the staircase of tetration: each floor holds 2 raised to the ' +
        'number below it.');
      const tower = el('div', 'bvr-tower', s);
      const towerNote = el('div', 'bvr-note', s, '');
      const towerRow = ui.controlRow(s);
      const floorBtn = ui.button(towerRow, 'add a floor', () => {
        audio.ensureAudio();
        towerK++;
        if (towerK <= 5) {
          let txt;
          if (towerK === 1) txt = 'floor 1 · <b>2</b>';
          else if (towerK === 2) txt = 'floor 2 · 2² = <b>4</b>';
          else if (towerK === 3) txt = 'floor 3 · 2⁴ = <b>16</b>';
          else if (towerK === 4) txt = 'floor 4 · 2¹⁶ = <b>65,536</b>';
          else {
            if (!p65536str) p65536str = (2n ** 65536n).toString();
            txt = `floor 5 · 2⁶⁵˒⁵³⁶ = <b>${p65536str.slice(0, 10)}…</b> — ` +
              `${formatBig(p65536str.length)} digits (computed just now, exactly)`;
          }
          el('div', 'bvr-floor', tower, txt);
          chime(160 * Math.pow(2, towerK / 2), 0, 0.22, 0.4);
        } else {
          el('div', 'bvr-floor bvr-surrender', tower,
            'floor 6 · 2^(2^65,536) — the digit <em>count</em> of this number is itself a ' +
            '19,728-digit number. The browser surrenders. So does the universe: there is no ' +
            'room to write it.');
          floorBtn.disabled = true;
          floorBtn.textContent = '…surrendered at floor 6';
          audio.ensureAudio();
          audio.drums.kick(bus, bus.context.currentTime, { level: 0.7 });
          towerNote.innerHTML =
            'You lost the ability to <em>write</em> the numbers at floor 6. A tower of ten 2s — ' +
            '<code>2↑↑10</code> — is floor 10. Now the champion: <code>2↑↑↑5 = 2↑↑(2↑↑65,536)</code>. ' +
            'Climb to floor 65,536 of this staircase and read the number written there: it is not ' +
            'a step count — it is the <em>address of the floor you would need</em>. The BB(6) ' +
            'champion outruns even that. The old celebrated bound of 10↑↑15 is already a footnote.';
        }
      }, { primary: true });
    }

    /* --- station 2: the antihydra --- */
    const hyState = { h: 8n, c: 0, n: 0, minC: 0, trace: [0] };
    let hyHandle = null;
    {
      const s = stationEls[2];
      el('div', 'bvr-note', s,
        'Inside those six states lives the <b>Antihydra</b>, found on June 28, 2024, by mxdys — ' +
        'a “cryptid”: a machine whose fate is believed known and provable by no known technique. ' +
        'Its halting problem reduces, exactly, to this:');
      el('pre', 'bvr-src', s).textContent =
        'h = 8;  c = 0\n' +
        'while c ≠ −1:\n' +
        '    if h is even:  c += 2      else:  c -= 1\n' +
        '    h += ⌊h/2⌋';
      el('div', 'bvr-note', s,
        'It halts if and only if <code>c</code> ever reaches −1 — that is, iff at some point ' +
        'strictly more than twice as many odd values of <code>h</code> have appeared as even ' +
        'ones. Pull the sequence yourself and watch <code>c</code> walk:');
      const hyRow = ui.controlRow(s);
      const hyRead = ui.readout(s, 'the hydra sleeps at h = 8, c = 0.');
      const hyWrap = el('div', null, s);
      hyHandle = cv.setupCanvas(hyWrap, { height: 150 });
      handles.push(hyHandle);
      hyHandle.onResize(() => drawHydra());
      const HY_CAP = 30000;
      const pull = (k) => {
        audio.ensureAudio();
        if (hyState.n >= HY_CAP) return;
        k = Math.min(k, HY_CAP - hyState.n);
        const res = hydraAdvance(hyState.h, hyState.c, k);
        hyState.h = res.h; hyState.c = res.c; hyState.n += k;
        for (const c of res.trace) { hyState.trace.push(c); if (c < hyState.minC) hyState.minC = c; }
        const digits = hyState.h.toString().length;
        hyRead.set(`after ${formatBig(hyState.n)} pulls · c = ${formatBig(hyState.c)} · ` +
          `h has ${formatBig(digits)} digits · closest approach to the cliff: c = ${hyState.minC}` +
          (hyState.n >= HY_CAP ? ' · (enough — h is getting enormous)' : ''));
        audio.drums.wood(bus, bus.context.currentTime,
          { pitch: 420 + (hyState.c % 500), level: 0.28 });
        drawHydra();
      };
      ui.button(hyRow, 'pull ×1', () => pull(1), { small: true });
      ui.button(hyRow, 'pull ×100', () => pull(100), { small: true });
      ui.button(hyRow, 'pull ×5,000', () => pull(5000), { small: true });
      ui.button(hyRow, 'reset', () => {
        hyState.h = 8n; hyState.c = 0; hyState.n = 0; hyState.minC = 0; hyState.trace = [0];
        hyRead.set('the hydra sleeps at h = 8, c = 0.');
        drawHydra();
      }, { small: true });
      el('div', null, s, tmTable(ANTIHYDRA));
      el('div', 'bvr-note', s,
        'The machine itself, all six states (the blank entry is the halt). Deciding BB(6) ' +
        '<em>requires</em> deciding the Antihydra — and nobody can.');
    }
    function drawHydra() {
      const { ctx, width: W, height: H } = hyHandle;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
      const tr = hyState.trace;
      const N = Math.min(500, tr.length);
      const samp = [];
      for (let i = 0; i < N; i++) samp.push(tr[Math.floor(i * tr.length / N)]);
      samp[N - 1] = tr[tr.length - 1];
      let maxC = 6;
      for (const c of samp) if (c > maxC) maxC = c;
      const yOf = (c) => H - 10 - ((c + 1) / (maxC + 1)) * (H - 22);
      ctx.strokeStyle = P.crimson; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, yOf(-1)); ctx.lineTo(W, yOf(-1)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.crimson;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('c = −1 — the cliff (halt)', 6, yOf(-1) - 2);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / Math.max(1, N - 1)) * (W - 8) + 4;
        i ? ctx.lineTo(x, yOf(samp[i])) : ctx.moveTo(x, yOf(samp[i]));
      }
      ctx.stroke();
      ctx.fillStyle = P.inkDim;
      ctx.textAlign = 'right';
      ctx.fillText(`c drifts up ≈ +½ per pull — but a proof is not a drift`, W - 8, 14);
    }

    /* --- station 3: the Erdős machine --- */
    let erN = 9, erRows = [], erScanning = false, erHandle = null;
    const ER_MAX = 1200, ER_KEEP = 110, ER_W = 760;
    const erOff = document.createElement('canvas');
    let erStatus = null;
    {
      const s = stationEls[3];
      el('div', 'bvr-note', s,
        'In 1979 Erdős conjectured: for every <code>n &gt; 8</code>, the ternary (base-3) ' +
        'expansion of <code>2ⁿ</code> contains at least one digit 2. In 2021 Stérin and Woods ' +
        'built an explicit <b>15-state</b> Turing machine that enumerates powers of two in base 3 ' +
        'and halts only on a counterexample. If you knew BB(15), you could settle a conjecture that ' +
        'has stood since 1979 by running one machine. Busy beavers eat open problems this small.');
      el('div', 'bvr-note', s,
        'The only powers of two with no 2 in ternary: <code>2⁰ = 1₃</code>, <code>2² = 11₃</code>, ' +
        '<code>2⁸ = 100111₃</code> — conjecturally the last there will ever be.');
      const erRow = ui.controlRow(s);
      const erBtn = ui.button(erRow, '▶ hunt for a counterexample', () => {
        audio.ensureAudio();
        if (erN > ER_MAX) return;
        erScanning = !erScanning;
        erBtn.textContent = erScanning ? '⏸ pause the hunt' : '▶ hunt for a counterexample';
      }, { primary: true });
      ui.button(erRow, 'reset', () => {
        erScanning = false; erN = 9; erRows = [];
        erBtn.textContent = '▶ hunt for a counterexample';
        erStatus.set('n = 9 — the hunt has not started.');
        drawErdos();
      }, { small: true });
      erStatus = ui.readout(s, 'n = 9 — the hunt has not started.');
      const erWrap = el('div', null, s);
      erHandle = cv.setupCanvas(erWrap, { height: 240 });
      handles.push(erHandle);
      erHandle.onResize(() => drawErdos());
      ui.caption(s,
        'Each row is 2ⁿ written in base 3 — most significant digit at the left. ' +
        '<span class="bvr-gold">gold: digit 2</span> · <span class="bvr-open">blue: 1</span> · ' +
        'dark: 0. The conjecture is the statement that gold never abandons a row again.');
    }
    function drawErdos() {
      const dpr = erHandle.dpr || 1;
      const W = Math.max(2, Math.round(erHandle.width * dpr));
      const H = Math.max(2, Math.round(erHandle.height * dpr));
      if (erOff.width !== W) erOff.width = W;
      if (erOff.height !== H) erOff.height = H;
      const g = erOff.getContext('2d');
      const img = g.createImageData(W, H);
      const data = img.data;
      const rowH = Math.max(2, Math.floor(H / ER_KEEP));
      for (let ri = 0; ri < erRows.length; ri++) {
        const digs = erRows[ri];
        const y0 = ri * rowH, y1 = Math.min(H, y0 + rowH - (rowH > 2 ? 1 : 0));
        for (let di = 0; di < digs.length; di++) {
          const x0 = Math.floor(di * W / ER_W), x1 = Math.max(x0 + 1, Math.floor((di + 1) * W / ER_W));
          const d = digs[di];
          const rgb = d === 2 ? BRIGHT : d === 1 ? AZUR : FAINT;
          const a = d === 2 ? 255 : d === 1 ? 150 : 46;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1 && x < W; x++) {
              const p = (y * W + x) * 4;
              data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2]; data[p + 3] = a;
            }
          }
        }
      }
      g.putImageData(img, 0, 0);
      blit(erHandle, erOff);
    }
    function tickAct4() {
      if (!erScanning) return;
      let last = null;
      for (let i = 0; i < 3 && erN <= ER_MAX; i++, erN++) {
        const digs = ternaryOfPow2(erN);
        erRows.push(digs);
        if (erRows.length > ER_KEEP) erRows.shift();
        last = digs;
        if (!digs.includes(2)) {     // will not happen below 1200 (verified) — but be honest
          erScanning = false;
          erStatus.set(`n = ${erN}: NO digit 2 — a counterexample to Erdős 1979. Publish immediately.`);
          return;
        }
      }
      if (last) {
        const twos = last.reduce((a, d) => a + (d === 2 ? 1 : 0), 0);
        erStatus.set(`n = ${formatBig(erN - 1)} · ${formatBig(erN - 9)} powers checked since 2⁸ · ` +
          `${last.length} ternary digits · 2s in this row: ${twos}`);
      }
      if (erN > ER_MAX) {
        erScanning = false;
        erStatus.set(`checked through n = ${formatBig(ER_MAX)} — every power since 2⁸ showed a 2. ` +
          `No one, anywhere, has ever found a fourth exception. The 15-state machine hunts on.`);
      }
      drawErdos();
    }

    /* --- station 4: the wall --- */
    {
      const s = stationEls[4];
      el('div', 'bvr-note', s,
        'In 2016, Yedidia and Aaronson exhibited a 7,910-state Turing machine whose behavior ' +
        'ZFC — the standard axioms of set theory, the ground floor under nearly all of ' +
        'mathematics — can never determine. Stefan O\'Rear then built one that halts if and ' +
        'only if ZFC is inconsistent — 1,919 states, soon 748; Johannes Riebel, in 2023, ' +
        'brought it to <b>745</b>.');
      el('div', 'bvr-note', s,
        'Now the trap closes. If ZFC is consistent, then by Gödel\'s second incompleteness ' +
        'theorem it cannot prove that this machine runs forever. But knowing ' +
        '<code>BB(745)</code> would prove exactly that: run the machine BB(745) steps; if it has ' +
        'not halted, it never will. Therefore <b>ZFC cannot determine BB(745)</b>. The value ' +
        'exists — it is a specific integer — and the mathematics we live in cannot reach it.');
      el('div', 'bvr-zones', s);
      const zones = s.querySelector('.bvr-zones');
      const z1 = el('div', null, zones, 'BB(1)–BB(5): proved');
      z1.style.cssText = `flex:0 0 24%; background:${P.verdant}`;
      const z2 = el('div', null, zones, 'open country — cryptids, Erdős, Goldbach…');
      z2.style.cssText = `flex:1 1 auto; background:${P.azureDim}`;
      const z3 = el('div', null, zones, '745+ : invisible to ZFC');
      z3.style.cssText = `flex:0 0 30%; background:${P.crimson}`;
      el('div', 'bvr-note', s,
        'Every honest theory has such a horizon: replace ZFC by Peano arithmetic and the wall ' +
        'moves closer; add large-cardinal axioms and it retreats — but by Gödel it never ' +
        'vanishes. 745 states is where ZFC\'s blindness is <em>certified</em>; where it actually ' +
        'begins is open, and the Antihydra is evidence it may begin absurdly close.');
      ui.speculationPanel(s,
        '<p>The Antihydra is <em>believed</em> to run forever on a heuristic: its counter drifts ' +
        'upward like a biased random walk (+2 or −1, roughly even odds), and such walks hit −1 ' +
        'with probability well below one. A drift is not a proof, and no proof is in sight — ' +
        'so it is conceivable that ZFC\'s blindness begins as low as BB(6). Busy-beaver hunters ' +
        'speculate that seven states may already outrun Graham\'s number. None of this is ' +
        'established; all of it is taken seriously by the people who settled BB(5).</p>');
      el('div', 'bvr-note', s,
        'One more thing the number 47,176,870 measured: how mathematics is done now. BB(5) was ' +
        'settled by an open online collaboration — hobbyists and researchers, several known only ' +
        'by handles like mxdys — and the referee of record was a Coq proof script, checkable by ' +
        'anyone, forever. The frontier is a strange place: the theorems are getting too large for ' +
        'journals, and the proofs too honest to need them.');
    }
    goStation(0);

    /* ---------- global caption & sources ---------- */
    ui.caption(stage,
      'Every machine table and record on this page was transcribed from primary sources at build ' +
      'time: the bbchallenge wiki (BB(1)–BB(6), the Antihydra), Stérin–Woods 2021 (the Erdős ' +
      'machine), and Riebel 2023 via Aaronson\'s survey updates (the 745-state ZFC machine). ' +
      'Nothing here is a re-enactment: every diagram is a real run of the real machine.');

    /* ---------- shared loop & lifecycle ---------- */
    function markAllDirty() {
      for (const lane of lanes) lane.dirty = true;
      yourDirty = true; champDirty = true;
      if (activeAct === 3) { drawErdos(); drawHydra(); }
    }
    resetRace();

    const loop = cv.rafLoop((dt) => {
      try {
        if (activeAct === 0) tickAct1();
        else if (activeAct === 1) tickAct2(dt);
        else if (activeAct === 2) tickAct3();
        else tickAct4();
      } catch (err) {
        loop.stop();                       // fail once, quietly — never a console storm
        console.error('beavers exhibit halted (ironically):', err);
      }
    });
    loop.start();
    switchAct(0);

    return {
      pause() {
        loop.stop();
        droneOff();
        bus.mute();
      },
      resume() {
        bus.unmute();
        loop.start();
      },
      destroy() {
        loop.stop();
        if (droneVoice) droneVoice.dispose();
        bus.dispose();
        for (const h of handles) { try { h.destroy(); } catch (e) { /* gone */ } }
        style.remove();
      },
    };
  },
};

/* ==================== tests ==================== */

export const _test = {
  parseTM, runMachine, runFor, newRun, configKey, newVerdictRun, pumpVerdict,
  newStore, pumpSampled,
  CHAMPIONS, ANTIHYDRA, hydraAdvance, ternaryOfPow2, hasTwoInTernary,
  CHECKERS, SAMPLE_PROGRAMS, buildSpite, compileChecker, makeRealRun,
  runSandbox, spiteOutcome,
  towerFloorDigits,
};
