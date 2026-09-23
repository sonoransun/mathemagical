// content.js — the essay's connective prose: the overture, the four movement
// intros, the interludes between exhibits, the cross-exhibit motifs, the Long
// Arc's heading, the colophon and the footer. Exhibit prose lives inside each
// exhibit module; this file is the tissue between them. Plain data only: no
// DOM, importable under node.
//
// Shell contract (design/CONTRACT.md, "content.js exports"):
//   site        { title, subtitle, howToRead }   subtitle/howToRead: inline HTML
//   movements   { 1..4: { numeral, title, epigraph, epigraphCite?, lede } }
//   interludes  { <exhibitId>: html }             rendered after that exhibit
//   motifs      [{ key, glyph, label, pigment, ids, note }]   note: plain text
//   longArc     { title, lede }                   lede: inline HTML
//   colophon    html                              "a note on the making"
//   footer      inline HTML
//
// Every factual sentence here was checked against a source. The main ones:
// Wigner, Commun. Pure Appl. Math. 13 (1960); Hardy, A Mathematician’s Apology
// (1940), §28; Englund, “Proto-Cuneiform Account-Books” (CDLI) for Uruk IV;
// d’Errico et al., PNAS 2012 for the Lebombo bone; MacTutor (Kepler, Grandi,
// Leibniz); Turing 1936 (§6, §8); Cauchy, C. R. Acad. Sci. 25 (1847); NIST
// FIPS 203 (13 August 2024: n = 256, module rank k = 2, 3, 4); Ashby, Living
// Rev. Relativ. 6 (2003) on GPS clocks (38.6 μs a day, 11.6 km of light);
// Fowler & Robson (1998) on YBC 7289; the Fitzwilliam Museum’s illuminators’
// palette; Etymonline on “miniature”. Interludes are bridges: they must not
// repeat what the exhibit on either side of them already says.
//
// House spelling is British, as in the exhibits (colour, kilometre, centre).

export const site = {
  title: 'Mathemagical',
  subtitle:
    'A notched bone, a vibrating string, a diagonal that never ends, and the engines running ' +
    'quietly inside the phone in your pocket: an essay in four movements about where mathematics ' +
    'came from, what it sounds and looks like, where it runs out, and why it works at all. ' +
    'Everything here that moves, computes. Everything that sounds, counts.',
  howToRead:
    'Scroll, and the essay reads itself. Each framed plate is a live computation that wakes as ' +
    'you arrive and rests when you leave; anything that looks touchable is. Nothing sounds until ' +
    'you ask, and the ♪ on the rail (on a phone, the switch in the contents) silences everything. ' +
    'Gold italics carry the argument. Under each plate a chronicle dates the idea, a verdigris ' +
    'panel says where it lives now, and the sources wait for anyone who wants to check. Stories ' +
    'we love but cannot verify sit in gilt-edged italic panels; what is believed but not proved ' +
    'sits in a dashed blue frame. Everything outside them, we checked.',
};

export const movements = {
  1: {
    numeral: 'I',
    title: 'Origins',
    epigraph: 'Mathematics was born three times.',
    lede: `
      <p>First as a technology of <em>memory</em>: a pebble for every sheep, a notch for every
      pebble, because a herder’s eye — like yours, as the first exhibit will show you on
      yourself — cannot take in more than about four things at a glance. The older of the two
      notched bones that open this movement was cut some 43,000 years ago, by a hand that
      belonged to a mind exactly as able, and exactly as limited, as ours.</p>
      <p>Then as a technology of <em>administration</em>. When the first cities needed to know
      who owed how much barley to whom, counting and writing were born as a single profession:
      of the earliest tablets from Uruk, pressed from around 3300 BCE, fewer than one in a
      hundred is a word-list, and the rest are accounts. Out of that bureaucracy came fractions
      that divide bread without quarrels, and a positional notation so capable that your
      wristwatch still runs on it, some four thousand years later.</p>
      <p>And finally as something with no precedent at all: a <em>game of pure reason</em>,
      played with two tools and five rules, in which statements are not recorded but
      <em>proved</em>. Among its first honest results was a length that no number could name,
      and mathematics has never recovered, which is another way of saying it has never
      stopped. Watch what each birth costs. Every one trades something you can hold for
      something you can trust further than your hands can reach.</p>`,
  },
  2: {
    numeral: 'II',
    title: 'Resonance',
    epigraph: 'Music is a hidden exercise in arithmetic, by a mind that does not know it is counting.',
    epigraphCite: 'Leibniz, letter to Goldbach, 1712',
    lede: `
      <p>A chord and a curve can be the same object, seen through different senses. For most of
      recorded history that sentence would have needed no defence. Early in the sixth century
      Boethius gave the four mathematical arts — arithmetic, music, geometry and astronomy — a
      single name, the <em>quadrivium</em>, and through the Middle Ages a student of harmony
      was, officially, a student of number.</p>
      <p>Johannes Kepler went looking for the chords the planets sing, and in <em>Harmonices
      Mundi</em> of 1619 he came back with his third law, phrased in the old vocabulary of
      harmony: <em>“the proportion between the periodic times of any two planets is precisely
      the sesquialterate proportion of their mean distances.”</em> Sesquialtera is three to two,
      the ratio of the perfect fifth, here promoted to an exponent. The celestial music did not
      survive. The law did.</p>
      <p>This movement makes the old claim again, seven ways, with better instruments: what the
      ear calls <em>harmony</em> and the eye calls <em>symmetry</em> are the same numbers wearing
      different clothes. Every exhibit here couples a sound to an image through one shared piece
      of mathematics, so that when you change the number both change together, because there is
      only one thing changing.</p>
      <p>We begin inside a single vibrating string, watch pure ratios fail, beautifully and
      audibly, to close the circle of fifths, see chords as curves and tones as geometry, and
      then meet the great generalization: <em>every</em> shape and <em>every</em> timbre is a sum
      of circles. Keep hold of that one. In Movement&nbsp;IV it will be deciding what the photographs
      on your phone can afford to forget. The movement ends at the most irrational number there
      is, where periodicity dies and something stranger survives.</p>`,
  },
  3: {
    numeral: 'III',
    title: 'Horizon',
    epigraph: 'One trick — the diagonal — detonates three times, at three scales.',
    lede: `
      <p>In 1900, in Paris, David Hilbert set the new century its homework, and second on his
      list was a proof that the axioms of arithmetic can never contradict themselves. In 1928
      he and Wilhelm Ackermann asked for more: a procedure that would decide, in finitely many
      operations, whether any statement of logic is valid. It seemed possible to finish. By 1936
      both hopes had been answered, not with a completion but with a map of the edge, drawn by a
      single trick older than the questions.</p>
      <p>The first detonation destroys complete <em>lists</em>: no enumeration can hold all the
      real numbers. The second destroys complete <em>theories</em>: no honest set of axioms can
      prove every truth about arithmetic, its own sanity included. The third destroys complete
      <em>computation</em>: no program can foresee what all programs will do, and the smallest
      machines already run for lifetimes of the universe before halting.</p>
      <p>Nothing in this movement is a metaphor. You will run the diagonal against your own
      list, chop a hydra that regrows, race the actual champion machines, and check, prime by
      prime, a correspondence so deep that it settled a question left open for three and a half
      centuries. Where the ground turns to conjecture, the page will say so, in a marked panel,
      every time. The walls are real. So, it turns out, are the bridges.</p>`,
  },
  4: {
    numeral: 'IV',
    title: 'Engines',
    epigraph:
      'The miracle of the appropriateness of the language of mathematics for the formulation of ' +
      'the laws of physics is a wonderful gift which we neither understand nor deserve.',
    epigraphCite: 'Eugene Wigner, 1960',
    lede: `
      <p>In 1940, with Britain at war, G.&nbsp;H.&nbsp;Hardy published a sentence of perfect
      confidence: <em>“No one has yet discovered any warlike purpose to be served by the theory
      of numbers or relativity, and it seems very unlikely that anyone will do so for many
      years.”</em> Both of his examples now work inside the phone in your pocket. The theory of
      numbers stands guard over nearly every padlocked connection on the web. Relativity is
      built into the clock aboard every GPS satellite: left to itself, each would gain about
      38.6&nbsp;microseconds a day on clocks on the ground, 11.6&nbsp;kilometres of light, so
      each is tuned slow before it is launched.</p>
      <p>This movement makes the case for what the title of Wigner’s essay calls <em>the
      unreasonable effectiveness of mathematics</em>, in seven engines, each built from something
      the earlier movements met as pure play. Curves like the one we counted prime by prime now
      agree on secret keys in public. Fourier’s circles decide how much of a photograph can be
      thrown away unseen. Parity, the even and odd that doomed the diagonal’s fraction, becomes a code that
      finds and repairs its own errors.</p>
      <p>Euclid’s circles, cutting one another, find you on the planet, timed by clocks that
      Einstein corrects. A cousin of the eigenvectors that drew sand into Chladni’s figures ranks
      the web; a descent that Augustin-Louis Cauchy proposed in 1847 teaches machines; and the
      continued fractions that explained the twelve-note octave read a period off a quantum
      computer’s measurement. Each engine runs here in miniature on your own machine, computing
      the real thing with nothing fetched from anywhere, and the one no browser can hold, the
      quantum one, is simulated amplitude by amplitude and says so.</p>
      <p>And the movement ends by turning on itself, with an algorithm Peter Shor published in
      1994 which, on a large enough quantum computer, would pick the very lock the movement opens
      with.</p>`,
  },
};

// Interludes render after the exhibit whose id is the key. The one after a
// movement's last exhibit renders before the next movement's intro. There is
// one for every exhibit-to-exhibit transition (24); none follows the coda.
export const interludes = {
  // ── I · Origins ──
  tally: `
    <p>From pebble to granary: when the pouch of stones becomes a clay ledger, number leaves
    the body and enters the institution. An institution must do more than count what it holds.
    It must share it out, and the next exhibit crosses to the Nile to watch a scribe divide the
    bread.</p>`,
  loaves: `
    <p>Two rivers, two answers. Egypt perfects <em>sharing</em>: fractions whose fairness you
    can see. Babylon perfects <em>position</em>: where a symbol sits decides what it is worth.
    Notation is destiny, and each choice will echo for four millennia.</p>`,
  sixty: `
    <p>Everything so far says <em>how</em>. The tablets are recipes: do this, then this, and
    the granary balances. The next step is a change in the audience. A recipe satisfies the
    tax collector; the new mathematics answers a harder listener, the sceptic who asks
    <em>why must it be so?</em></p>`,
  twotools: `
    <p>Played honestly, with no tools but its own two, the game hands over the diagonal of the
    simplest square as readily as its side. Then arithmetic is asked to name the ratio between
    them, and cannot. The trouble comes not from outside mathematics but from its centre, and
    it comes with a proof that it will never go away.</p>`,
  diagonal: `
    <p>Movement&nbsp;I ends on a sound. Two tones at √2&nbsp;:&nbsp;1 trace a curve that never
    closes; retune them to 3&nbsp;:&nbsp;2 and it snaps shut. The Greeks who could not name the
    diagonal knew one place where whole-number ratios rule: a stretched string, where the ear
    checks each fraction before the mind can. <em>Rational is periodic.</em> The next movement
    plays that sentence seven ways.</p>`,

  // ── II · Resonance ──
  monochord: `
    <p>The monochord’s quarrel was local: one third, one comma. Stack the pure fifth twelve
    times and the quarrel goes global. Twelve fifths almost make seven octaves, the way
    17&nbsp;×&nbsp;17 almost makes 2&nbsp;×&nbsp;12&nbsp;×&nbsp;12, and it is the diagonal’s
    near-miss again, settled by the diagonal’s own weapon: threes multiplied together are
    always odd, twos multiplied together are always even, and so no stack of fifths ever lands
    exactly on a stack of octaves.</p>`,
  fifths: `
    <p>So far the spiral’s near-misses have been heard, as beats. They can also be watched.
    Wire two tones to the two axes of a point of light, as the diagonal’s last station did,
    and every fraction on the spiral draws a figure of its own; every near-miss sets that
    figure turning.</p>`,
  harmonograph: `
    <p>Every vibration so far has run along a line: a string, or a tone pushing a point of
    light along one axis. An ideal string is generous with whole numbers, its overtones
    standing at one, two, three times the fundamental. Spread the vibration across a surface
    and the generosity ends. Strew sand on a metal plate and bow it, and each tone the plate
    can sing draws a figure of its own.</p>`,
  chladni: `
    <p>Each sand figure is a single mode, and a real sound is a crowd of them. Fourier’s
    wager, which the next exhibit lets you test with your own pen, is that this is how
    everything works: every shape and every sound is a sum of pure modes, and the list of how
    much of each <em>is</em> the thing.</p>`,
  fourier: `
    <p>Circles within circles rebuild a drawing. Slow a vibration far enough and the ear stops
    hearing a pitch and starts hearing a pulse: a tone and a groove can be one pattern at two
    speeds. The next circle carries no curve at all, only beats, and the question of how to
    space a few of them as evenly as whole numbers allow has an answer far older than any
    drum machine.</p>`,
  euclid: `
    <p>Euclid’s rhythms are the most even a fraction allows: any number of strokes over any
    number of beats, and never more than two sizes of gap. But every fraction eventually
    repeats itself. What does the most even arrangement look like when there is no fraction at
    all, when the turn from one seed to the next is the number that resists approximation by
    ratios harder than any other?</p>`,
  golden: `
    <p>The golden angle leaves a question ringing. The sunflower’s order never repeats, yet it
    is perfectly lawful. How much more is out there that is lawful but beyond every pattern,
    true but beyond every proof, computable but beyond every lifetime? The next movement walks
    to the edge and looks over.</p>`,

  // ── III · Horizon ──
  cantor: `
    <p>The first detonation broke a list, any list. To aim the same trick at a theory takes one
    more ingredient: sentences that can talk about sentences. In 1931 Kurt Gödel supplied it by
    turning every formula into a number and every proof into arithmetic, and then he drew the
    diagonal again.</p>`,
  loop: `
    <p>Gödel’s diagonal broke a theory. Five years later Alan Turing turned the same line on
    machines — you met it in his own symbols two exhibits ago — and concluded that no machine
    can decide, for every machine, what it will eventually do. The third detonation leaves the
    smallest crater and the deepest, and it can be measured with machines of a handful of
    states.</p>`,
  beavers: `
    <p>Three walls, each raised by the same diagonal. But a horizon holds more than walls. Out
    past the limits of proof and computation run passages no one dug, correspondences between
    provinces of mathematics with no visible right to know each other, and the next exhibit
    stands you inside one.</p>`,
  rosetta: `
    <p>The bridge you just crossed nearly fell in the building. Andrew Wiles announced the proof
    at its heart in June 1993; within months a gap had surfaced, and it took a year, and the
    help of his former student Richard Taylor, to close it. Mathematics runs on trust in
    arguments too long for most of us to check, and the last exhibit of this movement asks who,
    or what, should do the checking.</p>`,
  telescope: `
    <p>Here is the irony on which the next movement turns. The 1936 paper that proved no machine
    can decide everything also described, in its sixth section, <em>“a single machine which can
    be used to compute any computable sequence”</em>: software, conceived a dozen years before
    the first electronic stored-program computer ran. The hand that drew the walls drew the
    engine too.</p>`,

  // ── IV · Engines ──
  handshake: `
    <p>Read together, Claude Shannon’s papers of 1948 and 1949 set every message three tasks:
    to stay secret, to stay small, and to stay whole. The handshake settles the first. The
    second is a question of what to throw away, and Movement&nbsp;II already knows the answer: a
    picture, like a sound, is a sum of cosines, and the eye barely misses the fastest ones.</p>`,
  lossy: `
    <p>Compression wrings redundancy out of a message. Error correction puts it back,
    deliberately and in exactly the right shape, so that damage can be found and undone. The
    trick begins with the test Aristotle cited against every fraction for the diagonal: even
    and odd.</p>`,
  selfheal: `
    <p>A code lets a receiver distrust its own bits and still recover the truth. The next
    engine carries that distrust into geometry. Its receiver hears the satellites clearly and
    cannot trust itself, and the way out, once again, is to make its own error one more thing
    to be found.</p>`,
  whereami: `
    <p>The receiver finds itself by guessing and correcting until the corrections vanish. The
    next engine asks a question with no satellites in it, which pages of the web matter most,
    and answers it with nothing but patience: no misfit to measure, no guess to correct, only
    the web’s own links, followed again and again.</p>`,
  eigen: `
    <p>The web’s ranking is found by waiting: the rule never changes, and the answer is whatever
    the rule cannot wear away. The next engine does not wait; it chooses. It measures how wrong
    it is, finds which way is downhill, takes a small step, and measures again. The oldest
    statement of the recipe is nearly a century and a half older than the web.</p>`,
  learner: `
    <p>The handshake that opened this movement rests on a bet: that no classical computer can
    retrace its walk in time to matter. The last engine asks what happens if the computer
    itself changes. Its heart is the refrain of Movement&nbsp;II, <em>rational is periodic</em>,
    turned into a weapon: find the period hidden in a sequence of powers, and a fraction gives
    the secret away.</p>`,
  shor: `
    <p>As far as anyone knows, the period-finder has no purchase on the lattice that now stands
    beside the curve in every hybrid handshake: a grid of points like the one on which you
    hunted the diagonal’s fraction, extended into hundreds of dimensions. The oldest objects in
    this essay keep returning as its newest engines. One question remains, and it was asked
    before any of this began.</p>`,
};

// Cross-exhibit motifs. The shell turns each into echo chips under the
// exhibits it names (each chip links to the next exhibit sharing the motif,
// in page order) and may draw them as threads. `note` is plain text: it is
// used as a tooltip. Every id is a manifest id; every motif spans ≥ 3 exhibits.
export const motifs = [
  {
    key: 'root2', glyph: '√2', label: 'The square’s diagonal', pigment: 'crimson',
    ids: ['sixty', 'twotools', 'diagonal', 'monochord', 'golden', 'eigen'],
    note: 'The length no fraction can name keeps coming back: missing from Plimpton 322, living in the towers of square roots the compass builds, hunted on the Pell staircase, heard as the tritone, set as a turn beside the golden angle, and closed in on by Theon’s ladder of sides and diagonals.',
  },
  {
    key: 'diagonal-argument', glyph: '⋱', label: 'The diagonal argument', pigment: 'crimson',
    ids: ['cantor', 'loop', 'beavers'],
    note: 'One trick, three detonations: Cantor flips the diagonal of a list, Gödel lets a sentence speak about its own number, Turing runs every machine against itself, and the busy beavers inherit the wall.',
  },
  {
    key: 'invariants', glyph: '≡', label: 'Parity and invariants', pigment: 'crimson',
    ids: ['diagonal', 'loop', 'selfheal'],
    note: 'The cheapest proofs count something that cannot change: even and odd sink every fraction for √2, a count modulo 3 settles the MIU puzzle, and three overlapping parity checks spell out the address of a flipped bit.',
  },
  {
    key: 'towers', glyph: '↑↑', label: 'Towers', pigment: 'crimson',
    ids: ['twotools', 'cantor', 'loop', 'beavers'],
    note: 'Each floor built on the last: square roots nested over square roots, infinities above infinities, ordinals climbing toward ε₀, and numbers too tall to write down.',
  },
  {
    key: 'fifth', glyph: '3:2', label: 'Three against two', pigment: 'azure',
    ids: ['monochord', 'fifths', 'harmonograph', 'coda'],
    note: 'The perfect fifth: two-thirds of a string, the step that never closes the circle, the figure a chord draws, and the interval in the closing drone, two cents wider than the piano’s.',
  },
  {
    key: 'continued-fractions', glyph: '[;]', label: 'Continued fractions', pigment: 'azure',
    ids: ['diagonal', 'fifths', 'golden', 'shor'],
    note: 'Euclid’s ladder written as a number: √2 = [1; 2, 2, 2, …], the 7/12 behind the twelve-note octave, the golden ratio’s endless ones, and the convergent that reads a period off a quantum measurement.',
  },
  {
    key: 'three-gap', glyph: '∴', label: 'Three gaps', pigment: 'azure',
    ids: ['fifths', 'euclid', 'golden'],
    note: 'Step a fixed turn around a circle and the gaps between the marks come in at most three sizes: stacked fifths and the seeds of a sunflower obey the theorem, and the most even rhythms and scales hold it to two.',
  },
  {
    key: 'circles', glyph: '∿', label: 'Sums of circles', pigment: 'azure',
    ids: ['monochord', 'chladni', 'fourier', 'rosetta', 'lossy', 'shor'],
    note: 'Fourier’s wager in six guises: a plucked string’s overtones, a plate’s modes, a drawing rebuilt from epicycles, the coefficients of a modular form, the cosines a JPEG keeps, and the quantum Fourier transform.',
  },
  {
    key: 'clock', glyph: 'mod', label: 'Clock arithmetic', pigment: 'azure',
    ids: ['fifths', 'rosetta', 'handshake'],
    note: 'Numbers that wrap around: the twelve pitch classes of the circle of fifths, the points of a curve counted modulo a prime, and a secret agreed modulo a prime while everyone listens.',
  },
  {
    key: 'periodic', glyph: '↻', label: 'Rational is periodic', pigment: 'gold',
    ids: ['sixty', 'diagonal', 'fifths', 'harmonograph', 'euclid', 'golden', 'cantor', 'shor'],
    note: 'A fraction always comes home: reciprocals that end or repeat, curves that close, rhythms that loop, rows of digits that recur, and a hidden period that a quantum computer can be made to reveal.',
  },
  {
    key: 'euclid-algorithm', glyph: 'gcd', label: 'Euclid’s algorithm', pigment: 'gold',
    ids: ['diagonal', 'euclid', 'handshake', 'shor'],
    note: 'Take the smaller from the larger and repeat: on a side and its diagonal it never halts, it spaces a drum pattern as evenly as a fraction allows, it finds the inverses a key exchange needs, and it splits a number once the number’s period is known.',
  },
  {
    key: 'doubling', glyph: '×2', label: 'Doubling', pigment: 'gold',
    ids: ['tally', 'loaves', 'loop', 'handshake'],
    note: 'A 3 beside a 6 and a 4 beside an 8 on the Ishango bone, Egyptian multiplication done by doubling, the MIU rule that doubles a string, and the doubling of points that makes a walk on an elliptic curve fast.',
  },
  {
    key: 'checking', glyph: '⊢', label: 'Checking and finding', pigment: 'gold',
    ids: ['twotools', 'beavers', 'telescope', 'handshake'],
    note: 'Finding is hard and checking is easy: a construction written up as a proof, a record certified by a proof assistant, a kernel that checks every step, and a walk on a curve that is easy to take and hard to retrace.',
  },
  {
    key: 'eigen', glyph: 'λ', label: 'Eigenvectors', pigment: 'verdigris',
    ids: ['monochord', 'chladni', 'golden', 'eigen'],
    note: 'Shapes a system hands back unchanged except in size: the standing waves of a string, the nodal lines where sand collects on a plate, the Fibonacci step whose stretch is the golden ratio, and the ranking the links of the web return to.',
  },
  {
    key: 'curves-mod-p', glyph: 'y²', label: 'Curves counted mod p', pigment: 'verdigris',
    ids: ['rosetta', 'handshake', 'shor'],
    note: 'An elliptic curve reduced modulo a prime: counted point by point to test a correspondence, walked to agree on a key, and, on a large enough quantum computer, undone by period-finding.',
  },
  {
    key: 'iteration', glyph: 'lim', label: 'Repeat until it settles', pigment: 'verdigris',
    ids: ['beavers', 'whereami', 'eigen', 'learner'],
    note: 'One step, repeated: a five-state machine halts after exactly 47,176,870 of them, a receiver corrects its guess until the circles agree, power iteration settles on the web’s ranking, and gradient descent settles into a valley.',
  },
  {
    key: 'error', glyph: '±', label: 'Living with error', pigment: 'verdigris',
    ids: ['monochord', 'lossy', 'selfheal', 'whereami'],
    note: 'Error is budgeted, never banished: equal temperament spreads the tuning’s errors evenly across the keyboard, a JPEG spends its losses where the eye is least sensitive, a Hamming code corrects a flipped bit, and a satellite receiver solves for its own clock’s mistake.',
  },
];

export const longArc = {
  title: 'The Long Arc',
  lede:
    'Every dated event in the essay’s chronicles, set on one timeline with a lane for each ' +
    'movement and one for the coda, from a bone notched some 43,000 years ago to the present ' +
    'year. The scale is logarithmic: a date sits at the logarithm of six plus its distance in ' +
    'years from the end of 2026, so each step into the past spans more years than the one ' +
    'before, and the crowded recent centuries have room to breathe. Every dot leads back to its ' +
    'exhibit.',
};

export const colophon = `
  <p>There is not an image file on these pages: everything is drawn, and everything drawn is
  computed. The essay is built from vanilla JavaScript, Canvas 2D and the Web Audio API, with
  no libraries, no build step, no fonts, images or scripts fetched from anywhere, and no network
  requests at all. Every exhibit computes the real object rather than a picture of one: the
  diagonal’s lattice is exact at any size, the champion busy beaver really takes its 47,176,870
  steps, the modular form is really multiplied out, prime by prime, and every sound is
  synthesized from the numbers on the screen.</p>
  <p>The ornament obeys the same rule. The stars behind the text are the Gaussian primes: the
  Gaussian integers <i>a</i> + <i>b</i>i that cannot be factored any further. When <i>a</i> and
  <i>b</i> are both nonzero, that happens exactly when <i>a</i>² + <i>b</i>² is an
  ordinary prime, and on the two axes exactly when the lone coordinate is a prime of the form
  4<i>n</i> + 3. The fleurons are Guido Grandi’s roses, the curves <i>r</i> = cos <i>k</i>θ that
  he first described in a letter to Leibniz in December 1713 and gathered in 1728 as
  <em>Flores geometrici</em>. Each movement opens over an object computed from its own
  material and named in a caption beneath it, and the initial letter of every numbered exhibit
  carries a small copy of its movement’s figure.</p>
  <p>The emblem on the first screen is a compass circle ringed with sixty ticks, its inscribed
  square, and that square’s diagonal, labelled 1&nbsp;24&nbsp;51&nbsp;10: the value of √2 that the Old
  Babylonian tablet YBC 7289, now in the Yale Babylonian Collection, writes along a square’s
  diagonal in base sixty, some thirty-seven centuries ago, within about six ten-millionths of
  the truth. Threaded through the square is the figure a perfect fifth draws, three against
  two.</p>
  <p>The four colours are an illuminator’s pigments, one to a movement: gold leaf for the
  origins, azurite and ultramarine for resonance, vermilion and red lead for the horizon, and
  verdigris for the engines. Red lead’s Latin name, <em>minium</em>, gave the verb
  <em>miniare</em>, to paint red, and from it the word <em>miniature</em>; the smallness came
  later, by association. The type climbs in just major thirds, each size five-fourths of the
  last, the ratio of the third the monochord tunes pure.</p>
  <p>The site remembers three small things, and only in your own browser: whether you want
  sound, and how you answered the one question, at the door and again at the end. Nothing is
  sent anywhere. Dates, numbers, names and quotations were checked against papers, catalogues
  and primary sources, which are listed with each exhibit. A story we could not verify is
  told as a story, in a gilt-edged panel of its own; where the ground becomes conjecture, the
  page says so; and what we could not check, we left out.</p>`;

export const footer =
  '<em>Mathemagical</em> — an essay you can play, in four movements and a coda. To read it ' +
  'offline, serve its folder with <code>python3 -m http.server</code> and open it in a browser.';
