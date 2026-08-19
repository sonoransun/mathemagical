// I — The Diagonal
// Incommensurability: the side and diagonal of a square share no common
// measure. Pell near-misses on the lattice, the even/odd proof, reciprocal
// subtraction that never halts, and what an irrational ratio sounds like.

import { pellPairs, convergents, TAU, clamp, lerp, cents, formatBig } from '../../core/math.js';

/* ================= pure logic (node-testable) ================= */

// Exact p² − 2q² on BigInt — the meter that never reads zero.
export function meter2(p, q) {
  p = BigInt(p); q = BigInt(q);
  return p * p - 2n * q * q;
}

// Reciprocal subtraction (anthyphairesis) on whole numbers: subtract the
// shorter from the longer until the two agree. Returns every intermediate
// pair; halts at the common measure (the gcd).
export function anthyphairesis(a, b, cap = 256) {
  a = BigInt(a); b = BigInt(b);
  if (a <= 0n || b <= 0n) throw new Error('anthyphairesis wants positive lengths');
  const pairs = [[a, b]];
  let n = 0;
  while (a !== b && n < cap) {
    if (a > b) a -= b; else b -= a;
    pairs.push([a, b]);
    n++;
  }
  return { pairs, halted: a === b, gcd: a === b ? a : null };
}

// Continued fraction of a/b by Euclid's algorithm (exact, BigInt).
export function cfOfRatio(a, b) {
  a = BigInt(a); b = BigInt(b);
  const terms = [];
  while (b > 0n && terms.length < 64) {
    terms.push(Number(a / b));
    [a, b] = [b, a % b];
  }
  return terms;
}

// √2 = [1; 2, 2, 2, …] — first n terms.
export function sqrt2Terms(n) {
  const t = [];
  for (let i = 0; i < n; i++) t.push(i === 0 ? 1 : 2);
  return t;
}

// Numeric value of x + y·√2 (BigInt coefficients) without catastrophic
// cancellation: when the direct sum nearly cancels, use the conjugate:
// x + y√2 = (x² − 2y²) / (x − y√2).
export function sdValue(x, y) {
  x = BigInt(x); y = BigInt(y);
  if (y === 0n) return Number(x);
  const direct = Number(x) + Number(y) * Math.SQRT2;
  if (Math.abs(direct) >= 1) return direct;
  const num = x * x - 2n * y * y;                    // exact, stays tiny here
  const den = Number(x) - Number(y) * Math.SQRT2;    // no cancellation when direct is small
  return Number(num) / den;
}

// Human-readable x + y√2 (rod lengths are positive, so one of these forms).
export function fmtSD(x, y) {
  x = BigInt(x); y = BigInt(y);
  if (y === 0n) return x.toString();
  const ay = y < 0n ? -y : y;
  const rt = ay === 1n ? '√2' : `${ay}√2`;
  if (x === 0n) return y > 0n ? rt : `−${rt}`;
  if (y > 0n && x > 0n) return `${x} + ${rt}`;
  if (y > 0n) return `${rt} − ${-x}`;
  return `${x} − ${rt}`;
}

// Stern–Brocot mediant descent toward √2: start with 1/1 < √2 < 2/1, test the
// mediant with the exact whole-number meter, tighten the trap. Eudoxus' sorting
// move — no √2 required, only p² vs 2q². Returns n steps.
export function cutSteps(n) {
  let lo = [1n, 1n], hi = [2n, 1n];
  const steps = [];
  for (let i = 0; i < n; i++) {
    const m = [lo[0] + hi[0], lo[1] + hi[1]];
    const s = meter2(m[0], m[1]);
    const side = s < 0n ? 'less' : 'greater';   // s === 0n is impossible; proved upstairs
    if (s < 0n) lo = m; else hi = m;
    steps.push({ p: m[0], q: m[1], side, lo, hi });
  }
  return steps;
}

const PELL = pellPairs(40);                       // [p, q] BigInt pairs
const PELLN = PELL.map(([p, q]) => [Number(q), Number(p)]); // world [x=q, y=p]

/* ================= the exhibit ================= */

export default {
  id: 'diagonal',
  movement: 1,
  title: 'The Diagonal',
  hook: 'Hunt for the fraction that measures a square’s diagonal — and hear why you will never find it.',
  prose: `
    <p>Draw a square and lay a rod along its diagonal. Nothing could be more concrete: you can
    see the length, cut a cord to match it, carry it across the room. Now try to <em>say</em>
    it. If the side counts as 1, the diagonal counts as — what? The Pythagoreans held that
    everything was, at bottom, whole number set against whole number, so some fraction
    <code>p/q</code> must fit: whole numbers with <code>p² = 2q²</code>. Try <code>7/5</code>:
    49 against 50 — off by one. Try <code>17/12</code>: 289 against 288 — off by one the other
    way. The hunt keeps almost succeeding, which is the cruellest way to fail.</p>
    <p>The near-misses are not scattered; they climb a ladder. Theon of Smyrna, writing in the
    second century CE about a rule already ancient, called them the <em>side and diameter
    numbers</em>: from any rung <code>(q, p)</code> the next is <code>(q + p, 2q + p)</code>,
    carrying (1, 1) to (2, 3) to (5, 7) to (12, 17) to (29, 41), with the meter
    <code>p² − 2q²</code> flipping −1, +1, −1 forever and never once reading 0. Modern books
    call them Pell numbers. The first station below sets you loose on the lattice to find the
    staircase yourself.</p>
    <p>The Greeks could do better than fail repeatedly: they could prove the failure final. The
    earliest solid witness is Aristotle, who cites the argument in passing as everybody's
    standard example — suppose <code>p/q</code> is in lowest terms and <code>p² = 2q²</code>;
    then p² is even, so p is even; write <code>p = 2r</code> and the same equation forces q
    even too, though we had cancelled every common factor. The assumption devours itself. (The
    tidy version tacked onto Euclid's Elements as X.117 is a later interpolation; the argument
    is older than the book.) The diagonal is <em>alogon</em> — not unknown, not approximate:
    un-ratio-able.</p>
    <p>But how would anyone first come to <em>suspect</em> such a thing? The likeliest road is
    the oldest algorithm we know: to compare two lengths, subtract the shorter from the longer,
    again and again — <em>anthyphairesis</em>, the Euclidean algorithm done with rods instead
    of symbols. Set it loose on 15 and 9 and it halts in three subtractions at 3, their common
    measure. Set it on the side and diagonal of a square and every round of subtraction leaves
    a smaller square with its own side and diagonal — the same scene, shrunk by a fixed factor,
    forever: in the bracket shorthand of continued fractions, <code>√2 = [1; 2, 2, 2, …]</code> —
    one 2 for every recurrence of the scene. A measuring procedure that cannot finish is
    what irrationality <em>is</em>. Movement III will ask the same question about procedures in
    general: what else never halts?</p>
    <p>This also closes a ledger opened two exhibits ago. Plimpton 322 tabulates whole-number
    right triangles a millennium before Pythagoras — who, despite the theorem's name, is not
    known to have proved it — and the simplest right triangle of all, the half-square, appears
    in no row of that tablet or any other, because its row would read <code>p² = 2q²</code>.
    And the crisis carried its own cure, twenty-three centuries early: Eudoxus tamed
    incommensurable magnitudes by defining when two ratios are <em>equal</em> — sort every
    whole-number ratio into <em>less</em> and <em>greater</em>, and let the sorting itself be
    the thing — precisely the cut with which Dedekind built the real numbers in 1872, a debt
    Dedekind acknowledged. At the last station you can <em>hear</em> the difference: ratios of
    whole numbers close their curve; the diagonal never does.</p>`,

  init(stage, core) {
    const { canvas: cv, audio, math, ui } = core;
    const P = cv.palette;
    const SQ2 = Math.SQRT2;
    const MONO = '11px ui-monospace, Menlo, monospace';

    const style = document.createElement('style');
    style.textContent = `
      #ex-diagonal .dg-title{font-variant:small-caps;letter-spacing:.24em;color:${P.gold};font-size:.85rem;margin:2.2rem 0 .7rem;}
      #ex-diagonal .dg-title:first-of-type{margin-top:.2rem;}
      #ex-diagonal .dg-meter{text-align:center;font-size:1.02rem;margin-top:.9rem;}
      #ex-diagonal .dg-meter .dg-near{color:${P.goldBright};}
      #ex-diagonal .dg-meter .dg-zero{color:${P.verdant};}
      #ex-diagonal .dg-proof{display:none;border:1px solid ${P.line};border-left:4px solid ${P.crimson};border-radius:0 6px 6px 0;padding:1rem 1.3rem;margin:1.1rem 0;}
      #ex-diagonal .dg-proof.open{display:block;}
      #ex-diagonal .dg-proof.won{border-left-color:${P.gold};}
      #ex-diagonal .dg-step{margin:.5rem 0;color:${P.inkDim};opacity:0;transform:translateY(5px);transition:opacity .45s ease,transform .45s ease;font-size:.95rem;}
      #ex-diagonal .dg-step.shown{opacity:1;transform:none;}
      #ex-diagonal .dg-step.dg-fire{color:${P.crimson};}
      #ex-diagonal .dg-step .dg-qed{color:${P.gold};font-size:1.15em;margin-left:.45em;}
      #ex-diagonal .dg-step button{margin-left:.7em;}`;
    stage.appendChild(style);

    const bus = audio.createBus('diagonal');
    const title = (txt) => {
      const d = document.createElement('div');
      d.className = 'dg-title';
      d.textContent = txt;
      stage.appendChild(d);
      return d;
    };
    const audioNow = () => (audio.getContext() ? audio.getContext().currentTime : 0);

    /* ================= station 1 · the lattice hunt ================= */

    title('one · the hunt');
    const quest = ui.questBanner(stage,
      'Drag the <em>crimson marker</em> (or double-click to plant it) on a lattice point ' +
      '(q, p) where the meter reads exactly 0 — a whole-number ratio with p² = 2q².');
    const h1 = cv.setupCanvas(stage, { height: 420 });
    const HOME = { x: 4, y: 4.5, s: 46 };
    const pz = new cv.PanZoom(h1, { scale: HOME.s, x: HOME.x, y: HOME.y, minScale: 0.3, maxScale: 220 });

    let mq = 3, mp = 4;              // marker at (q, p) — meter reads −2, so close
    const found = new Set();         // discovered Pell rungs (indices into PELL)
    let igniteCount = 0;
    let s1dirty = true;
    let fly = null;                  // camera animation
    let lastTick = 0;
    const spriteDim = cv.glowSprite(P.goldDim, 26);
    const spriteLit = cv.glowSprite(P.goldBright, 36);

    const meterBox = ui.readout(stage, '');
    meterBox.el.classList.add('dg-meter');

    const row1 = ui.controlRow(stage);
    const whyBtn = ui.button(row1, 'why does zero never come?', toggleProof, { primary: true });
    const flyBtn = ui.button(row1, '✦ fly to the next rung', flyToNext, { small: true });
    const homeBtn = ui.button(row1, 'recenter', () => {
      fly = { t: 0, x0: pz.x, y0: pz.y, s0: pz.scale, x1: HOME.x, y1: HOME.y, s1: HOME.s };
    }, { small: true });

    const proof = document.createElement('div');
    proof.className = 'dg-proof';
    stage.appendChild(proof);
    ui.caption(stage,
      'Drag to pan, scroll to zoom, drag the marker — or double-click to plant it. The gold ' +
      'rungs are the near-misses with p² − 2q² = ±1: Theon’s side-and-diameter numbers, ' +
      'zigzagging across the √2 ray without ever landing on it.');
    ui.legendPanel(stage,
      `<p>As the story goes, the discovery escaped — and the man who let it out, Hippasus of
      Metapontum, was drowned at sea for his impiety. It is a perfect story, which should
      already make us suspicious. Our sources for it come some eight hundred years after the
      fact and disagree about everything: whether the sea acted for the gods or the brotherhood
      did, whether the crime was revealing incommensurability or constructing the dodecahedron,
      whether it was Hippasus at all. What the record supports is duller and stranger: the
      discovery was made in the fifth century BCE, the Pythagoreans carried on for centuries
      afterwards, and Greek mathematics did not collapse — it grew teeth.</p>`);

    const PROOF = [
      ['Suppose the hunt could end: some marker gives <code>p² = 2q²</code> exactly. First cancel any common factor, so that p and q are not both even. Hold that thought — it is the entire proof.', 'look at p'],
      ['<code>p² = 2q²</code> says p² is even. An odd number squares to an odd number, so p itself must be even. Write <code>p = 2r</code>.', 'substitute'],
      ['Then <code>(2r)² = 2q²</code>, that is <code>4r² = 2q²</code>, that is <code>q² = 2r²</code> — the same equation again, one floor down. So q is even too.', 'but wait —'],
      ['Both p and q are even — yet we began by cancelling every common factor. The assumption has destroyed itself: the fraction never existed. The meter can flicker ±1 forever, but never 0.<span class="dg-qed">∎</span>', null],
    ];
    let proofStarted = false;

    function toggleProof() {
      proof.classList.toggle('open');
      if (proof.classList.contains('open') && !proofStarted) {
        proofStarted = true;
        revealStep(0);
      }
    }
    function revealStep(i) {
      const [text, next] = PROOF[i];
      const div = document.createElement('div');
      div.className = 'dg-step' + (next === null ? ' dg-fire' : '');
      div.innerHTML = text;
      if (next !== null) {
        const b = ui.button(div, next + ' →', () => {
          b.disabled = true;
          revealStep(i + 1);
        }, { small: true });
      }
      proof.appendChild(div);
      requestAnimationFrame(() => div.classList.add('shown'));
      if (next === null) {
        proof.classList.add('won');
        quest.done('Proved: p² = 2q² has no whole-number solution. The hunt was never winnable — the diagonal is <em>alogon</em>, un-ratio-able — and now you know why.');
        audio.playTone(bus, { freq: 220, dur: 1.4, level: 0.25 });
        audio.playTone(bus, { freq: 440, dur: 1.4, level: 0.2 });
      }
    }

    function updateMeter() {
      const pB = BigInt(mp), qB = BigInt(mq);
      const v = meter2(pB, qB);
      const av = v < 0n ? -v : v;
      let cls = '', note = '';
      if (mq === 0 && mp === 0) {
        note = ' — but 0/0 names no length; stand the marker off the corner.';
      } else if (mq === 0) {
        note = ' — with q = 0 there is no ratio at all.';
      } else if (v === 0n) {
        cls = 'dg-zero'; note = ' ?!';
      } else if (av === 1n) {
        cls = 'dg-near'; note = ' — a near-miss: the closest whole numbers can come.';
      } else {
        note = ` — so p/q ${v > 0n ? 'overshoots' : 'undershoots'} √2.`;
      }
      meterBox.setHTML(
        `${formatBig(pB)}² − 2·${formatBig(qB)}² = ` +
        `<span class="${cls}">${v > 0n ? '+' : ''}${formatBig(v)}</span>` +
        `<span style="color:${P.inkFaint}">${note}</span>`);

      if (av === 1n) {
        const idx = PELL.findIndex(([pp, qq]) => pp === pB && qq === qB);
        if (idx >= 0 && !found.has(idx)) {
          found.add(idx);
          igniteCount++;
          const r = Number(pB) / Number(qB);
          audio.playTone(bus, { freq: 220, dur: 0.9, level: 0.26 });
          audio.playTone(bus, { freq: 220 * r, dur: 0.9, level: 0.26 });
          if (igniteCount >= 3) {
            quest.set('Rung after rung: ±1 forever, 0 never. When you are ready to know <em>why</em>, press the button below the lattice.');
          } else if (igniteCount === 1) {
            quest.set('Ignited! Every gold rung misses by exactly one — and each is built from the last: (q, p) → (q + p, 2q + p). Climb the staircase. Zero is still wanted.');
          }
        }
      }
    }

    function placeMarker(q, p) {
      q = clamp(Math.round(q), 0, 9e15);
      p = clamp(Math.round(p), 0, 9e15);
      if (q === mq && p === mp) return;
      mq = q; mp = p;
      const now = performance.now();
      if (now - lastTick > 70 && audio.getContext()) {
        const v = meter2(BigInt(mp), BigInt(mq));
        const av = Math.min(Number(v < 0n ? -v : v), 1e6);
        audio.drums.wood(bus, audioNow(), { level: 0.12, pitch: 420 + 520 * Math.exp(-av / 8) });
        lastTick = now;
      }
      updateMeter();
      s1dirty = true;
    }

    function flyToNext() {
      let idx = 0;
      while (found.has(idx)) idx++;
      if (idx >= PELLN.length) return;
      const [qx, py] = PELLN[idx];
      if (!isFinite(qx) || qx > 1e12) return;
      const s1 = clamp((h1.width / 2) / (qx * 0.35 + 2), 0.6, 48);
      fly = { t: 0, x0: pz.x, y0: pz.y, s0: pz.scale, x1: qx, y1: py, s1 };
    }
    function stepFly(dt) {
      if (!fly) return;
      fly.t = Math.min(1, fly.t + dt / 1.1);
      const e = fly.t * fly.t * (3 - 2 * fly.t);
      pz.x = lerp(fly.x0, fly.x1, e);
      pz.y = lerp(fly.y0, fly.y1, e);
      pz.scale = fly.s0 * Math.pow(fly.s1 / fly.s0, e);
      s1dirty = true;
      if (fly.t >= 1) fly = null;
    }

    // pointer: drag marker when grabbed near it, else pan; wheel zooms
    const cnv1 = h1.canvas;
    let drag1 = null, lastPX = 0, lastPY = 0;
    cnv1.addEventListener('pointerdown', (e) => {
      audio.ensureAudio();
      const [px, py] = cv.pointerPos(h1, e);
      const [mx, my] = pz.worldToScreen(mq, mp);
      drag1 = Math.hypot(px - mx, py - my) < 22 ? 'marker' : 'pan';
      lastPX = e.clientX; lastPY = e.clientY;
      fly = null;
      try { cnv1.setPointerCapture(e.pointerId); } catch {}
    });
    cnv1.addEventListener('pointermove', (e) => {
      if (!drag1) return;
      if (drag1 === 'pan') {
        pz.x -= (e.clientX - lastPX) / pz.scale;
        pz.y += (e.clientY - lastPY) / pz.scale;
        lastPX = e.clientX; lastPY = e.clientY;
        s1dirty = true;
      } else {
        const [px, py] = cv.pointerPos(h1, e);
        const [wx, wy] = pz.screenToWorld(px, py);
        placeMarker(wx, wy);
      }
    });
    const endDrag = (e) => { drag1 = null; try { cnv1.releasePointerCapture(e.pointerId); } catch {} };
    cnv1.addEventListener('pointerup', endDrag);
    cnv1.addEventListener('pointercancel', endDrag);
    cnv1.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = cnv1.getBoundingClientRect();
      pz.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(1.0015, -e.deltaY));
      s1dirty = true;
    }, { passive: false });
    cnv1.addEventListener('dblclick', (e) => {
      const [px, py] = cv.pointerPos(h1, e);
      const [wx, wy] = pz.screenToWorld(px, py);
      placeMarker(wx, wy);
    });

    function drawLattice() {
      const { ctx, width: W, height: H } = h1;
      ctx.clearRect(0, 0, W, H);
      const [wxA, wyA] = pz.screenToWorld(0, 0);     // left edge, top (max y)
      const [wxB, wyB] = pz.screenToWorld(W, H);     // right edge, bottom (min y)
      const sc = pz.scale;

      // grid
      let step = 1;
      while (step * sc < 24) step *= 2;
      ctx.lineWidth = 1;
      for (let x = Math.floor(wxA / step) * step; x <= wxB; x += step) {
        const sx = pz.worldToScreen(x, 0)[0];
        ctx.strokeStyle = x === 0 ? P.inkFaint : P.line;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      }
      for (let y = Math.floor(wyB / step) * step; y <= wyA; y += step) {
        const sy = pz.worldToScreen(0, y)[1];
        ctx.strokeStyle = y === 0 ? P.inkFaint : P.line;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      }

      // lattice dots
      if (sc >= 15 && (wxB - wxA) * (wyA - wyB) <= 5200) {
        ctx.fillStyle = P.inkFaint;
        for (let x = Math.ceil(wxA); x <= wxB; x++) {
          for (let y = Math.ceil(wyB); y <= wyA; y++) {
            const [sx, sy] = pz.worldToScreen(x, y);
            ctx.fillRect(sx - 1.1, sy - 1.1, 2.2, 2.2);
          }
        }
      }

      // the √2 ray from the origin
      if (wxB > 0) {
        const xr0 = Math.max(0, wxA - 1);
        const [rx0, ry0] = pz.worldToScreen(xr0, xr0 * SQ2);
        const [rx1, ry1] = pz.worldToScreen(wxB + 1, (wxB + 1) * SQ2);
        ctx.strokeStyle = P.azure;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.lineTo(rx1, ry1); ctx.stroke();
        ctx.setLineDash([]);
        const xm = Math.min(wxB, wyA / SQ2) * 0.8;
        if (xm > Math.max(0, wxA)) {
          const [lx, ly] = pz.worldToScreen(xm, xm * SQ2);
          ctx.fillStyle = P.azure;
          ctx.font = MONO;
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText('p = √2 · q', lx + 8, ly - 6);
        }
      }

      // staircase segments between consecutively discovered rungs
      ctx.strokeStyle = P.goldDim;
      ctx.lineWidth = 1.3;
      for (let i = 0; i + 1 < PELLN.length; i++) {
        if (!found.has(i) || !found.has(i + 1)) continue;
        const [ax, ay] = pz.worldToScreen(PELLN[i][0], PELLN[i][1]);
        const [bx, by] = pz.worldToScreen(PELLN[i + 1][0], PELLN[i + 1][1]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }

      // Pell rungs
      ctx.font = MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      for (let i = 0; i < PELLN.length; i++) {
        const [qx, py] = PELLN[i];
        if (!isFinite(qx) || qx < wxA - 2 || qx > wxB + 2 || py < wyB - 2 || py > wyA + 2) continue;
        const [sx, sy] = pz.worldToScreen(qx, py);
        const lit = found.has(i);
        (lit ? spriteLit : spriteDim).draw(ctx, sx, sy, lit ? 1.2 : 0.8);
        if (lit && sc > 22) {
          ctx.fillStyle = P.goldBright;
          ctx.fillText(`${PELL[i][0]}:${PELL[i][1]}`, sx + 9, sy - 7);
        }
      }

      // faint ray through the marker — its slope vs the true diagonal's
      if (mq > 0 || mp > 0) {
        let k = Infinity;
        if (mq > 0) k = Math.min(k, (wxB + 1) / mq);
        if (mp > 0) k = Math.min(k, (wyA + 1) / mp);
        if (k > 0 && isFinite(k)) {
          const [ox, oy] = pz.worldToScreen(0, 0);
          const [ex, ey] = pz.worldToScreen(mq * k, mp * k);
          ctx.strokeStyle = P.crimson + '55';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
        }
      }

      // the marker
      const [mx, my] = pz.worldToScreen(mq, mp);
      if (mx > -40 && mx < W + 40 && my > -40 && my < H + 40) {
        ctx.strokeStyle = P.crimson;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 7, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx - 12, my); ctx.lineTo(mx - 4, my);
        ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 12, my);
        ctx.moveTo(mx, my - 12); ctx.lineTo(mx, my - 4);
        ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 12);
        ctx.stroke();
        ctx.fillStyle = P.crimson;
        ctx.beginPath(); ctx.arc(mx, my, 2, 0, TAU); ctx.fill();
        ctx.font = MONO;
        ctx.textAlign = mx > W - 130 ? 'right' : 'left';
        ctx.textBaseline = my < 30 ? 'top' : 'bottom';
        ctx.fillText(`(q, p) = (${mq}, ${mp})`, mx + (mx > W - 130 ? -12 : 12), my + (my < 30 ? 12 : -12));
      }

      // axis names
      ctx.fillStyle = P.inkDim;
      ctx.font = MONO;
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('q — how many sides →', W - 10, pz.worldToScreen(0, 0)[1] - 6 < H - 6 ? clamp(pz.worldToScreen(0, 0)[1] - 6, 14, H - 8) : H - 8);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('↑ p — how many diagonals', clamp(pz.worldToScreen(0, 0)[0] + 8, 8, W - 180), 10);
    }

    h1.onResize(() => { s1dirty = true; });
    updateMeter();

    /* ================= station 2 · the subtraction that cannot end ================= */

    title('two · the subtraction that cannot end');
    const h2 = cv.setupCanvas(stage, { height: 320 });
    const row2 = ui.controlRow(stage);
    const btn15 = ui.button(row2, '15 and 9', () => setMode2('int'));
    const btnSD = ui.button(row2, 'side and diagonal', () => setMode2('sd'));
    const subBtn = ui.button(row2, '− subtract shorter from longer', doSubtract, { primary: true });
    const runBtn = ui.button(row2, '⏩ let it run', toggleRun, { small: true });
    const cfLine = ui.mathline(stage, '');
    const out2 = ui.readout(stage, '');
    ui.caption(stage,
      'Reciprocal subtraction — <em>anthyphairesis</em> — is the Euclidean algorithm done with ' +
      'rods. On 15 and 9 it halts at a common measure. On side and diagonal every leftover is a ' +
      'smaller side and diagonal again: a gcd computation that never halts.');

    // rods as x + y√2 with exact BigInt coefficients
    let mode2 = 'int';
    let rodA = { x: 15n, y: 0n }, rodB = { x: 9n, y: 0n };
    let anim2 = null;            // { rod: 'A'|'B', t }
    let halted2 = false, capped2 = false;
    let terms2 = [], curCount = 0, subCount = 0, depth2 = 0;
    let S2 = 1, S2target = 1;    // px per unit, eased (the auto-zoom)
    let runOn = false, runAcc = 0;
    let glyphPulse = 0;
    const SUB_CAP = 25;          // 1 + 2·12 subtractions → twelve levels deep

    const val2 = (r) => sdValue(r.x, r.y);
    const rodUsable = () => Math.max(60, h2.width - 76);

    function setMode2(m) {
      mode2 = m;
      btn15.classList.toggle('active', m === 'int');
      btnSD.classList.toggle('active', m === 'sd');
      rodA = m === 'int' ? { x: 15n, y: 0n } : { x: 0n, y: 1n };
      rodB = m === 'int' ? { x: 9n, y: 0n } : { x: 1n, y: 0n };
      anim2 = null; halted2 = false; capped2 = false;
      terms2 = []; curCount = 0; subCount = 0; depth2 = 0;
      glyphPulse = 0; runOn = false; runAcc = 0;
      runBtn.classList.remove('active');
      subBtn.disabled = false;
      S2 = S2target = rodUsable() / (m === 'int' ? 15 : SQ2);
      refresh2();
    }

    function cfText() {
      if (terms2.length === 0) return (mode2 === 'int' ? '15/9' : '√2') + ' = [ … ]';
      const rest = terms2.slice(1).join(', ');
      if (mode2 === 'int') {
        return halted2
          ? `15/9 = [${terms2[0]}; ${rest}] — three subtractions, then silence.`
          : `15/9 = [${terms2[0]};${rest ? ' ' + rest + ',' : ''} …]`;
      }
      return `√2 = [${terms2[0]};${rest ? ' ' + rest + ',' : ''} …]${capped2 ? ' — the twos never stop.' : ''}`;
    }

    function refresh2() {
      cfLine.innerHTML = cfText();
      if (halted2) {
        out2.set(`the rods agree: ${rodA.x} — the common measure. 15 = 5·3, 9 = 3·3, so 15 : 9 = 5 : 3. The algorithm HALTS.`);
      } else if (capped2) {
        out2.set('twelve levels down, the picture has not changed — and it never will. (We must stop somewhere; the mathematics doesn’t.)');
      } else if (mode2 === 'int') {
        out2.set(`now: ${rodA.x} and ${rodB.x} — subtract the ${rodA.x > rodB.x ? rodB.x : rodA.x}`);
      } else {
        out2.set(`now: ${fmtSD(rodA.x, rodA.y)} ≈ ${val2(rodA).toFixed(5)}  and  ${fmtSD(rodB.x, rodB.y)} ≈ ${val2(rodB).toFixed(5)}`);
      }
    }

    function doSubtract() {
      if (anim2 || halted2 || capped2) return;
      audio.ensureAudio();
      anim2 = { rod: val2(rodA) >= val2(rodB) ? 'A' : 'B', t: 0 };
      audio.drums.wood(bus, audioNow(), { level: 0.3, pitch: 560 + 70 * (curCount % 4) });
    }

    function commitSubtract() {
      const longer = anim2.rod === 'A' ? rodA : rodB;
      const shorter = anim2.rod === 'A' ? rodB : rodA;
      const next = { x: longer.x - shorter.x, y: longer.y - shorter.y };
      if (anim2.rod === 'A') rodA = next; else rodB = next;
      anim2 = null;
      curCount++; subCount++;
      const va = val2(rodA), vb = val2(rodB);
      const equal = mode2 === 'int' ? rodA.x === rodB.x : false;
      if (equal) {
        terms2.push(curCount + 1);        // Euclid would subtract once more to reach zero
        curCount = 0;
        halted2 = true; runOn = false; runBtn.classList.remove('active');
        subBtn.disabled = true;
        audio.drums.thock(bus, audioNow(), { level: 0.5 });
        audio.playTone(bus, { freq: 330, dur: 1.3, level: 0.26 });   // 5 : 3 — the rods' own ratio
        audio.playTone(bus, { freq: 550, dur: 1.3, level: 0.26 });
      } else {
        const swapped = (next === rodA ? va < vb : vb < va);
        if (swapped) {
          terms2.push(curCount);
          curCount = 0;
          if (mode2 === 'sd') {
            depth2 = Math.max(0, terms2.length - 1);   // completed "2"s = recursion levels
            if (depth2 > 0) glyphPulse = 1;
          }
          audio.drums.wood(bus, audioNow(), { level: 0.24, pitch: 880 });
        }
        if (mode2 === 'sd' && subCount >= SUB_CAP) {
          capped2 = true; runOn = false; runBtn.classList.remove('active');
          subBtn.disabled = true;
          audio.drums.thock(bus, audioNow(), { level: 0.4 });
        }
      }
      S2target = rodUsable() / Math.max(val2(rodA), val2(rodB));
      if (mode2 === 'int') S2target = rodUsable() / 15;   // hold scale: the halt happens in true size
      refresh2();
    }

    function toggleRun() {
      if (halted2 || capped2) return;
      runOn = !runOn;
      runBtn.classList.toggle('active', runOn);
      if (runOn) { audio.ensureAudio(); runAcc = 0.5; }
    }

    function step2(dt) {
      if (anim2) {
        anim2.t += dt / 0.45;
        if (anim2.t >= 1) commitSubtract();
      }
      if (runOn && !anim2 && !halted2 && !capped2) {
        runAcc += dt;
        if (runAcc >= 0.62) { runAcc = 0; doSubtract(); }
      }
      S2 += (S2target - S2) * Math.min(1, dt * 3.5);
      if (glyphPulse > 0) glyphPulse = Math.max(0, glyphPulse - dt * 1.6);
    }

    function drawRod(ctx, y, px, color, animCutPx) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(38, y - 7, Math.max(1, px), 14);
      ctx.globalAlpha = 1;
      if (animCutPx != null && anim2) {
        const keep = px - animCutPx;
        ctx.clearRect(38 + keep, y - 9, animCutPx + 60, 18);
        ctx.fillStyle = color;
        ctx.fillRect(38, y - 7, Math.max(1, keep), 14);
        ctx.globalAlpha = (1 - anim2.t) * 0.85;
        ctx.fillRect(38 + keep + anim2.t * 46, y - 7, animCutPx, 14);
        ctx.globalAlpha = 1;
      }
    }

    function draw2() {
      const { ctx, width: W, height: H } = h2;
      ctx.clearRect(0, 0, W, H);
      const va = val2(rodA), vb = val2(rodB);
      const yA = 64, yB = 128;
      const pxA = va * S2, pxB = vb * S2;
      const longerIsA = va >= vb;

      ctx.font = MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

      const cutPx = Math.min(pxA, pxB);
      drawRod(ctx, yA, pxA, P.gold, anim2 && anim2.rod === 'A' ? cutPx : null);
      drawRod(ctx, yB, pxB, P.azureDim, anim2 && anim2.rod === 'B' ? cutPx : null);
      ctx.fillStyle = P.inkDim;
      ctx.fillText(mode2 === 'int' ? `${rodA.x}` : fmtSD(rodA.x, rodA.y), 38, yA - 18);
      ctx.fillText(mode2 === 'int' ? `${rodB.x}` : fmtSD(rodB.x, rodB.y), 38, yB - 18);

      // measuring bracket: the shorter rod laid against the longer
      if (!halted2 && !anim2 && Math.abs(pxA - pxB) > 0.5) {
        const yL = longerIsA ? yA : yB;
        const px = Math.max(pxA, pxB);
        ctx.strokeStyle = P.crimson + '99';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(38 + px - cutPx, yL + 11); ctx.lineTo(38 + px - cutPx, yL + 16);
        ctx.lineTo(38 + px, yL + 16); ctx.lineTo(38 + px, yL + 11);
        ctx.stroke();
      }

      // unit ticks (integer mode)
      if (mode2 === 'int') {
        ctx.strokeStyle = P.bg;
        ctx.lineWidth = 1.5;
        for (const [y, v] of [[yA, Number(rodA.x)], [yB, Number(rodB.x)]]) {
          for (let u = 1; u < v; u++) {
            ctx.beginPath(); ctx.moveTo(38 + u * S2, y - 7); ctx.lineTo(38 + u * S2, y + 7); ctx.stroke();
          }
        }
        if (halted2) {
          // the common measure glows through both original rods
          ctx.fillStyle = P.verdant;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          for (const y of [yA, yB]) {
            ctx.globalAlpha = 0.35;
            ctx.fillRect(38, y - 7, 3 * S2, 14);
            ctx.globalAlpha = 1;
          }
          ctx.fillText('a common measure: 3 — it fits both rods exactly. gcd(15, 9) = 3', W / 2, yB + 26);
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        }
      }

      // square glyph (√2 mode): the rods ARE this square's side and diagonal
      if (mode2 === 'sd') {
        const g = 96;
        const gx = W / 2 - g / 2, gy = H - g - 26;
        const pulse = 1 + glyphPulse * 0.5;
        ctx.save();
        ctx.translate(gx + g / 2, gy + g / 2);
        ctx.scale(pulse, pulse);
        ctx.translate(-(gx + g / 2), -(gy + g / 2));
        ctx.strokeStyle = P.azureDim;
        ctx.lineWidth = 2;
        ctx.strokeRect(gx, gy, g, g);
        ctx.strokeStyle = P.gold;
        ctx.beginPath(); ctx.moveTo(gx, gy + g); ctx.lineTo(gx + g, gy); ctx.stroke();
        // arc: mark the side off along the diagonal; the leftover is crimson
        ctx.strokeStyle = P.ink + '66';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(gx, gy + g, g, -Math.PI * 0.32, -Math.PI * 0.18); ctx.stroke();
        const fx = gx + g / SQ2, fy = gy + g - g / SQ2;
        ctx.strokeStyle = P.crimson;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(gx + g, gy); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = P.inkFaint;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('side (blue) · diagonal (gold) · leftover (red) — the leftover starts the next, smaller square', W / 2, H - 18);
        ctx.fillStyle = P.inkDim;
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(`depth ${depth2} — every two cuts, the same picture, ×(√2−1)`, W - 12, 12);
        ctx.textAlign = 'left';
      }

      if (halted2) {
        ctx.fillStyle = P.verdant;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('HALT', W / 2, 14);
        ctx.textAlign = 'left';
      }
    }

    /* ================= station 3 · the sound of incommensurability ================= */

    title('three · the sound of incommensurability');
    const h3 = cv.setupCanvas(stage, { height: 330 });
    const row3 = ui.controlRow(stage);
    const playBtn3 = ui.button(row3, '♪ sound the ratio', togglePlay3, { primary: true });
    const RL = [
      { p: 1, q: 1, label: '1 : 1' },
      { p: 3, q: 2, label: '3 : 2' },
      { p: 7, q: 5, label: '7 : 5' },
      { p: 17, q: 12, label: '17 : 12' },
      { p: 41, q: 29, label: '41 : 29' },
      { irr: true, label: '√2 : 1' },
    ];
    const ratioBtns = RL.map((r, i) => ui.button(row3, r.label, () => setRatio(i), { small: true }));
    const out3 = ui.readout(stage, '');
    ui.caption(stage,
      'Both pictures are drawn from the same two frequencies you hear: x from one string, y from ' +
      'the other. A whole-number ratio closes the figure — commensurability, seen. The Pell ' +
      'ratios close ever more elaborately. √2 : 1 never closes, and the beats never repeat. ' +
      'Carry the chord with you into Movement II.');

    let ri = 1;                     // current ratio index (start at 3 : 2)
    let rVal = 1.5, rClose = 2;     // numeric ratio; sweeps to closure (null = never)
    let tau3 = 0, closed3 = false;  // trace parameter, in x-sweeps
    let lastPt = null;
    let playing3 = false;
    let vx = null, vy = null;
    let off3 = null, offCtx3 = null;      // accumulated Lissajous curve
    let scope3 = null, scopeCtx3 = null;  // static waveform window
    let L3 = 2;                           // scope window length in x-sweeps
    const RATE3 = 0.45;                   // x-sweeps per second

    function lissGeom() {
      const W = h3.width, H = h3.height;
      const size = Math.min(H - 16, Math.floor(W * 0.5));
      return { lx: 8, ly: (H - size) / 2, size, sx: size + 32, sw: W - size - 44 };
    }

    function lissPoint(t) {
      const { lx, ly, size } = lissGeom();
      const r = size / 2 - 12;
      return [
        lx + size / 2 + Math.sin(TAU * t) * r,
        ly + size / 2 - Math.sin(TAU * rVal * t) * r,
      ];
    }

    function ensureSurfaces() {
      const g = lissGeom();
      const dpr = h3.dpr || 1;
      if (!off3 || off3.width !== Math.round(g.size * dpr)) {
        off3 = document.createElement('canvas');
        off3.width = off3.height = Math.max(2, Math.round(g.size * dpr));
        offCtx3 = off3.getContext('2d');
        offCtx3.setTransform(dpr, 0, 0, dpr, 0, 0);
        resetTrace();
      }
      const sw = Math.max(2, Math.round(g.sw * dpr));
      if (!scope3 || scope3.width !== sw) {
        scope3 = document.createElement('canvas');
        scope3.width = sw;
        scope3.height = Math.max(2, Math.round(g.size * 0.62 * dpr));
        scopeCtx3 = scope3.getContext('2d');
        scopeCtx3.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScope();
      }
    }

    function resetTrace() {
      tau3 = 0; closed3 = false; lastPt = null;
      if (offCtx3) {
        const dpr = h3.dpr || 1;
        offCtx3.clearRect(0, 0, off3.width / dpr, off3.height / dpr);
      }
    }

    function drawScope() {
      if (!scopeCtx3) return;
      const dpr = h3.dpr || 1;
      const w = scope3.width / dpr, hh = scope3.height / dpr;
      const c = scopeCtx3;
      c.clearRect(0, 0, w, hh);
      const mid = hh / 2, amp = hh * 0.38;
      const N = Math.max(240, Math.min(1400, Math.round(L3 * 48)));
      const wave = (fn, color, lw, alpha) => {
        c.strokeStyle = color; c.lineWidth = lw; c.globalAlpha = alpha;
        c.beginPath();
        for (let i = 0; i <= N; i++) {
          const u = (i / N) * L3;
          const y = mid - fn(u) * amp;
          i ? c.lineTo((i / N) * w, y) : c.moveTo(0, y);
        }
        c.stroke(); c.globalAlpha = 1;
      };
      wave((u) => Math.sin(TAU * u) * 0.5, P.goldDim, 1, 0.55);
      wave((u) => Math.sin(TAU * rVal * u) * 0.5, P.azureDim, 1, 0.55);
      wave((u) => (Math.sin(TAU * u) + Math.sin(TAU * rVal * u)) / 2, P.ink, 1.4, 0.95);
    }

    function setRatio(i) {
      ri = i;
      const r = RL[i];
      rVal = r.irr ? SQ2 : r.p / r.q;
      rClose = r.irr ? null : r.q;
      L3 = r.irr ? 8 : Math.max(r.q, 2);
      ratioBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      resetTrace();
      drawScope();
      if (playing3 && vy) vy.setFreq(220 * rVal, 0.08);
      const c = cents(rVal / SQ2);
      out3.set(r.irr
        ? `√2 : 1 = 1.41421… — the tritone itself · the curve never closes`
        : `${r.label} = ${rVal.toFixed(5)} · ${c > 0 ? '+' : ''}${c.toFixed(1)} ¢ from √2 · closes after ${r.q} sweep${r.q === 1 ? '' : 's'}`);
    }

    function togglePlay3() {
      audio.ensureAudio();
      playing3 = !playing3;
      if (playing3 && !vx) {
        vx = audio.voice(bus, { freq: 220, level: 0.26 });
        vy = audio.voice(bus, { freq: 220 * rVal, level: 0.26 });
      }
      if (playing3) {
        vy.setFreq(220 * rVal, 0.03);
        vx.on(); vy.on();
      } else {
        vx.off(); vy.off();
      }
      playBtn3.textContent = playing3 ? '■ silence' : '♪ sound the ratio';
      playBtn3.classList.toggle('active', playing3);
    }
    function stopPlay3() { if (playing3) togglePlay3(); }

    function step3(dt) {
      ensureSurfaces();
      const tNew = tau3 + dt * RATE3;
      if (!closed3 && offCtx3) {
        const { lx, ly } = lissGeom();
        const c = offCtx3;
        c.strokeStyle = P.gold;
        c.lineWidth = 1.2;
        c.globalAlpha = 0.85;
        c.beginPath();
        const steps = Math.max(1, Math.ceil((tNew - tau3) * 160));
        let [px0, py0] = lastPt || lissPoint(tau3);
        c.moveTo(px0 - lx, py0 - ly);
        for (let s = 1; s <= steps; s++) {
          const t = tau3 + ((tNew - tau3) * s) / steps;
          const [px, py] = lissPoint(t);
          c.lineTo(px - lx, py - ly);
          if (s === steps) lastPt = [px, py];
        }
        c.stroke();
        c.globalAlpha = 1;
        if (rClose !== null && tNew >= rClose) closed3 = true;
      }
      tau3 = tNew;
    }

    function draw3() {
      const { ctx, width: W, height: H } = h3;
      ctx.clearRect(0, 0, W, H);
      const g = lissGeom();
      const dpr = h3.dpr || 1;

      // Lissajous frame + accumulated curve + head
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(g.lx + 0.5, g.ly + 0.5, g.size, g.size);
      if (off3) ctx.drawImage(off3, 0, 0, off3.width, off3.height, g.lx, g.ly, g.size, g.size);
      const [hx, hy] = lissPoint(tau3);
      spriteLit.draw(ctx, hx, hy, 0.6);
      ctx.fillStyle = P.goldBright;
      ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, TAU); ctx.fill();

      ctx.font = MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (closed3) {
        ctx.fillStyle = P.verdant;
        ctx.fillText(`closed after ${rClose} sweep${rClose === 1 ? '' : 's'} ✓`, g.lx + 8, g.ly + 8);
      } else if (rClose === null && tau3 > 10) {
        ctx.fillStyle = P.crimson;
        ctx.fillText('still open — forever', g.lx + 8, g.ly + 8);
      }

      // scope: static window + playhead
      const sy = (H - scope3.height / dpr) / 2;
      if (scope3) ctx.drawImage(scope3, 0, 0, scope3.width, scope3.height, g.sx, sy, g.sw, scope3.height / dpr);
      ctx.strokeStyle = P.line;
      ctx.strokeRect(g.sx + 0.5, sy + 0.5, g.sw, scope3.height / dpr);
      const u = ((tau3 % L3) / L3) * g.sw;
      ctx.strokeStyle = P.gold + '88';
      ctx.beginPath(); ctx.moveTo(g.sx + u, sy); ctx.lineTo(g.sx + u, sy + scope3.height / dpr); ctx.stroke();
      ctx.fillStyle = rClose === null ? P.crimson : P.inkFaint;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(
        rClose === null ? 'no window contains a repeat' : `one full period: ${rClose} sweep${rClose === 1 ? '' : 's'} of the low string`,
        g.sx, sy + scope3.height / dpr + 8);
    }

    /* ================= coda · the cut that became a number ================= */

    title('coda · the cut that became a number');
    const h4 = cv.setupCanvas(stage, { height: 190 });
    const row4 = ui.controlRow(stage);
    const dropBtn = ui.button(row4, 'sort the next fraction', dropNext, { primary: true });
    const reset4Btn = ui.button(row4, 'reset', reset4, { small: true });
    const out4 = ui.readout(stage, '');
    ui.caption(stage,
      'Eudoxus (Elements, Book V) declared two ratios equal when every whole-number ratio ' +
      'sorts the same way against both — a magnitude defined purely by its <em>less</em> pile ' +
      'and its <em>greater</em> pile. Dedekind built the real numbers from the same cut in ' +
      '1872, and said so. What a number <em>is</em> stays open until Movement III.');

    const CUT_CAP = 26;
    let lo4, hi4, landed4, chip4, view4, viewT4, s4dirty;

    function reset4() {
      lo4 = [1n, 1n]; hi4 = [2n, 1n];
      landed4 = [];               // { v, side, label }
      chip4 = null;               // { v, side, label, t }
      view4 = { a: 0.88, b: 2.12 };
      viewT4 = { a: 0.88, b: 2.12 };
      s4dirty = true;
      dropBtn.disabled = false;
      dropBtn.textContent = 'sort the next fraction';
      out4.set('somewhere between 1/1 and 2/1 hides the diagonal. Sort fractions against it — using only whole-number arithmetic: is p² less or greater than 2q²?');
    }
    reset4();

    function dropNext() {
      if (chip4) return;
      audio.ensureAudio();
      const m = [lo4[0] + hi4[0], lo4[1] + hi4[1]];
      const s = meter2(m[0], m[1]);
      const side = s < 0n ? 'less' : 'greater';
      if (s < 0n) lo4 = m; else hi4 = m;
      chip4 = { v: Number(m[0]) / Number(m[1]), side, label: `${m[0]}/${m[1]}`, t: 0 };
      audio.drums.wood(bus, audioNow(), { level: 0.22, pitch: side === 'less' ? 520 : 640 });
      const loV = Number(lo4[0]) / Number(lo4[1]);
      const hiV = Number(hi4[0]) / Number(hi4[1]);
      const pad = (hiV - loV) * 0.85;
      viewT4 = { a: loV - pad, b: hiV + pad };
      const width = hiV - loV;
      out4.set(
        `${lo4[0]}/${lo4[1]}  <  the cut  <  ${hi4[0]}/${hi4[1]}   ·   trap width ${width.toExponential(2)}` +
        (width < 1e-4 ? '   ·   the two piles alone have pinned a point no fraction occupies' : ''));
      if (landed4.length + 1 >= CUT_CAP) {
        dropBtn.disabled = true;
        dropBtn.textContent = '…and so on, forever';
      }
      s4dirty = true;
    }

    function step4(dt) {
      let moving = false;
      if (chip4) {
        chip4.t += dt / 0.5;
        if (chip4.t >= 1) { landed4.push(chip4); chip4 = null; }
        moving = true;
      }
      const ease = Math.min(1, dt * 2.2);
      if (Math.abs(view4.a - viewT4.a) > 1e-12 || Math.abs(view4.b - viewT4.b) > 1e-12) {
        view4.a = lerp(view4.a, viewT4.a, ease);
        view4.b = lerp(view4.b, viewT4.b, ease);
        moving = true;
      }
      if (moving) s4dirty = true;
    }

    function draw4() {
      const { ctx, width: W, height: H } = h4;
      ctx.clearRect(0, 0, W, H);
      const yLine = H * 0.58;
      const vx4 = (v) => ((v - view4.a) / (view4.b - view4.a)) * (W - 40) + 20;
      const span = view4.b - view4.a;

      // baseline + adaptive ticks
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(10, yLine); ctx.lineTo(W - 10, yLine); ctx.stroke();
      let tick = Math.pow(10, Math.floor(Math.log10(span / 4)));
      if (span / tick > 8) tick *= 2;
      const dec = Math.max(0, -Math.floor(Math.log10(tick)));
      ctx.font = MONO;
      ctx.fillStyle = P.inkFaint;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let v = Math.ceil(view4.a / tick) * tick; v <= view4.b; v += tick) {
        const x = vx4(v);
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(x, yLine - 4); ctx.lineTo(x, yLine + 4); ctx.stroke();
        ctx.fillText(v.toFixed(dec), x, yLine + 8);
      }

      // the trap: current interval band
      const loV = Number(lo4[0]) / Number(lo4[1]);
      const hiV = Number(hi4[0]) / Number(hi4[1]);
      ctx.fillStyle = P.gold + '14';
      ctx.fillRect(vx4(loV), yLine - 26, Math.max(1, vx4(hiV) - vx4(loV)), 26);

      // the hidden cut
      const cx4 = vx4(SQ2);
      ctx.strokeStyle = P.crimson;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(cx4, yLine - 34); ctx.lineTo(cx4, yLine + 4); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.crimson;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(landed4.length >= 6 ? 'the cut — no fraction stands here' : '?', cx4, yLine - 38);

      // landed fractions
      for (const d of landed4) {
        const x = vx4(d.v);
        if (x < -20 || x > W + 20) continue;
        ctx.fillStyle = d.side === 'less' ? P.gold : P.azure;
        ctx.beginPath(); ctx.arc(x, yLine, 3, 0, TAU); ctx.fill();
      }
      // labels for the current best from each side
      ctx.textBaseline = 'top';
      ctx.fillStyle = P.gold;
      ctx.textAlign = 'right';
      ctx.fillText(`${lo4[0]}/${lo4[1]} <`, clamp(vx4(loV), 60, W - 60) - 6, yLine + 24);
      ctx.fillStyle = P.azure;
      ctx.textAlign = 'left';
      ctx.fillText(`< ${hi4[0]}/${hi4[1]}`, clamp(vx4(hiV), 60, W - 60) + 6, yLine + 24);

      // falling chip
      if (chip4) {
        const x = vx4(chip4.v);
        const e = chip4.t * chip4.t;
        const y = lerp(16, yLine, e);
        ctx.fillStyle = chip4.side === 'less' ? P.gold : P.azure;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(chip4.label, x, y - 8);
      }

      // pile legend
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = P.gold;
      ctx.fillText('● less', 14, 10);
      ctx.fillStyle = P.azure;
      ctx.fillText('● greater', 74, 10);
    }
    h4.onResize(() => { s4dirty = true; });

    /* ================= shared loop & lifecycle ================= */

    setMode2('int');
    setRatio(1);

    const loop = cv.rafLoop((dt) => {
      stepFly(dt);
      if (s1dirty) { drawLattice(); s1dirty = false; }
      step2(dt);
      draw2();
      step3(dt);
      draw3();
      step4(dt);
      if (s4dirty) { draw4(); s4dirty = false; }
    });
    loop.start();

    return {
      pause() {
        loop.stop();
        stopPlay3();
        runOn = false;
        runBtn.classList.remove('active');
        bus.mute();
      },
      resume() {
        bus.unmute();
        s1dirty = true;
        s4dirty = true;
        loop.start();
      },
      destroy() {
        loop.stop();
        stopPlay3();
        if (vx) { vx.dispose(); vy.dispose(); vx = vy = null; }
        bus.dispose();
        h1.destroy(); h2.destroy(); h3.destroy(); h4.destroy();
        style.remove();
      },
    };
  },
};

/* ================= node-testable exports ================= */

export const _test = {
  meter2,
  anthyphairesis,
  cfOfRatio,
  sqrt2Terms,
  sdValue,
  fmtSD,
  cutSteps,
  pellPairs,
  convergents,
};
