// II — The Spiral of Fifths
// The circle of fifths as modular arithmetic (orbits, cosets, 7 × 7 ≡ 1); pure ratios
// refusing to close it; the Pythagorean comma made visible and audible; the tuning axis
// from 19-equal to 41-equal, where the spiral closes exactly when the fifth is a rational
// part of the octave; continued fractions explaining "why 12"; Steinhaus's three gaps.
//
// Checked at build time (September 2026):
// · (3/2)^12 = 129.746337890625, 3^12/2^19 = 531441/524288 = 23.460¢; the Division of the
//   Canon's 262144 → 531441 against 524288 (MacTutor, Archibald; Barker 1989 p. 199).
// · Lüshi chunqiu, book 6, "Yinlü": 黃鐘生林鐘 … 三分所生，益之一分以上生；三分所生，
//   去其一分以下生 (zh.wikisource); c. 239 BCE; Ling Lun legend as retold by J. Service,
//   "Chinese Music Theory", Sounding China, Harvard.
// · Jing Fang (78–37 BCE): sixty fifths; 53 fifths ≈ 31 octaves (McClain & Hung 1979).
// · Zhu Zaiyu, Lüxue xinshuo, 1584 (Service); Stevin, Van de Spiegheling der Singconst,
//   c. 1605 manuscript (Muzzulini 2021, references).
// · Newton 1665, "Of Musick", College Notebook, CUL MS Add. 4000 ff. 138r–143r: divisions
//   15, 19, 20, 24, 25, 29, 36, 41, 51, 53, 59, 100, 120, 612 (Muzzulini, EMR 15(3–4)).
// · Three-gap theorem: conjectured by Steinhaus; proved by Sós, Surányi, Świerczkowski
//   (1957–59). Two gap sizes for pure fifths at N = 2, 3, 5, 7, 12, 17, 29, 41, 53
//   (N ≤ 54, computed); at each of these N the new size at N + 1 equals |drift(N)|.
// · Equal-tempered fifths beat: A3–E4 0.745 Hz, D4–A4 0.994 Hz at A440 (computed);
//   CBH Technical Library, "How to tune Equal Temperament".
// · Viola/cello C tuned in pure fifths from A: 3 × 1.955¢ = 5.865¢ = comma/4 below the
//   piano's (Atar Arad, Strings, Jan 2018: "1/4 of a comma flatter than that of the piano").
// · Turkish makam: "In the last few decades, the method of partitioning the whole tone into 9
//   and the octave into 53 commas has spread among traditionalist circles" (Bozkurt et al.
//   2009); Urmavi's 17-tone Pythagorean scale (ibid.; Kitāb al-Adwār).
// · ¼-comma meantone fifth 696.578¢ = 1200·log₂5/4; 12 of them miss by −41.059¢ (128/125);
//   Aron's tuning manual of 1523 "included a possible description", Zarlino "described in clear
//   mathematical terms" a temperament corresponding to it in 1571 (Wikipedia, "Meantone
//   temperament", citing Barbour and Zarlino, Dimostrationi harmoniche).
// · Diletskii: "The earliest circles of fifths appear in … Grammatika … written in the late
//   1670s … three surviving variants (from Smolensk 1677, from Moscow 1679 …)" (Jensen, abstract).
// · 53 pure fifths: 41 × 23.460¢ + 12 × 19.845¢ (limma − 3 commas = 19.84496¢).
// · Haynes & Marklof, IMRN 2022(24) (online 2021; arXiv 2009.08444): at most five distances
//   in 2-D; bound 13 in 3-D, conjectured 9. Clader & Jelmyer, arXiv:2512.09956 (Dec 2025,
//   rev. May 2026): results "have previously appeared in the work of Carey and Clampitt".
// · ×7 on ℤ/12ℤ: 7k ≡ k + 6k, and 6k ≡ 0 or 6 as k is even or odd, so arranging by fifths
//   fixes every even step and swaps each odd step with the one a tritone away.

/* =========================================================================
   Pure logic (no DOM; exported through _test for node)
   ========================================================================= */

export const PURE_FIFTH = 1200 * Math.log2(3 / 2);           // 701.955…¢
const LOG2_32 = Math.log2(3 / 2);                              // 0.5849625007…
export const COMMA_CENTS = 1200 * (12 * LOG2_32 - 7);          // 23.460…¢
const C4 = 261.6256;                                            // Hz, middle C at A440
const TAU = Math.PI * 2;

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// The tuning axis. Every entry but ¼-comma meantone and the pure fifth is a rational
// part of the octave, so its spiral closes (after 53, 41, 12, 31 or 19 fifths).
export const PRESETS = [
  { key: 'pure', label: 'pure 3:2', cents: PURE_FIFTH, closes: null },
  { key: 'e53', label: '53 equal', cents: 1200 * 31 / 53, closes: 53 },
  { key: 'e41', label: '41 equal', cents: 1200 * 24 / 41, closes: 41 },
  { key: 'e12', label: '12 equal (the piano)', cents: 700, closes: 12 },
  { key: 'e31', label: '31 equal', cents: 1200 * 18 / 31, closes: 31 },
  { key: 'mt4', label: '¼-comma meantone', cents: 300 * Math.log2(5), closes: null },
  { key: 'e19', label: '19 equal', cents: 1200 * 11 / 19, closes: 19 },
];
export const FIFTH_MIN = 694, FIFTH_MAX = 703;

export function mod(a, n) { return ((a % n) + n) % n; }
export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

// The walk start, start+k, start+2k, … in ℤ/nℤ until it returns (return not repeated).
export function orbit(k, start = 0, n = 12) {
  const s = mod(start, n), out = [];
  let p = s;
  do { out.push(p); p = mod(p + k, n); } while (p !== s && out.length <= n);
  return out;
}

// All orbits of +k, the first one through `start`, the others by their lowest note
// counted upward from start: the cosets of the subgroup ⟨k⟩.
export function cosets(k, start = 0, n = 12) {
  const seen = new Set(), out = [];
  for (let d = 0; d < n; d++) {
    const s = mod(start + d, n);
    if (seen.has(s)) continue;
    const o = orbit(k, s, n);
    for (const x of o) seen.add(x);
    out.push(o);
  }
  return out;
}

// The figure a step of k draws on n evenly spaced points: {L} polygon, {L/m} star,
// or a bare segment when L = 2. {n/m} and {n/(n−m)} are the same figure.
export function figureOf(k, n = 12) {
  const g = gcd(k, n), L = n / g, step = mod(k / g, L), m = Math.min(step, L - step);
  return { g, L, m, kind: L <= 2 ? 'segment' : m === 1 ? 'polygon' : 'star' };
}
const POLY = { 3: 'triangle', 4: 'square', 6: 'hexagon', 12: 'dodecagon' };
export function figureName(k, n = 12) {
  const f = figureOf(k, n);
  if (f.kind === 'segment') return 'a single line, there and back';
  if (f.kind === 'polygon') return `the ${POLY[f.L] || f.L + '-gon'} {${f.L}}`;
  return `the star {${f.L}/${f.m}}`;
}

// What musicians call the orbits of each step in ℤ/12ℤ.
export function orbitFamily(k) {
  switch (mod(k, 12)) {
    case 7: return 'the circle of fifths';
    case 5: return 'the circle of fourths';
    case 1: return 'the chromatic scale';
    case 11: return 'the chromatic scale, falling';
    case 2: case 10: return 'the two whole-tone scales';
    case 3: case 9: return 'the three diminished seventh chords';
    case 4: case 8: return 'the four augmented triads';
    case 6: return 'the six tritones';
    default: return '';
  }
}

// q fifths against the nearest whole number of octaves, in signed cents.
export function drift(q, fifth = PURE_FIFTH) {
  const c = q * fifth;
  return c - 1200 * Math.round(c / 1200);
}

// Octave-reduced position of the nth fifth, in [0, 1200). Values within 1e-6¢ of the
// octave wrap to 0, so tempered closures land exactly on the start.
export function fifthCents(n, fifth = PURE_FIFTH) {
  const c = mod(n * fifth, 1200);
  return c > 1200 - 1e-6 ? 0 : c;
}

// Steinhaus's gaps for N stacked fifths (notes n = 0 … N−1).
// Returns { notes: [{n, c}] sorted by pitch, distinct: [cents], gaps: [{from, to, size, cls}],
//           sizes: [distinct sizes, descending], counts: [how many of each] }.
export function gapStructure(N, fifth = PURE_FIFTH, tol = 1e-6) {
  const notes = [];
  for (let n = 0; n < Math.max(1, N); n++) notes.push({ n, c: fifthCents(n, fifth) });
  notes.sort((a, b) => a.c - b.c || a.n - b.n);
  const distinct = [];
  for (const x of notes) if (!distinct.length || x.c - distinct[distinct.length - 1] > tol) distinct.push(x.c);
  const gaps = [];
  if (distinct.length > 1) {
    for (let i = 0; i < distinct.length; i++) {
      const from = distinct[i], to = i + 1 < distinct.length ? distinct[i + 1] : distinct[0] + 1200;
      if (to - from > tol) gaps.push({ from, to, size: to - from, cls: 0 });
    }
  } else gaps.push({ from: distinct[0], to: distinct[0] + 1200, size: 1200, cls: 0 });
  const sizes = [];
  for (const g of [...gaps].sort((a, b) => b.size - a.size)) {
    if (!sizes.length || sizes[sizes.length - 1] - g.size > 1e-4) sizes.push(g.size);
  }
  for (const g of gaps) {
    let best = 0;
    for (let i = 1; i < sizes.length; i++) if (Math.abs(sizes[i] - g.size) < Math.abs(sizes[best] - g.size)) best = i;
    g.cls = best;
  }
  const counts = sizes.map((_, i) => gaps.filter((g) => g.cls === i).length);
  return { notes, distinct, gaps, sizes, counts };
}

// The N (2 ≤ N ≤ maxN) at which the stack has exactly two step sizes.
export function twoGapCounts(maxN = 53, fifth = PURE_FIFTH) {
  const out = [];
  for (let N = 2; N <= maxN; N++) if (gapStructure(N, fifth).sizes.length === 2) out.push(N);
  return out;
}

// Pythagorean spelling of the nth fifth above C: C G D A E B F♯ C♯ … E♯ B♯ F♯♯ …
// Returns null past three sharps (the spellings stop being useful to read).
export function spelled(n) {
  if (n < 0) return null;
  const letters = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const i = n + 1, s = Math.floor(i / 7);
  if (s > 3) return null;
  return letters[i % 7] + '♯'.repeat(s);
}

// Continued fraction and convergents of x.
export function cfConvergents(x, terms = 8) {
  const a = [];
  let y = x;
  for (let i = 0; i < terms; i++) {
    const t = Math.floor(y + 1e-12);
    a.push(t);
    const r = y - t;
    if (r < 1e-12) break;
    y = 1 / r;
  }
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1;
  const conv = [];
  for (const t of a) {
    const h = t * h1 + h0, k = t * k1 + k0;
    conv.push({ p: h, q: k });
    h0 = h1; h1 = h; k0 = k1; k1 = k;
  }
  return { terms: a, convergents: conv };
}

// Stacks whose miss beats every smaller stack: exactly the convergent denominators.
export function recordStacks(maxQ = 53, fifth = PURE_FIFTH) {
  const out = [];
  let best = Infinity;
  for (let q = 1; q <= maxQ; q++) {
    const d = Math.abs(drift(q, fifth));
    if (d < best - 1e-9) { best = d; out.push(q); }
  }
  return out;
}

// Beat rate, in Hz, between C4 and a note `d` cents from it.
export function beatHz(d, base = C4) { return Math.abs(base * (Math.pow(2, d / 1200) - 1)); }

// Names for the steps of pure-fifth scales.
const STEP_NAMES = [
  [701.955, 'fifth'], [498.045, 'fourth'], [294.135, 'minor third'], [203.910, 'whole tone'],
  [113.685, 'apotome'], [90.225, 'limma'], [23.460, 'comma'], [3.615, 'Mercator’s comma'],
];
export function stepName(c) {
  for (const [v, name] of STEP_NAMES) if (Math.abs(c - v) < 0.002) return name;
  return '';
}

export function presetFor(fifth, tol = 0.0005) {
  return PRESETS.find((p) => Math.abs(p.cents - fifth) < tol) || null;
}

export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const signed = (x, dp = 2) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(dp);

// Canvas height for a given width: side by side from 640 px, stacked below that.
export function heightFor(W) {
  W = Math.max(200, W || 0);
  return W >= 640 ? Math.max(460, Math.min(560, Math.round(W * 0.52))) : Math.round(W + 410);
}

// Figure and panel rectangles. Every size is clamped, so a transient 0×0 canvas is safe.
export function computeLayout(W, H) {
  W = Math.max(1, W); H = Math.max(1, H);
  const wide = W >= 640;
  if (wide) {
    const fig = Math.min(H, Math.round(W * 0.52));
    const cx = fig / 2 + 6, cy = H / 2;
    const R = Math.max(12, fig / 2 - 48);
    const px = fig + 26;
    return { wide, cx, cy, R, panel: { x: px, y: 28, w: Math.max(40, W - px - 22), h: Math.max(40, H - 56) } };
  }
  const fig = W;
  const R = Math.max(12, fig / 2 - 42);
  return { wide, cx: W / 2, cy: fig / 2 + 2, R, panel: { x: 14, y: fig + 8, w: Math.max(40, W - 28), h: Math.max(40, H - fig - 22) } };
}

/* =========================================================================
   Words
   ========================================================================= */

const PROSE = `
    <p>Take a note and multiply its frequency by <code>3/2</code>, the perfect fifth, the
    simplest interval after the octave; then do it again, and again. Twelve such steps come
    back almost exactly to the note they started from, seven octaves up, touching every note
    of the chromatic scale once on the way. The loop is among the oldest written recipes for a
    scale. The <em>Lüshi chunqiu</em>, compiled around 239 BCE under the Qin chancellor Lü
    Buwei, derives China’s twelve pitch-pipes one from another by cutting a third from a
    pipe’s length or adding a third to it, which raises the note a fifth or lowers it a
    fourth: the same step, folded back into a single octave.</p>
    <p>The circle of fifths, Western music’s map of keys, is younger than its arithmetic by
    nearly two thousand years: its earliest known drawings are in Nikolai Diletskii’s
    <em>Grammatika</em>, a treatise on composition whose first surviving version was written
    in Smolensk in 1677. The circle itself is counting modulo 12. Step by
    <em>k</em> semitones and you visit every note exactly when <code>gcd(k,&nbsp;12)&nbsp;=&nbsp;1</code>,
    which leaves only 1, 5, 7 and 11. Step by 3 and you are trapped in four notes, a
    diminished seventh chord, which is to say a subgroup; its two cosets, drawn in their own
    colours, are the only other diminished sevenths there are. Seven is its own undoing, since
    <code>7&nbsp;×&nbsp;7&nbsp;=&nbsp;49&nbsp;≡&nbsp;1</code>: arrange the twelve notes by fifths and the chromatic scale
    becomes the star, while the star relaxes into a plain dodecagon.</p>
    <p>But look closer. <code>(3/2)¹²&nbsp;=&nbsp;129.746…</code> while <code>2⁷&nbsp;=&nbsp;128</code>. Twelve
    pure fifths overshoot seven octaves by the ratio <code>531441/524288</code>, the
    <em>Pythagorean comma</em>, about 23.46 cents: a quarter of a semitone, and a near twin of
    the monochord’s syntonic comma, <code>81/80</code>. The overshoot was a theorem long before it was a
    tuner’s problem. The <em>Division of the Canon</em>, a short Greek treatise handed down under
    Euclid’s name from around 300 BCE, starts from the number 262144 and shows that six whole
    tones of 9:8 carry it to 531441, while one octave reaches only 524288. Unroll the stage
    into pure fifths and the circle becomes a spiral whose ends do not meet; sound the miss and
    you hear them beat against each other, about three and a half times a second at middle
    C.</p>
    <p>Equal temperament, the piano’s tuning, is a peace treaty. Shave each fifth by a twelfth
    of the comma, 1.955 cents, too little to sound out of tune in a melody though a tuner still
    hears it as a slow waver, less than once a second in the middle of the keyboard, and the
    spiral welds shut. The treaty was drafted twice, on opposite sides of the world: the Ming
    prince Zhu Zaiyu published the exact division in 1584, and the Flemish mathematician Simon
    Stevin reached it independently in a manuscript of around 1605.</p>
    <p>Other treaties are possible, and the tuning controls under the spiral will sign them. A fifth of exactly 7/12
    of an octave closes the spiral after twelve steps; one of 11/19, 18/31 or 24/41 closes it
    after nineteen, thirty-one or forty-one. Any fifth that is a rational part of the octave
    closes it eventually, and no other fifth ever can: rational is periodic, once again.
    Quarter-comma meantone, which Pietro Aron’s keyboard-tuning manual of 1523 seems to
    describe and Gioseffo Zarlino set out exactly in 1571, narrows each fifth until four of
    them make a pure major third. Its fifth of
    696.58 cents is an irrational part of the octave, so its spiral winds on for ever, and
    twelve of its fifths fall 41 cents short of seven octaves.</p>
    <p>Why twelve notes, and not eleven or thirteen? Closing the spiral means finding whole
    numbers with <code>(3/2)<sup>q</sup>&nbsp;≈&nbsp;2<sup>p</sup></code>, a fraction <code>p/q</code> close to
    <code>log₂(3/2)&nbsp;=&nbsp;0.58496…</code>, and the theory of continued fractions manufactures the
    <em>best possible</em> such fractions: <code>1/2, 3/5, 7/12, 24/41, 31/53…</code> For
    anyone who builds a scale from fifths, five and twelve are not arbitrary places to stop.
    They are the denominators of these convergents, and the diatonic seven arrives as
    <code>4/7</code>, a lesser approximation that falls between 1/2 and 7/12. The chart on the
    stage plots every stack’s miss up to 53, and each convergent sets a record that no
    smaller stack beats. Fifty-three is uncanny: fifty-three pure fifths overshoot thirty-one
    octaves by only 3.6 cents. The Han theorist Jing Fang noticed it in the first century BCE,
    while extending the cycle to sixty notes, and in 1665 a twenty-two-year-old Isaac Newton,
    looking for equal divisions of the octave that could imitate just intonation, tried
    fifty-three among fourteen of them in the ‘Of Musick’ pages of his college notebook.</p>
    <p>One more pattern hides in the stack, and the ring around the spiral colours it for you.
    However many pure fifths you pile up, they cut the octave into steps of at most
    <em>three</em> different sizes, and when there are three, the largest is exactly the sum of
    the other two. Hugo Steinhaus conjectured it; Vera T. Sós, János Surányi and Stanisław
    Świerczkowski proved it independently in the late 1950s. At 3, 5, 7 and 12 notes the count
    drops to two, and again at 17, 29, 41 and 53, and those are the moments a pile of fifths
    deserves the name <em>scale</em>. Then watch one note further. The thirteenth, B<sup class="fifths-acc">♯</sup>, splits a
    semitone into a limma and a sliver of exactly 23.46 cents: the error that kept twelve from
    closing becomes the smallest step of thirteen. Each of these scales hands its miss on in
    the same way, down to the 3.6 cents by which fifty-three fails, which becomes the newest
    step of fifty-four. The same two-step evenness spaces the strokes of
    <a href="#ex-euclid">Euclidean rhythms</a>, and the three gaps return, uninvited, at
    <a href="#ex-golden">the golden angle</a>.</p>`;

const TODAY = `
    <p>The spiral never closed, so every working musician still stands somewhere on it. A piano
    tuner setting the temperament listens for each shaved fifth’s slow beat: at concert pitch,
    A3 against E4 wavers about three times in four seconds. String players make the opposite
    choice. A violist or cellist who tunes the open strings in pure fifths down from the
    orchestra’s A arrives at a low C a quarter of a comma, about six cents, beneath the
    piano’s, so the viola’s C and the piano’s disagree. Fifty-three has found work too: in
    Turkish makam music, a 2009 study reports, reckoning the whole tone as nine
    commas and the octave as fifty-three has spread among traditionalist musicians in recent
    decades.</p>
    <p>The mathematics keeps moving. In a paper published in 2022, Alan Haynes and Jens Marklof
    proved that the same construction in two dimensions leaves at most <em>five</em> distances between nearest
    neighbours; in three their bound is thirteen, and they conjecture nine. The question “why 5,
    7 and 12?” keeps being rediscovered: a derivation posted to arXiv in December 2025 turned
    out, as its authors now note, to retrace the theory of well-formed scales that Norman Carey
    and David Clampitt published in 1989. And the circle has gone to work. Multiply
    instead of add, and the orbit of a number modulo <em>N</em> becomes the hidden rhythm that
    <a href="#ex-shor">Shor’s algorithm</a> finds with a quantum computer and reads off with a
    continued fraction, the same machine that found 7/12.</p>`;

const LEGEND = `
    <p>The <em>Lüshi chunqiu</em> tells how the Yellow Emperor ordered Ling Lun to bring order
    to music. Ling Lun went into the mountains, gathered bamboo with thick and even nodes, and
    blew one pipe whose sound pleased him; he named it the Yellow Bell, <em>huangzhong</em>, the
    lowest of the twelve pitches. Then he heard phoenixes singing in the valley, the male six
    tones and the female six, and cut a pipe to match each. No phoenix sang them. The arithmetic
    of adding and subtracting thirds did, and the story’s two sets of six echo the method’s two
    moves, a third taken away and a third added back.</p>
    <p>A newer legend says Pythagoras drew the circle of fifths. No drawing of it is known
    before those in Diletskii’s <em>Grammatika</em>, from the late 1670s. Tuning by fifths is
    ancient; the wheel of keys is baroque.</p>`;

const SPECULATION = `
    <p>Is the chromatic twelve invented or discovered? The arithmetic is discovered: nothing
    about <code>7/12</code> was ever up to us, and anyone, anywhere, who stacked pure fifths
    would find the same resting places at 5, 7 and 12, and the same near-closure at 53. But the
    decision to build a scale from fifths at all, rather than from the upper harmonics, from
    equal steps, or from whatever a village’s gongs happen to sound, is a choice, and many
    traditions have made other ones. The spiral tells us where a builder of fifths must stop.
    It cannot tell us that anyone must build with fifths.</p>`;

const CAPTION_CIRCLE = `<b>Circle</b>: the walk of a step around ℤ/12ℤ, its cosets in their
    own colours; tap a note to start there, or a bar to change the step. Under the bars each
    step is joined to <em>7k</em>, the step it becomes once the notes are arranged by fifths: the
    even steps keep their figures, and each odd one trades places with the step a tritone
    away.`;
const CAPTION_SPIRAL = `<b>Spiral</b>: fifths stacked outward, one turn of the faint track per
    octave. The hollow point is where the next fifth would land and the crimson wedge is its
    miss; the ring and the strip colour the step sizes, largest gold, then azure, then crimson.
    The chart plots how far <em>q</em> fifths land from a whole number of octaves, on a
    square-root scale; drag across it to choose a stack.`;

// Margin notes for particular stacks of pure fifths (checked arithmetic; see header).
const MARGIN = {
  5: 'Five: three whole tones and two minor thirds, the pentatonic scale.',
  7: 'Seven: five whole tones and two limmas, the diatonic scale.',
  12: 'Twelve: seven limmas and five apotomes, the Pythagorean chromatic scale. The twelfth fifth, B<sup class="fifths-acc">♯</sup>, misses C by the comma.',
  13: 'Thirteen: B<sup class="fifths-acc">♯</sup> has split the apotome C–C<sup class="fifths-acc">♯</sup> into a comma and a limma. Three sizes, and the largest is the sum of the other two.',
  17: 'Seventeen: twelve limmas and five commas. Ṣafī al-Dīn al-Urmawī, in thirteenth-century Baghdad, set out a Pythagorean octave of seventeen steps in his <em>Kitāb al-Adwār</em>.',
  53: 'Fifty-three: forty-one commas and twelve steps of 19.84¢. The next fifth misses C by only 3.62¢, the interval later called Mercator’s comma.',
};

const SOURCES = [
  { text: 'Andrew Barker (ed. and trans.), <em>Greek Musical Writings</em>, vol. II: <em>Harmonic and Acoustic Theory</em> (Cambridge University Press, 1989), “The Euclidean <em>Sectio canonis</em>”', url: 'https://www.cambridge.org/core/books/abs/greek-musical-writings/euclidean-sectio-canonis/BB386D8812D97E70453550F83CE7C110' },
  { text: 'Jonathan Service, “Chinese Music Theory”, <em>Sounding China</em>, Harvard University', url: 'https://soundingchina.fas.harvard.edu/Service.html' },
  { text: 'Ernest G. McClain and Ming Shui Hung, “Chinese Cyclic Tunings in Late Antiquity”, <em>Ethnomusicology</em> 23(2) (1979): 205–224', url: 'https://doi.org/10.2307/851462' },
  { text: 'Alexander Rehding, “Fine-Tuning a Global History of Music Theory: Divergences, Zhu Zaiyu, and Music-Theoretical Instruments”, <em>Music Theory Spectrum</em> 44(2) (2022): 260–275', url: 'https://doi.org/10.1093/mts/mtac004' },
  { text: 'Daniel Muzzulini, “Isaac Newton’s Microtonal Approach to Just Intonation”, <em>Empirical Musicology Review</em> 15(3–4) (2021): 223–248', url: 'https://doi.org/10.18061/emr.v15i3-4.7647' },
  { text: 'Claudia R. Jensen, “A Theoretical Work of Late Seventeenth-Century Muscovy: Nikolai Diletskii’s <em>Grammatika</em> and the Earliest Circle of Fifths”, <em>Journal of the American Musicological Society</em> 45(2) (1992): 305–331', url: 'https://doi.org/10.2307/831450' },
  { text: 'Norman Carey and David Clampitt, “Aspects of Well-Formed Scales”, <em>Music Theory Spectrum</em> 11(2) (1989): 187–206', url: 'https://doi.org/10.2307/745935' },
  { text: 'Alan Haynes and Jens Marklof, “A Five Distance Theorem for Kronecker Sequences”, <em>International Mathematics Research Notices</em> 2022(24): 19747–19789', url: 'https://doi.org/10.1093/imrn/rnab205' },
  { text: 'Barış Bozkurt, Ozan Yarman, M. Kemal Karaosmanoğlu and Can Akkoç, “Weighing Diverse Theoretical Models on Turkish Maqam Music Against Pitch Measurements”, <em>Journal of New Music Research</em> 38(1) (2009): 45–70', url: 'https://doi.org/10.1080/09298210903147673' },
  { text: 'Emily Clader and Vanessa Jelmyer, “The Two-Step Property and the Mathematics of Musical Scale Size”, arXiv:2512.09956 (2025, revised 2026)', url: 'https://arxiv.org/abs/2512.09956' },
];

const CHRONICLE = [
  { year: -300, date: 'c. 300 BCE', text: 'The <em>Division of the Canon</em>, a Greek treatise handed down under Euclid’s name, proves that six whole tones of 9:8 exceed an octave: 531441 against 524288, the Pythagorean comma as a theorem.' },
  { year: -239, date: 'c. 239 BCE', text: 'The <em>Lüshi chunqiu</em>, compiled under the Qin chancellor Lü Buwei, generates China’s twelve pitch-pipes one from another by adding or removing a third of a pipe’s length.' },
  { year: -45, date: '1st century BCE', text: 'The Han music theorist Jing Fang extends the cycle of fifths to sixty notes and finds that fifty-three fifths come within a hair of thirty-one octaves.' },
  { year: 1584, date: '1584', text: 'The Ming prince Zhu Zaiyu publishes an exact twelvefold equal division of the octave in his <em>Lüxue xinshuo</em>.' },
  { year: 1665, date: '1665', text: 'Isaac Newton, aged twenty-two, tests fourteen equal divisions of the octave, 53 and 612 among them, in the ‘Of Musick’ pages of a Cambridge notebook.' },
  { year: 1677, date: '1677', text: 'In Smolensk, Nikolai Diletskii writes the first surviving version of his <em>Grammatika</em>, a Russian treatise on composition whose circles of fifths are the earliest known.' },
  { year: 1958, date: 'late 1950s', text: 'Vera T. Sós, János Surányi and Stanisław Świerczkowski independently prove Hugo Steinhaus’s conjecture: mark the first <em>N</em> multiples of any angle on a circle, and the arcs between them come in at most three lengths.' },
  { year: 2022, date: '2022', text: 'Alan Haynes and Jens Marklof publish a five-distance theorem, the three-gap theorem’s counterpart in two dimensions.' },
];

/* =========================================================================
   The exhibit
   ========================================================================= */

export default {
  id: 'fifths',
  movement: 2,
  title: 'The Spiral of Fifths',
  hook: 'Twelve steps that never quite come home.',
  era: 'c. 300 BCE – today · Greece, Qin and Han China, Smolensk, Cambridge',
  prose: PROSE,
  chronicle: CHRONICLE,
  today: TODAY,
  sources: SOURCES,
  alt: 'Twelve notes on a circle joined by the star of fifths, which unrolls into a spiral of stacked fifths whose ends miss by the Pythagorean comma, beside a strip of the scale’s step sizes and a chart of how nearly each stack of fifths closes.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    let SERIF = 'Georgia, serif';
    const readSerif = () => { try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep */ } };
    readSerif();

    const style = document.createElement('style');
    style.textContent = `
      #ex-fifths .fifths-caption b { font-weight: 400; font-style: normal; font-variant-caps: all-small-caps; letter-spacing: .08em; color: var(--ink); }
      #ex-fifths .fifths-margin { display: block; margin-top: .45rem; color: var(--ink); }
      #ex-fifths .fifths-margin:empty { display: none; }
      #ex-fifths .fifths-row-2 { margin-top: .2rem; }
      #ex-fifths sup.fifths-acc { font-size: .74em; vertical-align: .38em; line-height: 0; margin-left: -.04em; }
      #ex-fifths .fifths-fifth .ctl-value { min-width: 11.5em; }
      #ex-fifths canvas { cursor: default; }`;
    stage.appendChild(style);

    /* ---------- state ---------- */
    let mode = 'circle';          // 'circle' | 'spiral'
    let modeT = 0;                // 0 circle … 1 spiral (tweened)
    let k = 7, start = 0;
    let arranged = false, arrT = 0;
    let N = 12;                   // notes in the stack (spiral)
    let fifth = PURE_FIFTH;
    let uShown = N * fifth / 1200; // displayed spiral length in turns (tweened toward N·s)
    let dirty = true;

    // playback: events are consumed against the audio clock (never frame counts)
    let scheduler = null;
    let queue = [];               // { at, ph }
    let ph = null;                // current playhead: { kind, i, pc?, n?, ghost? }
    let seqEnd = -1;              // audio time the last note ends
    let missOn = false, voiceLo = null, voiceHi = null;

    const bus = audio.createBus('fifths');

    /* ---------- canvas ---------- */
    const pad = (el) => { try { const cs = getComputedStyle(el); return parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0); } catch { return 0; } };
    const canvasOpts = { height: heightFor((stage.clientWidth || 800) - pad(stage)) };
    const handle = cv.setupCanvas(stage, canvasOpts);
    const cvs = handle.canvas;
    cvs.style.touchAction = 'pan-y';          // let a phone scroll past; horizontal drags still reach us
    cvs.setAttribute('role', 'img');
    let lay = computeLayout(handle.width, handle.height);
    let heightRaf = 0;
    handle.onResize((w) => {
      // Height follows width. Changing it inside the ResizeObserver callback would trip a
      // "ResizeObserver loop" error, so it waits one frame; the observer then re-runs setup.
      const want = heightFor(w);
      if (Math.abs(want - canvasOpts.height) > 1 && !heightRaf) {
        heightRaf = requestAnimationFrame(() => {
          heightRaf = 0;
          const now = heightFor(handle.width);
          if (Math.abs(now - canvasOpts.height) > 1) { canvasOpts.height = now; cvs.style.height = now + 'px'; }
        });
      }
      readSerif();
      lay = computeLayout(handle.width, handle.height);
      dirty = true;
    });

    const glowGold = cv.glowSprite(P.goldBright, 44);
    const glowCrimson = cv.glowSprite(P.crimsonBright || P.crimson, 34);
    const glowAzure = cv.glowSprite(P.azure, 30);

    /* ---------- controls ---------- */
    const row1 = ui.controlRow(stage);
    const modeBtn = ui.button(row1, 'unroll into pure fifths', () => setMode(mode === 'circle' ? 'spiral' : 'circle'), { primary: true });
    const playBtn = ui.button(row1, '▶ play the orbit', () => (mode === 'circle' ? playOrbit() : playStack()));
    const scaleBtn = ui.button(row1, '▶ play as a scale', playScale);
    const missBtn = ui.button(row1, '♬ sound the miss', toggleMiss);
    missBtn.setAttribute('aria-pressed', 'false');

    const row2 = ui.controlRow(stage);
    row2.classList.add('fifths-row-2');
    const genStep = ui.stepper(row2, {
      label: 'step (semitones)', min: 1, max: 11, value: k,
      onChange: (v) => { k = v; stopSeq(); refresh(); },
    });
    const startSel = ui.select(row2, {
      label: 'start on', value: '0',
      options: NOTE_NAMES.map((nm, i) => ({ value: String(i), label: nm })),
      onChange: (v) => { start = +v; stopSeq(); refresh(); },
    });
    const arrToggle = ui.toggle(row2, {
      label: 'arrange by fifths', value: false,
      onChange: (v) => { arranged = v; if (reduced) arrT = v ? 1 : 0; refresh(); },
    });
    const notesSlider = ui.slider(row2, {
      label: 'notes in the stack', min: 2, max: 53, step: 1, value: N,
      format: (v) => `${v}`,
      onInput: (v) => setN(v),
    });
    const fifthSlider = ui.slider(row2, {
      label: 'size of the fifth', min: FIFTH_MIN, max: FIFTH_MAX, step: 0.005, value: fifth,
      format: (v) => { const p = presetFor(v, 0.003); return `${v.toFixed(2)}¢` + (p ? ` · ${p.label}` : ''); },
      onInput: (v) => {
        const p = PRESETS.find((q) => Math.abs(q.cents - v) < 0.06);   // gentle detents
        setFifth(p ? p.cents : v, !!p);                                  // a detent names its tuning
      },
    });
    fifthSlider.el.classList.add('fifths-fifth');
    const tuneSel = ui.select(row2, {
      label: 'tuning', value: 'pure',
      options: [...PRESETS.map((p) => ({ value: p.key, label: p.label })), { value: 'custom', label: 'between tunings' }],
      onChange: (v) => { const p = PRESETS.find((q) => q.key === v); if (p) setFifth(p.cents, true); },
    });
    // the "between tunings" entry exists only to be displayed, never chosen
    const customOpt = tuneSel.select.querySelector('option[value="custom"]');
    if (customOpt) customOpt.disabled = true;

    const info = ui.readout(stage, '');
    info.el.setAttribute('aria-live', 'polite');
    const cap = ui.caption(stage, '');
    cap.classList.add('fifths-caption');
    const capBody = document.createElement('span');
    cap.appendChild(capBody);
    const margin = document.createElement('span');
    margin.className = 'fifths-margin';
    cap.appendChild(margin);
    ui.legendPanel(stage, LEGEND);
    ui.speculationPanel(stage, SPECULATION, 'discovered, or chosen?');

    function setMode(m) {
      if (m === mode) return;
      mode = m;
      stopSeq(); stopMiss();
      if (reduced) modeT = mode === 'spiral' ? 1 : 0;
      if (mode === 'spiral') uShown = reduced ? N * fifth / 1200 : uShown;
      refresh();
    }
    function setN(v) {
      v = Math.max(2, Math.min(53, Math.round(v)));
      if (v === N) return;
      N = v;
      if (reduced) uShown = N * fifth / 1200;
      stopSeq();
      if (+notesSlider.value !== N) notesSlider.set(N);
      refresh();
    }
    function setFifth(c, fromSelect) {
      fifth = Math.max(FIFTH_MIN, Math.min(FIFTH_MAX, c));
      uShown = N * fifth / 1200;
      stopSeq();
      if (fromSelect) fifthSlider.set(fifth);
      refresh();
    }

    /* ---------- readouts, aria, margin notes ---------- */
    function refresh() {
      const inCircle = mode === 'circle';
      modeBtn.textContent = inCircle ? 'unroll into pure fifths' : 'close back into a circle';
      playBtn.textContent = inCircle ? '▶ play the orbit' : '▶ play the stack';
      scaleBtn.style.display = inCircle ? 'none' : '';
      missBtn.style.display = inCircle ? 'none' : '';
      genStep.el.style.display = inCircle ? '' : 'none';
      startSel.el.style.display = inCircle ? '' : 'none';
      arrToggle.el.style.display = inCircle ? '' : 'none';
      notesSlider.el.style.display = inCircle ? 'none' : '';
      fifthSlider.el.style.display = inCircle ? 'none' : '';
      tuneSel.el.style.display = inCircle ? 'none' : '';
      startSel.set(String(start));
      const capHTML = inCircle ? CAPTION_CIRCLE : CAPTION_SPIRAL;
      if (capBody.dataset.mode !== mode) { capBody.dataset.mode = mode; capBody.innerHTML = capHTML; }
      const pre = presetFor(fifth, 0.003);
      tuneSel.set(pre ? pre.key : 'custom');

      let text, aria;
      if (inCircle) {
        const f = figureOf(k), g = f.g;
        const shown = arranged ? mod(7 * k, 12) : k;
        const line1 = `step ${k} · gcd(${k}, 12) = ${g}`;
        const line2 = g === 1
          ? `one orbit through all twelve notes: ${orbitFamily(k)}`
          : `trapped: ${NUMBER_WORDS[g]} orbits of ${12 / g}, ${orbitFamily(k)}`;
        const line3 = arranged
          ? `arranged by fifths, 7 × ${k} = ${7 * k}${7 * k >= 12 ? ` ≡ ${mod(7 * k, 12)}` : ''}: the walk draws ${figureName(shown)}`
          : `drawn on the chromatic circle, the walk is ${figureName(k)}`;
        text = `${line1}\n${line2}\n${line3}`;
        aria = `Circle of twelve notes, ${arranged ? 'arranged by fifths' : 'in chromatic order'}. Stepping by ${k} from ${NOTE_NAMES[start]} gives ${orbitFamily(k)}; the walk draws ${figureName(shown)}.`;
        margin.textContent = '';
      } else {
        const gs = gapStructure(N, fifth), d = drift(N, fifth);
        const pre2 = presetFor(fifth, 0.003);
        const tuningWord = pre2 && pre2.key === 'pure' ? `${N - 1} pure fifths`
          : `${N - 1} fifths of ${fifth.toFixed(2)}¢` + (pre2 ? ` (${pre2.label.replace(' (', ', ').replace(')', '')})` : '');
        const nDistinct = gs.distinct.length;
        const sizesWord = gs.sizes.length === 1 ? 'one step size' : `${NUMBER_WORDS[gs.sizes.length]} step sizes`;
        const line1 = `${N} notes from ${tuningWord}` +
          (nDistinct < N ? ` · only ${nDistinct} distinct` : '') + ` · ${sizesWord}` +
          (gs.sizes.length === 2 ? ', a scale' : '');
        let line2, line3;
        if (Math.abs(d) < 0.005) {
          const oct = Math.round(N * fifth / 1200);
          line2 = `the ${ordinal(N)} fifth lands exactly on C: ${N} fifths make ${oct} octaves, and the spiral closes`;
          line3 = 'no beat: the ends meet';
        } else {
          const name = N === 12 && pre2 && pre2.key === 'pure' ? ': the Pythagorean comma, 531441/524288'
            : N === 53 && pre2 && pre2.key === 'pure' ? ': Mercator’s comma, 3⁵³/2⁸⁴' : '';
          line2 = `the ${ordinal(N)} fifth lands ${Math.abs(d).toFixed(2)}¢ ${d > 0 ? 'above' : 'below'} C${name}`;
          // past about fifteen a second a beat stops sounding like one and turns to roughness
          const bh = beatHz(d);
          line3 = bh < 15 ? `against C4 it beats ${bh.toFixed(2)} times a second`
            : `against C4 the two differ by ${bh.toFixed(1)} Hz, too fast to hear as a beat`;
        }
        text = `${line1}\n${line2}\n${line3}`;
        aria = `Spiral of ${N} stacked fifths of ${fifth.toFixed(2)} cents. The next fifth lands ${Math.abs(d).toFixed(2)} cents ${d >= 0 ? 'above' : 'below'} the starting C. The octave is cut into ${sizesWord}.`;
        margin.innerHTML = pre2 && pre2.key === 'pure' ? (MARGIN[N] || '') : '';
      }
      info.set(text);
      cvs.setAttribute('aria-label', aria);
      if (missOn) updateMiss();
      dirty = true;
    }

    /* ---------- audio ---------- */
    function stopSeq() {
      if (scheduler) { scheduler.stop(); scheduler = null; }
      queue = []; ph = null; seqEnd = -1; dirty = true;
    }
    function runSeq(events) {
      audio.ensureAudio();
      stopSeq();
      let i = 0;
      scheduler = audio.createScheduler((t) => {
        if (i >= events.length) return null;
        const ev = events[i++];
        for (const [f, lv] of ev.tones) {
          audio.playTone(bus, { freq: f, dur: ev.dur, level: lv, type: ev.type || 'triangle', when: t, attack: 0.012, release: 0.14 });
        }
        queue.push({ at: t, ph: ev.ph });
        seqEnd = t + ev.dur;
        return t + ev.gap;
      });
      scheduler.start();
      dirty = true;
    }
    const pcFreq = (pc) => C4 * Math.pow(2, pc / 12);
    const centsFreq = (c) => C4 * Math.pow(2, c / 1200);

    function playOrbit() {
      const o = orbit(k, start);
      const events = [];
      for (let i = 0; i <= o.length; i++) {
        const pc = o[i % o.length];
        events.push({ tones: [[pcFreq(pc), 0.34]], dur: 0.34, gap: 0.27, ph: { kind: 'orbit', i, pc } });
      }
      runSeq(events);
    }
    function playStack() {
      const step = N > 24 ? 0.12 : N > 12 ? 0.17 : 0.24;
      const events = [];
      for (let n = 0; n < N; n++) {
        events.push({ tones: [[centsFreq(fifthCents(n, fifth)), 0.3]], dur: step * 1.35, gap: step, ph: { kind: 'stack', n } });
      }
      // the next fifth, then it and C together: the miss, heard
      const d = drift(N, fifth), gc = centsFreq(d);
      events.push({ tones: [[gc, 0.3]], dur: 0.5, gap: 0.55, ph: { kind: 'stack', n: N, ghost: true } });
      events.push({ tones: [[C4, 0.26], [gc, 0.26]], dur: 2.4, gap: 2.4, type: 'sine', ph: { kind: 'stack', n: N, ghost: true, both: true } });
      runSeq(events);
    }
    function playScale() {
      const gs = gapStructure(N, fifth);
      const seen = [];
      for (const x of gs.notes) if (!seen.length || x.c - seen[seen.length - 1].c > 1e-6) seen.push(x);
      const step = seen.length > 24 ? 0.11 : seen.length > 12 ? 0.15 : 0.23;
      const events = seen.map((x, i) => ({ tones: [[centsFreq(x.c), 0.3]], dur: step * 1.35, gap: step, ph: { kind: 'scale', n: x.n, i } }));
      events.push({ tones: [[C4 * 2, 0.3]], dur: 0.6, gap: 0.6, ph: { kind: 'scale', n: 0, i: seen.length, octave: true } });
      runSeq(events);
    }
    function updateMiss() {
      if (!voiceLo) return;
      voiceLo.setFreq(C4, 0.06);
      voiceHi.setFreq(centsFreq(drift(N, fifth)), 0.06);
    }
    function toggleMiss() {
      audio.ensureAudio();
      if (missOn) { stopMiss(); return; }
      missOn = true;
      missBtn.classList.add('active');
      missBtn.setAttribute('aria-pressed', 'true');
      voiceLo = audio.voice(bus, { freq: C4, level: 0.26, type: 'sine' });
      voiceHi = audio.voice(bus, { freq: centsFreq(drift(N, fifth)), level: 0.26, type: 'sine' });
      voiceLo.on(); voiceHi.on();
      dirty = true;
    }
    function stopMiss() {
      missOn = false;
      missBtn.classList.remove('active');
      missBtn.setAttribute('aria-pressed', 'false');
      if (voiceLo) { voiceLo.dispose(); voiceHi.dispose(); voiceLo = voiceHi = null; }
      dirty = true;
    }

    /* ---------- drawing helpers ---------- */
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const hexA = (hex, a) => {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
    };
    // Coset colours. The fifth and sixth appear only for step 6 (six tritones); dim gold and
    // dim azure read as faded copies of the first two, so verdigris and parchment take them.
    const HUES = [P.gold, P.azure, P.crimsonBright || P.crimson, P.verdant, P.verdigris || '#62b3a4', P.inkDim];
    // Small canvas text: the page's --ink-faint (5.3:1 on the stage), not the palette's
    // older inkFaint (3.6:1), which stays for bars and hairlines.
    const FAINT = '#8a8676';
    const GAP_HUES = [P.gold, P.azure, P.crimsonBright || P.crimson];
    const hasCaps = 'fontVariantCaps' in (handle.ctx || {});
    const hasSpacing = 'letterSpacing' in (handle.ctx || {});

    function setFont(ctx, px, family, extra = '') { ctx.font = `${extra}${extra ? ' ' : ''}${Math.max(1, px)}px ${family}`; }
    // Returns the width set; with draw = false it only measures.
    function smallCaps(ctx, text, x, y, color, align = 'left', px = 12, draw = true) {
      ctx.save();
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      if (hasSpacing) ctx.letterSpacing = '1.6px';
      let t = text;
      if (hasCaps) { setFont(ctx, px + 1, SERIF); ctx.fontVariantCaps = 'all-small-caps'; }
      else { setFont(ctx, Math.round(px * 0.82), SERIF); t = text.toUpperCase(); }
      if (draw) ctx.fillText(t, x, y);
      const wdt = ctx.measureText(t).width;
      ctx.restore();
      return wdt;
    }
    // A small-caps heading with a status line: beside it when there is room, under it when not.
    // Returns the extra height used (17 when the status drops a line); draw = false measures.
    function heading(ctx, title, status, color, font, x, y, w, draw = true) {
      const tw = smallCaps(ctx, title, x, y, P.inkDim, 'left', 12, draw);
      ctx.save();
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
      const sw = ctx.measureText(status).width;
      const fits = tw + sw + 18 <= w;
      ctx.textAlign = fits ? 'right' : 'left';
      if (draw) ctx.fillText(status, fits ? x + w : x, fits ? y : y + 17);
      ctx.restore();
      return fits ? 0 : 17;
    }
    const nodeAngle = (pc) => {
      const a0 = pc / 12, a1 = mod(7 * pc, 12) / 12;
      let d = a1 - a0; d -= Math.round(d);
      return (a0 + d * ease(arrT)) * TAU - Math.PI / 2;
    };
    const centsAngle = (c) => (c / 1200) * TAU - Math.PI / 2;

    let bgGrad = null, bgKey = '';
    function background(ctx, W, H) {
      const key = `${W}x${H}x${lay.cx}`;
      if (key !== bgKey) {
        bgKey = key;
        bgGrad = ctx.createRadialGradient(lay.cx, lay.cy, 0, lay.cx, lay.cy, lay.R * 1.35);
        bgGrad.addColorStop(0, 'rgba(125,167,217,0.055)');
        bgGrad.addColorStop(0.6, 'rgba(125,167,217,0.02)');
        bgGrad.addColorStop(1, 'rgba(125,167,217,0)');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      if (lay.wide) {               // a hairline between the figure and its commentary
        const x = Math.round(lay.panel.x - 13) + 0.5;
        const g = ctx.createLinearGradient(0, 24, 0, H - 24);
        g.addColorStop(0, 'rgba(42,46,63,0)'); g.addColorStop(0.5, 'rgba(58,63,85,0.9)'); g.addColorStop(1, 'rgba(42,46,63,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, H - 28); ctx.stroke();
      }
    }

    // A note name set like an engraver would: the accidental smaller, raised and tucked in,
    // since the book face has no ♯ or ♭ of its own and the fallback glyphs sit loose.
    // An optional halo (the inset background) keeps a label legible where it crosses lines.
    function noteText(ctx, name, x, y, px, align = 'center', italic = false, halo = '') {
      const letter = name[0], acc = name.slice(1);
      const saved = ctx.textAlign;
      setFont(ctx, px, SERIF, italic ? 'italic' : '');
      const wL = ctx.measureText(letter).width;
      let wA = 0;
      const ap = Math.max(1, Math.round(px * 0.8));
      if (acc) { setFont(ctx, ap, SERIF); wA = ctx.measureText(acc).width; }
      const kern = acc ? px * 0.04 : 0;
      const total = wL + (acc ? wA - kern : 0);
      const xs = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
      const put = (s, xx, yy) => {
        if (halo) { ctx.save(); ctx.strokeStyle = halo; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeText(s, xx, yy); ctx.restore(); }
        ctx.fillText(s, xx, yy);
      };
      ctx.textAlign = 'left';
      setFont(ctx, px, SERIF, italic ? 'italic' : '');
      put(letter, xs, y);
      if (acc) { setFont(ctx, ap, SERIF); put(acc, xs + wL - kern, y - px * 0.24); }
      ctx.textAlign = saved;
      return total;
    }

    function rimLabels(ctx, alpha, angleOf, colorOf) {
      const { cx, cy, R } = lay;
      const px = R < 110 ? 12 : 13;
      ctx.textBaseline = 'middle';
      for (let pc = 0; pc < 12; pc++) {
        const a = angleOf(pc), rr = R + (R < 110 ? 17 : 21);
        ctx.fillStyle = hexA(colorOf(pc), alpha);
        noteText(ctx, NOTE_NAMES[pc], cx + rr * Math.cos(a), cy + rr * Math.sin(a) + 0.5, px);
      }
    }

    /* ---------- the circle ---------- */
    function drawCircle(ctx, alpha) {
      if (alpha <= 0.002) return;
      const { cx, cy, R } = lay;
      const pos = (pc) => { const a = nodeAngle(pc); return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
      const cos = cosets(k, start);
      const playing = ph && ph.kind === 'orbit';
      const curPc = playing ? ph.pc : -1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      // other cosets first, in their own colours
      for (let ci = cos.length - 1; ci >= 1; ci--) {
        const o = cos[ci], hue = HUES[ci % HUES.length];
        ctx.strokeStyle = hexA(hue, 0.55); ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let i = 0; i <= o.length; i++) { const [x, y] = pos(o[i % o.length]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }

      // the main orbit: a faint fill, a glow underlay and the gold line
      const o = cos[0];
      const path = (upto) => {
        ctx.beginPath();
        for (let i = 0; i <= upto; i++) { const [x, y] = pos(o[i % o.length]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      };
      if (o.length >= 3) { path(o.length); ctx.fillStyle = 'rgba(201,169,89,0.045)'; ctx.fill('evenodd'); }
      if (playing) {
        path(o.length); ctx.strokeStyle = hexA(P.goldDim, 0.55); ctx.lineWidth = 1; ctx.stroke();
      }
      const lit = playing ? Math.min(ph.i, o.length) : o.length;
      if (lit > 0) {
        path(lit);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(232,200,124,0.13)'; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = P.gold; ctx.lineWidth = playing ? 1.8 : 1.5; ctx.stroke();
      }

      // nodes
      const inMain = new Set(o);
      const cosetOf = new Map();
      cos.forEach((c, ci) => c.forEach((pc) => cosetOf.set(pc, ci)));
      for (let pc = 0; pc < 12; pc++) {
        const [x, y] = pos(pc);
        if (pc === start) {
          ctx.strokeStyle = hexA(P.azure, 0.9); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke();
        }
        if (pc === curPc) { glowGold.draw(ctx, x, y, 1); }
        ctx.fillStyle = pc === curPc ? P.goldBright : inMain.has(pc) ? P.ink : HUES[cosetOf.get(pc) % HUES.length];
        ctx.beginPath(); ctx.arc(x, y, pc === curPc ? 5.2 : 3.6, 0, TAU); ctx.fill();
      }
      rimLabels(ctx, 1, nodeAngle, (pc) => (pc === curPc ? P.goldBright : inMain.has(pc) ? P.ink : P.inkDim));
      ctx.restore();
    }

    /* ---------- the spiral ---------- */
    function drawSpiral(ctx, alpha, reveal) {
      if (alpha <= 0.002) return;
      const { cx, cy, R } = lay;
      const s = fifth / 1200;
      const U = Math.max(1e-6, uShown);
      const r0 = R * 0.14, rMax = R - 13;
      const rad = (u) => r0 + (rMax - r0) * Math.min(1.2, u / U);
      const at = (u) => { const a = u * TAU - Math.PI / 2, r = rad(u); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
      const uEnd = N * s * reveal;
      const gs = gapStructure(N, fifth);
      const d = drift(N, fifth);
      const closes = Math.abs(d) < 0.005;
      const curN = ph && (ph.kind === 'stack' || ph.kind === 'scale') ? ph.n : -1;
      const playedTo = ph && ph.kind === 'stack' ? ph.n : -1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // pitch circle and the start ray
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([3, 5]); ctx.strokeStyle = hexA(P.azureDim, 0.9);
      ctx.beginPath(); ctx.moveTo(cx, cy - r0 * 0.4); ctx.lineTo(cx, cy - R - 4); ctx.stroke();
      ctx.setLineDash([]);

      // the miss: a wedge from C to where the next fifth lands
      if (reveal > 0.98 && !closes) {
        const a0 = -Math.PI / 2, a1 = centsAngle(d), ccw = d < 0;
        ctx.fillStyle = 'rgba(192,91,77,0.10)';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1, ccw); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(217,122,104,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(a1), cy + R * Math.sin(a1)); ctx.stroke();
        ctx.strokeStyle = P.crimsonBright || P.crimson; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy, R + 7, a0, a1, ccw); ctx.stroke();
        ctx.lineCap = 'butt';
      }

      // Steinhaus's ring: every step coloured by its size class
      if (reveal > 0.98) {
        const minPad = 1.2 / R;
        ctx.lineWidth = 3.4;
        for (const g of gs.gaps) {
          const span = (g.size / 1200) * TAU;
          const padA = Math.min(span * 0.28, minPad);
          if (span - 2 * padA <= 0) continue;
          ctx.strokeStyle = hexA(GAP_HUES[Math.min(2, g.cls)], 0.88);
          ctx.beginPath(); ctx.arc(cx, cy, R, centsAngle(g.from) + padA, centsAngle(g.from) + span - padA); ctx.stroke();
        }
      }

      // the pitch track: one turn per octave, so a note's height is its distance out
      const stepsPerTurn = 96;
      ctx.lineJoin = 'round';
      if (uEnd > 0) {
        const m = Math.max(2, Math.ceil(uEnd * stepsPerTurn));
        ctx.beginPath();
        for (let i = 0; i <= m; i++) { const [x, y] = at((uEnd * i) / m); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        // many turns would read as a moiré, so the track fades as it lengthens
        ctx.strokeStyle = hexA(P.azureDim, 0.32 * Math.min(1, Math.sqrt(12 / Math.max(1, uEnd)))); ctx.lineWidth = 1; ctx.stroke();
      }
      // the fifths themselves, as chords: the star of the circle, opened into a spiral
      const nVis = Math.min(N - 1, Math.floor(uEnd / Math.max(1e-9, s) + 1e-9));
      const chords = (upto) => {
        ctx.beginPath();
        for (let n = 0; n <= upto; n++) { const [x, y] = at(n * s); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      };
      if (nVis >= 1) {
        chords(nVis);
        ctx.strokeStyle = 'rgba(232,200,124,0.10)'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = hexA(P.gold, playedTo >= 0 ? 0.3 : 0.78); ctx.lineWidth = N > 30 ? 0.9 : 1.2; ctx.stroke();
        if (playedTo > 0) {
          chords(Math.min(playedTo, nVis));
          ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.6; ctx.stroke();
        }
      }
      // the last step, dashed, out to where the next fifth would land
      if (reveal > 0.98 && N >= 1) {
        const [ax, ay] = at((N - 1) * s), [bx, by] = at(N * s);
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = hexA(closes ? P.verdant : (P.crimsonBright || P.crimson), 0.8); ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
      }

      // tick marks on the ring: each note's shadow on the pitch circle
      if (reveal > 0.98) {
        ctx.strokeStyle = hexA(P.ink, 0.55); ctx.lineWidth = 1;
        ctx.beginPath();
        for (const c of gs.distinct) { const a = centsAngle(c); ctx.moveTo(cx + (R - 5) * Math.cos(a), cy + (R - 5) * Math.sin(a)); ctx.lineTo(cx + (R + 4) * Math.cos(a), cy + (R + 4) * Math.sin(a)); }
        ctx.stroke();
      }

      // the stacked notes
      const dotR = N > 30 ? 2.1 : N > 16 ? 2.6 : 3.2;
      for (let n = 0; n < N; n++) {
        const u = n * s;
        if (u > uEnd + 1e-9) break;
        const [x, y] = at(u);
        if (n === curN) glowGold.draw(ctx, x, y, 0.9);
        else if (n === 0) glowAzure.draw(ctx, x, y, 0.55);
        ctx.fillStyle = n === curN ? P.goldBright : n === 0 ? P.azure : (playedTo >= 0 && n > playedTo) ? P.inkDim : P.ink;
        ctx.beginPath(); ctx.arc(x, y, n === curN ? dotR + 1.6 : n === 0 ? dotR + 0.6 : dotR, 0, TAU); ctx.fill();
      }

      // the next fifth: hollow, crimson
      if (reveal > 0.98) {
        const [gx, gy] = at(N * s);
        const hot = ph && ph.ghost;
        if (hot) glowCrimson.draw(ctx, gx, gy, 1);
        ctx.strokeStyle = closes ? P.verdant : (P.crimsonBright || P.crimson); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gx, gy, hot ? 5.5 : 4.4, 0, TAU); ctx.stroke();
        // its Pythagorean name, set along the arc just past it (away from C) and a little
        // inside the ring, so it never collides with the rim's letters
        const nm = spelled(N);
        if (nm && !closes) {
          setFont(ctx, 12, SERIF, 'italic');
          const tw = ctx.measureText(nm).width;
          const rg = Math.hypot(gx - cx, gy - cy), rl = Math.max(0, rg - 12);
          const al = Math.atan2(gy - cy, gx - cx) + Math.sign(d) * (tw / 2 + 9) / Math.max(24, rl);
          ctx.fillStyle = P.crimsonBright || P.crimson; ctx.textBaseline = 'middle';
          noteText(ctx, nm, cx + rl * Math.cos(al), cy + rl * Math.sin(al) + 1, 12, 'center', true, 'rgba(9,10,14,0.92)');
        }
      }

      // equal-tempered names as a reference rim
      rimLabels(ctx, 1, (pc) => (pc / 12) * TAU - Math.PI / 2, (pc) => (pc === 0 ? P.ink : FAINT));

      // the size of the miss, beside C on the side it falls
      if (reveal > 0.98) {
        const yTop = cy - R - (R < 110 ? 17 : 21);
        setFont(ctx, R < 110 ? 11 : 12, MONO);
        ctx.textBaseline = 'middle';
        if (closes) {
          ctx.fillStyle = P.verdant; ctx.textAlign = 'left';
          ctx.fillText('closed', cx + 14, yTop);
        } else {
          ctx.fillStyle = P.crimsonBright || P.crimson;
          ctx.textAlign = d > 0 ? 'left' : 'right';
          ctx.fillText(`${signed(d)}¢`, cx + (d > 0 ? 14 : -14), yTop);
        }
      }
      ctx.restore();
    }

    /* ---------- the commentary panel ---------- */
    const stepChart = { x0: 0, x1: 0, y0: 0, y1: 0 };
    function drawCirclePanel(ctx, alpha) {
      if (alpha <= 0.002) return;
      const { x, y, w, h } = lay.panel;
      const wide = lay.wide;
      const cos = cosets(k, start);
      const L = cos[0].length;
      const playing = ph && ph.kind === 'orbit';
      const labelW = wide ? 50 : 30;
      // the last column repeats the start, to show the walk closing; a phone has no room
      // for it when the orbit is twelve long, and the return is implied
      const cols = (w - labelW) / (L + 1) < 21 && L > 6 ? L : L + 1;
      const colW = Math.max(10, Math.min(40, (w - labelW) / cols));
      const namePx = wide ? 14 : colW < 22 ? 11.5 : 12;
      const rows = 1 + cos.length;
      const mapH = wide ? 46 : 40;                          // the ×7 row under the bars
      const chartH = (wide ? 118 : 86) + mapH;              // "every step", anchored at the bottom
      const remarkH = wide ? 46 : 34;
      // rows shrink a little when six cosets have to share the space
      // the orbit's family name sits beside the heading, or under it on a phone when long
      const famFont = `italic ${wide ? 14 : 13}px ${SERIF}`;
      const famExtra = heading(ctx, 'the orbit, in order', orbitFamily(k), P.gold, famFont, x, 0, w, false);
      const rowH = Math.max(wide ? 21 : 18, Math.min(wide ? 27 : 23, (h - chartH - remarkH - 62 - famExtra) / rows));
      const tableH = 58 + famExtra + rows * rowH;
      const free = h - chartH - tableH - remarkH;
      const top = y + Math.max(0, free * 0.45);
      const showRemark = free > -4;

      ctx.save();
      ctx.globalAlpha = alpha;
      heading(ctx, 'the orbit, in order', orbitFamily(k), P.gold, famFont, x, top + 12, w);
      const y0 = top + 44 + famExtra;
      const colX = (i) => x + labelW + colW * (i + 0.5);
      // the column of the note sounding now
      if (playing) {
        const cxh = colX(ph.i >= cols ? 0 : ph.i);
        ctx.fillStyle = 'rgba(232,200,124,0.09)';
        ctx.fillRect(cxh - colW / 2 + 1, y0 - rowH * 0.6, colW - 2, rows * rowH + 2);
      }
      // row 0: the arithmetic, start + k·i mod 12
      setFont(ctx, wide ? 11.5 : 10.5, MONO);
      ctx.textAlign = 'right'; ctx.fillStyle = FAINT; ctx.textBaseline = 'middle';
      // start + k·i; on a phone "+ki" alone, since the first column already shows the start
      let rowLab = start ? `${start}+${k}i` : `${k}i`;
      if (start && ctx.measureText(rowLab).width > labelW - 10) rowLab = `+${k}i`;
      const rlw = ctx.measureText(rowLab).width;
      if (rlw > labelW - 10) setFont(ctx, (wide ? 11.5 : 10.5) * (labelW - 10) / rlw, MONO);
      ctx.fillText(rowLab, x + labelW - 8, y0);
      setFont(ctx, wide ? 11.5 : 10.5, MONO);
      ctx.textAlign = 'center';
      for (let i = 0; i < cols; i++) {
        ctx.fillStyle = i === L ? FAINT : P.inkDim;
        ctx.fillText(String(mod(start + k * i, 12)), colX(i), y0);
      }
      const ruleY = Math.round(y0 + rowH * 0.5) + 0.5;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + labelW - 4, ruleY); ctx.lineTo(x + labelW + colW * cols, ruleY); ctx.stroke();
      // one row of note names per coset
      cos.forEach((o, ci) => {
        const ry = y0 + rowH * (ci + 1) + 3;
        const hue = HUES[ci % HUES.length];
        ctx.fillStyle = hue;
        ctx.beginPath(); ctx.arc(x + labelW - 14, ry, 3, 0, TAU); ctx.fill();
        ctx.textAlign = 'center';
        for (let i = 0; i < cols; i++) {
          const pc = o[i % o.length];
          let col = ci === 0 ? P.ink : hue;
          if (i === L) col = FAINT;
          if (ci === 0 && playing) col = i === ph.i ? P.goldBright : i < ph.i ? P.gold : P.inkDim;
          ctx.fillStyle = col;
          noteText(ctx, NOTE_NAMES[pc], colX(i), ry, namePx);
        }
      });
      // a closing remark
      const g = gcd(k, 12);
      if (showRemark) {
        setFont(ctx, wide ? 13 : 12, SERIF, 'italic');
        ctx.fillStyle = P.inkDim; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        const remark = g === 1
          ? `${k} shares no factor with 12, so a single walk reaches all twelve notes.`
          : `${k} and 12 share the factor ${g}, so each walk closes after ${12 / g} notes.`;
        wrapText(ctx, remark, x, y0 + rowH * rows + (wide ? 26 : 20), w, 17);
      }

      // every step, and how many notes it reaches: only 1, 5, 7 and 11 reach them all
      const cy0 = y + h - chartH;
      smallCaps(ctx, wide ? 'every step, and the notes it reaches' : 'every step, and its reach', x, cy0 + 12, P.inkDim);
      const bx0 = x + labelW, bx1 = x + w;
      const by1 = y + h - 18 - mapH, byTop = cy0 + 30;
      const cw = (bx1 - bx0) / 11;
      const colK = (kk) => bx0 + cw * (kk - 0.5);
      stepChart.x0 = bx0; stepChart.x1 = bx1; stepChart.y0 = cy0 + 16; stepChart.y1 = y + h;
      setFont(ctx, wide ? 11 : 10, MONO);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const k7 = mod(7 * k, 12);
      for (let kk = 1; kk <= 11; kk++) {
        const len = 12 / gcd(kk, 12);
        const cxk = colK(kk);
        const bh = Math.max(2, (by1 - byTop - 12) * (len / 12));
        const bwk = Math.max(3, Math.min(14, cw * 0.42));
        const full = len === 12, cur = kk === k;
        ctx.fillStyle = cur ? P.goldBright : full ? hexA(P.gold, 0.7) : hexA(P.inkFaint, 0.4);
        ctx.fillRect(cxk - bwk / 2, by1 - bh, bwk, bh);
        ctx.fillStyle = cur ? P.goldBright : full ? P.gold : FAINT;
        ctx.fillText(String(len), cxk, by1 - bh - 8);
        ctx.fillStyle = cur ? P.ink : FAINT;
        ctx.fillText(String(kk), cxk, by1 + 9);
      }
      // ×7, the rearrangement by fifths: step k is drawn as step 7k. Even steps keep their
      // figure (6k ≡ 0); odd ones trade places with the step a tritone away (6k ≡ 6).
      const ya = by1 + 18, yb = by1 + mapH - 2;
      const lit = ease(arrT);
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {             // the chosen step last, on top
        for (let kk = 1; kk <= 11; kk++) {
          const cur = kk === k;
          if ((pass === 1) !== cur) continue;
          const xa = colK(kk), xb = colK(mod(7 * kk, 12)), c = (yb - ya) * 0.55;
          ctx.beginPath(); ctx.moveTo(xa, ya);
          if (xa === xb) ctx.lineTo(xb, yb); else ctx.bezierCurveTo(xa, ya + c, xb, yb - c, xb, yb);
          ctx.strokeStyle = cur ? hexA(P.goldBright, 0.55 + 0.45 * lit) : hexA(P.inkFaint, kk % 2 ? 0.42 : 0.3);
          ctx.lineWidth = cur ? 1.4 + 0.4 * lit : 1;
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
      for (let kk = 1; kk <= 11; kk++) {
        ctx.fillStyle = kk === k7 ? hexA(P.goldBright, 0.6 + 0.4 * lit) : FAINT;
        ctx.fillText(String(kk), colK(kk), yb + 9);
      }
      ctx.textAlign = 'right'; ctx.fillStyle = FAINT;
      ctx.fillText('k', bx0 - 8, by1 + 9);
      ctx.fillStyle = lit > 0.5 ? P.gold : FAINT;
      ctx.fillText('7k', bx0 - 8, yb + 9);
      ctx.restore();
    }

    function wrapText(ctx, text, x, y, maxW, lh) {
      const words = text.split(' ');
      let line = '', yy = y;
      for (const wd of words) {
        const t = line ? line + ' ' + wd : wd;
        if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = wd; yy += lh; } else line = t;
      }
      if (line) ctx.fillText(line, x, yy);
      return yy;
    }

    const chartState = { x0: 0, x1: 0, y0: 0, y1: 0 };
    const memo = { fifth: NaN, two: null, rec: null };
    function drawSpiralPanel(ctx, alpha) {
      if (alpha <= 0.002) return;
      const { x, y, w, h } = lay.panel;
      const gs = gapStructure(N, fifth);
      const pure = Math.abs(fifth - PURE_FIFTH) < 1e-6;
      const d = drift(N, fifth);
      ctx.save();
      ctx.globalAlpha = alpha;

      /* the octave, unrolled */
      const two = gs.sizes.length === 2;
      const nd = gs.distinct.length;
      const sizesWord = gs.sizes.length === 1 ? 'one step size' : `${NUMBER_WORDS[gs.sizes.length]} step sizes`;
      const extra1 = heading(ctx, 'the octave, unrolled', `${nd} notes · ${sizesWord}${two ? ', a scale' : ''}`,
        two ? P.verdant : P.inkDim, `italic ${lay.wide ? 13 : 12}px ${SERIF}`, x, y + 12, w);

      const sy = y + 40 + extra1, sh = 11;
      const X = (c) => x + (c / 1200) * w;
      for (const g of gs.gaps) {
        const a = X(g.from), b = X(Math.min(1200, g.to)) ;
        const wrapPart = g.to > 1200 ? X(g.to - 1200) - x : 0;
        ctx.fillStyle = hexA(GAP_HUES[Math.min(2, g.cls)], 0.85);
        if (b - a > 1.2) ctx.fillRect(a + 0.6, sy, b - a - 1.2, sh);
        if (wrapPart > 1.2) ctx.fillRect(x + 0.6, sy, wrapPart - 1.2, sh);
      }
      // note ticks, the start in azure, and the next fifth dashed in crimson
      ctx.lineWidth = 1;
      for (const c of gs.distinct) {
        const xx = Math.round(X(c)) + 0.5;
        ctx.strokeStyle = c === 0 ? P.azure : hexA(P.ink, 0.7);
        ctx.beginPath(); ctx.moveTo(xx, sy - 5); ctx.lineTo(xx, sy + sh + 3); ctx.stroke();
      }
      const gxc = X(fifthCents(N, fifth));
      if (Math.abs(d) >= 0.005) {
        ctx.setLineDash([2, 2]); ctx.strokeStyle = P.crimsonBright || P.crimson;
        ctx.beginPath(); ctx.moveTo(Math.round(gxc) + 0.5, sy - 9); ctx.lineTo(Math.round(gxc) + 0.5, sy + sh + 6); ctx.stroke();
        ctx.setLineDash([]);
      }
      // playhead in scale order
      if (ph && ph.kind === 'scale' && !ph.octave) {
        const xx = X(fifthCents(ph.n, fifth));
        glowGold.draw(ctx, xx, sy + sh / 2, 0.7);
      }
      // names under the ticks, where they fit (lower fifths first)
      setFont(ctx, lay.wide ? 12 : 11, SERIF);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const placed = [];
      const byN = [...gs.notes].sort((a, b) => a.n - b.n);
      for (const nt of byN) {
        const nm = spelled(nt.n);
        if (!nm) break;
        setFont(ctx, lay.wide ? 12 : 11, SERIF);
        const half = ctx.measureText(nm).width / 2 + 2;
        const xx = Math.max(x + half - 2, Math.min(x + w - half + 2, X(nt.c)));   // keep C inside the strip
        if (placed.some(([l, r]) => xx + half > l && xx - half < r)) continue;
        placed.push([xx - half, xx + half]);
        ctx.fillStyle = nt.n === 0 ? P.azure : P.inkDim;
        noteText(ctx, nm, xx, sy + sh + 6, lay.wide ? 12 : 11);
      }
      // the step sizes, named and counted
      setFont(ctx, lay.wide ? 11.5 : 10.5, MONO);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      let lx = x, ly = sy + sh + 38;
      gs.sizes.forEach((sz, i) => {
        const nm = pure ? stepName(sz) : '';
        const label = `${gs.counts[i]} × ${nm ? nm + ' ' : ''}${sz.toFixed(2)}¢`;
        const wLab = ctx.measureText(label).width + 22;
        if (lx > x && lx + wLab > x + w) { lx = x; ly += 17; }
        ctx.fillStyle = hexA(GAP_HUES[Math.min(2, i)], 0.9);
        ctx.fillRect(lx, ly - 7, 9, 7);
        ctx.fillStyle = P.inkDim;
        ctx.fillText(label, lx + 14, ly);
        lx += wLab + 6;
      });

      /* the near misses */
      const cTop = ly + (lay.wide ? 46 : 34);
      const pq = Math.round(N * fifth / 1200);
      const extra2 = heading(ctx, 'the near misses',
        Math.abs(d) < 0.005 ? `${N} fifths = ${pq} octaves` : `${N} fifths − ${pq} octaves = ${signed(d)}¢`,
        Math.abs(d) < 0.005 ? P.verdant : (P.crimsonBright || P.crimson), `${lay.wide ? 12.5 : 11}px ${MONO}`, x, cTop, w);

      const labW = lay.wide ? 38 : 32;
      const x0 = x + labW, x1 = x + w;
      const keyH = 22;
      const y0 = cTop + 18 + extra2, y1 = y + h - 10 - keyH;
      const mid = Math.round((y0 + y1) / 2) + 0.5;
      const half = Math.max(8, (y1 - y0) / 2 - 12);
      const Y = (c) => mid - Math.sign(c) * Math.sqrt(Math.min(600, Math.abs(c)) / 600) * half;
      chartState.x0 = x0; chartState.x1 = x1; chartState.y0 = y0; chartState.y1 = y1;
      // gridlines at 25, 100 and 400 cents
      setFont(ctx, 10, MONO);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const labelled = [mid];
      for (const g of [400, 100, 25]) {
        for (const sgn of [1, -1]) {
          const yy = Math.round(Y(sgn * g)) + 0.5;
          ctx.strokeStyle = 'rgba(42,46,63,0.8)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
          if (labelled.some((v) => Math.abs(v - yy) < 11)) continue;
          labelled.push(yy);
          ctx.fillStyle = FAINT;
          ctx.fillText(`${sgn > 0 ? '+' : '−'}${g}`, x0 - 5, yy);
        }
      }
      ctx.strokeStyle = P.inkFaint; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();
      ctx.fillStyle = FAINT; ctx.fillText('0', x0 - 5, mid);
      setFont(ctx, lay.wide ? 11.5 : 10.5, SERIF, 'italic');
      ctx.textAlign = 'left'; ctx.fillStyle = FAINT;
      ctx.fillText('sharp', x0 + 3, y0 + 2);
      ctx.fillText('flat', x0 + 3, y1 - 2);

      const Q = 53, bw = (x1 - x0) / Q;
      if (memo.fifth !== fifth) { memo.fifth = fifth; memo.two = new Set(twoGapCounts(53, fifth)); memo.rec = new Set(recordStacks(53, fifth)); }
      const twoSet = memo.two, recSet = memo.rec;
      const barW = Math.max(1.5, Math.min(6, bw * 0.6));
      const thinW = Math.max(1, Math.min(2.5, bw * 0.3));
      for (let q = 1; q <= Q; q++) {
        const dq = drift(q, fifth);
        const bx = x0 + (q - 0.5) * bw;
        const yy = Y(dq);
        let col = hexA(P.inkFaint, 0.34), bwq = thinW;
        if (twoSet.has(q)) { col = hexA(P.verdant, 0.8); bwq = barW; }
        if (q === N) { col = Math.abs(dq) < 0.005 ? P.verdant : (P.crimsonBright || P.crimson); bwq = barW; }
        ctx.fillStyle = col;
        const top = Math.min(yy, mid), hh = Math.max(1, Math.abs(yy - mid));
        ctx.fillRect(bx - bwq / 2, Math.abs(dq) < 0.005 ? mid - 1.5 : top, bwq, Math.abs(dq) < 0.005 ? 3 : hh);
        if (recSet.has(q) && q > 1) {
          ctx.fillStyle = P.goldBright;
          ctx.beginPath(); ctx.arc(bx, yy + (dq > 0 ? -4 : 4), 1.6, 0, TAU); ctx.fill();
        }
      }
      // cursor on the chosen stack
      const cxq = Math.round(x0 + (N - 0.5) * bw) + 0.5;
      ctx.strokeStyle = hexA(P.crimsonBright || P.crimson, 0.35); ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cxq, y0 + 8); ctx.lineTo(cxq, y1 - 8); ctx.stroke();
      ctx.setLineDash([]);
      // fractions p/q at the two-step stacks, where they fit (convergents first)
      setFont(ctx, lay.wide ? 11 : 10, MONO);
      ctx.textAlign = 'center';
      const order = [12, 53, 41, 5, 7, 17, 29, 3, 2].filter((q) => twoSet.has(q) || recSet.has(q));
      for (const q of [...new Set([...order, ...recSet])]) if (!order.includes(q) && q > 1) order.push(q);
      const taken = [];
      for (const q of order) {
        const dq = drift(q, fifth);
        const p = Math.round(q * fifth / 1200);
        const lab = `${p}/${q}`;
        const tw = ctx.measureText(lab).width / 2 + 2;
        const bx = Math.max(x0 + tw, Math.min(x1 - tw + 2, x0 + (q - 0.5) * bw));   // pull edge labels inside, clear of the axis
        const up = dq >= 0;
        const ty = up ? Math.min(Y(dq), mid) - 13 : Math.max(Y(dq), mid) + 13;
        const box = [bx - tw, ty - 7, bx + tw, ty + 7];
        if (taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        taken.push(box);
        ctx.fillStyle = q === N ? (Math.abs(dq) < 0.005 ? P.verdant : (P.crimsonBright || P.crimson)) : recSet.has(q) ? P.goldBright : P.verdant;
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(9,10,14,0.9)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        ctx.strokeText(lab, bx, ty);                     // a halo where a label crosses a bar
        ctx.fillText(lab, bx, ty);
      }
      // key
      const ky = y + h - 8;
      setFont(ctx, lay.wide ? 12 : 11, SERIF, 'italic');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = hexA(P.verdant, 0.85); ctx.fillRect(x0, ky - 8, 4, 9);
      ctx.fillStyle = P.inkDim;
      const k1 = lay.wide ? 'a scale: two step sizes' : 'a scale';
      ctx.fillText(k1, x0 + 9, ky);
      const kx = x0 + 9 + ctx.measureText(k1).width + 16;
      ctx.fillStyle = P.goldBright; ctx.beginPath(); ctx.arc(kx + 2, ky - 4, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = P.inkDim;
      ctx.fillText(lay.wide ? 'a record: no smaller stack comes closer' : 'a record miss', kx + 9, ky);
      ctx.restore();
    }

    /* ---------- frame ---------- */
    function frame(dt) {
      // consume due notes against the audio clock
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      while (queue.length && queue[0].at <= now) { ph = queue.shift().ph; dirty = true; }
      if (ph && !queue.length && (!scheduler || !scheduler.playing) && now > seqEnd + 0.25) { ph = null; dirty = true; }

      // tweens (decorative; instant under reduced motion)
      const step = Math.min(0.1, dt || 0.016);
      const tgtMode = mode === 'spiral' ? 1 : 0;
      if (modeT !== tgtMode) { modeT = reduced ? tgtMode : modeT + Math.sign(tgtMode - modeT) * Math.min(Math.abs(tgtMode - modeT), step / 0.9); dirty = true; }
      const tgtArr = arranged ? 1 : 0;
      if (arrT !== tgtArr) { arrT = reduced ? tgtArr : arrT + Math.sign(tgtArr - arrT) * Math.min(Math.abs(tgtArr - arrT), step / 0.75); dirty = true; }
      const tgtU = N * fifth / 1200;
      if (Math.abs(uShown - tgtU) > 1e-4) { uShown = reduced ? tgtU : uShown + (tgtU - uShown) * Math.min(1, step / 0.12); dirty = true; }
      else uShown = tgtU;

      if (!dirty && !queue.length) return;
      dirty = false;
      const { ctx, width: W, height: H } = handle;
      if (!(W > 4 && H > 4)) return;
      ctx.clearRect(0, 0, W, H);
      background(ctx, W, H);
      const t = ease(modeT);
      drawCircle(ctx, 1 - ease(Math.min(1, t * 1.6)));
      drawSpiral(ctx, ease(Math.max(0, (t - 0.25) / 0.75)), t);
      drawCirclePanel(ctx, 1 - ease(Math.min(1, t * 1.8)));
      drawSpiralPanel(ctx, ease(Math.max(0, (t - 0.4) / 0.6)));
    }
    const loop = cv.rafLoop((dt) => frame(dt));

    /* ---------- pointer: notes on the circle, stacks on the chart ---------- */
    let dragging = false;
    function hit(e) {
      const [px, py] = cv.pointerPos(handle, e);
      if (mode === 'circle') {
        const { cx, cy, R } = lay;
        for (let pc = 0; pc < 12; pc++) {
          const a = nodeAngle(pc);
          const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
          if ((px - x) ** 2 + (py - y) ** 2 < 18 * 18) return { kind: 'node', pc };
        }
        const sc = stepChart;
        if (px >= sc.x0 && px <= sc.x1 && py >= sc.y0 && py <= sc.y1) {
          const kk = Math.floor((px - sc.x0) / ((sc.x1 - sc.x0) / 11)) + 1;
          return { kind: 'step', k: Math.max(1, Math.min(11, kk)) };
        }
        return null;
      }
      const c = chartState;
      if (px >= c.x0 - 6 && px <= c.x1 + 6 && py >= c.y0 - 4 && py <= c.y1 + 4) {
        const q = Math.round((px - c.x0) / ((c.x1 - c.x0) / 53) + 0.5);
        return { kind: 'chart', q: Math.max(2, Math.min(53, q)) };
      }
      return null;
    }
    const onDown = (e) => {
      const h = hit(e);
      if (!h) return;
      if (h.kind === 'node') { start = h.pc; stopSeq(); refresh(); }
      else if (h.kind === 'step') { if (h.k !== k) { k = h.k; genStep.set(k); stopSeq(); refresh(); } }
      else { dragging = true; try { cvs.setPointerCapture(e.pointerId); } catch { /* fine */ } setN(h.q); }
    };
    const onMove = (e) => {
      if (dragging) { const h = hit(e); if (h && h.kind === 'chart') setN(h.q); return; }
      if (e.pointerType === 'mouse') cvs.style.cursor = hit(e) ? 'pointer' : 'default';
    };
    const onUp = (e) => { dragging = false; try { cvs.releasePointerCapture(e.pointerId); } catch { /* fine */ } };
    cvs.addEventListener('pointerdown', onDown);
    cvs.addEventListener('pointermove', onMove);
    cvs.addEventListener('pointerup', onUp);
    cvs.addEventListener('pointercancel', onUp);

    refresh();
    loop.start();

    /* ---------- lifecycle ---------- */
    function settle() {           // snap every tween to its target
      modeT = mode === 'spiral' ? 1 : 0; arrT = arranged ? 1 : 0; uShown = N * fifth / 1200; dirty = true;
    }
    return {
      pause() { loop.stop(); stopSeq(); stopMiss(); bus.mute(); settle(); },
      resume() { bus.unmute(); dirty = true; loop.start(); },
      destroy() {
        loop.stop(); stopSeq(); stopMiss();
        if (heightRaf) { cancelAnimationFrame(heightRaf); heightRaf = 0; }
        cvs.removeEventListener('pointerdown', onDown);
        cvs.removeEventListener('pointermove', onMove);
        cvs.removeEventListener('pointerup', onUp);
        cvs.removeEventListener('pointercancel', onUp);
        bus.dispose(); handle.destroy(); style.remove();
      },
    };
  },
};

export const _test = {
  PURE_FIFTH, COMMA_CENTS, NOTE_NAMES, PRESETS, mod, gcd, orbit, cosets, figureOf, figureName,
  orbitFamily, drift, fifthCents, gapStructure, twoGapCounts, spelled, cfConvergents, recordStacks,
  beatHz, stepName, presetFor, ordinal, heightFor, computeLayout,
};
