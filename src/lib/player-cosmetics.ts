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

export interface CosmeticPreset {
  id: string;
  name: string;
  description: string;
  price: number;
  cosmetics: PlayerCosmetics;
}

export const COSMETIC_PRESETS: CosmeticPreset[] = [
  {
    id: "classic_farmer",
    name: "ชาวสวนดั้งเดิม",
    description: "หมวกฟาง เสื้อแดง กางเกงน้ำเงิน",
    price: 0,
    cosmetics: DEFAULT_COSMETICS,
  },
  {
    id: "rice_farmer",
    name: "ชาวนาข้าว",
    description: "โทนอุ่นเหมือนทุ่งข้าวยามเย็น",
    price: 35,
    cosmetics: { hat: "#f4d864", shirt: "#f4e4c1", pants: "#5a3f12" },
  },
  {
    id: "chili_red",
    name: "พริกแดงแรง",
    description: "แดงเข้ม ตัดทอง เห็นชัดกลางสวน",
    price: 55,
    cosmetics: { hat: "#ffd24a", shirt: "#d94e6a", pants: "#2d1b3d" },
  },
  {
    id: "river_blue",
    name: "น้ำคลองใส",
    description: "ฟ้าเย็นแบบร่องน้ำหลังบ้าน",
    price: 75,
    cosmetics: { hat: "#7fd8ff", shirt: "#4cc2ee", pants: "#2a6e9e" },
  },
  {
    id: "mango_gold",
    name: "มะม่วงทอง",
    description: "เหลืองทองสดใสสำหรับนักเก็บเกี่ยว",
    price: 110,
    cosmetics: { hat: "#ffd24a", shirt: "#f0a05b", pants: "#6b3a1c" },
  },
  {
    id: "night_violet",
    name: "ม่วงยามค่ำ",
    description: "สีเข้มเข้ากับท้องฟ้าดัสก์",
    price: 150,
    cosmetics: { hat: "#c08bd9", shirt: "#4a2f5c", pants: "#1a0f1f" },
  },
];

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
  globalThis.dispatchEvent?.(new Event("tg:cosmetics"));
}
