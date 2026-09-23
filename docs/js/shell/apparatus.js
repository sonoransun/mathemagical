// shell/apparatus.js — renders a module's optional metadata in one house style.
//   era       → an italic rubric in the header kicker
//   chronicle → a margin timeline, with a locator strip on the Long Arc's scale
//   today     → the "where it lives now" panel (verdigris)
//   motifs    → echo chips: each links to the next exhibit sharing the motif
//   sources   → a collapsible "sources & further reading"
// Everything is optional. A module with no metadata and no motifs renders
// exactly as before: no empty boxes, no headings over nothing.

import { arcPos, arcWhen } from './longarc.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderEra(sec, mod) {
  if (!mod || typeof mod.era !== 'string' || !mod.era.trim()) return null;
  const kicker = sec.querySelector('.exhibit-kicker');
  if (!kicker) return null;
  kicker.querySelector('.era-chip')?.remove();
  const chip = el('span', 'era-chip');
  chip.textContent = mod.era;                          // plain text: dates and places only
  kicker.appendChild(chip);
  return chip;
}

// Pure: the echoes of exhibit `id`. For every motif that names it, the next
// exhibit in page order that shares the motif (wrapping round to the first),
// and the full list of sharing exhibits in page order.
export function echoesFor(id, motifs, order) {
  const out = [];
  if (!Array.isArray(motifs) || !Array.isArray(order)) return out;
  for (const m of motifs) {
    if (!m || !Array.isArray(m.ids) || !m.ids.includes(id)) continue;
    const members = order.filter((x) => m.ids.includes(x));
    if (members.length < 2) continue;
    const i = members.indexOf(id);
    if (i < 0) continue;
    out.push({ motif: m, next: members[(i + 1) % members.length], members });
  }
  return out;
}

// ctx: { events, motifs, order, titles: {id: title}, numbers: {id: 'II · 3'}, hasArc }
export function renderApparatus(sec, mod, ctx = {}, host = sec) {
  mod = mod || {};
  const id = sec.id.replace(/^ex-/, '');
  const has = {
    today: typeof mod.today === 'string' && mod.today.trim() !== '',
    chronicle: Array.isArray(mod.chronicle) && mod.chronicle.length > 0,
    sources: Array.isArray(mod.sources) && mod.sources.length > 0,
  };
  const echoes = echoesFor(id, ctx.motifs, ctx.order);
  if (!has.today && !has.chronicle && !has.sources && !echoes.length) return null;

  const box = el('div', 'exhibit-apparatus' + (has.today && has.chronicle ? ' has-both' : ''));
  const aid = sec.id;
  const titles = ctx.titles || {}, numbers = ctx.numbers || {};

  if (has.chronicle) {
    const c = el('section', 'chronicle');
    c.setAttribute('aria-labelledby', `${aid}-chron`);
    const h = el('h4', 'apparatus-title', 'chronicle');
    h.id = `${aid}-chron`;
    c.appendChild(h);
    // locator: this exhibit's events on the site-wide scale, all others as ghost pips
    const others = (ctx.events || []).filter((e) => e.id !== id)
      .map((e) => `<span class="loc-pip other" style="--x:${arcPos(arcWhen(e)).toFixed(4)}"></span>`).join('');
    const mine = mod.chronicle.filter((e) => e && Number.isFinite(e.year))
      .map((e) => `<span class="loc-pip" style="--x:${arcPos(arcWhen(e)).toFixed(4)}"></span>`).join('');
    const loc = el(ctx.hasArc ? 'a' : 'div', 'chronicle-locator');
    if (ctx.hasArc) {
      loc.href = '#long-arc';
      loc.setAttribute('aria-label', 'These dates on the Long Arc, the timeline of every chronicle in the essay');
    } else loc.setAttribute('aria-hidden', 'true');
    loc.innerHTML = `<span class="loc-track" aria-hidden="true"><span class="loc-axis"></span>${others}${mine}</span>` +
      '<span class="loc-end loc-start" aria-hidden="true">45,000 BP</span>' +
      (ctx.hasArc ? '<span class="loc-end loc-mid" aria-hidden="true">the long arc</span>' : '') +
      '<span class="loc-end loc-now" aria-hidden="true">2026</span>';
    c.appendChild(loc);
    const ol = el('ol', 'chronicle-list');
    for (const e of [...mod.chronicle].filter(Boolean).sort((a, b) => arcWhen(a) - arcWhen(b))) {
      const li = el('li');
      li.dataset.year = e.year;                          // BCE years are not valid <time datetime>
      if (e.year >= 2000) li.classList.add('is-recent');
      li.appendChild(el('span', 'chronicle-date')).textContent = e.date || String(e.year);
      li.appendChild(el('span', 'chronicle-text', e.text || ''));
      ol.appendChild(li);
    }
    c.appendChild(ol);
    box.appendChild(c);
  }

  if (has.today) {
    const t = el('aside', 'today-panel');
    t.setAttribute('aria-labelledby', `${aid}-today`);
    const h = el('h4', 'today-title', 'where it lives now <span class="today-year" aria-hidden="true">2026</span>');
    h.id = `${aid}-today`;
    t.appendChild(h);
    t.appendChild(el('div', 'today-body', mod.today));
    box.appendChild(t);
  }

  if (echoes.length) {
    const nav = el('nav', 'echoes');
    nav.setAttribute('aria-labelledby', `${aid}-echo`);
    const h = el('h4', 'apparatus-title', 'echoes <span class="echo-hint">the same idea, elsewhere in the essay</span>');
    h.id = `${aid}-echo`;
    nav.appendChild(h);
    const ul = el('ul', 'echo-list');
    for (const { motif, next, members } of echoes) {
      const li = el('li');
      const a = el('a', 'echo-chip');
      a.href = `#ex-${next}`;
      a.dataset.pigment = ['gold', 'azure', 'crimson', 'verdigris'].includes(motif.pigment) ? motif.pigment : 'gold';
      const label = strip(motif.label || motif.key || 'echo');
      const nextTitle = strip(titles[next] || next);
      const nextNum = numbers[next] ? `${numbers[next]} ` : '';
      const list = members.map((x) => strip(titles[x] || x)).join(' · ');
      a.title = `${label}${motif.note ? ' — ' + strip(motif.note) : ''}\nShared by: ${list}`;
      a.setAttribute('aria-label', `Echo, ${label}: next in ${nextTitle}`);
      const glyph = String(motif.glyph || '◆');
      const single = [...glyph].length === 1;                // a lone symbol is set a size up
      a.innerHTML = `<span class="echo-glyph${single ? ' is-single' : ''}" aria-hidden="true">${esc(glyph)}</span>` +
        `<span class="echo-label">${esc(label)}</span>` +
        `<span class="echo-next" aria-hidden="true"><span class="echo-arrow">→</span>${esc(nextNum)}<span class="echo-next-title">${esc(nextTitle)}</span></span>`;
      li.appendChild(a);
      ul.appendChild(li);
    }
    nav.appendChild(ul);
    box.appendChild(nav);
  }

  if (has.sources) {
    const d = el('details', 'sources-panel');
    const s = el('summary', null,
      `sources &amp; further reading <span class="sources-count">${mod.sources.length}</span>`);
    d.appendChild(s);
    const ol = el('ol', 'sources-list');
    for (const src of mod.sources) {
      if (!src) continue;
      const li = el('li', null, src.text || '');         // module-authored: same trust as prose
      if (typeof src.url === 'string' && /^https:\/\//.test(src.url)) {
        try {
          const a = el('a', 'source-link');
          a.href = src.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = new URL(src.url).hostname.replace(/^www\./, '');
          a.setAttribute('aria-label', `${a.textContent} (opens in a new tab)`);
          li.append(' ', a);
        } catch { /* malformed URL: keep the citation, drop the link */ }
      }
      ol.appendChild(li);
    }
    d.appendChild(ol);
    box.appendChild(d);
  }
  host.appendChild(box);
  return box;
}
