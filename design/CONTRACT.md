# MATHEMAGICAL — Exhibit Contract & Core API (FROZEN)

You are implementing ONE exhibit module for an interactive essay. Read this whole
file, then your exhibit's section in `design/movement-*.md`, then look at the
reference implementation `docs/js/exhibits/resonance/fifths.js` (already working).

## Ground rules

1. **You own exactly one file** in `docs/js/exhibits/<movement>/<name>.js`. Do NOT edit
   `index.html`, `css/main.css`, `js/main.js`, `js/content.js`, or anything in
   `js/core/` (all under `docs/`). If you need custom styling, inject a `<style>` element in `init`,
   scoped under your section id (`#ex-<id> …`).
2. **No dependencies. No network. No build step.** Vanilla ES modules only.
   Relative imports: `../../core/math.js` etc. No external fonts/CDNs/images —
   draw everything with canvas/DOM/SVG.
3. **No top-level DOM/window/Audio access.** Your module is imported under node
   for testing. All DOM work happens inside `init`. Prose is a plain string.
4. **Data fidelity.** Historical claims and record values exactly as your design
   section states them. Myths/legends go in `ui.legendPanel` (never asserted as
   fact); anything conjectural/philosophical goes in `ui.speculationPanel`.
   Where your design section says "transcribe from source at build time", use
   WebFetch/WebSearch to verify; if you cannot verify a number, OMIT the claim —
   never guess.
5. **Pure logic must be testable.** If your exhibit has an algorithmic core
   (interpreter, kernel, counter, generator), export it:
   `export const _test = { fnA, fnB, ... }` — pure functions, no DOM. Verify them
   under node before you finish:
   `node --input-type=module -e "const m = await import('./docs/js/exhibits/.../you.js'); ...assertions...; console.log('ok')"`
   (run from the repo root — plain `node -e` with `await import` works too).

## Module contract

```js
export default {
  id: '<id>',            // EXACTLY the id in main.js's manifest (given in your task)
  movement: 1 | 2 | 3,
  title: '…',            // may refine the manifest's title
  hook: '…',             // one italic line under the title
  prose: `<p>…</p>`,     // the exhibit's essay text (HTML string, ~3–6 paragraphs)
  init(stage, core) {    // stage: the empty .exhibit-stage div; build everything here
    // ...
    return {             // all optional
      pause() {},        // MUST stop rAF loops and silence audio (bus.mute())
      resume() {},       // restart visuals (bus.unmute())
      destroy() {},
    };
  },
};
export const _test = { ... };   // if you have algorithmic logic
```

- `init` is called lazily when the visitor scrolls near your section; `pause` /
  `resume` are called as it leaves/enters the viewport (margin 200px). An exhibit
  that keeps animating or sounding while paused is a bug.
- `core` is `{ canvas, audio, math, ui }` — the modules below. Import them
  directly instead if you prefer; both are fine.

## Prose voice

The site is an essay, not a widget gallery. Your `prose` should be written, not
labeled: complete sentences, first-person-plural where natural, concrete numbers,
no bullet lists, no headings. `<em>` renders gold-italic, `<code>` renders as
mono-azure. 3–6 paragraphs; put deeper asides in legend/speculation panels or
`ui.caption` under the stage. Look at fifths.js for register and length.

## css classes you may rely on

`.controls`, `.ctl`, `.btn` (+ `.primary`/`.small`/`.active`), `.toggle-pill`,
`.sel`, `.stepper`, `.readout`, `.legend-panel`, `.speculation-panel`,
`.quest-banner`, `.mathline`, `.stage-caption` — all produced by `ui.*` helpers.
Canvas elements inside the stage get width:100% + dark background automatically.

## core/canvas.js

- `setupCanvas(parent, {height?, aspect?})` → handle `{canvas, ctx, width, height,
  dpr, onResize(cb), destroy()}`. HiDPI-aware; ctx units are CSS pixels; resizes
  with the container (redraw in your rAF loop or onResize).
- `rafLoop(fn)` → `{start(), stop(), tick(), running}`; `fn(dt, t)` seconds.
  Auto-pauses when the tab is hidden, resumes when visible. `tick()` runs one
  frame manually (tests).
- `PanZoom(handle, {scale?, x?, y?, minScale?, maxScale?, onChange?})` —
  `worldToScreen(x,y)`/`screenToWorld(x,y)` (world y is UP), `zoomAt(sx,sy,f)`,
  `bind()` attaches drag-pan + wheel-zoom and returns an unbind fn.
- `fadeTrail(handle, alpha?, color?)` — translucent overlay for trails.
- `pointerPos(handle, event)` → `[x, y]` in canvas CSS pixels.
- `miniChart(ctx, {x,y,w,h,data,min?,max?,kind:'line'|'bar',color?,labels?})`.
- `glowSprite(color?, size?)` → `{draw(ctx, x, y, scale?)}` — pre-rendered glow
  dot; use for particle fields, never per-particle shadowBlur.
- `palette` — house colors: `{bg, panel, line, ink, inkDim, inkFaint, gold,
  goldBright, goldDim, azure, azureDim, crimson, verdant}`. Use these.

## core/audio.js

- `ensureAudio()` — create/resume the shared AudioContext. Call it FIRST inside
  any user-gesture handler that starts sound. `getContext()` may be null early.
- `createBus(name)` → `{input, context, setGain(v), mute(), unmute(), dispose()}`.
  Create ONE bus per exhibit in `init`; connect everything to `bus.input`
  (already routed through the site limiter + master volume).
- `rampTo(param, value, tau?)`, `glideFreq(param, value, dur?)` — the ONLY ways
  to move an audible AudioParam. Never assign `.value` while audible.
- `playTone(bus, {freq, dur?, type?, level?, attack?, release?, when?, detune?,
  pan?})` — scheduled one-shot with cleanup. Safe to call per note.
- `voice(bus, {type?, freq?, level?, attack?, release?, pan?})` →
  `{osc, setFreq(f), on(level?), off(), dispose()}` — sustained tone.
- `createScheduler(tick, {lookahead?, interval?})` → `{start(), stop(), playing}`.
  `tick(t)` schedules the event at audio-clock time `t` and returns the next
  event's time, or `null` to stop. Derive ALL visual playheads from
  `bus.context.currentTime`, never from frame counts (see fifths.js edgeQueue).
- `drums.kick/hat/rim/wood/thock(bus, when, opts?)` — synthesized percussion.
- `noiseBuffer()` — shared noise AudioBuffer.
- Etiquette: keep per-voice levels ≤ ~0.5 and rely on the limiter; ramp gains
  through zero on hard resets; dispose what you create in `destroy`.

## core/math.js

`TAU`, `PHI`, `gcd`, `gcdBig`, `Frac` (exact BigInt rationals: add/sub/mul/div/
cmp/eq/toString, `Frac.of(n,d)`), `continuedFraction(x, maxTerms?)`,
`convergents(cf)`, `pellPairs(n)`, `dft(points)` / `idft(coeffs)` /
`signedFreq(k,N)` (naive O(N²), plenty fast at N≤512), `digitsInBase(bigint,
base)`, `baseExpansion(num, den, base, maxDigits?)` → `{digits, periodStart,
terminates}`, `isRegular(n)`, `euclidRhythm(k,n)`, `primesUpTo(n)`, ordinals
below ε₀ (`ordIsFinite`, `ordCmp`, `ordOmegaPow`, `ordSumOfOmegaPows`,
`ordToString` — Cantor normal form), `clamp`, `lerp`, `mod`, `cents(ratio)`,
`expScale(t, fLo, fHi)`, `formatBig(x)`.

## core/ui.js

`controlRow(parent)`, `slider(parent, {label,min,max,step,value,format?,onInput})`,
`button(parent, label, onClick, {primary?,small?})`, `toggle(parent,
{label,value,onChange})`, `stepper(parent, {label,min,max,value,step?,format?,
onChange})`, `select(parent, {label,options,value,onChange})`,
`readout(parent, initial?)` → `{set(t), setHTML(h)}`, `legendPanel(parent,
bodyHTML, title?)`, `speculationPanel(parent, bodyHTML, title?)`,
`questBanner(parent, text)` → `{set(html), done(html?)}`, `mathline(parent,
html)`, `caption(parent, html)`.

## Performance budget

The page hosts ~18 exhibits. Yours must be free when off-screen (pause() stops
everything), cheap when idle on-screen (< ~2ms/frame), and may spend real CPU
only during explicit interactions. Pre-render sprites; avoid shadowBlur in
loops; cap particle counts; throttle expensive recomputes (DFT on pointer-up,
not pointer-move).

## Verify before you finish

1. `node --check` passes on your file (syntax).
2. Your `_test` assertions pass under node.
3. Serve (`python3 -m http.server 8471 --directory docs`) and load
   `http://localhost:8471/`, or at minimum confirm your module imports:
   `node -e "import('./docs/js/exhibits/<m>/<name>.js').then(m=>console.log(m.default.id))"`.
   (Browser check may be impossible in parallel — the integrator runs a full
   drive-through afterwards. Code defensively.)

---

# CONTRACT v2 — the expansion (September 2026)

Everything above still holds. This section adds to it; where the two disagree, v2 wins.

## What changed

- **Four movements and a coda.** I · Origins, II · Resonance, III · Horizon, and the new
  **IV · Engines** (`docs/js/exhibits/engines/`): the unreasonable effectiveness of
  mathematics, where the pure ideas of I–III now run the modern world. The Coda follows
  Movement IV. Its manifest entry carries `coda: true, bare: true` and `movement: 4`, and
  the shell numbers it "Coda" instead of "IV · 8".
- **Per-exhibit apparatus.** Exhibit modules export optional *data* (below). The shell
  renders it in one consistent house style: an era rubric in the header, and after the stage
  a chronicle strip, a "where it lives now" panel, echo chips, and collapsible sources.
  **Exhibits never render these themselves.**
- **The shell layer** (`docs/js/shell/*.js` + `css/main.css`) adds the sky (Gaussian-prime
  starfield), rose-curve fleurons, the overture emblem, one computed backdrop per movement,
  plate framing for stages, illuminated initials, the Long Arc timeline, rail labels, a
  contents dialog, a progress hairline, scroll reveals, and accessibility fixes.
- **Palette additions** (backward-compatible): `palette.verdigris = '#62b3a4'` (Movement IV
  and the "today" panel), `palette.crimsonBright = '#d97a68'` (crimson as small text),
  `palette.inkGhost = '#4a4840'` (decorative only). CSS tokens `--mv-1 … --mv-4` give each
  movement its pigment: gold leaf, azurite, vermilion, verdigris.

## Module metadata (all optional; plain data, no DOM, importable under node)

```js
export default {
  id, movement, title, hook, prose, init,          // as before
  era: 'c. 1900–1600 BCE · Larsa and the Old Babylonian schools',
  chronicle: [
    { year: -1800, date: 'c. 1800 BCE', text: 'One sentence; may use <em>…</em>.' },
    // 4–8 entries, VERIFIED, spanning origin → present. `year` is a number:
    // negative = BCE (1 BCE = 0 is NOT used; write -1 for 1 BCE), BP → -(BP − 1950).
    // Never later than 2026. `date` is the display string (can say "c.", "1850s", "June 2024").
  ],
  today: `<p>…</p>`,     // 1–3 short <p>: where this idea lives now (applications, instruments,
                         // the live research frontier as of 2026). Verified, concrete, no hype.
  sources: [
    { text: 'Eleanor Robson, <em>Mathematics in Ancient Iraq</em> (2008)', url: 'https://…' },
    // 4–10 real, reputable items; url optional but https only.
  ],
  alt: 'One sentence describing what the stage shows, for screen readers.',
};
```

- `era` is short (≲ 70 characters). It is set as an italic rubric beside the exhibit number.
- The chronicle entries also feed the site-wide **Long Arc** timeline, so every `text` must
  make sense out of context, name its actors and avoid "this exhibit".
- `today` is not a second copy of the prose. It is the bridge from the idea to the present, and
  for Movements I–III it may point forward to a Movement IV exhibit with
  `<a href="#ex-lossy">…</a>`.
- Keep every existing `_test` export. The shell's backdrops import
  `sixty._test.PLIMPTON_ROWS` and `chladni._test.modeW / modeGrad`, and tests.html uses
  `rosetta._test.pointCountAp / etaCoefficients`. You may add to `_test`, but never rename
  or remove anything from it.

## Prose, v2

- 3–7 paragraphs. **The first character of `prose` must be a plain letter.** The shell sets
  an illuminated initial on it and small caps on the first line, so do not open with `<code>`,
  a digit, a quotation mark, or `<em>`.
- Use curly typography in new text: ’ “ ” — – × −.
- Aim for peak aesthetic, which means exactness first. Use concrete images, real names, places,
  artifacts and dates, and short verified quotations with attribution. Vary the rhythm. No hype
  words, no exclamation marks, no bullet lists, no headings.
- Every claim must be verified: myths go in `ui.legendPanel`, conjecture in
  `ui.speculationPanel`. If you cannot verify something, leave it out.
- Cross-links to other exhibits (`<a href="#ex-<id>">`) are welcome but sparing, at most
  two or three per exhibit.

## Stage, v2

- **Movement colour.** An exhibit may read its movement pigment from CSS: inside the section,
  `getComputedStyle(sec).getPropertyValue('--mv')`. Movement IV canvases use
  `palette.verdigris` as their accent, alongside gold, azure and crimson.
- **Mobile.** At 360 px viewport width the stage must not cause horizontal page scroll.
  Canvases fit their width, controls wrap, and readouts wrap: the shell sets
  `.readout { white-space: pre-wrap }`. Check with the harness (`--width 390 --mobile`).
- **Motion.** Purely decorative motion respects `prefers-reduced-motion: reduce`. A
  computation the visitor starts is content and may animate.
- **Accessibility.** The `ui.*` helpers are fixed centrally (toggle becomes a real switch
  button, sliders get names and value text). Canvas-only interactions should get a keyboard
  or button equivalent where cheap. Provide `alt`.
- The performance budget is unchanged: free when paused, under ~2 ms per idle frame,
  glow sprites rather than per-particle `shadowBlur`.

## content.js exports (shell contract between the narrative and visual shell owners)

```js
export const site = { title, subtitle, howToRead };            // howToRead: HTML, shown in the overture
export const movements = { 1: { numeral, title, epigraph, epigraphCite?, lede }, …, 4: {…} };
export const interludes = { <exhibitId>: html };               // rendered after that exhibit
export const motifs = [ { key, glyph, label, pigment: 'gold'|'azure'|'crimson'|'verdigris', ids: [...], note } ];
export const longArc = { title, lede };                        // back-matter timeline heading
export const colophon = html;                                  // "a note on the making", back matter
export const footer = html;
```

Manifest entries are `{ path, id, movement, title, hook, coda?, bare? }`. Titles and hooks
mirror the module exports, and the integrator syncs them at the end.

## Verification harness (use it; it runs its own headless Chrome, so it is parallel-safe)

```sh
H=/private/tmp/claude-501/-Users-user-cdev-mathemagical/1e348a62-f467-4e33-b6ee-29ab8a6c6d91/scratchpad/harness
node $H/mm.mjs solo <id> [--path exhibits/engines/<id>.js] --shot /…/out.png [--width 390 --mobile]
     [--eval "js run in the page; window.__solo.{instance,stage,_test,core,module} available"] [--wait ms]
node $H/mm.mjs page [--ids a,b] [--shots dir]   # full site, scrolls to each exhibit
node $H/mm.mjs tests                            # docs/tests.html
```

`solo` mounts one exhibit without the shell. It prints JSON with the console errors, the
metadata-shape issues, the lifecycle check (pause/resume), a canvas ink probe and the
horizontal-overflow state. Read the PNG it writes: look at your own work.

## File ownership during the build

| Owner | Files |
|---|---|
| Visual shell | `index.html`, `css/main.css`, `js/main.js`, `js/shell/*` (new), `js/core/ui.js` (a11y only, API unchanged), `js/core/canvas.js` (palette additions and the miniChart label colour only) |
| Narrative shell | `js/content.js`, `js/manifest.js`, `tests.html`, `README.md` (keep the owner's "Live demo" line) |
| One editor per exhibit | exactly one `js/exhibits/<movement>/<name>.js` |
| One builder per new exhibit | exactly one `js/exhibits/engines/<id>.js` |

Nobody touches `js/core/audio.js` or `js/core/math.js`. Put helpers you need in your own file.
