export interface PlayerCosmetics {
  hat: string;
  shirt: string;
  pants: string;
}

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  hat: "#d9a441",
  shirt: "#c8412e",
  pants: "#3a5a8a",
};

export const COSMETIC_PALETTES = {
  hat: ["#d9a441", "#ffd24a", "#f0a05b", "#8bc967", "#7fd8ff", "#c08bd9"],
  shirt: ["#c8412e", "#d94e6a", "#4cc2ee", "#6ab04c", "#9b59d4", "#f0a05b"],
  pants: ["#3a5a8a", "#355070", "#5a3f12", "#4a2f5c", "#2a6e9e", "#5a2f17"],
} as const;

const STORAGE_KEY = "tg.cosmetics";

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function normalizeCosmetics(input: unknown): PlayerCosmetics {
  if (!input || typeof input !== "object") return DEFAULT_COSMETICS;
  const c = input as Partial<PlayerCosmetics>;
  return {
    hat: isHexColor(c.hat) ? c.hat : DEFAULT_COSMETICS.hat,
    shirt: isHexColor(c.shirt) ? c.shirt : DEFAULT_COSMETICS.shirt,
    pants: isHexColor(c.pants) ? c.pants : DEFAULT_COSMETICS.pants,
  };
}

interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getLocalStorage(): LocalStorageLike | undefined {
  return (globalThis as typeof globalThis & { localStorage?: LocalStorageLike }).localStorage;
}

export function readCosmetics(): PlayerCosmetics {
  const storage = getLocalStorage();
  if (!storage) return DEFAULT_COSMETICS;
  try {
    return normalizeCosmetics(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_COSMETICS;
  }
}

export function writeCosmetics(cosmetics: PlayerCosmetics): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeCosmetics(cosmetics)));
}
