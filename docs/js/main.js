// main.js — boot: build the essay from the manifest, lazily init exhibits,
// run the navigation rail, the sound toggle, and the overture's One Question.

import * as canvas from './core/canvas.js';
import * as audio from './core/audio.js';
import * as math from './core/math.js';
import * as ui from './core/ui.js';
import { site, movements, interludes, footer } from './content.js';
import { MANIFEST } from './manifest.js';

const core = { canvas, audio, math, ui };

const QUESTION_KEY = 'mathemagical:one-question';
const SOUND_KEY = 'mathemagical:sound';

const essay = document.getElementById('essay');
const rail = document.getElementById('rail');

// ---------- overture ----------

function buildOverture() {
  const sec = document.createElement('section');
  sec.className = 'overture';
  sec.id = 'overture';
  sec.innerHTML = `
    <h1 class="site-title">Math<span class="glyph">ε</span>magical</h1>
    <p class="site-sub">${site.subtitle}</p>
    <div class="one-question">
      <div class="oq-prompt">Mathematics — invented or discovered?</div>
      <input type="range" id="oq-slider" min="0" max="1" step="0.01" value="0.5" aria-label="invented or discovered">
      <div class="oq-labels"><span>invented</span><span>discovered</span></div>
      <div class="oq-note">Answer however you like. This will not be mentioned again.</div>
    </div>
    <div class="scroll-hint">▽</div>
  `;
  essay.appendChild(sec);
  const sliderEl = sec.querySelector('#oq-slider');
  const saved = localStorage.getItem(QUESTION_KEY);
  if (saved !== null) sliderEl.value = saved;
  sliderEl.addEventListener('input', () => {
    localStorage.setItem(QUESTION_KEY, sliderEl.value);
  });
  // First interaction also stores the default if untouched-but-scrolled-past:
  // the coda treats "no stored answer" honestly, so nothing else needed.
  return sec;
}

// ---------- page structure ----------

const sections = [];         // { entry, sec, stage, instance, inited }

function buildMovementIntro(m) {
  const info = movements[m];
  const sec = document.createElement('section');
  sec.className = 'movement-intro';
  sec.id = `movement-${m}`;
  sec.innerHTML = `
    <div class="movement-numeral">${info.numeral}</div>
    <h2>${info.title}</h2>
    <p class="movement-epigraph">${info.epigraph}</p>
    <div class="movement-lede">${info.lede}</div>
  `;
  essay.appendChild(sec);
  return sec;
}

function buildExhibitSection(entry, numberInMovement) {
  const info = movements[entry.movement];
  const sec = document.createElement('section');
  sec.className = 'exhibit placeholder';
  sec.id = `ex-${entry.id}`;
  sec.dataset.movement = entry.movement;
  sec.innerHTML = `
    <header class="exhibit-header">
      <div class="exhibit-number">${info.numeral} · ${numberInMovement}</div>
      <h3 class="exhibit-title">${entry.title}</h3>
      <p class="exhibit-hook">${entry.hook}</p>
    </header>
    <div class="exhibit-prose"></div>
    <div class="exhibit-stage"></div>
  `;
  essay.appendChild(sec);
  return sec;
}

function buildInterlude(afterId) {
  const html = interludes[afterId];
  if (!html) return;
  const aside = document.createElement('aside');
  aside.className = 'interlude';
  aside.innerHTML = html;
  essay.appendChild(aside);
}

function buildFooter() {
  const f = document.createElement('footer');
  f.className = 'site-footer';
  f.innerHTML = footer;
  essay.appendChild(f);
}

// ---------- module loading & lifecycle ----------

async function loadExhibit(record) {
  const { entry, sec } = record;
  try {
    const mod = (await import(entry.path)).default;
    record.module = mod;
    sec.classList.remove('placeholder');
    if (mod.title) sec.querySelector('.exhibit-title').textContent = mod.title;
    if (mod.hook) sec.querySelector('.exhibit-hook').textContent = mod.hook;
    sec.querySelector('.exhibit-prose').innerHTML = mod.prose || '';
  } catch (err) {
    record.module = null;
    sec.querySelector('.exhibit-stage').textContent =
      'This exhibit is still being carved. (' + entry.path.split('/').pop() + ')';
    console.warn(`[mathemagical] exhibit "${entry.id}" not loaded:`, err.message);
  }
}

function initExhibit(record) {
  if (record.inited || !record.module) return;
  record.inited = true;
  try {
    record.instance = record.module.init(record.stage, core) || {};
  } catch (err) {
    record.instance = {};
    console.error(`[mathemagical] exhibit "${record.entry.id}" failed to init:`, err);
  }
}

// ---------- rail navigation ----------

function buildRail(anchors) {
  for (const a of anchors) {
    const dot = document.createElement('a');
    dot.className = 'rail-dot' + (a.movementMark ? ' movement-mark' : '');
    dot.href = `#${a.id}`;
    dot.title = a.label;
    dot.setAttribute('aria-label', a.label);
    rail.appendChild(dot);
    a.dot = dot;
  }
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const a = anchors.find((x) => x.el === e.target);
      if (a && e.isIntersecting) {
        anchors.forEach((x) => x.dot.classList.toggle('active', x === a));
      }
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  anchors.forEach((a) => spy.observe(a.el));

  // sound toggle
  const snd = document.createElement('button');
  snd.className = 'rail-sound';
  snd.title = 'sound on/off';
  const setIcon = () => {
    const on = audio.isEnabled();
    snd.textContent = on ? '♪' : '∅';
    snd.classList.toggle('muted', !on);
  };
  snd.addEventListener('click', () => {
    audio.ensureAudio();
    audio.setSoundEnabled(!audio.isEnabled());
    localStorage.setItem(SOUND_KEY, audio.isEnabled() ? '1' : '0');
    setIcon();
  });
  rail.appendChild(snd);
  setIcon();
}

// ---------- boot ----------

async function boot() {
  // restore sound preference before any audio node exists
  if (localStorage.getItem(SOUND_KEY) === '0') audio.setSoundEnabled(false);

  buildOverture();

  const anchors = [{ id: 'overture', el: essay.querySelector('#overture'), label: 'Overture', movementMark: true }];
  let currentMovement = 0;
  const counts = {};
  for (const entry of MANIFEST) {
    if (entry.movement !== currentMovement) {
      currentMovement = entry.movement;
      const intro = buildMovementIntro(currentMovement);
      anchors.push({
        id: `movement-${currentMovement}`, el: intro,
        label: `${movements[currentMovement].numeral} · ${movements[currentMovement].title}`,
        movementMark: true,
      });
    }
    counts[entry.movement] = (counts[entry.movement] || 0) + 1;
    const sec = buildExhibitSection(entry, counts[entry.movement]);
    sections.push({ entry, sec, stage: sec.querySelector('.exhibit-stage'), instance: null, inited: false });
    anchors.push({ id: `ex-${entry.id}`, el: sec, label: entry.title });
    buildInterlude(entry.id);
  }
  buildFooter();
  buildRail(anchors);

  // load all modules in parallel (missing ones become placeholders)
  await Promise.all(sections.map(loadExhibit));

  // lazy init when approaching viewport; pause/resume around visibility
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
      if (!rec || !rec.inited || !rec.instance) continue;
      if (e.isIntersecting) rec.instance.resume && rec.instance.resume();
      else rec.instance.pause && rec.instance.pause();
    }
  }, { rootMargin: '200px 0px' });

  for (const rec of sections) { initObs.observe(rec.sec); visObs.observe(rec.sec); }

  // resume the (possibly suspended) AudioContext on first gesture anywhere
  const gesture = () => { audio.ensureAudio(); };
  window.addEventListener('pointerdown', gesture, { once: true });
  window.addEventListener('keydown', gesture, { once: true });

  // debug/verification hook: force-init an exhibit regardless of scroll state
  window.__mm = {
    core, sections,
    forceInit(id) {
      const rec = sections.find((r) => r.entry.id === id);
      if (rec) initExhibit(rec);
      return rec ? { inited: rec.inited, hasModule: !!rec.module } : null;
    },
    tick(n = 1, dt = 0.016) { for (let i = 0; i < n; i++) canvas.tickAll(dt); },
  };
}

boot();
