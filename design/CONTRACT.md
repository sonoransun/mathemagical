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
