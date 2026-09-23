// II.6 — The Geometry of Groove
// Euclidean rhythms: Bjorklund's accelerator-timing procedure has the structure
// of Euclid's reciprocal subtraction (Toussaint, Bridges Banff 2005), and its
// maximally even patterns are traditional timelines of the world and, mapped
// onto the chromatic circle, the pentatonic and diatonic scales.
//
// Verified against: Toussaint 2005 (archive.bridgesmathart.org/2005/bridges2005-47);
// Demaine et al., Computational Geometry 42 (2009) (arXiv:0705.4085): Bembé =
// x.x.xx.x.x.x, Hebrew leap years 3 6 8 11 14 17 19 = a rotation of E(7,19),
// Euclidean rhythms uniquely maximize the sum of onset distances; Euclid VII.1–2
// (Joyce); ORNL SNS pages; Krumbholz, Patterson & Pressnitzer, JASA 108 (2000)
// (pitch floor ≈ 30 Hz); Milne & Herff, Cognition 203 (2020).
//
// Pure logic (rotation, gaps, Bjorklund's grouping, evenness, spectra, the
// click-train wave, generators, modes, glide phase) is exported in _test and
// runs under node. All DOM/audio work lives inside init().

import { euclidRhythm, mod, gcd } from '../../core/math.js';

/* ================= pure, node-testable logic ================= */

// Rotate a boolean pattern by r pulses (delay: a hit at p moves to (p+r) mod n).
export function rotatePattern(hits, r) {
  const n = hits.length;
  const out = new Array(n).fill(false);
  for (let i = 0; i < n; i++) if (hits[i]) out[mod(i + r, n)] = true;
  return out;
}

export function patternString(hits) {
  return hits.map((h) => (h ? 'x' : '.')).join('');
}

// Indices of onsets, ascending.
export function onsets(hits) {
  const out = [];
  for (let i = 0; i < hits.length; i++) if (hits[i]) out.push(i);
  return out;
}

// Circular gaps between consecutive onsets, in necklace order from the first.
export function gapList(hits) {
  const on = onsets(hits);
  const n = hits.length;
  return on.map((p, i) => (i + 1 < on.length ? on[i + 1] : on[0] + n) - p);
}

// Euclid's ladder of divisions on (a, b): the remainder sequence down to gcd.
export function euclidChain(a, b) {
  const lines = [];
  while (b > 0) {
    const q = Math.floor(a / b), r = a % b;
    lines.push(`${a} = ${q}·${b} + ${r}`);
    [a, b] = [b, r];
  }
  return { lines, gcd: a };
}

// The fingerprint of maximal evenness: at most two gap sizes, one pulse apart.
export function gapProfile(hits) {
  const gaps = gapList(hits);
  const sizes = [...new Set(gaps)].sort((a, b) => a - b);
  const even = sizes.length <= 1 || (sizes.length === 2 && sizes[1] - sizes[0] === 1);
  return { gaps, sizes, even };
}

// Bjorklund's grouping, as Toussaint describes it for (5,13): k groups [1] and
// n−k groups [0]; append one remainder group to each main group, again and again,
// until at most one remainder group is left. Each step replaces the pair of
// counts (A, B) by (min, |A − B|): Euclid's "less subtracted from the greater".
export function bjorklundSteps(k, n) {
  k = Math.max(0, Math.min(k, n));
  let a = '1', b = '0', A = k, B = n - k;
  const snap = (sub) => ({
    groups: [
      ...Array.from({ length: A }, () => ({ bits: a, rem: false })),
      ...Array.from({ length: B }, () => ({ bits: b, rem: true })),
    ],
    A, B, sub,
  });
  const rows = [snap(null)];
  if (A > 0 && B > 0) {
    while (B > 1) {
      const big = Math.max(A, B), small = Math.min(A, B);
      const na = a + b, nb = A > B ? a : b, nB = Math.abs(A - B);
      a = na; b = nb; A = small; B = nB;
      rows.push(snap([big, small, nB]));
      if (B === 0) break;
    }
  }
  return { rows, bits: a.repeat(A) + b.repeat(B), gcd: gcd(k, n) };
}

// Evenness as Demaine et al. (2009) measure it: the sum of the chord lengths
// between all pairs of onsets on a unit circle. Euclidean rhythms maximize it.
export function chordSum(hits) {
  const n = hits.length, on = onsets(hits);
  let s = 0;
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) s += 2 * Math.sin((Math.PI * (on[j] - on[i])) / n);
  }
  return s;
}

// 1 for every Euclidean rhythm (and its rotations), below 1 for any other k in n.
export function evenness(hits) {
  const k = onsets(hits).length, n = hits.length;
  if (k < 2 || k >= n) return 1;
  return chordSum(hits) / chordSum(euclidRhythm(k, n));
}

// |DFT| of the onset set at m = 0 … n−1.
export function spectrum(hits) {
  const n = hits.length, on = onsets(hits);
  return Array.from({ length: n }, (_, m) => {
    let re = 0, im = 0;
    for (const p of on) { const a = (2 * Math.PI * m * p) / n; re += Math.cos(a); im += Math.sin(a); }
    return Math.hypot(re, im);
  });
}

// Fourier series of the necklace as a looped click train, for createPeriodicWave:
// x(t) = Σ real[m] cos(2πmft) + imag[m] sin(2πmft) peaks at every onset p/n.
export function clickWave(hits, H = 2048) {
  const n = hits.length, on = onsets(hits);
  const real = new Float32Array(H + 1), imag = new Float32Array(H + 1);
  for (let m = 1; m <= H; m++) {
    let re = 0, im = 0;
    for (const p of on) { const a = (2 * Math.PI * m * p) / n; re += Math.cos(a); im += Math.sin(a); }
    real[m] = re; imag[m] = im;
  }
  return { real, imag };
}

// A generated set: onsets = {s, s+g, s+2g, …} mod n. Every E(k,n) with
// gcd(k,n) = 1 is one (checked for n ≤ 24); for the diatonic g = 7, the fifth.
export function generatorOf(hits) {
  const n = hits.length, on = onsets(hits), k = on.length;
  if (k < 2 || k >= n) return null;
  const S = new Set(on);
  for (let g = n - 1; g >= 1; g--) {
    if (gcd(g, n) !== 1) continue;
    for (const s of on) {
      let ok = true;
      for (let j = 1; j < k; j++) if (!S.has((s + j * g) % n)) { ok = false; break; }
      if (ok) return { g, s, chain: Array.from({ length: k }, (_, j) => (s + j * g) % n) };
    }
  }
  return null;
}

// Twelve-pulse necklaces read as scales on C (pulse 0 = C).
export const MODES = {
  'x.x.xx.x.x.x': 'Ionian, the major scale',
  'x.xx.x.x.xx.': 'Dorian',
  'xx.x.x.xx.x.': 'Phrygian',
  'x.x.x.xx.x.x': 'Lydian',
  'x.x.xx.x.xx.': 'Mixolydian',
  'x.xx.x.xx.x.': 'Aeolian, the natural minor',
  'xx.x.xx.x.x.': 'Locrian',
  'x.x.x..x.x..': 'the major pentatonic',
  'x..x.x.x..x.': 'the minor pentatonic',
};
export function modeName(hits) { return MODES[patternString(hits)] || null; }

export function lcmAll(ns) { return ns.reduce((a, b) => (a / gcd(a, b)) * b, 1); }

// How many times the necklace repeats itself in one turn: E(4,8) = x.x.x.x. is
// x. four times over, so looped it repeats (and sounds) four times per turn.
// For E(k,n) this is gcd(k,n).
export function loopsPerTurn(hits) {
  const n = hits.length;
  for (let p = 1; p <= n; p++) {
    if (n % p) continue;
    let ok = true;
    for (let i = 0; i < n && ok; i++) if (!!hits[i] !== !!hits[(i + p) % n]) ok = false;
    if (ok) return n / p;
  }
  return 1;
}

// What the ear makes of a loop repeating `rate` times a second. Above about
// 30 Hz a periodic sound has pitch; from about 16 to 64 Hz its quality turns
// from flutter to pitch (Krumbholz, Patterson & Pressnitzer 2000).
export function spinVerdict(rate, clicksPerSecond) {
  if (rate >= 30) return 'pitch';
  if (rate >= 16) return 'flutter';
  return clicksPerSecond < 8 ? 'rhythm' : 'blur';
}

// Exponential glide fa → fb over dur seconds (as exponentialRampToValueAtTime),
// holding fb afterwards: the rate, and the turns elapsed, dt seconds in.
export function glideRate(fa, fb, dur, dt) {
  if (dt <= 0) return fa;
  if (dt >= dur) return fb;
  return fa * Math.pow(fb / fa, dt / dur);
}
export function glidePhase(fa, fb, dur, dt) {
  if (dt <= 0) return 0;
  const r = fb / fa;
  if (Math.abs(r - 1) < 1e-9) return fa * dt;
  const u = Math.min(dt, dur);
  let ph = (fa * dur * (Math.pow(r, u / dur) - 1)) / Math.log(r);
  if (dt > dur) ph += fb * (dt - dur);
  return ph;
}

const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteName(freq) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return FLAT_NAMES[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
}

// Signed shortest turn from rotation a to rotation b on n pulses.
export function shortestShift(a, b, n) {
  let d = mod(b - a, n);
  if (d > n / 2) d -= n;
  return d;
}

// Traditional necklaces. `rot` carries the core floor-formula output ⌊i·n/k⌋
// onto the traditional form in `pattern` (patterns and attributions per
// Toussaint 2005 and Demaine et al. 2009; the calendar per Demaine et al. §2.7).
export const PRESETS = [
  { key: 'tresillo',   k: 3,  n: 8,  rot: 6,  name: 'the tresillo',    origin: 'Cuba; the bass line of “Hound Dog”', pattern: 'x..x..x.' },
  { key: 'cinquillo',  k: 5,  n: 8,  rot: 2,  name: 'the cinquillo',   origin: 'Cuba; the handclaps of “Hound Dog”', pattern: 'x.xx.xx.' },
  { key: 'khafif',     k: 2,  n: 5,  rot: 0,  name: 'khafif-e-ramal',  origin: 'a 13th-century Persian cycle, as Toussaint lists it after Owen Wright', pattern: 'x.x..' },
  { key: 'takefive',   k: 2,  n: 5,  rot: 3,  name: 'the 3 + 2 of “Take Five”', origin: 'Paul Desmond, 1959', pattern: 'x..x.' },
  { key: 'aksak',      k: 4,  n: 9,  rot: 0,  name: 'the aksak',       origin: 'Turkey, 2 + 2 + 2 + 3', pattern: 'x.x.x.x..' },
  { key: 'bell',       k: 7,  n: 12, rot: 2,  name: 'the Mpre bell',   origin: 'the Ashanti of Ghana', pattern: 'x.xx.x.xx.x.' },
  { key: 'venda',      k: 5,  n: 12, rot: 8,  name: 'the Venda clapping pattern', origin: 'a South African children’s song', pattern: 'x..x.x..x.x.' },
  { key: 'bossa',      k: 5,  n: 16, rot: 10, name: 'the bossa-nova',  origin: 'Brazil, started from its third stroke', pattern: 'x..x..x...x..x..' },
  { key: 'samba',      k: 7,  n: 16, rot: 12, name: 'the samba',       origin: 'Brazil, started from its last stroke', pattern: 'x.x..x.x.x..x.x.' },
  { key: 'aka',        k: 13, n: 24, rot: 2,  name: 'an Aka necklace', origin: 'the upper Sangha, Central Africa', pattern: 'x.xx.x.x.x.x.xx.x.x.x.x.' },
  { key: 'hebrew',     k: 7,  n: 19, rot: 16, name: 'the Hebrew leap-month cycle', origin: 'leap years 3, 6, 8, 11, 14, 17 and 19 of 19', pattern: '..x..x.x..x..x..x.x' },
  { key: 'pentatonic', k: 5,  n: 12, rot: 0,  name: 'the pentatonic scale', origin: 'C D E G A, with map to pitch', pattern: 'x.x.x..x.x..' },
];

// Not in the menu: the quest's buried treasure. E(7,12) turned by 11 is the
// major scale {0,2,4,5,7,9,11}, gaps 2 2 1 2 2 2 1, and as a rhythm the bembé.
export const MAJOR_SCALE = {
  key: 'major', k: 7, n: 12, rot: 11,
  name: 'the major scale', origin: 'the white keys as pitches; as a rhythm, the bembé bell',
  pattern: 'x.x.xx.x.x.x',
};

const NAMED = [...PRESETS, MAJOR_SCALE];

// Recognize a pattern: exact traditional form, or a rotation of one.
export function necklaceName(hits) {
  const s = patternString(hits);
  const n = hits.length, k = onsets(hits).length;
  for (const p of NAMED) if (p.n === n && p.pattern === s) return { ...p, exact: true };
  for (const p of NAMED) {
    if (p.n !== n || p.k !== k) continue;
    for (let r = 1; r < n; r++) {
      if (patternString(rotatePattern(hits, r)) === p.pattern) return { ...p, exact: false };
    }
  }
  return null;
}

export const _test = {
  rotatePattern, patternString, onsets, gapList, euclidChain,
  necklaceName, PRESETS, MAJOR_SCALE, euclidRhythm,
  gapProfile, bjorklundSteps, chordSum, evenness, spectrum, clickWave,
  generatorOf, MODES, modeName, lcmAll, glideRate, glidePhase, noteName, shortestShift,
  loopsPerTurn, spinVerdict,
};

/* ================= prose & apparatus ================= */

const PROSE = `
    <p>In 2003 Eric Bjorklund, an engineer at Los Alamos, was writing the rules for the timing
    system of the Spallation Neutron Source, then under construction at Oak Ridge in Tennessee.
    Some of its hardware, high-voltage power supplies among it, had to be enabled in
    <em>k</em> of every <em>n</em> time slots, with the <em>k</em> spread as evenly as whole
    numbers allow. He wrote up his procedure, and a way to measure how even its patterns were,
    in two technical notes. Two years later, at the
    Bridges conference in Banff, the McGill computer scientist Godfried Toussaint showed that it
    held two old acquaintances. Its structure was Euclid’s, the procedure of <em>Elements</em>
    VII in which “the less is continually subtracted in turn from the greater,” twenty-three
    centuries old. And its outputs were rhythms Toussaint knew by heart.</p>
    <p>Spread 3 hits over 8 pulses and you get <code>x··x··x·</code>: the Cuban
    <em>tresillo</em>, the first bar of the son clave, the bass line of Elvis Presley’s “Hound
    Dog,” the “Spanish tinge” without which, Jelly Roll Morton told Alan Lomax in 1938, you could
    never get “the right seasoning” for jazz. Five in eight is the <em>cinquillo</em>, the
    handclaps on the same Presley record. Four in nine is the Turkish <em>aksak</em>, a limping
    2 + 2 + 2 + 3. Seven in twelve is a bell pattern the Ashanti of Ghana play in the
    <em>Mpre</em>; five in sixteen, started from its third stroke, is the bossa-nova; two in
    five, started from its second, is the 3 + 2 of Paul Desmond’s “Take Five.” Toussaint and
    seven co-authors later counted more than forty traditional timelines among these patterns,
    and one subroutine from antiquity generates every one of them, up to where the circle is
    cut.</p>
    <p>We have met this procedure before. In the first movement it was
    <a href="#ex-diagonal"><em>anthyphairesis</em></a>, a rod subtracted from a rod, and on the
    side and diagonal of a square it never stopped. On two whole numbers it must stop, and the
    way it stops is a rhythm. Perfect evenness would put a hit every <code>8/3</code> pulses.
    Whole pulses allow only the two nearest gaps, 3 and 2, and <em>how many of each</em> is
    division with remainder: <code>8 = 2·3 + 2</code>, three gaps, two of them carrying an
    extra pulse. Spreading those two long gaps among the three is the same problem one size
    smaller, <code>3 = 1·2 + 1</code>, then <code>2 = 2·1</code>, and the ladder reaches the
    ground. In code the story collapses to one line: onset <em>i</em> lands on pulse
    <code>⌊i·n/k⌋</code>, a rotation of Bjorklund’s output. Read the other way, pulse <em>p</em>
    carries a hit exactly where the staircase <code>⌊p·k/n⌋</code> steps up, so every Euclidean
    rhythm is a straight line of slope <em>k</em>/<em>n</em> drawn on a grid of whole numbers.
    Its fingerprint is the same in every ring below: at most two sizes of gap, one pulse apart.
    Tap a pulse to break it by hand, and watch the evenness fall.</p>
    <p>A rhythm here is really a <em>necklace</em>: the circle of pulses does not care where we
    start reading, but the groove does. Drag a ring and the hits keep their spacing while their
    relation to the downbeat, the accented pulse at the top of every ring, changes completely;
    cut the tresillo’s necklace one pulse later and you would swear the rhythm was new. Nor must
    the rings agree on <em>n</em>. Under a shared pulse an 8-ring and a 9-ring tick at the same
    rate, their needles slipping apart by a seventy-second of a turn at every pulse until they
    stand on opposite sides of the circle. They come home together only at pulse
    <code>lcm(8,9) = 72</code>.</p>
    <p>Then switch on <em>map to pitch</em>, and the necklace becomes the chromatic circle:
    <em>n</em> pulses become <em>n</em> equal steps of the octave, every hit a note. Set a ring
    to E(7,12) and turn it. At rotation 11 the bell climbs C D E F G A B, the white keys, and
    heard as a rhythm the same string is the bell timeline known on the world scene by its Cuban
    name, <em>bembé</em>: the pairing of rhythm and scale that Jeff Pressing set out in 1983.
    Seven of the twelve rotations put a note on C, and those seven are exactly the seven modes,
    Ionian to Locrian; the Ashanti bell as the menu gives it is the natural minor. E(5,12) is at
    once the pentatonic scale and the Venda clapping pattern of a South African children’s song.
    Music theory’s name for the shared signature is <em>maximal evenness</em>, given by John
    Clough and Jack Douthett in 1991, and we have seen it before: on the
    <a href="#ex-fifths">spiral of fifths</a> the three-gap theorem relaxed to two sizes of step
    at five fifths and again at seven. Those are the pentatonic and the diatonic, each a stack of
    fifths and each a Euclidean rhythm.</p>
    <p>The same necklaces turn up wherever whole things must be shared out evenly. The Hebrew
    calendar adds a thirteenth month in years 3, 6, 8, 11, 14, 17 and 19 of every nineteen:
    seven in nineteen, the necklace E(7,19), as Marcia Ascher pointed out to Toussaint and his
    colleagues. An accelerator’s power supplies, an Ashanti bell, the white keys, a calendar of
    leap months: one arithmetic, run at different speeds.</p>`;

const CHRONICLE = [
  { year: -300, date: 'c. 300 BCE', text: 'Euclid’s <em>Elements</em>, Book VII, finds the greatest common measure of two numbers by a procedure in which “the less is continually subtracted in turn from the greater,” the algorithm that still bears his name.' },
  { year: 1938, date: '1938', text: 'Recording for Alan Lomax at the Library of Congress, Jelly Roll Morton recalls turning the habanera “La Paloma” into New Orleans style, and says that without “tinges of Spanish” in your tunes “you will never be able to get the right seasoning, I call it, for jazz.”' },
  { year: 1983, date: '1983', text: 'Jeff Pressing’s “Cognitive isomorphisms between pitch and rhythm in world musics” pairs rhythms of West Africa and the Balkans with the scales of Western tonality: the seven-stroke bell timeline and the major scale share one sequence of steps, 2 2 1 2 2 2 1.' },
  { year: 1991, date: '1991', text: 'John Clough and Jack Douthett introduce <em>maximally even sets</em> in the <em>Journal of Music Theory</em>: notes spread around the octave as evenly as a whole number of steps allows.' },
  { year: 2003, date: '2003', text: 'At Los Alamos, Eric Bjorklund writes two technical notes on spreading timing pulses as evenly as possible among time slots, for components of the Spallation Neutron Source such as its high-voltage power supplies.' },
  { year: 2005, date: '2005', text: 'At the Bridges conference in Banff, Godfried Toussaint shows that Bjorklund’s procedure has the structure of Euclid’s algorithm, that its outputs include the tresillo, the cinquillo, the aksak and the bossa-nova, and names them Euclidean rhythms.' },
  { year: 2009, date: '2009', text: 'Erik Demaine, Godfried Toussaint and six co-authors prove that Euclidean rhythms are, up to rotation, the only rhythms that maximize the sum of the straight-line distances between all pairs of their onsets on a circle, and count more than forty traditional timelines among them.' },
  { year: 2020, date: '2020', text: 'Andrew Milne and Steffen Herff play 1,252 rhythms to 177 listeners and find that evenness, balance and the unpredictability of a rhythm’s durations each shape what people remember and what they like.' },
];

const TODAY = `
    <p>The accelerator Eric Bjorklund was timing has run at Oak Ridge since its first beam in
    2006, sixty proton pulses a second into a steel vessel holding twenty tons of liquid
    mercury, and in 2024 its Proton Power Upgrade doubled the linear accelerator’s power
    capability from 1.4 to 2.8 megawatts. The problem is everywhere computers meet whole
    numbers: in 2004 Mitchell Harris and Edward Reingold traced Jack Bresenham’s 1965 method for
    stepping a digital plotter along a slanted line, still the classic way to draw one in
    pixels, and the leap-year rules of calendars to one pattern governed by integer division
    and Euclid’s algorithm.</p>
    <p>Musicians now call the algorithm by name. In the live-coding language TidalCycles,
    <code>bd(3,8)</code> plays a tresillo on the bass drum and a third number turns the
    necklace; hardware sequencers such as Torso Electronics’ T-1 build Euclidean rhythms in.
    Physics met the same sets in magnets: in 1996 Jack Douthett and Richard Krantz
    showed that in a one-dimensional antiferromagnetic Ising chain the maximally even
    arrangements of up and down spins have the lowest energy.</p>
    <p>The subtraction also runs inside Movement IV. Dividing by a number modulo a prime means
    multiplying by its inverse, and the extended form of Euclid’s algorithm is the classic way
    to find one; on the curve of <a href="#ex-handshake">the handshake</a> every chord’s slope
    is such a division. And the last, classical step of
    <a href="#ex-shor">Shor’s period finding</a> expands a measured fraction as a continued
    fraction, which is Euclid’s ladder once more.</p>`;

const SOURCES = [
  { text: 'Godfried Toussaint, “The Euclidean Algorithm Generates Traditional Musical Rhythms,” in <em>Renaissance Banff: Mathematics, Music, Art, Culture</em> (Bridges, 2005), 47–56', url: 'https://archive.bridgesmathart.org/2005/bridges2005-47.html' },
  { text: 'Erik D. Demaine, Francisco Gomez-Martin, Henk Meijer, David Rappaport, Perouz Taslakian, Godfried T. Toussaint, Terry Winograd and David R. Wood, “The Distance Geometry of Music,” <em>Computational Geometry</em> 42(5) (2009): 429–454', url: 'https://arxiv.org/abs/0705.4085' },
  { text: 'Euclid, <em>Elements</em>, Book VII, Propositions 1–2, in D. E. Joyce’s English text after Heath (Clark University)', url: 'https://mathcs.clarku.edu/~djoyce/java/elements/bookVII/propVII1.html' },
  { text: 'John Clough and Jack Douthett, “Maximally Even Sets,” <em>Journal of Music Theory</em> 35(1/2) (1991): 93–173', url: 'https://www.jstor.org/stable/843811' },
  { text: 'Mitchell A. Harris and Edward M. Reingold, “Line Drawing, Leap Years, and Euclid,” <em>ACM Computing Surveys</em> 36(1) (2004): 68–80', url: 'https://doi.org/10.1145/1013208.1013211' },
  { text: 'Jack Douthett and Richard Krantz, “Energy Extremes and Spin Configurations for the One-Dimensional Antiferromagnetic Ising Model with Arbitrary-Range Interaction,” <em>Journal of Mathematical Physics</em> 37(7) (1996): 3334–3353', url: 'https://doi.org/10.1063/1.531568' },
  { text: 'Andrew J. Milne and Steffen A. Herff, “The Perceptual Relevance of Balance, Evenness, and Entropy in Musical Rhythms,” <em>Cognition</em> 203 (2020): 104233', url: 'https://doi.org/10.1016/j.cognition.2020.104233' },
  { text: 'Katrin Krumbholz, Roy D. Patterson and Daniel Pressnitzer, “The Lower Limit of Pitch as Determined by Rate Discrimination,” <em>Journal of the Acoustical Society of America</em> 108(3) (2000): 1170–1180', url: 'https://doi.org/10.1121/1.1287843' },
  { text: 'Oak Ridge National Laboratory, “How SNS Works”: sixty pulses a second into a target vessel holding twenty tons of liquid mercury', url: 'https://neutrons.ornl.gov/content/how-sns-works' },
  { text: 'Oak Ridge National Laboratory, “SNS History Highlights”: first beams on target, 28 April 2006, and the Proton Power Upgrade of 2024', url: 'https://neutrons.ornl.gov/snstimeline' },
];

const ALT = 'Four concentric rings of pulses, each a rhythm drawn as a necklace with its hits joined into an inscribed polygon and its gaps numbered, under a downbeat marker at the top; beside or below them, a worked panel shows Bjorklund’s grouping row by row next to Euclid’s subtractions, the rhythm in box notation with its gaps, an evenness gauge and, with pitch mapped, the notes, the mode and the stack of fifths.';

/* ================= the exhibit ================= */

const NOTE_NAMES = FLAT_NAMES;
const VOICES = ['kick', 'rim', 'wood', 'hat'];
const VOICE_LEVEL = { kick: 0.75, hat: 0.3, rim: 0.5, wood: 0.5 };
const PANS = [-0.35, 0.35, -0.12, 0.12];
const C4 = 261.63;
const SLOTS = [0.4, 0.6, 0.8, 1.0];
const N_MAX = 24;
// "the same circle, faster": loop rate glides from a groove to a tone
const F_LOW = 1.5, F_HIGH = 220, D_GLIDE = 8, SPIN_LEVEL = 0.3;

export default {
  id: 'euclid',
  movement: 2,
  title: 'The Geometry of Groove',
  hook: 'Euclid wrote a drum machine.',
  era: 'c. 300 BCE – today · Alexandria, Los Alamos, Oak Ridge, Banff',
  prose: PROSE,
  chronicle: CHRONICLE,
  today: TODAY,
  sources: SOURCES,
  alt: ALT,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const TAU = math.TAU;
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep */ }
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const fs = (px, style = '') => `${style ? style + ' ' : ''}${px}px ${SERIF}`;
    const fmn = (px) => `${px}px ${MONO}`;
    const rgbCache = new Map();
    const rgba = (hex, a) => {
      let c = rgbCache.get(hex);
      if (!c) { c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(','); rgbCache.set(hex, c); }
      return `rgba(${c},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
    };
    const easeOut = (u) => 1 - Math.pow(1 - u, 3);
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    /* ---------- scoped styling ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-euclid canvas { touch-action: pan-y; }
      #ex-euclid .eu-plate { container-type: inline-size; }
      #ex-euclid .eu-canvas { position: relative; height: 548px; }
      @container (max-width: 639.98px) { #ex-euclid .eu-canvas { height: calc(100cqw + 462px); } }
      #ex-euclid .eu-rings { display: grid; gap: 3px; margin: 0.9rem 0 0.7rem; }
      #ex-euclid .eu-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.3rem; margin: 0;
        padding: 0.4rem 0.75rem; border-left: 2px solid transparent; border-radius: 2px;
        transition: background-color .25s ease, border-color .25s ease, opacity .25s ease; }
      #ex-euclid .eu-row.focus { border-left-color: var(--eu-col); background: rgba(255,255,255,0.028); }
      #ex-euclid .eu-row.off { opacity: 0.58; }
      #ex-euclid .eu-row .ctl { flex-direction: row; align-items: center; gap: 0.5rem; min-width: 0; }
      #ex-euclid .eu-row .ctl-label { font-style: italic; font-variant: normal; letter-spacing: 0.02em; font-size: 0.86rem; min-width: 0.9rem; text-align: right; }
      #ex-euclid .eu-row button.toggle-pill { min-width: 5.4rem; }
      #ex-euclid .eu-row select.sel { padding: 0.2rem 0.45rem; font-size: 0.85rem; }
      #ex-euclid .eu-swatch { width: 0.62rem; height: 0.62rem; border-radius: 50%; flex: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.3), 0 0 10px var(--eu-col); }
      #ex-euclid .eu-euclid { display: none; }
      #ex-euclid .eu-row.custom .eu-euclid { display: inline-flex; }
      #ex-euclid .eu-preset .ctl { min-width: min(100%, 22rem); }
      #ex-euclid .eu-preset select.sel { width: 100%; }
      #ex-euclid .eu-break { display: none; }
      @media (max-width: 560px) {
        #ex-euclid .eu-row { gap: 0.5rem 0.6rem; padding: 0.5rem 0.45rem; }
        #ex-euclid .eu-row > * { order: 3; }
        #ex-euclid .eu-row > .eu-swatch, #ex-euclid .eu-row > button.toggle-pill { order: 0; }
        #ex-euclid .eu-row > .eu-voice, #ex-euclid .eu-row > .eu-euclid { order: 1; }
        #ex-euclid .eu-row > .eu-break { display: block; order: 2; flex-basis: 100%; height: 0; }
        #ex-euclid .eu-row .ctl { gap: 0.35rem; }
        #ex-euclid .eu-row .ctl-label { min-width: 0.6rem; }
        #ex-euclid .eu-row .stepper { gap: 0.22rem; }
        #ex-euclid .eu-row .stepper button { width: 1.4rem; height: 1.4rem; }
        #ex-euclid .eu-row .stepper .stepper-val { min-width: 1.35rem; font-size: 0.9rem; }
        #ex-euclid .eu-row button.toggle-pill { min-width: 0; margin-right: auto; }
        #ex-euclid .eu-row .eu-voice .ctl-label { display: none; }
      }`;
    stage.appendChild(style);

    /* ---------- state ---------- */
    const RING_COLORS = [P.gold, P.azure, P.crimson, P.verdant];
    const RING_TEXT = [P.goldBright, P.azure, P.crimsonBright, P.verdant];
    const rings = [
      { on: true,  k: 3, n: 8,  rot: 6, voice: 'kick' },  // tresillo
      { on: true,  k: 5, n: 8,  rot: 2, voice: 'rim'  },  // cinquillo
      { on: false, k: 4, n: 9,  rot: 0, voice: 'wood' },  // aksak, ready to join
      { on: false, k: 7, n: 12, rot: 2, voice: 'hat'  },  // Mpre bell, ready to join
    ];
    let bpm = 100;
    let shared = false;          // false: one bar per sweep · true: shared pulse (polymeter)
    let pitchMode = false;
    let playing = false;
    let focus = 0;
    let questDone = false;
    let dirty = true;

    let scheduler = null;
    let rts = [];                // per-ring runtime: { ri, p, next, lastT }
    let anchor = null;           // bar top (bar mode) / pulse-grid origin (pulse mode)
    let queue = [];              // scheduled pulse events -> consumed by draw at audio time
    let threads = [];            // coincident hits: { t, pts: [[ri, p], …] }
    let lastEventT = -1;
    let spin = null;             // the same circle, faster

    const bus = audio.createBus('euclid');
    // The canvas's height follows its width (a square clock on phones), so it lives in a
    // box sized by container-query units: the observed box never resizes because of the
    // canvas inside it, and no ResizeObserver loop can form.
    const plate = document.createElement('div');
    plate.className = 'eu-plate';
    const box = document.createElement('div');
    box.className = 'eu-canvas';
    plate.appendChild(box);
    stage.appendChild(plate);
    const handle = cv.setupCanvas(box, {});
    handle.canvas.setAttribute('role', 'img');
    const sprites = RING_COLORS.map((c) => cv.glowSprite(c, 30));
    const accentSprite = cv.glowSprite(P.goldBright, 48);
    const threadSprite = cv.glowSprite(P.goldBright, 22);
    const cache = document.createElement('canvas');
    const cctx = cache.getContext('2d');
    let L = null;

    const barDur = () => 240 / bpm;            // 4 beats per sweep
    const pulseDur = (rg) => (shared ? 30 / bpm : barDur() / rg.n);
    const nowT = () => { const c = audio.getContext(); return c ? c.currentTime : 0; };

    for (const rg of rings) recomputeHits(rg);

    function recomputeHits(rg) {
      rg.custom = false;
      rg.hits = rotatePattern(euclidRhythm(rg.k, rg.n), rg.rot);
      rg.flash = new Array(rg.n).fill(-1e9);
      rg.vis = null;
    }

    /* ---------- layout ---------- */
    function computeLayout(W, H) {
      if (W >= 640) {
        const LW = Math.round(Math.min(420, Math.max(292, W * 0.38)));
        const CW = W - LW;
        const Rmax = Math.max(24, Math.min(CW, H) / 2 - 46);
        return { wide: true, cx: CW / 2 + 8, cy: H / 2 + 6, Rmax, led: { x: CW + 10, y: 26, w: LW - 40, h: H - 48 } };
      }
      const side = Math.max(120, W);
      const Rmax = Math.max(24, side / 2 - 32);
      return { wide: false, cx: W / 2, cy: side / 2 + 8, Rmax, led: { x: 14, y: side + 14, w: W - 28, h: H - side - 24 } };
    }
    function sizeCache() {
      const { width: W, height: H, dpr } = handle;
      cache.width = Math.max(1, Math.round(W * dpr));
      cache.height = Math.max(1, Math.round(H * dpr));
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      L = computeLayout(W, H);
      dirty = true;
    }
    sizeCache();
    handle.onResize(sizeCache);
    const ringR = (i) => Math.max(4, SLOTS[i] * L.Rmax);
    const angleOf = (p, n) => (p / n) * TAU - Math.PI / 2;

    /* ---------- controls ---------- */
    const controls = ui.controlRow(stage);
    const playBtn = ui.button(controls, '▶ play', togglePlay, { primary: true });
    ui.slider(controls, {
      label: 'tempo', min: 54, max: 190, step: 1, value: bpm,
      format: (v) => `${v} bpm`,
      onInput: setBpm,
    });
    ui.toggle(controls, {
      label: 'shared pulse', value: shared,
      onChange: (v) => { shared = v; if (playing) { stopPlay(); startPlay(); } refresh(); },
    });
    ui.toggle(controls, {
      label: 'map to pitch', value: pitchMode,
      onChange: (v) => { pitchMode = v; refresh(); },
    });
    const spinBtn = ui.button(controls, '↻ spin into a tone', toggleSpin, { small: true });

    const presetRow = ui.controlRow(stage);
    presetRow.classList.add('eu-preset');
    const presetSel = ui.select(presetRow, {
      label: 'load a necklace into ring 1',
      options: [{ value: '', label: 'choose a tradition…' }].concat(
        PRESETS.map((p) => ({ value: p.key, label: `${p.name} · E(${p.k},${p.n}) — ${p.origin}` }))),
      value: '',
      onChange: (v) => { if (v) { applyPreset(v); presetSel.set(''); } },
    });

    const ringsBox = document.createElement('div');
    ringsBox.className = 'eu-rings';
    stage.appendChild(ringsBox);
    const labelSteppers = (st, what) => {
      const bs = st.el.querySelectorAll('button');
      if (bs[0]) bs[0].setAttribute('aria-label', `${what[0]}`);
      if (bs[1]) bs[1].setAttribute('aria-label', `${what[1]}`);
    };
    rings.forEach((rg, i) => {
      const row = ui.controlRow(ringsBox);
      row.classList.add('eu-row');
      row.style.setProperty('--eu-col', RING_COLORS[i]);
      const sw = document.createElement('span');
      sw.className = 'eu-swatch';
      sw.style.background = RING_COLORS[i];
      row.appendChild(sw);
      rg.ui = { row };
      rg.ui.on = ui.toggle(row, { label: `ring ${i + 1}`, value: rg.on, onChange: (v) => setRingOn(i, v) });
      const brk = document.createElement('span');
      brk.className = 'eu-break';
      brk.setAttribute('aria-hidden', 'true');
      row.appendChild(brk);
      rg.ui.k = ui.stepper(row, {
        label: 'k', min: 1, max: N_MAX, value: rg.k,
        onChange: (v) => { rg.k = Math.min(v, rg.n); if (rg.k !== v) rg.ui.k.set(rg.k); edited(i, false); },
      });
      labelSteppers(rg.ui.k, [`ring ${i + 1}: one hit fewer`, `ring ${i + 1}: one hit more`]);
      rg.ui.n = ui.stepper(row, {
        label: 'n', min: 2, max: N_MAX, value: rg.n,
        onChange: (v) => {
          rg.n = v;
          if (rg.k > v) { rg.k = v; rg.ui.k.set(v); }
          rg.rot = mod(rg.rot, v); rg.ui.rot.set(rg.rot);
          edited(i, true);
        },
      });
      labelSteppers(rg.ui.n, [`ring ${i + 1}: one pulse fewer`, `ring ${i + 1}: one pulse more`]);
      rg.ui.rot = ui.stepper(row, {
        label: 'turn', min: -1, max: N_MAX, value: rg.rot,
        onChange: (v) => { const d = shortestShift(rg.rot, mod(v, rg.n), rg.n); rg.ui.rot.set(rg.rot); rotateBy(i, d); },
      });
      labelSteppers(rg.ui.rot, [`ring ${i + 1}: turn back one pulse`, `ring ${i + 1}: turn on one pulse`]);
      rg.ui.voice = ui.select(row, {
        label: 'voice', options: VOICES, value: rg.voice,
        onChange: (v) => { rg.voice = v; focusRing(i); },
      });
      rg.ui.voice.el.classList.add('eu-voice');
      rg.ui.reset = ui.button(row, '↺ Euclid', () => restoreEuclid(i), { small: true });
      rg.ui.reset.classList.add('eu-euclid');
      rg.ui.reset.setAttribute('aria-label', `ring ${i + 1}: restore the Euclidean rhythm`);
      row.addEventListener('pointerdown', () => { if (focus !== i) focusRing(i); });
      row.addEventListener('focusin', () => { if (focus !== i) focusRing(i); });
    });

    const info = ui.readout(stage, '');
    info.el.setAttribute('aria-live', 'polite');
    const quest = ui.questBanner(stage,
      'Set a ring to E(7,12), the Ashanti bell, switch on <em>map to pitch</em>, and turn it until the bell climbs do–re–mi.');
    ui.caption(stage,
      'Each ring is a necklace of <em>n</em> pulses read clockwise from the downbeat at the top; its <em>k</em> hits are ' +
      'joined into an inscribed polygon, solid across the long gaps and dashed across the short. The Euclidean polygon is ' +
      'the most spread-out the pulses allow: E(3,8)’s triangle, whose sides sweep 3, 3 and 2 pulses, encloses more area ' +
      'than any other triangle on eight points. Drag a ring to turn it, or tap a pulse to add or remove a hit by hand. ' +
      'The working panel runs Bjorklund’s grouping row by row beside the subtraction of Euclid that each row repeats. ' +
      'With one bar per sweep a single hand turns, and hits that coincide share its radius; with a shared pulse each ring ' +
      'keeps its own needle, and a gold thread joins any hits that sound together. With <em>map to pitch</em>, pulse ' +
      '<em>p</em> of an <em>n</em>-ring sounds at 261.63 · 2<sup><em>p</em>/<em>n</em></sup> Hz.');
    ui.legendPanel(stage,
      `<p>Dave Brubeck liked to tell where <em>Blue Rondo à la Turk</em> came from. On the State Department tour of 1958 he heard street
      musicians in Turkey playing in nine, grouped 2 + 2 + 2 + 3, and asked about it; one of them told him that this rhythm
      was to them what the blues was to Americans. Brubeck built the piece on that grouping, the E(4,9) waiting on
      ring three, and it opened <em>Time Out</em> in 1959, the album that also carried Paul Desmond’s
      “Take Five,” whose 3 + 2 is a rotation of E(2,5).</p>`);
    ui.speculationPanel(stage,
      `<p>Press <em>spin into a tone</em> and the focused necklace speeds up, over eight seconds, from a groove to 220
      turns a second. Somewhere near thirty repetitions a second the loop stops sounding like a pattern and starts
      sounding like a note. Katrin Krumbholz, Roy Patterson and Daniel Pressnitzer mapped that border in 2000: as the
      repetition rate of a low harmonic sound rose from 16 to 64 a second, its quality changed from flutter to pitch,
      and they put the lower limit of pitch at about 30 Hz. Past it the rhythm survives only as <em>timbre</em>, and
      the arithmetic predicts which: each partial is as strong as the necklace’s Fourier magnitude, the bars in the
      working panel and the circles of the previous exhibit. Turned back one pulse, the cinquillo fills exactly the
      pulses the tresillo leaves empty, so their bars are identical and the two differ only at the pulse rate and its
      multiples; spun fast, they are nearly the same tone. Turning a necklace only delays the loop, which shifts the phase of
      every partial in step, so once it is spun the rotation that transformed the groove leaves no trace in the tone.
      Perhaps groove and pitch are one phenomenon heard at two speeds. Karlheinz Stockhausen staged the crossing at
      the centre of <em>Kontakte</em> (1958–60), where a bright pitch sinks until it can no longer be heard as a pitch
      and comes apart into pulses that slow to a steady beat.</p>`,
      'the same circle, faster');

    /* ---------- transport & scheduling ---------- */
    function togglePlay() {
      audio.ensureAudio();
      if (playing) stopPlay(); else startPlay();
    }

    function startPlay() {
      audio.ensureAudio();
      if (spin) stopSpin();
      playing = true;
      playBtn.textContent = '■ stop';
      playBtn.classList.add('active');
      anchor = null;
      queue = [];
      threads = [];
      rts = rings.map((rg, i) => ({ ri: i, p: 0, next: null, lastT: -1 }));
      scheduler = audio.createScheduler(tick, { lookahead: 0.15 });
      scheduler.start(0.1);
      refresh();
    }

    function stopPlay() {
      playing = false;
      playBtn.textContent = '▶ play';
      playBtn.classList.remove('active');
      if (scheduler) { scheduler.stop(); scheduler = null; }
      queue = [];
      threads = [];
      anchor = null;
      rts = [];
      for (const rg of rings) { rg.vis = null; }
      refresh();
    }

    function tick(t) {
      if (anchor === null) {
        anchor = t;
        for (const rt of rts) if (rings[rt.ri].on) rt.next = t;
      }
      let tmin = Infinity;
      for (const rt of rts) {
        if (rt.next == null) continue;
        while (rt.next <= t + 1e-4) firePulse(rt);
        if (rt.next < tmin) tmin = rt.next;
      }
      return tmin === Infinity ? t + 0.05 : tmin;   // short heartbeat while all rings are off
    }

    function firePulse(rt) {
      const rg = rings[rt.ri];
      const t = rt.next;
      const pos = rt.p % rg.n;
      const d = pulseDur(rg);
      const hit = !!rg.hits[pos];
      if (hit) sound(rg, rt.ri, pos, t);
      // bar-mode anchor: track bar tops of the first enabled ring
      if (!shared && pos === 0 && rt.ri === rings.findIndex((r) => r.on)) anchor = t;
      queue.push({ ri: rt.ri, p: pos, t, d, hit });
      if (queue.length > 600) queue.splice(0, 300);
      rt.lastT = t;
      rt.p = (pos + 1) % rg.n;
      rt.next = t + d;
    }

    function sound(rg, ri, pos, t) {
      const accent = pos === 0;
      if (pitchMode) {
        audio.playTone(bus, {
          freq: C4 * Math.pow(2, pos / rg.n),
          dur: 0.22, type: 'triangle',
          level: accent ? 0.4 : 0.3,
          attack: 0.005, release: 0.1, when: t, pan: PANS[ri],
        });
      } else {
        const lv = Math.min(VOICE_LEVEL[rg.voice] * (accent ? 1.25 : 1), 0.9);
        audio.drums[rg.voice](bus, t, { level: lv });
      }
    }

    // A ring switched on mid-flight joins at the next bar top (bar mode) or the
    // next shared pulse (pulse mode), never mid-gap.
    function joinRing(i) {
      if (!playing || !rts[i]) return;
      const now = nowT();
      const rt = rts[i];
      rt.p = 0;
      if (anchor == null) { rt.next = now + 0.1; return; }
      const period = shared ? 30 / bpm : barDur();
      const m = Math.max(0, Math.ceil((now + 0.06 - anchor) / period));
      rt.next = anchor + m * period;
    }

    // After n changes in bar mode, put the ring back on the bar grid (its pulses
    // shrank or grew), starting after anything already committed to the audio clock.
    function rephase(i) {
      if (!playing || shared || !rts[i] || rts[i].next == null || anchor == null) return;
      const rt = rts[i], rg = rings[i];
      const pd = barDur() / rg.n;
      const t0 = Math.max(nowT() + 0.03, rt.lastT + 0.02);
      const m = Math.ceil((t0 - anchor) / pd - 1e-9);
      rt.next = anchor + m * pd;
      rt.p = mod(m, rg.n);
    }

    // Tempo changes rescale every uncommitted event time around the commitment
    // horizon (the scheduler's next tick), so nothing lands before a hit already
    // scheduled, and ring alignment is preserved exactly.
    function setBpm(v) {
      if (playing && scheduler) {
        const live = rts.filter((rt) => rt.next != null).map((rt) => rt.next);
        const pivot = live.length ? Math.min(...live) : nowT();
        const rho = bpm / v;
        for (const rt of rts) if (rt.next != null) rt.next = pivot + (rt.next - pivot) * rho;
        if (anchor != null) anchor = pivot + (anchor - pivot) * rho;
        bpm = v;
        scheduler.stop();
        scheduler.start(0.02);
      } else {
        bpm = v;
      }
      updateReadout();
    }

    /* ---------- the same circle, faster ---------- */
    function makeWave(hits) {
      const { real, imag } = clickWave(hits, 2048);
      return bus.context.createPeriodicWave(real, imag);
    }
    function spinTurnsAt(t) { const s = spin.seg; return s.ph0 + glidePhase(s.fa, s.fb, s.dur, t - s.t0); }
    function spinRateAt(t) { const s = spin.seg; return glideRate(s.fa, s.fb, s.dur, t - s.t0); }
    function updateSpinBtn() {
      spinBtn.textContent = spin && spin.dir === 'up' ? '↺ slow back to a groove' : '↻ spin into a tone';
      spinBtn.classList.toggle('active', !!spin);
    }
    function toggleSpin() {
      audio.ensureAudio();
      const c = bus.context;
      if (!c) return;
      if (playing) stopPlay();
      const now = c.currentTime;
      if (!spin) {
        if (!rings[focus].on) {                 // spin a ring that can be seen
          const j = rings.findIndex((r) => r.on);
          if (j >= 0) focusRing(j); else setRingOn(focus, true);
        }
        const osc = c.createOscillator();
        const lp = c.createBiquadFilter();
        const g = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.4;
        g.gain.value = 0;
        osc.frequency.value = F_LOW;          // set while still silent
        osc.setPeriodicWave(makeWave(rings[focus].hits));
        osc.connect(lp); lp.connect(g); g.connect(bus.input);
        osc.start(now);
        audio.rampTo(g.gain, SPIN_LEVEL, 0.05);
        audio.glideFreq(osc.frequency, F_HIGH, D_GLIDE);
        spin = { dir: 'up', ring: focus, osc, lp, g, lastPh: null, seg: { t0: now, fa: F_LOW, fb: F_HIGH, dur: D_GLIDE, ph0: 0 } };
      } else {
        const ph = spinTurnsAt(now), fr = spinRateAt(now);
        const up = spin.dir !== 'up';
        const target = up ? F_HIGH : F_LOW;
        const dur = Math.max(0.4, D_GLIDE * Math.abs(Math.log(target / fr)) / Math.log(F_HIGH / F_LOW));
        spin.dir = up ? 'up' : 'down';
        spin.seg = { t0: now, fa: fr, fb: target, dur, ph0: ph };
        audio.glideFreq(spin.osc.frequency, target, dur);
      }
      updateSpinBtn();
      dirty = true;
    }
    function stopSpin() {
      if (!spin) return;
      const s = spin;
      spin = null;
      const c = bus.context;
      try {
        audio.rampTo(s.g.gain, 0, 0.03);
        s.osc.stop((c ? c.currentTime : 0) + 0.25);
        s.osc.onended = () => { try { s.osc.disconnect(); s.lp.disconnect(); s.g.disconnect(); } catch { /* gone */ } };
      } catch { /* already stopped */ }
      updateSpinBtn();
      dirty = true;
    }
    function updateSpinWave() {
      if (!spin) return;
      spin.ring = focus;
      try { spin.osc.setPeriodicWave(makeWave(rings[focus].hits)); } catch { /* context gone */ }
    }

    /* ---------- edits, presets, quest ---------- */
    function edited(i, nChanged) {
      const rg = rings[i];
      recomputeHits(rg);
      rg.tw = null;
      if (nChanged) rephase(i);
      focusRing(i);
    }

    function startTween(rg, d) {
      if (RM || !d) { rg.tw = null; return; }
      rg.tw = { off0: tweenOff(rg) - d, t0: performance.now() };
    }
    function tweenOff(rg) {
      if (!rg.tw) return 0;
      const u = (performance.now() - rg.tw.t0) / 240;
      if (u >= 1) { rg.tw = null; return 0; }
      return rg.tw.off0 * (1 - easeOut(u));
    }

    function rotateBy(i, d) {
      const rg = rings[i];
      if (!d) { focusRing(i); return; }
      rg.rot = mod(rg.rot + d, rg.n);
      rg.ui.rot.set(rg.rot);
      if (rg.custom) rg.hits = rotatePattern(rg.hits, d);
      else rg.hits = rotatePattern(euclidRhythm(rg.k, rg.n), rg.rot);
      rg.flash.fill(-1e9);
      startTween(rg, d);
      focusRing(i);
    }

    function toggleHit(i, p) {
      const rg = rings[i];
      const count = onsets(rg.hits).length;
      if (rg.hits[p] && count <= 1) return;               // keep at least one hit
      rg.hits = rg.hits.slice();
      rg.hits[p] = !rg.hits[p];
      rg.custom = true;
      rg.k = onsets(rg.hits).length;
      rg.ui.k.set(rg.k);
      focusRing(i);
    }

    function restoreEuclid(i) {
      const rg = rings[i];
      recomputeHits(rg);
      focusRing(i);
    }

    function setRingOn(i, v) {
      const rg = rings[i];
      rg.on = v;
      rg.ui.on.set(v);
      if (playing) {
        if (v) joinRing(i);
        else if (rts[i]) { rts[i].next = null; queue = queue.filter((e) => e.ri !== i); }
      }
      if (!v) {
        rg.vis = null; rg.flash.fill(-1e9);
        // silencing the focused ring hands the focus (and any spin) to a ring still sounding
        const j = rings.findIndex((r) => r.on);
        if (focus === i && j >= 0) { focusRing(j); return; }
        if (j < 0 && spin) stopSpin();
      }
      focusRing(i);
    }

    function focusRing(i) {
      focus = i;
      rings.forEach((rg, j) => {
        rg.ui.row.classList.toggle('focus', j === focus);
        rg.ui.row.classList.toggle('off', !rg.on);
        rg.ui.row.classList.toggle('custom', !!rg.custom);
      });
      refresh();
    }

    function applyPreset(key) {
      const p = PRESETS.find((q) => q.key === key);
      if (!p) return;
      const rg = rings[0];
      const nChanged = rg.n !== p.n;
      rg.k = p.k; rg.n = p.n; rg.rot = p.rot;
      rg.ui.k.set(p.k); rg.ui.n.set(p.n); rg.ui.rot.set(p.rot);
      recomputeHits(rg);
      rg.tw = null;
      if (!rg.on) { rg.on = true; rg.ui.on.set(true); if (playing) joinRing(0); }
      else if (nChanged) rephase(0);
      focusRing(0);
    }

    function checkQuest() {
      if (questDone || !pitchMode) return;
      const hit = rings.find((rg) =>
        rg.on && rg.n === 12 && patternString(rg.hits) === MAJOR_SCALE.pattern);
      if (hit) {
        questDone = true;
        quest.done(`${hit.custom ? 'Set by hand, it is E(7,12) at rotation 11' : 'Rotation 11'}: the bell sings C D E F G A B, the major scale, and heard as a rhythm the same string is ` +
          'the bembé. Keep turning: the six other rotations that keep a note on C are the six other modes, and the Mpre ' +
          'bell itself, rotation 2, is the natural minor.');
      }
    }

    function refresh() {
      checkQuest();
      updateReadout();
      updateSpinWave();
      dirty = true;
    }

    function describe(rg) {
      const prof = gapProfile(rg.hits);
      const verdict = prof.sizes.length <= 1 ? 'one gap size: perfectly even'
        : prof.even ? 'two gap sizes a pulse apart: maximally even' : `${prof.sizes.length} gap sizes: not maximally even`;
      return { prof, verdict };
    }

    function updateReadout() {
      const rg = rings[focus];
      const { prof, verdict } = describe(rg);
      const short = prof.sizes.length <= 1 ? 'perfectly even' : prof.even ? 'maximally even' : 'not maximally even';
      const nm = necklaceName(rg.hits);
      const named = nm ? ` · ${nm.exact ? nm.name : 'a rotation of ' + nm.name}` : '';
      const head = rg.custom ? `${onsets(rg.hits).length} in ${rg.n}, set by hand` : `E(${rg.k},${rg.n}) turned ${rg.rot}`;
      const pat = patternString(rg.hits).replace(/\./g, '·');
      const chain = euclidChain(rg.n, onsets(rg.hits).length);
      const lines = [
        `ring ${focus + 1} · ${head} → ${pat} · gaps ${prof.gaps.join('+')}, ${short}${named}`,
        `Euclid’s ladder on (${rg.n},${onsets(rg.hits).length}): ${chain.lines.join('  →  ')}  ⇒  gcd ${chain.gcd}`,
      ];
      const onRings = rings.filter((r) => r.on);
      if (onRings.length > 1) {
        const ns = onRings.map((r) => r.n);
        const same = ns.every((v) => v === ns[0]);
        lines.push(shared
          ? (same ? `shared pulse: every ring has ${ns[0]} pulses, so the rings stay in step`
            : `shared pulse: the rings realign every lcm(${ns.join(',')}) = ${lcmAll(ns)} pulses`)
          : (same ? `one bar per sweep: every ring has ${ns[0]} pulses; coincident hits share the hand’s radius`
            : `one bar per sweep: a ${ns.join(' : ')} cross-rhythm; coincident hits share the hand’s radius`));
      }
      if (pitchMode) {
        const notes = onsets(rg.hits).map((p) => (rg.n === 12 ? NOTE_NAMES[p] : `${p}/${rg.n}`)).join(' ');
        const mode = rg.n === 12 ? modeName(rg.hits) : null;
        lines.push(`as pitches: ${notes}${mode ? ' · ' + mode : ''}`);
      }
      info.setHTML(lines.map(esc).join('<br>'));
      handle.canvas.setAttribute('aria-label',
        `Rhythm rings. Ring ${focus + 1}: ${onsets(rg.hits).length} hits in ${rg.n} pulses, rotation ${rg.rot}, ` +
        `pattern ${patternString(rg.hits)}, gaps ${prof.gaps.join(', ')}; ${verdict}.`);
    }
    function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    /* ---------- canvas interaction: drag to turn, tap to edit ---------- */
    const cvs = handle.canvas;
    let drag = null;
    function ringAt(x, y) {
      if (!L) return null;
      const dx = x - L.cx, dy = y - L.cy, d = Math.hypot(dx, dy);
      const tol = Math.max(9, 0.095 * L.Rmax);
      let best = null, bd = Infinity;
      for (let i = 0; i < 4; i++) {
        const e = Math.abs(d - ringR(i));
        if (e < tol && e < bd) { bd = e; best = i; }
      }
      if (best == null) return null;
      return { i: best, a: mod(Math.atan2(dy, dx) + Math.PI / 2, TAU) };
    }
    function onDown(e) {
      const [x, y] = cv.pointerPos(handle, e);
      const h = ringAt(x, y);
      if (!h) return;
      drag = { id: e.pointerId, i: h.i, a0: h.a, last: h.a, acc: 0, applied: 0, moved: false, x, y };
      try { cvs.setPointerCapture(e.pointerId); } catch { /* ok */ }
    }
    function onMove(e) {
      const [x, y] = cv.pointerPos(handle, e);
      if (!drag) { cvs.style.cursor = ringAt(x, y) ? 'grab' : ''; return; }
      if (e.pointerId !== drag.id) return;
      const a = mod(Math.atan2(y - L.cy, x - L.cx) + Math.PI / 2, TAU);
      let da = a - drag.last;
      if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
      drag.acc += da; drag.last = a;
      const rg = rings[drag.i];
      const step = TAU / rg.n;
      if (!drag.moved && (Math.abs(drag.acc) > step * 0.45 || Math.hypot(x - drag.x, y - drag.y) > 8)) drag.moved = true;
      if (drag.moved && rg.on) {
        cvs.style.cursor = 'grabbing';
        const steps = Math.round(drag.acc / step);
        if (steps !== drag.applied) { rotateBy(drag.i, steps - drag.applied); drag.applied = steps; }
      }
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      cvs.style.cursor = '';
      try { cvs.releasePointerCapture(e.pointerId); } catch { /* ok */ }
      if (d.moved) return;
      const rg = rings[d.i];
      if (!rg.on) { setRingOn(d.i, true); return; }
      const p = mod(Math.round((d.a0 / TAU) * rg.n), rg.n);
      const pa = angleOf(p, rg.n), r = ringR(d.i);
      const px = L.cx + r * Math.cos(pa), py = L.cy + r * Math.sin(pa);
      const reach = Math.max(11, Math.min(18, (TAU * r) / rg.n / 2));
      if (Math.hypot(px - d.x, py - d.y) <= reach) toggleHit(d.i, p);
      else focusRing(d.i);
    }
    function onCancel() { drag = null; cvs.style.cursor = ''; }
    cvs.addEventListener('pointerdown', onDown);
    cvs.addEventListener('pointermove', onMove);
    cvs.addEventListener('pointerup', onUp);
    cvs.addEventListener('pointercancel', onCancel);

    /* ---------- drawing: static layer (cached) ---------- */
    function spinBlur(i) {
      if (!spin || spin.ring !== i || !spin.frame) return null;
      return spin.frame;
    }
    function ringOffset(i) {
      let off = tweenOff(rings[i]);
      const sb = spinBlur(i);
      if (sb) off += sb.off;
      return off;
    }

    function drawMeridian(c) {
      const x = Math.round(L.cx) + 0.5;
      const top = L.cy - L.Rmax - 14, bot = L.cy - ringR(0) + 14;
      c.strokeStyle = rgba(P.inkFaint, 0.32); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, Math.max(0, top)); c.lineTo(x, bot); c.stroke();
      const ly = L.cy - L.Rmax - 29;
      if (ly > 7) {
        c.beginPath();
        c.moveTo(x, ly - 5); c.lineTo(x + 4.2, ly); c.lineTo(x, ly + 5); c.lineTo(x - 4.2, ly); c.closePath();
        c.fillStyle = P.goldDim; c.fill();
        c.strokeStyle = P.gold; c.lineWidth = 1; c.stroke();
        c.font = fs(12, 'italic'); c.fillStyle = P.inkDim;
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText('downbeat', x + 10, ly + 0.5);
      }
    }

    function drawRing(c, i) {
      const rg = rings[i], r = ringR(i), col = RING_COLORS[i], n = rg.n;
      const isF = i === focus;
      const on = onsets(rg.hits);
      if (!rg.on) {
        c.save();
        c.setLineDash([2, 6]); c.strokeStyle = P.line; c.lineWidth = 1;
        c.beginPath(); c.arc(L.cx, L.cy, r, 0, TAU); c.stroke();
        c.restore();
        c.fillStyle = rgba(col, isF ? 0.4 : 0.22);
        for (const p of on) {
          const a = angleOf(p, n);
          c.beginPath(); c.arc(L.cx + r * Math.cos(a), L.cy + r * Math.sin(a), 2.6, 0, TAU); c.fill();
        }
        return;
      }
      const off = ringOffset(i);
      const sb = spinBlur(i);
      const copies = sb ? sb.copies : 1;
      const span = sb ? sb.span : 0;
      const band = sb ? sb.band : 0;

      c.strokeStyle = isF ? rgba(col, 0.42) : P.line; c.lineWidth = 1;
      c.beginPath(); c.arc(L.cx, L.cy, r, 0, TAU); c.stroke();
      if (band > 0) {
        c.strokeStyle = rgba(col, band * (0.14 + 0.5 * (on.length / n)));
        c.lineWidth = 7;
        c.beginPath(); c.arc(L.cx, L.cy, r, 0, TAU); c.stroke();
      }

      const prof = gapProfile(rg.hits);
      const long = prof.sizes.length === 2 ? prof.sizes[1] : null;
      const broken = !prof.even;
      const polyA = Math.max(0, 1 - (copies - 1) / 4) * (1 - band);
      const pt = (p, o) => { const a = angleOf(p + o, n); return [L.cx + r * Math.cos(a), L.cy + r * Math.sin(a)]; };

      if (on.length >= 2 && polyA > 0.02) {
        if (on.length >= 3) {
          c.beginPath();
          on.forEach((p, j) => { const [x, y] = pt(p, off); j ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.closePath();
          c.fillStyle = rgba(broken ? P.crimson : col, (isF ? 0.09 : 0.04) * polyA);
          c.fill();
        }
        const chords = on.length === 2 ? 1 : on.length;
        for (let j = 0; j < chords; j++) {
          const g = prof.gaps[j];
          const isLong = long == null || g === long;
          const [x0, y0] = pt(on[j], off), [x1, y1] = pt(on[(j + 1) % on.length], off);
          c.setLineDash(!broken && !isLong ? [3, 3] : []);
          c.strokeStyle = broken ? rgba(P.crimsonBright, 0.7 * polyA * (isF || !pitchMode ? 1 : 0.6))
            : rgba(col, (isLong ? 0.72 : 0.5) * polyA * (isF ? 1 : pitchMode ? 0.45 : 0.78));
          c.lineWidth = isLong ? 1.3 : 1.1;
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        }
        c.setLineDash([]);
      }

      // gap numerals on the arcs, just outside the focused ring (Toussaint's clock diagrams)
      if (isF && !pitchMode && copies === 1 && band === 0 && on.length >= 1 && on.length <= 16) {
        const gapPx = 0.2 * L.Rmax;
        const rr = i === 3 ? r + Math.min(15, gapPx * 0.55) : r + Math.min(13, gapPx * 0.48);
        c.font = fmn(10.5); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineJoin = 'round';
        prof.gaps.forEach((g, j) => {
          const mid = on[j] + g / 2 + off;
          const a = angleOf(mid, n);
          const x = L.cx + rr * Math.cos(a), y = L.cy + rr * Math.sin(a);
          c.strokeStyle = rgba(P.bg, 0.92); c.lineWidth = 4;          // halo over other rings' chords
          c.strokeText(String(g), x, y);
          c.fillStyle = long == null || g === long ? rgba(RING_TEXT[i], 0.95) : rgba(RING_TEXT[i], 0.62);
          c.fillText(String(g), x, y);
        });
      }

      // pulses and hits (with motion-blur copies while spinning)
      const dotA = copies > 1 ? Math.min(1, 1.7 / copies) : 1;
      const hr = isF ? 4.6 : 4;
      for (let cI = 0; cI < copies; cI++) {
        const o = off - (copies > 1 ? (span * cI) / (copies - 1) : 0);
        for (let p = 0; p < n; p++) {
          const [x, y] = pt(p, o);
          if (rg.hits[p]) {
            c.fillStyle = rgba(col, dotA);
            c.beginPath(); c.arc(x, y, hr, 0, TAU); c.fill();
            if (copies === 1) {
              c.strokeStyle = P.bg; c.lineWidth = 1.4; c.stroke();
              if (p === 0) {
                c.strokeStyle = rgba(col, 0.55); c.lineWidth = 1;
                c.beginPath(); c.arc(x, y, hr + 3.4, 0, TAU); c.stroke();
              }
            }
          } else {
            c.fillStyle = rgba(P.inkFaint, 0.9 * dotA);
            c.beginPath(); c.arc(x, y, 1.7, 0, TAU); c.fill();
          }
        }
      }
    }

    function drawPitchMarks(c) {
      const i = focus, rg = rings[i];
      if (!pitchMode || !rg.on) return;
      const r = ringR(i), off = ringOffset(i);
      if (rg.n === 12 && !spinBlur(i)) {
        // the stack of fifths inside the ring (the Spiral of Fifths' star)
        const gen = generatorOf(rg.hits);
        if (gen && (gen.g === 7 || gen.g === 5)) {
          const chain = gen.g === 7 ? gen.chain : gen.chain.slice().reverse();
          c.strokeStyle = rgba(i === 1 ? P.goldDim : P.azure, 0.42); c.lineWidth = 1;
          c.beginPath();
          chain.forEach((p, j) => {
            const a = angleOf(p + off, 12), x = L.cx + (r - 1) * Math.cos(a), y = L.cy + (r - 1) * Math.sin(a);
            j ? c.lineTo(x, y) : c.moveTo(x, y);
          });
          c.stroke();
        }
        const gapPx = 0.2 * L.Rmax;
        const rr = i === 3 ? r + Math.min(17, gapPx * 0.6) : r + gapPx * 0.5;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let p = 0; p < 12; p++) {
          const a = angleOf(p + off, 12);
          const hit = rg.hits[p];
          const x = L.cx + rr * Math.cos(a), y = L.cy + rr * Math.sin(a);
          c.font = hit ? fs(12.5, 'italic') : fs(11, 'italic');
          c.lineJoin = 'round'; c.strokeStyle = rgba(P.bg, 0.9); c.lineWidth = 4;
          c.strokeText(NOTE_NAMES[p], x, y);
          c.fillStyle = hit ? RING_TEXT[i] : rgba(P.inkFaint, 0.85);
          c.fillText(NOTE_NAMES[p], x, y);
        }
      }
    }

    function drawCentre(c) {
      const rg = rings[focus];
      const r0 = ringR(0);
      const maxW = 2 * r0 - 22;
      if (maxW < 36) return;
      const k = onsets(rg.hits).length;
      const l1 = rg.custom ? `${k} in ${rg.n}` : `E(${rg.k},${rg.n})`;
      const mode = pitchMode && rg.n === 12 ? modeName(rg.hits) : null;
      const l2 = mode ? mode.split(',')[0] : rg.custom ? 'by hand' : `rotation ${rg.rot}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round';
      let size = 16;
      c.font = fs(size, 'italic');
      while (size > 11 && c.measureText(l1).width > maxW) { size -= 1; c.font = fs(size, 'italic'); }
      // a halo of ground under the legend, so chords and the stack of fifths pass behind it
      c.strokeStyle = rgba(P.bg, 0.88); c.lineWidth = 5;
      c.strokeText(l1, L.cx, L.cy - 7);
      c.fillStyle = RING_TEXT[focus];
      c.fillText(l1, L.cx, L.cy - 7);
      c.font = fs(11.5, 'italic');
      if (c.measureText(l2).width <= maxW) {
        c.lineWidth = 4;
        c.strokeText(l2, L.cx, L.cy + 11);
        c.fillStyle = mode ? P.goldBright : P.inkDim;
        c.fillText(l2, L.cx, L.cy + 11);
      }
    }

    // Wrap words to a width with the current font.
    function wrapText(c, text, w) {
      const words = text.split(' ');
      const lines = [];
      let line = '';
      for (const wd of words) {
        const t = line ? line + ' ' + wd : wd;
        if (c.measureText(t).width > w && line) { lines.push(line); line = wd; } else line = t;
      }
      if (line) lines.push(line);
      return lines;
    }

    function rubric(c, left, right, x, y, w) {
      c.font = fs(12, 'italic'); c.fillStyle = P.inkDim;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText(left, x, y);
      if (right) {
        const lw = c.measureText(left).width;
        c.font = fs(11.5, 'italic');
        if (lw + c.measureText(right).width + 14 < w) {
          c.textAlign = 'right'; c.fillStyle = P.inkFaint;
          c.fillText(right, x + w, y);
        }
      }
      c.strokeStyle = rgba(P.line, 1); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, Math.round(y + 6) + 0.5); c.lineTo(x + w, Math.round(y + 6) + 0.5); c.stroke();
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }

    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    function drawLedger(c) {
      const B = L.led;
      if (B.w < 150 || B.h < 120) return;
      const i = focus, rg = rings[i], col = RING_COLORS[i], tcol = RING_TEXT[i];
      const x0 = B.x, W = B.w, yMax = B.y + B.h;
      const n = rg.n, k = onsets(rg.hits).length;
      const { prof } = describe(rg);
      const on = onsets(rg.hits);
      let y = B.y;

      if (L.wide) {
        const sx = Math.round(x0 - 22) + 0.5;
        const grad = c.createLinearGradient(0, B.y - 10, 0, yMax + 10);
        grad.addColorStop(0, rgba(P.line, 0)); grad.addColorStop(0.15, rgba(P.line, 1));
        grad.addColorStop(0.85, rgba(P.line, 1)); grad.addColorStop(1, rgba(P.line, 0));
        c.strokeStyle = grad; c.lineWidth = 1;
        c.beginPath(); c.moveTo(sx, B.y - 10); c.lineTo(sx, yMax + 10); c.stroke();
      }

      // heading: ring, formula, name
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.font = fs(12, 'italic'); c.fillStyle = P.inkFaint;
      c.fillText(`ring ${i + 1}${rg.on ? '' : ' · silent: tap it or switch it on'}`, x0, y + 10);
      y += 38;
      const formula = rg.custom ? `${k} in ${n}` : `E(${rg.k}, ${rg.n})`;
      c.font = fs(L.wide ? 26 : 23, 'italic'); c.fillStyle = tcol;
      c.fillText(formula, x0, y);
      const fx = x0 + c.measureText(formula).width + 12;
      c.font = fmn(11.5); c.fillStyle = P.inkDim;
      c.fillText(rg.custom ? 'set by hand' : `turned ${rg.rot}`, fx, y - 2);
      y += 22;
      const nm = necklaceName(rg.hits);
      let title, sub;
      if (nm) { title = nm.exact ? cap(nm.name) : `A rotation of ${nm.name}`; sub = nm.origin; }
      else if (rg.custom) { title = prof.even ? 'Set by hand, still maximally even' : 'Set by hand'; sub = prof.even ? `a rotation of E(${k},${n})` : 'the evenness has fallen'; }
      else { title = 'No tradition on file'; sub = 'every turn of it just as even'; }
      c.font = fs(14.5); c.fillStyle = P.ink;
      const tl = wrapText(c, title, W);
      tl.slice(0, 2).forEach((ln, j) => c.fillText(ln, x0, y + j * 18));
      y += Math.min(2, tl.length) * 18;
      c.font = fs(12.5, 'italic'); c.fillStyle = P.inkDim;
      const sl = wrapText(c, sub, W);
      sl.slice(0, 2).forEach((ln, j) => c.fillText(ln, x0, y + j * 16));
      y += Math.min(2, sl.length) * 16 + 16;

      // as pitches (first, when pitch is mapped, so it is never the part that is cut)
      if (pitchMode && y + 40 <= yMax) {
        rubric(c, 'as pitches', n === 12 ? 'twelve steps to the octave' : `${n} equal steps to the octave`, x0, y, W);
        y += 21;
        const notes = on.map((p) => (n === 12 ? NOTE_NAMES[p] : `${p}`)).join('  ');
        c.font = n === 12 ? fs(15, 'italic') : fmn(11.5); c.fillStyle = tcol;
        const nl = wrapText(c, notes, W);
        nl.slice(0, 2).forEach((ln, j) => c.fillText(ln, x0, y + j * 18));
        y += Math.min(2, nl.length) * 18;
        if (n === 12) {
          const mode = modeName(rg.hits);
          const gen = generatorOf(rg.hits);
          let line = mode ? cap(mode) : (k === 7 && !rg.hits[0]) ? 'No note on C: the scale without its tonic' : '';
          if (gen && (gen.g === 7 || gen.g === 5) && (k === 5 || k === 7)) {
            const chain = (gen.g === 7 ? gen.chain : gen.chain.slice().reverse()).map((p) => NOTE_NAMES[p]).join(' ');
            line = line ? `${line}; a stack of fifths, ${chain}` : `A stack of fifths, ${chain}`;
          }
          if (line) {
            c.font = fs(12.5, 'italic'); c.fillStyle = P.inkDim;
            const ll = wrapText(c, line, W).slice(0, 3);
            ll.forEach((ln, j) => c.fillText(ln, x0, y + j * 16));
            y += ll.length * 16;
          }
        }
        y += 16;
      }

      // Bjorklund's grouping beside Euclid's subtraction
      const bj = bjorklundSteps(k, n);
      if (y + 30 > yMax) return;
      rubric(c, rg.custom ? `Bjorklund’s grouping for ${k} in ${n}` : 'Bjorklund’s grouping', 'Euclid’s subtraction', x0, y, W);
      y += 16;
      const labelW = 74;
      const avail = W - labelW;
      let gg = 4;
      let cs = Math.floor((avail - gg * (n - 1)) / n);
      if (cs < 10) { gg = 2; cs = Math.floor((avail - gg * (n - 1)) / n); }
      cs = Math.max(5, Math.min(L.wide ? 19 : 15, cs));
      const rows = bj.rows.concat([{ final: true }]);
      for (const row of rows) {
        if (y + cs > yMax - 4) break;
        let x = x0;
        if (row.final) {
          for (let p = 0; p < n; p++) {
            const bx = x0 + p * (cs + 1);
            if (bj.bits[p] === '1') { c.fillStyle = col; c.beginPath(); c.arc(bx + cs / 2, y + cs / 2, Math.max(1.5, cs * 0.3), 0, TAU); c.fill(); }
            else { c.fillStyle = rgba(P.inkFaint, 0.9); c.beginPath(); c.arc(bx + cs / 2, y + cs / 2, 1.3, 0, TAU); c.fill(); }
          }
          c.font = fs(12, 'italic'); c.fillStyle = P.inkDim; c.textAlign = 'right'; c.textBaseline = 'middle';
          c.fillText(bj.gcd === 1 ? 'one left: stop' : `repeats ${bj.gcd}×`, x0 + W, y + cs / 2);
          c.textAlign = 'left';
          y += cs + 10;
          break;
        }
        for (const g of row.groups) {
          const w = g.bits.length * cs;
          c.strokeStyle = g.rem ? rgba(P.inkDim, 0.4) : rgba(col, 0.55);
          c.fillStyle = g.rem ? rgba(P.inkDim, 0.04) : rgba(col, 0.07);
          c.lineWidth = 1;
          c.setLineDash(g.rem ? [2, 2] : []);
          roundRect(c, x + 0.5, y + 0.5, w - 1, cs - 1, Math.min(3, cs / 3));
          c.fill(); c.stroke();
          c.setLineDash([]);
          for (let b = 0; b < g.bits.length; b++) {
            const bx = x + b * cs + cs / 2, by = y + cs / 2;
            if (g.bits[b] === '1') { c.fillStyle = col; c.beginPath(); c.arc(bx, by, Math.max(1.4, cs * 0.26), 0, TAU); c.fill(); }
            else { c.fillStyle = rgba(P.inkFaint, 0.95); c.beginPath(); c.arc(bx, by, 1.2, 0, TAU); c.fill(); }
          }
          x += w + gg;
        }
        c.textBaseline = 'middle';
        if (row.sub) {
          c.font = fmn(11); c.fillStyle = P.goldBright; c.textAlign = 'right';
          c.fillText(`${row.sub[0]} − ${row.sub[1]} = ${row.sub[2]}`, x0 + W, y + cs / 2);
        } else {
          c.font = fs(12, 'italic'); c.fillStyle = P.inkDim; c.textAlign = 'right';
          c.fillText(`${row.A} and ${row.B}`, x0 + W, y + cs / 2);
        }
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        y += cs + 8;
      }
      y += 12;

      // on the ring: box notation from the downbeat, with the gaps
      if (y + 44 > yMax) return;
      rubric(c, 'on the ring, from the downbeat', rg.custom ? '' : `the rhythm above, turned`, x0, y, W);
      y += 18;
      const bs = Math.max(6, Math.min(18, Math.floor(W / n)));
      for (let p = 0; p < n; p++) {
        const bx = x0 + p * bs;
        if (rg.hits[p]) { c.fillStyle = rgba(col, 0.9); c.fillRect(bx + 1, y + 1, bs - 2, bs - 2); }
        else { c.strokeStyle = rgba(P.inkFaint, 0.45); c.lineWidth = 1; c.strokeRect(bx + 1.5, y + 1.5, bs - 3, bs - 3); }
      }
      // downbeat tick
      c.fillStyle = P.gold;
      c.beginPath(); c.moveTo(x0 + bs / 2, y - 2); c.lineTo(x0 + bs / 2 + 3, y - 6); c.lineTo(x0 + bs / 2 - 3, y - 6); c.closePath(); c.fill();
      y += bs + 4;
      const long = prof.sizes.length === 2 ? prof.sizes[1] : null;
      c.font = fmn(10.5); c.textAlign = 'center'; c.textBaseline = 'top';
      prof.gaps.forEach((g, j) => {
        // in box units, a hit's centre is p + ½; a gap that runs past the end wraps to the start
        const s0 = on[j] + 0.5, e0 = on[j] + g + 0.5;
        const segs = e0 <= n ? [[s0, e0]] : [[s0, n], [0, e0 - n]];
        c.strokeStyle = rgba(P.inkFaint, 0.55); c.lineWidth = 1;
        let best = segs[0];
        for (const sg of segs) {
          if (sg[1] - sg[0] > best[1] - best[0]) best = sg;
          if (sg[1] - sg[0] < 0.75) continue;           // no stubs where a gap wraps past the end
          c.beginPath(); c.moveTo(x0 + sg[0] * bs + 2, y + 1.5); c.lineTo(x0 + sg[1] * bs - 2, y + 1.5); c.stroke();
        }
        c.fillStyle = prof.even ? (long == null || g === long ? tcol : P.inkDim) : P.crimsonBright;
        c.fillText(String(g), x0 + ((best[0] + best[1]) / 2) * bs, y + 4);
      });
      y += 30;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.font = fs(12.5, 'italic');
      c.fillStyle = prof.even ? P.inkDim : P.crimsonBright;
      const verdict = prof.sizes.length <= 1 ? 'one size of gap: perfectly even'
        : prof.even ? 'two sizes of gap, one pulse apart: maximally even' : `${prof.sizes.length} sizes of gap: no longer maximally even`;
      const vl = wrapText(c, verdict, W);
      vl.slice(0, 2).forEach((ln, j) => c.fillText(ln, x0, y + j * 16));
      y += Math.min(2, vl.length) * 16 + 12;

      // evenness gauge (Demaine et al.'s sum of distances, against the Euclidean best)
      if (y + 16 <= yMax) {
        const ev = evenness(rg.hits);
        const lab = 'evenness';
        c.font = fs(12, 'italic'); c.fillStyle = P.inkDim;
        c.fillText(lab, x0, y + 4);
        const gx = x0 + c.measureText(lab).width + 12, gw = Math.max(20, W - (gx - x0) - 58);
        c.fillStyle = rgba(P.line, 1);
        c.fillRect(gx, y - 1, gw, 4);
        const full = ev > 0.99995;
        c.fillStyle = full ? P.gold : P.crimsonBright;
        c.fillRect(gx, y - 1, gw * Math.max(0, Math.min(1, ev)), 4);
        c.font = fmn(11); c.textAlign = 'right';
        c.fillStyle = full ? P.goldBright : P.crimsonBright;
        c.fillText(full ? '100%' : `${(ev * 100).toFixed(1)}%`, x0 + W, y + 4);
        c.textAlign = 'left';
        y += 20;
        if (y + 12 <= yMax && L.wide && !pitchMode) {
          c.font = fs(11.5, 'italic'); c.fillStyle = P.inkFaint;
          const note = `the sum of the straight-line distances between all pairs of hits, against the best ${k} in ${n}`;
          const nl = wrapText(c, note, W);
          nl.slice(0, 2).forEach((ln, j) => c.fillText(ln, x0, y + j * 15));
          y += Math.min(2, nl.length) * 15;
        }
      }

      // Fourier magnitudes: the partials the necklace keeps when it spins into a tone
      const bh = L.wide ? 34 : 28;
      if (!pitchMode && k >= 1 && n >= 2 && y + 30 + bh + 16 <= yMax) {
        y += 16;
        rubric(c, 'Fourier magnitudes', 'the tone it makes, spun', x0, y, W);
        y += 14;
        const sp = spectrum(rg.hits);
        const M = n - 1;
        const step = Math.min(26, Math.floor(W / M));
        const bw = Math.max(2, Math.min(17, step - 4));
        let topV = 0;
        for (let m = 1; m <= M; m++) topV = Math.max(topV, sp[m]);
        c.fillStyle = rgba(P.line, 1);
        c.fillRect(x0, y + bh + 0.5, M * step - (step - bw), 1);
        for (let m = 1; m <= M; m++) {
          const top = Math.abs(sp[m] - topV) < 1e-9;
          const h = Math.max(1, (sp[m] / Math.max(1, k)) * bh);
          const x = x0 + (m - 1) * step;
          c.fillStyle = rgba(col, top ? 0.95 : 0.45);
          c.fillRect(x, y + bh - h + 0.5, bw, h);
          if (bw >= 8) {
            c.font = fmn(9.5); c.fillStyle = top ? tcol : P.inkFaint;
            c.textAlign = 'center'; c.textBaseline = 'top';
            c.fillText(String(m), x + bw / 2, y + bh + 4);
          }
        }
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        y += bh + 18;
      }
    }

    function roundRect(c, x, y, w, h, r) {
      w = Math.max(0, w); h = Math.max(0, h); r = Math.max(0, Math.min(r, w / 2, h / 2));
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function drawStatic(c, now) {
      const W = handle.width, H = handle.height;
      c.clearRect(0, 0, W, H);
      if (spin) {
        const ph = spinTurnsAt(now);
        const dPh = spin.lastPh == null ? 0 : Math.max(0, ph - spin.lastPh);
        spin.lastPh = ph;
        const n = rings[spin.ring].n;
        const spanTurns = Math.min(1, dPh);
        spin.frame = {
          off: (ph - Math.floor(ph)) * n,
          span: spanTurns * n,
          copies: Math.max(1, Math.min(14, Math.ceil(spanTurns * n * 1.3))),
          band: smooth(0.22, 0.85, dPh),
        };
      }
      drawMeridian(c);
      const order = [0, 1, 2, 3].filter((i) => i !== focus).concat([focus]);
      for (const i of order) drawRing(c, i);
      drawPitchMarks(c);
      drawCentre(c);
      drawLedger(c);
    }

    /* ---------- drawing: dynamic overlay ---------- */
    function consumeQueue(now) {
      if (!queue.length) return;
      const keep = [];
      const byT = new Map();
      for (const e of queue) {
        if (e.t <= now) {
          const rg = rings[e.ri];
          if (!rg.vis || e.t >= rg.vis.t) rg.vis = e;
          if (e.hit && e.p < rg.flash.length) {
            rg.flash[e.p] = e.t;
            const key = Math.round(e.t * 1e4);
            if (!byT.has(key)) byT.set(key, { t: e.t, pts: [] });
            byT.get(key).pts.push([e.ri, e.p]);
          }
          if (e.t > lastEventT) lastEventT = e.t;
        } else keep.push(e);
      }
      queue = keep;
      for (const v of byT.values()) {
        if (new Set(v.pts.map((q) => q[0])).size >= 2) threads.push(v);
      }
      if (threads.length > 16) threads.splice(0, threads.length - 16);
    }

    function pulsePos(i, p) {
      const rg = rings[i], r = ringR(i);
      const a = angleOf(p + ringOffset(i), rg.n);
      return [L.cx + r * Math.cos(a), L.cy + r * Math.sin(a)];
    }

    function drawDynamic(ctx, now) {
      // the hand (bar mode) or needles (shared pulse), driven by the audio clock
      if (playing) {
        if (!shared) {
          const i0 = rings.findIndex((rg) => rg.on && rg.vis);
          if (i0 >= 0) {
            const v = rings[i0].vis, n = rings[i0].n;
            const frac = Math.max(0, Math.min(1, (now - v.t) / v.d));
            const a = angleOf((v.p + frac) % n, n);
            const r0 = Math.max(0, ringR(0) - 16), r1 = L.Rmax + 12;
            if (!RM) {
              ctx.fillStyle = rgba(P.gold, 0.05);
              ctx.beginPath(); ctx.moveTo(L.cx, L.cy);
              ctx.arc(L.cx, L.cy, r1, a - TAU / 10, a); ctx.closePath(); ctx.fill();
            }
            ctx.strokeStyle = rgba(P.goldBright, 0.6); ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(L.cx + r0 * Math.cos(a), L.cy + r0 * Math.sin(a));
            ctx.lineTo(L.cx + r1 * Math.cos(a), L.cy + r1 * Math.sin(a));
            ctx.stroke();
          }
        } else {
          rings.forEach((rg, i) => {
            if (!rg.on || !rg.vis) return;
            const frac = Math.max(0, Math.min(1, (now - rg.vis.t) / rg.vis.d));
            const a = angleOf((rg.vis.p + frac) % rg.n, rg.n);
            const r = ringR(i);
            ctx.strokeStyle = rgba(RING_COLORS[i], 0.85); ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(L.cx + (r - 11) * Math.cos(a), L.cy + (r - 11) * Math.sin(a));
            ctx.lineTo(L.cx + (r + 11) * Math.cos(a), L.cy + (r + 11) * Math.sin(a));
            ctx.stroke();
            sprites[i].draw(ctx, L.cx + r * Math.cos(a), L.cy + r * Math.sin(a), 0.6);
          });
        }
      }
      // flashes: a struck polygon rings along its two chords
      rings.forEach((rg, i) => {
        if (!rg.on) return;
        const on = onsets(rg.hits);
        const col = RING_COLORS[i];
        on.forEach((p, j) => {
          const age = now - rg.flash[p];
          const f = age >= 0 && age < 0.38 ? 1 - age / 0.38 : 0;
          if (f <= 0) return;
          const [x, y] = pulsePos(i, p);
          if (on.length >= 2) {
            const prev = on[(j - 1 + on.length) % on.length], next = on[(j + 1) % on.length];
            const [xp, yp] = pulsePos(i, prev), [xn, yn] = pulsePos(i, next);
            ctx.strokeStyle = rgba(col, 0.3 + 0.6 * f); ctx.lineWidth = 1.2 + 1.3 * f;
            ctx.beginPath(); ctx.moveTo(xp, yp); ctx.lineTo(x, y); ctx.lineTo(xn, yn); ctx.stroke();
          }
          if (p === 0) accentSprite.draw(ctx, x, y, RM ? 1 : 0.8 + 0.9 * f);
          sprites[i].draw(ctx, x, y, RM ? 1.1 : 0.9 + 1.2 * f);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(x, y, (i === focus ? 4.6 : 4) + (RM ? 1 : 3 * f), 0, TAU); ctx.fill();
          ctx.fillStyle = P.ink;
          ctx.beginPath(); ctx.arc(x, y, 1.5 + 1.8 * f, 0, TAU); ctx.fill();
        });
      });
      // gold threads between hits that sound at the same instant
      threads = threads.filter((th) => now - th.t < 0.5);
      for (const th of threads) {
        const age = now - th.t;
        if (age < 0) continue;
        const f = 1 - age / 0.5;
        const pts = th.pts.slice().sort((a, b) => a[0] - b[0]).map(([ri, p]) => pulsePos(ri, p));
        ctx.strokeStyle = rgba(P.goldBright, 0.75 * f); ctx.lineWidth = 1.2;
        ctx.beginPath();
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        for (const [x, y] of pts) threadSprite.draw(ctx, x, y, 0.6 + 0.6 * f);
      }
    }

    function drawSpinNote(ctx, now) {
      if (!spin) return;
      const rate = spinRateAt(now);
      const hits = rings[spin.ring].hits;
      const loops = loopsPerTurn(hits);          // E(4,8) repeats four times a turn
      const rep = rate * loops;
      const v = spinVerdict(rep, rate * onsets(hits).length);
      const verdict = v === 'pitch' ? `a pitch, near ${noteName(rep)}`
        : v === 'flutter' ? 'flutter: the clicks begin to fuse'
        : v === 'blur' ? 'a rattle of clicks, not yet a tone' : 'a rhythm';
      const fmt = (x) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));
      const t1 = loops > 1 ? `${fmt(rate)} turns, ${fmt(rep)} repeats a second` : `${fmt(rate)} turns a second`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = fmn(12);
      const w1 = ctx.measureText(t1).width;
      ctx.font = fs(13, 'italic');
      const oneLine = ` · ${verdict}`;
      const w2 = ctx.measureText(oneLine).width;
      const fits = w1 + w2 <= handle.width - 16;
      const y = L.cy + L.Rmax + (L.wide ? 30 : 22) - (fits ? 0 : 8);   // phones: clear of the ledger
      const yy = y + (fits ? 0 : 17) < handle.height - 8 ? y : 18;
      if (fits) {
        const x = L.cx - (w1 + w2) / 2;
        ctx.font = fmn(12); ctx.fillStyle = RING_TEXT[spin.ring];
        ctx.fillText(t1, x, yy);
        ctx.font = fs(13, 'italic'); ctx.fillStyle = P.inkDim;
        ctx.fillText(oneLine, x + w1, yy);
      } else {
        ctx.textAlign = 'center';
        ctx.font = fmn(12); ctx.fillStyle = RING_TEXT[spin.ring];
        ctx.fillText(t1, L.cx, yy);
        ctx.font = fs(13, 'italic'); ctx.fillStyle = P.inkDim;
        ctx.fillText(verdict, L.cx, yy + 17);
        ctx.textAlign = 'left';
      }
    }

    function frame() {
      const now = nowT();
      consumeQueue(now);
      if (spin && spin.dir === 'down' && now >= spin.seg.t0 + spin.seg.dur + 0.05) stopSpin();
      const busyPlay = playing || (lastEventT > 0 && now - lastEventT < 0.6);
      const tw = rings.some((rg) => rg.tw);
      if (!dirty && !busyPlay && !tw && !spin) return;          // idle: nothing to draw
      const { ctx, width: W, height: H } = handle;
      if (!L || cache.width < 2) return;
      if (dirty || tw || spin) { drawStatic(cctx, now); dirty = false; }
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(cache, 0, 0, W, H);
      if (busyPlay) drawDynamic(ctx, now);
      if (spin) drawSpinNote(ctx, now);
    }

    const loop = cv.rafLoop(frame);
    loop.start();
    focusRing(0);
    updateSpinBtn();

    /* ---------- lifecycle ---------- */
    return {
      pause() { loop.stop(); stopPlay(); stopSpin(); bus.mute(); },
      resume() { bus.unmute(); dirty = true; loop.start(); },
      destroy() {
        loop.stop(); stopPlay(); stopSpin();
        cvs.removeEventListener('pointerdown', onDown);
        cvs.removeEventListener('pointermove', onMove);
        cvs.removeEventListener('pointerup', onUp);
        cvs.removeEventListener('pointercancel', onCancel);
        bus.dispose(); handle.destroy(); plate.remove(); style.remove();
      },
    };
  },
};
