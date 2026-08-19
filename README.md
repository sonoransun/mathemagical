# Math e Magical !

A creative exploration of the origin of mathematics, the intersection with musical and visual arts, and the theoretical future of the boundaries of pure math exploration!

**Live demo:** https://sonoransun.github.io/mathemagical/ ♾️

## What this is

**Mathemagical** is an *essay you can play*: a single scrolling page of prose whose
every major idea is an interactive exhibit. Everything that moves, computes — every
animation is the real mathematical object, never a metaphor of one. Everything that
sounds, counts — the audio is synthesized live from the same numbers you see.

Built with vanilla HTML, CSS, and JavaScript (Canvas 2D + Web Audio API).
No libraries, no build step, no network requests.

## Run it

```sh
cd mathemagical
python3 -m http.server 8471 --directory docs
# open http://localhost:8471/
```

(Any static server works; ES modules just need http rather than `file://`.
Sound starts after your first click — browser autoplay policy — and can be
toggled with the ♪ button on the left rail.)

`tests.html` on the same server runs the in-browser self-test suite: core
mathematics assertions plus contract checks on every exhibit module.

## Deploy (GitHub Pages)

The whole site lives in `docs/` and is fully static and relative-pathed, so it
publishes with GitHub's stock setup — no build, no Actions:

1. Push this repository to GitHub.
2. Repository **Settings → Pages → Build and deployment**: Source
   *Deploy from a branch*, branch `main`, folder `/docs`. Save.
3. The essay appears at `https://<user>.github.io/<repo>/` a minute later.

(`docs/.nojekyll` is already in place so Pages serves the files verbatim.)

## The map

The essay opens with one question — answered again, differently, at the very end —
and unfolds in three movements:

**I · Origins** — *where mathematics comes from.*
A subitizing test your own perception fails at 5; Egyptian unit fractions as
visible fairness; Babylonian base-60 and the itch that demanded zero; a
compass-and-straightedge sandbox that writes your clicks up as Euclidean proof;
and the crisis of √2 — the gcd computation that never halts.

**II · Resonance** — *math ∩ music ∩ visual art.*
Each exhibit couples a sound to an image through one shared piece of mathematics:
a pluckable monochord; the circle of fifths that refuses to close (hear the
comma); Lissajous chords in stereo; Chladni sand assembling into the eigenfunction
you're hearing; a Fourier atelier where you draw a curve and *listen to it*; Euclid's
algorithm as a drum machine; and the golden angle, where periodicity dies.

**III · Horizon** — *the theoretical frontier.*
Cantor's diagonal run live against your own list; Gödel via a playable hydra whose
ordinal meter counts down through ε₀; the busy beavers — including the actual
BB(5) champion's 47,176,870 steps — and the 745-state wall where ZFC goes blind;
a live Langlands "modularity mirror" agreeing prime by prime; and a genuine
miniature proof assistant. Speculation, where it appears, is labeled on the page.

## Layout

```
docs/                 the published site (GitHub Pages source)
├── index.html        the essay (shell; content is built by js/main.js)
├── tests.html        in-browser self-tests
├── css/main.css      design system ("illuminated manuscript meets cosmos")
├── js/main.js        boot, navigation, lazy exhibit mounting
├── js/manifest.js    table of contents
├── js/content.js     movement intros & interludes
├── js/core/          shared canvas / audio / math / ui engines
└── js/exhibits/      one self-contained module per exhibit
design/               the design reports & the exhibit contract
```
