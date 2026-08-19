// II.1 — The Monochord
// One string; its ladder of overtones; the pluck point as a Fourier filter;
// flageolets; and the just-vs-equal war over the major third, made audible.

import { TAU, clamp, cents } from '../../core/math.js';

/* =================== pure theory (exported for tests) =================== */

const F0 = 110;   // the string's fundamental, Hz (A2)
const NH = 16;    // partials modeled everywhere

// Modal amplitude of an ideal string released from a triangular pluck at
// fraction beta of its length (unit peak displacement, L = 1):
//   a_n = 2 sin(nπβ) / (n² π² β(1−β))
// Signed: the sign is the mode's phase; magnitudes are what you hear.
export function harmonicAmp(n, beta) {
  if (beta <= 0 || beta >= 1) return 0;
  return (2 * Math.sin(n * Math.PI * beta)) /
         (n * n * Math.PI * Math.PI * beta * (1 - beta));
}

// First N modal amplitudes, normalized so Σ|aₙ| = 1 (keeps the additive
// synth's summed peak bounded — the "sixteen sines clip" pitfall).
export function pluckSpectrum(beta, N = NH) {
  const a = new Array(N);
  let sum = 0;
  for (let n = 1; n <= N; n++) { a[n - 1] = harmonicAmp(n, beta); sum += Math.abs(a[n - 1]); }
  if (sum > 0) for (let i = 0; i < N; i++) a[i] /= sum;
  return a;   // a[0] is n = 1
}

// Σ|aₙ| before normalization — the scale factor for the continuous envelope.
export function envelopeNorm(beta, N = NH) {
  let s = 0;
  for (let n = 1; n <= N; n++) s += Math.abs(harmonicAmp(n, beta));
  return s;
}

// The nearest-coincident low partials of a dyad: minimize |m·f_lo − n·f_hi|
// over 1 ≤ m, n ≤ maxH (ties go to the lowest pair). For a just 5/4 third the
// answer is (5, 4) with difference 0; temper the third and the same pair beats.
export function beatPair(fa, fb, maxH = 10) {
  const lo = Math.min(fa, fb), hi = Math.max(fa, fb);
  let best = null;
  for (let m = 1; m <= maxH; m++) {
    for (let n = 1; n <= maxH; n++) {
      const d = Math.abs(m * lo - n * hi);
      if (!best || d < best.d - 1e-9 ||
          (Math.abs(d - best.d) <= 1e-9 && m + n < best.m + best.n)) {
        best = { m, n, d };
      }
    }
  }
  return best;   // { m: partial of the lower note, n: of the higher, d: Hz }
}

// Snap a pluck fraction to nearby simple fractions (the ones ticked on the string).
const SNAPS = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5]];
export function snapBeta(b, tol = 0.012) {
  for (const [p, q] of SNAPS) {
    if (Math.abs(b - p / q) < tol) return { beta: p / q, p, q };
  }
  return { beta: b, p: null, q: null };
}

/* ---------- fixed musical data ---------- */

const FLAGEOLETS = [
  { num: 1, den: 2, glyph: '½', name: 'the octave' },
  { num: 2, den: 3, glyph: '⅔', name: 'a twelfth (octave + fifth)' },
  { num: 3, den: 4, glyph: '¾', name: 'two octaves' },
  { num: 4, den: 5, glyph: '⅘', name: 'two octaves + a pure major third' },
];

const DEGREES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti', 'do′'];
const JI = [[1, 1], [9, 8], [5, 4], [4, 3], [3, 2], [5, 3], [15, 8], [2, 1]];
const ET_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
const ROOT = 2 * F0;              // 220 Hz — the string's own octave, 2f₀

// Per-mode decay time constant (s): higher modes die faster.
function tauOf(n) { return 1.9 / (1 + 0.55 * (n - 1)); }

const MONO = 'ui-monospace, Menlo, monospace';

/* ============================== the exhibit ============================== */

export default {
  id: 'monochord',
  movement: 2,
  title: 'The Monochord',
  hook: 'Pluck one string; every interval — and the war between pure tuning and the piano — is already inside it.',
  prose: `
    <p>Stretch one string over two bridges and you own the oldest laboratory in science.
    The Greek harmonic theorists called it the <em>kanōn</em> — "the rule" — and the rule
    it measures is startling: stop the string at half its length and it sounds the octave;
    at two-thirds, the perfect fifth; at three-quarters, the fourth. Consonance, the most
    private of sensations, turns out to obey the smallest whole numbers — <code>2/1</code>,
    <code>3/2</code>, <code>4/3</code> — and that discovery, however it was actually made,
    is as good a candidate as any for the first quantitative law of nature. The ear was
    the first precision instrument.</p>
    <p>But the string holds more than the notes you can stop; left whole, it plays every
    whole number at once. A plucked string vibrates in modes,
    <code>yₙ = aₙ sin(nπx/L) cos(2πnf₀t)</code>, sounding the frequencies
    <code>f₀, 2f₀, 3f₀, …</code> together — and <em>where</em> you pluck decides the mix.
    Release it at a fraction β of its length and mode <em>n</em> receives amplitude
    <code>aₙ ∝ sin(nπβ)/n²</code>. Pluck dead centre and every even harmonic vanishes:
    each of those modes needs a node at the midpoint, exactly where your finger insists on
    maximum motion. The pluck point is a filter. Drag it along the string below and watch
    the <code>sin(nπβ)/n²</code> envelope sweep across the spectrum — the triangle you
    release and the timbre you hear are one and the same list of numbers, a fact this
    movement will keep returning to.</p>
    <p>Touching is the inverse of plucking. Rest a fingertip <em>on</em> the string at
    two-thirds — touch, don't press — and only the modes with a node under your finger
    survive: harmonics 3, 6, 9… The string leaps to a glassy twelfth. String players call
    these <em>flageolets</em>; mathematically they are congruence classes made audible.
    The touch-points marked on the instrument give the octave at ½, the twelfth at ⅔, two
    octaves at ¾ — and at ⅘, a pure major third two octaves up: the innocent-looking
    interval the rest of this exhibit goes to war over.</p>
    <p>Here is the war. Build the major third as a pure ratio and it is <code>5/4</code> —
    exactly <code>1200·log₂(5/4) = 386.31</code> cents. Build it as a piano must, from four
    equal semitones of <code>2^(1/12)</code>, and it is <code>400</code> cents: sharp by
    13.69 cents, about a seventh of a semitone. The difference is not bookkeeping; it beats. When
    the ratio is exactly 5/4, the fifth harmonic of the root and the fourth harmonic of the
    third land on the very same frequency, and the two tones lock. Temper the third and
    those partials miss each other — over our 220 Hz drone they collide at about nine beats
    a second, a churn you can count on the readout. Hold the third both ways on the two-row
    keyboard and listen to arithmetic disagree with itself.</p>
    <p>So why does every piano choose the churning third? Because the pure intervals refuse
    to share an octave: stack four pure fifths, drop two octaves, and you land on
    <code>81/64</code> — overshooting the pure third by <code>81/80</code>, the <em>syntonic
    comma</em>, about 21.51 cents. Every tuning system in history is a treaty apportioning
    such errors, and equal temperament is simply the treaty that spreads them evenly. The
    next exhibit unrolls that story into a spiral. For now, notice what a single string has
    already given us: the harmonic series, a Fourier transform under your fingertip, and an
    honest arithmetic reason why a piano can never be perfectly in tune.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    /* ---------- state ---------- */
    let drag = null;         // { beta, h, snap, moved }
    let excite = null;       // { kind:'pluck'|'flag', t0, ... }
    let everTouched = false;
    let currentSpec = pluckSpectrum(0.28);   // default keyboard timbre until first pluck
    let waveCache = null;
    let banks = [];          // live pluck/flageolet oscillator banks
    const voices = new Map();// keyId -> { osc, g, freq, deg, row, rat, el }
    let qMid = false, qJI3 = false, qET3 = false;

    const bus = audio.createBus('monochord');

    /* ---------- scoped styles (keyboard) ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-monochord .mono-kb { display:grid; grid-template-columns:auto repeat(8,minmax(0,1fr));
        gap:6px; margin-top:0.6rem; }
      #ex-monochord .mono-kb .rowlab { align-self:center; font-family:${MONO}; font-size:0.68rem;
        letter-spacing:0.08em; color:${P.inkDim}; text-transform:uppercase; padding-right:2px; }
      #ex-monochord .mono-key { appearance:none; background:${P.panel}; border:1px solid ${P.line};
        border-radius:6px; color:${P.ink}; padding:0.42rem 0.1rem 0.34rem; cursor:pointer;
        text-align:center; line-height:1.25; font-family:inherit; }
      #ex-monochord .mono-key .deg { display:block; font-size:0.86rem; }
      #ex-monochord .mono-key .rat { display:block; font-family:${MONO}; font-size:0.63rem;
        color:${P.inkFaint}; margin-top:2px; }
      #ex-monochord .mono-key:hover { border-color:${P.goldDim}; }
      #ex-monochord .mono-key:active { transform:translateY(1px); }
      #ex-monochord .mono-key.on { border-color:${P.gold}; background:rgba(201,169,89,0.16); }
      #ex-monochord .mono-key.on .deg { color:${P.goldBright}; }
      #ex-monochord .mono-key.et.on { border-color:${P.azure}; background:rgba(125,167,217,0.14); }
      #ex-monochord .mono-key.et.on .deg { color:${P.azure}; }
      #ex-monochord .mono-kb-label { font-family:${MONO}; font-size:0.7rem; letter-spacing:0.06em;
        color:${P.inkDim}; margin-top:1.2rem; text-transform:uppercase; }
      @media (max-width: 560px) {
        #ex-monochord .mono-key .deg { font-size:0.74rem; }
        #ex-monochord .mono-key .rat { display:none; }
      }`;
    stage.appendChild(style);

    /* ---------- layout ---------- */
    const quest = ui.questBanner(stage, '');
    const handle = cv.setupCanvas(stage, { height: 440 });
    const mathEl = ui.mathline(stage,
      'aₙ ∝ sin(nπβ)/n² · β = the pluck point · f₀ = 110 Hz');
    ui.caption(stage,
      'Press the string, pull, and release to pluck — ticks above mark simple fractions, and β snaps to them. ' +
      'The azure diamonds beneath are touch-points: click one to sound a flageolet. The wave is slowed about a ' +
      'hundredfold for the eye; the spectrum bars decay in real time (on a compressed height scale so the upper ' +
      'partials stay visible). The keys below borrow the string’s most recent pluck for their timbre.');

    const kbLabel = document.createElement('div');
    kbLabel.className = 'mono-kb-label';
    kbLabel.textContent = 'the string, stopped — one scale, two tunings · do = 2f₀ = 220 Hz · keys latch';
    stage.appendChild(kbLabel);

    const kb = document.createElement('div');
    kb.className = 'mono-kb';
    stage.appendChild(kb);
    buildKeyRow('ji', 'just');
    buildKeyRow('et', 'equal');

    const controls = ui.controlRow(stage);
    ui.button(controls, 'release all keys', releaseAllKeys, { small: true });
    const ro = ui.readout(stage, 'hold two keys — the readout will name the beating partials.');

    ui.legendPanel(stage, `
      <p>Nicomachus tells how Pythagoras, passing a smithy, heard consonances ring from hammers
      weighing 12, 9, 8, and 6 units, hurried home, hung matching weights from strings, and found
      the same intervals — the octave from 2:1, the fifth from 3:2. It is a lovely story, and as
      told it cannot be true: a hammer’s pitch does not follow its weight, and a string’s frequency
      grows only as the <em>square root</em> of its tension, so weights in ratio 2:1 give not an
      octave but the ratio √2 — 600 cents, a tritone, about the least consonant interval on offer.
      The half of the legend that survives every test is the monochord itself: divide the
      <em>length</em>, and the numbers keep their promise.</p>`);

    function buildKeyRow(row, labelText) {
      const lab = document.createElement('div');
      lab.className = 'rowlab';
      lab.textContent = labelText;
      kb.appendChild(lab);
      for (let i = 0; i < 8; i++) {
        const b = document.createElement('button');
        b.className = 'mono-key' + (row === 'et' ? ' et' : '');
        const rat = row === 'ji' ? `${JI[i][0]}/${JI[i][1]}` : `${ET_STEPS[i] * 100}¢`;
        b.innerHTML = `<span class="deg">${DEGREES[i]}</span><span class="rat">${rat}</span>`;
        b.addEventListener('click', () => toggleKey(row, i, b, rat));
        kb.appendChild(b);
      }
    }

    /* ---------- audio: pluck & flageolet banks ---------- */

    function killBanks() {
      const c = audio.getContext();
      for (const bank of banks) {
        if (bank.dead) continue;
        bank.dead = true;
        if (c) {
          audio.rampTo(bank.master.gain, 0, 0.015);
          for (const o of bank.oscs) { try { o.osc.stop(c.currentTime + 0.08); } catch {} }
        }
      }
    }

    function makeBank(t0, parts, masterLevel) {
      // parts: [{ freq, amp, tau }]; each osc ramps up in ~10 ms (no thump),
      // decays via setTargetAtTime, and is stopped + disconnected via onended.
      const c = audio.getContext();
      const master = c.createGain();
      master.gain.value = masterLevel;
      // belt-and-braces: fade the whole bank out well before the last stop
      master.gain.setValueAtTime(masterLevel, t0);
      master.gain.setTargetAtTime(1e-4, t0 + 6.2, 0.3);
      master.connect(bus.input);
      const bank = { master, oscs: [], dead: false, left: 0 };
      for (const p of parts) {
        if (Math.abs(p.amp) < 1e-4) continue;
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = p.freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(Math.abs(p.amp), t0 + 0.01);
        g.gain.setTargetAtTime(1e-4, t0 + 0.01, p.tau);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + clamp(p.tau * 7, 0.6, 8));
        bank.left++;
        osc.onended = () => {
          try { osc.disconnect(); g.disconnect(); } catch {}
          if (--bank.left === 0) {
            try { master.disconnect(); } catch {}
            const i = banks.indexOf(bank);
            if (i >= 0) banks.splice(i, 1);
          }
        };
        bank.oscs.push({ osc, g });
      }
      if (bank.left === 0) { try { master.disconnect(); } catch {} return bank; }
      banks.push(bank);
      if (banks.length > 3) {           // hard cap on concurrent banks
        const oldest = banks[0];
        if (!oldest.dead) { oldest.dead = true; audio.rampTo(oldest.master.gain, 0, 0.01); }
      }
      return bank;
    }

    function pluck(beta, strength) {
      const c = audio.ensureAudio();
      killBanks();
      const spec = pluckSpectrum(beta);
      currentSpec = spec;
      waveCache = null;
      const t0 = c.currentTime + 0.012;
      const parts = spec.map((a, i) => ({ freq: (i + 1) * F0, amp: a, tau: tauOf(i + 1) }));
      makeBank(t0, parts, 0.55 * clamp(strength, 0.2, 1));
      const norm = envelopeNorm(beta);
      // the normalized spectrum reconstructs a triangle of height 1/norm, so
      // scaling by strength·norm makes the drawn release match the visitor's pull
      excite = { kind: 'pluck', beta, spec, t0, norm, strengthVis: clamp(strength, 0.2, 1) * norm };
      everTouched = true;
      const s = snapBeta(beta, 1e-9);   // exact only (drag already snapped)
      mathEl.innerHTML = `aₙ ∝ sin(nπβ)/n² · ${betaNote(beta, s.q ? s : null)}`;
      if (Math.abs(beta - 0.5) < 0.011) { qMid = true; refreshQuest(); }
    }

    function flageolet(fl) {
      const c = audio.ensureAudio();
      killBanks();
      const t0 = c.currentTime + 0.012;
      const amps = [0.72, 0.2, 0.08];
      const parts = amps.map((a, i) => ({
        freq: (i + 1) * fl.den * F0, amp: a, tau: 2.4 / (i + 1),
      }));
      makeBank(t0, parts, 0.42);
      excite = { kind: 'flag', num: fl.num, den: fl.den, t0, name: fl.name };
      everTouched = true;
      mathEl.innerHTML =
        `touched at ${fl.num}/${fl.den} → only modes with a node there survive: ` +
        `n = ${fl.den}, ${2 * fl.den}, ${3 * fl.den}, … · f = ${fl.den}·f₀ = ${fl.den * F0} Hz — ${fl.name}`;
    }

    function betaNote(beta, snap) {
      if (snap && snap.q) {
        return `β = ${snap.p}/${snap.q} → sin(nπβ) = 0 for n = ${snap.q}, ${2 * snap.q}, ${3 * snap.q}, … — those harmonics fall silent`;
      }
      return `β = ${beta.toFixed(3)} — no harmonic exactly silenced`;
    }

    /* ---------- audio: sustained keyboard ---------- */

    function keyboardWave(c) {
      if (waveCache) return waveCache;
      const real = new Float32Array(NH + 1);
      const imag = new Float32Array(NH + 1);
      let any = false;
      for (let n = 1; n <= NH; n++) { imag[n] = currentSpec[n - 1]; if (imag[n] !== 0) any = true; }
      if (!any) imag[1] = 1;
      waveCache = c.createPeriodicWave(real, imag);
      return waveCache;
    }

    function keyFreq(row, i) {
      return row === 'ji'
        ? ROOT * JI[i][0] / JI[i][1]
        : ROOT * Math.pow(2, ET_STEPS[i] / 12);
    }

    function toggleKey(row, i, el, rat) {
      const id = `${row}-${i}`;
      if (voices.has(id)) { releaseKey(id); refreshDyad(); return; }
      const c = audio.ensureAudio();
      if (voices.size >= 4) releaseKey(voices.keys().next().value);   // cap held voices
      const osc = c.createOscillator();
      osc.setPeriodicWave(keyboardWave(c));
      osc.frequency.value = keyFreq(row, i);
      const g = c.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(bus.input);
      osc.start();
      audio.rampTo(g.gain, 0.17, 0.02);
      voices.set(id, { osc, g, freq: keyFreq(row, i), deg: DEGREES[i], row, rat, el });
      el.classList.add('on');
      refreshDyad();
    }

    function releaseKey(id) {
      const v = voices.get(id);
      if (!v) return;
      voices.delete(id);
      v.el.classList.remove('on');
      const c = audio.getContext();
      audio.rampTo(v.g.gain, 0, 0.04);
      try { v.osc.stop(c.currentTime + 0.35); } catch {}
      v.osc.onended = () => { try { v.osc.disconnect(); v.g.disconnect(); } catch {} };
    }

    function releaseAllKeys() {
      for (const id of [...voices.keys()]) releaseKey(id);
      refreshDyad();
    }

    function keyLabel(v) { return `${v.deg}·${v.row === 'ji' ? 'just' : 'equal'}`; }

    function refreshDyad() {
      const held = [...voices.values()].sort((a, b) => a.freq - b.freq);
      // quest bookkeeping: a "do" drone plus mi on either row
      const has = (id) => voices.has(id);
      const root = has('ji-0') || has('et-0');
      if (root && has('ji-2')) qJI3 = true;
      if (root && has('et-2')) qET3 = true;
      refreshQuest();

      if (held.length === 0) {
        ro.set('hold two keys — the readout will name the beating partials.');
      } else if (held.length === 1) {
        const v = held[0];
        ro.set(`${keyLabel(v)} (${v.rat}) = ${v.freq.toFixed(2)} Hz · ${cents(v.freq / ROOT).toFixed(2)} ¢ above do`);
      } else if (held.length === 2) {
        const [lo, hi] = held;
        const ic = cents(hi.freq / lo.freq);
        const bp = beatPair(lo.freq, hi.freq);
        let beat;
        if (bp.d < 0.05) {
          beat = `partial ${bp.m} of ${keyLabel(lo)} = partial ${bp.n} of ${keyLabel(hi)} = ${(bp.m * lo.freq).toFixed(1)} Hz — locked, 0.00 beats/s`;
        } else if (bp.d < 30) {
          beat = `partial ${bp.m} (${(bp.m * lo.freq).toFixed(1)} Hz) vs partial ${bp.n} (${(bp.n * hi.freq).toFixed(1)} Hz) → ${bp.d.toFixed(2)} beats/s`;
        } else {
          beat = 'no low partials nearly coincide';
        }
        ro.set(`${keyLabel(hi)} over ${keyLabel(lo)} = ${ic.toFixed(2)} ¢ · ${beat}`);
      } else {
        ro.set(`${held.map(keyLabel).join(' + ')} — hold exactly two to read the beats`);
      }
    }

    function refreshQuest() {
      if (qMid && qJI3 && qET3) {
        quest.done('Heard: the just third locks its partials — zero beats — while the tempered third churns about nine times a second. That dyad is the entire war.');
      } else {
        quest.set(
          `${qMid ? '✓' : '①'} pluck the string at its exact midpoint and watch the even harmonics die · ` +
          `${(qJI3 && qET3) ? '✓' : '②'} hold <em>do</em> with <em>mi</em> on the just row, then swap <em>mi</em> to the equal row, and read the beats`);
      }
    }

    /* ---------- geometry & pointer ---------- */

    function geo() {
      const W = handle.width, H = handle.height;
      const mx = Math.max(34, W * 0.055);
      const sx0 = mx, sx1 = W - mx, sw = sx1 - sx0;
      const sy = 96, amp = 54, flagY = sy + 84;
      const spTop = sy + 118, spBot = H - 26, spH = spBot - spTop;
      return { W, H, sx0, sx1, sw, sy, amp, flagY, spTop, spBot, spH };
    }

    const cnv = handle.canvas;
    function onDown(e) {
      const [x, y] = cv.pointerPos(handle, e);
      const g = geo();
      for (const fl of FLAGEOLETS) {
        const fx = g.sx0 + (fl.num / fl.den) * g.sw;
        if ((x - fx) * (x - fx) + (y - g.flagY) * (y - g.flagY) < 15 * 15) {
          flageolet(fl);
          return;
        }
      }
      if (Math.abs(y - g.sy) < 64 && x >= g.sx0 - 8 && x <= g.sx1 + 8) {
        e.preventDefault();
        audio.ensureAudio();
        const s = snapBeta(clamp((x - g.sx0) / g.sw, 0.02, 0.98));
        drag = { beta: s.beta, snap: s.q ? s : null, h: clamp((g.sy - y) / g.amp, -1, 1), moved: false };
        try { cnv.setPointerCapture(e.pointerId); } catch {}
        mathEl.innerHTML = `aₙ ∝ sin(nπβ)/n² · ${betaNote(drag.beta, drag.snap)}`;
      }
    }
    function onMove(e) {
      if (!drag) return;
      const [x, y] = cv.pointerPos(handle, e);
      const g = geo();
      const s = snapBeta(clamp((x - g.sx0) / g.sw, 0.02, 0.98));
      drag.beta = s.beta;
      drag.snap = s.q ? s : null;
      drag.h = clamp((g.sy - y) / g.amp, -1, 1);
      drag.moved = true;
      mathEl.innerHTML = `aₙ ∝ sin(nπβ)/n² · ${betaNote(drag.beta, drag.snap)}`;
    }
    function onUp(e) {
      if (!drag) return;
      const strength = drag.moved && Math.abs(drag.h) > 0.12 ? Math.abs(drag.h) : 0.55;
      pluck(drag.beta, strength);
      drag = null;
      try { cnv.releasePointerCapture(e.pointerId); } catch {}
    }
    function onCancel() { drag = null; }
    cnv.addEventListener('pointerdown', onDown);
    cnv.addEventListener('pointermove', onMove);
    cnv.addEventListener('pointerup', onUp);
    cnv.addEventListener('pointercancel', onCancel);

    /* ---------- drawing ---------- */

    const FVIS = 1.05;                 // visual fundamental, Hz (~105× slowdown)
    const AMAX = 0.85, HEXP = 0.6;     // bar scale: (a/AMAX)^0.6 — compressed, zeros honest
    const barH = (a, spH) => Math.pow(clamp(a / AMAX, 0, 1), HEXP) * spH * 0.92;

    function excAmps(now) {
      // audible partial magnitudes right now, from the audio clock
      const out = new Float64Array(NH);
      if (!excite) return out;
      const dt = Math.max(0, now - excite.t0);
      if (dt > 8.2) { excite = null; return out; }
      if (excite.kind === 'pluck') {
        for (let n = 1; n <= NH; n++) out[n - 1] = Math.abs(excite.spec[n - 1]) * Math.exp(-dt / tauOf(n));
      } else {
        const amps = [0.72, 0.2, 0.08];
        for (let m = 1; m <= 3; m++) {
          const idx = m * excite.den;
          if (idx <= NH) out[idx - 1] = amps[m - 1] * Math.exp(-dt / (2.4 / m));
        }
      }
      return out;
    }

    function stringShape(xf, now) {
      // xf in [0,1] → vertical displacement in [-1,1]-ish units
      const dt = Math.max(0, now - excite.t0);
      if (excite.kind === 'pluck') {
        let y = 0;
        for (let n = 1; n <= NH; n++) {
          y += excite.spec[n - 1] * Math.sin(n * Math.PI * xf) *
               Math.cos(TAU * n * FVIS * dt) * Math.exp(-dt / tauOf(n));
        }
        return y * excite.strengthVis;
      }
      return 0.55 * Math.sin(excite.den * Math.PI * xf) *
             Math.cos(TAU * excite.den * FVIS * dt) * Math.exp(-dt / 2.4);
    }

    function draw() {
      const g = geo();
      const { ctx } = handle;
      ctx.clearRect(0, 0, g.W, g.H);
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;

      /* fraction ticks above the string */
      ctx.font = `10px ${MONO}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const glyphs = ['½', '⅓', '⅔', '¼', '¾', '⅕', '⅖', '⅗', '⅘'];
      SNAPS.forEach(([p, q], i) => {
        const x = g.sx0 + (p / q) * g.sw;
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(x, g.sy - g.amp - 12); ctx.lineTo(x, g.sy - g.amp - 4); ctx.stroke();
        ctx.fillStyle = P.inkFaint;
        ctx.fillText(glyphs[i], x, g.sy - g.amp - 16);
      });

      /* bridges */
      ctx.fillStyle = P.goldDim;
      for (const bx of [g.sx0, g.sx1]) {
        ctx.beginPath();
        ctx.moveTo(bx - 7, g.sy + 22); ctx.lineTo(bx + 7, g.sy + 22); ctx.lineTo(bx, g.sy);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(g.sx0 - 14, g.sy + 22.5); ctx.lineTo(g.sx1 + 14, g.sy + 22.5); ctx.stroke();

      /* the string */
      if (drag) {
        const px = g.sx0 + drag.beta * g.sw, py = g.sy - drag.h * g.amp;
        ctx.strokeStyle = P.line; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(g.sx0, g.sy); ctx.lineTo(g.sx1, g.sy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(g.sx0, g.sy); ctx.lineTo(px, py); ctx.lineTo(g.sx1, g.sy); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = P.goldBright;
        ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = P.inkDim; ctx.font = `11px ${MONO}`;
        ctx.fillText(`β = ${drag.snap ? `${drag.snap.p}/${drag.snap.q}` : drag.beta.toFixed(3)}`, px, py < g.sy ? py - 10 : py + 16);
      } else if (excite) {
        const NPTS = 150;
        // soft glow pass + bright pass (no shadowBlur in the loop)
        const col = excite.kind === 'flag' ? P.azure : P.gold;
        for (const [lw, alpha] of [[4, 0.28], [1.7, 1]]) {
          ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = lw;
          ctx.beginPath();
          for (let i = 0; i <= NPTS; i++) {
            const xf = i / NPTS;
            const y = g.sy - stringShape(xf, now) * g.amp;
            const x = g.sx0 + xf * g.sw;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
        if (excite.kind === 'flag') {
          // nodes of the surviving mode + the touch point
          for (let k = 1; k < excite.den; k++) {
            const x = g.sx0 + (k / excite.den) * g.sw;
            ctx.fillStyle = P.inkDim;
            ctx.beginPath(); ctx.arc(x, g.sy, 3, 0, TAU); ctx.fill();
          }
          const tx = g.sx0 + (excite.num / excite.den) * g.sw;
          ctx.strokeStyle = P.azure;
          ctx.beginPath(); ctx.arc(tx, g.sy, 8, 0, TAU); ctx.stroke();
          ctx.fillStyle = P.azure; ctx.font = `11px ${MONO}`;
          ctx.fillText(`f = ${excite.den}·f₀ = ${excite.den * F0} Hz`, tx, g.sy - g.amp - 2);
        }
      } else {
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(g.sx0, g.sy); ctx.lineTo(g.sx1, g.sy); ctx.stroke();
        ctx.lineWidth = 1;
        if (!everTouched) {
          ctx.fillStyle = P.inkFaint; ctx.font = `italic 12px ${MONO}`;
          ctx.fillText('press the string · pull · release', (g.sx0 + g.sx1) / 2, g.sy - 26);
        }
      }

      /* flageolet touch-points */
      for (const fl of FLAGEOLETS) {
        const x = g.sx0 + (fl.num / fl.den) * g.sw;
        const active = excite && excite.kind === 'flag' && excite.den === fl.den;
        ctx.fillStyle = active ? P.azure : P.azureDim;
        ctx.save();
        ctx.translate(x, g.flagY); ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.restore();
        ctx.fillStyle = active ? P.azure : P.inkFaint;
        ctx.font = `10px ${MONO}`;
        ctx.fillText(fl.glyph, x, g.flagY + 20);
      }

      /* stop-points of held keyboard notes: length fraction f₀/f from the nut */
      for (const v of voices.values()) {
        const x = g.sx0 + (F0 / v.freq) * g.sw;
        ctx.fillStyle = v.row === 'ji' ? P.gold : P.azure;
        ctx.beginPath();
        ctx.moveTo(x, g.sy + 6); ctx.lineTo(x - 4, g.sy + 14); ctx.lineTo(x + 4, g.sy + 14);
        ctx.closePath(); ctx.fill();
        ctx.font = `9px ${MONO}`;
        ctx.fillText(v.deg, x, g.sy + 34);
      }

      /* spectrum */
      const amps = excAmps(now);
      const colW = g.sw / NH;
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(g.sx0, g.spBot + 0.5); ctx.lineTo(g.sx1, g.spBot + 0.5); ctx.stroke();
      ctx.fillStyle = P.inkFaint; ctx.font = `10px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillText(`|aₙ|·e^(−t/τₙ) — partials of f₀ = ${F0} Hz`, g.sx0, g.spTop - 4);
      ctx.textAlign = 'center';
      const isFlag = excite && excite.kind === 'flag';
      for (let n = 1; n <= NH; n++) {
        const h = barH(amps[n - 1], g.spH);
        const x = g.sx0 + (n - 1) * colW;
        if (h > 0.5) {
          ctx.fillStyle = isFlag ? P.azure : P.gold;
          ctx.fillRect(x + colW * 0.18, g.spBot - h, colW * 0.64, h);
        } else if (excite && excite.kind === 'pluck' &&
                   Math.abs(Math.sin(n * Math.PI * excite.beta)) < 0.004) {
          ctx.fillStyle = P.crimson; ctx.font = `10px ${MONO}`;
          ctx.fillText('×', x + colW / 2, g.spBot - 4);   // a silenced harmonic
        }
        if (colW >= 22 || n % 2 === 1) {
          ctx.fillStyle = P.inkFaint; ctx.font = `9px ${MONO}`;
          ctx.fillText(String(n), x + colW / 2, g.spBot + 12);
        }
      }

      /* the sin(nπβ)/n² envelope — slides with the pluck point */
      const envBeta = drag ? drag.beta : (excite && excite.kind === 'pluck' ? excite.beta : null);
      if (envBeta != null) {
        const S = drag ? envelopeNorm(envBeta) : excite.norm;
        ctx.strokeStyle = P.azureDim; ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let v = 1; v <= NH; v += 0.08) {
          const a = Math.abs(harmonicAmp(v, envBeta)) / S;
          const x = g.sx0 + (v - 0.5) * colW;
          const y = g.spBot - barH(a, g.spH);
          v === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    const loop = cv.rafLoop(draw);
    loop.start();
    refreshQuest();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        killBanks();
        releaseAllKeys();
        bus.mute();
      },
      resume() {
        bus.unmute();
        loop.start();
      },
      destroy() {
        loop.stop();
        killBanks();
        releaseAllKeys();
        cnv.removeEventListener('pointerdown', onDown);
        cnv.removeEventListener('pointermove', onMove);
        cnv.removeEventListener('pointerup', onUp);
        cnv.removeEventListener('pointercancel', onCancel);
        bus.dispose();
        handle.destroy();
        style.remove();
      },
    };
  },
};

export const _test = { harmonicAmp, pluckSpectrum, envelopeNorm, beatPair, snapBeta, cents };
