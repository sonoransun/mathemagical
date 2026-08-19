// II.3 — The Harmonograph
// Two tones drive x and y; consonance draws a closed figure, and the beating
// you hear is literally the rotation you see. Lissajous curves, the generalized
// beat theorem |q·f1 − p·f2|, Victorian damped-pendulum ink drawings, and — in
// three dimensions — chords as knots.

import { TAU, clamp, continuedFraction, convergents } from '../../core/math.js';

/* ---------------- pure logic (node-testable) ---------------- */

// The generalized beat: a Lissajous figure near the rational ratio p:q
// precesses (returns to its own shape) at exactly |q·f1 − p·f2| Hz.
function precessionHz(f1, f2, p, q) {
  return Math.abs(q * f1 - p * f2);
}

// The point generator: x = sin(2π f1 t + φ), y = sin(2π f2 t).
// Periodic iff f1/f2 is rational; for f1/f2 = p/q the period is q/f2.
function lissajousPoint(t, { f1, f2, phase = 0 }) {
  return [Math.sin(TAU * f1 * t + phase), Math.sin(TAU * f2 * t)];
}

// The Victorian machine: damped pendulums. x = e^(−d1·t)·sin(2π f1 t + φ), etc.
function harmonographPoint(t, { f1, f2, phase = 0, d1 = 0.16, d2 = 0.19 }) {
  return [
    Math.exp(-d1 * t) * Math.sin(TAU * f1 * t + phase),
    Math.exp(-d2 * t) * Math.sin(TAU * f2 * t),
  ];
}

// A three-frequency Lissajous curve in R^3, parameter u ∈ [0, 2π).
function knotPoint(u, n, ph) {
  return [
    Math.sin(n[0] * u + ph[0]),
    Math.sin(n[1] * u + ph[1]),
    Math.sin(n[2] * u + ph[2]),
  ];
}

// Deepest continued-fraction convergent p/q of x with q ≤ maxDen — the
// "nearest simple ratio" the ear and eye are both measuring against.
function nearestRatio(x, maxDen = 12) {
  const cv = convergents(continuedFraction(x, 24));
  let best = cv[0];
  for (const [p, q] of cv) if (q <= maxDen) best = [p, q];
  return [best[0], best[1]];
}

const INTERVAL_NAMES = {
  '1:1': 'unison', '2:1': 'octave', '3:2': 'perfect fifth', '4:3': 'perfect fourth',
  '5:4': 'major third', '6:5': 'minor third', '5:3': 'major sixth',
  '8:5': 'minor sixth', '9:8': 'major second', '7:4': 'harmonic seventh',
};
function intervalName(p, q) {
  return INTERVAL_NAMES[`${p}:${q}`] || null;
}

const SNAPS = [[1, 1], [3, 2], [2, 1], [4, 3], [5, 4], [5, 3]];

// Knot-mode voicings of the just major triad. Frequencies are ratio × 55 Hz.
// 4:5:6 shares a factor 2 between x and z, so its space curve touches itself;
// the pairwise-coprime voicings are embedded closed curves (Lissajous knots).
const CHORDS = [
  { n: [4, 5, 6], label: '4:5:6 · root position', note: 'close voicing — the curve touches itself', coprime: false },
  { n: [3, 4, 5], label: '3:4:5 · second inversion', note: 'pairwise coprime — an embedded curve', coprime: true },
  { n: [2, 3, 5], label: '2:3:5 · open voicing', note: 'the same chord across two octaves — embedded', coprime: true },
];
const KNOT_PHASES = [1.17, 0.42, 0.0];
const KNOT_BASE = 55; // Hz per ratio unit → 4:5:6 sounds at 220, 275, 330 Hz

/* ---------------- the exhibit ---------------- */

export default {
  id: 'harmonograph',
  movement: 2,
  title: 'The Harmonograph',
  hook: 'What a chord looks like.',
  prose: `
    <p>Wire the two channels of a stereo pair to the two axes of a point of light — the tone in
    your left ear pushes it east–west, the tone in your right pushes it north–south — and a
    chord becomes a drawing. Nathaniel Bowditch traced these curves with a compound pendulum in
    1815; Jules Lissajous made them famous in 1857 by bouncing a beam of light off small mirrors
    glued to two tuning forks held at right angles. What the forks knew is this movement's
    refrain: <em>the figure closes exactly when the frequency ratio is rational</em>. Sound a
    perfect fifth — <code>3:2</code> — and the light folds into a pretzel that presses against
    the sides of its frame three times and the top twice. The ratio can be read off the glass
    like a fraction.</p>
    <p>The theorem of this exhibit is what happens when the ratio <em>almost</em> holds. Tune
    <em>x</em> to 331 Hz against <em>y</em>'s 220 — a whisker sharp of a true fifth — and the
    figure no longer closes. It precesses, tumbling through every version of itself at exactly
    <code>|q·f₁ − p·f₂| = |2·331 − 3·220| = 2</code> turns per second. That expression is the
    beat frequency, generalized. At unison it collapses to the familiar <code>|f₁ − f₂|</code>:
    detune by 0.3 Hz and the ellipse rolls over once every 3.33 seconds while your ears report
    one slow <em>wah</em> every 3.33 seconds. These are not two phenomena that happen to agree.
    The wah <em>is</em> the rotation, reported by a different sense.</p>
    <p>And here the eye proves the sharper instrument. A mistuned unison beats loudly — the two
    waves genuinely cancel and reinforce in the air. But a mistuned fifth played with pure sine
    tones barely beats at all: nothing in the air pulses at 2 Hz, and what faint roughness you
    hear is manufactured inside the ear itself. The oscilloscope has no such modesty. It shows
    the sour fifth tumbling at exactly the rate the arithmetic demands, as plainly as the sour
    unison. Whatever else consonance may be, on this screen it is simply the visible smallness
    of a fraction.</p>
    <p>The Victorians built this exhibit out of hardware. A <em>harmonograph</em> — two pendulums,
    a sheet of paper, a pen on linked arms — draws the same curves with one addition: friction.
    Each swing is a shade smaller than the last, <code>x = A·e^(−dt)·sin(2πf₁t + φ)</code>, so
    ink that would merely retrace itself instead lays every pass just inside the one before.
    The tumble becomes a woven spiral, the decay a perspective drawing of time; the machine's
    whole charm is a damping term. Flip the exhibit into ink mode and the tone dies away at the
    same exponential rate the drawing shrinks — you hear the figure converge.</p>
    <p>One more axis remains. Give a third tone the <em>z</em> direction and a triad becomes a
    closed curve in three-dimensional space — the major chord <code>4:5:6</code> a specific
    loop you can turn in your hands, its projections changing the way a chord's inversions
    revoice the same harmony. In close position the curve touches itself; open the voicing to
    <code>2:3:5</code> — the same chord spread across two octaves, its frequencies now pairwise
    coprime — and the crossings resolve into an embedded loop. Mathematicians study exactly
    these as <em>Lissajous knots</em>, and a genuine theorem constrains the repertoire: a
    Lissajous knot must have Arf invariant zero, so the trefoil — the simplest knot there is —
    can never be played by any chord. A small community of oscilloscope musicians composes this
    way today, writing stereo sound engineered so that its own waveform, wired to a scope's
    <em>x</em> and <em>y</em> inputs, draws the picture you watch.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    /* ---------- state ---------- */
    let mode = 'scope';            // 'scope' | 'ink' | 'knot'
    let f2 = 220;                  // y / right-ear frequency (Hz)
    let f1base = 330;              // x / left-ear frequency before detune
    let det = 0.3;                 // detune applied to x (Hz)
    let snap = '3:2';              // active snap label or null
    let phaseTarget = Math.PI / 2; // φ on x
    let phaseDisp = Math.PI / 2;   // smoothed φ used for drawing
    let th1 = 0, th2 = 0;          // accumulated scope phases (visual clock)
    let nr = [3, 2];               // cached nearest ratio for current f1/f2
    let soundOn = false;
    let pen = null;                // ink-mode pen state
    let chordIdx = 0;              // knot-mode voicing
    let yaw = 0.7, pitch = 0.4, dragging = false, dragX = 0, dragY = 0;
    let questDone = false;

    const DX = 0.16, DY = 0.19;    // ink damping (1/s)
    const LVL = 0.14, LVL3 = 0.11; // per-voice levels (hard-panned sines sum loud)

    const bus = audio.createBus('harmonograph');
    let vx = null, vy = null, vz = null;   // the only oscillators — reused forever

    const f1 = () => f1base + det;
    const chord = () => CHORDS[chordIdx];

    /* ---------- layout ---------- */
    const handle = cv.setupCanvas(stage, { height: 480 });
    const glow = cv.glowSprite(P.goldBright, 26);

    const row1 = ui.controlRow(stage);
    const soundBtn = ui.button(row1, '♪ sound the dyad', toggleSound, { primary: true });
    const f1Slider = ui.slider(row1, {
      label: 'x — left ear', min: 110, max: 880, step: 0.1, value: f1base,
      format: (v) => `${v.toFixed(1)} Hz`,
      onInput: (v) => { f1base = v; snap = null; onFreqsChanged(); },
    });
    const f2Slider = ui.slider(row1, {
      label: 'y — right ear', min: 110, max: 440, step: 1, value: f2,
      format: (v) => `${v.toFixed(0)} Hz`,
      onInput: (v) => {
        f2 = v;
        if (snap) { const [p, q] = snap.split(':').map(Number); f1base = f2 * p / q; f1Slider.set(f1base); }
        onFreqsChanged();
      },
    });
    const detSlider = ui.slider(row1, {
      label: 'detune x', min: -3, max: 3, step: 0.01, value: det,
      format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} Hz`,
      onInput: (v) => { det = v; onFreqsChanged(); },
    });
    const phSlider = ui.slider(row1, {
      label: 'phase φ', min: 0, max: 360, step: 1, value: 90,
      format: (v) => `${v.toFixed(0)}°`,
      onInput: (v) => { phaseTarget = v * Math.PI / 180; },
    });

    const row2 = ui.controlRow(stage);
    const snapBtns = SNAPS.map(([p, q]) => {
      const name = intervalName(p, q);
      const b = ui.button(row2, `${p}:${q}${name ? ' ' + name.replace('perfect ', '').replace('major ', 'maj ') : ''}`,
        () => applySnap(p, q), { small: true });
      b.dataset.snap = `${p}:${q}`;
      return b;
    });
    const inkToggle = ui.toggle(row2, {
      label: 'harmonograph ink', value: false,
      onChange: (v) => { if (v) { knotToggle.set(false); setMode('ink'); } else setMode('scope'); },
    });
    const penBtn = ui.button(row2, '⟳ drop the pen again', () => { resetPen(); }, { small: true });
    const knotToggle = ui.toggle(row2, {
      label: 'third axis — z', value: false,
      onChange: (v) => { if (v) { inkToggle.set(false); setMode('knot'); } else setMode('scope'); },
    });
    const chordSel = ui.select(row2, {
      label: 'voicing', value: '0',
      options: CHORDS.map((c, i) => ({ value: String(i), label: c.label })),
      onChange: (v) => { chordIdx = +v; onFreqsChanged(); },
    });

    const quest = ui.questBanner(stage,
      'Snap to <em>1:1 unison</em>, set the detune to <em>+0.30 Hz</em>, press ♪ — then count: ' +
      'the ellipse should tumble once every 3.33 s, exactly in time with the wah in your ears.');
    const info = ui.readout(stage, '');
    const capEl = ui.caption(stage, '');

    /* ---------- control refresh ---------- */
    function refreshControls() {
      const scopeish = mode !== 'knot';
      f1Slider.el.style.display = scopeish ? '' : 'none';
      f2Slider.el.style.display = scopeish ? '' : 'none';
      detSlider.el.style.display = scopeish ? '' : 'none';
      phSlider.el.style.display = scopeish ? '' : 'none';
      for (const b of snapBtns) {
        b.style.display = scopeish ? '' : 'none';
        b.classList.toggle('active', b.dataset.snap === snap);
      }
      penBtn.style.display = mode === 'ink' ? '' : 'none';
      chordSel.el.style.display = mode === 'knot' ? '' : 'none';
      inkToggle.set(mode === 'ink');
      knotToggle.set(mode === 'knot');
      soundBtn.textContent = soundOn ? '■ silence'
        : mode === 'knot' ? '♪ sound the chord' : '♪ sound the dyad';
      soundBtn.classList.toggle('active', soundOn);
    }

    function setCaption() {
      if (mode === 'scope') capEl.innerHTML =
        'The stereo field is the coordinate system: the left channel drives <em>x</em>, the right drives ' +
        '<em>y</em>. The faint frame marks full swing — count its tangencies (sides : top) to read the ' +
        'ratio. The strips below and beside are the two driving tones themselves.';
      else if (mode === 'ink') capEl.innerHTML =
        'The Victorian machine: <code>x = e<sup>−0.16t</sup>·sin(2πf₁t + φ)</code>, ' +
        '<code>y = e<sup>−0.19t</sup>·sin(2πf₂t)</code>. The pen never lifts and the ink never fades; ' +
        'a few tenths of a hertz of detune weaves the decay into lace. The tone dies at the same rate as the swing.';
      else capEl.innerHTML =
        'A triad as a curve in 3-space: drag to turn the chord in your hands — inversions are projections. ' +
        'Depth shades azure (far) to gold (near). In close position <code>4:5:6</code> the curve touches ' +
        'itself; the pairwise-coprime voicings are embedded — the family knot theorists call Lissajous knots.';
    }

    /* ---------- audio ---------- */
    function ensureVoices() {
      if (!vx) {
        vx = audio.voice(bus, { freq: 330, level: LVL, pan: -1 });
        vy = audio.voice(bus, { freq: 220, level: LVL, pan: 1 });
      }
      if (mode === 'knot' && !vz) vz = audio.voice(bus, { freq: 330, level: LVL3, pan: 0 });
    }

    function setFreqsNow() {
      if (!vx) return;
      if (mode === 'knot') {
        const n = chord().n;
        vx.setFreq(n[0] * KNOT_BASE);
        vy.setFreq(n[1] * KNOT_BASE);
        if (vz) vz.setFreq(n[2] * KNOT_BASE);
      } else {
        vx.setFreq(f1());
        vy.setFreq(f2);
      }
    }

    function toggleSound() {
      audio.ensureAudio();
      soundOn = !soundOn;
      if (soundOn) {
        ensureVoices();
        setFreqsNow();
        // In ink mode the rAF loop drives the decaying envelope; start from the ramp.
        if (mode !== 'ink') { vx.on(LVL); vy.on(LVL); }
        if (mode === 'knot' && vz) vz.on(LVL3);
      } else {
        if (vx) { vx.off(); vy.off(); }
        if (vz) vz.off();
      }
      refreshControls();
    }

    function onFreqsChanged() {
      nr = nearestRatio(f1() / f2);
      setFreqsNow();               // glides — no clicks on slider drags
      refreshControls();
      refreshReadout();
    }

    function applySnap(p, q) {
      snap = `${p}:${q}`;
      f1base = f2 * p / q;
      f1Slider.set(f1base);
      onFreqsChanged();
    }

    /* ---------- modes ---------- */
    function setMode(m) {
      if (mode === m) return;
      mode = m;
      if (m !== 'knot' && vz) vz.off();
      if (m === 'ink') resetPen(); else pen = null;
      paintBg();
      if (soundOn && vx) {
        if (m === 'knot') { ensureVoices(); vz.on(LVL3); }
        setFreqsNow();
        if (m === 'scope' || m === 'knot') { vx.on(LVL); vy.on(LVL); }
      }
      refreshControls();
      refreshReadout();
      setCaption();
    }

    function resetPen() {
      pen = { t: 0, th1: 0, th2: 0, px: null, py: null, done: false };
      paintBg();
      refreshReadout();
    }

    /* ---------- readout ---------- */
    function refreshReadout() {
      if (mode === 'knot') {
        const c = chord();
        const fr = c.n.map((k) => k * KNOT_BASE);
        info.set(
          `x:y:z = ${c.n.join(':')}  ·  ${fr.map((f) => f.toFixed(0)).join(', ')} Hz` +
          `  ·  ${c.note}`);
        return;
      }
      const [p, q] = nr;
      const prec = precessionHz(f1(), f2, p, q);
      const name = intervalName(p, q);
      let s = `x = ${f1().toFixed(2)} Hz (left)  ·  y = ${f2.toFixed(2)} Hz (right)` +
        `  ·  near ${p}:${q}${name ? ` — a ${name}` : ''}` +
        `  ·  |q·f₁ − p·f₂| = ${prec.toFixed(2)} Hz`;
      if (prec < 0.005) s += '  →  closed: the figure holds still';
      else if (prec > 10) s += '  →  too fast to follow — shimmer to the eye, roughness to the ear';
      else s += `  →  one tumble every ${(1 / prec).toFixed(2)} s`;
      if (mode === 'ink' && pen) {
        s += pen.done ? '   ·   the pen has come to rest' : `   ·   pen t = ${pen.t.toFixed(1)} s`;
      }
      info.set(s);
    }

    /* ---------- drawing ---------- */
    const STRIP = 46;

    function paintBg() {
      const { ctx, width: W, height: H } = handle;
      ctx.fillStyle = P.bg;
      ctx.fillRect(0, 0, W, H);
    }

    function plotFrame() {
      const { width: W, height: H } = handle;
      const pw = W - STRIP, phh = H - STRIP;
      const A = Math.min(pw, phh) * 0.42;
      return { pw, phh, cx: pw / 2, cy: phh / 2, A };
    }

    function drawStrips(ampX, ampY) {
      const { ctx, width: W, height: H } = handle;
      const { pw, phh } = plotFrame();
      const mono = '10px ui-monospace, Menlo, monospace';
      // bottom strip: the x (left-ear) tone
      ctx.fillStyle = P.bg;
      ctx.fillRect(0, phh + 2, W, STRIP - 2);
      ctx.strokeStyle = P.goldDim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const midB = phh + STRIP / 2 + 2;
      for (let i = 0; i <= pw; i += 2) {
        const tau = -((pw - i) / pw) * 0.04;
        const v = ampX * Math.sin(th1 + phaseDisp + TAU * f1() * tau);
        const y = midB + v * (STRIP * 0.34);
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
      }
      ctx.stroke();
      ctx.fillStyle = P.inkFaint;
      ctx.font = mono;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('x · left ear', 6, phh + 5);
      // right strip: the y (right-ear) tone
      ctx.fillStyle = P.bg;
      ctx.fillRect(pw + 2, 0, STRIP - 2, phh);
      ctx.strokeStyle = P.azureDim;
      ctx.beginPath();
      const midR = pw + STRIP / 2 + 2;
      for (let j = 0; j <= phh; j += 2) {
        const tau = -((phh - j) / phh) * 0.04;
        const v = ampY * Math.sin(th2 + TAU * f2 * tau);
        const x = midR + v * (STRIP * 0.34);
        j === 0 ? ctx.moveTo(x, phh - j) : ctx.lineTo(x, phh - j);
      }
      ctx.stroke();
      ctx.save();
      ctx.translate(W - 8, 6);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = P.inkFaint;
      ctx.font = mono;
      ctx.fillText('y · right ear', 0, 0);
      ctx.restore();
      // separators
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, phh + 1.5); ctx.lineTo(W, phh + 1.5);
      ctx.moveTo(pw + 1.5, 0); ctx.lineTo(pw + 1.5, phh);
      ctx.stroke();
    }

    function drawScope(dt) {
      const { ctx } = handle;
      th1 = (th1 + TAU * f1() * dt) % TAU;
      th2 = (th2 + TAU * f2 * dt) % TAU;

      cv.fadeTrail(handle, 0.3, P.bg);
      const { cx, cy, A } = plotFrame();

      // amplitude frame — count tangencies to read p:q
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - A, cy - A, 2 * A, 2 * A);

      // one closed period of the nearest rational (the near-miss precesses)
      const [, q] = nr;
      const T = q / f2;
      const N = 900;
      ctx.strokeStyle = P.gold;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      let hx = 0, hy = 0;
      for (let i = 0; i <= N; i++) {
        const tau = -T + (T * i) / N;
        const x = cx + A * Math.sin(th1 + phaseDisp + TAU * f1() * tau);
        const y = cy - A * Math.sin(th2 + TAU * f2 * tau);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        if (i === N) { hx = x; hy = y; }
      }
      ctx.stroke();
      // bright head segment
      ctx.strokeStyle = P.goldBright;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = Math.floor(N * 0.9); i <= N; i++) {
        const tau = -T + (T * i) / N;
        const x = cx + A * Math.sin(th1 + phaseDisp + TAU * f1() * tau);
        const y = cy - A * Math.sin(th2 + TAU * f2 * tau);
        i === Math.floor(N * 0.9) ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // the two shadows: project the head onto each axis of the frame
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = P.ink;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, hy); ctx.lineTo(hx, cy + A + 7);
      ctx.moveTo(hx, hy); ctx.lineTo(cx + A + 7, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.gold;
      ctx.beginPath(); ctx.arc(hx, cy + A + 7, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = P.azure;
      ctx.beginPath(); ctx.arc(cx + A + 7, hy, 3, 0, TAU); ctx.fill();

      glow.draw(ctx, hx, hy, 1);
      drawStrips(1, 1);
    }

    function drawInk(dt) {
      const { ctx } = handle;
      if (!pen) resetPen();
      th1 = (th1 + TAU * f1() * dt) % TAU;   // keep the strip clocks running
      th2 = (th2 + TAU * f2 * dt) % TAU;
      const { cx, cy, A } = plotFrame();
      let ax = Math.exp(-DX * pen.t), ay = Math.exp(-DY * pen.t);

      if (!pen.done) {
        const steps = Math.min(4000, Math.max(4, Math.ceil(dt * Math.max(f1(), f2) * 24)));
        const h = dt / steps;
        ctx.strokeStyle = P.ink;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        if (pen.px == null) {
          pen.px = cx + A * Math.exp(-DX * pen.t) * Math.sin(pen.th1 + phaseDisp);
          pen.py = cy - A * Math.exp(-DY * pen.t) * Math.sin(pen.th2);
        }
        ctx.moveTo(pen.px, pen.py);
        for (let i = 0; i < steps; i++) {
          pen.t += h;
          pen.th1 += TAU * f1() * h;
          pen.th2 += TAU * f2 * h;
          const x = cx + A * Math.exp(-DX * pen.t) * Math.sin(pen.th1 + phaseDisp);
          const y = cy - A * Math.exp(-DY * pen.t) * Math.sin(pen.th2);
          ctx.lineTo(x, y);
          pen.px = x; pen.py = y;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        pen.th1 %= TAU; pen.th2 %= TAU;
        ax = Math.exp(-DX * pen.t); ay = Math.exp(-DY * pen.t);
        if (Math.max(ax, ay) < 0.02) { pen.done = true; refreshReadout(); }
      }
      // the tone dies exactly as the swing does — envelope driven off pen time
      if (soundOn && vx) {
        audio.rampTo(vx.gain.gain, pen.done ? 0 : LVL * ax, 0.1);
        audio.rampTo(vy.gain.gain, pen.done ? 0 : LVL * ay, 0.1);
      }
      drawStrips(ax, ay);
    }

    function hexToRgb(hex) {
      return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    }
    const FAR_RGB = hexToRgb(P.azureDim);
    const NEAR_RGB = hexToRgb(P.goldBright);
    function depthColor(t) {
      const r = Math.round(FAR_RGB[0] + (NEAR_RGB[0] - FAR_RGB[0]) * t);
      const g = Math.round(FAR_RGB[1] + (NEAR_RGB[1] - FAR_RGB[1]) * t);
      const b = Math.round(FAR_RGB[2] + (NEAR_RGB[2] - FAR_RGB[2]) * t);
      return `rgb(${r},${g},${b})`;
    }

    function drawKnot(dt) {
      const { ctx, width: W, height: H } = handle;
      if (!dragging) yaw += dt * 0.22;
      paintBg();
      const cx = W / 2, cy = H / 2;
      const S = Math.min(W, H) * 0.34;
      const n = chord().n;
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const M = 720;
      const pts = new Array(M + 1);
      for (let i = 0; i <= M; i++) {
        const u = (TAU * i) / M;
        const [x, y, z] = knotPoint(u, n, KNOT_PHASES);
        const X1 = x * cyaw + z * syaw;
        const Z1 = -x * syaw + z * cyaw;
        const Y1 = y * cp - Z1 * sp;
        const Z2 = y * sp + Z1 * cp;
        const k = 4 / (4 - 0.8 * Z2);
        pts[i] = [cx + S * k * X1, cy - S * k * Y1, Z2];
      }
      const segs = new Array(M);
      for (let i = 0; i < M; i++) segs[i] = i;
      segs.sort((a, b) => (pts[a][2] + pts[a + 1][2]) - (pts[b][2] + pts[b + 1][2]));
      for (const i of segs) {
        const zMid = (pts[i][2] + pts[i + 1][2]) / 2;
        const t = clamp((zMid + 1.6) / 3.2, 0, 1);
        ctx.strokeStyle = depthColor(t);
        ctx.globalAlpha = 0.3 + 0.6 * t;
        ctx.lineWidth = 0.8 + 1.8 * t;
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.inkFaint;
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${n.join(':')}  ·  ${n.map((k) => k * KNOT_BASE).join(' / ')} Hz  ·  drag to rotate`, 10, H - 10);
    }

    function updateQuest() {
      if (questDone) return;
      if (mode === 'scope' && soundOn && nr[0] === 1 && nr[1] === 1 && det >= 0.2 && det <= 0.4) {
        questDone = true;
        quest.done('You have seen a beat. The wah and the tumble are one number: |f₁ − f₂| — and near any ' +
          'ratio p:q the same law reads |q·f₁ − p·f₂|.');
      }
    }

    function draw(dt) {
      dt = clamp(dt, 0, 0.05);
      const dphi = phaseTarget - phaseDisp;
      if (Math.abs(dphi) > 1e-5) phaseDisp += dphi * Math.min(1, dt * 8);
      if (mode === 'knot') drawKnot(dt);
      else if (mode === 'ink') drawInk(dt);
      else drawScope(dt);
      updateQuest();
    }

    /* ---------- pointer (knot rotation) ---------- */
    const onDown = (e) => {
      if (mode !== 'knot') return;
      dragging = true; dragX = e.clientX; dragY = e.clientY;
      try { handle.canvas.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e) => {
      if (!dragging || mode !== 'knot') return;
      yaw += (e.clientX - dragX) * 0.008;
      pitch = clamp(pitch + (e.clientY - dragY) * 0.008, -1.45, 1.45);
      dragX = e.clientX; dragY = e.clientY;
    };
    const onUp = (e) => {
      dragging = false;
      try { handle.canvas.releasePointerCapture(e.pointerId); } catch {}
    };
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('pointerup', onUp);
    handle.canvas.addEventListener('pointercancel', onUp);
    handle.canvas.style.touchAction = 'pan-y';

    handle.onResize(() => {
      paintBg();
      if (mode === 'ink') resetPen();
    });

    /* ---------- boot ---------- */
    paintBg();
    nr = nearestRatio(f1() / f2);
    refreshControls();
    refreshReadout();
    setCaption();
    const loop = cv.rafLoop(draw);
    loop.start();

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        bus.mute();
      },
      resume() {
        bus.unmute();
        loop.start();
      },
      destroy() {
        loop.stop();
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointermove', onMove);
        handle.canvas.removeEventListener('pointerup', onUp);
        handle.canvas.removeEventListener('pointercancel', onUp);
        if (vx) { vx.dispose(); vy.dispose(); }
        if (vz) vz.dispose();
        bus.dispose();
        handle.destroy();
      },
    };
  },
};

export const _test = {
  precessionHz,
  lissajousPoint,
  harmonographPoint,
  knotPoint,
  nearestRatio,
  intervalName,
};
