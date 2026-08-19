// manifest.js — the essay's table of contents, in page order.
// Each entry doubles as placeholder metadata when a module isn't present yet;
// titles and hooks are kept in sync with the modules' own exports.
export const MANIFEST = [
  // I · Origins
  { path: './exhibits/origins/tally.js', id: 'tally', movement: 1, title: 'One, Two, Many', hook: 'Count a flock without knowing how to count.' },
  { path: './exhibits/origins/loaves.js', id: 'loaves', movement: 1, title: 'The Scribe’s Loaves', hook: 'Divide three loaves among four workers so that no one can complain.' },
  { path: './exhibits/origins/sixty.js', id: 'sixty', movement: 1, title: 'Sixty', hook: 'Why your clock still speaks Babylonian — and how to divide by 3 with no remainder, ever.' },
  { path: './exhibits/origins/twotools.js', id: 'twotools', movement: 1, title: 'The Two Tools', hook: 'Prove a 2,300-year-old theorem with your own hands — using the only two tools Euclid allows.' },
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
  { path: './exhibits/horizon/rosetta.js', id: 'rosetta', movement: 3, title: 'The Rosetta Stone', hook: 'Two number streams from unrelated universes agree at every prime, forever — and explaining why took three and a half centuries.' },
  { path: './exhibits/horizon/telescope.js', id: 'telescope', movement: 3, title: 'The Telescope', hook: 'Prove a real theorem the way a machine checks it — then confront the proofs no one will ever read.' },
  { path: './exhibits/horizon/coda.js', id: 'coda', movement: 3, title: 'One Question', hook: 'Answer it again, now that you have been to the horizon.' },
];
