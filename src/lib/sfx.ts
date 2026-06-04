// Tiny WebAudio chiptune helper — no assets, pure synthesis.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuffer: AudioBuffer | null = null;

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

    // Pre-generate 2-second shared white noise buffer to prevent runtime allocations
    const sampleRate = ctx.sampleRate;
    const size = sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, size, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = Math.random() * 2 - 1;
    }
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
  if (!a || muted || !master || !noiseBuffer) return;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  const g = a.createGain();
  const filt = a.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 1200;

  const now = a.currentTime;
  g.gain.setValueAtTime(vol, now);
  g.gain.linearRampToValueAtTime(0.0001, now + dur);

  src.connect(filt);
  filt.connect(g);
  g.connect(master);

  // Play from a random offset in the 2-second buffer to prevent repetitive sound patterns
  const maxOffset = Math.max(0, 2 - dur);
  const offset = Math.random() * maxOffset;
  src.start(now, offset, dur);
  src.stop(now + dur + 0.05);
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
