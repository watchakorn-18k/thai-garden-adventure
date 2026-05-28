// Tiny WebAudio chiptune helper — no assets, pure synthesis.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setMuted(v: boolean) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.25;
}
export function isMuted() {
  return muted;
}

interface Note {
  freq: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
}

function play(notes: Note[]) {
  const a = ensure();
  if (!a || muted || !master) return;
  const now = a.currentTime;
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = n.type ?? "square";
    o.frequency.value = n.freq;
    const t0 = now + (n.delay ?? 0);
    const t1 = t0 + n.dur;
    const vol = n.vol ?? 0.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t1 + 0.02);
  }
}

function noiseBurst(dur: number, vol = 0.3) {
  const a = ensure();
  if (!a || muted || !master) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = vol;
  const filt = a.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 1200;
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start();
}

export const SFX = {
  till() {
    noiseBurst(0.18, 0.35);
    play([{ freq: 110, dur: 0.12, type: "square", vol: 0.3 }]);
  },
  water() {
    noiseBurst(0.35, 0.18);
    play([
      { freq: 600, dur: 0.2, type: "sine", vol: 0.18 },
      { freq: 800, dur: 0.15, type: "sine", vol: 0.15, delay: 0.05 },
    ]);
  },
  plant() {
    play([
      { freq: 440, dur: 0.08, type: "triangle", vol: 0.35 },
      { freq: 660, dur: 0.1, type: "triangle", vol: 0.3, delay: 0.06 },
    ]);
  },
  harvest() {
    play([
      { freq: 523, dur: 0.08, type: "square", vol: 0.4 },
      { freq: 659, dur: 0.08, type: "square", vol: 0.4, delay: 0.07 },
      { freq: 784, dur: 0.12, type: "square", vol: 0.4, delay: 0.14 },
    ]);
  },
  crit() {
    play([
      { freq: 523, dur: 0.06, type: "square", vol: 0.45 },
      { freq: 659, dur: 0.06, type: "square", vol: 0.45, delay: 0.05 },
      { freq: 784, dur: 0.06, type: "square", vol: 0.45, delay: 0.1 },
      { freq: 1046, dur: 0.18, type: "square", vol: 0.5, delay: 0.16 },
      { freq: 1318, dur: 0.22, type: "triangle", vol: 0.35, delay: 0.16 },
    ]);
  },
  combo(level: number) {
    const base = 440 + level * 80;
    play([
      { freq: base, dur: 0.07, type: "square", vol: 0.35 },
      { freq: base * 1.5, dur: 0.1, type: "square", vol: 0.35, delay: 0.05 },
    ]);
  },
  coin() {
    play([
      { freq: 988, dur: 0.05, type: "square", vol: 0.3 },
      { freq: 1318, dur: 0.08, type: "square", vol: 0.3, delay: 0.04 },
    ]);
  },
  bad() {
    play([
      { freq: 220, dur: 0.08, type: "sawtooth", vol: 0.3 },
      { freq: 165, dur: 0.12, type: "sawtooth", vol: 0.3, delay: 0.06 },
    ]);
  },
  step() {
    noiseBurst(0.04, 0.06);
  },
  click() {
    play([{ freq: 660, dur: 0.04, type: "square", vol: 0.25 }]);
  },
};
