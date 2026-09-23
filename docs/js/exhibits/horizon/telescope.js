// III.5 — The Telescope
// A genuine miniature proof assistant (intuitionistic propositional natural
// deduction with a small independent kernel) whose proof grows on the page as
// a Gentzen tree; a seventh lemma it cannot prove, with the Kripke countermodel
// that says why; the unreadable library (a scrollbar built to true scale,
// magnified by powers of a thousand); the trust ladder, journal route against
// machine route; and one statement in four foundations.
//
// Facts (verified September 2026; sources in the module's `sources` and in the
// comments beside each claim): Gentzen 1935; Curry 1934 / Howard 1969, printed
// 1980 (Wadler, CACM 2015); Milner's LCF tactics and ML (Gordon, "From LCF to
// HOL"); Appel–Haken 1976, 1,200 hours (MacTutor), "a billion cases" and the
// 30 + 200 trusted lines (Gonthier 2005); Kepler: Hales & Ferguson 1998, twelve
// referees, "99% certain" (2003), Flyspeck completed August 2014 in HOL Light
// and Isabelle (Hales et al., Forum Math. Pi 2017); LTE (Scholze, 5 Dec 2020;
// completed 14 Jul 2022); PFR/Marton in characteristic 2, Nov–Dec 2023 (Tao);
// ETP: 22,028,942 implications, 14 Apr 2025; Boolean Pythagorean triples,
// ~200 TB, F7825 = 6,494 variables / 18,944 clauses (Heule–Kullmann–Marek
// 2016); Schur five, 2 PB, ACL2-verified checker (Heule 2017); AlphaProof and
// AlphaGeometry 2, 28/42 at IMO 2024 (Nature, Nov 2025); Mathlib 2,465,428
// lines (22 Sep 2026); Lean 4 kernel 323,640 bytes / ~7,540 lines of C++;
// Jacobian counterexample in three variables (Jul 2026, formal-conjectures
// PR #4474); FLT in Lean, ~13 million lines in 11 days (Anthropic, 4 Sep 2026;
// Buzzard, Xena, same day). Speculation is labeled on the page.
//
// No top-level DOM/window/Audio access: the first half of this file is pure
// logic, importable (and tested) under node.

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
   var | lam | app | pair | inl | inr | case | unpair | hole
   Nodes built by a tactic carry `by`: the index of the script line that made
   them (the exhibit uses it to link each line to its piece of the program;
   the kernel ignores it).                                                 */

function termReplaceHole(t, id, node) {
  // Structural replacement; nodes are never mutated, so sharing is safe
  // (this is what makes undo a matter of keeping the old state object).
  // Spreads keep the provenance tag `by` on rebuilt nodes.
  switch (t.k) {
    case 'hole': return t.id === id ? node : t;
    case 'var': return t;
    case 'lam': { const b = termReplaceHole(t.body, id, node); return b === t.body ? t : { ...t, body: b }; }
    case 'app': {
      const f = termReplaceHole(t.f, id, node), a = termReplaceHole(t.arg, id, node);
      return f === t.f && a === t.arg ? t : { ...t, f, arg: a };
    }
    case 'pair': {
      const a = termReplaceHole(t.a, id, node), b = termReplaceHole(t.b, id, node);
      return a === t.a && b === t.b ? t : { ...t, a, b };
    }
    case 'inl': { const b = termReplaceHole(t.body, id, node); return b === t.body ? t : { ...t, body: b }; }
    case 'inr': { const b = termReplaceHole(t.body, id, node); return b === t.body ? t : { ...t, body: b }; }
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

const escHTML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The same program as termToString, marked up for the page: every subterm is a
// span tagged with the script line that built it (data-by), and each
// constructor is coloured by the tactic that produced it (class ck-<tactic>).
export function termToHTML(t, prec = 0) {
  const box = (s) => (t.by != null && t.by >= 0 ? `<span class="chs" data-by="${t.by}">${s}</span>` : s);
  const k = (tac, s) => `<b class="ck ck-${tac}">${s}</b>`;
  const paren = (cond, s) => (cond ? `(${s})` : s);
  switch (t.k) {
    case 'var': return box(k('exact', escHTML(t.name)));
    case 'hole': return `<span class="ck-hole">?${t.id}</span>`;
    case 'lam': return box(paren(prec > 0, `${k('intro', `λ${escHTML(t.v)}.`)} ${termToHTML(t.body, 0)}`));
    case 'app': return box(paren(prec === 2, `${termToHTML(t.f, 1)} ${termToHTML(t.arg, 2)}`));
    case 'pair': return box(`${k('split', '⟨')}${termToHTML(t.a, 0)}${k('split', ',')} ${termToHTML(t.b, 0)}${k('split', '⟩')}`);
    case 'inl': return box(paren(prec >= 1, `${k('lr', 'inl')} ${termToHTML(t.body, 2)}`));
    case 'inr': return box(paren(prec >= 1, `${k('lr', 'inr')} ${termToHTML(t.body, 2)}`));
    case 'case':
      return box(paren(prec > 0,
        `${k('cases', 'match')} ${termToHTML(t.scrut, 1)} ${k('cases', 'with')} inl ${escHTML(t.lv)} ⇒ ` +
        `${termToHTML(t.lbody, 0)} | inr ${escHTML(t.rv)} ⇒ ${termToHTML(t.rbody, 0)}`));
    case 'unpair':
      return box(paren(prec > 0,
        `${k('cases', 'let')} ⟨${escHTML(t.av)}, ${escHTML(t.bv)}⟩ := ${termToHTML(t.scrut, 1)} ${k('cases', 'in')} ` +
        `${termToHTML(t.body, 0)}`));
    default: return '⁇';
  }
}

/* ---------- the kernel proper: a bidirectional type checker ----------
   This is the de Bruijn criterion in miniature: it is independent of the
   tactic machinery above it and re-derives every judgment from scratch.
   ctx: array of [name, formula]; lookup from the end (shadowing).
   Note: for case and unpair the kernel keeps the destructed hypothesis in
   context, while the tactic layer removes it from view. The kernel is thus
   the more permissive of the two there, which cannot make it unsound.    */

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
// rule applications (for the visible re-check); throws KernelError on failure,
// with the partial trace attached as error.trace (the page replays it).
export function checkTerm(term, ctx, formula) {
  const trace = [];
  try {
    checkAgainst(term, formula, ctx, trace, 0);
  } catch (e) {
    if (e instanceof KernelError) e.trace = trace;
    throw e;
  }
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
    step: 0,
    done: false,
  };
}

const AUTO_NAMES = 'abcdefghijklmnopqrstuvwxyz';
const NAME_RE = /^[A-Za-z][A-Za-z0-9_']*$/;
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
// Search from the end, as the kernel's ctxLookup does, so that the two layers
// can never resolve a name differently.
function findHyp(goal, name, tactic) {
  for (let i = goal.hyps.length - 1; i >= 0; i--) if (goal.hyps[i][0] === name) return goal.hyps[i][1];
  const have = goal.hyps.length ? goal.hyps.map(([n]) => n).join(', ') : 'nothing';
  throw new TacticError(`${tactic}: no hypothesis named "${name}" — the context holds ${have}`);
}
function checkNewName(tactic, name, taken) {
  if (!NAME_RE.test(name)) throw new TacticError(`${tactic}: "${name}" is not a usable name — use letters and digits`);
  if (taken.some(([n]) => n === name)) throw new TacticError(`${tactic}: the name "${name}" is already in use`);
}

// Apply one tactic line ('intro a' | 'exact h' | 'apply h' | 'split' |
// 'cases h a b' | 'left' | 'right') to the FIRST open goal. Pure: returns a
// new state, throws TacticError on an illegal move.
// opts.careless: `exact` skips its type check. This deliberately broken engine
// exists to show that the kernel does not trust the tactics.
export function applyTactic(state, line, opts = {}) {
  if (state.done || state.goals.length === 0) {
    throw new TacticError('the proof is already complete — no goals remain');
  }
  const words = line.trim().split(/\s+/).filter(Boolean);
  const [tac, ...args] = words;
  if (!tac) throw new TacticError('an empty line — name a tactic: intro, exact, apply, split, cases, left, right');
  const goal = state.goals[0];
  const rest = state.goals.slice(1);
  const by = state.step || 0;
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
      if (args[0]) { checkNewName('intro', args[0], goal.hyps); name = args[0]; }
      else name = suggestName(goal.hyps, goal.target.a);
      const h = hole();
      node = { k: 'lam', v: name, body: h, by };
      newGoals = [{ id: h.id, hyps: [...goal.hyps, [name, goal.target.a]], target: goal.target.b }];
      break;
    }
    case 'exact': {
      if (!args[0]) throw new TacticError('exact: which hypothesis? (exact <name>)');
      const f = findHyp(goal, args[0], 'exact');
      if (!opts.careless && !formulaEq(f, goal.target)) {
        throw new TacticError(`exact: ${args[0]} : ${formulaToString(f)} does not match the goal ${formulaToString(goal.target)}`);
      }
      node = { k: 'var', name: args[0], by };
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
      node = { k: 'var', name: args[0], by };
      for (const w of wanted) {
        const h = hole();
        node = { k: 'app', f: node, arg: h, by };
        newGoals.push({ id: h.id, hyps: goal.hyps, target: w });
      }
      break;
    }
    case 'split': {
      if (goal.target.k !== 'and') {
        throw new TacticError(`split: the goal ${formulaToString(goal.target)} is not a conjunction — there are no two halves to split into`);
      }
      const h1 = hole(), h2 = hole();
      node = { k: 'pair', a: h1, b: h2, by };
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
      node = { k: tac === 'left' ? 'inl' : 'inr', body: h, by };
      newGoals = [{ id: h.id, hyps: goal.hyps, target: tac === 'left' ? goal.target.a : goal.target.b }];
      break;
    }
    case 'cases': {
      if (!args[0]) throw new TacticError('cases: which hypothesis? (cases <name>)');
      const f = findHyp(goal, args[0], 'cases');
      let at = -1;
      for (let i = goal.hyps.length - 1; i >= 0; i--) if (goal.hyps[i][0] === args[0]) { at = i; break; }
      const without = goal.hyps.filter((_, i) => i !== at);
      if (f.k === 'or') {
        // The two branches are separate worlds, so ln and rn may coincide;
        // neither may shadow a hypothesis that stays in view.
        if (args[1]) checkNewName('cases', args[1], without);
        if (args[2]) checkNewName('cases', args[2], without);
        const ln = args[1] || suggestName(without, f.a);
        const rn = args[2] || suggestName(without, f.b);
        const h1 = hole(), h2 = hole();
        node = { k: 'case', scrut: { k: 'var', name: args[0], by }, lv: ln, lbody: h1, rv: rn, rbody: h2, by };
        const ins = (nm, ff) => { const hs = [...without]; hs.splice(at, 0, [nm, ff]); return hs; };
        newGoals = [
          { id: h1.id, hyps: ins(ln, f.a), target: goal.target },
          { id: h2.id, hyps: ins(rn, f.b), target: goal.target },
        ];
      } else if (f.k === 'and') {
        if (args[1]) checkNewName('cases', args[1], without);
        const an = args[1] || suggestName(without, f.a);
        const hs1 = [...without]; hs1.splice(at, 0, [an, f.a]);
        if (args[2]) checkNewName('cases', args[2], hs1);
        const bn = args[2] || suggestName(hs1, f.b);
        const h = hole();
        node = { k: 'unpair', scrut: { k: 'var', name: args[0], by }, av: an, bv: bn, body: h, by };
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
  return { formula: state.formula, goals, term, nextId, step: by + 1, done: goals.length === 0 };
}

// Run a whole script against a statement. Never throws for a bad script:
// returns { ok:false, error, step } instead. On success, re-checks the
// finished term with the kernel and returns its trace.
export function runScript(statementSrc, lines, opts = {}) {
  let step = -1;
  try {
    const formula = parseFormula(statementSrc);
    let state = startProof(formula);
    for (step = 0; step < lines.length; step++) {
      state = applyTactic(state, lines[step], opts);
    }
    if (state.goals.length > 0) {
      return { ok: false, error: `${state.goals.length} goal(s) remain unproved`, step: lines.length };
    }
    const trace = checkTerm(state.term, [], formula);   // the kernel re-check
    return { ok: true, state, term: state.term, termString: termToString(state.term), kernelOk: true, trace };
  } catch (e) {
    if (e && e.clean) return { ok: false, error: e.message, step: Math.max(step, 0), kernel: e instanceof KernelError };
    throw e;   // a genuine bug should surface, not be swallowed
  }
}

// The line as a proof assistant would record it, with the names the tactic
// chose: a bare 'intro' becomes 'intro h', 'cases h' becomes 'cases h a b'.
export function canonicalLine(term, by, line) {
  let found = null;
  (function walk(t) {
    if (found || !t || typeof t !== 'object' || !t.k) return;
    if (t.by === by && (t.k === 'lam' || t.k === 'case' || t.k === 'unpair')) { found = t; return; }
    for (const c of [t.body, t.f, t.arg, t.a, t.b, t.scrut, t.lbody, t.rbody]) walk(c);
  })(term);
  if (found && found.k === 'lam') return `intro ${found.v}`;
  if (found && found.k === 'case') return `cases ${found.scrut.name} ${found.lv} ${found.rv}`;
  if (found && found.k === 'unpair') return `cases ${found.scrut.name} ${found.av} ${found.bv}`;
  return line.trim().split(/\s+/).join(' ');
}

// A statement of the visitor's own, within the instrument's means: at most
// four atoms and twelve connectives. Returns { formula, table } or throws.
export function ownStatement(src) {
  const f = parseFormula(src);
  const count = (g) => (g.k === 'atom' ? 0 : 1 + count(g.a) + count(g.b));
  if (atomsOf(f).length > 4) throw new ParseError('keep it to four letters or fewer');
  if (count(f) > 12) throw new ParseError('keep it to twelve connectives or fewer');
  return { formula: f, table: truthTable(f) };
}

/* ---------- the proof as Gentzen would draw it ----------
   A natural-deduction tree for a (possibly unfinished) proof term. The walk
   mirrors checkAgainst exactly, so node.traceIdx names the kernel trace line
   that certifies the node: the page relights the tree in step with the kernel.
   Rules: →I (λ), →E (application), ∧I (pair), ∧E (let), ∨I₁/∨I₂ (inl/inr),
   ∨E (match); leaves are assumptions [A]ᵃ, discharged by the rule tagged a. */

export function proofTree(term, formula) {
  let k = 0;
  const node = (o) => ({ rule: null, tag: '', concl: null, kids: [], traceIdx: 0, by: -1, hyp: null, hole: null, bad: false, ...o });
  const look = (ctx, n) => { for (let i = ctx.length - 1; i >= 0; i--) if (ctx[i][0] === n) return ctx[i][1]; return null; };
  function infer(t, ctx, idx) {                       // inferred positions (never traced separately)
    if (t.k === 'var') {
      const f = look(ctx, t.name);
      return node({ hyp: t.name, concl: f, traceIdx: idx, by: t.by ?? -1, bad: !f });
    }
    if (t.k === 'app') {
      const f = infer(t.f, ctx, idx);
      if (!f.concl || f.concl.k !== 'imp') return node({ rule: '→E', kids: [f], traceIdx: idx, by: t.by ?? -1, bad: true });
      const a = check(t.arg, f.concl.a, ctx, idx);
      return node({ rule: '→E', concl: f.concl.b, kids: [f, a], traceIdx: idx, by: t.by ?? -1 });
    }
    return node({ concl: null, traceIdx: idx, bad: true });
  }
  function check(t, ty, ctx, silent) {
    const next = () => (silent != null ? silent : k++);
    const by = t.by ?? -1;
    switch (t.k) {
      case 'hole': return node({ hole: t.id, concl: ty, traceIdx: silent != null ? silent : k });
      case 'lam': {
        const i = next();
        if (!ty || ty.k !== 'imp') return node({ rule: '→I', tag: t.v, concl: ty, traceIdx: i, by, bad: true });
        return node({ rule: '→I', tag: t.v, concl: ty, traceIdx: i, by, kids: [check(t.body, ty.b, [...ctx, [t.v, ty.a]], silent)] });
      }
      case 'pair': {
        const i = next();
        if (!ty || ty.k !== 'and') return node({ rule: '∧I', concl: ty, traceIdx: i, by, bad: true });
        const a = check(t.a, ty.a, ctx, silent);
        return node({ rule: '∧I', concl: ty, traceIdx: i, by, kids: [a, check(t.b, ty.b, ctx, silent)] });
      }
      case 'inl': case 'inr': {
        const i = next();
        const r = t.k === 'inl' ? '∨I₁' : '∨I₂';
        if (!ty || ty.k !== 'or') return node({ rule: r, concl: ty, traceIdx: i, by, bad: true });
        return node({ rule: r, concl: ty, traceIdx: i, by, kids: [check(t.body, t.k === 'inl' ? ty.a : ty.b, ctx, silent)] });
      }
      case 'case': {
        const i = next();
        const s = infer(t.scrut, ctx, i);
        const st = s.concl;
        if (!st || st.k !== 'or') return node({ rule: '∨E', tag: `${t.lv},${t.rv}`, concl: ty, traceIdx: i, by, kids: [s], bad: true });
        const l = check(t.lbody, ty, [...ctx, [t.lv, st.a]], silent);
        return node({ rule: '∨E', tag: `${t.lv},${t.rv}`, concl: ty, traceIdx: i, by, kids: [s, l, check(t.rbody, ty, [...ctx, [t.rv, st.b]], silent)] });
      }
      case 'unpair': {
        const i = next();
        const s = infer(t.scrut, ctx, i);
        const st = s.concl;
        if (!st || st.k !== 'and') return node({ rule: '∧E', tag: `${t.av},${t.bv}`, concl: ty, traceIdx: i, by, kids: [s], bad: true });
        return node({ rule: '∧E', tag: `${t.av},${t.bv}`, concl: ty, traceIdx: i, by, kids: [s, check(t.body, ty, [...ctx, [t.av, st.a], [t.bv, st.b]], silent)] });
      }
      default: {
        const i = next();
        const n = infer(t, ctx, i);
        if (n.concl && ty && !formulaEq(n.concl, ty)) { n.bad = true; n.want = ty; }
        return n;
      }
    }
  }
  const root = check(term, formula, [], null);
  return { root, lines: k };
}

/* ---------- the wall: a truth that this logic cannot reach ---------- */

function atomsOf(f, out = []) {
  if (f.k === 'atom') { if (!out.includes(f.name)) out.push(f.name); }
  else { atomsOf(f.a, out); atomsOf(f.b, out); }
  return out;
}
function evalClassical(f, v) {
  switch (f.k) {
    case 'atom': return !!v[f.name];
    case 'and': return evalClassical(f.a, v) && evalClassical(f.b, v);
    case 'or': return evalClassical(f.a, v) || evalClassical(f.b, v);
    default: return !evalClassical(f.a, v) || evalClassical(f.b, v);
  }
}
// Classical truth table: every assignment of true/false to the atoms.
export function truthTable(f) {
  const atoms = atomsOf(f);
  const rows = [];
  for (let m = 0; m < (1 << atoms.length); m++) {
    const vals = {};
    atoms.forEach((a, i) => { vals[a] = !((m >> (atoms.length - 1 - i)) & 1); });
    rows.push({ vals, value: evalClassical(f, vals) });
  }
  return { atoms, rows, tautology: rows.every((r) => r.value) };
}
// Kripke forcing for intuitionistic logic (Kripke, 1965). model = { names,
// above: for each world the worlds ≥ it (reflexive, transitive), val: the
// atoms true at each world (persistent upward) }.
export function kripkeForces(model, w, f) {
  switch (f.k) {
    case 'atom': return model.val[w].includes(f.name);
    case 'and': return kripkeForces(model, w, f.a) && kripkeForces(model, w, f.b);
    case 'or': return kripkeForces(model, w, f.a) || kripkeForces(model, w, f.b);
    default: return model.above[w].every((v) => !kripkeForces(model, v, f.a) || kripkeForces(model, v, f.b));
  }
}
// Subformulas, smallest first, without repeats (the rows of the forcing table).
export function subformulas(f) {
  const out = [];
  (function go(g) {
    if (g.k !== 'atom') { go(g.a); go(g.b); }
    if (!out.some((h) => formulaEq(h, g))) out.push(g);
  })(f);
  return out.sort((x, y) => formulaToString(x).length - formulaToString(y).length);
}

export const WALL = {
  name: 'the wall', statement: '((A -> B) -> A) -> A',
  blurb: 'Peirce’s law, published by Charles Sanders Peirce in 1885. True in every row of its truth table — and beyond this instrument’s reach.',
  // Two moments of knowledge: at w₀ nothing is known yet; at w₁ (later) A is.
  model: { names: ['w₀', 'w₁'], above: [[0, 1], [1]], val: [[], ['A']] },
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

// The powers-of-a-thousand magnifier: each row shows a window of the row above
// a thousand times narrower, until the pages themselves fit as cells (at most
// maxCells of them). The last step may be a gentler power of ten.
export function magnifierRows(totalPages, maxCells) {
  const rows = [];
  let span = totalPages;
  for (let guard = 0; guard < 12; guard++) {
    if (span <= maxCells * 1.2) { rows.push({ span, cells: true }); break; }
    rows.push({ span, cells: false });
    let next = span / 1000;
    if (next < maxCells) { let p = 10; while (span / p > maxCells) p *= 10; next = span / p; }
    span = next;
  }
  return rows.map((r, i) => ({ ...r, zoom: i ? rows[i - 1].span / r.span : 1 }));
}

// How many Pythagorean triples a² + b² = c² have c ≤ N (Euclid's formula,
// scaled). F7825 has two clauses per triple: 2 × 9,472 = 18,944 clauses,
// exactly as Heule, Kullmann and Marek report.
export function pythagoreanTriples(N) {
  const g = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  let count = 0;
  for (let m = 2; m * m + 1 <= N; m++) {
    for (let n = 1; n < m; n++) {
      if ((m - n) % 2 === 0 || g(m, n) !== 1) continue;
      const c = m * m + n * n;
      if (c > N) break;
      count += Math.floor(N / c);
    }
  }
  return count;
}

// 1.5e-11 → '1.5 × 10⁻¹¹' (the house's typographic scientific notation).
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sci(x, digits = 1) {
  if (!isFinite(x) || x === 0) return String(x);
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = x / 10 ** e;
  if (Math.abs(+m.toFixed(digits)) >= 10) { m /= 10; e += 1; }
  const sign = m < 0 ? '−' : '';
  return `${sign}${Math.abs(m).toFixed(digits)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
}

// One-call self-test for the site harness (tests.html): all six lemma scripts
// must prove and kernel-re-check; the wrong script must fail with a message;
// the kernel must reject a forged term (and a careless tactic engine's
// output); the tree must mirror the kernel; the wall must be classically true
// and intuitionistically refuted; the library arithmetic must hold.
export function selfTest() {
  for (const lem of LEMMAS) {
    const r = runScript(lem.statement, lem.script);
    if (!r.ok || !r.kernelOk) throw new Error(`lemma "${lem.name}": ${r.error || 'kernel re-check failed'}`);
    const t = proofTree(r.term, parseFormula(lem.statement));
    if (t.lines !== r.trace.length - 1) throw new Error(`lemma "${lem.name}": the tree does not mirror the kernel`);
  }
  const bad = runScript(BAD_SCRIPT.statement, BAD_SCRIPT.script);
  if (bad.ok) throw new Error('the deliberately wrong script was accepted');
  if (typeof bad.error !== 'string' || !bad.error) throw new Error('wrong script failed without a message');
  let rejected = false;
  try { checkTerm({ k: 'lam', v: 'a', body: { k: 'var', name: 'a' } }, [], parseFormula('A -> B')); }
  catch (e) { rejected = e instanceof KernelError; }
  if (!rejected) throw new Error('the kernel accepted a forged term');
  const forged = runScript('A -> B -> A', ['intro a', 'intro b', 'exact b'], { careless: true });
  if (forged.ok || !forged.kernel) throw new Error('the kernel accepted a careless proof');
  const wall = parseFormula(WALL.statement);
  if (!truthTable(wall).tautology) throw new Error('Peirce’s law should be a classical tautology');
  if (kripkeForces(WALL.model, 0, wall)) throw new Error('the Kripke countermodel failed to refute Peirce’s law');
  if (pythagoreanTriples(7825) !== 9472) throw new Error('Pythagorean triple count drifted');
  const rs = readingStats(200e12);
  if (!(rs.years > 2e5 && rs.years < 3e5)) throw new Error('reading-time arithmetic drifted');
  return true;
}

/* ---------- the six lemmas (each script ends in a kernel re-check
             via runScript) and one deliberately wrong script ---------- */

export const LEMMAS = [
  {
    name: 'the mirror', statement: 'A -> A',
    script: ['intro a', 'exact a'],
    blurb: 'Every proposition implies itself. One introduction, one axiom: the shortest proof there is.',
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
    blurb: 'Composition of implications. apply runs the proof backwards, from the goal toward what you hold.',
  },
  {
    name: 'the case-splitter', statement: '((A \\/ B) -> C) -> (A -> C) /\\ (B -> C)',
    script: ['intro h', 'split', 'intro a', 'apply h', 'left', 'exact a', 'intro b', 'apply h', 'right', 'exact b'],
    blurb: 'One handler for either case splits into a handler for each: every tactic you have learned, in one proof.',
  },
];

// The wrong turn: in the left case of A ∨ B you cannot choose the left side
// of B ∨ A. The kernel-facing machinery refuses with a message, not a crash.
export const BAD_SCRIPT = {
  statement: 'A \\/ B -> B \\/ A',
  script: ['intro h', 'cases h a b', 'left', 'exact a'],
  note: 'left commits the goal B ∨ A to proving B — but this branch only holds a : A.',
};

/* ======================================================================
   PART 2 — THE EXHIBIT
   ====================================================================== */

// What there is to read, smallest to largest. Byte counts: the Lean 4
// repository's src/kernel (35 files, 22 Sep 2026); GitHub's count of Lean
// source in leanprover-community/mathlib4 and anthropics/fermats-last-theorem
// (Sep 2026); the two SAT proofs as their authors report them.
const LIBRARY = [
  {
    id: 'kernel', bytes: 323640,
    label: 'the Lean 4 kernel · 324 KB of C++ (2026)',
    line: 'The whole trusted core of Lean 4: the program that says yes or no to every proof in Mathlib.',
    note: 'Measured: the 35 files of <code>src/kernel</code> in the Lean 4 repository, 22 September 2026.',
  },
  {
    id: 'mathlib', bytes: 102144917,
    label: 'Mathlib · 102 MB of Lean (2026)',
    line: 'Lean’s library of formalized mathematics: 2,465,428 lines in 9,327 files on 22 September 2026.',
    note: 'Measured: GitHub’s count of Lean source in <code>mathlib4</code>, September 2026.',
  },
  {
    id: 'flt', bytes: 1170622459,
    label: 'Fermat’s Last Theorem · 1.17 GB (2026)',
    line: 'No positive integers satisfy aⁿ + bⁿ = cⁿ when n > 2: the Lean proof written by AI agents in eleven days.',
    note: 'Measured: GitHub’s count of Lean source in <code>anthropics/fermats-last-theorem</code>, September 2026.',
  },
  {
    id: 'bpt', bytes: 200e12,
    label: 'Boolean Pythagorean triples · 200 TB (2016)',
    line: '{1, …, 7824} splits into two parts with no one-coloured a² + b² = c²; {1, …, 7825} does not.',
    note: 'The question, written out for the solver, is 18,944 clauses: about 113 of these pages, an afternoon. ' +
      'The answer is almost 200 terabytes; its authors also published a 68-gigabyte compressed certificate from which it can be rebuilt.',
  },
  {
    id: 'schur', bytes: 2e15,
    label: 'Schur number five · 2 PB (2017)',
    line: '{1, …, 160} splits into five parts, none holding a + b = c; {1, …, 161} does not.',
    note: 'Over fourteen CPU-years of search, in under three days on the Lonestar 5 cluster in Texas.',
  },
];

// The trust ladder. Every link is something you must believe for the theorem
// to stand; `size` is what that link weighs, where it could be measured.
const TRUST = [
  {
    id: 'four', label: 'Four-colour theorem · 1976 and 2005',
    routes: [
      {
        kind: 'journal', title: 'Appel & Haken, 1976',
        links: [
          ['the authors’ argument', 'people', 'reducibility and discharging'],
          ['a case analysis done by hand', 'people', '≈ 10,000 cases; several small errors later found'],
          ['IBM 370 assembly programs', 'program', '1,200 hours · “quite literally, a billion cases”'],
          ['independent verification', 'people', null],
        ],
      },
      {
        kind: 'machine', title: 'Gonthier & Werner, 2005 · Coq',
        links: [
          ['the statement says what we meant', 'people', 'about 30 lines; some 200 with the reals'],
          ['Coq’s kernel', 'kernel', 'the small core that checks every step'],
          ['the OCaml compiler that built it', 'program', null],
          ['silicon', 'silicon', null],
        ],
        bulk: '“The other 60,000 or so lines of the proof can be read for insight or even entertainment, but need not be reviewed for correctness.” — Georges Gonthier, 2005',
      },
    ],
  },
  {
    id: 'kepler', label: 'Kepler conjecture · 1998 and 2014',
    routes: [
      {
        kind: 'journal', title: 'Hales & Ferguson, 1998',
        links: [
          ['the authors’ strategy', 'people', 'after László Fejes Tóth, 1950s'],
          ['notes, programs and data', 'program', '250 pages · 3 gigabytes'],
          ['the referees', 'people', 'twelve · four years · “99% certain”'],
        ],
      },
      {
        kind: 'machine', title: 'Flyspeck, 2014 · HOL Light + Isabelle',
        links: [
          ['the statement says what we meant', 'people', null],
          ['HOL Light’s kernel', 'kernel', 'a few hundred lines'],
          ['Isabelle’s kernel', 'kernel', 'the tame-graph enumeration'],
          ['the OCaml and ML compilers', 'program', null],
          ['silicon', 'silicon', '≈ 5,000 processor-hours; re-run at Radboud'],
        ],
        bulk: 'The main statement was checked a second time by HOL Zero, a separate kernel.',
      },
    ],
  },
  {
    id: 'lte', label: 'Liquid Tensor Experiment · 2020 and 2022',
    routes: [
      {
        kind: 'journal', title: 'Clausen & Scholze',
        quote: '“I think the theorem is of utmost foundational importance, so being 99.9% sure is not enough.”',
        cite: 'Peter Scholze, 5 December 2020',
      },
      {
        kind: 'machine', title: 'the Lean community, July 2022',
        links: [
          ['the statement says what we meant', 'people', null],
          ['Lean’s kernel', 'kernel', null],
          ['the compiler', 'program', null],
          ['silicon', 'silicon', null],
        ],
        bulk: '“I have no remaining doubts about the correctness of the main proof.” — Scholze, June 2021, six months in',
      },
    ],
  },
  {
    id: 'flt', label: 'Fermat’s Last Theorem · 1995 and 2026',
    routes: [
      {
        kind: 'journal', title: 'Wiles; Taylor & Wiles, 1995',
        quote: '“I am on record as saying that I am 99.9% sure that the proof of FLT is OK, and most people in the number theory community are 100% sure.”',
        cite: 'Kevin Buzzard, 4 September 2026',
      },
      {
        kind: 'machine', title: 'AI agents in Lean, 2026',
        links: [
          ['the statement says what we meant', 'people', 'matched to Mathlib’s by a comparator'],
          ['Lean’s three standard axioms', 'axioms', 'propext · Classical.choice · Quot.sound'],
          ['Lean’s kernel', 'kernel', '≈ 7,500 lines of C++'],
          ['the compiler', 'program', null],
          ['silicon', 'silicon', null],
        ],
        bulk: 'About 13 million lines, written in eleven days. Kevin Buzzard inspected by hand the hundred or so ' +
          'lines that were neither definitions nor proofs, looking for anything malicious; the proofs themselves were the kernel’s to check.',
      },
    ],
  },
];

const FOUNDATIONS = [
  {
    id: 'nd', tab: 'natural deduction',
    title: 'A ∧ B → B ∧ A as Gentzen would draw it',
  },
  {
    id: 'lean', tab: 'Lean 4',
    title: 'The same statement in Lean',
    body:
`example (A B : Prop) :
    A ∧ B → B ∧ A := by
  intro h
  obtain ⟨a, b⟩ := h
  exact ⟨b, a⟩

-- or, written as a term:
example (A B : Prop) :
    A ∧ B → B ∧ A :=
  fun h => ⟨h.2, h.1⟩`,
    note: 'The tactic script is a recipe for a term like the second one, and Lean’s kernel checks only the term: ' +
      'exactly the correspondence the instrument revealed.',
    code: true,
  },
  {
    id: 'hott', tab: 'HoTT',
    title: 'The same statement as a path',
    body:
`swap : A × B → B × A
swap := λ p. ⟨snd p, fst p⟩

-- swap ∘ swap ~ id, so swap
-- is an equivalence:
e : (A × B) ≃ (B × A)

-- univalence turns it
-- into a path:
ua e : (A × B) = (B × A)`,
    code: true,
    note:
      'Univalence, stated precisely: for any types A and B, the canonical map (A = B) → (A ≃ B) is itself an ' +
      'equivalence. What it buys: transport, so that any theorem about A × B carries across the path to B × A ' +
      'for free, and equivalent types become equal. What it costs: a different logic, in which proofs of ' +
      'equality carry content, and univalence postulated as a bare axiom does not compute. Cubical type theory ' +
      '(Cohen, Coquand, Huber and Mörtberg, 2016) made it a theorem that does.',
  },
  {
    id: 'prose', tab: 'prose',
    title: 'The same statement in a journal',
    body:
`Proposition. If A and B, then B and A.

Proof. Suppose A ∧ B. Then in particular B holds,
and A holds; whence B ∧ A. ∎`,
    note:
      'Two sentences and a tombstone. Paul Halmos, who seems to have brought the ∎ into mathematics, had seen ' +
      'it in popular magazines, “not mathematical ones”, where it marked the end of an article; “at least one ' +
      'generous author”, he noted, referred to it as the halmos. Everything the kernel spelled out, which rule, ' +
      'applied to which hypothesis, in which order, the reader is trusted to reconstruct.',
  },
];

export default {
  id: 'telescope',
  movement: 3,
  title: 'The Telescope',
  hook: 'Prove a real theorem the way a machine checks it — then confront the proofs no one will ever read.',
  era: '1935–2026 · from Gentzen’s rules to Lean’s kernel',
  alt:
    'A working miniature proof assistant: a goal panel and tactic buttons, a natural-deduction tree that grows as ' +
    'you prove and that a separate kernel relights rule by rule; below it a scrollbar built to the true scale of ' +
    'proofs too large to read, chains of trust for landmark theorems, and one lemma in four foundations.',
  prose: `
    <p>There is an instrument below, and it is not a metaphor: a working proof assistant, miniature
    but honest. You are given a goal. You act on it with <em>tactics</em>, <code>intro</code> to
    assume, <code>split</code> to divide, <code>apply</code> to reason backwards, and every move is
    policed as you make it. Then, when no goals remain, a small and separate <em>kernel</em>, which
    knows nothing of the tactics, re-derives the whole argument from its inference rules before it
    will grant the QED. The design is called the <em>de Bruijn criterion</em>, after Nicolaas de
    Bruijn, whose AUTOMATH, begun at Eindhoven in the late 1960s, was built so that a machine could
    check mathematics line by line. It is the quiet idea underneath everything here: concentrate all
    trust in a core small enough to audit, then build without limit on top of it. Lean’s
    mathematical library, Mathlib, now runs to nearly two and a half million lines. Its credibility
    rests on a kernel of about seven and a half thousand lines of C++, which at a page a minute is an
    afternoon’s reading.</p>
    <p>The history runs from scandal to routine. In 1976 Kenneth Appel and Wolfgang Haken proved the
    four-colour theorem with some 1,200 hours of computer time, in a case analysis that covered, as
    Georges Gonthier later put it, “quite literally, a billion cases”, and that no one could check by
    hand. Many mathematicians recoiled: they had hoped for an argument that showed why the theorem was
    true, not a stack of IBM 370 assembly programs. In 2005 Gonthier, with Benjamin Werner, rebuilt
    the theorem inside the Coq proof assistant, following the streamlined proof of Robertson, Sanders,
    Seymour and Thomas, and the doubts about correctness, if not the complaints about style, dissolved.
    What remained to be read was a statement of
    about thirty lines and the definition of the real numbers beneath it, some two hundred lines in
    all; the other 60,000 or so, Gonthier wrote, “need not be reviewed for correctness.” Thomas Hales lived both halves of
    the story. In 2003, after four years of work, the twelve referees of the proof of Kepler’s 1611
    conjecture on packing spheres that Hales had completed with his student Samuel Ferguson in 1998
    reported themselves “99% certain”. Hales spent the next eleven years on Flyspeck, a formal proof
    completed in August 2014.</p>
    <p>Then the machines began to keep pace. In December 2020 Peter Scholze asked the Lean community to
    check a theorem he thought might be his most important to date, because, he wrote, “being 99.9%
    sure is not enough”; six months in, he reported that “the proof assistant has actually assisted in
    understanding the proof”, and the Liquid Tensor Experiment was complete in July 2022. In November
    2023 Timothy Gowers, Ben Green, Freddie Manners and Terence Tao proved Marton’s conjecture in
    characteristic two, and an open collaboration led by Tao had it formalized in Lean in about
    three weeks. In July 2024 the fifth <a href="#ex-beavers">busy beaver</a> was settled by an online
    collaboration, partly pseudonymous, whose referee was the Coq kernel. On 14 April 2025 the
    Equational Theories Project, a crowd of people and automated provers, answered the last of
    22,028,942 questions of the form “does this law imply that one?”, every answer checked in
    Lean.</p>
    <p>And then there are the proofs that left us behind. The numbers 1 to 7,824 can be split into two
    sets so that neither holds a whole Pythagorean triple <code>a² + b² = c²</code>; the numbers 1 to
    7,825 cannot. Ronald Graham had offered a hundred dollars for the answer. Marijn Heule, Oliver
    Kullmann and Victor Marek found it in 2016 after about two days on a supercomputer in Texas, and
    the proof runs to almost 200 terabytes. The question, written out for the solver, is 18,944
    clauses, about a hundred and thirteen pages; the answer would take a quarter of a million years to
    read. Schur number five (Heule, 2017) weighs two petabytes. The scrollbar below is built to the
    true scale of such proofs. On a laptop its thumb, one human-readable page, is a few trillionths of
    a metre wide, narrower than a hydrogen atom. Scroll it anyway. The arithmetic beside it, computed
    live, is the honest punchline.</p>
    <p>When you finish a lemma, the instrument shows you something strange: your proof, written as a
    program. This is the <em>Curry–Howard correspondence</em>, glimpsed by Haskell Curry in 1934 and
    made exact by William Howard in a manuscript he circulated in 1969 and published only in 1980.
    Every <code>intro</code> was a λ, every <code>apply</code> a function call, every
    <code>split</code> a pair, every <code>cases</code> a match. It is not a curiosity but the reason
    machines can enter mathematics at all: a proof is data, and data can be checked, searched and
    generated. At the 2024 International Mathematical Olympiad, DeepMind’s AlphaProof and AlphaGeometry
    2 together scored 28 of 42, one point short of gold, on problems translated by hand into formal
    language, some after as long as three days of search. In 2026 the scale changed. In July a
    counterexample to the Jacobian conjecture, posed by Ott-Heinrich Keller in 1939, was found by
    Levent Alpöge with an AI model and checked in Lean within days; in September came a Lean proof of
    Fermat’s Last Theorem some thirteen million lines long, written by AI agents in eleven days. The
    kernel does not ask who wrote the proof. That is either the most democratic sentence in mathematics
    or the most unsettling, and the panel at the foot of this exhibit refuses to decide for you.</p>
    <p>So the only question left is the oldest one: what, exactly, must you trust? Below, each landmark
    hangs from its chain, link by link: authors, referees, kernels, compilers, silicon. Doubt any link
    and the theorem falls with it. Count the links, and the machine chains are not always shorter.
    Weigh them, and they are lighter: for Kepler, a kernel of a few hundred lines in place of a panel
    of twelve referees, and links that anyone who doubts them can run again.</p>`,

  chronicle: [
    { year: 1935, date: '1935', text: 'Gerhard Gentzen, aged 25, publishes <em>natural deduction</em>, whose rules of proof come in pairs: introductions that say how to prove each logical connective, eliminations that say how to use it.' },
    { year: 1969, date: '1969', text: 'William Howard circulates a xeroxed manuscript showing that natural-deduction proofs are typed λ-terms and that simplifying a proof is running a program. It sharpens an observation Haskell Curry made in 1934, and is printed only in 1980.' },
    { year: 1976, date: '1976', text: 'Kenneth Appel and Wolfgang Haken prove the four-colour theorem with some 1,200 hours of computer time: the first long-standing problem in mathematics settled by a computer program, in a case analysis no one could check by hand.' },
    { year: 2005, date: '2005', text: 'Georges Gonthier, with Benjamin Werner, completes a proof of the four-colour theorem checked by the Coq proof assistant; what must be read to trust it shrinks to a statement of about thirty lines and the definitions beneath it.' },
    { year: 2014, date: 'August 2014', text: 'The Flyspeck project completes a formal proof of Kepler’s 1611 conjecture on packing spheres, in HOL Light and Isabelle, eleven years after the referees of Thomas Hales and Samuel Ferguson’s proof declared themselves “99% certain”.' },
    { year: 2016, date: 'May 2016', text: 'Marijn Heule, Oliver Kullmann and Victor Marek settle the Boolean Pythagorean triples problem, for which Ronald Graham had offered $100, in about two days on a Texas supercomputer. The proof is almost 200 terabytes.' },
    { year: 2022, date: 'July 2022', text: 'The Liquid Tensor Experiment is completed in Lean. Peter Scholze had asked for it in December 2020 because, he wrote, “being 99.9% sure is not enough.”' },
    { year: 2026, date: '4 September 2026', text: 'Anthropic announces a Lean proof of Fermat’s Last Theorem, some 13 million lines written by AI agents in eleven days: the last of the hundred theorems on Freek Wiedijk’s list to be formalized.' },
  ],

  today: `
    <p>The kernel has long since left the seminar room. In 2009 a machine-checked proof in Isabelle/HOL
    established the functional correctness of seL4, an operating-system microkernel whose verified
    64-bit RISC-V version runs to about ten thousand lines of C. Elliptic-curve code generated with Coq
    proofs by MIT’s Fiat Cryptography replaced specialised routines in Google’s BoringSSL, for Chrome
    and Android; Amazon models its authorization language, Cedar, in Lean and does not release a new
    version unless its model, proofs and differential tests are up to date. There a proof is not an
    ornament on the code but a condition of shipping it.</p>
    <p>In mathematics the scale keeps changing. On 4 September 2026 Anthropic announced that AI agents
    had written, in eleven days, a Lean proof of Fermat’s Last Theorem some thirteen million lines
    long, more than five times the size of Mathlib, following Darmon, Diamond and Taylor’s account of
    Wiles’s argument and using only Lean’s three standard axioms. Kevin Buzzard, whose own five-year
    project to formalize the theorem is funded by the EPSRC, compiled it, ran the comparator and
    reported that “it checks out”. The models behind such agents are trained by gradient descent, the engine of
    <a href="#ex-learner">The Descent</a>.</p>
    <p>The frontier has moved up the trust ladder. Does a formal statement say what the mathematician
    meant? Is a kernel of a few thousand lines itself sound? Lean4Lean, a second checker for Lean
    written in Lean, can re-check all of Mathlib, and the work on it has already turned up one
    soundness bug, since fixed. The Annals
    Challenge, announced in August 2026, posts Lean statements of fifty theorems published in the
    <em>Annals of Mathematics</em> in the 2020s, and invites machines to supply the proofs.</p>`,

  sources: [
    { text: 'Philip Wadler, “Propositions as Types”, <em>Communications of the ACM</em> 58:12 (2015)', url: 'https://homepages.inf.ed.ac.uk/wadler/papers/propositions-as-types/propositions-as-types.pdf' },
    { text: 'Mike Gordon, “From LCF to HOL: a short history” (2000)', url: 'https://www.cl.cam.ac.uk/archive/mjcg/papers/HolHistory.pdf' },
    { text: 'Georges Gonthier, “A computer-checked proof of the Four Colour Theorem” (2005)', url: 'https://www.cl.cam.ac.uk/~lp15/Pages/4colproof.pdf' },
    { text: 'Thomas Hales et al., “A formal proof of the Kepler conjecture”, <em>Forum of Mathematics, Pi</em> 5 (2017)', url: 'https://arxiv.org/abs/1501.02155' },
    { text: 'Marijn Heule, Oliver Kullmann &amp; Victor Marek, “Solving and Verifying the Boolean Pythagorean Triples problem via Cube-and-Conquer” (SAT 2016)', url: 'https://arxiv.org/abs/1605.00723' },
    { text: 'Peter Scholze, “Liquid tensor experiment”, Xena Project (5 December 2020)', url: 'https://xenaproject.wordpress.com/2020/12/05/liquid-tensor-experiment/' },
    { text: 'The Equational Theories Project contributors, “The Equational Theories Project” (December 2025)', url: 'https://teorth.github.io/equational_theories/paper.pdf' },
    { text: 'T. Hubert et al., “Olympiad-level formal mathematical reasoning with reinforcement learning”, <em>Nature</em> (12 November 2025)', url: 'https://doi.org/10.1038/s41586-025-09833-y' },
    { text: 'Anthropic, “Formalizing Fermat’s Last Theorem” (4 September 2026)', url: 'https://www.anthropic.com/research/formalizing-fermats-last-theorem' },
    { text: 'Kevin Buzzard, “FLT: Anthropic has beaten me to it”, Xena Project (4 September 2026)', url: 'https://xenaproject.wordpress.com/2026/09/04/flt-anthropic-has-beaten-me-to-it/' },
  ],

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const C = {
      ...P,
      crimsonBright: P.crimsonBright || '#d97a68',
      verdigris: P.verdigris || '#62b3a4',
      inkGhost: P.inkGhost || '#4a4840',
    };
    const SERIF = (getComputedStyle(document.body).fontFamily || 'Georgia, serif');
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const bus = audio.createBus('telescope');
    const cleanups = [];
    const listen = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); };
    const el = (tag, cls, parent, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      if (parent) parent.appendChild(e);
      return e;
    };
    const esc = escHTML;
    const grp = (n) => Math.round(n).toLocaleString('en-US');
    const nowSec = () => performance.now() / 1000;

    // tactic ↔ rule ↔ term constructor share one colour each (Curry–Howard,
    // made visible): intro/λ/→I gold, apply/application/→E azure, split/pair/∧I
    // verdant, cases/match·let/∨E·∧E vermilion, left·right/inl·inr/∨I verdigris.
    const TAC_COLOR = { intro: C.gold, apply: C.azure, exact: C.ink, split: C.verdant, cases: C.crimsonBright, left: C.verdigris, right: C.verdigris, lr: C.verdigris };
    const RULE_COLOR = { '→I': C.gold, '→E': C.azure, '∧I': C.verdant, '∧E': C.crimsonBright, '∨E': C.crimsonBright, '∨I₁': C.verdigris, '∨I₂': C.verdigris };

    /* ---------- scoped style ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-telescope .tel-root { --tel-hair: linear-gradient(90deg, ${C.goldDim}, rgba(138,116,64,0) 70%); }
      #ex-telescope .tel-h { font-variant: small-caps; letter-spacing:.2em; font-size:.8rem; color:${C.gold};
        margin:2rem 0 .7rem; padding-bottom:.35rem; background: var(--tel-hair) bottom left / 100% 1px no-repeat; }
      #ex-telescope .tel-h:first-child { margin-top:.2rem; }
      #ex-telescope .tel-h .tel-num { letter-spacing:.32em; margin-right:.35em; }
      #ex-telescope .tel-sub { font-variant: all-small-caps; letter-spacing:.14em; font-size:.78rem; color:${C.inkFaint};
        margin:.9rem 0 .35rem; }
      #ex-telescope .tel-lemmas { display:flex; flex-wrap:wrap; gap:.4rem; margin:.2rem 0 .8rem; }
      #ex-telescope .tel-lemmas .btn.proved { color:${C.verdant}; border-color:rgba(127,174,122,.6); }
      #ex-telescope .tel-lemmas .btn.proved::after { content:' ✓'; }
      #ex-telescope .tel-lemmas .btn.wall { border-style:dashed; border-color:rgba(192,91,77,.55); color:${C.crimsonBright}; }
      #ex-telescope .tel-lemmas .btn.wall.active { background:rgba(192,91,77,.12); border-color:${C.crimson}; }
      #ex-telescope .tel-proof { display:flex; gap:1rem; align-items:flex-start; flex-wrap:wrap; }
      #ex-telescope .tel-goals { flex:1 1 19rem; min-width:0; }
      #ex-telescope .tel-goal { border:1px solid ${C.line}; border-radius:6px; background:${C.bg};
        padding:.65rem .85rem; margin-bottom:.55rem; font-family:var(--mono); font-size:.92rem; overflow-wrap:anywhere; }
      #ex-telescope .tel-goal.current { border-color:${C.goldDim}; box-shadow: inset 0 0 0 1px rgba(201,169,89,.08); }
      #ex-telescope .tel-goal.waiting { opacity:.6; font-size:.8rem; padding:.4rem .85rem; }
      #ex-telescope .tel-hyp { display:block; width:100%; text-align:left; font:inherit; background:none; border:0;
        padding:.14rem .35rem; margin:0 0 .05rem; border-radius:4px; color:${C.inkDim}; cursor:default; }
      #ex-telescope .tel-hyp b { color:${C.azure}; font-weight:600; }
      #ex-telescope .tel-hyp:focus-visible { outline:1px solid ${C.azure}; }
      #ex-telescope .tel-armed .tel-goal.current .tel-hyp { cursor:pointer; outline:1px dashed ${C.azureDim}; outline-offset:-1px; }
      #ex-telescope .tel-armed .tel-goal.current .tel-hyp:hover,
      #ex-telescope .tel-armed .tel-goal.current .tel-hyp:focus-visible { background:${C.panel}; color:${C.ink}; }
      #ex-telescope .tel-turnstile { margin-top:.35rem; padding-top:.35rem; border-top:1px solid ${C.line}; color:${C.ink}; }
      #ex-telescope .tel-turnstile .tstile { color:${C.gold}; margin-right:.45rem; }
      #ex-telescope .tel-goal .tel-turnstile:first-child { margin-top:0; padding-top:0; border-top:0; }
      #ex-telescope .tel-tactics { flex:0 1 15.5rem; display:flex; flex-wrap:wrap; gap:.4rem; align-content:flex-start; }
      #ex-telescope .tel-tactics .btn { min-width:4.3rem; }
      #ex-telescope .tel-tactics .btn[data-tac] { box-shadow: inset 0 -2px 0 var(--tc); }
      #ex-telescope .tel-tactics .btn.armed { border-color:${C.azure}; color:${C.azure}; background:rgba(125,167,217,.1); }
      #ex-telescope .tel-locked .tel-tactics .btn[data-tac] { opacity:.35; pointer-events:none; }
      #ex-telescope .tel-cmdrow { display:flex; flex-wrap:wrap; gap:.5rem .9rem; align-items:center; margin:.35rem 0 .1rem; }
      #ex-telescope .tel-cmd { flex:1 1 13rem; min-width:0; max-width:22rem; font-family:var(--mono); font-size:.85rem;
        color:${C.ink}; background:${C.bg}; border:1px solid ${C.line}; border-radius:5px; padding:.38rem .6rem; }
      #ex-telescope .tel-cmd::placeholder { color:${C.inkFaint}; }
      #ex-telescope .tel-cmd:focus { outline:none; border-color:${C.goldDim}; }
      #ex-telescope .tel-cmd:disabled { opacity:.45; }
      #ex-telescope .tel-cmdrow .toggle-pill { font-size:.8rem; }
      #ex-telescope .tel-ownrow { margin:-.2rem 0 .8rem; }
      #ex-telescope .tel-msg { min-height:1.4rem; margin:.55rem 0 .2rem; font-family:var(--mono);
        font-size:.85rem; color:${C.inkDim}; overflow-wrap:anywhere; }
      #ex-telescope .tel-msg.err { color:${C.crimsonBright}; }
      #ex-telescope .tel-msg.good { color:${C.verdant}; }
      #ex-telescope .tel-msg.prose { font-family:inherit; font-style:italic; font-size:1rem; line-height:1.5; }
      #ex-telescope .tel-msg.prose.err { color:${C.crimsonBright}; }
      #ex-telescope .tel-script { font-family:var(--mono); font-size:.8rem; color:${C.inkFaint};
        margin:.2rem 0 .4rem; min-height:1.1rem; overflow-wrap:anywhere; }
      #ex-telescope .tel-script .sl { color:${C.inkDim}; border-bottom:1px solid transparent; cursor:default; }
      #ex-telescope .tel-script .sl.hl, #ex-telescope .tel-script .sl:hover { color:${C.goldBright}; border-bottom-color:${C.goldDim}; }
      #ex-telescope .tel-treebox { margin:.5rem 0 .2rem; }
      #ex-telescope .tel-tree { overflow-x:auto; overflow-y:hidden; border-radius:4px; }
      #ex-telescope .tel-tree canvas { display:block; touch-action:pan-y; box-shadow:none; background:transparent; }
      #ex-telescope .tel-key { font-family:var(--mono); font-size:.72rem; color:${C.inkFaint}; margin:.3rem 0 0;
        display:flex; flex-wrap:wrap; gap:.15rem .9rem; }
      #ex-telescope .tel-key i { font-style:normal; }
      #ex-telescope .tel-kernel { display:none; border:1px solid ${C.line}; border-left:3px solid ${C.gold};
        border-radius:0 6px 6px 0; background:${C.bg}; padding:.6rem .9rem; margin:.6rem 0;
        font-family:var(--mono); font-size:.8rem; color:${C.inkDim}; overflow-x:auto; }
      #ex-telescope .tel-kernel.show { display:block; }
      #ex-telescope .tel-kernel.refused { border-left-color:${C.crimson}; }
      #ex-telescope .tel-kernel .kline { white-space:pre-wrap; overflow-wrap:anywhere; }
      #ex-telescope .tel-kernel .kline .rule { color:${C.azure}; }
      #ex-telescope .tel-kernel .kline.qed { color:${C.verdant}; }
      #ex-telescope .tel-kernel .kline.refused { color:${C.crimsonBright}; }
      #ex-telescope .tel-kernel .tomb { color:${C.goldBright}; margin-left:.5em; opacity:0; transition:opacity .24s ease-out; }
      #ex-telescope .tel-kernel .tomb.on { opacity:1; }
      #ex-telescope .tel-term { display:none; border:1px solid ${C.goldDim}; border-radius:6px;
        background:linear-gradient(90deg, rgba(201,169,89,.07), transparent 70%); padding:.75rem .95rem; margin:.6rem 0; }
      #ex-telescope .tel-term.show { display:block; }
      #ex-telescope .tel-term.forged { border-color:rgba(192,91,77,.6); background:linear-gradient(90deg, rgba(192,91,77,.08), transparent 70%); }
      #ex-telescope .tel-term .tt-code { font-family:var(--mono); font-size:.95rem; color:${C.ink};
        overflow-wrap:anywhere; margin-bottom:.45rem; line-height:1.6; }
      #ex-telescope .tel-term .tt-type { color:${C.inkFaint}; }
      #ex-telescope .tel-term .tt-note { font-size:.88rem; color:${C.inkDim}; font-style:italic; }
      #ex-telescope .tel-term .tt-note b, #ex-telescope .tel-key b { font-style:normal; font-weight:600; }
      #ex-telescope .ck { font-weight:600; }
      #ex-telescope .ck-intro { color:${C.gold}; } #ex-telescope .ck-apply { color:${C.azure}; }
      #ex-telescope .ck-split { color:${C.verdant}; } #ex-telescope .ck-cases { color:${C.crimsonBright}; }
      #ex-telescope .ck-lr { color:${C.verdigris}; } #ex-telescope .ck-exact { color:${C.ink}; font-weight:400; }
      #ex-telescope .ck-hole { color:${C.goldDim}; }
      #ex-telescope .chs { border-radius:3px; transition: background-color .15s; }
      #ex-telescope .chs.hl { background:rgba(201,169,89,.16); }
      #ex-telescope .tel-wall { display:none; border:1px dashed rgba(192,91,77,.5); border-radius:6px; padding:.85rem 1rem;
        margin:.7rem 0; background:rgba(192,91,77,.04); }
      #ex-telescope .tel-wall.show { display:block; }
      #ex-telescope .tel-wall .tw-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap:1rem 1.6rem; }
      #ex-telescope .tel-wall .tw-h { font-variant: all-small-caps; letter-spacing:.12em; color:${C.crimsonBright}; font-size:.85rem; margin-bottom:.4rem; }
      #ex-telescope .tel-wall table { border-collapse:collapse; font-family:var(--mono); font-size:.8rem; color:${C.inkDim}; }
      #ex-telescope .tel-wall th, #ex-telescope .tel-wall td { padding:.18rem .55rem; border-bottom:1px solid ${C.line}; text-align:center; }
      #ex-telescope .tel-wall th { color:${C.inkFaint}; font-weight:400; }
      #ex-telescope .tel-wall td.f { text-align:left; color:${C.ink}; white-space:nowrap; }
      #ex-telescope .tel-wall .yes { color:${C.verdant}; } #ex-telescope .tel-wall .no { color:${C.crimsonBright}; }
      #ex-telescope .tel-wall .tw-worlds { display:block; margin:.1rem 0 .5rem; max-width:100%; }
      #ex-telescope .tel-wall .tw-note { font-size:.9rem; color:${C.inkDim}; margin:.8rem 0 0; line-height:1.55; }
      #ex-telescope .tel-libcv { position:relative; outline:none; border-radius:3px; }
      #ex-telescope .tel-libcv canvas { touch-action:pan-y; cursor:ew-resize; }
      #ex-telescope .tel-libcv:focus-visible { box-shadow: 0 0 0 1px ${C.goldDim}; }
      #ex-telescope .tel-scale { font-size:.92rem; color:${C.inkDim}; margin:.6rem 0 .45rem; line-height:1.6; }
      #ex-telescope .tel-scale p { margin:.2rem 0; }
      #ex-telescope .tel-scale .ts-thm { color:${C.ink}; font-style:italic; }
      #ex-telescope .tel-scale .n { font-family:var(--mono); font-size:.86em; color:${C.goldBright}; }
      #ex-telescope .tel-scale .src { font-size:.82rem; color:${C.inkFaint}; }
      #ex-telescope .readout { overflow-wrap:anywhere; }
      #ex-telescope .tel-trust { display:grid; grid-template-columns: repeat(auto-fit, minmax(15.5rem, 1fr)); gap:1.4rem 2.2rem;
        margin:.8rem 0 .4rem; align-items:start; }
      #ex-telescope .tel-route { display:flex; flex-direction:column; align-items:center; min-width:0; }
      #ex-telescope .tr-h { text-align:center; margin-bottom:.35rem; }
      #ex-telescope .tr-kind { display:block; font-variant: all-small-caps; letter-spacing:.16em; font-size:.8rem; color:${C.inkFaint}; }
      #ex-telescope .tel-route.machine .tr-kind { color:${C.gold}; }
      #ex-telescope .tr-who { font-size:.95rem; color:${C.ink}; font-style:italic; }
      #ex-telescope .tr-anchor { width:3.2rem; height:3px; border-radius:2px; background:${C.goldDim}; margin:.2rem 0 0; }
      #ex-telescope .tr-chain { list-style:none; margin:0; padding:0; width:100%; max-width:21rem; display:flex; flex-direction:column; align-items:center; }
      #ex-telescope .tr-chain li { width:100%; display:flex; justify-content:center; }
      #ex-telescope .tr-shackle { color:${C.goldDim}; height:24px; transition: color .2s; }
      #ex-telescope .tr-shackle svg { display:block; overflow:visible; }
      #ex-telescope .tr-shackle .lower { transition: transform .25s ease-out; }
      #ex-telescope .tr-shackle.broken { color:${C.crimson}; }
      #ex-telescope .tr-shackle.broken .lower { transform: translateY(5px); stroke-dasharray: 3 3; }
      #ex-telescope .tel-link { width:100%; font:inherit; text-align:left; cursor:pointer; color:${C.ink};
        background:${C.panel}; border:1px solid ${C.line}; border-left:3px solid var(--kc); border-radius:6px;
        padding:.42rem .7rem .45rem; transition: border-color .15s, color .15s, opacity .25s, transform .25s; }
      #ex-telescope .tel-link:hover { border-color:${C.goldDim}; border-left-color:var(--kc); }
      #ex-telescope .tel-link:focus-visible { outline:1px solid ${C.gold}; outline-offset:2px; }
      #ex-telescope .tel-link .lk-what { display:block; font-size:.9rem; line-height:1.3; }
      #ex-telescope .tel-link .lk-meta { display:flex; justify-content:space-between; gap:.6rem; margin-top:.15rem; }
      #ex-telescope .tel-link .lk-size { font-size:.78rem; color:${C.inkDim}; font-style:italic; }
      #ex-telescope .tel-link .lk-kind { font-variant: all-small-caps; letter-spacing:.12em; font-size:.74rem; color:var(--kc); white-space:nowrap; }
      #ex-telescope .tel-link[aria-pressed="true"] { border-style:dashed; border-color:${C.crimson}; color:${C.crimsonBright}; }
      #ex-telescope .fallen { opacity:.32; transform: translateY(6px); }
      #ex-telescope .tr-weight { margin-top:.35rem; padding:.3rem .9rem; border:1px solid ${C.goldDim}; border-radius:3px;
        font-size:.85rem; color:${C.goldBright}; background:rgba(201,169,89,.06); transition: opacity .25s, transform .25s, color .2s, border-color .2s; }
      #ex-telescope .tr-weight.fallen { color:${C.crimsonBright}; border-color:${C.crimson}; border-style:dashed; }
      #ex-telescope .tr-quote { margin:.5rem 0 0; padding:.7rem .9rem; max-width:21rem; border-left:2px solid ${C.goldDim};
        font-size:.95rem; font-style:italic; color:${C.ink}; line-height:1.5; }
      #ex-telescope .tr-quote cite { display:block; margin-top:.4rem; font-size:.82rem; color:${C.inkFaint}; font-style:normal; }
      #ex-telescope .tr-bulk { margin-top:.6rem; max-width:21rem; font-size:.82rem; font-style:italic; color:${C.inkFaint}; text-align:center; line-height:1.45; }
      #ex-telescope .tel-verdict { font-size:.95rem; min-height:1.4rem; color:${C.inkDim}; margin:.5rem 0 .3rem; text-align:center; }
      #ex-telescope .tel-verdict.down { color:${C.crimsonBright}; }
      #ex-telescope .tel-tabs { display:flex; flex-wrap:wrap; gap:.4rem; margin:.5rem 0 .6rem; }
      #ex-telescope .tel-found { border:1px solid ${C.line}; border-radius:6px; background:${C.bg}; padding:.85rem 1rem; }
      #ex-telescope .tel-found h4 { margin:0 0 .55rem; font-size:.9rem; color:${C.gold}; font-weight:600; letter-spacing:.03em; }
      #ex-telescope .tel-found pre { font-family:var(--mono); font-size:.84rem; color:${C.ink};
        white-space:pre-wrap; overflow-wrap:anywhere; margin:0 0 .55rem; line-height:1.55; }
      #ex-telescope .tel-found pre.code { white-space:pre; overflow-wrap:normal; overflow-x:auto; }
      #ex-telescope .tel-found .fnote { font-size:.88rem; color:${C.inkDim}; font-style:italic; line-height:1.5; }
      @media (prefers-reduced-motion: reduce) {
        #ex-telescope .fallen { transform:none; }
        #ex-telescope .tr-shackle .lower, #ex-telescope .tel-link, #ex-telescope .tr-weight, #ex-telescope .tel-kernel .tomb { transition:none; }
        #ex-telescope .tr-shackle.broken .lower { transform:none; }
      }
    `;
    stage.appendChild(style);
    const root = el('div', 'tel-root', stage);
    const heading = (num, text) => el('div', 'tel-h', root, `<span class="tel-num">${num}</span>· ${text}`);

    /* ---------- a tiny HiDPI canvas whose size the caller controls ---------- */
    function makeCanvas(parent) {
      const c = el('canvas', null, parent);
      const ctx = c.getContext('2d');
      const h = { canvas: c, ctx, w: 0, h: 0, dpr: 1 };
      h.size = (w, hh) => {
        w = Math.max(10, Math.round(w)); hh = Math.max(10, Math.round(hh));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (w !== h.w || hh !== h.h || dpr !== h.dpr) {
          c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
          c.style.width = w + 'px'; c.style.height = hh + 'px';
          h.w = w; h.h = hh; h.dpr = dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      return h;
    }

    // Draw runs of mixed type on one baseline: [{t, font, color}]. Returns width.
    function runsWidth(ctx, runs) { let w = 0; for (const r of runs) { ctx.font = r.font; w += ctx.measureText(r.t).width; } return w; }
    function drawRuns(ctx, runs, x, y, align = 'left') {
      const w = runsWidth(ctx, runs);
      let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      ctx.textAlign = 'left';
      for (const r of runs) { ctx.font = r.font; ctx.fillStyle = r.color; ctx.fillText(r.t, cx, y); cx += ctx.measureText(r.t).width; }
      return w;
    }

    /* ======================================================================
       THE TREE: Gentzen's picture of the proof, drawn from the proof term
       ====================================================================== */

    function TreeView(parent, { minScale = 0.6, base = 17, minH = 90, label = 'proof tree' } = {}) {
      const wrap = el('div', 'tel-tree', parent);
      const hc = makeCanvas(wrap);
      hc.canvas.setAttribute('role', 'img');
      hc.canvas.setAttribute('aria-label', label);
      const glow = cv.glowSprite(C.gold, 64);
      const tw = new Map();
      let data = null, goalId = null, lit = Infinity, failIdx = -1, hoverBy = -1, flareT = -1, want = minH;
      let dirty = true, W = 0;
      const ro = new ResizeObserver(() => { const w = wrap.clientWidth; if (Math.abs(w - W) > 0.5) { W = w; dirty = true; } });
      ro.observe(wrap);
      const F = base, LINE = Math.round(base * 1.35), GAP = Math.round(base * 1.5), BARGAP = 4, LGAP = 5;
      const fItal = (s) => `italic ${s}px ${SERIF}`, fUp = (s) => `${s}px ${SERIF}`;
      const ctx = hc.ctx;
      function meas(font, s) {
        const key = font + '|' + s;
        let v = tw.get(key);
        if (v == null) { ctx.font = font; v = ctx.measureText(s).width; tw.set(key, v); }
        return v;
      }
      const toks = (s) => s.split(/([A-Za-z][A-Za-z0-9]*)/).filter((x) => x !== '');
      const isAtom = (x) => /^[A-Za-z]/.test(x);
      const fw = (s, size = F) => toks(s).reduce((w, x) => w + meas(isAtom(x) ? fItal(size) : fUp(size), x), 0);
      function drawF(s, x, y, size, color) {
        ctx.fillStyle = color; ctx.textAlign = 'left';
        for (const x0 of toks(s)) { const f = isAtom(x0) ? fItal(size) : fUp(size); ctx.font = f; ctx.fillText(x0, x, y); x += meas(f, x0); }
      }
      const tagSize = () => Math.round(F * 0.62);
      const ruleSize = () => Math.round(F * 0.8);
      function nodeText(n) { return n.concl ? formulaToString(n.concl) : '⁇'; }
      function layout(n) {
        if (!n.rule) {
          const s = nodeText(n);
          let w = fw(s);
          if (n.hole != null) w += 14;
          else if (n.hyp) w += fw('[') + fw(']') + meas(fItal(tagSize()), n.hyp) + 2;
          const core = w;
          // a forged leaf reserves room to confess, after the kernel refuses it
          if (n.want) { n.wantS = '≠ ' + formulaToString(n.want); w += 8 + fw(n.wantS, ruleSize()); }
          n.box = { w, h: LINE, cx0: 0, cx1: core, s };
          return n.box;
        }
        const kids = n.kids.map(layout);
        const s = nodeText(n);
        const t = fw(s);
        let x = 0;
        const kx = kids.map((k) => { const p = x; x += k.w + GAP; return p; });
        const premW = kids.length ? x - GAP : 0;
        const pL = kids.length ? kx[0] + kids[0].cx0 : 0;
        const pR = kids.length ? kx[kids.length - 1] + kids[kids.length - 1].cx1 : t;
        let cx0 = (pL + pR) / 2 - t / 2;
        const shift = cx0 < 0 ? -cx0 : 0;
        cx0 += shift;
        const kxs = kx.map((v) => v + shift);
        const barL = Math.min(pL + shift, cx0) - 3, barR = Math.max(pR + shift, cx0 + t) + 3;
        const lw = meas(fUp(ruleSize()), n.rule) + (n.tag ? meas(fItal(tagSize()), n.tag) + 1 : 0);
        const kh = kids.reduce((m, k) => Math.max(m, k.h), 0);
        n.box = { w: Math.max(premW + shift, cx0 + t, barR + LGAP + lw), h: kh + BARGAP * 2 + 1 + LINE, cx0, cx1: cx0 + t, kx: kxs, kh, barL, barR, s };
        return n.box;
      }
      const dimmed = (n) => lit !== Infinity && n.traceIdx >= lit && !(failIdx >= 0 && n.traceIdx === failIdx);
      function colorFor(n, base) {
        if (failIdx >= 0 && n.traceIdx === failIdx) return C.crimsonBright;
        if (dimmed(n)) return C.inkGhost;
        if (hoverBy >= 0 && n.by === hoverBy) return C.goldBright;
        return base;
      }
      function drawNode(n, x0, y0, s, ox, oy) {
        const b = n.box;
        const X = (x) => ox + (x0 + x) * s, Y = (y) => oy + (y0 + y) * s;
        const fs = F * s;
        const baseY = Y(b.h) - Math.max(3, LINE * 0.28 * s);
        if (!n.rule) {
          if (n.hole != null) {
            const cur = n.hole === goalId;
            const rx = Math.round(X(0)) + 0.5, ry = Math.round(Y(1)) + 0.5, rw = Math.max(0, Math.round(b.w * s) - 1), rh = Math.max(0, Math.round((LINE - 2) * s));
            if (cur) {
              // a soft elliptical halo, stretched to the box, then a faint wash inside it
              ctx.globalAlpha = 0.2;
              ctx.drawImage(glow.canvas, rx - rh, ry - rh * 0.6, Math.max(0, rw + rh * 2), Math.max(0, rh * 2.2));
              ctx.globalAlpha = 1;
              ctx.fillStyle = 'rgba(201,169,89,0.07)';
              ctx.fillRect(rx, ry, rw, rh);
            }
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = cur ? C.gold : C.goldDim; ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);
            drawF(b.s, X(7), baseY, fs, cur ? C.goldBright : C.inkDim);
            return;
          }
          const col = colorFor(n, n.bad && failIdx >= 0 ? C.crimsonBright : C.ink);
          const brk = dimmed(n) ? C.inkGhost : C.inkDim;
          let x = X(0);
          drawF('[', x, baseY, fs, brk); x += fw('[') * s;
          drawF(b.s, x, baseY, fs, col); x += fw(b.s) * s;
          drawF(']', x, baseY, fs, brk); x += fw(']') * s + 1;
          ctx.font = fItal(tagSize() * s); ctx.fillStyle = dimmed(n) ? C.inkGhost : C.azure; ctx.textAlign = 'left';
          ctx.fillText(n.hyp || '', x, baseY - fs * 0.45);
          if (n.wantS && failIdx >= 0 && n.traceIdx === failIdx) {
            x += meas(fItal(tagSize()), n.hyp || '') * s + 8 * s;
            drawF(n.wantS, x, baseY, ruleSize() * s, C.crimsonBright);
          }
          return;
        }
        n.kids.forEach((k, i) => drawNode(k, x0 + b.kx[i], y0 + (b.kh - k.box.h), s, ox, oy));
        const rc = RULE_COLOR[n.rule] || C.ink;
        const barY = Math.round(Y(b.kh + BARGAP)) + 0.5;
        ctx.strokeStyle = colorFor(n, rc); ctx.globalAlpha = dimmed(n) ? 0.7 : 0.9; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(X(b.barL)), barY); ctx.lineTo(Math.round(X(b.barR)), barY); ctx.stroke();
        ctx.globalAlpha = 1;
        let lx = X(b.barR + LGAP);
        ctx.font = fUp(ruleSize() * s); ctx.fillStyle = colorFor(n, rc); ctx.textAlign = 'left';
        ctx.fillText(n.rule, lx, barY + ruleSize() * s * 0.36);
        lx += meas(fUp(ruleSize()), n.rule) * s + 1;
        if (n.tag) { ctx.font = fItal(tagSize() * s); ctx.fillStyle = dimmed(n) ? C.inkGhost : C.inkDim; ctx.fillText(n.tag, lx, barY - 1); }
        drawF(b.s, X(b.cx0), baseY, fs, colorFor(n, n.bad && failIdx >= 0 ? C.crimsonBright : C.ink));
      }
      function draw() {
        dirty = false;
        const Wc = Math.max(40, W || wrap.clientWidth || 300);
        const PADX = Wc < 420 ? 8 : 16, PADT = 12, PADB = 10;
        if (!data) { hc.size(Wc, Math.max(10, want)); hc.ctx.clearRect(0, 0, hc.w, hc.h); return false; }
        const b = layout(data.root);
        let s = Math.min(1, (Wc - PADX * 2) / Math.max(1, b.w));
        let cw = Wc;
        if (s < minScale) { s = minScale; cw = Math.ceil(b.w * s + PADX * 2); }
        const ch = Math.max(want, Math.ceil(b.h * s + PADT + PADB));
        hc.size(cw, ch);
        ctx.clearRect(0, 0, cw, ch);
        const ox = Math.max(PADX, (cw - b.w * s) / 2), oy = ch - PADB - b.h * s;
        ctx.textBaseline = 'alphabetic';
        drawNode(data.root, 0, 0, s, ox, oy);
        let anim = false;
        if (flareT >= 0) {
          const age = nowSec() - flareT;
          const a = REDUCED ? 0.5 : Math.max(0, 1 - age / 1.4);
          if (a > 0) {
            const cx = ox + (b.cx0 + (b.cx1 - b.cx0) / 2) * s, cy = oy + (b.h - LINE / 2) * s;
            ctx.globalAlpha = a * 0.55; ctx.globalCompositeOperation = 'lighter';
            glow.draw(ctx, cx, cy, Math.max(0.3, ((b.cx1 - b.cx0) * s) / 34) * (REDUCED ? 1 : 1 + 0.25 * (1 - a)));
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
            anim = !REDUCED;
          } else flareT = -1;
        }
        return anim;
      }
      return {
        set(term, formula, opts = {}) {
          data = term ? proofTree(term, formula) : null;
          goalId = opts.goalId ?? null;
          if (opts.minH != null) want = opts.minH;
          if (opts.label) hc.canvas.setAttribute('aria-label', opts.label);
          lit = Infinity; failIdx = -1; flareT = -1; dirty = true;
        },
        setLit(n) { if (lit !== n) { lit = n; dirty = true; } },
        setFail(i) { failIdx = i; dirty = true; },
        setHover(by) { if (hoverBy !== by) { hoverBy = by; dirty = true; } },
        flare() { flareT = nowSec(); dirty = true; },
        height(term, formula) {   // the canvas height a finished tree needs (keeps the page still while it grows)
          const d = proofTree(term, formula);
          const b = layout(d.root);
          const Wc = Math.max(40, W || wrap.clientWidth || 300);
          const s = Math.max(minScale, Math.min(1, (Wc - (Wc < 420 ? 16 : 32)) / Math.max(1, b.w)));
          return Math.ceil(b.h * s + 22);
        },
        // Redraw only on change; the QED flare keeps itself dirty while it fades
        // (and, under reduced motion, is drawn once, still).
        frame() { if (dirty) { const anim = draw(); if (anim) dirty = true; } },
        get el() { return wrap; },
        destroy() { ro.disconnect(); },
      };
    }

    /* =================== I · THE INSTRUMENT =================== */

    heading('i', 'the instrument');
    const quest = ui.questBanner(root, '');
    const lemmaRow = el('div', 'tel-lemmas', root);
    const ownRow = el('div', 'tel-cmdrow tel-ownrow', root);
    const own = el('input', 'tel-cmd', ownRow);
    own.type = 'text'; own.spellcheck = false; own.autocomplete = 'off';
    own.setAttribute('autocapitalize', 'off');
    own.placeholder = 'or state your own: A /\\ B -> B';
    own.setAttribute('aria-label', 'state a theorem of your own, using letters, ->, /\\ and \\/, then press Enter');
    const ownBtn = ui.button(ownRow, 'set it as the goal', () => useOwn(), { small: true });
    ownBtn.title = 'up to four letters and twelve connectives';
    const proofWrap = el('div', 'tel-proof', root);
    const goalsPane = el('div', 'tel-goals', proofWrap);
    const tacticsPane = el('div', 'tel-tactics', proofWrap);
    const cmdRow = el('div', 'tel-cmdrow', root);
    const cmd = el('input', 'tel-cmd', cmdRow);
    cmd.type = 'text';
    cmd.spellcheck = false;
    cmd.autocomplete = 'off';
    cmd.setAttribute('autocapitalize', 'off');
    cmd.placeholder = 'or type a line: cases h a b';
    cmd.setAttribute('aria-label', 'type a tactic line and press Enter');
    const careless = ui.toggle(cmdRow, {
      label: 'careless tactics', value: false,
      onChange: (v) => {
        audio.ensureAudio();
        tick(v ? 180 : 420, 0.14, 0.08, v ? 'sawtooth' : 'triangle');
        setMsg(v
          ? 'The tactic engine now lets exact close any goal with any hypothesis, and does not tell the kernel. Try exact b on lemma II, or storm the wall.'
          : 'The tactic engine checks every move again.', v ? 'prose err' : 'prose');
      },
    });
    careless.el.title = 'a deliberately broken tactic engine: exact stops checking types';
    const whyBtn = ui.button(cmdRow, 'why can’t it be proved?', () => revealWall(), { small: true });
    whyBtn.style.display = 'none';

    const msg = el('div', 'tel-msg', root);
    msg.setAttribute('aria-live', 'polite');
    const scriptLog = el('div', 'tel-script', root);
    const treeBox = el('div', 'tel-treebox', root);
    el('div', 'tel-sub', treeBox, 'your proof, as Gentzen would draw it');
    const tree = TreeView(treeBox, { label: 'natural-deduction tree of the proof so far' });
    el('div', 'tel-key', treeBox,
      `<span><b style="color:${C.gold}">intro</b> → λ · →I</span><span><b style="color:${C.azure}">apply</b> → application · →E</span>` +
      `<span><b style="color:${C.verdant}">split</b> → pair · ∧I</span><span><b style="color:${C.crimsonBright}">cases</b> → let, match · ∧E, ∨E</span>` +
      `<span><b style="color:${C.verdigris}">left, right</b> → inl, inr · ∨I</span><span><b style="color:${C.ink}">exact</b> → a hypothesis [A]</span>`);
    const kernelPane = el('div', 'tel-kernel', root);
    kernelPane.setAttribute('aria-live', 'polite');
    const termPane = el('div', 'tel-term', root);
    const wallPane = el('div', 'tel-wall', root);

    ui.caption(root,
      'Every tactic is a real inference rule, the goal panel is a real sequent, and the tree grows the way ' +
      'Gerhard Gentzen drew proofs in 1935. <code>exact</code>, <code>apply</code> and <code>cases</code> want a ' +
      'hypothesis: press the tactic, then choose one, or type the whole line. The word <em>tactic</em> is Robin ' +
      'Milner’s. In Edinburgh LCF (1979) proof strategies were functions in ML, a “Meta Language” designed for the ' +
      'purpose, and theorems an abstract type that only the inference rules could build: clever tactics above, a ' +
      'dull and trustworthy core below.');

    // --- state ---
    const OWN = { name: 'your own', statement: 'A -> A', blurb: '' };
    const ALL = [...LEMMAS, WALL, OWN];
    const WALL_IDX = LEMMAS.length, OWN_IDX = LEMMAS.length + 1;
    let lemmaIdx = 0;
    let states = [];        // undo stack of proof states
    let lines = [];         // tactic lines, parallel to states[1..]
    let armed = null;       // 'exact' | 'apply' | 'cases' | null
    const proved = new Set();
    const provedCount = () => [...proved].filter((i) => i < LEMMAS.length).length;
    let ceremony = null;    // the kernel's visible re-check, while it runs
    let userSwapScript = null;   // the visitor's own proof of lemma III, for section iv
    let wallTries = 0;
    const history = []; let histPos = 0;

    const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const lemmaBtns = ALL.slice(0, OWN_IDX).map((lem, i) => {
      const b = ui.button(lemmaRow, `${NUMERALS[i]} · ${lem.name}`, () => { audio.ensureAudio(); selectLemma(i); }, { small: true });
      if (i === WALL_IDX) { b.classList.add('wall'); b.title = 'Peirce’s law: true, and unprovable here'; }
      return b;
    });

    const tacticBtns = {};
    const TACTICS = [
      ['intro', 'assume the antecedent (→I)'],
      ['exact', 'close the goal with a hypothesis'],
      ['apply', 'reason backwards through an implication (→E)'],
      ['split', 'prove both halves of an ∧ (∧I)'],
      ['cases', 'take a hypothesis apart (∧E, ∨E)'],
      ['left', 'choose the left side of an ∨ (∨I₁)'],
      ['right', 'choose the right side of an ∨ (∨I₂)'],
    ];
    for (const [name, tip] of TACTICS) {
      const b = ui.button(tacticsPane, name, () => onTactic(name), { small: true });
      b.title = tip;
      b.dataset.tac = name;
      b.style.setProperty('--tc', TAC_COLOR[name]);
      tacticBtns[name] = b;
    }
    const undoBtn = ui.button(tacticsPane, '↶ undo', () => { audio.ensureAudio(); undo(); }, { small: true });
    const resetBtn = ui.button(tacticsPane, '⟲ restart', () => { audio.ensureAudio(); selectLemma(lemmaIdx); }, { small: true });
    undoBtn.title = 'take back the last tactic';
    resetBtn.title = 'start this lemma over';

    const state = () => states[states.length - 1];

    function selectLemma(i) {
      stopCeremony();
      lemmaIdx = i;
      const lem = ALL[i];
      const f = parseFormula(lem.statement);
      states = [startProof(f)];
      lines = [];
      wallTries = 0;
      disarm();
      kernelPane.classList.remove('show', 'refused');
      termPane.classList.remove('show', 'forged');
      wallPane.classList.remove('show');
      whyBtn.style.display = i === WALL_IDX ? '' : 'none';
      proofWrap.classList.remove('tel-locked');
      cmd.disabled = false;
      lemmaBtns.forEach((b, j) => {
        b.classList.toggle('active', j === i);
        b.classList.toggle('proved', proved.has(j));
        b.setAttribute('aria-pressed', String(j === i));
      });
      // Size the tree's canvas for the finished proof, so the page stays still while it grows.
      let minH = 150;
      if (i < LEMMAS.length) {
        const r = runScript(lem.statement, lem.script);
        if (r.ok) minH = Math.max(90, tree.height(r.term, f));
      }
      tree.set(state().term, f, { goalId: 0, minH, label: `natural-deduction tree: ${formulaToString(f)}, unfinished` });
      setMsg(lem.blurb, 'prose');
      renderQuest();
      renderProof();
    }

    function useOwn() {
      audio.ensureAudio();
      const src = own.value.trim();
      if (!src) { own.focus(); return; }
      if (/^(intro|exact|apply|split|cases|left|right)\b/.test(src)) {
        setMsg('That looks like a tactic. This box takes a statement to prove; tactics go in the line below the buttons.', 'prose err');
        return;
      }
      let st;
      try { st = ownStatement(src); }
      catch (e) { if (!e.clean) throw e; setMsg(`${e.message}. Use letters, ->, /\\ and \\/ (or →, ∧, ∨) and parentheses.`, 'err'); errorBuzz(); return; }
      OWN.statement = src;
      const bad = st.table.rows.find((r) => !r.value);
      OWN.blurb = bad
        ? `Not even classically true: with ${st.table.atoms.map((a) => `${a} ${bad.vals[a] ? 'true' : 'false'}`).join(', ')} it is false, so no proof exists here or anywhere.`
        : 'True in every row of its truth table. Whether this logic can build a proof is another question: the wall, VII, is one that it cannot.';
      selectLemma(OWN_IDX);
    }
    listen(own, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); useOwn(); } });

    function renderQuest() {
      const total = LEMMAS.length;
      if (lemmaIdx === WALL_IDX) {
        quest.set(`lemma VII · the wall · try <code>${esc(formulaToString(state().formula))}</code>: true in every row of its truth table`);
      } else if (lemmaIdx === OWN_IDX) {
        quest.set(`your own statement · prove <code>${esc(formulaToString(state().formula))}</code>, if it can be done`);
      } else if (provedCount() >= total) {
        quest.done('all six lemmas proved; the instrument is yours. Now try the wall, VII, or state a theorem of your own.');
      } else {
        quest.set(`lemma ${lemmaIdx + 1} of ${total} · prove <code>${esc(formulaToString(state().formula))}</code>` +
          (provedCount() ? ` · ${provedCount()} proved` : ''));
      }
    }

    function setMsg(text, cls) {
      msg.textContent = text;
      msg.className = 'tel-msg' + (cls ? ' ' + cls : '');
    }

    function renderProof() {
      goalsPane.textContent = '';
      const s = state();
      if (s.goals.length === 0) {
        el('div', 'tel-goal current', goalsPane, `<div class="tel-turnstile"><span class="tstile">⊢</span>no goals remain</div>`);
      }
      s.goals.forEach((g, gi) => {
        const d = el('div', 'tel-goal' + (gi === 0 ? ' current' : ' waiting'), goalsPane);
        if (gi === 0) {
          for (const [nm, f] of g.hyps) {
            const h = el('button', 'tel-hyp', d, `<b>${esc(nm)}</b> : ${esc(formulaToString(f))}`);
            h.type = 'button';
            h.dataset.name = nm;
            h.setAttribute('aria-label', `hypothesis ${nm} : ${formulaToString(f)}`);
            h.addEventListener('click', () => {
              if (armed) fireArmed(nm);
              else setMsg(`choose exact, apply or cases first, then the hypothesis ${nm}`, '');
            });
          }
          el('div', 'tel-turnstile', d, `<span class="tstile">⊢</span>${esc(formulaToString(g.target))}`);
        } else {
          d.innerHTML = `<span class="tstile" style="color:${C.goldDim}">⊢</span> ${esc(formulaToString(g.target))} <span style="color:${C.inkFaint}">(waits)</span>`;
        }
      });
      scriptLog.innerHTML = lines.length
        ? 'script · ' + lines.map((l, i) => `<span class="sl" data-by="${i}">${esc(l)}</span>`).join(' ; ')
        : '';
      tree.set(s.term, s.formula, { goalId: s.goals.length ? s.goals[0].id : null });
    }

    function tick(freq, level = 0.22, dur = 0.06, type = 'sine', when = null) {
      const actx = audio.getContext();
      if (!actx) return;
      audio.playTone(bus, { freq, dur, level, type, when: when ?? actx.currentTime });
    }

    function onTactic(name) {
      audio.ensureAudio();
      if (ceremony) return;
      if (armed === name) { disarm(); setMsg('', ''); return; }
      if (name === 'exact' || name === 'apply' || name === 'cases') {
        if (state().goals.length === 0) { setMsg('the proof is already complete', 'err'); return; }
        if (state().goals[0].hyps.length === 0) {
          setMsg(`${name}: the context is empty; introduce a hypothesis first`, 'err');
          errorBuzz();
          return;
        }
        disarm();
        armed = name;
        tacticBtns[name].classList.add('armed');
        root.classList.add('tel-armed');
        setMsg(`${name}: now choose a hypothesis (press ${name} again to cancel)`, '');
        tick(520, 0.15, 0.04);
        const first = goalsPane.querySelector('.tel-goal.current .tel-hyp');
        if (first && document.activeElement === tacticBtns[name]) first.focus();
        return;
      }
      disarm();              // a non-hypothesis tactic cancels any armed one
      runLine(name);
    }

    function disarm() {
      armed = null;
      Object.values(tacticBtns).forEach((b) => b.classList.remove('armed'));
      root.classList.remove('tel-armed');
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
      if (ceremony) return;
      try {
        const prev = state();
        const next = applyTactic(prev, line, { careless: careless.value });
        states.push(next);
        lines.push(canonicalLine(next.term, prev.step, line));
        const depth = Math.min(lines.length, 10);
        tick(420 + depth * 36, 0.2, 0.05, 'triangle');
        setMsg(next.goals.length === 0
          ? 'no goals remain; handing the term to the kernel…'
          : next.goals.length > 1
            ? `${next.goals.length} goals open; the first is yours`
            : 'one goal open', '');
        renderProof();
        if (next.done) beginCeremony();
      } catch (e) {
        if (!(e instanceof TacticError)) throw e;
        errorBuzz();
        if (lemmaIdx === WALL_IDX && ++wallTries >= 3) {
          setMsg(`${e.message}. Stuck? Every road here ends like this; ask why.`, 'err');
        } else setMsg(e.message, 'err');
      }
    }

    function undo() {
      if (ceremony) stopCeremony(true);
      disarm();
      kernelPane.classList.remove('show', 'refused');
      termPane.classList.remove('show', 'forged');
      proofWrap.classList.remove('tel-locked');
      cmd.disabled = false;
      if (states.length <= 1) { setMsg('nothing to undo', ''); return; }
      states.pop(); lines.pop();
      setMsg('', '');
      renderProof();
    }

    // typed tactic lines, with ↑/↓ history
    listen(cmd, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = cmd.value.trim();
        if (!v) return;
        history.push(v); histPos = history.length;
        cmd.value = '';
        disarm();
        runLine(v);
      } else if (e.key === 'ArrowUp' && history.length) {
        e.preventDefault(); histPos = Math.max(0, histPos - 1); cmd.value = history[histPos];
      } else if (e.key === 'ArrowDown' && history.length) {
        e.preventDefault(); histPos = Math.min(history.length, histPos + 1); cmd.value = history[histPos] || '';
      }
    });

    // hover a script line → its piece of the program and of the tree
    function hoverStep(by) {
      tree.setHover(by);
      scriptLog.querySelectorAll('.sl').forEach((s) => s.classList.toggle('hl', +s.dataset.by === by));
      termPane.querySelectorAll('.chs').forEach((s) => s.classList.toggle('hl', +s.dataset.by === by));
    }
    const overStep = (e) => { const t = e.target.closest('[data-by]'); hoverStep(t ? +t.dataset.by : -1); };
    listen(scriptLog, 'mouseover', overStep);
    listen(scriptLog, 'mouseleave', () => hoverStep(-1));
    listen(termPane, 'mouseover', overStep);
    listen(termPane, 'mouseleave', () => hoverStep(-1));

    /* ---- the QED ceremony: the kernel visibly re-checks the term ----
       Lines are revealed on the audio clock when sound is running, and on a
       performance clock otherwise, so a missing or suspended AudioContext
       can never stall the proof.                                          */

    const STEP = 0.14;
    function beginCeremony() {
      const s = state();
      let trace, failure = null;
      try {
        trace = checkTerm(s.term, [], s.formula);
      } catch (e) {
        if (!(e instanceof KernelError)) throw e;
        failure = e;
        trace = (e.trace || []).slice();
      }
      const shown = failure ? [...trace, { depth: 0, rule: 'REFUSED', detail: failure.message }] : trace;
      const offsets = [];
      let acc = 0;
      for (const ln of shown) { offsets.push(acc); acc += (ln.rule === 'QED' || ln.rule === 'REFUSED') ? STEP * 3 : STEP; }
      proofWrap.classList.add('tel-locked');
      cmd.disabled = true;
      kernelPane.classList.add('show');
      kernelPane.classList.remove('refused');
      kernelPane.innerHTML = `<div class="kline" style="color:${C.gold}">kernel: re-checking the finished term against ${esc(formulaToString(s.formula))} …</div>`;
      tree.setLit(0);
      tree.setFail(-1);
      const actx = audio.getContext();
      const c = {
        lines: shown, failure, failIdx: failure ? trace.length : -1, offsets, total: acc,
        shown: 0, useAudio: !!(actx && actx.state === 'running'), t0: null, scheduler: null, started: nowSec(),
      };
      ceremony = c;
      if (c.useAudio) {
        let i = 0;
        c.scheduler = audio.createScheduler((t) => {
          if (i >= c.lines.length) return null;
          if (c.t0 == null) c.t0 = t;
          const ln = c.lines[i];
          if (ln.rule === 'QED') {
            audio.playTone(bus, { freq: 523.25, dur: 0.32, level: 0.28, when: t });
            audio.playTone(bus, { freq: 659.25, dur: 0.32, level: 0.24, when: t + 0.09 });
            audio.playTone(bus, { freq: 783.99, dur: 0.45, level: 0.22, when: t + 0.18 });
          } else if (ln.rule === 'REFUSED') {
            audio.playTone(bus, { freq: 110, dur: 0.5, level: 0.2, type: 'sawtooth', when: t });
            audio.playTone(bus, { freq: 116.5, dur: 0.5, level: 0.16, type: 'sawtooth', when: t });
          } else {
            audio.playTone(bus, { freq: 620 + ln.depth * 60, dur: 0.05, level: 0.16, type: 'triangle', when: t });
          }
          i++;
          return i < c.lines.length ? c.t0 + c.offsets[i] : null;
        });
        c.scheduler.start(0.08);
      } else {
        c.t0 = nowSec() + 0.08;
      }
    }

    function appendKernelLine(ln) {
      const div = el('div', 'kline' + (ln.rule === 'QED' ? ' qed' : ln.rule === 'REFUSED' ? ' refused' : ''), kernelPane);
      div.innerHTML = `${'  '.repeat(ln.depth)}<span class="rule">${esc(ln.rule === 'REFUSED' ? '✗ refused' : ln.rule)}</span>  ${esc(ln.detail)}`;
      if (ln.rule === 'QED') {
        const t = el('span', 'tomb', div, '∎');
        requestAnimationFrame(() => t.classList.add('on'));
      }
    }

    function revealCeremony() {
      const c = ceremony;
      if (!c || c.t0 == null) return;
      const actx = audio.getContext();
      let now;
      if (c.useAudio && actx && actx.state === 'running' && nowSec() - c.started < c.total + 2) now = actx.currentTime;
      else {
        if (c.useAudio) { c.useAudio = false; if (c.scheduler) c.scheduler.stop(); c.t0 = nowSec() - c.total; }
        now = nowSec();
      }
      while (ceremony === c && c.shown < c.lines.length && c.t0 + c.offsets[c.shown] <= now) {
        const ln = c.lines[c.shown++];
        appendKernelLine(ln);
        tree.setLit(Math.min(c.shown, c.lines.length - 1));
        if (c.shown === c.lines.length) endCeremony(c);
      }
    }

    function endCeremony(c) {
      if (c.scheduler) c.scheduler.stop();
      ceremony = null;
      if (c.failure) refuseProof(c);
      else { tree.setLit(Infinity); tree.flare(); finishProof(); }
    }

    // The kernel already accepted; record the theorem and show the program.
    function finishProof() {
      const s = state();
      proved.add(lemmaIdx);
      if (lemmaIdx === 2) userSwapScript = lines.slice();
      if (lemmaBtns[lemmaIdx]) lemmaBtns[lemmaIdx].classList.add('proved');
      proofWrap.classList.remove('tel-locked');
      cmd.disabled = false;
      termPane.classList.add('show');
      termPane.classList.remove('forged');
      termPane.innerHTML =
        `<div class="tt-code">${termToHTML(s.term)} <span class="tt-type">: ${esc(formulaToString(s.formula))}</span></div>` +
        `<div class="tt-note">Here is your proof as a program. Every <b class="ck-intro">intro</b> became a λ, every ` +
        `<b class="ck-apply">apply</b> a function call, every <b class="ck-split">split</b> a pair, every ` +
        `<b class="ck-cases">cases</b> a match, every <b class="ck-lr">left</b> or <b class="ck-lr">right</b> an ` +
        `injection. You did not write it; you could not have avoided writing it. (Curry–Howard, in your own hand. ` +
        `Point at a line of the script to find its piece of the program.)</div>`;
      renderQuest();
      renderFoundationND();
      const next = LEMMAS.findIndex((_, j) => !proved.has(j));
      const what = lemmaIdx === OWN_IDX ? 'Your statement is a theorem' : `Lemma ${NUMERALS[lemmaIdx]} is a theorem`;
      setMsg(next >= 0
        ? `QED: the kernel accepts. ${what}. Next: ${NUMERALS[next]}, ${LEMMAS[next].name}.`
        : `QED: the kernel accepts. ${what}.`, 'good');
      tree.setLit(Infinity);
    }

    // The careless engine let a false step through; the kernel caught it.
    function refuseProof(c) {
      proofWrap.classList.remove('tel-locked');
      cmd.disabled = false;
      kernelPane.classList.add('refused');
      tree.setLit(c.failIdx);
      tree.setFail(c.failIdx);
      const s = state();
      termPane.classList.add('show', 'forged');
      termPane.innerHTML =
        `<div class="tt-code">${termToHTML(s.term)} <span class="tt-type">: ${esc(formulaToString(s.formula))}?</span></div>` +
        `<div class="tt-note">The tactics said yes; the kernel, which trusts nothing it has not re-derived, says ` +
        `no. This term does not have the type it claims, and nothing is proved. Undo the careless step, or turn ` +
        `careless tactics off.</div>`;
      setMsg(`The kernel refused: ${c.failure.message}.`, 'err');
    }

    // Abandon the staged reveal (pause, undo, a new lemma). A finished proof is
    // still credited, silently and at once; a refusal is still shown.
    function stopCeremony(quiet = false) {
      const c = ceremony;
      if (!c) return;
      ceremony = null;
      if (c.scheduler) c.scheduler.stop();
      proofWrap.classList.remove('tel-locked');
      cmd.disabled = false;
      if (quiet) return;
      for (let i = c.shown; i < c.lines.length; i++) appendKernelLine(c.lines[i]);
      c.shown = c.lines.length;
      if (c.failure) refuseProof(c);
      else if (state() && state().done) { tree.setLit(Infinity); finishProof(); }
    }

    /* ---- the wall: truth table and Kripke countermodel ---- */
    function revealWall() {
      audio.ensureAudio();
      const f = parseFormula(WALL.statement);
      const tt = truthTable(f);
      const M = WALL.model;
      const subs = subformulas(f);
      const mark = (v) => v ? '<span class="yes">✓</span>' : '<span class="no">✗</span>';
      const ttRows = tt.rows.map((r) =>
        `<tr>${tt.atoms.map((a) => `<td>${r.vals[a] ? 'T' : 'F'}</td>`).join('')}<td>${mark(r.value)}</td></tr>`).join('');
      const kRows = subs.map((g) =>
        `<tr><td class="f">${esc(formulaToString(g))}</td>${M.names.map((_, w) => `<td>${mark(kripkeForces(M, w, g))}</td>`).join('')}</tr>`).join('');
      const worlds =
        `<svg class="tw-worlds" viewBox="0 0 260 64" width="260" height="64" aria-hidden="true">` +
        `<defs><marker id="tel-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">` +
        `<path d="M0,0 L8,4 L0,8 z" fill="${C.goldDim}"/></marker></defs>` +
        `<circle cx="40" cy="30" r="17" fill="none" stroke="${C.goldDim}"/>` +
        `<circle cx="210" cy="30" r="17" fill="none" stroke="${C.gold}"/>` +
        `<line x1="60" y1="30" x2="188" y2="30" stroke="${C.goldDim}" marker-end="url(#tel-arrow)"/>` +
        `<text x="124" y="22" fill="${C.inkFaint}" font-size="11" text-anchor="middle" font-style="italic" font-family="${esc(SERIF)}">later, knowing more</text>` +
        `<text x="40" y="35" fill="${C.ink}" font-size="14" text-anchor="middle" font-family="${esc(SERIF)}">${M.names[0]}</text>` +
        `<text x="210" y="35" fill="${C.ink}" font-size="14" text-anchor="middle" font-family="${esc(SERIF)}">${M.names[1]}</text>` +
        `<text x="40" y="60" fill="${C.inkFaint}" font-size="11" text-anchor="middle" font-family="${esc(SERIF)}">nothing yet</text>` +
        `<text x="210" y="60" fill="${C.azure}" font-size="12" text-anchor="middle" font-style="italic" font-family="${esc(SERIF)}">A holds</text>` +
        `</svg>`;
      wallPane.innerHTML =
        `<div class="tw-grid">` +
        `<div><div class="tw-h">every row of the truth table: true</div>` +
        `<table><tr>${tt.atoms.map((a) => `<th>${a}</th>`).join('')}<th>${esc(formulaToString(f))}</th></tr>${ttRows}</table></div>` +
        `<div><div class="tw-h">two moments of knowledge: false at the first</div>${worlds}` +
        `<table><tr><th></th>${M.names.map((n) => `<th>${n}</th>`).join('')}</tr>${kRows}</table></div>` +
        `</div>` +
        `<p class="tw-note">Classically the law is a tautology. But the instrument’s logic is intuitionistic: to prove ` +
        `<i>A</i> it demands a construction of <i>A</i>, and truth may arrive late. In Saul Kripke’s semantics of 1965 ` +
        `knowledge only grows. At <i>w₀</i> nothing is known; at the later <i>w₁</i>, <i>A</i> is. Then <i>A → B</i> ` +
        `holds nowhere, so <i>(A → B) → A</i> holds at <i>w₀</i> without <i>A</i>, and Peirce’s law fails there. The ` +
        `semantics is sound, so no sequence of these tactics can ever reach the QED. Lean proves the law only by ` +
        `calling on its axiom of choice, from which Diaconescu’s theorem recovers the excluded middle. Every ` +
        `foundation has a horizon; this is the instrument’s.</p>`;
      wallPane.classList.add('show');
      tick(147, 0.18, 0.5, 'triangle');
      setMsg('Not a failure of effort: a countermodel, computed below, certifies that no proof exists here.', 'prose');
    }

    /* =================== II · THE UNREADABLE LIBRARY =================== */

    heading('ii', 'the unreadable library');
    const libControls = ui.controlRow(root);
    ui.select(libControls, {
      label: 'what to read',
      options: LIBRARY.map((c) => ({ value: c.id, label: c.label })),
      value: 'bpt',
      onChange: (v) => { audio.ensureAudio(); setCert(v); },
    });
    const libWrap = el('div', 'tel-libcv', root);
    libWrap.tabIndex = 0;
    libWrap.setAttribute('role', 'slider');
    libWrap.setAttribute('aria-label', 'the proof as a scrollbar: arrow keys turn one page, shift and arrow a thousand, Page Up and Page Down a million');
    const lib = makeCanvas(libWrap);
    const libGlow = cv.glowSprite(C.gold, 48);
    const libScale = el('div', 'tel-scale', root);
    const libInfo = ui.readout(root, '');
    ui.caption(root,
      'A scrollbar built to true scale. The top track is the whole text; each track below magnifies a window of ' +
      'the one above, a thousand times at a step, until single pages of three kilobytes can be seen. Drag any track ' +
      'to scrub at its own scale; click the library, then turn pages one at a time with the arrow keys or a wheel. ' +
      'The certificates are opaque but not unverified: checkers whose own correctness was proved in Coq and in ACL2 ' +
      'have confirmed the Pythagorean and Schur proofs.');

    let cert = LIBRARY.find((c) => c.id === 'bpt');
    let libStats = readingStats(cert.bytes);
    let page = 0;             // current page index (float; huge)
    let pagesTurned = 0;
    let libDirty = true;
    let lastWheelTick = 0, wheelAcc = 0;
    let libLayout = null;     // rows and geometry of the last draw (for hit-testing)

    function fmtLen(m) {
      const u = [['km', 1e3], ['m', 1], ['cm', 1e-2], ['mm', 1e-3], ['µm', 1e-6], ['nm', 1e-9], ['pm', 1e-12], ['fm', 1e-15]];
      for (const [name, f] of u) if (m >= f) { const v = m / f; return `${v >= 100 ? grp(v) : v.toPrecision(2)} ${name}`; }
      return `${sci(m)} m`;
    }
    function fmtRead(pages) {
      const hours = pages / 60, days = pages / 720, years = days / 365.25;
      if (pages < 60) { const m = Math.max(1, Math.round(pages)); return `${m} minute${m === 1 ? '' : 's'}`; }
      if (days < 1) return `${hours.toFixed(1)} hours`;
      if (years < 1) return `${Math.round(days)} days`;
      if (years < 10) return `${years.toFixed(1)} years`;
      return `${grp(years)} years`;
    }
    const trackW = () => Math.max(40, (libWrap.clientWidth || 300) - 2 * (libWrap.clientWidth < 420 ? 12 : 20));

    function setCert(id) {
      cert = LIBRARY.find((c) => c.id === id) || LIBRARY[3];
      libStats = readingStats(cert.bytes);
      page = Math.min(page, Math.max(0, libStats.pages - 1));
      libDirty = true;
      writeScale();
      updateLibInfo();
    }

    function writeScale() {
      const tw = trackW();
      const frac = 3000 / cert.bytes;
      const px = frac * tw;
      const metres = px * 0.0254 / 96;      // a CSS pixel is 1/96 inch
      const H2 = 2 * 5.29177e-11;           // a hydrogen atom, ≈ twice the Bohr radius
      let where;
      if (px >= 1) where = `about <span class="n">${px.toFixed(1)}</span> px, <span class="n">${fmtLen(metres)}</span>: you can see it`;
      else {
        where = `about <span class="n">${sci(px)}</span> px, or <span class="n">${fmtLen(metres)}</span>`;
        if (metres < H2) where += `, narrower than a hydrogen atom (about ${fmtLen(H2)} across)`;
        else if (metres >= 380e-9 && metres <= 750e-9) where += ', about one wavelength of visible light';
      }
      const km = libStats.trackKm;
      let track;
      if (km >= 1000) {
        const earth = km / 40075, moon = km / 384400;
        track = `<span class="n">${grp(km)} km</span>` + (moon >= 0.4 ? `, nearly half the distance to the Moon` : earth >= 0.4 ? `, nearly halfway around the planet` : '');
      } else track = `<span class="n">${fmtLen(km * 1000)}</span>`;
      libScale.innerHTML =
        `<p class="ts-thm">${esc(cert.line)}</p>` +
        `<p>The thumb, one 3 KB page at true scale, is <span class="n">${px >= 1 ? (frac * 100).toFixed(2) : sci(frac * 100)} %</span> of the track: on this screen ${where}.</p>` +
        `<p>A track giving each page one whole pixel would run ${track}. The <span class="n">${grp(Math.ceil(libStats.pages))}</span> pages would take <span class="n">${fmtRead(libStats.pages)}</span> at a page a minute, twelve hours a day.</p>` +
        `<p class="src">${cert.note}</p>`;
    }

    function updateLibInfo() {
      const left = Math.max(0, libStats.pages - Math.floor(page));
      libInfo.set(
        `page ${grp(Math.floor(page) + 1)} of ${grp(Math.ceil(libStats.pages))}` +
        ` · reading left: ${fmtRead(left)}` +
        ` · pages you actually turned: ${grp(pagesTurned)}`);
      libWrap.setAttribute('aria-valuemin', '1');
      libWrap.setAttribute('aria-valuemax', String(Math.ceil(libStats.pages)));
      libWrap.setAttribute('aria-valuenow', String(Math.floor(page) + 1));
      libWrap.setAttribute('aria-valuetext', `page ${grp(Math.floor(page) + 1)} of ${grp(Math.ceil(libStats.pages))}`);
    }

    function drawLibrary() {
      const W = Math.max(60, libWrap.clientWidth || 300);
      const narrow = W < 420;
      const PADX = narrow ? 12 : 20, TOP = 8, ROW = narrow ? 58 : 56, TRK = 12, CELLH = 22, LBL = 13;
      const tw = W - 2 * PADX, x0 = PADX;
      const total = libStats.pages;
      const rows = magnifierRows(total, Math.max(8, Math.floor(tw / 4.5)));
      const pg = Math.floor(page);
      // each row's window [a, a + span)
      const wins = rows.map((r) => {
        if (r.cells) {
          const n = Math.max(1, Math.round(r.span));
          const a = Math.max(0, Math.min(pg - Math.floor(n / 2), Math.max(0, Math.ceil(total) - n)));
          return { a, span: n, n };
        }
        const a = Math.max(0, Math.min(page + 0.5 - r.span / 2, total - r.span));
        return { a, span: r.span };
      });
      // The page cells never shrink below ~8 px: on a narrow screen they wrap
      // onto a second (or third) line instead, so every page stays a visible cell.
      const cellGrid = (n) => {
        const lines = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(tw / 8))));
        const cols = Math.max(1, Math.ceil(n / lines));
        const lineH = lines > 1 ? 16 : CELLH, gapY = 3;
        return { cols, lines, cw: tw / cols, lineH, gapY, th: lines * lineH + (lines - 1) * gapY };
      };
      const last = rows.length - 1;
      const lastTh = rows[last].cells ? cellGrid(wins[last].n).th : TRK;
      const H = TOP + last * ROW + LBL + 6 + lastTh + 30;
      lib.size(W, H);
      const ctx = lib.ctx;
      ctx.clearRect(0, 0, W, H);
      ctx.textBaseline = 'alphabetic';
      const serif = (s, it = false) => `${it ? 'italic ' : ''}${s}px ${SERIF}`;
      const mono = (s) => `${s}px ${MONO}`;
      const geo = [];
      rows.forEach((r, k) => {
        const y = TOP + k * ROW;
        const grid = r.cells ? cellGrid(wins[k].n) : null;
        const ty = y + LBL + 5, th = grid ? grid.th : TRK;
        geo.push({ y0: y, y1: ty + th + 6, ty, th, win: wins[k], cells: !!r.cells, grid });
        // labels
        const fs = narrow ? 11 : 12;
        const leftRuns = k === 0
          ? [{ t: 'the whole text', font: serif(fs, true), color: C.inkDim }]
          : [{ t: 'magnified ', font: serif(fs, true), color: C.inkDim }, { t: `×${grp(r.zoom)}`, font: mono(fs - 1), color: C.gold }];
        const n = r.cells ? wins[k].n : k === 0 ? Math.ceil(total) : r.span;
        const rightFull = [{ t: grp(n), font: mono(fs - 1), color: C.inkDim }, { t: r.cells ? (n === 1 ? ' page' : ' pages, one cell each') : k === 0 ? ' pages' : ' pages in view', font: serif(fs, true), color: C.inkFaint }];
        const rightShort = [{ t: grp(n), font: mono(fs - 1), color: C.inkDim }, { t: ' pp.', font: serif(fs, true), color: C.inkFaint }];
        const lw = runsWidth(ctx, leftRuns);
        const right = lw + runsWidth(ctx, rightFull) + 14 <= tw ? rightFull : rightShort;
        const rw = runsWidth(ctx, right);
        // knock the labels out of the zoom cone drawn above them
        ctx.fillStyle = C.bg;
        ctx.fillRect(x0 - 3, y + 1, lw + 6, LBL + 2);
        if (lw + rw + 10 <= tw) ctx.fillRect(x0 + tw - rw - 3, y + 1, rw + 6, LBL + 2);
        drawRuns(ctx, leftRuns, x0, y + LBL);
        if (lw + rw + 10 <= tw) drawRuns(ctx, right, x0 + tw, y + LBL, 'right');
        if (!grid) {
          // the track
          ctx.fillStyle = C.panel; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x0 + 0.5, ty + 0.5, Math.max(0, tw - 1), th, 4); else ctx.rect(x0 + 0.5, ty + 0.5, Math.max(0, tw - 1), th);
          ctx.fill(); ctx.stroke();
          // tick marks at tenths
          ctx.strokeStyle = 'rgba(232,226,208,0.07)';
          ctx.beginPath();
          for (let i = 1; i < 10; i++) { const tx = Math.round(x0 + (tw * i) / 10) + 0.5; ctx.moveTo(tx, ty + 3); ctx.lineTo(tx, ty + th - 2); }
          ctx.stroke();
          // where we are
          const px = x0 + ((page + 0.5 - wins[k].a) / wins[k].span) * tw;
          const mx = Math.round(Math.max(x0, Math.min(x0 + tw - 1, px))) + 0.5;
          ctx.strokeStyle = C.goldBright; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(mx, ty - 3); ctx.lineTo(mx, ty + th + 3); ctx.stroke();
        } else {
          const { cols, cw, lineH, gapY } = grid;
          const cellAt = (i) => ({ x: x0 + (i % cols) * cw, y: ty + Math.floor(i / cols) * (lineH + gapY) });
          const wpx = Math.max(1, Math.round(cw) - (cw > 4 ? 2 : 1));
          let onCell = null;
          for (let i = 0; i < wins[k].n; i++) {
            const p = wins[k].a + i;
            if (p >= Math.ceil(total)) break;
            const { x: cx, y: cy } = cellAt(i);
            const on = p === pg;
            ctx.fillStyle = on ? 'rgba(201,169,89,0.85)' : (p % 10 === 9 ? '#1d2130' : C.panel);
            ctx.fillRect(Math.round(cx) + 0.5, cy + 0.5, wpx, lineH);
            if (cw > 5) { ctx.strokeStyle = on ? C.goldBright : C.line; ctx.lineWidth = 1; ctx.strokeRect(Math.round(cx) + 0.5, cy + 0.5, Math.max(0, Math.round(cw) - 2), lineH); }
            if (on) onCell = { cx, cy };
          }
          if (onCell) {
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
            libGlow.draw(ctx, onCell.cx + cw / 2, onCell.cy + lineH / 2, Math.max(0.4, Math.min(1.4, cw / 16)));
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          }
          // label the page you are on, under its column
          const ci = Math.max(0, pg - wins[k].a);
          const cx = x0 + ((ci % cols) + 0.5) * cw;
          const lab = [{ t: 'page ', font: serif(12, true), color: C.inkDim }, { t: grp(pg + 1), font: mono(11), color: C.goldBright }];
          const lwid = runsWidth(ctx, lab);
          drawRuns(ctx, lab, Math.max(x0 + lwid / 2, Math.min(x0 + tw - lwid / 2, cx)), ty + th + 17, 'center');
        }
        // the zoom cone down to the next row
        if (k < rows.length - 1) {
          const nx = wins[k + 1];
          const xa = x0 + ((nx.a - wins[k].a) / wins[k].span) * tw;
          const xb = Math.max(xa + 1, x0 + ((nx.a + nx.span - wins[k].a) / wins[k].span) * tw);
          const yTop = ty + th + 1, yBot = TOP + (k + 1) * ROW + LBL + 4;
          const g = ctx.createLinearGradient(0, yTop, 0, yBot);
          g.addColorStop(0, 'rgba(201,169,89,0.20)');
          g.addColorStop(1, 'rgba(201,169,89,0.035)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(xa, yTop); ctx.lineTo(xb, yTop); ctx.lineTo(x0 + tw, yBot); ctx.lineTo(x0, yBot); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(138,116,64,0.55)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xa, yTop); ctx.lineTo(x0 + 0.5, yBot); ctx.moveTo(xb, yTop); ctx.lineTo(x0 + tw - 0.5, yBot); ctx.stroke();
        }
      });
      libLayout = { rows, geo, x0, tw };
    }

    function turnTo(p, single) {
      const np = Math.max(0, Math.min(Math.ceil(libStats.pages) - 1, p));
      if (Math.floor(np) === Math.floor(page) && np === page) return false;
      page = np;
      if (single) pagesTurned++;
      libDirty = true;
      updateLibInfo();
      return true;
    }
    function pageClick(dir) {
      const now = performance.now();
      if (now - lastWheelTick > 70) {
        lastWheelTick = now;
        audio.ensureAudio();
        const actx = audio.getContext();
        if (actx) audio.drums.wood(bus, actx.currentTime, { level: 0.3, pitch: dir > 0 ? 980 : 780 });
      }
    }

    // interactions: drag a track to scrub at its scale; tap a cell; keys; wheel when focused
    let drag = null;
    listen(lib.canvas, 'pointerdown', (e) => {
      libWrap.focus({ preventScroll: true });
      if (!libLayout) return;
      const r = lib.canvas.getBoundingClientRect();
      const y = e.clientY - r.top;
      let row = libLayout.geo.findIndex((g) => y >= g.y0 && y < g.y1 + 8);
      if (row < 0) row = y < libLayout.geo[0].y0 ? 0 : libLayout.geo.length - 1;
      drag = { row, x: e.clientX, x0: e.clientX, id: e.pointerId, moved: false };
      try { lib.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    listen(lib.canvas, 'pointermove', (e) => {
      if (!drag || !libLayout) return;
      const dx = e.clientX - drag.x; drag.x = e.clientX;
      if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
      const g = libLayout.geo[drag.row];
      if (!g) return;
      turnTo(page + (dx / libLayout.tw) * (g.grid ? g.grid.cols : g.win.span), false);
    });
    const libUp = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      try { lib.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      audio.ensureAudio();
      const g = libLayout && libLayout.geo[d.row];
      if (!d.moved && g && g.cells) {
        const r = lib.canvas.getBoundingClientRect();
        const { cols, cw, lineH, gapY, lines } = g.grid;
        const col = Math.floor((e.clientX - r.left - libLayout.x0) / cw);
        const line = Math.max(0, Math.min(lines - 1, Math.floor((e.clientY - r.top - g.ty) / (lineH + gapY))));
        const i = col >= 0 && col < cols ? line * cols + col : -1;
        if (i >= 0 && i < g.win.n) {
          const target = g.win.a + i;
          const single = Math.abs(target - Math.floor(page)) === 1;
          if (turnTo(target, single)) pageClick(target > page ? 1 : -1);
        }
        return;
      }
      const actx = audio.getContext();
      if (actx && d.moved) audio.drums.thock(bus, actx.currentTime, { level: 0.3 });
    };
    listen(lib.canvas, 'pointerup', libUp);
    listen(lib.canvas, 'pointercancel', libUp);
    listen(libWrap, 'keydown', (e) => {
      let d = 0, single = false;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { d = e.shiftKey ? 1000 : 1; single = !e.shiftKey; }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { d = e.shiftKey ? -1000 : -1; single = !e.shiftKey; }
      else if (e.key === 'PageDown') d = 1e6;
      else if (e.key === 'PageUp') d = -1e6;
      else if (e.key === 'Home') { e.preventDefault(); turnTo(0, false); return; }
      else if (e.key === 'End') { e.preventDefault(); turnTo(libStats.pages - 1, false); return; }
      if (!d) return;
      e.preventDefault();
      if (turnTo(Math.floor(page) + d, single)) pageClick(d);
    });
    // The wheel turns pages only while the library has focus (a click gives it),
    // or for sideways swipes, so it never hijacks the reader's scrolling.
    listen(lib.canvas, 'wheel', (e) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (document.activeElement !== libWrap && !sideways) return;
      const delta = sideways ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      wheelAcc += e.deltaMode === 1 ? delta * 40 : delta;
      while (Math.abs(wheelAcc) >= 50) {
        const dir = wheelAcc > 0 ? 1 : -1;
        wheelAcc -= dir * 50;
        if (turnTo(Math.floor(page) + dir, true)) pageClick(dir);
      }
    }, { passive: false });
    let libW = 0;
    const libRO = new ResizeObserver(() => { const w = libWrap.clientWidth; if (Math.abs(w - libW) > 0.5) { libW = w; libDirty = true; writeScale(); } });
    libRO.observe(libWrap);
    cleanups.push(() => libRO.disconnect());
    setCert('bpt');

    /* =================== III · THE TRUST LADDER =================== */

    heading('iii', 'the trust ladder');
    const trustControls = ui.controlRow(root);
    ui.select(trustControls, {
      label: 'landmark',
      options: TRUST.map((c) => ({ value: c.id, label: c.label })),
      value: TRUST[0].id,
      onChange: (v) => { audio.ensureAudio(); renderTrust(v); },
    });
    const trustEl = el('div', 'tel-trust', root);
    const verdictEl = el('div', 'tel-verdict', root);
    verdictEl.setAttribute('aria-live', 'polite');
    ui.caption(root,
      'Press any link to doubt it, and everything that hangs below it falls. The journal routes ask you to trust ' +
      'people you have never met reading pages you never will; the machine routes ask for a statement, a kernel, ' +
      'a compiler and physics. Count the links, and the machine chains are not always shorter. Weigh them, and ' +
      'they are lighter: for Kepler, a kernel of a few hundred lines in place of a panel of twelve referees, and ' +
      'links that anyone who doubts them can run again.');

    const KIND_COLOR = { people: C.azure, program: C.inkDim, kernel: C.gold, axioms: C.goldDim, silicon: C.inkFaint };
    const KIND_WORD = { people: 'people', program: 'program', kernel: 'kernel', axioms: 'axioms', silicon: 'silicon' };
    const SHACKLE = `<svg viewBox="0 0 16 24" width="16" height="24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5">` +
      `<ellipse cx="8" cy="7" rx="4" ry="6.5"/><ellipse class="lower" cx="8" cy="17" rx="4" ry="6.5"/></g></svg>`;
    let currentTrust = TRUST[0];
    let routeState = [];

    function renderTrust(id) {
      currentTrust = TRUST.find((c) => c.id === id) || TRUST[0];
      trustEl.textContent = '';
      routeState = currentTrust.routes.map((r) => {
        const col = el('div', `tel-route ${r.kind}`, trustEl);
        el('div', 'tr-h', col, `<span class="tr-kind">${r.kind} route</span><span class="tr-who">${esc(r.title)}</span>`);
        const rs = { route: r, doubted: new Set(), links: [], shackles: [], weight: null };
        if (r.quote) {
          el('blockquote', 'tr-quote', col, `${esc(r.quote)}<cite>${esc(r.cite)}</cite>`);
          return rs;
        }
        el('div', 'tr-anchor', col).setAttribute('aria-hidden', 'true');
        const ol = el('ol', 'tr-chain', col);
        r.links.forEach(([what, kind, size], i) => {
          const sh = el('li', 'tr-shackle', ol, SHACKLE);
          sh.setAttribute('aria-hidden', 'true');
          rs.shackles.push(sh);
          const li = el('li', null, ol);
          const b = el('button', 'tel-link', li,
            `<span class="lk-what">${esc(what)}</span><span class="lk-meta"><span class="lk-size">${size ? esc(size) : ''}</span>` +
            `<span class="lk-kind">${KIND_WORD[kind] || kind}</span></span>`);
          b.type = 'button';
          b.style.setProperty('--kc', KIND_COLOR[kind] || C.inkDim);
          b.setAttribute('aria-pressed', 'false');
          b.title = 'doubt this link';
          b.addEventListener('click', () => toggleDoubt(rs, i));
          rs.links.push(b);
        });
        const shW = el('div', 'tr-shackle', col, SHACKLE);
        shW.setAttribute('aria-hidden', 'true');
        rs.shackles.push(shW);
        rs.weight = el('div', 'tr-weight', col, '∎ the theorem');
        if (r.bulk) el('div', 'tr-bulk', col, esc(r.bulk));
        return rs;
      });
      syncTrust();
    }

    function toggleDoubt(rs, i) {
      audio.ensureAudio();
      if (rs.doubted.has(i)) rs.doubted.delete(i); else rs.doubted.add(i);
      const actx = audio.getContext();
      if (actx) {
        if (rs.doubted.has(i)) audio.playTone(bus, { freq: 130, dur: 0.2, level: 0.2, type: 'sawtooth', when: actx.currentTime });
        else audio.drums.rim(bus, actx.currentTime, { level: 0.35 });
      }
      syncTrust();
    }

    function syncTrust() {
      const fallenRoutes = [];
      const doubtedNames = [];
      for (const rs of routeState) {
        if (!rs.links.length) continue;
        const first = rs.doubted.size ? Math.min(...rs.doubted) : Infinity;
        rs.links.forEach((b, i) => {
          b.setAttribute('aria-pressed', String(rs.doubted.has(i)));
          b.classList.toggle('fallen', i > first);
        });
        // shackle i hangs link i from the one above; the last one holds the theorem
        rs.shackles.forEach((s, i) => {
          s.classList.toggle('broken', i > 0 && i - 1 >= first && rs.doubted.has(i - 1));
          s.classList.toggle('fallen', i > first + 1);
        });
        rs.weight.classList.toggle('fallen', first !== Infinity);
        rs.weight.textContent = first !== Infinity ? '∎ the theorem, unsupported' : '∎ the theorem';
        if (first !== Infinity) {
          fallenRoutes.push(rs.route.kind);
          [...rs.doubted].sort((a, b) => a - b).forEach((i) => doubtedNames.push(`“${rs.route.links[i][0]}”`));
        }
      }
      if (!fallenRoutes.length) {
        const machine = routeState.find((r) => r.route.kind === 'machine' && r.links.length);
        const journal = routeState.find((r) => r.route.kind === 'journal' && r.links.length);
        verdictEl.textContent = machine && journal
          ? `${journal.links.length} links on the journal route, ${machine.links.length} on the machine route. Every link holds; the theorem stands.`
          : machine ? `${machine.links.length} links on the machine route, and anyone who doubts one can inspect it or run it again. The theorem stands.` : 'The theorem stands.';
        verdictEl.classList.remove('down');
      } else {
        const standing = routeState.filter((r) => r.links.length && !fallenRoutes.includes(r.route.kind));
        const falls = fallenRoutes.length > 1 ? 'both routes fall' : `the ${fallenRoutes[0]} route falls`;
        verdictEl.textContent = `You doubt ${doubtedNames.join(', ')}: ${falls}` +
          (standing.length ? `, and only the ${standing[0].route.kind} route still holds the theorem up.` : ', and nothing else holds the theorem up.');
        verdictEl.classList.add('down');
      }
    }
    renderTrust(TRUST[0].id);

    /* =================== IV · ONE STATEMENT, FOUR FOUNDATIONS =================== */

    heading('iv', 'one statement, four foundations');
    const tabRow = el('div', 'tel-tabs', root);
    tabRow.setAttribute('role', 'tablist');
    const foundEl = el('div', 'tel-found', root);
    foundEl.setAttribute('role', 'tabpanel');
    const fTitle = el('h4', null, foundEl);
    const ndTreeHost = el('div', null, foundEl);
    const ndTree = TreeView(ndTreeHost, { base: 18, minH: 80, label: 'natural-deduction tree of the swap lemma' });
    const fPre = el('pre', null, foundEl);
    const fNote = el('div', 'fnote', foundEl);
    ui.caption(root,
      'The swap lemma you proved above, spoken in four languages. In homotopy type theory the same equivalence ' +
      'becomes, by the univalence axiom, a literal equality of types: Voevodsky’s answer to the question of what ' +
      'proof should rest on. Whether it is the answer is a live argument, flagged below where it belongs.');

    let foundTab = 'nd';
    function ndContent() {
      const scr = (userSwapScript && userSwapScript.length) ? userSwapScript : LEMMAS[2].script;
      let r = runScript(LEMMAS[2].statement, scr);
      if (!r.ok) r = runScript(LEMMAS[2].statement, LEMMAS[2].script);
      return {
        term: r.term,
        body: `tactics   ${scr.join(' ; ')}\nterm      ${r.termString}   ✓ the kernel accepts`,
        note: (userSwapScript
          ? 'This is your own proof from the instrument, re-checked by the kernel just now. '
          : 'Prove lemma III above and this panel will show your proof instead of ours. ') +
          'Gentzen, 1935: “The introductions represent, as it were, the ‘definitions’ of the symbols concerned, and ' +
          'the eliminations are no more, in the final analysis, than the consequences of these definitions.”',
      };
    }
    function renderFoundationND() { if (foundTab === 'nd') showFoundation('nd'); }
    function showFoundation(id) {
      const f = FOUNDATIONS.find((x) => x.id === id) || FOUNDATIONS[0];
      foundTab = f.id;
      foundTabs.forEach((b, i) => {
        const on = FOUNDATIONS[i].id === f.id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      fTitle.textContent = f.title;
      if (f.id === 'nd') {
        const c = ndContent();
        fPre.classList.remove('code');
        ndTreeHost.style.display = '';
        ndTree.set(c.term, parseFormula(LEMMAS[2].statement), { minH: 80 });
        fPre.textContent = c.body;
        fNote.textContent = c.note;
      } else {
        ndTreeHost.style.display = 'none';
        fPre.classList.toggle('code', !!f.code);
        fPre.textContent = f.body || '';
        fNote.textContent = f.note || '';
      }
    }
    const foundTabs = FOUNDATIONS.map((f) => {
      const b = ui.button(tabRow, f.tab, () => { audio.ensureAudio(); tick(600, 0.12, 0.04); showFoundation(f.id); }, { small: true });
      b.setAttribute('role', 'tab');
      return b;
    });
    showFoundation('nd');

    /* =================== V · LABELED SPECULATION =================== */

    ui.speculationPanel(root, `
      <p><strong>The oracle problem.</strong> Nothing in the definition of “theorem” requires a
      narrative. The 200-terabyte certificates are fully verified and fully opaque, and as
      machine-generated mathematics grows, verified truth may outrun human understanding for good.
      Is a theorem <em>known</em> if no one can say why it is true? The kernel says yes; the essay
      tradition this site belongs to says no; both cannot keep winning.</p>
      <p><strong>The composer.</strong> A mathematician who states the theorem, shapes the
      abstractions, and lets machines execute the passage-work is doing what composers have always
      done with orchestras: Movement II’s harmony, one level up. On this scenario the profession does
      not shrink; it changes instruments.</p>
      <p><strong>Voevodsky’s answer.</strong> In 1999–2000, lecturing at the Institute for Advanced
      Study while Pierre Deligne took notes and checked every step, Vladimir Voevodsky found that the
      proof of a key lemma in a paper he had written there in 1992–93 contained a mistake, and that
      the lemma as stated could not be salvaged; groups of mathematicians had studied the paper in
      seminars since 1993 without noticing. Looking for a practical proof assistant around 2000, he
      recalled, he “could not find any”. He had concluded that “the only real long-term solution”
      was to use computers to verify mathematical reasoning, and he went on to build univalent
      foundations: mathematics in which equality is a path and
      equivalent structures are identical. The formal systems exist and run today. The further claim,
      that this will <em>replace</em> set theory as the ground floor of mathematics, is open
      advocacy, not fact, and mathematicians of equal rank stand on both sides of it.</p>
    `, 'three futures, offered as scenarios, not predictions');

    ui.caption(root,
      'Walls no theory can cross, tunnels no one dug, and now instruments that outsee their makers. Before the ' +
      'last question, one more descent: from the horizon back down to the world, to see what all this ' +
      'mathematics does for a living.');

    /* ---------- the loop: ceremony reveal, tree and library redraws ---------- */

    const loop = cv.rafLoop(() => {
      if (ceremony) revealCeremony();
      tree.frame();
      if (foundTab === 'nd') ndTree.frame();
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
        stopCeremony(true);
        bus.dispose();
        tree.destroy();
        ndTree.destroy();
        for (const f of cleanups) { try { f(); } catch { /* ignore */ } }
        root.remove();
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
  // v2 additions
  termToHTML, proofTree, truthTable, kripkeForces, subformulas, WALL,
  magnifierRows, pythagoreanTriples, sci, canonicalLine, ownStatement,
};
