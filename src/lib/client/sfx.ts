"use client";
// Cold Case sound engine. Every effect is synthesized live with the Web Audio API: no audio files,
// nothing to download, no licensing. Effects and the rain ambience can be toggled in Sound settings.

export type SfxName =
  | "tap"
  | "whoosh"
  | "swipe"
  | "stamp"
  | "found"
  | "miss"
  | "key"
  | "nerve"
  | "crack"
  | "gavel"
  | "recStart"
  | "recStop"
  | "tick"
  | "ready"
  | "win"
  | "lose"
  | "promote"
  | "count"
  | "select"
  | "pin"
  | "error";

type Opts = { sfx: boolean; ambience: boolean };

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let ambBus: GainNode;
let noiseBuf: AudioBuffer;
let opts: Opts = { sfx: true, ambience: true };
let ambNodes: { src: AudioBufferSourceNode; timer: ReturnType<typeof setTimeout> | null } | null = null;
let ducked = false;
let recording = false;
const lastPlayed: Partial<Record<SfxName, number>> = {};

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctx: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  // A peak limiter (threshold near 0 dB): catches big hits without the make-up gain a normal
  // compressor adds, which made quiet clicks after silence jump in level.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -2;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.002;
  comp.release.value = 0.2;
  master = ctx.createGain();
  master.gain.value = 0.7;
  sfxBus = ctx.createGain();
  ambBus = ctx.createGain();
  ambBus.gain.value = 0;
  sfxBus.connect(master);
  ambBus.connect(master);
  master.connect(comp).connect(ctx.destination);
  // 2 seconds of white noise, reused by every noisy effect and the rain.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a user gesture: browsers only allow audio after one. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === "suspended") c.resume().catch(() => undefined);
  if (opts.ambience && !ambNodes) startAmbience();
}

export function configureSound(next: Partial<Opts>) {
  opts = { ...opts, ...next };
  if (!opts.ambience) stopAmbience();
  else if (ctx && ctx.state === "running") startAmbience();
}

// ---------- building blocks ----------

function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  // Start silent: a gain node defaults to 1, and a source can emit a sample just before its
  // scheduled start, which would otherwise leak through as a loud click.
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type: OscillatorType, freq: number, t: number, dur: number, peak: number, opt: { attack?: number; to?: number; detune?: number; out?: AudioNode; filter?: number } = {}) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  if (opt.to) {
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
  }
  if (opt.detune) o.detune.value = opt.detune;
  envelope(g, t, peak, opt.attack ?? 0.005, dur);
  let node: AudioNode = o;
  if (opt.filter) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opt.filter;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(opt.out ?? sfxBus);
  o.start(t);
  o.stop(t + (opt.attack ?? 0.005) + dur + 0.05);
}

function noise(t: number, dur: number, peak: number, opt: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; attack?: number; out?: AudioNode } = {}) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = opt.type ?? "bandpass";
  // Set the starting frequency up front: an abrupt coefficient jump at start time makes the
  // biquad ring into loud spikes. Automate only when the effect actually sweeps.
  f.frequency.value = opt.freq ?? 1000;
  if (opt.to) {
    f.frequency.setValueAtTime(opt.freq ?? 1000, t);
    f.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
  }
  f.Q.value = opt.q ?? 1;
  const g = c.createGain();
  envelope(g, t, peak, opt.attack ?? 0.003, dur);
  src.connect(f).connect(g).connect(opt.out ?? sfxBus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + (opt.attack ?? 0.003) + dur + 0.05);
}

const N = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

// ---------- the effects ----------

const EFFECTS: Record<SfxName, (t: number) => void> = {
  tap: (t) => {
    tone("sine", 880, t, 0.05, 0.13, { to: 560 });
    noise(t, 0.02, 0.03, { type: "highpass", freq: 4000 });
  },
  whoosh: (t) => noise(t, 0.3, 0.1, { freq: 350, to: 2400, q: 0.8, attack: 0.08 }),
  swipe: (t) => {
    noise(t, 0.16, 0.06, { freq: 1400, to: 600, q: 1.2, attack: 0.03 });
    tone("sine", 520, t, 0.04, 0.03);
  },
  stamp: (t) => {
    tone("sine", 150, t, 0.28, 0.7, { to: 45 });
    noise(t, 0.14, 0.45, { type: "lowpass", freq: 900 });
    noise(t, 0.02, 0.2, { type: "highpass", freq: 3000 });
  },
  found: (t) => {
    tone("triangle", N(79), t, 0.32, 0.2);
    tone("triangle", N(86), t + 0.09, 0.42, 0.2);
    tone("sine", N(98), t + 0.17, 0.25, 0.06);
    tone("sine", N(103), t + 0.24, 0.3, 0.04);
  },
  miss: (t) => tone("triangle", 230, t, 0.18, 0.1, { to: 165 }),
  key: (t) => {
    noise(t, 0.016, 0.022 + Math.random() * 0.012, { type: "highpass", freq: 2200 + Math.random() * 1500 });
    tone("square", 1500 + Math.random() * 600, t, 0.008, 0.005, { filter: 3000 });
  },
  nerve: (t) => {
    tone("sine", 62, t, 0.13, 0.4, { to: 40 });
    tone("sine", 58, t + 0.2, 0.15, 0.3, { to: 38 });
  },
  crack: (t) => {
    tone("sine", 95, t, 1.0, 0.85, { to: 28 });
    noise(t, 0.55, 0.5, { type: "lowpass", freq: 700, to: 120 });
    tone("sawtooth", N(63), t + 0.02, 0.7, 0.11, { filter: 1800 });
    tone("sawtooth", N(64), t + 0.02, 0.7, 0.11, { filter: 1800 });
    tone("sawtooth", N(51), t + 0.02, 0.9, 0.09, { filter: 900 });
    noise(t, 0.3, 0.08, { type: "highpass", freq: 5000 });
  },
  gavel: (t) => {
    const knock = (at: number, peak: number) => {
      tone("sine", 190, at, 0.12, peak, { to: 115 });
      noise(at, 0.07, peak * 0.7, { freq: 1500, q: 3 });
    };
    knock(t + 0.33, 0.6);
    knock(t + 0.62, 0.25);
    tone("sine", 70, t + 0.33, 0.6, 0.3, { to: 40 });
  },
  recStart: (t) => tone("sine", 660, t, 0.1, 0.14, { to: 990 }),
  recStop: (t) => tone("sine", 990, t, 0.1, 0.12, { to: 620 }),
  tick: (t) => tone("triangle", 1320, t, 0.09, 0.08),
  ready: (t) => [72, 76, 79, 84].forEach((n, i) => tone("triangle", N(n), t + i * 0.08, 0.32, 0.14)),
  win: (t) => {
    [67, 72, 76].forEach((n, i) => tone("triangle", N(n), t + i * 0.11, 0.25, 0.16));
    tone("triangle", N(79), t + 0.33, 0.8, 0.18);
    tone("sine", N(48), t + 0.33, 0.9, 0.18);
    tone("sine", N(91), t + 0.45, 0.4, 0.04);
  },
  lose: (t) => {
    [64, 60, 57].forEach((n, i) => tone("sawtooth", N(n), t + i * 0.2, 0.35, 0.08, { filter: 1400 }));
    tone("sine", N(45), t + 0.4, 0.9, 0.2, { to: N(40) });
  },
  promote: (t) => {
    [72, 76, 79, 84, 88, 91].forEach((n, i) => tone("triangle", N(n), t + i * 0.06, 0.3, 0.12));
    tone("sine", N(96), t + 0.36, 0.5, 0.05);
  },
  count: (t) => tone("sine", 1500 + Math.random() * 200, t, 0.015, 0.035),
  select: (t) => {
    tone("sine", 110, t, 0.3, 0.35, { to: 70 });
    noise(t, 0.1, 0.15, { type: "lowpass", freq: 600 });
  },
  pin: (t) => {
    noise(t, 0.03, 0.08, { freq: 2600, q: 2 });
    tone("sine", 1250, t, 0.03, 0.05);
  },
  error: (t) => {
    tone("square", 180, t, 0.12, 0.06, { filter: 900 });
    tone("square", 150, t + 0.13, 0.16, 0.06, { filter: 900 });
  },
};

// Minimum gap between repeats, so rapid effects (typing, counting) don't pile up.
const GAP: Partial<Record<SfxName, number>> = { key: 0.045, count: 0.06, tap: 0.04, pin: 0.05, tick: 0.05 };

/** Play an effect, optionally after a delay (seconds) to land on an animation's impact. */
export function sfx(name: SfxName, delay = 0) {
  if (!opts.sfx) return;
  const c = ensure();
  if (!c || c.state !== "running") return;
  const t = c.currentTime + delay;
  const gap = GAP[name];
  if (gap && lastPlayed[name] && t - lastPlayed[name]! < gap) return;
  lastPlayed[name] = t;
  try {
    EFFECTS[name](t);
  } catch {
    // audio is decoration: never let it break the game
  }
}

// ---------- rain ambience ----------

function thunder() {
  if (!ctx || !ambNodes) return;
  const t = ctx.currentTime;
  noise(t, 3.2, 0.22, { type: "lowpass", freq: 280, to: 60, attack: 0.6, out: ambBus });
  noise(t + 0.1, 1.2, 0.08, { type: "lowpass", freq: 900, to: 200, attack: 0.05, out: ambBus });
  ambNodes.timer = setTimeout(thunder, 28_000 + Math.random() * 40_000);
}

export function startAmbience() {
  const c = ensure();
  if (!c || ambNodes || !opts.ambience) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 450;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  const g = c.createGain();
  g.gain.value = 0.05;
  // Slow swell so the rain breathes.
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 0.015;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(hp).connect(lp).connect(g).connect(ambBus);
  src.start();
  lfo.start();
  ambNodes = { src, timer: setTimeout(thunder, 9_000 + Math.random() * 12_000) };
  applyAmbienceLevel();
}

export function stopAmbience() {
  if (!ambNodes || !ctx) return;
  const { src, timer } = ambNodes;
  ambNodes = null;
  if (timer) clearTimeout(timer);
  ambBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  setTimeout(() => {
    try {
      src.stop();
    } catch {
      // already stopped
    }
  }, 900);
}

function applyAmbienceLevel() {
  if (!ctx) return;
  const level = recording ? 0 : ducked ? 0.35 : 1;
  ambBus.gain.setTargetAtTime(level, ctx.currentTime, recording ? 0.05 : 0.4);
}

/** Lower the rain while a suspect speaks. */
export function duckAmbience(on: boolean) {
  ducked = on;
  applyAmbienceLevel();
}

/** Silence the rain completely while the microphone records, so it doesn't reach the transcript. */
export function setRecording(on: boolean) {
  recording = on;
  applyAmbienceLevel();
}

export function suspendAudio(hidden: boolean) {
  if (!ctx) return;
  if (hidden) ctx.suspend().catch(() => undefined);
  else ctx.resume().catch(() => undefined);
}
