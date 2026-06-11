import type { ToolSkinId } from "@/lib/player-cosmetics";

/** CSS hex color strings for tool-skin particle bursts (hoe = dirt-tinted, water = skin-tinted). */
export const TOOL_SKIN_PARTICLE_COLORS: Record<ToolSkinId, readonly string[]> = {
  basic: ["#6b3a1c", "#8b5a2b", "#3d2412"],
  golden: ["#ffd24a", "#fff5b8", "#e8a23a"],
  aqua: ["#7fd8ff", "#4cc2ee", "#2a8ec0"],
  starlight: ["#c08bd9", "#ffd24a", "#f4e4c1"],
};

/** CSS hex colors for the basic watering-can water-drop burst (no skin applied). */
export const BASIC_WATER_COLORS: readonly string[] = ["#4cc2ee", "#7fd8ff", "#2a8ec0"];

/**
 * Primary overlay/glow color per tool skin (CSS hex), or `null` for basic.
 * Used for furrow lines, crop glow, and the facing-tile marker highlight.
 */
export const TOOL_SKIN_EFFECT_COLOR: Record<ToolSkinId, string | null> = {
  basic: null,
  golden: "#ffd24a",
  aqua: "#7fd8ff",
  starlight: "#c08bd9",
};

/** Particle count for skin-specific circular burst effects (0 = no skin burst for basic). */
export const TOOL_SKIN_PARTICLE_COUNT: Record<ToolSkinId, number> = {
  basic: 0,
  golden: 18,
  aqua: 18,
  starlight: 24,
};

/** Convert a CSS hex string (#RRGGBB) to a Phaser/canvas integer (0xRRGGBB). */
export function hexNum(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Primary glow color per skin as a Phaser number, or `null` for basic. */
export function toolSkinGlowColorNum(skin: ToolSkinId): number | null {
  const color = TOOL_SKIN_EFFECT_COLOR[skin];
  return color !== null ? hexNum(color) : null;
}

/**
 * Phaser number arrays per skin, derived from TOOL_SKIN_PARTICLE_COLORS.
 * Single source of truth — no separate copy in PhaserField.
 */
export const TOOL_SKIN_PHASER_COLORS: Record<ToolSkinId, readonly number[]> = Object.fromEntries(
  (Object.keys(TOOL_SKIN_PARTICLE_COLORS) as ToolSkinId[]).map((skin) => [
    skin,
    TOOL_SKIN_PARTICLE_COLORS[skin].map(hexNum),
  ]),
) as Record<ToolSkinId, readonly number[]>;

/** Phaser numbers for the basic watering-can water-drop burst. */
export const BASIC_WATER_PHASER_COLORS: readonly number[] = BASIC_WATER_COLORS.map(hexNum);

/** How long crop glow should last after watering (ms). Matches .tool-crop-glow CSS animation. */
export const CROP_GLOW_DURATION_MS = 1700;
/** How long a non-crop-glow tile effect lasts (ms). */
export const TILE_EFFECT_DURATION_MS = 1100;
