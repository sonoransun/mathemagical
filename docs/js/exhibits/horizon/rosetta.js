// III·4 — The Rosetta Stone
// One equation counted prime by prime; one infinite product multiplied out.
// The streams agree at every prime p ≠ 11 — a live, checkable instance of the
// modularity theorem (Wiles–Taylor 1995, completed BCDT 2001) — plus the
// Sato–Tate histogram materializing from the visitor's own point-counts, and
// a pannable map of the Langlands landscape.
//
// Curve  E : y² + y = x³ − x²  (conductor 11)
// Form   f = q·∏(1−qⁿ)²(1−q¹¹ⁿ)²  (the weight-2 newform of level 11)
// For every prime p ≠ 11:  a_p = p + 1 − #E(𝔽_p) = [q^p] f,  |a_p| ≤ 2√p (Hasse 1933).
//
// The Langlands cover-note quotation is transcribed from the letter as
// published by the IAS (publications.ias.edu/rpl/paper/43).

/* =========================================================================
   Pure computational core. Self-contained functions (no captured state, no
   DOM) so they can be verified under node AND serialized into a Worker.
   ========================================================================= */

// a_p for E: y² + y = x³ − x², via point counting over F_p (good primes).
// p = 2 by direct enumeration; odd p via the quadratic character:
// completing the square, y² + y = c has 1 + χ(4c+1) solutions in y,
// so a_p = −Σ_x χ(4x³ − 4x² + 1). O(p) time, exact for all p < 2^26.
function apFromCount(p) {
  if (p === 2) {
    let n = 0;
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        if ((y * y + y) % 2 === (((x * x * x - x * x) % 2) + 2) % 2) n++;
      }
    }
    return 2 + 1 - (n + 1); // affine points + point at infinity
  }
  const sq = new Uint8Array(p);
  const half = (p - 1) / 2;
  for (let y = 0; y <= half; y++) sq[(y * y) % p] = 1;
  let s = 0;
  for (let x = 0; x < p; x++) {
    const c = (((x * x) % p) * ((x + p - 1) % p)) % p; // x²(x−1) mod p
    const t = (4 * c + 1) % p;
    if (t !== 0) s += sq[t] ? 1 : -1;
  }
  return -s;
}

// #E(F_p) including the point at infinity (naive count — the honest a_p
// relation p + 1 − #E holds only at good primes p ≠ 11).
function pointCount(p) {
  return p + 1 - apFromCount(p);
}

// All affine solutions (x, y) of y² + y ≡ x³ − x² (mod p), sorted by x.
function affineSolutions(p) {
  const byVal = new Map();
  for (let y = 0; y < p; y++) {
    const v = (y * y + y) % p;
    let arr = byVal.get(v);
    if (!arr) byVal.set(v, (arr = []));
    arr.push(y);
  }
  const pts = [];
  for (let x = 0; x < p; x++) {
    const c = (((x * x) % p) * ((x + p - 1) % p)) % p;
    const ys = byVal.get(c);
    if (ys) for (const y of ys) pts.push([x, y]);
  }
  return pts;
}

// Coefficients a_0..a_N of f = q·∏(1−qⁿ)²(1−q¹¹ⁿ)².
// Route: Euler's pentagonal number theorem gives ∏(1−qⁿ) sparsely; square it
// by sparse convolution to get A = ∏(1−qⁿ)²; then ∏(1−q¹¹ⁿ)² = A(q¹¹), so
// a_{n} = [q^{n−1}] A(q)·A(q¹¹). Exact small integers throughout.
function etaCoefficients(N) {
  const E = new Array(N + 1).fill(0);
  E[0] = 1;
  for (let k = 1; ; k++) {
    const g1 = (k * (3 * k - 1)) / 2;
    const g2 = (k * (3 * k + 1)) / 2;
    if (g1 > N) break;
    const s = k % 2 === 1 ? -1 : 1;
    E[g1] += s;
    if (g2 <= N) E[g2] += s;
  }
  const idx = [];
  for (let i = 0; i <= N; i++) if (E[i] !== 0) idx.push(i);
  const A = new Array(N + 1).fill(0);
  for (const i of idx) {
    for (const j of idx) {
      if (i + j <= N) A[i + j] += E[i] * E[j];
    }
  }
  const f = new Array(N + 1).fill(0);
  for (let i = 0; 11 * i <= N - 1; i++) {
    const b = A[i];
    if (!b) continue;
    const base = 11 * i;
    for (let j = 0; base + j <= N - 1; j++) {
      if (A[j]) f[base + j + 1] += b * A[j];
    }
  }
  return f;
}

// In-place multiply of a truncated power series c (indices 0..N) by
// (1 − 2qⁿ + q²ⁿ) = (1 − qⁿ)². Descending index so lower terms stay clean.
// This is the "watch it happen" route; _test proves it matches the fast one.
function multFactor(c, n, N) {
  for (let i = N; i >= n; i--) {
    let v = c[i] - 2 * c[i - n];
    if (i >= 2 * n) v += c[i - 2 * n];
    c[i] = v;
  }
}

function sievePrimes(limit) {
  const s = new Uint8Array(limit + 1);
  const out = [];
  for (let i = 2; i <= limit; i++) {
    if (!s[i]) {
      out.push(i);
      for (let j = i * i; j <= limit; j += i) s[j] = 1;
    }
  }
  return out;
}

// The exhibit's own referee: recompute a_p BOTH ways for every prime below
// `limit`, assert exact equality (p ≠ 11), the four anchors, the Hasse bound,
// agreement of the two product routes, and the bad-prime story at 11.
function selfTest(limit = 1000) {
  const primes = sievePrimes(limit - 1);
  const a = etaCoefficients(limit);
  const anchors = { 2: -2, 3: -1, 5: 1, 7: -2 };
  let checked = 0;
  for (const p of primes) {
    if (p === 11) continue;
    const viaCount = apFromCount(p);
    const viaForm = a[p];
    if (viaCount !== viaForm) {
      throw new Error(`mirror breaks at p=${p}: count says ${viaCount}, coefficient says ${viaForm}`);
    }
    if (Math.abs(viaCount) > 2 * Math.sqrt(p)) {
      throw new Error(`Hasse bound violated at p=${p}: |${viaCount}| > 2*sqrt(${p})`);
    }
    if (anchors[p] !== undefined && viaCount !== anchors[p]) {
      throw new Error(`anchor failed: a_${p} = ${viaCount}, expected ${anchors[p]}`);
    }
    if (pointCount(p) !== p + 1 - viaCount) throw new Error(`pointCount inconsistent at p=${p}`);
    checked++;
  }
  // The two product routes (pentagonal-sparse vs factor-by-factor) agree.
  const N = 200;
  const c = new Array(N + 1).fill(0);
  c[0] = 1;
  for (let n = 1; n <= N; n++) {
    multFactor(c, n, N);
    if (n % 11 === 0) multFactor(c, n, N);
  }
  for (let k = 1; k <= N; k++) {
    if (c[k - 1] !== a[k]) throw new Error(`product routes disagree at q^${k}: ${c[k - 1]} vs ${a[k]}`);
  }
  // The bad prime, honestly: 10 affine points, a node at (8,5), a_11 = 1.
  if (affineSolutions(11).length !== 10) throw new Error('p=11: affine count is not 10');
  if ((5 * 5 + 5) % 11 !== ((8 * 8 * 8 - 8 * 8) % 11 + 11) % 11) throw new Error('p=11: node (8,5) not on curve');
  if (a[11] !== 1) throw new Error(`a_11 = ${a[11]}, expected 1`);
  return { primesChecked: checked, upTo: limit, a2: a[2], a3: a[3], a5: a[5], a7: a[7], a11: a[11] };
}

export const _test = { apFromCount, pointCount, affineSolutions, etaCoefficients, multFactor, sievePrimes, selfTest };

/* ========================================================================= */

const PRIMES = sievePrimes(997); // the 168 primes below 1000
const MONO = 'ui-monospace, Menlo, monospace';

export default {
  id: 'rosetta',
  movement: 3,
  title: 'The Rosetta Stone',
  hook: 'Two number streams from unrelated universes agree at every prime, forever — and explaining why took three and a half centuries.',
  prose: `
    <p>Here are two computations with no visible right to know each other. The first is a
    child's game: pick a prime <em>p</em> and count the pairs of remainders mod <em>p</em>
    that satisfy <code>y² + y = x³ − x²</code> — brute arithmetic, one candidate at a time.
    Record how far the count falls from expectation: the number
    <code>a_p = p + 1 − #E(𝔽_p)</code>, which Hasse proved in 1933 can never stray beyond
    <code>2√p</code>. The second computation lives in a different universe. Take the infinite
    product <code>q·∏(1−qⁿ)²(1−q¹¹ⁿ)²</code>, multiply it out term by term — pure bookkeeping
    with exponents, no curve in sight — and read off the coefficient of <code>qᵖ</code>.</p>
    <p>The claim, which you should refuse to believe until this page has shown you: the two
    numbers are <em>equal</em>. At every prime except 11, forever. Count points on a cubic, or
    expand a product that has never heard of the cubic — the same integers fall out, −2, −1,
    1, −2, one per prime, without exception. This is an instance of the <em>modularity
    theorem</em>: every elliptic curve over ℚ is modular, proved for semistable curves by
    Wiles and Taylor in 1995 — the engine inside the proof of Fermat's Last Theorem — and
    completed by Breuil, Conrad, Diamond and Taylor in 2001. The mirror below lets you verify
    prime after prime; the theorem covers all infinitely many at a single stroke, which is
    the difference between checking and knowing.</p>
    <p>Why anyone dared to look for such a mirror is a story about analogy. In the spring of
    1940, in a military prison in Rouen, André Weil wrote a long letter to his sister, the
    philosopher Simone Weil, describing his Rosetta stone: three languages — number fields,
    function fields, Riemann surfaces — that he believed were carrying one text, so that a
    theorem legible in any column could be sought in the others. In 1967 Robert Langlands
    handed a seventeen-page letter to Weil proposing how far the translation might reach:
    the Galois representations of arithmetic on one side, the automorphic forms of harmonic
    analysis on the other. His cover note ended: <em>"If you are willing to read it as pure
    speculation I would appreciate that; if not — I am sure you have a waste basket
    handy."</em></p>
    <p>Notice which word arrived: <em>harmonic</em>. That is not a poetic flourish.
    Automorphic forms <em>are</em> harmonic analysis — set <code>q = e^{2πiz}</code> and the
    product above becomes a Fourier series on the upper half-plane; the numbers
    <code>a_p</code> are literally its Fourier coefficients. When you pulled a vibrating
    string apart into its partials in the last movement, you were using the same mathematics
    that here reads the solution-counts of a cubic equation out of a spectrum. Langlands
    reciprocity says this is the general situation: the arithmetic of equations is encoded
    in generalized harmonics — Movement II, one abstraction level up.</p>
    <p>The full program remains conjecture, and the map in this exhibit draws the honest
    boundaries: class field theory — the GL(1) province — settled a century ago; modularity,
    a GL(2) province, the bridge you are standing on; the function-field world for GL(n),
    proved by Drinfeld and Lafforgue; and in 2024 a new span — the geometric Langlands conjecture, in its
    de Rham, categorical form, proved by Gaitsgory, Raskin and collaborators in five papers
    running to roughly a thousand pages. One exhibit ago the busy beavers said mathematics
    has walls no theory can cross. The mirror says it also has tunnels no one dug — this one
    took three and a half centuries, Fermat's margin to the modularity theorem, to explain.
    Both are facts, and the tension between them is the honest state of the field.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const SANS = getComputedStyle(document.body).fontFamily;

    // ---------- scoped style ----------
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-rosetta .ros-panel { display:none; margin-top:.7rem; padding:.8rem 1rem;
        background:${P.panel}; border:1px solid ${P.line}; border-left:3px solid ${P.gold};
        color:${P.inkDim}; font-size:.92rem; line-height:1.6; }
      #ex-rosetta .ros-panel h4 { color:${P.ink}; font-size:.95rem; margin:0 0 .35rem;
        font-weight:600; letter-spacing:.04em; }
      #ex-rosetta .ros-panel .ros-status { font-family:${MONO}; font-size:.78rem;
        color:${P.inkFaint}; margin-bottom:.45rem; }
      #ex-rosetta .ros-panel em { color:${P.gold}; }
    `;
    stage.appendChild(styleEl);

    // ---------- state ----------
    const aForm = etaCoefficients(1024);   // our own coefficients of f, once
    let view = 'mirror';
    let needsRedraw = true;
    let primeIdx = 5;                       // start at p = 13
    let data = null;                        // curve data for current prime
    let revL = 0, revR = 0;                 // reveal fraction, each side
    let runL = false, runR = false;         // animating?
    let poly = null, polyN = 0;             // live product state (right side)
    let locked = false;                     // both sides revealed for this prime
    let lockFlash = 0;
    let chartMax = 4;
    const matched = new Map();              // p -> a_p, every mirror-match so far
    let questDone = false;

    let scheduler = null, sweeping = false;
    let sweepQueue = [];

    // Sato–Tate
    const ST_LIMIT = 50000, ST_BINS = 40;
    const stBins = new Uint32Array(ST_BINS);
    let stCount = 0, stMaxP = 0, stNext = 0, stTotal = 0;
    let stWorker = null, stRunning = false, stDone = false;

    // audio
    const bus = audio.createBus('rosetta');
    let vL = null, vR = null, voicesOn = false;
    let timers = [];

    // ---------- layout ----------
    const tabs = ui.controlRow(stage);
    const tabBtns = {};
    tabBtns.mirror = ui.button(tabs, 'the mirror', () => setView('mirror'));
    tabBtns.sato = ui.button(tabs, 'Sato–Tate', () => setView('sato'));
    tabBtns.map = ui.button(tabs, 'the map', () => setView('map'));

    const handle = cv.setupCanvas(stage, { height: 500 });
    handle.onResize(() => { needsRedraw = true; });

    const rowMirror = ui.controlRow(stage);
    const primeStep = ui.stepper(rowMirror, {
      label: 'prime p', min: 0, max: PRIMES.length - 1, value: primeIdx,
      format: (i) => String(PRIMES[i]),
      onChange: (i) => { primeIdx = i; setPrime(); },
    });
    const bothBtn = ui.button(rowMirror, '⟡ hold up the mirror', () => { startLeft(); startRight(); }, { primary: true });
    const countBtn = ui.button(rowMirror, 'just count', () => startLeft(), { small: true });
    const multBtn = ui.button(rowMirror, 'just multiply', () => startRight(), { small: true });
    const sweepBtn = ui.button(rowMirror, '▶ run the primes', toggleSweep);

    const rowSato = ui.controlRow(stage);
    const stBtn = ui.button(rowSato, '▶ count every prime below 50,000', toggleSato, { primary: true });

    const rowMap = ui.controlRow(stage);
    const mapResetBtn = ui.button(rowMap, 'recenter the map', () => {
      pz.scale = fitScale(); pz.x = 0; pz.y = -10; needsRedraw = true;
    }, { small: true });

    const info = ui.readout(stage, '');
    const mapPanel = document.createElement('div');
    mapPanel.className = 'ros-panel';
    stage.appendChild(mapPanel);

    const quest = ui.questBanner(stage,
      'Break the mirror: find one prime — any prime — where the count and the coefficient disagree.');
    ui.mathline(stage,
      'a<sub>p</sub> = p + 1 − #E(𝔽<sub>p</sub>) &nbsp;=&nbsp; [q<sup>p</sup>]&thinsp;q·∏(1−q<sup>n</sup>)²(1−q<sup>11n</sup>)²' +
      ' &nbsp;&nbsp;<span style="color:' + P.inkFaint + '">(every prime p ≠ 11 · |a<sub>p</sub>| ≤ 2√p)</span>');
    ui.caption(stage,
      'Three views. <em>The mirror</em>: left, the solutions of y²+y = x³−x² over 𝔽<sub>p</sub>, counted; ' +
      'right, the infinite product, multiplied; between them, the agreement. <em>Sato–Tate</em>: the statistics ' +
      'of every mirror-match below 50,000, converging to sin²θ — a theorem materializing out of your own ' +
      'point-counts (proved for such curves by Taylor and collaborators, 2008–2011). <em>The map</em>: the ' +
      'Langlands landscape — bridges standing, under construction, and one dotted ferry. Nothing here is faked; ' +
      'both sides always compute.');
    ui.legendPanel(stage,
      '<p>“There are five elementary operations in mathematics: addition, subtraction, multiplication, ' +
      'division — and modular forms.” The quip is usually attributed to Martin Eichler, but no one has ever ' +
      'produced the place he said it, and it wanders between attributions the way good lines do. ' +
      'Mathematicians repeat it anyway, because the exhibit above is what it feels like when the fifth ' +
      'operation works.</p>');
    ui.speculationPanel(stage,
      '<p>In 2006 Kapustin and Witten derived the geometric Langlands correspondence from ' +
      '<em>S-duality</em> — the electric–magnetic symmetry of N = 4 supersymmetric Yang–Mills theory. ' +
      'It is physics-grade reasoning: breathtaking, precise, and not a theorem. Our map draws it as a dotted ' +
      'ferry line, a bridge under construction from the far shore. And one step further out: whether the ' +
      'Langlands correspondence means that arithmetic and analysis are two shadows of a single undiscovered ' +
      'object is not mathematics yet — it is the direction several roads point.</p>');

    // ---------- per-prime data ----------
    function curveData(p) {
      const pts = affineSolutions(p);
      let chiPrefix = null;
      if (p > 2) {
        const sq = new Uint8Array(p);
        for (let y = 0; y <= (p - 1) / 2; y++) sq[(y * y) % p] = 1;
        chiPrefix = new Int32Array(p + 1);
        for (let x = 0; x < p; x++) {
          const c = (((x * x) % p) * ((x + p - 1) % p)) % p;
          const t = (4 * c + 1) % p;
          chiPrefix[x + 1] = chiPrefix[x] + (t === 0 ? 0 : sq[t] ? 1 : -1);
        }
      }
      return {
        p, pts, chiPrefix,
        ap: p === 11 ? null : apFromCount(p),   // honest recipe only at good primes
        sing: p === 11 ? [8, 5] : null,
      };
    }

    function setPrime() {
      stopAnims();
      const p = PRIMES[primeIdx];
      data = curveData(p);
      const known = matched.has(p);
      revL = known ? 1 : 0;
      revR = known ? 1 : 0;
      locked = known;
      poly = null; polyN = 0; lockFlash = 0;
      chartMax = 4;
      for (let k = 1; k <= p; k++) chartMax = Math.max(chartMax, Math.abs(aForm[k]));
      updateInfo();
      needsRedraw = true;
    }

    function finalAp() { return data.ap !== null ? data.ap : aForm[data.p]; }
    const animDur = (p) => 1.3 + 2.3 * (p / 997);
    function fOf(v) {
      const W = 2 * Math.sqrt(data.p);
      return 392 * Math.pow(2, math.clamp(v / W, -1, 1) * 7 / 12);
    }

    // ---------- audio ----------
    function ensureVoices() {
      if (vL) return;
      vL = audio.voice(bus, { type: 'sine', freq: 392, level: 0.16, pan: -0.4 });
      vR = audio.voice(bus, { type: 'triangle', freq: 392, level: 0.12, pan: 0.4 });
    }
    function fadeVoicesSoon(s) {
      timers.push(setTimeout(() => {
        if (vL) vL.off();
        if (vR) vR.off();
        voicesOn = false;
      }, s * 1000));
    }
    function silenceVoices() {
      if (vL) vL.off();
      if (vR) vR.off();
      voicesOn = false;
    }

    // ---------- the mirror: animations ----------
    function startLeft() {
      if (sweeping) return;
      audio.ensureAudio();
      ensureVoices();
      revL = 0; runL = true; locked = false;
      voicesOn = true; vL.on();
      updateInfo(); needsRedraw = true;
    }
    function startRight() {
      if (sweeping) return;
      audio.ensureAudio();
      ensureVoices();
      const p = data.p;
      poly = new Array(p).fill(0); poly[0] = 1; polyN = 0;
      revR = 0; runR = true; locked = false;
      voicesOn = true; vR.on();
      updateInfo(); needsRedraw = true;
    }
    function stopAnims() {
      runL = false; runR = false;
      silenceVoices();
    }

    function finishSide(side) {
      if (side === 'L' && vL && voicesOn) vL.setFreq(fOf(finalAp()));
      if (side === 'R' && vR && voicesOn) vR.setFreq(fOf(finalAp()));
      if (revL >= 1 && revR >= 1) {
        if (!locked) doLock();
      } else if (!runL && !runR) {
        fadeVoicesSoon(1.1); // only one side was run; let its hum settle out
      }
    }

    function doLock() {
      locked = true;
      lockFlash = 1.8;
      const p = data.p;
      const actx = audio.getContext();
      if (data.ap !== null) {
        if (data.ap === aForm[p]) {
          matched.set(p, data.ap);
          if (actx) {
            const t = actx.currentTime + 0.03;
            const f = fOf(data.ap);
            audio.playTone(bus, { freq: f, dur: 0.5, level: 0.34, pan: -0.4, when: t });
            audio.playTone(bus, { freq: f, dur: 0.5, level: 0.3, type: 'triangle', pan: 0.4, when: t });
            audio.playTone(bus, { freq: f * 1.5, dur: 0.7, level: 0.18, when: t + 0.16 });
          }
          questCheck();
        } else {
          // selfTest proves this branch unreachable; honesty demands it exist.
          info.set('THE MIRROR CRACKED at p = ' + p + ' — which is impossible; this is a bug, not mathematics.');
        }
      } else if (actx) {
        audio.drums.thock(bus, actx.currentTime + 0.02, { level: 0.5 }); // the bad prime thuds
      }
      fadeVoicesSoon(0.7);
      updateInfo();
      needsRedraw = true;
    }

    function questCheck() {
      if (!questDone && matched.size >= 25) {
        questDone = true;
        quest.done(matched.size + ' primes mirrored, zero cracks — and there are none to find. ' +
          'Modularity covers every prime at once; that is what was proved in 1995–2001.');
      }
    }

    // ---------- the sweep ----------
    function toggleSweep() {
      if (sweeping) { stopSweep(); return; }
      audio.ensureAudio();
      stopAnims();
      sweeping = true;
      sweepBtn.textContent = '■ stop the sweep';
      let i = 0;
      scheduler = audio.createScheduler((t) => {
        if (i >= PRIMES.length) {
          sweepQueue.push({ i: -1, at: t });
          return null;
        }
        const p = PRIMES[i];
        if (p === 11) {
          audio.drums.rim(bus, t, { level: 0.4 });
        } else {
          const ap = apFromCount(p);
          const f = 392 * Math.pow(2, (ap / (2 * Math.sqrt(p))) * 7 / 12);
          audio.playTone(bus, { freq: f, dur: 0.15, level: 0.28, pan: -0.45, when: t });
          audio.playTone(bus, { freq: f, dur: 0.15, level: 0.24, type: 'triangle', pan: 0.45, when: t });
        }
        sweepQueue.push({ i, at: t });
        i++;
        return t + Math.max(0.06, 0.5 * Math.pow(0.964, i));
      });
      scheduler.start();
    }
    function stopSweep() {
      if (scheduler) { scheduler.stop(); scheduler = null; }
      sweeping = false;
      sweepQueue = [];
      sweepBtn.textContent = '▶ run the primes';
    }
    function showPrimeInstant(i) {
      primeIdx = i;
      primeStep.set(i);
      const p = PRIMES[i];
      data = curveData(p);
      revL = 1; revR = 1; locked = true; poly = null; polyN = 0;
      chartMax = 4;
      for (let k = 1; k <= p; k++) chartMax = Math.max(chartMax, Math.abs(aForm[k]));
      if (data.ap !== null) { matched.set(p, data.ap); lockFlash = 0.5; }
      updateInfo();
      questCheck();
      needsRedraw = true;
    }
    function finishSweep() {
      stopSweep();
      info.set('All ' + PRIMES.length + ' primes below 1,000 swept — ' + matched.size +
        ' mirror-matches, zero disagreements (11 excused: see it in the stepper).');
    }

    // ---------- Sato–Tate ----------
    function absorbPairs(pairs, next, done) {
      let sumCos = 0, n = 0;
      for (let j = 0; j + 1 < pairs.length; j += 2) {
        const p = pairs[j], ap = pairs[j + 1];
        if (Math.abs(ap) > 2 * Math.sqrt(p)) {
          info.set('Hasse bound violated at p = ' + p + ' — impossible; this is a bug.');
          continue;
        }
        const c = math.clamp(ap / (2 * Math.sqrt(p)), -1, 1);
        stBins[Math.min(ST_BINS - 1, Math.floor((Math.acos(c) / Math.PI) * ST_BINS))]++;
        stCount++; stMaxP = p; sumCos += c; n++;
      }
      stNext = next;
      const actx = audio.getContext();
      if (n && actx && stRunning) {
        // a soft geiger tick per batch, pitched by the batch's mean angle
        audio.playTone(bus, {
          freq: 520 * Math.pow(2, (sumCos / n) * 5 / 12),
          dur: 0.05, level: 0.12, when: actx.currentTime + 0.01,
        });
      }
      if (done) {
        stDone = true; stRunning = false;
        stBtn.textContent = '↺ run it again';
        if (stWorker) { stWorker.terminate(); stWorker = null; }
        if (actx) {
          const t = actx.currentTime + 0.05;
          audio.playTone(bus, { freq: 523.25, dur: 0.5, level: 0.3, when: t });
          audio.playTone(bus, { freq: 784, dur: 0.8, level: 0.22, when: t + 0.14 });
        }
      }
      needsRedraw = true;
    }

    function workerSource() {
      return "'use strict';\n" +
        'const apFromCount = ' + apFromCount.toString() + ';\n' +
        'self.onmessage = function (e) {\n' +
        '  const from = e.data.from, limit = e.data.limit;\n' +
        '  const sieve = new Uint8Array(limit + 1);\n' +
        '  const primes = [];\n' +
        '  for (let i = 2; i <= limit; i++) if (!sieve[i]) { primes.push(i); for (let j = i * i; j <= limit; j += i) sieve[j] = 1; }\n' +
        '  let batch = [];\n' +
        '  for (let k = from; k < primes.length; k++) {\n' +
        '    const p = primes[k];\n' +
        '    if (p === 11) continue;\n' +
        '    batch.push(p, apFromCount(p));\n' +
        '    if (batch.length >= 400) { postMessage({ pairs: batch, next: k + 1, done: false }); batch = []; }\n' +
        '  }\n' +
        '  postMessage({ pairs: batch, next: primes.length, done: true });\n' +
        '};\n';
    }

    function toggleSato() {
      audio.ensureAudio();
      if (stRunning) { // pause
        stRunning = false;
        if (stWorker) { stWorker.terminate(); stWorker = null; }
        stBtn.textContent = '▶ resume the count';
        updateInfo(); needsRedraw = true;
        return;
      }
      if (stDone) { // reset & rerun
        stBins.fill(0); stCount = 0; stMaxP = 0; stNext = 0; stDone = false;
      }
      if (!stTotal) stTotal = sievePrimes(ST_LIMIT - 1).length - 1; // minus the bad prime
      stRunning = true;
      stBtn.textContent = '❚❚ pause the count';
      // guard: Workers absent (node, exotic embeds) -> chunked main-thread fallback
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        mainThreadSato();
        updateInfo();
        return;
      }
      try {
        const url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
        stWorker = new Worker(url);
        URL.revokeObjectURL(url);
        stWorker.onmessage = (e) => {
          if (!stRunning && !e.data.done) return; // late batch after pause
          absorbPairs(e.data.pairs, e.data.next, e.data.done);
          updateInfo();
        };
        stWorker.onerror = () => {
          if (stWorker) { stWorker.terminate(); stWorker = null; }
          mainThreadSato(); // fall back rather than fail
        };
        stWorker.postMessage({ from: stNext, limit: ST_LIMIT - 1 });
      } catch (err) {
        stWorker = null;
        mainThreadSato();
      }
      updateInfo();
      needsRedraw = true;
    }

    function mainThreadSato() {
      const primes = sievePrimes(ST_LIMIT - 1);
      const step = () => {
        if (!stRunning) return;
        const end = Math.min(stNext + 80, primes.length);
        const pairs = [];
        let k = stNext;
        for (; k < end; k++) {
          const p = primes[k];
          if (p === 11) continue;
          pairs.push(p, apFromCount(p));
        }
        absorbPairs(pairs, end, end >= primes.length);
        updateInfo();
        if (end < primes.length && stRunning) timers.push(setTimeout(step, 0));
      };
      step();
    }

    // ---------- the map ----------
    const fitScale = () => math.clamp(handle.width / 640, 0.5, 2);
    const pz = new cv.PanZoom(handle, {
      scale: 1, x: 0, y: -10, minScale: 0.3, maxScale: 5,
      onChange: () => { needsRedraw = true; },
    });
    pz.scale = fitScale();
    let unbindPan = null;
    let selBridge = -1;

    // world coords, y up; Arithmetic west, Harmonic Analysis east
    const BRIDGES = [
      {
        name: 'class field theory', status: 'standing · Artin 1927', kind: 'built', y: 120,
        html: '<h4>Class field theory — the oldest span</h4><div class="ros-status">standing · GL(1) · ' +
          'Hilbert → Takagi → Artin, 1927</div>The GL(1) province, and the program’s ancestor: the abelian ' +
          'extensions of a number field are governed by the arithmetic of the field itself, and every ' +
          'reciprocity law since Gauss’s quadratic one folds into Artin’s. A century of traffic has ' +
          'crossed this bridge; it is settled territory, and Langlands’s conjectures are what it looks ' +
          'like continued beyond the abelian world.',
      },
      {
        name: 'modularity', status: 'standing · 1995–2001', kind: 'built', y: 60, pin: true,
        html: '', // filled at click time: includes the visitor's own match count
      },
      {
        name: 'function fields', status: 'standing · Lafforgue 2002', kind: 'built', y: 0,
        html: '<h4>Function fields — Weil’s middle column</h4><div class="ros-status">standing · GL(n) · ' +
          'Drinfeld, then L. Lafforgue, 2002</div>Over function fields — where numbers behave like polynomials ' +
          'over a finite field — the full correspondence for GL(n) is a theorem: Drinfeld built GL(2), and ' +
          'Laurent Lafforgue completed GL(n) in 2002. The middle language of Weil’s Rosetta stone is the ' +
          'one we now read fluently, which is precisely why he put it in the middle: close enough to geometry ' +
          'to be provable, close enough to arithmetic to matter.',
      },
      {
        name: 'geometric Langlands', status: 'opened 2024', kind: 'new', y: -60,
        html: '<h4>Geometric Langlands — the newest span</h4><div class="ros-status">opened 2024 · de Rham, ' +
          'categorical form</div>In 2024 the geometric Langlands conjecture — the de Rham, categorical form of ' +
          'the correspondence, set over Riemann surfaces rather than number fields — was proved by Dennis ' +
          'Gaitsgory, Sam Raskin and their collaborators: five papers, roughly a thousand pages. It is the ' +
          'third column of the Rosetta stone answering back, and the largest single span raised anywhere on ' +
          'this map in a generation.',
      },
      {
        name: 'functoriality', status: 'under construction', kind: 'construction', y: -120,
        html: '<h4>Functoriality — the great unbuilt span</h4><div class="ros-status">under construction · ' +
          'conjectural in general</div>Langlands’s functoriality conjecture — that maps between dual ' +
          'groups transfer automorphic forms between groups — is the load-bearing arch of the whole program, ' +
          'and it remains open in general. Piers stand in the water: cyclic base change, endoscopy resting on ' +
          'Ngô’s proof of the fundamental lemma (Fields Medal, 2010). The deck between them is not ' +
          'there yet. Everything else on this map would follow from it.',
      },
      {
        name: 'Kapustin–Witten', status: 'physics ferry · 2006', kind: 'ferry', y: -180,
        html: '<h4>Kapustin–Witten — the physics ferry</h4><div class="ros-status">dotted line · 2006 · ' +
          'not a theorem</div>In 2006 Kapustin and Witten derived geometric Langlands duality from ' +
          '<em>S-duality</em> — the electric–magnetic symmetry of N = 4 supersymmetric Yang–Mills theory. ' +
          'The reasoning is physics-grade: exact in its own terms, unproved in ours. The ferry runs, and ' +
          'passengers report the far shore is real; the mathematicians are still inspecting the hull. A ' +
          'bridge under construction from the other side of the water.',
      },
    ];
    const CITIES = [
      { x: -175, y: 95, t: 'Gal(ℚ̄/ℚ)' },
      { x: -195, y: 20, t: 'y²+y = x³−x²' },
      { x: -170, y: -55, t: 'Frobenius' },
      { x: -185, y: -130, t: 'ζ, L-functions' },
      { x: 150, y: 95, t: 'the upper half-plane' },
      { x: 170, y: 20, t: 'q·∏(1−qⁿ)²(1−q¹¹ⁿ)²' },
      { x: 160, y: -55, t: 'Hecke operators' },
      { x: 175, y: -130, t: 'spectra' },
    ];
    let bridgeScreens = []; // sampled screen polylines for hit-testing

    function modularityHtml() {
      const n = matched.size;
      return '<h4>Modularity — the bridge you stood on</h4><div class="ros-status">standing · a GL(2) ' +
        'province · Wiles–Taylor 1995, Breuil–Conrad–Diamond–Taylor 2001</div>Every elliptic curve over ℚ is ' +
        'modular: its point-counts are the Fourier coefficients of a modular form. Wiles and Taylor raised the ' +
        'semistable half in 1995 — enough to carry Fermat’s Last Theorem across — and Breuil, Conrad, ' +
        'Diamond and Taylor finished the deck in 2001. <em>You stood here: ' +
        (n > 0 ? n + ' prime' + (n === 1 ? '' : 's') + ' mirrored by your own machine.' :
          'hold up the mirror in the first view, then come back.') + '</em>';
    }

    function bridgeEnds(b) { return { ax: -92, bx: 92, y: b.y }; }

    function mapClickAt(sx, sy) {
      let best = -1, bestD = 20;
      for (let i = 0; i < bridgeScreens.length; i++) {
        const pts = bridgeScreens[i];
        for (let j = 0; j < pts.length; j += 2) {
          const dx = pts[j] - sx, dy = pts[j + 1] - sy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0) {
        selBridge = best;
        const b = BRIDGES[best];
        mapPanel.innerHTML = b.pin ? modularityHtml() : b.html;
        mapPanel.style.borderLeftColor =
          b.kind === 'new' ? P.azure : b.kind === 'ferry' ? P.crimson :
          b.kind === 'construction' ? P.inkFaint : P.gold;
        mapPanel.style.display = 'block';
        needsRedraw = true;
      }
    }

    let downX = 0, downY = 0;
    const onDown = (e) => { downX = e.clientX; downY = e.clientY; };
    const onUp = (e) => {
      if (view !== 'map') return;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) return;
      const [sx, sy] = cv.pointerPos(handle, e);
      mapClickAt(sx, sy);
    };
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointerup', onUp);

    // ---------- view switching ----------
    function setView(v) {
      view = v;
      for (const k of Object.keys(tabBtns)) tabBtns[k].classList.toggle('active', k === v);
      rowMirror.style.display = v === 'mirror' ? '' : 'none';
      rowSato.style.display = v === 'sato' ? '' : 'none';
      rowMap.style.display = v === 'map' ? '' : 'none';
      mapPanel.style.display = (v === 'map' && selBridge >= 0) ? 'block' : 'none';
      if (v !== 'mirror' && sweeping) stopSweep();
      if (v !== 'mirror') stopAnims();
      if (v === 'map' && !unbindPan) unbindPan = pz.bind();
      if (v !== 'map' && unbindPan) { unbindPan(); unbindPan = null; }
      updateInfo();
      needsRedraw = true;
    }

    function updateInfo() {
      if (view === 'mirror') {
        const p = data.p;
        if (p === 11) {
          info.set('p = 11 — the conductor, the one bad prime. Mod 11 the curve degenerates: 10 affine ' +
            'solutions, one of them a node at (8, 5) where the curve crosses itself. Discard the node, keep ' +
            'the 9 smooth points and ∞: 10 = 11 − a₁₁ gives a₁₁ = 1 — and the coefficient of q¹¹ is 1. ' +
            'Even the bad prime whispers the right number, through a finer recipe.');
        } else if (locked) {
          info.set('p = ' + p + ' · #E(𝔽_' + p + ') = ' + (p + 1 - data.ap) + ' points (with ∞) · both roads: ' +
            'a_p = ' + data.ap + ' · window |a_p| ≤ 2√' + p + ' = ' + (2 * Math.sqrt(p)).toFixed(1) +
            ' · ' + matched.size + ' prime' + (matched.size === 1 ? '' : 's') + ' mirrored so far');
        } else {
          info.set('p = ' + p + ' · left road: count solutions of y²+y = x³−x² over 𝔽_' + p +
            ' · right road: multiply the product out to q^' + p + ' · they have never met');
        }
      } else if (view === 'sato') {
        if (stCount === 0 && !stRunning) {
          info.set('Every mirror-match makes an angle: cos θ_p = a_p ⁄ 2√p. Count all ' +
            (stTotal || 5132) + ' good primes below 50,000 and watch their angles pile into sin² — ' +
            'the Sato–Tate distribution, a theorem about the statistics of ALL primes.');
        } else {
          info.set('θ_p = arccos(a_p ⁄ 2√p) · counted ' + stCount.toLocaleString('en-US') +
            (stTotal ? ' of ' + stTotal.toLocaleString('en-US') : '') + ' good primes' +
            (stMaxP ? ' · reached p = ' + stMaxP.toLocaleString('en-US') : '') +
            (stDone ? ' · done — the histogram is a theorem (Taylor et al., 2008–2011)' :
              stRunning ? ' · counting…' : ' · paused'));
        }
      } else {
        info.set('Two continents, one strait. Drag to pan, scroll to zoom, click a bridge to read its story. ' +
          'Solid spans are theorems; the dashed span is under construction; the dotted line is a physics ferry.');
      }
    }

    /* ---------- drawing: the mirror ---------- */

    function drawMirror(ctx, W, H, dt) {
      const p = data.p;

      // advance animations
      if (runL) {
        revL = Math.min(1, revL + dt / animDur(p));
        if (data.chiPrefix && vL && voicesOn) {
          vL.setFreq(fOf(-data.chiPrefix[Math.floor(revL * p)]));
        }
        if (revL >= 1) { runL = false; finishSide('L'); }
        needsRedraw = true;
      }
      if (runR) {
        revR = Math.min(1, revR + dt / animDur(p));
        const targetN = Math.floor(revR * (p - 1));
        while (polyN < targetN) {
          polyN++;
          multFactor(poly, polyN, p - 1);
          if (polyN % 11 === 0) multFactor(poly, polyN, p - 1);
        }
        if (vR && voicesOn && p > 2) vR.setFreq(fOf(poly[p - 1]));
        if (revR >= 1) { runR = false; finishSide('R'); }
        needsRedraw = true;
      }

      // layout
      const stripH = 106;
      const topH = H - stripH - 12;
      const S = Math.min(topH - 52, W * 0.36);
      const gx = 14, gy = 30;
      const cw = Math.max(120, W * 0.16);
      const rx = gx + S + cw, ry = gy;
      const rw = Math.max(60, W - rx - 14), rh = S;

      drawGrid(ctx, gx, gy, S);
      drawChart(ctx, rx, ry, rw, rh);
      drawCenter(ctx, gx + S, cw, gy, S);
      drawHasse(ctx, 14, H - stripH, W - 28, stripH - 6);
    }

    function drawGrid(ctx, x0, y0, S) {
      const p = data.p;
      const cell = S / p;
      ctx.font = '11px ' + MONO;
      ctx.fillStyle = P.inkDim;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('the curve over 𝔽_' + p, x0, y0 - 8);
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, S, S);

      const limit = revL >= 1 ? p : Math.floor(revL * p);

      // the curve's own mirror: y ↔ −1−y
      if (limit > 0 && p > 2) {
        const ym = y0 + S - ((p - 1) / 2 + 0.5) * cell;
        ctx.strokeStyle = P.line;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(x0, ym); ctx.lineTo(x0 + S, ym); ctx.stroke();
        ctx.setLineDash([]);
      }

      // scan line
      if (runL && limit < p) {
        ctx.strokeStyle = P.azure;
        ctx.beginPath();
        ctx.moveTo(x0 + limit * cell + cell / 2, y0);
        ctx.lineTo(x0 + limit * cell + cell / 2, y0 + S);
        ctx.stroke();
      }

      // solutions
      const dot = Math.max(1.4, cell * 0.62);
      ctx.fillStyle = P.gold;
      let shown = 0;
      for (let i = 0; i < data.pts.length; i++) {
        const q = data.pts[i];
        if (q[0] >= limit) break;
        ctx.fillRect(x0 + q[0] * cell + (cell - dot) / 2, y0 + S - (q[1] + 1) * cell + (cell - dot) / 2, dot, dot);
        shown++;
      }
      // the node at the bad prime
      if (data.sing && data.sing[0] < limit) {
        const sxp = x0 + data.sing[0] * cell + cell / 2;
        const syp = y0 + S - (data.sing[1] + 1) * cell + cell / 2;
        ctx.strokeStyle = P.crimson;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(sxp, syp, Math.max(4, dot), 0, math.TAU); ctx.stroke();
        ctx.fillStyle = P.crimson;
        ctx.font = '10px ' + MONO;
        ctx.fillText('node', sxp + 7, syp - 6);
        ctx.lineWidth = 1;
      }

      // under-grid tally
      ctx.font = '11px ' + MONO;
      ctx.fillStyle = runL ? P.azure : P.inkFaint;
      let tally;
      if (revL >= 1) {
        tally = data.pts.length + ' affine + 1 at ∞ = ' + (data.pts.length + 1) + ' points';
      } else if (runL) {
        tally = 'x = ' + limit + '/' + p + ' · ' + shown + ' pts' +
          (data.chiPrefix ? ' · Σχ = ' + data.chiPrefix[limit] : '');
      } else {
        tally = p + '×' + p + ' residues wait to be counted';
      }
      ctx.fillText(tally, x0, y0 + S + 16);
    }

    function drawChart(ctx, rx, ry, rw, rh) {
      const p = data.p;
      ctx.font = '11px ' + MONO;
      ctx.fillStyle = P.inkDim;
      ctx.textAlign = 'left';
      ctx.fillText('the product, out to q^' + p, rx, ry - 8);
      ctx.strokeStyle = P.line;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);

      const started = revR > 0 || runR;
      if (!started) {
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'center';
        ctx.fillText('q·∏(1−qⁿ)²(1−q¹¹ⁿ)²', rx + rw / 2, ry + rh / 2 - 8);
        ctx.fillText('— unmultiplied —', rx + rw / 2, ry + rh / 2 + 10);
        ctx.textAlign = 'left';
        return;
      }

      const mid = ry + rh / 2;
      const bw = rw / p;
      const scaleY = (rh / 2 - 6) / chartMax;
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(rx, mid + 0.5); ctx.lineTo(rx + rw, mid + 0.5); ctx.stroke();

      const live = revR < 1 && poly;
      const finalK = revR >= 1 ? p : polyN + 1;
      for (let k = 1; k <= p; k++) {
        const v = live ? poly[k - 1] : aForm[k];
        if (!v) continue;
        const h = math.clamp(v, -chartMax, chartMax) * scaleY;
        ctx.fillStyle = k === p ? P.goldBright : k <= finalK ? P.azure : P.inkFaint;
        const barW = Math.max(1, bw * 0.8);
        ctx.fillRect(rx + (k - 1) * bw + (bw - barW) / 2, Math.min(mid, mid - h), barW, Math.max(1, Math.abs(h)));
      }
      // marker at q^p
      const mx = rx + (p - 1) * bw + bw / 2;
      ctx.strokeStyle = P.goldDim;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(mx, ry); ctx.lineTo(mx, ry + rh); ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '11px ' + MONO;
      ctx.fillStyle = runR ? P.azure : P.inkFaint;
      const sub = revR >= 1
        ? 'coefficients locked through q^' + p
        : 'multiplying factor (1 − q^' + Math.max(1, polyN) + ')² · ' + polyN + ' of ' + (p - 1);
      ctx.fillText(sub, rx, ry + rh + 16);
    }

    function drawCenter(ctx, cx0, cw, gy, S) {
      const p = data.p;
      const cx = cx0 + cw / 2;
      ctx.textAlign = 'center';

      // left road's number (arithmetic — gold)
      ctx.font = '10px ' + MONO;
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('by counting', cx, gy + S * 0.18);
      ctx.font = '20px ' + MONO;
      ctx.fillStyle = P.gold;
      let leftTxt = '···';
      if (revL >= 1) leftTxt = data.ap !== null ? String(data.ap) : '1*';
      else if (runL && data.chiPrefix) leftTxt = String(-data.chiPrefix[Math.floor(revL * p)]) + '?';
      ctx.fillText(leftTxt, cx, gy + S * 0.18 + 24);

      // the glyph
      const isLocked = locked && revL >= 1 && revR >= 1;
      ctx.font = '30px ' + SANS;
      if (isLocked) {
        ctx.fillStyle = P.goldBright;
        ctx.shadowColor = P.gold;
        ctx.shadowBlur = 16 * Math.min(1, lockFlash);
        ctx.fillText('=', cx, gy + S * 0.55);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = P.inkFaint;
        ctx.fillText('≟', cx, gy + S * 0.55);
      }

      // right road's number (harmonic — azure)
      ctx.font = '10px ' + MONO;
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('[q^' + p + '] of the product', cx, gy + S * 0.72);
      ctx.font = '20px ' + MONO;
      ctx.fillStyle = P.azure;
      let rightTxt = '···';
      if (revR >= 1) rightTxt = String(aForm[p]);
      else if (runR && poly) rightTxt = String(poly[p - 1]) + '?';
      ctx.fillText(rightTxt, cx, gy + S * 0.72 + 24);

      ctx.font = '10px ' + MONO;
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('|a_p| ≤ 2√p = ' + (2 * Math.sqrt(p)).toFixed(1), cx, gy + S + 16);
      if (data.ap === null && revL >= 1) {
        ctx.fillStyle = P.crimson;
        ctx.fillText('*finer recipe — see below', cx, gy + S * 0.18 + 40);
      }
      ctx.textAlign = 'left';
    }

    function drawHasse(ctx, hx, hy, hw, hh) {
      const pMax = 1000;
      const aMax = 2 * Math.sqrt(pMax) * 1.05;
      const X = (p) => hx + (p / pMax) * hw;
      const Y = (a) => hy + hh / 2 - (a / aMax) * (hh / 2 - 4);

      ctx.strokeStyle = P.line;
      ctx.strokeRect(hx + 0.5, hy + 0.5, hw, hh);
      ctx.beginPath(); ctx.moveTo(hx, Y(0) + 0.5); ctx.lineTo(hx + hw, Y(0) + 0.5); ctx.stroke();

      // Hasse envelope ±2√p
      ctx.strokeStyle = P.azureDim;
      ctx.setLineDash([4, 4]);
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        for (let p = 0; p <= pMax; p += 12) {
          const y = Y(sgn * 2 * Math.sqrt(p));
          p === 0 ? ctx.moveTo(X(p), y) : ctx.lineTo(X(p), y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // matched primes
      ctx.fillStyle = P.gold;
      for (const [p, ap] of matched) {
        ctx.fillRect(X(p) - 1.25, Y(ap) - 1.25, 2.5, 2.5);
      }
      // the bad prime: hollow crimson at the form's a_11 = 1
      ctx.strokeStyle = P.crimson;
      ctx.beginPath(); ctx.arc(X(11), Y(1), 3, 0, math.TAU); ctx.stroke();

      // current prime marker
      ctx.strokeStyle = P.goldDim;
      ctx.beginPath(); ctx.moveTo(X(data.p) + 0.5, hy); ctx.lineTo(X(data.p) + 0.5, hy + hh); ctx.stroke();

      ctx.font = '10px ' + MONO;
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('the Hasse window: every a_p lives between ±2√p · ' + matched.size + ' mirrored', hx + 6, hy + 12);
      ctx.textAlign = 'right';
      ctx.fillText('p →  1000', hx + hw - 6, hy + hh - 6);
      ctx.textAlign = 'left';
    }

    /* ---------- drawing: Sato–Tate ---------- */

    function drawSato(ctx, W, H) {
      const hx = 56, hy = 40, hw = W - 112, hh = H - 130;
      ctx.strokeStyle = P.line;
      ctx.strokeRect(hx + 0.5, hy + 0.5, hw, hh);

      // expected curve values & vertical scale
      const dTheta = Math.PI / ST_BINS;
      let yMax = 8;
      const expected = new Array(ST_BINS);
      for (let i = 0; i < ST_BINS; i++) {
        const th = (i + 0.5) * dTheta;
        expected[i] = stCount * (2 / Math.PI) * Math.sin(th) * Math.sin(th) * dTheta;
        yMax = Math.max(yMax, expected[i], stBins[i]);
      }
      const bw = hw / ST_BINS;

      // bars: the visitor's own point-counts
      ctx.fillStyle = P.gold;
      for (let i = 0; i < ST_BINS; i++) {
        if (!stBins[i]) continue;
        const h = (stBins[i] / yMax) * (hh - 8);
        ctx.fillRect(hx + i * bw + 1, hy + hh - h, bw - 2, h);
      }
      // the theorem's curve
      if (stCount > 0) {
        ctx.strokeStyle = P.azure;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < ST_BINS; i++) {
          const y = hy + hh - (expected[i] / yMax) * (hh - 8);
          const x = hx + (i + 0.5) * bw;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      ctx.font = '11px ' + MONO;
      ctx.fillStyle = P.inkDim;
      ctx.textAlign = 'center';
      ctx.fillText('0', hx, hy + hh + 16);
      ctx.fillText('π/2', hx + hw / 2, hy + hh + 16);
      ctx.fillText('π', hx + hw, hy + hh + 16);
      ctx.fillText('θ_p = arccos( a_p ⁄ 2√p )', hx + hw / 2, hy + hh + 34);
      ctx.fillStyle = P.azure;
      ctx.textAlign = 'right';
      ctx.fillText('(2/π)·sin²θ — Sato–Tate', hx + hw - 8, hy + 16);
      ctx.fillStyle = P.inkDim;
      ctx.fillText(stCount.toLocaleString('en-US') + ' primes', hx + hw - 8, hy + 32);
      ctx.textAlign = 'left';
      if (stCount === 0) {
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'center';
        ctx.fillText('press play: 5,000+ point-counts will pile up here', hx + hw / 2, hy + hh / 2);
        ctx.textAlign = 'left';
      }
    }

    /* ---------- drawing: the map ---------- */

    function coastPath(ctx, cx, cy, rx, ry, seed) {
      const K = 44;
      ctx.beginPath();
      for (let i = 0; i <= K; i++) {
        const a = (i % K) / K * math.TAU;
        const wob = 1 + 0.07 * Math.sin(seed + a * 3) + 0.05 * Math.sin(seed * 2.3 + a * 7) +
          0.03 * Math.sin(seed * 4.1 + a * 11);
        const wx = cx + Math.cos(a) * rx * wob;
        const wy = cy + Math.sin(a) * ry * wob;
        i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
      }
      ctx.closePath();
    }

    function drawMap(ctx, W, H) {
      bridgeScreens = [];
      const sc = pz.scale;

      // world-space pass (y up)
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(sc, -sc);
      ctx.translate(-pz.x, -pz.y);

      // continents
      ctx.fillStyle = P.panel;
      ctx.lineWidth = 1.5 / sc;
      coastPath(ctx, -205, -30, 115, 235, 3.1);
      ctx.fill();
      ctx.strokeStyle = P.goldDim; ctx.stroke();
      coastPath(ctx, 205, -30, 115, 235, 8.7);
      ctx.fill();
      ctx.strokeStyle = P.azureDim; ctx.stroke();

      // cities
      ctx.fillStyle = P.inkFaint;
      for (const c of CITIES) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2 / sc, 0, math.TAU);
        ctx.fill();
      }

      // bridges
      for (let i = 0; i < BRIDGES.length; i++) {
        const b = BRIDGES[i];
        const { ax, bx, y } = bridgeEnds(b);
        const color = b.kind === 'new' ? P.azure : b.kind === 'ferry' ? P.crimson :
          b.kind === 'construction' ? P.inkFaint : P.gold;
        if (i === selBridge) {
          ctx.strokeStyle = color + '44';
          ctx.lineWidth = 9 / sc;
          ctx.beginPath();
          ctx.moveTo(ax, y);
          ctx.quadraticCurveTo(0, y + 22, bx, y);
          ctx.stroke();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = (b.kind === 'new' ? 2.6 : 2.2) / sc;
        if (b.kind === 'construction') ctx.setLineDash([8 / sc, 7 / sc]);
        else if (b.kind === 'ferry') ctx.setLineDash([1.5 / sc, 7 / sc]);
        ctx.beginPath();
        ctx.moveTo(ax, y);
        ctx.quadraticCurveTo(0, y + 22, bx, y);
        ctx.stroke();
        ctx.setLineDash([]);
        // ports
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(ax, y, 2.6 / sc, 0, math.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(bx, y, 2.6 / sc, 0, math.TAU); ctx.fill();
        // screen samples for hit-testing
        const samples = [];
        for (let t = 0; t <= 1.0001; t += 1 / 16) {
          const wx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * 0 + t * t * bx;
          const wy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y + 22) + t * t * y;
          const s = pz.worldToScreen(wx, wy);
          samples.push(s[0], s[1]);
        }
        bridgeScreens.push(samples);
      }
      ctx.restore();

      // screen-space labels
      ctx.textAlign = 'center';
      const [c1x, c1y] = pz.worldToScreen(-205, 175);
      const [c2x, c2y] = pz.worldToScreen(205, 175);
      ctx.font = '600 13px ' + SANS;
      ctx.fillStyle = P.ink;
      ctx.fillText('A R I T H M E T I C', c1x, c1y);
      ctx.fillText('H A R M O N I C   A N A L Y S I S', c2x, c2y);
      ctx.font = '10px ' + MONO;
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('equations · Galois groups', c1x, c1y + 15);
      ctx.fillText('automorphic forms · spectra', c2x, c2y + 15);

      for (const c of CITIES) {
        const s = pz.worldToScreen(c.x, c.y);
        ctx.fillStyle = P.inkFaint;
        ctx.font = '10px ' + MONO;
        ctx.fillText(c.t, s[0], s[1] - 6);
      }

      for (let i = 0; i < BRIDGES.length; i++) {
        const b = BRIDGES[i];
        const m = pz.worldToScreen(0, b.y + 11);
        const color = b.kind === 'new' ? P.azure : b.kind === 'ferry' ? P.crimson :
          b.kind === 'construction' ? P.inkDim : P.gold;
        ctx.fillStyle = i === selBridge ? P.ink : color;
        ctx.font = (i === selBridge ? '600 ' : '') + '12px ' + SANS;
        ctx.fillText(b.name, m[0], m[1] - 8);
        ctx.fillStyle = P.inkFaint;
        ctx.font = '9px ' + MONO;
        ctx.fillText(b.status, m[0], m[1] + 6);
        if (b.pin && matched.size > 0) {
          const pm = pz.worldToScreen(0, b.y + 24);
          ctx.fillStyle = P.goldBright;
          ctx.font = '10px ' + MONO;
          ctx.fillText('⚑ you stood here — ' + matched.size + ' primes', pm[0], pm[1] - 10);
        }
      }
      ctx.textAlign = 'left';
    }

    /* ---------- main loop ---------- */

    function draw(dt) {
      // consume audio-clock events first (sweep visuals follow the sound)
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      while (sweepQueue.length && sweepQueue[0].at <= now + 0.02) {
        const e = sweepQueue.shift();
        if (e.i < 0) { finishSweep(); break; }
        showPrimeInstant(e.i);
      }
      if (lockFlash > 0) { lockFlash = Math.max(0, lockFlash - dt); needsRedraw = true; }

      if (!needsRedraw && !runL && !runR) return;
      needsRedraw = false;

      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      if (view === 'mirror') drawMirror(ctx, W, H, dt);
      else if (view === 'sato') drawSato(ctx, W, H);
      else drawMap(ctx, W, H);
    }

    const loop = cv.rafLoop(draw);

    // ---------- boot ----------
    data = curveData(PRIMES[primeIdx]);
    setPrime();
    setView('mirror');
    loop.start();

    // ---------- lifecycle ----------
    function clearTimers() {
      for (const t of timers) clearTimeout(t);
      timers = [];
    }
    return {
      pause() {
        loop.stop();
        stopSweep();
        silenceVoices();
        clearTimers();
        if (stWorker) { stWorker.terminate(); stWorker = null; }
        if (stRunning) { stRunning = false; stBtn.textContent = '▶ resume the count'; }
        bus.mute();
      },
      resume() {
        bus.unmute();
        needsRedraw = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopSweep();
        clearTimers();
        if (stWorker) { stWorker.terminate(); stWorker = null; }
        if (vL) { vL.dispose(); vR.dispose(); vL = vR = null; }
        if (unbindPan) { unbindPan(); unbindPan = null; }
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointerup', onUp);
        bus.dispose();
        handle.destroy();
        styleEl.remove();
      },
    };
  },
};
