import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import {
  COLS,
  CROP_COLOR,
  CROPS,
  MARKET_TILE_POS,
  ROWS,
  type Cargo,
  type CropId,
  type Direction,
  type Tool,
} from "@/lib/game-types";
import type { PublicPlayer, RoomStage, ServerEvent } from "@/lib/match-protocol";

function playerCargoStack(player: PublicPlayer): Cargo[] {
  if (player.cargoStack && player.cargoStack.length > 0) return player.cargoStack;
  if (player.carryingCargo) return [player.carryingCargo];
  return [];
}
import {
  ART_GRID,
  cropRects,
  farmerRects,
  paletteFor,
  sideToolOverlay,
  verticalToolOverlay,
  type Rect,
} from "@/lib/pixel-art";
import ShoeTrailOverlay from "./ShoeTrailOverlay";
import { sampleToolPose, toolDurationMs } from "@/lib/tool-animation";
import type { ToolSkinId } from "@/lib/player-cosmetics";
import { useShoeTrail } from "@/lib/use-shoe-trail";
import {
  hexNum,
  TOOL_SKIN_PHASER_COLORS,
  BASIC_WATER_PHASER_COLORS,
  toolSkinGlowColorNum,
} from "@/lib/tool-effects";

const TILE = 56;
const MOVE_SPEED_TILES_PER_SECOND = 5.8;
// Time constant for exponential movement smoothing (ms). Lower = snappier and
// closer to the server position, higher = smoother but more trailing.
const MOVE_TAU = 45;
const PIXEL_FONT = '"Press Start 2P", "VT323", "Mali", monospace';
const TYPE_CODE: Record<"grass" | "tilled" | "watered", number> = {
  grass: 0,
  tilled: 1,
  watered: 2,
};
const CROP_CODE: Record<string, number> = {
  chili: 1,
  rice: 2,
  morning_glory: 3,
  eggplant: 4,
  mango: 5,
  lemongrass: 6,
  papaya: 7,
  basil: 8,
};

const STAGE_PALETTE: Record<
  RoomStage,
  {
    grassTop: number;
    grassBottom: number;
    grassBlade: number;
    grassShadow: number;
    grassEdge: number;
    soilBase: number;
    soilDark: number;
    soilLight: number;
    wateredBase: number;
    wateredDark: number;
    wateredLight: number;
    waterSpark: number;
    accent: number;
  }
> = {
  classic: {
    grassTop: 0x6ab04c,
    grassBottom: 0x4e8c3a,
    grassBlade: 0x8bc967,
    grassShadow: 0x2a4d1f,
    grassEdge: 0x3a6b2a,
    soilBase: 0x5a2f17,
    soilDark: 0x422010,
    soilLight: 0x6b3a1c,
    wateredBase: 0x2a1810,
    wateredDark: 0x1f1208,
    wateredLight: 0x3a2010,
    waterSpark: 0x7fd8ff,
    accent: 0xffd24a,
  },
  water: {
    grassTop: 0x5cae72,
    grassBottom: 0x3f8b62,
    grassBlade: 0x9ce0a3,
    grassShadow: 0x216052,
    grassEdge: 0x2e6f58,
    soilBase: 0x4b3421,
    soilDark: 0x332315,
    soilLight: 0x6b5135,
    wateredBase: 0x173d4c,
    wateredDark: 0x102a36,
    wateredLight: 0x255a6f,
    waterSpark: 0x7fd8ff,
    accent: 0x7fd8ff,
  },
  festival: {
    grassTop: 0x7a8f3a,
    grassBottom: 0x5f6f2c,
    grassBlade: 0xd9a13a,
    grassShadow: 0x4a3518,
    grassEdge: 0x6f4f24,
    soilBase: 0x6b2f2e,
    soilDark: 0x421b24,
    soilLight: 0x8b4a32,
    wateredBase: 0x3a1f2f,
    wateredDark: 0x241222,
    wateredLight: 0x5a2b3f,
    waterSpark: 0xffd24a,
    accent: 0xffd24a,
  },
};

interface Props {
  player: PublicPlayer;
  events: { id: number; ev: ServerEvent }[];
  acting: boolean;
  predictedDir?: Direction | null;
  isSelf?: boolean;
  cargo?: Cargo[];
  showMarket?: boolean;
  /** 2v2: other players sharing this plot, drawn as secondary sprites. */
  teammates?: PublicPlayer[];
  stage?: RoomStage;
}

function drawRects(g: Phaser.GameObjects.Graphics, rects: Rect[], ox: number, oy: number) {
  const s = TILE / ART_GRID;
  for (const [x, y, w, h, color] of rects) {
    g.fillStyle(hexNum(color), 1);
    g.fillRect(ox + x * s, oy + y * s, w * s, h * s);
  }
}

function drawGlowRects(
  g: Phaser.GameObjects.Graphics,
  rects: Rect[],
  ox: number,
  oy: number,
  glowColor: number,
) {
  const s = TILE / ART_GRID;
  for (const [x, y, w, h] of rects) {
    g.fillStyle(glowColor, 0.34);
    g.fillRect(ox + (x - 0.55) * s, oy + (y - 0.55) * s, (w + 1.1) * s, (h + 1.1) * s);
  }
}

/** Per-crop bar color as a Phaser number, derived from the shared CROP_COLOR map. */
const CROP_BAR_COLOR: Record<CropId, number> = Object.fromEntries(
  (Object.keys(CROP_COLOR) as CropId[]).map((id) => [id, hexNum(CROP_COLOR[id])]),
) as Record<CropId, number>;

/** Lighten/darken a 0xRRGGBB color by `amount` per channel. */
function shadeNum(color: number, amount: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((color >> 16) & 255) + amount);
  const g = clamp(((color >> 8) & 255) + amount);
  const b = clamp((color & 255) + amount);
  return (r << 16) | (g << 8) | b;
}

/** Deterministic per-tile hash so decorative detail stays stable across redraws. */
function tileHash(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Trim colors per basket skin — body stays wicker, rim/straps take the skin. */
const BASKET_TRIM: Record<ToolSkinId, { rim: number; band: number; glow: number | null }> = {
  basic: { rim: 0xa06a3a, band: 0x6b3a1b, glow: null },
  golden: { rim: 0xffd24a, band: 0xd99b1f, glow: 0xffd24a },
  aqua: { rim: 0x7fd8ff, band: 0x2a6e9e, glow: 0x7fd8ff },
  starlight: { rim: 0xc08bd9, band: 0x4a2f5c, glow: 0xc08bd9 },
};

/** Draw a backpack basket behind the character. Uses art-grid coords (same as
 *  farmerRects) so it scales identically to the body sprite.
 *  `ox, oy` = top-left of the character sprite in pixel space.
 *  `dir` = facing direction — basket is offset to the opposite side ("behind").
 *  `s` = art-to-pixel scale (TILE / ART_GRID). */
function drawBasket(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  oy: number,
  dir: Direction,
  s: number,
  fillLevel: number,
  topCropId?: CropId,
  skin: ToolSkinId = "basic",
) {
  // Basket is 6×4 art-units, offset 8 art-units "behind" the 16-unit body
  // Behind = opposite of facing: left→right side, right→left side, up→below, down→above
  let bx: number;
  let by: number;
  if (dir === "left") {
    // behind = right side of body
    bx = 11;
    by = 6;
  } else if (dir === "right") {
    // behind = left side of body
    bx = -1;
    by = 6;
  } else if (dir === "up") {
    // facing away — the pack sits on the visible back, centered over the torso
    // (caller draws it IN FRONT of the body for this direction)
    bx = 5;
    by = 7;
  } else {
    // down — facing the camera; pack is hidden behind, only the top peeks above
    // the head, overlapping the hat so it reads as attached
    bx = 5;
    by = -3;
  }

  const px = ox + bx * s;
  const py = oy + by * s;
  const w = 6 * s;
  const h = 4 * s;
  const trim = BASKET_TRIM[skin];

  // Skin glow halo behind the basket (premium skins only)
  if (trim.glow !== null) {
    g.fillStyle(trim.glow, 0.28);
    g.fillRect(px - 0.5 * s, py - 2 * s, w + 1 * s, h + 2.5 * s);
  }
  // Body
  g.fillStyle(0x8b5a2b, 1);
  g.fillRect(px, py, w, h);
  // Rim
  g.fillStyle(trim.rim, 1);
  g.fillRect(px + 0.5 * s, py - 1 * s, w - 1 * s, 1 * s);
  // Interior
  g.fillStyle(0x5a2f17, 1);
  g.fillRect(px + 1 * s, py + 0.5 * s, w - 2 * s, h - 1 * s);
  // Woven band
  g.fillStyle(trim.band, 1);
  g.fillRect(px + 0.25 * s, py + h * 0.6, w - 0.5 * s, 0.25 * s);
  // Handle
  g.fillStyle(trim.band, 1);
  g.fillRect(px + 1 * s, py - 1.5 * s, w - 2 * s, 0.5 * s);
  // Rim sparkle pixel for premium skins
  if (trim.glow !== null) {
    g.fillStyle(shadeNum(trim.rim, 70), 1);
    g.fillRect(px + w - 1.5 * s, py - 1 * s, 0.75 * s, 0.75 * s);
  }

  // Fill bar — color matches the top crop in the basket. Sits below the basket
  // normally, but above it when facing down (basket peeks over the head there,
  // so a bar below would fall behind the body and be hidden).
  if (fillLevel > 0) {
    const barY = dir === "down" ? py - 2 * s : py + h + 1;
    const barW = w;
    const filled = Math.round((fillLevel / 5) * barW);
    g.fillStyle(0x1a0f1f, 1);
    g.fillRect(px, barY, barW, 1 * s);
    const barColor = topCropId ? CROP_BAR_COLOR[topCropId] : 0xffd24a;
    g.fillStyle(fillLevel >= 5 ? 0xffd24a : barColor, 1);
    g.fillRect(px, barY, filled, 1 * s);
    g.lineStyle(1, 0x1a0f1f, 1);
    g.strokeRect(px, barY, barW, 1 * s);
  }
}

/**
 * marker, ambience and floating event text) inside a Phaser canvas. The React
 * shell (HUD, lobby, toolbar, …) stays outside in MultiplayerGame.
 */
export default function PhaserField({
  player,
  events,
  acting,
  predictedDir,
  isSelf = false,
  cargo,
  showMarket = false,
  teammates,
  stage = "classic",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FieldScene | null>(null);
  const seenEvents = useRef<Set<number>>(new Set());
  const { shoeTrailPath, addShoeTrailPoint } = useShoeTrail(TILE);

  // Latest props for the scene to read once it boots.
  const playerRef = useRef(player);
  const actingRef = useRef(acting);
  const predictedDirRef = useRef<Direction | null>(predictedDir ?? null);
  const isSelfRef = useRef(isSelf);
  const cargoRef = useRef<Cargo[]>(cargo ?? []);
  const showMarketRef = useRef(showMarket);
  const teammatesRef = useRef<PublicPlayer[]>(teammates ?? []);
  const stageRef = useRef<RoomStage>(stage);
  playerRef.current = player;
  actingRef.current = acting;
  predictedDirRef.current = predictedDir ?? null;
  isSelfRef.current = isSelf;
  cargoRef.current = cargo ?? [];
  showMarketRef.current = showMarket;
  teammatesRef.current = teammates ?? [];
  stageRef.current = stage;

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let destroyed = false;

    void import("phaser").then((mod) => {
      if (destroyed || !hostRef.current) return;
      const PhaserLib = mod.default;

      class Scene extends PhaserLib.Scene {
        private tileG!: Phaser.GameObjects.Graphics;
        private cropG!: Phaser.GameObjects.Graphics;
        private marketG!: Phaser.GameObjects.Graphics;
        private cargoG!: Phaser.GameObjects.Graphics;
        private markerG!: Phaser.GameObjects.Graphics;
        private teammateG!: Phaser.GameObjects.Graphics;
        private teammateNameG: Phaser.GameObjects.Text[] = [];
        // teammate display positions, smoothed toward their server position
        private teammateDisp = new Map<string, { x: number; y: number }>();
        // per-teammate tool-swing windows, keyed by player id (driven by server events)
        private teammateActing = new Map<string, { start: number; until: number; tool: Tool }>();
        private farmerG!: Phaser.GameObjects.Graphics;
        private toolG!: Phaser.GameObjects.Graphics;
        // signature of the last drawn cargo layout; skip redraw when unchanged
        private lastCargoSig = "";
        // pulsing "ready" stars over mature crops, rebuilt on each tile redraw
        private readyFx: Phaser.GameObjects.Star[] = [];
        // animated market-stall ornaments (lanterns, motes, glow rings), rebuilt in drawMarket
        private marketFx: Phaser.GameObjects.GameObject[] = [];
        // farmer display position in tile units (float for interpolation)
        private disp = { x: 0, y: 0 };
        // latest server position the farmer is smoothing toward
        private target = { x: 0, y: 0 };
        private moving = false;
        private walkFrame = 0;
        private acting = false;
        private actingTimer?: Phaser.Time.TimerEvent;
        private lastTrailAt = 0;
        private teammateTrailAt = new Map<string, number>();
        // signature of the last drawn tile/crop layout; skip redraw when unchanged
        private lastSig = -1;

        constructor() {
          super("field");
        }

        triggerAction() {
          this.acting = true;
          if (this.actingTimer) this.actingTimer.remove();
          const dur = toolDurationMs(playerRef.current.tool);
          this.actingTimer = this.time.delayedCall(dur, () => {
            this.acting = false;
            this.drawMarker();
            this.drawFarmer();
          });
          this.drawMarker();
          this.drawFarmer();
        }

        create() {
          this.tileG = this.add.graphics();
          this.cropG = this.add.graphics();
          this.marketG = this.add.graphics();
          this.cargoG = this.add.graphics();
          this.markerG = this.add.graphics();
          this.teammateG = this.add.graphics();
          this.farmerG = this.add.graphics();
          this.toolG = this.add.graphics();

          const W = COLS * TILE;
          const H = ROWS * TILE;

          // ambient fireflies — glowing halo + bright core, drifting slowly
          for (let i = 0; i < 12; i++) {
            const fx = 14 + ((i * 167 + 41) % (W - 28));
            const fy = 12 + ((i * 113 + 77) % (H - 24));
            const halo = this.add.circle(0, 0, 5, 0xffd24a, 0.12);
            const core = this.add.circle(0, 0, 1.5, 0xffe9a0, 0.95);
            const fly = this.add.container(fx, fy, [halo, core]).setDepth(14);
            this.tweens.add({
              targets: fly,
              x: fx + (((i * 53) % 36) - 18),
              y: fy + (((i * 29) % 24) - 12),
              duration: 2600 + (i % 5) * 420,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
              delay: i * 160,
            });
            this.tweens.add({
              targets: fly,
              alpha: 0.2,
              duration: 900 + (i % 4) * 260,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
              delay: i * 140,
            });
          }

          // drifting petals, tinted per stage
          const petalColors =
            stageRef.current === "water"
              ? [0x7fd8ff, 0x9ce0a3, 0xf4e4c1]
              : stageRef.current === "festival"
                ? [0xffd24a, 0xd94e6a, 0xf4e4c1]
                : [0xff8fb1, 0xffd24a, 0xf4e4c1];
          for (let i = 0; i < 6; i++) {
            const x0 = 20 + ((i * 109) % (W - 40));
            const petal = this.add
              .rectangle(x0, -10 - (i % 3) * 60, 3, 3, petalColors[i % 3], 0.85)
              .setDepth(14);
            this.tweens.add({
              targets: petal,
              y: H + 12,
              duration: 6400 + i * 740,
              repeat: -1,
              delay: i * 520,
            });
            this.tweens.add({
              targets: petal,
              x: x0 + 22,
              duration: 1300 + (i % 3) * 240,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
            this.tweens.add({ targets: petal, angle: 360, duration: 2400, repeat: -1 });
          }

          // soft ink vignette around the field edges (gradient strips, no blur)
          const ink = 0x1a0f1f;
          const vg = this.add.graphics().setDepth(16);
          vg.fillGradientStyle(ink, ink, ink, ink, 0.26, 0.26, 0, 0);
          vg.fillRect(0, 0, W, 22);
          vg.fillGradientStyle(ink, ink, ink, ink, 0, 0, 0.3, 0.3);
          vg.fillRect(0, H - 26, W, 26);
          vg.fillGradientStyle(ink, ink, ink, ink, 0.2, 0, 0.2, 0);
          vg.fillRect(0, 0, 18, H);
          vg.fillGradientStyle(ink, ink, ink, ink, 0, 0.2, 0, 0.2);
          vg.fillRect(W - 18, 0, 18, H);

          const p = playerRef.current;
          this.disp = { x: p.pos.x, y: p.pos.y };
          this.target = { x: p.pos.x, y: p.pos.y };
          this.lastSig = this.tileSignature();
          this.redrawTiles();
          this.drawMarket();
          this.drawCargo();
          this.drawMarker();
          this.drawTeammates();
          this.drawFarmer();
          sceneRef.current = this as unknown as FieldScene;
        }

        /** Market stall — only shown in 2v2; the seller delivers cargo here. */
        drawMarket() {
          this.marketG.clear();
          for (const fx of this.marketFx) {
            this.tweens.killTweensOf(fx);
            fx.destroy();
          }
          this.marketFx = [];
          if (!showMarketRef.current) return;
          const px = MARKET_TILE_POS.x * TILE;
          const py = MARKET_TILE_POS.y * TILE;
          const g = this.marketG;
          // ground shadow
          g.fillStyle(0x000000, 0.2);
          g.fillRect(px + 6, py + TILE - 6, TILE - 12, 4);
          // stall pad
          g.fillStyle(0x3a2418, 1);
          g.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          // side posts holding the awning
          g.fillStyle(0x6b421d, 1);
          g.fillRect(px + 6, py + 14, 4, TILE - 24);
          g.fillRect(px + TILE - 10, py + 14, 4, TILE - 24);
          g.fillStyle(0x8a5a2b, 1);
          g.fillRect(px + 6, py + 14, 2, TILE - 24);
          g.fillRect(px + TILE - 10, py + 14, 2, TILE - 24);
          // counter
          g.fillStyle(0x8a5a2b, 1);
          g.fillRect(px + 6, py + TILE - 18, TILE - 12, 10);
          g.fillStyle(0x6b421d, 1);
          g.fillRect(px + 6, py + TILE - 11, TILE - 12, 3);
          g.lineStyle(2, 0x3a2410, 1);
          g.strokeRect(px + 6.5, py + TILE - 17.5, TILE - 13, 9);
          // striped awning with scalloped edge
          for (let i = 0; i < 4; i++) {
            const c = i % 2 === 0 ? 0xff8fb1 : 0xfff1d6;
            g.fillStyle(c, 1);
            g.fillRect(px + 6 + i * 11, py + 8, 11, 8);
            g.fillTriangle(
              px + 6 + i * 11,
              py + 16,
              px + 17 + i * 11,
              py + 16,
              px + 11.5 + i * 11,
              py + 21,
            );
          }
          g.fillStyle(0x1a0f1f, 1);
          g.fillRect(px + 6, py + 15, TILE - 12, 2);
          // coin marker with shine
          g.fillStyle(0xffd24a, 1);
          g.fillRect(px + TILE / 2 - 5, py + 26, 10, 10);
          g.fillStyle(0xfff5b8, 1);
          g.fillRect(px + TILE / 2 - 4, py + 27, 3, 2);
          g.fillStyle(0xd99b1f, 1);
          g.fillRect(px + TILE / 2 - 1, py + 30, 4, 4);
          const cx = px + TILE / 2;
          const cy = py + TILE / 2;

          // pulsing outline so sellers can spot it
          const pulse = this.add
            .rectangle(cx, cy, TILE - 5, TILE - 5)
            .setStrokeStyle(2, 0xffd24a, 1)
            .setFillStyle()
            .setDepth(5);
          this.tweens.add({
            targets: pulse,
            alpha: 0.35,
            duration: 760,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut",
          });
          this.marketFx.push(pulse);

          // breathing outer glow ring (layered solid steps, no blur)
          const glowRing = this.add
            .rectangle(cx, cy, TILE + 4, TILE + 4)
            .setStrokeStyle(5, 0xffd24a, 0.16)
            .setFillStyle()
            .setDepth(5);
          this.tweens.add({
            targets: glowRing,
            scale: 1.12,
            alpha: 0.4,
            duration: 1100,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut",
          });
          this.marketFx.push(glowRing);

          // lanterns on the awning posts — glowing halo + warm core, flickering
          for (const lx of [px + 8, px + TILE - 8]) {
            const halo = this.add.circle(0, 0, 5, 0xffd24a, 0.22);
            const core = this.add.rectangle(0, 0, 3, 4, 0xfff5b8, 1);
            const lantern = this.add.container(lx, py + 13, [halo, core]).setDepth(6);
            this.tweens.add({
              targets: lantern,
              alpha: 0.45,
              duration: 520 + (lx % 7) * 60,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
            this.marketFx.push(lantern);
          }

          // gold motes drifting up from the counter, like incense sparks
          for (let i = 0; i < 4; i++) {
            const mx = px + 12 + i * 11;
            const my = py + TILE - 16;
            const mote = this.add
              .rectangle(mx, my, 2, 2, i % 2 ? 0xffd24a : 0xfff1d6, 0.9)
              .setDepth(6);
            this.tweens.add({
              targets: mote,
              y: my - 26,
              alpha: 0,
              duration: 1500 + i * 260,
              delay: i * 420,
              repeat: -1,
              ease: "Sine.Out",
            });
            this.marketFx.push(mote);
          }

          // glint twinkling on the coin sign
          const glint = this.add.star(cx - 4, py + 27, 4, 1.2, 3.5, 0xfff5b8, 0.95).setDepth(6);
          this.tweens.add({
            targets: glint,
            alpha: 0.15,
            scale: 0.5,
            angle: 90,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut",
          });
          this.marketFx.push(glint);
        }

        /** Celebration at the stall when cargo is sold — gold rings + coin fountain. */
        spawnMarketSaleFx() {
          const cx = MARKET_TILE_POS.x * TILE + TILE / 2;
          const cy = MARKET_TILE_POS.y * TILE + TILE / 2;

          // expanding double ring
          for (const [delay, color, alpha] of [
            [0, 0xffd24a, 0.9],
            [140, 0xfff1d6, 0.6],
          ] as const) {
            const ring = this.add
              .circle(cx, cy, 10)
              .setStrokeStyle(3, color, alpha)
              .setFillStyle()
              .setDepth(9);
            this.tweens.add({
              targets: ring,
              scale: 3.2,
              alpha: 0,
              delay,
              duration: 560,
              ease: "Quad.Out",
              onComplete: () => ring.destroy(),
            });
          }

          // flash star over the coin sign
          const flash = this.add.star(cx, cy - 4, 4, 4, 10, 0xfff5b8, 1).setDepth(9);
          this.tweens.add({
            targets: flash,
            scale: 2.2,
            alpha: 0,
            angle: 90,
            duration: 460,
            ease: "Quad.Out",
            onComplete: () => flash.destroy(),
          });

          // coin fountain: pop up, then rain back down while fading
          for (let i = 0; i < 9; i++) {
            const coin = this.add
              .rectangle(cx, cy - 4, i % 3 === 0 ? 5 : 4, i % 3 === 0 ? 5 : 4, 0xffd24a, 1)
              .setStrokeStyle(1, 0xd99b1f, 1)
              .setDepth(9);
            const dx = ((i % 5) - 2) * 11 + (i % 2) * 4;
            this.tweens.add({
              targets: coin,
              x: cx + dx,
              angle: 180,
              duration: 640,
              ease: "Sine.Out",
            });
            this.tweens.add({
              targets: coin,
              y: cy - 22 - (i % 3) * 7,
              duration: 240,
              ease: "Quad.Out",
              onComplete: () => {
                this.tweens.add({
                  targets: coin,
                  y: cy + 20,
                  alpha: 0,
                  duration: 420,
                  ease: "Quad.In",
                  onComplete: () => coin.destroy(),
                });
              },
            });
          }
        }

        cargoSignature(): string {
          return cargoRef.current.map((c) => `${c.id}:${c.position.x},${c.position.y}`).join("|");
        }

        /** Harvested-but-unsold crates sitting on the field, waiting for a seller. */
        drawCargo() {
          this.cargoG.clear();
          this.lastCargoSig = this.cargoSignature();
          for (const c of cargoRef.current) {
            const px = c.position.x * TILE;
            const py = c.position.y * TILE;
            const g = this.cargoG;
            // ground shadow
            g.fillStyle(0x000000, 0.2);
            g.fillRect(px + 13, py + 41, 30, 4);
            // crate body
            g.fillStyle(0x8a5a2b, 1);
            g.fillRect(px + 16, py + 22, 24, 20);
            g.fillStyle(0x6b421d, 1);
            g.fillRect(px + 16, py + 36, 24, 6);
            // slats
            g.lineStyle(2, 0x3a2410, 1);
            g.strokeRect(px + 16.5, py + 22.5, 23, 19);
            g.lineBetween(px + 28, py + 22, px + 28, py + 42);
            g.lineBetween(px + 16, py + 32, px + 40, py + 32);
            // crop tuft on top
            drawRects(this.cargoG, cropRects(c.cropId, 2), px, py - 14);
          }
        }

        /**
         * Draw the teammates sharing this plot. Their positions are smoothed each
         * frame toward the latest server position so they glide instead of snap.
         */
        drawTeammates() {
          const mates = teammatesRef.current;
          this.teammateG.clear();
          // Recycle name labels: ensure one Text per teammate.
          while (this.teammateNameG.length < mates.length) {
            this.teammateNameG.push(
              this.add
                .text(0, 0, "", {
                  fontFamily: PIXEL_FONT,
                  fontSize: "7px",
                  color: "#f4e4c1",
                  stroke: "#000000",
                  strokeThickness: 3,
                })
                .setOrigin(0.5, 1)
                .setDepth(12),
            );
          }
          for (let i = mates.length; i < this.teammateNameG.length; i++) {
            this.teammateNameG[i].setVisible(false);
          }

          const liveIds = new Set(mates.map((m) => m.id));
          for (const id of [...this.teammateDisp.keys()]) {
            if (!liveIds.has(id)) this.teammateDisp.delete(id);
          }

          mates.forEach((mate, idx) => {
            const disp = this.teammateDisp.get(mate.id) ?? { x: mate.pos.x, y: mate.pos.y };
            this.teammateDisp.set(mate.id, disp);

            const baseX = disp.x * TILE;
            const baseY = disp.y * TILE - 10;
            // ground shadow under the sprite
            this.teammateG.fillStyle(0x000000, 0.2);
            this.teammateG.fillRect(baseX + 12, disp.y * TILE + 42, TILE - 24, 4);
            const flip = mate.dir === "left";
            const rects = farmerRects({
              direction: mate.dir,
              swing: 0,
              acting: false,
              tool: mate.tool,
              cosmetics: mate.cosmetics,
            });
            const s = TILE / ART_GRID;
            // Cargo a seller is carrying — basket layers behind the body unless
            // facing away (up), where it's on the visible back (drawn after).
            const stack = playerCargoStack(mate);
            const topCropId = stack[stack.length - 1]?.cropId;
            if (stack.length > 0 && mate.dir !== "up") {
              drawBasket(
                this.teammateG,
                baseX,
                baseY,
                mate.dir,
                s,
                stack.length,
                topCropId,
                mate.cosmetics.basketSkin,
              );
            }
            for (const [rx, ry, rw, rh, color] of rects) {
              this.teammateG.fillStyle(hexNum(color), 1);
              const mx = flip ? ART_GRID - rx - rw : rx;
              this.teammateG.fillRect(baseX + mx * s, baseY + ry * s, rw * s, rh * s);
            }
            if (stack.length > 0 && mate.dir === "up") {
              drawBasket(
                this.teammateG,
                baseX,
                baseY,
                mate.dir,
                s,
                stack.length,
                topCropId,
                mate.cosmetics.basketSkin,
              );
            }

            // tool-swing overlay while a server action event is in flight —
            // same pose curve as the main farmer (sampleToolPose), rotated
            // around the hand pivot via canvas transforms.
            const act = this.teammateActing.get(mate.id);
            if (act) {
              const now = this.time.now;
              const isVertical = mate.dir === "up" || mate.dir === "down";
              const palette = paletteFor(mate.cosmetics, act.tool);
              const toolRects = isVertical
                ? verticalToolOverlay(act.tool, palette, mate.dir)
                : sideToolOverlay(act.tool, palette);
              const progress = Math.min(
                1,
                Math.max(0, (now - act.start) / (act.until - act.start)),
              );
              const pose = sampleToolPose(act.tool, isVertical, progress);
              const pivotX = isVertical ? 8 : 10;
              const pivotY = 11;
              const g = this.teammateG;
              g.save();
              const pivotPx = flip ? baseX + (ART_GRID - pivotX) * s : baseX + pivotX * s;
              g.translateCanvas(
                pivotPx + pose.dx * s * (flip ? -1 : 1),
                baseY + pivotY * s + pose.dy * s,
              );
              g.rotateCanvas((pose.angle * (flip ? -1 : 1) * Math.PI) / 180);
              for (const [rx, ry, rw, rh, color] of toolRects) {
                if (color === "transparent") continue;
                g.fillStyle(hexNum(color), 1);
                const rxRel = rx - pivotX;
                g.fillRect((flip ? -rxRel - rw : rxRel) * s, (ry - pivotY) * s, rw * s, rh * s);
              }
              g.restore();
            }

            const label = this.teammateNameG[idx];
            const roleIcon = mate.role === "seller" ? "🛒" : "🌱";
            label.setText(`${roleIcon}${mate.name}`);
            label.setPosition(baseX + TILE / 2, baseY);
            label.setVisible(true);
          });
        }

        maybeSpawnSelfTrail(time: number) {
          const trail = playerRef.current.cosmetics.shoeTrail;
          if (trail === "none" || time - this.lastTrailAt < 60) return;
          this.lastTrailAt = time;
          addShoeTrailPoint(trail, this.disp.x, this.disp.y, playerRef.current.dir, time);
        }

        maybeSpawnTeammateTrail(mate: PublicPlayer, time: number, disp: { x: number; y: number }) {
          const trail = mate.cosmetics.shoeTrail;
          if (trail === "none") return;
          const last = this.teammateTrailAt.get(mate.id) ?? 0;
          if (time - last < 70) return;
          this.teammateTrailAt.set(mate.id, time);
          addShoeTrailPoint(trail, disp.x, disp.y, mate.dir, time);
        }

        /** Cheap rolling hash of the tile/crop layout to detect changes. */
        tileSignature(): number {
          const p = playerRef.current;
          let h = stageRef.current === "water" ? 17 : stageRef.current === "festival" ? 31 : 0;
          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              const cell = p.tiles[y]?.[x];
              const type = TYPE_CODE[cell?.type ?? "grass"];
              const crop = cell?.crop ? CROP_CODE[cell.crop.id] * 4 + cell.crop.stage : 0;
              h = Math.imul(h, 31) + type * 24 + crop;
              h |= 0;
            }
          }
          return h;
        }

        redrawTiles() {
          const p = playerRef.current;
          this.tileG.clear();
          this.cropG.clear();
          for (const fx of this.readyFx) {
            this.tweens.killTweensOf(fx);
            fx.destroy();
          }
          this.readyFx = [];
          if (stageRef.current === "water") this.drawWaterStageBase();
          if (stageRef.current === "festival") this.drawFestivalStageBase();
          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              const cell = p.tiles[y]?.[x];
              const px = x * TILE;
              const py = y * TILE;
              this.paintTile(x, y, cell?.type ?? "grass");
              if (cell?.crop) {
                // grounding shadow under the plant
                this.cropG.fillStyle(0x000000, 0.16);
                this.cropG.fillRect(px + 17, py + TILE - 6, TILE - 34, 3);
                drawRects(this.cropG, cropRects(cell.crop.id, cell.crop.stage), px, py);
                if (cell.crop.stage === 2) {
                  // pulsing gold star marks a crop that's ready to harvest
                  const star = this.add.star(px + 45, py + 12, 4, 2, 5, 0xffd24a, 0.95).setDepth(6);
                  this.tweens.add({
                    targets: star,
                    alpha: 0.25,
                    scale: 0.55,
                    duration: 640 + ((x * 7 + y * 13) % 5) * 90,
                    yoyo: true,
                    repeat: -1,
                    ease: "Sine.InOut",
                  });
                  this.readyFx.push(star);
                }
              }
              if (cell?.bug) {
                // Draw a simple pixel-art bug on the tile
                const g = this.cropG;
                const s = TILE / ART_GRID;
                const bx = px + 20;
                const by = py + 20;
                g.fillStyle(0xa855f7, 1); // Purple bug body
                g.fillRect(bx + 4 * s, by + 4 * s, 8 * s, 6 * s);
                g.fillStyle(0x000000, 1); // Bug eyes
                g.fillRect(bx + 4 * s, by + 4 * s, 2 * s, 2 * s);
                g.fillRect(bx + 10 * s, by + 4 * s, 2 * s, 2 * s);
                // Antennas
                g.fillRect(bx + 5 * s, by + 2 * s, 1 * s, 2 * s);
                g.fillRect(bx + 10 * s, by + 2 * s, 1 * s, 2 * s);
                // Legs
                g.fillRect(bx + 2 * s, by + 6 * s, 2 * s, 1 * s);
                g.fillRect(bx + 12 * s, by + 6 * s, 2 * s, 1 * s);
                g.fillRect(bx + 2 * s, by + 8 * s, 2 * s, 1 * s);
                g.fillRect(bx + 12 * s, by + 8 * s, 2 * s, 1 * s);
              }
            }
          }
        }

        drawWaterStageBase() {
          const g = this.tileG;
          const w = COLS * TILE;
          const h = ROWS * TILE;
          g.fillStyle(0x2a6e9e, 1);
          g.fillRect(0, 0, w, h);
          g.fillStyle(0x3a8ec0, 1);
          for (let y = 0; y < h; y += TILE * 2) {
            g.fillRect(0, y + TILE - 5, w, 4);
          }
        }

        drawFestivalStageBase() {
          const g = this.tileG;
          g.fillStyle(0x2d1b3d, 1);
          g.fillRect(0, 0, COLS * TILE, ROWS * TILE);
          g.fillStyle(0xffd24a, 0.28);
          for (let x = 0; x < COLS; x += 2) {
            g.fillRect(x * TILE + 18, 8, 8, 8);
          }
        }

        paintTile(x: number, y: number, type: "grass" | "tilled" | "watered") {
          const g = this.tileG;
          const palette = STAGE_PALETTE[stageRef.current];
          const px = x * TILE;
          const py = y * TILE;
          const v = tileHash(x, y);
          if (type === "grass") {
            g.fillStyle(palette.grassTop, 1);
            g.fillRect(px, py, TILE, TILE);
            g.fillStyle(palette.grassBottom, 1);
            g.fillRect(px, py + TILE * 0.5, TILE, TILE * 0.5);
            // checkerboard tone so the lawn doesn't read flat
            if ((x + y) % 2 === 0) {
              g.fillStyle(0x000000, 0.05);
              g.fillRect(px, py, TILE, TILE);
            }
            // grass blades with light tips, positions varied per tile
            for (let i = 0; i < 4; i++) {
              const bx = 5 + ((v >>> (i * 4)) % 44);
              const by = 7 + ((v >>> (i * 4 + 3)) % 40);
              g.fillStyle(palette.grassBlade, 1);
              g.fillRect(px + bx, py + by, 2, 4);
              g.fillStyle(shadeNum(palette.grassBlade, 36), 1);
              g.fillRect(px + bx, py + by, 2, 1);
            }
            g.fillStyle(palette.grassShadow, 1);
            g.fillRect(px + 12 + (v % 24), py + 36 + (v % 9), 4, 3);
            g.fillRect(px + 36 - (v % 14), py + 14 + (v % 7), 3, 3);
            // occasional flower or pebble
            if (v % 7 === 0) {
              const petal = v % 2 === 0 ? 0xfff1d6 : 0xff8fb1;
              const fx = px + 14 + (v % 26);
              const fy = py + 12 + ((v >>> 5) % 26);
              g.fillStyle(petal, 1);
              g.fillRect(fx - 2, fy, 2, 2);
              g.fillRect(fx + 2, fy, 2, 2);
              g.fillRect(fx, fy - 2, 2, 2);
              g.fillRect(fx, fy + 2, 2, 2);
              g.fillStyle(0xffd24a, 1);
              g.fillRect(fx, fy, 2, 2);
            } else if (v % 13 === 0) {
              const sx = px + 30 + (v % 12);
              const sy = py + 30 + ((v >>> 4) % 12);
              g.fillStyle(0x9aa0a8, 1);
              g.fillRect(sx, sy, 4, 3);
              g.fillStyle(0x555a62, 1);
              g.fillRect(sx, sy + 2, 4, 1);
            }
            g.fillStyle(palette.grassEdge, 1);
            g.fillRect(px, py + TILE - 3, TILE, 3);
            if (stageRef.current === "water" && (x + y) % 4 === 0) {
              g.fillStyle(palette.waterSpark, 0.65);
              g.fillRect(px + 5, py + 5, 5, 2);
            }
            if (stageRef.current === "festival" && (x + y) % 5 === 0) {
              g.fillStyle(palette.accent, 0.75);
              g.fillRect(px + 44, py + 8, 4, 4);
            }
            g.lineStyle(1, 0x000000, 0.07);
            g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          } else {
            const base = type === "watered" ? palette.wateredBase : palette.soilBase;
            const dark = type === "watered" ? palette.wateredDark : palette.soilDark;
            const light = type === "watered" ? palette.wateredLight : palette.soilLight;
            g.fillStyle(base, 1);
            g.fillRect(px, py, TILE, TILE);
            for (let fy = 0; fy < TILE; fy += 18) {
              g.fillStyle(dark, 1);
              g.fillRect(px, py + fy, TILE, 6);
              g.fillStyle(light, 1);
              g.fillRect(px, py + fy + 10, TILE, 2);
            }
            // soil clods, positions varied per tile
            g.fillStyle(light, 1);
            g.fillRect(px + 8 + (v % 30), py + 8, 3, 2);
            g.fillRect(px + 12 + ((v >>> 3) % 30), py + 26, 3, 2);
            g.fillRect(px + 6 + ((v >>> 6) % 30), py + 44, 3, 2);
            if (type === "watered") {
              // wet sheen + glints
              g.fillStyle(palette.wateredLight, 0.5);
              g.fillRect(px + 4, py + 4, TILE - 8, 2);
              g.fillStyle(palette.waterSpark, 0.9);
              g.fillRect(px + 10 + (v % 20), py + 16, 2, 2);
              g.fillRect(px + 26 + ((v >>> 4) % 16), py + 32, 2, 2);
              g.fillRect(px + 14 + ((v >>> 7) % 18), py + 44, 2, 2);
            }
            // recessed inner edge so the plot reads sunken
            g.fillStyle(dark, 1);
            g.fillRect(px, py, TILE, 2);
            g.fillRect(px, py + TILE - 2, TILE, 2);
            g.fillRect(px, py, 2, TILE);
            g.fillRect(px + TILE - 2, py, 2, TILE);
            // grass lip where the plot meets lawn
            const tiles = playerRef.current.tiles;
            const grassAt = (tx: number, ty: number) =>
              (tiles[ty]?.[tx]?.type ?? "grass") === "grass";
            g.fillStyle(palette.grassBottom, 1);
            if (grassAt(x, y - 1)) g.fillRect(px, py, TILE, 3);
            if (grassAt(x, y + 1)) g.fillRect(px, py + TILE - 3, TILE, 3);
            if (grassAt(x - 1, y)) g.fillRect(px, py, 3, TILE);
            if (grassAt(x + 1, y)) g.fillRect(px + TILE - 3, py, 3, TILE);
            g.lineStyle(1, 0x000000, 0.22);
            g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          }
        }

        drawMarker() {
          const p = playerRef.current;
          this.markerG.clear();
          let x = Math.round(this.disp.x);
          let y = Math.round(this.disp.y);
          if (p.dir === "up") y -= 1;
          else if (p.dir === "down") y += 1;
          else if (p.dir === "left") x -= 1;
          else if (p.dir === "right") x += 1;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
          const activeToolSkin =
            p.tool === "watering_can" ? p.cosmetics.wateringCanSkin : p.cosmetics.hoeSkin;
          const markerColor =
            this.acting || actingRef.current
              ? (toolSkinGlowColorNum(activeToolSkin) ?? 0xffd24a)
              : 0xffd24a;
          const mg = this.markerG;
          const x0 = x * TILE + 3;
          const y0 = y * TILE + 3;
          const sz = TILE - 6;
          const len = 12;
          const t = 3; // bracket arm thickness
          mg.fillStyle(markerColor, 0.1);
          mg.fillRect(x0, y0, sz, sz);
          // four corner brackets as solid rects — crisp pixel corners, no path quirks
          mg.fillStyle(markerColor, 0.9);
          // top-left
          mg.fillRect(x0, y0, len, t);
          mg.fillRect(x0, y0, t, len);
          // top-right
          mg.fillRect(x0 + sz - len, y0, len, t);
          mg.fillRect(x0 + sz - t, y0, t, len);
          // bottom-right
          mg.fillRect(x0 + sz - len, y0 + sz - t, len, t);
          mg.fillRect(x0 + sz - t, y0 + sz - len, t, len);
          // bottom-left
          mg.fillRect(x0, y0 + sz - t, len, t);
          mg.fillRect(x0, y0 + sz - len, t, len);
        }

        drawFarmer() {
          const p = playerRef.current;
          this.farmerG.clear();
          this.toolG.clear();
          const flip = p.dir === "left";
          const swing = this.moving ? this.walkFrame % 2 : 0;
          const rects = farmerRects({
            direction: p.dir,
            swing,
            acting: false,
            tool: p.tool,
            cosmetics: p.cosmetics,
          });
          const bob = this.moving ? (this.walkFrame % 2 === 0 ? 0 : -1.5) : 0;
          const baseX = this.disp.x * TILE;
          const baseY = this.disp.y * TILE - 10 + bob;

          // ground shadow (anchored to the tile, unaffected by bob)
          this.farmerG.fillStyle(0x000000, 0.22);
          this.farmerG.fillRect(baseX + 11, this.disp.y * TILE + 42, TILE - 22, 4);

          // Basket layering: when facing away (up) the pack is on the visible
          // back, so it draws ON TOP of the body. Every other direction it's
          // behind the body, so it draws first.
          const stack = playerCargoStack(p);
          const hasBasket = p.role === "seller" || stack.length > 0;
          const topCropId = stack[stack.length - 1]?.cropId;
          if (hasBasket && p.dir !== "up") {
            drawBasket(
              this.farmerG,
              baseX,
              baseY,
              p.dir,
              TILE / ART_GRID,
              stack.length,
              topCropId,
              p.cosmetics.basketSkin,
            );
          }

          if (!flip) {
            drawRects(this.farmerG, rects, baseX, baseY);
          } else {
            // mirror horizontally around the tile center
            const s = TILE / ART_GRID;
            for (const [rx, ry, rw, rh, color] of rects) {
              this.farmerG.fillStyle(hexNum(color), 1);
              const mx = ART_GRID - rx - rw;
              this.farmerG.fillRect(baseX + mx * s, baseY + ry * s, rw * s, rh * s);
            }
          }

          if (hasBasket && p.dir === "up") {
            drawBasket(
              this.farmerG,
              baseX,
              baseY,
              p.dir,
              TILE / ART_GRID,
              stack.length,
              topCropId,
              p.cosmetics.basketSkin,
            );
          }

          const isActing = this.acting || actingRef.current;
          this.farmerG.setDepth(10);
          this.toolG.setDepth(isActing && p.dir === "up" && p.tool === "watering_can" ? 9 : 11);
          // Skip farmer tool animation for seller actions (pickup, not hoe)
          if (isActing && p.role === "seller") {
            // brief bob animation only
            return;
          }
          if (isActing) {
            const isVertical = p.dir === "up" || p.dir === "down";
            const palette = paletteFor(p.cosmetics, p.tool);
            const toolRects = isVertical
              ? verticalToolOverlay(p.tool, palette, p.dir)
              : sideToolOverlay(p.tool, palette);

            // Shared swing curve (single source for SP + MP); see tool-animation.ts.
            const dur = toolDurationMs(p.tool);
            const elapsed = this.actingTimer ? this.actingTimer.getElapsed() : dur / 2;
            const progress = Math.min(1, Math.max(0, elapsed / dur));
            const pose = sampleToolPose(p.tool, isVertical, progress);
            const toolAngle = pose.angle;
            const toolOffsetX = pose.dx;
            const toolOffsetY = pose.dy;

            const pivotX = isVertical ? 8 : 10;
            const pivotY = 11;
            const s = TILE / ART_GRID;

            const relativeRects: Rect[] = toolRects.map(([rx, ry, rw, rh, color]) => {
              const rx_rel = rx - pivotX;
              const ry_rel = ry - pivotY;
              if (flip) {
                return [-rx_rel - rw, ry_rel, rw, rh, color];
              }
              return [rx_rel, ry_rel, rw, rh, color];
            });

            const activeToolSkin =
              p.tool === "watering_can" ? p.cosmetics.wateringCanSkin : p.cosmetics.hoeSkin;
            const glowColor = toolSkinGlowColorNum(activeToolSkin);
            if (glowColor !== null) {
              const glowRects = relativeRects.filter(([, , , , color]) => color !== "transparent");
              drawGlowRects(this.toolG, glowRects, 0, 0, glowColor);
            }
            drawRects(this.toolG, relativeRects, 0, 0);

            let finalPivotX = baseX + pivotX * s;
            if (flip) {
              finalPivotX = baseX + (ART_GRID - pivotX) * s;
            }

            this.toolG.setPosition(
              finalPivotX + toolOffsetX * s * (flip ? -1 : 1),
              baseY + pivotY * s + toolOffsetY * s,
            );
            this.toolG.setAngle(toolAngle * (flip ? -1 : 1));
          } else {
            this.toolG.setPosition(0, 0);
            this.toolG.setAngle(0);
          }
        }

        /** Called from React when a new snapshot arrives. */
        applyPlayer() {
          const p = playerRef.current;
          // Only repaint tiles/crops when the layout actually changed.
          const sig = this.tileSignature();
          if (sig !== this.lastSig) {
            this.lastSig = sig;
            this.redrawTiles();
          }
          if (this.cargoSignature() !== this.lastCargoSig) this.drawCargo();
          this.target = { x: p.pos.x, y: p.pos.y };
          // Snap on large desync (reconnect / teleport) instead of a long glide.
          if (Math.abs(this.disp.x - p.pos.x) > 1.5 || Math.abs(this.disp.y - p.pos.y) > 1.5) {
            this.disp = { x: p.pos.x, y: p.pos.y };
          }
          this.drawMarker();
          this.drawFarmer();
        }

        /** Redraw just the farmer (e.g. tool/acting pose changed without a snapshot). */
        refreshFarmer() {
          this.drawFarmer();
        }

        /** Force a teammate redraw when their props (tool/role/cargo) change. */
        applyTeammates() {
          this.drawTeammates();
        }

        setPredictedDir(dir: Direction | null) {
          const p = playerRef.current;
          if (dir) p.dir = dir;
          this.drawMarker();
          this.drawFarmer();
        }

        /** Per-skin signature flourish layered on top of the action burst, so
         *  paid tool skins feel premium every time they're used. Each skin has
         *  a distinct effect per tool (hoe vs watering can). */
        spawnSkinFlourish(skin: ToolSkinId, kind: "till" | "water", cx: number, cy: number) {
          if (skin === "golden") {
            if (kind === "till") this.spawnGoldLightning(cx, cy);
            else this.spawnGoldenRain(cx, cy);
            return;
          }
          if (skin === "aqua") {
            if (kind === "till") this.spawnAquaGeyser(cx, cy);
            else this.spawnAquaRainbow(cx, cy);
            return;
          }
          if (skin === "starlight") {
            if (kind === "till") this.spawnStarMeteor(cx, cy);
            else this.spawnStarGalaxy(cx, cy);
          }
        }

        /** Golden hoe: a gold lightning bolt strikes the tile, then coins pop out. */
        spawnGoldLightning(cx: number, cy: number) {
          // chunky 8-bit zigzag bolt from above the tile down to the impact
          // point, drawn as solid rects (stroked polylines render unreliably)
          const bolt = this.add.graphics().setDepth(12);
          let y = cy - 74;
          let x = cx + 8;
          while (y < cy - 6) {
            const seg = 10 + Math.random() * 6;
            const nx = cx + (Math.random() * 16 - 8);
            bolt.fillStyle(0xffd24a, 0.45); // glow column
            bolt.fillRect(Math.min(x, nx) - 2, y, Math.abs(nx - x) + 7, seg + 2);
            bolt.fillStyle(0xfff5b8, 1); // hot core
            bolt.fillRect(nx, y, 3, seg);
            bolt.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 3, 3); // jag
            x = nx;
            y += seg;
          }
          this.cameras.main.shake(70, 0.0009);
          this.tweens.add({
            targets: bolt,
            alpha: 0,
            delay: 90,
            duration: 320,
            ease: "Quad.Out",
            onComplete: () => bolt.destroy(),
          });
          // impact flash + sparks
          const flash = this.add.circle(cx, cy, 9, 0xfff5b8, 0.9).setDepth(12);
          this.tweens.add({
            targets: flash,
            scale: 2.4,
            alpha: 0,
            duration: 360,
            ease: "Quad.Out",
            onComplete: () => flash.destroy(),
          });
          for (let i = 0; i < 5; i++) {
            const coin = this.add
              .rectangle(cx + (i - 2) * 7, cy + 6, 4, 4, 0xffd24a, 1)
              .setStrokeStyle(1, 0xd99b1f, 1)
              .setDepth(12);
            this.tweens.add({
              targets: coin,
              y: cy - 22 - (i % 3) * 6,
              alpha: 0,
              angle: 180,
              delay: 80 + i * 70,
              duration: 620,
              ease: "Quad.Out",
              onComplete: () => coin.destroy(),
            });
          }
        }

        /** Golden watering can: golden rain falls on the tile with tiny splashes. */
        spawnGoldenRain(cx: number, cy: number) {
          for (let i = 0; i < 10; i++) {
            const drop = this.add
              .rectangle(
                cx + (i % 5) * 10 - 20 + (i % 2) * 4,
                cy - 54 - (i % 3) * 10,
                2,
                6,
                i % 3 ? 0xffd24a : 0xfff5b8,
                0.95,
              )
              .setDepth(12);
            this.tweens.add({
              targets: drop,
              y: cy + 10 + (i % 4) * 3,
              delay: i * 55,
              duration: 360,
              ease: "Quad.In",
              onComplete: () => {
                const splash = this.add
                  .rectangle(drop.x, drop.y + 3, 6, 2, 0xfff5b8, 0.8)
                  .setDepth(12);
                this.tweens.add({
                  targets: splash,
                  scaleX: 1.8,
                  alpha: 0,
                  duration: 200,
                  ease: "Quad.Out",
                  onComplete: () => splash.destroy(),
                });
                drop.destroy();
              },
            });
          }
        }

        /** Aqua hoe: a geyser erupts from the soil, plus ripple rings. */
        spawnAquaGeyser(cx: number, cy: number) {
          for (let i = 0; i < 12; i++) {
            const jet = this.add
              .rectangle(
                cx + ((i % 5) - 2) * 4,
                cy,
                i % 2 ? 3 : 4,
                6,
                i % 3 ? 0x7fd8ff : 0x4cc2ee,
                0.9,
              )
              .setDepth(12);
            this.tweens.add({
              targets: jet,
              y: cy - 26 - (i % 4) * 9,
              delay: (i % 4) * 50,
              duration: 260,
              ease: "Quad.Out",
              onComplete: () => {
                this.tweens.add({
                  targets: jet,
                  y: cy + 14,
                  alpha: 0,
                  duration: 320,
                  ease: "Quad.In",
                  onComplete: () => jet.destroy(),
                });
              },
            });
          }
          for (const delay of [0, 160]) {
            const ripple = this.add
              .circle(cx, cy + 8, 7)
              .setStrokeStyle(2, 0x7fd8ff, 0.8)
              .setFillStyle()
              .setDepth(9);
            this.tweens.add({
              targets: ripple,
              scaleX: 3,
              scaleY: 1.6,
              alpha: 0,
              delay,
              duration: 560,
              ease: "Sine.Out",
              onComplete: () => ripple.destroy(),
            });
          }
        }

        /** Aqua watering can: a little rainbow arcs over the tile, plus bubbles. */
        spawnAquaRainbow(cx: number, cy: number) {
          const rainbow = this.add.graphics().setDepth(12);
          const bands = [0xd94e6a, 0xffd24a, 0x7fd8ff];
          bands.forEach((color, i) => {
            rainbow.lineStyle(3, color, 0.85);
            rainbow.beginPath();
            rainbow.arc(cx, cy + 8, 22 - i * 4, Math.PI, Math.PI * 2, false);
            rainbow.strokePath();
          });
          rainbow.setAlpha(0);
          this.tweens.add({
            targets: rainbow,
            alpha: 1,
            duration: 220,
            ease: "Sine.Out",
            onComplete: () => {
              this.tweens.add({
                targets: rainbow,
                alpha: 0,
                delay: 340,
                duration: 380,
                ease: "Sine.In",
                onComplete: () => rainbow.destroy(),
              });
            },
          });
          for (let i = 0; i < 6; i++) {
            const bubble = this.add
              .circle(cx + (i - 2.5) * 8, cy + 4, i % 2 ? 2 : 3, 0x7fd8ff, 0.75)
              .setDepth(9);
            this.tweens.add({
              targets: bubble,
              y: cy - 24 - (i % 3) * 5,
              x: bubble.x + ((i % 2) * 2 - 1) * 8,
              alpha: 0,
              delay: i * 60,
              duration: 700,
              ease: "Sine.Out",
              onComplete: () => bubble.destroy(),
            });
          }
        }

        /** Starlight hoe: a shooting star streaks down into the tile and bursts. */
        spawnStarMeteor(cx: number, cy: number) {
          const head = this.add.star(cx + 46, cy - 64, 4, 2, 5, 0xfff5b8, 1).setDepth(12);
          this.tweens.add({
            targets: head,
            x: cx,
            y: cy,
            duration: 240,
            ease: "Quad.In",
            onUpdate: () => {
              if (Math.random() < 0.6) {
                const trail = this.add.rectangle(head.x, head.y, 3, 3, 0xc08bd9, 0.8).setDepth(11);
                this.tweens.add({
                  targets: trail,
                  alpha: 0,
                  scale: 0.3,
                  duration: 320,
                  onComplete: () => trail.destroy(),
                });
              }
            },
            onComplete: () => {
              head.destroy();
              this.cameras.main.shake(60, 0.0007);
              const flash = this.add.circle(cx, cy, 8, 0xfff5b8, 0.9).setDepth(12);
              this.tweens.add({
                targets: flash,
                scale: 2.2,
                alpha: 0,
                duration: 320,
                ease: "Quad.Out",
                onComplete: () => flash.destroy(),
              });
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 * i) / 6;
                const star = this.add.star(cx, cy, 4, 1.5, 4, 0xc08bd9, 0.95).setDepth(12);
                this.tweens.add({
                  targets: star,
                  x: cx + Math.cos(angle + 0.9) * 24,
                  y: cy + Math.sin(angle + 0.9) * 24,
                  angle: 270,
                  alpha: 0,
                  scale: 0.4,
                  duration: 640,
                  ease: "Quad.Out",
                  onComplete: () => star.destroy(),
                });
              }
            },
          });
        }

        /** Starlight watering can: stars spiral inward like a tiny galaxy. */
        spawnStarGalaxy(cx: number, cy: number) {
          for (let i = 0; i < 8; i++) {
            const a0 = (Math.PI * 2 * i) / 8;
            const star = this.add
              .star(
                cx + Math.cos(a0) * 30,
                cy + Math.sin(a0) * 30,
                4,
                1.2,
                3.2,
                i % 2 ? 0xc08bd9 : 0xfff5b8,
                0.9,
              )
              .setDepth(12);
            const spin = { t: 0 };
            this.tweens.add({
              targets: spin,
              t: 1,
              delay: i * 40,
              duration: 720,
              ease: "Sine.In",
              onUpdate: () => {
                const r = 30 * (1 - spin.t);
                const a = a0 + spin.t * 3.2;
                star.setPosition(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                star.setAlpha(0.9 - spin.t * 0.5);
                star.angle = spin.t * 180;
              },
              onComplete: () => star.destroy(),
            });
          }
          const core = this.add.circle(cx, cy, 4, 0xfff5b8, 0).setDepth(12);
          this.tweens.add({
            targets: core,
            alpha: 0.9,
            scale: 2,
            delay: 560,
            duration: 240,
            yoyo: true,
            ease: "Sine.InOut",
            onComplete: () => core.destroy(),
          });
        }

        spawnToolSkinEffect(ev: Extract<ServerEvent, { kind: "till" | "water" }>) {
          const self = playerRef.current;
          const actor =
            ev.playerId === self.id
              ? self
              : teammatesRef.current.find((mate) => mate.id === ev.playerId);
          const skin =
            ev.kind === "water" ? actor?.cosmetics?.wateringCanSkin : actor?.cosmetics?.hoeSkin;
          if (!skin) return;

          const cx = ev.x * TILE + TILE / 2;
          const cy = ev.y * TILE + TILE / 2;

          // Basic skin: plain dirt/water arc burst (matches SP burstParticles)
          if (skin === "basic") {
            const basicColors =
              ev.kind === "water" ? BASIC_WATER_PHASER_COLORS : TOOL_SKIN_PHASER_COLORS.basic;
            const count = 8;
            for (let i = 0; i < count; i++) {
              const angle = (Math.PI * (i + 1)) / (count + 1) + Math.PI;
              const dist = 14 + Math.random() * 12;
              const chip = this.add.rectangle(
                cx,
                cy,
                ev.kind === "water" ? 4 : 5,
                ev.kind === "water" ? 4 : 5,
                basicColors[i % basicColors.length],
                0.85,
              );
              chip.setDepth(8);
              this.tweens.add({
                targets: chip,
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist - 6,
                alpha: 0,
                scale: 0.4,
                duration: 520,
                ease: "Quad.Out",
                onComplete: () => chip.destroy(),
              });
            }
            return;
          }

          // Non-basic: camera shake + skin-colored effects
          if (ev.kind === "till") this.cameras.main.shake(45, 0.00045);
          if (ev.kind === "water") this.cameras.main.shake(35, 0.00025);
          const colors = TOOL_SKIN_PHASER_COLORS[skin];
          const effectColor = toolSkinGlowColorNum(skin) ?? colors[0];
          this.spawnSkinFlourish(skin, ev.kind, cx, cy);

          if (ev.kind === "till") {
            const furrow = this.add.graphics();
            furrow.setDepth(7);
            const px = ev.x * TILE;
            const py = ev.y * TILE;
            for (let i = 0; i < 4; i++) {
              const y = py + 11 + i * 9;
              furrow.fillStyle(effectColor, 0.28);
              furrow.fillRect(px + 7 + (i % 2) * 2, y, TILE - 14, 3);
              furrow.fillStyle(colors[1], 0.62);
              furrow.fillRect(px + 10 + ((i + 1) % 2) * 2, y + 3, TILE - 20, 2);
              furrow.fillStyle(colors[2], 0.38);
              furrow.fillRect(px + 15 + (i % 3) * 4, y + 6, TILE - 30, 2);
            }
            furrow.lineStyle(2, effectColor, 0.85);
            furrow.beginPath();
            furrow.moveTo(px + 10, py + 13);
            furrow.lineTo(px + 22, py + 17);
            furrow.lineTo(px + 14, py + 23);
            furrow.moveTo(px + 30, py + 24);
            furrow.lineTo(px + 42, py + 30);
            furrow.lineTo(px + 34, py + 37);
            furrow.moveTo(px + 16, py + 42);
            furrow.lineTo(px + 28, py + 46);
            furrow.strokePath();
            this.tweens.add({
              targets: furrow,
              alpha: 0,
              delay: 320,
              duration: 820,
              ease: "Quad.Out",
              onComplete: () => furrow.destroy(),
            });

            const dustCount = skin === "starlight" ? 24 : 18;
            for (let i = 0; i < dustCount; i++) {
              const angle = (Math.PI * 2 * i) / dustCount;
              const dist = 8 + (i % 4) * 5;
              const chip = this.add.rectangle(
                cx + ((i % 3) - 1) * 3,
                cy + ((i % 4) - 1.5) * 3,
                i % 2 ? 3 : 4,
                i % 2 ? 3 : 4,
                colors[i % colors.length],
                0.88,
              );
              chip.setDepth(8);
              chip.setStrokeStyle(1, 0x1a0f1f, 0.8);
              this.tweens.add({
                targets: chip,
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist - 4,
                alpha: 0,
                scale: 0.4,
                duration: 560,
                ease: "Quad.Out",
                onComplete: () => chip.destroy(),
              });
            }
            return;
          }

          const crop = actor?.tiles[ev.y]?.[ev.x]?.crop;
          if (crop) {
            const cropFx = this.add.graphics();
            cropFx.setDepth(7);
            drawGlowRects(
              cropFx,
              cropRects(crop.id, crop.stage),
              ev.x * TILE,
              ev.y * TILE,
              effectColor,
            );
            this.tweens.add({
              targets: cropFx,
              alpha: 0.7,
              duration: 180,
              yoyo: true,
              repeat: 3,
              ease: "Sine.InOut",
              onComplete: () => {
                this.tweens.add({
                  targets: cropFx,
                  alpha: 0,
                  duration: 780,
                  ease: "Sine.Out",
                  onComplete: () => cropFx.destroy(),
                });
              },
            });
          }

          const count = skin === "starlight" ? 24 : 18;
          for (let i = 0; i < count; i++) {
            const angle = -Math.PI / 2 + ((i % 9) - 4) * 0.22;
            const dist = 16 + (i % 5) * 7;
            const waterMix = i % 3 === 0 ? 0x7fd8ff : colors[i % colors.length];
            const drop = this.add.rectangle(
              cx + ((i % 5) - 2) * 2,
              cy - 2 + ((i % 4) - 1.5) * 2,
              i % 2 ? 3 : 4,
              i % 2 ? 3 : 4,
              waterMix,
              0.78,
            );
            drop.setDepth(8);
            this.tweens.add({
              targets: drop,
              x: cx + Math.cos(angle) * dist + ((i % 3) - 1) * 10,
              y: cy + Math.sin(angle) * (dist * 0.55) + 18 + (i % 4) * 4,
              alpha: 0,
              scale: i % 2 ? 1.35 : 1.8,
              duration: 760 + (i % 4) * 80,
              ease: "Sine.Out",
              onComplete: () => drop.destroy(),
            });
          }
        }

        /** Hand-grab effect when a seller picks up cargo: a glint + grab ring
         *  at the hand, and chips that whoosh from the hand into the basket.
         *  Colors follow the basket skin so paid skins feel premium. */
        spawnPickupFx(x: number, y: number, dir: Direction, skin: ToolSkinId) {
          const baseX = x * TILE;
          const baseY = y * TILE - 10;
          const s = TILE / ART_GRID;
          // hand point in front of the body
          const [hx, hy] =
            dir === "left"
              ? [baseX + 8, baseY + 38]
              : dir === "right"
                ? [baseX + TILE - 8, baseY + 38]
                : dir === "up"
                  ? [baseX + TILE / 2, baseY + 26]
                  : [baseX + TILE / 2, baseY + 42];
          // basket center, mirroring drawBasket's per-direction offsets
          const [bx, by] =
            dir === "left"
              ? [baseX + 14 * s, baseY + 8 * s]
              : dir === "right"
                ? [baseX + 2 * s, baseY + 8 * s]
                : dir === "up"
                  ? [baseX + 8 * s, baseY + 9 * s]
                  : [baseX + 8 * s, baseY - 1 * s];
          const glow = toolSkinGlowColorNum(skin) ?? 0xf4e4c1;

          // grab ring popping at the hand
          const ring = this.add
            .circle(hx, hy, 6)
            .setStrokeStyle(2, glow, 0.9)
            .setFillStyle()
            .setDepth(13);
          this.tweens.add({
            targets: ring,
            scale: 2.1,
            alpha: 0,
            duration: 340,
            ease: "Quad.Out",
            onComplete: () => ring.destroy(),
          });
          // glint star at the hand
          const glint = this.add.star(hx, hy, 4, 2, 5, glow, 1).setDepth(13);
          this.tweens.add({
            targets: glint,
            scale: 1.7,
            alpha: 0,
            angle: 90,
            duration: 300,
            ease: "Quad.Out",
            onComplete: () => glint.destroy(),
          });
          // chips whoosh from the hand into the basket
          const colors =
            skin === "basic" ? [0xd9a441, 0xf4e4c1, 0x8b5a2b] : TOOL_SKIN_PHASER_COLORS[skin];
          for (let i = 0; i < 6; i++) {
            const chip = this.add
              .rectangle(
                hx + ((i % 3) - 1) * 6,
                hy + ((i % 2) * 2 - 1) * 4,
                3,
                3,
                colors[i % colors.length],
                0.95,
              )
              .setDepth(13);
            this.tweens.add({
              targets: chip,
              x: bx,
              y: by,
              scale: 0.4,
              alpha: 0.25,
              delay: i * 40,
              duration: 320,
              ease: "Quad.In",
              onComplete: () => chip.destroy(),
            });
          }
          // tiny sparkle lingering over the basket for premium skins
          if (skin !== "basic") {
            const spark = this.add.star(bx, by - 6, 4, 1.2, 3.2, glow, 0).setDepth(13);
            this.tweens.add({
              targets: spark,
              alpha: 1,
              delay: 260,
              duration: 180,
              yoyo: true,
              hold: 140,
              ease: "Sine.InOut",
              onComplete: () => spark.destroy(),
            });
          }
        }

        /** Gold/parchment chip burst + flash star when a crop is harvested. */
        spawnHarvestBurst(tx: number, ty: number) {
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE / 2;
          const colors = [0xffd24a, 0xfff1d6, 0xe8a23a];
          for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            const dist = 16 + (i % 3) * 8;
            const chip = this.add
              .rectangle(cx, cy, i % 2 ? 3 : 4, i % 2 ? 3 : 4, colors[i % 3], 0.92)
              .setDepth(8);
            this.tweens.add({
              targets: chip,
              x: cx + Math.cos(angle) * dist,
              y: cy + Math.sin(angle) * dist - 10,
              alpha: 0,
              angle: 180,
              duration: 620,
              ease: "Quad.Out",
              onComplete: () => chip.destroy(),
            });
          }
          const star = this.add.star(cx, cy - 6, 4, 3, 8, 0xfff5b8, 0.95).setDepth(8);
          this.tweens.add({
            targets: star,
            scale: 2,
            alpha: 0,
            angle: 90,
            duration: 480,
            ease: "Quad.Out",
            onComplete: () => star.destroy(),
          });
        }

        /** Small green puff when a seed is planted. */
        spawnPlantPuff(tx: number, ty: number) {
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE * 0.7;
          for (let i = 0; i < 6; i++) {
            const angle = Math.PI + (Math.PI * i) / 5;
            const chip = this.add
              .rectangle(cx, cy, 3, 3, i % 2 ? 0x8bc967 : 0x5fa148, 0.9)
              .setDepth(8);
            this.tweens.add({
              targets: chip,
              x: cx + Math.cos(angle) * 14,
              y: cy + Math.sin(angle) * 10 - 4,
              alpha: 0,
              duration: 440,
              ease: "Quad.Out",
              onComplete: () => chip.destroy(),
            });
          }
        }

        spawnEvent(ev: ServerEvent) {
          if (ev.kind === "cargo_picked_up") {
            // Hand-grab effect + pickup text near whoever picked up (self or teammate)
            const p = playerRef.current;
            const isSelfPick = ev.playerId === p.id;
            const picker = isSelfPick ? p : teammatesRef.current.find((m) => m.id === ev.playerId);
            if (!picker) return;
            const disp = isSelfPick
              ? this.disp
              : (this.teammateDisp.get(picker.id) ?? { x: picker.pos.x, y: picker.pos.y });
            this.spawnPickupFx(disp.x, disp.y, picker.dir, picker.cosmetics.basketSkin);
            const label = this.add
              .text(disp.x * TILE + TILE / 2, disp.y * TILE - 20, "หยิบ!", {
                fontFamily: PIXEL_FONT,
                fontSize: "10px",
                color: "#ffd24a",
                stroke: "#000000",
                strokeThickness: 3,
              })
              .setOrigin(0.5, 0.5)
              .setDepth(20);
            this.tweens.add({
              targets: label,
              y: disp.y * TILE - 44,
              alpha: 0,
              duration: 700,
              ease: "Quad.Out",
              onComplete: () => label.destroy(),
            });
            if (isSelfPick) this.drawFarmer();
            else this.drawTeammates();
            return;
          }
          if (ev.kind === "cargo_sold") {
            if (showMarketRef.current) this.spawnMarketSaleFx();
            // Show sold text
            const p = playerRef.current;
            const isSelf = ev.playerId === p.id;
            const mates = teammatesRef.current;
            const seller = isSelf ? p : mates.find((m) => m.id === ev.playerId);
            if (!seller) return;
            const disp = isSelf
              ? { x: seller.pos.x, y: seller.pos.y }
              : (this.teammateDisp.get(seller.id) ?? { x: seller.pos.x, y: seller.pos.y });
            const reward = ev.totalReward ?? ev.reward;
            const label = this.add
              .text(disp.x * TILE + TILE / 2, disp.y * TILE - 20, `+${reward}`, {
                fontFamily: PIXEL_FONT,
                fontSize: "12px",
                color: "#ffd24a",
                stroke: "#000000",
                strokeThickness: 3,
              })
              .setOrigin(0.5, 0.5)
              .setDepth(20);
            this.tweens.add({
              targets: label,
              y: disp.y * TILE - 48,
              alpha: 0,
              duration: 950,
              ease: "Quad.Out",
              onComplete: () => label.destroy(),
            });
            if (!isSelf) this.drawTeammates();
            return;
          }
          if (ev.kind === "bug_found") {
            const label = this.add
              .text(ev.x * TILE + TILE / 2, ev.y * TILE, "แมลงระบาด! 🐛", {
                fontFamily: PIXEL_FONT,
                fontSize: "10px",
                color: "#c084fc",
                stroke: "#000000",
                strokeThickness: 3,
              })
              .setOrigin(0.5, 0.5)
              .setDepth(20);
            this.tweens.add({
              targets: label,
              y: ev.y * TILE - 24,
              alpha: 0,
              duration: 1200,
              ease: "Quad.Out",
              onComplete: () => label.destroy(),
            });
            return;
          }
          if (ev.kind === "bug_cleared") {
            const label = this.add
              .text(ev.x * TILE + TILE / 2, ev.y * TILE, `แก้แมลง! +${ev.reward}`, {
                fontFamily: PIXEL_FONT,
                fontSize: "10px",
                color: "#4ade80",
                stroke: "#000000",
                strokeThickness: 3,
              })
              .setOrigin(0.5, 0.5)
              .setDepth(20);
            this.tweens.add({
              targets: label,
              y: ev.y * TILE - 24,
              alpha: 0,
              duration: 1200,
              ease: "Quad.Out",
              onComplete: () => label.destroy(),
            });
            return;
          }
          if (!("x" in ev) || !("y" in ev)) return;
          if (ev.kind !== "insufficient_funds" && !isSelfRef.current) {
            this.triggerAction();
          }
          // Teammates swing their tool when their action event arrives.
          if (
            (ev.kind === "till" || ev.kind === "water" || ev.kind === "plant") &&
            ev.playerId !== playerRef.current.id &&
            teammatesRef.current.some((m) => m.id === ev.playerId)
          ) {
            const tool: Tool =
              ev.kind === "till" ? "hoe" : ev.kind === "water" ? "watering_can" : "seed";
            const now = this.time.now;
            this.teammateActing.set(ev.playerId, {
              start: now,
              until: now + toolDurationMs(tool),
              tool,
            });
            this.drawTeammates();
          }
          if (ev.kind === "till" || ev.kind === "water") {
            this.spawnToolSkinEffect(ev);
          }
          if (ev.kind === "harvest" && ev.reward > 0) this.spawnHarvestBurst(ev.x, ev.y);
          if (ev.kind === "plant") this.spawnPlantPuff(ev.x, ev.y);
          const isWithered = ev.kind === "harvest" && ev.reward === 0;
          const isInsufficient = ev.kind === "insufficient_funds";
          const text =
            ev.kind === "harvest"
              ? isWithered
                ? "เหี่ยว"
                : `+${ev.reward}`
              : ev.kind === "till"
                ? "ขุด"
                : ev.kind === "water"
                  ? "รดน้ำ"
                  : ev.kind === "plant"
                    ? CROPS[ev.cropId].name
                    : ev.kind === "insufficient_funds"
                      ? "เงินไม่พอ"
                      : "";
          if (!text) return;
          const color =
            isWithered || isInsufficient
              ? "#ff6b6b"
              : ev.kind === "harvest"
                ? "#ffd24a"
                : "#f4e4c1";
          const label = this.add
            .text(ev.x * TILE + TILE / 2, ev.y * TILE, text, {
              fontFamily: PIXEL_FONT,
              fontSize: "10px",
              color,
              stroke: "#000000",
              strokeThickness: 3,
            })
            .setOrigin(0.5, 0.5)
            .setDepth(20);
          this.tweens.add({
            targets: label,
            y: ev.y * TILE - 24,
            alpha: 0,
            duration: 950,
            ease: "Quad.Out",
            onComplete: () => label.destroy(),
          });
        }

        /** Glide each teammate sprite toward its latest server position. */
        updateTeammates(time: number, delta: number) {
          const mates = teammatesRef.current;
          // Advance tool swings each frame; the expiry frame still redraws so
          // the overlay clears.
          let swinging = false;
          for (const [id, act] of this.teammateActing) {
            if (time >= act.until) this.teammateActing.delete(id);
            swinging = true;
          }
          if (!mates.length && !this.teammateDisp.size) return;
          const k = 1 - Math.exp(-delta / MOVE_TAU);
          let moved = false;
          for (const mate of mates) {
            const disp = this.teammateDisp.get(mate.id);
            if (!disp) {
              moved = true;
              continue;
            }
            const dx = mate.pos.x - disp.x;
            const dy = mate.pos.y - disp.y;
            if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) {
              disp.x = mate.pos.x;
              disp.y = mate.pos.y;
              moved = true;
            } else if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
              disp.x += dx * k;
              disp.y += dy * k;
              this.maybeSpawnTeammateTrail(mate, time, disp);
              moved = true;
            }
          }
          if (moved || swinging) this.drawTeammates();
        }

        override update(time: number, delta: number) {
          this.updateTeammates(time, delta);
          const predictedDir = predictedDirRef.current;
          const p = playerRef.current;
          if (predictedDir) p.dir = predictedDir;

          const serverDir = predictedDir ? undefined : p.inputDir;
          if (serverDir) {
            const step = (delta / 1000) * MOVE_SPEED_TILES_PER_SECOND;
            p.dir = serverDir;
            if (serverDir === "up") this.disp.y = Math.max(0, this.disp.y - step);
            if (serverDir === "down") this.disp.y = Math.min(ROWS - 1, this.disp.y + step);
            if (serverDir === "left") this.disp.x = Math.max(0, this.disp.x - step);
            if (serverDir === "right") this.disp.x = Math.min(COLS - 1, this.disp.x + step);

            const correctionX = this.target.x - this.disp.x;
            const correctionY = this.target.y - this.disp.y;
            const correction = 1 - Math.exp(-delta / 120);
            this.disp.x += correctionX * correction;
            this.disp.y += correctionY * correction;

            this.moving = true;
            this.walkFrame = Math.floor(time / 110) % 2;
            this.maybeSpawnSelfTrail(time);
            this.drawMarker();
            this.drawFarmer();
            return;
          }

          const dx = this.target.x - this.disp.x;
          const dy = this.target.y - this.disp.y;
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
            // Frame-rate independent exponential smoothing toward the target.
            const k = 1 - Math.exp(-delta / MOVE_TAU);
            this.disp.x += dx * k;
            this.disp.y += dy * k;
            if (Math.abs(this.target.x - this.disp.x) < 0.03) this.disp.x = this.target.x;
            if (Math.abs(this.target.y - this.disp.y) < 0.03) this.disp.y = this.target.y;
            this.moving = true;
            this.walkFrame = Math.floor(time / 110) % 2;

            if (!predictedDir) {
              if (Math.abs(dx) > Math.abs(dy)) {
                playerRef.current.dir = dx > 0 ? "right" : "left";
              } else {
                playerRef.current.dir = dy > 0 ? "down" : "up";
              }
            }

            this.maybeSpawnSelfTrail(time);
            this.drawMarker();
            this.drawFarmer();
          } else {
            if (this.moving) {
              this.disp.x = this.target.x;
              this.disp.y = this.target.y;
              this.moving = false;
              this.walkFrame = 0;
              this.drawMarker();
              this.drawFarmer();
            } else if (this.acting) {
              this.drawFarmer();
            }
          }
        }
      }

      game = new PhaserLib.Game({
        type: PhaserLib.AUTO,
        parent: hostRef.current,
        width: COLS * TILE,
        height: ROWS * TILE,
        transparent: true,
        pixelArt: true,
        scale: { mode: PhaserLib.Scale.NONE },
        scene: Scene,
      });
    });

    return () => {
      destroyed = true;
      sceneRef.current = null;
      game?.destroy(true);
    };
  }, [addShoeTrailPoint]);

  // Push snapshot updates into the scene.
  useEffect(() => {
    sceneRef.current?.applyPlayer();
  }, [player]);

  // Redraw field and teammate sprites when their props change (tool, role, cargo, roster, stage).
  useEffect(() => {
    sceneRef.current?.applyPlayer();
    sceneRef.current?.applyTeammates();
  }, [teammates, stage]);

  // Apply local movement direction immediately for the controlled player.
  useEffect(() => {
    sceneRef.current?.setPredictedDir(predictedDir ?? null);
  }, [predictedDir]);

  // Redraw the farmer when the action pose toggles (may arrive without a snapshot).
  useEffect(() => {
    if (acting) {
      sceneRef.current?.triggerAction();
    } else {
      sceneRef.current?.refreshFarmer();
    }
  }, [acting]);

  // Spawn floating text for events not yet shown.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const { id, ev } of events) {
      if (seenEvents.current.has(id)) continue;
      seenEvents.current.add(id);
      scene.spawnEvent(ev);
    }
    // prune ids no longer present to avoid unbounded growth
    if (seenEvents.current.size > 200) {
      const live = new Set(events.map((e) => e.id));
      seenEvents.current = live;
    }
  }, [events]);

  return (
    <div
      className="relative field-frame scanlines"
      style={{ width: COLS * TILE, height: ROWS * TILE }}
    >
      {shoeTrailPath && (
        <ShoeTrailOverlay
          width={COLS * TILE}
          height={ROWS * TILE}
          kind={shoeTrailPath.kind}
          points={shoeTrailPath.points}
        />
      )}
      <div ref={hostRef} className="absolute inset-0 z-10" />
    </div>
  );
}

// Minimal structural type for the scene methods React calls.
interface FieldScene {
  applyPlayer(): void;
  applyTeammates(): void;
  refreshFarmer(): void;
  setPredictedDir(dir: Direction | null): void;
  spawnEvent(ev: ServerEvent): void;
  triggerAction(): void;
}
