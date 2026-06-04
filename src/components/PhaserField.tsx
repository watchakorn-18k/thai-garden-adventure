import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import { COLS, CROPS, ROWS, type Direction } from "@/lib/game-types";
import type { PublicPlayer, ServerEvent } from "@/lib/match-protocol";
import { ART_GRID, cropRects, farmerRects, type Rect } from "@/lib/pixel-art";

const TILE = 56;
// Time constant for exponential movement smoothing (ms). Lower = snappier and
// closer to the server position, higher = smoother but more trailing.
const MOVE_TAU = 45;
const MOVE_SPEED_TILES_PER_SECOND = 5.8;
const PIXEL_FONT = '"Press Start 2P", "VT323", monospace';

const TYPE_CODE: Record<"grass" | "tilled" | "watered", number> = {
  grass: 0,
  tilled: 1,
  watered: 2,
};
const CROP_CODE: Record<string, number> = { chili: 1, rice: 2, morning_glory: 3, eggplant: 4 };

interface Props {
  player: PublicPlayer;
  events: { id: number; ev: ServerEvent }[];
  acting: boolean;
  predictedDir?: Direction | null;
}

function hexNum(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function drawRects(g: Phaser.GameObjects.Graphics, rects: Rect[], ox: number, oy: number) {
  const s = TILE / ART_GRID;
  for (const [x, y, w, h, color] of rects) {
    g.fillStyle(hexNum(color), 1);
    g.fillRect(ox + x * s, oy + y * s, w * s, h * s);
  }
}

/**
 * Renders one player's playing field (tiles, crops, interpolated farmer, facing
 * marker, ambience and floating event text) inside a Phaser canvas. The React
 * shell (HUD, lobby, toolbar, …) stays outside in MultiplayerGame.
 */
export default function PhaserField({ player, events, acting, predictedDir }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FieldScene | null>(null);
  const seenEvents = useRef<Set<number>>(new Set());

  // Latest props for the scene to read once it boots.
  const playerRef = useRef(player);
  const actingRef = useRef(acting);
  const predictedDirRef = useRef<Direction | null>(predictedDir ?? null);
  playerRef.current = player;
  actingRef.current = acting;
  predictedDirRef.current = predictedDir ?? null;

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let destroyed = false;

    void import("phaser").then((mod) => {
      if (destroyed || !hostRef.current) return;
      const PhaserLib = mod.default;

      class Scene extends PhaserLib.Scene {
        private tileG!: Phaser.GameObjects.Graphics;
        private cropG!: Phaser.GameObjects.Graphics;
        private markerG!: Phaser.GameObjects.Graphics;
        private farmerG!: Phaser.GameObjects.Graphics;
        private sparkles: Phaser.GameObjects.Arc[] = [];
        // farmer display position in tile units (float for interpolation)
        private disp = { x: 0, y: 0 };
        // latest server position the farmer is smoothing toward
        private target = { x: 0, y: 0 };
        private moving = false;
        private walkFrame = 0;
        // signature of the last drawn tile/crop layout; skip redraw when unchanged
        private lastSig = -1;

        constructor() {
          super("field");
        }

        create() {
          this.tileG = this.add.graphics();
          this.cropG = this.add.graphics();
          this.markerG = this.add.graphics();
          this.farmerG = this.add.graphics();

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
          this.drawMarker();
          this.drawFarmer();
          sceneRef.current = this as unknown as FieldScene;
        }

        /** Cheap rolling hash of the tile/crop layout to detect changes. */
        tileSignature(): number {
          const p = playerRef.current;
          let h = 0;
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
          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              const cell = p.tiles[y]?.[x];
              const px = x * TILE;
              const py = y * TILE;
              this.paintTile(px, py, cell?.type ?? "grass");
              if (cell?.crop)
                drawRects(this.cropG, cropRects(cell.crop.id, cell.crop.stage), px, py);
            }
          }
        }

        paintTile(px: number, py: number, type: "grass" | "tilled" | "watered") {
          const g = this.tileG;
          if (type === "grass") {
            g.fillStyle(0x6ab04c, 1);
            g.fillRect(px, py, TILE, TILE);
            g.fillStyle(0x4e8c3a, 1);
            g.fillRect(px, py + TILE * 0.5, TILE, TILE * 0.5);
            g.fillStyle(0x8bc967, 1);
            g.fillRect(px + 10, py + 16, 3, 3);
            g.fillRect(px + 38, py + 11, 3, 3);
            g.fillRect(px + 22, py + 38, 3, 3);
            g.fillStyle(0x2a4d1f, 1);
            g.fillRect(px + 14, py + 41, 4, 4);
            g.fillRect(px + 44, py + 25, 4, 4);
            g.fillStyle(0x3a6b2a, 1);
            g.fillRect(px, py + TILE - 3, TILE, 3);
          } else {
            // tilled / watered share the furrow base
            const base = type === "watered" ? 0x2a1810 : 0x5a2f17;
            const dark = type === "watered" ? 0x1f1208 : 0x422010;
            const light = type === "watered" ? 0x3a2010 : 0x6b3a1c;
            g.fillStyle(base, 1);
            g.fillRect(px, py, TILE, TILE);
            for (let fy = 0; fy < TILE; fy += 18) {
              g.fillStyle(dark, 1);
              g.fillRect(px, py + fy, TILE, 6);
              g.fillStyle(light, 1);
              g.fillRect(px, py + fy + 10, TILE, 2);
            }
            if (type === "watered") {
              g.fillStyle(0x7fd8ff, 0.9);
              g.fillRect(px + 16, py + 18, 2, 2);
              g.fillRect(px + 38, py + 30, 2, 2);
            }
          }
          // tile edge
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
          this.markerG.fillStyle(0xffd24a, 0.12);
          this.markerG.fillRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
          this.markerG.lineStyle(2, 0xffd24a, 0.7);
          this.markerG.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
        }

        drawFarmer() {
          const p = playerRef.current;
          this.farmerG.clear();
          const flip = p.dir === "left";
          const swing = this.moving ? this.walkFrame % 2 : 0;
          const rects = farmerRects({
            direction: p.dir,
            swing,
            acting: actingRef.current,
            tool: p.tool,
            cosmetics: p.cosmetics,
          });
          const bob = this.moving ? (this.walkFrame % 2 === 0 ? 0 : -1.5) : 0;
          const baseX = this.disp.x * TILE;
          const baseY = this.disp.y * TILE - 10 + bob;
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

        setPredictedDir(dir: Direction | null) {
          const p = playerRef.current;
          if (dir) p.dir = dir;
          this.drawMarker();
          this.drawFarmer();
        }

        spawnEvent(ev: ServerEvent) {
          if (ev.kind === "insufficient_funds") return;
          const isWithered = ev.kind === "harvest" && ev.reward === 0;
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
                    : "";
          if (!text) return;
          const color = isWithered ? "#ff6b6b" : ev.kind === "harvest" ? "#ffd24a" : "#f4e4c1";
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

        override update(time: number, delta: number) {
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
            this.drawFarmer();
          } else if (this.moving) {
            this.disp.x = this.target.x;
            this.disp.y = this.target.y;
            this.moving = false;
            this.walkFrame = 0;
            this.drawFarmer();
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
  }, []);

  // Push snapshot updates into the scene.
  useEffect(() => {
    sceneRef.current?.applyPlayer();
  }, [player]);

  // Apply local movement immediately for the controlled player.
  useEffect(() => {
    if (!predictedMove || predictedMove.seq === lastPredictedSeq.current) return;
    lastPredictedSeq.current = predictedMove.seq;
    sceneRef.current?.predictMove(predictedMove.dir);
  }, [predictedMove]);

  // Redraw the farmer when the action pose toggles (may arrive without a snapshot).
  useEffect(() => {
    sceneRef.current?.refreshFarmer();
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
    </div>
  );
}

// Minimal structural type for the scene methods React calls.
interface FieldScene {
  applyPlayer(): void;
  refreshFarmer(): void;
  predictMove(dir: Direction): void;
  spawnEvent(ev: ServerEvent): void;
}
