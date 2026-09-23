# Math e Magical !

A creative exploration of the origin of mathematics, the intersection with musical and visual arts, and the theoretical future of the boundaries of pure math exploration!

**Live demo:** https://sonoransun.github.io/mathemagical/ ♾️

## What this is

**Mathemagical** is an *essay you can play*: a single scrolling page of prose whose
every major idea is an interactive exhibit, in four movements and a coda. Everything
that moves, computes — every animation is the real mathematical object, never a
metaphor of one. Everything that sounds, counts — the audio is synthesized live from
the same numbers you see.

Each exhibit carries its own apparatus: an era rubric, a dated chronicle, a panel on
where the idea lives now, and its sources. All the chronicles meet at the back of the
book in **The Long Arc**, one timeline from a bone notched some 43,000 years ago to
2026. Stories that cannot be verified are told in marked *legend* panels, and
conjecture is labelled as conjecture, every time.

The decoration follows the same rule as the exhibits. The night sky is the Gaussian
primes, the fleurons are Grandi’s rose curves, the frontispiece carries the Babylonian
tablet YBC 7289’s value of √2 (1 24 51 10) and the 3 : 2 figure of a perfect fifth,
and each movement opens over a figure computed from its own material.

Built with vanilla HTML, CSS, and JavaScript (Canvas 2D + Web Audio API).
No libraries, no build step, no network requests. The only things it stores are three
`localStorage` keys in your own browser: `mathemagical:sound`,
`mathemagical:one-question` (your answer at the door) and
`mathemagical:one-question:coda` (your answer at the end).

## Run it

```sh
cd mathemagical
python3 -m http.server 8471 --directory docs
# open http://localhost:8471/
```

(Any static server works; ES modules just need http rather than `file://`.
Sound starts after your first click — browser autoplay policy — and can be
toggled with the ♪ button on the left rail, or on a phone from the contents.)

## Deploy (GitHub Pages)

The whole site lives in `docs/` and is fully static and relative-pathed, so it
publishes with GitHub's stock setup — no build, no Actions:

1. Push this repository to GitHub.
2. Repository **Settings → Pages → Build and deployment**: Source
   *Deploy from a branch*, branch `main`, folder `/docs`. Save.
3. The essay appears at https://sonoransun.github.io/mathemagical/ a minute later.

(`docs/.nojekyll` is already in place so Pages serves the files verbatim.)

## The map

The essay opens with one question — invented or discovered? — and asks it again,
differently, at the very end. In between it unfolds in four movements:

**I · Origins** — *where mathematics comes from.*
A subitizing test that finds the edge of your own perception, near four, and the
notched bones of Lebombo and Ishango; Egyptian unit fractions as visible fairness,
out to a problem still open today; Babylonian base 60, Plimpton 322 and the itch that
demanded zero; a compass-and-straightedge sandbox that writes your clicks up as
Euclidean proof; and the square's diagonal, the length no fraction names, found by a
subtraction that never halts.

**II · Resonance** — *math ∩ music ∩ visual art.*
Each exhibit couples a sound to an image through one shared piece of mathematics:
a pluckable monochord; the circle of fifths that refuses to close (hear the
comma); Lissajous chords in stereo; Chladni sand assembling into the eigenfunction
you're hearing; a Fourier atelier where you draw a curve and *listen to it*; Euclid's
algorithm as a drum machine; and the golden angle, where periodicity dies.

**III · Horizon** — *the theoretical frontier.*
Cantor's diagonal run live against your own list; Gödel via the MU puzzle, a sentence
built from its own code, and a hydra whose ordinal, below ε₀, falls with every chop;
the busy beavers — including the actual
BB(5) champion's 47,176,870 steps — and the cliff where ZFC goes blind; a live
Langlands "modularity mirror" agreeing prime by prime; and a genuine miniature
proof assistant.

**IV · Engines** — *the unreasonable effectiveness of mathematics.*
The pure ideas of the first three movements, running the modern world in miniature:

- **The Handshake** — two strangers agree on a secret in public by walking a curve
  counted modulo a prime, the kind of curve Movement III counted, while an eavesdropper
  hears every word; the last room runs a real X25519 exchange, the curve browsers use.
- **The Art of Forgetting** — baseline JPEG’s 8×8 cosine transform and quantizer at
  work on a drawn dusk scene, keeping about one number in fifteen, with MP3’s cousin
  transform and compressed sensing after it.
- **The Checking Number** — Hamming’s code in three overlapping circles, where the
  failed checks spell out a flipped bit’s address in binary, and a real QR code you can
  scratch while Reed–Solomon still reads it.
- **One More Circle** — Euclid’s circles cutting circles, grown into satellite ranges:
  one more circle for the receiver’s lying clock, a solver that closes in within a few
  steps, and the 38.6 microseconds a day that relativity adds to every satellite’s clock.
- **0.85** — PageRank on a small web you can edit, where power iteration with damping
  0.85 settles on the web’s own eigenvector, a cousin of Chladni’s sand.
- **The Descent** — Cauchy’s 1847 rule, a small step downhill, trains a network by
  exact backpropagation until it untangles two spirals while you watch.
- **The Period Engine** — the hidden rhythm of 7ˣ mod 15, heard as a pitch and read
  off by a continued fraction, splits the number: the recipe that, on a large enough
  quantum computer, would pick the handshake’s lock.

**Coda · One Question** — the overture's question again, over a drone that slides
between pure partials and the piano's tempered ones, now that you have seen
mathematics' walls, its bridges and its engines.

## Layout

```
docs/                    the published site (GitHub Pages source)
├── index.html           the essay (a shell; the page is built by js/main.js)
├── tests.html           in-browser self-tests
├── .nojekyll            lets GitHub Pages serve the files verbatim
├── css/main.css         the design system, "Illumination": four pigments, one per movement
├── js/main.js           boot, lazy exhibit mounting, pause and resume, the rail
├── js/manifest.js       table of contents (four movements + the coda)
├── js/content.js        overture, movement intros, interludes, motifs, colophon
├── js/core/             shared canvas / audio / math / ui engines
├── js/shell/            the house style, every ornament a computed curve:
│   ├── sky.js           the Gaussian-prime night sky
│   ├── ornament.js      Grandi's rose fleurons, the √2 emblem, illuminated initials
│   ├── backdrops.js     one figure behind each movement intro (Plimpton 322, a
│   │                    Chladni mode, binary fractions, y² = x³ + 7 mod 421)
│   ├── apparatus.js     era rubric, chronicle, "where it lives now", echoes, sources
│   ├── longarc.js       the Long Arc: every chronicle date on one log-scaled timeline
│   ├── nav.js           rail labels, the contents dialog, the progress hairline
│   └── typeset.js       curly quotes in shell-inserted text
└── js/exhibits/         one self-contained module per exhibit
    ├── origins/         I · Origins      tally, loaves, sixty, twotools, diagonal
    ├── resonance/       II · Resonance   monochord, fifths, harmonograph, chladni,
    │                                     fourier, euclid, golden
    ├── horizon/         III · Horizon    diagonal-cantor, loop, beavers, rosetta,
    │                                     telescope (and coda.js)
    └── engines/         IV · Engines     handshake, lossy, selfheal, whereami, eigen,
                                          learner, shor
design/                  the design reports (movement-4-engines.md for Movement IV) and the
                         exhibit contract (CONTRACT.md; v2 at the end)
```

## Verification

[`tests.html`](https://sonoransun.github.io/mathemagical/tests.html), served alongside the essay, runs the in-browser self-test suite:

- core mathematics assertions (exact fractions, Pell pairs, DFT round trips,
  Euclidean rhythms, base-60 expansions, ordinals below ε₀);
- the manifest's integrity: unique ids, movements in order I → IV, exactly one coda
  and it comes last, and every title and hook matching its module;
- every exhibit module's contract: it imports, its prose opens on a plain letter in
  3–7 paragraphs, and its metadata (era, chronicle, today, sources, alt) has the
  shape the shell renders, with every chronicle year inside the Long Arc, agreeing
  with the date it is printed with, and every source link on https;
- `content.js`: an interlude after every exhibit, motifs that name real exhibits
  (at most five echoes under any one exhibit), curly typography, and `#ex-…`
  cross-links that resolve;
- each module's own `_test.selfTest()`, plus the `_test` exports the shell's
  backdrops depend on;
- numbers printed in the prose, recomputed from first principles and compared with
  the module that shows them: the 79 points of y² = x³ + 7 over 𝔽₉₇ and the 444 of the
  Movement IV backdrop, Shor's worked example, Hamming's own example, Moler's
  six-page web at d = 0.85, the GPS clock rates, the JPEG transform's orthonormality,
  and the Fibonacci word and three-gap theorem at the golden angle.

The facts are held to a stricter test than the code. Every date, number, name and
quotation was checked against papers, catalogues and primary sources, which each
exhibit lists under *sources & further reading*. What could not be verified was left
out, or told in a legend panel as a story.
