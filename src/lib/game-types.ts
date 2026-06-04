export type Direction = "up" | "down" | "left" | "right";
export type TileType = "grass" | "tilled" | "watered";
export type CropId =
  | "chili"
  | "rice"
  | "morning_glory"
  | "eggplant"
  | "mango"
  | "lemongrass"
  | "papaya"
  | "basil";
export type Tool = "hoe" | "watering_can" | "seed";

export interface Crop {
  id: CropId;
  name: string;
  growTime: number;
  sellPrice: number;
  seedCost: number;
}

export interface Tile {
  type: TileType;
  crop?: { id: CropId; plantedAt: number; stage: number }; // stage: 0 sprout, 1 mid, 2 ripe, 3 withered
}

export const COLS = 12;
export const ROWS = 8;

export const CROPS: Record<CropId, Crop> = {
  morning_glory: {
    id: "morning_glory",
    name: "ผักบุ้ง",
    growTime: 5000,
    sellPrice: 18,
    seedCost: 5,
  },
  basil: { id: "basil", name: "กะเพรา", growTime: 7000, sellPrice: 22, seedCost: 7 },
  chili: { id: "chili", name: "พริก", growTime: 9000, sellPrice: 32, seedCost: 10 },
  lemongrass: { id: "lemongrass", name: "ตะไคร้", growTime: 11000, sellPrice: 36, seedCost: 12 },
  rice: { id: "rice", name: "ข้าว", growTime: 14000, sellPrice: 46, seedCost: 15 },
  eggplant: { id: "eggplant", name: "มะเขือ", growTime: 17000, sellPrice: 52, seedCost: 18 },
  papaya: { id: "papaya", name: "มะละกอ", growTime: 22000, sellPrice: 70, seedCost: 25 },
  mango: { id: "mango", name: "มะม่วง", growTime: 30000, sellPrice: 96, seedCost: 35 },
};

export function makeEmptyField(): Tile[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ type: "grass" as TileType })),
  );
}
