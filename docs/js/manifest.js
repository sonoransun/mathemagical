// manifest.js — the essay's table of contents, in page order.
// Each entry doubles as placeholder metadata when a module isn't present yet;
// titles and hooks mirror the modules' own exports (tests.html reports any
// drift, and the integrator syncs them).
//
// Entry shape: { path, id, movement: 1|2|3|4, title, hook, coda?, bare? }
//   coda: true  → the shell numbers it "Coda" rather than "IV · 8"
//   bare: true  → the stage gets no plate frame
// Exactly one entry is the coda, and it comes last.
export const MANIFEST = [
  // I · Origins
  { path: './exhibits/origins/tally.js', id: 'tally', movement: 1, title: 'One, Two, Many', hook: 'Count a flock without knowing how to count.' },
  { path: './exhibits/origins/loaves.js', id: 'loaves', movement: 1, title: 'The Scribe’s Loaves', hook: 'Divide three loaves among four workers so that no one can complain.' },
  { path: './exhibits/origins/sixty.js', id: 'sixty', movement: 1, title: 'Sixty', hook: 'Why your clock still speaks Babylonian — and how to divide by 3 with no remainder, ever.' },
  { path: './exhibits/origins/twotools.js', id: 'twotools', movement: 1, title: 'The Two Tools', hook: 'Solve a 2,300-year-old problem with your own hands — using only the two tools Euclid allows.' },
  { path: './exhibits/origins/diagonal.js', id: 'diagonal', movement: 1, title: 'The Diagonal', hook: 'Hunt for the fraction that measures a square’s diagonal — and hear why you will never find it.' },
  // II · Resonance
  { path: './exhibits/resonance/monochord.js', id: 'monochord', movement: 2, title: 'The Monochord', hook: 'Pluck one string; every interval — and the war between pure tuning and the piano — is already inside it.' },
  { path: './exhibits/resonance/fifths.js', id: 'fifths', movement: 2, title: 'The Spiral of Fifths', hook: 'Twelve steps that never quite come home.' },
  { path: './exhibits/resonance/harmonograph.js', id: 'harmonograph', movement: 2, title: 'The Harmonograph', hook: 'What a chord looks like.' },
  { path: './exhibits/resonance/chladni.js', id: 'chladni', movement: 2, title: 'Chladni Figures', hook: 'Sand finds the silence inside a sound.' },
  { path: './exhibits/resonance/fourier.js', id: 'fourier', movement: 2, title: 'The Fourier Atelier', hook: 'Draw any shape; circles rebuild it, and the same numbers become its voice.' },
  { path: './exhibits/resonance/euclid.js', id: 'euclid', movement: 2, title: 'The Geometry of Groove', hook: 'Euclid wrote a drum machine.' },
  { path: './exhibits/resonance/golden.js', id: 'golden', movement: 2, title: 'The Golden Angle', hook: 'At almost every angle, spokes. At 137.508°, a sunflower.' },
  // III · Horizon
  { path: './exhibits/horizon/diagonal-cantor.js', id: 'cantor', movement: 3, title: 'The Diagonal, Again', hook: 'Build an infinite list meant to contain every infinite binary sequence. One sequence will step out of it — and will keep stepping out no matter what you do.' },
  { path: './exhibits/horizon/loop.js', id: 'loop', movement: 3, title: 'The Strange Loop', hook: 'A sentence builds itself out of its own blueprint and says: you cannot prove me.' },
  { path: './exhibits/horizon/beavers.js', id: 'beavers', movement: 3, title: '47,176,870', hook: 'Five states, two symbols, one blank tape — and the exact number of steps they can take before halting took six decades and a Coq proof to pin down. The number after it may be unknowable.' },
  { path: './exhibits/horizon/rosetta.js', id: 'rosetta', movement: 3, title: 'The Rosetta Stone', hook: 'Count the solutions of one cubic, prime by prime. Multiply out an infinite product that has never heard of it. The two streams of numbers agree at every prime, forever.' },
  { path: './exhibits/horizon/telescope.js', id: 'telescope', movement: 3, title: 'The Telescope', hook: 'Prove a real theorem the way a machine checks it — then confront the proofs no one will ever read.' },
  // IV · Engines
  { path: './exhibits/engines/handshake.js', id: 'handshake', movement: 4, title: 'The Handshake', hook: 'Two strangers agree on a secret while everyone listens. The trick is a walk on a curve that only goes one way.' },
  { path: './exhibits/engines/lossy.js', id: 'lossy', movement: 4, title: 'The Art of Forgetting', hook: 'Keep one number in fifteen and your eye swears nothing is missing. A cosine from 1974 decides which fourteen to forget.' },
  { path: './exhibits/engines/selfheal.js', id: 'selfheal', movement: 4, title: 'The Checking Number', hook: 'Flip any bit and the damage writes down its own address. Scratch away a third of the code and it still says what it said.' },
  { path: './exhibits/engines/whereami.js', id: 'whereami', movement: 4, title: 'One More Circle', hook: 'Euclid needed two circles to find a point. A satellite receiver needs one more, because its own clock is lying, and then it has to ask Einstein.' },
  { path: './exhibits/engines/eigen.js', id: 'eigen', movement: 4, title: '0.85', hook: 'Pour all the importance onto one page and let it flow along the links. Each click keeps at most 0.85 of its memory of where it began, and what survives is the web’s own eigenvector.' },
  { path: './exhibits/engines/learner.js', id: 'learner', movement: 4, title: 'The Descent', hook: 'In 1847 Cauchy wrote a rule for chasing planets: take a small step downhill. Here it untangles two spirals while you watch, and today it trains the machines that write proofs.' },
  { path: './exhibits/engines/shor.js', id: 'shor', movement: 4, title: 'The Period Engine', hook: 'Find the hidden rhythm in the powers of 7 mod 15, hear it as a pitch, and let a continued fraction split the number. The recipe is now forcing the internet to change its locks.' },
  // Coda (follows Movement IV; unnumbered and unframed)
  { path: './exhibits/horizon/coda.js', id: 'coda', movement: 4, coda: true, bare: true, title: 'One Question', hook: 'Answer it again, now that you have seen its walls, its bridges and its engines.' },
];
