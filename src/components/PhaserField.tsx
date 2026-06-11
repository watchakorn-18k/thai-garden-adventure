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

  // Body
  g.fillStyle(0x8b5a2b, 1);
  g.fillRect(px, py, w, h);
  // Rim
  g.fillStyle(0xa06a3a, 1);
  g.fillRect(px + 0.5 * s, py - 1 * s, w - 1 * s, 1 * s);
  // Interior
  g.fillStyle(0x5a2f17, 1);
  g.fillRect(px + 1 * s, py + 0.5 * s, w - 2 * s, h - 1 * s);
  // Woven band
  g.fillStyle(0x6b3a1b, 1);
  g.fillRect(px + 0.25 * s, py + h * 0.6, w - 0.5 * s, 0.25 * s);
  // Handle
  g.fillStyle(0x6b3a1b, 1);
  g.fillRect(px + 1 * s, py - 1.5 * s, w - 2 * s, 0.5 * s);

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
        private farmerG!: Phaser.GameObjects.Graphics;
        private toolG!: Phaser.GameObjects.Graphics;
        // signature of the last drawn cargo layout; skip redraw when unchanged
        private lastCargoSig = "";
        private sparkles: Phaser.GameObjects.Arc[] = [];
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

          // ambient sparkles
          for (let i = 0; i < 10; i++) {
            const dot = this.add.circle(
              6 + ((i * 19) % 88) * (COLS * TILE) * 0.01,
              8 + ((i * 31) % 78) * (ROWS * TILE) * 0.01,
              1.5,
              0xffd24a,
              0.8,
            );
            this.tweens.add({
              targets: dot,
              alpha: 0.1,
              scale: 0.4,
              duration: 1200,
              delay: i * 220,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
            this.sparkles.push(dot);
          }

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
          if (!showMarketRef.current) return;
          const px = MARKET_TILE_POS.x * TILE;
          const py = MARKET_TILE_POS.y * TILE;
          const g = this.marketG;
          // stall pad
          g.fillStyle(0x3a2418, 1);
          g.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          g.fillStyle(0x5a2f17, 1);
          g.fillRect(px + 6, py + TILE - 16, TILE - 12, 10);
          // striped awning
          for (let i = 0; i < 4; i++) {
            g.fillStyle(i % 2 === 0 ? 0xff8fb1 : 0xfff1d6, 1);
            g.fillRect(px + 6 + i * 11, py + 8, 11, 8);
          }
          g.fillStyle(0x1a0f1f, 1);
          g.fillRect(px + 6, py + 16, TILE - 12, 2);
          // coin marker
          g.fillStyle(0xffd24a, 1);
          g.fillRect(px + TILE / 2 - 5, py + 24, 10, 10);
          g.fillStyle(0xd99b1f, 1);
          g.fillRect(px + TILE / 2 - 2, py + 27, 4, 4);
          // pulsing outline so sellers can spot it
          g.lineStyle(2, 0xffd24a, 0.8);
          g.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5);
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
              drawBasket(this.teammateG, baseX, baseY, mate.dir, s, stack.length, topCropId);
            }
            for (const [rx, ry, rw, rh, color] of rects) {
              this.teammateG.fillStyle(hexNum(color), 1);
              const mx = flip ? ART_GRID - rx - rw : rx;
              this.teammateG.fillRect(baseX + mx * s, baseY + ry * s, rw * s, rh * s);
            }
            if (stack.length > 0 && mate.dir === "up") {
              drawBasket(this.teammateG, baseX, baseY, mate.dir, s, stack.length, topCropId);
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
          if (stageRef.current === "water") this.drawWaterStageBase();
          if (stageRef.current === "festival") this.drawFestivalStageBase();
          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              const cell = p.tiles[y]?.[x];
              const px = x * TILE;
              const py = y * TILE;
              this.paintTile(px, py, cell?.type ?? "grass");
              if (cell?.crop)
                drawRects(this.cropG, cropRects(cell.crop.id, cell.crop.stage), px, py);
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

        paintTile(px: number, py: number, type: "grass" | "tilled" | "watered") {
          const g = this.tileG;
          const palette = STAGE_PALETTE[stageRef.current];
          if (type === "grass") {
            g.fillStyle(palette.grassTop, 1);
            g.fillRect(px, py, TILE, TILE);
            g.fillStyle(palette.grassBottom, 1);
            g.fillRect(px, py + TILE * 0.5, TILE, TILE * 0.5);
            g.fillStyle(palette.grassBlade, 1);
            g.fillRect(px + 10, py + 16, 3, 3);
            g.fillRect(px + 38, py + 11, 3, 3);
            g.fillRect(px + 22, py + 38, 3, 3);
            g.fillStyle(palette.grassShadow, 1);
            g.fillRect(px + 14, py + 41, 4, 4);
            g.fillRect(px + 44, py + 25, 4, 4);
            g.fillStyle(palette.grassEdge, 1);
            g.fillRect(px, py + TILE - 3, TILE, 3);
            if (stageRef.current === "water" && (px / TILE + py / TILE) % 4 === 0) {
              g.fillStyle(palette.waterSpark, 0.65);
              g.fillRect(px + 5, py + 5, 5, 2);
            }
            if (stageRef.current === "festival" && (px / TILE + py / TILE) % 5 === 0) {
              g.fillStyle(palette.accent, 0.75);
              g.fillRect(px + 44, py + 8, 4, 4);
            }
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
            if (type === "watered") {
              g.fillStyle(palette.waterSpark, 0.9);
              g.fillRect(px + 16, py + 18, 2, 2);
              g.fillRect(px + 38, py + 30, 2, 2);
            }
          }
          g.lineStyle(1, 0x000000, 0.25);
          g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
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
          this.markerG.fillStyle(markerColor, 0.12);
          this.markerG.fillRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
          this.markerG.lineStyle(2, markerColor, 0.7);
          this.markerG.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
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

          // Basket layering: when facing away (up) the pack is on the visible
          // back, so it draws ON TOP of the body. Every other direction it's
          // behind the body, so it draws first.
          const stack = playerCargoStack(p);
          const hasBasket = p.role === "seller" || stack.length > 0;
          const topCropId = stack[stack.length - 1]?.cropId;
          if (hasBasket && p.dir !== "up") {
            drawBasket(this.farmerG, baseX, baseY, p.dir, TILE / ART_GRID, stack.length, topCropId);
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
            drawBasket(this.farmerG, baseX, baseY, p.dir, TILE / ART_GRID, stack.length, topCropId);
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

        spawnEvent(ev: ServerEvent) {
          if (ev.kind === "cargo_picked_up") {
            // Show pickup text near the teammate who picked up
            const mates = teammatesRef.current;
            const picker = mates.find((m) => m.id === ev.playerId);
            if (!picker) return;
            const disp = this.teammateDisp.get(picker.id) ?? { x: picker.pos.x, y: picker.pos.y };
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
            this.drawTeammates();
            return;
          }
          if (ev.kind === "cargo_sold") {
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
          if (ev.kind === "till" || ev.kind === "water") {
            this.spawnToolSkinEffect(ev);
          }
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
          if (moved) this.drawTeammates();
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
      <div ref={hostRef} className="absolute inset-0" />
      {shoeTrailPath && (
        <ShoeTrailOverlay
          width={COLS * TILE}
          height={ROWS * TILE}
          kind={shoeTrailPath.kind}
          points={shoeTrailPath.points}
        />
      )}
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
