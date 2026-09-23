// III.1 — The Diagonal, Again
// Cantor's 1891 diagonal argument, run for real against the visitor's own
// enumeration. Rows are closures over BigInt indices, so the diagonal is
// computable at ANY position; the diagonal is itself just another closure,
// which is why "absorb it as row 0" is one line of code — and why it never
// helps. A "paradox row" that copies the diagonal of its own list shows
// Turing's §8 impasse (⊥ at its own index). Plus: the ladder of infinities
// drawn as real objects (the visitor's rules as ticks on a Cantor-set
// continuum, the diagonal unreached), the CH gap with a dated timeline, and a
// playable shadow of Cohen's forcing on the tree of finite conditions.
//
// Pure logic (rules, enumeration, diagonalization, primality, formatting) is
// node-testable via _test, including _test.selfTest().

/* ================= pure, node-testable core ================= */

const MAX_IDX = 10n ** 100n;   // jump cap: a googol. Every rule here stays O(bits) that far out.
// ψ₁₃ (OEIS A014233): the smallest strong pseudoprime to all of the first 13
// prime bases 2…41 (Sorenson & Webster, arXiv:1509.00864). Below it,
// Miller–Rabin on those bases is a proof. We add base 43, which ψ₁₃ itself
// fails; above the bound the verdict is a strong probable-prime test, not a proof.
const MR_DETERMINISTIC_BOUND = 3317044064679887385961981n;
const BOT = 2;                 // ⊥: a cell whose program would call itself forever

function modPow(base, exp, mod) {
  if (mod === 1n) return 0n;
  let r = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

// Parity of the binary digit sum (Thue–Morse).
function popParity(n) {
  let c = 0;
  for (const ch of n.toString(2)) if (ch === '1') c ^= 1;
  return c;
}

// Floor square root of a non-negative BigInt (Newton).
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n];

// Miller–Rabin with the first 14 primes as witnesses: a proof for every
// n ≤ ψ₁₃ ≈ 3.3×10²⁴, a strong probable-prime verdict beyond it.
function isPrime(n) {
  if (n < 2n) return false;
  for (const p of MR_BASES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n, r = 0n;
  while ((d & 1n) === 0n) { d >>= 1n; r++; }
  witness: for (const a of MR_BASES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1n; i < r; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue witness;
    }
    return false;
  }
  return true;
}

// nth digit (0-indexed) of the binary Champernowne word: 1 10 11 100 101 …
// Numbers with k bits contribute k·2^(k−1) digits; C(k) = (k−1)·2^k + 1.
function champBit(n) {
  let k = 1n;
  while (((k - 1n) << k) + 1n <= n) k++;
  const prev = k === 1n ? 0n : ((k - 2n) << (k - 1n)) + 1n;
  const off = n - prev;
  const num = (1n << (k - 1n)) + off / k;
  const bitIdx = off % k;                       // 0 = most significant bit
  return Number((num >> (k - 1n - bitIdx)) & 1n);
}

function mkRule(type, label, fn) {
  return { type, label, eval: (n) => fn(BigInt(n)) };
}

const flip = (v) => (v === BOT ? BOT : 1 - v);
const SUBS = '₀₁₂₃₄₅₆₇₈₉', SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sub = (k) => String(k).replace(/\d/g, (c) => SUBS[+c]);
const sup = (k) => String(k).replace(/\d/g, (c) => SUPS[+c]);
const diagName = (gen) => (gen === 1 ? 'd' : 'd' + sub(gen));

// Rule constructors: every row of the table is one of these — a closure that
// answers 0 or 1 at ANY BigInt index. This is what makes the exhibit honest:
// nothing is precomputed, nothing is finite data pretending to be infinite.
const rules = {
  zeros: () => mkRule('zeros', 'all zeros', () => 0),
  ones: () => mkRule('ones', 'all ones', () => 1),
  periodic: (pat) => {
    const bits = [...String(pat)].map((c) => (c === '1' ? 1 : 0));
    if (!bits.length) bits.push(0);
    const L = BigInt(bits.length);
    return mkRule('periodic', `(${bits.join('')}) repeating`, (n) => bits[Number(n % L)]);
  },
  rational: (p, q) => {
    p = BigInt(p); q = BigInt(q);
    if (q <= 0n) q = 1n;
    const r0 = ((p % q) + q) % q;               // fractional part of p/q
    return mkRule('rational', `${p}/${q} in binary`, (n) => {
      const r = (r0 * modPow(2n, n, q)) % q;
      return 2n * r >= q ? 1 : 0;
    });
  },
  thueMorse: () => mkRule('thueMorse', 'Thue–Morse', (n) => popParity(n)),
  primes: () => mkRule('primes', 'the primes', (n) => (isPrime(n) ? 1 : 0)),
  squares: () => mkRule('squares', 'the perfect squares', (n) => {
    const s = isqrt(n);
    return s * s === n ? 1 : 0;
  }),
  powersOfTwo: () => mkRule('powersOfTwo', 'the powers of 2', (n) =>
    n > 0n && (n & (n - 1n)) === 0n ? 1 : 0),
  champernowne: () => mkRule('champernowne', 'binary Champernowne', (n) => champBit(n)),
  paint: (bits) => {
    const arr = Array.from({ length: 64 }, (_, i) => (bits && bits[i] ? 1 : 0));
    const r = mkRule('paint', 'painted 64, repeated', (n) => arr[Number(n % 64n)]);
    r.bits = arr;                               // mutable — grid clicks toggle
    return r;
  },
  // Turing's §8 in one closure: a row that copies the diagonal of the very
  // list it sits in. Wherever that diagonal must consult this row, the program
  // would call itself forever; we cut the regress and answer ⊥.
  paradox: (getDiag) => {
    const busy = new Set();
    return mkRule('paradox', 'copies the diagonal', (n) => {
      const key = n.toString();
      if (busy.has(key)) return BOT;
      busy.add(key);
      try { return getDiag().eval(n); } finally { busy.delete(key); }
    });
  },
};

// The infinite enumeration: row n of the table is rule (n mod k). Every rule
// appears infinitely often, so a sequence that escapes every row escapes the
// visitor's whole repertoire.
function enumAt(list, n) {
  const k = BigInt(list.length);
  const b = BigInt(n);
  return list[Number(((b % k) + k) % k)];
}

// The whole 1891 argument, as executable code. Note it is JUST ANOTHER RULE —
// which is exactly why absorbing it into the list cannot help: the enlarged
// list feeds this same constructor and out steps a new escapee.
function makeDiagonal(list, gen = 1) {
  const snap = list.slice();                    // freeze the enumeration s₀,s₁,…
  const d = mkRule('diagonal', `${diagName(gen)}, the diagonal`,
    (n) => flip(enumAt(snap, n).eval(n)));      // d(n) = 1 − sₙ(n)
  d.gen = gen;
  d.snap = snap;
  return d;
}

// A deep, frozen copy of a list: painted rows stop listening to the brush, and
// diagonals are rebuilt over frozen copies of the lists they flipped.
function deepFreeze(list, memo = new Map()) {
  const fr = (r) => {
    if (memo.has(r)) return memo.get(r);
    let out = r;
    if (r.type === 'paint') {
      const bits = r.bits.slice();
      out = { ...r, bits, eval: (n) => bits[Number(BigInt(n) % 64n)] };
    } else if (r.type === 'diagonal' && r.snap) {
      memo.set(r, null);
      const d = makeDiagonal(r.snap.map(fr), r.gen);
      out = { ...r, eval: d.eval, snap: d.snap };
    }
    memo.set(r, out);
    return out;
  };
  return list.map(fr);
}

// Where a sequence sits in Cantor's middle-thirds set: Σ 2·sᵢ / 3^(i+1).
// This map is a bijection from binary sequences onto the Cantor set.
function cantorAddress(rule, bits = 24) {
  let x = 0, w = 1 / 3;
  for (let i = 0; i < bits; i++) {
    const v = rule.eval(BigInt(i));
    if (v === BOT) return null;
    x += 2 * v * w;
    w /= 3;
  }
  return x;
}

// First position where two rules disagree (or `max`).
function commonPrefix(a, b, max = 64) {
  for (let i = 0; i < max; i++) if (a.eval(BigInt(i)) !== b.eval(BigInt(i))) return i;
  return max;
}

// Accepts "1000000", "1,000,000", "10^6", "3e12", "3×10^12", "googol". Null if unparseable.
function parseIndex(raw) {
  const s = String(raw).trim().toLowerCase().replace(/[\s,_]/g, '');
  if (s === 'googol' || s === 'agoogol') return 10n ** 100n;
  let m = /^(\d+)(?:\^|\*\*)(\d+)$/.exec(s);
  if (m) {
    const b = BigInt(m[1]), e = BigInt(m[2]);
    if (b > 1000000n || e > 512n) return null;
    return b ** e;
  }
  m = /^(\d+)(?:×|x|\*)10\^(\d+)$/.exec(s);
  if (m) {
    if (m[1].length > 40 || BigInt(m[2]) > 512n) return null;
    return BigInt(m[1]) * 10n ** BigInt(m[2]);
  }
  m = /^(\d+)e(\d+)$/.exec(s);
  if (m) {
    if (m[1].length > 40 || BigInt(m[2]) > 512n) return null;
    return BigInt(m[1]) * 10n ** BigInt(m[2]);
  }
  if (/^\d{1,130}$/.test(s)) return BigInt(s);
  return null;
}

const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// m×10ᵏ ± r with a short mantissa and a small remainder, when one exists.
function structured(n, L) {
  const mant = (q, k) => {
    while (q % 10n === 0n) { q /= 10n; k++; }
    return q === 1n ? `10${sup(k)}` : `${q}×10${sup(k)}`;
  };
  for (let k = L - 1; k >= Math.max(4, L - 3); k--) {
    const Pk = 10n ** BigInt(k);
    const q = n / Pk, r = n - q * Pk;
    if (q >= 1n && q <= 999n && r <= 9999n) return mant(q, k) + (r ? ` + ${r}` : '');
    const q2 = q + 1n, r2 = q2 * Pk - n;
    if (q2 <= 999n && r2 > 0n && r2 <= 9999n) return mant(q2, k) + ` − ${r2}`;
  }
  return null;
}

// Compact and EXACT: neighbouring indices never share a label.
function fmtIdx(n) {
  n = BigInt(n);
  const s = n.toString();
  if (s.length <= 13) return group(s);
  return structured(n, s.length) || `${s.slice(0, 4)}…${group(s.slice(-6))}`;
}

// For readouts: every digit while that stays readable.
function fmtLong(n) {
  n = BigInt(n);
  const s = n.toString();
  if (n === 10n ** 100n) return '10¹⁰⁰ (a googol)';
  if (s.length <= 30) return group(s);
  return structured(n, s.length) || `${s.slice(0, 6)}…${s.slice(-6)} (${s.length} digits)`;
}

function starterRows() {
  return [
    rules.zeros(),
    rules.rational(1, 3),
    rules.thueMorse(),
    rules.primes(),
    rules.periodic('0110'),
    rules.champernowne(),
  ];
}

// Verifies the argument itself, at small, random and enormous indices.
function selfTest() {
  const ok = (c, msg) => { if (!c) throw new Error(msg); };
  const digits = (r, k) => Array.from({ length: k }, (_, i) => r.eval(BigInt(i))).join('');
  // 1. the escape, across five absorptions, out to a googol
  let list = starterRows();
  const idx = [0n, 1n, 2n, 5n, 17n, 63n, 64n, 999n, 1000000n, 3000000000000n,
    MR_DETERMINISTIC_BOUND, 10n ** 39n + 7n, 10n ** 100n];
  for (let a = 1; a <= 5; a++) {
    const d = makeDiagonal(list, a);
    for (const n of idx) ok(d.eval(n) === 1 - enumAt(list, n).eval(n), `d${a} must differ from row ${n} at ${n}`);
    list = [d, ...list];
    const d2 = makeDiagonal(list, a + 1);
    ok(d2.eval(0n) !== d.eval(0n), 'the new diagonal escapes the absorbed one at position 0');
  }
  // 2. primality, including the number that fools the first 13 prime bases
  ok(!isPrime(MR_DETERMINISTIC_BOUND), 'ψ₁₃ = 3317044064679887385961981 is composite');
  ok(1287836182261n * 2575672364521n === MR_DETERMINISTIC_BOUND, 'ψ₁₃ factors');
  ok(!isPrime(318665857834031151167461n), 'ψ₁₂ is composite');
  ok(isPrime(2n ** 89n - 1n) && isPrime(1000003n) && !isPrime(1000001n), 'small primality anchors');
  // 3. rule digits
  ok(digits(rules.champernowne(), 20) === '11011100101110111100', 'binary Champernowne prefix');
  ok(digits(rules.rational(3, 7), 9) === '011011011', '3/7 = 0.011011…');
  ok(digits(rules.rational(1, 3), 6) === '010101', '1/3 = 0.0101…');
  ok(digits(rules.thueMorse(), 16) === '0110100110010110', 'Thue–Morse prefix');
  // 4. the paradox row: undefined exactly where it must copy its own negation
  const pl = starterRows();
  let pd = null;
  pl.push(rules.paradox(() => pd));
  pd = makeDiagonal(pl);
  ok(pl[6].eval(6n) === BOT && pd.eval(6n) === BOT && pd.eval(13n) === BOT, 'paradox row is ⊥ at its own index');
  ok(pl[6].eval(7n) === 1 && pd.eval(7n) === 1, 'elsewhere the paradox row copies d');
  // 5. frozen snapshots ignore later painting
  const paintList = [rules.paint([1]), rules.zeros()];
  const frozen = deepFreeze(paintList);
  paintList[0].bits[0] = 0;
  ok(frozen[0].eval(0n) === 1 && paintList[0].eval(0n) === 0, 'deepFreeze copies painted bits');
  // 6. parsing and exact labels
  ok(parseIndex('googol') === 10n ** 100n && parseIndex('10^6') === 1000000n, 'parse googol, 10^6');
  ok(parseIndex('3e12') === 3000000000000n && parseIndex('3×10^12') === 3000000000000n, 'parse 3e12');
  const a = [29999999999999n, 30000000000000n, 30000000000001n].map(fmtIdx);
  ok(new Set(a).size === 3, 'neighbouring big indices get distinct labels');
  ok(fmtIdx(10n ** 100n) === '10¹⁰⁰', 'googol label');
  // 7. the continuum picture: addresses are distinct for the starter rules
  const addr = starterRows().map((r) => cantorAddress(r));
  ok(new Set(addr.map((x) => x.toFixed(9))).size === 6 && addr[0] === 0, 'Cantor-set addresses');
  return true;
}

/* ================= the exhibit ================= */

const TIMELINE = [
  { year: '1878', short: 'Cantor’s conjecture', kind: 'conj',
    text: '1878 · Cantor conjectures that every infinite set of real numbers is either countable or as large as the whole line: the continuum hypothesis.' },
  { year: '1900', short: 'Hilbert’s problem 1', kind: 'hist',
    text: '1900 · At the Sorbonne on 8 August, David Hilbert opens his list of problems for the new century with Cantor’s question.' },
  { year: '1938', short: 'Gödel: it holds in L', kind: 'thm',
    text: '1938 · Kurt Gödel: CH holds in the constructible universe L, so ZFC cannot refute it, if ZFC is consistent. The full proof appears in a 1940 monograph.' },
  { year: '1963', short: 'Cohen: forcing breaks it', kind: 'thm',
    text: '1963 · Paul Cohen invents forcing and builds models of ZFC in which CH fails, so ZFC cannot prove it either.' },
  { year: '1988', short: 'MM ⇒ continuum = ℵ₂', kind: 'thm',
    text: '1988 · Foreman, Magidor and Shelah: Martin’s Maximum, a maximal forcing axiom, implies that the continuum is ℵ₂. A theorem; what it says about CH’s truth is the conjecture panel’s business.' },
  { year: '2020', short: 'independence, in Lean', kind: 'machine',
    text: '2020 · Jesse Han and Floris van Doorn’s Flypitch: the independence of CH from ZFC, checked by the Lean proof assistant.' },
  { year: '2021', short: 'MM⁺⁺ ⇒ Woodin’s (∗)', kind: 'thm',
    text: '2021 · Asperó and Schindler: MM⁺⁺ implies Woodin’s axiom (∗), which also makes the continuum ℵ₂. Two strong axioms, one verdict; still a theorem about axioms, not a proof of ¬CH.' },
];

const RUNG_TEXT = [
  'ℵ₀ = ℶ₀, the countable: the whole numbers, and anything that can be listed. Your table, every absorbed diagonal included, lives on this rung.',
  '2^ℵ₀ = ℶ₁, the continuum: every infinite binary sequence, drawn as Cantor’s middle-thirds set, where digit n picks the left or right third at stage n. Each tick is one of your rules at its true address.',
  '2^(2^ℵ₀) = ℶ₂: every set of real numbers. There are only countably many finite descriptions, so all but countably many of these sets have none.',
  'No top rung: for every set X, the power set P(X) is strictly larger. Cantor’s theorem, the diagonal again.',
];

export default {
  id: 'cantor',
  movement: 3,
  title: 'The Diagonal, Again',
  hook: 'Build an infinite list meant to contain every infinite binary sequence. One sequence will step out of it — and will keep stepping out no matter what you do.',
  era: '1873–1963 · Halle, Braunschweig, Paris, Princeton, Stanford',
  chronicle: [
    { year: 1873, date: '7 Dec 1873', text: 'In a letter from Halle to Richard Dedekind, Georg Cantor proves that the real numbers cannot be listed; the proof reaches print in 1874, in Crelle’s <em>Journal</em>, under a title about algebraic numbers.' },
    { year: 1891, date: 'Sept 1891', text: 'Chairing the first meeting of the German Mathematical Society in Halle, Georg Cantor introduces the diagonal argument, writing his sequences in two letters, <em>m</em> and <em>w</em>.' },
    { year: 1900, date: '8 Aug 1900', text: 'At the Sorbonne, David Hilbert opens his list of problems for the new century with Cantor’s continuum hypothesis of 1878: no infinite size lies strictly between the whole numbers and the real line.' },
    { year: 1938, date: '1938', text: 'Kurt Gödel announces that the continuum hypothesis cannot be refuted from the standard axioms of set theory: it holds in his constructible universe <em>L</em>. The full proof follows in 1940.' },
    { year: 1963, date: '1963', text: 'At Stanford, Paul Cohen invents <em>forcing</em> and shows that the continuum hypothesis cannot be proved from the standard axioms either; the work earns him the Fields Medal in 1966.' },
    { year: 2020, date: 'Jan 2020', text: 'Jesse Han and Floris van Doorn publish Flypitch, a machine-checked proof in the Lean proof assistant that ZFC can neither prove nor refute the continuum hypothesis.' },
    { year: 2021, date: '2021', text: 'In the <em>Annals of Mathematics</em>, David Asperó and Ralf Schindler publish their proof that Martin’s Maximum<sup>++</sup> implies W. Hugh Woodin’s axiom (∗), joining two axioms that each make the continuum exactly ℵ₂.' },
    { year: 2025, date: 'March 2025', text: 'At the University of Halle, the mathematician and journalist Demian Goos finds Richard Dedekind’s letter to Cantor of 30 November 1873, long presumed lost, among papers from Cantor’s family.' },
  ],
  today: `
    <p>The flip outlived its first target. Turing turned it on programs in 1936, and
    complexity theory still runs on it. In 1965 Juris Hartmanis and Richard Stearns
    diagonalized against every fast machine to prove the time hierarchy theorem: give a
    computer substantially more time and there are problems it can solve that it could not
    solve before. In 1975 Theodore Baker, John Gill and Robert Solovay found the method’s
    edge. There are oracle worlds in which P equals NP and others in which it does not, so an
    argument that works the same way in every such world, as plain diagonalization does,
    cannot settle the question. P versus NP is still open, and the locks of
    <a href="#ex-handshake">The Handshake</a> hang on it: were P equal to NP, the one-way walk
    on the curve could be retraced in polynomial time.</p>
    <p>The argument itself is now checked by machine. In Lean’s Mathlib library Cantor’s
    theorem is a named theorem, <code>Function.cantor_surjective</code>: no function from a type
    to its sets is onto. In January 2020 Jesse Han and Floris van Doorn published Flypitch, a
    complete formal proof, checked by the Lean proof assistant, that ZFC can neither prove nor
    refute the continuum hypothesis.</p>
    <p>The gap between the first two rungs is still being worked on. In 2021 David Asperó and
    Ralf Schindler proved in the <em>Annals of Mathematics</em> that Martin’s
    Maximum<sup>++</sup> implies W. Hugh Woodin’s axiom (∗), joining two strong axioms that
    each make the continuum exactly ℵ₂. And the mathematics of uncountable sets has found a
    neighbour in computing: in 2023 Anton Bernshteyn showed in <em>Inventiones
    mathematicae</em> that fast distributed algorithms, which colour a network while each node
    sees only its own neighbourhood, yield well-behaved colourings of the bounded-degree graphs
    that descriptive set theorists draw on uncountable spaces.</p>`,
  sources: [
    { text: 'Georg Cantor, “Ueber eine elementare Frage der Mannigfaltigkeitslehre,” <em>Jahresbericht der Deutschen Mathematiker-Vereinigung</em> 1 (1890–91), 75–78; English translation in William Ewald, ed., <em>From Kant to Hilbert</em>, vol. 2 (Oxford University Press, 1996), 920–922', url: 'https://gdz.sub.uni-goettingen.de/id/PPN37721857X_0001' },
    { text: 'A. M. Turing, “On Computable Numbers, with an Application to the Entscheidungsproblem,” <em>Proceedings of the London Mathematical Society</em> (2) 42 (1936–37), 230–265, §8', url: 'https://doi.org/10.1112/plms/s2-42.1.230' },
    { text: 'Kurt Gödel, “The Consistency of the Axiom of Choice and of the Generalized Continuum-Hypothesis,” <em>PNAS</em> 24 (1938), 556–557', url: 'https://doi.org/10.1073/pnas.24.12.556' },
    { text: 'Paul J. Cohen, “The Independence of the Continuum Hypothesis,” <em>PNAS</em> 50 (1963), 1143–1148', url: 'https://doi.org/10.1073/pnas.50.6.1143' },
    { text: 'Peter Koellner, “The Continuum Hypothesis,” <em>Stanford Encyclopedia of Philosophy</em>', url: 'https://plato.stanford.edu/entries/continuum-hypothesis/' },
    { text: 'Joel David Hamkins, “The set-theoretic multiverse,” <em>Review of Symbolic Logic</em> 5 (2012), 416–449', url: 'https://doi.org/10.1017/S1755020311000359' },
    { text: 'David Asperó and Ralf Schindler, “Martin’s Maximum<sup>++</sup> implies Woodin’s axiom (∗),” <em>Annals of Mathematics</em> 193 (2021), 793–835', url: 'https://doi.org/10.4007/annals.2021.193.3.3' },
    { text: 'Jesse Michael Han and Floris van Doorn, “A formal proof of the independence of the continuum hypothesis,” CPP 2020, 353–366', url: 'https://doi.org/10.1145/3372885.3373826' },
    { text: 'Theodore Baker, John Gill and Robert Solovay, “Relativizations of the P&nbsp;=?&nbsp;NP Question,” <em>SIAM Journal on Computing</em> 4 (1975), 431–442', url: 'https://doi.org/10.1137/0204037' },
    { text: 'Joseph Howlett, “The Man Who Stole Infinity,” <em>Quanta Magazine</em> (25 February 2026)', url: 'https://www.quantamagazine.org/the-man-who-stole-infinity-20260225/' },
  ],
  alt: 'An infinite table of binary digits whose rows are rules, with the main diagonal outlined in crimson and the flipped diagonal pinned in a crimson strip beneath it; a second view draws the ladder of infinities, with the visitor’s rules as ticks on a Cantor-set continuum, the diagonal as a crimson mark no line reaches, and a dated timeline of the continuum hypothesis; a third plays a forcing game in which a growing binary condition is traced as a path through the tree of finite strings.',
  prose: `
    <p>A diagonal has humbled arithmetic once before: the <a href="#ex-diagonal">diagonal of
    the simplest square</a>, whose length no ratio of whole numbers could name. In September
    1891, chairing the first meeting of the new German Mathematical Society in Halle, Georg
    Cantor drew a second diagonal, and this one cut deeper. Suppose someone hands us an infinite
    list of infinite binary sequences, s₀, s₁, s₂, …, one per row, forever. A list is the
    <a href="#ex-tally">herder’s oldest trick</a>, a pairing-off with one sequence per counting
    number and nothing left over, and it is exactly that pairing the diagonal is about to break.
    Read down the main diagonal and flip every bit: <code>d(n) = 1 − sₙ(n)</code>. This
    <em>d</em> is a perfectly respectable binary sequence, and it cannot be anywhere in the
    list. It differs from row 0 at position 0, from row 1 at position 1, from row <em>n</em> at
    position <em>n</em>: one guaranteed typo per row, placed exactly where no rearrangement can
    patch it. Cantor wrote his two symbols as <em>m</em> and <em>w</em>, not 0 and 1. The
    alphabet does not matter, and that indifference is the point. No list contains every
    sequence, so the set of infinite binary sequences, and with it the real line, is
    <em>uncountable</em>.</p>
    <p>It was his second proof that the reals outrun the integers, and the first had gone by
    post. On 29 November 1873 Cantor asked Richard Dedekind, in Braunschweig, whether the whole
    numbers and the real numbers could be paired one to one; on 7 December he sent a proof that
    they cannot. The result appeared in Crelle’s <em>Journal</em> in 1874 under a mild title
    about algebraic numbers, and on Karl Weierstrass’s advice the theorem that mattered most went
    in only as a remark added in proof. Two of the paper’s arguments were Dedekind’s, printed “almost word for word,” as he
    noted privately, under Cantor’s name alone, and Dedekind did not write to him again for
    nearly three years. His letter of 30 November 1873, long presumed lost, turned up among
    Cantor’s family papers at the University of Halle in March 2025. The argument of 1891 needs
    none of that machinery, no limits and no nested intervals, only a list and the will to
    disagree with it.</p>
    <p>The table below is a real one, and its rows are rules, not ink. Each row is a small
    program that answers, for any index <em>n</em> you name, what its <em>n</em>th digit is:
    all zeros; a pattern of yours, repeated; the binary digits of <code>1/3</code>; the
    Thue–Morse sequence; the characteristic function of the primes. Your finitely many rules
    are listed forever in rotation, row <em>n</em> being rule <em>n</em> mod <em>k</em>, so the
    table honestly owns a row for every natural number. Because rows are rules, everything is
    computable anywhere: jump to position 1,000,000, or to a googol, and the exhibit evaluates
    that row at that digit the moment you ask. The crimson strip is the diagonal computed
    against your own enumeration. It is not an animation of the argument; it is the argument.
    Every row here is a program, and programs can be counted: “the computable sequences and
    numbers are therefore enumerable,” Alan Turing wrote in 1936. The rules anyone could ever
    write form a countable island, and almost every real number lies off its shore.</p>
    <p>Then comes the counterattack everyone invents within a minute: the diagonal looks like
    just another rule, because it <em>is</em> one. “Ask row <em>n</em> for digit <em>n</em>; say
    the opposite” is a one-line program, no grander than “the digits of 1/3.” So absorb it.
    Insert <em>d</em> as row 0 and let the list swallow its escapee. The insertion costs one
    array operation, and that cheapness is the whole lesson: the enlarged list has its own
    diagonal, the same line of spite pointed at the new indexing, and it differs from your
    captured <em>d</em> at position 0 before you have finished feeling clever. The counter keeps
    score, and the score is always theorem 1, you 0. The diagonal does not search, guess or
    understand your rules. It asks each row one question and disagrees with the answer, and
    that is enough to defeat every list there will ever be.</p>
    <p>Turing wrote the same line, nearly symbol for symbol, in the eighth section of that 1936
    paper: “Let β be the sequence with 1 − φ<sub>n</sub>(n) as its <em>n</em>-th figure.” He aimed it at
    the list of every computable sequence, where the flip is as cheap as ever. What fails there
    is the list, which no machine can write out, because no machine can tell which programs
    will go on printing digits forever. Try it below with the paradox row, a row that copies the
    diagonal of the very list it sits in: at its own index it would have to equal its own
    opposite. Turing’s version of the impasse ends “1 = 2φ<sub>K</sub>(K), i.e. 1 is even. This
    is impossible,” the same clash of odd and even that ruled out a fraction for the square’s
    diagonal. The <a href="#ex-beavers">third detonation</a> begins in that sentence.</p>
    <p>Zoom out and the trick detonates at every scale. Cantor’s theorem in full says that for
    <em>every</em> set X there is no surjection from X onto its power set P(X): the diagonal
    argument again, word for word, with “position <em>n</em>” replaced by “element <em>x</em>.”
    So the infinities climb an endless ladder, ℵ₀ &lt; 2<sup>ℵ₀</sup> &lt;
    2<sup>2<sup>ℵ₀</sup></sup> &lt; …, the beth numbers ℶ₀, ℶ₁, ℶ₂, …, with no top rung. Size is
    stranger than it looks. In 1877 Cantor matched a line segment one to one with a whole square
    and wrote to Dedekind, “I see it, but I don’t believe it!” The plane earns no higher rung
    than the line; only the power set climbs. Between the first two rungs sits the oldest open
    wound in set theory. The <em>continuum hypothesis</em>, Cantor’s conjecture of 1878 and the
    first problem on David Hilbert’s list of 1900, says there is no size strictly between ℵ₀ and
    2<sup>ℵ₀</sup>. In 1938 Kurt Gödel announced, and in a monograph of 1940 proved in full,
    that the standard axioms of set theory, ZFC, cannot disprove it: inside his constructible
    universe <em>L</em>, CH holds. In 1963 Paul Cohen, a young professor at Stanford, showed
    that ZFC cannot prove it either, by inventing <em>forcing</em>, a way of building worlds in
    which it fails. Gödel wrote to him that the proof was “really a delight” and that “in all
    essential respects you have given the best possible proof.” Each result holds relative to
    the consistency of ZFC itself. The axioms we actually use cannot see whether the gap is
    empty.</p>
    <p>The third panel lets you play a finger-shadow of Cohen’s method. Grow a finite string of
    bits, a <em>condition</em>, which only ever gets longer. The machine deals demands, each one
    <em>dense</em>: a requirement that no finite condition can be blocked from meeting. Meet
    them all and you will have forced into existence a real that escapes your entire ground
    list, using nothing but patience. Patience is also the theorem. The Rasiowa–Sikorski lemma
    says that any countable family of dense demands can be met by one ever-growing condition,
    card after card, forever, and Cohen’s generic reals are this game played to the end against
    a countable model of set theory, whose dense sets, counted from outside, are only countably
    many. What forcing means for the <em>truth</em> of CH, and whether that question even has a
    truth to find, is a live dispute among working set theorists. It waits below, behind the
    label that marks where theorem ends and conviction begins.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    /* ---------- house type & colour for canvas text ---------- */
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep default */ }
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const fnt = (px, fam = MONO, st = '') => `${st ? st + ' ' : ''}${px}px ${fam}`;
    const FAINT = '#8a8676';                              // --ink-faint, legible as text
    const GHOST = P.inkGhost || '#4a4840';
    const CRIM_T = P.crimsonBright || '#d97a68';
    const VERDIGRIS = P.verdigris || '#62b3a4';
    const R = (v) => Math.max(0, v);
    const crisp = (v) => Math.round(v) + 0.5;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const rgba = (hex, a) => {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp01(a)})`;
    };
    const absB = (x) => (x < 0n ? -x : x);
    const modB = (a, b) => ((a % b) + b) % b;
    const HUES = [P.gold, P.azure, P.verdant, VERDIGRIS, P.goldBright, P.azureDim, P.inkDim, P.goldDim];

    /* ---------- state ---------- */
    let dirty = true;
    let hueNext = 0;
    const tint = (r) => {
      if (!r.hue) {
        r.hue = r.type === 'diagonal' ? P.crimson : r.type === 'paradox' ? CRIM_T
          : HUES[hueNext++ % HUES.length];
      }
      return r;
    };
    let rows = starterRows().map(tint);
    let gen = 1;                  // generation of the current diagonal
    let diag = null;              // ALWAYS the diagonal of the current list (shown after reveal)
    let revealed = false;
    let attempts = 0;             // absorptions performed
    let mode = 'list';            // 'list' | 'tower' | 'forcing'
    let focusN = null;            // BigInt index under inspection, or null
    let anchor = null;            // BigInt label origin once indices grow large
    const view = { col: 0n, row: 0n, fx: 0, fy: 0 };
    let pulse = 0;                // strip glow after reveal/absorb
    let anim = null;              // absorb slide { t, dur }
    let revealAnim = null;        // falling digits { t, end, items }
    let trans = null;             // mode transition { t, dur, from, to }
    let cantorLetters = false;    // draw digits as Cantor's m and w
    let listVersion = 0;
    let tlSel = -1;               // selected timeline entry in the tower
    const cache = new Map();      // "m:n" -> 0|1|⊥  (cleared on any list change)

    const remint = () => { diag = tint(makeDiagonal(rows, gen)); };
    remint();

    // audio
    const bus = audio.createBus('cantor');
    const STEP = 0.19;            // seconds per diagonal step on the walk
    let player = null;            // scheduler for the walk
    let edgeQueue = [];           // { n: BigInt, at: audioTime }
    let playN = null, playAt = 0, walked = 0;

    // forcing game
    let fGround = null;           // deep-frozen snapshot of the list at game start
    let fVersion = -1;
    let fCond = [];               // the condition: finite 0/1 string
    let fCards = [];              // dealt requirement cards
    let fWaves = [];              // undealt waves
    let fWon = false;
    let fPreview = null, fPreviewBits = [];
    let auto = null;              // Rasiowa–Sikorski autopilot { t, i }

    // reduced motion: decorative motion only; computations the visitor starts still run
    let RM = false, mql = null;
    const onRM = () => { RM = !!(mql && mql.matches); dirty = true; };
    try {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      RM = mql.matches;
      if (mql.addEventListener) mql.addEventListener('change', onRM);
    } catch { mql = null; }

    /* ---------- scoped style ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-cantor .exhibit-stage canvas:focus-visible, #ex-cantor canvas:focus-visible {
        outline: 2px solid ${P.goldBright}; outline-offset: 2px; }
      #ex-cantor input.dg-in { background:${P.bg}; border:1px solid ${P.line}; color:${P.ink};
        font:13px ${MONO}; padding:6px 9px; border-radius:6px; width:172px; max-width:100%; }
      #ex-cantor input.dg-in:focus { outline:none; border-color:${P.gold}; }
      #ex-cantor .dg-key { display:none; flex-wrap:wrap; gap:4px 14px; margin:8px 2px 0;
        font-size:12.5px; line-height:1.4; color:${P.inkDim}; }
      #ex-cantor .dg-key.on { display:flex; }
      #ex-cantor .dg-key span { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
      #ex-cantor .dg-key i { width:3px; height:12px; border-radius:1px; display:inline-block; }
      #ex-cantor .dg-key b { font:500 11px ${MONO}; color:${FAINT}; }
      #ex-cantor .dg-key .anc { color:${P.goldBright}; font:11px ${MONO}; }
      #ex-cantor .dg-presets { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
      #ex-cantor .dg-cards { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 4px; }
      #ex-cantor .dg-card { border:1px solid ${P.line}; background:${P.panel}; border-radius:8px;
        padding:8px 10px; font-size:13px; line-height:1.45; color:${P.inkDim}; max-width:260px;
        display:flex; flex-direction:column; gap:6px; align-items:flex-start;
        transition: border-color .35s, color .35s; }
      #ex-cantor .dg-card.met { border-color:${P.verdant}66; color:${P.ink}; }
      #ex-cantor .dg-card.preview { border-color:${P.azure}88; }
      #ex-cantor .dg-card .tick { color:${P.verdant}; }
      #ex-cantor .dg-cond { font:13px ${MONO}; letter-spacing:0.08em;
        word-break:break-all; background:${P.bg}; border:1px solid ${P.line}; border-radius:6px;
        padding:8px 10px; margin-top:8px; color:${P.azure}; min-height:1.3em; }
      #ex-cantor .dg-fnote { font-size:13px; color:${P.inkDim}; font-style:italic;
        margin:10px 0 0; line-height:1.55; }
      #ex-cantor .dg-stale { font-size:13px; color:${P.goldBright}; margin:8px 0 0; display:none;
        align-items:center; gap:10px; flex-wrap:wrap; }
      #ex-cantor .dg-victory { border-left:2px solid ${P.verdant}; padding:8px 12px;
        margin-top:10px; color:${P.ink}; font-size:14px; line-height:1.6; display:none; }
      #ex-cantor .dg-card, #ex-cantor .dg-key, #ex-cantor .dg-victory, #ex-cantor .dg-stale {
        font-variant-numeric: lining-nums; }       /* binary strings: 0 must never read as o */
      @media (prefers-reduced-motion: reduce) { #ex-cantor .dg-card { transition:none; } }`;
    stage.appendChild(style);

    /* ---------- layout ---------- */
    const quest = ui.questBanner(stage, '');
    const cvOpts = { height: 480 };
    const handle = cv.setupCanvas(stage, cvOpts);
    const cvEl = handle.canvas;
    cvEl.tabIndex = 0;
    // a figure that takes its own arrow keys, so screen readers pass them through
    cvEl.setAttribute('role', 'application');
    cvEl.setAttribute('aria-roledescription', 'interactive figure');
    const keyDiv = document.createElement('div');
    keyDiv.className = 'dg-key';
    stage.appendChild(keyDiv);

    const modeRow = ui.controlRow(stage);
    const modeBtns = {};
    modeBtns.list = ui.button(modeRow, 'the list', () => setMode('list'), { small: true });
    modeBtns.tower = ui.button(modeRow, 'the tower', () => setMode('tower'), { small: true });
    modeBtns.forcing = ui.button(modeRow, 'the forcing game', () => setMode('forcing'), { small: true });
    for (const b of Object.values(modeBtns)) b.setAttribute('aria-pressed', 'false');

    const rowA = ui.controlRow(stage);
    const revealBtn = ui.button(rowA, 'reveal the diagonal', reveal, { primary: true });
    const absorbBtn = ui.button(rowA, 'fine — insert the diagonal as row 0', absorb, { primary: true });
    const walkBtn = ui.button(rowA, '▶ walk the diagonal', toggleWalk);
    ui.button(rowA, '⌂ home', goHome, { small: true });
    ui.toggle(rowA, {
      label: 'Cantor’s letters, m and w',
      value: false,
      onChange: (v) => { cantorLetters = v; dirty = true; updateTexts(); },
    });
    absorbBtn.style.display = 'none';
    walkBtn.style.display = 'none';

    const rowB = ui.controlRow(stage);
    let pendingType = 'zeros';
    ui.select(rowB, {
      label: 'new row (a rule, not data)',
      options: [
        { value: 'zeros', label: 'all zeros' },
        { value: 'ones', label: 'all ones' },
        { value: 'periodic', label: 'periodic pattern…' },
        { value: 'rational', label: 'a rational p/q in binary…' },
        { value: 'thueMorse', label: 'Thue–Morse' },
        { value: 'primes', label: 'the primes: 1 at each, else 0' },
        { value: 'squares', label: 'the perfect squares: 1 at each' },
        { value: 'powersOfTwo', label: 'the powers of 2: 1 at each' },
        { value: 'champernowne', label: 'binary Champernowne' },
        { value: 'paint', label: 'paint 64 digits, repeat' },
        { value: 'paradox', label: 'the paradox row: copy the diagonal' },
      ],
      value: 'zeros',
      onChange: (v) => { pendingType = v; refreshParam(); },
    });
    const paramWrap = document.createElement('div');
    paramWrap.className = 'ctl';
    const paramLab = document.createElement('div');
    paramLab.className = 'ctl-label';
    paramLab.textContent = 'parameter';
    const paramIn = document.createElement('input');
    paramIn.className = 'dg-in';
    paramIn.setAttribute('aria-label', 'rule parameter');
    paramWrap.appendChild(paramLab);
    paramWrap.appendChild(paramIn);
    rowB.appendChild(paramWrap);
    ui.button(rowB, '+ add row', addRow);
    ui.button(rowB, '− last row', removeRow, { small: true });
    ui.button(rowB, 'reset the list', resetList, { small: true });
    paramIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addRow(); });

    function refreshParam() {
      const need = pendingType === 'periodic' || pendingType === 'rational';
      paramWrap.style.display = need ? '' : 'none';
      paramIn.placeholder = pendingType === 'periodic' ? 'e.g. 0110' : 'e.g. 3/7';
    }
    refreshParam();

    const rowC = ui.controlRow(stage);
    const jumpWrap = document.createElement('div');
    jumpWrap.className = 'ctl';
    const jumpLab = document.createElement('div');
    jumpLab.className = 'ctl-label';
    jumpLab.textContent = 'jump to index n';
    const jumpIn = document.createElement('input');
    jumpIn.className = 'dg-in';
    jumpIn.placeholder = 'e.g. 10^6, googol';
    jumpIn.setAttribute('aria-label', 'jump to index n');
    jumpWrap.appendChild(jumpLab);
    jumpWrap.appendChild(jumpIn);
    rowC.appendChild(jumpWrap);
    ui.button(rowC, 'go: check the mismatch', () => doJump());
    const presets = document.createElement('div');
    presets.className = 'dg-presets';
    rowC.appendChild(presets);
    for (const [lab, val] of [['10⁶', '1000000'], ['3×10¹²', '3e12'], ['a googol', 'googol']]) {
      ui.button(presets, lab, () => { jumpIn.value = val; doJump(); }, { small: true });
    }
    jumpIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJump(); });

    // forcing panel (DOM); hidden until that mode
    const fPanel = document.createElement('div');
    stage.appendChild(fPanel);
    fPanel.style.display = 'none';
    const fIntro = document.createElement('p');
    fIntro.className = 'dg-fnote';
    fIntro.innerHTML =
      'A <em>condition</em> is a finite binary string, yours, below. It only ever grows: ' +
      'that is the partial order. Each card names a <em>dense set</em>, a demand no finite ' +
      'condition can be blocked from meeting. There is no undo, and you will not need one.';
    fPanel.appendChild(fIntro);
    const staleDiv = document.createElement('div');
    staleDiv.className = 'dg-stale';
    const staleTxt = document.createElement('span');
    staleTxt.textContent = 'Your list has changed since this game was dealt.';
    staleDiv.appendChild(staleTxt);
    ui.button(staleDiv, 'deal against the new list', () => startForcing(), { small: true });
    fPanel.appendChild(staleDiv);
    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'dg-cards';
    fPanel.appendChild(cardsDiv);
    const fRow = ui.controlRow(fPanel);
    ui.button(fRow, 'append 0', () => appendBits([0]));
    ui.button(fRow, 'append 1', () => appendBits([1]));
    ui.button(fRow, 'restart the game', () => startForcing(), { small: true });
    const autoBtn = ui.button(fRow, 'keep dealing, forever', toggleAuto, { small: true });
    autoBtn.style.display = 'none';
    const condDiv = document.createElement('div');
    condDiv.className = 'dg-cond';
    fPanel.appendChild(condDiv);
    const victoryDiv = document.createElement('div');
    victoryDiv.className = 'dg-victory';
    fPanel.appendChild(victoryDiv);

    const readout = ui.readout(stage, '');
    const capEl = ui.caption(stage, '');

    ui.legendPanel(stage, `
      <p>Cantor paid for his infinities, as the story is usually told. Leopold Kronecker, the
      reigning power of Berlin mathematics, is remembered calling him a “scientific charlatan,”
      a “renegade” and a “corrupter of youth,” and working to keep his papers out of print; the
      famous aphorism <em>“God made the integers; all the rest is the work of man”</em> reaches
      us secondhand, through Heinrich Weber’s memorial essay on Kronecker, which quotes a lecture
      of 1886. What is documented is plainer: the paper Cantor sent to Crelle’s <em>Journal</em> in
      1877 met Kronecker’s suspicion and stalled for months; Cantor wanted to withdraw it,
      Dedekind talked him out of it, and it appeared in 1878. Cantor suffered his first known depression in May 1884; from 1899 he was in
      and out of sanatoriums, and he died in one, in Halle, on 6 January 1918. Whether the
      attacks brought on the illness, or a bipolar disorder did, is still argued. The fullest
      reply is fully documented: <em>“No one shall expel us from the paradise that Cantor has
      created,”</em> said David Hilbert, lecturing at Münster on 4 June 1925.</p>`);

    ui.speculationPanel(stage, `
      <p>Independence closed the ZFC case but not the conversation: is CH nonetheless
      <em>true</em>? Here working set theorists part ways. Joel David Hamkins’s
      <em>multiverse</em> view holds that the many worlds forcing builds are all equally real,
      and CH holds in some and fails in others; on his view the question is already settled
      “by our extensive knowledge about how it behaves in the multiverse,” and can no longer be
      settled in the way Cantor and Hilbert hoped. <em>Universe</em> views hold that one
      canonical universe of sets is the real one, and that stronger axioms will someday decide
      CH inside it. Two hard theorems point the same way. Matthew Foreman, Menachem Magidor and
      Saharon Shelah proved in 1988 that Martin’s Maximum, a maximal forcing axiom, implies
      2<sup>ℵ₀</sup> = ℵ₂, and David Asperó and Ralf Schindler proved in the <em>Annals of
      Mathematics</em> in 2021 that its strengthening MM<sup>++</sup> implies W. Hugh Woodin’s
      axiom (∗), which also makes the continuum ℵ₂. The sharpest twist belongs to Woodin
      himself. He proposed (∗) in the 1990s believing CH false; by the early 2010s he had
      changed his mind, and in 2021, when <em>Quanta Magazine</em> reported the new theorem,
      he held that the continuum is ℵ₁, just as Cantor guessed, as it is in the universe his
      Ultimate-L conjecture describes. The theorems are theorems. Whether they are
      <em>evidence</em>, whether CH has a determinate truth value at all, is philosophy, and
      this panel is the label saying so.</p>`);

    /* ---------- caches & helpers ---------- */

    const hasParadox = () => rows.some((r) => r.type === 'paradox');
    const sym = (v) => (v === BOT ? '⊥' : cantorLetters ? (v ? 'w' : 'm') : String(v));

    function cellVal(m, n) {
      const key = m.toString() + ':' + n.toString();
      let v = cache.get(key);
      if (v === undefined) {
        v = enumAt(rows, m).eval(n);
        if (cache.size > 24000) cache.clear();
        cache.set(key, v);
      }
      return v;
    }

    function listChanged() {
      cache.clear();
      listVersion++;
      remint();
      renderKey();
      dirty = true;
    }

    /* ---------- text management ---------- */

    const ESCALATE = [
      `The diagonal <em>d</em> is one act of spite repeated forever: whatever row <em>n</em>
       says at position <em>n</em>, say the opposite. Check it anywhere; the mismatch is
       computed the moment you look, not staged in advance.`,
      `Reindexed in an instant. Your old diagonal sits obediently at row 0, and the new
       diagonal already differs from it at position 0. One array insert bought you nothing.`,
      `Again. Notice the economics: absorbing the escapee costs one line of code, and
       escaping costs one line of code. That exchange rate will never change.`,
      `You could do this a thousand times; you could do it forever, and the tower of absorbed
       diagonals would itself be a list, with its own diagonal. The escape is not a race.
       It is a theorem.`,
      `Every list you will ever write was lost before you wrote it. The diagonal is not
       clever; it is the shape of the gap between a set and its power set.`,
    ];

    function updateTexts() {
      const k = rows.length;
      cvEl.setAttribute('aria-label', mode === 'list'
        ? `An infinite table of binary digits whose rows are your ${k} rules, repeated forever, ` +
          `with the main diagonal outlined${revealed ? ' and its flip pinned in the crimson strip below' : ''}. ` +
          `Arrow keys pan; Enter checks the diagonal at the current position.`
        : mode === 'tower'
          ? 'The ladder of infinities: the whole numbers, the continuum drawn as a Cantor set with each ' +
            'of your rules at its address and the diagonal unreached, and every set of real numbers above; ' +
            'beside them a dated record of the continuum hypothesis. Arrow keys step through the record.'
          : 'The forcing game: your frozen ground list, your growing condition, and the tree of finite ' +
            'conditions with your path through it. Press 0 or 1 to append a bit.');
      if (mode === 'list') {
        const mw = cantorLetters ? ' Cantor’s letters are on: <em>m</em> and <em>w</em> stand in for 0 and 1, as his two symbols did in 1891.' : '';
        if (!revealed) {
          quest.set(`Build a list meant to contain <em>every</em> infinite binary sequence. ` +
            `Row <em>n</em> is your rule <em>n</em> mod ${k}, so there is a row for every ` +
            `index. When you believe in it, reveal the diagonal.`);
          capEl.innerHTML = `Rows are rules: each answers at any index, so the table is a ` +
            `genuine infinite object, interrogated live. Add rules, paint one, drag to pan or ` +
            `use the arrow keys, then reveal what waits below.` + mw;
        } else {
          quest.set(hasParadox()
            ? `The paradox row copies the diagonal of its own list, and at its own index it would have to equal its own opposite: ⊥.`
            : attempts === 0
              ? `The diagonal differs from row <em>n</em> at position <em>n</em>, for every ` +
                `<em>n</em>, forever. Jump anywhere and check. Then try the obvious counterattack.`
              : `Attempt ${attempts}: ${attempts} diagonal${attempts > 1 ? 's' : ''} absorbed, ` +
                `and the newest one has already escaped. This will not end.`);
          capEl.innerHTML = (hasParadox()
            ? `Wherever <em>d</em> must consult the paradox row, the program asks itself what ` +
              `it is about to say and never returns; we cut the loop and mark the cell ⊥. The ` +
              `row names no sequence at all, which is Turing’s point: a list that could hold ` +
              `its own diagonal cannot be written out by any machine.`
            : attempts < ESCALATE.length
              ? ESCALATE[attempts]
              : `Attempt ${attempts}. Each absorption makes a new list, and every list is lost ` +
                `the moment it exists. That is what <em>uncountable</em> means: not “very many,” ` +
                `but “more than any list.”`) + mw;
        }
        absorbBtn.textContent = attempts === 0 ? 'fine — insert the diagonal as row 0' : 'absorb it again';
        if (!player) defaultReadout();
      } else if (mode === 'tower') {
        quest.set(`One rung per power set. The ladder has no top; the first gap has no answer in ZFC.`);
        capEl.innerHTML = `Cantor’s theorem: for <em>every</em> set X there is no surjection ` +
          `X → P(X), so each rung is strictly outgrown by the next, ℶ₀ = ℵ₀, ℶ₁ = 2<sup>ℵ₀</sup>, ` +
          `ℶ₂, … The fan is your enumeration drawn as a map from the whole numbers into the ` +
          `continuum: however many rows you add, its lines land on finitely many points, and the ` +
          `crimson <em>d</em> is never hit. The dashed gap is the continuum hypothesis, no size ` +
          `strictly between ℵ₀ and 2<sup>ℵ₀</sup>; select a year to read the record.`;
        readout.set(tlSel >= 0 ? TIMELINE[tlSel].text : towerSummary());
      } else {
        if (fWon) quest.done(`Every card met: the real you are forcing escapes your entire ground list.`);
        else quest.set(`Meet every card. Each is dense: no finite condition is ever stuck.`);
        capEl.innerHTML = `Each card is a <em>dense set</em>: whatever finite condition you hold, ` +
          `some extension meets the card. Density is why you cannot be cornered, and density is ` +
          `what Cohen’s method industrializes. Above, your ground list; below, the tree of all ` +
          `finite conditions, where your condition is a path from the root. Where it parts from a ` +
          `row’s path the crimson dot marks a mismatch, and paths that part never meet again.`;
      }
    }

    function defaultReadout() {
      const k = rows.length;
      readout.set(`${k} rules · row n = rule (n mod ${k}) · ` +
        (revealed ? `d(n) = 1 − sₙ(n), pinned in crimson below` : `the diagonal is not yet revealed`) +
        ` · drag the table, click any cell`);
    }

    function towerSummary() {
      const k = rows.length;
      if (hasParadox()) {
        return `${k} rules, one of them the paradox row, which names no sequence and lands nowhere; ` +
          `with it in the list, d is undefined at every ${k}th digit and names no point either`;
      }
      let best = 0, bestL = -1;
      rows.forEach((r, j) => { const L = commonPrefix(r, diag, 64); if (L > bestL) { bestL = L; best = j; } });
      return `${k} rules, so the whole numbers land on at most ${k} points of the continuum · ` +
        `d lands on none: the nearest, rule #${best}, “${rows[best].label}”, agrees with d on ` +
        `${bestL} digit${bestL === 1 ? '' : 's'} and parts at digit ${bestL}`;
    }

    function explainDiag(n, sound) {
      const k = BigInt(rows.length);
      const j = Number(modB(n, k));
      const rule = rows[j];
      const s = cellVal(n, n);
      if (s === BOT) {
        readout.setHTML(`row ${fmtLong(n)} is the paradox row: it must copy d(n) = 1 − (its own ` +
          `digit n). No bit equals its own opposite, so the program calls itself forever and we ` +
          `mark the cell ⊥. Turing, 1936: “Putting n = K, we have 1 = 2φ<sub>K</sub>(K), i.e. 1 is ` +
          `even. This is impossible.”`);
        if (sound) thud();
        return;
      }
      let txt = `row ${fmtLong(n)} is rule #${j}, “${rule.label}” · sₙ(n) = ${sym(s)}`;
      if (revealed) txt += ` · d(n) = ${sym(1 - s)}, so d differs from this row at this very position, as promised`;
      if (rule.type === 'primes' && n === MR_DETERMINISTIC_BOUND) {
        txt += ` · this number fools Miller–Rabin on all 13 prime bases up to 41; base 43 exposes it, and it is 1,287,836,182,261 × 2,575,672,364,521`;
      } else if (rule.type === 'primes' && n >= MR_DETERMINISTIC_BOUND) {
        txt += ` · this high, “the primes” answers by Miller–Rabin on the 14 prime bases 2 to 43: a proof below 3.3×10²⁴, a strong probable-prime verdict above it`;
      }
      readout.set(txt);
      if (sound && revealed) pingFlip(s);
    }

    function explainCell(m, n) {
      const rule = enumAt(rows, m);
      const v = cellVal(m, n);
      audio.ensureAudio();
      if (v === BOT) { thud(); explainDiag(n, false); return; }
      audio.playTone(bus, { freq: v ? 660 : 330, dur: 0.07, level: 0.15 });
      readout.set(`row ${fmtLong(m)}, position ${fmtLong(n)} · rule “${rule.label}” answers ${sym(v)}` +
        (m === n && !revealed ? ' · a diagonal cell: reveal d to see it flipped' : ''));
    }

    function renderKey() {
      const compact = handle.width < 560;
      const show = compact && (mode === 'list' || mode === 'forcing');
      keyDiv.classList.toggle('on', show);
      if (!show) return;
      const list = mode === 'forcing' && fGround ? fGround : rows;
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      let html = '';
      if (mode === 'list' && anchor !== null && bigMode) html += `<span class="anc">N = ${esc(fmtLong(anchor))}</span>`;
      list.forEach((r, j) => {
        html += `<span><i style="background:${r.hue || P.inkDim}"></i><b>#${r.origIndex ?? j}</b>${esc(r.label)}</span>`;
      });
      keyDiv.innerHTML = html;
    }

    /* ---------- audio ---------- */

    function pingFlip(s) {
      audio.ensureAudio();
      const t = bus.context.currentTime + 0.02;
      audio.playTone(bus, { freq: s ? 392 : 196, dur: 0.12, level: 0.22, when: t });
      audio.playTone(bus, { freq: s ? 233.1 : 466.2, dur: 0.2, level: 0.42, type: 'triangle', when: t + 0.11 });
    }

    function thud() {
      audio.ensureAudio();
      const t = bus.context.currentTime + 0.02;
      audio.playTone(bus, { freq: 116.5, dur: 0.22, level: 0.3, type: 'triangle', when: t });
      audio.playTone(bus, { freq: 123.5, dur: 0.22, level: 0.25, type: 'triangle', when: t });
    }

    function stopPlay() {
      if (player) { player.stop(); player = null; }
      edgeQueue = [];
      playN = null;
      view.fx = 0; view.fy = 0;              // settle the view on whole cells
      walkBtn.textContent = '▶ walk the diagonal';
      dirty = true;
    }

    // Walk the diagonal forever: the scheduler never returns null, the view
    // follows the note on the audio clock, and every step is a checked mismatch.
    function toggleWalk() {
      if (!revealed) return;
      if (player) { stopPlay(); defaultReadout(); return; }
      audio.ensureAudio();
      const start = view.col > view.row ? view.col : view.row;
      view.col = view.row = start; view.fx = view.fy = 0;
      let nextN = start;
      walked = 0;
      player = audio.createScheduler((t) => {
        const n = nextN;
        nextN += 1n;
        const s = cellVal(n, n);
        if (s === BOT) {
          audio.playTone(bus, { freq: 116.5, dur: 0.12, level: 0.2, type: 'triangle', when: t });
        } else {
          // first the row's own bit, softly; then the flipped diagonal bit, accented
          audio.playTone(bus, { freq: s ? 392 : 196, dur: 0.1, level: 0.14, when: t });
          audio.playTone(bus, { freq: s ? 233.1 : 466.2, dur: 0.15, level: 0.34, type: 'triangle', when: t + 0.085 });
        }
        edgeQueue.push({ n, at: t });
        return t + STEP;
      });
      player.start();
      walkBtn.textContent = '■ stop the walk';
    }

    function chime() {
      audio.ensureAudio();
      const t = bus.context.currentTime + 0.02;
      audio.playTone(bus, { freq: 523.25, dur: 0.12, level: 0.26, when: t });
      audio.playTone(bus, { freq: 659.25, dur: 0.2, level: 0.26, when: t + 0.1 });
    }

    /* ---------- actions ---------- */

    function reveal() {
      if (revealed) return;
      revealed = true;
      audio.ensureAudio();
      revealBtn.style.display = 'none';
      absorbBtn.style.display = '';
      walkBtn.style.display = '';
      pulse = 1;
      const s0 = cellVal(0n, 0n);
      if (s0 !== BOT) pingFlip(s0);
      if (!RM && mode === 'list') {
        // each visible diagonal digit falls to the strip and flips in flight
        const M = metrics();
        const dRC = view.row - view.col;
        const delta = absB(dRC) < 100000n ? Number(dRC) : null;
        const stagger = Math.min(0.045, 0.6 / Math.max(1, M.visCols));
        const items = [];
        for (let c = 0; c <= M.visCols; c++) {
          const r = delta === null ? -99 : c - delta;
          const vis = r >= 0 && r <= M.visRows;
          items.push({ c, from: vis ? M.HEAD + (r - view.fy) * M.CELL + M.CELL / 2 : null, delay: c * stagger });
        }
        revealAnim = { t: 0, items, fall: 0.55, end: M.visCols * stagger + 0.7 };
      }
      updateTexts();
      dirty = true;
    }

    function absorb() {
      if (!revealed || anim) return;
      if (hasParadox()) {
        readout.set('the paradox row leaves d undefined at its own index, so there is no sequence to absorb; remove it first (− last row)');
        return;
      }
      audio.ensureAudio();
      stopPlay();
      revealAnim = null;
      focusN = null;
      anchor = null;
      view.col = 0n; view.row = 0n; view.fx = 0; view.fy = 0;
      anim = { t: 0, dur: RM ? 0 : 0.6 };
      const t0 = bus.context.currentTime + 0.02;
      audio.playTone(bus, { freq: 494, dur: 0.16, level: 0.26, when: t0 });
      audio.playTone(bus, { freq: 330, dur: 0.16, level: 0.26, when: t0 + 0.13 });
      audio.playTone(bus, { freq: 220, dur: 0.22, level: 0.26, when: t0 + 0.26 });
      dirty = true;
    }

    function finishAbsorb() {
      // The exhibit's central line of code: the escapee becomes row 0 …
      const absorbed = { ...diag, label: `${diagName(gen)} (absorbed)`, absorbed: true };
      rows = [absorbed, ...rows];
      gen++;
      attempts++;
      anim = null;
      pulse = 1;
      // … and listChanged() → remint() mints the new escapee with the same constructor.
      listChanged();
      focusN = 0n;
      updateTexts();
      const was = cellVal(0n, 0n);
      readout.set(`row 0 is now ${absorbed.label} · it says ${sym(was)} at position 0 · the new ` +
        `diagonal ${diagName(gen)} says ${sym(1 - was)} there: escaped at position 0`);
      const t0 = bus.context.currentTime + 0.05;
      audio.playTone(bus, { freq: 466.2, dur: 0.25, level: 0.42, type: 'triangle', when: t0 });
    }

    function addRow() {
      if (rows.length >= 24) { readout.set('24 rows is enough to lose with.'); return; }
      let r = null;
      if (pendingType === 'periodic') {
        const pat = paramIn.value.trim();
        if (!/^[01]{1,32}$/.test(pat)) { readout.set('the pattern must be 1 to 32 characters of 0s and 1s'); return; }
        r = rules.periodic(pat);
      } else if (pendingType === 'rational') {
        const m = /^(\d{1,12})\s*\/\s*(\d{1,12})$/.exec(paramIn.value.trim());
        if (!m || BigInt(m[2]) === 0n) { readout.set('give a fraction like 3/7'); return; }
        r = rules.rational(BigInt(m[1]), BigInt(m[2]));
      } else if (pendingType === 'paradox') {
        if (hasParadox()) { readout.set('one paradox row is enough to break the list'); return; }
        r = rules.paradox(() => diag);
      } else {
        r = rules[pendingType]();
      }
      stopPlay();
      rows.push(tint(r));
      listChanged();
      updateTexts();
      if (r.type === 'paradox') {
        const j = rows.length - 1;
        if (!revealed) reveal();
        readout.set(`added the paradox row as rule #${j}: at every position n ≡ ${j} (mod ${rows.length}) ` +
          `it must copy d(n), which is defined by flipping this very row · look for ⊥ in the table and the strip`);
        return;
      }
      readout.set(`added “${r.label}” as a rule · the enumeration now cycles ${rows.length} rules` +
        (r.type === 'paint' ? ' · click its cells in the table to paint (position mod 64)' : '') +
        (revealed ? ' · the diagonal has already adjusted' : ''));
    }

    function removeRow() {
      if (rows.length <= 1) { readout.set('a list needs at least one row to lose'); return; }
      stopPlay();
      const r = rows.pop();
      listChanged();
      updateTexts();
      readout.set(`removed “${r.label}” · ${rows.length} rules remain, and the diagonal has adjusted`);
    }

    function resetList() {
      stopPlay();
      hueNext = 0;
      rows = starterRows().map(tint);
      gen = 1;
      revealed = false;
      attempts = 0;
      focusN = null;
      anchor = null;
      anim = null;
      revealAnim = null;
      view.col = 0n; view.row = 0n; view.fx = 0; view.fy = 0;
      revealBtn.style.display = '';
      absorbBtn.style.display = 'none';
      walkBtn.style.display = 'none';
      listChanged();
      updateTexts();
    }

    function goHome() {
      view.col = 0n; view.row = 0n; view.fx = 0; view.fy = 0;
      focusN = null;
      anchor = null;
      revealAnim = null;
      dirty = true;
      renderKey();
      if (mode === 'list' && !player) defaultReadout();
    }

    function doJump() {
      if (mode !== 'list') setMode('list');
      const n = parseIndex(jumpIn.value);
      if (n === null) {
        readout.set('give an index like 1000000, 10^6, 3e12 or googol');
        return;
      }
      if (n > MAX_IDX) {
        readout.set('the jump box stops at a googol, 10¹⁰⁰, to keep the table instant while you pan; every rule here would still answer beyond it');
        return;
      }
      stopPlay();
      revealAnim = null;
      focusN = n;
      anchor = n;
      const back = n > 2n ? n - 2n : 0n;
      view.col = back; view.row = back; view.fx = 0; view.fy = 0;
      explainDiag(n, true);
      renderKey();
      dirty = true;
    }

    function setMode(m) {
      if (mode === m) return;
      // snapshot the outgoing view for a short zoom between the two
      if (!RM && handle.width > 0 && cvEl.width > 0) {
        try {
          if (!snap) snap = document.createElement('canvas');
          snap.width = cvEl.width; snap.height = cvEl.height;
          snap.getContext('2d').drawImage(cvEl, 0, 0);
          trans = { t: 0, dur: 0.45, from: mode, to: m };
        } catch { trans = null; }
      }
      mode = m;
      stopPlay();
      stopAuto();
      for (const [name, btn] of Object.entries(modeBtns)) {
        btn.classList.toggle('active', name === m);
        btn.setAttribute('aria-pressed', String(name === m));
      }
      const listUI = m === 'list' ? '' : 'none';
      rowA.style.display = listUI;
      rowB.style.display = listUI;
      rowC.style.display = listUI;
      fPanel.style.display = m === 'forcing' ? '' : 'none';
      cvEl.style.cursor = m === 'list' ? 'grab' : m === 'tower' ? 'pointer' : 'default';
      cvEl.style.touchAction = m === 'list' ? 'none' : 'pan-y';
      if (m === 'forcing') {
        if (!fGround || (fVersion !== listVersion && fCond.length === 0)) startForcing();
        staleDiv.style.display = fVersion !== listVersion ? 'flex' : 'none';
        renderForcing();
      }
      renderKey();
      updateTexts();
      dirty = true;
    }
    let snap = null;

    /* ---------- forcing game ---------- */

    function cardLength(L) {
      return {
        desc: `grow your condition to length ≥ ${L}`,
        test: () => fCond.length >= L,
        meet: () => Array(Math.max(0, L - fCond.length)).fill(0),
      };
    }
    function cardBlock(b) {
      return {
        desc: `make the block ⟨${b}⟩ appear somewhere`,
        test: () => fCond.join('').includes(b),
        meet: () => [...b].map(Number),
      };
    }
    function cardOnes(c) {
      return {
        desc: `place at least ${c} ones`,
        test: () => fCond.reduce((a, b) => a + b, 0) >= c,
        meet: () => Array(Math.max(0, c - fCond.reduce((a, b) => a + b, 0))).fill(1),
      };
    }
    function cardDiffer(rule) {
      return {
        desc: `differ somewhere from row ${rule.origIndex} of your list (${rule.label})`,
        test: () => fCond.some((b, i) => b !== rule.eval(BigInt(i))),
        meet: () => [1 - rule.eval(BigInt(fCond.length))],
      };
    }

    function startForcing() {
      stopAuto();
      // a deep, frozen snapshot: later painting cannot erase a locked-in mismatch
      const plain = [];
      rows.forEach((r, j) => { if (r.type !== 'paradox') plain.push({ r, j }); });
      const frozen = deepFreeze(plain.map((p) => p.r));
      fGround = frozen.map((r, i) => ({ ...r, origIndex: plain[i].j, hue: plain[i].r.hue }));
      fVersion = listVersion;
      fCond = [];
      fWon = false;
      fPreview = null; fPreviewBits = [];
      victoryDiv.style.display = 'none';
      autoBtn.style.display = 'none';
      staleDiv.style.display = 'none';
      const w1 = [cardLength(12), cardBlock('101')];
      if (fGround.length) w1.push(cardDiffer(fGround[0]));
      const w2 = [];
      for (let j = 1; j < Math.min(3, fGround.length); j++) w2.push(cardDiffer(fGround[j]));
      w2.push(cardOnes(8));
      const w3 = [];
      for (let j = 3; j < fGround.length; j++) w3.push(cardDiffer(fGround[j]));
      w3.push(cardLength(40));
      fWaves = [w2, w3];
      fCards = w1;
      for (const c of fCards) c.met = c.test();
      if (mode === 'forcing') updateTexts();
      renderForcing();
      renderKey();
      dirty = true;
    }

    function meetCard(card) {
      if (fPreview !== card) {
        // first show a way to meet it; the visitor decides whether to take it
        fPreview = card;
        fPreviewBits = card.meet();
        renderForcing();
        dirty = true;
        return;
      }
      const bits = fPreviewBits;
      fPreview = null; fPreviewBits = [];
      appendBits(bits);
    }

    function appendBits(bits, quiet = false) {
      if ((fWon && !auto) || !bits.length) return;
      audio.ensureAudio();
      fPreview = null; fPreviewBits = [];
      const t0 = bus.context.currentTime + 0.02;
      bits.forEach((b, i) => {
        fCond.push(b ? 1 : 0);
        if (!quiet && i < 12) audio.playTone(bus, { freq: b ? 587 : 294, dur: 0.05, level: 0.15, when: t0 + i * 0.035 });
      });
      if (auto) { dirty = true; return; }
      let newly = 0;
      for (const c of fCards) { const was = c.met; c.met = c.test(); if (!was && c.met) newly++; }
      if (newly) chime();
      while (fCards.every((c) => c.met) && fWaves.length) {
        const wave = fWaves.shift();
        for (const c of wave) c.met = c.test();
        fCards.push(...wave);
      }
      if (fCards.every((c) => c.met) && !fWaves.length && !fWon) {
        fWon = true;
        victoryDiv.innerHTML =
          `Every card met. Any infinite extension of your string now differs from every row of ` +
          `your ground list, and the mismatches are locked into its finite part forever. You met ` +
          `${fCards.length} dense sets, one at a time. The Rasiowa–Sikorski lemma says the game ` +
          `never has to end: any countable family of dense demands can be met by one ever-growing ` +
          `condition. Cohen’s forcing meets every dense set that lives in a countable model of set ` +
          `theory, and adding ℵ₂ such reals at once makes CH false in the extension. The ` +
          `bookkeeping that keeps the cardinals intact while it happens is where the real work lives.`;
        victoryDiv.style.display = 'block';
        autoBtn.style.display = '';
        chime();
        updateTexts();
      }
      renderForcing();
      dirty = true;
    }

    // Rasiowa–Sikorski, run by machine: an endless enumeration of dense sets,
    // D₀, D₁, …, each met in turn by extending the one condition.
    const shortlex = (i) => { let L = 1, c = 2; while (i >= c) { i -= c; L++; c *= 2; } return i.toString(2).padStart(L, '0'); };
    function autoCard(i) {
      const g = fGround.length ? fGround[(i >> 1) % fGround.length] : null;
      if (i % 2 === 0 || !g) {
        const b = shortlex(i >> 1);
        return {
          desc: `D${sub(i)}: contain the block ⟨${b}⟩ somewhere after position ${i}`,
          test: () => fCond.join('').indexOf(b, i + 1) !== -1,
          meet: () => [...Array(Math.max(0, i + 1 - fCond.length)).fill(0), ...[...b].map(Number)],
        };
      }
      return {
        desc: `D${sub(i)}: differ from row ${g.origIndex} somewhere after position ${i}`,
        test: () => fCond.some((b, p) => p > i && b !== g.eval(BigInt(p))),
        meet: () => {
          const pad = [];
          let at = fCond.length;
          while (at <= i) { pad.push(g.eval(BigInt(at))); at++; }
          return [...pad, 1 - g.eval(BigInt(at))];
        },
      };
    }
    function toggleAuto() {
      if (auto) { stopAuto(); renderForcing(); return; }
      auto = { t: 0, i: 0, card: null };
      autoBtn.textContent = '■ stop dealing';
    }
    function stopAuto() {
      if (!auto) return;
      auto = null;
      autoBtn.textContent = 'keep dealing, forever';
    }
    function autoStep() {
      const card = autoCard(auto.i);
      auto.card = card;
      const already = card.test();
      if (!already) appendBits(card.meet(), true);
      audio.playTone(bus, { freq: already ? 330 : auto.i % 2 ? 587 : 440, dur: 0.05, level: 0.08 });
      auto.i++;
      condDiv.textContent = condText();
      dirty = true;
      readout.set(`Rasiowa–Sikorski, run by machine · dense set ${auto.i} ${already ? 'already' : 'now'} met: ${card.desc} · ` +
        `condition length ${fCond.length}` + (fCond.length >= 1024 ? ' · we stop here; the lemma does not' : ''));
      if (fCond.length >= 1024) { stopAuto(); }
    }

    function condText() {
      if (fCond.length === 0) return '⟨empty condition⟩ · every escape from every list starts at zero bits';
      const s = fCond.length > 160 ? '…' + fCond.slice(-160).join('') : fCond.join('');
      return s.replace(/(.{8})/g, '$1 ').trim() + `   (length ${fCond.length})`;
    }

    function renderForcing() {
      cardsDiv.innerHTML = '';
      for (const card of fCards) {
        const chip = document.createElement('div');
        chip.className = 'dg-card' + (card.met ? ' met' : '') + (fPreview === card ? ' preview' : '');
        const t = document.createElement('div');
        t.innerHTML = (card.met ? '<span class="tick">✓</span> ' : '✦ ') + card.desc;
        chip.appendChild(t);
        if (!card.met) {
          const bits = fPreview === card ? fPreviewBits.join('') : '';
          const lab = fPreview === card
            ? `append ⟨${bits.length > 14 ? bits.slice(0, 12) + '…' : bits}⟩`
            : 'show a way to meet it';
          ui.button(chip, lab, () => meetCard(card), { small: true });
        }
        cardsDiv.appendChild(chip);
      }
      condDiv.textContent = condText();
      readout.set(`condition length ${fCond.length} · cards met ${fCards.filter((c) => c.met).length}/${fCards.length}` +
        (fPreview ? ` · previewing ${fPreviewBits.length} bit${fPreviewBits.length === 1 ? '' : 's'}: click again to append` : '') +
        (fWaves.length ? ` · more cards wait` : fWon ? ` · game over: you won, and so does Cohen` : ` · last wave`));
    }

    /* ---------- drawing: shared ---------- */

    function fit(ctx, text, maxW) {
      if (maxW <= 8) return '';
      if (ctx.measureText(text).width <= maxW) return text;
      while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
      return text + '…';
    }

    // The house serif sets old-style figures, in which 0 reads as o and 1 as ı. In
    // labels that carry binary data, digit runs go in the mono face (lining figures).
    function drawMixed(ctx, text, x, y, px, style = '', maxW = Infinity, align = 'left') {
      const fS = fnt(px, SERIF, style), fM = fnt(Math.round(px * 1.72) / 2, MONO);
      const isNum = (s) => s.charCodeAt(0) >= 48 && s.charCodeAt(0) <= 57;
      const runsOf = (t) => t.split(/(\d+)/).filter(Boolean);
      const width = (runs) => runs.reduce((w, s) => {
        ctx.font = isNum(s) ? fM : fS;
        return w + ctx.measureText(s).width;
      }, 0);
      if (maxW <= 8) return 0;
      if (!/\d/.test(text)) {                         // the common case: one run, one face
        ctx.font = fS;
        const t = maxW === Infinity ? text : fit(ctx, text, maxW);
        const a0 = ctx.textAlign;
        ctx.textAlign = align;
        ctx.fillText(t, x, y);
        ctx.textAlign = a0;
        return ctx.measureText(t).width;
      }
      let runs = runsOf(text), w = width(runs);
      for (let t = text; w > maxW && t.length > 1;) {
        t = t.slice(0, -1);
        runs = runsOf(t.trimEnd() + '…');
        w = width(runs);
      }
      let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      const a = ctx.textAlign;
      ctx.textAlign = 'left';
      for (const s of runs) {
        ctx.font = isNum(s) ? fM : fS;
        ctx.fillText(s, cx, y);
        cx += ctx.measureText(s).width;
      }
      ctx.textAlign = a;
      return w;
    }

    function pill(ctx, x, y, w, h, fill) {
      const r = Math.min(4, h / 2);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    }

    function hatch(ctx, x, y, w, h) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = rgba(P.crimson, 0.14);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = rgba(P.crimson, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -h; k < w; k += 5) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
      ctx.stroke();
      ctx.restore();
    }

    const glowCrim = cv.glowSprite(P.crimson, 44);
    const glowGold = cv.glowSprite(P.goldBright, 40);
    const glowAz = cv.glowSprite(P.azure, 30);

    /* ---------- drawing: the list ---------- */

    let bigMode = false;

    function metrics() {
      const W = handle.width, H = handle.height;
      const compact = W < 560;
      const CELL = compact ? (W < 380 ? 24 : 26) : 30;
      const GUT = compact ? 58 : 210;
      const HEAD = compact ? 26 : 30;
      const stripY = H - CELL - 12;
      const gridBottom = stripY - 22;          // the gap holds the ≠ verdict
      const visRows = Math.max(1, Math.floor((gridBottom - HEAD) / CELL));
      const visCols = Math.max(1, Math.floor((W - GUT) / CELL));
      return { W, H, compact, CELL, GUT, HEAD, stripY, gridBottom, visRows, visCols };
    }

    const offLabel = (n) => {
      const d = n - anchor;
      return d === 0n ? 'N' : d > 0n ? `N+${d}` : `N−${-d}`;
    };

    function drawCell(ctx, x, y, m, n, rule, CELL, compact) {
      const v = cellVal(m, n);
      if (v === BOT) {
        hatch(ctx, x + 1, y + 1, CELL - 2, CELL - 2);
        const f = ctx.font;
        ctx.font = fnt(compact ? 13 : 15, SERIF);
        ctx.fillStyle = CRIM_T;
        ctx.fillText('⊥', x + CELL / 2, y + CELL / 2 + 1);
        ctx.font = f;
        return;
      }
      if (v) { ctx.fillStyle = rgba(P.goldDim, 0.26); ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); }
      ctx.fillStyle = v ? P.ink : rgba(FAINT, 0.78);
      ctx.fillText(sym(v), x + CELL / 2, y + CELL / 2 + (cantorLetters ? -0.5 : 0.5));
      if (rule.type === 'paint') {
        ctx.fillStyle = rgba(P.azure, 0.45);
        ctx.fillRect(x + 6, y + CELL - 4.5, CELL - 12, 1.5);
      }
    }

    function drawList(ctx) {
      const M = metrics();
      const { W, H, compact, CELL, GUT, HEAD, stripY, gridBottom, visRows, visCols } = M;
      ctx.clearRect(0, 0, W, H);
      const p = anim && anim.dur > 0 ? Math.min(1, anim.t / anim.dur) : 0;
      const ease = p * p * (3 - 2 * p);
      const slide = anim ? ease * CELL : 0;

      const lastCol = view.col + BigInt(visCols + 1), lastRow = view.row + BigInt(visRows + 1);
      const hi = lastCol > lastRow ? lastCol : lastRow;
      const wasBig = bigMode;
      bigMode = hi >= (compact ? 10000n : 1000000n);
      if (bigMode && (anchor === null || absB(view.col - anchor) > 100000n || absB(view.row - anchor) > 100000n)) {
        anchor = focusN !== null && absB(view.col - focusN) < 100000n ? focusN : view.col;
      }
      if (wasBig !== bigMode) renderKey();
      const lab = (n) => (bigMode ? offLabel(n) : group(n.toString()));
      const dRC = view.row - view.col;
      const delta = absB(dRC) < 100000n ? Number(dRC) : null;
      const gx = (c) => GUT + (c - view.fx) * CELL;
      const gy = (r) => HEAD + (r - view.fy) * CELL;
      const fc = focusN !== null && focusN >= view.col && focusN - view.col <= BigInt(visCols + 1) ? Number(focusN - view.col) : null;
      const fr = focusN !== null && focusN >= view.row && focusN - view.row <= BigInt(visRows + 1) ? Number(focusN - view.row) : null;

      // --- the grid band ---
      ctx.save();
      ctx.beginPath();
      ctx.rect(GUT, HEAD, R(W - GUT), R(gridBottom - HEAD));
      ctx.clip();
      // focus crosshair (under everything)
      if (fc !== null) { ctx.fillStyle = rgba(P.azure, 0.07); ctx.fillRect(gx(fc), HEAD, CELL, gridBottom - HEAD); }
      if (fr !== null) { ctx.fillStyle = rgba(P.azure, 0.07); ctx.fillRect(GUT, gy(fr) + slide, W - GUT, CELL); }
      // hairline grid
      ctx.strokeStyle = rgba(GHOST, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= visCols + 1; c++) { const x = crisp(gx(c)); ctx.moveTo(x, HEAD); ctx.lineTo(x, gridBottom); }
      for (let r = -1; r <= visRows + 1; r++) { const y = crisp(gy(r) + slide); ctx.moveTo(GUT, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // the diagonal ribbon: fixed in place while the rows slide beneath it
      if (delta !== null) {
        ctx.strokeStyle = revealed ? rgba(P.crimson, 0.12) : rgba(P.inkDim, 0.06);
        ctx.lineWidth = CELL * 0.95;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        const c0 = -3, c1 = visCols + 4;
        ctx.moveTo(gx(c0) + CELL / 2, gy(c0 - delta) + CELL / 2);
        ctx.lineTo(gx(c1) + CELL / 2, gy(c1 - delta) + CELL / 2);
        ctx.stroke();
      }
      // the thread from the inspected diagonal cell down to the strip, under the digits
      if (revealed && !anim && fc !== null && delta !== null && fc - delta >= 0 && fc - delta <= visRows) {
        const xm = crisp(gx(fc) + CELL / 2);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = rgba(P.crimson, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xm, gy(fc - delta) + CELL);
        ctx.lineTo(xm, gridBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // cells
      ctx.font = cantorLetters ? fnt(compact ? 14 : 15, SERIF, 'italic') : fnt(compact ? 11 : 12);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r <= visRows; r++) {
        const m = view.row + BigInt(r);
        const y = gy(r) + slide;
        if (y + CELL < HEAD || y > gridBottom) continue;
        const rule = enumAt(rows, m);
        for (let c = 0; c <= visCols; c++) {
          const n = view.col + BigInt(c);
          const x = gx(c);
          if (x + CELL < GUT || x > W) continue;
          // a digit already falling toward the strip leaves its cell for a moment
          if (revealAnim && m === n) {
            const it = revealAnim.items[c];
            if (it && it.from !== null && revealAnim.t >= it.delay && revealAnim.t < it.delay + revealAnim.fall) continue;
          }
          drawCell(ctx, x, y, m, n, rule, CELL, compact);
        }
      }
      // diagonal outlines
      if (delta !== null) {
        ctx.lineWidth = revealed ? 1.3 : 1;
        ctx.strokeStyle = revealed ? P.crimson : rgba(P.inkDim, 0.4);
        for (let c = -1; c <= visCols + 1; c++) {
          const r = c - delta;
          if (r < -1 || r > visRows + 1) continue;
          ctx.strokeRect(gx(c) + 1.5, gy(r) + 1.5, CELL - 3, CELL - 3);
        }
      }
      // the walk's playhead on its diagonal cell
      if (playN !== null && delta !== null && playN >= view.col) {
        const c = Number(playN - view.col);
        if (c <= visCols + 1) {
          const x = gx(c), y = gy(c - delta);
          glowGold.draw(ctx, x + CELL / 2, y + CELL / 2, 0.8);
          ctx.fillStyle = rgba(P.bg, 0.55);
          ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.6;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
          const v = cellVal(playN, playN);          // the row’s own digit, legible over the glow
          ctx.fillStyle = v === BOT ? CRIM_T : P.goldBright;
          ctx.fillText(sym(v), x + CELL / 2, y + CELL / 2 + (cantorLetters ? -0.5 : 0.5));
        }
      }
      // the table goes on: fade the far edges into the dark
      const gR = ctx.createLinearGradient(W - 44, 0, W, 0);
      gR.addColorStop(0, rgba(P.bg, 0)); gR.addColorStop(1, rgba(P.bg, 0.9));
      ctx.fillStyle = gR; ctx.fillRect(W - 44, HEAD, 44, R(gridBottom - HEAD));
      const gB = ctx.createLinearGradient(0, gridBottom - 30, 0, gridBottom);
      gB.addColorStop(0, rgba(P.bg, 0)); gB.addColorStop(1, rgba(P.bg, 0.92));
      ctx.fillStyle = gB; ctx.fillRect(GUT, gridBottom - 30, R(W - GUT), 30);
      ctx.restore();

      // --- column headers ---
      ctx.font = fnt(compact ? 9.5 : 10);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labW = ctx.measureText(lab(view.col + BigInt(visCols))).width + 14;
      const labEvery = BigInt(Math.max(1, Math.ceil(labW / CELL)));
      for (let c = 0; c <= visCols; c++) {
        const n = view.col + BigInt(c);
        const x = gx(c) + CELL / 2;
        if (x < GUT + 6 || x > W - 6) continue;
        const isF = fc === c;
        const rel = bigMode ? n - anchor : n;
        if (!isF && modB(rel, labEvery) !== 0n) continue;
        if (!isF && fc !== null && Math.abs(c - fc) * CELL < labW) continue;
        ctx.fillStyle = isF ? P.goldBright : FAINT;
        ctx.fillText(lab(n), x, HEAD / 2 + 1);
      }
      // corner: the anchor, or the axes
      ctx.textAlign = 'left';
      if (bigMode) {
        ctx.font = fnt(compact ? 9.5 : 10.5);
        ctx.fillStyle = P.gold;
        ctx.fillText(fit(ctx, compact ? 'N = …' : `N = ${fmtIdx(anchor)}`, GUT - 12), 8, HEAD / 2 + 1);
      } else if (!compact) {
        ctx.font = fnt(12, SERIF, 'italic');
        ctx.fillStyle = FAINT;
        ctx.fillText('row  ·  its rule', 12, HEAD / 2 + 1);
        ctx.textAlign = 'right';
        ctx.fillText('position →', GUT - 12, HEAD / 2 + 1);
      }

      // --- gutter: index, rule swatch, rule name ---
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HEAD, GUT, R(gridBottom - HEAD));
      ctx.clip();
      for (let r = 0; r <= visRows; r++) {
        const m = view.row + BigInt(r);
        const y = gy(r) + slide;
        if (y + CELL < HEAD || y > gridBottom) continue;
        const rule = enumAt(rows, m);
        const yc = y + CELL / 2;
        const isDiag = rule.type === 'diagonal' || rule.type === 'paradox';
        ctx.fillStyle = rule.hue || P.inkDim;
        ctx.fillRect(GUT - 9, y + 7, 3, R(CELL - 14));
        ctx.font = fnt(compact ? 9.5 : 11);
        ctx.textAlign = 'right';
        ctx.fillStyle = fr === r ? P.goldBright : FAINT;
        ctx.fillText(fit(ctx, lab(m), compact ? GUT - 16 : 52), compact ? GUT - 15 : 58, yc + 0.5);
        if (!compact) {
          ctx.fillStyle = isDiag ? CRIM_T : P.inkDim;
          drawMixed(ctx, rule.label, 67, yc + 0.5, 12.5, isDiag ? 'italic' : '', GUT - 67 - 12);
        }
      }
      const gG = ctx.createLinearGradient(0, gridBottom - 30, 0, gridBottom);
      gG.addColorStop(0, rgba(P.bg, 0)); gG.addColorStop(1, rgba(P.bg, 0.92));
      ctx.fillStyle = gG; ctx.fillRect(0, gridBottom - 30, GUT, 30);
      ctx.restore();

      // --- separator ---
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, crisp(stripY - 11));
      ctx.lineTo(W, crisp(stripY - 11));
      ctx.stroke();

      // --- the diagonal strip ---
      const yS = stripY - (stripY - HEAD) * ease;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      if (!revealed) {
        ctx.fillStyle = FAINT;
        drawMixed(ctx, compact ? 'd(n)' : 'd(n) = 1 − sₙ(n)', 12, stripY + CELL / 2, compact ? 13 : 13.5, 'italic');
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = rgba(P.inkDim, 0.35);
        ctx.strokeRect(GUT + 0.5, stripY + 0.5, R(W - GUT - 6), CELL - 1);
        ctx.setLineDash([]);
        ctx.font = fnt(compact ? 12 : 13, SERIF, 'italic');
        ctx.fillText(fit(ctx, 'not yet revealed: it will flip every outlined cell', W - GUT - 26), GUT + 12, stripY + CELL / 2);
        return;
      }
      if (anim) {
        // while it rises into row 0 the strip is a solid band laid over the table
        ctx.fillStyle = rgba(P.bg, 0.94);
        ctx.fillRect(0, yS - 4, W, CELL + 8);
        ctx.strokeStyle = rgba(P.crimson, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, crisp(yS - 4)); ctx.lineTo(W, crisp(yS - 4));
        ctx.moveTo(0, crisp(yS + CELL + 4)); ctx.lineTo(W, crisp(yS + CELL + 4));
        ctx.stroke();
      }
      ctx.fillStyle = CRIM_T;
      drawMixed(ctx, compact ? `${diagName(gen)}(n)` : `${diagName(gen)}(n) = 1 − sₙ(n)`, 12, yS + CELL / 2, 14, 'italic', GUT - 20);
      ctx.save();
      ctx.beginPath();
      ctx.rect(GUT, 0, R(W - GUT), H);
      ctx.clip();
      if (pulse > 0) {
        ctx.fillStyle = rgba(P.crimson, pulse * 0.26);
        ctx.fillRect(GUT, yS - 2, W - GUT, CELL + 4);
      }
      ctx.font = cantorLetters ? fnt(compact ? 14 : 15, SERIF, 'italic') : fnt(compact ? 11.5 : 12.5);
      ctx.textAlign = 'center';
      for (let c = 0; c <= visCols; c++) {
        const n = view.col + BigInt(c);
        const x = gx(c);
        if (x + CELL < GUT || x > W) continue;
        let landed = true;
        if (revealAnim) {
          const it = revealAnim.items[c];
          landed = !it || revealAnim.t >= it.delay + revealAnim.fall;
        }
        const s = cellVal(n, n);
        const v = flip(s);
        if (!landed) {
          ctx.strokeStyle = rgba(P.crimson, 0.35);
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, yS + 1.5, CELL - 3, CELL - 3);
          continue;
        }
        if (v === BOT) {
          hatch(ctx, x + 1, yS + 1, CELL - 2, CELL - 2);
          const f = ctx.font;
          ctx.font = fnt(compact ? 13 : 15, SERIF);
          ctx.fillStyle = CRIM_T;
          ctx.fillText('⊥', x + CELL / 2, yS + CELL / 2 + 1);
          ctx.font = f;
        } else {
          ctx.fillStyle = rgba(P.crimson, v ? 0.34 : 0.16);
          ctx.fillRect(x + 1, yS + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = v ? P.goldBright : rgba(P.ink, 0.82);
          ctx.fillText(sym(v), x + CELL / 2, yS + CELL / 2 + (cantorLetters ? -0.5 : 0.5));
        }
        if (playN !== null && n === playN) {
          glowGold.draw(ctx, x + CELL / 2, yS + CELL / 2, 0.8);
          ctx.fillStyle = rgba(P.bg, 0.55);
          ctx.fillRect(x + 3, yS + 3, CELL - 6, CELL - 6);
          ctx.strokeStyle = P.goldBright;
          ctx.lineWidth = 1.8;
          ctx.strokeRect(x + 1, yS + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = v === BOT ? CRIM_T : P.goldBright;
          ctx.fillText(sym(v), x + CELL / 2, yS + CELL / 2 + (cantorLetters ? -0.5 : 0.5));
        }
        // connector: the diagonal cell (n, n) above, the strip below, never equal
        if (focusN !== null && n === focusN && !anim && delta !== null) {
          const r = c - delta;
          if (r >= 0 && r <= visRows) {
            // the thread's last stretch, across the gap under the table, and the verdict
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = rgba(P.crimson, 0.7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(crisp(x + CELL / 2), gridBottom);
            ctx.lineTo(crisp(x + CELL / 2), yS - 1);
            ctx.stroke();
            ctx.setLineDash([]);
            // the verdict sits on the rule between the table and the strip
            const f = ctx.font;
            const xm = Math.round(x + CELL / 2), ym = Math.round(yS - 11);
            ctx.font = fnt(13, SERIF);
            pill(ctx, xm - 10, ym - 8, 20, 16, rgba(P.bg, 0.97));
            ctx.strokeStyle = rgba(P.crimson, 0.65);
            ctx.lineWidth = 1;
            ctx.strokeRect(xm - 9.5, ym - 7.5, 19, 15);
            ctx.fillStyle = CRIM_T;
            ctx.fillText('≠', xm, ym + 0.5);
            ctx.font = f;
          }
        }
      }
      // the strip goes on too
      const gS = ctx.createLinearGradient(W - 44, 0, W, 0);
      gS.addColorStop(0, rgba(P.bg, 0)); gS.addColorStop(1, rgba(P.bg, 0.9));
      ctx.fillStyle = gS; ctx.fillRect(W - 44, yS - 2, 44, CELL + 4);
      ctx.restore();

      // --- falling digits (the reveal) ---
      if (revealAnim) {
        ctx.font = cantorLetters ? fnt(compact ? 14 : 15, SERIF, 'italic') : fnt(compact ? 12 : 13);
        ctx.textAlign = 'center';
        for (const it of revealAnim.items) {
          const t = revealAnim.t - it.delay;
          if (t < 0 || t >= revealAnim.fall) continue;
          const q = t / revealAnim.fall;
          const x = gx(it.c) + CELL / 2;
          if (x < GUT || x > W) continue;
          const y1 = stripY + CELL / 2;
          const y0 = it.from !== null ? it.from : y1 - 40;
          const y = y0 + (y1 - y0) * q * q;
          const n = view.col + BigInt(it.c);
          const s = cellVal(n, n);
          const g = q < 0.5 ? s : flip(s);
          ctx.globalAlpha = it.from !== null ? 1 : q;
          glowCrim.draw(ctx, x, y, 0.8 + 0.4 * Math.sin(q * Math.PI));
          ctx.fillStyle = q < 0.5 ? P.ink : P.goldBright;
          ctx.fillText(sym(g), x, y + 0.5);
          ctx.globalAlpha = 1;
        }
      }
    }

    /* ---------- drawing: the tower ---------- */

    let towerCache = null;        // pre-rendered Cantor dust and haze, keyed by size

    function towerGeom() {
      const W = handle.width, H = handle.height;
      const compact = W < 680;
      if (compact) {
        return { W, H, compact, x0: 30, x1: W - 36, r3: 28, r2: 94, r1: 196, r0: 292,
          chX: W - 16, tlY: H - 84 };
      }
      const x1 = Math.round(W * 0.6);
      return { W, H, compact, x0: 64, x1, r3: 50, r2: 140, r1: 270, r0: H - 64,
        chX: x1 + 34, tlX0: x1 + 78, tlX1: W - 18, tlTop: 78, tlBot: H - 44 };
    }

    function buildTowerCache(G) {
      const dpr = handle.dpr || 1;
      const key = `${G.W}x${G.H}@${dpr}`;
      if (towerCache && towerCache.key === key) return towerCache;
      const mk = (w, h) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { c, g, w, h };
      };
      const span = R(G.x1 - G.x0);
      // Cantor's middle-thirds set: a faint construction comb, then the dust at depth 7
      const dust = mk(span + 2, 34);
      const seg = (a, b, depth, maxD, fn) => {
        if (depth === maxD) { fn(a, b); return; }
        const t = (b - a) / 3;
        seg(a, a + t, depth + 1, maxD, fn);
        seg(b - t, b, depth + 1, maxD, fn);
      };
      for (let d = 1; d <= 4; d++) {
        dust.g.fillStyle = rgba(P.gold, 0.08 + d * 0.04);
        seg(0, span, 0, d, (a, b) => dust.g.fillRect(1 + a, 2 + (d - 1) * 4.5, Math.max(1, b - a), 1.4));
      }
      dust.g.fillStyle = rgba(P.gold, 0.8);
      seg(0, span, 0, 7, (a, b) => dust.g.fillRect(1 + a, 22, Math.max(0.9, b - a), 6));
      // every set of reals: a haze too fine to resolve
      const haze = mk(span + 2, 40);
      let s = 1234567;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      for (let i = 0; i < 1400; i++) {
        const x = rnd() * span;
        const y = 20 + (rnd() + rnd() + rnd() - 1.5) * 11;
        haze.g.fillStyle = rgba(i % 7 === 0 ? P.goldBright : P.gold, 0.08 + rnd() * 0.3);
        haze.g.fillRect(1 + x, y, 1, 1);
      }
      towerCache = { key, dust, haze };
      return towerCache;
    }

    // "2" with nested raised exponents over ℵ₀; returns the end x
    function drawPow(ctx, x, y, level, size, color, top = true) {
      ctx.fillStyle = color;
      ctx.font = fnt(size, SERIF);
      if (level === 0) {
        ctx.font = fnt(size * (top ? 0.88 : 1), SERIF);   // the fallback ℵ runs large beside the house serif
        ctx.fillText('ℵ₀', x, y);
        return x + ctx.measureText('ℵ₀').width;
      }
      ctx.fillText('2', x, y);
      const w = ctx.measureText('2').width;
      return drawPow(ctx, x + w + 0.5, y - size * 0.42, level - 1, size * 0.72, color, false);
    }

    let tlHits = [], rungHits = [];

    function drawTower(ctx) {
      const G = towerGeom();
      const { W, H, compact, x0, x1 } = G;
      ctx.clearRect(0, 0, W, H);
      const TC = buildTowerCache(G);
      const span = R(x1 - x0);
      ctx.textBaseline = 'alphabetic';
      rungHits = [];

      // P( · ) arrows up the left side
      const ax = compact ? 12 : x0 - 30;
      const rungY = [G.r0, G.r1, G.r2, G.r3];
      ctx.strokeStyle = rgba(P.azure, 0.55);
      ctx.fillStyle = rgba(P.azure, 0.8);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const ya = rungY[i] - 8, yb = rungY[i + 1] + 10;
        ctx.beginPath(); ctx.moveTo(crisp(ax), ya); ctx.lineTo(crisp(ax), yb); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 4, yb + 6); ctx.lineTo(ax + 0.5, yb); ctx.lineTo(ax + 5, yb + 6); ctx.stroke();
        if (!compact) {
          ctx.font = fnt(14, SERIF, 'italic');
          ctx.textAlign = 'right';
          ctx.fillText('P', ax - 8, (ya + yb) / 2 + 5);
        }
      }

      // rung labels: math, beth name, a line of description
      const DESC = compact
        ? ['the countable', 'the continuum', 'all sets of reals']
        : ['the countable: every list, yours included', 'the continuum: every binary sequence, every real', 'every set of real numbers'];
      const labelRung = (i, y) => {
        ctx.textAlign = 'left';
        let x = drawPow(ctx, x0, y, i, compact ? 16 : 18, P.ink);
        ctx.font = fnt(compact ? 12.5 : 14, SERIF);
        ctx.fillStyle = FAINT;
        const beth = ` = ℶ${sub(i)}`;
        ctx.fillText(beth, x + 2, y);
        x += ctx.measureText(beth).width + 12;
        ctx.font = fnt(compact ? 12 : 13, SERIF, 'italic');
        ctx.fillStyle = P.inkDim;
        const d = fit(ctx, DESC[i], (compact ? W - 20 : x1 + 10) - x);
        ctx.fillText(d, x, y);
        return x + ctx.measureText(d).width;
      };

      // rung 3: no top
      ctx.textAlign = 'center';
      ctx.font = fnt(18, SERIF);
      ctx.fillStyle = FAINT;
      ctx.fillText('⋮', x0 + 6, G.r3 + 6);
      ctx.textAlign = 'left';
      ctx.font = fnt(compact ? 12 : 13, SERIF, 'italic');
      const noTop = 'no top rung, ever';
      ctx.fillText(noTop, x0 + 20, G.r3 + 4);
      if (!compact) {
        // why there is no top: the reason, in the arrows’ azure
        const xr = x0 + 20 + ctx.measureText(noTop).width;
        ctx.fillStyle = rgba(P.azure, 0.9);
        ctx.fillText(fit(ctx, ': no map from any set X onto P(X), by Cantor’s theorem', x1 - xr), xr, G.r3 + 4);
      }
      rungHits.push({ y: G.r3 + 10, i: 3 });

      // rung 2: every set of reals, as haze
      labelRung(2, G.r2 - 26);
      ctx.drawImage(TC.haze.c, x0 - 1, G.r2 - 20, span + 2, 40);
      ctx.font = fnt(compact ? 11.5 : 12.5, SERIF, 'italic');
      ctx.fillStyle = FAINT;
      ctx.textAlign = 'left';
      ctx.fillText(fit(ctx, compact ? 'too many to draw; almost none can be described'
        : 'too many to draw; all but countably many have no finite description', span), x0, G.r2 + 34);
      rungHits.push({ y: G.r2, i: 2 });

      // rung 1: the continuum as Cantor dust, with every rule at its address
      const rung1End = labelRung(1, G.r1 - 30);
      ctx.drawImage(TC.dust.c, x0 - 1, G.r1 - 25, span + 2, 34);
      rungHits.push({ y: G.r1, i: 1 });
      const addrX = new Map();
      rows.forEach((r) => {
        if (r.type === 'paradox') return;
        const a = cantorAddress(r);
        if (a !== null) addrX.set(r, x0 + a * span);
      });

      // rung 0: the whole numbers, receding
      const dotX = (n) => x0 + (span - 6) * (1 - Math.pow(0.915, n));
      const k = rows.length;
      const FAN = compact ? 18 : 24;
      ctx.lineWidth = 0.8;
      for (let n = 0; n < FAN; n++) {
        const rule = rows[n % k];
        const xa = dotX(n), ya = G.r0 - 4;
        if (rule.type === 'paradox') {
          ctx.strokeStyle = rgba(P.crimson, 0.5);
          ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xa, ya - 22); ctx.stroke();
          ctx.font = fnt(11, SERIF); ctx.fillStyle = CRIM_T; ctx.textAlign = 'center';
          ctx.fillText('⊥', xa, ya - 25);
          continue;
        }
        const xb = addrX.get(rule);
        if (xb === undefined) continue;
        ctx.strokeStyle = rgba(rule.hue || P.inkDim, 0.3);
        ctx.beginPath();
        ctx.moveTo(xa, ya);
        ctx.bezierCurveTo(xa, ya - 60, xb, G.r1 + 70, xb, G.r1 + 11);
        ctx.stroke();
      }
      for (let n = 0; n < 72; n++) {
        const x = dotX(n);
        const rad = R(2.8 * Math.pow(0.965, n));
        ctx.fillStyle = rgba(n < FAN ? P.goldBright : P.gold, Math.max(0.2, 1 - n / 80));
        ctx.beginPath(); ctx.arc(x, G.r0, Math.max(0.6, rad), 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = fnt(9.5);
      ctx.fillStyle = FAINT;
      ctx.textAlign = 'center';
      for (let n = 0; n < 4; n++) ctx.fillText(String(n), dotX(n), G.r0 + 16);
      ctx.fillText('…', dotX(5), G.r0 + 16);
      labelRung(0, G.r0 + (compact ? 36 : 40));
      rungHits.push({ y: G.r0, i: 0 });

      // ticks on the continuum: each rule at its true address
      for (const [r, x] of addrX) {
        ctx.strokeStyle = r.type === 'diagonal' ? rgba(P.crimson, 0.8) : (r.hue || P.gold);
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(crisp(x), G.r1 - 12); ctx.lineTo(crisp(x), G.r1 + 11); ctx.stroke();
        ctx.fillStyle = r.hue || P.gold;
        ctx.beginPath(); ctx.arc(x, G.r1 + 11, 2, 0, Math.PI * 2); ctx.fill();
      }
      // the diagonal: a point of the continuum no line reaches
      const dAddr = hasParadox() ? null : cantorAddress(diag);
      if (dAddr !== null) {
        const xd = x0 + dAddr * span;
        glowCrim.draw(ctx, xd, G.r1, 1.1);
        ctx.strokeStyle = CRIM_T;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(crisp(xd), G.r1 - 15); ctx.lineTo(crisp(xd), G.r1 + 13); ctx.stroke();
        const txt = compact ? 'd: unreached' : `${diagName(gen)}: no line reaches it`;
        ctx.font = fnt(compact ? 12.5 : 13.5, SERIF, 'italic');
        const tw = ctx.measureText(txt).width;
        const lx = Math.max(6, Math.min(W - tw - 8, xd - tw / 2));
        const ly = compact ? G.r1 + 34 : G.r1 - 62;
        pill(ctx, lx - 5, ly - 12, tw + 10, 17, rgba(P.bg, 0.9));
        ctx.textAlign = 'left';
        ctx.fillStyle = CRIM_T;
        ctx.fillText(txt, lx, ly);
        ctx.strokeStyle = rgba(P.crimson, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (compact) { ctx.moveTo(crisp(xd), G.r1 + 14); ctx.lineTo(crisp(xd), ly - 12); }
        else if (xd > x0 - 6 && xd < rung1End + 6) {
          // the leader passes behind the rung’s label rather than through its letters
          ctx.moveTo(crisp(xd), G.r1 - 16); ctx.lineTo(crisp(xd), G.r1 - 24);
          ctx.moveTo(crisp(xd), G.r1 - 47); ctx.lineTo(crisp(xd), ly + 5);
        } else { ctx.moveTo(crisp(xd), G.r1 - 16); ctx.lineTo(crisp(xd), ly + 5); }
        ctx.stroke();
      } else {
        ctx.font = fnt(12.5, SERIF, 'italic');
        ctx.fillStyle = CRIM_T;
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, 'd is undefined wherever the paradox row sits: it names no point', span), x0, compact ? G.r1 + 34 : G.r1 - 62);
      }

      // the CH gap between the first two rungs
      const gx = G.chX;
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = rgba(P.crimson, 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(crisp(gx), G.r1 + 4); ctx.lineTo(crisp(gx), G.r0 - 8); ctx.stroke();
      ctx.setLineDash([]);
      const ym = (G.r0 + G.r1) / 2;
      pill(ctx, gx - 11, ym - 16, 22, 26, rgba(P.bg, 0.95));
      ctx.font = fnt(compact ? 19 : 22, SERIF, 'italic');
      ctx.fillStyle = CRIM_T;
      ctx.textAlign = 'center';
      ctx.fillText('?', gx, ym + 4);
      ctx.font = fnt(10, MONO);
      ctx.fillText('CH', gx, G.r1 - 6);

      // the record: a dated timeline of the gap
      tlHits = [];
      const nodeCol = (e) => (e.kind === 'conj' ? P.crimson : e.kind === 'machine' ? VERDIGRIS : e.kind === 'hist' ? P.inkDim : P.gold);
      if (!compact) {
        const { tlX0, tlX1, tlTop, tlBot } = G;
        ctx.textAlign = 'left';
        ctx.font = fnt(13.5, SERIF, 'italic');
        ctx.fillStyle = CRIM_T;
        ctx.fillText(fit(ctx, 'the gap, dated', tlX1 - tlX0), tlX0, tlTop - 30);
        // a quiet leader from the “?” to the record
        ctx.strokeStyle = rgba(P.crimson, 0.35);
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(gx + 12, ym - 4); ctx.lineTo(tlX0 - 12, ym - 4); ctx.stroke();
        ctx.setLineDash([]);
        const rail = tlX0 + 5;
        ctx.strokeStyle = rgba(GHOST, 0.9);
        ctx.beginPath(); ctx.moveTo(crisp(rail), tlTop - 8); ctx.lineTo(crisp(rail), tlBot + 8); ctx.stroke();
        const stepY = (tlBot - tlTop) / (TIMELINE.length - 1);
        TIMELINE.forEach((e, i) => {
          const y = tlTop + i * stepY;
          const sel = i === tlSel;
          if (sel) glowGold.draw(ctx, rail, y, 0.8);
          ctx.fillStyle = sel ? P.goldBright : nodeCol(e);
          ctx.beginPath(); ctx.arc(rail, y, sel ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.font = fnt(11);
          ctx.fillStyle = sel ? P.goldBright : P.gold;
          ctx.fillText(e.year, rail + 12, y + 4);
          ctx.fillStyle = sel ? P.ink : P.inkDim;
          drawMixed(ctx, e.short, rail + 50, y + 4, 13, '', tlX1 - (rail + 52));
          tlHits.push({ x: rail, y, i, w: tlX1 - rail });
        });
      } else {
        const y = G.tlY;
        const xa = 22, xb = W - 22;
        ctx.textAlign = 'left';
        ctx.font = fnt(12.5, SERIF, 'italic');
        ctx.fillStyle = CRIM_T;
        ctx.fillText(fit(ctx, 'the gap, dated · tap a year', W - 30), xa - 6, y - 20);
        ctx.strokeStyle = rgba(GHOST, 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xa, crisp(y)); ctx.lineTo(xb, crisp(y)); ctx.stroke();
        const stepX = (xb - xa) / (TIMELINE.length - 1);
        TIMELINE.forEach((e, i) => {
          const x = xa + i * stepX;
          const sel = i === tlSel;
          if (sel) glowGold.draw(ctx, x, y, 0.7);
          ctx.fillStyle = sel ? P.goldBright : nodeCol(e);
          ctx.beginPath(); ctx.arc(x, y, sel ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.font = fnt(9.5);
          ctx.textAlign = 'center';
          ctx.fillStyle = sel ? P.goldBright : FAINT;
          ctx.fillText(e.year, x, y + 17);
          tlHits.push({ x, y, i, w: 0 });
        });
        if (tlSel >= 0) {
          ctx.fillStyle = P.ink;
          drawMixed(ctx, TIMELINE[tlSel].short, W / 2, y + 42, 13, '', W - 24, 'center');
        }
      }
    }

    /* ---------- drawing: forcing ---------- */

    let treeCache = null;

    function forcingGeom() {
      const W = handle.width, H = handle.height;
      const compact = W < 560;
      const CE = compact ? 18 : 20, GUT2 = compact ? 58 : 204;
      const g = fGround || [];
      const shown = Math.min(g.length, compact ? 6 : 8);
      const top = 30;
      const visC = Math.max(4, Math.floor((W - GUT2 - 10) / CE));
      const yC = top + shown * CE + (g.length > shown ? 30 : 16);
      const yT0 = yC + CE + 44, yT1 = H - 40;
      const D = compact ? 6 : 7;
      return { W, H, compact, CE, GUT2, shown, top, visC, yC, yT0, yT1, D, xL: 14, xR: W - 14 };
    }

    function nodeXY(G, level, idx) {
      const n = 1 << level;
      return [G.xL + ((idx + 0.5) / n) * (G.xR - G.xL), G.yT0 + level * (G.yT1 - G.yT0) / G.D];
    }

    function buildTreeCache(G) {
      const dpr = handle.dpr || 1;
      const key = `${G.W}x${G.H}@${dpr}:${G.yT0}:${G.D}`;
      if (treeCache && treeCache.key === key) return treeCache;
      const top = G.yT0 - 4, bandH = R(G.yT1 - G.yT0) + 8;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(G.W * dpr)); c.height = Math.max(1, Math.round(bandH * dpr));
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
      g.strokeStyle = rgba(GHOST, 0.75);
      g.lineWidth = 0.8;
      g.beginPath();
      for (let l = 0; l < G.D; l++) {
        for (let i = 0; i < (1 << l); i++) {
          const [x, y] = nodeXY(G, l, i);
          for (const b of [0, 1]) {
            const [x2, y2] = nodeXY(G, l + 1, 2 * i + b);
            g.moveTo(x, y); g.lineTo(x2, y2);
          }
        }
      }
      g.stroke();
      treeCache = { key, c, top, bandH };
      return treeCache;
    }

    function drawForcing(ctx) {
      const G = forcingGeom();
      const { W, H, compact, CE, GUT2, shown, top, visC, yC } = G;
      ctx.clearRect(0, 0, W, H);
      const g = fGround || [];
      const ghost = fPreviewBits;
      const total = fCond.length + ghost.length;
      const look = Math.min(6, Math.floor(visC / 3));
      const off = Math.max(0, total - visC + look);
      ctx.textBaseline = 'middle';
      // header
      ctx.textAlign = 'left';
      ctx.font = fnt(compact ? 12 : 13, SERIF, 'italic');
      ctx.fillStyle = FAINT;
      ctx.fillText(fit(ctx, 'your ground list, frozen when the game was dealt', W - 20), 10, 14);
      // ground rows
      for (let j = 0; j < shown; j++) {
        const y = top + j * CE;
        const rule = g[j];
        ctx.fillStyle = rule.hue || P.inkDim;
        ctx.fillRect(GUT2 - 9, y + 5, 3, R(CE - 10));
        ctx.textAlign = compact ? 'right' : 'left';
        if (compact) {
          ctx.font = fnt(9.5);
          ctx.fillStyle = FAINT;
          ctx.fillText(`#${rule.origIndex}`, GUT2 - 15, y + CE / 2);
        } else {
          ctx.fillStyle = rule.type === 'diagonal' ? CRIM_T : P.inkDim;
          drawMixed(ctx, `row ${rule.origIndex} · ${rule.label}`, 10, y + CE / 2, 12.5,
            rule.type === 'diagonal' ? 'italic' : '', GUT2 - 24);
        }
        ctx.font = fnt(compact ? 10 : 11);
        ctx.textAlign = 'center';
        for (let c = 0; c < visC; c++) {
          const i = off + c;
          const x = GUT2 + c * CE;
          if (x + CE > W) break;
          const v = rule.eval(BigInt(i));
          if (v) { ctx.fillStyle = rgba(P.goldDim, 0.24); ctx.fillRect(x + 1, y + 1, CE - 2, CE - 2); }
          ctx.fillStyle = v ? P.inkDim : rgba(FAINT, 0.7);
          ctx.fillText(String(v), x + CE / 2, y + CE / 2 + 0.5);
          if (i < fCond.length && fCond[i] !== v) {       // locked in, forever
            ctx.strokeStyle = rgba(P.crimson, 0.85);
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x + 1.5, y + 1.5, CE - 3, CE - 3);
          }
        }
      }
      if (g.length > shown) {
        ctx.textAlign = 'left';
        ctx.font = fnt(12, SERIF, 'italic');
        ctx.fillStyle = FAINT;
        ctx.fillText(fit(ctx, `and ${g.length - shown} more row${g.length - shown === 1 ? '' : 's'}; the cards cover them too`, W - 20), 10, top + shown * CE + 12);
      }
      // the condition strip
      ctx.textAlign = 'left';
      ctx.font = fnt(compact ? 12 : 13, SERIF, 'italic');
      ctx.fillStyle = P.azure;
      ctx.fillText(compact ? 'you' : fit(ctx, 'your condition', GUT2 - 24), 10, yC + CE / 2);
      ctx.font = fnt(compact ? 10.5 : 11.5);
      ctx.textAlign = 'center';
      for (let c = 0; c < visC; c++) {
        const i = off + c;
        const x = GUT2 + c * CE;
        if (x + CE > W) break;
        if (i < fCond.length) {
          ctx.fillStyle = rgba(P.azure, fCond[i] ? 0.3 : 0.12);
          ctx.fillRect(x + 1, yC + 1, CE - 2, CE - 2);
          ctx.fillStyle = P.ink;
          ctx.fillText(String(fCond[i]), x + CE / 2, yC + CE / 2 + 0.5);
        } else if (i < total) {
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = rgba(P.azure, 0.8);
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, yC + 1.5, CE - 3, CE - 3);
          ctx.setLineDash([]);
          ctx.fillStyle = rgba(P.azure, 0.85);
          ctx.fillText(String(ghost[i - fCond.length]), x + CE / 2, yC + CE / 2 + 0.5);
        } else {
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = P.line;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, yC + 1.5, CE - 3, CE - 3);
          ctx.setLineDash([]);
        }
      }
      // the window has scrolled: earlier bits fade off to the left
      if (off > 0) {
        const gL = ctx.createLinearGradient(GUT2, 0, GUT2 + CE * 1.6, 0);
        gL.addColorStop(0, rgba(P.bg, 0.88)); gL.addColorStop(1, rgba(P.bg, 0));
        ctx.fillStyle = gL;
        ctx.fillRect(GUT2, top, CE * 1.6, R(yC + CE - top));
      }
      // column indices
      ctx.font = fnt(9.5);
      ctx.fillStyle = FAINT;
      const every = compact ? 5 : 4;
      for (let c = 0; c < visC; c++) {
        const i = off + c;
        if (i % every) continue;
        const x = GUT2 + c * CE;
        if (x + CE > W) break;
        ctx.fillText(String(i), x + CE / 2, yC + CE + 11);
      }

      // the tree of finite conditions
      const TC = buildTreeCache(G);
      ctx.drawImage(TC.c, 0, TC.top, W, TC.bandH);
      const pathOf = (bitAt, len) => {
        const pts = [nodeXY(G, 0, 0)];
        let idx = 0;
        for (let l = 0; l < Math.min(G.D, len); l++) { idx = 2 * idx + bitAt(l); pts.push(nodeXY(G, l + 1, idx)); }
        return pts;
      };
      const stroke = (pts, col, w, dash) => {
        ctx.strokeStyle = col; ctx.lineWidth = w;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        if (dash) ctx.setLineDash([]);
      };
      const treeRows = g.slice(0, shown);
      for (const rule of treeRows) stroke(pathOf((l) => rule.eval(BigInt(l)), G.D), rgba(rule.hue || P.inkDim, 0.5), 1.2);
      const full = [...fCond, ...ghost];
      if (ghost.length && fCond.length < G.D) stroke(pathOf((l) => full[l], full.length), rgba(P.azure, 0.7), 1.6, [3, 3]);
      const cp = pathOf((l) => fCond[l], fCond.length);
      if (cp.length > 1) stroke(cp, P.azure, 2.2);
      for (const [x, y] of cp) { ctx.fillStyle = P.azure; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
      glowAz.draw(ctx, cp[cp.length - 1][0], cp[cp.length - 1][1], 0.8);
      // where your path leaves a row's path: locked in, since branches never rejoin
      for (const rule of treeRows) {
        let i = 0;
        while (i < Math.min(G.D, fCond.length) && fCond[i] === rule.eval(BigInt(i))) i++;
        if (i < Math.min(G.D, fCond.length)) {
          const [x, y] = cp[i];
          ctx.fillStyle = CRIM_T;
          ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.font = fnt(12, SERIF, 'italic');
      ctx.textBaseline = 'middle';
      ctx.fillStyle = FAINT;
      ctx.textAlign = 'left';
      const [rx, ry] = nodeXY(G, 0, 0);
      ctx.fillText(compact ? '∅' : 'the empty condition', rx + 10, ry - 10);
      if (fCond.length > G.D) {
        const [ex, ey] = cp[cp.length - 1];
        ctx.font = fnt(10);
        ctx.fillStyle = P.azure;
        ctx.textAlign = ex > W - 90 ? 'right' : 'left';
        ctx.fillText(`↓ ${fCond.length - G.D} more bits`, ex + (ex > W - 90 ? -8 : 8), ey + 12);
      }
      ctx.textAlign = 'left';
      ctx.font = fnt(compact ? 11.5 : 12.5, SERIF, 'italic');
      ctx.fillStyle = FAINT;
      ctx.fillText(fit(ctx, compact
        ? 'crimson: mismatches locked in for good'
        : 'crimson: mismatches locked in; paths that part in the tree of finite conditions never meet again',
      W - 20), 10, H - 14);
    }

    /* ---------- render ---------- */

    function render() {
      const ctx = handle.ctx;
      if (handle.width < 2 || handle.height < 2) return;
      if (mode === 'list') drawList(ctx);
      else if (mode === 'tower') drawTower(ctx);
      else drawForcing(ctx);
      if (trans && snap) {
        const W = handle.width, H = handle.height;
        const q = clamp01(trans.t / trans.dur), e = 1 - Math.pow(1 - q, 3);
        let s = 1, tx = W / 2, ty = H / 2;
        if (trans.from === 'list' && trans.to === 'tower') {
          const G = towerGeom(); tx = (G.x0 + G.x1) / 2; ty = G.r0; s = 1 - 0.92 * e;       // the table shrinks into ℵ₀
        } else if (trans.from === 'tower' && trans.to === 'list') {
          const G = towerGeom(); tx = (G.x0 + G.x1) / 2; ty = G.r0; s = 1 + 1.4 * e;        // dive into the bottom rung
        }
        ctx.save();
        ctx.globalAlpha = 1 - e;
        ctx.drawImage(snap, tx * (1 - s), ty * (1 - s), R(W * s), R(H * s));
        ctx.restore();
      }
      dirty = false;
    }

    function fitHeight() {
      const want = handle.width < 560 ? 460 : 480;
      if (cvOpts.height !== want) {
        cvOpts.height = want;
        cvEl.style.height = want + 'px';
      }
    }

    handle.onResize(() => {
      fitHeight();
      renderKey();
      // redraw now, inside the resize, so the cleared canvas never reaches the screen
      if (loop && loop.running) render(); else dirty = true;
    });

    /* ---------- pointer & keyboard interaction ---------- */

    cvEl.style.cursor = 'grab';
    cvEl.style.touchAction = 'none';
    let pDown = null, draggedFar = false;

    function handleListClick(x, y) {
      const { CELL, GUT, HEAD, stripY, gridBottom, visRows, visCols } = metrics();
      if (x < GUT) return;
      const c = Math.floor((x - GUT) / CELL + view.fx);
      if (c < 0 || c > visCols) return;
      const n = view.col + BigInt(c);
      if (revealed && y >= stripY && y <= stripY + CELL) {
        focusN = n;
        explainDiag(n, true);
        dirty = true;
        return;
      }
      if (y < HEAD || y > gridBottom) return;
      const r = Math.floor((y - HEAD) / CELL + view.fy);
      if (r < 0 || r > visRows) return;
      const m = view.row + BigInt(r);
      const rule = enumAt(rows, m);
      if (rule.type === 'paint') {
        audio.ensureAudio();
        const idx = Number(n % 64n);
        rule.bits[idx] ^= 1;
        cache.clear();
        dirty = true;
        audio.playTone(bus, { freq: rule.bits[idx] ? 587 : 294, dur: 0.07, level: 0.26 });
        readout.set(`painted bit ${idx} of the 64-cycle to ${sym(rule.bits[idx])}` +
          (revealed ? (m === n ? ' · and d(n) flipped with it: the diagonal is a live computation'
            : ' · the diagonal already knows') : ''));
        return;
      }
      if (m === n && revealed) {
        focusN = n;
        explainDiag(n, true);
        dirty = true;
        return;
      }
      explainCell(m, n);
      dirty = true;
    }

    function handleTowerClick(x, y) {
      const G = towerGeom();
      for (const h of tlHits) {
        const hit = G.compact
          ? Math.abs(x - h.x) < 20 && Math.abs(y - h.y) < 22
          : Math.abs(y - h.y) < 14 && x > h.x - 14 && x < h.x + h.w;
        if (hit) { selectTimeline(h.i); return; }
      }
      for (const h of rungHits) {
        if (Math.abs(y - h.y) < 18 && x < (G.compact ? G.W : G.x1 + 20)) {
          tlSel = -1;
          readout.set(RUNG_TEXT[h.i]);
          dirty = true;
          return;
        }
      }
    }

    function selectTimeline(i) {
      tlSel = i;
      readout.set(TIMELINE[i].text);
      audio.ensureAudio();
      audio.playTone(bus, { freq: [293.66, 329.63, 392, 440, 493.88, 587.33, 659.25][i] || 440, dur: 0.18, level: 0.16, type: 'triangle' });
      dirty = true;
    }

    function panBy(dc, dr) {
      view.fx += dc;
      view.fy += dr;
      while (view.fx < 0) {
        if (view.col > 0n) { view.col -= 1n; view.fx += 1; } else { view.fx = 0; break; }
      }
      while (view.fx >= 1) { view.col += 1n; view.fx -= 1; }
      while (view.fy < 0) {
        if (view.row > 0n) { view.row -= 1n; view.fy += 1; } else { view.fy = 0; break; }
      }
      while (view.fy >= 1) { view.row += 1n; view.fy -= 1; }
      revealAnim = null;
      dirty = true;
    }

    const onDown = (e) => {
      pDown = { x: e.clientX, y: e.clientY };
      draggedFar = false;
      if (mode === 'list') {
        try { cvEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        cvEl.style.cursor = 'grabbing';
      }
    };
    const onMove = (e) => {
      if (!pDown) return;
      const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
      if (!draggedFar && Math.hypot(dx, dy) > 4) draggedFar = true;
      if (draggedFar && mode === 'list') {
        if (player) stopPlay();
        const { CELL } = metrics();
        panBy(-dx / CELL, -dy / CELL);
        pDown = { x: e.clientX, y: e.clientY };
      }
    };
    const onUp = (e) => {
      if (!pDown) return;
      try { cvEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      const wasDrag = draggedFar;
      pDown = null;
      draggedFar = false;
      if (mode === 'list') cvEl.style.cursor = 'grab';
      if (wasDrag || e.type === 'pointercancel') return;
      const rect = cvEl.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (mode === 'list') handleListClick(x, y);
      else if (mode === 'tower') handleTowerClick(x, y);
    };
    const onKey = (e) => {
      if (mode === 'list') {
        const step = e.shiftKey ? 5 : 1;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) { if (player) stopPlay(); panBy(...moves[e.key]); e.preventDefault(); return; }
        if (e.key === 'Home') { goHome(); e.preventDefault(); return; }
        if (e.key === 'Enter' || e.key === ' ') {
          const n = focusN !== null ? focusN : (view.col > view.row ? view.col : view.row);
          focusN = n;
          explainDiag(n, true);
          dirty = true;
          e.preventDefault();
        }
      } else if (mode === 'tower') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { selectTimeline((tlSel + 1) % TIMELINE.length); e.preventDefault(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { selectTimeline((tlSel - 1 + TIMELINE.length) % TIMELINE.length); e.preventDefault(); }
      } else if (e.key === '0' || e.key === '1') {
        appendBits([+e.key]);
        e.preventDefault();
      }
    };
    cvEl.addEventListener('pointerdown', onDown);
    cvEl.addEventListener('pointermove', onMove);
    cvEl.addEventListener('pointerup', onUp);
    cvEl.addEventListener('pointercancel', onUp);
    cvEl.addEventListener('keydown', onKey);

    /* ---------- the loop ---------- */

    const loop = cv.rafLoop((dt) => {
      if (anim) {
        anim.t += dt;
        dirty = true;
        if (anim.t >= anim.dur) finishAbsorb();
      }
      if (revealAnim) {
        revealAnim.t += dt;
        dirty = true;
        if (revealAnim.t >= revealAnim.end) revealAnim = null;
      }
      if (trans) {
        trans.t += dt;
        dirty = true;
        if (trans.t >= trans.dur) trans = null;
      }
      if (pulse > 0) {
        pulse = RM ? 0 : Math.max(0, pulse - dt * 1.4);
        dirty = true;
      }
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      while (edgeQueue.length && edgeQueue[0].at <= now) {
        const ev = edgeQueue.shift();
        playN = ev.n; playAt = ev.at;
        walked++;
        const s = cellVal(playN, playN);
        readout.set(`walking the diagonal · position ${fmtLong(playN)} · row says ${sym(s)}, d says ${sym(flip(s))}` +
          ` · ${walked.toLocaleString('en-US')} mismatch${walked === 1 ? '' : 'es'} checked; the theorem covers the rest`);
        dirty = true;
      }
      // the view follows the walk, on the audio clock
      if (player && playN !== null && mode === 'list') {
        const M = metrics();
        if (RM) {
          if (playN < view.col || playN > view.col + BigInt(Math.max(1, M.visCols - 2))) {
            view.col = view.row = playN; view.fx = view.fy = 0; dirty = true;
          }
        } else {
          const lead = BigInt(Math.min(3, Math.max(1, M.visCols >> 2)));
          const base = playN > lead ? playN - lead : 0n;
          const fr = base > 0n ? clamp01((now - playAt) / STEP) : 0;
          view.col = view.row = base; view.fx = view.fy = fr;
          dirty = true;
        }
      }
      if (player && !player.playing && edgeQueue.length === 0) stopPlay();
      if (auto && mode === 'forcing') {
        auto.t += dt;
        if (auto.t >= 0.3) { auto.t = 0; autoStep(); }
      }
      if (!dirty) return;
      render();
    });

    modeBtns.list.classList.add('active');
    modeBtns.list.setAttribute('aria-pressed', 'true');
    fitHeight();
    renderKey();
    updateTexts();
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        stopPlay();
        stopAuto();
        bus.mute();
      },
      resume() {
        bus.unmute();
        dirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopPlay();
        stopAuto();
        bus.dispose();
        cvEl.removeEventListener('pointerdown', onDown);
        cvEl.removeEventListener('pointermove', onMove);
        cvEl.removeEventListener('pointerup', onUp);
        cvEl.removeEventListener('pointercancel', onUp);
        cvEl.removeEventListener('keydown', onKey);
        if (mql && mql.removeEventListener) mql.removeEventListener('change', onRM);
        handle.destroy();
        style.remove();
      },
    };
  },
};

/* ================= node-testable exports ================= */

export const _test = {
  rules,
  enumAt,
  makeDiagonal,
  modPow,
  popParity,
  isqrt,
  isPrime,
  champBit,
  parseIndex,
  fmtIdx,
  starterRows,
  MAX_IDX,
  // added in the expansion
  BOT,
  flip,
  deepFreeze,
  cantorAddress,
  commonPrefix,
  fmtLong,
  MR_BASES,
  MR_DETERMINISTIC_BOUND,
  selfTest,
};
