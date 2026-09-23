// II·7 — The Golden Angle (movement finale)
// Vogel's phyllotaxis model on a single dial. Rational divergence angles give
// spokes to the eye and looping melodies to the ear, the same fact about p/q
// reported by two senses. At θ★ = 2π(2 − φ) ≈ 137.50776° the spokes die, the
// loop dissolves, and what survives is order without repetition: the door out
// of Movement II and into the Horizon.
//
// The dial is exact. Ring positions (0.05° = 1/7200 of a turn), fine steps
// (0.002° = 1/180000) and the fraction detents are held as reduced fractions
// p/q, so "q spokes, a loop of q notes" is a statement about p/q itself; the
// irrational detents (π − 3, √2 − 1, e − 2, 2 − φ, 1/(2 + φ)) stay irrational
// under any rational nudge. The melody is unbounded: note k is seed k, born at
// the centre with the head's newest seed, so at θ★ it never repeats.
//
// Checked at build time (September 2026):
// · Vogel, Math. Biosci. 44 (1979) 179–189; TU München, Lehrstuhl für Physik,
//   Freising-Weihenstephan (Crossref; OpenAlex affiliation string).
// · Hurwitz, Math. Ann. 39 (1891) 279–284. q²|x − p/q| over the convergents:
//   2 − φ → 0.4472 = 1/√5; √2 − 1 → 0.3536 = 1/√8; π − 3 at 113 → 0.0034 (computed).
// · Schimper 1830 (Magazin für Pharmacie 29), Braun 1831 (fir-cone scales, Nova
//   Acta 15); the traditional table 1/2 elm, 1/3 beech and hazel, 2/5 oak and
//   cherry, 3/8 poplar and pear, 5/13 almond; a poplar's stem at 3/8 (135°) but
//   137.5° at the shoot tip; 99.5° in Cunninghamia lanceolata, Sedum, Dipsacus
//   sylvestris, Cedrus deodara; "it remains unknown whether phyllotaxis has
//   adaptive value" (Okabe, Sci. Rep. 5 (2015) 15358). Bravais & Bravais (1837):
//   curviserial patterns "derive from the golden angle 137.5° or a few other
//   related irrational … angles" (Okabe, Ishida & Yoshimura, J. R. Soc.
//   Interface 16 (2019) 20180850).
// · Lucas phyllotaxis at ≈ 99.5°, parastichies 4, 7, 11, 18, 29 (Refahi et al.,
//   eLife 5 (2016) e14093); primordia created near the centre "drift away
//   radially", angular position "supposed to remain constant" (ibid.).
// · Douady & Couder, PRL 68 (1992) 2098, abstract quoted verbatim; Laboratoire de
//   Physique Statistique, 24 rue Lhomond, Paris.
// · Swinton & Ochu, R. Soc. Open Sci. 3 (2016) 160091: 657 sunflowers; of 768
//   photo-reviewed counts 565 Fibonacci, 41 Lucas, 136 (18%) non-Fibonacci, 49 of
//   them Fibonacci − 1; MSI Manchester, 2012, Turing centenary; Turing's insight
//   "not published until after his death".
// · Singh, Hist. Math. 12 (1985) 229–244, abstract: the numbers "and the method
//   for their formation were given by Virahanka (between A.D. 600 and 800), Gopala
//   (prior to A.D. 1135) and Hemacandra (c. A.D. 1150), all prior to L. Fibonacci".
// · Nobel Prize in Chemistry 2011, popular information: 8 April 1982; "concentric
//   circles, each made of ten bright dots"; notebook "10 Fold???"; rapidly chilled
//   Al–Mn; asked to leave his research group; Penrose mid-1970s, fat : thin → τ.
//   Bindi et al., Science 324 (2009) 1306 (Koryak Mountains); PNAS 109 (2012) 1396
//   ("likely formed in the early solar system about 4.5 Gya").
// · Three-gap theorem (Steinhaus; Sós, Surányi, Świerczkowski 1957–58). At θ★,
//   n points leave exactly two gap sizes iff n is a Fibonacci number (n ≤ 610,
//   computed); with three, the largest is the sum of the other two.
// · Contact parastichies of a 610-seed Vogel head at θ★: 5/8 at the heart, 13/21
//   by seed 60, 34/55 over the outer third (nearest neighbours, computed).
// · Fibonacci word: letter k = ⌊(k+2)α⌋ − ⌊(k+1)α⌋, α = 2 − φ, equals the
//   0 → 01, 1 → 0 fixed point (checked to 200 000 letters).

import { TAU, PHI, mod, clamp, continuedFraction, convergents } from '../../core/math.js';

/* ======================================================================
   Pure core (node-testable, no DOM)
   ====================================================================== */

const GOLDEN_TURN = 2 - PHI;               // ≈ 0.3819660113 of a turn
const GOLDEN_DEG = 360 * GOLDEN_TURN;      // ≈ 137.50776405°
const MIRROR_TURN = PHI - 1;               // 0.618…: the same bloom, mirrored
const LUCAS_TURN = 1 / (2 + PHI);          // ≈ 99.50155°, cf [0; 3, 1, 1, 1, …]
const RING_DEN = 7200;                     // coarse ring: 0.05° per step
const FINE_DEN = 180000;                   // fine steps: 0.002° per step
const CAP = 610;                           // seeds in a full head (a Fibonacci number)

// The irrational detents, as fractions of a turn.
const IRR = {
  pi: { turn: Math.PI - 3, name: 'π − 3' },
  sqrt2: { turn: Math.SQRT2 - 1, name: '√2 − 1' },
  e: { turn: Math.E - 2, name: 'e − 2' },
  phi: { turn: GOLDEN_TURN, name: '2 − φ' },
  lucas: { turn: LUCAS_TURN, name: '1/(2 + φ)' },
};

// Letter k (from 0) of the Fibonacci word 0100101001001…, the fixed point of
// 0 → 01, 1 → 0. Exact in doubles far beyond any session (checked to 2·10⁵).
function fibBit(k) {
  return Math.floor((k + 2) * GOLDEN_TURN) - Math.floor((k + 1) * GOLDEN_TURN);
}
function fibWord(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = fibBit(i);
  return out;
}
// The same word by substitution, for cross-checking fibWord.
function fibSubstitution(n) {
  let w = [0];
  while (w.length < n) {
    const nx = [];
    for (const c of w) { if (c === 0) nx.push(0, 1); else nx.push(0); }
    w = nx;
  }
  return w.slice(0, n);
}

// Angular positions (fractions of a turn, in [0,1)) of the first n Vogel
// seeds at divergence `turns`.
function seedTurns(turns, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = mod(i * turns, 1);
  return out;
}

// How many distinct spoke directions a list of turn-fractions occupies,
// clustering within `tol` (circularly, so 0.9999… and 0.0001 can merge).
function distinctTurnCount(list, tol = 1e-9) {
  if (list.length === 0) return 0;
  const s = [...list].sort((a, b) => a - b);
  let count = 1;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > tol) count++;
  if (count > 1 && s[0] + 1 - s[s.length - 1] <= tol) count--;   // wraparound
  return count;
}

// Distinct circular gap sizes between sorted-or-not turn fractions, descending.
// Zero gaps (coincident points) are skipped.
function gapKinds(phases, tol = 1e-9) {
  const s = [...phases].sort((a, b) => a - b);
  const kinds = [];
  for (let i = 0; i < s.length; i++) {
    const next = i + 1 < s.length ? s[i + 1] : s[0] + 1;
    const g = next - s[i];
    if (g <= tol) continue;
    if (!kinds.some((k) => Math.abs(k - g) <= tol)) kinds.push(g);
  }
  return kinds.sort((a, b) => b - a);
}
// The gaps between the first n multiples of `turns`. The three-gap theorem
// (conjectured by Steinhaus; proved by Sós, Surányi and Świerczkowski,
// 1957–58) says this list never holds more than three entries.
function gapSizes(turns, n, tol = 1e-9) {
  return gapKinds(seedTurns(turns, n), tol);
}

// Continued-fraction portrait of a float (kept for compatibility): its cf
// terms, the convergent denominators, and whether it is a convergent within
// 1e-11. The exhibit itself uses the exact dial below.
function analyzeTurns(turns, maxTerms = 17) {
  const cf = continuedFraction(turns, maxTerms, 1e-10);
  const conv = convergents(cf);
  const arms = [];
  let rational = null;
  for (const [p, q] of conv) {
    if (q > 1 && !arms.includes(q)) arms.push(q);
    if (Math.abs(turns - p / q) < 1e-11) { rational = { p, q }; break; }
  }
  return { cf, arms, rational };
}

/* ---- exact dial arithmetic ---- */

function gcdInt(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}
// p/q reduced and wrapped into [0, 1).
function ratNorm(p, q) {
  if (q < 0) { p = -p; q = -q; }
  p = ((p % q) + q) % q;
  const g = gcdInt(p, q) || q;
  return { p: p / g, q: q / g };
}
function ratAdd(a, b) {
  const g = gcdInt(a.q, b.q);
  return ratNorm(a.p * (b.q / g) + b.p * (a.q / g), (a.q / g) * b.q);
}
// Exact continued fraction of p/q (Euclid's algorithm).
function cfRational(p, q) {
  const out = [];
  let a = p, b = q;
  while (b) { const t = Math.floor(a / b); out.push(t); const r = a - t * b; a = b; b = r; }
  return out;
}
// Continued fraction of a float, only while the convergent denominators stay
// small enough (≤ qMax) for the double to be trusted.
function cfFloat(x, maxTerms = 14, qMax = 1e6) {
  const out = [];
  let q0 = 0, q1 = 1;
  for (let i = 0; i < maxTerms; i++) {
    const a = Math.floor(x);
    const q = i === 0 ? 1 : a * q1 + q0;
    if (i > 0 && q > qMax) break;
    out.push(a);
    if (i > 0) { q0 = q1; q1 = q; }
    const f = x - a;
    if (f < 1e-13) break;
    x = 1 / f;
  }
  return out;
}

// A dial setting: { irr: key | null, rat: {p, q} }. The value in turns is
// IRR[irr].turn + p/q (mod 1); with irr null it is exactly the fraction p/q.
function dialTurn(d) {
  return mod((d.irr ? IRR[d.irr].turn : 0) + d.rat.p / d.rat.q, 1);
}
function dialPlusFine(d, j) {
  return { irr: d.irr, rat: j ? ratAdd(d.rat, { p: j, q: FINE_DEN }) : d.rat };
}
// Everything the readouts need about a setting.
function describeDial(d) {
  const turn = dialTurn(d);
  const rational = d.irr ? null : { p: d.rat.p, q: d.rat.q };
  const cf = rational ? cfRational(rational.p, rational.q) : cfFloat(turn);
  const conv = convergents(cf);
  const arms = [];
  // Hurwitz: q²·|θ − p/q| for the convergent of each term a₁, a₂, … (null when q < 2)
  const fits = [];
  for (let i = 1; i < conv.length; i++) {
    const [p, q] = conv[i];
    if (q < 2) { fits.push(null); continue; }
    if (!arms.includes(q)) arms.push(q);
    const exact = rational && p === rational.p && q === rational.q;
    fits.push({ q, fit: exact ? 0 : q * q * Math.abs(turn - p / q) });
  }
  return { turn, deg: turn * 360, rational, cf, arms, fits };
}

// The dial's word: from the second seed on, 1 when the step from seed n to
// seed n + 1 carries the walk past the first seed's ray, else 0. At θ★ it is
// the Fibonacci word; at p/q it repeats every q letters.
function crossingWord(d, count) {
  const out = new Array(count);
  if (!d.irr) {
    const { p, q } = d.rat;
    for (let n = 1; n <= count; n++) {
      out[n - 1] = Math.floor(((n + 1) * p) / q) - Math.floor((n * p) / q);
    }
  } else {
    const x = dialTurn(d);
    for (let n = 1; n <= count; n++) out[n - 1] = Math.floor((n + 1) * x) - Math.floor(n * x);
  }
  return out;
}

// For every seed of an N-seed Vogel head (seed a at radius √a, angle a·turn),
// the index differences of its two nearest neighbours, within ±D. These are
// the contact parastichies: the spiral families the eye picks out.
function contactNeighbours(turn, N, D = 160) {
  const xs = new Float64Array(N), ys = new Float64Array(N);
  for (let a = 0; a < N; a++) {
    const r = Math.sqrt(a), t = a * turn * TAU;
    xs[a] = r * Math.cos(t); ys[a] = r * Math.sin(t);
  }
  const out = new Int32Array(2 * N);
  for (let a = 0; a < N; a++) {
    let b1 = Infinity, d1 = 0, b2 = Infinity, d2 = 0;
    const lo = Math.max(0, a - D), hi = Math.min(N - 1, a + D);
    for (let b = lo; b <= hi; b++) {
      if (b === a) continue;
      const dx = xs[a] - xs[b], dy = ys[a] - ys[b];
      const s = dx * dx + dy * dy;
      const d = Math.abs(b - a);
      if (d === d1) { if (s < b1) b1 = s; continue; }
      if (s < b1) { b2 = b1; d2 = d1; b1 = s; d1 = d; }        // d ≠ d1, so the old best moves down
      else if (s < b2) { b2 = s; d2 = d; }
    }
    out[2 * a] = d1; out[2 * a + 1] = d2;
  }
  return out;
}
// The commonest nearest-neighbour pair over the outer third of the head,
// ascending: at θ★ with 610 seeds, [34, 55].
function rimParastichies(turn, N = CAP) {
  const nb = contactNeighbours(turn, N);
  const tally = new Map();
  for (let a = Math.floor(N * 2 / 3); a < N; a++) {
    const x = nb[2 * a], y = nb[2 * a + 1];
    if (!x || !y) continue;
    const key = x < y ? `${x}/${y}` : `${y}/${x}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const [k, v] of tally) if (v > bestN) { best = k; bestN = v; }
  return best ? best.split('/').map(Number) : [];
}

// Degrees as degrees, minutes and seconds (the Babylonian reckoning).
function toDMS(deg) {
  let d = Math.floor(deg), m = Math.floor((deg - d) * 60);
  let s = Math.round(((deg - d) * 60 - m) * 60);
  if (s === 60) { s = 0; m++; }
  if (m === 60) { m = 0; d++; }
  return `${d}° ${String(m).padStart(2, '0')}′ ${String(s).padStart(2, '0')}″`;
}

const FIBS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];

/* ======================================================================
   Words and apparatus
   ====================================================================== */

const PROSE = `
    <p>In 1979 Helmut Vogel, a physicist at the Technical University of Munich’s campus in
    Freising, wrote down the smallest recipe that grows a sunflower: place seed number
    <code>i</code> at angle <code>i·θ</code> and at a radius proportional to <code>√i</code>.
    Each seed sits one fixed turn past the one before it, at a radius just large enough that
    every seed claims the same area. That is the entire model. The head below is one rule
    iterated six hundred and ten times (a Fibonacci number; we could not resist), and it grows as
    a living shoot tip does: each new seed appears at the centre, and the older ones drift
    outward along the directions where they were born. Everything hangs on a single number, θ,
    the <em>divergence angle</em>, and the dial is that number.</p>
    <p>Set the dial almost anywhere and the head organizes itself into spokes. A rational angle,
    <code>2π·p/q</code>, sends every q-th seed down the same ray: the head collapses into q
    straight arms with wedges of wasted space between them, and the melody the seeds sing, each
    newborn’s angle folded into one octave, closes into a loop of exactly q notes. Spokes in the
    eye, a loop in the ear: the same fact about <code>p/q</code>, reported by two different
    senses. Angles merely <em>near</em> a fraction shear the spokes into spiral arms, and the
    number of arms is the denominator of a continued-fraction convergent. Set the dial to π and
    the number confesses: seven arms first (that is 22/7), then 106 (333/106), then, deeper in, a
    ghostly hundred and thirteen (355/113). For a florist’s purposes, π is disappointingly close
    to rational.</p>
    <p>The first detents on the dial are not ours. Around 1830 Karl Schimper and Alexander Braun
    read fractions off stems and fir cones, one half, one third, two fifths, three eighths, five
    thirteenths, a ladder whose tops and bottoms are Fibonacci numbers. A table still repeated in
    botany books gives the elm a half, the beech a third and the oak two fifths, though a single
    plant can keep more than one. In 1837 the brothers Louis and
    Auguste Bravais traced the curving spiral arrangements to an irrational angle of about
    137.5°. A poplar keeps both in plain sight: along its grown stem the leaves stand three
    eighths of a turn apart, 135°, while at the growing tip, where each leaf is born, the angle
    is 137.5°.</p>
    <p>So the plant’s problem, to let no seed line up with another, becomes a number theorist’s
    problem: find the angle hardest to approximate by fractions. Every irrational <code>x</code>
    has infinitely many fractions with <code>|x − p/q| &lt; 1/(√5·q²)</code>, and in 1891 Adolf
    Hurwitz proved that the √5 can never be raised, because <code>φ = (1+√5)/2</code> and its
    relatives refuse to do better. The continued fraction of φ is <code>[1; 1, 1, 1, …]</code>,
    all ones, the slowest to converge there is. Strike φ’s family from the contest and the
    constant rises to √8, the record of <code>√2 = [1; 2, 2, 2, …]</code>: the √2 detent is the
    runner-up. The most irrational number, folded into one turn, is the golden angle
    <code>θ★ = 2π(2 − φ) ≈ 137.50776°</code>. There the spokes die altogether, and what remains
    are interlocking families of Fibonacci spirals, 8 and 13 near the heart, 34 and 55 at the
    rim: the shadows of φ’s convergents. Only φ’s cousins, whose continued fractions end in an
    unbroken run of ones, do as well, and a few plants use one: the dial’s 99.5°, found in the
    teasel, the deodar cedar and the China fir, whose spirals count the Lucas numbers 4, 7, 11,
    18, 29. In 1992 two physicists in Paris, Stéphane Douady and Yves Couder, grew such spirals
    with no plant at all, in a laboratory experiment and a simulation where new elements simply
    appear one after another, and put the moral in one line: the order comes from “the system’s
    trend to avoid rational (periodic) organization, thus leading to a convergence towards the
    golden mean.”</p>
    <p>Nature argues back. Alan Turing worked on the Fibonacci patterns of plants in the 1950s,
    in work not published until after his death, and for his centenary in 2012 Manchester’s
    Museum of Science and Industry asked the public to grow sunflowers and bring them in to be
    counted. Of the 768 spiral counts that survived checking against photographs, 565 were
    Fibonacci numbers and 41 were Lucas numbers. But 136, nearly one in five, fit no Fibonacci
    pattern at all, and 49 of those fell exactly one short of a Fibonacci number. Vogel’s dial
    is the ideal; the sunflower is an argument with it.</p>
    <p>Meanwhile the melody at θ★ has stopped looping. It will never repeat, yet it is not
    lawless. Steinhaus’s three-gap theorem, the one we met colouring the arcs between
    <a href="#ex-fifths">stacked fifths</a>, returns on the compass beside the bloom: however many
    notes have sounded, their pitches cut the octave into at most <em>three</em> sizes of gap, and
    when there are three, the largest is exactly the sum of the other two. At the golden angle
    the count falls to two precisely when the number of notes heard is a Fibonacci number.
    Aperiodic, but with a grammar, and the grammar has a purest specimen. Start with 0, replace
    every 0 by 01 and every 1 by 0, and repeat: 0, 01, 010, 01001, 01001010, …, lengthening by
    Fibonacci numbers into the single infinite <em>Fibonacci word</em>, which never repeats and
    contains no randomness at all. The dial writes it unprompted: walk round by the golden angle
    and, from the second seed onward, write 1 whenever a step carries you past the first seed’s
    ray and 0 when it does not. Switch on the pulse and the melody walks in that rhythm, long for
    0 and short for 1, in golden proportion. The two durations have an older history. In Sanskrit
    metre a long syllable lasts two beats and a short one lasts one, and the prosodists who
    counted the rhythms filling a given number of beats found 1, 2, 3, 5, 8, 13, each the sum of the two
    before. Virahāṅka gave the rule some time between 600 and 800; Gopāla set it down again
    before 1135 and Hemacandra around 1150, all before Leonardo of Pisa met the same numbers
    breeding rabbits in 1202.</p>
    <p>Roger Penrose built his aperiodic tilings on the same number in the mid-1970s: in any
    large patch the fat rhombi outnumber the thin ones by a ratio that tends to φ. On the morning
    of 8 April 1982, in a rapidly chilled alloy of aluminium and manganese, Dan Shechtman’s
    electron microscope showed rings of ten bright spots, a symmetry no repeating crystal can
    have. He wrote “10 Fold???” in his notebook. Defending it cost him his place in his research
    group before it won him the 2011 Nobel Prize in Chemistry. Nature had been there first: in
    2009 a natural quasicrystal turned up in a rock from Russia’s Koryak Mountains, later traced
    to a meteorite that probably formed four and a half billion years ago. Order and repetition
    are different things, and the gap between them is wide enough to hold everything that comes
    next.</p>`;

const CHRONICLE = [
  { year: -300, date: 'c. 300 BCE', text: 'Euclid’s <em>Elements</em> defines a line cut in “extreme and mean ratio”, the ratio later called golden, and uses it to construct the regular pentagon, the icosahedron and the dodecahedron.' },
  { year: 700, date: '600–800', text: 'The Sanskrit prosodist Virahāṅka gives the rule for counting the rhythms that long and short syllables can make, 1, 2, 3, 5, 8, 13, each the sum of the two before; Gopāla (before 1135) and the Jain scholar Hemacandra (c. 1150) repeat it, all before Leonardo of Pisa’s rabbits of 1202.' },
  { year: 1837, date: '1837', text: 'After Karl Schimper and Alexander Braun read the fractions 1/2, 1/3, 2/5, 3/8 and 5/13 off stems and fir cones, the brothers Louis and Auguste Bravais trace spiral leaf arrangements to an irrational angle of about 137.5°.' },
  { year: 1891, date: '1891', text: 'Adolf Hurwitz proves that every irrational number has infinitely many fractions within 1/(√5·q²) of it, and that because of the golden ratio the √5 can never be raised.' },
  { year: 1979, date: '1979', text: 'Helmut Vogel, a physicist at the Technical University of Munich, models the sunflower head in one line: seed <em>i</em> turned <em>i</em> golden angles of about 137.5°, at a radius proportional to √<em>i</em>.' },
  { year: 1982, date: '8 April 1982', text: 'Dan Shechtman sees rings of ten bright spots in a rapidly chilled aluminium–manganese alloy: the first quasicrystal, ordered but never repeating, which wins him the 2011 Nobel Prize in Chemistry.' },
  { year: 1992, date: '1992', text: 'In Paris, Stéphane Douady and Yves Couder grow Fibonacci spirals in a physics experiment with no plant in it, and explain them as a system’s trend to avoid periodic order.' },
  { year: 2022, date: 'July 2022', text: 'On a Quantinuum trapped-ion computer, Philipp Dumitrescu and colleagues drive ten ytterbium-ion qubits with laser pulses ordered like the Fibonacci word; the qubits at the chain’s ends keep their quantum state for the whole run of about 5.5 seconds, against about 1.5 seconds under a periodic drive.' },
];

const TODAY = `
    <p>The golden angle has left the garden. Since 2007 MRI scanners have been able to space
    their radial readouts 111.246° apart, the golden cut of a half-turn (a line through the
    centre repeats every 180°). Any run of consecutive spokes, taken from anywhere in the
    recording, then covers the circle almost evenly, so one scan can be rebuilt afterwards at
    whatever frame rate the patient’s motion turns out to need; by 2014 the scheme was carrying
    free-breathing scans of the abdomen in adults and children. The same logic scatters
    “Fibonacci lattices” of sample points over the globe: in a 2010 comparison such a lattice cut
    the error of measuring areas on a sphere by at least 40 percent against a latitude–longitude
    grid.</p>
    <p>Order without repetition has become a laboratory instrument. In 2022 physicists drove a
    chain of ten ytterbium-ion qubits with laser pulses in the pattern of the Fibonacci word, the
    pulse above played to atoms; the qubits at the chain’s ends held their quantum state for the
    whole experiment, about 5.5 seconds, against about 1.5 seconds under a strictly periodic
    drive. In 2023 the “hat”, the long-sought single tile that covers the plane but never
    periodically, turned out to grow its hierarchy by a factor of φ² at every level. The golden
    ratio is also an eigenvalue: each Fibonacci step multiplies a pair of numbers by the matrix
    <code>[[1,&nbsp;1],&nbsp;[1,&nbsp;0]]</code>, and repeating it settles the ratio on φ, the
    matrix’s largest eigenvalue, by the same power iteration that, damped by 0.85,
    <a href="#ex-eigen">ranks the web</a>. And the continued fraction, which measures how
    irrational an angle is, reads a hidden period off a quantum measurement in
    <a href="#ex-shor">the Period Engine</a>.</p>
    <p>The plant is still being argued with. In 2023, fossils of <em>Asteroxylon mackiei</em>, a
    plant more than 400 million years old from Scotland’s Rhynie chert, turned out to carry
    their leaves in whorls and in spirals, and not one of the spirals was Fibonacci. In
    September 2026 two chemists at Eötvös Loránd University in Budapest reported paired families
    of phyllotactic spirals growing from a chemical Turing reaction, with no living cell
    involved.</p>`;

const SOURCES = [
  { text: 'Helmut Vogel, “A better way to construct the sunflower head”, <em>Mathematical Biosciences</em> 44 (1979): 179–189', url: 'https://doi.org/10.1016/0025-5564(79)90080-4' },
  { text: 'Adolf Hurwitz, “Ueber die angenäherte Darstellung der Irrationalzahlen durch rationale Brüche”, <em>Mathematische Annalen</em> 39 (1891): 279–284', url: 'https://doi.org/10.1007/BF01206656' },
  { text: 'Takuya Okabe, “Biophysical optimality of the golden angle in phyllotaxis”, <em>Scientific Reports</em> 5 (2015): 15358', url: 'https://doi.org/10.1038/srep15358' },
  { text: 'Stéphane Douady and Yves Couder, “Phyllotaxis as a physical self-organized growth process”, <em>Physical Review Letters</em> 68 (1992): 2098–2101', url: 'https://doi.org/10.1103/PhysRevLett.68.2098' },
  { text: 'Jonathan Swinton, Erinma Ochu and the MSI Turing’s Sunflower Consortium, “Novel Fibonacci and non-Fibonacci structure in the sunflower: results of a citizen science experiment”, <em>Royal Society Open Science</em> 3 (2016): 160091', url: 'https://doi.org/10.1098/rsos.160091' },
  { text: 'Parmanand Singh, “The so-called Fibonacci numbers in ancient and medieval India”, <em>Historia Mathematica</em> 12 (1985): 229–244', url: 'https://doi.org/10.1016/0315-0860(85)90021-7' },
  { text: 'The Royal Swedish Academy of Sciences, “Crystals of golden proportions”, popular information on the Nobel Prize in Chemistry 2011', url: 'https://www.nobelprize.org/prizes/chemistry/2011/popular-information/' },
  { text: 'J. J. O’Connor and E. F. Robertson, “The Golden Ratio”, MacTutor History of Mathematics', url: 'https://mathshistory.st-andrews.ac.uk/HistTopics/Golden_ratio/' },
  { text: 'Stefanie Winkelmann, Tobias Schaeffter, Thomas Koehler, Holger Eggers and Olaf Doessel, “An optimal radial profile order based on the Golden Ratio for time-resolved MRI”, <em>IEEE Transactions on Medical Imaging</em> 26 (2007): 68–76', url: 'https://doi.org/10.1109/TMI.2006.885337' },
  { text: 'Philipp T. Dumitrescu et al., “Dynamical topological phase realized in a trapped-ion quantum simulator”, <em>Nature</em> 607 (2022): 463–467', url: 'https://doi.org/10.1038/s41586-022-04853-4' },
];

const LEGEND = `
    <p>The golden ratio is credited with the Parthenon’s façade, the Great Pyramid, the
    <em>Mona Lisa</em>, the chambered nautilus and the proportions of the ideal face. Nearly all
    of it is measurement folklore: draw enough rectangles on a photograph and one of them will
    oblige, and real nautilus shells, actually measured, coil in logarithmic spirals that are not
    golden ones. The sunflower is the honest exception. Phyllotaxis is a place where φ genuinely,
    measurably runs the show, for the arithmetic reason this dial lets you turn with your own
    hand.</p>
    <p>Even the names are younger than the legends. Euclid, around 300 BCE, spoke only of a line
    cut in “extreme and mean ratio”, and needed it to build the pentagon, the icosahedron and the
    dodecahedron. Luca Pacioli called it the divine proportion in a book printed in Venice in
    1509, with figures drawn by Leonardo da Vinci. The phrase “golden section” first turns up in print in
    1835, in a footnote to Martin Ohm’s textbook of elementary mathematics, and nobody knows who
    coined it.</p>`;

const SPECULATION = `
    <p>Part of the mechanism is known: the hormone auxin is pumped through the
    growing tip and gathers where the next leaf will form, and each young leaf drains the auxin
    around it, so the next one appears in the least crowded place. The arithmetic is known too:
    the golden angle is the one that fractions approximate worst. Whether evolution chose it for
    that reason is open. In 2015 Takuya Okabe of Shizuoka University wrote that “it remains
    unknown whether phyllotaxis has adaptive value, even though two centuries have passed since
    the phenomenon was discovered”, and proposed instead that the angle keeps down the cost of
    rearranging leaves as a stem matures. One of the earliest leafy plants, <em>Asteroxylon
    mackiei</em>, set its leaves in whorls and in spirals that are never Fibonacci, which fits
    neither story neatly. Perhaps the golden angle is a late refinement; perhaps the physics allows several good
    answers and life found them in turn.</p>`;

const ALT = 'A sunflower head of 610 glowing seeds grown by one rule, seed i at angle i·θ, inside a dial ring that sets θ; beside it the angle in degrees and as a fraction of a turn, its continued fraction drawn as a row of bars with the spiral counts it predicts and how closely each fraction fits, a compass of the melody’s pitches whose gaps come in at most three sizes, and the long–short word the dial writes.';

/* ======================================================================
   The exhibit
   ====================================================================== */

// Detents: the botanists' fractions, then the irrationals.
const DETENTS = [
  { key: '1/2', label: '1/2', glyph: '½', rat: { p: 1, q: 2 } },
  { key: '1/3', label: '1/3', glyph: '⅓', rat: { p: 1, q: 3 } },
  { key: '2/5', label: '2/5', glyph: '⅖', rat: { p: 2, q: 5 } },
  { key: '3/8', label: '3/8', glyph: '⅜', rat: { p: 3, q: 8 } },
  { key: '5/13', label: '5/13', glyph: '5/13', rat: { p: 5, q: 13 } },
  { key: 'pi', label: 'π', glyph: 'π', irr: 'pi' },
  { key: 'sqrt2', label: '√2', glyph: '√2', irr: 'sqrt2' },
  { key: 'e', label: 'e', glyph: 'e', irr: 'e' },
  { key: 'phi', label: 'φ★', glyph: 'φ★', irr: 'phi' },
  { key: 'lucas', label: '99.5°', glyph: '99.5°', irr: 'lucas' },
];
const detentDial = (d) => ({ irr: d.irr || null, rat: d.rat ? { p: d.rat.p, q: d.rat.q } : { p: 0, q: 1 } });
// Label priority on the ring (earlier wins a collision).
const LABEL_ORDER = ['phi', '1/2', '1/3', 'pi', 'e', 'lucas', 'sqrt2', '2/5', '3/8', '5/13'];

const FADE = 21;            // seeds fading past the rim while the head keeps growing
const BLOOM_RATE = 140;     // seeds per second while blooming
const BASE_STEP = 0.14;     // seconds per note, even pulse
const LONG_STEP = 0.185;    // pulse: long (0); short (1) = LONG/φ
const SHORT_STEP = LONG_STEP / PHI;
const COMPASS_MAX = 89;     // pitches the compass keeps
const IDLE_COMPASS = 21;    // newest seeds shown before any note
const SWEEP_DUR = 20;       // seconds for the 137° → 138° sweep
const GAP_TOL = 1e-7;
const QUEST_TOL = 0.01 / 360;

export default {
  id: 'golden',
  movement: 2,
  title: 'The Golden Angle',
  hook: 'At almost every angle, spokes. At 137.508°, a sunflower.',
  era: 'c. 300 BCE – today · Alexandria, Pisa, Freising, Paris, Manchester',
  prose: PROSE,
  chronicle: CHRONICLE,
  today: TODAY,
  sources: SOURCES,
  alt: ALT,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep */ }
    const preexisting = new Set(stage.children);

    const style = document.createElement('style');
    style.textContent = `
      #ex-golden .gd-wrap { position: relative; }
      #ex-golden .gd-knob {
        position: absolute; left: 0; top: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px;
        border-radius: 50%; touch-action: none; cursor: grab; outline: none; background: transparent;
      }
      #ex-golden .gd-knob.dragging { cursor: grabbing; }
      #ex-golden .gd-knob:focus-visible { box-shadow: 0 0 0 2px ${P.goldBright}, 0 0 14px 2px rgba(232,200,124,.35); }
      #ex-golden .gd-detents { gap: .55rem 1.4rem; align-items: center; }
      #ex-golden .gd-set { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem .45rem; }
      #ex-golden .gd-group {
        font-size: .72rem; font-variant: small-caps; letter-spacing: .14em; color: ${P.inkDim};
        margin-right: .15rem; white-space: nowrap; flex-basis: auto;
      }
      #ex-golden .gd-detents .btn.small { min-width: 2.4rem; }
      #ex-golden .gd-nw { white-space: nowrap; }
      @media (max-width: 520px) {
        #ex-golden .gd-group { flex-basis: 100%; }
        #ex-golden .gd-sep { display: none; }
        #ex-golden .mathline .gd-nw { display: block; }
      }
    `;
    stage.appendChild(style);

    // ---------- state ----------
    let base = detentDial(DETENTS.find((d) => d.key === 'phi'));
    let fine = 0;                        // fine offset in 1/180000 of a turn
    let cur = dialPlusFine(base, fine);  // the exact setting
    let info = describeDial(cur);
    let curTurn = info.turn;
    let rimPair = rimParastichies(curTurn);
    let anchorK = 0, anchorPhase = 0;    // phaseOf(k) = anchorPhase + (k − anchorK)·θ

    let g = reduced ? CAP : 0;           // seeds born (float; the fraction is drift)
    let playing = false;
    let nextIdx = 0;                     // next seed index the melody will sound
    let heardCount = 0;                  // notes sounded since play
    let lastSoundAt = 0;
    let noteQueue = [];                  // scheduled, not yet sounded {k, ph, bit, at}
    const heardPh = [];                  // phases of the latest notes (≤ COMPASS_MAX)
    let heardRun = 0;                    // notes heard since the dial last moved
    let compassFromK = 0;                // notes before this index belong to an older θ
    const heardBits = [];                // their word letters
    let flashes = [];                    // {ph, at}
    let rhythmOn = false;
    let traceMode = 'off';               // 'off' | 'net' | '8' | '13' | …
    let netCache = null, armCache = null;
    let questStage = 0, questArmed = false;
    let sweep = null;
    let scaleOscs = [];
    let needsDraw = true;
    let dragging = false;
    let L = null;                        // layout
    let idleWord = crossingWord(cur, 64);

    const bus = audio.createBus('golden');
    let scheduler = null;

    // ---------- canvas + knob ----------
    const wrap = document.createElement('div');
    wrap.className = 'gd-wrap';
    stage.appendChild(wrap);
    const canvasOpts = { height: 600 };
    const handle = cv.setupCanvas(wrap, canvasOpts);
    handle.canvas.style.touchAction = 'pan-y';
    handle.canvas.setAttribute('role', 'img');
    handle.canvas.setAttribute('aria-label', ALT);

    const knob = document.createElement('div');
    knob.className = 'gd-knob';
    knob.tabIndex = 0;
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', 'divergence angle θ');
    knob.setAttribute('aria-valuemin', '0');
    knob.setAttribute('aria-valuemax', '360');
    wrap.appendChild(knob);

    function desiredHeight(W) {
      if (W >= 760) return 600;
      if (W >= 520) return Math.round(Math.min(W, 560) + 344);
      return Math.round(W + 414);
    }
    function fitHeight() {
      const want = desiredHeight(handle.width);
      if (Math.abs(want - canvasOpts.height) > 0.5) {
        canvasOpts.height = want;
        handle.canvas.style.height = want + 'px';
      }
    }
    handle.onResize(() => { fitHeight(); L = null; needsDraw = true; });
    fitHeight();

    // ---------- sprites ----------
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rgba = (h, a) => { const [r, gg, b] = hexRgb(h); return `rgba(${r},${gg},${b},${a})`; };
    const mixHex = (a, b, t) => {
      const A = hexRgb(a), B = hexRgb(b);
      return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
    };
    // A seed: crisp bead with a soft halo. Core diameter = 0.47 of the sprite.
    function seedSprite(color) {
      const S = 64, c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d');
      const halo = x.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S / 2);
      halo.addColorStop(0, rgba(color, 0.34));
      halo.addColorStop(0.55, rgba(color, 0.08));
      halo.addColorStop(1, rgba(color, 0));
      x.fillStyle = halo; x.fillRect(0, 0, S, S);
      const core = x.createRadialGradient(S / 2 - 4, S / 2 - 5, 1, S / 2, S / 2, 15);
      core.addColorStop(0, mixHex(color, '#fff6de', 0.55));
      core.addColorStop(0.55, color);
      core.addColorStop(1, mixHex(color, '#0a0b10', 0.28));
      x.fillStyle = core;
      x.beginPath(); x.arc(S / 2, S / 2, 15, 0, TAU); x.fill();
      return c;
    }
    const RAMP = 7;
    const young = mixHex(P.goldBright, P.ink, 0.45), old = mixHex(P.gold, P.goldDim, 0.35);
    const goldRamp = [], azureRamp = [];
    for (let i = 0; i < RAMP; i++) {
      const t = i / (RAMP - 1);
      const gc = t < 0.5 ? mixHex(young, P.goldBright, t * 2) : mixHex(P.goldBright, old, (t - 0.5) * 2);
      goldRamp.push(seedSprite(gc));
      azureRamp.push(seedSprite(mixHex(mixHex(P.azure, P.ink, 0.35), P.azureDim, t * 0.6)));
    }
    const glowGold = cv.glowSprite(P.goldBright, 40);
    const glowSoft = cv.glowSprite(P.gold, 40);

    // ---------- DOM controls ----------
    ui.mathline(stage,
      '<span class="gd-nw">seed <i>i</i> : angle <code>i·θ</code>, radius <code>c·√i</code></span>' +
      '<span class="gd-sep"> &nbsp;·&nbsp; </span><span class="gd-nw">θ★ = 2π(2 − φ) ≈ 137.50776°</span>');

    const controls = ui.controlRow(stage);
    const playBtn = ui.button(controls, '▶ play the bloom', togglePlay, { primary: true });
    ui.button(controls, '↺ re-bloom', reBloom);
    const sweepBtn = ui.button(controls, '↻ sweep 137° → 138°', toggleSweep);
    const pulseTgl = ui.toggle(controls, {
      label: 'long–short pulse', value: false,
      onChange: (v) => { rhythmOn = v; needsDraw = true; },
    });

    const dialRow = ui.controlRow(stage);
    dialRow.classList.add('gd-detents');
    const detentSet = (label) => {
      const set = document.createElement('div');
      set.className = 'gd-set'; set.setAttribute('role', 'group'); set.setAttribute('aria-label', label);
      const g = document.createElement('span');
      g.className = 'gd-group'; g.textContent = label; g.setAttribute('aria-hidden', 'true');
      set.appendChild(g); dialRow.appendChild(set);
      return set;
    };
    const set1 = detentSet('the botanists’ fractions'), set2 = detentSet('irrational turns');
    const detentBtns = [];
    DETENTS.forEach((d, i) => {
      const b = ui.button(i < 5 ? set1 : set2, d.label, () => { stopSweep(); setDial(detentDial(d), 0); }, { small: true });
      b.setAttribute('aria-label', d.irr ? `${d.label}: ${IRR[d.irr].name} of a turn` : `${d.label} of a turn`);
      detentBtns.push({ d, el: b });
    });

    const row3 = ui.controlRow(stage);
    const fineSlider = ui.slider(row3, {
      label: 'fine tune', min: -2.5, max: 2.5, step: 0.002, value: 0,
      format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}°`,
      onInput: (v) => { stopSweep(); setDial(base, Math.round(v / 0.002)); },
    });
    ui.select(row3, {
      label: 'trace the spirals',
      options: [
        { value: 'off', label: 'off' },
        { value: 'net', label: 'every contact spiral' },
        { value: '8', label: '8 arms' }, { value: '13', label: '13 arms' },
        { value: '21', label: '21 arms' }, { value: '34', label: '34 arms' },
        { value: '55', label: '55 arms' },
      ],
      value: 'off',
      onChange: (v) => { traceMode = v; netCache = null; armCache = null; needsDraw = true; },
    });
    ui.button(row3, '♪ hear the scale', playScale, { small: true });

    const readout = ui.readout(stage, '');
    const quest = ui.questBanner(stage,
      'Nudge the dial and watch the sunflower shatter into spokes, then hunt your way back ' +
      'to the golden angle, where every spoke dies.');
    ui.caption(stage,
      'Drag the ring or its bright bead to set θ in steps of 0.05°; the fine slider moves it in ' +
      'thousandths of a degree, and the arrow keys on the focused bead do both (Shift for fine). ' +
      'The detents are exact, taken as fractions of a turn: π means π − 3, e means e − 2. Under ' +
      'the continued fraction, each dot marks how closely a convergent <i>p</i>/<i>q</i> fits, ' +
      '<span class="gd-nw"><i>q</i>²·|θ − <i>p</i>/<i>q</i>|</span>, against Hurwitz’s ' +
      '<span class="gd-nw">1/√5</span>, the dashed line. Each ' +
      'note is a newborn seed, sounded at 220·2<sup><i>a</i></sup> Hz, where <i>a</i> is its angle ' +
      'as a fraction of a turn. The compass keeps the latest 89 pitches, their gaps coloured gold, ' +
      'azure and crimson from largest to smallest; tap it, or the button, to hear them as a scale. ' +
      'The dial’s word writes 1 whenever a step passes the first seed’s ray; with the pulse on, 0 ' +
      'sounds long and 1 short.');
    ui.legendPanel(stage, LEGEND);
    ui.speculationPanel(stage, SPECULATION, 'why this angle?');

    // ---------- the exact dial ----------
    function phaseOf(k) {
      const dk = k - anchorK;
      if (!cur.irr) {
        const { p, q } = cur.rat;
        const r = ((((dk % q) * p) % q) + q) % q;
        return mod(anchorPhase + r / q, 1);
      }
      return mod(anchorPhase + dk * curTurn, 1);
    }
    function setDial(newBase, j) {
      // Fold a fine offset past the slider's range into the base.
      if (Math.abs(j) > 1250) { newBase = dialPlusFine(newBase, j); j = 0; }
      // Nothing moved (a drag within one ring step): keep everything as it is.
      if (j === fine && newBase.irr === base.irr && newBase.rat.p === base.rat.p &&
          newBase.rat.q === base.rat.q) return;
      // Keep the newest seed where it is; the older ones shear.
      const K = playing ? Math.max(0, nextIdx - 1) : Math.max(0, Math.floor(g) - 1);
      anchorPhase = phaseOf(K); anchorK = K;
      // The compass holds one progression of multiples at a time: from the
      // anchor on, every note is anchorPhase + j·θ for the new θ.
      heardPh.length = 0; heardRun = 0; compassFromK = K;
      base = newBase; fine = j;
      cur = dialPlusFine(base, fine);
      info = describeDial(cur);
      curTurn = info.turn;
      rimPair = rimParastichies(curTurn);
      idleWord = crossingWord(cur, 64);
      netCache = null; armCache = null;
      fineSlider.set(fine * 0.002);
      needsDraw = true;
      refreshReadout();
      checkQuest();
    }

    function circDist(a, b) { const d = Math.abs(mod(a - b, 1)); return Math.min(d, 1 - d); }
    const noSpokes = () => !!cur.irr || cur.rat.q > CAP;
    function checkQuest() {
      if (sweep) return;
      const dG = circDist(curTurn, GOLDEN_TURN), dM = circDist(curTurn, MIRROR_TURN);
      if (questStage === 0) {
        if (!questArmed && Math.min(dG, dM) > 0.01) questArmed = true;
        else if (questArmed && dG < QUEST_TOL && noSpokes()) {
          questStage = 1;
          quest.done(goldenMessage());
        }
      } else if (questStage === 1) {
        if (dG > 0.01) {
          questStage = 2;
          quest.set('One more hunt. The dial holds a second golden angle, the first one’s mirror ' +
            'image. Find it.');
        }
      } else if (questStage === 2 && dM < QUEST_TOL && noSpokes()) {
        questStage = 3;
        quest.done(`θ = ${info.deg.toFixed(3)}°, within a hundredth of a degree of 360° − θ★ ≈ ` +
          `${(360 - GOLDEN_DEG).toFixed(3)}°, the mirror image: the same sunflower, its spirals ` +
          'turning the other way.');
      }
    }
    // The rim's two nearest-neighbour families: opposite-handed (a true
    // parastichy pair) or both along the same arms, as near a fraction.
    function rimText(short = false) {
      if (rimPair.length !== 2) return 'spiral arms';
      const [a, b] = rimPair;
      const hand = (d) => mod(d * curTurn, 1) < 0.5;
      if (hand(a) !== hand(b)) return short ? `${a} spirals one way, ${b} the other` : `${a} spirals one way and ${b} the other`;
      return `${Math.min(a, b)} curving arms`;
    }
    function goldenMessage() {
      const deg = info.deg.toFixed(3);
      if (cur.irr === 'phi' && cur.rat.p === 0) {
        return `θ★ = 137.50776°, the golden angle. No spokes and no loop: at the rim, ${rimText()}.`;
      }
      if (cur.irr) {
        return `θ = ${deg}°, within a hundredth of a degree of θ★ and irrational, so it never ` +
          `loops; to 610 seeds it is the golden angle. At the rim, ${rimText()}.`;
      }
      return `θ = ${deg}°, strictly ${cur.rat.p}/${cur.rat.q} of a turn: a loop ` +
        `${cur.rat.q.toLocaleString('en-US')} notes long, more than 610 seeds can show. To this ` +
        `head it is the golden angle: ${rimText()}.`;
    }

    // ---------- pointer: ring (mouse) and bead (touch, mouse, keys) ----------
    function dialHit(x, y) {
      if (!L) return false;
      return Math.abs(Math.hypot(x - L.cx, y - L.cy) - L.Rd) <= 18;
    }
    function applyDial(x, y) {
      let t = mod(Math.atan2(x - L.cx, -(y - L.cy)) / TAU, 1);
      const k = Math.round(t * RING_DEN) % RING_DEN;
      stopSweep();
      setDial({ irr: null, rat: ratNorm(k, RING_DEN) }, 0);
    }
    const onDown = (e) => {
      const [x, y] = cv.pointerPos(handle, e);
      if (compassHit(x, y)) { playScale(); return; }
      if (!dialHit(x, y)) return;
      dragging = true;
      handle.canvas.style.cursor = 'grabbing';
      try { handle.canvas.setPointerCapture(e.pointerId); } catch { /* ok */ }
      applyDial(x, y);
    };
    const onMove = (e) => {
      const [x, y] = cv.pointerPos(handle, e);
      if (dragging) { applyDial(x, y); return; }
      handle.canvas.style.cursor = dialHit(x, y) ? 'grab' : compassHit(x, y) ? 'pointer' : '';
    };
    const onUp = (e) => {
      dragging = false;
      handle.canvas.style.cursor = '';
      try { handle.canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }
    };
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('pointerup', onUp);
    handle.canvas.addEventListener('pointercancel', onUp);

    let knobDrag = false;
    const kDown = (e) => {
      knobDrag = true; knob.classList.add('dragging');
      try { knob.setPointerCapture(e.pointerId); } catch { /* ok */ }
      e.preventDefault();
    };
    const kMove = (e) => {
      if (!knobDrag || !L) return;
      const [x, y] = cv.pointerPos(handle, e);
      applyDial(x, y);
    };
    const kUp = (e) => {
      knobDrag = false; knob.classList.remove('dragging');
      try { knob.releasePointerCapture(e.pointerId); } catch { /* ok */ }
    };
    const kKey = (e) => {
      let handled = true;
      const stepJ = e.shiftKey ? 1 : 25;
      const sorted = [...DETENTS].sort((a, b) => dialTurn(detentDial(a)) - dialTurn(detentDial(b)));
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { stopSweep(); setDial(base, fine + stepJ); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { stopSweep(); setDial(base, fine - stepJ); }
      else if (e.key === 'Home') { stopSweep(); setDial(detentDial(DETENTS[8]), 0); }
      else if (e.key === 'PageUp' || e.key === 'PageDown') {
        stopSweep();
        const up = e.key === 'PageUp';
        let pick = up ? sorted.find((d) => dialTurn(detentDial(d)) > curTurn + 1e-9) || sorted[0]
          : [...sorted].reverse().find((d) => dialTurn(detentDial(d)) < curTurn - 1e-9) || sorted[sorted.length - 1];
        setDial(detentDial(pick), 0);
      } else handled = false;
      if (handled) e.preventDefault();
    };
    knob.addEventListener('pointerdown', kDown);
    knob.addEventListener('pointermove', kMove);
    knob.addEventListener('pointerup', kUp);
    knob.addEventListener('pointercancel', kUp);
    knob.addEventListener('keydown', kKey);

    // ---------- audio ----------
    // The melody IS the bloom: note k is seed k, born at the centre as it
    // sounds, pitched by its own angle folded into one octave. The index runs
    // on without bound, so at θ★ the song never comes round again.
    function tick(t) {
      if (!playing) return null;
      const k = nextIdx++;
      const ph = phaseOf(k);
      const bit = phaseOf(k + 1) < ph ? 1 : 0;       // does the next step pass the ray?
      const freq = 220 * Math.pow(2, ph);
      const pan = 0.55 * Math.sin(ph * TAU);
      audio.playTone(bus, { freq, dur: 0.17, type: 'triangle', level: 0.34, release: 0.08, when: t, pan });
      audio.playTone(bus, { freq: freq * 2, dur: 0.1, type: 'sine', level: 0.07, release: 0.06, when: t, pan });
      noteQueue.push({ k, ph, bit, at: t });
      return t + (rhythmOn ? (bit ? SHORT_STEP : LONG_STEP) : BASE_STEP);
    }
    function togglePlay() {
      if (playing) { stopMelody(); return; }
      audio.ensureAudio();
      bus.unmute();
      stopSweep();
      if (g < CAP) g = CAP;              // finish the bloom first
      g = Math.floor(g);
      playing = true;
      nextIdx = g;
      heardCount = 0; heardPh.length = 0; heardBits.length = 0;
      heardRun = 0; compassFromK = nextIdx;
      noteQueue = []; flashes = [];
      lastSoundAt = 0;
      scheduler = audio.createScheduler(tick);
      scheduler.start();
      playBtn.textContent = '■ still the melody';
      playBtn.classList.add('active');
      needsDraw = true;
    }
    function stopMelody() {
      if (!playing) return;
      playing = false;
      if (scheduler) { scheduler.stop(); scheduler = null; }
      noteQueue = [];
      playBtn.textContent = '▶ play the bloom';
      playBtn.classList.remove('active');
      needsDraw = true;
    }
    function reBloom() {
      stopMelody(); stopSweep();
      g = reduced ? CAP : 0;
      anchorK = 0; anchorPhase = 0;
      heardCount = 0; heardPh.length = 0; heardBits.length = 0; flashes = [];
      netCache = null; armCache = null;
      needsDraw = true;
    }
    function compassSet() {
      if (heardPh.length) return heardPh.slice();
      const out = [];
      const newest = Math.floor(g) - 1;
      for (let k = Math.max(0, newest - IDLE_COMPASS + 1); k <= newest; k++) out.push(phaseOf(k));
      return out;
    }
    function playScale() {
      audio.ensureAudio();
      bus.unmute();
      stopScale();
      const c = bus.context;
      if (!c) return;
      const ph = compassSet().sort((a, b) => a - b);
      if (!ph.length) return;
      ph.push(1);                              // close on the octave
      const dt = Math.min(0.12, 3.2 / ph.length);
      const t0 = c.currentTime + 0.05;
      ph.forEach((x, i) => {
        const at = t0 + i * dt;
        scaleOscs.push({ at, osc: audio.playTone(bus, {
          freq: 220 * Math.pow(2, x), dur: Math.max(0.09, dt * 1.4), type: 'triangle',
          level: 0.3, release: 0.06, when: at,
        }) });
      });
    }
    // Cancel the notes that have not begun; a note already sounding finishes
    // its own short envelope (stopping it mid-note would click). On pause the
    // bus is muted as well.
    function stopScale() {
      const c = bus.context, now = c ? c.currentTime : 0;
      for (const n of scaleOscs) {
        if (n.at > now + 0.01) { try { n.osc.stop(); } catch { /* already stopped */ } }
      }
      scaleOscs = [];
    }

    // ---------- sweep ----------
    const SWEEP_J0 = Math.round((137 - GOLDEN_DEG) / 0.002);   // −254
    const SWEEP_J1 = Math.round((138 - GOLDEN_DEG) / 0.002);   // +246
    function toggleSweep() {
      if (sweep) { stopSweep(); return; }
      sweep = { t: 0, lastJ: null };
      sweepBtn.textContent = '■ stop the sweep';
      sweepBtn.classList.add('active');
      needsDraw = true;
    }
    function stopSweep() {
      if (!sweep) return;
      sweep = null;
      sweepBtn.textContent = '↻ sweep 137° → 138°';
      sweepBtn.classList.remove('active');
    }
    function stepSweep(dt) {
      sweep.t += dt;
      let u = Math.min(1, sweep.t / SWEEP_DUR);
      if (reduced) u = Math.min(1, Math.floor(sweep.t / 2) / 10);
      const j = Math.round(SWEEP_J0 + (SWEEP_J1 - SWEEP_J0) * u);
      if (j !== sweep.lastJ) {
        sweep.lastJ = j;
        setDial(detentDial(DETENTS[8]), j);          // no quest credit while sweeping
      }
      if (u >= 1) stopSweep();
    }

    // ---------- readout ----------
    // "2 − φ of a turn", "2 − φ of a turn + 0.006°", "55/144 of a turn"
    function detentName() {
      if (cur.irr) {
        const extra = dialPlusFine({ irr: null, rat: base.rat }, fine).rat;     // the rational part
        if (extra.p === 0) return `${IRR[cur.irr].name} of a turn`;
        let deg = (extra.p / extra.q) * 360;
        if (deg > 180) deg -= 360;
        return `${IRR[cur.irr].name} of a turn ${deg >= 0 ? '+' : '−'} ${Math.abs(deg).toFixed(3)}°`;
      }
      return `${cur.rat.p}/${cur.rat.q} of a turn`;
    }
    function cfString(n = 10) {
      const cf = info.cf;
      const shown = cf.slice(0, n + 1);
      const ends = info.rational && cf.length <= n + 1;
      return `[${shown[0]}; ${shown.slice(1).join(', ')}${ends ? ']' : ', …]'}`;
    }
    function refreshReadout() {
      for (const b of detentBtns) {
        const d = detentDial(b.d);
        const on = fine === 0 && d.irr === base.irr && d.rat.p === base.rat.p && d.rat.q === base.rat.q;
        b.el.classList.toggle('active', on);
      }
      let line2;
      if (info.rational) {
        const q = info.rational.q;
        if (q === 1) line2 = 'every seed on one ray: one spoke, one note';
        else if (q <= CAP) {
          line2 = `exactly ${info.rational.p}/${q} of a turn: ${q} spokes, and the melody loops every ${q} notes` +
            (info.arms.length > 1 ? `; arms on the way: ${info.arms.slice(0, -1).join(', ')}` : '');
        } else {
          line2 = `exactly ${info.rational.p}/${q} of a turn: a loop ${q.toLocaleString('en-US')} notes long, ` +
            `more than the head holds; arms: ${info.arms.filter((a) => a <= CAP).slice(0, 8).join(', ')}`;
        }
      } else {
        line2 = `${detentName()}, irrational: no spokes, no loop; spiral arms ` +
          `${info.arms.filter((a) => a <= 1000).slice(0, 9).join(', ')}, …`;
      }
      readout.setHTML(
        `θ = <code>${info.deg.toFixed(3)}°</code> · <code>${curTurn.toFixed(6)}</code> of a turn · ` +
        `cf <code>${cfString()}</code><br>${line2}`);
      const vt = `${info.deg.toFixed(3)} degrees, ${info.rational ? `${info.rational.p}/${info.rational.q} of a turn` : 'irrational'}`;
      knob.setAttribute('aria-valuenow', info.deg.toFixed(3));
      knob.setAttribute('aria-valuetext', vt);
    }

    /* ==================================================================
       Drawing
       ================================================================== */

    function layout() {
      const W = handle.width, H = handle.height;
      const o = { W, H };
      if (W >= 760) {
        o.mode = 'wide';
        const split = Math.round(W * 0.585);
        o.split = split;
        o.cx = split / 2 + 6; o.cy = H / 2;
        o.Rd = Math.max(40, Math.min(split / 2 - 40, H / 2 - 38));
        const x = split + 28, w = Math.max(60, W - x - 24);
        o.A = { x, y: 28, w, h: 100 };
        o.B = { x, y: 152, w, h: 146 };
        o.C = { x, y: 324, w, h: 142 };
        o.D = { x, y: H - 100, w, h: 78 };
      } else if (W >= 520) {
        o.mode = 'mid';
        const S = Math.min(W, 560);
        o.cx = W / 2; o.cy = S / 2 + 4;
        o.Rd = Math.max(40, S / 2 - 34);
        const x = 22, w = W - 44, y0 = S + 6;
        o.A = { x, y: y0, w, h: 88 };
        const half = (w - 28) / 2;
        o.B = { x, y: y0 + 100, w: half, h: 140 };
        o.C = { x: x + half + 28, y: y0 + 100, w: half, h: 140 };
        o.D = { x, y: y0 + 264, w, h: 66 };
      } else {
        o.mode = 'small';
        const S = W;
        o.cx = W / 2; o.cy = S / 2 + 4;
        o.Rd = Math.max(30, S / 2 - 28);
        const x = 14, w = Math.max(40, W - 28), y0 = S + 4;
        o.A = { x, y: y0, w, h: 88 };
        o.B = { x, y: y0 + 100, w, h: 110 };
        o.C = { x, y: y0 + 222, w, h: 108 };
        o.D = { x, y: y0 + 340, w, h: 56 };
      }
      o.R = Math.max(20, o.Rd - (o.mode === 'small' ? 13 : 17));
      return o;
    }

    // --- text helpers ---
    const hasLS = 'letterSpacing' in handle.ctx;
    function caps(ctx, text, x, y, color, size = 9.5, align = 'left') {
      ctx.font = `600 ${size}px ${SERIF}`;
      if (hasLS) ctx.letterSpacing = `${(size * 0.2).toFixed(2)}px`;
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      ctx.fillText(text.toUpperCase(), x, y);
      if (hasLS) ctx.letterSpacing = '0px';
    }
    function fitFont(ctx, text, maxW, size, tmpl) {
      let s = size;
      ctx.font = tmpl(s);
      while (s > 7 && ctx.measureText(text).width > maxW) { s -= 0.5; ctx.font = tmpl(s); }
      return s;
    }
    function wrapText(ctx, text, x, y, maxW, lh, maxLines = 3) {
      const words = text.split(' ');
      let line = '', n = 0;
      for (let i = 0; i < words.length; i++) {
        const test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) {
          if (n === maxLines - 1) { ctx.fillText(line + '…', x, y + n * lh); return n + 1; }
          ctx.fillText(line, x, y + n * lh); n++; line = words[i];
        } else line = test;
      }
      if (line) { ctx.fillText(line, x, y + n * lh); n++; }
      return n;
    }

    // --- the dial ring ---
    function drawDial(ctx) {
      const { cx, cy, Rd } = L;
      const small = L.mode === 'small';
      // faint illuminated ground behind the head
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rd);
      halo.addColorStop(0, 'rgba(201,169,89,0.07)');
      halo.addColorStop(0.75, 'rgba(201,169,89,0.025)');
      halo.addColorStop(1, 'rgba(201,169,89,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, Rd, 0, TAU); ctx.fill();

      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, Rd, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(P.line, 0.6);
      ctx.beginPath(); ctx.arc(cx, cy, Rd - 5, 0, TAU); ctx.stroke();
      // degree ticks: every 5°, longer every 30°
      ctx.beginPath();
      for (let d = 0; d < 360; d += 5) {
        const a = (d / 360) * TAU - Math.PI / 2;
        const len = d % 30 === 0 ? 5 : 2.5;
        ctx.moveTo(cx + Rd * Math.cos(a), cy + Rd * Math.sin(a));
        ctx.lineTo(cx + (Rd + len) * Math.cos(a), cy + (Rd + len) * Math.sin(a));
      }
      ctx.strokeStyle = P.inkGhost || P.line; ctx.stroke();
      // the arc of one divergence, 0 → θ
      const a0 = -Math.PI / 2, a1 = curTurn * TAU - Math.PI / 2;
      ctx.strokeStyle = rgba(P.gold, 0.45); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, Rd - 5, a0, a1); ctx.stroke();
      ctx.lineWidth = 1;
      // zero mark
      ctx.strokeStyle = P.inkFaint;
      ctx.beginPath(); ctx.moveTo(cx, cy - Rd + 5); ctx.lineTo(cx, cy - Rd - 7); ctx.stroke();

      // detent ticks and labels (greedy, no collisions)
      const placed = [];
      const labelR = Rd + (small ? 12 : 15);
      const active = detentBtns.find((b) => b.el.classList.contains('active'));
      const order = [...LABEL_ORDER];
      if (active) { order.splice(order.indexOf(active.d.key), 1); order.unshift(active.d.key); }
      for (const d of DETENTS) {
        const t = dialTurn(detentDial(d));
        const a = t * TAU - Math.PI / 2;
        const isPhi = d.key === 'phi';
        ctx.strokeStyle = isPhi ? P.gold : P.inkFaint;
        ctx.lineWidth = isPhi ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + (Rd - 5) * Math.cos(a), cy + (Rd - 5) * Math.sin(a));
        ctx.lineTo(cx + (Rd + 7) * Math.cos(a), cy + (Rd + 7) * Math.sin(a));
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      const fs = small ? 10.5 : 12;
      for (const key of order) {
        const d = DETENTS.find((x) => x.key === key);
        const t = dialTurn(detentDial(d));
        const a = t * TAU - Math.PI / 2;
        const isPhi = key === 'phi';
        const isActive = active && active.d.key === key;
        const vulgar = '½⅓⅖⅜'.includes(d.glyph);
        ctx.font = isPhi ? `italic 600 ${fs + 1}px ${SERIF}` : `${vulgar ? fs + 3 : fs}px ${SERIF}`;
        const tw = ctx.measureText(d.glyph).width;
        let lx = cx + labelR * Math.cos(a), ly = cy + labelR * Math.sin(a);
        // push the label outward along the ray by half its extent in that direction
        lx += Math.cos(a) * tw * 0.45; ly += Math.sin(a) * 5;
        const boxAt = (px, py) => ({ x0: px - tw / 2 - 2, x1: px + tw / 2 + 2, y0: py - 7, y1: py + 7 });
        const inside = (b) => b.x0 >= 2 && b.x1 <= L.W - 2 && b.y0 >= 1;
        // the bead sits on the active detent: step its label clear of the glow
        if (isActive) {
          const px = lx + Math.cos(a) * 7, py = ly + Math.sin(a) * 7;
          if (inside(boxAt(px, py))) { lx = px; ly = py; }
        }
        const box = boxAt(lx, ly);
        if (!inside(box)) continue;
        if (placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) continue;
        placed.push(box);
        ctx.fillStyle = isPhi ? P.goldBright : isActive ? P.ink : P.inkFaint;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.glyph, lx, ly);
      }
      ctx.textBaseline = 'alphabetic';
      // θ★ notch glow
      const ap = GOLDEN_TURN * TAU - Math.PI / 2;
      glowSoft.draw(ctx, cx + Rd * Math.cos(ap), cy + Rd * Math.sin(ap), 0.5);
      // the bead
      const bx = cx + Rd * Math.cos(a1), by = cy + Rd * Math.sin(a1);
      glowGold.draw(ctx, bx, by, dragging || knobDrag ? 1.05 : 0.85);
      ctx.fillStyle = P.goldBright;
      ctx.beginPath(); ctx.arc(bx, by, 3.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(P.bg, 0.9); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, by, 3.6, 0, TAU); ctx.stroke();
      knob.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
    }

    // --- the head ---
    function ensureNet() {
      if (netCache && netCache.turn === curTurn) return netCache;
      netCache = { turn: curTurn, nb: contactNeighbours(curTurn, CAP + FADE) };
      return netCache;
    }
    function ensureArms(q) {
      if (armCache && armCache.q === q && armCache.turn === curTurn && armCache.anchorK === anchorK) return armCache;
      const idx = [];
      for (let j = 0; j < q; j++) idx.push([phaseOf(anchorK + j), j]);
      idx.sort((a, b) => a[0] - b[0]);
      const rank = new Int32Array(q);
      idx.forEach(([, j], r) => { rank[j] = r; });
      armCache = { q, turn: curTurn, anchorK, rank };
      return armCache;
    }
    function drawHead(ctx, now) {
      const { cx, cy, R } = L;
      const c = R / Math.sqrt(CAP - 1);
      const sp = 1.72 * c;                      // nearest-neighbour spacing
      const B = Math.floor(g), f = g - B;
      const kLo = Math.max(0, B - CAP - FADE), kHi = B - 1;
      const pos = (k) => {
        const age = B - 1 - k + f;
        const r = c * Math.sqrt(Math.max(0, age));
        const a = phaseOf(k) * TAU - Math.PI / 2;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a), r, age];
      };

      const q = traceMode !== 'off' && traceMode !== 'net' ? parseInt(traceMode, 10) : 0;
      // trace lines first, under the seeds
      if (traceMode === 'net' && kHi >= kLo) {
        const nb = ensureNet().nb;
        const pathA = new Path2D(), pathB = new Path2D();
        for (let k = kLo; k <= kHi; k++) {
          const ia = B - 1 - k;
          if (ia < 0 || ia >= CAP + FADE) continue;
          for (let s = 0; s < 2; s++) {
            const d = nb[2 * ia + s];
            const k2 = k - d;                     // the older neighbour
            if (!d || k2 < kLo) continue;
            const [x1, y1] = pos(k), [x2, y2] = pos(k2);
            const path = mod(d * curTurn, 1) < 0.5 ? pathA : pathB;
            path.moveTo(x1, y1); path.lineTo(x2, y2);
          }
        }
        ctx.lineWidth = L.mode === 'small' ? 0.9 : 1.25;
        ctx.strokeStyle = rgba(P.goldBright, 0.62); ctx.stroke(pathA);
        ctx.strokeStyle = rgba(P.azure, 0.72); ctx.stroke(pathB);
      } else if (q) {
        const { rank } = ensureArms(q);
        const pathA = new Path2D(), pathB = new Path2D();
        for (let k = kLo; k + q <= kHi; k++) {
          const [x1, y1, r1] = pos(k), [x2, y2] = pos(k + q);
          if (Math.hypot(x2 - x1, y2 - y1) > 2.7 * sp || r1 < 1) continue;
          const arm = mod(k - anchorK, q);
          ((rank[arm] % 2) ? pathB : pathA).moveTo(x1, y1);
          ((rank[arm] % 2) ? pathB : pathA).lineTo(x2, y2);
        }
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = rgba(P.gold, 0.5); ctx.stroke(pathA);
        ctx.strokeStyle = rgba(P.azure, 0.55); ctx.stroke(pathB);
      }

      const rank = q ? ensureArms(q).rank : null;
      const dimForNet = traceMode === 'net' ? 0.5 : 1;
      const shrink = traceMode === 'net' ? 0.72 : 1;
      for (let k = kLo; k <= kHi; k++) {
        const [x, y, r, age] = pos(k);
        let alpha = dimForNet;
        if (age > CAP - 1) alpha *= Math.max(0, 1 - (age - (CAP - 1)) / FADE);
        if (alpha <= 0.01) continue;
        const grow = Math.min(1, 0.35 + age * 0.45);
        const core = sp * (0.4 + 0.2 * Math.min(1, r / R)) * grow * shrink;
        const size = core / 0.47;
        const ti = Math.min(RAMP - 1, Math.round(Math.min(1, r / R) * (RAMP - 1)));
        let spr = goldRamp[ti];
        if (rank) {
          const arm = mod(k - anchorK, q);
          const rk = rank[arm];
          const odd = rk % 2 === 1 || (q % 2 === 1 && rk === q - 1 && q > 1);
          if (odd) spr = azureRamp[ti];
        }
        ctx.globalAlpha = alpha;
        ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // the newborn: a flash at the centre and a ray toward the rim
      const life = 0.7;
      flashes = flashes.filter((fl) => now - fl.at < life || reduced);
      if (reduced && flashes.length > 1) flashes = flashes.slice(-1);
      for (const fl of flashes) {
        const t = reduced ? 0.3 : Math.max(0, (now - fl.at) / life);
        const a = fl.ph * TAU - Math.PI / 2;
        ctx.strokeStyle = rgba(P.goldBright, 0.32 * (1 - t));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + 6 * Math.cos(a), cy + 6 * Math.sin(a));
        ctx.lineTo(cx + (R + 4) * Math.cos(a), cy + (R + 4) * Math.sin(a));
        ctx.stroke();
      }
      if (playing && flashes.length) {
        const fl = flashes[flashes.length - 1];
        const t = reduced ? 0 : Math.max(0, (now - fl.at) / life);
        glowGold.draw(ctx, cx, cy, Math.max(0.2, 0.9 * (1 - t) + 0.25));
      }
    }

    // --- A · the angle ---
    function drawPlate(ctx) {
      const { x, y, w } = L.A;
      const small = L.mode === 'small';
      caps(ctx, 'the divergence angle', x, y + 9, P.inkDim, small ? 9 : 9.5);
      const bigY = y + (small ? 34 : 40);
      ctx.font = `italic ${small ? 22 : 26}px ${SERIF}`;
      ctx.fillStyle = P.gold; ctx.textAlign = 'left';
      ctx.fillText('θ', x, bigY);
      const tw = ctx.measureText('θ').width;
      ctx.font = `500 ${small ? 20 : 24}px ${MONO}`;
      ctx.fillStyle = P.goldBright;
      ctx.fillText(`= ${info.deg.toFixed(3)}°`, x + tw + 6, bigY);
      const vw = ctx.measureText(`= ${info.deg.toFixed(3)}°`).width;
      // the exact name beside it
      const nameTxt = detentName();
      const nx = x + tw + 6 + vw + 12;
      if (nx + 60 < x + w) {
        fitFont(ctx, nameTxt, x + w - nx, small ? 12 : 13.5, (v) => `italic ${v}px ${SERIF}`);
        ctx.fillStyle = info.rational ? P.ink : P.inkDim;
        ctx.fillText(nameTxt, nx, bigY - 2);
      }
      // Babylonian degrees and the turn
      const sub = `${toDMS(info.deg)} · ${curTurn.toFixed(7)} turn`;
      fitFont(ctx, sub, w, small ? 10.5 : 11.5, (v) => `${v}px ${MONO}`);
      ctx.fillStyle = P.inkFaint;
      ctx.fillText(sub, x, bigY + (small ? 17 : 20));
      // status
      let status;
      if (info.rational) {
        const q = info.rational.q;
        status = q === 1 ? 'Every seed on one ray.'
          : q <= CAP ? `Rational: ${q} spokes, and the melody loops every ${q} notes.`
            : `Rational, but its loop is ${q.toLocaleString('en-US')} notes long. At the rim, ${rimText(true)}.`;
      } else {
        status = `Irrational: no spokes, no loop. At the rim, ${rimText(true)}.`;
      }
      ctx.font = `${small ? 12 : 13.5}px ${SERIF}`;
      ctx.fillStyle = info.rational && info.rational.q <= CAP ? P.crimsonBright || P.crimson : P.ink;
      wrapText(ctx, status, x, bigY + (small ? 36 : 40), w, small ? 15 : 17, 2);
    }

    // --- B · the continued fraction ---
    function drawCF(ctx) {
      const { x, y, w, h } = L.B;
      const small = L.mode === 'small';
      caps(ctx, 'the turn as a continued fraction', x, y + 9, P.inkDim, small ? 9 : 9.5);
      const terms = info.cf.slice(1);
      const conv = convergents(info.cf);
      const maxCells = small ? 9 : 11;
      const lab = 16;
      const cw = (w - lab) / maxCells;
      const n = Math.min(terms.length, maxCells - (info.rational ? 1 : 0));
      const barTop = small ? y + 22 : y + 32, barH = small ? 28 : 40, base0 = barTop + barH;
      const LOG = Math.log2(1 + 300);
      ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint; ctx.textAlign = 'left';
      ctx.fillText('a', x, base0 - 2);
      ctx.fillText('q', x, base0 + 14);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + lab, base0 + 0.5); ctx.lineTo(x + w, base0 + 0.5); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const a = terms[i];
        const bx = x + lab + i * cw + cw / 2;
        const bh = Math.max(3, barH * (0.12 + 0.88 * Math.min(1, Math.log2(1 + a) / LOG)));
        const bw = Math.max(3, Math.min(12, cw * 0.46));
        ctx.fillStyle = a === 1 ? P.gold : a < 10 ? P.azure : (P.crimsonBright || P.crimson);
        ctx.globalAlpha = 0.9;
        ctx.fillRect(bx - bw / 2, base0 - bh, bw, bh);
        ctx.globalAlpha = 1;
        const at = String(a);
        fitFont(ctx, at, cw - 2, small ? 10 : 11, (v) => `${v}px ${MONO}`);
        ctx.fillStyle = P.ink; ctx.textAlign = 'center';
        ctx.fillText(at, bx, base0 - bh - 4);
        const qv = conv[i + 1] ? conv[i + 1][1] : null;
        if (qv != null) {
          let qs = qv < 10000 ? String(qv) : qv < 1e6 ? `${Math.round(qv / 1000)}k` : `${(qv / 1e6).toFixed(1)}M`;
          // four digits in a narrow cell run into their neighbours: 2378 → 2.4k
          if (qv >= 1000 && qv < 10000) {
            ctx.font = `8.5px ${MONO}`;
            if (ctx.measureText(qs).width > cw - 4) qs = `${(qv / 1000).toFixed(1)}k`;
          }
          fitFont(ctx, qs, cw - 3, small ? 9 : 10, (v) => `${v}px ${MONO}`);
          ctx.fillStyle = P.inkDim;
          ctx.fillText(qs, bx, base0 + 14);
        }
      }
      if (info.rational) {
        const bx = x + lab + n * cw + cw / 2;
        ctx.font = `${small ? 11 : 12}px ${SERIF}`; ctx.fillStyle = P.crimsonBright || P.crimson; ctx.textAlign = 'center';
        ctx.fillText('∎', bx, base0 - 4);
      } else if (terms.length > n) {
        ctx.font = `${small ? 11 : 12}px ${SERIF}`; ctx.fillStyle = P.inkFaint; ctx.textAlign = 'center';
        ctx.fillText('…', x + lab + n * cw + cw / 2, base0 - 4);
      }
      // Hurwitz: how closely each convergent fits, q²·|θ − p/q|
      let yb = base0 + (small ? 20 : 22);
      {
        const hh = small ? 16 : 24, top = yb, bot = top + hh;
        const sy = (v) => bot - Math.min(1, v / 0.55) * hh;
        ctx.font = `italic 11px ${SERIF}`; ctx.fillStyle = P.inkFaint; ctx.textAlign = 'left';
        ctx.fillText('fit', x, bot - hh / 2 + 4);
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(x + lab, bot + 0.5); ctx.lineTo(x + w, bot + 0.5); ctx.stroke();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = rgba(P.gold, 0.6);
        const yh = Math.round(sy(1 / Math.sqrt(5))) + 0.5;
        ctx.beginPath(); ctx.moveTo(x + lab, yh); ctx.lineTo(x + w - 30, yh); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `10px ${MONO}`; ctx.fillStyle = P.gold; ctx.textAlign = 'right';
        ctx.fillText('1/√5', x + w, yh + 3.5);
        for (let i = 0; i < n && i < info.fits.length; i++) {
          const fv = info.fits[i];
          if (!fv) continue;
          const bx = x + lab + i * cw + cw / 2;
          if (bx > x + w - 34) break;
          const col = fv.fit === 0 || fv.fit < 0.1 ? (P.crimsonBright || P.crimson) : fv.fit > 0.4 ? P.goldBright : P.azure;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(bx, sy(fv.fit), 2.6, 0, TAU); ctx.fill();
        }
        yb = bot + (small ? 17 : 19);
      }
      // a line of commentary
      let note;
      if (info.rational) note = `The fraction ends: every seed lands on one of ${info.rational.q} rays.`;
      else if (cur.irr === 'phi') note = cur.rat.p === 0 ? 'A 2, then ones for ever: every fraction fits it badly.' : 'A nudge off θ★ breaks the run of ones.';
      else if (cur.irr === 'lucas') note = cur.rat.p === 0 ? 'A 3, then ones for ever: a cousin of φ.' : 'A nudge breaks the run of ones.';
      else if (cur.irr === 'e') note = cur.rat.p === 0 ? 'Euler’s pattern 1, 2k, 1: the bars grow for ever.' : 'A tall bar is a fraction that fits too well.';
      else if (cur.irr === 'pi') note = cur.rat.p === 0 ? 'The 292 is why 355/113 fits so well.' : 'A tall bar is a fraction that fits too well.';
      else if (cur.irr === 'sqrt2') note = cur.rat.p === 0 ? 'All twos: the runner-up, held at 1/√8.' : 'A tall bar is a fraction that fits too well.';
      else note = 'A tall bar is a fraction that fits too well.';
      ctx.textAlign = 'left';
      fitFont(ctx, note, w, small ? 11 : 12, (v) => `italic ${v}px ${SERIF}`);
      ctx.fillStyle = P.inkDim;
      ctx.fillText(note, x, Math.min(y + h - 2, yb));
    }

    // --- C · the compass of pitches ---
    function compassGeom() {
      if (!L) return null;
      const { x, y, w, h } = L.C;
      const r = clamp(Math.min((h - 44) / 2, w * 0.2), 24, 56);
      return { ix: x + r + 8, iy: y + 30 + r, r };
    }
    function compassHit(px, py) {
      const cg = compassGeom();
      return !!cg && Math.hypot(px - cg.ix, py - cg.iy) <= cg.r + 8;
    }
    function drawCompass(ctx) {
      const { x, y, w } = L.C;
      const small = L.mode === 'small';
      caps(ctx, 'the melody’s pitches', x, y + 9, P.inkDim, small ? 9 : 9.5);
      const { ix, iy, r } = compassGeom();
      const phases = compassSet();
      const nC = phases.length;
      const kinds = gapKinds(phases, GAP_TOL);
      ctx.fillStyle = rgba(P.panel, 0.9); ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ix, iy, r + 7, 0, TAU); ctx.fill(); ctx.stroke();
      // twelve semitone ticks, A at the top
      ctx.beginPath();
      for (let s = 0; s < 12; s++) {
        const a = (s / 12) * TAU - Math.PI / 2;
        ctx.moveTo(ix + (r + 3) * Math.cos(a), iy + (r + 3) * Math.sin(a));
        ctx.lineTo(ix + (r + 7) * Math.cos(a), iy + (r + 7) * Math.sin(a));
      }
      ctx.strokeStyle = P.inkGhost || P.line; ctx.stroke();
      ctx.font = `italic 10px ${SERIF}`; ctx.fillStyle = P.inkFaint; ctx.textAlign = 'center';
      ctx.fillText('A', ix, iy - r - 10);
      const colors = [P.gold, P.azure, P.crimsonBright || P.crimson];
      const s = [...phases].sort((a, b) => a - b);
      ctx.lineWidth = small ? 3 : 3.5;
      for (let i = 0; i < s.length; i++) {
        const next = i + 1 < s.length ? s[i + 1] : s[0] + 1;
        const gsz = next - s[i];
        if (gsz <= GAP_TOL) continue;
        const ci = kinds.findIndex((k) => Math.abs(k - gsz) <= GAP_TOL);
        const pad = Math.min(0.025, gsz * TAU * 0.18);
        const a0 = s[i] * TAU - Math.PI / 2 + pad, a1 = next * TAU - Math.PI / 2 - pad;
        if (a1 <= a0) continue;
        ctx.strokeStyle = colors[clamp(ci, 0, 2)];
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(ix, iy, r, a0, a1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.ink;
      for (const ph of s) {
        const a = ph * TAU - Math.PI / 2;
        ctx.beginPath(); ctx.arc(ix + (r - 6) * Math.cos(a), iy + (r - 6) * Math.sin(a), 1.4, 0, TAU); ctx.fill();
      }
      if (heardPh.length) {
        const a = heardPh[heardPh.length - 1] * TAU - Math.PI / 2;
        glowGold.draw(ctx, ix + (r - 6) * Math.cos(a), iy + (r - 6) * Math.sin(a), 0.45);
      }

      // beside the compass: the counts and the three bars
      const tx = ix + r + 20, tw = Math.max(40, x + w - tx);
      const label = heardPh.length
        ? (heardRun > COMPASS_MAX ? `the latest ${nC} notes` : `${nC} note${nC === 1 ? '' : 's'} heard`)
        : `the ${nC} newest seeds`;
      ctx.textAlign = 'left';
      fitFont(ctx, label, tw, small ? 12 : 13.5, (v) => `${v}px ${SERIF}`);
      ctx.fillStyle = P.ink;
      ctx.fillText(label, tx, y + 32);
      const kTxt = `${kinds.length} gap size${kinds.length === 1 ? '' : 's'}`;
      ctx.font = `${small ? 12 : 13}px ${SERIF}`;
      ctx.fillStyle = kinds.length === 2 && FIBS.includes(nC) ? P.goldBright : P.inkDim;
      ctx.fillText(kTxt, tx, y + 50);
      // bars: the largest above, the other two laid end to end beneath
      const scale = kinds.length ? Math.min(tw - 4, small ? 110 : 150) / kinds[0] : 0;
      const by = y + 62;
      if (kinds.length) {
        ctx.fillStyle = colors[0];
        ctx.fillRect(tx, by, kinds[0] * scale, 4);
        if (kinds.length > 1) { ctx.fillStyle = colors[1]; ctx.fillRect(tx, by + 9, kinds[1] * scale, 4); }
        if (kinds.length > 2) { ctx.fillStyle = colors[2]; ctx.fillRect(tx + kinds[1] * scale, by + 9, kinds[2] * scale, 4); }
      }
      let note = '';
      if (kinds.length === 3) note = 'the largest is the sum of the other two';
      else if (kinds.length === 2 && FIBS.includes(nC) && nC > 2) note = `${nC} is a Fibonacci number: two sizes only`;
      else if (kinds.length === 1) note = nC > 1 ? 'one size: the notes are evenly spaced' : '';
      else if (kinds.length === 2) note = 'two sizes';
      if (note) {
        ctx.font = `italic ${small ? 11 : 12}px ${SERIF}`;
        ctx.fillStyle = P.inkDim;
        wrapText(ctx, note, tx, by + 32, tw, 14, 2);
      }
    }

    // --- D · the dial's word ---
    function drawWord(ctx, now) {
      const { x, y, w } = L.D;
      const small = L.mode === 'small';
      caps(ctx, 'the dial’s word', x, y + 9, P.inkDim, small ? 9 : 9.5);
      let right;
      if (info.rational) right = `repeats every ${info.rational.q.toLocaleString('en-US')} letters`;
      else if (cur.irr === 'phi' && cur.rat.p === 0) right = 'the Fibonacci word';
      else right = 'never repeats';
      ctx.textAlign = 'right';
      fitFont(ctx, right, w * 0.5, small ? 11 : 12, (v) => `italic ${v}px ${SERIF}`);
      ctx.fillStyle = cur.irr === 'phi' && cur.rat.p === 0 ? P.goldBright : P.inkDim;
      ctx.fillText(right, x + w, y + 9);

      const u = small ? 10 : 13;                 // width of a long letter
      const sw = u / PHI;                          // a short one, in golden proportion
      const gap = 2, top = y + 20, hBar = 9;
      const letterW = (b) => (b ? sw : u) + gap;
      const drawLetter = (b, lx, alpha, showDigit) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = b ? P.azure : P.gold;
        ctx.fillRect(lx, top + (b ? 2 : 0), b ? sw : u, b ? hBar - 4 : hBar);
        if (showDigit) {
          ctx.fillStyle = P.inkDim;
          ctx.fillText(String(b), lx + (b ? sw : u) / 2, top + hBar + 12);
        }
        ctx.globalAlpha = 1;
      };
      ctx.font = `${small ? 9 : 10}px ${MONO}`; ctx.textAlign = 'center';
      ctx.save();
      ctx.beginPath(); ctx.rect(x, top - 4, w, hBar + 22); ctx.clip();
      if (playing && heardBits.length) {
        // scrolling: the sounding letter under a fixed playhead
        const px = x + Math.round(w * 0.32);
        const nextAt = noteQueue.length ? noteQueue[0].at : lastSoundAt + BASE_STEP;
        const frac = clamp((now - lastSoundAt) / Math.max(1e-3, nextAt - lastSoundAt), 0, 1);
        const curBit = heardBits[heardBits.length - 1];
        let lx = px - frac * letterW(curBit);
        drawLetter(curBit, lx, 1, true);
        // past letters, leftward
        let bx = lx;
        for (let i = heardBits.length - 2; i >= 0 && bx > x - 20; i--) {
          bx -= letterW(heardBits[i]);
          drawLetter(heardBits[i], bx, 0.85, true);
        }
        // future letters, rightward: computed from the dial
        let fx = lx + letterW(curBit);
        let k = noteQueue.length ? noteQueue[0].k : nextIdx;
        for (let i = 0; i < 80 && fx < x + w + 20; i++, k++) {
          const b = phaseOf(k + 1) < phaseOf(k) ? 1 : 0;
          drawLetter(b, fx, 0.32, false);
          fx += letterW(b);
        }
        ctx.restore();
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 0.5, top - 5); ctx.lineTo(px + 0.5, top + hBar + 3); ctx.stroke();
      } else {
        let lx = x;
        for (let i = 0; i < idleWord.length && lx + letterW(idleWord[i]) - gap <= x + w; i++) {
          drawLetter(idleWord[i], lx, 0.9, true);
          lx += letterW(idleWord[i]);
        }
        ctx.restore();
      }
      ctx.textAlign = 'left';
      const legend = rhythmOn ? '0 long · 1 short, in golden proportion: the pulse is on'
        : '1 when a step passes the first seed’s ray · the pulse plays 0 long, 1 short';
      fitFont(ctx, legend, w, small ? 10.5 : 11.5, (v) => `italic ${v}px ${SERIF}`);
      ctx.fillStyle = P.inkFaint;
      ctx.fillText(legend, x, top + hBar + (small ? 30 : 32));
    }

    function render(now) {
      const { ctx } = handle;
      if (!L) L = layout();
      const W = handle.width, H = handle.height;
      ctx.clearRect(0, 0, W, H);
      if (W < 60 || H < 60) return;
      if (L.mode === 'wide') {
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L.split + 6.5, 30); ctx.lineTo(L.split + 6.5, H - 30); ctx.stroke();
        for (const r of [L.B, L.C, L.D]) {
          ctx.strokeStyle = rgba(P.line, 0.7);
          ctx.beginPath(); ctx.moveTo(r.x, r.y - 10.5); ctx.lineTo(r.x + r.w, r.y - 10.5); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = rgba(P.line, 0.8); ctx.lineWidth = 1;
        const ys = [L.A.y - 4, L.B.y - 6, L.D.y - 6];
        if (L.mode === 'small') ys.push(L.C.y - 6);
        for (const yy of ys) { ctx.beginPath(); ctx.moveTo(L.A.x, yy + 0.5); ctx.lineTo(L.A.x + L.A.w, yy + 0.5); ctx.stroke(); }
      }
      drawDial(ctx);
      drawHead(ctx, now);
      drawPlate(ctx);
      drawCF(ctx);
      drawCompass(ctx);
      drawWord(ctx, now);
    }

    // ---------- the frame loop ----------
    function frame(dt) {
      if (sweep) stepSweep(dt);
      if (!playing && g < CAP) {
        g = Math.min(CAP, g + dt * BLOOM_RATE);
        needsDraw = true;
      }
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      if (playing) {
        while (noteQueue.length && noteQueue[0].at <= now) {
          const n = noteQueue.shift();
          heardCount++;
          lastSoundAt = n.at;
          if (n.k >= compassFromK) {
            heardRun++;
            heardPh.push(n.ph); if (heardPh.length > COMPASS_MAX) heardPh.shift();
          }
          heardBits.push(n.bit); if (heardBits.length > 64) heardBits.shift();
          flashes.push({ ph: n.ph, at: n.at });
          if (flashes.length > 10) flashes.shift();
        }
        // growth follows the audio clock: seed k is born as note k sounds
        if (heardCount > 0) {
          const nextAt = noteQueue.length ? noteQueue[0].at : lastSoundAt + BASE_STEP;
          const frac = clamp((now - lastSoundAt) / Math.max(1e-3, nextAt - lastSoundAt), 0, 0.999);
          g = (nextIdx - noteQueue.length) + frac;
        }
        needsDraw = true;
      } else if (flashes.length && !reduced) {
        needsDraw = true;
      }
      if (!needsDraw) return;             // idle and unchanged: free
      needsDraw = false;
      render(now);
    }

    const loop = cv.rafLoop(frame);
    loop.start();
    refreshReadout();

    // ---------- lifecycle ----------
    return {
      pause() {
        loop.stop();
        stopMelody(); stopSweep(); stopScale();
        bus.mute();
      },
      resume() { bus.unmute(); L = null; needsDraw = true; loop.start(); },
      destroy() {
        loop.stop(); stopMelody(); stopSweep(); stopScale();
        bus.dispose();
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointermove', onMove);
        handle.canvas.removeEventListener('pointerup', onUp);
        handle.canvas.removeEventListener('pointercancel', onUp);
        knob.removeEventListener('pointerdown', kDown);
        knob.removeEventListener('pointermove', kMove);
        knob.removeEventListener('pointerup', kUp);
        knob.removeEventListener('pointercancel', kUp);
        knob.removeEventListener('keydown', kKey);
        handle.destroy();
        for (const el of [...stage.children]) if (!preexisting.has(el)) el.remove();
      },
      // for the harness
      _debug: {
        setDialKey: (key, j = 0) => setDial(detentDial(DETENTS.find((d) => d.key === key)), j),
        setRing: (k) => setDial({ irr: null, rat: ratNorm(k, RING_DEN) }, 0),
        setTrace: (m) => { traceMode = m; netCache = null; armCache = null; needsDraw = true; },
        setPulse: (v) => { rhythmOn = v; pulseTgl.set(v); needsDraw = true; },
        play: () => { if (!playing) togglePlay(); },
        state: () => ({ g, playing, heardCount, nextIdx, turn: curTurn, quest: questStage, rim: rimPair }),
        bench: (n = 30) => {
          const actx = audio.getContext(), t0 = performance.now();
          for (let i = 0; i < n; i++) render(actx ? actx.currentTime : 0);
          return (performance.now() - t0) / n;
        },
        idleBench: (n = 300) => {
          const t0 = performance.now();
          for (let i = 0; i < n; i++) frame(0.016);
          return (performance.now() - t0) / n;
        },
      },
    };
  },
};

export const _test = {
  GOLDEN_TURN,
  GOLDEN_DEG,
  MIRROR_TURN,
  LUCAS_TURN,
  fibWord,
  fibBit,
  fibSubstitution,
  seedTurns,
  distinctTurnCount,
  gapSizes,
  gapKinds,
  analyzeTurns,
  ratNorm,
  ratAdd,
  cfRational,
  cfFloat,
  dialTurn,
  dialPlusFine,
  describeDial,
  crossingWord,
  contactNeighbours,
  rimParastichies,
  toDMS,
};
