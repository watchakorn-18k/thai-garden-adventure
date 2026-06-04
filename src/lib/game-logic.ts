import { COLS, CROPS, ROWS, type CropId, type Direction, type Tile, type Tool } from "./game-types";

export type GameEvent =
  | { kind: "till"; x: number; y: number }
  | { kind: "water"; x: number; y: number }
  | { kind: "plant"; x: number; y: number; cropId: CropId }
  | { kind: "harvest"; x: number; y: number; cropId: CropId; reward: number }
  | { kind: "insufficient_funds"; x: number; y: number };

export interface ActionInput {
  tiles: Tile[][];
  coins: number;
  pos: { x: number; y: number };
  dir: Direction;
  tool: Tool;
  seedChoice: CropId;
  now: number;
  marketPrices?: Record<CropId, number>;
}

export interface ActionResult {
  tiles: Tile[][];
  coins: number;
  events: GameEvent[];
}

export interface ComboState {
  combo: number;
  lastHarvestAt: number;
  crops: CropId[];
}

export function updateComboAndGetBonus(
  state: ComboState,
  cropId: CropId,
  baseReward: number,
  now: number,
): { bonus: number; nextState: ComboState } {
  if (baseReward === 0) {
    return {
      bonus: 0,
      nextState: {
        combo: 0,
        lastHarvestAt: now,
        crops: [],
      },
    };
  }

  const isCombo = now - state.lastHarvestAt < 2200;
  const nextCombo = isCombo ? state.combo + 1 : 1;
  const nextCrops = isCombo ? [...state.crops] : [];
  if (!nextCrops.includes(cropId)) {
    nextCrops.push(cropId);
  }

  // 1. Combo bonus: 25% * baseReward * min(combo, 6)
  const comboBonus = nextCombo >= 2 ? Math.floor(baseReward * 0.25 * Math.min(nextCombo, 6)) : 0;

  // 2. Crop Rotation (variety) bonus: 15% * baseReward * (variety - 1)
  const variety = nextCrops.length;
  const rotationBonus = variety > 1 ? Math.floor(baseReward * 0.15 * (variety - 1)) : 0;

  return {
    bonus: comboBonus + rotationBonus,
    nextState: {
      combo: nextCombo,
      lastHarvestAt: now,
      crops: nextCrops,
    },
  };
}

export function facingTile(
  pos: { x: number; y: number },
  dir: Direction,
): { x: number; y: number } | null {
  let x = Math.round(pos.x);
  let y = Math.round(pos.y);
  if (dir === "up") y -= 1;
  else if (dir === "down") y += 1;
  else if (dir === "left") x -= 1;
  else if (dir === "right") x += 1;
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
  return { x, y };
}

function cloneTiles(tiles: Tile[][]): Tile[][] {
  return tiles.map((r) => r.map((c) => ({ ...c, crop: c.crop ? { ...c.crop } : undefined })));
}

export function applyAction(input: ActionInput): ActionResult {
  const target = facingTile(input.pos, input.dir);
  if (!target) return { tiles: input.tiles, coins: input.coins, events: [] };

  const next = cloneTiles(input.tiles);
  const tile = next[target.y][target.x];
  const events: GameEvent[] = [];
  let coins = input.coins;

  if (tile.crop && tile.crop.stage >= 2) {
    const crop = CROPS[tile.crop.id];
    const baseReward = input.marketPrices
      ? (input.marketPrices[tile.crop.id] ?? crop.sellPrice)
      : crop.sellPrice;
    const reward = tile.crop.stage === 3 ? 0 : baseReward;
    coins += reward;
    events.push({
      kind: "harvest",
      x: target.x,
      y: target.y,
      cropId: tile.crop.id,
      reward,
    });
    next[target.y][target.x] = { type: "grass" };
    return { tiles: next, coins, events };
  }

  if (input.tool === "hoe") {
    if (tile.type === "grass") {
      next[target.y][target.x] = { type: "tilled" };
      events.push({ kind: "till", x: target.x, y: target.y });
    }
  } else if (input.tool === "watering_can") {
    // Only water if tile is tilled, or if it has a growing crop (stage < 2) on dry soil
    const isGrowingCrop = tile.crop && tile.crop.stage < 2;
    if (tile.type === "tilled" || (isGrowingCrop && tile.type !== "watered")) {
      const updatedCrop = tile.crop ? { ...tile.crop, plantedAt: input.now } : undefined;
      next[target.y][target.x] = { ...tile, type: "watered", crop: updatedCrop };
      events.push({ kind: "water", x: target.x, y: target.y });
    }
  } else if (input.tool === "seed") {
    if ((tile.type === "tilled" || tile.type === "watered") && !tile.crop) {
      const crop = CROPS[input.seedChoice];
      if (coins >= crop.seedCost) {
        coins -= crop.seedCost;
        next[target.y][target.x] = {
          ...tile,
          crop: { id: input.seedChoice, plantedAt: input.now, stage: 0 },
        };
        events.push({ kind: "plant", x: target.x, y: target.y, cropId: input.seedChoice });
      } else {
        events.push({ kind: "insufficient_funds", x: target.x, y: target.y });
      }
    }
  }

  return { tiles: next, coins, events };
}

export function tickGrowth(tiles: Tile[][], now: number): { tiles: Tile[][]; changed: boolean } {
  let changed = false;
  const next = tiles.map((row) =>
    row.map((c) => {
      if (!c.crop) return c;

      const crop = CROPS[c.crop.id];

      // Grow growing crops on watered soil
      if (c.type === "watered" && c.crop.stage < 2) {
        if (now - c.crop.plantedAt > crop.growTime) {
          changed = true;
          return {
            ...c,
            type: "tilled" as const, // soil dries up
            crop: { ...c.crop, stage: c.crop.stage + 1, plantedAt: now },
          };
        }
      }

      // Decay/wither ripe crops
      if (c.crop.stage === 2) {
        if (now - c.crop.plantedAt > crop.growTime * 1.5) {
          changed = true;
          return {
            ...c,
            crop: { ...c.crop, stage: 3, plantedAt: now },
          };
        }
      }

      return c;
    }),
  );
  return { tiles: changed ? next : tiles, changed };
}

export function sleepNight(tiles: Tile[][], coins: number): { tiles: Tile[][]; coins: number } {
  return {
    tiles: tiles.map((r) =>
      r.map((c) => (c.type === "watered" ? { ...c, type: "tilled" as const } : c)),
    ),
    coins: coins + 5,
  };
}

export function movePos(pos: { x: number; y: number }, dir: Direction): { x: number; y: number } {
  let { x, y } = pos;
  if (dir === "up") y = Math.max(0, y - 1);
  if (dir === "down") y = Math.min(ROWS - 1, y + 1);
  if (dir === "left") x = Math.max(0, x - 1);
  if (dir === "right") x = Math.min(COLS - 1, x + 1);
  return { x, y };
}
