// IV — One More Circle
// Satellite navigation as Euclid I.1 drawn with light. Range circles cut in two
// points; the receiver's cheap clock makes every range wrong by the same amount,
// so one more circle (three in this flat slice, four in space) solves for the
// clock too. Gauss–Newton and Bancroft's closed form find the fix; dilution of
// precision shows geometry setting the error; Ashby's relativity numbers set the
// satellite clocks; leftover residuals catch a forged range.
//
// Everything is drawn to scale in a plane through Earth's centre. The numerical
// core below is pure (no DOM) and exported via _test.

/* ================= pure core ================= */

const C_KM_S = 299792.458;            // km/s, exact by the SI definition of the metre
const C_M_S = 299792458;
const R_EARTH = 6371;                 // km, mean radius (drawing scale)
const A_GPS = 26561.75;               // km, GPS semi-major axis a₀ (Ashby 2003)
const GM = 3.986004418e14;            // m³ s⁻² (WGS-84, as in Ashby)
const PHI0_C2 = -6.969290134e-10;     // geoid potential over c² (Ashby 2003)
const F0 = 10.23e6;                   // Hz, GPS fundamental
const L1 = 154 * F0;                  // 1575.42 MHz
const FACTORY = 4.4647e-10;           // Ashby eq. (35): the rate removed before launch
const US_KM = C_KM_S * 1e-6;          // km of light per microsecond
const VIS_DEG = Math.acos(R_EARTH / A_GPS) * 180 / Math.PI;   // 76.12°: above your horizon

// Satellite on the orbit ring; angle measured from +y (the receiver's zenith).
const satAt = (deg, a = A_GPS) => {
  const t = deg * Math.PI / 180;
  return [a * Math.sin(t), a * Math.cos(t)];
};
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ρᵢ = |r − sᵢ| + b − bᵢ : b = c·δt(receiver), bᵢ = c·δt(satellite i), all km.
function pseudoranges(sats, r, bKm, satBiasKm = []) {
  return sats.map((s, i) => dist(s, r) + bKm - (satBiasKm[i] || 0));
}

// Gaussian elimination with partial pivoting; null when singular.
function solveLinear(A, y) {
  const n = y.length, M = A.map((row, i) => [...row, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

// Gauss–Newton on the pseudorange equations, unknowns (x, y, b). Each step
// replaces every circle by its tangent line and solves (HᵀH)Δ = Hᵀ(ρ − ρ̂).
function solveGN(sats, rho, x0 = [0, 0, 0], maxIter = 12, tol = 1e-9) {
  let [x, y, b] = x0;
  const history = [];
  const rmsAt = (X, Y, Bb) => {
    let s = 0;
    for (let i = 0; i < sats.length; i++) { const e = rho[i] - (dist(sats[i], [X, Y]) + Bb); s += e * e; }
    return Math.sqrt(s / sats.length);
  };
  for (let it = 0; it < maxIter; it++) {
    const HtH = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Htr = [0, 0, 0];
    for (let i = 0; i < sats.length; i++) {
      const d = dist(sats[i], [x, y]) || 1e-9;
      const res = rho[i] - (d + b);
      const h = [(x - sats[i][0]) / d, (y - sats[i][1]) / d, 1];
      for (let j = 0; j < 3; j++) {
        Htr[j] += h[j] * res;
        for (let k = 0; k < 3; k++) HtH[j][k] += h[j] * h[k];
      }
    }
    history.push({ x, y, b, rms: rmsAt(x, y, b) });
    const dx = solveLinear(HtH, Htr);
    if (!dx) break;
    x += dx[0]; y += dx[1]; b += dx[2];
    if (Math.hypot(dx[0], dx[1], dx[2]) < tol) {
      history.push({ x, y, b, rms: rmsAt(x, y, b) });
      return { x, y, b, iters: it + 1, history, converged: true };
    }
  }
  return { x, y, b, iters: history.length, history, converged: false };
}

// Bancroft (1985) in 2+1 dimensions, with the Lorentz form ⟨u,v⟩ = u₀v₀ + u₁v₁ − u₂v₂.
// Squared, each equation says emission and reception are null-separated.
const lor = (u, v) => u[0] * v[0] + u[1] * v[1] - u[2] * v[2];
function bancroft2D(sats, rho) {
  const n = sats.length;
  if (n < 3) return [];
  const B = sats.map((s, i) => [s[0], s[1], rho[i]]);
  const alpha = B.map((a) => lor(a, a) / 2);
  const ones = new Array(n).fill(1);
  const BtB = [0, 1, 2].map((j) => [0, 1, 2].map((k) => B.reduce((s, row) => s + row[j] * row[k], 0)));
  const Bt = (vec) => [0, 1, 2].map((j) => B.reduce((s, row, i) => s + row[j] * vec[i], 0));
  const u = solveLinear(BtB, Bt(alpha)), v = solveLinear(BtB, Bt(ones));
  if (!u || !v) return [];
  const A2 = lor(v, v), B2 = 2 * (lor(u, v) - 1), C2 = lor(u, u);
  let roots;
  if (Math.abs(A2) < 1e-15) roots = [-C2 / B2];
  else {
    const disc = B2 * B2 - 4 * A2 * C2;
    if (disc < 0) return [];
    const q = -0.5 * (B2 + (B2 >= 0 ? 1 : -1) * Math.sqrt(disc));
    roots = [q / A2, C2 / q];
  }
  return roots.map((L) => {
    const w = [u[0] + L * v[0], u[1] + L * v[1], u[2] + L * v[2]];
    const sol = { x: w[0], y: w[1], b: -w[2] };
    // causal iff the reception lies on the FUTURE light cone of every emission
    sol.causal = rho.every((p) => p - sol.b >= -1e-6);
    return sol;
  });
}

// Dilution of precision: G = (HᵀH)⁻¹ at the true position.
function dop2D(sats, r) {
  const HtH = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const s of sats) {
    const d = dist(s, r);
    const h = [(r[0] - s[0]) / d, (r[1] - s[1]) / d, 1];
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) HtH[j][k] += h[j] * h[k];
  }
  const G = [0, 1, 2].map((j) => solveLinear(HtH, [0, 1, 2].map((k) => (k === j ? 1 : 0))));
  if (G.some((c) => !c)) return null;
  const gxx = G[0][0], gyy = G[1][1], gbb = G[2][2], gxy = G[0][1];
  if (!(gxx > 0 && gyy > 0 && gbb > 0)) return null;
  return { gdop: Math.sqrt(gxx + gyy + gbb), pdop: Math.sqrt(gxx + gyy), tdop: Math.sqrt(gbb), gxx, gyy, gxy };
}

// 1σ error ellipse of the position block, for range noise σ (same units as σ).
function errorEllipse(dop, sigma) {
  const a = dop.gxx, c = dop.gyy, b = dop.gxy;
  const tr = (a + c) / 2, d = Math.hypot((a - c) / 2, b);
  return {
    major: sigma * Math.sqrt(tr + d),
    minor: sigma * Math.sqrt(Math.max(tr - d, 0)),
    angle: 0.5 * Math.atan2(2 * b, a - c),      // radians from +x
  };
}

// Relativity for a circular orbit (Ashby 2003): rate of an orbiting clock
// relative to one on the geoid, split into its gravitational and motional parts.
function clockRate(aM = A_GPS * 1000) {
  const c2 = C_M_S * C_M_S;
  const grav = -GM / (aM * c2) - PHI0_C2;
  const vel = -GM / (2 * aM * c2);
  return { grav, vel, net: grav + vel };
}
const usPerDay = (frac) => frac * 86400 * 1e6;
const eccAmplitudeNs = (e, aM = A_GPS * 1000) => 2 * Math.sqrt(GM * aM) * e / (C_M_S * C_M_S) * 1e9;
const eccTermKm = (e, sinE, aM) => eccAmplitudeNs(e, aM) * 1e-9 * C_KM_S * sinE;
const orbitalSpeed = (aKm = A_GPS) => Math.sqrt(GM / (aKm * 1000)) / 1000;   // km/s

// Beat (Hz) between a ground L1 reference and an orbiting one, by switched effects.
function relBeatHz({ gr = true, sr = true, detuned = false } = {}) {
  const r = clockRate();
  return L1 * ((gr ? r.grav : 0) + (sr ? r.vel : 0) - (detuned ? FACTORY : 0));
}

// Euclid I.1: circle × circle (branch order as in twotools).
function circleCircle(p1, r1, p2, r2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], d = Math.hypot(dx, dy);
  if (!(d > 0)) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < 0) return [];
  const h = Math.sqrt(h2), ux = dx / d, uy = dy / d, mx = p1[0] + a * ux, my = p1[1] + a * uy;
  return [[mx - h * uy, my + h * ux], [mx + h * uy, my - h * ux]];
}

// The curvilinear triangle three (or more) wrong circles leave near the Earth:
// each pair's cut nearest the surface. size = widest pairwise spread (km).
function circleTriangle(sats, radii) {
  const pts = [];
  for (let i = 0; i < sats.length; i++) {
    for (let j = i + 1; j < sats.length; j++) {
      const cc = circleCircle(sats[i], radii[i], sats[j], radii[j]);
      if (!cc.length) return { ok: false, pts, size: Infinity, centroid: null };
      cc.sort((p, q) => Math.abs(Math.hypot(p[0], p[1]) - R_EARTH) - Math.abs(Math.hypot(q[0], q[1]) - R_EARTH));
      pts.push(cc[0]);
    }
  }
  let size = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) size = Math.max(size, dist(pts[i], pts[j]));
  const centroid = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  return { ok: true, pts, size, centroid };
}

// What is left over after the fix: eᵢ = ρᵢ − (|sᵢ − r̂| + b̂).
function residuals(sats, rho, sol) {
  return sats.map((s, i) => rho[i] - (dist(s, [sol.x, sol.y]) + sol.b));
}
const rmsOf = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / Math.max(1, v.length));

// Fault exclusion: solve with each satellite left out in turn (needs n ≥ 5 to name the liar).
function exclusionTest(sats, rho) {
  return sats.map((_, k) => {
    const S = sats.filter((__, i) => i !== k), R = rho.filter((__, i) => i !== k);
    const g = solveGN(S, R);
    return rmsOf(residuals(S, R, g));
  });
}

// Beat V's model: satellite clocks lead by a common relativistic drift plus a
// per-satellite eccentricity term (unless the receiver applies it).
function relativityFix(sats, r, bKm, o = {}) {
  const { days = 0, gr = true, sr = true, detuned = false, e = 0, sinE = [], eccCorrected = false } = o;
  const cr = clockRate();
  const rate = (gr ? cr.grav : 0) + (sr ? cr.vel : 0) - (detuned ? FACTORY : 0);
  const driftKm = rate * 86400 * days * C_KM_S;
  const bias = sats.map((_, i) => driftKm + (eccCorrected ? 0 : eccTermKm(e, sinE[i] || 0)));
  const rho = pseudoranges(sats, r, bKm, bias);
  const sol = solveGN(sats, rho);
  return { rate, driftKm, bias, rho, sol, posErrKm: dist([sol.x, sol.y], r), clockErrKm: sol.b - bKm };
}

// Sonified convergence: one scale step per decade of misfit above 1 mm.
function rmsStep(rmsKm) {
  if (!(rmsKm > 1e-6)) return 0;
  return Math.max(0, Math.min(10, Math.ceil(Math.log10(rmsKm / 1e-6) - 1e-9)));
}
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];      // semitones above the tonic
const stepFreq = (k, tonic = 196) => tonic * Math.pow(2, PENTA[Math.max(0, Math.min(10, k))] / 12);

// 1, 2, 5 × 10ᵏ not exceeding x.
function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

/* ---------- typography helpers (pure) ---------- */
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function fmtNum(x, d = 0) {
  if (!Number.isFinite(x)) return '—';
  const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (x < 0 && /[1-9]/.test(s) ? '−' : '') + s;
}
const fmtSigned = (x, d = 0) => (x > 0 && /[1-9]/.test(Math.abs(x).toFixed(d)) ? '+' : '') + fmtNum(x, d);
function sci(x, d = 1) {
  if (x === 0 || !Number.isFinite(x)) return fmtNum(x, d);
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = x / Math.pow(10, e);
  if (Math.abs(+m.toFixed(d)) >= 10) { m /= 10; e += 1; }
  return `${fmtNum(m, d)} × 10${String(e).replace(/./g, (c) => SUP[c])}`;
}
// A length in km, spoken in the unit that suits it.
function fmtLen(km, signed = false) {
  const f = signed ? fmtSigned : fmtNum;
  const a = Math.abs(km);
  if (!Number.isFinite(km)) return '—';
  if (a >= 1000) return f(km, 0) + ' km';
  if (a >= 10) return f(km, 1) + ' km';
  if (a >= 1) return f(km, 3) + ' km';
  if (a >= 1e-3) return f(km * 1e3, a >= 1e-2 ? 1 : 2) + ' m';
  if (a >= 1e-5) return f(km * 1e5, 1) + ' cm';
  if (a >= 1e-8) return f(km * 1e6, 3) + ' mm';
  if (a === 0) return '0 m';
  return sci(km * 1e3, 1) + ' m';
}

/* ---------- self-test (node) ---------- */
function selfTest() {
  const fail = (m) => { throw new Error('whereami selfTest: ' + m); };
  const near = (a, b, tol, m) => { if (!(Math.abs(a - b) <= tol)) fail(`${m}: got ${a}, want ${b} ± ${tol}`); };
  const S4 = [-50, -15, 20, 55].map((d) => satAt(d));        // the dossier's fixture order
  const r = [0, R_EARTH], b = C_KM_S * 1e-3;                 // 1 ms of receiver clock error
  near(S4[0][0], -20347.480987, 1e-6, 'satAt(−50).x'); near(S4[0][1], 17073.563792, 1e-6, 'satAt(−50).y');
  const R = S4.map((s) => dist(s, r));
  [22990.538363, 20474.344519, 20690.031588, 23494.453883].forEach((v, i) => near(R[i], v, 1e-6, `range ${i}`));
  [76.688181, 68.295062, 69.014517, 78.369063].forEach((v, i) => near(R[i] / C_KM_S * 1e3, v, 1e-6, `light-time ${i}`));
  const rho = pseudoranges(S4, r, b);
  [23290.330821, 20774.136977, 20989.824046, 23794.246341].forEach((v, i) => near(rho[i], v, 1e-6, `rho ${i}`));
  const g = solveGN(S4, rho);
  if (!g.converged || g.iters !== 6) fail('GN(4) should converge in 6');
  near(g.x, 0, 1e-8, 'GN x'); near(g.y, R_EARTH, 1e-8, 'GN y'); near(g.b, b, 1e-8, 'GN b');
  const H = g.history.map((h) => h.rms);
  near(H[0], 4553, 1, 'rms0'); near(H[1], 603.7, 0.1, 'rms1'); near(H[2], 22.70, 0.01, 'rms2');
  near(H[3], 0.02996, 1e-4, 'rms3'); near(H[4], 5.5e-8, 5e-9, 'rms4'); if (!(H[5] < 1e-10)) fail('rms5 at the float floor');
  const g3 = solveGN(S4.slice(0, 3), rho.slice(0, 3));
  near(g3.x, 0, 1e-8, 'GN3 x'); near(g3.y, R_EARTH, 1e-8, 'GN3 y'); near(g3.b, b, 1e-8, 'GN3 b');
  const B3 = bancroft2D(S4.slice(0, 3), rho.slice(0, 3));
  const cz = B3.find((s) => s.causal), gh = B3.find((s) => !s.causal);
  if (!cz || !gh) fail('Bancroft should give one causal and one acausal root');
  near(cz.x, 0, 1e-7, 'B causal x'); near(cz.y, R_EARTH, 1e-7, 'B causal y'); near(cz.b, b, 1e-7, 'B causal b');
  near(gh.x, 38.3332, 1e-3, 'ghost x'); near(gh.y, -10475.9950, 1e-3, 'ghost y'); near(gh.b, 57562.1795, 1e-3, 'ghost b');
  S4.slice(0, 3).forEach((s, i) => near(rho[i] - gh.b, -dist([gh.x, gh.y], s), 1e-6, `ghost on past cone ${i}`));
  const gh4 = bancroft2D(S4, rho).find((s) => !s.causal);
  near(gh4.x, -29.9527, 1e-3, 'ghost4 x'); near(gh4.y, -10188.5404, 1e-3, 'ghost4 y');
  const D = dop2D(S4, r);
  near(D.gdop, 2.564258, 1e-6, 'GDOP'); near(D.pdop, 2.125658, 1e-6, 'PDOP'); near(D.tdop, 1.434224, 1e-6, 'TDOP');
  near(dop2D(S4.slice(0, 3), r).gdop, 5.712405, 1e-6, 'GDOP3');
  near(dop2D([-5, 0, 5, 10].map((d) => satAt(d)), r).gdop, 107.6826, 1e-3, 'GDOP bunched');
  const E = errorEllipse(D, 1);
  near(E.major ** 2 + E.minor ** 2, D.pdop ** 2, 1e-9, 'ellipse axes carry PDOP');
  const cr = clockRate();
  near(cr.net, 4.4647e-10, 5e-15, 'net rate (Ashby eq. 35)');
  near(usPerDay(cr.grav), 45.7884, 1e-4, 'grav μs/day'); near(usPerDay(cr.vel), -7.2131, 1e-4, 'vel μs/day');
  near(usPerDay(cr.net), 38.5753, 1e-4, 'net μs/day'); near(cr.net * 86400 * C_KM_S, 11.5646, 1e-4, 'km of range per day');
  near(F0 * (1 - FACTORY), 10229999.99543, 1e-5, 'factory frequency (Ashby eq. 36)');
  near(L1 * cr.net, 0.70338, 1e-5, 'L1 beat'); near(L1 * cr.grav, 0.83491, 1e-5, 'L1 grav'); near(L1 * cr.vel, -0.13152, 1e-5, 'L1 vel');
  near(relBeatHz(), 0.70338, 1e-5, 'relBeatHz'); near(relBeatHz({ detuned: true }), 0, 1e-5, 'tempered beat');
  near(eccAmplitudeNs(0.01), 22.897, 1e-3, 'eccentricity amplitude'); near(eccTermKm(0.01, 1) * 1e3, 6.8645, 1e-4, 'ecc metres');
  near(orbitalSpeed(), 3.8738, 1e-4, 'orbital speed');
  // common drift is invisible to position; it moves only the clock
  const day = cr.net * 86400 * C_KM_S;
  const gd = solveGN(S4, pseudoranges(S4, r, b, [day, day, day, day]));
  if (!(dist([gd.x, gd.y], r) < 1e-9)) fail('common drift moved the fix');
  near((gd.b - b) / US_KM, -38.575293, 1e-6, 'common drift shifts only the clock');
  const sinE = [1, -1, 0.5, -0.3];
  const ge = solveGN(S4, pseudoranges(S4, r, b, sinE.map((s) => day + eccTermKm(0.01, s))));
  near(dist([ge.x, ge.y], r) * 1e3, 8.6136, 1e-3, 'eccentricity moves the fix');
  const rf = relativityFix(S4, r, b, { days: 1, e: 0.01, sinE });
  near(rf.posErrKm * 1e3, 8.6136, 1e-3, 'relativityFix');
  // integrity: a 30 km lie
  const rf4 = rho.slice(); rf4[2] += 30;
  const gr4 = solveGN(S4, rf4), e4 = residuals(S4, rf4, gr4);
  [5.3794, -12.6779, 12.8273, -5.5288].forEach((v, i) => near(e4[i], v, 1e-4, `residual ${i}`));
  near(dist([gr4.x, gr4.y], r), 30.2643, 1e-4, 'forged fix, 4 sats');
  const gr3 = solveGN(S4.slice(0, 3), rf4.slice(0, 3));
  if (!(rmsOf(residuals(S4.slice(0, 3), rf4.slice(0, 3), gr3)) < 1e-9)) fail('3-sat lie should be invisible');
  near(dist([gr3.x, gr3.y], r), 55.4002, 1e-4, 'forged fix, 3 sats');
  const S5 = [...S4, satAt(72)], rho5 = pseudoranges(S5, r, b); rho5[2] += 30;
  const ex = exclusionTest(S5, rho5);
  if (!(ex[2] < 1e-9 && ex.every((v, i) => i === 2 || v > 1))) fail('exclusion should name the liar');
  // Euclid I.1 in orbit: the second cut
  const cc = circleCircle(S4[1], R[1], S4[2], R[2]).map((p) => Math.hypot(p[0], p[1])).sort((a, q) => a - q);
  near(cc[0], 6371.000, 1e-6, 'near cut'); near(cc[1], 44300.718, 1e-3, 'ghost cut');
  // wrong clock → triangle; right clock → a point
  const T1 = circleTriangle(S4.slice(0, 3), rho.slice(0, 3).map((p) => p - (b - 300)));
  if (!(T1.ok && T1.size > 150 && T1.size < 400)) fail('1 ms of error should leave a triangle hundreds of km wide');
  const T0 = circleTriangle(S4.slice(0, 3), rho.slice(0, 3).map((p) => p - b));
  if (!(T0.ok && T0.size < 1e-6)) fail('the right clock closes the triangle');
  near(VIS_DEG, 76.1219, 1e-4, 'visibility angle');
  const zen = dist(satAt(0), r) / C_KM_S * 1e3, hor = dist(satAt(VIS_DEG), r) / C_KM_S * 1e3;
  near(zen, 67.349, 1e-3, 'zenith light-time'); near(hor, 86.014, 1e-3, 'horizon light-time');
  // sonification ladder
  const steps = H.slice(0, 5).map(rmsStep);
  if (steps.join() !== '10,9,8,5,0') fail('rms ladder ' + steps.join());
  if (niceStep(0.37) !== 0.2 || niceStep(7) !== 5 || niceStep(1000) !== 1000) fail('niceStep');
  if (fmtLen(4552.58) !== '4,553 km' || fmtLen(0.02996) !== '30.0 m' || fmtLen(-12.68, true) !== '−12.7 km') fail('fmtLen ' + fmtLen(0.02996));
  if (sci(5.5e-8) !== '5.5 × 10⁻⁸') fail('sci');
  if (solveLinear([[1, 2], [2, 4]], [1, 2]) !== null) fail('singular solve');
  // independent cross-checks (verification pass): each recomputes a result by another route
  S4.forEach((s, i) => { const d = [-50, -15, 20, 55][i] * Math.PI / 180; near(R[i], Math.sqrt(A_GPS ** 2 + R_EARTH ** 2 - 2 * A_GPS * R_EARTH * Math.cos(d)), 1e-8, `range ${i} by the law of cosines`); });
  {
    const Hm = S4.map((s) => { const d = dist(s, r); return [(r[0] - s[0]) / d, (r[1] - s[1]) / d, 1]; });
    const M = [0, 1, 2].map((p) => [0, 1, 2].map((q) => Hm.reduce((t, h) => t + h[p] * h[q], 0)));
    const [[a1, b1, c1], [d1, e1, f1], [g1, h1, i1]] = M;
    const det = a1 * (e1 * i1 - f1 * h1) - b1 * (d1 * i1 - f1 * g1) + c1 * (d1 * h1 - e1 * g1);
    near(Math.sqrt(((e1 * i1 - f1 * h1) + (a1 * i1 - c1 * g1) + (a1 * e1 - b1 * d1)) / det), D.gdop, 1e-9, 'GDOP by the adjugate');
  }
  const spread = dop2D([-72, -24, 24, 72].map((d) => satAt(d)), r).gdop;
  near(spread, 1.6205, 1e-4, 'the “spread them” preset');
  if (!(spread < 2 && dop2D([-5, 0, 5, 10].map((d) => satAt(d)), r).gdop > 20)) fail('part IV presets must reach both goals');
  near(cr.net, -(3 * GM / (2 * A_GPS * 1000 * C_M_S ** 2) + PHI0_C2), 1e-18, 'net rate in Ashby’s form −(3GM/2ac² + Φ₀/c²)');
  near(2 * Math.PI * Math.sqrt((A_GPS * 1000) ** 3 / GM) / 3600, 11.967, 1e-3, 'orbital period, half a sidereal day');
  // with four satellites Bancroft is a least-squares fit: its second root only comes near the past cones
  const missAt = (n) => { const R_ = bancroft2D(S4.slice(0, n), rho.slice(0, n)).find((s) => !s.causal); return Math.max(...S4.slice(0, n).map((s, i) => Math.abs((R_.b - rho[i]) - dist([R_.x, R_.y], s)))); };
  if (!(missAt(3) < 1e-6 && missAt(4) > 1)) fail('Bancroft second root: exact on 3 cones, only near 4');
  for (let d = -60; d <= 60; d += 5) {             // part I: P′ always lies beyond the orbit
    const rr = [R_EARTH * Math.sin(d * Math.PI / 180), R_EARTH * Math.cos(d * Math.PI / 180)];
    const far = Math.max(...circleCircle(S4[1], dist(S4[1], rr), S4[2], dist(S4[2], rr)).map((p) => Math.hypot(p[0], p[1])));
    if (!(far > A_GPS)) fail(`P′ inside the orbit at ${d}°`);
  }
  return true;
}

/* ================= metadata ================= */

const PROSE = `
    <p>Somewhere above you, about 20,200 kilometres up, a satellite is saying two things over
    and over: where it is, and what time it is. The message travels at the speed of light,
    299,792.458 kilometres a second, and reaches you between about 67 and 86 thousandths of a
    second later, depending on how high the satellite stands in your sky. Multiply the delay by
    the speed of light and you have a distance. Draw that distance around the satellite and you
    have a circle with you somewhere on it. A second satellite draws a second circle, and the
    two cut one another in two points, exactly as the circles of Euclid’s first proposition do
    in <a href="#ex-twotools">The Two Tools</a>. One point is you. The other hangs in space
    beyond the satellites, and nothing in the circles tells the two apart. Only your knowledge
    that you stand on the Earth throws it out.</p>
    <p>A receiver cannot measure that delay directly. The satellites carry atomic clocks; the
    receiver keeps time with an inexpensive clock that drifts, so it never quite knows when it
    heard what it heard, and one millisecond of doubt is 299.792 kilometres of light. Every
    measured distance is then wrong, and wrong by the same unknown amount. Engineers call such
    distances <em>pseudoranges</em>, and the cure is one more circle. On the flat slice below,
    where circles stand in for spheres, two coordinates and a clock need three satellites. In
    space, with three coordinates and a clock, a receiver needs four: in Neil Ashby’s words,
    the local clock bias “is the reason why measurements from four satellites are needed for
    navigation.” The clock error is not thrown away but solved for, so a receiver that knows
    where it is also knows what time it is.</p>
    <p>Position has been a matter of time since Britain’s Longitude Act of 1714 offered money
    for a way to find a ship’s longitude at sea. The Earth turns fifteen seconds of arc in a
    second of time, so at the equator a second of clock error cost about 464 metres; for a
    satellite receiver it costs 299,792 kilometres. The modern answer began as eavesdropping.
    On the Monday after Sputnik’s launch on 4 October 1957, William Guier and George
    Weiffenbach of the Johns Hopkins Applied Physics Laboratory tuned a 20-megahertz receiver
    to the satellite. Its signal had been set about a kilohertz off 20 megahertz, so it came out
    as an audible tone, “varying from about 1500 Hz to about 500 Hz” as it passed, and from
    that Doppler slide alone they worked out its orbit. On 17 March 1958 Frank McClure called
    them into his office and asked whether they could invert the solution: from a known orbit,
    find the listener. That question became Transit, and its first experimental navigation
    satellite, Transit 1B, reached orbit on 13 April 1960, two months after Eugene Wigner
    published his essay on the unreasonable effectiveness of mathematics. Navstar 1, the first
    GPS satellite, followed on 22 February 1978.</p>
    <p>How does a receiver find where the circles meet? It guesses and corrects. Near the guess
    each circle is almost a straight line, so the receiver swaps circles for lines, solves the
    small linear problem by least squares (the method Gauss published in 1809, which Legendre
    had printed a few years before), and repeats. Press <em>solve</em> below and the misfit
    falls from 4,553 kilometres to 604, then 22.7, then 0.030, then 0.000000055. Once the
    guess is close, the number of correct digits roughly doubles at every step. In 1985 Stephen
    Bancroft published an algebraic solution instead. Squared, each pseudorange equation says
    that emission and reception are joined by a ray of light, which is most naturally written
    with the Lorentz inner product, the indefinite geometry of Minkowski’s spacetime. The
    algebra usually returns two roots. One is you. The other is an event at which every signal would
    arrive before it was sent, on the past light cone of each emission: Euclid’s second point
    again, now in spacetime. Whether such equations have one sensible answer or two became a
    question in its own right, the subject of a 1991 paper by J. S. Abel and J. W. Chaffee on
    the existence and uniqueness of GPS solutions.</p>
    <p>Then the receiver has to ask Einstein. A clock higher in Earth’s gravity runs faster, and
    a moving clock runs slower. In a GPS orbit the first effect gains about 45.8 microseconds a
    day and the second loses about 7.2, a net fractional rate that Ashby gives as 4.4647 parts
    in 10¹⁰: about 38.6 microseconds a day, or 11.6 kilometres of light. So each satellite
    clock is built slow. It is set on the ground to 10.22999999543 megahertz instead of 10.23,
    so that in orbit it keeps the right time, a temperament like the one that shaves every fifth
    so that the <a href="#ex-fifths">spiral of fifths</a> can close. The shift was measured
    before the first GPS satellite flew. NTS-2, launched on 23 June 1977, ran its cesium clock
    for about twenty days before the correction was switched on and measured +442.5 parts in
    10¹² against clocks on the ground. General relativity had predicted +446.5.</p>
    <p>What would an uncorrected drift ruin? In the equations, mostly time. A lead shared by
    every satellite is swallowed whole by the receiver’s clock unknown, and in the fifth part of
    the stage the fix stays put while the solved time slides by 38.6 microseconds a day. What
    moves the fix is whatever differs from satellite to satellite, such as the extra term for a
    slightly elliptical orbit, about 23 nanoseconds at an eccentricity of 0.01, a correction
    that, Ashby writes, “must be made by the receiver.” The spare circle buys one more thing.
    With more satellites than unknowns, a forged range no longer fits the others and shows up as
    a leftover, a residual, the quantity Bradford Parkinson and Penina Axelrad’s 1988 paper on
    autonomous integrity monitoring is built on. That is the last part of the stage.</p>`;

const TODAY = `
    <p>Every fix is still circles and a clock. The U.S. Coast Guard’s status table lists about
    thirty GPS satellites, in six orbital planes some 20,200 kilometres up, and Europe’s Galileo
    (orbiting at 23,222 kilometres), Russia’s GLONASS and China’s BeiDou share the sky with
    them. Because a receiver solves for time as well as place, every phone that takes a fix is
    also a clock set by the sky. A 2019 RTI International study put the economic benefits of GPS
    to the United States alone, since civilian use began in the 1980s, at roughly $1.4 trillion
    in 2017 dollars.</p>
    <p>The engine also works as an instrument. In December 2018 a team led by Pacôme Delva at
    SYRTE in Paris used two Galileo satellites that a faulty Soyuz upper stage had stranded on
    eccentric orbits in 2014, climbing and falling some 8,500 kilometres twice a day, to confirm
    Einstein’s gravitational redshift to (0.19 ± 2.48) × 10⁻⁵, 5.6 times better than Gravity
    Probe A in 1976; a second team, at ZARM in Bremen, reported in parallel. At 2 a.m. EST on
    3 March 2025, LuGRE, a receiver from NASA and the Italian Space Agency riding Firefly’s Blue
    Ghost lander, acquired GPS signals on the surface of the Moon, about 225,000 miles from
    Earth.</p>
    <p>The circles can also be forged. In July 2026 the European Union Aviation Safety Agency
    revised its bulletin on the jamming and spoofing of satellite navigation. Such interference
    has been rising since February 2022, and it has shown a “further increase in the severity of
    its impact” around the south and eastern Mediterranean, the Black Sea, the Middle East, the
    Baltic Sea and the Arctic. Spoofing, which leads receivers to “compute incorrect position,
    navigation, and timing” data, may be harder for crews to detect than jamming. One defence is
    on this stage: carry more circles than you need and a single lie shows up as a residual. A
    forger who fakes every satellite consistently leaves none.</p>`;

const CHRONICLE = [
  { year: 1714, date: '1714', text: 'Britain’s Longitude Act offers money for a way to find a ship’s longitude at sea; John Harrison’s sea watch H4 is later judged to have kept time “within the most stringent limits of the 1714 Act”, and position becomes a matter of <em>time</em>.' },
  { year: 1957, date: 'October 1957', text: 'Days after Sputnik 1’s launch on 4 October, William Guier and George Weiffenbach at the Johns Hopkins Applied Physics Laboratory hear its tone slide from about 1,500 to about 500 hertz, and begin to deduce its orbit from the Doppler shift alone.' },
  { year: 1960, date: '13 April 1960', text: 'Transit 1B, the first experimental navigation satellite in orbit, is launched from Cape Canaveral; the U.S. Navy’s Transit system grew from Frank McClure’s 1958 question of whether a known orbit could locate its listener.' },
  { year: 1977, date: '23 June 1977', text: 'NTS-2, a forerunner of GPS, is launched; run for about twenty days before its relativity correction is switched on, its cesium clock gains +442.5 parts in 10¹² on ground clocks, against the +446.5 general relativity predicts.' },
  { year: 1978, date: '22 February 1978', text: 'Navstar 1, the first Block I GPS satellite, is launched on an Atlas F.' },
  { year: 1985, date: 'January 1985', text: 'Stephen Bancroft publishes an algebraic, closed-form solution of the GPS pseudorange equations; it usually returns two roots, only one of them a sensible position near the Earth.' },
  { year: 2000, date: '1 May 2000', text: 'The United States announces an end to Selective Availability, the deliberate degrading of civilian GPS, “beginning at midnight tonight”; civilians can now “pinpoint locations up to ten times more accurately”.' },
  { year: 2025, date: '3 March 2025', text: 'LuGRE, a NASA and Italian Space Agency receiver aboard Firefly’s Blue Ghost lander, acquires GPS signals on the surface of the Moon, about 225,000 miles from Earth.' },
];

const SOURCES = [
  { text: 'Neil Ashby, “Relativity in the Global Positioning System”, <em>Living Reviews in Relativity</em> 6:1 (2003)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5253894/' },
  { text: 'William H. Guier & George C. Weiffenbach, “Genesis of Satellite Navigation”, <em>Johns Hopkins APL Technical Digest</em> 19(1):14–17 (1998)', url: 'https://secwww.jhuapl.edu/techdigest/Content/techdigest/pdf/V19-N01/19-01-Guier.pdf' },
  { text: 'Stephen Bancroft, “An Algebraic Solution of the GPS Equations”, <em>IEEE Trans. Aerospace and Electronic Systems</em> AES-21(1):56–59 (1985)', url: 'https://doi.org/10.1109/TAES.1985.310538' },
  { text: 'J. S. Abel & J. W. Chaffee, “Existence and uniqueness of GPS solutions”, <em>IEEE Trans. Aerospace and Electronic Systems</em> 27(6):952–956 (1991)', url: 'https://doi.org/10.1109/7.104271' },
  { text: 'Bradford W. Parkinson & Penina Axelrad, “Autonomous GPS Integrity Monitoring Using the Pseudorange Residual”, <em>Navigation</em> 35(2):255–274 (1988)', url: 'https://doi.org/10.1002/j.2161-4296.1988.tb00955.x' },
  { text: 'P. Delva et al., “Gravitational Redshift Test Using Eccentric Galileo Satellites”, <em>Physical Review Letters</em> 121, 231101 (2018)', url: 'https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.121.231101' },
  { text: 'NASA, “NASA Successfully Acquires GPS Signals on Moon” (2025)', url: 'https://www.nasa.gov/directorates/somd/space-communications-navigation-program/nasa-successfully-acquires-gps-signals-on-moon/' },
  { text: 'EASA Safety Information Bulletin 2022-02R4, “Global Navigation Satellite System Outage and Alterations Leading to Communication / Navigation / Surveillance Degradation” (3 July 2026, corrected 22 July 2026)', url: 'https://ad.easa.europa.eu/ad/2022-02R4' },
  { text: 'The White House, “Statement by the President regarding the United States’ Decision to Stop Degrading Global Positioning System Accuracy” (1 May 2000)', url: 'https://clintonwhitehouse4.archives.gov/WH/EOP/OSTP/html/0053_2.html' },
  { text: 'Royal Museums Greenwich, “Harrison’s clocks and the longitude problem”', url: 'https://www.rmg.co.uk/stories/time/harrisons-clocks-longitude-problem' },
];

const ALT = 'A to-scale slice through the Earth with navigation satellites on their orbit. Their range circles cut one another at the receiver, and a round lens beside the picture magnifies the meeting point from thousands of kilometres down to centimetres, in six parts: two circles, a lying clock, the solver, geometry, relativity and a forged signal.';

const CAPTION =
  'A flat slice through the Earth’s centre, drawn to scale. Circles stand in for spheres, so three satellites ' +
  'do here what four do in space, and the satellites are frozen during each fix (real ones move nearly four ' +
  'kilometres a second). The lens magnifies the neighbourhood of the answer; its scale bar and magnification ' +
  'are live. Sound: clicks arrive after the real light delays (slowed ×20 if you choose), the solver sings one ' +
  'scale step lower for every factor of ten its misfit falls, and the relativity beat is the real L1 rate ' +
  'difference, played around a stand-in pitch of 440 Hz.';

const LEGEND =
  '<p>A favourite line about GPS says that without relativity “errors in global positions would continue to ' +
  'accumulate at a rate of about 10 kilometers each day,” as Richard Pogge’s Ohio State lecture notes put it. ' +
  'The arithmetic behind it is sound: 38.6 microseconds a day is 11.6 kilometres of light. But that is a ' +
  '<em>range</em>, not a position. A lead shared by every satellite is exactly what the receiver’s own clock ' +
  'unknown absorbs, and in the fifth part of the stage the fix does not move by a millimetre while the solved ' +
  'time slides. What relativity threatens first is time, and then every term that differs between satellites, ' +
  'like the eccentricity correction. In practice the navigation message also carries clock corrections, so that ' +
  'in effect each satellite keeps close to the U.S. Naval Observatory’s reference clocks. None of this makes relativity ' +
  'optional: without it, Ashby writes, “the system would not work.”</p>' +
  '<p>Two smaller myths. GPS does not triangulate: it measures no angles, only times of flight, and finds where ' +
  'the distances agree, which surveyors call trilateration. And the satellites do not track you. Ranging runs ' +
  'one way: the satellites broadcast, the receiver listens and solves, and nothing is sent back.</p>';

const SPEC =
  '<p>Run this exhibit backwards and the correction becomes a measurement. A clock’s rate reports how deep it ' +
  'sits in the Earth’s gravity, so a good enough clock is also a level. In September 2010 physicists at NIST ' +
  'raised one aluminium-ion clock about a third of a metre above another, saw the higher one run faster, and ' +
  'suggested that clocks might one day measure heights to about a centimetre. Whether networks of such clocks ' +
  'will map the Earth’s gravity field, and whether the signals LuGRE heard on the Moon will guide the landers ' +
  'that follow it, as NASA hopes, is not settled. Those are forecasts, not results.</p>';

const BEATS = [
  { num: 'I', name: 'two circles', next: 'the lying clock' },
  { num: 'II', name: 'the lying clock', next: 'let the sky solve it' },
  { num: 'III', name: 'let the sky solve it', next: 'geometry is destiny' },
  { num: 'IV', name: 'geometry is destiny', next: 'Einstein’s temperament' },
  { num: 'V', name: 'Einstein’s temperament', next: 'a liar in the sky' },
  { num: 'VI', name: 'a liar in the sky', next: null },
];

const GLOSS = [
  '<p>Each circle is every place at one distance from one satellite, the curve Euclid’s compass draws. Two ' +
  'circles cut twice, as in Proposition I.1, and the algebra has no reason to prefer either cut. Receivers throw ' +
  'out the far one the way you would: it is nowhere near the Earth.</p>' +
  '<p>In space the circles are spheres. Two spheres meet in a circle, and a third sphere cuts that circle in two ' +
  'points, mirror images across the plane of the three satellites, one of them far out in space. The count is ' +
  'always one more than it looks.</p>',
  '<p>Every circle is drawn with radius <em>ρ − c·δt̂</em>: the measured pseudorange minus your guess for your ' +
  'clock’s error. Change the guess and all three circles grow or shrink together, because one clock is to blame ' +
  'for all of them. Only the true error makes them meet.</p>' +
  '<p>A microsecond of clock error is 300 metres of light, so the circles close only when your guess is within ' +
  'about a microsecond. With three coordinates to find in space, the same search needs a fourth satellite.</p>',
  '<p>Each step linearizes. Near the current guess every circle is replaced by its tangent line, and the ' +
  'receiver solves those lines for the corrections to <em>x</em>, <em>y</em> and <em>c·δt</em> by least squares. ' +
  'The lens zooms to the size of the remaining misfit: watch its magnification climb.</p>' +
  '<p>Close to the answer the error is roughly squared at each step, so the correct digits double: 22.7 km, then ' +
  '30 m, then 0.055 mm. The last steps meet the limit of double-precision arithmetic.</p>' +
  '<p>The closed form squares each equation, and squaring cannot tell a signal that arrived after it was sent ' +
  'from one that arrived before. So a second root appears, on the past light cone of every emission. Tilt into ' +
  'spacetime to see both roots: the range circles are slices of light cones.</p>' +
  '<p>With three satellites the second root lies exactly on all three past cones. With four, Bancroft’s formula ' +
  'becomes a least-squares fit: the true root still fits every circle, but the second one only comes near the ' +
  'cones.</p>',
  '<p>Dilution of precision turns range noise into position noise. GDOP is the square root of the trace of ' +
  '(HᵀH)⁻¹, where each row of H holds a line-of-sight direction and a 1 for the clock. Satellites bunched in one ' +
  'part of the sky give nearly parallel rows, and the solution can slide along whatever direction they fail to ' +
  'pin down.</p>' +
  '<p>The spokes in the lens point toward the satellites. The ellipse is the 1σ region for one metre of range ' +
  'noise, magnified to fit; watch it swell and turn as the spokes crowd together. In the ledger, a satellite’s ' +
  'orbit angle is measured at the Earth’s centre from your zenith, and its elevation is how high it stands ' +
  'above your horizon.</p>',
  '<p>The chart shows how far a satellite clock runs ahead of a ground clock, day by day. Gravity pushes it ahead ' +
  'by about 45.8 μs a day, speed holds it back by about 7.2, and the factory temperament removes Ashby’s ' +
  '4.4647 × 10⁻¹⁰ before launch.</p>' +
  '<p>A lead shared by all four clocks shortens every pseudorange by the same amount, and the receiver’s clock ' +
  'unknown takes it up. The crimson circles are the ones a receiver would draw if it knew its own clock error ' +
  'exactly and took the satellites’ clocks at their word. The eccentricity term differs from satellite to ' +
  'satellite, so it cannot hide.</p>' +
  '<p>The beat you can play is the real L1 figure, 1575.42 MHz times the rate: 0.70 Hz with both effects, 0.83 Hz ' +
  'with gravity alone, silence once tempered. Only the carrier pitch, 440 Hz, is a stand-in.</p>',
  '<p>A residual is what is left of each pseudorange after the best fix is subtracted. With exactly as many ' +
  'satellites as unknowns nothing is left over, so any lie, however large, is absorbed into a wrong position and ' +
  'a wrong clock.</p>' +
  '<p>One spare satellite makes a fault <em>detectable</em>; two make it <em>identifiable</em>. Leave each ' +
  'satellite out in turn, and only the subset without the liar fits exactly. That is the arithmetic of receiver ' +
  'autonomous integrity monitoring, and a spoofer who forges every signal consistently gets past it.</p>',
];

export default {
  id: 'whereami',
  movement: 4,
  title: 'One More Circle',
  hook: 'Euclid needed two circles to find a point. A satellite receiver needs one more, because its own clock is lying, and then it has to ask Einstein.',
  era: '1714–2026 · from the Longitude Act to GPS on the Moon',
  prose: PROSE,
  chronicle: CHRONICLE,
  today: TODAY,
  sources: SOURCES,
  alt: ALT,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const V = P.verdigris;                        // Movement IV's pigment (core/canvas.js v2 palette)
    const CB = P.crimsonBright;                   // crimson legible as small text
    const SERIF = getComputedStyle(document.body).fontFamily || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const TAU = Math.PI * 2;
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const perfNow = () => performance.now() / 1000;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const rgba = (hex, a) => {
      const n = parseInt(hex.slice(1, 7), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };
    const mk = (tag, cls, parent, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      if (parent) parent.appendChild(e);
      return e;
    };

    /* ---------- scoped styles ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-whereami .wa-tabs{display:flex;flex-wrap:wrap;gap:0 .15rem;margin:.9rem 0 .8rem;border-bottom:1px solid ${P.line}}
      #ex-whereami .wa-tab{appearance:none;-webkit-appearance:none;background:none;border:0;border-bottom:2px solid transparent;
        margin:0 0 -1px;color:${P.inkDim};font:inherit;font-size:.84rem;line-height:1.25;padding:.5rem .62rem .42rem;cursor:pointer;
        white-space:nowrap;transition:color .2s,border-color .2s}
      #ex-whereami .wa-tab:hover{color:${P.ink}}
      #ex-whereami .wa-tab[aria-selected="true"]{color:${P.ink};border-bottom-color:${V}}
      #ex-whereami .wa-tab:focus-visible{outline:2px solid ${P.goldBright};outline-offset:1px;border-radius:3px}
      #ex-whereami .wa-num{color:${P.gold};margin-right:.42em;font-variant-numeric:lining-nums;letter-spacing:.05em}
      #ex-whereami .wa-check{color:${V};margin-left:.42em;font-size:.8em;opacity:0;transition:opacity .3s}
      #ex-whereami .wa-tab.done .wa-check{opacity:1}
      @media (max-width:520px){#ex-whereami .wa-tabs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 .5rem}
        #ex-whereami .wa-tab{white-space:normal;text-align:left;padding:.45rem .3rem .4rem}}
      #ex-whereami .wa-plate{position:relative}
      #ex-whereami .wa-plate canvas{display:block;touch-action:pan-y}
      #ex-whereami .controls .wa-next{margin-left:auto}
      #ex-whereami .wa-lower{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:1rem 1.5rem;margin:1.1rem 0 .5rem;align-items:start}
      @media (max-width:760px){#ex-whereami .wa-lower{grid-template-columns:minmax(0,1fr)}}
      #ex-whereami .wa-ledger{background:${P.panel};border:1px solid ${P.line};border-left:3px solid ${V};border-radius:0 6px 6px 0;
        padding:.8rem 1rem .9rem;min-width:0}
      #ex-whereami .wa-h{font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;color:${V};margin:0 0 .6rem;font-weight:600}
      #ex-whereami .wa-gloss .wa-h{color:${P.inkDim}}
      #ex-whereami .wa-tblw{overflow-x:auto;max-width:100%}
      #ex-whereami table.wa-tbl{border-collapse:collapse;width:100%;font-family:${MONO};font-size:.75rem;
        font-variant-numeric:lining-nums tabular-nums;color:${P.ink}}
      #ex-whereami .wa-tbl th{font-weight:400;font-size:.64rem;letter-spacing:.08em;color:${P.inkFaint};text-align:right;
        padding:0 .5rem .32rem;border-bottom:1px solid ${P.line};white-space:nowrap}
      #ex-whereami .wa-tbl td{text-align:right;padding:.22rem .5rem;white-space:nowrap}
      #ex-whereami .wa-tbl td:first-child,#ex-whereami .wa-tbl th:first-child{text-align:left;padding-left:0}
      #ex-whereami .wa-tbl td:last-child,#ex-whereami .wa-tbl th:last-child{padding-right:0}
      #ex-whereami .wa-tbl .s{font-family:${SERIF};font-style:italic;font-size:.95rem;color:${P.goldBright}}
      #ex-whereami .wa-tbl tr.dim td{color:${P.inkFaint}}
      #ex-whereami .wa-tbl tr.now td{color:${P.goldBright}}
      #ex-whereami .wa-tbl tr.bad td,#ex-whereami .wa-tbl tr.bad td .s{color:${CB}}
      #ex-whereami .wa-tbl tr.good td{color:${V}}
      @media (max-width:520px){#ex-whereami .wa-tbl .hx{display:none}#ex-whereami .wa-tbl td,#ex-whereami .wa-tbl th{padding-left:.3rem;padding-right:.3rem}}
      #ex-whereami .wa-sum{margin:.65rem 0 0;font-size:.86rem;line-height:1.58;color:${P.inkDim}}
      #ex-whereami .wa-sum em{color:${P.goldBright}}
      #ex-whereami .wa-sum .v{color:${V}}
      #ex-whereami .wa-sum .c{color:${CB}}
      #ex-whereami .wa-sum .m{font-family:${MONO};font-size:.8rem;color:${P.ink};font-variant-numeric:lining-nums tabular-nums}
      #ex-whereami .wa-sum .m.v{color:${V}}
      #ex-whereami .wa-gloss{min-width:0}
      #ex-whereami .wa-gloss-body p{margin:0 0 .7rem;font-size:.9rem;line-height:1.62;color:${P.inkDim}}
      #ex-whereami .wa-gloss-body em{color:${P.ink}}
      #ex-whereami .wa-chart{margin:0 0 .8rem;border:1px solid ${P.line};border-radius:5px;background:rgba(0,0,0,.2);overflow:hidden}
      #ex-whereami .wa-chart canvas{display:block}`;
    stage.appendChild(styleEl);

    /* ---------- DOM ---------- */
    const banner = ui.questBanner(stage, '');
    const tabs = mk('div', 'wa-tabs', stage);
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'The six parts of the exhibit');
    const tabBtns = BEATS.map((bt, k) => {
      const b = mk('button', 'wa-tab', tabs,
        `<span class="wa-num">${bt.num}</span>${bt.name}<span class="wa-check" aria-hidden="true">✓</span>`);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => setBeat(k));
      return b;
    });
    const plate = mk('div', 'wa-plate', stage);
    const canvasOpts = { get height() { return canvasHeight(); } };
    const handle = cv.setupCanvas(plate, canvasOpts);
    const canvas = handle.canvas;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', ALT);
    const rows = BEATS.map(() => { const r = ui.controlRow(stage); r.style.display = 'none'; return r; });
    const listenRow = ui.controlRow(stage);
    const lower = mk('div', 'wa-lower', stage);
    const ledger = mk('div', 'wa-ledger', lower);
    mk('div', 'wa-h', ledger, 'the receiver’s ledger');
    const ledgerBody = mk('div', null, ledger);
    const glossEl = mk('div', 'wa-gloss', lower);
    mk('div', 'wa-h', glossEl, 'in the margin');
    const chartWrap = mk('div', 'wa-chart', glossEl);
    const chart = cv.setupCanvas(chartWrap, { height: 158 });
    const glossBody = mk('div', 'wa-gloss-body', glossEl);
    ui.mathline(stage, 'ρ<sub>i</sub> = |r − s<sub>i</sub>| + c·δt &nbsp;·&nbsp; unknowns x, y, c·δt &nbsp;(in space: x, y, z, c·δt)');
    ui.caption(stage, CAPTION);
    ui.legendPanel(stage, LEGEND);
    ui.speculationPanel(stage, SPEC);

    /* ---------- state ---------- */
    const SAT0 = [-15, 20, -50, 55, 72];          // A B C D E, degrees from the receiver's zenith
    const NAMES = ['A', 'B', 'C', 'D', 'E'];
    const SIN_E = [-1, 0.5, 1, -0.3, 0.8];        // where each sits on its (slightly) elliptical orbit
    const B_FIX = C_KM_S * 1e-3;                  // 1 ms of receiver clock error, parts III–VI
    let beat = 0;
    let recvDeg = 0;
    const done = BEATS.map(() => false);
    let dirty = true, animUntil = 0;
    const kick = (sec = 0.05) => { animUntil = Math.max(animUntil, perfNow() + sec); dirty = true; };
    const b1 = { wrongAt: -9, claimAt: -9 };
    const b2 = { b: 0, coarse: 0, fine: 0, guessUs: 0, shown: null, closed: false, snap: null, closeAt: -9 };
    const b3 = { n: 4, gn: null, shown: -1, queue: [], clk: null, hopT0: -9, convAt: -9, bancroft: false, spacetime: false, tilt: 0 };
    const b4 = { deg: [-15, 20, -50, 55], sel: 0, phase: 0, glide: null, worst: 0, best: 0 };
    const b5 = { days: 0, gr: true, sr: true, detuned: false, e: 0, eccCorr: false, lapse: null, sound: false, sawDrift: false };
    const b6 = { n: 3, forged: false, sawLie: false };
    let tiltE = 0, lensVis = 1;
    const tauNow = -B_FIX;                        // reception, on the receiver-clock origin (spacetime view)

    /* ---------- geometry of the moment ---------- */
    const recv = () => { const t = recvDeg * Math.PI / 180; return [R_EARTH * Math.sin(t), R_EARTH * Math.cos(t)]; };
    const satDeg = (i) => (beat === 3 && i < 4 ? b4.deg[i] : SAT0[i]);
    const satP = (i) => satAt(satDeg(i));
    function litIdx() {
      if (beat === 0) return [0, 1];
      if (beat === 1) return [0, 1, 2];
      if (beat === 2) return b3.n === 3 ? [0, 1, 2] : [0, 1, 2, 3];
      if (beat === 5) return [0, 1, 2, 3, 4].slice(0, b6.n);
      return [0, 1, 2, 3];
    }
    const drawnIdx = () => (beat === 5 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]);

    function g0() {
      const r = recv(), A = satP(0), B = satP(1);
      const RA = dist(A, r), RB = dist(B, r);
      const cuts = circleCircle(A, RA, B, RB).sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
      return { r, A, B, RA, RB, near: cuts[0] || null, far: cuts[1] || null };
    }
    const sats2 = () => [0, 1, 2].map(satP);
    const rho2 = () => pseudoranges(sats2(), recv(), b2.b);
    const guessKm = () => b2.guessUs * US_KM;
    const target2 = () => rho2().map((p) => p - guessKm());
    const sats3 = () => litIdx().map(satP);
    const rho3 = () => pseudoranges(sats3(), recv(), B_FIX);
    let bancCache = null;
    function roots3() {
      const key = b3.n;
      if (!bancCache || bancCache.key !== key) {
        const S = sats3(), rho = rho3(), rs = bancroft2D(S, rho);
        const ghost = rs.find((s) => !s.causal) || null;
        // how far the second root sits from the past cones: 0 with three satellites; with four,
        // Bancroft's least-squares form leaves it kilometres off them
        const miss = ghost ? Math.max(...S.map((s, i) => Math.abs((ghost.b - rho[i]) - dist([ghost.x, ghost.y], s)))) : 0;
        bancCache = { key, causal: rs.find((s) => s.causal) || null, ghost, onCones: miss < 1e-6, miss };
      }
      return bancCache;
    }
    function iterNow() {                          // displayed iterate, eased along its hop
      if (!b3.gn || b3.shown < 0) return { x: 0, y: 0, b: 0, rms: NaN };
      const H = b3.gn.history, k = b3.shown, cur = H[k];
      if (k === 0) return cur;
      const f = reduced ? 1 : clamp((perfNow() - b3.hopT0) / 0.42, 0, 1);
      const e = 1 - Math.pow(1 - f, 3), prev = H[k - 1];
      return { x: prev.x + (cur.x - prev.x) * e, y: prev.y + (cur.y - prev.y) * e, b: prev.b + (cur.b - prev.b) * e, rms: cur.rms };
    }
    const dop4 = () => dop2D([0, 1, 2, 3].map(satP), recv());
    const memo = (fn, keyFn) => { let k = null, v = null; return () => { const nk = keyFn(); if (nk !== k) { k = nk; v = fn(); } return v; }; };
    const fix5 = memo(() => relativityFix([0, 1, 2, 3].map(satP), recv(), B_FIX, {
      days: b5.days, gr: b5.gr, sr: b5.sr, detuned: b5.detuned, e: b5.e, sinE: SIN_E, eccCorrected: b5.eccCorr,
    }), () => `${beat}|${recvDeg}|${b5.days}|${b5.gr}|${b5.sr}|${b5.detuned}|${b5.e}|${b5.eccCorr}`);
    const fix6 = memo(fix6raw, () => `${beat}|${recvDeg}|${b6.n}|${b6.forged}`);
    function fix6raw() {
      const idx = litIdx(), S = idx.map(satP), rho = pseudoranges(S, recv(), B_FIX);
      if (b6.forged) rho[1] += 30;
      const sol = solveGN(S, rho), res = residuals(S, rho, sol);
      return { idx, S, rho, sol, res, rms: rmsOf(res), err: dist([sol.x, sol.y], recv()), ex: S.length >= 5 ? exclusionTest(S, rho) : null };
    }

    /* ---------- layout: the scene and the lens ---------- */
    let scene = { x: 0, y: 0, w: 100, h: 100 }, lensG = { cx: 0, cy: 0, r: 40 };
    function canvasHeight() {
      const w = Math.max(280, plate.getBoundingClientRect().width || 800);
      if (w >= 640) return Math.round(clamp(w * 0.54, 440, 580));
      const sceneH = Math.round(Math.min(w * 0.96, 480));
      const lr = Math.round(Math.min(w * 0.37, 165));
      return sceneH + lr * 2 + 58;
    }
    function layout() {
      const W = handle.width, H = handle.height;
      if (W >= 640) {
        const col = Math.round(clamp(W * 0.35, 240, 390));
        scene = { x: 0, y: 0, w: W - col * lensVis, h: H };
        lensG = { cx: W - col / 2 - 4, cy: H / 2 - 4, r: Math.max(40, Math.min(col / 2 - 24, H / 2 - 58)) };
      } else {
        const lr = Math.round(Math.min(W * 0.37, 165));
        const sh = H - lr * 2 - 58;
        scene = { x: 0, y: 0, w: W, h: sh + (H - sh) * (1 - lensVis) };
        lensG = { cx: W / 2, cy: sh + 22 + lr, r: lr };
      }
    }

    /* ---------- camera (scene) with an optional spacetime tilt ---------- */
    const cam = { x: 0, y: 11000, s: 0.01, init: false };
    const lens = { x: 0, y: R_EARTH, s: 0.05, init: false };
    function proj0(x, y, tau) {
      if (tiltE <= 0) return [x, y];
      const phi = -0.42 * tiltE, th = 1.1 * tiltE;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const xr = x * cp - y * sp, yr = x * sp + y * cp;
      return [xr, yr * Math.cos(th) + (tau - tauNow) * Math.sin(th)];
    }
    function P3(x, y, tau = tauNow) {
      const [u, v] = proj0(x, y, tau);
      return [scene.x + scene.w / 2 + (u - cam.x) * cam.s, scene.y + scene.h / 2 - (v - cam.y) * cam.s];
    }
    const S2W = (px, py) => [cam.x + (px - scene.x - scene.w / 2) / cam.s, cam.y - (py - scene.y - scene.h / 2) / cam.s];
    const lensPx = (x, y) => [lensG.cx + (x - lens.x) * lens.s, lensG.cy - (y - lens.y) * lens.s];
    const inLens = (p) => lensVis > 0.5 && Math.hypot(p[0] - lensG.cx, p[1] - lensG.cy) < lensG.r - 2;

    function spaceKeys() {                          // events that frame the spacetime view
      const pts = [], S = sats3(), rho = rho3(), r = recv(), R3 = roots3();
      const ring = (c, rad, tau) => { for (let k = 0; k < 8; k++) { const t = k * TAU / 8; pts.push([c[0] + rad * Math.cos(t), c[1] + rad * Math.sin(t), tau]); } };
      ring([0, 0], R_EARTH, tauNow);
      S.forEach((s, i) => { pts.push([s[0], s[1], -rho[i]]); ring(s, rho[i] - B_FIX, tauNow); });
      if (R3.ghost) {
        const tg = -R3.ghost.b;
        pts.push([R3.ghost.x, R3.ghost.y, tg]);
        S.forEach((s, i) => ring(s, -rho[i] - tg, tg));
      }
      pts.push([r[0], r[1], tauNow]);
      return pts;
    }
    function sceneBox() {
      let x0 = -27800, x1 = 27800, y0 = -7700, y1 = 29800;
      if (beat === 0) {
        const g = g0();
        if (g.far) { x0 = Math.min(x0, g.far[0] - 3000); x1 = Math.max(x1, g.far[0] + 3000); y1 = Math.max(y1, Math.min(g.far[1], 90000) + 3200); y0 = Math.min(y0, g.far[1] - 3000); }
      }
      if (beat === 2 && tiltE > 0.001) {
        x0 = y0 = Infinity; x1 = y1 = -Infinity;
        for (const [x, y, t] of spaceKeys()) {
          const [u, v] = proj0(x, y, t);
          x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v);
        }
        const pad = 0.05 * (x1 - x0);
        x0 -= pad; x1 += pad; y0 -= pad * 1.4; y1 += pad;
      } else if (beat === 2 && b3.bancroft) {
        const gh = roots3().ghost;
        if (gh) { y0 = Math.min(y0, gh.y - 2600); x0 = Math.min(x0, gh.x - 3000); x1 = Math.max(x1, gh.x + 3000); }
      }
      return { x0, x1, y0, y1 };
    }
    function fitBox(b) {
      const s = Math.min(scene.w / (b.x1 - b.x0), scene.h / (b.y1 - b.y0)) * 0.93;
      return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, s };
    }
    function lensTarget() {
      const r = recv();
      if (beat === 0) return { x: r[0], y: r[1], F: 1500 };
      if (beat === 1) {
        const T = circleTriangle(sats2(), b2.shown || target2());
        if (!T.ok) return { x: r[0], y: r[1] - 300, F: 2400 };
        if (b2.closed) return { x: r[0], y: r[1], F: Math.max(T.size * 0.8, 0.015) };
        return { x: T.centroid[0], y: T.centroid[1], F: Math.max(T.size * 0.72, 0.015) };
      }
      if (beat === 2) {
        if (!b3.gn || b3.shown < 0) return { x: r[0], y: r[1], F: 1500 };
        const it = iterNow(), H = b3.gn.history, fin = H[H.length - 1];
        return { x: it.x, y: it.y, F: clamp(Math.hypot(it.x - fin.x, it.y - fin.y) * 1.35, 0.012, 9000) };
      }
      if (beat === 3) {
        const D = dop4();
        if (!D) return { x: r[0], y: r[1], F: 0.2 };
        return { x: r[0], y: r[1], F: clamp(errorEllipse(D, 0.001).major * 2.3, 0.0018, 4) };
      }
      if (beat === 4) {
        const f = fix5();
        if (f.posErrKm > 2e-4) return { x: (r[0] + f.sol.x) / 2, y: (r[1] + f.sol.y) / 2, F: Math.max(f.posErrKm * 1.15, 0.004) };
        if (Math.abs(f.driftKm) > 1e-3) {
          const T = circleTriangle([0, 1, 2, 3].map(satP), f.rho.map((p) => p - B_FIX));
          if (T.ok) {
            const c = [(T.centroid[0] + r[0]) / 2, (T.centroid[1] + r[1]) / 2];
            return { x: c[0], y: c[1], F: Math.max(T.size * 0.62, dist(T.centroid, r) * 0.75, 0.02) };
          }
        }
        return { x: r[0], y: r[1], F: 0.012 };
      }
      const f = fix6();
      return { x: (r[0] + f.sol.x) / 2, y: (r[1] + f.sol.y) / 2, F: Math.max(f.err * 0.75, 0.012) };
    }
    function easeViews(dt) {
      let active = false;
      layout();
      const tb = fitBox(sceneBox());
      const kc = reduced ? 1 : 1 - Math.exp(-dt * 7);
      if (!cam.init) { Object.assign(cam, tb); cam.init = true; }
      else {
        const dx = tb.x - cam.x, dy = tb.y - cam.y, ls = Math.log(tb.s / cam.s);
        if (Math.abs(dx) * cam.s > 0.05 || Math.abs(dy) * cam.s > 0.05 || Math.abs(ls) > 1e-3) {
          cam.x += dx * kc; cam.y += dy * kc; cam.s *= Math.exp(ls * kc); active = true;
        } else { cam.x = tb.x; cam.y = tb.y; cam.s = tb.s; }
      }
      const lt = lensTarget();
      const ts = lensG.r * 0.62 / lt.F;
      if (!lens.init) { lens.x = lt.x; lens.y = lt.y; lens.s = ts; lens.init = true; }
      else {
        const k1 = reduced ? 1 : 1 - Math.exp(-dt * 11), k2 = reduced ? 1 : 1 - Math.exp(-dt * 4.2);
        const dx = lt.x - lens.x, dy = lt.y - lens.y, ls = Math.log(ts / lens.s);
        if (Math.abs(dx) * lens.s > 0.05 || Math.abs(dy) * lens.s > 0.05 || Math.abs(ls) > 1e-3) {
          lens.x += dx * k1; lens.y += dy * k1; lens.s *= Math.exp(ls * k2); active = true;
        } else { lens.x = lt.x; lens.y = lt.y; lens.s = ts; }
      }
      return active;
    }

    /* ---------- sprites and small glyphs ---------- */
    const spr = {
      sat: cv.glowSprite(P.gold, 34),
      bloom: cv.glowSprite(P.goldBright, 72),
      you: cv.glowSprite(P.ink, 26),
      v: cv.glowSprite(V, 28),
      crim: cv.glowSprite(P.crimson, 44),
    };
    const font = (px, style = '', fam = SERIF) => `${style ? style + ' ' : ''}${px}px ${fam}`;
    function text(ctx, s, x, y, { f = font(12), c = P.inkDim, a = 'left', b = 'alphabetic', ls = '0px' } = {}) {
      ctx.font = f; ctx.fillStyle = c; ctx.textAlign = a; ctx.textBaseline = b;
      if ('letterSpacing' in ctx) ctx.letterSpacing = ls;
      ctx.fillText(s, x, y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    function haloText(ctx, s, x, y, o = {}) {        // a dark keyline keeps labels legible over lines
      if (o.clampTo) {                                // keep the whole label inside a rectangle
        ctx.font = o.f || font(12);
        const w = ctx.measureText(s).width, a = o.a || 'left', R = o.clampTo;
        const left = a === 'left' ? x : a === 'right' ? x - w : x - w / 2;
        const nl = clamp(left, R.x + 4, R.x + R.w - 4 - w);
        x += nl - left;
      }
      ctx.save();
      ctx.font = o.f || font(12); ctx.textAlign = o.a || 'left'; ctx.textBaseline = o.b || 'alphabetic';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = rgba(P.bg, 0.85);
      ctx.strokeText(s, x, y);
      ctx.restore();
      text(ctx, s, x, y, o);
    }
    function ringGlyph(ctx, x, y, col, r = 6, lw = 1.4) {   // the intersection mark of The Two Tools
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.moveTo(x - r - 4, y); ctx.lineTo(x - r + 2, y); ctx.moveTo(x + r - 2, y); ctx.lineTo(x + r + 4, y);
      ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y - r + 2); ctx.moveTo(x, y + r - 2); ctx.lineTo(x, y + r + 4);
      ctx.stroke();
    }
    function youGlyph(ctx, x, y, lab = 'you', side = 1) {
      spr.you.draw(ctx, x, y, 0.9);
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(P.ink, 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
      if (lab) haloText(ctx, lab, x + 13 * side, y - 11, { f: font(13, 'italic'), c: P.ink, a: side > 0 ? 'left' : 'right' });
    }
    function ghostGlyph(ctx, x, y, col = P.inkDim) {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.stroke(); ctx.restore();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
    }
    function bloom(ctx, x, y, now, t0 = -9) {
      const f = clamp((now - t0) / 0.9, 0, 1);
      const k = 0.75 + (1 - f) * 0.9 * (reduced ? 0 : 1);
      spr.bloom.draw(ctx, x, y, k);
      ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.arc(x, y, 2.8, 0, TAU); ctx.fill();
    }
    function satGlyph(ctx, x, y, degA, lit, name, col = P.gold, labelOff = 19) {
      if (lit) spr.sat.draw(ctx, x, y, 1);
      ctx.save(); ctx.translate(x, y); ctx.rotate(degA * Math.PI / 180);
      ctx.fillStyle = lit ? rgba(col, 0.85) : rgba(P.inkFaint, 0.55);
      ctx.fillRect(-12, -1.7, 7, 3.4); ctx.fillRect(5, -1.7, 7, 3.4);
      ctx.fillStyle = lit ? (col === P.gold ? P.goldBright : col) : P.inkFaint;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
      if (name) {
        const t = degA * Math.PI / 180;
        haloText(ctx, name, x + Math.sin(t) * labelOff, y - Math.cos(t) * labelOff + 5,
          { f: font(15, 'italic'), c: lit ? (col === P.gold ? P.goldBright : col) : P.inkFaint, a: 'center' });
      }
    }
    function strokePts(ctx, pts, close = false) {
      if (!pts || pts.length < 2) return;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (close) ctx.closePath();
      ctx.stroke();
    }
    // a circle in the scene: exact arc in the plan view, a slice of a light cone when tilted
    function sceneCircle(ctx, c, rad, tau = tauNow) {
      if (tiltE <= 0) {
        const [x, y] = P3(c[0], c[1]);
        ctx.beginPath(); ctx.arc(x, y, Math.max(0, rad * cam.s), 0, TAU); ctx.stroke();
        return;
      }
      const pts = [];
      for (let k = 0; k <= 96; k++) { const t = k / 96 * TAU; pts.push(P3(c[0] + rad * Math.cos(t), c[1] + rad * Math.sin(t), tau)); }
      strokePts(ctx, pts);
    }
    // the part of a circle that crosses the lens, as a polyline (radii here are 10⁶–10⁹ px)
    function arcPts(cx, cy, rad, n = 80) {
      const hw = lensG.r / lens.s;
      const d = Math.hypot(lens.x - cx, lens.y - cy);
      if (!(rad > 0) || Math.abs(d - rad) > hw * 1.3) return null;
      const out = [];
      if (rad < hw * 1.5) {
        for (let k = 0; k <= n; k++) { const t = k / n * TAU; out.push(lensPx(cx + rad * Math.cos(t), cy + rad * Math.sin(t))); }
        return out;
      }
      const th0 = Math.atan2(lens.y - cy, lens.x - cx), span = Math.min(Math.PI, 1.7 * hw / rad);
      for (let k = 0; k <= n; k++) { const t = th0 - span + 2 * span * k / n; out.push(lensPx(cx + rad * Math.cos(t), cy + rad * Math.sin(t))); }
      return out;
    }
    const fmtRound = (km) => (km >= 1 ? fmtNum(km, 0) + ' km' : km >= 1e-3 ? fmtNum(km * 1e3, 0) + ' m'
      : km >= 1e-5 ? fmtNum(km * 1e5, 0) + ' cm' : km >= 1e-6 ? fmtNum(km * 1e6, 0) + ' mm' : fmtNum(km * 1e9, 0) + ' μm');

    /* ---------- the scene ---------- */
    function drawOrbitAndEarth(ctx) {
      const r = recv(), rDeg = recvDeg;
      // orbit: faint dashes all round, a firmer arc across your sky
      ctx.save();
      ctx.strokeStyle = rgba(P.inkFaint, 0.45); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      sceneCircle(ctx, [0, 0], A_GPS);
      ctx.setLineDash([]);
      const vis = [];
      for (let k = 0; k <= 80; k++) { const d = rDeg - VIS_DEG + 2 * VIS_DEG * k / 80; vis.push(P3(...satAt(d))); }
      ctx.strokeStyle = rgba(P.inkDim, 0.35); ctx.lineWidth = 1.1;
      strokePts(ctx, vis);
      ctx.restore();
      // Earth
      const [ex, ey] = P3(0, 0), ER = R_EARTH * cam.s;
      if (tiltE <= 0) {
        const atm = ctx.createRadialGradient(ex, ey, ER * 0.96, ex, ey, ER * 1.12);
        atm.addColorStop(0, rgba(P.azure, 0.22)); atm.addColorStop(1, rgba(P.azure, 0));
        ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(ex, ey, ER * 1.12, 0, TAU); ctx.fill();
        const g = ctx.createRadialGradient(ex - ER * 0.25, ey - ER * 0.45, ER * 0.1, ex, ey, ER);
        g.addColorStop(0, '#1d2a3b'); g.addColorStop(1, '#0b1119');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, ER, 0, TAU); ctx.fill();
        ctx.strokeStyle = P.azureDim; ctx.lineWidth = 1.2; ctx.stroke();
        if (ER > 22) {                              // a sexagesimal graticule: one tick per hour of rotation
          ctx.strokeStyle = rgba(P.inkFaint, 0.55); ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k < 24; k++) {
            const t = k * 15 * Math.PI / 180, L = k % 6 === 0 ? 7 : 3.5;
            ctx.moveTo(ex + Math.sin(t) * ER, ey - Math.cos(t) * ER);
            ctx.lineTo(ex + Math.sin(t) * (ER - L), ey - Math.cos(t) * (ER - L));
          }
          ctx.stroke();
        }
      } else {
        const disc = [];
        for (let k = 0; k <= 72; k++) { const t = k / 72 * TAU; disc.push(P3(R_EARTH * Math.cos(t), R_EARTH * Math.sin(t))); }
        ctx.fillStyle = rgba('#16202e', 0.92); ctx.strokeStyle = P.azureDim; ctx.lineWidth = 1.2;
        ctx.beginPath(); disc.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.fill(); ctx.stroke();
      }
      return r;
    }

    function drawSpacetimeUnder(ctx) {             // worldlines and the past cones (behind everything)
      const S = sats3(), rho = rho3(), R3 = roots3(), a = tiltE;
      const tg = R3.ghost ? -R3.ghost.b : Math.min(...rho.map((p) => -p)) - 4000;
      const tLow = Math.min(tg, ...rho.map((p) => -p)) - 2500;
      ctx.save();
      // the Earth's world-tube: two slices and its silhouette
      const low = [], hi = [];
      for (let k = 0; k <= 72; k++) { const t = k / 72 * TAU; low.push(P3(R_EARTH * Math.cos(t), R_EARTH * Math.sin(t), tLow)); hi.push(P3(R_EARTH * Math.cos(t), R_EARTH * Math.sin(t), tauNow)); }
      ctx.strokeStyle = rgba(P.azureDim, 0.35 * a); ctx.lineWidth = 1;
      strokePts(ctx, low);
      const ext = (arr, sgn) => arr.reduce((m, p) => (sgn * p[0] > sgn * m[0] ? p : m), arr[0]);
      ctx.beginPath();
      const l1 = ext(low, -1), h1 = ext(hi, -1), l2 = ext(low, 1), h2 = ext(hi, 1);
      ctx.moveTo(l1[0], l1[1]); ctx.lineTo(h1[0], h1[1]); ctx.moveTo(l2[0], l2[1]); ctx.lineTo(h2[0], h2[1]); ctx.stroke();
      // worldlines of the (frozen) satellites and of the receiver
      ctx.setLineDash([1.5, 4]); ctx.strokeStyle = rgba(P.inkFaint, 0.5 * a);
      for (const s of S) { const p = P3(s[0], s[1], tLow), q = P3(s[0], s[1], tauNow + 2500); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
      const r = recv(), p = P3(r[0], r[1], tLow), q = P3(r[0], r[1], tauNow + 2500);
      ctx.strokeStyle = rgba(P.ink, 0.35 * a); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.setLineDash([]);
      // past cones, opening downward to the second root
      if (R3.ghost) {
        const G = R3.ghost;
        S.forEach((s, i) => {
          const ti = -rho[i], h = ti - tg;
          const rim = [];
          for (let k = 0; k <= 72; k++) { const t = k / 72 * TAU; rim.push(P3(s[0] + h * Math.cos(t), s[1] + h * Math.sin(t), tg)); }
          ctx.strokeStyle = rgba(P.crimson, 0.5 * a); ctx.setLineDash([4, 4]); ctx.lineWidth = 1; strokePts(ctx, rim); ctx.setLineDash([]);
          ctx.strokeStyle = rgba(P.crimson, 0.14 * a);
          const apex = P3(s[0], s[1], ti);
          ctx.beginPath();
          for (let k = 0; k < 10; k++) { const t = k / 10 * TAU + 0.2; const e = P3(s[0] + h * Math.cos(t), s[1] + h * Math.sin(t), tg); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(e[0], e[1]); }
          const toG = P3(G.x, G.y, tg);
          ctx.moveTo(apex[0], apex[1]); ctx.lineTo(toG[0], toG[1]);
          ctx.stroke();
        });
      }
      // future cones up to the reception slice
      S.forEach((s, i) => {
        const ti = -rho[i], h = tauNow - ti;
        const apex = P3(s[0], s[1], ti);
        ctx.strokeStyle = rgba(P.gold, 0.16 * a); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 12; k++) { const t = k / 12 * TAU + 0.1; const e = P3(s[0] + h * Math.cos(t), s[1] + h * Math.sin(t), tauNow); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(e[0], e[1]); }
        ctx.stroke();
        for (const fr of [1 / 3, 2 / 3]) {
          const rim = [];
          for (let k = 0; k <= 60; k++) { const t = k / 60 * TAU; rim.push(P3(s[0] + h * fr * Math.cos(t), s[1] + h * fr * Math.sin(t), ti + h * fr)); }
          ctx.strokeStyle = rgba(P.gold, 0.13 * a); strokePts(ctx, rim);
        }
      });
      ctx.restore();
    }

    function drawSpacetimeOver(ctx, now) {
      const S = sats3(), rho = rho3(), R3 = roots3(), a = tiltE, r = recv();
      ctx.save(); ctx.globalAlpha = a;
      // the labels stand clear of the cones, tied to their events by a dotted hairline
      const rimY = (c, h, tau) => { let lo = Infinity, hi = -Infinity; for (let k = 0; k < 48; k++) { const t = k / 48 * TAU, y = P3(c[0] + h * Math.cos(t), c[1] + h * Math.sin(t), tau)[1]; lo = Math.min(lo, y); hi = Math.max(hi, y); } return [lo, hi]; };
      const leader = (x, y0, y1, col) => { if (y1 - y0 < 6) return; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([1.5, 3]); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.setLineDash([]); };
      const pr = P3(r[0], r[1], tauNow);
      let top = pr[1] - 14;
      S.forEach((s, i) => { top = Math.min(top, rimY(s, rho[i] - B_FIX, tauNow)[0]); });
      const ly = Math.max(scene.y + 16, top - 12);
      leader(pr[0], ly + 5, pr[1] - 9, rgba(P.ink, 0.5));
      haloText(ctx, 'reception: the rims of the light cones meet here', pr[0], ly, { f: font(12, 'italic'), c: P.ink, a: 'center', clampTo: scene });
      if (R3.ghost) {
        const tg = -R3.ghost.b, pg = P3(R3.ghost.x, R3.ghost.y, tg);
        let bot = pg[1] + 14;
        S.forEach((s, i) => { bot = Math.max(bot, rimY(s, -rho[i] - tg, tg)[1]); });
        const gy = Math.min(scene.y + scene.h - 24, bot + 18);
        ghostGlyph(ctx, pg[0], pg[1], CB);
        leader(pg[0], pg[1] + 10, gy - 13, rgba(CB, 0.6));
        haloText(ctx, R3.onCones ? 'the second root, on every past light cone:' : 'the second root, near every past light cone:', pg[0], gy, { f: font(12, 'italic'), c: CB, a: 'center', clampTo: scene });
        haloText(ctx, 'each signal arrives here before it is sent', pg[0], gy + 15, { f: font(12, 'italic'), c: CB, a: 'center', clampTo: scene });
      }
      // axis triad
      const o = [scene.x + 42, scene.y + scene.h - 44];
      const ax = (dx, dy, dt, lab) => {
        const q0 = proj0(0, 0, tauNow), q1 = proj0(dx, dy, tauNow + dt);
        const vx = q1[0] - q0[0], vy = q1[1] - q0[1], L = Math.hypot(vx, vy) || 1;
        const ex = o[0] + (vx / L) * 26, ey = o[1] - (vy / L) * 26;
        ctx.strokeStyle = P.inkDim; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(ex, ey); ctx.stroke();
        text(ctx, lab, o[0] + (vx / L) * 36, o[1] - (vy / L) * 36 + 4, { f: font(11, 'italic'), c: P.inkDim, a: 'center' });
      };
      ax(1, 0, 0, 'x'); ax(0, 1, 0, 'y'); ax(0, 0, 1, 'c·t');
      ctx.restore();
    }

    // light leaving each satellite at the top of the second, read off the audio clock
    function drawWavefronts(ctx) {
      const c = audio.getContext();
      if (!lis.on || !c || c.state !== 'running') return;
      const now = c.currentTime, S = litIdx().map(satP);
      for (const ev of lis.events) {
        const tt = (now - ev.T0) / ev.slowF;
        if (tt < 0 || tt > 0.1) continue;
        const rad = tt * C_KM_S, fade = 1 - tt / 0.1;
        S.forEach((s) => {
          ctx.strokeStyle = rgba(P.goldBright, 0.75 * fade); ctx.lineWidth = 1.5;
          sceneCircle(ctx, s, rad);
          ctx.strokeStyle = rgba(P.goldBright, 0.18 * fade); ctx.lineWidth = 5;
          sceneCircle(ctx, s, rad);
        });
      }
    }
    // how brightly a range circle flashes: 1 at the instant its signal arrives, fading over 0.3 s
    function arrivalFlash(i) {
      const c = audio.getContext();
      if (!lis.on || !c || c.state !== 'running') return 0;
      const now = c.currentTime, R = dist(satP(i), recv()) / C_KM_S;
      let f = 0;
      for (const ev of lis.events) { const d = now - (ev.T0 + R * ev.slowF); if (d >= 0 && d < 0.3) f = Math.max(f, 1 - d / 0.3); }
      return f;
    }
    function drawFlashes(ctx, idx, radii) {
      let hit = 0;
      idx.forEach((i, k) => {
        const f = arrivalFlash(i);
        if (f <= 0) return;
        hit = Math.max(hit, f);
        ctx.strokeStyle = rgba(P.goldBright, 0.9 * f); ctx.lineWidth = 1.2 + 1.3 * f;
        sceneCircle(ctx, satP(i), radii[k]);
      });
      return hit;
    }

    function drawScene(ctx, now) {
      const r = drawOrbitAndEarth(ctx);
      const idx = litIdx();
      if (scene.w >= 520) {
        haloText(ctx, tiltE > 0.5 ? 'spacetime: the slice lifted into c·t' : 'a slice through the Earth’s centre, to scale',
          scene.x + 14, scene.y + 22, { f: font(12, 'italic'), c: P.inkFaint });
      }
      if (tiltE > 0.001) drawSpacetimeUnder(ctx);

      if (beat === 0) {
        const g = g0();
        ctx.lineWidth = 1.25;
        [[g.A, g.RA], [g.B, g.RB]].forEach(([s, R]) => { ctx.strokeStyle = rgba(P.gold, 0.55); sceneCircle(ctx, s, R); });
        drawWavefronts(ctx);
        const hit = drawFlashes(ctx, idx, [g.RA, g.RB]);
        if (hit > 0 && g.near) { const [x, y] = P3(...g.near); ctx.strokeStyle = rgba(V, hit); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 7 + 18 * (1 - hit), 0, TAU); ctx.stroke(); }
        drawSats(ctx, idx);
        if (g.far) {
          const [fx, fy] = P3(...g.far);
          ringGlyph(ctx, fx, fy, perfNow() - b1.wrongAt < 1.4 ? CB : P.azure);
          haloText(ctx, 'P′', fx + 13, fy - 8, { f: font(15, 'italic'), c: P.ink });
          // the distance goes on whichever side of the mark has room, never over it
          const dl = `${fmtNum(Math.hypot(...g.far), 0)} km from the Earth’s centre`;
          ctx.font = font(12, 'italic');
          const fits = fx + 13 + ctx.measureText(dl).width <= scene.x + scene.w - 4;
          haloText(ctx, dl, fits ? fx + 13 : fx - 13, fy + (fits ? 10 : 22), { f: font(12, 'italic'), c: P.inkDim, a: fits ? 'left' : 'right', clampTo: scene });
        }
        if (g.near) {
          const [nx, ny] = P3(...g.near);
          if (done[0]) { bloom(ctx, nx, ny, now, b1.claimAt); youGlyph(ctx, nx, ny, 'P, you', 1); }
          else { ringGlyph(ctx, nx, ny, P.azure); haloText(ctx, 'P', nx + 13, ny - 8, { f: font(15, 'italic'), c: P.ink }); }
        }
      } else if (beat === 1) {
        const S = sats2(), R = b2.shown || target2();
        ctx.lineWidth = 1.25;
        ctx.setLineDash(b2.closed ? [] : [7, 5]);
        S.forEach((s, i) => { ctx.strokeStyle = rgba(P.gold, 0.6); sceneCircle(ctx, s, R[i]); });
        ctx.setLineDash([]);
        drawWavefronts(ctx);
        drawFlashes(ctx, idx, R);                   // your circles light as their signals arrive
        drawSats(ctx, idx);
        if (b2.closed) { const [x, y] = P3(...r); bloom(ctx, x, y, now, b2.closeAt); youGlyph(ctx, x, y); }
      } else if (beat === 2) {
        const S = sats3(), rho = rho3(), it = iterNow();
        const bh = b3.gn && b3.shown >= 0 ? it.b : 0;
        const conv = b3.gn && b3.shown === b3.gn.history.length - 1;
        ctx.lineWidth = 1.25; ctx.setLineDash(conv || tiltE > 0 ? [] : [7, 5]);
        S.forEach((s, i) => { ctx.strokeStyle = rgba(P.gold, tiltE > 0 ? 0.9 : 0.58); sceneCircle(ctx, s, Math.max(0, rho[i] - (tiltE > 0 ? B_FIX : bh))); });
        ctx.setLineDash([]);
        if (b3.bancroft && tiltE < 0.5) {
          const gh = roots3().ghost;
          if (gh) {
            const [gx, gy] = P3(gh.x, gh.y);
            ctx.save(); ctx.globalAlpha = 1 - tiltE * 2;
            ctx.strokeStyle = rgba(P.crimson, 0.5); ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
            for (const s of S) { const [sx, sy] = P3(...s); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx, gy); ctx.stroke(); }
            ctx.setLineDash([]);
            ghostGlyph(ctx, gx, gy, CB);
            haloText(ctx, 'the second root', gx + 14, gy - 2, { f: font(13, 'italic'), c: CB, clampTo: scene });
            haloText(ctx, 'every signal arrives before it was sent', gx + 14, gy + 14, { f: font(12, 'italic'), c: P.inkDim, clampTo: scene });
            ctx.restore();
          }
        }
        drawGNPath(ctx, (x, y, b) => P3(x, y, -b), true);
        drawSats(ctx, idx);
        if (conv || b3.bancroft) { const [x, y] = P3(...r); bloom(ctx, x, y, now, b3.convAt); if (tiltE < 0.5) youGlyph(ctx, x, y); }
        if (tiltE > 0.001) drawSpacetimeOver(ctx, now);
      } else if (beat === 3) {
        const [rx, ry] = P3(...r);
        const up = [r[0] / R_EARTH, r[1] / R_EARTH], tan = [up[1], -up[0]], L = 60000;
        ctx.save();
        ctx.strokeStyle = rgba(P.inkFaint, 0.4); ctx.setLineDash([5, 6]); ctx.lineWidth = 1;
        const h1 = P3(r[0] - tan[0] * L, r[1] - tan[1] * L), h2 = P3(r[0] + tan[0] * L, r[1] + tan[1] * L);
        ctx.beginPath(); ctx.moveTo(h1[0], h1[1]); ctx.lineTo(h2[0], h2[1]); ctx.stroke(); ctx.setLineDash([]);
        // below the line: every satellite you can see is above it
        const hl = P3(r[0] + tan[0] * 21500, r[1] + tan[1] * 21500);
        haloText(ctx, 'your horizon', hl[0], hl[1] + 16, { f: font(12, 'italic'), c: P.inkFaint, a: 'center', clampTo: scene });
        [0, 1, 2, 3].forEach((i) => {
          const [sx, sy] = P3(...satP(i));
          ctx.strokeStyle = rgba(i === b4.sel ? V : P.gold, i === b4.sel ? 0.55 : 0.28); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(sx, sy); ctx.stroke();
        });
        ctx.restore();
        drawSats(ctx, idx);
        const [qx, qy] = P3(...satP(b4.sel));
        ctx.strokeStyle = rgba(V, 0.9); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(qx, qy, 15, 0, TAU); ctx.stroke();
        if (hoverSat >= 0 && hoverSat !== b4.sel) { const [hx, hy] = P3(...satP(hoverSat)); ctx.strokeStyle = rgba(P.ink, 0.5); ctx.beginPath(); ctx.arc(hx, hy, 15, 0, TAU); ctx.stroke(); }
        youGlyph(ctx, rx, ry, 'you', -1);
      } else if (beat === 4) {
        const f = fix5(), S = [0, 1, 2, 3].map(satP);
        ctx.lineWidth = 1.2;
        if (Math.abs(f.driftKm) > 1e-3 || f.posErrKm > 1e-7) {
          ctx.setLineDash([4, 5]); ctx.strokeStyle = rgba(P.crimson, 0.5);
          S.forEach((s, i) => sceneCircle(ctx, s, f.rho[i] - B_FIX));
          ctx.setLineDash([]);
        }
        S.forEach((s, i) => { ctx.strokeStyle = rgba(P.gold, 0.5); sceneCircle(ctx, s, f.rho[i] - f.sol.b); });
        // the two causes, drawn where they act: speed along the orbit, height in the well
        const v = orbitalSpeed();
        S.forEach((s, i) => {
          const [sx, sy] = P3(...s), t = satDeg(i) * Math.PI / 180;
          const ux = Math.cos(t), uy = Math.sin(t);
          ctx.strokeStyle = rgba(P.azure, 0.75); ctx.fillStyle = rgba(P.azure, 0.75); ctx.lineWidth = 1.2;
          const ax = sx + ux * 30, ay = sy + uy * 30;
          ctx.beginPath(); ctx.moveTo(sx + ux * 14, sy + uy * 14); ctx.lineTo(ax, ay); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax + ux * 4, ay + uy * 4); ctx.lineTo(ax - uy * 3.2, ay + ux * 3.2); ctx.lineTo(ax + uy * 3.2, ay - ux * 3.2); ctx.fill();
          if (i === 3) haloText(ctx, `${fmtNum(v, 2)} km/s`, ax + 6, ay + 16, { f: font(11, '', MONO), c: P.azure, clampTo: scene });
        });
        if (b5.sound && rel.lo) {
          const env = Math.abs(Math.cos(rel.phase));
          S.forEach((s) => { const [sx, sy] = P3(...s); spr.v.draw(ctx, sx, sy, 0.8 + 1.6 * env); });
        }
        drawSats(ctx, idx);
        if (b5.e > 0 && !b5.eccCorr) {
          // on a narrow plate the unit is stated once, so neighbouring readings cannot run together
          const narrow = scene.w < 520;
          if (narrow) haloText(ctx, 'satellite clocks ahead, in μs', scene.x + 10, scene.y + 18, { f: font(11, 'italic'), c: P.inkDim });
          S.forEach((s, i) => {
            const [sx, sy] = P3(...s), t = satDeg(i) * Math.PI / 180;
            haloText(ctx, `${fmtSigned(f.bias[i] / US_KM, 3)}${narrow ? '' : ' μs'}`, sx - Math.sin(t) * 26, sy + Math.cos(t) * 26 + 4,
              { f: font(narrow ? 10 : 11, '', MONO), c: P.goldBright, a: 'center', clampTo: scene });
          });
        } else {
          const [tx, ty] = P3(0, A_GPS);
          haloText(ctx, `every satellite clock ${fmtSigned(f.driftKm / US_KM, 2)} μs`, tx, ty - 26, { f: font(11, '', MONO), c: P.goldBright, a: 'center', clampTo: scene });
        }
        const [rx, ry] = P3(...r);
        youGlyph(ctx, rx, ry, 'you', -1);
      } else {
        const f = fix6();
        ctx.lineWidth = 1.2;
        f.S.forEach((s, i) => { ctx.strokeStyle = b6.forged && i === 1 ? rgba(P.crimson, 0.75) : rgba(P.gold, 0.5); sceneCircle(ctx, s, f.rho[i] - f.sol.b); });
        drawSats(ctx, idx);
        const [rx, ry] = P3(...r), [qx, qy] = P3(f.sol.x, f.sol.y);
        if (f.err > 0.5) { spr.crim.draw(ctx, qx, qy, 0.8); ringGlyph(ctx, qx, qy, CB, 5); }
        youGlyph(ctx, rx, ry, 'you', -1);
      }
      drawSceneScale(ctx);
    }

    function drawSats(ctx, idx) {
      const lit = new Set(idx);
      for (const i of drawnIdx()) {
        const s = satP(i);
        let [x, y] = P3(...s);
        if (beat === 2 && tiltE > 0.001) { const k = idx.indexOf(i); if (k >= 0) [x, y] = P3(s[0], s[1], -rho3()[k]); }
        const col = beat === 5 && b6.forged && i === 1 ? P.crimson : P.gold;
        satGlyph(ctx, x, y, satDeg(i), lit.has(i), NAMES[i], col);
      }
    }

    function drawGNPath(ctx, map, withLabels) {
      if (!b3.gn || b3.shown < 0) return;
      const H = b3.gn.history, it = iterNow();
      const pts = [];
      for (let k = 0; k < b3.shown; k++) pts.push(map(H[k].x, H[k].y, H[k].b));
      pts.push(map(it.x, it.y, it.b));
      ctx.save();
      ctx.strokeStyle = rgba(V, 0.9); ctx.lineWidth = 1.5; strokePts(ctx, pts);
      pts.forEach((p, k) => {
        ctx.fillStyle = k === pts.length - 1 ? P.ink : V;
        ctx.beginPath(); ctx.arc(p[0], p[1], k === pts.length - 1 ? 3.2 : 2.6, 0, TAU); ctx.fill();
        if (withLabels && k <= 1) haloText(ctx, String(k), p[0] - 8, p[1] + 4, { f: font(10, '', MONO), c: V, a: 'right' });
      });
      ctx.restore();
    }

    function drawLensMarker(ctx) {
      if (lensVis < 0.02) return;
      const [x, y] = P3(lens.x, lens.y);
      const rr = Math.max(4.5, (lensG.r / lens.s) * cam.s);
      ctx.save(); ctx.globalAlpha = lensVis;
      ctx.strokeStyle = rgba(V, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
      const dx = lensG.cx - x, dy = lensG.cy - y, L = Math.hypot(dx, dy);
      if (L > lensG.r + rr + 8) {
        const nx = -dy / L, ny = dx / L;
        ctx.strokeStyle = rgba(V, 0.2);
        ctx.beginPath();
        ctx.moveTo(x + nx * rr, y + ny * rr); ctx.lineTo(lensG.cx + nx * lensG.r, lensG.cy + ny * lensG.r);
        ctx.moveTo(x - nx * rr, y - ny * rr); ctx.lineTo(lensG.cx - nx * lensG.r, lensG.cy - ny * lensG.r);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSceneScale(ctx) {
      const want = scene.w * 0.16 / cam.s, L = niceStep(want), px = L * cam.s;
      const x0 = scene.x + 16, y0 = scene.y + scene.h - 18;
      if (tiltE > 0.3) return;
      ctx.strokeStyle = P.inkDim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 - 4); ctx.stroke();
      text(ctx, fmtRound(L), x0 + px + 8, y0 + 1, { f: font(11, '', MONO), c: P.inkDim, b: 'middle' });
    }

    /* ---------- the lens ---------- */
    function lensCaption() {
      if (beat === 0) return 'around P, where the circles cross';
      if (beat === 1) {
        if (b2.closed) return 'closed: three circles, one point';
        const T = circleTriangle(sats2(), b2.shown || target2());
        return T.ok ? `the triangle, ${fmtLen(T.size)} across` : 'the circles no longer meet';
      }
      if (beat === 2) {
        if (!b3.gn || b3.shown < 0) return 'around you';
        const H = b3.gn.history;
        return b3.shown === H.length - 1 ? 'converged: the float floor' : `step ${b3.shown} · misfit ${fmtLen(H[b3.shown].rms)}`;
      }
      if (beat === 3) return '1σ ellipse for 1 m of range noise';
      if (beat === 4) {
        const f = fix5();
        if (f.posErrKm > 2e-4) return `the fix has moved ${fmtLen(f.posErrKm)}`;
        return Math.abs(f.driftKm) > 1e-3 ? 'gold closes on you; crimson trusts the satellite clocks' : 'around you';
      }
      const f = fix6();
      return f.err > 0.5 ? `the forged fix, ${fmtLen(f.err)} from you` : 'around you: every circle honest';
    }
    function drawLens(ctx, now) {
      const { cx, cy, r } = lensG;
      const hw = r / lens.s;
      ctx.save();
      ctx.globalAlpha = lensVis;
      // body
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      const bg = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
      bg.addColorStop(0, '#11141d'); bg.addColorStop(1, '#07080c');
      ctx.fillStyle = bg; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      // graph paper at the scale bar's step
      const st = niceStep(hw / 2);
      ctx.strokeStyle = rgba(P.inkFaint, 0.09); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = Math.ceil((lens.x - hw) / st); k * st <= lens.x + hw; k++) { const [x] = lensPx(k * st, 0); ctx.moveTo(x, cy - r); ctx.lineTo(x, cy + r); }
      for (let k = Math.ceil((lens.y - hw) / st); k * st <= lens.y + hw; k++) { const [, y] = lensPx(0, k * st); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); }
      ctx.stroke();
      // the Earth, as much of it as the lens can see
      const ea = arcPts(0, 0, R_EARTH, 96);
      if (ea) {
        const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
        g.addColorStop(0, '#18222f'); g.addColorStop(1, '#0c121a');
        ctx.fillStyle = g;
        ctx.beginPath(); ea.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        if (R_EARTH >= hw * 1.5) {
          const th0 = Math.atan2(lens.y, lens.x), span = Math.min(Math.PI, 1.7 * hw / R_EARTH), rin = Math.max(0, R_EARTH - 4 * hw);
          const a = lensPx(rin * Math.cos(th0 + span), rin * Math.sin(th0 + span)), b = lensPx(rin * Math.cos(th0 - span), rin * Math.sin(th0 - span));
          ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = P.azureDim; ctx.lineWidth = 1.3; strokePts(ctx, ea);
      }
      lensContent(ctx, now, hw);
      // vignette
      const vg = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
      vg.addColorStop(0, 'rgba(7,8,12,0)'); vg.addColorStop(1, 'rgba(7,8,12,0.55)');
      ctx.fillStyle = vg; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      // scale bar
      const L = niceStep(hw * 0.8), px = L * lens.s, by = cy + r * 0.74;
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - px / 2, by - 4); ctx.lineTo(cx - px / 2, by); ctx.lineTo(cx + px / 2, by); ctx.lineTo(cx + px / 2, by - 4); ctx.stroke();
      haloText(ctx, fmtRound(L), cx, by + 14, { f: font(11, '', MONO), c: P.ink, a: 'center' });
      ctx.restore();
      // rim, ticks, labels
      ctx.strokeStyle = rgba(P.line, 1); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, TAU); ctx.stroke();
      ctx.strokeStyle = V; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(P.inkFaint, 0.8); ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k < 24; k++) { const t = k * TAU / 24, L2 = k % 6 === 0 ? 7 : 3.5; ctx.moveTo(cx + Math.cos(t) * (r + 5), cy + Math.sin(t) * (r + 5)); ctx.lineTo(cx + Math.cos(t) * (r + 5 + L2), cy + Math.sin(t) * (r + 5 + L2)); }
      ctx.stroke();
      const mag = lens.s / cam.s;
      text(ctx, `LENS   × ${mag < 1e4 ? fmtNum(mag, mag < 10 ? 1 : 0) : sci(mag, 1)}`, cx, cy - r - 17, { f: font(10, '', MONO), c: V, a: 'center', ls: '1.5px' });
      text(ctx, lensCaption(), cx, cy + r + 27, { f: font(12, 'italic'), c: P.inkDim, a: 'center' });
      ctx.restore();
    }

    function lensArc(ctx, c, rad, col, lw = 1.3, dash = null) {
      const pts = arcPts(c[0], c[1], rad);
      if (!pts) return;
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      if (dash) ctx.setLineDash(dash);
      strokePts(ctx, pts);
      if (dash) ctx.setLineDash([]);
    }
    function lensContent(ctx, now, hw) {
      const r = recv(), rp = lensPx(...r);
      const LR = { x: lensG.cx - lensG.r * 0.88, w: lensG.r * 1.76 };   // labels stay inside the glass
      if (beat === 0) {
        const g = g0();
        lensArc(ctx, g.A, g.RA, rgba(P.gold, 0.85)); lensArc(ctx, g.B, g.RB, rgba(P.gold, 0.85));
        if (g.near) {
          const p = lensPx(...g.near);
          if (done[0]) { bloom(ctx, p[0], p[1], now, b1.claimAt); youGlyph(ctx, p[0], p[1], 'P, you'); }
          else { ringGlyph(ctx, p[0], p[1], P.azure, 7); haloText(ctx, 'P', p[0] + 14, p[1] - 9, { f: font(15, 'italic'), c: P.ink }); }
        }
        labelArcs(ctx, [[g.A, g.RA, 'A'], [g.B, g.RB, 'B']]);
      } else if (beat === 1) {
        const S = sats2(), R = b2.shown || target2();
        S.forEach((s, i) => lensArc(ctx, s, R[i], rgba(P.gold, 0.85), 1.3, b2.closed ? null : [7, 5]));
        const T = circleTriangle(S, R);
        if (T.ok && !b2.closed) {
          const pts = T.pts.map((p) => lensPx(...p));
          ctx.fillStyle = rgba(P.gold, 0.13);
          ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
          pts.forEach((p) => { ctx.fillStyle = P.azure; ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, TAU); ctx.fill(); });
        }
        if (b2.closed) { bloom(ctx, rp[0], rp[1], now, b2.closeAt); youGlyph(ctx, rp[0], rp[1]); }
        labelArcs(ctx, S.map((s, i) => [s, R[i], NAMES[i]]));
      } else if (beat === 2) {
        const S = sats3(), rho = rho3(), it = iterNow();
        const bh = b3.gn && b3.shown >= 0 ? it.b : 0;
        const conv = b3.gn && b3.shown === b3.gn.history.length - 1;
        S.forEach((s, i) => lensArc(ctx, s, rho[i] - bh, rgba(P.gold, 0.85), 1.3, conv ? null : [7, 5]));
        drawGNPath(ctx, (x, y) => lensPx(x, y), false);
        if (conv) { bloom(ctx, rp[0], rp[1], now, b3.convAt); youGlyph(ctx, rp[0], rp[1]); }
        labelArcs(ctx, S.map((s, i) => [s, rho[i] - bh, NAMES[i]]));
      } else if (beat === 3) {
        const D = dop4();
        // spokes toward the satellites
        [0, 1, 2, 3].forEach((i) => {
          const s = satP(i), d = dist(s, r), u = [(s[0] - r[0]) / d, (s[1] - r[1]) / d];
          const e = [lensG.cx + u[0] * lensG.r * 0.96, lensG.cy - u[1] * lensG.r * 0.96];
          ctx.strokeStyle = rgba(i === b4.sel ? V : P.gold, 0.4); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(rp[0], rp[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
          haloText(ctx, NAMES[i], lensG.cx + u[0] * lensG.r * 0.84, lensG.cy - u[1] * lensG.r * 0.84 + 5, { f: font(14, 'italic'), c: i === b4.sel ? V : P.goldBright, a: 'center' });
        });
        if (D) {
          const E = errorEllipse(D, 0.001);
          ctx.save(); ctx.translate(rp[0], rp[1]); ctx.rotate(-E.angle);
          ctx.fillStyle = rgba(P.azure, 0.24); ctx.strokeStyle = P.azure; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.5, E.major * lens.s), Math.max(0.5, E.minor * lens.s), 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = rgba(P.azure, 0.5); ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(-E.major * lens.s, 0); ctx.lineTo(E.major * lens.s, 0); ctx.moveTo(0, -E.minor * lens.s); ctx.lineTo(0, E.minor * lens.s); ctx.stroke();
          ctx.restore();
        } else {
          haloText(ctx, 'no fix: the geometry has collapsed', lensG.cx, lensG.cy - 20, { f: font(12, 'italic'), c: CB, a: 'center', clampTo: LR });
        }
        youGlyph(ctx, rp[0], rp[1], '');
      } else if (beat === 4) {
        const f = fix5(), S = [0, 1, 2, 3].map(satP);
        if (Math.abs(f.driftKm) > 1e-3 || f.posErrKm > 1e-7) S.forEach((s, i) => lensArc(ctx, s, f.rho[i] - B_FIX, rgba(P.crimson, 0.75), 1.2, [4, 5]));
        S.forEach((s, i) => lensArc(ctx, s, f.rho[i] - f.sol.b, rgba(P.gold, 0.85), 1.3));
        const q = lensPx(f.sol.x, f.sol.y);
        if (f.posErrKm > 1e-7) {
          ctx.strokeStyle = rgba(CB, 0.9); ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(rp[0], rp[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]);
        }
        youGlyph(ctx, rp[0], rp[1], 'you', -1);
        bloom(ctx, q[0], q[1], now);
        haloText(ctx, 'the fix', q[0] + 12, q[1] + 16, { f: font(12, 'italic'), c: P.goldBright, clampTo: LR });
      } else {
        const f = fix6();
        f.S.forEach((s, i) => lensArc(ctx, s, f.rho[i] - f.sol.b, b6.forged && i === 1 ? rgba(CB, 0.9) : rgba(P.gold, 0.85), 1.3));
        const q = lensPx(f.sol.x, f.sol.y);
        youGlyph(ctx, rp[0], rp[1], 'you', -1);
        if (f.err > 0.5) {
          ringGlyph(ctx, q[0], q[1], CB, 6);
          haloText(ctx, f.rms < 1e-6 ? 'the fix: every circle agrees' : 'the fix: the circles disagree', q[0] + 14, q[1] - 10, { f: font(12, 'italic'), c: CB, clampTo: LR });
        }
        labelArcs(ctx, f.S.map((s, i) => [s, f.rho[i] - f.sol.b, NAMES[f.idx[i]]]));
      }
    }
    // name each arc where it leaves the lens, so the circles can be told apart
    function labelArcs(ctx, list) {
      for (const [c, rad, name] of list) {
        const pts = arcPts(c[0], c[1], rad, 120);
        if (!pts) continue;
        let best = null;
        for (const p of pts) {
          const d = Math.hypot(p[0] - lensG.cx, p[1] - lensG.cy);
          if (d < lensG.r * 0.8 && (!best || d > best.d) && p[1] < lensG.cy) best = { p, d };
        }
        if (best) haloText(ctx, name, best.p[0] + 7, best.p[1] - 5, { f: font(13, 'italic'), c: P.goldBright });
      }
    }

    /* ---------- the chart in the margin (parts V and VI) ---------- */
    function drawChart() {
      const { ctx, width: W, height: H } = chart;
      ctx.clearRect(0, 0, W, H);
      if (beat === 4) drawRelChart(ctx, W, H);
      else if (beat === 5) drawResChart(ctx, W, H);
    }
    function drawRelChart(ctx, W, H) {
      const cr = clockRate(), d7 = 7;
      const lines = [
        { on: b5.gr, slope: usPerDay(cr.grav), col: P.gold, name: 'gravity' },
        { on: b5.sr, slope: usPerDay(cr.vel), col: P.azure, name: 'speed' },
        { on: b5.detuned, slope: -usPerDay(FACTORY), col: V, name: 'factory' },
      ];
      const net = lines.reduce((s, l) => s + (l.on ? l.slope : 0), 0);
      const ends = [0, net * d7, ...lines.filter((l) => l.on).map((l) => l.slope * d7)];
      let lo = Math.min(...ends), hi = Math.max(...ends);
      if (hi - lo < 60) { hi += 30; lo -= 30; }
      const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
      // legend first: it wraps to a second row on a narrow chart, and the plot starts below it
      const L = 50, R = W - 14, B = H - 24;
      const items = [...lines.filter((l) => l.on).map((l) => [l.col, `${l.name} ${fmtSigned(l.slope, 1)}`]), [P.ink, `net ${fmtSigned(net, 2)} μs/day`]];
      ctx.font = font(10, '', MONO);
      const legend = [];
      let lx = L, ly = 12;
      for (const [c, s] of items) {
        const w = ctx.measureText(s).width + 13;
        if (lx + w > W - 6 && lx > L) { lx = L; ly += 12; }
        legend.push([c, s, lx, ly]);
        lx += w + 13;
      }
      const T = ly + 18;
      const X = (d) => L + (d / d7) * (R - L), Y = (u) => B - ((u - lo) / (hi - lo)) * (B - T);
      const st = niceStep((hi - lo) / 3.5);
      ctx.lineWidth = 1;
      for (let u = Math.ceil(lo / st) * st; u <= hi; u += st) {
        ctx.strokeStyle = Math.abs(u) < 1e-9 ? rgba(P.inkDim, 0.6) : rgba(P.line, 0.9);
        ctx.beginPath(); ctx.moveTo(L, Y(u)); ctx.lineTo(R, Y(u)); ctx.stroke();
        text(ctx, `${fmtSigned(u, 0)}`, L - 6, Y(u), { f: font(10, '', MONO), c: P.inkFaint, a: 'right', b: 'middle' });
      }
      text(ctx, 'μs', L - 6, T - 10, { f: font(10, '', MONO), c: P.inkFaint, a: 'right', b: 'middle' });
      for (let d = 0; d <= 7; d++) text(ctx, String(d), X(d), B + 13, { f: font(10, '', MONO), c: P.inkFaint, a: 'center', b: 'middle' });
      text(ctx, 'days', L - 9, B + 13, { f: font(10, '', MONO), c: P.inkFaint, a: 'right', b: 'middle' });
      for (const l of lines) {
        if (!l.on) continue;
        ctx.strokeStyle = rgba(l.col, 0.85); ctx.lineWidth = 1.2; ctx.setLineDash(l.name === 'factory' ? [4, 4] : []);
        ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(d7), Y(l.slope * d7)); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(d7), Y(net * d7)); ctx.stroke();
      for (const [c, s, x, y] of legend) {
        ctx.fillStyle = c; ctx.fillRect(x, y - 1, 9, 2);
        text(ctx, s, x + 13, y, { f: font(10, '', MONO), c: P.inkDim, b: 'middle' });
      }
      // cursor
      const dd = b5.days, u = net * dd, cx = X(dd), cy = Y(u);
      ctx.strokeStyle = rgba(V, 0.8); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, T); ctx.lineTo(cx, B); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, TAU); ctx.fill();
      // the reading sits on the side of the cursor the net line leaves empty (above-left of a
      // rising line, below-right), shortened and then centred if the chart is too narrow for it
      const f10 = font(10, '', MONO);
      ctx.font = f10;
      const full = `${fmtSigned(u, 2)} μs = ${fmtLen(u * US_KM, true)} of light`, short = `${fmtSigned(u, 2)} μs = ${fmtLen(u * US_KM, true)}`;
      let place = null;
      for (const s of [full, short]) {
        const w = ctx.measureText(s).width;
        if (cx - 9 - w >= L) { place = { s, x: cx - 9, a: 'right', left: true }; break; }
        if (cx + 9 + w <= W - 4) { place = { s, x: cx + 9, a: 'left', left: false }; break; }
      }
      if (place) {
        const up = net >= 0 ? place.left : !place.left;
        haloText(ctx, place.s, place.x, cy + (up ? -9 : 15), { f: f10, c: P.ink, a: place.a });
      } else {
        const w = ctx.measureText(short).width;
        haloText(ctx, short, clamp(cx - w / 2, 4, W - 4 - w), cy > (T + B) / 2 ? T + 8 : B - 6, { f: f10, c: P.ink });
      }
    }
    function drawResChart(ctx, W, H) {
      const f = fix6(), n = f.res.length;
      const m = Math.max(1, ...f.res.map(Math.abs)) * 1.2;
      const L = 44, R = W - 12, T = 22, B = H - 34, mid = (T + B) / 2;
      const Y = (v) => mid - (v / m) * (B - T) / 2;
      ctx.strokeStyle = rgba(P.inkDim, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, mid); ctx.lineTo(R, mid); ctx.stroke();
      const st = niceStep(m / 1.5);
      for (const v of [st, -st]) {
        ctx.strokeStyle = rgba(P.line, 0.9); ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke();
        text(ctx, fmtSigned(v, st < 1 ? 1 : 0), L - 6, Y(v), { f: font(10, '', MONO), c: P.inkFaint, a: 'right', b: 'middle' });
      }
      text(ctx, 'km', L - 6, mid, { f: font(10, '', MONO), c: P.inkFaint, a: 'right', b: 'middle' });
      const slot = (R - L) / n, bw = Math.min(34, slot * 0.5);
      f.res.forEach((v, i) => {
        const x = L + slot * (i + 0.5), bad = b6.forged && f.idx[i] === 1;
        ctx.fillStyle = bad ? rgba(P.crimson, 0.85) : rgba(P.gold, 0.8);
        const y0 = Y(Math.max(v, 0)), y1 = Y(Math.min(v, 0));
        ctx.fillRect(x - bw / 2, y0, bw, Math.max(1, y1 - y0));
        text(ctx, NAMES[f.idx[i]], x, H - 11, { f: font(13, 'italic'), c: bad ? CB : P.goldBright, a: 'center', b: 'middle' });
        if (Math.abs(v) > 1e-6) text(ctx, fmtSigned(v, 2), x, v > 0 ? y0 - 8 : y1 + 9, { f: font(10, '', MONO), c: P.ink, a: 'center', b: 'middle' });
      });
      if (f.rms < 1e-6) haloText(ctx, b6.forged ? 'every residual is zero: the lie fits perfectly' : 'every residual is zero', (L + R) / 2, T + 2, { f: font(12, 'italic'), c: b6.forged ? CB : P.inkDim, a: 'center', b: 'middle' });
    }

    /* ---------- the ledger ---------- */
    const tbl = (head, rowsH) => `<div class="wa-tblw"><table class="wa-tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsH.join('')}</tbody></table></div>`;
    const tr = (cells, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    const sN = (i) => `<span class="s">${NAMES[i]}</span>`;
    function ledgerHTML() {
      const r = recv();
      if (beat === 0) {
        const g = g0();
        return tbl(['satellite', 'range', 'light-time'], [
          tr([sN(0), fmtNum(g.RA, 3) + ' km', fmtNum(g.RA / C_KM_S * 1e3, 3) + ' ms']),
          tr([sN(1), fmtNum(g.RB, 3) + ' km', fmtNum(g.RB / C_KM_S * 1e3, 3) + ' ms']),
        ]) + `<p class="wa-sum">The circles cut at <em>P</em>, <span class="m">${fmtNum(Math.hypot(...g.near), 1)} km</span> from the Earth’s centre, and at <em>P′</em>, <span class="m">${fmtNum(Math.hypot(...g.far), 1)} km</span> from it. Every range here is a hypotenuse, √(Δx² + Δy²).</p>`;
      }
      if (beat === 1) {
        const rho = rho2(), R = target2(), T = circleTriangle(sats2(), R);
        const gUs = b2.guessUs;
        let sum = `Your guess: <span class="m">δt̂ = ${fmtSigned(gUs / 1000, 4)} ms</span>, which is <span class="m">${fmtLen(gUs * US_KM, true)}</span> of light. `;
        if (b2.closed) {
          const bUs = b2.b / US_KM;
          sum = `<span class="v">Closed.</span> Your clock was ${bUs > 0 ? 'ahead' : 'behind'} by <span class="m">${fmtNum(Math.abs(bUs) / 1000, 4)} ms</span>, <span class="m">${fmtLen(Math.abs(b2.b))}</span> of light, and every pseudorange carried that same error.`;
        } else sum += T.ok ? `The circles leave a triangle <span class="m">${fmtLen(T.size)}</span> across.` : 'At this guess two circles no longer meet at all.';
        return tbl(['satellite', 'pseudorange ρ', 'circle drawn, ρ − c·δt̂'], [0, 1, 2].map((i) => tr([sN(i), fmtNum(rho[i], 3) + ' km', fmtNum(R[i], 3) + ' km'])))
          + `<p class="wa-sum">${sum}</p>`;
      }
      if (beat === 2) {
        const rowsH = [];
        let sum = '';
        if (b3.gn && b3.shown >= 0) {
          const H = b3.gn.history;
          for (let k = 0; k <= b3.shown; k++) {
            const h = H[k], floor = h.rms < 1e-9;
            const mis = h.rms === 0 ? '0, exactly' : floor ? sci(h.rms, 1) + ' km' : fmtLen(h.rms);
            rowsH.push(`<tr${k === b3.shown ? ' class="now"' : ''}><td>${k}</td><td class="hx">${fmtNum(h.x, 3)}</td><td>${fmtNum(h.y, 3)}</td><td>${fmtNum(h.b, 3)}</td><td>${mis}</td></tr>`);
          }
          sum = b3.shown === H.length - 1
            ? `Converged in ${H.length - 1} steps. The clock came out at <span class="m">${fmtNum(H[H.length - 1].b, 6)} km</span>, which is <span class="m">${fmtNum(H[H.length - 1].b / US_KM, 3)} μs</span>.`
            : 'Each step solves the tangent-line problem for the corrections to x, y and c·δt.';
        } else {
          rowsH.push('<tr class="dim"><td>0</td><td class="hx">0.000</td><td>0.000</td><td>0.000</td><td>—</td></tr>');
          sum = 'The solver starts from the centre of the Earth, knowing nothing.';
        }
        if (b3.bancroft) {
          const R3 = roots3();
          if (R3.causal && R3.ghost) sum += ` Closed form: one root at <span class="m">(${fmtNum(R3.causal.x, 3)}, ${fmtNum(R3.causal.y, 3)})</span> with c·δt = <span class="m">${fmtNum(R3.causal.b, 3)} km</span>, causal; the other at <span class="m">(${fmtNum(R3.ghost.x, 1)}, ${fmtNum(R3.ghost.y, 1)})</span> with c·δt = <span class="m">${fmtNum(R3.ghost.b, 1)} km</span>, where every signal would arrive before it was sent: <span class="c">${R3.onCones ? 'on every past light cone' : `within ${fmtLen(R3.miss)} of every past light cone`}</span>${R3.onCones ? '' : ', because with four satellites the closed form is a least-squares fit'}.`;
        }
        return tbl(['step', '<span class="hx">x (km)</span>', 'y (km)', 'c·δt (km)', 'misfit'], rowsH).replace('<th><span class="hx">', '<th class="hx"><span>') + `<p class="wa-sum">${sum}</p>`;
      }
      if (beat === 3) {
        const D = dop4();
        const rowsH = [0, 1, 2, 3].map((i) => {
          const s = satP(i), d = dist(s, r), el = Math.asin(((s[0] - r[0]) * r[0] + (s[1] - r[1]) * r[1]) / (d * R_EARTH)) * 180 / Math.PI;
          return `<tr${i === b4.sel ? ' class="good"' : ''}><td>${sN(i)}</td><td>${fmtSigned(b4.deg[i], 1)}°</td><td>${fmtNum(el, 1)}°</td><td class="hx">${fmtNum(d, 0)} km</td></tr>`;
        });
        let sum;
        if (D) {
          const E = errorEllipse(D, 1);
          sum = `<span class="m">GDOP ${fmtNum(D.gdop, 2)} · PDOP ${fmtNum(D.pdop, 2)} · TDOP ${fmtNum(D.tdop, 2)}</span>. With one metre of range noise the 1σ ellipse is <span class="m">${fmtNum(E.major, 2)} × ${fmtNum(E.minor, 2)} m</span>, and the clock is uncertain by <span class="m">${fmtNum(D.tdop / C_KM_S * 1e6, 2)} ns</span>.`;
        } else sum = '<span class="c">No fix.</span> Two satellites share one line of sight and the equations have lost a direction.';
        return tbl(['satellite', 'orbit angle', 'elevation', 'range'], rowsH).replace('<th>range</th>', '<th class="hx">range</th>') + `<p class="wa-sum">${sum}</p>`;
      }
      if (beat === 4) {
        const cr = clockRate(), f = fix5(), dd = b5.days;
        const row = (name, frac, on, cls = on ? '' : 'dim') => `<tr${cls ? ` class="${cls}"` : ''}><td>${name}</td><td class="hx">${sci(frac, 4)}</td><td>${fmtSigned(usPerDay(frac), 3)} μs</td><td>${fmtSigned(usPerDay(frac) * dd, 2)} μs</td></tr>`;
        const netFrac = (b5.gr ? cr.grav : 0) + (b5.sr ? cr.vel : 0) - (b5.detuned ? FACTORY : 0);
        const rowsH = [row('gravity', cr.grav, b5.gr), row('speed', cr.vel, b5.sr), row('factory', -FACTORY, b5.detuned), row('net', netFrac, true, 'now')];
        const moved = f.posErrKm < 1e-9 ? 'not at all (less than a micrometre, the limit of the arithmetic)' : `<span class="m">${fmtLen(f.posErrKm)}</span>`;
        let sum = `After <span class="m">${fmtNum(dd, 2)} days</span> each satellite clock leads by <span class="m">${fmtSigned(f.driftKm / US_KM, 2)} μs</span>, <span class="m">${fmtLen(f.driftKm, true)}</span> of range. The fix has moved ${moved}; the solved receiver clock has moved <span class="m">${fmtSigned(f.clockErrKm / US_KM, 3)} μs</span>.`;
        if (b5.e > 0) sum += ` Eccentricity ${b5.e.toFixed(4)} adds up to <span class="m">±${fmtNum(eccAmplitudeNs(b5.e), 1)} ns</span> (${fmtLen(eccTermKm(b5.e, 1))}) per satellite${b5.eccCorr ? ', and the receiver removes it' : ', different for each'}.`;
        return tbl(['effect', 'rate', 'per day', `after ${fmtNum(dd, 2)} d`], rowsH).replace('<th>rate</th>', '<th class="hx">rate</th>') + `<p class="wa-sum">${sum}</p>`;
      }
      const f = fix6();
      const rowsH = f.res.map((v, i) => tr([sN(f.idx[i]), fmtNum(f.rho[i], 3) + ' km', fmtSigned(v, 3) + ' km'], b6.forged && f.idx[i] === 1 ? 'bad' : ''));
      let sum = `The fix is <span class="m">${fmtLen(f.err)}</span> from you; the rms residual is <span class="m">${fmtNum(f.rms, 3)} km</span>.`;
      if (f.ex) {
        const k = f.ex.indexOf(Math.min(...f.ex));
        sum += ` Leave each satellite out in turn and solve again; the rms residual becomes ${f.ex.map((v, i) => `<em>${NAMES[f.idx[i]]}</em> <span class="${i === k && v < 1e-6 ? 'm v' : 'm'}">${fmtNum(v, 3)}</span>`).join(' · ')} km. ${f.ex[k] < 1e-6 && b6.forged ? `Only the set without <em>${NAMES[f.idx[k]]}</em> fits: <span class="v">the liar is named.</span>` : ''}`;
      }
      return tbl(['satellite', 'pseudorange', 'residual'], rowsH) + `<p class="wa-sum">${sum}</p>`;
    }
    let lastLedger = '', lastTextAt = 0, textPending = false;
    function refreshText(force = false) {
      const now = perfNow();
      if (!force && now - lastTextAt < 0.09) { textPending = true; return; }   // retried by the next frame
      textPending = false;
      lastTextAt = now;
      const h = ledgerHTML();
      if (h !== lastLedger) { ledgerBody.innerHTML = h; lastLedger = h; }
    }

    /* ---------- sound: one bus, every pitch and time from the numbers ---------- */
    const bus = audio.createBus('whereami');
    const running = () => { const c = audio.getContext(); return !!(c && c.state === 'running'); };
    const clockNow = () => (running() ? audio.getContext().currentTime : perfNow());
    const SAT_PITCH = [659.25, 783.99, 587.33, 880, 523.25];
    function chime() {
      if (!running()) return;
      const t = audio.getContext().currentTime + 0.02;
      audio.playTone(bus, { freq: stepFreq(5), dur: 0.9, level: 0.18, when: t });
      audio.playTone(bus, { freq: stepFreq(5) * 1.5, dur: 1.1, level: 0.14, when: t + 0.09 });
    }
    // listening: a thock when the receiver's own clock ticks, a click when each signal arrives
    const lis = { on: false, slow: true, sched: null, events: [] };
    function startListen() {
      audio.ensureAudio();
      stopListen(true);
      lis.on = true; lis.events = [];
      const slowF = lis.slow ? 20 : 1, period = lis.slow ? 2.8 : 1;
      lis.sched = audio.createScheduler((t) => {
        const T0 = t + 0.05, r = recv();
        const dtRx = beat === 1 ? b2.b / C_KM_S : 0;          // receiver clock ahead by δt
        audio.drums.thock(bus, Math.max(t, T0 - dtRx * slowF), { level: 0.3 });
        for (const i of litIdx()) {
          const s = satP(i);
          audio.playTone(bus, {
            freq: SAT_PITCH[i], dur: 0.1, type: 'triangle', level: 0.17, attack: 0.003, release: 0.06,
            when: T0 + (dist(s, r) / C_KM_S) * slowF, pan: clamp(s[0] / A_GPS, -0.8, 0.8),
          });
        }
        lis.events.push({ T0, slowF });
        if (lis.events.length > 3) lis.events.shift();
        return t + period;
      });
      lis.sched.start(0.06);
      kick(0.2);
    }
    function stopListen(keepToggle = false) {
      if (lis.sched) lis.sched.stop();
      lis.sched = null; lis.on = false; lis.events = [];
      if (!keepToggle && listenTog) listenTog.set(false);
      dirty = true;
    }
    // the relativity beat: 440 Hz and 440 Hz + L1 × rate
    const rel = { lo: null, hi: null, phase: 0 };
    const beatNow = () => relBeatHz({ gr: b5.gr, sr: b5.sr, detuned: b5.detuned });
    function startRel() {
      audio.ensureAudio();
      stopRel();
      rel.lo = audio.voice(bus, { freq: 440, level: 0.15, attack: 0.3, release: 0.4 });
      rel.hi = audio.voice(bus, { freq: 440 + beatNow(), level: 0.15, attack: 0.3, release: 0.4 });
      rel.lo.on(); rel.hi.on(); rel.phase = 0;
      b5.sound = true;
      relBtn.classList.add('active'); relBtn.textContent = '♬ silence the beat';
      kick(0.1);
    }
    function stopRel() {
      if (rel.lo) { rel.lo.dispose(); rel.hi.dispose(); }
      rel.lo = rel.hi = null; b5.sound = false;
      if (relBtn) { relBtn.classList.remove('active'); relBtn.textContent = '♬ sound the relativity beat'; }
      dirty = true;
    }
    const updRel = () => { if (rel.hi) rel.hi.setFreq(440 + beatNow(), 0.3); };

    /* ---------- the parts ---------- */
    function questFor(k) {
      if (k === 0) return '<em>I · Two circles.</em> Two satellites, two true ranges, two circles, and Euclid’s two cuts. Claim the point that is you: click it, or use the buttons. Then drag <em>P</em> along the Earth and watch its twin.';
      if (k === 1) return '<em>II · The lying clock.</em> Your clock is off by a fraction of a millisecond, so all three circles are wrong by the same amount and leave a triangle. Find the clock error that closes it.';
      if (k === 2) return '<em>III · Let the sky solve it.</em> Press <em>solve</em>. Gauss–Newton starts at the centre of the Earth and finds your position and your clock together.';
      if (k === 3) return b4.phase === 0
        ? '<em>IV · Geometry is destiny.</em> Drag the satellites along their orbit, or use the controls. Crowd them together until GDOP passes 20.'
        : '<em>IV · Geometry is destiny.</em> Now spread them across your sky until GDOP falls below 2.';
      if (k === 4) return b5.sawDrift
        ? '<em>V · Einstein’s temperament.</em> The clocks drifted and the fix stayed put. Now give the orbits some eccentricity, with the receiver’s correction off.'
        : '<em>V · Einstein’s temperament.</em> Let a day or more pass without the relativity correction and watch what moves: the satellite clocks, the ranges, the fix, your clock.';
      return b6.sawLie && b6.n === 3
        ? '<em>VI · A liar in the sky.</em> Three satellites fit the lie perfectly. Add a fourth.'
        : '<em>VI · A liar in the sky.</em> Forge satellite <em>B</em>’s range by 30 km and see whether three satellites notice.';
    }
    const doneText = [
      () => { const g = g0(); return `Claimed. The other cut, <em>P′</em>, is ${fmtNum(Math.hypot(...g.far), 0)} km from the Earth’s centre, out beyond the satellites. The circles cannot tell it from you; the Earth can.`; },
      () => `Closed. Your clock was ${b2.b > 0 ? 'ahead' : 'behind'} by ${fmtNum(Math.abs(b2.b / US_KM) / 1000, 4)} ms, ${fmtLen(Math.abs(b2.b))} of light: three circles have fixed your place and your time. In space the same trick needs a fourth satellite.`,
      () => `Converged in ${b3.gn ? b3.gn.history.length - 1 : 6} steps, the correct digits doubling near the end. Now switch on the closed form, meet Bancroft’s second root, and tilt into spacetime.`,
      () => `GDOP went from ${fmtNum(b4.worst, 1)} to ${fmtNum(b4.best, 2)}. The same clocks and the same range noise now give an error ${fmtNum(b4.worst / b4.best, 0)} times smaller: geometry alone decided it.`,
      () => 'A drift shared by every clock moved only your solved time. A term that differs between satellites moves the fix itself, and that part every receiver must correct.',
      () => `With a spare satellite the lie no longer fits: residuals of up to ${fmtNum(Math.max(...fix6().res.map(Math.abs)), 1)} km give it away. Five satellites can name the liar.`,
    ];
    function markDone(k, quiet = false) {
      if (done[k]) return;
      done[k] = true;
      tabBtns[k].classList.add('done');
      if (k === beat) banner.done(doneText[k]());
      if (nextBtns[k]) nextBtns[k].style.display = '';
      if (!quiet) { chime(); kick(1); }
    }
    function refreshBanner() { if (done[beat]) banner.done(doneText[beat]()); else banner.set(questFor(beat)); }

    // I
    function claim(which) {
      const g = g0();
      if (which === 'near') { b1.claimAt = perfNow(); markDone(0); banner.done(doneText[0]()); }
      else {
        b1.wrongAt = perfNow();
        if (!done[0]) banner.set(`<em>P′</em> is ${fmtNum(Math.hypot(...g.far), 0)} km from the Earth’s centre, beyond the satellites themselves. It lies on both circles exactly as you do; it just is not on the Earth. Try the other cut.`);
        kick(1.5);
      }
    }
    function movedP() {                           // the claimed banner follows P′ as you walk
      dirty = true;
      if (beat === 0 && done[0]) banner.done(doneText[0]());
    }
    // II
    function newClock() {
      const us = (160 + Math.random() * 780) * (Math.random() < 0.5 ? -1 : 1);
      b2.b = us * US_KM; b2.closed = false; b2.snap = null;
      b2.coarse = 0; b2.fine = 0; b2.guessUs = 0;
      coarseSl.set(0); fineSl.set(0);
      dirty = true; kick(0.2);
    }
    function setGuess() {
      if (b2.snap) return;
      b2.guessUs = b2.coarse * 1000 + b2.fine;
      if (b2.closed && Math.abs(guessKm() - b2.b) > US_KM) b2.closed = false;
      dirty = true;
    }
    function startSnap(dur = 0.7) { b2.snap = { from: b2.guessUs, to: b2.b / US_KM, t0: perfNow(), dur: reduced ? 0.01 : dur }; kick(dur); }
    function finishClose() {
      b2.guessUs = b2.b / US_KM;
      const c = Math.round(b2.guessUs) / 1000;
      b2.coarse = c; b2.fine = b2.guessUs - c * 1000;
      coarseSl.set(c); fineSl.set(Math.round(b2.fine * 10) / 10);
      b2.closed = true; b2.closeAt = perfNow();
      markDone(1);
      refreshBanner();
    }
    // III
    function resetSolve() {
      b3.gn = null; b3.shown = -1; b3.queue = []; bancCache = null;
      if (b3.spacetime) ensureSolved();
      dirty = true; kick(0.1);
    }
    function ensureSolved() {
      if (!b3.gn) b3.gn = solveGN(sats3(), rho3());
      b3.queue = []; b3.shown = b3.gn.history.length - 1; b3.hopT0 = -9; b3.convAt = perfNow();
    }
    function solve3() {
      audio.ensureAudio();
      const g = solveGN(sats3(), rho3());
      b3.gn = g; b3.shown = 0; b3.hopT0 = perfNow(); b3.queue = [];
      // bind the clock now: visuals follow the audio clock when it is running, else wall time
      const c = audio.getContext(), live = running();
      b3.clk = live ? () => c.currentTime : perfNow;
      const t0 = b3.clk() + 0.15, gap = reduced ? 0.35 : 0.62;
      let tonicHit = false;
      g.history.forEach((h, k) => {
        const at = t0 + k * gap;
        if (k > 0) b3.queue.push({ k, at });
        if (c && !tonicHit) {
          const st = rmsStep(h.rms);
          const when = live ? at : c.currentTime + 0.15 + k * gap;
          audio.playTone(bus, { freq: stepFreq(st), dur: 0.55, level: 0.22, when });
          audio.drums.wood(bus, when, { pitch: stepFreq(st) * 4, level: 0.08 });
          if (st === 0) tonicHit = true;
        }
      });
      if (b3.spacetime) { b3.spacetime = false; stTog.set(false); }
      kick(0.3);
    }
    // IV
    function afterDop() {
      const D = dop4();
      if (b4.phase === 0 && D && D.gdop > 20) { b4.phase = 1; b4.worst = D.gdop; if (!done[3]) banner.set(questFor(3)); }
      else if (b4.phase === 1 && D && !done[3]) {
        b4.worst = Math.max(b4.worst, D.gdop);
        // judge the spread once a preset glide has landed, so the ratio reports where it stopped
        if (D.gdop < 2 && !b4.glide) { b4.best = D.gdop; markDone(3); }
      }
      dirty = true;
    }
    function presetDop(to) {
      b4.glide = { from: b4.deg.slice(), to, t0: perfNow(), dur: reduced ? 0.01 : 0.8 };
      kick(0.9);
    }
    // V
    function relChanged() {
      const f = fix5();
      if (!b5.sawDrift && b5.days >= 1 && Math.abs(f.driftKm) > 1) { b5.sawDrift = true; if (!done[4]) banner.set(questFor(4)); }
      if (b5.sawDrift && b5.e > 0 && !b5.eccCorr && f.posErrKm > 1e-3) markDone(4);
      updRel();
      dirty = true;
    }
    function startLapse() {
      b5.lapse = { t0: perfNow(), from: b5.days >= 6.99 ? 0 : b5.days, dur: reduced ? 1.5 : 7 };
      kick(0.1);
    }
    // VI
    function liarChanged() {
      if (b6.forged && b6.n === 3) b6.sawLie = true;
      if (b6.forged && b6.n >= 4) markDone(5);
      if (!done[5]) banner.set(questFor(5)); else banner.done(doneText[5]());
      dirty = true;
    }

    /* ---------- controls ---------- */
    const nextBtns = [];
    const addNext = (k) => {
      if (!BEATS[k].next) return;
      const b = ui.button(rows[k], `next: ${BEATS[k].next} ▶`, () => setBeat(k + 1), { primary: true });
      b.classList.add('wa-next'); b.style.display = 'none';
      nextBtns[k] = b;
    };
    // I
    const standSl = ui.slider(rows[0], {
      label: 'where you stand', min: -60, max: 60, step: 0.5, value: 0,
      format: (v) => (v === 0 ? 'beneath the midpoint' : `${fmtSigned(v, 1)}° along the Earth`),
      onInput: (v) => { recvDeg = v; movedP(); },
    });
    ui.button(rows[0], '◎ claim P', () => claim('near'), { small: true });
    ui.button(rows[0], '◎ claim P′', () => claim('far'), { small: true });
    addNext(0);
    // II
    const coarseSl = ui.slider(rows[1], {
      label: 'your clock error, coarse', min: -1.5, max: 1.5, step: 0.001, value: 0,
      format: (v) => `${fmtSigned(v, 3)} ms`, onInput: (v) => { b2.coarse = v; setGuess(); },
    });
    const fineSl = ui.slider(rows[1], {
      label: 'fine', min: -40, max: 40, step: 0.1, value: 0,
      format: (v) => `${fmtSigned(v, 1)} μs`, onInput: (v) => { b2.fine = v; setGuess(); },
    });
    ui.button(rows[1], '↻ another clock', newClock, { small: true });
    ui.button(rows[1], 'show me', () => { if (!b2.closed) startSnap(1.6); }, { small: true });
    addNext(1);
    // III
    ui.button(rows[2], '▶ solve (Gauss–Newton)', solve3, { primary: true });
    ui.stepper(rows[2], { label: 'satellites', min: 3, max: 4, value: 4, onChange: (v) => { b3.n = v; resetSolve(); } });
    const bancTog = ui.toggle(rows[2], {
      label: 'closed form (Bancroft, 1985)', value: false,
      onChange: (v) => { b3.bancroft = v; if (!v && b3.spacetime) { b3.spacetime = false; stTog.set(false); } dirty = true; kick(0.1); },
    });
    const stTog = ui.toggle(rows[2], {
      label: 'tilt into spacetime', value: false,
      onChange: (v) => { b3.spacetime = v; if (v) { b3.bancroft = true; bancTog.set(true); ensureSolved(); } kick(0.1); },
    });
    addNext(2);
    // IV
    const satSel = ui.select(rows[3], {
      label: 'satellite', options: [0, 1, 2, 3].map((i) => ({ value: String(i), label: NAMES[i] })), value: '0',
      onChange: (v) => { b4.sel = +v; angSl.set(b4.deg[b4.sel]); dirty = true; },
    });
    const angSl = ui.slider(rows[3], {
      label: 'its angle round the orbit', min: -75, max: 75, step: 0.5, value: b4.deg[0],
      format: (v) => `${fmtSigned(v, 1)}°`, onInput: (v) => { b4.glide = null; b4.deg[b4.sel] = v; afterDop(); },
    });
    ui.button(rows[3], 'crowd them', () => presetDop([-5, 0, 5, 10]), { small: true });
    ui.button(rows[3], 'spread them', () => presetDop([-72, -24, 24, 72]), { small: true });
    ui.button(rows[3], 'reset', () => presetDop([-15, 20, -50, 55]), { small: true });
    addNext(3);
    // V
    const daysSl = ui.slider(rows[4], {
      label: 'days without correction', min: 0, max: 7, step: 0.01, value: 0,
      format: (v) => `${fmtNum(v, 2)} d`, onInput: (v) => { b5.lapse = null; b5.days = v; relChanged(); },
    });
    ui.button(rows[4], '▶ a week in seven seconds', startLapse, { small: true });
    ui.toggle(rows[4], { label: 'gravity (GR)', value: true, onChange: (v) => { b5.gr = v; relChanged(); } });
    ui.toggle(rows[4], { label: 'speed (SR)', value: true, onChange: (v) => { b5.sr = v; relChanged(); } });
    ui.toggle(rows[4], { label: 'factory clock at 10.22999999543 MHz', value: false, onChange: (v) => { b5.detuned = v; relChanged(); } });
    ui.slider(rows[4], {
      label: 'orbit eccentricity e', min: 0, max: 0.02, step: 0.0005, value: 0,
      format: (v) => v.toFixed(4), onInput: (v) => { b5.e = v; relChanged(); },
    });
    ui.toggle(rows[4], { label: 'receiver applies the e·sin E term', value: false, onChange: (v) => { b5.eccCorr = v; relChanged(); } });
    const relBtn = ui.button(rows[4], '♬ sound the relativity beat', () => { audio.ensureAudio(); if (b5.sound) stopRel(); else startRel(); });
    addNext(4);
    // VI
    ui.toggle(rows[5], { label: 'forge B’s range (+30 km)', value: false, onChange: (v) => { b6.forged = v; liarChanged(); } });
    ui.stepper(rows[5], { label: 'satellites', min: 3, max: 5, value: 3, onChange: (v) => { b6.n = v; liarChanged(); } });
    // listening (parts I and II)
    const listenTog = ui.toggle(listenRow, { label: '♪ listen to the signals', value: false, onChange: (v) => (v ? startListen() : stopListen(true)) });
    ui.toggle(listenRow, { label: 'slow time ×20', value: true, onChange: (v) => { lis.slow = v; if (lis.on) startListen(); } });

    function setBeat(k) {
      if (k === beat && rows[k].style.display !== 'none') return;
      if (k > 1 && lis.on) stopListen();
      if (beat === 4 && k !== 4) { stopRel(); b5.lapse = null; }
      beat = k;
      recvDeg = k === 0 ? standSl.value : 0;      // part I keeps where you stood; the rest stand beneath the midpoint
      rows.forEach((r, i) => { r.style.display = i === k ? '' : 'none'; });
      listenRow.style.display = k <= 1 ? '' : 'none';
      tabBtns.forEach((b, i) => { b.setAttribute('aria-selected', i === k ? 'true' : 'false'); b.tabIndex = i === k ? 0 : -1; });
      chartWrap.style.display = k === 4 || k === 5 ? '' : 'none';
      glossBody.innerHTML = GLOSS[k];
      if (k === 1 && b2.b === 0) newClock();
      bancCache = null; b2.shown = null;
      refreshBanner();
      lastLedger = ''; refreshText(true);
      dirty = true; kick(0.2);
    }
    tabs.addEventListener('keydown', (e) => {
      const n = BEATS.length;
      const k = e.key === 'ArrowRight' ? (beat + 1) % n : e.key === 'ArrowLeft' ? (beat + n - 1) % n
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (k < 0) return;
      setBeat(k); tabBtns[k].focus(); e.preventDefault();
    });

    /* ---------- pointer: claim cuts, walk the receiver, drag satellites ---------- */
    let drag = null, hoverSat = -1;
    function hitAt(px, py) {
      if (beat === 0) {
        const g = g0(), c = [];
        if (g.near) { c.push({ k: 'near', p: P3(...g.near), scene: true }); const q = lensPx(...g.near); if (inLens(q)) c.push({ k: 'near', p: q }); }
        if (g.far) c.push({ k: 'far', p: P3(...g.far), scene: true });
        let best = null;
        for (const h of c) { const d = Math.hypot(h.p[0] - px, h.p[1] - py); if (d < 18 && (!best || d < best.d)) best = { ...h, d }; }
        return best;
      }
      if (beat === 3) {
        let best = null;
        for (let i = 0; i < 4; i++) { const p = P3(...satP(i)); const d = Math.hypot(p[0] - px, p[1] - py); if (d < 20 && (!best || d < best.d)) best = { k: 'sat', i, d }; }
        return best;
      }
      return null;
    }
    const inScene = (px, py) => px >= scene.x && px <= scene.x + scene.w && py >= scene.y && py <= scene.y + scene.h;
    function onDown(e) {
      const [px, py] = cv.pointerPos(handle, e);
      const h = hitAt(px, py);
      if (!h) return;
      drag = { h, x0: px, y0: py, moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      if (h.k === 'sat') { b4.sel = h.i; satSel.set(String(h.i)); angSl.set(b4.deg[h.i]); b4.glide = null; dirty = true; }
    }
    function onMove(e) {
      const [px, py] = cv.pointerPos(handle, e);
      if (!drag) {
        const h = hitAt(px, py);
        canvas.style.cursor = !h ? 'default' : h.k === 'sat' || (h.k === 'near' && h.scene) ? 'grab' : 'pointer';
        const hs = h && h.k === 'sat' ? h.i : -1;
        if (hs !== hoverSat) { hoverSat = hs; dirty = true; }
        return;
      }
      if (Math.hypot(px - drag.x0, py - drag.y0) > 4) drag.moved = true;
      if (!drag.moved || !inScene(px, py)) return;
      canvas.style.cursor = 'grabbing';
      const w = S2W(px, py), ang = Math.atan2(w[0], w[1]) * 180 / Math.PI;
      if (drag.h.k === 'near' && drag.h.scene) { recvDeg = Math.round(clamp(ang, -60, 60) * 2) / 2; standSl.set(recvDeg); movedP(); }
      else if (drag.h.k === 'sat') { b4.deg[drag.h.i] = Math.round(clamp(ang, -75, 75) * 2) / 2; angSl.set(b4.deg[drag.h.i]); afterDop(); }
    }
    function onUp(e) {
      if (drag && !drag.moved && (drag.h.k === 'near' || drag.h.k === 'far')) claim(drag.h.k);
      drag = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
    }
    function onLeave() { if (!drag && hoverSat !== -1) { hoverSat = -1; dirty = true; } }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    /* ---------- the frame ---------- */
    function update(dt, now) {
      let active = false;
      if (beat === 1) {
        if (b2.snap) {
          const f = clamp((now - b2.snap.t0) / b2.snap.dur, 0, 1), e = 1 - Math.pow(1 - f, 3);
          b2.guessUs = b2.snap.from + (b2.snap.to - b2.snap.from) * e;
          if (f >= 1) { b2.snap = null; finishClose(); }
          active = true;
        }
        const tgt = target2();
        if (!b2.shown || b2.shown.length !== tgt.length) b2.shown = tgt.slice();
        const k = reduced ? 1 : 1 - Math.exp(-dt / 0.06);
        for (let i = 0; i < tgt.length; i++) {
          const d = tgt[i] - b2.shown[i];
          if (Math.abs(d) > 1e-6) { b2.shown[i] += d * k; active = true; } else b2.shown[i] = tgt[i];
        }
        if (!b2.closed && !b2.snap && Math.abs(guessKm() - b2.b) <= US_KM) startSnap();
      }
      if (beat === 2) {
        if (b3.queue.length) {
          const cn = (b3.clk || clockNow)();
          while (b3.queue.length && b3.queue[0].at <= cn) {
            const q = b3.queue.shift();
            b3.shown = q.k; b3.hopT0 = now;
            if (q.k === b3.gn.history.length - 1) { b3.convAt = now; markDone(2); }
          }
          active = true;
        }
        if (now - b3.hopT0 < 0.5) active = true;
        const tt = b3.spacetime ? 1 : 0;
        if (Math.abs(b3.tilt - tt) > 1e-3) { b3.tilt += (tt - b3.tilt) * (reduced ? 1 : 1 - Math.exp(-dt / 0.32)); active = true; }
        else b3.tilt = tt;
      } else b3.tilt = 0;
      tiltE = b3.tilt < 1e-3 ? 0 : b3.tilt * b3.tilt * (3 - 2 * b3.tilt);
      const lv = beat === 2 && b3.spacetime ? 0 : 1;
      if (Math.abs(lensVis - lv) > 1e-3) { lensVis += (lv - lensVis) * (reduced ? 1 : 1 - Math.exp(-dt / 0.25)); active = true; } else lensVis = lv;
      if (beat === 3 && b4.glide) {
        const f = clamp((now - b4.glide.t0) / b4.glide.dur, 0, 1), e = f * f * (3 - 2 * f);
        b4.deg = b4.glide.from.map((a, i) => a + (b4.glide.to[i] - a) * e);
        angSl.set(Math.round(b4.deg[b4.sel] * 2) / 2);
        if (f >= 1) { b4.glide = null; b4.deg = b4.deg.map((a) => Math.round(a * 2) / 2); }
        afterDop(); active = true;
      }
      if (beat === 4) {
        if (b5.lapse) {
          const f = clamp((now - b5.lapse.t0) / b5.lapse.dur, 0, 1);
          b5.days = b5.lapse.from + (7 - b5.lapse.from) * f;
          daysSl.set(Math.round(b5.days * 100) / 100);
          if (f >= 1) b5.lapse = null;
          relChanged(); active = true;
        }
        if (b5.sound && rel.lo) { rel.phase += Math.PI * beatNow() * dt; active = true; }
      }
      if (lis.on && running()) active = true;
      return active;
    }
    function frame(dt) {
      const now = perfNow();
      let active = now < animUntil;
      active = update(dt, now) || active;
      active = easeViews(dt) || active;
      if (!dirty && !active) { if (textPending) refreshText(); return; }
      dirty = false;
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.rect(scene.x, scene.y, scene.w, scene.h); ctx.clip();
      drawScene(ctx, now);
      ctx.restore();
      if (lensVis > 0.01) { drawLensMarker(ctx); drawLens(ctx, now); }
      if (beat === 4 || beat === 5) drawChart();
      refreshText();
    }
    const loop = cv.rafLoop(frame);
    handle.onResize(() => { layout(); cam.init = false; lens.init = false; dirty = true; });
    chart.onResize(() => { dirty = true; });

    layout();
    setBeat(0);
    loop.start();

    return {
      pause() {
        loop.stop();
        stopListen(); stopRel();
        b5.lapse = null;
        if (b3.queue.length) { ensureSolved(); markDone(2, true); }   // a solve cut short by pause lands, silently
        bus.mute();
      },
      resume() { bus.unmute(); dirty = true; loop.start(); },
      destroy() {
        loop.stop();
        stopListen(); stopRel();
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        bus.dispose();
        handle.destroy(); chart.destroy();
        styleEl.remove();
      },
    };
  },
};

/* ================= tests ================= */

export const _test = {
  C_KM_S, C_M_S, R_EARTH, A_GPS, GM, PHI0_C2, F0, L1, FACTORY, US_KM, VIS_DEG,
  satAt, dist, pseudoranges, solveLinear, solveGN, lor, bancroft2D, dop2D, errorEllipse,
  clockRate, usPerDay, eccAmplitudeNs, eccTermKm, orbitalSpeed, relBeatHz,
  circleCircle, circleTriangle, residuals, rmsOf, exclusionTest, relativityFix,
  rmsStep, stepFreq, niceStep, fmtNum, fmtSigned, fmtLen, sci,
  selfTest,
};
