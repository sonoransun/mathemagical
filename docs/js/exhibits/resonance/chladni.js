// II.4 — Chladni Figures
// A driven square plate: sand walks down the vibration gradient and assembles
// on the nodal lines of the very eigenfunction you are hearing. Strike the
// plate for an inharmonic clang; then Kac's question, answered by the
// Gordon–Webb–Wolpert isospectral propellers.
//
// Mode shapes use the classic square-plate shorthand
//   w(x,y) = cos(mπx)cos(nπy) + s·cos(nπx)cos(mπy),  s = ±1,  (x,y) ∈ [0,1]²
// with modal frequency ∝ m² + n² (stiff-plate scaling). The prose is honest
// that true free-edge Chladni modes need the biharmonic equation solved
// numerically; this is the standard analytic approximation.
//
// GWW drum outlines and spectra: verified against
//   - Gordon–Webb–Wolpert 1992 (Invent. Math. 110) via Wikipedia,
//   - C. Moler, "Can One Hear the Shape of a Drum? Part 1" (MathWorks, 2012):
//     polygon coordinates drum1 = [0 0 2 2 3 2 1 1; 0 1 3 2 2 1 1 0],
//     drum2 = [1 0 0 2 2 3 2 1; 0 1 2 2 3 2 1 1], and the twenty computed
//     eigenvalues below (the two drums' computed lists agree to ~13 digits;
//     the theorem says the true spectra agree exactly). Both drums here are
//     given the SAME partial set — that identity is the theorem, not our fudge.

const PI = Math.PI;
const F_SCALE = 40;          // Hz per unit of m²+n²  → (1,1) sounds at 80 Hz
const MAXM = 6;              // catalog spans 1 ≤ m ≤ 6, 0 ≤ n ≤ m
const FLO = 70, FHI = 2960;  // slider range, Hz (log-mapped)

/* ---------------- pure algorithmic core (node-testable) ---------------- */

// Degenerate-pair mode shape on the unit square.
function modeW(x, y, m, n, s = 1) {
  return Math.cos(m * PI * x) * Math.cos(n * PI * y)
       + s * Math.cos(n * PI * x) * Math.cos(m * PI * y);
}

// Analytic gradient of modeW — the sand needs it every frame.
function modeGrad(x, y, m, n, s = 1) {
  const cmx = Math.cos(m * PI * x), smx = Math.sin(m * PI * x);
  const cnx = Math.cos(n * PI * x), snx = Math.sin(n * PI * x);
  const cmy = Math.cos(m * PI * y), smy = Math.sin(m * PI * y);
  const cny = Math.cos(n * PI * y), sny = Math.sin(n * PI * y);
  return [
    -m * PI * smx * cny - s * n * PI * snx * cmy,
    -n * PI * cmx * sny - s * m * PI * cnx * smy,
  ];
}

const modeK = (m, n) => m * m + n * n;          // the ordering number
const modeFreq = (m, n) => F_SCALE * modeK(m, n);

// Every (m,n) with 1 ≤ m ≤ MAXM, 0 ≤ n ≤ m, audible on the slider.
// Sorted by m²+n² — i.e. by frequency; ties (e.g. 25 = 4²+3² = 5²+0²) are
// genuine degeneracies of the square and blend together at that frequency.
function buildCatalog() {
  const cat = [];
  for (let m = 1; m <= MAXM; m++)
    for (let n = 0; n <= m; n++) {
      const k = modeK(m, n);
      if (k * F_SCALE < FLO) continue;          // (1,0) sits below audibility
      cat.push({ m, n, k, f: F_SCALE * k });
    }
  cat.sort((a, b) => a.k - b.k || a.m - b.m);
  return cat;
}

// Lorentzian resonance response of every mode to a drive frequency.
function resonanceWeights(f, catalog) {
  const weights = catalog.map((e) => {
    const hw = Math.max(6, e.f * 0.03);         // half-width ~ Q ≈ 17
    const d = (f - e.f) / hw;
    return 1 / (1 + d * d);
  });
  let best = 0;
  for (let i = 1; i < weights.length; i++) if (weights[i] > weights[best]) best = i;
  return { weights, best, res: weights[best] };
}

// A strike at (px,py): each mode is excited in proportion to its displacement
// there; stiffer (higher-k) modes couple less. Degenerate signs fall randomly.
function strikeExcitation(px, py, catalog, rand = Math.random) {
  const out = [];
  for (const e of catalog) {
    const s = e.m === e.n ? 1 : (rand() < 0.5 ? -1 : 1);
    const a = Math.abs(modeW(px, py, e.m, e.n, s)) * Math.pow(2 / e.k, 0.35);
    out.push({ m: e.m, n: e.n, s, k: e.k, f: e.f, a });
  }
  out.sort((a, b) => b.a - a.a);
  const top = out.slice(0, 8);
  const mx = top.length ? top[0].a : 0;
  if (mx < 1e-9) return [];
  for (const e of top) e.a /= mx;
  return top;
}

// slider position (0..1) ↔ frequency, log-mapped
const tToF = (t) => FLO * Math.pow(FHI / FLO, t);
const fToT = (f) => Math.log(f / FLO) / Math.log(FHI / FLO);

/* ------------- Gordon–Webb–Wolpert data (verified — see header) ------------- */

// Two isospectral "propellers", each a union of 7 half-unit right triangles
// (area 7/2). Vertices exactly as published.
const DRUM_A = [[0, 0], [0, 1], [2, 3], [2, 2], [3, 2], [2, 1], [1, 1], [1, 0]];
const DRUM_B = [[1, 0], [0, 1], [0, 2], [2, 2], [2, 3], [3, 2], [2, 1], [1, 1]];
// Display-only triangulation hints: each drum contains exactly two full unit
// squares; splitting each along a diagonal exhibits the 7 congruent triangles.
const DRUM_A_DIAGS = [[[0, 0], [1, 1]], [[1, 1], [2, 2]]];
const DRUM_B_DIAGS = [[[0, 1], [1, 2]], [[1, 1], [2, 2]]];

// First 20 Dirichlet–Laplacian eigenvalues on these polygons, computed
// numerically (Moler 2012, MATLAB eigs on a finite-difference grid). The two
// drums' computed columns agree to ~13 digits; GWW's theorem says exactly.
const GWW_EIGS = [
  10.165879621248989, 14.630600866993412, 20.717633982094981,
  26.115126153750705, 28.983478457829740, 36.774063407607322,
  42.283017757114585, 46.034233949715308, 49.213425509524733,
  52.126973962396342, 57.063486161172904, 63.350675017756465,
  67.491111510445251, 70.371453210957910, 75.709992784621988,
  83.153242199788906, 84.673734481953971, 88.554340162610174,
  94.230337192953158, 97.356922250794767,
];

function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/* ------------------------------- the exhibit ------------------------------- */

export default {
  id: 'chladni',
  movement: 2,
  title: 'Chladni Figures',
  hook: 'Sand finds the silence inside a sound.',
  prose: `
    <p>In 1787 Ernst Chladni published a book of figures nobody had ever seen before.
    He scattered fine sand across a brass plate, drew a violin bow down its edge, and
    watched the grains leap away from wherever the metal shivered and gather wherever it
    stood still. A plate ringing at a single pitch divides itself into regions swinging
    up and down in opposition, and the boundaries between them — the <em>nodal lines</em> —
    do not move at all. The sand is not decoration; it is a measurement. What settles on
    the plate is a portrait of the tone itself: the eigenfunction of the frequency you
    are hearing, drawn by the sound's own hand. Sweep the slider below and the tone
    swells each time it finds a resonance, while the sand walks into the figure that
    frequency owns; click the plate to strike it instead.</p>
    <p>For a square plate there is a classical shorthand for these figures:
    <code>w(x,y) = cos mπx·cos nπy ± cos nπx·cos mπy</code>. A single cosine product
    would only ever draw a rectangular grid — but the modes <code>(m,n)</code> and
    <code>(n,m)</code> vibrate at the same frequency, and a degenerate pair is free to
    superpose, so the plate folds its grids into diagonals, crosses and stars. (The pair
    <code>(1,2)+(2,1)</code>, for instance, vanishes along the whole anti-diagonal — try
    it in the mode panel, then flip the <code>±</code> and watch the figure reflect.)
    Honesty requires a caveat Chladni's century learned slowly: a real free-edged plate
    obeys the biharmonic equation <code>∇⁴w = k⁴w</code>, which admits no closed-form
    modes and must be solved numerically. The cosine figures are the classic
    approximation — the right shorthand, not the last word.</p>
    <p>Now listen rather than look. The plate's resonances fall at frequencies
    proportional to <code>m² + n²</code>: a ladder that goes ×2, ×4, ×5, ×8, ×9, ×10,
    ×13 of a base — never the string's tidy 1, 2, 3, 4. The monochord's integer overtone
    ladder turns out to be an arithmetic miracle of one dimension, and this exhibit is
    the counterexample: in two dimensions the eigenvalues are sums of squares, and no
    common fundamental survives. That is <em>why</em> strings sing and plates clang —
    harmonic partials fuse into a single pitch, inharmonic ones shimmer and beat, and
    bell-founders spend their lives grinding metal to drag stubborn partials toward
    harmony. The geometry of the resonator is the timbre.</p>
    <p>In 1966 Mark Kac asked the century's most charming question about all this:
    <em>can one hear the shape of a drum?</em> A drum's overtones are the eigenvalues of
    its shape, and much of the shape is genuinely audible — Hermann Weyl showed in 1911
    that the high overtones count its area, finer asymptotics recover its perimeter, and
    a smoothly-bounded drum even confesses how many holes it has. Yet in 1992 Carolyn
    Gordon, David Webb and Scott Wolpert produced two propeller-shaped polygons, each
    glued from seven half-square triangles, that are visibly different and yet share
    <em>exactly</em> the same spectrum — every frequency, every multiplicity. Strike
    them both below and try to tell them apart. You cannot, and the failure is not
    yours: it is a theorem. The answer to Kac is no — and the deeper lesson of this
    whole movement is how much of a shape a sound already is.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const catalog = buildCatalog();

    /* ---------- state ---------- */
    let driveOn = false;
    let driveF = modeFreq(2, 1);                 // start near the (2,1) mode
    let preferredSign = 1;                       // ± of the degenerate twin
    let driveField = [];                         // [{m,n,s,a}] from resonance blend
    let driveRes = 0;                            // 0..1 response at driveF
    let strike = null;                           // {t0, clock, modes:[{m,n,s,a,tau}]}
    let strikeFx = null;                         // {x,y,t0} ring visual (plate px)
    let kacStrike = null;                        // {drum, x, y, t0, parts:[{f,end}]}
    let liveVoices = 0;                          // concurrent strike partials (cap 24)
    let questDone = false;

    const bus = audio.createBus('chladni');
    let sweep = null;                            // sustained drive voice

    /* ---------- trig lookup tables (sand physics) ---------- */
    const TRES = 1024;
    const cosT = [], sinT = [];
    for (let k = 0; k <= MAXM; k++) {
      const c = new Float32Array(TRES + 1), s = new Float32Array(TRES + 1);
      for (let i = 0; i <= TRES; i++) {
        c[i] = Math.cos((k * PI * i) / TRES);
        s[i] = Math.sin((k * PI * i) / TRES);
      }
      cosT.push(c); sinT.push(s);
    }
    const ti = (x) => Math.max(0, Math.min(TRES, (x * TRES) | 0));

    /* ---------- sand ---------- */
    const NP = 3000;
    const sx = new Float32Array(NP), sy = new Float32Array(NP);
    function scatterSand() {
      for (let i = 0; i < NP; i++) { sx[i] = Math.random(); sy[i] = Math.random(); }
    }
    scatterSand();

    /* ---------- layout & DOM ---------- */
    const handle = cv.setupCanvas(stage, { height: 470 });
    const controls = ui.controlRow(stage);

    const driveBtn = ui.button(controls, '⏻ drive the plate', toggleDrive, { primary: true });
    const freqSlider = ui.slider(controls, {
      label: 'drive frequency', min: 0, max: 1, step: 0.001, value: fToT(driveF),
      format: (t) => `${Math.round(tToF(t))} Hz`,
      onInput: (t) => applyFrequency(tToF(t)),
    });
    const modeSel = ui.select(controls, {
      label: 'jump to mode (m,n)',
      options: catalog.map((e, i) => ({ value: String(i), label: `(${e.m},${e.n}) · ${e.f} Hz` })),
      value: String(catalog.findIndex((e) => e.m === 2 && e.n === 1)),
      onChange: (v) => {
        const e = catalog[parseInt(v, 10)];
        freqSlider.set(fToT(e.f));
        applyFrequency(e.f);
      },
    });
    const signBtn = ui.button(controls, '± flip the twin', () => {
      preferredSign = -preferredSign;
      signBtn.classList.toggle('active', preferredSign < 0);
      applyFrequency(driveF);
    }, { small: true });
    ui.button(controls, 'scatter the sand', () => { scatterSand(); }, { small: true });

    const formula = ui.mathline(stage, '');
    const info = ui.readout(stage, '');
    const quest = ui.questBanner(stage,
      'Hunt the resonances: sweep until the sand snaps into a figure — somewhere in the ' +
      'lower octaves hides a square balanced on its corner.');
    ui.caption(stage,
      'One sine drives the plate; near each modal frequency the response swells and 3,000 grains ' +
      'walk down the amplitude gradient toward the nodal lines. Click the plate to strike it — many ' +
      'modes at once, the stiffer ones dying faster, the survivor claiming the sand. Right: the ' +
      'partial ladders of a string (gold, evenly spaced) and of this plate (blue, ∝ m²+n²) drawn on ' +
      'one axis. The cosine shapes are the classic square-plate shorthand; free-edge figures ' +
      'properly require the biharmonic equation <code>∇⁴w = k⁴w</code>, solved numerically.');

    ui.legendPanel(stage,
      `<p>When Chladni demonstrated his sand figures in Paris, Napoleon was in the audience,
      and in February 1809 the Académie — at the Emperor's instigation — announced a prize of
      3,000 francs for a mathematical theory of the vibrating plate. The contest had exactly
      one entrant. Sophie Germain, self-taught because the École Polytechnique admitted no
      women, submitted three times; her first attempt faltered, Lagrange (a judge) repaired
      the governing equation her analysis pointed to, and in 1816, on the third submission,
      she took the prize — the first woman awarded one by the Paris Academy. The equation for
      these figures was, quite literally, summoned out of a plate of dancing sand.</p>`,
      'the prize on the plate');

    // --- Kac / GWW section ---
    ui.mathline(stage, '« Can one hear the shape of a drum ? » — Mark Kac, 1966');
    const handle2 = cv.setupCanvas(stage, { height: 250 });
    const kacInfo = ui.readout(stage, 'two different drums, one spectrum — click either to strike it');
    ui.caption(stage,
      'The Gordon–Webb–Wolpert polygons (1992), drawn to their published coordinates: each is ' +
      'seven half-square triangles, area 7⁄2, and they are not congruent. The partials you hear — ' +
      'the first twelve of twenty computed eigenvalues — come from a numerical computation of the ' +
      'Laplace spectrum on these exact polygons ' +
      '(Moler 2012; the two computed lists agree to thirteen digits). Both drums are given the ' +
      '<em>same</em> set, because their equality is the theorem — the spectra of these two shapes ' +
      'agree exactly, frequency for frequency.');

    /* ---------- drive field & audio ---------- */
    function computeDriveField(f) {
      const { weights, best, res } = resonanceWeights(f, catalog);
      const field = [];
      for (let i = 0; i < catalog.length; i++) {
        if (weights[i] < 0.04) continue;
        const e = catalog[i];
        field.push({ m: e.m, n: e.n, s: e.m === e.n ? 1 : preferredSign, a: weights[i] });
      }
      field.sort((a, b) => b.a - a.a);
      return { field: field.slice(0, 6), best, res };
    }

    function applyFrequency(f) {
      driveF = f;
      const { field, best, res } = computeDriveField(f);
      driveField = field; driveRes = res;
      const e = catalog[best];
      if (driveOn && sweep) {
        sweep.setFreq(f, 0.06);
        sweep.on(0.06 + 0.3 * res);
      }
      // formula of the nearest mode
      const s = e.m === e.n ? 1 : preferredSign;
      formula.innerHTML = e.m === e.n
        ? `w(x,y) = 2·cos ${e.m}πx·cos ${e.m}πy&ensp;·&ensp;f ∝ m²+n² = ${e.k}`
        : `w(x,y) = cos ${e.m}πx·cos ${e.n}πy ${s > 0 ? '+' : '−'} cos ${e.n}πx·cos ${e.m}πy` +
          `&ensp;·&ensp;f ∝ m²+n² = ${e.k}`;
      const twins = catalog.filter((c) => c.k === e.k);
      info.set(
        `f = ${Math.round(f)} Hz · nearest mode (${e.m},${e.n}) at ${e.f} Hz · response ${(res * 100).toFixed(0)}%` +
        (twins.length > 1 ? ` · degeneracy: ${twins.map((c) => `(${c.m},${c.n})`).join(' and ')} share m²+n² = ${e.k}` : ''));
      if (!questDone && driveOn && res > 0.92 && e.m === 2 && e.n === 0) {
        questDone = true;
        quest.done('Found it: mode (2,0) at 160 Hz — sand at rest on the lines x ± y = ½. ' +
          'Every other resonance on this slider is a different theorem about where a square plate can be still.');
      }
    }

    function toggleDrive() {
      audio.ensureAudio();
      driveOn = !driveOn;
      driveBtn.classList.toggle('active', driveOn);
      driveBtn.textContent = driveOn ? '⏻ still the plate' : '⏻ drive the plate';
      if (driveOn) {
        if (!sweep) sweep = audio.voice(bus, { freq: driveF, level: 0, attack: 0.09, release: 0.2 });
        sweep.setFreq(driveF, 0.02);
        sweep.on(0.06 + 0.3 * driveRes);
      } else if (sweep) {
        sweep.off();
      }
      applyFrequency(driveF);
    }

    // playTone with a concurrency cap; chains playTone's own cleanup.
    function pooledTone(opts) {
      if (liveVoices >= 24) return;
      liveVoices++;
      const osc = audio.playTone(bus, opts);
      const prev = osc.onended;
      osc.onended = (ev) => { liveVoices--; if (prev) prev.call(osc, ev); };
    }

    const nowClock = () => {
      const c = audio.getContext();
      return (c && c.state === 'running')
        ? { t: () => c.currentTime }
        : { t: () => performance.now() / 1000 };
    };

    /* ---------- striking the plate ---------- */
    function strikePlate(px, py) {
      audio.ensureAudio();
      const modes = strikeExcitation(px, py, catalog);
      if (!modes.length) return;
      const clock = nowClock();
      const t0 = clock.t();
      const withTau = modes.map((e) => {
        const tau = 2.4 * Math.pow(2 / e.k, 0.55);          // stiff modes die fast
        return { ...e, tau, ph: Math.random() * math.TAU };
      });
      strike = { t0, clock, modes: withTau };
      strikeFx = { x: px, y: py, t0, clock };
      const at = bus.context.currentTime + 0.02;
      audio.drums.rim(bus, at, { level: 0.22 });
      for (const e of withTau) {
        pooledTone({
          freq: e.f, when: at, dur: e.tau, attack: 0.005,
          release: e.tau * 0.9, level: 0.34 * Math.pow(e.a, 0.9),
        });
      }
    }

    /* ---------- striking a GWW drum ---------- */
    const KAC_BASE = 190;                                    // Hz for √λ₁
    function strikeDrum(which, wx, wy) {
      audio.ensureAudio();
      const clock = nowClock();
      const t0 = clock.t();
      const at = bus.context.currentTime + 0.02;
      audio.drums.thock(bus, at, { level: 0.32 });
      const parts = [];
      for (let i = 0; i < 12; i++) {
        const f = KAC_BASE * Math.sqrt(GWW_EIGS[i] / GWW_EIGS[0]);
        const tau = Math.min(2.4, Math.max(0.5, 2.2 * Math.sqrt(GWW_EIGS[0] / GWW_EIGS[i])));
        const a = 0.3 / (1 + 0.45 * i);
        pooledTone({ freq: f, when: at, dur: tau, attack: 0.006, release: tau * 0.9, level: a });
        parts.push({ i, f, end: t0 + tau + 0.3 });
      }
      kacStrike = { drum: which, x: wx, y: wy, t0, clock, parts };
      kacInfo.set(
        `drum ${which === 0 ? 'A' : 'B'} struck — the same computed spectrum belongs to both ` +
        `drums (λ₁…λ₂₀ agree to thirteen digits numerically; exactly, by the 1992 theorem)`);
    }

    /* ---------- pointer handling ---------- */
    let plateRect = { x: 0, y: 0, s: 1 };                    // set during draw
    const onPlateClick = (e) => {
      const [mx, my] = cv.pointerPos(handle, e);
      const { x, y, s } = plateRect;
      if (mx < x || my < y || mx > x + s || my > y + s) return;
      strikePlate((mx - x) / s, (my - y) / s);
    };
    handle.canvas.addEventListener('pointerdown', onPlateClick);
    handle.canvas.style.cursor = 'pointer';

    let kacLayout = null;                                    // set during draw
    const onKacClick = (e) => {
      if (!kacLayout) return;
      const [mx, my] = cv.pointerPos(handle2, e);
      for (let d = 0; d < 2; d++) {
        const L = kacLayout[d];
        const wx = (mx - L.ox) / L.sc, wy = 3 - (my - L.oy) / L.sc;
        if (pointInPolygon(wx, wy, d === 0 ? DRUM_A : DRUM_B)) { strikeDrum(d, wx, wy); return; }
      }
    };
    handle2.canvas.addEventListener('pointerdown', onKacClick);
    handle2.canvas.style.cursor = 'pointer';

    /* ---------- physics ---------- */
    const ETA = 0.55, JIT = 0.011;
    function activeModes() {
      const act = [];
      if (driveOn) {
        const gain = 0.3 + 0.7 * driveRes;
        for (const e of driveField) act.push({ m: e.m, n: e.n, s: e.s, a: e.a * gain });
      }
      if (strike) {
        const age = strike.clock.t() - strike.t0;
        if (age > 3.6) strike = null;
        else {
          for (const e of strike.modes) {
            // decay in step with the audio; slow phase drift = interference shimmer
            const env = e.a * Math.exp(-age / e.tau);
            if (env < 0.02) continue;
            act.push({ m: e.m, n: e.n, s: e.s, a: env * Math.cos((math.TAU * e.f * age) / 60 + e.ph) });
          }
        }
      }
      return act;
    }

    function stepSand(act, dt) {
      const K = act.length;
      const dtn = Math.min(dt, 0.033) * 60;                  // frames of motion
      const MS = 0.0065 * dtn;                               // max descent step
      for (let i = 0; i < NP; i++) {
        const x = sx[i], y = sy[i];
        const ix = ti(x), iy = ti(y);
        let W = 0, gx = 0, gy = 0;
        for (let j = 0; j < K; j++) {
          const e = act[j];
          const cmx = cosT[e.m][ix], smx = sinT[e.m][ix];
          const cnx = cosT[e.n][ix], snx = sinT[e.n][ix];
          const cmy = cosT[e.m][iy], smy = sinT[e.m][iy];
          const cny = cosT[e.n][iy], sny = sinT[e.n][iy];
          W += e.a * (cmx * cny + e.s * cnx * cmy);
          gx += e.a * (-e.m * PI * smx * cny - e.s * e.n * PI * snx * cmy);
          gy += e.a * (-e.n * PI * cmx * sny - e.s * e.m * PI * cnx * smy);
        }
        const aW = Math.abs(W);
        let stx = -ETA * W * gx * dt, sty = -ETA * W * gy * dt;
        if (stx > MS) stx = MS; else if (stx < -MS) stx = -MS;
        if (sty > MS) sty = MS; else if (sty < -MS) sty = -MS;
        const jm = JIT * Math.min(1.4, aW) * dtn;
        let nx = x + stx + (Math.random() - 0.5) * jm;
        let ny = y + sty + (Math.random() - 0.5) * jm;
        if (nx < 0.004) nx = 0.004; else if (nx > 0.996) nx = 0.996;
        if (ny < 0.004) ny = 0.004; else if (ny > 0.996) ny = 0.996;
        sx[i] = nx; sy[i] = ny;
      }
    }

    /* ---------- drawing: plate + ladder ---------- */
    function draw(dt) {
      const act = activeModes();
      if (act.length) stepSand(act, dt);

      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);

      const S = Math.max(120, Math.min(H - 46, W * 0.56));
      const x0 = 16, y0 = (H - S) / 2;
      plateRect = { x: x0, y: y0, s: S };

      // plate body
      ctx.fillStyle = P.panel;
      ctx.fillRect(x0, y0, S, S);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, S, S);

      // sand
      ctx.fillStyle = P.goldBright;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < NP; i++)
        ctx.fillRect(x0 + sx[i] * S - 0.8, y0 + sy[i] * S - 0.8, 1.6, 1.6);
      ctx.globalAlpha = 1;

      // strike ring
      if (strikeFx) {
        const age = strikeFx.clock.t() - strikeFx.t0;
        if (age > 0.6) strikeFx = null;
        else {
          const r = 6 + age * S * 0.9;
          ctx.strokeStyle = P.azure; ctx.globalAlpha = Math.max(0, 1 - age / 0.6);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x0 + strikeFx.x * S, y0 + strikeFx.y * S, r, 0, math.TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      drawLadder(ctx, x0 + S + 30, y0, W - (x0 + S + 46), S);
    }

    // string harmonics vs plate modes on one linear frequency axis
    function drawLadder(ctx, lx, ly, lw, lh) {
      if (lw < 110) return;
      const yOf = (f) => ly + lh - (f / FHI) * lh;
      const colS = lx + lw * 0.24, colP = lx + lw * 0.66;
      const half = lw * 0.15;
      const mono = '10px ui-monospace, Menlo, monospace';

      ctx.font = mono; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = P.gold; ctx.fillText('string  f ∝ n', colS, ly - 8);
      ctx.fillStyle = P.azure; ctx.fillText('plate  f ∝ m²+n²', colP, ly - 8);

      // faint gridlines every 500 Hz
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.fillStyle = P.inkFaint; ctx.textAlign = 'left';
      for (let f = 500; f < FHI; f += 500) {
        const y = yOf(f);
        ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + lw, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(`${f}`, lx + lw - 28, y - 2);
      }

      // string rungs: harmonics of 80 Hz (the plate's own lowest mode)
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.4;
      for (let n = 1; n * 80 <= FHI; n++) {
        const y = yOf(n * 80);
        ctx.beginPath(); ctx.moveTo(colS - half, y); ctx.lineTo(colS + half, y); ctx.stroke();
      }

      // plate rungs, lit by nearness to the drive and by active strikes
      const { weights } = resonanceWeights(driveF, catalog);
      const strikeAmp = new Map();
      if (strike) {
        const age = strike.clock.t() - strike.t0;
        for (const e of strike.modes) strikeAmp.set(e.f, e.a * Math.exp(-age / e.tau));
      }
      for (let i = 0; i < catalog.length; i++) {
        const e = catalog[i];
        const y = yOf(e.f);
        const lit = driveOn ? weights[i] : 0;
        const hit = strikeAmp.get(e.f) || 0;
        const glow = Math.max(lit, hit);
        ctx.strokeStyle = glow > 0.25 ? P.goldBright : P.azure;
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, glow + 0.15);
        ctx.lineWidth = 1.4 + 2.4 * glow;
        ctx.beginPath(); ctx.moveTo(colP - half, y); ctx.lineTo(colP + half, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // drive cursor
      if (driveOn) {
        const y = yOf(driveF);
        ctx.strokeStyle = P.crimson; ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + lw, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.crimson; ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(driveF)} Hz`, lx, y - 3);
      }
    }

    /* ---------- drawing: GWW drums ---------- */
    function drawDrumPoly(ctx, poly, diags, L, ringing, ripple) {
      const X = (wx) => L.ox + wx * L.sc;
      const Y = (wy) => L.oy + (3 - wy) * L.sc;
      ctx.beginPath();
      poly.forEach(([wx, wy], i) => (i ? ctx.lineTo(X(wx), Y(wy)) : ctx.moveTo(X(wx), Y(wy))));
      ctx.closePath();
      ctx.fillStyle = P.panel;
      ctx.fill();

      // interior triangulation, clipped: unit grid + the two square diagonals
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let g = 1; g < 3; g++) {
        ctx.moveTo(X(g), Y(0)); ctx.lineTo(X(g), Y(3));
        ctx.moveTo(X(0), Y(g)); ctx.lineTo(X(3), Y(g));
      }
      for (const [[ax, ay], [bx, by]] of diags) {
        ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx), Y(by));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (ripple) {
        const { wx, wy, age } = ripple;
        for (let r = 0; r < 3; r++) {
          const t = age - r * 0.14;
          if (t < 0) continue;
          ctx.strokeStyle = P.azure;
          ctx.globalAlpha = Math.max(0, 0.7 - t * 0.55);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(X(wx), Y(wy), t * L.sc * 2.4, 0, math.TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      ctx.beginPath();
      poly.forEach(([wx, wy], i) => (i ? ctx.lineTo(X(wx), Y(wy)) : ctx.moveTo(X(wx), Y(wy))));
      ctx.closePath();
      ctx.strokeStyle = ringing ? P.goldBright : P.ink;
      ctx.lineWidth = ringing ? 2.2 : 1.4;
      ctx.stroke();
    }

    function drawKac() {
      const { ctx, width: W, height: H } = handle2;
      ctx.clearRect(0, 0, W, H);
      const midW = Math.min(90, W * 0.16);
      const side = Math.min(H - 52, (W - midW) / 2 - 34);
      const sc = side / 3;
      const oy = (H - side) / 2 + 4;
      const LA = { ox: W / 2 - midW / 2 - 16 - side, oy, sc };
      const LB = { ox: W / 2 + midW / 2 + 16, oy, sc };
      kacLayout = [LA, LB];

      let age = -1, ringingDrum = -1, ripple = null;
      if (kacStrike) {
        age = kacStrike.clock.t() - kacStrike.t0;
        if (age > 3) kacStrike = null;
        else {
          ringingDrum = kacStrike.drum;
          if (age < 1.4) ripple = { wx: kacStrike.x, wy: kacStrike.y, age };
        }
      }
      drawDrumPoly(ctx, DRUM_A, DRUM_A_DIAGS, LA, ringingDrum === 0, ringingDrum === 0 ? ripple : null);
      drawDrumPoly(ctx, DRUM_B, DRUM_B_DIAGS, LB, ringingDrum === 1, ringingDrum === 1 ? ripple : null);

      const mono = '11px ui-monospace, Menlo, monospace';
      ctx.font = mono; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = P.inkDim;
      ctx.fillText('drum A', LA.ox + side / 2, oy + side + 18);
      ctx.fillText('drum B', LB.ox + side / 2, oy + side + 18);

      // shared spectrum ladder between the drums: rungs at √λ, lit while ringing
      const lx = W / 2, top = oy + 6, bot = oy + side - 6;
      const s1 = Math.sqrt(GWW_EIGS[0]), sN = Math.sqrt(GWW_EIGS[GWW_EIGS.length - 1]);
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(lx, top); ctx.lineTo(lx, bot); ctx.stroke();
      const now = kacStrike ? kacStrike.clock.t() : 0;
      for (let i = 0; i < GWW_EIGS.length; i++) {
        const y = bot - ((Math.sqrt(GWW_EIGS[i]) - s1) / (sN - s1)) * (bot - top);
        let lit = 0;
        if (kacStrike && i < kacStrike.parts.length) {
          const p = kacStrike.parts[i];
          if (now < p.end) lit = (p.end - now) / (p.end - kacStrike.t0);
        }
        ctx.strokeStyle = lit > 0 ? P.goldBright : P.azureDim;
        ctx.globalAlpha = 0.5 + 0.5 * lit;
        ctx.lineWidth = 1.2 + 2 * lit;
        ctx.beginPath();
        ctx.moveTo(lx - midW * 0.32, y); ctx.lineTo(lx + midW * 0.32, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.inkFaint;
      ctx.fillText('√λ₁ … √λ₂₀', lx, bot + 18);
      ctx.fillText('one ladder', lx, top - 10);
    }

    /* ---------- main loop ---------- */
    const loop = cv.rafLoop((dt) => { draw(dt); drawKac(); });
    loop.start();
    applyFrequency(driveF);

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        bus.mute();
        if (sweep && driveOn) sweep.off();     // don't resume into a surprise drone
        if (driveOn) toggleDriveOffSilently();
      },
      resume() { bus.unmute(); loop.start(); },
      destroy() {
        loop.stop();
        handle.canvas.removeEventListener('pointerdown', onPlateClick);
        handle2.canvas.removeEventListener('pointerdown', onKacClick);
        if (sweep) { sweep.dispose(); sweep = null; }
        bus.dispose();
        handle.destroy(); handle2.destroy();
      },
    };

    function toggleDriveOffSilently() {
      driveOn = false;
      driveBtn.classList.remove('active');
      driveBtn.textContent = '⏻ drive the plate';
    }
  },
};

/* ------------------------------- test surface ------------------------------- */

export const _test = {
  F_SCALE, FLO, FHI,
  modeW, modeGrad, modeK, modeFreq,
  buildCatalog, resonanceWeights, strikeExcitation,
  tToF, fToT,
  DRUM_A, DRUM_B, GWW_EIGS, polygonArea, pointInPolygon,
};
