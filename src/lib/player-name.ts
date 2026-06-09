import { CROPS } from "./game-types";

const STORAGE_KEY = "tg.name";
const PREFIXES = ["เจ้า", "น้อง", "พี่", "ลุง", "ป้า", "จอม"];
const MAX_LEN = 16; // matches the match protocol's name cap

// Random cozy farmer handle built from a Thai crop name, e.g. "จอมพริก42".
export function randomPlayerName(): string {
  const crops = Object.values(CROPS);
  const crop = crops[Math.floor(Math.random() * crops.length)];
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${prefix}${crop.name}${num}`.slice(0, MAX_LEN);
}

// Returns the stored name, generating + persisting a random one on first use.
// Returns "" during SSR (no localStorage) — callers should fill in an effect.
export function loadPlayerName(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(STORAGE_KEY)?.trim();
  if (existing) return existing;
  const generated = randomPlayerName();
  localStorage.setItem(STORAGE_KEY, generated);
  return generated;
}

export function savePlayerName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, name);
}
