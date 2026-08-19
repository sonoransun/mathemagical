// II·7 — The Golden Angle (movement finale)
// Vogel's phyllotaxis model on a single dial. Rational divergence angles give
// spokes to the eye and looping melodies to the ear — the same fact about p/q
// reported by two senses. At θ★ = 2π(2 − φ) ≈ 137.50776° the spokes die, the
// loop dissolves, and what survives is order without repetition: the door out
// of Movement II and into the Horizon.

import { TAU, PHI, mod, clamp, continuedFraction, convergents } from '../../core/math.js';

/* ---------------- pure core (node-testable, no DOM) ---------------- */

const GOLDEN_TURN = 2 - PHI;               // ≈ 0.3819660113 of a turn
const GOLDEN_DEG = 360 * GOLDEN_TURN;      // ≈ 137.50776405°
const MIRROR_TURN = PHI - 1;               // 0.618… — the same bloom, mirrored

// The Fibonacci word from φ itself: bit i answers "did a new multiple of φ
// just pass an integer?" — ⌊(i+1)φ⌋ − ⌊iφ⌋ − 1 ∈ {0, 1}. Aperiodic, lawful.
// (This convention is the classical substitution word with its two letters
// renamed; see the substitution cross-check in the tests.)
function fibWord(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.floor((i + 1) * PHI) - Math.floor(i * PHI) - 1;
  }
  return out;
}

// Angular positions (as fractions of a turn, in [0,1)) of the first n Vogel
// seeds at divergence `turns`. Seed i sits at angle i·turns (radius c√i is
// layout, not arithmetic, so it lives in the renderer).
function seedTurns(turns, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = mod(i * turns, 1);
  return out;
}

// How many distinct spoke directions a list of turn-fractions occupies,
// clustering within `tol` (circularly, so 0.9999… and 0.0001 can merge).
function distinctTurnCount(list, tol = 1e-9) {
  if (list.length === 0) return 0;
  const s = [...list].sort((a, b) => a - b);
  let count = 1;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > tol) count++;
  if (count > 1 && s[0] + 1 - s[s.length - 1] <= tol) count--;   // wraparound
  return count;
}

// Distinct circular gap sizes between the first n multiples of `turns`,
// descending. Zero gaps (coincident points, i.e. exact spokes revisited) are
// skipped. The three-gap theorem (Steinhaus; proved by Sós and Świerczkowski)
// says this list never holds more than three entries — for any turns, any n.
function gapSizes(turns, n, tol = 1e-9) {
  const s = seedTurns(turns, n).sort((a, b) => a - b);
  const kinds = [];
  for (let i = 0; i < s.length; i++) {
    const next = i + 1 < s.length ? s[i + 1] : s[0] + 1;
    const g = next - s[i];
    if (g <= tol) continue;
    if (!kinds.some((k) => Math.abs(k - g) <= tol)) kinds.push(g);
  }
  return kinds.sort((a, b) => b - a);
}

// Continued-fraction portrait of a divergence angle: its cf terms, the
// convergent denominators (= the spiral-arm counts you will see), and whether
// the value is exactly rational at double precision (→ q spokes, q-note loop).
function analyzeTurns(turns, maxTerms = 17) {
  const cf = continuedFraction(turns, maxTerms, 1e-10);
  const conv = convergents(cf);
  const arms = [];
  let rational = null;
  for (const [p, q] of conv) {
    if (q > 1 && !arms.includes(q)) arms.push(q);
    if (Math.abs(turns - p / q) < 1e-11) { rational = { p, q }; break; }
  }
  return { cf, arms, rational };
}

/* ---------------- the exhibit ---------------- */

const DETENTS = [
  { label: '1/2', turn: 1 / 2 },
  { label: '1/3', turn: 1 / 3 },
  { label: '2/5', turn: 2 / 5 },
  { label: 'π', turn: Math.PI - 3 },
  { label: '√2', turn: Math.SQRT2 - 1 },
  { label: 'e', turn: Math.E - 2 },
  { label: 'φ★', turn: GOLDEN_TURN },
];

const CAP = 610;          // seeds in a full head (a Fibonacci number, of course)
const BLOOM_RATE = 140;   // seeds per second while blooming
const GAP_TOL = 1e-6;     // display tolerance for "same gap size"
const BASE_STEP = 0.14;   // seconds per note, uniform pulse
const LONG_STEP = 0.185;  // φ-pulse: long duration; short = LONG/φ

export default {
  id: 'golden',
  movement: 2,
  title: 'The Golden Angle',
  hook: 'At almost every angle, spokes. At 137.508°, a sunflower.',
  prose: `
    <p>In 1979 the physicist Helmut Vogel wrote down the smallest recipe that grows a
    sunflower: place seed number <code>i</code> at angle <code>i·θ</code> and radius
    proportional to <code>√i</code>. Each seed is born one fixed turn past its elder sister
    and drifts outward just fast enough that every seed claims the same area. That is the
    entire model — the head above is one rule iterated six hundred times — so everything
    hangs on a single number: θ, the <em>divergence angle</em>. This exhibit is that number
    made into a dial.</p>
    <p>Set the dial almost anywhere and the head organizes itself into spokes. A rational
    angle, <code>2π·p/q</code>, sends every q-th seed down the same ray: the head collapses
    into q straight arms with wedges of wasted space between them, and the melody the seeds
    sing — each seed's angle folded into one octave, <code>220·2^(iθ/2π mod 1)</code> Hz —
    closes into a loop of exactly q notes. Spokes in the eye, a loop in the ear; the same
    fact about <code>p/q</code>, reported by two different senses. Angles merely
    <em>near</em> a rational do something subtler: the spokes shear into spiral arms, and
    the number of arms is the denominator of a continued-fraction convergent. Set the dial
    to π and the number confesses — seven arms first (that is 22/7), then, deeper in, a
    ghostly hundred and thirteen (that is 355/113). For a florist's purposes, π is
    disappointingly close to rational.</p>
    <p>So the plant's problem — let no seed line up with another — becomes a number
    theorist's problem: find the angle <em>hardest to approximate by fractions</em>. The
    continued fraction of <code>φ = (1+√5)/2</code> is <code>[1; 1, 1, 1, …]</code>, all
    ones, the slowest-converging expansion an irrational can have; Hurwitz's theorem makes
    the title official — every irrational admits approximations with
    <code>|x − p/q| &lt; 1/(√5·q²)</code>, and the constant √5 cannot be improved precisely
    because φ and its relatives refuse to do better. The most irrational number, folded into
    a single turn, is the golden angle <code>θ★ = 2π(2 − φ) ≈ 137.50776°</code>. At that
    setting, and visibly at no other, the spokes die altogether. What remains are the
    interlocking families of Fibonacci spirals — 8, 13, 21, 34 — the shadows of φ's
    convergents, and the most even packing a fixed-angle rule can buy. Botanists counting
    real sunflower heads and pine cones find Fibonacci families in the large majority of
    specimens, though nature permits occasional exceptions that Vogel's idealization does
    not.</p>
    <p>Meanwhile the melody at θ★ has stopped looping — it will never repeat — yet it is
    not lawless. Steinhaus's three-gap theorem, the one we met coloring the arcs between
    stacked fifths, reprises here on the compass beside the bloom: however many notes have
    sounded, the pitches visited so far slice the octave-circle into at most <em>three</em>
    distinct gap sizes. Sort what you have heard and the improvised scale never has more
    than three step sizes, at any depth, forever. Aperiodic, but with a grammar.</p>
    <p>That grammar has a purest specimen, and φ hands it to us digitally: the bit
    <code>⌊(i+1)φ⌋ − ⌊iφ⌋ − 1</code> asks whether a new multiple of φ just crossed an
    integer, and the answers stream out as the <em>Fibonacci word</em> (up to renaming its
    two letters) — a sequence of 0s and 1s that never repeats and yet contains no
    randomness at all. Switch on the φ-pulse and the melody walks in two durations, long
    and short in golden proportion: a rhythm that never loops and never surprises. Roger
    Penrose built his aperiodic tilings on the same trick in the 1970s; in 1982 Dan
    Shechtman found the trick already at work in nature, in an aluminium–manganese alloy
    whose diffraction pattern showed the sharp five-fold order no repeating lattice can
    have — a heresy that earned him ridicule first and the 2011 Nobel Prize in Chemistry
    later. Order and repetition, it turns out, are different things, and the gap between
    them is wide enough to hold everything that comes next.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;

    // ---------- state ----------
    let turnsBase = GOLDEN_TURN;   // the dial (fraction of a turn)
    let fineDeg = 0;               // fine slider offset, in degrees
    const turns = () => mod(turnsBase + fineDeg / 360, 1);

    let seedCount = 0;             // grows to CAP (float; floor = seeds drawn)
    let playing = false;
    let melodyIdx = 0;             // next seed index to sound (wraps at bloom)
    let schedCount = 0;            // notes scheduled since play (rhythm bits)
    let heard = 0;                 // notes actually heard (compass depth)
    let noteQueue = [];            // { idx, phase, at } — audio-clock sync
    let recent = [];               // fading trail of just-sounded seeds
    let currentIdx = -1;
    let lastPhase = null;
    let strideTint = 0;            // 0 = off, else parastichy family stride
    let rhythmOn = false;
    let questArmed = false, questDone = false;
    let needsDraw = true;
    let dragging = false;
    let geo = { cx: 0, cy: 0, R: 120, Rd: 144 };

    const wordBits = fibWord(144);
    const bus = audio.createBus('golden');
    let scheduler = null;

    // ---------- layout ----------
    const handle = cv.setupCanvas(stage, { height: 520 });
    handle.canvas.style.touchAction = 'pan-y';
    handle.onResize(() => { needsDraw = true; });

    // sprites (never per-dot shadowBlur)
    const sprSeed = cv.glowSprite(P.gold, 22);
    const sprBright = cv.glowSprite(P.goldBright, 26);
    const sprCycle = [P.gold, P.azure, P.crimson, P.verdant,
                      P.goldBright, P.azureDim, P.goldDim, P.ink]
      .map((c) => cv.glowSprite(c, 22));

    ui.mathline(stage,
      'seed<sub>i</sub> : angle <code>i·θ</code>, radius <code>c·√i</code>' +
      ' &nbsp;·&nbsp; θ★ = 2π(2 − φ) ≈ 137.50776°');

    const controls = ui.controlRow(stage);
    const playBtn = ui.button(controls, '▶ play the bloom', togglePlay, { primary: true });
    ui.button(controls, '↺ re-bloom', () => {
      seedCount = 0; melodyIdx = 0; needsDraw = true;
    });
    ui.toggle(controls, {
      label: 'φ-pulse (Fibonacci word)', value: false,
      onChange: (v) => { rhythmOn = v; needsDraw = true; },
    });
    ui.select(controls, {
      label: 'tint spiral families',
      options: [{ value: '0', label: 'off' }, { value: '8', label: '8 arms' },
                { value: '13', label: '13 arms' }, { value: '21', label: '21 arms' },
                { value: '34', label: '34 arms' }],
      value: '0',
      onChange: (v) => { strideTint = parseInt(v, 10) || 0; needsDraw = true; },
    });

    const dialRow = ui.controlRow(stage);
    const detentBtns = DETENTS.map((d) => ({
      turn: d.turn,
      el: ui.button(dialRow, d.label, () => setBase(d.turn), { small: true }),
    }));
    const fineSlider = ui.slider(dialRow, {
      label: 'fine tune', min: -2.5, max: 2.5, step: 0.002, value: 0,
      format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}°`,
      onInput: (v) => { fineDeg = v; onTurnsChanged(); },
    });

    const info = ui.readout(stage, '');
    const quest = ui.questBanner(stage,
      'Nudge the dial — watch the sunflower shatter into spokes — then hunt your way ' +
      'back to the one angle where every spoke dies.');
    ui.caption(stage,
      'Drag the outer ring to steer the divergence angle; the fine slider moves it by ' +
      'thousandths of a degree, and the detents jump to exact numbers (each taken as the ' +
      'fractional part of a turn). The compass shows every pitch the melody has visited: ' +
      'gold, azure, and crimson arcs are its at-most-three gap sizes — Steinhaus&rsquo;s ' +
      'theorem from the fifths, reprised. With the φ-pulse on, note lengths follow the ' +
      'Fibonacci word drawn along the bottom.');
    ui.legendPanel(stage,
      '<p>The golden ratio is credited with the Parthenon&rsquo;s façade, the Great ' +
      'Pyramid, the Mona Lisa, the chambered nautilus, and the proportions of the ideal ' +
      'face. Nearly all of it is measurement folklore: draw enough rectangles on a ' +
      'photograph and one of them will oblige, and real nautilus shells, actually ' +
      'measured, coil in logarithmic spirals that are not golden ones. The sunflower is ' +
      'the honest exception. Phyllotaxis is a place where φ genuinely, measurably runs ' +
      'the show — for the arithmetic reason this dial lets you turn with your own hand.</p>');

    // ---------- dial interaction ----------
    function setBase(t) {
      turnsBase = t;
      fineDeg = 0;
      fineSlider.set(0);
      onTurnsChanged();
    }
    function onTurnsChanged() {
      needsDraw = true;
      const tr = turns();
      const d = Math.min(Math.abs(tr - GOLDEN_TURN), Math.abs(tr - MIRROR_TURN));
      if (!questArmed && d > 0.01) questArmed = true;
      else if (questArmed && !questDone && d < 4e-4) {
        questDone = true;
        quest.done('137.508° — the golden angle. No spokes, no loop; only the sunflower.');
      }
      refreshReadout();
    }

    function dialHit(x, y) {
      const dx = x - geo.cx, dy = y - geo.cy;
      return Math.abs(Math.hypot(dx, dy) - geo.Rd) <= 22;
    }
    function applyDial(x, y) {
      const dx = x - geo.cx, dy = y - geo.cy;
      let t = mod(Math.atan2(dx, -dy) / TAU, 1);
      t = Math.round(t * 7200) / 7200;      // coarse ring snaps to 0.05°
      setBase(t);
    }
    const onDown = (e) => {
      const [x, y] = cv.pointerPos(handle, e);
      if (!dialHit(x, y)) return;
      dragging = true;
      handle.canvas.style.cursor = 'grabbing';
      try { handle.canvas.setPointerCapture(e.pointerId); } catch {}
      applyDial(x, y);
    };
    const onMove = (e) => {
      const [x, y] = cv.pointerPos(handle, e);
      if (dragging) { applyDial(x, y); return; }
      handle.canvas.style.cursor = dialHit(x, y) ? 'grab' : '';
    };
    const onUp = (e) => {
      dragging = false;
      handle.canvas.style.cursor = '';
      try { handle.canvas.releasePointerCapture(e.pointerId); } catch {}
    };
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('pointerup', onUp);
    handle.canvas.addEventListener('pointercancel', onUp);

    // ---------- audio ----------
    // The melody IS the bloom: note k sounds seed k's angle folded into one
    // octave, walking outward in birth order and wrapping when the head is
    // done. Scrubbing the dial never restarts anything — future notes simply
    // read the new θ — so there is no click storm to debounce away.
    function tick(t) {
      if (!playing) return null;
      const n = Math.floor(seedCount);
      if (n < 1) return t + 0.12;
      if (melodyIdx >= n) melodyIdx = 0;
      const idx = melodyIdx++;
      const phase = mod(idx * turns(), 1);   // idx < CAP keeps this exact
      audio.playTone(bus, {
        freq: 220 * Math.pow(2, phase),
        dur: 0.16, type: 'triangle', level: 0.42, release: 0.07, when: t,
      });
      noteQueue.push({ idx, phase, at: t });
      if (noteQueue.length > 128) noteQueue.splice(0, noteQueue.length - 128);
      const bit = wordBits[schedCount % wordBits.length];
      schedCount++;
      return t + (rhythmOn ? (bit ? LONG_STEP : LONG_STEP / PHI) : BASE_STEP);
    }

    function togglePlay() {
      if (playing) { stopMelody(); return; }
      audio.ensureAudio();
      playing = true;
      melodyIdx = 0; schedCount = 0; heard = 0;
      scheduler = audio.createScheduler(tick);
      scheduler.start();
      playBtn.textContent = '■ still the melody';
      playBtn.classList.add('active');
      needsDraw = true;
    }
    function stopMelody() {
      playing = false;
      if (scheduler) { scheduler.stop(); scheduler = null; }
      noteQueue = []; recent = [];
      currentIdx = -1; lastPhase = null;
      playBtn.textContent = '▶ play the bloom';
      playBtn.classList.remove('active');
      needsDraw = true;
    }

    // ---------- readout ----------
    function refreshReadout() {
      const tr = turns();
      for (const d of detentBtns) {
        d.el.classList.toggle('active', Math.abs(tr - d.turn) < 1e-9);
      }
      const { cf, arms, rational } = analyzeTurns(tr);
      const cfShown = cf.slice(0, 10);
      const cfStr = `[${cfShown[0]}; ${cfShown.slice(1).join(', ')}` +
        (rational && cf.length <= 10 ? ']' : ', …]');
      let line2;
      if (rational) {
        const q = rational.q;
        if (q === 1) line2 = 'every seed on a single ray — one spoke, one note';
        else if (q <= CAP) {
          line2 = `${q} spokes · the melody loops every ${q} notes` +
            (arms.length > 1 ? ` · arms en route: ${arms.slice(0, -1).join(', ')}` : '');
        } else {
          line2 = `period ${q} — more spokes than the head holds seeds; ` +
            `arms first: ${arms.slice(0, 7).join(', ')}`;
        }
      } else {
        line2 = `no loop — spiral families: ${arms.slice(0, 8).join(', ')}, …`;
      }
      info.setHTML(
        `θ = <code>${(tr * 360).toFixed(3)}°</code> · ` +
        `turn <code>${tr.toFixed(6)}</code> · cf <code>${cfStr}</code><br>${line2}`);
    }

    // ---------- drawing ----------
    function draw(dt) {
      if (seedCount < CAP) {
        seedCount = Math.min(CAP, seedCount + dt * BLOOM_RATE);
        needsDraw = true;
      }
      const actx = audio.getContext();
      const now = actx ? actx.currentTime : 0;
      while (noteQueue.length && noteQueue[0].at <= now) {
        const n = noteQueue.shift();
        currentIdx = n.idx; lastPhase = n.phase;
        heard++;
        recent.push({ idx: n.idx, at: n.at });
        if (recent.length > 12) recent.shift();
        needsDraw = true;
      }
      if (playing || recent.length) needsDraw = true;
      if (!needsDraw) return;      // idle & unchanged: free
      needsDraw = false;
      render(now);
    }

    function render(now) {
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      const wide = W > 700;
      const cx = wide ? W * 0.40 : W / 2 - 10;
      const cy = wide ? H / 2 - 6 : H / 2 + 14;
      const R = Math.max(60, Math.min(H / 2 - (rhythmOn ? 84 : 64),
                                      (wide ? W * 0.40 : W / 2) - 44));
      const Rd = R + 24;
      geo = { cx, cy, R, Rd };
      const tr = turns();
      const n = Math.floor(seedCount);
      const c = (R - 6) / Math.sqrt(CAP);

      // dial ring + detent ticks + marker
      ctx.strokeStyle = P.line; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(cx, cy, Rd, 0, TAU); ctx.stroke();
      for (const d of DETENTS) {
        const a = d.turn * TAU - Math.PI / 2;
        const isPhi = d.turn === GOLDEN_TURN;
        ctx.strokeStyle = isPhi ? P.gold : P.inkFaint;
        ctx.lineWidth = isPhi ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + (Rd - 8) * Math.cos(a), cy + (Rd - 8) * Math.sin(a));
        ctx.lineTo(cx + (Rd + 8) * Math.cos(a), cy + (Rd + 8) * Math.sin(a));
        ctx.stroke();
      }
      const ma = tr * TAU - Math.PI / 2;
      sprBright.draw(ctx, cx + Rd * Math.cos(ma), cy + Rd * Math.sin(ma), 1.1);

      // the bloom
      for (let i = 0; i < n; i++) {
        const a = mod(i * tr, 1) * TAU - Math.PI / 2;
        const r = c * Math.sqrt(i);
        let s = 0.30 + 0.45 * (r / R);
        const age = n - i;
        if (age < 26) s *= 1 + 0.5 * (1 - age / 26);   // newest seeds pop
        const spr = strideTint ? sprCycle[(i % strideTint) % sprCycle.length] : sprSeed;
        spr.draw(ctx, cx + r * Math.cos(a), cy + r * Math.sin(a), s);
      }

      // fading trail of just-sounded seeds + the sounding seed
      recent = recent.filter((rn) => now - rn.at < 0.9);
      for (const rn of recent) {
        const a = mod(rn.idx * tr, 1) * TAU - Math.PI / 2;
        const r = c * Math.sqrt(rn.idx);
        ctx.globalAlpha = Math.max(0, 1 - (now - rn.at) / 0.9) * 0.8;
        sprBright.draw(ctx, cx + r * Math.cos(a), cy + r * Math.sin(a), 0.9);
      }
      ctx.globalAlpha = 1;
      if (playing && currentIdx >= 0 && currentIdx < n) {
        const a = mod(currentIdx * tr, 1) * TAU - Math.PI / 2;
        const r = c * Math.sqrt(currentIdx);
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        sprBright.draw(ctx, x, y, 1.5);
        ctx.strokeStyle = P.goldBright; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
      }

      // θ, big and precise
      ctx.font = '600 15px ui-monospace, Menlo, monospace';
      ctx.fillStyle = P.goldBright; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`θ = ${(tr * 360).toFixed(3)}°`, 14, 26);
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillStyle = P.inkDim;
      ctx.fillText(`${tr.toFixed(6)} of a turn`, 14, 43);

      drawCompass(ctx, W, tr);
      if (rhythmOn) drawWordStrip(ctx, W, H);
    }

    // The melody's compass: the pitch classes visited so far, with their
    // circular gaps colored by size — never more than three colors needed.
    function drawCompass(ctx, W, tr) {
      const wide = W > 700;
      const r = wide ? 56 : 40;
      const ix = W - r - 34, iy = r + 42;
      const nC = clamp(heard > 0 ? heard : Math.min(34, Math.floor(seedCount)), 2, 89);
      const phases = seedTurns(tr, nC).sort((a, b) => a - b);
      const kinds = gapSizes(tr, nC, GAP_TOL);

      ctx.fillStyle = P.panel; ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ix, iy, r + 13, 0, TAU); ctx.fill(); ctx.stroke();

      const colors = [P.gold, P.azure, P.crimson];
      for (let i = 0; i < phases.length; i++) {
        const next = i + 1 < phases.length ? phases[i + 1] : phases[0] + 1;
        const g = next - phases[i];
        if (g <= GAP_TOL) continue;
        const ci = kinds.findIndex((k) => Math.abs(k - g) <= GAP_TOL);
        ctx.strokeStyle = colors[clamp(ci, 0, 2)] + 'aa';
        ctx.lineWidth = 4;
        const a0 = phases[i] * TAU - Math.PI / 2 + 0.03;
        const a1 = next * TAU - Math.PI / 2 - 0.03;
        if (a1 > a0) { ctx.beginPath(); ctx.arc(ix, iy, r, a0, a1); ctx.stroke(); }
      }
      ctx.fillStyle = P.ink;
      for (const ph of phases) {
        const a = ph * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(ix + (r - 7) * Math.cos(a), iy + (r - 7) * Math.sin(a), 1.6, 0, TAU);
        ctx.fill();
      }
      if (playing && lastPhase != null) {
        const a = lastPhase * TAU - Math.PI / 2;
        sprBright.draw(ctx, ix + (r - 7) * Math.cos(a), iy + (r - 7) * Math.sin(a), 0.8);
      }
      ctx.fillStyle = P.verdant;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${nC} pitches · ${kinds.length} gap size${kinds.length === 1 ? '' : 's'}`,
        ix, iy + r + 27);
    }

    // The Fibonacci word as a two-height tick strip; the sounding bit boxed.
    function drawWordStrip(ctx, W, H) {
      const step = 6, x0 = 14, y0 = H - 14;
      const count = Math.min(wordBits.length, Math.floor((W - 28) / step));
      for (let j = 0; j < count; j++) {
        ctx.fillStyle = wordBits[j] ? P.gold : P.azure;
        const h = wordBits[j] ? 12 : 6;
        ctx.fillRect(x0 + j * step, y0 - h, 3, h);
      }
      if (playing && heard > 0) {
        const j = (heard - 1) % wordBits.length;
        if (j < count) {
          ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
          ctx.strokeRect(x0 + j * step - 1.5, y0 - 15, 6, 17);
        }
      }
      ctx.fillStyle = P.inkFaint;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('the Fibonacci word — long · short, lawful, never repeating', x0, y0 - 21);
    }

    const loop = cv.rafLoop(draw);
    loop.start();
    refreshReadout();

    // ---------- lifecycle ----------
    return {
      pause() { loop.stop(); stopMelody(); bus.mute(); },
      resume() { bus.unmute(); needsDraw = true; loop.start(); },
      destroy() {
        loop.stop(); stopMelody(); bus.dispose();
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointermove', onMove);
        handle.canvas.removeEventListener('pointerup', onUp);
        handle.canvas.removeEventListener('pointercancel', onUp);
        handle.destroy();
      },
    };
  },
};

export const _test = {
  GOLDEN_TURN,
  GOLDEN_DEG,
  fibWord,
  seedTurns,
  distinctTurnCount,
  gapSizes,
  analyzeTurns,
};
