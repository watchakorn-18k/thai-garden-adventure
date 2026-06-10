import { COSMETIC_PRESETS } from "./player-cosmetics";

export interface GardenTokenState {
  balance: number;
  totalEarned: number;
  unlockedPresetIds: string[];
  updatedAt: number;
}

const STORAGE_KEY = "tg.gardenTokens.v1";
const DEFAULT_PRESET_ID = "classic_farmer";

const KNOWN_PRESET_IDS = new Set(COSMETIC_PRESETS.map((preset) => preset.id));

const DEFAULT_STATE: GardenTokenState = {
  balance: 0,
  totalEarned: 0,
  unlockedPresetIds: [DEFAULT_PRESET_ID],
  updatedAt: 0,
};

interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getLocalStorage(): LocalStorageLike | undefined {
  return (globalThis as typeof globalThis & { localStorage?: LocalStorageLike }).localStorage;
}

function clampInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeUnlocked(input: unknown): string[] {
  const ids = Array.isArray(input) ? input : [];
  const unique = new Set<string>([DEFAULT_PRESET_ID]);
  ids.forEach((id) => {
    if (typeof id === "string" && KNOWN_PRESET_IDS.has(id)) unique.add(id);
  });
  return [...unique];
}

export function normalizeGardenTokenState(input: unknown): GardenTokenState {
  if (!input || typeof input !== "object") return DEFAULT_STATE;
  const state = input as Partial<GardenTokenState>;
  return {
    balance: clampInt(state.balance),
    totalEarned: clampInt(state.totalEarned),
    unlockedPresetIds: normalizeUnlocked(state.unlockedPresetIds),
    updatedAt: clampInt(state.updatedAt),
  };
}

export function readGardenTokenState(): GardenTokenState {
  const storage = getLocalStorage();
  if (!storage) return DEFAULT_STATE;
  try {
    return normalizeGardenTokenState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_STATE;
  }
}

export function writeGardenTokenState(next: GardenTokenState): GardenTokenState {
  const normalized = normalizeGardenTokenState(next);
  const storage = getLocalStorage();
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  globalThis.dispatchEvent?.(new Event("tg:gardenTokens"));
  return normalized;
}

export function awardGardenTokens(amount: number): GardenTokenState {
  const delta = Math.max(0, Math.floor(amount));
  const current = readGardenTokenState();
  if (delta === 0) return current;
  return writeGardenTokenState({
    ...current,
    balance: current.balance + delta,
    totalEarned: current.totalEarned + delta,
    updatedAt: Date.now(),
  });
}

export function isCosmeticPresetUnlocked(state: GardenTokenState, id: string): boolean {
  return normalizeUnlocked(state.unlockedPresetIds).includes(id);
}

export function buyCosmeticPreset(
  id: string,
):
  | { ok: true; state: GardenTokenState }
  | { ok: false; reason: "missing" | "owned" | "funds"; state: GardenTokenState } {
  const preset = COSMETIC_PRESETS.find((item) => item.id === id);
  const current = readGardenTokenState();
  if (!preset) return { ok: false, reason: "missing", state: current };
  if (isCosmeticPresetUnlocked(current, id)) return { ok: false, reason: "owned", state: current };
  if (current.balance < preset.price) return { ok: false, reason: "funds", state: current };

  const state = writeGardenTokenState({
    ...current,
    balance: current.balance - preset.price,
    unlockedPresetIds: [...current.unlockedPresetIds, id],
    updatedAt: Date.now(),
  });
  return { ok: true, state };
}
