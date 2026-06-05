import { COLS, CROPS, ROWS, type CropId, type Direction, type Tile, type Tool } from "./game-types";

export interface FarmBotPlan {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  dir: Direction;
  tool: Tool;
  seedChoice: CropId;
}

const ALL_CROPS = Object.keys(CROPS) as CropId[];

function chooseBotSeed(coins: number, rotation: number): CropId | undefined {
  const affordable = ALL_CROPS.filter((id) => coins >= CROPS[id].seedCost);
  if (!affordable.length) return undefined;
  affordable.sort(
    (a, b) => CROPS[b].sellPrice / CROPS[b].growTime - CROPS[a].sellPrice / CROPS[a].growTime,
  );
  return affordable[rotation % affordable.length];
}

function tileNeeds(
  tile: Tile,
  coins: number,
  rotation: number,
): { tool: Tool; seedChoice?: CropId } | null {
  if (tile.crop) {
    if (tile.crop.stage >= 2) return { tool: "hoe" };
    if (tile.type !== "watered") return { tool: "watering_can" };
    return null;
  }
  if (tile.type === "grass") return { tool: "hoe" };
  const seedChoice = chooseBotSeed(coins, rotation);
  if (!seedChoice) return null;
  return { tool: "seed", seedChoice };
}

function tilePriority(tile: Tile, tool: Tool): number {
  if (tile.crop) {
    if (tile.crop.stage === 2) return 0;
    if (tile.crop.stage === 3) return 4;
    return 1;
  }
  return tool === "hoe" ? 3 : 2;
}

function neighborStand(
  tx: number,
  ty: number,
  pos: { x: number; y: number },
): { sx: number; sy: number; dir: Direction } {
  const cands = (
    [
      { sx: tx, sy: ty + 1, dir: "up" },
      { sx: tx, sy: ty - 1, dir: "down" },
      { sx: tx + 1, sy: ty, dir: "left" },
      { sx: tx - 1, sy: ty, dir: "right" },
    ] as { sx: number; sy: number; dir: Direction }[]
  ).filter((c) => c.sx >= 0 && c.sx < COLS && c.sy >= 0 && c.sy < ROWS);
  cands.sort(
    (a, b) => Math.hypot(a.sx - pos.x, a.sy - pos.y) - Math.hypot(b.sx - pos.x, b.sy - pos.y),
  );
  return cands[0];
}

export function chooseFarmBotPlan({
  tiles,
  pos,
  coins,
  seedRotation,
}: {
  tiles: Tile[][];
  pos: { x: number; y: number };
  coins: number;
  seedRotation: number;
}): FarmBotPlan | null {
  let best: { x: number; y: number; tool: Tool; seedChoice?: CropId } | null = null;
  let bestPri = 99;
  let bestDist = Infinity;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = tiles[y][x];
      const needs = tileNeeds(tile, coins, seedRotation);
      if (!needs) continue;
      const pri = tilePriority(tile, needs.tool);
      const d = Math.hypot(x - pos.x, y - pos.y);
      if (pri < bestPri || (pri === bestPri && d < bestDist)) {
        best = { x, y, tool: needs.tool, seedChoice: needs.seedChoice };
        bestPri = pri;
        bestDist = d;
      }
    }
  }

  if (!best) return null;
  const stand = neighborStand(best.x, best.y, pos);
  return {
    tx: best.x,
    ty: best.y,
    sx: stand.sx,
    sy: stand.sy,
    dir: stand.dir,
    tool: best.tool,
    seedChoice: best.seedChoice ?? ALL_CROPS[0],
  };
}

export function isFarmBotPlanValid({
  tiles,
  coins,
  seedRotation,
  plan,
}: {
  tiles: Tile[][];
  coins: number;
  seedRotation: number;
  plan: FarmBotPlan;
}): boolean {
  const tile = tiles[plan.ty]?.[plan.tx];
  if (!tile) return false;
  const needs = tileNeeds(tile, coins, seedRotation);
  return Boolean(needs) && needs!.tool === plan.tool;
}
