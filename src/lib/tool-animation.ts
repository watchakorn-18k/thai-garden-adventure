import type { Tool } from "./game-types";

/**
 * Single source of truth for the farmer's tool-swing motion, shared by BOTH
 * render paths so editing the curve here updates single-player and multiplayer
 * at once:
 *   - Single-player SVG (PixelFarmer) drives the tool <g> via the Web Animations
 *     API using `toolWaapiKeyframes`.
 *   - Multiplayer Phaser canvas (PhaserField) samples `sampleToolPose` each frame.
 *
 * The hoe has a deliberate wind-up: raise high, hold, then slam down — see the
 * duplicated `t` control points (the held angle) in HOE_SIDE / HOE_VERTICAL.
 * Coordinates are in 16-unit art space (same grid as pixel-art.ts); angles in
 * degrees. Poses are returned unflipped — the caller mirrors for left-facing.
 */
export type ToolPose = { angle: number; dx: number; dy: number };
type Key = { t: number; angle: number; dx: number; dy: number };

// Hoe, facing left/right: raise back over the shoulder, hold, slam forward.
const HOE_SIDE: Key[] = [
  { t: 0, angle: 0, dx: 0, dy: 0 },
  { t: 0.22, angle: -74, dx: -1, dy: -3 }, // raised high
  { t: 0.44, angle: -74, dx: -1, dy: -3 }, // wind-up hold
  { t: 0.6, angle: 34, dx: 1, dy: 2 }, // slam down
  { t: 0.78, angle: 14, dx: 0, dy: 1 }, // recoil
  { t: 1, angle: 0, dx: 0, dy: 0 }, // settle
];

// Hoe, facing up/down: lift the head, hold, chop downward (no rotation).
const HOE_VERTICAL: Key[] = [
  { t: 0, angle: 0, dx: 0, dy: 0 },
  { t: 0.22, angle: 0, dx: 0, dy: -6 },
  { t: 0.44, angle: 0, dx: 0, dy: -6 }, // wind-up hold
  { t: 0.6, angle: 0, dx: 0, dy: 3 }, // chop
  { t: 0.78, angle: 0, dx: 0, dy: 1 },
  { t: 1, angle: 0, dx: 0, dy: 0 },
];

const WATER_SIDE: Key[] = [
  { t: 0, angle: 0, dx: 0, dy: 0 },
  { t: 0.45, angle: -28, dx: 0, dy: 1 },
  { t: 1, angle: 0, dx: 0, dy: 0 },
];

const WATER_VERTICAL: Key[] = [
  { t: 0, angle: 0, dx: 0, dy: 0 },
  { t: 0.45, angle: 0, dx: 0, dy: 1 },
  { t: 1, angle: 0, dx: 0, dy: 0 },
];

// Seed has no swing; its toss/scatter lives in pixel-art rects + CSS drops.
const STATIC: Key[] = [
  { t: 0, angle: 0, dx: 0, dy: 0 },
  { t: 1, angle: 0, dx: 0, dy: 0 },
];

function track(tool: Tool, vertical: boolean): Key[] {
  if (tool === "hoe") return vertical ? HOE_VERTICAL : HOE_SIDE;
  if (tool === "watering_can") return vertical ? WATER_VERTICAL : WATER_SIDE;
  return STATIC;
}

/** How long the swing (and the movement freeze that waits for it) lasts. */
export function toolDurationMs(tool: Tool): number {
  return tool === "hoe" ? 460 : 500;
}

/** Linear-interpolate the tool pose at progress `p` (0..1). Used by Phaser. */
export function sampleToolPose(tool: Tool, vertical: boolean, p: number): ToolPose {
  const ks = track(tool, vertical);
  const t = Math.min(1, Math.max(0, p));
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i].t) {
      const a = ks[i - 1];
      const b = ks[i];
      const span = b.t - a.t || 1;
      const f = (t - a.t) / span;
      return {
        angle: a.angle + (b.angle - a.angle) * f,
        dx: a.dx + (b.dx - a.dx) * f,
        dy: a.dy + (b.dy - a.dy) * f,
      };
    }
  }
  const last = ks[ks.length - 1];
  return { angle: last.angle, dx: last.dx, dy: last.dy };
}

/**
 * Web Animations API keyframes for the SVG tool <g>. transformOrigin must be set
 * on the element (PixelFarmer already does). The held control points create the
 * wind-up pause; linear timing keeps it identical to the Phaser sampler.
 */
export function toolWaapiKeyframes(tool: Tool, vertical: boolean): Keyframe[] {
  return track(tool, vertical).map((k) => ({
    offset: k.t,
    transform: `translate(${k.dx}px, ${k.dy}px) rotate(${k.angle}deg)`,
  }));
}
