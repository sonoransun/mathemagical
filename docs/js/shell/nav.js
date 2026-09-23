// shell/nav.js — rail labels, the contents dialog, the reading-progress hairline.

// ---------- reading progress ----------
// A CSS scroll timeline does the work where supported; the fallback costs one
// animation frame per scroll event, and nothing at all while the page is still.
export function mountProgress() {
  const bar = document.createElement('div');
  bar.className = 'progress-hairline';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  if (window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()')) return bar;
  let queued = 0;
  const update = () => {
    queued = 0;
    const h = document.documentElement;
    const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p)).toFixed(4)})`;
  };
  addEventListener('scroll', () => { if (!queued) queued = requestAnimationFrame(update); }, { passive: true });
  update();
  return bar;
}

// Tint everything that reads --mv-now (hairline, active rail dot) by movement.
let lastMv = null;
export function setCurrentMovement(m) {
  const v = m >= 1 && m <= 4 ? m : 1;
  if (v === lastMv) return;
  lastMv = v;
  document.documentElement.style.setProperty('--mv-now', `var(--mv-${v})`);
  document.documentElement.dataset.movement = String(v);
}

// ---------- rail labels ----------
// Each dot becomes a 28×18 target: the visible dot is drawn by ::before and
// its label by ::after (from data-label), shown on hover and keyboard focus.
// Native title tooltips are dropped so hover never shows two labels.
export function upgradeRail(rail) {
  const dots = rail.querySelectorAll('.rail-dot');
  for (const a of dots) {
    a.dataset.label = a.getAttribute('aria-label') || a.title || '';
    a.removeAttribute('title');
  }
  rail.style.setProperty('--rail-n', dots.length);
  const snd = rail.querySelector('.rail-sound');
  if (snd) {
    snd.removeAttribute('title');
    snd.setAttribute('aria-label', 'Sound');
    snd.dataset.label = 'Sound';
    const sync = () => {
      const on = !snd.classList.contains('muted');
      snd.setAttribute('aria-pressed', String(on));
      snd.dataset.label = on ? 'Sound is on' : 'Sound is off';
    };
    new MutationObserver(sync).observe(snd, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
}

// ---------- contents dialog ----------
// tree: [{ movement, id, numeral, title, exhibits: [{ id, n, title, era }] }]
// extras: [{ href, label, cls }] appended after the movements (coda, Long Arc, colophon)
// sound: { isOn(), toggle() } mirrors the rail's sound button inside the dialog,
// which is the only sound control on phones (the rail is hidden there).
export function mountContents(tree, { rail, current = () => location.hash.slice(1), extras = [], sound = null, go = null } = {}) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dlg = document.createElement('dialog');
  dlg.className = 'toc';
  dlg.setAttribute('aria-labelledby', 'toc-title');
  dlg.innerHTML = `
    <header class="toc-head">
      <h2 id="toc-title">Contents</h2>
      <div class="toc-tools">
        ${sound ? '<button class="toc-sound toggle-pill" type="button" role="switch" aria-checked="true"><span class="pill" aria-hidden="true"></span><span>sound</span></button>' : ''}
        <button class="toc-close btn small" type="button" aria-label="Close contents">close</button>
      </div>
    </header>
    <nav aria-label="Table of contents">
      <ol class="toc-movements">${tree.map((m) => `
        <li class="toc-mv" data-movement="${m.movement}">
          <a class="toc-mv-link" href="#${m.id}"><span class="toc-numeral">${esc(m.numeral)}</span><span class="toc-mv-title">${esc(m.title)}</span></a>
          <ol class="toc-ex">${m.exhibits.map((x) => `
            <li><a href="#ex-${x.id}"><span class="toc-n">${x.n}</span><span class="toc-t">${esc(x.title)}</span>${x.era ? `<span class="toc-era">${esc(x.era)}</span>` : ''}</a></li>`).join('')}
          </ol></li>`).join('')}
      </ol>
      ${extras.length ? `<ol class="toc-extras">${extras.map((x) =>
        `<li><a class="${x.cls || ''}" href="${x.href}">${x.label}</a></li>`).join('')}</ol>` : ''}
    </nav>`;
  document.body.appendChild(dlg);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { dlg.close(); return; }            // a click on the backdrop
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    dlg.close();
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (!target) return;
    try { history.replaceState(null, '', a.getAttribute('href')); } catch { /* file:// */ }
    if (go) { go(target); return; }
    target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
  dlg.querySelector('.toc-close').addEventListener('click', () => dlg.close());

  const sndBtn = dlg.querySelector('.toc-sound');
  const syncSound = () => {
    if (!sndBtn) return;
    const on = !!sound.isOn();
    sndBtn.classList.toggle('on', on);
    sndBtn.setAttribute('aria-checked', String(on));
  };
  if (sndBtn) sndBtn.addEventListener('click', () => { sound.toggle(); syncSound(); });

  const open = () => {
    dlg.querySelectorAll('a[aria-current]').forEach((x) => x.removeAttribute('aria-current'));
    const id = current();
    const cur = id && [...dlg.querySelectorAll('a[href^="#"]')].find((x) => x.getAttribute('href') === '#' + id);
    if (cur) cur.setAttribute('aria-current', 'location');
    syncSound();
    dlg.showModal();
    // start where the reader is: focus the current entry (or the close button)
    (cur || dlg.querySelector('.toc-close')).focus({ preventScroll: true });
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  };

  // triggers: a rail button on wide screens, a floating button on narrow ones
  const mk = (cls, label) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-haspopup', 'dialog');
    b.dataset.label = label;
    b.addEventListener('click', open);
    return b;
  };
  if (rail) rail.prepend(mk('rail-toc', 'Contents'));
  document.body.appendChild(mk('toc-fab', 'Contents'));
  // On a phone the floating button sits over the right edge of the text. It steps
  // aside while the reader scrolls down, and comes back on the way up, at the foot
  // of the page, or when the keyboard reaches it (CSS: html.fab-tucked).
  const narrow = matchMedia('(max-width: 700px)');
  let lastY = scrollY, tuckQueued = 0;
  const tuck = () => {
    tuckQueued = 0;
    const root = document.documentElement, y = scrollY, dy = y - lastY;
    if (!narrow.matches) { lastY = y; root.classList.remove('fab-tucked'); return; }
    if (Math.abs(dy) < 8) return;                               // let small jitters accumulate
    lastY = y;
    const atFoot = y + innerHeight >= root.scrollHeight - 48;
    root.classList.toggle('fab-tucked', dy > 0 && !atFoot);
  };
  addEventListener('scroll', () => { if (!tuckQueued) tuckQueued = requestAnimationFrame(tuck); }, { passive: true });
  // the floating button stays out of the overture's composition
  const ov = document.getElementById('overture');
  if (ov) {
    new IntersectionObserver(([e]) =>
      document.documentElement.classList.toggle('past-overture', !e.isIntersecting)).observe(ov);
  }
  return { open, dialog: dlg, syncSound };
}
