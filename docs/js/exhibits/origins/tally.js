// I·1 — One, Two, Many
// Subitizing (the perceptual cliff at four), one-to-one correspondence (the
// pebble pouch), the first notation (grouping, carved into the Lebombo and
// Ishango bones), and the compression argument for positional numerals.
//
// Ishango column data transcribed at build time (Jean de Heinzelin's published
// reading, checked against UNESCO's astronomical-heritage entry and standard
// references): left 11,13,17,19 (=60) · middle 3,6,4,8,10,5,5,7 (=48) ·
// right 11,21,19,9 (=60). The prime/lunar/base-12 readings are stories and are
// presented only inside the legend panel.

import { palette as P } from '../../core/canvas.js';
import { TAU, clamp } from '../../core/math.js';

/* ================= pure logic (exported for node tests) ================= */

// Deterministic PRNG (mulberry32) so trials are reproducible under test.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Place n dots in a w×h region, pairwise separation ≥ 2.6·r, kept r·2 clear of
// the edges. Rejection sampling with a jittered-grid fallback; the separation
// guarantee holds whenever the region can hold n dots at that spacing (always
// true for the exhibit's n ≤ 9 in a ~460×200 region).
export function genDots(n, w, h, r = 9, rng = Math.random) {
  const minSep = r * 2.6, pad = r * 2;
  const W = Math.max(1, w - pad * 2), H = Math.max(1, h - pad * 2);
  const sep2 = minSep * minSep;
  for (let attempt = 0; attempt < 40; attempt++) {
    const pts = [];
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      let placed = false;
      for (let t = 0; t < 150; t++) {
        const x = pad + rng() * W, y = pad + rng() * H;
        if (pts.every((p) => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) >= sep2)) {
          pts.push({ x, y }); placed = true; break;
        }
      }
      if (!placed) ok = false;
    }
    if (ok) return pts;
  }
  // Jittered grid: neighbouring cells are min(cw,ch) apart, jitter is bounded
  // by (min(cw,ch) − minSep)/2, so separation survives (diagonals included).
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (W / H)))) || 1;
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = W / cols, ch = H / rows;
  const jit = Math.max(0, (Math.min(cw, ch) - minSep) / 2);
  const order = [...Array(cols * rows).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pts = [];
  for (let k = 0; k < n; k++) {
    const c = order[k] % cols, rw = Math.floor(order[k] / cols);
    pts.push({
      x: pad + c * cw + cw / 2 + (rng() * 2 - 1) * jit,
      y: pad + rw * ch + ch / 2 + (rng() * 2 - 1) * jit,
    });
  }
  return pts;
}

// Shuffled deck of trial counts: every n in [lo, hi], `reps` times each.
export function makeDeck(rng = Math.random, lo = 1, hi = 9, reps = 2) {
  const deck = [];
  for (let rep = 0; rep < reps; rep++) for (let n = lo; n <= hi; n++) deck.push(n);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Symbols a reader must take in to grasp a record of n:
//   tally    — one stroke per item: n
//   grouped  — completed five-groups read as single chunks, plus leftovers:
//              ⌊n/5⌋ + (n mod 5)
//   digits   — positional decimal: ⌊log₁₀ n⌋ + 1
export function compressionCounts(n) {
  n = Math.max(0, Math.floor(n));
  return {
    tally: n,
    grouped: Math.floor(n / 5) + (n % 5),
    digits: String(n).length,
  };
}

// Per-n accuracy and mean correct-answer response time from a stats record
// { n: { tries, correct, rtSum, rtN } }. Unseen n → null.
export function statsSeries(stats, lo = 1, hi = 9) {
  const acc = [], rt = [];
  for (let n = lo; n <= hi; n++) {
    const s = stats[n];
    acc.push(s && s.tries ? s.correct / s.tries : null);
    rt.push(s && s.rtN ? s.rtSum / s.rtN : null);
  }
  return { acc, rt };
}

// The real notch groups. Columns run the length of the bone.
export const ISHANGO = {
  left: [11, 13, 17, 19],            // = 60
  middle: [3, 6, 4, 8, 10, 5, 5, 7], // = 48; 3→6 and 4→8 are doublings
  right: [11, 21, 19, 9],            // = 60
};
export const LEBOMBO_NOTCHES = 29;   // the bone is broken; 29 may be a partial count

/* ================= drawing helpers (take ctx; no DOM at import) ================= */

// A run of plain strokes, one per item, clipped at maxX. Returns what fit.
function drawStrokeRun(ctx, x, y, count, opts = {}) {
  const pitch = opts.pitch ?? 5, h = opts.h ?? 26, maxX = opts.maxX ?? Infinity;
  let cx = x, drawn = 0;
  ctx.beginPath();
  while (drawn < count && cx <= maxX) {
    ctx.moveTo(cx, y); ctx.lineTo(cx, y + h);
    cx += pitch; drawn++;
  }
  ctx.stroke();
  return { drawn, endX: cx, overflow: drawn < count };
}

// Five-grouped tally: ||||-with-gate chunks, then leftover strokes.
function drawTallyRun(ctx, x, y, count, opts = {}) {
  const pitch = opts.pitch ?? 7, gap = opts.gap ?? 10, h = opts.h ?? 24;
  const maxX = opts.maxX ?? Infinity;
  const groups = Math.floor(count / 5), rem = count % 5;
  let cx = x, symbols = 0, overflow = false;
  ctx.beginPath();
  for (let g = 0; g < groups; g++) {
    if (cx + 3 * pitch > maxX) { overflow = true; break; }
    for (let i = 0; i < 4; i++) { ctx.moveTo(cx + i * pitch, y); ctx.lineTo(cx + i * pitch, y + h); }
    ctx.moveTo(cx - 2, y + h - 2); ctx.lineTo(cx + 3 * pitch + 2, y + 2);
    cx += 3 * pitch + gap; symbols++;
  }
  if (!overflow) {
    for (let i = 0; i < rem; i++) {
      if (cx > maxX) { overflow = true; break; }
      ctx.moveTo(cx, y); ctx.lineTo(cx, y + h);
      cx += pitch; symbols++;
    }
  }
  ctx.stroke();
  return { symbols, endX: cx, overflow };
}

// Elongated bone silhouette; `broken` gives the right end a fracture.
function drawBoneOutline(ctx, cx, cy, len, girth, broken) {
  const x0 = cx - len / 2, x1 = cx + len / 2, t = girth / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + 14, cy - t * 0.7);
  ctx.quadraticCurveTo(cx, cy - t * 1.08, x1 - 14, cy - t * 0.75);
  if (broken) {
    const steps = 5, top = cy - t * 0.75, bot = cy + t * 0.75;
    for (let i = 1; i <= steps; i++) {
      ctx.lineTo(x1 - 14 + ((i % 2) ? 9 : 1), top + (i / steps) * (bot - top));
    }
  } else {
    ctx.bezierCurveTo(x1 + 10, cy - t, x1 + 10, cy + t, x1 - 14, cy + t * 0.75);
  }
  ctx.quadraticCurveTo(cx, cy + t * 1.08, x0 + 14, cy + t * 0.7);
  ctx.bezierCurveTo(x0 - 10, cy + t, x0 - 10, cy - t, x0 + 14, cy - t * 0.7);
  ctx.closePath();
  ctx.fillStyle = P.ink;
  ctx.fill();
  ctx.strokeStyle = P.inkDim;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// A woolly sheep. s: { x, y, dir, walk, moving, lobes, state }
function drawSheep(ctx, s, t, scale = 1) {
  const bob = s.moving ? Math.abs(Math.sin(s.walk * 3)) * 1.6 : 0;
  ctx.save();
  ctx.translate(s.x, s.y - bob);
  ctx.scale(s.dir < 0 ? -scale : scale, scale);
  // legs
  const sw = s.moving ? Math.sin(s.walk * 6) * 4 : 0;
  ctx.strokeStyle = P.panel;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, 4); ctx.lineTo(-8 + sw, 14);
  ctx.moveTo(-3, 4); ctx.lineTo(-3 - sw, 14);
  ctx.moveTo(3, 4); ctx.lineTo(3 + sw, 14);
  ctx.moveTo(8, 4); ctx.lineTo(8 - sw, 14);
  ctx.stroke();
  // fleece
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  for (const l of s.lobes) {
    ctx.moveTo(l.x + l.r, l.y);
    ctx.arc(l.x, l.y, l.r, 0, TAU);
  }
  ctx.fill();
  // head (dips to graze)
  const grazing = s.state === 'graze' && !s.moving;
  const hy = grazing ? Math.sin(t * 1.7 + s.x * 0.05) * 1.5 + 2.5 : -4;
  ctx.fillStyle = P.panel;
  ctx.beginPath();
  ctx.ellipse(12, hy, 4.6, 3.6, -0.25, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(10, hy - 2.6, 2.3, 1.3, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ================= the exhibit ================= */

export default {
  id: 'tally',
  movement: 1,
  title: 'One, Two, Many',
  hook: 'Count a flock without knowing how to count.',
  prose: `
    <p>Before arithmetic there is a reflex. One dot, two, three, four — a glance tells you
    exactly which, in about a fifth of a second, with no feeling of effort. Psychologists call
    it <em>subitizing</em>, from the Latin <code>subitus</code>, sudden. At five the sudden
    knowledge fails, everywhere it has ever been measured: past four the mind must either count
    in series, at roughly 250 to 350 milliseconds per item — far slower than a flock files past
    a gate — or estimate, and be wrong. The first station below runs the classic experiment on
    you. We ask you to take nothing in this essay on authority, so the cliff between
    <em>four</em> and <em>five</em> is yours to fall off personally.</p>
    <p>Mathematics begins as a technology for living at the bottom of that cliff, and its first
    invention is not the number. It is the <em>pairing</em>. A herder who drops one pebble in a
    pouch for every sheep that leaves the pen owns, by dusk, a question-answering machine:
    sheep come home, pebbles come out, and any pebble left over is a missing animal — a
    leftover small enough to see at a glance, which is exactly why the trick works. No numeral
    is ever uttered; nobody involved knows <em>how many</em> sheep there are, and nobody needs
    to. Two collections are the same size when their members pair off with nothing left over on
    either side. Keep that humble definition; in this essay's final movement it becomes the
    instrument that weighs one infinity against another.</p>
    <p>The pebbles were perishable; the notches survive. A baboon fibula from Border Cave in
    the Lebombo Mountains, between South Africa and Eswatini, carries 29 cut marks and an age
    of roughly 43,000 years — though the bone is broken at one end, so 29 need not be the
    carver's total. The Ishango bone, from the shore of Lake Edward at the headwaters of the Nile, in what is now the DR Congo, is
    about 20,000 years old and far stranger: three columns of notches cut in deliberate
    groups, and in the middle column a 3 sits beside a 6, a 4 beside an 8 — doubling, caught
    in the act. What the columns meant, no one knows (the confident stories live in the panel
    below). What they show is enough: <em>grouping</em>. Nineteen scratches in a row are
    unreadable at a glance; nineteen as a few handfuls and a remainder is not. Chunking marks
    back under the perceptual limit is the first act of notation — and be clear about whose
    limit it serves. The carvers' minds were exactly ours. These bones record no deficiency of
    ancient brains; they are a workaround for <em>all</em> brains, yours included, as the
    flash test will just have demonstrated.</p>
    <p>Once marks exist, they beg to be compressed. A tally spends one mark per sheep. Grouped
    in fives it reads five times faster. And a positional numeral — the trick Babylon perfects
    two exhibits from here — spends a symbol not per sheep but per <em>power</em>, so seven
    million animals fit in seven characters. The last station lets you watch the three
    notations part company as the flock grows: the tally walks out of the room, the handfuls
    follow it, and the numeral barely lengthens. That gap — linear against logarithmic — is
    the entire economic case for arithmetic, visible some four thousand years before anyone
    could say <code>log</code>.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;

    /* ---------- shared state ---------- */
    let phase = 'flash';        // 'flash' | 'pouch' | 'carve' | 'compress'
    let lastT = 0;              // rAF clock (s), updated every frame
    const bus = audio.createBus('tally');
    const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

    const style = document.createElement('style');
    style.textContent = `
      #ex-tally .tally-answers { display:flex; flex-wrap:wrap; gap:.4rem; justify-content:center; margin:.55rem 0 .1rem; }
      #ex-tally .tally-answers .btn { min-width:2.5rem; }
      #ex-tally .tally-hidden { display:none !important; }
      #ex-tally .tally-sub .controls { margin-top:.55rem; }
    `;
    stage.appendChild(style);

    /* ---------- layout ---------- */
    const phaseRow = ui.controlRow(stage);
    const PHASES = [
      ['flash', 'I · the flash'],
      ['pouch', 'II · the pouch'],
      ['carve', 'III · the carving'],
      ['compress', 'IV · compression'],
    ];
    const phaseBtns = {};
    for (const [id, label] of PHASES) {
      phaseBtns[id] = ui.button(phaseRow, label, () => setPhase(id), { small: true });
    }

    const quest = ui.questBanner(stage, '');
    const handle = cv.setupCanvas(stage, { height: 440 });
    handle.canvas.style.touchAction = 'pan-y';

    const sub = document.createElement('div');
    sub.className = 'tally-sub';
    stage.appendChild(sub);
    const subFlash = document.createElement('div');
    const subPouch = document.createElement('div');
    const subCarve = document.createElement('div');
    const subCompress = document.createElement('div');
    for (const d of [subFlash, subPouch, subCarve, subCompress]) sub.appendChild(d);

    const info = ui.readout(stage, '');
    const mathlineEl = ui.mathline(stage,
      'marks to record <em>n</em>:&nbsp;&nbsp;tally = n&nbsp;&nbsp;·&nbsp;&nbsp;grouped ≈ n/5&nbsp;&nbsp;·&nbsp;&nbsp;positional = ⌊log₁₀ n⌋ + 1');
    ui.caption(stage,
      'Four stations, in order: fail to count; count without numbers; invent notation; discover ' +
      'compression. The carving ends at the real Ishango columns — 11·13·17·19, then 3·6·4·8·10·5·5·7, ' +
      'then 11·21·19·9 — and the wood tick on each pebble is the first sound in this essay.');
    ui.legendPanel(stage, `
      <p>The left column of the Ishango bone reads 11, 13, 17, 19 — the four prime numbers
      between 10 and 20 — and so the bone has been called the world's first table of primes.
      Count the notches another way and you can conjure a six-month lunar calendar out of them;
      the side columns each sum to 60, the middle to 48, both multiples of 12, which has
      launched theories of a base-12 arithmetic on the equator twenty thousand years ago. Most
      archaeologists counsel a plainer reading: a tally — of catches, of days, of debts, of
      something now unrecoverable — whose deliberate groupings are real, and whose primes are
      probably ours rather than the carver's. Four numbers make a thin book of number theory.</p>`);
    ui.speculationPanel(stage, `
      <p>Where did the marks go next? Denise Schmandt-Besserat's reconstruction — the leading
      hypothesis, argued from thousands of finds, though not universally accepted — traces
      writing itself back to counting. Mesopotamian accountants long tracked goods with small
      clay tokens: cones, spheres, disks, each shape a commodity. Tokens sealed inside a clay
      envelope guaranteed a debt; scribes took to pressing the tokens into the soft outside
      before sealing them in, so the envelope advertised its contents — until someone noticed
      that once the surface is marked, the tokens inside are redundant. Flatten the envelope
      and you have a tablet; the impression has become a sign. On this account the first
      writing was a receipt, and literature is a very late use of bookkeeping.</p>`);

    /* ---------- quest & phase bookkeeping ---------- */
    const QUEST_DEFAULTS = {
      flash: 'Watch the field: a handful of dots will flash for a quarter of a second. ' +
             'Say how many you saw. No counting — there isn’t time.',
      pouch: 'Dawn. Open the pen, then drop one pebble in the pouch for every sheep that ' +
             'reaches the gate. The pouch will remember what you cannot.',
      carve: 'Too many pebbles to see at a glance. Herd them into handfuls of five — then ' +
             'carve the handfuls into bone.',
      compress: 'Every mark is a sheep. Slide the flock toward seven million and watch three ' +
                'ways of writing it part company.',
    };
    const INFO_DEFAULTS = {
      flash: 'no trials yet — the chart below will draw itself from your answers.',
      pouch: 'the pouch is the machine; you are only its power source.',
      carve: 'drag pebbles with the pointer.',
      compress: 'slide the flock. one notch is four millimetres of bone.',
    };
    const questSaved = {};
    function setQuest(html, done = false) {
      questSaved[phase] = { html, done };
      applyQuest();
    }
    function applyQuest() {
      const q = questSaved[phase] || { html: QUEST_DEFAULTS[phase], done: false };
      if (q.done) quest.done(q.html); else quest.set(q.html);
    }

    function showSub() {
      subFlash.classList.toggle('tally-hidden', phase !== 'flash');
      subPouch.classList.toggle('tally-hidden', phase !== 'pouch');
      subCarve.classList.toggle('tally-hidden', phase !== 'carve');
      subCompress.classList.toggle('tally-hidden', phase !== 'compress');
      mathlineEl.style.display = phase === 'compress' ? '' : 'none';
    }

    function setPhase(p) {
      if (phase === 'flash' && p !== 'flash') stopFlash();
      phase = p;
      for (const [id] of PHASES) phaseBtns[id].classList.toggle('active', id === p);
      if (p === 'carve' && carve.pebbles.length === 0) buildCarve();
      showSub();
      applyQuest();
      info.set(INFO_DEFAULTS[p]);
      handle.canvas.style.cursor = 'default';
    }

    /* ================= beat I — the flash ================= */

    const flash = {
      running: false, state: 'idle', deck: [], n: 0, dots: [],
      tEnter: 0, onset: 0, stats: {}, trials: 0, summaryShown: false,
      lastAnswer: 0, lastCorrect: false, lastRt: 0,
    };
    const DOT_TOP = 8, DOT_H = 232;
    const dotGlow = cv.glowSprite(P.gold, 36);

    const flashRow = ui.controlRow(subFlash);
    const beginBtn = ui.button(flashRow, '▶ flash the flock', () => {
      if (flash.running) stopFlash(); else startFlash();
    }, { primary: true });
    const answers = document.createElement('div');
    answers.className = 'tally-answers';
    subFlash.appendChild(answers);
    const answerBtns = [];
    for (let k = 1; k <= 9; k++) answerBtns.push(ui.button(answers, String(k), () => answer(k), { small: true }));
    function setAnswers(on) { for (const b of answerBtns) b.disabled = !on; }
    setAnswers(false);

    function dotRegion() {
      const w = Math.min(handle.width - 24, 520);
      return { x: (handle.width - w) / 2, y: DOT_TOP, w, h: DOT_H };
    }
    function flashGoto(st, t) {
      flash.state = st;
      flash.tEnter = t;
      setAnswers(st === 'mask');
      if (st === 'show') flash.onset = performance.now();
    }
    function nextTrial(t) {
      if (!flash.deck.length) flash.deck = makeDeck(rng);
      flash.n = flash.deck.pop();
      const R = dotRegion();
      flash.dots = genDots(flash.n, R.w, R.h - 26, 9, rng);
      flashGoto('fixate', t);
    }
    function startFlash() {
      audio.ensureAudio();
      flash.running = true;
      beginBtn.textContent = '■ stop';
      nextTrial(lastT);
    }
    function stopFlash() {
      flash.running = false;
      beginBtn.textContent = '▶ flash the flock';
      flashGoto('idle', lastT);
    }
    function answer(k) {
      if (!flash.running || flash.state !== 'mask') return;
      audio.ensureAudio();
      const rt = performance.now() - flash.onset;
      const correct = k === flash.n;
      const s = (flash.stats[flash.n] ||= { tries: 0, correct: 0, rtSum: 0, rtN: 0 });
      s.tries++;
      if (correct) { s.correct++; s.rtSum += rt; s.rtN++; }
      flash.trials++;
      flash.lastAnswer = k; flash.lastCorrect = correct; flash.lastRt = rt;
      const now = bus.context.currentTime;
      if (correct) audio.drums.wood(bus, now, { pitch: 980, level: 0.35 });
      else audio.drums.thock(bus, now, { level: 0.45 });
      info.set(correct
        ? `there were ${flash.n} — right, in ${Math.round(rt)} ms  ·  trial ${flash.trials}`
        : `there were ${flash.n} — you said ${k}  ·  trial ${flash.trials}`);
      if (flash.trials >= 12 && !flash.summaryShown) flashSummary();
      flashGoto('feedback', lastT);
    }
    function flashSummary() {
      flash.summaryShown = true;
      let lt = 0, lc = 0, lr = 0, lrn = 0, ht = 0, hc = 0, hr = 0, hrn = 0;
      for (let n = 1; n <= 9; n++) {
        const s = flash.stats[n];
        if (!s) continue;
        if (n <= 4) { lt += s.tries; lc += s.correct; lr += s.rtSum; lrn += s.rtN; }
        else { ht += s.tries; hc += s.correct; hr += s.rtSum; hrn += s.rtN; }
      }
      const pct = (c, t) => t ? `${Math.round((c / t) * 100)}%` : '—';
      const ms = (r, n) => n ? `${Math.round(r / n)} ms` : '—';
      setQuest(`Up to four: ${pct(lc, lt)} right, ${ms(lr, lrn)}. From five: ${pct(hc, ht)}, ` +
        `${ms(hr, hrn)}. The notches begin where your perception ends.`, true);
    }

    function drawFlash(ctx, W, H, t) {
      if (flash.running) {
        const el = t - flash.tEnter;
        if (flash.state === 'fixate' && el > 0.55) flashGoto('show', t);
        else if (flash.state === 'show' && el > 0.25) flashGoto('mask', t);
        else if (flash.state === 'feedback' && el > 1.05) nextTrial(t);
      }
      const R = dotRegion();
      // field
      ctx.fillStyle = 'rgba(22,25,37,0.4)';
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(R.x, R.y, R.w, R.h, 8);
      else ctx.rect(R.x, R.y, R.w, R.h);
      ctx.fill(); ctx.stroke();

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      if (flash.state === 'idle') {
        ctx.fillStyle = P.inkFaint;
        ctx.font = '13px ui-monospace, Menlo, monospace';
        ctx.fillText('dots flash for a quarter of a second — press ▶', cx, cy);
      } else if (flash.state === 'fixate') {
        ctx.strokeStyle = P.goldDim; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy);
        ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 7);
        ctx.stroke();
      } else if (flash.state === 'show') {
        for (const d of flash.dots) {
          dotGlow.draw(ctx, R.x + d.x, R.y + 13 + d.y, 1.5);
          ctx.fillStyle = P.goldBright;
          ctx.beginPath(); ctx.arc(R.x + d.x, R.y + 13 + d.y, 7.5, 0, TAU); ctx.fill();
        }
      } else if (flash.state === 'mask') {
        ctx.fillStyle = P.gold;
        ctx.font = '30px ui-monospace, Menlo, monospace';
        ctx.fillText('?', cx, cy - 8);
        ctx.fillStyle = P.inkFaint;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.fillText('how many? (buttons below, or keys 1–9)', cx, cy + 22);
      } else if (flash.state === 'feedback') {
        for (const d of flash.dots) {
          ctx.fillStyle = P.ink;
          ctx.beginPath(); ctx.arc(R.x + d.x, R.y + 13 + d.y, 6.5, 0, TAU); ctx.fill();
          ctx.strokeStyle = flash.lastCorrect ? P.verdant : P.crimson;
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(R.x + d.x, R.y + 13 + d.y, 10.5, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = flash.lastCorrect ? P.verdant : P.crimson;
        ctx.font = '20px ui-monospace, Menlo, monospace';
        ctx.fillText(String(flash.n), cx, R.y + R.h - 18);
      }
      // charts
      const chY = DOT_TOP + DOT_H + 20;
      drawFlashCharts(ctx, W, chY, H - chY - 8);
    }

    function drawFlashCharts(ctx, W, y, h) {
      if (h < 60) return;
      const series = statsSeries(flash.stats, 1, 9);
      const any = series.acc.some((v) => v !== null);
      const pw = Math.min((W - 60) / 2, 300);
      const x1 = W / 2 - pw - 12, x2 = W / 2 + 12;
      panel(x1, 'accuracy', P.gold);
      panel(x2, 'response time', P.azure);
      if (!any) {
        ctx.fillStyle = P.inkFaint;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('your results will appear here', W / 2, y + h / 2);
        return;
      }
      barsPanel(x1);
      rtPanel(x2);

      function panel(x, title, color) {
        ctx.fillStyle = 'rgba(22,25,37,0.3)';
        ctx.strokeStyle = P.line; ctx.lineWidth = 1;
        ctx.fillRect(x, y, pw, h); ctx.strokeRect(x + 0.5, y + 0.5, pw, h);
        ctx.fillStyle = color;
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(title, x + 6, y + 13);
        // the cliff, between 4 and 5
        const cliffX = x + 8 + ((pw - 16) * 4) / 9;
        ctx.strokeStyle = 'rgba(192,91,77,0.55)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(cliffX, y + 18); ctx.lineTo(cliffX, y + h - 16); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(192,91,77,0.8)';
        ctx.fillText('cliff', cliffX + 3, y + 25);
      }
      function xAt(x, n) { return x + 8 + ((pw - 16) * (n - 0.5)) / 9; }
      function nLabels(x) {
        ctx.fillStyle = P.inkFaint;
        ctx.font = '9px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        for (let n = 1; n <= 9; n++) ctx.fillText(String(n), xAt(x, n), y + h - 4);
      }
      function barsPanel(x) {
        const base = y + h - 15, top = y + 22;
        const bw = ((pw - 16) / 9) * 0.5;
        for (let n = 1; n <= 9; n++) {
          const a = series.acc[n - 1];
          if (a === null) continue;
          const bh = Math.max(1.5, a * (base - top));
          ctx.fillStyle = a >= 0.999 ? P.gold : a >= 0.5 ? P.goldDim : P.crimson;
          ctx.fillRect(xAt(x, n) - bw / 2, base - bh, bw, bh);
        }
        nLabels(x);
      }
      function rtPanel(x) {
        const base = y + h - 15, top = y + 22;
        let maxRt = 900;
        for (const v of series.rt) if (v !== null && v > maxRt) maxRt = v;
        const yAt = (v) => base - (v / maxRt) * (base - top);
        ctx.strokeStyle = P.azure; ctx.lineWidth = 1.5;
        ctx.beginPath();
        let pen = false;
        for (let n = 1; n <= 9; n++) {
          const v = series.rt[n - 1];
          if (v === null) { pen = false; continue; }
          if (pen) ctx.lineTo(xAt(x, n), yAt(v)); else ctx.moveTo(xAt(x, n), yAt(v));
          pen = true;
        }
        ctx.stroke();
        ctx.fillStyle = P.azure;
        for (let n = 1; n <= 9; n++) {
          const v = series.rt[n - 1];
          if (v === null) continue;
          ctx.beginPath(); ctx.arc(xAt(x, n), yAt(v), 2.5, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = P.inkFaint;
        ctx.font = '9px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(maxRt)} ms`, x + pw - 5, y + 25);
        nLabels(x);
      }
    }

    function onKey(e) {
      if (phase !== 'flash' || !flash.running || flash.state !== 'mask') return;
      const k = parseInt(e.key, 10);
      if (k >= 1 && k <= 9) answer(k);
    }
    document.addEventListener('keydown', onKey);

    /* ================= beat II — the pouch ================= */

    const pouch = {
      mode: 'idle',            // idle | dawn | day | dusk | night | resolved
      sheep: [], pebbles: 0, queue: [], active: -1, awaiting: false,
      nextAt: 0, dayUntil: 0, leftover: 0, finished: false,
    };
    // pebble heap positions (golden-spiral scatter, deterministic)
    const PEBBLE_SPOTS = [];
    for (let i = 0; i < 30; i++) {
      const a = i * 2.39996, r = 2.5 + 2.3 * Math.sqrt(i);
      PEBBLE_SPOTS.push({ dx: Math.cos(a) * r * 1.7, dy: -Math.abs(Math.sin(a) * r) * 0.85 - 3 });
    }

    function geo() {
      const W = handle.width, H = handle.height;
      return {
        W, H,
        groundY: H * 0.7,
        gateX: W * 0.3,
        pouchX: W * 0.3 + 74,
        pouchY: H - 52,
      };
    }
    function makeSheep(x, dy) {
      const lobes = [];
      for (let i = 0; i < 6; i++) {
        lobes.push({
          x: -9 + rng() * 18,
          y: -6 + rng() * 8,
          r: 5.5 + rng() * 2.5,
        });
      }
      lobes.push({ x: 0, y: -2, r: 8.5 }); // core mass
      return {
        x, dy, y: 0, dir: 1, walk: rng() * 9, moving: false, lobes,
        state: 'pen', tx: null, speed: 62 + rng() * 26,
        stray: false, delay: 0, nextWander: 0,
      };
    }
    function buildFlock() {
      const G = geo();
      const count = 12 + Math.floor(rng() * 6);          // 12–17: beyond subitizing
      const w = [0.35, 0.65, 0.85, 1];                    // 0–3 strays, weighted
      const roll = rng();
      let strayCount = w.findIndex((p) => roll < p);
      if (strayCount < 0) strayCount = 0;
      strayCount = Math.min(strayCount, count - 1);
      pouch.sheep = [];
      for (let i = 0; i < count; i++) {
        pouch.sheep.push(makeSheep(30 + rng() * (G.gateX - 76), -8 + rng() * 26));
      }
      // strays picked later, at day; store the intended count
      pouch.strayCount = strayCount;
      pouch.pebbles = 0; pouch.queue = []; pouch.active = -1;
      pouch.awaiting = false; pouch.finished = false; pouch.mode = 'idle';
    }
    buildFlock();

    const pouchRow = ui.controlRow(subPouch);
    const dawnBtn = ui.button(pouchRow, '☀ open the pen', () => {
      audio.ensureAudio();
      if (pouch.mode !== 'idle') return;
      pouch.mode = 'dawn';
      pouch.queue = shuffledIdx();
      pouch.nextAt = lastT + 0.6;
      dawnBtn.classList.add('tally-hidden');
      setQuest('The pen opens. Tap the pouch to drop a pebble as each sheep reaches the gate — one pebble, one animal.');
    }, { primary: true });
    const wholeBtn = ui.button(pouchRow, 'the flock is whole', () => verdict(true));
    const missingBtn = ui.button(pouchRow, 'some are missing', () => verdict(false));
    const againBtn = ui.button(pouchRow, '↺ drive them out again', () => {
      buildFlock();
      dawnBtn.classList.remove('tally-hidden');
      againBtn.classList.add('tally-hidden');
      setQuest(QUEST_DEFAULTS.pouch);
      info.set(INFO_DEFAULTS.pouch);
    }, { small: true });
    wholeBtn.classList.add('tally-hidden');
    missingBtn.classList.add('tally-hidden');
    againBtn.classList.add('tally-hidden');

    function shuffledIdx(filter = () => true) {
      const idx = pouch.sheep.map((_, i) => i).filter((i) => filter(pouch.sheep[i]));
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      return idx;
    }
    function grazeSpot(G) { return { x: G.gateX + 78 + rng() * (G.W - G.gateX - 150), dy: -8 + rng() * 26 }; }
    function penSpot(G) { return { x: 30 + rng() * (G.gateX - 76), dy: -8 + rng() * 26 }; }

    function pebbleTick(add) {
      const now = bus.context.currentTime;
      audio.drums.wood(bus, now, { pitch: add ? 700 + rng() * 130 : 520 + rng() * 90, level: 0.4 });
    }

    function pouchTap(t) {
      if (!pouch.awaiting || pouch.active < 0) {
        if (pouch.mode === 'dawn' || pouch.mode === 'dusk') info.set('one pebble, one sheep — wait for the next animal at the gate.');
        return;
      }
      const G = geo();
      const s = pouch.sheep[pouch.active];
      if (pouch.mode === 'dawn') {
        pouch.pebbles++;
        pebbleTick(true);
        const g = grazeSpot(G);
        s.state = 'leaving'; s.tx = g.x; s.dy = g.dy; s.dir = 1;
      } else if (pouch.mode === 'dusk') {
        pouch.pebbles = Math.max(0, pouch.pebbles - 1);
        pebbleTick(false);
        const p = penSpot(G);
        s.state = 'toPen'; s.tx = p.x; s.dy = p.dy; s.dir = -1;
      }
      pouch.awaiting = false;
      pouch.active = -1;
      pouch.nextAt = t + 0.45;
    }

    function beginDay(t) {
      pouch.mode = 'day';
      pouch.dayUntil = t + 2.6;
      // choose strays among grazers
      const grazers = shuffledIdx((s) => s.state === 'graze');
      for (let i = 0; i < Math.min(pouch.strayCount, grazers.length); i++) {
        const s = pouch.sheep[grazers[i]];
        s.stray = true;
        s.delay = t + 0.4 + i * 0.7;
      }
      setQuest('Midday. The flock grazes; the pouch holds its pebbles. Watch the hill.');
    }
    function startDusk(t) {
      pouch.mode = 'dusk';
      pouch.queue = shuffledIdx((s) => !s.stray);
      pouch.nextAt = t + 0.8;
      setQuest('Dusk. Take a pebble out of the pouch for every sheep that comes home.');
    }
    function nightFall() {
      pouch.mode = 'night';
      pouch.leftover = pouch.pebbles;
      wholeBtn.classList.remove('tally-hidden');
      missingBtn.classList.remove('tally-hidden');
      setQuest('Night. The pen is barred. Without counting anything — is the flock whole? Ask the pouch.');
      info.set('pebbles left in the pouch mean sheep left on the hill.');
    }
    function verdict(saysWhole) {
      if (pouch.mode !== 'night') return;
      audio.ensureAudio();
      const whole = pouch.leftover === 0;
      const right = saysWhole === whole;
      wholeBtn.classList.add('tally-hidden');
      missingBtn.classList.add('tally-hidden');
      const word = ['no', 'one', 'two', 'three', 'four'][Math.min(pouch.leftover, 4)];
      if (whole) {
        setQuest(right
          ? 'Whole — and the empty pouch already knew. You never counted, and never needed to.'
          : 'Look again: the pouch is empty. Every pebble found its sheep — the flock is whole.', true);
        pouch.mode = 'resolved';
        againBtn.classList.remove('tally-hidden');
        pouch.finished = true;
      } else {
        setQuest((right ? 'The pouch agrees: ' : 'The pouch disagrees: ') +
          `${word} pebble${pouch.leftover > 1 ? 's' : ''} with no sheep — ${word} animal${pouch.leftover > 1 ? 's' : ''} still out. ` +
          'Someone should climb the hill…', right);
        pouch.mode = 'resolved';
        let i = 0;
        for (const s of pouch.sheep) {
          if (s.stray && s.state === 'gone') { s.delay = lastT + 0.9 + i * 0.9; i++; }
        }
      }
    }

    function updatePouch(dt, t) {
      const G = geo();
      // movement
      for (const s of pouch.sheep) {
        s.y = G.groundY + s.dy;
        if (s.tx !== null) {
          const dx = s.tx - s.x;
          const step = s.speed * dt;
          s.moving = true;
          s.dir = dx < 0 ? -1 : 1;
          if (Math.abs(dx) <= step) { s.x = s.tx; s.tx = null; s.moving = false; sheepArrived(s, t, G); }
          else { s.x += Math.sign(dx) * step; s.walk += dt * s.speed / 11; }
        } else s.moving = false;
        // idle wander while grazing
        if (s.state === 'graze' && !s.moving && (pouch.mode === 'day' || pouch.mode === 'dawn') && t > s.nextWander) {
          s.nextWander = t + 3 + rng() * 6;
          if (rng() < 0.6) s.tx = clamp(s.x + (rng() - 0.5) * 90, G.gateX + 70, G.W - 46);
        }
        // strays depart during the day
        if (s.stray && s.state === 'graze' && pouch.mode === 'day' && t > s.delay && s.delay > 0) {
          s.state = 'strayOut'; s.tx = G.W + 70; s.delay = 0;
        }
        // strays come home after the verdict
        if (s.stray && s.state === 'gone' && pouch.mode === 'resolved' && s.delay > 0 && t > s.delay) {
          s.delay = 0; s.x = G.W + 60; s.state = 'strayHome'; s.tx = G.gateX + 16; s.dir = -1;
        }
      }
      // gate dispatch
      if (pouch.mode === 'dawn' || pouch.mode === 'dusk') {
        if (!pouch.awaiting && pouch.active === -1 && t >= pouch.nextAt) {
          if (pouch.queue.length) {
            pouch.active = pouch.queue.shift();
            const s = pouch.sheep[pouch.active];
            if (pouch.mode === 'dawn') { s.state = 'toGate'; s.tx = G.gateX - 16; }
            else { s.state = 'toGateHome'; s.tx = G.gateX + 16; }
          } else if (pouch.mode === 'dawn') beginDay(t);
          else nightFall();
        }
      } else if (pouch.mode === 'day') {
        const straysGone = pouch.sheep.every((s) => !s.stray || s.state === 'gone');
        if (t >= pouch.dayUntil && straysGone) startDusk(t);
      } else if (pouch.mode === 'resolved' && !pouch.finished) {
        const allHome = pouch.sheep.every((s) => s.state === 'pen' || s.state === 'penned');
        if (allHome && pouch.pebbles === 0) {
          pouch.finished = true;
          setQuest('Found on the hill, walked home, pebbles retired. The ledger balances — and still nobody counted.', true);
          againBtn.classList.remove('tally-hidden');
        }
      }
    }
    function sheepArrived(s, t, G) {
      switch (s.state) {
        case 'toGate':
          s.state = 'waitGate'; pouch.awaiting = true;
          break;
        case 'leaving':
          s.state = 'graze'; s.nextWander = t + 2 + rng() * 5;
          break;
        case 'strayOut':
          s.state = 'gone';
          break;
        case 'toGateHome':
          s.state = 'waitHome'; pouch.awaiting = true;
          break;
        case 'strayHome': {
          pouch.pebbles = Math.max(0, pouch.pebbles - 1);
          pebbleTick(false);
          const p = penSpot(G);
          s.state = 'toPen'; s.tx = p.x; s.dy = p.dy;
          break;
        }
        case 'toPen':
          s.state = 'penned';
          break;
      }
    }

    function drawPouchScene(ctx, W, H, t) {
      ctx.textBaseline = 'alphabetic';
      const G = geo();
      // sky tint by time of day
      const tint = { idle: null, dawn: 'rgba(201,169,89,0.05)', day: null,
        dusk: 'rgba(192,91,77,0.06)', night: 'rgba(74,106,148,0.10)', resolved: 'rgba(74,106,148,0.10)' }[pouch.mode];
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, W, G.groundY); }
      // sun / moon
      if (pouch.mode === 'dawn') orb(W * 0.14, 74, P.gold);
      else if (pouch.mode === 'day') orb(W * 0.5, 46, P.goldBright);
      else if (pouch.mode === 'dusk') orb(W * 0.82, 84, P.crimson);
      else if (pouch.mode === 'night' || pouch.mode === 'resolved') {
        orb(W * 0.85, 56, P.azure);
        ctx.fillStyle = P.bg;
        ctx.beginPath(); ctx.arc(W * 0.85 + 6, 52, 12, 0, TAU); ctx.fill();
      }
      function orb(x, y, c) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // the hill (strays go over it)
      ctx.fillStyle = 'rgba(22,25,37,0.55)';
      ctx.beginPath();
      ctx.moveTo(W * 0.6, G.groundY);
      ctx.quadraticCurveTo(W * 0.8, G.groundY - 74, W, G.groundY - 12);
      ctx.lineTo(W, G.groundY);
      ctx.closePath();
      ctx.fill();
      // ground
      ctx.fillStyle = 'rgba(22,25,37,0.35)';
      ctx.fillRect(0, G.groundY, W, H - G.groundY);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, G.groundY); ctx.lineTo(W, G.groundY); ctx.stroke();
      // fence & gate
      const gateGlow = pouch.awaiting;
      ctx.strokeStyle = P.inkFaint; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 16; x <= G.gateX - 40; x += 26) { ctx.moveTo(x, G.groundY + 2); ctx.lineTo(x, G.groundY - 30); }
      ctx.moveTo(12, G.groundY - 10); ctx.lineTo(G.gateX - 38, G.groundY - 10);
      ctx.moveTo(12, G.groundY - 24); ctx.lineTo(G.gateX - 38, G.groundY - 24);
      ctx.stroke();
      ctx.strokeStyle = gateGlow ? P.gold : P.inkFaint;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(G.gateX - 36, G.groundY + 2); ctx.lineTo(G.gateX - 36, G.groundY - 34);
      ctx.moveTo(G.gateX + 2, G.groundY + 2); ctx.lineTo(G.gateX + 2, G.groundY - 34);
      ctx.stroke();
      // sheep, painter's order
      const order = [...pouch.sheep].sort((a, b) => a.dy - b.dy);
      for (const s of order) {
        if (s.x > W + 40 || s.state === 'gone') continue;
        drawSheep(ctx, s, t, 1 + s.dy * 0.006);
      }
      // pouch
      drawPouchBag(ctx, G, t);
    }
    function drawPouchBag(ctx, G, t) {
      const x = G.pouchX, y = G.pouchY;
      const hot = pouch.awaiting;
      const leftoverGlow = (pouch.mode === 'night' || pouch.mode === 'resolved') && pouch.pebbles > 0;
      if (hot) {
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 5);
        ctx.strokeStyle = P.gold; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 4, 46, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = P.panel;
      ctx.strokeStyle = hot ? P.gold : leftoverGlow ? P.crimson : P.goldDim;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 30, 21, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y - 15, 15, 5.5, 0, 0, TAU); ctx.stroke();
      // pebbles heaped in the mouth
      const n = Math.min(pouch.pebbles, PEBBLE_SPOTS.length);
      for (let i = 0; i < n; i++) {
        const p = PEBBLE_SPOTS[i];
        ctx.fillStyle = leftoverGlow ? P.crimson : P.inkDim;
        ctx.strokeStyle = P.bg;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x + p.dx, y - 15 + p.dy, 4.4, 3.4, p.dx * 0.05, 0, TAU);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = P.inkFaint;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('the pouch', x, y + 36);
    }

    /* ================= beat III — the carving ================= */

    const RING_SLOTS = [[-14, -5], [-5, -5], [4, -5], [13, -5], [0, 10]];
    const carve = {
      stage: 'group', pebbles: [], rings: [], drag: -1, dragOff: [0, 0],
      boneT0: 0, hover: null, rects: [], lastTickG: -1, lastTickL: -1, total: 0,
      allPlaced: false,
    };
    const carveRow = ui.controlRow(subCarve);
    const carveBtn = ui.button(carveRow, '⚒ carve it into bone', () => {
      if (!carve.allPlaced || carve.stage !== 'group') return;
      audio.ensureAudio();
      carve.stage = 'bone';
      carve.boneT0 = lastT;
      carve.lastTickG = -1; carve.lastTickL = -1;
      carveBtn.classList.add('tally-hidden');
      setQuest('Pebbles spill; notches keep. Watch two real bones take shape.');
      info.set('hover the notch groups once the carving settles.');
    }, { primary: true });
    const recarveBtn = ui.button(carveRow, '↺ back to pebbles', () => { buildCarve(); }, { small: true });
    carveBtn.classList.add('tally-hidden');

    function buildCarve() {
      const W = handle.width;
      carve.stage = 'group';
      carve.drag = -1; carve.hover = null; carve.rects = [];
      carve.allPlaced = false;
      carveBtn.classList.add('tally-hidden');
      const played = pouch.sheep.length && pouch.mode !== 'idle';
      carve.total = played ? pouch.sheep.length : 17;
      const region = { w: Math.max(240, W - 100), h: 168 };
      const dots = genDots(carve.total, region.w, region.h, 11, rng);
      carve.pebbles = dots.map((d) => ({ x: 50 + d.x, y: 34 + d.y, ring: null, slot: -1 }));
      const k = Math.ceil(carve.total / 5);
      carve.rings = [];
      const spacing = Math.min(120, (W - 150) / Math.max(1, k - 1) || 0);
      const x0 = W / 2 - (spacing * (k - 1)) / 2;
      for (let i = 0; i < k; i++) {
        const cap = i === k - 1 ? carve.total - 5 * (k - 1) : 5;
        carve.rings.push({ x: x0 + i * spacing, y: handle.height - 92, cap, members: [], sealed: false, sealT: 0 });
      }
      questSaved.carve = null;
      if (phase === 'carve') { applyQuest(); info.set(INFO_DEFAULTS.carve); }
    }

    function carveDropCheck() {
      carve.allPlaced = carve.pebbles.every((p) => p.ring !== null);
      if (carve.allPlaced) {
        carveBtn.classList.remove('tally-hidden');
        setQuest('Every pebble has its place in a handful — five-at-a-glance, readable again. Carve it for keeps.');
      }
    }

    function drawCarve(ctx, W, H, t) {
      ctx.textBaseline = 'alphabetic';
      if (carve.stage === 'group') {
        ctx.fillStyle = P.inkFaint;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('a season of sheep, poured out of the pouch', W / 2, 20);
        // rings
        for (const r of carve.rings) {
          const sealAge = r.sealed ? (t - r.sealT) * 2 : 0;
          if (!r.sealed || sealAge < 1) {
            ctx.globalAlpha = r.sealed ? Math.max(0, 1 - sealAge) : 1;
            ctx.strokeStyle = r.members.length ? P.goldDim : P.inkFaint;
            ctx.setLineDash([4, 5]);
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(r.x, r.y, 34, 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
          if (r.sealed) {
            const a = Math.min(1, sealAge);
            ctx.globalAlpha = a;
            ctx.strokeStyle = P.goldBright;
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            const width = r.cap >= 5 ? 3 * 9 : Math.max(0, (r.cap - 1)) * 9;
            drawTallyRun(ctx, r.x - width / 2, r.y - 15, r.cap, { pitch: 9, h: 30 });
            ctx.globalAlpha = 1;
          }
        }
        // pebbles
        for (let i = 0; i < carve.pebbles.length; i++) {
          const p = carve.pebbles[i];
          if (p.ring !== null && carve.rings[p.ring].sealed) {
            const a = Math.max(0, 1 - (t - carve.rings[p.ring].sealT) * 2);
            if (a <= 0) continue;
            ctx.globalAlpha = a;
          }
          ctx.fillStyle = P.inkDim;
          ctx.strokeStyle = i === carve.drag ? P.gold : P.bg;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, 11, 9, 0, 0, TAU);
          ctx.fill(); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else drawBones(ctx, W, H, t);
    }

    const LEB_STEP = 0.05, ISH_START = 2.1, ISH_STEP = 0.35;
    const ISH_ROWS = [ISHANGO.left, ISHANGO.middle, ISHANGO.right];
    const ROW_NAMES = ['left column', 'middle column', 'right column'];
    const ROW_SUMS = [60, 48, 60];

    function drawBones(ctx, W, H, t) {
      const el = t - carve.boneT0;
      carve.rects = [];
      // Lebombo
      const lebLen = Math.min(330, W - 90), lebY = 88;
      drawBoneOutline(ctx, W / 2, lebY, lebLen, 30, true);
      const visL = clamp(Math.floor(el / LEB_STEP), 0, LEBOMBO_NOTCHES);
      const lebPitch = (lebLen - 90) / LEBOMBO_NOTCHES;
      ctx.strokeStyle = 'rgba(10,11,16,0.75)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < visL; i++) {
        const x = W / 2 - lebLen / 2 + 40 + i * lebPitch;
        ctx.moveTo(x, lebY - 6); ctx.lineTo(x, lebY + 6);
      }
      ctx.stroke();
      const tickL = Math.floor(visL / 6);
      if (tickL > carve.lastTickL && visL < LEBOMBO_NOTCHES) {
        carve.lastTickL = tickL;
        audio.drums.thock(bus, bus.context.currentTime, { level: 0.35 });
      }
      ctx.fillStyle = P.inkFaint;
      ctx.font = '10.5px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      if (visL >= LEBOMBO_NOTCHES) {
        ctx.fillText('Lebombo bone · baboon fibula · ~43,000 years — 29 notches, then the break', W / 2, lebY + 34);
      }
      // Ishango
      const ishLen = Math.min(440, W - 60), ishY = 262, girth = 84;
      const gEl = el - ISH_START;
      if (gEl > 0) {
        drawBoneOutline(ctx, W / 2, ishY, ishLen, girth, false);
        const gIdx = Math.floor(gEl / ISH_STEP);
        if (gIdx > carve.lastTickG && gIdx < 16) {
          carve.lastTickG = gIdx;
          audio.drums.thock(bus, bus.context.currentTime, { level: 0.4 });
        }
        const usable = ishLen - 84;
        let flat = 0;
        for (let row = 0; row < 3; row++) {
          const groupsArr = ISH_ROWS[row];
          const totalNotches = ROW_SUMS[row];
          const gapPx = 13;
          const pitch = (usable - gapPx * (groupsArr.length - 1)) / totalNotches;
          const rowY = ishY + (row - 1) * 24;
          let x = W / 2 - usable / 2;
          ctx.strokeStyle = 'rgba(10,11,16,0.78)';
          ctx.lineWidth = 1.5;
          for (let gi = 0; gi < groupsArr.length; gi++, flat++) {
            const count = groupsArr[gi];
            const gw = pitch * count;
            let visible = 0;
            if (flat < gIdx) visible = count;
            else if (flat === gIdx) visible = clamp(Math.floor(((gEl % ISH_STEP) / ISH_STEP) * (count + 1)), 0, count);
            const hovered = carve.hover && carve.hover.row === row && carve.hover.gi === gi;
            const partner = carve.hover && carve.hover.row === 1 && row === 1 && carve.hover.gi < 6 &&
              (carve.hover.gi ^ 1) === gi;
            if (visible > 0) {
              ctx.beginPath();
              for (let i = 0; i < visible; i++) {
                const nx = x + i * pitch + pitch / 2;
                ctx.moveTo(nx, rowY - 7); ctx.lineTo(nx, rowY + 7);
              }
              ctx.stroke();
            }
            if (hovered || partner) {
              ctx.strokeStyle = hovered ? P.gold : P.azure;
              ctx.lineWidth = 1.4;
              ctx.strokeRect(x - 2, rowY - 11, gw + 4, 22);
              ctx.strokeStyle = 'rgba(10,11,16,0.78)';
              ctx.lineWidth = 1.5;
            }
            carve.rects.push({ x: x - 3, y: rowY - 12, w: gw + 6, h: 24, row, gi, count });
            x += gw + gapPx;
          }
          if (gIdx >= 16) {
            ctx.fillStyle = P.gold;
            ctx.font = '11px ui-monospace, Menlo, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`= ${ROW_SUMS[row]}`, W / 2 + usable / 2 + 10, rowY + 4);
          }
        }
        if (gIdx >= 16) {
          ctx.fillStyle = P.inkFaint;
          ctx.font = '10.5px ui-monospace, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('Ishango bone · Lake Edward · ~20,000 years — three columns of grouped notches', W / 2, ishY + girth / 2 + 26);
          if (!questSaved.carve || !questSaved.carve.done) {
            setQuest('Sixty, forty-eight, sixty — and in the middle row a 3 beside a 6, a 4 beside an 8. ' +
              'Someone, twenty thousand years ago, was doubling.', true);
          }
        }
      }
    }

    function boneHoverText(r) {
      const col = ROW_NAMES[r.row];
      let extra = `the column sums to ${ROW_SUMS[r.row]}`;
      if (r.row === 1) {
        const g = r.gi;
        if (g === 0) extra = 'and its neighbour is 6 — its double';
        else if (g === 1) extra = 'twice the 3 beside it';
        else if (g === 2) extra = 'and its neighbour is 8 — its double';
        else if (g === 3) extra = 'twice the 4 beside it';
        else if (g === 4) extra = 'followed by 5 — its half; the bone keeps its reasons';
        else if (g === 5) extra = 'half of the 10 beside it — or one clean handful';
        else extra = 'the column sums to 48';
      }
      return `${col}: a group of ${r.count} notches — ${extra}.`;
    }

    /* ================= beat IV — compression ================= */

    const comp = { n: 7000, doneShown: false };
    const LOG_MAX = Math.log(7000000);
    const nFromSlider = (v) => Math.max(1, Math.round(Math.exp(v * LOG_MAX)));
    const compRow = ui.controlRow(subCompress);
    const compSlider = ui.slider(compRow, {
      label: 'the flock',
      min: 0, max: 1, step: 0.001,
      value: Math.log(comp.n) / LOG_MAX,
      format: (v) => `${math.formatBig(nFromSlider(v))} sheep`,
      onInput: (v) => {
        comp.n = nFromSlider(v);
        if (comp.n >= 7000000 && !comp.doneShown) {
          comp.doneShown = true;
          setQuest('The tally left the room kilometres ago. The numeral, four characters when this slider ' +
            'started, now spends seven. Exhibit 3 hands that trick to Babylon.', true);
        }
      },
    });
    comp.n = nFromSlider(compSlider.value);   // sync with the browser's snapped slider value

    function fmtLen(marks) {
      const mm = marks * 4;               // one notch ≈ 4 mm of bone
      if (mm >= 1e6) { const km = mm / 1e6; return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`; }
      if (mm >= 1000) { const m = mm / 1000; return `${m >= 10 ? Math.round(m) : m.toFixed(1)} m`; }
      return `${Math.round(mm / 10)} cm`;
    }

    function drawCompress(ctx, W, H) {
      const n = comp.n;
      const c = compressionCounts(n);
      const maxX = W - 150;
      const rows = [
        { y: 44, label: 'tally — one mark per sheep', count: `${math.formatBig(c.tally)} marks` },
        { y: 158, label: 'grouped in fives — read by the handful', count: `${math.formatBig(c.grouped)} symbols` },
        { y: 272, label: 'positional numeral — one symbol per power of ten', count: `${c.digits} digit${c.digits > 1 ? 's' : ''}` },
      ];
      ctx.textBaseline = 'alphabetic';
      for (const r of rows) {
        ctx.fillStyle = P.inkDim;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(r.label, 18, r.y);
        ctx.fillStyle = P.gold;
        ctx.textAlign = 'right';
        ctx.fillText(r.count, W - 16, r.y);
      }
      ctx.lineCap = 'butt';
      // row 1: raw tally
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
      const r1 = drawStrokeRun(ctx, 20, rows[0].y + 12, n, { pitch: 5, h: 26, maxX });
      if (r1.overflow) {
        overflowFade(rows[0].y + 6, 40);
        ctx.fillStyle = P.inkFaint;
        ctx.font = '10.5px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`…${math.formatBig(n - r1.drawn)} more — a rod of notches ${fmtLen(n)} long, at 4 mm a notch`,
          20, rows[0].y + 56);
      }
      // row 2: grouped
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
      const r2 = drawTallyRun(ctx, 20, rows[1].y + 12, n, { pitch: 6, gap: 9, h: 24, maxX });
      if (r2.overflow) {
        overflowFade(rows[1].y + 6, 38);
        ctx.fillStyle = P.inkFaint;
        ctx.font = '10.5px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`…${math.formatBig(c.grouped - r2.symbols)} more handfuls — five times fewer symbols, still a hillside`,
          20, rows[1].y + 54);
      }
      // row 3: the numeral
      ctx.fillStyle = P.goldBright;
      ctx.font = '42px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(math.formatBig(n), 20, rows[2].y + 52);
      if (c.digits >= 7) {
        ctx.fillStyle = P.goldDim;
        ctx.font = 'italic 12px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('seven characters hold what no hillside of bones could.', W / 2, H - 26);
      }
      function overflowFade(y, h) {
        const g = ctx.createLinearGradient(maxX - 70, 0, maxX + 4, 0);
        g.addColorStop(0, 'rgba(10,11,16,0)');
        g.addColorStop(1, P.bg);
        ctx.fillStyle = g;
        ctx.fillRect(maxX - 70, y, 78, h);
        ctx.fillStyle = P.inkFaint;
        ctx.font = '13px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('⋯', maxX + 6, y + h / 2 + 4);
      }
    }

    /* ---------- pointer handling ---------- */

    function onDown(e) {
      const [px, py] = cv.pointerPos(handle, e);
      if (phase === 'pouch') {
        audio.ensureAudio();
        const G = geo();
        const dx = (px - G.pouchX) / 62, dy = (py - (G.pouchY - 4)) / 52;
        if (dx * dx + dy * dy <= 1) pouchTap(lastT);
        else if (pouch.awaiting) info.set('tap the pouch itself — one pebble, one sheep.');
      } else if (phase === 'carve' && carve.stage === 'group') {
        for (let i = carve.pebbles.length - 1; i >= 0; i--) {
          const p = carve.pebbles[i];
          if (p.ring !== null && carve.rings[p.ring].sealed) continue;
          if ((px - p.x) ** 2 + (py - p.y) ** 2 <= 15 * 15) {
            if (p.ring !== null) {
              const r = carve.rings[p.ring];
              r.members = r.members.filter((m) => m !== i);
              p.ring = null;
              p.slot = -1;
              carve.allPlaced = false;
              carveBtn.classList.add('tally-hidden');
            }
            carve.drag = i;
            carve.dragOff = [p.x - px, p.y - py];
            try { handle.canvas.setPointerCapture(e.pointerId); } catch {}
            break;
          }
        }
      }
    }
    function onMove(e) {
      const [px, py] = cv.pointerPos(handle, e);
      let cursor = 'default';
      if (phase === 'pouch' && pouch.awaiting) {
        const G = geo();
        const dx = (px - G.pouchX) / 62, dy = (py - (G.pouchY - 4)) / 52;
        if (dx * dx + dy * dy <= 1.6) cursor = 'pointer';
      } else if (phase === 'carve' && carve.stage === 'group') {
        if (carve.drag >= 0) {
          const p = carve.pebbles[carve.drag];
          p.x = clamp(px + carve.dragOff[0], 12, handle.width - 12);
          p.y = clamp(py + carve.dragOff[1], 12, handle.height - 12);
          cursor = 'grabbing';
        } else if (carve.pebbles.some((p) =>
          !(p.ring !== null && carve.rings[p.ring].sealed) &&
          (px - p.x) ** 2 + (py - p.y) ** 2 <= 15 * 15)) cursor = 'grab';
      } else if (phase === 'carve' && carve.stage === 'bone') {
        const hit = carve.rects.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null;
        const changed = (hit && (!carve.hover || carve.hover.row !== hit.row || carve.hover.gi !== hit.gi)) ||
                        (!hit && carve.hover);
        if (changed) {
          carve.hover = hit;
          info.set(hit ? boneHoverText(hit) : INFO_DEFAULTS.carve);
        }
        if (hit) cursor = 'crosshair';
      }
      handle.canvas.style.cursor = cursor;
    }
    function onUp(e) {
      if (carve.drag >= 0) {
        const p = carve.pebbles[carve.drag];
        let target = -1;
        for (let ri = 0; ri < carve.rings.length; ri++) {
          const r = carve.rings[ri];
          if (r.sealed || r.members.length >= r.cap) continue;
          if ((p.x - r.x) ** 2 + (p.y - r.y) ** 2 < 48 * 48) { target = ri; break; }
        }
        if (target >= 0) {
          const r = carve.rings[target];
          r.members.push(carve.drag);
          p.ring = target;
          const used = new Set(r.members.filter((m) => m !== carve.drag).map((m) => carve.pebbles[m].slot));
          let si = 0;
          while (used.has(si) && si < RING_SLOTS.length - 1) si++;
          p.slot = si;
          const off = RING_SLOTS[si];
          p.x = r.x + off[0]; p.y = r.y + off[1];
          audio.ensureAudio();
          audio.drums.wood(bus, bus.context.currentTime, { pitch: 640 + r.members.length * 55, level: 0.4 });
          if (r.members.length === r.cap) {
            r.sealed = true; r.sealT = lastT;
            audio.drums.wood(bus, bus.context.currentTime + 0.09, { pitch: 440, level: 0.45 });
          }
          carveDropCheck();
        }
        carve.drag = -1;
      }
      try { handle.canvas.releasePointerCapture(e.pointerId); } catch {}
    }
    handle.canvas.addEventListener('pointerdown', onDown);
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('pointerup', onUp);
    handle.canvas.addEventListener('pointercancel', onUp);

    /* ---------- resize: keep scene proportions ---------- */
    let prevW = handle.width;
    handle.onResize((w) => {
      const f = w / prevW;
      if (!isFinite(f) || f <= 0 || f === 1) return;
      prevW = w;
      for (const s of pouch.sheep) { s.x *= f; if (s.tx !== null) s.tx *= f; }
      for (const p of carve.pebbles) p.x *= f;
      for (const r of carve.rings) r.x *= f;
    });

    /* ---------- main loop ---------- */
    function draw(dt, t) {
      lastT = t;
      const { ctx, width: W, height: H } = handle;
      ctx.clearRect(0, 0, W, H);
      if (phase === 'flash') drawFlash(ctx, W, H, t);
      else if (phase === 'pouch') { updatePouch(dt, t); drawPouchScene(ctx, W, H, t); }
      else if (phase === 'carve') drawCarve(ctx, W, H, t);
      else drawCompress(ctx, W, H);
    }
    const loop = cv.rafLoop(draw);
    loop.start();
    setPhase('flash');

    /* ---------- lifecycle ---------- */
    return {
      pause() {
        loop.stop();
        if (flash.running) stopFlash();
        bus.mute();
      },
      resume() {
        bus.unmute();
        loop.start();
      },
      destroy() {
        loop.stop();
        document.removeEventListener('keydown', onKey);
        handle.canvas.removeEventListener('pointerdown', onDown);
        handle.canvas.removeEventListener('pointermove', onMove);
        handle.canvas.removeEventListener('pointerup', onUp);
        handle.canvas.removeEventListener('pointercancel', onUp);
        bus.dispose();
        handle.destroy();
        style.remove();
      },
    };
  },
};

/* ================= test exports ================= */

export const _test = {
  mulberry32,
  genDots,
  makeDeck,
  compressionCounts,
  statsSeries,
  ISHANGO,
  LEBOMBO_NOTCHES,
};
