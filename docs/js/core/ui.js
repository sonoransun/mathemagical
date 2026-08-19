// core/ui.js — house-style controls & panels. All functions create DOM inside
// a parent you pass; no top-level DOM access at import time.

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// A flex row to put controls in.
export function controlRow(parent) { return el('div', 'controls', parent); }

// slider(parent, {label, min, max, step, value, format?, onInput})
// format(v) -> display string. Returns { el, input, get value, set(v, fire?) }
export function slider(parent, opts) {
  const wrap = el('div', 'ctl', parent);
  const lab = el('div', 'ctl-label', wrap);
  lab.textContent = opts.label || '';
  const input = el('input', null, wrap);
  input.type = 'range';
  input.min = opts.min; input.max = opts.max;
  input.step = opts.step ?? 'any';
  input.value = opts.value;
  const val = el('div', 'ctl-value', wrap);
  const fmt = opts.format || ((v) => String(v));
  const refresh = () => { val.textContent = fmt(parseFloat(input.value)); };
  input.addEventListener('input', () => { refresh(); opts.onInput && opts.onInput(parseFloat(input.value)); });
  refresh();
  return {
    el: wrap, input,
    get value() { return parseFloat(input.value); },
    set(v, fire = false) { input.value = v; refresh(); if (fire && opts.onInput) opts.onInput(parseFloat(input.value)); },
  };
}

export function button(parent, label, onClick, opts = {}) {
  const b = el('button', 'btn' + (opts.primary ? ' primary' : '') + (opts.small ? ' small' : ''), parent);
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// toggle(parent, {label, value, onChange}) -> { el, get value, set(v) }
export function toggle(parent, opts) {
  const wrap = el('label', 'toggle-pill' + (opts.value ? ' on' : ''), parent);
  const pill = el('span', 'pill', wrap);
  const lab = el('span', null, wrap);
  lab.textContent = opts.label || '';
  let value = !!opts.value;
  wrap.addEventListener('click', (e) => {
    e.preventDefault();
    value = !value;
    wrap.classList.toggle('on', value);
    opts.onChange && opts.onChange(value);
  });
  return {
    el: wrap,
    get value() { return value; },
    set(v) { value = !!v; wrap.classList.toggle('on', value); },
  };
}

// Integer stepper with +/- buttons.
export function stepper(parent, opts) {
  const wrapOuter = el('div', 'ctl', parent);
  const lab = el('div', 'ctl-label', wrapOuter);
  lab.textContent = opts.label || '';
  const wrap = el('div', 'stepper', wrapOuter);
  const dec = el('button', null, wrap); dec.textContent = '−';
  const val = el('span', 'stepper-val', wrap);
  const inc = el('button', null, wrap); inc.textContent = '+';
  let value = opts.value ?? opts.min ?? 0;
  const lo = opts.min ?? -Infinity, hi = opts.max ?? Infinity;
  const fmt = opts.format || ((v) => String(v));
  const refresh = () => { val.textContent = fmt(value); };
  const change = (d) => {
    const nv = Math.min(hi, Math.max(lo, value + d));
    if (nv === value) return;
    value = nv; refresh();
    opts.onChange && opts.onChange(value);
  };
  dec.addEventListener('click', () => change(-(opts.step ?? 1)));
  inc.addEventListener('click', () => change(opts.step ?? 1));
  refresh();
  return {
    el: wrapOuter,
    get value() { return value; },
    set(v, fire = false) { value = Math.min(hi, Math.max(lo, v)); refresh(); if (fire && opts.onChange) opts.onChange(value); },
  };
}

// select(parent, {label, options: [{value, label}]|string[], value, onChange})
export function select(parent, opts) {
  const wrap = el('div', 'ctl', parent);
  const lab = el('div', 'ctl-label', wrap);
  lab.textContent = opts.label || '';
  const sel = el('select', 'sel', wrap);
  for (const o of opts.options) {
    const opt = el('option', null, sel);
    if (typeof o === 'string') { opt.value = o; opt.textContent = o; }
    else { opt.value = o.value; opt.textContent = o.label; }
  }
  if (opts.value != null) sel.value = opts.value;
  sel.addEventListener('change', () => opts.onChange && opts.onChange(sel.value));
  return { el: wrap, select: sel, get value() { return sel.value; }, set(v) { sel.value = v; } };
}

// Monospace readout box. r.set('text').
export function readout(parent, initial = '') {
  const r = el('div', 'readout', parent);
  r.textContent = initial;
  return { el: r, set(t) { r.textContent = t; }, setHTML(h) { r.innerHTML = h; } };
}

// "As the story goes" — the house style for myths & legends. HTML allowed.
export function legendPanel(parent, bodyHTML, title = 'as the story goes') {
  const p = el('aside', 'legend-panel', parent);
  const t = el('div', 'legend-title', p);
  t.textContent = title;
  const b = el('div', null, p);
  b.innerHTML = bodyHTML;
  return p;
}

// Labeled speculation — Movement III's honesty device. HTML allowed.
export function speculationPanel(parent, bodyHTML, title = 'here the ground becomes conjecture') {
  const p = el('aside', 'speculation-panel', parent);
  const t = el('div', 'speculation-title', p);
  t.textContent = title;
  const b = el('div', null, p);
  b.innerHTML = bodyHTML;
  return p;
}

// Quest banner: q.set('goal text'); q.done('victory text'); q.reset().
export function questBanner(parent, text) {
  const b = el('div', 'quest-banner', parent);
  const mark = el('span', 'quest-mark', b);
  mark.textContent = '✦';
  const t = el('span', 'quest-text', b);
  t.innerHTML = text || '';
  return {
    el: b,
    set(html) { b.classList.remove('done'); mark.textContent = '✦'; t.innerHTML = html; },
    done(html) { b.classList.add('done'); mark.textContent = '✓'; if (html) t.innerHTML = html; },
  };
}

// Centered monospace math line.
export function mathline(parent, html) {
  const m = el('div', 'mathline', parent);
  m.innerHTML = html;
  return m;
}

// Italic caption under a stage element.
export function caption(parent, html) {
  const c = el('p', 'stage-caption', parent);
  c.innerHTML = html;
  return c;
}
