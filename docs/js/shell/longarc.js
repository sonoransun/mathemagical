// shell/longarc.js — "The Long Arc": every chronicle event of every exhibit on
// one time axis from 45,000 years before present to 2026, one lane per
// movement (plus an unpigmented lane for the coda, whose dates belong to no
// movement), each dot a link to its exhibit. It also exports the scale the
// per-exhibit chronicle locators use, so both share one geometry.
//
// The scale is logarithmic in years-before-2026, softened by K years so the
// recent end does not explode: pos = 1 − (ln(2026 − y + K) − ln K) / (ln(2026 − y₀ + K) − ln K).
// With K = 6 the 20th and 21st centuries get about a third of the width (most
// of the essay's dates live there), and 45,000 years of antiquity still keep a
// third of their own. Events that land on the same spot are stacked across
// their lane, like beads, so none hides another.

export const ARC_NOW = 2026;
export const ARC_START = -43050;                  // 45,000 BP (BP counts back from 1950)
const ARC_END = ARC_NOW + 1;                      // the arc runs to the end of 2026
const K = 6;
const f = (year) => Math.log(ARC_END - year + K);
const F0 = f(ARC_END), F1 = f(ARC_START);

// 0 = 45,000 BP (left or top) … 1 = the end of 2026 (right or bottom)
export function arcPos(year) {
  const y = Math.min(ARC_END, Math.max(ARC_START, Number(year) || 0));
  return 1 - (f(y) - F0) / (F1 - F0);
}

// When in its year an event falls, read from its display date ("9 June 2026",
// "October 2025"), so that events of one year line up in order on the arc and
// under the arrow keys. A year with no month sits mid-year; BCE years and
// centuries are used as given.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
export function arcWhen(e) {
  const y = Number(e && e.year);
  if (!Number.isFinite(y)) return 0;
  if (y < 1000) return y;
  const d = String((e && e.date) || '').toLowerCase();
  if (!d.includes(String(y))) return y + 0.5;
  const m = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(d));
  if (m < 0) return y + 0.5;
  const day = d.match(new RegExp(`\\b(\\d{1,2})\\s+${MONTHS[m]}\\b`));
  return y + (m + (day ? (Number(day[1]) - 1) / 31 : 0.5)) / 12;
}

export const ARC_TICKS = [
  { year: -38050, label: '40,000 BP' }, { year: -18050, label: '20,000 BP', minor: true },
  { year: -8000, label: '8000 BCE', minor: true }, { year: -3000, label: '3000 BCE' },
  { year: 1, label: '1 CE' },
  { year: 1000, label: '1000', minor: true }, { year: 1500, label: '1500' },
  { year: 1800, label: '1800' }, { year: 1900, label: '1900', minor: true },
  { year: 1950, label: '1950' }, { year: 2000, label: '2000' }, { year: 2026, label: '2026' },
];

const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// events: [{ year, date, text, id, title, movement, n? }]
export function buildLongArc(host, events, { numerals = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }, lanes: laneIds = null } = {}) {
  host.classList.add('long-arc');
  host.innerHTML = `
    <div class="arc-plot" role="group" aria-label="Timeline from 45,000 years before present to 2026. Use the arrow keys to move between events.">
      <div class="arc-axis" aria-hidden="true">${ARC_TICKS.map((t) =>
        `<span class="arc-tick${t.minor ? ' minor' : ''}" style="--x:${arcPos(t.year).toFixed(4)}"><i>${t.label}</i></span>`).join('')}</div>
      <ol class="arc-lanes"></ol>
    </div>
    <div class="arc-card"></div>`;
  const lanes = host.querySelector('.arc-lanes');
  const card = host.querySelector('.arc-card');
  const plot = host.querySelector('.arc-plot');
  const byMv = new Map();
  // every movement keeps its lane, even before its chronicles are written
  for (const m of laneIds || []) byMv.set(m, []);
  for (const e of [...events].sort((a, b) => arcWhen(a) - arcWhen(b))) {
    if (!byMv.has(e.movement)) byMv.set(e.movement, []);
    byMv.get(e.movement).push(e);
  }
  const links = [];
  const laneEls = [];
  for (const [mv, list] of [...byMv].sort((a, b) => a[0] - b[0])) {
    const lane = document.createElement('li');
    lane.className = 'arc-lane';
    lane.dataset.movement = mv;
    if (!list.length) lane.classList.add('is-empty');
    lane.innerHTML = `<span class="arc-lane-label" aria-hidden="true">${numerals[mv] || mv}</span><ol></ol>`;
    const ol = lane.querySelector('ol');
    const items = [];
    for (const e of list) {
      const li = document.createElement('li');
      const x = arcPos(arcWhen(e));
      li.style.setProperty('--x', x.toFixed(4));
      const a = document.createElement('a');
      a.className = 'arc-dot';
      a.href = `#ex-${e.id}`;
      a.tabIndex = -1;
      a.setAttribute('aria-label', `${strip(e.date)}: ${strip(e.text)} (${e.title})`);
      a._ev = e;
      li.appendChild(a); ol.appendChild(li); links.push(a);
      items.push({ li, x });
    }
    lanes.appendChild(lane);
    laneEls.push({ lane, items });
  }

  // Beads: along each lane, a dot that would sit within one bead of another
  // steps sideways across the lane (0, +1, −1, +2, …), so coincident dates
  // stay visible and reachable. Recomputed whenever the plot changes size.
  const ORDER = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
  function swarm(len, vertical) {
    // across a lane: 7 px between bead centres, a little less in narrow columns
    const across = vertical ? lanes.clientWidth / Math.max(1, laneEls.length) : Infinity;
    const step = Math.max(5, Math.min(7, Math.floor(across / 7))), gap = 8;
    for (const { lane, items } of laneEls) {
      const last = new Map();
      let deepest = 0;
      for (const it of items) {                          // items are in time order
        const px = it.x * len;
        let k = ORDER.find((j) => !last.has(j) || px - last.get(j) >= gap);
        if (k === undefined) k = ORDER.reduce((a, b) => (last.get(a) <= last.get(b) ? a : b));
        last.set(k, px);
        deepest = Math.max(deepest, Math.abs(k));
        it.li.style.setProperty('--dy', String(k * step));
      }
      if (vertical) lane.style.removeProperty('--lane-h');
      else lane.style.setProperty('--lane-h', `${Math.max(44, (2 * deepest + 1) * step + 22)}px`);
    }
  }
  links.sort((p, q) => arcWhen(p._ev) - arcWhen(q._ev) || p._ev.movement - q._ev.movement);
  if (links.length) links[0].tabIndex = 0;               // roving tabindex: one stop, arrows move

  let cur = -1;
  function show(i, focus = false) {
    if (i < 0 || i >= links.length) return;
    if (cur >= 0) { links[cur].classList.remove('is-current'); links[cur].tabIndex = -1; }
    cur = i;
    const a = links[i], e = a._ev;
    a.classList.add('is-current'); a.tabIndex = 0;
    if (focus) a.focus();
    card.dataset.movement = e.movement;
    card.innerHTML = `<span class="arc-card-date">${e.date}</span>
      <span class="arc-card-text">${e.text}</span>
      <a class="arc-card-go" href="#ex-${e.id}">${e.n ? `${e.n} · ` : ''}${e.title}</a>
      <span class="arc-card-count" aria-hidden="true">${i + 1} of ${links.length}</span>`;
  }

  // pointer: the nearest event wins, so crowded modern dots stay reachable.
  // Centres are cached per hover session instead of measured on every move.
  let centres = null;
  const measure = () => {
    centres = links.map((a) => { const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  };
  plot.addEventListener('pointerenter', measure);
  plot.addEventListener('pointerleave', () => { centres = null; });
  plot.addEventListener('pointermove', (ev) => {
    if (!centres) measure();
    const vertical = host.classList.contains('is-vertical');
    let best = -1, bd = Infinity;
    for (let i = 0; i < centres.length; i++) {
      const [cx, cy] = centres[i];
      const d = vertical ? Math.abs(cy - ev.clientY) + 0.25 * Math.abs(cx - ev.clientX)
                         : Math.abs(cx - ev.clientX) + 0.25 * Math.abs(cy - ev.clientY);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && best !== cur) show(best);
  });
  host.addEventListener('scroll', () => { centres = null; }, { passive: true, capture: true });
  window.addEventListener('scroll', () => { centres = null; }, { passive: true });
  host.addEventListener('keydown', (ev) => {
    if (!ev.target.classList || !ev.target.classList.contains('arc-dot')) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (step) { ev.preventDefault(); show(Math.max(0, Math.min(links.length - 1, cur + step)), true); }
    if (ev.key === 'Home') { ev.preventDefault(); show(0, true); }
    if (ev.key === 'End') { ev.preventDefault(); show(links.length - 1, true); }
  });
  host.addEventListener('focusin', (ev) => {
    const i = links.indexOf(ev.target);
    if (i >= 0 && i !== cur) show(i);
  });

  // narrow containers: time runs downward and the lanes become columns
  host.style.setProperty('--lanes', Math.max(1, byMv.size));
  let lastLen = -1, lastVertical = null;
  const setMode = (w) => {
    const vertical = w < 560;
    host.classList.toggle('is-vertical', vertical);
    centres = null;
    const len = vertical ? lanes.clientHeight : lanes.clientWidth;
    if (len > 0 && (len !== lastLen || vertical !== lastVertical)) {
      lastLen = len; lastVertical = vertical;
      swarm(len, vertical);
    }
  };
  const ro = new ResizeObserver(([e]) => setMode(e.contentRect.width));
  ro.observe(host);
  setMode(host.clientWidth || 1000);
  show(0);
  return { show, count: links.length, destroy() { ro.disconnect(); } };
}
