import { useEffect, useRef, useState, useCallback } from "react";
import PixelFarmer from "./PixelFarmer";


type Direction = "up" | "down" | "left" | "right";
type TileType = "grass" | "tilled" | "watered";
type CropId = "chili" | "rice" | "morning_glory" | "eggplant";

interface Crop {
  id: CropId;
  name: string;
  emoji: string;
  growEmoji: string[];
  growTime: number; // ms per stage
  sellPrice: number;
  seedCost: number;
}

const CROPS: Record<CropId, Crop> = {
  chili: { id: "chili", name: "พริก", emoji: "🌶️", growEmoji: ["🌱", "🌿", "🌶️"], growTime: 6000, sellPrice: 25, seedCost: 8 },
  rice: { id: "rice", name: "ข้าว", emoji: "🌾", growEmoji: ["🌱", "🌿", "🌾"], growTime: 9000, sellPrice: 40, seedCost: 12 },
  morning_glory: { id: "morning_glory", name: "ผักบุ้ง", emoji: "🥬", growEmoji: ["🌱", "🌿", "🥬"], growTime: 5000, sellPrice: 18, seedCost: 5 },
  eggplant: { id: "eggplant", name: "มะเขือ", growEmoji: ["🌱", "🌿", "🍆"], emoji: "🍆", growTime: 8000, sellPrice: 35, seedCost: 10 },
};

interface Tile {
  type: TileType;
  crop?: { id: CropId; plantedAt: number; stage: number };
}

const COLS = 12;
const ROWS = 8;
const TILE = 56;

type Tool = "hoe" | "watering_can" | "seed";

export default function FarmGame() {
  const [pos, setPos] = useState({ x: 5, y: 4 });
  const [dir, setDir] = useState<Direction>("down");
  const [walking, setWalking] = useState(false);
  const [tiles, setTiles] = useState<Tile[][]>(() =>
    Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ type: "grass" as TileType }))),
  );
  const [tool, setTool] = useState<Tool>("hoe");
  const [seedChoice, setSeedChoice] = useState<CropId>("chili");
  const [coins, setCoins] = useState(50);
  const [day, setDay] = useState(1);
  const [popups, setPopups] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [acting, setActing] = useState(false);
  const keys = useRef<Set<string>>(new Set());
  const popupId = useRef(0);

  const facingTile = useCallback(() => {
    let { x, y } = pos;
    if (dir === "up") y -= 1;
    else if (dir === "down") y += 1;
    else if (dir === "left") x -= 1;
    else if (dir === "right") x += 1;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    return { x, y };
  }, [pos, dir]);

  const addPopup = (x: number, y: number, text: string) => {
    const id = ++popupId.current;
    setPopups((p) => [...p, { id, x, y, text }]);
    setTimeout(() => setPopups((p) => p.filter((q) => q.id !== id)), 900);
  };

  const doAction = useCallback(() => {
    const t = facingTile();
    if (!t) return;
    setActing(true);
    setTimeout(() => setActing(false), 250);

    setTiles((grid) => {
      const next: Tile[][] = grid.map((r) => r.map((c) => ({ ...c, crop: c.crop ? { ...c.crop } : undefined })));
      const tile = next[t.y][t.x];

      if (tile.crop && tile.crop.stage >= 2) {
        const crop = CROPS[tile.crop.id];
        setCoins((c) => c + crop.sellPrice);
        addPopup(t.x, t.y, `+${crop.sellPrice} ฿`);
        next[t.y][t.x] = { type: "grass" };
        return next;
      }

      if (tool === "hoe") {
        if (tile.type === "grass") {
          next[t.y][t.x] = { type: "tilled" };
          addPopup(t.x, t.y, "ขุด!");
        }
      } else if (tool === "watering_can") {
        if (tile.type === "tilled" || (tile.crop && tile.type !== "watered")) {
          next[t.y][t.x] = { ...tile, type: "watered" };
          addPopup(t.x, t.y, "💧");
        }
      } else if (tool === "seed") {
        if ((tile.type === "tilled" || tile.type === "watered") && !tile.crop) {
          const crop = CROPS[seedChoice];
          if (coins >= crop.seedCost) {
            setCoins((c) => c - crop.seedCost);
            next[t.y][t.x] = { ...tile, crop: { id: seedChoice, plantedAt: Date.now(), stage: 0 } };
            addPopup(t.x, t.y, `ปลูก ${crop.name}`);
          } else {
            addPopup(t.x, t.y, "เงินไม่พอ!");
          }
        }
      }
      return next;
    });
  }, [facingTile, tool, seedChoice, coins]);

  // crop growth tick
  useEffect(() => {
    const i = setInterval(() => {
      setTiles((grid) => {
        let changed = false;
        const next = grid.map((row) =>
          row.map((c) => {
            if (c.crop && c.type === "watered" && c.crop.stage < 2) {
              const crop = CROPS[c.crop.id];
              if (Date.now() - c.crop.plantedAt > crop.growTime * (c.crop.stage + 1)) {
                changed = true;
                return { ...c, crop: { ...c.crop, stage: c.crop.stage + 1 } };
              }
            }
            return c;
          }),
        );
        return changed ? next : grid;
      });
    }, 500);
    return () => clearInterval(i);
  }, []);

  // movement
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (k === " " || k === "enter") doAction();
      if (k === "1") setTool("hoe");
      if (k === "2") setTool("watering_can");
      if (k === "3") setTool("seed");
    };
    const onUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [doAction]);

  useEffect(() => {
    const i = setInterval(() => {
      const k = keys.current;
      let nd: Direction | null = null;
      if (k.has("w") || k.has("arrowup")) nd = "up";
      else if (k.has("s") || k.has("arrowdown")) nd = "down";
      else if (k.has("a") || k.has("arrowleft")) nd = "left";
      else if (k.has("d") || k.has("arrowright")) nd = "right";
      if (!nd) {
        setWalking(false);
        return;
      }
      setDir(nd);
      setWalking(true);
      setPos((p) => {
        let { x, y } = p;
        if (nd === "up") y = Math.max(0, y - 1);
        if (nd === "down") y = Math.min(ROWS - 1, y + 1);
        if (nd === "left") x = Math.max(0, x - 1);
        if (nd === "right") x = Math.min(COLS - 1, x + 1);
        return { x, y };
      });
    }, 140);
    return () => clearInterval(i);
  }, []);

  const sleep = () => {
    setDay((d) => d + 1);
    setTiles((grid) => grid.map((r) => r.map((c) => (c.type === "watered" ? { ...c, type: "tilled" } : c))));
    setCoins((c) => c + 5);
  };

  const facing = facingTile();
  const toolEmoji = { hoe: "⛏️", watering_can: "🪣", seed: "🌱" }[tool];
  const charEmoji = walking ? (dir === "left" ? "🚶‍♂️" : dir === "right" ? "🚶‍♂️" : "🏃") : "🧑‍🌾";

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 gap-4">
      {/* Header */}
      <header className="w-full max-w-5xl flex items-center justify-between gap-4 px-6 py-3 rounded-2xl bg-card border-2 border-primary/40 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg thai-pattern" />
          <div>
            <h1 className="text-2xl font-bold text-primary leading-none">สวนผักไทย</h1>
            <p className="text-xs text-muted-foreground">Thai Farm — Stardew style</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="px-3 py-1.5 rounded-lg bg-gold/30 border border-gold font-semibold">
            🪙 {coins} ฿
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-secondary font-semibold">วันที่ {day}</div>
          <button
            onClick={sleep}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
          >
            😴 นอน
          </button>
        </div>
      </header>

      {/* Field */}
      <div
        className="relative rounded-2xl overflow-hidden border-4 border-primary/60 shadow-2xl"
        style={{ width: COLS * TILE, height: ROWS * TILE }}
      >
        {tiles.map((row, y) =>
          row.map((c, x) => {
            const isFacing = facing && facing.x === x && facing.y === y;
            const cls =
              c.type === "grass" ? "tile-grass" : c.type === "watered" ? "tile-watered" : "tile-tilled";
            return (
              <div
                key={`${x}-${y}`}
                className={`absolute ${cls} border border-black/10`}
                style={{ left: x * TILE, top: y * TILE, width: TILE, height: TILE }}
              >
                {isFacing && (
                  <div className="absolute inset-1 rounded-md border-2 border-gold animate-pulse pointer-events-none" />
                )}
                {c.crop && (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-3xl"
                    style={{ animation: "grow 0.4s ease-out" }}
                  >
                    {CROPS[c.crop.id].growEmoji[c.crop.stage]}
                  </div>
                )}
              </div>
            );
          }),
        )}

        {/* popups */}
        {popups.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none text-sm font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
            style={{
              left: p.x * TILE + TILE / 2 - 20,
              top: p.y * TILE,
              animation: "float-up 0.9s ease-out forwards",
            }}
          >
            {p.text}
          </div>
        ))}

        {/* character */}
        <div
          className="absolute flex items-center justify-center text-4xl transition-all duration-150 z-10"
          style={{
            left: pos.x * TILE,
            top: pos.y * TILE - 8,
            width: TILE,
            height: TILE,
            animation: walking ? "bob 0.3s infinite" : "none",
            transform: dir === "left" ? "scaleX(-1)" : "scaleX(1)",
            filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.4))",
          }}
        >
          {charEmoji}
          {acting && (
            <span
              className="absolute text-2xl"
              style={{
                top: -4,
                right: dir === "left" ? "auto" : -4,
                left: dir === "left" ? -4 : "auto",
                animation: "dig-pop 0.3s ease-out",
              }}
            >
              {toolEmoji}
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="w-full max-w-5xl flex flex-wrap items-center justify-center gap-2 p-3 rounded-2xl bg-card border-2 border-primary/40 shadow-lg">
        {([
          { id: "hoe", label: "จอบ", emoji: "⛏️", key: "1" },
          { id: "watering_can", label: "บัวรดน้ำ", emoji: "🪣", key: "2" },
          { id: "seed", label: "ปลูก", emoji: "🌱", key: "3" },
        ] as { id: Tool; label: string; emoji: string; key: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`px-4 py-2 rounded-xl font-semibold flex items-center gap-2 border-2 transition ${
              tool === t.id
                ? "bg-primary text-primary-foreground border-primary scale-105"
                : "bg-secondary border-transparent hover:border-primary/40"
            }`}
          >
            <span className="text-xl">{t.emoji}</span>
            {t.label}
            <span className="text-[10px] opacity-60">[{t.key}]</span>
          </button>
        ))}

        <div className="mx-2 h-8 w-px bg-border" />

        {(Object.values(CROPS) as Crop[]).map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSeedChoice(c.id);
              setTool("seed");
            }}
            className={`px-3 py-2 rounded-xl font-medium flex items-center gap-1.5 border-2 transition ${
              seedChoice === c.id && tool === "seed"
                ? "bg-accent border-accent-foreground/30 scale-105"
                : "bg-muted border-transparent hover:border-accent/60"
            }`}
          >
            <span className="text-lg">{c.emoji}</span>
            <span className="text-sm">{c.name}</span>
            <span className="text-[10px] text-muted-foreground">{c.seedCost}฿</span>
          </button>
        ))}
      </div>

      {/* Hint */}
      <div className="text-xs text-muted-foreground text-center max-w-xl">
        ใช้ <kbd className="px-1.5 py-0.5 bg-card rounded border">WASD</kbd> หรือลูกศรเดิน ·
        <kbd className="px-1.5 py-0.5 bg-card rounded border mx-1">Space</kbd> ใช้เครื่องมือ ·
        ขุด → ปลูก → รดน้ำ → รอโต → เก็บเกี่ยว 🌾
      </div>
    </div>
  );
}
