// IV·2 — The Art of Forgetting
// Baseline JPEG computed for real on pictures drawn in the browser: the 8×8
// DCT-II of ITU-T T.81 (A.3.3), the Annex K example tables scaled by the IJG
// quality convention, symmetric rounding, the zig-zag of Fig. A.6, and exact
// scan-bit counts from the standard Huffman tables transcribed from T.81
// §K.3.3. Then the ear's version (a bare MDCT transform coder with TDAC, as in
// Princen–Bradley 1986), and Donoho's question (ℓ¹ recovery from a few Fourier
// samples, solved by FISTA).
//
// Sources checked at build time: T.81 (09/92) page text for the tables, the
// Annex K wording and the approval date; libjpeg-turbo jcparam.c for the
// quality curve; Ahmed–Natarajan–Rao 1974 first page (affiliations, received
// date) and Ahmed 1991 ("too simple"); Wallace 1991 Fig. 10; Donoho's 2004
// preprint for the quotation; FDA 510(k) letters K163312 and K162722; RFC 6716;
// Sullivan et al. 2012 for HEVC; Brandenburg 1999 for MP3/AAC line counts.

/* ======================= pure core (node-testable) ======================= */

// T.81 Table K.1 (luminance) and K.2 (chrominance), row-major [v][u].
export const K1 = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
export const K2 = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];
// T.81 Figure A.6: ZZ_INDEX[row*8+col] = position of that coefficient in the zig-zag sequence.
export const ZZ_INDEX = [
  0, 1, 5, 6, 14, 15, 27, 28,
  2, 4, 7, 13, 16, 26, 29, 42,
  3, 8, 12, 17, 25, 30, 41, 43,
  9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54,
  20, 22, 33, 38, 46, 51, 55, 60,
  21, 34, 37, 47, 50, 56, 59, 61,
  35, 36, 48, 49, 57, 58, 62, 63,
];
// ZZ[k] = raster index of the k-th coefficient in file order.
export const ZZ = (() => { const o = new Array(64); for (let i = 0; i < 64; i++) o[ZZ_INDEX[i]] = i; return o; })();
export function zigzagOrder() { return ZZ.slice(); }
// The same walk generated from its rule (even anti-diagonals run up and to the right).
export function zigzagGenerated() {
  const out = [];
  for (let s = 0; s < 15; s++) {
    const cells = [];
    for (let r = 0; r < 8; r++) { const c = s - r; if (c >= 0 && c < 8) cells.push(r * 8 + c); }
    if (s % 2 === 0) cells.reverse();
    out.push(...cells);
  }
  return out;
}

// Standard Huffman tables, T.81 §K.3.3, as printed: 16 BITS bytes, then HUFFVAL.
const HEX = (s) => s.trim().split(/\s+/).map((h) => parseInt(h, 16));
const SPEC = {
  dcL: ['00 01 05 01 01 01 01 01 01 00 00 00 00 00 00 00', '00 01 02 03 04 05 06 07 08 09 0A 0B'],
  dcC: ['00 03 01 01 01 01 01 01 01 01 01 00 00 00 00 00', '00 01 02 03 04 05 06 07 08 09 0A 0B'],
  acL: ['00 02 01 03 03 02 04 03 05 05 04 04 00 00 01 7D',
    `01 02 03 00 04 11 05 12 21 31 41 06 13 51 61 07 22 71 14 32 81 91 A1 08 23 42 B1 C1 15 52 D1 F0
     24 33 62 72 82 09 0A 16 17 18 19 1A 25 26 27 28 29 2A 34 35 36 37 38 39 3A 43 44 45 46 47 48 49
     4A 53 54 55 56 57 58 59 5A 63 64 65 66 67 68 69 6A 73 74 75 76 77 78 79 7A 83 84 85 86 87 88 89
     8A 92 93 94 95 96 97 98 99 9A A2 A3 A4 A5 A6 A7 A8 A9 AA B2 B3 B4 B5 B6 B7 B8 B9 BA C2 C3 C4 C5
     C6 C7 C8 C9 CA D2 D3 D4 D5 D6 D7 D8 D9 DA E1 E2 E3 E4 E5 E6 E7 E8 E9 EA F1 F2 F3 F4 F5 F6 F7 F8
     F9 FA`],
  acC: ['00 02 01 02 04 04 03 04 07 05 04 04 00 01 02 77',
    `00 01 02 03 11 04 05 21 31 06 12 41 51 07 61 71 13 22 32 81 08 14 42 91 A1 B1 C1 09 23 33 52 F0
     15 62 72 D1 0A 16 24 34 E1 25 F1 17 18 19 1A 26 27 28 29 2A 35 36 37 38 39 3A 43 44 45 46 47 48
     49 4A 53 54 55 56 57 58 59 5A 63 64 65 66 67 68 69 6A 73 74 75 76 77 78 79 7A 82 83 84 85 86 87
     88 89 8A 92 93 94 95 96 97 98 99 9A A2 A3 A4 A5 A6 A7 A8 A9 AA B2 B3 B4 B5 B6 B7 B8 B9 BA C2 C3
     C4 C5 C6 C7 C8 C9 CA D2 D3 D4 D5 D6 D7 D8 D9 DA E2 E3 E4 E5 E6 E7 E8 E9 EA F2 F3 F4 F5 F6 F7 F8
     F9 FA`],
};
// Canonical codes from BITS/HUFFVAL (T.81 Annex C): lengths ascend, codes count up.
export function huffTable(bits, vals) {
  const len = new Int8Array(256), code = new Int32Array(256);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < bits[l - 1]; i++) { len[vals[k]] = l; code[vals[k]] = c; c++; k++; }
    c <<= 1;
  }
  return { len, code, count: k };
}
export const HUFF = {};
for (const key in SPEC) HUFF[key] = huffTable(HEX(SPEC[key][0]), HEX(SPEC[key][1]));

// FDCT / IDCT of T.81 A.3.3, separable, on level-shifted samples s[y*8+x] → S[v*8+u].
const C8 = new Float64Array(64);
for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) C8[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
const CU = [Math.SQRT1_2, 1, 1, 1, 1, 1, 1, 1];
export function fdct8(s, S = new Float64Array(64)) {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
    let a = 0;
    for (let x = 0; x < 8; x++) a += s[y * 8 + x] * C8[x * 8 + u];
    tmp[y * 8 + u] = (a * CU[u]) / 2;
  }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let a = 0;
    for (let y = 0; y < 8; y++) a += tmp[y * 8 + u] * C8[y * 8 + v];
    S[v * 8 + u] = (a * CU[v]) / 2;
  }
  return S;
}
export function idct8(S, s = new Float64Array(64)) {
  const tmp = new Float64Array(64);
  for (let v = 0; v < 8; v++) for (let x = 0; x < 8; x++) {
    let a = 0;
    for (let u = 0; u < 8; u++) a += CU[u] * S[v * 8 + u] * C8[x * 8 + u];
    tmp[v * 8 + x] = a / 2;
  }
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    let a = 0;
    for (let v = 0; v < 8; v++) a += CU[v] * tmp[v * 8 + x] * C8[y * 8 + v];
    s[y * 8 + x] = a / 2;
  }
  return s;
}
// The four-fold sum exactly as printed in A.3.3 (for cross-checking the separable one).
export function fdct8Naive(s) {
  const S = new Float64Array(64);
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let a = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
      a += s[y * 8 + x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
    S[v * 8 + u] = 0.25 * CU[u] * CU[v] * a;
  }
  return S;
}
// One basis image (u,v) as the IDCT of a unit coefficient: ¼C(u)C(v)cos·cos.
export function basisImage(u, v) {
  const S = new Float64Array(64); S[v * 8 + u] = 1; return idct8(S);
}

// IJG quality convention (libjpeg jcparam.c): not part of T.81.
export function qualityScale(q) {
  q = Math.round(q);
  if (q <= 0) q = 1;
  if (q > 100) q = 100;
  return q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
}
export function scaledTable(base, q, baseline = true) {
  const sf = qualityScale(q);
  return base.map((b) => {
    let t = Math.floor((b * sf + 50) / 100);
    if (t <= 0) t = 1;
    if (t > 32767) t = 32767;
    if (baseline && t > 255) t = 255;
    return t;
  });
}
// T.81 asks for rounding to nearest; Math.round sends −0.5 toward +∞, so round symmetrically.
export const roundHalfAway = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
export function quantize(S, Q) { const o = new Int16Array(64); for (let i = 0; i < 64; i++) o[i] = roundHalfAway(S[i] / Q[i]); return o; }
export function dequantize(Sq, Q) { const o = new Float64Array(64); for (let i = 0; i < 64; i++) o[i] = Sq[i] * Q[i]; return o; }
// SSSS, the magnitude category of T.81 Tables F.1/F.2.
export function sizeCategory(v) { v = Math.abs(v); let n = 0; while (v) { n++; v >>= 1; } return n; }

// Baseline symbols for one block: DC difference category, then (run,size) pairs, ZRL and EOB.
export function blockSymbols(Sq, prevDC) {
  const diff = Sq[0] - prevDC;
  const dcSize = sizeCategory(diff);
  let extraBits = dcSize, run = 0, last = 0;
  const ac = [];
  for (let k = 63; k >= 1; k--) if (Sq[ZZ[k]] !== 0) { last = k; break; }
  for (let k = 1; k <= last; k++) {
    const c = Sq[ZZ[k]];
    if (c === 0) { run++; continue; }
    while (run > 15) { ac.push({ run: 15, size: 0, k: -1 }); run -= 16; }
    const size = sizeCategory(c);
    ac.push({ run, size, k, v: c });
    extraBits += size;
    run = 0;
  }
  if (last < 63) ac.push({ run: 0, size: 0, k: 64 });
  return { diff, dcSize, ac, extraBits, last };
}
export function blockBits(Sq, prevDC, dc, acT) {
  const sym = blockSymbols(Sq, prevDC);
  let bits = dc.len[sym.dcSize] + sym.extraBits;
  for (const a of sym.ac) bits += acT.len[a.run * 16 + a.size];
  return bits;
}
// The block's actual entropy-coded bits, grouped by symbol (code, then amplitude bits).
export function blockBitstring(Sq, prevDC, dc = HUFF.dcL, acT = HUFF.acL) {
  const sym = blockSymbols(Sq, prevDC);
  const bin = (c, l) => (l ? c.toString(2).padStart(l, '0') : '');
  const amp = (v, s) => (s ? bin(v >= 0 ? v : v + (1 << s) - 1, s) : '');
  const groups = [{ sym: `DC ${sym.dcSize}`, code: bin(dc.code[sym.dcSize], dc.len[sym.dcSize]), extra: amp(sym.diff, sym.dcSize) }];
  for (const a of sym.ac) {
    const rs = a.run * 16 + a.size;
    const name = a.size === 0 ? (a.run === 15 ? 'ZRL' : 'EOB') : `${a.run}/${a.size}`;
    groups.push({ sym: name, code: bin(acT.code[rs], acT.len[rs]), extra: a.size ? amp(a.v, a.size) : '' });
  }
  return groups;
}

// JFIF 1.02 colour conversion.
export function rgbToYcc(r, g, b) {
  return [0.299 * r + 0.587 * g + 0.114 * b, -0.1687 * r - 0.3313 * g + 0.5 * b + 128, 0.5 * r - 0.4187 * g - 0.0813 * b + 128];
}
export function yccToRgb(y, cb, cr) {
  return [y + 1.402 * (cr - 128), y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128), y + 1.772 * (cb - 128)];
}
export function psnr(a, b, peak = 255) {
  let se = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; se += d * d; }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((peak * peak) / mse);
}

/* ---------- scenes, computed pixel by pixel (no canvas, so they are testable) ---------- */

const GA = Math.PI * (3 - Math.sqrt(5));  // the golden angle
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// "Horizon": a dusk sky, a sun, two ridges and a Vogel sunflower of 233 seeds.
export function horizonAt(u, v) {
  let c = mix3([22, 24, 64], [242, 156, 92], smooth(v / 0.66));
  const dx = u - 0.68, dy = (v - 0.47) * 0.75;
  if (dx * dx + dy * dy < 0.085 * 0.085) c = [255, 228, 164];
  if (v > 0.60 + 0.045 * Math.sin(7.1 * u + 1.3) + 0.022 * Math.sin(17.3 * u)) c = [96, 62, 98];
  if (v > 0.72 + 0.060 * Math.sin(4.3 * u + 0.4) + 0.018 * Math.sin(23 * u + 2)) c = [34, 26, 46];
  const hx = (u - 0.20) * 1.3333, hy = v - 0.82, rr = Math.hypot(hx, hy);
  if (rr < 0.135) {
    c = [70, 44, 22];
    const nC = (rr / 0.0086) ** 2;
    for (let n = Math.max(0, Math.floor(nC - 30)); n <= Math.min(232, Math.ceil(nC + 30)); n++) {
      const r = 0.0086 * Math.sqrt(n), a = n * GA;
      if ((hx - r * Math.cos(a)) ** 2 + (hy - r * Math.sin(a)) ** 2 < 0.0052 ** 2) { c = [226, 170, 52]; break; }
    }
  }
  return c;
}
// "Chladni sand": sand on the nodal lines of the square-plate shorthand used in II.4.
export function chladniAt(u, v) {
  const x = (u * 256 - 40) / 176, y = (v * 192 - 8) / 176;
  if (x < 0 || x > 1 || y < 0 || y > 1) return [14, 15, 22];
  const w = Math.cos(5 * Math.PI * x) * Math.cos(2 * Math.PI * y) - Math.cos(2 * Math.PI * x) * Math.cos(5 * Math.PI * y);
  return Math.abs(w) < 0.11 ? [236, 222, 186] : [64, 48, 36];
}
// 2×2-supersampled raster of a scene function (u,v) ∈ [0,1]² → RGB.
export function rasterize(W, H, fn = horizonAt) {
  const rgb = new Uint8ClampedArray(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const c = fn((x + 0.25 + 0.5 * sx) / W, (y + 0.25 + 0.5 * sy) / H);
      r += c[0]; g += c[1]; b += c[2];
    }
    const i = (y * W + x) * 3;
    rgb[i] = Math.round(r / 4); rgb[i + 1] = Math.round(g / 4); rgb[i + 2] = Math.round(b / 4);
  }
  return rgb;
}
// Grey zone plate: rings whose frequency grows with radius, up to (and past) Nyquist.
export function zonePlate(W, H = W, k = W) {
  const z = new Uint8ClampedArray(W * H), cx = (W - 1) / 2, cy = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    z[y * W + x] = Math.round(127.5 + 127.5 * Math.cos((Math.PI * ((x - cx) ** 2 + (y - cy) ** 2)) / k));
  return z;
}

/* ---------- the codec, split so a quality change costs only quantize + IDCT ---------- */

function planeCoefs(plane, W, H) {
  const nb = (W / 8) * (H / 8), coefs = new Float64Array(nb * 64);
  const blk = new Float64Array(64), S = new Float64Array(64);
  let b = 0;
  for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8, b++) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = plane[(by + y) * W + bx + x] - 128;
    fdct8(blk, S);
    coefs.set(S, b * 64);
  }
  return coefs;
}
// Prepare an image: rgb (W·H·3) or grey (W·H, grey = true). W, H multiples of 16.
export function prepareImage(src, W, H, grey = false) {
  const N = W * H, Y = new Float64Array(N);
  let Cb = null, Cr = null;
  if (grey) for (let i = 0; i < N; i++) Y[i] = src[i];
  else {
    const W2 = W / 2, H2 = H / 2, cb = new Float64Array(N), cr = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const c = rgbToYcc(src[3 * i], src[3 * i + 1], src[3 * i + 2]);
      Y[i] = c[0]; cb[i] = c[1]; cr[i] = c[2];
    }
    Cb = new Float64Array(W2 * H2); Cr = new Float64Array(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = 2 * y * W + 2 * x;
      Cb[y * W2 + x] = (cb[i] + cb[i + 1] + cb[i + W] + cb[i + W + 1]) / 4;
      Cr[y * W2 + x] = (cr[i] + cr[i + 1] + cr[i + W] + cr[i + W + 1]) / 4;
    }
  }
  return {
    W, H, grey, src, Y,
    yCoef: planeCoefs(Y, W, H),
    cbCoef: grey ? null : planeCoefs(Cb, W / 2, H / 2),
    crCoef: grey ? null : planeCoefs(Cr, W / 2, H / 2),
  };
}
// Quantize, count exact scan bits (one sequential scan per component), dequantize, IDCT.
function codePlane(coefs, W, H, Q, dc, ac, keepSq) {
  const out = new Float64Array(W * H), nb = coefs.length / 64;
  const S = new Float64Array(64), Sq = new Int16Array(64), R = new Float64Array(64), s = new Float64Array(64);
  const allSq = keepSq ? new Int16Array(nb * 64) : null;
  let bits = 0, nz = 0, prev = 0, b = 0;
  for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8, b++) {
    let acNZ = false;
    for (let i = 0; i < 64; i++) {
      S[i] = coefs[b * 64 + i];
      const q = roundHalfAway(S[i] / Q[i]);
      Sq[i] = q;
      if (q) { nz++; if (i) acNZ = true; }
      R[i] = q * Q[i];
    }
    if (allSq) allSq.set(Sq, b * 64);
    bits += blockBits(Sq, prev, dc, ac);
    prev = Sq[0];
    if (acNZ) idct8(R, s); else s.fill(R[0] / 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[(by + y) * W + bx + x] = s[y * 8 + x] + 128;
  }
  return { out, bits, nz, sq: allSq };
}
export function encodeImage(prep, q) {
  const { W, H, grey } = prep;
  const QL = scaledTable(K1, q), QC = scaledTable(K2, q);
  const y = codePlane(prep.yCoef, W, H, QL, HUFF.dcL, HUFF.acL, true);
  const N = W * H;
  let cb = null, cr = null;
  const rgb = new Uint8ClampedArray(N * 3);
  if (grey) {
    for (let i = 0; i < N; i++) { const v = y.out[i]; rgb[3 * i] = rgb[3 * i + 1] = rgb[3 * i + 2] = v; }
  } else {
    const W2 = W / 2;
    cb = codePlane(prep.cbCoef, W2, H / 2, QC, HUFF.dcC, HUFF.acC, false);
    cr = codePlane(prep.crCoef, W2, H / 2, QC, HUFF.dcC, HUFF.acC, false);
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      const i = yy * W + xx, j = (yy >> 1) * W2 + (xx >> 1);
      const c = yccToRgb(y.out[i], cb.out[j], cr.out[j]);
      rgb[3 * i] = c[0]; rgb[3 * i + 1] = c[1]; rgb[3 * i + 2] = c[2];
    }
  }
  const bits = y.bits + (cb ? cb.bits + cr.bits : 0);
  const rawBytes = N * (grey ? 1 : 3);
  const srcRGB = grey ? null : prep.src;
  let p;
  if (grey) { const g = new Uint8ClampedArray(N); for (let i = 0; i < N; i++) g[i] = y.out[i]; p = psnr(prep.src, g); }
  else p = psnr(srcRGB, rgb);
  return {
    q, QL, QC, rgb, yOut: y.out, ySq: y.sq, bits, bitsY: y.bits, bitsCb: cb ? cb.bits : 0, bitsCr: cr ? cr.bits : 0,
    nzY: y.nz, totalY: N, rawBytes, scanBytes: Math.ceil(bits / 8), ratio: (rawBytes * 8) / bits, psnr: p,
  };
}

/* ---------- why cosines: the free membrane, and near-optimal energy compaction ---------- */

// Eigenvalues of the insulated second difference on 8 points: λ_k = 4 sin²(kπ/16).
export const membraneLambda = (k) => 4 * Math.sin((k * Math.PI) / 16) ** 2;
// Basis image (u,v) is a mode of the free 8×8 membrane; pitch ∝ √(λ_u + λ_v), (1,0) at f0.
export const membraneFreq = (u, v, f0 = 110) => f0 * Math.sqrt((membraneLambda(u) + membraneLambda(v)) / membraneLambda(1));
export function dctVariances(N, rho) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const c = [];
    for (let n = 0; n < N; n++) c.push((k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N)) * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N)));
    let s = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) s += c[i] * rho ** Math.abs(i - j) * c[j];
    out.push(s);
  }
  return out;
}
export function codingGainDb(vars) {
  const am = vars.reduce((a, b) => a + b, 0) / vars.length;
  const gm = Math.exp(vars.reduce((a, b) => a + Math.log(b), 0) / vars.length);
  return 10 * Math.log10(am / gm);
}
// Karhunen–Loève variances = eigenvalues of the AR(1) covariance (cyclic Jacobi).
export function klVariances(N, rho) {
  const A = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => rho ** Math.abs(i - j)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) off += A[i][j] ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < N; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < N; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
    }
  }
  return A.map((r, i) => r[i]).sort((a, b) => b - a);
}

/* ---------- the ear: MDCT with time-domain aliasing cancellation ---------- */

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
// DCT-IV, X_k = Σ u_n cos(π/N (n+½)(k+½)), through an N/2-point complex FFT.
export function dct4(u) {
  const N = u.length, M = N >> 1, re = new Float64Array(M), im = new Float64Array(M);
  for (let n = 0; n < M; n++) {
    const a = u[2 * n], b = u[N - 1 - 2 * n], th = (-Math.PI * (4 * n + 1)) / (4 * N), c = Math.cos(th), s = Math.sin(th);
    re[n] = a * c - b * s; im[n] = a * s + b * c;
  }
  fft(re, im);
  const X = new Float64Array(N);
  for (let k = 0; k < M; k++) {
    const th = (-Math.PI * k) / N, c = Math.cos(th), s = Math.sin(th);
    X[2 * k] = re[k] * c - im[k] * s;
    X[N - 1 - 2 * k] = -(re[k] * s + im[k] * c);
  }
  return X;
}
export function dct4Naive(u) {
  const N = u.length, X = new Float64Array(N);
  for (let k = 0; k < N; k++) { let a = 0; for (let n = 0; n < N; n++) a += u[n] * Math.cos((Math.PI / N) * (n + 0.5) * (k + 0.5)); X[k] = a; }
  return X;
}
// MDCT of 2N samples by folding [a b c d] → (−c_r − d, a − b_r), then DCT-IV.
export function mdctFast(x) {
  const N = x.length >> 1, H = N >> 1, u = new Float64Array(N);
  for (let n = 0; n < H; n++) { u[n] = -x[3 * H - 1 - n] - x[3 * H + n]; u[H + n] = x[n] - x[N - 1 - n]; }
  return dct4(u);
}
export function mdctNaive(x) {
  const N = x.length >> 1, X = new Float64Array(N);
  for (let k = 0; k < N; k++) { let a = 0; for (let n = 0; n < 2 * N; n++) a += x[n] * Math.cos((Math.PI / N) * (n + 0.5 + N / 2) * (k + 0.5)); X[k] = a; }
  return X;
}
export function imdctFast(X) {
  const N = X.length, H = N >> 1, u = dct4(X), y = new Float64Array(2 * N);
  for (let n = 0; n < H; n++) { y[n] = u[H + n]; y[N - 1 - n] = -u[H + n]; y[3 * H - 1 - n] = -u[n]; y[3 * H + n] = -u[n]; }
  return y;
}
export function sineWindow(N) { const w = new Float64Array(2 * N); for (let n = 0; n < 2 * N; n++) w[n] = Math.sin((Math.PI * (n + 0.5)) / (2 * N)); return w; }
// One frame through the coder alone: windowed MDCT, √(2/N) scaling, windowed IMDCT (still aliased).
export function mdctFrame(seg, N) {
  const w = sineWindow(N), s = Math.sqrt(2 / N), x = new Float64Array(2 * N);
  for (let n = 0; n < 2 * N; n++) x[n] = seg[n] * w[n];
  const X = mdctFast(x);
  for (let k = 0; k < N; k++) X[k] *= s;
  const y = imdctFast(X);
  for (let n = 0; n < 2 * N; n++) y[n] *= s * w[n];
  return y;
}
// Whole-signal transform coder: hop N, sine window, uniform quantizer of step Δ (0 = none).
export function mdctCodec(sig, N, step) {
  const w = sineWindow(N), s = Math.sqrt(2 / N), L = sig.length, frames = Math.ceil(L / N) + 1;
  const pad = new Float64Array((frames + 1) * N);
  pad.set(sig, N);
  const out = new Float64Array(pad.length), coefs = new Float32Array(frames * N), seg = new Float64Array(2 * N);
  let nz = 0;
  for (let f = 0; f < frames; f++) {
    for (let n = 0; n < 2 * N; n++) seg[n] = pad[f * N + n] * w[n];
    const X = mdctFast(seg);
    for (let k = 0; k < N; k++) {
      let v = X[k] * s;
      if (step > 0) v = roundHalfAway(v / step) * step;
      X[k] = v; coefs[f * N + k] = v;
      if (v !== 0) nz++;
    }
    const y = imdctFast(X);
    for (let n = 0; n < 2 * N; n++) out[f * N + n] += s * w[n] * y[n];
  }
  return { out: out.slice(N, N + L), nz, total: frames * N, frames, N, coefs };
}
export function snrDb(x, y) {
  let a = 0, e = 0;
  for (let i = 0; i < x.length; i++) { a += x[i] * x[i]; e += (x[i] - y[i]) ** 2; }
  return e === 0 ? Infinity : 10 * Math.log10(a / e);
}
// How long before an attack at sample n0 the coding error first exceeds thr (seconds).
export function preEcho(sig, out, n0, fs, thr = 1e-3, look = 4096) {
  for (let n = Math.max(0, n0 - look); n < n0; n++) if (Math.abs(out[n] - sig[n]) > thr) return (n0 - n) / fs;
  return 0;
}

/* ---------- Donoho's question: ℓ¹ recovery from a few Fourier samples ---------- */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Unitary DFT of a real vector, and the inverse of a complex spectrum.
export function dftR(x) {
  const n = x.length, re = Float64Array.from(x), im = new Float64Array(n), s = 1 / Math.sqrt(n);
  fft(re, im);
  for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; }
  return { re, im };
}
export function idftC(X) {
  const n = X.re.length, re = Float64Array.from(X.re), im = new Float64Array(n), s = 1 / Math.sqrt(n);
  for (let i = 0; i < n; i++) im[i] = -X.im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= -s; }
  return { re, im };
}
export function spikes(n, s, rng) {
  const x = new Float64Array(n), idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (let i = 0; i < s; i++) x[idx[i]] = (rng() < 0.5 ? -1 : 1) * (0.5 + rng());
  return x;
}
// A drum part: s accents at distinct steps, loudness in [0.45, 1].
export function rhythm(n, s, rng) {
  const x = new Float64Array(n), idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (let i = 0; i < s; i++) x[idx[i]] = 0.45 + 0.55 * rng();
  return x;
}
// DC plus random conjugate pairs (k, n−k), so the measured data are those of a real signal.
export function randomMask(n, m, rng) {
  const mask = new Uint8Array(n), half = [];
  mask[0] = 1;
  let c = 1;
  for (let k = 1; k < n / 2; k++) half.push(k);
  for (let i = half.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [half[i], half[j]] = [half[j], half[i]]; }
  for (const k of half) { if (c + 2 > m) break; mask[k] = 1; mask[n - k] = 1; c += 2; }
  return mask;
}
export function measure(x, mask) {
  const Y = dftR(x);
  for (let k = 0; k < mask.length; k++) if (!mask[k]) { Y.re[k] = 0; Y.im[k] = 0; }
  return Y;
}
// Minimum-energy guess: put zeros where nothing was measured and invert.
export function zeroFill(Y, mask) {
  const n = mask.length, Z = { re: new Float64Array(n), im: new Float64Array(n) };
  for (let k = 0; k < n; k++) if (mask[k]) { Z.re[k] = Y.re[k]; Z.im[k] = Y.im[k]; }
  return idftC(Z).re;
}
// FISTA on ½‖M F x − y‖² + λ‖x‖₁ (F unitary, so step 1), λ shrinking geometrically; steppable.
export function fistaSolver(Y, mask, iters = 600, lam0 = 0.5, lamMin = 1e-4) {
  const n = mask.length, decay = Math.pow(lamMin / lam0, 1 / (iters * 0.8));
  let x = new Float64Array(n), z = new Float64Array(n), t = 1, lam = lam0, it = 0;
  return {
    iters,
    get x() { return x; },
    get it() { return it; },
    step(k = 1) {
      for (let j = 0; j < k && it < iters; j++, it++) {
        const Fz = dftR(z);
        for (let q = 0; q < n; q++) {
          if (mask[q]) { Fz.re[q] -= Y.re[q]; Fz.im[q] -= Y.im[q]; } else { Fz.re[q] = 0; Fz.im[q] = 0; }
        }
        const g = idftC(Fz).re, xn = new Float64Array(n);
        for (let i = 0; i < n; i++) { const v = z[i] - g[i]; xn[i] = Math.sign(v) * Math.max(0, Math.abs(v) - lam); }
        const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
        for (let i = 0; i < n; i++) z[i] = xn[i] + ((t - 1) / tn) * (xn[i] - x[i]);
        x = xn; t = tn; lam = Math.max(lamMin, lam * decay);
      }
      return it >= iters;
    },
  };
}
export function fistaL1(Y, mask, iters = 600, lam0 = 0.5, lamMin = 1e-4) {
  const f = fistaSolver(Y, mask, iters, lam0, lamMin); f.step(iters); return f.x;
}
export function relErr(a, b) {
  let num = 0, den = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - b[i]) ** 2; den += b[i] ** 2; }
  return Math.sqrt(num / den);
}

// Gregory Wallace's worked example ("The JPEG Still Picture Compression Standard", 1991; Fig. 10(a) of the
// revision at ijg.org): an 8×8 block "aribtrarily [sic] extracted from a real image".
export const WALLACE = [
  139, 144, 149, 153, 155, 155, 155, 155,
  144, 151, 153, 156, 159, 156, 156, 156,
  150, 155, 160, 163, 158, 156, 156, 156,
  159, 161, 162, 160, 160, 159, 159, 159,
  159, 160, 161, 162, 162, 155, 155, 155,
  161, 161, 161, 161, 160, 157, 157, 157,
  162, 162, 161, 163, 162, 157, 157, 157,
  162, 162, 161, 161, 163, 158, 158, 158,
];


/* ============================ the exhibit ============================ */

const FS = 22050;                        // sample rate of the ear station
const CLIP_LEN = Math.round(2.4 * FS);   // 2.4 s
const ATTACKS = [0.5, 1.2, 1.9];         // castanet onsets (s)

function makeClip(kind) {
  const x = new Float64Array(CLIP_LEN);
  if (kind === 'glass') {
    for (let n = 0; n < CLIP_LEN; n++) {
      const t = n / FS, env = Math.min(1, t / 0.04, (2.4 - t) / 0.12);
      x[n] = env * (0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 440 * t) + 0.1 * Math.sin(2 * Math.PI * 660 * t));
    }
  } else if (kind === 'castanets') {
    for (const a of ATTACKS) {
      const n0 = Math.round(a * FS);
      for (let t = 0; t < 1400 && n0 + t < CLIP_LEN; t++) x[n0 + t] += 0.8 * Math.exp(-t / 60) * Math.sin((2 * Math.PI * 2500 * t) / FS);
    }
  } else {
    const r = mulberry32(1);
    for (let n = 0; n < CLIP_LEN; n++) x[n] = 0.3 * (2 * r() - 1);
    for (let n = 0; n < 900; n++) { x[n] *= n / 900; x[CLIP_LEN - 1 - n] *= n / 900; }
  }
  return x;
}

export default {
  id: 'lossy',
  movement: 4,
  title: 'The Art of Forgetting',
  hook: 'Keep one number in fifteen and your eye swears nothing is missing. A cosine from 1974 decides which fourteen to forget.',
  era: '1807–2026 · from Fourier’s heat to JPEG, MP3 and MRI',
  prose: `
    <p>In early 1972 Nasir Ahmed asked the National Science Foundation to pay for a study of
    what he called a “cosine transform”. The proposal was turned down, and he remembered one
    reviewer’s verdict that the whole idea seemed “too simple”. He did the work anyway, at
    Kansas State University with his doctoral student T. Natarajan and with K. R. Rao of the
    University of Texas at Arlington, and in January 1974 the three published it as a
    four-page correspondence in the <em>IEEE Transactions on Computers</em>. Ahmed wanted a
    cheap stand-in for the Karhunen–Loève transform, which packs a correlated signal into as
    few numbers as mathematics allows but has no fast algorithm. Model a row of pixels as a
    Markov chain whose neighbours correlate at 0.95, and by our own computation the cosine puts
    88 per cent of the variance into its first coefficient and falls short of the optimum by
    only 0.02 dB: a coding gain of 8.826 dB against 8.846.</p>
    <p>The Joint Photographic Experts Group was formed in 1986, and on 18 September 1992 the
    CCITT approved its standard, Recommendation T.81. The baseline recipe is short enough to
    recite. Cut the picture into 8×8 blocks and subtract 128 from every sample. Rewrite each
    block as a weighted sum of sixty-four fixed cosine patterns. Divide each weight by the
    matching entry of a quantization table and round it to a whole number. Read the survivors
    in zig-zag order, broadest pattern first, so that the zeros pile up at the end, and pack
    them with Huffman codes. Apart from the colour, which is usually averaged over squares of
    four pixels, the rounding is where nearly all the forgetting happens. On the dusk scene
    below, at quality 50,
    where the table is used exactly as printed, 3,211 of the 49,152 brightness weights
    survive, one in fifteen, and 147,456 bytes of pixels become 2,787 bytes of coded data.</p>
    <p>The table is where the eye comes in. Its divisors are small for broad patterns and
    large for fine ones, and Annex K of the standard says its two example tables are “based
    on psychovisual thresholding and are derived empirically”, then calls them “examples
    only”. The dial from 1 to 100 is not in the standard at all. It is a convention of the
    Independent JPEG Group’s free library, which scales the printed table up or down; the
    annex itself remarks that halving the table usually leaves the picture “nearly
    indistinguishable from the source image”, and halving is what that dial calls 75.</p>
    <p>The sixty-four patterns are older than JPEG. Each is a product of two cosines, one
    across and one down, sampled at the eight pixel centres: a single term of the shorthand
    that drew <a href="#ex-chladni">Chladni’s sand</a>, without the twin laid over it.
    Rayleigh saw that the shorthand belongs to a membrane whose rim is free to slide, and the
    patterns are exactly the vibration modes of that membrane shrunk to an 8×8 net of beads
    and springs with free edges. Strike the block and it rings as that little drum would,
    each surviving weight a partial; the average brightness is the one mode that does not
    vibrate, and it is silent.
    Fourier’s bookkeeping from <a href="#ex-fourier">the atelier</a> carries over unchanged.
    The transform is orthonormal, so the error in the pixels carries exactly the energy of the
    error in the weights, and an edge whose fine cosines are cut rings the way the square wave
    did.</p>
    <p>Sound took a cousin of the same transform. In October 1986 John Princen and Alan
    Bradley published a filter bank built on <em>time-domain aliasing cancellation</em>, the
    idea behind the modified discrete cosine transform: frames overlap by half, each frame on
    its own returns its input tangled with a time-reversed copy of itself, and the next
    frame’s tangle cancels it exactly. MP3 cuts each frame into 576 frequency lines, AAC into
    1,024. Long
    frames have a price you can hear on a castanet. The rounding error spreads across the
    whole window, so a faint hiss arrives before the click that caused it. Karlheinz
    Brandenburg of Fraunhofer, explaining both codecs in 1999, counted this pre-echo among the
    artefacts “most difficult to avoid”; both switch to shorter frames to dodge it.</p>
    <p>In a preprint dated September 2004, David Donoho looked at the success of lossy
    compression and asked: “why go to so much effort to acquire all the data when most of
    what we get will be thrown away?” Emmanuel Candès, Justin Romberg and Terence Tao, in a
    preprint of the same month, had shown how little is needed. A signal made of a few spikes
    can be recovered
    exactly, with overwhelming probability, from a small random set of its Fourier
    coefficients, by choosing among all the signals that fit the measurements the one whose
    absolute values add up to the least. Both papers appeared in 2006. An MRI scanner never
    takes a picture; it samples the picture’s Fourier transform point by point, and sampling
    less shortens the scan. The last station runs the same recovery on a drum part and keeps
    an honest tally of when it fails.</p>`,
  chronicle: [
    { year: 1807, date: '21 December 1807', text: 'Joseph Fourier’s memoir on the propagation of heat is read to the Paris Institute; in 1808 Lagrange and Laplace object to its expansion of functions as <em>trigonometrical series</em>.' },
    { year: 1974, date: 'January 1974', text: 'Nasir Ahmed, T. Natarajan and K. R. Rao publish the <em>discrete cosine transform</em> in IEEE Transactions on Computers, a fast stand-in for the optimal Karhunen–Loève transform, which has no general fast algorithm.' },
    { year: 1986, date: 'October 1986', text: 'John Princen and Alan Bradley publish filter banks based on <em>time-domain aliasing cancellation</em>, the construction behind the modified discrete cosine transform of MP3, AAC and Opus.' },
    { year: 1992, date: '18 September 1992', text: 'The CCITT approves Recommendation T.81, the JPEG standard: 8×8 cosine blocks, a quantization table, a zig-zag scan and Huffman codes.' },
    { year: 1995, date: '14 July 1995', text: 'Researchers at Fraunhofer IIS settle on <em>.mp3</em> as the file extension for MPEG Audio Layer 3.' },
    { year: 2006, date: 'February and April 2006', text: 'Emmanuel Candès, Justin Romberg and Terence Tao prove that a sparse signal can, with overwhelming probability, be recovered exactly from a few random Fourier samples by ℓ¹ minimization, and David Donoho’s paper names the idea <em>compressed sensing</em>.' },
    { year: 2017, date: '27 January 2017', text: 'The FDA clears Siemens’ Compressed Sensing Cardiac Cine, and on 20 April GE’s HyperSense: compressed sensing reaches commercial MRI scanners.' },
    { year: 2025, date: '2025', text: 'JPEG AI is published as ITU-T T.840.1 and ISO/IEC 6048-1:2025, an image codec whose transform is <em>learned end to end</em> rather than derived.' },
  ],
  today: `
    <p>The cosine never left. HEVC (ITU-T H.265, first edition April 2013) codes its prediction
    residuals with integer approximations of the DCT on blocks from 4×4 to 32×32, swapping in a
    sine-derived transform for 4×4 intra luma blocks. JPEG XL (ISO/IEC 18181) keeps the DCT but
    lets the block size vary. In audio, AAC uses up to 1,024 MDCT lines where MP3 used 576, and
    Opus (RFC 6716, 2012), which every WebRTC endpoint must support, has an MDCT layer built on
    the CELT codec.</p>
    <p>MRI scanners measure the Fourier transform of the image they will show, sample by sample,
    in what physicists call <em>k-space</em>. After Lustig, Donoho and Pauly’s <em>Sparse MRI</em> (2007) showed how
    compressed sensing applies, the FDA cleared Siemens’ Compressed Sensing Cardiac Cine on
    27 January 2017 and GE’s HyperSense, “based on sparse data sampling and iterative
    reconstruction”, on 20 April 2017.</p>
    <p>The live frontier is learned transforms. JPEG AI (ISO/IEC 6048-1:2025) replaces the fixed
    cosines with a transform trained end to end, a line of work that includes Ballé, Laparra and
    Simoncelli’s <em>End-to-end Optimized Image Compression</em> (2016).</p>`,
  sources: [
    { text: 'N. Ahmed, T. Natarajan, K. R. Rao, “Discrete Cosine Transform”, <em>IEEE Transactions on Computers</em> C-23(1):90–93 (January 1974)', url: 'https://doi.org/10.1109/T-C.1974.223784' },
    { text: 'N. Ahmed, “How I Came Up with the Discrete Cosine Transform”, <em>Digital Signal Processing</em> 1(1):4–5 (1991): the 1972 proposal and the reviewer’s “too simple”', url: 'https://doi.org/10.1016/1051-2004(91)90086-Z' },
    { text: 'CCITT Recommendation T.81 | ISO/IEC 10918-1, <em>Digital Compression and Coding of Continuous-Tone Still Images</em> (approved 18 September 1992); Annex K tables', url: 'https://www.w3.org/Graphics/JPEG/itu-t81.pdf' },
    { text: 'G. K. Wallace, “The JPEG Still Picture Compression Standard”, <em>Communications of the ACM</em> 34(4):30–44 (April 1991); the linked revision, submitted in December 1991 to <em>IEEE Transactions on Consumer Electronics</em>, has the worked example as Fig. 10', url: 'https://ijg.org/files/Wallace.JPEG.pdf' },
    { text: 'Independent JPEG Group code in libjpeg-turbo, <code>jcparam.c</code>: the quality-scaling curve', url: 'https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/src/jcparam.c' },
    { text: 'J. Princen, A. Bradley, “Analysis/Synthesis Filter Bank Design Based on Time Domain Aliasing Cancellation”, <em>IEEE Trans. ASSP</em> 34(5):1153–1161 (1986)', url: 'https://doi.org/10.1109/TASSP.1986.1164954' },
    { text: 'K. Brandenburg, “MP3 and AAC Explained”, AES 17th International Conference on High-Quality Audio Coding (1999)', url: 'https://www.iis.fraunhofer.de/content/dam/iis/de/doc/ame/conference/AES-17-Conference_mp3-and-AAC-explained_AES17.pdf' },
    { text: 'E. Candès, J. Romberg, T. Tao, “Robust Uncertainty Principles”, <em>IEEE Trans. Information Theory</em> 52(2):489–509 (2006), preprint arXiv:math/0409186 (10 September 2004); and D. L. Donoho, “Compressed Sensing”, <em>IEEE Trans. Information Theory</em> 52(4):1289–1306 (2006), preprint dated 14 September 2004', url: 'https://doi.org/10.1109/TIT.2006.871582' },
    { text: 'U.S. FDA, 510(k) clearance letters K163312, Siemens MAGNETOM Aera and Skyra with syngo MR E11C-AP02 (Compressed Sensing Cardiac Cine), 27 January 2017, and K162722, GE HyperSense, 20 April 2017', url: 'https://www.accessdata.fda.gov/cdrh_docs/pdf16/K163312.pdf' },
    { text: 'JPEG Committee, “Overview of JPEG AI”: ITU-T T.840.1 | ISO/IEC 6048-1:2025, the first international image coding standard based on end-to-end learning', url: 'https://jpeg.org/jpegai/' },
  ],
  alt: 'A baseline JPEG codec at work on a drawn dusk scene: original and decoded halves split by a draggable gold seam, one 8×8 block magnified beside its sixty-four cosine weights and basis patterns, and a ledger of bytes kept; further stations code three sounds with an MDCT and recover a sparse rhythm from a few Fourier samples.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const VG = P.verdigris, CB = P.crimsonBright, GHOST = P.inkGhost;   // v2 palette keys
    const SERIF = getComputedStyle(document.body).fontFamily || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const fmt = (n) => Math.round(n).toLocaleString('en-US').replace('-', '−');
    // "1 in 15" while the survivors are few; a percentage once most weights survive
    const keptShare = (nz, total) => (!nz ? 'none' : total / nz >= 2.5 ? `1 in ${Math.round(total / nz)}` : `${Math.round((100 * nz) / total)}%`);
    const num = (x, d) => (d == null ? String(x) : x.toFixed(d)).replace('-', '−');
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const bus = audio.createBus('lossy');
    const nowA = () => { const c = audio.getContext(); return c ? c.currentTime : 0; };

    const style = document.createElement('style');
    style.textContent = `
      #ex-lossy .lossy-hidden { display: none !important; }
      #ex-lossy .lossy-tabs { margin-top: 0; gap: .5rem; }
      #ex-lossy .lossy-tabs .btn { font-variant-numeric: lining-nums; }
      #ex-lossy .lossy-tabs .btn.active { border-color: ${VG}; color: ${VG}; background: rgba(98, 179, 164, 0.1); }
      #ex-lossy .lossy-tabs .btn:hover { border-color: ${VG}; }
      #ex-lossy canvas.lossy-cv { outline: none; }
      #ex-lossy canvas.lossy-cv:focus-visible { box-shadow: 0 0 0 2px var(--bg, #0c0d12), 0 0 0 3px ${VG}; }
      #ex-lossy .readout.lossy-info { white-space: pre-wrap; min-height: 2.6em; line-height: 1.45; color: var(--ink-dim, #a9a493); }
      #ex-lossy .readout.lossy-info b { color: var(--gold-bright, #e8c87c); font-weight: normal; }
      #ex-lossy .readout.lossy-info i { color: ${VG}; font-style: normal; }
      #ex-lossy .readout.lossy-info s { color: ${CB}; text-decoration: none; }
      #ex-lossy .controls { row-gap: .7rem; }
      #ex-lossy .controls .ctl { min-width: 7.5rem; }
    `;
    stage.appendChild(style);

    /* ---------------- shell: tabs, quest, stations, panels ---------------- */
    const tabRow = ui.controlRow(stage);
    tabRow.classList.add('lossy-tabs');
    const TABS = [['pic', 'I · sixty-four cosines'], ['ear', 'II · the ear'], ['cs', 'III · the unmeasured']];
    const tabBtn = {};
    for (const [id, label] of TABS) {
      tabBtn[id] = ui.button(tabRow, label, () => setStation(id), { small: true });
    }
    const quest = ui.questBanner(stage, '');
    const box = {};
    for (const [id] of TABS) { box[id] = document.createElement('div'); stage.appendChild(box[id]); }
    const mathEl = ui.mathline(stage, '');
    const capEl = ui.caption(stage, '');
    ui.legendPanel(stage, `
      <p>MP3, it is said, was tuned on one song above all, Suzanne Vega’s unaccompanied
      “Tom’s Diner”, until her voice came through clean. The tale has grown with the telling.
      What can be checked is smaller: the song was among the recordings used in the codec’s
      listening tests, and the composer Ryan Maguire’s <em>The Ghost in the MP3</em>, presented
      in 2014, is music made from what the encoder throws away, including a piece built on that
      song. The residue is plainly audible on its own; the second station plays one.</p>
      <p>It is also said that Lagrange rejected Fourier’s series out of hand. The record is
      plainer. In 1808 Lagrange and Laplace objected to expanding functions as trigonometrical
      series, and the Institute’s prize for 1811, judged by a committee that included both of
      them, went to Fourier all the same.</p>`);
    ui.speculationPanel(stage, `
      <p>Ahmed built the cosine transform as a convenience, a fast
      stand-in for an optimal transform that had none, which makes it sound invented. Yet the
      same sixty-four patterns fall out of a free vibrating net with no reference to pictures at
      all, and on the textbook model of an image row they fall short of the optimum by only
      0.02 dB, which makes them sound found. Learned codecs such as JPEG AI now let data choose the
      transform. If training on photographs kept drifting back toward something cosine-like,
      that would count for the second reading. Nobody has shown it; this is conjecture.</p>`,
      'discovered or invented');

    const QUESTS = {
      pic: [
        'Drag the gold seam across the picture. Left of it is the original; right of it is what a JPEG at quality 50 keeps. Find the border if you can.',
        'Now pull the quality down until the right half gives itself away, then tap a block where the damage shows.',
        'Press <em>build</em> to lay that block down again, one cosine at a time, in the order the file stores them.',
      ],
      ear: 'Choose the castanets and play the coded clip with the long window, then with the short one. Listen for the hiss that arrives before each click.',
      cs: 'Measure as few frequencies as you can and still get the rhythm back. Get down to a quarter of them, 63 of 256, and press <em>recover</em>.',
    };
    const CAPS = {
      pic: 'Computed in your browser: T.81’s transform, the Annex K tables scaled by the IJG quality curve, 4:2:0 colour, and exact bit counts from the standard Huffman tables of §K.3.3. The byte counts are the coded scan alone; a real .jpg adds headers and tables. Try the zone plate at quality 100: the scan outgrows the raw pixels and is still not lossless.',
      ear: 'A bare MDCT coder: sine window, one block size per clip, one uniform quantizer step. MP3 and AAC add a psychoacoustic model, scale-factor bands, entropy coding and window switching. The ghost is the residual, amplified by the factor shown on its button.',
      cs: 'A 256-step drum part stands in for an image: sparse in time, and measured only at the azure frequencies. Tap the dial to add or remove an accent. Zero-filling assumes every unmeasured coefficient is zero; ℓ¹ recovery (FISTA, 600 iterations) prefers, among the rhythms that fit, the one whose values add up to the least, and that is usually the sparse one. An analogy for MRI’s k-space, not a scanner simulation.',
    };
    const MATH = {
      pic: 'S<sub>vu</sub> = ¼ C<sub>u</sub>C<sub>v</sub> Σ (p<sub>yx</sub> − 128) cos((2x+1)uπ/16) cos((2y+1)vπ/16) &nbsp;→&nbsp; round(S ÷ Q<sub>vu</sub>)',
      ear: 'X<sub>k</sub> = √(2/N) Σ w<sub>n</sub> x<sub>n</sub> cos[π/N (n + ½ + N/2)(k + ½)] &nbsp;&nbsp;·&nbsp;&nbsp; w<sub>n</sub>² + w<sub>n+N</sub>² = 1',
      cs: 'x̂ = argmin ½ ‖(Fx)<sub>Ω</sub> − y‖² + λ ‖x‖<sub>1</sub>',
    };

    let station = 'pic';
    const questState = { pic: { step: 0, done: false, seam: false, q: false }, ear: { done: false, long: false, short: false }, cs: { done: false } };

    function setQuest() {
      const qs = questState[station];
      if (station === 'pic') {
        if (qs.done) quest.done(picDoneText()); else quest.set(QUESTS.pic[qs.step]);
      } else if (qs.done) quest.done(qs.text); else quest.set(QUESTS[station]);
    }

    const stations = {};
    function setStation(id) {
      if (station !== id) stopSounds();
      station = id;
      for (const [k] of TABS) {
        box[k].classList.toggle('lossy-hidden', k !== id);
        tabBtn[k].classList.toggle('active', k === id);
        tabBtn[k].setAttribute('aria-pressed', String(k === id));
      }
      if (!stations[id]) stations[id] = id === 'pic' ? buildPic() : id === 'ear' ? buildEar() : buildCS();
      mathEl.innerHTML = MATH[id];
      capEl.innerHTML = CAPS[id];
      setQuest();
      stations[id].show();
    }

    // text helper with optional tracking (small capitals are set as tracked capitals)
    function txt(ctx, s, x, y, o = {}) {
      ctx.font = o.font || `11px ${MONO}`;
      ctx.fillStyle = o.color || P.inkDim;
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.base || 'alphabetic';
      const tr = 'letterSpacing' in ctx;
      if (tr) ctx.letterSpacing = (o.track || 0) + 'px';
      ctx.fillText(s, x, y);
      if (tr) ctx.letterSpacing = '0px';
      return ctx.measureText(s).width;
    }
    const caps = (ctx, s, x, y, color = P.inkDim, align = 'left', size = 9.5) =>
      txt(ctx, s.toUpperCase(), x, y, { font: `${size}px ${SERIF}`, color, align, track: 1.6 });
    const title = (ctx, s, x, y, color = P.ink, align = 'left') =>
      txt(ctx, s, x, y, { font: `italic 13.5px ${SERIF}`, color, align });

    const glow = cv.glowSprite(VG, 48);

    // A station canvas whose height follows its width. The new height is applied one tick
    // later, as the handshake does, so the ResizeObserver never sees its own change
    // within the same frame (no "loop completed with undelivered notifications").
    function stationCanvas(el, heightFor, markDirty) {
      const opts = { height: heightFor(el.getBoundingClientRect().width || 700) };
      const h = cv.setupCanvas(el, opts);
      let tm = 0;
      h.onResize((w) => {
        markDirty();
        if (w <= 60) return;               // a hidden station reports no width: keep its height
        const want = heightFor(w);
        if (want === opts.height) return;
        clearTimeout(tm);
        tm = setTimeout(() => { opts.height = want; h.canvas.style.height = want + 'px'; markDirty(); }, 0);
      });
      const kill = h.destroy.bind(h);
      h.destroy = () => { clearTimeout(tm); kill(); };
      return h;
    }

    /* ==================== I · sixty-four cosines ==================== */
    function buildPic() {
      const el = box.pic;
      const I = { scene: 'horizon', q: 50, seam: 128, grid: false, resid: false, bx: 24, by: 11, wallace: false,
        hover: -1, pick: -1, build: null, events: [], strikes: [], prep: null, enc: null, bd: null, pendingQ: false, dirty: true };
      const cache = {};
      const orig = document.createElement('canvas'), dec = document.createElement('canvas'), atlas = document.createElement('canvas');
      orig.width = dec.width = 256; orig.height = dec.height = 192;
      atlas.width = atlas.height = 64;
      {
        const g = atlas.getContext('2d'), im = g.createImageData(64, 64);
        for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
          const b = basisImage(u, v);
          let m = 0; for (const z of b) m = Math.max(m, Math.abs(z));
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const t = (b[y * 8 + x] / m + 1) / 2, k = ((v * 8 + y) * 64 + u * 8 + x) * 4;
            im.data[k] = 16 + t * 220; im.data[k + 1] = 17 + t * 212; im.data[k + 2] = 24 + t * 186; im.data[k + 3] = 255;
          }
        }
        g.putImageData(im, 0, 0);
      }

      const H = stationCanvas(el, (w) => layout(w).H, () => { I.dirty = true; });
      H.canvas.classList.add('lossy-cv');
      H.canvas.tabIndex = 0;
      H.canvas.setAttribute('aria-label', 'JPEG lightroom: original and decoded halves, and one block under the loupe. Arrow keys move the block; Shift with the left or right arrow moves the seam; the bracket keys step through the block’s weights in file order; Enter builds the block.');

      const row1 = ui.controlRow(el);
      const qSl = ui.slider(row1, { label: 'quality (IJG dial)', min: 1, max: 100, step: 1, value: 50,
        onInput: (v) => { I.q = v; I.pendingQ = true; if (!questState.pic.q && v !== 50) questState.pic.q = true; } });
      ui.select(row1, { label: 'scene', value: 'horizon',
        options: [{ value: 'horizon', label: 'dusk horizon' }, { value: 'chladni', label: 'Chladni sand' }, { value: 'zone', label: 'zone plate' }],
        onChange: (v) => setScene(v) });
      ui.toggle(row1, { label: 'block grid', value: false, onChange: (v) => { I.grid = v; I.dirty = true; } });
      ui.toggle(row1, { label: 'show what was forgotten', value: false, onChange: (v) => { I.resid = v; paintDec(); I.dirty = true; } });
      const row2 = ui.controlRow(el);
      ui.button(row2, '▶ build the block', () => startBuild(), { primary: true });
      ui.button(row2, '♪ strike the block', () => strike());
      const wBtn = ui.button(row2, 'Wallace’s block, 1991', () => {
        I.wallace = !I.wallace; wBtn.classList.toggle('active', I.wallace); stopBuild(); I.bd = null; I.pick = -1; I.dirty = true; info();
      }, { small: true });
      const infoR = ui.readout(el, '');
      infoR.el.classList.add('lossy-info');

      function paintRGB(cnv, rgb) {
        const g = cnv.getContext('2d'), im = g.createImageData(256, 192), d = im.data, grey = rgb.length === 256 * 192;
        for (let i = 0; i < 256 * 192; i++) {
          if (grey) { d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = rgb[i]; }
          else { d[4 * i] = rgb[3 * i]; d[4 * i + 1] = rgb[3 * i + 1]; d[4 * i + 2] = rgb[3 * i + 2]; }
          d[4 * i + 3] = 255;
        }
        g.putImageData(im, 0, 0);
      }
      function paintDec() {
        if (!I.enc) return;
        if (!I.resid) { paintRGB(dec, I.enc.rgb); return; }
        const g = dec.getContext('2d'), im = g.createImageData(256, 192), d = im.data, a = I.enc.rgb, s = I.prep.src, grey = I.prep.grey;
        const pos = [125, 167, 217], neg = [217, 122, 104], base = [13, 14, 20];
        for (let i = 0; i < 256 * 192; i++) {
          const y1 = 0.299 * a[3 * i] + 0.587 * a[3 * i + 1] + 0.114 * a[3 * i + 2];
          const y0 = grey ? s[i] : 0.299 * s[3 * i] + 0.587 * s[3 * i + 1] + 0.114 * s[3 * i + 2];
          const e = y1 - y0, t = Math.min(1, (8 * Math.abs(e)) / 255), c = e >= 0 ? pos : neg;
          d[4 * i] = base[0] + (c[0] - base[0]) * t; d[4 * i + 1] = base[1] + (c[1] - base[1]) * t; d[4 * i + 2] = base[2] + (c[2] - base[2]) * t; d[4 * i + 3] = 255;
        }
        g.putImageData(im, 0, 0);
      }
      function setScene(key) {
        I.scene = key;
        if (!cache[key]) {
          const src = key === 'zone' ? zonePlate(256, 192, 256) : rasterize(256, 192, key === 'horizon' ? horizonAt : chladniAt);
          cache[key] = prepareImage(src, 256, 192, key === 'zone');
        }
        I.prep = cache[key];
        paintRGB(orig, I.prep.src);
        stopBuild();
        recompute();
      }
      function recompute() {
        I.enc = encodeImage(I.prep, I.q);
        I.pendingQ = false;
        paintDec();
        I.bd = null; I.dirty = true;
        info(); checkQuest();
      }

      // ---- the selected block, fully decoded ----
      function blockData() {
        if (I.bd) return I.bd;
        const Q = I.enc.QL;
        let samp, S, prev;
        if (I.wallace) {
          samp = Float64Array.from(WALLACE);
          S = fdct8(samp.map((v) => v - 128));
          prev = 12;
        } else {
          samp = new Float64Array(64);
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) samp[y * 8 + x] = I.prep.Y[(I.by * 8 + y) * 256 + I.bx * 8 + x];
          const b = I.by * 32 + I.bx;
          S = I.prep.yCoef.slice(b * 64, b * 64 + 64);
          prev = b > 0 ? I.enc.ySq[(b - 1) * 64] : 0;
        }
        const Sq = quantize(S, Q), R = dequantize(Sq, Q);
        const decB = idct8(R).map((v) => clamp(Math.round(v + 128), 0, 255));
        const sym = blockSymbols(Sq, prev);
        let eAC = 0, eKept = 0, nz = 0;
        for (let i = 0; i < 64; i++) {
          if (Sq[i]) nz++;
          if (i) { eAC += S[i] * S[i]; if (Sq[i]) eKept += S[i] * S[i]; }
        }
        return (I.bd = { samp, S, Q, Sq, R, dec: decB, prev, bits: blockBits(Sq, prev, HUFF.dcL, HUFF.acL),
          groups: blockBitstring(Sq, prev), last: sym.last, nz, eAC, eKept });
      }

      // ---- layout ----
      function layout(W) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const wide = W >= 820;
        const k = Math.max(1, Math.floor((Math.min(512, wide ? W - 430 : W) * dpr) / 256));
        const s = k / dpr, iw = 256 * s, ih = 192 * s;
        const L = { wide, s, iw, ih, iy: 30 };
        if (wide) {
          L.ix = 0; L.lx = 0; L.lw = iw; L.ly = L.iy + ih + 24;
          const x0 = iw + 40, colW = W - x0;
          const p = Math.min(184, Math.floor((colW - 48) / 2)), gap = Math.min(60, colW - 2 * p);
          const xs = x0 + Math.max(0, (colW - 2 * p - gap) / 2);
          L.p = p; L.px = [xs, xs + p + gap]; L.py = [L.iy, L.iy + p + 44];
          L.ey = L.py[1] + p + 30; L.ex = xs; L.ew = 2 * p + gap;
          L.H = Math.ceil(Math.max(L.ly + 96, L.ey + 76));
        } else {
          L.ix = Math.round((W - iw) / 2); L.lx = 0; L.lw = W; L.ly = L.iy + ih + 22;
          const p = Math.min(184, Math.floor((W - 32) / 2)), gap = Math.min(40, W - 2 * p - 2);
          const xs = Math.max(1, (W - 2 * p - gap) / 2);
          L.p = p; L.px = [xs, xs + p + gap]; L.py = [L.ly + 124, L.ly + 124 + p + 44];
          L.ey = L.py[1] + p + 30; L.ex = xs; L.ew = 2 * p + gap;
          L.H = Math.ceil(L.ey + 74);
        }
        return L;
      }

      // ---- drawing ----
      function draw() {
        const { ctx, width: W, height: Hh } = H;
        const L = layout(W);
        ctx.clearRect(0, 0, W, Hh);
        drawImageArea(ctx, L);
        drawLedger(ctx, L);
        drawLoupe(ctx, L);
      }

      function drawImageArea(ctx, L) {
        const { ix, iy, iw, ih, s } = L;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const sx = I.seam;
        if (sx > 0) ctx.drawImage(orig, 0, 0, sx, 192, ix, iy, sx * s, ih);
        if (sx < 256) ctx.drawImage(dec, sx, 0, 256 - sx, 192, ix + sx * s, iy, (256 - sx) * s, ih);
        ctx.restore();
        if (I.grid) {
          ctx.strokeStyle = 'rgba(10, 11, 16, 0.42)'; ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 8; x < 256; x += 8) { ctx.moveTo(ix + x * s + 0.5, iy); ctx.lineTo(ix + x * s + 0.5, iy + ih); }
          for (let y = 8; y < 192; y += 8) { ctx.moveTo(ix, iy + y * s + 0.5); ctx.lineTo(ix + iw, iy + y * s + 0.5); }
          ctx.stroke();
        }
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.strokeRect(ix - 0.5, iy - 0.5, iw + 1, ih + 1);
        // labels over the two halves
        caps(ctx, 'original', ix, iy - 11, P.inkDim);
        const rl = I.resid ? 'forgotten · ×8' : `jpeg · quality ${I.q}`;
        caps(ctx, rl, ix + iw, iy - 11, I.resid ? CB : P.goldBright, 'right');
        // selected block and its leader lines
        if (!I.wallace) {
          const bs = 8 * s, bx = ix + I.bx * bs, by = iy + I.by * bs;
          if (L.wide) {
            ctx.strokeStyle = 'rgba(201, 169, 89, 0.28)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + bs, by); ctx.lineTo(L.px[0], L.py[0]);
            ctx.moveTo(bx + bs, by + bs); ctx.lineTo(L.px[0], L.py[0] + L.p);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(10, 11, 16, 0.8)'; ctx.lineWidth = 3;
          ctx.strokeRect(bx - 1, by - 1, bs + 2, bs + 2);
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.25;
          ctx.strokeRect(bx - 1, by - 1, bs + 2, bs + 2);
        }
        // the seam
        const X = ix + sx * s;
        ctx.strokeStyle = 'rgba(10, 11, 16, 0.7)'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(X, iy); ctx.lineTo(X, iy + ih); ctx.stroke();
        ctx.strokeStyle = P.gold; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(X, iy - 4); ctx.lineTo(X, iy + ih + 4); ctx.stroke();
        const my = iy + ih / 2;
        ctx.fillStyle = P.gold; ctx.strokeStyle = P.bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X, my - 9); ctx.lineTo(X + 7, my); ctx.lineTo(X, my + 9); ctx.lineTo(X - 7, my); ctx.closePath();
        ctx.stroke(); ctx.fill();
        ctx.fillStyle = P.bg;
        ctx.beginPath(); ctx.arc(X, my, 1.8, 0, Math.PI * 2); ctx.fill();
      }

      function drawLedger(ctx, L) {
        const e = I.enc, x = L.lx, w = L.lw, y = L.ly;
        const lab = 38, vw = L.wide ? 150 : 118, bx = x + lab, bw = Math.max(40, w - lab - vw - 10);
        caps(ctx, 'raw', x, y + 7, P.inkFaint);
        ctx.fillStyle = P.line; ctx.fillRect(bx, y, bw, 7);
        txt(ctx, `${fmt(e.rawBytes)} bytes`, bx + bw + 10, y + 7, { color: P.inkDim, font: `11px ${MONO}` });
        const fw = Math.max(1.5, (bw * e.scanBytes) / e.rawBytes);
        caps(ctx, 'jpeg', x, y + 27, P.gold);
        ctx.fillStyle = P.line; ctx.globalAlpha = 0.35; ctx.fillRect(bx, y + 20, bw, 7); ctx.globalAlpha = 1;
        ctx.fillStyle = fw > bw ? CB : P.gold; ctx.fillRect(bx, y + 20, Math.min(fw, bw), 7);
        if (fw > bw) { ctx.fillStyle = CB; ctx.fillRect(bx + bw, y + 18, 2, 11); }
        txt(ctx, `${fmt(e.scanBytes)} bytes`, bx + bw + 10, y + 27, { color: fw > bw ? CB : P.goldBright, font: `11px ${MONO}` });
        // three figures, set like a placard
        const share = keptShare(e.nzY, e.totalY), cw = w / 3, fy = y + 64;
        const big = L.wide ? 23 : 18;
        const figs = [
          [e.ratio >= 1 ? `${e.ratio.toFixed(1)} : 1` : `${e.ratio.toFixed(2)} : 1`, e.ratio >= 1 ? P.goldBright : CB, L.wide ? (e.ratio >= 1 ? 'smaller than raw' : 'larger than raw') : (e.ratio >= 1 ? 'smaller' : 'larger')],
          [fmt(e.nzY), P.gold, L.wide ? `of ${fmt(e.totalY)} weights · ${share}` : `${share} kept`],
          [`${isFinite(e.psnr) ? e.psnr.toFixed(1) : '∞'} dB`, P.azure, 'psnr'],
        ];
        figs.forEach(([v, col, cap], j) => {
          const fx = x + j * cw;
          if (j) { ctx.fillStyle = P.line; ctx.fillRect(fx - 10, fy - big + 2, 1, big + 16); }
          txt(ctx, v, fx, fy, { font: `${big}px ${SERIF}`, color: col });
          caps(ctx, cap, fx, fy + 16, P.inkDim, 'left', 8.5);
        });
      }

      function drawPixels(ctx, x, y, p, vals, nums) {
        const c = p / 8;
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
          const v = clamp(vals[j * 8 + i], 0, 255), g = Math.round(v);
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(x + i * c, y + j * c, c + 0.5, c + 0.5);
          if (nums && c >= 17) {
            txt(ctx, String(Math.round(v)), x + i * c + c / 2, y + j * c + c / 2 + 0.5,
              { font: `${c >= 21 ? 8.5 : 7.5}px ${MONO}`, color: g > 128 ? 'rgba(10,11,16,0.55)' : 'rgba(232,226,208,0.45)', align: 'center', base: 'middle' });
          }
        }
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - 0.5, p + 1, p + 1);
      }

      function advanceBuild() {
        if (!I.build) return;
        const t = nowA();
        while (I.events.length && I.events[0].at <= t) {
          const ev = I.events.shift();
          if (ev.done) {
            I.build = null; I.events = []; sched = null;
            if (!questState.pic.built) { questState.pic.built = true; checkQuest(); }
            return;
          }
          I.build.k = ev.k;
          if (ev.end) I.build.end = true;
        }
      }
      function buildState(bd) {
        // how far the build has gone, read from the audio clock
        if (!I.build) return null;
        const partial = new Float64Array(64);
        for (let k = 0; k <= Math.min(I.build.k, 63); k++) { const i = ZZ[k]; partial[i] = bd.R[i]; }
        return { k: I.build.k, end: I.build.end, img: idct8(partial).map((v) => v + 128) };
      }

      function drawLoupe(ctx, L) {
        const bd = blockData(), p = L.p, c = p / 8, [x0, x1] = L.px, [y0, y1] = L.py;
        const B = buildState(bd);
        const kShow = B ? B.k : 63;
        const t = nowA();
        // titles
        title(ctx, I.wallace ? 'Wallace’s block' : 'the block', x0, y0 - 10);
        txt(ctx, I.wallace ? 'fig. 10 · 1991' : `luma · ${I.bx},${I.by}`, x0 + p, y0 - 10, { color: P.inkFaint, align: 'right', font: `10px ${MONO}` });
        const roomy = p >= 170;
        title(ctx, roomy ? 'its sixty-four weights' : 'its weights', x1, y0 - 10);
        txt(ctx, `${bd.nz} stored`, x1 + p, y0 - 10, { color: P.inkFaint, align: 'right', font: `10px ${MONO}` });
        const building = B && !B.end;
        title(ctx, building ? `${Math.min(B.k, bd.last) + 1} of 64 cosines` : roomy ? 'what the file keeps' : 'what is kept', x0, y1 - 10, building ? VG : P.ink);
        txt(ctx, building ? '' : `${bd.bits} bits`, x0 + p, y1 - 10, { color: P.inkFaint, align: 'right', font: `10px ${MONO}` });
        title(ctx, roomy ? 'the sixty-four cosines' : 'the cosines', x1, y1 - 10);
        // arrows
        const ax0 = x0 + p + 8, ax1 = x1 - 8;
        if (ax1 - ax0 > 18) {
          ctx.strokeStyle = P.inkFaint; ctx.fillStyle = P.inkFaint; ctx.lineWidth = 1;
          const ay = y0 + p / 2, by2 = y1 + p / 2;
          ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax1, ay); ctx.lineTo(ax1 - 5, ay - 3); ctx.lineTo(ax1 - 5, ay + 3); ctx.fill();
          ctx.beginPath(); ctx.moveTo(ax1, by2); ctx.lineTo(ax0, by2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax0, by2); ctx.lineTo(ax0 + 5, by2 - 3); ctx.lineTo(ax0 + 5, by2 + 3); ctx.fill();
          caps(ctx, 'dct', (ax0 + ax1) / 2, ay - 7, P.inkFaint, 'center', 8.5);
          caps(ctx, 'idct', (ax0 + ax1) / 2, by2 - 7, P.inkFaint, 'center', 8.5);
          caps(ctx, '÷ q', (ax0 + ax1) / 2, ay + 14, P.inkFaint, 'center', 8.5);
          caps(ctx, '× q', (ax0 + ax1) / 2, by2 + 14, P.inkFaint, 'center', 8.5);
        }
        // pixels in, pixels out
        drawPixels(ctx, x0, y0, p, bd.samp, true);
        drawPixels(ctx, x0, y1, p, B ? B.img : bd.dec, true);
        // weights grid: fills first, then the zig-zag thread, then the stored integers on top
        for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
          const i = v * 8 + u, S = bd.S[i], kept = bd.Sq[i] !== 0, shown = ZZ_INDEX[i] <= kShow;
          const mag = Math.min(1, Math.log1p(Math.abs(S)) / Math.log1p(i ? 320 : 1024));
          const col = i === 0 ? [201, 169, 89] : S >= 0 ? [125, 167, 217] : [192, 91, 77];
          const a = !shown ? 0.04 : kept ? 0.3 + 0.62 * mag : 0.04 + 0.16 * mag;
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
          ctx.fillRect(x1 + u * c + 1, y0 + v * c + 1, c - 2, c - 2);
        }
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(x1 - 0.5, y0 - 0.5, p + 1, p + 1);
        const cc = (k) => { const i = ZZ[k]; return [x1 + (i & 7) * c + c / 2, y0 + (i >> 3) * c + c / 2]; };
        const lastK = bd.last;
        const headK = B ? Math.min(B.k, lastK) : lastK;
        if (lastK < 63) {
          ctx.strokeStyle = 'rgba(169, 164, 147, 0.2)'; ctx.setLineDash([1.5, 3]); ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = lastK; k < 64; k++) { const [px, py] = cc(k); k === lastK ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
          ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (headK >= 0) {
          ctx.strokeStyle = 'rgba(10, 11, 16, 0.55)'; ctx.lineWidth = 3.4;
          ctx.beginPath();
          for (let k = 0; k <= headK; k++) { const [px, py] = cc(k); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
          ctx.strokeStyle = P.gold; ctx.lineWidth = 1.5;
          ctx.stroke();
          const [px, py] = cc(headK);
          if (B && !B.end) { glow.draw(ctx, px, py, 0.7); ctx.fillStyle = VG; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
          else { // end of block: the thread stops with a bar
            const [qx, qy] = headK < 63 ? cc(headK + 1) : [px + 1, py];
            const dx = qx - px, dy = qy - py, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
            const ex = px + (dx / dl) * c * 0.45, ey = py + (dy / dl) * c * 0.45;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey);
            ctx.moveTo(ex + nx * 4.5, ey + ny * 4.5); ctx.lineTo(ex - nx * 4.5, ey - ny * 4.5); ctx.stroke();
          }
        }
        if (c >= 15) {
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
          for (let i = 0; i < 64; i++) {
            if (!bd.Sq[i] || ZZ_INDEX[i] > kShow) continue;
            const str = num(bd.Sq[i]), fs = (c / 23) * [10, 10, 10, 9, 7.6, 6.4][Math.min(5, str.length)];
            ctx.font = `${fs.toFixed(1)}px ${MONO}`;
            const X = x1 + (i & 7) * c + c / 2, Y = y0 + (i >> 3) * c + c / 2 + 0.5;
            ctx.strokeStyle = 'rgba(10, 11, 16, 0.85)'; ctx.lineWidth = 3; ctx.strokeText(str, X, Y);
            ctx.fillStyle = P.ink; ctx.fillText(str, X, Y);
          }
        }
        for (const i of [I.hover, I.pick]) {
          if (i < 0) continue;
          ctx.strokeStyle = VG; ctx.lineWidth = 1.5;
          ctx.strokeRect(x1 + (i & 7) * c + 1, y0 + (i >> 3) * c + 1, c - 2, c - 2);
        }
        // the atlas of basis patterns, aligned cell for cell with the weights above it
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const dpr = H.dpr || 1;
        let ts = Math.floor(((c - 3) * dpr) / 8) * 8 / dpr;
        if (ts < 0.8 * (c - 3)) ts = c - 3;   // too small to keep whole device pixels per sample
        const pad = Math.round(((c - ts) / 2) * dpr) / dpr;
        for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
          const i = v * 8 + u, kept = bd.Sq[i] !== 0, zz = ZZ_INDEX[i], shown = zz <= kShow;
          const tx = Math.round((x1 + u * c) * dpr) / dpr + pad, ty = Math.round((y1 + v * c) * dpr) / dpr + pad;
          ctx.globalAlpha = kept && shown ? 1 : shown ? 0.2 : 0.1;
          ctx.drawImage(atlas, u * 8, v * 8, 8, 8, tx, ty, ts, ts);
          ctx.globalAlpha = 1;
          if (kept && shown) { ctx.strokeStyle = P.gold; ctx.lineWidth = 1; ctx.strokeRect(tx - 0.5, ty - 0.5, ts + 1, ts + 1); }
          if (B && zz === B.k && !B.end) { ctx.strokeStyle = VG; ctx.lineWidth = 2; ctx.strokeRect(tx - 1, ty - 1, ts + 2, ts + 2); }
          if (i === I.hover || i === I.pick) { ctx.strokeStyle = VG; ctx.lineWidth = 1.5; ctx.strokeRect(tx - 1, ty - 1, ts + 2, ts + 2); }
        }
        ctx.restore();
        // struck modes glow and fade on their own decay times
        if (I.strikes.length) {
          I.strikes = I.strikes.filter((st) => t < st.t0 + st.tau * 5);
          for (const st of I.strikes) {
            const a = t < st.t0 ? 0 : Math.exp(-(t - st.t0) / st.tau) * st.a;
            if (a < 0.02) continue;
            ctx.globalAlpha = Math.min(1, a);
            glow.draw(ctx, x1 + (st.i & 7) * c + c / 2, y1 + (st.i >> 3) * c + c / 2, (c / 48) * 2.6);
            ctx.globalAlpha = 1;
          }
        }
        // Parseval: the detail energy, weight by weight in file order
        const ex = L.ex, ew = L.ew, ey = L.ey;
        const eAC = bd.eAC || 1;
        let acc = 0;
        ctx.fillStyle = P.line; ctx.globalAlpha = 0.45; ctx.fillRect(ex, ey, ew, 8); ctx.globalAlpha = 1;
        for (let k = 1; k < 64; k++) {
          const i = ZZ[k], e = (bd.S[i] * bd.S[i]) / eAC, w = e * ew;
          const vis = !B || B.end || k <= B.k;
          if (vis && w > 0.05) {
            ctx.fillStyle = bd.Sq[i] ? P.gold : P.crimson;
            ctx.fillRect(ex + acc, ey, Math.max(0.6, w - (w > 3 ? 0.8 : 0)), 8);
          }
          acc += w;
        }
        const kept = bd.eAC ? (100 * bd.eKept) / bd.eAC : 100;
        caps(ctx, 'detail energy, by parseval', ex, ey - 8, P.inkFaint);
        txt(ctx, bd.eAC ? `kept ${kept.toFixed(1)}%` : 'a flat block', ex + ew, ey - 8, { color: P.goldBright, align: 'right', font: `10.5px ${MONO}` });
        // the block's actual bits, grouped by symbol
        const f = `10.5px ${MONO}`;
        ctx.font = f;
        let lx = ex, ly = ey + 30, lines = 1;
        const put = (s1, color) => {
          const w = ctx.measureText(s1).width;
          if (lx + w > ex + ew) { lines++; lx = ex; ly += 15; }
          if (lines > 3) return false;
          txt(ctx, s1, lx, ly, { font: f, color });
          lx += w;
          return true;
        };
        put(`${bd.bits} bits  `, P.ink);
        for (const g of bd.groups) {
          if (!put(g.code, P.gold)) { txt(ctx, '…', ex + ew, ly - 15, { font: f, color: P.inkDim, align: 'right' }); break; }
          if (g.extra && !put(g.extra, P.inkDim)) break;
          if (!put(' ', P.inkDim)) break;
        }
      }

      // ---- info line ----
      function info() {
        if (!I.enc) return;
        const bd = blockData();
        const i = I.hover >= 0 ? I.hover : I.pick;
        if (i >= 0) {
          const u = i & 7, v = i >> 3, S = bd.S[i], Q = bd.Q[i], r = S / Q, q = bd.Sq[i];
          const f = membraneFreq(u, v);
          infoR.setHTML(`(u, v) = (${u}, ${v})   weight S = ${num(S, 2)}   ÷ Q = ${Q}   = ${num(r, 3)}   → ` +
            (q ? `<b>${num(q)}</b>, stored` : `<s>0</s>, forgotten`) +
            (i ? `   ·   membrane mode ${f.toFixed(1)} Hz${q ? '' : ', silent'}` : '   ·   the average brightness, the one mode that never vibrates'));
          return;
        }
        if (I.wallace) {
          const S = bd.S[24], Q = bd.Q[24];
          infoR.setHTML(`Gregory Wallace’s worked example, Fig. 10.   S(3,0) = ${num(S, 3)}, ÷ ${Q} = ${num(S / Q, 4)} → <b>${num(bd.Sq[24])}</b>.` +
            (I.q === 50 ? `\nHis printed Fig. 10(d) rounds it to 0, and his symbols code the block in 31 bits; rounding to nearest keeps it, and the block costs <b>${bd.bits}</b>.` : ''));
          return;
        }
        infoR.setHTML(`block (${I.bx}, ${I.by}) of 32 × 24   ·   <b>${bd.nz}</b> of 64 weights stored   ·   <b>${bd.bits}</b> bits   ·   ` +
          (bd.eAC ? `detail energy forgotten <s>${(100 - (100 * bd.eKept) / bd.eAC).toFixed(1)}%</s>` : 'a flat block: one number') +
          `\nTap a weight or a cosine to read its fate; drag on the picture to move the loupe.`);
      }

      // ---- quest ----
      function checkQuest() {
        const qs = questState.pic;
        if (qs.done) { if (station === 'pic') quest.done(picDoneText()); return; }
        let step = 0;
        if (qs.seam) step = 1;
        if (qs.seam && qs.q && qs.picked) step = 2;
        if (step === 2 && qs.built) { qs.done = true; }
        qs.step = step;
        if (station === 'pic') setQuest();
      }

      // ---- build and strike (sound derived from the same weights) ----
      let sched = null;
      function stopBuild() {
        if (sched) { sched.stop(); sched = null; }
        I.build = null; I.events = []; I.dirty = true;
      }
      function startBuild() {
        audio.ensureAudio();
        stopBuild();
        const bd = blockData();
        let maxA = 0;
        for (let i = 1; i < 64; i++) maxA = Math.max(maxA, Math.abs(bd.R[i]));
        I.build = { k: -1, end: false };
        let k = 0;
        sched = audio.createScheduler((t) => {
          if (k > bd.last) {
            I.events.push({ k: bd.last, at: t, end: true });
            I.events.push({ k: bd.last, at: t + 1.6, done: true });
            return null;
          }
          const i = ZZ[k];
          I.events.push({ k, at: t });
          const kept = bd.Sq[i] !== 0;
          if (kept && i) {
            const f = membraneFreq(i & 7, i >> 3), T = Math.min(1.8, 1.4 * (110 / f) + 0.25);
            audio.playTone(bus, { freq: f, when: t, dur: T, release: T, attack: 0.004, level: 0.07 + 0.25 * (Math.abs(bd.R[i]) / (maxA || 1)) });
          } else if (kept) {
            audio.drums.wood(bus, t, { level: 0.12, pitch: 330 });
          }
          k++;
          return t + (kept ? 0.2 : 0.06);
        });
        sched.start(0.06);
      }
      function strike() {
        const c = audio.ensureAudio();
        stopBuild();
        const bd = blockData();
        const parts = [];
        for (let i = 1; i < 64; i++) if (bd.Sq[i]) parts.push({ i, a: Math.abs(bd.R[i]), f: membraneFreq(i & 7, i >> 3) });
        parts.sort((a, b) => b.a - a.a);
        const use = parts, sum = use.reduce((s1, p) => s1 + p.a, 0) || 1, maxA = use.length ? use[0].a : 1;
        const t0 = c.currentTime + 0.03;
        I.strikes = [];
        for (const p of use) {
          const T = Math.min(2.4, 1.9 * (110 / p.f) + 0.2);
          audio.playTone(bus, { freq: p.f, when: t0, dur: T, release: T, attack: 0.003, level: Math.max(0.006, (0.5 * p.a) / sum) });
          I.strikes.push({ i: p.i, t0, tau: T / 4, a: 0.35 + 0.65 * (p.a / maxA) });
        }
        if (!use.length) infoR.setHTML('Only the average brightness survives in this block, and the average is the one mode that does not vibrate: <s>silence</s>.');
      }

      // ---- pointer and keyboard ----
      const cnv = H.canvas;
      cnv.style.touchAction = 'pan-y';
      let drag = null;
      function hit(e) {
        const [mx, my] = cv.pointerPos(H, e), L = layout(H.width);
        const inImg = mx >= L.ix && mx < L.ix + L.iw && my >= L.iy - 8 && my < L.iy + L.ih + 8;
        const seamX = L.ix + I.seam * L.s;
        if (inImg && Math.abs(mx - seamX) < 12) return { kind: 'seam', L };
        if (inImg && my >= L.iy && my < L.iy + L.ih) return { kind: 'img', L, bx: Math.floor((mx - L.ix) / (8 * L.s)), by: Math.floor((my - L.iy) / (8 * L.s)) };
        const c = L.p / 8;
        for (const [px, py] of [[L.px[1], L.py[0]], [L.px[1], L.py[1]]]) {
          if (mx >= px && mx < px + L.p && my >= py && my < py + L.p) return { kind: 'coef', i: Math.floor((my - py) / c) * 8 + Math.floor((mx - px) / c) };
        }
        return { kind: 'none', L };
      }
      function moveSeam(e, L) {
        const [mx] = cv.pointerPos(H, e);
        I.seam = clamp(Math.round((mx - L.ix) / L.s), 0, 256);
        if (!questState.pic.seam && I.seam !== 128) { questState.pic.seam = true; checkQuest(); }
        I.dirty = true;
      }
      function selectBlock(bx, by) {
        bx = clamp(bx, 0, 31); by = clamp(by, 0, 23);
        if (bx === I.bx && by === I.by && !I.wallace) return;
        I.bx = bx; I.by = by;
        if (I.wallace) { I.wallace = false; wBtn.classList.remove('active'); }
        stopBuild(); I.bd = null; I.pick = -1; I.dirty = true;
        if (!questState.pic.picked) { questState.pic.picked = true; checkQuest(); }
        info();
      }
      cnv.addEventListener('pointerdown', (e) => {
        const h = hit(e);
        if (h.kind === 'seam') { drag = 'seam'; cnv.setPointerCapture(e.pointerId); moveSeam(e, h.L); e.preventDefault(); }
        else if (h.kind === 'img') { drag = 'img'; cnv.setPointerCapture(e.pointerId); selectBlock(h.bx, h.by); e.preventDefault(); }
        else if (h.kind === 'coef') pickCoef(I.pick === h.i ? -1 : h.i);
      });
      // read one weight's fate, and sound its mode if the file keeps it
      function pickCoef(i) {
        I.pick = i; I.dirty = true; info();
        const bd = blockData();
        if (I.pick >= 1 && bd.Sq[I.pick]) {
          audio.ensureAudio();
          const f = membraneFreq(I.pick & 7, I.pick >> 3), T = Math.min(2, 1.9 * (110 / f) + 0.2);
          audio.playTone(bus, { freq: f, dur: T, release: T, attack: 0.003, level: 0.3 });
          I.strikes = [{ i: I.pick, t0: nowA(), tau: T / 4, a: 1 }];
        }
      }
      cnv.addEventListener('pointermove', (e) => {
        if (drag) {
          const L = layout(H.width);
          if (drag === 'seam') moveSeam(e, L);
          else { const [mx, my] = cv.pointerPos(H, e); selectBlock(Math.floor((mx - L.ix) / (8 * L.s)), Math.floor((my - L.iy) / (8 * L.s))); }
          return;
        }
        const h = hit(e);
        cnv.style.cursor = h.kind === 'seam' ? 'ew-resize' : h.kind === 'img' ? 'crosshair' : h.kind === 'coef' ? 'pointer' : 'default';
        const nh = h.kind === 'coef' ? h.i : -1;
        if (nh !== I.hover) { I.hover = nh; I.dirty = true; info(); }
      });
      const endDrag = (e) => { drag = null; try { cnv.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ } };
      cnv.addEventListener('pointerup', endDrag);
      cnv.addEventListener('pointercancel', endDrag);
      cnv.addEventListener('pointerleave', () => { if (I.hover !== -1) { I.hover = -1; I.dirty = true; info(); } });
      cnv.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (d && e.shiftKey && d[0]) {
          e.preventDefault();
          I.seam = clamp(I.seam + 8 * d[0], 0, 256); I.dirty = true;
          if (!questState.pic.seam && I.seam !== 128) { questState.pic.seam = true; checkQuest(); }
        } else if (d) { e.preventDefault(); selectBlock(I.bx + d[0], I.by + d[1]); }
        else if (e.key === '[' || e.key === ']') {
          e.preventDefault();
          const k = I.pick >= 0 ? ZZ_INDEX[I.pick] : e.key === ']' ? -1 : 64;
          pickCoef(ZZ[clamp(k + (e.key === ']' ? 1 : -1), 0, 63)]);
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startBuild(); }
      });

      setScene('horizon');
      return {
        I,
        show() { I.dirty = true; },
        frame() {
          if (I.pendingQ) recompute();
          if (I.build) { advanceBuild(); I.dirty = true; }
          if (I.strikes.length) I.dirty = true;
          if (I.dirty) { I.dirty = false; draw(); }
        },
        stop() { stopBuild(); I.strikes = []; },
        destroy() { stopBuild(); H.destroy(); },
        api: { setScene, startBuild, strike, selectBlock, recompute, setQ: (q) => { qSl.set(q); I.q = q; questState.pic.q = q !== 50 || questState.pic.q; recompute(); } },
      };
    }
    function picDoneText() {
      const s = stations.pic;
      if (!s) return '';
      const e = s.I.enc;
      const sh = keptShare(e.nzY, e.totalY);
      return `Built. At quality ${s.I.q} this picture keeps ${fmt(e.nzY)} of ${fmt(e.totalY)} brightness weights, ${sh.startsWith('1 in') ? 'one in ' + sh.slice(5) : sh}; ` +
        `the rest were never written down. Move the dial and the count follows.`;
    }

    /* ==================== II · the ear ==================== */
    function buildEar() {
      const el = box.ear;
      const E = { clip: 'castanets', long: true, step: 0.02, clips: {}, res: null, mos: document.createElement('canvas'), dirty: true,
        pending: true, play: null, sources: new Set(), ghostK: 1 };
      const H = stationCanvas(el, (w) => layout(w).H, () => { E.dirty = true; });
      H.canvas.classList.add('lossy-cv');
      H.canvas.setAttribute('role', 'img');
      H.canvas.setAttribute('aria-label', 'MDCT coefficients over time as a mosaic, the waveform with its coding error, and one frame alone showing aliasing cancelled by its neighbour.');
      const row1 = ui.controlRow(el);
      ui.select(row1, { label: 'sound', value: 'castanets',
        options: [{ value: 'glass', label: 'glass: three partials' }, { value: 'castanets', label: 'castanets: three clicks' }, { value: 'rain', label: 'rain: white noise' }],
        onChange: (v) => { E.clip = v; E.pending = true; stopSounds(); } });
      const winT = ui.select(row1, { label: 'window', value: 'long',
        options: [{ value: 'long', label: 'long: 2,048 samples, 92.9 ms' }, { value: 'short', label: 'short: 256 samples, 11.6 ms' }],
        onChange: (v) => { E.long = v === 'long'; E.pending = true; stopSounds(); } });
      ui.slider(row1, { label: 'quantizer step Δ', min: 0, max: 1, step: 0.001, value: Math.log(0.02 / 0.001) / Math.log(200),
        format: (v) => { const d = 0.001 * Math.pow(200, v); return d.toFixed(d < 0.01 ? 4 : 3); },
        onInput: (v) => { E.step = 0.001 * Math.pow(200, v); E.pending = true; } });
      const row2 = ui.controlRow(el);
      ui.button(row2, '▶ original', () => playClip('orig'));
      ui.button(row2, '▶ coded', () => playClip('coded'), { primary: true });
      const ghostBtn = ui.button(row2, '▶ what was thrown away', () => playClip('ghost'));
      ui.button(row2, '■', () => stopSounds(), { small: true }).setAttribute('aria-label', 'stop');
      const infoR = ui.readout(el, '');
      infoR.el.classList.add('lossy-info');

      function layout(W) {
        const wide = W >= 720;
        const L = { wide, mx: 52, my: 26, mw: W - 52 - 8, mh: wide ? 190 : 150 };
        L.wy = L.my + L.mh + 46; L.wh = wide ? 96 : 84;
        if (wide) { L.ww = Math.round((W - L.mx) * 0.6); L.tx = L.mx + L.ww + 36; L.ty = L.wy; L.tw = W - L.tx - 8; L.th = L.wh; L.H = L.wy + L.wh + 40; }
        else { L.ww = W - L.mx - 8; L.tx = L.mx; L.ty = L.wy + L.wh + 50; L.tw = L.ww; L.th = 92; L.H = L.ty + L.th + 34; }
        return L;
      }

      function recompute() {
        E.pending = false;
        if (!E.clips[E.clip]) E.clips[E.clip] = makeClip(E.clip);
        const sig = E.clips[E.clip], N = E.long ? 1024 : 128;
        const r = mdctCodec(sig, N, E.step);
        r.sig = sig;
        r.err = new Float64Array(sig.length);
        let pk = 0, pkS = 0;
        for (let n = 0; n < sig.length; n++) { r.err[n] = sig[n] - r.out[n]; pk = Math.max(pk, Math.abs(r.err[n])); pkS = Math.max(pkS, Math.abs(sig[n])); }
        r.peakErr = pk; r.peak = pkS;
        r.snr = snrDb(sig, r.out);
        r.pre = E.clip === 'castanets' ? ATTACKS.map((a) => { const n0 = Math.round(a * FS); return { n0, span: preEcho(sig, r.out, n0, FS, 1e-3, 4096) }; }) : [];
        E.ghostK = pk > 0 ? Math.max(1, Math.min(256, Math.round(0.35 / pk))) : 1;
        ghostBtn.textContent = `▶ what was thrown away (×${E.ghostK})`;
        E.res = r;
        paintMosaic();
        E.dirty = true;
        const spans = r.pre.map((q) => q.span * 1000);
        const pre = spans.length ? `   ·   pre-echo <s>${Math.min(...spans).toFixed(1)}–${Math.max(...spans).toFixed(1)} ms</s> before the clicks` : '';
        infoR.setHTML(`${E.long ? 'long window: 2,048 samples, 92.9 ms, 1,024 lines' : 'short window: 256 samples, 11.6 ms, 128 lines'}   ·   ` +
          `kept <b>${fmt(r.nz)}</b> of ${fmt(r.total)} coefficients (${((100 * r.nz) / r.total).toFixed(1)}%)   ·   SNR <i>${isFinite(r.snr) ? r.snr.toFixed(1) : '∞'} dB</i>${pre}`);
      }

      // log-frequency rows, 40 Hz to 11,025 Hz, each gathering the MDCT lines whose centres fall inside
      const ROWS = 132;
      const rowMap = {};
      function rows(N) {
        if (rowMap[N]) return rowMap[N];
        const df = FS / (2 * N), out = [];
        for (let r = 0; r < ROWS; r++) {
          const lo = 40 * Math.pow(11025 / 40, r / ROWS), hi = 40 * Math.pow(11025 / 40, (r + 1) / ROWS);
          let k0 = Math.ceil(lo / df - 0.5), k1 = Math.floor(hi / df - 0.5);
          if (k1 < k0) { k0 = k1 = clamp(Math.round(Math.sqrt(lo * hi) / df - 0.5), 0, N - 1); }
          out.push([clamp(k0, 0, N - 1), clamp(k1, 0, N - 1)]);
        }
        return (rowMap[N] = out);
      }
      const RAMP = [[40, 30, 14], [122, 98, 46], [201, 169, 89], [232, 200, 124], [246, 236, 208]];
      function ramp(t) {
        const x = clamp(t, 0, 1) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
        return [0, 1, 2].map((j) => RAMP[i][j] + (RAMP[i + 1][j] - RAMP[i][j]) * f);
      }
      function paintMosaic() {
        const r = E.res, F = r.frames, N = r.N, rm = rows(N);
        E.mos.width = F; E.mos.height = ROWS;
        const g = E.mos.getContext('2d'), im = g.createImageData(F, ROWS), d = im.data;
        for (let f = 0; f < F; f++) for (let rr = 0; rr < ROWS; rr++) {
          const [k0, k1] = rm[rr];
          let m = 0;
          for (let k = k0; k <= k1; k++) m = Math.max(m, Math.abs(r.coefs[f * N + k]));
          const j = ((ROWS - 1 - rr) * F + f) * 4;
          if (m === 0) { d[j] = 5; d[j + 1] = 5; d[j + 2] = 8; }
          else { const c = ramp((20 * Math.log10(m) + 62) / 58); d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; }
          d[j + 3] = 255;
        }
        g.putImageData(im, 0, 0);
      }

      // one frame alone: N = 16, an uneven bump across three hops
      const TD = (() => {
        const N = 16, x = Float64Array.from({ length: 48 }, (_, n) => Math.sin((Math.PI * n) / 47) ** 2 * (0.35 + 0.65 * (n / 47)));
        const a = mdctFrame(x.subarray(0, 32), N), b = mdctFrame(x.subarray(16, 48), N);
        return { N, x, a, b };
      })();

      function draw() {
        const { ctx, width: W, height: Hh } = H;
        const L = layout(W), r = E.res;
        ctx.clearRect(0, 0, W, Hh);
        const t = nowA();
        const ph = E.play && t >= E.play.t0 ? (t - E.play.t0) / E.play.dur : -1;
        // mosaic
        title(ctx, L.wide ? 'the coded coefficients, frame by frame' : 'the coded coefficients', L.mx, L.my - 10);
        txt(ctx, L.wide ? `${r.frames} frames × ${fmt(r.N)} lines` : `${r.frames} × ${fmt(r.N)}`, L.mx + L.mw, L.my - 10, { color: P.inkFaint, align: 'right', font: `10px ${MONO}` });
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(E.mos, L.mx, L.my, L.mw, L.mh);
        ctx.restore();
        const cw = L.mw / r.frames;
        if (cw >= 5) {
          ctx.fillStyle = 'rgba(10, 11, 16, 0.85)';
          for (let f = 1; f < r.frames; f++) ctx.fillRect(Math.round(L.mx + f * cw) - 0.5, L.my, 1, L.mh);
        }
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(L.mx - 0.5, L.my - 0.5, L.mw + 1, L.mh + 1);
        for (const [f, lab] of [[100, '100 Hz'], [1000, '1 kHz'], [10000, '10 kHz']]) {
          const yy = L.my + L.mh * (1 - Math.log(f / 40) / Math.log(11025 / 40));
          ctx.fillStyle = P.inkFaint; ctx.fillRect(L.mx - 5, yy, 4, 1);
          txt(ctx, lab, L.mx - 8, yy + 3.5, { align: 'right', font: `9.5px ${MONO}`, color: P.inkFaint });
        }
        const tx = (sec) => L.mx + (sec / 2.4) * L.mw;
        for (let s1 = 0; s1 <= 2; s1 += 0.5) txt(ctx, `${s1.toFixed(1)} s`, tx(s1), L.my + L.mh + 14, { align: s1 === 0 ? 'left' : 'center', font: `10px ${MONO}`, color: P.inkFaint });
        // waveform with its error
        const wy = L.wy, wh = L.wh, mid = wy + wh / 2, amp = wh / 2 / Math.max(0.3, r.peak), ww = L.ww;
        title(ctx, 'the wave, and the error ×' + E.ghostK, L.mx, wy - 10);
        if (r.pre.length) txt(ctx, L.wide ? 'shaded: the pre-echo before each click' : 'pre-echo shaded', L.mx + ww, wy - 10, { color: CB, align: 'right', font: `10px ${MONO}` });
        ctx.fillStyle = 'rgba(10, 11, 16, 0.6)'; ctx.fillRect(L.mx, wy, ww, wh);
        for (const pe of r.pre) {
          if (pe.span <= 0) continue;
          const x0 = L.mx + ((pe.n0 - pe.span * FS) / r.sig.length) * ww, x1 = L.mx + (pe.n0 / r.sig.length) * ww;
          ctx.fillStyle = 'rgba(192, 91, 77, 0.26)'; ctx.fillRect(x0, wy, Math.max(1.5, x1 - x0), wh);
          ctx.fillStyle = 'rgba(217, 122, 104, 0.85)'; ctx.fillRect(L.mx + ((pe.n0 - pe.span * FS) / r.sig.length) * L.mw, L.my + L.mh - 3, Math.max(1.5, ((pe.span * FS) / r.sig.length) * L.mw), 3);
        }
        const per = r.sig.length / ww;
        const band = (arr, k, color) => {
          ctx.fillStyle = color;
          for (let px = 0; px < ww; px++) {
            let lo = 0, hi = 0;
            for (let n = Math.floor(px * per); n < Math.min(arr.length, Math.floor((px + 1) * per)); n++) { const v = arr[n] * k; if (v < lo) lo = v; if (v > hi) hi = v; }
            const y0 = mid - clamp(hi, -2, 2) * amp, y1 = mid - clamp(lo, -2, 2) * amp;
            ctx.fillRect(L.mx + px, Math.max(wy, y0), 1, Math.max(0.8, Math.min(wy + wh, y1) - Math.max(wy, y0)));
          }
        };
        band(r.sig, 1, 'rgba(169, 164, 147, 0.32)');
        band(r.err, E.ghostK, 'rgba(217, 122, 104, 0.9)');
        ctx.strokeStyle = P.line; ctx.strokeRect(L.mx - 0.5, wy - 0.5, ww + 1, wh + 1);
        r.pre.forEach((pe) => {
          if (pe.span <= 0) return;
          const x1 = L.mx + (pe.n0 / r.sig.length) * ww;
          txt(ctx, `${(pe.span * 1000).toFixed(1)} ms`, x1 + 6, wy + 13, { color: CB, font: `10px ${MONO}` });
        });
        // playhead from the audio clock
        if (ph >= 0 && ph <= 1) {
          ctx.strokeStyle = VG; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(L.mx + ph * L.mw, L.my); ctx.lineTo(L.mx + ph * L.mw, L.my + L.mh); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(L.mx + ph * ww, wy); ctx.lineTo(L.mx + ph * ww, wy + wh); ctx.stroke();
        }
        // one frame alone
        drawTDAC(ctx, L);
      }

      function drawTDAC(ctx, L) {
        const { tx, ty, tw, th } = L, n = 48, sx = (i) => tx + (i / (n - 1)) * tw, mid = ty + th * 0.62, k = th * 0.62;
        title(ctx, 'one frame alone', tx, ty - 10);
        ctx.fillStyle = 'rgba(10, 11, 16, 0.6)'; ctx.fillRect(tx, ty, tw, th);
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(tx - 0.5, ty - 0.5, tw + 1, th + 1);
        ctx.fillStyle = 'rgba(98, 179, 164, 0.08)'; ctx.fillRect(sx(16), ty, sx(31) - sx(16), th);
        ctx.strokeStyle = 'rgba(42, 46, 63, 0.9)'; ctx.beginPath(); ctx.moveTo(tx, mid); ctx.lineTo(tx + tw, mid); ctx.stroke();
        const line = (arr, off, from, to, color, w, dash) => {
          ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []);
          ctx.beginPath();
          for (let i = from; i < to; i++) { const X = sx(i + off), Y = mid - arr[i] * k; i === from ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
          ctx.stroke(); ctx.setLineDash([]);
        };
        line(TD.x, 0, 0, 48, 'rgba(232, 226, 208, 0.55)', 1, [2, 3]);
        line(TD.a, 0, 0, 32, P.crimson, 1.3);
        line(TD.b, 16, 0, 32, P.azure, 1.3);
        const sum = Float64Array.from({ length: 16 }, (_, i) => TD.a[16 + i] + TD.b[i]);
        line(sum, 16, 0, 16, P.goldBright, 2.2);
        const ly = ty + th + 15;
        let x = tx;
        x += txt(ctx, 'frame A', x, ly, { color: P.crimson, font: `10px ${MONO}` }) + 10;
        x += txt(ctx, 'frame B', x, ly, { color: P.azure, font: `10px ${MONO}` }) + 10;
        txt(ctx, 'A + B = the signal', x, ly, { color: P.goldBright, font: `10px ${MONO}` });
      }

      // ---- playback: AudioBuffers from the very arrays drawn above ----
      function playClip(kind) {
        const c = audio.ensureAudio();
        stopSounds();
        if (E.pending) recompute();
        const r = E.res, src = kind === 'orig' ? r.sig : kind === 'coded' ? r.out : r.err;
        const k = kind === 'ghost' ? E.ghostK : 1, gainLv = Math.min(1, 0.5 / Math.max(0.05, r.peak));
        const buf = c.createBuffer(1, src.length, FS), d = buf.getChannelData(0);
        for (let n = 0; n < src.length; n++) d[n] = clamp(src[n] * k * gainLv, -1, 1);
        const node = c.createBufferSource(), g = c.createGain();
        node.buffer = buf; node.connect(g); g.connect(bus.input);
        const t0 = c.currentTime + 0.05, dur = src.length / FS;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + 0.01);
        g.gain.setValueAtTime(1, t0 + dur - 0.03); g.gain.linearRampToValueAtTime(0, t0 + dur);
        node.start(t0);
        const rec = { node, g };
        E.sources.add(rec);
        node.onended = () => { E.sources.delete(rec); try { node.disconnect(); g.disconnect(); } catch (_) { /* already gone */ } };
        E.play = { t0, dur: src.length / FS, kind };
        if (kind === 'coded' && E.clip === 'castanets') {
          const qs = questState.ear;
          if (E.long) qs.long = true; else qs.short = true;
          if (qs.long && qs.short && !qs.done) {
            const sig = E.clips.castanets, a = mdctCodec(sig, 1024, E.step), b = mdctCodec(sig, 128, E.step);
            const span = (o) => { const v = ATTACKS.map((t) => preEcho(sig, o.out, Math.round(t * FS), FS) * 1000); return `${Math.min(...v).toFixed(0)} to ${Math.max(...v).toFixed(0)} ms`; };
            qs.done = true;
            qs.text = `Heard. With the long window the noise runs ahead of the clicks by ${span(a)}; with the short one by ${span(b)}. ` +
              'That is why MP3 and AAC switch to shorter windows around an attack.';
            setQuest();
          }
        }
      }
      function stop() {
        const t = nowA();
        for (const rec of E.sources) {
          try {
            const gp = rec.g.gain;
            if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(t); else { gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); }
            gp.setTargetAtTime(0, t, 0.012);
            rec.node.stop(t + 0.09);
          } catch (_) { /* already stopped */ }
        }
        E.sources.clear();
        E.play = null; E.dirty = true;
      }

      return {
        E,
        show() { E.dirty = true; },
        frame() {
          if (E.pending) recompute();
          if (E.play) { E.dirty = true; if (nowA() > E.play.t0 + E.play.dur + 0.1) E.play = null; }
          if (E.dirty) { E.dirty = false; draw(); }
        },
        stop,
        destroy() { stop(); H.destroy(); },
        api: { playClip, setClip: (v) => { E.clip = v; E.pending = true; }, setLong: (v) => { E.long = v; winT.set(v ? 'long' : 'short'); E.pending = true; } },
      };
    }

    /* ==================== III · the unmeasured ==================== */
    function buildCS() {
      const el = box.cs;
      const n = 256;
      const C = { s: 12, m: 97, hist: [], seed: 2026, mseed: 7, x: null, mask: null, Y: null, zf: null, solver: null, xr: null, errL1: null, errZ: 0,
        dirty: true, play: null, sched: null, events: [], trials: [], trial: null, count: 0 };
      const H = stationCanvas(el, (w) => layout(w).H, () => { C.dirty = true; });
      H.canvas.classList.add('lossy-cv');
      H.canvas.setAttribute('role', 'img');
      H.canvas.setAttribute('aria-label', 'A ring of 256 drum steps with the true accents, the zero-filled guess and the ℓ¹ recovery, beside the rhythm’s spectrum with the measured frequencies lit.');
      const row1 = ui.controlRow(el);
      const accS = ui.slider(row1, { label: 'accents in the rhythm', min: 4, max: 40, step: 1, value: C.s, onInput: (v) => { C.s = v; newRhythm(false); } });
      const mS = ui.slider(row1, { label: 'frequencies measured', min: 17, max: 161, step: 2, value: C.m, format: (v) => `${v} of 256`, onInput: (v) => { C.m = v; newMask(false); } });
      const row2 = ui.controlRow(el);
      ui.button(row2, '▶ recover by ℓ¹', () => solve(), { primary: true });
      ui.button(row2, '↻ new rhythm', () => { C.seed++; newRhythm(true); }, { small: true });
      ui.button(row2, '↻ new measurement', () => { C.mseed++; newMask(true); }, { small: true });
      ui.button(row2, 'run 20 trials', () => runTrials(), { small: true });
      const row3 = ui.controlRow(el);
      ui.button(row3, '♪ the rhythm', () => playSeq('true'), { small: true });
      ui.button(row3, '♪ zero-filled', () => playSeq('zero'), { small: true });
      ui.button(row3, '♪ recovered', () => playSeq('l1'), { small: true });
      const infoR = ui.readout(el, '');
      infoR.el.classList.add('lossy-info');

      function newRhythm(solveToo) { C.x = rhythm(n, C.s, mulberry32(C.seed * 131 + C.s)); measureNow(solveToo); }
      function newMask(solveToo) { C.mask = randomMask(n, C.m, mulberry32(C.mseed * 977 + C.m)); measureNow(solveToo); }
      function measureNow(solveToo) {
        C.Y = measure(C.x, C.mask);
        C.zf = zeroFill(C.Y, C.mask);
        C.errZ = relErr(C.zf, C.x);
        C.solver = null; C.xr = null; C.errL1 = null; C.hist = [];
        let c = 0; for (const v of C.mask) c += v; C.count = c;
        C.spec = dftR(C.x);
        C.dirty = true;
        report();
        if (solveToo) solve();
      }
      function solve() {
        C.solver = fistaSolver(C.Y, C.mask, 600);
        C.xr = C.solver.x; C.errL1 = null; C.hist = [[0, 1]]; C.dirty = true;
      }
      function report() {
        const L1 = C.errL1 == null ? (C.solver ? `solving… ${C.solver.it} of 600` : 'press recover') : `${(100 * C.errL1).toFixed(C.errL1 < 0.01 ? 3 : 1)}%`;
        infoR.setHTML(`measured <b>${C.count}</b> of 256 frequencies   ·   zero-filled error <s>${(100 * C.errZ).toFixed(1)}%</s>   ·   ℓ¹ error <i>${L1}</i>` +
          (C.errL1 == null ? '' : C.errL1 < 0.01 ? '   ·   recovered' : '   ·   not recovered: too few frequencies for this many accents, or an unlucky draw'));
      }

      function layout(W) {
        const wide = W >= 760;
        const L = { wide };
        if (wide) {
          L.R = Math.min(158, (W * 0.46) / 2 - 56); L.len = L.R * 0.42;
          L.cx = 18 + L.R + L.len; L.cy = 22 + L.R + L.len; L.key = L.cy + L.R + L.len + 26;
          L.kx = L.cx + L.R + L.len + 64; L.kw = W - L.kx - 10; L.ky = 34; L.kh = 104;
          L.gy = L.ky + L.kh + 78; L.gh = 84;
          L.ty = L.gy + L.gh + 64;
          L.H = Math.ceil(Math.max(L.key + 14, L.ty + 5 * 22 + 6));
        } else {
          L.len = 0.42 * Math.min(150, (W / 2 - 10) / 1.42); L.R = L.len / 0.42;
          L.cx = W / 2; L.cy = 20 + L.R + L.len; L.key = L.cy + L.R + L.len + 24;
          L.kx = 6; L.kw = W - 12; L.ky = L.key + 48; L.kh = 86;
          L.gy = L.ky + L.kh + 72; L.gh = 76;
          L.ty = L.gy + L.gh + 62;
          L.H = Math.ceil(L.ty + 5 * 22 + 6);
        }
        L.tx = L.kx; L.tw = L.kw;
        return L;
      }

      function draw() {
        const { ctx, width: W, height: Hh } = H;
        const L = layout(W);
        ctx.clearRect(0, 0, W, Hh);
        const { cx, cy, R, len } = L, t = nowA();
        const ang = (i) => (i / n) * Math.PI * 2 - Math.PI / 2;
        const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
        // the dial: 256 steps, sixteen bars of sixteen
        ctx.fillStyle = GHOST;
        for (let i = 0; i < n; i++) { const [x, y] = pt(i, R); ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); }
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        for (let i = 0; i < n; i += 16) {
          const [ax, ay] = pt(i, R - 7), [bx, by] = pt(i, R + 3);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          if ((i / 16) % 4 === 0) { const [nx, ny] = pt(i, R - 17); txt(ctx, String(i / 16 + 1), nx, ny, { font: `9px ${MONO}`, color: P.inkFaint, align: 'center', base: 'middle' }); }
        }
        // the zero-filled guess: a crimson smear all the way round
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, R + C.zf[i % n] * len); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.save();
        ctx.arc(cx, cy, R, ang(n), ang(0), true);
        ctx.fillStyle = 'rgba(192, 91, 77, 0.16)'; ctx.fill();
        ctx.restore();
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, R + C.zf[i % n] * len); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = 'rgba(217, 122, 104, 0.7)'; ctx.lineWidth = 1; ctx.stroke();
        // the rhythm itself: gold stems
        ctx.strokeStyle = P.gold; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) if (C.x[i]) {
          const [ax, ay] = pt(i, R), [bx, by] = pt(i, R + C.x[i] * len);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
        // the ℓ¹ recovery: verdigris beads that should land on the tips
        if (C.xr) {
          for (let i = 0; i < n; i++) {
            const v = C.xr[i];
            if (Math.abs(v) < 0.03) continue;
            const [x, y] = pt(i, R + v * len);
            glow.draw(ctx, x, y, 0.42);
            ctx.fillStyle = VG; ctx.beginPath(); ctx.arc(x, y, 3.1, 0, Math.PI * 2); ctx.fill();
          }
        }
        // playhead from the audio clock
        if (C.play && t >= C.play.t0) {
          const step = (t - C.play.t0) / C.play.dt;
          if (step < n) {
            const [x, y] = pt(step, R + len + 6), [x0, y0] = pt(step, R * 0.55);
            ctx.strokeStyle = 'rgba(98, 179, 164, 0.85)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
          }
        }
        // centre
        txt(ctx, `${C.count}`, cx, cy - 6, { font: `${L.wide ? 34 : 28}px ${SERIF}`, color: P.azure, align: 'center' });
        caps(ctx, 'of 256 measured', cx, cy + 13, P.inkDim, 'center');
        txt(ctx, `zero-fill ${(100 * C.errZ).toFixed(0)}% off`, cx, cy + 36, { font: `11px ${MONO}`, color: CB, align: 'center' });
        if (C.errL1 != null) txt(ctx, `ℓ¹ ${(100 * C.errL1).toFixed(C.errL1 < 0.01 ? 2 : 0)}% off`, cx, cy + 52, { font: `11px ${MONO}`, color: C.errL1 < 0.01 ? VG : CB, align: 'center' });
        else if (C.solver) txt(ctx, `ℓ¹ iteration ${C.solver.it}`, cx, cy + 52, { font: `11px ${MONO}`, color: VG, align: 'center' });
        // key
        {
          const items = [['the rhythm', P.gold, 'stem'], ['zero-filled', CB, 'wave'], ['recovered', VG, 'bead']];
          ctx.font = `10.5px ${MONO}`;
          const widths = items.map(([s1]) => ctx.measureText(s1).width + 22);
          let kx = cx - widths.reduce((a1, b1) => a1 + b1, 0) / 2;
          const ky = L.key;
          items.forEach(([s1, col, kind], j) => {
            ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = kind === 'stem' ? 2.4 : 1.2;
            ctx.beginPath();
            if (kind === 'stem') { ctx.moveTo(kx + 5, ky + 1); ctx.lineTo(kx + 5, ky - 9); ctx.stroke(); }
            else if (kind === 'wave') { for (let q = 0; q <= 10; q++) { const X = kx + q, Y = ky - 4 + Math.sin(q * 1.3) * 3; q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); }
            else { ctx.arc(kx + 5, ky - 4, 3, 0, Math.PI * 2); ctx.fill(); }
            txt(ctx, s1, kx + 15, ky, { font: `10.5px ${MONO}`, color: P.inkDim });
            kx += widths[j];
          });
        }
        // k-space, centred on the zero frequency as MRI plots it
        const { kx: sx0, ky: sy, kw, kh } = L, bw = kw / n;
        title(ctx, 'k-space: the rhythm’s 256 frequencies', sx0, sy - 12);
        txt(ctx, 'azure = measured', sx0 + kw, sy - 12, { font: `10px ${MONO}`, color: P.azure, align: 'right' });
        let mx = 0; for (let k = 1; k < n; k++) mx = Math.max(mx, Math.hypot(C.spec.re[k], C.spec.im[k]));
        ctx.fillStyle = 'rgba(10, 11, 16, 0.6)'; ctx.fillRect(sx0, sy, kw, kh);
        for (let j = 0; j < n; j++) {
          const k = (j + n / 2) % n, h = Math.min(1, Math.hypot(C.spec.re[k], C.spec.im[k]) / (mx || 1)) * (kh - 8);
          ctx.fillStyle = C.mask[k] ? P.azure : 'rgba(74, 72, 64, 0.55)';
          ctx.fillRect(sx0 + j * bw + bw * 0.14, sy + kh - h, Math.max(0.8, bw * 0.72), h);
        }
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(sx0 - 0.5, sy - 0.5, kw + 1, kh + 1);
        txt(ctx, '−128', sx0, sy + kh + 13, { font: `10px ${MONO}`, color: P.inkFaint });
        txt(ctx, '0', sx0 + kw / 2, sy + kh + 13, { font: `10px ${MONO}`, color: P.inkFaint, align: 'center' });
        txt(ctx, '127', sx0 + kw, sy + kh + 13, { font: `10px ${MONO}`, color: P.inkFaint, align: 'right' });
        txt(ctx, L.wide ? 'every accent reaches every frequency, so a random handful can find them' : 'every accent reaches every frequency', sx0, sy + kh + 30, { font: `italic 12px ${SERIF}`, color: P.inkDim });
        // convergence of the solver, from its own iterates
        const gx = sx0, gy = L.gy, gw = kw, gh = L.gh;
        title(ctx, 'error as the solver iterates', gx, gy - 12);
        txt(ctx, 'log scale', gx + gw, gy - 12, { font: `10px ${MONO}`, color: P.inkFaint, align: 'right' });
        ctx.fillStyle = 'rgba(10, 11, 16, 0.6)'; ctx.fillRect(gx, gy, gw, gh);
        const ly = (e) => gy + 5 + (gh - 10) * clamp(-Math.log10(Math.max(e, 1e-5)) / 5, 0, 1);
        for (const [e, lab] of [[1, '100%'], [0.01, '1%'], [1e-4, '0.01%']]) {
          ctx.fillStyle = P.line; ctx.fillRect(gx, ly(e), gw, 1);
          txt(ctx, lab, gx + 3, ly(e) + 10, { font: `9px ${MONO}`, color: P.inkFaint });
        }
        ctx.strokeStyle = CB; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx, ly(C.errZ)); ctx.lineTo(gx + gw, ly(C.errZ)); ctx.stroke(); ctx.setLineDash([]);
        if (C.hist.length > 1) {
          ctx.strokeStyle = VG; ctx.lineWidth = 1.6; ctx.beginPath();
          C.hist.forEach(([it, e], j) => { const X = gx + (it / 600) * gw, Y = ly(e); j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
          ctx.stroke();
          const [it, e] = C.hist[C.hist.length - 1];
          ctx.fillStyle = VG; ctx.beginPath(); ctx.arc(gx + (it / 600) * gw, ly(e), 2.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = P.line; ctx.strokeRect(gx - 0.5, gy - 0.5, gw + 1, gh + 1);
        txt(ctx, 'zero-filled', gx + gw - 4, ly(C.errZ) + (ly(C.errZ) - gy < 16 ? 12 : -4), { font: `10px ${MONO}`, color: CB, align: 'right' });
        txt(ctx, '0', gx, gy + gh + 13, { font: `10px ${MONO}`, color: P.inkFaint });
        txt(ctx, '600 iterations', gx + gw, gy + gh + 13, { font: `10px ${MONO}`, color: P.inkFaint, align: 'right' });
        // the tally of trials
        const { tx, ty, tw } = L;
        title(ctx, 'the tally: twenty fresh rhythms each', tx, ty - 12);
        const rowsT = C.trials.slice(-5);
        if (!rowsT.length && !C.trial) txt(ctx, 'run trials to count how often recovery succeeds', tx, ty + 12, { font: `10.5px ${MONO}`, color: P.inkFaint });
        const all = C.trial ? [...rowsT.slice(-4), C.trial] : rowsT;
        const labW = L.wide ? 150 : 104, dot = clamp((tw - labW - 44) / 20 - 3, 4, 9);
        all.forEach((rw, j) => {
          const yy = ty + 8 + j * 22;
          txt(ctx, L.wide ? `${String(rw.s).padStart(2)} accents · ${rw.m} of 256` : `${rw.s} acc. · ${rw.m}`, tx, yy + 4, { font: `10.5px ${MONO}`, color: P.inkDim });
          for (let q = 0; q < 20; q++) {
            const res = rw.res[q];
            ctx.fillStyle = res == null ? 'rgba(74, 72, 64, 0.5)' : res ? VG : P.crimson;
            ctx.beginPath(); ctx.arc(tx + labW + q * (dot + 3) + dot / 2, yy, dot / 2, 0, Math.PI * 2); ctx.fill();
          }
          const ok = rw.res.filter(Boolean).length, done = rw.res.filter((v) => v != null).length;
          txt(ctx, `${ok}/${done}`, tx + tw, yy + 4, { font: `10.5px ${MONO}`, color: P.ink, align: 'right' });
        });
      }

      function runTrials() {
        if (C.trial) return;
        C.trial = { s: C.s, m: C.m, res: [], seed: (Date.now() & 0xffff) };
        C.dirty = true;
      }
      function trialStep() {
        const T = C.trial;
        const j = T.res.length;
        const rng = mulberry32(T.seed * 7919 + j * 104729 + T.s * 31 + T.m);
        const x = rhythm(n, T.s, rng), mask = randomMask(n, T.m, rng), Y = measure(x, mask);
        T.res.push(relErr(fistaL1(Y, mask), x) < 0.01);
        if (T.res.length >= 20) { C.trials.push(T); C.trial = null; }
        C.dirty = true;
      }

      // ---- playing the reconstructions (loudness from the numbers themselves) ----
      function playSeq(kind) {
        const c = audio.ensureAudio();
        stopSeq();
        const v = kind === 'true' ? C.x : kind === 'zero' ? C.zf : C.xr;
        if (!v) { infoR.setHTML('Press <b>recover</b> first: there is nothing recovered to play yet.'); return; }
        let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, C.x[i]);
        const dt = 1 / 30;
        let i = 0;
        C.play = { t0: c.currentTime + 0.08, dt };
        C.sched = audio.createScheduler((t) => {
          if (i >= n) return null;
          const a = Math.abs(v[i]) / (mx || 1);
          if (a > 0.05) audio.drums.thock(bus, t, { level: Math.min(0.5, 0.5 * a) });
          if (i % 16 === 0) audio.drums.hat(bus, t, { level: 0.04 });
          i++;
          return t + dt;
        });
        C.sched.start(0.08);
      }
      function stopSeq() { if (C.sched) { C.sched.stop(); C.sched = null; } C.play = null; C.dirty = true; }

      // tap the dial to add or remove an accent
      const ringStep = (e) => {
        const [mx, my] = cv.pointerPos(H, e), L = layout(H.width), dx = mx - L.cx, dy = my - L.cy, r = Math.hypot(dx, dy);
        if (r < L.R * 0.72 || r > L.R + L.len + 12) return -1;
        let a = Math.atan2(dy, dx) + Math.PI / 2;
        if (a < 0) a += 2 * Math.PI;
        return Math.round((a / (2 * Math.PI)) * n) % n;
      };
      H.canvas.addEventListener('pointerdown', (e) => {
        const i = ringStep(e);
        if (i < 0) return;
        C.x = Float64Array.from(C.x);
        C.x[i] = C.x[i] ? 0 : 0.8;
        let k = 0; for (const v of C.x) if (v) k++;
        if (!k) { C.x[i] = 0.8; k = 1; }
        C.s = k; accS.set(Math.max(4, Math.min(40, k)));
        measureNow(false);
      });
      H.canvas.addEventListener('pointermove', (e) => { H.canvas.style.cursor = ringStep(e) >= 0 ? 'pointer' : 'default'; });
      C.x = rhythm(n, C.s, mulberry32(C.seed * 131 + C.s));
      C.mask = randomMask(n, C.m, mulberry32(C.mseed * 977 + C.m));
      measureNow(false);
      return {
        C,
        show() { C.dirty = true; },
        frame() {
          if (C.solver && C.errL1 == null) {
            const done = C.solver.step(15);
            C.xr = C.solver.x;
            C.hist.push([C.solver.it, relErr(C.xr, C.x)]);
            if (done) {
              C.errL1 = relErr(C.xr, C.x);
              if (C.errL1 < 0.01 && C.count <= 63 && !questState.cs.done) {
                questState.cs.done = true;
                questState.cs.text = `Recovered from ${C.count} of 256 frequencies, with ${(100 * C.errL1).toFixed(2)}% error; ` +
                  `the zero-filled guess from the very same data is ${(100 * C.errZ).toFixed(0)}% off. Go lower and run the trials: ` +
                  'the recovery holds, and then, over a short stretch, it stops holding.';
                if (station === 'cs') setQuest();
              }
            }
            report();
            C.dirty = true;
          }
          if (C.trial) { const t0 = performance.now(); do trialStep(); while (C.trial && performance.now() - t0 < 6); }
          if (C.play) { C.dirty = true; if (nowA() > C.play.t0 + n * C.play.dt + 0.2) C.play = null; }
          if (C.dirty) { C.dirty = false; draw(); }
        },
        stop() { stopSeq(); if (C.trial) { C.trial = null; } },
        destroy() { stopSeq(); H.destroy(); },
        api: { solve, runTrials, playSeq, setM: (m) => { mS.set(m); C.m = m; newMask(false); } },
      };
    }

    /* ---------------- lifecycle ---------------- */
    function stopSounds() { for (const k in stations) stations[k].stop(); }
    const loop = cv.rafLoop(() => { const s = stations[station]; if (s) s.frame(); });
    setStation('pic');
    loop.start();

    const inst = {
      pause() { loop.stop(); stopSounds(); bus.mute(); },
      resume() { bus.unmute(); for (const k in stations) stations[k].show(); loop.start(); },
      destroy() { loop.stop(); stopSounds(); for (const k in stations) stations[k].destroy(); bus.dispose(); style.remove(); },
    };
    Object.defineProperty(inst, '_debug', { value: { stations, setStation, questState }, enumerable: false });
    return inst;
  },
};

/* ---------------- self-test: the verified anchors ---------------- */

function selfTest() {
  const ok = (c, m) => { if (!c) throw new Error('lossy selfTest: ' + m); };
  const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);
  // transform
  let S = fdct8(new Float64Array(64).fill(127));
  near(S[0], 1016, 1e-9, 'DC of a flat 255 block');
  const s = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s[y * 8 + x] = 100 * Math.cos(((2 * x + 1) * Math.PI) / 16);
  S = fdct8(s);
  near(S[1], 400 * Math.SQRT2, 1e-9, 'single cosine');
  const r = mulberry32(5), blk = Float64Array.from({ length: 64 }, () => r() * 255 - 128);
  const A = fdct8(blk), B = fdct8Naive(blk), back = idct8(A);
  let e1 = 0, e2 = 0;
  for (let i = 0; i < 64; i++) { near(A[i], B[i], 1e-9, 'separable = direct'); near(back[i], blk[i], 1e-9, 'round trip'); e1 += A[i] ** 2; e2 += blk[i] ** 2; }
  near(e1 / e2, 1, 1e-12, 'Parseval');
  // tables, zig-zag, categories, Huffman
  ok(scaledTable(K1, 50).join() === K1.join(), 'q50 = K.1');
  ok(scaledTable(K1, 75).slice(0, 8).join() === '8,6,5,8,12,20,26,31' && scaledTable(K1, 75)[63] === 50, 'q75');
  ok(scaledTable(K1, 10).slice(0, 8).join() === '80,55,50,80,120,200,255,255', 'q10');
  ok(scaledTable(K1, 100).every((v) => v === 1) && scaledTable(K1, 1).every((v) => v === 255), 'q100 / q1');
  ok(qualityScale(10) === 500 && qualityScale(75) === 50, 'quality scale');
  ok([0, 1, 3, -7, 8, 255, 1023, 1024].map(sizeCategory).join() === '0,1,2,3,4,8,10,11', 'SSSS');
  ok(zigzagGenerated().join() === ZZ.join() && ZZ.slice(0, 10).join() === '0,1,8,16,9,2,3,10,17,24', 'zig-zag');
  ok(HUFF.acL.count === 162 && HUFF.acC.count === 162 && HUFF.dcL.count === 12 && HUFF.dcC.count === 12, 'Huffman sizes');
  const code = (t, v) => t.code[v].toString(2).padStart(t.len[v], '0');
  ok(code(HUFF.dcL, 2) === '011' && code(HUFF.acL, 0) === '1010' && code(HUFF.acL, 0x01) === '00' && code(HUFF.acL, 0x12) === '11011' &&
    code(HUFF.acL, 0x21) === '11100' && code(HUFF.acL, 0xF0) === '11111111001', 'standard codes');
  ok(roundHalfAway(-0.5) === -1 && roundHalfAway(0.5) === 1, 'symmetric rounding');
  // Wallace, Fig. 10, and the knife-edge at S(3,0)
  const W = fdct8(Float64Array.from(WALLACE, (v) => v - 128));
  near(W[0], 235.625, 1e-9, 'Wallace DC');
  near(W[24], -7.081555, 1e-5, 'Wallace S(3,0)');
  const Wq = quantize(W, K1);
  ok([...Wq].filter(Boolean).join() === '15,-1,-2,-1,-1,-1,-1' && Wq[24] === -1, 'Wallace quantized (exact rounding)');
  ok(blockBits(Wq, 12, HUFF.dcL, HUFF.acL) === 34, 'Wallace 34 bits');
  Wq[24] = 0;
  ok(blockBits(Wq, 12, HUFF.dcL, HUFF.acL) === 31, 'Wallace as printed, 31 bits');
  // the dusk scene, full colour
  const rgb = rasterize(256, 192);
  let sum = 0; for (const v of rgb) sum += v;
  near(sum, 11971288, 200, 'scene checksum');
  const e50 = encodeImage(prepareImage(rgb, 256, 192), 50);
  near(e50.bits, 22295, 40, 'q50 scan bits');
  near(e50.nzY, 3211, 6, 'q50 luma survivors');
  near(e50.psnr, 31.64, 0.05, 'q50 PSNR');
  // zone plate: at q = 100 the scan outgrows the raw bitmap and is still lossy
  const z100 = encodeImage(prepareImage(zonePlate(128), 128, 128, true), 100);
  near(z100.bits, 154582, 60, 'zone plate q100 bits');
  ok(z100.scanBytes > 128 * 128 && z100.psnr < 60, 'q100 is neither small nor lossless');
  // the free membrane: DCT-II vectors are eigenvectors of the insulated second difference
  for (let k = 0; k < 8; k++) {
    const c = Array.from({ length: 8 }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / 16));
    for (let i = 0; i < 8; i++) {
      const Ac = (i > 0 ? -c[i - 1] : 0) + (i < 7 ? -c[i + 1] : 0) + (i === 0 || i === 7 ? 1 : 2) * c[i];
      near(Ac, membraneLambda(k) * c[i], 1e-12, 'Neumann eigenvector');
    }
  }
  near(membraneFreq(1, 0), 110, 1e-9, 'f(1,0)');
  near(membraneFreq(2, 0), 215.773, 1e-3, 'f(2,0)');
  near(membraneFreq(7, 7), 782.070, 1e-3, 'f(7,7)');
  ok(membraneFreq(0, 0) === 0, 'the DC is silent');
  // energy compaction against the Karhunen–Loève optimum
  near(codingGainDb(dctVariances(8, 0.95)), 8.826, 5e-4, 'DCT coding gain');
  near(codingGainDb(klVariances(8, 0.95)), 8.846, 5e-4, 'KLT coding gain');
  near(dctVariances(8, 0.95)[0] / 8, 0.8781, 1e-4, 'first coefficient share');
  // MDCT: fast = naive, TDAC round trip, aliasing of one frame, pre-echo
  const rr = mulberry32(3), x2 = Float64Array.from({ length: 256 }, () => rr() * 2 - 1);
  const M1 = mdctFast(x2), M2 = mdctNaive(x2);
  for (let k = 0; k < 128; k++) near(M1[k], M2[k], 1e-9, 'MDCT fast = naive');
  const noise = Float64Array.from({ length: 3000 }, () => rr() * 2 - 1), rt = mdctCodec(noise, 128, 0).out;
  for (let i = 0; i < noise.length; i++) near(rt[i], noise[i], 1e-12, 'TDAC');
  const fr = mdctFrame(Float64Array.from({ length: 16 }, (_, i) => (i < 8 ? 1 : 0)), 8);
  ok([-0.088, -0.194, -0.194, -0.088, 0.107, 0.362, 0.638, 0.893].every((v, i) => Math.abs(fr[i] - v) < 5e-4), 'one frame is aliased');
  const click = new Float64Array(FS), n0 = 11025;
  for (let n = n0; n < FS; n++) click[n] = 0.8 * Math.exp(-(n - n0) / 60) * Math.sin((2 * Math.PI * 2500 * (n - n0)) / FS);
  near(preEcho(click, mdctCodec(click, 1024, 0.02).out, n0, FS) * 1000, 77.5, 0.1, 'long-window pre-echo');
  near(preEcho(click, mdctCodec(click, 128, 0.02).out, n0, FS) * 1000, 6.3, 0.1, 'short-window pre-echo');
  // compressed sensing anchor
  const g = mulberry32(2026), xs = spikes(256, 12, g), mask = randomMask(256, 64, g), Y = measure(xs, mask);
  ok(mask.reduce((a, b) => a + b, 0) === 63, '63 measured');
  near(relErr(zeroFill(Y, mask), xs), 0.8821, 1e-3, 'zero-fill error');
  ok(relErr(fistaL1(Y, mask), xs) < 2e-3, 'ℓ¹ recovers the spikes');

  // ---- independent checks (verification pass) ----
  // the four standard Huffman tables are prefix-free, ≤ 16 bits, and never use an all-ones code
  for (const key of ['dcL', 'dcC', 'acL', 'acC']) {
    const t = HUFF[key], codes = [];
    for (let v = 0; v < 256; v++) if (t.len[v]) codes.push(t.code[v].toString(2).padStart(t.len[v], '0'));
    ok(codes.every((c) => c.length <= 16 && !/^1+$/.test(c)), `${key}: code lengths`);
    for (const a of codes) for (const b of codes) if (a !== b) ok(!b.startsWith(a), `${key}: prefix-free`);
  }
  // the block's printed bitstring is exactly as long as the counted bits
  const Wq2 = quantize(W, K1);
  ok(blockBitstring(Wq2, 12).reduce((n, gr) => n + gr.code.length + gr.extra.length, 0) === 34, 'bitstring length = bit count');
  // zig-zag: a permutation whose every step moves to a neighbouring cell
  ok(new Set(ZZ).size === 64 && ZZ.every((v, k) => k === 0 || Math.max(Math.abs((v & 7) - (ZZ[k - 1] & 7)), Math.abs((v >> 3) - (ZZ[k - 1] >> 3))) === 1), 'zig-zag walk');
  // every 2-D basis image is a mode of the free 8×8 bead-and-spring net (grid Laplacian, free edges)
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    const b = basisImage(u, v), lam = membraneLambda(u) + membraneLambda(v);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      let Lb = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Yy = y + dy;
        if (X >= 0 && X < 8 && Yy >= 0 && Yy < 8) Lb += b[y * 8 + x] - b[Yy * 8 + X];
      }
      near(Lb, lam * b[y * 8 + x], 1e-12, `2-D free membrane mode (${u},${v})`);
    }
  }
  // JFIF colour conversion round-trips (to 0.02: JFIF prints its coefficients to four or five
  // figures, so the pair is not an exact inverse); the sine window satisfies Princen–Bradley
  for (const c of [[255, 0, 0], [12, 200, 90], [240, 240, 16], [0, 0, 255]]) {
    const back2 = yccToRgb(...rgbToYcc(...c));
    ok(back2.every((v, i) => Math.abs(v - c[i]) < 0.02), 'JFIF colour round trip');
  }
  const sw = sineWindow(64);
  for (let n2 = 0; n2 < 64; n2++) near(sw[n2] ** 2 + sw[n2 + 64] ** 2, 1, 1e-15, 'Princen–Bradley condition');
  // the zero-filled guess agrees with every measurement and adds nothing where none was taken
  const Z = dftR(zeroFill(Y, mask));
  for (let k = 0; k < 256; k++) {
    near(Z.re[k], mask[k] ? Y.re[k] : 0, 1e-12, 'zero-fill re'); near(Z.im[k], mask[k] ? Y.im[k] : 0, 1e-12, 'zero-fill im');
  }
  // cross-check against libjpeg-turbo: Pillow 12.1.1 (quality 50, standard tables) codes this
  // greyscale zone plate in a 14,639-byte scan; the float DCT here lands within 0.1 %
  const zq50 = encodeImage(prepareImage(zonePlate(256, 192, 256), 256, 192, true), 50);
  near(zq50.bits / 8, 14639, 14639 * 0.005, 'zone plate q50 against libjpeg-turbo');
  return true;
}

export const _test = {
  K1, K2, ZZ_INDEX, ZZ, zigzagOrder, zigzagGenerated, HUFF, huffTable,
  fdct8, idct8, fdct8Naive, basisImage, qualityScale, scaledTable, roundHalfAway, quantize, dequantize,
  sizeCategory, blockSymbols, blockBits, blockBitstring, rgbToYcc, yccToRgb, psnr,
  horizonAt, chladniAt, rasterize, zonePlate, prepareImage, encodeImage, WALLACE,
  membraneLambda, membraneFreq, dctVariances, codingGainDb, klVariances,
  fft, dct4, dct4Naive, mdctFast, mdctNaive, imdctFast, sineWindow, mdctFrame, mdctCodec, snrDb, preEcho, makeClip,
  mulberry32, dftR, idftC, spikes, rhythm, randomMask, measure, zeroFill, fistaSolver, fistaL1, relErr,
  selfTest,
};
