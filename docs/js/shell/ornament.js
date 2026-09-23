// shell/ornament.js — every ornament on the page is a real curve.
//
// Fleurons are Grandi's rhodonea r = cos(kθ): k petals for odd k, 2k for even
// k. The overture emblem is computed geometry, drawn in the order history drew
// it: a compass circle, sixty sexagesimal ticks, the inscribed square, its
// diagonal (which is also the circle's diameter) labelled with the value
// YBC 7289 writes along it, 1 24 51 10, and the 3 : 2 Lissajous figure of a
// perfect fifth. No DOM work happens at import time.

const TAU = Math.PI * 2;
const f2 = (x) => x.toFixed(2);

// Rhodonea r = R·cos(kθ). Odd k closes after θ = π; even k needs 2π.
export function rosePath(k, R, cx = R, cy = R, steps = 360) {
  const T = k % 2 ? Math.PI : TAU;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * T;
    const r = R * Math.cos(k * th);
    d += (i ? 'L' : 'M') + f2(cx + r * Math.cos(th)) + ' ' + f2(cy + r * Math.sin(th));
  }
  return d + 'Z';
}

const svgURI = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// A two-rose fleuron: a filled quatrefoil (k = 2) under an eight-petal outline
// (k = 4), with a centre boss. Returned as a CSS url() for background layers.
export function fleuronSVG(color = '#8a7440', size = 32) {
  const R = size / 2 - 1, c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
    `<path d="${rosePath(2, R * 0.78, c, c)}" fill="${color}" fill-opacity=".5"/>` +
    `<path d="${rosePath(4, R, c, c)}" fill="none" stroke="${color}" stroke-width=".8"/>` +
    `<circle cx="${c}" cy="${c}" r="${f2(size * 0.07)}" fill="${color}"/></svg>`;
}
export const fleuronURI = (color, size) => svgURI(fleuronSVG(color, size));

// One pigment per movement, as the CSS tokens name them (--mv-1 … --mv-4).
export const PIGMENTS = { 1: '#c9a959', 2: '#7da7d9', 3: '#c05b4d', 4: '#62b3a4' };

// Publish ornaments as CSS custom properties. CSS only uses them under
// .has-ornaments, so a failure here leaves plain gold rules, never broken boxes.
export function installOrnaments(root = document.documentElement) {
  root.style.setProperty('--fleuron', fleuronURI('#8a7440'));
  root.style.setProperty('--fleuron-bright', fleuronURI('#c9a959'));
  for (const [m, col] of Object.entries(PIGMENTS)) root.style.setProperty(`--fleuron-${m}`, fleuronURI(col));
  root.classList.add('has-ornaments');
}

// An inline fleuron (decorative) for places a background image cannot reach.
export function fleuronEl(cls = 'fleuron') {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

// ---------- the overture emblem (inline SVG, drawn once by CSS) ----------
export function buildEmblem() {
  const S = 640, c = S / 2, R = 236;
  const h = R / Math.SQRT2;                         // half-side of the inscribed square

  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const r0 = R + 10, r1 = R + (i % 5 === 0 ? 26 : 16);
    ticks += `M${f2(c + r0 * Math.cos(a))} ${f2(c + r0 * Math.sin(a))}` +
             `L${f2(c + r1 * Math.cos(a))} ${f2(c + r1 * Math.sin(a))}`;
  }

  // Lissajous of the perfect fifth: x = cos 3t, y = sin 2t (one full period).
  let fifth = '';
  const A = h * 0.9;
  for (let i = 0; i <= 900; i++) {
    const t = (i / 900) * TAU;
    fifth += (i ? 'L' : 'M') + f2(c + A * Math.cos(3 * t)) + ' ' + f2(c + A * Math.sin(2 * t));
  }

  const sq = `M${f2(c - h)} ${f2(c - h)}H${f2(c + h)}V${f2(c + h)}H${f2(c - h)}Z`;
  const diag = `M${f2(c - h)} ${f2(c - h)}L${f2(c + h)} ${f2(c + h)}`;
  const lp = f2(c - h * 0.46);                      // the label rides the upper-left half of the diagonal
  const svg = `
<svg class="hero-emblem" viewBox="0 0 ${S} ${S}" aria-hidden="true" focusable="false">
  <defs><radialGradient id="emblem-halo"><stop offset="0" stop-color="#0c0d12" stop-opacity=".78"/><stop offset=".72" stop-color="#0c0d12" stop-opacity=".5"/><stop offset="1" stop-color="#0c0d12" stop-opacity="0"/></radialGradient></defs>
  <circle class="halo" cx="${c}" cy="${c}" r="${R + 70}" fill="url(#emblem-halo)"/>
  <circle class="draw e-gold"  style="--d:2.6s;--delay:.2s" cx="${c}" cy="${c}" r="${R}" pathLength="1"/>
  <path   class="draw e-dim"   style="--d:3.2s;--delay:1.6s" d="${ticks}" pathLength="1"/>
  <path   class="draw e-gold"  style="--d:2.2s;--delay:3s" d="${sq}" pathLength="1"/>
  <path   class="draw e-crimson" style="--d:1.3s;--delay:5s" d="${diag}" pathLength="1"/>
  <path   class="draw e-azure" style="--d:6s;--delay:6.3s" d="${fifth}" pathLength="1"/>
  <text class="e-label" style="--delay:6.1s" x="${lp}" y="${f2(c - h * 0.46 - 9)}" transform="rotate(45 ${lp} ${lp})"
        text-anchor="middle">1 24 51 10</text>
</svg>`;
  const tpl = document.createElement('template');
  tpl.innerHTML = svg.trim();
  return tpl.content.firstChild;
}

// ---------- drop-cap art: a tiny render of each movement's backdrop ----------
// Reuses the backdrop painters at 120×120, so the initial of every exhibit
// carries a thumbnail of its movement's own object. Four renders, once.
export function installInitialArt(backdrops, root = document.documentElement) {
  for (const [m, bd] of Object.entries(backdrops)) {
    if (!bd) continue;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 120;
      const ctx = c.getContext('2d');
      const geom = bd.prepare(120, 120, { thumb: true });
      bd.paint(ctx, geom, 120, 120, 1, { thumb: true });
      root.style.setProperty(`--initial-art-${m}`, `url(${c.toDataURL('image/png')})`);
    } catch { /* the initial simply stays unpatterned */ }
  }
}
