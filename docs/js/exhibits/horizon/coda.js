// III · Coda — One Question
// The site's final screen. The overture's question returns as an instrument:
// a slider that crossfades a just-intonation partial bank against an
// equal-tempered one, so the visitor literally hears "invented or discovered".
// Above it, one closing image: a single stroke — a tally mark, the digit 1,
// a vibrating string — pulsing with the drone. No metaphor animations: the
// partials are the real frequencies, the beats are real beats, and the glow
// follows an analyser on the actual signal.
//
// No top-level DOM/window/Audio access: everything below the pure helpers
// happens inside init(). Pure helpers are exported via _test.

const TAU = Math.PI * 2;
const QUESTION_KEY = 'mathemagical:one-question';
const F0 = 110;              // fundamental, Hz (A2)
const PARTIALS = 6;          // partial bank size: 1..6 × f0
const SLOW = 500;            // visual slowdown of the string modes
const STR_SEG = 72;          // string polyline segments
// fixed per-partial phase seeds so the idle string looks organic, not synced
const SEED = [0.0, 1.7, 3.9, 0.6, 2.8, 5.1];

/* ---------- pure logic (node-testable) ---------- */

// Nearest 12-TET step to the k-th harmonic partial: round(12·log2 k).
function nearestETSemitones(k) {
  return Math.round(12 * Math.log2(k));
}

function justFreq(f0, k) { return f0 * k; }

function etFreq(f0, k) {
  return f0 * Math.pow(2, nearestETSemitones(k) / 12);
}

// Signed gap in cents: pure partial minus its ET stand-in.
// centsGap(3) ≈ +1.955 (the pure fifth is 2¢ sharp of equal temperament);
// centsGap(5) ≈ −13.686 (the pure major third is 13.7¢ flat of it).
function centsGap(k) {
  return 1200 * Math.log2(k) - 100 * nearestETSemitones(k);
}

function beatRate(f0, k) { return Math.abs(justFreq(f0, k) - etFreq(f0, k)); }

// Equal-power crossfade. v = 0 → all equal-tempered ("invented"),
// v = 1 → all just ("discovered"). just² + et² = 1 for every v.
function xfadeGains(v) {
  const c = Math.min(1, Math.max(0, v));
  return { just: Math.sin(c * Math.PI / 2), et: Math.cos(c * Math.PI / 2) };
}

// The overture stores a string "0".."1"; anything else means "never answered".
function parseAnswer(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

// One row per partial, for the on-page readout and for tests.
function partialRows(f0) {
  const rows = [];
  for (let k = 1; k <= PARTIALS; k++) {
    rows.push({
      k,
      semitones: nearestETSemitones(k),
      just: justFreq(f0, k),
      et: etFreq(f0, k),
      gapCents: centsGap(k),
      beat: beatRate(f0, k),
    });
  }
  return rows;
}

// Transverse offset of the drawn string at position u ∈ [0,1], time t (s).
// Mode shapes are the real string modes sin(kπu); each oscillates at its
// bank's true frequency divided by SLOW. The just bank's ratios are integers,
// so its waveform repeats; the equal-tempered bank's are irrational multiples,
// so it never does — which is the point, made visible.
const NORM = (() => { let s = 0; for (let k = 1; k <= PARTIALS; k++) s += 1 / k; return s; })();
function stringOffset(u, t, wJust, wET) {
  let s = 0;
  for (let k = 1; k <= PARTIALS; k++) {
    const shape = Math.sin(k * Math.PI * u) / k;
    s += shape * (
      wJust * Math.sin(TAU * (justFreq(F0, k) / SLOW) * t + SEED[k - 1]) +
      wET * Math.sin(TAU * (etFreq(F0, k) / SLOW) * t + SEED[k - 1])
    );
  }
  return s / NORM;
}

const fmtHz = (x) => x.toFixed(2);
const fmtCents = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1) + '¢';

/* ---------- the exhibit ---------- */

export default {
  id: 'coda',
  movement: 3,
  title: 'One Question',
  hook: 'Answer it again, now that you have been to the horizon.',
  prose: `
    <p>At the door we asked you one question and promised it would not be mentioned
    again. The promise expires here, on the last screen, because you are no longer the
    person who answered it. Since then you have counted a flock with notches on a bone
    and heard a single string confess the whole numbers hiding in its overtones; you
    built a list meant to contain everything and watched one sequence step calmly out
    of it; you severed a hydra that always dies, ran a five-state machine for exactly
    47,176,870 steps, and saw two computations from unrelated worlds agree at every
    prime, forever. So — mathematics: <em>invented</em>, or <em>discovered</em>?
    The slider below is the same slider. If you answered before, your earlier self
    waits on it as a ghost.</p>
    <p>This time the slider is an instrument. Push it toward <em>discovered</em> and
    the drone settles into the harmonic series — six partials at exactly 1, 2, 3, 4,
    5, 6 times a fundamental of 110 Hz, the ratios any vibrating string in any
    universe offers unasked, the physics all of Movement II was built from. Push it
    toward <em>invented</em> and each partial drifts to its nearest rung on the
    equal-tempered ladder <code>2^(k/12)</code>: the piano's grid, a human compromise
    settled over centuries, frequencies no free string ever chose. The difference is
    almost nothing, and it is everything: the fifth moves by 2.0 cents, beneath
    hearing; the major third moves by 13.7 — from the pure 386.3 cents of
    <code>5/4</code> to the manufactured 400 — and near the middle of the slider the
    two tunings sound together and beat against each other at 4.4 hertz. That slow
    shudder is the question, made audible.</p>
    <p>The people who thought hardest about this never agreed. Gödel — the man who
    surveyed the walls — was a Platonist to the end: he wrote that we have something
    like a perception of mathematical objects, that the theorems are reports from a
    landscape. Hilbert's formalism answers that mathematics is the manipulation of
    marks by rules we laid down, and needs no landscape at all. Brouwer's intuitionism
    makes it a construction unfolding in human time, no truer than the mind that
    builds it; structuralism replies that the objects were never the point — only the
    pattern of relations between them, which is why one stroke can be a tally, a
    string, and a numeral without anything being lost. We declare no winner. We only
    note, after the hydra and the beavers and the mirror, that the question is not
    idle: whatever mathematics is, something in it answered back.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, ui } = core;
    const P = cv.palette;

    // ---------- scoped style: the coda is a screen, not a boxed widget ----------
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #ex-coda { min-height: 88vh; display: flex; flex-direction: column; justify-content: center; }
      #ex-coda .exhibit-header { display: none; }
      #ex-coda .exhibit-stage { background: transparent; border: none; box-shadow: none; padding: 0; }
      #ex-coda .exhibit-stage canvas { background: transparent; }
      #ex-coda .coda-core { max-width: 34rem; margin: 0.6rem auto 0; text-align: center; }
      #ex-coda .coda-prompt { color: var(--ink); font-size: 1.25rem; letter-spacing: 0.03em; margin: 0.8rem 0 1.6rem; }
      #ex-coda .coda-track { position: relative; }
      #ex-coda .coda-ghost { position: absolute; top: -1.15em; transform: translateX(-50%);
        color: var(--gold); opacity: 0.8; font-size: 0.8rem; pointer-events: none;
        transition: opacity 0.6s ease; }
      #ex-coda input[type="range"].coda-slider { height: 3px; border-radius: 2px;
        background: linear-gradient(90deg, var(--line) 0%, var(--gold-dim) 100%); cursor: pointer; }
      #ex-coda .coda-slider::-webkit-slider-thumb { width: 20px; height: 20px; }
      #ex-coda .coda-slider.unplaced::-webkit-slider-thumb { background: var(--ink-faint); box-shadow: none; }
      #ex-coda .coda-slider.unplaced::-moz-range-thumb { background: var(--ink-faint); }
      #ex-coda .coda-labels { display: flex; justify-content: space-between; color: var(--ink-faint);
        font-variant: small-caps; letter-spacing: 0.12em; font-size: 0.85rem; margin-top: 0.5rem; }
      #ex-coda .coda-note { color: var(--ink-faint); font-style: italic; font-size: 0.85rem;
        margin-top: 1rem; min-height: 1.3em; }
      #ex-coda .controls { justify-content: center; margin-top: 1.4rem; }
      #ex-coda .readout { background: transparent; border: none; white-space: normal;
        text-align: center; max-width: 36rem; margin: 0.6rem auto 0; line-height: 1.8; }
      #ex-coda .stage-caption { text-align: center; max-width: 38rem; margin: 1.1rem auto 0; }
      #ex-coda .coda-last { max-width: 36rem; margin: 4.5rem auto 1.5rem; padding: 0 1rem;
        text-align: center; color: var(--ink); line-height: 2; }
      #ex-coda .coda-last p { margin: 0 0 1.5em; }
      #ex-coda .coda-last .coda-final { color: var(--gold-bright); margin-bottom: 0; }
    `;
    stage.appendChild(styleEl);

    // ---------- state ----------
    let v = 0.5;               // current slider position (0 invented … 1 discovered)
    let placed = false;        // has the visitor placed an answer this visit?
    let droneOn = false;
    let drone = null;          // built lazily on first sound; reused after
    let pulse = 0;             // smoothed loudness from the analyser
    const rows = partialRows(F0);

    let stored = null;         // the overture's answer, if any
    try { stored = parseAnswer(localStorage.getItem(QUESTION_KEY)); } catch { /* private mode etc. */ }

    const bus = audio.createBus('coda');

    // ---------- the closing image ----------
    const handle = cv.setupCanvas(stage, { height: 320 });
    const endGlow = cv.glowSprite(P.gold, 40);

    // ---------- the question ----------
    const coreDiv = document.createElement('div');
    coreDiv.className = 'coda-core';
    stage.appendChild(coreDiv);

    const prompt = document.createElement('div');
    prompt.className = 'coda-prompt';
    prompt.textContent = 'Mathematics — invented or discovered?';
    coreDiv.appendChild(prompt);

    const track = document.createElement('div');
    track.className = 'coda-track';
    coreDiv.appendChild(track);

    let ghostEl = null;
    if (stored !== null) {
      ghostEl = document.createElement('div');
      ghostEl.className = 'coda-ghost';
      ghostEl.textContent = '▾';
      // account for thumb travel (20px thumb): ghost sits over the thumb's centre
      ghostEl.style.left = `calc(10px + ${stored.toFixed(4)} * (100% - 20px))`;
      ghostEl.title = 'your answer at the overture';
      track.appendChild(ghostEl);
    }

    const sliderEl = document.createElement('input');
    sliderEl.type = 'range';
    sliderEl.min = '0'; sliderEl.max = '1'; sliderEl.step = '0.001';
    sliderEl.value = '0.5';
    sliderEl.className = 'coda-slider unplaced';
    sliderEl.setAttribute('aria-label', 'invented or discovered');
    track.appendChild(sliderEl);

    const labels = document.createElement('div');
    labels.className = 'coda-labels';
    labels.innerHTML = '<span>invented</span><span>discovered</span>';
    coreDiv.appendChild(labels);

    const note = document.createElement('div');
    note.className = 'coda-note';
    note.textContent = stored !== null
      ? 'The faint mark is where you stood at the door. Place yourself again, knowing what you now know.'
      : 'You passed the door without answering, so no ghost haunts this line. Place yourself for the first time.';
    coreDiv.appendChild(note);

    sliderEl.addEventListener('input', () => {
      v = parseFloat(sliderEl.value);
      if (!placed) {
        placed = true;
        sliderEl.classList.remove('unplaced');
        if (ghostEl) ghostEl.style.opacity = '0.35';
      }
      updateMix();
      updateReadout();
      try { localStorage.setItem(QUESTION_KEY, sliderEl.value); } catch { /* fine */ }
    });

    // ---------- drone controls ----------
    const controls = ui.controlRow(stage);
    const droneBtn = ui.button(controls, '♬ sound the question', () => setDrone(!droneOn), { primary: true });
    const info = ui.readout(stage, '');

    ui.caption(stage,
      'One object, three readings: the stroke above is the tally of Movement I, the string of ' +
      'Movement II, and the digit 1 of Movement III. When the drone sounds it vibrates in the six ' +
      'modes you are hearing, slowed five-hundred-fold — pure ratios repeat, tempered ones never do — ' +
      'and its glow follows the true loudness of the signal, beats included. The equal-tempered ' +
      'partials are drawn on the same string at frequencies no string of this length would sustain.');

    ui.speculationPanel(stage, `
      <p>Out past every position named above stands Max Tegmark's <em>mathematical universe
      hypothesis</em>: that the physical world is not merely <em>described</em> by mathematics but
      <em>is</em> a mathematical structure — and that every consistent structure exists exactly the
      way ours does, so that "invented versus discovered" dissolves because there is nothing else a
      universe could be. It is a metaphysical proposal, not a theorem; critics hold that it cannot
      be tested even in principle. We place it here, out past the labeled edge of the map.</p>`);

    // ---------- the site's last words ----------
    const last = document.createElement('div');
    last.className = 'coda-last';
    last.innerHTML = `
      <p>In September 1930, in Königsberg, David Hilbert declared: <em>“Wir müssen wissen — wir
      werden wissen.”</em> We must know — we will know. The day before, at a conference in the same
      city, a quiet 24-year-old named Kurt Gödel had announced that some things cannot be proved.
      Hilbert’s words were carved on his gravestone anyway.</p>
      <p class="coda-final">They were both right. That is the strangest theorem of all.</p>`;
    stage.appendChild(last);

    // ---------- audio: two banks, one bus, ramps only ----------
    function buildDrone() {
      const c = bus.context;
      const master = c.createGain();
      master.gain.value = 0;                       // silent at birth: no click
      master.connect(bus.input);
      const analyser = c.createAnalyser();
      analyser.fftSize = 512;
      master.connect(analyser);                    // tap only; analyser has no output

      const bankJ = c.createGain();
      const bankE = c.createGain();
      const g0 = xfadeGains(v);
      bankJ.gain.value = g0.just;                  // safe: master is at 0, inaudible
      bankE.gain.value = g0.et;
      bankJ.connect(master);
      bankE.connect(master);

      const oscs = [];
      const A = 0.22;                              // per-partial peak, rolled off 1/k
      for (let k = 1; k <= PARTIALS; k++) {
        for (const [freq, bank] of [[justFreq(F0, k), bankJ], [etFreq(F0, k), bankE]]) {
          const osc = c.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const g = c.createGain();
          g.gain.value = A / k;
          osc.connect(g).connect(bank);
          osc.start();
          oscs.push({ osc, g });
        }
      }
      drone = { master, analyser, bankJ, bankE, oscs, data: new Uint8Array(analyser.fftSize) };
    }

    function setDrone(on) {
      droneOn = on;
      droneBtn.classList.toggle('active', on);
      droneBtn.textContent = on ? '♬ silence' : '♬ sound the question';
      if (on) {
        audio.ensureAudio();                       // inside the user gesture
        if (!drone) buildDrone();
        audio.rampTo(drone.master.gain, 1, 0.18);
      } else if (drone) {
        audio.rampTo(drone.master.gain, 0, 0.1);
      }
      updateReadout();
    }

    function updateMix() {
      if (!drone) return;
      const g = xfadeGains(v);
      audio.rampTo(drone.bankJ.gain, g.just, 0.08);
      audio.rampTo(drone.bankE.gain, g.et, 0.08);
    }

    function disposeDrone() {
      if (!drone) return;
      const d = drone;
      drone = null;
      const c = bus.context;
      audio.rampTo(d.master.gain, 0, 0.04);
      const tStop = c.currentTime + 0.25;          // after the ramp has died away
      d.oscs.forEach(({ osc, g }, i) => {
        try { osc.stop(tStop); } catch { /* already stopped */ }
        osc.onended = () => {
          try { osc.disconnect(); g.disconnect(); } catch { /* ok */ }
          if (i === 0) {
            try { d.bankJ.disconnect(); d.bankE.disconnect(); d.master.disconnect(); } catch { /* ok */ }
          }
        };
      });
    }

    // ---------- readout: the compromise in numbers ----------
    function updateReadout() {
      const g = xfadeGains(v);
      const pct = Math.round(v * 100);
      const shared = rows.filter((r) => r.beat < 1e-9).map((r) => r.k).join(', ');
      const lines = [
        `fundamental ${F0} Hz (A2) · leaning ${pct}% discovered · ` +
        `just bank ×${g.just.toFixed(2)}, equal bank ×${g.et.toFixed(2)}` +
        (droneOn ? '' : ' · silent'),
        `partials ${shared} — identical in both tunings`,
      ];
      for (const r of rows) {
        if (r.beat < 1e-9) continue;
        lines.push(
          `partial ${r.k} — ${fmtHz(r.just)} vs ${fmtHz(r.et)} Hz · pure ${fmtCents(r.gapCents)} ` +
          `of equal · beats ${r.beat.toFixed(1)} Hz`);
      }
      info.setHTML(lines.join('<br>'));
    }

    // ---------- drawing: one stroke, three readings ----------
    const READINGS = ['a tally mark', 'the digit 1', 'a string, sounding'];

    function draw(dt, t) {
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);

      // real loudness → pulse (beats and all), smoothed
      let target = 0;
      if (drone) {
        drone.analyser.getByteTimeDomainData(drone.data);
        let s = 0, n = 0;
        for (let i = 0; i < drone.data.length; i += 2) {
          const d = (drone.data[i] - 128) / 128;
          s += d * d; n++;
        }
        target = Math.min(1, Math.sqrt(s / n) * 3);
      }
      pulse += (target - pulse) * Math.min(1, dt * 6);

      const breath = 0.5 + 0.5 * Math.sin(t * 0.45);       // slow idle breathing
      const glow = 0.22 + 0.12 * breath + 0.62 * pulse;
      const amp = Math.min(4 + 30 * pulse, W * 0.08);
      const g = xfadeGains(v);

      const cx = W / 2, y0 = H * 0.10, y1 = H * 0.86;
      const pts = [];
      for (let i = 0; i <= STR_SEG; i++) {
        const u = i / STR_SEG;
        pts.push([cx + amp * stringOffset(u, t, g.just, g.et), y0 + (y1 - y0) * u]);
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const layers = [
        [11, P.goldDim, 0.05 + 0.10 * glow],
        [5, P.gold, 0.10 + 0.25 * glow],
        [2.2, P.goldBright, 0.5 + 0.5 * glow],
      ];
      for (const [w, color, alpha] of layers) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // soft pools of light where the stroke ends — pre-rendered, never shadowBlur
      endGlow.draw(ctx, pts[0][0], y0, 0.5 + glow * 0.7);
      endGlow.draw(ctx, pts[pts.length - 1][0], y1, 0.5 + glow * 0.7);

      // the three readings, surfacing one at a time
      const per = 7;
      const phase = (t % per) / per;
      const idx = Math.floor(t / per) % READINGS.length;
      const a = Math.max(0, Math.min(1, Math.min(phase, 1 - phase) * 8)) * (0.35 + 0.4 * glow);
      ctx.globalAlpha = a;
      ctx.fillStyle = P.inkDim;
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(READINGS[idx], cx, H - 10);
      ctx.globalAlpha = 1;
    }

    const loop = cv.rafLoop(draw);
    loop.start();
    updateReadout();

    // ---------- lifecycle ----------
    return {
      pause() {
        loop.stop();
        if (droneOn) setDrone(false);   // ramped to zero — no click
        bus.mute();
      },
      resume() {
        bus.unmute();
        loop.start();
      },
      destroy() {
        loop.stop();
        disposeDrone();
        bus.dispose();
        handle.destroy();
        styleEl.remove();
      },
    };
  },
};

/* ---------- node-testable exports ---------- */

export const _test = {
  F0, PARTIALS, SLOW,
  nearestETSemitones, justFreq, etFreq, centsGap, beatRate,
  xfadeGains, parseAnswer, partialRows, stringOffset,
};
