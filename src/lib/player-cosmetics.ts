export type HatShapeId = "straw" | "wide" | "crown" | "leaf" | "halo";
export type ShirtStyleId = "plain" | "overalls" | "sash" | "jacket" | "champion";
export type AuraEffectId = "none" | "gold" | "spark" | "rainbow";
export type ToolSkinId = "basic" | "golden" | "aqua" | "starlight";
export type ShoeTrailId = "none" | "fire" | "lightning";

export interface PlayerCosmetics {
  hat: string;
  shirt: string;
  pants: string;
  shoe: string;
  hatShape: HatShapeId;
  shirtStyle: ShirtStyleId;
  aura: AuraEffectId;
  shoeTrail: ShoeTrailId;
  hoeSkin: ToolSkinId;
  wateringCanSkin: ToolSkinId;
}

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  hat: "#d9a441",
  shirt: "#c8412e",
  pants: "#3a5a8a",
  shoe: "#2a1810",
  hatShape: "straw",
  shirtStyle: "plain",
  aura: "none",
  shoeTrail: "none",
  hoeSkin: "basic",
  wateringCanSkin: "basic",
};

export const COSMETIC_PALETTES = {
  hat: ["#d9a441", "#ffd24a", "#f0a05b", "#8bc967", "#7fd8ff", "#c08bd9"],
  shirt: ["#c8412e", "#d94e6a", "#4cc2ee", "#6ab04c", "#9b59d4", "#f0a05b"],
  pants: ["#3a5a8a", "#355070", "#5a3f12", "#4a2f5c", "#2a6e9e", "#5a2f17"],
  shoe: ["#2a1810", "#d94e6a", "#f47820", "#ffd24a", "#7fd8ff", "#1a0f1f"],
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
    id: "golden_hoe",
    name: "จอบทองประกาย",
    description: "จอบทองเรืองแสง ระดับเริ่มต้น",
    price: 260,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hoeSkin: "golden",
    },
  },
  {
    id: "aqua_hoe",
    name: "จอบคริสตัลฟ้า",
    description: "จอบฟ้า particle น้ำค้าง",
    price: 420,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hoeSkin: "aqua",
    },
  },
  {
    id: "starlight_hoe",
    name: "จอบดาวตก",
    description: "จอบม่วงละอองดาวขั้นสูง",
    price: 680,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hoeSkin: "starlight",
    },
  },
  {
    id: "golden_watering_can",
    name: "บัวทองประกาย",
    description: "บัวรดน้ำทองเรืองแสง",
    price: 300,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      wateringCanSkin: "golden",
    },
  },
  {
    id: "aqua_watering_can",
    name: "บัวคริสตัลฟ้า",
    description: "บัวฟ้า particle น้ำแรง",
    price: 480,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      wateringCanSkin: "aqua",
    },
  },
  {
    id: "starlight_watering_can",
    name: "บัวดาวตก",
    description: "บัวม่วงละอองดาวขั้นสูง",
    price: 760,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      wateringCanSkin: "starlight",
    },
  },
  {
    id: "fire_shoes",
    name: "รองเท้าติดไฟ",
    description: "รอยเท้าไฟลุกแรงทุกก้าว",
    price: 520,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      shoe: "#d94e6a",
      shoeTrail: "fire",
    },
  },
  {
    id: "lightning_shoes",
    name: "รองเท้าสายฟ้า",
    description: "รอยเท้าสายฟ้าฟาดติดพื้น",
    price: 620,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      shoe: "#7fd8ff",
      shoeTrail: "lightning",
    },
  },
  {
    id: "classic_farmer",
    name: "ชาวสวนดั้งเดิม",
    description: "หมวกฟาง เสื้อแดง กางเกงน้ำเงิน",
    price: 0,
    cosmetics: DEFAULT_COSMETICS,
  },
  {
    id: "rice_farmer",
    name: "เอี๊ยมชาวนา",
    description: "หมวกปีกกว้าง + เอี๊ยมทำนา",
    price: 35,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hat: "#f4d864",
      shirt: "#f4e4c1",
      pants: "#5a3f12",
      hatShape: "wide",
      shirtStyle: "overalls",
    },
  },
  {
    id: "chili_red",
    name: "ผ้าคาดพริกแดง",
    description: "เสื้อคาดอกแดงแรง มีทรงใหม่",
    price: 55,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hat: "#ffd24a",
      shirt: "#d94e6a",
      pants: "#2d1b3d",
      shirtStyle: "sash",
    },
  },
  {
    id: "river_blue",
    name: "แจ็กเก็ตน้ำคลอง",
    description: "หมวกใบไม้ + แจ็กเก็ตสีฟ้า",
    price: 75,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hat: "#8bc967",
      shirt: "#4cc2ee",
      pants: "#2a6e9e",
      hatShape: "leaf",
      shirtStyle: "jacket",
    },
  },
  {
    id: "mango_gold",
    name: "ชุดมะม่วงทอง",
    description: "มงกุฎทอง + aura ทอง",
    price: 160,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hat: "#ffd24a",
      shirt: "#f0a05b",
      pants: "#6b3a1c",
      hatShape: "crown",
      shirtStyle: "champion",
      aura: "gold",
    },
  },
  {
    id: "night_violet",
    name: "ม่วงประกายดาว",
    description: "halo หมวก + spark รอบตัว",
    price: 220,
    cosmetics: {
      ...DEFAULT_COSMETICS,
      hat: "#c08bd9",
      shirt: "#4a2f5c",
      pants: "#1a0f1f",
      hatShape: "halo",
      shirtStyle: "jacket",
      aura: "spark",
    },
  },
];

const STORAGE_KEY = "tg.cosmetics";

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

const HAT_SHAPES = new Set<HatShapeId>(["straw", "wide", "crown", "leaf", "halo"]);
const SHIRT_STYLES = new Set<ShirtStyleId>(["plain", "overalls", "sash", "jacket", "champion"]);
const AURA_EFFECTS = new Set<AuraEffectId>(["none", "gold", "spark", "rainbow"]);
const TOOL_SKINS = new Set<ToolSkinId>(["basic", "golden", "aqua", "starlight"]);
const SHOE_TRAILS = new Set<ShoeTrailId>(["none", "fire", "lightning"]);

function isHatShape(v: unknown): v is HatShapeId {
  return typeof v === "string" && HAT_SHAPES.has(v as HatShapeId);
}

function isShirtStyle(v: unknown): v is ShirtStyleId {
  return typeof v === "string" && SHIRT_STYLES.has(v as ShirtStyleId);
}

function isAuraEffect(v: unknown): v is AuraEffectId {
  return typeof v === "string" && AURA_EFFECTS.has(v as AuraEffectId);
}

function isToolSkin(v: unknown): v is ToolSkinId {
  return typeof v === "string" && TOOL_SKINS.has(v as ToolSkinId);
}

function isShoeTrail(v: unknown): v is ShoeTrailId {
  return typeof v === "string" && SHOE_TRAILS.has(v as ShoeTrailId);
}

export function normalizeCosmetics(input: unknown): PlayerCosmetics {
  if (!input || typeof input !== "object") return DEFAULT_COSMETICS;
  const c = input as Partial<PlayerCosmetics>;
  return {
    hat: isHexColor(c.hat) ? c.hat : DEFAULT_COSMETICS.hat,
    shirt: isHexColor(c.shirt) ? c.shirt : DEFAULT_COSMETICS.shirt,
    pants: isHexColor(c.pants) ? c.pants : DEFAULT_COSMETICS.pants,
    shoe: isHexColor(c.shoe) ? c.shoe : DEFAULT_COSMETICS.shoe,
    hatShape: isHatShape(c.hatShape) ? c.hatShape : DEFAULT_COSMETICS.hatShape,
    shirtStyle: isShirtStyle(c.shirtStyle) ? c.shirtStyle : DEFAULT_COSMETICS.shirtStyle,
    aura: isAuraEffect(c.aura) ? c.aura : DEFAULT_COSMETICS.aura,
    shoeTrail: isShoeTrail(c.shoeTrail) ? c.shoeTrail : DEFAULT_COSMETICS.shoeTrail,
    hoeSkin: isToolSkin(c.hoeSkin) ? c.hoeSkin : DEFAULT_COSMETICS.hoeSkin,
    wateringCanSkin: isToolSkin(c.wateringCanSkin)
      ? c.wateringCanSkin
      : DEFAULT_COSMETICS.wateringCanSkin,
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
