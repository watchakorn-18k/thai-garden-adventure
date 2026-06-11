import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import PixelFarmer from "./PixelFarmer";
import PixelCrop from "./PixelCrop";
import PlayerAvatarPreview from "./PlayerAvatarPreview";
import GameMenuDialog, { type GameMenuTab } from "./GameMenuDialog";
import TitleUnlockDialog from "./TitleUnlockDialog";
import QuickMatchButton from "./QuickMatchButton";
import { fetchScoreboard, type ScoreboardEntry } from "@/lib/match-client";
import {
  HoeIcon,
  WaterCanIcon,
  CoinIcon,
  MoonIcon,
  ChiliIcon,
  RiceIcon,
  MorningGloryIcon,
  EggplantIcon,
  MangoIcon,
  LemongrassIcon,
  PapayaIcon,
  BasilIcon,
  SpeakerOffIcon,
  SpeakerOnIcon,
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
import { applyAction, tickGrowth, updateComboAndGetBonus, type ComboState } from "@/lib/game-logic";
import { toolDurationMs } from "@/lib/tool-animation";
import { chooseFarmBotPlan, isFarmBotPlanValid, type FarmBotPlan } from "@/lib/farm-bot";
import { SFX, setMuted, isMuted, startBgm, stopBgm } from "@/lib/sfx";
import {
  COSMETIC_PRESETS,
  readCosmetics,
  writeCosmetics,
  type ToolSkinId,
} from "@/lib/player-cosmetics";
import {
  awardGardenTokens,
  buyCosmeticPreset,
  isCosmeticPresetUnlocked,
  readGardenTokenState,
} from "@/lib/garden-tokens";
import { loadPlayerName, savePlayerName } from "@/lib/player-name";
import { applyStoredProgressAward, readProgress } from "@/lib/progress-storage";
import {
  calculateLevel,
  createSinglePlayerHarvestAward,
  levelTitle,
  type PlayerProgress,
} from "@/lib/progression";

function isAutoBotPauseKey(key: string): boolean {
  return [
    "keyw",
    "keya",
    "keys",
    "keyd",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "space",
    "enter",
    "keyq",
    "keye",
  ].includes(key);
}

function hasManualMovement(keys: Set<string>): boolean {
  return ["keyw", "keya", "keys", "keyd", "arrowup", "arrowdown", "arrowleft", "arrowright"].some(
    (k) => keys.has(k),
  );
}

function smoothTrailPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const current = points[i];
    const midX = (prev.x + current.x) / 2;
    const midY = (prev.y + current.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x} ${last.y}`;
  return d;
}

function trailSegmentPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} Q ${a.x} ${a.y} ${mx} ${my} T ${b.x} ${b.y}`;
}

const TILE = 56;
const COMBO_WINDOW = 2200; // ms to keep combo alive
const AUTO_RESUME_MS = 60_000;
const AUTO_BOT_TICK_MS = 180;
const AUTO_BOT_ACTION_MS = 450;

const TOOL_SKIN_PARTICLE_COLORS: Record<ToolSkinId, string[]> = {
  basic: ["#6b3a1c", "#8b5a2b", "#3d2412"],
  golden: ["#ffd24a", "#fff5b8", "#e8a23a"],
  aqua: ["#7fd8ff", "#4cc2ee", "#2a8ec0"],
  starlight: ["#c08bd9", "#ffd24a", "#f4e4c1"],
};

const TOOL_SKIN_EFFECT_COLOR: Record<ToolSkinId, string | null> = {
  basic: null,
  golden: "#ffd24a",
  aqua: "#7fd8ff",
  starlight: "#c08bd9",
};

const CROP_ICONS: Record<CropId, React.ComponentType<{ size?: number }>> = {
  chili: ChiliIcon,
  rice: RiceIcon,
  morning_glory: MorningGloryIcon,
  eggplant: EggplantIcon,
  mango: MangoIcon,
  lemongrass: LemongrassIcon,
  papaya: PapayaIcon,
  basil: BasilIcon,
};

export default function FarmGame() {
  const [pos, setPos] = useState({ x: 2, y: 1 }); // tile-unit float
  const [dir, setDir] = useState<Direction>("down");
  const [walking, setWalking] = useState(false);
  const posRef = useRef({ x: 2, y: 1 });
  const dirRef = useRef<Direction>("down");
  const walkingRef = useRef(false);
  const [tiles, setTiles] = useState<Tile[][]>(() => makeEmptyField());
  const [tool, setTool] = useState<Tool>("hoe");
  const [seedChoice, setSeedChoice] = useState<CropId>("chili");
  const [coins, setCoins] = useState(50);
  const [marketPrices, setMarketPrices] = useState<Record<CropId, number>>(() => ({
    chili: CROPS.chili.sellPrice,
    rice: CROPS.rice.sellPrice,
    morning_glory: CROPS.morning_glory.sellPrice,
    eggplant: CROPS.eggplant.sellPrice,
    mango: CROPS.mango.sellPrice,
    lemongrass: CROPS.lemongrass.sellPrice,
    papaya: CROPS.papaya.sellPrice,
    basil: CROPS.basil.sellPrice,
  }));
  const [comboState, setComboState] = useState<ComboState>({
    combo: 0,
    lastHarvestAt: 0,
    crops: [],
  });
  const [cosmetics, setCosmetics] = useState(() => readCosmetics());
  const [gardenTokenState, setGardenTokenState] = useState(() => readGardenTokenState());
  const [playerName, setPlayerName] = useState("");
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [gameMenuInitialTab, setGameMenuInitialTab] = useState<GameMenuTab>("outfit");
  const [popups, setPopups] = useState<
    { id: number; x: number; y: number; text: string; tone: "good" | "bad" | "info" }[]
  >([]);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);
  const actingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [walkFrame, setWalkFrame] = useState(0);
  const [particles, setParticles] = useState<
    {
      id: number;
      x: number;
      y: number;
      kind: "dirt" | "water" | "sparkle" | "tool" | "shoe";
      dx: number;
      dy: number;
      color: string;
    }[]
  >([]);
  const [shakeTile, setShakeTile] = useState<{ x: number; y: number; id: number } | null>(null);
  const [tileEffects, setTileEffects] = useState<
    { id: number; x: number; y: number; color: string; cropGlow: boolean; kind: "hoe" | "water" }[]
  >([]);
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
  const [dust, setDust] = useState<
    {
      id: number;
      x: number;
      y: number;
      dx: number;
      dy: number;
    }[]
  >([]);
  const [shoeTrailPath, setShoeTrailPath] = useState<{
    kind: "fire" | "lightning";
    points: { x: number; y: number; t: number; foot: 0 | 1 }[];
  } | null>(null);
  const [screenShake, setScreenShake] = useState(0);
  const [hudPulse, setHudPulse] = useState(false);
  const [muted, setMutedState] = useState(false);
  const comboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDustAt = useRef(0);
  const lastShoeTrailAt = useRef(0);
  const shoeTrailFoot = useRef<0 | 1>(0);
  const keys = useRef<Set<string>>(new Set());
  const popupId = useRef(0);
  const fieldRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<Tile[][]>(tiles);
  const coinsRef = useRef(coins);
  const toolRef = useRef<Tool>(tool);
  const cosmeticsRef = useRef(cosmetics);
  const seedChoiceRef = useRef<CropId>(seedChoice);
  const marketPricesRef = useRef(marketPrices);
  const comboStateRef = useRef(comboState);
  const gameMenuOpenRef = useRef(gameMenuOpen);
  const botPlanRef = useRef<FarmBotPlan | null>(null);
  const botTargetRef = useRef<{ x: number; y: number } | null>(null);
  const botIntentRef = useRef<{ dx: number; dy: number } | null>(null);
  const botSeedRotationRef = useRef(0);
  const lastBotActionAtRef = useRef(0);
  const lastUserInputAtRef = useRef(0);
  const botPausedRef = useRef(false);
  const [autoBotActive, setAutoBotActive] = useState(true);
  const [homeScoreboard, setHomeScoreboard] = useState<{
    oneVsOne: ScoreboardEntry[];
    twoVsTwo: ScoreboardEntry[];
  }>({
    oneVsOne: [],
    twoVsTwo: [],
  });
  const [homeScoreboardLoaded, setHomeScoreboardLoaded] = useState(false);
  const [homeScoreboardOpen, setHomeScoreboardOpen] = useState(false);
  const [progress, setProgress] = useState<PlayerProgress | null>(null);
  const [progressTampered, setProgressTampered] = useState(false);
  const [titleUnlock, setTitleUnlock] = useState<{ level: number; title: string } | null>(null);
  const progressAwardSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    readProgress().then((result) => {
      if (cancelled) return;
      setProgress(result.progress);
      setProgressTampered(result.tampered);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);
  useEffect(() => {
    coinsRef.current = coins;
  }, [coins]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    cosmeticsRef.current = cosmetics;
  }, [cosmetics]);
  useEffect(() => {
    seedChoiceRef.current = seedChoice;
  }, [seedChoice]);
  useEffect(() => {
    marketPricesRef.current = marketPrices;
  }, [marketPrices]);
  useEffect(() => {
    comboStateRef.current = comboState;
  }, [comboState]);
  useEffect(() => {
    gameMenuOpenRef.current = gameMenuOpen;
  }, [gameMenuOpen]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      setShoeTrailPath((current) => {
        if (!current) return null;
        const points = current.points.filter((point) => now - point.t < 1350);
        return points.length >= 2 ? { ...current, points } : null;
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);
  // Load browser-only profile data after hydration to avoid SSR mismatch.
  useEffect(() => {
    const syncCosmetics = () => setCosmetics(readCosmetics());
    const syncGardenTokens = () => setGardenTokenState(readGardenTokenState());
    setPlayerName(loadPlayerName());
    syncCosmetics();
    syncGardenTokens();
    window.addEventListener("tg:cosmetics", syncCosmetics);
    window.addEventListener("tg:gardenTokens", syncGardenTokens);
    window.addEventListener("storage", syncCosmetics);
    window.addEventListener("storage", syncGardenTokens);
    return () => {
      window.removeEventListener("tg:cosmetics", syncCosmetics);
      window.removeEventListener("tg:gardenTokens", syncGardenTokens);
      window.removeEventListener("storage", syncCosmetics);
      window.removeEventListener("storage", syncGardenTokens);
    };
  }, []);

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

  const addPopup = useCallback(
    (x: number, y: number, text: string, tone: "good" | "bad" | "info" = "info") => {
      const id = ++popupId.current;
      setPopups((p) => [...p, { id, x, y, text, tone }]);
      setTimeout(() => setPopups((p) => p.filter((q) => q.id !== id)), 950);
    },
    [],
  );

  const addShoeTrailPoint = useCallback((x: number, y: number, dir: Direction, now: number) => {
    const trail = cosmeticsRef.current.shoeTrail;
    if (trail === "none") return;
    const footX = dir === "right" ? 17 : dir === "left" ? -17 : 0;
    const footY = dir === "down" ? 24 : dir === "up" ? 4 : 22;
    const trailPoint = { x: x * TILE + TILE / 2 + footX, y: y * TILE + footY, t: now };
    setShoeTrailPath((current) => {
      const recent =
        current?.kind === trail ? current.points.filter((point) => now - point.t < 1350) : [];
      const lastPoint = recent[recent.length - 1];
      if (lastPoint && Math.hypot(lastPoint.x - trailPoint.x, lastPoint.y - trailPoint.y) < 8) {
        return current;
      }
      return { kind: trail, points: [...recent, trailPoint].slice(-34) };
    });
  }, []);

  const burstParticles = useCallback(
    (x: number, y: number, kind: "dirt" | "water" | "sparkle" | "tool" | "shoe") => {
      const palette =
        kind === "dirt"
          ? ["#6b3a1c", "#8b5a2b", "#3d2412"]
          : kind === "water"
            ? ["#4cc2ee", "#7fd8ff", "#2a8ec0"]
            : kind === "tool"
              ? ["#ffd24a", "#7fd8ff", "#c08bd9"]
              : kind === "shoe"
                ? cosmeticsRef.current.shoeTrail === "fire"
                  ? ["#f47820", "#ffd24a", "#d94e6a", "#ff8f3a"]
                  : ["#ffd24a", "#7fd8ff", "#f4e4c1", "#4cc2ee"]
                : ["#ffe07a", "#fff5b8", "#e8a23a"];
      const count = kind === "shoe" ? 22 : kind === "sparkle" || kind === "tool" ? 10 : 8;
      const fresh = Array.from({ length: count }).map((_, i) => {
        const angle =
          kind === "shoe"
            ? Math.PI * 2 * Math.random()
            : (Math.PI * (i + 1)) / (count + 1) + Math.PI;
        const speed = kind === "shoe" ? 22 + Math.random() * 54 : 22 + Math.random() * 20;
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
      setTimeout(
        () => setParticles((p) => p.filter((q) => !fresh.find((f) => f.id === q.id))),
        650,
      );
    },
    [],
  );

  const burstToolSkinEffect = useCallback((x: number, y: number, skin: ToolSkinId) => {
    if (skin === "basic") return;
    const colors = TOOL_SKIN_PARTICLE_COLORS[skin];
    const count = skin === "starlight" ? 24 : 18;
    const fresh = Array.from({ length: count }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 18 + Math.random() * 26;
      return {
        id: popupId.current + i + 1,
        x,
        y,
        kind: "tool" as const,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 6,
        color: colors[i % colors.length],
      };
    });
    popupId.current += count;
    setParticles((current) => [...current, ...fresh]);
    setTimeout(() => {
      setParticles((current) =>
        current.filter((particle) => !fresh.some((item) => item.id === particle.id)),
      );
    }, 650);
  }, []);

  const addTileEffect = useCallback(
    (x: number, y: number, skin: ToolSkinId, cropGlow: boolean, kind: "hoe" | "water") => {
      const color = TOOL_SKIN_EFFECT_COLOR[skin];
      if (!color) return;
      const id = ++popupId.current;
      setTileEffects((current) => [...current, { id, x, y, color, cropGlow, kind }]);
      setTimeout(() => {
        setTileEffects((current) => current.filter((effect) => effect.id !== id));
      }, 1100);
    },
    [],
  );

  const shake = useCallback((x: number, y: number) => {
    const id = ++popupId.current;
    setShakeTile({ x, y, id });
    setTimeout(() => setShakeTile((s) => (s?.id === id ? null : s)), 280);
  }, []);

  const triggerScreenShake = useCallback((intensity = 1) => {
    setScreenShake((s) => Math.max(s, intensity));
    setTimeout(() => setScreenShake(0), 320);
  }, []);

  const spawnFlyCoins = useCallback((x: number, y: number, n: number) => {
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
  }, []);

  const spawnCrit = useCallback((x: number, y: number) => {
    const id = ++popupId.current;
    setCrits((c) => [...c, { id, x, y }]);
    setTimeout(() => setCrits((c) => c.filter((q) => q.id !== id)), 500);
  }, []);

  const doAction = useCallback(
    (override?: {
      pos?: { x: number; y: number };
      dir?: Direction;
      tool?: Tool;
      seedChoice?: CropId;
      now?: number;
    }) => {
      if (actingRef.current) return;
      const actionPos = override?.pos ?? posRef.current;
      const actionDir = override?.dir ?? dirRef.current;
      const actionTool = override?.tool ?? toolRef.current;
      const actionSeed = override?.seedChoice ?? seedChoiceRef.current;
      const actionNow = override?.now ?? Date.now();
      const tx =
        Math.round(actionPos.x) + (actionDir === "right" ? 1 : actionDir === "left" ? -1 : 0);
      const ty = Math.round(actionPos.y) + (actionDir === "down" ? 1 : actionDir === "up" ? -1 : 0);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
      const actionSkin =
        actionTool === "hoe"
          ? cosmeticsRef.current.hoeSkin
          : actionTool === "watering_can"
            ? cosmeticsRef.current.wateringCanSkin
            : "basic";
      addTileEffect(
        tx,
        ty,
        actionSkin,
        Boolean(tilesRef.current[ty]?.[tx]?.crop),
        actionTool === "watering_can" ? "water" : "hoe",
      );

      setActing(true);
      actingRef.current = true;
      if (actingTimerRef.current) clearTimeout(actingTimerRef.current);
      actingTimerRef.current = setTimeout(() => {
        setActing(false);
        actingRef.current = false;
      }, toolDurationMs(actionTool));

      setTiles((grid) => {
        const result = applyAction({
          tiles: grid,
          coins: coinsRef.current,
          pos: { x: Math.round(actionPos.x), y: Math.round(actionPos.y) },
          dir: actionDir,
          tool: actionTool,
          seedChoice: actionSeed,
          marketPrices: marketPricesRef.current,
          now: actionNow,
        });
        let nextCoins = result.coins;

        for (const ev of result.events) {
          if (ev.kind === "harvest") {
            if (ev.reward === 0) {
              addPopup(ev.x, ev.y, "เหี่ยว", "bad");
              burstParticles(ev.x, ev.y, "dirt");
              SFX.till();
              setCombo(0);
              const resetCombo = { combo: 0, lastHarvestAt: actionNow, crops: [] };
              comboStateRef.current = resetCombo;
              setComboState(resetCombo);
            } else {
              const isCrit = Math.random() < 0.18;
              const { bonus, nextState } = updateComboAndGetBonus(
                comboStateRef.current,
                ev.cropId,
                ev.reward,
                actionNow,
              );
              comboStateRef.current = nextState;
              setComboState(nextState);
              setCombo(nextState.combo);

              const critBonus = isCrit ? ev.reward : 0;
              const total = ev.reward + bonus + critBonus;
              nextCoins += total - ev.reward;

              const variety = nextState.crops.length;
              let popupText = `+${total}`;
              if (variety > 1) popupText += ` ผสม x${variety}`;
              if (isCrit) popupText = `คริติคัล ${popupText}`;
              addPopup(ev.x, ev.y, popupText, "good");

              burstParticles(ev.x, ev.y, "sparkle");
              spawnFlyCoins(ev.x, ev.y, Math.min(8, Math.max(3, Math.floor(total / 10))));

              if (nextState.combo >= 2) {
                const id = ++popupId.current;
                setComboShown({ id, level: nextState.combo, x: ev.x, y: ev.y });
                setTimeout(() => setComboShown((cs) => (cs && cs.id === id ? null : cs)), 1100);
                SFX.combo(nextState.combo);
              }
              if (comboTimer.current) clearTimeout(comboTimer.current);
              comboTimer.current = setTimeout(() => {
                setCombo(0);
                const resetCombo = { combo: 0, lastHarvestAt: Date.now(), crops: [] };
                comboStateRef.current = resetCombo;
                setComboState(resetCombo);
              }, COMBO_WINDOW);

              const idleAward =
                autoBotActive &&
                !botPausedRef.current &&
                actionNow - lastUserInputAtRef.current > 3000;
              const award = createSinglePlayerHarvestAward({
                cropId: ev.cropId,
                reward: ev.reward,
                total,
                at: actionNow,
                idle: idleAward,
                sequence: ++progressAwardSeqRef.current,
              });
              void applyStoredProgressAward(award).then((result) => {
                setProgress(result.progress);
                if (result.applied) {
                  const tokenBonus = result.leveledUp ? result.progress.level * 10 : 0;
                  const nextTokens = awardGardenTokens(1 + tokenBonus);
                  setGardenTokenState(nextTokens);
                  addPopup(ev.x, ev.y, `+${award.exp} XP`, "info");
                  addPopup(ev.x, ev.y, tokenBonus ? `+${1 + tokenBonus} GT` : "+1 GT", "info");
                  const before = levelTitle(result.previousLevel);
                  const after = levelTitle(result.progress.level);
                  if (result.leveledUp && before !== after) {
                    setTitleUnlock({ level: result.progress.level, title: after });
                  }
                }
              });

              const basePrice = CROPS[ev.cropId].sellPrice;
              setMarketPrices((prev) => {
                const next = { ...prev };
                next[ev.cropId] = Math.max(basePrice * 0.5, prev[ev.cropId] - basePrice * 0.1);
                for (const cId of Object.keys(prev) as CropId[]) {
                  if (cId !== ev.cropId) {
                    const otherBase = CROPS[cId].sellPrice;
                    next[cId] = Math.min(otherBase * 1.2, prev[cId] + otherBase * 0.03);
                  }
                }
                marketPricesRef.current = next;
                return next;
              });

              if (isCrit) {
                spawnCrit(ev.x, ev.y);
                triggerScreenShake(1);
                SFX.crit();
              } else {
                SFX.harvest();
              }
            }
          } else if (ev.kind === "till") {
            addPopup(ev.x, ev.y, "ขุด", "info");
            burstParticles(ev.x, ev.y, "dirt");
            burstToolSkinEffect(ev.x, ev.y, cosmeticsRef.current.hoeSkin);
            addTileEffect(
              ev.x,
              ev.y,
              cosmeticsRef.current.hoeSkin,
              Boolean(grid[ev.y]?.[ev.x]?.crop),
              "hoe",
            );
            if (cosmeticsRef.current.hoeSkin !== "basic") triggerScreenShake(0.08);
            shake(ev.x, ev.y);
            SFX.hoe();
          } else if (ev.kind === "water") {
            addPopup(ev.x, ev.y, "รดน้ำ", "info");
            burstParticles(ev.x, ev.y, "water");
            burstToolSkinEffect(ev.x, ev.y, cosmeticsRef.current.wateringCanSkin);
            if (cosmeticsRef.current.wateringCanSkin !== "basic") triggerScreenShake(0.05);
            SFX.water();
          } else if (ev.kind === "plant") {
            addPopup(ev.x, ev.y, CROPS[ev.cropId].name, "info");
            SFX.plant();
          } else if (ev.kind === "insufficient_funds") {
            addPopup(ev.x, ev.y, "เงินไม่พอ", "bad");
            SFX.bad();
          }
        }

        if (nextCoins !== coinsRef.current) {
          coinsRef.current = nextCoins;
          setCoins(nextCoins);
        }
        tilesRef.current = result.tiles;
        return result.tiles;
      });
    },
    [
      addPopup,
      addTileEffect,
      autoBotActive,
      burstParticles,
      burstToolSkinEffect,
      shake,
      spawnFlyCoins,
      spawnCrit,
      triggerScreenShake,
    ],
  );

  const doActionRef = useRef(doAction);
  useEffect(() => {
    doActionRef.current = doAction;
  }, [doAction]);

  const pauseAutoBot = useCallback(() => {
    lastUserInputAtRef.current = Date.now();
    botPausedRef.current = true;
    botPlanRef.current = null;
    botTargetRef.current = null;
    botIntentRef.current = null;
    setAutoBotActive(false);
  }, []);

  // crop growth tick (every 500ms)
  useEffect(() => {
    const i = setInterval(() => {
      setTiles((grid) => {
        const next = tickGrowth(grid, Date.now()).tiles;
        tilesRef.current = next;
        return next;
      });
    }, 500);
    return () => clearInterval(i);
  }, []);

  // market price recovery tick (every 1000ms)
  useEffect(() => {
    const i = setInterval(() => {
      setMarketPrices((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const cId of Object.keys(prev) as CropId[]) {
          const base = CROPS[cId].sellPrice;
          const current = prev[cId];
          if (current < base) {
            next[cId] = Math.min(base, current + base * 0.005);
            changed = true;
          } else if (current > base) {
            next[cId] = Math.max(base, current - base * 0.005);
            changed = true;
          }
        }
        if (changed) marketPricesRef.current = next;
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      // Let text inputs (e.g. the name editor) own the keyboard while focused.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      if (gameMenuOpen) {
        if (e.key === "Escape") setGameMenuOpen(false);
        e.preventDefault();
        return;
      }

      const k = normalizedKeyboardKey(e);
      if (isAutoBotPauseKey(k) && !e.repeat) pauseAutoBot();
      keys.current.add(k);
      if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
      }
      if (e.key === "?") {
        setGameMenuInitialTab("controls");
        setGameMenuOpen(true);
        keys.current.clear();
        SFX.click();
        e.preventDefault();
        return;
      }
      if (k === "space" || k === "enter") {
        if (!e.repeat) doAction();
      }
      if (k === "keye") {
        toolRef.current = "hoe";
        setTool("hoe");
      }
      if (k === "keyq") {
        toolRef.current = "watering_can";
        setTool("watering_can");
      }
      if (k === "keym") {
        const v = !isMuted();
        setMuted(v);
        setMutedState(v);
      }
    };
    const onUp = (e: KeyboardEvent) => keys.current.delete(normalizedKeyboardKey(e));
    // Clear stuck keys on tab switch (keyup doesn't fire when switching away mid-press)
    const onVisChange = () => {
      if (document.hidden) keys.current.clear();
    };
    const onBlur = () => keys.current.clear();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("blur", onBlur);
    };
  }, [doAction, gameMenuOpen, pauseAutoBot]);

  useEffect(() => {
    const BOT_SPEED = 5.2; // tiles/sec — same as manual
    let lastBotMoveAt = Date.now();

    const i = setInterval(() => {
      const now = Date.now();
      if (gameMenuOpenRef.current) {
        botTargetRef.current = null;
        botIntentRef.current = null;
        return;
      }
      if (botPausedRef.current) {
        if (now - lastUserInputAtRef.current < AUTO_RESUME_MS) {
          botTargetRef.current = null;
          botIntentRef.current = null;
          return;
        }
        botPausedRef.current = false;
        setAutoBotActive(true);
      }
      if (hasManualMovement(keys.current)) {
        botTargetRef.current = null;
        botIntentRef.current = null;
        return;
      }

      let plan = botPlanRef.current;
      if (
        !plan ||
        !isFarmBotPlanValid({
          tiles: tilesRef.current,
          coins: coinsRef.current,
          seedRotation: botSeedRotationRef.current,
          plan,
        })
      ) {
        plan = chooseFarmBotPlan({
          tiles: tilesRef.current,
          pos: posRef.current,
          coins: coinsRef.current,
          seedRotation: botSeedRotationRef.current,
        });
        botPlanRef.current = plan;
      }
      if (!plan) {
        botTargetRef.current = null;
        botIntentRef.current = null;
        return;
      }

      botTargetRef.current = { x: plan.sx, y: plan.sy };

      // Move toward stand position using Date.now() delta (immune to RAF pause)
      const dtMs = Math.min(500, now - lastBotMoveAt);
      lastBotMoveAt = now;
      const dt = dtMs / 1000;

      const dx = plan.sx - posRef.current.x;
      const dy = plan.sy - posRef.current.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.08) {
        const step = BOT_SPEED * dt;
        if (dist <= step) {
          posRef.current = { x: plan.sx, y: plan.sy };
        } else {
          posRef.current = {
            x: posRef.current.x + (dx / dist) * step,
            y: posRef.current.y + (dy / dist) * step,
          };
        }
        setPos(posRef.current);
        // Update facing direction while walking
        let nd: Direction = dirRef.current;
        if (Math.abs(dx) > Math.abs(dy)) nd = dx > 0 ? "right" : "left";
        else nd = dy > 0 ? "down" : "up";
        if (nd !== dirRef.current) {
          dirRef.current = nd;
          setDir(nd);
        }
        if (now - lastDustAt.current > 90) {
          lastDustAt.current = now;
          addShoeTrailPoint(posRef.current.x, posRef.current.y, nd, now);
        }
        if (!walkingRef.current) {
          walkingRef.current = true;
          setWalking(true);
        }
        botIntentRef.current = { dx: dx / dist, dy: dy / dist };
        return;
      }

      // Arrived at stand position
      botTargetRef.current = null;
      botIntentRef.current = null;
      if (walkingRef.current) {
        walkingRef.current = false;
        setWalking(false);
      }
      posRef.current = { x: plan.sx, y: plan.sy };
      setPos(posRef.current);
      dirRef.current = plan.dir;
      setDir(plan.dir);
      toolRef.current = plan.tool;
      setTool(plan.tool);
      seedChoiceRef.current = plan.seedChoice;
      if (plan.tool === "seed") setSeedChoice(plan.seedChoice);
      if (now - lastBotActionAtRef.current < AUTO_BOT_ACTION_MS) {
        return;
      }
      lastBotActionAtRef.current = now;
      botPlanRef.current = null;
      if (plan.tool === "seed") botSeedRotationRef.current += 1;
      doActionRef.current({
        pos: posRef.current,
        dir: plan.dir,
        tool: plan.tool,
        seedChoice: plan.seedChoice,
        now,
      });
    }, AUTO_BOT_TICK_MS);
    return () => clearInterval(i);
  }, [addShoeTrailPoint]);

  // Browsers block autoplay until the first user gesture — start BGM then.
  useEffect(() => {
    const onFirstGesture = () => {
      if (!isMuted()) startBgm();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      // Leaving the single-player home (e.g. into the lobby) stops the home music.
      stopBgm();
      if (actingTimerRef.current) clearTimeout(actingTimerRef.current);
    };
  }, []);

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
      if (k.has("keyw") || k.has("arrowup")) dy -= 1;
      if (k.has("keys") || k.has("arrowdown")) dy += 1;
      if (k.has("keya") || k.has("arrowleft")) dx -= 1;
      if (k.has("keyd") || k.has("arrowright")) dx += 1;

      // Bot movement is handled in its own setInterval (immune to RAF pause).
      // RAF only drives manual keyboard movement.
      // Freeze the player in place while the dig/use animation plays.
      const moving = (dx !== 0 || dy !== 0) && !actingRef.current;
      if (actingRef.current && walkingRef.current) {
        walkingRef.current = false;
        setWalking(false);
      }
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

        if (cosmeticsRef.current.shoeTrail !== "none" && now - lastShoeTrailAt.current > 45) {
          lastShoeTrailAt.current = now;
          addShoeTrailPoint(posRef.current.x, posRef.current.y, nd, now);
        }

        frameAccum += dt;
        if (frameAccum > 0.14) {
          frameAccum = 0;
          setWalkFrame((f) => f + 1);
          SFX.step();
          // dust puff under feet
          const px = posRef.current.x;
          const py = posRef.current.y;
          const back = nd === "right" ? -1 : nd === "left" ? 1 : 0;
          const backY = nd === "down" ? -1 : nd === "up" ? 1 : 0;
          if (cosmeticsRef.current.shoeTrail === "none") {
            const id = ++popupId.current;
            const puff = {
              id,
              x: px * TILE + TILE / 2 + back * 10,
              y: py * TILE + TILE - 8 + backY * 10,
              dx: back * 18 + (Math.random() - 0.5) * 10,
              dy: -8 - Math.random() * 6,
            };
            setDust((d) => [...d, puff]);
            setTimeout(() => setDust((d) => d.filter((q) => q.id !== id)), 500);
          } else {
            addShoeTrailPoint(px, py, nd, now);
          }
        }
        if (!walkingRef.current) {
          walkingRef.current = true;
          setWalking(true);
        }
      } else {
        if (walkingRef.current) {
          setShoeTrailPath((current) =>
            current ? { ...current, points: current.points.slice(-10) } : null,
          );
          walkingRef.current = false;
          setWalking(false);
        }
        frameAccum = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [addShoeTrailPoint, burstParticles]);

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
  const progressNext = progress ? calculateLevel(progress.totalExp).next : 0;
  const facingMarkerColor =
    acting && tool === "hoe"
      ? (TOOL_SKIN_EFFECT_COLOR[cosmetics.hoeSkin] ?? "var(--gold)")
      : acting && tool === "watering_can"
        ? (TOOL_SKIN_EFFECT_COLOR[cosmetics.wateringCanSkin] ?? "var(--gold)")
        : "var(--gold)";

  const openScoreboard = useCallback(() => {
    setHomeScoreboardOpen(true);
    SFX.click();
    if (homeScoreboardLoaded) return;
    Promise.all([
      fetchScoreboard({ mode: "1v1", limit: 5 }),
      fetchScoreboard({ mode: "2v2", limit: 5 }),
    ])
      .then(([oneVsOne, twoVsTwo]) => setHomeScoreboard({ oneVsOne, twoVsTwo }))
      .catch(() => undefined)
      .finally(() => setHomeScoreboardLoaded(true));
  }, [homeScoreboardLoaded]);

  const equipPreset = useCallback((id: string) => {
    const preset = COSMETIC_PRESETS.find((item) => item.id === id);
    if (!preset) return false;
    setCosmetics((current) => {
      const next = id.includes("_hoe")
        ? { ...current, hoeSkin: preset.cosmetics.hoeSkin }
        : id.includes("_watering_can")
          ? { ...current, wateringCanSkin: preset.cosmetics.wateringCanSkin }
          : id.includes("_shoes")
            ? { ...current, shoe: preset.cosmetics.shoe, shoeTrail: preset.cosmetics.shoeTrail }
            : preset.cosmetics;
      writeCosmetics(next);
      return next;
    });
    return true;
  }, []);

  const handleBuyPreset = useCallback(
    (id: string) => {
      const result = buyCosmeticPreset(id);
      setGardenTokenState(result.state);
      if (!result.ok && result.reason !== "owned") {
        SFX.bad();
        return;
      }
      equipPreset(id);
      SFX.coin();
    },
    [equipPreset],
  );

  const handleEquipPreset = useCallback(
    (id: string) => {
      if (!isCosmeticPresetUnlocked(gardenTokenState, id)) {
        SFX.bad();
        return;
      }
      if (equipPreset(id)) SFX.click();
    },
    [equipPreset, gardenTokenState],
  );

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-start px-6 pb-10 gap-8 overflow-hidden">
      <div className="fixed right-3 top-3 z-100 flex items-center gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            const v = !isMuted();
            setMuted(v);
            setMutedState(v);
            if (!v) startBgm();
            SFX.click();
          }}
          className="pixel-btn flex h-9 w-9 items-center justify-center p-0"
          title="ปิด/เปิดเสียง (M)"
          aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
        >
          {muted ? <SpeakerOffIcon size={18} /> : <SpeakerOnIcon size={18} />}
        </button>
        <a
          href="https://github.com/watchakorn-18k/thai-garden-adventure"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-transform hover:scale-110"
          title="GitHub"
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              background: "var(--card)",
              boxShadow: [
                "inset 0 2px 0 0 rgba(255,255,255,0.08)",
                "inset 0 -2px 0 0 rgba(0,0,0,0.4)",
                "0 0 0 2px #1a0f1f",
                "0 0 0 4px var(--border)",
              ].join(","),
            }}
          >
            <svg
              viewBox="0 0 16 16"
              width="20"
              height="20"
              fill="currentColor"
              className="text-muted-foreground"
              style={{ imageRendering: "pixelated" }}
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
        </a>
      </div>

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
      <header className="relative z-50 w-full max-w-5xl flex items-center justify-between gap-4 px-6 py-4 pixel-panel">
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
          <div className="header-status-stack">
            <button
              type="button"
              onClick={() => {
                if (autoBotActive) {
                  pauseAutoBot();
                } else {
                  botPausedRef.current = false;
                  setAutoBotActive(true);
                }
                SFX.click();
              }}
              className="pixel-chip pixel-btn header-status-chip"
              data-gold={autoBotActive ? "true" : undefined}
              title={
                autoBotActive ? "บอททำงานอัตโนมัติ (คลิกเพื่อหยุด)" : "บอทหยุด (คลิกเพื่อเริ่ม)"
              }
            >
              <span
                className={autoBotActive ? "live-dot" : "header-status-dot"}
                style={
                  autoBotActive
                    ? undefined
                    : { width: 9, height: 9, background: "#7d6a5a", boxShadow: "0 0 0 2px #1a0f1f" }
                }
              />
              {autoBotActive ? "อัตโนมัติ" : "หยุด"}
            </button>
            <div
              className={`pixel-chip header-status-chip ${hudPulse ? "pulse-glow" : ""}`}
              data-gold="true"
            >
              <CoinIcon size={16} />
              <span>{coins}</span>
            </div>
          </div>
          <button
            type="button"
            className="pixel-btn header-level-btn"
            data-active={gameMenuOpen ? "true" : undefined}
            aria-haspopup="dialog"
            aria-expanded={gameMenuOpen}
            title="เปิดเมนูผู้เล่น"
            onClick={() => {
              setGameMenuInitialTab("outfit");
              setGameMenuOpen(true);
              keys.current.clear();
              SFX.click();
            }}
          >
            <PlayerAvatarPreview className="header-level-avatar" cosmetics={cosmetics} />
            <span className="header-level-copy">
              <span className="header-level-name">{playerName || "ตั้งชื่อ"}</span>
              <span className="header-level-main">
                {progress ? `LV ${progress.level}` : "เมนู"}
              </span>
              {progress && <span className="header-level-score">{levelTitle(progress.level)}</span>}
              <span className="header-level-sub">
                {progress ? `${progress.exp}/${progressNext} XP` : "เปิดเมนู"}
              </span>
              {progressTampered && <span className="header-level-reset">RESET</span>}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              const v = !isMuted();
              setMuted(v);
              setMutedState(v);
              if (!v) startBgm();
              SFX.click();
            }}
            className="pixel-btn header-sound-btn"
            title="ปิด/เปิดเสียง (M)"
            aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
          >
            {muted ? <SpeakerOffIcon size={22} /> : <SpeakerOnIcon size={22} />}
          </button>
        </div>
      </header>

      {/* Multiplayer call-to-action — sits above the single-player field */}
      <div className="cta-multiplayer relative z-30 w-full max-w-5xl">
        <div className="cta-multiplayer-card">
          <div className="cta-multiplayer-copy">
            <span className="cta-multiplayer-label font-pixel">อยากแข่งกับเพื่อน?</span>
            <span className="cta-multiplayer-subtitle">ท้าดวลทำสวนแบบเรียลไทม์</span>
          </div>
          <div className="cta-multiplayer-actions">
            <span className="cta-btn-bob">
              <QuickMatchButton label="จับคู่ด่วน" className="pixel-btn cta-quick-match" />
            </span>
            <span className="cta-btn-bob" data-delay="true">
              <details className="cta-mode-menu">
                <summary className="pixel-btn cta-1v1-link">โหมดแข่ง</summary>
                <div className="cta-mode-list">
                  <a href="/lobby?mode=1v1" className="pixel-btn cta-mode-link">
                    1V1
                  </a>
                  <a href="/lobby?mode=2v2" className="pixel-btn cta-mode-link">
                    2V2
                  </a>
                </div>
              </details>
            </span>
            <span className="cta-btn-bob" data-delay="true">
              <button type="button" onClick={openScoreboard} className="pixel-btn cta-1v1-link">
                SCORE
              </button>
            </span>
          </div>
        </div>
      </div>

      {/* Field */}
      <div
        ref={fieldRef}
        className={`relative isolate mt-3 field-frame scanlines ${
          screenShake ? (screenShake < 1 ? "screen-shake-soft" : "screen-shake") : ""
        }`}
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
            const tileEffect = tileEffects.find((effect) => effect.x === x && effect.y === y);
            return (
              <div
                key={`${x}-${y}`}
                className={`absolute tile-edge ${cls} ${isShaking ? "tile-shake" : ""}`}
                style={{ left: x * TILE, top: y * TILE, width: TILE, height: TILE }}
              >
                {decor && <TileDecor kind={decor} />}
                {tileEffect && tileEffect.kind === "hoe" && (
                  <div
                    className="absolute inset-[3px] z-30 pointer-events-none tool-furrow-fx"
                    style={{ ["--tool-effect-color" as string]: tileEffect.color }}
                  >
                    <span />
                    <span />
                    <span />
                    <span />
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                {isFacing && (
                  <div
                    className="absolute inset-0 facing-marker pointer-events-none"
                    style={{ ["--facing-color" as string]: facingMarkerColor }}
                  />
                )}
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
                    className={`absolute inset-1 ${
                      tileEffect?.cropGlow
                        ? "tool-crop-glow"
                        : c.crop.stage === 2
                          ? "ripe-glow"
                          : c.crop.stage === 3
                            ? ""
                            : "crop-sway"
                    }`}
                    style={
                      tileEffect?.cropGlow
                        ? ({
                            ["--tool-effect-color" as string]: tileEffect.color,
                          } as React.CSSProperties)
                        : c.crop.stage === 2
                          ? undefined
                          : c.crop.stage === 3
                            ? { animation: "none" }
                            : {
                                animation: `grow 0.4s ease-out, crop-sway 2.4s ease-in-out 0.4s infinite`,
                              }
                    }
                  >
                    <PixelCrop id={c.crop.id} stage={c.crop.stage} />
                  </div>
                )}
                {c.crop && c.crop.stage === 2 && !isFacing && (
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

        {shoeTrailPath && shoeTrailPath.points.length >= 2 && (
          <svg className="shoe-trail-svg" width={COLS * TILE} height={ROWS * TILE} aria-hidden>
            <defs>
              <linearGradient id="shoe-trail-fade" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                <stop offset="55%" stopColor="currentColor" stopOpacity="0.55" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
              </linearGradient>
            </defs>
            {shoeTrailPath.points.slice(1).map((point, index) => {
              const previous = shoeTrailPath.points[index];
              const alpha = (index + 1) / (shoeTrailPath.points.length - 1);
              return (
                <path
                  key={`${point.t}:${index}`}
                  className={`shoe-trail-line shoe-trail-line-${shoeTrailPath.kind}`}
                  d={trailSegmentPath(previous, point)}
                  style={{ opacity: Math.max(0.08, alpha) }}
                />
              );
            })}
            <path
              className={`shoe-trail-head shoe-trail-head-${shoeTrailPath.kind}`}
              d={smoothTrailPath(shoeTrailPath.points.slice(-3))}
            />
          </svg>
        )}

        {/* dust puffs */}
        {dust.map((d) => (
          <div
            key={`du-${d.id}`}
            className="absolute pointer-events-none z-10 dust-puff"
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
            x{comboShown.level} คอมโบ!
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
              width: p.kind === "shoe" ? 1 : p.kind === "sparkle" ? 5 : p.kind === "tool" ? 7 : 6,
              height: p.kind === "shoe" ? 1 : p.kind === "sparkle" ? 5 : p.kind === "tool" ? 7 : 6,
              background: p.color,
              borderRadius: p.kind === "water" ? "50%" : 0,
              boxShadow:
                p.kind === "shoe"
                  ? `0 0 6px 2px ${p.color}, 0 0 10px ${p.color}`
                  : p.kind === "sparkle" || p.kind === "tool"
                    ? `0 0 10px ${p.color}, 0 0 0 1px #1a0f1f`
                    : "0 1px 0 rgba(0,0,0,0.4)",
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
      <div className="farm-toolbar relative z-10 mt-3 w-full max-w-5xl pixel-panel">
        <div className="farm-toolbar-section farm-toolbar-tools">
          <span className="farm-toolbar-label">อุปกรณ์</span>
          <div className="farm-tool-grid">
            {(
              [
                { id: "hoe", label: "จอบ", Icon: HoeIcon, key: "E" },
                { id: "watering_can", label: "น้ำ", Icon: WaterCanIcon, key: "Q" },
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
                  toolRef.current = t.id;
                  setTool(t.id);
                  SFX.click();
                  pauseAutoBot();
                }}
                className="farm-tool-btn pixel-btn"
                data-active={tool === t.id}
              >
                <t.Icon size={20} />
                <span>{t.label}</span>
                <span className="farm-key-hint">[{t.key}]</span>
              </button>
            ))}
          </div>
        </div>

        <div className="farm-toolbar-section farm-toolbar-crops">
          <span className="farm-toolbar-label">พืชผัก</span>
          <div className="farm-crop-grid">
            {(Object.values(CROPS) as Crop[]).map((c) => {
              const active = seedChoice === c.id && tool === "seed";
              const Icon = CROP_ICONS[c.id];
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    seedChoiceRef.current = c.id;
                    setSeedChoice(c.id);
                    toolRef.current = "seed";
                    setTool("seed");
                    SFX.click();
                    pauseAutoBot();
                  }}
                  className="farm-crop-card pixel-btn"
                  data-active={active}
                  title={`ราคาซื้อ: ${c.seedCost} | ราคาขายตลาดปัจจุบัน: ${Math.round(marketPrices[c.id])}`}
                >
                  <span className="farm-crop-icon">
                    <Icon size={24} />
                  </span>
                  <span className="farm-crop-body">
                    <span className="farm-crop-name">{c.name}</span>
                    <span className="farm-crop-prices">
                      <span>
                        ซื้อ <CoinIcon size={10} /> <b>{c.seedCost}</b>
                      </span>
                      <span>
                        ขาย <b>{Math.round(marketPrices[c.id])}</b>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {homeScoreboardOpen && (
        <HomeScoreboardDialog
          scoreboard={homeScoreboard}
          loaded={homeScoreboardLoaded}
          onClose={() => setHomeScoreboardOpen(false)}
        />
      )}

      {titleUnlock && (
        <TitleUnlockDialog
          level={titleUnlock.level}
          title={titleUnlock.title}
          onClose={() => setTitleUnlock(null)}
        />
      )}

      <GameMenuDialog
        open={gameMenuOpen}
        initialTab={gameMenuInitialTab}
        playerName={playerName}
        gardenTokens={gardenTokenState.balance}
        unlockedPresetIds={gardenTokenState.unlockedPresetIds}
        levelLabel={progress ? `LV ${progress.level} · ${levelTitle(progress.level)}` : "เมนู"}
        expLabel={progress ? `${progress.exp}/${progressNext} XP` : undefined}
        autoBotActive={autoBotActive}
        muted={muted}
        cosmetics={cosmetics}
        marketPrices={marketPrices}
        selectedCropId={seedChoice}
        onClose={() => setGameMenuOpen(false)}
        onSaveName={(next) => {
          setPlayerName(next);
          savePlayerName(next);
          SFX.click();
        }}
        onChangeCosmetics={(next) => {
          setCosmetics(next);
          writeCosmetics(next);
          SFX.click();
        }}
        onBuyPreset={handleBuyPreset}
        onEquipPreset={handleEquipPreset}
        onAddGardenTokens={
          import.meta.env.DEV ? () => setGardenTokenState(awardGardenTokens(250)) : undefined
        }
        onSelectCrop={(id) => {
          seedChoiceRef.current = id;
          setSeedChoice(id);
          toolRef.current = "seed";
          setTool("seed");
          pauseAutoBot();
        }}
        onToggleAutoBot={() => {
          if (autoBotActive) {
            pauseAutoBot();
          } else {
            botPausedRef.current = false;
            setAutoBotActive(true);
          }
          SFX.click();
        }}
        onToggleMuted={() => {
          const v = !isMuted();
          setMuted(v);
          setMutedState(v);
          if (!v) startBgm();
          SFX.click();
        }}
      />
    </div>
  );
}

function normalizedKeyboardKey(e: KeyboardEvent): string {
  const key = e.key.toLowerCase();
  const thaiFallback: Record<string, string> = {
    ไ: "keyw",
    ฟ: "keya",
    ห: "keys",
    ก: "keyd",
    ท: "keym",
    ๆ: "keyq",
    ำ: "keye",
    " ": "space",
    enter: "enter",
    arrowup: "arrowup",
    arrowdown: "arrowdown",
    arrowleft: "arrowleft",
    arrowright: "arrowright",
  };
  if (thaiFallback[key]) return thaiFallback[key];

  const code = e.code.toLowerCase();
  if (code && code !== "unidentified") return code;
  return key;
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

function HomeScoreboardDialog({
  scoreboard,
  loaded,
  onClose,
}: {
  scoreboard: { oneVsOne: ScoreboardEntry[]; twoVsTwo: ScoreboardEntry[] };
  loaded: boolean;
  onClose: () => void;
}) {
  const [activeMode, setActiveMode] = useState<"1v1" | "2v2">("1v1");
  const entries = activeMode === "1v1" ? scoreboard.oneVsOne : scoreboard.twoVsTwo;
  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      style={{ background: "rgba(10,5,15,0.85)" }}
      onClick={onClose}
    >
      <aside
        className="pixel-panel flex w-full max-w-xl flex-col gap-3 p-5 help-modal-pop"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="อันดับผู้เล่น"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-pixel text-[9px] tracking-[2px] text-[var(--gold)]">
              อันดับผู้เล่น
            </div>
            <div className="mt-1 font-pixel text-[7px] text-[var(--muted-foreground)]">
              เฉพาะแมตช์คนจริง · ไม่รวมบอท
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pixel-btn flex h-8 w-8 items-center justify-center p-0"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["1v1", "2v2"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="pixel-btn px-3 py-2 font-pixel text-[8px]"
              data-active={activeMode === mode ? "true" : undefined}
              onClick={() => setActiveMode(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <HomeScoreboardList title={activeMode.toUpperCase()} entries={entries} loaded={loaded} />
      </aside>
    </div>
  );
}

function HomeScoreboardList({
  title,
  entries,
  loaded,
}: {
  title: string;
  entries: ScoreboardEntry[];
  loaded: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 font-pixel text-[8px] text-[var(--foreground)]">
        <span>{title}</span>
        <span className="text-[var(--muted-foreground)]">TOP 5</span>
      </div>
      {!loaded ? (
        <div className="grid gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={i}
              className="block h-[16px] animate-pulse"
              style={{
                background: "var(--muted)",
                boxShadow: "0 0 0 1px var(--background)",
                opacity: 1 - i * 0.18,
              }}
            />
          ))}
        </div>
      ) : entries.length ? (
        <div className="grid gap-1.5">
          {entries.map((entry) => (
            <ScoreboardRow key={`${entry.matchCode}:${entry.playerId}`} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="font-pixel text-[8px] leading-relaxed text-[var(--muted-foreground)]">
          ยังไม่มีคะแนน
        </div>
      )}
    </div>
  );
}

function ScoreboardRow({ entry }: { entry: ScoreboardEntry }) {
  const seconds = Math.ceil(entry.timeRemainingMs / 1000);
  return (
    <div className="grid gap-1 font-pixel text-[8px]">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2">
        <span className="text-[var(--gold)]">#{entry.rank}</span>
        <span className="truncate">
          {entry.name}
          {entry.winner ? " · WIN" : ""}
        </span>
        <span className="flex items-center gap-1 text-[var(--gold)]">
          <CoinIcon size={10} />
          {entry.coins}
        </span>
      </div>
      <div className="ml-[36px] flex flex-wrap items-center gap-2 text-[7px] text-[var(--muted-foreground)]">
        {entry.mode === "2v2" && entry.teamId && <span>ทีม {entry.teamId}</span>}
        {entry.role && <span>{entry.role === "seller" ? "คนขาย" : "ชาวสวน"}</span>}
        <span>เหลือ {seconds} วิ</span>
      </div>
    </div>
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
