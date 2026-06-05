// Tiny WebAudio chiptune helper — no assets, pure synthesis.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuffer: AudioBuffer | null = null;
const HOE_SOUNDS = [
  "/hoe_sound/hoe_1.flac",
  "/hoe_sound/hoe_2.flac",
  "/hoe_sound/hoe_3.flac",
  "/hoe_sound/hoe_4.flac",
];
const WATERING_SOUNDS = [
  "/watering_sound/watering_1.flac",
  "/watering_sound/watering_2.flac",
  "/watering_sound/watering_3.flac",
];
const HARVESTING_SOUNDS = [
  "/harvesting_sound/harvesting_1.flac",
  "/harvesting_sound/harvesting_2.flac",
  "/harvesting_sound/harvesting_3.flac",
  "/harvesting_sound/harvesting_4.flac",
];

function ensure() {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
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
      
      // Trigger lazy preloading in the background
      setTimeout(preloadAudio, 100);
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
  } catch (e) {
    console.warn("WebAudio initialization failed, synthesizer sounds disabled:", e);
    ctx = null;
    master = null;
  }
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

function pop() {
  const a = ensure();
  if (!a || muted || !master) return;
  const now = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(420, now);
  o.frequency.exponentialRampToValueAtTime(920, now + 0.035);
  o.frequency.exponentialRampToValueAtTime(520, now + 0.08);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.35, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  o.connect(g);
  g.connect(master);
  o.start(now);
  o.stop(now + 0.11);
}

const audioPool: Record<string, HTMLAudioElement[]> = {};
const MAX_POOL_SIZE = 5;

export function preloadAudio() {
  if (typeof window === "undefined") return;
  const allUrls = [...HOE_SOUNDS, ...WATERING_SOUNDS, ...HARVESTING_SOUNDS];
  for (const url of allUrls) {
    try {
      if (!audioPool[url]) {
        audioPool[url] = [];
      }
      if (audioPool[url].length === 0) {
        const audio = new Audio();
        audio.src = url;
        audio.preload = "auto";
        audioPool[url].push(audio);
      }
    } catch (e) {
      console.warn("Failed to preload audio asset:", url, e);
    }
  }
}

export function cleanupSfxPool() {
  for (const url in audioPool) {
    const pool = audioPool[url];
    for (const audio of pool) {
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch (e) {
        // ignore
      }
    }
    delete audioPool[url];
  }
}

function playOverlap(urls: string[], volume = 1) {
  if (typeof window === "undefined" || muted) return;
  try {
    const url = urls[Math.floor(Math.random() * urls.length)];
    if (!audioPool[url]) {
      audioPool[url] = [];
    }

    let audio = audioPool[url].find((a) => a.paused || a.ended);

    if (!audio) {
      if (audioPool[url].length < MAX_POOL_SIZE) {
        audio = new Audio();
        audio.src = url;
        audio.preload = "auto";
        audioPool[url].push(audio);
      } else {
        audio = audioPool[url][0];
        audio.pause();
        audio.currentTime = 0;
      }
    }

    audio.volume = volume;
    void audio.play().catch((err) => {
      console.warn("SFX audio play failed or was interrupted:", err);
    });
  } catch (err) {
    console.error("Error playing overlap audio:", err);
  }
}

export const SFX = {
  till() {
    noiseBurst(0.18, 0.35);
    play([{ freq: 110, dur: 0.12, type: "square", vol: 0.3 }]);
  },
  hoe() {
    playOverlap(HOE_SOUNDS, 0.3);
  },
  water() {
    playOverlap(WATERING_SOUNDS, 0.3);
  },
  plant() {
    play([
      { freq: 440, dur: 0.08, type: "triangle", vol: 0.35 },
      { freq: 660, dur: 0.1, type: "triangle", vol: 0.3, delay: 0.06 },
    ]);
  },
  harvest() {
    playOverlap(HARVESTING_SOUNDS, 0.3);
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
  countdown(n: number) {
    play([
      { freq: n > 1 ? 660 : 880, dur: 0.09, type: "square", vol: 0.45 },
      { freq: n > 1 ? 330 : 440, dur: 0.09, type: "triangle", vol: 0.25 },
    ]);
  },
  epicSlot() {
    play([
      { freq: 196, dur: 0.12, type: "triangle", vol: 0.35 },
      { freq: 392, dur: 0.12, type: "square", vol: 0.35, delay: 0.05 },
      { freq: 587, dur: 0.14, type: "square", vol: 0.35, delay: 0.11 },
      { freq: 784, dur: 0.22, type: "triangle", vol: 0.4, delay: 0.18 },
    ]);
  },
  click() {
    pop();
  },
};
