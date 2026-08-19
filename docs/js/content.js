// content.js — the essay's connective prose: overture, movement intros,
// interludes between exhibits, and the footer. Exhibit-specific prose lives
// inside each exhibit module; this file is the tissue between them.

export const site = {
  title: 'Mathemagical',
  subtitle:
    'A creative exploration of the origin of mathematics, its intersection with the ' +
    'musical and visual arts, and the theoretical future of the boundaries of pure exploration. ' +
    'Everything here that moves, computes. Everything that sounds, counts.',
};

export const movements = {
  1: {
    numeral: 'I',
    title: 'Origins',
    epigraph: 'Mathematics was born three times.',
    lede: `
      <p>First as a technology of <em>memory</em>: a pebble for every sheep, a notch for every
      pebble, because a herder's mind — like yours, as the first exhibit will demonstrate on
      you personally — cannot hold more than about four things at once.</p>
      <p>Then as a technology of <em>administration</em>: fractions that divide bread without
      quarrels, a positional notation so powerful your wristwatch still runs on it,
      four thousand years later.</p>
      <p>And finally as something with no precedent at all: a <em>game of pure reason</em>,
      played with two tools and five rules, in which statements are not recorded but
      <em>proved</em>. The game's first honest players immediately discovered a length that no
      number could name — and mathematics has never recovered, which is another way of saying
      it has never stopped.</p>`,
  },
  2: {
    numeral: 'II',
    title: 'Resonance',
    epigraph: 'A chord and a curve can be the same object, seen through different senses.',
    lede: `
      <p>This movement makes one claim seven ways: what the ear calls <em>harmony</em> and the
      eye calls <em>symmetry</em> are the same numbers wearing different clothes. Every exhibit
      here couples a sound to an image through a single shared piece of mathematics — change
      the number and both change together, because there is only one thing changing.</p>
      <p>We begin inside a single vibrating string, watch pure ratios fail — beautifully,
      audibly — to close the circle of fifths, see chords as curves and tones as geometry,
      and then meet the great generalization: <em>every</em> shape and <em>every</em> timbre
      is a sum of circles. The movement ends at the most irrational number in existence,
      where periodicity dies and something stranger survives.</p>`,
  },
  3: {
    numeral: 'III',
    title: 'Horizon',
    epigraph: 'One trick — the diagonal — detonates three times, at three scales.',
    lede: `
      <p>The first detonation destroys complete <em>lists</em>: no enumeration can hold all the
      real numbers. The second destroys complete <em>theories</em>: no honest set of axioms can
      prove every truth about arithmetic — including its own sanity. The third destroys complete
      <em>computation</em>: no program can foresee what all programs will do, and the smallest
      machines already run for lifetimes of the universe before halting.</p>
      <p>Nothing in this movement is a metaphor. You will run the diagonal against your own
      list, chop a hydra that regrows, race the actual champion machines, and check — prime by
      prime — a correspondence so deep it took three and a half centuries to explain. Where the
      ground turns to conjecture, the page will say so, in a marked panel, every time. The walls
      are real. So, it turns out, are the bridges.</p>`,
  },
};

// Interludes render after the exhibit whose id is the key.
export const interludes = {
  tally: `
    <p>From pebble to granary: when the pouch of stones becomes a clay ledger, number leaves
    the body and enters the institution. Writing and arithmetic are born in the same act —
    record-keeping — and for a thousand years they are the same profession.</p>`,
  loaves: `
    <p>Two rivers, two answers. Egypt perfects <em>sharing</em> — fractions you can see the
    fairness of. Babylon perfects <em>position</em> — where a symbol sits decides what it is
    worth. Notation is destiny: each choice will echo for four millennia.</p>`,
  sixty: `
    <p>Everything so far says <em>how</em>. The tablets are recipes: do this, then this, and
    the granary balances. The next step is a change in the audience. A recipe satisfies the
    tax collector; the new mathematics answers a harder listener — the skeptic who asks
    <em>why must it be so?</em></p>`,
  twotools: `
    <p>And then the game turned on its makers. Played honestly, with no tools but its own two,
    geometry produced a length that arithmetic could not name. The crisis arrived not from
    outside mathematics but from its center — the diagonal of the simplest square.</p>`,
  golden: `
    <p>The golden angle leaves a question ringing: the sunflower's order never repeats, yet it
    is perfectly lawful. How much more is out there that is lawful but beyond every pattern,
    true but beyond every proof, computable but beyond every lifetime? The last movement walks
    to the edge and looks over.</p>`,
};

export const footer =
  'Mathemagical — an essay you can play. Built with vanilla JavaScript, Canvas, and the ' +
  'Web Audio API; no libraries, no build step. Every exhibit computes the real object. ' +
  'Serve locally with <code>python3 -m http.server</code>.';
