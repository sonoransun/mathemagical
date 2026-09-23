// IV · 3 — The Checking Number
// Hamming’s seven-place code exactly as his 1950 paper numbers it: message in
// positions 3, 5, 6, 7, parity checks in 1, 2, 4, and the failing checks, read
// right to left, form the “checking number” that names the broken position.
// Two errors and the Fano line; Hamming’s eighth digit (SECDED); the perfect
// packing 16 × 8 = 2⁷ and Golay’s Pascal-triangle sums; Reed–Solomon over GF(2⁸)
// inside a real, scannable version-2 QR code the visitor can scratch; and
// Shannon’s capacity as the horizon. Every picture is computed, never drawn from
// a table of pictures.

/* =====================================================================
   PURE CORE (no DOM; importable and testable under node)
   ===================================================================== */

// ---------- Hamming 1950: positions 1..7; w[0] is the SECDED (eighth) digit ----------
// Hamming’s Table III, “Decimal Value of Symbol” 0..15, positions 1..7 (BSTJ 29, p. 153).
const TABLE_III = [
  '0000000', '1101001', '0101010', '1000011', '1001100', '0100101', '1100110', '0001111',
  '1110000', '0011001', '1011010', '0110011', '0111100', '1010101', '0010110', '1111111',
];

function hammingEncode(v) {            // v = Hamming’s decimal value: bits in 3, 5, 6, 7, MSB first
  const w = [0, 0, 0, 0, 0, 0, 0, 0];
  w[3] = (v >> 3) & 1; w[5] = (v >> 2) & 1; w[6] = (v >> 1) & 1; w[7] = v & 1;
  w[1] = w[3] ^ w[5] ^ w[7];           // check 1 watches 1, 3, 5, 7
  w[2] = w[3] ^ w[6] ^ w[7];           // check 2 watches 2, 3, 6, 7
  w[4] = w[5] ^ w[6] ^ w[7];           // check 4 watches 4, 5, 6, 7
  w[0] = w[1] ^ w[2] ^ w[3] ^ w[4] ^ w[5] ^ w[6] ^ w[7];
  return w;
}
const hammingValue = (w) => (w[3] << 3) | (w[5] << 2) | (w[6] << 1) | w[7];
// The checking number: XOR of the positions holding a 1 (check 1 is the rightmost digit).
function syndrome(w) { let s = 0; for (let p = 1; p <= 7; p++) if (w[p]) s ^= p; return s; }
function circleChecks(w) { const s = syndrome(w); return [s & 1, (s >> 1) & 1, (s >> 2) & 1]; }
function parity8(w) { let x = 0; for (let p = 0; p <= 7; p++) x ^= w[p] & 1; return x; }
function secded(w) {                    // Hamming §4: single corrected, double detected
  const s = syndrome(w), par = parity8(w);
  if (s === 0 && par === 0) return { status: 'clean', pos: -1 };
  if (par === 1) return { status: 'corrected', pos: s };   // s = 0 → the eighth digit itself
  return { status: 'double', pos: -1 };
}
function hammingDecode(w) { const s = syndrome(w), c = w.slice(); if (s) c[s] ^= 1; return { s, word: c, value: hammingValue(c) }; }
const fanoLine = (p, q) => p ^ q;
const FANO_LINES = [[1, 2, 3], [1, 4, 5], [1, 6, 7], [2, 4, 6], [2, 5, 7], [3, 4, 7], [3, 5, 6]];
const wordString = (w) => w.slice(1, 8).join('');
function mosaicWord(v, s) { const w = hammingEncode(v); if (s) w[s] ^= 1; return w; }   // cell (v, s)
function locateWord(w) { const d = hammingDecode(w); return { v: d.value, s: d.s }; }
function weightDistribution() {
  const d = new Array(8).fill(0);
  for (let v = 0; v < 16; v++) d[hammingEncode(v).slice(1).reduce((a, b) => a + b, 0)]++;
  return d;
}

// ---------- counting and Shannon ----------
function binom(n, k) { let r = 1n; for (let i = 0n; i < BigInt(k); i++) r = r * (BigInt(n) - i) / (i + 1n); return r; }
function ballVolume(n, t) { let s = 0n; for (let i = 0; i <= t; i++) s += binom(n, i); return s; }
const H2 = (p) => (p <= 0 || p >= 1) ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
const bscCapacity = (p) => 1 - H2(p);
function pAtLeast(n, k, p) { let s = 0; for (let i = k; i <= n; i++) s += Number(binom(n, i)) * p ** i * (1 - p) ** (n - i); return s; }
const hammingBlockError = (p) => pAtLeast(7, 2, p);
const uncodedBlockError = (p, k = 4) => 1 - (1 - p) ** k;
function capacityCrossing(rate) {       // the p at which 1 − H(p) falls to `rate`
  let lo = 1e-12, hi = 0.5;
  for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (bscCapacity(m) > rate) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Send `blocks` random 4-bit messages through a binary symmetric channel twice:
// once as Hamming codewords (decoded), once bare. Counts wrong blocks.
function simulateBSC(p, blocks, rng, keep = 96) {
  let hamWrong = 0, hamFixed = 0, uncWrong = 0;
  const recent = [];
  for (let b = 0; b < blocks; b++) {
    const v = Math.floor(rng() * 16), w = hammingEncode(v);
    let flips = 0;
    for (let q = 1; q <= 7; q++) if (rng() < p) { w[q] ^= 1; flips |= 1 << q; }
    const ok = hammingDecode(w).value === v;
    if (!ok) hamWrong++; else if (flips) hamFixed++;
    let u = 0; for (let q = 0; q < 4; q++) if (rng() < p) u = 1;
    uncWrong += u;
    if (b >= blocks - keep) recent.push({ v, flips, ok });
  }
  return { blocks, hamWrong, hamFixed, uncWrong, recent };
}

// ---------- GF(2⁸) as QR uses it: x⁸ + x⁴ + x³ + x² + 1 (0x11D), α = 2 ----------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
const gdiv = (a, b) => { if (!b) throw new Error('GF(256): division by zero'); return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0; };
const gpow = (e) => EXP[((e % 255) + 255) % 255];
function gfOrder(a) { if (!a) return 0; let x = a, k = 1; while (x !== 1) { x = gmul(x, a); k++; } return k; }
function primitiveCount() { let c = 0; for (let a = 1; a < 256; a++) if (gfOrder(a) === 255) c++; return c; }

// ---------- Reed–Solomon (QR’s BCH view, first consecutive root α⁰) ----------
function rsGenerator(nsym) {            // ∏_{i<nsym} (x − αⁱ), highest degree first
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    const r = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { r[j] ^= g[j]; r[j + 1] ^= gmul(g[j], gpow(i)); }
    g = r;
  }
  return g;
}
function rsEncode(data, nsym) {         // the nsym check bytes: remainder of data·x^nsym mod g
  const g = rsGenerator(nsym), rem = new Array(nsym).fill(0);
  for (const d of data) {
    const f = d ^ rem.shift(); rem.push(0);
    if (f) for (let j = 0; j < nsym; j++) rem[j] ^= gmul(g[j + 1], f);
  }
  return rem;
}
const polyEvalHi = (p, x) => { let y = 0; for (const c of p) y = gmul(y, x) ^ c; return y; };
// S_j = r(αʲ): a Fourier transform over the field; all zero exactly for codewords.
function rsSyndromes(cw, nsym) { const S = []; for (let j = 0; j < nsym; j++) S.push(polyEvalHi(cw, gpow(j))); return S; }

// Errors-and-erasures decoder: Berlekamp–Massey (seeded with the erasure locator),
// Chien search over every position, Forney for the values.
function rsDecode(cw, nsym, erasePos = []) {
  const n = cw.length, S = rsSyndromes(cw, nsym);
  if (S.every((s) => s === 0)) return { ok: true, cw: cw.slice(), errPos: [], errVals: [], syndromes: S, lambda: [1], roots: [] };
  const eras = [...new Set(erasePos)].filter((i) => i >= 0 && i < n);
  if (eras.length > nsym) return { ok: false, reason: 'too many erasures', syndromes: S, lambda: [1], roots: [] };
  const X = (i) => gpow(n - 1 - i);    // locator of array index i
  let Gam = [1];                        // polynomials low degree first
  for (const i of eras) {
    const r = new Array(Gam.length + 1).fill(0);
    for (let j = 0; j < Gam.length; j++) { r[j] ^= Gam[j]; r[j + 1] ^= gmul(Gam[j], X(i)); }
    Gam = r;
  }
  const e = eras.length;
  let Lam = Gam.slice(), B = Gam.slice(), L = e, m = 1, b = 1;
  for (let r = e; r < nsym; r++) {
    let d = S[r];
    for (let j = 1; j < Lam.length; j++) if (r - j >= 0) d ^= gmul(Lam[j], S[r - j]);
    if (d === 0) { m++; continue; }
    const coef = gdiv(d, b), T = Lam.slice();
    while (Lam.length < B.length + m) Lam.push(0);
    for (let j = 0; j < B.length; j++) Lam[j + m] ^= gmul(coef, B[j]);
    if (2 * L <= r + e) { L = r + 1 + e - L; B = T; b = d; m = 1; } else m++;
  }
  while (Lam.length > 1 && Lam[Lam.length - 1] === 0) Lam.pop();
  const deg = Lam.length - 1;
  const roots = [];                     // Chien search: Λ(X_i⁻¹) = 0
  for (let i = 0; i < n; i++) {
    const xinv = gpow(-(n - 1 - i));
    let y = 0; for (let j = Lam.length - 1; j >= 0; j--) y = gmul(y, xinv) ^ Lam[j];
    if (y === 0) roots.push(i);
  }
  const base = { syndromes: S, lambda: Lam, roots };
  if (2 * (deg - e) + e > nsym) return { ...base, ok: false, reason: 'beyond capacity' };
  if (roots.length !== deg) return { ...base, ok: false, reason: 'locator does not split' };
  const Om = new Array(nsym).fill(0);   // Ω = S·Λ mod x^nsym
  for (let i = 0; i < nsym; i++) for (let j = 0; j < Lam.length && j <= i; j++) Om[i] ^= gmul(S[i - j], Lam[j]);
  const out = cw.slice(), errVals = [];
  for (const i of roots) {
    const xi = X(i), xinv = gpow(-(n - 1 - i));
    let om = 0; for (let j = Om.length - 1; j >= 0; j--) om = gmul(om, xinv) ^ Om[j];
    let dl = 0; for (let j = 1; j < Lam.length; j += 2) dl ^= gmul(Lam[j], gpow(-(n - 1 - i) * (j - 1)));
    if (!dl) return { ...base, ok: false, reason: 'forney' };
    const ev = gmul(xi, gdiv(om, dl));  // Forney, first root α⁰
    errVals.push(ev); out[i] ^= ev;
  }
  if (!rsSyndromes(out, nsym).every((s) => s === 0)) return { ...base, ok: false, reason: 'residual syndrome' };
  return { ...base, ok: true, cw: out, errPos: roots, errVals };
}

// ---------- QR version 2 (25 × 25), byte mode, one RS block at every level ----------
const QR_N = 25;
const QR_V2 = {
  L: { data: 34, ec: 10, bits: 1, cap: 32 }, M: { data: 28, ec: 16, bits: 0, cap: 26 },
  Q: { data: 22, ec: 22, bits: 3, cap: 20 }, H: { data: 16, ec: 28, bits: 2, cap: 14 },
};
function formatBits(level, mask) {      // BCH(15,5), generator 10100110111, XOR mask 101010000010010
  const data = (QR_V2[level].bits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function textBytes(str) { return [...String(str)].map((ch) => ch.charCodeAt(0)).filter((c) => c >= 32 && c <= 126); }
function dataCodewords(bytes, level) {  // ISO 18004 byte mode: 0100, 8-bit count, data, terminator, pads
  const cap = QR_V2[level].data, bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
  if (bits.length > cap * 8) throw new Error('message too long for version 2-' + level);
  for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, x) => (a << 1) | x, 0));
  for (let pad = 0xec; out.length < cap; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}
const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];
function functionGrid() {              // finder eyes, separators, timing, alignment, format reserve, dark module
  const N = QR_N;
  const mod = Array.from({ length: N }, () => new Array(N).fill(0));
  const fn = Array.from({ length: N }, () => new Array(N).fill(false));
  const set = (r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) { mod[r][c] = v ? 1 : 0; fn[r][c] = true; } };
  for (let i = 0; i < N; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (r0, c0) => {
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
      const d = Math.max(Math.abs(dr), Math.abs(dc)); set(r0 + dr, c0 + dc, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(3, N - 4); finder(N - 4, 3);
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(18 + dr, 18 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  for (let i = 0; i < 9; i++) if (i !== 6) { set(8, i, 0); set(i, 8, 0); }   // format areas (the timing modules stay)
  for (let i = 0; i < 8; i++) { set(8, N - 1 - i, 0); set(N - 1 - i, 8, 0); }
  set(N - 8, 8, 1);                                                   // dark module (row 17, col 8)
  return { mod, fn };
}
function drawFormat(mod, bits) {        // two copies of the 15 format bits
  const N = QR_N, b = (i) => (bits >> i) & 1;
  for (let i = 0; i <= 5; i++) mod[i][8] = b(i);
  mod[7][8] = b(6); mod[8][8] = b(7); mod[8][7] = b(8);
  for (let i = 9; i < 15; i++) mod[8][14 - i] = b(i);
  for (let i = 0; i < 8; i++) mod[8][N - 1 - i] = b(i);
  for (let i = 8; i < 15; i++) mod[N - 15 + i][8] = b(i);
  mod[N - 8][8] = 1;
}
let _order = null;
function dataOrder() {                  // module coordinates in zigzag placement order (359 for V2)
  if (_order) return _order;
  const N = QR_N, { fn } = functionGrid(), order = [];
  for (let right = N - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) {
      const c = right - j, upward = ((right + 1) & 2) === 0, r = upward ? N - 1 - vert : vert;
      if (!fn[r][c]) order.push([r, c]);
    }
  }
  _order = order;
  return order;
}
function codewordModules() {           // the 8 modules of each of the 44 codewords
  const order = dataOrder(), tiles = [];
  for (let k = 0; k < 44 * 8; k++) (tiles[k >> 3] ||= []).push(order[k]);
  return tiles;
}
function penalty(m) {                   // ISO 18004 mask penalty (rule 3 as commonly implemented)
  const N = QR_N;
  let p = 0;
  const lines = [];
  for (let i = 0; i < N; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
  for (const L of lines) {
    let run = 1;
    for (let i = 1; i <= N; i++) {
      if (i < N && L[i] === L[i - 1]) run++;
      else { if (run >= 5) p += 3 + (run - 5); run = 1; }
    }
    for (let i = 0; i + 7 <= N; i++) {
      if (L[i] && !L[i + 1] && L[i + 2] && L[i + 3] && L[i + 4] && !L[i + 5] && L[i + 6]) {
        const before = i >= 4 && !L[i - 1] && !L[i - 2] && !L[i - 3] && !L[i - 4];
        const beforeEdge = i < 4 && [1, 2, 3, 4].every((k) => i - k < 0 || !L[i - k]);
        const after = [7, 8, 9, 10].every((k) => i + k >= N || !L[i + k]);
        if (before || beforeEdge || after) p += 40;
      }
    }
  }
  for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) {
    const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
  }
  let dark = 0; for (const row of m) for (const v of row) dark += v;
  p += (Math.ceil(Math.abs(dark * 20 - N * N * 10) / (N * N)) - 1) * 10;
  return p;
}
function placeCodewords(cw, level, mask) {
  const order = dataOrder(), { mod } = functionGrid(), bits = [];
  for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  order.forEach(([r, c], k) => { mod[r][c] = (k < bits.length ? bits[k] : 0) ^ (MASKS[mask](r, c) ? 1 : 0); });
  drawFormat(mod, formatBits(level, mask));
  return mod;
}
// Encode bytes (or a string) at a level; the encoder tries all eight masks and keeps the lowest penalty.
function qrEncode(input, level, forceMask = -1) {
  const bytes = typeof input === 'string' ? textBytes(input) : input;
  const data = dataCodewords(bytes, level), ec = rsEncode(data, QR_V2[level].ec), cw = data.concat(ec);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask >= 0 && mask !== forceMask) continue;
    const mod = placeCodewords(cw, level, mask), pen = penalty(mod);
    if (!best || pen < best.pen) best = { mod, mask, pen };
  }
  return { matrix: best.mod, mask: best.mask, penalty: best.pen, codewords: cw, data, ec, level, bytes };
}
const popcount = (x) => { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
function readFormat(mod) {             // nearest of the 32 valid format words, over both copies
  const N = QR_N;
  let f1 = 0, f2 = 0;
  for (let i = 0; i <= 5; i++) f1 |= mod[i][8] << i;
  f1 |= mod[7][8] << 6; f1 |= mod[8][8] << 7; f1 |= mod[8][7] << 8;
  for (let i = 9; i < 15; i++) f1 |= mod[8][14 - i] << i;
  for (let i = 0; i < 8; i++) f2 |= mod[8][N - 1 - i] << i;
  for (let i = 8; i < 15; i++) f2 |= mod[N - 15 + i][8] << i;
  let best = null;
  for (const lv of 'LMQH') for (let mask = 0; mask < 8; mask++) {
    const f = formatBits(lv, mask), d = Math.min(popcount(f ^ f1), popcount(f ^ f2));
    if (!best || d < best.d) best = { level: lv, mask, d };
  }
  return best;
}
function readCodewords(mod, level, mask) {
  const order = dataOrder(), n = QR_V2[level].data + QR_V2[level].ec, cw = new Array(n).fill(0);
  order.forEach(([r, c], k) => {
    if (k < n * 8) cw[k >> 3] |= (mod[r][c] ^ (MASKS[mask](r, c) ? 1 : 0)) << (7 - (k & 7));
  });
  return cw;
}
// Read a matrix as a scanner would (geometry known): format → level and mask → unmask →
// 44 codewords → Reed–Solomon. `erase` lists codeword indices the reader is told are bad.
function qrRead(mod, erase = []) {
  const fmt = readFormat(mod), spec = QR_V2[fmt.level];
  const received = readCodewords(mod, fmt.level, fmt.mask);
  const dec = rsDecode(received, spec.ec, erase);
  const out = { ...dec, level: fmt.level, mask: fmt.mask, formatDist: fmt.d, received };
  if (!dec.ok) return out;
  const d = dec.cw, len = ((d[0] & 15) << 4) | (d[1] >> 4), bytes = [];
  if (len > spec.cap) return { ...out, ok: false, reason: 'bad length' };
  for (let i = 0; i < len; i++) bytes.push(((d[1 + i] & 15) << 4) | (d[2 + i] >> 4));
  return { ...out, bytes, text: String.fromCharCode(...bytes) };
}
function finderDamage(mat, pristine) {  // worst fraction of a 7 × 7 finder eye that has changed
  let worst = 0;
  for (const [r0, c0] of [[0, 0], [0, QR_N - 7], [QR_N - 7, 0]]) {
    let d = 0;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (mat[r0 + r][c0 + c] !== pristine[r0 + r][c0 + c]) d++;
    worst = Math.max(worst, d / 49);
  }
  return worst;
}

/* =====================================================================
   THE EXHIBIT
   ===================================================================== */

export default {
  id: 'selfheal',
  movement: 4,
  title: 'The Checking Number',
  hook: 'Flip any bit and the damage writes down its own address. Scratch away a third of the code and it still says what it said.',
  era: '1948 – 2026 · Bell Labs, Lincoln Laboratory, JPL, Denso Wave, 3GPP',
  prose: `
    <p>Richard Hamming’s paper of April 1950 opens among relays. In the Model 5 relay computers
    that Bell Telephone Laboratories built for the Aberdeen Proving Ground, early observations found
    about two or three of their 8,900 relays failing every day. The machines checked their own work, so no
    failure passed unseen; but they ran, he wrote, “on an unattended basis over nights and week-ends,” and
    so “frequently the computations came to a halt.” Knowing that something has gone wrong is an
    old art. The herder’s <a href="#ex-tally">leftover pebble</a> says that a sheep is missing,
    never which one. Hamming wanted the checks to say where.</p>
    <p>His answer fits in seven places. The message goes in positions 3, 5, 6 and 7, and
    positions 1, 2 and 4 hold parity checks. Each check watches exactly the positions whose binary
    numeral has a 1 in its column: 1, 3, 5, 7 for the first, 2, 3, 6, 7 for the second, 4, 5, 6, 7
    for the third. When a word arrives, run the checks in order and write a 1 for each that fails.
    “When written from right to left,” Hamming explained, the result “may be regarded as a binary
    number and will be called the checking number.” It is the address of the damage. His own
    example takes the symbol for twelve, <code>0111100</code>, and spoils the fifth digit: the
    first check fails, the second holds, the third fails, and <code>101</code> is five. The
    Babylonian discovery that <a href="#ex-sixty">where a mark sits</a> decides what it is worth
    has become a repair manual.</p>
    <p>Two flips, and the code tells a lie. The checking number of errors at <em>p</em> and
    <em>q</em> is <em>p</em> ⊕ <em>q</em>, their binary sum without carries, which names a third,
    innocent position; the decoder mends it with complete confidence and lands on a different
    legitimate word. Hamming’s cure was an eighth digit, one parity check over everything. If it
    fails, trust the checking number. If it holds while the other checks complain, two digits have
    gone, and the machine should refuse to guess. Nothing in the seven-place code is wasted,
    either. Sixteen codewords, each with the seven words one flip away, account for
    16 × 8 = 128 = 2⁷, every possible word exactly once; Hamming counted them as spheres of
    radius one packed without overlap into the corners of a seven-dimensional cube. A code this
    tight is called <em>perfect</em>.</p>
    <p>Marcel Golay, at the Signal Corps laboratories in Fort Monmouth, went looking for others on
    a single page in June 1949. A perfect code, he noted, needs the first few numbers in a row of
    Pascal’s triangle to add up to a power of two, and a limited search turned up two cases. The
    sum 1 + 23 + 253 + 1771 = 2¹¹ gave him a 23-digit code that corrects any three errors, while
    1 + 90 + 4005 = 2¹², he proved in the same paragraph, belongs to no code at all. In 1973
    Aimo Tietäväinen proved that over finite fields the search is over: apart from trivial cases,
    every perfect code has the length and size of a Hamming code or of one of Golay’s.</p>
    <p>The code had been in print before Hamming’s paper. In July 1948 Claude Shannon’s <em>A
    Mathematical Theory of Communication</em> used it, “found by a method due to R. Hamming,” as
    its example of a code that matches a toy channel’s capacity exactly. The paper’s main claim was
    stranger. Send a thousand binary digits a second down a line that garbles one in a hundred,
    and the first impulse is to credit 990 bits a second; that ignores “the recipient’s lack of
    knowledge of where the errors occur,” and the true figure is 919. Below that capacity, Shannon
    proved, messages can pass with as few errors as anyone cares to demand. The proof works, he
    wrote, “not by exhibiting a coding method having the desired properties, but by showing that
    such a code must exist in a certain group of codes.” It took some forty-five years to build
    codes that come close.</p>
    <p>Codes that left the laboratory needed bigger letters. In 1960 Irving Reed and Gustave
    Solomon, staff members of MIT’s Lincoln Laboratory, made a message the coefficients of a
    polynomial and sent its values at every element of a finite field: any <em>m</em> of the values
    pin it down, and a corrupted one is outvoted. They noted that it might be the better choice when
    errors are “strongly correlated or occur in ‘bursts.’” In a QR code the letters are bytes, and the alphabet is a field of 256
    elements, one of the fields named for Évariste Galois, who died after a duel in 1832, aged
    twenty. Every nonzero byte in it is a power of a single generator, as every note of the
    chromatic scale is a stack of <a href="#ex-fifths">fifths</a>. Voyager 2 switched to an
    experimental Reed–Solomon encoder for Uranus and Neptune, cutting the coding overhead from one
    check bit per data bit to about one in five and the error rate from 5 × 10⁻³ to 10⁻⁶. The
    cross-interleaved Reed–Solomon code chosen for the compact disc was, as Kees Immink of Philips
    Research remembered it, “much better than that proposed by Philips, although extremely
    complicated at the time.”</p>
    <p>The card in the third station is a real QR code, drawn module by module from its bytes: at
    level H, sixteen of its forty-four bytes carry the message and twenty-eight are Reed–Solomon
    check bytes. Scratch
    it. When you lift your finger, the decoder does what every QR reader must. It evaluates the
    received bytes at twenty-eight powers of the generator, a Fourier transform taken over the
    finite field and silent for every clean card. It solves for a polynomial whose roots mark the
    damaged bytes, finds those roots by trying all forty-four positions, and works out what each
    byte should have been. It will mend any fourteen damaged codewords, or twenty-eight if you tell
    it where you scratched. Before you scratch past that, hold your phone to the screen. It runs the
    same algebra.</p>`,

  chronicle: [
    { year: 1948, date: 'July 1948', text: 'Claude Shannon’s <em>A Mathematical Theory of Communication</em> proves that below a channel’s capacity errors can be made as rare as desired, and prints a seven-symbol code “found by a method due to R. Hamming.”' },
    { year: 1949, date: 'June 1949', text: 'Marcel Golay of the Signal Corps Engineering Laboratories, Fort Monmouth, publishes a one-page note: sums along Pascal’s triangle lead him to a 23-bit code that corrects any three errors.' },
    { year: 1950, date: 'April 1950', text: 'Richard Hamming’s “Error Detecting and Error Correcting Codes” appears in the <em>Bell System Technical Journal</em>; its “checking number” names the position of a single error. He and Bernard Holbrook had filed a patent on 11 January.' },
    { year: 1960, date: 'June 1960', text: 'Irving Reed and Gustave Solomon of MIT’s Lincoln Laboratory publish “Polynomial Codes over Certain Finite Fields”: a message becomes a polynomial, sent as its values at every element of the field.' },
    { year: 1986, date: '1986 – 1989', text: 'At Uranus and Neptune, Voyager 2 uses an experimental on-board Reed–Solomon encoder, cutting coding overhead from 100 to about 20 percent and output bit errors from 5 × 10⁻³ to 10⁻⁶.' },
    { year: 1994, date: '1994', text: 'Denso Wave announces the QR Code, developed by Masahiro Hara and a single colleague; the auto industry adopts it for electronic kanban, Denso Wave declares that it will not exercise its patent, and ISO approves the code as a standard in 2000.' },
    { year: 2017, date: 'Dec 2017', text: 'The first version of 3GPP’s 5G New Radio coding specification, TS 38.212 (Release 15), assigns LDPC codes to the data channels and polar codes to the broadcast channel and to most control information.' },
    { year: 2024, date: 'Dec 2024', text: 'Google Quantum AI reports quantum error correction below the surface-code threshold: a 101-qubit distance-7 memory at 0.143 percent error per cycle, outliving its best physical qubit 2.4-fold.' },
  ],

  today: `
    <p>Every phone that reads a QR code runs the algebra of 1960. Denso Wave released the symbol in
    1994, the auto industry took it up for electronic kanban, the company declared that it would not
    exercise its patent, and ISO approved it as a standard in 2000. Its four Reed–Solomon levels restore roughly 7,
    15, 25 or 30 percent of a symbol’s codewords; level M is the one most often chosen.</p>
    <p>The radio in the same phone runs descendants of Shannon’s existence proof. The 5G
    specification TS 38.212 carries user data in low-density parity-check codes, Robert Gallager’s
    idea of 1962 that David MacKay and Radford Neal revived in 1996, and most control messages in
    Erdal Arıkan’s polar codes of 2009, proved to reach the capacity of symmetric binary channels with
    encoders and decoders of complexity <em>N</em> log <em>N</em>.</p>
    <p>The newest customers are qubits and locks. In December 2024 Google Quantum AI reported a
    surface-code memory whose logical error fell by a factor of 2.14 each time the code distance
    grew by two, reaching 0.143 percent per cycle with 101 qubits. In March 2025 NIST chose HQC, an
    encryption scheme built on error-correcting codes, as its backup to ML-KEM, the lattice scheme
    that browsers now pair with the elliptic curves of <a href="#ex-handshake">the handshake</a>.</p>`,

  sources: [
    { text: 'R. W. Hamming, “Error Detecting and Error Correcting Codes,” <em>Bell System Technical Journal</em> 29 (1950) 147–160', url: 'https://archive.org/details/bstj29-2-147' },
    { text: 'C. E. Shannon, “A Mathematical Theory of Communication,” <em>Bell System Technical Journal</em> 27 (1948) 379–423, 623–656', url: 'https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf' },
    { text: 'M. J. E. Golay, “Notes on Digital Coding,” <em>Proceedings of the IRE</em> 37 (1949) 657', url: 'https://doi.org/10.1109/JRPROC.1949.233620' },
    { text: 'I. S. Reed and G. Solomon, “Polynomial Codes over Certain Finite Fields,” <em>J. SIAM</em> 8 (1960) 300–304', url: 'https://doi.org/10.1137/0108018' },
    { text: 'A. Tietäväinen, “On the Nonexistence of Perfect Codes over Finite Fields,” <em>SIAM J. Appl. Math.</em> 24 (1973) 88–96', url: 'https://doi.org/10.1137/0124010' },
    { text: 'R. Ludwig and J. Taylor, <em>Voyager Telecommunications</em>, JPL DESCANSO Design and Performance Summary (2002), §6.2', url: 'https://descanso.jpl.nasa.gov/DPSummary/Descanso4--Voyager_new.pdf' },
    { text: 'K. A. S. Immink, “The CD Story,” <em>Journal of the AES</em> 46 (1998) 458–465', url: 'https://www.turing-machines.com/pdf/cdstory.pdf' },
    { text: 'DENSO WAVE, QR Code error correction feature (and the QR Code history page)', url: 'https://www.qrcode.com/en/about/error_correction.html' },
    { text: '3GPP TS 38.212 V15.0.0 (2017-12), NR; Multiplexing and channel coding (Release 15), Tables 5.3-1 and 5.3-2', url: 'https://www.3gpp.org/ftp/Specs/archive/38_series/38.212/' },
    { text: 'Google Quantum AI, “Quantum error correction below the surface code threshold,” <em>Nature</em> 638 (2025) 920–926', url: 'https://doi.org/10.1038/s41586-024-08449-y' },
  ],

  alt: 'Three overlapping parity circles over seven glowing bit lamps, with Hamming’s table of sixteen codewords and a Fano plane; a mosaic of all 128 seven-bit words; a real version-2 QR code on an ivory card that can be scratched and decoded; and Shannon’s capacity curve.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const VG = P.verdigris;
    const VG_DIM = '#3d7168';
    const CRB = P.crimsonBright;
    const GHOST = P.inkGhost;
    const IVORY = '#f3ecd8';
    const SERIF = (typeof getComputedStyle === 'function' && getComputedStyle(document.body).fontFamily) || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const bus = audio.createBus('selfheal');
    const F0 = 110;
    const nowP = () => performance.now() / 1000;
    let paused = false, destroyed = false;

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-selfheal .sh-tabs { display:flex; flex-wrap:wrap; gap:.45rem; margin:0 0 .9rem; }
      #ex-selfheal .sh-tabs .btn { font-variant: small-caps; letter-spacing:.08em; font-size:.9rem; }
      #ex-selfheal .sh-tabs .btn.active { border-color:${VG}; color:${IVORY}; background:rgba(98,179,164,.14); }
      #ex-selfheal .sh-station { display:none; }
      #ex-selfheal .sh-station.on { display:block; }
      #ex-selfheal canvas.sh-cv { display:block; border-radius:4px; background:${P.bg}; touch-action:pan-y; outline:none; }
      #ex-selfheal canvas.sh-cv:focus-visible { box-shadow: 0 0 0 2px ${P.bg}, 0 0 0 4px ${P.goldBright}; }
      #ex-selfheal canvas.sh-card { touch-action:none; background:transparent; cursor:crosshair; margin:0 auto; }
      #ex-selfheal .sh-pair { display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start; justify-content:center; }
      #ex-selfheal .sh-pair > canvas.sh-panel { flex:1 1 280px; }
      #ex-selfheal .sh-field { display:flex; flex-direction:column; gap:.3rem; }
      #ex-selfheal .sh-field span { font-size:.72rem; font-variant:small-caps; letter-spacing:.14em; color:${P.inkDim}; }
      #ex-selfheal input.sh-text { font-family:${MONO}; font-size:.95rem; color:${P.ink}; background:${P.bg};
        border:1px solid ${P.line}; border-radius:5px; padding:.4rem .6rem; width:13.5em; max-width:100%; letter-spacing:.06em; }
      #ex-selfheal input.sh-text:focus-visible { outline:2px solid ${P.goldBright}; outline-offset:1px; }
      #ex-selfheal .sh-seg { display:inline-flex; gap:.3rem; flex-wrap:wrap; }
      #ex-selfheal .sh-seg .btn { min-width:2.3rem; font-family:${MONO}; }
      #ex-selfheal .sh-note { color:${P.inkDim}; font-size:.86rem; font-style:italic; margin:.35rem .2rem 0; }
      #ex-selfheal .readout { margin-top:.7rem; }
      @media (max-width: 520px) {
        #ex-selfheal .sh-tabs { display:grid; grid-template-columns:1fr 1fr; }
        #ex-selfheal .sh-tabs .btn { padding:.35rem .4rem; font-size:.84rem; line-height:1.25; }
      }
    `;
    stage.appendChild(style);

    const el = (tag, cls, parent, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (parent) parent.appendChild(e);
      if (html != null) e.innerHTML = html;
      return e;
    };

    // HiDPI canvas whose size this exhibit controls (widths come from the stage).
    function mkCanvas(parent, cls, label) {
      const c = el('canvas', cls, parent);
      if (label) { c.setAttribute('role', 'img'); c.setAttribute('aria-label', label); }
      const ctx = c.getContext('2d');
      const h = { canvas: c, ctx, width: 0, height: 0, dpr: 1 };
      h.size = (w, hh) => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.max(40, Math.floor(w)); hh = Math.max(40, Math.floor(hh));
        if (w !== h.width || hh !== h.height || dpr !== h.dpr) {
          c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
          c.style.width = w + 'px'; c.style.height = hh + 'px';
          h.width = w; h.height = hh; h.dpr = dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      h.pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      return h;
    }
    const glow = {
      gold: cv.glowSprite(P.goldBright, 64), vg: cv.glowSprite(VG, 64),
      cr: cv.glowSprite(P.crimson, 64), ivory: cv.glowSprite('#f3ecd8', 64),
    };
    // text helpers
    function T(ctx, s, x, y, o = {}) {
      ctx.font = o.font || `13px ${SERIF}`;
      ctx.fillStyle = o.color || P.ink;
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.base || 'alphabetic';
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.fillText(s, x, y);
      if (o.alpha != null) ctx.globalAlpha = 1;
      return ctx.measureText(s).width;
    }
    function caps(ctx, s, x, y, color = P.inkDim, align = 'left', size = 11) {
      ctx.save();
      ctx.font = `${size}px ${SERIF}`;
      try { ctx.fontVariantCaps = 'all-small-caps'; ctx.letterSpacing = (size * 0.14).toFixed(1) + 'px'; } catch (e) { /* older canvas */ }
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      ctx.fillText(s, x, y);
      const w = ctx.measureText(s).width;
      ctx.restore();
      return w;
    }
    function rrect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
    const sup = (n) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
    const bin3 = (s) => ((s >> 2) & 1) + '' + ((s >> 1) & 1) + (s & 1);

    /* ---------- time: one queue of visual events, clocked by audio when it runs ---------- */
    const queue = [];                    // { at, clock: 'a' | 'p', fn }
    let cur = null;                      // the running sequence { events, i, sched }
    const tweens = [];                   // { until } — keep the loop alive for eased visuals
    const audioRunning = () => { const c = audio.getContext(); return !!(c && c.state === 'running'); };
    const clockNow = (k) => (k === 'a' ? (audio.getContext() ? audio.getContext().currentTime : 0) : nowP());
    function hold(seconds) { tweens.push({ until: nowP() + seconds }); requestDraw(); }
    function flushQueue() { while (queue.length) queue.shift().fn(); }
    function finishSeq() {
      flushQueue();
      if (cur) {
        const c = cur; cur = null;
        if (c.sched) c.sched.stop();
        for (let i = c.i; i < c.events.length; i++) if (c.events[i].show) c.events[i].show();
      }
    }
    // events: [{ t (s, ascending), play?(when), show?() }]
    function seq(events) {
      finishSeq();
      if (!events.length || paused) { for (const e of events) if (e.show) e.show(); requestDraw(); return; }
      const me = { events, i: 0, sched: null };
      cur = me;
      if (audioRunning()) {
        let base = null;
        me.sched = audio.createScheduler((t) => {
          if (cur !== me || me.i >= events.length) return null;
          if (base === null) base = t - events[0].t;
          const e = events[me.i++];
          const at = base + e.t;
          if (e.play) { try { e.play(at); } catch (err) { /* audio is best effort */ } }
          if (e.show) queue.push({ at, clock: 'a', fn: e.show });
          requestDraw();
          return me.i < events.length ? base + events[me.i].t : null;
        });
        me.sched.start(0.03);
      } else {
        const base = nowP() + 0.02;
        for (const e of events) if (e.show) queue.push({ at: base + e.t, clock: 'p', fn: e.show });
        me.i = events.length;
      }
      requestDraw();
    }

    /* ---------- audio: everything is a harmonic of 110 Hz ---------- */
    function tone(freq, when, dur = 0.4, level = 0.1, pan = 0, attack = 0.012, release = 0.22) {
      if (paused || !audioRunning()) return;
      audio.playTone(bus, { freq, when, dur, level: Math.min(level, 0.5), pan, attack, release });
    }
    function chord(word, when, dur = 1.4, level = 0.06) {
      for (let p = 1; p <= 7; p++) if (word[p]) tone(F0 * p, when + (p - 1) * 0.014, dur, level, (p - 4) / 7, 0.02, 0.55);
    }
    function wood(when, level = 0.05, pitch = 1320, pan = 0) {
      if (paused || !audioRunning()) return;
      try { audio.drums.wood(bus, when, { level, pitch }); } catch (e) { /* ignore */ }
      void pan;
    }
    function thock(when, level = 0.35) { if (!paused && audioRunning()) audio.drums.thock(bus, when, { level }); }
    const actxNow = () => (audio.getContext() ? audio.getContext().currentTime : 0);

    /* ---------- skeleton: tabs, quest, stations ---------- */
    const tabs = el('div', 'sh-tabs', stage);
    tabs.setAttribute('role', 'tablist');
    const quest = ui.questBanner(stage, '');
    const box = el('div', 'sh-stations', stage);
    const stations = [];
    let active = 0;
    function addStation(label) {
      const k = stations.length;
      const b = ui.button(tabs, label, () => showStation(k), { small: true });
      b.setAttribute('role', 'tab');
      b.id = `sh-tab-${k}`;
      b.setAttribute('aria-controls', `sh-panel-${k}`);
      const wrap = el('div', 'sh-station', box);
      wrap.setAttribute('role', 'tabpanel');
      wrap.id = `sh-panel-${k}`;
      wrap.setAttribute('aria-labelledby', b.id);
      const st = { k, btn: b, wrap, draw: () => {}, layout: () => {}, questHTML: '', questDone: false };
      stations.push(st);
      return st;
    }
    function setQuest(k, html, done = false) {
      stations[k].questHTML = html; stations[k].questDone = done;
      if (k === active) { if (done) quest.done(html); else quest.set(html); }
    }
    function showStation(k) {
      finishSeq();
      active = k;
      stations.forEach((s, i) => {
        s.wrap.classList.toggle('on', i === k);
        s.btn.classList.toggle('active', i === k);
        s.btn.setAttribute('aria-selected', String(i === k));
      });
      setQuest(k, stations[k].questHTML, stations[k].questDone);
      layoutAll();
      requestDraw(k);
    }

    /* ---------- render on change: the loop runs only while something moves ---------- */
    const dirty = new Set();
    function requestDraw(k = active) {
      dirty.add(k);
      if (!paused && !destroyed) loop.start();
    }
    function frame() {
      const tp = nowP();
      while (queue.length && queue[0].at <= clockNow(queue[0].clock)) queue.shift().fn();
      for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].until <= tp) tweens.splice(i, 1);
      const moving = queue.length > 0 || tweens.length > 0 || (cur && cur.sched && cur.sched.playing);
      if (moving) dirty.add(active);
      const ks = [...dirty];
      dirty.clear();
      for (const k of ks) { try { stations[k].draw(tp); } catch (err) { console.error(err); } }
      if (!moving && dirty.size === 0) loop.stop();
    }
    const loop = cv.rafLoop(frame);

    /* =================================================================
       STATION I — the checking number
       ================================================================= */
    const st1 = addStation('i · the checking number');
    const s1 = {
      sentV: 12, recv: hammingEncode(12), secded: false,
      reveal: 7, result: true, named: -1, arcT: -1, flash: {}, frameFlash: -1,
      outcome: null, hover: null, quest: 0,
    };
    const sent1 = () => hammingEncode(s1.sentV);
    const c1 = mkCanvas(st1.wrap, 'sh-cv', 'Hamming’s seven-position code as three overlapping parity circles. Keys 1 to 7 flip bits, 0 flips the eighth bit, R repairs.');
    c1.canvas.tabIndex = 0;
    const row1 = ui.controlRow(st1.wrap);
    const repairBtn = ui.button(row1, 'repair', () => repair1(), { primary: true });
    ui.button(row1, 'Hamming’s own example', () => hammingExample());
    ui.button(row1, 'clear the errors', () => { finishSeq(); s1.recv = sent1(); s1.outcome = null; s1.named = -1; refresh1(); });
    const secdedT = ui.toggle(row1, { label: 'the eighth bit (SECDED)', value: false, onChange: (v) => setSecded(v) });
    const r1 = ui.readout(st1.wrap, '');
    ui.caption(st1.wrap, 'Hamming’s own numbering: the message sits in positions 3, 5, 6 and 7, the checks in 1, 2 and 4. ' +
      'A lamp is lit for a 1. A circle turns crimson when its parity fails, and the tiles read the failures right to left, as Hamming wrote them. ' +
      'Every word also sounds: position <em>p</em> is the <em>p</em>-th harmonic of 110 Hz, so the three checks, weights 1, 2 and 4, are octaves. ' +
      'Click a row of Table III to send a different word. Keys 1–7 flip bits, 0 flips the eighth, R repairs.');

    let L1 = null;
    function layout1(W) {
      const wide = W >= 880;
      const L = { W, wide };
      if (wide) {
        L.H = 500;
        L.tbl = { x: 16, y: 18, w: 188, h: L.H - 36 };
        L.rw = 244; L.rx = W - L.rw - 18;
        const midL = L.tbl.x + L.tbl.w + 30, midR = L.rx - 30;
        L.R = Math.min(112, (midR - midL - 80) / 3.05, 106);
        L.cx = (midL + midR) / 2; L.cy = 52 + 1.29 * L.R;
        L.word = { x: L.rx, y: 30, w: L.rw };
        L.fano = { cx: L.rx + L.rw / 2, cy: 282, r: 74 };
        L.verdict = { x: L.rx + L.rw / 2, y: 420 };
      } else {
        L.R = Math.max(54, Math.min(100, (W - 64) / 3.05));
        L.cx = W / 2; L.cy = 26 + 30 + 1.29 * L.R;
        let y = L.cy + 1.58 * L.R + 34;
        L.tilesY = y + 14; y = L.tilesY + 96;
        L.verdict = { x: W / 2, y: y + 6 }; y += 58;
        if (W >= 560) {
          L.word = { x: 18, y, w: W / 2 - 30 };
          L.fano = { cx: W * 0.75, cy: y + 110, r: Math.min(74, W / 8) };
          y += 228;
        } else {
          L.word = { x: Math.max(10, (W - 236) / 2), y, w: Math.min(236, W - 20) };
          y += 140;
          const fr = Math.min(70, W / 4.4);
          L.fano = { cx: W / 2, cy: y + fr + 44, r: fr };
          y += 2 * fr + 104;
        }
        L.gridCols = W >= 560 ? 8 : 4;
        L.grid = { x: 12, y: y + 26, w: W - 24, cellH: 40 };
        L.H = L.grid.y + (16 / L.gridCols) * L.grid.cellH + 14;
      }
      const R = L.R, d = 0.58 * R;
      L.d = d;
      const dir = { 1: [-Math.cos(Math.PI / 6), -0.5], 2: [Math.cos(Math.PI / 6), -0.5], 4: [0, 1] };
      L.C = {};
      for (const w of [1, 2, 4]) L.C[w] = [L.cx + d * dir[w][0], L.cy + d * dir[w][1]];
      L.frame = { x: L.cx - 1.502 * R - 26, y: L.cy - 1.29 * R - 38, w: 2 * (1.502 * R + 26), h: 2.87 * R + 64 };
      L.lamp = {};
      for (let p = 1; p <= 7; p++) {
        const ws = [1, 2, 4].filter((w) => p & w);
        if (ws.length === 1) { const u = dir[ws[0]]; L.lamp[p] = [L.cx + (d + 0.45 * R) * u[0], L.cy + (d + 0.45 * R) * u[1]]; }
        else if (ws.length === 2) { const k = [1, 2, 4].find((w) => !(p & w)), u = dir[k]; L.lamp[p] = [L.cx - 0.62 * R * u[0], L.cy - 0.62 * R * u[1]]; }
        else L.lamp[p] = [L.cx, L.cy + 0.02 * R];
      }
      L.lamp[0] = [L.frame.x + 24, L.frame.y + L.frame.h - 24];
      L.lampR = Math.max(9, 0.15 * R);
      if (wide) L.tilesY = L.frame.y + L.frame.h + 14;
      L.tilesX = L.cx;
      return L;
    }

    function drawLamp(ctx, p, x, y, r, on, t) {
      const isCheck = p === 1 || p === 2 || p === 4 || p === 0;
      if (on) {
        (isCheck ? glow.vg : glow.gold).draw(ctx, x, y, (r * 2.5) / 64);
        ctx.fillStyle = isCheck ? '#d8efe9' : IVORY;
        ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = P.bg; ctx.strokeStyle = GHOST; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      void t;
    }

    function draw1(tp) {
      const L = L1; if (!L) return;
      const { ctx } = c1;
      c1.size(L.W, L.H);
      const W = L.W, H = L.H;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(L.cx, L.cy, L.R * 0.2, L.cx, L.cy, L.R * 2.4);
      halo.addColorStop(0, 'rgba(98,179,164,0.06)'); halo.addColorStop(1, 'rgba(98,179,164,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

      const sent = sent1(), recv = s1.recv;
      const s = syndrome(recv), par = parity8(recv);
      const damaged = [];
      for (let p = s1.secded ? 0 : 1; p <= 7; p++) if (recv[p] !== sent[p]) damaged.push(p);
      const R = L.R;

      // ----- the SECDED frame: position 0 lives outside every circle -----
      if (s1.secded) {
        const bad = par === 1;
        const fl = s1.frameFlash >= 0 ? Math.max(0, 1 - (tp - s1.frameFlash) / 0.6) : 0;
        rrect(ctx, L.frame.x, L.frame.y, L.frame.w, L.frame.h, 18);
        ctx.fillStyle = bad ? 'rgba(192,91,77,0.05)' : 'rgba(98,179,164,0.035)'; ctx.fill();
        ctx.strokeStyle = bad ? P.crimson : VG; ctx.globalAlpha = 0.55 + 0.45 * fl; ctx.lineWidth = 1.3 + 2 * fl; ctx.stroke();
        ctx.globalAlpha = 1;
        const lab = L.W < 520 ? 'the eighth bit' : 'the eighth bit · parity of all eight';
        ctx.font = `11px ${SERIF}`;
        const lw8 = caps(ctx, lab, -999, -999, P.bg, 'left', 11);
        ctx.fillStyle = P.bg; ctx.fillRect(L.cx - lw8 / 2 - 8, L.frame.y - 8, lw8 + 16, 16);
        caps(ctx, lab, L.cx, L.frame.y + 4, bad ? CRB : VG, 'center', 11);
      } else {
        rrect(ctx, L.frame.x, L.frame.y, L.frame.w, L.frame.h, 18);
        ctx.setLineDash([2, 6]); ctx.strokeStyle = GHOST; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      }

      // ----- three circles; overlaps glow additively -----
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of [1, 2, 4]) {
        const fail = (s & w) && (s1.reveal & w);
        const [x, y] = L.C[w];
        ctx.fillStyle = fail ? 'rgba(192,91,77,0.085)' : 'rgba(98,179,164,0.055)';
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      for (const w of [1, 2, 4]) {
        const fail = (s & w) && (s1.reveal & w);
        const fl = s1.flash[w] != null ? Math.max(0, 1 - (tp - s1.flash[w]) / 0.45) : 0;
        const [x, y] = L.C[w];
        const col = fail ? P.crimson : VG;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.12 + 0.25 * fl; ctx.lineWidth = 7 + 6 * fl;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.lineWidth = 1.5 + fl;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        // label: which positions this check watches
        const watch = [1, 2, 3, 4, 5, 6, 7].filter((p) => p & w).join(' ');
        const lx = w === 1 ? x - 0.34 * R : w === 2 ? x + 0.34 * R : x;
        const ly = w === 4 ? y + R + 17 : y - R - 9;
        const tc = fail ? CRB : VG;
        ctx.font = `12px ${SERIF}`;
        const a = caps(ctx, `check ${w}`, 0, -100, tc, 'left', 12);
        ctx.font = `10px ${MONO}`;
        const b = ctx.measureText(`  ${watch}`).width;
        const x0 = lx - (a + b) / 2;
        caps(ctx, `check ${w}`, x0, ly, tc, 'left', 12);
        T(ctx, `  ${watch}`, x0 + a, ly, { font: `10px ${MONO}`, color: fail ? CRB : P.inkFaint });
      }

      // ----- lamps -----
      const lr = L.lampR;
      // after a SECDED refusal nothing is named: the checking number is no longer trusted
      const refused = !!(s1.outcome && s1.outcome.kind === 'refused');
      const showNamed = s1.result && s1.named >= 0 && !refused ? s1.named : -1;
      for (let p = s1.secded ? 0 : 1; p <= 7; p++) {
        const [x, y] = L.lamp[p];
        drawLamp(ctx, p, x, y, lr, recv[p] === 1, tp);
        if (damaged.includes(p)) {
          ctx.strokeStyle = P.crimson; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.arc(x, y, lr * 0.52 + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
        if (p === showNamed) {
          const k = s1.arcT >= 0 ? ease((tp - s1.arcT - 0.28) / 0.3) : 1;
          ctx.strokeStyle = P.goldBright; ctx.globalAlpha = k; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(x, y, lr * 0.52 + 11, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (s1.hover && s1.hover.kind === 'lamp' && s1.hover.p === p) {
          ctx.strokeStyle = 'rgba(232,226,208,0.55)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, lr * 0.52 + 3.5, 0, Math.PI * 2); ctx.stroke();
        }
        const isCheck = p === 0 || p === 1 || p === 2 || p === 4;
        const tx = x + lr * 0.52 + 15;
        T(ctx, String(p), tx, y + 1, { font: `16px ${MONO}`, color: isCheck ? VG : P.gold });
        T(ctx, p === 0 ? 'parity' : (p.toString(2).padStart(3, '0')), tx, y + 14, { font: `9.5px ${MONO}`, color: P.inkDim });
      }

      // ----- the checking number tiles (4 · 2 · 1), read right to left -----
      const tw = 46, th = 58, gap = 8, ty = L.tilesY;
      const resW = 92;
      const totalW = 3 * tw + 2 * gap + 18 + resW;
      const tx0 = L.tilesX - totalW / 2;
      [4, 2, 1].forEach((w, i) => {
        const x = tx0 + i * (tw + gap);
        const shown = (s1.reveal & w) !== 0;
        const bit = (s & w) ? 1 : 0;
        const fail = shown && bit;
        rrect(ctx, x, ty, tw, th, 5);
        ctx.fillStyle = fail ? 'rgba(192,91,77,0.13)' : P.panel; ctx.fill();
        ctx.strokeStyle = fail ? P.crimson : shown ? VG_DIM : P.line; ctx.lineWidth = 1.2; ctx.stroke();
        T(ctx, String(w), x + tw / 2, ty + 14, { font: `10px ${MONO}`, color: P.inkFaint, align: 'center' });
        T(ctx, shown ? String(bit) : '·', x + tw / 2, ty + 46, { font: `27px ${MONO}`, color: fail ? CRB : shown ? P.inkDim : GHOST, align: 'center' });
      });
      const rx = tx0 + 3 * tw + 2 * gap + 18;
      if (s1.result) {
        const good = s === 0;
        T(ctx, `= ${s}`, rx, ty + 42, { font: `28px ${MONO}`, color: good ? VG : P.goldBright });
      } else {
        T(ctx, '= ?', rx, ty + 42, { font: `28px ${MONO}`, color: GHOST });
      }
      caps(ctx, L.W < 520 ? 'checking number, right to left' : 'the checking number, written right to left', L.tilesX, ty + th + 20, P.inkFaint, 'center', 11);

      // ----- the gold arc from the numeral to the position it names -----
      if (showNamed >= 0) {
        const [lx, ly] = L.lamp[showNamed];
        const k = s1.arcT >= 0 ? ease((tp - s1.arcT) / 0.34) : 1;
        // leave the numeral on the side of the named lamp, and bow outward around the circles
        const side = lx < L.cx - 8 ? -1 : lx > L.cx + 8 ? 1 : 0;
        const ax = side < 0 ? tx0 - 8 : side > 0 ? rx + resW - 6 : rx + 26;
        const ay = side ? ty + th / 2 : ty - 6;
        const cx = side ? lx + side * (0.35 * R + 30) : lx + 0.55 * R, cy = side ? ay - 0.1 * R : (ay + ly) / 2;
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        const N = 28;
        for (let i = 1; i <= Math.round(N * k); i++) {
          const u = i / N;
          const x = (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * cx + u * u * lx;
          const y = (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * cy + u * u * ly;
          ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      }

      drawWord1(ctx, L.word, sent, recv, damaged);
      drawFano1(ctx, L.fano, recv, damaged, s, showNamed);
      drawVerdict1(ctx, L.verdict, s, damaged);
      if (L.wide) drawTableList(ctx, L.tbl, recv);
      else drawTableGrid(ctx, L.grid, L.gridCols, recv);
    }

    function drawWord1(ctx, B, sent, recv, damaged) {
      const n0 = s1.secded ? 0 : 1, n = 8 - n0;
      const cell = Math.min(24, (B.w - 70) / n - 4), gap = 4;
      const x0 = B.x + 70;
      caps(ctx, 'the word on the wire', B.x, B.y, P.inkDim, 'left', 12);
      for (let i = 0; i < n; i++) {
        const p = n0 + i, x = x0 + i * (cell + gap) + cell / 2;
        const isCheck = p === 0 || p === 1 || p === 2 || p === 4;
        T(ctx, String(p), x, B.y + 20, { font: `10px ${MONO}`, color: isCheck ? VG : P.goldDim, align: 'center' });
      }
      const rows = [['sent', sent, B.y + 28], ['received', recv, B.y + 28 + cell + 12]];
      for (const [name, w, y] of rows) {
        T(ctx, name, B.x, y + cell * 0.68, { font: `italic 12px ${SERIF}`, color: P.inkDim });
        for (let i = 0; i < n; i++) {
          const p = n0 + i, x = x0 + i * (cell + gap);
          const isCheck = p === 0 || p === 1 || p === 2 || p === 4;
          rrect(ctx, x, y, cell, cell, 3);
          if (w[p]) { ctx.fillStyle = isCheck ? '#bfe0d9' : '#eadfbe'; ctx.fill(); }
          else { ctx.fillStyle = P.bg; ctx.fill(); ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke(); }
          T(ctx, String(w[p]), x + cell / 2, y + cell * 0.7, { font: `12px ${MONO}`, color: w[p] ? P.bg : P.inkFaint, align: 'center' });
          if (name === 'received' && damaged.includes(p)) {
            rrect(ctx, x - 2.5, y - 2.5, cell + 5, cell + 5, 4);
            ctx.strokeStyle = P.crimson; ctx.lineWidth = 1.6; ctx.stroke();
          }
        }
      }
      const yy = B.y + 28 + 2 * cell + 34;
      T(ctx, `Hamming’s value ${s1.sentV} · ${damaged.length ? damaged.length + ' flipped' : 'untouched'}`, B.x, yy,
        { font: `italic 12px ${SERIF}`, color: damaged.length ? CRB : P.inkFaint });
    }

    function drawFano1(ctx, F, recv, damaged, s, named) {
      const { cx, cy, r } = F;
      const pt = {};
      const ang = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      pt[4] = ang(-Math.PI / 2); pt[1] = ang(Math.PI * 5 / 6); pt[2] = ang(Math.PI / 6);
      const mid = (a, b) => [(pt[a][0] + pt[b][0]) / 2, (pt[a][1] + pt[b][1]) / 2];
      pt[3] = mid(1, 2); pt[5] = mid(1, 4); pt[6] = mid(2, 4); pt[7] = [cx, cy];
      caps(ctx, 'the seven lines of the Fano plane', cx, cy - r - 34, P.inkDim, 'center', 11);
      const lineSet = (L) => [...L].sort((a, b) => a - b).join(',');
      const ones = [1, 2, 3, 4, 5, 6, 7].filter((p) => recv[p]);
      const lit = {};
      const dm = damaged.filter((p) => p > 0);
      if (dm.length === 2) lit[lineSet([dm[0], dm[1], dm[0] ^ dm[1]])] = 'cr';
      if (ones.length === 3 && FANO_LINES.some((L) => lineSet(L) === lineSet(ones))) lit[lineSet(ones)] = lit[lineSet(ones)] || 'gold';
      const drawLine = (L, style) => {
        ctx.strokeStyle = style === 'cr' ? P.crimson : style === 'gold' ? P.goldBright : P.line;
        ctx.lineWidth = style ? 2 : 1;
        if (L.join(',') === '3,5,6') {
          ctx.beginPath(); ctx.arc(cx, cy, r / 2, 0, Math.PI * 2); ctx.stroke();
        } else {
          const ends = L.filter((p) => p === 1 || p === 2 || p === 4);
          const a = pt[ends[0]], others = L.filter((p) => p !== ends[0]);
          let bpt;
          if (ends.length === 2) bpt = pt[ends[1]];
          else { const m = others.find((p) => p !== 7); bpt = pt[m]; }
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bpt[0], bpt[1]); ctx.stroke();
        }
      };
      for (const L of FANO_LINES) if (!lit[lineSet(L)]) drawLine(L, null);
      for (const L of FANO_LINES) if (lit[lineSet(L)]) drawLine(L, lit[lineSet(L)]);
      for (let p = 1; p <= 7; p++) {
        const [x, y] = pt[p];
        const on = recv[p] === 1;
        if (on) { glow.ivory.draw(ctx, x, y, 0.42); ctx.fillStyle = IVORY; }
        else ctx.fillStyle = P.bg;
        ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = on ? IVORY : P.inkFaint; ctx.lineWidth = 1; ctx.stroke();
        if (damaged.includes(p)) { ctx.strokeStyle = P.crimson; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke(); }
        if (p === named) { ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke(); }
        const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy) || 1;
        const lx = p === 7 ? x + 12 : x + (dx / dd) * 15, ly = p === 7 ? y - 8 : y + (dy / dd) * 15 + 4;
        T(ctx, String(p), lx, ly, { font: `11px ${MONO}`, color: P.inkDim, align: 'center' });
      }
      let note = 'a line is three positions a, b, a ⊕ b';
      let col = P.inkFaint;
      if (dm.length === 2) { note = `${dm[0]} ⊕ ${dm[1]} = ${dm[0] ^ dm[1]}: two errors look like one`; col = CRB; }
      else if (lit[lineSet(ones)] === 'gold') { note = 'a weight-three codeword is a line'; col = P.gold; }
      T(ctx, note, cx, cy + r * 0.5 + 34, { font: `italic 12px ${SERIF}`, color: col, align: 'center' });
      void s;
    }

    function drawVerdict1(ctx, V, s, damaged) {
      const o = s1.outcome;
      let text = '', col = P.inkDim, sub = '';
      if (o && o.kind === 'healed') { text = 'healed'; col = P.verdant; sub = `position ${o.pos} put back`; }
      else if (o && o.kind === 'wrong') { text = `decoded ${o.v}, but ${s1.sentV} was sent`; col = CRB; sub = 'the code lied with confidence'; }
      else if (o && o.kind === 'refused') { text = 'two errors: refuse to guess'; col = CRB; sub = 'the eighth bit holds, the checks complain'; }
      else if (o && o.kind === 'clean') { text = 'nothing to repair'; col = VG; sub = 'every check holds'; }
      else if (s1.result && s === 0 && !damaged.length) { text = 'all checks hold'; col = VG; sub = 'flip any bit'; }
      else if (s1.result && s !== 0) {
        if (s1.secded && parity8(s1.recv) === 0) { text = 'the checks disagree with the eighth bit'; col = CRB; sub = 'press repair'; }
        else { text = `the damage is at ${s}`; col = P.goldBright; sub = 'press repair'; }
      } else if (!s1.result) { text = 'reading the checks…'; col = P.inkFaint; }
      else if (s === 0 && damaged.length) { text = 'every check holds'; col = CRB; sub = 'yet the word is not the one that was sent'; }
      const size = L1.wide ? 19 : 17;
      let fs = size;
      ctx.font = `${fs}px ${SERIF}`;
      const maxW = L1.wide ? L1.rw : L1.W - 24;
      while (ctx.measureText(text).width > maxW && fs > 12) { fs -= 1; ctx.font = `${fs}px ${SERIF}`; }
      T(ctx, text, V.x, V.y, { font: `${fs}px ${SERIF}`, color: col, align: 'center' });
      if (sub) T(ctx, sub, V.x, V.y + 19, { font: `italic 12px ${SERIF}`, color: P.inkFaint, align: 'center' });
    }

    const beliefRow = () => {
      const recv = s1.recv, sent = sent1();
      const same = [1, 2, 3, 4, 5, 6, 7].every((p) => recv[p] === sent[p]);
      if (same) return -1;
      if (s1.secded && secded(recv).status === 'double') return -1;
      return hammingDecode(recv).value;
    };
    function rowStyle(v) {
      const recvIsCode = syndrome(s1.recv) === 0;
      const recvV = hammingValue(s1.recv);
      if (v === s1.sentV) return 'sent';
      if (recvIsCode && recvV === v) return 'wrong';
      if (beliefRow() === v) return 'belief';
      return '';
    }
    const tableHits = [];
    function drawTableList(ctx, B, recv) {
      tableHits.length = 0;
      const tw3 = caps(ctx, 'Table III', B.x + 4, B.y + 12, P.gold, 'left', 13);
      T(ctx, 'Hamming, 1950', B.x + 4 + tw3 + 8, B.y + 12, { font: `italic 11.5px ${SERIF}`, color: P.inkFaint });
      const bx = B.x + 50, step = 17.5;
      for (let p = 1; p <= 7; p++) {
        const isCheck = p === 1 || p === 2 || p === 4;
        T(ctx, String(p), bx + (p - 1) * step, B.y + 36, { font: `10px ${MONO}`, color: isCheck ? VG : P.goldDim, align: 'center' });
      }
      T(ctx, 'value', B.x + 30, B.y + 36, { font: `italic 10.5px ${SERIF}`, color: P.inkFaint, align: 'right' });
      const y0 = B.y + 46, rh = (B.h - 46) / 16;
      for (let v = 0; v < 16; v++) {
        const y = y0 + v * rh, st = rowStyle(v);
        tableHits.push({ v, x: B.x, y, w: B.w, h: rh });
        if (st === 'sent') { rrect(ctx, B.x, y + 1, B.w, rh - 2, 4); ctx.fillStyle = 'rgba(201,169,89,0.14)'; ctx.fill(); }
        if (st === 'wrong') { rrect(ctx, B.x, y + 1, B.w, rh - 2, 4); ctx.fillStyle = 'rgba(192,91,77,0.16)'; ctx.fill(); ctx.strokeStyle = P.crimson; ctx.lineWidth = 1; ctx.stroke(); }
        if (st === 'belief') { rrect(ctx, B.x + 0.5, y + 1.5, B.w - 1, rh - 3, 4); ctx.setLineDash([3, 3]); ctx.strokeStyle = P.azure; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
        if (s1.hover && s1.hover.kind === 'row' && s1.hover.v === v && st !== 'sent') { rrect(ctx, B.x, y + 1, B.w, rh - 2, 4); ctx.fillStyle = 'rgba(232,226,208,0.05)'; ctx.fill(); }
        const base = y + rh * 0.68;
        const vc = st === 'sent' ? P.goldBright : st === 'wrong' ? CRB : P.inkDim;
        T(ctx, String(v), B.x + 30, base, { font: `12px ${MONO}`, color: vc, align: 'right' });
        const w = TABLE_III[v];
        for (let p = 1; p <= 7; p++) {
          const isCheck = p === 1 || p === 2 || p === 4;
          const bit = w[p - 1];
          const c = st === 'sent' ? (isCheck ? VG : P.goldBright) : st === 'wrong' ? CRB : bit === '1' ? (isCheck ? '#8fc9bd' : P.ink) : GHOST;
          T(ctx, bit, bx + (p - 1) * step, base, { font: `12.5px ${MONO}`, color: c, align: 'center' });
        }
      }
    }
    function drawTableGrid(ctx, G, cols, recv) {
      tableHits.length = 0;
      const tw3 = caps(ctx, 'Table III', G.x, G.y - 10, P.gold, 'left', 13);
      T(ctx, 'Hamming, 1950 · tap a word to send it', G.x + tw3 + 8, G.y - 10, { font: `italic 11.5px ${SERIF}`, color: P.inkFaint });
      const cw = G.w / cols, ch = G.cellH;
      for (let v = 0; v < 16; v++) {
        const x = G.x + (v % cols) * cw, y = G.y + Math.floor(v / cols) * ch, st = rowStyle(v);
        tableHits.push({ v, x, y, w: cw, h: ch });
        rrect(ctx, x + 2, y + 2, cw - 4, ch - 4, 4);
        ctx.fillStyle = st === 'sent' ? 'rgba(201,169,89,0.14)' : st === 'wrong' ? 'rgba(192,91,77,0.16)' : P.panel; ctx.fill();
        if (st === 'belief') { ctx.setLineDash([3, 3]); ctx.strokeStyle = P.azure; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
        else if (st === 'wrong') { ctx.strokeStyle = P.crimson; ctx.lineWidth = 1; ctx.stroke(); }
        const vc = st === 'sent' ? P.goldBright : st === 'wrong' ? CRB : P.inkDim;
        T(ctx, String(v), x + 8, y + 16, { font: `11px ${MONO}`, color: vc });
        T(ctx, TABLE_III[v], x + 8, y + 31, { font: `${cw < 76 ? 9.5 : 11}px ${MONO}`, color: st ? vc : P.inkFaint });
      }
    }

    function refresh1() {
      const sent = sent1(), recv = s1.recv, s = syndrome(recv);
      const ch = circleChecks(recv).map((b, i) => `${[1, 2, 4][i]} ${b ? '✗' : '✓'}`).join('  ');
      let line = `sent ${s1.sentV} = ${wordString(sent)} · received ${wordString(recv)} · checks ${ch} · checking number ${bin3(s)} = ${s}`;
      if (s1.secded) line += ` · eighth bit ${parity8(recv) ? '✗' : '✓'}`;
      r1.set(line);
      repairBtn.disabled = false;
      requestDraw(0); requestDraw(1);
    }
    function setSecded(v) {
      finishSeq();
      s1.secded = v;
      if (secdedT.value !== v) secdedT.set(v);
      if (v) s1.recv[0] = sent1()[0];     // the eighth digit arrives clean
      s1.outcome = null;
      if (v && s1.quest === 3) setQuest(0, 'Now flip two bits again, and press <em>repair</em>.');
      layoutAll(); refresh1();
    }
    function flip1(p) {
      if (p === 0 && !s1.secded) return;
      audio.ensureAudio();
      finishSeq();
      s1.recv[p] ^= 1;
      s1.outcome = null; s1.named = -1;
      const s = syndrome(s1.recv);
      s1.reveal = 0; s1.result = false;
      const nowOn = s1.recv[p] === 1;
      const ev = [{ t: 0, play: (t) => { if (p) tone(F0 * p, t, nowOn ? 0.5 : 0.25, nowOn ? 0.12 : 0.07, (p - 4) / 7); else wood(t, 0.08, 660); } }];
      [1, 2, 4].forEach((w, i) => ev.push({
        t: 0.26 + i * 0.2,
        play: (t) => { if (s & w) tone(F0 * w, t, 0.32, 0.13, [-0.4, 0, 0.4][i]); else wood(t, 0.045, 1760); },
        show: () => { s1.reveal |= w; s1.flash[w] = nowP(); hold(0.5); },
      }));
      if (s1.secded) ev.push({ t: 0.86, play: (t) => wood(t, 0.06, parity8(s1.recv) ? 440 : 1760), show: () => { s1.frameFlash = nowP(); hold(0.6); } });
      ev.push({
        t: s1.secded ? 1.04 : 0.9,
        play: (t) => { if (s) tone(F0 * s, t, 0.8, 0.14); },
        show: () => {
          s1.reveal = 7; s1.result = true; s1.named = s ? s : -1; s1.arcT = nowP(); hold(0.8);
          afterRead1();
        },
      });
      seq(ev);
      refresh1();
    }
    function afterRead1() {
      const sent = sent1(), s = syndrome(s1.recv);
      const dm = [1, 2, 3, 4, 5, 6, 7].filter((p) => s1.recv[p] !== sent[p]);
      if (s1.quest === 0 && dm.length === 1 && s === dm[0]) {
        s1.quest = 1;
        const fails = [1, 2, 4].filter((w) => s & w).map((w) => `check ${w}`).join(' and ');
        setQuest(0, `${fails[0].toUpperCase() + fails.slice(1)} ${fails.includes(' and ') ? 'fail' : 'fails'}. Written right to left, the failures spell <strong>${bin3(s)}</strong>, which is ${s}: the address of the damage. Press <em>repair</em>, or click lamp ${s} yourself.`);
      }
      refresh1();
    }
    function repair1() {
      audio.ensureAudio();
      finishSeq();
      const recv = s1.recv, s = syndrome(recv);
      let pos;
      if (s1.secded) {
        const st = secded(recv);
        if (st.status === 'clean') { s1.outcome = { kind: 'clean' }; refresh1(); return; }
        if (st.status === 'double') {
          const t0 = actxNow() + 0.02;
          tone(F0, t0, 0.9, 0.13); thock(t0, 0.3);
          s1.outcome = { kind: 'refused' }; s1.frameFlash = nowP(); hold(0.7);
          if (s1.quest < 4) {
            s1.quest = 4;
            setQuest(0, 'Two errors detected, none invented: Hamming’s eighth bit refuses to guess. Next, see why no word is wasted. Open <em>ii · perfect</em>.', true);
          }
          refresh1(); return;
        }
        pos = st.pos;
      } else {
        if (!s) { s1.outcome = { kind: 'clean' }; refresh1(); return; }
        pos = s;
      }
      const fixed = recv.slice(); fixed[pos] ^= 1;
      s1.named = pos; s1.result = true; s1.reveal = 7; s1.arcT = nowP(); hold(0.6);
      seq([
        { t: 0, play: (t) => { if (pos) tone(F0 * pos, t, 0.35, 0.1); } },
        {
          t: 0.4,
          play: (t) => chord(fixed, t),
          show: () => {
            s1.recv[pos] ^= 1;
            const sent = sent1();
            const ok = [0, 1, 2, 3, 4, 5, 6, 7].every((p) => (p === 0 && !s1.secded) || s1.recv[p] === sent[p]);
            s1.outcome = ok ? { kind: 'healed', pos } : { kind: 'wrong', pos, v: hammingValue(s1.recv) };
            s1.named = -1;
            if (ok && s1.quest < 2) { s1.quest = 2; setQuest(0, 'Healed, and the chord resolves. Now flip <em>two</em> bits, then press <em>repair</em>.'); }
            if (!ok && s1.quest < 3 && !s1.secded) {
              const dm = [1, 2, 3, 4, 5, 6, 7].filter((p) => sent[p] !== s1.recv[p] && p !== pos);
              const a = dm[0], b = dm[1];
              s1.quest = 3;
              setQuest(0, a && b
                ? `The decoder lied. ${a} ⊕ ${b} = ${a ^ b}, the third point on their Fano line, so it “repaired” an innocent bit and landed on codeword ${hammingValue(s1.recv)}. Switch on <em>the eighth bit</em> and try two flips again.`
                : `The decoder landed on codeword ${hammingValue(s1.recv)}, not ${s1.sentV}. Switch on <em>the eighth bit</em> and try two flips again.`);
            }
            refresh1();
          },
        },
      ]);
    }
    function hammingExample() {
      finishSeq();
      s1.sentV = 12; s1.recv = sent1(); s1.outcome = null;
      refresh1();
      flip1(5);
    }
    function send1(v) {
      audio.ensureAudio();
      finishSeq();
      s1.sentV = v; s1.recv = sent1(); s1.outcome = null; s1.named = -1; s1.reveal = 7; s1.result = true;
      chord(s1.recv, actxNow() + 0.03);
      refresh1();
    }
    function hit1(x, y) {
      const L = L1; if (!L) return null;
      for (const h of tableHits) if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return { kind: 'row', v: h.v };
      let p = 0;
      for (const w of [1, 2, 4]) { const [cx, cy] = L.C[w]; if (Math.hypot(x - cx, y - cy) <= L.R) p |= w; }
      if (p) return { kind: 'lamp', p };
      const f = L.frame;
      if (s1.secded && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return { kind: 'lamp', p: 0 };
      return null;
    }
    c1.canvas.addEventListener('click', (e) => {
      const [x, y] = c1.pos(e), h = hit1(x, y);
      if (!h) return;
      if (h.kind === 'row') send1(h.v);
      else if (h.p === s1.named && s1.result && !s1.outcome) repair1();
      else flip1(h.p);
    });
    c1.canvas.addEventListener('pointermove', (e) => {
      const [x, y] = c1.pos(e), h = hit1(x, y);
      const key = h ? h.kind + (h.p ?? h.v) : '';
      c1.canvas.style.cursor = h ? 'pointer' : 'default';
      if (key !== (s1.hover ? s1.hover.kind + (s1.hover.p ?? s1.hover.v) : '')) { s1.hover = h; requestDraw(0); }
    });
    c1.canvas.addEventListener('pointerleave', () => { if (s1.hover) { s1.hover = null; requestDraw(0); } });
    c1.canvas.addEventListener('keydown', (e) => {
      if (/^[0-7]$/.test(e.key)) { e.preventDefault(); flip1(+e.key); }
      else if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') { e.preventDefault(); repair1(); }
    });
    st1.layout = (W) => { L1 = layout1(W); };
    st1.draw = draw1;
    st1.questHTML = 'Flip any one bit: click a lamp inside the circles. The checks will say where the damage is.';

    /* =================================================================
       STATION II — perfect
       ================================================================= */
    const st2 = addStation('ii · perfect');
    const s2 = { hover: null, edits: 0, quest: 0 };
    const c2 = mkCanvas(st2.wrap, 'sh-cv', 'All 128 seven-bit words arranged as sixteen codewords and their neighbours. Keys 1 to 7 flip bits; the arrow keys move between cells.');
    c2.canvas.tabIndex = 0;
    ui.caption(st2.wrap, 'Each codeword of Table III begins a line of eight cells: the codeword itself, then the seven words one flip away, placed by their checking numbers 1 to 7. ' +
      'The crimson dot is the flipped digit. The word from station i glows in its cell, and the seven switches set any word you like; keys 1–7 and the arrow keys do the same.');
    let L2 = null;
    function layout2(W) {
      const L = { W, wide: W >= 880 };
      if (L.wide) {
        L.hx = 16; L.gx = 16 + 78; L.gy = 62;
        L.cw = Math.floor(Math.min(44, (W * 0.67 - L.gx) / 16)); L.ch = Math.round(L.cw * 1.18);
        L.cols = 16; L.rows = 8; L.transposed = false;
        L.px = L.gx + 16 * L.cw + 34; L.pw = W - L.px - 18; L.py = 30;
        L.H = Math.max(L.gy + 8 * L.ch + 30, 440);
      } else {
        L.transposed = true; L.cols = 8; L.rows = 16;
        L.gx = 56; L.gy = 62;
        L.cw = Math.floor(Math.min(46, (W - L.gx - 12) / 8)); L.ch = 26;
        L.px = 16; L.pw = W - 32; L.py = L.gy + 16 * L.ch + 40;
        L.H = L.py + 420;
      }
      return L;
    }
    const cellOf = (L, v, s) => L.transposed ? [L.gx + s * L.cw, L.gy + v * L.ch] : [L.gx + v * L.cw, L.gy + s * L.ch];
    const bitHits = [];
    function draw2() {
      const L = L2; if (!L) return;
      const { ctx } = c2;
      c2.size(L.W, L.H);
      ctx.clearRect(0, 0, L.W, L.H);
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, L.W, L.H);
      const here = locateWord(s1.recv);
      const cw = L.cw, ch = L.ch;
      caps(ctx, 'all 128 seven-bit words', 16, 22, P.gold, 'left', 13);
      T(ctx, L.transposed ? 'row = codeword, column = checking number' : 'column = codeword, row = checking number', 16, 40,
        { font: `italic 12px ${SERIF}`, color: P.inkFaint });
      // headers
      for (let v = 0; v < 16; v++) {
        const [x, y] = cellOf(L, v, 0);
        const on = v === here.v;
        if (L.transposed) T(ctx, String(v), L.gx - 10, y + ch * 0.66, { font: `11px ${MONO}`, color: on ? P.goldBright : P.inkFaint, align: 'right' });
        else T(ctx, String(v), x + cw / 2, L.gy - 8, { font: `11px ${MONO}`, color: on ? P.goldBright : P.inkFaint, align: 'center' });
      }
      for (let s = 0; s < 8; s++) {
        const [x, y] = cellOf(L, 0, s);
        const on = s === here.s;
        const lab = s === 0 ? (L.transposed ? '0' : 'clean  0') : String(s);
        if (L.transposed) T(ctx, lab, x + cw / 2, L.gy - 8, { font: `11px ${MONO}`, color: on ? P.goldBright : P.inkFaint, align: 'center' });
        else T(ctx, lab, L.gx - 10, y + ch * 0.6, { font: `11px ${MONO}`, color: on ? P.goldBright : P.inkFaint, align: 'right' });
      }
      // column tints: each codeword with its seven neighbours is one ball
      for (let v = 0; v < 16; v++) {
        const [x0, y0] = cellOf(L, v, 0);
        ctx.fillStyle = v % 2 ? 'rgba(98,179,164,0.035)' : 'rgba(232,226,208,0.02)';
        if (L.transposed) ctx.fillRect(L.gx, y0, 8 * cw, ch); else ctx.fillRect(x0, L.gy, cw, 8 * ch);
      }
      for (let v = 0; v < 16; v++) for (let s = 0; s < 8; s++) {
        const [x, y] = cellOf(L, v, s), w = mosaicWord(v, s);
        const isHere = v === here.v && s === here.s;
        const isHover = s2.hover && s2.hover.v === v && s2.hover.s === s;
        if (isHere) glow.gold.draw(ctx, x + cw / 2, y + ch / 2, (Math.max(cw, ch) * 1.5) / 64);
        rrect(ctx, x + 1.5, y + 1.5, cw - 3, ch - 3, 3);
        ctx.fillStyle = isHere ? 'rgba(20,20,26,0.92)' : P.panel; ctx.fill();
        if (isHere) { ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.5; ctx.stroke(); }
        else if (isHover) { ctx.strokeStyle = P.inkDim; ctx.lineWidth = 1; ctx.stroke(); }
        else if (s === 0) { ctx.strokeStyle = P.goldDim; ctx.lineWidth = 1; ctx.stroke(); }
        const pad = Math.max(3.5, cw * 0.13), step = (cw - 2 * pad) / 6, cy = y + ch / 2;
        const dr = Math.max(1.4, Math.min(2.6, step * 0.42));
        for (let p = 1; p <= 7; p++) {
          const dx = x + pad + (p - 1) * step;
          const isCheck = p === 1 || p === 2 || p === 4;
          const flipped = s === p;
          ctx.beginPath(); ctx.arc(dx, cy, dr, 0, Math.PI * 2);
          if (w[p]) { ctx.fillStyle = flipped ? P.crimson : isCheck ? '#8fc9bd' : '#e6dcc0'; ctx.fill(); }
          else if (flipped) { ctx.strokeStyle = P.crimson; ctx.lineWidth = 1; ctx.stroke(); }
          else { ctx.fillStyle = '#33363f'; ctx.fill(); }
        }
      }
      // --- the panel: any seven bits, the count, Golay’s sums ---
      let y = L.py;
      const px = L.px, pw = L.pw;
      caps(ctx, 'any seven bits', px, y + 10, P.inkDim, 'left', 12);
      bitHits.length = 0;
      const bs = Math.min(34, (pw - 6 * 6) / 7);
      for (let p = 1; p <= 7; p++) {
        const x = px + (p - 1) * (bs + 6), yy = y + 30;
        const isCheck = p === 1 || p === 2 || p === 4;
        T(ctx, String(p), x + bs / 2, yy - 5, { font: `10px ${MONO}`, color: isCheck ? VG : P.goldDim, align: 'center' });
        rrect(ctx, x, yy, bs, bs, 4);
        const on = s1.recv[p] === 1;
        ctx.fillStyle = on ? (isCheck ? '#bfe0d9' : '#eadfbe') : P.panel; ctx.fill();
        ctx.strokeStyle = p === here.s ? P.crimson : P.line; ctx.lineWidth = p === here.s ? 1.6 : 1; ctx.stroke();
        T(ctx, on ? '1' : '0', x + bs / 2, yy + bs * 0.68, { font: `15px ${MONO}`, color: on ? P.bg : P.inkFaint, align: 'center' });
        bitHits.push({ p, x, y: yy, w: bs, h: bs });
      }
      y += 30 + bs + 24;
      const where = here.s ? `codeword ${here.v} with position ${here.s} flipped` : `codeword ${here.v} itself`;
      y = wrapText(ctx, `lands in exactly one cell: ${where}`, px, y, pw, 17, `italic 13px ${SERIF}`, P.ink);
      y += 36;
      let fs = 25;
      const eq = '16 × (1 + 7) = 128 = 2⁷';
      ctx.font = `${fs}px ${SERIF}`;
      while (ctx.measureText(eq).width > pw && fs > 15) { fs--; ctx.font = `${fs}px ${SERIF}`; }
      T(ctx, eq, px, y, { font: `${fs}px ${SERIF}`, color: P.goldBright });
      y += 20;
      T(ctx, 'no cell empty, none shared: a perfect code', px, y, { font: `italic 12px ${SERIF}`, color: P.inkFaint });
      y += 34;
      caps(ctx, 'Golay’s sums in Pascal’s triangle', px, y, P.inkDim, 'left', 12);
      y += 12;
      const rows = [
        { n: 7, t: 1, r: 3, ok: true, who: 'Hamming’s seven-digit code' },
        { n: 23, t: 3, r: 11, ok: true, who: 'Golay’s 23-digit code, 3 errors' },
        { n: 90, t: 2, r: 12, ok: false, who: 'no such code: Golay’s proof' },
      ];
      for (const R of rows) {
        const terms = []; for (let i = 0; i <= R.t; i++) terms.push(Number(binom(R.n, i)));
        const total = terms.reduce((a, b) => a + b, 0);
        y += 22;
        const sumTxt = `${terms.join(' + ')} = ${total} = 2${sup(R.r)}`;
        let f = 12.5; ctx.font = `${f}px ${MONO}`;
        while (ctx.measureText(sumTxt).width > pw && f > 9) { f -= 0.5; ctx.font = `${f}px ${MONO}`; }
        T(ctx, sumTxt, px, y, { font: `${f}px ${MONO}`, color: R.ok ? P.ink : CRB });
        y += 8;
        let x = px;
        for (let i = 0; i < terms.length; i++) {
          const w = Math.max(1.5, (terms[i] / total) * pw - 2);
          ctx.fillStyle = R.ok ? (i % 2 ? VG : VG_DIM) : (i % 2 ? P.crimson : '#7a3a31');
          ctx.fillRect(x, y, w, 8);
          x += w + 2;
        }
        ctx.strokeStyle = R.ok ? P.goldBright : CRB; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px + pw, y - 4); ctx.lineTo(px + pw, y + 12); ctx.stroke();
        if (!R.ok) { ctx.strokeStyle = CRB; ctx.beginPath(); ctx.moveTo(px, y + 4); ctx.lineTo(px + pw, y + 4); ctx.stroke(); }
        y += 24;
        T(ctx, R.who, px, y, { font: `italic 12px ${SERIF}`, color: R.ok ? P.inkDim : CRB });
      }
      y += 26;
      y = wrapText(ctx, 'Tietäväinen, 1973: over finite fields, every perfect code beyond the trivial ones has the size of a Hamming or a Golay code.',
        px, y, pw, 16, `italic 12px ${SERIF}`, P.inkFaint);
      if (y + 18 > L.H) { L.H = Math.ceil(y + 18); requestDraw(1); }
    }
    function hit2(x, y) {
      const L = L2; if (!L) return null;
      for (const b of bitHits) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return { kind: 'bit', p: b.p };
      const gx = x - L.gx, gy = y - L.gy;
      if (gx < 0 || gy < 0) return null;
      const i = Math.floor(gx / L.cw), j = Math.floor(gy / L.ch);
      if (L.transposed) { if (i < 8 && j < 16) return { kind: 'cell', v: j, s: i }; }
      else if (i < 16 && j < 8) return { kind: 'cell', v: i, s: j };
      return null;
    }
    function bump2() {
      s2.edits++;
      if (s2.edits >= 3 && s2.quest === 0) {
        s2.quest = 1;
        setQuest(1, 'No cell empty, none shared: 16 × (1 + 7) = 2⁷, and the code is perfect. Now scratch a real code: open <em>iii · the scratch card</em>.', true);
      }
    }
    function act2(h) {                 // one path for clicks and keys
      audio.ensureAudio(); finishSeq();
      if (h.kind === 'bit') { s1.recv[h.p] ^= 1; tone(F0 * h.p, actxNow() + 0.02, 0.35, 0.1, (h.p - 4) / 7); }
      else { s1.sentV = h.v; s1.recv = mosaicWord(h.v, h.s); if (s1.secded) s1.recv[0] = hammingEncode(h.v)[0]; chord(s1.recv, actxNow() + 0.03, 1.0, 0.055); }
      s1.outcome = null; s1.named = -1; s1.reveal = 7; s1.result = true;
      bump2(); refresh1();
    }
    c2.canvas.addEventListener('click', (e) => {
      const [x, y] = c2.pos(e), h = hit2(x, y);
      if (h) act2(h);
    });
    c2.canvas.addEventListener('keydown', (e) => {
      if (/^[1-7]$/.test(e.key)) { e.preventDefault(); act2({ kind: 'bit', p: +e.key }); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d || !L2) return;
      e.preventDefault();
      const here = locateWord(s1.recv);
      let v = here.v, s = here.s;
      if (L2.transposed) { s = (s + d[0] + 8) % 8; v = (v + d[1] + 16) % 16; }
      else { v = (v + d[0] + 16) % 16; s = (s + d[1] + 8) % 8; }
      act2({ kind: 'cell', v, s });
    });
    c2.canvas.addEventListener('pointermove', (e) => {
      const [x, y] = c2.pos(e), h = hit2(x, y);
      c2.canvas.style.cursor = h ? 'pointer' : 'default';
      const nv = h && h.kind === 'cell' ? h : null;
      if ((nv ? nv.v * 8 + nv.s : -1) !== (s2.hover ? s2.hover.v * 8 + s2.hover.s : -1)) { s2.hover = nv; requestDraw(1); }
    });
    c2.canvas.addEventListener('pointerleave', () => { if (s2.hover) { s2.hover = null; requestDraw(1); } });
    st2.layout = (W) => { L2 = layout2(W); };
    st2.draw = draw2;
    st2.questHTML = 'Every one of the 128 seven-bit words sits in exactly one cell. Set any seven bits, or click cells, and watch where each word lands.';

    /* =================================================================
       STATION III — the scratch card (a real QR code)
       ================================================================= */
    const st3 = addStation('iii · the scratch card');
    const pair = el('div', 'sh-pair', st3.wrap);
    const c3 = mkCanvas(pair, 'sh-cv sh-card', 'A version-2 QR code on an ivory card; drag across it to scratch modules');
    const c3p = mkCanvas(pair, 'sh-cv sh-panel', 'The decoder’s view: the 44 codewords, the syndromes and the error budget');
    const row3a = ui.controlRow(st3.wrap);
    const fld = el('label', 'sh-field', row3a);
    el('span', null, fld, 'message');
    const input3 = el('input', 'sh-text', fld);
    input3.type = 'text'; input3.value = 'MATHEMAGICAL'; input3.maxLength = 14; input3.spellcheck = false;
    input3.setAttribute('aria-label', 'message to encode (printable ASCII)');
    const segWrap = el('div', 'ctl', row3a);
    el('div', 'ctl-label', segWrap, 'error-correction level');
    const seg = el('div', 'sh-seg', segWrap);
    const lvBtns = {};
    for (const lv of 'LMQH') lvBtns[lv] = ui.button(seg, lv, () => setLevel(lv), { small: true });
    const row3b = ui.controlRow(st3.wrap);
    ui.button(row3b, 'clean card', () => cleanCard(true));
    ui.button(row3b, 'stamp a logo', () => stampLogo());
    ui.button(row3b, 'dust', () => dust());
    const cwT = ui.toggle(row3b, { label: 'show the codewords', value: false, onChange: (v) => { s3.showCw = v; requestDraw(2); } });
    const erT = ui.toggle(row3b, { label: 'tell the decoder where I scratched', value: false, onChange: (v) => { s3.eraseOn = v; decode3(false); } });
    void cwT; void erT;
    const r3 = ui.readout(st3.wrap, '');
    ui.caption(st3.wrap, 'A real version-2 symbol, 25 × 25 modules in byte mode: 44 codewords in one Reed–Solomon block over GF(2⁸), whose field polynomial is x⁸ + x⁴ + x³ + x² + 1. ' +
      'The encoder tries all eight masks and keeps the one with the lowest penalty. Scratched modules are tinted but keep their light or dark value, so a camera sees what the decoder sees. ' +
      'The finder eyes, the timing lines and the small alignment square carry no check bytes at all; the format bits that name the level and mask have a small code of their own, written twice. ' +
      'Each reading is audible: a tick for each of the 44 positions the search tries, and a bell wherever the error-locator polynomial has a root, pitched higher the more of that byte’s eight bits were wrong.');

    const rng3 = mulberry32(20260922);
    const TILES = codewordModules();
    const tileOf = Array.from({ length: QR_N }, () => new Array(QR_N).fill(-1));
    TILES.forEach((mods, k) => mods.forEach(([r, c]) => { tileOf[r][c] = k; }));
    const s3 = {
      text: 'MATHEMAGICAL', level: 'H', enc: null, mat: null, touched: new Set(),
      eraseOn: false, showCw: false, res: null, verdict: null, sweepK: -1, rootsLit: new Set(),
      healT: -1, heal: [], quest: 0, stroke: null, lastTick: 0, reading: false,
    };
    function encode3() {
      const bytes = textBytes(s3.text);
      s3.enc = qrEncode(bytes, s3.level);
      s3.mat = s3.enc.matrix.map((r) => r.slice());
      s3.touched.clear();
    }
    function trueState() {
      const enc = s3.enc, cwNow = readCodewords(s3.mat, s3.level, enc.mask);
      const damaged = [];
      cwNow.forEach((b, k) => { if (b !== enc.codewords[k]) damaged.push(k); });
      let changed = 0;
      for (let r = 0; r < QR_N; r++) for (let c = 0; c < QR_N; c++) if (s3.mat[r][c] !== enc.matrix[r][c]) changed++;
      const erased = new Set();
      for (const key of s3.touched) { const k = tileOf[Math.floor(key / QR_N)][key % QR_N]; if (k >= 0) erased.add(k); }
      return { damaged, changed, erased: [...erased].sort((a, b) => a - b) };
    }
    function decode3(withSweep) {
      finishSeq();
      const truth = trueState();
      const erase = s3.eraseOn ? truth.erased : [];
      const res = qrRead(s3.mat, erase);
      const correct = res.ok && res.text === String.fromCharCode(...s3.enc.bytes);
      const verdict = res.ok ? (correct ? 'ok' : 'wrong') : 'refused';
      const located = res.ok ? res.errPos.filter((_, j) => res.errVals[j] !== 0) : [];
      const eye = finderDamage(s3.mat, s3.enc.matrix);
      const result = { res, verdict, located, truth, erase, eye };
      const clean = res.syndromes.every((x) => x === 0);
      if (!withSweep || clean) { applyVerdict(result, !clean && withSweep); return; }
      // the Chien search, heard: one tick per position, a bell at every root of Λ
      s3.reading = true; s3.verdict = null; s3.res = res; s3.rootsLit = new Set(); s3.sweepK = -1;
      const rootSet = new Set(res.roots || []);
      const errValAt = {};
      if (res.ok) res.errPos.forEach((i, j) => { errValAt[i] = res.errVals[j]; });
      const n = res.received.length, ev = [];
      for (let k = 0; k < n; k++) {
        const col = TILES[k] ? TILES[k][0][1] : 12;
        const pan = (2 * col) / 24 - 1;
        ev.push({
          t: k * 0.026,
          play: (t) => {
            wood(t, 0.03, 1500, pan);
            if (rootSet.has(k)) tone(F0 * (1 + popcount(errValAt[k] || 0)), t, 0.5, 0.1, pan, 0.006, 0.3);
          },
          show: () => { s3.sweepK = k; if (rootSet.has(k)) s3.rootsLit.add(k); },
        });
      }
      const tEnd = n * 0.026 + 0.12;
      const bells = (res.ok ? res.errPos.map((i, j) => F0 * (1 + popcount(res.errVals[j]))) : []).sort((a, b) => a - b);
      ev.push({
        t: tEnd,
        play: (t) => {
          if (verdict === 'ok') bells.slice(0, 12).forEach((f, i) => tone(f, t + i * 0.06, 0.45, 0.08, 0, 0.006, 0.3));
          else thock(t, 0.35);
        },
        show: () => applyVerdict(result, true),
      });
      seq(ev);
      requestDraw(2);
    }
    function applyVerdict(result, animateHeal) {
      s3.reading = false; s3.sweepK = -1;
      s3.res = result.res; s3.verdict = result; s3.rootsLit = new Set(result.located);
      s3.heal = [];
      if (result.verdict === 'ok' && animateHeal) {
        for (const k of result.located) for (const [r, c] of TILES[k]) if (s3.mat[r][c] !== s3.enc.matrix[r][c]) s3.heal.push([r, c]);
        s3.healT = nowP(); hold(2.2);
      }
      const t = result.truth, ec = QR_V2[s3.level].ec, budget = Math.floor(ec / 2);
      if (result.verdict !== 'ok' && s3.quest === 0 && t.damaged.length) {
        s3.quest = 1;
        setQuest(2, `Broken at ${t.damaged.length} damaged codewords; on its own the decoder can find at most ${budget}. Now press <em>clean card</em>, switch on <em>tell the decoder where I scratched</em>, and scratch again.`);
      }
      if (result.verdict === 'ok' && s3.eraseOn && result.erase.length > budget && s3.quest < 2) {
        s3.quest = 2;
        setQuest(2, `Told where to look, it mended ${result.erase.length} codewords, more than the ${budget} it could find alone: 2E + S ≤ ${ec}. An erasure costs half as much as an error.`, true);
      }
      refresh3(); requestDraw(2);
    }
    function refresh3() {
      const spec = QR_V2[s3.level];
      const t = trueState();
      const v = s3.verdict;
      let line = `version 2-${s3.level} · mask ${s3.enc.mask} · ${spec.data + spec.ec} codewords: ${spec.data} data, ${spec.ec} check · finds any ${Math.floor(spec.ec / 2)} or fills ${spec.ec} erasures`;
      line += `\nmodules changed ${t.changed} · codewords damaged ${t.damaged.length} (true)`;
      if (v && !s3.reading) {
        line += ` · located ${v.located.length} (decoder)`;
        line += v.verdict === 'ok' ? ` · read “${v.res.text}”` : v.verdict === 'wrong' ? ` · confidently wrong` : ' · refused';
      }
      r3.set(line);
    }
    function cleanCard(sound) {
      finishSeq();
      s3.mat = s3.enc.matrix.map((r) => r.slice());
      s3.touched.clear(); s3.heal = [];
      if (sound) { audio.ensureAudio(); wood(actxNow() + 0.02, 0.06, 990); }
      decode3(false);
    }
    function setLevel(lv) {
      s3.level = lv;
      for (const k in lvBtns) lvBtns[k].classList.toggle('active', k === lv);
      const cap = QR_V2[lv].cap;
      input3.maxLength = cap;
      if (s3.text.length > cap) { s3.text = s3.text.slice(0, cap); input3.value = s3.text; }
      encode3(); decode3(false); layoutAll(); requestDraw(2);
    }
    input3.addEventListener('input', () => {
      const clean = [...input3.value].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126).join('').slice(0, QR_V2[s3.level].cap);
      if (clean !== input3.value) input3.value = clean;
      s3.text = clean;
      encode3(); decode3(false);
    });
    function stampLogo() {
      audio.ensureAudio(); finishSeq();
      for (let r = 9; r <= 15; r++) for (let c = 9; c <= 15; c++) { s3.mat[r][c] = 1; s3.touched.add(r * QR_N + c); }
      thock(actxNow() + 0.02, 0.25);
      decode3(true);
    }
    function dust() {
      audio.ensureAudio(); finishSeq();
      const t0 = actxNow() + 0.02;
      for (let i = 0; i < 12; i++) {
        const r = Math.floor(rng3() * QR_N), c = Math.floor(rng3() * QR_N);
        s3.mat[r][c] ^= 1; s3.touched.add(r * QR_N + c);
        wood(t0 + i * 0.012, 0.025, 1200 + 40 * i);
      }
      decode3(true);
    }

    // card geometry, in device pixels so every module is a whole number of pixels
    let G3 = null, cardBg = null;
    function layout3(W) {
      const wide = W >= 760;
      const cardW = wide ? Math.min(440, Math.floor(W * 0.45)) : Math.min(W, 420);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pad = 12, label = 24;
      const md = Math.max(2, Math.floor(((cardW - 2 * pad) * dpr) / 33));
      const cwDev = Math.round(cardW * dpr);
      const sizeDev = 33 * md;
      const padDev = Math.round(pad * dpr);
      const chDev = padDev * 2 + sizeDev + Math.round(label * dpr);
      const x0 = Math.floor((cwDev - sizeDev) / 2);
      G3 = { wide, cardW, cardH: chDev / dpr, dpr, md, cwDev, chDev, x0, y0: padDev, sizeDev, labelDev: Math.round(label * dpr),
        ox: x0 + 4 * md, oy: padDev + 4 * md,
        panelW: wide ? W - cardW - 20 : W, panelH: wide ? Math.max(chDev / dpr, 380) : 360 };
      cardBg = null;
    }
    function buildCardBg() {
      const G = G3;
      const oc = document.createElement('canvas');
      oc.width = G.cwDev; oc.height = G.chDev;
      const g = oc.getContext('2d');
      const x = G.x0, y = G.y0, w = G.sizeDev, h = G.sizeDev + G.labelDev, r = 6 * G.dpr;
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 18 * G.dpr; g.shadowOffsetY = 6 * G.dpr;
      rrect(g, x, y, w, h, r); g.fillStyle = '#f2ecdd'; g.fill();
      g.restore();
      const img = g.getImageData(x, y, w, h), d = img.data, rnd = mulberry32(1950);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const n = (rnd() - 0.5) * 7 + (rnd() < 0.004 ? -10 : 0);
        d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.8));
      }
      g.putImageData(img, x, y);
      rrect(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.strokeStyle = 'rgba(80,60,30,0.18)'; g.lineWidth = 1; g.stroke();
      cardBg = oc;
    }
    const INK = '#16151c', SMUDGE = '#5b1e17', SCRAPE = '#f0d0c4';
    function draw3(tp) {
      const G = G3; if (!G || !s3.enc) return;
      c3.size(G.cardW, G.cardH);
      const ctx = c3.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, G.cwDev, G.chDev);
      if (!cardBg || cardBg.width !== G.cwDev) buildCardBg();
      ctx.drawImage(cardBg, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const md = G.md, pris = s3.enc.matrix, mat = s3.mat;
      for (let r = 0; r < QR_N; r++) for (let c = 0; c < QR_N; c++) {
        const v = mat[r][c], o = pris[r][c];
        if (v === o) { if (v) { ctx.fillStyle = INK; ctx.fillRect(G.ox + c * md, G.oy + r * md, md, md); } }
        else { ctx.fillStyle = v ? SMUDGE : SCRAPE; ctx.fillRect(G.ox + c * md, G.oy + r * md, md, md); }
      }
      // the decoder’s view of the healed modules, shown for a moment, then the card is itself again
      if (s3.heal.length && s3.healT >= 0) {
        const t = tp - s3.healT;
        const a = t < 0.5 ? ease(t / 0.5) : t < 1.5 ? 1 : 1 - ease((t - 1.5) / 0.6);
        if (a > 0.01) {
          ctx.globalAlpha = a;
          for (const [r, c] of s3.heal) { ctx.fillStyle = pris[r][c] ? INK : '#f2ecdd'; ctx.fillRect(G.ox + c * md, G.oy + r * md, md, md); }
          ctx.globalAlpha = 1;
        }
      }
      const lw = Math.max(1, Math.round(md / 7));
      const tileEdge = (k, color, width, dash) => {
        const set = new Set(TILES[k].map(([r, c]) => r * QR_N + c));
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
        ctx.beginPath();
        for (const [r, c] of TILES[k]) {
          const x = G.ox + c * md, y = G.oy + r * md;
          if (!set.has((r - 1) * QR_N + c) || r === 0) { ctx.moveTo(x, y); ctx.lineTo(x + md, y); }
          if (!set.has((r + 1) * QR_N + c) || r === QR_N - 1) { ctx.moveTo(x, y + md); ctx.lineTo(x + md, y + md); }
          if (c === 0 || !set.has(r * QR_N + c - 1)) { ctx.moveTo(x, y); ctx.lineTo(x, y + md); }
          if (c === QR_N - 1 || !set.has(r * QR_N + c + 1)) { ctx.moveTo(x + md, y); ctx.lineTo(x + md, y + md); }
        }
        ctx.stroke(); ctx.setLineDash([]);
      };
      const nData = QR_V2[s3.level].data;
      if (s3.showCw) {
        ctx.globalAlpha = 0.9;
        for (let k = 0; k < TILES.length; k++) tileEdge(k, k < nData ? '#a47d26' : '#3a67a0', lw);
        ctx.globalAlpha = 1;
        const order = dataOrder();
        ctx.strokeStyle = 'rgba(58,103,160,0.22)'; ctx.lineWidth = lw;
        ctx.beginPath();
        order.forEach(([r, c], i) => { const x = G.ox + c * md + md / 2, y = G.oy + r * md + md / 2; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
        if (md / G.dpr >= 16) {
          ctx.font = `${Math.round(md * 0.42)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          TILES.forEach((mods, k) => {
            let sx = 0, sy = 0; for (const [r, c] of mods) { sx += c; sy += r; }
            const cx = G.ox + (sx / 8 + 0.5) * md, cy = G.oy + (sy / 8 + 0.5) * md;
            ctx.fillStyle = 'rgba(242,236,221,0.85)'; ctx.fillRect(cx - md * 0.42, cy - md * 0.3, md * 0.84, md * 0.6);
            ctx.fillStyle = k < nData ? '#7d5d14' : '#2c5282'; ctx.fillText(String(k), cx, cy + md * 0.02);
          });
        }
      }
      const v = s3.verdict;
      if (v && !s3.reading) {
        if (v.verdict !== 'ok') for (const k of v.truth.damaged) tileEdge(k, '#b3392c', lw + 1, [md * 0.5, md * 0.3]);
        else {
          const t = tp - s3.healT;
          const a = s3.healT >= 0 ? Math.max(0.35, 1 - Math.max(0, t - 1.5) / 1.2) : 0.35;
          ctx.globalAlpha = a;
          for (const k of v.located) tileEdge(k, '#3f8a4c', lw + 1);
          ctx.globalAlpha = 1;
        }
      }
      if (s3.reading) {
        for (const k of s3.rootsLit) tileEdge(k, '#3f8a4c', lw + 1);
        if (s3.sweepK >= 0 && s3.sweepK < TILES.length) tileEdge(s3.sweepK, '#2f6fb0', lw + 1);
      }
      // the printed label
      const ly = G.y0 + G.sizeDev + G.labelDev * 0.45;
      ctx.font = `${Math.round(11 * G.dpr)}px ${SERIF}`;
      try { ctx.fontVariantCaps = 'all-small-caps'; ctx.letterSpacing = `${(1.6 * G.dpr).toFixed(1)}px`; } catch (e) { /* ignore */ }
      ctx.fillStyle = '#6b5f45'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`version 2 · level ${s3.level} · mask ${s3.enc.mask}`, G.cwDev / 2, ly);
      try { ctx.fontVariantCaps = 'normal'; ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
      c3.ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
      drawPanel3(tp);
    }
    function drawPanel3() {
      const G = G3;
      const W = Math.floor(G.panelW), H = G.panelH;
      c3p.size(W, H);
      const ctx = c3p.ctx;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
      const px = 18, pw = W - 36;
      const spec = QR_V2[s3.level], n = spec.data + spec.ec;
      const v = s3.verdict, res = s3.res;
      let y = 26;
      caps(ctx, 'decoded', px, y, P.inkDim, 'left', 12);
      y += 34;
      let msg = '', col = P.inkDim;
      if (s3.reading) { msg = 'reading…'; col = P.inkFaint; }
      else if (v && v.verdict === 'ok') { msg = v.res.text || '(an empty message)'; col = P.verdant; }
      else if (v && v.verdict === 'wrong') { msg = `confidently wrong: ${v.res.text}`; col = CRB; }
      else if (v) { msg = 'the decoder refuses'; col = CRB; }
      let fs = 28; ctx.font = `${fs}px ${SERIF}`;
      while (ctx.measureText(msg).width > pw && fs > 13) { fs--; ctx.font = `${fs}px ${SERIF}`; }
      T(ctx, msg, px, y, { font: `${fs}px ${SERIF}`, color: col });
      y += 20;
      let sub = '';
      if (v && !s3.reading) {
        const clean = v.res.syndromes.every((x) => x === 0);
        if (clean) sub = 'every syndrome is zero: nothing to repair';
        else if (v.verdict === 'ok') sub = `found and fixed ${v.located.length} codeword${v.located.length === 1 ? '' : 's'}${v.erase.length ? ` (${v.erase.length} marked as erased)` : ''}`;
        else if (v.verdict === 'wrong') sub = 'it decoded to a different message: beyond the budget, belief is not truth';
        else sub = 'too much damage to locate: it says so instead of guessing';
      }
      y = wrapText(ctx, sub, px, y, pw, 16, `italic 12.5px ${SERIF}`, P.inkFaint);
      // the 44 codewords
      y += 34;
      caps(ctx, `${n} codewords · ${spec.data} data · ${spec.ec} check`, px, y, P.inkDim, 'left', 12);
      y += 10;
      const perRow = W < 420 ? 11 : 22, rowsN = Math.ceil(n / perRow);
      const cg = 3, cwid = (pw - (perRow - 1) * cg) / perRow, chh = Math.min(18, cwid * 1.1);
      const damagedSet = new Set(trueStateCache().damaged);
      const erasedSet = new Set(v ? v.erase : []);
      for (let k = 0; k < n; k++) {
        const x = px + (k % perRow) * (cwid + cg), yy = y + Math.floor(k / perRow) * (chh + cg);
        const isData = k < spec.data;
        rrect(ctx, x, yy, cwid, chh, 2);
        ctx.fillStyle = damagedSet.has(k) ? 'rgba(192,91,77,0.75)' : isData ? 'rgba(201,169,89,0.30)' : 'rgba(125,167,217,0.26)';
        ctx.fill();
        if (erasedSet.has(k)) { ctx.setLineDash([2, 2]); ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
        const lit = s3.reading ? s3.rootsLit.has(k) : v && v.verdict === 'ok' && v.located.includes(k);
        if (lit) { rrect(ctx, x - 1.5, yy - 1.5, cwid + 3, chh + 3, 3); ctx.strokeStyle = P.verdant; ctx.lineWidth = 1.6; ctx.stroke(); }
        if (s3.reading && s3.sweepK === k) { rrect(ctx, x - 2, yy - 2, cwid + 4, chh + 4, 3); ctx.strokeStyle = P.azure; ctx.lineWidth = 2; ctx.stroke(); }
      }
      y += rowsN * (chh + cg) + 16;
      const key = [['data', 'rgba(201,169,89,0.55)'], ['check', 'rgba(125,167,217,0.5)'], ['damaged (true)', 'rgba(192,91,77,0.85)']];
      let kx = px;
      ctx.font = `11.5px ${SERIF}`;
      for (const [name, c] of [...key, ['located (decoder)', null]]) {
        const wv = 13 + ctx.measureText(name).width + 14;
        if (kx > px && kx + wv - 14 > px + pw) { kx = px; y += 18; }
        if (c) { ctx.fillStyle = c; ctx.fillRect(kx, y - 8, 9, 9); }
        else { ctx.strokeStyle = P.verdant; ctx.lineWidth = 1.4; ctx.strokeRect(kx + 0.5, y - 7.5, 8, 8); }
        T(ctx, name, kx + 13, y, { font: `11.5px ${SERIF}`, color: P.inkDim });
        kx += wv;
      }
      // the syndromes: the damage’s spectrum
      y += 32;
      caps(ctx, `syndromes S₀ … S${String(spec.ec - 1).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d])}`, px, y, P.inkDim, 'left', 12);
      y += 9;
      const S = res ? res.syndromes : new Array(spec.ec).fill(0);
      const sg = 2, sw = (pw - (S.length - 1) * sg) / S.length;
      let nz = 0;
      S.forEach((val, j) => {
        const x = px + j * (sw + sg);
        if (val) nz++;
        ctx.fillStyle = val ? `rgba(125,167,217,${0.35 + 0.65 * (val / 255)})` : '#1b1e29';
        ctx.fillRect(x, y, sw, 14);
      });
      y += 30;
      y = wrapText(ctx, nz ? `${nz} of ${S.length} nonzero: the damage leaks into a band that should be silent` : `all ${S.length} zero: a clean card is silent`, px, y, pw, 16,
        `italic 12px ${SERIF}`, nz ? P.azure : P.inkFaint);
      // the budget
      y += 32;
      const t = trueStateCache();
      const Sx = s3.eraseOn ? t.erased.length : 0;
      const E = s3.eraseOn ? t.damaged.filter((k) => !t.erased.includes(k)).length : t.damaged.length;
      const need = 2 * E + Sx, ec = spec.ec;
      caps(ctx, `budget · 2E + S ≤ ${ec}`, px, y, P.inkDim, 'left', 12);
      y += 9;
      const slots = ec, gg = 2, ssw = (pw - (slots - 1) * gg) / slots;
      for (let i = 0; i < slots; i++) {
        const x = px + i * (ssw + gg);
        let c = '#1b1e29';
        if (i < Sx) c = 'rgba(232,226,208,0.45)';
        else if (i < need) c = need > ec ? P.crimson : 'rgba(192,91,77,0.7)';
        ctx.fillStyle = c; ctx.fillRect(x, y, ssw, 12);
      }
      if (need > ec) { ctx.fillStyle = P.crimson; ctx.fillRect(px + pw + 3, y - 2, 3, 16); }
      y += 30;
      const e2 = `damaged ${t.damaged.length} (true) · ${s3.eraseOn ? `erased ${Sx}, unseen ${E}` : `errors ${E}`} · 2E + S = ${need} ${need <= ec ? '≤' : '>'} ${ec}`;
      let f2 = 12.5; ctx.font = `${f2}px ${MONO}`;
      while (ctx.measureText(e2).width > pw && f2 > 9) { f2 -= 0.5; ctx.font = `${f2}px ${MONO}`; }
      T(ctx, e2, px, y, { font: `${f2}px ${MONO}`, color: need <= ec ? P.inkDim : CRB });
      if (v && v.eye > 0.3) {
        y += 24;
        const note = 'A finder eye is badly scratched. It carries no check bytes, so a phone camera may not find the symbol at all.';
        y = wrapText(ctx, note, px, y, pw, 17, `italic 12.5px ${SERIF}`, CRB);
        growPanel(y + 20);
        return;
      }
      // the field itself: multiplication by α drawn on the 255 nonzero bytes
      if (!G.wide) {
        const size = Math.min(150, pw * 0.48);
        y += 30;
        caps(ctx, 'the field, drawn', px, y, P.inkDim, 'left', 12);
        ctx.drawImage(gfArtFor(size, c3p.dpr), px + (pw - size) / 2, y + 10, size, size);
        y = wrapText(ctx, 'Each chord joins a byte x to α·x. Below 128 that is plain doubling, whose chords draw part of a cardioid; past 128 the product folds back by XOR with 29. Every nonzero byte is a power of α, as every note is a stack of fifths.',
          px, y + size + 30, pw, 16, `italic 12px ${SERIF}`, P.inkFaint);
        growPanel(y + 22);
        return;
      }
      const room = H - y - 18;
      if (room >= 84) {
        const size = Math.min(150, room);
        const art = gfArtFor(size, c3p.dpr);
        const ax = px + pw - size, ay = y + 10;
        ctx.drawImage(art, ax, ay, size, size);
        const tx = px, lw = Math.max(120, ax - px - 16);
        caps(ctx, 'the field, drawn', tx, ay + 26, P.inkDim, 'left', 12);
        wrapText(ctx, 'Each chord joins a byte x to α·x. Below 128 that is plain doubling, whose chords draw part of a cardioid; past 128 the product folds back by XOR with 29. Every nonzero byte is a power of α, as every note is a stack of fifths.',
          tx, ay + 46, lw, 16, `italic 12px ${SERIF}`, P.inkFaint);
      }
    }
    function growPanel(need) {
      if (G3 && need > G3.panelH + 1) { G3.panelH = Math.ceil(need); requestDraw(2); }
    }
    let _gfArt = null;
    function gfArtFor(size, dpr) {
      const S = Math.round(size * dpr);
      if (_gfArt && _gfArt.width === S) return _gfArt;
      const oc = document.createElement('canvas'); oc.width = oc.height = S;
      const g = oc.getContext('2d'), c = S / 2, R = S * 0.46;
      const pos = (v) => { const a = (v / 256) * Math.PI * 2 - Math.PI / 2; return [c + R * Math.cos(a), c + R * Math.sin(a)]; };
      g.strokeStyle = 'rgba(98,179,164,0.35)'; g.lineWidth = dpr;
      g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = 0.6 * dpr;
      for (let v = 1; v < 256; v++) {
        const [x1, y1] = pos(v), [x2, y2] = pos(gmul(v, 2));
        g.strokeStyle = v < 128 ? 'rgba(201,169,89,0.30)' : 'rgba(125,167,217,0.30)';
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      _gfArt = oc;
      return oc;
    }
    let _tsc = null, _tscKey = '';
    function trueStateCache() {
      const key = s3.mat.map((r) => r.join('')).join('') + s3.level + s3.touched.size;
      if (key !== _tscKey) { _tsc = trueState(); _tscKey = key; }
      return _tsc;
    }
    function wrapText(ctx, s, x, y, w, lh, font, color) {
      ctx.font = font;
      const words = s.split(' ');
      let line = '';
      for (const wd of words) {
        const test = line ? line + ' ' + wd : wd;
        if (ctx.measureText(test).width > w && line) { T(ctx, line, x, y, { font, color }); y += lh; line = wd; }
        else line = test;
      }
      if (line) T(ctx, line, x, y, { font, color });
      return y;
    }
    // brushing
    function cardCell(e) {
      const G = G3, [x, y] = c3.pos(e);
      const c = (x * G.dpr - G.ox) / G.md, r = (y * G.dpr - G.oy) / G.md;
      return [r, c];
    }
    function paintAt(r, c) {
      const R = Math.floor(r), C = Math.floor(c);
      if (R < 0 || R >= QR_N || C < 0 || C >= QR_N) return;
      const key = R * QR_N + C;
      if (s3.stroke.has(key)) return;
      s3.stroke.add(key); s3.touched.add(key);
      s3.mat[R][C] ^= 1;
      const t = actxNow();
      if (t - s3.lastTick > 0.03) { s3.lastTick = t; wood(t + 0.005, 0.03, s3.mat[R][C] ? 1100 : 1500); }
    }
    let lastRC = null;
    c3.canvas.addEventListener('pointerdown', (e) => {
      if (!G3) return;
      audio.ensureAudio(); finishSeq();
      s3.stroke = new Set(); s3.heal = [];
      try { c3.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const [r, c] = cardCell(e); lastRC = [r, c]; paintAt(r, c);
      s3.verdict = null; refresh3(); requestDraw(2);
      e.preventDefault();
    });
    c3.canvas.addEventListener('pointermove', (e) => {
      if (!s3.stroke) return;
      const [r, c] = cardCell(e), [r0, c0] = lastRC;
      const steps = Math.ceil(Math.hypot(r - r0, c - c0) / 0.35);
      for (let i = 1; i <= steps; i++) paintAt(r0 + ((r - r0) * i) / steps, c0 + ((c - c0) * i) / steps);
      lastRC = [r, c];
      refresh3(); requestDraw(2);
    });
    const endStroke = () => {
      if (!s3.stroke) return;
      const any = s3.stroke.size > 0;
      s3.stroke = null;
      if (any) decode3(true);
    };
    c3.canvas.addEventListener('pointerup', endStroke);
    c3.canvas.addEventListener('pointercancel', endStroke);
    st3.layout = (W) => { layout3(W); };
    st3.draw = draw3;
    st3.questHTML = 'Scratch the card: drag across it, and the decoder reads it again when you let go. Scratch until it breaks. Before it does, hold your phone’s camera to the screen: it runs the same algebra.';

    /* =================================================================
       STATION IV — Shannon’s line
       ================================================================= */
    const st4 = addStation('iv · Shannon’s line');
    const s4 = { p: 0.01, sim: null, quest: 0, simT: -1 };
    const PSTAR = capacityCrossing(4 / 7);
    const c4 = mkCanvas(st4.wrap, 'sh-cv', 'Shannon’s capacity curve for a binary symmetric channel, with Hamming’s rate 4/7');
    const row4 = ui.controlRow(st4.wrap);
    const pSl = ui.slider(row4, {
      label: 'chance that the channel flips a bit', min: 0.001, max: 0.2, step: 0.001, value: s4.p,
      format: (v) => `p = ${v.toFixed(3)}`,
      onInput: (v) => { s4.p = v; s4.sim = null; refresh4(); },
    });
    void pSl;
    ui.button(row4, 'send 10,000 blocks', () => runSim(), { primary: true });
    const r4 = ui.readout(st4.wrap, '');
    ui.caption(st4.wrap, 'Below the gold curve, Shannon proved, codes exist that make errors as rare as you like; above it, none can. ' +
      'The chase toward the curve ran through turbo codes (1993), Gallager’s low-density parity checks (1962, revived in 1996) and Arıkan’s polar codes (2009), and into the radio of every 5G phone.');
    let L4 = null;
    function layout4(W) {
      const wide = W >= 800;
      if (wide) return { W, wide, H: 424, plot: { x: 58, y: 36, w: Math.floor(W * 0.56) - 58, h: 334 }, side: { x: Math.floor(W * 0.56) + 36, y: 30, w: W - Math.floor(W * 0.56) - 54 } };
      return { W, wide, H: 300 + 396, plot: { x: 50, y: 30, w: W - 70, h: 220 }, side: { x: 16, y: 310, w: W - 32 } };
    }
    function runSim() {
      audio.ensureAudio();
      s4.sim = simulateBSC(s4.p, 10000, mulberry32(Math.floor(s4.p * 1e6) + 7));
      s4.simT = nowP(); hold(0.9);
      wood(actxNow() + 0.02, 0.05, 1320);
      refresh4();
    }
    function draw4(tp) {
      const L = L4; if (!L) return;
      const { ctx } = c4;
      c4.size(L.W, L.H);
      ctx.clearRect(0, 0, L.W, L.H);
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, L.W, L.H);
      const { x, y, w, h } = L.plot, pmax = 0.2;
      const X = (p) => x + (p / pmax) * w, Y = (c) => y + h - c * h;
      // regions
      ctx.beginPath(); ctx.moveTo(X(0), Y(1));
      for (let i = 0; i <= 200; i++) { const p = (i / 200) * pmax; ctx.lineTo(X(p), Y(bscCapacity(p))); }
      ctx.lineTo(X(pmax), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath();
      ctx.fillStyle = 'rgba(98,179,164,0.07)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(X(0), Y(1));
      for (let i = 0; i <= 200; i++) { const p = (i / 200) * pmax; ctx.lineTo(X(p), Y(bscCapacity(p))); }
      ctx.lineTo(X(pmax), Y(1)); ctx.closePath();
      ctx.fillStyle = 'rgba(192,91,77,0.06)'; ctx.fill();
      // axes & ticks
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
      for (const p of [0, 0.05, 0.1, 0.15, 0.2]) T(ctx, p.toFixed(2), X(p), y + h + 16, { font: `10.5px ${MONO}`, color: P.inkFaint, align: 'center' });
      for (const c of [0, 0.25, 0.5, 0.75, 1]) {
        T(ctx, c.toFixed(2), x - 8, Y(c) + 4, { font: `10.5px ${MONO}`, color: P.inkFaint, align: 'right' });
        if (c > 0) { ctx.strokeStyle = 'rgba(42,46,63,0.6)'; ctx.beginPath(); ctx.moveTo(x, Y(c)); ctx.lineTo(x + w, Y(c)); ctx.stroke(); }
      }
      T(ctx, 'p, the chance of a flipped bit', x + w, y + h + 32, { font: `italic 12px ${SERIF}`, color: P.inkDim, align: 'right' });
      caps(ctx, 'bits per use', x, y - 12, P.inkDim, 'left', 11);
      caps(ctx, 'possible', X(0.012), Y(0.12), VG, 'left', 13);
      caps(ctx, 'impossible', x + w - 10, Y(0.93), CRB, 'right', 13);
      // capacity
      ctx.strokeStyle = P.gold; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) { const p = (i / 240) * pmax; const px = X(p), py = Y(bscCapacity(p)); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke();
      T(ctx, 'C = 1 − H(p)', X(0.155), Y(bscCapacity(0.155)) - 10, { font: `italic 13px ${SERIF}`, color: P.gold });
      // Hamming’s rate
      ctx.strokeStyle = P.azure; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(x, Y(4 / 7)); ctx.lineTo(x + w, Y(4 / 7)); ctx.stroke(); ctx.setLineDash([]);
      T(ctx, 'Hamming’s rate 4/7', x + w - 4, Y(4 / 7) - 8, { font: `12px ${SERIF}`, color: P.azure, align: 'right' });
      // crossing
      glow.cr.draw(ctx, X(PSTAR), Y(4 / 7), 0.45);
      ctx.fillStyle = P.crimson; ctx.beginPath(); ctx.arc(X(PSTAR), Y(4 / 7), 4, 0, Math.PI * 2); ctx.fill();
      T(ctx, `p ≈ ${PSTAR.toFixed(4)}`, X(PSTAR) - 10, Y(4 / 7) + 20, { font: `11px ${MONO}`, color: CRB, align: 'right' });
      // cursor
      const cp = s4.p, cc = bscCapacity(cp);
      ctx.strokeStyle = 'rgba(232,200,124,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(cp), y); ctx.lineTo(X(cp), y + h); ctx.stroke();
      glow.gold.draw(ctx, X(cp), Y(cc), 0.45);
      ctx.fillStyle = P.goldBright; ctx.beginPath(); ctx.arc(X(cp), Y(cc), 4.2, 0, Math.PI * 2); ctx.fill();
      // the cursor’s label goes wherever it clears the fixed labels (boxes: x0, y0, x1, y1)
      const lab = `C = ${cc.toFixed(3)}`;
      ctx.font = `12px ${SERIF}`;
      const wRate = ctx.measureText('Hamming’s rate 4/7').width, wCurve = ctx.measureText('C = 1 − H(p)').width + 4;
      ctx.font = `11px ${MONO}`;
      const wCross = ctx.measureText(`p ≈ ${PSTAR.toFixed(4)}`).width;
      ctx.font = `12px ${MONO}`;
      const wLab = ctx.measureText(lab).width;
      const avoid = [
        [x + w - 4 - wRate, Y(4 / 7) - 20, x + w - 4, Y(4 / 7) - 4],
        [X(PSTAR) - 10 - wCross, Y(4 / 7) + 10, X(PSTAR) - 10, Y(4 / 7) + 24],
        [X(0.155), Y(bscCapacity(0.155)) - 22, X(0.155) + wCurve, Y(bscCapacity(0.155)) - 6],
      ];
      const px0 = X(cp), py0 = Y(cc);
      const spots = [[px0 + 12, py0 - 10], [px0 - 16 - wLab, py0 - 10], [px0 + 12, py0 + 22], [px0 - 16 - wLab, py0 + 22]];
      const clear = ([lx, ly]) => lx >= x + 2 && lx + wLab <= x + w - 2 && ly - 12 >= y && ly + 3 <= y + h &&
        avoid.every(([a0, b0, a1, b1]) => lx + wLab < a0 || lx > a1 || ly + 3 < b0 || ly - 12 > b1);
      const [lx, ly] = spots.find(clear) || spots[0];
      T(ctx, lab, lx, ly, { font: `12px ${MONO}`, color: P.goldBright });

      // ----- side: what one block suffers at this p -----
      const S = L.side;
      let yy = S.y + 6;
      caps(ctx, `at p = ${cp.toFixed(3)}, a four-bit message fails`, S.x, yy, P.inkDim, 'left', 12);
      yy += 16;
      const pu = uncodedBlockError(cp), ph = hammingBlockError(cp);
      const bar = (label, pr, color, yb) => {
        const len = Math.max(2, ((6 + Math.log10(Math.max(pr, 1e-6))) / 6) * (S.w - 4));
        ctx.fillStyle = '#1b1e29'; ctx.fillRect(S.x, yb, S.w - 4, 10);
        ctx.fillStyle = color; ctx.fillRect(S.x, yb, len, 10);
        T(ctx, label, S.x, yb + 26, { font: `12.5px ${SERIF}`, color: P.inkDim });
        T(ctx, `1 in ${fmtOdds(pr)}`, S.x + S.w - 4, yb + 26, { font: `12px ${MONO}`, color, align: 'right' });
      };
      bar('sent bare, four bits', pu, CRB, yy);
      bar('as a Hamming codeword, seven bits', ph, VG, yy + 44);
      yy += 96;
      T(ctx, 'bar length: log scale, 10⁻⁶ to 1', S.x, yy, { font: `italic 11px ${SERIF}`, color: P.inkFaint });
      yy += 30;
      caps(ctx, s4.sim ? 'the last 96 of 10,000 blocks sent' : 'send 10,000 blocks to watch them', S.x, yy, P.inkDim, 'left', 12);
      yy += 10;
      const cols = 12, gw = (S.w - 4) / cols, gh = 20;
      const k = s4.sim ? Math.min(1, Math.max(0, (tp - s4.simT) / 0.8)) : 0;
      const shown = s4.sim ? Math.round(96 * k) : 0;
      for (let i = 0; i < 96; i++) {
        const gx = S.x + (i % cols) * gw, gy = yy + Math.floor(i / cols) * gh;
        const b = s4.sim && i < shown ? s4.sim.recent[i] : null;
        rrect(ctx, gx + 1, gy + 1, gw - 2, gh - 2, 2);
        ctx.fillStyle = P.panel; ctx.fill();
        if (b) {
          if (b.flips) { ctx.strokeStyle = b.ok ? P.verdant : P.crimson; ctx.lineWidth = 1; ctx.stroke(); }
          const w = hammingEncode(b.v);
          for (let q = 1; q <= 7; q++) {
            const dx = gx + 4 + (q - 1) * ((gw - 8) / 6), dy = gy + gh / 2;
            const fl = (b.flips >> q) & 1;
            ctx.fillStyle = fl ? P.crimson : w[q] ? '#d9d0b6' : '#2b2d38';
            ctx.beginPath(); ctx.arc(dx, dy, fl ? 1.9 : 1.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      yy += 8 * gh + 20;
      if (s4.sim) {
        const sm = s4.sim;
        const l1 = `wrong after decoding: ${sm.hamWrong} (expected ${(ph * sm.blocks).toFixed(1)})`;
        const l2 = `wrong when sent bare: ${sm.uncWrong} (expected ${(pu * sm.blocks).toFixed(1)})`;
        let f = 12; ctx.font = `${f}px ${MONO}`;
        while (Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) > S.w - 4 && f > 9) { f -= 0.5; ctx.font = `${f}px ${MONO}`; }
        T(ctx, l1, S.x, yy, { font: `${f}px ${MONO}`, color: VG });
        T(ctx, l2, S.x, yy + 18, { font: `${f}px ${MONO}`, color: CRB });
      } else {
        T(ctx, 'green frame: the code repaired it · crimson: it could not', S.x, yy, { font: `italic 12px ${SERIF}`, color: P.inkFaint });
      }
    }
    function fmtOdds(pr) {
      if (pr <= 0) return '∞';
      const o = 1 / pr;
      return o >= 1e5 ? o.toExponential(1).replace('e+', ' × 10^') : o >= 100 ? Math.round(o).toLocaleString('en-US') : o.toFixed(o < 10 ? 1 : 0);
    }
    function refresh4() {
      const p = s4.p, C = bscCapacity(p), ph = hammingBlockError(p);
      r4.set(`p = ${p.toFixed(3)} · capacity ${C.toFixed(3)} bits per use · Hamming sends ${(4 / 7).toFixed(3)} and fails 1 block in ${fmtOdds(ph)} · ` +
        (C > 4 / 7 ? `codes at rate 4/7 with vanishing error exist` : `no code at rate 4/7 can make errors vanish here`));
      if (p > PSTAR && s4.quest === 0) {
        s4.quest = 1;
        setQuest(3, `Past p ≈ ${PSTAR.toFixed(4)} the capacity falls below 4/7: no code of Hamming’s rate, however clever, could make errors vanish on this channel. Below it, Shannon proved such codes exist; building practical ones that come close took some forty-five years.`, true);
      }
      requestDraw(3);
    }
    st4.layout = (W) => { L4 = layout4(W); };
    st4.draw = draw4;
    st4.questHTML = 'Slide the noise upward until the capacity falls below Hamming’s rate, 4/7 of a bit per use.';

    /* ---------- honest panels ---------- */
    ui.legendPanel(stage,
      '<p>Hamming later told the story of lost weekends. As the MacTutor archive retells it, in 1947 he left the Bell Labs computers working on a problem over a weekend, came in on Monday to find that an early error had stopped the work, and decided that a machine able to detect an error should be able to locate it. The tale comes from his recollections long afterwards; the 1950 paper itself records only the relay statistics and the unattended nights and weekends.</p>' +
      '<p>Two other stories deserve care. The three-circle picture is a teaching device, not Hamming’s figure: his paper speaks of positions, binary numerals and the corners of an <em>n</em>-dimensional cube. And a QR code at level H does not survive the loss of 30 percent of its <em>area</em>. It restores about 30 percent of its codewords, so a scratch that clips many codewords by one module each can spend the budget with very little ink, while the “logo in the middle” works because a compact blot touches few codewords.</p>');
    ui.speculationPanel(stage,
      '<p>The quantum frontier is a bet on scaling. Google’s 2024 surface-code memory kept improving as the code grew, but the paper claims only performance that, “if scaled, could realize the operational requirements of large scale fault-tolerant quantum algorithms,” and it found rare correlated error bursts, about once an hour, that limited its longest repetition codes.</p>' +
      '<p>IBM’s bivariate-bicycle codes, Gallager’s sparse checks rebuilt for qubits, would keep 12 logical qubits for nearly a million cycles on 288 physical qubits at a 0.1 percent error rate, where the authors estimate a surface code would need nearly 3,000 (Bravyi and colleagues, <em>Nature</em>, 2024). That is a simulated protocol, not yet a machine. Whether either road reaches a useful fault-tolerant computer, and when, is open.</p>');

    /* ---------- layout, sizing, lifecycle ---------- */
    function contentWidth() {
      const cs = getComputedStyle(stage);
      return Math.max(260, Math.floor(stage.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)));
    }
    let lastW = 0;
    function layoutAll() {
      const W = contentWidth();
      lastW = W;
      for (const s of stations) s.layout(W);
      if (G3) { c3.size(G3.cardW, G3.cardH); c3p.size(Math.floor(G3.panelW), G3.panelH); }
    }
    const ro = new ResizeObserver(() => {
      const W = contentWidth();
      if (Math.abs(W - lastW) >= 1) { layoutAll(); for (let k = 0; k < stations.length; k++) requestDraw(k); }
    });
    ro.observe(stage);

    encode3();
    setLevel('H');
    refresh1(); refresh4();
    layoutAll();
    showStation(0);
    // paint every station once so hidden canvases are ready, then rest
    for (let k = 0; k < stations.length; k++) { try { stations[k].draw(nowP()); } catch (err) { console.error(err); } }

    return {
      pause() {
        paused = true;
        finishSeq();
        tweens.length = 0;
        loop.stop();
        bus.mute();
      },
      resume() {
        paused = false;
        bus.unmute();
        for (let k = 0; k < stations.length; k++) requestDraw(k);
      },
      destroy() {
        destroyed = true; paused = true;
        finishSeq(); loop.stop(); ro.disconnect();
        bus.dispose();
        style.remove();
      },
      // hooks for tests and the harness
      _debug: { s1, s3, s4, flip1, repair1, setSecded, showStation, stampLogo, dust, cleanCard, setLevel, runSim, decode3, hammingExample, send1,
        drawNow: (k) => stations[k].draw(nowP()), get looping() { return loop.running; } },
    };
  },
};

/* =====================================================================
   _test: pure functions and the verified anchors
   ===================================================================== */
function selfTest() {
  const js = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v));
  const eq = (a, b, m) => { if (js(a) !== js(b)) throw new Error(`${m}: ${js(a)} ≠ ${js(b)}`); };
  const ok = (c, m) => { if (!c) throw new Error(m); };
  // 1. Hamming 1950, Table III, reproduced exactly
  for (let v = 0; v < 16; v++) eq(wordString(hammingEncode(v)), TABLE_III[v], `Table III row ${v}`);
  // 2. Hamming’s worked example, BSTJ p. 153: symbol 12, fifth position spoiled → 101 = 5
  const w = hammingEncode(12); eq(wordString(w), '0111100', 'symbol 12'); w[5] ^= 1;
  eq(wordString(w), '0111000', 'spoiled'); eq(syndrome(w), 5, 'checking number'); eq(circleChecks(w), [1, 0, 1], 'checks 1,2,4');
  // 3. every single flip names its own position
  for (let v = 0; v < 16; v++) for (let p = 1; p <= 7; p++) { const x = hammingEncode(v); x[p] ^= 1; eq(syndrome(x), p, `single ${v}/${p}`); eq(hammingDecode(x).value, v, 'decode'); }
  // 4. two flips name the third point of their Fano line; SECDED refuses
  for (let p = 1; p <= 7; p++) for (let q = p + 1; q <= 7; q++) {
    const x = hammingEncode(12); x[p] ^= 1; x[q] ^= 1;
    eq(syndrome(x), fanoLine(p, q), `double ${p},${q}`); eq(secded(x).status, 'double', 'secded double');
    ok(hammingDecode(x).value !== 12, 'double misdecodes');
  }
  { const x = hammingEncode(9); x[0] ^= 1; eq(secded(x), { status: 'corrected', pos: 0 }, 'eighth digit'); }
  // 5. weights 1, 7, 7, 1; the seven weight-3 codewords are the Fano lines
  eq(weightDistribution(), [1, 0, 0, 7, 7, 0, 0, 1], 'weights');
  const lines = []; for (let v = 0; v < 16; v++) { const x = hammingEncode(v); const s = [1, 2, 3, 4, 5, 6, 7].filter((p) => x[p]); if (s.length === 3) lines.push(s.join(',')); }
  eq(lines.sort(), FANO_LINES.map((l) => l.join(',')).sort(), 'Fano lines');
  // 6. the perfect tiling: 16 × 8 = 128 distinct words, each located back to its cell
  const seen = new Set();
  for (let v = 0; v < 16; v++) for (let s = 0; s < 8; s++) {
    const x = mosaicWord(v, s); seen.add(wordString(x)); eq(locateWord(x), { v, s }, `cell ${v},${s}`);
  }
  eq(seen.size, 128, 'tiling');
  // 7. Golay’s Pascal sums
  eq(ballVolume(7, 1), 8n, 'Hamming ball'); eq(ballVolume(23, 3), 2048n, 'Golay ball'); eq(ballVolume(90, 2), 4096n, '90 ball');
  // Golay’s parity argument: r + r(90 − r) = 2¹¹ has no integer solution
  for (let r = 0; r <= 90; r++) ok(r + r * (90 - r) !== 2048, 'Golay 90');
  // 8. Shannon
  ok(Math.abs(1000 * bscCapacity(0.01) - 919.2) < 0.05, 'Shannon 919'); ok(Math.abs(H2(0.01) - 0.08079) < 1e-5, 'H(0.01)');
  ok(Math.abs((1 / 7) * (7 - Math.log2(8)) - 4 / 7) < 1e-12, 'section 17 capacity');
  ok(Math.abs(capacityCrossing(4 / 7) - 0.08765) < 5e-5, 'crossing');
  ok(Math.abs(hammingBlockError(0.01) - 2.0310e-3) < 1e-7, 'Hamming block error'); ok(Math.abs(uncodedBlockError(0.01) - 3.9404e-2) < 1e-6, 'uncoded');
  ok(Math.abs(1 - 0.95 ** 6 - 0.2649) < 1e-4, 'Mariner uncoded'); ok(Math.abs(pAtLeast(32, 8, 0.05) - 1.391e-4) < 1e-6, 'RM(1,5)');
  // 9. GF(256), 0x11D
  eq([EXP[8], EXP[255], LOG[2]], [29, 1, 1], 'GF exp/log'); eq(gfOrder(2), 255, 'α primitive'); eq(gfOrder(3), 51, 'order of 3');
  eq(gfOrder(gpow(3)), 85, 'α³'); eq(gfOrder(gpow(51)), 5, 'α⁵¹'); eq(primitiveCount(), 128, 'φ(255)');
  for (let a = 1; a < 256; a++) eq(gmul(a, gdiv(1, a)), 1, 'inverse');
  // 10. Reed–Solomon: Thonky’s HELLO WORLD 1-M
  eq(rsEncode([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23], 'HELLO WORLD EC');
  eq(rsGenerator(10).map((c) => LOG[c]), [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45], 'generator logs');
  // 11. format information
  eq(formatBits('L', 4).toString(2).padStart(15, '0'), '110011000101111', 'format L4');
  eq(formatBits('M', 0).toString(2).padStart(15, '0'), '101010000010010', 'format M0');
  eq(formatBits('H', 0).toString(2).padStart(15, '0'), '001011010001001', 'format H0');
  eq(formatBits('Q', 0).toString(2).padStart(15, '0'), '011010101011111', 'format Q0');
  eq(formatBits('L', 0).toString(2).padStart(15, '0'), '111011111000100', 'format L0');
  let dmin = 99; const all = []; for (const lv of 'LMQH') for (let m = 0; m < 8; m++) all.push(formatBits(lv, m));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) dmin = Math.min(dmin, popcount(all[i] ^ all[j]));
  eq(dmin, 7, 'format distance');
  // 12. QR version 2 geometry and the MATHEMAGICAL card
  eq(dataOrder().length, 359, 'data modules');
  const q = qrEncode('MATHEMAGICAL', 'H');
  eq(q.data, [64, 196, 212, 21, 68, 132, 84, 212, 20, 116, 148, 52, 20, 192, 236, 17], 'data codewords');
  eq(q.ec, [73, 160, 58, 132, 123, 9, 171, 95, 35, 91, 16, 172, 63, 220, 91, 192, 210, 160, 103, 34, 78, 108, 2, 225, 21, 211, 232, 89], 'check bytes');
  eq(qrRead(q.matrix).text, 'MATHEMAGICAL', 'round trip');
  ok(q.matrix[6][8] === 1 && q.matrix[8][6] === 1, 'timing modules intact'); eq(q.matrix[17][8], 1, 'dark module');
  // 13. decoder behaviour: 14 errors heal, 15 are refused, never believed
  const rnd = mulberry32(42);
  for (let trial = 0; trial < 60; trial++) {
    const r = q.codewords.slice(), idx = new Set();
    const ne = trial < 30 ? 14 : 15;
    while (idx.size < ne) idx.add(Math.floor(rnd() * 44));
    for (const i of idx) r[i] ^= 1 + Math.floor(rnd() * 255);
    const d = rsDecode(r, 28);
    if (ne === 14) { ok(d.ok, 'heal 14'); eq(d.cw, q.codewords, 'healed 14'); }
    else ok(!d.ok || JSON.stringify(d.cw) !== JSON.stringify(q.codewords), '15 not silently healed');
    if (ne === 15) ok(!d.ok, '15 refused');
  }
  { const r = q.codewords.slice(), er = []; for (let i = 0; i < 28; i++) { r[i + 8] ^= 0x5a; er.push(i + 8); }
    ok(rsDecode(r, 28, er).ok, '28 erasures'); ok(!rsDecode(r, 28).ok, '28 errors without locations'); }
  { const m = q.matrix.map((row) => row.slice()); for (let r = 9; r <= 15; r++) for (let c = 9; c <= 15; c++) m[r][c] = 1;
    const tl = new Set(); const tiles = codewordModules();
    tiles.forEach((mods, k) => { if (mods.some(([r, c]) => r >= 9 && r <= 15 && c >= 9 && c <= 15)) tl.add(k); });
    eq(tl.size, 10, 'logo touches 10 codewords'); eq(qrRead(m).text, 'MATHEMAGICAL', 'logo decodes'); }
  // 14. simulation agrees with the formula (loosely)
  const sim = simulateBSC(0.05, 20000, mulberry32(7));
  ok(Math.abs(sim.hamWrong / 20000 - hammingBlockError(0.05)) < 0.01, 'simulation');
  return true;
}

export const _test = {
  TABLE_III, hammingEncode, hammingValue, syndrome, circleChecks, parity8, secded, hammingDecode, fanoLine, FANO_LINES,
  wordString, mosaicWord, locateWord, weightDistribution,
  binom, ballVolume, H2, bscCapacity, pAtLeast, hammingBlockError, uncodedBlockError, capacityCrossing, mulberry32, simulateBSC,
  EXP, LOG, gmul, gdiv, gpow, gfOrder, primitiveCount,
  rsGenerator, rsEncode, rsSyndromes, rsDecode,
  QR_V2, formatBits, textBytes, dataCodewords, dataOrder, codewordModules, penalty, qrEncode, readFormat, readCodewords, qrRead, finderDamage, popcount,
  selfTest,
};
