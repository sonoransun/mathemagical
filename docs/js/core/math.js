// core/math.js — shared mathematics. Pure: no DOM, no window, importable in node.

export const TAU = Math.PI * 2;
export const PHI = (1 + Math.sqrt(5)) / 2;

/* ---------- integers & rationals ---------- */

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function gcdBig(a, b) {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

// Exact rational arithmetic on BigInt. Immutable; always stored reduced,
// denominator positive.
export class Frac {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new Error('Frac: zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdBig(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  add(o) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Frac(this.n * o.n, this.d * o.d); }
  div(o) { return new Frac(this.n * o.d, this.d * o.n); }
  neg()  { return new Frac(-this.n, this.d); }
  cmp(o) { const x = this.n * o.d - o.n * this.d; return x < 0n ? -1 : x > 0n ? 1 : 0; }
  eq(o)  { return this.n === o.n && this.d === o.d; }
  isZero() { return this.n === 0n; }
  valueOf() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
  static of(n, d = 1) { return new Frac(BigInt(n), BigInt(d)); }
}

/* ---------- continued fractions ---------- */

export function continuedFraction(x, maxTerms = 20, eps = 1e-11) {
  const terms = [];
  for (let i = 0; i < maxTerms; i++) {
    const a = Math.floor(x);
    terms.push(a);
    const frac = x - a;
    if (frac < eps) break;
    x = 1 / frac;
  }
  return terms;
}

// convergents([a0, a1, ...]) -> [[p0, q0], [p1, q1], ...]
export function convergents(cf) {
  const out = [];
  let pPrev = 1, p = cf[0], qPrev = 0, q = 1;
  out.push([p, q]);
  for (let i = 1; i < cf.length; i++) {
    const pNext = cf[i] * p + pPrev;
    const qNext = cf[i] * q + qPrev;
    pPrev = p; qPrev = q; p = pNext; q = qNext;
    out.push([p, q]);
  }
  return out;
}

/* ---------- Pell (side-and-diameter) numbers ---------- */

// pellPairs(n) -> first n pairs (p, q) with p^2 - 2 q^2 = ±1, as BigInt,
// starting (1n, 1n): (1,1), (3,2), (7,5), (17,12), (41,29), ...
export function pellPairs(n) {
  const out = [];
  let p = 1n, q = 1n;
  for (let i = 0; i < n; i++) {
    out.push([p, q]);
    [p, q] = [p + 2n * q, p + q];
  }
  return out;
}

/* ---------- complex & Fourier ---------- */

// Naive O(N^2) DFT over complex samples. points: [{re, im}, ...].
// Returns coefficients c_k for k = 0..N-1 with the convention
//   c_k = (1/N) Σ_n z_n e^{-2πikn/N}
export function dft(points) {
  const N = points.length;
  const out = new Array(N);
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (-TAU * k * n) / N;
      const c = Math.cos(phi), s = Math.sin(phi);
      re += points[n].re * c - points[n].im * s;
      im += points[n].re * s + points[n].im * c;
    }
    out[k] = { re: re / N, im: im / N, k };
  }
  return out;
}

// Inverse DFT: z_n = Σ_k c_k e^{+2πikn/N}
export function idft(coeffs) {
  const N = coeffs.length;
  const out = new Array(N);
  for (let n = 0; n < N; n++) {
    let re = 0, im = 0;
    for (let k = 0; k < N; k++) {
      const phi = (TAU * k * n) / N;
      const c = Math.cos(phi), s = Math.sin(phi);
      re += coeffs[k].re * c - coeffs[k].im * s;
      im += coeffs[k].re * s + coeffs[k].im * c;
    }
    out[n] = { re, im };
  }
  return out;
}

// Signed frequency for coefficient index k of an N-point DFT: 0, 1, ..., N/2, -(N/2-1), ..., -1
export function signedFreq(k, N) { return k <= N / 2 ? k : k - N; }

/* ---------- base expansions ---------- */

// digitsInBase(x: BigInt >= 0, base) -> array of digits, most significant first.
export function digitsInBase(x, base) {
  x = BigInt(x); const b = BigInt(base);
  if (x === 0n) return [0];
  const out = [];
  while (x > 0n) { out.push(Number(x % b)); x /= b; }
  return out.reverse();
}

// Fractional expansion of num/den in `base`.
// Returns { digits: number[], periodStart: index | null, terminates: bool }.
// periodStart is the index in `digits` where the repeating cycle begins.
export function baseExpansion(num, den, base, maxDigits = 64) {
  let n = BigInt(num) % BigInt(den);
  const d = BigInt(den), b = BigInt(base);
  const digits = [];
  const seen = new Map(); // remainder -> digit index
  while (n !== 0n && digits.length < maxDigits) {
    if (seen.has(n.toString())) {
      return { digits, periodStart: seen.get(n.toString()), terminates: false };
    }
    seen.set(n.toString(), digits.length);
    n *= b;
    digits.push(Number(n / d));
    n %= d;
  }
  return { digits, periodStart: null, terminates: n === 0n };
}

// Is n a "regular" (2,3,5-smooth) number?
export function isRegular(n) {
  for (const p of [2, 3, 5]) while (n % p === 0) n /= p;
  return n === 1;
}

/* ---------- rhythm ---------- */

// Euclidean rhythm E(k, n): k onsets in n pulses, maximally even.
// Onset at pulse i*n/k floored — a rotation of Bjorklund's output.
export function euclidRhythm(k, n) {
  const hits = new Array(n).fill(false);
  for (let i = 0; i < k; i++) hits[Math.floor((i * n) / k)] = true;
  return hits;
}

/* ---------- primes ---------- */

export function primesUpTo(n) {
  const sieve = new Uint8Array(n + 1);
  const out = [];
  for (let i = 2; i <= n; i++) {
    if (!sieve[i]) {
      out.push(i);
      for (let j = i * i; j <= n; j += i) sieve[j] = 1;
    }
  }
  return out;
}

/* ---------- ordinals below ε₀ (for the hydra & Goodstein) ----------
   Representation: an ordinal is
     - a finite non-negative integer  (plain JS number), or
     - { terms: [[exponent, coeff], ...] }  meaning Σ ω^exponent · coeff,
       exponents (themselves ordinals) strictly decreasing, coeffs ≥ 1.
   This is Cantor normal form. */

export function ordIsFinite(a) { return typeof a === 'number'; }

export function ordCmp(a, b) {
  const af = ordIsFinite(a), bf = ordIsFinite(b);
  if (af && bf) return a < b ? -1 : a > b ? 1 : 0;
  if (af) return -1;
  if (bf) return 1;
  const n = Math.max(a.terms.length, b.terms.length);
  for (let i = 0; i < n; i++) {
    const ta = a.terms[i], tb = b.terms[i];
    if (!ta) return -1;
    if (!tb) return 1;
    const ce = ordCmp(ta[0], tb[0]);
    if (ce !== 0) return ce;
    if (ta[1] !== tb[1]) return ta[1] < tb[1] ? -1 : 1;
  }
  return 0;
}

// Build ω^exponent · coeff + rest (rest an ordinal with all terms smaller).
export function ordOmegaPow(exponent, coeff = 1, rest = 0) {
  const terms = [[exponent, coeff]];
  if (ordIsFinite(rest)) {
    if (rest > 0) terms.push([0, rest]);
  } else {
    terms.push(...rest.terms);
  }
  return { terms };
}

// Sum of a list of ordinals given as ω^e_i (natural/Hessenberg-safe here because
// we sort exponents descending and merge equal ones — correct for hydra use).
export function ordSumOfOmegaPows(exponents) {
  const sorted = [...exponents].sort((x, y) => ordCmp(y, x));
  const terms = [];
  for (const e of sorted) {
    const last = terms[terms.length - 1];
    if (last && ordCmp(last[0], e) === 0) last[1] += 1;
    else terms.push([e, 1]);
  }
  if (terms.length === 0) return 0;
  if (terms.length === 1 && ordIsFinite(terms[0][0]) && terms[0][0] === 0) return terms[0][1];
  return { terms };
}

export function ordToString(a) {
  if (ordIsFinite(a)) return String(a);
  return a.terms.map(([e, c]) => {
    let base;
    if (ordIsFinite(e) && e === 0) return String(c);            // ω^0·c = c
    if (ordIsFinite(e) && e === 1) base = 'ω';
    else {
      const es = ordToString(e);
      base = /^[0-9ω]$/.test(es) ? `ω^${es}` : `ω^(${es})`;
    }
    return c === 1 ? base : `${base}·${c}`;
  }).join(' + ');
}

/* ---------- misc ---------- */

export function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function mod(a, n) { return ((a % n) + n) % n; }

// Cents between two frequency ratios (or a ratio vs 1).
export function cents(ratio) { return 1200 * Math.log2(ratio); }

// Map 0..1 -> frequency on an exponential scale between fLo and fHi.
export function expScale(t, fLo, fHi) { return fLo * Math.pow(fHi / fLo, t); }

export function formatBig(x, groups = true) {
  const s = x.toString();
  return groups ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s;
}
