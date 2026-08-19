# Movement III — Horizon: Design Report
*The edge of what can be known*

## Narrative arc

Horizon walks the boundary of mathematics from the inside out: a single trick — the diagonal — detonates three times at three scales, destroying complete lists (Cantor), complete theories (Gödel), and complete computation (Turing and the busy beavers), and each detonation is staged as a real computation the visitor runs and personally loses. At the far edge the movement turns around: the walls are real, but so are the bridges — a live Langlands correspondence shows two unrelated computations agreeing forever, hinting that mathematics is more unified than its limits suggest, and machine-verified proof is changing who, or what, can stand at the frontier. The movement ends on the only honest question left: whether any of this was built or found.

**Intellectual honesty rules (non-negotiable):** every interaction computes the real object (no metaphor animations); theorem statements exact; every speculative claim sits behind `ui.speculationPanel`. Machine transition tables and record values must be transcribed from primary sources (bbchallenge wiki, published papers) at build time — never reconstructed from memory.

**Strongest "wow": III.3 — "47,176,870".**

---

## III.1 — The Diagonal (`js/exhibits/horizon/diagonal-cantor.js`, ~550 lines)

**Hook:** Build an infinite list meant to contain every infinite binary sequence. One sequence will step out of it — and will keep stepping out no matter what you do.

**Mathematical content (all established):**
- Cantor's diagonal argument (1891), stated exactly: given ANY sequence s0, s1, s2, … of infinite binary sequences, d(n) = 1 − s_n(n) differs from every s_n (at position n). Hence no surjection ℕ → 2^ℕ; the continuum is uncountable.
- Cantor's theorem in general: for every set X, no surjection X → P(X); hence the strictly increasing tower ℵ0 < 2^ℵ0 < 2^(2^ℵ0) < … (beth numbers).
- Continuum hypothesis: no cardinality strictly between ℵ0 and 2^ℵ0. Gödel (1940): CH cannot be disproved from ZFC (constructible universe L). Cohen (1963): CH cannot be proved from ZFC (forcing). Both relative to Con(ZFC).
- **Speculation begins here, labeled on-page:** whether CH has a determinate truth value is a live philosophical dispute — Hamkins's set-theoretic multiverse vs universe views like Woodin's Ultimate-L program. One hard theorem on the anti-CH side: Martin's Maximum implies 2^ℵ0 = ℵ2 (Foreman–Magidor–Shelah 1988), and Asperó–Schindler (Annals 2021) proved MM++ implies Woodin's (*) axiom — two directions converging on ℵ2. The theorems are theorems; what they mean for CH's truth is the labeled speculation.

**Interaction design:**
1. **Build the list.** Visitor adds rows to an infinite table. Each row is a RULE, not finite data — menu: all-zeros; any periodic pattern they type; binary expansions of rationals; Thue–Morse; characteristic function of the primes; "paint the first 64 digits, then repeat" — so every row is evaluable at any index n.
2. **Watch the escape.** A red diagonal row materializes: d(n) = 1 − row_n(n). Visitor jumps to ANY index — row 1,000,000, digit 1,000,000 — and sees the mismatch computed live. A real diagonalization against their own enumeration, not an animation of one.
3. **Try to absorb it.** Button: "fine — insert the diagonal as row 0." Table reindexes, diagonal instantly recomputes, escapes again. Attempt counter; captions escalate from playful to vertiginous. This loop — you cannot win, and you can feel exactly why — is the exhibit's core.
4. **The tower.** Zoom out: their table is one rung; Cantor's theorem stacks rungs forever. CH posed as a literal gap in the tower, with the independence timeline.

**Implementation sketch:** Rows are closures n → 0|1 from ~10 rule constructors; the diagonal is itself just another closure — which is WHY absorb-and-re-escape is one line of code, a point the essay makes explicitly. Canvas virtual grid (only visible cells evaluated); BigInt indices for jump-to-n. Export `_test` with the rule constructors + diagonal so node can verify the escape at arbitrary indices.

**Exploratory stretch — a playable shadow of forcing.** Visitor grows a finite binary string (a condition); the machine deals "requirement cards," each a dense set — "reach length ≥ 40," "differ somewhere from row 7 of your own list from part 1." Visitor discovers every card can always be met (density), and meeting all cards forces the limit real outside their entire ground list. Honest caption: "You met countably many dense sets. Cohen's forcing does this against EVERY dense set definable in a model of set theory — and adds ℵ2 of these reals at once, making CH false in the extension. The bookkeeping that keeps cardinals intact is where the real work lives." Then multiverse vs Ultimate-L, flagged as philosophy, with MM++ ⇒ (*) as the one recent hard result.

---

## III.2 — The Strange Loop (`js/exhibits/horizon/loop.js`, ~700 lines)

**Hook:** Play inside a formal system until you can feel its walls — then watch a sentence build itself out of its own blueprint and say "you cannot prove me."

**Mathematical content (all established; zero speculation needed):**
- MIU system (Hofstadter): axiom MI; rules xI→xIU, Mx→Mxx, xIIIy→xUy, xUUy→xy. MU is underivable — the I-count mod 3 is invariant and starts at 1. Point: the underivability proof lives OUTSIDE the system, in meta-reasoning the system cannot perform.
- Arithmetization: strings become numbers (M,I,U → 3,1,0); derivability becomes a purely arithmetic property — the concrete first step of Gödel's construction.
- Diagonal lemma: for any formula P(x), there is a sentence G with T ⊢ G ↔ P(⌜G⌝). Self-reference is mechanical, not paradoxical.
- Gödel–Rosser first incompleteness theorem, exact: every consistent, effectively axiomatizable theory extending Robinson arithmetic Q is incomplete. Second theorem: no such theory (satisfying the derivability conditions, e.g. PA, ZFC) proves its own consistency.
- **The payoff — a NATURAL unprovable truth:** Kirby–Paris hydra theorem and Goodstein's theorem (1944). Every Goodstein sequence terminates; Kirby–Paris (1982) proved PA cannot prove this — the proof needs transfinite induction to ε0. Goodstein(4) terminates after 3·2^402653211 − 2 steps — a number with about 121 million digits.

**Interaction design:**
1. **Act I, sandbox:** derive MIU strings by clicking rules; live BFS enumerates theorems ("theorem 48,211 reached; MU not among them"). Reveal: the mod-3 invariant animated over the visitor's own derivation tree — they just proved a theorem ABOUT the system that no derivation INSIDE it could be.
2. **Act II, self-reference factory:** a working JS quine, displayed and executed. Beside it, a diagonal-lemma widget: pick any property from a menu ("…is even," "…has >100 symbols," "…is not provable") and the machine CONSTRUCTS the fixed-point sentence live by the same substitution trick as the quine. Picking "is not provable" builds G before their eyes.
3. **Act III, the hydra:** fully playable Kirby–Paris hydra — rooted tree on canvas; chop leaf heads; hydra regrows n copies of the maimed subtree at the grandparent on turn n. Alongside, an **ordinal meter** shows the hydra's ordinal in Cantor normal form (core ordinal helpers) strictly DECREASING with every chop — the visible reason Hercules always wins, and the visible reason PA can't see it (the meter climbs through ε0's territory). Toggle to Goodstein sequences: seed 3 terminates in a dozen steps; seed 4's step-count estimate renders and the visitor understands why we show the ordinal instead.

**Implementation sketch:** MIU engine + BFS ~120 lines. Quine + substitution widget over a toy term language ~180. Hydra: tree structure, ordinal assignment (node ↦ sum of ω^(child ordinals) via core `ordSumOfOmegaPows`), CNF pretty-printer (core `ordToString`), canvas layout + regrowth animation, ~300. Goodstein via hereditary base-b BigInt ~80. Export `_test`: MIU derivation checker + invariant, hydra ordinal strictly-decreasing check, Goodstein(3) sequence.

**Exploratory stretch:** Löb's theorem (if PA ⊢ Prov(⌜φ⌝)→φ then PA ⊢ φ) as "the system cannot even trust hypothetical proofs of itself"; the consistency tower PA ⊂ PA+Con(PA) ⊂ …; proof-theoretic ordinals as a ruler for the strength of theories (PA's is exactly the ε0 the hydra meter climbed) — handing the baton to III.3.

---

## III.3 — 47,176,870 (`js/exhibits/horizon/beavers.js`, ~800 lines) — THE MOVEMENT'S WOW

**Hook:** Five states, two symbols, one blank tape — and the exact number of steps it can run before halting took humanity fifty years and a Coq proof to pin down. The next number after it may be unknowable.

**Mathematical content (all established, strikingly recent):**
- BB(n) (= S(n)): max steps of a halting n-state 2-symbol TM from blank tape. BB(1)=1, BB(2)=6, BB(3)=21, BB(4)=107, and **BB(5) = 47,176,870** — bbchallenge collaboration, Coq-verified, July 2024. Champion (Marxen–Buntrock 1990) leaves 4098 ones.
- BB grows faster than every computable function (else halting would be decidable) — proved in-exhibit via the decider defeat below.
- **BB(6):** current champion (mxdys, June 2025) runs more than 2↑↑2↑↑2↑↑10 steps — pentation territory; the famous 10↑↑15 bound is already obsolete. The "Antihydra," a 6-state cryptid found June 2024, halts iff a simple imbalance ever occurs in the Collatz-like sequence from 8 (h → h + ⌊h/2⌋ style map — TRANSCRIBE the exact condition from the bbchallenge wiki at build time) — believed never (random-walk heuristic), provable by no known technique. Knowing BB(6) requires solving it.
- Stérin–Woods: an explicit small machine (~15 states) halts iff a 1979 Erdős conjecture (every 2^n, n>8, has a 2 in ternary) is false — BB already encodes open number theory at small n. VERIFY state count from source.
- **The ZFC cliff:** an explicit 745-state machine halts iff ZFC is inconsistent (O'Rear, improved by Riebel 2023). By Gödel II, if ZFC is consistent it cannot prove this machine runs forever — so **ZFC cannot determine BB(745)** (knowing BB(745)=N would settle the machine by running N steps). Every honest theory has a horizon number beyond which BB is invisible to it. BB is a ruler that measures mathematics itself.

**Interaction design:**
1. **The defeat (bridge from III.1/III.2):** three toy halting-checkers with visible source (loop-sniffer; run-1000-steps guesser; pattern library). Visitor picks one; the page mechanically builds its spite program — "run the checker on my own source; do the opposite" — via the quine trick from III.2, and runs it. The checker is wrong, live, every time. The diagonal's third detonation.
2. **The Preserve:** champions BB(1)–BB(5) race on real interpreters. BB(1)–BB(4) finish while you watch; BB(5) runs at up to tens of millions of steps/second (macro-stepping k steps per frame, adjustable), its tape rendered as a scrolling **space-time diagram** (each row a tape snapshot, time flowing downward, decimated row sampling) — 47,176,870 steps of intricate, weirdly organic structure unfurling in about a second at full throttle, or frame-by-frame at leisure. Caption: "Everything you just watched is now a theorem."
3. **Beat the Beaver:** a 5-state transition-table editor. Verdicts: HALTED (n steps) / PROVED NON-HALTING (cycle detected) / UNKNOWN (budget exceeded) — the trichotomy itself teaching that verifying is possible where deciding is not (honest note that bbchallenge's real deciders are stronger than our snapshot-hash cycle detection). Best run scored against 47,176,870, your space-time diagram beside the champion's.
4. **The cliff walk:** scroll from BB(5)'s number, past BB(6)'s tower-of-towers (an interactive "tetration teller": each floor of the tower is the number of digits of the floor below — the browser gives up representing floor 3, and that surrender IS the visualization), past the Antihydra and the Erdős machine, to the 745-state wall where ZFC goes blind.

**Implementation sketch:** TM core on growable Int8Array tape with macro-stepping ~80 lines; space-time renderer ~150; race UI ~150; sandbox editor + snapshot-hash cycle detection ~200; spite constructor sandboxed (a JS function-source string the page evals in a Worker or Function constructor — keep it same-origin simple) ~150; tetration teller ~60. Export `_test`: the TM interpreter + champion tables so node can verify BB(1)–BB(4) = 1, 6, 21, 107 exactly and (long test, optional flag) BB(5) = 47,176,870.

**BB(5) champion transition table (verified, Marxen–Buntrock; format: write, move, next; start A, blank 0, halt on E-read-0):**

| | read 0 | read 1 |
|---|---|---|
| **A** | 1 R B | 1 L C |
| **B** | 1 R C | 1 R B |
| **C** | 1 R D | 0 L E |
| **D** | 1 L A | 1 L D |
| **E** | 1 R **HALT** | 0 L A |

BB(1)–BB(4) champions and BB(6)/Antihydra tables: transcribe from the bbchallenge wiki (https://wiki.bbchallenge.org) at build time — do NOT reconstruct from memory. If a fetch fails, omit that machine's table and its claim rather than guessing.

**Exploratory stretch:** "The ruler of theories" — PA, ZFC, ZFC+large cardinals placed as horizons on the BB axis: each theory determines BB up to some n and is provably blind beyond some N (ZFC's blindness certified at 745; where it ACTUALLY begins is unknown — conceivably as low as 6, labeled as open, not established). Closing note: bbchallenge is also a story about how math now gets done — pseudonymous online collaborators with a Coq certificate instead of a journal referee — threading into III.5.

---

## III.4 — The Rosetta Stone (`js/exhibits/horizon/rosetta.js`, ~700 lines)

**Hook:** Count solutions of one equation, prime by prime. Multiply out one infinite product from a completely different universe. The two number streams agree at every prime, forever — and explaining why took three and a half centuries.

**Mathematical content (established, one labeled physics frontier):**
- Live instance: elliptic curve E: y² + y = x³ − x² (conductor 11) and the modular form f = q·∏(1−qⁿ)²(1−q¹¹ⁿ)². For every prime p ≠ 11: a_p = p + 1 − #E(F_p) equals the coefficient of q^p in f. A true, checkable instance of the modularity theorem (Wiles–Taylor 1995 for semistable curves — the theorem behind Fermat's Last Theorem — completed by Breuil–Conrad–Diamond–Taylor 2001). Hasse's bound |a_p| ≤ 2√p (1933) frames the window.
- Frame: Weil's 1940 "Rosetta stone" letter (written in prison, to his sister Simone Weil) — number fields / function fields / Riemann surfaces as three languages for one text — and Langlands's 1967 letter to Weil: Galois representations (arithmetic) ↔ automorphic forms (harmonic analysis). The exhibit is explicit that the full program is conjectural; proved provinces (class field theory = GL(1); modularity = a GL(2) case; the function-field case, Lafforgue) are marked as settled territory on the map.
- Recent landmark: geometric Langlands conjecture (de Rham, categorical form) proved 2024 — Gaitsgory, Raskin, and collaborators, five papers, ~1000 pages.
- **Speculation/physics flag:** Kapustin–Witten (2006) link to S-duality in gauge theory is physics-grade reasoning, marked as a bridge under construction, not a theorem.
- The honest echo of Movement II, stated on-page: automorphic forms ARE harmonic analysis — the a_p are literally Fourier coefficients. Langlands reciprocity says the arithmetic of equations is encoded in a spectrum of generalized harmonics. Not a poetic analogy — the same Fourier mathematics the visitor played with in Resonance, one abstraction level up.

**Interaction design:**
1. **The Mirror:** split screen. Left: for chosen prime p, the p×p grid over F_p lights up solutions of y² + y = x³ − x² as they're counted. Right: the infinite product multiplies out term by term, coefficients streaming. Between them, a_p computed both ways clicks into agreement. "Run the primes" sweeps p upward, mirror-matches accumulating relentlessly. Nothing is faked; both sides compute.
2. **The map:** a pannable dark chart of the Langlands landscape — two continents (Arithmetic, Harmonic Analysis) with bridges: built (class field theory, modularity, function fields), under construction (functoriality), 2024's new span (geometric Langlands), and a dotted physics ferry (Kapustin–Witten, labeled). Clicking any bridge opens a short essay panel. The visitor's own mirror-match is pinned on the modularity bridge: "you stood here."

**Implementation sketch:** Point counting: #E(F_p) = p + Σ_x [1 + χ(RHS discriminant form)] — for y² + y = x³ − x², complete the square: (2y+1)² = 4x³ − 4x² + 1, so count via quadratic character χ of (4x³ − 4x² + 1) for p odd (handle p = 2 by direct enumeration: a_2 = −2). O(p) per prime — instant for p up to 10^6. Eta-product by repeated sparse polynomial multiplication of (1−q^n)² and (1−q^{11n})² up to q^N (N = 10^4 in milliseconds; coefficients stay small integers). Mirror UI ~200 lines; Sato–Tate histogram in a Worker ~100; SVG/canvas map + prose panels ~250. Export `_test`: pointCount(p) and etaCoefficients(N) so node verifies a_p anchors: a2 = −2, a3 = −1, a5 = 1, a7 = −2, and agreement + Hasse bound for all primes < 1000.

**Exploratory stretch — Sato–Tate, live:** compute a_p/(2√p) = cos θ_p for all p < 50,000 and watch the histogram converge to the sin² semicircle — the Sato–Tate distribution, proved for such curves by Taylor and collaborators (2008–2011). The visitor watches a theorem about the statistics of ALL primes materialize out of their own point-counts. Essay's closing line: the busy beavers said mathematics has walls no theory can cross; the mirror says it also has tunnels no one dug — both are facts, and the tension between them is the honest state of the field.

---

## III.5 — The Telescope (`js/exhibits/horizon/telescope.js`, ~750 lines)

**Hook:** Prove a real theorem the way a machine checks it — one tactic at a time — then confront the proofs no human will ever read.

**Mathematical content (established facts; the futures are labeled):**
- What a proof assistant is: a small trusted kernel checking every inference (de Bruijn criterion); Lean's Mathlib exceeds 1.5 million lines. Landmarks: four-color theorem (Appel–Haken 1976; formalized Gonthier 2005), Kepler conjecture (Hales 1998; Flyspeck completed 2014), Liquid Tensor Experiment (Scholze's 2020 challenge; completed 2022), Polynomial Freiman–Ruzsa conjecture (proved Nov 2023, formalized in Lean in ~3 weeks by a Tao-led open collaboration), Equational Theories Project (2024–25: ~22 million implications between 4694 magma laws settled by a human–machine swarm).
- Proofs beyond reading: Boolean Pythagorean triples theorem ({1..7824} splits into two parts with no monochromatic a²+b²=c²; {1..7825} does not) — Heule–Kullmann–Marek 2016, 200-terabyte SAT certificate. Schur number five (Heule 2017): two petabytes.
- AI at the frontier: AlphaProof (DeepMind), an RL agent producing Lean proofs — silver-medal standard at IMO 2024 (28/42; solved P1, P2, P6, with AlphaGeometry 2 taking P4), published in Nature (2025). In 2025, general-purpose models reached gold-medal standard at IMO in natural language.
- Curry–Howard: proofs are programs — the visitor SEES this: their interactive proof is displayed as a lambda term at the end.
- **Speculation begins here, labeled:** three futures as scenarios, not predictions — the oracle problem (verified truth outrunning human narrative understanding: is a theorem "known" if no one can say why it's true?); the mathematician as composer/curator of machine-executed ideas (deliberate echo of Movement II); and Voevodsky's answer — after finding errors in his own celebrated work he built univalent foundations, where equality is a path and isomorphic structures are literally identical (HoTT: real, working formal systems; the claim they'll REPLACE set theory flagged as open advocacy, not fact).

**Interaction design:**
1. **The instrument:** a genuine miniature proof assistant — intuitionistic propositional natural deduction with a goal panel and tactics (intro, exact, apply, split, cases, left, right). Six lemmas ramp from A→A to ((A∨B)→C) → (A→C)∧(B→C). Wrong tactics fail with honest error messages; QED triggers the kernel visibly re-checking the completed term. Reveal: "here is your proof as a program" — Curry–Howard made personal.
2. **The unreadable library:** a scrollbar built to true scale — the thumb is one human-readable page; the track is the 200 TB certificate. Computed live: at a page a minute, twelve hours a day, roughly a quarter-million years of reading. The visitor scrolls anyway; the position counter's futility is the point.
3. **The trust ladder:** for each landmark proof, toggle what you must trust — referees, a 5,000-line kernel, a compiler, silicon — rendered as an actual chain with links that light up. Quiet observation: the machine-checked chain is SHORTER.

**Implementation sketch:** ND kernel (formula ADT, sequent goals, tactic application, term checker) ~300 lines; prover UI ~250; scale scrollbar ~80; trust ladder ~100. The kernel is the one component worth writing test-first; its lemma set is fixed, so exhaustive checking is easy. Export `_test`: the kernel + the six lemmas' tactic scripts (all must succeed) + a known-bad script (must fail with an error, not crash).

**Exploratory stretch:** the same statement (A ∧ B → B ∧ A) side-by-side in four foundations — natural deduction, Lean syntax, a HoTT-style path argument, prose — with the univalence axiom stated precisely and one honest paragraph on what "equality as path" buys (transport of proofs across isomorphism) and costs (a different logic). Ends by handing the visitor to the coda.

---

## Coda (`js/exhibits/horizon/coda.js`, ~120 lines) — "One Question"

The overture (already built, in main.js) asked once, with no definitions: **"Mathematics — invented or discovered?"** — a slider, stored in `localStorage['mathemagical:one-question']` (string "0".."1"; 0 = invented, 1 = discovered; absent = never answered).

The coda is the site's final screen. The opening answer reappears as a ghost mark on a fresh slider, and the visitor places it once more — after the tally bones, the harmonics, the diagonal, the hydra, the beavers, the mirror. The slider is an instrument: dragged toward *discovered* it sounds the pure harmonic series (ratios found in any vibrating string in any universe — Movement II's physics); toward *invented* it morphs into equal temperament (a human compromise no string ever chose). The visitor literally hears the question. Above it, one closing image on canvas: a single tally mark — which is also the digit 1 — pulsing gently with the drone. One object; three readings; the whole site in one stroke.

Implementation: slider; WebAudio drone with two detunable oscillator banks (say 6 partials each: harmonic series 1,2,3,4,5,6 × f0 vs ET approximations 2^(k/12) nearest each) crossfaded by slider position; ghost mark from localStorage; if no stored answer, say so gently instead of showing a ghost.

Final prose, short and honest: the live positions (Platonism — Gödel's own view; formalism — Hilbert's; intuitionism; structuralism; and out at the labeled speculative edge, Tegmark's mathematical universe hypothesis), no winner declared. Then the site's last words:

> In September 1930, in Königsberg, David Hilbert declared: *"Wir müssen wissen — wir werden wissen."* We must know — we will know. The day before, at a conference in the same city, a quiet 24-year-old named Kurt Gödel had announced that some things cannot be proved. Hilbert's words were carved on his gravestone anyway.
>
> They were both right. That is the strangest theorem of all.

The coda module may inject scoped CSS (`#ex-coda …`) to center its layout and hide the standard exhibit header if that reads better.
