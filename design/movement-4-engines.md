# Movement IV — Engines: Design Report

*The unreasonable effectiveness of mathematics*

## Narrative arc

In 1940 G. H. Hardy wrote, with perfect confidence, that no one had found "any warlike purpose to be served by the theory of numbers or relativity," and that no one was likely to for years. Both of his examples now run the world. Movement IV is the descent from the horizon back to the ground. Seven engines, each running inside the visitor's own phone, and each built from something Movements I–III met as pure play:

1. **handshake**: curves counted mod p (III.4) agree on a secret in public.
2. **lossy**: Fourier's circles (II.5) decide what a photograph can afford to forget.
3. **selfheal**: parity, the even and odd that doomed the diagonal's fraction (I.5), turns into a code that finds its own errors.
4. **whereami**: Euclid's circles cutting circles (I.4) locate you on the planet, on clocks that Einstein corrects.
5. **eigen**: the eigenvector that drew Chladni's sand (II.4) ranks the web.
6. **learner**: Cauchy's 1847 descent trains the machines, including the ones that now write proofs (III.5).
7. **shor**: the continued fractions that explained twelve notes (II.2, II.7) read a period out of a quantum computer, and would pick the lock that opened the movement.

The order follows Shannon's three tasks for a message (stay secret, stay small, stay whole), then geometry, then linear algebra, then calculus, then quantum. It closes the loop by returning to the handshake. The Coda follows and asks the overture's question again, now sharpened by Wigner's bafflement: if we invented it, why does the world run on it?

**House rules apply in full.** Every exhibit computes the real engine in miniature: a real elliptic-curve Diffie–Hellman, a real baseline-JPEG DCT and quantizer, a real Hamming decoder, a real pseudorange solver, a real power iteration, a real network trained by real gradients, and a real period-finding distribution with continued-fraction recovery. Nothing is fetched and there are no images; everything is drawn. Hype stays out. Where the frontier is contested (quantum resource estimates, AI claims) the page gives the dated, sourced fact, and puts forecasts in a speculation panel.

**Movement pigment:** verdigris (`palette.verdigris`, `--mv-4`), with gold, azure and crimson for their established meanings.

**Movement backdrop** (shell-owned): all 444 points of y² = x³ + 7 over the integers mod 421 (counting ∞). This is the equation of secp256k1, shrunk to a small prime.

---

## IV.1 · The Handshake (`engines/handshake.js`)

**Hook:** Two strangers agree on a secret while everyone listens. The trick is a walk on a curve that only goes one way.

**Core:**
- The chord-and-tangent law on y² = x³ + 7 over ℝ (drag P and Q; watch P+Q).
- The same curve counted mod a small prime: 78 affine points + ∞ = 79 on 𝔽₉₇, inside Hasse's window, the Rosetta echo.
- Scalar multiplication as a one-way walk.
- A live Diffie–Hellman, with Alice, Bob and an eavesdropper who sees only the public points.
- Baby-step/Pollard-style attacks that succeed at toy size and visibly explode with the key size.
- "Full size": a real X25519 computation in BigInt (RFC 7748 test vector) as the thing the browser's TLS 1.3 handshake does.

**History:** Diffie–Hellman 1976; GCHQ's earlier secret work (Ellis, Cocks, Williamson; declassified 1997); Koblitz and Miller 1985 independently; Curve25519 (Bernstein 2006); TLS 1.3 (RFC 8446, 2018); FIPS 203 ML-KEM (13 Aug 2024) and the hybrid X25519MLKEM768 rollout.

**Links:** III.4 (the same kind of curve), II.2 (clock arithmetic), I.5 (Euclid's algorithm computing inverses).

## IV.2 · The Art of Forgetting (`engines/lossy.js`)

**Hook:** Keep one number in fifteen and your eye swears nothing is missing. A cosine from 1974 decides which fourteen to forget.

**Core:**
- The 8×8 DCT-II exactly as in ITU-T T.81 (baseline JPEG): a basis atlas; a block built coefficient by coefficient in zig-zag order with a Parseval energy bar; the luma quantization table scaled by quality; the real round-trip on procedurally drawn scenes (no external images); and a count of the coefficients that survive.
- Optional: the audio cousin (MDCT-style transform coding of a synthesized sound), letting the ear hear what is thrown away.

**History:** Fourier (1807 memoir; *Théorie analytique*, 1822); Ahmed, Natarajan and Rao 1974 (DCT); JPEG, ITU-T T.81, approved 18 Sep 1992; MP3/AAC; compressed sensing (Candès–Romberg–Tao, Donoho, 2006) and FDA-cleared compressed-sensing MRI.

**Links:** II.5 Fourier Atelier (sums of circles); II.4 Chladni (the DCT basis has the same separable cos·cos form as the plate shorthand); I.1 tally (compression by structure against compression by forgetting).

## IV.3 · The Checking Number (`engines/selfheal.js`)

**Hook:** Flip any bit and the damage writes down its own address. Scratch away a third of the code and it still says what it said.

**Core:**
- Hamming(7,4) as three overlapping circles. Flip any bit: the failing checks, read as a binary numeral (place value from I.3), name the broken position, which is Hamming's own "checking number".
- Two flips make it lie; SECDED catches that.
- Perfect codes (sphere packing in Hamming space).
- Reed–Solomon over GF(2⁸) in a real QR code the visitor can scratch and still read.
- Shannon's capacity as the horizon.

**History:** Shannon 1948; Hamming 1950 (BSTJ; the Model 5 relay computers at Bell Labs); Golay 1949; Reed–Solomon 1960; Voyager's concatenated RS; QR (Denso Wave 1994); 5G LDPC and polar codes; quantum error correction below threshold (Google, 2024, verified wording only).

**Links:** I.1 (the leftover pebble detects without locating); I.3 (place value); I.5 (parity).

## IV.4 · One More Circle (`engines/whereami.js`)

**Hook:** Euclid needed two circles to find a point. A satellite receiver needs one more, because its own clock is lying, and then it has to ask Einstein.

**Core:**
- Two range circles cut in two points (I.1 in orbit).
- The receiver's quartz clock lies, so a third satellite turns three pseudorange circles into a triangle that collapses only at the right clock bias. The visitor finds the fourth unknown by hand, then a Gauss–Newton or Bancroft solver finds it in microseconds.
- Relativity: satellite clocks gain about 45.7 μs/day from gravity and lose about 7.2 μs/day to speed, a net of about 38 μs/day, roughly 10 km/day of error if uncorrected. The clocks are set to 10.22999999543 MHz before launch.
- DOP: geometry decides precision.

**History:** Transit (1960s); NAVSTAR GPS (first launch 1978, full operational capability 1995); Selective Availability switched off 2 May 2000; Galileo, BeiDou, GLONASS; Bancroft 1985.

**Links:** I.4 The Two Tools (circle–circle intersection and its continuity gap); I.3 (sexagesimal time).

## IV.5 · 0.85 (`engines/eigen.js`)

**Hook:** Pour all the importance onto one page and let it flow along the links. It forgets where it started by a factor of at least 0.85 per click, and what survives is the web's own eigenvector.

**Core:**
- Repetition is a filter.
- Prologue: Theon's side-and-diameter ladder as power iteration converging on √2 (I.5).
- Then PageRank on an editable small web: power iteration with damping α = 0.85, the spectrum plotted (λ = 1 pinned, everything else inside the α-circle), convergence against the α^k bound, and a random surfer whose visit histogram converges to π.
- Optional: "the drum", the same eigen-machinery as Chladni modes.

**History:** Perron 1907; Frobenius 1912; Markov (1906; the 1913 Onegin vowel chain); Brin and Page 1998 (d = 0.85, at least 24 million pages); modern spectral methods.

**Links:** I.5 Diagonal (Pell and Theon), II.4 Chladni (eigenmodes), II.7 Golden (φ as a dominant eigenvalue).

## IV.6 · The Descent (`engines/learner.js`)

**Hook:** In 1847 Cauchy wrote a rule for chasing planets: take a small step downhill. Here it untangles two spirals while you watch, and today it trains the machines that write proofs.

**Core:**
- The perceptron on separable data (with the Block–Novikoff bound), then its honest failure on XOR (a detected cycle, III.3's verdict).
- Then a small multilayer network trained live by backpropagation, with gradients computed exactly by reverse-mode differentiation, on the two-spirals problem, with a morphing decision boundary, a loss curve, and a hidden-unit gallery.
- The loss landscape and the step size: too large diverges, too small crawls.

**History:** Cauchy 1847 (C. R. Acad. Sci. 25); Rosenblatt 1958; Minsky–Papert 1969; Linnainmaa 1970 (reverse-mode AD); Rumelhart–Hinton–Williams 1986; Cybenko 1989; AlexNet 2012; transformers 2017; the 2024 Physics Nobel (Hopfield, Hinton); AI at IMO 2025 (dated, sourced, no hype).

**Links:** III.5 Telescope (machine proof), III.3 (non-halting verdicts), I.5 (the XOR contradiction has the shape of the √2 proof).

## IV.7 · The Period Engine (`engines/shor.js`)

**Hook:** Find the hidden rhythm of 7ˣ mod 15, hear it as a pitch, and let a continued fraction split the number. The recipe is now forcing the internet to change its locks.

**Core:**
- The multiplicative orbit of a mod N drawn and played like II.2's circle.
- The period-finding output distribution computed exactly (classical simulation of the quantum measurement statistics for small N), with peaks at multiples of Q/r.
- Sample a measurement, and a continued fraction (Euclid's ladder) recovers r; gcd(a^{r/2} ± 1, N) splits N.
- Honest scale: why this needs a fault-tolerant machine, with dated resource estimates.

**History:** Shor 1994 (FOCS); factoring 15 by NMR (Vandersypen et al., Nature 2001); Proos–Zalka 2003 (elliptic curves); FIPS 203 (2024); Gidney 2025 resource estimate (verified wording).

**Links:** II.2 (orbit in ℤ/N, convergents), II.7 (continued fractions), I.5 (Euclid), IV.1 (the lock it would pick).

---

## Coda

This is `horizon/coda.js`, with movement 4 and manifest `coda: true`. It now follows Movement IV. Its hook becomes "Answer it again, now that you have seen its walls, its bridges and its engines." Its prose acknowledges the engines and the Hardy–Wigner–Hamming exchange on effectiveness. The Hilbert/Gödel last words stay.
