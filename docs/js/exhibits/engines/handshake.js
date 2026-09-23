// IV·1 — The Handshake
// Elliptic-curve Diffie–Hellman, computed for real and in miniature:
//   · the chord-and-tangent law on y² = x³ + 7 over ℝ (drag P and Q);
//   · the same curve counted mod a small prime, as Rosetta counted its cubic,
//     with the chord surviving as a line wrapped on a torus and a Euclid-computed slope;
//   · scalar multiplication as a one-way walk (and double-and-add as its shortcut);
//   · a live handshake between Alice and Bob with Eve on the wire;
//   · Eve's attacks: the walk, Pollard's rho (a literal ρ), and the same deal on a clock;
//   · and X25519 at full size (RFC 7748 §6.1), in BigInt, checked against the RFC.
// Toy arithmetic uses Number (safe for p ≤ ~2000); full size uses BigInt.

/* =========================================================================
   Pure core — no DOM; verified by selfTest() under node.
   ========================================================================= */

const mod = (a, p) => ((a % p) + p) % p;
const eqPt = (A, B) => A === B || (A !== null && B !== null && A[0] === B[0] && A[1] === B[1]);
const ptKey = (A) => (A === null ? 'O' : A[0] + ',' + A[1]);

// Extended Euclid: a⁻¹ mod p, with the ladder of divisions p = q·a + r … that computes it.
function invMod(a, p) {
  let r0 = p, r1 = mod(a, p), t0 = 0, t1 = 1;
  const steps = [];
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1), r = r0 - q * r1;
    steps.push([r0, q, r1, r]);
    [r0, r1] = [r1, r];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return { inv: r0 === 1 ? mod(t0, p) : null, steps };
}

// Short Weierstrass y² = x³ + a·x + b over 𝔽_p; C = {p, a, b}; the point at infinity O is null.
function onCurve(P, C) {
  if (P === null) return true;
  const p = C.p, [x, y] = P;
  return mod(y * y - ((x * x) % p) * x - C.a * x - C.b, p) === 0;
}
function neg(P, C) { return P === null ? null : [P[0], mod(-P[1], C.p)]; }

// Slope of the chord (or tangent) through P and Q; null when the line is vertical (P = −Q).
function slope(P, Q, C) {
  const p = C.p, [x1, y1] = P, [x2, y2] = Q;
  if (x1 === x2) {
    if (mod(y1 + y2, p) === 0) return null;
    return mod(mod(3 * x1 * x1 + C.a, p) * invMod(2 * y1, p).inv, p);
  }
  return mod(mod(y2 - y1, p) * invMod(x2 - x1, p).inv, p);
}
function ecAdd(P, Q, C) {
  if (P === null) return Q;
  if (Q === null) return P;
  const l = slope(P, Q, C);
  if (l === null) return null;
  const p = C.p, [x1, y1] = P, [x2] = Q;
  const x3 = mod(l * l - x1 - x2, p);
  return [x3, mod(l * (x1 - x3) - y1, p)];
}

// Left-to-right double-and-add. The first 'A' only loads P; each later bit costs a
// doubling 'D', plus an addition 'A' when the bit is 1. chain[i] = {op, m, R = m·P}.
function mulTrace(k, P, C) {
  const bits = k.toString(2);
  let R = P, m = 1, ops = 'A';
  const chain = [{ op: 'A', m: 1, R: P }];
  for (let i = 1; i < bits.length; i++) {
    R = ecAdd(R, R, C); m *= 2; ops += 'D'; chain.push({ op: 'D', m, R });
    if (bits[i] === '1') { R = ecAdd(R, P, C); m += 1; ops += 'A'; chain.push({ op: 'A', m, R }); }
  }
  return { R, ops, chain, bits };
}
function scalarMul(k, P, C) { return k <= 0 ? null : mulTrace(k, P, C).R; }

// All affine points, sorted by x then y — an O(p) census through a table of squares.
function curvePoints(C) {
  const p = C.p, roots = new Map();
  for (let y = 0; y < p; y++) {
    const v = (y * y) % p;
    let arr = roots.get(v);
    if (!arr) roots.set(v, (arr = []));
    arr.push(y);
  }
  const pts = [];
  for (let x = 0; x < p; x++) {
    const ys = roots.get(mod(((x * x) % p) * x + C.a * x + C.b, p));
    if (ys) for (const y of ys) pts.push([x, y]);
  }
  return pts;
}

// The chord through P and Q as a set of p lattice points on the torus, and which of
// them lie on the curve. For a vertical chord, the column x = x₁.
function lineHits(P, Q, C) {
  const p = C.p, lambda = slope(P, Q, C), hits = [];
  if (lambda === null) {
    for (let y = 0; y < p; y++) if (onCurve([P[0], y], C)) hits.push([P[0], y]);
  } else {
    for (let x = 0; x < p; x++) {
      const y = mod(P[1] + lambda * (x - P[0]), p);
      if (onCurve([x, y], C)) hits.push([x, y]);
    }
  }
  return { lambda, hits };
}
function lineLattice(P, lambda, p) {
  const out = [];
  if (lambda === null) { for (let y = 0; y < p; y++) out.push([P[0], y]); return out; }
  for (let x = 0; x < p; x++) out.push([x, mod(P[1] + lambda * (x - P[0]), p)]);
  return out;
}

// The chord's p lattice points {(x, y₁ + λ(x − x₁))} form a lattice line on the torus; any
// vector (a, b) with b ≡ λa (mod p) steps from one of its points to another. Drawing the
// strands along the SHORTEST such vector (Gauss–Lagrange reduction of (1, λ), (0, p)) shows
// the same points with the least clutter.
function torusStep(lambda, p) {
  const n2 = (w) => w[0] * w[0] + w[1] * w[1];
  let u = [1, mod(lambda, p)], v = [0, p];
  if (n2(u) > n2(v)) [u, v] = [v, u];
  for (let guard = 0; guard < 64; guard++) {
    const m = Math.round((u[0] * v[0] + u[1] * v[1]) / n2(u));
    v = [v[0] - m * u[0], v[1] - m * u[1]];
    if (n2(v) >= n2(u)) break;
    [u, v] = [v, u];
  }
  return u[0] < 0 || (u[0] === 0 && u[1] < 0) ? [-u[0], -u[1]] : u;
}

// Eve's first idea: walk G, 2G, 3G … until the public point appears.
function walkDlog(G, A, C, limit = 1e6) {
  let R = G, k = 1;
  while (!eqPt(R, A)) {
    R = ecAdd(R, G, C); k++;
    if (R === null || k > limit) return null;
  }
  return k;
}

// Pollard's rho (1978) with Floyd's cycle finding. R = c·G + d·A, partitioned by x mod 3:
// 0 → double, 1 → add G, 2 → add A. When the tortoise meets the hare,
// c_T + d_T·a ≡ c_H + d_H·a (mod n), so a = (c_T − c_H)·(d_H − d_T)⁻¹.
function rhoStep(s, G, A, n, C) {
  const part = s.R === null ? 0 : s.R[0] % 3;
  if (part === 0) return { R: ecAdd(s.R, s.R, C), c: (2 * s.c) % n, d: (2 * s.d) % n };
  if (part === 1) return { R: ecAdd(s.R, G, C), c: (s.c + 1) % n, d: s.d };
  return { R: ecAdd(s.R, A, C), c: s.c, d: (s.d + 1) % n };
}
function rhoFrom(G, A, n, C, c0, d0) {
  const f = (s) => rhoStep(s, G, A, n, C);
  const s0 = { R: ecAdd(scalarMul(c0, G, C), scalarMul(d0, A, C), C), c: mod(c0, n), d: mod(d0, n) };
  const seq = [s0], seen = new Map([[ptKey(s0.R), 0]]);
  let s = s0, tail = 0, cycle = 0;
  for (;;) {
    s = f(s);
    const key = ptKey(s.R);
    if (seen.has(key)) { tail = seen.get(key); cycle = seq.length - tail; break; }
    seen.set(key, seq.length);
    seq.push(s);
  }
  let T = f(s0), H = f(f(s0)), it = 1;
  while (!eqPt(T.R, H.R)) { T = f(T); H = f(f(H)); it++; }
  const dd = mod(H.d - T.d, n);
  const a = dd === 0 ? null : mod((T.c - H.c) * invMod(dd, n).inv, n);
  return { a, floydIters: it, tail, cycle, seq, start: [c0, d0], T, H };
}
function pollardRho(G, A, n, C, c0 = 1, d0 = 0) {
  // A collision with d_H ≡ d_T teaches nothing: restart from another (c₀, d₀).
  for (let s = 0; s < 16; s++) {
    const r = rhoFrom(G, A, n, C, mod(c0 + 3 * s, n) || 1, mod(d0 + 2 * s, n));
    if (r.a !== null) return r;
  }
  return { a: null };
}
// Where index j of the ρ sequence sits once the loop has closed.
function rhoIndex(j, tail, cycle) { return j < tail + cycle ? j : tail + ((j - tail) % cycle); }

// The same deal on a clock: the additive group ℤ/n, where "g·a" is plain multiplication
// and Euclid undoes it at once.
function clockDH(a, g, n) { return mod(a * g, n); }
function clockBreak(A, g, n) {
  const e = invMod(g, n);
  return { a: mod(A * e.inv, n), inv: e.inv, steps: e.steps };
}

// The sound of a point: two octaves up from A3 across x, panned by y. ∞ is silence.
function pitchOfX(x, p) { return 220 * Math.pow(2, (2 * x) / p); }
function panOfY(y, p) { return 0.6 * ((2 * y) / p - 1); }
function hasseWindow(p) { const w = 2 * Math.sqrt(p); return { lo: p + 1 - w, hi: p + 1 + w }; }

// The real curve y² = x³ + 7: one smooth branch, parameterized by y.
function realX(y) { return Math.cbrt(y * y - 7); }
// The opening chord (by y-parameter): P = (−1, −√6), Q = (2, √15), which puts P, Q, −(P+Q)
// and P + Q far enough apart to read on a phone.
const CHORD0 = { tP: -Math.sqrt(6), tQ: Math.sqrt(15) };
function realAdd(P, Q) {
  if (P === null) return Q;
  if (Q === null) return P;
  const [x1, y1] = P, [x2, y2] = Q;
  let l;
  if (x1 === x2) {
    if (Math.abs(y1 + y2) < 1e-12) return null;
    l = (3 * x1 * x1) / (2 * y1);
  } else l = (y2 - y1) / (x2 - x1);
  const x3 = l * l - x1 - x2;
  return [x3, l * (x1 - x3) - y1];
}

// Costs, as log₂ of group operations: the honest parties (~1.5 operations per key bit)
// against Pollard's rho (≈ 0.886·√n additions, the SafeCurves figure).
function honestLog2(bits) { return Math.log2(1.5 * bits); }
function rhoLog2(bits) { return Math.log2(0.886) + bits / 2; }

/* ---------- X25519 (RFC 7748), BigInt, not constant-time: a demonstration ---------- */

const P25519 = (1n << 255n) - 19n;
const A24 = 121665n;
const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
function leToBig(b) { let r = 0n; for (let i = b.length - 1; i >= 0; i--) r = (r << 8n) | BigInt(b[i]); return r; }
function bigToLe(x) { const out = new Uint8Array(32); for (let i = 0; i < 32; i++) { out[i] = Number(x & 255n); x >>= 8n; } return out; }
const fmod = (a) => { a %= P25519; return a < 0n ? a + P25519 : a; };
function fpow(b, e) { let r = 1n; b = fmod(b); while (e > 0n) { if (e & 1n) r = (r * b) % P25519; b = (b * b) % P25519; e >>= 1n; } return r; }
// Clamp: clear the three low bits (a multiple of the cofactor 8), clear bit 255, set bit 254.
function decodeScalar(hex) { const b = hexToBytes(hex); b[0] &= 248; b[31] &= 127; b[31] |= 64; return leToBig(b); }
function decodeU(hex) { const b = hexToBytes(hex); b[31] &= 127; return leToBig(b) % P25519; }
// The Montgomery ladder: 255 identical steps, bits 254 … 0, on v² = u³ + 486662u² + u.
function ladder(k, u) {
  const x1 = u;
  let x2 = 1n, z2 = 0n, x3 = u, z3 = 1n, swap = 0n;
  for (let t = 254n; t >= 0n; t--) {
    const kt = (k >> t) & 1n;
    swap ^= kt;
    if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
    swap = kt;
    const A = fmod(x2 + z2), AA = (A * A) % P25519, B = fmod(x2 - z2), BB = (B * B) % P25519;
    const E = fmod(AA - BB), Cc = fmod(x3 + z3), D = fmod(x3 - z3);
    const DA = (D * A) % P25519, CB = (Cc * B) % P25519;
    x3 = fmod((DA + CB) ** 2n);
    z3 = fmod(x1 * fmod((DA - CB) ** 2n));
    x2 = (AA * BB) % P25519;
    z2 = fmod(E * fmod(AA + A24 * E));
  }
  if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
  return fmod(x2 * fpow(z2, P25519 - 2n));
}
function x25519(kHex, uHex) { return bytesToHex(bigToLe(ladder(decodeScalar(kHex), decodeU(uHex)))); }
function scalarBits(kHex) { const k = decodeScalar(kHex), out = []; for (let t = 254n; t >= 0n; t--) out.push(Number((k >> t) & 1n)); return out; }
const U9 = '09' + '00'.repeat(31);
const RFC = {
  a: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
  A: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
  b: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
  B: 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
  K: '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742',
};

/* ---------- secp256k1 (SEC 2): Bitcoin's curve is y² = x³ + 7 over a 256-bit prime ---------- */

const SECP256K1 = {
  p: (1n << 256n) - (1n << 32n) - 977n,
  n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n,
  Gx: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
  Gy: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,
};
function bmod(a, m) { a %= m; return a < 0n ? a + m : a; }
function binv(a, m) {
  let r0 = m, r1 = bmod(a, m), t0 = 0n, t1 = 1n;
  while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [t0, t1] = [t1, t0 - q * t1]; }
  return bmod(t0, m);
}
function badd(P, Q, p) {
  if (P === null) return Q;
  if (Q === null) return P;
  const [x1, y1] = P, [x2, y2] = Q;
  let l;
  if (x1 === x2) {
    if (bmod(y1 + y2, p) === 0n) return null;
    l = bmod(3n * x1 * x1 * binv(2n * y1, p), p);
  } else l = bmod((y2 - y1) * binv(x2 - x1, p), p);
  const x3 = bmod(l * l - x1 - x2, p);
  return [x3, bmod(l * (x1 - x3) - y1, p)];
}
function bmul(k, P, p) { let R = null; for (const bit of k.toString(2)) { R = badd(R, R, p); if (bit === '1') R = badd(R, P, p); } return R; }
// Checks G on the curve, n·G = ∞, and returns the trace p + 1 − n (Rosetta's a_p at full size).
function secp256k1Check() {
  const { p, n, Gx, Gy } = SECP256K1;
  if (bmod(Gy * Gy - Gx * Gx * Gx - 7n, p) !== 0n) throw new Error('secp256k1: G is not on the curve');
  if (bmul(n, [Gx, Gy], p) !== null) throw new Error('secp256k1: n·G is not the point at infinity');
  const trace = p + 1n - n;
  if (trace * trace > 4n * p) throw new Error('secp256k1: trace outside the Hasse window');
  return trace;
}

/* ---------- the toy primes ---------- */

// All p ≡ 1 (mod 3). Safe ones have a prime number of points; the "traps" are anomalous
// (#E = p), where Smart (1999) moves the logarithm into the additive group of 𝔽_p.
const PRIMES = [
  { p: 43, trap: false }, { p: 61, trap: true }, { p: 97, trap: false },
  { p: 127, trap: true }, { p: 211, trap: false }, { p: 349, trap: false },
];
function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
// The toy base point: the lowest point of the first occupied column.
function toyModel(p) {
  const C = { p, a: 0, b: 7 };
  const pts = curvePoints(C);
  const n = pts.length + 1;
  const G = pts[0];
  const mult = [null];
  let R = null;
  for (let k = 1; k <= n; k++) { R = ecAdd(R, G, C); mult.push(R); }
  const logOf = new Map();
  for (let k = 1; k < n; k++) logOf.set(ptKey(mult[k]), k);
  const colHas = new Uint8Array(p);
  for (const q of pts) colHas[q[0]] = 1;
  let cols = 0;
  for (let x = 0; x < p; x++) cols += colHas[x];
  return { p, C, pts, n, G, mult, logOf, colHas, cols, trap: n === p, hasse: hasseWindow(p) };
}

/* ---------- the referee ---------- */

function selfTest() {
  const ok = (c, msg) => { if (!c) throw new Error('handshake selfTest: ' + msg); };
  const same = (A, B) => eqPt(A, B);
  const C = { p: 97, a: 0, b: 7 }, G = [1, 28];
  const pts = curvePoints(C);
  ok(pts.length === 78, 'mod 97 has 78 affine points');
  ok(isPrime(pts.length + 1), '#E(𝔽₉₇) = 79 is prime');
  ok(new Set(pts.map((q) => q[0])).size === 39, '39 columns carry points');
  ok(98 - 79 === 19 && Math.abs(19) <= 2 * Math.sqrt(97), 'a₉₇ = 19 inside Hasse');
  ok(pts.every((q) => onCurve(q, C)), 'census points lie on the curve');
  ok(same(toyModel(97).G, G), 'toy base point at p = 97 is (1, 28)');
  ok(same(scalarMul(2, G, C), [68, 81]) && same(scalarMul(3, G, C), [53, 38]), '2G, 3G');
  ok(same(scalarMul(78, G, C), [1, 69]) && scalarMul(79, G, C) === null, '78G = −G, 79G = ∞');
  const orbit = new Set();
  for (let k = 1, R = G; k < 79; k++, R = ecAdd(R, G, C)) orbit.add(ptKey(R));
  ok(orbit.size === 78, 'the orbit of G visits every point');
  const e = invMod(56, 97);
  ok(e.inv === 26 && e.steps.length === 7, '56⁻¹ ≡ 26 (mod 97) in 7 divisions');
  const tan = lineHits(G, G, C);
  ok(tan.lambda === 78 && tan.hits.length === 2 && same(neg(scalarMul(2, G, C), C), [68, 16]), 'tangent at G');
  ok(tan.hits.some((q) => same(q, [1, 28])) && tan.hits.some((q) => same(q, [68, 16])), 'tangent hits');
  const ch = lineHits(G, [68, 81], C);
  ok(ch.lambda === 92 && ch.hits.length === 3 && ch.hits.some((q) => same(q, [53, 59])), 'chord through G and 2G');
  for (let l = 1; l < 97; l++) {
    const [a, b] = torusStep(l, 97);
    ok((a || b) && mod(b - l * a, 97) === 0 && a * a + b * b <= (2 * 97) / Math.sqrt(3) + 1e-9, 'torus step for λ = ' + l);
  }
  ok(same(torusStep(78, 97), [5, 2]), 'the tangent at G wraps along (5, 2)');
  // The line-hit law: every chord meets the curve exactly at P, Q and −(P+Q).
  for (const P of pts) for (const Q of pts) {
    const l = slope(P, Q, C);
    if (l === null) continue;
    const want = new Set([ptKey(P), ptKey(Q), ptKey(neg(ecAdd(P, Q, C), C))]);
    const got = new Set(lineHits(P, Q, C).hits.map(ptKey));
    ok(got.size === want.size && [...got].every((k) => want.has(k)), 'line-hit law at ' + ptKey(P) + ' + ' + ptKey(Q));
  }
  // The handshake.
  const A = scalarMul(17, G, C), B = scalarMul(42, G, C);
  ok(same(A, [17, 78]) && same(B, [71, 45]), 'public points A, B');
  ok(same(scalarMul(17, B, C), [53, 38]) && same(scalarMul(42, A, C), [53, 38]) && (17 * 42) % 79 === 3, 'aB = bA = 3G');
  ok(mulTrace(42, G, C).ops === 'ADDADDAD' && mulTrace(17, G, C).ops === 'ADDDDA', 'double-and-add traces');
  ok(walkDlog(G, A, C) === 17 && walkDlog(G, B, C) === 42, 'walking logarithms');
  // Eve's rho.
  const r1 = pollardRho(G, A, 79, C, 1, 0);
  ok(r1.a === 17 && r1.floydIters === 8 && r1.tail === 3 && r1.cycle === 8, 'rho at p = 97');
  const r2 = rhoFrom(G, A, 79, C, 2, 1), r3 = rhoFrom(G, A, 79, C, 5, 3);
  ok(r2.tail === 1 && r2.cycle === 8 && r3.tail === 4 && r3.cycle === 8, 'rho from other starts');
  const C211 = { p: 211, a: 0, b: 7 }, G211 = [3, 33], A211 = scalarMul(101, G211, C211);
  ok(same(toyModel(211).G, G211) && same(A211, [191, 5]), 'p = 211 base point and A');
  const r4 = pollardRho(G211, A211, 199, C211, 1, 0);
  ok(r4.a === 101 && r4.floydIters === 22 && r4.tail === 14 && r4.cycle === 11, 'rho at p = 211');
  // Rho, the walk and the clock must recover EVERY secret a visitor can choose at p = 97.
  for (let a = 2; a < 79; a++) {
    const Aa = scalarMul(a, G, C);
    ok(pollardRho(G, Aa, 79, C).a === a && walkDlog(G, Aa, C) === a && clockBreak(clockDH(a, 7, 79), 7, 79).a === a, 'every secret at p = 97: ' + a);
  }
  // The group law itself: associativity on a spread of triples, and closure.
  for (let i = 0; i < 78; i += 5) for (let j = 1; j < 78; j += 7) for (let k = 2; k < 78; k += 11) {
    const P = pts[i], Q = pts[j], R = pts[k];
    ok(same(ecAdd(ecAdd(P, Q, C), R, C), ecAdd(P, ecAdd(Q, R, C), C)) && onCurve(ecAdd(P, Q, C), C), 'associativity');
  }
  // The primes on offer, and the traps.
  const orders = { 43: 31, 61: 61, 67: 79, 97: 79, 127: 127, 163: 139, 211: 199, 349: 313, 397: 397 };
  for (const [p, want] of Object.entries(orders)) {
    const cnt = curvePoints({ p: +p, a: 0, b: 7 }).length + 1;
    ok(cnt === want, `#E(𝔽_${p}) = ${want}`);
    const h = hasseWindow(+p);
    ok(cnt >= h.lo && cnt <= h.hi, 'Hasse at ' + p);
  }
  for (const { p, trap } of PRIMES) {
    const m = toyModel(p);
    ok(isPrime(m.n), 'prime group order at ' + p);
    ok(m.trap === trap, 'trap flag at ' + p);
    ok(m.mult[m.n] === null && m.logOf.size === m.n - 1, 'G generates at ' + p);
  }
  // The clock.
  ok(clockDH(17, 7, 79) === 40 && invMod(7, 79).inv === 34, 'clock: A = 40, 7⁻¹ = 34');
  const cb = clockBreak(40, 7, 79);
  ok(cb.a === 17 && cb.steps.length === 3, 'clock broken by Euclid in 3 divisions');
  // Sound.
  ok(Math.abs(pitchOfX(53, 97) - 469.23) < 0.01 && Math.abs(pitchOfX(17, 97) - 280.50) < 0.01, 'pitch law');
  // The real curve.
  const S = realAdd([-1, Math.sqrt(6)], [2, Math.sqrt(15)]);
  ok(Math.abs(S[0] + 0.774852) < 1e-6 && Math.abs(S[1] + 2.556322) < 1e-6, 'real chord');
  ok(Math.abs(S[1] * S[1] - S[0] ** 3 - 7) < 1e-9, 'real sum on the curve');
  // The stage's opening chord, P = (−1, −√6) and Q = (2, √15): the third point lands far up the branch.
  const S0 = realAdd([realX(CHORD0.tP), CHORD0.tP], [realX(CHORD0.tQ), CHORD0.tQ]);
  ok(Math.abs(realX(CHORD0.tP) + 1) < 1e-12 && Math.abs(realX(CHORD0.tQ) - 2) < 1e-12, 'opening chord P, Q');
  ok(Math.abs(S0[1] * S0[1] - S0[0] ** 3 - 7) < 1e-9 && S0[0] > 3 && S0[0] < 4 && S0[1] < -6, 'opening chord P + Q');
  const flex = [0, Math.sqrt(7)], twice = realAdd(flex, flex);
  ok(Math.abs(twice[0]) < 1e-12 && Math.abs(twice[1] + Math.sqrt(7)) < 1e-12 && realAdd(twice, flex) === null, 'flex: 3P = ∞');
  // X25519, RFC 7748 §6.1.
  ok(x25519(RFC.a, U9) === RFC.A && x25519(RFC.b, U9) === RFC.B, 'X25519 public keys');
  ok(x25519(RFC.a, RFC.B) === RFC.K && x25519(RFC.b, RFC.A) === RFC.K, 'X25519 shared secret');
  // RFC 7748 §5.2, second vector: its u has the top bit set, which decodeU must mask.
  ok(x25519('4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d',
    'e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493') ===
    '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957', 'X25519 §5.2 vector 2');
  const bits = scalarBits(RFC.a);
  ok(bits.length === 255 && bits[0] === 1 && bits[252] === 0 && bits[253] === 0 && bits[254] === 0, 'clamped scalar bits');
  // Rho costs at full size (SafeCurves: 2^127.8 and 2^125.8).
  ok(Math.abs(rhoLog2(256) - 127.8) < 0.05 && Math.abs(rhoLog2(252) - 125.8) < 0.05, 'rho costs');
  // secp256k1.
  ok(SECP256K1.p === 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn, 'secp256k1 p');
  ok(secp256k1Check() === 432420386565659656852420866390673177327n, 'secp256k1 trace');
  return true;
}

export const _test = {
  mod, invMod, onCurve, neg, slope, ecAdd, mulTrace, scalarMul, curvePoints, lineHits, lineLattice, torusStep,
  walkDlog, rhoStep, rhoFrom, pollardRho, rhoIndex, clockDH, clockBreak, pitchOfX, panOfY, hasseWindow,
  realX, realAdd, honestLog2, rhoLog2, x25519, ladder, decodeScalar, decodeU, scalarBits, secp256k1Check,
  toyModel, PRIMES, RFC, SECP256K1, selfTest,
};

/* =========================================================================
   The exhibit
   ========================================================================= */

const VIEWS = [
  { key: 'chord', num: 'i', label: 'the chord' },
  { key: 'count', num: 'ii', label: 'mod p' },
  { key: 'walk', num: 'iii', label: 'the walk' },
  { key: 'shake', num: 'iv', label: 'the handshake' },
  { key: 'eve', num: 'v', label: 'Eve' },
  { key: 'full', num: 'vi', label: 'full size' },
];

export default {
  id: 'handshake',
  movement: 4,
  title: 'The Handshake',
  hook: 'Two strangers agree on a secret while everyone listens. The trick is a walk on a curve that only goes one way.',
  era: '1901 → 2025 · from Poincaré’s chords to the post-quantum handshake',
  prose: `
    <p>In November 1976 Whitfield Diffie and Martin Hellman published a way for two strangers
    to agree on a secret while every word between them is overheard. Each keeps a private
    number and publishes a disguised version of it; each combines the other’s disguise with
    their own number; both arrive at the same key, and the listener, who has seen both
    disguises, does not. The disguise was exponentiation modulo a prime, a one-way function
    suggested to them, they wrote, by John Gill of Stanford, and the scheme rested on “the apparent difficulty
    of computing logarithms over a finite field.” They were candid about the foundation: even
    granting that difficulty, “we do not currently have a proof” that the system is secure.
    Half a century later nobody has one.</p>
    <p>The version a browser runs today lives on a curve. Louis Mordell wrote his Smith’s Prize
    essay on <code>y² = x³ + k</code>, an equation Fermat had already considered; with
    <em>k</em> = 7, taken over a 256-bit prime, it is the curve Bitcoin signs with. Its points
    can be added. In a memoir of 1901 Henri Poincaré put the construction in one clause:
    <em>la droite qui joint deux points rationnels donnés va couper la cubique en un troisième
    point</em>, the line joining two given rational points will cut the cubic in a third point.
    Reflect that third point across the axis and you have <em>P</em> + <em>Q</em>;
    let the two points merge and the chord becomes a tangent, which doubles. Mordell proved in
    1922 what Poincaré had conjectured, that finitely many rational points generate all the
    others in this way.</p>
    <p>The cryptographer’s move is to count the curve instead of drawing it. Take remainders
    modulo 97, as the <a href="#ex-rosetta">Rosetta Stone</a> counted its cubic prime by
    prime, and <code>y² = x³ + 7</code> has 78 solutions. Add the point at infinity, where
    vertical lines meet, and there are 79, just inside the window of 98 ± 2√97 that Hasse
    proved in 1933. The chord survives the translation. Its slope becomes a division modulo 97,
    which Euclid’s algorithm performs, and the line wraps around the grid like a thread wound
    on a torus, yet through any two points of the curve it still passes through exactly one
    more.</p>
    <p>Now start from one point <em>G</em> and keep adding it: <em>G</em>, 2<em>G</em>,
    3<em>G</em>. Like the <a href="#ex-fifths">circle of fifths</a>, the walk visits all 78
    points before it comes home to infinity, the seventy-ninth, because 79 is prime; unlike the
    circle of fifths, it visits them in an order with no visible pattern. Forward is cheap, since
    doubling cuts the walk short: 42<em>G</em> takes seven operations, where adding <em>G</em>
    one step at a time takes forty-one. Backward,
    recovering 42 from the point 42<em>G</em>, is the <em>discrete logarithm</em>. Alice
    publishes <em>aG</em>, Bob publishes <em>bG</em>, and each multiplies the other’s point by
    a private number. Both land on <em>abG</em>. Eve, who copied <em>aG</em> and <em>bG</em>
    off the wire, must, as far as anyone knows, take a logarithm.</p>
    <p>Neal Koblitz and Victor Miller proposed the move to curves independently in 1985.
    Logarithms modulo a prime yield to index calculus, a subexponential attack. On a
    well-chosen curve the best general method known is John Pollard’s rho, from 1978, which
    needs about 0.886√<em>n</em> additions for a group of <em>n</em> points. That gap is why
    NIST rates a 256-bit curve as strong as 3,072-bit ordinary Diffie–Hellman; at that size
    rho needs about 2¹²⁸ additions. Daniel J. Bernstein’s Curve25519, presented in 2006 over
    the prime 2²⁵⁵ − 19, is the one the last room runs: a ladder of 255 identical steps,
    specified in RFC 7748 and named in TLS 1.3, the protocol behind the padlock in a browser.</p>
    <p>Diffie and Hellman were not quite first. Malcolm Williamson, who joined GCHQ, Britain’s
    signals intelligence agency, in 1974, had found what an IEEE Milestone calls “essentially
    the Diffie, Hellman and Merkle public-key exchange”, and it stayed secret until December
    1997. And the lock has a known pick, waiting for a machine to hold it. In 1994 Peter Shor
    gave a quantum algorithm for discrete logarithms that adapts to curves: a large enough
    fault-tolerant quantum computer could take these logarithms quickly (the
    <a href="#ex-shor">last engine</a> of this movement). So the curve is being given a
    partner. NIST published its lattice-based ML-KEM in August 2024, and the hybrid handshakes
    now used by Chrome, Firefox, OpenSSH and Signal pair an elliptic-curve exchange with a
    lattice one, so that an attacker would have to break both.</p>`,

  chronicle: [
    { year: 1901, date: '1901', text: 'Henri Poincaré’s memoir on the arithmetic of algebraic curves builds new rational points on a cubic from known ones by chords and tangents: the line joining two rational points “va couper la cubique en un troisième point”.' },
    { year: 1974, date: '1974–75', text: 'Malcolm Williamson, who joined GCHQ in 1974, finds what an IEEE Milestone calls “essentially the Diffie, Hellman and Merkle public-key exchange”. The British work stays secret until December 1997.' },
    { year: 1976, date: 'November 1976', text: 'Whitfield Diffie and Martin Hellman publish <em>New Directions in Cryptography</em>: two parties agree on a key in public, trusting “the apparent difficulty of computing logarithms over a finite field”.' },
    { year: 1985, date: '1985', text: 'Neal Koblitz and Victor Miller independently propose Diffie–Hellman on elliptic curves over finite fields.' },
    { year: 2006, date: '2006', text: 'Daniel J. Bernstein presents Curve25519, over the prime 2²⁵⁵ − 19. RFC 7748 standardizes its X25519 function in 2016.' },
    { year: 2018, date: 'August 2018', text: 'TLS 1.3 (RFC 8446) requires support for elliptic-curve key exchange on NIST P-256 and says implementations should support X25519.' },
    { year: 2024, date: '16 April 2024', text: 'Bitcoin Core 27.0 turns on the encrypted peer-to-peer transport of BIP 324 by default. Peers derive its keys from an x-only elliptic-curve Diffie–Hellman on secp256k1, the curve <em>y</em>² = <em>x</em>³ + 7 over a 256-bit prime.' },
    { year: 2025, date: '9 April 2025', text: 'OpenSSH 10.0 makes the hybrid <em>mlkem768x25519-sha256</em>, X25519 paired with the lattice scheme ML-KEM, its default key agreement, “guaranteed to be no less strong than the popular curve25519-sha256 algorithm”.' },
  ],

  today: `
    <p>A browser opening a TLS 1.3 connection begins with a key exchange of this kind. TLS 1.3
    (RFC 8446, 2018) requires support for elliptic-curve Diffie–Hellman on NIST’s P-256 and says
    implementations should support X25519. In Chrome 131 Google moved the browser’s
    post-quantum hybrid to the standardized ML-KEM-768 paired with X25519. By October 2025
    recent versions of every major browser offered that hybrid by default, and Cloudflare
    reported that most of the human-initiated traffic reaching it used post-quantum key
    agreement. OpenSSH 10.0 (April 2025) made the same hybrid its default.</p>
    <p>Signal has mixed a lattice key encapsulation into its X25519 handshake since September
    2023 (PQXDH), and in October 2025 began rolling out a post-quantum ratchet as well. Bitcoin
    signs with secp256k1, and since Bitcoin Core 27.0 (April 2024) its nodes have used the
    encrypted transport of BIP 324 by default with peers that support it, agreeing keys by an
    x-only elliptic-curve Diffie–Hellman on the same curve.</p>
    <p>The frontier is migration. NIST published ML-KEM as FIPS 203 on 13 August 2024, and a
    November 2024 NIST draft (IR 8547) proposes deprecating 112-bit elliptic-curve
    Diffie–Hellman after 2030 and disallowing it at every strength after 2035. For now the
    curve is kept rather than retired: the hybrids run X25519 in every handshake alongside the
    lattice.</p>`,

  sources: [
    { text: 'W. Diffie & M. E. Hellman, “New Directions in Cryptography”, <em>IEEE Trans. Inf. Theory</em> 22(6):644–654 (Nov 1976)', url: 'https://ee.stanford.edu/~hellman/publications/24.pdf' },
    { text: 'H. Poincaré, “Sur les propriétés arithmétiques des courbes algébriques”, <em>J. Math. Pures Appl.</em> (5) 7:161–233 (1901)', url: 'https://www.numdam.org/item/JMPA_1901_5_7__161_0/' },
    { text: 'N. Koblitz, “Elliptic curve cryptosystems”, <em>Mathematics of Computation</em> 48(177):203–209 (1987); and V. S. Miller, “Use of Elliptic Curves in Cryptography”, CRYPTO ’85, LNCS pp. 417–426 (doi:10.1007/3-540-39799-X_31)', url: 'https://doi.org/10.1090/S0025-5718-1987-0866109-5' },
    { text: 'IEEE Milestone: Invention of Public-key Cryptography, 1969–1975 (dedicated 2010)', url: 'https://ethw.org/Milestones:Invention_of_Public-key_Cryptography,_1969_-_1975' },
    { text: 'D. J. Bernstein & T. Lange, <em>SafeCurves</em>: the rho method and transfers', url: 'https://safecurves.cr.yp.to/rho.html' },
    { text: 'A. Langley, M. Hamburg, S. Turner, RFC 7748, <em>Elliptic Curves for Security</em> (January 2016)', url: 'https://www.rfc-editor.org/rfc/rfc7748' },
    { text: 'E. Rescorla, RFC 8446, <em>The Transport Layer Security (TLS) Protocol Version 1.3</em> (August 2018)', url: 'https://www.rfc-editor.org/rfc/rfc8446' },
    { text: 'NIST, FIPS 203, <em>Module-Lattice-Based Key-Encapsulation Mechanism Standard</em> (13 August 2024); and NIST IR 8547, initial public draft, <em>Transition to Post-Quantum Cryptography Standards</em> (12 November 2024)', url: 'https://csrc.nist.gov/pubs/fips/203/final' },
    { text: 'OpenSSH 10.0 release notes (9 April 2025): <em>mlkem768x25519-sha256</em> becomes the default key agreement', url: 'https://www.openssh.org/txt/release-10.0' },
    { text: 'B. Westerbaan, “State of the post-quantum Internet in 2025”, Cloudflare (28 October 2025)', url: 'https://blog.cloudflare.com/pq-2025/' },
  ],

  alt: 'The curve y² = x³ + 7, first as a gold branch over the real numbers with a draggable chord, then as gold points on a 97-by-97 grid where a walk, a handshake between Alice and Bob, and Eve’s ρ-shaped search are drawn, and finally as two 255-step rings running the real X25519 exchange.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const PAL = cv.palette;
    const K = {
      panel: PAL.panel, line: PAL.line, ink: PAL.ink, inkDim: PAL.inkDim, inkFaint: PAL.inkFaint,
      ghost: PAL.inkGhost, gold: PAL.gold, goldBright: PAL.goldBright, goldDim: PAL.goldDim,
      azure: PAL.azure, azureDim: PAL.azureDim, crimson: PAL.crimson, crimsonBright: PAL.crimsonBright,
      verdant: PAL.verdant, verdigris: PAL.verdigris,
      verdigrisDim: '#3d7168', // verdigris at about 60 % on the house ground, for hairlines
    };
    const SERIF = getComputedStyle(document.body).fontFamily || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

    /* ---------- scoped style ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-handshake .hs-tabs { gap: .45rem .45rem; margin: 0 0 .85rem; }
      #ex-handshake .hs-tabs .btn { font-size: .86rem; padding: .3rem .78rem; }
      #ex-handshake .hs-tabs .btn .hs-num { font-style: italic; color: ${K.verdigris}; margin-right: .42em; }
      #ex-handshake .hs-tabs .btn.active { border-color: ${K.verdigris}; background: rgba(98,179,164,.12); color: ${K.ink}; }
      #ex-handshake .hs-tabs .btn.hs-done .hs-num::after { content: ' ✓'; font-style: normal; font-size: .78em; }
      #ex-handshake .quest-banner { position: relative; padding-bottom: 1.25rem; }
      #ex-handshake .hs-prog { position: absolute; right: .9rem; bottom: .3rem; color: ${K.verdigris};
        font-size: .66rem; letter-spacing: .3em; white-space: nowrap; opacity: .85; }
      #ex-handshake .btn.hs-on { background: rgba(192,91,77,.16); border-color: ${K.crimson}; color: ${K.crimsonBright}; }
      #ex-handshake .controls .ctl { min-width: 7rem; }
      #ex-handshake .hs-rows { margin-top: .9rem; }
      #ex-handshake .hs-rows .controls { margin: 0; }
      #ex-handshake canvas:focus-visible { outline: 1px solid ${K.verdigris}; outline-offset: 3px; }
    `;
    stage.appendChild(styleEl);

    /* ---------- DOM ---------- */
    const quest = ui.questBanner(stage, '');
    const prog = document.createElement('span');
    prog.className = 'hs-prog';
    quest.el.appendChild(prog);

    const tabs = ui.controlRow(stage);
    tabs.classList.add('hs-tabs');
    tabs.setAttribute('role', 'tablist');
    const tabBtns = {};
    for (const v of VIEWS) {
      const b = ui.button(tabs, v.label, () => setView(v.key), { small: true });
      b.innerHTML = `<span class="hs-num">${v.num}</span>${v.label}`;
      b.setAttribute('role', 'tab');
      tabBtns[v.key] = b;
    }
    // The ARIA tab pattern: arrow keys move between the rooms, Home and End jump to the ends.
    function onTabKey(e) {
      const i = VIEWS.findIndex((v) => v.key === view);
      const j = e.key === 'ArrowRight' ? (i + 1) % VIEWS.length : e.key === 'ArrowLeft' ? (i + VIEWS.length - 1) % VIEWS.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault();
      setView(VIEWS[j].key);
      tabBtns[VIEWS[j].key].focus();
    }
    tabs.addEventListener('keydown', onTabKey);

    const stageW = () => Math.max(260, stage.getBoundingClientRect().width - 40);
    const heightFor = (w) => (w >= 720 ? 560 : Math.round(Math.min(860, Math.max(600, w + 390))));
    const canvasOpts = { height: heightFor(stageW()) };
    const handle = cv.setupCanvas(stage, canvasOpts);
    handle.canvas.setAttribute('role', 'img');
    handle.canvas.setAttribute('aria-label', 'The curve y² = x³ + 7 and its handshake; the readout below describes the current view. In the chord room the arrow keys move Q along the curve, and Shift with the arrow keys moves P.');
    let resizeTimer = 0;
    handle.onResize((w) => {
      dirty = true;
      const want = heightFor(w);
      if (want !== canvasOpts.height) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { canvasOpts.height = want; handle.canvas.style.height = want + 'px'; dirty = true; }, 0);
      }
    });

    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'hs-rows';
    stage.appendChild(rowsWrap);
    const rows = {};
    for (const v of VIEWS) rows[v.key] = ui.controlRow(rowsWrap);

    // i · the chord
    ui.button(rows.chord, 'Q onto P (tangent)', () => { chord.tQ = chord.tP; chordChanged(true); });
    ui.button(rows.chord, 'Q to −P (vertical)', () => { chord.tQ = -chord.tP; chordChanged(true); });
    ui.button(rows.chord, 'P and Q on a flex', () => { chord.tP = Math.sqrt(7) * (chord.tP < 0 ? -1 : 1); chord.tQ = chord.tP; chordChanged(true); });
    ui.button(rows.chord, 'reset', () => { chord.tP = CHORD0.tP; chord.tQ = CHORD0.tQ; chordChanged(true); }, { small: true });

    // shared prime selector (moved into whichever row is showing)
    let primeIdx = 2;
    const primeSel = ui.select(rows.count, {
      label: 'the prime',
      options: PRIMES.map((q, i) => {
        const cnt = curvePoints({ p: q.p, a: 0, b: 7 }).length + 1;
        return { value: String(i), label: `p = ${q.p} · ${cnt} points${q.trap ? ' · a trap' : ''}` };
      }),
      value: String(primeIdx),
      onChange: (v) => { primeIdx = +v; setPrime(); },
    });

    // ii · mod p
    const countBtn = ui.button(rows.count, 'count it mod 97', () => startCount(), { primary: true });
    ui.button(rows.count, 'chord through G and 2G', () => pickChord(M.mult[1], M.mult[2]));
    ui.button(rows.count, 'tangent at G', () => pickChord(M.mult[1], M.mult[1]));
    ui.button(rows.count, 'a random chord', () => {
      const i = randInt(M.pts.length), j = randInt(M.pts.length);
      pickChord(M.pts[i], M.pts[j]);
    });

    // iii · the walk
    const walkBtn = ui.button(rows.walk, '▶ walk G, 2G, 3G …', () => startWalk(), { primary: true });
    let daK = 42;
    const kStep = ui.stepper(rows.walk, {
      label: 'multiplier', min: 1, max: 400, value: daK,
      onChange: (v) => { const c = Math.min(Math.max(1, v), M.n - 1); if (c !== v) kStep.set(c); daK = c; walk.da = null; walk.daIdx = -1; dirty = true; updateReadout(); },
    });
    ui.button(rows.walk, 'compute kG by doubling', () => startDoubleAdd());

    // iv · the handshake
    let secA = 17, secB = 42;
    const aStep = ui.stepper(rows.shake, {
      label: 'Alice’s secret', min: 1, max: 400, value: secA,
      onChange: (v) => { const c = Math.min(Math.max(2, v), M.n - 1); if (c !== v) aStep.set(c); secA = c; resetShake(); resetEve(); },
    });
    const bStep = ui.stepper(rows.shake, {
      label: 'Bob’s secret', min: 1, max: 400, value: secB,
      onChange: (v) => { const c = Math.min(Math.max(2, v), M.n - 1); if (c !== v) bStep.set(c); secB = c; resetShake(); },
    });
    ui.button(rows.shake, '⇄ shake hands', () => startShake(), { primary: true });
    ui.button(rows.shake, 'roll new secrets', () => {
      secA = 2 + randInt(M.n - 3); secB = 2 + randInt(M.n - 3);
      aStep.set(secA); bStep.set(secB); resetShake(); resetEve();
    });
    let mishear = false;
    const mishearBtn = ui.button(rows.shake, 'Bob mishears A', () => {
      mishear = !mishear;
      mishearBtn.classList.toggle('hs-on', mishear);
      mishearBtn.setAttribute('aria-pressed', String(mishear));
      resetShake();
    }, { small: true });
    mishearBtn.setAttribute('aria-pressed', 'false');

    // v · Eve
    ui.button(rows.eve, 'ρ Pollard’s rho', () => startRho(), { primary: true });
    ui.button(rows.eve, 'walk until A appears', () => startEveWalk());
    ui.button(rows.eve, 'the same deal on a clock', () => startClock());

    // vi · full size
    ui.button(rows.full, 'shake hands at 2²⁵⁵ − 19', () => startFull(false), { primary: true });
    ui.button(rows.full, 'fresh random keys', () => startFull(true));

    const info = ui.readout(stage, '');
    info.el.setAttribute('aria-live', 'polite');
    const cap = ui.caption(stage, '');
    // Each formula stays whole on a phone; the lines break only after a separating dot.
    const whole = (f) => f.replace(/ /g, '&nbsp;');
    ui.mathline(stage,
      ['λ = (y₂ − y₁)·(x₂ − x₁)⁻¹', 'x₃ = λ² − x₁ − x₂', 'y₃ = λ(x₁ − x₃) − y₁'].map(whole).join(' &nbsp;· ') +
      ' &nbsp;· <span style="color:' + K.verdigris + '">' + whole('a·(bG) = b·(aG)') + '</span>');
    ui.legendPanel(stage,
      '<p>It is often said that GCHQ invented public-key cryptography and the Americans merely ' +
      'rediscovered it. The IEEE Milestone dedicated in 2010 does credit the British work: by 1975 James ' +
      'Ellis had shown that a shared secret key was unnecessary, and Clifford Cocks and Malcolm Williamson ' +
      'had shown how to do without one. But none of it was made public until December 1997, when Cocks was ' +
      'allowed to speak at a conference in Cirencester, so Diffie, Hellman and Merkle, and Rivest, Shamir ' +
      'and Adleman after them, found their schemes independently and in public.</p>' +
      '<p>And an elliptic curve is not an ellipse. The name is inherited from the elliptic integrals that ' +
      'measure the arc of an ellipse; the curve on this stage is an unbounded cubic with one branch.</p>');
    ui.speculationPanel(stage,
      '<p>Two open questions sit under every handshake on this page. The first is classical. No one has ' +
      'proved that the elliptic-curve logarithm is hard, and Diffie and Hellman’s 1976 admission still ' +
      'stands. A shortcut for well-chosen curves, like the index calculus that makes logarithms modulo a ' +
      'prime subexponential, is possible in principle; none is known.</p>' +
      '<p>The second is quantum. Shor’s 1994 algorithm takes these logarithms efficiently on a large ' +
      'fault-tolerant quantum computer, and the published sketches of that machine keep shrinking. In 2017 ' +
      'Roetteler, Naehrig, Svore and Lauter needed at most 2,330 logical qubits for a 256-bit curve. ' +
      'Preprints of 2026 need fewer than 1,200 (Babbush, Gidney and colleagues, March), and their designs on ' +
      'paper run from minutes on under half a million superconducting qubits to about 26 days on some 19,400 ' +
      'trapped-ion qubits, aimed at secp256k1 itself (Häner and colleagues, September). No such machine has been ' +
      'built; when, or whether, one will be is a forecast, not a fact. The migration now under way is driven ' +
      'by “harvest now, decrypt later”: traffic recorded today could be read on a machine built later.</p>');

    /* ---------- shared helpers ---------- */
    const glow = {
      gold: cv.glowSprite(K.goldBright, 48), azure: cv.glowSprite(K.azure, 40), verdant: cv.glowSprite(K.verdant, 40),
      crimson: cv.glowSprite(K.crimson, 40), verdigris: cv.glowSprite(K.verdigris, 40),
    };
    const randInt = (n) => {
      try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] % n; } catch (e) { return Math.floor(Math.random() * n); }
    };
    const minus = (s) => String(s).replace(/-/g, '−');
    const fx = (v, d = 3) => minus((Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d));
    const fp = (A) => (A === null ? '∞' : `(${A[0]}, ${A[1]})`);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

    function txt(ctx, s, x, y, font, color, align = 'left', base = 'alphabetic') {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
      ctx.fillText(s, x, y);
    }
    // Text over drawn lines gets a thin dark halo, like lettering on a star chart.
    function haloText(ctx, s, x, y, font, color, align = 'left') {
      ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,11,16,0.88)';
      ctx.strokeText(s, x, y);
      ctx.fillStyle = color; ctx.fillText(s, x, y);
    }
    // Small-caps rubric for words; an optional italic tail carries any mathematics, which
    // must never be upper-cased (y² = x³ + 7 is not Y² = X³ + 7, and ρ is not Ρ).
    function rubric(ctx, s, x, y, color = K.inkDim, align = 'left', tail = '') {
      ctx.save();
      try { ctx.letterSpacing = '0.16em'; } catch (e) { /* older canvas */ }
      ctx.font = `600 10px ${SERIF}`;
      const w = ctx.measureText(s.toUpperCase()).width;
      ctx.restore();
      ctx.font = it(13.5);
      const wt = tail ? ctx.measureText(tail).width + 8 : 0;
      const x0 = align === 'center' ? x - (w + wt) / 2 : align === 'right' ? x - w - wt : x;
      ctx.save();
      try { ctx.letterSpacing = '0.16em'; } catch (e) { /* older canvas */ }
      txt(ctx, s.toUpperCase(), x0, y, `600 10px ${SERIF}`, color, 'left');
      ctx.restore();
      if (tail) txt(ctx, tail, x0 + w + 8, y + 0.5, it(13.5), K.inkDim, 'left');
    }
    function sci(v) {
      if (v === 0) return '0';
      const e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
      const sup = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
      return minus(m.toFixed(1)) + '×10' + String(e).split('').map((c) => sup[c]).join('');
    }
    // Draw consecutive runs of [text, font, color]; returns the end x.
    function runs(ctx, x, y, parts, align = 'left') {
      let w = 0;
      for (const [s, f] of parts) { ctx.font = f; w += ctx.measureText(s).width; }
      let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      for (const [s, f, c] of parts) { ctx.font = f; ctx.fillStyle = c; ctx.fillText(s, cx, y); cx += ctx.measureText(s).width; }
      return cx;
    }
    function wrapLines(ctx, s, maxW, font) {
      ctx.font = font;
      const words = s.split(' '), lines = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
      }
      if (cur) lines.push(cur);
      return lines;
    }
    const it = (s) => `italic ${s}px ${SERIF}`;
    const sf = (s, w = '') => `${w} ${s}px ${SERIF}`;
    const mono = (s, w = '') => `${w} ${s}px ${MONO}`;
    // Labels are queued while marks are drawn, then placed where they collide with nothing
    // already on the page: marks first, earlier labels next.
    let boxes = [], queued = [];
    function resetLabels() { boxes = []; queued = []; }
    function occupy(x, y, r) { boxes.push([x - r, y - r, x + r, y + r]); }
    function queueLabel(s, X, Y, rr, color, font = it(13.5), bounds = null) { queued.push({ s, X, Y, rr, color, font, bounds }); }
    function flushLabels(ctx) {
      for (const q of queued) {
        ctx.font = q.font;
        const w = ctx.measureText(q.s).width, d = q.rr + 3;
        const cands = [[q.X + d, q.Y - d + 2], [q.X + d, q.Y + d + 10], [q.X - d - w, q.Y - d + 2], [q.X - d - w, q.Y + d + 10],
          [q.X - w / 2, q.Y - d - 4], [q.X - w / 2, q.Y + d + 14], [q.X + d + 6, q.Y + 5], [q.X - d - w - 6, q.Y + 5]];
        const b = q.bounds;
        const fits = (x, y) => !b || (x >= b[0] && x + w <= b[2] && y - 11 >= b[1] && y + 3 <= b[3]);
        const free = (x, y) => !boxes.some((o) => x < o[2] && x + w > o[0] && y - 11 < o[3] && y + 3 > o[1]);
        let pick = cands.find(([x, y]) => fits(x, y) && free(x, y)) || cands.find(([x, y]) => fits(x, y)) || cands[0];
        haloText(ctx, q.s, pick[0], pick[1], q.font, q.color);
        boxes.push([pick[0] - 2, pick[1] - 12, pick[0] + w + 2, pick[1] + 4]);
      }
      queued = [];
    }
    function dot(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    function ring(ctx, x, y, r, color, lw = 1.3) { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    function drawPow(ctx, base, exp, x, y, size, color, align = 'left') {
      ctx.font = mono(size); const wb = ctx.measureText(base).width;
      ctx.font = mono(size * 0.72); const we = ctx.measureText(exp).width;
      const x0 = align === 'right' ? x - wb - we : x;
      txt(ctx, base, x0, y, mono(size), color);
      txt(ctx, exp, x0 + wb + 1, y - size * 0.42, mono(size * 0.72), color);
      return x0 + wb + we + 1;
    }
    function infRing(ctx, x, y, lit, label = true) {
      if (lit) glow.gold.draw(ctx, x, y, 1.1);
      ctx.fillStyle = 'rgba(10,11,16,0.85)';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ring(ctx, x, y, 9, lit ? K.goldBright : K.inkFaint, 1.1);
      txt(ctx, '∞', x, y + 0.5, sf(13), lit ? K.goldBright : K.inkDim, 'center', 'middle');
      if (label) txt(ctx, lit ? 'the point at infinity' : '', x + 15, y + 4, it(12), K.goldBright);
    }

    /* ---------- audio ---------- */
    const bus = audio.createBus('handshake');
    const nowA = () => { const c = audio.getContext(); return c ? c.currentTime : 0; };
    function note(A, t, { level = 0.18, dur = 0.22, pan = null, p = M.p } = {}) {
      if (A === null) return; // ∞ has no coordinates: silence
      audio.playTone(bus, {
        freq: pitchOfX(A[0], p), dur, level, type: 'triangle', when: t,
        pan: pan === null ? panOfY(A[1], p) : pan, attack: 0.006, release: 0.12,
      });
    }

    // One sequence at a time. Sounds are scheduled on the audio clock; the matching visual
    // events wait in a queue until that clock passes them (fifths.js's edgeQueue pattern).
    let seq = null;
    // A new sequence replaces the old one without replaying it: the caller has already reset
    // the state the old events would have written.
    function cancelSeq() { if (seq) { seq.sched.stop(); seq = null; } }
    function runSeq(events, onDone) {
      cancelSeq();
      audio.ensureAudio();
      bus.unmute();
      const s = { evs: events, i: 0, q: [], onDone };
      s.sched = audio.createScheduler((t) => {
        if (s.i >= s.evs.length) return null;
        const e = s.evs[s.i++];
        e.t = t;
        if (e.sound) { try { e.sound(t); } catch (err) { /* sound is optional */ } }
        s.q.push(e);
        return s.i < s.evs.length ? t + (s.evs[s.i].dt ?? 0.25) : null;
      });
      seq = s;
      s.sched.start(0.06);
      dirty = true;
    }
    function consumeSeq() {
      if (!seq) return false;
      const now = nowA();
      while (seq && seq.q.length && seq.q[0].t <= now) {
        const e = seq.q.shift();
        if (e.apply) e.apply(e.t);
      }
      if (seq && seq.i >= seq.evs.length && !seq.q.length) {
        const done = seq.onDone;
        seq = null;
        if (done) done();
      }
      return true;
    }
    // Finish the running sequence at once, silently (pause, tab switch, a new sequence).
    function flushSeq() {
      if (!seq) return;
      const s = seq;
      seq = null;
      s.sched.stop();
      for (const e of s.q) if (e.apply) e.apply(e.t ?? 0);
      for (let j = s.i; j < s.evs.length; j++) if (s.evs[j].apply) s.evs[j].apply(0);
      if (s.onDone) s.onDone();
      dirty = true;
    }

    /* ---------- state ---------- */
    let view = 'chord';
    let dirty = true;
    let M = toyModel(PRIMES[primeIdx].p);
    const done = { chord: false, count: false, walk: false, shake: false, eve: false, full: false };

    const chord = { tP: CHORD0.tP, tQ: CHORD0.tQ, drag: null };
    const count = { x: 0, done: false, P: null, Q: null, flare: [] };
    const walk = { k: 0, running: false, trail: [], hopT0: 0, hopT1: 0, da: null, daIdx: -1, daT0: 0, daT1: 0 };
    const shake = { phase: 'idle', iA: -1, iB: -1, jA: -1, jB: -1, t0: 0, t1: 0, wireT0: 0, wireT1: 0, heard: false, res: null };
    const eve = { mode: 'rho', rho: null, iter: -1, solved: false, walkK: 0, walkDone: false, clockRows: -1, clockDone: false, clockHop: 0, lastWork: null };
    const full = { res: null, idx: 0, running: false, bytes: 0, webcrypto: '' };

    function setPrime() {
      cancelSeq();
      M = toyModel(PRIMES[primeIdx].p);
      countBtn.textContent = `count it mod ${M.p}`;
      count.x = 0; count.done = false; count.P = null; count.Q = null; count.flare = [];
      walk.k = 0; walk.trail = []; walk.da = null; walk.daIdx = -1;
      secA = clamp(secA, 2, M.n - 1); secB = clamp(secB, 2, M.n - 1);
      aStep.set(secA); bStep.set(secB);
      daK = clamp(daK, 1, M.n - 1); kStep.set(daK);
      resetShake(); resetEve();
      updateReadout(); updateQuest();
      dirty = true;
    }
    function resetShake() {
      if (view === 'shake') cancelSeq();
      Object.assign(shake, { phase: 'idle', iA: -1, iB: -1, jA: -1, jB: -1, heard: false, res: null });
      dirty = true; updateReadout();
    }
    function resetEve() {
      if (view === 'eve') cancelSeq();
      Object.assign(eve, { mode: 'rho', rho: null, iter: -1, solved: false, walkK: 0, walkDone: false, clock: null, clockRows: -1, clockDone: false, clockHop: 0, lastWork: null });
      dirty = true;
    }

    /* =====================================================================
       i · the chord, over ℝ
       ===================================================================== */
    const XR = [-2.7, 5.3], YM = 12.6;
    function chordGeom(W, H) {
      const narrow = W < 720;
      const plot = narrow
        ? { x: 12, y: 30, w: W - 24, h: Math.round(Math.min(W * 1.02, H * 0.52)) }
        : { x: 18, y: 30, w: Math.round(W * 0.56), h: H - 52 };
      const lg = narrow
        ? { x: 16, y: plot.y + plot.h + 34, w: W - 32 }
        : { x: plot.x + plot.w + 42, y: 44, w: W - (plot.x + plot.w + 42) - 20 };
      const sx = (x) => plot.x + ((x - XR[0]) / (XR[1] - XR[0])) * plot.w;
      const sy = (y) => plot.y + plot.h / 2 - (y / YM) * (plot.h / 2);
      const wx = (X) => XR[0] + ((X - plot.x) / plot.w) * (XR[1] - XR[0]);
      const wy = (Y) => ((plot.y + plot.h / 2 - Y) / (plot.h / 2)) * YM;
      return { narrow, plot, lg, sx, sy, wx, wy };
    }
    const realPt = (t) => [realX(t), t];
    function chordState() {
      const Pp = realPt(chord.tP), Qp = realPt(chord.tQ);
      let kind = 'chord';
      if (chord.tQ === chord.tP) kind = Math.abs(Math.abs(chord.tP) - Math.sqrt(7)) < 1e-9 ? 'flex' : 'tangent';
      else if (chord.tQ === -chord.tP) kind = 'vertical';
      const S = kind === 'vertical' ? null : realAdd(Pp, Qp);
      const lam = kind === 'vertical' ? null : kind === 'chord' ? (Qp[1] - Pp[1]) / (Qp[0] - Pp[0]) : (3 * Pp[0] * Pp[0]) / (2 * Pp[1]);
      const R = S ? [S[0], -S[1]] : null;
      return { Pp, Qp, S, R, lam, kind };
    }
    function chordChanged(sound) {
      const st = chordState();
      if (st.kind === 'tangent' || st.kind === 'flex') done.chord = true;
      updateQuest();
      if (sound) chordSound(st);
      updateReadout();
      dirty = true;
    }
    function chordSound(st) {
      audio.ensureAudio(); bus.unmute();
      const t = nowA() + 0.03;
      const f = (x) => 220 * Math.pow(2, (2 * (clamp(x, XR[0], XR[1]) - XR[0])) / (XR[1] - XR[0]));
      const pn = (y) => clamp(0.6 * (y / YM), -0.6, 0.6);
      const tone = (A, when, level) => { if (A) audio.playTone(bus, { freq: f(A[0]), dur: 0.26, level, type: 'triangle', when, pan: pn(A[1]) }); };
      tone(st.Pp, t, 0.15);
      tone(st.Qp, t + 0.13, 0.15);
      tone(st.S, t + 0.34, 0.2); // ∞ stays silent
    }
    function nearestT(g, X, Y) {
      let best = null, bd = Infinity;
      for (let i = 0; i <= 600; i++) {
        const t = -YM * 1.02 + (2.04 * YM * i) / 600;
        const d = Math.hypot(g.sx(realX(t)) - X, g.sy(t) - Y);
        if (d < bd) { bd = d; best = t; }
      }
      // refine
      let step = (2.04 * YM) / 600;
      for (let k = 0; k < 20; k++) {
        step /= 2;
        for (const t of [best - step, best + step]) {
          const d = Math.hypot(g.sx(realX(t)) - X, g.sy(t) - Y);
          if (d < bd) { bd = d; best = t; }
        }
      }
      return { t: best, d: bd };
    }

    function drawChord(ctx, W, H) {
      const g = chordGeom(W, H), { plot } = g;
      const st = chordState();
      // frame and axes
      ctx.save();
      ctx.beginPath(); ctx.rect(plot.x, plot.y, plot.w, plot.h); ctx.clip();
      ctx.strokeStyle = K.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(plot.x, Math.round(g.sy(0)) + 0.5); ctx.lineTo(plot.x + plot.w, Math.round(g.sy(0)) + 0.5);
      ctx.moveTo(Math.round(g.sx(0)) + 0.5, plot.y); ctx.lineTo(Math.round(g.sx(0)) + 0.5, plot.y + plot.h); ctx.stroke();
      for (let x = -2; x <= 5; x++) {
        if (!x) continue;
        const X = Math.round(g.sx(x)) + 0.5;
        ctx.beginPath(); ctx.moveTo(X, g.sy(0) - 3); ctx.lineTo(X, g.sy(0) + 3); ctx.stroke();
        txt(ctx, minus(x), X, g.sy(0) + 14, mono(9.5), K.inkFaint, 'center');
      }
      for (let y = -8; y <= 8; y += 4) {
        if (!y) continue;
        const Y = Math.round(g.sy(y)) + 0.5;
        ctx.beginPath(); ctx.moveTo(g.sx(0) - 3, Y); ctx.lineTo(g.sx(0) + 3, Y); ctx.stroke();
        txt(ctx, minus(y), g.sx(0) - 6, Y + 3, mono(9.5), K.inkFaint, 'right');
      }
      // the curve: a soft underglow, then the line
      const pts = [];
      for (let i = 0; i <= 480; i++) { const t = -YM * 1.06 + (2.12 * YM * i) / 480; pts.push(g.sx(realX(t)), g.sy(t)); }
      const trace = () => { ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1]); };
      ctx.lineJoin = 'round';
      trace(); ctx.strokeStyle = 'rgba(201,169,89,0.13)'; ctx.lineWidth = 7; ctx.stroke();
      trace(); ctx.strokeStyle = K.gold; ctx.lineWidth = 1.7; ctx.stroke();
      // the labels placed later keep off the curve
      for (let i = 0; i < pts.length; i += 6) occupy(pts[i], pts[i + 1], 3);
      // flexes
      for (const s of [1, -1]) {
        const X = g.sx(0), Y = g.sy(s * Math.sqrt(7));
        ctx.strokeStyle = K.goldDim; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X - 5, Y); ctx.lineTo(X + 5, Y); ctx.stroke();
      }
      // the line
      const [xP, yP] = st.Pp;
      let infXY = null;
      if (st.kind === 'vertical') {
        const X = g.sx(xP);
        ctx.strokeStyle = K.azure; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(X, plot.y + plot.h); ctx.lineTo(X, plot.y + 26); ctx.stroke();
        infXY = [X, plot.y + 14];
      } else {
        const l = st.lam;
        const x0 = XR[0] - 1, x1 = XR[1] + 1;
        ctx.strokeStyle = K.azure; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(g.sx(x0), g.sy(yP + l * (x0 - xP))); ctx.lineTo(g.sx(x1), g.sy(yP + l * (x1 - xP))); ctx.stroke();
        // and off the chord (sampled every few pixels of screen length)
        let lo = x0, hi = x1;
        if (Math.abs(l) > 1e-9) {
          const xa = xP + (-YM * 1.1 - yP) / l, xb = xP + (YM * 1.1 - yP) / l;
          lo = Math.max(x0, Math.min(xa, xb)); hi = Math.min(x1, Math.max(xa, xb));
        }
        for (let i = 0, n = 120; i <= n && hi > lo; i++) { const xx = lo + ((hi - lo) * i) / n; occupy(g.sx(xx), g.sy(yP + l * (xx - xP)), 3); }
      }
      // reflection: R = −(P + Q) to P + Q
      if (st.S) {
        const [X, Y1, Y2] = [g.sx(st.S[0]), g.sy(st.R[1]), g.sy(st.S[1])];
        ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(217,122,104,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X, Y1); ctx.lineTo(X, Y2); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();

      // points and labels (unclipped labels stay inside by placement)
      const inPlot = (X, Y) => X >= plot.x - 1 && X <= plot.x + plot.w + 1 && Y >= plot.y - 1 && Y <= plot.y + plot.h + 1;
      const bounds = [plot.x + 4, plot.y + 4, plot.x + plot.w - 4, plot.y + plot.h - 4];
      const PX = g.sx(st.Pp[0]), PY = g.sy(st.Pp[1]), QX = g.sx(st.Qp[0]), QY = g.sy(st.Qp[1]);
      const merged = st.kind === 'tangent' || st.kind === 'flex';
      occupy(PX, PY, 7); if (!merged) occupy(QX, QY, 7);
      if (st.S) {
        const RX = g.sx(st.R[0]), RY = g.sy(st.R[1]), SX = g.sx(st.S[0]), SY = g.sy(st.S[1]);
        if (inPlot(RX, RY)) { ring(ctx, RX, RY, 6.5, K.crimsonBright, 1.5); occupy(RX, RY, 8); }
        if (inPlot(SX, SY)) { glow.gold.draw(ctx, SX, SY, 1.1); dot(ctx, SX, SY, 4.2, K.goldBright); occupy(SX, SY, 7); }
        if (inPlot(RX, RY) && st.kind !== 'flex') queueLabel(st.kind === 'chord' ? '−(P + Q)' : '−2P', RX, RY, 7, K.crimsonBright, it(15), bounds);
        if (inPlot(SX, SY)) queueLabel(st.kind === 'chord' ? 'P + Q' : '2P', SX, SY, 7, K.goldBright, it(15), bounds);
        else {
          // The left edge of the plot is empty (the branch starts at x = −∛7), so the note sits there.
          const up = SY < plot.y, down = SY > plot.y + plot.h;
          const cy = up ? plot.y + 18 : down ? plot.y + plot.h - 12 : clamp(SY, plot.y + 18, plot.y + plot.h - 12);
          haloText(ctx, (up ? '↑ ' : down ? '↓ ' : '→ ') + (st.kind === 'chord' ? 'P + Q' : '2P') + ' lies off the page', plot.x + 8, cy, it(12.5), K.goldBright);
        }
      }
      for (const [X, Y, name, active] of [[PX, PY, merged ? 'P = Q' : 'P', chord.drag === 'P'], [QX, QY, 'Q', chord.drag === 'Q']]) {
        if (name === 'Q' && merged) continue;
        if (active) ring(ctx, X, Y, 11, 'rgba(232,226,208,0.35)', 1);
        dot(ctx, X, Y, 5, K.ink);
        ring(ctx, X, Y, 5, K.panel, 1.2);
        queueLabel(name, X, Y, 6, K.ink, it(15), bounds);
      }
      if (infXY) { infRing(ctx, infXY[0], infXY[1], true); occupy(infXY[0], infXY[1], 10); occupy(infXY[0] + 80, infXY[1], 10); }
      flushLabels(ctx);
      rubric(ctx, 'the real curve', plot.x + 2, plot.y - 12, K.inkDim, 'left', 'y² = x³ + 7 over ℝ');
      if (!g.narrow) txt(ctx, 'drag P or Q', plot.x + plot.w, plot.y - 12, it(12), K.inkFaint, 'right');
      drawChordLedger(ctx, g, st, H);
    }

    function drawChordLedger(ctx, g, st, H) {
      const { lg } = g;
      let y = lg.y;
      const x = lg.x, w = lg.w, R = x + w;
      const V = (s, yy, c = K.ink) => txt(ctx, s, R, yy, mono(g.narrow ? 12 : 13), c, 'right');
      const lh = g.narrow ? 22 : 25;
      rubric(ctx, 'the chord-and-tangent law', x, y, K.verdigris);
      y += lh + 4;
      runs(ctx, x, y, [['P', it(16), K.ink], [' = (x₁, y₁)', sf(15), K.inkDim]]); V(`(${fx(st.Pp[0])}, ${fx(st.Pp[1])})`, y);
      y += lh;
      runs(ctx, x, y, [['Q', it(16), K.ink], [' = (x₂, y₂)', sf(15), K.inkDim]]); V(`(${fx(st.Qp[0])}, ${fx(st.Qp[1])})`, y);
      y += lh * 1.25;
      if (st.kind === 'vertical') {
        runs(ctx, x, y, [['x₁ = x₂,  y₁ = −y₂', it(15), K.inkDim]]);
        y += lh;
        runs(ctx, x, y, [['the chord is vertical', it(15), K.azure]]);
        y += lh;
        runs(ctx, x, y, [['P + Q = ∞', it(16), K.goldBright]]); V('the identity', y, K.goldBright);
        y += lh * 1.2;
        const note = 'Vertical lines meet at the point at infinity, which the group law counts as zero: P + (−P) = ∞.';
        for (const ln of wrapLines(ctx, note, w, it(13.5))) { txt(ctx, ln, x, y, it(13.5), K.inkDim); y += 19; }
      } else {
        const tangent = st.kind !== 'chord';
        runs(ctx, x, y, tangent
          ? [['λ', it(16), K.azure], [' = 3x₁² ⁄ 2y₁', it(15), K.inkDim]]
          : [['λ', it(16), K.azure], [' = (y₂ − y₁) ⁄ (x₂ − x₁)', it(15), K.inkDim]]);
        V(fx(st.lam, 4), y, K.azure);
        y += lh;
        runs(ctx, x, y, [['x₃ = λ² − x₁ − x₂', it(15), K.inkDim]]); V(fx(st.S[0], 4), y);
        y += lh;
        runs(ctx, x, y, [['y₃ = λ(x₁ − x₃) − y₁', it(15), K.inkDim]]); V(fx(st.S[1], 4), y);
        y += lh * 1.2;
        runs(ctx, x, y, [[tangent ? '2P' : 'P + Q', it(16.5), K.goldBright], [' = (x₃, y₃)', it(15), K.inkDim]]);
        V(`(${fx(st.S[0])}, ${fx(st.S[1])})`, y, K.goldBright);
        y += lh;
        const res = st.S[1] * st.S[1] - st.S[0] ** 3 - 7;
        runs(ctx, x, y, [['still on the curve:  y₃² − x₃³ − 7', it(13.5), K.inkFaint]]);
        V(sci(res), y, K.inkFaint);
        y += lh * 1.25;
        const note = st.kind === 'flex'
          ? 'A flex: the tangent meets the curve three times at P, so 2P = −P and 3P = ∞. These two points have order three.'
          : st.kind === 'tangent'
            ? 'Q has merged with P and the chord has become the tangent: this is doubling, the step that makes the walk fast.'
            : Math.abs(st.S[1]) > YM || st.S[0] > XR[1]
              ? 'The azure line meets the curve a third time beyond the edge of the plot; the reflection of that point across the axis is P + Q.'
              : 'The azure line meets the curve a third time at the crimson ring; the reflection across the axis is P + Q.';
        for (const ln of wrapLines(ctx, note, w, it(13.5))) { txt(ctx, ln, x, y, it(13.5), K.inkDim); y += 19; }
      }
      y += 16;
      const q = '« La droite qui joint deux points rationnels donnés va couper la cubique en un troisième point qui, étant unique, sera encore rationnel. »';
      const qLines = wrapLines(ctx, q, w, it(13));
      if (y + 12 + qLines.length * 18 + 10 < H) {
        ctx.strokeStyle = K.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 36, y - 6); ctx.stroke();
        y += 12;
        for (const ln of qLines) { txt(ctx, ln, x, y, it(13), K.inkFaint); y += 18; }
        txt(ctx, '— Henri Poincaré, 1901', x, y + 2, sf(12), K.inkFaint);
      }
    }

    // dragging (mouse and pen may also grab the curve itself; a finger must land on P or Q,
    // so that a phone can still scroll past the tall stage)
    let dragMoved = false;
    let tap = null; // a pending tap in the mod-p room, confirmed on release
    function grabWho(X, Y, curveToo) {
      const g = chordGeom(handle.width, handle.height);
      const st = chordState();
      const dP = Math.hypot(g.sx(st.Pp[0]) - X, g.sy(st.Pp[1]) - Y);
      const dQ = Math.hypot(g.sx(st.Qp[0]) - X, g.sy(st.Qp[1]) - Y);
      const merged = st.kind === 'tangent' || st.kind === 'flex';
      if (merged && Math.min(dP, dQ) < 34) return 'Q';
      if (dQ < 34 && dQ <= dP) return 'Q';
      if (dP < 34) return 'P';
      if (curveToo && nearestT(g, X, Y).d < 26) return dQ <= dP ? 'Q' : 'P';
      return null;
    }
    function onTouchStart(e) {
      if (view !== 'chord' || !e.touches || e.touches.length !== 1) return;
      const [X, Y] = cv.pointerPos(handle, e.touches[0]);
      if (grabWho(X, Y, false)) e.preventDefault(); // this touch drags a point instead of scrolling
    }
    function onDown(e) {
      if (view === 'chord') {
        const [X, Y] = cv.pointerPos(handle, e);
        const who = grabWho(X, Y, e.pointerType !== 'touch');
        if (!who) return;
        chord.drag = who; dragMoved = false;
        try { handle.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        onMove(e);
        e.preventDefault();
      } else if (view === 'count') {
        const [X, Y] = cv.pointerPos(handle, e);
        tap = { X, Y, id: e.pointerId };
      }
    }
    function tapCount(X, Y) {
      const g = countGeom(handle.width, handle.height);
      let best = null, bd = Math.max(14, g.lat.cell * 1.2);
      const lim = count.done ? M.p : count.x;
      for (const q of M.pts) {
        if (q[0] >= lim) continue;
        const d = Math.hypot(g.lat.sx(q[0]) - X, g.lat.sy(q[1]) - Y);
        if (d < bd) { bd = d; best = q; }
      }
      if (!best) return;
      if (!count.P || count.Q) { count.P = best; count.Q = null; count.flare = []; dirty = true; updateReadout(); updateQuest(); tapTone(best); }
      else pickChord(count.P, best);
    }
    function onMove(e) {
      if (tap && tap.id === e.pointerId) {
        const [X, Y] = cv.pointerPos(handle, e);
        if (Math.hypot(X - tap.X, Y - tap.Y) > 10) tap = null; // a scroll, not a tap
      }
      if (view !== 'chord') return;
      const g = chordGeom(handle.width, handle.height);
      const [X, Y] = cv.pointerPos(handle, e);
      if (!chord.drag) {
        const st = chordState();
        const near = Math.min(Math.hypot(g.sx(st.Pp[0]) - X, g.sy(st.Pp[1]) - Y), Math.hypot(g.sx(st.Qp[0]) - X, g.sy(st.Qp[1]) - Y));
        handle.canvas.style.cursor = near < 34 ? 'grab' : 'default';
        return;
      }
      handle.canvas.style.cursor = 'grabbing';
      let t = nearestT(g, X, Y).t;
      const other = chord.drag === 'P' ? chord.tQ : chord.tP;
      const scr = (tt) => [g.sx(realX(tt)), g.sy(tt)];
      const [mx, my] = scr(t);
      const near = (tt, r) => { const [a, b] = scr(tt); return Math.hypot(a - mx, b - my) < r; };
      if (near(other, 10)) t = other;                                     // merge: tangent
      else if (near(-other, 10)) t = -other;                              // mirror: vertical
      else for (const s of [Math.sqrt(7), -Math.sqrt(7)]) if (near(s, 9)) t = s; // a flex
      if (chord.drag === 'P') chord.tP = t; else chord.tQ = t;
      dragMoved = true;
      chordChanged(false);
    }
    function onUp(e) {
      if (tap && tap.id === e.pointerId) { const { X, Y } = tap; tap = null; if (view === 'count' && e.type === 'pointerup') tapCount(X, Y); }
      if (view === 'chord' && chord.drag) {
        chord.drag = null;
        handle.canvas.style.cursor = 'default';
        try { handle.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ok */ }
        chordChanged(dragMoved);
      }
    }
    // Keyboard: in the chord room the arrows walk Q along the curve, and Shift + arrows walk P.
    // They snap to the tangent, the vertical and the flexes just as a drag does.
    let keyMoved = false;
    function onKey(e) {
      if (view !== 'chord' || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
      const who = e.shiftKey ? 'P' : 'Q';
      const cur = who === 'P' ? chord.tP : chord.tQ, other = who === 'P' ? chord.tQ : chord.tP;
      let t = clamp(cur + dir * 0.1, -YM, YM);
      for (const s of [other, -other, Math.sqrt(7), -Math.sqrt(7)]) if (Math.abs(t - s) < 0.051 && cur !== s) t = s;
      if (who === 'P') chord.tP = t; else chord.tQ = t;
      keyMoved = true;
      chordChanged(false);
    }
    function onKeyUp() { if (view === 'chord' && keyMoved) { keyMoved = false; chordSound(chordState()); } }
    handle.canvas.tabIndex = 0;
    handle.canvas.style.touchAction = 'pan-y';
    handle.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('pointerup', onUp);
    handle.canvas.addEventListener('pointercancel', onUp);
    handle.canvas.addEventListener('keydown', onKey);
    handle.canvas.addEventListener('keyup', onKeyUp);

    /* =====================================================================
       lattice (shared by ii–v)
       ===================================================================== */
    function lattice(x, y, S) {
      const p = M.p, cell = S / p;
      return { x, y, S, p, cell, sx: (X) => x + (X + 0.5) * cell, sy: (Y) => y + S - (Y + 0.5) * cell, inf: [x + S - 10, y - 17] };
    }
    function drawLattice(ctx, L, { upTo = M.p, alpha = 1, dimAll = false, showInf = true, infLit = false, label = true } = {}) {
      ctx.fillStyle = 'rgba(98,179,164,0.025)';
      ctx.fillRect(L.x, L.y, L.S, L.S);
      ctx.strokeStyle = K.line; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(L.x) + 0.5, Math.round(L.y) + 0.5, Math.round(L.S), Math.round(L.S));
      // scale ticks every 10 residues
      ctx.strokeStyle = K.ghost;
      ctx.beginPath();
      for (let v = 10; v < L.p; v += 10) {
        const X = Math.round(L.sx(v)) + 0.5, Y = Math.round(L.sy(v)) + 0.5;
        ctx.moveTo(X, L.y + L.S); ctx.lineTo(X, L.y + L.S + 3);
        ctx.moveTo(L.x, Y); ctx.lineTo(L.x - 3, Y);
      }
      ctx.stroke();
      // the mirror y ↔ p − y: negation
      const ym = Math.round(L.sy(L.p / 2)) + 0.5;
      ctx.setLineDash([2, 5]); ctx.strokeStyle = 'rgba(169,164,147,0.28)';
      ctx.beginPath(); ctx.moveTo(L.x + 1, ym); ctx.lineTo(L.x + L.S - 1, ym); ctx.stroke(); ctx.setLineDash([]);
      if (label) {
        txt(ctx, '0', L.x - 5, L.y + L.S + 11, mono(9), K.inkFaint, 'right');
        txt(ctx, String(L.p - 1), L.x + L.S, L.y + L.S + 13, mono(9), K.inkFaint, 'right');
        txt(ctx, String(L.p - 1), L.x - 5, L.y + 8, mono(9), K.inkFaint, 'right');
        txt(ctx, 'x', L.x + L.S / 2, L.y + L.S + 14, it(12), K.inkFaint, 'center');
        txt(ctx, 'y', L.x - 12, L.y + L.S / 2 + 4, it(12), K.inkFaint, 'center');
      }
      // the points
      const s = clamp(L.cell * 0.64, 1.7, 7);
      ctx.globalAlpha = alpha * (dimAll ? 0.34 : 1);
      ctx.fillStyle = K.gold;
      for (const q of M.pts) {
        if (q[0] >= upTo) break;
        ctx.fillRect(L.sx(q[0]) - s / 2, L.sy(q[1]) - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      if (showInf) infRing(ctx, L.inf[0], L.inf[1], infLit, false);
      return s;
    }
    function square(ctx, L, A, color, scale = 1) {
      const s = clamp(L.cell * 0.64, 1.7, 7) * scale;
      ctx.fillStyle = color;
      ctx.fillRect(L.sx(A[0]) - s / 2, L.sy(A[1]) - s / 2, s, s);
    }
    function markPt(ctx, L, A, color, name, { r = null, glowS = null } = {}) {
      if (A === null) return;
      const X = L.sx(A[0]), Y = L.sy(A[1]);
      if (glowS) glowS.draw(ctx, X, Y, 1);
      const rr = r ?? Math.max(5, L.cell * 0.9);
      ring(ctx, X, Y, rr, color, 1.4);
      occupy(X, Y, rr + 1);
      if (name) queueLabel(name, X, Y, rr, color, it(13.5), [L.x + 3, L.y + 3, L.x + L.S - 3, L.y + L.S - 3]);
    }
    function hop(ctx, L, A, B, color, width = 1.2, dash = null) {
      if (A === null || B === null) return;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(L.sx(A[0]), L.sy(A[1])); ctx.lineTo(L.sx(B[0]), L.sy(B[1])); ctx.stroke();
      if (dash) ctx.setLineDash([]);
    }
    function headAt(L, A, B, u) {
      if (B === null) return [L.inf[0], L.inf[1]];
      if (A === null) A = B;
      return [lerp(L.sx(A[0]), L.sx(B[0]), ease(u)), lerp(L.sy(A[1]), L.sy(B[1]), ease(u))];
    }
    function tapTone(A) { audio.ensureAudio(); bus.unmute(); note(A, nowA() + 0.02, { level: 0.16 }); }

    /* =====================================================================
       ii · counted mod p
       ===================================================================== */
    function countGeom(W, H) {
      const narrow = W < 720;
      if (narrow) {
        const S = Math.round(W - 58);
        return { narrow, lat: lattice(40, 52, S), pan: { x: 16, y: 52 + S + 34, w: W - 32 } };
      }
      const S = Math.round(Math.min(H - 92, W * 0.5));
      return { narrow, lat: lattice(46, 54, S), pan: { x: 46 + S + 46, y: 50, w: W - (46 + S + 46) - 20 } };
    }
    function startCount() {
      count.x = 0; count.done = false; count.P = null; count.Q = null; count.flare = [];
      const p = M.p, dt = (1.5 + p / 110) / p, evs = [];
      for (let x = 0; x < p; x++) {
        const has = M.colHas[x];
        evs.push({
          dt,
          sound: has ? (t) => audio.playTone(bus, { freq: pitchOfX(x, p), dur: 0.07, level: 0.1, type: 'triangle', when: t }) : null,
          apply: () => { count.x = x + 1; dirty = true; },
        });
      }
      evs.push({ dt: 0.1, apply: () => { count.done = true; count.x = p; updateReadout(); updateQuest(); dirty = true; } });
      runSeq(evs);
      updateReadout();
    }
    function pickChord(A, B) {
      if (view !== 'count') setView('count');
      if (!count.done) { flushSeq(); count.done = true; count.x = M.p; }
      count.P = A; count.Q = B;
      const S = ecAdd(A, B, M.C), R = neg(S, M.C);
      const order = [A, B, R, S];
      count.flare = [];
      runSeq(order.map((Pt, i) => ({
        dt: i === 0 ? 0 : 0.24,
        sound: (t) => note(Pt, t, { level: i === 3 ? 0.2 : 0.15 }),
        apply: (t) => { count.flare.push({ i, t: t || nowA() }); dirty = true; },
      })), () => { updateQuest(); });
      if (!done.count) { done.count = true; }
      updateReadout(); updateQuest();
    }

    function drawCount(ctx, W, H) {
      const g = countGeom(W, H), L = g.lat, p = M.p;
      const upTo = count.done ? p : count.x;
      const hasChord = count.P && count.Q;
      let S = null, R = null, lam = null;
      if (hasChord) { lam = slope(count.P, count.Q, M.C); S = ecAdd(count.P, count.Q, M.C); R = neg(S, M.C); }
      drawLattice(ctx, L, { upTo, dimAll: false, alpha: hasChord ? 0.72 : 1, infLit: count.done && (!hasChord || S === null) });
      rubric(ctx, 'counted', L.x, L.y - 30, K.inkDim, 'left', `y² = x³ + 7 mod ${p}`);
      // the scan line
      if (!count.done && count.x > 0 && count.x < p) {
        const X = L.sx(count.x - 0.5);
        ctx.strokeStyle = K.azure; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X, L.y); ctx.lineTo(X, L.y + L.S); ctx.stroke();
      }
      // the wrapped chord
      if (hasChord) {
        const pts = lineLattice(count.P, lam, p);
        ctx.save();
        ctx.beginPath(); ctx.rect(L.x, L.y, L.S, L.S); ctx.clip();
        ctx.strokeStyle = 'rgba(125,167,217,0.42)'; ctx.lineWidth = 1;
        ctx.beginPath();
        if (lam === null) {
          ctx.moveTo(L.sx(count.P[0]), L.y); ctx.lineTo(L.sx(count.P[0]), L.y + L.S);
        } else {
          // each lattice point joined to the next along the shortest step of the line
          const [da, db] = torusStep(lam, p);
          for (const [qx, qy] of pts) {
            ctx.moveTo(L.sx(qx), L.sy(qy)); ctx.lineTo(L.sx(qx + da), L.sy(qy + db));
            ctx.moveTo(L.sx(qx - da), L.sy(qy - db)); ctx.lineTo(L.sx(qx), L.sy(qy));
          }
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(125,167,217,0.75)';
        const ds = clamp(L.cell * 0.34, 1.1, 3.2);
        for (const q of pts) ctx.fillRect(L.sx(q[0]) - ds / 2, L.sy(q[1]) - ds / 2, ds, ds);
        ctx.restore();
        // mirror: R to S
        if (S) {
          ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(217,122,104,0.75)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(L.sx(R[0]), L.sy(R[1])); ctx.lineTo(L.sx(S[0]), L.sy(S[1])); ctx.stroke(); ctx.setLineDash([]);
        } else {
          ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(232,200,124,0.6)';
          ctx.beginPath(); ctx.moveTo(L.sx(count.P[0]), L.y); ctx.lineTo(L.inf[0], L.inf[1] + 9); ctx.stroke(); ctx.setLineDash([]);
        }
        const now = nowA();
        const fl = (i) => count.flare.find((f) => f.i === i);
        const pulse = (i) => { const f = fl(i); return f ? clamp(1 - (now - f.t) / 0.6, 0, 1) : 0; };
        const shown = (i) => !!fl(i);
        const same = eqPt(count.P, count.Q);
        if (shown(0)) { square(ctx, L, count.P, K.ink, 1.3); markPt(ctx, L, count.P, K.ink, same ? 'P = Q' : 'P', { r: Math.max(5, L.cell) + 5 * pulse(0) }); }
        if (shown(1) && !same) { square(ctx, L, count.Q, K.ink, 1.3); markPt(ctx, L, count.Q, K.ink, 'Q', { r: Math.max(5, L.cell) + 5 * pulse(1) }); }
        if (S && shown(2)) { markPt(ctx, L, R, K.crimsonBright, same ? '−2P' : '−(P + Q)', { r: Math.max(5, L.cell) + 5 * pulse(2) }); }
        if (S && shown(3)) { square(ctx, L, S, K.goldBright, 1.4); markPt(ctx, L, S, K.goldBright, same ? '2P' : 'P + Q', { glowS: glow.gold }); }
        if (count.flare.length < 4 || count.flare.some((f) => now - f.t < 0.6)) dirty = true;
      } else if (count.P) {
        square(ctx, L, count.P, K.ink, 1.3);
        markPt(ctx, L, count.P, K.ink, 'P');
      }
      drawCountPanel(ctx, g, { lam, S, R }, H);
    }

    function drawCountPanel(ctx, g, { lam, S }, H) {
      const pn = g.pan, x = pn.x, w = pn.w, p = M.p, R = x + w;
      let y = pn.y;
      rubric(ctx, 'the census', x, y, K.verdigris);
      y += 26;
      const aff = M.pts.length;
      if (count.done) {
        runs(ctx, x, y, [[String(aff), mono(15), K.gold], [' points  +  ', sf(15), K.inkDim], ['∞', sf(16), K.goldBright], ['  =  ', sf(15), K.inkDim], [String(M.n), mono(16, 600), K.goldBright]]);
        y += 20;
        txt(ctx, `${M.cols} of the ${p} columns carry points, two apiece`, x, y, it(13.5), K.inkDim);
      } else if (count.x > 0) {
        let shown = 0;
        for (const q of M.pts) { if (q[0] < count.x) shown++; else break; }
        runs(ctx, x, y, [['x = ', it(15), K.inkDim], [String(count.x - 1), mono(14), K.azure], ['   ' + shown + ' points so far', it(14), K.inkDim]]);
        y += 20;
        txt(ctx, 'is x³ + 7 a square mod ' + p + '? two roots, or none', x, y, it(13.5), K.inkFaint);
      } else {
        for (const ln of wrapLines(ctx, `${p} × ${p} residues wait to be counted, column by column.`, w, it(14.5))) { txt(ctx, ln, x, y, it(14.5), K.inkDim); y += 20; }
        txt(ctx, 'As Rosetta counted y² + y = x³ − x².', x, y, it(13.5), K.inkFaint);
      }
      y += 34;
      // Hasse's window
      rubric(ctx, 'Hasse’s window', x, y, K.inkDim, 'left', 'p + 1 ± 2√p');
      y += 36;
      const lo = M.hasse.lo, hi = M.hasse.hi, bx0 = x + 4, bx1 = R - 4;
      const mapX = (v) => bx0 + ((v - (lo - 4)) / (hi + 4 - (lo - 4))) * (bx1 - bx0);
      ctx.strokeStyle = K.azureDim; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mapX(lo), y); ctx.lineTo(mapX(hi), y); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = K.inkFaint;
      for (const v of [lo, p + 1, hi]) { ctx.beginPath(); ctx.moveTo(mapX(v), y - 6); ctx.lineTo(mapX(v), y + 6); ctx.stroke(); }
      txt(ctx, lo.toFixed(1), mapX(lo), y + 18, mono(10), K.inkFaint, 'center');
      txt(ctx, String(p + 1), mapX(p + 1), y + 18, mono(10), K.inkFaint, 'center');
      txt(ctx, hi.toFixed(1), mapX(hi), y + 18, mono(10), K.inkFaint, 'center');
      if (count.done) {
        const X = mapX(M.n);
        glow.gold.draw(ctx, X, y, 0.42);
        dot(ctx, X, y, 3.6, K.goldBright);
        ctx.font = mono(11);
        const lw2 = ctx.measureText('#E = ' + M.n).width;
        txt(ctx, '#E = ' + M.n, clamp(X - lw2 / 2, bx0 - 4, bx1 - lw2), y - 11, mono(11), K.goldBright);
      }
      y += 42;
      if (M.trap && count.done) {
        ctx.fillStyle = 'rgba(192,91,77,0.1)'; ctx.fillRect(x - 8, y - 16, w + 8, 64);
        ctx.fillStyle = K.crimson; ctx.fillRect(x - 8, y - 16, 2, 64);
        txt(ctx, `A trap: #E = ${M.n} = p, so the trace is 1.`, x, y, sf(14, 600), K.crimsonBright);
        y += 19;
        for (const ln of wrapLines(ctx, 'This lock is a clock in disguise: Smart (1999) moves its logarithm into the integers mod p, where it is easy.', w - 4, it(13))) { txt(ctx, ln, x, y, it(13), K.inkDim); y += 17; }
        y += 18;
      }
      // the chord mod p
      if (count.P && count.Q) {
        const A = count.P, B = count.Q, same = eqPt(A, B);
        rubric(ctx, same ? 'the tangent' : 'the chord', x, y, K.verdigris, 'left', 'mod ' + p);
        y += 24;
        if (lam === null) {
          runs(ctx, x, y, [['x₁ = x₂ and y₁ = −y₂: vertical', it(14.5), K.inkDim]]); y += 22;
          runs(ctx, x, y, [['P + Q = ∞', it(16), K.goldBright]]);
          return;
        }
        const num = same ? mod(3 * A[0] * A[0], p) : mod(B[1] - A[1], p);
        const den = same ? mod(2 * A[1], p) : mod(B[0] - A[0], p);
        const e = invMod(den, p);
        runs(ctx, x, y, [['λ', it(16), K.azure], [' = ', sf(15), K.inkDim], [String(num), mono(13), K.ink], [' · ', sf(15), K.inkDim], [String(den), mono(13), K.ink], ['⁻¹', sf(13), K.ink], [same ? '   (3x₁² · (2y₁)⁻¹)' : '   (Δy · Δx⁻¹)', it(13), K.inkFaint]]);
        y += 22;
        txt(ctx, `Euclid finds ${den}⁻¹ mod ${p}:`, x, y, it(13.5), K.inkDim);
        y += 18;
        const cols = g.narrow && e.steps.length > 3 ? 2 : 1;
        const perCol = Math.ceil(e.steps.length / cols);
        const maxRows = Math.max(3, Math.floor((H - y - 70) / 16));
        const shownRows = Math.min(perCol, maxRows);
        e.steps.forEach(([r0, q, r1, r], i) => {
          const col = Math.floor(i / perCol), row = i % perCol;
          if (row >= shownRows) return;
          txt(ctx, `${r0} = ${q} · ${r1} + ${r}`, x + 12 + col * (w / 2), y + row * 16, mono(g.narrow ? 11 : 12), K.inkFaint);
        });
        y += shownRows * 16;
        if (shownRows < perCol) { txt(ctx, '⋮', x + 12, y, mono(12), K.inkFaint); y += 16; }
        runs(ctx, x + 12, y, [[`${den}⁻¹ ≡ ${e.inv}`, mono(12.5), K.azure], [`   so  λ = ${lam}`, mono(12.5), K.azure]]);
        y += 24;
        // Three meetings, counted as Poincaré counted them: a point of tangency counts twice.
        const nHits = lineHits(A, B, M.C).hits.length;
        const meets = same ? 'the tangent touches at P and meets the curve once more'
          : nHits === 3 ? 'the line meets the curve at exactly three points'
            : 'the line is tangent at one of them, which counts twice';
        for (const ln of wrapLines(ctx, meets, w, it(13.5))) { txt(ctx, ln, x, y, it(13.5), K.inkDim); y += 19; }
        y += 3;
        runs(ctx, x, y, [[same ? '2P' : 'P + Q', it(16), K.goldBright], [' = ', sf(15), K.inkDim], [fp(S), mono(14), K.goldBright], ['   mirror of ', it(13.5), K.inkFaint], [fp(neg(S, M.C)), mono(12.5), K.crimsonBright]]);
      } else if (count.done) {
        rubric(ctx, 'the chord', x, y, K.verdigris, 'left', 'mod ' + p);
        y += 24;
        for (const ln of wrapLines(ctx, 'Tap any two gold points (or use the buttons). The chord becomes a family of parallel strands wrapped on the grid, and exactly three of its lattice points lie on the curve, a point of tangency counting twice.', w, it(14))) { txt(ctx, ln, x, y, it(14), K.inkDim); y += 19; }
      }
    }

    /* =====================================================================
       iii · the walk, and double-and-add
       ===================================================================== */
    function sideGeom(W, H) {
      const narrow = W < 720;
      if (narrow) {
        const S = Math.round(W - 58);
        return { narrow, lat: lattice(40, 52, S), pan: { x: 16, y: 52 + S + 32, w: W - 32, h: H - (52 + S + 32) - 12 } };
      }
      const S = Math.round(Math.min(H - 92, W * 0.5));
      return { narrow, lat: lattice(46, 54, S), pan: { x: 46 + S + 50, y: 50, w: W - (46 + S + 50) - 20, h: H - 70 } };
    }
    function walkDt(i) { return Math.max(0.085, 0.3 * Math.pow(0.955, i)); }
    function startWalk() {
      walk.k = 0; walk.trail = []; walk.da = null; walk.daIdx = -1; walk.running = true;
      walkBtn.textContent = '▶ walk again';
      const n = M.n, evs = [];
      for (let k = 1; k <= n; k++) {
        const A = M.mult[k];
        evs.push({
          dt: walkDt(k),
          sound: (t) => note(A, t, { level: 0.19, dur: 0.2 }),
          apply: (t) => { walk.k = k; walk.trail.push(k); walk.hopT0 = t || nowA(); walk.hopT1 = walk.hopT0 + Math.min(0.2, walkDt(k + 1) * 0.9); dirty = true; },
        });
      }
      runSeq(evs, () => { walk.running = false; if (!done.walk) { done.walk = true; } updateQuest(); updateReadout(); });
      updateReadout();
    }
    function startDoubleAdd() {
      walk.running = false;
      walk.da = mulTrace(daK, M.G, M.C);
      walk.daIdx = -1;
      walk.k = 0; walk.trail = [];
      const ch = walk.da.chain, evs = [];
      ch.forEach((c, i) => evs.push({
        dt: i === 0 ? 0 : 0.36,
        sound: (t) => {
          if (i > 0) {
            if (c.op === 'D') audio.drums.thock(bus, t, { level: 0.34 });
            else audio.drums.rim(bus, t, { level: 0.3 });
          }
          note(c.R, t + 0.05, { level: 0.15, dur: 0.18 });
        },
        apply: (t) => { walk.daIdx = i; walk.daT0 = t || nowA(); walk.daT1 = walk.daT0 + 0.24; dirty = true; },
      }));
      runSeq(evs, () => { updateReadout(); });
      updateReadout();
    }

    function drawWalk(ctx, W, H) {
      const g = sideGeom(W, H), L = g.lat, n = M.n, now = nowA();
      const home = walk.k >= n;
      drawLattice(ctx, L, { dimAll: true, infLit: home && !walk.da });
      rubric(ctx, walk.da ? 'double-and-add' : 'the walk', L.x, L.y - 30, K.inkDim, 'left', walk.da ? `${daK}G` : 'G, 2G, 3G …');
      if (walk.da) {
        const ch = walk.da.chain;
        for (let i = 1; i <= walk.daIdx; i++) hop(ctx, L, ch[i - 1].R, ch[i].R, ch[i].op === 'D' ? 'rgba(201,169,89,0.8)' : 'rgba(125,167,217,0.85)', 1.4);
        for (let i = 0; i <= walk.daIdx; i++) square(ctx, L, ch[i].R, ch[i].op === 'D' ? K.goldBright : K.azure, 1.3);
        if (walk.daIdx >= 0) {
          const i = walk.daIdx, u = (now - walk.daT0) / (walk.daT1 - walk.daT0);
          const [hx, hy] = i === 0 ? [L.sx(ch[0].R[0]), L.sy(ch[0].R[1])] : headAt(L, ch[i - 1].R, ch[i].R, u);
          glow.gold.draw(ctx, hx, hy, 0.9); dot(ctx, hx, hy, 3.4, K.goldBright);
          if (u < 1) dirty = true;
          const last = ch[i];
          txt(ctx, `${last.m}G`, hx + 9, hy - 8, it(13.5), K.goldBright);
        }
        markPt(ctx, L, M.G, K.verdigris, 'G', { r: Math.max(5, L.cell) + 2 });
      } else {
        // visited points, bright
        const vis = walk.trail;
        for (const k of vis) if (k < n) square(ctx, L, M.mult[k], K.gold, 1.15);
        // trail
        const TR = 14;
        for (let j = Math.max(1, vis.length - TR); j < vis.length; j++) {
          const age = vis.length - 1 - j, a = 0.85 * (1 - age / TR);
          const A = M.mult[vis[j - 1]], B = M.mult[vis[j]];
          if (B === null) {
            ctx.setLineDash([2, 3]);
            ctx.strokeStyle = `rgba(232,200,124,${a})`;
            ctx.beginPath(); ctx.moveTo(L.sx(A[0]), L.sy(A[1])); ctx.lineTo(L.inf[0], L.inf[1] + 9); ctx.stroke(); ctx.setLineDash([]);
          } else hop(ctx, L, A, B, `rgba(232,200,124,${a})`, 1.2);
        }
        markPt(ctx, L, M.G, K.verdigris, 'G', { r: Math.max(5, L.cell) + 2 });
        if (walk.k > 0 && walk.k < n) {
          const u = (now - walk.hopT0) / Math.max(0.01, walk.hopT1 - walk.hopT0);
          const [hx, hy] = headAt(L, M.mult[walk.k - 1], M.mult[walk.k], u);
          glow.gold.draw(ctx, hx, hy, 1); dot(ctx, hx, hy, 3.6, K.goldBright);
          txt(ctx, `${walk.k}G`, hx + 9, hy - 8, it(13.5), K.goldBright);
          if (u < 1) dirty = true;
        }
        if (home) txt(ctx, `${n}G = ∞`, L.inf[0] - 16, L.inf[1] + 4, it(13.5), K.goldBright, 'right');
      }
      drawWalkPanel(ctx, g, H);
    }

    function drawWalkPanel(ctx, g, H) {
      const pn = g.pan, x = pn.x, w = pn.w, n = M.n;
      let y = pn.y;
      // the fifths inset: the same algebra, legible
      const r = g.narrow ? Math.min(52, w * 0.16) : Math.min(66, w * 0.2);
      const cx = x + r + 10, cy = y + r + 14;
      rubric(ctx, 'two orbits, one algebra', x, y, K.verdigris);
      const step = walk.da ? 0 : walk.k;
      const f = step % 12;
      ctx.strokeStyle = K.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      const pc = (i) => { const a = (((7 * i) % 12) / 12) * Math.PI * 2 - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
      const edges = step >= 12 ? 12 : step;
      ctx.strokeStyle = 'rgba(125,167,217,0.8)'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i <= edges; i++) { const [a, b] = pc(i); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }
      ctx.stroke();
      for (let i = 0; i < 12; i++) { const [a, b] = pc(i); dot(ctx, a, b, 2, K.inkDim); }
      if (step > 0) { const [a, b] = pc(f); dot(ctx, a, b, 4, K.azure); }
      const tx = cx + r + 22, tw = x + w - tx;
      let ty = y + 30;
      runs(ctx, tx, ty, [['k ↦ 7k mod 12', it(15), K.azure]]); ty += 19;
      for (const ln of wrapLines(ctx, 'the circle of fifths: home after 12 steps, in a visible star', tw, it(13))) { txt(ctx, ln, tx, ty, it(13), K.inkDim); ty += 17; }
      ty += 8;
      runs(ctx, tx, ty, [['k ↦ kG', it(15), K.gold]]); ty += 19;
      for (const ln of wrapLines(ctx, `the curve: home after ${n} steps, in no visible order`, tw, it(13))) { txt(ctx, ln, tx, ty, it(13), K.inkDim); ty += 17; }
      y = Math.max(cy + r + 30, ty + 16);
      // status
      if (!walk.da) {
        if (walk.k === 0) txt(ctx, 'Press walk: one addition of G per note.', x, y, it(14), K.inkDim);
        else if (walk.k < n) runs(ctx, x, y, [[`${walk.k}G`, it(15), K.goldBright], [' = ', sf(14), K.inkDim], [fp(M.mult[walk.k]), mono(13.5), K.goldBright], [`   ${walk.k} of ${n}`, it(13.5), K.inkFaint]]);
        else if (g.narrow) { runs(ctx, x, y, [[`${n}G = ∞`, it(15), K.goldBright]]); y += 19; txt(ctx, 'every point visited once; then silence', x, y, it(13.5), K.inkDim); }
        else runs(ctx, x, y, [[`${n}G = ∞`, it(15), K.goldBright], ['   every point visited once; then silence', it(13.5), K.inkDim]]);
        y += 30;
      }
      // double-and-add
      rubric(ctx, 'the shortcut: double-and-add', x, y, K.verdigris);
      y += 26;
      const tr = walk.da || mulTrace(daK, M.G, M.C);
      const bits = tr.bits;
      runs(ctx, x, y, [[`k = ${daK} = `, it(15), K.inkDim], [bits, mono(14), K.ink], ['₂', sf(13), K.inkDim]]);
      y += 24;
      // op glyphs under each bit
      const cellW = g.narrow ? 30 : 34;
      let ci = 0, lx = x;
      for (let b = 0; b < bits.length; b++) {
        const ops = b === 0 ? 'load' : bits[b] === '1' ? 'D A' : 'D';
        const n1 = b === 0 ? 1 : ops.length === 3 ? 2 : 1;
        const lit = walk.da && walk.daIdx >= ci;
        txt(ctx, bits[b], lx + cellW / 2, y, mono(13), lit ? K.goldBright : K.inkDim, 'center');
        txt(ctx, ops, lx + cellW / 2, y + 16, b === 0 ? it(11) : mono(11), lit ? (ops.includes('A') && b ? K.azure : K.gold) : K.inkFaint, 'center');
        ci += n1; lx += cellW;
        if (lx + cellW > x + w && b < bits.length - 1) { lx = x; y += 38; }
      }
      y += 42;
      // the chain of multiples
      const chainTxt = tr.chain.map((c) => String(c.m));
      let cx2 = x;
      ctx.font = mono(12.5);
      for (let i = 0; i < chainTxt.length; i++) {
        const lit = walk.da && walk.daIdx >= i;
        const s = (i ? (tr.chain[i].op === 'D' ? ' ×2→ ' : ' +1→ ') : '') + chainTxt[i];
        const wdt = ctx.measureText(s).width;
        if (cx2 + wdt > x + w) { cx2 = x; y += 18; }
        if (i) {
          const arrow = tr.chain[i].op === 'D' ? ' ×2→ ' : ' +1→ ';
          txt(ctx, arrow, cx2, y, mono(11), K.inkFaint);
          ctx.font = mono(11);
          cx2 += ctx.measureText(arrow).width;
        }
        txt(ctx, chainTxt[i], cx2, y, mono(12.5), lit ? (tr.chain[i].op === 'D' || i === 0 ? K.goldBright : K.azure) : K.inkDim);
        ctx.font = mono(12.5);
        cx2 += ctx.measureText(chainTxt[i]).width;
      }
      y += 26;
      const nD = (tr.ops.match(/D/g) || []).length, nA = (tr.ops.match(/A/g) || []).length - 1;
      const opsTxt = `${nD} doublings + ${nA} additions = ${nD + nA} operations`, slowTxt = `one G at a time: ${daK - 1}`;
      ctx.font = it(14);
      if (ctx.measureText(opsTxt + '   ' + slowTxt).width <= w) runs(ctx, x, y, [[opsTxt, it(14), K.ink], ['   ' + slowTxt, it(14), K.inkFaint]]);
      else { txt(ctx, opsTxt, x, y, it(14), K.ink); y += 19; txt(ctx, slowTxt, x, y, it(14), K.inkFaint); }
      y += 20;
      for (const ln of wrapLines(ctx, 'At 256 bits: at most 510 operations. Walking: up to 2²⁵⁶.', w, it(13))) {
        if (y + 4 > H) break;
        txt(ctx, ln, x, y, it(13), K.inkFaint); y += 17;
      }
    }

    /* =====================================================================
       iv · the handshake
       ===================================================================== */
    function shakeGeom(W, H) {
      const narrow = W < 720;
      if (narrow) {
        // phones: the two cards hang straight from the wire, the lattice sits beneath them
        const cw = Math.floor((W - 36) / 2), ch = 218, cy = 68;
        const S = Math.round(W - 76), ly = cy + ch + 42;
        const lat = lattice(Math.round((W - S) / 2) + 6, ly, S);
        return { narrow, lat, wireY: 36, A: { x: 12, y: cy, w: cw, h: ch }, B: { x: 24 + cw, y: cy, w: cw, h: ch }, eve: { x: 16, y: ly + S + 30, w: W - 32 } };
      }
      const S = Math.round(Math.min(H - 150, W * 0.42));
      const lat = lattice(Math.round((W - S) / 2), 84, S);
      const cw = Math.min(250, Math.round((W - S) / 2 - 44));
      return {
        narrow, lat, wireY: 42,
        A: { x: 20, y: 84, w: cw, h: Math.min(S, 262) }, B: { x: W - 20 - cw, y: 84, w: cw, h: Math.min(S, 262) },
        eve: { x: 20, y: 84 + S + 34, w: W - 40 },
      };
    }
    function shakeCalc() {
      const C = M.C, G = M.G;
      const tA = mulTrace(secA, G, C), tB = mulTrace(secB, G, C);
      const A = tA.R, B = tB.R;
      const Aheard = mishear ? ecAdd(A, G, C) : A;
      const tA2 = mulTrace(secA, B, C), tB2 = mulTrace(secB, Aheard, C);
      return { A, B, Aheard, tA, tB, tA2, tB2, SA: tA2.R, SB: tB2.R, agree: eqPt(tA2.R, tB2.R) };
    }
    function startShake() {
      if (view !== 'shake') setView('shake');
      const c = shakeCalc();
      shake.res = c;
      Object.assign(shake, { phase: 'keys', iA: -1, iB: -1, jA: -1, jB: -1, heard: false });
      const dt = 0.28, evs = [];
      const n1 = Math.max(c.tA.chain.length, c.tB.chain.length);
      for (let i = 0; i < n1; i++) {
        evs.push({
          dt: i ? dt : 0,
          sound: (t) => {
            if (i < c.tA.chain.length) note(c.tA.chain[i].R, t, { pan: -0.75, level: 0.14, dur: 0.2 });
            if (i < c.tB.chain.length) note(c.tB.chain[i].R, t + 0.02, { pan: 0.75, level: 0.14, dur: 0.2 });
          },
          apply: (t) => { shake.iA = Math.min(i, c.tA.chain.length - 1); shake.iB = Math.min(i, c.tB.chain.length - 1); shake.t0 = t || nowA(); shake.t1 = shake.t0 + 0.2; dirty = true; },
        });
      }
      evs.push({ dt: 0.5, apply: (t) => { shake.phase = 'wire'; shake.wireT0 = t || nowA(); shake.wireT1 = shake.wireT0 + 1.3; dirty = true; } });
      evs.push({
        dt: 1.3,
        sound: (t) => { note(c.B, t, { pan: -0.75, level: 0.15 }); note(c.Aheard, t + 0.03, { pan: 0.75, level: 0.15 }); },
        apply: () => { shake.heard = true; shake.phase = 'shared'; dirty = true; },
      });
      const n2 = Math.max(c.tA2.chain.length, c.tB2.chain.length);
      for (let i = 0; i < n2; i++) {
        evs.push({
          dt: i ? dt : 0.45,
          sound: (t) => {
            if (i < c.tA2.chain.length) note(c.tA2.chain[i].R, t, { pan: -0.75, level: 0.14, dur: 0.2 });
            if (i < c.tB2.chain.length) note(c.tB2.chain[i].R, t + 0.02, { pan: 0.75, level: 0.14, dur: 0.2 });
          },
          apply: (t) => { shake.jA = Math.min(i, c.tA2.chain.length - 1); shake.jB = Math.min(i, c.tB2.chain.length - 1); shake.t0 = t || nowA(); shake.t1 = shake.t0 + 0.2; dirty = true; },
        });
      }
      evs.push({
        dt: 0.5,
        // Alice's key hard left, Bob's hard right: a clean unison when they agree.
        sound: (t) => { note(c.SA, t, { pan: -0.85, level: 0.2, dur: 1.7 }); note(c.SB, t, { pan: 0.85, level: 0.2, dur: 1.7 }); },
        apply: (t) => { shake.phase = 'done'; shake.t0 = t || nowA(); dirty = true; if (c.agree && !mishear) done.shake = true; updateQuest(); updateReadout(); },
      });
      runSeq(evs);
      updateReadout();
    }

    function drawCard(ctx, r, who, color, rowsC) {
      ctx.fillStyle = 'rgba(22,25,37,0.72)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = K.line; ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.fillStyle = color; ctx.fillRect(r.x, r.y, r.w, 2);
      rubric(ctx, who, r.x + 12, r.y + 22, color);
      let y = r.y + 50;
      const small = r.w < 180;
      for (const row of rowsC) {
        if (!row) continue;
        if (y + 30 > r.y + r.h) break;
        txt(ctx, row[0], r.x + 12, y, it(small ? 12 : 13), K.inkFaint);
        y += small ? 17 : 19;
        txt(ctx, row[1], r.x + 12, y, row[3] || mono(small ? 12.5 : 14), row[2]);
        y += small ? 22 : 28;
      }
    }
    function drawShake(ctx, W, H) {
      const g = shakeGeom(W, H), L = g.lat, now = nowA();
      const c = shake.res || shakeCalc();
      const ph = shake.phase;
      const S = c.SA;
      // ∞ appears only when a misheard point lands there (Alice's secret n − 1, so A + G = ∞)
      const infShown = shake.heard && (c.Aheard === null || c.SB === null);
      drawLattice(ctx, L, { dimAll: true, showInf: infShown, infLit: infShown });
      // the public wire
      const ax = g.A.x + g.A.w / 2, bx = g.B.x + g.B.w / 2, wy = g.wireY;
      ctx.strokeStyle = K.verdigrisDim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, wy); ctx.lineTo(bx, wy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, wy); ctx.lineTo(ax, g.A.y); ctx.moveTo(bx, wy); ctx.lineTo(bx, g.B.y); ctx.stroke();
      rubric(ctx, 'the public wire', (ax + bx) / 2, wy - 12, K.verdigris, 'center');
      const ex = (ax + bx) / 2;
      ring(ctx, ex, wy, 4, K.crimsonBright, 1.2);
      txt(ctx, 'Eve copies everything', ex, wy + 17, it(12), K.crimsonBright, 'center');
      if (ph === 'wire') {
        const u = clamp((now - shake.wireT0) / (shake.wireT1 - shake.wireT0), 0, 1);
        const pa = lerp(ax, bx, ease(u)), pb = lerp(bx, ax, ease(u));
        // the tokens' letters step aside while they pass under the rubric
        const clear = (px) => Math.abs(px - ex) > 78;
        glow.azure.draw(ctx, pa, wy, 0.8); dot(ctx, pa, wy, 3.5, K.azure);
        if (clear(pa)) txt(ctx, 'A', pa, wy - 8, it(13), K.azure, 'center');
        glow.verdant.draw(ctx, pb, wy, 0.8); dot(ctx, pb, wy, 3.5, K.verdant);
        if (clear(pb)) txt(ctx, 'B', pb, wy - 8, it(13), K.verdant, 'center');
        if (Math.abs(pa - ex) < 30) glow.crimson.draw(ctx, ex, wy, 0.9);
        dirty = true;
      }
      // paths on the lattice
      const chainDraw = (chain, idx, color, start) => {
        if (idx < 0) return;
        for (let i = 1; i <= idx; i++) hop(ctx, L, chain[i - 1].R, chain[i].R, color, 1.25);
        const u = (now - shake.t0) / Math.max(0.01, shake.t1 - shake.t0);
        // A misheard A′ can be ∞ itself (when a = n − 1, A + G = ∞): then every multiple is ∞ too.
        const at = (A) => (A === null ? [L.inf[0], L.inf[1]] : [L.sx(A[0]), L.sy(A[1])]);
        const [hx, hy] = idx === 0 ? at(start) : headAt(L, chain[idx - 1].R, chain[idx].R, u);
        dot(ctx, hx, hy, 3.2, color);
        if (u < 1) dirty = true;
      };
      const phase1 = ph === 'keys' || ph === 'wire' || ph === 'shared' || ph === 'done';
      if (phase1) {
        const fade = ph === 'keys' ? 1 : ph === 'wire' ? 0.4 : 0.14;
        ctx.globalAlpha = fade;
        chainDraw(c.tA.chain, ph === 'keys' ? shake.iA : c.tA.chain.length - 1, 'rgba(125,167,217,0.85)', M.G);
        chainDraw(c.tB.chain, ph === 'keys' ? shake.iB : c.tB.chain.length - 1, 'rgba(127,174,122,0.85)', M.G);
        ctx.globalAlpha = 1;
      }
      if (ph === 'shared' || ph === 'done') {
        chainDraw(c.tA2.chain, ph === 'done' ? c.tA2.chain.length - 1 : shake.jA, 'rgba(125,167,217,0.95)', c.B);
        chainDraw(c.tB2.chain, ph === 'done' ? c.tB2.chain.length - 1 : shake.jB, 'rgba(127,174,122,0.95)', c.Aheard);
      }
      markPt(ctx, L, M.G, K.verdigris, 'G', { r: Math.max(5, L.cell) + 2 });
      const keysOut = ph !== 'idle' && (ph !== 'keys' || shake.iA >= c.tA.chain.length - 1);
      const keysOutB = ph !== 'idle' && (ph !== 'keys' || shake.iB >= c.tB.chain.length - 1);
      if (keysOut) markPt(ctx, L, c.A, K.azure, 'A', { r: Math.max(5, L.cell) + 2 });
      if (keysOutB) markPt(ctx, L, c.B, K.verdant, 'B', { r: Math.max(5, L.cell) + 2 });
      if (mishear && shake.heard) markPt(ctx, L, c.Aheard, K.crimsonBright, 'A′', { r: Math.max(5, L.cell) + 2 });
      if (ph === 'done') {
        const pulse = clamp(1 - (now - shake.t0) / 1.2, 0, 1);
        if (c.agree) {
          glow.gold.draw(ctx, L.sx(S[0]), L.sy(S[1]), 1.3 + pulse);
          square(ctx, L, S, K.goldBright, 1.6);
          markPt(ctx, L, S, K.goldBright, 'S', { r: Math.max(6, L.cell) + 4 + 6 * pulse });
        } else {
          markPt(ctx, L, c.SA, K.azure, 'Alice’s S', { r: Math.max(6, L.cell) + 3 });
          markPt(ctx, L, c.SB, K.crimsonBright, 'Bob’s S', { r: Math.max(6, L.cell) + 3 });
        }
        if (pulse > 0) dirty = true;
      }
      rubric(ctx, `${M.n} points`, L.x, L.y - 10, K.inkFaint, 'left', `mod ${M.p}`);
      // cards
      const sm = g.narrow;
      const secretFont = mono(sm ? 17 : 22, 600);
      drawCard(ctx, g.A, 'Alice', K.azure, [
        ['secret, never sent', `a = ${secA}`, K.azure, secretFont],
        keysOut ? ['sends A = aG', fp(c.A), K.azure] : null,
        shake.heard ? ['hears B', fp(c.B), K.verdant] : null,
        ph === 'done' ? ['computes a·B', fp(c.SA), c.agree ? K.goldBright : K.azure] : null,
      ]);
      drawCard(ctx, g.B, 'Bob', K.verdant, [
        ['secret, never sent', `b = ${secB}`, K.verdant, secretFont],
        keysOutB ? ['sends B = bG', fp(c.B), K.verdant] : null,
        shake.heard ? [mishear ? 'hears A (misheard)' : 'hears A', fp(c.Aheard), mishear ? K.crimsonBright : K.azure] : null,
        ph === 'done' ? [mishear ? 'computes b·A′' : 'computes b·A', fp(c.SB), c.agree ? K.goldBright : K.crimsonBright] : null,
      ]);
      // Eve's ledger
      const e = g.eve;
      let y = e.y;
      rubric(ctx, 'Eve', e.x, y, K.crimsonBright);
      // Keep each "X = (x, y)" whole when the ledger wraps on a phone.
      const item = (nm, P) => `${nm} = ${fp(P)}`.replace(/ /g, ' ');
      const heard = ph === 'idle' ? 'nothing yet' : item('G', M.G) + (keysOut ? ',  ' + item('A', c.A) : '') + (keysOutB ? ',  ' + item('B', c.B) : '');
      ctx.font = mono(sm ? 11.5 : 12.5);
      const heardLines = wrapLines(ctx, 'has copied ' + heard, e.w - 44, mono(sm ? 11.5 : 12.5));
      for (const ln of heardLines) { txt(ctx, ln, e.x + 44, y, mono(sm ? 11.5 : 12.5), K.inkDim); y += 17; }
      y += 4;
      if (ph === 'done') {
        const ab = (secA * secB) % M.n;
        const line = c.agree
          ? `a·b = ${secA}·${secB} = ${secA * secB} ≡ ${ab} (mod ${M.n}), so both hold S = ${ab}G = ${fp(S)}. Eve has no a and no b.`
          : `Bob multiplied the wrong point: b·A′ = ${fp(c.SB)} ≠ ${fp(c.SA)}. No agreement; the two tones clash.`;
        for (const ln of wrapLines(ctx, line, e.w, it(sm ? 13 : 14))) { txt(ctx, ln, e.x, y + 4, it(sm ? 13 : 14), c.agree ? K.goldBright : K.crimsonBright); y += 19; }
      } else if (ph === 'idle') {
        for (const ln of wrapLines(ctx, 'Press shake hands. Only public points will cross the wire.', e.w, it(sm ? 13 : 14))) { txt(ctx, ln, e.x, y + 4, it(sm ? 13 : 14), K.inkDim); y += 19; }
      }
    }

    /* =====================================================================
       v · Eve
       ===================================================================== */
    function eveCalc() {
      const A = scalarMul(secA, M.G, M.C);
      return { A, rho: pollardRho(M.G, A, M.n, M.C, 1, 0) };
    }
    function startRho() {
      if (view !== 'eve') setView('eve');
      const { A, rho } = eveCalc();
      eve.mode = 'rho'; eve.rho = rho; eve.iter = 0; eve.solved = false; eve.A = A;
      const evs = [{ dt: 0, sound: (t) => note(rho.seq[0].R, t, { level: 0.15 }), apply: () => { eve.iter = 0; dirty = true; } }];
      const f = (s) => rhoStep(s, M.G, A, M.n, M.C);
      let T = rho.seq[0], Hh = rho.seq[0];
      for (let i = 1; i <= rho.floydIters; i++) {
        T = f(T); Hh = f(f(Hh));
        const tR = T.R, hR = Hh.R;
        evs.push({
          dt: i === 1 ? 0.5 : 0.46,
          sound: (t) => { note(tR, t, { pan: -0.45, level: 0.15, dur: 0.2 }); note(hR, t + 0.12, { pan: 0.45, level: 0.15, dur: 0.2 }); },
          apply: (t) => { eve.iter = i; eve.t0 = t || nowA(); dirty = true; },
        });
      }
      evs.push({
        dt: 0.6,
        apply: () => { eve.solved = true; eve.lastWork = { bits: Math.log2(M.n), ops: 3 * rho.floydIters, unit: 'additions' }; done.eve = true; updateQuest(); updateReadout(); dirty = true; },
      });
      runSeq(evs);
      updateReadout();
    }
    function startEveWalk() {
      if (view !== 'eve') setView('eve');
      const A = scalarMul(secA, M.G, M.C);
      eve.mode = 'walk'; eve.walkK = 0; eve.walkDone = false; eve.A = A;
      const dt = clamp(3.4 / secA, 0.03, 0.14), every = Math.max(1, Math.ceil(0.06 / dt)), evs = [];
      for (let k = 1; k <= secA; k++) {
        evs.push({
          dt,
          sound: k % every === 0 || k === secA ? (t) => note(M.mult[k], t, { level: 0.12, dur: 0.12 }) : null,
          apply: () => { eve.walkK = k; dirty = true; },
        });
      }
      evs.push({ dt: 0.3, apply: () => { eve.walkDone = true; eve.lastWork = { bits: Math.log2(M.n), ops: secA, unit: 'steps' }; updateReadout(); dirty = true; } });
      runSeq(evs);
      updateReadout();
    }
    function startClock() {
      if (view !== 'eve') setView('eve');
      const n = M.n, g0 = 7 % n, Aclk = clockDH(secA, g0, n), br = clockBreak(Aclk, g0, n);
      eve.mode = 'clock'; eve.clockRows = -1; eve.clockDone = false; eve.clockHop = 0;
      eve.clock = { n, g: g0, A: Aclk, br };
      // Alice publishes on the clock: a hops of g, each pitched by where it lands.
      const hopDt = clamp(2.2 / secA, 0.03, 0.13), every = Math.max(1, Math.ceil(0.05 / hopDt)), evs = [];
      for (let k = 1; k <= secA; k++) {
        const pos = (k * g0) % n;
        evs.push({
          dt: k === 1 ? 0 : hopDt,
          sound: k % every === 0 || k === secA ? (t) => audio.drums.wood(bus, t, { level: 0.22, pitch: 220 * Math.pow(2, (2 * pos) / n) }) : null,
          apply: () => { eve.clockHop = k; dirty = true; },
        });
      }
      evs.push({ dt: 0.5, apply: () => { eve.clockRows = 0; dirty = true; } });
      // Eve divides: one row of Euclid per beat.
      br.steps.forEach((st, i) => evs.push({
        dt: 0.55,
        sound: (t) => audio.drums.wood(bus, t, { level: 0.3, pitch: 220 * Math.pow(2, (2 * st[3]) / n) }),
        apply: () => { eve.clockRows = i + 1; dirty = true; },
      }));
      evs.push({
        dt: 0.6,
        sound: (t) => audio.playTone(bus, { freq: 220 * Math.pow(2, (2 * Aclk) / n), dur: 0.5, level: 0.2, type: 'triangle', when: t }),
        apply: () => { eve.clockDone = true; eve.lastWork = { bits: Math.log2(n), ops: br.steps.length, unit: 'divisions, on the clock' }; updateReadout(); dirty = true; },
      });
      runSeq(evs);
      updateReadout();
    }

    function eveGeom(W, H) {
      const narrow = W < 720;
      if (narrow) {
        const S = Math.round(W * 0.72);
        const y2 = 52 + S + 28;
        return { narrow, lat: lattice(Math.round((W - S) / 2) + 8, 52, S), rho: { x: 16, y: y2, w: W - 32, h: 226 }, chart: { x: 44, y: y2 + 256, w: W - 64, h: Math.max(110, H - (y2 + 256) - 40) } };
      }
      const S = Math.round(Math.min(H - 92, W * 0.46));
      const rx = 46 + S + 50, rw = W - rx - 24;
      return { narrow, lat: lattice(46, 54, S), rho: { x: rx, y: 44, w: rw, h: 250 }, chart: { x: rx + 30, y: 330, w: rw - 30, h: H - 330 - 44 } };
    }
    function drawEve(ctx, W, H) {
      const g = eveGeom(W, H), L = g.lat, now = nowA();
      const A = scalarMul(secA, M.G, M.C);
      if (eve.mode === 'clock' && eve.clock) drawClock(ctx, g);
      else {
        drawLattice(ctx, L, { dimAll: true, showInf: false });
        rubric(ctx, eve.mode === 'walk' ? 'Eve walks' : 'Eve’s rho', L.x, L.y - 30, K.crimsonBright, 'left', eve.mode === 'walk' ? 'G, 2G, 3G … until A' : 'a walk that must repeat');
        if (eve.mode === 'walk' && eve.walkK > 0) {
          for (let k = 2; k <= eve.walkK; k++) hop(ctx, L, M.mult[k - 1], M.mult[k], `rgba(192,91,77,${k > eve.walkK - 12 ? 0.8 : 0.25})`, 1.1);
          const hp = M.mult[eve.walkK];
          dot(ctx, L.sx(hp[0]), L.sy(hp[1]), 3.2, K.crimsonBright);
        }
        if (eve.mode === 'rho' && eve.rho) {
          const r = eve.rho, top = r.tail + r.cycle;
          const reach = Math.min(top, 2 * Math.max(0, eve.iter) + 1);
          for (let j = 1; j < reach; j++) {
            const inTail = j <= r.tail;
            hop(ctx, L, r.seq[j - 1].R, r.seq[j].R, inTail ? 'rgba(217,122,104,0.75)' : 'rgba(192,91,77,0.95)', inTail ? 1.1 : 1.4, inTail ? [2, 3] : null);
          }
          if (reach >= top) hop(ctx, L, r.seq[top - 1].R, r.seq[r.tail].R, 'rgba(192,91,77,0.95)', 1.4);
          for (let j = 0; j < reach; j++) square(ctx, L, r.seq[j].R, j < r.tail ? K.crimsonBright : K.crimson, 1.25);
          if (eve.iter >= 0) {
            const Tp = r.seq[rhoIndex(eve.iter, r.tail, r.cycle)].R, Hp = r.seq[rhoIndex(2 * eve.iter, r.tail, r.cycle)].R;
            if (Tp) ring(ctx, L.sx(Tp[0]), L.sy(Tp[1]), Math.max(6, L.cell) + 3, K.ink, 1.3);
            if (Hp) { dot(ctx, L.sx(Hp[0]), L.sy(Hp[1]), 3.6, K.crimsonBright); }
          }
        }
        markPt(ctx, L, M.G, K.verdigris, 'G', { r: Math.max(5, L.cell) + 2 });
        markPt(ctx, L, A, K.azure, 'A = aG', { r: Math.max(5, L.cell) + 2 });
      }
      drawEvePanel(ctx, g, A, now);
      drawCost(ctx, g.chart);
    }

    function drawClock(ctx, g) {
      const L = g.lat, c = eve.clock, n = c.n, a = secA;
      const cx = L.x + L.S / 2, cy = L.y + L.S / 2, r = L.S * 0.43;
      rubric(ctx, 'the same deal on a clock', L.x, L.y - 30, K.azure, 'left', `ℤ/${n}, g = ${c.g}`);
      const ang = (u) => u * Math.PI * 2 - Math.PI / 2;
      const at = (u, rr) => [cx + rr * Math.cos(ang(u)), cy + rr * Math.sin(ang(u))];
      // the dial: n residues, every tenth marked
      ctx.lineWidth = 1;
      for (let k = 0; k < n; k++) {
        const big = k % 10 === 0, [x0, y0] = at(k / n, r), [x1, y1] = at(k / n, r + (big ? 7 : 3.5));
        ctx.strokeStyle = big ? K.inkDim : K.ghost;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        if (big && n <= 200) { const [lx, ly] = at(k / n, r + 17); txt(ctx, String(k), lx, ly + 3, mono(9.5), K.inkFaint, 'center'); occupy(lx, ly, 9); }
      }
      // Alice's a hops of g, as a spiral so that every lap stays legible
      const total = (a * c.g) / n, hop = eve.clockHop || 0;
      const rad = (u) => r * (0.9 - 0.36 * (u / Math.max(total, 1)));
      const upto = (hop * c.g) / n;
      ctx.strokeStyle = 'rgba(125,167,217,0.8)'; ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let j = 0, N = Math.max(2, Math.ceil(upto * 240)); j <= N; j++) {
        const u = (upto * j) / N, [px, py] = at(u, rad(u));
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      if (hop) ctx.stroke();
      for (let k = 0; k <= hop; k++) { const u = (k * c.g) / n, [px, py] = at(u, rad(u)); dot(ctx, px, py, k === hop ? 3.4 : 1.9, k === hop ? K.azure : 'rgba(125,167,217,0.9)'); }
      const [zx, zy] = at(0, r);
      dot(ctx, zx, zy, 3, K.ink);
      if (hop >= a) {
        const [ex, ey] = at(total, rad(total)), [ax, ay] = at(c.A / n, r);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = K.azure; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ax, ay); ctx.stroke(); ctx.setLineDash([]);
        glow.azure.draw(ctx, ax, ay, 0.7); ring(ctx, ax, ay, 6, K.azure, 1.4); occupy(ax, ay, 8);
        queueLabel(`A = ${a}·${c.g} mod ${n} = ${c.A}`, ax, ay, 8, K.azure, it(13.5), [L.x - 30, L.y - 20, L.x + L.S + 30, L.y + L.S + 20]);
      }
      haloText(ctx, `k ↦ ${c.g}k mod ${n}`, cx, cy - 6, it(15), K.azure, 'center');
      const nar = L.S < 360;
      haloText(ctx, hop ? `${hop} hop${hop === 1 ? '' : 's'} of ${c.g}` + (nar ? '' : ', every one in plain sight') : 'multiples of g, in order', cx, cy + 14, it(12.5), K.inkDim, 'center');
      if (eve.clockDone) haloText(ctx, `a = ${c.br.a}, by division`, cx, cy + 40, it(15), K.crimsonBright, 'center');
    }

    function drawEvePanel(ctx, g, A, now) {
      const b = g.rho, x = b.x, w = b.w;
      let y = b.y;
      if (eve.mode === 'clock' && eve.clock) {
        const c = eve.clock;
        rubric(ctx, 'Euclid undoes it', x, y, K.verdigris);
        y += 24;
        for (const ln of wrapLines(ctx, `On the clock Alice would publish A = a·g mod ${c.n} = ${c.A}. Eve divides by g, and Euclid computes the division:`, w, it(13.5))) { txt(ctx, ln, x, y, it(13.5), K.inkDim); y += 18; }
        y += 8;
        c.br.steps.forEach((s, i) => { if (i < eve.clockRows) { txt(ctx, `${s[0]} = ${s[1]} · ${s[2]} + ${s[3]}`, x + 12, y, mono(13), K.ink); y += 19; } });
        if (eve.clockDone) {
          y += 4;
          runs(ctx, x + 12, y, [[`${c.g}⁻¹ ≡ ${c.br.inv}`, mono(13), K.azure], [`   a = ${c.A}·${c.br.inv} mod ${c.n} = `, mono(13), K.inkDim], [String(c.br.a), mono(14, 600), K.crimsonBright]]);
          y += 26;
          for (const ln of wrapLines(ctx, `${c.br.steps.length} divisions. On a well-chosen curve the same algebra has no known shortcut; the orbit there is scrambled.`, w, it(13.5))) { txt(ctx, ln, x, y, it(13.5), K.inkDim); y += 18; }
        }
        return;
      }
      if (eve.mode === 'walk') {
        rubric(ctx, 'the brute walk', x, y, K.verdigris);
        y += 26;
        runs(ctx, x, y, [['G, 2G, 3G … until the point equals A', it(14), K.inkDim]]);
        y += 28;
        if (eve.walkK > 0) runs(ctx, x, y, [[`${eve.walkK} steps`, mono(16, 600), eve.walkDone ? K.crimsonBright : K.ink], [eve.walkDone ? `   a = ${secA}` : '', it(15), K.crimsonBright]]);
        y += 28;
        for (const ln of wrapLines(ctx, `At toy size the walk ends within ${M.n - 1} steps. On a curve of 2²⁵⁶ points it would need, on average, about 2²⁵⁵.`, w, it(13.5))) { txt(ctx, ln, x, y, it(13.5), K.inkDim); y += 18; }
        return;
      }
      // the ρ diagram
      rubric(ctx, 'Pollard’s rho, 1978', x, y, K.verdigris);
      if (M.trap && !eve.rho) {
        const note = `At p = ${M.p} the curve has exactly p points, so Eve need not wander at all: Smart’s transfer (1999) would take this logarithm into the integers mod p. Rho still works; it is merely unnecessary.`;
        let ty = b.y + b.h - 8 - 17 * (wrapLines(ctx, note, w, it(12.5)).length - 1);
        for (const ln of wrapLines(ctx, note, w, it(12.5))) { txt(ctx, ln, x, ty, it(12.5), K.crimsonBright); ty += 17; }
      }
      const r = eve.rho;
      if (!r) {
        y += 24;
        for (const ln of wrapLines(ctx, 'Eve iterates R ↦ 2R, R + G or R + A, choosing by x mod 3, and tracks R = cG + dA. In a finite group the walk must repeat, tracing the letter ρ: a tail, then a loop. A tortoise and a hare find the repeat, and the repeat gives away a.', w, it(13.5))) { txt(ctx, ln, x, y, it(13.5), K.inkDim); y += 18; }
        return;
      }
      const narrow = g.narrow;
      const loopR = narrow ? 44 : 58, dcx = x + (narrow ? w * 0.3 : w * 0.28), dcy = y + 30 + loopR;
      const entryA = Math.PI / 2 + 0.55; // the loop is entered from the lower left
      const ex0 = dcx + loopR * Math.cos(entryA), ey0 = dcy + loopR * Math.sin(entryA);
      const reach = Math.min(r.tail + r.cycle, 2 * Math.max(0, eve.iter) + 1);
      const nodePos = (j) => {
        if (j >= r.tail) { const a = entryA - ((j - r.tail) / r.cycle) * Math.PI * 2; return [dcx + loopR * Math.cos(a), dcy + loopR * Math.sin(a)]; }
        const d = (r.tail - j) * Math.min(18, (narrow ? 64 : b.h - 2 * loopR - 40) / Math.max(1, r.tail));
        return [ex0 - d * 0.55, ey0 + d * 0.84];
      };
      // skeleton
      ctx.strokeStyle = K.ghost; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(dcx, dcy, loopR, 0, Math.PI * 2); ctx.stroke();
      if (r.tail) { const [tx, ty] = nodePos(0); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex0, ey0); ctx.stroke(); ctx.setLineDash([]); }
      for (let j = 0; j < r.tail + r.cycle; j++) {
        const [nx, ny] = nodePos(j);
        const lit = j < reach;
        dot(ctx, nx, ny, lit ? 3.4 : 2.2, lit ? (j < r.tail ? K.crimsonBright : K.crimson) : K.ghost);
      }
      if (eve.iter >= 0) {
        const tj = rhoIndex(eve.iter, r.tail, r.cycle), hj = rhoIndex(2 * eve.iter, r.tail, r.cycle);
        const [tx, ty] = nodePos(tj), [hx, hy] = nodePos(hj);
        ring(ctx, tx, ty, 8, K.ink, 1.3);
        dot(ctx, hx, hy, 4.2, K.crimsonBright);
        if (eve.solved || tj === hj) glow.crimson.draw(ctx, hx, hy, 1.1);
      }
      const lx = dcx + loopR + 24;
      let ly = y + 36;
      const lw = x + w - lx;
      runs(ctx, lx, ly, [['○', sf(13), K.ink], [' tortoise: one step', it(13), K.inkDim]]); ly += 18;
      runs(ctx, lx, ly, [['●', sf(13), K.crimsonBright], [' hare: two steps', it(13), K.inkDim]]); ly += 26;
      runs(ctx, lx, ly, [[`tail ${r.tail}`, mono(12.5), K.crimsonBright], ['  ·  ', sf(13), K.inkFaint], [`loop ${r.cycle}`, mono(12.5), K.crimson]]); ly += 20;
      runs(ctx, lx, ly, [[`round ${Math.max(0, eve.iter)} of ${r.floydIters}`, mono(12.5), K.inkDim]]); ly += 22;
      if (eve.solved && lw > 120) {
        const T = r.T, Hh = r.H;
        for (const ln of wrapLines(ctx, `they meet: ${T.c}G + ${T.d}A = ${Hh.c}G + ${Hh.d}A`, lw, mono(11.5))) { txt(ctx, ln, lx, ly, mono(11.5), K.inkDim); ly += 16; }
      }
      y = Math.max(dcy + loopR + 26, nodePos(0)[1] + 26, ly + 10);
      if (eve.solved) {
        const T = r.T, Hh = r.H, f = mono(narrow ? 12 : 13);
        const head = `a = (${T.c} − ${Hh.c}) · (${Hh.d} − ${T.d})⁻¹`, tail = ` mod ${M.n} = ${r.a}`;
        ctx.font = f;
        if (ctx.measureText(head + tail).width <= w) txt(ctx, head + tail, x, y, f, K.crimsonBright);
        else { txt(ctx, head, x, y, f, K.crimsonBright); txt(ctx, '   ' + tail.trim(), x, y + 17, f, K.crimsonBright); }
      }
    }

    function drawCost(ctx, c) {
      const { x, y, w, h } = c;
      const X = (bits) => x + (bits / 256) * w, Y = (l2) => y + h - (l2 / 132) * h;
      rubric(ctx, 'the cost as keys grow', x - 30, y - 14, K.verdigris);
      ctx.strokeStyle = K.line; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      for (const e of [32, 64, 96, 128]) {
        const yy = Math.round(Y(e)) + 0.5;
        ctx.strokeStyle = 'rgba(42,46,63,0.8)'; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
        drawPow(ctx, '2', String(e), x - 6, yy + 4, 10, K.inkFaint, 'right');
      }
      for (const bb of [64, 128, 192, 256]) txt(ctx, String(bb), X(bb), y + h + 13, mono(9.5), K.inkFaint, 'center');
      txt(ctx, 'key bits', x + w / 2, y + h + 26, it(11.5), K.inkFaint, 'center');
      // lines
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = K.azure; ctx.beginPath();
      for (let b2 = 8; b2 <= 256; b2 += 4) { const yy = Y(honestLog2(b2)); b2 === 8 ? ctx.moveTo(X(b2), yy) : ctx.lineTo(X(b2), yy); }
      ctx.stroke();
      ctx.strokeStyle = K.crimson; ctx.beginPath(); ctx.moveTo(X(8), Y(rhoLog2(8))); ctx.lineTo(X(256), Y(rhoLog2(256))); ctx.stroke();
      ctx.lineWidth = 1;
      const nar = w < 420;
      txt(ctx, nar ? 'Alice and Bob' : 'Alice and Bob: about 1.5 operations per key bit', X(252), Y(honestLog2(252)) - 8, it(11.5), K.azure, 'right');
      txt(ctx, nar ? 'Eve’s rho' : 'Eve’s rho: 0.886·√n additions', X(124), Y(rhoLog2(124)) - 9, it(11.5), K.crimsonBright, 'right');
      // published markers
      dot(ctx, X(112), Y(rhoLog2(112)), 3, K.crimsonBright);
      txt(ctx, nar ? '112 bits, solved' : '112 bits, solved on game consoles', X(112) + 8, Y(rhoLog2(112)) + 13, it(11), K.inkDim);
      dot(ctx, X(256), Y(127.8), 3.2, K.crimsonBright);
      {
        const right = X(256) - 9, yy = Y(127.8) + 19;
        drawPow(ctx, '2', '127.8', right, yy, 11, K.crimsonBright, 'right');
        ctx.font = it(11);
        const lw = ctx.measureText('secp256k1, P-256:  ').width;
        ctx.font = mono(11); const wb = ctx.measureText('2').width; ctx.font = mono(11 * 0.72); const we = ctx.measureText('127.8').width;
        txt(ctx, 'secp256k1, P-256:  ', right - (wb + we + 1) - lw, yy, it(11), K.inkDim);
      }
      if (eve.lastWork) {
        const lwk = eve.lastWork, wx = X(lwk.bits), wy = Y(Math.log2(lwk.ops));
        glow.gold.draw(ctx, wx, wy, 0.5);
        dot(ctx, wx, wy, 3.2, K.goldBright);
        txt(ctx, nar ? `your toy: ${lwk.ops}` : `your toy: ${lwk.ops} ${lwk.unit}`, wx + 2, wy - 12, it(11.5), K.goldBright);
      }
    }

    /* =====================================================================
       vi · full size: X25519
       ===================================================================== */
    const randomHex = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return bytesToHex(b); };
    async function webcryptoAgrees(aHex, BHex, Khex) {
      try {
        const subtle = globalThis.crypto && globalThis.crypto.subtle;
        if (!subtle) return 'none';
        const priv = await subtle.importKey('pkcs8', hexToBytes('302e020100300506032b656e04220420' + aHex), { name: 'X25519' }, false, ['deriveBits']);
        const pub = await subtle.importKey('raw', hexToBytes(BHex), { name: 'X25519' }, false, []);
        const bits = await subtle.deriveBits({ name: 'X25519', public: pub }, priv, 256);
        return bytesToHex(new Uint8Array(bits)) === Khex ? 'agree' : 'differ';
      } catch (err) { return 'none'; }
    }
    function startFull(fresh) {
      if (view !== 'full') setView('full');
      let aHex = RFC.a, bHex = RFC.b;
      if (fresh) { try { aHex = randomHex(); bHex = randomHex(); } catch (err) { fresh = false; } }
      const t0 = performance.now();
      const Apub = x25519(aHex, U9), Bpub = x25519(bHex, U9);
      const K1 = x25519(aHex, Bpub), K2 = x25519(bHex, Apub);
      const ms = performance.now() - t0;
      const res = { aHex, bHex, Apub, Bpub, K1, K2, ms, fresh, bitsA: scalarBits(aHex), bitsB: scalarBits(bHex),
        rfcOk: !fresh && Apub === RFC.A && Bpub === RFC.B && K1 === RFC.K };
      full.res = res; full.idx = 0; full.running = true; full.bytes = 0; full.webcrypto = '…';
      webcryptoAgrees(aHex, Bpub, K1).then((v) => { if (full.res === res) { full.webcrypto = v; dirty = true; updateReadout(); } });
      const evs = [];
      for (let i = 0; i < 255; i++) {
        const bit = res.bitsA[i];
        evs.push({
          dt: i ? 0.025 : 0,
          sound: (t) => (bit ? audio.drums.hat(bus, t, { level: 0.16 }) : audio.drums.rim(bus, t, { level: 0.12 })),
          apply: () => { full.idx = i + 1; dirty = true; },
        });
      }
      const kb = hexToBytes(K1);
      for (let j = 0; j < 4; j++) {
        evs.push({
          dt: j ? 0.2 : 0.35,
          sound: (t) => audio.playTone(bus, { freq: 220 * Math.pow(2, (2 * kb[j]) / 256), dur: 0.36, level: 0.18, type: 'triangle', when: t }),
          apply: () => { full.bytes = j + 1; dirty = true; },
        });
      }
      evs.push({ dt: 0.3, apply: () => { full.running = false; full.idx = 255; full.bytes = 4; if (res.rfcOk || (res.fresh && res.K1 === res.K2)) { if (res.rfcOk) done.full = true; } updateQuest(); updateReadout(); dirty = true; } });
      runSeq(evs);
      updateReadout();
    }
    const octets = (h) => h.match(/.{8}/g);
    function drawFull(ctx, W, H) {
      const narrow = W < 720;
      const R0 = narrow ? Math.min(W * 0.4, 150) : Math.min(H * 0.39, W * 0.2);
      const cx = narrow ? W / 2 : 40 + R0 + 20, cy = narrow ? 44 + R0 : H / 2 + 6;
      const res = full.res;
      const idx = res ? full.idx : 0;
      rubric(ctx, 'X25519 · RFC 7748', narrow ? 16 : 40, 26, K.inkDim, 'left', 'p = 2²⁵⁵ − 19');
      const drawRing = (r, bits, color) => {
        for (let i = 0; i < 255; i++) {
          const a = (i / 255) * Math.PI * 2 - Math.PI / 2, lit = i < idx;
          const bit = bits ? bits[i] : 0;
          const len = lit ? (bit ? 13 : 5) : 4;
          ctx.strokeStyle = lit ? (bit ? color : 'rgba(169,164,147,0.55)') : 'rgba(74,72,64,0.7)';
          ctx.lineWidth = lit && bit ? 1.6 : 1;
          ctx.beginPath();
          ctx.moveTo(cx + (r - len) * Math.cos(a), cy + (r - len) * Math.sin(a));
          ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
          ctx.stroke();
        }
      };
      drawRing(R0, res && res.bitsA, K.azure);
      drawRing(R0 - 20, res && res.bitsB, K.verdant);
      if (res && full.running && idx < 255) {
        const a = (idx / 255) * Math.PI * 2 - Math.PI / 2;
        glow.gold.draw(ctx, cx + (R0 + 7) * Math.cos(a), cy + (R0 + 7) * Math.sin(a), 0.5);
      }
      // centre
      if (!res) {
        txt(ctx, '255', cx, cy - 4, sf(narrow ? 30 : 38), K.inkDim, 'center');
        txt(ctx, 'ladder steps', cx, cy + 18, it(13), K.inkFaint, 'center');
      } else if (full.bytes < 4) {
        txt(ctx, String(idx), cx, cy - 2, mono(narrow ? 26 : 32), K.ink, 'center');
        txt(ctx, 'of 255 steps', cx, cy + 20, it(13), K.inkFaint, 'center');
      } else {
        glow.gold.draw(ctx, cx, cy - 4, 1.5);
        txt(ctx, 'K', cx, cy - 20, it(18), K.goldBright, 'center');
        txt(ctx, res.K1.slice(0, 8), cx, cy + 4, mono(narrow ? 17 : 20, 600), K.goldBright, 'center');
        txt(ctx, res.rfcOk ? '✓ RFC 7748 §6.1' : res.K1 === res.K2 ? '✓ both sides agree' : '✗', cx, cy + 26, it(12.5), K.verdigris, 'center');
      }
      txt(ctx, 'outer: Alice’s scalar · inner: Bob’s', cx, cy + R0 + 24, it(12), K.inkFaint, 'center');
      // text column
      const tx = narrow ? 16 : cx + R0 + 56, tw = W - tx - 18;
      let y = narrow ? cy + R0 + 56 : 58;
      const lbl = (s, c = K.inkFaint) => { txt(ctx, s, tx, y, it(narrow ? 12.5 : 13.5), c); y += narrow ? 17 : 19; };
      let hexW = 0;
      const hex = (h, c, bold = false) => {
        const o = octets(h);
        const f = mono(narrow ? 11.5 : 12.5, bold ? 600 : '');
        ctx.font = f; hexW = ctx.measureText(o.slice(0, 4).join(' ')).width;
        txt(ctx, o.slice(0, 4).join(' '), tx, y, f, c); y += narrow ? 16 : 17;
        txt(ctx, o.slice(4).join(' '), tx, y, f, c); y += narrow ? 22 : 26;
      };
      const check = (ok, yy) => { if (ok) txt(ctx, '✓', Math.min(tx + hexW + 14, tx + tw), yy + (narrow ? 8 : 9), sf(15), K.verdigris, 'left'); };
      if (!narrow) {
        const g11 = P25519.toString().match(/\d{11}/g);
        const lines = [g11.slice(0, 4).join(' '), g11.slice(4).join(' ')];
        lbl('the prime 2²⁵⁵ − 19, all 77 digits');
        for (const ln of lines) { txt(ctx, ln, tx, y, mono(9.5), K.inkFaint); y += 13; }
        y += 14;
      }
      const showA = res && idx >= 255, fin = res && full.bytes >= 4;
      lbl(res && res.fresh ? 'Alice’s secret a (fresh random bytes)' : 'Alice’s secret a (the RFC’s test key)');
      hex(res ? res.aHex : RFC.a, K.azure);
      const yA = y;
      lbl('her public key X25519(a, 9)');
      if (showA) { hex(res.Apub, K.azure); check(res.rfcOk, yA + (narrow ? 17 : 19)); } else { txt(ctx, '· · ·', tx, y, mono(12), K.ghost); y += narrow ? 38 : 43; }
      const yB = y;
      lbl('Bob’s public key X25519(b, 9)');
      if (showA) { hex(res.Bpub, K.verdant); check(res.rfcOk, yB + (narrow ? 17 : 19)); } else { txt(ctx, '· · ·', tx, y, mono(12), K.ghost); y += narrow ? 38 : 43; }
      const yK = y;
      lbl('shared secret K = X25519(a, B) = X25519(b, A)', fin ? K.goldBright : K.inkFaint);
      if (fin) { hex(res.K1, K.goldBright, true); check(res.K1 === res.K2, yK + (narrow ? 17 : 19)); } else { txt(ctx, '· · ·', tx, y, mono(12), K.ghost); y += narrow ? 38 : 43; }
      if (fin) {
        const lines = [
          `four ladders of 255 steps took ${res.ms.toFixed(1)} ms here`,
          res.rfcOk ? 'every byte matches RFC 7748 §6.1' : res.fresh ? 'Alice and Bob agree without sending a or b' : '',
          full.webcrypto === 'agree' ? 'your browser’s own X25519 computes the same K' : full.webcrypto === 'differ' ? 'your browser’s X25519 disagrees' : '',
        ].filter(Boolean);
        for (const s of lines) { if (y + 4 > H) break; txt(ctx, s, tx, y, it(narrow ? 12.5 : 13.5), s.startsWith('your browser’s own') || s.startsWith('every') ? K.verdigris : K.inkDim); y += narrow ? 18 : 20; }
      }
    }

    /* =====================================================================
       views, quest, readout, loop
       ===================================================================== */
    const CAPTIONS = {
      chord: 'Drag <em>P</em> or <em>Q</em> along the curve. The plot stretches <em>x</em> and <em>y</em> by different amounts, which keeps every straight line straight, so each chord still meets the curve where it did.',
      count: 'Gold squares: the solutions mod <em>p</em>. The azure strands are one straight line wrapped on the grid; exactly three of its lattice points lie on the curve, a point of tangency counting twice. At 61 and 127 the curve has exactly <em>p</em> points, the “anomalous” case where the lock fails.',
      walk: 'Each note is one addition of <em>G</em>, pitched by its <em>x</em>-coordinate; ∞ has no coordinates and is silent. In double-and-add the low thock is a doubling and the dry click an addition, so the rhythm spells <em>k</em> in binary. Leaks of that kind are real: in 2016 Genkin, Pachmanov, Pipman and Tromer recovered ECDH keys from the electromagnetic emanations of PCs. X25519’s ladder does the same work for every bit, so a careful implementation has no such rhythm to leak.',
      shake: 'Alice’s notes sound on the left, Bob’s on the right; when both reach the shared point you hear a single pitch. A group this small is a toy that Eve breaks at once; the arithmetic is the real thing.',
      eve: 'Rho needs about √<em>n</em> steps, so every two bits of key double Eve’s work while adding about three operations to Alice’s. The chart plots the published figures: SafeCurves’ 2<sup>127.8</sup> for secp256k1 and P-256, and the 112-bit elliptic-curve logarithm solved on game consoles by Bos, Kaihara, Kleinjung, Lenstra and Montgomery (published 2012).',
      full: 'RFC 7748’s X25519, run in BigInt arithmetic and checked against the RFC’s published test vector. The scalars are clamped: bit 254 is always set and the three lowest bits are clear. This page’s code is a demonstration; it is not constant-time and must never guard a real secret.',
    };
    const QUESTS = {
      chord: ['Drag <em>Q</em> onto <em>P</em>. Watch the chord turn into a tangent, and <em>P</em> + <em>Q</em> become 2<em>P</em>.',
        'That tangent is doubling. Now try the flex button: at (0, ±√7) the tangent never meets the curve again, so 3<em>P</em> = ∞.'],
      count: ['Count the curve mod 97, column by column, then pick two points: the chord still finds exactly one more.',
        'Counted, and chorded: every chord through two points meets the curve exactly once more, counting ∞. Next: the walk.'],
      walk: ['Walk <em>G</em>, 2<em>G</em>, 3<em>G</em> … and listen until the walk falls silent.',
        'Every point, once each, in no visible order, and then ∞. The shortcut is doubling: try <em>k</em> = 42.'],
      shake: ['Shake hands. Alice and Bob never send their secrets, yet both land on the same point.',
        'Agreed, in public: <em>a</em>·(<em>bG</em>) = <em>b</em>·(<em>aG</em>). Now play Eve.'],
      eve: ['Play Eve: recover Alice’s secret from what crossed the wire.',
        'Found, at toy size. At 256 bits the same walk needs about 2<sup>128</sup> additions, and nothing fundamentally faster is known for well-chosen curves.'],
      full: ['Shake hands at 2²⁵⁵ − 19 and check the result against RFC 7748.',
        'Every byte matches the RFC. The same ladder runs, paired with ML-KEM, in the hybrid handshakes that browsers now offer by default.'],
    };
    function updateQuest() {
      const q = QUESTS[view];
      const nDone = Object.values(done).filter(Boolean).length;
      prog.textContent = VIEWS.map((v) => (done[v.key] ? '◆' : '◇')).join('');
      prog.setAttribute('aria-label', `${nDone} of 6 rooms complete`);
      for (const v of VIEWS) tabBtns[v.key].classList.toggle('hs-done', done[v.key]);
      if (nDone === 6) { quest.done('All six rooms: a curve, a count, a walk, a handshake, an eavesdropper who cannot scale, and the real thing.'); return; }
      if (done[view]) quest.done(q[1]); else quest.set(q[0]);
      if (view === 'count') quest[done.count ? 'done' : 'set'](done.count ? q[1] : q[0].replace('97', String(M.p)));
    }
    function updateReadout() {
      let s = '';
      if (view === 'chord') {
        const st = chordState();
        s = st.kind === 'vertical' ? 'P and Q are mirror images: the chord is vertical and P + Q = ∞.'
          : `${st.kind === 'chord' ? 'P + Q' : '2P'} = (${fx(st.S[0])}, ${fx(st.S[1])})  ·  λ = ${fx(st.lam, 4)}  ·  ${st.kind}`;
      } else if (view === 'count') {
        s = count.done ? `mod ${M.p}: ${M.pts.length} affine points + ∞ = ${M.n}; Hasse window ${M.hasse.lo.toFixed(2)} to ${M.hasse.hi.toFixed(2)}${M.trap ? '; anomalous: #E = p' : ''}` : `mod ${M.p}: counting…`;
        if (count.P && count.Q) { const S = ecAdd(count.P, count.Q, M.C); s += `  ·  ${fp(count.P)} + ${fp(count.Q)} = ${fp(S)}`; }
      } else if (view === 'walk') {
        const tr = mulTrace(daK, M.G, M.C);
        const nD = (tr.ops.match(/D/g) || []).length, nA = (tr.ops.match(/A/g) || []).length - 1;
        s = `walk: ${walk.k ? (walk.k >= M.n ? `${M.n}G = ∞` : `${walk.k}G = ${fp(M.mult[walk.k])}`) : 'not started'}  ·  ${daK} = ${tr.bits}₂ → ${nD} doublings + ${nA} additions = ${nD + nA} operations (one G at a time: ${daK - 1})`;
      } else if (view === 'shake') {
        const c = shake.res || shakeCalc();
        s = `a = ${secA}, b = ${secB}  ·  A = ${fp(c.A)}, B = ${fp(c.B)}` + (shake.phase === 'done' ? `  ·  Alice: ${fp(c.SA)}, Bob: ${fp(c.SB)} → ${c.agree ? 'agreement' : 'no agreement'}` : '');
      } else if (view === 'eve') {
        if (eve.mode === 'clock' && eve.clock) s = `clock ℤ/${eve.clock.n}: A = ${eve.clock.A}; ${eve.clock.g}⁻¹ = ${eve.clock.br.inv}; a = ${eve.clockDone ? eve.clock.br.a : '…'} in ${eve.clock.br.steps.length} divisions`;
        else if (eve.mode === 'walk') s = `walk: ${eve.walkK} steps${eve.walkDone ? ` → a = ${secA}` : ''}`;
        else if (eve.rho) s = `rho: tail ${eve.rho.tail}, loop ${eve.rho.cycle}, Floyd rounds ${eve.rho.floydIters}${eve.solved ? ` → a = ${eve.rho.a}` : ''}`;
        else s = `Eve knows G = ${fp(M.G)} and A = ${fp(scalarMul(secA, M.G, M.C))}; she wants a.` + (M.trap ? ` At p = ${M.p}, #E = p: an anomalous curve.` : '');
      } else if (view === 'full') {
        const r = full.res;
        s = !r ? 'X25519 on the RFC 7748 §6.1 test keys: press the button.'
          : `K = ${r.K1}${r.rfcOk ? ' ✓ RFC 7748' : ''}  ·  ${r.ms.toFixed(1)} ms for four ladders${full.webcrypto === 'agree' ? '  ·  WebCrypto agrees' : ''}`;
      }
      info.set(s);
    }
    function setView(v) {
      if (seq) flushSeq();
      view = v;
      for (const k of Object.keys(tabBtns)) {
        tabBtns[k].classList.toggle('active', k === v);
        tabBtns[k].setAttribute('aria-selected', String(k === v));
        tabBtns[k].tabIndex = k === v ? 0 : -1;
        rows[k].style.display = k === v ? '' : 'none';
      }
      if (v === 'count' || v === 'walk' || v === 'shake' || v === 'eve') rows[v].insertBefore(primeSel.el, rows[v].firstChild);
      cap.innerHTML = CAPTIONS[v];
      handle.canvas.style.cursor = 'default';
      updateQuest(); updateReadout();
      dirty = true;
    }

    function draw() {
      const active = consumeSeq();
      if (!dirty && !active && !chord.drag) return;
      dirty = false;
      const { ctx, width: W, height: H } = handle;
      // A transient size (a hidden or collapsing stage) waits for the next resize.
      if (!(W >= 120 && H >= 120)) { dirty = true; return; }
      ctx.clearRect(0, 0, W, H);
      resetLabels();
      // A throw inside a frame would end the rAF loop for good; report it once and keep going.
      try {
        if (view === 'chord') drawChord(ctx, W, H);
        else if (view === 'count') drawCount(ctx, W, H);
        else if (view === 'walk') drawWalk(ctx, W, H);
        else if (view === 'shake') drawShake(ctx, W, H);
        else if (view === 'eve') drawEve(ctx, W, H);
        else drawFull(ctx, W, H);
        flushLabels(ctx);
      } catch (err) {
        for (let i = 0; i < 8; i++) ctx.restore(); // unwind any save() the failed frame left open
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        if (!drawErr) { drawErr = err; console.error('handshake: a frame failed to draw', err); }
      }
    }
    let drawErr = null;
    const loop = cv.rafLoop(draw);

    setView('chord');
    loop.start();

    return {
      pause() {
        loop.stop();
        flushSeq();
        chord.drag = null;
        bus.mute();
      },
      resume() {
        bus.unmute();
        dirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        cancelSeq();
        clearTimeout(resizeTimer);
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointermove', onMove);
        handle.canvas.removeEventListener('pointerup', onUp);
        handle.canvas.removeEventListener('pointercancel', onUp);
        handle.canvas.removeEventListener('touchstart', onTouchStart);
        handle.canvas.removeEventListener('keydown', onKey);
        handle.canvas.removeEventListener('keyup', onKeyUp);
        tabs.removeEventListener('keydown', onTabKey);
        bus.dispose();
        handle.destroy();
        // the stage arrived empty: leave it that way
        for (const el of [...stage.children]) el.remove();
      },
    };
  },
};
