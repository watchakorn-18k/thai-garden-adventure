import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import PixelFarmer from "./PixelFarmer";
import PixelCrop from "./PixelCrop";
import CosmeticPicker from "./CosmeticPicker";
import {
  HoeIcon,
  WaterCanIcon,
  SeedIcon,
  CoinIcon,
  MoonIcon,
  ChiliIcon,
  RiceIcon,
  MorningGloryIcon,
  EggplantIcon,
} from "./PixelIcons";
import {
  COLS,
  CROPS,
  ROWS,
  makeEmptyField,
  type Crop,
  type CropId,
  type Direction,
  type Tile,
  type Tool,
} from "@/lib/game-types";
import { applyAction, tickGrowth } from "@/lib/game-logic";
import { SFX, setMuted, isMuted } from "@/lib/sfx";
import { readCosmetics, writeCosmetics } from "@/lib/player-cosmetics";

const TILE = 56;
const COMBO_WINDOW = 2200; // ms to keep combo alive

const CROP_ICONS: Record<CropId, React.ComponentType<{ size?: number }>> = {
  chili: ChiliIcon,
  rice: RiceIcon,
  morning_glory: MorningGloryIcon,
  eggplant: EggplantIcon,
};

export default function FarmGame() {
  const [pos, setPos] = useState({ x: 5, y: 4 }); // tile-unit float
  const [dir, setDir] = useState<Direction>("down");
  const [walking, setWalking] = useState(false);
  const posRef = useRef({ x: 5, y: 4 });
  const dirRef = useRef<Direction>("down");
  const walkingRef = useRef(false);
  const [tiles, setTiles] = useState<Tile[][]>(() => makeEmptyField());
  const [tool, setTool] = useState<Tool>("hoe");
  const [seedChoice, setSeedChoice] = useState<CropId>("chili");
  const [coins, setCoins] = useState(50);
  const [cosmetics, setCosmetics] = useState(() => readCosmetics());
  const [popups, setPopups] = useState<
    { id: number; x: number; y: number; text: string; tone: "good" | "bad" | "info" }[]
  >([]);
  const [acting, setActing] = useState(false);
  const [walkFrame, setWalkFrame] = useState(0);
  const [particles, setParticles] = useState<
    {
      id: number;
      x: number;
      y: number;
      kind: "dirt" | "water" | "sparkle";
      dx: number;
      dy: number;
      color: string;
    }[]
  >([]);
  const [shakeTile, setShakeTile] = useState<{ x: number; y: number; id: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [comboShown, setComboShown] = useState<{
    id: number;
    level: number;
    x: number;
    y: number;
  } | null>(null);
  const [flyCoins, setFlyCoins] = useState<
    { id: number; sx: number; sy: number; cx: number; cy: number }[]
  >([]);
  const [crits, setCrits] = useState<{ id: number; x: number; y: number }[]>([]);
  const [dust, setDust] = useState<{ id: number; x: number; y: number; dx: number; dy: number }[]>(
    [],
  );
  const [screenShake, setScreenShake] = useState(0);
  const [hudPulse, setHudPulse] = useState(false);
  const [muted, setMutedState] = useState(false);
  const comboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDustAt = useRef(0);
  const keys = useRef<Set<string>>(new Set());
  const popupId = useRef(0);
  const fieldRef = useRef<HTMLDivElement>(null);

  const facingTile = useCallback(() => {
    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    if (dir === "up") y -= 1;
    else if (dir === "down") y += 1;
    else if (dir === "left") x -= 1;
    else if (dir === "right") x += 1;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    return { x, y };
  }, [pos, dir]);

  const addPopup = (x: number, y: number, text: string, tone: "good" | "bad" | "info" = "info") => {
    const id = ++popupId.current;
    setPopups((p) => [...p, { id, x, y, text, tone }]);
    setTimeout(() => setPopups((p) => p.filter((q) => q.id !== id)), 950);
  };

  const burstParticles = (x: number, y: number, kind: "dirt" | "water" | "sparkle") => {
    const palette =
      kind === "dirt"
        ? ["#6b3a1c", "#8b5a2b", "#3d2412"]
        : kind === "water"
          ? ["#4cc2ee", "#7fd8ff", "#2a8ec0"]
          : ["#ffe07a", "#fff5b8", "#e8a23a"];
    const count = kind === "sparkle" ? 10 : 8;
    const fresh = Array.from({ length: count }).map((_, i) => {
      const angle = (Math.PI * (i + 1)) / (count + 1) + Math.PI;
      const speed = 22 + Math.random() * 20;
      return {
        id: popupId.current + i + 1,
        x,
        y,
        kind,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 8,
        color: palette[i % palette.length],
      };
    });
    popupId.current += count;
    setParticles((p) => [...p, ...fresh]);
    setTimeout(() => setParticles((p) => p.filter((q) => !fresh.find((f) => f.id === q.id))), 650);
  };

  const shake = (x: number, y: number) => {
    const id = ++popupId.current;
    setShakeTile({ x, y, id });
    setTimeout(() => setShakeTile((s) => (s?.id === id ? null : s)), 280);
  };

  const triggerScreenShake = (intensity = 1) => {
    setScreenShake((s) => Math.max(s, intensity));
    setTimeout(() => setScreenShake(0), 320);
  };

  const spawnFlyCoins = (x: number, y: number, n: number) => {
    const sx = x * TILE + TILE / 2;
    const sy = y * TILE + TILE / 2;
    // target ~ top-right of field where coin chip lives
    const cx = COLS * TILE - 60 - sx;
    const cy = -56 - sy;
    const fresh = Array.from({ length: n }).map((_, i) => ({
      id: ++popupId.current,
      sx,
      sy,
      cx: cx + (Math.random() - 0.5) * 30,
      cy: cy + (Math.random() - 0.5) * 30,
      delay: i * 60,
    }));
    setFlyCoins((p) => [
      ...p,
      ...fresh.map((f) => ({ id: f.id, sx: f.sx, sy: f.sy, cx: f.cx, cy: f.cy })),
    ]);
    fresh.forEach((f, i) => {
      setTimeout(() => SFX.coin(), i * 80);
    });
    setTimeout(
      () => {
        setFlyCoins((p) => p.filter((q) => !fresh.find((f) => f.id === q.id)));
        setHudPulse(true);
        setTimeout(() => setHudPulse(false), 700);
      },
      700 + n * 60,
    );
  };

  const spawnCrit = (x: number, y: number) => {
    const id = ++popupId.current;
    setCrits((c) => [...c, { id, x, y }]);
    setTimeout(() => setCrits((c) => c.filter((q) => q.id !== id)), 500);
  };

  const bumpCombo = (x: number, y: number) => {
    setCombo((c) => {
      const next = c + 1;
      const id = ++popupId.current;
      setComboShown({ id, level: next, x, y });
      setTimeout(() => setComboShown((cs) => (cs && cs.id === id ? null : cs)), 1100);
      if (next >= 2) SFX.combo(next);
      return next;
    });
    if (comboTimer.current) clearTimeout(comboTimer.current);
    comboTimer.current = setTimeout(() => setCombo(0), COMBO_WINDOW);
  };

  const doAction = useCallback(() => {
    const t = facingTile();
    if (!t) return;
    setActing(true);
    setTimeout(() => setActing(false), 320);

    setTiles((grid) => {
      const result = applyAction({
        tiles: grid,
        coins,
        pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
        dir,
        tool,
        seedChoice,
        now: Date.now(),
      });
      let nextCoins = result.coins;
      for (const ev of result.events) {
        if (ev.kind === "harvest") {
          const isCrit = Math.random() < 0.18;
          const comboBonus = combo >= 2 ? Math.floor(ev.reward * 0.25 * Math.min(combo, 6)) : 0;
          const critBonus = isCrit ? ev.reward : 0;
          const total = ev.reward + comboBonus + critBonus;
          nextCoins += total - ev.reward; // applyAction already added ev.reward
          addPopup(ev.x, ev.y, isCrit ? `CRIT +${total}` : `+${total}`, "good");
          burstParticles(ev.x, ev.y, "sparkle");
          spawnFlyCoins(ev.x, ev.y, Math.min(8, Math.max(3, Math.floor(total / 10))));
          bumpCombo(ev.x, ev.y);
          if (isCrit) {
            spawnCrit(ev.x, ev.y);
            triggerScreenShake(1);
            SFX.crit();
          } else {
            SFX.harvest();
          }
        } else if (ev.kind === "till") {
          addPopup(ev.x, ev.y, "ขุด", "info");
          burstParticles(ev.x, ev.y, "dirt");
          shake(ev.x, ev.y);
          SFX.till();
        } else if (ev.kind === "water") {
          addPopup(ev.x, ev.y, "รดน้ำ", "info");
          burstParticles(ev.x, ev.y, "water");
          SFX.water();
        } else if (ev.kind === "plant") {
          addPopup(ev.x, ev.y, CROPS[ev.cropId].name, "info");
          SFX.plant();
        } else if (ev.kind === "insufficient_funds") {
          addPopup(ev.x, ev.y, "เงินไม่พอ", "bad");
          SFX.bad();
        }
      }
      if (nextCoins !== coins) setCoins(nextCoins);
      return result.tiles;
    });
  }, [facingTile, tool, seedChoice, coins, pos, dir, combo]);

  // crop growth tick
  useEffect(() => {
    const i = setInterval(() => {
      setTiles((grid) => tickGrowth(grid, Date.now()).tiles);
    }, 500);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (k === " " || k === "enter") doAction();
      if (k === "1") setTool("hoe");
      if (k === "2") setTool("watering_can");
      if (k === "3") setTool("seed");
      if (k === "m") {
        const v = !isMuted();
        setMuted(v);
        setMutedState(v);
      }
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
    const SPEED = 5.2; // tiles per second
    let last = performance.now();
    let raf = 0;
    let frameAccum = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = keys.current;

      let dx = 0,
        dy = 0;
      if (k.has("w") || k.has("arrowup")) dy -= 1;
      if (k.has("s") || k.has("arrowdown")) dy += 1;
      if (k.has("a") || k.has("arrowleft")) dx -= 1;
      if (k.has("d") || k.has("arrowright")) dx += 1;

      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        // diagonal normalize
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;

        let nd: Direction = dirRef.current;
        if (Math.abs(dx) > Math.abs(dy)) nd = dx > 0 ? "right" : "left";
        else nd = dy > 0 ? "down" : "up";
        if (nd !== dirRef.current) {
          dirRef.current = nd;
          setDir(nd);
        }

        const cur = posRef.current;
        const nx = Math.max(0, Math.min(COLS - 1, cur.x + dx * SPEED * dt));
        const ny = Math.max(0, Math.min(ROWS - 1, cur.y + dy * SPEED * dt));
        posRef.current = { x: nx, y: ny };
        setPos(posRef.current);

        frameAccum += dt;
        if (frameAccum > 0.14) {
          frameAccum = 0;
          setWalkFrame((f) => f + 1);
          SFX.step();
          // dust puff under feet
          const px = posRef.current.x;
          const py = posRef.current.y;
          const id = ++popupId.current;
          const back = nd === "right" ? -1 : nd === "left" ? 1 : 0;
          const backY = nd === "down" ? -1 : nd === "up" ? 1 : 0;
          const puff = {
            id,
            x: px * TILE + TILE / 2 + back * 6,
            y: py * TILE + TILE - 8 + backY * 6,
            dx: back * 18 + (Math.random() - 0.5) * 10,
            dy: -8 - Math.random() * 6,
          };
          setDust((d) => [...d, puff]);
          setTimeout(() => setDust((d) => d.filter((q) => q.id !== id)), 500);
        }
        if (!walkingRef.current) {
          walkingRef.current = true;
          setWalking(true);
        }
      } else {
        if (walkingRef.current) {
          walkingRef.current = false;
          setWalking(false);
        }
        frameAccum = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const facing = facingTile();

  const cloudConfig = useMemo(
    () => [
      { top: 40, delay: 0, duration: 60, scale: 1, opacity: 0.45 },
      { top: 100, delay: 18, duration: 80, scale: 0.7, opacity: 0.3 },
      { top: 160, delay: 35, duration: 95, scale: 1.2, opacity: 0.25 },
    ],
    [],
  );

  // Decorative scatter on grass tiles - deterministic per tile so it doesn't reshuffle each render.
  const decorMap = useMemo(() => {
    const m: Record<
      string,
      "flower-r" | "flower-y" | "flower-p" | "mushroom" | "stone" | "tuft" | null
    > = {};
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const h = (x * 73856093) ^ (y * 19349663);
        const r = (h >>> 0) % 100;
        if (r < 6) m[`${x}-${y}`] = "flower-r";
        else if (r < 12) m[`${x}-${y}`] = "flower-y";
        else if (r < 17) m[`${x}-${y}`] = "flower-p";
        else if (r < 21) m[`${x}-${y}`] = "mushroom";
        else if (r < 26) m[`${x}-${y}`] = "stone";
        else if (r < 34) m[`${x}-${y}`] = "tuft";
        else m[`${x}-${y}`] = null;
      }
    }
    return m;
  }, []);

  // Butterflies & fireflies fly across the field
  const butterflies = useMemo(
    () => [
      { delay: 0, duration: 14, top: 60, color: "#ffd24a" },
      { delay: 4, duration: 17, top: 180, color: "#ff8fb1" },
      { delay: 9, duration: 13, top: 320, color: "#7fd8ff" },
    ],
    [],
  );
  const fireflies = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        id: i,
        left: 10 + ((i * 53) % 90),
        top: 15 + ((i * 37) % 80),
        delay: (i * 0.7) % 5,
      })),
    [],
  );

  const activityPings = useMemo(
    () => [
      { x: 2, y: 2, delay: 0.4 },
      { x: 8, y: 1, delay: 1.8 },
      { x: 10, y: 6, delay: 3.2 },
      { x: 4, y: 6, delay: 4.6 },
    ],
    [],
  );

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 gap-6 overflow-hidden">
      {/* Sky decoration */}
      <div className="sky-stars" />
      {cloudConfig.map((c, i) => (
        <div
          key={i}
          className="fixed pointer-events-none"
          style={{
            top: c.top,
            left: 0,
            opacity: c.opacity,
            transform: `scale(${c.scale})`,
            animation: `cloud-drift ${c.duration}s linear ${c.delay}s infinite`,
          }}
        >
          <svg width="120" height="40" viewBox="0 0 30 10" shapeRendering="crispEdges">
            <rect x="4" y="3" width="22" height="5" fill="#f4e4c1" />
            <rect x="6" y="2" width="18" height="1" fill="#f4e4c1" />
            <rect x="10" y="1" width="12" height="1" fill="#f4e4c1" />
            <rect x="2" y="4" width="2" height="3" fill="#f4e4c1" />
            <rect x="26" y="4" width="2" height="3" fill="#f4e4c1" />
            <rect x="4" y="8" width="22" height="1" fill="#c8a878" />
          </svg>
        </div>
      ))}

      {/* HUD */}
      <header className="relative z-10 w-full max-w-5xl flex items-center justify-between gap-4 px-6 py-4 pixel-panel">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center"
            style={{
              width: 48,
              height: 48,
              background: "#1a0f1f",
              boxShadow: "inset 0 0 0 2px var(--gold)",
            }}
          >
            <svg viewBox="0 0 16 16" width="40" height="40" shapeRendering="crispEdges">
              <rect x="2" y="6" width="12" height="2" fill="#6ab04c" />
              <rect x="2" y="8" width="12" height="2" fill="#4e8c3a" />
              <rect x="7" y="2" width="2" height="4" fill="#3a6b2a" />
              <rect x="5" y="3" width="2" height="2" fill="#e84444" />
              <rect x="9" y="3" width="2" height="2" fill="#e84444" />
              <rect x="3" y="11" width="2" height="2" fill="#f4d864" />
              <rect x="11" y="11" width="2" height="2" fill="#f4d864" />
            </svg>
          </div>
          <div>
            <h1
              className="font-pixel text-[18px] leading-none text-[var(--gold)]"
              style={{ textShadow: "2px 2px 0 #1a0f1f, 0 0 20px rgba(255,210,74,0.4)" }}
            >
              สวนผักไทย
            </h1>
            <p className="font-pixel text-[8px] text-[var(--muted-foreground)] mt-2">
              THAI · GARDEN · ADVENTURE
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {combo >= 2 && (
            <div className="relative flex flex-col items-end gap-1">
              <div
                className="font-pixel text-[10px]"
                style={{ color: combo >= 5 ? "#ff6b6b" : "#ffd24a", textShadow: "1px 1px 0 #000" }}
              >
                COMBO x{combo}
              </div>
              <div
                style={{
                  width: 80,
                  height: 6,
                  background: "#1a0f1f",
                  boxShadow: "0 0 0 2px var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  key={combo}
                  className="combo-bar-fill"
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #ffd24a, #ff6b6b)",
                    animationDuration: `${COMBO_WINDOW}ms`,
                  }}
                />
              </div>
            </div>
          )}
          <div
            className={`pixel-chip flex items-center gap-2 ${hudPulse ? "pulse-glow" : ""}`}
            data-gold="true"
          >
            <CoinIcon size={18} />
            <span>{coins}</span>
          </div>
          <a
            href="/lobby"
            className="pixel-btn flex items-center gap-2"
            data-accent="true"
            style={{ fontSize: 10 }}
          >
            1V1
          </a>
          <button
            onClick={() => {
              const v = !isMuted();
              setMuted(v);
              setMutedState(v);
              if (!v) SFX.click();
            }}
            className="pixel-btn flex items-center gap-2"
            title="Mute (M)"
            style={{ fontSize: 10 }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-5xl">
        <CosmeticPicker
          value={cosmetics}
          onChange={(next) => {
            setCosmetics(next);
            writeCosmetics(next);
            SFX.click();
          }}
          compact
        />
      </div>

      {/* Field */}
      <div
        ref={fieldRef}
        className={`relative field-frame scanlines ${screenShake ? "screen-shake" : ""}`}
        style={{ width: COLS * TILE, height: ROWS * TILE }}
      >
        {tiles.map((row, y) =>
          row.map((c, x) => {
            const isFacing = facing && facing.x === x && facing.y === y;
            const isShaking = shakeTile && shakeTile.x === x && shakeTile.y === y;
            const cls =
              c.type === "grass"
                ? "tile-grass"
                : c.type === "watered"
                  ? "tile-watered"
                  : "tile-tilled";
            const decor = c.type === "grass" && !c.crop ? decorMap[`${x}-${y}`] : null;
            return (
              <div
                key={`${x}-${y}`}
                className={`absolute tile-edge ${cls} ${isShaking ? "tile-shake" : ""}`}
                style={{ left: x * TILE, top: y * TILE, width: TILE, height: TILE }}
              >
                {decor && <TileDecor kind={decor} />}
                {isFacing && <div className="absolute inset-0 facing-marker pointer-events-none" />}
                {c.type === "watered" && (
                  <div
                    className="absolute pointer-events-none ripple"
                    style={{
                      left: "30%",
                      top: "35%",
                      width: "40%",
                      height: "30%",
                      border: "2px solid #7fd8ff",
                    }}
                  />
                )}
                {c.crop && (
                  <div
                    className={`absolute inset-1 ${c.crop.stage >= 2 ? "ripe-glow" : "crop-sway"}`}
                    style={
                      c.crop.stage >= 2
                        ? undefined
                        : {
                            animation: `grow 0.4s ease-out, crop-sway 2.4s ease-in-out 0.4s infinite`,
                          }
                    }
                  >
                    <PixelCrop id={c.crop.id} stage={c.crop.stage} />
                  </div>
                )}
                {c.crop && c.crop.stage >= 2 && !isFacing && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      inset: 4,
                      border: "2px solid rgba(255,210,74,0.6)",
                      animation: "facing-pulse 1.4s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
            );
          }),
        )}

        {/* Fireflies — float lazily over field */}
        {fireflies.map((f) => (
          <div
            key={`ff-${f.id}`}
            className="absolute pointer-events-none firefly"
            style={{
              left: `${f.left}%`,
              top: `${f.top}%`,
              animationDelay: `${f.delay}s`,
            }}
          />
        ))}

        {/* Butterflies — fly across the field */}
        {butterflies.map((b, i) => (
          <div
            key={`bf-${i}`}
            className="absolute pointer-events-none"
            style={{
              top: b.top,
              left: -40,
              animation: `butterfly-path ${b.duration}s linear ${b.delay}s infinite`,
            }}
          >
            <div className="butterfly-flap" style={{ ["--bf-color" as string]: b.color }}>
              <svg width="20" height="14" viewBox="0 0 20 14" shapeRendering="crispEdges">
                <rect x="9" y="3" width="2" height="8" fill="#1a0f1f" />
                <rect x="2" y="2" width="6" height="4" fill={b.color} />
                <rect x="1" y="3" width="1" height="3" fill={b.color} />
                <rect x="3" y="7" width="5" height="3" fill={b.color} />
                <rect x="12" y="2" width="6" height="4" fill={b.color} />
                <rect x="18" y="3" width="1" height="3" fill={b.color} />
                <rect x="12" y="7" width="5" height="3" fill={b.color} />
              </svg>
            </div>
          </div>
        ))}

        {/* multiplayer-style ambient activity */}
        {activityPings.map((p, i) => (
          <div
            key={`ap-${i}`}
            className="activity-ping"
            style={{
              left: p.x * TILE + TILE / 2 - 14,
              top: p.y * TILE + TILE / 2 - 14,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}

        <div className="absolute pointer-events-none chicken z-20">
          <ChickenSprite />
        </div>
        <div className="absolute pointer-events-none dog z-20">
          <DogSprite />
        </div>

        {/* popups */}
        {popups.map((p) => {
          const color = p.tone === "good" ? "#ffd24a" : p.tone === "bad" ? "#ff6b6b" : "#f4e4c1";
          return (
            <div
              key={p.id}
              className="absolute pointer-events-none font-pixel z-20"
              style={{
                left: p.x * TILE + TILE / 2 - 24,
                top: p.y * TILE,
                width: 48,
                textAlign: "center",
                fontSize: 10,
                color,
                textShadow: "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000",
                animation: "float-up 0.95s ease-out forwards",
              }}
            >
              {p.text}
            </div>
          );
        })}

        {/* dust puffs */}
        {dust.map((d) => (
          <div
            key={`du-${d.id}`}
            className="absolute pointer-events-none dust-puff z-10"
            style={{
              left: d.x,
              top: d.y,
              width: 8,
              height: 4,
              background: "rgba(200,170,130,0.7)",
              borderRadius: "50%",
              boxShadow: "0 0 4px rgba(255,230,180,0.4)",
              ["--dx" as string]: `${d.dx}px`,
              ["--dy" as string]: `${d.dy}px`,
            }}
          />
        ))}

        {/* crit flash rings */}
        {crits.map((cr) => (
          <div
            key={`cr-${cr.id}`}
            className="absolute pointer-events-none crit-flash z-20"
            style={{
              left: cr.x * TILE + TILE / 2 - TILE / 2,
              top: cr.y * TILE + TILE / 2 - TILE / 2,
              width: TILE,
              height: TILE,
              border: "4px solid #ffd24a",
              boxShadow: "0 0 24px 8px rgba(255,210,74,0.8), inset 0 0 20px rgba(255,150,40,0.6)",
              borderRadius: "50%",
            }}
          />
        ))}

        {/* fly coins to HUD */}
        {flyCoins.map((fc) => (
          <div
            key={`fc-${fc.id}`}
            className="absolute pointer-events-none coin-fly z-30"
            style={{
              left: fc.sx - 8,
              top: fc.sy - 8,
              ["--cx" as string]: `${fc.cx}px`,
              ["--cy" as string]: `${fc.cy}px`,
            }}
          >
            <CoinIcon size={16} />
          </div>
        ))}

        {/* combo popup */}
        {comboShown && comboShown.level >= 2 && (
          <div
            key={`cb-${comboShown.id}`}
            className="absolute pointer-events-none combo-pop font-pixel z-30"
            style={{
              left: comboShown.x * TILE + TILE / 2 - 60,
              top: comboShown.y * TILE - 28,
              width: 120,
              textAlign: "center",
              fontSize: 14,
              color: comboShown.level >= 5 ? "#ff6b6b" : "#ffd24a",
              textShadow: "2px 2px 0 #1a0f1f, 0 0 10px rgba(255,210,74,0.8)",
            }}
          >
            x{comboShown.level} COMBO!
          </div>
        )}

        {/* particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none dirt-particle z-20"
            style={{
              left: p.x * TILE + TILE / 2 - 3,
              top: p.y * TILE + TILE / 2 - 3,
              width: p.kind === "sparkle" ? 5 : 6,
              height: p.kind === "sparkle" ? 5 : 6,
              background: p.color,
              borderRadius: p.kind === "water" ? "50%" : 0,
              boxShadow: p.kind === "sparkle" ? `0 0 8px ${p.color}` : "0 1px 0 rgba(0,0,0,0.4)",
              ["--dx" as string]: `${p.dx}px`,
              ["--dy" as string]: `${p.dy}px`,
            }}
          />
        ))}

        {/* character */}
        <div
          className="absolute z-10"
          style={{
            transform: `translate3d(${pos.x * TILE}px, ${pos.y * TILE - 10}px, 0)`,
            width: TILE,
            height: TILE,
            willChange: "transform",
          }}
        >
          <PixelFarmer
            direction={dir}
            walking={walking}
            walkFrame={walkFrame}
            acting={acting}
            tool={tool}
            cosmetics={cosmetics}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="relative z-10 w-full max-w-5xl flex flex-wrap items-center justify-center gap-3 px-6 py-4 pixel-panel">
        <div className="flex items-center gap-3">
          {(
            [
              { id: "hoe", label: "HOE", Icon: HoeIcon, key: "1" },
              { id: "watering_can", label: "CAN", Icon: WaterCanIcon, key: "2" },
              { id: "seed", label: "SEED", Icon: SeedIcon, key: "3" },
            ] as {
              id: Tool;
              label: string;
              Icon: React.ComponentType<{ size?: number }>;
              key: string;
            }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                SFX.click();
              }}
              className="pixel-btn flex items-center gap-2"
              data-active={tool === t.id}
            >
              <t.Icon size={20} />
              <span>{t.label}</span>
              <span className="opacity-60 ml-1">[{t.key}]</span>
            </button>
          ))}
        </div>

        <div className="mx-2 self-stretch" style={{ width: 4, background: "#1a0f1f" }} />

        <div className="flex items-center gap-2">
          {(Object.values(CROPS) as Crop[]).map((c) => {
            const active = seedChoice === c.id && tool === "seed";
            const Icon = CROP_ICONS[c.id];
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSeedChoice(c.id);
                  setTool("seed");
                  SFX.click();
                }}
                className="pixel-btn flex items-center gap-2"
                data-active={active}
                style={{ fontSize: 9 }}
              >
                <Icon size={18} />
                <span>{c.name}</span>
                <span className="flex items-center gap-1 opacity-80">
                  <CoinIcon size={10} />
                  {c.seedCost}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls panel */}
      <div className="relative z-10 w-full max-w-5xl pixel-panel px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-pixel text-[9px] tracking-[2px] text-[var(--gold)]">CONTROLS</span>
          <span className="font-pixel text-[8px] tracking-[1.5px] text-[var(--muted-foreground)] opacity-70">
            คู่มือการเล่น
          </span>
          <span className="flex-1 h-[3px] bg-[#1a0f1f]" />
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)] opacity-60">
            V1.0
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[auto_3px_1fr] gap-6 md:gap-7 items-start">
          <div className="flex flex-col gap-5 min-w-[220px]">
            <div className="flex items-start gap-4">
              <div className="grid grid-cols-3 grid-rows-2 gap-1 shrink-0">
                <span />
                <kbd className="pixel-key">W</kbd>
                <span />
                <kbd className="pixel-key">A</kbd>
                <kbd className="pixel-key">S</kbd>
                <kbd className="pixel-key">D</kbd>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <span className="font-pixel text-[10px] tracking-wider">MOVE</span>
                <span className="font-pixel text-[8px] text-[var(--muted-foreground)] leading-relaxed">
                  เดินสำรวจ · ลูกศรก็ได้
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <kbd className="pixel-key pixel-key-wide">SPACE</kbd>
              <div className="flex flex-col gap-1">
                <span className="font-pixel text-[10px] tracking-wider">USE TOOL</span>
                <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
                  ทำกับช่องที่หันหน้าใส่
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-pixel text-[8px] text-[var(--muted-foreground)] mr-1">
                เลือกเครื่องมือ
              </span>
              <kbd className="pixel-key pixel-key-sm">1</kbd>
              <kbd className="pixel-key pixel-key-sm">2</kbd>
              <kbd className="pixel-key pixel-key-sm">3</kbd>
            </div>
          </div>

          <span className="hidden md:block w-[3px] self-stretch bg-[#1a0f1f]" />

          <div className="flex flex-col gap-3 min-w-0">
            <span className="font-pixel text-[9px] tracking-[2px] text-[var(--gold)]">
              WORKFLOW
            </span>
            <div className="flow-strip">
              <FlowStep n="01" label="TILL" sub="ขุด">
                <HoeIcon size={20} />
              </FlowStep>
              <FlowArrow />
              <FlowStep n="02" label="SEED" sub="หว่าน">
                <SeedIcon size={20} />
              </FlowStep>
              <FlowArrow />
              <FlowStep n="03" label="WATER" sub="รดน้ำ">
                <WaterCanIcon size={20} />
              </FlowStep>
              <FlowArrow />
              <FlowStep n="04" label="WAIT" sub="พักผ่อน">
                <MoonIcon size={18} />
              </FlowStep>
              <FlowArrow />
              <FlowStep n="05" label="HARVEST" sub="เก็บ" gold>
                <CoinIcon size={18} />
              </FlowStep>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  n,
  label,
  sub,
  gold,
  children,
}: {
  n: string;
  label: string;
  sub: string;
  gold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flow-step" data-gold={gold ? "true" : undefined}>
      <span className="flow-step-num font-pixel">{n}</span>
      <div className="flow-step-icon">{children}</div>
      <span className="flow-step-label font-pixel">{label}</span>
      <span className="flow-step-sub">{sub}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <svg
      className="flow-arrow"
      width="18"
      height="14"
      viewBox="0 0 18 14"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x="0" y="6" width="11" height="2" fill="currentColor" />
      <rect x="11" y="4" width="2" height="6" fill="currentColor" />
      <rect x="13" y="5" width="2" height="4" fill="currentColor" />
      <rect x="15" y="6" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function ChickenSprite() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="32"
      height="32"
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated", filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.35))" }}
    >
      <rect x="5" y="5" width="7" height="6" fill="#f4e4c1" />
      <rect x="4" y="6" width="1" height="4" fill="#f4e4c1" />
      <rect x="12" y="7" width="2" height="2" fill="#f4e4c1" />
      <rect x="8" y="3" width="2" height="2" fill="#d94e6a" />
      <rect x="10" y="4" width="1" height="1" fill="#d94e6a" />
      <rect x="12" y="6" width="1" height="1" fill="#1a0f1f" />
      <rect x="14" y="8" width="2" height="1" fill="#e8a23a" />
      <rect x="6" y="11" width="1" height="2" fill="#e8a23a" />
      <rect x="10" y="11" width="1" height="2" fill="#e8a23a" />
      <rect x="5" y="13" width="2" height="1" fill="#8b6420" />
      <rect x="9" y="13" width="2" height="1" fill="#8b6420" />
    </svg>
  );
}

function DogSprite() {
  return (
    <svg
      viewBox="0 0 18 14"
      width="42"
      height="32"
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated", filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.35))" }}
    >
      <rect x="4" y="5" width="9" height="5" fill="#8b5a2b" />
      <rect x="12" y="4" width="4" height="4" fill="#a36d36" />
      <rect x="13" y="3" width="2" height="2" fill="#6b3a1c" />
      <rect x="15" y="5" width="2" height="1" fill="#1a0f1f" />
      <rect x="16" y="6" width="1" height="1" fill="#1a0f1f" />
      <rect x="2" y="4" width="2" height="1" fill="#8b5a2b" />
      <rect x="1" y="3" width="1" height="1" fill="#8b5a2b" />
      <rect x="5" y="10" width="2" height="3" fill="#5a2f17" />
      <rect x="10" y="10" width="2" height="3" fill="#5a2f17" />
      <rect x="4" y="13" width="3" height="1" fill="#1a0f1f" />
      <rect x="9" y="13" width="3" height="1" fill="#1a0f1f" />
    </svg>
  );
}

function TileDecor({
  kind,
}: {
  kind: "flower-r" | "flower-y" | "flower-p" | "mushroom" | "stone" | "tuft";
}) {
  if (kind === "stone") {
    return (
      <svg
        className="absolute pointer-events-none"
        style={{ left: 8, bottom: 6 }}
        width="14"
        height="9"
        viewBox="0 0 14 9"
        shapeRendering="crispEdges"
      >
        <rect x="2" y="3" width="10" height="5" fill="#7d6a5a" />
        <rect x="1" y="4" width="1" height="3" fill="#7d6a5a" />
        <rect x="12" y="4" width="1" height="3" fill="#7d6a5a" />
        <rect x="3" y="2" width="8" height="1" fill="#a59384" />
        <rect x="3" y="3" width="3" height="1" fill="#a59384" />
        <rect x="2" y="7" width="10" height="1" fill="#3d3024" />
      </svg>
    );
  }
  if (kind === "tuft") {
    return (
      <svg
        className="absolute pointer-events-none crop-sway"
        style={{ left: 10, bottom: 4, transformOrigin: "50% 100%" }}
        width="12"
        height="10"
        viewBox="0 0 12 10"
        shapeRendering="crispEdges"
      >
        <rect x="2" y="6" width="1" height="4" fill="#8bc967" />
        <rect x="5" y="3" width="1" height="7" fill="#8bc967" />
        <rect x="8" y="5" width="1" height="5" fill="#8bc967" />
        <rect x="3" y="6" width="1" height="3" fill="#4e8c3a" />
        <rect x="6" y="4" width="1" height="6" fill="#4e8c3a" />
        <rect x="9" y="6" width="1" height="4" fill="#4e8c3a" />
      </svg>
    );
  }
  if (kind === "mushroom") {
    return (
      <svg
        className="absolute pointer-events-none"
        style={{ left: 14, bottom: 6 }}
        width="10"
        height="10"
        viewBox="0 0 10 10"
        shapeRendering="crispEdges"
      >
        <rect x="1" y="2" width="8" height="3" fill="#d94e6a" />
        <rect x="0" y="3" width="1" height="2" fill="#d94e6a" />
        <rect x="9" y="3" width="1" height="2" fill="#d94e6a" />
        <rect x="3" y="3" width="1" height="1" fill="#fff" />
        <rect x="6" y="2" width="1" height="1" fill="#fff" />
        <rect x="3" y="5" width="4" height="3" fill="#f4e4c1" />
        <rect x="3" y="8" width="4" height="1" fill="#8b6420" />
      </svg>
    );
  }
  // flowers
  const petal = kind === "flower-r" ? "#ff6b6b" : kind === "flower-y" ? "#ffd24a" : "#c08bd9";
  const heart = kind === "flower-y" ? "#e8a23a" : "#fff5b8";
  return (
    <svg
      className="absolute pointer-events-none crop-sway"
      style={{ left: 16, bottom: 4, transformOrigin: "50% 100%" }}
      width="10"
      height="12"
      viewBox="0 0 10 12"
      shapeRendering="crispEdges"
    >
      <rect x="4" y="6" width="1" height="6" fill="#4e8c3a" />
      <rect x="2" y="8" width="2" height="1" fill="#4e8c3a" />
      <rect x="3" y="2" width="3" height="1" fill={petal} />
      <rect x="2" y="3" width="5" height="2" fill={petal} />
      <rect x="3" y="5" width="3" height="1" fill={petal} />
      <rect x="4" y="3" width="1" height="2" fill={heart} />
    </svg>
  );
}
