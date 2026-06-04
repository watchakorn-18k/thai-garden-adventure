import type { CropId, Direction, Tool } from "./game-types";
import { DEFAULT_COSMETICS, type PlayerCosmetics } from "./player-cosmetics";

/**
 * Pixel-art rect data ported from the SVG components (PixelFarmer / PixelCrop)
 * so Phaser can draw the same 16x16 sprites with Graphics. Each rect is
 * [x, y, w, h, colorHex]. Coordinates live on a 16x16 grid.
 */
export type Rect = [number, number, number, number, string];
export const ART_GRID = 16;

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const BASE = {
  skin: "#f0c090",
  skinDark: "#c08858",
  shoe: "#2a1810",
  hair: "#1a0f08",
  outline: "#1a1208",
  tool: "#8b5a2b",
  toolMetal: "#9aa0a8",
  toolMetalDark: "#555a62",
  water: "#4cc2ee",
  seed: "#5a8a3a",
};

export interface Palette {
  hat: string;
  hatDark: string;
  skin: string;
  skinDark: string;
  shirt: string;
  shirtDark: string;
  pants: string;
  pantsDark: string;
  shoe: string;
  hair: string;
  outline: string;
  tool: string;
  toolMetal: string;
  toolMetalDark: string;
  water: string;
  seed: string;
}

export function paletteFor(cosmetics: PlayerCosmetics): Palette {
  return {
    ...BASE,
    hat: cosmetics.hat,
    hatDark: shade(cosmetics.hat, -70),
    shirt: cosmetics.shirt,
    shirtDark: shade(cosmetics.shirt, -70),
    pants: cosmetics.pants,
    pantsDark: shade(cosmetics.pants, -70),
  };
}

function frontBody(swing: number, p: Palette): Rect[] {
  const lf = swing === 0;
  return [
    [2, 3, 12, 1, p.hat],
    [3, 2, 10, 1, p.hat],
    [2, 4, 12, 1, p.hatDark],
    [5, 1, 6, 1, p.hat],
    [6, 0, 4, 1, p.hatDark],
    [5, 5, 6, 3, p.skin],
    [5, 8, 6, 1, p.skinDark],
    [6, 6, 1, 1, p.outline],
    [9, 6, 1, 1, p.outline],
    [4, 9, 8, 3, p.shirt],
    [4, 11, 8, 1, p.shirtDark],
    [3, lf ? 10 : 9, 1, 3, p.skin],
    [12, lf ? 9 : 10, 1, 3, p.skin],
    [5, 12, 6, 2, p.pants],
    [5, 13, 6, 1, p.pantsDark],
    [5, lf ? 14 : 13, 2, 2, p.shoe],
    [9, lf ? 13 : 14, 2, 2, p.shoe],
  ];
}

function backBody(swing: number, p: Palette): Rect[] {
  const rf = swing === 0;
  return [
    [2, 3, 12, 1, p.hat],
    [3, 2, 10, 1, p.hat],
    [2, 4, 12, 1, p.hatDark],
    [5, 1, 6, 1, p.hat],
    [6, 0, 4, 1, p.hatDark],
    [5, 5, 6, 3, p.hair],
    [5, 8, 6, 1, p.skinDark],
    [4, 9, 8, 3, p.shirtDark],
    [3, rf ? 9 : 10, 1, 3, p.skinDark],
    [12, rf ? 10 : 9, 1, 3, p.skinDark],
    [5, 12, 6, 2, p.pantsDark],
    [5, rf ? 13 : 14, 2, 2, p.shoe],
    [9, rf ? 14 : 13, 2, 2, p.shoe],
  ];
}

function sideBody(swing: number, p: Palette): Rect[] {
  return [
    [2, 3, 12, 1, p.hat],
    [3, 2, 10, 1, p.hat],
    [2, 4, 12, 1, p.hatDark],
    [5, 1, 6, 1, p.hat],
    [6, 0, 4, 1, p.hatDark],
    [5, 5, 6, 3, p.skin],
    [10, 6, 1, 1, p.outline],
    [5, 8, 6, 1, p.skinDark],
    [5, 9, 6, 3, p.shirt],
    [5, 11, 6, 1, p.shirtDark],
    [10, 9, 2, 3, p.shirt],
    [6, 12, 4, 2, p.pants],
    [swing === 0 ? 6 : 5, 14, 2, 2, p.shoe],
    [swing === 0 ? 8 : 9, 14, 2, 2, p.shoe],
  ];
}

export function sideToolOverlay(tool: Tool, p: Palette): Rect[] {
  if (tool === "hoe") {
    return [
      [11, 6, 1, 8, p.tool],
      [12, 7, 1, 7, p.tool],
      [12, 3, 4, 2, p.toolMetal],
      [12, 5, 4, 1, p.toolMetalDark],
    ];
  }
  if (tool === "watering_can") {
    return [
      [10, 8, 4, 3, p.toolMetal],
      [10, 10, 4, 1, p.toolMetalDark],
      [14, 9, 1, 1, p.toolMetal],
      [15, 11, 1, 1, p.water],
      [14, 13, 1, 1, p.water],
    ];
  }
  return [
    [12, 7, 1, 1, p.seed],
    [14, 9, 1, 1, p.seed],
    [13, 11, 1, 1, p.seed],
  ];
}

export function verticalToolOverlay(tool: Tool, p: Palette): Rect[] {
  if (tool === "hoe") {
    return [
      [7, 6, 2, 8, p.tool],
      [6, 2, 4, 2, p.toolMetal],
      [6, 4, 4, 1, p.toolMetalDark],
    ];
  }
  if (tool === "watering_can") {
    return [
      [6, 7, 4, 3, p.toolMetal],
      [6, 9, 4, 1, p.toolMetalDark],
      [5, 8, 1, 1, p.toolMetal],
      [7, 11, 1, 1, p.water],
      [9, 12, 1, 1, p.water],
    ];
  }
  return [
    [7, 10, 1, 1, p.seed],
    [9, 11, 1, 1, p.seed],
    [8, 13, 1, 1, p.seed],
  ];
}

/** Build the full rect list for a farmer in a given pose. `flip` is handled by the caller. */
export function farmerRects(opts: {
  direction: Direction;
  swing: number;
  acting: boolean;
  tool: Tool;
  cosmetics?: PlayerCosmetics;
}): Rect[] {
  const { direction, swing, acting, tool, cosmetics = DEFAULT_COSMETICS } = opts;
  const p = paletteFor(cosmetics);
  const isVertical = direction === "up" || direction === "down";

  let body: Rect[];
  if (direction === "down") body = frontBody(swing, p);
  else if (direction === "up") body = backBody(swing, p);
  else body = sideBody(swing, p);

  if (!acting) return body;
  return body.concat(isVertical ? verticalToolOverlay(tool, p) : sideToolOverlay(tool, p));
}

// === Crops (ported from PixelCrop.tsx) ======================================

const SOIL = "#3a2010";

function withered(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [7, 11, 2, 3, "#5c4033"],
    [6, 12, 1, 2, "#5c4033"],
    [9, 12, 1, 2, "#5c4033"],
    [4, 13, 2, 1, "#4a3525"],
    [10, 13, 2, 1, "#4a3525"],
    [6, 10, 4, 1, "#4a3525"],
  ];
}

function sprout(): Rect[] {
  return [
    [7, 11, 2, 3, "#3a6b2a"],
    [6, 10, 1, 2, "#5fa148"],
    [9, 10, 1, 2, "#5fa148"],
    [7, 9, 2, 2, "#8bc967"],
    [6, 14, 4, 1, SOIL],
  ];
}

function mid(color: string): Rect[] {
  return [
    [7, 9, 2, 5, "#3a6b2a"],
    [5, 8, 2, 2, color],
    [9, 8, 2, 2, color],
    [6, 6, 4, 2, color],
    [6, 14, 4, 1, SOIL],
  ];
}

function chili(): Rect[] {
  return [
    [7, 10, 2, 3, "#3a6b2a"],
    [5, 9, 2, 1, "#5fa148"],
    [9, 9, 2, 1, "#5fa148"],
    [4, 8, 2, 2, "#4e8c3a"],
    [10, 8, 2, 2, "#4e8c3a"],
    [3, 10, 1, 1, "#3a6b2a"],
    [3, 11, 2, 1, "#d92e2e"],
    [2, 12, 2, 2, "#e84444"],
    [2, 14, 1, 1, "#a01818"],
    [12, 10, 1, 1, "#3a6b2a"],
    [11, 11, 2, 1, "#d92e2e"],
    [12, 12, 2, 2, "#e84444"],
    [13, 14, 1, 1, "#a01818"],
    [7, 6, 2, 1, "#3a6b2a"],
    [7, 7, 2, 2, "#e84444"],
    [7, 9, 2, 1, "#a01818"],
    [6, 14, 4, 1, SOIL],
  ];
}

function rice(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [5, 9, 1, 5, "#7a9a3a"],
    [7, 7, 1, 7, "#7a9a3a"],
    [10, 9, 1, 5, "#7a9a3a"],
    [4, 6, 3, 2, "#e8c454"],
    [4, 7, 3, 1, "#c89a30"],
    [6, 4, 3, 2, "#f4d864"],
    [6, 5, 3, 1, "#c89a30"],
    [9, 6, 3, 2, "#e8c454"],
    [9, 7, 3, 1, "#c89a30"],
    [5, 3, 1, 1, "#f4d864"],
    [9, 3, 1, 1, "#f4d864"],
    [7, 2, 1, 1, "#f4d864"],
  ];
}

function morningGlory(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [7, 9, 1, 5, "#3a6b2a"],
    [8, 9, 1, 5, "#3a6b2a"],
    [4, 7, 3, 3, "#5fa148"],
    [3, 8, 1, 2, "#4e8c3a"],
    [4, 8, 2, 1, "#8bc967"],
    [9, 7, 3, 3, "#5fa148"],
    [12, 8, 1, 2, "#4e8c3a"],
    [10, 8, 2, 1, "#8bc967"],
    [6, 5, 4, 3, "#6ab04c"],
    [6, 6, 2, 1, "#8bc967"],
    [6, 4, 2, 1, "#5fa148"],
    [8, 4, 2, 1, "#5fa148"],
    [9, 3, 2, 2, "#9b59d4"],
    [10, 4, 1, 1, "#ffffff"],
  ];
}

function eggplant(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [7, 9, 2, 5, "#3a6b2a"],
    [4, 8, 3, 2, "#5fa148"],
    [9, 8, 3, 2, "#5fa148"],
    [6, 6, 4, 2, "#6ab04c"],
    [3, 10, 1, 1, "#5fa148"],
    [2, 11, 3, 3, "#6b2e94"],
    [2, 11, 3, 1, "#8b4ec0"],
    [3, 13, 2, 1, "#4a1e6b"],
    [6, 9, 1, 1, "#5fa148"],
    [9, 9, 1, 1, "#5fa148"],
    [6, 10, 4, 4, "#6b2e94"],
    [6, 10, 4, 1, "#8b4ec0"],
    [6, 13, 4, 1, "#4a1e6b"],
    [7, 11, 1, 1, "#8b4ec0"],
  ];
}

export function cropRects(id: CropId, stage: number): Rect[] {
  if (stage === 0) return sprout();
  if (stage === 1) {
    const color =
      id === "chili"
        ? "#5fa148"
        : id === "rice"
          ? "#9bb84a"
          : id === "morning_glory"
            ? "#6ab04c"
            : "#5fa148";
    return mid(color);
  }
  if (stage === 2) {
    if (id === "chili") return chili();
    if (id === "rice") return rice();
    if (id === "morning_glory") return morningGlory();
    return eggplant();
  }
  return withered();
}
