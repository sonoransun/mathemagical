// I — The Two Tools
// Euclid's construction game: unmarked straightedge + collapsing compass.
// Constructions are stored as a dependency graph (every object knows its
// parents and the operation that made it), which buys three things at once:
// a proof transcript in Euclid's idiom, cheap undo, and honest goal-checking —
// a quest is verified by re-instantiating the whole construction from jittered
// seed points and re-checking numerically, so a lucky drawing never passes.
//
// The geometry kernel below is pure (no DOM) and exported via _test.

/* ================= geometry kernel (pure) ================= */

const LABELS = 'ABCDEFGHKLMNOPQRSTUVWXYZ'; // Heath's diagrams skip I and J

function autoLabel(i) {
  return LABELS[i % LABELS.length] + '′'.repeat(Math.floor(i / LABELS.length));
}

function newConstruction() {
  return { steps: [], byId: new Map(), nextId: 1, labelPtr: 0 };
}

function addStep(con, step) {
  step.id = con.nextId++;
  con.steps.push(step);
  con.byId.set(step.id, step);
  return step.id;
}

// A free point: a seed. `given` marks the quest's fixed data (drawn gold).
function addFree(con, x, y, opts = {}) {
  const hasLabel = opts.label != null;
  return addStep(con, {
    op: 'free', kind: 'pt', x, y,
    label: hasLabel ? opts.label : autoLabel(con.labelPtr++),
    autoLabel: !hasLabel, given: !!opts.given, parents: [],
  });
}

// The straightedge: the (produced) line through two points. [Post. 1, 2]
function addLine(con, p1, p2, opts = {}) {
  return addStep(con, { op: 'line', kind: 'line', parents: [p1, p2], given: !!opts.given });
}

// The compass: circle with centre `c` through point `t`. It stores no radius —
// only the two point ids — so it collapses whenever its parents move. [Post. 3]
function addCircle(con, c, t, opts = {}) {
  return addStep(con, { op: 'circle', kind: 'circle', parents: [c, t], given: !!opts.given });
}

// Canonical parent order for an intersection, so branch indices are stable:
// line before circle; otherwise ascending id.
function normalizePair(con, id1, id2) {
  const k1 = con.byId.get(id1).kind, k2 = con.byId.get(id2).kind;
  if (k1 === 'circle' && k2 === 'line') return [id2, id1];
  if (k1 === k2 && id1 > id2) return [id2, id1];
  return [id1, id2];
}

// A derived point: branch `b` of the intersection of two curves.
function addMeet(con, o1, o2, branch) {
  const [p1, p2] = normalizePair(con, o1, o2);
  return addStep(con, {
    op: 'meet', kind: 'pt', parents: [p1, p2], branch,
    label: autoLabel(con.labelPtr++), autoLabel: true,
  });
}

function undoLast(con) {
  const s = con.steps.pop();
  if (!s) return null;
  con.byId.delete(s.id);
  if (s.autoLabel) con.labelPtr--;
  return s;
}

function labelOf(con, id) { return con.byId.get(id).label; }
function lineName(con, id) {
  const s = con.byId.get(id);
  return labelOf(con, s.parents[0]) + labelOf(con, s.parents[1]);
}

/* ---------- intersection routines ---------- */

// Line through (ax,ay)-(bx,by) × line through (cx,cy)-(dx,dy).
// Returns {x, y} or null when parallel.
function intersectLineLine(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const denom = rx * sy - ry * sx;
  const mag = Math.hypot(rx, ry) * Math.hypot(sx, sy);
  if (Math.abs(denom) <= 1e-12 * (mag || 1)) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / denom;
  return { x: ax + t * rx, y: ay + t * ry };
}

// Line through A-B × circle (cx, cy, r). 0, 1 (tangent) or 2 points,
// ordered by the line parameter t (P = A + t·(B−A)) — a stable branch order.
function intersectLineCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a <= 0) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  const tang = 1e-12 * a * (r * r + 1);
  if (disc < -tang) return [];
  if (disc <= tang) {
    const t = -b / (2 * a);
    return [{ x: ax + t * dx, y: ay + t * dy }];
  }
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  return [
    { x: ax + t1 * dx, y: ay + t1 * dy },
    { x: ax + t2 * dx, y: ay + t2 * dy },
  ];
}

// Circle × circle. Branch 0 lies to the LEFT of the directed line from
// centre 1 to centre 2 — stable under small perturbations of the parents.
function intersectCircleCircle(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d <= 1e-12 * (r1 + r2 + 1)) return [];           // concentric: none (or all)
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  let h2 = r1 * r1 - a * a;
  const tang = 1e-12 * (r1 * r1 + 1);
  if (h2 < -tang) return [];
  if (h2 < 0) h2 = 0;
  const h = Math.sqrt(h2);
  const ux = dx / d, uy = dy / d;
  const mx = x1 + a * ux, my = y1 + a * uy;
  if (h <= 1e-12 * (r1 + 1)) return [{ x: mx, y: my }]; // tangent
  return [
    { x: mx - h * uy, y: my + h * ux },                 // + perpendicular (left)
    { x: mx + h * uy, y: my - h * ux },                 // − perpendicular (right)
  ];
}

function intersectEval(e1, e2) {
  if (e1.kind === 'line' && e2.kind === 'line') {
    const p = intersectLineLine(e1.x1, e1.y1, e1.x2, e1.y2, e2.x1, e2.y1, e2.x2, e2.y2);
    return p ? [p] : [];
  }
  if (e1.kind === 'line' && e2.kind === 'circle') {
    return intersectLineCircle(e1.x1, e1.y1, e1.x2, e1.y2, e2.cx, e2.cy, e2.r);
  }
  if (e1.kind === 'circle' && e2.kind === 'circle') {
    return intersectCircleCircle(e1.cx, e1.cy, e1.r, e2.cx, e2.cy, e2.r);
  }
  return [];
}

/* ---------- replay: instantiate the graph from seed coordinates ---------- */

// evaluate(con, override?) -> Map(id -> evaluated object).
// override: Map(freePointId -> {x, y}) replaces seed coordinates, so the same
// construction can be re-instantiated anywhere — the heart of goal-checking.
function evaluate(con, override = null) {
  const ev = new Map();
  for (const s of con.steps) {
    let out;
    if (s.op === 'free') {
      const o = override ? override.get(s.id) : null;
      out = { kind: 'pt', x: o ? o.x : s.x, y: o ? o.y : s.y, ok: true };
    } else if (s.op === 'line') {
      const p = ev.get(s.parents[0]), q = ev.get(s.parents[1]);
      const ok = !!(p && q && p.ok && q.ok) && Math.hypot(q.x - p.x, q.y - p.y) > 1e-9;
      out = { kind: 'line', x1: p ? p.x : 0, y1: p ? p.y : 0, x2: q ? q.x : 0, y2: q ? q.y : 0, ok };
    } else if (s.op === 'circle') {
      const c = ev.get(s.parents[0]), t = ev.get(s.parents[1]);
      const r = (c && t) ? Math.hypot(t.x - c.x, t.y - c.y) : 0;
      const ok = !!(c && t && c.ok && t.ok) && r > 1e-9;
      out = { kind: 'circle', cx: c ? c.x : 0, cy: c ? c.y : 0, r, ok };
    } else { // meet
      const e1 = ev.get(s.parents[0]), e2 = ev.get(s.parents[1]);
      if (!e1 || !e2 || !e1.ok || !e2.ok) {
        out = { kind: 'pt', x: 0, y: 0, ok: false };
      } else {
        const pts = intersectEval(e1, e2);
        if (pts.length === 0) out = { kind: 'pt', x: 0, y: 0, ok: false };
        else {
          const p = pts[Math.min(s.branch, pts.length - 1)];
          out = { kind: 'pt', x: p.x, y: p.y, ok: Number.isFinite(p.x) && Number.isFinite(p.y) };
        }
      }
    }
    ev.set(s.id, out);
  }
  return ev;
}

/* ---------- jittered verification ---------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Base evaluation + `trials` evaluations with every free point jittered.
function evalSets(con, { trials = 4, mag = 0.06, seed = 101 } = {}) {
  const sets = [evaluate(con)];
  const rng = mulberry32(seed + con.steps.length * 7919);
  for (let i = 0; i < trials; i++) {
    const ov = new Map();
    for (const s of con.steps) {
      if (s.op === 'free') {
        ov.set(s.id, { x: s.x + (rng() * 2 - 1) * mag, y: s.y + (rng() * 2 - 1) * mag });
      }
    }
    sets.push(evaluate(con, ov));
  }
  return sets;
}

const dd = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

function distToLine(le, x, y) {
  const dx = le.x2 - le.x1, dy = le.y2 - le.y1;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return Infinity;
  return Math.abs(dx * (y - le.y1) - dy * (x - le.x1)) / L;
}

// Does some drawn line pass through every point in ids (within tolAbs)?
function lineThroughAll(con, ev, ids, tolAbs) {
  for (const s of con.steps) {
    if (s.op !== 'line') continue;
    const le = ev.get(s.id);
    if (!le || !le.ok) continue;
    let all = true;
    for (const pid of ids) {
      const pe = ev.get(pid);
      if (!pe || !pe.ok || distToLine(le, pe.x, pe.y) > tolAbs) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

const pointIds = (con) => con.steps.filter((s) => s.kind === 'pt').map((s) => s.id);
const lineIds = (con) => con.steps.filter((s) => s.op === 'line').map((s) => s.id);

// Goal: point C with CA = CB = AB, joined to A and to B, in EVERY eval set.
function findEquilateral(con, aId, bId, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const sets = evalSets(con, opts);
  outer: for (const cid of pointIds(con)) {
    if (cid === aId || cid === bId) continue;
    for (const ev of sets) {
      const A = ev.get(aId), B = ev.get(bId), C = ev.get(cid);
      if (!A?.ok || !B?.ok || !C?.ok) continue outer;
      const ab = dd(A, B), s = Math.max(ab, 1e-9);
      if (Math.abs(dd(C, A) - ab) > tol * s || Math.abs(dd(C, B) - ab) > tol * s) continue outer;
      if (!lineThroughAll(con, ev, [aId, cid], tol * s) ||
          !lineThroughAll(con, ev, [bId, cid], tol * s)) continue outer;
    }
    return cid;
  }
  return null;
}

// Goal: point M on AB with AM = MB. (AM + MB = AB forces collinear-between.)
function findMidpoint(con, aId, bId, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const sets = evalSets(con, opts);
  outer: for (const mid of pointIds(con)) {
    if (mid === aId || mid === bId) continue;
    for (const ev of sets) {
      const A = ev.get(aId), B = ev.get(bId), M = ev.get(mid);
      if (!A?.ok || !B?.ok || !M?.ok) continue outer;
      const ab = dd(A, B), am = dd(A, M), mb = dd(M, B), s = Math.max(ab, 1e-9);
      if (Math.abs(am + mb - ab) > tol * s) continue outer;
      if (Math.abs(am - mb) > tol * s) continue outer;
    }
    return mid;
  }
  return null;
}

// Goal: a drawn line through V parallel to the internal bisector of angle PVQ.
function findBisector(con, vId, pId, qId, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const sets = evalSets(con, opts);
  outer: for (const lid of lineIds(con)) {
    for (const ev of sets) {
      const V = ev.get(vId), P = ev.get(pId), Q = ev.get(qId), le = ev.get(lid);
      if (!V?.ok || !P?.ok || !Q?.ok || !le?.ok) continue outer;
      const s = Math.max(dd(V, P), dd(V, Q), 1e-9);
      const u1x = (P.x - V.x) / dd(V, P), u1y = (P.y - V.y) / dd(V, P);
      const u2x = (Q.x - V.x) / dd(V, Q), u2y = (Q.y - V.y) / dd(V, Q);
      const tl = Math.hypot(u1x + u2x, u1y + u2y);
      if (tl < 1e-9) continue outer;                        // straight angle: undefined
      const tx = (u1x + u2x) / tl, ty = (u1y + u2y) / tl;   // bisector direction
      const L = Math.hypot(le.x2 - le.x1, le.y2 - le.y1);
      const dxn = (le.x2 - le.x1) / L, dyn = (le.y2 - le.y1) / L;
      if (Math.abs(dxn * ty - dyn * tx) > tol) continue outer;  // parallel to bisector?
      if (distToLine(le, V.x, V.y) > tol * s) continue outer;   // through the vertex?
    }
    return lid;
  }
  return null;
}

// Goal: a drawn line through A perpendicular to AB.
function findPerpAt(con, aId, bId, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const sets = evalSets(con, opts);
  outer: for (const lid of lineIds(con)) {
    for (const ev of sets) {
      const A = ev.get(aId), B = ev.get(bId), le = ev.get(lid);
      if (!A?.ok || !B?.ok || !le?.ok) continue outer;
      const ab = dd(A, B), s = Math.max(ab, 1e-9);
      const ux = (B.x - A.x) / ab, uy = (B.y - A.y) / ab;
      const L = Math.hypot(le.x2 - le.x1, le.y2 - le.y1);
      const dxn = (le.x2 - le.x1) / L, dyn = (le.y2 - le.y1) / L;
      if (Math.abs(dxn * ux + dyn * uy) > tol) continue outer;  // perpendicular?
      if (distToLine(le, A.x, A.y) > tol * s) continue outer;   // through A?
    }
    return lid;
  }
  return null;
}

// Goal (I.2): a constructed point L with AL = BC — with a compass that
// cannot carry distances. Jitter makes an eyeballed L collapse.
function findSegCopy(con, aId, bId, cId, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const sets = evalSets(con, opts);
  outer: for (const lid of pointIds(con)) {
    if (lid === aId || lid === bId || lid === cId) continue;
    for (const ev of sets) {
      const A = ev.get(aId), B = ev.get(bId), C = ev.get(cId), L = ev.get(lid);
      if (!A?.ok || !B?.ok || !C?.ok || !L?.ok) continue outer;
      const bc = dd(B, C), s = Math.max(bc, 1e-9);
      if (Math.abs(dd(A, L) - bc) > tol * s) continue outer;
    }
    return lid;
  }
  return null;
}

/* ---------- Elements I.1, programmatically ---------- */

function buildI1(con, aId, bId) {
  const c1 = addCircle(con, aId, bId);      // with centre A and distance AB  [Post. 3]
  const c2 = addCircle(con, bId, aId);      // with centre B and distance BA  [Post. 3]
  const c = addMeet(con, c1, c2, 0);        // let the circles cut one another at C
  const ca = addLine(con, c, aId);          // let CA be joined               [Post. 1]
  const cb = addLine(con, c, bId);          // let CB be joined               [Post. 1]
  return { c1, c2, c, ca, cb };
}

/* ---------- proof transcript (Euclid's idiom, one sentence per step) ---------- */

function stepSentence(con, step) {
  if (step.given) return null; // givens are covered by the quest's preamble
  const L = (id) => labelOf(con, id);
  if (step.op === 'free') {
    return { main: `Let a point ${step.label} be taken.`, cite: '' };
  }
  if (step.op === 'line') {
    return {
      main: `Let the straight line ${L(step.parents[0])}${L(step.parents[1])} be joined and produced.`,
      cite: 'Post. 1, 2',
    };
  }
  if (step.op === 'circle') {
    return {
      main: `With centre ${L(step.parents[0])} and distance ${L(step.parents[0])}${L(step.parents[1])}, let the circle be described.`,
      cite: 'Post. 3',
    };
  }
  // meet
  const k1 = con.byId.get(step.parents[0]).kind, k2 = con.byId.get(step.parents[1]).kind;
  if (k1 === 'line' && k2 === 'line') {
    return {
      main: `Let the straight lines ${lineName(con, step.parents[0])} and ${lineName(con, step.parents[1])} cut one another at the point ${step.label}.`,
      cite: '',
    };
  }
  if (k1 === 'line' && k2 === 'circle') {
    const cLab = labelOf(con, con.byId.get(step.parents[1]).parents[0]);
    return {
      main: `Let the circle about the centre ${cLab} cut the straight line ${lineName(con, step.parents[0])} at the point ${step.label}.`,
      cite: '',
    };
  }
  const cA = labelOf(con, con.byId.get(step.parents[0]).parents[0]);
  const cB = labelOf(con, con.byId.get(step.parents[1]).parents[0]);
  return {
    main: `Let the circles about the centres ${cA} and ${cB} cut one another at the point ${step.label}.`,
    cite: '',
    ccNote: true, // the honest crack: Euclid cannot prove they meet
  };
}

/* ---------- self-test (run under node) ---------- */

function selfTest() {
  const log = [];
  let pass = true;
  const ok = (cond, msg) => { log.push((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) pass = false; };
  const near = (p, x, y, eps = 1e-9) => p && Math.abs(p.x - x) <= eps && Math.abs(p.y - y) <= eps;
  const R3 = Math.sqrt(3);

  // line–line, hand-checked
  ok(near(intersectLineLine(0, 0, 2, 2, 0, 2, 2, 0), 1, 1, 1e-12), 'line-line: diagonals of the unit-ish square meet at (1,1)');
  ok(intersectLineLine(0, 0, 1, 0, 0, 1, 1, 1) === null, 'line-line: parallels return null');

  // line–circle, hand-checked
  const lc = intersectLineCircle(-2, 0, 2, 0, 0, 0, 1);
  ok(lc.length === 2 && near(lc[0], -1, 0, 1e-12) && near(lc[1], 1, 0, 1e-12), 'line-circle: x-axis × unit circle = (−1,0),(1,0), ordered by t');
  const lc2 = intersectLineCircle(-1, -1, 5, 5, 2, 0, 2);
  ok(lc2.length === 2 && near(lc2[0], 0, 0, 1e-12) && near(lc2[1], 2, 2, 1e-12), 'line-circle: y=x × circle c(2,0) r=2 = (0,0),(2,2)');
  const lct = intersectLineCircle(-2, 1, 2, 1, 0, 0, 1);
  ok(lct.length === 1 && near(lct[0], 0, 1, 1e-9), 'line-circle: tangent y=1 gives the single point (0,1)');
  ok(intersectLineCircle(-2, 3, 2, 3, 0, 0, 1).length === 0, 'line-circle: y=3 misses the unit circle');

  // circle–circle, hand-checked
  const cc = intersectCircleCircle(0, 0, 1, 1, 0, 1);
  ok(cc.length === 2 && near(cc[0], 0.5, R3 / 2, 1e-12) && near(cc[1], 0.5, -R3 / 2, 1e-12), 'circle-circle: unit circles at 0 and 1 meet at (1/2, ±√3/2), left branch first');
  const cct = intersectCircleCircle(0, 0, 1, 2, 0, 1);
  ok(cct.length === 1 && near(cct[0], 1, 0, 1e-9), 'circle-circle: externally tangent at (1,0)');
  ok(intersectCircleCircle(0, 0, 1, 4, 0, 1).length === 0, 'circle-circle: far apart, no intersection');
  ok(intersectCircleCircle(0, 0, 1, 0.1, 0, 3).length === 0, 'circle-circle: one inside the other, no intersection');
  const cc345 = intersectCircleCircle(0, 0, 3, 5, 0, 4); // 3-4-5: meet at x=1.8, y=±2.4
  ok(cc345.length === 2 && near(cc345[0], 1.8, 2.4, 1e-12) && near(cc345[1], 1.8, -2.4, 1e-12), 'circle-circle: radii 3 and 4, centres 5 apart, meet at (1.8, ±2.4)');

  // Elements I.1, programmatically
  const con = newConstruction();
  const a = addFree(con, 0, 0), b = addFree(con, 1, 0);
  const t = buildI1(con, a, b);
  const ev = evaluate(con);
  ok(near(ev.get(t.c), 0.5, R3 / 2, 1e-12), 'I.1: apex evaluates to (1/2, √3/2) exactly');

  // re-instantiate from jittered seed pairs; equilateral to 1e-9 every time
  const rng = mulberry32(0xE0C1D);
  let worst = 0, allValid = true;
  for (let i = 0; i < 12; i++) {
    const A = { x: rng() * 4 - 2, y: rng() * 4 - 2 };
    const B = { x: A.x + rng() * 2 - 1, y: A.y + rng() * 2 - 1 };
    if (Math.hypot(B.x - A.x, B.y - A.y) < 0.3) B.x += 0.7;
    const e2 = evaluate(con, new Map([[a, A], [b, B]]));
    const C = e2.get(t.c);
    if (!C.ok) { allValid = false; break; }
    const ab = dd(A, B);
    worst = Math.max(worst, Math.abs(dd(C, A) - ab), Math.abs(dd(C, B) - ab));
  }
  ok(allValid, 'I.1 replays validly from 12 jittered seed pairs');
  ok(worst <= 1e-9, `I.1 triangle equilateral to 1e-9 under every jitter (worst deviation ${worst.toExponential(2)})`);

  // determinism of replay
  const evA = evaluate(con), evB = evaluate(con);
  ok(dd(evA.get(t.c), evB.get(t.c)) === 0, 'replay is deterministic');

  // goal checker accepts the construction…
  ok(findEquilateral(con, a, b) === t.c, 'goal checker finds the constructed apex');
  // …and rejects a lucky drawing (free point eyeballed into place)
  const con2 = newConstruction();
  const a2 = addFree(con2, 0, 0), b2 = addFree(con2, 1, 0);
  const fake = addFree(con2, 0.5, R3 / 2);
  addLine(con2, a2, b2); addLine(con2, a2, fake); addLine(con2, b2, fake);
  ok(findEquilateral(con2, a2, b2) === null, 'jittered re-instantiation rejects the lucky free point');

  // midpoint checker on a real perpendicular-bisector construction
  const con3 = newConstruction();
  const a3 = addFree(con3, -1, 0.2), b3 = addFree(con3, 0.9, -0.4);
  const ab3 = addLine(con3, a3, b3);
  const k1 = addCircle(con3, a3, b3), k2 = addCircle(con3, b3, a3);
  const e1 = addMeet(con3, k1, k2, 0), e2b = addMeet(con3, k1, k2, 1);
  const bis = addLine(con3, e1, e2b);
  const m = addMeet(con3, ab3, bis, 0);
  ok(findMidpoint(con3, a3, b3) === m, 'midpoint checker accepts the perpendicular-bisector construction');

  // transcript idiom
  const sCirc = stepSentence(con, con.byId.get(t.c1));
  ok(/Post\. 3/.test(sCirc.cite) && /centre A and distance AB/.test(sCirc.main), 'circle sentence speaks Euclid and cites Post. 3');
  const sMeet = stepSentence(con, con.byId.get(t.c));
  ok(sMeet.ccNote === true && /cut one another at the point C/.test(sMeet.main), 'circle-circle sentence flags the continuity gap');

  return { pass, log };
}

/* ================= the exhibit ================= */

export default {
  id: 'twotools',
  movement: 1,
  title: 'The Two Tools',
  hook: 'Prove a 2,300-year-old theorem with your own hands — using the only two tools Euclid allows.',
  prose: `
    <p>Around 300 BCE, in Alexandria, Euclid opened the <em>Elements</em> not with a fact but
    with a rulebook. Three of his five postulates are not truths at all — they are <em>moves</em>:
    to draw a straight line from any point to any point; to produce it; to describe a circle with
    any centre and distance. The playing pieces are two tools, deliberately crippled. The
    straightedge is not a ruler: it carries no marks, remembers no lengths, and will do nothing
    but join and extend. The compass is stranger still — read it, as the tradition does, as
    <em>collapsing</em>, folding shut the instant it leaves the page, so it cannot carry a
    distance from one place to another. Whatever geometry is to be, it must be won from these
    beggared instruments and nothing else.</p>
    <p>The very first proposition is a dare: <em>on a given straight line, to construct an
    equilateral triangle</em>. Notice the verb. Proposition I.1 does not announce that the
    triangle exists; it builds the thing before your eyes, and the building <em>is</em> the
    proof — in this game, to exist is to be constructible. Constructions in the Elements
    close not with the famous <em>which was to be proved</em> but with
    ὅπερ ἔδει ποιῆσαι — <em>which was required to do</em>. Below, the column beside the canvas
    writes the deduction as you click: your moves author the proposition, and when the goal
    stands, the proof signs itself.</p>
    <p>Be careful, though, crediting Euclid with too much. He invented almost none of it: a
    first <em>Elements</em> had been compiled by Hippocrates of Chios more than a century
    earlier; the deep theory of irrationals is Theaetetus'; the theory of proportion is
    Eudoxus'. What Euclid built is the arrangement — hundreds of propositions hanging from
    five postulates and a handful of common notions, each hanging only on what came before.
    That architecture, mathematics as a game whose every claim traces back to declared rules,
    is the invention, and this essay will not stop returning to it.</p>
    <p>And from its first line the game is honestly imperfect. I.1 draws two circles and takes
    the point "in which the circles cut one another" — but no postulate promises they cut
    anywhere. Each circle could slip through a gap in the other, if the plane had gaps; that
    it has none is a fact about <em>continuity</em>, and it took until Pasch (1882) and
    Hilbert (1899) to state it as an axiom. The crack does not damn Euclid. It teaches the
    movement's real lesson: rigor is not a possession but a horizon, and every age finds
    fissures its predecessors could not see.</p>
    <p>Two consolations, then a trap. First, the collapsing compass costs nothing: by his
    second proposition Euclid shows it can copy any distance anyway — quest five asks you to
    do it, and your compass here genuinely collapses. Second, the two tools reach infinitely
    many points, every one living in a tower of nested square roots above the points you
    start from. And that is the trap. Doubling a cube needs <code>∛2</code>; trisecting a
    general angle needs the root of a cubic; squaring a circle needs π — and none of these
    lives in any tower of square roots, though proving so took until 1837 (Wantzel) and 1882
    (Lindemann). The sixth quest invites you to try what geometers tried for two thousand
    years. Take your time.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    /* ---------- scoped styles ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-twotools .tt-flex{display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;margin-top:0.8rem}
      #ex-twotools .tt-canvas{flex:1 1 400px;min-width:300px}
      #ex-twotools .tt-proof{flex:1 1 260px;min-width:250px;max-width:340px;max-height:480px;overflow-y:auto;
        background:${P.panel};border:1px solid ${P.line};border-left:3px solid ${P.goldDim};
        border-radius:4px;padding:0.9rem 1rem;font-size:0.84rem;line-height:1.6;color:${P.ink}}
      #ex-twotools .tt-proof h4{margin:0 0 0.55rem;font-size:0.68rem;letter-spacing:0.16em;
        text-transform:uppercase;color:${P.inkFaint};font-weight:600}
      #ex-twotools .tt-proof .tt-prop{color:${P.goldBright};font-style:italic;margin:0 0 0.7rem}
      #ex-twotools .tt-proof p{margin:0 0 0.55rem}
      #ex-twotools .tt-given{color:${P.inkDim};font-style:italic}
      #ex-twotools .tt-empty{color:${P.inkFaint};font-style:italic}
      #ex-twotools .tt-cite{color:${P.azureDim};font-size:0.7rem;font-family:ui-monospace,Menlo,monospace;
        margin-left:0.35rem;white-space:nowrap}
      #ex-twotools .tt-qef{color:${P.gold};text-align:right;letter-spacing:0.18em;margin-top:0.8rem;font-size:0.8rem}
      #ex-twotools .tt-qef small{display:block;letter-spacing:0.02em;color:${P.inkFaint};font-style:italic}
      #ex-twotools .tt-foot{margin-top:0.8rem;padding-top:0.6rem;border-top:1px dashed ${P.line};
        color:${P.inkFaint};font-size:0.74rem;font-style:italic}
      #ex-twotools .tt-interrupt{margin-top:1rem;border:1px solid ${P.crimson};border-left-width:4px;
        border-radius:4px;background:${P.panel};padding:1rem 1.2rem}
      #ex-twotools .tt-interrupt .tt-int-title{color:${P.crimson};font-size:0.7rem;letter-spacing:0.16em;
        text-transform:uppercase;margin-bottom:0.5rem}
      #ex-twotools .tt-interrupt p{margin:0 0 0.6rem;font-size:0.92rem;line-height:1.65;color:${P.ink}}
      #ex-twotools .tt-interrupt p:last-child{margin-bottom:0}`;
    stage.appendChild(styleEl);

    /* ---------- quest definitions ---------- */
    const QUESTS = [
      {
        key: 'i1',
        prop: 'On a given finite straight line to construct an equilateral triangle.',
        banner: 'Quest 1 of 7 · On the segment <em>AB</em>, construct an equilateral triangle. <code>[Elements I.1]</code>',
        preamble: 'Let AB be the given finite straight line. It is required to construct an equilateral triangle on AB.',
        intro: 'Two points and their segment are given. All of Greek geometry now waits on your first circle.',
        view: { cx: 0, cy: 0.35, w: 7.0, h: 4.7 },
        seeds(con) {
          const a = addFree(con, -1, 0, { given: true });
          const b = addFree(con, 1, 0, { given: true });
          addLine(con, a, b, { given: true });
          return { a, b };
        },
        hints: [
          'Postulate 3 is your only way to conjure a new length: pick the compass, pin it at A, open it to B.',
          'Now a second circle — centre B, distance BA. Two circles, each through the other’s centre.',
          'Where the circles cut one another a small ring appears: claim that point, then join it to A and to B with the straightedge.',
        ],
        check(con, ids) { const c = findEquilateral(con, ids.a, ids.b); return c == null ? null : { c }; },
        witness(ids, w) { return { pts: [w.c], segs: [[ids.a, w.c], [ids.b, w.c], [ids.a, ids.b]] }; },
        qef(con, ids, w) {
          return `Therefore the triangle ${labelOf(con, ids.a)}${labelOf(con, ids.b)}${labelOf(con, w.c)} is equilateral, and it has been constructed on the given finite straight line ${labelOf(con, ids.a)}${labelOf(con, ids.b)}.`;
        },
        doneText: 'The triangle stands — and it stands on <em>every</em> AB: drag a gold point and watch the whole proof follow.',
      },
      {
        key: 'i10',
        prop: 'To bisect a given finite straight line.',
        banner: 'Quest 2 of 7 · Cut the segment <em>AB</em> into two equal parts. <code>[I.10]</code>',
        preamble: 'Let AB be the given finite straight line. It is required to bisect AB.',
        intro: 'No marked ruler, no halving by eye. Equality must be built out of circles.',
        view: { cx: -0.1, cy: 0.05, w: 6.9, h: 4.8 },
        seeds(con) {
          const a = addFree(con, -1.1, 0.1, { given: true });
          const b = addFree(con, 0.9, -0.3, { given: true });
          addLine(con, a, b, { given: true });
          return { a, b };
        },
        hints: [
          'Begin as in I.1: the twin circles — centre A distance AB, centre B distance BA — cut twice, above and below.',
          'Join the two cutting points. That straight line has no favourite side of AB.',
          'Claim the point where your new line cuts AB itself: straight line meets straight line.',
        ],
        check(con, ids) { const m = findMidpoint(con, ids.a, ids.b); return m == null ? null : { m }; },
        witness(ids, w) { return { pts: [w.m], segs: [[ids.a, ids.b]] }; },
        qef(con, ids, w) {
          return `Therefore the given finite straight line ${labelOf(con, ids.a)}${labelOf(con, ids.b)} has been bisected at the point ${labelOf(con, w.m)}.`;
        },
        doneText: 'Bisected — and the midpoint clings to AB however the endpoints wander.',
      },
      {
        key: 'i9',
        prop: 'To bisect a given rectilineal angle.',
        banner: 'Quest 3 of 7 · Cut the angle <em>BAC</em> into two equal angles. <code>[I.9]</code>',
        preamble: 'Let the angle BAC be the given rectilineal angle. It is required to bisect it.',
        intro: 'The arms AB and AC have different lengths — on purpose. Equal distances come first.',
        view: { cx: 0.05, cy: 0, w: 6.2, h: 4.4 },
        seeds(con) {
          const a = addFree(con, -0.9, -0.7, { given: true });
          const b = addFree(con, 0.971, -0.37, { given: true });
          const c = addFree(con, -0.238, 0.36, { given: true });
          addLine(con, a, b, { given: true });
          addLine(con, a, c, { given: true });
          return { a, b, c };
        },
        hints: [
          'First make the arms equal: with centre A and distance AC (the nearer point), cut the longer arm AB.',
          'You now hold two points at equal distances from A, one on each arm. Describe circles on them, each through the other — I.1 again.',
          'Join A to a point where those circles cut. That line splits the angle in two.',
        ],
        check(con, ids) { const l = findBisector(con, ids.a, ids.b, ids.c); return l == null ? null : { l }; },
        witness(ids, w) { return { pts: [], segs: [], lines: [w.l] }; },
        qef(con, ids, w) {
          return `Therefore the angle ${labelOf(con, ids.b)}${labelOf(con, ids.a)}${labelOf(con, ids.c)} has been bisected by the straight line ${lineName(con, w.l)}.`;
        },
        doneText: 'Halved. Euclid spends three circles here; the jitter test says your way is law too.',
      },
      {
        key: 'i11',
        prop: 'To draw a straight line at right angles to a given straight line from a given point on it.',
        banner: 'Quest 4 of 7 · From the point <em>A</em>, raise a line at right angles to <em>AB</em>. <code>[I.11]</code>',
        preamble: 'Let AB be the given straight line, and A the given point on it. It is required to draw from the point A a straight line at right angles to AB.',
        intro: 'A right angle, from tools that cannot measure any angle at all.',
        view: { cx: -0.2, cy: 0.05, w: 6.6, h: 4.6 },
        seeds(con) {
          const a = addFree(con, -0.2, -0.15, { given: true });
          const b = addFree(con, 1.5, 0.25, { given: true });
          addLine(con, a, b, { given: true });
          return { a, b };
        },
        hints: [
          'With centre A and distance AB, describe a circle: it cuts the line AB a second time, on the far side of A. Claim that point.',
          'Two points on the line, at equal distances from A. Build I.1’s twin circles on them.',
          'Join the two crossings of those big circles — the line runs straight through A, at right angles.',
        ],
        check(con, ids) { const l = findPerpAt(con, ids.a, ids.b); return l == null ? null : { l }; },
        witness(ids, w) { return { pts: [ids.a], segs: [], lines: [w.l] }; },
        qef(con, ids, w) {
          return `Therefore the straight line ${lineName(con, w.l)} has been drawn at right angles to the given straight line ${labelOf(con, ids.a)}${labelOf(con, ids.b)} from the point ${labelOf(con, ids.a)} on it.`;
        },
        doneText: 'A right angle, raised out of nothing but crossings.',
      },
      {
        key: 'i2',
        prop: 'To place at a given point (as an extremity) a straight line equal to a given straight line.',
        banner: 'Quest 5 of 7 · Your compass collapses when lifted — copy the distance <em>BC</em> over to the point <em>A</em> anyway. <code>[I.2]</code>',
        preamble: 'Let A be the given point, and BC the given straight line. It is required to place at the point A a straight line equal to the given straight line BC.',
        intro: 'Pin the compass at A and it can only open to points already standing — never to the far-off length BC. Euclid smuggles the distance across anyway.',
        view: { cx: 0.05, cy: 0.1, w: 8.6, h: 5.8 },
        seeds(con) {
          const a = addFree(con, -1.35, 0.75, { given: true });
          const b = addFree(con, 0.5, -0.6, { given: true });
          const c = addFree(con, 1.45, 0.15, { given: true });
          addLine(con, b, c, { given: true });
          return { a, b, c };
        },
        hints: [
          'Join AB, and raise Euclid’s equilateral triangle on it — call its apex D. Proposition I.1 is a tool now. (Draw the lines DA and DB: you will need to produce them.)',
          'With centre B and distance BC, describe a circle. The line DB, produced, cuts it — at a point G with DG = DB + BC.',
          'With centre D and distance DG, describe a circle. It cuts the line DA at a point L, and AL = DG − DA = BC. Claim L.',
        ],
        check(con, ids) { const l = findSegCopy(con, ids.a, ids.b, ids.c); return l == null ? null : { l }; },
        witness(ids, w) { return { pts: [w.l], segs: [[ids.a, w.l], [ids.b, ids.c]] }; },
        qef(con, ids, w) {
          return `Therefore at the given point ${labelOf(con, ids.a)} the straight line ${labelOf(con, ids.a)}${labelOf(con, w.l)} has been placed equal to the given straight line ${labelOf(con, ids.b)}${labelOf(con, ids.c)}.`;
        },
        doneText: 'The collapsing compass just carried a distance across the plane. The crippled tool secretly equals the rigid one — and the trick cost three circles.',
      },
      {
        key: 'trap',
        prop: 'To cut a given rectilineal angle into three equal angles.',
        banner: 'Quest 6 of 7 · Cut the angle <em>BAC</em> into three equal angles.',
        preamble: 'Let the angle BAC be the given rectilineal angle, of two thirds of a right angle. It is required to cut it into three equal angles.',
        intro: 'Bisection you own. Surely a third is only a little harder.',
        view: { cx: 0.85, cy: 0, w: 6.6, h: 4.4 },
        seeds(con) {
          const a = addFree(con, 0, -0.75, { given: true });
          const b = addFree(con, 1.7, -0.75, { given: true });
          const c = addFree(con, 0.85, 0.722, { given: true });
          addLine(con, a, b, { given: true });
          addLine(con, a, c, { given: true });
          return { a, b, c };
        },
        hints: [
          'Bisecting twice gives quarters, not thirds. Perhaps some clever auxiliary circle…',
          'Equal chords cut equal angles — can you make three equal chords span the arc?',
          'However long you circle, something has been watching your moves. It will speak soon.',
        ],
        check() { return null; },
        trap: true,
      },
      {
        key: 'free',
        prop: 'Free construction.',
        banner: 'Quest 7 of 7 · Free play — the plane is yours. Try a square on AB, or a regular hexagon: six radii of one circle.',
        preamble: 'Let the points A and B be set out. Nothing is required — and everything is permitted.',
        intro: 'Every point you will ever reach here lives in a tower of square roots above A and B.',
        view: { cx: 0, cy: 0, w: 6.6, h: 4.6 },
        seeds(con) {
          const a = addFree(con, -0.8, -0.2, { given: true });
          const b = addFree(con, 0.6, 0.1, { given: true });
          return { a, b };
        },
        hints: [
          'A hexagon: one circle, then walk the compass around its rim — the radius fits exactly six times.',
          'A square: perpendicular at A (quest 4), then carry the distance AB up the new line.',
        ],
        check() { return null; },
        freePlay: true,
      },
    ];

    /* ---------- state ---------- */
    let con = null;               // the construction (dependency graph)
    let curEval = null;           // Map(id -> evaluated geometry)
    let qids = null;              // ids of the current quest's given points
    let questIdx = 0;
    const questState = QUESTS.map(() => ({ done: false }));
    let tool = 'point';           // 'point' | 'line' | 'circle'
    let pending = null;           // first point chosen for a line/circle
    let hoverPt = null;           // existing point under cursor
    let hoverPh = null;           // phantom intersection under cursor {p1,p2,branch,x,y}
    let cursorW = null;           // cursor in world coords
    let dragId = null, dragMoved = false;
    let hintIdx = 0;
    let trapSteps = 0, trapTime = 0, trapFired = false;
    let footnoted = false;
    const anims = new Map();      // id -> {kind:'sweep'|'grow'|'pop', t0, dur} (+ 'witness')
    const SNAP = 13;              // px

    const bus = audio.createBus('twotools');

    /* ---------- layout ---------- */
    const banner = ui.questBanner(stage, '');

    const flex = document.createElement('div');
    flex.className = 'tt-flex';
    stage.appendChild(flex);
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'tt-canvas';
    flex.appendChild(canvasWrap);
    const handle = cv.setupCanvas(canvasWrap, { height: 480 });
    handle.canvas.style.touchAction = 'none';
    handle.canvas.style.cursor = 'crosshair';

    const proofEl = document.createElement('div');
    proofEl.className = 'tt-proof';
    flex.appendChild(proofEl);

    const interruptSlot = document.createElement('div');
    stage.appendChild(interruptSlot);

    const controls = ui.controlRow(stage);
    const toolBtns = {
      point: ui.button(controls, '· point', () => setTool('point')),
      line: ui.button(controls, '╱ straightedge', () => setTool('line')),
      circle: ui.button(controls, '◌ compass', () => setTool('circle')),
    };
    const undoBtn = ui.button(controls, '↩ undo', doUndo, { small: true });
    const restartBtn = ui.button(controls, '⟲ restart', () => setupQuest(questIdx), { small: true });
    const hintBtn = ui.button(controls, '? hint', showHint, { small: true });
    const concedeBtn = ui.button(controls, 'something resists — ask why', () => fireTrap(), { small: true });
    const prevBtn = ui.button(controls, '◀ previous', () => { if (questIdx > 0) setupQuest(questIdx - 1); }, { small: true });
    const nextBtn = ui.button(controls, 'next proposition ▶', () => { if (questIdx < QUESTS.length - 1) setupQuest(questIdx + 1); }, { primary: true });

    const info = ui.readout(stage, '');
    ui.caption(stage,
      'The <em>point</em> tool places points (and drags gold given ones); the <em>straightedge</em> joins two points ' +
      'and produces the line — unmarked, it draws and never measures; the <em>compass</em> pins at a centre, opens to ' +
      'a point, and collapses when lifted. Where curves cross, a ring appears: intersections are the only new points ' +
      'the game grants — click to claim one. Right-click cancels a half-made move. Every quest is judged by replaying ' +
      'your construction from shaken seed points: a lucky drawing fails, a true construction cannot.');
    ui.legendPanel(stage,
      '<p>When plague struck, says a tale first written down centuries after the fact, the oracle at Delos ordered ' +
      'the god’s cubical altar doubled. The Delians dutifully doubled every edge — and made the altar eight times ' +
      'larger. Plato, the story continues, told them the god wanted no altar: he was rebuking Greece for neglecting ' +
      'geometry. It is legend — our tellers, Theon of Smyrna citing Eratosthenes, and Plutarch, are far removed — but ' +
      'the problem it dresses up, doubling the cube with the two tools, is real, and quest six settles its fate.</p>' +
      '<p>Legend, too, is the other famous Euclid story: asked by King Ptolemy for a shortcut through the ' +
      '<em>Elements</em>, he is said to have replied that <em>there is no royal road to geometry</em>. The line first ' +
      'appears in Proclus, some seven centuries after Euclid — too good to be true, and too true to the spirit to ' +
      'leave out.</p>');

    /* ---------- world <-> screen ---------- */
    let view = QUESTS[0].view;
    let sc = 100;
    function computeScale() {
      sc = Math.min(handle.width / view.w, handle.height / view.h);
    }
    function w2s(wx, wy) {
      return [handle.width / 2 + (wx - view.cx) * sc, handle.height / 2 - (wy - view.cy) * sc];
    }
    function s2w(sx, sy) {
      return [view.cx + (sx - handle.width / 2) / sc, view.cy - (sy - handle.height / 2) / sc];
    }

    /* ---------- audio (one-shots only; playTone/drums self-clean) ---------- */
    const anow = () => { const c = audio.getContext(); return c ? c.currentTime : 0; };
    function sSelect() { audio.ensureAudio(); audio.drums.wood(bus, anow(), { pitch: 950, level: 0.25 }); }
    function sPoint() { audio.ensureAudio(); audio.drums.wood(bus, anow(), { pitch: 1240, level: 0.3 }); }
    function sLine() {
      audio.ensureAudio(); const t = anow();
      audio.playTone(bus, { freq: 392, dur: 0.13, type: 'triangle', level: 0.2, when: t });
      audio.playTone(bus, { freq: 494, dur: 0.1, type: 'triangle', level: 0.13, when: t + 0.07 });
    }
    function sCircle() {
      audio.ensureAudio(); const t = anow();
      audio.playTone(bus, { freq: 294, dur: 0.5, level: 0.18, when: t });
      audio.playTone(bus, { freq: 441, dur: 0.36, level: 0.13, when: t + 0.16 });
    }
    function sMeet() {
      audio.ensureAudio(); const t = anow();
      audio.playTone(bus, { freq: 988, dur: 0.22, level: 0.24, when: t });
      audio.drums.wood(bus, t, { pitch: 1560, level: 0.18 });
    }
    function sDone() {
      audio.ensureAudio(); const t = anow();
      [523.25, 659.25, 783.99].forEach((f, i) =>
        audio.playTone(bus, { freq: f, dur: 0.5, level: 0.28, when: t + i * 0.13 }));
      audio.playTone(bus, { freq: 1046.5, dur: 0.6, level: 0.2, when: t + 0.39 });
    }
    function sTrap() {
      const c = audio.getContext();
      if (!c || c.state !== 'running') return; // may fire from a timer, not a gesture
      const t = c.currentTime;
      [392, 330, 262].forEach((f, i) =>
        audio.playTone(bus, { freq: f, dur: 0.42, level: 0.2, when: t + i * 0.18 }));
      audio.drums.thock(bus, t + 0.58, { level: 0.5 });
    }

    /* ---------- proof panel ---------- */
    let stepsBox = null, sigBox = null, footBox = null;
    function rebuildProof(quest) {
      proofEl.innerHTML = '';
      const h = document.createElement('h4');
      h.textContent = 'the proposition, as you author it';
      proofEl.appendChild(h);
      const prop = document.createElement('p');
      prop.className = 'tt-prop';
      prop.textContent = quest.prop;
      proofEl.appendChild(prop);
      const pre = document.createElement('p');
      pre.className = 'tt-given';
      pre.textContent = quest.preamble;
      proofEl.appendChild(pre);
      stepsBox = document.createElement('div');
      proofEl.appendChild(stepsBox);
      const empty = document.createElement('p');
      empty.className = 'tt-empty';
      empty.textContent = 'Your moves will be written here.';
      stepsBox.appendChild(empty);
      sigBox = document.createElement('div');
      proofEl.appendChild(sigBox);
      footBox = document.createElement('div');
      proofEl.appendChild(footBox);
      footnoted = false;
    }
    function addProofLine(step) {
      const s = stepSentence(con, step);
      if (!s) return;
      const empty = stepsBox.querySelector('.tt-empty');
      if (empty) empty.remove();
      const p = document.createElement('p');
      p.textContent = s.main + (s.ccNote ? ' *' : '');
      if (s.cite) {
        const c = document.createElement('span');
        c.className = 'tt-cite';
        c.textContent = `[${s.cite}]`;
        p.appendChild(c);
      }
      stepsBox.appendChild(p);
      step.proofEl = p;
      if (s.ccNote && !footnoted) {
        footnoted = true;
        const f = document.createElement('div');
        f.className = 'tt-foot';
        f.textContent = '* That the circles must indeed meet, the axioms nowhere say — the diagram persuades, ' +
          'but the logic is silent. This gap in I.1 stood for more than two thousand years, until the continuity ' +
          'axioms of Pasch (1882) and Hilbert (1899) closed it.';
        footBox.appendChild(f);
      }
      proofEl.scrollTop = proofEl.scrollHeight;
    }
    function signQEF(text) {
      sigBox.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = text;
      sigBox.appendChild(p);
      const q = document.createElement('div');
      q.className = 'tt-qef';
      q.innerHTML = 'ΟΠΕΡ ΕΔΕΙ ΠΟΙΗΣΑΙ<small>— which was required to do</small>';
      sigBox.appendChild(q);
      proofEl.scrollTop = proofEl.scrollHeight;
    }

    /* ---------- quest lifecycle ---------- */
    function setupQuest(idx) {
      questIdx = idx;
      const quest = QUESTS[idx];
      con = newConstruction();
      qids = quest.seeds(con);
      curEval = evaluate(con);
      view = quest.view;
      pending = null; hoverPt = null; hoverPh = null; dragId = null;
      hintIdx = 0; trapSteps = 0; trapTime = 0;
      trapFired = quest.trap ? questState[idx].done : false;
      anims.clear();
      rebuildProof(quest);
      interruptSlot.innerHTML = '';
      if (quest.trap && questState[idx].done) renderInterrupt();
      const st = questState[idx];
      if (st.done && !quest.freePlay) banner.done(quest.banner + ' <em>— already proven; play again freely.</em>');
      else banner.set(quest.banner);
      info.set(quest.intro);
      concedeBtn.style.display = quest.trap && !questState[idx].done ? '' : 'none';
      prevBtn.style.display = idx > 0 ? '' : 'none';
      refreshNav();
    }
    function refreshNav() {
      const canNext = questIdx < QUESTS.length - 1 && questState[questIdx].done;
      nextBtn.style.display = canNext ? '' : 'none';
    }
    function markDone(witness) {
      const quest = QUESTS[questIdx];
      questState[questIdx].done = true;
      banner.done(quest.doneText || quest.banner);
      if (quest.qef) signQEF(quest.qef(con, qids, witness));
      if (quest.witness) {
        const w = quest.witness(qids, witness);
        anims.set('witness', { kind: 'witness', t0: null, dur: 2.4, w });
      }
      sDone();
      refreshNav();
    }
    function runCheck() {
      const quest = QUESTS[questIdx];
      if (questState[questIdx].done || !quest.check) return;
      const w = quest.check(con, qids);
      if (w) markDone(w);
    }

    /* ---------- the trap ---------- */
    function fireTrap() {
      if (trapFired || !QUESTS[questIdx].trap) return;
      trapFired = true;
      questState[questIdx].done = true;
      renderInterrupt();
      banner.done('Halt — put the compass down. Not because you failed: because no one can, and that is a theorem.');
      concedeBtn.style.display = 'none';
      sTrap();
      refreshNav();
      interruptSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function renderInterrupt() {
      interruptSlot.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'tt-interrupt';
      d.innerHTML =
        '<div class="tt-int-title">the two-thousand-year interruption</div>' +
        '<p>Stop — not because you have failed, but because you cannot succeed, and the impossibility is itself a ' +
        'theorem. Every length these two tools can reach is built by intersecting lines and circles, and each ' +
        'intersection costs at most a square root: the constructible numbers live in towers of extensions of degree ' +
        '2, 4, 8, 16 — always a power of two. To cut this 60° angle in three you would need <code>cos 20°</code>, ' +
        'which is a root of the irreducible cubic <code>8x³ − 6x − 1</code> — an object of degree <em>three</em>. ' +
        'And 3 divides no power of 2. Pierre Wantzel published that argument in 1837, closing in a few pages a ' +
        'question left open for some two thousand years; doubling the cube dies with it (<code>∛2</code> is degree ' +
        'three too), and squaring the circle held out until 1882, when Lindemann proved π is not the root of any ' +
        'polynomial with whole-number coefficients at all.</p>' +
        '<p>One door out: change the rules. A single straight fold that lands two points onto two lines solves cubic ' +
        'equations — so a sheet of paper, honestly folded, trisects any angle and doubles any cube. The impossibility ' +
        'was never in the angle; it was in the tools. Change the game and you change the universe of the knowable — ' +
        'a thought the third movement of this essay will not let go of.</p>';
      interruptSlot.appendChild(d);
    }

    /* ---------- tools & moves ---------- */
    function setTool(t) {
      tool = t;
      pending = null;
      for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('active', k === t);
    }
    function afterMutate() {
      curEval = evaluate(con);
      updateHoverFromCursor();
      if (QUESTS[questIdx].trap && !trapFired) trapSteps++;
      runCheck();
    }
    function placeFree(wx, wy) {
      const id = addFree(con, wx, wy);
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'pop', t0: null, dur: 0.35 });
      sPoint();
      afterMutate();
      return id;
    }
    function materialize(ph) {
      const id = addMeet(con, ph.p1, ph.p2, ph.branch);
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'pop', t0: null, dur: 0.4 });
      sMeet();
      afterMutate();
      return id;
    }
    function makeLine(p1, p2) {
      const id = addLine(con, p1, p2);
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'grow', t0: null, dur: 0.4 });
      sLine();
      afterMutate();
      return id;
    }
    function makeCircle(c, t) {
      const id = addCircle(con, c, t);
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'sweep', t0: null, dur: 0.6 });
      sCircle();
      afterMutate();
      return id;
    }
    function doUndo() {
      // givens are always the leading steps; never undo past them
      let lastGiven = 0;
      for (const s of con.steps) { if (s.given) lastGiven++; else break; }
      if (con.steps.length <= lastGiven) return;
      const s = undoLast(con);
      if (s && s.proofEl) s.proofEl.remove();
      if (s) anims.delete(s.id);
      if (stepsBox && !stepsBox.querySelector('p')) {
        const empty = document.createElement('p');
        empty.className = 'tt-empty';
        empty.textContent = 'Your moves will be written here.';
        stepsBox.appendChild(empty);
      }
      pending = null; hoverPt = null; hoverPh = null;
      curEval = evaluate(con);
    }
    function showHint() {
      const hints = QUESTS[questIdx].hints || [];
      if (!hints.length) return;
      const h = hints[hintIdx % hints.length];
      info.set(`hint ${(hintIdx % hints.length) + 1} of ${hints.length} — ${h}`);
      hintIdx++;
    }

    /* ---------- hit-testing ---------- */
    function nearestPointId(wx, wy, radW) {
      let best = null, bd = radW;
      for (const s of con.steps) {
        if (s.kind !== 'pt') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok) continue;
        const d = Math.hypot(e.x - wx, e.y - wy);
        if (d < bd) { bd = d; best = s.id; }
      }
      return best;
    }
    function phantomAt(wx, wy, radW) {
      const curves = con.steps.filter((s) => (s.op === 'line' || s.op === 'circle') && curEval.get(s.id)?.ok);
      const dedupe = 1e-6 * view.w;
      let best = null, bd = radW;
      for (let i = 0; i < curves.length; i++) {
        for (let j = i + 1; j < curves.length; j++) {
          const [p1, p2] = normalizePair(con, curves[i].id, curves[j].id);
          const pts = intersectEval(curEval.get(p1), curEval.get(p2));
          for (let bi = 0; bi < pts.length; bi++) {
            const p = pts[bi];
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            let taken = false;
            for (const s of con.steps) {
              if (s.kind !== 'pt') continue;
              const e = curEval.get(s.id);
              if (e && e.ok && Math.hypot(e.x - p.x, e.y - p.y) < dedupe) { taken = true; break; }
            }
            if (taken) continue;
            const d = Math.hypot(p.x - wx, p.y - wy);
            if (d < bd) { bd = d; best = { p1, p2, branch: bi, x: p.x, y: p.y }; }
          }
        }
      }
      return best;
    }
    function updateHoverFromCursor() {
      if (!cursorW) { hoverPt = null; hoverPh = null; return; }
      const radW = SNAP / sc;
      hoverPt = nearestPointId(cursorW[0], cursorW[1], radW);
      hoverPh = hoverPt == null ? phantomAt(cursorW[0], cursorW[1], radW) : null;
    }

    /* ---------- pointer events ---------- */
    const canvas = handle.canvas;
    function onDown(e) {
      if (e.button === 2) return;
      const [sx, sy] = cv.pointerPos(handle, e);
      const [wx, wy] = s2w(sx, sy);
      cursorW = [wx, wy];
      const radW = SNAP / sc;
      const np = nearestPointId(wx, wy, radW);
      if (tool === 'point') {
        if (np != null) {
          const s = con.byId.get(np);
          if (s.op === 'free') {
            dragId = np; dragMoved = false;
            try { canvas.setPointerCapture(e.pointerId); } catch {}
          }
          return;
        }
        const ph = phantomAt(wx, wy, radW);
        if (ph) { materialize(ph); return; }
        placeFree(wx, wy);
        return;
      }
      // straightedge / compass: resolve a point (snap > phantom > new free point)
      let pid = np;
      if (pid == null) {
        const ph = phantomAt(wx, wy, radW);
        if (ph) pid = materialize(ph);
      }
      if (pid == null) pid = placeFree(wx, wy);
      if (pending == null) { pending = pid; sSelect(); }
      else if (pending === pid) { pending = null; }
      else {
        if (tool === 'line') makeLine(pending, pid);
        else makeCircle(pending, pid);
        pending = null;
      }
    }
    function onMove(e) {
      const [sx, sy] = cv.pointerPos(handle, e);
      const [wx, wy] = s2w(sx, sy);
      cursorW = [wx, wy];
      if (dragId != null) {
        const s = con.byId.get(dragId);
        s.x = Math.max(view.cx - view.w * 0.62, Math.min(view.cx + view.w * 0.62, wx));
        s.y = Math.max(view.cy - view.h * 0.62, Math.min(view.cy + view.h * 0.62, wy));
        dragMoved = true;
        curEval = evaluate(con);
        return;
      }
      updateHoverFromCursor();
    }
    function onUp(e) {
      if (dragId != null) {
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
        dragId = null;
        if (dragMoved) runCheck();
      }
    }
    function onLeave() { cursorW = null; hoverPt = null; hoverPh = null; }
    function onCtx(e) { e.preventDefault(); pending = null; }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onCtx);

    /* ---------- drawing ---------- */
    const bodyFont = () => getComputedStyle(document.body).fontFamily;
    let labelFont = null;
    const ease = (f) => 1 - Math.pow(1 - f, 3);
    function animOf(id, t) {
      const a = anims.get(id);
      if (!a) return 1;
      if (a.t0 == null) a.t0 = t;
      const f = Math.min((t - a.t0) / a.dur, 1);
      if (f >= 1) anims.delete(id);
      return ease(f);
    }

    function draw(dt, t) {
      const { ctx, width: W, height: H } = handle;
      computeScale();
      if (!labelFont) labelFont = '13px ' + bodyFont();
      ctx.clearRect(0, 0, W, H);

      // trap timer (runs only while visible, since the loop pauses off-screen)
      const quest = QUESTS[questIdx];
      if (quest.trap && !trapFired && trapSteps > 0) {
        trapTime += dt;
        if (trapSteps >= 7 || trapTime > 26) fireTrap();
      }

      const ext = 3 * Math.max(view.w, view.h); // long enough to cross the canvas

      // circles
      for (const s of con.steps) {
        if (s.op !== 'circle') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok || e.r * sc < 0.5) continue;
        const [cx, cy] = w2s(e.cx, e.cy);
        const f = animOf(s.id, t);
        const tp = curEval.get(s.parents[1]); // through-point: sweep starts there
        const a0 = tp && tp.ok ? Math.atan2(-(tp.y - e.cy), tp.x - e.cx) : 0;
        ctx.strokeStyle = s.given ? P.gold : P.goldDim;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(cx, cy, e.r * sc, a0, a0 + Math.PI * 2 * f);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (f < 1) { // compass leg while sweeping
          const aEnd = a0 + Math.PI * 2 * f;
          ctx.strokeStyle = P.inkFaint;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + e.r * sc * Math.cos(aEnd), cy + e.r * sc * Math.sin(aEnd));
          ctx.stroke();
          ctx.fillStyle = P.inkFaint;
          ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
        }
      }

      // lines: faint dashed production + solid defining segment
      for (const s of con.steps) {
        if (s.op !== 'line') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok) continue;
        const f = animOf(s.id, t);
        const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
        const ux = (e.x2 - e.x1) / L, uy = (e.y2 - e.y1) / L;
        const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
        if (f > 0.75) { // productions appear as the stroke finishes
          const [px, py] = w2s(mx - ux * ext, my - uy * ext);
          const [qx, qy] = w2s(mx + ux * ext, my + uy * ext);
          ctx.strokeStyle = P.line;
          ctx.globalAlpha = Math.min((f - 0.75) * 4, 1);
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 6]);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        const [x1, y1] = w2s(e.x1, e.y1);
        const [x2, y2] = w2s(e.x1 + (e.x2 - e.x1) * f, e.y1 + (e.y2 - e.y1) * f);
        ctx.strokeStyle = s.given ? P.goldDim : P.inkDim;
        ctx.lineWidth = s.given ? 1.7 : 1.4;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }

      // witness flash (quest just completed)
      const wA = anims.get('witness');
      if (wA) {
        if (wA.t0 == null) wA.t0 = t;
        const f = (t - wA.t0) / wA.dur;
        if (f >= 1) anims.delete('witness');
        else {
          const pulse = 0.35 + 0.65 * Math.abs(Math.sin(f * Math.PI * 3));
          ctx.save();
          ctx.globalAlpha = pulse * (1 - f * 0.4);
          ctx.strokeStyle = P.verdant;
          ctx.lineWidth = 2.6;
          for (const [p, q] of (wA.w.segs || [])) {
            const pe = curEval.get(p), qe = curEval.get(q);
            if (!pe?.ok || !qe?.ok) continue;
            const [x1, y1] = w2s(pe.x, pe.y), [x2, y2] = w2s(qe.x, qe.y);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
          for (const lid of (wA.w.lines || [])) {
            const le = curEval.get(lid);
            if (!le?.ok) continue;
            const L = Math.hypot(le.x2 - le.x1, le.y2 - le.y1);
            const ux = (le.x2 - le.x1) / L, uy = (le.y2 - le.y1) / L;
            const mx = (le.x1 + le.x2) / 2, my = (le.y1 + le.y2) / 2;
            const [x1, y1] = w2s(mx - ux * ext, my - uy * ext);
            const [x2, y2] = w2s(mx + ux * ext, my + uy * ext);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
          for (const pid of (wA.w.pts || [])) {
            const pe = curEval.get(pid);
            if (!pe?.ok) continue;
            const [x, y] = w2s(pe.x, pe.y);
            ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();
        }
      }

      // pending-move preview
      if (pending != null && cursorW) {
        const pe = curEval.get(pending);
        if (pe && pe.ok) {
          const [ax, ay] = w2s(pe.x, pe.y);
          const [cxs, cys] = w2s(cursorW[0], cursorW[1]);
          ctx.strokeStyle = P.gold;
          ctx.globalAlpha = 0.6;
          ctx.setLineDash([4, 5]);
          ctx.lineWidth = 1.2;
          if (tool === 'line') {
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cxs, cys); ctx.stroke();
          } else if (tool === 'circle') {
            const r = Math.hypot(cxs - ax, cys - ay);
            if (r > 2) {
              ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cxs, cys); ctx.stroke();
            }
          }
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          // pulsing anchor ring
          ctx.strokeStyle = P.goldBright;
          ctx.beginPath();
          ctx.arc(ax, ay, 8 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // points + labels
      ctx.font = labelFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      for (const s of con.steps) {
        if (s.kind !== 'pt') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok) continue;
        const [x, y] = w2s(e.x, e.y);
        const f = animOf(s.id, t);
        const rBase = s.given ? 5 : 4;
        const r = rBase * (1 + 0.9 * (1 - f));
        ctx.fillStyle = s.given ? P.gold : s.op === 'meet' ? P.azure : P.ink;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        if (s.id === hoverPt) {
          ctx.strokeStyle = P.ink;
          ctx.globalAlpha = 0.6;
          ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = s.given ? P.goldBright : P.inkDim;
        ctx.fillText(s.label, x + 8, y - 6);
      }

      // phantom intersection under the cursor
      if (hoverPh) {
        const [x, y] = w2s(hoverPh.x, hoverPh.y);
        const rr = 6 + Math.sin(t * 6) * 1.5;
        ctx.strokeStyle = P.azure;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - rr - 4, y); ctx.lineTo(x - rr + 2, y);
        ctx.moveTo(x + rr - 2, y); ctx.lineTo(x + rr + 4, y);
        ctx.moveTo(x, y - rr - 4); ctx.lineTo(x, y - rr + 2);
        ctx.moveTo(x, y + rr - 2); ctx.lineTo(x, y + rr + 4);
        ctx.stroke();
      }
    }

    const loop = cv.rafLoop(draw);
    setTool('point');
    setupQuest(0);
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() { loop.stop(); bus.mute(); },
      resume() { bus.unmute(); loop.start(); },
      destroy() {
        loop.stop();
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('contextmenu', onCtx);
        handle.destroy();
        bus.dispose();
        styleEl.remove();
      },
    };
  },
};

/* ================= tests ================= */

export const _test = {
  // graph
  newConstruction, addFree, addLine, addCircle, addMeet, undoLast,
  normalizePair, labelOf, lineName,
  // kernel
  intersectLineLine, intersectLineCircle, intersectCircleCircle, intersectEval,
  evaluate, evalSets, mulberry32,
  // constructions & goal checkers
  buildI1, findEquilateral, findMidpoint, findBisector, findPerpAt, findSegCopy,
  // transcript
  stepSentence,
  // batteries included
  selfTest,
};
