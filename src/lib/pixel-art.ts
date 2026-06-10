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

function hatRects(shape: PlayerCosmetics["hatShape"], p: Palette): Rect[] {
  if (shape === "wide") {
    return [
      [1, 3, 14, 1, p.hat],
      [3, 2, 10, 1, p.hat],
      [1, 4, 14, 1, p.hatDark],
      [5, 1, 6, 1, p.hat],
    ];
  }
  if (shape === "crown") {
    return [
      [4, 3, 8, 2, p.hat],
      [4, 1, 2, 2, p.hat],
      [7, 0, 2, 3, p.hat],
      [10, 1, 2, 2, p.hat],
      [4, 4, 8, 1, p.hatDark],
    ];
  }
  if (shape === "leaf") {
    return [
      [3, 3, 10, 2, p.hat],
      [5, 1, 6, 2, p.hat],
      [10, 0, 3, 2, "#8bc967"],
      [12, 1, 2, 1, "#4e8c3a"],
      [3, 4, 10, 1, p.hatDark],
    ];
  }
  if (shape === "halo") {
    return [
      [4, 0, 8, 1, p.hat],
      [3, 1, 2, 1, p.hatDark],
      [11, 1, 2, 1, p.hatDark],
      [3, 3, 10, 2, p.hat],
      [3, 4, 10, 1, p.hatDark],
    ];
  }
  return [
    [2, 3, 12, 1, p.hat],
    [3, 2, 10, 1, p.hat],
    [2, 4, 12, 1, p.hatDark],
    [5, 1, 6, 1, p.hat],
    [6, 0, 4, 1, p.hatDark],
  ];
}

function shirtRects(style: PlayerCosmetics["shirtStyle"], p: Palette, side = false): Rect[] {
  const x = side ? 5 : 4;
  const w = side ? 6 : 8;
  if (style === "overalls") {
    return [
      [x, 9, w, 3, p.shirt],
      [x + 2, 9, 1, 3, p.pants],
      [x + w - 3, 9, 1, 3, p.pants],
      [x, 11, w, 1, p.shirtDark],
    ];
  }
  if (style === "sash") {
    return [
      [x, 9, w, 3, p.shirt],
      [x + 1, 9, 2, 1, p.hat],
      [x + 3, 10, 2, 1, p.hat],
      [x + 5, 11, 2, 1, p.hat],
    ];
  }
  if (style === "jacket") {
    return [
      [x, 9, w, 3, p.shirtDark],
      [x + 1, 9, Math.max(1, w - 2), 2, p.shirt],
      [x + Math.floor(w / 2), 9, 1, 3, p.hatDark],
    ];
  }
  if (style === "champion") {
    return [
      [x, 9, w, 3, p.shirt],
      [x + 1, 9, w - 2, 1, p.hat],
      [x + 3, 10, 2, 2, p.hatDark],
      [x, 11, w, 1, p.shirtDark],
    ];
  }
  return [
    [x, 9, w, 3, p.shirt],
    [x, 11, w, 1, p.shirtDark],
  ];
}

function auraRects(aura: PlayerCosmetics["aura"]): Rect[] {
  if (aura === "gold") {
    return [
      [1, 2, 1, 10, "#ffd24a"],
      [14, 2, 1, 10, "#ffd24a"],
      [4, -1, 8, 1, "#ffd24a"],
      [3, 14, 10, 1, "#ffd24a"],
    ];
  }
  if (aura === "spark") {
    return [
      [1, 1, 2, 2, "#ffd24a"],
      [13, 3, 2, 2, "#f4e4c1"],
      [2, 13, 2, 2, "#c08bd9"],
      [13, 12, 2, 2, "#7fd8ff"],
      [7, -1, 2, 2, "#ffd24a"],
    ];
  }
  if (aura === "rainbow") {
    return [
      [0, 3, 1, 9, "#d94e6a"],
      [2, 1, 1, 11, "#ffd24a"],
      [13, 1, 1, 11, "#8bc967"],
      [15, 3, 1, 9, "#7fd8ff"],
      [4, -1, 8, 1, "#ffd24a"],
    ];
  }
  return [];
}

function frontBody(swing: number, p: Palette, cosmetics: PlayerCosmetics): Rect[] {
  const lf = swing === 0;
  return [
    ...auraRects(cosmetics.aura),
    ...hatRects(cosmetics.hatShape, p),
    [5, 5, 6, 3, p.skin],
    [5, 8, 6, 1, p.skinDark],
    [6, 6, 1, 1, p.outline],
    [9, 6, 1, 1, p.outline],
    ...shirtRects(cosmetics.shirtStyle, p),
    [3, lf ? 10 : 9, 1, 3, p.skin],
    [12, lf ? 9 : 10, 1, 3, p.skin],
    [5, 12, 6, 2, p.pants],
    [5, 13, 6, 1, p.pantsDark],
    [5, lf ? 14 : 13, 2, 2, p.shoe],
    [9, lf ? 13 : 14, 2, 2, p.shoe],
  ];
}

function backBody(swing: number, p: Palette, cosmetics: PlayerCosmetics): Rect[] {
  const rf = swing === 0;
  return [
    ...auraRects(cosmetics.aura),
    ...hatRects(cosmetics.hatShape, p),
    [5, 5, 6, 3, p.hair],
    [5, 8, 6, 1, p.skinDark],
    ...shirtRects(cosmetics.shirtStyle, p),
    [3, rf ? 9 : 10, 1, 3, p.skinDark],
    [12, rf ? 10 : 9, 1, 3, p.skinDark],
    [5, 12, 6, 2, p.pantsDark],
    [5, rf ? 13 : 14, 2, 2, p.shoe],
    [9, rf ? 14 : 13, 2, 2, p.shoe],
  ];
}

function sideBody(swing: number, p: Palette, cosmetics: PlayerCosmetics): Rect[] {
  return [
    ...auraRects(cosmetics.aura),
    ...hatRects(cosmetics.hatShape, p),
    [5, 5, 6, 3, p.skin],
    [10, 6, 1, 1, p.outline],
    [5, 8, 6, 1, p.skinDark],
    ...shirtRects(cosmetics.shirtStyle, p, true),
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
      // can body, handle, and spout — mirrors for left-facing use.
      [9, 7, 5, 4, p.toolMetal],
      [9, 7, 5, 1, "#d8d3d0"],
      [9, 10, 5, 1, p.toolMetalDark],
      [10, 5, 3, 1, "#d8d3d0"],
      [9, 6, 1, 2, p.toolMetal],
      [13, 6, 1, 2, p.toolMetal],
      [14, 7, 2, 1, "#d8d3d0"],
      [15, 6, 1, 1, "#b8b2b0"],
      // water stream in front of spout.
      [15, 8, 1, 1, p.water],
      [17, 9, 1, 1, p.water],
      [16, 11, 1, 1, "#7fd8ff"],
      [18, 12, 1, 1, p.water],
    ];
  }
  return [
    [12, 7, 1, 1, p.seed],
    [14, 9, 1, 1, p.seed],
    [13, 11, 1, 1, p.seed],
  ];
}

export function verticalToolOverlay(tool: Tool, p: Palette, direction: Direction = "down"): Rect[] {
  if (tool === "hoe") {
    return [
      [7, 6, 2, 8, p.tool],
      [6, 2, 4, 2, p.toolMetal],
      [6, 4, 4, 1, p.toolMetalDark],
    ];
  }
  if (tool === "watering_can") {
    if (direction === "up") {
      return [
        // back view: centered on the farmer's back, with rear handle visible.
        [4, 6, 8, 5, p.toolMetal],
        [4, 6, 8, 1, "#d8d3d0"],
        [4, 10, 8, 1, p.toolMetalDark],
        [6, 4, 4, 1, "#d8d3d0"],
        [5, 5, 1, 2, p.toolMetal],
        [10, 5, 1, 2, p.toolMetal],
        [7, 7, 2, 2, p.toolMetalDark],
        [12, 7, 2, 1, "#d8d3d0"],
        [13, 6, 1, 1, "#b8b2b0"],
        [12, 5, 1, 1, p.water],
        [10, 3, 1, 1, "#7fd8ff"],
        [13, 2, 1, 1, p.water],
        [11, 1, 1, 1, "#7fd8ff"],
      ];
    }
    return [
      // front view: centered in front of the farmer, with face plate and spout.
      [4, 7, 8, 5, p.toolMetal],
      [4, 7, 8, 1, "#d8d3d0"],
      [4, 11, 8, 1, p.toolMetalDark],
      [6, 5, 4, 1, "#d8d3d0"],
      [5, 6, 1, 2, p.toolMetal],
      [10, 6, 1, 2, p.toolMetal],
      [7, 8, 2, 2, "#d8d3d0"],
      [3, 9, 2, 1, "#d8d3d0"],
      [2, 10, 1, 1, "#b8b2b0"],
      [4, 12, 1, 1, p.water],
      [7, 13, 1, 1, "#7fd8ff"],
      [5, 15, 1, 1, p.water],
      [9, 16, 1, 1, "#7fd8ff"],
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
  if (direction === "down") body = frontBody(swing, p, cosmetics);
  else if (direction === "up") body = backBody(swing, p, cosmetics);
  else body = sideBody(swing, p, cosmetics);

  if (!acting) return body;
  return body.concat(
    isVertical ? verticalToolOverlay(tool, p, direction) : sideToolOverlay(tool, p),
  );
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

function mango(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [7, 9, 2, 5, "#3a6b2a"],
    [4, 7, 4, 3, "#5fa148"],
    [8, 7, 4, 3, "#5fa148"],
    [5, 5, 6, 2, "#f4d864"],
    [4, 7, 8, 3, "#f4a824"],
    [4, 7, 8, 1, "#f4d864"],
    [5, 10, 6, 2, "#e88c14"],
    [5, 8, 2, 1, "#fbe07a"],
  ];
}

function lemongrass(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [5, 4, 1, 10, "#6ab04c"],
    [7, 3, 1, 11, "#8bc967"],
    [10, 5, 1, 9, "#6ab04c"],
    [3, 6, 3, 1, "#5fa148"],
    [2, 7, 2, 1, "#4e8c3a"],
    [11, 5, 3, 1, "#5fa148"],
    [12, 6, 2, 1, "#4e8c3a"],
    [8, 4, 3, 1, "#5fa148"],
    [5, 13, 6, 1, "#3a6b2a"],
  ];
}

function papaya(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [7, 8, 2, 6, "#8b6420"],
    [4, 5, 3, 3, "#5fa148"],
    [9, 5, 3, 3, "#5fa148"],
    [6, 3, 4, 3, "#6ab04c"],
    [5, 4, 2, 1, "#8bc967"],
    [9, 4, 2, 1, "#8bc967"],
    [5, 8, 2, 4, "#f47820"],
    [5, 8, 2, 1, "#f4c060"],
    [9, 9, 2, 4, "#f47820"],
    [9, 9, 2, 1, "#f4c060"],
  ];
}

function basil(): Rect[] {
  return [
    [5, 14, 6, 1, SOIL],
    [7, 7, 2, 7, "#3a6b2a"],
    [4, 8, 4, 4, "#5fa148"],
    [4, 8, 4, 1, "#8bc967"],
    [8, 8, 4, 4, "#5fa148"],
    [8, 8, 4, 1, "#8bc967"],
    [5, 5, 6, 4, "#6ab04c"],
    [5, 5, 6, 1, "#8bc967"],
    [7, 3, 2, 2, "#9b59d4"],
    [8, 4, 1, 1, "#ffffff"],
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
            : id === "mango"
              ? "#f4a824"
              : id === "lemongrass"
                ? "#8bc967"
                : id === "papaya"
                  ? "#f47820"
                  : id === "basil"
                    ? "#6ab04c"
                    : "#5fa148";
    return mid(color);
  }
  if (stage === 2) {
    if (id === "chili") return chili();
    if (id === "rice") return rice();
    if (id === "morning_glory") return morningGlory();
    if (id === "mango") return mango();
    if (id === "lemongrass") return lemongrass();
    if (id === "papaya") return papaya();
    if (id === "basil") return basil();
    return eggplant();
  }
  return withered();
}
