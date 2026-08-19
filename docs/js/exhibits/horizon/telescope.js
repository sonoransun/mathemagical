// III.5 — The Telescope
// A genuine miniature proof assistant (intuitionistic propositional natural
// deduction with a small independent kernel), the unreadable library (a
// scrollbar built to the true scale of the 200-terabyte Boolean Pythagorean
// triples certificate), the trust ladder, and — as the exploratory stretch —
// one statement in four foundations, univalence stated precisely.
//
// Facts as fixed by the design report (docs/design/movement-3-horizon.md,
// §III.5): Mathlib > 1.5 million lines; four-color Appel–Haken 1976 /
// Gonthier 2005; Kepler Hales 1998 / Flyspeck 2014; Liquid Tensor Experiment
// 2020→2022; Polynomial Freiman–Ruzsa proved Nov 2023, formalized in ~3 weeks;
// Equational Theories Project 2024–25, 4694 magma laws, ~22 million
// implications; Boolean Pythagorean triples (7824 vs 7825) Heule–Kullmann–
// Marek 2016, 200 TB; Schur number five, Heule 2017, 2 PB; AlphaProof silver
// at IMO 2024 (28/42; P1, P2, P6; AlphaGeometry 2 took P4), Nature 2025;
// general-purpose models at gold standard in 2025. The three futures and the
// claims of univalent foundations are speculation and are labeled on-page.
//
// No top-level DOM/window/Audio access: the whole first half of this file is
// pure logic, importable (and tested) under node.

/* ======================================================================
   PART 1 — THE KERNEL (pure; exported via _test)
   ====================================================================== */

/* ---------- errors: every failure is a message, never a crash ---------- */

export class TacticError extends Error {
  constructor(msg) { super(msg); this.name = 'TacticError'; this.clean = true; }
}
export class KernelError extends Error {
  constructor(msg) { super(msg); this.name = 'KernelError'; this.clean = true; }
}
class ParseError extends Error {
  constructor(msg) { super(msg); this.name = 'ParseError'; this.clean = true; }
}

/* ---------- formulas: atoms, →, ∧, ∨ ---------- */

const atom = (name) => ({ k: 'atom', name });
const imp = (a, b) => ({ k: 'imp', a, b });
const and = (a, b) => ({ k: 'and', a, b });
const or = (a, b) => ({ k: 'or', a, b });

// Tokenizer accepts ASCII (->, /\, \/, &, |) and Unicode (→, ∧, ∨) operators.
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c }); i++; continue; }
    if (src.startsWith('->', i)) { toks.push({ t: 'imp' }); i += 2; continue; }
    if (src.startsWith('/\\', i)) { toks.push({ t: 'and' }); i += 2; continue; }
    if (src.startsWith('\\/', i)) { toks.push({ t: 'or' }); i += 2; continue; }
    if (c === '→') { toks.push({ t: 'imp' }); i++; continue; }
    if (c === '∧' || c === '&') { toks.push({ t: 'and' }); i++; continue; }
    if (c === '∨' || c === '|') { toks.push({ t: 'or' }); i++; continue; }
    const m = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i));
    if (m) { toks.push({ t: 'atom', name: m[0] }); i += m[0].length; continue; }
    throw new ParseError(`unexpected character "${c}" in formula`);
  }
  return toks;
}

// Grammar (→ right-associative; ∧ binds tighter than ∨ binds tighter than →):
//   formula := disj ('→' formula)?
//   disj    := conj ('∨' conj)*
//   conj    := prim ('∧' prim)*
//   prim    := ATOM | '(' formula ')'
export function parseFormula(src) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const take = () => toks[pos++];

  function prim() {
    const tk = peek();
    if (!tk) throw new ParseError('formula ends where an atom or "(" was expected');
    if (tk.t === 'atom') { take(); return atom(tk.name); }
    if (tk.t === '(') {
      take();
      const f = formula();
      if (!peek() || peek().t !== ')') throw new ParseError('expected ")" — unbalanced parenthesis');
      take();
      return f;
    }
    throw new ParseError(`expected an atom or "(", found an operator`);
  }
  function conj() {
    let f = prim();
    while (peek() && peek().t === 'and') { take(); f = and(f, prim()); }
    return f;
  }
  function disj() {
    let f = conj();
    while (peek() && peek().t === 'or') { take(); f = or(f, conj()); }
    return f;
  }
  function formula() {
    const f = disj();
    if (peek() && peek().t === 'imp') { take(); return imp(f, formula()); }
    return f;
  }
  const f = formula();
  if (pos < toks.length) throw new ParseError('trailing symbols after a complete formula');
  return f;
}

// Precedence: imp 1 (right-assoc) < or 2 < and 3 < atom 4.
const PREC = { imp: 1, or: 2, and: 3, atom: 4 };
export function formulaToString(f) {
  function go(f, min) {
    const p = PREC[f.k];
    let s;
    if (f.k === 'atom') s = f.name;
    // Antecedents of → show parens around ∨ and → (house style, after the
    // design report's own rendering: ((A ∨ B) → C) → (A → C) ∧ (B → C)).
    else if (f.k === 'imp') s = `${go(f.a, PREC.or + 1)} → ${go(f.b, p)}`;
    else if (f.k === 'and') s = `${go(f.a, p)} ∧ ${go(f.b, p + 1)}`;
    else s = `${go(f.a, p)} ∨ ${go(f.b, p + 1)}`;
    return p < min ? `(${s})` : s;
  }
  return go(f, 0);
}

export function formulaEq(x, y) {
  if (x.k !== y.k) return false;
  if (x.k === 'atom') return x.name === y.name;
  return formulaEq(x.a, y.a) && formulaEq(x.b, y.b);
}

/* ---------- proof terms (Curry–Howard witnesses) ----------
   var | lam | app | pair | inl | inr | case | unpair | hole            */

function termReplaceHole(t, id, node) {
  // Structural replacement; nodes are never mutated, so sharing is safe
  // (this is what makes undo a matter of keeping the old state object).
  switch (t.k) {
    case 'hole': return t.id === id ? node : t;
    case 'var': return t;
    case 'lam': { const b = termReplaceHole(t.body, id, node); return b === t.body ? t : { k: 'lam', v: t.v, body: b }; }
    case 'app': {
      const f = termReplaceHole(t.f, id, node), a = termReplaceHole(t.arg, id, node);
      return f === t.f && a === t.arg ? t : { k: 'app', f, arg: a };
    }
    case 'pair': {
      const a = termReplaceHole(t.a, id, node), b = termReplaceHole(t.b, id, node);
      return a === t.a && b === t.b ? t : { k: 'pair', a, b };
    }
    case 'inl': { const b = termReplaceHole(t.body, id, node); return b === t.body ? t : { k: 'inl', body: b }; }
    case 'inr': { const b = termReplaceHole(t.body, id, node); return b === t.body ? t : { k: 'inr', body: b }; }
    case 'case': {
      const l = termReplaceHole(t.lbody, id, node), r = termReplaceHole(t.rbody, id, node);
      return l === t.lbody && r === t.rbody ? t : { ...t, lbody: l, rbody: r };
    }
    case 'unpair': { const b = termReplaceHole(t.body, id, node); return b === t.body ? t : { ...t, body: b }; }
    default: throw new KernelError(`unknown term node "${t.k}"`);
  }
}

// prec: 0 = free-standing, 1 = function position, 2 = argument position
export function termToString(t, prec = 0) {
  switch (t.k) {
    case 'var': return t.name;
    case 'hole': return `?${t.id}`;
    case 'lam': {
      const s = `λ${t.v}. ${termToString(t.body, 0)}`;
      return prec > 0 ? `(${s})` : s;
    }
    case 'app': {
      const s = `${termToString(t.f, 1)} ${termToString(t.arg, 2)}`;
      return prec === 2 ? `(${s})` : s;
    }
    case 'pair': return `⟨${termToString(t.a, 0)}, ${termToString(t.b, 0)}⟩`;
    case 'inl': { const s = `inl ${termToString(t.body, 2)}`; return prec >= 1 ? `(${s})` : s; }
    case 'inr': { const s = `inr ${termToString(t.body, 2)}`; return prec >= 1 ? `(${s})` : s; }
    case 'case': {
      const s = `match ${termToString(t.scrut, 1)} with inl ${t.lv} ⇒ ${termToString(t.lbody, 0)} | inr ${t.rv} ⇒ ${termToString(t.rbody, 0)}`;
      return prec > 0 ? `(${s})` : s;
    }
    case 'unpair': {
      const s = `let ⟨${t.av}, ${t.bv}⟩ := ${termToString(t.scrut, 1)} in ${termToString(t.body, 0)}`;
      return prec > 0 ? `(${s})` : s;
    }
    default: return '⁇';
  }
}

/* ---------- the kernel proper: a bidirectional type checker ----------
   This is the de Bruijn criterion in miniature: it is independent of the
   tactic machinery above it and re-derives every judgment from scratch.
   ctx: array of [name, formula]; lookup from the end (shadowing).        */

function ctxLookup(ctx, name) {
  for (let i = ctx.length - 1; i >= 0; i--) if (ctx[i][0] === name) return ctx[i][1];
  throw new KernelError(`unbound variable "${name}" — nothing in the context justifies it`);
}

export function inferTerm(t, ctx) {
  if (t.k === 'var') return ctxLookup(ctx, t.name);
  if (t.k === 'app') {
    const ft = inferTerm(t.f, ctx);
    if (ft.k !== 'imp') {
      throw new KernelError(`applied a term of type ${formulaToString(ft)} — it is not an implication`);
    }
    checkAgainst(t.arg, ft.a, ctx, null, 0);
    return ft.b;
  }
  throw new KernelError(`cannot infer the type of a "${t.k}" node — only variables and applications carry their own types`);
}

function checkAgainst(t, ty, ctx, trace, depth) {
  const say = (rule, detail) => { if (trace) trace.push({ depth, rule, detail }); };
  switch (t.k) {
    case 'lam': {
      if (ty.k !== 'imp') throw new KernelError(`λ${t.v} claims an implication, but the goal is ${formulaToString(ty)}`);
      say('→-intro', `λ${t.v} : ${formulaToString(ty)}`);
      checkAgainst(t.body, ty.b, [...ctx, [t.v, ty.a]], trace, depth + 1);
      return;
    }
    case 'pair': {
      if (ty.k !== 'and') throw new KernelError(`a pair claims a conjunction, but the goal is ${formulaToString(ty)}`);
      say('∧-intro', `⟨…, …⟩ : ${formulaToString(ty)}`);
      checkAgainst(t.a, ty.a, ctx, trace, depth + 1);
      checkAgainst(t.b, ty.b, ctx, trace, depth + 1);
      return;
    }
    case 'inl': {
      if (ty.k !== 'or') throw new KernelError(`inl claims a disjunction, but the goal is ${formulaToString(ty)}`);
      say('∨-intro₁', `inl … : ${formulaToString(ty)}`);
      checkAgainst(t.body, ty.a, ctx, trace, depth + 1);
      return;
    }
    case 'inr': {
      if (ty.k !== 'or') throw new KernelError(`inr claims a disjunction, but the goal is ${formulaToString(ty)}`);
      say('∨-intro₂', `inr … : ${formulaToString(ty)}`);
      checkAgainst(t.body, ty.b, ctx, trace, depth + 1);
      return;
    }
    case 'case': {
      const st = inferTerm(t.scrut, ctx);
      if (st.k !== 'or') throw new KernelError(`case analysis on ${formulaToString(st)} — it is not a disjunction`);
      say('∨-elim', `match ${termToString(t.scrut, 1)} : ${formulaToString(st)}`);
      checkAgainst(t.lbody, ty, [...ctx, [t.lv, st.a]], trace, depth + 1);
      checkAgainst(t.rbody, ty, [...ctx, [t.rv, st.b]], trace, depth + 1);
      return;
    }
    case 'unpair': {
      const st = inferTerm(t.scrut, ctx);
      if (st.k !== 'and') throw new KernelError(`let ⟨…⟩ on ${formulaToString(st)} — it is not a conjunction`);
      say('∧-elim', `let ⟨${t.av}, ${t.bv}⟩ := ${termToString(t.scrut, 1)} : ${formulaToString(st)}`);
      checkAgainst(t.body, ty, [...ctx, [t.av, st.a], [t.bv, st.b]], trace, depth + 1);
      return;
    }
    case 'hole':
      throw new KernelError(`the proof term still has a hole (?${t.id}) — it proves nothing`);
    default: {
      const it = inferTerm(t, ctx);
      if (!formulaEq(it, ty)) {
        throw new KernelError(`${termToString(t)} has type ${formulaToString(it)}, but ${formulaToString(ty)} was required`);
      }
      say(t.k === 'var' ? 'axiom' : '→-elim', `${termToString(t)} : ${formulaToString(ty)}  ✓`);
    }
  }
}

// Check `term` against `formula` under hypotheses ctx. Returns the trace of
// rule applications (for the visible re-check); throws KernelError on failure.
export function checkTerm(term, ctx, formula) {
  const trace = [];
  checkAgainst(term, formula, ctx, trace, 0);
  trace.push({ depth: 0, rule: 'QED', detail: `${termToString(term)} : ${formulaToString(formula)}` });
  return trace;
}

/* ---------- tactics: the moves of the game ---------- */

export function startProof(formula) {
  return {
    formula,
    goals: [{ id: 0, hyps: [], target: formula }],
    term: { k: 'hole', id: 0 },
    nextId: 1,
    done: false,
  };
}

const AUTO_NAMES = 'abcdefghijklmnopqrstuvwxyz';
function freshName(hyps, preferred) {
  const used = new Set(hyps.map(([n]) => n));
  if (preferred && !used.has(preferred)) return preferred;
  for (const c of AUTO_NAMES) if (!used.has(c)) return c;
  let i = 1;
  while (used.has('h' + i)) i++;
  return 'h' + i;
}
function suggestName(hyps, f) {
  if (f.k === 'atom') return freshName(hyps, f.name.toLowerCase());
  if (f.k === 'imp') return freshName(hyps, 'f');
  return freshName(hyps, 'h');
}
function findHyp(goal, name, tactic) {
  const h = goal.hyps.find(([n]) => n === name);
  if (!h) {
    const have = goal.hyps.length ? goal.hyps.map(([n]) => n).join(', ') : 'nothing';
    throw new TacticError(`${tactic}: no hypothesis named "${name}" — the context holds ${have}`);
  }
  return h[1];
}

// Apply one tactic line ('intro a' | 'exact h' | 'apply h' | 'split' |
// 'cases h a b' | 'left' | 'right') to the FIRST open goal. Pure: returns a
// new state, throws TacticError on an illegal move.
export function applyTactic(state, line) {
  if (state.done || state.goals.length === 0) {
    throw new TacticError('the proof is already complete — no goals remain');
  }
  const words = line.trim().split(/\s+/);
  const [tac, ...args] = words;
  const goal = state.goals[0];
  const rest = state.goals.slice(1);
  let nextId = state.nextId;
  const hole = () => ({ k: 'hole', id: nextId++ });

  let node;            // term node that fills this goal's hole
  let newGoals = [];   // subgoals, in order

  switch (tac) {
    case 'intro': {
      if (goal.target.k !== 'imp') {
        throw new TacticError(`intro: the goal ${formulaToString(goal.target)} is not an implication — there is nothing to introduce`);
      }
      let name;
      if (args[0]) {
        if (goal.hyps.some(([n]) => n === args[0])) {
          throw new TacticError(`intro: the name "${args[0]}" is already in use`);
        }
        name = args[0];
      } else {
        name = suggestName(goal.hyps, goal.target.a);
      }
      const h = hole();
      node = { k: 'lam', v: name, body: h };
      newGoals = [{ id: h.id, hyps: [...goal.hyps, [name, goal.target.a]], target: goal.target.b }];
      break;
    }
    case 'exact': {
      if (!args[0]) throw new TacticError('exact: which hypothesis? (exact <name>)');
      const f = findHyp(goal, args[0], 'exact');
      if (!formulaEq(f, goal.target)) {
        throw new TacticError(`exact: ${args[0]} : ${formulaToString(f)} does not match the goal ${formulaToString(goal.target)}`);
      }
      node = { k: 'var', name: args[0] };
      break;
    }
    case 'apply': {
      if (!args[0]) throw new TacticError('apply: which hypothesis? (apply <name>)');
      const f = findHyp(goal, args[0], 'apply');
      const wanted = [];
      let cur = f;
      while (!formulaEq(cur, goal.target)) {
        if (cur.k !== 'imp') {
          throw new TacticError(`apply: ${args[0]} : ${formulaToString(f)} does not conclude in the goal ${formulaToString(goal.target)}`);
        }
        wanted.push(cur.a);
        cur = cur.b;
      }
      node = { k: 'var', name: args[0] };
      for (const w of wanted) {
        const h = hole();
        node = { k: 'app', f: node, arg: h };
        newGoals.push({ id: h.id, hyps: goal.hyps, target: w });
      }
      break;
    }
    case 'split': {
      if (goal.target.k !== 'and') {
        throw new TacticError(`split: the goal ${formulaToString(goal.target)} is not a conjunction — there are no two halves to split into`);
      }
      const h1 = hole(), h2 = hole();
      node = { k: 'pair', a: h1, b: h2 };
      newGoals = [
        { id: h1.id, hyps: goal.hyps, target: goal.target.a },
        { id: h2.id, hyps: goal.hyps, target: goal.target.b },
      ];
      break;
    }
    case 'left': case 'right': {
      if (goal.target.k !== 'or') {
        throw new TacticError(`${tac}: the goal ${formulaToString(goal.target)} is not a disjunction — only an ∨ offers a ${tac} side`);
      }
      const h = hole();
      node = { k: tac === 'left' ? 'inl' : 'inr', body: h };
      newGoals = [{ id: h.id, hyps: goal.hyps, target: tac === 'left' ? goal.target.a : goal.target.b }];
      break;
    }
    case 'cases': {
      if (!args[0]) throw new TacticError('cases: which hypothesis? (cases <name>)');
      const f = findHyp(goal, args[0], 'cases');
      const at = goal.hyps.findIndex(([n]) => n === args[0]);
      const without = goal.hyps.filter((_, i) => i !== at);
      if (f.k === 'or') {
        const ln = args[1] || suggestName(without, f.a);
        const rn = args[2] || suggestName(without, f.b);
        const h1 = hole(), h2 = hole();
        node = { k: 'case', scrut: { k: 'var', name: args[0] }, lv: ln, lbody: h1, rv: rn, rbody: h2 };
        const ins = (nm, ff) => { const hs = [...without]; hs.splice(at, 0, [nm, ff]); return hs; };
        newGoals = [
          { id: h1.id, hyps: ins(ln, f.a), target: goal.target },
          { id: h2.id, hyps: ins(rn, f.b), target: goal.target },
        ];
      } else if (f.k === 'and') {
        const an = args[1] || suggestName(without, f.a);
        const hs1 = [...without]; hs1.splice(at, 0, [an, f.a]);
        const bn = args[2] || suggestName(hs1, f.b);
        const h = hole();
        node = { k: 'unpair', scrut: { k: 'var', name: args[0] }, av: an, bv: bn, body: h };
        const hs = [...hs1]; hs.splice(at + 1, 0, [bn, f.b]);
        newGoals = [{ id: h.id, hyps: hs, target: goal.target }];
      } else {
        throw new TacticError(`cases: ${args[0]} : ${formulaToString(f)} is neither a disjunction nor a conjunction — there are no cases to take`);
      }
      break;
    }
    default:
      throw new TacticError(`unknown tactic "${tac}" — the instrument knows intro, exact, apply, split, cases, left, right`);
  }

  const term = termReplaceHole(state.term, goal.id, node);
  const goals = [...newGoals, ...rest];
  return { formula: state.formula, goals, term, nextId, done: goals.length === 0 };
}

// Run a whole script against a statement. Never throws for a bad script:
// returns { ok:false, error, step } instead. On success, re-checks the
// finished term with the kernel and returns its trace.
export function runScript(statementSrc, lines) {
  let step = -1;
  try {
    const formula = parseFormula(statementSrc);
    let state = startProof(formula);
    for (step = 0; step < lines.length; step++) {
      state = applyTactic(state, lines[step]);
    }
    if (state.goals.length > 0) {
      return { ok: false, error: `${state.goals.length} goal(s) remain unproved`, step: lines.length };
    }
    const trace = checkTerm(state.term, [], formula);   // the kernel re-check
    return { ok: true, state, term: state.term, termString: termToString(state.term), kernelOk: true, trace };
  } catch (e) {
    if (e && e.clean) return { ok: false, error: e.message, step: Math.max(step, 0) };
    throw e;   // a genuine bug should surface, not be swallowed
  }
}

/* ---------- the six lemmas (each script ends in a kernel re-check
             via runScript) and one deliberately wrong script ---------- */

export const LEMMAS = [
  {
    name: 'the mirror', statement: 'A -> A',
    script: ['intro a', 'exact a'],
    blurb: 'Every proposition implies itself. One introduction, one axiom — the shortest proof there is.',
  },
  {
    name: 'the keeper', statement: 'A -> B -> A',
    script: ['intro a', 'intro b', 'exact a'],
    blurb: 'A truth, once had, survives any further assumption. (Logicians call this K.)',
  },
  {
    name: 'the swap', statement: 'A /\\ B -> B /\\ A',
    script: ['intro h', 'cases h a b', 'split', 'exact b', 'exact a'],
    blurb: 'Take a conjunction apart, put it back in the other order.',
  },
  {
    name: 'the turnabout', statement: 'A \\/ B -> B \\/ A',
    script: ['intro h', 'cases h a b', 'right', 'exact a', 'left', 'exact b'],
    blurb: 'A disjunction demands case analysis: two futures, and you must win both.',
  },
  {
    name: 'the relay', statement: '(A -> B) -> (B -> C) -> (A -> C)',
    script: ['intro f', 'intro g', 'intro a', 'apply g', 'apply f', 'exact a'],
    blurb: 'Composition of implications — apply runs the proof backwards, from the goal toward what you hold.',
  },
  {
    name: 'the case-splitter', statement: '((A \\/ B) -> C) -> (A -> C) /\\ (B -> C)',
    script: ['intro h', 'split', 'intro a', 'apply h', 'left', 'exact a', 'intro b', 'apply h', 'right', 'exact b'],
    blurb: 'One handler for either case splits into a handler for each — every tactic you have learned, in one proof.',
  },
];

// The wrong turn: in the left case of A ∨ B you cannot choose the left side
// of B ∨ A. The kernel-facing machinery refuses with a message, not a crash.
export const BAD_SCRIPT = {
  statement: 'A \\/ B -> B \\/ A',
  script: ['intro h', 'cases h a b', 'left', 'exact a'],
  note: 'left commits the goal B ∨ A to proving B — but this branch only holds a : A.',
};

/* ---------- the unreadable library, arithmetically ---------- */

// A dense printed page ≈ 3,000 bytes. A page a minute, twelve hours a day.
export function readingStats(bytes, bytesPerPage = 3000) {
  const pages = bytes / bytesPerPage;
  const pagesPerDay = 60 * 12;
  const years = pages / pagesPerDay / 365.25;
  // a scrollbar giving each page one CSS pixel, at 96 px/inch:
  const trackKm = pages * (2.54 / 96) / 1e5;
  return { bytes, pages, pagesPerDay, years, trackKm };
}

// One-call self-test for the site harness (tests.html): all six lemma scripts
// must prove and kernel-re-check; the wrong script must fail with a message;
// the kernel must reject a forged term; the library arithmetic must hold.
export function selfTest() {
  for (const lem of LEMMAS) {
    const r = runScript(lem.statement, lem.script);
    if (!r.ok || !r.kernelOk) throw new Error(`lemma "${lem.name}": ${r.error || 'kernel re-check failed'}`);
  }
  const bad = runScript(BAD_SCRIPT.statement, BAD_SCRIPT.script);
  if (bad.ok) throw new Error('the deliberately wrong script was accepted');
  if (typeof bad.error !== 'string' || !bad.error) throw new Error('wrong script failed without a message');
  let rejected = false;
  try { checkTerm({ k: 'lam', v: 'a', body: { k: 'var', name: 'a' } }, [], parseFormula('A -> B')); }
  catch (e) { rejected = e instanceof KernelError; }
  if (!rejected) throw new Error('the kernel accepted a forged term');
  const rs = readingStats(200e12);
  if (!(rs.years > 2e5 && rs.years < 3e5)) throw new Error('reading-time arithmetic drifted');
  return true;
}

/* ======================================================================
   PART 2 — THE EXHIBIT
   ====================================================================== */

const CERTS = [
  {
    id: 'bpt',
    label: 'Boolean Pythagorean triples — 200 TB (Heule–Kullmann–Marek, 2016)',
    bytes: 200e12,
    line: '{1…7824} splits into two parts with no monochromatic a²+b²=c²; {1…7825} does not.',
  },
  {
    id: 'schur',
    label: 'Schur number five — 2 PB (Heule, 2017)',
    bytes: 2e15,
    line: '{1…160} splits into five sum-free parts; {1…161} does not.',
  },
];

const TRUST_CHAINS = [
  {
    id: 'fc1976',
    label: 'Four-color theorem — Appel–Haken, 1976 (journal route)',
    links: [
      ['the authors', 'human'],
      ['400 pages of case charts, checked by hand', 'human'],
      ['1,200 hours of bespoke mainframe programs, unpublished in full', 'machine'],
      ['referees who could not re-run them', 'human'],
      ['your own reading', 'human'],
    ],
  },
  {
    id: 'kepler1998',
    label: 'Kepler conjecture — Hales, 1998 (journal route)',
    links: [
      ['the author', 'human'],
      ['≈300 pages of prose and 40,000 lines of code', 'human'],
      ['a referee panel: four years, "99% certain"', 'human'],
      ['your own reading', 'human'],
    ],
  },
  {
    id: 'fc2005',
    label: 'Four-color theorem — Gonthier, 2005 (machine route)',
    links: [
      ['the statement, short enough to read', 'human'],
      ['the Coq proof checker\'s small kernel', 'kernel'],
      ['the compiler that built it', 'machine'],
      ['silicon', 'silicon'],
    ],
  },
  {
    id: 'flyspeck',
    label: 'Kepler conjecture — Flyspeck, 2014 (machine route)',
    links: [
      ['the statement, short enough to read', 'human'],
      ['the HOL Light kernel — a few hundred lines', 'kernel'],
      ['the compiler that built it', 'machine'],
      ['silicon', 'silicon'],
    ],
  },
  {
    id: 'pfr',
    label: 'Polynomial Freiman–Ruzsa — 2023, formalized in ~3 weeks (machine route)',
    links: [
      ['the statement, short enough to read', 'human'],
      ['the Lean kernel — a small trusted core', 'kernel'],
      ['the compiler that built it', 'machine'],
      ['silicon', 'silicon'],
    ],
  },
];

const FOUNDATIONS = [
  {
    id: 'nd', tab: 'natural deduction',
    title: 'A ∧ B → B ∧ A in the instrument above',
    body: null, // filled at runtime — the visitor's own proof if they made one
  },
  {
    id: 'lean', tab: 'Lean 4',
    title: 'The same statement in Lean',
    body:
`example (A B : Prop) : A ∧ B → B ∧ A := by
  intro h
  obtain ⟨a, b⟩ := h
  exact ⟨b, a⟩

-- or, as a bare proof term (the same program):
example (A B : Prop) : A ∧ B → B ∧ A :=
  fun h => ⟨h.2, h.1⟩`,
    note: 'The tactic script and the term are the same object — exactly the correspondence the instrument revealed.',
  },
  {
    id: 'hott', tab: 'HoTT',
    title: 'The same statement as a path',
    body:
`swap : A × B → B × A  :=  λ p. ⟨snd p, fst p⟩
swap ∘ swap ~ id        -- so swap is an equivalence:
e : (A × B) ≃ (B × A)
ua e : (A × B) = (B × A)   -- univalence turns it into a path`,
    note:
      'Univalence, stated precisely: for any types A and B, the canonical map (A = B) → (A ≃ B) is itself an ' +
      'equivalence. What it buys: transport — any theorem about A × B carries across the path to B × A for free, ' +
      'and isomorphic structures are literally identical. What it costs: a different logic — equality proofs ' +
      'carry content, and the axiom in its raw form blocked the computation rule for equality until cubical ' +
      'type theories repaired it.',
  },
  {
    id: 'prose', tab: 'prose',
    title: 'The same statement in a journal',
    body:
`Proposition. If A and B, then B and A.

Proof. Suppose A ∧ B. Then in particular B holds,
and A holds; whence B ∧ A. ∎`,
    note:
      'Four words of Latin and a box. Everything the kernel spelled out — which rule, applied to which ' +
      'hypothesis, in which order — the reader is trusted to reconstruct.',
  },
];

export default {
  id: 'telescope',
  movement: 3,
  title: 'The Telescope',
  hook: 'Prove a real theorem the way a machine checks it — then confront the proofs no one will ever read.',
  prose: `
    <p>There is an instrument below, and it is not a metaphor: a working proof assistant,
    miniature but honest. You are given a goal. You act on it with <em>tactics</em> —
    <code>intro</code> to assume, <code>split</code> to divide, <code>apply</code> to reason
    backwards — and every move is checked by a small, separate <em>kernel</em> that re-derives
    the whole argument from its inference rules before granting the QED. That architecture is
    called the <em>de Bruijn criterion</em>, and it is the quiet idea underneath everything
    this exhibit shows: concentrate all trust in a core small enough to read in an afternoon,
    and then build without limit on top of it. Lean's mathematical library, Mathlib, now
    exceeds 1.5 million lines; its credibility rests on a kernel a thousandth that size.</p>
    <p>The history runs from scandal to routine. In 1976 Appel and Haken proved the four-color
    theorem with 1,200 hours of computer time no referee could honestly re-check, and many
    mathematicians recoiled; in 2005 Georges Gonthier rebuilt the entire proof inside a
    checker, and the discomfort simply dissolved — there was nothing left to take on faith
    but the kernel. Thomas Hales lived both halves of that story: the referees of his 1998
    Kepler conjecture proof surrendered after four years, calling themselves 99% certain, so
    Hales spent the next decade formalizing it — the Flyspeck project, completed in 2014. In
    2020 Peter Scholze challenged the proof-assistant community to verify a theorem he
    himself was uneasy about; the Liquid Tensor Experiment finished in 2022. By November 2023
    the rhythm had inverted: the Polynomial Freiman–Ruzsa conjecture was proved, and a
    Tao-led open collaboration formalized it in about three weeks — verification moving at
    the speed of research. The Equational Theories Project of 2024–25 settled roughly
    22 million implications between 4,694 algebraic laws, a human–machine swarm working at a
    scale no seminar could hold.</p>
    <p>And then there are the proofs that left us behind. Split the numbers 1 through 7,824
    into two sets, and you can always avoid giving either set a full Pythagorean triple
    <code>a² + b² = c²</code>; at 7,825 it becomes impossible — that is a theorem, proved by
    Heule, Kullmann, and Marek in 2016, and its certificate is 200 terabytes. Schur number
    five (Heule, 2017) weighs two petabytes. The scrollbar below is built to the true scale
    of the 200-terabyte proof: the thumb — one human-readable page — is thinner than a
    wavelength of anything. Scroll it anyway. The arithmetic beside it, computed live, is
    the honest punchline.</p>
    <p>When you finish a lemma, the instrument shows you something strange: your proof,
    written as a program. This is the <em>Curry–Howard correspondence</em> — every
    <code>intro</code> was a λ, every <code>apply</code> a function call, every
    <code>split</code> a pair, every <code>cases</code> a match — and it is not a curiosity
    but the reason machines can enter mathematics at all. A proof is data; data can be
    checked, searched, generated. DeepMind's AlphaProof reached silver-medal standard at the
    2024 International Mathematical Olympiad — 28 of 42 points, solving three problems
    outright, with AlphaGeometry 2 taking a fourth — a result published in <em>Nature</em>
    in 2025, the same year general-purpose models reached gold-medal standard in plain
    natural language. The kernel does not ask who wrote the proof. That is either the most
    democratic sentence in mathematics or the most unsettling, and the panel at the bottom
    of this exhibit refuses to decide for you.</p>
    <p>So the only question left is the oldest one: what, exactly, must you trust? For each
    landmark below, the chain is drawn link by link — referees, kernels, compilers, silicon.
    Doubt any link and the theorem hangs from it. Count the links: the machine-checked
    chains are shorter.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const bus = audio.createBus('telescope');

    /* ---------- scoped style ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-telescope .tel-h { font-variant: small-caps; letter-spacing:.16em; font-size:.8rem;
        color:${P.gold}; margin:1.6rem 0 .5rem; }
      #ex-telescope .tel-h:first-child { margin-top:.2rem; }
      #ex-telescope .tel-lemmas { display:flex; flex-wrap:wrap; gap:.4rem; margin-bottom:.7rem; }
      #ex-telescope .tel-lemmas .btn.proved { color:${P.verdant}; border-color:${P.verdant}; }
      #ex-telescope .tel-proof { display:flex; gap:1rem; align-items:flex-start; flex-wrap:wrap; }
      #ex-telescope .tel-goals { flex:1 1 20rem; min-width:17rem; }
      #ex-telescope .tel-goal { border:1px solid ${P.line}; border-radius:6px; background:${P.bg};
        padding:.65rem .85rem; margin-bottom:.55rem; font-family:var(--mono); font-size:.92rem; }
      #ex-telescope .tel-goal.current { border-color:${P.goldDim}; }
      #ex-telescope .tel-goal.waiting { opacity:.55; font-size:.8rem; padding:.4rem .85rem; }
      #ex-telescope .tel-hyp { padding:.12rem .3rem; border-radius:4px; color:${P.inkDim}; }
      #ex-telescope .tel-hyp b { color:${P.azure}; font-weight:600; }
      #ex-telescope.tel-armed .tel-goal.current .tel-hyp { cursor:pointer; outline:1px dashed ${P.azureDim}; }
      #ex-telescope.tel-armed .tel-goal.current .tel-hyp:hover { background:${P.panel}; color:${P.ink}; }
      #ex-telescope .tel-turnstile { margin-top:.35rem; padding-top:.35rem; border-top:1px solid ${P.line};
        color:${P.ink}; }
      #ex-telescope .tel-turnstile .tstile { color:${P.gold}; margin-right:.45rem; }
      #ex-telescope .tel-tactics { flex:0 1 15rem; display:flex; flex-wrap:wrap; gap:.4rem;
        align-content:flex-start; }
      #ex-telescope .tel-tactics .btn { min-width:4.2rem; }
      #ex-telescope .tel-tactics .btn.armed { border-color:${P.azure}; color:${P.azure}; }
      #ex-telescope .tel-locked .tel-tactics .btn { opacity:.35; pointer-events:none; }
      #ex-telescope .tel-msg { min-height:1.4rem; margin:.5rem 0 .2rem; font-family:var(--mono);
        font-size:.85rem; color:${P.inkDim}; }
      #ex-telescope .tel-msg.err { color:${P.crimson}; }
      #ex-telescope .tel-msg.good { color:${P.verdant}; }
      #ex-telescope .tel-script { font-family:var(--mono); font-size:.8rem; color:${P.inkFaint};
        margin:.2rem 0 .4rem; min-height:1.1rem; word-break:break-word; }
      #ex-telescope .tel-script b { color:${P.inkDim}; font-weight:400; }
      #ex-telescope .tel-kernel { display:none; border:1px solid ${P.line}; border-left:3px solid ${P.gold};
        border-radius:0 6px 6px 0; background:${P.bg}; padding:.6rem .9rem; margin:.6rem 0;
        font-family:var(--mono); font-size:.82rem; color:${P.inkDim}; }
      #ex-telescope .tel-kernel.show { display:block; }
      #ex-telescope .tel-kernel .kline { white-space:pre-wrap; }
      #ex-telescope .tel-kernel .kline .rule { color:${P.azure}; }
      #ex-telescope .tel-kernel .kline.qed { color:${P.verdant}; }
      #ex-telescope .tel-term { display:none; border:1px solid ${P.goldDim}; border-radius:6px;
        background:linear-gradient(90deg, rgba(201,169,89,.07), transparent 70%); padding:.7rem .9rem;
        margin:.6rem 0; }
      #ex-telescope .tel-term.show { display:block; }
      #ex-telescope .tel-term .tt-code { font-family:var(--mono); font-size:.95rem; color:${P.goldBright};
        word-break:break-word; margin-bottom:.35rem; }
      #ex-telescope .tel-term .tt-note { font-size:.85rem; color:${P.inkDim}; font-style:italic; }
      #ex-telescope .tel-scale { font-family:var(--mono); font-size:.82rem; color:${P.inkDim};
        margin:.45rem 0; line-height:1.6; }
      #ex-telescope .tel-scale b { color:${P.gold}; font-weight:600; }
      #ex-telescope .tel-scale .ts-thm { color:${P.ink}; margin-bottom:.2rem; }
      #ex-telescope .readout { white-space:normal; overflow-wrap:anywhere; }
      #ex-telescope .tel-chain { display:flex; flex-wrap:wrap; align-items:center; gap:.15rem;
        margin:.6rem 0 .3rem; }
      #ex-telescope .tel-link { border:1.5px solid ${P.goldDim}; border-radius:999px; padding:.3rem .7rem;
        font-size:.8rem; color:${P.ink}; cursor:pointer; background:${P.panel}; user-select:none;
        transition: border-color .15s, color .15s, opacity .15s; }
      #ex-telescope .tel-link:hover { border-color:${P.gold}; }
      #ex-telescope .tel-link.doubted { border-style:dashed; border-color:${P.crimson};
        color:${P.crimson}; opacity:.8; }
      #ex-telescope .tel-shackle { color:${P.goldDim}; font-size:.9rem; }
      #ex-telescope .tel-shackle.broken { color:${P.crimson}; }
      #ex-telescope .tel-verdict { font-family:var(--mono); font-size:.85rem; min-height:1.3rem;
        color:${P.inkDim}; margin:.2rem 0 .3rem; }
      #ex-telescope .tel-tabs { display:flex; flex-wrap:wrap; gap:.4rem; margin:.5rem 0 .6rem; }
      #ex-telescope .tel-found { border:1px solid ${P.line}; border-radius:6px; background:${P.bg};
        padding:.8rem 1rem; }
      #ex-telescope .tel-found h4 { margin:0 0 .5rem; font-size:.85rem; color:${P.gold};
        font-weight:600; letter-spacing:.04em; }
      #ex-telescope .tel-found pre { font-family:var(--mono); font-size:.84rem; color:${P.ink};
        white-space:pre-wrap; word-break:break-word; margin:0 0 .5rem; overflow-x:auto; }
      #ex-telescope .tel-found .fnote { font-size:.85rem; color:${P.inkDim}; font-style:italic; }
    `;
    stage.appendChild(style);

    /* =================== A · THE INSTRUMENT =================== */

    const hInst = document.createElement('div');
    hInst.className = 'tel-h'; hInst.textContent = 'i · the instrument';
    stage.appendChild(hInst);

    const quest = ui.questBanner(stage, '');
    const lemmaRow = document.createElement('div');
    lemmaRow.className = 'tel-lemmas';
    stage.appendChild(lemmaRow);

    const proofWrap = document.createElement('div');
    proofWrap.className = 'tel-proof';
    stage.appendChild(proofWrap);
    const goalsPane = document.createElement('div');
    goalsPane.className = 'tel-goals';
    proofWrap.appendChild(goalsPane);
    const tacticsPane = document.createElement('div');
    tacticsPane.className = 'tel-tactics';
    proofWrap.appendChild(tacticsPane);

    const msg = document.createElement('div'); msg.className = 'tel-msg'; stage.appendChild(msg);
    const scriptLog = document.createElement('div'); scriptLog.className = 'tel-script'; stage.appendChild(scriptLog);
    const kernelPane = document.createElement('div'); kernelPane.className = 'tel-kernel'; stage.appendChild(kernelPane);
    const termPane = document.createElement('div'); termPane.className = 'tel-term'; stage.appendChild(termPane);

    ui.caption(stage,
      'Every button is a real inference rule; the goal panel is a real sequent. When no goals remain, ' +
      'the kernel — a separate checker that knows nothing of the tactics — re-derives your whole proof ' +
      'before it will say QED. exact, apply and cases want a hypothesis: press the tactic, then click one.');

    // --- state ---
    let lemmaIdx = 0;
    let states = [];        // undo stack of proof states
    let lines = [];         // tactic lines, parallel to states[1..]
    let armed = null;       // 'exact' | 'apply' | 'cases' | null
    let proved = new Set();
    let ceremony = null;    // { queue:[{idx,at}], trace, scheduler } during kernel re-check
    let userSwapScript = null;   // the visitor's own proof of lemma 3, for the stretch

    const lemmaBtns = LEMMAS.map((lem, i) =>
      ui.button(lemmaRow, `${['I','II','III','IV','V','VI'][i]} · ${lem.name}`, () => selectLemma(i), { small: true }));

    const tacticBtns = {};
    const TACTICS = [
      ['intro', 'assume the antecedent'],
      ['exact', 'close the goal with a hypothesis'],
      ['apply', 'reason backwards through an implication'],
      ['split', 'prove both halves of an ∧'],
      ['cases', 'take a hypothesis apart'],
      ['left', 'choose the left side of an ∨'],
      ['right', 'choose the right side of an ∨'],
    ];
    for (const [name, tip] of TACTICS) {
      const b = ui.button(tacticsPane, name, () => onTactic(name), { small: true });
      b.title = tip;
      tacticBtns[name] = b;
    }
    const undoBtn = ui.button(tacticsPane, '↶ undo', undo, { small: true });
    const resetBtn = ui.button(tacticsPane, '⟲ restart', () => selectLemma(lemmaIdx), { small: true });
    undoBtn.title = 'take back the last tactic';
    resetBtn.title = 'start this lemma over';

    const state = () => states[states.length - 1];

    function selectLemma(i) {
      stopCeremony();
      lemmaIdx = i;
      states = [startProof(parseFormula(LEMMAS[i].statement))];
      lines = [];
      disarm();
      kernelPane.classList.remove('show');
      termPane.classList.remove('show');
      proofWrap.classList.remove('tel-locked');
      lemmaBtns.forEach((b, j) => {
        b.classList.toggle('active', j === i);
        b.classList.toggle('proved', proved.has(j));
      });
      setMsg(`${LEMMAS[i].blurb}`, '');
      renderQuest();
      renderProof();
    }

    function renderQuest() {
      const total = LEMMAS.length;
      if (proved.size >= total) {
        quest.done(`all six lemmas proved — the instrument is yours. Below: the proofs nobody will read.`);
      } else {
        quest.set(`lemma ${lemmaIdx + 1} of ${total} · prove <code>${esc(formulaToString(state().formula))}</code>` +
          (proved.size ? ` · ${proved.size} proved` : ''));
      }
    }

    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function setMsg(text, cls) {
      msg.textContent = text;
      msg.className = 'tel-msg' + (cls ? ' ' + cls : '');
    }

    function renderProof() {
      goalsPane.textContent = '';
      const s = state();
      if (s.goals.length === 0) {
        const d = document.createElement('div');
        d.className = 'tel-goal current';
        d.innerHTML = `<div class="tel-turnstile"><span class="tstile">⊢</span>no goals remain</div>`;
        goalsPane.appendChild(d);
      }
      s.goals.forEach((g, gi) => {
        const d = document.createElement('div');
        d.className = 'tel-goal' + (gi === 0 ? ' current' : ' waiting');
        if (gi === 0) {
          for (const [nm, f] of g.hyps) {
            const h = document.createElement('div');
            h.className = 'tel-hyp';
            h.dataset.name = nm;
            h.innerHTML = `<b>${esc(nm)}</b> : ${esc(formulaToString(f))}`;
            h.addEventListener('click', () => { if (armed) fireArmed(nm); });
            d.appendChild(h);
          }
          const t = document.createElement('div');
          t.className = 'tel-turnstile';
          t.innerHTML = `<span class="tstile">⊢</span>${esc(formulaToString(g.target))}`;
          d.appendChild(t);
        } else {
          d.innerHTML = `<span class="tstile" style="color:${P.goldDim}">⊢</span> ${esc(formulaToString(g.target))} <span style="color:${P.inkFaint}">(waits)</span>`;
        }
        goalsPane.appendChild(d);
      });
      scriptLog.innerHTML = lines.length
        ? 'script · ' + lines.map((l) => `<b>${esc(l)}</b>`).join(' ; ')
        : '';
    }

    function tick(freq, level = 0.22, dur = 0.06, type = 'sine', when = null) {
      const actx = audio.getContext();
      audio.playTone(bus, { freq, dur, level, type, when: when ?? (actx ? actx.currentTime : 0) });
    }

    function onTactic(name) {
      audio.ensureAudio();
      if (ceremony) return;
      if (armed === name) { disarm(); return; }
      if (name === 'exact' || name === 'apply' || name === 'cases') {
        if (state().goals.length === 0) { setMsg('the proof is already complete', 'err'); return; }
        if (state().goals[0].hyps.length === 0) {
          setMsg(`${name}: the context is empty — introduce a hypothesis first`, 'err');
          errorBuzz();
          return;
        }
        armed = name;
        Object.values(tacticBtns).forEach((b) => b.classList.remove('armed'));
        tacticBtns[name].classList.add('armed');
        stage.closest('#ex-telescope')?.classList.add('tel-armed');
        setMsg(`${name} — now click a hypothesis (press ${name} again to cancel)`, '');
        tick(520, 0.15, 0.04);
        return;
      }
      runLine(name);
    }

    function disarm() {
      armed = null;
      Object.values(tacticBtns).forEach((b) => b.classList.remove('armed'));
      stage.closest('#ex-telescope')?.classList.remove('tel-armed');
    }

    function fireArmed(hypName) {
      const t = armed;
      disarm();
      runLine(`${t} ${hypName}`);
    }

    function errorBuzz() {
      audio.ensureAudio();
      tick(92, 0.16, 0.22, 'sawtooth');
    }

    function runLine(line) {
      audio.ensureAudio();
      try {
        const next = applyTactic(state(), line);
        states.push(next);
        lines.push(line);
        const depth = Math.min(lines.length, 10);
        tick(420 + depth * 36, 0.2, 0.05, 'triangle');
        setMsg(next.goals.length === 0
          ? 'no goals remain — handing the term to the kernel…'
          : next.goals.length > 1
            ? `${next.goals.length} goals open — the first is yours`
            : 'one goal open', '');
        renderProof();
        if (next.done) beginCeremony();
      } catch (e) {
        if (!(e instanceof TacticError)) throw e;
        setMsg(e.message, 'err');
        errorBuzz();
      }
    }

    function undo() {
      if (ceremony) stopCeremony();
      disarm();
      kernelPane.classList.remove('show');
      termPane.classList.remove('show');
      proofWrap.classList.remove('tel-locked');
      if (states.length <= 1) { setMsg('nothing to undo', ''); return; }
      states.pop(); lines.pop();
      setMsg('', '');
      renderProof();
    }

    /* ---- the QED ceremony: the kernel visibly re-checks the term ---- */

    function beginCeremony() {
      const s = state();
      let trace;
      try {
        trace = checkTerm(s.term, [], s.formula);
      } catch (e) {
        // Should be unreachable for tactic-built terms; surface honestly if not.
        setMsg('KERNEL REFUSED: ' + e.message, 'err');
        return;
      }
      proofWrap.classList.add('tel-locked');
      kernelPane.classList.add('show');
      kernelPane.innerHTML = `<div class="kline" style="color:${P.gold}">kernel: re-checking the finished term against ${esc(formulaToString(s.formula))} …</div>`;
      const queue = [];
      const STEP = 0.14;
      const scheduler = audio.createScheduler((t) => {
        const i = queue.length;
        if (i >= trace.length) return null;
        const isQed = trace[i].rule === 'QED';
        if (isQed) {
          // a small resolving chime
          audio.playTone(bus, { freq: 523.25, dur: 0.32, level: 0.28, when: t });
          audio.playTone(bus, { freq: 659.25, dur: 0.32, level: 0.24, when: t + 0.09 });
          audio.playTone(bus, { freq: 783.99, dur: 0.45, level: 0.22, when: t + 0.18 });
        } else {
          audio.playTone(bus, { freq: 620 + trace[i].depth * 60, dur: 0.05, level: 0.16, type: 'triangle', when: t });
        }
        queue.push({ idx: i, at: t });
        return t + (isQed ? STEP * 3 : STEP);
      });
      ceremony = { queue, trace, scheduler, shown: 0 };
      scheduler.start();
    }

    function appendKernelLine(ln) {
      const div = document.createElement('div');
      div.className = 'kline' + (ln.rule === 'QED' ? ' qed' : '');
      div.innerHTML = `${'  '.repeat(ln.depth)}<span class="rule">${esc(ln.rule)}</span>  ${esc(ln.detail)}`;
      kernelPane.appendChild(div);
    }

    function revealCeremony() {
      if (!ceremony) return;
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : Infinity;
      while (ceremony && ceremony.shown < ceremony.queue.length && ceremony.queue[ceremony.shown].at <= now) {
        const { idx } = ceremony.queue[ceremony.shown++];
        const ln = ceremony.trace[idx];
        appendKernelLine(ln);
        if (ln.rule === 'QED') {
          ceremony.scheduler.stop();
          ceremony = null;
          finishProof();
        }
      }
    }

    // The kernel already accepted; record the theorem and show the program.
    function finishProof() {
      const s = state();
      proved.add(lemmaIdx);
      if (lemmaIdx === 2) userSwapScript = lines.slice();
      lemmaBtns[lemmaIdx].classList.add('proved');
      proofWrap.classList.remove('tel-locked');
      setMsg(`QED — the kernel accepts. Lemma ${lemmaIdx + 1} is a theorem.`, 'good');
      termPane.classList.add('show');
      termPane.innerHTML =
        `<div class="tt-code">${esc(termToString(s.term))} : ${esc(formulaToString(s.formula))}</div>` +
        `<div class="tt-note">Here is your proof as a program — every intro became a λ, every apply a function
         call, every split a pair, every cases a match. You did not write it; you could not have avoided
         writing it. (Curry–Howard, in your own hand.)</div>`;
      renderQuest();
      renderFoundationND();
      if (proved.size < LEMMAS.length) {
        const next = LEMMAS.findIndex((_, j) => !proved.has(j));
        if (next >= 0) setMsg(`QED — the kernel accepts. Next: lemma ${next + 1}, ${LEMMAS[next].name}.`, 'good');
      }
    }

    // Abandon the staged reveal. If the proof is finished (the kernel accepted
    // before the ceremony began), still credit it — silently and instantly.
    function stopCeremony() {
      if (!ceremony) return;
      const c = ceremony;
      ceremony = null;
      c.scheduler.stop();
      proofWrap.classList.remove('tel-locked');
      if (state() && state().done) {
        for (let i = c.shown; i < c.trace.length; i++) appendKernelLine(c.trace[i]);
        finishProof();
      }
    }

    /* =================== B · THE UNREADABLE LIBRARY =================== */

    const hLib = document.createElement('div');
    hLib.className = 'tel-h'; hLib.textContent = 'ii · the unreadable library';
    stage.appendChild(hLib);

    const libControls = ui.controlRow(stage);
    ui.select(libControls, {
      label: 'certificate',
      options: CERTS.map((c) => ({ value: c.id, label: c.label })),
      value: 'bpt',
      onChange: (v) => { setCert(v); },
    });

    const handle = cv.setupCanvas(stage, { height: 150 });
    handle.canvas.style.touchAction = 'pan-y';
    const libScale = document.createElement('div');
    libScale.className = 'tel-scale';
    stage.appendChild(libScale);
    const libInfo = ui.readout(stage, '');
    ui.caption(stage,
      'A scrollbar built to true scale: the track is the whole certificate; the thumb is one 3-kilobyte ' +
      'page. Drag the track to scrub; use the mouse wheel over it to turn one page at a time. ' +
      'The counters compute live and do not exaggerate.');

    let cert = CERTS[0];
    let libStats = readingStats(cert.bytes);
    let page = 0;             // current page index (float; huge)
    let pagesTurned = 0;
    let libDirty = true;
    let lastWheelTick = 0;

    function setCert(id) {
      cert = CERTS.find((c) => c.id === id) || CERTS[0];
      libStats = readingStats(cert.bytes);
      page = Math.min(page, libStats.pages - 1);
      libDirty = true;
      const thumbFrac = 3000 / cert.bytes;   // one page as a fraction of the track
      libScale.innerHTML =
        `<div class="ts-thm">${esc(cert.line)}</div>` +
        `<div>· the thumb — one 3 KB page at true scale — is <b>${(thumbFrac * 100).toExponential(1)}%</b>` +
        ` of the track: on this screen, about ${(thumbFrac * (handle.width - 52)).toExponential(1)} px.` +
        ' It does not survive rounding.</div>' +
        `<div>· a track giving each page one whole pixel would run <b>${math.formatBig(Math.round(libStats.trackKm))} km</b> — ` +
        (cert.id === 'bpt' ? 'nearly halfway around the planet.' : 'nearly half the distance to the Moon.') + '</div>' +
        `<div>· ${math.formatBig(Math.round(libStats.pages))} pages ≈ <b>${fmtYears(libStats.years)} years</b>` +
        ' at a page a minute, twelve hours a day.</div>';
      updateLibInfo();
    }

    function fmtYears(y) {
      return math.formatBig(Math.round(y));
    }

    function updateLibInfo() {
      const pct = (page / libStats.pages) * 100;
      const yearsLeft = (libStats.pages - page) / libStats.pagesPerDay / 365.25;
      libInfo.set(
        `page ${math.formatBig(Math.floor(page) + 1)} of ${math.formatBig(Math.round(libStats.pages))}` +
        ` · position ${pct.toFixed(9)}%` +
        ` · at a page a minute, twelve hours a day: ${fmtYears(yearsLeft)} years of reading remain` +
        ` · pages you actually turned: ${math.formatBig(pagesTurned)}`);
    }

    function drawLibrary() {
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      const x0 = 26, x1 = W - 26, tw = Math.max(40, x1 - x0);
      const ty = 40, th = 22;

      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillStyle = P.inkFaint;
      ctx.textAlign = 'left';
      ctx.fillText('byte 0', x0, ty - 10);
      ctx.textAlign = 'right';
      ctx.fillText(`${math.formatBig(cert.bytes)} bytes`, x1, ty - 10);

      // the track
      ctx.fillStyle = P.panel;
      ctx.strokeStyle = P.line;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, ty, tw, th, 6);
      else ctx.rect(x0, ty, tw, th);
      ctx.fill(); ctx.stroke();

      // the position marker (a 1-pixel line — already ~10⁸ pages wide)
      const px = x0 + (page / libStats.pages) * tw;
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, ty - 4); ctx.lineTo(px + 0.5, ty + th + 4);
      ctx.stroke();
      ctx.fillStyle = P.goldBright;
      ctx.textAlign = px < W / 2 ? 'left' : 'right';
      ctx.fillText('you are here', px + (px < W / 2 ? 5 : -5), ty + th + 16);
      ctx.fillStyle = P.inkFaint;
      ctx.textAlign = 'left';
      ctx.fillText(`the marker line above spans ~${math.formatBig(Math.round(libStats.pages / tw))} pages by itself`,
        x0, ty + th + 34);

      // a magnified page glyph, honestly labeled as a magnification
      const gx = x1 - 34, gy = ty + th + 24;
      if (W > 520 && gy + 60 < H + 20) {
        ctx.strokeStyle = P.goldDim;
        ctx.strokeRect(gx, gy, 24, 32);
        ctx.strokeStyle = P.line;
        for (let i = 1; i <= 5; i++) {
          ctx.beginPath();
          ctx.moveTo(gx + 4, gy + i * 5); ctx.lineTo(gx + 20, gy + i * 5);
          ctx.stroke();
        }
        const mag = 24 / (tw * (3000 / cert.bytes));
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'center';
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillText('one page,', gx + 12, gy + 44);
        ctx.fillText(`×${mag.toExponential(0)}`, gx + 12, gy + 56);
      }
    }

    // interactions: drag to scrub, wheel to turn single pages
    let libDragging = false, libLastX = 0;
    handle.canvas.addEventListener('pointerdown', (e) => {
      libDragging = true; libLastX = e.clientX;
      handle.canvas.setPointerCapture(e.pointerId);
    });
    handle.canvas.addEventListener('pointermove', (e) => {
      if (!libDragging) return;
      const dx = e.clientX - libLastX; libLastX = e.clientX;
      const tw = handle.width - 52;
      page = Math.max(0, Math.min(libStats.pages - 1, page + (dx / tw) * libStats.pages));
      libDirty = true;
      updateLibInfo();
    });
    const libUp = (e) => {
      if (!libDragging) return;
      libDragging = false;
      try { handle.canvas.releasePointerCapture(e.pointerId); } catch {}
      audio.ensureAudio();
      const actx = audio.getContext();
      if (actx) audio.drums.thock(bus, actx.currentTime, { level: 0.3 });
    };
    handle.canvas.addEventListener('pointerup', libUp);
    handle.canvas.addEventListener('pointercancel', libUp);
    handle.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      page = Math.max(0, Math.min(libStats.pages - 1, page + dir));
      pagesTurned++;
      libDirty = true;
      updateLibInfo();
      const now = performance.now();
      if (now - lastWheelTick > 70) {
        lastWheelTick = now;
        audio.ensureAudio();
        const actx = audio.getContext();
        if (actx) audio.drums.wood(bus, actx.currentTime, { level: 0.3, pitch: dir > 0 ? 980 : 780 });
      }
    }, { passive: false });
    handle.onResize(() => setCert(cert.id));
    setCert('bpt');

    /* =================== C · THE TRUST LADDER =================== */

    const hTrust = document.createElement('div');
    hTrust.className = 'tel-h'; hTrust.textContent = 'iii · the trust ladder';
    stage.appendChild(hTrust);

    const trustControls = ui.controlRow(stage);
    ui.select(trustControls, {
      label: 'landmark',
      options: TRUST_CHAINS.map((c) => ({ value: c.id, label: c.label })),
      value: TRUST_CHAINS[0].id,
      onChange: (v) => renderChain(v),
    });
    const chainEl = document.createElement('div');
    chainEl.className = 'tel-chain';
    stage.appendChild(chainEl);
    const verdictEl = document.createElement('div');
    verdictEl.className = 'tel-verdict';
    stage.appendChild(verdictEl);
    ui.caption(stage,
      'Click any link to doubt it — the whole theorem hangs from every link you must trust. The journal ' +
      'routes ask you to trust people you have never met reading pages you never will; the machine routes ' +
      'ask for a kernel, a compiler, and physics. The machine-checked chain is shorter.');

    let currentChain = TRUST_CHAINS[0];
    let doubted = new Set();

    function renderChain(id) {
      currentChain = TRUST_CHAINS.find((c) => c.id === id) || TRUST_CHAINS[0];
      doubted = new Set();
      chainEl.textContent = '';
      currentChain.links.forEach(([label], i) => {
        if (i > 0) {
          const sh = document.createElement('span');
          sh.className = 'tel-shackle';
          sh.textContent = '—∞—';
          chainEl.appendChild(sh);
        }
        const link = document.createElement('span');
        link.className = 'tel-link';
        link.textContent = label;
        link.addEventListener('click', () => {
          audio.ensureAudio();
          if (doubted.has(i)) doubted.delete(i); else doubted.add(i);
          link.classList.toggle('doubted', doubted.has(i));
          const shackles = chainEl.querySelectorAll('.tel-shackle');
          shackles.forEach((s, si) => {
            s.classList.toggle('broken', doubted.has(si) || doubted.has(si + 1));
          });
          const actx = audio.getContext();
          if (actx) {
            if (doubted.has(i)) audio.playTone(bus, { freq: 130, dur: 0.2, level: 0.2, type: 'sawtooth', when: actx.currentTime });
            else audio.drums.rim(bus, actx.currentTime, { level: 0.35 });
          }
          updateVerdict();
        });
        chainEl.appendChild(link);
      });
      updateVerdict();
    }

    function updateVerdict() {
      const n = currentChain.links.length;
      if (doubted.size === 0) {
        verdictEl.textContent = `${n} links of trust — the theorem stands.`;
        verdictEl.style.color = '';
      } else {
        const names = [...doubted].sort((a, b) => a - b).map((i) => `"${currentChain.links[i][0]}"`).join(', ');
        verdictEl.textContent = `you doubt ${names} — everything downstream hangs from ${doubted.size === 1 ? 'that link' : 'those links'}.`;
        verdictEl.style.color = P.crimson;
      }
    }
    renderChain(TRUST_CHAINS[0].id);

    /* =================== D · ONE STATEMENT, FOUR FOUNDATIONS =================== */

    const hFound = document.createElement('div');
    hFound.className = 'tel-h'; hFound.textContent = 'iv · one statement, four foundations';
    stage.appendChild(hFound);

    const tabRow = document.createElement('div');
    tabRow.className = 'tel-tabs';
    stage.appendChild(tabRow);
    const foundEl = document.createElement('div');
    foundEl.className = 'tel-found';
    stage.appendChild(foundEl);
    ui.caption(stage,
      'The swap lemma you proved above, spoken in four languages. In homotopy type theory the same ' +
      'equivalence becomes, by the univalence axiom, a literal equality of types — Voevodsky\'s answer ' +
      'to the question of what proof should rest on. Whether it is the answer is a live argument, ' +
      'flagged below where it belongs.');

    let foundTabs = [];
    function renderFoundationND() {
      const f = FOUNDATIONS[0];
      const scr = (userSwapScript && userSwapScript.length ? userSwapScript : LEMMAS[2].script);
      const r = runScript(LEMMAS[2].statement, scr.length ? scr : LEMMAS[2].script);
      const body = (r.ok)
        ? `⊢ A ∧ B → B ∧ A\n\n${scr.join('\n')}\n\n— kernel accepts:\n${r.termString}`
        : `⊢ A ∧ B → B ∧ A\n\n${LEMMAS[2].script.join('\n')}`;
      f.body = body;
      f.note = userSwapScript
        ? 'This is your own proof from the instrument, kernel-checked again just now.'
        : 'Prove lemma III above and this panel will show your proof instead of ours.';
      if (foundTabs.length && foundEl.dataset.tab === 'nd') showFoundation('nd');
    }
    function showFoundation(id) {
      const f = FOUNDATIONS.find((x) => x.id === id) || FOUNDATIONS[0];
      foundEl.dataset.tab = f.id;
      foundTabs.forEach((b, i) => b.classList.toggle('active', FOUNDATIONS[i].id === f.id));
      foundEl.textContent = '';
      const h4 = document.createElement('h4'); h4.textContent = f.title; foundEl.appendChild(h4);
      const pre = document.createElement('pre'); pre.textContent = f.body || ''; foundEl.appendChild(pre);
      if (f.note) {
        const nt = document.createElement('div'); nt.className = 'fnote'; nt.textContent = f.note;
        foundEl.appendChild(nt);
      }
    }
    foundTabs = FOUNDATIONS.map((f) =>
      ui.button(tabRow, f.tab, () => { audio.ensureAudio(); tick(600, 0.12, 0.04); showFoundation(f.id); }, { small: true }));
    renderFoundationND();
    showFoundation('nd');

    /* =================== E · LABELED SPECULATION =================== */

    ui.speculationPanel(stage, `
      <p><strong>The oracle problem.</strong> Nothing in the definition of "theorem" requires a
      narrative. The 200-terabyte certificates are fully verified and fully opaque, and as
      machine-generated mathematics grows, verified truth may outrun human understanding
      permanently. Is a theorem <em>known</em> if no one can say why it is true? The kernel
      says yes; the essay tradition this site belongs to says no; both cannot keep winning.</p>
      <p><strong>The composer.</strong> A mathematician who states the theorem, shapes the
      abstractions, and lets machines execute the passage-work is doing what composers have
      always done with orchestras — Movement II's harmony, one level up. On this scenario the
      profession does not shrink; it changes instruments.</p>
      <p><strong>Voevodsky's answer.</strong> After errors in his own celebrated work went
      unnoticed for years, Vladimir Voevodsky concluded that human refereeing could not be the
      foundation, and built univalent foundations: mathematics in which equality is a path and
      isomorphic structures are literally identical. The formal systems exist and run today.
      The further claim — that this will <em>replace</em> set theory as the ground floor of
      mathematics — is open advocacy, not fact, and mathematicians of equal rank stand on
      both sides of it.</p>
    `, 'three futures, offered as scenarios — not predictions');

    ui.caption(stage,
      'Walls no theory can cross, tunnels no one dug, and now instruments that outsee their makers. ' +
      'One question remains, and it is the one you were asked before any of this began. It is waiting below.');

    /* ---------- the loop: ceremony reveal + library redraw ---------- */

    const loop = cv.rafLoop(() => {
      if (ceremony) revealCeremony();
      if (libDirty) { libDirty = false; drawLibrary(); }
    });
    loop.start();
    selectLemma(0);

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        stopCeremony();
        bus.mute();
      },
      resume() {
        bus.unmute();
        libDirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopCeremony();
        bus.dispose();
        handle.destroy();
        style.remove();
      },
    };
  },
};

/* ======================================================================
   node-testable exports
   ====================================================================== */

export const _test = {
  parseFormula, formulaToString, formulaEq,
  startProof, applyTactic, runScript,
  checkTerm, inferTerm, termToString,
  KernelError, TacticError,
  LEMMAS, BAD_SCRIPT, readingStats, selfTest,
};
