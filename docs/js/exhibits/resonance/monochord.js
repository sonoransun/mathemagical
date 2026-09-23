// II.1 — The Monochord
// One string; the ladder of its overtones; the pluck point as a Fourier filter;
// harmonics (flageolets) as that filter's complement; and the just-versus-equal
// quarrel over the major third, made audible, visible and countable.
//
// Checked against sources at build time (September 2026):
// · T. Young, Phil. Trans. 90 (1800), read 16 Jan 1800: §XIII (the pluck rule,
//   "intirely lost") and §XVI (the temperament sentence) — Wikisource transcription.
// · J. Wallis, Phil. Trans. 12 (1677) 839–842, letter of 14 March 1676/7: Noble
//   (Merton) and Pigot (Wadham), "a little bit of paper", "a string doth not sound
//   clear if struck in the midst" — archive.org scan.
// · Helmholtz, Sensations of Tone, trans. Ellis (1885, repr. 1895): Young credited;
//   the midpoint pluck "a peculiarly hollow or nasal twang"; "33 beats in a second
//   produce about the maximum amount of roughness"; Ellis: equal temperament became
//   English piano "trade usage" c. 1846 at Broadwoods', under Hipkins.
// · SEP "Pythagoreanism" (rev. 2024): Hippasus's bronze discs (Aristoxenus fr. 90);
//   Nicomachus's smithy. SEP "Archytas": enharmonic tetrachord 5:4, 36:35, 28:27.
// · BMCR 2011.03.59 (Creese 2010): Sectio Canonis c. 300 BC the first literary
//   reference; Ptolemy's Harmonics the fullest description.
// · Five Lectures on the Acoustics of the Piano (KTH, 1990): partials "more like
//   1 : 2.001 : 3.005 : 4.012", from the bending stiffness of the wire.
// · Linda Hall Library (Vincenzo Galilei, 1588: octave = 4× weight, fifth 9:4).
// · Marjieh et al., Nat. Commun. 15:1482 (2024), Study 4B (major-third peak at
//   3.95 semitones for harmonic tones; gone with pure tones); McDermott et al.
//   2010 (Curr. Biol.), 2016 (Nature); McPherson-McNato et al., Cognition 267 (2026).
// · Cupertino et al., Nat. Commun. 15:4255 (2024); Advanced LIGO, CQG 32:074001
//   (2015); Brandenburg, "MP3 and AAC Explained" (AES 17th conf., 1999); Geokon
//   4500 manual. Plomp & Levelt, JASA 38:548 (1965).
// Every cent, hertz and beat rate on the stage is computed, never transcribed.

import { TAU, clamp, cents } from '../../core/math.js';

/* =================== pure theory (exported for tests) =================== */

const F0 = 110;   // the string's fundamental, Hz (A2)
const NH = 16;    // partials modelled everywhere

// Modal amplitude of an ideal string released from a triangular pluck at
// fraction beta of its length (unit peak displacement, L = 1):
//   a_n = 2 sin(nπβ) / (n² π² β(1−β))
// Signed: the sign is the mode's phase; magnitudes are what you hear.
export function harmonicAmp(n, beta) {
  if (beta <= 0 || beta >= 1) return 0;
  return (2 * Math.sin(n * Math.PI * beta)) /
         (n * n * Math.PI * Math.PI * beta * (1 - beta));
}

// First N modal amplitudes, normalized so Σ|aₙ| = 1 (keeps the additive
// synth's summed peak bounded — the "sixteen sines clip" pitfall).
export function pluckSpectrum(beta, N = NH) {
  const a = new Array(N);
  let sum = 0;
  for (let n = 1; n <= N; n++) { a[n - 1] = harmonicAmp(n, beta); sum += Math.abs(a[n - 1]); }
  if (sum > 0) for (let i = 0; i < N; i++) a[i] /= sum;
  return a;   // a[0] is n = 1
}

// Σ|aₙ| before normalization — the scale factor for the continuous envelope.
export function envelopeNorm(beta, N = NH) {
  let s = 0;
  for (let n = 1; n <= N; n++) s += Math.abs(harmonicAmp(n, beta));
  return s;
}

// The nearest-coincident low partials of a dyad: minimize |m·f_lo − n·f_hi|
// over 1 ≤ m, n ≤ maxH (ties go to the lowest pair). For a just 5/4 third the
// answer is (5, 4) with difference 0; temper the third and the same pair beats.
export function beatPair(fa, fb, maxH = 10) {
  const lo = Math.min(fa, fb), hi = Math.max(fa, fb);
  let best = null;
  for (let m = 1; m <= maxH; m++) {
    for (let n = 1; n <= maxH; n++) {
      const d = Math.abs(m * lo - n * hi);
      if (!best || d < best.d - 1e-9 ||
          (Math.abs(d - best.d) <= 1e-9 && m + n < best.m + best.n)) {
        best = { m, n, d };
      }
    }
  }
  return best;   // { m: partial of the lower note, n: of the higher, d: Hz }
}

// Snap a pluck fraction to the NEAREST simple fraction within tol (the ones
// ticked on the string). Nearest, not first: a finger-sized tolerance on a phone
// can reach two neighbours at once (⅕ and ¼ are only 0.05 apart).
const SNAPS = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5]];
export function snapBeta(b, tol = 0.012) {
  let best = null, bd = Infinity;
  for (const [p, q] of SNAPS) {
    const d = Math.abs(b - p / q);
    if (d < tol && d < bd) { bd = d; best = { beta: p / q, p, q }; }
  }
  return best || { beta: b, p: null, q: null };
}

// The keys' own timbre: a string plucked a tenth of the way along. Bright enough
// that partials 4 and 5, the ones the major third's beats live in, stand at about
// −14 and −18 dB below the fundamental.
export const KEY_BETA = 0.1;

// Level of partial n (1-based) in a spectrum, in dB against its strongest partial.
export function relDb(spec, n) {
  let mx = 0;
  for (const a of spec) mx = Math.max(mx, Math.abs(a));
  const a = Math.abs(spec[n - 1] || 0);
  return mx > 0 && a > 1e-12 ? 20 * Math.log10(a / mx) : -Infinity;
}

// The beat a listener can actually hear when a dyad is played in a given timbre
// (both notes share `spec`). `ideal` is beatPair's answer, blind to amplitude;
// `heard` is the closest pair whose partials both sound (above floorDb) and lie
// within maxBeat Hz, or null. A midpoint pluck silences every even partial, so
// the tempered third's 5 : 4 beat has nothing to beat with.
export function audibleBeat(fLo, fHi, spec, { maxH = 10, maxBeat = 30, floorDb = -60 } = {}) {
  const lo = Math.min(fLo, fHi), hi = Math.max(fLo, fHi);
  const ideal = beatPair(lo, hi, maxH);
  const sounds = (k) => relDb(spec, k) > floorDb;
  const idealAudible = ideal.d < maxBeat && sounds(ideal.m) && sounds(ideal.n);
  let heard = idealAudible ? ideal : null;
  if (!heard) {
    for (let m = 1; m <= maxH; m++) {
      if (!sounds(m)) continue;
      for (let n = 1; n <= maxH; n++) {
        if (!sounds(n)) continue;
        const d = Math.abs(m * lo - n * hi);
        if (d >= maxBeat) continue;
        if (!heard || d < heard.d - 1e-9 ||
            (Math.abs(d - heard.d) <= 1e-9 && m + n < heard.m + heard.n)) heard = { m, n, d };
      }
    }
  }
  return {
    ideal, heard, idealAudible,
    silentLo: !sounds(ideal.m), silentHi: !sounds(ideal.n),
  };
}

// Landmarks for the interval lens: the piano's value, the pure ratio(s) nearby,
// and for the major third the Pythagorean 81/64 and the 395 ¢ that listeners
// liked best with rich harmonic tones (Marjieh et al. 2024, Study 4B).
const IV_NAMES = ['unison', 'minor second', 'major second', 'minor third', 'major third',
  'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth',
  'minor seventh', 'major seventh', 'octave'];
const PURE_BY_K = {
  0: [[1, 1]], 1: [[16, 15]], 2: [[9, 8], [10, 9]], 3: [[6, 5], [32, 27]],
  4: [[5, 4], [81, 64]], 5: [[4, 3]], 6: [[45, 32]], 7: [[3, 2], [40, 27]],
  8: [[8, 5]], 9: [[5, 3], [27, 16]], 10: [[16, 9], [9, 5]], 11: [[15, 8]], 12: [[2, 1]],
};
const MARK_NAMES = {
  '81/64': ['Pythagorean 81 : 64', '81 : 64'],
  '32/27': ['Pythagorean 32 : 27', '32 : 27'],
  '27/16': ['Pythagorean 27 : 16', '27 : 16'],
  '40/27': ['just re–la, 40 : 27', '40 : 27'],
};
export function dyadLandmarks(c) {
  const k = clamp(Math.round(c / 100), 0, 12);
  const marks = [{ c: 100 * k, kind: 'et', label: 'the piano', short: 'piano' }];
  PURE_BY_K[k].forEach(([p, q], i) => {
    const key = `${p}/${q}`;
    const names = MARK_NAMES[key] || [`${i ? '' : 'pure '}${p} : ${q}`, `${p} : ${q}`];
    marks.push({ c: cents(p / q), kind: i ? 'alt' : 'pure', label: names[0], short: names[1] });
  });
  if (k === 4) marks.push({ c: 395, kind: 'pref', label: 'liked best, 2024', short: '2024' });
  return { k, name: IV_NAMES[k], marks };
}

// The envelope an ideal (lossless) plucked string never leaves: the
// parallelogram (0,0) → (β,h) → (1,0) → (1−β,−h), in string coordinates.
export function pluckParallelogram(beta, h = 1) {
  return [[0, 0], [beta, h], [1, 0], [1 - beta, -h]];
}

// Where to stop the string (fraction of its length from the left bridge) so that
// the left segment sounds `freq`.
export function stopFraction(freq, f0 = F0) { return f0 / freq; }

/* ---------- fixed musical data ---------- */

const FLAGEOLETS = [
  { num: 1, den: 2, glyph: '½', name: 'the octave', word: 'one half' },
  { num: 2, den: 3, glyph: '⅔', name: 'a twelfth (octave + fifth)', word: 'two thirds' },
  { num: 3, den: 4, glyph: '¾', name: 'two octaves', word: 'three quarters' },
  { num: 4, den: 5, glyph: '⅘', name: 'two octaves + a pure major third', word: 'four fifths' },
];
const FLAG_AMPS = [0.72, 0.2, 0.08];
const PLUCKS = [
  { beta: 1 / 2, label: '½', word: 'one half' },
  { beta: 1 / 3, label: '⅓', word: 'one third' },
  { beta: 1 / 4, label: '¼', word: 'one quarter' },
  { beta: 1 / 5, label: '⅕', word: 'one fifth' },
  { beta: 0.07, label: 'near the bridge', word: 'near the bridge' },
];

const DEGREES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti', 'do′'];
const JI = [[1, 1], [9, 8], [5, 4], [4, 3], [3, 2], [5, 3], [15, 8], [2, 1]];
const ET_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
const ROOT = 2 * F0;              // 220 Hz — the string's own octave, 2f₀
const JUST3 = cents(5 / 4);       // 386.3137…
const PYTH3 = cents(81 / 64);     // 407.8200…
const SLIDE_MARKS = [JUST3, 395, 400, PYTH3];

// Per-mode decay time constant (s): higher modes die faster.
function tauOf(n) { return 1.9 / (1 + 0.55 * (n - 1)); }

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FVIS = 1.05;                 // visual fundamental, Hz (~105× slowdown)
const AREF = 0.85, RANGE = 60;     // spectrum: dB against AREF, 60 dB tall
const NPTS = 160;                  // points along the drawn string

/* ============================== the exhibit ============================== */

export default {
  id: 'monochord',
  movement: 2,
  title: 'The Monochord',
  hook: 'Pluck one string; every interval — and the war between pure tuning and the piano — is already inside it.',
  era: '5th c. BCE – 1863 · Hippasus, the Sectio Canonis, Young, Helmholtz',
  prose: `
    <p>Stretch one string over two bridges and you own one of the oldest laboratories in
    science. It was not quite the first. Aristoxenus reports that Hippasus of Metapontum, in
    the fifth century BCE, made four bronze discs of equal diameter whose thicknesses stood in
    the ratios of the consonances, and a freely hanging disc half as thick as its twin does
    sound an octave away when struck. Hippasus may have been the first to show by experiment
    that a law of nature can be written in numbers; the string made his experiment portable.
    Greek harmonic theorists called it the <em>kanōn</em>, “the rule”, and the earliest text to
    mention it is the <em>Division of the Canon</em>, attributed to Euclid, from around 300 BCE.
    The rule it measures is startling: stop the string at half its length and it sounds the
    octave; at two-thirds, the perfect fifth; at three-quarters, the fourth. Consonance, the
    most private of sensations, turns out, for tones like a string’s, to obey the smallest
    whole numbers, <code>2/1</code>, <code>3/2</code>, <code>4/3</code>. The ear was the first
    precision instrument.</p>
    <p>But the string holds more than the notes you can stop; left whole, it plays every whole
    number at once. A plucked string vibrates in modes,
    <code>yₙ&nbsp;=&nbsp;aₙ&nbsp;sin(nπx/L)&nbsp;cos(2πnf₀t)</code>, sounding <code>f₀,&nbsp;2f₀,&nbsp;3f₀,&nbsp;…</code>
    together, and <em>where</em> you pluck decides the mix. Release it at a fraction β of its
    length and mode <em>n</em> receives amplitude <code>aₙ&nbsp;∝&nbsp;sin(nπβ)/n²</code>. Pluck dead
    centre and every even harmonic vanishes: each of those modes needs a node at the midpoint,
    exactly where your finger insists on maximum motion. The pluck point is a filter. John
    Wallis half-heard it in Oxford in 1677, noting that “a string doth not sound clear if
    struck in the midst”. Thomas Young stated it to the Royal Society on 16 January 1800: a
    string drawn aside “at one-half, one-third, or any other aliquot part of its length” and
    let go loses, entirely, the harmonic that has a node there. Hermann von Helmholtz, crediting
    Young, heard in the midpoint pluck “a&nbsp;peculiarly hollow or nasal twang”.</p>
    <p>That a kinked triangle can be rebuilt from smooth sines was not obvious to anyone. When
    Daniel Bernoulli argued in 1753 that every motion of a string is a sum of its simple modes,
    Euler doubted that such sums could take an arbitrary shape and d’Alembert doubted that they
    were physical; the argument outlived all three men. Drag the pluck point along the string
    below and watch the <code>sin(nπβ)/n²</code> envelope sweep across the spectrum, or run
    along the bars and watch the triangle assemble, one sine at a time: the shape you release
    and the timbre you hear are one list of numbers, a fact this movement will keep returning
    to. Strictly, only an ideal string is so obliging. Real wire resists
    bending and its overtones run a little sharp, on a piano more like
    1&nbsp;:&nbsp;2.001&nbsp;:&nbsp;3.005&nbsp;:&nbsp;4.012, which is why tuners stretch their octaves. The perfect integer ladder is a gift of
    one dimension; <a href="#ex-chladni">a vibrating plate</a> refuses it altogether.</p>
    <p>Touching is plucking’s complement. Rest a fingertip <em>on</em> the string at
    two-thirds — touch, don’t press — and only the modes with a node under your finger
    survive: harmonics 3, 6, 9…, exactly the ones a pluck there would delete. The string leaps
    to a glassy twelfth. String players call these harmonics, or flageolets, for their
    flute-like colour; mathematically, a touch at <code>p/q</code> filters the whole numbers
    down to the multiples of <code>q</code>. The nodes were first seen, so far as Wallis knew,
    in Oxford around 1674. William Noble of Merton College, and after him Thomas Pigot of Wadham, sounded a string’s
    upper octave on a neighbouring string and slid “a little bit of paper” along the first one:
    it shook over each half and lay still at the middle. The touch-points on our instrument
    give the octave at ½, the twelfth at ⅔, two octaves at ¾ — and at ⅘, a pure major third
    two octaves up, the innocent-looking interval the rest of this exhibit goes to war
    over.</p>
    <p>Here is the war. The pure major third is old: Archytas of Tarentum built 5&nbsp;:&nbsp;4 into his
    enharmonic scale in the fourth century BCE, and the three steps of our just row, 9&nbsp;:&nbsp;8,
    10&nbsp;:&nbsp;9 and 16&nbsp;:&nbsp;15, are the steps of the “intense” diatonic that Ptolemy set out in the
    second century CE and that Gioseffo Zarlino, in 1558, grounded in the numbers one to six.
    Built as a pure ratio, the third is <code>5/4</code>, exactly
    <code>1200·log₂(5/4)&nbsp;=&nbsp;386.31</code> cents. Built as a piano builds it, from four equal
    semitones of <code>2^(1/12)</code>, it is <code>400</code> cents: sharp by 13.69 cents,
    about a seventh of a semitone. The difference is not bookkeeping; it beats. When the ratio
    is exactly 5/4, the fifth harmonic of <em>do</em> and the fourth harmonic of <em>mi</em>
    land on one frequency, 1100 Hz over our 220 Hz <em>do</em>, and the two tones lock. Temper
    the third and those partials miss, 1100 Hz against 1108.73, so the sound swells and fades
    8.73 times a second. Hold the third both ways on the keyboard below, or slide it yourself,
    and listen to arithmetic disagree with itself.</p>
    <p>So why does every modern piano choose the churning third? Because the pure intervals
    refuse to share an octave. Stack four pure fifths, drop two octaves, and you land on
    <code>81/64</code>, overshooting the pure third by <code>81/80</code>, the <em>syntonic
    comma</em> of about 21.51 cents. Even inside one key pure tuning cannot keep all its
    promises: on our just row <em>re</em> and <em>la</em> stand at <code>40/27</code>, a fifth
    flat by that same comma, and they beat about nine times a second. “It would have been
    extremely convenient for practical musicians,” Young wrote in his paper of 1800, “and would
    have saved many warm controversies among theoretical ones, if three times the ratio of 4
    to 5 … had been equal to the ratio of 1 to 2.” Every fixed-pitch tuning built from pure
    ratios is a treaty apportioning such errors. Equal temperament narrows each fifth by under
    two cents and leaves the major third holding 13.69 of the comma’s 21.51; for English
    pianos it became trade practice only around 1846, introduced at Broadwood’s under Alfred
    Hipkins. The next exhibit unrolls the story into a spiral. For now, notice what one string
    has already given us: the harmonic series, a Fourier transform under your fingertip, and
    an honest arithmetic reason why a piano can never be perfectly in tune.</p>`,

  chronicle: [
    { year: -475, date: 'c. 500–450 BCE', text: 'Hippasus of Metapontum, Aristoxenus later reports, makes four bronze discs of equal diameter whose thicknesses stand in the ratios of the consonances: the earliest recorded experiment that could really show a musical interval to be a ratio.' },
    { year: -300, date: 'c. 300 BCE', text: 'The <em>Division of the Canon</em>, attributed to Euclid, is the earliest surviving text to mention the monochord, the Greek <em>kanōn</em>: one string, divided to measure the consonances.' },
    { year: 1677, date: '1677', text: 'John Wallis reports an Oxford discovery by William Noble and Thomas Pigot: a paper rider on a string sounding in sympathy shakes along each segment but rests at the points of division — the nodes, made visible.' },
    { year: 1753, date: '1753', text: 'Daniel Bernoulli argues that every motion of a vibrating string is a sum of its simple modes; Euler and d’Alembert doubt that such sums of sines can be general.' },
    { year: 1800, date: '16 January 1800', text: 'Thomas Young tells the Royal Society that a string drawn aside at “one-half, one-third, or any other aliquot part of its length” loses entirely the harmonic with a node there.' },
    { year: 1846, date: 'c. 1846', text: 'Equal temperament becomes trade practice for English pianos, introduced at Broadwood’s under Alfred Hipkins; at the Great Exhibition of 1851 no English organ is yet tuned that way.' },
    { year: 1863, date: '1863', text: 'Hermann von Helmholtz’s <em>Die Lehre von den Tonempfindungen</em> explains dissonance as the beating of upper partials, roughest, he finds, at about thirty-three beats a second.' },
    { year: 2024, date: 'May 2024', text: 'At Delft University of Technology a silicon-nitride string 3 cm long and 70 nm thick rings with a quality factor above 6.5 billion at room temperature, a record for a mechanically clamped resonator.' },
  ],

  today: `
    <p>The monochord never retired; it shrank and went to work. In 2024 a team at Delft
    University of Technology suspended a silicon-nitride string three centimetres long and
    seventy nanometres thick, in proportion a millimetre-thin ribbon strung across nearly half
    a kilometre, and patterned it so that one mode, at 214 kHz, barely stirs the clamps where
    energy leaks away. That mode rang with a quality factor above 6.5 billion at room
    temperature, the highest then recorded for a mechanically clamped resonator: plucked once,
    it would take close to three hours to lose two-thirds of its swing. Its builders name
    searches for dark matter among the weak forces such strings might one day weigh.</p>
    <p>The same arithmetic hangs the mirrors of LIGO. Each 40-kilogram test mass hangs from four
    fused-silica fibres, 400 micrometres thick and about 60 centimetres long, whose first
    “violin mode” is set at 510 Hz, above the band where the detectors listen hardest. In
    boreholes, embankments and pipelines, vibrating-wire piezometers read water pressure by
    setting a taut wire humming and timing it; the square of the frequency tracks the pressure,
    which is Mersenne’s law put to work.</p>
    <p>And the ear that judged the monochord’s ratios now decides what our machines may throw
    away. An MP3 or AAC encoder runs a perceptual model that estimates, band by band, how much
    noise the music will mask, then quantizes each band just coarsely enough to stay under that
    threshold; in MP3 the bands are roughly the critical bands of hearing, the same bands within
    which two partials beat and grate. <a href="#ex-lossy">The Art of Forgetting</a> takes that
    bargain apart.</p>`,

  sources: [
    { text: 'David Creese, <em>The Monochord in Ancient Greek Harmonic Science</em> (Cambridge University Press, 2010), reviewed by Eleonora Rocconi, <em>Bryn Mawr Classical Review</em> 2011.03.59', url: 'https://bmcr.brynmawr.edu/2011/2011.03.59/' },
    { text: 'Carl Huffman, “Pythagoreanism”, <em>Stanford Encyclopedia of Philosophy</em> (substantive revision 2024)', url: 'https://plato.stanford.edu/entries/pythagoreanism/' },
    { text: 'John Wallis, “Dr. Wallis’s Letter to the Publisher, concerning a New Musical Discovery”, <em>Philosophical Transactions</em> 12 (1677): 839–842', url: 'https://doi.org/10.1098/rstl.1677.0006' },
    { text: 'Thomas Young, “Outlines of Experiments and Inquiries Respecting Sound and Light”, <em>Philosophical Transactions</em> 90 (1800): 106–150', url: 'https://doi.org/10.1098/rstl.1800.0008' },
    { text: 'Hermann von Helmholtz, <em>On the Sensations of Tone</em> (1863), trans. Alexander J. Ellis, with Ellis’s appendices (2nd English edition 1885; reprinted 1895)', url: 'https://archive.org/details/onsensationston00elligoog' },
    { text: 'Reinier Plomp and Willem J. M. Levelt, “Tonal Consonance and Critical Bandwidth”, <em>Journal of the Acoustical Society of America</em> 38 (1965): 548–560', url: 'https://doi.org/10.1121/1.1909741' },
    { text: 'Josh H. McDermott, Alan F. Schultz, Eduardo A. Undurraga and Ricardo A. Godoy, “Indifference to dissonance in native Amazonians reveals cultural variation in music perception”, <em>Nature</em> 535 (2016): 547–550', url: 'https://doi.org/10.1038/nature18635' },
    { text: 'Raja Marjieh, Peter M. C. Harrison, Harin Lee, Fotini Deligiannaki and Nori Jacoby, “Timbral effects on consonance disentangle psychoacoustic mechanisms and suggest perceptual origins for musical scales”, <em>Nature Communications</em> 15 (2024): 1482', url: 'https://doi.org/10.1038/s41467-024-45812-z' },
    { text: 'Andrea Cupertino, Dongil Shin, Leo Guo, Peter G. Steeneken, Miguel A. Bessa and Richard A. Norte, “Centimeter-scale nanomechanical resonators with low dissipation”, <em>Nature Communications</em> 15 (2024): 4255', url: 'https://doi.org/10.1038/s41467-024-48183-7' },
    { text: 'LIGO Scientific Collaboration, “Advanced LIGO”, <em>Classical and Quantum Gravity</em> 32 (2015): 074001', url: 'https://arxiv.org/abs/1411.4547' },
  ],

  alt: 'A monochord seen from above: one gold string over two bridges on a long soundbox ruled with pluck fractions, touch-points for harmonics and the stops of a just and an equal-tempered scale, with a loupe on the two stops for mi; beneath it the string’s sixteen partials in decibels. A second panel puts the interval between two held notes under a lens in cents, draws both notes’ partials as two rows of dots joined where they lock or beat, and traces the beat as a ribbon.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const CB = P.crimsonBright || '#d97a68';
    const GHOST = P.inkGhost || '#4a4840';
    let SERIF = 'Georgia, serif';
    try { SERIF = getComputedStyle(document.body).fontFamily || SERIF; } catch { /* keep */ }
    const mm = (q) => (typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);
    const mqReduce = mm('(prefers-reduced-motion: reduce)');
    let reduced = !!(mqReduce && mqReduce.matches);
    const mqCoarse = mm('(pointer: coarse)');
    const coarse = !!(mqCoarse && mqCoarse.matches);

    /* ---------- state ---------- */
    let drag = null;          // { beta, snap, h, moved }
    let pending = null;       // a press on a touch-point that may yet become a drag
    let excite = null;        // { kind:'pluck'|'flag', t0a, t0p, run, ... }
    let everTouched = false;
    let hoverN = 0;           // partial under the pointer (0 = none)
    let hoverTimer = 0;
    let hoverFlag = -1;       // touch-point under the mouse
    let barPress = null;      // a press on a spectrum bar, sounded on release
    let lastBeta = 0.28;      // where the last pluck was released
    let currentSpec = pluckSpectrum(lastBeta);
    const KEY_SPEC = pluckSpectrum(KEY_BETA);
    let borrow = false;
    let paused = false;
    let waveCache = null, waveFor = null;
    const banks = [];
    const voices = new Map(); // id -> { osc, g, freq, deg, row, rat, el }
    let slide = null;         // { lo:{osc,g}, hi:{osc,g}, cents }
    let qMid = false, qJI3 = false, qET3 = false, qSlide = false;

    const bus = audio.createBus('monochord');

    /* ---------- scoped styles ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-monochord .mono-acts { display:flex; flex-wrap:wrap; gap:.55rem 1.6rem; align-items:center;
        margin:.85rem 0 0; }
      #ex-monochord .mono-acts .grp { display:flex; flex-wrap:wrap; gap:.35rem; align-items:center; }
      #ex-monochord .mono-acts .lab, #ex-monochord .mono-kb-label, #ex-monochord .mono-kb .rowlab {
        font-family:${SERIF}; font-variant-caps:all-small-caps; letter-spacing:.14em; color:var(--ink-dim, ${P.inkDim}); }
      #ex-monochord .mono-acts .lab { font-size:.86rem; margin-right:.25rem; }
      #ex-monochord .mono-acts .btn.small { min-width:2.3rem; font-size:.95rem; line-height:1.2; padding:.2rem .55rem; }
      #ex-monochord .mono-acts .btn.small.word { font-size:.8rem; font-style:italic; }
      #ex-monochord .mono-kb-label { font-size:.9rem; margin:1.5rem 0 .45rem; }
      #ex-monochord .mono-kb-label i { font-variant-caps:normal; letter-spacing:0; font-style:italic; }
      #ex-monochord .mono-kb { display:grid; grid-template-columns:auto repeat(8,minmax(0,1fr)); gap:5px; }
      #ex-monochord .mono-kb .rowlab { align-self:center; font-size:.84rem; padding-right:.35rem; }
      #ex-monochord .mono-kb .rowlab.ji { color:${P.gold}; }
      #ex-monochord .mono-kb .rowlab.et { color:${P.azure}; }
      #ex-monochord .mono-key { appearance:none; background:linear-gradient(#191c28,#12141d);
        border:1px solid ${P.line}; border-top:2px solid rgba(201,169,89,.34); border-radius:5px;
        color:${P.ink}; padding:.42rem .1rem .36rem; cursor:pointer; text-align:center; line-height:1.2;
        font-family:${SERIF}; transition:background-color .18s, border-color .18s, box-shadow .18s; }
      #ex-monochord .mono-key.et { border-top-color:rgba(125,167,217,.38); }
      #ex-monochord .mono-key .deg { display:block; font-size:1rem; font-style:italic; }
      #ex-monochord .mono-key .rat { display:block; font-family:${MONO}; font-size:.64rem;
        color:var(--ink-faint, ${P.inkFaint}); margin-top:3px; font-variant-numeric:lining-nums tabular-nums; }
      #ex-monochord .mono-key:hover { border-color:${P.goldDim}; }
      #ex-monochord .mono-key.et:hover { border-color:${P.azureDim}; }
      #ex-monochord .mono-key:active { transform:translateY(1px); }
      #ex-monochord .mono-key.on { border-color:${P.gold}; background:rgba(201,169,89,.17);
        box-shadow:0 0 14px -4px rgba(232,200,124,.7); }
      #ex-monochord .mono-key.on .deg { color:${P.goldBright}; }
      #ex-monochord .mono-key.et.on { border-color:${P.azure}; background:rgba(125,167,217,.15);
        box-shadow:0 0 14px -4px rgba(125,167,217,.75); }
      #ex-monochord .mono-key.et.on .deg { color:#c4d8f1; }
      #ex-monochord .mono-kbctl { margin-top:.8rem; }
      #ex-monochord canvas.mono-a { touch-action:pan-y; }
      #ex-monochord canvas.mono-a:focus-visible { outline:1px solid ${P.goldDim}; outline-offset:3px; }
      #ex-monochord canvas.mono-b { margin-top:1.1rem; touch-action:pan-y; }
      #ex-monochord .mono-slide .ctl { flex:1 1 20rem; }
      #ex-monochord .mono-slide input[type=range] { width:100%; }
      #ex-monochord .mono-ro { margin-top:.4rem; }
      @media (max-width: 560px) {
        #ex-monochord .mono-kb { gap:4px; }
        #ex-monochord .mono-key .deg { font-size:.84rem; }
        #ex-monochord .mono-key .rat { display:none; }
        #ex-monochord .mono-kb .rowlab { font-size:.74rem; padding-right:.15rem; }
        #ex-monochord .mono-acts { gap:.5rem 1rem; }
      }`;
    stage.appendChild(style);

    /* ---------- layout ---------- */
    const stageW = () => {
      try {
        const r = stage.getBoundingClientRect(), cs = getComputedStyle(stage);
        const w = r.width - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
        return w > 50 ? w : 800;
      } catch { return 800; }
    };
    const heightA = (w) => (w < 560 ? 426 : 470);
    const heightB = (w) => (w < 560 ? 262 : 256);

    const quest = ui.questBanner(stage, '');

    const optsA = { height: heightA(stageW()) };
    const A = cv.setupCanvas(stage, optsA);
    A.canvas.classList.add('mono-a');
    A.canvas.setAttribute('role', 'img');
    A.canvas.setAttribute('aria-label', 'A monochord seen from above, with its sixteen partials drawn beneath it. Drag the string to pluck it, or use the pluck and touch buttons below; focus here and use the arrow keys to step through the partials, and Enter to sound one.');
    A.canvas.tabIndex = 0;

    const acts = document.createElement('div');
    acts.className = 'mono-acts';
    stage.appendChild(acts);
    const grpP = document.createElement('div'); grpP.className = 'grp'; acts.appendChild(grpP);
    const grpT = document.createElement('div'); grpT.className = 'grp'; acts.appendChild(grpT);
    const labP = document.createElement('span'); labP.className = 'lab'; labP.textContent = 'pluck at'; grpP.appendChild(labP);
    for (const pk of PLUCKS) {
      const b = ui.button(grpP, pk.label, () => { everTouched = true; pluck(pk.beta, 0.62); }, { small: true });
      b.type = 'button';
      b.setAttribute('aria-label', `pluck the string ${pk.beta < 0.1 ? pk.word : 'at ' + pk.word}`);
      if (pk.label.length > 2) b.classList.add('word');
    }
    const labT = document.createElement('span'); labT.className = 'lab'; labT.textContent = 'touch at'; grpT.appendChild(labT);
    for (const fl of FLAGEOLETS) {
      const b = ui.button(grpT, fl.glyph, () => flageolet(fl), { small: true });
      b.type = 'button';
      b.setAttribute('aria-label', `touch the string at ${fl.word} and sound its harmonic`);
    }

    const DEFAULT_MATH = 'aₙ ∝ sin(nπβ)/n² · β = the pluck point · f₀ = 110 Hz';
    const mathEl = ui.mathline(stage, DEFAULT_MATH);
    ui.caption(stage,
      'Press the string, pull and release to pluck; β snaps to the marked fractions, and the buttons do the same. ' +
      'The diamonds are touch-points for harmonics. The dashed gold outline is the envelope an ideal plucked string ' +
      'never leaves, and the wave is slowed about a hundredfold for the eye. The bars are the partials in decibels, ' +
      'dying in real time beneath the dashed blue curve that the pluck point sets. Hover over a bar, or tap it, to hear ' +
      'that partial alone, see its mode, and watch the first <em>n</em> modes rebuild the plucked triangle. Along the ' +
      'lower edge lie the stops of the keyboard’s scale, and the loupe shows its two <em>mi</em>s: on a string a metre ' +
      'long they are about 3 mm apart.');

    const kbLabel = document.createElement('div');
    kbLabel.className = 'mono-kb-label';
    kbLabel.innerHTML = 'the string, stopped: one scale, two tunings · <i>do</i> = 2f₀ = 220 Hz · keys latch';
    stage.appendChild(kbLabel);
    const kb = document.createElement('div');
    kb.className = 'mono-kb';
    stage.appendChild(kb);
    buildKeyRow('ji', 'just');
    buildKeyRow('et', 'equal');

    const kbCtl = ui.controlRow(stage);
    kbCtl.classList.add('mono-kbctl');
    const relBtn = ui.button(kbCtl, 'release all', () => { releaseAll(); }, { small: true });
    relBtn.type = 'button';
    ui.toggle(kbCtl, {
      label: 'keys borrow my last pluck', value: false,
      onChange: (v) => { borrow = v; retimbre(); refreshDyad(); },
    });

    const optsB = { height: heightB(stageW()) };
    const B = cv.setupCanvas(stage, optsB);
    B.canvas.classList.add('mono-b');
    B.canvas.setAttribute('role', 'img');
    B.canvas.setAttribute('aria-label', 'The interval between the two notes you hold, under a lens in cents, with both notes’ partials drawn as rows of dots, joined where they lock or beat; the readout below gives the same numbers.');

    const slideCtl = ui.controlRow(stage);
    slideCtl.classList.add('mono-slide');
    const slider = ui.slider(slideCtl, {
      label: 'tune mi above do by ear',
      min: 380, max: 410, step: 0.1, value: 400,
      format: (v) => `${(nearMark(v, 0.06) ?? v).toFixed(2)} ¢`,
      onInput: onSlide,
    });

    const ro = ui.readout(stage, 'hold two keys, or slide mi: the readout will name the beating partials.');
    ro.el.classList.add('mono-ro');
    ro.el.setAttribute('aria-live', 'polite');

    ui.caption(stage,
      'Above, the interval itself under a lens, in cents, beside the pure ratio and the piano’s value; for the third ' +
      'also the Pythagorean 81 : 64 and the 395 cents that listeners in a 2024 study liked best with rich tones. Below, ' +
      'each dot is a partial of one of the two notes, sized by its level in the keys’ timbre. A green line joins partials ' +
      'that lock, a red one partials that miss, and the ribbon draws what the miss sounds like over the last two seconds: ' +
      'a swell and fade at exactly the difference of the two frequencies. Helmholtz judged such beating roughest at ' +
      'about thirty-three a second. The keys sound like a string plucked a tenth of the way along, bright enough to ' +
      'carry the fourth and fifth partials where a third’s beats live; let them borrow a midpoint pluck instead and the ' +
      'fourth partial is gone, and with it the tempered third’s churn.');

    ui.legendPanel(stage, `
      <p>Nicomachus of Gerasa, writing around 100 CE, tells how Pythagoras, passing a
      smithy, heard consonances ring from hammers weighing 12, 9, 8 and 6 units, hurried home,
      hung matching weights from strings, and heard the same intervals: the octave from 12&nbsp;:&nbsp;6,
      the fifth from 12&nbsp;:&nbsp;8, the fourth from 12&nbsp;:&nbsp;9. Later writers gave him the monochord too.
      None of it can be true as told. The monochord is first attested some two centuries after
      Pythagoras; a hammer’s pitch does not follow its weight; and a string’s frequency grows only
      as the <em>square root</em> of its tension, so weights in the ratio 2&nbsp;:&nbsp;1 give not an
      octave but √2, 600 cents, the tritone, squarely among the dissonances. Vincenzo Galilei,
      lutenist, father of Galileo, and by then at bitter odds over tuning with his old teacher
      Gioseffo Zarlino, hung the weights himself around 1588 and found that the octave needs
      four times the weight and the fifth nine to four; in 1636 Marin Mersenne’s
      <em>Harmonie universelle</em> gave the whole law. The half of the legend that survives
      every test is the monochord itself: divide the <em>length</em>, and the numbers keep their
      promise.</p>`);

    ui.speculationPanel(stage, `
      <p>Helmholtz’s answer, in 1863, was mechanical: partials a little apart beat, the ear
      dislikes the roughness, and small ratios please because their partials coincide instead.
      In 1965 Reinier Plomp and Willem Levelt refined it: two pure tones sound roughest about a
      quarter of a critical band apart and smooth once they are a whole band apart. The evidence
      since has grown stranger. Across more than 250 listeners, a liking for consonant chords
      tracked a liking for harmonic spectra, not a dislike of beats (2010). The Tsimane’ of the
      Bolivian Amazon, with little exposure to Western music, rated consonant and dissonant chords
      as equally pleasant, though they disliked acoustic roughness as Westerners do (2016); a
      follow-up found a small preference only among those more connected to the wider world (2025). And
      in 235,440 judgments, listeners hearing rich harmonic tones rated a major third near 395
      cents highest, sharp of the pure 386 and flat of the piano’s 400; the preference vanished
      with pure sine tones, and the authors suggest that listeners enjoy the slow beats for the
      richness they lend (2024). Whether the small whole numbers are found in the world or learned
      by the ear is still an open question.</p>`, 'is consonance in the numbers, or in us?');

    function buildKeyRow(row, labelText) {
      const lab = document.createElement('div');
      lab.className = `rowlab ${row}`;
      lab.textContent = labelText;
      kb.appendChild(lab);
      for (let i = 0; i < 8; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mono-key' + (row === 'et' ? ' et' : '');
        const rat = row === 'ji' ? `${JI[i][0]}/${JI[i][1]}` : `${ET_STEPS[i] * 100}¢`;
        b.innerHTML = `<span class="deg">${DEGREES[i]}</span><span class="rat">${rat}</span>`;
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', `${DEGREES[i]}, ${labelText} tuning, ${row === 'ji' ? 'ratio ' + JI[i][0] + ' to ' + JI[i][1] : ET_STEPS[i] * 100 + ' cents'}`);
        b.addEventListener('click', () => toggleKey(row, i, b, rat));
        kb.appendChild(b);
      }
    }

    /* ---------- clocks ---------- */
    const perfNow = () => performance.now() / 1000;
    function stamp() {
      const c = audio.getContext();
      const run = !!(c && c.state === 'running');
      return { t0a: run ? c.currentTime + 0.012 : 0, t0p: perfNow() + 0.012, run };
    }
    function elapsed(ex) {
      const c = audio.getContext();
      if (ex.run && c && c.state === 'running') return Math.max(0, c.currentTime - ex.t0a);
      return Math.max(0, perfNow() - ex.t0p);
    }
    function nowSec() {
      const c = audio.getContext();
      return c && c.state === 'running' ? c.currentTime : perfNow();
    }

    /* ---------- audio: pluck & flageolet banks ---------- */

    function killBanks() {
      const c = audio.getContext();
      for (const bank of banks) {
        if (bank.dead) continue;
        bank.dead = true;
        if (c) {
          audio.rampTo(bank.master.gain, 0, 0.015);
          for (const o of bank.oscs) { try { o.osc.stop(c.currentTime + 0.08); } catch { /* already stopped */ } }
        }
      }
    }

    function makeBank(t0, parts, masterLevel) {
      // parts: [{ freq, amp, tau }]; each osc ramps up in ~10 ms (no thump),
      // decays via setTargetAtTime, and is stopped + disconnected via onended.
      const c = audio.getContext();
      const master = c.createGain();
      master.gain.value = masterLevel;
      master.gain.setValueAtTime(masterLevel, t0);
      master.gain.setTargetAtTime(1e-4, t0 + 6.2, 0.3);   // belt and braces
      master.connect(bus.input);
      const bank = { master, oscs: [], dead: false, left: 0 };
      for (const p of parts) {
        if (Math.abs(p.amp) < 1e-4) continue;
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = p.freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(Math.abs(p.amp), t0 + 0.01);
        g.gain.setTargetAtTime(1e-4, t0 + 0.01, p.tau);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + clamp(p.tau * 7, 0.6, 8));
        bank.left++;
        osc.onended = () => {
          try { osc.disconnect(); g.disconnect(); } catch { /* gone */ }
          if (--bank.left === 0) {
            try { master.disconnect(); } catch { /* gone */ }
            const i = banks.indexOf(bank);
            if (i >= 0) banks.splice(i, 1);
          }
        };
        bank.oscs.push({ osc, g });
      }
      if (bank.left === 0) { try { master.disconnect(); } catch { /* gone */ } return bank; }
      banks.push(bank);
      if (banks.length > 3) {           // hard cap on concurrent banks
        const oldest = banks[0];
        if (!oldest.dead) { oldest.dead = true; audio.rampTo(oldest.master.gain, 0, 0.01); }
      }
      return bank;
    }

    function pluck(beta, strength) {
      const c = audio.ensureAudio();
      killBanks();
      const spec = pluckSpectrum(beta);
      currentSpec = spec;
      lastBeta = beta;
      const st = stamp();
      const parts = spec.map((a, i) => ({ freq: (i + 1) * F0, amp: a, tau: tauOf(i + 1) }));
      makeBank(c.currentTime + 0.012, parts, 0.55 * clamp(strength, 0.2, 1));
      const norm = envelopeNorm(beta);
      const s = clamp(strength, 0.2, 1);
      // the normalized spectrum rebuilds a triangle of height 1/norm, so scaling
      // by s·norm makes the drawn release match the visitor's pull
      excite = { kind: 'pluck', beta, spec, ...st, norm, strength: s, strengthVis: s * norm };
      everTouched = true;
      const snap = snapBeta(beta, 1e-9);
      mathEl.innerHTML = `aₙ ∝ sin(nπβ)/n² · ${betaNote(beta, snap.q ? snap : null, true)}`;
      if (Math.abs(beta - 0.5) < 1e-9) { qMid = true; refreshQuest(); }
      if (borrow) { retimbre(); refreshDyad(); }
      wakeA();
    }

    function flageolet(fl) {
      const c = audio.ensureAudio();
      killBanks();
      const st = stamp();
      const parts = FLAG_AMPS.map((a, i) => ({ freq: (i + 1) * fl.den * F0, amp: a, tau: 2.4 / (i + 1) }));
      makeBank(c.currentTime + 0.012, parts, 0.42);
      excite = { kind: 'flag', num: fl.num, den: fl.den, name: fl.name, ...st };
      everTouched = true;
      mathEl.innerHTML =
        `touched at ${fl.num}/${fl.den} → only modes with a node there survive: ` +
        `n = ${fl.den}, ${2 * fl.den}, ${3 * fl.den}, … · f = ${fl.den}·f₀ = ${fl.den * F0} Hz, ${fl.name}`;
      wakeA();
    }

    function betaNote(beta, snap, released) {
      if (snap && snap.q) {
        const q = snap.q;
        return `β = ${snap.p}/${q} → sin(nπβ) = 0 for n = ${q}, ${2 * q}, ${3 * q}, … — those harmonics ` +
          (released ? `fall silent; a touch at ${snap.p}/${q} would keep exactly them` : 'will fall silent');
      }
      return `β = ${beta.toFixed(3)} — no harmonic exactly silenced`;
    }

    function tapPartial(n) {
      const c = audio.ensureAudio();
      if (!c) return;
      audio.playTone(bus, { freq: n * F0, dur: 1.1, level: 0.24, attack: 0.012, release: 0.45 });
    }

    /* ---------- audio: sustained keys and the sliding third ---------- */

    const keySpec = () => (borrow ? currentSpec : KEY_SPEC);
    const restBeta = () => (borrow ? lastBeta : KEY_BETA);

    function keyWave(c) {
      const s = keySpec();
      if (waveCache && waveFor === s) return waveCache;
      const real = new Float32Array(NH + 1);
      const imag = new Float32Array(NH + 1);
      let any = false;
      for (let n = 1; n <= NH; n++) { imag[n] = s[n - 1]; if (Math.abs(imag[n]) > 1e-9) any = true; }
      if (!any) imag[1] = 1;
      waveCache = c.createPeriodicWave(real, imag);
      waveFor = s;
      return waveCache;
    }

    function startTone(freq, level = 0.17) {
      const c = audio.ensureAudio();
      const osc = c.createOscillator();
      osc.setPeriodicWave(keyWave(c));
      osc.frequency.value = freq;          // set before start, while the gain is 0
      const g = c.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(bus.input);
      osc.start();
      audio.rampTo(g.gain, level, 0.02);
      return { osc, g };
    }

    function stopTone(t) {
      const c = audio.getContext();
      if (!c || !t) return;
      audio.rampTo(t.g.gain, 0, 0.04);
      try { t.osc.stop(c.currentTime + 0.35); } catch { /* already stopped */ }
      t.osc.onended = () => { try { t.osc.disconnect(); t.g.disconnect(); } catch { /* gone */ } };
    }

    // Crossfade every sounding note onto the current key timbre.
    function retimbre() {
      waveCache = null;
      const c = audio.getContext();
      if (!c || paused) return;
      for (const v of voices.values()) {
        const nt = startTone(v.freq);
        stopTone(v);
        v.osc = nt.osc; v.g = nt.g;
      }
      if (slide) {
        const lo = startTone(ROOT), hi = startTone(ROOT * Math.pow(2, slide.cents / 1200));
        stopTone(slide.lo); stopTone(slide.hi);
        slide.lo = lo; slide.hi = hi;
      }
    }

    function keyFreq(row, i) {
      return row === 'ji' ? ROOT * JI[i][0] / JI[i][1] : ROOT * Math.pow(2, ET_STEPS[i] / 12);
    }

    function toggleKey(row, i, el, rat) {
      const id = `${row}-${i}`;
      if (voices.has(id)) { releaseKey(id); refreshDyad(); return; }
      stopSlide();
      if (voices.size >= 4) releaseKey(voices.keys().next().value);   // cap held voices
      const t = startTone(keyFreq(row, i));
      voices.set(id, { ...t, freq: keyFreq(row, i), deg: DEGREES[i], row, rat, el });
      el.classList.add('on');
      el.setAttribute('aria-pressed', 'true');
      refreshDyad();
    }

    function releaseKey(id) {
      const v = voices.get(id);
      if (!v) return;
      voices.delete(id);
      v.el.classList.remove('on');
      v.el.setAttribute('aria-pressed', 'false');
      stopTone(v);
    }

    function stopSlide() {
      if (!slide) return;
      stopTone(slide.lo); stopTone(slide.hi);
      slide = null;
    }

    function releaseAll() {
      for (const id of [...voices.keys()]) releaseKey(id);
      stopSlide();
      refreshDyad();
    }

    function nearMark(v, tol) {
      for (const L of SLIDE_MARKS) if (Math.abs(v - L) < tol) return L;
      return null;
    }

    function onSlide(v) {
      if (paused) return;
      const snapped = nearMark(v, 0.45);
      const c = snapped ?? v;
      if (snapped != null && Math.abs(snapped - v) > 1e-9) slider.set(snapped);
      const f = ROOT * Math.pow(2, c / 1200);
      if (!slide) {
        for (const id of [...voices.keys()]) releaseKey(id);
        slide = { lo: startTone(ROOT), hi: startTone(f), cents: c };
      } else {
        audio.glideFreq(slide.hi.osc.frequency, f, 0.06);
        slide.cents = c;
      }
      if (Math.abs(c - JUST3) < 0.05) qSlide = true;
      refreshDyad();
    }

    function keyLabel(v) { return `${v.deg}·${v.row === 'ji' ? 'just' : 'equal'}`; }

    // Everything sounding on the keyboard side, lowest first.
    function sounding() {
      if (slide) {
        return [
          { freq: ROOT, deg: 'do', row: 'ji', label: 'do', rat: '1/1' },
          { freq: ROOT * Math.pow(2, slide.cents / 1200), deg: 'mi', row: 'slide', label: 'mi, slid', rat: `${slide.cents.toFixed(2)}¢` },
        ];
      }
      return [...voices.values()]
        .map((v) => ({ freq: v.freq, deg: v.deg, row: v.row, label: keyLabel(v), rat: v.rat }))
        .sort((a, b) => a.freq - b.freq);
    }

    /* ---------- the readout and the quest ---------- */

    let DY = { n: 0, notes: [] };

    function dyadState() {
      const s = sounding();
      if (s.length !== 2) return { n: s.length, notes: s };
      const [lo, hi] = s;
      const c = cents(hi.freq / lo.freq);
      return { n: 2, notes: s, lo, hi, c, lm: dyadLandmarks(c), ab: audibleBeat(lo.freq, hi.freq, keySpec()) };
    }

    function beatText(d) {
      const { lo, hi, ab } = d;
      const { ideal } = ab;
      const fm = ideal.m * lo.freq, fn = ideal.n * hi.freq;
      if (ideal.d < 30 && !ab.idealAudible) {
        const who = ab.silentHi ? `partial ${ideal.n} of ${hi.label}` : `partial ${ideal.m} of ${lo.label}`;
        const why = borrow ? ' (your last pluck removed it)' : '';
        return `${who} is silent in this timbre${why}, so the ${ideal.d < 0.05 ? 'lock' : ideal.d.toFixed(2) + ' beats/s'} ` +
          'cannot be heard; pluck somewhere else, or let the keys keep their own timbre';
      }
      if (ideal.d < 0.05) {
        return `partial ${ideal.m} of ${lo.label} = partial ${ideal.n} of ${hi.label} = ${fm.toFixed(2)} Hz — locked, 0 beats/s`;
      }
      if (ideal.d < 30) {
        return `partial ${ideal.m} of ${lo.label}, ${fm.toFixed(2)} Hz, against partial ${ideal.n} of ${hi.label}, ` +
          `${fn.toFixed(2)} Hz → ${ideal.d.toFixed(2)} beats/s`;
      }
      return 'no two low partials come within 30 Hz of each other';
    }

    function refreshDyad() {
      const has = (id) => voices.has(id);
      const root = has('ji-0') || has('et-0');
      if (root && has('ji-2')) qJI3 = true;
      if (root && has('et-2')) qET3 = true;
      refreshQuest();

      DY = dyadState();
      if (DY.n === 0) {
        ro.set('hold two keys, or slide mi: the readout will name the beating partials.');
      } else if (DY.n === 1) {
        const v = DY.notes[0];
        ro.set(`${v.label} (${v.rat}) = ${v.freq.toFixed(2)} Hz · ${cents(v.freq / ROOT).toFixed(2)} ¢ above do · ` +
          `stopped at ${stopFraction(v.freq).toFixed(4)} of the string`);
      } else if (DY.n === 2) {
        const art = DY.lm.name === 'octave' ? 'an' : 'a';
        ro.set(`${DY.hi.label} over ${DY.lo.label} = ${DY.c.toFixed(2)} ¢, ${art} ${DY.lm.name}\n${beatText(DY)}`);
      } else {
        ro.set(`${DY.notes.map((n) => n.label).join(' + ')} — hold exactly two to read the beats`);
      }
      rebuildB();
      wakeB();
      wakeA();
    }

    function refreshQuest() {
      if (qMid && qJI3 && qET3 && qSlide) {
        quest.done('Heard: the just third locks its partials, 1100 Hz on 1100 Hz; the tempered third misses by 8.73 Hz and churns that many times a second; and you found the lock by ear, the way a tuner does. That dyad is the entire war.');
      } else {
        quest.set(
          `${qMid ? '✓' : '①'} pluck the exact midpoint and watch the even harmonics fall silent · ` +
          `${(qJI3 && qET3) ? '✓' : '②'} hold <em>do</em> and <em>mi</em> on the just row, then <em>mi</em> on the equal row, and compare the beats · ` +
          `${qSlide ? '✓' : '③'} slide <em>mi</em> until the beating stops`);
      }
    }

    /* ---------- drawing helpers ---------- */

    const glow = {
      gold: cv.glowSprite(P.goldBright, 28),
      azure: cv.glowSprite(P.azure, 28),
      verdant: cv.glowSprite(P.verdant, 28),
      crimson: cv.glowSprite(P.crimson, 28),
      ink: cv.glowSprite('#e8e2d0', 24),
    };
    const rowColor = (row) => (row === 'et' ? P.azure : row === 'slide' ? P.ink : P.gold);
    const rowGlow = (row) => (row === 'et' ? glow.azure : row === 'slide' ? glow.ink : glow.gold);

    function caps(c, on, px = 1.4) {
      try { c.fontVariantCaps = on ? 'all-small-caps' : 'normal'; } catch { /* unsupported */ }
      try { c.letterSpacing = on ? `${px}px` : '0px'; } catch { /* unsupported */ }
    }
    function rrect(c, x, y, w, h, r) {
      const rr = Math.max(0, Math.min(r, w / 2, h / 2));
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }
    function diamond(c, x, y, s) {
      c.beginPath();
      c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y);
      c.closePath();
    }
    function fracLabel(c, x, y, p, q) {
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.fillText(String(p), x, y - 2);
      c.fillText(String(q), x, y + 9.5);
      const w = Math.max(c.measureText(String(p)).width, c.measureText(String(q)).width) + 3;
      c.fillRect(x - w / 2, y + 0.4, w, 0.9);
    }

    // sin(nπ i/NPTS) once, for every point and mode
    const SIN = new Float32Array((NPTS + 1) * NH);
    for (let i = 0; i <= NPTS; i++) {
      for (let n = 1; n <= NH; n++) SIN[i * NH + n - 1] = Math.sin(n * Math.PI * i / NPTS);
    }
    const ys = new Float32Array(NPTS + 1);
    const modeK = new Float32Array(NH);

    /* ---------- canvas A: the instrument and its spectrum ---------- */

    const layA = document.createElement('canvas');
    let GA = null;

    function geoA() {
      const W = Math.max(160, A.width), H = Math.max(260, A.height);
      const narrow = W < 560;
      const mx = narrow ? 26 : Math.max(46, W * 0.05);
      const sx0 = mx, sx1 = W - mx, sw = Math.max(60, sx1 - sx0);
      const bxPad = narrow ? 16 : 28;
      const boxX0 = sx0 - bxPad, boxX1 = sx1 + bxPad;
      const boxTop = 10;
      const band = narrow ? 36 : 40;
      const amp = narrow ? 34 : 40;
      const sy = boxTop + band + amp + 4;
      const boxBot = sy + amp + 4 + band;
      const fracY = boxTop + (narrow ? 14 : 16);
      const flagY = sy - amp - 3;
      const rulerY = sy + amp + 12;
      const spLab = boxBot + (narrow ? 26 : 30);
      const spTop = spLab + 14, spBot = H - (narrow ? 26 : 30);
      const spH = Math.max(24, spBot - spTop);
      const colW = sw / NH;
      const loupe = { x: sx0 + 0.72 * sw, y: rulerY + 7, r: narrow ? 15 : 21 };
      return { W, H, narrow, sx0, sx1, sw, boxX0, boxX1, boxTop, boxBot, band, amp, sy, fracY, flagY,
        rulerY, spLab, spTop, spBot, spH, colW, loupe };
    }
    const xAt = (g, f) => g.sx0 + f * g.sw;
    const dbY = (g, a) => {
      if (!(a > 1e-9)) return g.spBot;
      const f = clamp((20 * Math.log10(a / AREF) + RANGE) / RANGE, 0, 1);
      return g.spBot - f * g.spH * 0.94;
    };

    let gradGold = null, gradAzure = null, gradGhost = null, gradGhostHot = null;

    function rebuildA() {
      const g = geoA();
      GA = g;
      const dpr = A.dpr || 1;
      layA.width = Math.max(1, Math.round(A.width * dpr));
      layA.height = Math.max(1, Math.round(A.height * dpr));
      const c = layA.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, g.W, g.H);

      // the soundbox, from above
      const grd = c.createLinearGradient(0, g.boxTop, 0, g.boxBot);
      grd.addColorStop(0, '#1a1d29');
      grd.addColorStop(1, '#11131b');
      rrect(c, g.boxX0 + 0.5, g.boxTop + 0.5, g.boxX1 - g.boxX0 - 1, g.boxBot - g.boxTop - 1, 7);
      c.fillStyle = grd; c.fill();
      c.strokeStyle = P.line; c.lineWidth = 1; c.stroke();
      rrect(c, g.boxX0 + 5.5, g.boxTop + 5.5, g.boxX1 - g.boxX0 - 11, g.boxBot - g.boxTop - 11, 4);
      c.strokeStyle = 'rgba(201,169,89,0.2)'; c.lineWidth = 0.8; c.stroke();

      // κανών, lettered in the corner
      c.font = `italic ${g.narrow ? 11 : 12.5}px ${SERIF}`;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = 'rgba(201,169,89,0.62)';
      c.fillText('κανών', g.boxX0 + 12, g.fracY + 7);

      // dead lengths of string to the pins, then the two bridges
      c.strokeStyle = P.goldDim; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(g.boxX0 + 9, g.sy); c.lineTo(g.sx0, g.sy);
      c.moveTo(g.sx1, g.sy); c.lineTo(g.boxX1 - 9, g.sy);
      c.stroke();
      for (const px of [g.boxX0 + 9, g.boxX1 - 9]) {
        c.fillStyle = '#0c0d12'; c.beginPath(); c.arc(px, g.sy, 3.2, 0, TAU); c.fill();
        c.strokeStyle = P.goldDim; c.lineWidth = 1; c.stroke();
      }
      for (const bx of [g.sx0, g.sx1]) {
        const bg = c.createLinearGradient(bx - 3, 0, bx + 3, 0);
        bg.addColorStop(0, P.goldDim); bg.addColorStop(0.5, P.goldBright); bg.addColorStop(1, P.goldDim);
        rrect(c, bx - 3, g.sy - 15, 6, 30, 1.5);
        c.fillStyle = bg; c.fill();
      }

      // fraction rulings along the upper edge; on a narrow string the labels of
      // close neighbours (⅕ ¼, ¾ ⅘) are eased apart while their ticks stay exact
      c.font = `9.5px ${MONO}`;
      const fr = SNAPS.map(([p, q]) => ({ p, q, x: xAt(g, p / q) })).sort((a, b) => a.x - b.x);
      fr.forEach((f) => { f.lx = f.x; });
      for (let i = 1; i < fr.length; i++) {
        const d = fr[i].lx - fr[i - 1].lx, need = 17;
        if (d < need) { fr[i - 1].lx -= (need - d) / 2; fr[i].lx += (need - d) / 2; }
      }
      for (const { p, q, x, lx } of fr) {
        const isFlag = FLAGEOLETS.some((f) => f.num === p && f.den === q);
        c.fillStyle = P.inkFaint;
        fracLabel(c, lx, g.fracY, p, q);
        c.strokeStyle = GHOST; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x + 0.5, g.fracY + 15);
        c.lineTo(x + 0.5, isFlag ? g.flagY - 7 : g.flagY - 1);
        c.stroke();
        if (!isFlag) { c.fillStyle = P.inkFaint; c.beginPath(); c.arc(x, g.flagY + 1, 1.3, 0, TAU); c.fill(); }
      }

      // the keyboard's scale, ruled along the lower edge: just above, equal below
      const xs = (i, row) => xAt(g, stopFraction(keyFreq(row, i)));
      c.strokeStyle = 'rgba(138,116,64,0.8)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(xs(7, 'ji') - 10, g.rulerY + 0.5); c.lineTo(xs(0, 'ji') + 10, g.rulerY + 0.5); c.stroke();
      for (let i = 0; i < 8; i++) {
        c.strokeStyle = P.gold;
        c.beginPath(); c.moveTo(xs(i, 'ji') + 0.5, g.rulerY); c.lineTo(xs(i, 'ji') + 0.5, g.rulerY - 6); c.stroke();
        c.strokeStyle = P.azure;
        c.beginPath(); c.moveTo(xs(i, 'et') + 0.5, g.rulerY + 1); c.lineTo(xs(i, 'et') + 0.5, g.rulerY + 7); c.stroke();
      }
      c.font = `italic ${g.narrow ? 10.5 : 11.5}px ${SERIF}`;
      c.textAlign = 'center'; c.fillStyle = P.inkDim;
      const shown = g.narrow ? [0, 2, 4, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
      for (const i of shown) {
        // do′ and ti stand 1/60 of the string apart: set do′ to the left of its stop
        c.textAlign = i === 7 ? 'right' : 'center';
        c.fillText(DEGREES[i], xs(i, 'ji') + (i === 7 ? 3 : 0), g.rulerY + 20);
      }
      c.textAlign = 'center';
      c.font = `${g.narrow ? 9 : 10}px ${SERIF}`;
      caps(c, true, 1.2);
      c.textAlign = 'right'; c.fillStyle = P.inkFaint;
      const stopWord = g.narrow ? 'stops' : 'the keys’ stops';
      if (c.measureText(stopWord).width < xs(7, 'ji') - 22 - (g.boxX0 + 12)) c.fillText(stopWord, xs(7, 'ji') - 18, g.rulerY + 4);
      caps(c, false);

      // the loupe on the two stops for mi
      const L = g.loupe;
      const fj = stopFraction(ROOT * 5 / 4), fe = stopFraction(ROOT * Math.pow(2, 4 / 12));
      const xm = xAt(g, fj);
      c.strokeStyle = 'rgba(201,169,89,0.45)'; c.lineWidth = 0.8; c.setLineDash([2, 3]);
      const ang = Math.PI * 1.12;
      const ex = L.x + Math.cos(ang) * (L.r + 1), ey = L.y + Math.sin(ang) * (L.r + 1);
      c.beginPath(); c.moveTo(xm, g.rulerY - 8);
      c.quadraticCurveTo((xm + ex) / 2, g.rulerY - 22, ex, ey);
      c.stroke(); c.setLineDash([]);
      c.save();
      c.beginPath(); c.arc(L.x, L.y, Math.max(1, L.r), 0, TAU);
      c.fillStyle = '#090a0f'; c.fill();
      c.clip();
      const gap = L.r * 0.95;   // the 3.15 mm between the two stops, magnified to fill the glass
      c.strokeStyle = 'rgba(169,164,147,0.35)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(L.x - L.r, L.y + 0.5); c.lineTo(L.x + L.r, L.y + 0.5); c.stroke();
      const mid = (fj + fe) / 2;
      for (let k = -8; k <= 8; k++) {
        const x = L.x + ((Math.round(mid * 1000) + k) / 1000 - mid) / (fj - fe) * gap;
        c.beginPath(); c.moveTo(x, L.y); c.lineTo(x, L.y - 2.5); c.stroke();
      }
      c.lineWidth = 1.6;
      c.strokeStyle = P.gold;
      c.beginPath(); c.moveTo(L.x + gap / 2, L.y); c.lineTo(L.x + gap / 2, L.y - L.r * 0.62); c.stroke();
      c.strokeStyle = P.azure;
      c.beginPath(); c.moveTo(L.x - gap / 2, L.y + 1); c.lineTo(L.x - gap / 2, L.y + L.r * 0.62); c.stroke();
      c.restore();
      c.strokeStyle = P.gold; c.lineWidth = 1.3;
      c.beginPath(); c.arc(L.x, L.y, Math.max(1, L.r), 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(201,169,89,0.25)'; c.lineWidth = 3;
      c.beginPath(); c.arc(L.x, L.y, Math.max(1, L.r + 2.2), 0, TAU); c.stroke();
      c.strokeStyle = P.goldDim; c.lineWidth = 2.6; c.lineCap = 'round';
      const hA = Math.PI / 4;
      c.beginPath();
      c.moveTo(L.x + Math.cos(hA) * (L.r + 2), L.y + Math.sin(hA) * (L.r + 2));
      c.lineTo(L.x + Math.cos(hA) * (L.r + (g.narrow ? 6 : 8)), L.y + Math.sin(hA) * (L.r + (g.narrow ? 6 : 8)));
      c.stroke(); c.lineCap = 'butt';
      const lx = L.x + L.r + 13;
      c.textAlign = 'left'; c.fillStyle = P.inkDim;
      c.font = `italic 11px ${SERIF}`;
      const l2 = '3 mm apart on a metre of string';
      if (lx + c.measureText(l2).width < g.boxX1 - 10) {
        let px = lx;
        for (const [w, col] of [['mi, ', P.inkDim], ['just', P.gold], [' and ', P.inkDim], ['equal', P.azure], [':', P.inkDim]]) {
          c.fillStyle = col; c.fillText(w, px, L.y - 2); px += c.measureText(w).width;
        }
        c.fillStyle = P.inkDim;
        c.fillText(l2, lx, L.y + 11);
      } else {
        c.font = `9px ${MONO}`; c.fillText('3 mm', lx - 2, L.y + 3);
      }

      // spectrum furniture: dB rules, baseline, partial numbers
      c.font = `8.5px ${MONO}`;
      for (const db of [0, -20, -40]) {
        const y = Math.round(g.spBot - ((db + RANGE) / RANGE) * g.spH * 0.94) + 0.5;
        c.strokeStyle = 'rgba(74,72,64,0.55)'; c.lineWidth = 1; c.setLineDash([2, 4]);
        c.beginPath(); c.moveTo(g.sx0, y); c.lineTo(g.sx1, y); c.stroke(); c.setLineDash([]);
        c.fillStyle = P.inkFaint; c.textAlign = 'left';
        c.fillText(db === 0 ? '0 dB' : `−${-db}`, g.sx1 + 5, y + 3);
      }
      c.strokeStyle = P.line;
      c.beginPath(); c.moveTo(g.sx0, g.spBot + 0.5); c.lineTo(g.sx1, g.spBot + 0.5); c.stroke();
      c.font = `9.5px ${MONO}`; c.textAlign = 'center'; c.fillStyle = P.inkFaint;
      for (let n = 1; n <= NH; n++) {
        if (g.colW >= 22 || n % 2 === 1) c.fillText(String(n), g.sx0 + (n - 0.5) * g.colW, g.spBot + 14);
      }

      gradGold = c.createLinearGradient(0, g.spTop, 0, g.spBot);
      gradGold.addColorStop(0, P.goldBright); gradGold.addColorStop(0.55, P.gold); gradGold.addColorStop(1, P.goldDim);
      gradGhost = c.createLinearGradient(0, g.spTop, 0, g.spBot);
      gradGhost.addColorStop(0, 'rgba(201,169,89,0.2)'); gradGhost.addColorStop(1, 'rgba(201,169,89,0.03)');
      gradGhostHot = c.createLinearGradient(0, g.spTop, 0, g.spBot);
      gradGhostHot.addColorStop(0, 'rgba(232,200,124,0.34)'); gradGhostHot.addColorStop(1, 'rgba(201,169,89,0.06)');
      gradAzure = c.createLinearGradient(0, g.spTop, 0, g.spBot);
      gradAzure.addColorStop(0, '#c4d8f1'); gradAzure.addColorStop(0.55, P.azure); gradAzure.addColorStop(1, P.azureDim);
    }

    function spectrumNow(t) {
      const out = new Float64Array(NH);
      if (!excite) return out;
      if (excite.kind === 'pluck') {
        for (let n = 1; n <= NH; n++) out[n - 1] = Math.abs(excite.spec[n - 1]) * Math.exp(-t / tauOf(n));
      } else {
        for (let m = 1; m <= 3; m++) {
          const idx = m * excite.den;
          if (idx <= NH) out[idx - 1] = FLAG_AMPS[m - 1] * Math.exp(-t / (2.4 / m));
        }
      }
      return out;
    }

    function drawA() {
      const g = GA;
      if (!g) return;
      const ctx = A.ctx;
      ctx.clearRect(0, 0, A.width, A.height);
      ctx.drawImage(layA, 0, 0, A.width, A.height);
      let t = 0;
      if (excite) { t = elapsed(excite); if (t > 8.2) excite = null; }

      drawHeldStops(ctx, g);
      const inspect = hoverN && !drag;
      if (excite && excite.kind === 'pluck' && !drag && !inspect) drawParallelogram(ctx, g, t);
      if (inspect) {
        drawModeGhost(ctx, g, hoverN);
        if (!excite || excite.kind === 'pluck') drawPartialSum(ctx, g, hoverN, excite ? excite.beta : restBeta());
      }
      drawString(ctx, g, t, inspect ? 0.32 : 1);
      drawTouchPoints(ctx, g);
      drawSpectrum(ctx, g, t);
    }

    function drawHeldStops(ctx, g) {
      for (const v of sounding()) {
        const x = xAt(g, stopFraction(v.freq));
        const col = rowColor(v.row);
        rowGlow(v.row).draw(ctx, x, g.rulerY, 0.8);
        ctx.fillStyle = col;
        ctx.fillRect(x - 1, v.row === 'et' ? g.rulerY : g.rulerY - 8, 2, 8);
        // a movable bridge set under the string
        rrect(ctx, x - 2, g.sy - 10, 4, 20, 1.2);
        ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      }
    }

    function drawParallelogram(ctx, g, t) {
      const s = excite.strength * Math.exp(-t / tauOf(1));
      const pts = pluckParallelogram(excite.beta, s);
      ctx.strokeStyle = 'rgba(201,169,89,0.42)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath();
      pts.forEach(([u, v], i) => {
        const x = xAt(g, u), y = g.sy - v * g.amp;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    }

    function drawModeGhost(ctx, g, n) {
      const A0 = g.amp * 0.62;
      ctx.fillStyle = 'rgba(125,167,217,0.07)';
      ctx.beginPath();
      for (let i = 0; i <= NPTS; i++) {
        const x = g.sx0 + (i / NPTS) * g.sw, y = g.sy - A0 * SIN[i * NH + n - 1];
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let i = NPTS; i >= 0; i--) ctx.lineTo(g.sx0 + (i / NPTS) * g.sw, g.sy + A0 * SIN[i * NH + n - 1]);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(125,167,217,0.75)'; ctx.lineWidth = 1;
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i <= NPTS; i++) {
          const x = g.sx0 + (i / NPTS) * g.sw, y = g.sy - sgn * A0 * SIN[i * NH + n - 1];
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = P.azure;
      for (let k = 1; k < n; k++) { ctx.beginPath(); ctx.arc(xAt(g, k / n), g.sy, 2.2, 0, TAU); ctx.fill(); }
    }

    // Bernoulli's claim, one term at a time: the shape the string was released in
    // (a triangle peaked at β) rebuilt from its first n modes, beside the target.
    // Sweep across the bars and the kinked triangle assembles from smooth sines.
    function drawPartialSum(ctx, g, n, beta) {
      const H = g.amp * 0.84;
      ctx.strokeStyle = 'rgba(232,226,208,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(g.sx0, g.sy); ctx.lineTo(xAt(g, beta), g.sy - H); ctx.lineTo(g.sx1, g.sy);
      ctx.stroke(); ctx.setLineDash([]);
      for (let k = 1; k <= n; k++) modeK[k - 1] = harmonicAmp(k, beta);
      for (let i = 0; i <= NPTS; i++) {
        let y = 0;
        const row = i * NH;
        for (let k = 0; k < n; k++) y += modeK[k] * SIN[row + k];
        ys[i] = y;
      }
      ctx.strokeStyle = '#e8e2d0'; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let i = 0; i <= NPTS; i++) {
        const x = g.sx0 + (i / NPTS) * g.sw, y = g.sy - ys[i] * H;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    function strokeYs(ctx, g, color, dim = 1) {
      for (const [lw, alpha] of [[5, 0.16], [1.8, 1]]) {
        ctx.strokeStyle = color; ctx.globalAlpha = alpha * dim; ctx.lineWidth = lw;
        ctx.beginPath();
        for (let i = 0; i <= NPTS; i++) {
          const x = g.sx0 + (i / NPTS) * g.sw, y = g.sy - ys[i] * g.amp;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    function drawString(ctx, g, t, dim = 1) {
      if (drag) {
        const px = xAt(g, drag.beta), py = g.sy - drag.h * g.amp;
        ctx.strokeStyle = GHOST; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(g.sx0, g.sy); ctx.lineTo(g.sx1, g.sy); ctx.stroke();
        ctx.setLineDash([]);
        for (const [lw, alpha] of [[5, 0.16], [1.8, 1]]) {
          ctx.strokeStyle = P.goldBright; ctx.globalAlpha = alpha; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(g.sx0, g.sy); ctx.lineTo(px, py); ctx.lineTo(g.sx1, g.sy); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
        glow.gold.draw(ctx, px, py, 0.9);
        ctx.fillStyle = P.goldBright;
        ctx.beginPath(); ctx.arc(px, py, 3.6, 0, TAU); ctx.fill();
        const lab = `β = ${drag.snap ? `${drag.snap.p}/${drag.snap.q}` : drag.beta.toFixed(3)}`;
        ctx.font = `11px ${MONO}`; ctx.fillStyle = P.ink; ctx.textBaseline = 'middle';
        const right = px < g.sx1 - 90;
        ctx.textAlign = right ? 'left' : 'right';
        ctx.fillText(lab, px + (right ? 15 : -15), py);
        ctx.textBaseline = 'alphabetic';
        return;
      }
      if (excite) {
        const osc = !reduced;
        if (excite.kind === 'pluck') {
          for (let n = 1; n <= NH; n++) {
            modeK[n - 1] = excite.spec[n - 1] * excite.strengthVis * Math.exp(-t / tauOf(n)) *
              (osc ? Math.cos(TAU * n * FVIS * t) : 1);
          }
          for (let i = 0; i <= NPTS; i++) {
            let y = 0;
            const row = i * NH;
            for (let n = 0; n < NH; n++) y += modeK[n] * SIN[row + n];
            ys[i] = y;
          }
          strokeYs(ctx, g, P.gold, dim);
        } else {
          const den = excite.den;
          let tot = 0;
          for (const a of FLAG_AMPS) tot += a;
          for (let i = 0; i <= NPTS; i++) {
            let y = 0;
            for (let m = 1; m <= 3; m++) {
              const n = m * den;
              if (n > NH) continue;
              y += (FLAG_AMPS[m - 1] / tot) * SIN[i * NH + n - 1] * Math.exp(-t / (2.4 / m)) *
                (osc ? Math.cos(TAU * n * FVIS * t) : 1);
            }
            ys[i] = 0.62 * y;
          }
          strokeYs(ctx, g, P.azure, dim);
          ctx.fillStyle = P.inkDim;
          for (let k = 1; k < den; k++) { ctx.beginPath(); ctx.arc(xAt(g, k / den), g.sy, 2.4, 0, TAU); ctx.fill(); }
          const tx = xAt(g, excite.num / den);
          glow.azure.draw(ctx, tx, g.sy, 1.05);
          ctx.strokeStyle = '#c4d8f1'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(tx, g.sy, 7.5, 0, TAU); ctx.stroke(); ctx.lineWidth = 1;
        }
        return;
      }
      // at rest
      for (const [lw, alpha] of [[5, 0.1], [1.4, 1]]) {
        ctx.strokeStyle = P.gold; ctx.globalAlpha = alpha * (dim < 1 ? 0.55 : 1); ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(g.sx0, g.sy); ctx.lineTo(g.sx1, g.sy); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      if (!everTouched && dim === 1) {
        ctx.fillStyle = P.inkFaint; ctx.font = `italic ${g.narrow ? 12 : 13}px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.fillText('press the string, pull, release', (g.sx0 + g.sx1) / 2, g.sy - 14);
      }
    }

    function drawTouchPoints(ctx, g) {
      FLAGEOLETS.forEach((fl, i) => {
        const x = xAt(g, fl.num / fl.den);
        const active = excite && excite.kind === 'flag' && excite.den === fl.den;
        const hot = active || hoverFlag === i;
        if (hot) glow.azure.draw(ctx, x, g.flagY, 0.75);
        diamond(ctx, x, g.flagY, 4.6);
        ctx.fillStyle = hot ? P.azure : P.azureDim; ctx.fill();
        ctx.strokeStyle = hot ? '#c4d8f1' : 'rgba(125,167,217,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
      });
    }

    function stateLabel(g) {
      // [small-caps words, mono detail]
      if (hoverN) {
        const f = hoverN * F0;
        let db = '';
        let why = '';
        let sum = '';
        const pl = excite && excite.kind === 'pluck';
        if (pl || !excite) {
          const beta = pl ? excite.beta : restBeta();
          const a = pl ? Math.abs(excite.spec[hoverN - 1]) * Math.exp(-elapsed(excite) / tauOf(hoverN))
            : Math.abs(keySpec()[hoverN - 1]);
          db = a > 1e-9 ? ` · ${(20 * Math.log10(a / AREF)).toFixed(1).replace('-', '−')} dB` : '';
          if (Math.abs(Math.sin(hoverN * Math.PI * beta)) < 0.004) {
            why = g.narrow ? ' · node at the pluck: silent' : ' · a node sits at the pluck point: silent';
          }
          if (!g.narrow) sum = hoverN === 1 ? ' · pale line: mode 1 alone' : ` · pale line: modes 1–${hoverN} summed`;
        }
        return [`partial ${hoverN}`, `${f} Hz${db}${why}${sum}`];
      }
      if (drag) {
        return ['release to hear',
          drag.snap ? `β = ${drag.snap.p}/${drag.snap.q} → harmonics ${drag.snap.q}, ${2 * drag.snap.q}, ${3 * drag.snap.q} … silent`
            : `β = ${drag.beta.toFixed(3)}`];
      }
      if (excite && excite.kind === 'pluck') {
        const s = snapBeta(excite.beta, 1e-9);
        return ['your pluck', `β = ${s.q ? `${s.p}/${s.q}` : excite.beta.toFixed(3)} · partials of f₀ = 110 Hz, in dB`];
      }
      if (excite && excite.kind === 'flag') {
        return [`touched at ${excite.num}/${excite.den}`, `only multiples of ${excite.den} survive · ${excite.den * F0} Hz`];
      }
      return ['the keys’ timbre', borrow ? 'borrowed from your last pluck' : 'a string plucked at 1/10'];
    }

    function drawSpectrum(ctx, g, t) {
      const [words, detail] = stateLabel(g);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = `${g.narrow ? 10.5 : 11.5}px ${SERIF}`;
      caps(ctx, true, 1.4);
      ctx.fillStyle = hoverN ? '#c4d8f1' : P.inkDim;
      ctx.fillText(words, g.sx0, g.spLab);
      const ww = ctx.measureText(words).width;
      caps(ctx, false);
      ctx.font = `${g.narrow ? 9.5 : 10.5}px ${MONO}`;
      ctx.fillStyle = P.inkFaint;
      let det = detail;
      const room = g.sx1 - (g.sx0 + ww + 10);
      while (det.length > 8 && ctx.measureText(det).width > room) det = det.slice(0, -2);
      if (det !== detail) det = det.replace(/\s*\S*$/, '') + '…';
      ctx.fillText(det, g.sx0 + ww + 10, g.spLab);

      const colW = g.colW, bw = Math.max(3, Math.min(colW * 0.52, 26));
      if (hoverN) {
        ctx.fillStyle = 'rgba(125,167,217,0.08)';
        ctx.fillRect(g.sx0 + (hoverN - 1) * colW + 1, g.spTop - 4, colW - 2, g.spBot - g.spTop + 4);
      }
      const live = excite && !drag;
      if (live) {
        const amps = spectrumNow(t);
        ctx.fillStyle = excite.kind === 'flag' ? gradAzure : gradGold;
        const cap = excite.kind === 'flag' ? glow.azure : glow.gold;
        for (let n = 1; n <= NH; n++) {
          const top = dbY(g, amps[n - 1]);
          const h = g.spBot - top;
          const cx = g.sx0 + (n - 0.5) * colW;
          if (h > 0.5) {
            ctx.fillRect(cx - bw / 2, top, bw, h);
            if (h > 3) cap.draw(ctx, cx, top, 0.55);
          }
        }
      } else {
        // a ghost: the spectrum the release would give, or the keys' own timbre
        // a pencilled spectrum: faint wash, a hairline cap at each level
        const spec = drag ? pluckSpectrum(drag.beta) : keySpec();
        const capCol = drag ? P.goldBright : 'rgba(201,169,89,0.78)';
        for (let n = 1; n <= NH; n++) {
          const top = dbY(g, Math.abs(spec[n - 1]));
          const h = g.spBot - top;
          if (h < 0.5) continue;
          const cx = g.sx0 + (n - 0.5) * colW;
          const x0 = Math.round(cx - bw / 2), w = Math.max(1, Math.round(bw));
          ctx.fillStyle = drag ? gradGhostHot : gradGhost;
          ctx.fillRect(x0, top, w, h);
          ctx.fillStyle = 'rgba(201,169,89,0.28)';
          ctx.fillRect(x0, top, 1, h); ctx.fillRect(x0 + w - 1, top, 1, h);
          ctx.fillStyle = capCol;
          ctx.fillRect(x0, Math.round(top), w, 1.5);
        }
      }

      // The sin(nπβ)/n² envelope, and a crimson × on every harmonic it silences.
      // The envelope is the release, fixed by where the string was let go; the
      // bars fall away beneath it as each partial dies at its own rate. At rest
      // only the × marks remain, for the timbre the keys are using.
      const plucked = !!(excite && excite.kind === 'pluck');
      const envBeta = drag ? drag.beta : plucked ? excite.beta : excite ? null : restBeta();
      if (envBeta != null) {
        if (drag || plucked) {
          const S = drag ? envelopeNorm(envBeta) : excite.norm;
          ctx.strokeStyle = drag ? 'rgba(125,167,217,0.8)' : 'rgba(125,167,217,0.62)';
          ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.beginPath();
          let first = true;
          for (let v = 1; v <= NH + 1e-9; v += 0.04) {
            const a = Math.abs(harmonicAmp(v, envBeta)) / S;
            const x = g.sx0 + (v - 0.5) * colW, y = dbY(g, a);
            first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            first = false;
          }
          ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.font = `bold 11px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = CB;
        ctx.globalAlpha = drag || plucked ? 1 : 0.6;
        for (let n = 1; n <= NH; n++) {
          if (Math.abs(Math.sin(n * Math.PI * envBeta)) < 0.004) ctx.fillText('×', g.sx0 + (n - 0.5) * colW, g.spBot - 5);
        }
        ctx.globalAlpha = 1;
      }
      if (hoverN) {
        ctx.font = `9.5px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = P.ink;
        ctx.fillText(String(hoverN), g.sx0 + (hoverN - 0.5) * colW, g.spBot + 14);
      }
    }

    /* ---------- canvas A: pointer ---------- */

    const cnvA = A.canvas;
    const barAt = (g, x) => {
      const n = Math.floor((x - g.sx0) / g.colW) + 1;
      return n >= 1 && n <= NH ? n : 0;
    };
    const inSpectrum = (g, x, y) => y > g.spTop - 10 && y < g.spBot + 20 && x >= g.sx0 && x <= g.sx1;
    const flagAt = (g, x, y, r) => FLAGEOLETS.findIndex((fl) => {
      const fx = xAt(g, fl.num / fl.den);
      return (x - fx) * (x - fx) + (y - g.flagY) * (y - g.flagY) < r * r;
    });
    const inString = (g, x, y) => Math.abs(y - g.sy) < g.amp + 20 && x >= g.sx0 - 10 && x <= g.sx1 + 10;

    function setDrag(g, x, y) {
      const s = snapBeta(clamp((x - g.sx0) / g.sw, 0.02, 0.98), Math.max(0.012, 9 / g.sw));
      const h = clamp((g.sy - y) / g.amp, -1, 1);
      if (!drag) drag = { beta: s.beta, snap: s.q ? s : null, h, moved: false, y0: y };
      else { drag.beta = s.beta; drag.snap = s.q ? s : null; drag.h = h; drag.moved = true; }
      mathEl.innerHTML = `aₙ ∝ sin(nπβ)/n² · ${betaNote(drag.beta, drag.snap, false)}`;
    }

    // Touch: the canvas allows vertical page scrolling (touch-action: pan-y), and a
    // touch that lands on the string or a touch-point cancels the scroll so it can
    // pluck. Anywhere else (the spectrum, the margins) the page scrolls as usual.
    const onTouchStart = (e) => {
      const g = GA, t = e.touches && e.touches[0];
      if (!g || !t || paused) return;
      const [x, y] = cv.pointerPos(A, t);
      if (!inSpectrum(g, x, y) && (flagAt(g, x, y, 22) >= 0 || inString(g, x, y))) e.preventDefault();
    };

    function onDown(e) {
      const g = GA;
      if (!g || paused) return;
      const [x, y] = cv.pointerPos(A, e);
      if (inSpectrum(g, x, y)) {
        // sound on release, so a finger that starts a scroll here stays silent
        const n = barAt(g, x);
        barPress = n ? { n, id: e.pointerId } : null;
        if (n && e.pointerType === 'mouse' && hoverN !== n) { hoverN = n; wakeA(); }
        return;
      }
      const hitR = coarse || e.pointerType === 'touch' ? 22 : 14;
      const fi = flagAt(g, x, y, hitR);
      if (fi >= 0) {
        e.preventDefault();
        pending = { fl: FLAGEOLETS[fi], x, y };
        try { cnvA.setPointerCapture(e.pointerId); } catch { /* fine */ }
        return;
      }
      if (inString(g, x, y)) {
        e.preventDefault();
        audio.ensureAudio();
        hoverN = 0;
        setDrag(g, x, y);
        try { cnvA.setPointerCapture(e.pointerId); } catch { /* fine */ }
        wakeA();
      }
    }
    function onMove(e) {
      const g = GA;
      if (!g || paused) return;
      const [x, y] = cv.pointerPos(A, e);
      if (pending) {
        if (Math.hypot(x - pending.x, y - pending.y) > 7) {
          audio.ensureAudio();
          setDrag(g, pending.x, pending.y);
          pending = null;
          setDrag(g, x, y);
          wakeA();
        }
        return;
      }
      if (drag) { setDrag(g, x, y); wakeA(); return; }
      if (e.pointerType !== 'mouse') return;
      const n = inSpectrum(g, x, y) ? barAt(g, x) : 0;
      const fi = flagAt(g, x, y, 14);
      cnvA.style.cursor = n || fi >= 0 ? 'pointer' : inString(g, x, y) ? 'grab' : '';
      if (n !== hoverN || fi !== hoverFlag) { hoverN = n; hoverFlag = fi; wakeA(); }
    }
    function onUp(e) {
      if (barPress) {
        const g = GA, bp = barPress;
        barPress = null;
        if (!g || paused) return;
        const [x, y] = cv.pointerPos(A, e);
        if (inSpectrum(g, x, y) && barAt(g, x) === bp.n) {
          hoverN = bp.n; tapPartial(bp.n); wakeA();
          if (e.pointerType !== 'mouse') {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => { hoverN = 0; wakeA(); }, 2600);
          }
        }
        return;
      }
      if (pending) {
        const fl = pending.fl;
        pending = null;
        try { cnvA.releasePointerCapture(e.pointerId); } catch { /* fine */ }
        flageolet(fl);
        return;
      }
      if (!drag) return;
      const strength = drag.moved && Math.abs(drag.h) > 0.12 ? Math.abs(drag.h) : 0.55;
      const beta = drag.beta;
      drag = null;
      try { cnvA.releasePointerCapture(e.pointerId); } catch { /* fine */ }
      pluck(beta, strength);
    }
    function onCancel() { drag = null; pending = null; barPress = null; wakeA(); }
    // keyboard: step through the partials, sound one, let go
    function onKey(e) {
      if (paused) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        hoverN = clamp((hoverN || (k === 'ArrowRight' ? 0 : NH + 1)) + (k === 'ArrowRight' ? 1 : -1), 1, NH);
        clearTimeout(hoverTimer); wakeA(); e.preventDefault();
      } else if ((k === 'Enter' || k === ' ') && hoverN) {
        tapPartial(hoverN); e.preventDefault();
      } else if (k === 'Escape' && hoverN) { hoverN = 0; wakeA(); }
    }
    function onBlur() { if (hoverN) { hoverN = 0; wakeA(); } }
    function onLeave() {
      if (drag || pending) return;
      if (hoverN || hoverFlag >= 0) { hoverN = 0; hoverFlag = -1; wakeA(); }
    }
    cnvA.addEventListener('pointerdown', onDown);
    cnvA.addEventListener('pointermove', onMove);
    cnvA.addEventListener('pointerup', onUp);
    cnvA.addEventListener('pointercancel', onCancel);
    cnvA.addEventListener('pointerleave', onLeave);
    cnvA.addEventListener('touchstart', onTouchStart, { passive: false });
    cnvA.addEventListener('keydown', onKey);
    cnvA.addEventListener('blur', onBlur);

    /* ---------- canvas B: the lens, the ladder, the ribbon ---------- */

    const layB = document.createElement('canvas');
    let GB = null;
    const needle = { c: null, target: null };

    function geoB() {
      const W = Math.max(160, B.width), H = Math.max(200, B.height);
      const narrow = W < 560;
      const x0 = narrow ? 14 : 26, x1 = W - x0;
      const headY = 21;
      const row0 = narrow ? 52 : 50, row1 = row0 - 12;          // landmark label rows
      const base = row0 + 22;                                     // lens baseline
      const lx0 = x0 + (narrow ? 4 : 8), lx1 = x1 - (narrow ? 18 : 30);
      const loY = base + 56, axisY = loY + 22, hiY = axisY + 22;
      const ax0 = x0 + (narrow ? 30 : 44), ax1 = x1 - 4;
      const ribLab = hiY + 34, ribY = ribLab + 19, ribH = narrow ? 8 : 9;
      return { W, H, narrow, x0, x1, headY, row0, row1, base, lx0, lx1, loY, axisY, hiY, ax0, ax1, ribLab, ribY, ribH };
    }

    let lens = null;   // { lo, hi, lm }
    let ladder = null; // { fMax, principal:{x1,x2,col,locked,...}, a, b }

    function lensWindow() {
      const lm = DY.n === 2 ? DY.lm : dyadLandmarks(400);
      if (slide) return { lo: 376, hi: 414, lm };
      let lo = Infinity, hi = -Infinity;
      for (const m of lm.marks) { lo = Math.min(lo, m.c); hi = Math.max(hi, m.c); }
      if (DY.n === 2) { lo = Math.min(lo, DY.c); hi = Math.max(hi, DY.c); }
      lo -= 4; hi += 4;
      if (hi - lo < 24) { const mid = (lo + hi) / 2; lo = mid - 12; hi = mid + 12; }
      return { lo, hi, lm };
    }
    const cToX = (g, c) => g.lx0 + (c - lens.lo) / (lens.hi - lens.lo) * (g.lx1 - g.lx0);

    const markColor = (kind) => (kind === 'et' ? P.azure : kind === 'pure' ? P.gold : kind === 'pref' ? P.inkDim : P.goldDim);

    function rebuildB() {
      const g = geoB();
      GB = g;
      const prevK = lens ? lens.lm.k : null;
      lens = lensWindow();
      if (DY.n === 2) {
        needle.target = DY.c;
        if (needle.c == null || prevK !== lens.lm.k || reduced) needle.c = DY.c;
      } else { needle.target = null; needle.c = null; }

      const dpr = B.dpr || 1;
      layB.width = Math.max(1, Math.round(B.width * dpr));
      layB.height = Math.max(1, Math.round(B.height * dpr));
      const c = layB.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, g.W, g.H);
      c.textBaseline = 'alphabetic';

      // heading
      c.textAlign = 'left';
      c.font = `italic ${g.narrow ? 13 : 14.5}px ${SERIF}`;
      c.fillStyle = P.ink;
      let head, sub = '';
      if (DY.n === 2) {
        head = `${DY.lm.name === 'octave' ? 'an' : 'a'} ${DY.lm.name}`;
        sub = `${DY.lo.label} + ${DY.hi.label}`;
      } else if (DY.n === 1) { head = DY.notes[0].label; sub = 'add a second note'; }
      else if (DY.n > 2) { head = `${DY.n} notes`; sub = 'hold exactly two'; }
      else { head = 'the major third, four ways'; sub = 'pure · preferred · piano · Pythagorean'; }
      c.fillText(head, g.x0, g.headY);
      const hw = c.measureText(head).width;
      c.font = `${g.narrow ? 10 : 11}px ${SERIF}`;
      caps(c, true, 1.3);
      c.fillStyle = P.inkFaint;
      if (g.x0 + hw + 14 + c.measureText(sub).width < g.x1) c.fillText(sub, g.x0 + hw + 14, g.headY);
      caps(c, false);

      // the lens: a cents ruler with its landmarks
      const span = lens.hi - lens.lo;
      const pxPerC = (g.lx1 - g.lx0) / span;
      c.strokeStyle = P.line; c.lineWidth = 1;
      c.beginPath(); c.moveTo(g.lx0, g.base + 0.5); c.lineTo(g.lx1, g.base + 0.5); c.stroke();
      const stepMajor = pxPerC * 5 >= 26 ? 5 : 10;
      c.font = `9px ${MONO}`; c.textAlign = 'center';
      lens.majors = [];
      for (let k = Math.ceil(lens.lo); k <= Math.floor(lens.hi); k++) {
        const x = Math.round(cToX(g, k)) + 0.5;
        const major = k % stepMajor === 0, mid = k % 5 === 0;
        if (pxPerC < 4 && !mid) continue;
        c.strokeStyle = major ? P.line : 'rgba(74,72,64,0.7)';
        c.beginPath(); c.moveTo(x, g.base); c.lineTo(x, g.base - (major ? 6 : mid ? 4 : 2)); c.stroke();
        if (major) {
          const s = String(k).replace('-', '−');
          c.fillStyle = P.inkFaint; c.fillText(s, x, g.base + 12);
          lens.majors.push([x, c.measureText(s).width / 2 + 2]);
        }
      }
      c.textAlign = 'left'; c.fillStyle = P.inkFaint;
      c.font = `${g.narrow ? 9 : 10}px ${SERIF}`;
      caps(c, true, 1.2);
      c.fillText(g.narrow ? '¢' : 'cents', g.lx1 + 6, g.base + 3);
      caps(c, false);

      c.font = `italic ${g.narrow ? 10.5 : 11.5}px ${SERIF}`;
      const items = lens.lm.marks.map((m) => ({ ...m, x: cToX(g, m.c) }));
      const placed = placeLabels(c, items, g.lx0 - 4, g.lx1 + 26, g.narrow);
      for (const p of placed) {
        const x = Math.round(p.x) + 0.5;
        const top = p.row === 0 ? g.row0 + 3 : g.row1 + 3;
        c.strokeStyle = markColor(p.kind); c.lineWidth = 1;
        if (p.kind === 'pref') c.setLineDash([2, 2]);
        c.beginPath(); c.moveTo(x, top); c.lineTo(x, g.base); c.stroke(); c.setLineDash([]);
        c.fillStyle = markColor(p.kind);
        c.beginPath(); c.arc(x, g.base, 1.8, 0, TAU); c.fill();
        c.fillStyle = p.kind === 'pref' ? P.inkDim : markColor(p.kind);
        c.fillText(p.txt, p.lx, p.row === 0 ? g.row0 : g.row1);
      }

      // the ladder: both notes' partials on one frequency axis
      ladder = null;
      c.strokeStyle = P.line;
      c.beginPath(); c.moveTo(g.ax0, g.axisY + 0.5); c.lineTo(g.ax1, g.axisY + 0.5); c.stroke();
      let fMax = 2400;
      if (DY.n === 2 && DY.ab.ideal.d < 30) fMax = Math.max(2400, DY.ab.ideal.m * DY.lo.freq * 1.1);
      const fx = (f) => g.ax0 + (f / fMax) * (g.ax1 - g.ax0);
      c.font = `8.5px ${MONO}`; c.textAlign = 'center';
      const tickLabs = [];
      for (let f = 500; f < fMax; f += 500) {
        const x = Math.round(fx(f)) + 0.5;
        c.strokeStyle = P.line;
        c.beginPath(); c.moveTo(x, g.axisY - 3); c.lineTo(x, g.axisY + 3); c.stroke();
        if (!g.narrow || f % 1000 === 0) {
          c.fillStyle = 'rgba(138,134,118,0.9)'; c.fillText(String(f), x, g.axisY - 6);
          const hw = c.measureText(String(f)).width / 2 + 1;
          tickLabs.push([x - hw, x + hw]);
        }
      }
      c.textAlign = 'right'; c.fillStyle = P.inkFaint;
      c.fillText('Hz', g.ax1, g.axisY - 6);

      const spec = keySpec();
      const rowOf = (note, y, below, ghost = false) => {
        c.textAlign = 'right';
        c.font = `italic ${g.narrow ? 12 : 13}px ${SERIF}`;
        c.fillStyle = ghost ? 'rgba(138,134,118,0.75)' : rowColor(note.row);
        c.fillText(note.deg, g.ax0 - 10, y + 4);
        const col = ghost ? 'rgba(169,164,147,0.3)' : rowColor(note.row);
        const spacing = (note.freq / fMax) * (g.ax1 - g.ax0);
        c.font = `8.5px ${MONO}`; c.textAlign = 'center';
        for (let m = 1; m <= 12 && m * note.freq <= fMax; m++) {
          const x = fx(m * note.freq);
          const db = relDb(spec, m);
          if (db <= -60) {
            c.strokeStyle = P.inkFaint; c.lineWidth = 1;
            c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.stroke();
          } else {
            const r = 1.8 + 3.8 * clamp((db + 50) / 50, 0, 1);
            c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
          }
          if (spacing >= 15 || m === 1) {
            c.fillStyle = ghost ? 'rgba(138,134,118,0.55)' : P.inkFaint;
            c.fillText(String(m), x, below ? y + 16 : y - 9);
          }
        }
      };

      if (DY.n === 0 || DY.n > 2) {
        // an empty staff, pencilled in: do and a pure mi, waiting to be played
        rowOf({ freq: ROOT, deg: 'do', row: 'ji' }, g.loY, false, true);
        rowOf({ freq: ROOT * 5 / 4, deg: 'mi', row: 'ji' }, g.hiY, true, true);
      } else if (DY.n === 1) {
        rowOf(DY.notes[0], g.loY, false);
      } else {
        const { lo, hi, ab } = DY;
        // quiet connectors for every other near-coincidence
        for (let m = 1; m <= 12 && m * lo.freq <= fMax; m++) {
          for (let n = 1; n <= 12 && n * hi.freq <= fMax; n++) {
            if (m === ab.ideal.m && n === ab.ideal.n) continue;
            const d = Math.abs(m * lo.freq - n * hi.freq);
            if (d >= 30 || relDb(spec, m) <= -60 || relDb(spec, n) <= -60) continue;
            c.strokeStyle = d < 0.05 ? 'rgba(127,174,122,0.45)' : 'rgba(192,91,77,0.4)';
            c.lineWidth = 1;
            c.beginPath(); c.moveTo(fx(m * lo.freq), g.loY); c.lineTo(fx(n * hi.freq), g.hiY); c.stroke();
          }
        }
        rowOf(lo, g.loY, false);
        rowOf(hi, g.hiY, true);
        const I = ab.ideal;
        if (I.d < 30) {
          const x1 = fx(I.m * lo.freq), x2 = fx(I.n * hi.freq);
          const locked = I.d < 0.05, heard = ab.idealAudible;
          const col = !heard ? P.inkFaint : locked ? P.verdant : P.crimson;
          const txt = !heard ? `partial ${ab.silentHi ? I.n : I.m} is silent`
            : locked ? `${(I.m * lo.freq).toFixed(0)} Hz · locked` : `${I.d.toFixed(2)} beats/s`;
          c.font = `${g.narrow ? 10.5 : 11.5}px ${MONO}`;
          const tw = c.measureText(txt).width;
          const xm = (x1 + x2) / 2;
          const right = xm + 10 + tw < g.ax1;
          const tx = right ? xm + 9 : xm - 9 - tw;
          // the label's backing swallows any axis number it would half cover
          let bx0 = tx - 4, bx1 = tx + tw + 4;
          for (const [a, b] of tickLabs) if (b > bx0 && a < bx1) { bx0 = Math.min(bx0, a - 1); bx1 = Math.max(bx1, b + 1); }
          c.fillStyle = '#0a0b10';
          c.fillRect(bx0, g.axisY - 15, bx1 - bx0, 21);
          c.strokeStyle = col; c.lineWidth = 1.6;
          if (!heard) c.setLineDash([3, 3]);
          c.beginPath(); c.moveTo(x1, g.loY); c.lineTo(x2, g.hiY); c.stroke();
          c.setLineDash([]); c.lineWidth = 1;
          c.textAlign = 'left';
          c.fillStyle = !heard ? P.inkDim : locked ? P.verdant : CB;
          c.fillText(txt, tx, g.axisY + 3);
          ladder = { f: I.m * lo.freq, d: I.d, locked, heard,
            a: Math.abs(spec[I.m - 1] || 0), b: Math.abs(spec[I.n - 1] || 0), m: I.m, n: I.n };
        }
      }

      // the ribbon's caption
      c.textAlign = 'left';
      c.font = `italic ${g.narrow ? 10.5 : 11.5}px ${SERIF}`;
      c.fillStyle = P.inkFaint;
      let rl = '';
      if (ladder) {
        const f = ladder.f.toFixed(0);
        if (!ladder.heard) rl = g.narrow ? 'nothing to beat with' : 'one of the two partials is silent in this timbre: nothing to beat with';
        else if (ladder.locked) rl = g.narrow ? `${f} Hz: steady` : `near ${f} Hz, the last two seconds: a steady tone, no beats`;
        else rl = g.narrow ? `near ${f} Hz · the last 2 s` : `near ${f} Hz, the last two seconds: the tone swells and fades ${ladder.d.toFixed(2)} times a second`;
      } else if (DY.n === 2) {
        rl = 'no partials close enough to beat';
      } else if (DY.n === 1) {
        rl = g.narrow ? 'add a second note' : 'add a second note to see where the partials of the two meet';
      } else if (DY.n > 2) {
        rl = 'hold exactly two notes to line up their partials';
      } else {
        rl = g.narrow ? 'hold two keys, or slide mi' : 'hold two keys, or slide mi, and their partials line up on these two rows';
      }
      c.fillText(rl, g.ax0, g.ribLab);
      c.strokeStyle = 'rgba(74,72,64,0.6)';
      c.beginPath(); c.moveTo(g.ax0, g.ribY + 0.5); c.lineTo(g.ax1, g.ribY + 0.5); c.stroke();
    }

    function placeLabels(c, items, x0, x1, narrow) {
      const ends = [-Infinity, -Infinity];
      const out = [];
      for (const it of [...items].sort((a, b) => a.x - b.x)) {
        let done = false;
        for (const txt of narrow ? [it.short] : [it.label, it.short]) {
          const w = c.measureText(txt).width;
          const lx = clamp(it.x - w / 2, x0, x1 - w);
          for (let r = 0; r < 2 && !done; r++) {
            if (lx > ends[r] + 7) { ends[r] = lx + w; out.push({ ...it, txt, row: r, lx }); done = true; }
          }
          if (done) break;
        }
      }
      return out;
    }

    function drawB(dt) {
      const g = GB;
      if (!g || !lens) return;
      const ctx = B.ctx;
      ctx.clearRect(0, 0, B.width, B.height);
      ctx.drawImage(layB, 0, 0, B.width, B.height);
      if (needle.target != null && needle.c != null) {
        if (!reduced) needle.c += (needle.target - needle.c) * (1 - Math.exp(-(dt || 0.016) / 0.09));
        else needle.c = needle.target;
        if (Math.abs(needle.target - needle.c) < 0.004) needle.c = needle.target;
        const x = clamp(cToX(g, needle.c), g.lx0, g.lx1);
        const state = ladder ? (!ladder.heard ? 'mute' : ladder.locked ? 'lock' : 'beat') : 'none';
        const col = state === 'lock' ? P.verdant : state === 'beat' ? CB : P.ink;
        // the tag below gives the exact value, so clear any axis number the
        // needle's point would strike through
        ctx.fillStyle = '#0a0b10';
        for (const [mx, hw] of lens.majors || []) {
          if (Math.abs(mx - x) < hw + 6) ctx.fillRect(mx - hw - 1, g.base + 3, 2 * hw + 2, 12);
        }
        (state === 'lock' ? glow.verdant : state === 'beat' ? glow.crimson : glow.ink).draw(ctx, x, g.base, 0.9);
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, g.row0 + 6); ctx.lineTo(x, g.base + 5); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = P.ink;
        ctx.beginPath(); ctx.moveTo(x, g.base + 1); ctx.lineTo(x - 4, g.base + 7); ctx.lineTo(x + 4, g.base + 7); ctx.closePath(); ctx.fill();
        const tag = `${needle.target.toFixed(2)} ¢`;
        ctx.font = `bold ${g.narrow ? 10.5 : 11}px ${MONO}`;
        const tw = ctx.measureText(tag).width;
        const tx = clamp(x - tw / 2, g.lx0 - 6, g.lx1 + 20 - tw);
        ctx.fillStyle = '#0a0b10';
        ctx.fillRect(tx - 3, g.base + 16, tw + 6, 14);
        ctx.fillStyle = col; ctx.textAlign = 'left';
        ctx.fillText(tag, tx, g.base + 27);
      }
      if (ladder) drawRibbon(ctx, g);
    }

    function drawRibbon(ctx, g) {
      const { a, b, d, locked, heard } = ladder;
      const tNow = reduced ? 0 : nowSec();
      const K = Math.max(8, Math.floor((g.ax1 - g.ax0) / 2));
      const top = new Float32Array(K + 1);
      const sum = a + b || 1;
      for (let i = 0; i <= K; i++) {
        const tt = tNow - 2 + (2 * i) / K;
        const r = !heard ? 0.12 : locked ? 1 : Math.sqrt(Math.max(0, a * a + b * b + 2 * a * b * Math.cos(TAU * d * tt))) / sum;
        top[i] = r;
      }
      const col = !heard ? 'rgba(138,134,118,' : locked ? 'rgba(127,174,122,' : 'rgba(192,91,77,';
      ctx.fillStyle = col + '0.42)';
      ctx.beginPath();
      for (let i = 0; i <= K; i++) {
        const x = g.ax0 + (i / K) * (g.ax1 - g.ax0), y = g.ribY - top[i] * g.ribH;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let i = K; i >= 0; i--) ctx.lineTo(g.ax0 + (i / K) * (g.ax1 - g.ax0), g.ribY + top[i] * g.ribH);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col + '0.9)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= K; i++) {
        const x = g.ax0 + (i / K) * (g.ax1 - g.ax0), y = g.ribY - top[i] * g.ribH;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    /* ---------- loops: run only while something moves ---------- */

    const animA = () => !!drag || !!(excite && elapsed(excite) < 8.2);
    const loopA = cv.rafLoop(() => { drawA(); if (!animA()) loopA.stop(); });
    const animB = () => !!ladder && ladder.heard && !ladder.locked && !reduced ||
      (needle.target != null && needle.c != null && Math.abs(needle.target - needle.c) > 0.004);
    const loopB = cv.rafLoop((dt) => { drawB(dt); if (!animB()) loopB.stop(); });
    function wakeA() { if (!paused) loopA.start(); }
    function wakeB() { if (!paused) loopB.start(); }

    A.onResize((w) => {
      const want = heightA(w);
      if (want !== optsA.height) { optsA.height = want; A.canvas.style.height = want + 'px'; }
      rebuildA(); drawA();
    });
    B.onResize((w) => {
      const want = heightB(w);
      if (want !== optsB.height) { optsB.height = want; B.canvas.style.height = want + 'px'; }
      rebuildB(); drawB(0);
    });

    const onMq = () => { reduced = !!(mqReduce && mqReduce.matches); rebuildB(); drawA(); drawB(0); wakeA(); wakeB(); };
    if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener('change', onMq);

    rebuildA();
    refreshQuest();
    refreshDyad();
    drawA();
    drawB(0);

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        paused = true;
        loopA.stop(); loopB.stop();
        drag = null; pending = null;
        killBanks();
        for (const id of [...voices.keys()]) releaseKey(id);
        stopSlide();
        bus.mute();
        refreshDyad();
      },
      resume() {
        paused = false;
        bus.unmute();
        drawA(); drawB(0);
        wakeA(); wakeB();
      },
      destroy() {
        paused = true;
        loopA.stop(); loopB.stop();
        clearTimeout(hoverTimer);
        killBanks();
        for (const id of [...voices.keys()]) releaseKey(id);
        stopSlide();
        cnvA.removeEventListener('pointerdown', onDown);
        cnvA.removeEventListener('pointermove', onMove);
        cnvA.removeEventListener('pointerup', onUp);
        cnvA.removeEventListener('pointercancel', onCancel);
        cnvA.removeEventListener('pointerleave', onLeave);
        cnvA.removeEventListener('touchstart', onTouchStart);
        cnvA.removeEventListener('keydown', onKey);
        cnvA.removeEventListener('blur', onBlur);
        if (mqReduce && mqReduce.removeEventListener) mqReduce.removeEventListener('change', onMq);
        bus.dispose();
        A.destroy(); B.destroy();
        style.remove();
      },
    };
  },
};

export const _test = {
  harmonicAmp, pluckSpectrum, envelopeNorm, beatPair, snapBeta, cents,
  relDb, audibleBeat, dyadLandmarks, pluckParallelogram, stopFraction, KEY_BETA,
};
