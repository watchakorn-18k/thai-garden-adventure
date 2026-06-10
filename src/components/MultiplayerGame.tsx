import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import PixelFarmer from "./PixelFarmer";
import CosmeticPicker from "./CosmeticPicker";
import CropIndexBook from "./CropIndexBook";
import PhaserField from "./PhaserField";
import {
  ChiliIcon,
  CoinIcon,
  EggplantIcon,
  HoeIcon,
  MorningGloryIcon,
  RiceIcon,
  SeedIcon,
  WaterCanIcon,
  MangoIcon,
  LemongrassIcon,
  PapayaIcon,
  BasilIcon,
  EyeIcon,
  CaterpillarIcon,
  BeetleIcon,
  FlyIcon,
} from "./PixelIcons";
import { applyAction, facingTile } from "@/lib/game-logic";
import {
  COLS,
  CROP_COLOR,
  CROPS,
  MARKET_TILE_POS,
  ROWS,
  SELLER_BASKET_CAPACITY,
  type Cargo,
  type CropId,
  type Direction,
  type MatchTeam,
  type PlayerRole,
  type TeamId,
  type Tile,
  type Tool,
} from "@/lib/game-types";
import {
  DEFAULT_COSMETICS,
  readCosmetics,
  writeCosmetics,
  type PlayerCosmetics,
} from "@/lib/player-cosmetics";
import { useMatch } from "@/lib/match-client";
import { toolDurationMs } from "@/lib/tool-animation";
import { SFX, setMuted } from "@/lib/sfx";
import lobbyMusicUrl from "../../lobby_music.wav";
import gamePlayMusicUrl from "../../game_play.wav";
import winnerSoundUrl from "../../winner_sound.mp3";
import loserSoundUrl from "../../loser_sound.mp3";
import drawSoundUrl from "../../draw_sound.mp3";
import {
  DEFAULT_ROOM_SETTINGS,
  DEFAULT_SELECTED_CROPS,
  ROOM_SETTING_LIMITS,
  SELECTED_CROP_COUNT,
  TARGET_COINS,
  TWO_V_TWO_TARGET_COINS,
  type MatchModeSetting,
  type MatchRecap,
  type MatchRole,
  type PublicMatchState,
  type PublicPlayer,
  type RoomSettings,
  type RoomStage,
  type ServerEvent,
} from "@/lib/match-protocol";

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

const TILE = 56;
function playerCargoStack(player: PublicPlayer): Cargo[] {
  if (player.cargoStack && player.cargoStack.length > 0) return player.cargoStack;
  if (player.carryingCargo) return [player.carryingCargo];
  return [];
}

// Market-rush mini-game: 5 customer faces, each craving one crop. Deliver the
// top cargo to the customer whose icon matches it.
const BUYER_FACES = ["👩‍🌾", "🧑‍🍳", "👵", "🧔", "🧑‍🦰", "👨‍🦱", "👳", "🧕"] as const;
const PUZZLE_SLOTS = 5;
const PUZZLE_TIME_MS = 5000;

function pickN<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const STAGE_COPY: Record<RoomStage, { label: string; desc: string }> = {
  classic: { label: "สวนมาตรฐาน", desc: "สวนมาตรฐาน แข่งทำเหรียญไว" },
  water: { label: "สวนริมคลอง", desc: "คลองชลประทานล้อมสวน" },
  festival: { label: "ค่ำคืนงานวัด", desc: "บรรยากาศงานวัด โทนทอง" },
};

interface Props {
  code: string;
  role?: MatchRole;
  desiredMode?: MatchModeSetting;
}

export default function MultiplayerGame({ code, role = "player", desiredMode }: Props) {
  const name = useMemo(() => {
    if (typeof window === "undefined") return "Player";
    return localStorage.getItem("tg.name")?.trim() || "ผู้เล่น";
  }, []);

  const [cosmetics, setCosmetics] = useState(() => readCosmetics());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outfitOpen, setOutfitOpen] = useState(false);
  const [bugHuntOpen, setBugHuntOpen] = useState(false);
  const [puzzleDismissed, setPuzzleDismissed] = useState(false);
  const [spectatorBookOpen, setSpectatorBookOpen] = useState(true);
  const [events, setEvents] = useState<{ id: number; ev: ServerEvent }[]>([]);
  const [musicEnabled, setMusicEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("tg.lobbyMusic") !== "off";
  });
  const evIdRef = useRef(0);
  const lobbyMusicRef = useRef<HTMLAudioElement | null>(null);
  const gamePlayMusicRef = useRef<HTMLAudioElement | null>(null);
  const winnerSoundRef = useRef<HTMLAudioElement | null>(null);
  const loserSoundRef = useRef<HTMLAudioElement | null>(null);
  const drawSoundRef = useRef<HTMLAudioElement | null>(null);

  const selfRef = useRef<PublicPlayer | undefined>(undefined);
  const statusRef = useRef<string | undefined>(undefined);
  const is2v2Ref = useRef(false);
  const localPlayerRef = useRef<PublicPlayer | undefined>(undefined);
  const [localPlayer, setLocalPlayer] = useState<PublicPlayer | undefined>(undefined);

  const pendingActions = useRef<
    Array<{
      time: number;
      pos: { x: number; y: number };
      dir: Direction;
      tool: Tool;
      seedChoice: CropId;
    }>
  >([]);

  const recalculateLocalPlayer = useCallback(() => {
    const s = selfRef.current;
    if (!s) {
      localPlayerRef.current = undefined;
      setLocalPlayer(undefined);
      return;
    }
    const current = localPlayerRef.current;

    if (statusRef.current !== "playing") {
      pendingActions.current = [];
    }

    // Prune expired actions (older than 700ms)
    const now = Date.now();
    pendingActions.current = pendingActions.current.filter((a) => now - a.time < 700);

    let predictedTiles = s.tiles;
    let predictedCoins = s.coins;

    // Apply pending actions sequentially
    for (const act of pendingActions.current) {
      const res = applyAction({
        tiles: predictedTiles,
        coins: predictedCoins,
        pos: act.pos,
        dir: act.dir,
        tool: act.tool,
        seedChoice: act.seedChoice,
        blockedTile: is2v2Ref.current ? MARKET_TILE_POS : undefined,
        now: act.time,
      });
      predictedTiles = res.tiles;
      predictedCoins = res.coins;
    }

    const next: PublicPlayer = {
      ...s,
      tiles: predictedTiles,
      coins: predictedCoins,
      pos: current ? current.pos : s.pos,
      dir: current ? current.dir : s.dir,
    };

    localPlayerRef.current = next;
    setLocalPlayer(next);
  }, []);

  const {
    state,
    selfId,
    isHost,
    role: matchRole,
    status,
    lastError,
    send,
  } = useMatch({
    code,
    name,
    role,
    cosmetics,
    onEvents: (batch) => {
      setEvents((prev) => {
        const next = [...prev];
        let hasSelfEvent = false;
        for (const ev of batch) {
          const id = ++evIdRef.current;
          next.push({ id, ev });
          setTimeout(() => setEvents((p) => p.filter((q) => q.id !== id)), 950);

          if (ev.playerId === selfId) {
            hasSelfEvent = true;
            const idx = pendingActions.current.findIndex((p) => {
              if (ev.kind === "till") return p.tool === "hoe";
              if (ev.kind === "water") return p.tool === "watering_can";
              if (ev.kind === "plant") return p.tool === "seed";
              if (ev.kind === "harvest") return true;
              return false;
            });
            if (idx !== -1) {
              pendingActions.current.splice(idx, 1);
            }
          }

          // Play SFX on match events
          if (ev.kind === "till") {
            if (matchRole === "spectator") SFX.hoe();
          } else if (ev.kind === "water") {
            if (matchRole === "spectator") SFX.water();
          } else if (ev.kind === "plant") {
            if (matchRole === "spectator") SFX.plant();
          } else if (ev.kind === "harvest") {
            if (ev.reward === 0) {
              if (matchRole === "spectator") SFX.hoe();
            } else {
              if (matchRole === "spectator") SFX.harvest();
              if (ev.playerId === selfId || matchRole === "spectator") {
                const coinCount = Math.min(3, Math.ceil(ev.reward / 10));
                for (let i = 0; i < coinCount; i++) {
                  setTimeout(() => SFX.coin(), i * 80);
                }
              }
              if (ev.playerId === selfId) {
                setCombo((c) => {
                  const n = c + 1;
                  if (n >= 2) SFX.combo(n);
                  if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
                  comboTimerRef.current = setTimeout(() => setCombo(0), 2200);
                  return n;
                });
              }
            }
          } else if (ev.kind === "bug_found") {
            SFX.bad();
            if (ev.playerId === selfId) {
              toast("แมลงระบาด! 🐛", {
                id: "bug-found",
                description: "แมลงกินผักของคุณ! ขอให้คนขายช่วยจับที่ตลาดด่วน",
              });
            }
          } else if (ev.kind === "bug_cleared") {
            if (ev.playerId === selfId || matchRole === "spectator") {
              SFX.harvest();
              const coinCount = Math.min(4, Math.ceil(ev.reward / 15));
              for (let i = 0; i < coinCount; i++) {
                setTimeout(() => SFX.coin(), i * 80);
              }
              if (ev.playerId === selfId) {
                toast.success("จับแมลงสำเร็จ! 🐛✨", {
                  description: `ได้เงินเพิ่ม +${ev.reward} เหรียญ และปลดล็อกช่องแล้ว`,
                });
              }
            }
          } else if (ev.kind === "insufficient_funds") {
            if (ev.playerId === selfId) {
              SFX.bad();
              toast("เงินไม่พอ", {
                id: "insufficient-funds",
                description: "คุณมีเงินไม่พอซื้อเมล็ดพันธุ์",
              });
            }
          } else if (ev.kind === "cargo_picked_up") {
            if (ev.playerId === selfId || matchRole === "spectator") SFX.harvest();
          } else if (ev.kind === "cargo_sold") {
            if (ev.playerId === selfId || matchRole === "spectator") {
              const coinCount = Math.min(4, Math.ceil((ev.totalReward ?? ev.reward) / 15));
              for (let i = 0; i < coinCount; i++) {
                setTimeout(() => SFX.coin(), i * 80);
              }
            }
            // Selling to the right customer builds the same combo meter as harvesting.
            if (ev.playerId === selfId) {
              if (ev.puzzleCorrect) {
                setCombo((c) => {
                  const n = c + 1;
                  if (n >= 2) SFX.combo(n);
                  if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
                  comboTimerRef.current = setTimeout(() => setCombo(0), 2200);
                  return n;
                });
              } else if (ev.puzzleCorrect === false) {
                setCombo(0);
              }
            }
          }
        }
        if (hasSelfEvent) {
          recalculateLocalPlayer();
        }
        return next;
      });
    },
  });

  useEffect(() => {
    const shouldPlayLobbyMusic =
      musicEnabled &&
      (state?.status === "lobby" ||
        state?.status === "countdown" ||
        state?.status === "crop_ban" ||
        state?.status === "crop_selection" ||
        state?.status === "prepare_countdown");

    let audio: HTMLAudioElement | null = null;
    try {
      audio = lobbyMusicRef.current ?? new Audio(lobbyMusicUrl);
      lobbyMusicRef.current = audio;
      audio.loop = true;
      audio.volume = 0.35;
    } catch (e) {
      console.warn("Failed to initialize lobby music:", e);
      return;
    }

    if (!shouldPlayLobbyMusic) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    const play = () => {
      if (audio) void audio.play().catch(() => undefined);
    };
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      if (audio) audio.pause();
    };
  }, [musicEnabled, state?.status]);

  useEffect(() => {
    const shouldPlayGameMusic = musicEnabled && state?.status === "playing";
    let audio: HTMLAudioElement | null = null;
    try {
      audio = gamePlayMusicRef.current ?? new Audio(gamePlayMusicUrl);
      gamePlayMusicRef.current = audio;
      audio.loop = true;
      audio.volume = 0.3;
    } catch (e) {
      console.warn("Failed to initialize gameplay music:", e);
      return;
    }

    if (!shouldPlayGameMusic) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    const play = () => {
      if (audio) void audio.play().catch(() => undefined);
    };
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      if (audio) audio.pause();
    };
  }, [musicEnabled, state?.status]);

  useEffect(() => {
    let winnerAudio: HTMLAudioElement | null = null;
    let loserAudio: HTMLAudioElement | null = null;
    let drawAudio: HTMLAudioElement | null = null;

    try {
      winnerAudio = winnerSoundRef.current ?? new Audio(winnerSoundUrl);
      loserAudio = loserSoundRef.current ?? new Audio(loserSoundUrl);
      drawAudio = drawSoundRef.current ?? new Audio(drawSoundUrl);

      winnerSoundRef.current = winnerAudio;
      loserSoundRef.current = loserAudio;
      drawSoundRef.current = drawAudio;

      winnerAudio.loop = true;
      loserAudio.loop = true;
      drawAudio.loop = true;
      winnerAudio.volume = 0.22;
      loserAudio.volume = 0.22;
      drawAudio.volume = 0.22;
    } catch (e) {
      console.warn("Failed to initialize match outcome music:", e);
      return;
    }

    const endSounds = [winnerAudio, loserAudio, drawAudio];
    const stopEndSounds = () => {
      for (const sound of endSounds) {
        if (sound) {
          sound.pause();
          sound.currentTime = 0;
        }
      }
    };

    if (!musicEnabled || state?.status !== "ended") {
      stopEndSounds();
      return;
    }

    const audio = !state.winnerId
      ? drawAudio
      : matchRole === "spectator"
        ? winnerAudio
        : selfId && state.winnerId !== selfId
          ? loserAudio
          : winnerAudio;

    for (const sound of endSounds) {
      if (sound === audio) continue;
      if (sound) {
        sound.pause();
        sound.currentTime = 0;
      }
    }

    const play = () => {
      if (audio) void audio.play().catch(() => undefined);
    };
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      if (audio) audio.pause();
    };
  }, [musicEnabled, selfId, state?.status, state?.winnerId, matchRole]);

  // Synchronize music/audio mute state with sfx setting
  useEffect(() => {
    setMuted(!musicEnabled);
  }, [musicEnabled]);

  // Clean up and release all audio elements on component unmount
  useEffect(() => {
    return () => {
      const audios = [
        lobbyMusicRef.current,
        gamePlayMusicRef.current,
        winnerSoundRef.current,
        loserSoundRef.current,
        drawSoundRef.current,
      ];
      for (const audio of audios) {
        if (audio) {
          try {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
          } catch (e) {
            console.error("Error cleaning up audio resource:", e);
          }
        }
      }
      lobbyMusicRef.current = null;
      gamePlayMusicRef.current = null;
      winnerSoundRef.current = null;
      loserSoundRef.current = null;
      drawSoundRef.current = null;
    };
  }, []);

  const toggleLobbyMusic = useCallback(() => {
    SFX.click();
    setMusicEnabled((current) => {
      const next = !current;
      localStorage.setItem("tg.lobbyMusic", next ? "on" : "off");
      return next;
    });
  }, []);

  const keys = useRef<Set<string>>(new Set());
  const nextDiagonalAxis = useRef<"vertical" | "horizontal">("vertical");
  const lastInputDir = useRef<Direction | null>(null);
  const [predictedDir, setPredictedDir] = useState<Direction | null>(null);
  const lastStatus = useRef<string | undefined>(undefined);
  const [actionFlash, setActionFlash] = useState(0);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [combo, setCombo] = useState(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSpectator = matchRole === "spectator";
  const currentRole = matchRole === "spectator" ? "ผู้ชม" : "ผู้เล่น";
  const self = isSpectator ? undefined : state?.players.find((p) => p.id === selfId);
  const renderedSelf = localPlayer ?? self;
  const hasHostControls = isHost || Boolean(state?.hostId && state.hostId === selfId);
  const is2v2 = state?.settings.mode === "2v2";
  const selfTeam = self?.teamId ? state?.teams?.find((team) => team.id === self.teamId) : undefined;
  const opp = state?.players.find((p) => p.id !== selfId && (!is2v2 || p.teamId !== self?.teamId));
  useEffect(() => {
    selfRef.current = self;
    statusRef.current = state?.status;
    is2v2Ref.current = is2v2;
  }, [self, state?.status, is2v2]);

  // Honor a ?mode= request from the entry CTA: the host pushes the desired room
  // mode once, while still in the lobby. Sent only once per page load so the host
  // can freely change it afterward via Settings.
  const appliedModeRef = useRef(false);
  useEffect(() => {
    if (appliedModeRef.current) return;
    if (!desiredMode || !state) return;
    if (!hasHostControls || state.status !== "lobby") return;
    if (state.settings.mode === desiredMode) {
      appliedModeRef.current = true;
      return;
    }
    appliedModeRef.current = true;
    send({
      t: "settings",
      settings: {
        ...state.settings,
        mode: desiredMode,
        maxPlayers: desiredMode === "2v2" ? 4 : 2,
        targetCoins: desiredMode === "2v2" ? TWO_V_TWO_TARGET_COINS : TARGET_COINS,
      },
    });
  }, [desiredMode, state, hasHostControls, send]);

  useEffect(() => {
    recalculateLocalPlayer();
  }, [self, state?.status, recalculateLocalPlayer]);

  // Drop the bug-hunt intent the moment it's no longer offerable (bug cleared,
  // seller left the market) so returning later requires an explicit re-open.
  useEffect(() => {
    if (bugHuntOpen && !(self && isSellerBugReady(self))) setBugHuntOpen(false);
  }, [bugHuntOpen, self]);

  // Clear puzzle dismissal state when seller leaves market or loses cargo
  useEffect(() => {
    if (puzzleDismissed && !(self && isSellerPuzzleReady(self))) {
      setPuzzleDismissed(false);
    }
  }, [puzzleDismissed, self]);

  const setMovement = useCallback(
    (dir: Direction | null) => {
      if (isSpectator) return;
      if (!selfRef.current || statusRef.current !== "playing") return;
      // Freeze movement while the dig/use animation plays so it finishes first.
      if (actingRef.current && dir) return;
      if (lastInputDir.current === dir) return;
      lastInputDir.current = dir;
      setPredictedDir(dir);
      send(dir ? { t: "move", dir, pos: localPlayerRef.current?.pos } : { t: "move_stop" });
    },
    [isSpectator, send],
  );

  const sendAction = useCallback(() => {
    if (isSpectator) return;
    if (statusRef.current !== "playing") return;
    const currentSelf = selfRef.current;
    const isSeller = currentSelf?.role === "seller";
    if (isSeller && currentSelf && isSellerBugReady(currentSelf)) {
      SFX.click();
      setBugHuntOpen(true);
      return;
    }
    if (!isSeller && actingRef.current) return;
    const actDur = toolDurationMs(currentSelf?.tool ?? "hoe");
    setActionFlash((n) => n + 1);
    setActing(true);
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    // Farmers freeze in place until the dig/use animation finishes; sellers
    // (quick pickup) keep moving freely.
    if (!isSeller) {
      actingRef.current = true;
      if (lastInputDir.current) {
        lastInputDir.current = null;
        setPredictedDir(null);
        send({ t: "move_stop" });
      }
      actionTimerRef.current = setTimeout(() => {
        setActing(false);
        actingRef.current = false;
        // Resume walking if a movement key is still held after the animation.
        const dir = keysToDir(keys.current, nextDiagonalAxis);
        if (dir) setMovement(dir);
      }, actDur);
    } else {
      actionTimerRef.current = setTimeout(() => setActing(false), actDur);
    }
    const local = localPlayerRef.current;
    if (local) {
      if (isSeller) {
        // Seller pickup — play harvest SFX, skip farmer pending action
        SFX.harvest();
      } else {
        const target = facingTile(local.pos, local.dir);
        const blockedTarget =
          is2v2Ref.current && target?.x === MARKET_TILE_POS.x && target?.y === MARKET_TILE_POS.y;
        if (target && !blockedTarget) {
          const tile = local.tiles[target.y]?.[target.x];
          if (tile) {
            if (tile.crop && tile.crop.stage >= 2) {
              SFX.harvest();
            } else if (local.tool === "hoe" && tile.type === "grass") {
              SFX.hoe();
            } else if (
              local.tool === "watering_can" &&
              (tile.type === "tilled" || (tile.crop && tile.type !== "watered"))
            ) {
              SFX.water();
            } else if (
              local.tool === "seed" &&
              (tile.type === "tilled" || tile.type === "watered") &&
              !tile.crop
            ) {
              const crop = CROPS[local.seedChoice];
              if (local.coins >= crop.seedCost) {
                SFX.plant();
              } else {
                SFX.bad();
              }
            }
          }
        }

        pendingActions.current.push({
          time: Date.now(),
          pos: { ...local.pos },
          dir: local.dir,
          tool: local.tool,
          seedChoice: local.seedChoice,
        });
        recalculateLocalPlayer();
      }

      send({ t: "action", pos: local.pos, dir: local.dir });
    }
  }, [isSpectator, send, recalculateLocalPlayer, setMovement]);

  useEffect(() => {
    if (isSpectator) return;
    const onDown = (e: KeyboardEvent) => {
      const k = normalizedKeyboardKey(e);
      keys.current.add(k);
      if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
      }
      const selfPlayer = selfRef.current;
      const puzzleActive = selfPlayer ? isSellerPuzzleReady(selfPlayer) : false;
      const dir = keyToDir(k);
      if (dir && !puzzleActive) setMovement(keysToDir(keys.current, nextDiagonalAxis));
      if ((k === "space" || k === "enter") && !e.repeat && !puzzleActive) sendAction();
      if (
        k === "keyr" &&
        (statusRef.current === "lobby" ||
          // Sellers are auto-ready in 2v2 crop selection — R does nothing for them.
          (statusRef.current === "crop_selection" && selfPlayer?.role !== "seller"))
      ) {
        SFX.click();
        send({ t: "ready" });
      }
      // Seller delivery keys (1-5) are handled inside SellerPuzzleOverlay, which
      // owns the customer board — only farmers map digits to tools here.
      if (selfPlayer?.role !== "seller") {
        if (k === "digit1") {
          SFX.click();
          send({ t: "tool", tool: "hoe" });
        }
        if (k === "digit2") {
          SFX.click();
          send({ t: "tool", tool: "watering_can" });
        }
        if (k === "digit3") {
          SFX.click();
          send({ t: "tool", tool: "seed" });
        }
      }
    };
    const stopAll = () => {
      keys.current.clear();
      setMovement(null);
    };
    const onUp = (e: KeyboardEvent) => {
      keys.current.delete(normalizedKeyboardKey(e));
      setMovement(keysToDir(keys.current, nextDiagonalAxis));
    };
    const onVisibilityChange = () => {
      if (document.hidden) stopAll();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", stopAll);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", stopAll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isSpectator, send, sendAction, setMovement]);

  useEffect(() => {
    if (state?.status === "playing") return;
    keys.current.clear();
    lastInputDir.current = null;
    setPredictedDir(null);
    setActing(false);
    actingRef.current = false;
    if (actionTimerRef.current) {
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }
  }, [state?.status]);

  useEffect(() => {
    if (isSpectator) return;
    if (state?.status !== "playing") return;
    const speed = 5.2;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Pause local movement prediction while the dig/use animation plays.
      if (actingRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const k = keys.current;
      let dx = 0;
      let dy = 0;
      if (k.has("keyw") || k.has("arrowup")) dy -= 1;
      if (k.has("keys") || k.has("arrowdown")) dy += 1;
      if (k.has("keya") || k.has("arrowleft")) dx -= 1;
      if (k.has("keyd") || k.has("arrowright")) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const current = localPlayerRef.current;
        if (current) {
          const dir: Direction =
            Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
          const next: PublicPlayer = {
            ...current,
            dir,
            pos: {
              x: Math.max(0, Math.min(COLS - 1, current.pos.x + dx * speed * dt)),
              y: Math.max(0, Math.min(ROWS - 1, current.pos.y + dy * speed * dt)),
            },
          };
          localPlayerRef.current = next;
          setLocalPlayer(next);
          setPredictedDir(dir);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isSpectator, state?.status]);

  useEffect(() => {
    if (isSpectator) return;
    if (state?.status !== "playing") return;
    const i = setInterval(() => {
      if (actingRef.current) return;
      const dir = keysToDir(keys.current, nextDiagonalAxis);
      if (dir) {
        lastInputDir.current = dir;
        setPredictedDir(dir);
        send({ t: "move", dir, pos: localPlayerRef.current?.pos });
      } else if (lastInputDir.current) {
        lastInputDir.current = null;
        setPredictedDir(null);
        send({ t: "move_stop" });
      }
    }, 50);
    return () => clearInterval(i);
  }, [isSpectator, send, state?.status]);

  useEffect(() => {
    return () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!predictedDir || state?.status !== "playing") return;
    SFX.step();
    const interval = setInterval(() => {
      SFX.step();
    }, 220);
    return () => clearInterval(interval);
  }, [predictedDir, state?.status]);

  useEffect(() => {
    if (!state?.status) return;
    if (lastStatus.current !== state.status) {
      lastStatus.current = state.status;
      if (state.status === "countdown" || state.status === "prepare_countdown") {
        SFX.click();
      } else if (state.status === "playing") {
        SFX.crit();
      } else if (state.status === "ended") {
        const won = state.winnerId && state.winnerId === selfId;
        if (won) {
          SFX.crit();
        } else {
          SFX.bad();
        }
      }
    }
  }, [state?.status, state?.winnerId, selfId]);

  if (!state) {
    return (
      <CenterMsg
        main={lastError?.message ?? "กำลังเชื่อมต่อ..."}
        sub={lastError ? `ห้อง ${code}` : `ห้อง ${code}`}
      />
    );
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-start p-6 gap-4 overflow-hidden">
      <div className="sky-stars" />

      <MatchHUD
        code={code}
        self={self ?? state.players[0]}
        opp={isSpectator ? state.players[1] : opp}
        state={state}
        settings={state.settings}
        selfTeam={selfTeam}
        teams={state.teams}
        status={status}
        role={matchRole}
        combo={combo}
        outfit={
          !isSpectator && state.status !== "playing"
            ? {
                open: outfitOpen,
                cosmetics,
                onToggle: () => {
                  SFX.click();
                  setOutfitOpen((current) => !current);
                },
                onClose: () => {
                  SFX.click();
                  setOutfitOpen(false);
                },
                onChange: (next: PlayerCosmetics) => {
                  SFX.click();
                  setCosmetics(next);
                  writeCosmetics(next);
                  send({ t: "cosmetics", cosmetics: next });
                },
              }
            : undefined
        }
      />

      {(state.status === "lobby" ||
        state.status === "countdown" ||
        state.status === "crop_ban" ||
        state.status === "crop_selection" ||
        state.status === "prepare_countdown") && (
        <button
          onClick={toggleLobbyMusic}
          className="pixel-btn fixed right-4 top-4 z-50 flex h-12 w-12 items-center justify-center p-0"
          data-active={musicEnabled ? "true" : undefined}
          aria-label={musicEnabled ? "ปิดเพลงล็อบบี้" : "เปิดเพลงล็อบบี้"}
          title={musicEnabled ? "ปิดเพลงล็อบบี้" : "เปิดเพลงล็อบบี้"}
        >
          {musicEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      )}

      {(state.status === "lobby" || state.status === "countdown") &&
        (isSpectator ? (
          <SpectatorLobbyView
            players={state.players}
            state={state}
            isHost={hasHostControls}
            onClaimSlot={() => send({ t: "claim_slot" })}
            onForceStart={() => send({ t: "start" })}
            onOpenSettings={() => setSettingsOpen(true)}
            onAddBot={() => send({ t: "add_bot" })}
            onRemoveBot={(playerId) => send({ t: "remove_bot", playerId })}
          />
        ) : (
          <LobbyView
            self={self}
            opp={opp}
            state={state}
            isHost={hasHostControls}
            onReady={() => send({ t: "ready" })}
            onStart={() => send({ t: "start" })}
            onLeaveSlot={() => send({ t: "leave_slot" })}
            onOpenSettings={() => setSettingsOpen(true)}
            onKick={(playerId) => send({ t: "kick", playerId })}
            onAddBot={() => send({ t: "add_bot" })}
            onRemoveBot={(playerId) => send({ t: "remove_bot", playerId })}
            onChooseTeamRole={(teamId, role) => send({ t: "choose_team_role", teamId, role })}
          />
        ))}

      {state.status === "countdown" && state.countdownEndsAt && (
        <CountdownView
          endsAt={state.countdownEndsAt}
          isHost={hasHostControls}
          onCancel={() => send({ t: "cancel_countdown" })}
        />
      )}

      {state.status === "crop_ban" && (
        <CropBanView
          state={state}
          self={self}
          isSpectator={isSpectator}
          onBanCrop={(id) => send({ t: "ban_crop", id })}
          onReady={() => send({ t: "ready" })}
        />
      )}

      {(state.status === "crop_selection" || state.status === "prepare_countdown") && (
        <CropSelectionView
          state={state}
          self={self}
          isSpectator={isSpectator}
          isLocked={state.status === "prepare_countdown"}
          bannedCrops={bannedCropIds(state.players)}
          onSelectCrops={(ids) => send({ t: "select_crops", ids })}
          onReady={() => send({ t: "ready" })}
        />
      )}

      {state.status === "prepare_countdown" && state.countdownEndsAt && (
        <CountdownView endsAt={state.countdownEndsAt} isHost={false} onCancel={() => undefined} />
      )}

      {(state.status === "playing" || state.status === "ended") &&
        (isSpectator ? (
          <SpectatorMatchView
            players={state.players}
            events={events}
            spectatorCount={state.spectatorCount}
            marketPrices={state.marketPrices}
            fieldCargo={is2v2 ? state.fieldCargo : undefined}
            is2v2={is2v2}
          />
        ) : (
          self && (
            <div className="relative z-10 flex flex-col items-center gap-3">
              {is2v2 ? (
                <div className="flex flex-wrap justify-center gap-3">
                  {state.players
                    .filter((p) => p.teamId !== self.teamId)
                    .map((p) => (
                      <OpponentStatusCard key={p.id} player={p} />
                    ))}
                </div>
              ) : (
                opp &&
                (state.status === "playing" ? (
                  <OpponentStatusCard player={opp} />
                ) : (
                  <OpponentField player={opp} />
                ))
              )}
              <SelfField
                player={renderedSelf ?? self}
                events={events.filter(
                  (e) =>
                    e.ev.playerId === self.id ||
                    (is2v2 &&
                      state.players.some(
                        (p) => p.id === e.ev.playerId && p.teamId === self.teamId,
                      )),
                )}
                actionFlash={actionFlash}
                acting={acting}
                predictedDir={predictedDir}
                isSelf={true}
                cargo={
                  is2v2 ? state.fieldCargo?.filter((c) => c.teamId === self.teamId) : undefined
                }
                showMarket={is2v2}
                teammates={
                  is2v2
                    ? state.players.filter((p) => p.teamId === self.teamId && p.id !== self.id)
                    : undefined
                }
              />
            </div>
          )
        ))}

      {state.status === "ended" && (
        <EndOverlay
          winnerId={state.winnerId}
          winnerTeamId={state.winnerTeamId}
          reason={state.endedReason}
          selfId={selfId}
          players={state.players}
          teams={state.teams}
          recap={state.recap}
          onRematch={() => send({ t: "rematch" })}
          self={self}
          spectator={isSpectator}
          roomClosesAt={state.roomClosesAt}
        />
      )}

      {settingsOpen && state && (
        <SettingsModal
          settings={state.settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(settings) => {
            send({ t: "settings", settings });
            setSettingsOpen(false);
          }}
        />
      )}

      {state.status === "playing" &&
        self &&
        !isSpectator &&
        !puzzleDismissed &&
        isSellerPuzzleReady(self) && (
          <SellerPuzzleOverlay self={self} send={send} onClose={() => setPuzzleDismissed(true)} />
        )}

      {state.status === "playing" &&
        self &&
        !isSpectator &&
        bugHuntOpen &&
        isSellerBugReady(self) && (
          <BugCatchingOverlay self={self} send={send} onClose={() => setBugHuntOpen(false)} />
        )}

      {state.status === "playing" && self && !isSpectator && (
        <Toolbar
          self={self}
          send={send}
          marketPrices={state.marketPrices}
          cargo={state.fieldCargo}
          bugHuntReady={isSellerBugReady(self)}
          onBugHunt={() => {
            SFX.click();
            setBugHuntOpen(true);
          }}
        />
      )}
      {isSpectator &&
        state.status !== "crop_ban" &&
        state.status !== "crop_selection" &&
        state.status !== "prepare_countdown" && (
          <div className="mt-6 w-full flex justify-center">
            <CropIndexBook
              compact
              open={spectatorBookOpen}
              onOpenChange={setSpectatorBookOpen}
              marketPrices={state.marketPrices}
              selectedCropId={self?.seedChoice}
              availableCropIds={
                state.status === "playing" && self
                  ? selectedCropPool(self.selectedCrops)
                  : undefined
              }
              onSelectCrop={undefined}
            />
          </div>
        )}
      {state.status === "playing" && self && !isSpectator && (
        <MobileControls setMovement={setMovement} sendAction={sendAction} />
      )}
      {status !== "open" && (
        <ConnectionBanner text={lastError?.message ?? "กำลังเชื่อมต่อใหม่..."} />
      )}
      {lastError && status === "open" && <ConnectionBanner text={lastError.message} />}

      {!isSpectator && <MultiplayerControlsGuide />}
    </div>
  );
}

function PixelSproutIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      fill="none"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="3" y="4" width="2" height="4" fill="currentColor" />
      <rect x="1" y="3" width="2" height="2" fill="currentColor" />
      <rect x="2" y="2" width="2" height="2" fill="currentColor" />
      <rect x="5" y="2" width="2" height="2" fill="currentColor" />
      <rect x="4" y="1" width="2" height="2" fill="currentColor" />
      <rect x="3" y="1" width="1" height="2" fill="currentColor" />
    </svg>
  );
}

function PixelCartIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      fill="none"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="0" y="1" width="2" height="1" fill="currentColor" />
      <rect x="2" y="2" width="1" height="2" fill="currentColor" />
      <rect x="2" y="2" width="5" height="1" fill="currentColor" />
      <rect x="3" y="3" width="4" height="2" fill="currentColor" />
      <rect x="3" y="5" width="4" height="1" fill="currentColor" />
      <rect x="3" y="6" width="2" height="2" fill="currentColor" />
      <rect x="6" y="6" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function RoleBadge({ role }: { role: "farmer" | "seller" }) {
  const isSeller = role === "seller";
  return (
    <span
      className="font-pixel inline-flex items-center gap-1.5 px-2 py-1 text-[11px] leading-none"
      style={{
        background: "var(--gold)",
        color: "var(--background)",
        boxShadow:
          "0 0 0 2px var(--background), 0 0 0 4px var(--border), inset 0 -3px 0 0 rgba(0,0,0,.22), inset 0 2px 0 0 rgba(255,255,255,.24)",
        textShadow:
          "1px 0 0 var(--foreground), -1px 0 0 var(--foreground), 0 1px 0 var(--foreground), 0 -1px 0 var(--foreground)",
      }}
    >
      <span
        className="grid size-[14px] place-items-center"
        style={{
          background: isSeller ? "var(--accent)" : "var(--grass-2)",
          color: "var(--foreground)",
          boxShadow: "0 0 0 1px var(--background)",
          textShadow: "none",
        }}
      >
        {isSeller ? <PixelCartIcon size={10} /> : <PixelSproutIcon size={10} />}
      </span>
      <span>{isSeller ? "คนขาย" : "ชาวสวน"}</span>
    </span>
  );
}

function MultiplayerControlsGuide() {
  return (
    <div className="relative z-10 hidden w-full max-w-5xl sm:block">
      <div className="multi-guide pixel-panel px-5 py-4">
        <div className="multi-guide-head">
          <span className="font-pixel text-[8px] tracking-[2px] text-[var(--gold)]">
            คู่มือการแข่ง
          </span>
          <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
            แข่งทำคะแนน · เก็บเกี่ยวให้ไวกว่าอีกฝั่ง
          </span>
        </div>

        <div className="multi-guide-grid">
          <div className="multi-guide-move">
            <div className="grid grid-cols-3 grid-rows-2 gap-1">
              <span />
              <kbd className="pixel-key pixel-key-sm">W</kbd>
              <span />
              <kbd className="pixel-key pixel-key-sm">A</kbd>
              <kbd className="pixel-key pixel-key-sm">S</kbd>
              <kbd className="pixel-key pixel-key-sm">D</kbd>
            </div>
            <div>
              <div className="font-pixel text-[9px] tracking-wider">เดิน</div>
              <div className="font-pixel text-[7px] text-[var(--muted-foreground)]">
                ลูกศรก็ใช้ได้
              </div>
            </div>
          </div>

          <span className="multi-guide-rule" />

          <div className="multi-guide-actions">
            <GuideAction keys="SPACE" label="ใช้" sub="ลงมือกับช่องตรงหน้า" />
            <GuideAction keys="1 / 2 / 3" label="เครื่องมือ" sub="จอบ · น้ำ · เมล็ด" />
            <GuideAction keys="R" label="พร้อม" sub="พร้อมใน lobby / เลือกผัก" />
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideAction({ keys, label, sub }: { keys: string; label: string; sub: string }) {
  return (
    <div className="multi-guide-action">
      <kbd className="pixel-key pixel-key-guide">{keys}</kbd>
      <div className="min-w-0">
        <div className="font-pixel text-[9px] tracking-wider">{label}</div>
        <div className="font-pixel text-[7px] text-[var(--muted-foreground)] truncate">{sub}</div>
      </div>
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
    พ: "keyr",
    " ": "space",
    enter: "enter",
    arrowup: "arrowup",
    arrowdown: "arrowdown",
    arrowleft: "arrowleft",
    arrowright: "arrowright",
    "1": "digit1",
    "2": "digit2",
    "3": "digit3",
  };
  if (thaiFallback[key]) return thaiFallback[key];

  const code = e.code.toLowerCase();
  if (code && code !== "unidentified") return code;
  return key;
}

function keyToDir(k: string): Direction | null {
  if (k === "keyw" || k === "arrowup") return "up";
  if (k === "keys" || k === "arrowdown") return "down";
  if (k === "keya" || k === "arrowleft") return "left";
  if (k === "keyd" || k === "arrowright") return "right";
  return null;
}

function keysToDir(
  keys: Set<string>,
  nextDiagonalAxis: React.MutableRefObject<"vertical" | "horizontal">,
): Direction | null {
  const vertical =
    keys.has("keyw") || keys.has("arrowup")
      ? "up"
      : keys.has("keys") || keys.has("arrowdown")
        ? "down"
        : null;
  const horizontal =
    keys.has("keya") || keys.has("arrowleft")
      ? "left"
      : keys.has("keyd") || keys.has("arrowright")
        ? "right"
        : null;

  if (vertical && horizontal) {
    const dir = nextDiagonalAxis.current === "vertical" ? vertical : horizontal;
    nextDiagonalAxis.current = nextDiagonalAxis.current === "vertical" ? "horizontal" : "vertical";
    return dir;
  }

  return vertical ?? horizontal;
}

function CenterMsg({ main, sub }: { main: string; sub?: string }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-3">
      <div className="sky-stars" />
      <div className="font-pixel text-[18px] text-[var(--gold)]">{main}</div>
      {sub && <div className="font-pixel text-[10px] text-[var(--muted-foreground)]">{sub}</div>}
    </div>
  );
}

function ConnectionBanner({ text }: { text: string }) {
  return (
    <div className="fixed top-4 left-1/2 z-40 -translate-x-1/2 pixel-chip font-pixel text-[9px] text-[var(--gold)]">
      {text}
    </div>
  );
}

function MatchHUD({
  code,
  self,
  opp,
  state,
  settings,
  selfTeam,
  teams,
  status,
  role,
  combo,
  outfit,
}: {
  code: string;
  self?: PublicPlayer;
  opp?: PublicPlayer;
  state: {
    status: string;
    endsAt?: number;
    countdownEndsAt?: number;
    banEndsAt?: number;
    selectionEndsAt?: number;
    spectatorCount?: number;
  };
  settings: RoomSettings;
  selfTeam?: MatchTeam;
  teams?: MatchTeam[];
  status: string;
  role: MatchRole;
  combo: number;
  outfit?: {
    open: boolean;
    cosmetics: PlayerCosmetics;
    onToggle: () => void;
    onClose: () => void;
    onChange: (next: PlayerCosmetics) => void;
  };
}) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [copyToast, setCopyToast] = useState<"ok" | "fail" | null>(null);
  useEffect(() => {
    if (
      !["playing", "countdown", "crop_ban", "crop_selection", "prepare_countdown"].includes(
        state.status,
      )
    )
      return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [state.status]);
  const copyRoom = async () => {
    SFX.click();
    try {
      await navigator.clipboard.writeText(code);
      setCopied("ok");
      setCopyToast("ok");
    } catch {
      setCopied("fail");
      setCopyToast("fail");
    }
    setTimeout(() => setCopied("idle"), 1200);
    setTimeout(() => setCopyToast(null), 1800);
  };
  const timerEndsAt =
    state.status === "playing"
      ? state.endsAt
      : state.status === "crop_ban"
        ? state.banEndsAt
        : state.status === "crop_selection"
          ? state.selectionEndsAt
          : state.countdownEndsAt;
  const remaining = timerEndsAt ? Math.max(0, timerEndsAt - now) : settings.durationMs;
  const spectatorCount = Math.max(0, state.spectatorCount ?? 0);
  const mm = Math.floor(remaining / 60000)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <>
      {copyToast && (
        <div
          className="fixed top-4 left-1/2 z-50 -translate-x-1/2 pixel-chip font-pixel text-[9px] text-gold"
          style={{ animation: "float-up 1.8s ease-out forwards" }}
        >
          {copyToast === "ok" ? `คัดลอกรหัส ${code} แล้ว` : "คัดลอกรหัสไม่สำเร็จ"}
        </div>
      )}
      <header className="relative z-20 w-full max-w-5xl pixel-panel px-6 py-3">
        <div className="grid items-center gap-4 lg:grid-cols-[auto_minmax(260px,1fr)_auto]">
          <button
            onClick={copyRoom}
            className="flex items-center gap-3 text-left transition-transform active:translate-y-[1px]"
            title="คัดลอกรหัสห้อง"
          >
            <span className="font-pixel text-[10px] text-[var(--muted-foreground)]">ห้อง</span>
            <span className="font-pixel text-[18px] text-[var(--gold)] tracking-[4px]">{code}</span>
            <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
              {copied === "ok"
                ? "คัดลอกแล้ว"
                : copied === "fail"
                  ? "คัดลอกไม่สำเร็จ"
                  : "คัดลอกรหัส"}
            </span>
          </button>

          <div className="flex min-w-0 items-center gap-4">
            {settings.mode === "2v2" && teams?.length ? (
              <>
                <TeamBar
                  team={teams[0]}
                  active={selfTeam?.id === teams[0]?.id}
                  targetCoins={settings.targetCoins}
                />
                <span className="font-pixel text-[12px] text-[var(--muted-foreground)]">VS</span>
                <TeamBar
                  team={teams[1]}
                  active={selfTeam?.id === teams[1]?.id}
                  targetCoins={settings.targetCoins}
                />
              </>
            ) : (
              <>
                <PlayerBar player={self} side="left" targetCoins={settings.targetCoins} />
                <span className="font-pixel text-[12px] text-[var(--muted-foreground)]">VS</span>
                <PlayerBar player={opp} side="right" targetCoins={settings.targetCoins} />
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-4">
            {combo >= 2 && state.status === "playing" && (
              <div className="relative flex flex-col items-end gap-1">
                <div
                  className="font-pixel text-[10px]"
                  style={{
                    color: combo >= 5 ? "#ff6b6b" : "#ffd24a",
                    textShadow: "1px 1px 0 #000",
                  }}
                >
                  COMBO x{combo}
                </div>
                <div
                  style={{
                    width: 60,
                    height: 5,
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
                      animationDuration: "2200ms",
                    }}
                  />
                </div>
              </div>
            )}
            {role !== "spectator" && (
              <span
                className="pixel-chip flex items-center gap-1.5 font-pixel text-[8px]"
                data-gold={spectatorCount > 0 ? "true" : undefined}
                title="จำนวนผู้ชมปัจจุบัน"
              >
                <EyeIcon size={13} />
                {spectatorCount} ชม
              </span>
            )}
            <div className="flex flex-col items-end gap-1">
              <div className="font-pixel text-[16px] text-[var(--gold)]">
                {mm}:{ss}
              </div>
              <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">
                {status !== "open"
                  ? "กำลังเชื่อมต่อใหม่"
                  : role === "spectator"
                    ? `ผู้ตัดสิน · ${state.status.toUpperCase()}`
                    : state.status.toUpperCase()}
              </div>
            </div>
            {outfit && <HeaderOutfitMenu outfit={outfit} />}
          </div>
        </div>
      </header>
    </>
  );
}

function HeaderOutfitMenu({
  outfit,
}: {
  outfit: {
    open: boolean;
    cosmetics: PlayerCosmetics;
    onToggle: () => void;
    onClose: () => void;
    onChange: (next: PlayerCosmetics) => void;
  };
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={outfit.onToggle}
        className="pixel-btn flex h-[34px] items-center px-2"
        aria-expanded={outfit.open}
      >
        <span className="font-pixel text-[8px]">OUTFIT</span>
      </button>
      {outfit.open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] w-[280px] max-w-[calc(100vw-2rem)]">
          <CosmeticPicker
            value={outfit.cosmetics}
            onChange={outfit.onChange}
            onClose={outfit.onClose}
          />
        </div>
      )}
    </div>
  );
}

function TeamBar({
  team,
  active,
  targetCoins,
}: {
  team?: MatchTeam;
  active?: boolean;
  targetCoins: number;
}) {
  const pct = team ? Math.min(100, (team.coins / targetCoins) * 100) : 0;
  const teamColor = team?.id === "A" ? "#7fd8ff" : "#ff8fb1";
  const won = pct >= 100;
  return (
    <div
      className="flex-1 flex flex-col gap-1.5 px-2 py-1.5"
      style={
        active
          ? {
              background: "rgba(255,210,74,.07)",
              boxShadow: "0 0 0 2px var(--gold), 0 0 12px rgba(255,210,74,.35)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        {/* Team-color pixel dot — square, ink-outlined */}
        <span
          className="inline-block size-[10px] shrink-0"
          style={{ background: teamColor, boxShadow: "0 0 0 2px #1a0f1f" }}
        />
        <span className="font-pixel text-[10px] truncate">{team?.name ?? "รอทีม..."}</span>
        {active && (
          <span
            className="pixel-chip font-pixel text-[7px] whitespace-nowrap shrink-0"
            data-gold="true"
          >
            ทีมคุณ
          </span>
        )}
        {team && (
          <span className="ml-auto flex items-center gap-1 whitespace-nowrap font-pixel text-[10px] text-[var(--gold)]">
            <CoinIcon size={12} />
            {team.coins}/{targetCoins}
          </span>
        )}
      </div>
      <div className="w-full h-[8px] bg-[#1a0f1f]" style={{ border: "2px solid #1a0f1f" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: won ? "#ffd24a" : teamColor,
            transition: "width 0.2s ease-out",
          }}
        />
      </div>
    </div>
  );
}

function PlayerBar({
  player,
  side,
  targetCoins,
}: {
  player?: PublicPlayer;
  side: "left" | "right";
  targetCoins: number;
}) {
  const pct = player ? Math.min(100, (player.coins / targetCoins) * 100) : 0;
  return (
    <div className={`flex-1 flex flex-col gap-1 ${side === "right" ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-2">
        <span className="font-pixel text-[10px]">{player?.name ?? "รออยู่..."}</span>
        {player && (
          <span className="font-pixel text-[10px] text-[var(--gold)] flex items-center gap-1">
            <CoinIcon size={12} />
            {player.coins}/{targetCoins}
          </span>
        )}
        {player && !player.connected && (
          <span className="font-pixel text-[8px]" style={{ color: "#ff6b6b" }}>
            กำลังเชื่อมต่อใหม่
          </span>
        )}
      </div>
      <div className="w-full h-[8px] bg-[#1a0f1f]" style={{ border: "2px solid #1a0f1f" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct >= 100 ? "#ffd24a" : side === "left" ? "#7fd8ff" : "#ff8fb1",
            transition: "width 0.2s ease-out",
          }}
        />
      </div>
    </div>
  );
}

function LobbyView({
  self,
  opp,
  state,
  isHost,
  onReady,
  onStart,
  onLeaveSlot,
  onOpenSettings,
  onKick,
  onAddBot,
  onRemoveBot,
  onChooseTeamRole,
}: {
  self?: PublicPlayer;
  opp?: PublicPlayer;
  state: PublicMatchState;
  isHost: boolean;
  onReady: () => void;
  onStart: () => void;
  onLeaveSlot: () => void;
  onOpenSettings: () => void;
  onKick: (playerId: string) => void;
  onAddBot: () => void;
  onRemoveBot: (playerId: string) => void;
  onChooseTeamRole: (teamId: TeamId, role: PlayerRole) => void;
}) {
  const is2v2 = state.settings.mode === "2v2";
  const waitingForOpponent = is2v2 ? state.players.length < state.settings.maxPlayers : !opp;
  const hasOpenSlot = state.players.length < state.settings.maxPlayers;
  const canAddBot = isHost && state.status === "lobby" && (is2v2 ? hasOpenSlot : !opp);
  const oppBotId = opp?.isBot ? opp.id : undefined;
  const readyCount = is2v2
    ? state.players.filter((p) => p.ready).length
    : [self, opp].filter((p) => p?.ready).length;
  const allReady = readyCount === state.settings.maxPlayers && !waitingForOpponent;
  const settings = state.settings ?? DEFAULT_ROOM_SETTINGS;
  return (
    <section className="lobby-stage relative z-10 w-full max-w-5xl">
      <div className="lobby-orbit" />
      <div className="lobby-spark-field">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="lobby-star"
            style={{
              left: `${5 + ((i * 23) % 90)}%`,
              top: `${8 + ((i * 31) % 82)}%`,
              animationDelay: `${i * 0.22}s`,
            }}
          />
        ))}
      </div>

      <div className="lobby-title-card pixel-panel">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-pixel text-[8px] tracking-[3px] text-[var(--muted-foreground)]">
            ล็อบบี้ห้องแข่ง
          </span>
          {isHost && (
            <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
              เจ้าของห้อง
            </span>
          )}
        </div>
        <h2 className="font-pixel lobby-title">THAI GARDEN DUEL</h2>
        <p className="lobby-subtitle">
          {waitingForOpponent
            ? "ส่งลิงก์ให้เพื่อน แล้วตั้งกติกาห้องก่อนเริ่ม"
            : allReady
              ? "ทุกคนพร้อมแล้ว · กำลังนับถอยหลัง"
              : `พร้อมแล้ว ${readyCount}/${settings.maxPlayers} · กด พร้อม เพื่อเข้ารอบ`}
        </p>
      </div>

      <RoomSettingsSummary settings={settings} isHost={isHost} onOpenSettings={onOpenSettings} />

      {state.settings.mode === "2v2" ? (
        <TeamSlots
          players={state.players}
          selfId={self?.id}
          hostId={state.hostId}
          isHost={isHost && state.status === "lobby"}
          canManage={isHost && state.status === "lobby"}
          canChoose={state.status === "lobby" && !state.players.some((p) => p.ready)}
          onKick={onKick}
          onRemoveBot={onRemoveBot}
          onChooseTeamRole={onChooseTeamRole}
        />
      ) : (
        <div className="lobby-versus-grid">
          <PlayerCard player={self} label="คุณ" side="left" hostId={state.hostId} />
          <div className="lobby-vs-core" aria-hidden>
            <span>VS</span>
          </div>
          <PlayerCard
            player={opp}
            label="คู่แข่ง"
            side="right"
            hostId={state.hostId}
            canKick={isHost && Boolean(opp)}
            onKick={(id) => (oppBotId ? onRemoveBot(id) : onKick(id))}
            kickLabel={oppBotId ? "ลบบอท" : "เตะ"}
          />
        </div>
      )}

      <div className="lobby-ready-row">
        <div className="lobby-ruleline" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => {
              SFX.click();
              onReady();
            }}
            className="pixel-btn lobby-ready-btn"
            data-accent={self?.ready ? undefined : "true"}
          >
            <span className="font-pixel text-[12px]">{self?.ready ? "ยกเลิกพร้อม" : "พร้อม"}</span>
            <span className="font-pixel text-[8px] opacity-70">R</span>
          </button>
          {canAddBot && (
            <button
              onClick={() => {
                SFX.click();
                onAddBot();
              }}
              className="pixel-btn lobby-ready-btn"
            >
              <span className="font-pixel text-[12px]">เพิ่มบอท</span>
              <span className="font-pixel text-[8px] opacity-70">เจ้าของห้อง</span>
            </button>
          )}
          {isHost && state.players.length === state.settings.maxPlayers && (
            <button
              onClick={() => {
                SFX.click();
                onStart();
              }}
              className="pixel-btn lobby-ready-btn"
              data-accent="true"
            >
              <span className="font-pixel text-[12px]">เริ่ม</span>
              <span className="font-pixel text-[8px] opacity-70">เจ้าของห้อง</span>
            </button>
          )}
          <button
            onClick={() => {
              SFX.click();
              onLeaveSlot();
            }}
            className="pixel-btn"
          >
            <span className="font-pixel text-[10px]">ออกจากสล็อต</span>
          </button>
        </div>
        <div className="lobby-ruleline" />
      </div>
    </section>
  );
}

function CropBanView({
  state,
  self,
  isSpectator,
  onBanCrop,
  onReady,
}: {
  state: PublicMatchState;
  self?: PublicPlayer;
  isSpectator: boolean;
  onBanCrop: (id: CropId) => void;
  onReady: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.banEndsAt) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [state.banEndsAt]);

  const remaining = state.banEndsAt ? Math.max(0, state.banEndsAt - now) : 0;
  const ss = Math.ceil(remaining / 1000)
    .toString()
    .padStart(2, "0");

  const activePlayer = state.players.find((p) => p.id === state.banTurnPlayerId);
  const isMyTurn = !isSpectator && self?.id === state.banTurnPlayerId;

  return (
    <section className="lobby-stage relative z-10 w-full max-w-5xl">
      <div className="lobby-title-card pixel-panel">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-pixel text-[8px] tracking-[3px] text-[var(--muted-foreground)]">
            แบนผัก
          </span>
          <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
            00:{ss}
          </span>
        </div>
        <h2 className="font-pixel lobby-title">แบนผัก 1 อย่าง</h2>
        <p className="lobby-subtitle">
          {isSpectator ? (
            `รอ ${activePlayer?.name ?? "คู้แข่ง"} แบนพืช...`
          ) : isMyTurn ? (
            <span className="text-[#86efac] font-bold">ตาของคุณในการแบน</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">รออีกฝ่ายแบนพืช...</span>
          )}
        </p>
      </div>

      {isSpectator && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
          {state.players.map((player, idx) => {
            const crop = player.bannedCrop ? CROPS[player.bannedCrop] : null;
            const Icon = crop ? CROP_ICONS[crop.id] : null;
            return (
              <div
                key={player.id}
                className="pixel-panel p-4 flex flex-col items-center justify-center gap-2"
                data-ready={player.ready ? "true" : undefined}
                style={{ background: player.ready ? "rgba(255, 210, 74, 0.08)" : undefined }}
              >
                <div className="font-pixel text-[10px] text-[var(--muted-foreground)]">
                  ผู้เล่น {idx + 1}: <span className="text-white">{player.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 min-h-[44px]">
                  {crop && Icon ? (
                    <>
                      <Icon size={24} />
                      <div className="font-pixel text-[14px] text-[var(--gold)]">
                        แบน {crop.name}
                      </div>
                    </>
                  ) : (
                    <div className="font-pixel text-[11px] text-[var(--muted-foreground)] animate-pulse">
                      กำลังเลือก...
                    </div>
                  )}
                </div>
                <div className="font-pixel text-[8px] mt-1">
                  {player.ready ? (
                    <span className="text-[#86efac]">ยืนยันแล้ว [LOCKED]</span>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">กำลังเลือก</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pixel-panel my-4 grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-4">
        {(Object.values(CROPS) as Array<(typeof CROPS)[CropId]>).map((crop) => {
          const Icon = CROP_ICONS[crop.id];
          const active = self?.bannedCrop === crop.id;
          const isBannedByOther = state.players.some(
            (p) => p.id !== self?.id && p.ready && p.bannedCrop === crop.id,
          );
          const disabled = isSpectator || self?.ready || isBannedByOther || !isMyTurn;
          return (
            <button
              key={crop.id}
              type="button"
              onClick={() => {
                if (disabled) return;
                SFX.click();
                onBanCrop(crop.id);
              }}
              disabled={disabled}
              className="farm-crop-card pixel-btn text-left"
              data-active={active ? "true" : undefined}
              title={`แบน ${crop.name}`}
              style={
                isBannedByOther
                  ? { opacity: 0.4, filter: "grayscale(100%)", cursor: "not-allowed" }
                  : !isMyTurn
                    ? { opacity: 0.5, filter: "grayscale(50%)", cursor: "not-allowed" }
                    : undefined
              }
            >
              <span className="farm-crop-icon">
                <Icon size={26} />
              </span>
              <span className="farm-crop-body">
                <span className="farm-crop-name">{crop.name}</span>
                {isBannedByOther && (
                  <span className="font-pixel text-[7px] text-[#ff6b6b] block">แบนแล้ว</span>
                )}
                <span className="farm-crop-prices">
                  <span>ซื้อ {crop.seedCost}</span>
                  <span>ขาย {crop.sellPrice}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {self?.bannedCrop && !isSpectator && (
        <div className="flex justify-center my-4">
          <button
            type="button"
            onClick={() => {
              if (self.ready || !isMyTurn) return;
              SFX.click();
              onReady();
            }}
            disabled={self.ready || !isMyTurn}
            className="pixel-btn lobby-ready-btn w-full max-w-xs"
            data-accent={self.ready || !isMyTurn ? undefined : "true"}
          >
            <span className="font-pixel text-[12px]">
              {!isMyTurn
                ? "รออีกฝ่ายแบนพืช..."
                : self.ready
                  ? "พร้อม (ยืนยันแล้ว)"
                  : "ยืนยันการแบน (Confirm Ban)"}
            </span>
          </button>
        </div>
      )}

      <div className="pixel-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {state.players.map((player) => {
            const isPlayerTurn = state.banTurnPlayerId === player.id;
            return (
              <span
                key={player.id}
                className="pixel-chip font-pixel text-[8px]"
                data-gold={player.ready ? "true" : undefined}
                style={
                  isPlayerTurn && !player.ready ? { border: "1px solid var(--gold)" } : undefined
                }
              >
                {player.name}:{" "}
                {player.bannedCrop ? `แบน ${CROPS[player.bannedCrop].name}` : "ยังไม่เลือก"}
                {player.ready ? " [พร้อม]" : isPlayerTurn ? " [กำลังแบน]" : " [รอแบน]"}
              </span>
            );
          })}
        </div>
        <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
          แบนพืชทีละเทิร์น สลับกันแบนเพื่อความสมดุล
        </span>
      </div>
    </section>
  );
}

function CropSelectionView({
  state,
  self,
  isSpectator,
  isLocked,
  bannedCrops,
  onSelectCrops,
  onReady,
}: {
  state: PublicMatchState;
  self?: PublicPlayer;
  isSpectator: boolean;
  isLocked: boolean;
  bannedCrops: CropId[];
  onSelectCrops: (ids: CropId[]) => void;
  onReady: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.selectionEndsAt) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [state.selectionEndsAt]);

  const selected = (self?.selectedCrops ?? []).filter((id) => !bannedCrops.includes(id));
  const remaining = state.selectionEndsAt ? Math.max(0, state.selectionEndsAt - now) : 0;
  const mm = Math.floor(remaining / 60000)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  const is2v2Seller = state.settings.mode === "2v2" && self?.role === "seller";

  const toggleCrop = (id: CropId) => {
    if (isSpectator || isLocked || !self || is2v2Seller) return;
    if (bannedCrops.includes(id)) {
      SFX.bad();
      return;
    }
    const exists = selected.includes(id);
    const next = exists ? selected.filter((cropId) => cropId !== id) : [...selected, id];
    if (next.length > SELECTED_CROP_COUNT) {
      SFX.bad();
      return;
    }
    SFX.click();
    onSelectCrops(next);
  };

  return (
    <section className="lobby-stage relative z-10 w-full max-w-5xl">
      <div className="lobby-title-card pixel-panel">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-pixel text-[8px] tracking-[3px] text-[var(--muted-foreground)]">
            {isLocked ? "ล็อกผักแล้ว" : "เลือกผัก"}
          </span>
          <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
            {isLocked ? "เตรียมเริ่มเกม" : `${mm}:${ss}`}
          </span>
        </div>
        <h2 className="font-pixel lobby-title">
          {is2v2Seller ? "รอชาวสวนเลือกผัก" : "เลือกผัก 4 อย่าง"}
        </h2>
        <p className="lobby-subtitle">
          {isLocked
            ? "ล็อกผักแล้ว · เตรียมตัว 3, 2, 1"
            : is2v2Seller
              ? "คนขายพร้อมอัตโนมัติ · รอชาวสวนเลือกผักได้เลย"
              : `เลือกของตัวเอง ${selected.length}/${SELECTED_CROP_COUNT} แล้วกด พร้อม`}
        </p>
      </div>

      <div className="pixel-panel my-4 flex flex-col gap-3 px-4 py-4">
        {isSpectator ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {state.players.map((player, idx) => {
              const pSelected = player.selectedCrops.filter((id) => !bannedCrops.includes(id));
              return (
                <div
                  key={player.id}
                  className="pixel-panel p-4 flex flex-col gap-2"
                  data-ready={player.ready ? "true" : undefined}
                  style={{ background: player.ready ? "rgba(255, 210, 74, 0.08)" : undefined }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-pixel text-[10px] text-[var(--gold)]">
                      ผู้เล่น {idx + 1}: {player.name}
                    </span>
                    <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
                      {player.ready ? "พร้อม (ล็อก)" : "กำลังเลือก"}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: SELECTED_CROP_COUNT }).map((_, index) => {
                      const cropId = pSelected[index];
                      const crop = cropId ? CROPS[cropId] : undefined;
                      const Icon = crop ? CROP_ICONS[crop.id] : undefined;
                      return (
                        <div
                          key={index}
                          className="pixel-chip flex min-h-[50px] flex-col items-center justify-center gap-1 p-2 font-pixel text-[7px]"
                          data-gold={crop ? "true" : undefined}
                        >
                          {crop && Icon ? (
                            <>
                              <Icon size={18} />
                              <span className="text-center truncate w-full">{crop.name}</span>
                            </>
                          ) : (
                            <span className="text-[var(--muted-foreground)]">ว่าง</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : is2v2Seller ? (
          <div className="pixel-panel flex flex-col items-center gap-3 px-4 py-6 text-center">
            <RoleBadge role="seller" />
            <span className="font-pixel text-[10px] text-[var(--gold)]">
              หน้าที่คุณคือวิ่งส่งของไปตลาด ไม่ต้องปลูกผัก
            </span>
            <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
              พร้อมอัตโนมัติแล้ว · รอชาวสวนเลือกผัก
            </span>
          </div>
        ) : (
          <div>
            <div className="mb-2 font-pixel text-[8px] tracking-[2px] text-[var(--gold)]">
              ตะกร้าผักของคุณ · กด X หรือกดผักซ้ำเพื่อเอาออก
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {Array.from({ length: SELECTED_CROP_COUNT }).map((_, index) => {
                const cropId = selected[index];
                const crop = cropId ? CROPS[cropId] : undefined;
                const Icon = crop ? CROP_ICONS[crop.id] : undefined;
                return (
                  <div
                    key={index}
                    className="pixel-chip flex min-h-[54px] items-center justify-between gap-2 px-3 py-2 font-pixel text-[8px]"
                    data-gold={crop ? "true" : undefined}
                  >
                    {crop && Icon ? (
                      <>
                        <span className="flex items-center gap-2">
                          <Icon size={22} />
                          {crop.name}
                        </span>
                        {!isLocked && !isSpectator && (
                          <button
                            type="button"
                            onClick={() => toggleCrop(crop.id)}
                            className="pixel-btn px-2 py-1"
                            aria-label={`เอา ${crop.name} ออกจากตะกร้า`}
                          >
                            <span className="font-pixel text-[8px]">X</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">ช่องว่าง {index + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {(Object.values(CROPS) as Array<(typeof CROPS)[CropId]>).map((crop) => {
            const Icon = CROP_ICONS[crop.id];
            const active = selected.includes(crop.id);
            const banned = bannedCrops.includes(crop.id);
            return (
              <button
                key={crop.id}
                type="button"
                onClick={() => toggleCrop(crop.id)}
                disabled={isSpectator || isLocked || banned || is2v2Seller}
                className="farm-crop-card pixel-btn text-left"
                data-active={active ? "true" : undefined}
                title={`${crop.name} · ซื้อ ${crop.seedCost} · ขาย ${crop.sellPrice}`}
              >
                <span className="farm-crop-icon">
                  <Icon size={26} />
                </span>
                <span className="farm-crop-body">
                  <span className="farm-crop-name">{crop.name}</span>
                  {banned && <span className="font-pixel text-[7px] text-[#ff6b6b]">แบน</span>}
                  <span className="farm-crop-prices">
                    <span>ซื้อ {crop.seedCost}</span>
                    <span>ขาย {crop.sellPrice}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pixel-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {state.players.map((player) => (
            <span
              key={player.id}
              className="pixel-chip font-pixel text-[8px]"
              data-gold={player.ready ? "true" : undefined}
            >
              {player.name}:{" "}
              {state.settings.mode === "2v2" && player.role === "seller"
                ? "คนขาย"
                : `${player.selectedCrops.length}/${SELECTED_CROP_COUNT}`}{" "}
              {player.ready
                ? "พร้อม"
                : state.settings.mode === "2v2" && player.role === "seller"
                  ? "รอพร้อม"
                  : "กำลังเลือก"}
            </span>
          ))}
        </div>
        {!isSpectator && !isLocked && !is2v2Seller && (
          <button
            type="button"
            onClick={() => {
              SFX.click();
              onReady();
            }}
            className="pixel-btn lobby-ready-btn"
            data-accent={self?.ready ? undefined : "true"}
            disabled={selected.length !== SELECTED_CROP_COUNT}
          >
            <span className="font-pixel text-[12px]">{self?.ready ? "ยกเลิกพร้อม" : "พร้อม"}</span>
            <span className="font-pixel text-[8px] opacity-70">R</span>
          </button>
        )}
      </div>
    </section>
  );
}

function bannedCropIds(players: PublicPlayer[]): CropId[] {
  const banned: CropId[] = [];
  for (const player of players) {
    if (player.bannedCrop && !banned.includes(player.bannedCrop)) banned.push(player.bannedCrop);
  }
  return banned;
}

function RoomSettingsSummary({
  settings,
  isHost,
  onOpenSettings,
}: {
  settings: RoomSettings;
  isHost: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <div className="pixel-panel relative z-10 my-4 flex flex-wrap items-center justify-center gap-3 px-4 py-3">
      <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
        {STAGE_COPY[settings.stage].label}
      </span>
      <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
        เป้าหมาย {settings.targetCoins}
      </span>
      <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
        เวลา {Math.round(settings.durationMs / 60000)} นาที
      </span>
      <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
        สล็อต {settings.maxPlayers}
      </span>
      {isHost ? (
        <button
          onClick={() => {
            SFX.click();
            onOpenSettings();
          }}
          className="pixel-btn px-3 py-2"
        >
          <span className="font-pixel text-[8px]">ตั้งค่า</span>
        </button>
      ) : (
        <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
          ตั้งค่าเจ้าของห้อง
        </span>
      )}
    </div>
  );
}

function TeamSlots({
  players,
  selfId,
  hostId,
  isHost,
  canManage = false,
  canChoose = false,
  onKick,
  onRemoveBot,
  onChooseTeamRole,
}: {
  players: PublicPlayer[];
  selfId?: string;
  hostId?: string;
  isHost: boolean;
  canManage?: boolean;
  canChoose?: boolean;
  onKick?: (playerId: string) => void;
  onRemoveBot?: (playerId: string) => void;
  onChooseTeamRole?: (teamId: TeamId, role: PlayerRole) => void;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
      <TeamSlotColumn
        title="TEAM A"
        teamId="A"
        players={players}
        selfId={selfId}
        side="left"
        hostId={hostId}
        isHost={isHost}
        canManage={canManage}
        canChoose={canChoose}
        onKick={onKick}
        onRemoveBot={onRemoveBot}
        onChooseTeamRole={onChooseTeamRole}
      />
      <div className="lobby-vs-core self-center justify-self-center" aria-hidden>
        <span>VS</span>
      </div>
      <TeamSlotColumn
        title="TEAM B"
        teamId="B"
        players={players}
        selfId={selfId}
        side="right"
        hostId={hostId}
        isHost={isHost}
        canManage={canManage}
        canChoose={canChoose}
        onKick={onKick}
        onRemoveBot={onRemoveBot}
        onChooseTeamRole={onChooseTeamRole}
      />
    </div>
  );
}

function TeamSlotColumn({
  title,
  teamId,
  players,
  selfId,
  side,
  hostId,
  isHost,
  canManage = false,
  canChoose = false,
  onKick,
  onRemoveBot,
  onChooseTeamRole,
}: {
  title: string;
  teamId: TeamId;
  players: PublicPlayer[];
  selfId?: string;
  side: "left" | "right";
  hostId?: string;
  isHost: boolean;
  canManage?: boolean;
  canChoose?: boolean;
  onKick?: (playerId: string) => void;
  onRemoveBot?: (playerId: string) => void;
  onChooseTeamRole?: (teamId: TeamId, role: PlayerRole) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="pixel-chip text-center font-pixel text-[9px]" data-gold="true">
        {title}
      </div>
      {(["farmer", "seller"] as const).map((role) => {
        const player = players.find((p) => p.teamId === teamId && p.role === role);
        const isBot = Boolean(player?.isBot);
        const isSelf = player?.id === selfId;
        // Real players are kickable only by a host who owns the room (isHost).
        // Bots are removable by anyone with room-management rights (canManage),
        // which includes a spectator-host who added them.
        const kickable = Boolean(player) && (isBot ? canManage || isHost : isHost);
        const handler = isBot ? onRemoveBot : onKick;
        const canPickSlot = canChoose && !isSelf && (!player || isBot) && Boolean(onChooseTeamRole);
        return (
          <PlayerCard
            key={`${teamId}-${role}`}
            player={player}
            label={<RoleBadge role={role} />}
            side={side}
            hostId={hostId}
            canKick={kickable && Boolean(handler)}
            onKick={handler}
            kickLabel={isBot ? "ลบบอท" : "เตะ"}
            chooseLabel={player?.isBot ? "แทนที่บอท" : "เลือกสล็อตนี้"}
            canChoose={canPickSlot}
            onChoose={() => onChooseTeamRole?.(teamId, role)}
            isSelfSlot={isSelf}
          />
        );
      })}
    </div>
  );
}

function PlayerCard({
  player,
  label,
  side = "left",
  hostId,
  canKick = false,
  onKick,
  kickLabel = "เตะ",
  canChoose = false,
  onChoose,
  chooseLabel = "เลือกสล็อตนี้",
  isSelfSlot = false,
}: {
  player?: PublicPlayer;
  label: ReactNode;
  side?: "left" | "right";
  hostId?: string;
  canKick?: boolean;
  onKick?: (playerId: string) => void;
  kickLabel?: string;
  canChoose?: boolean;
  onChoose?: () => void;
  chooseLabel?: string;
  isSelfSlot?: boolean;
}) {
  const ready = Boolean(player?.ready);
  return (
    <article
      className="lobby-player-card pixel-panel"
      data-ready={ready ? "true" : undefined}
      data-side={side}
    >
      <div className="lobby-player-sheen" />
      <div className="lobby-player-topline">
        {label}
        <div className="flex items-center gap-2">
          {player?.isBot && (
            <span className="font-pixel text-[7px] text-[var(--muted-foreground)]">บอท</span>
          )}
          {player?.id === hostId && (
            <span className="font-pixel text-[7px] text-[var(--gold)]">เจ้าของห้อง</span>
          )}
          <span className="lobby-status-dot" data-ready={ready ? "true" : undefined} />
        </div>
      </div>
      <div className="lobby-avatar-wrap">
        <div className="lobby-avatar-ground" />
        {player ? (
          <div className="lobby-avatar-sprite">
            <PixelFarmer
              direction={side === "left" ? "right" : "left"}
              walking={false}
              walkFrame={0}
              acting={ready}
              tool={player.tool}
              cosmetics={player.cosmetics}
            />
          </div>
        ) : (
          <div className="lobby-empty-slot">
            <span className="font-pixel">?</span>
          </div>
        )}
      </div>
      <div className="lobby-player-name font-pixel">{player?.name ?? "สล็อตว่าง"}</div>
      <div className="lobby-player-meta font-pixel" data-ready={ready ? "true" : undefined}>
        {isSelfSlot ? "สล็อตคุณ" : player ? (ready ? "พร้อมแล้ว" : "รออยู่") : "เชิญเพื่อน"}
      </div>
      {canChoose && (
        <button
          onClick={() => {
            SFX.click();
            onChoose?.();
          }}
          className="pixel-btn mt-3 px-3 py-2"
        >
          <span className="font-pixel text-[8px]">{chooseLabel}</span>
        </button>
      )}
      {canKick && player && (
        <button
          onClick={() => {
            SFX.click();
            onKick?.(player.id);
          }}
          className="pixel-btn mt-3 px-3 py-2"
          data-accent="true"
        >
          <span className="font-pixel text-[8px]">{kickLabel}</span>
        </button>
      )}
    </article>
  );
}

function SettingsModal({
  settings,
  onClose,
  onSave,
}: {
  settings: RoomSettings;
  onClose: () => void;
  onSave: (settings: RoomSettings) => void;
}) {
  const [draft, setDraft] = useState<RoomSettings>(settings);
  const setMode = (mode: RoomSettings["mode"]) => {
    setDraft((current) => ({
      ...current,
      mode,
      maxPlayers: mode === "2v2" ? 4 : 2,
      targetCoins: mode === "2v2" ? 800 : 500,
    }));
  };
  const setNumber = (
    key: "targetCoins" | "durationMs",
    value: number,
    limits: { min: number; max: number },
  ) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(value)));
    setDraft((current) => ({ ...current, [key]: clamped }));
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ background: "rgba(10,5,15,0.82)" }}
    >
      <div
        className="pixel-panel w-full max-w-2xl p-6 flex flex-col gap-5"
        style={{ background: "#3a2148" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-pixel text-[10px] tracking-[3px] text-[#d9c6ef]">
              ตั้งค่าเจ้าของห้อง
            </div>
            <h3 className="font-pixel text-[34px] text-[var(--gold)] mt-2 leading-relaxed">
              ตั้งค่าห้อง
            </h3>
          </div>
          <button
            onClick={() => {
              SFX.click();
              onClose();
            }}
            className="pixel-btn px-4 py-3"
          >
            <span className="font-pixel text-[10px]">ปิด</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["1v1", "2v2"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                SFX.click();
                setMode(mode);
              }}
              className="pixel-panel p-4 text-left transition-transform active:translate-y-[1px]"
              data-ready={draft.mode === mode ? "true" : undefined}
              style={{ background: draft.mode === mode ? "#4a2b58" : "#2b1836" }}
            >
              <div className="font-pixel text-[12px] text-[var(--gold)] leading-relaxed">
                {mode === "2v2" ? "2v2" : "1v1"}
              </div>
              <div className="font-pixel text-[13px] text-[#fff1d6] mt-3 leading-[1.8]">
                {mode === "2v2" ? "ทีม 4 คน · ชาวสวน + คนขาย" : "ดวล 2 คนแบบเดิม"}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(Object.keys(STAGE_COPY) as RoomStage[]).map((stage) => (
            <button
              key={stage}
              onClick={() => {
                SFX.click();
                setDraft((current) => ({ ...current, stage }));
              }}
              className="pixel-panel p-4 text-left transition-transform active:translate-y-[1px]"
              data-ready={draft.stage === stage ? "true" : undefined}
              style={{ background: draft.stage === stage ? "#4a2b58" : "#2b1836" }}
            >
              <div className="font-pixel text-[12px] text-[var(--gold)] leading-relaxed">
                {STAGE_COPY[stage].label}
              </div>
              <div className="font-pixel text-[13px] text-[#fff1d6] mt-3 leading-[1.8]">
                {STAGE_COPY[stage].desc}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SettingField
            label="เป้าหมาย"
            helper="เหรียญที่ต้องทำให้ถึงก่อน"
            value={draft.targetCoins}
          >
            <input
              className="pixel-chip w-full font-pixel text-[16px] bg-[#24132f] text-[#fff3c4] px-4 py-3"
              type="number"
              min={ROOM_SETTING_LIMITS.targetCoins.min}
              max={ROOM_SETTING_LIMITS.targetCoins.max}
              step={50}
              value={draft.targetCoins}
              onChange={(e) =>
                setNumber("targetCoins", Number(e.target.value), ROOM_SETTING_LIMITS.targetCoins)
              }
            />
          </SettingField>
          <SettingField
            label="TIME"
            helper="นาทีต่อรอบ"
            value={Math.round(draft.durationMs / 60000)}
          >
            <input
              className="pixel-chip w-full font-pixel text-[16px] bg-[#24132f] text-[#fff3c4] px-4 py-3"
              type="number"
              min={ROOM_SETTING_LIMITS.durationMs.min / 60000}
              max={ROOM_SETTING_LIMITS.durationMs.max / 60000}
              step={1}
              value={Math.round(draft.durationMs / 60000)}
              onChange={(e) =>
                setNumber(
                  "durationMs",
                  Number(e.target.value) * 60000,
                  ROOM_SETTING_LIMITS.durationMs,
                )
              }
            />
          </SettingField>
          <SettingField label="สล็อต" helper="ปรับตามโหมด" value={draft.maxPlayers}>
            <input
              className="pixel-chip w-full font-pixel text-[16px] bg-[#24132f] text-[#fff3c4] px-4 py-3 opacity-80"
              type="number"
              min={2}
              max={4}
              value={draft.maxPlayers}
              readOnly
            />
          </SettingField>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={() => {
              SFX.click();
              onClose();
            }}
            className="pixel-btn px-5 py-4"
          >
            <span className="font-pixel text-[11px]">ยกเลิก</span>
          </button>
          <button
            onClick={() => {
              SFX.click();
              onSave(draft);
            }}
            className="pixel-btn px-5 py-4"
            data-accent="true"
          >
            <span className="font-pixel text-[11px]">บันทึกการตั้งค่า</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingField({
  label,
  helper,
  value,
  children,
}: {
  label: string;
  helper: string;
  value: number;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-pixel text-[11px] text-[var(--gold)]">{label}</span>
      {children}
      <span className="font-pixel text-[12px] text-[#fff1d6] leading-[1.8]">
        {helper} · {value}
      </span>
    </label>
  );
}

function SpectatorLobbyView({
  players,
  state,
  isHost,
  onClaimSlot,
  onForceStart,
  onOpenSettings,
  onAddBot,
  onRemoveBot,
}: {
  players: PublicPlayer[];
  state: PublicMatchState;
  isHost: boolean;
  onClaimSlot: () => void;
  onForceStart: () => void;
  onOpenSettings: () => void;
  onAddBot: () => void;
  onRemoveBot: (playerId: string) => void;
}) {
  const slotsFull = players.length >= state.settings.maxPlayers;
  const canAddBot = isHost && state.status === "lobby" && !slotsFull;
  return (
    <section className="lobby-stage relative z-10 w-full max-w-5xl">
      <div className="lobby-title-card pixel-panel">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-pixel text-[8px] tracking-[3px] text-[var(--muted-foreground)]">
            มุมผู้ตัดสิน
          </span>
          {isHost && (
            <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
              เจ้าของห้อง
            </span>
          )}
        </div>
        <h2 className="font-pixel lobby-title">โหมดชม</h2>
        <p className="lobby-subtitle">เริ่มเป็นผู้ชมก่อน · กดเข้า slot เมื่อต้องการลงแข่ง</p>
      </div>

      <RoomSettingsSummary
        settings={state.settings}
        isHost={isHost}
        onOpenSettings={onOpenSettings}
      />

      {slotsFull && (
        <div className="mb-5 flex justify-center">
          <div className="pixel-panel px-4 py-3">
            <span className="font-pixel text-[12px] text-[var(--muted-foreground)]">
              สล็อตผู้เล่นเต็มแล้ว
            </span>
          </div>
        </div>
      )}

      {state.settings.mode === "2v2" ? (
        <TeamSlots
          players={players}
          hostId={state.hostId}
          isHost={false}
          canManage={isHost && state.status === "lobby"}
          onRemoveBot={onRemoveBot}
        />
      ) : (
        <div className="lobby-versus-grid">
          <PlayerCard
            player={players[0]}
            label="ผู้เล่น 1"
            side="left"
            hostId={state.hostId}
            canKick={isHost && state.status === "lobby" && Boolean(players[0]?.isBot)}
            onKick={onRemoveBot}
            kickLabel="ลบบอท"
          />
          <div className="lobby-vs-core" aria-hidden>
            <span>VS</span>
          </div>
          <PlayerCard
            player={players[1]}
            label="ผู้เล่น 2"
            side="right"
            hostId={state.hostId}
            canKick={isHost && state.status === "lobby" && Boolean(players[1]?.isBot)}
            onKick={onRemoveBot}
            kickLabel="ลบบอท"
          />
        </div>
      )}

      <div className="lobby-ready-row">
        <div className="lobby-ruleline" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!slotsFull ? (
            <button
              onClick={() => {
                SFX.epicSlot();
                onClaimSlot();
              }}
              className="pixel-btn lobby-ready-btn"
              data-accent="true"
            >
              <span className="font-pixel text-[12px]">เข้าสล็อตผู้เล่น</span>
            </button>
          ) : null}
          {canAddBot && (
            <button
              onClick={() => {
                SFX.click();
                onAddBot();
              }}
              className="pixel-btn lobby-ready-btn"
            >
              <span className="font-pixel text-[12px]">เพิ่มบอท</span>
              <span className="font-pixel text-[8px] opacity-70">เจ้าของห้อง</span>
            </button>
          )}
          {isHost && slotsFull && (
            <button
              onClick={() => {
                SFX.click();
                onForceStart();
              }}
              className="pixel-btn lobby-ready-btn"
              data-accent="true"
            >
              <span className="font-pixel text-[12px]">เริ่ม</span>
              <span className="font-pixel text-[8px] opacity-70">เจ้าของห้อง</span>
            </button>
          )}
        </div>
        <div className="lobby-ruleline" />
      </div>
    </section>
  );
}

function CountdownView({
  endsAt,
  isHost,
  onCancel,
}: {
  endsAt: number;
  isHost: boolean;
  onCancel: () => void;
}) {
  const [n, setN] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const i = setInterval(() => setN(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 100);
    return () => clearInterval(i);
  }, [endsAt]);

  useEffect(() => {
    if (n > 0) SFX.countdown(n);
    else SFX.crit();
  }, [n]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-4">
      <div
        className="font-pixel text-[96px] text-[var(--gold)]"
        style={{
          textShadow: "6px 6px 0 #1a0f1f, 0 0 40px rgba(255,210,74,0.6)",
          animation: "grow 0.4s ease-out",
        }}
        key={n}
      >
        {n > 0 ? n : "เริ่ม!"}
      </div>
      {isHost && n > 0 && (
        <button
          onClick={() => {
            SFX.click();
            onCancel();
          }}
          className="pixel-btn pointer-events-auto"
        >
          <span className="font-pixel text-[10px]">ยกเลิกนับถอยหลัง</span>
        </button>
      )}
    </div>
  );
}

function SelfField({
  player,
  events,
  acting,
  predictedDir,
  isSelf = false,
  cargo,
  showMarket = false,
  teammates,
}: {
  player: PublicPlayer;
  events: { id: number; ev: ServerEvent }[];
  actionFlash: number;
  acting: boolean;
  predictedDir?: Direction | null;
  isSelf?: boolean;
  cargo?: Cargo[];
  showMarket?: boolean;
  teammates?: PublicPlayer[];
}) {
  return (
    <PhaserField
      player={player}
      events={events}
      acting={acting}
      predictedDir={predictedDir}
      isSelf={isSelf}
      cargo={cargo}
      showMarket={showMarket}
      teammates={teammates}
    />
  );
}

function SpectatorMatchView({
  players,
  events,
  spectatorCount,
  marketPrices,
  fieldCargo,
  is2v2 = false,
}: {
  players: PublicPlayer[];
  events: { id: number; ev: ServerEvent }[];
  spectatorCount?: number;
  marketPrices?: Record<CropId, number>;
  fieldCargo?: Cargo[];
  is2v2?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  const watching = Math.max(1, spectatorCount ?? 1);

  // 2v2 spectating shows one shared plot per team (the farmer owns the tiles, the
  // seller rides along as a teammate sprite). 1v1 keeps one field per player.
  const fields: Array<{
    key: string;
    owner: PublicPlayer;
    teammates: PublicPlayer[];
    label: string;
  }> = is2v2
    ? (["A", "B"] as const)
        .map((teamId) => {
          const members = players.filter((p) => p.teamId === teamId);
          if (!members.length) return null;
          const owner = members.find((p) => p.role === "farmer") ?? members[0];
          return {
            key: teamId,
            owner,
            teammates: members.filter((p) => p.id !== owner.id),
            label: `Team ${teamId}`,
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
    : players.map((player, i) => ({
        key: player.id,
        owner: player,
        teammates: [],
        label: `ผู้เล่น ${i + 1}`,
      }));

  return (
    <div className="relative z-10 mt-2 flex flex-col items-center gap-4 sm:mt-3">
      <div className="pixel-panel flex flex-wrap items-center justify-center gap-3 px-5 py-3">
        <span className="flex items-center gap-2">
          <span className="live-dot" aria-hidden />
          <span className="font-pixel text-[8px] tracking-[2px] text-[var(--accent)]">
            ถ่ายทอดสด
          </span>
        </span>
        <span className="h-4 w-[2px] bg-[#1a0f1f]" aria-hidden />
        <span className="font-pixel text-[10px] text-[var(--gold)]">มุมผู้ตัดสิน</span>
        <span className="pixel-chip font-pixel text-[8px]">
          {players.length}/{is2v2 ? 4 : 2} PLAYERS
        </span>
        <span
          className="pixel-chip flex items-center gap-1.5 font-pixel text-[8px]"
          data-gold="true"
          title="จำนวนผู้ชม"
        >
          <EyeIcon size={13} />
          {watching} กำลังดู
        </span>
      </div>
      <div className="flex flex-col xl:flex-row items-center gap-4 xl:gap-6">
        {fields.map((field) => {
          const player = field.owner;
          const overlays: Array<{
            x: number;
            y: number;
            id: CropId;
            progress: number;
            price: number;
          }> = [];
          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              const cell = player.tiles[y]?.[x];
              if (!cell?.crop) continue;
              const id = cell.crop.id as CropId;
              const plantedAt = cell.crop.plantedAt;
              const elapsed = Math.max(0, now - plantedAt);
              const growTime = CROPS[id].growTime ?? 0;
              const progress = growTime > 0 ? Math.min(1, elapsed / growTime) : 1;
              const price = Math.round(marketPrices?.[id] ?? CROPS[id].sellPrice);
              overlays.push({ x, y, id, progress, price });
            }
          }
          const teamPlayerIds = new Set([player.id, ...field.teammates.map((t) => t.id)]);

          return (
            <div key={field.key} className="flex flex-col items-center gap-2">
              {is2v2 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <OpponentStatusCard
                    player={player}
                    label={<RoleBadge role={player.role ?? "farmer"} />}
                  />
                  {field.teammates.map((mate) => (
                    <OpponentStatusCard
                      key={mate.id}
                      player={mate}
                      label={<RoleBadge role={mate.role ?? "seller"} />}
                    />
                  ))}
                </div>
              ) : (
                <OpponentStatusCard player={player} label={field.label} />
              )}
              <div className="relative" style={{ width: COLS * TILE, height: ROWS * TILE }}>
                <SelfField
                  player={player}
                  events={events.filter((e) => teamPlayerIds.has(e.ev.playerId))}
                  actionFlash={0}
                  acting={false}
                  cargo={is2v2 ? fieldCargo?.filter((c) => c.teamId === player.teamId) : undefined}
                  showMarket={is2v2}
                  teammates={field.teammates}
                />
                <div className="absolute inset-0 pointer-events-none">
                  {overlays.map((c) => {
                    const left = c.x * TILE + 5;
                    const overlayHeight = 16;
                    const top = c.y * TILE + TILE - overlayHeight - 2;
                    const pct = Math.round(c.progress * 100);
                    return (
                      <div
                        key={`${c.x}-${c.y}`}
                        style={{ left, top, width: TILE - 10, position: "absolute" }}
                      >
                        <div className="bg-transparent px-1 py-[1px] text-white">
                          <div className="flex items-center justify-between gap-1 text-[7px] leading-none">
                            <span className="flex items-center gap-[2px] font-pixel text-[7px] text-[var(--gold)]">
                              <CoinIcon size={10} />
                              {c.price}
                            </span>
                          </div>
                          <div className="mt-[2px] h-[3px] w-full overflow-hidden rounded-full bg-white/20">
                            <div
                              className="h-full bg-gradient-to-r from-[#7fd8ff] to-[#4cc2ee]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpponentStatusCard({
  player,
  label = "คู่แข่ง",
}: {
  player: PublicPlayer;
  label?: ReactNode;
}) {
  return (
    <div className="pixel-panel flex items-center gap-4 px-4 py-3 opacity-90">
      <div style={{ width: 34, height: 34, overflow: "hidden" }}>
        <div style={{ transform: "scale(0.55)", transformOrigin: "0 0" }}>
          <PixelFarmer
            direction={player.dir}
            walking={false}
            walkFrame={0}
            acting={false}
            tool={player.tool}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {typeof label === "string" ? (
          <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">{label}</div>
        ) : (
          label
        )}
        <div className="font-pixel text-[12px]">{player.name}</div>
      </div>
      <div className="mx-1 h-8 w-1" style={{ background: "#1a0f1f" }} />
      <div className="flex flex-col gap-1">
        <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">เหรียญ</div>
        <div className="font-pixel text-[12px] text-[var(--gold)]">{player.coins}</div>
      </div>
      <div
        className="font-pixel text-[8px]"
        style={{ color: player.connected ? "#86efac" : "#f87171" }}
      >
        {player.connected ? "ออนไลน์" : "ออฟไลน์"}
      </div>
    </div>
  );
}

function OpponentField({ player }: { player: PublicPlayer }) {
  return <OpponentStatusCard player={player} />;
}

function isSellerPuzzleReady(player: PublicPlayer): boolean {
  return (
    player.role === "seller" &&
    playerCargoStack(player).length > 0 &&
    Math.hypot(MARKET_TILE_POS.x - player.pos.x, MARKET_TILE_POS.y - player.pos.y) <= 1.8
  );
}

function isSellerBugReady(player: PublicPlayer): boolean {
  if (player.role !== "seller") return false;
  const infested = getInfestedTileCoords(player.tiles);
  if (!infested) return false;
  return Math.hypot(infested.x - player.pos.x, infested.y - player.pos.y) <= 1.5;
}

function getInfestedTileCoords(tiles?: Tile[][]): { x: number; y: number } | null {
  if (!tiles) return null;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (tiles[y]?.[x]?.bug) return { x, y };
    }
  }
  return null;
}

const BUG_ICONS = [CaterpillarIcon, BeetleIcon, FlyIcon] as const;
const BUG_HUNT_TARGET = 3;
const BUG_ARENA_W = 320;
const BUG_ARENA_H = 220;
const BUG_CATCH_RADIUS = 42;

function BugCatchingOverlay({
  self,
  send,
  onClose,
}: {
  self: PublicPlayer;
  send: (msg: Parameters<ReturnType<typeof useMatch>["send"]>[0]) => void;
  onClose: () => void;
}) {
  const infested = getInfestedTileCoords(self.tiles);
  const [bug, setBug] = useState(() => ({ x: 82, y: 92, species: 0 }));
  const [net, setNet] = useState(() => ({ x: 238, y: 128 }));
  const [hits, setHits] = useState(0);
  const bugRef = useRef(bug);
  const velocityRef = useRef({ x: 1.8, y: 1.25 });
  const sentRef = useRef(false);
  const hitLockRef = useRef(false);

  useEffect(() => {
    bugRef.current = bug;
  }, [bug]);

  useEffect(() => {
    if (!infested) return;
    let raf = 0;
    const tick = () => {
      const current = bugRef.current;
      const velocity = velocityRef.current;
      let x = current.x + velocity.x;
      let y = current.y + velocity.y;
      if (x < 28 || x > BUG_ARENA_W - 28) {
        velocity.x *= -1;
        x = Math.max(28, Math.min(BUG_ARENA_W - 28, x));
      }
      if (y < 28 || y > BUG_ARENA_H - 28) {
        velocity.y *= -1;
        y = Math.max(28, Math.min(BUG_ARENA_H - 28, y));
      }
      setBug({ ...current, x, y });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [infested]);

  // Close automatically once the server confirms the bug is gone, or on Escape.
  useEffect(() => {
    if (!infested) onClose();
  }, [infested, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const moveNet = (e: React.PointerEvent<HTMLDivElement>, shouldCatch: boolean) => {
    if (!infested || sentRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(BUG_ARENA_W, ((e.clientX - rect.left) / rect.width) * BUG_ARENA_W),
    );
    const y = Math.max(
      0,
      Math.min(BUG_ARENA_H, ((e.clientY - rect.top) / rect.height) * BUG_ARENA_H),
    );
    setNet({ x, y });
    if (!shouldCatch || hitLockRef.current) return;
    const dx = x - bugRef.current.x;
    const dy = y - bugRef.current.y;
    if (Math.hypot(dx, dy) > BUG_CATCH_RADIUS) return;

    SFX.harvest();
    hitLockRef.current = true;
    const newHits = hits + 1;
    setHits(newHits);
    if (newHits >= BUG_HUNT_TARGET) {
      sentRef.current = true;
      send({ t: "seller_clear_bug", x: infested.x, y: infested.y });
      return;
    }
    const next = {
      x: 40 + Math.random() * (BUG_ARENA_W - 80),
      y: 40 + Math.random() * (BUG_ARENA_H - 80),
      species: (bugRef.current.species + 1) % BUG_ICONS.length,
    };
    velocityRef.current = {
      x: (velocityRef.current.x > 0 ? 1 : -1) * (2.1 + newHits * 0.35),
      y: (velocityRef.current.y > 0 ? -1 : 1) * (1.55 + newHits * 0.3),
    };
    bugRef.current = next;
    setBug(next);
    setTimeout(() => {
      hitLockRef.current = false;
    }, 350);
  };

  if (!infested) return null;

  const Bug = BUG_ICONS[bug.species];
  const pct = Math.min(100, (hits / BUG_HUNT_TARGET) * 100);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(10,5,15,0.72)] p-4">
      <div className="pixel-panel w-[min(520px,96vw)] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="pixel-chip font-pixel text-[9px]" data-gold="true">
              NET CHASE
            </span>
            <span className="truncate font-pixel text-[10px] text-[var(--muted-foreground)]">
              แมลงลงสวนช่อง {infested.x},{infested.y}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pixel-btn shrink-0 px-2 py-1 font-pixel text-[8px]"
            title="ออก (ค้างไว้จับทีหลังได้)"
          >
            ESC
          </button>
        </div>

        <div
          className="mb-4 h-2 w-full overflow-hidden"
          style={{ boxShadow: "0 0 0 2px var(--background)" }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "var(--gold)",
              transition: "width 0.15s steps(3)",
            }}
          />
        </div>

        <div
          role="button"
          tabIndex={0}
          className="relative mx-auto h-[220px] w-full max-w-[320px] overflow-hidden bg-[var(--muted)] outline-none"
          style={{
            touchAction: "none",
            boxShadow:
              "0 0 0 2px var(--background), 0 0 0 6px var(--border), inset 0 0 0 3px rgba(255,255,255,.08)",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            moveNet(e, true);
          }}
          onPointerMove={(e) => moveNet(e, e.buttons === 1)}
        >
          <div
            className="absolute grid size-12 place-items-center text-[var(--gold)]"
            style={{
              left: `${(bug.x / BUG_ARENA_W) * 100}%`,
              top: `${(bug.y / BUG_ARENA_H) * 100}%`,
              transform: "translate(-50%, -50%)",
              filter: "drop-shadow(2px 2px 0 var(--background))",
            }}
          >
            <Bug size={42} />
          </div>
          <div
            className="pointer-events-none absolute grid size-16 place-items-center font-pixel text-[38px]"
            style={{
              left: `${(net.x / BUG_ARENA_W) * 100}%`,
              top: `${(net.y / BUG_ARENA_H) * 100}%`,
              transform: "translate(-50%, -50%) rotate(-18deg)",
              textShadow: "2px 2px 0 var(--background)",
            }}
            aria-hidden
          >
            🕸️
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="font-pixel text-[8px] text-[var(--gold)] animate-bounce">
            👉 ลากตาข่ายให้โดนแมลง!
          </span>
          <span className="font-pixel text-[9px] text-[var(--gold)]">
            {hits}/{BUG_HUNT_TARGET}
          </span>
        </div>
        <div className="mt-1 font-pixel text-[7px] text-[var(--muted-foreground)]">
          กดหรือลากตาข่ายจับให้ครบ {BUG_HUNT_TARGET} ครั้ง เพื่อปลดล็อกช่องให้ชาวสวน
        </div>
      </div>
    </div>
  );
}

// Build the 5-customer board for one cargo: PUZZLE_SLOTS faces, each wanting a
// crop. Exactly one wants `targetCrop` (the cargo in hand); the rest want decoys
// drawn from the other crops so the match is unambiguous.
function buildCustomers(targetCrop: CropId): { face: string; want: CropId }[] {
  const decoyPool = (Object.keys(CROPS) as CropId[]).filter((id) => id !== targetCrop);
  const decoys = pickN(decoyPool, PUZZLE_SLOTS - 1);
  const faces = pickN(BUYER_FACES, PUZZLE_SLOTS);
  const wants = pickN([targetCrop, ...decoys], PUZZLE_SLOTS);
  return wants.map((want, i) => ({ face: faces[i], want }));
}

function SellerPuzzleOverlay({
  self,
  send,
  onClose,
}: {
  self: PublicPlayer;
  send: (msg: Parameters<ReturnType<typeof useMatch>["send"]>[0]) => void;
  onClose: () => void;
}) {
  const stack = playerCargoStack(self);
  const cargo = stack[0];
  const cargoId = cargo?.id;
  const targetCrop = cargo?.cropId;

  // Regenerate the customer board whenever the top cargo changes.
  const [customers, setCustomers] = useState<{ face: string; want: CropId }[]>([]);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const sentRef = useRef(false);

  useEffect(() => {
    if (!targetCrop) return;
    setCustomers(buildCustomers(targetCrop));
    setDeadline(Date.now() + PUZZLE_TIME_MS);
    setWrongIdx(null);
    sentRef.current = false;
  }, [cargoId, targetCrop]);

  // Tick the timer; auto-sell at base price when it runs out.
  useEffect(() => {
    if (!cargoId) return;
    const t = setInterval(() => setNow(Date.now()), 80);
    return () => clearInterval(t);
  }, [cargoId]);

  useEffect(() => {
    if (!cargoId || !deadline || sentRef.current) return;
    if (now >= deadline) {
      sentRef.current = true;
      SFX.bad();
      send({ t: "sell_cargo", pos: self.pos });
    }
  }, [now, deadline, cargoId, self.pos, send]);

  const deliver = useCallback(
    (idx: number, want: CropId) => {
      if (sentRef.current || !targetCrop) return;
      if (want === targetCrop) {
        sentRef.current = true;
        SFX.coin();
        send({ t: "seller_puzzle_sell", choice: targetCrop, pos: self.pos });
      } else {
        // Wrong customer: still sells but at a docked price.
        sentRef.current = true;
        SFX.bad();
        setWrongIdx(idx);
        send({ t: "seller_puzzle_sell", choice: want, pos: self.pos });
      }
    },
    [targetCrop, self.pos, send],
  );

  // Keyboard delivery: 1-5 selects the matching customer slot.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= customers.length) {
        e.preventDefault();
        deliver(n - 1, customers[n - 1].want);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customers, deliver, onClose]);

  if (!cargo || !targetCrop) return null;

  const TargetIcon = CROP_ICONS[targetCrop];
  const remaining = Math.max(0, deadline - now);
  const pct = Math.min(100, (remaining / PUZZLE_TIME_MS) * 100);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(10,5,15,0.72)] p-4">
      <div className="pixel-panel relative w-[min(620px,96vw)] p-5">
        {sentRef.current && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(10,5,15,0.4)] backdrop-blur-[1px]">
            <div className="pixel-chip font-pixel text-[12px] animate-pulse" data-gold="true">
              กำลังส่ง...
            </div>
          </div>
        )}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="pixel-chip" data-gold="true">
              MARKET RUSH
            </div>
            <div className="font-pixel text-[10px] text-[var(--gold)]">
              ส่งให้ลูกค้าที่อยากได้ · เหลือ {stack.length} ชิ้น
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="pixel-panel flex items-center gap-2 p-2">
              <TargetIcon size={26} />
              <span className="font-pixel text-[10px] text-[var(--foreground)]">
                {CROPS[targetCrop].name}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pixel-btn shrink-0 px-2 py-1 font-pixel text-[8px]"
              title="ปิด (เดินใหม่เพื่อเปิดใหม่)"
            >
              ESC
            </button>
          </div>
        </div>

        {/* Timer bar — empties as the rush window closes */}
        <div
          className="mb-4 h-2 w-full overflow-hidden"
          style={{ background: "#1a0f1f", boxShadow: "0 0 0 2px var(--border)" }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: pct > 40 ? "linear-gradient(90deg,#86efac,#ffd24a)" : "#ff6b6b",
              transition: "width 80ms linear",
            }}
          />
        </div>

        <div className="grid grid-cols-5 gap-2">
          {customers.map((c, idx) => {
            const WantIcon = CROP_ICONS[c.want];
            return (
              <button
                key={idx}
                onClick={() => deliver(idx, c.want)}
                disabled={sentRef.current}
                className="pixel-btn flex flex-col items-center gap-1 p-2"
                style={wrongIdx === idx ? { boxShadow: "0 0 0 3px #ff6b6b" } : undefined}
              >
                <span className="text-2xl leading-none">{c.face}</span>
                <span className="pixel-panel flex h-8 w-8 items-center justify-center p-1">
                  <WantIcon size={20} />
                </span>
                <span className="pixel-key pixel-key-sm">{idx + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 font-pixel text-[8px] text-[var(--muted-foreground)]">
          ตรงคน +25% · ผิดคนโดนกดราคา −10% · หมดเวลาขายราคาปกติ
        </div>
      </div>
    </div>
  );
}

/** Tiny pixel crate — vector stand-in for the seller "pick up" action. */
function CrateMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="3" y="4" width="10" height="9" fill="#8a5a2b" />
      <rect x="3" y="4" width="10" height="2" fill="#a06a3a" />
      <rect x="3" y="11" width="10" height="2" fill="#6b421d" />
      <rect x="7" y="4" width="2" height="9" fill="#5a2f17" />
      <rect x="3" y="7" width="10" height="2" fill="#5a2f17" />
      <rect x="3" y="4" width="10" height="9" fill="none" stroke="#3a2410" strokeWidth="1" />
    </svg>
  );
}

/** Tiny pixel basket — vector stand-in for the basket capacity readout. */
function BasketMark({ size = 10 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="3" y="6" width="10" height="2" fill="#a06a3a" />
      <rect x="4" y="8" width="8" height="5" fill="#8a5a2b" />
      <rect x="4" y="8" width="8" height="5" fill="none" stroke="#5a2f17" strokeWidth="1" />
      <rect x="6" y="8" width="1" height="5" fill="#6b3a1b" />
      <rect x="9" y="8" width="1" height="5" fill="#6b3a1b" />
      <rect x="5" y="4" width="6" height="2" fill="#6b3a1b" />
    </svg>
  );
}

function Toolbar({
  self,
  send,
  marketPrices,
  cargo,
  bugHuntReady,
  onBugHunt,
}: {
  self: PublicPlayer;
  send: (msg: Parameters<ReturnType<typeof useMatch>["send"]>[0]) => void;
  marketPrices?: Record<CropId, number>;
  cargo?: Cargo[];
  bugHuntReady?: boolean;
  onBugHunt?: () => void;
}) {
  const cropPool = selectedCropPool(self.selectedCrops);
  if (self.role === "seller") {
    const nearbyCargo = cargo?.find(
      (item) =>
        item.teamId === self.teamId &&
        Math.hypot(item.position.x - self.pos.x, item.position.y - self.pos.y) <= 1.5,
    );
    const nearMarket =
      Math.hypot(MARKET_TILE_POS.x - self.pos.x, MARKET_TILE_POS.y - self.pos.y) <= 1.5;
    const stack = playerCargoStack(self);
    const basketFull = stack.length >= SELLER_BASKET_CAPACITY;
    return (
      <div className="farm-toolbar relative z-10 w-full max-w-5xl pixel-panel">
        <div className="farm-toolbar-section farm-toolbar-tools">
          <span className="farm-toolbar-label">คนขาย</span>
          <div className="farm-tool-grid">
            <button
              onClick={() => {
                SFX.click();
                send({ t: "pick_up", pos: self.pos });
              }}
              className="farm-tool-btn pixel-btn"
              disabled={!nearbyCargo || basketFull}
            >
              <CrateMark />
              <span>หยิบของ</span>
              <span className="farm-key-hint">SPACE</span>
            </button>
            <button
              className="farm-tool-btn pixel-btn"
              data-active={nearMarket && stack.length > 0 ? "true" : undefined}
              disabled
            >
              <CoinIcon size={20} />
              <span>{nearMarket && stack.length > 0 ? "ส่งให้ลูกค้า" : "ไปตลาด"}</span>
              <span className="farm-key-hint">1-5</span>
            </button>
            {/* Bug hunt is optional — only offered when standing near the infested tile.
                Seller can ignore it and keep moving/selling. */}
            {(() => {
              const coords = getInfestedTileCoords(self.tiles);
              const label = coords
                ? bugHuntReady
                  ? "จับแมลง"
                  : `ไปหลุม (${coords.x},${coords.y})`
                : "จับแมลง";
              return (
                <button
                  onClick={onBugHunt}
                  className="farm-tool-btn pixel-btn"
                  data-active={bugHuntReady ? "true" : undefined}
                  disabled={!bugHuntReady}
                  title={
                    coords
                      ? bugHuntReady
                        ? "เปิดมินิเกมจับแมลง"
                        : `เดินไปช่อง ${coords.x},${coords.y} เพื่อจับแมลง`
                      : "ไม่มีแมลงรบกวนในสวน"
                  }
                >
                  <CaterpillarIcon size={20} />
                  <span>{label}</span>
                  <span className="farm-key-hint">{bugHuntReady ? "พร้อม" : "—"}</span>
                </button>
              );
            })()}
          </div>
        </div>
        <div className="farm-toolbar-section farm-toolbar-crops">
          <span className="farm-toolbar-label">สถานะ</span>
          {/* Basket capacity bar — one segment per slot, colored by the crop in it */}
          <div className="flex items-center gap-2">
            <div className="relative flex h-4 w-full gap-px" style={{ background: "var(--muted)" }}>
              {Array.from({ length: SELLER_BASKET_CAPACITY }, (_, i) => {
                const slotCargo = stack[i];
                return (
                  <div
                    key={i}
                    className="h-full flex-1"
                    style={{
                      background: slotCargo ? CROP_COLOR[slotCargo.cropId] : "transparent",
                      transition: "background 0.15s",
                    }}
                  />
                );
              })}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 font-pixel text-[7px]"
                style={{ color: "var(--foreground)" }}
              >
                <BasketMark />
                {stack.length}/{SELLER_BASKET_CAPACITY}
              </div>
            </div>
          </div>
          {stack.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {stack.map((cargo) => {
                const Icon = CROP_ICONS[cargo.cropId];
                return (
                  <div
                    key={cargo.id}
                    className="flex h-6 w-6 items-center justify-center"
                    style={{ background: "var(--card)", outline: "2px solid var(--border)" }}
                  >
                    <Icon size={16} />
                  </div>
                );
              })}
            </div>
          )}
          <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">
            {stack.length > 0
              ? nearMarket
                ? "เลือกคนซื้อให้ถูก ได้โบนัส"
                : `ตลาดอยู่ช่อง ${MARKET_TILE_POS.x},${MARKET_TILE_POS.y}`
              : `ตลาดอยู่ช่อง ${MARKET_TILE_POS.x},${MARKET_TILE_POS.y}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="farm-toolbar relative z-10 w-full max-w-5xl pixel-panel">
      <div className="farm-toolbar-section farm-toolbar-tools">
        <span className="farm-toolbar-label">อุปกรณ์</span>
        <div className="farm-tool-grid">
          {(
            [
              { id: "hoe", label: "จอบ", Icon: HoeIcon, key: "1" },
              { id: "watering_can", label: "นํ้า", Icon: WaterCanIcon, key: "2" },
              { id: "seed", label: "เมล็ด", Icon: SeedIcon, key: "3" },
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
                SFX.click();
                send({ t: "tool", tool: t.id });
              }}
              className="farm-tool-btn pixel-btn"
              data-active={self.tool === t.id}
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
          {cropPool
            .map((id) => CROPS[id])
            .map((c) => {
              const Icon = CROP_ICONS[c.id];
              const active = self.seedChoice === c.id && self.tool === "seed";
              const currentSell = marketPrices ? Math.round(marketPrices[c.id]) : c.sellPrice;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    SFX.click();
                    send({ t: "seed", id: c.id });
                  }}
                  className="farm-crop-card pixel-btn"
                  data-active={active}
                  title={`ราคาซื้อ: ${c.seedCost} | ราคาขายตลาดปัจจุบัน: ${currentSell}`}
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
                        ขาย <b>{currentSell}</b>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function selectedCropPool(ids?: CropId[]): CropId[] {
  const selected: CropId[] = [];
  for (const id of ids ?? []) {
    if (CROPS[id] && !selected.includes(id)) selected.push(id);
    if (selected.length === SELECTED_CROP_COUNT) return selected;
  }
  for (const id of DEFAULT_SELECTED_CROPS) {
    if (!selected.includes(id)) selected.push(id);
    if (selected.length === SELECTED_CROP_COUNT) return selected;
  }
  return selected;
}

function MobileControls({
  setMovement,
  sendAction,
}: {
  setMovement: (dir: Direction | null) => void;
  sendAction: () => void;
}) {
  const stop = () => setMovement(null);
  const startMove = (dir: Direction) => setMovement(dir);
  useEffect(() => () => setMovement(null), [setMovement]);

  return (
    <div className="fixed bottom-4 left-0 right-0 z-20 flex items-end justify-between px-4 sm:hidden pointer-events-none">
      <div className="grid grid-cols-3 gap-2 pointer-events-auto">
        <div />
        <MoveButton label="↑" onPointerDown={() => startMove("up")} onPointerUp={stop} />
        <div />
        <MoveButton label="←" onPointerDown={() => startMove("left")} onPointerUp={stop} />
        <MoveButton label="↓" onPointerDown={() => startMove("down")} onPointerUp={stop} />
        <MoveButton label="→" onPointerDown={() => startMove("right")} onPointerUp={stop} />
      </div>
      <button
        className="pixel-btn pointer-events-auto h-20 w-20 rounded-full"
        data-accent="true"
        onPointerDown={sendAction}
      >
        <span className="font-pixel text-[10px]">ใช้</span>
      </button>
    </div>
  );
}

function MoveButton({
  label,
  onPointerDown,
  onPointerUp,
}: {
  label: string;
  onPointerDown: () => void;
  onPointerUp: () => void;
}) {
  return (
    <button
      className="pixel-btn h-14 w-14"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <span className="font-pixel text-[16px]">{label}</span>
    </button>
  );
}

// Deterministic so SSR markup matches the client (no Math.random in render).
const WINNER_CONFETTI_COLORS = ["#ffd24a", "#e8a23a", "#d94e6a", "#6ab04c", "#4cc2ee", "#f4e4c1"];
const WINNER_CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 7) * 0.22,
  dur: 1.9 + (i % 5) * 0.4,
  color: WINNER_CONFETTI_COLORS[i % WINNER_CONFETTI_COLORS.length],
  size: 5 + (i % 3) * 2,
  drift: i % 2 ? 14 : -14,
  spin: i % 2 ? 1 : -1,
}));

function champShade(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const TROPHY_GOLD = "#ffd24a";
const TROPHY_GOLD_DARK = "#d99b1f";
const TROPHY_SHINE = "#fff3c4";
const SKIN = "#f0c090";
const SKIN_DARK = "#c08858";
const INK = "#1a1208";

/** Trophy held overhead. dy shifts the whole cup+arms together as one frame. */
function trophyArms(dy: number, palette: { skin: string; skinDark: string }) {
  const g = TROPHY_GOLD;
  const gd = TROPHY_GOLD_DARK;
  return (
    <>
      {/* left arm: shoulder -> hand on trophy base */}
      <rect x="3" y={6 + dy} width="1" height="4" fill={palette.skin} />
      <rect x="4" y={4 + dy} width="1" height="2" fill={palette.skin} />
      <rect x="4" y={2 + dy} width="2" height="2" fill={palette.skin} />
      {/* right arm (mirror, shaded) */}
      <rect x="12" y={6 + dy} width="1" height="4" fill={palette.skinDark} />
      <rect x="11" y={4 + dy} width="1" height="2" fill={palette.skinDark} />
      <rect x="10" y={2 + dy} width="2" height="2" fill={palette.skinDark} />
      {/* trophy base -> stem -> bowl -> mouth, all relative to dy */}
      <rect x="5" y={1 + dy} width="6" height="1" fill={gd} />
      <rect x="6" y={0 + dy} width="4" height="1" fill={g} />
      <rect x="7" y={-1 + dy} width="2" height="1" fill={gd} />
      <rect x="6" y={-3 + dy} width="4" height="2" fill={g} />
      <rect x="5" y={-5 + dy} width="6" height="2" fill={g} />
      <rect x="5" y={-6 + dy} width="6" height="1" fill={g} />
      <rect x="6" y={-6 + dy} width="1" height="1" fill={TROPHY_SHINE} />
      {/* handles */}
      <rect x="4" y={-5 + dy} width="1" height="2" fill={g} />
      <rect x="11" y={-5 + dy} width="1" height="2" fill={g} />
    </>
  );
}

const DUST = "#b89dd1";

/** Pounding right arm: dy raises (negative) or slams (0) the fist; dust on impact. */
function poundArm(raised: boolean, skin: string) {
  if (raised) {
    return (
      <>
        <rect x="12" y="8" width="1" height="2" fill={skin} />
        <rect x="13" y="6" width="2" height="2" fill={skin} />
      </>
    );
  }
  return (
    <>
      <rect x="12" y="11" width="1" height="2" fill={skin} />
      <rect x="13" y="13" width="2" height="2" fill={skin} />
      {/* dust kicked up by the impact */}
      <rect x="15" y="13" width="1" height="1" fill={DUST} opacity="0.7" />
      <rect x="12" y="14" width="1" height="1" fill={DUST} opacity="0.5" />
    </>
  );
}

/** Defeated: front-facing farmer kneeling, pounding the ground, 2-frame flipbook. */
function LoserKneel({ cosmetics }: { cosmetics: PlayerCosmetics }) {
  const palette = {
    hat: cosmetics.hat,
    hatDark: champShade(cosmetics.hat, -70),
    shirt: cosmetics.shirt,
    shirtDark: champShade(cosmetics.shirt, -70),
    pants: cosmetics.pants,
    pantsDark: champShade(cosmetics.pants, -70),
    skin: SKIN,
    skinDark: SKIN_DARK,
  };
  return (
    <svg
      viewBox="0 0 16 16"
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      style={{
        imageRendering: "pixelated",
        overflow: "visible",
        filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.35))",
      }}
    >
      {/* hat */}
      <rect x="2" y="4" width="12" height="1" fill={palette.hat} />
      <rect x="3" y="3" width="10" height="1" fill={palette.hat} />
      <rect x="2" y="5" width="12" height="1" fill={palette.hatDark} />
      <rect x="5" y="2" width="6" height="1" fill={palette.hat} />
      <rect x="6" y="1" width="4" height="1" fill={palette.hatDark} />
      {/* head bowed; downcast eyes + a tear */}
      <rect x="5" y="6" width="6" height="3" fill={palette.skin} />
      <rect x="5" y="9" width="6" height="1" fill={palette.skinDark} />
      <rect x="6" y="8" width="1" height="1" fill={INK} />
      <rect x="9" y="8" width="1" height="1" fill={INK} />
      <rect x="9" y="9" width="1" height="1" fill="#4cc2ee" />
      {/* slumped torso */}
      <rect x="4" y="10" width="8" height="2" fill={palette.shirt} />
      <rect x="4" y="12" width="8" height="1" fill={palette.shirtDark} />
      {/* left arm hanging limp */}
      <rect x="3" y="10" width="1" height="3" fill={palette.skin} />
      {/* kneeling legs folded wide on the ground */}
      <rect x="3" y="13" width="10" height="2" fill={palette.pants} />
      <rect x="3" y="14" width="10" height="1" fill={palette.pantsDark} />
      <rect x="3" y="15" width="3" height="1" fill="#2a1810" />
      <rect x="10" y="15" width="3" height="1" fill="#2a1810" />
      {/* pounding arm: two frames swapped by a steps animation */}
      <g className="loser-frame loser-frame-a">{poundArm(true, palette.skin)}</g>
      <g className="loser-frame loser-frame-b">{poundArm(false, palette.skin)}</g>
    </svg>
  );
}

/** Champion: front-facing farmer holding a trophy overhead, 2-frame flipbook. */
function WinnerChampion({ cosmetics }: { cosmetics: PlayerCosmetics }) {
  const palette = {
    hat: cosmetics.hat,
    hatDark: champShade(cosmetics.hat, -70),
    shirt: cosmetics.shirt,
    shirtDark: champShade(cosmetics.shirt, -70),
    pants: cosmetics.pants,
    pantsDark: champShade(cosmetics.pants, -70),
    skin: SKIN,
    skinDark: SKIN_DARK,
  };
  return (
    <svg
      viewBox="0 -8 16 24"
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      style={{
        imageRendering: "pixelated",
        overflow: "visible",
        filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.35))",
      }}
    >
      {/* static body (front-facing) */}
      <rect x="2" y="3" width="12" height="1" fill={palette.hat} />
      <rect x="3" y="2" width="10" height="1" fill={palette.hat} />
      <rect x="2" y="4" width="12" height="1" fill={palette.hatDark} />
      <rect x="5" y="1" width="6" height="1" fill={palette.hat} />
      <rect x="6" y="0" width="4" height="1" fill={palette.hatDark} />
      <rect x="5" y="5" width="6" height="3" fill={palette.skin} />
      <rect x="5" y="8" width="6" height="1" fill={palette.skinDark} />
      <rect x="6" y="6" width="1" height="1" fill={INK} />
      <rect x="9" y="6" width="1" height="1" fill={INK} />
      <rect x="7" y="7" width="2" height="1" fill={palette.skinDark} />
      <rect x="4" y="9" width="8" height="3" fill={palette.shirt} />
      <rect x="4" y="11" width="8" height="1" fill={palette.shirtDark} />
      <rect x="5" y="12" width="6" height="2" fill={palette.pants} />
      <rect x="5" y="13" width="6" height="1" fill={palette.pantsDark} />
      <rect x="5" y="14" width="2" height="2" fill="#2a1810" />
      <rect x="9" y="14" width="2" height="2" fill="#2a1810" />
      {/* arms + trophy: two frames swapped by a steps animation (true flipbook) */}
      <g className="champ-frame champ-frame-a">{trophyArms(-2, palette)}</g>
      <g className="champ-frame champ-frame-b">{trophyArms(2, palette)}</g>
    </svg>
  );
}

function EndOverlay({
  winnerId,
  winnerTeamId,
  reason,
  selfId,
  players,
  teams,
  recap,
  onRematch,
  self,
  spectator = false,
  roomClosesAt,
}: {
  winnerId?: string;
  winnerTeamId?: TeamId;
  reason?: "race" | "timeout" | "forfeit" | "kick";
  selfId: string | null;
  players: PublicPlayer[];
  teams?: MatchTeam[];
  recap?: MatchRecap;
  onRematch: () => void;
  self?: PublicPlayer;
  spectator?: boolean;
  roomClosesAt?: number;
}) {
  // In 2v2 the winner is a team; in 1v1 it's a single player. Normalize both
  // into one champion (name + cosmetics) so the trophy stage stays shared.
  const is2v2 = Boolean(teams && teams.length);
  const winnerPlayer = winnerId ? players.find((p) => p.id === winnerId) : undefined;
  const winnerTeam = is2v2 && winnerTeamId ? teams?.find((t) => t.id === winnerTeamId) : undefined;
  const hasWinner = is2v2 ? Boolean(winnerTeam) : Boolean(winnerPlayer);
  const tied = !hasWinner;
  const won = is2v2
    ? Boolean(self?.teamId && self.teamId === winnerTeamId)
    : Boolean(winnerId && winnerId === selfId);
  // Avatar cosmetics: in 2v2 borrow the winning team's first player.
  const championAvatar = is2v2 ? players.find((p) => p.teamId === winnerTeamId) : winnerPlayer;
  const championName = is2v2 ? (winnerTeam?.name ?? "") : (winnerPlayer?.name ?? "");
  const championIsSelf = is2v2 ? won : winnerId === selfId;
  // Defeated player sees their own farmer kneeling; spectators/winner see the champion.
  const lost = Boolean(hasWinner && !spectator && !won && self);
  const reasonText =
    reason === "race"
      ? "ทำเหรียญถึงเป้า"
      : reason === "timeout"
        ? "หมดเวลา"
        : reason === "kick"
          ? "ถุกเตะ"
          : "ตัดการเชื่อมต่อ";
  const subText = won ? "ยอดเยี่ยม! คุณคือผู้ชนะ" : "ผู้ชนะรอบนี้";
  const sortedPlayers = [...players].sort((a, b) => b.coins - a.coins);
  const sortedTeams = teams ? [...teams].sort((a, b) => b.coins - a.coins) : [];
  const winnerTeamMembers =
    is2v2 && winnerTeamId ? players.filter((p) => p.teamId === winnerTeamId) : [];
  const loserTeamMembers =
    is2v2 && self?.teamId ? players.filter((p) => p.teamId === self.teamId) : [];

  const [closeCountdown, setCloseCountdown] = useState(() =>
    roomClosesAt ? Math.max(0, Math.ceil((roomClosesAt - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!roomClosesAt) return;
    const tick = () =>
      setCloseCountdown(Math.max(0, Math.ceil((roomClosesAt - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [roomClosesAt]);
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-4"
      style={{ background: "rgba(10,5,15,0.85)" }}
    >
      <div className="pixel-panel p-8 flex flex-col items-center gap-5 w-[min(420px,92vw)]">
        {tied ? (
          <>
            <div
              className="font-pixel text-[32px]"
              style={{ color: "#f4e4c1", textShadow: "3px 3px 0 #1a0f1f" }}
            >
              เสมอ
            </div>
            <div className="font-pixel text-[10px] text-[var(--muted-foreground)]">
              {reasonText}
            </div>
          </>
        ) : lost && self ? (
          <div className="loser-stage">
            <div className="loser-title font-thai">แพ้แล้ว</div>
            <div style={{ display: "flex", justifyContent: "center", gap: "4px" }}>
              {(is2v2 ? loserTeamMembers : [self]).map((m) => (
                <div className="loser-kneel-zone" key={m.id}>
                  <span className="loser-frustration loser-frustration-a" aria-hidden />
                  <span className="loser-frustration loser-frustration-b" aria-hidden />
                  <div className="loser-avatar">
                    <LoserKneel cosmetics={m.cosmetics} />
                  </div>
                </div>
              ))}
            </div>
            <div
              className="winner-name font-pixel"
              style={{ color: "#ff6b6b", textShadow: "3px 3px 0 #1a0f1f" }}
            >
              {is2v2
                ? loserTeamMembers
                    .map((m) => m.name + (m.id === selfId ? " (YOU)" : ""))
                    .join(" · ")
                : `${self.name} (YOU)`}
            </div>
            <div className="winner-sub font-pixel text-[var(--muted-foreground)]">
              เจ็บใจรอบนี้ · ชนะโดย {championName}
            </div>
          </div>
        ) : (
          <div className="winner-stage">
            <div className="winner-confetti" aria-hidden>
              {WINNER_CONFETTI.map((c, i) => (
                <i
                  key={i}
                  style={
                    {
                      left: `${c.left}%`,
                      width: c.size,
                      height: c.size,
                      background: c.color,
                      "--dur": `${c.dur}s`,
                      "--delay": `${c.delay}s`,
                      "--drift": `${c.drift}px`,
                      "--spin": `${c.spin * 360}deg`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <div className="winner-award font-thai">ผู้ชนะ</div>
            <div style={{ display: "flex", justifyContent: "center", gap: "4px" }}>
              {(is2v2
                ? winnerTeamMembers
                : [championAvatar ?? { id: "_", cosmetics: DEFAULT_COSMETICS }]
              ).map((m) => (
                <div className="winner-trophy-zone" key={m.id}>
                  <span className="winner-spark winner-spark-a" aria-hidden />
                  <span className="winner-spark winner-spark-b" aria-hidden />
                  <span className="winner-spark winner-spark-c" aria-hidden />
                  <div className="winner-avatar">
                    <WinnerChampion cosmetics={m.cosmetics ?? DEFAULT_COSMETICS} />
                  </div>
                  <div className="winner-podium font-pixel">1</div>
                </div>
              ))}
            </div>
            <div
              className="winner-name font-pixel"
              style={{ color: "#ffd24a", textShadow: "3px 3px 0 #1a0f1f" }}
            >
              {is2v2
                ? winnerTeamMembers
                    .map((m) => m.name + (m.id === selfId ? " (YOU)" : ""))
                    .join(" · ")
                : `${championName}${championIsSelf ? " (YOU)" : ""}`}
            </div>
            <div className="winner-sub font-pixel text-[var(--muted-foreground)]">
              {spectator ? "ผู้ชนะ" : subText} · {reasonText}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 w-full">
          {is2v2
            ? sortedTeams.map((team) => {
                const members = players.filter((p) => p.teamId === team.id);
                const isMyTeam = self?.teamId === team.id;
                return (
                  <div key={team.id} className="flex flex-col gap-1 font-pixel text-[10px]">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        {team.name}
                        {isMyTeam ? " (YOU)" : ""}
                      </span>
                      <span className="text-[var(--gold)] flex items-center gap-1">
                        <CoinIcon size={12} />
                        {team.coins}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[8px] text-[var(--muted-foreground)]">
                      {members.map((m) => (
                        <span key={m.id}>
                          {m.role === "seller" ? "🛒" : "🌱"} {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            : sortedPlayers.map((p) => {
                const stat = recap?.players.find((entry) => entry.id === p.id);
                return (
                  <div key={p.id} className="flex flex-col gap-1 font-pixel text-[10px]">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        {p.name}
                        {p.id === selfId ? " (YOU)" : ""}
                      </span>
                      <span className="text-[var(--gold)] flex items-center gap-1">
                        <CoinIcon size={12} />
                        {p.coins}
                      </span>
                    </div>
                    {stat && (
                      <div className="flex items-center justify-between gap-3 text-[8px] text-[var(--muted-foreground)]">
                        <span>เก็บเกี่ยว {stat.harvests}</span>
                        <span>ไดรรับ {stat.coinsEarned}</span>
                        <span>ท็อป {stat.topCrop ? CROPS[stat.topCrop].name : "-"}</span>
                      </div>
                    )}
                  </div>
                );
              })}
        </div>
        {recap && (
          <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">
            เวลาที่เหลือ {Math.ceil(recap.timeRemainingMs / 1000)}ว"
          </div>
        )}
        {!spectator && (
          <button
            onClick={() => {
              SFX.click();
              onRematch();
            }}
            className="pixel-btn"
            data-accent={!self?.ready ? "true" : undefined}
            disabled={self?.ready || closeCountdown === 0}
          >
            <span className="font-pixel text-[12px]">
              {self?.ready ? "พร้อม — รออยู่" : "แข่งใหม่อีกครั้ง"}
            </span>
          </button>
        )}
        {closeCountdown > 0 && (
          <div className="font-pixel text-[9px] text-[var(--muted-foreground)] text-center">
            ห้องปิดใน {closeCountdown} วินาที
          </div>
        )}
        {closeCountdown === 0 && roomClosesAt && (
          <div className="font-pixel text-[9px] text-[#ff6b6b] text-center">ห้องปิดแล้ว</div>
        )}
        <a href="/lobby" onClick={() => SFX.click()} className="pixel-btn">
          <span className="font-pixel text-[10px]">ออกจากห้อง</span>
        </a>
      </div>
    </div>
  );
}
