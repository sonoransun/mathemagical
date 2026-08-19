// core/audio.js — one AudioContext for the whole essay.
// Chain: exhibit bus -> limiter (safety compressor) -> master gain -> speakers.
// The context is created on demand (suspended until the first user gesture;
// main.js installs a one-time resume handler). No top-level audio/DOM access.

let ctx = null;
let master = null;      // final gain (volume + mute)
let limiter = null;     // gentle safety compressor
let enabled = true;     // global sound toggle (persisted by main.js)
const MASTER_LEVEL = 0.25;

export function getContext() { return ctx; }

// Create (if needed) and try to resume. Safe to call anywhere; call it inside
// user-gesture handlers before starting sound so autoplay policy is satisfied.
export function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 24;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = enabled ? MASTER_LEVEL : 0;
    limiter.connect(master).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isEnabled() { return enabled; }

export function setSoundEnabled(on) {
  enabled = on;
  if (master) rampTo(master.gain, on ? MASTER_LEVEL : 0, 0.05);
}

/* ---------- parameter ramps (never set .value while audible) ---------- */

// Smooth approach to `value` with time constant tau (seconds).
export function rampTo(param, value, tau = 0.02, at = null) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setTargetAtTime(value, t, tau);
}

// Frequency glide: exponential-feel ramp (frequency is multiplicative).
export function glideFreq(param, value, dur = 0.05, at = null) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(Math.max(param.value, 1e-2), t);
  param.exponentialRampToValueAtTime(Math.max(value, 1e-2), t + dur);
}

/* ---------- buses ---------- */

// A per-exhibit submix. Exhibits connect everything to bus.input.
export function createBus(name = 'bus') {
  ensureCtxExists();
  const input = ctx.createGain();
  input.gain.value = 1;
  input.connect(limiter);
  let level = 1;
  return {
    name, input,
    get context() { return ctx; },
    setGain(v, tau = 0.03) { level = v; rampTo(input.gain, v, tau); },
    mute(tau = 0.05) { rampTo(input.gain, 0, tau); },
    unmute(tau = 0.05) { rampTo(input.gain, level, tau); },
    dispose() { try { input.disconnect(); } catch {} },
  };
}

function ensureCtxExists() {
  // Create suspended context if none — resumed later by a gesture.
  if (!ctx) {
    const saved = enabled;
    ensureAudio();
    enabled = saved;
  }
}

/* ---------- one-shot tones & sustained voices ---------- */

// Schedule a tone. opts: { freq, dur=0.4, type='sine', level=0.5,
//   attack=0.008, release=0.08, when=now, detune=0, pan=0 }
export function playTone(bus, opts = {}) {
  const c = bus.context;
  const t0 = opts.when ?? c.currentTime;
  const dur = opts.dur ?? 0.4;
  const level = opts.level ?? 0.5;
  const attack = opts.attack ?? 0.008;
  const release = opts.release ?? 0.08;

  const osc = c.createOscillator();
  osc.type = opts.type || 'sine';
  osc.frequency.value = opts.freq || 440;
  if (opts.detune) osc.detune.value = opts.detune;

  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(level, t0 + attack);
  g.gain.setValueAtTime(level, Math.max(t0 + attack, t0 + dur - release));
  g.gain.setTargetAtTime(1e-4, Math.max(t0 + attack, t0 + dur - release), release / 4);

  let dest = g;
  osc.connect(g);
  if (opts.pan != null && opts.pan !== 0 && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = opts.pan;
    g.connect(p); dest = p;
  }
  dest.connect(bus.input);

  osc.start(t0);
  osc.stop(t0 + dur + release * 3);
  osc.onended = () => { try { osc.disconnect(); g.disconnect(); dest.disconnect(); } catch {} };
  return osc;
}

// Sustained voice with envelope on()/off(). For keyboards & drones.
// opts: { type='sine', freq=440, level=0.4, attack=0.02, release=0.15, pan=0 }
export function voice(bus, opts = {}) {
  const c = bus.context;
  const osc = c.createOscillator();
  osc.type = opts.type || 'sine';
  osc.frequency.value = opts.freq ?? 440;
  const g = c.createGain();
  g.gain.value = 0;
  osc.connect(g);
  let out = g;
  if (opts.pan != null && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = opts.pan;
    g.connect(p); out = p;
  }
  out.connect(bus.input);
  osc.start();
  const level = opts.level ?? 0.4;
  const attack = opts.attack ?? 0.02;
  const release = opts.release ?? 0.15;
  let disposed = false;
  return {
    osc, gain: g,
    setFreq(f, dur = 0.04) { glideFreq(osc.frequency, f, dur); },
    on(lv = level) { rampTo(g.gain, lv, attack / 3); },
    off() { rampTo(g.gain, 0, release / 3); },
    dispose() {
      if (disposed) return; disposed = true;
      rampTo(g.gain, 0, 0.02);
      osc.stop(c.currentTime + 0.15);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); out.disconnect(); } catch {} };
    },
  };
}

/* ---------- lookahead scheduler ("a tale of two clocks") ---------- */

// tick(time) must schedule the event at `time` (against the audio clock) and
// return the absolute time of the NEXT event, or null to stop.
// Visual playheads should derive from bus.context.currentTime, never rAF counts.
export function createScheduler(tick, opts = {}) {
  const lookahead = opts.lookahead ?? 0.12;  // s
  const interval = opts.interval ?? 25;      // ms
  let timer = null;
  let nextTime = 0;
  function pump() {
    const c = ctx;
    if (!c) return;
    while (nextTime !== null && nextTime < c.currentTime + lookahead) {
      const t = tick(nextTime);
      nextTime = (t == null) ? null : t;
    }
    if (nextTime === null) stop();
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  return {
    start(delay = 0.08) {
      ensureAudio();
      stop();
      nextTime = ctx.currentTime + delay;
      pump();
      timer = setInterval(pump, interval);
    },
    stop,
    get playing() { return timer !== null; },
    get nextTime() { return nextTime; },
  };
}

/* ---------- synthesized percussion (no samples anywhere) ---------- */

let _noiseBuf = null;
export function noiseBuffer() {
  ensureCtxExists();
  if (!_noiseBuf) {
    _noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = _noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noiseBuf;
}

function noiseHit(bus, when, { dur = 0.05, level = 0.5, filterType = 'highpass', freq = 6000, q = 1 }) {
  const c = bus.context;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  const f = c.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + 0.002);
  g.gain.setTargetAtTime(1e-4, when + 0.004, dur / 4);
  src.connect(f).connect(g).connect(bus.input);
  src.start(when);
  src.stop(when + dur + 0.1);
  src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch {} };
}

export const drums = {
  // Deep drum: sine with fast pitch drop.
  kick(bus, when, { level = 0.9 } = {}) {
    const c = bus.context;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.09);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.004);
    g.gain.setTargetAtTime(1e-4, when + 0.01, 0.05);
    osc.connect(g).connect(bus.input);
    osc.start(when); osc.stop(when + 0.4);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
  },
  hat(bus, when, { level = 0.25 } = {}) {
    noiseHit(bus, when, { dur: 0.035, level, filterType: 'highpass', freq: 7500 });
  },
  rim(bus, when, { level = 0.5 } = {}) {
    noiseHit(bus, when, { dur: 0.02, level, filterType: 'bandpass', freq: 2400, q: 6 });
  },
  // Wood block "tick" — pitched; nice for pebbles & counting.
  wood(bus, when, { level = 0.5, pitch = 880 } = {}) {
    const c = bus.context;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, when);
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.002);
    g.gain.setTargetAtTime(1e-4, when + 0.004, 0.018);
    osc.connect(g).connect(bus.input);
    osc.start(when); osc.stop(when + 0.15);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
  },
  // Clay "thock" — lower, duller; for cuneiform stamping.
  thock(bus, when, { level = 0.6 } = {}) {
    const c = bus.context;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, when);
    osc.frequency.exponentialRampToValueAtTime(120, when + 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.003);
    g.gain.setTargetAtTime(1e-4, when + 0.006, 0.03);
    osc.connect(g).connect(bus.input);
    osc.start(when); osc.stop(when + 0.25);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
    noiseHit(bus, when, { dur: 0.015, level: level * 0.3, filterType: 'lowpass', freq: 1200 });
  },
};
