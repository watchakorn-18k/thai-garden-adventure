import {
  DEFAULT_PROGRESS,
  applyAwardToProgress,
  normalizeProgress,
  type AppliedProgressAward,
  type PlayerProgress,
  type ProgressAward,
} from "./progression";

const STORAGE_KEY = "tg.progress.v1";
const SEED_KEY = "tg.progress.seed.v1";
const SALT = "thai-garden-adventure-progress-v1";

interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredProgressBlob {
  v: 1;
  data: string;
  sig: string;
}

export interface ReadProgressResult {
  progress: PlayerProgress;
  tampered: boolean;
}

function getLocalStorage(): LocalStorageLike | undefined {
  return (globalThis as typeof globalThis & { localStorage?: LocalStorageLike }).localStorage;
}

export async function readProgress(): Promise<ReadProgressResult> {
  const storage = getLocalStorage();
  if (!storage) return { progress: normalizeProgress(DEFAULT_PROGRESS), tampered: false };
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { progress: normalizeProgress(DEFAULT_PROGRESS), tampered: false };

  try {
    const stored = JSON.parse(raw) as Partial<StoredProgressBlob>;
    if (stored.v !== 1 || typeof stored.data !== "string" || typeof stored.sig !== "string") {
      return { progress: normalizeProgress(DEFAULT_PROGRESS), tampered: true };
    }
    const seed = getOrCreateSeed(storage);
    const canonical = await reveal(stored.data, seed);
    const sig = await sign(canonical, seed);
    if (sig !== stored.sig)
      return { progress: normalizeProgress(DEFAULT_PROGRESS), tampered: true };
    return { progress: normalizeProgress(JSON.parse(canonical)), tampered: false };
  } catch {
    return { progress: normalizeProgress(DEFAULT_PROGRESS), tampered: true };
  }
}

export async function writeProgress(progress: PlayerProgress): Promise<PlayerProgress> {
  const storage = getLocalStorage();
  const clean = normalizeProgress(progress);
  if (!storage) return clean;
  const seed = getOrCreateSeed(storage);
  const canonical = canonicalize(clean);
  const data = await conceal(canonical, seed);
  const sig = await sign(canonical, seed);
  storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, data, sig } satisfies StoredProgressBlob));
  return clean;
}

export async function applyStoredProgressAward(
  award: ProgressAward,
): Promise<AppliedProgressAward> {
  const { progress } = await readProgress();
  const applied = applyAwardToProgress(progress, award);
  if (applied.applied) {
    applied.progress = await writeProgress(applied.progress);
  }
  return applied;
}

function getOrCreateSeed(storage: LocalStorageLike): string {
  const existing = storage.getItem(SEED_KEY);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const seed = toHex(bytes);
  storage.setItem(SEED_KEY, seed);
  return seed;
}

function canonicalize(progress: PlayerProgress): string {
  const clean = normalizeProgress(progress);
  const awardsClaimed = Object.fromEntries(
    Object.entries(clean.awardsClaimed).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({
    level: clean.level,
    exp: clean.exp,
    totalExp: clean.totalExp,
    updatedAt: clean.updatedAt,
    awardsClaimed,
  });
}

async function sign(canonical: string, seed: string): Promise<string> {
  return sha256Hex(`${SALT}:${seed}:${canonical}`);
}

async function conceal(canonical: string, seed: string): Promise<string> {
  const input = new TextEncoder().encode(canonical);
  const mask = await maskBytes(input.length, seed);
  const output = input.map((byte, i) => byte ^ mask[i]);
  return btoa(String.fromCharCode(...output));
}

async function reveal(data: string, seed: string): Promise<string> {
  const encrypted = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  const mask = await maskBytes(encrypted.length, seed);
  const output = encrypted.map((byte, i) => byte ^ mask[i]);
  return new TextDecoder().decode(output);
}

async function maskBytes(length: number, seed: string): Promise<Uint8Array> {
  const chunks: number[] = [];
  let counter = 0;
  while (chunks.length < length) {
    const hash = await sha256Bytes(`${SALT}:mask:${seed}:${counter}`);
    chunks.push(...hash);
    counter += 1;
  }
  return new Uint8Array(chunks.slice(0, length));
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await sha256Bytes(value));
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
