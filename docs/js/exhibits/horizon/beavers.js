// III.3 — 47,176,870
// The busy beaver game: real interpreters running the proven champions, a
// halting-checker defeated by its own source, a five-state workbench with
// sound non-halting proofs, and the cliff walk out to where set theory goes blind.
//
// DATA FIDELITY — every machine table and record below was transcribed from
// primary sources and is re-checked by running it (see selfTest):
//   BB(1)–BB(6) tables, Antihydra:   https://wiki.bbchallenge.org/wiki/BB(5) … BB(6), /Antihydra
//   S(5) record timeline:            wiki.bbchallenge.org/wiki/BB(5) (History table)
//   BB(5) = 47,176,870, 181,385,789 machines, 13 sporadic, ~45 min on 13 cores:
//                                    github.com/ccz181078/Coq-BB5 (CoqBB5/BB5/README.md);
//                                    arXiv:2509.12337; STOC ’26 pp. 565–574, doi:10.1145/3798129.3806376
//   Collatz-like beats of the champion (C(3k) → C(5k+6) …): P. Michel, “Behavior of busy
//                                    beavers” (bbchallenge.org/~pascal.michel/beh); verified here.
//   BB(6) > 2↑↑2↑↑2↑↑10 (mxdys, June 2025); 855 holdouts as of mid-Sept 2026: wiki BB(6)
//   BB(7) > 2↑¹¹2↑¹¹3 (Kropitz, May 2025): wiki BB(7)
//   Erdős machine, 15 states:        Stérin & Woods, arXiv:2107.12475 (RP 2024)
//   ZF independence: 7,910 (2016, ZF+SRP), 1,919 → 748 (O’Rear), 745 (Riebel 2023),
//                    643 (Ridenour, July 2024: scottaaronson.blog/?p=8131), self-reported
//                    432 (ZF, Aug 2025) and 372 (PA, Feb 2026): wiki “Logical independence”
//   Radó 1962 quotations:            BSTJ 41(3):877–884, archive.org/details/bstj41-3-877
//   Brady 1983 quotations:           Math. Comp. 40(162):647–665
//   Schult’s 17-chip machine:        Ludewig, Schult & Wankmüller, Dortmund Bericht 159 (1983)
//   Marxen’s weekend and quotation:  Quanta Magazine, 2 July 2024

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

// `cap` bounds the tape (cells). A run that needs more sets r.overflow and stops.
function newRun(tm, size = 1 << 12, cap = Infinity) {
  const mid = size >> 1;
  return {
    tm, tape: new Int8Array(size), head: mid, origin: mid, state: 0,
    steps: 0, ones: 0, halted: false, minHead: mid, maxHead: mid, cap, overflow: false,
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
    if (r.head < 1 || r.head > r.tape.length - 2) {
      if (r.tape.length * 2 > r.cap) { r.overflow = true; break; }
      growTape(r);
    }
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

/* ---------- proof 1: exact-configuration recurrence (sound, not complete) ----------
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

/* ---------- proof 2: Lin’s partial recurrence (translated cyclers; sound) ----------
   Shen Lin, 1963. Watch the moments the head stands on a cell it has never
   visited, beyond everything to its right (a “right record”). Take two such
   moments t1 < t2 in the same state, let Δ = h2 − h1 > 0 and let m be the
   leftmost cell visited during [t1, t2]. Between t1 and t2 the machine read
   only cells in [m, h2]. If the tape on [m, h1] at t1 equals the tape on
   [m + Δ, h2] at t2 (both have only blanks to the right), then the stretch
   [t2, 2t2 − t1] replays [t1, t2] shifted Δ cells, which re-creates the same
   condition — so it repeats forever and never halts. Left records mirror it. */

const LIN_WIN = 256;      // how far back a record’s snapshot reaches
const LIN_KEEP = 40;      // open records kept per side

function newLin() { return { R: [], L: [], work: 0 }; }

// Call after every single step; pminRel/pmaxRel are the extremes (relative to
// the origin) before that step. Returns a proof object or null.
function linObserve(lin, r, pminRel, pmaxRel) {
  const h = r.head - r.origin;
  const RR = lin.R, LL = lin.L;
  // running extremes since each open record; the lists are ordered by time,
  // so only a suffix can change.
  for (let i = RR.length - 1; i >= 0 && RR[i].m > h; i--) RR[i].m = h;
  for (let i = LL.length - 1; i >= 0 && LL[i].m < h; i--) LL[i].m = h;
  if (h > pmaxRel) return linRecord(lin, r, RR, 1);
  if (h < pminRel) return linRecord(lin, r, LL, -1);
  return null;
}

function linRecord(lin, r, list, dir) {
  const o = r.origin, t = r.tape, h = r.head - o, s = r.state, W = LIN_WIN;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.s !== s) continue;
    const reach = dir > 0 ? e.h - e.m : e.m - e.h;
    if (reach > W) continue;
    const d = h - e.h;
    const lo = dir > 0 ? e.m : e.h, hi = dir > 0 ? e.h : e.m;
    let ok = true;
    for (let x = lo; x <= hi; x++) {
      lin.work++;
      const old = e.snap[dir > 0 ? W - (e.h - x) : x - e.h];
      const idx = x + d + o;
      const cur = idx >= 0 && idx < t.length ? t[idx] : 0;
      if (old !== cur) { ok = false; break; }
    }
    if (ok) return { kind: 'lin', from: e.t, at: r.steps, period: r.steps - e.t, shift: d };
  }
  const snap = new Uint8Array(W + 1);
  for (let k = 0; k <= W; k++) {
    const idx = dir > 0 ? r.head - W + k : r.head + k;
    snap[k] = idx >= 0 && idx < t.length ? t[idx] : 0;
  }
  list.push({ t: r.steps, s, h, m: h, snap });
  if (list.length > LIN_KEEP) list.shift();
  return null;
}

const CYCLE_STEPS = 10000;     // exact-recurrence watch
const LIN_STEPS = 200000;      // translated-cycler watch
const LIN_WORK = 4e7;          // comparison budget, so no machine can stall a frame
const TAPE_CAP = 1 << 24;      // 16,777,216 cells; beyond that, "ran off the page"

function newVerdictRun(code, budget = 1e8, cap = TAPE_CAP) {
  return {
    r: newRun(parseTM(code), 1 << 12, cap), budget,
    phase: 'cycle', seen: new Map(), lin: newLin(),
    verdict: null, cyc: null, reason: null,
  };
}

// Advance a verdict run by up to frameBudget steps; sets v.verdict when known:
// 'halt' | 'nonhalt' (a sound proof: exact or translated recurrence) |
// 'unknown' (budget exhausted, or the tape outgrew its cap: v.reason = 'tape').
// Optional `store`: capture space-time rows at exact sample boundaries.
function pumpVerdict(v, frameBudget, store = null) {
  const r = v.r;
  let left = frameBudget;
  if (v.phase === 'cycle') {
    const lim = Math.min(LIN_STEPS, v.budget);
    while (left > 0 && !r.halted && r.steps < lim) {
      const pmin = r.minHead - r.origin, pmax = r.maxHead - r.origin;
      if (runFor(r, 1) === 0) break;              // tape overflow
      left--;
      if (store && r.steps >= store.next) sampleRow(store, r);
      if (r.halted) break;
      if (v.seen) {
        if (r.steps <= CYCLE_STEPS) {
          const key = configKey(r);
          if (key !== null) {
            const prev = v.seen.get(key);
            if (prev !== undefined) {
              v.verdict = 'nonhalt';
              v.cyc = { kind: 'exact', from: prev, at: r.steps, period: r.steps - prev, shift: 0 };
              break;
            }
            v.seen.set(key, r.steps);
          }
        } else v.seen = null;
      }
      if (v.lin) {
        const hit = linObserve(v.lin, r, pmin, pmax);
        if (hit) { v.verdict = 'nonhalt'; v.cyc = hit; break; }
        if (v.lin.work > LIN_WORK) v.lin = null;
      }
    }
    if (!v.verdict) {
      if (r.halted) v.verdict = 'halt';
      else if (r.overflow) { v.verdict = 'unknown'; v.reason = 'tape'; }
      else if (r.steps >= v.budget) v.verdict = 'unknown';
      else if (r.steps >= lim) { v.phase = 'macro'; v.seen = null; v.lin = null; }
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
    else if (r.overflow) { v.verdict = 'unknown'; v.reason = 'tape'; }
    else if (r.steps >= v.budget) v.verdict = 'unknown';
  }
  if (store && (r.halted || v.verdict) &&
      (!store.rows.length || store.rows[store.rows.length - 1].step !== r.steps)) {
    sampleRow(store, r);
  }
  return frameBudget - left;
}

/* ---------- space-time row store (pure; typed arrays only) ----------
   A row is one snapshot of the tape, stored as a density per bin (0–255), so a
   machine that marches off across millions of cells still costs at most
   MAX_BINS bytes a row. Bins are powers of two aligned to the origin; up to 8
   cells a bin is counted exactly, beyond that estimated from 8 samples.
   A store samples every `interval` steps (halving its rows and doubling the
   interval when full) or, if opts.schedule is given, exactly at those steps. */

const MAX_BINS = 2048;

function newStore(maxRows = 260, interval = 1, opts = {}) {
  return {
    rows: [], maxRows, interval, next: 0,
    schedule: opts.schedule || null, si: 0, maxBins: opts.maxBins || MAX_BINS,
  };
}

function sampleRow(store, r) {
  const t = r.tape, o = r.origin, L = r.minHead, R = r.maxHead;
  const span = R - L + 1;
  let bin = 1;
  while (span > bin * store.maxBins) bin *= 2;
  const rel0 = Math.floor((L - o) / bin) * bin;
  const a0 = rel0 + o;
  const nb = Math.max(1, Math.ceil((R + 1 - a0) / bin));
  const data = new Uint8Array(nb);
  if (bin === 1) {
    for (let k = 0; k < nb; k++) data[k] = t[a0 + k] ? 255 : 0;
  } else if (bin <= 8) {
    for (let k = 0; k < nb; k++) {
      const s0 = a0 + k * bin, e0 = Math.min(s0 + bin, R + 1);
      let c = 0;
      for (let x = Math.max(s0, L); x < e0; x++) c += t[x];
      data[k] = Math.round(255 * c / bin);
    }
  } else {
    const stride = bin / 8;
    for (let k = 0; k < nb; k++) {
      const s0 = a0 + k * bin;
      let c = 0;
      for (let q = 0; q < 8; q++) {
        const x = s0 + Math.floor((q + 0.5) * stride);
        if (x >= L && x <= R) c += t[x];
      }
      data[k] = Math.round(255 * c / 8);
    }
  }
  store.rows.push({ step: r.steps, off: rel0, bin, data, head: r.head - o, state: r.state });
  if (store.schedule) {
    const sc = store.schedule;
    while (store.si < sc.length && sc[store.si] <= r.steps) store.si++;
    store.next = store.si < sc.length ? sc[store.si] : Infinity;
    return;
  }
  store.next = r.steps + store.interval;
  if (store.rows.length > store.maxRows) {          // decimate: halve, stretch
    store.rows = store.rows.filter((_, i) => (i & 1) === 0);
    store.interval *= 2;
    store.next = store.rows[store.rows.length - 1].step + store.interval;
  }
}

// Run up to `budget` steps, capturing rows exactly at sample boundaries.
// `store` may be one store or an array of stores fed by the same run.
function pumpSampled(r, store, budget) {
  const stores = Array.isArray(store) ? store : [store];
  let left = budget;
  while (left > 0 && !r.halted) {
    let nx = Infinity;
    for (const s of stores) if (s.next < nx) nx = s.next;
    const k = Math.min(left, Math.max(1, nx - r.steps));
    const did = runFor(r, k);
    left -= did;
    for (const s of stores) if (r.steps >= s.next) sampleRow(s, r);
    if (did === 0) break;
  }
  if (r.halted) {
    for (const s of stores) {
      if (!s.rows.length || s.rows[s.rows.length - 1].step !== r.steps) sampleRow(s, r);
    }
  }
  return budget - left;
}

/* ==================== champions (transcribed, verified) ==================== */
// Sources: wiki.bbchallenge.org/wiki/BB(1) … BB(5). The BB(5) table matches
// Marxen–Buntrock’s machine symbol for symbol.

export const CHAMPIONS = [
  { n: 1, steps: 1, ones: 1, code: '1RZ---',
    who: 'write a 1, step right, stop' },
  { n: 2, steps: 6, ones: 4, code: '1RB1LB_1LA1RZ',
    who: 'Radó, 1962' },
  { n: 3, steps: 21, ones: null, code: '1RB1RZ_1LB0RC_1LC1LA',
    who: 'proved by Shen Lin, 1963' },
  { n: 4, steps: 107, ones: 13, code: '1RB1LB_1LA0LC_1RZ1LD_1RD0RA',
    who: 'proved by Allen Brady, 1983' },
  { n: 5, steps: 47176870, ones: 4098, code: '1RB1LC_1RC1RB_1RD0LE_1LA1LD_1RZ0LA',
    who: 'found by Marxen and Buntrock, September 1989 · proved by bbchallenge in Coq, 2024' },
];

// The champion as a Collatz-like game (Buro, RWTH Aachen TR 146, Nov 1990; Michel 1993). Let C(n) be
// “state A, on the blank just left of a solid block of n ones”. Then
//   C(3k)     → C(5k + 6)  in 5k² + 19k + 15 steps
//   C(3k + 1) → C(5k + 9)  in 5k² + 25k + 27 steps
//   C(3k + 2) → halt       in 6k + 12 steps, leaving k + 4 ones.
// From C(0) (the blank tape) the counts run 0, 6, 16, …, 12,284, and the step
// counts add up to exactly 47,176,870. selfTest checks every beat against the
// interpreter.
export function championBeats() {
  const seq = [0], beats = [];
  let x = 0, t = 0, finalOnes = 0, lastSweep = 0;
  for (;;) {
    const k = Math.floor(x / 3), m = x % 3;
    if (m === 0) { t += 5 * k * k + 19 * k + 15; x = 5 * k + 6; }
    else if (m === 1) { t += 5 * k * k + 25 * k + 27; x = 5 * k + 9; }
    else { lastSweep = 6 * k + 12; t += lastSweep; finalOnes = k + 4; break; }
    seq.push(x); beats.push(t);
  }
  return { seq, beats, total: t, finalOnes, lastSweep };
}

// Is the run exactly at C(n)? (state A, reading the blank at the left edge of
// everything visited, a solid block of n ones to its right, nothing beyond.)
function atBeat(r, n) {
  const t = r.tape, h = r.head;
  if (r.state !== 0 || t[h] !== 0 || h !== r.minHead || r.ones !== n) return false;
  for (let i = 1; i <= n; i++) if (t[h + i] !== 1) return false;
  return true;
}

// S(5) lower bounds over time (wiki.bbchallenge.org/wiki/BB(5), History).
export const S5_RECORDS = [
  { year: 1964.87, date: 'Nov 1964', steps: 79, who: 'Green' },
  { year: 1972.6, date: 'Aug 1972', steps: 435, who: 'Lynn' },
  { year: 1973.87, date: 'Nov 1973', steps: 992, who: 'Weimann' },
  { year: 1974.5, date: '1974', steps: 7706, who: 'Lynn' },
  { year: 1982.6, date: 'Aug 1982', steps: 134467, who: 'Schult' },
  { year: 1984.95, date: 'Dec 1984', steps: 2133492, who: 'Uhing' },
  { year: 1986.1, date: 'Feb 1986', steps: 2358064, who: 'Uhing' },
  { year: 1989.6, date: 'Aug 1989', steps: 11798826, who: 'Marxen & Buntrock' },
  { year: 1989.7, date: 'Sep 1989', steps: 23554764, who: 'Marxen & Buntrock' },
  { year: 1989.72, date: 'Sep 1989', steps: 47176870, who: 'Marxen & Buntrock' },
];

// Antihydra — 6-state cryptid, first reported by mxdys on 28 June 2024.
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

// The heuristic: a fair walker stepping +2 or −1 from height c ever reaches −1
// with probability ((√5 − 1)/2)^(c + 1) (wiki: Antihydra, Trajectory).
// Returns log10 of that probability.
export function hydraFallLog10(c) {
  return (c + 1) * Math.log10((Math.sqrt(5) - 1) / 2);
}

// A step count as a share of the record, readable at any size:
// 107 → "0.00023%", 1 → "0.0000021%", 23,554,764 → "49.93%".
export function pctOf(steps, champ = 47176870) {
  if (steps >= champ) return steps === champ ? '100%' : (100 * steps / champ).toFixed(2) + '%';
  const p = 100 * steps / champ;
  if (p <= 0) return '0%';
  if (p >= 0.01) return p.toFixed(2) + '%';
  return p.toFixed(Math.min(20, 1 - Math.floor(Math.log10(p)))) + '%';
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

const PROSE = `
    <p>In May 1962, in the pages of the <em>Bell System Technical Journal</em>, Tibor Radó asked
    a question with a child’s rules and no bottom. Build a machine with <em>n</em> states and two
    symbols; give it a tape of zeros stretching to both horizons; let each state say what to
    write, which way to step and where to go next, for each symbol it might read. Most such
    machines tumble into eternity, spinning in place or marching off along the tape forever. Some
    halt. Among the halting ones, one stops <em>last</em>, and its step count is the busy beaver
    number <code>BB(n)</code>. There are finitely many machines of each size (Radó counted them,
    [4(<em>n</em> + 1)]<sup>2<em>n</em></sup>, which for five states is 63,403,380,965,376), so
    the number exists, exactly, for every <em>n</em>. The game defines a sequence of perfectly
    ordinary whole numbers, and no algorithm, however clever, can compute it.</p>
    <p>Radó built the game to teach. A Hungarian analyst at Ohio State, he had begun his
    mathematics in a prisoner-of-war camp in Siberia under a fellow prisoner, Eduard Helly, and in
    1930 had solved Plateau’s problem of the soap film. He said <em>cards</em> instead of
    <em>states</em>, he explained, because such words “had a mysterious connotation for
    beginners.” He wrote rules for an International Busy Beaver Club whose umpire need only run
    your machine for the number of steps you claimed: “a decidable issue.” A halt can be refereed;
    a forever cannot. He ended with a road trip. A foreman told him to turn left “after you cross
    the last steel bridge,” and the directions were useless until a workman added that there was
    no other steel bridge “until you reach Richmond, 130 miles away.” Every busy beaver number is
    a last steel bridge.</p>
    <p>The sequence opens gently: <code>BB(1) = 1</code>, <code>BB(2) = 6</code>,
    <code>BB(3) = 21</code> (Radó’s student Shen Lin, 1963), <code>BB(4) = 107</code> (Allen
    Brady, 1983). Then the floor gives way. In September 1989 Heiner Marxen, who had hunted
    beavers with Jürgen Buntrock as a graduate student in Berlin, left a search running over a
    weekend on his employer’s new computer and came back to a five-state machine that stops after
    <em>47,176,870</em> steps. “After several hours I stopped debugging,” he later wrote, “and
    started to have a strange feeling.” Whether anything with five states runs longer stayed open
    for almost thirty-five years, and the meaning of <em>proof</em> changed while it waited. Brady
    had settled four states by examining his last 218 holdouts “by means of voluminous printouts
    of their histories,” until it was “determined to the author’s satisfaction that none of these
    machines will ever stop.” On 2 July 2024 the bbchallenge collaboration, an open online
    community, most of its members without traditional academic credentials and some known only
    by handles, announced that every five-state machine had been decided, each shown either to
    halt within 47,176,870 steps or never to halt, and a proof in the Coq proof assistant certified
    the verdict: <code>BB(5) = 47,176,870</code>. The
    run itself had never been in doubt; any umpire could check it. What became a theorem was its
    solitude.</p>
    <p>Why can’t we simply keep going? Because a program that computed <code>BB</code> would
    decide the undecidable: to learn whether an <em>n</em>-state machine halts, compute
    <code>BB(n)</code> and run the machine that long; if it is still going, it never stops. So
    <code>BB</code> eventually outgrows <em>every</em> function any program can compute. The
    diagonal that stepped out of Cantor’s list and hid inside Gödel’s sentence in
    <a href="#ex-loop">The Strange Loop</a> detonates a third time here, and the first panel lets
    you pull the pin yourself: choose a halting-checker, its full source on the table, and the
    page will assemble, out of the checker’s own code, a small program that does the opposite of
    whatever the checker predicts. You will watch an honest program be wrong, every time, for a
    reason you can read. Radó himself took the other road. “No enumeration of computable
    functions is used,” he wrote, “and in this sense the diagonal process is not employed”; his
    proof needs only the principle that a finite set of whole numbers has a largest element. Both
    roads end at the same wall.</p>
    <p>Past five states the sequence does not so much grow as leave. The six-state champion,
    found in June 2025 by mxdys, the pseudonymous contributor who assembled the Coq proof, runs
    for more than <code>2↑↑2↑↑2↑↑10</code> steps, beyond even <code>2↑↑↑5</code>. Six states also
    shelter the <em>Antihydra</em>, found in June 2024: a machine that halts if, and only if, a
    sequence made by multiplying by three halves and rounding down ever turns up more than twice
    as many odd numbers as even ones, and no one yet knows how to decide whether it will. Fifteen
    states suffice to encode a 1979 conjecture of Erdős about the ternary digits of powers of two.
    And a few hundred states are enough for a machine that halts if and only if the axioms beneath
    nearly all of mathematics contradict themselves: it took 1,919 states in 2016 and 643 by July
    2024. If those axioms
    are consistent, Gödel’s second theorem forbids them to prove that such a machine runs
    forever, so they can never pin down its busy beaver number. The busy beaver numbers are not a
    puzzle inside mathematics; they are a ruler laid against its outer wall.</p>
    <p>Below: first the defeat, so the wall is felt before it is measured. Then the preserve,
    where all five proven champions run to their appointed ends and the fifth shows the
    arithmetic hidden in its stride. Then a workbench, five states of your own against
    47,176,870, judged by the same two tests that opened the proof’s pipeline. And then the cliff
    walk, out past the towers, to the place where the numbers still sit, exact as ever, where no
    theory we trust can reach them.</p>`;

const CHRONICLE = [
  { year: 1962, date: 'May 1962', text: 'Tibor Radó’s <em>On Non-Computable Functions</em> appears in the <em>Bell System Technical Journal</em>, introducing the Busy Beaver game, which he had made up “to familiarize beginners with the idea of a Turing machine.”' },
  { year: 1963, date: '1963', text: 'In his Ohio State dissertation, Radó’s student Shen Lin proves that no halting three-state Turing machine runs longer than 21 steps, and gives the first method for recognising machines that repeat themselves while drifting along the tape.' },
  { year: 1983, date: '1983', text: 'Allen Brady publishes the proof that halting four-state machines run at most 107 steps; his last 218 holdouts were examined “by means of voluminous printouts of their histories.”' },
  { year: 1989, date: 'September 1989', text: 'Heiner Marxen and Jürgen Buntrock find a five-state Turing machine that halts after 47,176,870 steps, leaving 4,098 ones on its tape.' },
  { year: 2016, date: 'May 2016', text: 'Adam Yedidia and Scott Aaronson build a 7,910-state machine whose fate set theory cannot settle if a large-cardinal extension of it is consistent; that same month Stefan O’Rear builds a 1,919-state machine that simply hunts for a contradiction in ZF.' },
  { year: 2024, date: '2 July 2024', text: 'The bbchallenge collaboration announces that BB(5) = 47,176,870, certified by a proof in the Coq proof assistant that settles every five-state machine.' },
  { year: 2025, date: 'June 2025', text: 'The pseudonymous mxdys finds a six-state Turing machine that runs for more than 2↑↑2↑↑2↑↑10 steps, beyond pentation’s 2↑↑↑5.' },
  { year: 2026, date: '9 June 2026', text: 'The determination of the fifth busy beaver value is published at STOC, the ACM’s Symposium on Theory of Computing, with a pseudonym, mxdys, on its byline.' },
];

const TODAY = `
    <p>In June 2026 the proof that <code>BB(5) = 47,176,870</code> appeared in the proceedings of
    STOC, the ACM’s Symposium on Theory of Computing, and one of the names on its byline is simply
    <em>mxdys</em>. The certificate enumerates 181,385,789 five-state machines and settles every
    one: 48,379,894 halt and 133,005,895 never do. Deciders that were themselves proved correct
    inside the proof settle all but thirteen, and those thirteen have proofs of their own. On
    thirteen cores the whole thing re-checks in about forty-five minutes. The proof assistant it
    was written in, Coq, has since been renamed Rocq; what it means to trust such a checker is the
    subject of <a href="#ex-telescope">The Telescope</a>.</p>
    <p>The frontier has moved to six states. As of mid-September 2026 the bbchallenge wiki lists
    855 six-state machines, counted up to equivalence, whose fate is still unknown, every one
    already simulated past ten trillion steps. Among them sits the Antihydra, whose halting turns
    on the parities of ⌊<em>K</em>·(3/2)<sup><em>n</em></sup>⌋ for a fixed <em>K</em>, the same
    species of question Kurt Mahler asked about powers of 3/2 in 1968, still unanswered. The far
    wall is creeping closer too: the smallest machine known to escape set theory fell from 1,919
    states in 2016 to 643 in 2024, and newer constructions posted by their builders claim 432
    states for ZF (2025) and 372 for Peano arithmetic (2026). None of these machines has yet been
    formally verified.</p>
    <p>The workbench’s three verdicts (halts, provably never halts, cannot tell) are also how
    software gets checked. The termination prover that Byron Cook, Andreas Podelski and Andrey
    Rybalchenko presented in 2006 was run on device-driver code from Windows, and a sound tool of
    its kind says <em>terminates</em> only when it has found an argument. Undecidability never
    stopped anyone building checkers; it only guaranteed that the honest ones must sometimes say
    <em>unknown</em>. The same snapshot-and-compare verdict returns in
    <a href="#ex-learner">The Descent</a>, where a perceptron given XOR comes back to exactly where
    it started and is thereby proved to cycle forever.</p>`;

const SOURCES = [
  { text: 'Tibor Radó, “On Non-Computable Functions”, <em>Bell System Technical Journal</em> 41(3):877–884 (May 1962)', url: 'https://archive.org/details/bstj41-3-877' },
  { text: 'Shen Lin &amp; Tibor Radó, “Computer Studies of Turing Machine Problems”, <em>Journal of the ACM</em> 12(2):196–212 (1965)', url: 'https://doi.org/10.1145/321264.321270' },
  { text: 'Allen H. Brady, “The determination of the value of Rado’s noncomputable function Σ(k) for four-state Turing machines”, <em>Mathematics of Computation</em> 40(162):647–665 (1983)', url: 'https://doi.org/10.1090/S0025-5718-1983-0689479-6' },
  { text: 'Jochen Ludewig, Uwe Schult &amp; Frank Wankmüller, “Chasing the Busy-Beaver: Notes and Observations on a Competition to Find the 5-State Busy Beaver”, Universität Dortmund, Bericht 159 (1983)', url: 'https://docs.bbchallenge.org/other/lud20.pdf' },
  { text: 'Heiner Marxen &amp; Jürgen Buntrock, “Attacking the Busy Beaver 5”, <em>Bulletin of the EATCS</em> 40:247–251 (1990)', url: 'https://turbotm.de/~heiner/BB/mabu90.html' },
  { text: 'Scott Aaronson, “The Busy Beaver Frontier”, <em>ACM SIGACT News</em> 51(3):32–54 (2020)', url: 'https://www.scottaaronson.com/papers/bb.pdf' },
  { text: 'The bbchallenge Collaboration et al., “Determination of the Fifth Busy Beaver Value”, <em>Proceedings of STOC ’26</em>, 565–574 (2026)', url: 'https://doi.org/10.1145/3798129.3806376' },
  { text: 'Tristan Stérin &amp; Damien Woods, “Hardness of Busy Beaver Value BB(15)”, <em>Reachability Problems</em>, LNCS (2024)', url: 'https://arxiv.org/abs/2107.12475' },
  { text: 'Ben Brubaker, “With Fifth Busy Beaver, Researchers Approach Computation’s Limits”, <em>Quanta Magazine</em> (2 July 2024)', url: 'https://www.quantamagazine.org/amateur-mathematicians-find-fifth-busy-beaver-turing-machine-20240702/' },
  { text: 'The bbchallenge wiki, “Antihydra” (and the pages on BB(6) and logical independence)', url: 'https://wiki.bbchallenge.org/wiki/Antihydra' },
];

const ALT = 'Four acts on one stage: three halting-checkers with their source code, each defeated by a program built from its own text; the five proven champion Turing machines running as space-time diagrams, the fifth for 47,176,870 steps with its fourteen returns home marked and counted; a five-state workbench that returns halted, proved non-halting or unknown beside the champion’s diagram; and a walk along a logarithmic ruler of machine sizes, through a record ladder, a tetration staircase, the Antihydra’s random-looking walk, powers of two in base three and the wall where set theory goes blind.';

export default {
  id: 'beavers',
  movement: 3,
  title: '47,176,870',
  hook: 'Five states, two symbols, one blank tape — and the exact number of steps they can take before halting took six decades and a Coq proof to pin down. The number after it may be unknowable.',
  era: '1962–2026 · Columbus, Dortmund, Berlin and bbchallenge.org',
  prose: PROSE,
  chronicle: CHRONICLE,
  today: TODAY,
  sources: SOURCES,
  alt: ALT,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const bus = audio.createBus('beavers');
    const handles = [];          // canvas handles to destroy
    const CHAMP = 47176870;
    const BEAT = championBeats();
    const EDGES = [0, ...BEAT.beats, BEAT.total];        // 16 edges, 15 bands
    const BEAT_ROWS = 22;
    const BEAT_SCHED = (() => {
      const out = [];
      for (let i = 0; i + 1 < EDGES.length; i++) {
        const a = EDGES[i], b = EDGES[i + 1];
        for (let j = 0; j < BEAT_ROWS; j++) {
          const s = a + Math.floor(j * (b - a) / BEAT_ROWS);
          if (!out.length || s > out[out.length - 1]) out.push(s);
        }
      }
      out.push(BEAT.total);
      return out;
    })();
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch (e) { /* default */ }
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* no media queries */ }
    const STATE_COL = [P.ink, P.azure, P.verdigris, P.crimsonBright, P.inkDim, P.goldBright];
    const RES_COL = [P.azure, P.goldBright, P.crimsonBright];    // count mod 3
    const narrowNow = () => (stage.clientWidth || 800) < 560;
    const fmt = (x) => formatBig(x);
    const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-beavers .bvr-tabs { display:flex; flex-wrap:wrap; gap:.1rem 1.15rem; margin:.1rem 0 1.15rem;
        border-bottom:1px solid ${P.line}; }
      #ex-beavers .bvr-tab { appearance:none; background:none; border:0; border-bottom:2px solid transparent;
        margin:0 0 -1px; padding:.5rem .05rem .55rem; color:${P.inkDim}; font:inherit; font-size:.98rem;
        cursor:pointer; letter-spacing:.01em; font-style:italic; }
      #ex-beavers .bvr-tab .bvr-num { font-style:normal; font-variant:small-caps; letter-spacing:.08em;
        color:${P.inkFaint}; margin-right:.4em; }
      #ex-beavers .bvr-tab:hover { color:${P.ink}; }
      #ex-beavers .bvr-tab[aria-selected="true"] { color:${P.goldBright}; border-bottom-color:var(--mv, ${P.crimson}); }
      #ex-beavers .bvr-tab[aria-selected="true"] .bvr-num { color:var(--mv-bright, ${P.crimsonBright}); }
      #ex-beavers .bvr-tab:focus-visible { outline:1px solid ${P.gold}; outline-offset:3px; }
      #ex-beavers .bvr-panel { display:none; }
      #ex-beavers .bvr-panel.on { display:block; }
      #ex-beavers pre.bvr-src { background:${P.bg}; border:1px solid ${P.line}; border-radius:6px;
        padding:.6rem .8rem; overflow-x:auto; font:0.74rem/1.6 ${MONO}; color:${P.ink}; margin:.5rem 0;
        white-space:pre; max-width:100%; }
      #ex-beavers .bvr-cards { display:flex; flex-direction:column; gap:.7rem; margin:.7rem 0; }
      #ex-beavers .bvr-card { border:1px solid ${P.line}; border-radius:8px; padding:.65rem .85rem;
        cursor:pointer; background:rgba(22,25,37,.55); transition:border-color .25s, box-shadow .25s; min-width:0;
        display:grid; grid-template-columns:minmax(0, 14.5rem) minmax(0, 1fr); grid-template-rows:auto 1fr;
        column-gap:1.1rem; }
      #ex-beavers .bvr-card h4 { grid-column:1; grid-row:1; }
      #ex-beavers .bvr-card .bvr-blurb { grid-column:1; grid-row:2; }
      #ex-beavers .bvr-card pre.bvr-src { grid-column:2; grid-row:1 / span 2; margin:0; align-self:center; }
      @media (max-width:700px) {
        #ex-beavers .bvr-card { display:block; }
        #ex-beavers .bvr-card pre.bvr-src { margin:.5rem 0 .2rem; }
      }
      #ex-beavers .bvr-card:hover { border-color:${P.goldDim}; }
      #ex-beavers .bvr-card:focus-visible { outline:1px solid ${P.gold}; outline-offset:2px; }
      #ex-beavers .bvr-card.sel { border-color:${P.gold}; box-shadow:0 0 0 1px ${P.goldDim} inset, 0 0 18px ${P.gold}22; }
      #ex-beavers .bvr-card h4 { margin:.05rem 0 .25rem; color:${P.goldBright}; font-size:1rem; font-weight:500;
        font-style:italic; }
      #ex-beavers .bvr-card .bvr-blurb { color:${P.inkDim}; font-size:.86rem; line-height:1.45; }
      #ex-beavers table.bvr-verdicts { width:100%; border-collapse:collapse; font:.78rem ${MONO}; margin:.5rem 0; }
      #ex-beavers table.bvr-verdicts td, #ex-beavers table.bvr-verdicts th {
        border-bottom:1px solid ${P.line}; padding:.35rem .5rem; text-align:left; color:${P.inkDim}; }
      #ex-beavers table.bvr-verdicts th { color:${P.inkFaint}; font:italic .8rem ${SERIF}; }
      #ex-beavers .bvr-loopcount { font:1.3rem ${MONO}; color:${P.azure}; margin:.45rem 0; min-height:1.6em;
        font-variant-numeric:tabular-nums; }
      #ex-beavers .bvr-score { font:.95rem ${SERIF}; color:${P.inkDim}; margin:.6rem 0 .2rem; }
      #ex-beavers .bvr-score b { font:600 1.05rem ${MONO}; color:var(--mv-bright, ${P.crimsonBright}); }
      #ex-beavers .bvr-lanes { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:.9rem;
        margin:.9rem 0 .4rem; }
      @media (max-width:620px) { #ex-beavers .bvr-lanes { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
      #ex-beavers .bvr-mini { min-width:0; border-top:1px solid ${P.line}; padding-top:.45rem; }
      #ex-beavers .bvr-mini canvas { background:transparent !important; }
      #ex-beavers .bvr-lab { font:.72rem/1.5 ${MONO}; color:${P.inkDim}; margin-top:.35rem; min-height:3.2em;
        font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
      #ex-beavers .bvr-lab .bvr-who { font:italic .8rem/1.35 ${SERIF}; color:${P.inkFaint}; }
      #ex-beavers .bvr-bighead { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between;
        gap:.3rem 1rem; margin:1rem 0 .45rem; border-top:1px solid ${P.line}; padding-top:.6rem; }
      #ex-beavers .bvr-bigtitle { font:1.05rem ${SERIF}; color:${P.ink}; }
      #ex-beavers .bvr-bigtitle b { font:600 1.05rem ${MONO}; color:${P.goldBright}; font-variant-numeric:tabular-nums; }
      #ex-beavers .bvr-code { font:.72rem ${MONO}; color:${P.azure}; background:${P.bg}; border:1px solid ${P.line};
        border-radius:4px; padding:.1rem .35rem; margin-left:.35rem; overflow-wrap:anywhere; }
      @media (max-width:560px) { #ex-beavers .bvr-code { display:block; width:max-content; max-width:100%;
        margin:.35rem 0 0; font-size:.64rem; } }
      #ex-beavers .bvr-bigstat { font:.8rem ${MONO}; color:${P.inkDim}; font-variant-numeric:tabular-nums; }
      #ex-beavers .bvr-viewrow { display:flex; flex-wrap:wrap; align-items:center; gap:.4rem 1rem; margin:.1rem 0 .5rem; }
      #ex-beavers .bvr-viewnote { font:italic .84rem ${SERIF}; color:${P.inkFaint}; }
      #ex-beavers .bvr-ribbon { display:flex; flex-wrap:wrap; align-items:center; gap:.35rem .25rem;
        margin:.75rem 0 .3rem; font:.74rem/1 ${MONO}; font-variant-numeric:tabular-nums; }
      #ex-beavers .bvr-chip { padding:.3rem .45rem; border:1px solid ${P.line}; border-radius:999px;
        color:${P.inkFaint}; transition:color .35s, border-color .35s, background-color .35s; }
      #ex-beavers .bvr-chip.on.r0 { color:${P.azure}; border-color:${P.azureDim}; }
      #ex-beavers .bvr-chip.on.r1 { color:${P.goldBright}; border-color:${P.goldDim}; }
      #ex-beavers .bvr-chip.on.r2 { color:${P.crimsonBright}; border-color:${P.crimson}; }
      #ex-beavers .bvr-chip.cur { background:rgba(232,200,124,.12); }
      #ex-beavers .bvr-chip.halt.on { color:${P.bg}; background:${P.crimsonBright}; border-color:${P.crimsonBright}; }
      #ex-beavers .bvr-arrow { color:${P.inkGhost}; font-size:.7rem; }
      #ex-beavers .bvr-key { font:.74rem/1.5 ${MONO}; color:${P.inkFaint}; margin:.25rem 0 0; }
      #ex-beavers .bvr-key i { font-style:normal; }
      #ex-beavers .bvr-key span { white-space:nowrap; }
      #ex-beavers .bvr-key.bvr-rkey { font:italic .86rem/1.55 ${SERIF}; margin:.45rem 0 .2rem; }
      #ex-beavers .bvr-key.bvr-rkey span { white-space:normal; }
      #ex-beavers .bvr-key.bvr-rkey i { font-size:.8em; margin-right:.15em; }
      #ex-beavers .controls.bvr-nav { display:grid; grid-template-columns:auto minmax(0, 1fr) auto;
        align-items:center; column-gap:.9rem; }
      #ex-beavers .bvr-nav .bvr-stitle { text-align:center; }
      @media (min-width:640px) { #ex-beavers .controls.bvr-nav { grid-template-columns:auto auto auto; justify-content:start; }
        #ex-beavers .bvr-nav .bvr-stitle { text-align:left; } }
      #ex-beavers .bvr-editor { overflow-x:auto; max-width:100%; }
      #ex-beavers .bvr-bench { display:grid; grid-template-columns:auto minmax(0, 1fr); gap:.2rem 1.8rem;
        align-items:start; }
      #ex-beavers .bvr-side { padding-top:.6rem; min-width:0; }
      @media (max-width:720px) { #ex-beavers .bvr-bench { display:block; } }
      #ex-beavers .bvr-editor table { border-collapse:collapse; margin:.7rem 0; }
      #ex-beavers .bvr-editor td, #ex-beavers .bvr-editor th { border-bottom:1px solid ${P.line};
        padding:.3rem .4rem; text-align:center; }
      #ex-beavers .bvr-editor th { color:${P.inkFaint}; font:italic .82rem ${SERIF}; font-weight:400; }
      #ex-beavers .bvr-editor .bvr-st { color:${P.goldBright}; font:600 .9rem ${MONO}; }
      #ex-beavers .bvr-editor select { background:${P.bg}; color:${P.ink}; border:1px solid ${P.line};
        border-radius:4px; font:.8rem ${MONO}; padding:2px 1px; margin:0 1px; }
      #ex-beavers .bvr-editor select:focus-visible { outline:1px solid ${P.gold}; }
      #ex-beavers .bvr-pair { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem;
        margin:.6rem 0; }
      #ex-beavers .bvr-pair > div { min-width:0; }
      #ex-beavers .bvr-pairlab { font:italic .9rem ${SERIF}; color:${P.inkDim}; margin:.2rem 0 .35rem; }
      #ex-beavers .bvr-pairlab b { font:600 .85rem ${MONO}; font-style:normal; color:${P.goldBright}; }
      #ex-beavers .bvr-verdict { font:.95rem/1.55 ${SERIF}; color:${P.ink}; margin:.6rem 0; min-height:1.6em; }
      #ex-beavers .bvr-verdict code { font-size:.78rem; overflow-wrap:anywhere; }
      #ex-beavers .bvr-stamp { display:inline-block; font:600 .72rem ${MONO}; letter-spacing:.09em;
        padding:.2rem .5rem; border:1px solid currentColor; border-radius:3px; margin-right:.5rem;
        vertical-align:.08em; }
      #ex-beavers .bvr-note { color:${P.inkDim}; font-size:.9rem; font-style:italic; margin:.55rem 0; line-height:1.55; }
      #ex-beavers .bvr-station { display:none; }
      #ex-beavers .bvr-station.on { display:block; }
      #ex-beavers .bvr-stitle { font:italic 1rem ${SERIF}; color:${P.inkDim}; }
      #ex-beavers .bvr-stitle em { color:${P.goldBright}; white-space:nowrap; }
      #ex-beavers .bvr-ruler { cursor:pointer; }
      #ex-beavers .bvr-tower { display:flex; flex-direction:column-reverse; gap:6px; margin:.9rem 0; }
      #ex-beavers .bvr-floor { display:grid; grid-template-columns:4.6rem minmax(0, 1fr); gap:.2rem .8rem;
        align-items:center; font:.8rem ${MONO}; color:${P.ink}; font-variant-numeric:tabular-nums; }
      #ex-beavers .bvr-floor .bvr-fk { color:${P.inkFaint}; font:italic .85rem ${SERIF}; }
      #ex-beavers .bvr-floor .bvr-fv { overflow-wrap:anywhere; }
      #ex-beavers .bvr-floor .bvr-fv b { color:${P.goldBright}; font-weight:500; }
      #ex-beavers .bvr-gauge { grid-column:2; height:6px; background:${P.bg}; border:1px solid ${P.line};
        border-radius:3px; overflow:hidden; position:relative; }
      #ex-beavers .bvr-gauge i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg, ${P.goldDim}, ${P.goldBright}); }
      #ex-beavers .bvr-floor.bvr-surrender .bvr-fv { color:${P.crimsonBright}; }
      #ex-beavers .bvr-floor.bvr-surrender .bvr-gauge { border-color:${P.crimson}; }
      #ex-beavers .bvr-floor.bvr-surrender .bvr-gauge i { right:0; background:repeating-linear-gradient(135deg,
        ${P.crimson} 0 5px, transparent 5px 9px); }
      #ex-beavers .bvr-bignum { font:2.3rem ${MONO}; color:${P.goldBright}; letter-spacing:.04em; text-align:center;
        margin:1rem 0 .3rem; text-shadow:0 0 22px ${P.gold}44; font-variant-numeric:tabular-nums; }
      #ex-beavers .bvr-bigsub { text-align:center; font:italic .95rem ${SERIF}; color:${P.inkDim}; margin:0 0 .6rem; }
      #ex-beavers table.bvr-tm { border-collapse:collapse; font:.8rem ${MONO}; margin:.7rem auto; }
      #ex-beavers table.bvr-tm td, #ex-beavers table.bvr-tm th { border-bottom:1px solid ${P.line};
        padding:.28rem .7rem; color:${P.ink}; text-align:center; }
      #ex-beavers table.bvr-tm th { color:${P.inkFaint}; font:italic .8rem ${SERIF}; }
      #ex-beavers .bvr-ok { color:${P.verdant}; }
      #ex-beavers .bvr-bad { color:${P.crimsonBright}; }
      #ex-beavers .bvr-open { color:${P.azure}; }
      #ex-beavers .bvr-unk { color:${P.inkFaint}; }
      #ex-beavers .bvr-gold { color:${P.goldBright}; }
      #ex-beavers .readout { font-variant-numeric:tabular-nums; }
      @media (prefers-reduced-motion: reduce) { #ex-beavers .bvr-chip, #ex-beavers .bvr-card { transition:none; } }
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
    const AZUR = hexRgb(P.azureDim), BRIGHT = hexRgb(P.goldBright), FAINT = hexRgb(P.inkFaint);
    const glowGold = cv.glowSprite(P.goldBright, 32);
    const glowCrim = cv.glowSprite(P.crimsonBright, 32);
    const glowVerd = cv.glowSprite(P.verdant, 32);

    // Tone ramp for density: sqrt-mapped goldDim → gold → goldBright, alpha rising with it.
    const RAMP = (() => {
      const lo = hexRgb(P.goldDim), mid = hexRgb(P.gold), hi = hexRgb(P.goldBright);
      const top = mid.map((v, k) => v + (hi[k] - v) * 0.45);   // solid ink: warm, not glaring
      const lut = new Uint8ClampedArray(256 * 4);
      for (let i = 1; i < 256; i++) {
        const t = Math.sqrt(i / 255);
        const [a, b, u] = t < 0.72 ? [lo, mid, t / 0.72] : [mid, top, (t - 0.72) / 0.28];
        for (let k = 0; k < 3; k++) lut[i * 4 + k] = a[k] + (b[k] - a[k]) * u;
        lut[i * 4 + 3] = 255 * (0.3 + 0.6 * t);
      }
      return lut;
    })();

    // Render a row store into an offscreen canvas as a space-time diagram.
    // `bands`: optional function rows → array of row-index arrays; each band gets
    // an equal height and its own horizontal scale. Returns head marks (device px).
    function renderStore(off, store, wCss, hCss, dpr, bands = null) {
      const W = Math.max(2, Math.round(wCss * dpr));
      const H = Math.max(2, Math.round(hCss * dpr));
      if (off.width !== W || off.height !== H) { off.width = W; off.height = H; off._img = null; }
      const g = off.getContext('2d');
      if (!off._img) off._img = g.createImageData(W, H);
      const img = off._img, data = img.data;
      data.fill(0);
      const rows = store.rows;
      const heads = [];
      const col = new Float32Array(W);
      const groups = rows.length ? (bands ? bands(rows) : [rows.map((_, i) => i)]) : [];
      const nb = Math.max(1, groups.length);
      groups.forEach((idxs, b) => {
        if (!idxs.length) return;
        const by0 = Math.floor(b * H / nb), by1 = Math.floor((b + 1) * H / nb);
        let lo = Infinity, hi = -Infinity;
        for (const i of idxs) {
          const row = rows[i];
          lo = Math.min(lo, row.off, row.head);
          hi = Math.max(hi, row.off + row.data.length * row.bin - 1, row.head);
        }
        const span = Math.max(1, hi - lo + 1), scale = W / span;
        const rh = (by1 - by0) / idxs.length;
        idxs.forEach((i, j) => {
          const row = rows[i], d = row.data, bin = row.bin;
          const y0 = by0 + Math.floor(j * rh), y1 = Math.min(by1, Math.max(y0 + 1, by0 + Math.floor((j + 1) * rh)));
          col.fill(0);
          for (let k = 0; k < d.length; k++) {
            const v = d[k];
            if (!v) continue;
            const dens = v / 255;
            const x0 = (row.off + k * bin - lo) * scale, x1 = x0 + bin * scale;
            let px = Math.max(0, Math.floor(x0));
            const pe = Math.min(W, Math.ceil(x1));
            if (pe - px <= 1) { if (px < W) col[px] += dens * (x1 - x0); }
            else for (; px < pe; px++) col[px] += dens * (Math.min(px + 1, x1) - Math.max(px, x0));
          }
          for (let x = 0; x < W; x++) {
            const v = col[x];
            if (v < 0.004) continue;
            const li = Math.min(255, Math.max(1, Math.round(Math.min(1, v) * 255))) * 4;
            for (let y = y0; y < y1; y++) {
              const p = (y * W + x) * 4;
              data[p] = RAMP[li]; data[p + 1] = RAMP[li + 1]; data[p + 2] = RAMP[li + 2]; data[p + 3] = RAMP[li + 3];
            }
          }
          heads.push({ x: (row.head - lo + 0.5) * scale, w: Math.max(1, scale), y0, y1, state: row.state, step: row.step });
        });
      });
      g.putImageData(img, 0, 0);
      return heads;
    }

    function blit(handle, off) {
      const { ctx, width, height } = handle;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, width, height);
    }

    // Head marks, coloured by state (A ink, B azure, C verdigris, D vermilion, E dim; halt gold).
    function drawHeads(handle, heads, alpha = 0.9) {
      const { ctx, dpr } = handle;
      ctx.save();
      ctx.globalAlpha = alpha;
      for (const h of heads) {
        ctx.fillStyle = h.state < 0 ? P.goldBright : STATE_COL[h.state % STATE_COL.length];
        const w = Math.max(1, Math.min(4, h.w)) / dpr;
        ctx.fillRect(h.x / dpr - w / 2, h.y0 / dpr, w, Math.max(1 / dpr, (h.y1 - h.y0) / dpr));
      }
      ctx.restore();
    }

    // A label with a quiet dark backing, so it reads over ink.
    function pill(ctx, text, x, y, color, font, align = 'right') {
      ctx.font = font;
      const w = ctx.measureText(text).width;
      const bx = align === 'right' ? x - w - 5 : align === 'center' ? x - w / 2 - 3 : x - 2;
      ctx.fillStyle = 'rgba(10,11,16,.78)';
      ctx.fillRect(bx, y - 7, w + 6, 14);
      ctx.fillStyle = color;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.fillText(text, align === 'right' ? x - 2 : x, y + 0.5);
    }

    function tmTable(code) {
      const tm = parseTM(code);
      const rows = code.split('_');
      let h = '<table class="bvr-tm"><tr><th></th><th>read 0</th><th>read 1</th></tr>';
      for (let s = 0; s < tm.n; s++) {
        const c0 = rows[s].slice(0, 3), c1 = rows[s].slice(3, 6) || '---';
        const f = (t) => t === '---' ? '<span class="bvr-unk">halt</span>'
          : /Z|H/.test(t[2]) ? `<span class="bvr-gold">${t}</span>` : t;
        h += `<tr><td class="bvr-gold">${String.fromCharCode(65 + s)}</td><td>${f(c0)}</td><td>${f(c1)}</td></tr>`;
      }
      return h + '</table>';
    }

    const chime = (freq, when = 0, level = 0.28, dur = 0.5) => {
      if (!bus.context) return;
      audio.playTone(bus, { freq, dur, level, when: bus.context.currentTime + when, type: 'sine' });
    };
    const wood = (pitch, level) => {
      if (!audio.getContext() || !bus.context) return;
      audio.drums.wood(bus, bus.context.currentTime, { pitch, level });
    };

    /* ---------- tabs ---------- */
    const tabsRow = el('div', 'bvr-tabs', stage);
    tabsRow.setAttribute('role', 'tablist');
    tabsRow.setAttribute('aria-label', 'Acts of the exhibit');
    const TABS = [['I', 'the defeat'], ['II', 'the preserve'], ['III', 'beat the beaver'], ['IV', 'the cliff walk']];
    const panels = [];
    const tabBtns = [];
    let activeAct = 0;
    TABS.forEach(([num, name], i) => {
      const b = el('button', 'bvr-tab', tabsRow, `<span class="bvr-num">${num}</span>${name}`);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.id = `bvr-tab-${i}`;
      b.addEventListener('click', () => switchAct(i));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const j = (i + (e.key === 'ArrowRight' ? 1 : 3)) % 4;
          switchAct(j); tabBtns[j].focus();
        }
      });
      tabBtns.push(b);
    });
    TABS.forEach((_, i) => {
      const p = el('div', 'bvr-panel', stage);
      p.id = `bvr-panel-${i}`;
      tabBtns[i].setAttribute('aria-controls', p.id);
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', `bvr-tab-${i}`);
      panels.push(p);
    });
    function switchAct(i) {
      if (i === activeAct && panels[i].classList.contains('on')) return;
      if (activeAct === 1 && i !== 1) droneOff();
      activeAct = i;
      panels.forEach((p, j) => p.classList.toggle('on', j === i));
      tabBtns.forEach((b, j) => {
        b.setAttribute('aria-selected', String(j === i));
        b.tabIndex = j === i ? 0 : -1;
      });
      markAllDirty();
    }

    /* ================= ACT I — the defeat ================= */
    const act1 = panels[0];
    el('div', 'bvr-note', act1,
      'Three halting-checkers, their source code on the table. Each is an honest, total procedure: ' +
      'it always answers, and on the little programs below it always answers correctly. Pick one.');

    const cards = el('div', 'bvr-cards', act1);
    let chosen = -1;
    const cardEls = CHECKERS.map((ch, i) => {
      const c = el('div', 'bvr-card', cards);
      c.setAttribute('role', 'button');
      c.tabIndex = 0;
      c.setAttribute('aria-pressed', 'false');
      el('h4', null, c, ch.name);
      el('div', 'bvr-blurb', c, ch.blurb);
      el('pre', 'bvr-src', c).textContent = ch.src;
      c.addEventListener('click', () => pickChecker(i));
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickChecker(i); }
      });
      return c;
    });

    const trialWrap = el('div', null, act1);
    trialWrap.style.display = 'none';
    const trialTitle = el('div', 'bvr-note', trialWrap);
    const trialTable = el('table', 'bvr-verdicts', trialWrap);
    const nemesisControls = ui.controlRow(trialWrap);
    ui.button(nemesisControls, 'assemble its nemesis', assembleNemesis, { primary: true });

    const nemesisWrap = el('div', null, act1);
    nemesisWrap.style.display = 'none';
    const nemesisPre = el('pre', 'bvr-src', nemesisWrap);
    el('div', 'bvr-note', nemesisWrap,
      'One template, the checker’s own source spliced in, and the fatal question asked of ' +
      '<code>SRC</code>, this very program’s text. Note the honest <code>while (true)</code> ' +
      'sitting in plain view.');
    const runRow = ui.controlRow(nemesisWrap);
    ui.button(runRow, 'ask, then run it', runNemesis, { primary: true });
    const stopWatchBtn = ui.button(runRow, 'stop watching', stopWatching);
    stopWatchBtn.style.display = 'none';
    const predictEl = ui.readout(nemesisWrap, '');
    const loopCountEl = el('div', 'bvr-loopcount', nemesisWrap);
    loopCountEl.setAttribute('aria-live', 'polite');
    const defeatEl = el('div', 'bvr-verdict', nemesisWrap);
    const scoreEl = el('div', 'bvr-score', act1, '');
    const closingEl = el('div', 'bvr-note', act1);
    closingEl.style.display = 'none';

    let spiteSrc = null, spiteGen = null, spiteTicks = 0, prediction = null;
    let watching = false, resolved = false, defeats = 0;

    function pickChecker(i) {
      chosen = i;
      cardEls.forEach((c, j) => {
        c.classList.toggle('sel', j === i);
        c.setAttribute('aria-pressed', String(j === i));
      });
      stopWatching();
      nemesisWrap.style.display = 'none';
      predictEl.set(''); loopCountEl.textContent = ''; defeatEl.innerHTML = '';
      trialWrap.style.display = '';
      trialTitle.innerHTML = `<em>${CHECKERS[i].name}</em> on the warm-up programs, all correct:`;
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
      resolved = false; prediction = null; spiteTicks = 0;
      wood(660, 0.4);
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
      // A HALTS prediction is refuted once the loop is plainly running; a LOOPS
      // prediction is refuted only by the halt itself, so stopping early proves nothing.
      if (watching && !resolved && prediction === 'halts' && spiteTicks > 0) resolveDefeat(false);
      watching = false; spiteGen = null;
      stopWatchBtn.style.display = 'none';
      if (spiteTicks > 0 && resolved && prediction === 'halts') {
        loopCountEl.textContent =
          `stopped watching at ${fmt(spiteTicks)} iterations; it had not stopped looping`;
      }
    }

    function resolveDefeat(halted) {
      if (resolved) return;
      resolved = true; defeats++;
      if (bus.context && audio.getContext()) {
        const t = bus.context.currentTime;
        audio.playTone(bus, { freq: 392, dur: 0.7, level: 0.2, when: t });
        audio.playTone(bus, { freq: 554.37, dur: 0.7, level: 0.2, when: t + 0.04 });
      }
      defeatEl.innerHTML = halted
        ? `It said <b class="bvr-open">LOOPS</b>, and the program promptly ` +
          `<b class="bvr-ok">HALTED</b>, after ${plural(spiteTicks, 'step', 'steps')}. Wrong.`
        : `It said <b class="bvr-ok">HALTS</b>, and the program is looping before your eyes. ` +
          `Its <em>only</em> exit required the verdict LOOPS. It will never stop. Wrong.`;
      scoreEl.innerHTML = `score: <b>the diagonal ${defeats}</b> · checkers 0`;
      closingEl.style.display = '';
      closingEl.innerHTML =
        'Nothing here exploited a weakness. The nemesis asks its judge about itself and does the ' +
        'opposite, so <em>any</em> total checker, however sophisticated, is wrong on some program ' +
        'built from its own source. That is the heart of the paper the London Mathematical Society ' +
        'received from Alan Turing on 28 May 1936, though Turing never speaks of halting: his ' +
        'well-behaved machines were the ones that ran forever, printing digits, and he proved that ' +
        '“there can be no general process” for telling them from the ones that stall. A ' +
        'quarter-century later Radó turned the virtue inside out and crowned the machine that stops ' +
        'last. You just ran the argument, and it is why the busy beaver numbers cannot be computed, ' +
        'only, one by one and at enormous cost, <em>known</em>.';
    }

    function tickAct1() {
      if (!watching || !spiteGen) return;
      try {
        for (let i = 0; i < 6000; i++) {
          spiteTicks++;
          if (spiteGen.next().done) {
            watching = false; spiteGen = null;
            loopCountEl.textContent = `halted after ${plural(spiteTicks, 'step', 'steps')}`;
            resolveDefeat(true);
            return;
          }
        }
      } catch (e) {
        watching = false; spiteGen = null;
        loopCountEl.textContent = 'the program crashed, which is a halt';
        resolveDefeat(true);
        return;
      }
      loopCountEl.textContent = `${fmt(spiteTicks)} iterations and counting…`;
      if (!resolved && spiteTicks >= 12000 && prediction === 'halts') {
        resolveDefeat(false);
        stopWatchBtn.style.display = '';
      }
    }

    /* ================= ACT II — the preserve ================= */
    const act2 = panels[1];
    const QUEST2 = 'Release the five proven champions. BB(5) wants the full throttle, or press ' +
      '<em>next homecoming</em> and walk it beat by beat.';
    const raceQuest = ui.questBanner(act2, QUEST2);

    const raceControls = ui.controlRow(act2);
    const releaseBtn = ui.button(raceControls, '▶ release the beavers', releaseBeavers, { primary: true });
    const holdBtn = ui.button(raceControls, '⏸ hold', toggleHold);
    ui.button(raceControls, 'step ×1', stepOnce);
    ui.button(raceControls, 'next homecoming', nextBeat);
    const speedSl = ui.slider(raceControls, {
      label: 'throttle (steps/sec)', min: 1, max: 7.7, step: 0.05, value: 1.4,
      format: (v) => fmt(Math.round(Math.pow(10, v))),
    });
    ui.button(raceControls, 'full throttle', () => { speedSl.set(7.7); });

    const laneRow = el('div', 'bvr-lanes', act2);
    const lanes = CHAMPIONS.map((meta) => {
      const lane = { meta, run: null, store: null, beatStore: null, dirty: false, lastRender: 0,
        off: document.createElement('canvas'), handle: null, labEl: null };
      if (meta.n < 5) {
        const wrap = el('div', 'bvr-mini', laneRow);
        lane.handle = cv.setupCanvas(wrap, { height: 118 });
        lane.labEl = el('div', 'bvr-lab', wrap);
      }
      return lane;
    });
    const bigLane = lanes[4];
    const bigHead = el('div', 'bvr-bighead', act2);
    el('div', 'bvr-bigtitle', bigHead,
      `<b>BB(5) = 47,176,870</b><span class="bvr-code">${CHAMPIONS[4].code}</span>`);
    bigLane.labEl = el('div', 'bvr-bigstat', bigHead);
    const viewRow = el('div', 'bvr-viewrow', act2);
    let beatView = false;
    ui.toggle(viewRow, { label: 'beat time', value: false, onChange: (v) => { beatView = v; bigLane.dirty = true; viewNote.innerHTML = viewText(); } });
    const viewText = () => beatView
      ? 'Each of the fifteen stretches between homecomings gets an equal band, drawn to its own width.'
      : 'Clock time: one row per slice of the run, all at one scale.';
    const viewNote = el('div', 'bvr-viewnote', viewRow, viewText());
    const bigWrap = el('div', null, act2);
    bigLane.handle = cv.setupCanvas(bigWrap, { height: narrowNow() ? 300 : 360 });
    lanes.forEach((l) => {
      handles.push(l.handle);
      l.handle.onResize(() => { l.dirty = true; });
    });

    // The Collatz-like ribbon: the count of ones at each homecoming, coloured by its remainder mod 3.
    const ribbon = el('div', 'bvr-ribbon', act2);
    ribbon.setAttribute('aria-label', 'The counts at each homecoming');
    const chips = BEAT.seq.map((n, j) => {
      if (j) el('span', 'bvr-arrow', ribbon, '→').setAttribute('aria-hidden', 'true');
      return el('span', `bvr-chip r${n % 3}`, ribbon, fmt(n));
    });
    el('span', 'bvr-arrow', ribbon, '→').setAttribute('aria-hidden', 'true');
    const haltChip = el('span', 'bvr-chip halt', ribbon, 'halt');
    el('div', 'bvr-key', act2,
      `<span><i style="color:${P.azure}">●</i> 3k → 5k + 6</span> · ` +
      `<span><i style="color:${P.goldBright}">●</i> 3k + 1 → 5k + 9</span> · ` +
      `<span><i style="color:${P.crimsonBright}">●</i> 3k + 2 → halt</span>`);
    const beatRead = ui.readout(act2, '');
    beatRead.el.style.display = 'none';
    let chipsShown = -2;

    ui.caption(act2,
      'Space-time diagrams: each row is the tape at one moment, time running downward; gold marks ' +
      'the 1s, brighter where they crowd, and a coloured tick marks the head (white is state A, blue ' +
      'B, green C, red D, grey E). Watch the champion come home. Fourteen times it returns to state A ' +
      'on the blank just left of a solid block of ones, 6 of them, then 16, 34, 64, and on to 12,284, ' +
      'and each time what it does next depends only on that count divided by three. A multiple of ' +
      'three, 3<i>k</i>, becomes 5<i>k</i> + 6; one more, 3<i>k</i> + 1, becomes 5<i>k</i> + 9; two ' +
      'more, and it stops, after sweeping the ones into a lace of <code>001</code> repeated 4,095 times. ' +
      'It is a small Collatz-like game played with a single number, worked out by Buro in an ' +
      'Aachen report of November 1990 and, independently, by Pascal Michel in 1993; press <em>next homecoming</em> and the ' +
      'interpreter on this page checks each beat against the arithmetic. Uwe Schult, who won the ' +
      '1983 Dortmund busy beaver competition, hunted with a Turing machine he had built from seventeen ' +
      'off-the-shelf chips on a board plugged into his Apple II. It ran about four and a half million ' +
      'steps a second. At full throttle this page runs about ten times faster, in a browser tab.');

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
        if (lane.meta.n === 5) {
          lane.store = newStore(260, Math.ceil(CHAMP / 258));
          lane.beatStore = newStore(BEAT_SCHED.length + 2, 1, { schedule: BEAT_SCHED });
          sampleRow(lane.store, lane.run);
          sampleRow(lane.beatStore, lane.run);
        } else {
          lane.store = newStore(130, 1);
          sampleRow(lane.store, lane.run);
        }
        lane.dirty = true;
        lane.lastRender = 0;
      }
      raceAcc = 0;
      chipsShown = -2;
      raceQuest.set(QUEST2);
    }
    const laneStores = (lane) => (lane.meta.n === 5 ? [lane.store, lane.beatStore] : lane.store);
    function pumpLane(lane, n) {
      if (lane.run.halted) return;
      pumpSampled(lane.run, laneStores(lane), n);
      lane.dirty = true;
      if (lane.run.halted) laneHalted(lane);
    }

    function releaseBeavers() {
      audio.ensureAudio();
      resetRace();
      raceStarted = true;
      racePlaying = true;
      holdBtn.textContent = '⏸ hold';
      releaseBtn.textContent = '↻ release again';
      beatRead.el.style.display = 'none';
      wood(880, 0.4);
      droneOn();
    }
    function startHeld() {
      releaseBeavers();
      racePlaying = false;
      holdBtn.textContent = '▶ resume';
      droneOff();
    }

    function toggleHold() {
      if (!raceStarted) return;
      audio.ensureAudio();
      racePlaying = !racePlaying;
      holdBtn.textContent = racePlaying ? '⏸ hold' : '▶ resume';
      if (!racePlaying) droneOff();
      else if (!bigLane.run.halted) droneOn();
    }

    function stepOnce() {
      if (!raceStarted) startHeld();
      audio.ensureAudio();
      for (const lane of lanes) pumpLane(lane, 1);
    }

    // Advance every lane to the champion's next homecoming, then check the
    // interpreter's configuration against the arithmetic.
    function nextBeat() {
      if (!raceStarted || bigLane.run.halted) startHeld();
      audio.ensureAudio();
      if (racePlaying) toggleHold();
      const r = bigLane.run;
      const j = BEAT.beats.findIndex((b) => b > r.steps);
      const target = j < 0 ? BEAT.total : BEAT.beats[j];
      const n = target - r.steps;
      for (const lane of lanes) pumpLane(lane, n);
      beatRead.el.style.display = '';
      if (j < 0 || r.halted) {
        beatRead.setHTML(`step ${fmt(r.steps)} · halted with ${fmt(r.ones)} ones, as the rule said: ` +
          `12,284 = 3 × 4,094 + 2, so 6 × 4,094 + 12 = 24,576 more steps and 4,094 + 4 = 4,098 ones.`);
        return;
      }
      const cnt = BEAT.seq[j + 1], k = Math.floor(cnt / 3), m = cnt % 3;
      const ok = atBeat(r, cnt);
      const head = `step ${fmt(r.steps)} · ` + (ok
        ? `home: state A, on the blank just left of ${fmt(cnt)} ones <span class="bvr-ok">✓</span> `
        : `<span class="bvr-bad">the interpreter disagrees with the rule here ✗</span> `);
      const rule = m === 0
        ? `${fmt(cnt)} = 3 × ${fmt(k)}, so next comes 5 × ${fmt(k)} + 6 = <b>${fmt(5 * k + 6)}</b>, ${fmt(5 * k * k + 19 * k + 15)} steps away.`
        : m === 1
          ? `${fmt(cnt)} = 3 × ${fmt(k)} + 1, so next comes 5 × ${fmt(k)} + 9 = <b>${fmt(5 * k + 9)}</b>, ${fmt(5 * k * k + 25 * k + 27)} steps away.`
          : `${fmt(cnt)} = 3 × ${fmt(k)} + 2, a remainder of two at last: ${fmt(6 * k + 12)} more steps, then halt, with ${fmt(k + 4)} ones.`;
      beatRead.setHTML(head + rule);
      chime(220 * Math.pow(2, (j % 12) / 12), 0, 0.2, 0.35);
    }

    function laneHalted(lane) {
      chime(261.63 * Math.pow(2, lane.meta.n / 4), 0, 0.26);
      if (lane.meta.n === 5) {
        racePlaying = false;
        holdBtn.textContent = '▶ resume';
        droneOff();
        chime(523.25, 0.1, 0.3); chime(659.25, 0.22, 0.3); chime(783.99, 0.34, 0.3, 0.9);
        raceQuest.done('47,176,870 steps · 4,098 ones, and nothing with five states runs longer. ' +
          'That last part is the theorem.');
      } else {
        wood(440 + 120 * lane.meta.n, 0.3);
      }
    }

    function laneLabel(lane) {
      const m = lane.meta, r = lane.run;
      const status = !r ? '' : r.halted
        ? `<span class="bvr-ok">✓ ${plural(r.steps, 'step', 'steps')} · ${plural(r.ones, 'one', 'ones')}</span>`
        : `${fmt(r.steps)} / ${fmt(m.steps)} steps`;
      if (m.n === 5) {
        const pct = r ? Math.min(100, (r.steps / m.steps) * 100) : 0;
        return `${status}${r && !r.halted ? ` · ${pct.toFixed(1)}%` : ''}`;
      }
      return `<b class="bvr-gold">BB(${m.n}) = ${m.steps}</b><br>${status}<br>` +
        `<span class="bvr-who">${m.who}</span>`;
    }

    // Short runs as beads: one rounded cell per tape square, one row per step.
    // Only for stores whose rows are consecutive steps at one cell per bin.
    const BEAD_ROWS = 130, BEAD_SPAN = 72;
    function beadable(store) {
      const rows = store.rows;
      if (store.interval !== 1 || !rows.length || rows.length > BEAD_ROWS) return false;
      let lo = Infinity, hi = -Infinity;
      for (const row of rows) {
        if (row.bin !== 1) return false;
        lo = Math.min(lo, row.off, row.head);
        hi = Math.max(hi, row.off + row.data.length - 1, row.head);
      }
      return hi - lo + 1 <= BEAD_SPAN;
    }
    function drawBeads(lane) { drawBeadRows(lane.handle, lane.store.rows, lane.run.halted); }
    function drawBeadRows(hd, rows, halted, maxCell = 13) {
      const { ctx } = hd;
      const W = hd.width, H = hd.height;
      ctx.clearRect(0, 0, W, H);
      if (!rows.length || W < 20 || H < 20) return;
      let lo = Infinity, hi = -Infinity;
      for (const row of rows) {
        lo = Math.min(lo, row.off, row.head);
        hi = Math.max(hi, row.off + row.data.length - 1, row.head);
      }
      const span = hi - lo + 1, n = rows.length;
      const cw = Math.max(0.5, Math.min((W - 6) / span, maxCell));
      const rh = Math.max(0.3, Math.min((H - 6) / n, maxCell));
      const x0 = (W - cw * span) / 2, y0 = (H - rh * n) / 2;
      // gaps only where both directions have room; thin rows read as a continuous weave
      const gx = cw >= 5 && rh >= 4 ? 1.2 : 0, gy = rh >= 4 ? 1.2 : 0;
      const round = cw >= 5 && rh >= 5 && typeof ctx.roundRect === 'function';
      // the visited stretch of tape, faintly
      ctx.fillStyle = 'rgba(169,164,147,0.07)';
      rows.forEach((row, i) => {
        ctx.fillRect(x0 + (row.off - lo) * cw, y0 + i * rh + gy / 2, row.data.length * cw, Math.max(0.3, rh - gy));
      });
      ctx.fillStyle = P.gold;
      ctx.beginPath();
      rows.forEach((row, i) => {
        const d = row.data;
        for (let k = 0; k < d.length; k++) {
          if (!d[k]) continue;
          const x = x0 + (row.off + k - lo) * cw + gx / 2, y = y0 + i * rh + gy / 2;
          const w = Math.max(0.5, cw - gx), h = Math.max(0.3, rh - gy);
          if (round) ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.32); else ctx.rect(x, y, w, h);
        }
      });
      ctx.fill();
      // the head: a ring (or a tick) in the colour of its state
      rows.forEach((row, i) => {
        const x = x0 + (row.head - lo) * cw, y = y0 + i * rh;
        const c = row.state < 0 ? P.goldBright : STATE_COL[row.state % STATE_COL.length];
        if (cw >= 5 && rh >= 5) {
          ctx.strokeStyle = c; ctx.lineWidth = 1.2;
          ctx.strokeRect(x + 0.6, y + 0.6, Math.max(0, cw - 1.2), Math.max(0, rh - 1.2));
        } else {
          ctx.fillStyle = c;
          ctx.fillRect(x + cw / 2 - 0.75, y, 1.5, Math.max(0.6, rh));
        }
      });
      if (halted) {
        const last = rows[rows.length - 1];
        glowGold.draw(ctx, x0 + (last.head - lo + 0.5) * cw, y0 + (n - 0.5) * rh, 0.9);
      }
    }

    function bandsOf(rows) {
      const groups = Array.from({ length: EDGES.length - 1 }, () => []);
      let b = 0;
      rows.forEach((row, i) => {
        while (b < groups.length - 1 && row.step >= EDGES[b + 1]) b++;
        groups[b].push(i);
      });
      return groups;
    }

    function renderBig() {
      const lane = bigLane, hd = lane.handle, { ctx } = hd;
      const W = hd.width, H = hd.height;
      const r = lane.run;
      const store = beatView ? lane.beatStore : lane.store;
      const heads = renderStore(lane.off, store, W, H, hd.dpr, beatView ? bandsOf : null);
      blit(hd, lane.off);
      if (r.steps > 0) drawHeads(hd, heads, beatView ? 0.95 : 0.75);
      // the live head, or the final one
      if (heads.length && r.steps > 0) {
        const h = heads[heads.length - 1];
        const gx = h.x / hd.dpr, gy = h.y1 / hd.dpr;
        if (r.halted) glowGold.draw(ctx, gx, Math.min(H - 2, gy), 1.1);
        else if (racePlaying && !reduced) glowCrim.draw(ctx, gx, Math.min(H - 2, gy), 0.7);
      }
      const narrow = W < 480;
      const monoF = `10px ${MONO}`;
      ctx.save();
      if (!beatView) {
        // step scale on the left
        ctx.strokeStyle = 'rgba(169,164,147,.35)'; ctx.lineWidth = 1;
        for (let s = 1e7; s < CHAMP; s += 1e7) {
          const y = Math.round((s / CHAMP) * H) + 0.5;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(6, y); ctx.stroke();
          pill(ctx, `${s / 1e6}M`, 9, y, P.inkFaint, monoF, 'left');
        }
        // the homecomings passed so far
        // the homecomings passed so far: a hairline each; labels where there is room,
        // and the crowd at the very top (the first ten fit in 2% of the run) summarised
        const TOPZ = 24;
        let lastY = Infinity, crowd = [];
        for (let j = BEAT.beats.length - 1; j >= 0; j--) {
          const s = BEAT.beats[j];
          if (s > r.steps) continue;
          const y = Math.round((s / CHAMP) * H) + 0.5, cnt = BEAT.seq[j + 1];
          ctx.strokeStyle = RES_COL[cnt % 3]; ctx.globalAlpha = 0.45;
          ctx.beginPath(); ctx.moveTo(W * (narrow ? 0.55 : 0.7), y); ctx.lineTo(W, y); ctx.stroke();
          ctx.globalAlpha = 1;
          if (y < TOPZ) { crowd.unshift(cnt); continue; }
          if (lastY - y >= 14) {
            pill(ctx, fmt(cnt), W - 3, Math.min(H - 8, y), RES_COL[cnt % 3], monoF, 'right');
            lastY = y;
          }
        }
        if (crowd.length) {
          const txt = crowd.length === 1 ? fmt(crowd[0])
            : `${fmt(crowd[0])} … ${fmt(crowd[crowd.length - 1])}` + (narrow ? '' : ` (${crowd.length} homecomings)`);
          pill(ctx, txt, W - 3, 9, P.inkDim, monoF, 'right');
        }
      } else {
        // one band per stretch between homecomings
        const nb = EDGES.length - 1;
        for (let b = 0; b < nb; b++) {
          if (EDGES[b] > r.steps) break;
          const y0 = (b * H) / nb, y1 = ((b + 1) * H) / nb, ym = (y0 + y1) / 2;
          if (b) {
            ctx.strokeStyle = 'rgba(169,164,147,.28)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, Math.round(y0) + 0.5); ctx.lineTo(W, Math.round(y0) + 0.5); ctx.stroke();
          }
          if (y1 - y0 >= 12) {
            const a = BEAT.seq[b], nxt = b + 1 < BEAT.seq.length ? fmt(BEAT.seq[b + 1]) : 'halt';
            pill(ctx, `${fmt(a)} → ${nxt}`, W - 3, ym, RES_COL[a % 3], monoF, 'right');
            if (!narrow) pill(ctx, `${fmt(EDGES[b + 1] - EDGES[b])} steps`, 4, ym, P.inkFaint, monoF, 'left');
          }
        }
      }
      if (!r.steps) {
        ctx.fillStyle = P.inkFaint; ctx.font = `italic 15px ${SERIF}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('a blank tape, waiting', W / 2, H / 2);
      }
      ctx.restore();
    }

    function renderLane(lane, now) {
      if (lane.meta.n === 5) renderBig(); else drawBeads(lane);
      lane.labEl.innerHTML = laneLabel(lane);
      lane.dirty = false;
      lane.lastRender = now;
    }

    function updateRibbon() {
      const r = bigLane.run;
      let passed = 0;
      if (r && (raceStarted || r.steps > 0)) {
        passed = 1;
        for (const b of BEAT.beats) if (r.steps >= b) passed++;
      }
      const halted = !!(r && r.halted);
      const key = passed * 2 + (halted ? 1 : 0);
      if (key === chipsShown) return;
      chipsShown = key;
      chips.forEach((c, j) => {
        c.classList.toggle('on', j < passed);
        c.classList.toggle('cur', j === passed - 1 && !halted);
      });
      haltChip.classList.toggle('on', halted);
    }

    function tickAct2(dt) {
      if (racePlaying && raceStarted) {
        const sps = Math.pow(10, speedSl.value);
        raceAcc += sps * dt;
        let n = Math.floor(raceAcc);
        if (n > 0) {
          raceAcc -= n;
          n = Math.min(n, 2500000);
          for (const lane of lanes) pumpLane(lane, n);
        }
        if (!bigLane.run.halted && droneVoice) {
          droneOn();                 // recovers after a lifecycle pause
          droneVoice.setFreq(60 * Math.pow(2, 3.2 * (bigLane.run.steps / CHAMP)), 0.08);
        }
      }
      const now = performance.now() / 1000;
      for (const lane of lanes) {
        if (lane.run && lane.dirty && (now - lane.lastRender > 0.14 || lane.run.halted || !racePlaying)) {
          renderLane(lane, now);
        }
      }
      updateRibbon();
    }

    /* ================= ACT III — beat the beaver ================= */
    const act3 = panels[2];
    const beatQuest = ui.questBanner(act3,
      'Five states of your own. Make them outlast <b>47,176,870</b>, or learn, honestly, why you cannot.');

    const bench = el('div', 'bvr-bench', act3);
    const editor = el('div', 'bvr-editor', bench);
    const edTable = el('table', null, editor);
    const edCells = [];       // [state][sym] = {w, d, nx} selects
    {
      const hr = el('tr', null, edTable);
      el('th', null, hr, 'state'); el('th', null, hr, 'reading 0'); el('th', null, hr, 'reading 1');
      for (let s = 0; s < 5; s++) {
        const tr = el('tr', null, edTable);
        const S = String.fromCharCode(65 + s);
        el('td', 'bvr-st', tr, S);
        edCells.push([0, 1].map((sym) => {
          const td = el('td', null, tr);
          const mk = (opts, what) => {
            const sel = el('select', null, td);
            sel.setAttribute('aria-label', `state ${S}, reading ${sym}: ${what}`);
            for (const o of opts) el('option', null, sel, o).value = o;
            sel.addEventListener('change', editorChanged);
            return sel;
          };
          return { w: mk(['0', '1'], 'write'), d: mk(['L', 'R'], 'move'), nx: mk(['A', 'B', 'C', 'D', 'E', 'Z'], 'next state (Z halts)') };
        }));
      }
    }
    const SKELET1 = '1RB1RD_1LC0RC_1RA1LD_0RE0LB_1RZ1RC';
    const INHERIT = '1RB1LB_1LA0LC_1RZ1LD_1RD0RA_1RZ1RZ';
    const side = el('div', 'bvr-side', bench);
    const presetRow = ui.controlRow(side);
    ui.button(presetRow, 'four-state inheritance', () => setEditor(INHERIT), { small: true });
    ui.button(presetRow, 'the champion', () => setEditor(CHAMPIONS[4].code), { small: true });
    ui.button(presetRow, 'Skelet #1, a holdout', () => setEditor(SKELET1), { small: true });
    ui.button(presetRow, 'scramble', scramble, { small: true });
    const runRow3 = ui.controlRow(side);
    ui.button(runRow3, '▶ run: three possible verdicts', runSandboxTM, { primary: true });
    ui.button(runRow3, 'stop', stopSandbox);
    const verdictEl = el('div', 'bvr-verdict', side, 'Edit the table, then run.');
    verdictEl.setAttribute('aria-live', 'polite');
    const bestEl = el('div', 'bvr-note', side, '');

    const pair = el('div', 'bvr-pair', act3);
    const yourWrap = el('div', null, pair);
    const yourLab = el('div', 'bvr-pairlab', yourWrap, 'your beaver');
    const yourHandle = cv.setupCanvas(yourWrap, { height: 250 });
    const champWrap = el('div', null, pair);
    const champLab = el('div', 'bvr-pairlab', champWrap, 'the champion, <b>47,176,870</b>');
    const champHandle = cv.setupCanvas(champWrap, { height: 250 });
    handles.push(yourHandle, champHandle);
    yourHandle.onResize(() => { yourDirty = true; });
    champHandle.onResize(() => { champDirty = true; });
    const yourOff = document.createElement('canvas');
    const champOff = document.createElement('canvas');
    ui.caption(act3,
      'Three honest verdicts. <b>HALTED</b> is a certificate: the run itself, which anyone can ' +
      'replay, as Radó’s umpire did. <b>PROVED NON-HALTING</b> comes from one of two sound tests: an ' +
      'exact configuration recurs, or, after Shen Lin’s 1963 dissertation, the machine repeats itself ' +
      'shifted along fresh tape. The first decider in the Coq proof, called Loops, rests on the same ' +
      'two ideas, and it settled 126,994,099 of the 133,005,895 five-state machines that never halt. ' +
      '<b>UNKNOWN</b> means 10⁸ steps of patience ran out. It is what undecidability feels like from ' +
      'the inside.');

    let sandbox = null, sandboxStore = null, sandboxRunning = false, sandboxCode = '';
    let yourDirty = false, champDirty = false, yourLast = 0, champLast = 0;
    let best = null;
    let champStore = null, champBg = null;   // background champion computation

    function setEditor(code) {
      const rows = code.split('_');
      for (let s = 0; s < 5; s++) {
        for (const sym of [0, 1]) {
          const tr = (rows[s] || '1RZ1RZ').slice(sym * 3, sym * 3 + 3) || '1RZ';
          const c = edCells[s][sym];
          c.w.value = tr[0]; c.d.value = tr[1]; c.nx.value = tr[2] === '-' ? 'Z' : tr[2];
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
      const code = buildCode();
      verdictEl.innerHTML = `<code>${code}</code> is ready.` +
        (code === SKELET1 ? ' (Its one undefined transition, never reached, is set to halt.)' : '');
    }

    function ensureChampion() {
      if (champStore) return;
      if (bigLane.run && bigLane.run.halted) {          // reuse the race's rows
        champStore = bigLane.store;
        champDirty = true;
        return;
      }
      if (!champBg) {
        champBg = { r: newRun(parseTM(CHAMPIONS[4].code)),
          store: newStore(260, Math.ceil(CHAMP / 258)) };
        sampleRow(champBg.store, champBg.r);
        champLab.innerHTML = 'the champion: computing its 47,176,870 steps for you…';
      }
    }

    function runSandboxTM() {
      audio.ensureAudio();
      sandboxCode = buildCode();
      sandbox = newVerdictRun(sandboxCode, 1e8);
      sandboxStore = newStore(240, 1);
      sampleRow(sandboxStore, sandbox.r);
      sandboxRunning = true;
      yourLab.textContent = 'your beaver';
      verdictEl.innerHTML = 'running…';
      ensureChampion();
      wood(700, 0.35);
    }
    function stopSandbox() {
      if (sandboxRunning) verdictEl.innerHTML = 'stopped.';
      sandboxRunning = false;
    }

    const stamp = (cls, text) => `<span class="bvr-stamp ${cls}">${text}</span>`;
    function finishVerdict() {
      sandboxRunning = false;
      yourDirty = true;
      const r = sandbox.r, v = sandbox;
      if (v.verdict === 'halt') {
        const s = r.steps;
        verdictEl.innerHTML = stamp('bvr-ok', 'HALTED') + `after <b>${fmt(s)}</b> steps, leaving ` +
          `${fmt(r.ones)} ones. The champion: 47,176,870.`;
        if (best === null || s > best) best = s;
        bestEl.innerHTML = `your best halting run: <b class="bvr-gold">${fmt(best)}</b> ` +
          `${best === 1 ? 'step' : 'steps'}, ${pctOf(best)} of the record.`;
        if (s === CHAMP) {
          beatQuest.done('47,176,870: you found the champion, or one of its disguises. Nothing with five states does better, and that is a theorem.');
          chime(523.25, 0, 0.3); chime(659.25, 0.12, 0.3); chime(783.99, 0.24, 0.3, 0.9);
        } else {
          chime(392, 0, 0.26); chime(523.25, 0.1, 0.26);
        }
      } else if (v.verdict === 'nonhalt') {
        const c = v.cyc;
        verdictEl.innerHTML = stamp('bvr-open', 'PROVED NON-HALTING') + (c.kind === 'lin'
          ? `From step ${fmt(c.from)} it repeats itself ${c.period === 1 ? 'at every step' : `every ${fmt(c.period)} steps`}, shifted ${fmt(Math.abs(c.shift))} ` +
            `cell${Math.abs(c.shift) === 1 ? '' : 's'} to the ${c.shift > 0 ? 'right' : 'left'}, onto ` +
            `fresh tape: Lin’s partial recurrence, detected at step ${fmt(c.at)}. It marches forever.`
          : `The exact configuration of step ${fmt(c.from)} came back at step ${fmt(c.at)}, so it ` +
            `repeats ${c.period === 1 ? 'at every step' : `every ${fmt(c.period)} steps`}, forever. No budget required.`);
        yourLab.textContent = 'your beaver, until the proof fired';
        chime(220, 0, 0.24); chime(330, 0.1, 0.24);
      } else {
        const tape = v.reason === 'tape';
        let html = stamp('bvr-unk', 'UNKNOWN') + (tape
          ? `After ${fmt(r.steps)} steps its tape outgrew ${fmt(TAPE_CAP)} cells and neither proof ` +
            `had fired. We cannot tell whether it halts.`
          : 'Still running after 10⁸ steps, and neither proof fired. It may halt at step 10⁸ + 1; ' +
            'it may run forever. <em>We cannot tell, and for machines in general, nothing can.</em>');
        if (sandboxCode === SKELET1) {
          html += ' UNKNOWN is not only a failure of patience. Skelet #1, one of the last five-state ' +
            'holdouts, does settle into Lin’s kind of repetition, with a period of 8,468,569,863 ' +
            'steps, but only after about 5.4 × 10<sup>51</sup> steps. No simulation will ever watch it ' +
            'happen: Pavel Kropitz and Shawn Ligocki had to reason their way there, and the Coq proof ' +
            'carries a proof written for this one machine.';
        }
        verdictEl.innerHTML = html;
        audio.drums.thock(bus, bus.context.currentTime, { level: 0.5 });
      }
    }

    function tickAct3() {
      if (sandboxRunning && sandbox) {
        pumpVerdict(sandbox, sandbox.phase === 'cycle' ? 40000 : 2200000, sandboxStore);
        yourDirty = true;
        if (sandbox.verdict) finishVerdict();
      }
      if (champBg && !champStore) {
        pumpSampled(champBg.r, champBg.store, 2200000);
        champDirty = true;
        if (champBg.r.halted) {
          champStore = champBg.store;
          champBg = null;
          champLab.innerHTML = 'the champion, <b>47,176,870</b>';
        }
      }
      const now = performance.now() / 1000;
      if (sandboxStore && yourDirty && (now - yourLast > 0.14 || !sandboxRunning)) {
        if (beadable(sandboxStore)) {
          drawBeadRows(yourHandle, sandboxStore.rows, !!(sandbox && sandbox.verdict === 'halt'), 18);
        } else {
          const heads = renderStore(yourOff, sandboxStore, yourHandle.width, yourHandle.height, yourHandle.dpr);
          blit(yourHandle, yourOff);
          drawHeads(yourHandle, heads, 0.8);
        }
        yourDirty = false; yourLast = now;
        if (sandbox && sandboxRunning) {
          verdictEl.innerHTML = `running… <b>${fmt(sandbox.r.steps)}</b> steps`;
        }
      }
      const cs = champStore || (champBg && champBg.store);
      if (cs && champDirty && (now - champLast > 0.2 || champStore)) {
        const heads = renderStore(champOff, cs, champHandle.width, champHandle.height, champHandle.dpr);
        blit(champHandle, champOff);
        drawHeads(champHandle, heads, 0.6);
        champDirty = false; champLast = now;
      }
    }

    setEditor(INHERIT);
    el('div', 'bvr-note', side,
      'You inherit Brady’s four-state champion with one state idle: it will halt at 107. Four ' +
      'states bought 107 steps; the fifth bought Marxen and Buntrock forty-seven million. ' +
      'Scramble, tinker, reason. The record is not hiding; it is just <em>far</em>.');

    /* ================= ACT IV — the cliff walk ================= */
    const act4 = panels[3];
    el('div', 'bvr-note', act4,
      'A walk along the axis of machine sizes, from the last number we know to the wall no ' +
      'theory we trust can see past. The scale is logarithmic; the vertigo is not.');

    // One ruler for the whole walk: machine sizes 1 → 10,000 on a log axis.
    const RULER_MAX = 10000;
    const ZONES = [
      { a: 1, b: 5, col: P.verdant, alpha: 0.85, label: 'proved' },
      { a: 5, b: 432, col: P.azureDim, alpha: 0.55, label: 'open country' },
      { a: 432, b: 643, col: P.crimson, alpha: 0.45, hatch: true, label: 'newest constructions' },
      { a: 643, b: RULER_MAX, col: P.crimson, alpha: 0.8, label: 'beyond ZF' },
    ];
    const MARKS = [
      { n: 5, top: '5', sub: '47,176,870', st: 0, col: P.goldBright, pri: 1 },
      { n: 6, top: '6', sub: 'Antihydra', st: 2, col: P.azure, pri: 1 },
      { n: 15, top: '15', sub: 'Erdős', st: 3, col: P.azure, pri: 1 },
      { n: 372, top: '372', sub: 'PA, 2026', st: 4, col: P.crimsonBright, hollow: true, pri: 3 },
      { n: 432, top: '432', sub: 'ZF, 2025', st: 4, col: P.crimsonBright, hollow: true, pri: 2 },
      { n: 643, top: '643', sub: 'ZF, 2024', st: 4, col: P.crimsonBright, pri: 1 },
      { n: 745, top: '745', sub: '2023', st: 4, col: P.crimson, pri: 5 },
      { n: 1919, top: '1,919', sub: '2016', st: 4, col: P.crimson, pri: 3 },
      { n: 7910, top: '7,910', sub: 'ZF + SRP', st: 4, col: P.crimson, pri: 2 },
    ];
    const rulerWrap = el('div', 'bvr-ruler', act4);
    const rulerHandle = cv.setupCanvas(rulerWrap, { height: 124 });
    rulerHandle.canvas.setAttribute('role', 'img');
    rulerHandle.canvas.setAttribute('aria-label',
      'A logarithmic ruler of machine sizes from 1 to 10,000: values proved up to 5 states; open country ' +
      'from 6, with the Antihydra at 6 and the Erdős machine at 15; machines that set theory cannot settle ' +
      'at 643 states (2024), with newer constructions at 432 for ZF and 372 for Peano arithmetic, and ' +
      'earlier ones at 745, 1,919 and 7,910.');
    handles.push(rulerHandle);
    rulerHandle.onResize(() => drawRuler());
    el('div', 'bvr-key bvr-rkey', act4,
      `<span><i style="color:${P.verdant}">■</i> values proved</span> · ` +
      `<span><i style="color:${P.azure}">■</i> open country</span> · ` +
      `<span><i style="color:${P.crimsonBright}">■</i> machines set theory cannot settle, if it is consistent</span>. ` +
      'Hollow rings mark the newest constructions, posted by their builders; none of these machines ' +
      'has been formally verified. Tap a mark to walk there.');
    const rulerX = (n, W) => 14 + (Math.log10(n) / Math.log10(RULER_MAX)) * (W - 28);

    function drawRuler() {
      const hd = rulerHandle, { ctx } = hd, W = hd.width, H = hd.height;
      ctx.clearRect(0, 0, W, H);
      if (W < 60) return;
      const axisY = 80, bandH = 9;
      // zones
      for (const z of ZONES) {
        const x0 = rulerX(z.a, W), x1 = rulerX(z.b, W);
        ctx.globalAlpha = z.alpha;
        ctx.fillStyle = z.col;
        ctx.fillRect(x0, axisY - bandH / 2, Math.max(0, x1 - x0), bandH);
        if (z.hatch) {
          ctx.globalAlpha = 0.9; ctx.strokeStyle = P.bg; ctx.lineWidth = 1.5;
          ctx.save(); ctx.beginPath(); ctx.rect(x0, axisY - bandH / 2, Math.max(0, x1 - x0), bandH); ctx.clip();
          for (let x = x0 - bandH; x < x1 + bandH; x += 4) { ctx.moveTo(x, axisY + bandH / 2); ctx.lineTo(x + bandH, axisY - bandH / 2); }
          ctx.stroke(); ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      // decade ticks
      ctx.font = `10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.strokeStyle = 'rgba(169,164,147,.45)'; ctx.lineWidth = 1;
      for (let d = 0; d <= 4; d++) {
        const n = Math.pow(10, d), x = Math.round(rulerX(n, W)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, axisY + bandH / 2 + 2); ctx.lineTo(x, axisY + bandH / 2 + 7); ctx.stroke();
        ctx.fillStyle = P.inkFaint;
        ctx.fillText(fmt(n), clamp(x, 10, W - 18), axisY + bandH / 2 + 10);
      }
      ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint; ctx.textAlign = 'right';
      if (W > 420) ctx.fillText('states', W - 2, axisY + bandH / 2 + 24);
      // marks: highest priority first; two label rows above the axis; drop what will not fit
      const placed = [[], []];
      const order = MARKS.map((m, i) => i).sort((a, b) => MARKS[a].pri - MARKS[b].pri);
      const labels = [];
      const maxPri = W < 420 ? 1 : W < 700 ? 2 : 5;
      for (const i of order) {
        const m = MARKS[i];
        if (m.pri > maxPri) continue;
        const x = rulerX(m.n, W);
        const sub = W < 420 && m.n === 5 ? 'proved' : m.sub;
        ctx.font = `600 11px ${MONO}`; const wTop = ctx.measureText(m.top).width;
        ctx.font = `italic 11px ${SERIF}`; const wSub = ctx.measureText(sub).width;
        const w = Math.max(wTop, wSub) + 8;
        const cx = clamp(x, w / 2 + 1, W - w / 2 - 1);
        for (let row = 0; row < 2; row++) {
          if (placed[row].every(([a, b]) => cx + w / 2 < a || cx - w / 2 > b)) {
            placed[row].push([cx - w / 2, cx + w / 2]);
            labels.push({ m, x, cx, row, sub });
            break;
          }
        }
      }
      ctx.strokeStyle = 'rgba(169,164,147,.28)'; ctx.lineWidth = 1;
      for (const { x, row } of labels) {
        const ty = row === 0 ? 36 : 8;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, axisY - 7); ctx.lineTo(Math.round(x) + 0.5, ty + 27); ctx.stroke();
      }
      for (const { m, cx, row, sub } of labels) {
        const ty = row === 0 ? 36 : 8;
        const sel = m.st === station;
        ctx.font = `600 11px ${MONO}`; const w1 = ctx.measureText(m.top).width;
        ctx.font = `italic 11px ${SERIF}`; const w2 = ctx.measureText(sub).width;
        ctx.fillStyle = P.bg;
        ctx.fillRect(cx - Math.max(w1, w2) / 2 - 3, ty - 2, Math.max(w1, w2) + 6, 28);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `600 11px ${MONO}`; ctx.fillStyle = sel ? P.goldBright : m.col;
        ctx.fillText(m.top, cx, ty);
        ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = sel ? P.ink : P.inkDim;
        ctx.fillText(sub, cx, ty + 13);
      }
      for (const m of MARKS) {
        const x = rulerX(m.n, W);
        if (m.st === station && !m.hollow) glowGold.draw(ctx, x, axisY, 0.8);
        ctx.beginPath(); ctx.arc(x, axisY, 4.2, 0, Math.PI * 2);
        if (m.hollow) { ctx.fillStyle = P.bg; ctx.fill(); ctx.strokeStyle = m.col; ctx.lineWidth = 1.5; ctx.stroke(); }
        else { ctx.fillStyle = m.col; ctx.fill(); ctx.strokeStyle = P.bg; ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
    rulerHandle.canvas.addEventListener('click', (e) => {
      const [px] = cv.pointerPos(rulerHandle, e);
      let bestM = null, bestD = 26;
      for (const m of MARKS) {
        const d = Math.abs(rulerX(m.n, rulerHandle.width) - px);
        if (d < bestD) { bestD = d; bestM = m; }
      }
      if (bestM) { audio.ensureAudio(); goStation(bestM.st); }
    });

    const navRow = ui.controlRow(act4);
    navRow.classList.add('bvr-nav');
    const prevBtn = ui.button(navRow, '◁ back', () => goStation(station - 1), { small: true });
    const stTitle = el('div', 'bvr-stitle', navRow);
    const nextBtn = ui.button(navRow, 'onward ▷', () => goStation(station + 1), { small: true });
    const stationEls = [];
    const ST_NAMES = ['the number', 'the tower', 'the Antihydra', 'the Erdős machine', 'the wall'];
    for (let i = 0; i < 5; i++) stationEls.push(el('div', 'bvr-station', act4));
    let station = 0;
    function goStation(i, quiet = false) {
      station = clamp(i, 0, 4);
      stationEls.forEach((s, j) => s.classList.toggle('on', j === station));
      stTitle.innerHTML = `station ${station + 1} of 5: <em>${ST_NAMES[station]}</em>`;
      prevBtn.disabled = station === 0;
      nextBtn.disabled = station === 4;
      if (!quiet) wood(540, 0.22);
      drawRuler();
      if (station === 0) drawLadder();
      if (station === 2) drawHydra();
      if (station === 3) drawErdos();
    }

    /* --- station 0: the number --- */
    let ladderHandle = null;
    {
      const s = stationEls[0];
      el('div', 'bvr-bignum', s, '47,176,870');
      el('div', 'bvr-bigsub', s, '= BB(5), the fifth busy beaver number');
      el('div', 'bvr-note', s,
        'Found by Heiner Marxen and Jürgen Buntrock in September 1989; proved maximal in 2024 by the ' +
        'bbchallenge collaboration, with a Coq certificate that re-checks in about forty-five minutes ' +
        'on thirteen cores.');
      const lw = el('div', null, s);
      ladderHandle = cv.setupCanvas(lw, { height: 200 });
      ladderHandle.canvas.setAttribute('role', 'img');
      ladderHandle.canvas.setAttribute('aria-label',
        'The record for five states over time, on a logarithmic scale: 79 steps in 1964, 435 in 1972, ' +
        '992 in 1973, 7,706 in 1974, 134,467 in 1982, about 2.1 and 2.4 million in 1984 and 1986, ' +
        'then 11,798,826, 23,554,764 and 47,176,870 in 1989, flat until the proof in 2024.');
      handles.push(ladderHandle);
      ladderHandle.onResize(() => drawLadder());
      ui.caption(s,
        'The five-state record over time, on a logarithmic scale: each rise is a new champion, from ' +
        'Milton Green’s 79 steps in 1964 to 47,176,870 in 1989. Then almost thirty-five years of flat line, ' +
        'while the question moved from finding to proving.');
      el('div', 'bvr-note', s,
        'At one step per second, the champion’s run is a year and a half of unbroken work. Your ' +
        'browser can do it in about a second (the preserve will show you), and it halts on a tape ' +
        'bearing exactly 4,098 ones.');
      el('div', 'bvr-note', s,
        'Brady saw the shape of the job in 1983: about 150,000,000 five-state machines, he projected, ' +
        'reducible “to perhaps a few million holdouts,” which “should present an interesting and ' +
        'reasonable challenge to persons interested in mechanical proof techniques.” The enumeration ' +
        'that finally did it counted 181,385,789, and after the loop tests had their turn about six ' +
        'million remained. He was right twice, forty-one years early.');
      ui.legendPanel(s,
        '<p>Radó’s own road was longer than any of his machines’ runs. Captured on the Russian front ' +
        'in 1916, he spent most of four years in a prison camp near Tobolsk, where Eduard Helly taught ' +
        'him mathematics. The story, as his biographers tell it, is that he then escaped and made his ' +
        'way north and west across the Russian Arctic for thousands of miles, sheltered by the people ' +
        'who lived there, and reached Hungary in 1920.</p>', 'as the story goes');
    }
    function drawLadder() {
      const hd = ladderHandle, { ctx } = hd, W = hd.width, H = hd.height;
      ctx.clearRect(0, 0, W, H);
      if (W < 80) return;
      const narrow = W < 480;
      const L = narrow ? 30 : 40, R = 14, T = 16, B = 24;
      const x = (y) => L + ((y - 1962) / (2026.5 - 1962)) * (W - L - R);
      const y = (s) => H - B - (Math.log10(s) / 8) * (H - B - T);
      // grid
      ctx.font = `10px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      for (let e = 0; e <= 8; e += 2) {
        const yy = Math.round(y(Math.pow(10, e))) + 0.5;
        ctx.strokeStyle = 'rgba(42,46,63,.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(W - R, yy); ctx.stroke();
        ctx.fillStyle = P.inkFaint;
        ctx.fillText(e === 0 ? '1' : `10${'⁰¹²³⁴⁵⁶⁷⁸'[e]}`, L - 5, yy);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const yr of narrow ? [1962, 1989, 2024] : [1962, 1970, 1980, 1990, 2000, 2010, 2024]) {
        ctx.fillStyle = P.inkFaint;
        ctx.fillText(String(yr), clamp(x(yr), L + 12, W - R - 12), H - B + 7);
      }
      // the step line
      const pts = S5_RECORDS.map((r) => [x(r.year), y(r.steps)]);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x(1962), y(1));
      pts.forEach(([px, py], i) => {
        ctx.lineTo(px, i ? pts[i - 1][1] : y(1));
        ctx.lineTo(px, py);
      });
      const xProof = x(2024.5), yTop = pts[pts.length - 1][1];
      ctx.lineTo(xProof, yTop);
      ctx.stroke();
      ctx.setLineDash([2, 4]); ctx.strokeStyle = P.goldDim;
      ctx.beginPath(); ctx.moveTo(xProof, yTop); ctx.lineTo(x(2026.4), yTop); ctx.stroke();
      ctx.setLineDash([]);
      // points and labels
      const placed = [];
      const tryLabel = (text, px, py, color, font) => {
        ctx.font = font;
        const w = ctx.measureText(text).width;
        // below and to the right of a step is always empty in a rising staircase
        let lx = px + 5, ly = py + 4;
        if (lx + w > W - R) lx = px - 5 - w;
        if (ly + 12 > H - B) { ly = py - 16; lx = px - 5 - w; }
        const box = [lx - 2, ly - 1, lx + w + 2, ly + 12];
        if (box[1] < 0 || box[0] < L) return false;
        if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return false;
        placed.push(box);
        ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(text, lx, ly);
        return true;
      };
      // the proof seal first, so it always gets its label
      glowVerd.draw(ctx, xProof, yTop, 0.9);
      ctx.beginPath(); ctx.arc(xProof, yTop, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = P.bg; ctx.fill(); ctx.strokeStyle = P.verdant; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.font = `italic 11px ${SERIF}`;
      const pl = 'proved, 2024';
      const plw = ctx.measureText(pl).width;
      ctx.fillStyle = P.verdant; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const plx = Math.min(xProof - plw / 2, W - R - plw);
      ctx.fillText(pl, plx, yTop + 8);
      placed.push([plx - 2, yTop + 7, plx + plw + 2, yTop + 20]);
      if (!narrow) {
        ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('almost thirty-five years without a longer machine', (x(1990) + xProof) / 2, yTop - 5);
      }
      const pri = narrow ? [9, 4, 0] : [9, 4, 0, 6, 1, 2, 3, 7];
      for (const i of pri) {
        const r = S5_RECORDS[i], [px, py] = pts[i];
        tryLabel(`${fmt(r.steps)} ${narrow ? '' : r.who}`.trim(), px, py, i === 9 ? P.goldBright : P.inkDim,
          i === 9 ? `600 11px ${MONO}` : `10px ${MONO}`);
      }
      for (const [px, py] of pts) {
        ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = P.goldBright; ctx.fill();
      }
      glowGold.draw(ctx, pts[9][0], pts[9][1], 0.7);
    }

    /* --- station 1: the tower --- */
    let towerK = 0, p65536str = null;
    {
      const s = stationEls[1];
      el('div', 'bvr-note', s,
        'BB(6) is not a bigger number; it is a different <em>kind</em> of number. The current ' +
        'champion, found by mxdys in June 2025, runs for more than <code>2↑↑2↑↑2↑↑10</code> steps. ' +
        'To feel what that means, build the staircase of tetration: each floor holds 2 raised to the ' +
        'number on the floor below. The bar beside each floor is the length of its number, on a ' +
        'logarithmic scale.');
      const tower = el('div', 'bvr-tower', s);
      const towerNote = el('div', 'bvr-note', s, '');
      const towerRow = ui.controlRow(s);
      const addFloor = (k, valueHTML, digits, surrender = false) => {
        const f = el('div', 'bvr-floor' + (surrender ? ' bvr-surrender' : ''), tower);
        el('span', 'bvr-fk', f, `floor ${k}`);
        el('span', 'bvr-fv', f, valueHTML);
        const g = el('span', 'bvr-gauge', f);
        const bar = el('i', null, g);
        if (!surrender) bar.style.width = (3 + 80 * Math.log10(Math.max(1, digits)) / Math.log10(19729)).toFixed(1) + '%';
        return f;
      };
      const floorBtn = ui.button(towerRow, 'add a floor', () => {
        audio.ensureAudio();
        towerK++;
        if (towerK <= 5) {
          if (towerK === 1) addFloor(1, '2 = <b>2</b> · 1 digit', 1);
          else if (towerK === 2) addFloor(2, '2<sup>2</sup> = <b>4</b> · 1 digit', 1);
          else if (towerK === 3) addFloor(3, '2<sup>4</sup> = <b>16</b> · 2 digits', 2);
          else if (towerK === 4) addFloor(4, '2<sup>16</sup> = <b>65,536</b> · 5 digits', 5);
          else {
            if (!p65536str) p65536str = (2n ** 65536n).toString();
            addFloor(5, `2<sup>65,536</sup> = <b>${p65536str.slice(0, 12)}…</b> · ` +
              `${fmt(p65536str.length)} digits, computed just now, exactly`, p65536str.length);
          }
          chime(160 * Math.pow(2, towerK / 2), 0, 0.22, 0.4);
        } else {
          addFloor(6, '2<sup>2<sup>65,536</sup></sup>: the number of its <em>digits</em> itself has ' +
            '19,728 digits. On this scale its bar would run more than four thousand times as far as floor 5’s. ' +
            'There is no room to write it.', 0, true);
          floorBtn.disabled = true;
          floorBtn.textContent = 'surrendered at floor 6';
          audio.drums.kick(bus, bus.context.currentTime, { level: 0.7 });
          towerNote.innerHTML =
            'You lost the ability to <em>write</em> the numbers at floor 6. Now read the champion’s ' +
            'bound as directions. Climb to floor 10 of this staircase: the number written there, ' +
            '<code>2↑↑10</code>, is the floor you must climb to next. The number on <em>that</em> floor ' +
            'names a third floor, and the number written on the third floor is still smaller than the ' +
            'champion’s count of steps. The celebrated bound of 2022, ' +
            '<code>10↑↑15</code>, is a footnote now. And seven states go further: in May 2025 Pavel ' +
            'Kropitz found one that runs for more than <code>2 ↑<sup>11</sup> 2 ↑<sup>11</sup> 3</code> ' +
            'steps, eleven arrows deep.';
        }
      }, { primary: true });
      ui.button(towerRow, 'demolish', () => {
        towerK = 0; tower.innerHTML = ''; towerNote.innerHTML = '';
        floorBtn.disabled = false; floorBtn.textContent = 'add a floor';
      }, { small: true });
    }

    /* --- station 2: the Antihydra --- */
    const hyState = { h: 8n, c: 0, n: 0, minC: null, minAt: 0, trace: [0] };
    let hyHandle = null, hyRead = null;
    const HY_CAP = 30000;
    const hyIdle = 'The hydra sleeps at h = 8, c = 0.';
    function hyReport() {
      if (!hyState.n) { hyRead.set(hyIdle); return; }
      const digits = hyState.h.toString().length;
      const x = -hydraFallLog10(hyState.c);
      hyRead.setHTML(`after ${fmt(hyState.n)} pulls · c = ${fmt(hyState.c)} · h has ${fmt(digits)} digits · ` +
        `lowest since the first pull: c = ${fmt(hyState.minC)} (pull ${fmt(hyState.minAt)}) · a truly random ` +
        `walker standing here would fall with probability about 10<sup>−${fmt(Math.floor(x))}</sup>` +
        (hyState.n >= HY_CAP ? ' · enough: h is getting enormous' : ''));
    }
    {
      const s = stationEls[2];
      el('div', 'bvr-note', s,
        'Inside those six states lives the <b>Antihydra</b>, first reported by mxdys on 28 June 2024 ' +
        '(Racheline worked out its rules soon after). It is a <em>cryptid</em>, the hunters’ name for ' +
        'a machine whose behaviour follows a simple rule that turns out to be an unsolved, and ' +
        'presumably hard, problem of mathematics. Its halting problem reduces, exactly, to this:');
      el('pre', 'bvr-src', s).textContent =
        'h = 8;  c = 0\n' +
        'while c ≠ −1:\n' +
        '    if h is even:  c += 2      else:  c -= 1\n' +
        '    h += ⌊h/2⌋';
      el('div', 'bvr-note', s,
        'It halts if and only if <code>c</code> ever reaches −1, that is, if at some point strictly ' +
        'more than twice as many odd values of <code>h</code> have appeared as even ones. Pull the ' +
        'sequence yourself and watch <code>c</code> walk:');
      const hyRow = ui.controlRow(s);
      hyRead = ui.readout(s, hyIdle);
      const hyWrap = el('div', null, s);
      hyHandle = cv.setupCanvas(hyWrap, { height: 170 });
      hyHandle.canvas.setAttribute('role', 'img');
      hyHandle.canvas.setAttribute('aria-label', 'The Antihydra counter c plotted against pulls, above a dashed cliff at c = −1, beside the dashed line c = n/2 of its expected drift.');
      handles.push(hyHandle);
      hyHandle.onResize(() => drawHydra());
      const pull = (k) => {
        audio.ensureAudio();
        if (hyState.n >= HY_CAP) return;
        k = Math.min(k, HY_CAP - hyState.n);
        const res = hydraAdvance(hyState.h, hyState.c, k);
        res.trace.forEach((c, i) => {
          hyState.trace.push(c);
          if (hyState.minC === null || c < hyState.minC) { hyState.minC = c; hyState.minAt = hyState.n + i + 1; }
        });
        hyState.h = res.h; hyState.c = res.c; hyState.n += k;
        hyReport();
        wood(420 + (hyState.c % 500), 0.28);
        drawHydra();
      };
      ui.button(hyRow, 'pull ×1', () => pull(1), { small: true });
      ui.button(hyRow, 'pull ×100', () => pull(100), { small: true });
      ui.button(hyRow, 'pull ×5,000', () => pull(5000), { small: true });
      ui.button(hyRow, 'reset', () => {
        Object.assign(hyState, { h: 8n, c: 0, n: 0, minC: null, minAt: 0, trace: [0] });
        hyReport();
        drawHydra();
      }, { small: true });
      ui.caption(s,
        'The gold walk is the machine’s counter, pull by pull; the dashed blue line is where a fair ' +
        '+2 or −1 walker would drift on average, half a step up per pull; the red line is the cliff. ' +
        'A drift is not a proof.');
      el('div', null, s, tmTable(ANTIHYDRA));
      el('div', 'bvr-note', s,
        'The machine itself, all six states; the one blank entry is where it would halt. Settling ' +
        'BB(6) <em>requires</em> settling the Antihydra, and no one yet knows how.');
      ui.speculationPanel(s,
        '<p>The Antihydra is believed to run forever because its counter moves like a fair walker ' +
        'who steps +2 or −1. Such a walker, starting at zero, falls to −1 with probability exactly ' +
        '(√5 − 1)/2 ≈ 0.618, the reciprocal of the golden ratio, turning up uninvited. But the real ' +
        'counter has been followed for 2<sup>38</sup> rule steps and stands more than 2<sup>37</sup> ' +
        'above the cliff, and a random walker from there would fall with probability below ' +
        '3 × 10<sup>−28,723,042,565</sup>. A heuristic that confident is still not a proof. The ' +
        'parities that drive it are those of ⌊<em>K</em>·(3/2)<sup><em>n</em></sup>⌋ for a fixed ' +
        '<em>K</em>, the kind of question Kurt Mahler asked about powers of 3/2 in 1968 and no one has ' +
        'answered.</p>');
    }
    function drawHydra() {
      if (!hyHandle) return;
      const { ctx, width: W, height: H } = hyHandle;
      ctx.clearRect(0, 0, W, H);
      if (W < 60) return;
      const tr = hyState.trace;
      const N = Math.min(600, tr.length);
      const samp = [];
      for (let i = 0; i < N; i++) samp.push(tr[Math.floor(i * tr.length / N)]);
      samp[N - 1] = tr[tr.length - 1];
      const nMax = Math.max(12, tr.length - 1);
      let maxC = Math.max(6, nMax / 2);
      for (const c of samp) if (c > maxC) maxC = c;
      const L = 8, R = 8, T = 12, B = 22;
      const xOf = (i) => L + (i / nMax) * (W - L - R);
      const yOf = (c) => H - B - ((c + 1) / (maxC + 1)) * (H - T - B);
      // cliff
      ctx.strokeStyle = P.crimson; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      const yc = Math.round(yOf(-1)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, yc); ctx.lineTo(W - R, yc); ctx.stroke();
      // expected drift c = n/2
      ctx.strokeStyle = P.azureDim; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(xOf(0), yOf(0)); ctx.lineTo(xOf(nMax), yOf(nMax / 2)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `italic 11px ${SERIF}`; ctx.textBaseline = 'bottom'; ctx.textAlign = 'right';
      ctx.fillStyle = P.crimsonBright;
      ctx.fillText('c = −1, the cliff: halt', W - R, yc - 4);
      // the walk
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = xOf((i / Math.max(1, N - 1)) * (tr.length - 1));
        i ? ctx.lineTo(x, yOf(samp[i])) : ctx.moveTo(x, yOf(samp[i]));
      }
      ctx.stroke();
      if (tr.length > 1) glowGold.draw(ctx, xOf(tr.length - 1), yOf(tr[tr.length - 1]), 0.6);
      ctx.font = `10px ${MONO}`; ctx.fillStyle = P.inkFaint; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`${fmt(nMax)} pulls`, W - R, H - B + 6);
      ctx.textAlign = 'left';
      ctx.fillText('0', L, H - B + 6);
    }

    /* --- station 3: the Erdős machine --- */
    let erN = 9, erRows = [], erScanning = false, erHandle = null, erBtn = null;
    const ER_MAX = 1200, ER_KEEP = 110, ER_W = 760;
    const erStrip = document.createElement('canvas');
    erStrip.width = ER_W; erStrip.height = ER_KEEP;
    let erImg = null;
    let erStatus = null;
    {
      const s = stationEls[3];
      el('div', 'bvr-note', s,
        'In 1979 Erdős conjectured that for every <code>n &gt; 8</code> the ternary (base-3) ' +
        'expansion of <code>2ⁿ</code> contains at least one digit 2. In 2021 Tristan Stérin and ' +
        'Damien Woods built an explicit <b>15-state</b> Turing machine that halts if and only if the ' +
        'conjecture is false. If you knew BB(15), you could settle ' +
        'a conjecture that has stood since 1979 by running one machine. Busy beavers eat open ' +
        'problems this small.');
      el('div', 'bvr-note', s,
        'The only powers of two known with no 2 in ternary: <code>2⁰ = 1₃</code>, ' +
        '<code>2² = 11₃</code>, <code>2⁸ = 100111₃</code>, conjecturally the last there will ever be.');
      const erRow = ui.controlRow(s);
      erBtn = ui.button(erRow, '▶ hunt for a counterexample', () => {
        audio.ensureAudio();
        if (erN > ER_MAX) return;
        erScanning = !erScanning;
        erBtn.textContent = erScanning ? '⏸ pause the hunt' : '▶ hunt for a counterexample';
      }, { primary: true });
      ui.button(erRow, 'reset', () => {
        erScanning = false; erN = 9; erRows = [];
        erBtn.textContent = '▶ hunt for a counterexample';
        erStatus.set('n = 9: the hunt has not started.');
        drawErdos();
      }, { small: true });
      erStatus = ui.readout(s, 'n = 9: the hunt has not started.');
      const erWrap = el('div', null, s);
      erHandle = cv.setupCanvas(erWrap, { height: 2 * ER_KEEP });
      erHandle.canvas.setAttribute('role', 'img');
      erHandle.canvas.setAttribute('aria-label', 'Powers of two written in base three, one per row, aligned by place value, with the digit 2 in gold.');
      handles.push(erHandle);
      erHandle.onResize(() => drawErdos());
      ui.caption(s,
        'Each row is 2ⁿ written in base 3, aligned by place value, the units digit at the right. ' +
        '<span class="bvr-gold">Gold: digit 2</span> · <span class="bvr-open">blue: 1</span> · dark: 0. ' +
        'The right-hand columns repeat, because 2 is a primitive root modulo every power of 3: the ' +
        'last <i>k</i> digits cycle with period 2 · 3<sup><i>k</i>−1</sup>. The chaos is on the left, ' +
        'and the conjecture is the statement that gold never abandons a row again.');
    }
    function drawErdos() {
      if (!erHandle) return;
      const g = erStrip.getContext('2d');
      if (!erImg) erImg = g.createImageData(ER_W, ER_KEEP);
      const data = erImg.data;
      data.fill(0);
      const y0 = ER_KEEP - erRows.length;      // newest row at the bottom
      for (let ri = 0; ri < erRows.length; ri++) {
        const digs = erRows[ri], len = digs.length, y = y0 + ri;
        for (let di = 0; di < len; di++) {
          const x = ER_W - len + di;
          if (x < 0) continue;
          const d = digs[di];
          const rgb = d === 2 ? BRIGHT : d === 1 ? AZUR : FAINT;
          const p = (y * ER_W + x) * 4;
          data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2];
          data[p + 3] = d === 2 ? 255 : d === 1 ? 165 : 48;
        }
      }
      g.putImageData(erImg, 0, 0);
      const { ctx, width, height } = erHandle;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(erStrip, 0, 0, width, height);
      if (!erRows.length) {
        ctx.fillStyle = P.inkFaint; ctx.font = `italic 15px ${SERIF}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('2⁹, 2¹⁰, 2¹¹, … waiting to be written in base 3', width / 2, height / 2);
      }
    }
    function tickAct4() {
      if (!erScanning) return;
      let last = null;
      for (let i = 0; i < 3 && erN <= ER_MAX; i++, erN++) {
        const digs = ternaryOfPow2(erN);
        erRows.push(digs);
        if (erRows.length > ER_KEEP) erRows.shift();
        last = digs;
        if (!digs.includes(2)) {     // will not happen below 1200 (checked) — but be honest
          erScanning = false;
          erStatus.set(`n = ${erN}: NO digit 2, a counterexample to Erdős 1979. Tell someone.`);
          drawErdos();
          return;
        }
      }
      if (last) {
        const twos = last.reduce((a, d) => a + (d === 2 ? 1 : 0), 0);
        erStatus.set(`n = ${fmt(erN - 1)} · ${fmt(erN - 9)} powers checked since 2⁸ · ` +
          `${last.length} ternary digits · 2s in this row: ${twos}`);
      }
      if (erN > ER_MAX) {
        erScanning = false;
        erBtn.textContent = '▶ hunt for a counterexample';
        erStatus.set(`checked through n = ${fmt(ER_MAX)}: every power since 2⁸ showed a 2. ` +
          'No one has ever found a fourth exception. The 15-state machine hunts on.');
      }
      drawErdos();
    }

    /* --- station 4: the wall --- */
    {
      const s = stationEls[4];
      el('div', 'bvr-note', s,
        'In 2016 Adam Yedidia and Scott Aaronson compiled a 7,910-state machine that halts if and ' +
        'only if a large-cardinal extension of set theory (ZF with the Stationary Ramsey Property) is ' +
        'inconsistent. Soon afterward Stefan O’Rear built one that simply hunts for a contradiction in ' +
        'ZF itself, first with 1,919 states and then 748. Johannes Riebel’s 2023 bachelor’s thesis at ' +
        'Augsburg reached 745, and Rohan Ridenour, in July 2024, brought it to <b>643</b>. Constructions ' +
        'posted since by their builders go lower still, to 432 states for ZF by August 2025 and 372 ' +
        'for Peano arithmetic in February 2026. None of these machines has yet been formally verified.');
      el('div', 'bvr-note', s,
        'Now the trap closes. If ZF is consistent, then by Gödel’s second incompleteness theorem it ' +
        'cannot prove that the 643-state machine runs forever. But knowing <code>BB(643)</code> would ' +
        'prove exactly that: run the machine for BB(643) steps; if it has not halted, it never will. ' +
        'Therefore <b>ZF cannot determine BB(643)</b>. Adding the axiom of choice changes nothing, ' +
        'since ZF and ZFC prove exactly the same things about which machines halt. The value exists, ' +
        'a specific integer, and the mathematics we live in cannot reach it.');
      el('div', 'bvr-note', s,
        'Every honest theory has such a horizon. Peano arithmetic’s is no farther out than ZF’s; add ' +
        'large-cardinal axioms and it can only recede, but by Gödel it never vanishes. For ZF the ' +
        'horizon lies no farther out than 643 states, or 432 if the newest construction holds. Where ' +
        'it actually begins is open: somewhere from six states up.');
      ui.speculationPanel(s,
        '<p>Could a question as small as the Antihydra already lie beyond set theory? No one can ' +
        'rule it out, so it is conceivable that ZF’s blindness begins at six states. In 2020 Scott ' +
        'Aaronson conjectured that ZF cannot settle <code>BB(20)</code>, and that Peano arithmetic, ' +
        'which already cannot prove that every hydra in <a href="#ex-loop">The Strange Loop</a> dies, ' +
        'cannot settle <code>BB(10)</code>. Even Graham’s number, which Martin Gardner called in 1977 ' +
        'the largest number ever used in a serious mathematical proof, is bracketed by the hunters ' +
        'between 6 and 13 states: the smallest machine that outruns it has at most 13, a bound that ' +
        'rests on a machine reported in March 2026 and not yet independently checked.</p>' +
        '<p>Aaronson has also argued that the busy beaver makes the starkest case for being a ' +
        'Platonist about arithmetic: “do we agree that it’s an iron fact that BB(2) = 6 and ' +
        'BB(3) = 21—a fact independent of all axioms, interpretations, and models? … But if so, ' +
        'then why shouldn’t there likewise be a fact about BB(1000)?” Whether a number no theory can ' +
        'reach is still <em>there</em> is the question this essay asked at its door, in its sharpest ' +
        'form.</p>');
      el('div', 'bvr-note', s,
        'One more thing the number 47,176,870 measured: how mathematics is done now. BB(5) was ' +
        'settled by an open online collaboration of hobbyists and researchers, and the referee of ' +
        'record was a proof script anyone can re-run. In June 2026 the result was published at STOC, ' +
        'the ACM’s Symposium on Theory of Computing, and one of the names on the byline is simply ' +
        'mxdys, a contributor about whom, <em>Quanta</em> reported in 2024, no one on the team knew any ' +
        'personal details at all. The journals did not become unnecessary. The referee’s hardest job had ' +
        'been done in advance, by a checker anyone can run.');
    }
    goStation(0, true);

    /* ---------- global caption ---------- */
    ui.caption(stage,
      'The champions, Skelet #1 and the Antihydra were transcribed from the bbchallenge wiki, and every ' +
      'champion is checked by running it here: they stop after exactly 1, 6, 21, 107 and 47,176,870 ' +
      'steps. Nothing is a re-enactment; every space-time diagram is a real run of the real machine.');

    /* ---------- shared loop & lifecycle ---------- */
    function markAllDirty() {
      for (const lane of lanes) lane.dirty = true;
      yourDirty = true; champDirty = true;
      if (activeAct === 3) { drawRuler(); drawLadder(); drawErdos(); drawHydra(); }
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

// Fast, deterministic checks (tests.html runs this in the browser).
function selfTest() {
  const ok = (c, m) => { if (!c) throw new Error('beavers selfTest: ' + m); };
  const want = [1, 6, 21, 107];
  CHAMPIONS.slice(0, 4).forEach((c, i) => {
    const r = runMachine(c.code);
    ok(r.halted && r.steps === want[i], `BB(${i + 1}) = ${r.steps}`);
  });
  const B = championBeats();
  ok(B.total === 47176870 && B.finalOnes === 4098 && B.seq.length === 15, 'Collatz beats');
  // the first ten homecomings, checked against the interpreter
  const r = newRun(parseTM(CHAMPIONS[4].code));
  for (let j = 0; j < 10; j++) {
    runFor(r, B.beats[j] - r.steps);
    ok(atBeat(r, B.seq[j + 1]), `beat ${j + 1} at step ${B.beats[j]}`);
  }
  // sound non-halting proofs
  const v1 = newVerdictRun('1RA1RZ_1RZ1RZ_1RZ1RZ_1RZ1RZ_1RZ1RZ');
  while (!v1.verdict) pumpVerdict(v1, 1e5);
  ok(v1.verdict === 'nonhalt' && v1.cyc.kind === 'lin', 'marcher proved');
  const v2 = newVerdictRun(CHAMPIONS[3].code + '_1RZ1RZ');
  while (!v2.verdict) pumpVerdict(v2, 1e5);
  ok(v2.verdict === 'halt' && v2.r.steps === 107, 'BB(4) verdict');
  // the defeat is guaranteed for every checker
  for (const c of CHECKERS) {
    const o = spiteOutcome(c.src, 20000);
    ok((o.prediction === 'halts') !== o.actualHalts, `${c.name} defeated`);
  }
  ok(towerFloorDigits(5) === 19729, 'floor 5 digits');
  ok(!hasTwoInTernary(8) && hasTwoInTernary(9), 'Erdős exceptions');
  ok(Math.abs(hydraFallLog10(0) - Math.log10(0.6180339887)) < 1e-9, 'golden fall');
  // the Antihydra's first pulls: h = 8, 12, 18, 27, 40 → c = 2, 4, 6, 5, 7
  ok(hydraAdvance(8n, 0, 5).trace.join(',') === '2,4,6,5,7', 'hydra trace');
  // a halter must never be "proved" non-halting: the three-state champion, padded to five
  const v3 = newVerdictRun(CHAMPIONS[2].code + '_1RZ1RZ_1RZ1RZ');
  while (!v3.verdict) pumpVerdict(v3, 1e5);
  ok(v3.verdict === 'halt' && v3.r.steps === 21, 'BB(3) verdict');
  ok(pctOf(107) === '0.00023%' && pctOf(1) === '0.0000021%' && pctOf(47176870) === '100%', 'pctOf');
  return true;
}

export const _test = {
  parseTM, runMachine, runFor, newRun, configKey, newVerdictRun, pumpVerdict,
  newStore, pumpSampled, sampleRow,
  CHAMPIONS, ANTIHYDRA, hydraAdvance, hydraFallLog10, ternaryOfPow2, hasTwoInTernary,
  CHECKERS, SAMPLE_PROGRAMS, buildSpite, compileChecker, makeRealRun,
  runSandbox, spiteOutcome,
  towerFloorDigits,
  championBeats, atBeat, S5_RECORDS, linObserve, newLin, TAPE_CAP,
  pctOf, selfTest,
};
