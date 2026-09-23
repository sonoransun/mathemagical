// III·4 — The Rosetta Stone
// One equation counted prime by prime; one infinite product multiplied out.
// The two streams agree at every prime: a live, checkable instance of the
// modularity theorem (for this curve a theorem since Eichler 1954 and Igusa
// 1959; for every elliptic curve over ℚ, Wiles–Taylor 1995 and Breuil–Conrad–
// Diamond–Taylor 2001), plus the Sato–Tate law built from the visitor's own
// point counts (with a curve of complex multiplication for contrast) and a map
// of the Langlands program.
//
// Curve  E : y² + y = x³ − x²  (conductor 11; LMFDB 11.a3, a model of X₁(11))
// Form   f = q·∏(1−qⁿ)²(1−q¹¹ⁿ)²  (the weight-2 newform of level 11)
// For every prime p:  a_p = p + 1 − #E(𝔽_p) = [q^p] f,  |a_p| ≤ 2√p (Hasse 1933).
// At the bad prime 11 the reduced curve has a split node and both sides give 1.
//
// Quotations: Weil's letter of 26 March 1940 in Martin H. Krieger's translation
// (Notices of the AMS 52:3, 2005, 334–341); Langlands's cover note of January
// 1967 as printed by the Abel Prize (Sletsjøe, 2018); Zagier's "the simplest
// elliptic curve" from The 1-2-3 of Modular Forms (2008).

/* =========================================================================
   Pure computational core. Self-contained functions (no captured state, no
   DOM) so they can be verified under node AND serialized into a Worker.
   ========================================================================= */

// a_p for E: y² + y = x³ − x², via point counting over F_p.
// p = 2 by direct enumeration; odd p via the quadratic character:
// completing the square, y² + y = c has 1 + χ(4c+1) solutions in y,
// so a_p = −Σ_x χ(4x³ − 4x² + 1). O(p) time, exact for all p < 2^26.
function apFromCount(p) {
  if (p === 2) {
    let n = 0;
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        if ((y * y + y) % 2 === (((x * x * x - x * x) % 2) + 2) % 2) n++;
      }
    }
    return 2 + 1 - (n + 1); // affine points + point at infinity
  }
  const sq = new Uint8Array(p);
  const half = (p - 1) / 2;
  for (let y = 0; y <= half; y++) sq[(y * y) % p] = 1;
  let s = 0;
  for (let x = 0; x < p; x++) {
    const c = (((x * x) % p) * ((x + p - 1) % p)) % p; // x²(x−1) mod p
    const t = (4 * c + 1) % p;
    if (t !== 0) s += sq[t] ? 1 : -1;
  }
  return -s;
}

// #E(F_p) including the point at infinity. At the bad prime 11 this counts the
// node too, and p + 1 − #E still equals the coefficient of q¹¹ (split node: +1).
function pointCount(p) {
  return p + 1 - apFromCount(p);
}

// All affine solutions (x, y) of y² + y ≡ x³ − x² (mod p), sorted by x.
function affineSolutions(p) {
  const byVal = new Map();
  for (let y = 0; y < p; y++) {
    const v = (y * y + y) % p;
    let arr = byVal.get(v);
    if (!arr) byVal.set(v, (arr = []));
    arr.push(y);
  }
  const pts = [];
  for (let x = 0; x < p; x++) {
    const c = (((x * x) % p) * ((x + p - 1) % p)) % p;
    const ys = byVal.get(c);
    if (ys) for (const y of ys) pts.push([x, y]);
  }
  return pts;
}

// Coefficients a_0..a_N of f = q·∏(1−qⁿ)²(1−q¹¹ⁿ)².
// Route: Euler's pentagonal number theorem gives ∏(1−qⁿ) sparsely; square it
// by sparse convolution to get A = ∏(1−qⁿ)²; then ∏(1−q¹¹ⁿ)² = A(q¹¹), so
// a_{n} = [q^{n−1}] A(q)·A(q¹¹). Exact small integers throughout.
function etaCoefficients(N) {
  const E = new Array(N + 1).fill(0);
  E[0] = 1;
  for (let k = 1; ; k++) {
    const g1 = (k * (3 * k - 1)) / 2;
    const g2 = (k * (3 * k + 1)) / 2;
    if (g1 > N) break;
    const s = k % 2 === 1 ? -1 : 1;
    E[g1] += s;
    if (g2 <= N) E[g2] += s;
  }
  const idx = [];
  for (let i = 0; i <= N; i++) if (E[i] !== 0) idx.push(i);
  const A = new Array(N + 1).fill(0);
  for (const i of idx) {
    for (const j of idx) {
      if (i + j <= N) A[i + j] += E[i] * E[j];
    }
  }
  const f = new Array(N + 1).fill(0);
  for (let i = 0; 11 * i <= N - 1; i++) {
    const b = A[i];
    if (!b) continue;
    const base = 11 * i;
    for (let j = 0; base + j <= N - 1; j++) {
      if (A[j]) f[base + j + 1] += b * A[j];
    }
  }
  return f;
}

// In-place multiply of a truncated power series c (indices 0..N) by
// (1 − 2qⁿ + q²ⁿ) = (1 − qⁿ)². Descending index so lower terms stay clean.
// This is the "watch it happen" route; _test proves it matches the fast one.
function multFactor(c, n, N) {
  for (let i = N; i >= n; i--) {
    let v = c[i] - 2 * c[i - n];
    if (i >= 2 * n) v += c[i - 2 * n];
    c[i] = v;
  }
}

function sievePrimes(limit) {
  const s = new Uint8Array(limit + 1);
  const out = [];
  for (let i = 2; i <= limit; i++) {
    if (!s[i]) {
      out.push(i);
      for (let j = i * i; j <= limit; j += i) s[j] = 1;
    }
  }
  return out;
}

// a_p for the curve y² = x³ − x (conductor 32), which has complex
// multiplication by ℤ[i]: (x, y) ↦ (−x, iy). Odd p only: a_p = −Σ_x χ(x³ − x).
// Used for the Sato–Tate contrast; self-contained so it can enter the Worker.
function apFromCountCM(p) {
  if (p === 2) return 0; // the bad prime; never counted
  const sq = new Uint8Array(p);
  for (let y = 0; y <= (p - 1) / 2; y++) sq[(y * y) % p] = 1;
  let s = 0;
  for (let x = 0; x < p; x++) {
    const t = ((((x * x) % p) * x) % p - x + p) % p;
    if (t !== 0) s += sq[t] ? 1 : -1;
  }
  return -s;
}

// The four affine rational points (0,0), (0,−1), (1,0), (1,−1), reduced mod p.
// With ∞ they are all of E(ℚ) (torsion ℤ/5, rank 0), which is why 5 divides
// every count at a good prime.
function rationalPointsMod(p) {
  return [[0, 0], [1, 0], [0, p - 1], [1, p - 1]];
}

// Typesetting helpers (pure).
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
function supNum(n) { return String(n).split('').map((d) => SUPS[+d]).join(''); }
function subNum(n) { return String(n).split('').map((d) => SUBS[+d]).join(''); }
function signed(n) { return n < 0 ? '−' + (-n) : String(n); }
// One term of a q-series: first → 'q', '−2q²'; later → '+ q⁵', '− 2q⁷'.
function qTerm(c, k, first) {
  const mag = Math.abs(c);
  const body = (mag === 1 ? '' : String(mag)) + 'q' + (k === 1 ? '' : supNum(k));
  if (first) return (c < 0 ? '−' : '') + body;
  return (c < 0 ? '− ' : '+ ') + body;
}

// The exhibit's own referee: recompute a_p BOTH ways for every prime below
// `limit`, assert exact equality (the bad prime included), the four anchors,
// the Hasse bound, agreement of the two product routes, the bad-prime story at
// 11, the five rational points, the Hecke rules the bars display, and the CM
// contrast used by the Sato–Tate view.
function selfTest(limit = 1000) {
  const primes = sievePrimes(limit - 1);
  const a = etaCoefficients(limit);
  const anchors = { 2: -2, 3: -1, 5: 1, 7: -2 };
  let checked = 0;
  for (const p of primes) {
    const viaCount = apFromCount(p);
    const viaForm = a[p];
    if (viaCount !== viaForm) {
      throw new Error(`mirror breaks at p=${p}: count says ${viaCount}, coefficient says ${viaForm}`);
    }
    if (Math.abs(viaCount) > 2 * Math.sqrt(p)) {
      throw new Error(`Hasse bound violated at p=${p}: |${viaCount}| > 2*sqrt(${p})`);
    }
    if (anchors[p] !== undefined && viaCount !== anchors[p]) {
      throw new Error(`anchor failed: a_${p} = ${viaCount}, expected ${anchors[p]}`);
    }
    if (pointCount(p) !== p + 1 - viaCount) throw new Error(`pointCount inconsistent at p=${p}`);
    if (affineSolutions(p).length !== pointCount(p) - 1) throw new Error(`affine count inconsistent at p=${p}`);
    if (p !== 11) {
      if (pointCount(p) % 5 !== 0) throw new Error(`5 does not divide #E(F_${p})`);
      const S = new Set(affineSolutions(p).map(([x, y]) => x + ',' + y));
      for (const [x, y] of rationalPointsMod(p)) {
        if (!S.has(x + ',' + y)) throw new Error(`rational point (${x},${y}) missing mod ${p}`);
      }
    }
    if (p % 4 === 3 && apFromCountCM(p) !== 0) throw new Error(`CM curve: a_${p} should be 0`);
    if (p > 2 && Math.abs(apFromCountCM(p)) > 2 * Math.sqrt(p)) throw new Error(`CM Hasse bound at ${p}`);
    checked++;
  }
  // The two product routes (pentagonal-sparse vs factor-by-factor) agree.
  const N = 200;
  const c = new Array(N + 1).fill(0);
  c[0] = 1;
  for (let n = 1; n <= N; n++) {
    multFactor(c, n, N);
    if (n % 11 === 0) multFactor(c, n, N);
  }
  for (let k = 1; k <= N; k++) {
    if (c[k - 1] !== a[k]) throw new Error(`product routes disagree at q^${k}: ${c[k - 1]} vs ${a[k]}`);
  }
  // The bad prime, honestly: 10 affine points, a node at (8,5), a_11 = 1.
  if (affineSolutions(11).length !== 10) throw new Error('p=11: affine count is not 10');
  if ((5 * 5 + 5) % 11 !== ((8 * 8 * 8 - 8 * 8) % 11 + 11) % 11) throw new Error('p=11: node (8,5) not on curve');
  if ((2 * 5 + 1) % 11 !== 0 || (3 * 64 - 2 * 8) % 11 !== 0) throw new Error('p=11: (8,5) is not singular');
  if (a[11] !== 1) throw new Error(`a_11 = ${a[11]}, expected 1`);
  // Hecke multiplicativity, as the prose reads it off the bars.
  if (a[6] !== a[2] * a[3] || a[10] !== a[2] * a[5] || a[4] !== a[2] * a[2] - 2 || a[9] !== a[3] * a[3] - 3) {
    throw new Error('Hecke relations fail');
  }
  // …and in general: a_mn = a_m·a_n for coprime m, n; a_{p²} = a_p² − p at good p; a_121 = a_11².
  const gcd2 = (x, y) => (y ? gcd2(y, x % y) : x);
  for (let m = 2; m <= 30; m++) {
    for (let n = m + 1; n <= 30 && m * n <= limit; n++) {
      if (gcd2(m, n) === 1 && a[m * n] !== a[m] * a[n]) throw new Error(`a_${m * n} ≠ a_${m}·a_${n}`);
    }
  }
  for (const p of primes) {
    if (p * p > limit) break;
    if (a[p * p] !== a[p] * a[p] - (p === 11 ? 0 : p)) throw new Error(`a_{${p}²} breaks the Hecke rule`);
  }
  // The first twenty coefficients as the LMFDB prints them for the newform 11.2.a.a.
  const LMFDB20 = [1, -2, -1, 2, 1, 2, -2, 0, -2, -2, 1, -2, 4, 4, -1, -4, -2, 4, 0, 2];
  for (let n = 1; n <= 20; n++) if (a[n] !== LMFDB20[n - 1]) throw new Error(`a_${n} differs from the LMFDB`);
  if (qTerm(1, 1, true) !== 'q' || qTerm(-2, 2, false) !== '− 2q²' || qTerm(1, 11, false) !== '+ q¹¹') {
    throw new Error('qTerm formatting');
  }
  return { primesChecked: checked, upTo: limit, a2: a[2], a3: a[3], a5: a[5], a7: a[7], a11: a[11] };
}

export const _test = {
  apFromCount, pointCount, affineSolutions, etaCoefficients, multFactor, sievePrimes, selfTest,
  // the name tests.html prefers for the a_p counter
  pointCountAp: apFromCount,
  apFromCountCM, rationalPointsMod, qTerm, supNum, subNum, signed,
};

/* ========================================================================= */

const PRIMES = sievePrimes(997); // the 168 primes below 1000
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const NARROW = 600;              // canvas CSS width below which layouts stack
const ST_LIMIT = 50000, ST_BINS = 40;
const LOCK_ANIM = 1.2;           // seconds of lock flourish

const ALT = 'A three-view instrument. In the mirror, a grid of remainders mod p lights up the ' +
  'solutions of y² + y = x³ − x² as a scan line counts them, beside a bar chart of the coefficients ' +
  'of q∏(1−qⁿ)²(1−q¹¹ⁿ)² being multiplied out; between them the two values of a_p meet at an equals ' +
  'sign, and a strip below plots every a_p for p below 1,000 inside Hasse’s window ±2√p. The ' +
  'Sato–Tate view fills a histogram of angles toward a sin² curve beside a fan of one ray per prime; ' +
  'the map draws the Langlands program as bridges across a strait between two continents.';

export default {
  id: 'rosetta',
  movement: 3,
  title: 'The Rosetta Stone',
  hook: 'Count the solutions of one cubic, prime by prime. Multiply out an infinite product that has never heard of it. The two streams of numbers agree at every prime, forever.',
  era: '1933 – today · Rouen, Tokyo and Nikkō, Princeton',

  prose: `
    <p>Here are two computations that should know nothing of each other. The first is a
    child’s game: pick a prime <em>p</em>, count the pairs of remainders mod <em>p</em> that
    satisfy <code>y²&nbsp;+&nbsp;y&nbsp;=&nbsp;x³&nbsp;−&nbsp;x²</code>, one candidate at a
    time, and add one more point, at infinity. Then record how far the total lands from
    <em>p</em> + 1. That difference is the number
    <code>a<sub>p</sub>&nbsp;=&nbsp;p&nbsp;+&nbsp;1&nbsp;−&nbsp;#E(𝔽<sub>p</sub>)</code>, and
    Helmut Hasse proved in 1933 that it can never stray beyond <code>2√p</code>. The second
    computation lives in another universe. Take the infinite product
    <code>q·∏(1−qⁿ)²(1−q¹¹ⁿ)²</code>, multiply it out term by term, pure bookkeeping with
    exponents and no curve in sight, and read off the coefficient of <code>qᵖ</code>.</p>
    <p>The claim, which you should refuse to believe until the stage has shown you, is that
    the two numbers are <em>equal</em>, at every prime, forever. Count points on a cubic, or
    expand a product that has never heard of the cubic, and the same integers fall out: −2,
    −1, 1, −2, one per prime, without exception. Even at 11, where the curve breaks and
    crosses itself, both roads give 1. The curve is no random choice. Ordered by the
    invariant called the conductor, it is, in Don Zagier’s words, “the simplest elliptic
    curve”, and for it the agreement was proved in the 1950s: Martin Eichler’s congruence
    relation of 1954 gave it at all but finitely many primes, work of Jun-Ichi Igusa in 1959
    extended it to every prime except 11, and at 11 a single count settles it. The
    <em>modularity theorem</em> promises the same kind of twin to every elliptic curve over
    ℚ. Andrew Wiles, with Richard Taylor, proved it in 1995 for the semistable curves, which
    was enough to settle Fermat’s Last Theorem, and Breuil, Conrad, Diamond and Taylor
    finished the rest in 2001. The mirror below lets you verify prime after prime; the
    theorem covers the infinitely many at a single stroke, which is the difference between
    checking and knowing.</p>
    <p>Why anyone dared to look for such a mirror is a story about analogy. On 26 March 1940,
    from a cell in the Bonne-Nouvelle prison at Rouen, André Weil wrote fourteen pages to his
    sister, the philosopher Simone Weil, who had asked what interested him in his work. “My
    work,” he answered, “consists in deciphering a trilingual text; of each of the three
    columns I have only disparate fragments.” One column was Riemann’s theory of algebraic
    functions, one was the theory of numbers, and between them stood the functions over a
    finite field, where one calculates with the numbers 0, 1, 2, …, <em>p</em> − 1 modulo
    <em>p</em>: exactly the arithmetic on the left side of the mirror. Of that middle column
    he wrote: “And just as God defeats the devil: this bridge exists.” His translator, Martin
    Krieger, set a gloss in brackets beside the trilingual text, <em>cf. the Rosetta
    Stone</em>, and this plate takes its name from it. In that prison, too, Weil proved the
    Riemann hypothesis for curves over finite fields, of which Hasse’s window is the case of
    genus one.</p>
    <p>Twenty-seven years later the translation found its grammarian. Early in January 1967
    Robert Langlands, thirty years old, fell into conversation with Weil in a Princeton
    corridor, both of them early for a lecture by Shiing-Shen Chern. Weil, by what Langlands
    later called “a well-known stratagem to escape politely from importunate individuals,”
    suggested that he write it down. The result was seventeen handwritten pages that set the
    Galois groups of arithmetic on one side and the automorphic forms of harmonic analysis on
    the other, with a cover note: <em>“After I wrote it I realized there was hardly a statement
    in it of which I was certain. If you are willing to read it as pure speculation I would
    appreciate that; if not — I am sure you have a waste basket handy.”</em> Weil never
    answered. He had the letter typed, and the typescript passed from hand to hand until it
    became a program.</p>
    <p>Notice which word arrived: <em>harmonic</em>. It is not a flourish. Set
    <code>q&nbsp;=&nbsp;e<sup>2πiz</sup></code> and the product becomes a Fourier series on the upper
    half-plane; its coefficients at the primes are the numbers <em>a<sub>p</sub></em>. When you
    rebuilt a drawing from spinning circles in the <a href="#ex-fourier">Fourier Atelier</a>,
    you were using the mathematics that here reads the solution counts of a cubic out of a
    spectrum. Look at the bars once more and a grammar shows through. The coefficient of
    q⁶ is the product of those of q² and q³, (−2) × (−1) = 2, and the coefficient of q⁴ is
    (−2)² − 2 = 2. The product knows that primes are its atoms, and the rules it obeys are
    enforced by the Hecke operators, a city on the far shore of the map. Langlands
    reciprocity says this is the general situation: the arithmetic of equations is written
    in generalized harmonics, Movement II one level of abstraction up.</p>
    <p>The full program remains conjecture, and the map in this exhibit draws the honest
    boundaries. Class field theory, the GL(1) province, was settled by 1927. Modularity, a
    GL(2) province, is the bridge you are standing on. Over function fields, Vladimir
    Drinfeld proved the correspondence for GL(2) and Laurent Lafforgue for GL(<em>n</em>). And in 2024
    nine mathematicians led by Dennis Gaitsgory and Sam Raskin proved the geometric Langlands
    conjecture in its categorical, unramified form, in five papers running to more than 800
    pages. Proving that every elliptic curve over ℚ has its mirror took from Taniyama’s
    question of 1955 to 2001, and on the way, in 1995, the same proof settled the note Fermat
    had left in a margin three and a half centuries before. One exhibit ago the
    <a href="#ex-beavers">busy beavers</a> showed that mathematics has walls no theory can
    cross. The mirror says it also has tunnels, what Weil in his cell called “the means of
    tunneling under the fort.” Both are facts, and the tension between them is the honest
    state of the field.</p>`,

  chronicle: [
    { year: 1933, date: '1933', text: 'Helmut Hasse proves that the number of points on an elliptic curve counted modulo a prime <em>p</em> never strays more than 2√<em>p</em> from <em>p</em> + 1, a bound Emil Artin had conjectured in his doctoral thesis of 1921; the full proofs appear in 1936.' },
    { year: 1940, date: '26 March 1940', text: 'From the Bonne-Nouvelle prison in Rouen, André Weil writes to his sister Simone that his work consists in <em>“deciphering a trilingual text”</em>: number fields, function fields over finite fields, and Riemann’s algebraic functions.' },
    { year: 1954, date: '1954', text: 'Martin Eichler proves the congruence relation that makes the point counts of y² + y = x³ − x² equal the coefficients of q∏(1−qⁿ)²(1−q¹¹ⁿ)² at all but finitely many primes; in 1959 work of Jun-Ichi Igusa extends it to every prime except the conductor, 11.' },
    { year: 1955, date: '1955', text: 'At the symposium on algebraic number theory in Tokyo and Nikkō, Yutaka Taniyama poses, as the twelfth of 36 problems, a first version of the guess that every elliptic curve is modular.' },
    { year: 1967, date: 'January 1967', text: 'Robert Langlands, thirty years old, writes André Weil a seventeen-page letter by hand proposing that Galois groups and automorphic forms tell one story, with a cover note asking him to read it “as pure speculation”.' },
    { year: 1995, date: 'May 1995', text: 'The <em>Annals of Mathematics</em> publishes Andrew Wiles’s proof, completed with Richard Taylor, that semistable elliptic curves are modular, settling Fermat’s Last Theorem; Breuil, Conrad, Diamond and Taylor extend it to every elliptic curve over ℚ in 2001.' },
    { year: 2008, date: '2008–2010', text: 'Laurent Clozel, Michael Harris, Nicholas Shepherd-Barron and Richard Taylor publish a proof of the Sato–Tate conjecture for elliptic curves with multiplicative reduction at some prime: their Frobenius angles fall as sin²θ.' },
    { year: 2024, date: '2024', text: 'Nine mathematicians led by Dennis Gaitsgory and Sam Raskin prove the categorical, unramified geometric Langlands conjecture, in five papers running to more than 800 pages.' },
  ],

  today: `
    <p>The left road of the mirror takes about <em>p</em> steps: nothing for primes below a
    thousand, hopeless at the sizes that now guard the internet. Curve25519, the curve behind
    the <a href="#ex-handshake">handshake</a>, lives over the 77-digit prime
    2<sup>255</sup> − 19. From the group order published in RFC 7748 its
    <em>a<sub>p</sub></em> is −221,<wbr>938,<wbr>542,<wbr>218,<wbr>978,<wbr>828,<wbr>286,<wbr>815,<wbr>502,<wbr>327,<wbr>069,<wbr>187,<wbr>962, well
    inside Hasse’s window of about ±4.8 × 10<sup>38</sup>, and the RFC names the quantity
    outright: a new curve’s “trace of Frobenius MUST NOT be in {0, 1}”. Counts this large
    come from descendants of René Schoof’s 1985 algorithm, which finds <em>a<sub>p</sub></em>
    modulo many small primes and reassembles it inside that window.</p>
    <p>The mirror keeps widening. Every elliptic curve over a real quadratic field is modular
    (Freitas, Le Hung and Siksek, 2013), and so is every one over ℚ(i) and infinitely many
    other imaginary quadratic fields (Caraiani and Newton, 2023); in 2025 Boxer, Calegari,
    Gee and Pilloni reached a positive proportion of abelian surfaces, one dimension up. In
    2022 He, Lee, Oliver and Pozdnyakov averaged <em>a<sub>p</sub></em> over many curves of
    equal rank and saw waves they named <em>murmurations</em>; Nina Zubrilina proved a case
    of the pattern in <em>Inventiones</em> in 2025.</p>
    <p>In September 2026 Anthropic announced a complete proof of Fermat’s Last Theorem in
    the Lean proof assistant, written by AI agents. It follows the argument of 1995 and stands
    outside Mathlib, Lean’s shared library, so Kevin Buzzard’s project at Imperial College
    London, begun in October 2024 on a newer route designed by Richard Taylor, goes on:
    carrying the objects of modern number theory into Mathlib, and building a document in
    which people can explore the modern proof. The LMFDB lists 3,824,372 elliptic curves over
    ℚ, and the modularity theorem gives every one of them a mirror.</p>`,

  sources: [
    { text: 'André Weil, “A 1940 Letter of André Weil on Analogy in Mathematics”, trans. Martin H. Krieger, <em>Notices of the AMS</em> 52(3) (2005) 334–341', url: 'https://www.ams.org/notices/200503/fea-weil.pdf' },
    { text: 'Arne B. Sletsjøe, “17 handwritten pages that shaped a whole area of mathematical research” (The Abel Prize, 2018)', url: 'https://www.abelprize.no/sites/default/files/2021-04/Robert%20P.%20Langlands%202018%2017%20handwritten%20pages%20that%20shaped%20a%20whole%20area%20of%20mathematical%20research%20Arne%20B.%20Sletsj%C3%B8e.pdf' },
    { text: 'M. Eichler, “Quaternäre quadratische Formen und die Riemannsche Vermutung für die Kongruenzzetafunktion”, <em>Archiv der Mathematik</em> 5 (1954) 355–366', url: 'https://doi.org/10.1007/BF01898377' },
    { text: 'Don Zagier, “Elliptic Modular Forms and Their Applications”, in <em>The 1-2-3 of Modular Forms</em> (Springer, 2008)', url: 'https://people.mpim-bonn.mpg.de/zagier/files/doi/10.1007/978-3-540-74119-0_1/fulltext.pdf' },
    { text: 'Andrew Wiles, “Modular elliptic curves and Fermat’s Last Theorem”, <em>Annals of Mathematics</em> 141 (1995) 443–551; the argument is surveyed by Henri Darmon, Fred Diamond and Richard Taylor, “Fermat’s Last Theorem” (1995, revised 2007)', url: 'https://www.math.mcgill.ca/darmon/pub/Articles/Expository/05.DDT/paper.pdf' },
    { text: 'Kevin Buzzard, “FLT: Anthropic has beaten me to it”, Xena Project (4 September 2026)', url: 'https://xenaproject.wordpress.com/2026/09/04/flt-anthropic-has-beaten-me-to-it/' },
    { text: 'M. Harris, N. Shepherd-Barron and R. Taylor, “A family of Calabi–Yau varieties and potential automorphy”, <em>Annals of Mathematics</em> 171 (2010) 779–813', url: 'https://doi.org/10.4007/annals.2010.171.779' },
    { text: 'Erica Klarreich, “Monumental Proof Settles Geometric Langlands Conjecture”, <em>Quanta Magazine</em> (19 July 2024)', url: 'https://www.quantamagazine.org/monumental-proof-settles-geometric-langlands-conjecture-20240719/' },
    { text: 'Nina Zubrilina, “Murmurations”, <em>Inventiones mathematicae</em> 241 (2025) 627–680', url: 'https://doi.org/10.1007/s00222-025-01347-8' },
    { text: 'LMFDB, elliptic curve 11.a3 (Cremona 11a3): y² + y = x³ − x²', url: 'https://www.lmfdb.org/EllipticCurve/Q/11/a/3' },
  ],

  alt: ALT,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const clamp = math.clamp;
    const SERIF = (() => {
      try { return getComputedStyle(document.body).fontFamily || 'Georgia, serif'; } catch (e) { return 'Georgia, serif'; }
    })();
    const fS = (px, style = '') => `${style} ${px}px ${SERIF}`.trim();
    const fM = (px, weight = '') => `${weight} ${px}px ${MONO}`.trim();
    const reduceMotion = (() => {
      try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    })();
    const fmtN = (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US');

    // ---------- scoped style ----------
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-rosetta .ros-panel { display:none; margin-top:.7rem; padding:.85rem 1.1rem;
        background:${P.panel}; border:1px solid ${P.line}; border-left:3px solid ${P.gold};
        color:${P.inkDim}; font-size:.94rem; line-height:1.62; }
      #ex-rosetta .ros-panel h4 { color:${P.ink}; font-size:1rem; margin:0 0 .3rem;
        font-weight:600; letter-spacing:.03em; }
      #ex-rosetta .ros-panel .ros-status { font-family:${MONO}; font-size:.76rem;
        color:${P.inkDim}; margin-bottom:.5rem; letter-spacing:.02em; }
      #ex-rosetta .ros-panel em { color:${P.gold}; }
      #ex-rosetta .ros-tabs { margin-top:0; }
      #ex-rosetta canvas { cursor:default; }
      #ex-rosetta .mathline .ros-nw { white-space:nowrap; display:inline-block; margin:0 .2em; }
      #ex-rosetta canvas:focus-visible { outline:2px solid ${P.goldBright}; outline-offset:3px; }
    `;
    stage.appendChild(styleEl);

    // ---------- state ----------
    const aForm = etaCoefficients(1024);   // our own coefficients of f, once
    let view = 'mirror';
    let needsRedraw = true;
    let primeIdx = 5;                       // start at p = 13
    let data = null;                        // curve data for current prime
    let revL = 0, revR = 0;                 // reveal fraction, each side
    let runL = false, runR = false;         // animating?
    let pausedRun = { L: false, R: false };
    let poly = null, polyN = 0;             // live product state (right side)
    let locked = false;                     // both sides revealed and agreed
    let lockT = LOCK_ANIM;                  // seconds since the lock
    let pulse = null;                       // { p, t } newest match on the Hasse strip
    let fadeT = 1;                          // seconds since the prime changed (for a soft fade-in)
    let chartMax = 4;
    const matched = new Map();              // p -> a_p, every agreement seen so far
    let questDone = false;

    let scheduler = null, sweeping = false;
    let sweepQueue = [];

    // hover & pointer state
    let hover = null, hoverPos = null, scrub = false;
    let gridGeom = null, hasseGeom = null;

    // Sato–Tate: one accumulator per curve ('E' ours, 'CM' y² = x³ − x)
    const makeST = () => ({ bins: new Uint32Array(ST_BINS), count: 0, maxP: 0, next: 0, done: false,
      angles: null, zeros: 0, m3: 0, m3zeros: 0, last: -1 });
    const ST = { E: makeST(), CM: makeST() };
    let stKey = 'E', stRunning = false, stWorker = null, stTotal = 0, stTimer = 0;
    let stResume = false;                   // a count the visitor started, interrupted by pause()
    let rays = null;                        // offscreen fan of rays for the current curve

    // audio
    const bus = audio.createBus('rosetta');
    let vL = null, vR = null, voicesOn = false;
    let timers = [];

    // ---------- layout ----------
    const tabs = ui.controlRow(stage);
    tabs.classList.add('ros-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'views of the exhibit');
    const tabBtns = {};
    tabBtns.mirror = ui.button(tabs, 'the mirror', () => setView('mirror'));
    tabBtns.sato = ui.button(tabs, 'Sato–Tate', () => setView('sato'));
    tabBtns.map = ui.button(tabs, 'the map', () => setView('map'));

    const cvOpts = { height: 550 };
    const handle = cv.setupCanvas(stage, cvOpts);
    const canvas = handle.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', ALT);
    canvas.style.touchAction = 'pan-y';     // phones can still scroll past the tall plate
    const BG = (() => {
      try {
        const c = getComputedStyle(canvas).backgroundColor;
        return c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' ? c : P.bg;
      } catch (e) { return P.bg; }
    })();
    const glowGold = cv.glowSprite(P.gold, 96);
    const glowAzure = cv.glowSprite(P.azure, 48);
    const glowCrimson = cv.glowSprite(P.crimson, 48);

    const rowMirror = ui.controlRow(stage);
    const primeStep = ui.stepper(rowMirror, {
      label: 'prime p', min: 0, max: PRIMES.length - 1, value: primeIdx,
      format: (i) => String(PRIMES[i]),
      onChange: (i) => choosePrime(i),
    });
    ui.button(rowMirror, '⟡ hold up the mirror', () => { startLeft(); startRight(); }, { primary: true });
    ui.button(rowMirror, 'just count', () => startLeft(), { small: true });
    ui.button(rowMirror, 'just multiply', () => startRight(), { small: true });
    const sweepBtn = ui.button(rowMirror, '▶ run the primes', toggleSweep);

    const rowSato = ui.controlRow(stage);
    const stBtn = ui.button(rowSato, '▶ count every prime below 50,000', toggleSato, { primary: true });
    const cmToggle = ui.toggle(rowSato, {
      label: 'compare: y² = x³ − x, a curve with complex multiplication', value: false,
      onChange: (v) => setSatoCurve(v ? 'CM' : 'E'),
    });

    const rowMap = ui.controlRow(stage);
    const bridgeSel = ui.select(rowMap, {
      label: 'read a bridge',
      options: [{ value: '-1', label: 'choose a bridge…' }],
      value: '-1',
      onChange: (v) => { const i = +v; if (i >= 0) selectBridge(i, true); },
    });
    const zoomIn = ui.button(rowMap, '+', () => zoomBy(1.3), { small: true });
    zoomIn.setAttribute('aria-label', 'zoom in');
    const zoomOut = ui.button(rowMap, '−', () => zoomBy(1 / 1.3), { small: true });
    zoomOut.setAttribute('aria-label', 'zoom out');
    ui.button(rowMap, 'recenter the map', () => { fitMap(); needsRedraw = true; }, { small: true });

    const info = ui.readout(stage, '');
    const mapPanel = document.createElement('div');
    mapPanel.className = 'ros-panel';
    mapPanel.setAttribute('aria-live', 'polite');
    stage.appendChild(mapPanel);

    const quest = ui.questBanner(stage,
      'Break the mirror: find one prime, any prime, where the count and the coefficient disagree.');
    ui.mathline(stage,
      '<span class="ros-nw">a<sub>p</sub> = p + 1 − #E(𝔽<sub>p</sub>)</span> ' +
      '<span class="ros-nw">= [q<sup>p</sup>]&thinsp;q·∏(1−q<sup>n</sup>)²(1−q<sup>11n</sup>)²</span> ' +
      '<span class="ros-nw" style="color:' + P.inkDim + '">(every prime p · |a<sub>p</sub>| ≤ 2√p)</span>');
    const CAPTIONS = {
      mirror: 'Left, the <em>p</em> × <em>p</em> pairs of remainders, each solution of ' +
        'y² + y = x³ − x² lit as the scan counts it; the strip beneath marks each column with two ' +
        'solutions (gold), one (grey) or none (dark), and its running sum is −<em>a<sub>p</sub></em>. ' +
        'Right, the product multiplied out one factor at a time, its settled coefficients in blue. ' +
        'Four ringed points never move: (0, 0), (1, 0), (0, −1) and (1, −1), the last two in the top ' +
        'row. With the point at infinity they are the curve’s only five rational solutions, and they ' +
        'survive reduction modulo every prime, which is why the count at every prime but 11 is a ' +
        'multiple of five. Hover the grid to check a pair by hand; tap Hasse’s window to jump to a prime.',
      sato: 'Each prime gives an angle, cos θ<sub>p</sub> = <em>a<sub>p</sub></em> ⁄ 2√p. Mikio Sato ' +
        'and John Tate, independently, around 1960, guessed that the angles pile up like sin²θ. For ' +
        'curves with multiplicative reduction at some prime, as ours has at 11, Clozel, Harris, ' +
        'Shepherd-Barron and Taylor proved it in papers published from 2008 to 2010, and by 2011 the ' +
        'law covered every curve without complex multiplication; the comparison switch shows why that ' +
        'exception is needed. On the right, each prime draws one ray at its angle. Counting like this ' +
        'is itself history: in the early 1960s Peter Swinnerton-Dyer ran point counts on Cambridge’s ' +
        'EDSAC-2, and with Bryan Birch turned them into a conjecture that is now a Millennium Prize ' +
        'Problem.',
      map: 'Two continents, one strait: the Galois side of arithmetic and the automorphic side of ' +
        'harmonic analysis. Solid spans are theorems, the dashed span is under construction, and the ' +
        'dotted line is a physics ferry. Choose a bridge from the list, or click one, to read its story. ' +
        'Drag to pan; zoom with the buttons, a pinch, or ⌘/ctrl with the scroll wheel.',
    };
    const captionEl = ui.caption(stage, CAPTIONS.mirror);
    ui.legendPanel(stage,
      '<p>“There are five elementary operations in mathematics: addition, subtraction, ' +
      'multiplication, division, and modular forms.” The line is almost always credited to Martin ' +
      'Eichler (1912–1992), whose congruence relation of 1954 is the first stone under this page’s ' +
      'mirror. We have not found it in his own writing, and it wanders between attributions the way ' +
      'good lines do. The conjecture’s name wanders too. It went, as Don Zagier put it, by “various ' +
      'subsets of the names Taniyama, Weil and Shimura, although none of these three people had ever ' +
      'stated the conjecture explicitly in print.”</p>');
    ui.speculationPanel(stage,
      '<p>In 2006 Anton Kapustin and Edward Witten derived the geometric Langlands correspondence ' +
      'from <em>S-duality</em>, the electric–magnetic symmetry of N = 4 supersymmetric Yang–Mills ' +
      'theory. It is physics-grade reasoning, precise on its own terms and not a theorem, and the map ' +
      'draws it as a dotted ferry from the far shore. One step further out: whether the Langlands ' +
      'correspondence means that arithmetic and analysis are two shadows of a single undiscovered ' +
      'object is not mathematics yet. It is the direction several roads point.</p>');

    // ---------- per-prime data ----------
    function curveData(p) {
      const pts = affineSolutions(p);
      const col = new Uint8Array(p);          // solutions per column: 0, 1 or 2
      for (const q of pts) col[q[0]]++;
      const chiPrefix = new Int32Array(p + 1); // Σ(col − 1) = −(running a_p)
      for (let x = 0; x < p; x++) chiPrefix[x + 1] = chiPrefix[x] + (col[x] - 1);
      return { p, pts, col, chiPrefix, ap: apFromCount(p), bad: p === 11, sing: p === 11 ? [8, 5] : null };
    }

    function refreshChartMax(p) {
      chartMax = 4;
      for (let k = 1; k <= p; k++) chartMax = Math.max(chartMax, Math.abs(aForm[k]));
    }

    function setPrime() {
      stopAnims();
      clearTimers();
      const p = PRIMES[primeIdx];
      data = curveData(p);
      const known = matched.has(p);
      revL = known ? 1 : 0;
      revR = known ? 1 : 0;
      locked = known;
      lockT = LOCK_ANIM;
      poly = null; polyN = 0;
      refreshChartMax(p);
      if (!sweeping && !reduceMotion) fadeT = 0;
      if (hover && hover.kind === 'cell') hover = null;
      updateInfo();
      needsRedraw = true;
    }

    function choosePrime(i) {
      if (sweeping) stopSweep();
      primeIdx = clamp(i, 0, PRIMES.length - 1);
      primeStep.set(primeIdx);
      setPrime();
    }

    const animDur = (p) => (reduceMotion ? 0.45 : 1.3 + 2.3 * (p / 997));
    function fOf(v) {
      const W = 2 * Math.sqrt(data.p);
      return 392 * Math.pow(2, clamp(v / W, -1, 1) * 7 / 12);
    }

    // ---------- audio ----------
    function ensureVoices() {
      if (vL) return;
      vL = audio.voice(bus, { type: 'sine', freq: 392, level: 0.16, pan: -0.4 });
      vR = audio.voice(bus, { type: 'triangle', freq: 392, level: 0.12, pan: 0.4 });
    }
    function fadeVoicesSoon(s) {
      timers.push(setTimeout(() => {
        if (vL) vL.off();
        if (vR) vR.off();
        voicesOn = false;
      }, s * 1000));
    }
    function silenceVoices() {
      if (vL) vL.off();
      if (vR) vR.off();
      voicesOn = false;
    }
    function clearTimers() {
      for (const t of timers) clearTimeout(t);
      timers = [];
    }

    // ---------- the mirror: animations ----------
    function startLeft() {
      if (sweeping) return;
      audio.ensureAudio();
      clearTimers();                        // a pending fade must not cut this hum short
      ensureVoices();
      revL = 0; runL = true; locked = false;
      voicesOn = true; vL.on();
      updateInfo(); needsRedraw = true;
    }
    function startRight() {
      if (sweeping) return;
      audio.ensureAudio();
      clearTimers();
      ensureVoices();
      const p = data.p;
      poly = new Array(p).fill(0); poly[0] = 1; polyN = 0;
      revR = 0; runR = true; locked = false;
      voicesOn = true; vR.on();
      updateInfo(); needsRedraw = true;
    }
    function stopAnims() {
      runL = false; runR = false;
      silenceVoices();
    }

    function finishSide(side) {
      if (side === 'L' && vL && voicesOn) vL.setFreq(fOf(data.ap));
      if (side === 'R' && vR && voicesOn) vR.setFreq(fOf(aForm[data.p]));
      if (revL >= 1 && revR >= 1) {
        if (!locked) doLock();
      } else if (!runL && !runR) {
        fadeVoicesSoon(1.1); // only one side was run; let its hum settle out
      }
    }

    function doLock() {
      const p = data.p;
      const actx = audio.getContext();
      if (data.ap === aForm[p]) {
        locked = true;
        lockT = 0;
        const fresh = !matched.has(p);
        matched.set(p, data.ap);
        if (fresh && !reduceMotion) pulse = { p, t: 0 };
        if (actx) {
          const t = actx.currentTime + 0.03;
          const f = fOf(data.ap);
          if (data.bad) audio.drums.thock(bus, t, { level: 0.42 }); // the bad prime thuds, then agrees
          audio.playTone(bus, { freq: f, dur: 0.5, level: 0.34, pan: -0.4, when: t + (data.bad ? 0.1 : 0) });
          audio.playTone(bus, { freq: f, dur: 0.5, level: 0.3, type: 'triangle', pan: 0.4, when: t + (data.bad ? 0.1 : 0) });
          audio.playTone(bus, { freq: f * 1.5, dur: 0.7, level: 0.18, when: t + 0.16 + (data.bad ? 0.1 : 0) });
        }
        questCheck();
      } else {
        // selfTest proves this branch unreachable; honesty demands it exist.
        info.set('THE MIRROR CRACKED at p = ' + p + ', which is impossible: this is a bug, not mathematics.');
      }
      fadeVoicesSoon(0.7);
      updateInfo();
      needsRedraw = true;
    }

    function questCheck() {
      if (!questDone && matched.size >= 25) {
        questDone = true;
        quest.done(matched.size + ' primes mirrored, zero cracks, and there are none to find. For ' +
          'this curve Eichler’s congruence relation of 1954, completed by Igusa in 1959, already covered ' +
          'every prime but 11 at once, and 11 is a single count; in 1995–2001 Wiles, Taylor, Breuil, ' +
          'Conrad and Diamond proved that every ' +
          'elliptic curve over ℚ has such a mirror.');
      }
    }

    // ---------- the sweep ----------
    function toggleSweep() {
      if (sweeping) { stopSweep(); return; }
      audio.ensureAudio();
      stopAnims();
      clearTimers();
      sweeping = true;
      sweepBtn.textContent = '■ stop the sweep';
      let i = 0;
      scheduler = audio.createScheduler((t) => {
        if (i >= PRIMES.length) {
          sweepQueue.push({ i: -1, at: t });
          return null;
        }
        const p = PRIMES[i];
        const ap = apFromCount(p);
        const f = 392 * Math.pow(2, (ap / (2 * Math.sqrt(p))) * 7 / 12);
        if (p === 11) audio.drums.rim(bus, t, { level: 0.4 });
        audio.playTone(bus, { freq: f, dur: 0.15, level: 0.28, pan: -0.45, when: t });
        audio.playTone(bus, { freq: f, dur: 0.15, level: 0.24, type: 'triangle', pan: 0.45, when: t });
        sweepQueue.push({ i, at: t });
        i++;
        return t + Math.max(reduceMotion ? 0.22 : 0.06, 0.5 * Math.pow(0.964, i));
      });
      scheduler.start();
    }
    function stopSweep() {
      if (scheduler) { scheduler.stop(); scheduler = null; }
      sweeping = false;
      sweepQueue = [];
      sweepBtn.textContent = '▶ run the primes';
    }
    function showPrimeInstant(i) {
      primeIdx = i;
      primeStep.set(i);
      const p = PRIMES[i];
      data = curveData(p);
      revL = 1; revR = 1; locked = true; poly = null; polyN = 0;
      lockT = reduceMotion ? LOCK_ANIM : 0.85;   // a gentler flash at sweep speed
      refreshChartMax(p);
      if (data.ap === aForm[p]) {
        if (!matched.has(p) && !reduceMotion) pulse = { p, t: 0 };
        matched.set(p, data.ap);
      }
      updateInfo();
      questCheck();
      needsRedraw = true;
    }
    function finishSweep() {
      stopSweep();
      info.set('All ' + PRIMES.length + ' primes below 1,000 swept: ' + matched.size +
        ' agreements, zero disagreements, the bad prime 11 included. The Sato–Tate view keeps ' +
        'counting to 50,000.');
    }

    // ---------- Sato–Tate ----------
    function stTotalCount() {
      if (!stTotal) stTotal = sievePrimes(ST_LIMIT - 1).length - 1; // minus one bad prime
      return stTotal;
    }
    function stLabel() {
      const st = ST[stKey];
      stBtn.textContent = stRunning ? '❚❚ pause the count'
        : st.done ? '↺ count again'
          : st.count > 0 ? '▶ resume the count'
            : '▶ count every prime below 50,000';
    }
    function stopSatoWorker() {
      if (stWorker) { stWorker.terminate(); stWorker = null; }
      if (stTimer) { clearTimeout(stTimer); stTimer = 0; }
    }

    function absorbPairs(key, pairs, next, done) {
      const st = ST[key];
      if (!st.angles) st.angles = new Float32Array(stTotalCount());
      let sumCos = 0, n = 0;
      for (let j = 0; j + 1 < pairs.length; j += 2) {
        const p = pairs[j], ap = pairs[j + 1];
        if (Math.abs(ap) > 2 * Math.sqrt(p)) {
          info.set('Hasse bound violated at p = ' + p + ', which is impossible: this is a bug.');
          continue;
        }
        const c = clamp(ap / (2 * Math.sqrt(p)), -1, 1);
        const th = Math.acos(c);
        st.bins[Math.min(ST_BINS - 1, Math.floor((th / Math.PI) * ST_BINS))]++;
        if (st.count < st.angles.length) st.angles[st.count] = th;
        st.count++; st.maxP = p; st.last = th;
        if (ap === 0) st.zeros++;
        if (p % 4 === 3) { st.m3++; if (ap === 0) st.m3zeros++; }
        sumCos += c; n++;
      }
      st.next = next;
      const actx = audio.getContext();
      const audible = actx && view === 'sato' && key === stKey && stRunning;
      if (n && audible) {
        // a soft geiger tick per batch, pitched by the batch's mean angle
        audio.playTone(bus, {
          freq: 520 * Math.pow(2, (sumCos / n) * 5 / 12),
          dur: 0.05, level: 0.12, when: actx.currentTime + 0.01,
        });
      }
      if (done) {
        st.done = true;
        if (key === stKey) {
          stRunning = false;
          stopSatoWorker();
          if (actx && view === 'sato') {
            const t = actx.currentTime + 0.05;
            audio.playTone(bus, { freq: 523.25, dur: 0.5, level: 0.3, when: t });
            audio.playTone(bus, { freq: 784, dur: 0.8, level: 0.22, when: t + 0.14 });
          }
        }
      }
      stLabel();
      updateInfo();
      needsRedraw = true;
    }

    function workerSource() {
      return "'use strict';\n" +
        'const apFromCount = ' + apFromCount.toString() + ';\n' +
        'const apFromCountCM = ' + apFromCountCM.toString() + ';\n' +
        'self.onmessage = function (e) {\n' +
        '  const from = e.data.from, limit = e.data.limit, cm = e.data.cm;\n' +
        '  const bad = cm ? 2 : 11, count = cm ? apFromCountCM : apFromCount;\n' +
        '  const sieve = new Uint8Array(limit + 1);\n' +
        '  const primes = [];\n' +
        '  for (let i = 2; i <= limit; i++) if (!sieve[i]) { primes.push(i); for (let j = i * i; j <= limit; j += i) sieve[j] = 1; }\n' +
        '  let batch = [];\n' +
        '  for (let k = from; k < primes.length; k++) {\n' +
        '    const p = primes[k];\n' +
        '    if (p === bad) continue;\n' +
        '    batch.push(p, count(p));\n' +
        '    if (batch.length >= 400) { postMessage({ pairs: batch, next: k + 1, done: false }); batch = []; }\n' +
        '  }\n' +
        '  postMessage({ pairs: batch, next: primes.length, done: true });\n' +
        '};\n';
    }

    function toggleSato() {
      audio.ensureAudio();
      if (stRunning) { // pause
        stRunning = false;
        stopSatoWorker();
        stLabel(); updateInfo(); needsRedraw = true;
        return;
      }
      startSato();
    }

    function startSato() {
      const key = stKey;
      if (ST[key].done) { ST[key] = makeST(); rays = null; }
      stTotalCount();
      stRunning = true;
      stLabel();
      const cm = key === 'CM';
      // guard: Workers absent (node, exotic embeds) -> chunked main-thread fallback
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        mainThreadSato(key);
        updateInfo();
        return;
      }
      try {
        const url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
        const w = new Worker(url);
        URL.revokeObjectURL(url);
        stWorker = w;
        w.onmessage = (e) => {
          if (stWorker !== w || !stRunning || stKey !== key) return; // late batch after a pause
          absorbPairs(key, e.data.pairs, e.data.next, e.data.done);
        };
        w.onerror = () => {
          if (stWorker === w) { stopSatoWorker(); mainThreadSato(key); } // fall back rather than fail
        };
        w.postMessage({ from: ST[key].next, limit: ST_LIMIT - 1, cm });
      } catch (err) {
        stWorker = null;
        mainThreadSato(key);
      }
      updateInfo();
      needsRedraw = true;
    }

    function mainThreadSato(key) {
      const primes = sievePrimes(ST_LIMIT - 1);
      const bad = key === 'CM' ? 2 : 11;
      const count = key === 'CM' ? apFromCountCM : apFromCount;
      const step = () => {
        if (!stRunning || stKey !== key) return;
        const st = ST[key];
        const end = Math.min(st.next + 80, primes.length);
        const pairs = [];
        for (let k = st.next; k < end; k++) {
          const p = primes[k];
          if (p === bad) continue;
          pairs.push(p, count(p));
        }
        absorbPairs(key, pairs, end, end >= primes.length);
        if (end < primes.length && stRunning) stTimer = setTimeout(step, 0);
      };
      step();
    }

    function setSatoCurve(key) {
      if (key === stKey) return;
      stResume = false;
      if (stRunning) { stRunning = false; stopSatoWorker(); }
      stKey = key;
      rays = null;
      stLabel();
      updateInfo();
      needsRedraw = true;
    }

    // ---------- the map: world, bridges, cities ----------
    const MAPBOX = { x0: -350, x1: 350, y0: -212, y1: 246 };
    const WEST = { cx: -240, cy: 0, rx: 130, ry: 248, seed: 3.1 };
    const EAST = { cx: 240, cy: 0, rx: 130, ry: 248, seed: 8.7 };
    function coastPoly(c, k = 1, K = 96) {
      const out = [];
      for (let i = 0; i < K; i++) {
        const a = (i / K) * math.TAU;
        const wob = 1 + 0.06 * Math.sin(c.seed + a * 3) + 0.045 * Math.sin(c.seed * 2.3 + a * 7) +
          0.025 * Math.sin(c.seed * 4.1 + a * 11);
        out.push(c.cx + Math.cos(a) * c.rx * wob * k, c.cy + Math.sin(a) * c.ry * wob * k);
      }
      return out;
    }
    const westPoly = coastPoly(WEST), eastPoly = coastPoly(EAST);
    // x of the coast facing the strait, at height y
    function innerX(poly, y, east) {
      let best = east ? Infinity : -Infinity;
      const n = poly.length / 2;
      for (let i = 0; i < n; i++) {
        const x1 = poly[2 * i], y1 = poly[2 * i + 1];
        const j = (i + 1) % n;
        const x2 = poly[2 * j], y2 = poly[2 * j + 1];
        if ((y1 - y) * (y2 - y) > 0 || y1 === y2) continue;
        const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
        best = east ? Math.min(best, x) : Math.max(best, x);
      }
      return isFinite(best) ? best : (east ? EAST.cx - EAST.rx : WEST.cx + WEST.rx);
    }

    const BRIDGES = [
      {
        name: 'class field theory', status: 'standing · Artin, 1927', kind: 'built', y: 150,
        html: '<h4>Class field theory: the oldest span</h4><div class="ros-status">standing · GL(1) · ' +
          'Hilbert, Takagi, Artin, 1927</div>The GL(1) province, and the program’s ancestor. The abelian ' +
          'extensions of a number field are governed by the arithmetic of the field itself, and every ' +
          'reciprocity law since Gauss’s quadratic one folds into Artin’s of 1927. Writing from prison in ' +
          '1940, Weil stopped to tell his sister that this theory “is most often called ‘class field ' +
          'theory’”. Langlands’s conjectures are what it looks like continued beyond the abelian world.',
      },
      {
        name: 'modularity', status: 'standing · 1995–2001', kind: 'built', y: 86, pin: true,
        html: '', // filled at click time: includes the visitor's own match count
      },
      {
        name: 'function fields', status: 'standing · Drinfeld, L. Lafforgue', kind: 'built', y: 22,
        html: '<h4>Function fields: Weil’s middle column</h4><div class="ros-status">standing · GL(n) · ' +
          'Drinfeld, then Laurent Lafforgue</div>Over function fields, where numbers behave like ' +
          'polynomials over a finite field, the full correspondence for GL(n) is a theorem: Vladimir ' +
          'Drinfeld built GL(2), and Laurent Lafforgue completed GL(n), work recognized with the Fields ' +
          'Medal in 2002. In 2018 Vincent Lafforgue built the direction from automorphic forms to Galois ' +
          'representations for every reductive group over function fields. This is the middle column of ' +
          'Weil’s trilingual text, the one he called a bridge and then, more exactly, a turntable.',
      },
      {
        name: 'geometric Langlands', status: 'opened 2024 · categorical, unramified', kind: 'new', y: -42,
        html: '<h4>Geometric Langlands: the newest span</h4><div class="ros-status">opened 2024 · ' +
          'categorical, unramified · characteristic 0</div>In 2024 nine mathematicians led by Dennis ' +
          'Gaitsgory and Sam Raskin proved the geometric Langlands conjecture in its categorical, ' +
          'unramified form, set on Riemann surfaces rather than over number fields: five ' +
          'papers, more than 800 pages. It answers in the third column of Weil’s trilingual text, the one ' +
          'written in Riemann’s language, and in April 2025 it brought Gaitsgory the Breakthrough Prize in ' +
          'Mathematics.',
      },
      {
        name: 'functoriality', status: 'under construction', kind: 'construction', y: -106,
        html: '<h4>Functoriality: the great unbuilt span</h4><div class="ros-status">under construction ' +
          '· conjectural in general</div>Langlands’s functoriality conjecture, that maps between dual ' +
          'groups carry automorphic forms from one group to another, is the arch the program leans on; ' +
          'reciprocity itself can be read as a special case. It is open in general. Piers stand in the ' +
          'water: cyclic base change; endoscopy, resting on Ngô Bảo Châu’s proof of the fundamental lemma ' +
          '(Fields Medal, 2010); and since 2019–2020 James Newton and Jack Thorne’s symmetric-power ' +
          'functoriality for every holomorphic eigenform, the form on this page included. The deck between ' +
          'the piers is not there yet.',
      },
      {
        name: 'Kapustin–Witten', status: 'physics ferry · 2006', kind: 'ferry', y: -170,
        html: '<h4>Kapustin–Witten: the physics ferry</h4><div class="ros-status">dotted line · 2006 · ' +
          'not a theorem</div>In 2006 Anton Kapustin and Edward Witten derived geometric Langlands duality ' +
          'from <em>S-duality</em>, the electric–magnetic symmetry of N = 4 supersymmetric Yang–Mills ' +
          'theory, in a paper of more than two hundred pages. The reasoning is physics-grade: exact in its ' +
          'own terms, unproved in ours. The ferry runs, and passengers report that the far shore is real; ' +
          'the mathematicians are still inspecting the hull.',
      },
    ];
    for (const b of BRIDGES) {
      b.ax = innerX(westPoly, b.y, false) - 5;
      b.bx = innerX(eastPoly, b.y, true) + 5;
      b.mx = (b.ax + b.bx) / 2;
    }
    BRIDGES.forEach((b, i) => {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = b.name;
      bridgeSel.select.appendChild(o);
    });
    const CITIES = [
      { x: -232, y: 132, t: 'Gal(ℚ̄/ℚ)', mono: true },
      { x: -246, y: 52, t: 'y² + y = x³ − x²', mono: true, core: true },
      { x: -222, y: -36, t: 'Frobenius', core: true },
      { x: -246, y: -124, t: 'ζ and L-functions' },
      { x: 232, y: 132, t: 'the upper half-plane' },
      { x: 246, y: 52, t: 'q∏(1−qⁿ)²(1−q¹¹ⁿ)²', mono: true, core: true },
      { x: 222, y: -36, t: 'Hecke operators', core: true },
      { x: 246, y: -124, t: 'spectra' },
    ];
    const bridgeColor = (b) => (b.kind === 'new' ? P.azure : b.kind === 'ferry' ? P.crimsonBright :
      b.kind === 'construction' ? P.inkDim : P.gold);

    const pz = new cv.PanZoom(handle, {
      scale: 1, x: 0, y: 17, minScale: 0.25, maxScale: 5,
      onChange: () => { needsRedraw = true; },
    });
    let mapFitted = false;
    function fitMap() {
      const W = handle.width, H = handle.height;
      mapFitted = true;
      if (W < NARROW) { // phones: the strait and its bridges fill the plate
        pz.scale = clamp((W - 64) / 250, 0.3, 2);
        pz.x = 0; pz.y = 0;
        return;
      }
      pz.scale = clamp(Math.min((W - 16) / (MAPBOX.x1 - MAPBOX.x0), (H - 20) / (MAPBOX.y1 - MAPBOX.y0)), 0.25, 3);
      pz.x = (MAPBOX.x0 + MAPBOX.x1) / 2;
      pz.y = (MAPBOX.y0 + MAPBOX.y1) / 2 - (W < NARROW ? 0 : 6 / pz.scale);
      mapFitted = true;
    }
    function zoomBy(f) {
      pz.zoomAt(handle.width / 2, handle.height / 2, f);
      needsRedraw = true;
    }
    let selBridge = -1, mapHover = -1;
    let bridgeScreens = []; // sampled screen polylines for hit-testing
    let mapHintT = 0;

    function modularityHtml() {
      const n = matched.size;
      return '<h4>Modularity: the bridge you stood on</h4><div class="ros-status">standing · a GL(2) ' +
        'province · Wiles–Taylor 1995, Breuil–Conrad–Diamond–Taylor 2001</div>Every elliptic curve over ℚ ' +
        'is modular: its point counts are the Fourier coefficients of a modular form. For the curve on ' +
        'this page the span was already standing in the 1950s, on Eichler’s and Igusa’s foundations. ' +
        'Andrew Wiles, with Richard Taylor, raised the semistable span in 1995, enough to carry Fermat’s ' +
        'Last Theorem across, and Breuil, Conrad, Diamond and Taylor finished the deck in 2001. <em>You ' +
        'stood here: ' + (n > 0 ? n + ' prime' + (n === 1 ? '' : 's') + ' mirrored by your own machine.' :
        'hold up the mirror in the first view, then come back.') + '</em>';
    }

    function selectBridge(i, fromList) {
      selBridge = i;
      const b = BRIDGES[i];
      mapPanel.innerHTML = b.pin ? modularityHtml() : b.html;
      mapPanel.style.borderLeftColor = bridgeColor(b);
      mapPanel.style.display = 'block';
      if (!fromList) bridgeSel.set(String(i));
      needsRedraw = true;
    }

    function segDist(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1) : 0;
      const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
      return Math.sqrt(ex * ex + ey * ey);
    }
    function bridgeAt(sx, sy) {
      let best = -1, bestD = 13;
      for (let i = 0; i < bridgeScreens.length; i++) {
        const pts = bridgeScreens[i];
        for (let j = 0; j + 3 < pts.length; j += 2) {
          const d = segDist(sx, sy, pts[j], pts[j + 1], pts[j + 2], pts[j + 3]);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      return best;
    }

    // ---------- view switching ----------
    function wantHeight(W) {
      if (view === 'mirror') {
        if (W >= NARROW) return Math.floor(Math.min(340, W * 0.34)) + 212;
        const S = Math.floor(Math.min(W - 24, 330));
        return S + 426;
      }
      if (view === 'sato') {
        if (W >= NARROW) return 470;
        const R = Math.max(40, Math.min(W / 2 - 28, 118));
        return Math.round(40 + 220 + 92 + R + 46);
      }
      if (W >= NARROW) return 530;
      return Math.round(350 * clamp((W - 64) / 250, 0.3, 2) + 76);
    }
    function fitHeight() {
      const want = wantHeight(handle.width);
      if (Math.abs(want - handle.height) < 0.5) return;
      cvOpts.height = want;
      const dpr = handle.dpr || 1;
      canvas.height = Math.round(want * dpr);
      canvas.style.height = want + 'px';
      handle.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      handle.height = want;
      rays = null;
      if (view === 'map') fitMap();
      needsRedraw = true;
    }
    let selBridgeMoved = false; // becomes true once the visitor pans or zooms the map
    handle.onResize(() => {
      fitHeight();
      rays = null;
      if (view === 'map' && !selBridgeMoved) fitMap();
      needsRedraw = true;
    });

    function setView(v) {
      view = v;
      for (const k of Object.keys(tabBtns)) {
        tabBtns[k].classList.toggle('active', k === v);
        tabBtns[k].setAttribute('aria-pressed', String(k === v));
      }
      rowMirror.style.display = v === 'mirror' ? '' : 'none';
      rowSato.style.display = v === 'sato' ? '' : 'none';
      rowMap.style.display = v === 'map' ? '' : 'none';
      quest.el.style.display = v === 'mirror' ? '' : 'none';
      mapPanel.style.display = (v === 'map' && selBridge >= 0) ? 'block' : 'none';
      captionEl.innerHTML = CAPTIONS[v];
      if (v !== 'mirror' && sweeping) stopSweep();
      if (v !== 'mirror' && (runL || runR)) setPrime(); // an interrupted count starts over
      if (v !== 'mirror') { stopAnims(); hover = null; scrub = false; }
      canvas.style.cursor = v === 'map' ? 'grab' : 'default';
      fitHeight();
      if (v === 'map' && (!mapFitted || !selBridgeMoved)) fitMap();
      updateInfo();
      needsRedraw = true;
    }

    function updateInfo() {
      if (view === 'mirror') {
        const p = data.p;
        if (data.bad) {
          info.set('p = 11, the conductor, the one bad prime. Mod 11 the curve degenerates: of its 10 ' +
            'affine solutions, (8, 5) is a node, where the curve crosses itself with tangent slopes +1 and ' +
            '−1. Hasse’s theorem is silent here, yet the count still works: 10 + ∞ = 11 points, and ' +
            '11 + 1 − 11 = 1. The coefficient of q¹¹ is 1 too. Both slopes exist mod 11, a “split” node, ' +
            'and a split node always gives a₁₁ = +1.');
        } else if (locked) {
          info.set('p = ' + p + ' · #E(𝔽' + subNum(p) + ') = ' + (p + 1 - data.ap) + ' points, with ∞ · ' +
            'both roads give a' + subNum(p) + ' = ' + signed(data.ap) + ' · Hasse: |a' + subNum(p) +
            '| ≤ 2√' + p + ' ≈ ' + (2 * Math.sqrt(p)).toFixed(2) + ' · ' + matched.size + ' prime' +
            (matched.size === 1 ? '' : 's') + ' mirrored so far');
        } else {
          info.set('p = ' + p + ' · left road: count the solutions of y² + y = x³ − x² mod ' + p +
            ' · right road: multiply the product out to q' + supNum(p) + ' · the two roads have not met');
        }
      } else if (view === 'sato') {
        const st = ST[stKey];
        const total = stTotalCount().toLocaleString('en-US');
        if (stKey === 'E') {
          if (st.count === 0 && !stRunning) {
            info.set('Every mirrored prime makes an angle: cos θₚ = aₚ ⁄ 2√p. Count all ' + total +
              ' good primes below 50,000 and watch the angles pile into sin²θ: the Sato–Tate law, a ' +
              'theorem about this one curve’s angles, taken over every prime there is.');
          } else if (st.done) {
            info.set(st.count.toLocaleString('en-US') + ' angles, every one from your own point counts · ' +
              'the histogram hugs (2/π) sin²θ · ' + st.zeros + ' primes have aₚ = 0 and land exactly on π/2');
          } else {
            info.set('θₚ = arccos(aₚ ⁄ 2√p) · counted ' + st.count.toLocaleString('en-US') + ' of ' + total +
              ' good primes' + (st.maxP ? ' · reached p = ' + st.maxP.toLocaleString('en-US') : '') +
              (stRunning ? ' · counting…' : ' · paused'));
          }
        } else if (st.count === 0 && !stRunning) {
          info.set('y² = x³ − x has complex multiplication: an extra symmetry, (x, y) ↦ (−x, iy). Count ' +
            'its angles at the ' + total + ' odd primes below 50,000 and see whether they follow sin²θ.');
        } else {
          info.set('y² = x³ − x · counted ' + st.count.toLocaleString('en-US') + ' of ' + total + ' odd primes' +
            ' · aₚ = 0 at ' + st.m3zeros.toLocaleString('en-US') + ' of the ' + st.m3.toLocaleString('en-US') +
            ' primes p ≡ 3 (mod 4)' + (st.done ? '' : ' so far') + ', a spike at π/2; the rest spread evenly, with no sin² in sight' +
            (st.done ? '' : stRunning ? ' · counting…' : ' · paused'));
        }
      } else {
        info.set('drag to pan · zoom with + and −, a pinch, or ⌘/ctrl and the wheel · choose or click a ' +
          'bridge to read its story');
      }
    }

    /* ---------- drawing helpers ---------- */

    const hair = (v) => Math.round(v) + 0.5;
    // Draw a run of differently styled pieces on one baseline.
    function rich(ctx, parts, x, y, align = 'left') {
      let w = 0;
      for (const p of parts) { ctx.font = p.f; p.w = ctx.measureText(p.t).width; w += p.w; }
      let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ctx.textAlign = 'left';
      for (const p of parts) { ctx.font = p.f; ctx.fillStyle = p.c; ctx.fillText(p.t, cx, y); cx += p.w; }
      return w;
    }
    function richWidth(ctx, parts) {
      let w = 0;
      for (const p of parts) { ctx.font = p.f; w += ctx.measureText(p.t).width; }
      return w;
    }
    function ring(ctx, x, y, r, color, lw = 1) {
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, math.TAU); ctx.stroke();
    }
    function setSpacing(ctx, px) {
      if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px';
    }

    /* ---------- drawing: the mirror ---------- */

    function mirrorLayout(W, H) {
      if (W >= NARROW) {
        const pad = 18;
        const S = Math.floor(Math.min(340, W * 0.34));
        const gx = pad, gy = 46;
        const cw = Math.round(clamp(W * 0.17, 118, 190));
        const rx = gx + S + cw;
        const hy = gy + S + 52;
        return {
          narrow: false, pad,
          grid: { x: gx, y: gy, s: S },
          center: { x: gx + S, y: gy, w: cw, h: S },
          chart: { x: rx, y: gy, w: Math.max(60, W - rx - pad), h: S },
          hasse: { x: pad, y: hy, w: W - 2 * pad, h: Math.max(40, H - hy - 10) },
        };
      }
      const pad = 12;
      const S = Math.floor(Math.max(40, Math.min(W - 2 * pad, 330)));
      const gx = Math.round((W - S) / 2), gy = 34;
      const cy = gy + S + 42;
      const chy = cy + 98;
      const chh = 104;
      const hy = chy + chh + 50;
      return {
        narrow: true, pad,
        grid: { x: gx, y: gy, s: S },
        center: { x: pad, y: cy, w: W - 2 * pad, h: 70 },
        chart: { x: pad, y: chy, w: Math.max(40, W - 2 * pad), h: chh },
        hasse: { x: pad, y: hy, w: W - 2 * pad, h: Math.max(40, H - hy - 8) },
      };
    }

    function advance(dt) {
      const p = data.p;
      if (runL) {
        revL = Math.min(1, revL + dt / animDur(p));
        if (vL && voicesOn) vL.setFreq(fOf(-data.chiPrefix[Math.floor(revL * p)]));
        if (revL >= 1) { runL = false; finishSide('L'); }
        needsRedraw = true;
      }
      if (runR) {
        revR = Math.min(1, revR + dt / animDur(p));
        const targetN = Math.floor(revR * (p - 1));
        while (polyN < targetN) {
          polyN++;
          multFactor(poly, polyN, p - 1);
          if (polyN % 11 === 0) multFactor(poly, polyN, p - 1);
        }
        if (vR && voicesOn && p > 2) vR.setFreq(fOf(poly[p - 1]));
        if (revR >= 1) { runR = false; finishSide('R'); }
        needsRedraw = true;
      }
    }

    function drawMirror(ctx, W, H) {
      const L = mirrorLayout(W, H);
      drawGrid(ctx, L);
      drawChart(ctx, L);
      if (fadeT < 0.28) { // the new prime's plates settle in
        const k = fadeT / 0.28;
        ctx.globalAlpha = 0.55 * (1 - k * k);
        ctx.fillStyle = BG;
        ctx.fillRect(L.grid.x, L.grid.y, L.grid.s, L.grid.s);
        ctx.fillRect(L.chart.x, L.chart.y, L.chart.w, L.chart.h);
        ctx.globalAlpha = 1;
      }
      if (L.narrow) drawCenterRow(ctx, L); else drawCenter(ctx, L);
      drawHasse(ctx, L.hasse, L.narrow);
      drawTip(ctx, W, H);
    }

    function drawGrid(ctx, L) {
      const p = data.p;
      const { x: x0, y: y0, s: S } = L.grid;
      const cell = S / p;
      gridGeom = { x0, y0, S, cell, p };
      const tsz = L.narrow ? 11.5 : 12.5;

      rich(ctx, [
        { t: 'the curve ', f: fS(tsz, 'italic'), c: P.inkDim },
        { t: 'y² + y = x³ − x²', f: fM(tsz - 1.5), c: P.ink },
        { t: ' over ', f: fS(tsz, 'italic'), c: P.inkDim },
        { t: '𝔽' + subNum(p), f: fS(tsz + 1), c: P.goldBright },
      ], x0, y0 - 13);

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x0, y0, S, S);
      // lattice, when the cells are big enough to read
      if (cell >= 9) {
        ctx.strokeStyle = 'rgba(74,72,64,0.38)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < p; i++) {
          const v = hair(x0 + i * cell), h = hair(y0 + i * cell);
          ctx.moveTo(v, y0); ctx.lineTo(v, y0 + S);
          ctx.moveTo(x0, h); ctx.lineTo(x0 + S, h);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(hair(x0), hair(y0), Math.round(S) - 1, Math.round(S) - 1);

      const limit = revL >= 1 ? p : Math.floor(revL * p);

      // the curve's own mirror: y ↔ −1−y is reflection in the midline
      if (limit > 0 && p > 2) {
        ctx.strokeStyle = 'rgba(138,116,64,0.45)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(x0, hair(y0 + S / 2)); ctx.lineTo(x0 + S, hair(y0 + S / 2)); ctx.stroke();
        ctx.setLineDash([]);
      }

      const cx = (x) => x0 + (x + 0.5) * cell;
      const cy = (y) => y0 + S - (y + 0.5) * cell;

      // pair hairlines: each column's two solutions are mirror images
      if (cell >= 2.5) {
        ctx.strokeStyle = 'rgba(201,169,89,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const pts = data.pts;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          if (a[0] >= limit) break;
          if (a[0] === b[0]) { const X = hair(cx(a[0])); ctx.moveTo(X, cy(a[1])); ctx.lineTo(X, cy(b[1])); }
        }
        ctx.stroke();
      }

      // scan line with a soft wake
      if (runL && limit < p) {
        const sx = x0 + limit * cell + cell / 2;
        const g = ctx.createLinearGradient(sx - 28, 0, sx, 0);
        g.addColorStop(0, 'rgba(125,167,217,0)');
        g.addColorStop(1, 'rgba(125,167,217,0.18)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.max(x0, sx - 28), y0, Math.min(28, sx - x0), S);
        ctx.strokeStyle = P.azure;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hair(sx), y0); ctx.lineTo(hair(sx), y0 + S); ctx.stroke();
      }

      // solutions
      const big = cell >= 7;
      const dot = Math.max(1.7, cell * 0.62);
      ctx.fillStyle = P.gold;
      let shown = 0;
      if (big) {
        const r = Math.max(0, cell * 0.3);
        for (const q of data.pts) {
          if (q[0] >= limit) break;
          if (p <= 47) { ctx.globalAlpha = 0.45; glowGold.draw(ctx, cx(q[0]), cy(q[1]), (cell * 1.6) / 96); ctx.globalAlpha = 1; }
          ctx.fillStyle = P.gold;
          ctx.beginPath(); ctx.arc(cx(q[0]), cy(q[1]), r, 0, math.TAU); ctx.fill();
          shown++;
        }
      } else {
        for (const q of data.pts) {
          if (q[0] >= limit) break;
          ctx.fillRect(x0 + q[0] * cell + (cell - dot) / 2, y0 + S - (q[1] + 1) * cell + (cell - dot) / 2, dot, dot);
          shown++;
        }
      }

      // the rational skeleton: four points every reduction keeps
      for (const [x, y] of rationalPointsMod(p)) {
        if (x >= limit) continue;
        if (data.bad && x === 8) continue;
        ring(ctx, cx(x), cy(y), Math.max(3, cell * 0.46), 'rgba(232,226,208,0.85)', 1);
      }

      // the node at the bad prime: tangents of slope ±1, both defined mod 11
      if (data.sing && data.sing[0] < limit) {
        const sxp = cx(data.sing[0]), syp = cy(data.sing[1]);
        ctx.globalAlpha = 0.8;
        glowCrimson.draw(ctx, sxp, syp, (cell * 2.2) / 48);
        ctx.globalAlpha = 1;
        const d = cell * 1.7;
        ctx.strokeStyle = P.crimsonBright;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sxp - d, syp + d); ctx.lineTo(sxp + d, syp - d);
        ctx.moveTo(sxp - d, syp - d); ctx.lineTo(sxp + d, syp + d);
        ctx.stroke();
        ctx.setLineDash([]);
        ring(ctx, sxp, syp, Math.max(4, cell * 0.5), P.crimsonBright, 1.4);
        ctx.font = fS(12, 'italic');
        ctx.fillStyle = P.crimsonBright;
        ctx.textAlign = 'center';
        ctx.fillText('the node', sxp, syp + d + 14);
        ctx.textAlign = 'left';
      }

      // χ-strip: one cell per column, two solutions / one / none
      const sy0 = y0 + S + 7;
      for (let x = 0; x < limit; x++) {
        const k = data.col[x];
        ctx.fillStyle = k === 2 ? P.gold : k === 1 ? P.inkFaint : P.inkGhost;
        ctx.fillRect(x0 + x * cell, sy0, Math.max(1, cell - (cell >= 4 ? 1 : 0)), 5);
      }
      if (limit < p) {
        ctx.fillStyle = 'rgba(74,72,64,0.35)';
        ctx.fillRect(x0 + limit * cell, sy0 + 2, S - limit * cell, 1);
      }

      // tally
      const ty = y0 + S + 28;
      const N = data.pts.length + 1;
      if (revL >= 1) {
        const parts = [
          { t: String(data.pts.length), f: fM(11), c: P.ink },
          { t: data.bad ? ' affine, one a node, + ∞ = ' : ' affine + ∞ = ', f: fS(12, 'italic'), c: P.inkDim },
          { t: String(N), f: fM(11), c: P.goldBright },
          { t: ' points', f: fS(12, 'italic'), c: P.inkDim },
        ];
        if (!data.bad && N % 5 === 0) parts.push({ t: ' = 5 × ' + N / 5, f: fM(11), c: P.inkFaint });
        if (richWidth(ctx, parts) > S + (L.narrow ? 0 : 40)) parts.length = Math.min(parts.length, 4);
        rich(ctx, parts, x0, ty);
      } else if (runL) {
        rich(ctx, [
          { t: 'x = ' + limit + ' of ' + p, f: fM(11), c: P.azure },
          { t: ' · ' + shown + ' points · Σχ = ' + signed(data.chiPrefix[limit]), f: fM(11), c: P.inkDim },
        ], x0, ty);
      } else {
        rich(ctx, [
          { t: p + ' × ' + p + ' = ' + (p * p).toLocaleString('en-US'), f: fM(11), c: P.inkDim },
          { t: ' pairs of remainders wait to be counted', f: fS(12, 'italic'), c: P.inkFaint },
        ], x0, ty);
      }
    }

    function drawChart(ctx, L) {
      const p = data.p;
      const { x: rx, y: ry, w: rw, h: rh } = L.chart;
      const tsz = L.narrow ? 11.5 : 12.5;
      let title = [
        { t: 'the product ', f: fS(tsz, 'italic'), c: P.inkDim },
        { t: 'q∏(1−qⁿ)²(1−q¹¹ⁿ)²', f: fM(tsz - 1.5), c: P.ink },
        { t: ' out to ', f: fS(tsz, 'italic'), c: P.inkDim },
        { t: 'q' + supNum(p), f: fM(tsz - 0.5), c: P.goldBright },
      ];
      if (richWidth(ctx, title) > rw) {
        title = [
          { t: 'the product, out to ', f: fS(tsz, 'italic'), c: P.inkDim },
          { t: 'q' + supNum(p), f: fM(tsz - 0.5), c: P.goldBright },
        ];
      }
      rich(ctx, title, rx, ry - 13);

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(hair(rx), hair(ry), Math.round(rw) - 1, Math.round(rh) - 1);

      const started = revR > 0 || runR;
      if (!started) {
        // the factors that will matter, queued as a faint texture
        ctx.font = fM(10.5);
        ctx.fillStyle = 'rgba(169,164,147,0.2)';
        ctx.textAlign = 'left';
        const pad = 12, lh = 17;
        let fx = rx + pad, fy = ry + pad + 10, n = 0;
        const put = (t) => {
          const w = ctx.measureText(t).width;
          if (fx + w > rx + rw - pad) { fx = rx + pad; fy += lh; }
          if (fy > ry + rh - pad) return false;
          ctx.fillText(t, fx, fy); fx += w + 6;
          return true;
        };
        put('q');
        for (n = 1; n < p; n++) {
          if (!put('(1−q' + (n === 1 ? '' : supNum(n)) + ')' + (n % 11 === 0 ? '⁴' : '²'))) break;
        }
        if (n >= p) put('· · ·');
        const cy = ry + rh / 2;
        ctx.font = fM(L.narrow ? 12 : 14);
        const fw = ctx.measureText('q∏(1−qⁿ)²(1−q¹¹ⁿ)²').width;
        ctx.fillStyle = BG;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(rx + rw / 2 - fw / 2 - 14, cy - 24, fw + 28, 50);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.fillStyle = P.inkDim;
        ctx.fillText('q∏(1−qⁿ)²(1−q¹¹ⁿ)²', rx + rw / 2, cy - 4);
        ctx.fillStyle = P.inkFaint;
        ctx.font = fS(12.5, 'italic');
        ctx.fillText('not yet multiplied', rx + rw / 2, cy + 16);
        ctx.textAlign = 'left';
        ctx.font = fS(12, 'italic');
        ctx.fillStyle = P.inkFaint;
        ctx.fillText('an infinite product, waiting for its first factor', rx, ry + rh + 19);
        return;
      }

      const mid = ry + rh / 2;
      const bw = rw / p;
      const scaleY = (rh / 2 - 12) / chartMax;
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(rx, hair(mid)); ctx.lineTo(rx + rw, hair(mid)); ctx.stroke();

      const live = revR < 1 && poly;
      const finalK = revR >= 1 ? p : polyN + 1;
      const coef = (k) => (live ? poly[k - 1] : aForm[k]);
      const barW = Math.max(1, bw * 0.72);
      for (let k = 1; k <= p; k++) {
        const v = coef(k);
        if (!v) continue;
        const h = clamp(v, -chartMax, chartMax) * scaleY;
        ctx.fillStyle = k === p ? P.goldBright : k <= finalK ? P.azure : P.inkFaint;
        ctx.globalAlpha = k === p ? 1 : k <= finalK ? 0.85 : 0.6;
        ctx.fillRect(rx + (k - 1) * bw + (bw - barW) / 2, Math.min(mid, mid - h), barW, Math.max(1, Math.abs(h)));
      }
      ctx.globalAlpha = 1;
      // scale marks, set over the bars on a little ground of their own
      ctx.font = fM(9);
      ctx.textAlign = 'left';
      for (const [t, yy] of [['+' + chartMax, ry + 11], ['−' + chartMax, ry + rh - 4]]) {
        const tw = ctx.measureText(t).width;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = BG;
        ctx.fillRect(rx + 2, yy - 9, tw + 5, 12);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.inkFaint;
        ctx.fillText(t, rx + 4, yy);
      }
      // the coefficient that matters
      const mx = rx + (p - 1) * bw + bw / 2;
      ctx.strokeStyle = P.goldDim;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(hair(mx), ry + 2); ctx.lineTo(hair(mx), ry + rh - 2); ctx.stroke();
      ctx.setLineDash([]);
      const vp = coef(p);
      if (revR >= 1) {
        ctx.globalAlpha = 0.7;
        glowGold.draw(ctx, mx, mid - clamp(vp, -chartMax, chartMax) * scaleY, 0.34);
        ctx.globalAlpha = 1;
      }

      // the q-expansion itself, streaming, with q^p at the right end
      const ty = ry + rh + 19;
      const fz = L.narrow ? 10.5 : 11;
      ctx.font = fM(fz);
      const ellW = ctx.measureText('… ').width;
      const tailW = ctx.measureText(' + …').width;
      const parts = [];
      let used = 0, truncated = false;
      for (let k = p; k >= 1; k--) {
        const c = coef(k);
        if (!c) continue;
        const s = qTerm(c, k, k === 1);
        const w = ctx.measureText((parts.length ? s + ' ' : s)).width;
        if (used + w > rw - ellW - tailW) { truncated = true; break; }
        parts.unshift({ t: s, k });
        used += w;
      }
      const run = [];
      if (truncated) run.push({ t: '… ', f: fM(fz), c: P.inkFaint });
      parts.forEach((q, j) => {
        run.push({
          t: q.t + (j < parts.length - 1 ? ' ' : ''), f: fM(fz),
          c: q.k === p ? P.goldBright : q.k <= finalK ? P.azure : P.inkFaint,
        });
      });
      run.push({ t: ' + …', f: fM(fz), c: P.inkFaint });
      rich(ctx, run, rx, ty);

      // status
      const sy = ry + rh + 35;
      if (runR) {
        const n = Math.max(1, polyN);
        rich(ctx, [
          { t: 'multiplying by ', f: fS(12, 'italic'), c: P.azure },
          { t: '(1 − q' + supNum(n) + ')' + (n % 11 === 0 ? '⁴' : '²'), f: fM(11), c: P.azure },
          { t: ' · factor ' + polyN + ' of ' + (p - 1), f: fM(11), c: P.inkDim },
        ], rx, sy);
      } else {
        const long = [
          { t: 'no factor beyond ', f: fS(12, 'italic'), c: P.inkFaint },
          { t: '(1 − q' + supNum(Math.max(1, p - 1)) + ')²', f: fM(11), c: P.inkDim },
          { t: ' can touch ', f: fS(12, 'italic'), c: P.inkFaint },
          { t: 'q' + supNum(p), f: fM(11), c: P.inkDim },
          { t: ': these coefficients are final', f: fS(12, 'italic'), c: P.inkFaint },
        ];
        const short = [
          { t: 'every coefficient through ', f: fS(12, 'italic'), c: P.inkFaint },
          { t: 'q' + supNum(p), f: fM(11), c: P.inkDim },
          { t: ' is settled', f: fS(12, 'italic'), c: P.inkFaint },
        ];
        rich(ctx, richWidth(ctx, long) <= rw ? long : short, rx, sy);
      }
    }

    function numberFor(side) {
      const p = data.p;
      if (side === 'L') {
        if (revL >= 1) return { t: signed(data.ap), final: true };
        if (runL) return { t: signed(-data.chiPrefix[Math.floor(revL * p)]), final: false };
        return null;
      }
      if (revR >= 1) return { t: signed(aForm[p]), final: true };
      if (runR && poly) return { t: signed(poly[p - 1]), final: false };
      return null;
    }

    function drawCenter(ctx, L) {
      const { x: cx0, y: gy, w: cw, h: S } = L.center;
      const cx = cx0 + cw / 2;
      const numSize = Math.round(clamp(S * 0.085, 20, 30));
      const eqSize = Math.round(clamp(S * 0.125, 28, 46));
      const y1 = gy + S * 0.17, y2 = gy + S * 0.66;
      const eqY = gy + S * 0.5;
      const isLocked = locked && revL >= 1 && revR >= 1;
      const grow = isLocked ? (reduceMotion ? 1 : Math.min(1, lockT / 0.45)) : 0;
      const flash = isLocked && !reduceMotion ? Math.max(0, 1 - lockT / LOCK_ANIM) : 0;

      ctx.textAlign = 'center';
      // left road's number (arithmetic, gold)
      ctx.font = fS(12.5, 'italic');
      ctx.fillStyle = P.inkDim;
      ctx.fillText('by counting', cx, y1);
      const nL = numberFor('L');
      drawNumber(ctx, nL, cx, y1 + numSize + 6, numSize, P.gold);

      // converging hairlines, then the glyph
      if (isLocked) {
        const gL = ctx.createLinearGradient(cx0 + 6, 0, cx - eqSize * 0.45, 0);
        gL.addColorStop(0, 'rgba(201,169,89,0)'); gL.addColorStop(1, 'rgba(201,169,89,0.7)');
        const gR = ctx.createLinearGradient(cx0 + cw - 6, 0, cx + eqSize * 0.45, 0);
        gR.addColorStop(0, 'rgba(125,167,217,0)'); gR.addColorStop(1, 'rgba(125,167,217,0.7)');
        const lineY = hair(eqY - eqSize * 0.28);
        const reachL = (cx - eqSize * 0.45 - (cx0 + 4)) * grow;
        const reachR = (cx0 + cw - 4 - (cx + eqSize * 0.45)) * grow;
        ctx.lineWidth = 1;
        ctx.strokeStyle = gL;
        ctx.beginPath(); ctx.moveTo(cx0 + 4, lineY); ctx.lineTo(cx0 + 4 + reachL, lineY); ctx.stroke();
        ctx.strokeStyle = gR;
        ctx.beginPath(); ctx.moveTo(cx0 + cw - 4, lineY); ctx.lineTo(cx0 + cw - 4 - reachR, lineY); ctx.stroke();
        ctx.globalAlpha = 0.55 + 0.45 * flash;
        glowGold.draw(ctx, cx, eqY - eqSize * 0.3, (eqSize * (1.7 + 0.9 * flash)) / 96);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.goldBright;
        ctx.font = fS(eqSize);
        ctx.fillText('=', cx, eqY);
      } else {
        drawQuery(ctx, cx, eqY, eqSize * 0.86);
      }

      // right road's number (harmonic, azure)
      ctx.font = fS(12.5, 'italic');
      ctx.fillStyle = P.inkDim;
      ctx.fillText('by multiplying', cx, y2);
      const nR = numberFor('R');
      drawNumber(ctx, nR, cx, y2 + numSize + 6, numSize, P.azure);

      // Hasse's bound for this prime, on the tally line
      rich(ctx, [
        { t: '|aₚ| ≤ 2√' + data.p + ' ≈ ', f: fM(10), c: P.inkFaint },
        { t: (2 * Math.sqrt(data.p)).toFixed(2), f: fM(10), c: P.inkDim },
      ], cx, gy + S + 28, 'center');
      if (data.bad && revL >= 1) {
        ctx.font = fS(11.5, 'italic');
        ctx.fillStyle = P.crimsonBright;
        ctx.textAlign = 'center';
        ctx.fillText('a node: see below', cx, y1 + numSize + 24);
      }
      ctx.textAlign = 'left';
    }

    function drawNumber(ctx, n, x, y, size, color) {
      ctx.textAlign = 'center';
      if (!n) {
        ctx.font = fM(size * 0.8);
        ctx.fillStyle = P.inkGhost;
        ctx.fillText('· · ·', x, y);
        return;
      }
      ctx.font = fM(size);
      ctx.fillStyle = n.final ? color : P.inkDim;
      ctx.fillText(n.t, x, y);
      if (!n.final) {
        const w = ctx.measureText(n.t).width;
        ctx.font = fS(size * 0.6, 'italic');
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'left';
        ctx.fillText('?', x + w / 2 + 3, y);
        ctx.textAlign = 'center';
      }
    }

    // The not-yet-equal sign: a faint '=' with a small italic query above it.
    function drawQuery(ctx, x, y, size) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = P.inkFaint;
      ctx.font = fS(Math.round(size));
      ctx.fillText('=', x, y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.inkDim;
      ctx.font = fS(Math.round(size * 0.46), 'italic');
      ctx.fillText('?', x, y - size * 0.5);
    }

    function drawCenterRow(ctx, L) {
      const { x, y, w } = L.center;
      const midX = x + w / 2;
      const lx = x + w * 0.22, rxp = x + w * 0.78;
      const base = y + 34;
      const isLocked = locked && revL >= 1 && revR >= 1;
      const flash = isLocked && !reduceMotion ? Math.max(0, 1 - lockT / LOCK_ANIM) : 0;
      drawNumber(ctx, numberFor('L'), lx, base, 26, P.gold);
      drawNumber(ctx, numberFor('R'), rxp, base, 26, P.azure);
      ctx.textAlign = 'center';
      if (isLocked) {
        ctx.globalAlpha = 0.55 + 0.45 * flash;
        glowGold.draw(ctx, midX, base - 12, (38 * (1.6 + 0.8 * flash)) / 96);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.goldBright;
        ctx.font = fS(38);
        ctx.fillText('=', midX, base + 2);
      } else {
        drawQuery(ctx, midX, base, 32);
      }
      ctx.font = fS(12, 'italic');
      ctx.fillStyle = P.inkDim;
      ctx.fillText('by counting', lx, base + 22);
      ctx.fillText('by multiplying', rxp, base + 22);
      ctx.textAlign = 'left';
    }

    function drawHasse(ctx, R, narrow) {
      const { x, y, w, h } = R;
      const px0 = x + (narrow ? 28 : 34), px1 = x + w - 6;
      const py0 = y + 22, py1 = y + h - 17;
      const aMax = 2 * Math.sqrt(1000) * 1.04;
      const X = (p) => px0 + (p / 1000) * (px1 - px0);
      const Y = (a) => (py0 + py1) / 2 - (a / aMax) * Math.max(1, (py1 - py0) / 2);
      hasseGeom = { px0, px1, py0, py1, X, Y, y0: y, y1: y + h };

      rich(ctx, [
        { t: 'Hasse’s window', f: fS(12.5, 'italic'), c: P.inkDim },
        { t: '   |aₚ| ≤ 2√p', f: fM(10), c: P.azure },
      ], x, y + 10);
      rich(ctx, [
        { t: String(matched.size), f: fM(10.5), c: P.goldBright },
        { t: ' of 168 mirrored', f: fS(12, 'italic'), c: P.inkFaint },
      ], x + w, y + 10, 'right');

      // the window itself
      ctx.beginPath();
      for (let p = 0; p <= 1000; p += 10) ctx.lineTo(X(p), Y(2 * Math.sqrt(p)));
      for (let p = 1000; p >= 0; p -= 10) ctx.lineTo(X(p), Y(-2 * Math.sqrt(p)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(125,167,217,0.06)';
      ctx.fill();
      ctx.strokeStyle = P.azureDim;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        for (let p = 0; p <= 1000; p += 8) {
          const yy = Y(sgn * 2 * Math.sqrt(p));
          p === 0 ? ctx.moveTo(X(p), yy) : ctx.lineTo(X(p), yy);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(px0, hair(Y(0))); ctx.lineTo(px1, hair(Y(0))); ctx.stroke();

      // axes
      ctx.font = fM(9);
      ctx.fillStyle = P.inkFaint;
      ctx.textAlign = 'right';
      for (const v of [60, 0, -60]) ctx.fillText(v > 0 ? '+' + v : signed(v), px0 - 6, Y(v) + 3);
      ctx.textAlign = 'center';
      for (const v of [0, 250, 500, 750, 1000]) {
        const xx = clamp(X(v), px0 + 6, px1 - 12);
        ctx.fillText(v === 1000 ? 'p = 1000' : String(v), v === 1000 ? px1 - 22 : xx, y + h - 3);
      }

      // every a_p, as a ghost until the visitor has seen both roads agree
      ctx.fillStyle = 'rgba(169,164,147,0.3)';
      for (const p of PRIMES) {
        if (matched.has(p)) continue;
        ctx.fillRect(X(p) - 0.9, Y(aForm[p]) - 0.9, 1.8, 1.8);
      }
      ctx.fillStyle = P.gold;
      for (const [p, ap] of matched) ctx.fillRect(X(p) - 1.3, Y(ap) - 1.3, 2.6, 2.6);
      // the bad prime
      ring(ctx, X(11), Y(1), 3.4, P.crimsonBright, 1);
      // newest agreement: a ring that widens once
      if (pulse && pulse.t < 0.7) {
        const k = pulse.t / 0.7;
        ctx.globalAlpha = 1 - k;
        ring(ctx, X(pulse.p), Y(matched.get(pulse.p) || 0), 3 + 12 * k, P.goldBright, 1);
        ctx.globalAlpha = 1;
      }
      // current prime
      const cp = data.p;
      ctx.strokeStyle = 'rgba(138,116,64,0.55)';
      ctx.beginPath(); ctx.moveTo(hair(X(cp)), py0 - 4); ctx.lineTo(hair(X(cp)), py1 + 2); ctx.stroke();
      ring(ctx, X(cp), Y(aForm[cp]), 4.2, matched.has(cp) ? P.goldBright : P.azure, 1.2);
      // hovered prime
      if (hover && hover.kind === 'hasse') {
        const hp = PRIMES[hover.i];
        ring(ctx, X(hp), Y(aForm[hp]), 5.5, P.ink, 1);
      }
      ctx.textAlign = 'left';
    }

    function drawTip(ctx, W, H) {
      if (!hover || !hoverPos) return;
      let lines;
      if (hover.kind === 'cell') {
        const p = data.p, xx = hover.x, yy = hover.y;
        const lhs = yy * yy + yy, rhs = xx * xx * xx - xx * xx;
        const l = lhs % p, r = ((rhs % p) + p) % p;
        const on = l === r;
        const node = data.bad && xx === 8 && yy === 5;
        lines = [
          { t: '(x, y) = (' + xx + ', ' + yy + ')', f: fM(11), c: P.ink },
          { t: 'y² + y  = ' + fmtN(lhs) + ' ≡ ' + l, f: fM(10.5), c: P.inkDim },
          { t: 'x³ − x² = ' + fmtN(rhs) + ' ≡ ' + r + '  (mod ' + p + ')', f: fM(10.5), c: P.inkDim },
          { t: node ? 'a solution: the node' : on ? 'a solution' : 'not a solution', f: fS(12, 'italic'),
            c: node ? P.crimsonBright : on ? P.goldBright : P.inkFaint },
        ];
      } else {
        const p = PRIMES[hover.i], ap = aForm[p];
        lines = [
          { t: 'p = ' + p, f: fM(11), c: P.ink },
          { t: 'aₚ = ' + signed(ap) + ' · #E = ' + (p + 1 - ap), f: fM(10.5), c: P.inkDim },
          { t: '2√p ≈ ' + (2 * Math.sqrt(p)).toFixed(2), f: fM(10.5), c: P.inkDim },
          { t: matched.has(p) ? 'mirrored' : 'click to go there', f: fS(12, 'italic'),
            c: matched.has(p) ? P.goldBright : P.inkFaint },
        ];
      }
      let tw = 0;
      for (const ln of lines) { ctx.font = ln.f; tw = Math.max(tw, ctx.measureText(ln.t).width); }
      const bw = tw + 18, bh = lines.length * 15 + 12;
      let bx = hoverPos[0] + 14, by = hoverPos[1] + 14;
      if (bx + bw > W - 4) bx = hoverPos[0] - 14 - bw;
      if (by + bh > H - 4) by = hoverPos[1] - 14 - bh;
      bx = clamp(bx, 4, Math.max(4, W - bw - 4)); by = clamp(by, 4, Math.max(4, H - bh - 4));
      ctx.fillStyle = 'rgba(22,25,37,0.96)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(hair(bx), hair(by), Math.round(bw), Math.round(bh));
      ctx.textAlign = 'left';
      lines.forEach((ln, i) => { ctx.font = ln.f; ctx.fillStyle = ln.c; ctx.fillText(ln.t, bx + 9, by + 18 + i * 15); });
    }

    /* ---------- drawing: Sato–Tate ---------- */

    function satoLayout(W, H) {
      if (W >= NARROW) {
        const protW = Math.round(clamp(W * 0.3, 190, 300));
        const hist = { x: 52, y: 44, w: Math.max(60, W - 52 - 26 - protW - 20), h: Math.max(60, H - 44 - 64) };
        const R = Math.max(30, Math.min(protW / 2 - 16, hist.h * 0.5));
        return { narrow: false, hist, prot: { cx: W - 18 - protW / 2, cy: hist.y + hist.h, R } };
      }
      const hist = { x: 34, y: 40, w: Math.max(40, W - 34 - 12), h: 220 };
      const R = Math.max(40, Math.min(W / 2 - 28, 118));
      return { narrow: true, hist, prot: { cx: W / 2, cy: hist.y + hist.h + 92 + R, R } };
    }

    function ensureRays(prot, st) {
      const dpr = handle.dpr || 1;
      const R = prot.R;
      const key = stKey + ':' + R.toFixed(1) + ':' + dpr;
      if (!rays || rays.key !== key || rays.n > st.count) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil((2 * R + 8) * dpr));
        c.height = Math.max(1, Math.ceil((R + 8) * dpr));
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        rays = { key, c, g, n: 0, R };
      }
      if (rays.n >= st.count || !st.angles) return;
      const g = rays.g, o = R + 4, r0 = R * 0.2;
      g.strokeStyle = P.gold;
      g.lineWidth = 0.7;
      g.globalAlpha = 0.045;
      const upto = Math.min(st.count, st.angles.length);
      for (let i = rays.n; i < upto; i++) {
        const th = st.angles[i];
        const dx = -Math.cos(th), dy = -Math.sin(th);
        g.beginPath();
        g.moveTo(o + dx * r0, o + dy * r0);
        g.lineTo(o + dx * R, o + dy * R);
        g.stroke();
      }
      g.globalAlpha = 1;
      rays.n = upto;
    }

    function drawSato(ctx, W, H) {
      const L = satoLayout(W, H);
      const st = ST[stKey];
      const { x: hx, y: hy, w: hw, h: hh } = L.hist;
      const cm = stKey === 'CM';

      // title
      rich(ctx, cm ? [
        { t: 'the angles of ', f: fS(12.5, 'italic'), c: P.inkDim },
        { t: 'y² = x³ − x', f: fM(11), c: P.ink },
        { t: L.narrow ? '' : ', a curve with complex multiplication', f: fS(12.5, 'italic'), c: P.inkDim },
      ] : [
        { t: 'the angles of ', f: fS(12.5, 'italic'), c: P.inkDim },
        { t: 'y² + y = x³ − x²', f: fM(11), c: P.ink },
        { t: L.narrow ? '' : ', one per prime', f: fS(12.5, 'italic'), c: P.inkDim },
      ], hx, hy - 16);

      const dTheta = Math.PI / ST_BINS;
      const expectedAt = (th) => st.count * (2 / Math.PI) * Math.sin(th) * Math.sin(th) * dTheta;
      let yMax = Math.max(8, expectedAt(Math.PI / 2));
      let capped = -1;
      if (cm) {
        const cap = Math.max(8, expectedAt(Math.PI / 2) * 1.35);
        for (let i = 0; i < ST_BINS; i++) {
          if (st.bins[i] > cap) capped = i; else yMax = Math.max(yMax, st.bins[i]);
        }
        yMax = Math.max(yMax, cap);
      } else {
        for (let i = 0; i < ST_BINS; i++) yMax = Math.max(yMax, st.bins[i]);
      }
      yMax *= 1.08;
      const bw = hw / ST_BINS;
      const Yv = (v) => hy + hh - (v / yMax) * hh;

      // plate
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(hx, hy, hw, hh);
      ctx.strokeStyle = 'rgba(74,72,64,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const f of [0.25, 0.5, 0.75]) { const xx = hair(hx + f * hw); ctx.moveTo(xx, hy); ctx.lineTo(xx, hy + hh); }
      ctx.stroke();
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(hx, hair(hy + hh)); ctx.lineTo(hx + hw, hair(hy + hh)); ctx.stroke();

      // the law, filled
      if (st.count > 0) {
        ctx.beginPath();
        ctx.moveTo(hx, hy + hh);
        for (let i = 0; i <= 120; i++) {
          const th = (i / 120) * Math.PI;
          ctx.lineTo(hx + (th / Math.PI) * hw, Yv(expectedAt(th)));
        }
        ctx.lineTo(hx + hw, hy + hh);
        ctx.closePath();
        ctx.fillStyle = 'rgba(125,167,217,0.09)';
        ctx.fill();
      }

      // bars: the visitor's own point counts
      const grad = ctx.createLinearGradient(0, hy, 0, hy + hh);
      grad.addColorStop(0, P.goldBright);
      grad.addColorStop(0.55, P.gold);
      grad.addColorStop(1, P.goldDim);
      ctx.fillStyle = grad;
      for (let i = 0; i < ST_BINS; i++) {
        if (!st.bins[i]) continue;
        const v = Math.min(st.bins[i], yMax);
        const top = Yv(v);
        ctx.fillRect(hx + i * bw + 1, top, Math.max(1, bw - 2), hy + hh - top);
      }
      if (capped >= 0) {
        ctx.fillStyle = BG;
        ctx.fillRect(hx + capped * bw, hy + 18, bw, 4);
        ctx.fillRect(hx + capped * bw, hy + 26, bw, 2);
        rich(ctx, [
          { t: '↑ ', f: fM(10.5), c: P.goldBright },
          { t: st.bins[capped].toLocaleString('en-US'), f: fM(10.5), c: P.goldBright },
          { t: L.narrow ? '' : ' in this bin', f: fS(12, 'italic'), c: P.inkDim },
        ], hx + (capped + 1) * bw + 5, hy + 12);
      }

      // the law, stroked
      if (st.count > 0) {
        ctx.strokeStyle = P.azure;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const th = (i / 120) * Math.PI;
          const xx = hx + (th / Math.PI) * hw, yy = Yv(expectedAt(th));
          i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // axes and legend
      ctx.font = fM(10.5);
      ctx.fillStyle = P.inkDim;
      ctx.textAlign = 'center';
      ctx.fillText('0', hx, hy + hh + 15);
      ctx.fillText('π/2', hx + hw / 2, hy + hh + 15);
      ctx.fillText('π', hx + hw, hy + hh + 15);
      rich(ctx, [
        { t: 'θ', f: fS(13, 'italic'), c: P.inkDim },
        { t: 'ₚ', f: fM(10), c: P.inkDim },
        { t: ', where cos θₚ = aₚ ⁄ 2√p', f: fS(12, 'italic'), c: P.inkFaint },
      ], hx + hw / 2, hy + hh + 33, 'center');
      if (st.count > 0) {
        const lx = L.narrow ? hx + 6 : hx + hw - 8;
        const al = L.narrow ? 'left' : 'right';
        rich(ctx, [
          { t: '— ', f: fM(11), c: P.azure },
          { t: L.narrow ? '(2/π) sin²θ' : '(2/π) sin²θ, the Sato–Tate law', f: fS(12, 'italic'), c: P.azure },
        ], lx, hy + 16, al);
        if (L.narrow) {
          rich(ctx, [
            { t: st.count.toLocaleString('en-US'), f: fM(11), c: P.goldBright },
            { t: ' angles', f: fS(12, 'italic'), c: P.inkDim },
          ], lx, hy + 33, al);
        }
      } else {
        ctx.font = fS(13, 'italic');
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'center';
        ctx.fillText(stRunning ? 'counting…' : 'press ▶ and ' + stTotalCount().toLocaleString('en-US') +
          ' point counts will pile up here', hx + hw / 2, hy + hh / 2);
      }

      // the fan: one ray per prime
      const { cx, cy, R } = L.prot;
      ctx.textAlign = 'center';
      if (!L.narrow) {
        // the tally, set large above the fan
        const ty = hy + clamp((cy - R - 40 - hy - 64) * 0.4, 34, 70);
        const total = stTotalCount().toLocaleString('en-US');
        if (st.count > 0) {
          ctx.font = fM(30);
          ctx.fillStyle = P.goldBright;
          ctx.fillText(st.count.toLocaleString('en-US'), cx, ty);
          ctx.font = fS(12.5, 'italic');
          ctx.fillStyle = P.inkDim;
          ctx.fillText('angles, of ' + total + (cm ? ' odd primes' : ' good primes') + ' below 50,000', cx, ty + 22);
          rich(ctx, [
            { t: st.zeros.toLocaleString('en-US'), f: fM(11), c: cm ? P.goldBright : P.ink },
            { t: ' of them exactly at π/2', f: fS(12.5, 'italic'), c: P.inkDim },
          ], cx, ty + 44, 'center');
          ctx.font = fM(10.5);
          ctx.fillStyle = P.inkFaint;
          ctx.textAlign = 'center';
          ctx.fillText(st.done ? 'every prime counted' : 'reached p = ' + st.maxP.toLocaleString('en-US'), cx, ty + 64);
        } else {
          ctx.font = fS(13, 'italic');
          ctx.fillStyle = P.inkFaint;
          ctx.fillText('no angles yet', cx, ty);
        }
      }
      ctx.font = fS(12.5, 'italic');
      ctx.fillStyle = P.inkDim;
      ctx.fillText('one ray per prime', cx, cy - R - 28);
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, R), Math.PI, math.TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - R - 6, hair(cy)); ctx.lineTo(cx + R + 6, hair(cy)); ctx.stroke();
      ctx.strokeStyle = 'rgba(74,72,64,0.6)';
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const th = (k / 8) * Math.PI;
        const dx = -Math.cos(th), dy = -Math.sin(th);
        ctx.moveTo(cx + dx * R, cy + dy * R); ctx.lineTo(cx + dx * (R + (k % 4 === 0 ? 7 : 4)), cy + dy * (R + (k % 4 === 0 ? 7 : 4)));
      }
      ctx.stroke();
      if (st.count > 0) {
        ensureRays(L.prot, st);
        ctx.drawImage(rays.c, cx - R - 4, cy - R - 4, 2 * R + 8, R + 8);
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, R * 0.2), Math.PI, math.TAU); ctx.stroke();
        if (stRunning && st.last >= 0) {
          const dx = -Math.cos(st.last), dy = -Math.sin(st.last);
          ctx.strokeStyle = P.goldBright;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(cx + dx * R * 0.2, cy + dy * R * 0.2); ctx.lineTo(cx + dx * R, cy + dy * R); ctx.stroke();
          ctx.lineWidth = 1;
        }
      }
      ctx.font = fM(10.5);
      ctx.fillStyle = P.inkDim;
      ctx.fillText('0', cx - R, cy + 15);
      ctx.fillText('π', cx + R, cy + 15);
      ctx.fillText('π/2', cx, cy - R - 11);
      ctx.font = fS(12, 'italic');
      ctx.fillStyle = P.inkFaint;
      ctx.fillText(cm ? 'a spike, and an even spread' : 'crowding toward π/2, as sin²θ says', cx, cy + 33);
      ctx.textAlign = 'left';
    }

    /* ---------- drawing: the map ---------- */

    function polyPath(ctx, poly) {
      ctx.beginPath();
      for (let i = 0; i < poly.length; i += 2) i === 0 ? ctx.moveTo(poly[i], poly[i + 1]) : ctx.lineTo(poly[i], poly[i + 1]);
      ctx.closePath();
    }

    function drawMap(ctx, W, H) {
      bridgeScreens = [];
      const sc = pz.scale;
      const narrow = W < NARROW;

      // world-space pass (y up)
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(sc, -sc);
      ctx.translate(-pz.x, -pz.y);

      // engraved water in the strait
      ctx.strokeStyle = 'rgba(74,72,64,0.32)';
      ctx.lineWidth = 1 / sc;
      ctx.beginPath();
      for (let yy = -262; yy <= 262; yy += 11) {
        const jag = (Math.abs(yy * 7919) % 23) - 11;
        ctx.moveTo(-150 + jag, yy); ctx.lineTo(150 + jag * 0.6, yy);
      }
      ctx.stroke();

      for (const [c, poly, col] of [[WEST, westPoly, P.goldDim], [EAST, eastPoly, P.azureDim]]) {
        // offset water-lines outside the coast, as on an engraved chart
        for (const [k, a] of [[1.075, 0.16], [1.035, 0.32]]) {
          polyPath(ctx, coastPoly(c, k, 72));
          ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 0.9 / sc; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        polyPath(ctx, poly);
        ctx.fillStyle = P.panel;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5 / sc;
        ctx.stroke();
        // an inland contour
        polyPath(ctx, coastPoly(c, 0.8, 72));
        ctx.globalAlpha = 0.28;
        ctx.setLineDash([2 / sc, 5 / sc]);
        ctx.lineWidth = 0.9 / sc;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // cities
      ctx.fillStyle = P.inkDim;
      for (const c of CITIES) {
        if (narrow) break;
        ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0, 2.2 / sc), 0, math.TAU); ctx.fill();
      }

      // bridges
      for (let i = 0; i < BRIDGES.length; i++) {
        const b = BRIDGES[i];
        const color = bridgeColor(b);
        const arc = () => { ctx.beginPath(); ctx.moveTo(b.ax, b.y); ctx.quadraticCurveTo(b.mx, b.y + 22, b.bx, b.y); };
        if (i === selBridge || i === mapHover) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = i === selBridge ? 0.22 : 0.12;
          ctx.lineWidth = 10 / sc;
          arc(); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = (b.kind === 'new' ? 2.6 : b.kind === 'ferry' ? 1.8 : 2.2) / sc;
        if (b.kind === 'construction') ctx.setLineDash([9 / sc, 7 / sc]);
        else if (b.kind === 'ferry') { ctx.setLineDash([0.1 / sc, 6 / sc]); ctx.lineCap = 'round'; ctx.lineWidth = 2.6 / sc; }
        arc(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        // piers under the unbuilt span
        if (b.kind === 'construction') {
          ctx.fillStyle = P.inkDim;
          for (let k = 1; k < 6; k++) {
            const t = k / 6;
            const wx = (1 - t) * (1 - t) * b.ax + 2 * (1 - t) * t * b.mx + t * t * b.bx;
            const wy = (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * (b.y + 22) + t * t * b.y;
            ctx.fillRect(wx - 1.5 / sc, wy - 6 / sc, 3 / sc, 6 / sc);
          }
        }
        // ports
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(b.ax, b.y, Math.max(0, 2.6 / sc), 0, math.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(b.bx, b.y, Math.max(0, 2.6 / sc), 0, math.TAU); ctx.fill();
        // screen samples for hit-testing
        const samples = [];
        for (let k = 0; k <= 24; k++) {
          const t = k / 24;
          const wx = (1 - t) * (1 - t) * b.ax + 2 * (1 - t) * t * b.mx + t * t * b.bx;
          const wy = (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * (b.y + 22) + t * t * b.y;
          const s = pz.worldToScreen(wx, wy);
          samples.push(s[0], s[1]);
        }
        bridgeScreens.push(samples);
      }
      ctx.restore();

      // screen-space labels
      const titleSize = narrow ? 11.5 : 14;
      if (narrow) {
        for (const [name, x, rot] of [['ARITHMETIC', 14, -Math.PI / 2], ['HARMONIC ANALYSIS', W - 14, Math.PI / 2]]) {
          ctx.save();
          ctx.translate(x, H / 2);
          ctx.rotate(rot);
          ctx.font = fS(11, '600');
          setSpacing(ctx, 3.3);
          ctx.textAlign = 'center';
          ctx.fillStyle = P.ink;
          ctx.fillText(name, 0, 4);
          setSpacing(ctx, 0);
          ctx.restore();
        }
      }
      if (!narrow) for (const [c, name, sub] of [
        [WEST, 'ARITHMETIC', 'equations · Galois groups'],
        [EAST, narrow ? 'HARMONIC' : 'HARMONIC ANALYSIS', narrow ? 'analysis · automorphic forms' : 'automorphic forms · spectra'],
      ]) {
        const [sx, sy] = pz.worldToScreen(c.cx, 214);
        ctx.font = fS(titleSize, '600');
        setSpacing(ctx, titleSize * (narrow ? 0.16 : 0.3));
        const tw = ctx.measureText(name).width;
        const tx = clamp(sx, tw / 2 + 6, Math.max(tw / 2 + 6, W - tw / 2 - 6));
        ctx.textAlign = 'center';
        ctx.fillStyle = P.ink;
        ctx.fillText(name, tx, sy);
        setSpacing(ctx, 0);
        ctx.font = fS(narrow ? 11 : 12.5, 'italic');
        const sw = ctx.measureText(sub).width;
        ctx.fillStyle = P.inkDim;
        ctx.fillText(sub, clamp(sx, sw / 2 + 6, Math.max(sw / 2 + 6, W - sw / 2 - 6)), sy + (narrow ? 15 : 18));
      }

      for (const c of CITIES) {
        if (narrow) break;
        const s = pz.worldToScreen(c.x, c.y);
        ctx.font = c.mono ? fM(narrow ? 9.5 : 10.5) : fS(narrow ? 11 : 12, 'italic');
        const w = ctx.measureText(c.t).width;
        ctx.fillStyle = P.inkDim;
        ctx.textAlign = 'center';
        ctx.fillText(c.t, clamp(s[0], w / 2 + 4, Math.max(w / 2 + 4, W - w / 2 - 4)), s[1] + (narrow ? 13 : 15));
      }

      for (let i = 0; i < BRIDGES.length; i++) {
        const b = BRIDGES[i];
        const m = pz.worldToScreen(b.mx, b.y + 11);
        const color = bridgeColor(b);
        const sel = i === selBridge || i === mapHover;
        const nf = fS(narrow ? 11 : 13, sel ? '600' : '');
        ctx.font = nf;
        const nw = ctx.measureText(b.name).width;
        ctx.textAlign = 'center';
        ctx.fillStyle = BG;
        ctx.globalAlpha = 0.72;
        ctx.fillRect(m[0] - nw / 2 - 4, m[1] - 21, nw + 8, 15);
        ctx.globalAlpha = 1;
        ctx.fillStyle = sel ? P.ink : color;
        ctx.fillText(b.name, m[0], m[1] - 9);
        {
          ctx.font = fM(narrow ? 8.5 : 9.5);
          const sw = ctx.measureText(b.status).width;
          ctx.fillStyle = BG;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(m[0] - sw / 2 - 4, m[1] + 5, sw + 8, 13);
          ctx.globalAlpha = 1;
          ctx.fillStyle = P.inkDim;
          ctx.fillText(b.status, m[0], m[1] + 15);
        }
        if (b.pin && matched.size > 0) {
          ctx.font = fS(11.5, 'italic');
          ctx.fillStyle = P.goldBright;
          ctx.fillText('you stood here · ' + matched.size + ' prime' + (matched.size === 1 ? '' : 's'), m[0], m[1] + 30);
        }
      }

      // key
      if (!narrow) {
        const kx = 14, ky = H - 70;
        const rows = [
          ['built', P.gold, 'a theorem'],
          ['new', P.azure, 'opened 2024'],
          ['construction', P.inkDim, 'under construction'],
          ['ferry', P.crimsonBright, 'physics, not a theorem'],
        ];
        ctx.fillStyle = 'rgba(10,11,16,0.72)';
        ctx.fillRect(kx - 6, ky - 13, 172, rows.length * 15 + 10);
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(hair(kx - 6), hair(ky - 13), 172, rows.length * 15 + 10);
        rows.forEach(([kind, col, label], j) => {
          const yy = ky + j * 15;
          ctx.strokeStyle = col;
          ctx.lineWidth = kind === 'new' ? 2.4 : 2;
          if (kind === 'construction') ctx.setLineDash([6, 4]);
          if (kind === 'ferry') { ctx.setLineDash([0.1, 5]); ctx.lineCap = 'round'; ctx.lineWidth = 2.4; }
          ctx.beginPath(); ctx.moveTo(kx, yy - 4); ctx.lineTo(kx + 26, yy - 4); ctx.stroke();
          ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.lineWidth = 1;
          ctx.font = fS(12, 'italic');
          ctx.fillStyle = P.inkDim;
          ctx.textAlign = 'left';
          ctx.fillText(label, kx + 34, yy);
        });
      }

      if (mapHintT > 0) {
        ctx.globalAlpha = Math.min(1, mapHintT / 0.4);
        ctx.font = fS(12.5, 'italic');
        const t = 'hold ⌘ or ctrl to zoom with the wheel';
        const w = ctx.measureText(t).width;
        ctx.fillStyle = 'rgba(22,25,37,0.92)';
        ctx.fillRect(W / 2 - w / 2 - 10, H - 34, w + 20, 22);
        ctx.fillStyle = P.ink;
        ctx.textAlign = 'center';
        ctx.fillText(t, W / 2, H - 19);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
    }

    /* ---------- pointer, wheel and keyboard ---------- */

    function hassePick(sx, sy, loose) {
      const g = hasseGeom;
      if (!g) return -1;
      if (!loose && (sy < g.y0 - 2 || sy > g.y1 + 2 || sx < g.px0 - 10 || sx > g.px1 + 10)) return -1;
      let best = -1, bd = Infinity;
      for (let i = 0; i < PRIMES.length; i++) {
        const d = Math.abs(g.X(PRIMES[i]) - sx);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    function setHover(sx, sy) {
      let h = null;
      const g = gridGeom;
      if (g && sx >= g.x0 && sx < g.x0 + g.S && sy >= g.y0 && sy < g.y0 + g.S) {
        const x = clamp(Math.floor((sx - g.x0) / g.cell), 0, g.p - 1);
        const y = clamp(g.p - 1 - Math.floor((sy - g.y0) / g.cell), 0, g.p - 1);
        h = { kind: 'cell', x, y };
      } else {
        const i = hassePick(sx, sy, false);
        if (i >= 0) h = { kind: 'hasse', i };
      }
      const same = (h && hover && h.kind === hover.kind && h.x === hover.x && h.y === hover.y && h.i === hover.i) || (!h && !hover);
      hoverPos = [sx, sy];
      if (!same || h) needsRedraw = true;
      hover = h;
      canvas.style.cursor = h && h.kind === 'hasse' ? 'pointer' : h ? 'crosshair' : 'default';
    }

    const pointers = new Map();
    let drag = null, pinch = null;
    const onDown = (e) => {
      const [sx, sy] = cv.pointerPos(handle, e);
      if (view === 'map') {
        pointers.set(e.pointerId, [sx, sy]);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (pointers.size === 1) { drag = { x: sx, y: sy, moved: false }; canvas.style.cursor = 'grabbing'; }
        else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
          drag = null;
        }
        return;
      }
      if (view === 'mirror') {
        const g = hasseGeom;
        if (g && sy >= g.y0 - 2 && sy <= g.y1 + 2) {
          const i = hassePick(sx, sy, false);
          if (i >= 0) {
            scrub = true;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (i !== primeIdx) choosePrime(i);
            return;
          }
        }
        setHover(sx, sy); // a tap inspects a cell
      }
    };
    const onMove = (e) => {
      const [sx, sy] = cv.pointerPos(handle, e);
      if (view === 'map') {
        if (pointers.has(e.pointerId)) {
          const prev = pointers.get(e.pointerId);
          pointers.set(e.pointerId, [sx, sy]);
          if (pinch && pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
            if (pinch.d > 0 && d > 0) { pz.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d); selBridgeMoved = true; }
            pinch.d = d;
            return;
          }
          if (drag) {
            if (!drag.moved && Math.abs(sx - drag.x) + Math.abs(sy - drag.y) > 5) drag.moved = true;
            if (drag.moved) {
              pz.x -= (sx - prev[0]) / pz.scale;
              pz.y += (sy - prev[1]) / pz.scale;
              selBridgeMoved = true;
              needsRedraw = true;
            }
          }
          return;
        }
        if (e.pointerType === 'mouse') {
          const b = bridgeAt(sx, sy);
          if (b !== mapHover) { mapHover = b; canvas.style.cursor = b >= 0 ? 'pointer' : 'grab'; needsRedraw = true; }
        }
        return;
      }
      if (view === 'mirror') {
        if (scrub) {
          const i = hassePick(sx, sy, true);
          if (i >= 0 && i !== primeIdx) choosePrime(i);
          hoverPos = [sx, sy];
          return;
        }
        if (e.pointerType === 'mouse') setHover(sx, sy);
      }
    };
    const onUp = (e) => {
      if (view === 'map') {
        const d = drag;
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        if (d && !d.moved && e.type === 'pointerup') {
          const [sx, sy] = cv.pointerPos(handle, e);
          const b = bridgeAt(sx, sy);
          if (b >= 0) selectBridge(b, false);
        }
        if (pointers.size === 0) { drag = null; canvas.style.cursor = mapHover >= 0 ? 'pointer' : 'grab'; }
        return;
      }
      scrub = false;
    };
    const onLeave = (e) => {
      if (view === 'mirror' && e.pointerType === 'mouse' && !scrub && hover) { hover = null; needsRedraw = true; }
      if (view === 'map' && mapHover >= 0) { mapHover = -1; needsRedraw = true; }
    };
    const onWheel = (e) => {
      if (view !== 'map') return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const [sx, sy] = cv.pointerPos(handle, e);
        pz.zoomAt(sx, sy, Math.pow(1.0022, -e.deltaY));
        selBridgeMoved = true;
      } else if (Math.abs(e.deltaY) > 2) {
        mapHintT = 1.8; // let the page scroll; just say how to zoom
        needsRedraw = true;
      }
    };
    const onKey = (e) => {
      if (view === 'mirror') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { choosePrime(primeIdx + 1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { choosePrime(primeIdx - 1); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') { startLeft(); startRight(); e.preventDefault(); }
      } else if (view === 'map') {
        const step = 40 / pz.scale;
        let used = true;
        if (e.key === 'ArrowLeft') pz.x -= step;
        else if (e.key === 'ArrowRight') pz.x += step;
        else if (e.key === 'ArrowUp') pz.y += step;
        else if (e.key === 'ArrowDown') pz.y -= step;
        else if (e.key === '+' || e.key === '=') zoomBy(1.25);
        else if (e.key === '-' || e.key === '_') zoomBy(0.8);
        else if (e.key === '0') fitMap();
        else used = false;
        if (used) { e.preventDefault(); selBridgeMoved = e.key !== '0'; needsRedraw = true; }
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);

    /* ---------- main loop ---------- */

    function draw(dt) {
      // consume audio-clock events first (sweep visuals follow the sound)
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      while (sweepQueue.length && sweepQueue[0].at <= now + 0.02) {
        const e = sweepQueue.shift();
        if (e.i < 0) { finishSweep(); break; }
        showPrimeInstant(e.i);
      }
      let animating = false;
      if (locked && lockT < LOCK_ANIM) { lockT = Math.min(LOCK_ANIM, lockT + dt); animating = !reduceMotion; needsRedraw = true; }
      if (pulse && pulse.t < 0.7) { pulse.t += dt; animating = true; needsRedraw = true; }
      if (mapHintT > 0) { mapHintT = Math.max(0, mapHintT - dt); needsRedraw = true; }
      if (fadeT < 0.28) { fadeT += dt; animating = true; needsRedraw = true; }
      if (view === 'mirror' && (runL || runR)) { advance(dt); animating = true; }

      if (!needsRedraw && !animating) return;
      needsRedraw = false;

      const { ctx, width: W, height: H } = handle;
      if (W < 2 || H < 2) return;
      ctx.clearRect(0, 0, W, H);
      if (view === 'mirror') drawMirror(ctx, W, H);
      else if (view === 'sato') drawSato(ctx, W, H);
      else drawMap(ctx, W, H);
    }

    const loop = cv.rafLoop(draw);

    // ---------- boot ----------
    data = curveData(PRIMES[primeIdx]);
    setPrime();
    setView('mirror');
    fitHeight();
    stLabel();
    loop.start();

    // ---------- lifecycle ----------
    return {
      pause() {
        pausedRun = { L: runL, R: runR };
        runL = false; runR = false;
        loop.stop();
        stopSweep();
        silenceVoices();
        clearTimers();
        stopSatoWorker();
        if (stRunning) { stRunning = false; stResume = true; stLabel(); updateInfo(); }
        bus.mute();
      },
      resume() {
        bus.unmute();
        if (pausedRun.L || pausedRun.R) {
          if (pausedRun.L) { runL = true; if (vL) { voicesOn = true; vL.on(); } }
          if (pausedRun.R && poly) { runR = true; if (vR) { voicesOn = true; vR.on(); } }
          pausedRun = { L: false, R: false };
        }
        if (stResume) { // pick the visitor's count up where it stopped
          stResume = false;
          if (view === 'sato' && !ST[stKey].done) startSato();
        }
        needsRedraw = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopSweep();
        clearTimers();
        stopSatoWorker();
        stRunning = false;
        if (vL) { vL.dispose(); vR.dispose(); vL = vR = null; }
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('keydown', onKey);
        bus.dispose();
        handle.destroy();
        styleEl.remove();
      },
    };
  },
};
