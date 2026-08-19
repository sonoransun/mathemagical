// II.5 — The Fourier Atelier
// Draw a closed curve; the DFT turns it into a chain of spinning circles that
// redraws it, and the same coefficients, folded into a PeriodicWave, become a
// timbre. The phase-scramble button is the movement's thesis in one gesture:
// keep every |c_k|, randomize every arg(c_k) — the eye loses the drawing, the
// ear keeps the tone.

import { dft, idft, signedFreq, TAU, clamp } from '../../core/math.js';

/* ==================== pure machinery (node-testable) ==================== */

const N = 256;          // samples per closed curve
const RECON_N = 512;    // cached reconstruction resolution
const MAXH = 128;       // max audio harmonic folded from ±k
const MAXH_1D = 64;     // harmonics in the 1-D bench
const CACHE_N = 1024;   // 1-D waveform cache resolution
const F0 = 110;         // audio fundamental, Hz
const SI_PI = 1.8519370;              // Si(π): the Gibbs peak of Σ sin(jx)/j
const GIBBS = 0.089490;               // overshoot as a fraction of the jump

// Resample a closed polyline ([{re,im}, …], last point joins first) to `n`
// points spaced uniformly by arc length. Crucial for clean coefficients:
// a hand moves at uneven speed, and uneven parametrization smears the spectrum.
function resampleUniform(pts, n) {
  const M = pts.length;
  const cum = new Float64Array(M + 1);
  let L = 0;
  for (let i = 0; i < M; i++) {
    const a = pts[i], b = pts[(i + 1) % M];
    L += Math.hypot(b.re - a.re, b.im - a.im);
    cum[i + 1] = L;
  }
  const out = new Array(n);
  if (L === 0) {
    for (let i = 0; i < n; i++) out[i] = { re: pts[0].re, im: pts[0].im };
    return out;
  }
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / n) * L;
    while (seg < M - 1 && cum[seg + 1] < s) seg++;
    const a = pts[seg], b = pts[(seg + 1) % M];
    const d = cum[seg + 1] - cum[seg];
    const t = d > 0 ? (s - cum[seg]) / d : 0;
    out[i] = { re: a.re + (b.re - a.re) * t, im: a.im + (b.im - a.im) * t };
  }
  return out;
}

// DFT coefficients -> polar form with signed frequency. Kept polar so that a
// phase scramble can preserve each magnitude float-for-float.
function toPolar(coeffs) {
  const n = coeffs.length;
  return coeffs.map((c, k) => ({
    k,
    freq: signedFreq(k, n),
    mag: Math.hypot(c.re, c.im),
    phase: Math.atan2(c.im, c.re),
  }));
}

// Evaluate the epicycle sum over the given coefficient indices at curve
// fraction `frac` ∈ [0,1). With ALL indices and frac = n/N this reproduces
// sample z_n exactly (e^{2πi·f·n/N} = e^{2πi·k·n/N} when f ≡ k mod N).
function evalChain(polar, indices, frac) {
  let re = 0, im = 0;
  for (const i of indices) {
    const p = polar[i];
    const a = p.phase + TAU * p.freq * frac;
    re += p.mag * Math.cos(a);
    im += p.mag * Math.sin(a);
  }
  return { re, im };
}

// Keep every magnitude (same float, bit for bit), randomize every phase except
// DC — c_0 is the centroid, and scrambling it would only shove the wreck
// off-center. The magnitude spectrum is preserved exactly.
function scramblePhases(polar, rand = Math.random) {
  return polar.map((p) =>
    p.freq === 0 ? { ...p } : { ...p, phase: rand() * TAU - Math.PI });
}

// Indices of the non-DC coefficients, loudest first (ties: lowest frequency).
function sortIdxByMag(polar) {
  return polar
    .map((_, i) => i)
    .filter((i) => polar[i].freq !== 0)
    .sort((a, b) =>
      polar[b].mag - polar[a].mag ||
      Math.abs(polar[a].freq) - Math.abs(polar[b].freq));
}

// Parseval bookkeeping: fraction of AC energy Σ|c_k|² outside the K loudest.
function residualEnergy(polar, K) {
  const idx = sortIdxByMag(polar);
  let tot = 0, inc = 0;
  idx.forEach((i, rank) => {
    const e = polar[i].mag * polar[i].mag;
    tot += e;
    if (rank < K) inc += e;
  });
  return tot > 0 ? 1 - inc / tot : 0;
}

// Fold the included ±k coefficients into PeriodicWave real/imag arrays.
// Re Σ c_k e^{ikωt}: c = m e^{iφ} at +j contributes m·cosφ·cos − m·sinφ·sin,
// at −j contributes m·cosφ·cos + m·sinφ·sin — phases survive the fold.
function foldToWave(polar, included, maxHarm = MAXH) {
  const real = new Float32Array(maxHarm + 1);
  const imag = new Float32Array(maxHarm + 1);
  for (const i of included) {
    const p = polar[i];
    const j = Math.abs(p.freq);
    if (j === 0 || j > maxHarm) continue;
    const re = p.mag * Math.cos(p.phase);
    const im = p.mag * Math.sin(p.phase);
    real[j] += re;
    imag[j] += p.freq > 0 ? -im : im;
  }
  return { real, imag };
}

// Least-squares slope of log|c| vs log k over the folded low spectrum:
// the measured decay exponent p in |c_k| ≈ 1/k^p. Null if too little signal.
function decayExponent(polar) {
  const n = polar.length;
  const half = Math.min(40, (n >> 1) - 1);
  let maxM = 0;
  const m = [];
  for (let j = 1; j <= half; j++) {
    const v = Math.max(polar[j].mag, polar[n - j].mag);
    m.push(v);
    if (v > maxM) maxM = v;
  }
  if (maxM <= 0) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, c = 0;
  for (let j = 1; j <= half; j++) {
    const v = m[j - 1];
    if (v < maxM * 1e-7) continue;
    const x = Math.log(j), y = Math.log(v);
    sx += x; sy += y; sxx += x * x; sxy += x * y; c++;
  }
  if (c < 4) return null;
  const denom = c * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  return -((c * sxy - sx * sy) / denom);
}

/* ---------- preset curves (unit box, y down) ---------- */

function polylineSample(verts, per) {
  const out = [];
  const M = verts.length;
  for (let i = 0; i < M; i++) {
    const a = verts[i], b = verts[(i + 1) % M];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      out.push({ re: a[0] + (b[0] - a[0]) * t, im: a[1] + (b[1] - a[1]) * t });
    }
  }
  return out;
}

function catmullRomClosed(ctrl, per = 24) {
  const M = ctrl.length, out = [];
  for (let i = 0; i < M; i++) {
    const p0 = ctrl[(i - 1 + M) % M], p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % M], p3 = ctrl[(i + 2) % M];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push({
        re: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        im: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      });
    }
  }
  return out;
}

const SCRIPT_PTS = [
  [-0.85, 0.55], [-0.35, 0.32], [0.28, -0.05], [0.55, -0.5], [0.35, -0.78],
  [-0.05, -0.72], [-0.32, -0.35], [-0.28, 0.12], [0.1, 0.5], [0.6, 0.55],
  [0.85, 0.35],
];

function presetPoints(name) {
  if (name === 'square') {
    const s = 0.62;
    return polylineSample([[-s, -s], [s, -s], [s, s], [-s, s]], 90);
  }
  if (name === 'star') {
    const verts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 0.82 : 0.34;
      verts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return polylineSample(verts, 36);
  }
  if (name === 'egg') {
    const out = [];
    for (let i = 0; i < 360; i++) {
      const th = (i / 360) * TAU;
      const r = 0.62 + 0.09 * Math.cos(2 * th + 0.8) + 0.045 * Math.sin(3 * th);
      out.push({ re: r * Math.cos(th), im: r * Math.sin(th) });
    }
    return out;
  }
  // 'script' — a cursive letter through hand-placed control points
  return catmullRomClosed(SCRIPT_PTS, 24);
}

/* ---------- 1-D bench series ---------- */

// square: Σ sin((2m+1)x)/(2m+1)  — jumps, |b_j| ~ 1/j
// saw:    Σ sin(jx)/j            — jumps, |b_j| ~ 1/j
// triangle: Σ (−1)^m sin((2m+1)x)/(2m+1)² — kink only, |b_j| ~ 1/j²
function waveAmps1D(type, nH = MAXH_1D) {
  const b = new Float64Array(nH + 1);
  for (let j = 1; j <= nH; j++) {
    if (type === 'square') b[j] = j % 2 ? 1 / j : 0;
    else if (type === 'saw') b[j] = 1 / j;
    else if (type === 'triangle') b[j] = j % 2 ? ((((j - 1) / 2) % 2 ? -1 : 1) / (j * j)) : 0;
  }
  return b;
}

function partialSum1D(b, K, x) {
  let s = 0;
  const top = Math.min(K, b.length - 1);
  for (let j = 1; j <= top; j++) s += b[j] * Math.sin(j * x);
  return s;
}

/* ==================== the exhibit ==================== */

export default {
  id: 'fourier',
  movement: 2,
  title: 'The Fourier Atelier',
  hook: 'Draw any shape; circles rebuild it, and the same numbers become its voice.',
  prose: `
    <p>In 1807 Joseph Fourier read a memoir on the flow of heat to the Institut de France
    and slipped in one of the most consequential claims in mathematics: that <em>any</em>
    function — however jagged, kinked, or freehand — can be assembled from perfectly smooth
    waves. Lagrange, sitting in judgment, refused to believe it, and publication stalled for
    years; not until 1829 did Dirichlet prove the claim honest for any curve you could
    reasonably draw. The atelier below takes Fourier literally. Sketch a closed shape and it
    is sampled into <code>N = 256</code> complex numbers <code>zₙ = xₙ + iyₙ</code>; the
    transform <code>c_k = (1/N) Σ zₙ e^(−2πikn/N)</code> converts your pen stroke into a
    recipe of circles — the <em>k</em>-th coefficient is a circle of radius |c_k| spinning
    <em>k</em> times per lap, negative <em>k</em> spinning backward.</p>
    <p>Chain those circles tip to tail, loudest first, and the free end redraws your hand.
    This is Ptolemy's astronomy turned inside out: deferents and epicycles, circles riding on
    circles, and the old sneer that "with enough epicycles you can fit anything" turns out to
    be a theorem rather than an insult. The slider truncates the chain to its <em>K</em>
    largest terms, and Parseval's identity keeps the books: the energy of what is missing is
    exactly the energy <code>Σ|c_k|²</code> of the circles you left out, which the readout
    tracks as you slide from a wobbling blob up to your own drawing.</p>
    <p>Now press <em>listen</em>. The same magnitudes are handed to one oscillator as the
    amplitudes of its partials, and the drawing becomes a timbre on a 110&nbsp;Hz fundamental.
    Here is the movement's jewel: how fast |c_k| dies as <em>k</em> grows is precisely how
    smooth your curve is — and precisely how mellow it sounds. A genuine jump forces the
    coefficients to fade like <code>1/k</code>, which the ear reads as a reedy buzz; a corner
    — a kink in direction, not a tear in position, which is the sharpest thing a pen can
    actually draw — gives <code>1/k²</code>, softer; a smooth egg decays faster than any
    power and sounds nearly like a flute. We met this fact once already: the pluck point on
    the monochord was a Fourier filter in one dimension. Draw a star, then an egg, and you
    can hear the differentiability class of your own handwriting.</p>
    <p>The one-dimensional bench strips the story down to a single wave against time, and
    the spectrum strip under the canvas serves both panes — the same widget, because it is
    the same machinery. The square wave needs every odd harmonic at amplitude
    <code>1/j</code>, and truncating the series anywhere leaves an overshoot beside each jump
    of about 8.95% of the jump's height — a horn that narrows as <em>K</em> grows but
    <em>never dies away</em>: its height settles at 8.95% of the jump and drops no
    further. Henry Wilbraham noticed it in 1848; the world forgot,
    stumbled over it again fifty years later in a dispute around Albert Michelson's
    mechanical harmonic analyzer, and named it for J. Willard Gibbs. Drag the spectrum's bars
    yourself and you are playing an additive synthesizer, the oldest organ there is; the
    ghost of that ringing is what shimmers at your drawing's corners at low <em>K</em>.</p>
    <p>Every coefficient is two numbers, a magnitude and a phase, and the scramble button
    splits them apart: it keeps every |c_k| and randomizes every arg(c_k). The two senses
    part company on the spot. The drawing collapses into a tumbleweed, because the eye needs
    the circles to align — <em>shape lives in phase</em>. The tone barely flinches, because
    to a good first approximation the ear takes the magnitudes and discards the rest —
    <em>timbre lives in magnitude</em>. One list of complex numbers, factored two different
    ways by two different organs: a piece of geometry and a piece of music that are the same
    mathematical object, which is this whole movement's claim compressed into a button.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;
    const MONO = '11px ui-monospace, Menlo, monospace';

    /* ---------- state ---------- */
    let view = '2d';            // '2d' atelier | '1d' bench
    let samples = null;         // resampled curve, N pts, unit coords
    let polarOrig = null;       // polar spectrum as drawn
    let polar = null;           // possibly phase-scrambled
    let scrambled = false;
    let order = [];             // AC indices sorted by |c| desc
    let included = [];          // the K in use
    let inclFlags = new Uint8Array(N);
    let maxMagV = 0;
    let K = 24;
    let recon = null;           // Float64Array(2·RECON_N) truncated path
    let frac = 0;               // pen position around the loop
    const PERIOD = 12;          // seconds per lap

    let drawing = false;
    let rawStroke = [];
    let dirtyTrunc = false;

    let type1d = 'square';
    let amps1d = waveAmps1D('square');
    let cache1d = new Float64Array(CACHE_N);
    let cache1dMax = 0;
    let dirty1d = true;
    let scroll1d = 0;
    let dragBar = false;

    let hoverIdx = -1;          // polar index hovered in 2d strip
    let hoverHarm = 0;          // harmonic hovered in 1d strip
    let soloActive = false;
    let questDone = false;

    let listening = false;
    let toneOsc = null, toneGain = null, soloV = null;
    let dftTimer = 0, waveTimer = 0, dipTimer = 0;
    const TONE_LEVEL = 0.28;

    const bus = audio.createBus('fourier');

    /* ---------- layout ---------- */
    const styleEl = document.createElement('style');
    styleEl.textContent = '#ex-fourier .exhibit-stage canvas{touch-action:none;cursor:crosshair}';
    stage.appendChild(styleEl);

    const handle = cv.setupCanvas(stage, { height: 560 });
    const STRIP = 112;
    const glow = cv.glowSprite(P.goldBright, 26);

    const quest = ui.questBanner(stage,
      'Press <em>♪ listen</em>, then <em>⌀ scramble the phases</em> while the tone plays — watch what survives.');

    const row1 = ui.controlRow(stage);
    const modeBtn = ui.button(row1, '⌁ open the one-dimensional bench',
      () => setView(view === '2d' ? '1d' : '2d'), { primary: true });
    const sqB = ui.button(row1, 'square', () => loadPreset('square'), { small: true });
    const starB = ui.button(row1, 'star', () => loadPreset('star'), { small: true });
    const eggB = ui.button(row1, 'egg', () => loadPreset('egg'), { small: true });
    const scriptB = ui.button(row1, 'script ℯ', () => loadPreset('script'), { small: true });
    const clearB = ui.button(row1, 'clear', doClear, { small: true });
    const sq1B = ui.button(row1, 'square wave', () => load1d('square'), { small: true });
    const saw1B = ui.button(row1, 'sawtooth', () => load1d('saw'), { small: true });
    const tri1B = ui.button(row1, 'triangle', () => load1d('triangle'), { small: true });

    const row2 = ui.controlRow(stage);
    const kSlider = ui.slider(row2, {
      label: 'terms K', min: 1, max: 128, step: 1, value: K,
      format: (v) => `${v}`,
      onInput: (v) => { K = v; dirtyTrunc = true; dirty1d = true; },
    });
    const listenBtn = ui.button(row2, '♪ listen', toggleListen, { primary: true });
    const scrambleB = ui.button(row2, '⌀ scramble the phases', doScramble);
    const restoreB = ui.button(row2, '↺ restore the phases', doRestore);
    restoreB.disabled = true;

    const btns2d = [sqB, starB, eggB, scriptB, clearB, scrambleB, restoreB];
    const btns1d = [sq1B, saw1B, tri1B];

    const info = ui.readout(stage, '');
    ui.mathline(stage,
      'z<sub>n</sub> ⟶ c<sub>k</sub> = (1/N) Σ<sub>n</sub> z<sub>n</sub> e<sup>−2πi·kn/N</sup> ' +
      '⟶ circle k: radius |c<sub>k</sub>|, k turns per lap · partial k: amplitude |c<sub>k</sub>| at k·110 Hz');
    ui.caption(stage,
      'The strip along the bottom is the spectrum, and it is shared: hover a bar to light the ' +
      'matching circle in the chain and (while listening) solo the matching partial. In the ' +
      '1-D bench the bars become sliders — drag them to sculpt a waveform by hand.');
    ui.legendPanel(stage,
      '<p>Georg Ohm — the resistance Ohm — proposed in 1843 that the ear performs its own ' +
      'Fourier analysis, hearing a tone as a bundle of sinusoidal partials, and Hermann von ' +
      'Helmholtz enthroned the idea in <em>On the Sensations of Tone</em> (1863): the ear, ' +
      'he argued, is deaf to the relative phases of those partials. That is the licence for ' +
      'the scramble button.</p>' +
      '<p>Stated absolutely, it is a legend. Under headphones, at low frequencies, with ' +
      'carefully built signals, listeners can and do detect phase changes — phase reshapes ' +
      'the waveform’s crests and the fine timing the cochlea passes onward, so ' +
      '“phase deafness” is an excellent approximation rather than a law. Scramble ' +
      'while you listen and judge the approximation yourself: the shape dies utterly; the ' +
      'tone changes, if at all, far less than the picture does.</p>',
      'the ear that ignored phase');

    /* ---------- geometry helpers ---------- */
    const mainH = () => handle.height - STRIP;
    function mainGeom() {
      const W = handle.width, mh = mainH();
      return { W, mh, cx: W / 2, cy: mh / 2 + 4, S: Math.min(W, mh) * 0.40 };
    }
    function stripGeom() {
      const W = handle.width, H = handle.height;
      const pad = 46, innerW = Math.max(60, W - pad * 2);
      const barTop = H - STRIP + 26, barBot = H - 20;
      return { pad, innerW, barTop, barBot, maxH: barBot - barTop };
    }

    /* ---------- spectrum pipeline ---------- */
    function computeSpectrum() {
      polarOrig = toPolar(dft(samples));
      polar = polarOrig;
      scrambled = false;
      restoreB.disabled = true;
      order = sortIdxByMag(polar);
      dirtyTrunc = true;
    }

    function rebuildTrunc() {
      dirtyTrunc = false;
      if (!polar) return;
      included = order.slice(0, Math.min(K, order.length));
      inclFlags = new Uint8Array(N);
      for (const i of included) inclFlags[i] = 1;
      maxMagV = order.length ? polar[order[0]].mag : 0;
      const idx = [0, ...included];
      recon = new Float64Array(RECON_N * 2);
      for (let r = 0; r < RECON_N; r++) {
        const z = evalChain(polar, idx, r / RECON_N);
        recon[2 * r] = z.re;
        recon[2 * r + 1] = z.im;
      }
      scheduleWaveUpdate();
      updateReadout();
    }

    function rebuild1d() {
      dirty1d = false;
      const K1 = Math.min(K, MAXH_1D);
      cache1dMax = 0;
      for (let i = 0; i < CACHE_N; i++) {
        const v = partialSum1D(amps1d, K1, (i / CACHE_N) * TAU);
        cache1d[i] = v;
        const a = Math.abs(v);
        if (a > cache1dMax) cache1dMax = a;
      }
      updateReadout();
    }

    function fmtPct(x) { return x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2); }

    function updateReadout() {
      if (view === '2d') {
        if (!polar) {
          info.set('draw a closed shape on the canvas above — or start from a preset');
          return;
        }
        const Ku = included.length;
        const res = residualEnergy(polar, Ku) * 100;
        const p = decayExponent(polar);
        let decayTxt = '';
        if (p != null) {
          const cls = p < 1.5 ? 'the 1/k jump class — buzzy'
            : p < 2.7 ? 'the 1/k² kink class — corners, mellower'
            : 'smooth — faster than any power, nearly pure';
          decayTxt = ` · |c_k| ≈ 1/k^${p.toFixed(1)}: ${cls}`;
        }
        info.set(`N = ${N} samples · K = ${Ku} of ${order.length} circles · ` +
          `left-out energy ${fmtPct(res)}%${decayTxt}${scrambled ? ' · PHASES SCRAMBLED' : ''}`);
      } else {
        const K1 = Math.min(K, MAXH_1D);
        if (type1d === 'square') {
          const over = ((cache1dMax - Math.PI / 4) / (Math.PI / 2)) * 100;
          info.set(`square: bⱼ = 1/j, odd j only · K = ${K1} · measured overshoot ` +
            `+${over.toFixed(1)}% of the jump (Gibbs limit: ${(GIBBS * 100).toFixed(2)}% — never less, at any K)`);
        } else if (type1d === 'saw') {
          const over = ((cache1dMax - Math.PI / 2) / Math.PI) * 100;
          info.set(`sawtooth: bⱼ = 1/j · K = ${K1} · measured overshoot ` +
            `+${over.toFixed(1)}% of the jump (Gibbs limit: ${(GIBBS * 100).toFixed(2)}% — never less, at any K)`);
        } else if (type1d === 'triangle') {
          info.set(`triangle: bⱼ = ±1/j², odd j · K = ${K1} · a kink but no jump — ` +
            'no overshoot, and the fast 1/j² decay is why it hums instead of buzzing');
        } else {
          info.set(`your spectrum · K = ${K1} harmonics · drag the bars below to reshape it`);
        }
      }
    }

    /* ---------- curve sources ---------- */
    function loadPreset(name) {
      clearTimeout(dftTimer);
      drawing = false;
      samples = resampleUniform(presetPoints(name), N);
      computeSpectrum();
    }

    function doClear() {
      clearTimeout(dftTimer);
      drawing = false;
      samples = null; polar = null; polarOrig = null;
      recon = null; order = []; included = [];
      scrambled = false; restoreB.disabled = true;
      clearHover();
      if (listening && view === '2d') stopListening();
      updateReadout();
    }

    function recomputeFromStroke() {
      if (rawStroke.length < 8) return;
      samples = resampleUniform(rawStroke, N);
      computeSpectrum();
    }

    function load1d(type) {
      type1d = type;
      amps1d = waveAmps1D(type);
      dirty1d = true;
      scheduleWaveUpdate();
    }

    /* ---------- scramble ---------- */
    function doScramble() {
      if (!polar) return;
      audio.ensureAudio();
      polar = scramblePhases(polar);
      scrambled = true;
      restoreB.disabled = false;
      dirtyTrunc = true;
      if (listening && view === '2d') {
        questDone = true;
        quest.done('The drawing died; the tone barely flinched. Magnitude is for the ear, phase is for the eye.');
      } else if (!questDone) {
        quest.set('Now switch <em>♪ listen</em> on and scramble again — the ear will shrug at what just destroyed the eye.');
      }
    }

    function doRestore() {
      if (!polarOrig) return;
      polar = polarOrig;
      scrambled = false;
      restoreB.disabled = true;
      dirtyTrunc = true;
    }

    /* ---------- audio ---------- */
    function currentWave() {
      const c = bus.context;
      if (!c) return null;
      let real, imag;
      if (view === '2d') {
        if (!polar || !included.length) return null;
        ({ real, imag } = foldToWave(polar, included, MAXH));
      } else {
        real = new Float32Array(MAXH_1D + 1);
        imag = new Float32Array(MAXH_1D + 1);
        const K1 = Math.min(K, MAXH_1D);
        for (let j = 1; j <= K1; j++) imag[j] = amps1d[j];
      }
      let energy = 0;
      for (let j = 1; j < real.length; j++) energy += real[j] * real[j] + imag[j] * imag[j];
      if (energy < 1e-16) return null;
      return c.createPeriodicWave(real, imag);   // default normalization, per design
    }

    function startListening() {
      audio.ensureAudio();
      const w = currentWave();
      if (!w) { info.set('nothing to hear yet — draw something first: the tone is the drawing'); return; }
      const c = bus.context;
      toneGain = c.createGain();
      toneGain.gain.value = 0;
      toneOsc = c.createOscillator();
      toneOsc.setPeriodicWave(w);
      toneOsc.frequency.value = F0;
      toneOsc.connect(toneGain).connect(bus.input);
      toneOsc.start();
      audio.rampTo(toneGain.gain, TONE_LEVEL, 0.03);
      listening = true;
      listenBtn.classList.add('active');
    }

    function stopListening() {
      listening = false;
      listenBtn.classList.remove('active');
      soloOff();
      clearTimeout(waveTimer); clearTimeout(dipTimer);
      if (!toneOsc) return;
      const c = bus.context, osc = toneOsc, g = toneGain;
      toneOsc = null; toneGain = null;
      audio.rampTo(g.gain, 0, 0.03);
      osc.stop(c.currentTime + 0.25);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
    }

    function toggleListen() {
      audio.ensureAudio();
      if (listening) stopListening();
      else startListening();
    }

    // Swapping a PeriodicWave mid-note clicks; dip the gain ~15 ms around it.
    function applyWave() {
      if (!listening || !toneOsc) return;
      const w = currentWave();
      audio.rampTo(toneGain.gain, 0, 0.005);
      clearTimeout(dipTimer);
      dipTimer = setTimeout(() => {
        if (!toneOsc) return;
        if (w) {
          toneOsc.setPeriodicWave(w);
          audio.rampTo(toneGain.gain, soloActive ? TONE_LEVEL * 0.25 : TONE_LEVEL, 0.02);
        }
      }, 18);
    }

    function scheduleWaveUpdate() {
      if (!listening) return;
      clearTimeout(waveTimer);
      waveTimer = setTimeout(applyWave, 90);
    }

    function soloOn(harm, magRel) {
      if (!listening || harm < 1) return;
      if (!soloV) soloV = audio.voice(bus, { type: 'sine', freq: F0 * harm, level: 0.3 });
      soloV.setFreq(F0 * harm);
      soloV.on(0.06 + 0.3 * clamp(magRel, 0, 1));
      soloActive = true;
      if (toneGain) audio.rampTo(toneGain.gain, TONE_LEVEL * 0.25, 0.05);
    }

    function soloOff() {
      soloActive = false;
      if (soloV) soloV.off();
      if (toneGain && listening) audio.rampTo(toneGain.gain, TONE_LEVEL, 0.08);
    }

    /* ---------- pointer interaction ---------- */
    const cnv = handle.canvas;

    function toWorld(x, y) {
      const g = mainGeom();
      return { re: (x - g.cx) / g.S, im: (y - g.cy) / g.S };
    }

    function setHover2d(idx) {
      if (idx === hoverIdx) return;
      hoverIdx = idx;
      if (idx >= 0 && listening && maxMagV > 0) {
        soloOn(Math.abs(polar[idx].freq), polar[idx].mag / maxMagV);
      }
    }

    function clearHover() {
      if (hoverIdx === -1 && hoverHarm === 0) return;
      hoverIdx = -1; hoverHarm = 0;
      soloOff();
    }

    function updateHover(x, y) {
      const sg = stripGeom();
      const inStrip = y > mainH() + 6;
      if (!inStrip) { clearHover(); return; }
      if (view === '2d') {
        if (!polar) { clearHover(); return; }
        const slot = Math.floor(((x - sg.pad) / sg.innerW) * 65);
        const f = slot - 32;
        if (slot < 0 || slot > 64 || f === 0) { clearHover(); return; }
        const idx = f >= 0 ? f : f + N;
        if (polar[idx].mag <= 0) { clearHover(); return; }
        setHover2d(idx);
      } else {
        const j = 1 + Math.floor(((x - sg.pad) / sg.innerW) * 32);
        if (j < 1 || j > 32) { clearHover(); return; }
        if (j !== hoverHarm) {
          hoverHarm = j;
          let maxAbs = 0;
          for (let i = 1; i <= MAXH_1D; i++) maxAbs = Math.max(maxAbs, Math.abs(amps1d[i]));
          if (listening) soloOn(j, maxAbs > 0 ? Math.abs(amps1d[j]) / maxAbs : 0);
        }
      }
    }

    function setBarFromPointer(x, y) {
      const sg = stripGeom();
      const j = 1 + Math.floor(((x - sg.pad) / sg.innerW) * 32);
      if (j < 1 || j > 32) return;
      let maxAbs = 0;
      for (let i = 1; i <= MAXH_1D; i++) maxAbs = Math.max(maxAbs, Math.abs(amps1d[i]));
      const scaleRef = maxAbs > 0 ? maxAbs : 1;
      const h = clamp((sg.barBot - y) / sg.maxH, 0, 1);
      amps1d[j] = h * scaleRef;
      type1d = 'custom';
      dirty1d = true;
      hoverHarm = j;
      if (listening) soloOn(j, h);
    }

    function onDown(e) {
      const [x, y] = cv.pointerPos(handle, e);
      if (y > mainH() + 6) {
        if (view === '1d') {
          dragBar = true;
          setBarFromPointer(x, y);
          try { cnv.setPointerCapture(e.pointerId); } catch {}
        }
        return;
      }
      if (view === '2d') {
        drawing = true;
        rawStroke = [toWorld(x, y)];
        clearHover();
        try { cnv.setPointerCapture(e.pointerId); } catch {}
      }
    }

    function onMove(e) {
      const [x, y] = cv.pointerPos(handle, e);
      if (drawing) {
        const p = toWorld(x, y);
        const last = rawStroke[rawStroke.length - 1];
        if (Math.hypot(p.re - last.re, p.im - last.im) > 0.006) rawStroke.push(p);
        return;
      }
      if (dragBar) { setBarFromPointer(x, y); return; }
      updateHover(x, y);
    }

    function onUp(e) {
      if (drawing) {
        drawing = false;
        try { cnv.releasePointerCapture(e.pointerId); } catch {}
        if (rawStroke.length >= 8) {
          // DFT on pointer-up + debounce — never per pointermove.
          clearTimeout(dftTimer);
          dftTimer = setTimeout(recomputeFromStroke, 120);
        }
      }
      if (dragBar) {
        dragBar = false;
        try { cnv.releasePointerCapture(e.pointerId); } catch {}
        scheduleWaveUpdate();
        updateReadout();
      }
    }

    function onLeave() { if (!drawing && !dragBar) clearHover(); }

    cnv.addEventListener('pointerdown', onDown);
    cnv.addEventListener('pointermove', onMove);
    cnv.addEventListener('pointerup', onUp);
    cnv.addEventListener('pointercancel', onUp);
    cnv.addEventListener('pointerleave', onLeave);
    function unbindPointer() {
      cnv.removeEventListener('pointerdown', onDown);
      cnv.removeEventListener('pointermove', onMove);
      cnv.removeEventListener('pointerup', onUp);
      cnv.removeEventListener('pointercancel', onUp);
      cnv.removeEventListener('pointerleave', onLeave);
    }

    /* ---------- view switch ---------- */
    function setView(v) {
      view = v;
      clearHover();
      modeBtn.textContent = v === '2d' ? '⌁ open the one-dimensional bench' : '✎ back to the atelier';
      for (const b of btns2d) b.style.display = v === '2d' ? '' : 'none';
      for (const b of btns1d) b.style.display = v === '1d' ? '' : 'none';
      cnv.style.cursor = v === '2d' ? 'crosshair' : 'default';
      if (listening) {
        if (v === '2d' && !polar) stopListening();
        else applyWave();
      }
      if (v === '1d') dirty1d = true;
      else if (polar) dirtyTrunc = true;
      updateReadout();
    }

    /* ---------- drawing ---------- */
    function bodyFont(px) { return px + 'px ' + getComputedStyle(document.body).fontFamily; }

    function draw(dt) {
      if (dirtyTrunc && polar) rebuildTrunc();
      if (dirty1d) rebuild1d();
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      if (view === '2d') draw2D(ctx, dt);
      else draw1D(ctx, dt);
      drawSpectrum(ctx, W, H);
    }

    function draw2D(ctx, dt) {
      const { W, mh, cx, cy, S } = mainGeom();

      if (!samples && !drawing) {
        ctx.fillStyle = P.inkFaint;
        ctx.font = bodyFont(15);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('draw a closed shape here — or start from a preset', cx, cy);
        return;
      }

      if (drawing) {
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6;
        ctx.beginPath();
        rawStroke.forEach((p, i) => {
          const sx = cx + p.re * S, sy = cy + p.im * S;
          i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
        });
        ctx.stroke();
        const p0 = rawStroke[0];
        ctx.fillStyle = P.azure;
        ctx.beginPath(); ctx.arc(cx + p0.re * S, cy + p0.im * S, 3, 0, TAU); ctx.fill();
        ctx.fillStyle = P.inkFaint; ctx.font = MONO;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('release to transform', 14, 12);
        return;
      }

      // the original curve, faint
      ctx.strokeStyle = 'rgba(109,106,94,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      samples.forEach((p, i) => {
        const sx = cx + p.re * S, sy = cy + p.im * S;
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.closePath(); ctx.stroke();

      if (recon && included.length && maxMagV > 0) {
        frac = (frac + dt / PERIOD) % 1;

        // full truncated loop, dim gold
        ctx.strokeStyle = P.goldDim;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let r = 0; r < RECON_N; r++) {
          const sx = cx + recon[2 * r] * S, sy = cy + recon[2 * r + 1] * S;
          r ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
        }
        ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = 1;

        // bright trail behind the pen
        const penIdx = Math.floor(frac * RECON_N);
        const tail = Math.floor(RECON_N * 0.25);
        ctx.strokeStyle = P.gold; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 0; s <= tail; s++) {
          const r = (penIdx - tail + s + RECON_N) % RECON_N;
          const sx = cx + recon[2 * r] * S, sy = cy + recon[2 * r + 1] * S;
          s ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
        }
        ctx.stroke();

        // the epicycle chain
        let x = cx + polar[0].mag * Math.cos(polar[0].phase) * S;
        let y = cy + polar[0].mag * Math.sin(polar[0].phase) * S;
        for (const idx of included) {
          const p = polar[idx];
          const r = p.mag * S;
          const isHov = idx === hoverIdx;
          if (r > 1.1 || isHov) {
            ctx.strokeStyle = isHov ? P.azure : 'rgba(125,167,217,0.20)';
            ctx.lineWidth = isHov ? 1.8 : 1;
            ctx.beginPath(); ctx.arc(x, y, Math.max(r, 1.5), 0, TAU); ctx.stroke();
          }
          const a = p.phase + TAU * p.freq * frac;
          const nx = x + r * Math.cos(a), ny = y + r * Math.sin(a);
          ctx.strokeStyle = isHov ? P.azure : 'rgba(232,226,208,0.30)';
          ctx.lineWidth = isHov ? 1.6 : 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
          x = nx; y = ny;
        }
        glow.draw(ctx, x, y, 0.85);
      }

      if (scrambled) {
        ctx.fillStyle = P.crimson;
        ctx.font = MONO;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('phases scrambled — magnitudes intact', 14, 12);
      }
    }

    function ideal1d(t) {
      // limits of the three preset series (see waveAmps1D)
      if (type1d === 'square') return t < Math.PI ? Math.PI / 4 : -Math.PI / 4;
      if (type1d === 'saw') return (Math.PI - t) / 2;
      if (type1d === 'triangle') {
        const s = Math.PI / 4, pk = Math.PI * Math.PI / 8;
        if (t < Math.PI / 2) return s * t;
        if (t < 1.5 * Math.PI) return pk - s * (t - Math.PI / 2);
        return -pk + s * (t - 1.5 * Math.PI);
      }
      return null;
    }

    function draw1D(ctx, dt) {
      const { W, mh } = mainGeom();
      if (listening) scroll1d = (scroll1d + dt * 1.1) % TAU;
      const pad = 46, innerW = Math.max(60, W - pad * 2);
      const cy = mh * 0.52;
      const idealPk = type1d === 'square' ? SI_PI / 2
        : type1d === 'saw' ? SI_PI
        : type1d === 'triangle' ? Math.PI * Math.PI / 8
        : cache1dMax;
      const yMax = Math.max(cache1dMax, idealPk, 1e-6) * 1.18;
      const yS = (mh * 0.42) / yMax;

      // axis
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(pad + innerW, cy); ctx.stroke();

      const tAt = (px) => {
        let t = ((px / innerW) * 2 * TAU + scroll1d) % TAU;
        if (t < 0) t += TAU;
        return t;
      };

      // ideal limit, faint (presets only)
      if (type1d !== 'custom') {
        ctx.strokeStyle = 'rgba(109,106,94,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let pen = false;
        let prev = 0;
        for (let px = 0; px <= innerW; px += 2) {
          const t = tAt(px);
          const v = ideal1d(t);
          const sy = cy - v * yS;
          // lift the pen across jumps so the ideal shows clean verticals
          if (pen && Math.abs(v - prev) > yMax * 0.8) pen = false;
          prev = v;
          if (pen) ctx.lineTo(pad + px, sy);
          else { ctx.moveTo(pad + px, sy); pen = true; }
        }
        ctx.stroke();
      }

      // Gibbs ceiling for the jump waveforms
      if (type1d === 'square' || type1d === 'saw') {
        const lvl = type1d === 'square' ? SI_PI / 2 : SI_PI;
        ctx.strokeStyle = P.crimson; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, cy - lvl * yS); ctx.lineTo(pad + innerW, cy - lvl * yS);
        ctx.moveTo(pad, cy + lvl * yS); ctx.lineTo(pad + innerW, cy + lvl * yS);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.crimson; ctx.font = MONO;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('Gibbs ceiling: jump × 8.95%', pad + innerW, cy - lvl * yS - 3);
      }

      // the partial sum
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let px = 0; px <= innerW; px += 2) {
        const t = tAt(px);
        const v = cache1d[Math.min(CACHE_N - 1, Math.floor((t / TAU) * CACHE_N))];
        const sy = cy - v * yS;
        px ? ctx.lineTo(pad + px, sy) : ctx.moveTo(pad + px, sy);
      }
      ctx.stroke();

      ctx.fillStyle = P.inkDim; ctx.font = MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const label = type1d === 'square' ? 'square = Σ sin((2m+1)ωt)/(2m+1)'
        : type1d === 'saw' ? 'saw = Σ sin(jωt)/j'
        : type1d === 'triangle' ? 'triangle = Σ (−1)^m sin((2m+1)ωt)/(2m+1)²'
        : 'your harmonics, summed';
      ctx.fillText(label, 14, 12);
    }

    function drawSpectrum(ctx, W, H) {
      const { pad, innerW, barTop, barBot, maxH } = stripGeom();
      const sepY = mainH() + 4;
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, sepY + 0.5); ctx.lineTo(W, sepY + 0.5); ctx.stroke();

      ctx.font = MONO;
      ctx.textBaseline = 'alphabetic';

      if (view === '2d') {
        if (!polar || maxMagV <= 0) {
          ctx.fillStyle = P.inkFaint;
          ctx.textAlign = 'center';
          ctx.fillText('the spectrum appears when there is a curve to transform', W / 2, barTop + maxH / 2);
          return;
        }
        const slots = 65; // signed frequencies −32 … +32
        const slotW = innerW / slots;
        const bw = Math.max(2, slotW * 0.62);
        for (let slot = 0; slot < slots; slot++) {
          const f = slot - 32;
          const xc = pad + (slot + 0.5) * slotW;
          if (f === 0) {
            ctx.fillStyle = P.inkFaint;
            ctx.beginPath(); ctx.arc(xc, barBot - 2, 2, 0, TAU); ctx.fill();
            continue;
          }
          const idx = f >= 0 ? f : f + N;
          const mag = polar[idx].mag;
          const h = Math.sqrt(mag / maxMagV) * maxH;
          if (h < 0.5) continue;
          const isHov = idx === hoverIdx;
          ctx.fillStyle = isHov ? P.goldBright : inclFlags[idx] ? P.gold : 'rgba(109,106,94,0.5)';
          ctx.fillRect(xc - bw / 2, barBot - h, bw, h);
          if (isHov) {
            ctx.strokeStyle = P.azure; ctx.lineWidth = 1;
            ctx.strokeRect(xc - bw / 2 - 1, barBot - h - 1, bw + 2, h + 2);
          }
        }
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'left';
        ctx.fillText('−32', pad, H - 7);
        ctx.textAlign = 'center';
        ctx.fillText('0', pad + innerW / 2, H - 7);
        ctx.fillText('signed frequency k — cycles per lap', pad + innerW / 2, barTop - 12);
        ctx.textAlign = 'right';
        ctx.fillText('+32', pad + innerW, H - 7);
        if (hoverIdx >= 0) {
          const p = polar[hoverIdx];
          const s = `k = ${p.freq > 0 ? '+' : ''}${p.freq} · |c| = ${p.mag.toFixed(4)} · ` +
            `partial ${Math.abs(p.freq)} → ${Math.abs(p.freq) * F0} Hz` +
            (inclFlags[hoverIdx] ? '' : ' · beyond K — silent');
          ctx.fillStyle = P.azure;
          ctx.textAlign = 'left';
          ctx.fillText(s, pad, barTop - 12 - 14);
        }
      } else {
        let maxAbs = 0;
        for (let i = 1; i <= MAXH_1D; i++) maxAbs = Math.max(maxAbs, Math.abs(amps1d[i]));
        const slots = 32;
        const slotW = innerW / slots;
        const bw = Math.max(3, slotW * 0.6);
        const K1 = Math.min(K, MAXH_1D);
        for (let j = 1; j <= slots; j++) {
          const xc = pad + (j - 0.5) * slotW;
          const rel = maxAbs > 0 ? Math.abs(amps1d[j]) / maxAbs : 0;
          const h = rel * maxH;
          const isHov = j === hoverHarm;
          ctx.fillStyle = isHov ? P.goldBright : j <= K1 ? P.gold : 'rgba(109,106,94,0.5)';
          if (h >= 0.5) ctx.fillRect(xc - bw / 2, barBot - h, bw, h);
          // drag handle cap
          ctx.fillStyle = isHov ? P.azure : 'rgba(125,167,217,0.45)';
          ctx.fillRect(xc - bw / 2, barBot - h - 2, bw, 2);
        }
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'left';
        ctx.fillText('1', pad + slotW / 2, H - 7);
        ctx.textAlign = 'center';
        ctx.fillText('harmonic j · sin(j·ωt) — drag a bar to set its amplitude', pad + innerW / 2, barTop - 12);
        ctx.textAlign = 'right';
        ctx.fillText('32', pad + innerW, H - 7);
        if (hoverHarm >= 1) {
          ctx.fillStyle = P.azure;
          ctx.textAlign = 'left';
          ctx.fillText(`harmonic ${hoverHarm} · b = ${amps1d[hoverHarm].toFixed(3)} · ${hoverHarm * F0} Hz`,
            pad, barTop - 12 - 14);
        }
      }
    }

    /* ---------- boot ---------- */
    const loop = cv.rafLoop(draw);
    loadPreset('script');
    setView('2d');
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        stopListening();
        bus.mute();
        loop.stop();
      },
      resume() {
        bus.unmute();
        loop.start();
      },
      destroy() {
        loop.stop();
        clearTimeout(dftTimer); clearTimeout(waveTimer); clearTimeout(dipTimer);
        stopListening();
        if (soloV) { soloV.dispose(); soloV = null; }
        unbindPointer();
        bus.dispose();
        handle.destroy();
        styleEl.remove();
      },
    };
  },
};

/* ==================== tests ==================== */

export const _test = {
  resampleUniform,
  toPolar,
  evalChain,
  scramblePhases,
  sortIdxByMag,
  residualEnergy,
  foldToWave,
  decayExponent,
  catmullRomClosed,
  presetPoints,
  waveAmps1D,
  partialSum1D,
  spectrum: (points) => toPolar(dft(points)),
  roundtrip: (points) => idft(dft(points)),
};
