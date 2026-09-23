// main.js — boot: build the essay from the manifest, lazily init exhibits,
// run the navigation rail, the sound toggle and the overture's One Question,
// and install the "Illumination" layer (sky, ornaments, backdrops, apparatus,
// the Long Arc, the contents dialog). See design/CONTRACT.md, "CONTRACT v2".

import * as canvas from './core/canvas.js';
import * as audio from './core/audio.js';
import * as math from './core/math.js';
import * as ui from './core/ui.js';
import * as content from './content.js';
import { MANIFEST } from './manifest.js';
import { installOrnaments, buildEmblem, installInitialArt } from './shell/ornament.js';
import { originsBackdrop, resonanceBackdrop, horizonBackdrop, enginesBackdrop, mountBackdrop } from './shell/backdrops.js';
import { mountSky } from './shell/sky.js';
import { renderEra, renderApparatus } from './shell/apparatus.js';
import { buildLongArc } from './shell/longarc.js';
import { mountProgress, upgradeRail, mountContents, setCurrentMovement } from './shell/nav.js';
import { typeset } from './shell/typeset.js';

const core = { canvas, audio, math, ui };

const QUESTION_KEY = 'mathemagical:one-question';
const SOUND_KEY = 'mathemagical:sound';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const essay = document.getElementById('essay');
const rail = document.getElementById('rail');

// Storage can throw (blocked site data, some private modes): never let it break boot.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not remembered, that is all */ } },
};

// ---------- content, read defensively ----------
// content.js is shared with the narrative owner; any field may be missing.
const SITE = content.site || {};
const MOVEMENTS = content.movements || {};
const INTERLUDES = content.interludes || {};
const MOTIFS = Array.isArray(content.motifs) ? content.motifs : [];
const LONG_ARC = content.longArc || {};
const MV_FALLBACK = {
  1: { numeral: 'I', title: 'Origins' }, 2: { numeral: 'II', title: 'Resonance' },
  3: { numeral: 'III', title: 'Horizon' }, 4: { numeral: 'IV', title: 'Engines' },
};
function mvInfo(m) {
  const c = MOVEMENTS[m] || {};
  const f = MV_FALLBACK[m] || { numeral: String(m), title: `Movement ${m}` };
  return {
    numeral: c.numeral || f.numeral, title: c.title || f.title,
    epigraph: c.epigraph || '', epigraphCite: c.epigraphCite || '', lede: c.lede || '',
  };
}
const isCoda = (entry) => !!(entry.coda || entry.id === 'coda');
const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

// ---------- overture ----------

function buildOverture() {
  const sec = document.createElement('section');
  sec.className = 'overture';
  sec.id = 'overture';
  sec.setAttribute('aria-labelledby', 'site-title');
  const how = SITE.howToRead
    ? `<div class="how-to-read"><div class="how-kicker" aria-hidden="true">how to read</div>${SITE.howToRead}</div>` : '';
  sec.innerHTML = `
    <h1 class="site-title" id="site-title"><span aria-hidden="true">Math<span class="glyph">ε</span>magical</span><span class="visually-hidden">${SITE.title || 'Mathemagical'}</span></h1>
    <p class="site-sub">${SITE.subtitle || ''}</p>
    ${how}
    <div class="one-question">
      <div class="oq-prompt" id="oq-prompt">Mathematics — invented or discovered?</div>
      <input type="range" id="oq-slider" min="0" max="1" step="0.01" value="0.5" aria-labelledby="oq-prompt">
      <div class="oq-labels" aria-hidden="true"><span>invented</span><span>discovered</span></div>
      <div class="oq-note">Answer however you like. This will not be mentioned again.</div>
    </div>
    <div class="scroll-hint" aria-hidden="true">▽</div>
  `;
  try { sec.prepend(buildEmblem()); } catch (err) { console.warn('[mathemagical] emblem:', err.message); }
  essay.appendChild(sec);
  const sliderEl = sec.querySelector('#oq-slider');
  const saved = store.get(QUESTION_KEY);
  if (saved !== null) sliderEl.value = saved;
  const valueText = () => {
    const v = parseFloat(sliderEl.value);
    sliderEl.setAttribute('aria-valuetext',
      v === 0.5 ? 'exactly halfway' : `${Math.round((1 - v) * 100)}% invented, ${Math.round(v * 100)}% discovered`);
  };
  valueText();
  sliderEl.addEventListener('input', () => {
    store.set(QUESTION_KEY, sliderEl.value);
    valueText();
  });
  // The coda treats "no stored answer" honestly, so nothing else is needed.
  return sec;
}

// ---------- page structure ----------

const sections = [];         // { entry, sec, stage, instance, inited, visible, module, number }
const intros = {};           // movement -> intro section

function buildMovementIntro(m) {
  const info = mvInfo(m);
  const sec = document.createElement('section');
  sec.className = 'movement-intro';
  sec.id = `movement-${m}`;
  sec.dataset.movement = m;
  sec.setAttribute('aria-labelledby', `movement-${m}-title`);
  // "Name, rest of the citation": the name in small caps, the rest in italic.
  const citeHTML = (c) => {
    const raw = String(c).replace(/^\s*[—–-]\s*/, '');
    const i = raw.indexOf(',');
    return i > 0 && !/<[^>]+>/.test(raw.slice(0, i))
      ? `<span class="cite-name">${raw.slice(0, i)}</span><span class="cite-rest">${raw.slice(i)}</span>`
      : `<span class="cite-name">${raw}</span>`;
  };
  const cite = info.epigraphCite
    ? `<figcaption class="movement-cite"><span class="cite-dash" aria-hidden="true">— </span>${citeHTML(info.epigraphCite)}</figcaption>` : '';
  const epi = info.epigraph
    ? (cite ? `<figure class="movement-epigraph-block"><blockquote class="movement-epigraph">${info.epigraph}</blockquote>${cite}</figure>`
            : `<p class="movement-epigraph">${info.epigraph}</p>`) : '';
  sec.innerHTML = `
    <div class="movement-numeral" aria-hidden="true">${info.numeral}</div>
    <h2 id="movement-${m}-title"><span class="visually-hidden">Movement ${info.numeral}: </span>${info.title}</h2>
    <div class="fleuron-rule" aria-hidden="true"></div>
    ${epi}
    <div class="movement-lede">${info.lede}</div>
    <p class="backdrop-caption" hidden></p>
  `;
  essay.appendChild(sec);
  intros[m] = sec;
  return sec;
}

function buildExhibitSection(entry, number, n) {
  const sec = document.createElement('section');
  sec.className = 'exhibit placeholder' + (isCoda(entry) ? ' is-coda' : '');
  sec.id = `ex-${entry.id}`;
  sec.dataset.movement = entry.movement;
  sec.setAttribute('aria-labelledby', `ex-${entry.id}-title`);
  sec.innerHTML = `
    <header class="exhibit-header">
      <div class="exhibit-kicker"><span class="exhibit-number">${number}</span></div>
      <h3 class="exhibit-title" id="ex-${entry.id}-title"></h3>
      <p class="exhibit-hook"></p>
    </header>
    <div class="exhibit-prose"></div>
    <div class="exhibit-stage"></div>
  `;
  sec.querySelector('.exhibit-title').textContent = entry.title || entry.id;
  sec.querySelector('.exhibit-hook').textContent = entry.hook || '';
  if (!entry.bare && !isCoda(entry)) {
    sec.querySelector('.exhibit-stage').dataset.plate = `plate ${mvInfo(entry.movement).numeral}·${n}`;
  }
  essay.appendChild(sec);
  return sec;
}

function buildInterlude(afterId) {
  const html = INTERLUDES[afterId];
  if (!html) return;
  const aside = document.createElement('aside');
  aside.className = 'interlude';
  aside.setAttribute('aria-label', 'Interlude');
  aside.innerHTML = html;
  essay.appendChild(aside);
}

// Back matter: set apart from the coda by a fleuron rule, so the coda's last
// line stays the essay's emotional end. In book order: the notes to the coda,
// then the Long Arc (both in <main>), then the colophon and the footer note,
// which close the page in a <footer>.
function buildBackMatter() {
  const rule = h('div', 'fleuron-rule back-rule');
  rule.setAttribute('aria-hidden', 'true');
  essay.appendChild(rule);
  const kicker = h('p', 'back-kicker', 'back matter');
  kicker.setAttribute('aria-hidden', 'true');
  essay.appendChild(kicker);

  const notes = h('section', 'coda-notes');
  notes.id = 'coda-notes';
  notes.hidden = true;                                 // the coda's apparatus, as endnotes
  notes.setAttribute('aria-labelledby', 'coda-notes-title');
  notes.innerHTML = '<h2 class="back-title" id="coda-notes-title">Notes to the coda</h2>';
  essay.appendChild(notes);

  const f = document.createElement('footer');
  f.className = 'site-footer';
  if (content.colophon) {
    f.innerHTML = `
      <section class="colophon" id="colophon" aria-labelledby="colophon-title">
        <h2 class="back-title" id="colophon-title">Colophon</h2>
        <div class="colophon-body">${content.colophon}</div>
      </section>
      <div class="fleuron-rule" aria-hidden="true"></div>`;
  }
  if (content.footer) f.appendChild(h('div', 'footer-note', content.footer));
  essay.after(f);
  return { rule, notes, footer: f };
}

// The Long Arc exists only when some exhibit has a chronicle: no empty boxes.
function buildLongArcSection(after) {
  const arc = h('section', 'long-arc-section');
  arc.id = 'long-arc';
  arc.setAttribute('aria-labelledby', 'long-arc-title');
  arc.innerHTML = `
    <h2 id="long-arc-title">${LONG_ARC.title || 'The Long Arc'}</h2>
    ${LONG_ARC.lede ? `<p class="long-arc-lede">${LONG_ARC.lede}</p>` : ''}
    <div class="long-arc-host"></div>`;
  after.after(arc);
  return arc;
}

// ---------- module loading & lifecycle ----------

async function loadExhibit(record) {
  const { entry, sec } = record;
  try {
    const mod = (await import(entry.path)).default;
    if (!mod || typeof mod.init !== 'function') throw new Error('module has no init()');
    record.module = mod;
    sec.classList.remove('placeholder');
    if (mod.title) sec.querySelector('.exhibit-title').textContent = mod.title;
    if (mod.hook) sec.querySelector('.exhibit-hook').textContent = mod.hook;
    const prose = sec.querySelector('.exhibit-prose');
    prose.innerHTML = mod.prose || '';
    typeset(prose);
    renderEra(sec, mod);
    typeset(sec.querySelector('.exhibit-header'));      // title, hook and era: quotes and dashes
  } catch (err) {
    record.module = null;
    record.stage.textContent =
      'This exhibit is still being carved. (' + entry.path.split('/').pop() + ')';
    console.warn(`[mathemagical] exhibit "${entry.id}" not loaded:`, err.message);
  }
}

// Stage canvases are figures: give each an accessible name unless the
// exhibit already named it.
function labelCanvases(record) {
  const mod = record.module || {};
  const title = mod.title || record.entry.title || record.entry.id;
  const alt = typeof mod.alt === 'string' && mod.alt.trim()
    ? mod.alt.trim() : `${title}: an interactive figure; its controls follow.`;
  const cs = [...record.stage.querySelectorAll('canvas')];
  cs.forEach((c, i) => {
    if (c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby') || c.getAttribute('aria-hidden') === 'true') return;
    if (!c.hasAttribute('role')) c.setAttribute('role', 'img');
    c.setAttribute('aria-label', i === 0 ? alt : `${title}, panel ${i + 1}`);
  });
}

function initExhibit(record, { forced = false } = {}) {
  if (record.inited || !record.module) return;
  record.inited = true;
  try {
    record.instance = record.module.init(record.stage, core) || {};
  } catch (err) {
    record.instance = {};
    console.error(`[mathemagical] exhibit "${record.entry.id}" failed to init:`, err);
  }
  labelCanvases(record);
  setTimeout(() => labelCanvases(record), 1500);     // canvases some exhibits add a beat later
  // Exhibits are initialised up to 600px early, but only run within 200px of
  // the viewport. The visibility observer already reported "not visible" for
  // this section before it was initialised, so pause it now or it would run
  // unseen until it had scrolled in and out again.
  if (!forced && !record.visible && record.instance && record.instance.pause) {
    try { record.instance.pause(); } catch (err) { console.warn(`[mathemagical] exhibit "${record.entry.id}" pause:`, err.message); }
  }
}

// ---------- in-page navigation ----------
// Smooth scrolling lives here, not in CSS: a CSS scroll-behavior would make
// every programmatic jump (deep links, tooling) crawl across a 60,000-pixel
// page while exhibits above it grow. Long hops jump most of the way at once.
function glideTo(target, { focus = true } = {}) {
  const dist = target.getBoundingClientRect().top;
  if (!REDUCED && Math.abs(dist) > innerHeight * 2.5) {
    window.scrollBy({ top: dist - Math.sign(dist) * innerHeight * 0.75, behavior: 'instant' });
  }
  target.scrollIntoView({ behavior: REDUCED ? 'instant' : 'smooth', block: 'start' });
  if (focus) {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a || a.closest('dialog')) return;
  let id = '';
  try { id = decodeURIComponent(a.getAttribute('href').slice(1)); } catch { return; }
  const target = id && document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  try { history.pushState(null, '', '#' + id); } catch { /* file:// or sandboxed */ }
  glideTo(target);
});

// ---------- sound ----------

const sound = {
  btn: null,
  isOn: () => audio.isEnabled(),
  sync() {
    if (!this.btn) return;
    const on = audio.isEnabled();
    this.btn.textContent = on ? '♪' : '∅';
    this.btn.classList.toggle('muted', !on);
  },
  toggle() {
    audio.ensureAudio();
    audio.setSoundEnabled(!audio.isEnabled());
    store.set(SOUND_KEY, audio.isEnabled() ? '1' : '0');
    this.sync();
  },
};

// ---------- rail navigation ----------

let activeId = 'overture';
let railSpy = null;
let railAnchors = [];

function makeDot(a) {
  const dot = document.createElement('a');
  dot.className = 'rail-dot' + (a.movementMark ? ' movement-mark' : '');
  dot.href = `#${a.id}`;
  dot.setAttribute('aria-label', a.label);
  a.dot = dot;
  return dot;
}

// An anchor that exists only after the modules load (the Long Arc).
function addRailAnchor(a) {
  const dot = makeDot(a);
  dot.dataset.label = a.label;
  const snd = rail.querySelector('.rail-sound');
  rail.insertBefore(dot, snd);
  railAnchors.push(a);
  rail.style.setProperty('--rail-n', rail.querySelectorAll('.rail-dot').length);
  if (railSpy) railSpy.observe(a.el);
}

function buildRail(anchors) {
  railAnchors = anchors;
  for (const a of anchors) rail.appendChild(makeDot(a));
  // The current anchor is the last one whose top has passed 45% of the
  // viewport. The observer only says *when* to look, so a long jump (a deep
  // link, the contents dialog) still lands on the right entry.
  let spyQueued = false;
  const settle = () => {
    spyQueued = false;
    const y = innerHeight * 0.45;
    let a = railAnchors[0];
    for (const x of railAnchors) if (x.el.isConnected && x.el.getBoundingClientRect().top <= y) a = x;
    if (!a || a.id === activeId && a.dot.classList.contains('active')) return;
    railAnchors.forEach((x) => {
      const on = x === a;
      x.dot.classList.toggle('active', on);
      if (on) x.dot.setAttribute('aria-current', 'location'); else x.dot.removeAttribute('aria-current');
    });
    activeId = a.id;
    setCurrentMovement(a.tint);
  };
  const spy = railSpy = new IntersectionObserver(() => {
    if (!spyQueued) { spyQueued = true; setTimeout(settle, 0); }
  }, { rootMargin: '-40% 0px -55% 0px' });
  anchors.forEach((a) => spy.observe(a.el));

  const snd = document.createElement('button');
  snd.type = 'button';
  snd.className = 'rail-sound';
  snd.addEventListener('click', () => sound.toggle());
  rail.appendChild(snd);
  sound.btn = snd;
  sound.sync();
  upgradeRail(rail);
}

// ---------- the illumination: backdrops and drop-cap art ----------

const backdropHandles = [];

async function installBackdrops() {
  const want = Object.keys(intros).map(Number);
  if (!want.length) return;
  const makers = { 1: originsBackdrop, 2: resonanceBackdrop, 3: horizonBackdrop, 4: enginesBackdrop };
  const bds = {};
  await Promise.all([1, 2, 3, 4].map(async (m) => {
    try { bds[m] = await makers[m](); } catch (err) {
      console.warn(`[mathemagical] backdrop ${m} skipped:`, err.message);
    }
  }));
  installInitialArt(bds);
  for (const m of want) {
    const bd = bds[m], sec = intros[m];
    if (!bd || !sec) continue;
    try {
      backdropHandles.push(mountBackdrop(sec, bd, { reduced: REDUCED || document.documentElement.classList.contains('no-reveal') }));
      const cap = sec.querySelector('.backdrop-caption');
      if (cap && bd.caption) { cap.textContent = bd.caption; cap.hidden = false; }
    } catch (err) { console.warn(`[mathemagical] backdrop ${m} not mounted:`, err.message); }
  }
}

// ---------- boot ----------

// Automation and hidden tabs: scroll timelines do not advance there (F12), so a
// driven browser (navigator.webdriver) or ?static gets the finished page:
// every reveal shown, the emblem drawn, each backdrop complete.
const STATIC = (() => {
  try {
    const q = location.search;
    return /[?&]static\b/.test(q) || (navigator.webdriver === true && !/[?&]motion\b/.test(q));
  } catch { return false; }
})();
if (STATIC) document.documentElement.classList.add('no-reveal');

async function boot() {
  // restore the sound preference before any audio node exists
  if (store.get(SOUND_KEY) === '0') audio.setSoundEnabled(false);

  const safe = (label, fn) => { try { return fn(); } catch (err) { console.warn(`[mathemagical] ${label}:`, err.message); return null; } };
  safe('sky', () => mountSky());
  safe('ornaments', () => installOrnaments());
  safe('progress', () => mountProgress());

  buildOverture();

  const anchors = [{ id: 'overture', el: essay.querySelector('#overture'), label: 'Overture', movementMark: true, tint: 1 }];
  let currentMovement = 0;
  const counts = {};
  let codaRecord = null;
  for (const entry of MANIFEST) {
    const coda = isCoda(entry);
    if (!coda && entry.movement !== currentMovement) {
      currentMovement = entry.movement;
      const info = mvInfo(currentMovement);
      const intro = buildMovementIntro(currentMovement);
      anchors.push({ id: `movement-${currentMovement}`, el: intro, label: `${info.numeral} · ${info.title}`, movementMark: true, tint: currentMovement });
    }
    let number, n = 0;
    if (coda) number = 'Coda';
    else {
      n = counts[entry.movement] = (counts[entry.movement] || 0) + 1;
      number = `${mvInfo(entry.movement).numeral} · ${n}`;
    }
    const sec = buildExhibitSection(entry, number, n);
    const record = { entry, sec, stage: sec.querySelector('.exhibit-stage'), instance: null, inited: false, number: coda ? 'Coda' : number, n };
    sections.push(record);
    if (coda) codaRecord = record;
    anchors.push({
      id: `ex-${entry.id}`, el: sec, label: coda ? `Coda · ${entry.title}` : `${number}  ${entry.title}`,
      movementMark: coda, tint: coda ? 1 : entry.movement, record,
    });
    buildInterlude(entry.id);
  }
  const back = buildBackMatter();
  buildRail(anchors);
  typeset(document.getElementById('overture'));
  for (const el of essay.querySelectorAll('.movement-intro, .interlude')) typeset(el);
  typeset(back.footer);

  // load all modules in parallel (missing ones become placeholders)
  await Promise.all(sections.map(loadExhibit));

  // rail labels and titles now that modules have refined them
  for (const a of anchors) {
    if (!a.record || !a.record.module || !a.record.module.title) continue;
    const t = a.record.module.title;
    a.label = a.record.entry && isCoda(a.record.entry) ? `Coda · ${t}` : `${a.record.number}  ${t}`;
    a.dot.setAttribute('aria-label', a.label);
    a.dot.dataset.label = a.label;
  }

  // lazy init when approaching the viewport; pause/resume around visibility
  const initObs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const rec = sections.find((r) => r.sec === e.target);
      if (rec) { initExhibit(rec); initObs.unobserve(e.target); }
    }
  }, { rootMargin: '600px 0px' });

  const visObs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const rec = sections.find((r) => r.sec === e.target);
      if (!rec) continue;
      rec.visible = e.isIntersecting;
      if (!rec.inited || !rec.instance) continue;
      try {
        if (e.isIntersecting) rec.instance.resume && rec.instance.resume();
        else rec.instance.pause && rec.instance.pause();
      } catch (err) { console.warn(`[mathemagical] exhibit "${rec.entry.id}" lifecycle:`, err.message); }
    }
  }, { rootMargin: '200px 0px' });

  for (const rec of sections) { initObs.observe(rec.sec); visObs.observe(rec.sec); }

  // resume the (possibly suspended) AudioContext on the first gesture anywhere
  const gesture = () => { audio.ensureAudio(); };
  window.addEventListener('pointerdown', gesture, { once: true });
  window.addEventListener('keydown', gesture, { once: true });

  // ---- apparatus: chronicle, where it lives now, echoes, sources ----
  const order = sections.map((r) => r.entry.id);
  const titles = {}, numbers = {};
  for (const r of sections) {
    titles[r.entry.id] = (r.module && r.module.title) || r.entry.title || r.entry.id;
    numbers[r.entry.id] = r.number;
  }
  const events = [];
  for (const r of sections) {
    const chron = r.module && Array.isArray(r.module.chronicle) ? r.module.chronicle : [];
    for (const e of chron) {
      if (!e || !Number.isFinite(e.year) || typeof e.text !== 'string') continue;
      // the coda keeps a lane of its own (5): its dates are not Movement IV's
      events.push({ ...e, date: e.date || String(e.year), id: r.entry.id, title: titles[r.entry.id],
        movement: r === codaRecord ? 5 : r.entry.movement, n: r.number });
    }
  }
  const hasArc = events.length > 0;
  const ctx = { events, motifs: MOTIFS, order, titles, numbers, hasArc };
  for (const r of sections) {
    if (!r.module) continue;
    try {
      const host = r === codaRecord ? back.notes : r.sec;
      const box = renderApparatus(r.sec, r.module, ctx, host);
      if (box) {
        typeset(box);
        if (r === codaRecord) back.notes.hidden = false;
      }
    } catch (err) { console.warn(`[mathemagical] apparatus for "${r.entry.id}":`, err.message); }
  }

  // ---- the Long Arc ----
  if (hasArc) {
    try {
      const arc = buildLongArcSection(back.notes);
      const numerals = { 5: 'Coda' };
      for (const m of [1, 2, 3, 4]) numerals[m] = mvInfo(m).numeral;
      const lanes = [...new Set(sections.filter((r) => !isCoda(r.entry)).map((r) => r.entry.movement))].sort((a, b) => a - b);
      if (events.some((e) => e.movement === 5)) lanes.push(5);
      buildLongArc(arc.querySelector('.long-arc-host'), events, { numerals, lanes });
      typeset(arc.querySelector('.long-arc-lede'));
      addRailAnchor({ id: 'long-arc', el: arc, label: LONG_ARC.title || 'The Long Arc', movementMark: true, tint: 1 });
    } catch (err) { console.warn('[mathemagical] long arc:', err.message); document.getElementById('long-arc')?.remove(); }
  }

  // ---- contents dialog ----
  try {
    const mvs = [...new Set(sections.filter((r) => !isCoda(r.entry)).map((r) => r.entry.movement))];
    const tree = mvs.map((m) => ({
      movement: m, id: `movement-${m}`, numeral: mvInfo(m).numeral, title: mvInfo(m).title,
      exhibits: sections.filter((r) => r.entry.movement === m && !isCoda(r.entry)).map((r) => ({
        id: r.entry.id, n: r.n, title: titles[r.entry.id],
        era: r.module && typeof r.module.era === 'string' ? r.module.era : '',
      })),
    }));
    const extras = [];
    const fl = '<span class="toc-numeral toc-fl" aria-hidden="true"></span>';
    if (codaRecord) extras.push({ href: `#ex-${codaRecord.entry.id}`, label: `<span class="toc-numeral">Coda</span><span class="toc-x">${titles[codaRecord.entry.id]}<span class="toc-extra-note">the question, asked again</span></span>`, cls: 'toc-coda' });
    if (hasArc) extras.push({ href: '#long-arc', label: `${fl}<span class="toc-x">${LONG_ARC.title || 'The Long Arc'}<span class="toc-extra-note">every chronicle date, on one timeline</span></span>`, cls: 'toc-arc' });
    if (content.colophon) extras.push({ href: '#colophon', label: `${fl}<span class="toc-x">Colophon<span class="toc-extra-note">a note on the making</span></span>`, cls: 'toc-colophon' });
    mountContents(tree, { rail, current: () => activeId, extras, sound, go: glideTo });
  } catch (err) { console.warn('[mathemagical] contents:', err.message); }

  // ---- arrive at a deep link now that the page has its real height ----
  if (location.hash.length > 1) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ block: 'start' });
  }

  // ---- movement backdrops and illuminated-initial art (never blocks boot) ----
  installBackdrops().catch((err) => console.warn('[mathemagical] backdrops:', err.message));

  // debug/verification hook
  window.__mm = {
    core, sections,
    forceInit(id) {
      const rec = sections.find((r) => r.entry.id === id);
      if (rec) initExhibit(rec, { forced: true });   // tooling: leave it running wherever it is
      return rec ? { inited: rec.inited, hasModule: !!rec.module } : null;
    },
    tick(n = 1, dt = 0.016) { for (let i = 0; i < n; i++) canvas.tickAll(dt); },
    // Hidden tabs and automation: scroll timelines do not advance there, so
    // show every revealed element and finish every once-only drawing now.
    static() {
      document.documentElement.classList.add('no-reveal');
      backdropHandles.forEach((b) => { try { b.finish(); } catch { /* atmosphere only */ } });
      return { backdrops: backdropHandles.length };
    },
  };
}

boot();
