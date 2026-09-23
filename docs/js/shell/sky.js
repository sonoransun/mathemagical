// shell/sky.js — the page's night sky, painted once into one fixed canvas.
//
// The stars are the Gaussian primes. When a and b are both non-zero, a + bi is
// prime in ℤ[i] exactly when a² + b² is an ordinary prime; on the axes, when
// |a| (or |b|) is a prime ≡ 3 (mod 4). The lattice origin sits off the
// top-right corner, so the eight-fold symmetry reads as a drift of stars
// rather than a pattern. Brightness is a golden-ratio hash of the norm, so
// every visit sees the same sky. A faint vellum grain is baked in underneath.
// The canvas is repainted only when its box changes size. It is 100lvh tall,
// so a phone's collapsing URL bar never triggers a repaint; a desktop window
// resized in either direction gets a fresh, unstretched sky.

export function sieve(n) {
  const comp = new Uint8Array(n + 1); comp[0] = comp[1] = 1;
  for (let i = 2; i * i <= n; i++) if (!comp[i]) for (let j = i * i; j <= n; j += i) comp[j] = 1;
  return comp;                                     // comp[k] === 0  ⇔  k is prime
}

export function isGaussianPrime(a, b, comp) {
  a = Math.abs(a); b = Math.abs(b);
  if (a && b) return !comp[a * a + b * b];
  const q = a || b;
  return q > 1 && !comp[q] && q % 4 === 3;
}

function grainTile(size = 96, seed = 7289) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let s = seed >>> 0;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;       // LCG: grain needs no rigour
    const v = 200 + (s >>> 24) % 56;
    img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.86;
    img.data[i + 3] = (s >>> 16) % 11;                    // alpha 0–10 of 255
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function mountSky({ spacing = 12, budget = 4e6 } = {}) {
  const cv = document.createElement('canvas');
  cv.id = 'sky';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  const tile = grainTile();
  let lastW = 0;

  function render() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(budget / (w * h)));
    cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    ctx.fillStyle = ctx.createPattern(tile, 'repeat');       // vellum grain first, under the stars
    ctx.fillRect(0, 0, w, h);

    const ox = w * 0.86, oy = -h * 0.22;                     // lattice origin, off-canvas
    const reach = Math.hypot(Math.max(ox, w - ox), h - oy) / spacing;
    const comp = sieve(Math.ceil(reach * reach) + 2);
    const a0 = Math.floor(-ox / spacing), a1 = Math.ceil((w - ox) / spacing);
    const b0 = Math.floor(-oy / spacing), b1 = Math.ceil((h - oy) / spacing);
    const diag = Math.hypot(w, h);
    for (let a = a0; a <= a1; a++) {
      for (let b = b0; b <= b1; b++) {
        if (!isGaussianPrime(a, b, comp)) continue;
        const x = ox + a * spacing, y = oy + b * spacing;
        const q = ((a * a + b * b) * 0.6180339887) % 1;       // steady magnitude, not random per load
        const fall = 1 - Math.min(1, Math.hypot(a, b) * spacing / (1.35 * diag));
        ctx.globalAlpha = (0.10 + 0.32 * q * q) * (0.35 + 0.65 * fall);
        ctx.fillStyle = q > 0.97 ? '#e8c87c' : q < 0.04 ? '#7da7d9' : '#e8e2d0';
        const r = q > 0.93 ? 1.4 : 0.9;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    }
    ctx.globalAlpha = 1;
  }

  render();
  lastW = cv.clientWidth;
  let lastH = cv.clientHeight;
  let pending = 0;
  const onResize = () => {
    if (cv.clientWidth === lastW && cv.clientHeight === lastH) return;
    clearTimeout(pending);
    pending = setTimeout(() => { lastW = cv.clientWidth; lastH = cv.clientHeight; render(); }, 200);
  };
  window.addEventListener('resize', onResize, { passive: true });
  return {
    canvas: cv, render,
    destroy() { window.removeEventListener('resize', onResize); clearTimeout(pending); cv.remove(); },
  };
}
