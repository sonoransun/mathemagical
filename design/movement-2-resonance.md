# Movement II — Resonance: Design Report

## Narrative arc

Movement II argues one thesis seven ways: **a piece of music and a piece of geometry can be the same mathematical object seen through different senses.** The arc runs from the particular to the general to the transcendent — we start with a single string and its ladder of overtones, watch pure ratios *fail* to close the circle (the comma), then literally *see* consonance (Lissajous), watch a single tone take physical shape (Chladni), and then generalize: every shape and every timbre is a sum of circles (Fourier), rhythm falls out of the same division arithmetic as scales (Euclid), and the movement ends where rationality itself gives out — at the golden angle, where periodicity dies but order survives, opening the door to Movement III.

## The single strongest "wow" exhibit

**II.5 The Fourier Atelier.** The phase-scramble button is the movement's thesis compressed into one interaction.

## Leitmotifs (cross-links to write into the prose)

- **Rational = periodic, in eye and ear alike.** Spokes in phyllotaxis, closed Lissajous figures, closing circles of fifths, looping melodies — all the same fact about p/q. Irrationality shows up as precession, spirals, aperiodicity.
- **The three-gap theorem (Steinhaus)** secretly appears twice: stacked fifths (II.2) and phyllotaxis pitch sequences (II.7) both partition the circle into at most three gap sizes. Name it once, let the reader spot the reprise.
- **Harmonic vs. inharmonic spectra:** strings (II.1) have integer overtones; plates (II.4) do not — the geometry of the resonator *is* the timbre.

## Shared audio infrastructure

All provided by `js/core/audio.js` — see docs/CONTRACT.md. Exhibits must: resume audio inside user-gesture handlers (`audio.ensureAudio()`); never write `param.value` while audible (use `rampTo`/`glideFreq`); schedule sequences with `createScheduler` and derive visual playheads from the audio clock; pool voices and clean up via `onended` (playTone/voice do this); mute + stop rAF in `pause()`.

---

## II.1 · The Monochord (`js/exhibits/resonance/monochord.js`, ~400 lines)

**Hook:** Pluck a single string; discover that every interval, and the war between pure tuning and the piano, is already inside it.

**Mathematical content.** String modes yₙ(x,t) = aₙ sin(nπx/L) cos(2πnf₀t); harmonic series fₙ = n·f₀. Pluck at fraction β of the length gives aₙ ∝ sin(nπβ)/n² — the pluck point is a Fourier filter. Intervals as ratios: 2/1, 3/2, 4/3, 5/4, 5/3, 15/8; just major scale 1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2. Equal temperament 2^(k/12); cents = 1200·log₂(r). The just major third 5/4 = 386.3¢ vs ET 400¢ — a 13.7¢ gap heard as beating; syntonic comma 81/80 ≈ 21.5¢.

**Interaction.** A long horizontal string. Drag to pluck at any point — hear the timbre change and see the partial bars change (pluck at 1/2 kills every even harmonic; the sin(nπβ) math displayed live). Touch the string at 1/2, 2/3, 3/4, 4/5 to sound natural harmonics (flageolets) with the ratio and standing-wave shape drawn glowing on the string. A two-row mini-keyboard (JI row / ET row) sustains dyads; play a major third both ways and *hear* the ET third churn while the 5/4 third sits still, with a live beat-rate readout.

**Implementation sketch.** Audio: additive synth — up to 16 sine oscillators each with its own gain set from aₙ, exponential decay via setTargetAtTime; sustained keyboard notes use the same bank without decay. Visual: canvas draws the string as the sum of the first ~12 modes with animated phases; bar chart of |aₙ|.

**Exploratory stretch.** "Where you touch the string is a Fourier transform": an inset derives aₙ from the triangular initial condition; drag the pluck point and watch the sin(nπβ)/n² envelope slide across the spectrum — first proof in the movement that a *shape* (the plucked triangle) and a *sound* (the timbre) are one set of coefficients. Foreshadows II.5.

**WebAudio pitfalls.** Sixteen summed sines clip — normalize by Σaₙ and lean on the master compressor. Start every oscillator with gain 0 and ramp up over ~8 ms (a sine started mid-phase thumps). Kill and null oscillator banks on re-pluck (`onended`) or the tab accumulates hundreds of nodes.

---

## II.2 · The Spiral of Fifths (`js/exhibits/resonance/fifths.js`) — ALREADY IMPLEMENTED (proof of life). Do not rebuild.

---

## II.3 · The Harmonograph (`js/exhibits/resonance/harmonograph.js`, ~280 lines)

**Hook:** Two tones drive x and y; consonance draws a closed figure, and the beating you hear is *literally* the rotation you see.

**Mathematical content.** Lissajous curves x = sin(2πf₁t + φ), y = sin(2πf₂t). Closed iff f₁/f₂ = p/q rational; lobe counts read off p:q. The theorem of the exhibit: if f₁/f₂ is *near* p/q, the figure precesses at exactly |q·f₁ − p·f₂| Hz — the generalized beat frequency. For unison that is the ordinary beat rate: detune by 0.3 Hz and the ellipse tumbles once every 3.33 s while you hear one "wah" every 3.33 s. Harmonograph mode adds damping: x = Σᵢ Aᵢe^(−dᵢt) sin(2πfᵢt + φᵢ) — the Victorian drawing machine.

**Interaction.** Two frequency knobs; the tones play as a stereo dyad — left channel is the x oscillator, right is y, so *the stereo field is the coordinate system*. Snap buttons for 1:1, 2:1, 3:2, 4:3, 5:4, 5:3 (labeled with interval names). Fine-detune slider: the figure tumbles and a readout shows |qf₁ − pf₂| next to what your ears report. Phase knob rotates unison ellipses line→circle. Harmonograph toggle adds damping and persistent ink trails.

**Implementation sketch.** Audio: two oscillators → StereoPanner(−1/+1) → bus (use `voice` with pan). Visual: do *not* tap audio output — recompute the same parametric equations from shared params (deterministic coupling beats an analyser); persistence via `fadeTrail` or an accumulating offscreen path for ink.

**Exploratory stretch.** **Lissajous knots**: a third frequency for z — a major triad 4:5:6 becomes a specific knot in 3-space, hand-projected onto canvas 2D with rotation and depth-dimming. Chords are knots; inversions are projections. Prose aside on oscilloscope music.

**WebAudio pitfalls.** Detune slider must ramp (`glideFreq`) or every mousemove clicks. Reuse the two oscillators forever — never rebuild on parameter change. Two hard-panned sines sum loud; per-voice gain ≤ 0.15.

---

## II.4 · Chladni (`js/exhibits/resonance/chladni.js`, ~420 lines)

**Hook:** Sound a plate at the right frequency and sand assembles into the geometry of that exact pitch — the same eigenfunction you're hearing.

**Mathematical content.** Plate eigenmodes via the classic analytic approximation for a square plate: w(x,y) = cos(nπx)cos(mπy) ± cos(mπx)cos(nπy) (superposed degenerate modes), nodal lines = zero set, modal frequency f ∝ m² + n² (stiff-plate scaling; prose is honest that exact free-edge modes need the biharmonic equation ∇⁴w = k⁴w solved numerically). Sand gathers at nodes because antinodes shake it off. Payoff theorem: plate partials are **inharmonic** — II.1's integer overtone ladder is an arithmetic miracle of one dimension, and this is *why* strings sing and plates clang.

**Interaction.** A frequency slider sweeps a sine continuously; near each modal frequency, resonance-response weights blend nearby patterns, and a few thousand sand particles migrate in real time toward the nodal lines — the figure *assembles while the tone swells*. Click the plate to strike: many modes at once, a metallic clang (additive inharmonic spectrum, higher modes decaying faster), interference shimmer settling into the dominant mode. An (m,n) index panel jumps straight to a mode and shows its formula.

**Implementation sketch.** Particle system: per frame each particle evaluates |w| analytically (cheap cos products), steps down the gradient with jitter proportional to local amplitude — the standard Chladni sim. Audio: sweep = one sine with ramped frequency; strike = pooled bank of ~10 oscillators at modal frequencies with staggered exponential decays. Cap particles (~3–4k) and skip work when paused.

**Exploratory stretch.** **"Can one hear the shape of a drum?"** (Kac 1966). Show Gordon–Webb–Wolpert's 1992 isospectral propeller domains side by side; let the user strike both: two visibly different shapes, *identical* spectra. The answer is no — right after the exhibit spent five minutes convincing you it should be yes. DATA FIDELITY: draw the actual GWW domain shapes (they are simple polyomino-like unions of triangles, well documented); for eigenvalues either use published values verified from a source, or state honestly that the spectra are equal by theorem and synthesize the SAME partial set for both strikes. Never invent numeric eigenvalues.

**WebAudio pitfalls.** Strikes spawn oscillator bursts — pool them, cap concurrent voices (~24), release via `onended`. Ramp the sweep frequency. Start strike partials with 5 ms fade-in; let the shared compressor catch clang stacking.

---

## II.5 · The Fourier Atelier (`js/exhibits/resonance/fourier.js`, ~520 lines) — THE MOVEMENT'S WOW

**Hook:** Draw any shape; circles rebuild it and the same numbers become its voice.

**Mathematical content.** Drawn closed curve as complex samples zₙ = xₙ + iyₙ, N ≈ 256–512 points resampled to uniform arc length. DFT (core `dft`): c_k = (1/N)Σₙ zₙe^(−2πikn/N); reconstruction is an epicycle chain — circle k has radius |cₖ|, rotates at signed frequency k (use core `signedFreq`), negative k backward. Truncation error = tail energy Σ|cₖ|² (Parseval). Companion 1D mode: square = Σ sin((2j+1)ωt)/(2j+1), saw = Σ sin(jωt)/j, triangle = Σ(−1)ʲsin((2j+1)ωt)/(2j+1)², with Gibbs overshoot ≈ 8.95% of the jump that never shrinks. The jewel: **smoothness = spectral decay = mellowness** — a jump gives |cₖ| ~ 1/k (buzzy), a kink 1/k² (softer), a smooth blob decays superpolynomially (nearly a pure tone). You can hear the differentiability class of your drawing.

**Interaction.** Freehand-draw a closed curve. The epicycle chain (sorted by |cₖ|) redraws it live; a K-slider (1…128 terms) morphs blob → your drawing. Press "listen": magnitudes |cₖ| become partial amplitudes of an additive tone — spiky star sounds brassy, smooth egg sounds flutelike. One shared spectrum display *is* both things: hover a bar and its circle highlights in the chain while its partial solos in the audio. Presets: square (hear/see Gibbs ringing at corners), star, script letter. A 1D waveform pane with harmonic sliders sits alongside, same spectrum widget, so the 2D and 1D stories visibly share machinery.

**Implementation sketch.** Naive O(N²) DFT from core — at N = 512 it runs in microseconds; do NOT write an FFT. Resample-to-uniform-arc-length first (crucial for clean coefficients, ~30 lines). Epicycle render: typed-array precomputed radii/speeds, trail as ring buffer. Audio: build a `PeriodicWave` from folded ±k coefficients (real/imag arrays preserve phase) — one oscillator, efficient and click-free; keep default normalization.

**Exploratory stretch.** **The phase-scramble button.** Randomize arg(cₖ), keep |cₖ|: the drawing collapses into scribble; the tone is almost unchanged (Ohm–Helmholtz phase deafness, with an honest caveat that the ear isn't perfectly phase-blind). The eye and ear factor the same complex numbers differently — magnitude to the ear, phase to the eye.

**WebAudio pitfalls.** Swapping `PeriodicWave` mid-note clicks — crossfade two oscillators or dip the gain 15 ms around the swap. Pointer events with devicePixelRatio scaling for drawing; throttle DFT recompute to pointer-up plus debounce, not every move.

---

## II.6 · The Geometry of Groove (`js/exhibits/resonance/euclid.js`, ~350 lines)

**Hook:** The 2300-year-old GCD algorithm, asked to spread k hits over n beats as evenly as possible, generates the traditional rhythms of the world.

**Mathematical content.** Euclidean rhythm E(k,n): distribute k onsets among n pulses maximally evenly. Bjorklund's algorithm is structurally Euclid's GCD on remainder sequences (Toussaint 2005); the core `euclidRhythm` one-liner places onset i at pulse ⌊i·n/k⌋ (a rotation of Bjorklund's output — use it in code, cite both in prose, and rotate presets to their traditional forms). Canonical presets with provenance: E(3,8) tresillo [x··x··x·], E(5,8) cinquillo, E(2,5) Persian khafif-e-ramal, E(4,9) Turkish aksak, E(7,12) West African bell, E(5,16) bossa-nova (rotated). Necklace equivalence under rotation; maximal evenness = exactly two gap sizes differing by 1.

**Interaction.** Up to four concentric necklace rings, each with (k, n, rotation) steppers and a voice (core drums: kick, hat, rim, wood). A single playhead sweeps; hits flash on the ring at the instant they sound. Rotation dials spin necklaces — same set, different groove. Rings with different n run as true polymeter with coincidences visible as radial alignments. Preset menu of world rhythms, each naming its tradition.

**Implementation sketch.** Rhythm generation via core; percussion via core drums. Events placed by `createScheduler`; playhead angle = (currentTime − barStart)/barLength. Canvas: concentric tick rings.

**Exploratory stretch.** **The diatonic bombshell:** a "map to pitch" button reinterprets the necklace as the chromatic circle — E(7,12) *is* the major scale, E(5,12) the pentatonic; maximally even rhythms and the Western scale system are one construction. Snaps II.2 and II.6 together (maximal evenness ↔ MOS scales ↔ three-gap) and reveals rhythm and harmony as the same arithmetic at different timescales.

**WebAudio pitfalls.** Never trigger drums from setInterval directly — schedule ahead via `createScheduler`. BufferSources are one-shot: create per hit but reuse the underlying noise buffer (core does). Derive the playhead from the audio clock so a dropped frame never desyncs flash from hit.

---

## II.7 · The Golden Angle (`js/exhibits/resonance/golden.js`, ~300 lines; movement finale)

**Hook:** Turn one dial through 360 degrees; at almost every angle you get spokes and a looping melody — at 137.508°, a sunflower and a song that never repeats.

**Mathematical content.** Vogel's phyllotaxis model (1979): seed i at angle iθ, radius c√i. Golden angle θ★ = 2π(2 − φ) ≈ 137.50776°, φ = (1+√5)/2. Rational θ = 2π·p/q → q spokes; near-rational → spiral arms whose counts are continued-fraction convergent denominators — at θ★ the visible parastichy counts are Fibonacci (8, 13, 21, 34). φ = [1; 1, 1, 1, …] converges slower than any other continued fraction (Hurwitz: |φ − p/q| > 1/(√5q²) is the worst case) — "most irrational", hence the best packing angle. Sonification by the same map: note i has pitch 220·2^{frac(iθ/2π)} Hz (or scale-quantized); rational θ → melody loops with period q; φ → never repeats yet, by the three-gap theorem, never uses more than three distinct melodic steps at any depth.

**Interaction.** One large precise dial (coarse ring + fine ring near 137.5°). Seeds bloom outward continuously while the arpeggio plays the same sequence — at 2π/3 you see 3 spokes and hear a 3-note loop; sweep toward θ★ and spokes shear into Fibonacci spirals as the loop dissolves into endless non-repetition. Marked detents for 1/2, 1/3, 2/5, π (sounds *almost* periodic — 355/113 is why), √2, e, φ. Overlay toggles tint the 13-arm and 21-arm parastichy families.

**Implementation sketch.** Use core `glowSprite` for seeds (never per-dot shadowBlur); seeds appended incrementally in sync with scheduled notes; parastichy overlays as index-stride colorings. Audio: `createScheduler` arpeggio on one reused oscillator + envelope (or pooled `playTone`); accumulate angle by repeated addition mod 2π rather than computing i·θ for large i (float precision).

**Exploratory stretch.** **Aperiodic order** — the hinge into Movement III. Derive the Fibonacci word from φ (bit i = ⌊(i+1)φ⌋ − ⌊iφ⌋ − 1), play it as a two-duration rhythm: aperiodic yet perfectly lawful. Prose connects to Penrose tilings and quasicrystals — order without repetition — and hands the reader to Horizon asking: what else lives beyond periodicity?

**WebAudio pitfalls.** A finale exhibit runs for minutes: reuse one oscillator with per-note envelopes rather than spawning nodes per note, or the graph grows unboundedly (pooled `playTone` is acceptable since it cleans up via onended, but keep note durations short). Dial scrubbing re-seeds the sequence — debounce audio restarts and ramp bus gain through zero on reset to avoid a click storm. Stop everything in `pause()`.
