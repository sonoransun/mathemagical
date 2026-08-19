# Movement I — Origins: Design Report

## Narrative arc

Mathematics is born three times in this movement: as a technology of **memory** (a herder's pebbles and tally sticks), as a technology of **administration** (the scribe's fractions and place values), and finally as a **game of pure reason** (two tools, five postulates) — each birth trading concreteness for power. The third birth immediately produces the first crisis: playing their own game honestly, the Greeks find a length inside a square that no number can name. Origins ends at the moment mathematics becomes self-aware — the invention of proof, including the first proofs that some things can never be done.

Deliberate through-line: **Plimpton 322's table of whole-number right triangles (Exhibit 3) is missing its simplest possible row — the half-square — and Exhibit 5 is the explanation of why that row can never exist.**

## The lead "wow" exhibit

**Lead with Exhibit 1, "One, Two, Many" — specifically its opening beat, the subitizing flash test.** Within ten seconds and with zero instruction, the visitor personally experiences the cognitive cliff (perfect numerosity perception up to 4 items, collapse at 5+) that made tallying necessary. It is a replicable psychological shock — *you*, a numerate modern adult, just failed to count — and it justifies the whole movement: mathematics exists because brains alone are not enough. The movement's emotional climax is Exhibit 5 (The Diagonal), but the opener must hook in seconds, and this one hooks with the visitor's own mind.

---

## Exhibit 1 — "One, Two, Many" (`js/exhibits/origins/tally.js`, ~350 lines)

**Hook:** Count a flock without knowing how to count.

**Content:** Subitizing — humans perceive numerosities 1–4 instantly and exactly; beyond that we count serially (~250–350 ms/item) or estimate; this is the cognitive floor under arithmetic. One-to-one correspondence precedes number: a pebble-per-sheep pouch answers "did every animal come home?" with no numerals (cardinality-as-bijection — quietly the seed of set theory, a whisper toward Movement III). Artifacts: Lebombo bone (~43,000 BP, 29 notches — note the bone is broken, so 29 may not be original) and Ishango bone (~20,000 BP, three columns of grouped notches; one column doubles 3→6, 4→8); Mesopotamian clay tokens (Schmandt-Besserat's token-to-writing theory — present as leading hypothesis, not settled). **Myths to avoid:** Ishango as "prime table" or definitive lunar calendar (over-readings); any "primitive people couldn't count" framing.

**Interaction:** Three beats. (1) *The flash:* dot clusters flash ~250 ms, visitor answers how many; the exhibit plots their accuracy/response time vs n — a personal cliff appears at 4→5. Caption: the notches begin where your perception ends. (2) *The pouch:* sheep leave the pen at dawn, visitor taps one pebble per sheep; at dusk they remove one per returning sheep; leftover pebbles = missing sheep — "are any missing?" solved without counting. (3) *The carving:* visitor drags pebbles into groups of five; pouch morphs into tally strokes, then into the rendered Ishango bone with its real notch groups — grouping revealed as the first notation, answering beat 1's limit.

**Implementation:** Canvas 2D; bezier-blob sheep with walk cycle; phase state machine; inline mini-chart; WebAudio wood-block tick per pebble (first sound of the movement).

**Stretch:** *Numerals are compression.* Live strip comparing marks needed to record n: tally (n), grouped tally (~n/5), positional numeral (~log n). Slide n to 7,000,000; the tally leaves the screen, the numeral gains three characters. Signpost straight at Exhibit 3.

---

## Exhibit 2 — "The Scribe's Loaves" (`js/exhibits/origins/loaves.js`, ~400 lines)

**Hook:** Divide 3 loaves among 4 workers so that no one can complain.

**Content:** Rhind Mathematical Papyrus (~1550 BCE, scribe Ahmes copying a ~1850 BCE original) + Moscow papyrus. All fractions as sums of **distinct unit fractions** (special glyphs for 2/3, sometimes 3/4); bread-division problems; the 2/n table (odd n, 5–101). Why unit fractions: visible fairness — 3÷4 as ½+¼ gives every worker the *same set of pieces*, equity checkable at a glance. The scribes out-optimize the greedy algorithm: for 2/9, greedy gives 1/5+1/45 but Ahmes records 1/6+1/18. **Myths to avoid:** the Eye of Horus grain-fraction story (doubted by modern Egyptology — present explicitly as legend); "Egyptian fractions were a clumsy dead end."

**Interaction:** *Loaf-cutting sandbox.* Round loaves; a row of workers. Pick a knife (halve/third/quarter/fifth…), click to cut a loaf into equal sectors, drag pieces to workers. A fairness meter checks every worker holds an identical multiset and all bread is used. Quest ladder: 3÷4 (½+¼), Ahmes' 2÷5 (⅓+1/15), then 2÷7. Afterwards an "apprentice scribe" (animated greedy Fibonacci–Sylvester algorithm) appears and the visitor tries to *beat* it on term count or largest denominator — 2/9 is the designed upset. Solutions accumulate on a shelf as the visitor's own hieratic 2/n table.

**Implementation:** Sector geometry as {denominator, angle} arcs; drag-drop hit-testing; exact rational arithmetic (use core `Frac`, no floats in logic); greedy is ~5 lines.

**Stretch:** *The oldest game still has an open problem.* Erdős–Straus conjecture (1948): 4/n = 1/x+1/y+1/z for all n≥2 — still open. Mini-explorer: pick n, bounded search shows solutions and their strange size-jumps. First signpost toward Movement III.

---

## Exhibit 3 — "Sixty" (`js/exhibits/origins/sixty.js`, ~450 lines)

**Hook:** Why your clock still speaks Babylonian — and how to divide by 3 with no remainder, ever.

**Content:** Sexagesimal place value (Ur III/Old Babylonian ~2100–1800 BCE), history's first place-value system: two glyphs (vertical wedge = 1, corner wedge = 10) composing digits 1–59, position carrying powers of 60. No zero and no magnitude marker — the same digits meant 1, 60, or 3600, context deciding; the Seleucid placeholder (two slanted wedges, ~300 BCE) appears **only medially** — a number still couldn't end in zero. Zero as a *number* is Brahmagupta, 628 CE — planted as a prose signpost, not an exhibit detour. Division via reciprocal tables: 1/b terminates in base 60 iff b is **regular** (2,3,5-smooth). Plimpton 322 (~1800 BCE, Larsa): 15 rows of Pythagorean-triple data a millennium before Pythagoras; give Neugebauer's generating pairs, Robson's reciprocal-pair teacher's-list reading (mainstream), and the 2017 "Babylonian trig" claim as a cautionary tale of anachronism. **Myths to avoid:** "they chose 60 for its divisors" (origin unknown; divisor-richness explains its survival in minutes/seconds/degrees, not its birth); "Babylonians knew trigonometry."

**Interaction:** Three stations. (1) *Stamping table:* click to stamp wedges into place-value columns (auto-arranging into canonical digit clusters); while magnitude is unpinned the readout flickers between ALL readings (1 · 60 · 3600 …) — the visitor feels the ambiguity as an itch; stamping the placeholder collapses the flicker. The need for zero is experienced, not explained. (2) *Reciprocal race:* dial a divisor 2–30; its reciprocal unfolds digit-by-digit in base 10 and base 60 side by side (1/3: infinite stutter vs a clean ";20"); the visitor's trials accumulate into a chart — they *discover* the regular numbers. (3) *The tablet:* Plimpton 322 in wedges; hover a row to see its actual right triangle; caption ends: notice which simple triangle appears in no row of any tablet ever found (→ Exhibit 5).

**Implementation:** Two wedge-glyph path functions + layout table for digits 1–59; BigInt conversions; base-b reciprocal expansion (use core `baseExpansion`); hardcoded Plimpton data **transcribed from a reliable source at build time, not from memory**; clay "thock" stamp sound (core `drums.thock`).

**Stretch:** *Regular numbers are consonance.* The 2,3,5-smooth numbers are exactly the ratios of 5-limit just intonation (2:1 octave, 3:2 fifth, 5:4 major third). One interactive line: keys tuned to regular-number ratios lock; a 7-limit ratio rubs. The same smoothness that cleans Babylonian division cleans harmony — first direct bridge to Movement II.

---

## Exhibit 4 — "The Two Tools" (`js/exhibits/origins/twotools.js`, ~650 lines; biggest Origins module)

**Hook:** Prove a 2,300-year-old theorem with your own hands — using the only two tools Euclid allows.

**Content:** Unmarked straightedge (NOT a ruler — kill that myth on-screen) and compass; Postulates 1–3 *are* the legal moves; Proposition I.1 (equilateral triangle) is the opening play; construction = existence proof — where "proof" enters the movement. The collapsing compass and Prop I.2 (it costs nothing — the collapsing compass simulates the rigid one). Honest crack: I.1 assumes the two circles intersect, which Euclid's axioms cannot prove (fixed by 19th-c. continuity axioms) — rigor is a moving target from line one. **Myths to avoid:** "Euclid invented geometry" (he systematized Pythagoreans/Theaetetus/Eudoxus); the Delian oracle story (usable as legend only); "the Elements is perfectly rigorous."

**Interaction:** Full **construction sandbox**: place points; line-through-two-points; circle-by-center-through-point; every intersection becomes a snappable point. Quest ladder with goal-checking: I.1 triangle → bisect a segment → bisect an angle → raise a perpendicular → (advanced) copy a segment with a collapsing compass per I.2; then free play. Signature element: the **proof panel** — as the visitor constructs, a parchment column writes the deduction in Euclid's idiom ("With center A and distance AB, let a circle be described [Post. 3]…"); the visitor's clicks literally author the proposition, signed ΟΠΕΡ ΕΔΕΙ ΠΟΙΗΣΑΙ (QEF) on completion.

**Implementation:** Geometry kernel (point/line/circle records; line–line, line–circle, circle–circle intersections; screen-space snapping). Constructions stored as a **dependency graph** (object → parents + operation), which buys three features at once: proof transcript (walk the graph, emit template sentences), undo (prune leaves), and robust goal verification (re-instantiate from jittered starting points and re-check numerically — validates the construction, not the lucky drawing).

**Stretch:** *The 2,000-year cliffhanger.* Constructible lengths live in the tower of iterated square roots, so ∛2 and general trisection are forever out of reach (Wantzel 1837; Lindemann 1882 for squaring the circle). A "trisection trap" quest invites the attempt, then interrupts — not "you failed" but "no one can; here is the one-paragraph reason, found 2,000 years later." One-line coda: origami's axioms solve cubics, so folding trisects angles — change the rules, change the universe of the knowable. Bridge to Movement III.

---

## Exhibit 5 — "The Diagonal" (`js/exhibits/origins/diagonal.js`, ~500 lines; movement climax)

**Hook:** Hunt for the fraction that measures a square's diagonal — and hear why you will never find it.

**Content:** Incommensurability (5th c. BCE): side and diagonal of a square share no common measure. Earliest solid witness is Aristotle citing the even/odd proof (p²=2q² forces p even, then q even — contradiction; the Elements X.117 version is a later interpolation). Likelier discovery route: anthyphairesis — reciprocal subtraction (the Euclidean algorithm done geometrically) terminates on 15 vs 9 but on side-vs-diagonal never ends, because the leftover is a smaller copy of the same configuration (√2 = [1; 2, 2, 2, …]). The near-misses are ancient: pairs with p²−2q² = ±1 — (1,1), (3,2), (7,5), (17,12), (41,29) — are Theon of Smyrna's "side and diameter numbers," i.e. Pell numbers. **Myths to avoid:** the drowning of Hippasus (sources ~800 years later and contradictory — tell it inside the legend panel); "the discovery destroyed Pythagoreanism"; "Pythagoras proved the Pythagorean theorem" (no evidence — Exhibit 3's tablet used the relation a millennium earlier). Payoff: resolves Exhibit 3's cliffhanger — the half-square can never appear in Plimpton 322 because p²=2q² has no solution.

**Interaction:** Three stations, escalating. (1) *Lattice hunt:* pannable/zoomable integer lattice; drag a marker to (q,p); a big meter shows p²−2q²; quest: make it zero. Near-misses (±1) ignite as golden points — the visitor discovers the Pell staircase climbing forever toward the √2-ray without touching it. A "why?" button unfolds the even/odd proof as a two-step interactive: assert "p/q in lowest terms," watch parity force both even, see the contradiction fire. (2) *Endless subtraction:* side and diagonal as bronze rods; click to subtract shorter from longer. On 15 vs 9 it halts (gcd 3 glows — the common measure). On side vs diagonal each subtraction reveals a smaller square with its own side and diagonal — auto-zoom into the self-similar recursion, levels deep. Caption: a gcd computation that never halts *is* irrationality (one line: Movement III will ask what else never halts). (3) *The sound of incommensurability* (bridge to II): two oscillators; at 3:2 the oscilloscope and Lissajous figure lock into a closed curve — commensurability seen and heard. Snap through Pell convergents 3/2 → 7/5 → 17/12 → 41/29: ever-longer, more filigreed closed curves. Release to true √2:1 — the curve never closes, the beats never repeat. The chord rings as the visitor scrolls into Movement II.

**Implementation:** Pan/zoom lattice (core `PanZoom`); Pell pairs by recurrence (core `pellPairs`); BigInt meter (exact at any zoom); parity proof as small DOM state machine; subtraction self-similarity via one affine transform (scale factor √2−1) applied recursively with animated zoom; two `voice`s + X-Y Lissajous canvas (compute parametrically from shared params, don't tap audio); ratio snap table = convergents.

**Stretch:** *The crisis contained the cure — 2,300 years early.* Eudoxus' theory of proportion (Elements Book V), built to handle incommensurables, defines ratio-equality by sorting against all whole-number ratios — precisely Dedekind's 1872 cuts, as Dedekind acknowledged. Compact interactive: a slider sorts rationals into "less"/"greater" piles around a hidden cut; √2 gets *defined* by the partition alone. Final signpost: "what is a number?" stays open to Movement III's horizon.
