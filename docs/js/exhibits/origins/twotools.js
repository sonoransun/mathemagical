// I — The Two Tools
// Euclid's construction game: unmarked straightedge + collapsing compass.
// Constructions are stored as a dependency graph (every object knows its
// parents and the operation that made it), which buys several things at once:
// a proof transcript in Euclid's idiom, cheap undo and leaf-pruning, a "tower
// meter" (how many square roots a point's making costs), and honest
// goal-checking — a quest is verified by re-instantiating the whole
// construction from jittered seed points and re-checking numerically, so a
// lucky drawing never passes.
//
// The geometry kernel below is pure (no DOM) and exported via _test.
//
// Sources checked at build time (September 2026): Heath's Elements and
// Heiberg's Greek (Perseus 1999.01.0086 / 1999.01.0085: I.1, I.2, I.9, I.10,
// I.11, I.46); Proclus, In Eucl. (Morrow) via MacTutor "Proclus and the history
// of geometry"; SEP "Speusippus" (Proclus 77.15–78.6); MacTutor Euclid
// (Elephantine ostraca), Pasch, Mohr, Mascheroni, Menaechmus (Stobaeus),
// "Doubling the cube", "Trisecting an angle", "Pappus on the trisection";
// Plutarch, De genio Socratis 579 (Loeb, LacusCurtius); Hilbert, "Les
// principes fondamentaux de la géométrie", Ann. ENS 17 (1900), note on the
// "axiome d'intégrité (Vollständigkeit)"; Lützen, Hist. Math. 36 (2009)
// 374–394 (Wantzel, Petersen, Hartshorne); Toussaint, Math. Intelligencer 15
// (1993); Zeuthen, Math. Ann. 47 (1896); Knorr, Ancient Philosophy 3 (1983);
// Avigad–Dean–Mumma, RSL 2 (2009); Beeson–Narboux–Wiedijk, AMAI 85 (2019);
// Trinh et al., Nature 625 (2024); arXiv 2502.03544; Fudos & Stamati, CAD'24;
// W. Keller's Fermat factoring status (Dec 2025).

/* ================= geometry kernel (pure) ================= */

const LABELS = 'ABCDEFGHKLMNOPQRSTUVWXYZ'; // Heath's diagrams skip I and J

function autoLabel(i) {
  return LABELS[i % LABELS.length] + '′'.repeat(Math.floor(i / LABELS.length));
}

function newConstruction() {
  return { steps: [], byId: new Map(), nextId: 1, labelPtr: 0, hue: 0 };
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
  const labelIdx = hasLabel ? null : con.labelPtr;
  return addStep(con, {
    op: 'free', kind: 'pt', x, y,
    label: hasLabel ? opts.label : autoLabel(con.labelPtr++),
    autoLabel: !hasLabel, labelIdx, given: !!opts.given, parents: [],
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
  const labelIdx = con.labelPtr;
  return addStep(con, {
    op: 'meet', kind: 'pt', parents: [p1, p2], branch,
    label: autoLabel(con.labelPtr++), autoLabel: true, labelIdx,
  });
}

function undoLast(con) {
  const s = con.steps.pop();
  if (!s) return null;
  con.byId.delete(s.id);
  if (s.autoLabel && (s.labelIdx == null || s.labelIdx === con.labelPtr - 1)) con.labelPtr--;
  return s;
}

// Leaf pruning: remove any non-given step that nothing depends on. Labels are
// never reused while a later label is still standing, so no two points share one.
function isLeaf(con, id) {
  for (const s of con.steps) if (s.parents.includes(id)) return false;
  return true;
}
function removeStep(con, id) {
  const s = con.byId.get(id);
  if (!s || s.given || !isLeaf(con, id)) return null;
  con.steps.splice(con.steps.indexOf(s), 1);
  con.byId.delete(id);
  if (s.autoLabel && s.labelIdx === con.labelPtr - 1) con.labelPtr--;
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
  const disc = b * b - 4 * a * c;
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

// Every crossing of two drawn curves not yet claimed as a point — the only
// new points the game grants. Deduplicated against standing points and each other.
function claimable(con, ev, dedupe = 1e-7) {
  const curves = con.steps.filter((s) => (s.op === 'line' || s.op === 'circle') && ev.get(s.id)?.ok);
  const taken = [];
  for (const s of con.steps) {
    if (s.kind !== 'pt') continue;
    const e = ev.get(s.id);
    if (e && e.ok) taken.push(e);
  }
  const out = [];
  const near = (arr, p) => arr.some((q) => Math.abs(q.x - p.x) < dedupe && Math.abs(q.y - p.y) < dedupe);
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const [p1, p2] = normalizePair(con, curves[i].id, curves[j].id);
      const pts = intersectEval(ev.get(p1), ev.get(p2));
      for (let bi = 0; bi < pts.length; bi++) {
        const p = pts[bi];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (near(taken, p) || near(out, p)) continue;
        out.push({ p1, p2, branch: bi, x: p.x, y: p.y });
      }
    }
  }
  return out;
}

/* ---------- the tower meter ---------- */

function ancestry(con, id) {
  const seen = new Set(), stack = [id];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k)) continue;
    seen.add(k);
    const s = con.byId.get(k);
    if (s) for (const p of s.parents) stack.push(p);
  }
  return seen;
}

// How many square roots a point's making can cost: each crossing that involves
// a circle adjoins at most one square root; line–line crossings are rational.
// So the point's coordinates have degree at most 2^k over the givens.
function sqrtDepth(con, id) {
  let k = 0, random = false;
  for (const a of ancestry(con, id)) {
    const s = con.byId.get(a);
    if (!s) continue;
    if (s.op === 'free' && !s.given) random = true;
    if (s.op === 'meet') {
      const k1 = con.byId.get(s.parents[0])?.kind, k2 = con.byId.get(s.parents[1])?.kind;
      if (k1 === 'circle' || k2 === 'circle') k++;
    }
  }
  return { k, random };
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

/* ---------- regular polygons (free play) ---------- */

// The n vertices of the regular n-gon on which P0 → P1 is a counter-clockwise
// edge (world y up), starting at P0.
function polygonVerts(P0, P1, n) {
  const sx = P1.x - P0.x, sy = P1.y - P0.y, s = Math.hypot(sx, sy);
  if (!(s > 1e-12) || n < 3) return [];
  const d = (s / 2) / Math.tan(Math.PI / n);
  const ox = (P0.x + P1.x) / 2 - (sy / s) * d, oy = (P0.y + P1.y) / 2 + (sx / s) * d;
  const vx = P0.x - ox, vy = P0.y - oy, out = [];
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / n, c = Math.cos(a), si = Math.sin(a);
    out.push({ x: ox + c * vx - si * vy, y: oy + si * vx + c * vy });
  }
  return out;
}

function polygonIn(ev, ids, n, tol) {
  const P0 = ev.get(ids[0]), P1 = ev.get(ids[1]);
  if (!P0?.ok || !P1?.ok) return false;
  const vs = polygonVerts(P0, P1, n), s = dd(P0, P1);
  if (!vs.length) return false;
  for (let k = 2; k < n; k++) {
    const e = ev.get(ids[k]);
    if (!e?.ok || Math.hypot(e.x - vs[k].x, e.y - vs[k].y) > tol * s) return false;
  }
  return true;
}

// The largest regular polygon (n ≥ nMin) whose vertices are all standing
// points, confirmed under jitter — so a polygon eyeballed from random points fails.
function findRegularPolygon(con, opts = {}) {
  const nMin = opts.nMin ?? 4, nMax = opts.nMax ?? 17, tol = opts.tol ?? 1e-6;
  const ev = evaluate(con);
  const pts = [];
  for (const id of pointIds(con)) { const e = ev.get(id); if (e && e.ok) pts.push({ id, e }); }
  const m = pts.length;
  if (m < nMin || m > (opts.maxPoints ?? 48)) return null;
  let sets = null;
  for (let n = Math.min(nMax, m); n >= nMin; n--) {
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        if (i === j) continue;
        const vs = polygonVerts(pts[i].e, pts[j].e, n);
        if (!vs.length) continue;
        const s = dd(pts[i].e, pts[j].e);
        const ids = [pts[i].id, pts[j].id];
        for (let k = 2; k < n; k++) {
          let hit = null;
          for (const p of pts) {
            if (Math.abs(p.e.x - vs[k].x) <= tol * s && Math.abs(p.e.y - vs[k].y) <= tol * s) { hit = p.id; break; }
          }
          if (hit == null || ids.includes(hit)) break;
          ids.push(hit);
        }
        if (ids.length !== n) continue;
        sets = sets || evalSets(con, opts);
        if (sets.every((e2) => polygonIn(e2, ids, n, tol))) return { n, ids };
      }
    }
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

// The trisection trap's given angle: exactly 60°, two thirds of a right angle.
const TRAP_SEED = { a: [0, -0.75], b: [1.7, -0.75], c: [0.85, -0.75 + 0.85 * Math.sqrt(3)] };

/* ---------- proof transcript (Euclid's idiom, one sentence per step) ---------- */

function stepSentence(con, step) {
  if (step.given) return null; // givens are covered by the quest's preamble
  const L = (id) => labelOf(con, id);
  if (step.op === 'free') {
    return { main: `Let a point ${step.label} be taken at random.`, cite: '' };
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

  // tower meter: the midpoint is two circle crossings up, over rational line–line
  const sd = sqrtDepth(con3, m);
  ok(sd.k === 2 && sd.random, 'tower meter: the I.10 midpoint costs 2 square roots (degree ≤ 4), and leans on its unmarked seeds');
  ok(sqrtDepth(con, t.c).k === 1, 'tower meter: the I.1 apex costs 1 square root');

  // Euclid's own I.2, as Heath lays it out: the triangle DAB, DA and DB produced, the circle
  // about B through C cutting DB beyond B at G, the circle about D through G cutting DA beyond A at L
  const con8 = newConstruction();
  const a8 = addFree(con8, -1.35, 0.75, { given: true }), b8 = addFree(con8, 0.5, -0.6, { given: true });
  const c8 = addFree(con8, 1.45, 0.15, { given: true });
  const d8 = buildI1(con8, a8, b8).c;
  const da8 = addLine(con8, d8, a8), db8 = addLine(con8, d8, b8);
  const kb8 = addCircle(con8, b8, c8);
  const far = (lid, cid, fromId, away) => {       // branch of line × circle farther from (or nearer to) a point
    const e = evaluate(con8), P0 = e.get(fromId), pts = intersectEval(e.get(lid), e.get(cid));
    const d0 = dd(pts[0], P0), d1 = dd(pts[1], P0);
    return away ? (d0 > d1 ? 0 : 1) : (d0 < d1 ? 0 : 1);
  };
  const g8 = addMeet(con8, db8, kb8, far(db8, kb8, d8, true));
  const kd8 = addCircle(con8, d8, g8);
  const l8 = addMeet(con8, da8, kd8, far(da8, kd8, a8, false));
  ok(findSegCopy(con8, a8, b8, c8) === l8 && sqrtDepth(con8, l8).k === 3, 'I.2 as Euclid builds it: AL = BC, three floors up the tower');
  const con9 = newConstruction();
  const a9 = addFree(con9, -1.35, 0.75, { given: true }), b9 = addFree(con9, 0.5, -0.6, { given: true });
  const c9 = addFree(con9, 1.45, 0.15, { given: true });
  addFree(con9, -1.35 + Math.hypot(0.95, 0.75), 0.75);
  ok(findSegCopy(con9, a9, b9, c9) === null, 'I.2: a point set down at distance BC by eye fails under jitter');
  // the trap's arithmetic: cos 20° is a root of 8x³ − 6x − 1
  const c20 = Math.cos(Math.PI / 9);
  ok(Math.abs(8 * c20 ** 3 - 6 * c20 - 1) < 1e-14, 'cos 20° is a root of 8x³ − 6x − 1');

  // claimable crossings: I.1's two circles plus the given line AB
  const con4 = newConstruction();
  const a4 = addFree(con4, -1, 0, { given: true }), b4 = addFree(con4, 1, 0, { given: true });
  addLine(con4, a4, b4, { given: true });
  addCircle(con4, a4, b4); addCircle(con4, b4, a4);
  const cl = claimable(con4, evaluate(con4));
  ok(cl.length === 4, `claimable: two circle crossings plus the two far ends of AB (${cl.length})`);

  // leaf pruning keeps the graph and the labels honest
  const con5 = newConstruction();
  const p5 = addFree(con5, 0, 0), q5 = addFree(con5, 1, 0);
  const l5 = addLine(con5, p5, q5);
  const r5 = addFree(con5, 0.3, 0.7);
  ok(removeStep(con5, p5) === null, 'prune: a point a line depends on cannot be struck');
  ok(removeStep(con5, l5) !== null && !con5.byId.has(l5), 'prune: a leaf line is struck');
  ok(removeStep(con5, r5) !== null && con5.labelPtr === 2, 'prune: striking the last-lettered point frees its letter');

  // a regular hexagon walked round one circle with the compass (IV.15)
  const con6 = newConstruction();
  const o6 = addFree(con6, 0, 0), v0 = addFree(con6, 1, 0);
  const rim = addCircle(con6, o6, v0);
  let prev = null, cur = v0;
  for (let i = 0; i < 5; i++) {
    const kk = addCircle(con6, cur, o6);
    const evx = evaluate(con6);
    const pts = intersectEval(evx.get(normalizePair(con6, rim, kk)[0]), evx.get(normalizePair(con6, rim, kk)[1]));
    const prevE = prev == null ? null : evx.get(prev);
    let br = 0;
    if (prevE && pts.length > 1 && dd(pts[0], prevE) < 1e-9) br = 1;
    if (!prevE && pts.length > 1 && pts[0].y < 0) br = 1;       // walk counter-clockwise
    const nx = addMeet(con6, rim, kk, br);
    prev = cur; cur = nx;
  }
  const hex = findRegularPolygon(con6);
  ok(hex && hex.n === 6, `polygon recognizer finds the compass-walked hexagon (${hex ? hex.n : 'none'})`);
  const con7 = newConstruction();
  for (let i = 0; i < 6; i++) addFree(con7, Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3));
  ok(findRegularPolygon(con7) === null, 'polygon recognizer rejects a hexagon of random points under jitter');

  // the trap's angle is exactly 60°
  const ang = Math.atan2(TRAP_SEED.c[1] - TRAP_SEED.a[1], TRAP_SEED.c[0] - TRAP_SEED.a[0]) * 180 / Math.PI;
  ok(Math.abs(ang - 60) < 1e-12, `trap: the given angle is 60° (${ang.toFixed(12)})`);

  // transcript idiom
  const sCirc = stepSentence(con, con.byId.get(t.c1));
  ok(/Post\. 3/.test(sCirc.cite) && /centre A and distance AB/.test(sCirc.main), 'circle sentence speaks Euclid and cites Post. 3');
  const sMeet = stepSentence(con, con.byId.get(t.c));
  ok(sMeet.ccNote === true && /cut one another at the point C/.test(sMeet.main), 'circle-circle sentence flags the continuity gap');
  ok(/taken at random/.test(stepSentence(con5, con5.byId.get(q5)).main), 'a free point is “taken at random”, as Heath has it');

  return { pass, log };
}

/* ================= the exhibit ================= */

const PROSE = `
    <p>Around 300 BCE, in Alexandria, Euclid opened the <em>Elements</em> not with a fact but
    with a rulebook. Three of his five postulates are not truths at all but <em>moves</em>: to
    draw a straight line from any point to any point; to produce it; to describe a circle with
    any centre and distance. The playing pieces are two tools, deliberately crippled. The
    straightedge is not a ruler: it carries no marks, remembers no lengths, and will do nothing
    but join and extend. The compass is stranger still. Read strictly, as his second
    proposition invites us to read it, it <em>collapses</em>, folding shut the
    instant it leaves the page, so that it cannot carry a distance from one place to another.
    Whatever geometry is to be must be won from these beggared instruments and nothing
    else.</p>
    <p>The first proposition is a dare: <em>on a given finite straight line to construct an
    equilateral triangle</em>. Notice the verb. Euclid does not announce that such a triangle
    exists; he builds it, with two circles and two strokes of the straightedge, and he signs off
    not with the <em>which was to be proved</em> of a theorem but with ὅπερ ἔδει ποιῆσαι,
    <em>which was required to do</em>. On one influential reading, argued by the Danish
    historian H. G. Zeuthen in 1896 and disputed since, the building is the proof: in this game,
    to exist is to be constructible. The quarrel is older than Euclid. Proclus reports that
    Speusippus, Plato’s nephew and his successor at the Academy, wanted every proposition called
    a theorem, because “there is no coming-to-be among the eternal things”; the geometer, on that
    view, only treats “the things that always are as if they were coming-to-be.” Among the
    makings Proclus gives as examples are the very acts waiting on the stage: constructing an
    equilateral triangle, placing a line at a given point. Alongside the figure, a column writes
    the deduction as you click, and when the goal stands, the proof signs itself.</p>
    <p>Be careful, though, about crediting Euclid with too much. Proclus, our chief witness,
    writing some seven centuries after him, says that Hippocrates of Chios was “the first man
    on record who also composed <em>Elements</em>,” more than a century earlier, and that Euclid’s part
    was to put in order many of the theorems of Eudoxus, to perfect many of Theaetetus’s, and
    to furnish with rigorous proofs what his predecessors had demonstrated less rigorously. We
    have nothing in his hand. The oldest Euclidean material to survive is a handful of
    potsherds from Elephantine Island, on the Nile more than five hundred miles south of
    Alexandria, inked in the third quarter of the third century BCE by someone working through
    results on the pentagon, hexagon, decagon and icosahedron that the <em>Elements</em>
    gathers in its thirteenth book. What Euclid built is the architecture: hundreds of
    propositions hanging from five postulates and five common notions, each hanging only on
    what came before. Mathematics as a game whose every claim traces back to declared rules is
    the invention, and this essay will not stop returning to it.</p>
    <p>From its first line the game is honestly imperfect. I.1 draws two circles and takes the
    point “in which the circles cut one another,” but no postulate promises that they cut
    anywhere. Each circle could slip through a gap in the other, if the plane had gaps; that it
    has none is a fact about <em>continuity</em>, and no one wrote it down as a rule until the
    nineteenth century rebuilt geometry from the floor. Moritz Pasch, in 1882, dragged Euclid’s
    unspoken assumptions about order, which point lies between which, into the open. David
    Hilbert’s <em>Grundlagen der Geometrie</em> of 1899 set the whole subject on declared
    axioms, yet the axiom that closes this particular gap arrived a year later, in a note
    Hilbert wrote for the French translation. The crack does not damn Euclid. It teaches the
    movement’s real lesson: rigor is not a possession but a horizon, and every age finds
    fissures its predecessors could not see.</p>
    <p>Two consolations, then a trap. First, the collapsing compass costs nothing. In his
    second proposition Euclid shows it can copy any distance anyway, a result the computational
    geometer Godfried Toussaint called “the earliest proof of the equivalence of models of
    computation.” It was not the last. In 1672 the Dane Georg Mohr proved that the straightedge
    can be thrown away altogether, since the compass alone reaches every point the pair can
    reach; his book lay forgotten until a copy turned up in a bookshop in 1928, long after
    Lorenzo Mascheroni had proved the same thing again in 1797. Quest five asks you to repeat
    Euclid’s trick, and your compass here genuinely collapses. Second, the two tools reach
    infinitely many points, and every one of them lives in a tower of nested square roots above
    the points you start from.</p>
    <p>That is the trap. Doubling a cube needs a length of <code>∛2</code>; trisecting a
    general angle needs the root of a cubic; squaring a circle needs a length of
    <code>√π</code>. None of these lives in any tower of square roots. The Greeks suspected as
    much: in the fourth century CE Pappus of Alexandria called the trisection “by its nature a
    solid problem,” work for conic sections rather than circles. But suspicion is not proof, and
    the proof waited until 1837, when Pierre Wantzel, still a student engineer in Paris, settled
    the cube and the angle in seven pages that almost nobody read. The circle held out until
    1882, when Ferdinand Lindemann proved π transcendental. The sixth quest invites you to try
    what geometers tried for two thousand years. Take your time.</p>`;

const CHRONICLE = [
  { year: -440, date: '5th c. BCE', text: 'Hippocrates of Chios, whom Proclus calls “the first man on record who also composed <em>Elements</em>,” reduces doubling the cube to finding two mean proportionals between two lines.' },
  { year: -300, date: 'c. 300 BCE', text: 'In Alexandria, Euclid opens the <em>Elements</em> with 23 definitions, five postulates and five common notions; its first proposition raises an equilateral triangle on a given line with two circles and two straight lines.' },
  { year: 320, date: '4th c. CE', text: 'In Book IV of his <em>Collection</em>, Pappus of Alexandria sorts problems into plane, solid and linear, and calls the trisection of an angle “by its nature a solid problem,” one for the conic sections rather than for line and circle.' },
  { year: 1796, date: '30 March 1796', text: 'Carl Friedrich Gauss, a month short of nineteen, opens his mathematical diary with the principles for dividing the circle geometrically “in septemdecim partes”: a regular seventeen-sided polygon by ruler and compass, unknown to the Greeks.' },
  { year: 1837, date: '1837', text: 'Pierre Wantzel, a student at the École des Ponts et Chaussées, proves in seven pages of Liouville’s <em>Journal</em> that ruler and compass can neither double the cube nor trisect the general angle.' },
  { year: 1882, date: '1882', text: 'Ferdinand Lindemann proves π transcendental in <em>Mathematische Annalen</em>, and with it that no finite sequence of lines and circles can square the circle.' },
  { year: 1900, date: '1900', text: 'In a note written for the French translation of his <em>Grundlagen der Geometrie</em>, David Hilbert adds an axiom of completeness, which matches the points of a line one-to-one with the real numbers and at last guarantees that Euclid’s two circles meet.' },
  { year: 2024, date: 'January 2024', text: 'DeepMind’s AlphaGeometry, pairing a language model that proposes auxiliary points, lines and circles with a symbolic deduction engine, solves 25 of 30 olympiad geometry problems within the time limits.' },
];

const TODAY = `
    <p>The game never ended; it moved into machines. In 2019 Michael Beeson, Julien Narboux and
    Freek Wiedijk had the proof checkers HOL Light and Coq verify all 48 propositions of Book I,
    keeping as close to Euclid’s own arguments as they could; filling his gaps and correcting
    his errors took 235 theorems in all. A decade earlier Jeremy Avigad, Edward Dean and John Mumma had shown that his
    diagrams were never mere decoration. Building on Ken Manders, they separated what a figure
    shows robustly (which point lies between which, which curves cross) from what it only
    suggests (that two lengths are equal), and gave a formal system for Euclid’s proofs that is
    sound and complete for ruler-and-compass geometry. The judge on this page works the same
    way: it shakes your figure and trusts only what survives.</p>
    <p>The creative step the game demands, adding the right circle, is still the hard part.
    DeepMind’s AlphaGeometry (<em>Nature</em>, January 2024) pairs a language model that
    proposes new points, lines and circles with a symbolic deduction engine; it solved 25 of 30
    olympiad geometry problems within the time limits, against 10 for the best earlier system
    and 25.9 for the average human gold medallist, and its successor solves 84 per cent of the
    olympiad’s geometry problems from 2000 to 2024. Engineers play a version of the game in
    parametric CAD. One family of constraint solvers, the constructive ones, rebuilds a
    designer’s sketch as a sequence of elementary constructions and must choose, at every
    crossing, which of two points the designer meant: the fork the plate above settles with a
    left-hand rule, and in 2024 Ioannis Fudos and Vasiliki Stamati proposed a neural network,
    trained on standard design libraries, to make that choice. In
    <a href="#ex-whereami">One More Circle</a>, Euclid’s two circles go into orbit, and a
    satellite receiver finds you where range circles cut, then throws the other point away.</p>
    <p>The two tools even reach an open question. Gauss and Wantzel between them showed that a
    regular polygon can be constructed exactly when its number of sides is a power of two times
    distinct Fermat primes, primes of the form 2<sup>2ⁿ</sup> + 1. Only five are known, 3, 5,
    17, 257 and 65,537, so only 31 regular polygons with an odd number of sides are known to be
    constructible. In Wilfrid Keller’s running tally, last revised in December 2025, every
    Fermat number from F<sub>5</sub> to F<sub>32</sub> is known to be composite;
    F<sub>33</sub>, some 2.6 billion digits long, is the first whose fate no one knows.</p>`;

const SOURCES = [
  { text: 'Euclid, <em>Elements</em>, trans. T. L. Heath (1908), with Heiberg’s Greek, Perseus Digital Library', url: 'https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0086' },
  { text: 'Proclus, <em>A Commentary on the First Book of Euclid’s Elements</em>, trans. G. R. Morrow (1970): the history of geometry, MacTutor', url: 'https://mathshistory.st-andrews.ac.uk/Extras/Proclus_history_geometry/' },
  { text: 'Russell Dancy and Giulia De Cesaris, “Speusippus,” <em>Stanford Encyclopedia of Philosophy</em> (rev. 2024), with Proclus on problems and theorems', url: 'https://plato.stanford.edu/entries/speusippus/' },
  { text: 'Pappus of Alexandria, <em>Collection</em> IV, on the trisection of an angle, MacTutor', url: 'https://mathshistory.st-andrews.ac.uk/Extras/Pappus_trisection/' },
  { text: 'Godfried T. Toussaint, “A New Look at Euclid’s Second Proposition,” <em>The Mathematical Intelligencer</em> 15 (1993) 12–24', url: 'https://doi.org/10.1007/BF03024252' },
  { text: 'Jesper Lützen, “Why was Wantzel overlooked for a century? The changing importance of an impossibility result,” <em>Historia Mathematica</em> 36 (2009) 374–394', url: 'https://doi.org/10.1016/j.hm.2009.03.001' },
  { text: 'David Hilbert, “Les principes fondamentaux de la géométrie,” <em>Annales scientifiques de l’É.N.S.</em> 17 (1900) 103–209', url: 'https://www.numdam.org/item/ASENS_1900_3_17__103_0/' },
  { text: 'Jeremy Avigad, Edward Dean and John Mumma, “A formal system for Euclid’s <em>Elements</em>,” <em>Review of Symbolic Logic</em> 2 (2009) 700–768', url: 'https://doi.org/10.1017/S1755020309990098' },
  { text: 'Michael Beeson, Julien Narboux and Freek Wiedijk, “Proof-checking Euclid,” <em>Annals of Mathematics and Artificial Intelligence</em> 85 (2019) 213–257', url: 'https://doi.org/10.1007/s10472-018-9606-x' },
  { text: 'Trieu H. Trinh, Yuhuai Wu, Quoc V. Le, He He and Thang Luong, “Solving olympiad geometry without human demonstrations,” <em>Nature</em> 625 (2024) 476–482', url: 'https://doi.org/10.1038/s41586-023-06747-5' },
];

const ALT = 'A construction plate: gold given points on a dark field, where the visitor draws circles and ' +
  'straight lines with Euclid’s two tools and claims the points where they cross, while a column beside the ' +
  'figure writes each move as a sentence of the Elements and signs ΟΠΕΡ ΕΔΕΙ ΠΟΙΗΣΑΙ when the goal is ' +
  'reached; a sixth quest asks for a trisection and is interrupted by the proof that it cannot be done.';

export default {
  id: 'twotools',
  movement: 1,
  title: 'The Two Tools',
  hook: 'Solve a 2,300-year-old problem with your own hands — using only the two tools Euclid allows.',
  era: 'c. 300 BCE – 1900 · Alexandria, Paris, Göttingen',
  chronicle: CHRONICLE,
  today: TODAY,
  sources: SOURCES,
  alt: ALT,
  prose: PROSE,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const TAU = Math.PI * 2;
    const reduced = (() => {
      try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
      catch { return false; }
    })();
    const rgba = (hex, a) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };
    const CRIMSON_B = P.crimsonBright || '#d97a68';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    let SERIF = 'Georgia, "Times New Roman", serif';
    try { const f = getComputedStyle(document.body).fontFamily; if (f) SERIF = f; } catch { /* keep */ }
    const font = (px, style = '') => `${style ? style + ' ' : ''}${px}px ${SERIF}`;
    const BYRNE = [CRIMSON_B, P.goldBright, P.azure, P.ink];   // Byrne’s red, yellow, blue and black, on a dark page
    let destroyed = false;

    /* ---------- scoped styles ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-twotools .tt-ladder{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .38rem;margin:.1rem 0 .8rem}
      #ex-twotools .tt-rung{font:inherit;font-size:.8rem;line-height:1;font-variant-numeric:lining-nums;letter-spacing:.03em;
        min-width:2.45rem;height:1.95rem;padding:0 .55rem;border-radius:999px;border:1px solid ${P.line};
        background:transparent;color:${P.inkDim};cursor:pointer;transition:border-color .25s,color .25s,background-color .25s}
      #ex-twotools .tt-rung:hover:not(:disabled){border-color:${P.goldDim};color:${P.goldBright}}
      #ex-twotools .tt-rung.solved{background:${rgba(P.gold, 0.13)};border-color:${P.goldDim};color:${P.goldBright}}
      #ex-twotools .tt-rung.spoken{background:${rgba(P.crimson, 0.14)};border-color:${P.crimson};color:${CRIMSON_B}}
      #ex-twotools .tt-rung[aria-current="step"]{border-color:${P.gold};color:${P.goldBright};box-shadow:0 0 0 2px ${rgba(P.gold, 0.18)}}
      #ex-twotools .tt-rung:disabled{opacity:.45;cursor:default}
      #ex-twotools .tt-rung:focus-visible{outline:2px solid ${P.goldBright};outline-offset:2px}
      #ex-twotools .tt-ladder .tt-next{margin-left:auto}
      #ex-twotools .tt-tools{margin:0 0 .75rem;gap:.55rem .6rem}
      #ex-twotools .tt-toolbtn{display:inline-flex;align-items:center;gap:.45em;line-height:1.2}
      #ex-twotools .tt-ico{flex:0 0 auto;display:block}
      #ex-twotools .tt-flex.side .tt-proof{align-self:stretch}
      #ex-twotools .tt-flex{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
      #ex-twotools .tt-canvas{flex:1 1 440px;min-width:0;min-height:250px;max-height:520px;overflow:hidden;position:relative}
      #ex-twotools .tt-canvas canvas{cursor:crosshair}
      #ex-twotools .tt-canvas canvas:focus{outline:none}
      #ex-twotools .tt-canvas canvas:focus-visible{outline:2px solid ${P.goldBright};outline-offset:2px}
      #ex-twotools .tt-proof{flex:1 1 250px;min-width:0;max-height:17rem;overflow-y:auto;overscroll-behavior:contain;
        background:linear-gradient(180deg,${rgba(P.goldBright, 0.05)},${rgba(P.goldBright, 0)} 40%),${P.panel};
        border:1px solid ${P.line};border-radius:3px;padding:1rem 1.1rem 1.1rem 1.9rem;
        box-shadow:inset 0 0 0 4px ${P.panel},inset 0 0 0 5px ${rgba(P.gold, 0.2)};
        font-size:.86rem;line-height:1.6;color:${P.ink};counter-reset:ttstep;scrollbar-width:thin;
        scrollbar-color:${P.goldDim} transparent}
      #ex-twotools .tt-flex.side .tt-proof{max-width:340px}
      #ex-twotools .tt-proof h4{margin:0 0 .6rem -.35rem;letter-spacing:.08em;font-weight:500;
        font-variant-caps:all-small-caps;font-size:.82rem;color:${P.inkDim}}
      #ex-twotools .tt-prop{color:${P.goldBright};font-style:italic;margin:0 0 .25rem;font-size:.95rem;line-height:1.45}
      #ex-twotools .tt-prop::first-letter{float:left;font-style:normal;font-size:2.55em;line-height:.86;
        margin:.06em .1em 0 0;color:${P.gold}}
      #ex-twotools .tt-greek{color:${P.inkDim};font-size:.78rem;line-height:1.45;margin:0 0 .7rem;opacity:.9}
      #ex-twotools .tt-proof p{margin:0 0 .5rem}
      #ex-twotools .tt-given{color:${P.inkDim};font-style:italic}
      #ex-twotools .tt-empty{color:${P.inkDim};font-style:italic;opacity:.75}
      #ex-twotools .tt-step{position:relative;counter-increment:ttstep;padding:.12rem 1.35rem .12rem .5rem;margin-left:-.5rem;margin-right:-.9rem;
        border-radius:2px;transition:background-color .2s,box-shadow .2s}
      #ex-twotools .tt-step::before{content:counter(ttstep);position:absolute;left:-1.12rem;top:.24rem;width:.95rem;text-align:right;
        font-size:.66rem;color:${P.inkDim};opacity:.7;font-variant-numeric:oldstyle-nums}
      #ex-twotools .tt-step.tt-hi{background:${rgba(P.gold, 0.1)};box-shadow:inset 2px 0 0 ${P.goldBright}}
      #ex-twotools .tt-step.tt-new{animation:tt-ink .9s ease-out}
      @keyframes tt-ink{from{background:${rgba(P.goldBright, 0.16)}}to{background:transparent}}
      #ex-twotools .tt-glyph{display:none;vertical-align:-.12em;margin-right:.35em}
      #ex-twotools .tt-proof.byrne .tt-glyph{display:inline-block}
      #ex-twotools .tt-cite{color:${P.azure};opacity:.75;font-size:.68rem;font-family:${MONO};margin-left:.35rem;white-space:nowrap}
      #ex-twotools .tt-strike{position:absolute;right:.1rem;top:.05rem;border:0;background:${P.panel};
        color:${P.inkDim};font:inherit;font-size:.85rem;line-height:1;padding:.15rem .3rem;border-radius:3px;cursor:pointer;
        opacity:0;pointer-events:none;transition:opacity .15s}
      #ex-twotools .tt-step:not(.leaf) .tt-strike{display:none}
      #ex-twotools .tt-step.leaf:hover .tt-strike,#ex-twotools .tt-step.leaf .tt-strike:focus-visible,
      #ex-twotools .tt-step.leaf.tt-hi .tt-strike{opacity:1;pointer-events:auto}
      #ex-twotools .tt-strike:focus-visible{outline:2px solid ${P.goldBright};outline-offset:1px}
      #ex-twotools .tt-strike:hover{color:${CRIMSON_B}}
      @media (hover:none){#ex-twotools .tt-step.leaf .tt-strike{opacity:.6;pointer-events:auto}}
      #ex-twotools .tt-therefore{font-style:italic;color:${P.ink};margin-top:.7rem !important}
      #ex-twotools .tt-qef{color:${P.gold};text-align:right;letter-spacing:.2em;margin-top:.7rem;font-size:.84rem;
        opacity:1;transition:opacity 1.1s ease-out,letter-spacing 1.4s cubic-bezier(.2,.7,.2,1)}
      #ex-twotools .tt-qef.pre{opacity:0;letter-spacing:.55em}
      #ex-twotools .tt-qef small{display:block;letter-spacing:.02em;color:${P.inkDim};font-style:italic;font-size:.72rem;margin-top:.15rem}
      #ex-twotools .tt-foot{margin-top:.8rem;padding-top:.6rem;border-top:1px dashed ${P.line};
        color:${P.inkDim};font-size:.74rem;font-style:italic;line-height:1.5}
      #ex-twotools .tt-interrupt{margin-top:1rem;border:1px solid ${P.crimson};border-left-width:4px;
        border-radius:3px;background:linear-gradient(90deg,${rgba(P.crimson, 0.08)},transparent 60%),${P.panel};padding:1rem 1.2rem}
      #ex-twotools .tt-interrupt .tt-int-title{color:${CRIMSON_B};font-size:.84rem;letter-spacing:.16em;
        font-variant-caps:all-small-caps;margin-bottom:.5rem}
      #ex-twotools .tt-interrupt p{margin:0 0 .7rem;font-size:.93rem;line-height:1.65;color:${P.ink}}
      #ex-twotools .tt-interrupt p:last-child{margin-bottom:0}
      #ex-twotools .tt-interrupt figure{margin:.2rem 0 .9rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
      #ex-twotools .tt-interrupt figure svg{flex:0 0 auto;width:214px;max-width:100%;height:auto}
      #ex-twotools .tt-interrupt figcaption{flex:1 1 12rem;min-width:0;font-size:.8rem;font-style:italic;color:${P.inkDim};line-height:1.5}
      #ex-twotools .tt-keys{font-size:.82rem;margin-top:.45rem}
      @media (max-width:560px){
        #ex-twotools .tt-tools{gap:.45rem .4rem}
        #ex-twotools .tt-toolbtn{padding:.4rem .62rem;font-size:.88rem;letter-spacing:.02em}
        #ex-twotools .tt-rung{min-width:2.2rem;padding:0 .42rem}
      }
      @media (prefers-reduced-motion: reduce){
        #ex-twotools .tt-qef,#ex-twotools .tt-rung,#ex-twotools .tt-step{transition:none}
        #ex-twotools .tt-step.tt-new{animation:none}
      }`;
    stage.appendChild(styleEl);

    /* ---------- quest definitions ---------- */
    const QUESTS = [
      {
        key: 'i1', short: 'I.1', name: 'Elements I.1 · the equilateral triangle',
        prop: 'On a given finite straight line to construct an equilateral triangle.',
        greek: 'Ἐπὶ τῆς δοθείσης εὐθείας πεπερασμένης τρίγωνον ἰσόπλευρον συστήσασθαι.',
        banner: 'Quest 1 of 7 · On the segment <em>AB</em>, construct an equilateral triangle. <code>[Elements I.1]</code>',
        preamble: 'Let AB be the given finite straight line. It is required to construct an equilateral triangle on AB.',
        intro: 'Two points and their segment are given. All of Greek geometry now waits on your first circle.',
        view: { cx: 0, cy: 0.25, w: 6.8, h: 4.75 },
        seeds(con) {
          const a = addFree(con, -1, 0, { given: true });
          const b = addFree(con, 1, 0, { given: true });
          addLine(con, a, b, { given: true });
          return { a, b };
        },
        hints: [
          'Postulate 3 is your only way to conjure a new length: take the compass, pin it at A, open it to B.',
          'Now a second circle: centre B, distance BA. Two circles, each through the other’s centre.',
          'Where the circles cut one another a faint mark waits: claim that point, then join it to A and to B with the straightedge.',
        ],
        check(con, ids) { const c = findEquilateral(con, ids.a, ids.b); return c == null ? null : { c }; },
        witness(ids, w) {
          return { pts: [w.c], segs: [[ids.a, w.c], [ids.b, w.c], [ids.a, ids.b]], ticks: [[ids.a, w.c], [ids.b, w.c], [ids.a, ids.b]], fill: [ids.a, ids.b, w.c] };
        },
        qef(con, ids, w) {
          return `Therefore the triangle ${labelOf(con, ids.a)}${labelOf(con, ids.b)}${labelOf(con, w.c)} is equilateral, and it has been constructed on the given finite straight line ${labelOf(con, ids.a)}${labelOf(con, ids.b)}.`;
        },
        doneText: 'The triangle stands, and it stands on <em>every</em> AB: drag a gold point and the whole proof follows.',
      },
      {
        key: 'i10', short: 'I.10', name: 'Elements I.10 · bisect a segment',
        prop: 'To bisect a given finite straight line.',
        greek: 'Τὴν δοθεῖσαν εὐθεῖαν πεπερασμένην δίχα τεμεῖν.',
        banner: 'Quest 2 of 7 · Cut the segment <em>AB</em> into two equal parts. <code>[I.10]</code>',
        preamble: 'Let AB be the given finite straight line. It is required to bisect AB.',
        intro: 'No marked ruler, no halving by eye. Equality must be built out of circles.',
        view: { cx: -0.1, cy: 0.05, w: 6.6, h: 4.7 },
        seeds(con) {
          const a = addFree(con, -1.1, 0.1, { given: true });
          const b = addFree(con, 0.9, -0.3, { given: true });
          addLine(con, a, b, { given: true });
          return { a, b };
        },
        hints: [
          'Begin as in I.1: the twin circles, centre A distance AB and centre B distance BA, cut twice, above and below.',
          'Join the two cutting points. That straight line has no favourite side of AB.',
          'Claim the point where your new line cuts AB itself: straight line meets straight line.',
        ],
        check(con, ids) { const m = findMidpoint(con, ids.a, ids.b); return m == null ? null : { m }; },
        witness(ids, w) { return { pts: [w.m], segs: [[ids.a, w.m], [w.m, ids.b]], ticks: [[ids.a, w.m], [w.m, ids.b]] }; },
        qef(con, ids, w) {
          return `Therefore the given finite straight line ${labelOf(con, ids.a)}${labelOf(con, ids.b)} has been bisected at the point ${labelOf(con, w.m)}.`;
        },
        doneText: 'Bisected, and the midpoint clings to AB however the endpoints wander. Euclid’s own I.10 goes another way: the triangle of I.1 on AB, then its apex angle halved by I.9. Proposition by proposition, the game builds its own tools.',
      },
      {
        key: 'i9', short: 'I.9', name: 'Elements I.9 · bisect an angle',
        prop: 'To bisect a given rectilineal angle.',
        greek: 'Τὴν δοθεῖσαν γωνίαν εὐθύγραμμον δίχα τεμεῖν.',
        banner: 'Quest 3 of 7 · Cut the angle <em>BAC</em> into two equal angles. <code>[I.9]</code>',
        preamble: 'Let the angle BAC be the given rectilineal angle. It is required to bisect it.',
        intro: 'The arms AB and AC have different lengths, on purpose. Equal distances come first.',
        view: { cx: 0.05, cy: 0, w: 6.0, h: 4.3 },
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
          'You now hold two points at equal distances from A, one on each arm. Describe circles on them, each through the other: I.1 again.',
          'Join A to a point where those circles cut. That line splits the angle in two.',
        ],
        check(con, ids) { const l = findBisector(con, ids.a, ids.b, ids.c); return l == null ? null : { l }; },
        witness(ids, w) { return { pts: [], segs: [], lines: [w.l], bisect: { v: ids.a, p: ids.b, q: ids.c, l: w.l } }; },
        qef(con, ids, w) {
          return `Therefore the angle ${labelOf(con, ids.b)}${labelOf(con, ids.a)}${labelOf(con, ids.c)} has been bisected by the straight line ${lineName(con, w.l)}.`;
        },
        doneText: 'Halved. Euclid takes a point at random on one arm, cuts off an equal length on the other, and raises I.1’s triangle between them; the judge accepts your route as readily as his.',
      },
      {
        key: 'i11', short: 'I.11', name: 'Elements I.11 · a right angle',
        prop: 'To draw a straight line at right angles to a given straight line from a given point on it.',
        greek: 'Τῇ δοθείσῃ εὐθείᾳ ἀπὸ τοῦ πρὸς αὐτῇ δοθέντος σημείου πρὸς ὀρθὰς γωνίας εὐθεῖαν γραμμὴν ἀγαγεῖν.',
        banner: 'Quest 4 of 7 · From the point <em>A</em>, raise a line at right angles to <em>AB</em>. <code>[I.11]</code>',
        preamble: 'Let AB be the given straight line, and A the given point on it. It is required to draw from the point A a straight line at right angles to AB.',
        intro: 'A right angle, from tools that cannot measure any angle at all.',
        view: { cx: -0.2, cy: -0.4, w: 7.2, h: 4.9 },
        seeds(con) {
          const a = addFree(con, -0.2, -0.4, { given: true });
          const b = addFree(con, 0.9, -0.2, { given: true });
          addLine(con, a, b, { given: true });
          return { a, b };
        },
        hints: [
          'With centre A and distance AB, describe a circle: it cuts the line AB a second time, on the far side of A. Claim that point.',
          'Two points on the line, at equal distances from A. Build I.1’s twin circles on them.',
          'Join the two crossings of those big circles: the line runs straight through A, at right angles.',
        ],
        check(con, ids) { const l = findPerpAt(con, ids.a, ids.b); return l == null ? null : { l }; },
        witness(ids, w) { return { pts: [], segs: [], lines: [w.l], right: { v: ids.a, p: ids.b, l: w.l } }; },
        qef(con, ids, w) {
          return `Therefore the straight line ${lineName(con, w.l)} has been drawn at right angles to the given straight line ${labelOf(con, ids.a)}${labelOf(con, ids.b)} from the point ${labelOf(con, ids.a)} on it.`;
        },
        doneText: 'A right angle, raised out of nothing but crossings. Euclid’s own I.11 is I.1 again: a triangle raised on two points equally far from the foot, its apex joined to the foot.',
      },
      {
        key: 'i2', short: 'I.2', name: 'Elements I.2 · the collapsing compass',
        prop: 'To place at a given point (as an extremity) a straight line equal to a given straight line.',
        greek: 'Πρὸς τῷ δοθέντι σημείῳ τῇ δοθείσῃ εὐθείᾳ ἴσην εὐθεῖαν θέσθαι.',
        banner: 'Quest 5 of 7 · Your compass collapses when lifted. Copy the distance <em>BC</em> over to the point <em>A</em> anyway. <code>[I.2]</code>',
        preamble: 'Let A be the given point, and BC the given straight line. It is required to place at the point A a straight line equal to the given straight line BC.',
        intro: 'Pin the compass at A and it can only open to points already standing, never to the far-off length BC. Euclid smuggles the distance across anyway.',
        view: { cx: 0.05, cy: 0.1, w: 8.4, h: 5.7 },
        seeds(con) {
          const a = addFree(con, -1.35, 0.75, { given: true });
          const b = addFree(con, 0.5, -0.6, { given: true });
          const c = addFree(con, 1.45, 0.15, { given: true });
          addLine(con, b, c, { given: true });
          return { a, b, c };
        },
        hints: [
          'Join A to B, and raise Euclid’s equilateral triangle on AB; its apex is his D. Proposition I.1 is a tool now. Draw the lines from the apex through A and through B: you will need them produced.',
          'With centre B and distance BC, describe a circle. The line from the apex through B, produced beyond B, cuts it: claim that point (Euclid’s G), whose distance from the apex is DB + BC.',
          'With centre D and distance DG, describe a circle. It cuts the line DA, produced beyond A, at a point (Euclid’s L) with AL = DG − DA = BC. Claim it.',
        ],
        check(con, ids) { const l = findSegCopy(con, ids.a, ids.b, ids.c); return l == null ? null : { l }; },
        witness(ids, w) { return { pts: [w.l], segs: [[ids.a, w.l], [ids.b, ids.c]], ticks: [[ids.a, w.l], [ids.b, ids.c]] }; },
        qef(con, ids, w) {
          return `Therefore at the given point ${labelOf(con, ids.a)} the straight line ${labelOf(con, ids.a)}${labelOf(con, w.l)} has been placed equal to the given straight line ${labelOf(con, ids.b)}${labelOf(con, ids.c)}.`;
        },
        doneText: 'The collapsing compass just carried a distance across the plane. The crippled tool secretly equals the rigid one, and the trick cost four circles, two of them spent on I.1’s triangle.',
      },
      {
        key: 'trap', short: '⅓', name: 'the trisection',
        prop: 'To cut a given rectilineal angle into three equal angles.',
        banner: 'Quest 6 of 7 · Cut the angle <em>BAC</em> into three equal angles.',
        preamble: 'Let the angle BAC be the given rectilineal angle, of two thirds of a right angle. It is required to cut it into three equal angles.',
        intro: 'Bisection you own. Surely a third is only a little harder.',
        view: { cx: 0.85, cy: 0, w: 6.4, h: 4.3 },
        locked: true,
        seeds(con) {
          const a = addFree(con, TRAP_SEED.a[0], TRAP_SEED.a[1], { given: true });
          const b = addFree(con, TRAP_SEED.b[0], TRAP_SEED.b[1], { given: true });
          const c = addFree(con, TRAP_SEED.c[0], TRAP_SEED.c[1], { given: true });
          addLine(con, a, b, { given: true });
          addLine(con, a, c, { given: true });
          return { a, b, c };
        },
        hints: [
          'Bisecting twice gives quarters, not thirds. Perhaps some clever auxiliary circle…',
          'Equal chords cut equal angles: can you make three equal chords span the arc?',
          'However long you circle, something has been watching your moves. It will speak soon.',
        ],
        check() { return null; },
        trap: true,
      },
      {
        key: 'free', short: '∞', name: 'free play',
        prop: 'Free construction.',
        banner: 'Quest 7 of 7 · Free play: the plane is yours. Try a square on <em>AB</em>, or a regular hexagon, whose side equals its circle’s radius. Gauss, a month short of nineteen, opened his diary in 1796 with the seventeen-sided one.',
        preamble: 'Let the points A and B be set out. Nothing is required, and everything is permitted.',
        intro: 'Every point you will ever reach here lives in a tower of square roots above A and B. Build a regular polygon and the judge will know it.',
        view: { cx: 0, cy: 0, w: 6.6, h: 4.6 },
        seeds(con) {
          const a = addFree(con, -0.8, -0.2, { given: true });
          const b = addFree(con, 0.6, 0.1, { given: true });
          return { a, b };
        },
        hints: [
          'A hexagon: one circle, then walk the compass around its rim; the radius fits exactly six times.',
          'A square: a perpendicular at A (quest 4), then carry the distance AB up the new line, and close it with a second perpendicular.',
        ],
        check() { return null; },
        freePlay: true,
      },
    ];
    const POLY = {
      4: ['square', 'cf. Elements I.46'], 5: ['pentagon', 'cf. Elements IV.11'], 6: ['hexagon', 'cf. Elements IV.15'],
      8: ['octagon', ''], 10: ['decagon', ''], 12: ['dodecagon', ''], 15: ['fifteen-sided figure', 'cf. Elements IV.16'],
      16: ['sixteen-sided figure', ''], 17: ['seventeen-sided figure', 'Gauss, 30 March 1796'],
    };

    /* ---------- state ---------- */
    let con = null;               // the construction (dependency graph)
    let curEval = null;           // Map(id -> evaluated geometry)
    let phantoms = [];            // claimable crossings, cached per mutation
    let qids = null;              // ids of the current quest's given points
    let questIdx = 0;
    const qs = QUESTS.map(() => ({ solved: false }));
    let witness = null;           // the goal's witness while the figure satisfies it
    let witnessT0 = null;
    let polygon = null, polyKey = '';
    let tool = 'point';           // 'point' | 'line' | 'circle'
    let pending = null;           // first point chosen for a line/circle
    let hoverPt = null, hoverPh = null, hoverCurve = null;
    let hiId = null;              // object lit from the proof column
    let cursorW = null;           // cursor in world coords
    let pointerKind = 'mouse';
    let dragId = null, dragMoved = false;
    let kbIdx = -1, kbOn = false;
    let hintIdx = 0;
    let infoBase = '';
    let trapMoves = 0, trapTime = 0, trapFired = false, trapT0 = null;
    let byrne = false;
    let footnoted = false;
    let dirty = true;
    let nowT = 0;
    const anims = new Map();      // id -> {kind, t0, dur}

    const bus = audio.createBus('twotools');
    const gGold = cv.glowSprite(P.goldBright, 30);
    const gAzure = cv.glowSprite(P.azure, 22);
    const gCrimson = cv.glowSprite(P.crimson, 26);

    /* ---------- layout ---------- */
    const banner = ui.questBanner(stage, '');

    const ladder = document.createElement('nav');
    ladder.className = 'tt-ladder';
    ladder.setAttribute('aria-label', 'Quests');
    stage.appendChild(ladder);
    const rungs = QUESTS.map((q, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tt-rung';
      b.textContent = q.short;
      b.title = q.name;
      b.setAttribute('aria-label', `Quest ${i + 1}: ${q.name}`);
      b.addEventListener('click', () => { if (!b.disabled) setupQuest(i); });
      ladder.appendChild(b);
      return b;
    });
    const nextBtn = ui.button(ladder, 'next proposition ▶', () => { if (questIdx < QUESTS.length - 1) setupQuest(questIdx + 1); }, { primary: true, small: true });
    nextBtn.classList.add('tt-next');

    const controls = ui.controlRow(stage);
    controls.classList.add('tt-tools');
    const ICONS = {
      point: '<circle cx="7" cy="7" r="2.6" fill="currentColor"/>',
      line: '<path d="M1.8 12.2 12.2 1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M.6 10.6 10.6.6 13.4 3.4 3.4 13.4Z" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width=".9"/>',
      circle: '<path d="M7 2.4 3.2 13M7 2.4 10.8 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
        '<circle cx="7" cy="2.4" r="1.6" fill="currentColor"/>',
    };
    const toolBtns = {};
    for (const [k, label] of [['point', 'point'], ['line', 'straightedge'], ['circle', 'compass']]) {
      const b = ui.button(controls, label, () => setTool(k));
      b.type = 'button';
      b.classList.add('tt-toolbtn');
      b.innerHTML = `<svg class="tt-ico" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">${ICONS[k]}</svg><span>${label}</span>`;
      toolBtns[k] = b;
    }
    ui.button(controls, '↩ undo', doUndo, { small: true });
    ui.button(controls, '⟲ restart', () => setupQuest(questIdx), { small: true });
    ui.button(controls, '? hint', showHint, { small: true });
    const concedeBtn = ui.button(controls, 'something resists: ask why', () => fireTrap(true), { small: true });
    const byrneTg = ui.toggle(controls, {
      label: 'Byrne’s colours', value: false,
      onChange(v) { byrne = v; proofEl.classList.toggle('byrne', v); dirty = true; },
    });
    byrneTg.el.title = 'Colour each line and circle, as Oliver Byrne’s Euclid of 1847 did';

    const flex = document.createElement('div');
    flex.className = 'tt-flex';
    stage.appendChild(flex);
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'tt-canvas';
    flex.appendChild(canvasWrap);
    canvasWrap.style.aspectRatio = `${QUESTS[0].view.w} / ${QUESTS[0].view.h}`;
    const handle = cv.setupCanvas(canvasWrap);
    const canvas = handle.canvas;
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', 'construction');
    canvas.setAttribute('aria-label', 'Construction canvas. Keys: 1, 2, 3 choose point, straightedge or compass; arrow keys step through points and crossings; Enter acts; Escape cancels; Z undoes. The proof column beside it records every move.');

    const proofEl = document.createElement('div');
    proofEl.className = 'tt-proof';
    proofEl.setAttribute('aria-label', 'The proposition, as you author it');
    flex.appendChild(proofEl);

    const interruptSlot = document.createElement('div');
    stage.appendChild(interruptSlot);

    const info = ui.readout(stage, '');
    info.el.setAttribute('aria-live', 'polite');
    ui.caption(stage,
      'The <em>point</em> tool places points and drags the gold given ones; the <em>straightedge</em> joins two ' +
      'points and produces the line, drawing but never measuring; the <em>compass</em> pins at a centre, opens to a ' +
      'point, and collapses when lifted. Where two curves cross, a faint mark appears: intersections are the only new ' +
      'points the game grants, and a click claims one. A point set down anywhere else is “taken at random,” and the ' +
      'judge will shake it. Every quest is judged by replaying your construction from shaken starting points, so a ' +
      'lucky drawing fails and a true construction cannot. Philosophers draw the same line: in Ken Manders’s terms a ' +
      'figure’s robust features, which point lies between which and which curves cross, are <em>co-exact</em>, its ' +
      'fragile ones, equal lengths and angles, <em>exact</em>, and Euclid reads only the first kind off his diagrams.');
    const keysCap = ui.caption(stage,
      'Right-click, Escape or a second tap on the chosen point cancels a half-made move. Hover a sentence to light ' +
      'its object, and strike with its × a step nothing depends on. With the figure focused, 1, 2 and 3 choose a ' +
      'tool, the arrow keys step through points and crossings, Enter acts and Z undoes. <em>Byrne’s colours</em> ' +
      'paints each line and circle in the manner of Oliver Byrne’s Euclid of 1847, “in which coloured diagrams and ' +
      'symbols are used instead of letters.”');
    keysCap.classList.add('tt-keys');
    ui.legendPanel(stage,
      '<p>An oracle, the story goes, told the Delians to double the god’s altar: to rid themselves of a plague, in ' +
      'the version Theon of Smyrna copied from a lost work of Eratosthenes; to end “the present troubles of the ' +
      'Delians and the rest of the Greeks,” in Plutarch’s. In Plutarch the builders doubled every side and found to ' +
      'their surprise that they had made a solid eight times as large. Plato, consulted, said the god was rallying ' +
      'the Greeks for their neglect of education and bidding them study geometry in earnest, and he named the men for the work, Eudoxus of Cnidus or Helicon of ' +
      'Cyzicus, who could find two mean proportionals: the reduction Hippocrates of Chios had already made. Our ' +
      'earliest teller, Eratosthenes, wrote a century or more after Plato died. The tale is legend, but the problem ' +
      'it dresses up, doubling a cube with the two tools, is real, and quest six settles its fate.</p>' +
      '<p>Legend, too, is the other famous Euclid story. Asked by King Ptolemy for a shorter way to geometry than ' +
      'the <em>Elements</em>, he is said to have answered that there is no royal road. The line surfaces in Proclus, ' +
      'some seven centuries after Euclid, and Stobaeus, a compiler of about the same age, tells it of Menaechmus and ' +
      'Alexander the Great: “O king, for travelling through the country there are private roads and royal roads, ' +
      'but in geometry there is one road for all.” It is an anecdote in search of a king.</p>');

    /* ---------- responsive frame ---------- */
    // Layout changes are deferred to the next animation frame: changing sizes
    // inside a ResizeObserver callback would trip the observer's loop guard.
    let sideBySide = false, layoutRaf = 0;
    function syncLayout() {
      layoutRaf = 0;
      if (destroyed) return;
      const side = flex.clientWidth >= 700;
      if (side !== sideBySide) { sideBySide = side; flex.classList.toggle('side', side); }
      const mh = sideBySide && handle.height > 0 ? Math.max(200, Math.round(handle.height)) + 'px' : '';
      if (proofEl.style.maxHeight !== mh) proofEl.style.maxHeight = mh;
    }
    let bgGrad = null;
    handle.onResize(() => {
      bgGrad = null;
      dirty = true;
      if (!layoutRaf) layoutRaf = requestAnimationFrame(syncLayout);
    });

    /* ---------- world <-> screen ---------- */
    let view = QUESTS[0].view;
    let sc = 100;
    function computeScale() {          // phones zoom in a little: the plane's margins matter less there
      const z = handle.width < 480 ? 0.93 : 1;
      sc = Math.max(1e-3, Math.min(handle.width / (view.w * z), handle.height / (view.h * z)));
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
    function sStrike() { audio.ensureAudio(); audio.drums.wood(bus, anow(), { pitch: 620, level: 0.22 }); }
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

    /* ---------- the readout: intro, hints, and the tower meter ---------- */
    function setInfo(text) { infoBase = text; info.set(text); }
    let meterFor = null;
    function showMeter(id) {
      if (id === meterFor) return;
      meterFor = id;
      if (id == null || !con.byId.has(id)) { info.set(infoBase); return; }
      const s = con.byId.get(id);
      const L = s.label;
      if (s.given) { info.set(`${L} is given: the quest begins from it.`); return; }
      if (s.op === 'free') { info.set(`${L} was taken at random: it is not constructed, and the judge will shake it.`); return; }
      const { k, random } = sqrtDepth(con, id);
      const tail = random ? ' It also leans on a point taken at random.' : '';
      if (k === 0) info.set(`${L} was reached by straight lines alone: its coordinates are rational in those of the given points.${tail}`);
      else info.set(`${L} stands ${k} floor${k > 1 ? 's' : ''} up the tower: ${k} circle crossing${k > 1 ? 's' : ''} in its making, so at most ${k} square root${k > 1 ? 's' : ''} over the given points (degree at most ${2 ** Math.min(k, 30)}).${tail}`);
    }

    /* ---------- proof panel ---------- */
    let stepsBox = null, sigBox = null, footBox = null;
    const glyphSVG = (kind, color) => {
      if (kind === 'circle') return `<svg class="tt-glyph" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
      if (kind === 'line') return `<svg class="tt-glyph" width="15" height="13" viewBox="0 0 15 13" aria-hidden="true"><line x1="1" y1="11" x2="14" y2="2" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
      return `<svg class="tt-glyph" width="9" height="13" viewBox="0 0 9 13" aria-hidden="true"><circle cx="4.5" cy="7" r="3" fill="${color}"/></svg>`;
    };
    function rebuildProof(quest) {
      proofEl.innerHTML = '';
      const h = document.createElement('h4');
      h.textContent = 'the proposition, as you author it';
      proofEl.appendChild(h);
      const prop = document.createElement('p');
      prop.className = 'tt-prop';
      prop.textContent = quest.prop;
      proofEl.appendChild(prop);
      if (quest.greek) {
        const g = document.createElement('p');
        g.className = 'tt-greek';
        g.lang = 'grc';
        g.title = 'Heiberg’s Greek text';
        g.textContent = quest.greek;
        proofEl.appendChild(g);
      }
      const pre = document.createElement('p');
      pre.className = 'tt-given';
      pre.textContent = quest.preamble;
      proofEl.appendChild(pre);
      stepsBox = document.createElement('div');
      stepsBox.setAttribute('aria-live', 'polite');
      proofEl.appendChild(stepsBox);
      addEmpty();
      sigBox = document.createElement('div');
      proofEl.appendChild(sigBox);
      footBox = document.createElement('div');
      proofEl.appendChild(footBox);
      footnoted = false;
    }
    function addEmpty() {
      const empty = document.createElement('p');
      empty.className = 'tt-empty';
      empty.textContent = 'Your moves will be written here.';
      stepsBox.appendChild(empty);
    }
    function stepHue(step) {
      if (step.kind === 'pt') return step.op === 'meet' ? P.azure : P.ink;
      return BYRNE[(step.hue ?? 0) % BYRNE.length];
    }
    function addProofLine(step) {
      const s = stepSentence(con, step);
      if (!s) return;
      const empty = stepsBox.querySelector('.tt-empty');
      if (empty) empty.remove();
      const p = document.createElement('p');
      p.className = 'tt-step' + (reduced ? '' : ' tt-new');
      p.dataset.step = String(step.id);
      p.insertAdjacentHTML('afterbegin', glyphSVG(step.kind, stepHue(step)));
      p.appendChild(document.createTextNode(s.main + (s.ccNote ? ' *' : '')));
      if (s.cite) {
        const c = document.createElement('span');
        c.className = 'tt-cite';
        c.textContent = `[${s.cite}]`;
        p.appendChild(c);
      }
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'tt-strike';
      x.textContent = '×';
      x.setAttribute('aria-label', `strike step: ${s.main}`);
      p.appendChild(x);
      stepsBox.appendChild(p);
      step.proofEl = p;
      if (s.ccNote && !footnoted) {
        footnoted = true;
        const f = document.createElement('div');
        f.className = 'tt-foot';
        f.innerHTML = '* That the circles must indeed meet, the axioms nowhere say: the diagram persuades, but the ' +
          'logic is silent. The silence lasted until the nineteenth century rebuilt geometry on declared rules; in ' +
          'Hilbert’s system the gap is closed by an axiom of completeness, which he added in 1900, in a note he ' +
          'wrote for the French translation of his <em>Grundlagen</em>.';
        footBox.appendChild(f);
      }
      proofEl.scrollTop = proofEl.scrollHeight;
    }
    function refreshLeaves() {
      const parents = new Set();
      for (const s of con.steps) for (const p of s.parents) parents.add(p);
      for (const s of con.steps) if (s.proofEl) s.proofEl.classList.toggle('leaf', !parents.has(s.id));
    }
    function signQEF(text) {
      sigBox.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'tt-therefore';
      p.textContent = text;
      sigBox.appendChild(p);
      const q = document.createElement('div');
      q.className = 'tt-qef' + (reduced ? '' : ' pre');
      q.innerHTML = '<span lang="grc">ΟΠΕΡ ΕΔΕΙ ΠΟΙΗΣΑΙ</span><small>(being) what it was required to do</small>';
      sigBox.appendChild(q);
      if (!reduced) requestAnimationFrame(() => requestAnimationFrame(() => q.classList.remove('pre')));
      proofEl.scrollTop = proofEl.scrollHeight;
    }

    // cross-highlighting: a sentence lights its object, an object lights its sentence
    let litEl = null;
    function lightSentence(id) {
      const el = id != null ? con.byId.get(id)?.proofEl || null : null;
      if (el === litEl) return;
      if (litEl) litEl.classList.remove('tt-hi');
      litEl = el;
      if (el) el.classList.add('tt-hi');
    }
    function onProofOver(e) {
      const p = e.target.closest && e.target.closest('.tt-step');
      const id = p ? +p.dataset.step : null;
      if (id !== hiId) { hiId = id; dirty = true; lightSentence(id); }
    }
    function onProofLeave() { if (hiId != null) { hiId = null; dirty = true; lightSentence(null); } }
    function onProofClick(e) {
      const x = e.target.closest && e.target.closest('.tt-strike');
      if (!x) return;
      const p = x.closest('.tt-step');
      if (p) prune(+p.dataset.step);
    }
    proofEl.addEventListener('pointerover', onProofOver);
    proofEl.addEventListener('pointerleave', onProofLeave);
    proofEl.addEventListener('click', onProofClick);

    /* ---------- quest lifecycle ---------- */
    function refreshLadder() {
      rungs.forEach((b, i) => {
        const unlocked = i === 0 || qs[i].solved || qs[i - 1].solved || i === questIdx;
        b.disabled = !unlocked;
        b.classList.toggle('solved', qs[i].solved && !QUESTS[i].trap);
        b.classList.toggle('spoken', qs[i].solved && !!QUESTS[i].trap);
        if (i === questIdx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      nextBtn.style.display = questIdx < QUESTS.length - 1 && qs[questIdx].solved ? '' : 'none';
    }
    function setupQuest(idx) {
      questIdx = idx;
      const quest = QUESTS[idx];
      con = newConstruction();
      qids = quest.seeds(con);
      view = quest.view;
      canvasWrap.style.aspectRatio = `${view.w} / ${view.h}`;
      pending = null; hoverPt = null; hoverPh = null; hoverCurve = null; hiId = null; dragId = null;
      litEl = null; meterFor = null; kbIdx = -1;
      hintIdx = 0; trapMoves = 0; trapTime = 0; trapT0 = null;
      witness = null; witnessT0 = null; polygon = null; polyKey = '';
      trapFired = quest.trap ? qs[idx].solved : false;
      anims.clear();
      rebuildProof(quest);
      interruptSlot.innerHTML = '';
      if (quest.trap && qs[idx].solved) renderInterrupt();
      if (qs[idx].solved && !quest.freePlay) {
        banner.done(quest.banner + (quest.trap ? ' <em>It has spoken: no one can.</em>' : ' <em>Proven before; build it again as you like.</em>'));
      } else banner.set(quest.banner);
      setInfo(quest.intro);
      concedeBtn.style.display = quest.trap && !qs[idx].solved ? '' : 'none';
      refreshAfterMutation();
      refreshLadder();
      dirty = true;
    }
    function celebrate(w) {
      const quest = QUESTS[questIdx];
      qs[questIdx].solved = true;
      witness = quest.witness ? quest.witness(qids, w) : null;
      witnessT0 = null;
      banner.done(quest.doneText || quest.banner);
      if (quest.qef) signQEF(quest.qef(con, qids, w));
      sDone();
      refreshLadder();
    }
    function unsign() {
      const quest = QUESTS[questIdx];
      witness = null;
      sigBox.innerHTML = '';
      banner.set(quest.banner + (qs[questIdx].solved ? ' <em>Proven before, but the figure no longer shows it.</em>' : ''));
    }
    function recheck() {
      const quest = QUESTS[questIdx];
      if (quest.freePlay) { checkPolygon(); return; }
      if (quest.trap || !quest.check) return;
      const w = quest.check(con, qids);
      if (w && !witness) celebrate(w);
      else if (!w && witness) unsign();
    }
    function checkPolygon() {
      const found = findRegularPolygon(con);
      const key = found ? found.n + ':' + [...found.ids].sort((a, b) => a - b).join(',') : '';
      if (key === polyKey) return;
      const prevN = polygon ? polygon.n : 0;
      polygon = found; polyKey = key; witnessT0 = null;
      if (!found) { sigBox.innerHTML = ''; banner.set(QUESTS[questIdx].banner); return; }
      const [name, cite] = POLY[found.n] || [`${found.n}-sided figure`, ''];
      const letters = found.ids.map((id) => labelOf(con, id)).join('');
      banner.done(`A regular ${name} stands${cite ? ` <em>(${cite})</em>` : ''}, and the judge confirms it under shaking.`);
      signQEF(`Therefore the ${name} ${letters} is equilateral and equiangular, and it has been constructed.`);
      qs[questIdx].solved = true;
      if (found.n >= prevN) sDone();
      refreshLadder();
    }

    /* ---------- the trap ---------- */
    function fireTrap(gesture) {
      if (trapFired || !QUESTS[questIdx].trap) return;
      trapFired = true;
      trapT0 = null;
      qs[questIdx].solved = true;
      renderInterrupt();
      banner.done('Halt. Put the compass down, not because you failed but because no one can, and that is a theorem.');
      concedeBtn.style.display = 'none';
      sTrap();
      refreshLadder();
      dirty = true;
      if (gesture) {
        try { interruptSlot.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); } catch { /* old engines */ }
      }
    }
    // The tower of degrees: five equal floors, each twice the one below, and the 3 that
    // cos 20° needs, pointing at the gap between the floors 2 and 4 where no floor stands.
    function towerSVG() {
      const rows = ['1', '2', '4', '8', '16'];
      const mono = MONO.replace(/"/g, '');
      const X0 = 38, FW = 52, FH = 18, cx = X0 + FW / 2;
      const top = (i) => 116 - i * 22;                     // floor i spans top(i) .. top(i)+FH
      let s = '<svg viewBox="0 0 190 140" role="img" aria-label="The degrees ruler and compass can reach: 1, 2, 4, 8, 16, each twice the last. Trisecting 60 degrees needs degree 3, which would fall between the floors 2 and 4, where there is no floor.">';
      rows.forEach((r, i) => {
        const y = top(i);
        s += `<rect x="${X0}" y="${y}" width="${FW}" height="${FH}" rx="2" fill="${rgba(P.gold, 0.08 + i * 0.035)}" stroke="${P.goldDim}"/>`;
        s += `<text x="${cx}" y="${y + 13}" text-anchor="middle" font-family="${mono}" font-size="11" fill="${P.goldBright}">${r}</text>`;
        if (i) s += `<text x="${X0 - 6}" y="${y + FH + 5}" text-anchor="end" font-family="${mono}" font-size="8.5" fill="${P.inkDim}">×2</text>`;
      });
      s += `<text x="${cx}" y="20" text-anchor="middle" font-size="11" fill="${P.inkDim}">⋮</text>`;
      const gy = top(2) + FH + 2;                         // the gap between floor 2 and floor 4
      s += `<line x1="${X0 + FW + 4}" y1="${gy}" x2="130" y2="${gy}" stroke="${rgba(CRIMSON_B, 0.75)}" stroke-width="1" stroke-dasharray="2 3"/>`;
      s += `<path d="M${X0 + FW + 8} ${gy - 3}l-4 3 4 3" fill="none" stroke="${rgba(CRIMSON_B, 0.75)}" stroke-width="1"/>`;
      s += `<rect x="132" y="${gy - 18}" width="42" height="36" rx="2" fill="${rgba(P.crimson, 0.14)}" stroke="${P.crimson}" stroke-dasharray="3 2.5"/>`;
      s += `<text x="153" y="${gy + 5.5}" text-anchor="middle" font-family="${mono}" font-size="15" fill="${CRIMSON_B}">3</text>`;
      s += `<text x="153" y="${gy - 24}" text-anchor="middle" font-size="10.5" font-style="italic" fill="${CRIMSON_B}">cos 20°</text>`;
      return s + '</svg>';
    }
    function renderInterrupt() {
      interruptSlot.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'tt-interrupt';
      d.setAttribute('role', 'note');
      d.innerHTML =
        '<div class="tt-int-title">the two-thousand-year interruption</div>' +
        '<p>Stop, not because you have failed, but because you cannot succeed, and the impossibility is itself a ' +
        'theorem. Every length these two tools can reach is built by intersecting lines and circles, and each ' +
        'intersection costs at most a square root: the constructible numbers live in towers of extensions of degree ' +
        '2, 4, 8, 16, always a power of two. To cut this 60° angle in three you would need <code>cos 20°</code>, a ' +
        'root of the irreducible cubic <code>8x³ − 6x − 1</code>, an object of degree <em>three</em>. And 3 divides ' +
        'no power of 2.</p>' +
        `<figure>${towerSVG()}<figcaption>Each crossing doubles the degree at most, so the tower climbs 1, 2, 4, 8, 16 ` +
        'and never stands on 3. Hover over or tap any point on the figure above to read how many floors up it stands.</figcaption></figure>' +
        '<p>The Greeks had guessed it. Pappus sorted problems by the tools they demand, “plane” ones for line and ' +
        'circle and “solid” ones for the cone, and wrote that those who sought the trisection “by planes” were ' +
        '“unable to succeed.” Belief is not proof. Pierre Wantzel published the proof in 1837, closing in seven ' +
        'pages a question believed, but never settled, since antiquity; doubling the cube falls with it, since ' +
        '<code>∛2</code> is of degree three too. Even that proof arrived with a crack: one step concludes, too ' +
        'quickly, that a certain polynomial cannot be factored. No one seems to have noticed until Robin Hartshorne ' +
        'did, around the turn of our century, and the argument that fills it had been in print since 1877, in Julius ' +
        'Petersen’s book on the theory of equations. Squaring the circle held out until 1882, when Lindemann proved that π is ' +
        'not the root of any polynomial with whole-number coefficients at all.</p>' +
        '<p>Two doors lead out, and both change the rules. Put two marks on the straightedge, make it a ruler after ' +
        'all, and slide it until the marks touch a line and a circle: the angle falls in three, by a verging ' +
        'construction preserved in the Arabic <em>Book of Lemmas</em> that tradition credits to Archimedes. Or fold ' +
        'paper. In 1936 Margherita Beloch showed that one fold, laying two given points onto two given lines at ' +
        'once, extracts cube roots, so a sheet honestly folded trisects any angle and doubles any cube. The ' +
        'impossibility was never in the angle; it was in the tools. Change the game and you change what can be ' +
        'known, a thought the third movement of this essay will not let go of.</p>';
      interruptSlot.appendChild(d);
    }

    /* ---------- tools & moves ---------- */
    function setTool(t) {
      tool = t;
      pending = null;
      for (const [k, b] of Object.entries(toolBtns)) {
        b.classList.toggle('active', k === t);
        b.setAttribute('aria-pressed', String(k === t));
      }
      dirty = true;
    }
    function refreshAfterMutation() {
      curEval = evaluate(con);
      phantoms = claimable(con, curEval, 1e-6 * view.w);
      refreshLeaves();
      updateHoverFromCursor();
      dirty = true;
    }
    function afterMutate() {
      refreshAfterMutation();
      recheck();
    }
    function countMove() {
      if (QUESTS[questIdx].trap && !trapFired) {
        trapMoves++;
        if (trapMoves >= 7) fireTrap(true);
      }
    }
    function placeFree(wx, wy) {
      const id = addFree(con, wx, wy);
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'pop', t0: null, dur: 0.35 });
      sPoint();
      afterMutate();
      if (tool !== 'point') setInfo(`${labelOf(con, id)} was set down at random, not claimed from a crossing: the judge will shake it.`);
      return id;
    }
    function materialize(ph) {
      const id = addMeet(con, ph.p1, ph.p2, ph.branch);
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'pop', t0: null, dur: 0.45 });
      sMeet();
      afterMutate();
      return id;
    }
    function makeLine(p1, p2) {
      const id = addLine(con, p1, p2);
      con.byId.get(id).hue = con.hue++;
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'grow', t0: null, dur: 0.85 });
      sLine();
      afterMutate();
      return id;
    }
    function makeCircle(c, t) {
      const id = addCircle(con, c, t);
      con.byId.get(id).hue = con.hue++;
      addProofLine(con.byId.get(id));
      anims.set(id, { kind: 'sweep', t0: null, dur: 0.95 });
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
      if (s && s.op !== 'free' && s.op !== 'meet' && s.hue != null) con.hue = Math.max(0, con.hue - 1);
      forget(s);
    }
    function prune(id) {
      const s = removeStep(con, id);
      if (!s) return;
      sStrike();
      forget(s);
    }
    function forget(s) {
      if (s && s.proofEl) s.proofEl.remove();
      if (s) anims.delete(s.id);
      if (s && s.id === hiId) { hiId = null; litEl = null; }
      if (stepsBox && !stepsBox.querySelector('.tt-step')) { stepsBox.innerHTML = ''; addEmpty(); }
      pending = null; hoverPt = null; hoverPh = null; hoverCurve = null; meterFor = null;
      afterMutate();
      info.set(infoBase);
    }
    function showHint() {
      const hints = QUESTS[questIdx].hints || [];
      if (!hints.length) return;
      const h = hints[hintIdx % hints.length];
      setInfo(`hint ${(hintIdx % hints.length) + 1} of ${hints.length}: ${h}`);
      meterFor = null;
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
      let best = null, bd = radW;
      for (const p of phantoms) {
        const d = Math.hypot(p.x - wx, p.y - wy);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }
    function curveAt(wx, wy, radW) {
      let best = null, bd = radW;
      for (const s of con.steps) {
        if (s.op !== 'line' && s.op !== 'circle') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok) continue;
        const d = s.op === 'line' ? distToLine(e, wx, wy) : Math.abs(Math.hypot(wx - e.cx, wy - e.cy) - e.r);
        if (d < bd) { bd = d; best = s.id; }
      }
      return best;
    }
    const snapPx = () => (pointerKind === 'touch' || pointerKind === 'pen' ? 24 : 13);
    function updateHoverFromCursor() {
      const before = [hoverPt, hoverPh && hoverPh.x, hoverCurve].join('|');
      if (!cursorW) { hoverPt = null; hoverPh = null; hoverCurve = null; }
      else {
        const radW = snapPx() / sc;
        hoverPt = nearestPointId(cursorW[0], cursorW[1], radW);
        hoverPh = hoverPt == null ? phantomAt(cursorW[0], cursorW[1], radW * 1.35) : null;
        hoverCurve = hoverPt == null && hoverPh == null ? curveAt(cursorW[0], cursorW[1], 6 / sc) : null;
      }
      const after = [hoverPt, hoverPh && hoverPh.x, hoverCurve].join('|');
      if (before !== after) {
        dirty = true;
        if (hiId == null) lightSentence(hoverPt ?? hoverCurve);
        showMeter(hoverPt);
      }
    }

    /* ---------- acting (shared by pointer and keyboard) ---------- */
    function actAt(wx, wy, e) {
      const radW = snapPx() / sc;
      const np = nearestPointId(wx, wy, radW);
      if (tool === 'point') {
        if (np != null) {
          const s = con.byId.get(np);
          if (s.op === 'free' && e && !QUESTS[questIdx].locked) {
            dragId = np; dragMoved = false;
            try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
          } else if (s.op === 'free' && e && QUESTS[questIdx].locked && s.given) {
            setInfo('The given angle is fixed here: the trap is laid for this angle, and it will not be moved.');
          }
          return;
        }
        const ph = phantomAt(wx, wy, radW * 1.35);
        if (ph) { materialize(ph); countMove(); return; }
        placeFree(wx, wy);
        countMove();
        return;
      }
      // straightedge / compass: resolve a point (snap > crossing > new free point)
      let pid = np, made = false;
      if (pid == null) {
        const ph = phantomAt(wx, wy, radW * 1.35);
        if (ph) { pid = materialize(ph); made = true; }
      }
      if (pid == null) { pid = placeFree(wx, wy); made = true; }
      if (pending == null) { pending = pid; sSelect(); if (made) countMove(); }
      else if (pending === pid) { pending = null; }
      else {
        if (tool === 'line') makeLine(pending, pid);
        else makeCircle(pending, pid);
        pending = null;
        countMove();
      }
      dirty = true;
    }

    /* ---------- pointer events ---------- */
    function onDown(e) {
      pointerKind = e.pointerType || 'mouse';
      if (e.button === 2) return;
      kbOn = false;
      const [sx, sy] = cv.pointerPos(handle, e);
      const [wx, wy] = s2w(sx, sy);
      cursorW = [wx, wy];
      actAt(wx, wy, e);
      updateHoverFromCursor();
    }
    function onMove(e) {
      pointerKind = e.pointerType || 'mouse';
      const [sx, sy] = cv.pointerPos(handle, e);
      const [wx, wy] = s2w(sx, sy);
      cursorW = [wx, wy];
      if (dragId != null) {
        const s = con.byId.get(dragId);
        if (!s) { dragId = null; return; }
        const [x0, y1] = s2w(12, 12), [x1, y0] = s2w(handle.width - 12, handle.height - 12);
        s.x = Math.max(x0, Math.min(x1, wx));
        s.y = Math.max(y0, Math.min(y1, wy));
        dragMoved = true;
        curEval = evaluate(con);
        phantoms = claimable(con, curEval, 1e-6 * view.w);
        dirty = true;
        return;
      }
      if (pending != null) dirty = true;
      updateHoverFromCursor();
    }
    function onUp(e) {
      if (dragId != null) {
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* fine */ }
        dragId = null;
        if (dragMoved) { refreshAfterMutation(); recheck(); }
      }
    }
    function onLeave(e) {
      if (dragId != null) return;
      if ((e.pointerType || 'mouse') !== 'mouse') return;   // a lifted finger keeps its place
      cursorW = null;
      updateHoverFromCursor();
      if (pending != null) dirty = true;
    }
    function onCtx(e) { e.preventDefault(); pending = null; dirty = true; }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onCtx);

    /* ---------- keyboard ---------- */
    function kbTargets() {
      const list = [];
      for (const s of con.steps) {
        if (s.kind !== 'pt') continue;
        const e = curEval.get(s.id);
        if (e && e.ok) list.push({ x: e.x, y: e.y, id: s.id });
      }
      for (const p of phantoms) list.push({ x: p.x, y: p.y, ph: true });
      list.sort((a, b) => (Math.abs(a.y - b.y) > 0.25 ? b.y - a.y : a.x - b.x));
      return list;
    }
    function kbFocusTo(i) {
      const list = kbTargets();
      if (!list.length) return;
      kbIdx = ((i % list.length) + list.length) % list.length;
      const t = list[kbIdx];
      cursorW = [t.x, t.y];
      kbOn = true;
      updateHoverFromCursor();
      dirty = true;
    }
    function onKey(e) {
      const k = e.key;
      if (k === '1' || k === 'p') { setTool('point'); e.preventDefault(); return; }
      if (k === '2' || k === 's') { setTool('line'); e.preventDefault(); return; }
      if (k === '3' || k === 'c') { setTool('circle'); e.preventDefault(); return; }
      if (k === 'z' || k === 'u' || k === 'Backspace') { doUndo(); e.preventDefault(); return; }
      if (k === 'h' || k === '?') { showHint(); e.preventDefault(); return; }
      if (k === 'Escape') { if (pending != null) { pending = null; dirty = true; e.preventDefault(); } return; }
      if (k === 'ArrowRight' || k === 'ArrowDown') { kbFocusTo(kbIdx + 1); e.preventDefault(); return; }
      if (k === 'ArrowLeft' || k === 'ArrowUp') { kbFocusTo(kbIdx < 0 ? -1 : kbIdx - 1); e.preventDefault(); return; }
      if ((k === 'Enter' || k === ' ') && cursorW && kbOn) {
        e.preventDefault();
        const here = cursorW.slice();
        actAt(here[0], here[1], null);
        // keep the focus on whatever now stands there
        const list = kbTargets();
        let bi = 0, bd = Infinity;
        list.forEach((t, i) => { const d = Math.hypot(t.x - here[0], t.y - here[1]); if (d < bd) { bd = d; bi = i; } });
        kbIdx = bi;
        updateHoverFromCursor();
      }
    }
    function onBlur() { if (kbOn) { kbOn = false; dirty = true; } }
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('blur', onBlur);

    /* ---------- drawing ---------- */
    const ease = (f) => 1 - Math.pow(1 - f, 3);
    const easeIO = (f) => (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2);   // a hand's pace
    const clamp01 = (f) => (f < 0 ? 0 : f > 1 ? 1 : f);
    function animF(id, t) {                       // raw progress 0..1 of an anim (1 when none)
      const a = anims.get(id);
      if (!a || reduced || a.t0 == null) return 1;
      return clamp01((t - a.t0) / a.dur);
    }
    function lineEnds(e, ext) {
      const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1;
      const ux = (e.x2 - e.x1) / L, uy = (e.y2 - e.y1) / L;
      const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
      return [w2s(mx - ux * ext, my - uy * ext), w2s(mx + ux * ext, my + uy * ext)];
    }
    function curveColor(s) {
      if (s.given) return s.kind === 'circle' ? P.gold : P.goldDim;
      if (byrne) return BYRNE[(s.hue ?? 0) % BYRNE.length];
      return s.op === 'circle' ? rgba(P.gold, 0.62) : P.inkDim;
    }
    function ringGlyph(ctx, x, y, col, r = 6, lw = 1.4) {   // the intersection mark (reused by One More Circle)
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
      ctx.moveTo(x - r - 4, y); ctx.lineTo(x - r + 2, y); ctx.moveTo(x + r - 2, y); ctx.lineTo(x + r + 4, y);
      ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y - r + 2); ctx.moveTo(x, y + r - 2); ctx.lineTo(x, y + r + 4);
      ctx.stroke();
    }
    function haloText(ctx, s, x, y, col) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = rgba(P.bg, 0.88);
      ctx.strokeText(s, x, y);
      ctx.fillStyle = col;
      ctx.fillText(s, x, y);
    }
    // the compass itself: needle leg to the centre, pencil leg to the arc, hinge above
    function compassGlyph(ctx, cx, cy, tx, ty, alpha, fold) {
      const dx = tx - cx, dy = ty - cy, r = Math.hypot(dx, dy);
      if (r < 2 || alpha <= 0) return;
      const g = clamp01(fold);
      const px = cx + dx * (1 - g), py = cy + dy * (1 - g);              // pencil swings in as it folds
      const rr = r * (1 - g);
      const nx = dy / r, ny = -dx / r;                                    // perpendicular (screen-left of travel)
      const hgt = Math.min(0.3 * r, 42) * (1 - 0.6 * g) + 6 * g;
      const hx = (cx + px) / 2 + nx * hgt, hy = (cy + py) / 2 + ny * hgt;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(P.ink, 0.72);
      ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(P.ink, 0.8);
      ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, TAU); ctx.fill();
      if (rr > 1) gGold.draw(ctx, px, py, 0.55);
      ctx.restore();
    }
    function arcMark(ctx, x, y, a1, a2, r, col, ticks = 0) {
      let d = a2 - a1;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), a1, a1 + d, d < 0); ctx.stroke();
      if (Math.abs(d) * r < 16) return;               // too short an arc to carry a hatch
      for (let i = 0; i < ticks; i++) {
        const a = a1 + d * (0.5 + (i - (ticks - 1) / 2) * 0.16);
        ctx.beginPath();
        ctx.moveTo(x + (r - 4) * Math.cos(a), y + (r - 4) * Math.sin(a));
        ctx.lineTo(x + (r + 4) * Math.cos(a), y + (r + 4) * Math.sin(a));
        ctx.stroke();
      }
    }
    function tick(ctx, p, q, n = 1) {                 // Heath's equal-length hatch
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
      if (L < 18) return;
      const ux = dx / L, uy = dy / L, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 4;
        ctx.beginPath();
        ctx.moveTo(mx + ux * o - uy * 5, my + uy * o + ux * 5);
        ctx.lineTo(mx + ux * o + uy * 5, my + uy * o - ux * 5);
        ctx.stroke();
      }
    }
    const scr = (id) => { const e = curEval.get(id); return e && e.ok ? w2s(e.x, e.y) : null; };

    function render(t) {
      const { ctx, width: W, height: H } = handle;
      if (!(W > 0 && H > 0)) return;
      computeScale();
      ctx.clearRect(0, 0, W, H);
      if (!bgGrad) {
        bgGrad = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, Math.max(W, H) * 0.7);
        bgGrad.addColorStop(0, rgba(P.goldBright, 0.045));
        bgGrad.addColorStop(1, rgba(P.goldBright, 0));
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      const quest = QUESTS[questIdx];
      const ext = 3 * Math.max(view.w, view.h);
      ctx.lineCap = 'round';
      // letters are set outward from the figure's centre of gravity
      let gx = 0, gy = 0, gn = 0;
      for (const s of con.steps) {
        if (s.kind !== 'pt') continue;
        const e = curEval.get(s.id);
        if (e && e.ok) { gx += e.x; gy += e.y; gn++; }
      }
      const [ccx, ccy] = gn ? w2s(gx / gn, gy / gn) : [W / 2, H / 2];
      const labelDir = (x, y) => {
        const dx = x - ccx, dy = y - ccy, dl = Math.hypot(dx, dy);
        return dl < 1 ? [0.7071, -0.7071] : [dx / dl, dy / dl];
      };

      // --- the solved figure's wash and the free-play polygon
      if (witness && witness.fill) {
        const pts = witness.fill.map(scr);
        if (pts.every(Boolean)) {
          ctx.fillStyle = rgba(P.gold, 0.075);
          ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
        }
      }
      if (polygon) {
        const pts = polygon.ids.map(scr);
        if (pts.every(Boolean)) {
          ctx.fillStyle = rgba(P.gold, 0.08);
          ctx.strokeStyle = rgba(P.goldBright, 0.75);
          ctx.lineWidth = 1.6;
          ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      }

      // --- productions of lines (faint, dashed)
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      for (const s of con.steps) {
        if (s.op !== 'line') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok) continue;
        const f = animF(s.id, t);
        const a = clamp01((f - 0.45) / 0.3);
        if (a <= 0) continue;
        const [[px, py], [qx, qy]] = lineEnds(e, ext);
        ctx.strokeStyle = byrne && !s.given ? rgba(BYRNE[(s.hue ?? 0) % 4], 0.22 * a) : rgba(P.ink, 0.13 * a);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
      }
      ctx.setLineDash([]);

      // --- circles (swept from the through-point, by a compass that folds on lifting)
      const compasses = [];
      for (const s of con.steps) {
        if (s.op !== 'circle') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok || e.r * sc < 0.5) continue;
        const [cx, cy] = w2s(e.cx, e.cy);
        const R = Math.max(0, e.r * sc);
        const raw = animF(s.id, t);
        const sweepF = easeIO(clamp01(raw / 0.66));
        const tp = curEval.get(s.parents[1]);
        const a0 = tp && tp.ok ? Math.atan2(-(tp.y - e.cy), tp.x - e.cx) : 0;
        ctx.strokeStyle = curveColor(s);
        ctx.lineWidth = s.given ? 1.5 : 1.3;
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a0 + TAU * sweepF);
        ctx.stroke();
        if (raw < 1) {
          const aEnd = a0 + TAU * sweepF;
          compasses.push([cx, cy, cx + R * Math.cos(aEnd), cy + R * Math.sin(aEnd), raw < 0.66 ? 1 : 1 - clamp01((raw - 0.66) / 0.34), clamp01((raw - 0.66) / 0.34)]);
        }
      }

      // --- defining segments (grown from the first point, along an unmarked straightedge)
      const edges = [];
      for (const s of con.steps) {
        if (s.op !== 'line') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok) continue;
        const raw = animF(s.id, t);
        const f = easeIO(clamp01(raw / 0.5));
        const [x1, y1] = w2s(e.x1, e.y1);
        const [x2, y2] = w2s(e.x1 + (e.x2 - e.x1) * f, e.y1 + (e.y2 - e.y1) * f);
        ctx.strokeStyle = curveColor(s);
        ctx.lineWidth = s.given ? 1.8 : 1.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (raw < 1) edges.push([e, raw < 0.5 ? 1 : 1 - clamp01((raw - 0.5) / 0.5)]);
      }

      // --- a sentence lights its object
      if (hiId != null && con.byId.has(hiId)) {
        const s = con.byId.get(hiId), e = curEval.get(hiId);
        if (e && e.ok) {
          ctx.save();
          ctx.strokeStyle = P.goldBright;
          ctx.lineWidth = 2.6;
          ctx.globalAlpha = 0.9;
          if (s.op === 'line') {
            const [[px, py], [qx, qy]] = lineEnds(e, ext);
            ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
            ctx.globalAlpha = 0.95; const a = w2s(e.x1, e.y1), b = w2s(e.x2, e.y2);
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          } else if (s.op === 'circle') {
            const [cx, cy] = w2s(e.cx, e.cy);
            ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, e.r * sc), 0, TAU); ctx.stroke();
          }
          ctx.lineWidth = 1.3;
          for (const pid of s.op === 'meet' ? [hiId] : s.parents.length ? s.parents : [hiId]) {
            const q = scr(pid);
            if (q && con.byId.get(pid)?.kind === 'pt') { ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, TAU); ctx.stroke(); }
          }
          if (s.op === 'meet') {
            ctx.globalAlpha = 0.4;
            for (const cid of s.parents) {
              const ce = curEval.get(cid);
              if (!ce || !ce.ok) continue;
              if (ce.kind === 'circle') { const [cx, cy] = w2s(ce.cx, ce.cy); ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, ce.r * sc), 0, TAU); ctx.stroke(); }
              else { const [[px, py], [qx, qy]] = lineEnds(ce, ext); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke(); }
            }
          }
          ctx.restore();
        }
      }

      // --- the witness: gold ink runs once along the proof's lines, then stays
      const wit = witness || null;
      let wf = 1;
      if (wit) {
        if (witnessT0 == null) witnessT0 = t;
        wf = reduced ? 1 : clamp01((t - witnessT0) / 1.1);
        const glowA = reduced ? 0 : 1 - clamp01((t - witnessT0 - 1.1) / 1.6);
        ctx.save();
        ctx.strokeStyle = P.goldBright;
        ctx.lineWidth = 2.1 + glowA * 0.6;
        for (const [p, q] of wit.segs || []) {
          const a = scr(p), b = scr(q);
          if (!a || !b) continue;
          const bx = a[0] + (b[0] - a[0]) * ease(wf), by = a[1] + (b[1] - a[1]) * ease(wf);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bx, by); ctx.stroke();
          if (wf < 1) gGold.draw(ctx, bx, by, 0.7);
        }
        for (const lid of wit.lines || []) {
          const le = curEval.get(lid);
          if (!le || !le.ok) continue;
          const [[px, py], [qx, qy]] = lineEnds(le, ext);
          ctx.globalAlpha = 0.55 * ease(wf);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.lineWidth = 1.3;
        for (const [p, q] of wit.ticks || []) { const a = scr(p), b = scr(q); if (a && b && wf >= 1) tick(ctx, a, b, 1); }
        if (wit.bisect && wf >= 0.6) {
          const V = scr(wit.bisect.v), B = scr(wit.bisect.p), C = scr(wit.bisect.q), le = curEval.get(wit.bisect.l);
          if (V && B && C && le && le.ok) {
            const aB = Math.atan2(B[1] - V[1], B[0] - V[0]), aC = Math.atan2(C[1] - V[1], C[0] - V[0]);
            let dx = le.x2 - le.x1, dy = -(le.y2 - le.y1);
            const mxv = Math.cos(aB) + Math.cos(aC), myv = Math.sin(aB) + Math.sin(aC);
            if (dx * mxv + dy * myv < 0) { dx = -dx; dy = -dy; }
            const aM = Math.atan2(dy, dx);
            arcMark(ctx, V[0], V[1], aB, aM, 46, P.goldBright, 1);
            arcMark(ctx, V[0], V[1], aM, aC, 52, P.goldBright, 1);
          }
        }
        if (wit.right && wf >= 0.6) {
          const V = scr(wit.right.v), B = scr(wit.right.p), le = curEval.get(wit.right.l);
          if (V && B && le && le.ok) {
            const ux = B[0] - V[0], uy = B[1] - V[1], ul = Math.hypot(ux, uy) || 1;
            let vx = le.x2 - le.x1, vy = -(le.y2 - le.y1);
            const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
            // of the four right angles at the foot, mark the one the letter does not sit in
            const [ldx, ldy] = labelDir(V[0], V[1]);
            let sux = ux / ul, suy = uy / ul;
            if (sux * ldx + suy * ldy > 0) { sux = -sux; suy = -suy; }
            if (vx * ldx + vy * ldy > 0) { vx = -vx; vy = -vy; }
            const k = 16, ax = sux * k, ay = suy * k;
            ctx.beginPath();
            ctx.moveTo(V[0] + ax, V[1] + ay); ctx.lineTo(V[0] + ax + vx * k, V[1] + ay + vy * k); ctx.lineTo(V[0] + vx * k, V[1] + vy * k);
            ctx.stroke();
          }
        }
        for (const pid of wit.pts || []) {
          const a = scr(pid);
          if (!a) continue;
          if (glowA > 0) gGold.draw(ctx, a[0], a[1], 0.8 + 0.6 * glowA);
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.arc(a[0], a[1], 9, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      // --- the trap made visible: the trisectors exist, and no move reaches them
      if (quest.trap && trapFired) {
        if (trapT0 == null) trapT0 = t;
        const g = reduced ? 1 : ease(clamp01((t - trapT0) / 1.4));
        const A = scr(qids.a), B = scr(qids.b), C = scr(qids.c);
        if (A && B && C) {
          const aB = Math.atan2(B[1] - A[1], B[0] - A[0]), aC = Math.atan2(C[1] - A[1], C[0] - A[0]);
          let d = aC - aB; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          const len = Math.hypot(W, H) * g;
          ctx.save();
          ctx.strokeStyle = rgba(CRIMSON_B, 0.85);
          ctx.lineWidth = 1.4;
          ctx.setLineDash([6, 5]);
          for (const k of [1, 2]) {
            const a = aB + (d * k) / 3;
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[0] + Math.cos(a) * len, A[1] + Math.sin(a) * len); ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.lineWidth = 1.2;
          for (let k = 0; k < 3; k++) arcMark(ctx, A[0], A[1], aB + (d * k) / 3, aB + (d * (k + 1)) / 3, 34 + k * 0, rgba(CRIMSON_B, 0.8 * g), 0);
          if (g > 0.6) {
            // set along the first trisector, just inside the sliver it cuts off
            const a = aB + d / 3, r0 = Math.max(44, Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.55);
            ctx.globalAlpha = clamp01((g - 0.6) / 0.4);
            gCrimson.draw(ctx, A[0], A[1], 0.9);
            ctx.translate(A[0] + Math.cos(a) * r0, A[1] + Math.sin(a) * r0);
            ctx.rotate(a);
            ctx.font = font(13, 'italic');
            ctx.textAlign = 'left';
            ctx.textBaseline = d < 0 ? 'top' : 'bottom';
            haloText(ctx, 'exists · unreachable', 0, d < 0 ? 8 : -8, CRIMSON_B);
          }
          ctx.restore();
        }
      }

      // --- claimable crossings: faint marks where the game would grant a point
      for (const ph of phantoms) {
        const [x, y] = w2s(ph.x, ph.y);
        if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
        ctx.fillStyle = rgba(P.azure, 0.55);
        ctx.beginPath(); ctx.arc(x, y, 2.1, 0, TAU); ctx.fill();
      }

      // --- the half-made move
      if (pending != null && cursorW) {
        const pe = curEval.get(pending);
        if (pe && pe.ok) {
          const [ax, ay] = w2s(pe.x, pe.y);
          let [cxs, cys] = w2s(cursorW[0], cursorW[1]);
          if (hoverPt != null) { const q = scr(hoverPt); if (q) [cxs, cys] = q; }
          else if (hoverPh) [cxs, cys] = w2s(hoverPh.x, hoverPh.y);
          ctx.save();
          ctx.strokeStyle = P.gold;
          ctx.globalAlpha = 0.65;
          ctx.setLineDash([4, 5]);
          ctx.lineWidth = 1.2;
          const r = Math.hypot(cxs - ax, cys - ay);
          if (tool === 'line' && r > 2) {
            const ux = (cxs - ax) / r, uy = (cys - ay) / r;
            ctx.beginPath(); ctx.moveTo(ax - ux * 2000, ay - uy * 2000); ctx.lineTo(ax + ux * 2000, ay + uy * 2000);
            ctx.globalAlpha = 0.22; ctx.stroke();
            ctx.globalAlpha = 0.7; ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cxs, cys); ctx.stroke();
          } else if (tool === 'circle' && r > 2) {
            ctx.beginPath(); ctx.arc(ax, ay, r, 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore(); ctx.save();
            compassGlyph(ctx, ax, ay, cxs, cys, 0.8, 0);
          }
          ctx.restore();
          ctx.strokeStyle = P.goldBright;
          ctx.lineWidth = 1.4;
          const pr = 9 + (reduced ? 0 : Math.sin(t * 5) * 1.4);
          ctx.beginPath(); ctx.arc(ax, ay, Math.max(0, pr), 0, TAU); ctx.stroke();
        }
      }

      // --- the unmarked straightedge, laid along each new line
      for (const [e, a] of edges) {
        const [p1x, p1y] = w2s(e.x1, e.y1), [p2x, p2y] = w2s(e.x2, e.y2);
        const L = Math.hypot(p2x - p1x, p2y - p1y) || 1, ux = (p2x - p1x) / L, uy = (p2y - p1y) / L;
        const o = 26, hw = 5;
        const x0 = p1x - ux * o, y0 = p1y - uy * o, x1 = p2x + ux * o, y1 = p2y + uy * o;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = rgba(P.ink, 0.06);
        ctx.strokeStyle = rgba(P.ink, 0.2);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 - uy * hw, y0 + ux * hw); ctx.lineTo(x1 - uy * hw, y1 + ux * hw);
        ctx.lineTo(x1 + uy * hw * 2.2, y1 - ux * hw * 2.2); ctx.lineTo(x0 + uy * hw * 2.2, y0 - ux * hw * 2.2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      for (const c of compasses) compassGlyph(ctx, c[0], c[1], c[2], c[3], c[4], c[5]);

      // --- points and their letters (italic, set outward from the figure)
      for (const s of con.steps) {
        if (s.kind !== 'pt') continue;
        const e = curEval.get(s.id);
        if (!e || !e.ok) continue;
        const [x, y] = w2s(e.x, e.y);
        if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
        const f = ease(animF(s.id, t));
        const pop = 1 + 0.9 * (1 - f);
        if (s.given) {
          gGold.draw(ctx, x, y, 0.62 * pop);
          ctx.fillStyle = P.gold;
          ctx.beginPath(); ctx.arc(x, y, 4.3 * pop, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(P.bg, 0.8); ctx.lineWidth = 1;
          ctx.stroke();
        } else if (s.op === 'meet') {
          if (f < 1) gAzure.draw(ctx, x, y, 1.2 * pop);
          ctx.fillStyle = P.azure;
          ctx.beginPath(); ctx.arc(x, y, 3.5 * pop, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(P.bg, 0.85); ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = rgba(P.bg, 0.9);
          ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(x, y, 3.6 * pop, 0, TAU); ctx.fill(); ctx.stroke();
        }
        if (s.id === hoverPt) {
          ctx.strokeStyle = rgba(P.ink, 0.6);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke();
        }
        const [dx, dy] = labelDir(x, y);
        ctx.font = s.given ? font(16, 'italic') : font(14.5, 'italic');
        ctx.textAlign = dx > 0.38 ? 'left' : dx < -0.38 ? 'right' : 'center';
        ctx.textBaseline = dy > 0.38 ? 'top' : dy < -0.38 ? 'bottom' : 'middle';
        const lx = Math.max(10, Math.min(W - 10, x + dx * 11)), ly = Math.max(12, Math.min(H - 8, y + dy * 11));
        haloText(ctx, s.label, lx, ly, s.given ? P.goldBright : s.op === 'meet' ? P.ink : P.inkDim);
      }

      // --- a claimable crossing under the cursor
      if (hoverPh) {
        const [x, y] = w2s(hoverPh.x, hoverPh.y);
        gAzure.draw(ctx, x, y, 1);
        ringGlyph(ctx, x, y, P.azure, 6 + (reduced ? 0 : Math.sin(t * 6) * 1.3), 1.4);
      }
      if (kbOn && cursorW && document.activeElement === canvas) {
        const [x, y] = w2s(cursorW[0], cursorW[1]);
        ctx.save();
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    function frame(dt, t) {
      nowT = t;
      // the trap's patience runs only while visible, since the loop pauses off-screen
      const quest = QUESTS[questIdx];
      if (quest.trap && !trapFired && trapMoves > 0) {
        trapTime += dt;
        if (trapTime > 26) fireTrap(false);
      }
      const live = anims.size > 0
        || (witness && (witnessT0 == null || t - witnessT0 < 2.8))
        || (quest.trap && trapFired && (trapT0 == null || t - trapT0 < 1.5))
        || (!reduced && (pending != null || hoverPh != null));
      if (!dirty && !live) return;
      dirty = false;
      if (reduced) anims.clear();
      for (const a of anims.values()) if (a.t0 == null) a.t0 = t;
      render(t);
      // retire finished anims, and draw once more so every stroke ends complete
      for (const [id, a] of anims) if (t - a.t0 >= a.dur) { anims.delete(id); dirty = true; }
    }

    const loop = cv.rafLoop(frame);
    setTool('point');
    setupQuest(0);
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() { loop.stop(); bus.mute(); },
      resume() { bus.unmute(); dirty = true; loop.start(); },
      destroy() {
        destroyed = true;
        loop.stop();
        if (layoutRaf) cancelAnimationFrame(layoutRaf);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('contextmenu', onCtx);
        canvas.removeEventListener('keydown', onKey);
        canvas.removeEventListener('blur', onBlur);
        proofEl.removeEventListener('pointerover', onProofOver);
        proofEl.removeEventListener('pointerleave', onProofLeave);
        proofEl.removeEventListener('click', onProofClick);
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
  normalizePair, labelOf, lineName, isLeaf, removeStep,
  // kernel
  intersectLineLine, intersectLineCircle, intersectCircleCircle, intersectEval,
  evaluate, evalSets, mulberry32, claimable, sqrtDepth,
  // constructions & goal checkers
  buildI1, findEquilateral, findMidpoint, findBisector, findPerpAt, findSegCopy,
  polygonVerts, findRegularPolygon, TRAP_SEED,
  // transcript
  stepSentence,
  // batteries included
  selfTest,
};
