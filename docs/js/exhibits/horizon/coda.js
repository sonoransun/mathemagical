// Coda — One Question
// The site's final screen. The overture's question returns as an instrument:
// a slider that crossfades the pure harmonic series against its equal-tempered
// stand-ins, so the visitor hears "invented or discovered". Above it, one
// closing image: a single stroke — a tally mark, the digit 1, a string — still
// and pale until the visitor answers, tinted by the answer, and vibrating in
// the real modes of the drone when it sounds. Beneath it, three rulers of
// cents measure the partials the two tunings dispute, and their lamps beat at
// the true beat rates, timed by the audio clock. The stroke can be plucked:
// a pluck at a fraction u of its length excites partial k as sin(kπu)/k².
//
// No top-level DOM/window/Audio access: everything below the pure helpers
// happens inside init(). Pure helpers are exported via _test.

const TAU = Math.PI * 2;
const QUESTION_KEY = 'mathemagical:one-question';        // the overture's answer: read here, never written
const CODA_KEY = 'mathemagical:one-question:coda';       // the answer given on this page
const F0 = 110;              // fundamental, Hz (A2, two octaves below concert A)
const PARTIALS = 6;          // partial bank size: 1..6 × f0
const SLOW = 500;            // visual slowdown of the string modes
const STR_SEG = 72;          // string polyline segments
const LEVEL = 0.22;          // drone: per-partial peak, rolled off 1/k
const RULER = 16;            // half-span of each cents ruler, in cents
const PLUCK_U = 0.2;         // keyboard pluck: one fifth of the way along
// fixed per-partial phase seeds so the sounding string looks organic, not synced
const SEED = [0.0, 1.7, 3.9, 0.6, 2.8, 5.1];

/* ---------- pure logic (node-testable) ---------- */

// Nearest 12-TET step to the k-th harmonic partial: round(12·log2 k).
function nearestETSemitones(k) {
  return Math.round(12 * Math.log2(k));
}

function justFreq(f0, k) { return f0 * k; }

function etFreq(f0, k) {
  return f0 * Math.pow(2, nearestETSemitones(k) / 12);
}

// Signed gap in cents: pure partial minus its ET stand-in.
// centsGap(3) ≈ +1.955 (the pure fifth is 2¢ sharp of equal temperament);
// centsGap(5) ≈ −13.686 (the pure major third is 13.7¢ flat of it).
function centsGap(k) {
  return 1200 * Math.log2(k) - 100 * nearestETSemitones(k);
}

function beatRate(f0, k) { return Math.abs(justFreq(f0, k) - etFreq(f0, k)); }

// Octaves of the fundamental (k = 1, 2, 4) are the same in both tunings,
// so the drone sounds them once, at a fixed level, and never crossfades them.
function isShared(k) { return Number.isInteger(Math.log2(k)); }

// The partials the two tunings dispute: 3, 5 and 6.
const DISPUTED = Array.from({ length: PARTIALS }, (_, i) => i + 1).filter((k) => !isShared(k));

// Equal-power crossfade. v = 0 → all equal-tempered ("invented"),
// v = 1 → all just ("discovered"). just² + et² = 1 for every v.
function xfadeGains(v) {
  const c = Math.min(1, Math.max(0, v));
  return { just: Math.sin(c * Math.PI / 2), et: Math.cos(c * Math.PI / 2) };
}

// The overture stores a string "0".."1"; anything else means "never answered".
function parseAnswer(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

// One row per partial, for the on-page table and for tests.
function partialRows(f0) {
  const rows = [];
  for (let k = 1; k <= PARTIALS; k++) {
    rows.push({
      k,
      semitones: nearestETSemitones(k),
      just: justFreq(f0, k),
      et: etFreq(f0, k),
      gapCents: centsGap(k),
      beat: beatRate(f0, k),
      shared: isShared(k),
    });
  }
  return rows;
}

// Amplitude envelope of one disputed partial while both of its versions sound:
// two sines of gains gJ and gE, df hertz apart, started in phase, τ seconds ago.
// It swings between |gJ − gE| and gJ + gE, df times a second: the beat.
function modeEnvelope(gJ, gE, df, tau) {
  return Math.sqrt(Math.max(0, gJ * gJ + gE * gE + 2 * gJ * gE * Math.cos(TAU * df * tau)));
}

// Transverse offset of the drawn string at position u ∈ [0,1], time t (s).
// Mode shapes are the real string modes sin(kπu); each oscillates at its
// bank's true frequency divided by SLOW. Octaves are one oscillator in the
// drone, so they are drawn once, at the combined weight √(wJ² + wE²).
const NORM = (() => { let s = 0; for (let k = 1; k <= PARTIALS; k++) s += 1 / k; return s; })();
function stringOffset(u, t, wJust, wET) {
  let s = 0;
  const wShared = Math.hypot(wJust, wET);
  for (let k = 1; k <= PARTIALS; k++) {
    const shape = Math.sin(k * Math.PI * u) / k;
    s += shape * (isShared(k)
      ? wShared * Math.sin(TAU * (justFreq(F0, k) / SLOW) * t + SEED[k - 1])
      : wJust * Math.sin(TAU * (justFreq(F0, k) / SLOW) * t + SEED[k - 1]) +
        wET * Math.sin(TAU * (etFreq(F0, k) / SLOW) * t + SEED[k - 1]));
  }
  return s / NORM;
}

// A string pulled aside at a fraction u of its length and let go: its k-th
// mode starts with amplitude proportional to sin(kπu)/k² (the Fourier sine
// coefficients of the triangle). Plucked at u = 1/5, partial 5 is silent.
function pluckAmps(u) {
  const out = [];
  for (let k = 1; k <= PARTIALS; k++) out.push(Math.sin(k * Math.PI * u) / (k * k));
  return out;
}
// A partial's amplitude time constant after a pluck (s): upper partials die sooner.
function pluckTau(k) { return 1.1 / Math.sqrt(k); }

// "72% discovered", "30% invented" or "exactly halfway".
function leanWords(v) {
  if (!Number.isFinite(v)) return '';
  const d = Math.round(v * 100);
  if (d === 50) return 'exactly halfway';
  return d > 50 ? `${d}% discovered` : `${100 - d}% invented`;
}

// The sentence under the slider once the visitor has placed an answer.
function answerNote({ door = null, last = null, now }) {
  const parts = [];
  if (door !== null) parts.push(`At the door: ${leanWords(door)}.`);
  if (last !== null) parts.push(`Last time on this page: ${leanWords(last)}.`);
  parts.push(`${parts.length ? 'Now' : 'Your answer'}: ${leanWords(now)}.`);
  return parts.join(' ');
}

// Colour helpers: '#rrggbb' → [r, g, b]; linear mix; CSS string.
function hexRGB(h) {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixRGB(a, b, t) {
  const c = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * c, a[1] + (b[1] - a[1]) * c, a[2] + (b[2] - a[2]) * c];
}
const rgbCSS = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

const fmtHz = (x) => x.toFixed(2);
const fmtCents = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1) + '¢';

// Self-check for tests.html and node: throws on the first wrong number.
function selfTest() {
  const near = (a, b, eps, what) => { if (!(Math.abs(a - b) <= eps)) throw new Error(`${what}: ${a} ≠ ${b}`); };
  near(centsGap(3), 1.955, 0.001, 'centsGap(3)');
  near(centsGap(5), -13.686, 0.001, 'centsGap(5)');
  near(1200 * Math.log2(5 / 4), 386.314, 0.001, '5/4 in cents');
  near(beatRate(F0, 3), 0.3724, 0.0001, 'beat 3');
  near(beatRate(F0, 5), 4.3653, 0.0001, 'beat 5');
  near(beatRate(F0, 6), 0.7449, 0.0001, 'beat 6');
  if (DISPUTED.join() !== '3,5,6') throw new Error(`disputed partials ${DISPUTED}`);
  for (const k of [1, 2, 4]) if (beatRate(F0, k) !== 0 || !isShared(k)) throw new Error(`partial ${k} should be shared`);
  for (let v = 0; v <= 1; v += 0.125) { const g = xfadeGains(v); near(g.just ** 2 + g.et ** 2, 1, 1e-12, 'equal power'); }
  near(modeEnvelope(Math.SQRT1_2, Math.SQRT1_2, 4, 0), Math.SQRT2, 1e-12, 'beat crest');
  near(modeEnvelope(Math.SQRT1_2, Math.SQRT1_2, 4, 0.125), 0, 1e-7, 'beat trough');
  near(pluckAmps(0.2)[4], 0, 1e-12, 'pluck at 1/5 silences partial 5');
  near(pluckAmps(0.5)[1], 0, 1e-12, 'pluck at 1/2 silences partial 2');
  near(stringOffset(0, 1.3, 0.6, 0.8), 0, 1e-12, 'string end fixed');
  if (parseAnswer('0.3') !== 0.3 || parseAnswer('x') !== null || parseAnswer('1.5') !== null) throw new Error('parseAnswer');
  if (leanWords(0.72) !== '72% discovered' || leanWords(0.3) !== '70% invented' || leanWords(0.5) !== 'exactly halfway') throw new Error('leanWords');
  return 'ok';
}

/* ---------- the exhibit ---------- */

export default {
  id: 'coda',
  movement: 4,
  title: 'One Question',
  hook: 'Answer it again, now that you have seen its walls, its bridges and its engines.',
  era: 'c. 385 BCE – 2026 · Athens, Königsberg, Princeton',
  prose: `
    <p>At the door we asked you one question and promised it would not be mentioned
    again. The promise expires here, on the last screen, because you are no longer the
    person who answered it. Since then you have counted a flock with notches on a bone
    and heard a single string confess the whole numbers hiding in its overtones; you
    built a list meant to contain everything and watched one sequence step calmly out
    of it; you severed a hydra that always dies, ran a five-state machine for exactly
    47,176,870 steps, saw two computations from unrelated worlds agree at every prime,
    forever, and built a proof one tactic at a time for a kernel that takes nothing on
    trust. Then you watched all of it come down from the horizon and go to work: a curve
    counted over a finite field keeping a secret in public, Fourier’s cosines deciding
    what a photograph can afford to forget, Einstein keeping a satellite’s clock honest.
    So — mathematics: <em>invented</em>, or <em>discovered</em>? The slider below is the
    same slider. If you answered at the door, your earlier self waits on it as a faint
    mark.</p>
    <p>This time the slider is an instrument. Push it toward <em>discovered</em> and the
    drone settles into the harmonic series: six partials at exactly 1, 2, 3, 4, 5 and 6
    times a fundamental of 110 Hz, the ratios an ideal string offers unasked, the physics
    all of Movement II was built from. Push it toward <em>invented</em> and partials 3, 5
    and 6, the ones the piano’s grid cannot hold, fade while their stand-ins on
    the equal-tempered ladder <code>2^(n/12)</code> rise in their place. That ladder was
    calculated precisely by the Ming prince Zhu Zaiyu in 1584: a human compromise, at
    frequencies no free string ever chose. Even the ground note is an agreement: 110 Hz lies
    two octaves below the concert A of 440 Hz that an
    international conference in London adopted in May 1939. The difference between the
    poles is almost nothing, and it is everything. The fifth moves by 2.0 cents, beneath
    most ears’ sense of pitch but not beneath their sense of time: sounded together, the two
    versions swell and fade once every 2.7 seconds. The major third moves by 13.7, from
    the pure 386.3 cents of <code>5/4</code> to the manufactured 400, and near the middle
    of the slider its two versions beat against each other 4.4 times a second. That slow
    shudder is the question, made audible.</p>
    <p>The question is older than any exhibit here. Around 385 BCE Plato wrote a scene in
    which Socrates, claiming only to ask questions, leads an enslaved boy to double a square by
    building on its <a href="#ex-diagonal">diagonal</a>, the line whose length no fraction
    can name, and concludes that the boy was not taught but <em>recollected</em>.
    Twenty-three centuries later Kurt Gödel, the man who surveyed the walls, held the
    same faith and held it all his life. In 1964 he wrote that “despite their remoteness
    from sense experience, we do have something like a perception also of the objects of
    set theory, as is seen from the fact that the axioms force themselves upon us as being
    true.”</p>
    <p>Others answered otherwise. David Hilbert’s formalism treated the infinite reaches of
    mathematics as ideal statements, formulas moved by rules we lay down, to be justified by
    a finitary proof that they could never lead to a contradiction; and at the bottom of the game he set
    the plainest marks there are, for the numerals of his finitary arithmetic,
    <code>1,&nbsp;11,&nbsp;111</code> and so on, were strings of strokes.
    L.&nbsp;E.&nbsp;J.&nbsp;Brouwer’s intuitionism begins with the first of what he called its two
    acts: mathematics cut loose from language, with its origin in the perception of a move of
    time, “the falling apart of a life moment into two distinct things, one of which gives way
    to the other, but is retained by memory.” It grants a statement truth only when a mind has
    built its proof. Structuralism, sharpened by Paul Benacerraf in 1965, replies that the objects
    were never the point: the numbers can be built from sets in infinitely many ways, and
    what survives every choice is the pattern of relations, which is why one stroke can be
    a tally, a string and a numeral without anything being lost.</p>
    <p>The last movement sharpened the quarrel. G.&nbsp;H.&nbsp;Hardy, whose wartime reassurance
    opened it, sided with the discoverers: the theorems we call our creations, he wrote in
    1940, are “simply our notes of our observations.” Eugene Wigner defined mathematics from
    the other side, as “the science of skillful operations with concepts and rules invented
    just for this purpose,” which
    is why its grip on physics struck him as a miracle. Richard Hamming, whose
    <a href="#ex-selfheal">codes repair their own errors</a>, answered him in 1980 that we
    see what we look for and select the mathematics that fits, then conceded that his
    explanations, added together, “simply are not enough.” We declare no winner. We only
    note, after the hydra and the beavers and the mirror, and after seven engines built
    from what the first three movements met as play, that the question is not idle:
    whatever mathematics is, something in it answered back.</p>`,

  chronicle: [
    { year: -385, date: 'c. 385 BCE', text: 'In Plato’s <em>Meno</em>, Socrates, claiming only to ask questions, leads an enslaved boy to double a square by building on its diagonal, and concludes that the boy was not taught but <em>recollected</em>.' },
    { year: 1930, date: '8 September 1930', text: 'In Königsberg, the day after Kurt Gödel’s first public remark on incompleteness, David Hilbert ends his address to the Society of German Scientists and Physicians: <em>Wir müssen wissen. Wir werden wissen.</em>' },
    { year: 1951, date: '1951', text: 'In his Gibbs Lecture at Brown University, Kurt Gödel argues that either the human mind infinitely surpasses any finite machine or there are absolutely unsolvable problems about whole-number equations; he believed the first.' },
    { year: 1960, date: 'February 1960', text: 'Eugene Wigner’s “The Unreasonable Effectiveness of Mathematics in the Natural Sciences” calls the fit between mathematics and the laws of physics a miracle: a gift we cannot explain and did nothing to earn.' },
    { year: 1965, date: '1965', text: 'Paul Benacerraf’s “What Numbers Could Not Be” argues that numbers are not sets but positions in a structure, since arithmetic can be built from sets in infinitely many equally good ways.' },
    { year: 1980, date: 'February 1980', text: 'Richard Hamming answers Wigner in the <em>American Mathematical Monthly</em>: we see what we look for and select the mathematics that fits, yet his explanations, added together, “simply are not enough.”' },
    { year: 2023, date: 'December 2023', text: 'FunSearch, a language model paired with an automatic evaluator, finds a 512-point cap set in eight dimensions, larger than any previously known, and its makers title their <em>Nature</em> paper “Mathematical discoveries from program search with large language models.”' },
    { year: 2024, date: 'February 2024', text: 'From 235,440 judgments by listeners in the United States and South Korea, Raja Marjieh and colleagues find that for tones rich in harmonics the favourite tunings sit slightly off the pure ratios, and that changing a tone’s timbre moves them.' },
  ],

  today: `
    <p>The slider’s question now has laboratories. In 2016 Josh McDermott and colleagues
    played chords to the Tsimane’, a people of the Bolivian Amazon with little exposure to
    Western music. Their hearing discriminated much as Western listeners’ does, and like
    Western listeners they disliked acoustic roughness, yet they rated consonant and
    dissonant chords as equally pleasant. Bolivian town and city dwellers preferred
    consonance, and residents of the United States more strongly still.</p>
    <p>In 2024 Raja Marjieh, Nori Jacoby and colleagues gathered 235,440 judgments from
    listeners in the United States and South Korea. For tones rich in harmonics, the
    favourite tunings sat slightly off the pure ratios, and off the piano’s grid as well, a
    taste the authors trace to a liking for slow beats. Change the timbre and the preferences
    move with it: set against a synthetic bonang, a row of small gongs from the Javanese
    gamelan, they fell into line with the gamelan’s slendro scale, which barely touches the
    piano’s twelve, even for listeners who had rarely or never heard it. The integers are in
    the string; which of them we hear as sweet is partly up to us.</p>
    <p>Machines have joined the argument from the other side. In December 2023 FunSearch, a
    language model yoked to a strict automatic evaluator, found 512 points in the
    eight-dimensional space over the integers mod 3 with no three on a line, more than any
    such set known before, and its makers titled their paper in <em>Nature</em>
    “Mathematical discoveries from program search with large language models.” In May 2025
    its successor, AlphaEvolve, reported a way to multiply two 4&nbsp;×&nbsp;4 complex
    matrices with 48 multiplications, one fewer than the 49 that Volker Strassen’s method of
    1969 needs. The language models inside both were trained by descendants of
    <a href="#ex-learner">Cauchy’s descent</a>. Whether a search program invents or finds
    is our question with the human taken out, and it has not become easier to answer.</p>`,

  sources: [
    { text: 'Plato, <em>Meno</em> (c. 385 BCE), 82a–85b, trans. Benjamin Jowett', url: 'https://www.gutenberg.org/ebooks/1643' },
    { text: 'Richard Zach, “Hilbert’s Program,” <em>Stanford Encyclopedia of Philosophy</em>', url: 'https://plato.stanford.edu/entries/hilbert-program/' },
    { text: 'Panu Raatikainen, “Gödel’s Incompleteness Theorems,” <em>Stanford Encyclopedia of Philosophy</em> (Königsberg, 7 September 1930; the 1951 Gibbs Lecture)', url: 'https://plato.stanford.edu/entries/goedel-incompleteness/' },
    { text: 'Kurt Gödel, “What Is Cantor’s Continuum Problem?” (1964), in P. Benacerraf and H. Putnam (eds.), <em>Philosophy of Mathematics: Selected Readings</em>, 2nd ed. (Cambridge, 1983), 470–485', url: 'https://doi.org/10.1017/CBO9781139171519' },
    { text: 'Rosalie Iemhoff, “Intuitionism in the Philosophy of Mathematics,” <em>Stanford Encyclopedia of Philosophy</em> (Brouwer’s first act)', url: 'https://plato.stanford.edu/entries/intuitionism/' },
    { text: 'G. H. Hardy, <em>A Mathematician’s Apology</em> (Cambridge, 1940), §22', url: 'https://archive.org/details/AMathematiciansApology-G.h.Hardy' },
    { text: 'Eugene P. Wigner, “The Unreasonable Effectiveness of Mathematics in the Natural Sciences,” <em>Communications on Pure and Applied Mathematics</em> 13 (1960) 1–14', url: 'https://doi.org/10.1002/cpa.3160130102' },
    { text: 'R. W. Hamming, “The Unreasonable Effectiveness of Mathematics,” <em>American Mathematical Monthly</em> 87 (1980) 81–90', url: 'https://doi.org/10.1080/00029890.1980.11994966' },
    { text: 'J. H. McDermott, A. F. Schultz, E. A. Undurraga and R. A. Godoy, “Indifference to dissonance in native Amazonians reveals cultural variation in music perception,” <em>Nature</em> 535 (2016) 547–550', url: 'https://doi.org/10.1038/nature18635' },
    { text: 'R. Marjieh, P. M. C. Harrison, H. Lee, F. Deligiannaki and N. Jacoby, “Timbral effects on consonance disentangle psychoacoustic mechanisms and suggest perceptual origins for musical scales,” <em>Nature Communications</em> 15 (2024) 1482', url: 'https://doi.org/10.1038/s41467-024-45812-z' },
  ],

  alt: 'A single vertical stroke, pale until you answer and then tinted from azure (invented) to gold (discovered); when the drone sounds it vibrates as a string, and three small rulers beneath it measure in cents how far the pure partials 3, 5 and 6 lie from their equal-tempered stand-ins.',

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    // ---------- scoped style: the coda is a screen, not a boxed widget ----------
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-coda { min-height: 88vh; display: flex; flex-direction: column; justify-content: center; }
      #ex-coda .exhibit-header { position: absolute; width: 1px; height: 1px; margin: 0; padding: 0;
        overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
      #ex-coda .exhibit-stage { background: transparent; border: none; box-shadow: none; padding: 0; outline: 0; }
      #ex-coda .exhibit-stage canvas { background: transparent; box-shadow: none; display: block;
        border-radius: 6px; touch-action: manipulation; }
      #ex-coda .exhibit-stage canvas.can-pluck { cursor: pointer; }
      #ex-coda .exhibit-stage canvas:focus-visible { outline: 1px solid var(--gold-dim, #8a7440); outline-offset: 2px; }
      #ex-coda .coda-core { max-width: 34rem; margin: 2.2rem auto 0; padding: 0 0.5rem; text-align: center; }
      #ex-coda .coda-prompt { color: var(--ink); font-size: 1.25rem; letter-spacing: 0.03em;
        margin: 0.6rem 0 1.7rem; text-wrap: balance; }
      #ex-coda .coda-track { position: relative; }
      #ex-coda .coda-ghost { position: absolute; top: -13px; width: 2px; height: 11px; border-radius: 1px;
        transform: translateX(-50%); background: var(--gold, #c9a959); opacity: 0.85; pointer-events: none;
        box-shadow: 0 0 6px rgba(201, 169, 89, 0.55); transition: opacity 0.6s ease; }
      #ex-coda .coda-ghost.faded { opacity: 0.45; }
      #ex-coda input[type="range"].coda-slider { display: block; width: 100%; min-width: 0; height: 3px;
        border-radius: 2px; cursor: pointer;
        background: linear-gradient(90deg, var(--azure-dim, #4a6a94) 0%, var(--line, #2a2e3f) 50%, var(--gold-dim, #8a7440) 100%); }
      #ex-coda .coda-slider::-webkit-slider-thumb { box-sizing: border-box; width: 20px; height: 20px; }
      #ex-coda .coda-slider::-moz-range-thumb { box-sizing: border-box; width: 20px; height: 20px; }
      #ex-coda .coda-slider::-moz-range-track { background: transparent; }
      #ex-coda .coda-slider.unplaced::-webkit-slider-thumb { background: var(--ink-faint); box-shadow: 0 0 0 1px var(--line); }
      #ex-coda .coda-slider.unplaced::-moz-range-thumb { background: var(--ink-faint); }
      #ex-coda .coda-labels { display: flex; justify-content: space-between; font-variant: small-caps;
        letter-spacing: 0.12em; font-size: 0.85rem; margin-top: 0.55rem; }
      #ex-coda .coda-labels .inv { color: var(--azure, #7da7d9); opacity: 0.8; }
      #ex-coda .coda-labels .disc { color: var(--gold, #c9a959); opacity: 0.85; }
      #ex-coda .coda-note { color: var(--ink-dim); font-style: italic; font-size: 0.9rem;
        margin: 1.1rem auto 0; min-height: 1.4em; max-width: 30rem; text-wrap: balance;
        font-variant-numeric: lining-nums; }
      #ex-coda .controls { justify-content: center; margin-top: 1.3rem; }
      #ex-coda .coda-numbers { max-width: 30rem; margin: 1.4rem auto 0; text-align: center; }
      #ex-coda .coda-numbers summary { display: inline-block; cursor: pointer; color: var(--ink-dim);
        font-variant: small-caps; letter-spacing: 0.12em; font-size: 0.9rem; list-style: none; padding: 0.2rem 0.4rem; }
      #ex-coda .coda-numbers summary::-webkit-details-marker { display: none; }
      #ex-coda .coda-numbers summary::before { content: "›"; display: inline-block; margin-right: 0.45em;
        color: var(--gold-dim, #8a7440); transition: transform 0.2s ease; }
      #ex-coda .coda-numbers[open] summary::before { transform: rotate(90deg); }
      #ex-coda .coda-table { margin: 0.8rem auto 0; border-collapse: collapse; font-size: 0.9rem;
        font-variant-numeric: lining-nums tabular-nums; color: var(--ink-dim); }
      #ex-coda .coda-table th { font-weight: normal; font-variant: small-caps; letter-spacing: 0.08em;
        color: var(--ink-faint); padding: 0 0.7rem 0.35rem; border-bottom: 1px solid var(--line); }
      #ex-coda .coda-table td { padding: 0.28rem 0.7rem; text-align: right; white-space: nowrap; }
      #ex-coda .coda-table td:nth-child(4) { padding-right: 0.95rem; }
      #ex-coda .coda-table td:first-child, #ex-coda .coda-table th:first-child { text-align: center; }
      #ex-coda .coda-table .pure { color: var(--gold, #c9a959); }
      #ex-coda .coda-table .temp { color: var(--azure, #7da7d9); }
      #ex-coda .coda-table tr.same td { opacity: 0.55; }
      #ex-coda .coda-table-note { color: var(--ink-faint); font-style: italic; font-size: 0.85rem;
        margin: 0.7rem auto 0; max-width: 28rem; text-wrap: balance; font-variant-numeric: lining-nums; }
      @media (max-width: 30rem) {
        #ex-coda .coda-table { font-size: 0.82rem; }
        #ex-coda .coda-table th, #ex-coda .coda-table td { padding-left: 0.35rem; padding-right: 0.35rem; }
        #ex-coda .coda-table td:nth-child(4) { padding-right: 0.6rem; }
      }
      #ex-coda .stage-caption { text-align: center; max-width: 38rem; margin: 1.6rem auto 0; }
      #ex-coda .lnum { font-variant-numeric: lining-nums; }
      #ex-coda .speculation-panel { max-width: 40rem; margin-left: auto; margin-right: auto; }
      #ex-coda .coda-last { max-width: 36rem; margin: 4.5rem auto 1.5rem; padding: 0 1rem;
        text-align: center; color: var(--ink); line-height: 2; }
      #ex-coda .coda-last p { margin: 0 0 1.5em; text-wrap: pretty; }
      #ex-coda .coda-last em { color: var(--gold-bright, #e8c87c); }
      #ex-coda .coda-last .coda-final { color: var(--gold-bright, #e8c87c); margin-bottom: 0; font-size: 1.12rem;
        letter-spacing: 0.01em; text-wrap: balance; }
      #ex-coda .coda-last .coda-final::before { content: ""; display: block; width: 1.5px; height: 3.2rem;
        margin: 0 auto 1.8rem; border-radius: 1px;
        background: linear-gradient(180deg, transparent, var(--gold, #c9a959) 30%, var(--gold, #c9a959) 70%, transparent);
        box-shadow: 0 0 10px rgba(201, 169, 89, 0.45); }
      #ex-coda .coda-last.will-reveal > * { opacity: 0; transform: translateY(12px);
        transition: opacity 1.6s cubic-bezier(.2,.7,.2,1), transform 1.6s cubic-bezier(.2,.7,.2,1); }
      #ex-coda .coda-last.will-reveal > .is-in { opacity: 1; transform: none; }
      #ex-coda .coda-last.will-reveal > .coda-final.is-in { transition-delay: 0.4s; }
      html.no-reveal #ex-coda .coda-last.will-reveal > * { opacity: 1; transform: none; transition: none; }
      @media (prefers-reduced-motion: reduce) {
        #ex-coda .coda-last.will-reveal > * { opacity: 1; transform: none; transition: none; }
        #ex-coda .coda-numbers summary::before { transition: none; }
      }
    `;
    stage.appendChild(styleEl);

    // ---------- environment ----------
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let still = !!(mq && mq.matches);
    const onMotionPref = () => { still = !!(mq && mq.matches); wake(); };
    if (mq && mq.addEventListener) mq.addEventListener('change', onMotionPref);
    const SERIF = (getComputedStyle(document.body).fontFamily || '').trim() || 'Georgia, serif';
    const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const RGB = {
      ink: hexRGB(P.ink), inkFaint: hexRGB(P.inkFaint), azure: hexRGB(P.azure), azureDim: hexRGB(P.azureDim),
      gold: hexRGB(P.gold), goldBright: hexRGB(P.goldBright), goldDim: hexRGB(P.goldDim),
    };
    // the answer's colour passes through the undecided ivory, never through grey-green
    const answerRGB = (x, lo, mid, hi) => (x < 0.5 ? mixRGB(lo, mid, x * 2) : mixRGB(mid, hi, x * 2 - 1));

    // ---------- state ----------
    let v = 0.5;               // current slider position (0 invented … 1 discovered)
    let vShown = 0.5;          // eased copy, for colour and ticks
    let placed = false;        // has the visitor placed an answer this visit?
    let placedMix = 0;         // eased 0 → 1 once placed
    let droneOn = false;
    let drone = null;          // built lazily on first sound; disposed after a silence
    let idleTimer = 0;
    let level = 0;             // eased copy of the drone's master level (0…1)
    let pl = null;             // the latest pluck: { u, b, sum, apex, tA0, tv0 }
    let lastPluckMs = 0;
    let hoverY = null;         // pointer height over the stroke, for the pluck marker
    let active = true;         // false while paused
    let loop = null;           // the rAF loop, created once drawing is wired up
    const rows = partialRows(F0);

    let door = null;           // the overture's answer, if any
    let last = null;           // the answer last given on this page, if any
    try { door = parseAnswer(localStorage.getItem(QUESTION_KEY)); } catch { /* storage blocked */ }
    try { last = parseAnswer(localStorage.getItem(CODA_KEY)); } catch { /* storage blocked */ }

    const bus = audio.createBus('coda');

    // ---------- the closing image ----------
    const vh = (typeof window.innerHeight === 'number' && window.innerHeight > 0) ? window.innerHeight : 800;
    const H0 = Math.round(Math.min(460, Math.max(360, vh * 0.5)));
    const handle = cv.setupCanvas(stage, { height: H0 });
    const canvasEl = handle.canvas;
    canvasEl.tabIndex = 0;
    canvasEl.setAttribute('role', 'button');
    canvasEl.setAttribute('aria-label',
      'The closing stroke: a tally mark, the digit 1 and a string. Press Enter to pluck it one fifth of the way along.');
    const glowGold = cv.glowSprite(P.gold, 48);
    const glowAzure = cv.glowSprite(P.azure, 48);
    const glowIvory = cv.glowSprite(P.ink, 48);
    const lamp = cv.glowSprite(P.goldBright, 28);

    // precomputed mode shapes along the drawn string: MODE[i*6 + k-1] = sin(kπ u_i)
    const MODE = new Float32Array((STR_SEG + 1) * PARTIALS);
    for (let i = 0; i <= STR_SEG; i++) {
      for (let k = 1; k <= PARTIALS; k++) MODE[i * PARTIALS + k - 1] = Math.sin(k * Math.PI * i / STR_SEG);
    }
    const xs = new Float32Array(STR_SEG + 1);

    // ---------- the question ----------
    const coreDiv = document.createElement('div');
    coreDiv.className = 'coda-core';
    stage.appendChild(coreDiv);

    const prompt = document.createElement('div');
    prompt.className = 'coda-prompt';
    prompt.id = 'coda-prompt';
    prompt.textContent = 'Mathematics — invented or discovered?';
    coreDiv.appendChild(prompt);

    const track = document.createElement('div');
    track.className = 'coda-track';
    coreDiv.appendChild(track);

    let ghostEl = null;
    if (door !== null) {
      ghostEl = document.createElement('span');
      ghostEl.className = 'coda-ghost';
      ghostEl.setAttribute('aria-hidden', 'true');
      // the 20px thumb travels over (100% − 20px); the mark sits over its centre
      ghostEl.style.left = `calc(10px + ${door.toFixed(4)} * (100% - 20px))`;
      track.appendChild(ghostEl);
    }

    const sliderEl = document.createElement('input');
    sliderEl.type = 'range';
    sliderEl.min = '0'; sliderEl.max = '1'; sliderEl.step = '0.001';
    sliderEl.value = '0.5';
    sliderEl.className = 'coda-slider unplaced';
    sliderEl.setAttribute('aria-labelledby', 'coda-prompt');
    sliderEl.setAttribute('aria-valuetext', door !== null
      ? `not yet placed; at the door you answered ${leanWords(door)}`
      : 'not yet placed');
    track.appendChild(sliderEl);

    const labels = document.createElement('div');
    labels.className = 'coda-labels';
    labels.setAttribute('aria-hidden', 'true');
    labels.innerHTML = '<span class="inv">invented</span><span class="disc">discovered</span>';
    coreDiv.appendChild(labels);

    const note = document.createElement('p');
    note.className = 'coda-note';
    note.setAttribute('aria-live', 'polite');
    note.textContent = door !== null
      ? `The small gold mark is where you stood at the door, ${leanWords(door)}. Place yourself again, knowing what you now know.`
      : 'You passed the door without answering, so no mark waits on this line. Place yourself for the first time.';
    coreDiv.appendChild(note);

    sliderEl.addEventListener('input', () => {
      v = parseFloat(sliderEl.value);
      if (!Number.isFinite(v)) v = 0.5;
      if (!placed) {
        placed = true;
        sliderEl.classList.remove('unplaced');
        if (ghostEl) ghostEl.classList.add('faded');
      }
      sliderEl.setAttribute('aria-valuetext', leanWords(v));
      updateMix();
      wake();
    });
    sliderEl.addEventListener('change', () => {
      if (!placed) return;
      note.textContent = answerNote({ door, last, now: v });
      try { localStorage.setItem(CODA_KEY, String(v)); } catch { /* not remembered, that is all */ }
    });

    // ---------- drone control ----------
    const controls = ui.controlRow(stage);
    const droneBtn = ui.button(controls, '', () => setDrone(!droneOn), { primary: true });
    // the label itself says what a press will do, so the button carries no aria-pressed
    const droneLabel = (on) => { droneBtn.innerHTML = `<span aria-hidden="true">♬</span> ${on ? 'silence' : 'sound the question'}`; };
    droneLabel(false);

    // ---------- the tuning, in numbers ----------
    const numbers = document.createElement('details');
    numbers.className = 'coda-numbers';
    const tableRows = rows.map((r) => r.shared
      ? `<tr class="same"><td>${r.k}</td><td class="pure">${fmtHz(r.just)}</td><td class="temp">${fmtHz(r.et)}</td><td>—</td><td>—</td></tr>`
      : `<tr><td>${r.k}</td><td class="pure">${fmtHz(r.just)}</td><td class="temp">${fmtHz(r.et)}</td><td>${fmtCents(r.gapCents)}</td><td>${r.beat.toFixed(2)}</td></tr>`).join('');
    numbers.innerHTML = `
      <summary>the tuning, in numbers</summary>
      <table class="coda-table">
        <thead><tr><th scope="col">partial</th><th scope="col">pure</th><th scope="col">tempered</th><th scope="col">gap</th><th scope="col">beats</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="coda-table-note">Frequencies and beat rates in hertz. The gap is the pure partial
      minus its tempered stand-in, in cents (hundredths of an equal-tempered semitone).
      Partials 1, 2 and 4 are octaves of the fundamental, where the two tunings agree exactly.</p>`;
    stage.appendChild(numbers);

    ui.caption(stage,
      'One object, three readings: the tally of Movement I, the string of Movement II and the <span class="lnum">1</span> of ' +
      'Movement III, the symbol the champion beaver leaves 4,098 times on its tape and the only mark ' +
      'in Hilbert’s stroke numerals. Silent, it is a mark. Sounding, it vibrates in the six modes you ' +
      'hear, slowed five-hundredfold, and the three modes the tunings dispute swell and fade at their ' +
      'true beat rates, timed by the audio clock. Touch the stroke, or focus it and press Enter, to ' +
      'pluck it: a pluck at a fraction <i>u</i> of its length excites partial <i>k</i> in proportion ' +
      'to sin(<i>k</i>π<i>u</i>)/<i>k</i>², so a pluck one fifth of the way along never sounds the ' +
      'disputed third at all.');

    ui.speculationPanel(stage, `
      <p>Out past every position named above stands Max Tegmark’s <em>mathematical universe
      hypothesis</em>: that the physical world is not merely <em>described</em> by mathematics
      but <em>is</em> a mathematical structure, and that every mathematical structure exists in
      the same way, a view that, he writes, can be seen as a form of radical Platonism.
      “Invented or discovered” would dissolve, because there is nothing else a universe could
      be. Even here the walls of Movement III reach in. In “The Mathematical Universe,” his
      2008 paper in <em>Foundations of Physics</em>, Tegmark suggests that only computable and
      decidable structures exist, the limits of proof redrawn as the borders of existence, and
      concedes in the same paper that virtually every historically successful theory of physics
      breaks that rule, because it uses the continuum of the real numbers. Critics doubt that a
      claim about structures no observation can reach could ever be tested; Tegmark answers
      that it predicts further mathematical regularities waiting in nature. It is metaphysics,
      not a theorem. We place it here, out past the labelled edge of the map.</p>`);

    // ---------- the site's last words ----------
    const lastWords = document.createElement('div');
    lastWords.className = 'coda-last will-reveal';
    lastWords.innerHTML = `
      <p>On 8 September 1930, in Königsberg, the city where he had gone to school and which had
      that year made him an honorary citizen, David Hilbert closed his address to the Society of
      German Scientists and Physicians with six words: <em>“Wir müssen wissen. Wir werden
      wissen.”</em> We must know. We will know. The day before, during a round-table discussion
      at a conference in the same city, a quiet 24-year-old named Kurt Gödel had remarked, almost
      offhandedly, that some statements about whole numbers, of the same kind as Goldbach’s
      conjecture, are true and yet unprovable in the formal system of classical mathematics.
      John von Neumann, in the audience, understood at once. Hilbert’s words were carved on his
      gravestone anyway.</p>
      <p>Gödel did not give up Hilbert’s creed. He shared the conviction that every mathematical
      question has a definite answer, and in 1951, lecturing at Brown University, he drew from
      his own theorems a disjunction he called a mathematically established fact: either the
      human mind infinitely surpasses every finite machine, or there are equations in whole
      numbers that no mind can ever settle. He believed the first.</p>
      <p class="coda-final">They were both right. That is the strangest theorem of all.</p>`;
    stage.appendChild(lastWords);

    let revealObs = null;
    if (typeof IntersectionObserver === 'function') {
      revealObs = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          revealObs.unobserve(e.target);
        }
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.2 });
      for (const child of lastWords.children) revealObs.observe(child);
    } else {
      for (const child of lastWords.children) child.classList.add('is-in');
    }

    // ---------- audio: octaves once, disputed partials in two banks, ramps only ----------
    function buildDrone() {
      const c = bus.context;
      const master = c.createGain();
      master.gain.value = 0;                       // silent at birth: no click
      master.connect(bus.input);
      const bankJ = c.createGain();
      const bankE = c.createGain();
      const g0 = xfadeGains(v);
      bankJ.gain.value = g0.just;                  // safe: master is at 0, inaudible
      bankE.gain.value = g0.et;
      bankJ.connect(master);
      bankE.connect(master);

      const oscs = [];
      const t0 = c.currentTime + 0.03;             // every oscillator starts in phase at t0
      const add = (freq, amp, dest) => {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = c.createGain();
        g.gain.value = amp;
        osc.connect(g).connect(dest);
        osc.start(t0);
        oscs.push({ osc, g });
      };
      for (let k = 1; k <= PARTIALS; k++) {
        const amp = LEVEL / k;
        if (isShared(k)) add(justFreq(F0, k), amp, master);
        else { add(justFreq(F0, k), amp, bankJ); add(etFreq(F0, k), amp, bankE); }
      }
      drone = { master, bankJ, bankE, oscs, t0 };
    }

    function setDrone(on) {
      droneOn = on;
      droneBtn.classList.toggle('active', on);
      droneLabel(on);
      clearTimeout(idleTimer);
      if (on) {
        audio.ensureAudio();                       // inside the user gesture
        if (!drone) buildDrone();
        audio.rampTo(drone.master.gain, 1, 0.18);
        wake();
      } else if (drone) {
        audio.rampTo(drone.master.gain, 0, 0.1);
        // nothing runs on the audio thread while the question is silent
        idleTimer = setTimeout(() => { if (!droneOn) disposeDrone(); }, 1500);
      }
    }

    function updateMix() {
      if (!drone) return;
      const g = xfadeGains(v);
      audio.rampTo(drone.bankJ.gain, g.just, 0.08);
      audio.rampTo(drone.bankE.gain, g.et, 0.08);
    }

    function disposeDrone() {
      if (!drone) return;
      const d = drone;
      drone = null;
      const c = bus.context;
      audio.rampTo(d.master.gain, 0, 0.04);
      const tStop = c.currentTime + 0.25;          // after the ramp has died away
      d.oscs.forEach(({ osc, g }, i) => {
        osc.onended = () => {
          try { osc.disconnect(); g.disconnect(); } catch { /* ok */ }
          if (i === 0) {
            try { d.bankJ.disconnect(); d.bankE.disconnect(); d.master.disconnect(); } catch { /* ok */ }
          }
        };
        try { osc.stop(tStop); } catch { /* already stopped */ }
      });
    }

    // ---------- pluck: the stroke is a string ----------
    function pluck(u) {
      const nowMs = performance.now();
      if (nowMs - lastPluckMs < 90) return;        // a flurry of taps is one pluck
      lastPluckMs = nowMs;
      audio.ensureAudio();
      const c = bus.context;
      const b = pluckAmps(u);
      let sum = 0, apex = 0;
      for (let k = 1; k <= PARTIALS; k++) {
        sum += Math.abs(b[k - 1]);
        apex += b[k - 1] * Math.sin(k * Math.PI * u);
      }
      const g = xfadeGains(v);
      const when = c.currentTime + 0.01;
      for (let k = 1; k <= PARTIALS; k++) {
        const lvl = 0.42 * Math.abs(b[k - 1]) / sum;
        if (lvl < 2e-3) continue;                  // a node: this partial is not excited
        const opts = { dur: 0.02, attack: 0.004, release: 4 * pluckTau(k), when, type: 'sine' };
        if (isShared(k)) audio.playTone(bus, { ...opts, freq: justFreq(F0, k), level: lvl });
        else {
          if (g.just > 0.01) audio.playTone(bus, { ...opts, freq: justFreq(F0, k), level: lvl * g.just });
          if (g.et > 0.01) audio.playTone(bus, { ...opts, freq: etFreq(F0, k), level: lvl * g.et });
        }
      }
      // how strongly each partial was excited, against its own maximum (a pluck at an antinode)
      const reach = b.map((_, i) => Math.abs(Math.sin((i + 1) * Math.PI * u)));
      pl = { u, b, sum, reach, apex: Math.max(1e-6, apex), tA0: when, tv0: nowMs / 1000 };
      wake();
    }

    function strokeHit(e) {
      const [x, y] = cv.pointerPos(handle, e);
      const L = layout();
      if (!L) return null;
      if (Math.abs(x - L.cx) > Math.max(56, handle.width * 0.08)) return null;
      if (y < L.y0 - 12 || y > L.y1 + 12) return null;
      return { y, u: Math.min(0.97, Math.max(0.03, (y - L.y0) / Math.max(1, L.y1 - L.y0))) };
    }
    const onDown = (e) => {
      const hit = strokeHit(e);
      if (!hit) return;
      pluck(hit.u);
    };
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      const hit = strokeHit(e);
      const y = hit ? hit.y : null;
      canvasEl.classList.toggle('can-pluck', !!hit);
      if (y !== hoverY) { hoverY = y; wake(); }
    };
    const onLeave = () => { canvasEl.classList.remove('can-pluck'); if (hoverY !== null) { hoverY = null; wake(); } };
    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      pluck(PLUCK_U);
    };
    canvasEl.addEventListener('pointerdown', onDown);
    canvasEl.addEventListener('pointermove', onMove);
    canvasEl.addEventListener('pointerleave', onLeave);
    canvasEl.addEventListener('keydown', onKey);

    // ---------- layout (cached per canvas size) ----------
    let lay = null;
    function layout() {
      const W = handle.width, H = handle.height;
      if (!(W > 1 && H > 1)) return null;
      if (lay && lay.W === W && lay.H === H) return lay;
      const ctx = handle.ctx;
      const ledgerH = 132;
      const yLedger = H - ledgerH;
      const y0 = 30;
      const yLabel = Math.max(y0 + 50, yLedger - 22);
      const y1 = Math.max(y0 + 30, yLabel - 30);
      const LW = Math.max(150, Math.min(W - 20, 640));
      const cw = LW / DISPUTED.length;
      const xL = (W - LW) / 2;
      const s = Math.max(0.6, Math.min(5.2, (cw - 30) / (2 * RULER)));
      // labels: take the longest variant that fits its cell
      const fits = (font, text, room) => { ctx.font = font; return ctx.measureText(text).width <= room; };
      // one naming level for all three cells, the fullest that fits every one of them
      const NAMES = { 3: ['the fifth', 'the fifth', 'fifth'], 5: ['the major third', 'the third', 'third'], 6: ['the fifth, again', 'the fifth', 'fifth'] };
      const fT = `italic 13px ${SERIF}`, fN = `11px ${MONO}`;
      ctx.font = fN;
      const wNumOf = (k) => ctx.measureText(String(k)).width + 7;
      let level = 0;
      while (level < 3 && !DISPUTED.every((k) => { ctx.font = fN; const wn = wNumOf(k); return fits(fT, NAMES[k][level], cw - 24 - wn); })) level++;
      const cells = DISPUTED.map((k, i) => {
        const r = rows[k - 1];
        ctx.font = fN; const wNum = wNumOf(k);
        const name = level < 3 ? NAMES[k][level] : '';
        const beatLong = `beats ${r.beat.toFixed(2)} Hz`;
        const beat = fits(`10px ${MONO}`, beatLong, cw - 8) ? beatLong : `${r.beat.toFixed(2)} Hz`;
        ctx.font = fT; const wName = name ? ctx.measureText(name).width : 0;
        return { k, cx: xL + cw * (i + 0.5), name, wNum, wName, beat, gap: r.gapCents, df: r.beat, gapLabel: fmtCents(r.gapCents) };
      });
      const fF = `italic 12.5px ${SERIF}`, fFN = `10.5px ${MONO}`;
      // digits go in the monospace: the serif's old-style 1 would read as a dotless i
      const footLong = [['pure', 'gold'], [' against ', 'faint'], ['tempered', 'azure'], [', in cents · partials ', 'faint'],
        ['1', 'num'], [', ', 'faint'], ['2', 'num'], [' and ', 'faint'], ['4', 'num'], [' agree exactly', 'faint']];
      const footShort = [['pure', 'gold'], [' against ', 'faint'], ['tempered', 'azure'], [', in cents', 'faint']];
      const wOf = (segs) => segs.reduce((a, [t, tone]) => { ctx.font = tone === 'num' ? fFN : fF; return a + ctx.measureText(t).width; }, 0);
      const foot = wOf(footLong) <= W - 48 ? footLong : footShort;
      lay = {
        W, H, cx: W / 2, y0, y1, yLabel, yLedger, cw, s, cells, fT, fN, fF, fFN, foot, footW: wOf(foot),
        yTitle: yLedger + 18, yR: yLedger + 58, yGap: yLedger + 82, yBeat: yLedger + 98, yFoot: yLedger + 124,
      };
      return lay;
    }
    handle.onResize(() => { lay = null; wake(); });

    // ---------- drawing: one stroke, three readings ----------
    const snap = (x) => Math.round(x * handle.dpr) / handle.dpr;
    const READ_MARK = ['a tally mark', 'the digit 1'];
    let drawn = false;

    function audioAge(t0) {
      const c = bus.context;
      if (!c) return 0;
      return Math.max(0, c.currentTime - t0 - (c.outputLatency || 0));
    }

    function draw(dt, t) {
      const L = layout();
      if (!L) return;
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);

      // eased state: colour follows the answer, level follows the master ramp
      const e = still ? 1 : Math.min(1, dt * 7);
      vShown += (v - vShown) * e;
      placedMix += ((placed ? 1 : 0) - placedMix) * (still ? 1 : Math.min(1, dt * 3));
      level += ((droneOn ? 1 : 0) - level) * Math.min(1, dt * (droneOn ? 5.5 : 10));
      if (level < 1e-3 && !droneOn) level = 0;
      const g = xfadeGains(vShown);
      const gSum = Math.max(1e-6, g.just + g.et);

      // real-time beat envelopes of the disputed partials, from the audio clock
      const env = [1, 1, 1, 1, 1, 1];
      if (drone && level > 0) {
        const age = audioAge(drone.t0);
        for (const k of DISPUTED) env[k - 1] = modeEnvelope(g.just, g.et, rows[k - 1].beat, age);
      }
      // pluck: per-partial decay, and its own beats (both versions start together)
      let pAge = 0, pEnergy = 0;
      const pAmp = [0, 0, 0, 0, 0, 0];
      const pEnv = [1, 1, 1, 1, 1, 1];
      if (pl) {
        pAge = Math.max(0, t - pl.tv0);
        const aAge = audioAge(pl.tA0);
        for (let k = 1; k <= PARTIALS; k++) {
          const d = Math.exp(-pAge / pluckTau(k));
          if (!isShared(k)) pEnv[k - 1] = modeEnvelope(g.just, g.et, rows[k - 1].beat, aAge);
          pAmp[k - 1] = pl.b[k - 1] * d;
          pEnergy += Math.abs(pl.b[k - 1]) * d;
        }
        pEnergy /= pl.sum;
        if (pEnergy < 0.01) { pl = null; pEnergy = 0; }
      }

      // ---- the stroke ----
      const cx = L.cx, y0 = L.y0, y1 = L.y1;
      const droneAmpPx = Math.min(30, W * 0.08) * level;
      const pluckPx = Math.min(34, W * 0.09);
      const tv = t;                  // the sounding string is content: it moves even under reduced motion
      const ph = [];
      for (let k = 1; k <= PARTIALS; k++) {
        const f = g.just * g.just * justFreq(F0, k) + g.et * g.et * etFreq(F0, k);
        ph.push(Math.sin(TAU * (f / SLOW) * tv + SEED[k - 1]) * (isShared(k) ? 1 : env[k - 1]) / k);
      }
      const pc = [];
      for (let k = 1; k <= PARTIALS; k++) {
        const f = justFreq(F0, k);
        pc.push(pl ? pAmp[k - 1] * pEnv[k - 1] * Math.cos(TAU * (f / SLOW) * pAge) / pl.apex : 0);
      }
      for (let i = 0; i <= STR_SEG; i++) {
        let sD = 0, sP = 0;
        const row = i * PARTIALS;
        for (let k = 0; k < PARTIALS; k++) { sD += MODE[row + k] * ph[k]; sP += MODE[row + k] * pc[k]; }
        xs[i] = cx + droneAmpPx * sD / NORM + pluckPx * sP;
      }

      // colour: pale ink until answered, then azure (invented) → gold (discovered)
      const answer = answerRGB(vShown, RGB.azure, RGB.ink, RGB.goldBright);
      const core = rgbCSS(mixRGB(RGB.ink, answer, placedMix));
      const haloAns = answerRGB(vShown, RGB.azureDim, RGB.inkFaint, RGB.goldDim);
      const halo = rgbCSS(mixRGB(RGB.goldDim, haloAns, placedMix));
      const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.45);
      const loud = level * 0.85 + Math.min(1, pEnergy * 1.4) * 0.6;
      const glow = Math.min(1.2, 0.24 + 0.1 * breath + loud);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pass = (w, color, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i <= STR_SEG; i++) {
          const y = y0 + (y1 - y0) * i / STR_SEG;
          if (i) ctx.lineTo(xs[i], y); else ctx.moveTo(xs[i], y);
        }
        ctx.stroke();
      };
      pass(12, halo, 0.05 + 0.09 * glow);
      pass(5, halo, 0.12 + 0.2 * glow);
      pass(2.2, core, Math.min(1, 0.6 + 0.4 * glow));

      // pools of light at the two fixed ends: gold until answered, then azure,
      // ivory and gold in the answer's proportion
      const wA = placedMix * Math.max(0, 1 - 2 * vShown);
      const wG = (1 - placedMix) + placedMix * Math.max(0, 2 * vShown - 1);
      const wI = Math.max(0, 1 - wA - wG) * 0.8;
      const endScale = Math.max(0.1, Math.min(0.95, 0.46 + glow * 0.34));
      for (const y of [y0, y1]) {
        for (const [spr, w] of [[glowAzure, wA], [glowIvory, wI], [glowGold, wG]]) {
          if (w < 0.01) continue;
          ctx.globalAlpha = Math.min(1, w);
          spr.draw(ctx, cx, y, endScale);
        }
      }
      ctx.globalAlpha = 1;

      // the pluck marker: where a touch would pull the string aside
      if (hoverY !== null && hoverY >= y0 && hoverY <= y1) {
        const i = Math.round((hoverY - y0) / Math.max(1, y1 - y0) * STR_SEG);
        const xh = xs[Math.min(STR_SEG, Math.max(0, i))];
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = P.inkDim;
        ctx.fillRect(snap(xh - 9), snap(hoverY), 18, 1);
        ctx.font = `italic 12px ${SERIF}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const uu = (hoverY - y0) / Math.max(1, y1 - y0);
        ctx.fillText('pluck', xh + 15, hoverY);
        ctx.fillStyle = P.inkFaint;
        ctx.font = `10px ${MONO}`;
        ctx.fillText(`u = ${uu.toFixed(2)}`, xh + 15, hoverY + 14);
        ctx.globalAlpha = 1;
      }

      // ---- the readings ----
      let reading, readAlpha = 1;
      if (pEnergy > 0.04) reading = 'a string, plucked';
      else if (level > 0.05) reading = 'a string, sounding';
      else if (still) reading = 'a tally mark, or the digit 1';
      else {
        const per = 6;
        const idx = Math.floor(t / per) % READ_MARK.length;
        const phase = (t % per) / per;
        reading = READ_MARK[idx];
        readAlpha = Math.max(0, Math.min(1, Math.min(phase, 1 - phase) * 7));
      }
      ctx.globalAlpha = readAlpha * 0.9;
      ctx.fillStyle = P.inkDim;
      ctx.textBaseline = 'alphabetic';
      // the serif's old-style 1 reads as a dotless i, so the digit itself is set in the
      // ledger's monospace, where a 1 cannot be mistaken for anything else
      const fR = `italic 15px ${SERIF}`, fD = `14px ${MONO}`;
      if (reading.endsWith(' 1')) {
        const head = reading.slice(0, -1);
        ctx.font = fR; const wH = ctx.measureText(head).width;
        ctx.font = fD; const wD = ctx.measureText('1').width;
        const xr = cx - (wH + wD) / 2;
        ctx.textAlign = 'left';
        ctx.font = fR; ctx.fillText(head, xr, L.yLabel);
        ctx.font = fD; ctx.fillText('1', xr + wH, L.yLabel);
      } else {
        ctx.font = fR;
        ctx.textAlign = 'center';
        ctx.fillText(reading, cx, L.yLabel);
      }
      ctx.globalAlpha = 1;

      // ---- the ledger: three disputes, in cents ----
      const aGold = placed ? 0.3 + 0.7 * g.just : 0.8;
      const aAzure = placed ? 0.3 + 0.7 * g.et : 0.8;
      for (const cell of L.cells) {
        const k = cell.k;
        const xc = cell.cx;
        // title: the partial's number (mono) and its interval (serif italic)
        const wTot = cell.wNum + cell.wName;
        let x = xc - wTot / 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = P.inkDim;
        ctx.globalAlpha = 0.95;
        ctx.font = L.fN;
        ctx.fillText(String(k), x, L.yTitle);
        if (cell.name) { ctx.font = L.fT; ctx.fillText(cell.name, x + cell.wNum, L.yTitle); }
        // the ruler: ±16 cents around the tempered rung
        const yR = L.yR, s = L.s;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = P.inkFaint;
        ctx.fillRect(snap(xc - RULER * s), snap(yR), 2 * RULER * s, 1);
        for (let c = -15; c <= 15; c += 5) {
          if (!c) continue;
          const hT = c % 10 === 0 ? 5 : 3;
          ctx.fillRect(snap(xc + c * s), snap(yR - hT), 1, hT);
        }
        // tempered rung (azure) and pure partial (gold)
        const xE = snap(xc), xJ = snap(xc + cell.gap * s);
        ctx.globalAlpha = aAzure;
        ctx.fillStyle = P.azure;
        ctx.fillRect(xE - 0.75, yR - 17, 1.5, 22);
        ctx.globalAlpha = aGold;
        ctx.fillStyle = P.gold;
        ctx.fillRect(xJ - 0.75, yR - 17, 1.5, 22);
        // the gap, as a bracket joining the two tick heads, with a faint wash beneath it
        const xa = Math.min(xE, xJ), gw = Math.abs(xJ - xE);
        ctx.globalAlpha = 0.07 + 0.05 * placedMix;
        ctx.fillStyle = P.ink;
        ctx.fillRect(xa, yR - 17, gw, 17);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = P.inkFaint;
        ctx.fillRect(xa - 0.75, snap(yR - 17), gw + 1.5, 1);
        // the lamp: this partial's loudness, beating when both versions sound
        const dI = level * (env[k - 1] / gSum);
        const pI = pl ? pl.reach[k - 1] * Math.exp(-pAge / pluckTau(k)) * (pEnv[k - 1] / gSum) : 0;
        const I = Math.min(1, dI * 0.9 + pI);
        if (I > 0.01) {
          ctx.globalAlpha = Math.min(1, I);
          lamp.draw(ctx, (xE + xJ) / 2, yR - 17, 0.35 + 0.45 * I);
        }
        // labels: the gap (mono) and the beat rate (mono, faint)
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = P.ink;
        ctx.fillText(cell.gapLabel, xc, L.yGap);
        ctx.globalAlpha = 0.85;
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = P.inkFaint;
        ctx.fillText(cell.beat, xc, L.yBeat);
      }
      // the key, in words coloured like the ticks
      ctx.textAlign = 'left';
      let xf = L.cx - L.footW / 2;
      for (const [txt, tone] of L.foot) {
        ctx.font = tone === 'num' ? L.fFN : L.fF;
        ctx.fillStyle = tone === 'gold' ? P.gold : tone === 'azure' ? P.azure : P.inkFaint;
        ctx.globalAlpha = tone === 'faint' || tone === 'num' ? 0.9 : 0.85;
        ctx.fillText(txt, xf, L.yFoot);
        xf += ctx.measureText(txt).width;
      }
      ctx.globalAlpha = 1;
      drawn = true;

      // reduced motion: once everything has settled and nothing sounds, stop drawing
      if (still && !droneOn && level === 0 && !pl && hoverY === null) loop.stop();
    }

    loop = cv.rafLoop(draw);
    function wake() {
      if (!active || !loop) return;
      if (!loop.running) loop.start();
    }
    loop.start();

    // ---------- lifecycle ----------
    return {
      pause() {
        active = false;
        loop.stop();
        if (droneOn) setDrone(false);   // ramped to zero — no click — then disposed
        bus.mute();
      },
      resume() {
        active = true;
        bus.unmute();
        loop.start();
      },
      destroy() {
        active = false;
        loop.stop();
        clearTimeout(idleTimer);
        disposeDrone();
        bus.dispose();
        if (revealObs) revealObs.disconnect();
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotionPref);
        canvasEl.removeEventListener('pointerdown', onDown);
        canvasEl.removeEventListener('pointermove', onMove);
        canvasEl.removeEventListener('pointerleave', onLeave);
        canvasEl.removeEventListener('keydown', onKey);
        handle.destroy();
        styleEl.remove();
      },
      // tooling: the harness can inspect state
      _state: () => ({ v, placed, droneOn, level, hasDrone: !!drone, pluck: !!pl, still, drawn }),
    };
  },
};

/* ---------- node-testable exports ---------- */

export const _test = {
  F0, PARTIALS, SLOW,
  nearestETSemitones, justFreq, etFreq, centsGap, beatRate,
  xfadeGains, parseAnswer, partialRows, stringOffset,
  QUESTION_KEY, CODA_KEY, DISPUTED, isShared, modeEnvelope, pluckAmps, pluckTau,
  leanWords, answerNote, mixRGB, hexRGB, selfTest,
};
