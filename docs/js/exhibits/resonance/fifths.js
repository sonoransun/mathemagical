// II — The Spiral of Fifths
// The circle of fifths as modular arithmetic; pure ratios refusing to close it;
// the Pythagorean comma made audible; continued fractions explaining "why 12".

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const LOG2_32 = Math.log2(3 / 2);            // 0.5849625007…
const COMMA_CENTS = 1200 * (12 * LOG2_32 - 7); // ≈ 23.46 ¢

export default {
  id: 'fifths',
  movement: 2,
  title: 'The Spiral of Fifths',
  hook: 'Twelve steps that never quite come home.',
  prose: `
    <p>Take a note. Multiply its frequency by <code>3/2</code> — the simplest interval after
    the octave, the perfect fifth — and repeat. Musicians have known since antiquity that
    twelve such steps land you almost exactly seven octaves up: almost back where you began,
    with every note of the scale visited exactly once along the way. The circle of fifths is
    Western music's map, and it is nothing but arithmetic modulo 12: stepping by <em>k</em>
    visits every note precisely when <code>gcd(k, 12) = 1</code>. Step by 7 and you trace a
    twelve-pointed star; step by 3 and you are trapped in a four-note orbit — a diminished
    seventh chord, the sound of a coset.</p>
    <p>But look closer. <code>(3/2)¹² = 129.746…</code> while <code>2⁷ = 128</code>. The
    circle does not close. Twelve pure fifths overshoot seven octaves by the ratio
    <code>531441/524288</code> — the <em>Pythagorean comma</em>, about 23.46 cents, a quarter
    of a semitone. Switch the exhibit to pure ratios and the circle unrolls into a spiral;
    sound the comma and you can hear the two ends of the "circle" beating against each other.
    Equal temperament — the piano's tuning — is a peace treaty: shave each fifth by two cents,
    a shade nobody can hear, and the spiral welds shut.</p>
    <p>Why twelve notes, and not eleven or thirteen? Because closing the spiral means finding
    whole numbers with <code>(3/2)^q ≈ 2^p</code> — that is, a fraction <code>p/q</code> close
    to <code>log₂(3/2) = 0.58496…</code> And the theory of continued fractions manufactures
    the <em>best possible</em> such fractions: <code>1/2, 3/5, 7/12, 24/41, 31/53…</code>
    Five-note scales and the chromatic twelve are not cultural accidents — they are the
    denominators of these convergents, with the diatonic seven arriving as the near-miss
    <code>4/7</code> wedged between them. (The next great denominator, 53, was seriously
    proposed: Isaac Newton sketched a 53-tone octave in his notebooks.)</p>
    <p>One more pattern hides in the stack, and the exhibit colors it for you: however many
    pure fifths you pile up, they slice the octave into gaps of at most <em>three</em> distinct
    sizes — a theorem of Steinhaus. At 5, 7, and 12 notes the count drops to two — and again
    at 17, 29, 41, and 53 — and those are the moments a pile of fifths deserves the name
    <em>scale</em>.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;

    // ---------- state ----------
    let mode = 'circle';        // 'circle' | 'spiral'
    let k = 7;                  // generator (circle mode)
    let temper = 0;             // 0 = pure fifths, 1 = equal temperament (spiral)
    let stackN = 12;            // fifths stacked (spiral mode)
    let litEdges = 0;           // how many orbit edges are lit (circle mode)
    let litStack = stackN;      // how many spiral points are lit
    let currentNote = -1;
    let edgeQueue = [];         // { idx, at } — consumed when audio clock passes `at`
    let commaOn = false;

    const bus = audio.createBus('fifths');
    let scheduler = null;
    let voiceLo = null, voiceHi = null;

    // ---------- layout ----------
    const handle = cv.setupCanvas(stage, { height: 460 });
    const P = cv.palette;

    const controls = ui.controlRow(stage);
    const modeBtn = ui.button(controls, 'unroll into pure fifths', () => setMode(mode === 'circle' ? 'spiral' : 'circle'), { primary: true });

    const genStep = ui.stepper(controls, {
      label: 'generator (semitones)', min: 1, max: 11, value: k,
      onChange: (v) => { k = v; litEdges = 0; stopArpeggio(); },
    });
    const playBtn = ui.button(controls, '▶ play the orbit', playOrbit);

    const stackSlider = ui.slider(controls, {
      label: 'fifths stacked', min: 2, max: 53, step: 1, value: stackN,
      format: (v) => `${v}`,
      onInput: (v) => { stackN = v; litStack = stackN; refreshComma(); },
    });
    const temperSlider = ui.slider(controls, {
      label: 'temperament', min: 0, max: 1, step: 0.001, value: 0,
      format: (v) => v === 0 ? 'pure 3:2' : v === 1 ? 'equal' : `${Math.round(v * 100)}%`,
      onInput: (v) => { temper = v; refreshComma(); },
    });
    const commaBtn = ui.button(controls, '♬ sound the comma', toggleComma);
    const info = ui.readout(stage, '');
    ui.caption(stage,
      'Circle mode: the orbit of the generator in ℤ/12ℤ. Spiral mode: pure fifths refusing to close — ' +
      'outer arcs show Steinhaus’s at-most-three gap sizes (gold, blue, red; only two at 5, 7, 12 — and again at 17, 29, 41, 53).');

    function setMode(m) {
      mode = m;
      stopArpeggio(); stopComma();
      modeBtn.textContent = mode === 'circle' ? 'unroll into pure fifths' : 'close back into a circle';
      genStep.el.style.display = mode === 'circle' ? '' : 'none';
      playBtn.style.display = '';
      stackSlider.el.style.display = mode === 'spiral' ? '' : 'none';
      temperSlider.el.style.display = mode === 'spiral' ? '' : 'none';
      commaBtn.style.display = mode === 'spiral' ? '' : 'none';
      refreshComma();
    }

    // ---------- music math ----------
    const stepSize = () => LOG2_32 * (1 - temper) + (7 / 12) * temper;
    const spiralAngle = (n) => (n * stepSize()) % 1;          // fraction of an octave
    const spiralFreq = (n) => 220 * Math.pow(2, spiralAngle(n));

    function refreshComma() {
      if (mode === 'circle') {
        const g = math.gcd(k, 12);
        info.set(
          `generator ${k}  ·  gcd(${k},12) = ${g}  ·  ` +
          (g === 1 ? `orbit visits all 12 — star polygon {12/${k}}`
                   : `orbit trapped in ${12 / g} notes — ${g} cosets`));
      } else {
        const drift = 1200 * (12 * stepSize() - 7);
        const beat = Math.abs(220 * Math.pow(2, (12 * stepSize()) % 1) - 220);
        info.set(
          `12 steps drift past 7 octaves by ${drift.toFixed(2)} ¢` +
          (temper === 0 ? `  (the Pythagorean comma: 531441/524288 ≈ ${COMMA_CENTS.toFixed(2)} ¢)` : '') +
          `  ·  comma beat ≈ ${beat.toFixed(2)} Hz`);
        if (commaOn) updateCommaVoices();
      }
    }

    // ---------- audio ----------
    function stopArpeggio() {
      if (scheduler) { scheduler.stop(); scheduler = null; }
      edgeQueue = []; currentNote = -1;
    }

    function playOrbit() {
      audio.ensureAudio();
      stopArpeggio();
      const dur = 0.32;
      if (mode === 'circle') {
        litEdges = 0;
        const g = math.gcd(k, 12);
        const orbitLen = 12 / g;
        let i = 0;
        scheduler = audio.createScheduler((t) => {
          if (i > orbitLen) return null;               // one extra: the return home
          const pc = (i * k) % 12;
          audio.playTone(bus, { freq: 261.63 * Math.pow(2, pc / 12), dur, level: 0.5, when: t });
          edgeQueue.push({ idx: i, at: t });
          i++;
          return t + dur * 0.82;
        });
        scheduler.start();
      } else {
        litStack = 0;
        let i = 0;
        scheduler = audio.createScheduler((t) => {
          if (i >= stackN) return null;
          audio.playTone(bus, { freq: spiralFreq(i), dur, level: 0.5, when: t });
          edgeQueue.push({ idx: i, at: t });
          i++;
          return t + dur * 0.7;
        });
        scheduler.start();
      }
    }

    function updateCommaVoices() {
      if (!voiceLo) return;
      voiceLo.setFreq(220);
      voiceHi.setFreq(220 * Math.pow(2, (12 * stepSize()) % 1));
    }
    function toggleComma() {
      audio.ensureAudio();
      if (commaOn) { stopComma(); return; }
      commaOn = true;
      commaBtn.classList.add('active');
      voiceLo = audio.voice(bus, { freq: 220, level: 0.32 });
      voiceHi = audio.voice(bus, { freq: 220, level: 0.32 });
      updateCommaVoices();
      voiceLo.on(); voiceHi.on();
    }
    function stopComma() {
      commaOn = false;
      commaBtn.classList.remove('active');
      if (voiceLo) { voiceLo.dispose(); voiceHi.dispose(); voiceLo = voiceHi = null; }
    }

    // ---------- drawing ----------
    function draw() {
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.36;

      // consume due edges (audio-clock sync)
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      while (edgeQueue.length && edgeQueue[0].at <= now) {
        const e = edgeQueue.shift();
        if (mode === 'circle') { litEdges = e.idx; currentNote = (e.idx * k) % 12; }
        else { litStack = e.idx + 1; currentNote = e.idx; }
      }
      if (mode === 'circle') drawCircle(ctx, cx, cy, R);
      else drawSpiral(ctx, cx, cy, R);
    }

    function pcPos(pc, r, cx, cy) {
      const a = (pc / 12) * math.TAU - Math.PI / 2;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }

    function drawCircle(ctx, cx, cy, R) {
      // faint full circle
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, math.TAU); ctx.stroke();

      const g = math.gcd(k, 12);
      const orbitLen = 12 / g;

      // other cosets, faint
      if (g > 1) {
        ctx.strokeStyle = P.line;
        for (let c = 1; c < g; c++) {
          ctx.beginPath();
          for (let i = 0; i <= orbitLen; i++) {
            const [x, y] = pcPos((c + i * k) % 12, R, cx, cy);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
      }

      // lit edges of the main orbit
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.6;
      ctx.shadowColor = P.gold; ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i <= Math.min(litEdges, orbitLen); i++) {
        const [x, y] = pcPos((i * k) % 12, R, cx, cy);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // the 12 pitch classes
      ctx.font = '13px ' + getComputedStyle(document.body).fontFamily;
      for (let pc = 0; pc < 12; pc++) {
        const [x, y] = pcPos(pc, R, cx, cy);
        const onOrbit = pc % g === 0;
        ctx.fillStyle = pc === currentNote ? P.goldBright : onOrbit ? P.ink : P.inkFaint;
        ctx.beginPath(); ctx.arc(x, y, pc === currentNote ? 6 : 4, 0, math.TAU); ctx.fill();
        const [lx, ly] = pcPos(pc, R + 24, cx, cy);
        ctx.fillStyle = P.inkDim;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(NOTE_NAMES[pc], lx, ly);
      }
    }

    function drawSpiral(ctx, cx, cy, R) {
      const r0 = R * 0.55, dr = (R * 0.55) / 54;
      const rOf = (n) => r0 + n * dr;

      // reference ray at angle 0 (the starting pitch class)
      ctx.strokeStyle = P.line; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(cx, cy - r0 * 0.75); ctx.lineTo(cx, cy - R - 26); ctx.stroke();
      ctx.setLineDash([]);

      // spiral path through lit points
      const pos = (n) => {
        const a = spiralAngle(n) * math.TAU - Math.PI / 2;
        return [cx + rOf(n) * Math.cos(a), cy + rOf(n) * Math.sin(a)];
      };
      const nShow = Math.min(litStack, stackN);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let n = 0; n < nShow; n++) {
        const [x, y] = pos(n);
        n ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();

      // points
      for (let n = 0; n < nShow; n++) {
        const [x, y] = pos(n);
        ctx.fillStyle = n === currentNote ? P.goldBright : n === 0 ? P.azure : P.ink;
        ctx.beginPath(); ctx.arc(x, y, n === currentNote ? 5.5 : 3.5, 0, math.TAU); ctx.fill();
      }

      // the comma gap: angle between step 12 and step 0, when 12+ steps shown
      if (nShow >= 12 && spiralAngle(12) > 1e-4) {
        const aEnd = spiralAngle(12) * math.TAU - Math.PI / 2;
        ctx.strokeStyle = P.crimson; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, rOf(12) + 9, -Math.PI / 2, aEnd); ctx.stroke();
        ctx.fillStyle = P.crimson;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'left';
        const midA = -Math.PI / 2 + spiralAngle(12) * math.TAU * 0.5;
        ctx.fillText('the comma', cx + (rOf(12) + 16) * Math.cos(midA), cy + (rOf(12) + 16) * Math.sin(midA));
      }

      // Steinhaus three-gap arcs at outer radius
      const angles = [];
      for (let n = 0; n < nShow; n++) angles.push(spiralAngle(n));
      angles.sort((a, b) => a - b);
      if (angles.length >= 2) {
        const gaps = angles.map((a, i) => {
          const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 1;
          return { start: a, size: next - a };
        });
        const kinds = [...new Set(gaps.map((gp) => gp.size.toFixed(6)))].sort((a, b) => b - a);
        const colors = [P.gold, P.azure, P.crimson];
        const rr = R + 14;
        for (const gp of gaps) {
          const ci = kinds.indexOf(gp.size.toFixed(6));
          ctx.strokeStyle = colors[Math.min(ci, 2)] + 'aa';
          ctx.lineWidth = 5;
          const a0 = gp.start * math.TAU - Math.PI / 2 + 0.02;
          const a1 = (gp.start + gp.size) * math.TAU - Math.PI / 2 - 0.02;
          if (a1 > a0) { ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke(); }
        }
        ctx.fillStyle = kinds.length <= 2 ? P.verdant : P.inkFaint;
        ctx.font = '12px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${nShow} notes · ${kinds.length} gap size${kinds.length > 1 ? 's' : ''}` +
          (kinds.length <= 2 && nShow > 2 ? ' — a scale' : ''),
          cx, cy + R + 40);
      }
    }

    const loop = cv.rafLoop(draw);
    loop.start();
    setMode('circle');
    refreshComma();

    // ---------- lifecycle ----------
    return {
      pause() { loop.stop(); stopArpeggio(); stopComma(); bus.mute(); },
      resume() { bus.unmute(); loop.start(); },
      destroy() { loop.stop(); stopArpeggio(); stopComma(); bus.dispose(); handle.destroy(); },
    };
  },
};
