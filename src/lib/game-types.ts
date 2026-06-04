export type Direction = "up" | "down" | "left" | "right";
export type TileType = "grass" | "tilled" | "watered";
export type CropId = "chili" | "rice" | "morning_glory" | "eggplant";
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
  chili: { id: "chili", name: "พริก", growTime: 6000, sellPrice: 25, seedCost: 8 },
  rice: { id: "rice", name: "ข้าว", growTime: 9000, sellPrice: 40, seedCost: 12 },
  morning_glory: {
    id: "morning_glory",
    name: "ผักบุ้ง",
    growTime: 5000,
    sellPrice: 18,
    seedCost: 5,
  },
  eggplant: { id: "eggplant", name: "มะเขือ", growTime: 8000, sellPrice: 35, seedCost: 10 },
};

export function makeEmptyField(): Tile[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ type: "grass" as TileType })),
  );
}
