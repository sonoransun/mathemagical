// III — The Strange Loop
// Hofstadter's MIU game and its unreachable MU (with a map of the theorems
// reachable within 22 letters and a decision procedure that derives any theorem you type);
// arithmetization; a working quine and the diagonal lemma building Gödel's and
// Henkin's sentences live; the fully playable Kirby–Paris hydra with an
// order-preserving ε₀ meter; Goodstein sequences in hereditary base notation
// with BigInt; and the ruler of theories.
//
// Everything interactive here computes the real object: the BFS really
// enumerates MIU theorems, the fixed point is really constructed by
// substitution, every hydra chop is checked with core ordCmp to lower the
// ordinal, and the Goodstein values are the actual hereditary-base computation.

import {
  clamp, formatBig, digitsInBase,
  ordCmp, ordIsFinite, ordSumOfOmegaPows,
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
// `budget` strings; done/found/count are live. onNew(s) sees each new theorem.
function makeBFS(maxLen = 15, cap = 400000, onNew = null) {
  const seen = new Set(['MI']);
  const queue = ['MI'];
  let qi = 0;
  if (onNew) onNew('MI');
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
            if (onNew) onNew(m.to);
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

// The whole system, seen from outside: a string is a theorem exactly when it
// is one M followed by I's and U's and its I-count is not a multiple of 3.
function miuVerdict(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!s) return { s, ok: false, kind: 'empty' };
  if (/[^MIU]/.test(s)) return { s, ok: false, kind: 'alphabet' };
  if (s[0] !== 'M' || s.indexOf('M', 1) !== -1) return { s, ok: false, kind: 'm' };
  const n = iCount(s);
  if (n % 3 === 0) return { s, ok: false, kind: 'mod3', n };
  return { s, ok: true, kind: 'theorem', n };
}

// Is `seq` (strings, starting at MI) a legal derivation? Each step must be one
// rule application. Returns true/false.
function miuCheckDerivation(seq) {
  if (!seq.length || seq[0] !== 'MI') return false;
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1];
    if (!miuMoves(prev, Infinity).some((m) => m.to === seq[i])) return false;
  }
  return true;
}

// Shortest derivation of `target` whose strings never exceed maxLen letters
// (breadth-first with back-pointers), as [{rule, to}], or null.
function miuShortest(target, maxLen = 16) {
  if (target === 'MI') return [];
  const back = new Map([['MI', null]]);
  const queue = ['MI'];
  for (let qi = 0; qi < queue.length; qi++) {
    const s = queue[qi];
    for (const m of miuMoves(s, maxLen)) {
      if (back.has(m.to)) continue;
      back.set(m.to, { from: s, rule: m.rule });
      if (m.to === target) {
        const steps = [];
        for (let x = target; x !== 'MI'; x = back.get(x).from) steps.push({ rule: back.get(x).rule, to: x });
        return steps.reverse();
      }
      queue.push(m.to);
    }
  }
  return null;
}

// A derivation of any theorem, built the way the decision procedure proves
// it exists: double until the I-count is a power of 2 congruent to the
// target's, trade surplus III's for U's (one rule I evens their number),
// delete the U's in pairs, then carve the target's U's out of III's.
function miuConstruct(target) {
  const v = miuVerdict(target);
  if (!v.ok) return null;
  const t = v.s;
  const NI = iCount(t), NU = t.length - 1 - NI, N = NI + 3 * NU;
  let n = 0, p = 1;
  while (p < N || (p - N) % 3 !== 0) { n++; p *= 2; }
  const steps = [];
  let s = 'MI';
  const push = (rule, to) => { steps.push({ rule, to }); s = to; };
  for (let i = 0; i < n; i++) push(2, 'M' + s.slice(1) + s.slice(1));
  const k = (p - N) / 3;
  for (let j = 0; j < k; j++) {
    if (j === k - 1 && k % 2 === 1) push(1, s + 'U');
    const at = 1 + N + j;
    push(3, s.slice(0, at) + 'U' + s.slice(at + 3));
  }
  while (s.length > 1 + N) push(4, s.slice(0, 1 + N) + s.slice(3 + N));
  let q = 1;
  for (let i = 1; i < t.length; i++, q++) {
    if (t[i] === 'U') push(3, s.slice(0, q) + 'U' + s.slice(q + 3));
  }
  return steps;
}

// Prefer a shortest derivation that stays within maxLen letters (a quick
// search for short targets); otherwise build the constructive one.
function miuDerive(target, maxLen = 16) {
  const v = miuVerdict(target);
  if (!v.ok) return null;
  return (v.s.length <= maxLen && miuShortest(v.s, maxLen)) || miuConstruct(v.s);
}

/* ==================== quine & diagonal lemma ====================
   A real, runnable JS quine (blueprint + copier), and a toy quotation
   language in which the diagonal-lemma construction is performed
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

/* ==================== ordinals below ε₀: display ====================
   Core math.js holds ordinals in Cantor normal form: a number, or
   { terms: [[exponent, coefficient], …] } with exponents decreasing. */

function ordSucc(a) {
  if (ordIsFinite(a)) return a + 1;
  const terms = a.terms.map(([e, c]) => [e, c]);
  const last = terms[terms.length - 1];
  if (ordIsFinite(last[0]) && last[0] === 0) last[1] += 1; else terms.push([0, 1]);
  return { terms };
}
function ordTail(a) {
  const t = a.terms.slice(1);
  if (!t.length) return 0;
  if (t.length === 1 && ordIsFinite(t[0][0]) && t[0][0] === 0) return t[0][1];
  return { terms: t };
}

// Order-preserving "height": finite n ↦ n/(n+6) ∈ [0,1); for
// α = ω^e·c + γ (γ < ω^e) the value lies in [1 + H(e), 1 + H(e+1)),
// rising with c and with γ. So α < β ⇒ H(α) < H(β), and H → ∞ toward ε₀.
function ordH(a) {
  if (ordIsFinite(a)) return a / (a + 6);
  const [e, c] = a.terms[0];
  const lo = ordH(e), hi = ordH(ordSucc(e));
  const rho = a.terms.length > 1 ? ordAltitude(ordTail(a)) / ordAltitude({ terms: [[e, 1]] }) : 0;
  return 1 + lo + (hi - lo) * (1 - 1 / (c + rho));
}

// Altitude of an ordinal on a 0..1 ruler whose right edge is ε₀. It keeps the
// order exactly (a smaller ordinal always sits further left); no ruler below
// ε₀ can be to scale. ω ↦ 0.495, ω^ω ↦ 0.722, ω^ω^ω ↦ 0.847.
function ordAltitude(o) {
  return 1 - Math.pow(0.55, ordH(o));
}

// True iff every ordinal in the list is strictly smaller than the one before.
function strictlyDecreasing(list) {
  for (let i = 1; i < list.length; i++) if (ordCmp(list[i], list[i - 1]) >= 0) return false;
  return true;
}

// Heights for drawing a descent: normalized to the first value, and each one
// forced a fraction `gap` below the one before, so that ordinals which differ
// below float resolution still visibly step down. Order-preserving; not to scale.
function visibleDescent(alts, gap = 0.03) {
  const a0 = alts.length ? Math.max(1e-12, alts[0]) : 1;
  const out = [];
  for (let i = 0; i < alts.length; i++) {
    const v = alts[i] / a0;
    out.push(i === 0 ? v : (alts[i] <= 0 ? 0 : Math.min(v, out[i - 1] * (1 - gap))));
  }
  return out;
}

// Cantor normal form with real superscripts, for the DOM.
function ordHTML(a) {
  if (ordIsFinite(a)) return String(a);
  return a.terms.map(([e, c]) => {
    if (ordIsFinite(e) && e === 0) return String(c);
    const base = ordIsFinite(e) && e === 1 ? 'ω' : `ω<sup>${ordHTML(e)}</sup>`;
    return c === 1 ? base : `${base}·${c}`;
  }).join(' + ');
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
  if (node.b !== undefined) c.b = node.b;   // birth time, UI-only, preserved
  if (node.id !== undefined) c.id = node.id; // identity, UI-only, preserved
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

function hydraAt(root, path) {
  let n = root;
  for (const i of path) n = n.kids[i];
  return n;
}

// Pure chop: returns { tree, regrown } where regrown (or null) locates the
// freshly sprouted copies: { path: path-of-grandparent, from, count }.
// (Copies are joined with concat, never a spread: n can be large.)
function hydraChop(root, path, n) {
  const t = hClone(root);
  const chain = [t];
  let cur = t;
  for (const i of path) {
    cur = cur.kids[i];
    if (!cur) throw new Error('hydraChop: bad path');
    chain.push(cur);
  }
  if (cur.kids.length !== 0) throw new Error('hydraChop: not a head');
  const parent = chain[chain.length - 2];
  parent.kids.splice(path[path.length - 1], 1);
  let regrown = null;
  if (path.length >= 2) {
    const gp = chain[chain.length - 3];
    const pIdx = path[path.length - 2];
    const copies = new Array(n);
    for (let i = 0; i < n; i++) copies[i] = hClone(parent);
    gp.kids = gp.kids.slice(0, pIdx + 1).concat(copies, gp.kids.slice(pIdx + 1));
    regrown = { path: path.slice(0, -2), from: pIdx + 1, count: n };
  }
  return { tree: t, regrown };
}

// The node count a chop would leave, computed before cloning anything.
function hydraChopSize(root, path, n) {
  const size = hydraSize(root) - 1;
  if (path.length < 2) return size;
  return size + n * (hydraSize(hydraAt(root, path.slice(0, -1))) - 1);
}

// Canonical order (in place): every node's children sorted by ordinal,
// largest first, so the drawing reads left to right like Cantor normal form.
// Returns the node's ordinal.
function hydraCanon(node) {
  const ks = node.kids.map((k) => [hydraCanon(k), k]);
  ks.sort((a, b) => ordCmp(b[0], a[0]));
  node.kids = ks.map((x) => x[1]);
  return ordSumOfOmegaPows(ks.map((x) => x[0]));
}

// Structural key (in place, cached on each node as .key): equal keys mean
// identical branches.
function hydraKeys(node) {
  node.key = '(' + node.kids.map(hydraKeys).join('') + ')';
  return node.key;
}

function defaultHydra() {
  // ord = ω² + ω + 1
  return hNode(hNode(hNode(), hNode()), hNode(hNode()), hNode());
}

// The hydras on offer. A neck of three edges carries ω^ω; of four, ω^ω^ω.
const HYDRA_SHAPES = {
  w2: () => defaultHydra(),
  ww: () => hNode(hNode(hNode(hNode()))),
  ww2: () => hNode(hNode(hNode(hNode())), hNode(hNode(hNode()))),
  www: () => hNode(hNode(hNode(hNode(hNode())))),
};

// Head chosen by a strategy on a canonical tree: 'big' strikes the biggest
// branch (leftmost head), 'easy' picks off the smallest heads (rightmost).
function hydraPick(tree, strategy) {
  const heads = hydraLeafPaths(tree);
  if (!heads.length) return null;
  return strategy === 'easy' ? heads[heads.length - 1] : heads[0];
}

// Play a whole battle in canonical order. Returns turns, peak node count,
// whether the hydra died within the limits, and whether α fell every turn.
function hydraBattle(tree, strategy = 'big', { maxTurns = 20000, cap = Infinity } = {}) {
  let t = hClone(tree);
  hydraCanon(t);
  let prev = hydraOrd(t), peak = hydraSize(t), turn = 1, decreasing = true, capped = false;
  while (t.kids.length && turn <= maxTurns) {
    const p = hydraPick(t, strategy);
    if (hydraChopSize(t, p, turn) > cap) { capped = true; break; }
    t = hydraChop(t, p, turn).tree;
    hydraCanon(t);
    const o = hydraOrd(t);
    if (ordCmp(o, prev) >= 0) decreasing = false;
    prev = o;
    peak = Math.max(peak, hydraSize(t));
    turn++;
  }
  return { turns: turn - 1, peak, dead: t.kids.length === 0, decreasing, capped };
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

// The same, with real superscripts, for the DOM.
function hereditaryHTML(n, b) {
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
    const pow = k === 1 ? String(b) : `${b}<sup>${hereditaryHTML(BigInt(k), b)}</sup>`;
    parts.push(d === 1 ? pow : `${d}·${pow}`);
  }
  return parts.join(' + ');
}

// log₁₀ of a positive BigInt, to float precision.
function bigLog10(v) {
  if (v <= 0n) return -Infinity;
  const s = v.toString();
  const head = Number(s.slice(0, 15));
  return Math.log10(head) + (s.length - Math.min(15, s.length));
}

/* ==================== the exhibit: text ==================== */

const PROSE = `
    <p>In 1979 Douglas Hofstadter published <em>Gödel, Escher, Bach</em>, which won the next
    year’s Pulitzer Prize for general nonfiction, and in its first chapter he set a puzzle small
    enough to fit on an index card. You are given one string, <code>MI</code>, and four rules:
    you may append <code>U</code> to any string ending in <code>I</code>; you may double
    everything after the <code>M</code>; you may replace any <code>III</code> with
    <code>U</code>; you may delete any <code>UU</code>. The challenge is to produce
    <code>MU</code>. It feels like a lock that must open, the rules so permissive and the
    target so short. Play the first act below before reading on; the machine will happily deal
    you every legal move.</p>
    <p>You will not produce it, and the reason is worth more than the puzzle. Count the letters
    <code>I</code>. You begin with one; doubling turns <em>n</em> of them into 2<em>n</em>, and
    the only rule that destroys them removes three at a time. Neither move can make the count a
    multiple of 3, and <code>MU</code>, with none at all, needs exactly that. Notice what just
    happened. The argument is not a derivation <em>in</em> the system:
    no sequence of the four rules states it, checks it, or could even express it. You stepped
    outside, reasoned <em>about</em> the machine, and settled a question the machine cannot
    settle about itself. From outside, in fact, the whole system is transparent. A string is a
    theorem exactly when it is a single <code>M</code> followed by any mix of <code>I</code> and
    <code>U</code> in which 3 does not divide the count of <code>I</code>, a criterion Laif Swanson
    and Robert McEliece proved in a two-page note of 1988, “A simple decision procedure for
    Hofstadter’s MIU-system.”</p>
    <p>Now read <code>M</code>, <code>I</code>, <code>U</code> as the digits 3, 1, 0, as
    Hofstadter does in his ninth chapter, and every string becomes a number: <code>MI</code> is 31,
    <code>MU</code> is 30, <code>MIU</code> is 310. <em>Derivable</em> becomes a property of
    numbers, as concrete as <em>even</em>. This is arithmetization, the first move of Kurt
    Gödel’s 1931 paper, and it has a single price: multiplication. In 1929 Mojżesz Presburger
    showed that the arithmetic of addition alone is complete: every sentence in it can be proved
    or refuted, and a mechanical procedure decides which. Add multiplication, as little of it as
    Raphael Robinson’s weak theory <code>Q</code> contains, and a theory becomes able to spell
    out its own proofs. From then on it can never finish itself.</p>
    <p>The second move is self-reference, and it is a technique, not a paradox. A program prints
    itself by carrying a blueprint and a copier: <em>print this text, then print it again in
    quotes</em>. Programmers call such programs <em>quines</em>, borrowing the verb “to quine”
    that Hofstadter coined in honour of the philosopher W. V. O. Quine, and Stephen Kleene’s
    recursion theorem of 1938 guarantees one in every language that can compute whatever a
    Turing machine can. The second act runs a quine, then performs the
    same trick on sentences. This is the diagonal lemma, stated in general, it seems first, by
    Rudolf Carnap in 1934: for <em>any</em> property <code>P(x)</code> there is a sentence <code>G</code>,
    built by mechanical substitution, that is provably equivalent to <code>P(⌜G⌝)</code>,
    “<code>P</code> holds of my own code.” Choose <em>is not provable</em> for <code>P</code>
    and you have built Gödel’s sentence before your eyes. The theorem it yields is exact: every
    consistent, effectively axiomatizable theory that contains <code>Q</code> is incomplete
    (Gödel 1931, sharpened by J. Barkley Rosser in 1936). Gödel first mentioned the result
    almost in passing, at a conference in Königsberg on 7 September 1930. On 20 November John
    von Neumann, who had been in the audience, wrote to him with a “remarkable” corollary, only
    to learn that Gödel already had it: no such theory that meets a few standard conditions, as
    Peano arithmetic and ZFC do, can prove its own consistency.</p>
    <p>A fair objection: <code>G</code> is a lawyer’s sentence, engineered for the loophole.
    Does incompleteness ever touch mathematics anyone would do on purpose? It does. In 1977 Jeff
    Paris and Leo Harrington found a statement about colouring finite sets, a close cousin of
    Ramsey’s theorem, that PA cannot prove, and the third act lets you fight a later example
    barehanded. The hydra is a tree. You chop a head, and on turn <em>n</em> the beast sprouts
    <em>n</em> copies of the maimed branch one level closer to the root. Growth outruns cutting,
    visibly and absurdly, yet Hercules cannot lose: <em>every</em> strategy kills <em>every</em>
    hydra (Laurie Kirby and Jeff Paris, 1982). The proof hangs an ordinal below ε₀ on the beast
    and watches it fall with every chop, and the same paper shows that PA cannot prove the
    theorem. The argument needs induction all the way up to ε₀, exactly the ceiling of PA’s
    strength that Gerhard Gentzen found in two strokes: in 1936 he proved PA consistent by
    induction up to ε₀, and in 1943 he showed that PA can climb to every ordinal below ε₀ but
    never to ε₀ itself.</p>
    <p>Reuben Goodstein’s theorem of 1944, the hydra’s arithmetic twin, shares its fate. Every
    Goodstein sequence reaches zero, and PA cannot prove it. The sequence seeded at 4 ambles
    along as 4, 26, 41, 60, 83, and keeps climbing until its base reaches
    3·2<sup>402,653,209</sup>. There it peaks, at 3·2<sup>402,653,210</sup> − 1, and stands
    perfectly still for 3·2<sup>402,653,209</sup> steps, each bump of the base adding exactly
    the one that each subtraction takes away. Only then does it walk down, one unit at a time,
    to reach zero when the base is 3·2<sup>402,653,211</sup> − 1, a number with 121,210,695
    digits. The unprovable is not exotic. It grows in the garden.</p>
    <p>There is a coda to the walls, and it points at the next room. Löb’s theorem of 1955 says
    that a theory cannot even trust hypothetical proofs of itself: if PA proves “<em>if φ is
    provable, then φ</em>,” then PA already proves φ outright. So we climb: PA, then
    PA + Con(PA), then PA + Con(PA + Con(PA)), an endless tower in which each theory certifies
    the floor below and never its own. Proof theory turns the climb into a ruler that measures
    theories by the ordinals their induction can reach, ω<sup>ω</sup> for primitive recursive
    arithmetic and ε₀ for PA. Next door, that ruler is laid against computation itself.</p>`;

const TODAY = `
    <p>The self-printing program did not stay a parlour game. Ken Thompson’s Turing Award
    lecture, printed in August 1984 as “Reflections on Trusting Trust,” begins with a student
    exercise, writing “the shortest self-reproducing program,” and ends with
    the same blueprint-and-copier trick hidden inside a C compiler. The Trojan horse he describes
    reinserts itself whenever the compiler is recompiled, and the login program it corrupts
    “will remain bugged with no trace in source anywhere.” His moral: “You can’t trust code that
    you did not totally create yourself.” The answer since has been to shrink what must be
    trusted. In April 2023 the GNU Guix project reported a package graph of more than 22,000
    nodes built from source and rooted in a single 357-byte program.</p>
    <p>The walls themselves are now machine-checked. In 2013 Lawrence Paulson verified both
    incompleteness theorems, for a theory of hereditarily finite sets, in the Isabelle proof
    assistant, by his account the first machine-checked proof of the second. The Lean library
    <em>Foundation</em> proves the first, the second and Löb’s theorem. <em>Hydras &amp; Co.</em>,
    a library for the Coq prover (now called Rocq), proves that no ordinal measure below ε₀
    can certify that every hydra battle ends, even when the regrowth rises by one each turn, as
    it does here. The
    compass’s kind of proof, a count that every legitimate string must satisfy, is also how a
    receiver notices that a message has been damaged, in <a href="#ex-selfheal">The Checking
    Number</a>.</p>
    <p>Löb’s theorem has found a second career in game theory. Hand two programs each other’s
    source code and let each cooperate in a one-shot Prisoner’s Dilemma only if it can
    <em>prove</em> that the other will cooperate back. A 2014 paper showed, by Löb’s theorem,
    that two such “FairBots” do cooperate, and in 2019 Andrew Critch proved a version for agents
    with only bounded time to search for proofs. At the far end of the ruler the survey goes on:
    full second-order arithmetic, the classic formal setting for analysis, has long stood as
    the great open case of ordinal analysis.</p>`;

const CHRONICLE = [
  { year: 1931, date: '1931', text: 'Kurt Gödel, in Vienna, publishes “On formally undecidable propositions of <em>Principia Mathematica</em> and related systems I”: arithmetic, coded into itself, contains true sentences it cannot prove.' },
  { year: 1936, date: '1936', text: 'Gerhard Gentzen proves Peano arithmetic consistent by an induction that runs through the ordinals up to ε₀; in 1943 he shows that arithmetic itself can reach every ordinal below ε₀ but not ε₀.' },
  { year: 1944, date: 'June 1944', text: 'Reuben Goodstein proves that every Goodstein sequence, however high it climbs, comes back down to zero.' },
  { year: 1955, date: '1955', text: 'Martin Löb answers a question Leon Henkin posed in 1952: a sentence of arithmetic that asserts its own provability is provable.' },
  { year: 1979, date: '1979', text: 'Douglas Hofstadter’s <em>Gödel, Escher, Bach</em> poses the MU puzzle, coins the verb “to quine” and makes the strange loop its theme; it wins the 1980 Pulitzer Prize for General Nonfiction.' },
  { year: 1982, date: 'July 1982', text: 'Laurie Kirby and Jeff Paris prove that Hercules always slays the hydra, and that neither this nor Goodstein’s theorem can be proved in Peano arithmetic.' },
  { year: 1984, date: 'August 1984', text: 'Ken Thompson’s Turing Award lecture, “Reflections on Trusting Trust,” turns a self-reproducing program into a compiler Trojan horse that leaves “no trace in source anywhere.”' },
  { year: 2023, date: 'April 2023', text: 'The GNU Guix project builds a package graph of more than 22,000 nodes from source, rooted in one 357-byte program: Thompson’s problem answered by shrinking what must be trusted.' },
];

const SOURCES = [
  { text: 'Kurt Gödel, “Über formal unentscheidbare Sätze der <em>Principia Mathematica</em> und verwandter Systeme I,” <em>Monatshefte für Mathematik und Physik</em> 38 (1931) 173–198', url: 'https://doi.org/10.1007/BF01700692' },
  { text: 'Panu Raatikainen, “Gödel’s Incompleteness Theorems,” <em>Stanford Encyclopedia of Philosophy</em>', url: 'https://plato.stanford.edu/entries/goedel-incompleteness/' },
  { text: 'Jan von Plato, “The Development of Proof Theory,” <em>Stanford Encyclopedia of Philosophy</em> (on Gentzen’s proofs of 1936 and 1943)', url: 'https://plato.stanford.edu/entries/proof-theory-development/' },
  { text: 'Douglas R. Hofstadter, <em>Gödel, Escher, Bach: an Eternal Golden Braid</em> (Basic Books, 1979)' },
  { text: 'R. L. Goodstein, “On the Restricted Ordinal Theorem,” <em>Journal of Symbolic Logic</em> 9 (1944) 33–41', url: 'https://doi.org/10.2307/2268019' },
  { text: 'Laurie Kirby and Jeff Paris, “Accessible Independence Results for Peano Arithmetic,” <em>Bulletin of the London Mathematical Society</em> 14 (1982) 285–293', url: 'https://doi.org/10.1112/blms/14.4.285' },
  { text: 'M. H. Löb, “Solution of a Problem of Leon Henkin,” <em>Journal of Symbolic Logic</em> 20 (1955) 115–118', url: 'https://doi.org/10.2307/2266895' },
  { text: 'Ken Thompson, “Reflections on Trusting Trust,” <em>Communications of the ACM</em> 27 (1984) 761–763', url: 'https://doi.org/10.1145/358198.358210' },
  { text: 'Lawrence C. Paulson, “A Machine-Assisted Proof of Gödel’s Incompleteness Theorems for the Theory of Hereditarily Finite Sets,” <em>Review of Symbolic Logic</em> 7 (2014) 484–498', url: 'https://doi.org/10.1017/S1755020314000112' },
  { text: 'Pierre Castéran et al., <em>Hydras &amp; Co.</em>: hydra battles and ordinals in Coq, now Rocq (library and book)', url: 'https://github.com/rocq-community/hydra-battles' },
];

const LEGEND = `
  <p>Apollodorus tells it this way, in J. G. Frazer’s translation. The hydra of Lerna had nine heads, “eight mortal, but the
  middle one immortal,” and when Heracles smashed them with his club, “as fast as one head was
  smashed there grew up two.” Iolaus set part of the nearby wood alight and seared the roots of
  the heads with the brands, so that nothing could sprout; Heracles chopped off the immortal head and
  buried it under a heavy rock “beside the road that leads through Lerna to Elaeus.” Then Eurystheus refused to
  count the labour, because Heracles “had not got the better of the hydra by himself, but with
  the help of Iolaus.”</p>
  <p>Kirby and Paris’s Hercules needs no fire and no helper: any order of chops at all wins. The
  help he needs is ε₀, and Peano arithmetic, like Eurystheus, will not count it.</p>`;

const SPECULATION = `
  <p>Does incompleteness say anything about minds? In 1961 the philosopher J. R. Lucas wrote that
  Gödel’s theorem “seems to me to prove that Mechanism is false”: given any consistent machine that
  can do simple arithmetic, there is a formula it cannot produce as true “but which we can see to be true.”
  Roger Penrose revived the argument in <em>The Emperor’s New Mind</em> (1989) and <em>Shadows
  of the Mind</em> (1994). The standard reply goes back to Hilary Putnam in 1960. Gödel’s theorem
  is conditional: we can see that a system’s Gödel sentence is true only if we can see that the
  system is consistent, so the argument needs minds that can always tell, and there is no reason
  to think ours can. There is wide consensus that the argument fails.</p>
  <p>Hofstadter drew the opposite moral. In <em>I Am a Strange Loop</em> (2007) he argues that the
  sense of being an “I” is itself a strange loop, a pattern that comes to represent itself.
  Neither side is a theorem.</p>`;

/* ==================== the exhibit ==================== */

export default {
  id: 'loop',
  movement: 3,
  title: 'The Strange Loop',
  hook: 'A sentence builds itself out of its own blueprint and says: you cannot prove me.',
  era: '1931 – today · Gödel, Gentzen, Goodstein, Löb, Kirby and Paris',
  chronicle: CHRONICLE,
  today: TODAY,
  sources: SOURCES,
  alt: 'Three acts on one stage: Hofstadter’s MIU string game with a mod-3 compass and a map of the theorems a machine finds within 22 letters; a program that prints itself beside a machine that builds a sentence speaking of its own code; and a Kirby–Paris hydra whose ordinal, in Cantor normal form, falls with every chop, with Goodstein sequences, a tower of consistency statements and a ruler of theories reaching ε₀ and beyond.',
  prose: PROSE,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const doc = stage.ownerDocument || document;
    const FALLBACK_MONO = 'ui-monospace, Menlo, monospace';
    const SERIF = (() => { try { return getComputedStyle(doc.body).fontFamily || 'Georgia, serif'; } catch { return 'Georgia, serif'; } })();
    const MONO = (() => {
      try { return getComputedStyle(doc.documentElement).getPropertyValue('--mono').trim() || FALLBACK_MONO; }
      catch { return FALLBACK_MONO; }
    })();
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => !!(mq && mq.matches);
    const now = () => performance.now() / 1000;
    const ease = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
    const RES = { 0: P.crimson, 1: P.gold, 2: P.azure };        // I-count residues
    const RES_BRIGHT = { 0: P.crimsonBright, 1: P.goldBright, 2: '#a9c6ea' };

    const cssVar = (name, fb) => { try { return getComputedStyle(doc.documentElement).getPropertyValue(name).trim() || fb; } catch { return fb; } };
    const FAINT = cssVar('--ink-faint', P.inkFaint);   // the shell's more legible faint ink

    const bus = audio.createBus('loop');

    /* ---------- canvas type helpers ---------- */
    function setFont(ctx, px, family, o = {}) {
      ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || 400} ${Math.max(6, px)}px ${family}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = o.track || '0px';
      if ('fontVariantCaps' in ctx) ctx.fontVariantCaps = o.caps || 'normal';
    }
    function resetFont(ctx) {
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      if ('fontVariantCaps' in ctx) ctx.fontVariantCaps = 'normal';
    }
    function capsLabel(ctx, text, x, y, px, color, align = 'left') {
      setFont(ctx, px, SERIF, { caps: 'all-small-caps', track: '1.2px' });
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, y);
      resetFont(ctx);
    }
    // Ordinal in Cantor normal form as typeset runs: serif italic ω, true
    // superscripts, upright figures.
    function ordRuns(a, size, dy = 0, out = []) {
      if (ordIsFinite(a)) { out.push({ t: String(a), s: size, dy }); return out; }
      a.terms.forEach(([e, c], i) => {
        if (i) out.push({ t: ' + ', s: size, dy });
        if (ordIsFinite(e) && e === 0) { out.push({ t: String(c), s: size, dy }); return; }
        out.push({ t: 'ω', s: size, dy, it: true });
        if (!(ordIsFinite(e) && e === 1)) ordRuns(e, size * 0.7, dy - size * 0.42, out);
        if (c > 1) out.push({ t: '·' + c, s: size, dy });
      });
      return out;
    }
    function drawRuns(ctx, runs, x, y, align, color) {
      let w = 0;
      for (const r of runs) { setFont(ctx, r.s, SERIF, { italic: r.it }); r.w = ctx.measureText(r.t).width; w += r.w; }
      let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ctx.fillStyle = color; ctx.textAlign = 'left';
      for (const r of runs) { setFont(ctx, r.s, SERIF, { italic: r.it }); ctx.fillText(r.t, cx, y + r.dy); cx += r.w; }
      resetFont(ctx);
      return w;
    }
    const EPS0_RUNS = (s) => [{ t: 'ε', s, dy: 0, it: true }, { t: '0', s: s * 0.68, dy: s * 0.22 }];
    const OMEGA = { terms: [[1, 1]] };
    const W_W = { terms: [[OMEGA, 1]] };
    const W_W_W = { terms: [[W_W, 1]] };

    /* ---------- scoped styles ---------- */
    const style = doc.createElement('style');
    style.textContent = `
      #ex-loop .lp-acts { display:flex; gap:.5rem; flex-wrap:wrap; margin:0 0 1.1rem; }
      #ex-loop .lp-acts.sub { margin:.2rem 0 .9rem; }
      #ex-loop .miu-cur { font:600 1.55rem/1.3 ${MONO}; letter-spacing:.14em; color:${P.goldBright};
        text-align:center; margin:.5rem 0 .1rem; overflow-wrap:anywhere; transition:font-size .2s ease; }
      #ex-loop .miu-cur.long { font-size:.98rem; letter-spacing:.05em; }
      #ex-loop .miu-godel { font:.8rem/1.5 ${MONO}; color:${P.inkDim}; text-align:center;
        margin-bottom:.4rem; overflow-wrap:anywhere; }
      #ex-loop .miu-godel .r1 { color:${P.gold}; } #ex-loop .miu-godel .r2 { color:${P.azure}; }
      #ex-loop .miu-godel .nw { white-space:nowrap; }
      #ex-loop .chips { display:flex; flex-wrap:wrap; gap:.4rem; justify-content:center;
        margin:.5rem 0; min-height:2.2rem; }
      #ex-loop .chips .btn { font-family:${MONO}; letter-spacing:.02em; }
      #ex-loop .chips .btn .rn { font-family:var(--serif, Georgia, serif); font-style:italic;
        color:var(--ink-faint, ${FAINT}); margin-right:.35em; }
      #ex-loop .chips .note { font:.78rem ${MONO}; color:var(--ink-faint, ${FAINT}); align-self:center; }
      #ex-loop .hist { font:.78rem/1.75 ${MONO}; color:var(--ink-faint, ${FAINT}); max-height:5.4em;
        overflow-y:auto; margin:.5rem 0; overflow-wrap:anywhere; }
      #ex-loop .hist .r1 { color:${P.goldDim}; } #ex-loop .hist .r2 { color:${P.azureDim}; }
      #ex-loop .lp-figs { display:flex; flex-wrap:wrap; gap:.9rem; margin:.7rem 0 .2rem; }
      #ex-loop .lp-fig { flex:1 1 300px; min-width:0; }
      #ex-loop .lp-judge { display:flex; flex-wrap:wrap; gap:.55rem .7rem; align-items:center;
        margin:1.1rem 0 .3rem; }
      #ex-loop .lp-judge .lbl { font-size:.8rem; font-variant-caps:all-small-caps; letter-spacing:.14em;
        color:${P.inkDim}; }
      #ex-loop .lp-in { font:600 .95rem ${MONO}; letter-spacing:.12em; color:${P.goldBright};
        background:var(--bg-inset, ${P.bg}); border:1px solid ${P.line}; border-radius:5px;
        padding:.34rem .6rem; width:13.5ch; max-width:100%; text-transform:uppercase; }
      #ex-loop .lp-in:focus-visible { outline:2px solid ${P.goldBright}; outline-offset:1px; }
      #ex-loop .lp-verdict { font-size:.93rem; color:${P.inkDim}; margin:.25rem 0 .5rem; min-height:1.5em; }
      #ex-loop .lp-verdict .yes { color:${P.verdant}; } #ex-loop .lp-verdict .no { color:${P.crimsonBright}; }
      #ex-loop .lp-verdict code { font-family:${MONO}; color:${P.goldBright}; }
      #ex-loop .reveal { display:none; border-left:2px solid ${P.gold}; background:${P.panel};
        padding:.75rem .95rem; margin:.9rem 0; border-radius:0 8px 8px 0; font-size:.93rem;
        color:${P.ink}; }
      #ex-loop .reveal.shown { display:block; animation: exloop-fadeup .6s both; }
      #ex-loop .boxes { display:flex; flex-wrap:wrap; gap:.9rem; align-items:flex-start; }
      #ex-loop .box { flex:1 1 320px; background:${P.panel}; border:1px solid ${P.line};
        border-radius:8px; padding:.85rem .95rem; min-width:0; }
      #ex-loop .box .bx-title { font-size:.84rem; letter-spacing:.16em; font-variant-caps:all-small-caps;
        color:${P.inkDim}; margin-bottom:.45rem; }
      #ex-loop .box pre { font:.78rem/1.55 ${MONO}; color:${P.ink}; background:var(--bg-inset, ${P.bg});
        border:1px solid ${P.line}; border-radius:6px; padding:.5rem .6rem;
        margin:.4rem 0; white-space:pre-wrap; overflow-wrap:anywhere; }
      #ex-loop .box pre.out { border-color:${P.verdant}55; }
      #ex-loop .ch { color:${P.inkDim}; }
      #ex-loop .ch.ok { color:${P.verdant}; animation: exloop-ok .5s both; }
      #ex-loop .fp-line { font:.8rem/1.6 ${MONO}; margin:.5rem 0; overflow-wrap:anywhere;
        animation: exloop-fadeup .55s both; }
      #ex-loop .fp-line.prose { font:.92rem/1.55 var(--serif, Georgia, serif); }
      #ex-loop .fp-line .fp-tag { color:var(--ink-faint, ${FAINT}); font:italic .82rem/1.4 var(--serif, Georgia, serif);
        display:block; margin-bottom:.1rem; }
      #ex-loop .fp-hole { color:${P.crimsonBright}; }
      #ex-loop .fp-fill { color:${P.goldBright}; border-bottom:1px solid ${P.goldDim}; padding-bottom:1px; }
      #ex-loop .fp-row { display:block; }
      #ex-loop .fp-row .k { display:inline-block; min-width:8.4em; padding-right:.5em; color:var(--ink-faint, ${FAINT}); }
      #ex-loop .lp-was { color:var(--ink-faint, ${FAINT}); font-size:.86em; }
      #ex-loop .lp-was .ok { color:${P.verdant}; }
      #ex-loop .mathline sup, #ex-loop .gs-row sup, #ex-loop .gs-note sup { font-size:.7em; line-height:0; }
      #ex-loop .hy-ctl .ctl { min-width:0; }
      #ex-loop .gs-table { font:.76rem/1.6 ${MONO}; max-height:300px; overflow:auto;
        border:1px solid ${P.line}; border-radius:6px; margin:.5rem 0; background:var(--bg-inset, ${P.bg}); }
      #ex-loop .gs-row { display:grid; grid-template-columns:2.4rem 2.6rem minmax(0,1fr) minmax(0,1fr) minmax(6rem,.7fr);
        gap:.7rem; padding:.2rem .6rem; border-bottom:1px solid ${P.line}33; }
      #ex-loop .gs-row > div { min-width:0; overflow-wrap:anywhere; }
      #ex-loop .gs-row.gs-head { position:sticky; top:0; z-index:1; background:${P.panel}; color:var(--ink-faint, ${FAINT});
        border-bottom:1px solid ${P.line}; font-family:var(--serif, Georgia, serif);
        font-variant-caps:all-small-caps; letter-spacing:.1em; font-size:.84rem; }
      #ex-loop .gs-row .lab { display:none; }
      #ex-loop .gs-note { font-size:.9rem; color:${P.inkDim}; font-style:italic; margin:.45rem 0; }
      #ex-loop .stretch { border-top:1px solid ${P.line}; margin-top:1.8rem; padding-top:1rem; }
      #ex-loop .stretch .st-title { font-size:.9rem; letter-spacing:.2em; font-variant-caps:all-small-caps;
        color:${P.crimsonBright}; margin-bottom:.6rem; }
      #ex-loop .stretch p { font-size:.95rem; color:${P.inkDim}; margin:.6rem 0; }
      #ex-loop .stretch p code { font-family:${MONO}; color:${P.azure}; }
      #ex-loop .lp-tower { display:flex; flex-direction:column-reverse; align-items:center; gap:.3rem;
        margin:.9rem 0 .4rem; min-height:2rem; }
      #ex-loop .lp-floor { font:.8rem/1.4 ${MONO}; color:${P.inkDim}; border:1px solid ${P.line};
        background:${P.panel}; border-radius:4px; padding:.22rem .7rem; max-width:100%;
        overflow-wrap:anywhere; text-align:center; animation: exloop-fadeup .45s both; }
      #ex-loop .lp-floor.top { color:${P.goldBright}; border-color:${P.goldDim}; }
      #ex-loop .lp-floor sub { font-size:.72em; }
      #ex-loop canvas.lp-focusable:focus-visible { outline:2px solid ${P.goldBright}; outline-offset:2px; }
      @keyframes exloop-fadeup { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:none; } }
      @keyframes exloop-ok { from { color:${P.inkDim}; } to { color:${P.verdant}; } }
      @media (max-width: 640px) {
        #ex-loop .gs-row { grid-template-columns:1fr; gap:.1rem; padding:.45rem .6rem; }
        #ex-loop .gs-row.gs-head { display:none; }
        #ex-loop .gs-row .lab { display:inline; color:var(--ink-faint, ${FAINT}); font-family:var(--serif, Georgia, serif);
          font-style:italic; margin-right:.5em; }
        #ex-loop .gs-row > div:first-child { color:var(--ink-faint, ${FAINT}); }
      }
      @media (prefers-reduced-motion: reduce) {
        #ex-loop .reveal.shown, #ex-loop .fp-line, #ex-loop .ch.ok, #ex-loop .lp-floor { animation:none; }
        #ex-loop .miu-cur { transition:none; }
      }
    `;
    stage.appendChild(style);

    /* ---------- act tabs ---------- */
    const tabsRow = doc.createElement('div');
    tabsRow.className = 'lp-acts';
    stage.appendChild(tabsRow);
    const actWraps = {};
    const tabBtns = {};
    let act = 1;
    for (const [n, label] of [[1, 'I · the MU game'], [2, 'II · the mirror'], [3, 'III · the hydra']]) {
      tabBtns[n] = ui.button(tabsRow, label, () => showAct(n), { small: true });
    }
    for (const n of [1, 2, 3]) {
      const d = doc.createElement('div');
      d.style.display = 'none';
      stage.appendChild(d);
      actWraps[n] = d;
    }
    function showAct(n) {
      act = n;
      for (const k of [1, 2, 3]) {
        actWraps[k].style.display = k === n ? '' : 'none';
        tabBtns[k].classList.toggle('active', k === n);
        tabBtns[k].setAttribute('aria-pressed', String(k === n));
      }
      poke(1.2);
    }

    // shared redraw window: canvases repaint only while something moves
    let animUntil = 0;
    const poke = (dur = 1.0) => { animUntil = Math.max(animUntil, now() + dur); };

    /* ================== ACT I — the MU game ================== */
    const a1 = actWraps[1];
    const quest = ui.questBanner(a1, 'Derive <code>MU</code>. The axiom is <code>MI</code>; the four rules deal themselves below.');

    let cur = 'MI';
    let hist = ['MI'];
    let moveCount = 0;
    let revealed = false;
    let bfs = null;          // makeBFS instance while enumerating
    let bfsDone = false;
    let bfsRunning = false;  // the enumeration is advancing (not paused)
    let bfsSched = null;     // ticking sound scheduler
    let pulse = { t0: -9, from: 1, to: 1, rule: 0 };
    let braid = [];          // recent residue transitions, for the compass
    let derive = null;       // { steps, i, acc } while replaying a derivation
    const BFS_LEN = 22;      // 37,988 distinct theorems, enumerable in seconds
    const FIELD_ROWS = BFS_LEN; // I-counts 0..21
    const field = [];        // field[len][icount] = number of theorems found
    let fieldMax = 1;
    const resetField = () => {
      field.length = 0;
      for (let L = 0; L <= BFS_LEN; L++) field.push(new Array(FIELD_ROWS).fill(0));
      fieldMax = 1;
    };
    resetField();

    const curLine = doc.createElement('div');
    curLine.className = 'miu-cur';
    a1.appendChild(curLine);
    const godelLine = doc.createElement('div');
    godelLine.className = 'miu-godel';
    a1.appendChild(godelLine);

    const chips = doc.createElement('div');
    chips.className = 'chips';
    a1.appendChild(chips);

    const a1ctl = ui.controlRow(a1);
    ui.button(a1ctl, '↶ undo', () => {
      stopDerive();
      if (hist.length < 2) return;
      hist.pop();
      const r = iCount(cur) % 3;
      cur = hist[hist.length - 1];
      pulse = { t0: now(), from: r, to: iCount(cur) % 3, rule: 0 };
      refreshMIU(); poke();
    }, { small: true });
    ui.button(a1ctl, '⟲ back to MI', () => {
      stopDerive();
      cur = 'MI'; hist = ['MI']; braid = [];
      pulse = { t0: now(), from: 1, to: 1, rule: 0 };
      refreshMIU(); poke();
    }, { small: true });
    const bfsBtn = ui.button(a1ctl, '⚙ enumerate every theorem', toggleBFS);
    const bfsOut = ui.readout(a1, 'The machine can also play by itself, exhaustively.');

    const histLine = doc.createElement('div');
    histLine.className = 'hist';
    histLine.setAttribute('aria-label', 'your derivation so far, each string with its I-count mod 3');
    a1.appendChild(histLine);

    const figs = doc.createElement('div');
    figs.className = 'lp-figs';
    a1.appendChild(figs);
    const figA = doc.createElement('div'); figA.className = 'lp-fig'; figs.appendChild(figA);
    const figB = doc.createElement('div'); figB.className = 'lp-fig'; figs.appendChild(figB);
    const compass = cv.setupCanvas(figA, { height: 240 });
    compass.canvas.setAttribute('role', 'img');
    compass.canvas.setAttribute('aria-label', 'The I-count modulo 3: rule II swaps residues 1 and 2, the other rules leave the residue alone, and residue 0, where MU lives, is never reached.');
    compass.onResize(() => poke());
    const fieldCv = cv.setupCanvas(figB, { height: 240 });
    fieldCv.canvas.setAttribute('role', 'img');
    fieldCv.canvas.setAttribute('aria-label', 'A grid of theorems by length and number of I’s. Rows whose I-count is a multiple of 3 stay empty.');
    fieldCv.onResize(() => poke());
    const travelSprite = cv.glowSprite(P.goldBright, 26);
    const nodeGlow = { 1: cv.glowSprite(P.gold, 64), 2: cv.glowSprite(P.azure, 64) };

    // "Is it a theorem?" — the decision procedure, and a derivation to watch
    const judge = doc.createElement('div');
    judge.className = 'lp-judge';
    a1.appendChild(judge);
    const jLab = doc.createElement('label');
    jLab.className = 'lbl';
    jLab.textContent = 'is it a theorem?';
    judge.appendChild(jLab);
    const jIn = doc.createElement('input');
    jIn.className = 'lp-in';
    jIn.type = 'text';
    jIn.maxLength = 24;
    jIn.spellcheck = false;
    jIn.autocomplete = 'off';
    jIn.value = 'MIIUII';
    jIn.id = 'lp-judge-in';
    jLab.htmlFor = jIn.id;
    jIn.setAttribute('aria-describedby', 'lp-verdict');
    judge.appendChild(jIn);
    ui.button(judge, 'judge', () => judgeIt(true), { small: true });
    const deriveBtn = ui.button(judge, '▶ derive it', () => startDerive(), { small: true });
    const verdict = doc.createElement('div');
    verdict.className = 'lp-verdict';
    verdict.id = 'lp-verdict';
    verdict.setAttribute('aria-live', 'polite');
    a1.appendChild(verdict);
    jIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); judgeIt(true); } });
    jIn.addEventListener('input', () => {
      const clean = jIn.value.toUpperCase().replace(/[^MIU]/g, '');
      if (clean !== jIn.value) jIn.value = clean;
      judgeIt(false);
    });

    const revealBox = doc.createElement('div');
    revealBox.className = 'reveal';
    revealBox.innerHTML =
      `Watch the compass: rule II doubles the <code>I</code>-count, which swaps 1 and 2 mod 3; rule` +
      ` III subtracts three, no move at all mod 3; rules I and IV leave it alone. The count starts at` +
      ` 1 and can never reach a multiple of 3, and <code>MU</code> needs zero. You have just proved a` +
      ` theorem <em>about</em> the system that no derivation <em>inside</em> it could ever be: the rules` +
      ` rewrite strings; they do not talk about strings. The map of theorems shows the same` +
      ` fact from the machine’s side: in the enumeration, the rows whose <code>I</code>-count is a` +
      ` multiple of 3 stay empty, and every other string of up to eleven letters turns up. That gap` +
      ` between playing and knowing is the whole subject of this exhibit.`;
    a1.appendChild(revealBox);

    ui.caption(a1,
      'Rules: I, x<code>I</code> → x<code>IU</code> · II, <code>M</code>x → <code>M</code>xx · ' +
      'III, x<code>III</code>y → x<code>U</code>y · IV, x<code>UU</code>y → xy. ' +
      'The enumeration is honest but finite (strings kept to ' + BFS_LEN + ' letters or fewer); the ' +
      'search proves nothing by itself, and the mod-3 compass is the proof. The judge applies the ' +
      'decision procedure; a derivation it plays back is a real one, checked rule by rule.');

    const shortStr = (s) => s.length <= 26 ? s : s.slice(0, 12) + '…' + s.slice(-12);
    const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
    const RULE_PITCH = { 1: 830, 2: 620, 3: 990, 4: 520 };
    const resSpan = (s) => { const r = iCount(s) % 3; return `<span class="r${r}">(${r})</span>`; };

    function refreshMIU() {
      curLine.textContent = cur;
      curLine.classList.toggle('long', cur.length > 22);
      const r = iCount(cur) % 3;
      godelLine.innerHTML = `as a number: ${godelNumber(cur)}  ·  <span class="nw r${r}">I-count ${iCount(cur)} ≡ ${r} (mod 3)</span>`;
      chips.replaceChildren();
      const moves = miuMoves(cur, 40);
      for (const m of moves.slice(0, 14)) {
        const b = ui.button(chips, '', () => { stopDerive(); applyMove(m); }, { small: true });
        const rn = doc.createElement('span'); rn.className = 'rn'; rn.textContent = ROMAN[m.rule];
        b.append(rn, shortStr(m.to));
        b.setAttribute('aria-label', `rule ${ROMAN[m.rule]} gives ${m.to}`);
      }
      if (moves.length > 14) {
        const more = doc.createElement('span');
        more.className = 'note';
        more.textContent = `(+ ${moves.length - 14} more moves not shown)`;
        chips.appendChild(more);
      }
      if (moves.length === 0) {
        const dead = doc.createElement('span');
        dead.className = 'note';
        dead.textContent = 'no legal moves under this page’s 40-letter cap; undo, or start over';
        chips.appendChild(dead);
      }
      histLine.innerHTML = hist.map((s) => `${shortStr(s)}${resSpan(s)}`).join(' → ');
      histLine.scrollTop = histLine.scrollHeight;
    }

    function applyMove(m, { sound = true } = {}) {
      audio.ensureAudio();
      const from = iCount(cur) % 3;
      cur = m.to;
      hist.push(cur);
      moveCount++;
      const to = iCount(cur) % 3;
      pulse = { t0: now(), from, to, rule: m.rule };
      braid.push({ from, to, rule: m.rule });
      if (braid.length > 24) braid.shift();
      if (sound) audio.drums.wood(bus, bus.context.currentTime, { level: 0.4, pitch: RULE_PITCH[m.rule] });
      refreshMIU();
      poke();
      if (moveCount >= 10) reveal();
    }

    function reveal() {
      if (revealed) return;
      revealed = true;
      revealBox.classList.add('shown');
      quest.done('You cannot derive <code>MU</code>, and now you can <em>prove</em> that, from outside the rules.');
      poke(2);
    }

    function judgeIt(loud) {
      const v = miuVerdict(jIn.value);
      deriveBtn.disabled = !v.ok;
      const code = (s) => `<code>${s}</code>`;
      if (v.kind === 'empty' || v.kind === 'alphabet') verdict.innerHTML = 'Type a string of <code>M</code>, <code>I</code> and <code>U</code>.';
      else if (v.kind === 'm') verdict.innerHTML = `${code(v.s)}: <span class="no">not a theorem.</span> Every theorem is one <code>M</code> followed by <code>I</code> and <code>U</code> only; no rule creates, moves or removes an <code>M</code>.`;
      else if (v.kind === 'mod3') verdict.innerHTML = `${code(v.s)}: <span class="no">not a theorem.</span> Its count of <code>I</code> is ${v.n}, a multiple of 3, and no derivation ever reaches one.`;
      else if (v.kind === 'theorem') verdict.innerHTML = `${code(v.s)}: <span class="yes">a theorem.</span> One <code>M</code> in front, and its count of <code>I</code> is ${v.n}, not a multiple of 3. Press <em>derive it</em> to watch a derivation.`;
      if (loud) audio.ensureAudio();
    }

    function startDerive() {
      const v = miuVerdict(jIn.value);
      if (!v.ok) return;
      audio.ensureAudio();
      const steps = miuDerive(v.s);
      if (!steps) return;
      const seq = ['MI', ...steps.map((s) => s.to)];
      const ok = miuCheckDerivation(seq);
      cur = 'MI'; hist = ['MI']; braid = [];
      refreshMIU();
      derive = { steps, i: 0, acc: 0, dt: steps.length > 24 ? 0.14 : 0.3 };
      verdict.innerHTML = `Deriving <code>${v.s}</code> in ${steps.length} step${steps.length === 1 ? '' : 's'}` +
        `${ok ? ', each one a legal move' : ''}` +
        `${steps.some((s) => s.to.length > 22) ? '. Rule II has to overshoot first: the doubling cannot be stopped halfway.' : '.'}`;
      poke();
    }
    function stopDerive() { derive = null; }
    function pumpDerive(dt) {
      if (!derive) return;
      derive.acc += dt;
      while (derive && derive.acc >= derive.dt) {
        derive.acc -= derive.dt;
        const st = derive.steps[derive.i++];
        applyMove(st, { sound: derive.dt > 0.2 || derive.i % 2 === 0 });
        if (derive.i >= derive.steps.length) {
          audio.drums.thock(bus, bus.context.currentTime + 0.05, { level: 0.4 });
          derive = null;
        }
      }
      poke(0.4);
    }

    function toggleBFS() {
      audio.ensureAudio();
      if (bfs && !bfs.done && bfsRunning) {
        pauseBFS();
        bfsOut.set(`Paused at ${formatBig(bfs.count)} theorems; MU is not among them. Press again to resume.`);
        return;
      }
      if (!bfs || bfsDone) {
        resetField();
        bfsDone = false;
        bfs = makeBFS(BFS_LEN, 400000, (s) => {
          const L = s.length, n = iCount(s);
          if (L <= BFS_LEN && n < FIELD_ROWS) {
            const c = ++field[L][n];
            if (c > fieldMax) fieldMax = c;
          }
        });
      }
      bfsRunning = true;
      bfsBtn.classList.add('active');
      bfsBtn.textContent = '⏸ enumerating…';
      startBfsSound();
      poke();
    }
    function startBfsSound() {
      if (bfsSched) bfsSched.stop();
      bfsSched = audio.createScheduler((t) => {
        if (!bfs || bfs.done || !bfsRunning) return null;
        audio.drums.hat(bus, t, { level: 0.1 });
        return t + 0.09;
      });
      bfsSched.start();
    }
    function pauseBFS() {
      bfsRunning = false;
      if (bfsSched) { bfsSched.stop(); bfsSched = null; }
      bfsBtn.classList.remove('active');
      bfsBtn.textContent = bfsDone ? '⚙ enumerate every theorem' : '⚙ resume the enumeration';
    }
    function pumpBFS() {
      if (!bfs || bfs.done || !bfsRunning) return;
      bfs.step(350);
      if (bfs.done) {
        bfsDone = true;
        const n = bfs.count;
        pauseBFS();
        bfsOut.set(`Done: every theorem reachable without growing past ${BFS_LEN} letters, ` +
          `${formatBig(n)} strings. MU is not among them.`);
        audio.drums.thock(bus, bus.context.currentTime, { level: 0.5 });
        reveal();
      } else {
        bfsOut.set(`theorem ${formatBig(bfs.count)} reached · latest ${shortStr(bfs.latest())} · MU not among them`);
      }
    }

    // quadratic Bézier point
    const qpt = (a, c, b, u) => [
      (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0],
      (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1],
    ];
    function arrowHead(ctx, tip, from, size) {
      const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(tip[0] - size * Math.cos(ang - 0.42), tip[1] - size * Math.sin(ang - 0.42));
      ctx.lineTo(tip[0] - size * Math.cos(ang + 0.42), tip[1] - size * Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fill();
    }

    function drawCompass(t) {
      const { ctx, width: W, height: H } = compass;
      ctx.clearRect(0, 0, W, H);
      if (W < 120) return;
      const narrow = W < 400;
      const cy = H * 0.6;
      const dx = Math.min(W * 0.31, 165);
      const pos = { 1: [W / 2 - dx, cy], 2: [W / 2 + dx, cy], 0: [W / 2, H * 0.24] };
      const R = 15;
      capsLabel(ctx, 'the I-count, mod 3', 12, 20, 13, P.inkDim);

      // the island that no arrow reaches: faint approaches that stop short
      ctx.save();
      ctx.strokeStyle = P.crimson; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      for (const r of [1, 2]) {
        const [x, y] = pos[r], [x0, y0] = pos[0];
        const ux = x0 - x, uy = y0 - y, L = Math.hypot(ux, uy) || 1;
        const sx = x + ux / L * (R + 6), sy = y + uy / L * (R + 6);
        const ex = x + ux / L * (L * 0.55), ey = y + uy / L * (L * 0.55);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(ex - uy / L * 5, ey + ux / L * 5); ctx.lineTo(ex + uy / L * 5, ey - ux / L * 5); ctx.stroke();
        ctx.setLineDash([2, 4]);
      }
      ctx.restore();

      // rule II arcs: 1 → 2 above, 2 → 1 below; the visitor's braid in faint strands
      const arcPts = (from, to, bend) => {
        const a = [pos[from][0] + (to > from ? R + 3 : -(R + 3)), pos[from][1] - 3 * Math.sign(-bend)];
        const b = [pos[to][0] + (to > from ? -(R + 3) : R + 3), pos[to][1] - 3 * Math.sign(-bend)];
        const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + bend];
        return [a, c, b];
      };
      const sign = (from, to) => (from === 1 && to === 2 ? -1 : 1);
      braid.forEach((m, i) => {
        if (m.rule !== 2) return;
        const k = braid.length - i;
        const [a, c, b] = arcPts(m.from, m.to, sign(m.from, m.to) * (56 + (i % 6) * 5));
        ctx.strokeStyle = RES[m.to]; ctx.globalAlpha = clamp(0.5 - k * 0.018, 0.08, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      for (const [f, tt] of [[1, 2], [2, 1]]) {
        const [a, c, b] = arcPts(f, tt, sign(f, tt) * 44);
        ctx.strokeStyle = P.azureDim; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke();
        ctx.fillStyle = P.azureDim;
        arrowHead(ctx, b, qpt(a, c, b, 0.9), 7);
      }
      setFont(ctx, narrow ? 12 : 13, SERIF, { italic: true });
      ctx.fillStyle = P.azure; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(narrow ? 'rule II doubles' : 'rule II doubles the count', W / 2, cy - 6);
      setFont(ctx, 11, MONO);
      ctx.fillStyle = P.azureDim;
      ctx.fillText('1 ⇄ 2', W / 2, cy + 10);

      // self-loops: rules I, III, IV leave the residue alone
      const LOOP_R = 11;
      const loopDir = (r) => (r === 1 ? -2.2 : -0.94);            // up and outward
      const loopC = (r) => [pos[r][0] + Math.cos(loopDir(r)) * (R + 6), pos[r][1] + Math.sin(loopDir(r)) * (R + 6)];
      const loopSpan = (r) => { const back = loopDir(r) + Math.PI; return [back + 0.95, back - 0.95 + Math.PI * 2]; };
      for (const r of [1, 2]) {
        const [lx, ly] = loopC(r);
        const [a0, a1] = loopSpan(r);
        ctx.strokeStyle = RES[r]; ctx.fillStyle = RES[r]; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(lx, ly, LOOP_R, a0, a1); ctx.stroke();
        const tip = [lx + LOOP_R * Math.cos(a1), ly + LOOP_R * Math.sin(a1)];
        const pre = [lx + LOOP_R * Math.cos(a1 - 0.5), ly + LOOP_R * Math.sin(a1 - 0.5)];
        arrowHead(ctx, tip, pre, 5.5);
        ctx.globalAlpha = 1;
      }

      // nodes
      const curR = iCount(cur) % 3;
      const pt = reduced() ? 1 : clamp((t - pulse.t0) / 0.45, 0, 1);
      for (const r of [1, 2]) {
        const [x, y] = pos[r];
        const active = curR === r;
        if (active) nodeGlow[r].draw(ctx, x, y, 1 + (1 - pt) * 0.35);
        ctx.fillStyle = active ? RES_BRIGHT[r] : P.panel;
        ctx.strokeStyle = RES[r];
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        setFont(ctx, 14, MONO, { weight: 600 });
        ctx.fillStyle = active ? P.bg : RES[r];
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(r), x, y + 0.5);
      }
      // the unreachable island: residue 0, where MU lives
      const [x0, y0] = pos[0];
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = P.crimson; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x0, y0, R + 1, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      setFont(ctx, 14, MONO, { weight: 600 });
      ctx.fillStyle = P.crimsonBright; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('0', x0, y0 + 0.5);
      setFont(ctx, 13, SERIF, { italic: true });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('MU lives here', x0 + R + 10, y0 - 2);
      setFont(ctx, 12, SERIF, { italic: true });
      ctx.fillStyle = FAINT;
      ctx.fillText('no rule ever lands', x0 + R + 10, y0 + 13);

      // the move just made, travelling its path
      if (!reduced() && t - pulse.t0 < 0.55 && pulse.rule) {
        const u = ease((t - pulse.t0) / 0.5);
        let p;
        if (pulse.from !== pulse.to) {
          const [a, c, b] = arcPts(pulse.from, pulse.to, sign(pulse.from, pulse.to) * 44);
          p = qpt(a, c, b, u);
        } else if (pulse.to === 1 || pulse.to === 2) {
          const [lx, ly] = loopC(pulse.to);
          const [a0, a1] = loopSpan(pulse.to);
          const ang = a0 + (a1 - a0) * u;
          p = [lx + LOOP_R * Math.cos(ang), ly + LOOP_R * Math.sin(ang)];
        }
        if (p) travelSprite.draw(ctx, p[0], p[1], 1);
      }

      // footer
      setFont(ctx, narrow ? 11.5 : 12, SERIF, { italic: true });
      ctx.fillStyle = FAINT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (narrow) {
        ctx.fillText('the small loops: rules I, III and IV', W / 2, H - 22);
        ctx.fillText('leave the count unchanged, mod 3', W / 2, H - 8);
      } else {
        ctx.fillText('the small loops: rules I, III and IV leave the count unchanged, mod 3', W / 2, H - 10);
      }
      resetFont(ctx);
    }

    function drawField() {
      const { ctx, width: W, height: H } = fieldCv;
      ctx.clearRect(0, 0, W, H);
      if (W < 120) return;
      const narrow = W < 400;
      capsLabel(ctx, narrow ? 'theorems found, by length' : 'theorems found, by length and I-count', 12, 20, 13, P.inkDim);
      const count = bfs ? bfs.count : 0;
      setFont(ctx, 11, MONO);
      ctx.fillStyle = count ? P.goldBright : FAINT; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(count ? formatBig(count) : 'not yet enumerated', W - 10, 20);

      const padL = 30, padR = 12, padT = 34, padB = 30;
      const cols = BFS_LEN - 1, rows = FIELD_ROWS;
      const cw = Math.max(1, (W - padL - padR) / cols), ch = Math.max(1, (H - padT - padB) / rows);
      const cx = (L) => padL + (L - 2) * cw;
      const cyy = (n) => H - padB - (n + 1) * ch;
      const lg = Math.log(1 + fieldMax);
      for (let L = 2; L <= BFS_LEN; L++) {
        for (let n = 0; n < Math.min(L, rows); n++) {
          const r = n % 3;
          const x = cx(L), y = cyy(n);
          if (r === 0) continue;
          const c = field[L][n];
          if (c) {
            ctx.fillStyle = RES[r];
            ctx.globalAlpha = 0.22 + 0.78 * Math.log(1 + c) / lg;
            ctx.fillRect(x + 0.5, y + 0.5, Math.max(0.5, cw - 1), Math.max(0.5, ch - 1));
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = P.inkGhost || P.line;
            ctx.fillRect(x + cw / 2 - 0.5, y + ch / 2 - 0.5, 1, 1);
          }
        }
      }
      // the empty lanes: I-counts that are multiples of 3
      ctx.strokeStyle = P.crimson; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
      ctx.setLineDash([2, 3]);
      for (let n = 0; n < rows; n += 3) {
        const y = Math.round(cyy(n) + ch / 2) + 0.5;
        ctx.beginPath(); ctx.moveTo(cx(Math.max(2, n + 1)), y); ctx.lineTo(cx(BFS_LEN) + cw, y); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // MU's cell, labelled along its own empty lane
      const mx = cx(2) + cw / 2, my = cyy(0) + ch / 2;
      const mr = Math.max(3.5, Math.min(cw, ch) * 0.62);
      ctx.strokeStyle = P.crimsonBright; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.stroke();
      setFont(ctx, 10.5, MONO, { weight: 600 });
      const muW = ctx.measureText('MU').width;
      ctx.fillStyle = P.bg;
      ctx.fillRect(mx + mr + 3, my - 6, muW + 6, 12);
      ctx.fillStyle = P.crimsonBright; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('MU', mx + mr + 6, my + 0.5);
      // where the visitor stands
      const L = cur.length, n = iCount(cur);
      if (L <= BFS_LEN && n < rows) {
        const x = cx(L), y = cyy(n);
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 1, y - 1, cw + 1, ch + 1);
      } else {
        setFont(ctx, 10, MONO);
        ctx.fillStyle = P.goldBright; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(`you: ${L} letters →`, W - padR, padT - 4);
      }
      // axes
      setFont(ctx, 9.5, MONO);
      ctx.fillStyle = FAINT; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      for (const Lx of [2, 12, 22]) ctx.fillText(String(Lx), cx(Lx) + cw / 2, H - padB + 4);
      setFont(ctx, 11, SERIF, { italic: true });
      ctx.textAlign = 'right';
      ctx.fillText('letters', cx(BFS_LEN) + cw, H - padB + 16);
      setFont(ctx, 9.5, MONO);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let k = 0; k < rows; k += 6) { ctx.fillStyle = P.crimsonBright; ctx.fillText(String(k), padL - 6, cyy(k) + ch / 2); }
      setFont(ctx, 11, SERIF, { italic: true });
      ctx.fillStyle = FAINT; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('I’s', 4, padT + 4);
      // the key, set in the upper-left triangle, where no string can ever sit
      // (a string of L letters has at most L − 1 I's)
      const KEY = [[1, 'I’s ≡ 1 (mod 3)'], [2, 'I’s ≡ 2 (mod 3)'], [0, 'I’s ≡ 0: never']];
      setFont(ctx, 11, SERIF, { italic: true });
      const keyW = 18 + Math.max(...KEY.map(([, l]) => ctx.measureText(l).width));
      const kx = padL + 6;
      // the lowest key line sits in row nLow; its first possible cell is at L = nLow + 1
      const nLow = rows - 1 - Math.floor((7 + 15 * (KEY.length - 1) + 4) / ch);
      if (kx + keyW + 4 < cx(nLow + 1)) {
        let ky = padT + 7;
        ctx.textBaseline = 'middle';
        for (const [kind, label] of KEY) {
          if (kind) {
            ctx.fillStyle = RES[kind]; ctx.globalAlpha = 0.85;
            ctx.fillRect(kx, ky - 3, 12, 6);
          } else {
            ctx.strokeStyle = P.crimson; ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath(); ctx.moveTo(kx, Math.round(ky) + 0.5); ctx.lineTo(kx + 12, Math.round(ky) + 0.5); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = kind ? P.inkDim : P.crimsonBright;
          ctx.fillText(label, kx + 18, ky + 0.5);
          ky += 15;
        }
      }
      resetFont(ctx);
    }

    /* ================== ACT II — the mirror ================== */
    const a2 = actWraps[2];
    const boxes = doc.createElement('div');
    boxes.className = 'boxes';
    a2.appendChild(boxes);

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // A string whose characters turn verdant one by one where they match `ref`.
    function matchSpans(s, ref, step = 0.018) {
      const chars = Array.from(s), rch = Array.from(ref);
      return chars.map((c, i) => {
        const ok = rch[i] === c;
        return `<span class="ch${ok ? ' ok' : ''}" style="animation-delay:${(i * step).toFixed(3)}s">${esc(c)}</span>`;
      }).join('');
    }

    // -- box A: the quine --
    const boxA = doc.createElement('div');
    boxA.className = 'box';
    boxes.appendChild(boxA);
    boxA.innerHTML = `<div class="bx-title">a program that prints itself</div>`;
    const quinePre = doc.createElement('pre');
    quinePre.textContent = QUINE;
    boxA.appendChild(quinePre);
    const qCtl = ui.controlRow(boxA);
    const qOut = doc.createElement('pre');
    qOut.className = 'out';
    qOut.style.display = 'none';
    qOut.setAttribute('aria-label', 'the program’s output');
    const qVerdict = ui.readout(boxA, 'blueprint (the string s) + copier (JSON.stringify) = self.');
    boxA.appendChild(qOut);
    ui.button(qCtl, '▶ run it', () => {
      audio.ensureAudio();
      audio.drums.wood(bus, bus.context.currentTime, { level: 0.35, pitch: 700 });
      const out = runQuine(QUINE);
      if (out === null) {
        qVerdict.set('This embedding forbids running strings as code; the text above still speaks for itself.');
        return;
      }
      qOut.innerHTML = matchSpans(out, QUINE, reduced() ? 0 : 0.012);
      qOut.style.display = '';
      const same = out === QUINE;
      qVerdict.set(same
        ? '✓ output = source, character for character. The program contains its own blueprint.'
        : '✗ mismatch, which would be a bug, not a theorem.');
      if (same) audio.playTone(bus, { freq: 784, dur: 0.35, level: 0.22, when: bus.context.currentTime + 0.9 });
    }, { small: true });
    ui.caption(boxA,
      'Programmers call such programs <em>quines</em>, after Hofstadter’s verb “to quine,” coined in ' +
      'honour of W. V. O. Quine. Kleene’s recursion theorem (1938) guarantees that one exists in every ' +
      'Turing-complete language.');

    // -- box B: the fixed-point factory --
    const boxB = doc.createElement('div');
    boxB.className = 'box';
    boxes.appendChild(boxB);
    boxB.innerHTML = `<div class="bx-title">the fixed-point factory (diagonal lemma)</div>`;
    const FP_PROPS = {
      Even: { desc: 'have an even number of symbols', test: (g) => Array.from(g).length % 2 === 0 },
      Odd: { desc: 'have an odd number of symbols', test: (g) => Array.from(g).length % 2 === 1 },
      Long: { desc: 'have more than 100 symbols', test: (g) => Array.from(g).length > 100 },
      Unprovable: { desc: 'am not provable', test: null },
      Provable: { desc: 'am provable', test: null },
    };
    const fpCtl = ui.controlRow(boxB);
    const fpSel = ui.select(fpCtl, {
      label: 'a property P of sentences',
      options: [
        { value: 'Even', label: '“…has an even number of symbols”' },
        { value: 'Odd', label: '“…has an odd number of symbols”' },
        { value: 'Long', label: '“…has more than 100 symbols”' },
        { value: 'Unprovable', label: '“…is not provable” (Gödel)' },
        { value: 'Provable', label: '“…is provable” (Henkin)' },
      ],
      value: 'Even',
    });
    const fpOut = doc.createElement('div');
    fpOut.setAttribute('aria-live', 'polite');
    boxB.appendChild(fpOut);
    ui.button(fpCtl, 'construct the sentence that says P of itself', () => {
      audio.ensureAudio();
      buildFP(fpSel.value);
    }, { small: true });

    function fpLine(i, tag, body, color, prose = false) {
      const d = doc.createElement('div');
      d.className = 'fp-line' + (prose ? ' prose' : '');
      d.style.animationDelay = reduced() ? '0s' : (i * 0.45) + 's';
      d.innerHTML = `<span class="fp-tag">${tag}</span><span style="color:${color}">${body}</span>`;
      fpOut.appendChild(d);
    }
    function buildFP(pname) {
      const t0 = bus.context.currentTime;
      for (let i = 0; i < 5; i++) {
        audio.playTone(bus, { freq: 420 * Math.pow(2, i / 12 * 2), dur: 0.18, level: 0.22, when: t0 + (reduced() ? i * 0.12 : i * 0.45) });
      }
      fpOut.replaceChildren();
      const { T, G } = buildFixedPoint(pname);
      const prop = FP_PROPS[pname];
      const hole = (s) => esc(s).split('□').join('<span class="fp-hole">□</span>');
      fpLine(0, 'the template T, P applied to a self-substitution, with a blank □:', hole(T), P.ink);
      fpLine(1, 'quote it:', hole(quote(T)), P.inkDim);
      const [pre, post] = T.split('□');
      fpLine(2, 'fill T’s blank with T’s own quotation; this is G:',
        `${esc(pre)}<span class="fp-fill">${esc(quote(T))}</span>${esc(post)}`, P.goldBright);
      const ev = evalDiag(G);
      const fixed = ev === quote(G);
      fpLine(3, 'now evaluate the diag(…) inside G, which substitutes a quoted string into itself, and set it against ⌜G⌝:',
        `<span class="fp-row"><span class="k">diag(⌜T⌝) =</span>${esc(ev)}</span>` +
        `<span class="fp-row"><span class="k">⌜G⌝ =</span>${matchSpans(quote(G), ev, reduced() ? 0 : 0.02)}</span>`, P.azure);
      fpLine(4, 'so G speaks of exactly one sentence, itself:',
        fixed ? `G ↔ ${pname}(⌜G⌝): “I ${prop.desc}.”` : 'construction error', P.verdant);
      if (prop.test) {
        const n = Array.from(G).length;
        const truth = prop.test(G);
        fpLine(5, 'and is it true? just count:',
          `G has ${n} symbols, so G is ${truth ? 'true' : 'false'}, and perfectly harmless. ` +
          `A fixed point need not be true; it need only refer.`, P.inkDim, true);
      } else if (pname === 'Unprovable') {
        fpLine(5, 'and is it true? here counting stops helping:',
          'If the theory is consistent, G is unprovable: a proof of G would be checkable, ' +
          'so the theory would also prove “G is provable,” contradicting G itself. Ruling out a ' +
          '<em>refutation</em> of G took ω-consistency (Gödel 1931) or a cleverer predicate ' +
          '(Rosser 1936). Seen from outside: unprovable, and therefore, being exactly the claim ' +
          'of its own unprovability, true.', P.inkDim, true);
      } else {
        fpLine(5, 'and is it true? here the mirror turns around:',
          'Leon Henkin asked in 1952 whether this sentence is provable. Martin Löb answered in 1955: ' +
          'yes. If a theory like PA proves “if G is provable, then G,” it proves G outright, and a ' +
          'sentence equivalent to its own provability hands the theory exactly that. Gödel’s sentence ' +
          'is true because it cannot be proved; Henkin’s is proved because it says it can be.', P.inkDim, true);
      }
    }

    ui.caption(a2,
      'The corner quotes ⌜…⌝ are a toy Gödel numbering. In arithmetic, quotation is a number and ' +
      '<code>diag</code> is a primitive recursive function; the substitution this widget performs is, ' +
      'step for step, the construction inside the diagonal lemma, which Carnap, it seems, first stated ' +
      'in general in 1934: for any formula P(x) there is a sentence G with T ⊢ G ↔ P(⌜G⌝). Gödel had built only ' +
      'the case he needed.');

    /* ================== ACT III — the hydra ================== */
    const a3 = actWraps[3];
    const hydraQuest = ui.questBanner(a3,
      'Slay the hydra: click its glowing heads. On turn <em>n</em> a deep chop regrows <em>n</em> copies of the maimed branch.');

    const subRow = doc.createElement('div');
    subRow.className = 'lp-acts sub';
    a3.appendChild(subRow);
    const hydraTabBtn = ui.button(subRow, 'the hydra', () => showSub('hydra'), { small: true });
    const gsTabBtn = ui.button(subRow, 'Goodstein sequences', () => showSub('goodstein'), { small: true });
    const hydraWrap = doc.createElement('div');
    const gsWrap = doc.createElement('div');
    a3.appendChild(hydraWrap); a3.appendChild(gsWrap);
    let sub = 'hydra';
    function showSub(s) {
      sub = s;
      hydraWrap.style.display = s === 'hydra' ? '' : 'none';
      gsWrap.style.display = s === 'goodstein' ? '' : 'none';
      hydraTabBtn.classList.toggle('active', s === 'hydra');
      gsTabBtn.classList.toggle('active', s === 'goodstein');
      hydraTabBtn.setAttribute('aria-pressed', String(s === 'hydra'));
      gsTabBtn.setAttribute('aria-pressed', String(s === 'goodstein'));
      poke();
    }

    /* ---- hydra state ---- */
    const NODE_CAP = 2500;
    let shape = 'w2', strategy = 'big', speed = 2;
    let tree, turn, hOrd, hPrevOrd, hOrd0, flashes, blockedMsg, altHist, lastSound = 0, dead = false;
    let nextId = 1;
    let autoplay = false, autoAcc = 0;
    let hoverPath = null, hoverPreview = null, focusIdx = -1;
    let layoutT0 = -9, layoutDur = 0.45;
    function markAll(node, b, fresh) {
      node.b = b;
      if (fresh || node.id === undefined) node.id = nextId++;
      node.kids.forEach((k) => markAll(k, b, fresh));
    }

    const hCtl = ui.controlRow(hydraWrap);
    hCtl.classList.add('hy-ctl');
    ui.select(hCtl, {
      label: 'the hydra',
      options: [
        { value: 'w2', label: 'ω² + ω + 1 · a young hydra' },
        { value: 'ww', label: 'ω^ω · one neck of three' },
        { value: 'ww2', label: 'ω^ω·2 · two such necks' },
        { value: 'www', label: 'ω^ω^ω · a neck of four' },
      ],
      value: shape,
      onChange: (v) => { shape = v; resetHydra(); },
    });
    ui.select(hCtl, {
      label: 'Hercules’ strategy',
      options: [
        { value: 'big', label: 'strike the biggest branch' },
        { value: 'easy', label: 'pick off the easy heads' },
      ],
      value: strategy,
      onChange: (v) => { strategy = v; },
    });
    ui.select(hCtl, {
      label: 'chops per second',
      options: [{ value: '2', label: '2' }, { value: '12', label: '12' }, { value: '60', label: '60' }],
      value: String(speed),
      onChange: (v) => { speed = +v; },
    });
    const hBtns = ui.controlRow(hydraWrap);
    const autoBtn = ui.button(hBtns, '⚔ let Hercules play', () => {
      audio.ensureAudio();
      if (dead) return;
      autoplay = !autoplay;
      autoBtn.classList.toggle('active', autoplay);
      autoBtn.textContent = autoplay ? '⏸ Hercules rests' : '⚔ let Hercules play';
      poke();
    });
    ui.button(hBtns, '⟲ a fresh hydra', () => resetHydra(), { small: true });

    // A fixed height: a height that depended on the width would resize the
    // observed parent inside its own ResizeObserver callback whenever the
    // width crossed the threshold (a console error, and a wasted relayout).
    const hydraCanvas = cv.setupCanvas(hydraWrap, { height: 430 });
    const hc = hydraCanvas.canvas;
    hc.style.touchAction = 'manipulation';
    hc.tabIndex = 0;
    hc.classList.add('lp-focusable');
    hc.setAttribute('role', 'application');
    hc.setAttribute('aria-roledescription', 'hydra');
    hc.setAttribute('aria-label', 'The hydra. Left and right arrow keys choose a head; Enter chops it.');
    hydraCanvas.onResize(() => { relayout(false); poke(); });
    const headSprites = [cv.glowSprite(P.goldBright, 34), cv.glowSprite(P.gold, 28)];
    const jointSprite = cv.glowSprite(P.azureDim, 18);
    const markerSprite = cv.glowSprite(P.goldBright, 30);

    const ordLine = ui.mathline(hydraWrap, '');
    const hydReadout = ui.readout(hydraWrap, '');
    hydReadout.el.setAttribute('aria-live', 'polite');
    ui.caption(hydraWrap,
      'The rule (Kirby and Paris, 1982): a head is a leaf. Chop it; if it grew from deeper than the ' +
      'root, its grandparent sprouts <em>n</em> copies of the branch it left behind on turn <em>n</em>. ' +
      'Heads on the root just die. Each node’s ordinal is the sum of ω<sup>(child’s ordinal)</sup>, a bare ' +
      'head counting ω⁰ = 1; the tree is drawn in that order, biggest branch first, and a crowd of ' +
      'identical branches is drawn once and marked ×<em>k</em>. Every chop strictly lowers α, as the page ' +
      'checks each time, so Hercules always wins. PA cannot prove that: hydras reach every ordinal below ' +
      'ε₀, and showing that every descent ends needs induction all the way to ε₀. The bar at the top keeps ' +
      'the order of ordinals but cannot keep their scale; the staircase beneath it is α turn by turn, magnified.');
    ui.legendPanel(hydraWrap, LEGEND);

    function resetHydra() {
      tree = HYDRA_SHAPES[shape]();
      nextId = 1;
      markAll(tree, 0, true);
      hydraCanon(tree);
      turn = 1; hOrd = hydraOrd(tree); hOrd0 = hOrd; hPrevOrd = null;
      flashes = []; blockedMsg = ''; dead = false;
      altHist = [ordAltitude(hOrd)];
      autoplay = false; autoAcc = 0; hoverPath = null; hoverPreview = null; focusIdx = -1;
      autoBtn.classList.remove('active');
      autoBtn.textContent = '⚔ let Hercules play';
      autoBtn.disabled = false;
      hydraQuest.set('Slay the hydra: click its glowing heads. On turn <em>n</em> a deep chop regrows <em>n</em> copies of the maimed branch.');
      relayout(false);
      updateHydraMeter();
      drawRuler();
      poke();
    }

    // layout: leaves get consecutive slots, parents sit at the mean; depth = y.
    // Runs of ≥ K identical siblings collapse into one drawn copy marked ×k.
    let hSlots = 1, hDepth = 1, drawList = [], headList = [], collapseK = Infinity;
    let posFrom = new Map(), posTo = new Map();
    function slotsFor(node, K, memo) {
      if (!node.kids.length) return 1;
      const hit = memo.get(node.key);
      if (hit !== undefined) return hit;
      let s = 0;
      for (let i = 0; i < node.kids.length;) {
        let j = i + 1;
        while (j < node.kids.length && node.kids[j].key === node.kids[i].key) j++;
        const one = slotsFor(node.kids[i], K, memo);
        s += (j - i >= K) ? one : one * (j - i);
        i = j;
      }
      memo.set(node.key, s);
      return s;
    }
    function geom() {
      const W = hydraCanvas.width, H = hydraCanvas.height;
      const padX = W < 520 ? 22 : 34;
      return { W, H, padX, top: 96, ground: H - 38 };
    }
    function relayout(tween) {
      if (!tree) return;
      hydraKeys(tree);
      const g = geom();
      const minSp = g.W < 520 ? 18 : 22;   // below this, glowing heads merge into a blur
      const avail = Math.max(10, g.W - 2 * g.padX);
      collapseK = Infinity;
      for (const K of [Infinity, 5, 3, 2]) {
        collapseK = K;
        if (slotsFor(tree, K, new Map()) * minSp <= avail) break;
      }
      let slot = 0; hDepth = 1; drawList = []; headList = [];
      (function walk(node, depth, path, group) {
        node.d = depth;
        node.g = group;
        hDepth = Math.max(hDepth, depth);
        if (node.kids.length === 0) {
          node.lx = slot++;
        } else {
          let sum = 0, cnt = 0;
          for (let i = 0; i < node.kids.length;) {
            let j = i + 1;
            while (j < node.kids.length && node.kids[j].key === node.kids[i].key) j++;
            if (j - i >= collapseK) {
              walk(node.kids[i], depth + 1, [...path, i], j - i);
              sum += node.kids[i].lx; cnt++;
            } else {
              for (let m = i; m < j; m++) { walk(node.kids[m], depth + 1, [...path, m], 1); sum += node.kids[m].lx; cnt++; }
            }
            i = j;
          }
          node.lx = sum / Math.max(1, cnt);
        }
        const leaf = node.kids.length === 0 && depth > 0;
        const entry = { node, path, leaf, parent: null };
        drawList.push(entry);
        if (leaf) headList.push(entry);
      })(tree, 0, [], 1);
      hSlots = Math.max(slot, 1);
      // parents for edges
      const byNode = new Map(drawList.map((d) => [d.node, d]));
      for (const d of drawList) {
        for (const k of d.node.kids) { const e = byNode.get(k); if (e) e.parent = d.node; }
      }
      headList.sort((a, b) => a.node.lx - b.node.lx);
      // targets
      const t = now();
      const levelH = hydraLevelH(g);
      const span = Math.min(g.W - 2 * g.padX, (hSlots - 1) * 96);
      const x0 = (g.W - span) / 2;
      const moving = tween && !reduced();
      const nFrom = new Map(), nTo = new Map();
      for (const d of drawList) {
        const n = d.node;
        const x = hSlots === 1 ? g.W / 2 : x0 + (n.lx / (hSlots - 1)) * span;
        const y = g.ground - n.d * levelH;
        let from = null;
        if (moving) {
          from = shownPos(n, t);
          if (!from && d.parent) {
            // newborn: grow out of the nearest ancestor we can already see
            let anc = d.parent;
            from = shownPos(anc, t);
            while (!from && anc && anc !== tree) { anc = byNode.get(anc) && byNode.get(anc).parent; from = anc ? shownPos(anc, t) : null; }
          }
        }
        nFrom.set(n.id, from || [x, y]);
        nTo.set(n.id, [x, y]);
      }
      posFrom = nFrom; posTo = nTo;
      layoutT0 = moving ? t : -9;
      if (focusIdx >= headList.length) focusIdx = headList.length - 1;
    }
    function hydraLevelH(g) { return Math.min(112, (g.ground - g.top - 14) / Math.max(hDepth, 1)); }
    function shownPos(node, t) {
      const to = posTo.get(node.id);
      if (!to) return null;
      const from = posFrom.get(node.id) || to;
      const u = ease((t - layoutT0) / layoutDur);
      return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u];
    }

    function updateHydraMeter(preview = null) {
      const alive = tree.kids.length > 0;
      if (preview) {
        ordLine.innerHTML = `α = ${ordHTML(hOrd)} <span class="lp-was">· chop here → ` +
          `<span style="color:${P.crimsonBright}">${ordHTML(preview.ord)}</span>` +
          `${preview.grow ? `, and ${formatBig(preview.grow)} new node${preview.grow === 1 ? '' : 's'}` : ''}</span>`;
        return;
      }
      if (alive) {
        let was = '';
        if (hPrevOrd != null) {
          const smaller = ordCmp(hOrd, hPrevOrd) < 0;
          was = ` <span class="lp-was">· was ${ordHTML(hPrevOrd)}, ${smaller ? '<span class="ok">strictly larger ✓</span>' : 'not larger ✗'}</span>`;
        }
        ordLine.innerHTML = `α = <span style="color:${P.goldBright}">${ordHTML(hOrd)}</span>${was}`;
      } else {
        ordLine.innerHTML = `α = 0 <span class="lp-was">· the descent is complete</span>`;
      }
      const heads = headList.length ? hydraLeafPaths(tree).length : 0;
      hydReadout.set(alive
        ? `turn ${formatBig(turn)} · ${formatBig(heads)} head${heads === 1 ? '' : 's'} · ${formatBig(hydraSize(tree))} nodes` +
          ` · a deep chop now regrows ${formatBig(turn)} ${turn === 1 ? 'copy' : 'copies'}` +
          (blockedMsg ? `\n${blockedMsg}` : '')
        : `Slain on turn ${formatBig(turn - 1)}, as it had to be.`);
    }

    function doChop(path, { quiet = false } = {}) {
      if (!tree || tree.kids.length === 0) return false;
      const predicted = hydraChopSize(tree, path, turn);
      const t = now();
      const head = hydraAt(tree, path);
      const hp = posTo.get(head.id) || [0, 0];
      if (predicted > NODE_CAP) {
        blockedMsg = `That chop would grow the hydra to ${formatBig(predicted)} nodes, past the ${formatBig(NODE_CAP)} ` +
          'this canvas can draw. Chop a head nearer the root, or start again; the theorem is unbothered.';
        flashes.push({ x: hp[0], y: hp[1], t0: t, blocked: true });
        if (flashes.length > 24) flashes.shift();
        updateHydraMeter();
        audio.drums.rim(bus, bus.context.currentTime, { level: 0.2 });
        poke(0.8);
        return false;
      }
      blockedMsg = '';
      audio.ensureAudio();
      flashes.push({ x: hp[0], y: hp[1], t0: t });
      if (flashes.length > 24) flashes.shift();

      const res = hydraChop(tree, path, turn);
      tree = res.tree;
      if (res.regrown) {
        const gp = hydraAt(tree, res.regrown.path);
        for (let i = res.regrown.from; i < res.regrown.from + res.regrown.count; i++) markAll(gp.kids[i], t, true);
      }
      hPrevOrd = hOrd;
      hOrd = hydraCanon(tree);
      altHist.push(ordAltitude(hOrd));
      if (altHist.length > 4000) altHist.splice(1, altHist.length - 4000);
      turn++;
      hoverPath = null; hoverPreview = null;
      layoutDur = autoplay ? clamp(0.9 / speed, 0.06, 0.45) : 0.45;
      relayout(true);
      updateHydraMeter();
      drawRuler();
      poke(layoutDur + 0.6);

      const when = bus.context.currentTime;
      if (!quiet && when - lastSound > 0.11) {
        lastSound = when;
        const a0 = Math.max(1e-6, ordAltitude(hOrd0));
        const r = clamp(ordAltitude(hOrd) / a0, 0, 1);
        audio.drums.thock(bus, when, { level: 0.45 });
        audio.playTone(bus, { freq: 170 * Math.pow(2, 2.3 * r), dur: 0.3, level: 0.26, when });
        if (res.regrown) audio.drums.rim(bus, when + 0.1, { level: 0.24 });
      }
      if (tree.kids.length === 0) {
        dead = true;
        [523.25, 659.25, 784, 1046.5].forEach((f, i) =>
          audio.playTone(bus, { freq: f, dur: 0.5, level: 0.3, when: when + 0.15 + i * 0.13 }));
        hydraQuest.done('The hydra is dead, as it always must be. The ordinal had nowhere left to fall.');
        autoplay = false;
        autoBtn.classList.remove('active');
        autoBtn.textContent = '⚔ let Hercules play';
        autoBtn.disabled = true;
        updateHydraMeter();
      }
      return true;
    }

    function nearestHead(px, py) {
      let best = null, bestD = Infinity;
      const sp = Math.min(96, (hydraCanvas.width - 2 * geom().padX) / Math.max(1, hSlots - 1));
      const lim = Math.max(14, Math.min(26, sp * 0.9));
      for (const d of headList) {
        const p = posTo.get(d.node.id);
        if (!p) continue;
        const dist = Math.hypot(px - p[0], py - p[1]);
        if (dist < bestD && dist < lim) { bestD = dist; best = d; }
      }
      return best;
    }
    function setHover(entry) {
      const path = entry ? entry.path : null;
      const same = (a, b) => a === b || (a && b && a.length === b.length && a.every((x, i) => x === b[i]));
      if (same(path, hoverPath)) return;
      hoverPath = path;
      hoverPreview = null;
      if (path && tree.kids.length) {
        const predicted = hydraChopSize(tree, path, turn);
        if (predicted <= NODE_CAP) {
          const r = hydraChop(tree, path, turn);
          hoverPreview = { ord: hydraOrd(r.tree), grow: Math.max(0, predicted - hydraSize(tree) + 1), n: path.length >= 2 ? turn : 0 };
        } else {
          hoverPreview = { ord: null, grow: predicted, n: turn, tooBig: true };
        }
      }
      if (hoverPreview && hoverPreview.ord != null) updateHydraMeter(hoverPreview);
      else updateHydraMeter();
      poke(0.3);
    }
    hc.addEventListener('pointermove', (e) => {
      if (act !== 3 || sub !== 'hydra' || e.pointerType !== 'mouse') return;
      const [px, py] = cv.pointerPos(hydraCanvas, e);
      setHover(nearestHead(px, py));
      hc.style.cursor = hoverPath ? 'pointer' : 'default';
    });
    hc.addEventListener('pointerleave', () => { setHover(null); });
    hc.addEventListener('pointerdown', (e) => {
      if (act !== 3 || sub !== 'hydra') return;
      const [px, py] = cv.pointerPos(hydraCanvas, e);
      const best = nearestHead(px, py);
      if (best) { stopAutoplayQuietly(); doChop(best.path); }
    });
    hc.addEventListener('keydown', (e) => {
      if (!headList.length) return;
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        focusIdx = focusIdx < 0 ? (dir > 0 ? 0 : headList.length - 1) : (focusIdx + dir + headList.length) % headList.length;
        setHover(headList[focusIdx]);
        poke(0.4);
      } else if ((e.key === 'Enter' || e.key === ' ') && focusIdx >= 0 && headList[focusIdx]) {
        e.preventDefault();
        stopAutoplayQuietly();
        const keepX = headList[focusIdx].node.lx;
        doChop(headList[focusIdx].path);
        // keep the keyboard focus near where it was
        let bi = -1, bd = Infinity;
        headList.forEach((d, i) => { const dd = Math.abs(d.node.lx - keepX); if (dd < bd) { bd = dd; bi = i; } });
        focusIdx = bi;
        if (bi >= 0) setHover(headList[bi]);
      }
    });
    hc.addEventListener('blur', () => { focusIdx = -1; setHover(null); });
    function stopAutoplayQuietly() {
      if (!autoplay) return;
      autoplay = false;
      autoBtn.classList.remove('active');
      autoBtn.textContent = '⚔ let Hercules play';
    }

    function drawHydra(t) {
      const { ctx } = hydraCanvas;
      const { W, H, padX, top, ground } = geom();
      ctx.clearRect(0, 0, W, H);
      if (W < 120 || !tree) return;

      // the altitude bar toward ε₀
      const bx = padX + 14, bw = Math.max(10, W - bx - padX - 6), by = 22;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, by + 0.5); ctx.lineTo(bx + bw, by + 0.5); ctx.stroke();
      const ticks = [[0, 0], [ordAltitude(OMEGA), OMEGA], [ordAltitude(W_W), W_W], [ordAltitude(W_W_W), W_W_W], [1, 'eps']];
      for (const [fr] of ticks) {
        const x = Math.round(bx + fr * bw) + 0.5;
        ctx.strokeStyle = FAINT;
        ctx.beginPath(); ctx.moveTo(x, by - 3); ctx.lineTo(x, by + 4); ctx.stroke();
      }
      setFont(ctx, 13, SERIF, { italic: true });
      ctx.fillStyle = P.inkDim; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('α', bx - 8, by);
      // the descent trail, then the marker
      const n0 = Math.max(0, altHist.length - 40);
      for (let i = n0; i < altHist.length - 1; i++) {
        const k = altHist.length - 1 - i;
        ctx.fillStyle = P.gold; ctx.globalAlpha = clamp(0.5 - k * 0.012, 0.06, 0.5);
        ctx.beginPath(); ctx.arc(bx + altHist[i] * bw, by, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!dead) {
        const mx = bx + ordAltitude(hOrd) * bw;
        markerSprite.draw(ctx, mx, by, 0.8);
        ctx.fillStyle = P.goldBright;
        ctx.beginPath(); ctx.arc(mx, by, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      // tick labels last, so the marker's glow never washes them out
      for (const [fr, o] of ticks) {
        const x = Math.round(bx + fr * bw) + 0.5;
        if (o === 'eps') drawRuns(ctx, EPS0_RUNS(13), x, by + 19, 'center', P.crimsonBright);
        else drawRuns(ctx, ordRuns(o, 13), x, by + 19, 'center', P.inkDim);
      }
      // the staircase: α turn by turn, magnified between its own extremes
      if (altHist.length > 1) {
        const sy0 = 50, sh = 26;
        const vis = visibleDescent(altHist, 0.0002);
        let lo = Infinity, hi = -Infinity;
        for (const a of vis) { if (a < lo) lo = a; if (a > hi) hi = a; }
        if (hi - lo < 1e-12) hi = lo + 1e-12;
        const n = vis.length;
        const step = n > bw ? Math.ceil(n / bw) : 1;
        ctx.strokeStyle = P.goldDim; ctx.lineWidth = 1.2;
        ctx.beginPath();
        let lastY = null;
        for (let i = 0; i < n; i += step) {
          const x = bx + (n === 1 ? 0 : (i / (n - 1)) * bw);
          const y = sy0 + (1 - (vis[i] - lo) / (hi - lo)) * sh;
          if (lastY == null) ctx.moveTo(x, y); else { ctx.lineTo(x, lastY); ctx.lineTo(x, y); }
          lastY = y;
        }
        const yl = sy0 + (1 - (vis[n - 1] - lo) / (hi - lo)) * sh;
        ctx.lineTo(bx + bw, lastY); ctx.lineTo(bx + bw, yl);
        ctx.stroke();
        ctx.fillStyle = P.goldBright;
        ctx.beginPath(); ctx.arc(bx + bw, yl, 2.4, 0, Math.PI * 2); ctx.fill();
        capsLabel(ctx, `α over ${formatBig(n - 1)} turn${n === 2 ? '' : 's'}`, bx, sy0 + sh + 12, 11.5, FAINT);
      }

      // ground
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padX - 8, ground + 8.5); ctx.lineTo(W - padX + 8, ground + 8.5); ctx.stroke();

      const pos = (n) => shownPos(n, t) || [W / 2, ground];
      const spacing = hSlots > 1 ? Math.min(96, (W - 2 * padX) / (hSlots - 1)) : 96;
      const glow = clamp(spacing / 26, 0.5, 1);
      const levelH = hydraLevelH({ W, H, padX, top, ground });
      // necks: a soft sinew under a bright core, tapering with depth
      for (const pass of [0, 1]) {
        for (const d of drawList) {
          const node = d.node;
          if (!d.parent) continue;
          const [x1, y1] = pos(d.parent);
          const [x2, y2] = pos(node);
          const age = clamp((t - (node.b || 0)) / 0.5, 0, 1);
          const alpha = reduced() ? 1 : 0.25 + 0.75 * age;
          const w = Math.max(0.9, 3.2 - (node.d - 1) * 0.55);
          ctx.globalAlpha = pass === 0 ? 0.22 * alpha : alpha;
          ctx.strokeStyle = pass === 0 ? P.azureDim : P.azure;
          ctx.lineWidth = pass === 0 ? w + 3 : w;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo((x1 + x2) / 2 + (x2 - x1) * 0.12, (y1 + y2) / 2 + 8, x2, y2);
          ctx.stroke();
          if (pass === 1 && node.g > 1) {
            // the rest of a collapsed crowd: a faint fan of ghost necks
            const len = Math.hypot(x2 - x1, y2 - y1), base = Math.atan2(y2 - y1, x2 - x1);
            const fan = Math.min(6, node.g - 1);
            ctx.lineWidth = Math.max(0.8, w * 0.6);
            for (let gi = 1; gi <= fan; gi++) {
              const side = gi % 2 ? 1 : -1, k = Math.ceil(gi / 2);
              const ang = base + side * k * 0.075;
              const gx = x1 + Math.cos(ang) * len, gy = y1 + Math.sin(ang) * len;
              ctx.globalAlpha = 0.2 * alpha / k;
              ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(gx, gy); ctx.stroke();
              if (d.leaf) { ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(gx, gy, 2, 0, Math.PI * 2); ctx.fill(); }
            }
          }
        }
      }
      ctx.globalAlpha = 1;
      for (const d of drawList) {
        const node = d.node;
        const [x, y] = pos(node);
        const born = t - (node.b || 0);
        ctx.globalAlpha = node === tree || reduced() ? 1 : clamp(0.3 + born / 0.5, 0.3, 1);
        if (node === tree) {
          ctx.fillStyle = P.ink;
          ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
          capsLabel(ctx, 'root', x, y + 24, 12, FAINT, 'center');
        } else if (d.leaf) {
          const fresh = born < 1.2 && node.b > 0;
          headSprites[fresh ? 0 : 1].draw(ctx, x, y, glow * (fresh && !reduced() ? 1 + 0.25 * (1 - clamp(born / 1.2, 0, 1)) : 1));
          ctx.fillStyle = fresh ? P.goldBright : P.gold;
          ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
        } else {
          jointSprite.draw(ctx, x, y, 0.8 * glow);
          ctx.fillStyle = P.azure;
          ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }
        if (node.g > 1) {
          ctx.globalAlpha = 1;
          setFont(ctx, 12, MONO, { weight: 600 });
          ctx.fillStyle = d.leaf ? P.goldBright : '#a9c6ea';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('×' + formatBig(node.g), x + 9, y - (d.leaf ? 11 : 9));
        }
      }
      ctx.globalAlpha = 1;

      // hover / keyboard focus: the head, and the copies this chop would sprout
      if (hoverPath && tree.kids.length) {
        const hd = hydraAt(tree, hoverPath);
        const hp = posTo.get(hd.id);
        if (hp) {
          ctx.strokeStyle = P.crimsonBright; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(hp[0], hp[1], 10, 0, Math.PI * 2); ctx.stroke();
          if (hoverPath.length >= 2 && hoverPreview) {
            const gp = hydraAt(tree, hoverPath.slice(0, -2));
            const gq = posTo.get(gp.id);
            if (gq) {
              const n = hoverPreview.n, shown = Math.min(n, 9);
              ctx.setLineDash([3, 3]);
              ctx.strokeStyle = P.crimsonBright; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.2;
              for (let i = 0; i < shown; i++) {
                const ang = -Math.PI / 2 + (shown === 1 ? 0.45 : -1.05 + 2.1 * i / (shown - 1));
                const len = Math.min(70, levelH * 0.75);
                const ex = gq[0] + Math.cos(ang) * len, ey = gq[1] + Math.sin(ang) * len;
                ctx.beginPath(); ctx.moveTo(gq[0], gq[1]); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.stroke();
              }
              ctx.setLineDash([]); ctx.globalAlpha = 1;
              setFont(ctx, 11, MONO, { weight: 600 });
              const lab = hoverPreview.tooBig ? `+${formatBig(n)} copies: too many to draw` : `+${formatBig(n)} ${n === 1 ? 'copy' : 'copies'}`;
              const lw = ctx.measureText(lab).width;
              const lxp = clamp(gq[0], lw / 2 + 6, W - lw / 2 - 6);
              const lyp = gq[1] - Math.max(18, Math.min(70, levelH * 0.75)) - 10;
              // a dark plate, so the label reads cleanly across any neck
              ctx.fillStyle = P.bg; ctx.globalAlpha = 0.88;
              ctx.fillRect(lxp - lw / 2 - 5, lyp - 11, lw + 10, 15);
              ctx.globalAlpha = 1;
              ctx.fillStyle = P.crimsonBright; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
              ctx.fillText(lab, lxp, lyp);
            }
          }
        }
      }

      // chop flashes
      for (const f of flashes) {
        const ft = (t - f.t0) / 0.45;
        if (ft < 0 || ft > 1) continue;
        ctx.strokeStyle = f.blocked ? P.crimsonBright : P.crimson;
        ctx.globalAlpha = 1 - ft;
        ctx.lineWidth = 2;
        if (f.blocked) {
          ctx.beginPath(); ctx.moveTo(f.x - 7, f.y - 7); ctx.lineTo(f.x + 7, f.y + 7);
          ctx.moveTo(f.x + 7, f.y - 7); ctx.lineTo(f.x - 7, f.y + 7); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(f.x, f.y, reduced() ? 9 : 6 + ft * 22, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      if (dead) {
        setFont(ctx, W < 420 ? 15 : 17, SERIF, { italic: true });
        ctx.fillStyle = P.verdant; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('α = 0 · slain, as it had to be', W / 2, (top + ground) / 2);
      }
      resetFont(ctx);
    }

    /* ---- Goodstein subview ---- */
    const GS_MAX_ROWS = 30;
    let gsSeed = 3, gsVal = 3n, gsBase = 2, gsStepN = 0, gsDone = false, gsRun = false, gsAcc = 0;
    let gsRows = [];

    const gsCtl = ui.controlRow(gsWrap);
    ui.stepper(gsCtl, {
      label: 'seed', min: 2, max: 12, value: 3,
      onChange: (v) => { gsSeed = v; gsReset(); },
    });
    ui.button(gsCtl, 'step', () => { audio.ensureAudio(); gsStep(); }, { small: true });
    const gsRunBtn = ui.button(gsCtl, '▶ run', () => {
      audio.ensureAudio();
      if (gsDone || gsStepN >= GS_MAX_ROWS) return;
      gsRun = !gsRun;
      gsRunBtn.classList.toggle('active', gsRun);
      gsRunBtn.textContent = gsRun ? '⏸ pause' : '▶ run';
    });
    ui.button(gsCtl, '⟲ reset', () => gsReset(), { small: true });

    ui.mathline(gsWrap,
      'write the value in hereditary base <em>b</em> · bump every <em>b</em> to <em>b</em>+1 · subtract 1');
    const gsChart = cv.setupCanvas(gsWrap, { height: 160 });
    gsChart.canvas.setAttribute('role', 'img');
    gsChart.canvas.setAttribute('aria-label', 'Two traces over the steps of the sequence: the value on a log scale, climbing, and its ordinal, only ever falling.');
    gsChart.onResize(() => drawGsChart());
    const gsTable = doc.createElement('div');
    gsTable.className = 'gs-table';
    gsTable.setAttribute('role', 'table');
    gsWrap.appendChild(gsTable);
    const gsNote = doc.createElement('div');
    gsNote.className = 'gs-note';
    gsNote.setAttribute('aria-live', 'polite');
    gsWrap.appendChild(gsNote);
    ui.caption(gsWrap,
      'Replace the base by ω and the hereditary form becomes an ordinal below ε₀, the same meter as ' +
      'the hydra’s, and it strictly falls at every step even as the value soars: in the chart the gold ' +
      'trace climbs while the azure one only ever descends. That descent is why every Goodstein sequence ' +
      'dies at 0, and needing induction up to ε₀ is why PA cannot follow the argument (Kirby and Paris, 1982).');

    const fmtVal = (v) => {
      const s = v.toString();
      return s.length <= 21 ? formatBig(v) : `≈ ${s[0]}.${s.slice(1, 4)}·10<sup>${s.length - 1}</sup>`;
    };
    function gsRow(cells, head = false) {
      const r = doc.createElement('div');
      r.className = 'gs-row' + (head ? ' gs-head' : '');
      r.setAttribute('role', 'row');
      const labs = ['step', 'base', 'hereditary form', 'ordinal', 'value'];
      cells.forEach((c, i) => {
        const d = doc.createElement('div');
        d.setAttribute('role', head ? 'columnheader' : 'cell');
        d.innerHTML = head ? c : `<span class="lab">${labs[i]}</span>${c}`;
        r.appendChild(d);
      });
      gsTable.appendChild(r);
      gsTable.scrollTop = gsTable.scrollHeight;
    }
    const sup = (s) => `<sup>${s}</sup>`;
    function gsSeedNote() {
      if (gsSeed === 2) return 'Seed 2: 2, 2, 1, 0. Even the smallest case shows the pattern: the value stalls, the ordinal does not.';
      if (gsSeed === 3) return 'Seed 3 dies politely: 3, 3, 3, 2, 1, 0. Watch the ordinal column do the killing.';
      if (gsSeed === 4) {
        return `Seed 4 climbs until its base reaches 3·2${sup('402,653,209')}, peaks at 3·2${sup('402,653,210')} − 1, ` +
          `and stands perfectly still for 3·2${sup('402,653,209')} steps. Then it walks down one unit at a time and ` +
          `reaches 0 at step 3·2${sup('402,653,211')} − 3, when the base is 3·2${sup('402,653,211')} − 1, a number ` +
          `with 121,210,695 digits. We show the first ${GS_MAX_ROWS} rows; the ordinal shows why the end is certain.`;
      }
      return 'As the seed grows, the number of steps to zero outgrows every level of the Hardy hierarchy ' +
        'below ε₀, and so, in the end, every function that PA can prove always halts. Finite, every one ' +
        'of them; provably so only from beyond PA.';
    }
    function gsReset() {
      gsVal = BigInt(gsSeed); gsBase = 2; gsStepN = 0; gsDone = false;
      gsRun = false; gsAcc = 0; gsRows = [];
      gsRunBtn.classList.remove('active');
      gsRunBtn.textContent = '▶ run';
      gsTable.replaceChildren();
      gsRow(['step', 'base', 'hereditary form', 'ordinal (base → ω)', 'value'], true);
      gsNote.innerHTML = gsSeedNote();
      gsStep({ silent: true });
    }
    function gsStep({ silent = false } = {}) {
      if (gsDone || gsRows.length >= GS_MAX_ROWS) {
        if (!gsDone && !silent) gsNote.innerHTML = `The table stops at ${GS_MAX_ROWS} rows. ` + gsSeedNote();
        return;
      }
      const ord = goodsteinOrd(gsVal, gsBase);
      const alt = ordAltitude(ord);
      gsRows.push({ step: gsStepN, val: gsVal, ord, alt, lg: gsVal > 0n ? bigLog10(gsVal) : 0 });
      gsRow([String(gsStepN), String(gsBase),
        `<span style="color:${P.gold}">${hereditaryHTML(gsVal, gsBase)}</span>`,
        `<span style="color:${P.azure}">${ordHTML(ord)}</span>`,
        fmtVal(gsVal)]);
      if (!silent) {
        const a0 = Math.max(1e-6, gsRows[0].alt);
        audio.playTone(bus, {
          freq: 200 * Math.pow(2, 2 * (1 - alt / a0)), dur: 0.16, level: 0.25,
          when: bus.context.currentTime,
        });
      }
      drawGsChart();
      if (gsVal === 0n) {
        gsDone = true; gsRun = false;
        gsRunBtn.classList.remove('active');
        gsRunBtn.textContent = '▶ run';
        gsNote.innerHTML = `Reached 0 at step ${gsStepN}: Goodstein’s theorem, in the flesh.`;
        if (!silent) audio.playTone(bus, { freq: 1046.5, dur: 0.5, level: 0.3, when: bus.context.currentTime + 0.1 });
        return;
      }
      gsVal = goodsteinNext(gsVal, gsBase);
      gsBase++;
      gsStepN++;
      if (gsRows.length >= GS_MAX_ROWS) {
        gsRun = false;
        gsRunBtn.classList.remove('active');
        gsRunBtn.textContent = '▶ run';
        gsNote.innerHTML = `Paused at ${GS_MAX_ROWS} rows. ` + gsSeedNote();
      }
    }

    function drawGsChart() {
      const { ctx, width: W, height: H } = gsChart;
      ctx.clearRect(0, 0, W, H);
      if (W < 120) return;
      const padL = 14, padR = W < 480 ? 80 : 96, top = 26, bot = H - 26;
      const x = (i) => padL + (i / (GS_MAX_ROWS - 1)) * (W - padL - padR);
      capsLabel(ctx, 'value and ordinal, step by step', padL, 16, 12.5, P.inkDim);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, bot + 0.5); ctx.lineTo(W - padR, bot + 0.5); ctx.stroke();
      setFont(ctx, 9.5, MONO);
      ctx.fillStyle = FAINT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i < GS_MAX_ROWS; i += 5) ctx.fillText(String(i), x(i), bot + 5);
      if (!gsRows.length) return;
      const maxLg = Math.max(1, ...gsRows.map((r) => r.lg));
      const ys = (v) => bot - v * (bot - top);
      // ordinal: a staircase that only goes down. Heights keep the order of
      // the ordinals, never their size; where two differ below float
      // resolution, each step is still drawn a little lower than the last.
      const oy = visibleDescent(gsRows.map((r) => r.alt), 0.035);
      ctx.strokeStyle = P.azure; ctx.lineWidth = 1.6;
      ctx.beginPath();
      oy.forEach((v, i) => {
        const y = ys(v);
        if (!i) ctx.moveTo(x(i), y); else { ctx.lineTo(x(i), ys(oy[i - 1])); ctx.lineTo(x(i), y); }
      });
      ctx.stroke();
      // value, log scale
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.6;
      ctx.beginPath();
      gsRows.forEach((r, i) => { const y = ys(r.lg / maxLg); if (!i) ctx.moveTo(x(i), y); else ctx.lineTo(x(i), y); });
      ctx.stroke();
      for (const [i, r] of gsRows.entries()) {
        ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(x(i), ys(r.lg / maxLg), 1.8, 0, Math.PI * 2); ctx.fill();
      }
      // cursor and labels at the latest row
      const li = gsRows.length - 1, last = gsRows[li];
      ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(x(li) + 0.5, top - 4); ctx.lineTo(x(li) + 0.5, bot); ctx.stroke();
      ctx.globalAlpha = 1;
      const vs = last.val.toString();
      const valRuns = vs.length <= 7
        ? [{ t: formatBig(last.val), s: 10.5, dy: 0 }]
        : [{ t: `≈ ${vs[0]}.${vs.slice(1, 3)}·10`, s: 10.5, dy: 0 }, { t: String(vs.length - 1), s: 8, dy: -4 }];
      let labelW = 48;
      for (const r of valRuns) { setFont(ctx, r.s, SERIF); r.mw = ctx.measureText(r.t).width; }
      labelW = Math.max(labelW, valRuns.reduce((a, r) => a + r.mw, 0));
      // the labels ride just ahead of the two traces, never past the edge
      const lx = Math.max(padL, Math.min(x(li) + 10, W - 6 - labelW));
      const yv = ys(last.lg / maxLg), yo = ys(oy[li]);
      let yvL = yv - 2, yoL = yo + 4;
      if (Math.abs(yvL - yoL) < 30) { const m = (yvL + yoL) / 2; yvL = m - 15; yoL = m + 15; }
      yvL = clamp(yvL, top + 6, bot - 18); yoL = clamp(yoL, top + 6, bot - 18);
      if (yoL - yvL < 30 && yoL >= bot - 18) yvL = yoL - 30;
      setFont(ctx, 12, SERIF, { italic: true });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = P.gold; ctx.fillText('value', lx, yvL);
      drawRuns(ctx, valRuns, lx, yvL + 12, 'left', P.goldDim);
      setFont(ctx, 12, SERIF, { italic: true });
      ctx.fillStyle = P.azure; ctx.fillText('ordinal', lx, yoL);
      setFont(ctx, 10, SERIF, { italic: true });
      ctx.fillStyle = P.azureDim; ctx.fillText('only falls', lx, yoL + 11);
      resetFont(ctx);
    }

    /* ================== the stretch: the tower & the ruler ================== */
    const stretch = doc.createElement('div');
    stretch.className = 'stretch';
    stage.appendChild(stretch);
    stretch.innerHTML = `
      <div class="st-title">after the walls · the tower and the ruler</div>
      <p>Löb’s theorem (1955) is the wall at its starkest. If PA proves <code>Prov(⌜φ⌝) → φ</code>,
      “any proof of φ would be right,” then PA already proves <code>φ</code>: a theory cannot even
      trust <em>hypothetical</em> proofs of itself, and the second incompleteness theorem is the special
      case <code>φ = (0 = 1)</code>. Löb was answering Leon Henkin, who had asked in 1952 about the
      mirror image of Gödel’s sentence, the one that says <em>I am provable</em>. So the consistency tower
      climbs forever, PA ⊂ PA + Con(PA) ⊂ PA + Con(PA + Con(PA)) ⊂ …, each floor certifying the one below
      and blind to its own.</p>`;
    const towerCtl = ui.controlRow(stretch);
    const tower = doc.createElement('div');
    tower.className = 'lp-tower';
    tower.setAttribute('aria-live', 'polite');
    stretch.appendChild(tower);
    let floors = 0;
    const FLOOR_MAX = 12;
    const subN = (k) => `T<sub>${k}</sub>`;
    function renderTower() {
      tower.replaceChildren();
      for (let k = 0; k <= floors; k++) {
        const f = doc.createElement('div');
        f.className = 'lp-floor' + (k === floors ? ' top' : '');
        f.style.animationDelay = '0s';
        f.innerHTML = k === 0 ? `${subN(0)} = PA` : `${subN(k)} = ${subN(k - 1)} + Con(${subN(k - 1)})`;
        if (k !== floors) f.style.animation = 'none';
        tower.appendChild(f);
      }
      if (floors >= FLOOR_MAX) {
        const f = doc.createElement('div');
        f.className = 'lp-floor';
        f.textContent = '… and so on, forever';
        tower.appendChild(f);
      }
    }
    // A Shepard tone: octave-spaced partials under a fixed bell-shaped
    // envelope, so a whole-step climb never ends and six steps sound like none.
    function shepard(stepIndex) {
      const c = bus.context, t0 = c.currentTime + 0.01;
      const pc = ((stepIndex * 2) % 12 + 12) % 12;
      for (let k = 0; k < 7; k++) {
        const f = 32.703 * Math.pow(2, k + pc / 12);
        const d = (Math.log2(f) - Math.log2(262)) / 1.25;
        const w = Math.exp(-0.5 * d * d);
        if (w < 0.03) continue;
        audio.playTone(bus, { freq: f, dur: 1.1, level: 0.2 * w, attack: 0.02, release: 0.7, when: t0 });
      }
    }
    ui.button(towerCtl, '↑ climb a floor', () => {
      audio.ensureAudio();
      if (floors < FLOOR_MAX) floors++;
      renderTower();
      shepard(floors);
    }, { small: true });
    ui.button(towerCtl, '⟲ back to PA', () => { floors = 0; renderTower(); }, { small: true });
    renderTower();
    ui.caption(stretch,
      'Each floor proves the consistency of the floor below, and none proves its own. Each climb ' +
      'raises the tone a whole step, yet after six floors it sounds exactly where it began: a Shepard ' +
      'tone, rising forever without getting anywhere. The Canon per tonos in Bach’s <em>Musical Offering</em> ' +
      '(1747) plays the same trick in counterpoint, ending a whole tone above where it started, ready to ' +
      'begin again; Hofstadter made it one of his emblems of the strange loop.');

    const p2 = doc.createElement('p');
    p2.innerHTML = `Proof theory turns the tower into a ruler. Gentzen proved PA consistent in 1936 using
      induction up to ε₀, and in 1943 he proved that PA cannot perform that induction itself: ε₀ is
      <em>exactly</em> PA’s proof-theoretic ordinal, the ceiling your hydra meter climbs toward. Weaker and
      stronger theories get their own marks: ω<sup>ω</sup> for primitive recursive arithmetic, Γ₀ for ATR₀
      at the edge of predicativity (Feferman and Schütte). Goodstein’s game can be pushed past that edge.
      Replace exponentiation with Ackermann’s function and the sequences still die, but in 2020 Toshiyasu
      Arai, David Fernández-Duque, Stanley Wainer and Andreas Weiermann proved that no predicative argument
      can show it. Strength is not a slogan; it is an ordinal.`;
    stretch.appendChild(p2);
    const ruler = cv.setupCanvas(stretch, { height: 150 });
    ruler.canvas.setAttribute('role', 'img');
    ruler.canvas.setAttribute('aria-label', 'A ruler of theories: primitive recursive arithmetic at ω to the ω, Peano arithmetic at ε₀, ATR₀ at Γ₀, the Ackermannian Goodstein process beyond it, and full second-order arithmetic and ZFC off the chart. A gold dot marks your hydra’s ordinal.');
    function drawRuler() {
      const { ctx, width: W, height: H } = ruler;
      ctx.clearRect(0, 0, W, H);
      if (W < 120) return;
      const narrow = W < 560;
      const x0 = 20, x1 = W - 20, y = 72;
      const xe = x0 + (x1 - x0) * (narrow ? 0.58 : 0.6);
      const xa = (a) => x0 + ordAltitude(a) * (xe - x0);
      const xG = xe + (x1 - xe) * 0.4, xAG = xe + (x1 - xe) * 0.56;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xe, y); ctx.stroke();
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(xe, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.line;
      arrowHead(ctx, [x1 + 2, y], [x1 - 10, y], 8);
      const marks = [
        { x: x0, runs: ordRuns(0, 14), theory: '', col: FAINT },
        { x: xa(OMEGA), runs: ordRuns(OMEGA, 14), theory: '', col: FAINT },
        { x: xa(W_W), runs: ordRuns(W_W, 14), theory: 'PRA', col: P.ink },
        { x: xe, runs: EPS0_RUNS(15), theory: narrow ? 'PA' : 'PA · the hydra’s ceiling', col: P.goldBright },
        { x: xG, runs: [{ t: 'Γ', s: 15, dy: 0 }, { t: '0', s: 10, dy: 3.5 }], theory: 'ATR₀', col: P.azure },
        { x: xAG, runs: [], theory: '', col: P.azureDim, faint: true },
      ];
      for (const m of marks) {
        ctx.strokeStyle = m.col; ctx.lineWidth = m.faint ? 1 : 1.5;
        ctx.beginPath(); ctx.moveTo(m.x, y - (m.faint ? 5 : 7)); ctx.lineTo(m.x, y + (m.faint ? 5 : 7)); ctx.stroke();
        if (m.runs.length) drawRuns(ctx, m.runs, m.x, y + 26, 'center', m.col);
      }
      // theory names above the axis, in two tiers when they would collide
      const names = marks.filter((m) => m.theory);
      let lastRight = -Infinity, tier = 0;
      for (const m of names) {
        setFont(ctx, 13, SERIF, { caps: 'all-small-caps', track: '1px' });
        const w = ctx.measureText(m.theory).width;
        const left = clamp(m.x - w / 2, 2, W - w - 2);
        tier = left < lastRight + 8 ? 1 - tier : 0;
        const ty = y - 16 - tier * 17;
        ctx.fillStyle = m.col === FAINT ? P.inkDim : m.col;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(m.theory, left, ty);
        lastRight = Math.max(lastRight, left + w);
      }
      resetFont(ctx);
      setFont(ctx, 11, SERIF, { italic: true });
      ctx.fillStyle = FAINT; ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      if (!narrow) { ctx.fillStyle = P.azureDim; ctx.fillText('Ackermann–Goodstein, 2020', xAG - 6, y - 16); }
      ctx.fillStyle = FAINT; ctx.textAlign = 'right';
      ctx.fillText(narrow ? 'second-order arithmetic: long open' : 'full second-order arithmetic: the long-open case', x1, H - 21);
      ctx.fillText('ZFC: far off the chart', x1, H - 7);
      // your hydra, live
      if (tree && tree.kids.length) {
        const hx = xa(hOrd);
        markerSprite.draw(ctx, hx, y, 0.8);
        ctx.fillStyle = P.goldBright;
        ctx.beginPath(); ctx.arc(hx, y, 3, 0, Math.PI * 2); ctx.fill();
        setFont(ctx, 11, SERIF, { italic: true });
        ctx.textAlign = 'center';
        ctx.fillText('your hydra', clamp(hx, 40, xe - 30), y + 40);
      }
      resetFont(ctx);
    }
    ruler.onResize(() => drawRuler());
    ui.caption(stretch,
      'Each theory measured by the ordinal its induction can reach. Up to ε₀ the ruler uses the hydra ' +
      'bar’s order-preserving scale; past it, the marks are only in order. Next door, five states and two ' +
      'symbols turn this ruler on computation itself.');
    ui.speculationPanel(stretch, SPECULATION);

    /* ================== main loop & lifecycle ================== */
    function draw(dt, t) {
      // background pumps that must run even without repaints
      if (bfs && !bfs.done && bfsRunning) { pumpBFS(); if (act === 1) poke(0.3); }
      if (act === 1 && derive) pumpDerive(dt);
      if (act === 3 && sub === 'hydra' && autoplay && tree.kids.length > 0) {
        autoAcc += dt;
        const interval = 1 / speed;
        let guard = 0;
        while (autoAcc >= interval && autoplay && tree.kids.length > 0 && guard++ < 3) {
          autoAcc -= interval;
          let pick = hydraPick(tree, strategy);
          if (pick && hydraChopSize(tree, pick, turn) > NODE_CAP) {
            // past what the canvas can draw: only root-level heads stay open
            pick = hydraLeafPaths(tree).find((p) => p.length === 1) || null;
          }
          if (pick) doChop(pick, { quiet: speed > 12 && guard > 1 });
          else {
            stopAutoplayQuietly();
            blockedMsg = `Every head left would grow the hydra past the ${formatBig(NODE_CAP)} nodes this canvas can ` +
              'draw. The battle would go on far longer; Kirby and Paris guarantee that it ends anyway.';
            updateHydraMeter();
          }
        }
        if (autoAcc > interval) autoAcc = 0;
      }
      if (act === 3 && sub === 'goodstein' && gsRun && !gsDone) {
        gsAcc += dt;
        if (gsAcc > 0.42) { gsAcc = 0; gsStep(); }
      }
      if (t > animUntil) return; // idle: skip repaints entirely
      if (act === 1) { drawCompass(t); drawField(); }
      else if (act === 3 && sub === 'hydra') drawHydra(t);
    }
    const loop = cv.rafLoop(draw);

    refreshMIU();
    judgeIt(false);
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
        if (bfs && !bfs.done && bfsRunning) startBfsSound();
        loop.start();
        poke();
      },
      destroy() {
        loop.stop();
        if (bfsSched) { bfsSched.stop(); bfsSched = null; }
        bus.dispose();
        compass.destroy(); fieldCv.destroy(); hydraCanvas.destroy(); gsChart.destroy(); ruler.destroy();
        style.remove();
      },
    };
  },
};

/* ==================== tests (pure, node-runnable) ==================== */

// Every figure the exhibit states, recomputed. Throws on the first mismatch;
// cheap enough (~50 ms) for docs/tests.html.
function selfTest() {
  const ok = (c, m) => { if (!c) throw new Error('loop selfTest: ' + m); };
  // MIU: no MU within 12 letters; the theorems within 12 letters number 216
  const b12 = miuBFS(12);
  ok(!b12.found && b12.count === 216, `BFS(12) ${b12.count}`);
  ok(godelNumber('MIU') === 310n && godelNumber('MU') === 30n, 'Hofstadter coding 3,1,0');
  // the decision procedure agrees with derivations that check out, rule by rule
  for (const s of ['MIIUII', 'MUI', 'MIUIU', 'MUUUUI', 'MIIIIIIII']) {
    const d = miuDerive(s);
    ok(d && miuCheckDerivation(['MI', ...d.map((x) => x.to)]) && d[d.length - 1].to === s, 'derive ' + s);
  }
  ok(!miuVerdict('MU').ok && !miuVerdict('MIII').ok && !miuVerdict('IM').ok, 'non-theorems');
  // the quine prints itself; every fixed point refers to itself
  const q = runQuine(QUINE);
  ok(q === null || q === QUINE, 'quine');
  for (const p of ['Even', 'Odd', 'Long', 'Unprovable', 'Provable']) {
    const { G } = buildFixedPoint(p);
    ok(evalDiag(G) === quote(G), 'fixed point ' + p);
  }
  // Goodstein: 4, 26, 41, 60, 83 …; 3, 3, 3, 2, 1, 0; ordinals strictly fall
  ok(goodsteinSeq(4, 4).values.map(String).join() === '4,26,41,60,83', 'G(4) prefix');
  const g3 = goodsteinSeq(3, 10);
  ok(g3.terminated && g3.values.map(String).join() === '3,3,3,2,1,0', 'G(3)');
  let v = 4n, base = 2, prev = goodsteinOrd(v, base);
  for (let i = 0; i < 40; i++) {
    v = goodsteinNext(v, base); base++;
    const o = goodsteinOrd(v, base);
    ok(ordCmp(o, prev) < 0 && ordAltitude(o) <= ordAltitude(prev), 'Goodstein ordinal falls at base ' + base);
    prev = o;
  }
  ok(hereditaryStr(266n, 2) === '2^(2^(2 + 1)) + 2^(2 + 1) + 2', 'hereditary 266');
  // hydra: both strategies kill the young hydra, α falling every turn
  for (const st of ['big', 'easy']) {
    const r = hydraBattle(defaultHydra(), st);
    ok(r.dead && r.decreasing, 'hydra battle ' + st);
  }
  ok(hydraSize(hydraChop(HYDRA_SHAPES.ww(), [0, 0, 0], 20000).tree) === hydraChopSize(HYDRA_SHAPES.ww(), [0, 0, 0], 20000), 'large chop');
  // the altitude keeps the order of ordinals
  const L = [0, 5, { terms: [[1, 1]] }, { terms: [[1, 3], [0, 2]] }, { terms: [[2, 1]] },
    { terms: [[{ terms: [[1, 1]] }, 1]] }, { terms: [[{ terms: [[1, 1]] }, 2]] }];
  for (let i = 1; i < L.length; i++) ok(ordAltitude(L[i - 1]) < ordAltitude(L[i]), 'altitude order ' + i);
  return true;
}

export const _test = {
  // MIU
  iCount, miuMoves, makeBFS, miuBFS, godelNumber,
  miuVerdict, miuCheckDerivation, miuShortest, miuConstruct, miuDerive,
  // quine & diagonal lemma
  QUINE, runQuine, quote, diagOp, buildFixedPoint, evalDiag,
  // hydra
  hNode, hClone, hydraOrd, hydraLeafPaths, hydraSize, hydraChop, defaultHydra,
  hydraAt, hydraChopSize, hydraCanon, hydraKeys, hydraPick, hydraBattle, HYDRA_SHAPES,
  // Goodstein
  bumpEval, goodsteinNext, goodsteinSeq, goodsteinOrd, hereditaryStr, hereditaryHTML, bigLog10,
  // ordinal display
  ordAltitude, ordH, ordSucc, ordHTML, strictlyDecreasing, visibleDescent,
  selfTest,
};
