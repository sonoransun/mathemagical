// II.6 — The Geometry of Groove
// Euclidean rhythms: Bjorklund's accelerator-timing algorithm is Euclid's gcd in
// disguise (Toussaint 2005), and its maximally even patterns are the traditional
// rhythms of the world — and, mapped onto the chromatic circle, the scales.
//
// Pure logic (pattern rotation, gap analysis, preset table) is exported in _test
// and runs under node. All DOM/audio work lives inside init().

import { euclidRhythm, mod } from '../../core/math.js';

/* ================= pure, node-testable logic ================= */

// Rotate a boolean pattern by r pulses (delay: a hit at p moves to (p+r) mod n).
export function rotatePattern(hits, r) {
  const n = hits.length;
  const out = new Array(n).fill(false);
  for (let i = 0; i < n; i++) if (hits[i]) out[mod(i + r, n)] = true;
  return out;
}

export function patternString(hits) {
  return hits.map((h) => (h ? 'x' : '.')).join('');
}

// Indices of onsets, ascending.
export function onsets(hits) {
  const out = [];
  for (let i = 0; i < hits.length; i++) if (hits[i]) out.push(i);
  return out;
}

// Circular gaps between consecutive onsets, in necklace order from the first.
export function gapList(hits) {
  const on = onsets(hits);
  const n = hits.length;
  return on.map((p, i) => (i + 1 < on.length ? on[i + 1] : on[0] + n) - p);
}

// Euclid's ladder of divisions on (a, b): the remainder sequence down to gcd.
export function euclidChain(a, b) {
  const lines = [];
  while (b > 0) {
    const q = Math.floor(a / b), r = a % b;
    lines.push(`${a} = ${q}·${b} + ${r}`);
    [a, b] = [b, r];
  }
  return { lines, gcd: a };
}

// Canonical world-rhythm presets. `rot` is the rotation that carries the core
// floor-formula output ⌊i·n/k⌋ onto the traditional form given in `pattern`
// (patterns and attributions per Toussaint 2005, "The Euclidean Algorithm
// Generates Traditional Musical Rhythms").
export const PRESETS = [
  { key: 'tresillo',   k: 3, n: 8,  rot: 6,  name: 'the tresillo',            origin: 'Cuba & the Caribbean', pattern: 'x..x..x.' },
  { key: 'cinquillo',  k: 5, n: 8,  rot: 2,  name: 'the cinquillo',           origin: 'Cuba',                 pattern: 'x.xx.xx.' },
  { key: 'khafif',     k: 2, n: 5,  rot: 0,  name: 'khafif-e-ramal',          origin: '13th-century Persia',  pattern: 'x.x..' },
  { key: 'aksak',      k: 4, n: 9,  rot: 0,  name: 'the aksak',               origin: 'Turkey (2+2+2+3)',     pattern: 'x.x.x.x..' },
  { key: 'bell',       k: 7, n: 12, rot: 2,  name: 'a West African bell pattern', origin: 'Ghana — the Ashanti Mpre rhythm (a rotation of the Ewe standard pattern)', pattern: 'x.xx.x.xx.x.' },
  { key: 'bossa',      k: 5, n: 16, rot: 10, name: 'the bossa-nova',          origin: 'Brazil (the played rotation)', pattern: 'x..x..x...x..x..' },
  { key: 'pentatonic', k: 5, n: 12, rot: 0,  name: 'the major pentatonic',    origin: 'the black keys, as pitches', pattern: 'x.x.x..x.x..' },
];

// Not in the menu — it is the quest's buried treasure. E(7,12) rotated by 11 is
// the major-scale step pattern {0,2,4,5,7,9,11}: gaps 2 2 1 2 2 2 1.
export const MAJOR_SCALE = {
  key: 'major', k: 7, n: 12, rot: 11,
  name: 'the major scale', origin: 'the white keys, as pitches',
  pattern: 'x.x.xx.x.x.x',
};

const NAMED = [...PRESETS, MAJOR_SCALE];

// Recognize a pattern: exact traditional form, or a rotation of one.
export function necklaceName(hits) {
  const s = patternString(hits);
  const n = hits.length, k = onsets(hits).length;
  for (const p of NAMED) if (p.n === n && p.pattern === s) return { ...p, exact: true };
  for (const p of NAMED) {
    if (p.n !== n || p.k !== k) continue;
    for (let r = 1; r < n; r++) {
      if (patternString(rotatePattern(hits, r)) === p.pattern) return { ...p, exact: false };
    }
  }
  return null;
}

export const _test = {
  rotatePattern, patternString, onsets, gapList, euclidChain,
  necklaceName, PRESETS, MAJOR_SCALE, euclidRhythm,
};

/* ================= the exhibit ================= */

const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const VOICES = ['kick', 'rim', 'wood', 'hat'];
const VOICE_LEVEL = { kick: 0.75, hat: 0.3, rim: 0.5, wood: 0.5 };
const PANS = [-0.35, 0.35, -0.12, 0.12];
const C4 = 261.63;

export default {
  id: 'euclid',
  movement: 2,
  title: 'The Geometry of Groove',
  hook: 'Euclid wrote a drum machine.',
  prose: `
    <p>In 2003 an engineer named Eric Bjorklund, writing timing software for the Spallation
    Neutron Source, needed to spread <em>k</em> control pulses over <em>n</em> clock slots as
    evenly as whole numbers allow. Two years later the computer scientist Godfried Toussaint
    looked at Bjorklund's solution and recognized two old acquaintances at once. The procedure
    was structurally <em>Euclid's algorithm</em> — division with remainder, repeated on the
    remainders, the gcd computation from the <em>Elements</em>, twenty-three centuries old.
    And its outputs were rhythms he already knew. Spread 3 hits over 8 pulses and you get
    <code>[x··x··x·]</code> — the <em>tresillo</em> that anchors Cuban son and worked its way
    through the habanera into New Orleans. Five in eight is the <em>cinquillo</em>; four in
    nine the limping Turkish <em>aksak</em>; seven in twelve a common bell pattern of West African drumming
    in West Africa; five in sixteen, suitably rotated, the <em>bossa-nova</em>. Two in five is
    <em>khafif-e-ramal</em>, a rhythm named by Persian theorists in the thirteenth century.
    One ancient subroutine, most of the planet's grooves.</p>
    <p>Why should one of the oldest algorithms on record make music? Perfect evenness would put a hit
    every <code>8/3</code> pulses — but hits must land on whole pulses, so the best a rhythm
    can do is use the two nearest whole gaps, 3 and 2. <em>How many of each</em> is exactly
    division with remainder: <code>8 = 2·3 + 2</code> — three gaps, two of them carrying an
    extra pulse. And spreading those two long gaps evenly among the three is the same problem
    one size smaller, which is precisely Euclid's recursion. In code the whole story collapses
    to one line: onset <em>i</em> lands on pulse <code>⌊i·n/k⌋</code> (a rotation of
    Bjorklund's output — this exhibit stores the rotation that recovers each traditional
    form). Every rhythm the rings below can make obeys the same fingerprint: at most two gap
    sizes, and when there are two they differ by exactly 1. Try to break it; you can't.</p>
    <p>A rhythm here is really a <em>necklace</em> — the circle of pulses doesn't care where
    you start reading. The groove does. Spin a rotation dial and the hits stay identical while
    the pattern's relation to the downbeat — the accented pulse at the top of the ring —
    changes completely: cutting the tresillo's necklace one pulse later gives a rhythm you'd
    swear was new. And rings need not agree on <em>n</em>: in shared-pulse mode an 8-ring and
    a 9-ring drift apart and realign only after <code>lcm(8,9) = 72</code> pulses, a
    polymeter whose coincidences you can watch line up radially before you hear them.</p>
    <p>Then press <em>map to pitch</em>, and the necklace quietly becomes the chromatic
    circle: <em>n</em> pulses turn into <em>n</em> equal divisions of the octave, and every
    hit becomes a note. Set a ring to E(7,12) and hunt for the right rotation, and the West
    African bell pattern climbs <em>do–re–mi</em>: the major scale — the white keys of the
    piano — <em>is</em> the Euclidean rhythm E(7,12), and E(5,12) is the black-key
    pentatonic. Every other rotation of the same necklace is one of the modes. The principle
    choosing the notes of Western harmony and the principle spacing the bell strokes of Ewe
    drumming are one construction — maximal evenness — and we have met its signature before:
    the at-most-two-gap pattern here is the tight case of the three-gap theorem that colored
    the spiral of fifths. Rhythm and scale are the same arithmetic, run at different
    speeds.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const TAU = math.TAU;

    /* ---------- scoped styling ---------- */
    const style = document.createElement('style');
    style.textContent = `
      #ex-euclid .euclid-row { align-items: center; padding: 0.1rem 0.4rem; border-left: 2px solid transparent; }
      #ex-euclid .euclid-row.focus { border-left-color: ${P.gold}; background: rgba(201,169,89,0.05); }
      #ex-euclid .euclid-row.off { opacity: 0.55; }
      #ex-euclid .euclid-swatch { width: 0.65rem; height: 0.65rem; border-radius: 50%; flex: 0 0 auto; }`;
    stage.appendChild(style);

    /* ---------- state ---------- */
    const RING_COLORS = [P.gold, P.azure, P.crimson, P.verdant];
    const rings = [
      { on: true,  k: 3, n: 8,  rot: 6, voice: 'kick' },  // tresillo
      { on: true,  k: 5, n: 8,  rot: 2, voice: 'rim'  },  // cinquillo
      { on: false, k: 4, n: 9,  rot: 0, voice: 'wood' },  // aksak, ready to join
      { on: false, k: 7, n: 12, rot: 2, voice: 'hat'  },  // Ewe bell, ready to join
    ];
    let bpm = 100;
    let shared = false;          // false: one bar per sweep · true: shared pulse (polymeter)
    let pitchMode = false;
    let playing = false;
    let focus = 0;
    let questDone = false;

    let scheduler = null;
    let rts = [];                // per-ring runtime: { ri, p, next }
    let anchor = null;           // bar top (bar mode) / pulse-grid origin (pulse mode)
    let queue = [];              // scheduled pulse events -> consumed by draw at audio time

    const bus = audio.createBus('euclid');
    const handle = cv.setupCanvas(stage, { height: 470 });
    const sprites = RING_COLORS.map((c) => cv.glowSprite(c, 26));

    const barDur = () => 240 / bpm;            // 4 beats per sweep
    const pulseDur = (rg) => (shared ? 30 / bpm : barDur() / rg.n);
    const nowT = () => { const c = audio.getContext(); return c ? c.currentTime : 0; };

    for (const rg of rings) recomputeHits(rg);

    function recomputeHits(rg) {
      rg.hits = rotatePattern(euclidRhythm(rg.k, rg.n), rg.rot);
      rg.flash = new Array(rg.n).fill(-1e9);
      rg.vis = null;
    }

    /* ---------- controls ---------- */
    const controls = ui.controlRow(stage);
    const playBtn = ui.button(controls, '▶ play', togglePlay, { primary: true });
    ui.slider(controls, {
      label: 'tempo', min: 54, max: 190, step: 1, value: bpm,
      format: (v) => `${v} bpm`,
      onInput: setBpm,
    });
    ui.toggle(controls, {
      label: 'shared pulse — true polymeter', value: shared,
      onChange: (v) => { shared = v; if (playing) { stopPlay(); startPlay(); } refresh(); },
    });
    ui.toggle(controls, {
      label: 'map to pitch', value: pitchMode,
      onChange: (v) => { pitchMode = v; refresh(); },
    });
    const presetSel = ui.select(controls, {
      label: 'world rhythms → ring 1',
      options: [{ value: '', label: 'choose a tradition…' }].concat(
        PRESETS.map((p) => ({ value: p.key, label: `${p.name} · E(${p.k},${p.n}) — ${p.origin}` }))),
      value: '',
      onChange: (v) => { if (v) { applyPreset(v); presetSel.set(''); } },
    });

    // one compact row per ring
    rings.forEach((rg, i) => {
      const row = ui.controlRow(stage);
      row.classList.add('euclid-row');
      const sw = document.createElement('span');
      sw.className = 'euclid-swatch';
      sw.style.background = RING_COLORS[i];
      row.appendChild(sw);
      rg.ui = { row };
      rg.ui.on = ui.toggle(row, {
        label: `ring ${i + 1}`, value: rg.on,
        onChange: (v) => {
          rg.on = v;
          if (playing) { if (v) joinRing(i); else if (rts[i]) { rts[i].next = null; } }
          if (!v) { rg.vis = null; rg.flash.fill(-1e9); }
          focusRing(i);
        },
      });
      rg.ui.k = ui.stepper(row, {
        label: 'hits k', min: 1, max: 16, value: rg.k,
        onChange: (v) => { rg.k = Math.min(v, rg.n); if (rg.k !== v) rg.ui.k.set(rg.k); edited(i); },
      });
      rg.ui.n = ui.stepper(row, {
        label: 'pulses n', min: 2, max: 16, value: rg.n,
        onChange: (v) => {
          rg.n = v;
          if (rg.k > v) { rg.k = v; rg.ui.k.set(v); }
          rg.rot = mod(rg.rot, v); rg.ui.rot.set(rg.rot);
          edited(i);
        },
      });
      rg.ui.rot = ui.stepper(row, {
        label: 'rotate', min: -1, max: 16, value: rg.rot,
        onChange: (v) => { rg.rot = mod(v, rg.n); if (rg.rot !== v) rg.ui.rot.set(rg.rot); edited(i); },
      });
      rg.ui.voice = ui.select(row, {
        label: 'voice', options: VOICES, value: rg.voice,
        onChange: (v) => { rg.voice = v; focusRing(i); },
      });
    });

    const info = ui.readout(stage, '');
    const quest = ui.questBanner(stage,
      'Set a ring to E(7,12) — the bell pattern — switch on <em>map to pitch</em>, and hunt the rotation that climbs do–re–mi.');
    ui.caption(stage,
      'Each ring is a necklace of <em>n</em> pulses; its <em>k</em> onsets are joined into an inscribed polygon — ' +
      'maximal evenness made visible (E(3,8) is the flattest triangle eight points allow). The top of every ring is ' +
      'the accented downbeat. Needles are driven by the audio clock; in shared-pulse mode each ring carries its own, ' +
      'and they align radially exactly when hits coincide. With <em>map to pitch</em>, pulse <em>p</em> of an ' +
      '<em>n</em>-ring sounds at 261.63 · 2<sup>p/n</sup> Hz — twelve pulses give the chromatic circle, sixteen a ' +
      '16-tone octave.');
    ui.speculationPanel(stage,
      `<p>Spin one of these necklaces three hundred times a second and the ear stops counting. A click pattern looped
      faster than roughly twenty repetitions per second is no longer heard as rhythm at all: it fuses into a tone whose
      <em>timbre</em> is the pattern. Groove and pitch are not merely analogous circles — they are one phenomenon
      sampled at timescales a few hundredfold apart, and <em>map to pitch</em> is less a metaphor than a change of
      units. Composers have built whole aesthetics on that continuum; the mathematics was waiting in Book VII of the
      <em>Elements</em>.</p>`,
      'the same circle, faster');

    /* ---------- transport & scheduling ---------- */
    function togglePlay() {
      audio.ensureAudio();
      if (playing) stopPlay(); else startPlay();
    }

    function startPlay() {
      audio.ensureAudio();
      playing = true;
      playBtn.textContent = '■ stop';
      playBtn.classList.add('active');
      anchor = null;
      queue = [];
      rts = rings.map((rg, i) => ({ ri: i, p: 0, next: null }));
      scheduler = audio.createScheduler(tick, { lookahead: 0.15 });
      scheduler.start(0.1);
      refresh();
    }

    function stopPlay() {
      playing = false;
      playBtn.textContent = '▶ play';
      playBtn.classList.remove('active');
      if (scheduler) { scheduler.stop(); scheduler = null; }
      queue = [];
      anchor = null;
      rts = [];
      for (const rg of rings) { rg.vis = null; }
      refresh();
    }

    function tick(t) {
      if (anchor === null) {
        anchor = t;
        for (const rt of rts) if (rings[rt.ri].on) rt.next = t;
      }
      let tmin = Infinity;
      for (const rt of rts) {
        if (rt.next == null) continue;
        while (rt.next <= t + 1e-4) firePulse(rt);
        if (rt.next < tmin) tmin = rt.next;
      }
      return tmin === Infinity ? t + 0.25 : tmin;   // heartbeat while all rings are off
    }

    function firePulse(rt) {
      const rg = rings[rt.ri];
      const t = rt.next;
      const pos = rt.p % rg.n;
      const d = pulseDur(rg);
      const hit = !!rg.hits[pos];
      if (hit) sound(rg, rt.ri, pos, t);
      // bar-mode anchor: track bar tops of the first enabled ring
      if (!shared && pos === 0 && rt.ri === rings.findIndex((r) => r.on)) anchor = t;
      queue.push({ ri: rt.ri, p: pos, t, d, hit });
      if (queue.length > 600) queue.splice(0, 300);
      rt.p = (pos + 1) % rg.n;
      rt.next = t + d;
    }

    function sound(rg, ri, pos, t) {
      const accent = pos === 0;
      if (pitchMode) {
        audio.playTone(bus, {
          freq: C4 * Math.pow(2, pos / rg.n),
          dur: 0.22, type: 'triangle',
          level: accent ? 0.4 : 0.3,
          attack: 0.005, release: 0.1, when: t, pan: PANS[ri],
        });
      } else {
        const lv = Math.min(VOICE_LEVEL[rg.voice] * (accent ? 1.25 : 1), 0.9);
        audio.drums[rg.voice](bus, t, { level: lv });
      }
    }

    // A ring switched on mid-flight joins at the next bar top (bar mode) or the
    // next shared pulse (pulse mode) — never mid-gap.
    function joinRing(i) {
      if (!playing || !rts[i]) return;
      const now = nowT();
      const rt = rts[i];
      rt.p = 0;
      if (anchor == null) { rt.next = now + 0.1; return; }
      const period = shared ? 30 / bpm : barDur();
      const m = Math.max(0, Math.ceil((now + 0.06 - anchor) / period));
      rt.next = anchor + m * period;
    }

    // Tempo changes rescale every pending event time around "now" — simultaneity
    // (and thus ring alignment) is preserved exactly, with no click or restart.
    function setBpm(v) {
      const c = audio.getContext();
      if (playing && c && scheduler) {
        const now = c.currentTime;
        const rho = bpm / v;
        for (const rt of rts) if (rt.next != null) rt.next = now + (rt.next - now) * rho;
        if (anchor != null) anchor = now + (anchor - now) * rho;
        bpm = v;
        scheduler.stop();
        scheduler.start(0.02);
      } else {
        bpm = v;
      }
      updateReadout();
    }

    /* ---------- edits, presets, quest ---------- */
    function edited(i) {
      recomputeHits(rings[i]);
      focusRing(i);
    }

    function focusRing(i) {
      focus = i;
      rings.forEach((rg, j) => {
        rg.ui.row.classList.toggle('focus', j === focus);
        rg.ui.row.classList.toggle('off', !rg.on);
      });
      refresh();
    }

    function applyPreset(key) {
      const p = PRESETS.find((q) => q.key === key);
      if (!p) return;
      const rg = rings[0];
      rg.k = p.k; rg.n = p.n; rg.rot = p.rot;
      rg.ui.k.set(p.k); rg.ui.n.set(p.n); rg.ui.rot.set(p.rot);
      recomputeHits(rg);
      if (!rg.on) { rg.on = true; rg.ui.on.set(true); if (playing) joinRing(0); }
      focusRing(0);
    }

    function checkQuest() {
      if (questDone || !pitchMode) return;
      const hitIt = rings.some((rg) =>
        rg.on && rg.n === 12 && rg.k === 7 && patternString(rg.hits) === MAJOR_SCALE.pattern);
      if (hitIt) {
        questDone = true;
        quest.done('Rotation 11 — and the bell pattern sings the major scale. Same necklace, two continents. ' +
          'Keep spinning: every other rotation is one of the modes.');
      }
    }

    function refresh() { checkQuest(); updateReadout(); }

    function updateReadout() {
      const rg = rings[focus];
      const gaps = gapList(rg.hits);
      const sizes = [...new Set(gaps)];
      const even = sizes.length === 1
        ? 'one gap size — perfectly even'
        : 'two gap sizes, differing by 1 — maximally even';
      const nm = necklaceName(rg.hits);
      const named = nm ? ` · ${nm.exact ? nm.name : 'a rotation of ' + nm.name} (${nm.origin})` : '';
      const chain = euclidChain(rg.n, rg.k);
      const lines = [
        `ring ${focus + 1} · E(${rg.k},${rg.n}) rot ${rg.rot} → [${patternString(rg.hits).replace(/\./g, '·')}]` +
        ` · gaps ${gaps.join('+')} (${even})${named}`,
        `Euclid’s ladder on (${rg.n},${rg.k}): ${chain.lines.join('  →  ')}  ⇒  gcd = ${chain.gcd}`,
      ];
      const onRings = rings.filter((r) => r.on);
      if (onRings.length > 1) {
        const ns = onRings.map((r) => r.n);
        if (shared) {
          const l = ns.reduce((a, b) => (a / math.gcd(a, b)) * b);
          lines.push(`shared pulse: the ensemble repeats every lcm(${ns.join(',')}) = ${l} pulses`);
        } else {
          lines.push(`one bar per sweep: ${ns.join(':')} cross-rhythm — coincident hits align radially`);
        }
      }
      if (pitchMode) lines.push(`pitch map: pulse p → ${C4} · 2^(p/n) Hz — rotation now chooses the mode`);
      info.setHTML(lines.join('<br>'));
    }

    /* ---------- drawing ---------- */
    const SLOTS = [0.42, 0.62, 0.81, 1.0];
    const MONO = '11px ui-monospace, Menlo, monospace';

    function draw() {
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const Rmax = Math.min(W, H) / 2 - 32;
      const now = nowT();

      // consume due events (audio-clock sync; queue is per-ring ordered, not global)
      if (queue.length) {
        const keep = [];
        for (const e of queue) {
          if (e.t <= now) {
            const rg = rings[e.ri];
            if (!rg.vis || e.t >= rg.vis.t) rg.vis = e;
            if (e.hit && e.p < rg.flash.length) rg.flash[e.p] = e.t;
          } else keep.push(e);
        }
        queue = keep;
      }

      const angleOf = (p, n) => (p / n) * TAU - Math.PI / 2;

      rings.forEach((rg, i) => {
        const r = SLOTS[i] * Rmax;
        if (!rg.on) {
          ctx.strokeStyle = P.line; ctx.setLineDash([2, 7]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          return;
        }
        const col = RING_COLORS[i];

        // ring circle + downbeat notch at the top
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = P.inkFaint;
        ctx.beginPath(); ctx.moveTo(cx, cy - r - 6); ctx.lineTo(cx, cy - r - 11); ctx.stroke();

        // inscribed onset polygon — the geometry of maximal evenness
        const on = onsets(rg.hits);
        if (on.length >= 2) {
          ctx.beginPath();
          on.forEach((p, j) => {
            const a = angleOf(p, rg.n);
            const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
            j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          });
          ctx.closePath();
          if (on.length >= 3) { ctx.fillStyle = col + '10'; ctx.fill(); }
          ctx.strokeStyle = col + '55'; ctx.lineWidth = 1.2; ctx.stroke();
        }

        // pulses & onsets, with audio-synced flashes
        for (let p = 0; p < rg.n; p++) {
          const a = angleOf(p, rg.n);
          const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
          if (rg.hits[p]) {
            const age = now - rg.flash[p];
            const f = age >= 0 && age < 0.35 ? 1 - age / 0.35 : 0;
            if (f > 0) sprites[i].draw(ctx, x, y, 0.9 + 1.1 * f);
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(x, y, 4.5 + 3 * f, 0, TAU); ctx.fill();
            if (f > 0) {
              ctx.fillStyle = P.ink;
              ctx.beginPath(); ctx.arc(x, y, 1.6 + 1.8 * f, 0, TAU); ctx.fill();
            }
          } else {
            ctx.fillStyle = P.inkFaint;
            ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
          }
        }

        // needle, interpolated from the last consumed pulse event
        if (playing && rg.vis) {
          const frac = math.clamp((now - rg.vis.t) / rg.vis.d, 0, 1);
          const a = angleOf((rg.vis.p + frac) % rg.n, rg.n);
          const x0 = cx + (r - 13) * Math.cos(a), y0 = cy + (r - 13) * Math.sin(a);
          const x1 = cx + (r + 13) * Math.cos(a), y1 = cy + (r + 13) * Math.sin(a);
          ctx.strokeStyle = col + 'cc'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          sprites[i].draw(ctx, cx + r * Math.cos(a), cy + r * Math.sin(a), 0.7);
        }

        // small ring index, lower-left, between rings
        ctx.fillStyle = col + 'aa';
        ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const la = 2.35;
        ctx.fillText(String(i + 1), cx + (r + 11) * Math.cos(la), cy + (r + 11) * Math.sin(la));
      });

      // note names outside the outermost enabled ring, when it is chromatic
      if (pitchMode) {
        let top = -1;
        rings.forEach((rg, i) => { if (rg.on) top = i; });
        if (top >= 0 && rings[top].n === 12) {
          const r = SLOTS[top] * Rmax + 20;
          ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (let p = 0; p < 12; p++) {
            const a = angleOf(p, 12);
            ctx.fillStyle = rings[top].hits[p] ? P.inkDim : P.inkFaint;
            ctx.fillText(NOTE_NAMES[p], cx + r * Math.cos(a), cy + r * Math.sin(a));
          }
        }
      }

      // centre label: the focused ring's formula and word
      const rg = rings[focus];
      ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = RING_COLORS[focus] + 'cc';
      ctx.fillText(`E(${rg.k},${rg.n}) + ${rg.rot}`, cx, cy - 8);
      ctx.fillStyle = P.inkDim;
      ctx.fillText(patternString(rg.hits).replace(/\./g, '·'), cx, cy + 9);
    }

    const loop = cv.rafLoop(draw);
    loop.start();
    focusRing(0);

    /* ---------- lifecycle ---------- */
    return {
      pause() { loop.stop(); stopPlay(); bus.mute(); },
      resume() { bus.unmute(); loop.start(); },
      destroy() { loop.stop(); stopPlay(); bus.dispose(); handle.destroy(); style.remove(); },
    };
  },
};
