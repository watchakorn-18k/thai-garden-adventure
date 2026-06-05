import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "./PixelIcons";
import { applyAction, facingTile } from "@/lib/game-logic";
import { COLS, CROPS, ROWS, type CropId, type Direction, type Tool } from "@/lib/game-types";
import { readCosmetics, writeCosmetics, type PlayerCosmetics } from "@/lib/player-cosmetics";
import { useMatch } from "@/lib/match-client";
import { SFX } from "@/lib/sfx";
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

const STAGE_COPY: Record<RoomStage, { label: string; desc: string }> = {
  classic: { label: "CLASSIC FIELD", desc: "สวนมาตรฐาน แข่งทำเหรียญไว" },
  water: { label: "CANAL FIELD", desc: "คลองชลประทานล้อมสวน" },
  festival: { label: "FESTIVAL NIGHT", desc: "บรรยากาศงานวัด โทนทอง" },
};

interface Props {
  code: string;
  role?: MatchRole;
}

export default function MultiplayerGame({ code, role = "player" }: Props) {
  const name = useMemo(() => {
    if (typeof window === "undefined") return "Player";
    return localStorage.getItem("tg.name")?.trim() || "Player";
  }, []);

  const [cosmetics, setCosmetics] = useState(() => readCosmetics());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outfitOpen, setOutfitOpen] = useState(false);
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
            if (ev.playerId !== selfId || matchRole === "spectator") SFX.hoe();
          } else if (ev.kind === "water") {
            if (ev.playerId !== selfId || matchRole === "spectator") SFX.water();
          } else if (ev.kind === "plant") {
            if (ev.playerId !== selfId || matchRole === "spectator") SFX.plant();
          } else if (ev.kind === "harvest") {
            if (ev.reward === 0) {
              if (ev.playerId !== selfId || matchRole === "spectator") SFX.hoe();
            } else {
              if (ev.playerId !== selfId || matchRole === "spectator") SFX.harvest();
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
          } else if (ev.kind === "insufficient_funds") {
            if (ev.playerId === selfId) {
              SFX.bad();
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
    const audio = lobbyMusicRef.current ?? new Audio(lobbyMusicUrl);
    lobbyMusicRef.current = audio;
    audio.loop = true;
    audio.volume = 0.35;

    if (!shouldPlayLobbyMusic) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    const play = () => {
      void audio.play().catch(() => undefined);
    };
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      audio.pause();
    };
  }, [musicEnabled, state?.status]);

  useEffect(() => {
    const shouldPlayGameMusic = musicEnabled && state?.status === "playing";
    const audio = gamePlayMusicRef.current ?? new Audio(gamePlayMusicUrl);
    gamePlayMusicRef.current = audio;
    audio.loop = true;
    audio.volume = 0.3;

    if (!shouldPlayGameMusic) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    const play = () => {
      void audio.play().catch(() => undefined);
    };
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      audio.pause();
    };
  }, [musicEnabled, state?.status]);

  useEffect(() => {
    const winnerAudio = winnerSoundRef.current ?? new Audio(winnerSoundUrl);
    const loserAudio = loserSoundRef.current ?? new Audio(loserSoundUrl);
    const drawAudio = drawSoundRef.current ?? new Audio(drawSoundUrl);
    winnerSoundRef.current = winnerAudio;
    loserSoundRef.current = loserAudio;
    drawSoundRef.current = drawAudio;
    winnerAudio.loop = true;
    loserAudio.loop = true;
    drawAudio.loop = true;
    winnerAudio.volume = 0.22;
    loserAudio.volume = 0.22;
    drawAudio.volume = 0.22;

    const endSounds = [winnerAudio, loserAudio, drawAudio];
    const stopEndSounds = () => {
      for (const sound of endSounds) {
        sound.pause();
        sound.currentTime = 0;
      }
    };

    if (!musicEnabled || state?.status !== "ended") {
      stopEndSounds();
      return;
    }

    const audio = !state.winnerId
      ? drawAudio
      : selfId && state.winnerId !== selfId
        ? loserAudio
        : winnerAudio;
    for (const sound of endSounds) {
      if (sound === audio) continue;
      sound.pause();
      sound.currentTime = 0;
    }

    const play = () => {
      void audio.play().catch(() => undefined);
    };
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });

    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      audio.pause();
    };
  }, [musicEnabled, selfId, state?.status, state?.winnerId]);

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
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [combo, setCombo] = useState(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSpectator = matchRole === "spectator";
  const self = isSpectator ? undefined : state?.players.find((p) => p.id === selfId);
  const renderedSelf = localPlayer ?? self;
  const hasHostControls = isHost || Boolean(state?.hostId && state.hostId === selfId);
  const opp = state?.players.find((p) => p.id !== selfId);
  useEffect(() => {
    selfRef.current = self;
    statusRef.current = state?.status;
  }, [self, state?.status]);

  useEffect(() => {
    recalculateLocalPlayer();
  }, [self, state?.status, recalculateLocalPlayer]);

  const setMovement = useCallback(
    (dir: Direction | null) => {
      if (isSpectator) return;
      if (!selfRef.current || statusRef.current !== "playing") return;
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
    setActionFlash((n) => n + 1);
    setActing(true);
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    actionTimerRef.current = setTimeout(() => setActing(false), 320);
    const local = localPlayerRef.current;
    if (local) {
      const target = facingTile(local.pos, local.dir);
      if (target) {
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
      send({ t: "action", pos: local.pos, dir: local.dir });
    }
  }, [isSpectator, send, recalculateLocalPlayer]);

  useEffect(() => {
    if (isSpectator) return;
    const onDown = (e: KeyboardEvent) => {
      const k = normalizedKeyboardKey(e);
      keys.current.add(k);
      if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
      }
      const dir = keyToDir(k);
      if (dir) setMovement(keysToDir(keys.current, nextDiagonalAxis));
      if ((k === "space" || k === "enter") && !e.repeat) sendAction();
      if (
        k === "keyr" &&
        (statusRef.current === "lobby" || statusRef.current === "crop_selection")
      ) {
        SFX.click();
        send({ t: "ready" });
      }
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
        sub={lastError ? `ROOM ${code}` : `ROOM ${code}`}
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
        status={status}
        role={matchRole}
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
          aria-label={musicEnabled ? "Mute lobby music" : "Play lobby music"}
          title={musicEnabled ? "Mute lobby music" : "Play lobby music"}
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
          <SpectatorMatchView players={state.players} events={events} />
        ) : (
          self && (
            <div className="relative z-10 flex flex-col items-center gap-3">
              {opp &&
                (state.status === "playing" ? (
                  <OpponentStatusCard player={opp} />
                ) : (
                  <OpponentField player={opp} />
                ))}
              <SelfField
                player={renderedSelf ?? self}
                events={events.filter((e) => e.ev.playerId === self.id)}
                actionFlash={actionFlash}
                acting={acting}
                predictedDir={predictedDir}
                isSelf={true}
              />
            </div>
          )
        ))}

      {state.status === "ended" && (
        <EndOverlay
          winnerId={state.winnerId}
          reason={state.endedReason}
          selfId={selfId}
          players={state.players}
          recap={state.recap}
          onRematch={() => send({ t: "rematch" })}
          self={self}
          spectator={isSpectator}
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

      {state.status === "playing" && self && !isSpectator && (
        <Toolbar self={self} send={send} marketPrices={state.marketPrices} />
      )}
      {state.status !== "crop_ban" &&
        state.status !== "crop_selection" &&
        state.status !== "prepare_countdown" && (
          <CropIndexBook
            compact
            marketPrices={state.marketPrices}
            selectedCropId={self?.seedChoice}
            availableCropIds={
              state.status === "playing" && self ? selectedCropPool(self.selectedCrops) : undefined
            }
            onSelectCrop={
              !isSpectator && self && state.status === "playing"
                ? (id) => {
                    send({ t: "seed", id });
                  }
                : undefined
            }
          />
        )}
      {state.status === "playing" && self && !isSpectator && (
        <MobileControls setMovement={setMovement} sendAction={sendAction} />
      )}
      {status !== "open" && (
        <ConnectionBanner text={lastError?.message ?? "กำลังเชื่อมต่อใหม่..."} />
      )}
      {lastError && status === "open" && <ConnectionBanner text={lastError.message} />}

      {!isSpectator && <MultiplayerControlsGuide />}
      {isSpectator && <SpectatorGuide />}
    </div>
  );
}

function SpectatorGuide() {
  return (
    <div className="relative z-10 font-pixel text-[9px] text-[var(--muted-foreground)] text-center hidden sm:block">
      <span className="pixel-chip mr-2">REFEREE VIEW</span>ดูคะแนน เวลา สถานะผู้เล่น สำหรับ live สด
    </div>
  );
}

function MultiplayerControlsGuide() {
  return (
    <div className="relative z-10 hidden w-full max-w-5xl sm:block">
      <div className="multi-guide pixel-panel px-5 py-4">
        <div className="multi-guide-head">
          <span className="font-pixel text-[8px] tracking-[2px] text-[var(--gold)]">
            DUEL GUIDE
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
              <div className="font-pixel text-[9px] tracking-wider">MOVE</div>
              <div className="font-pixel text-[7px] text-[var(--muted-foreground)]">
                ลูกศรก็ใช้ได้
              </div>
            </div>
          </div>

          <span className="multi-guide-rule" />

          <div className="multi-guide-actions">
            <GuideAction keys="SPACE" label="USE" sub="ลงมือกับช่องตรงหน้า" />
            <GuideAction keys="1 / 2 / 3" label="TOOL" sub="จอบ · น้ำ · เมล็ด" />
            <GuideAction keys="R" label="READY" sub="พร้อมใน lobby / เลือกผัก" />
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
  status,
  role,
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
  };
  settings: RoomSettings;
  status: string;
  role: MatchRole;
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
            title="Copy room code"
          >
            <span className="font-pixel text-[10px] text-[var(--muted-foreground)]">ROOM</span>
            <span className="font-pixel text-[18px] text-[var(--gold)] tracking-[4px]">{code}</span>
            <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
              {copied === "ok" ? "COPIED" : copied === "fail" ? "COPY FAIL" : "COPY CODE"}
            </span>
          </button>

          <div className="flex min-w-0 items-center gap-4">
            <PlayerBar player={self} side="left" targetCoins={settings.targetCoins} />
            <span className="font-pixel text-[12px] text-[var(--muted-foreground)]">VS</span>
            <PlayerBar player={opp} side="right" targetCoins={settings.targetCoins} />
          </div>

          <div className="flex items-center justify-end gap-4">
            <div className="flex flex-col items-end gap-1">
              <div className="font-pixel text-[16px] text-[var(--gold)]">
                {mm}:{ss}
              </div>
              <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">
                {status !== "open"
                  ? "RECONNECTING"
                  : role === "spectator"
                    ? `REFEREE · ${state.status.toUpperCase()}`
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
        <span className="font-pixel text-[10px]">{player?.name ?? "WAITING..."}</span>
        {player && (
          <span className="font-pixel text-[10px] text-[var(--gold)] flex items-center gap-1">
            <CoinIcon size={12} />
            {player.coins}/{targetCoins}
          </span>
        )}
        {player && !player.connected && (
          <span className="font-pixel text-[8px]" style={{ color: "#ff6b6b" }}>
            RECONNECTING
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
}) {
  const waitingForOpponent = !opp;
  const readyCount = [self, opp].filter((p) => p?.ready).length;
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
            MATCH LOBBY
          </span>
          {isHost && (
            <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
              HOST
            </span>
          )}
        </div>
        <h2 className="font-pixel lobby-title">THAI GARDEN DUEL</h2>
        <p className="lobby-subtitle">
          {waitingForOpponent
            ? "ส่งลิงก์ให้เพื่อน แล้วตั้งกติกาห้องก่อนเริ่ม"
            : self?.ready && opp?.ready
              ? "ทั้งสองฝั่งพร้อมแล้ว · กำลังนับถอยหลัง"
              : `พร้อมแล้ว ${readyCount}/${settings.maxPlayers} · กด READY เพื่อเข้ารอบ`}
        </p>
      </div>

      <RoomSettingsSummary settings={settings} isHost={isHost} onOpenSettings={onOpenSettings} />

      <div className="lobby-versus-grid">
        <PlayerCard player={self} label="YOU" side="left" hostId={state.hostId} />
        <div className="lobby-vs-core" aria-hidden>
          <span>VS</span>
        </div>
        <PlayerCard
          player={opp}
          label="RIVAL"
          side="right"
          hostId={state.hostId}
          canKick={isHost && Boolean(opp)}
          onKick={onKick}
        />
      </div>

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
            <span className="font-pixel text-[12px]">{self?.ready ? "UNREADY" : "READY UP"}</span>
            <span className="font-pixel text-[8px] opacity-70">R</span>
          </button>
          {isHost && opp && (
            <button
              onClick={() => {
                SFX.click();
                onStart();
              }}
              className="pixel-btn lobby-ready-btn"
              data-accent="true"
            >
              <span className="font-pixel text-[12px]">START</span>
              <span className="font-pixel text-[8px] opacity-70">HOST</span>
            </button>
          )}
          <button
            onClick={() => {
              SFX.click();
              onLeaveSlot();
            }}
            className="pixel-btn"
          >
            <span className="font-pixel text-[10px]">LEAVE SLOT</span>
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

  return (
    <section className="lobby-stage relative z-10 w-full max-w-5xl">
      <div className="lobby-title-card pixel-panel">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-pixel text-[8px] tracking-[3px] text-[var(--muted-foreground)]">
            CROP BAN
          </span>
          <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
            00:{ss}
          </span>
        </div>
        <h2 className="font-pixel lobby-title">แบนผัก 1 อย่าง</h2>
        <p className="lobby-subtitle">แบนซ้ำกันไม่ได้ · กดยืนยันการแบนเพื่อล็อกตัวเลือก</p>
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
                  PLAYER {idx + 1}: <span className="text-white">{player.name}</span>
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
          return (
            <button
              key={crop.id}
              type="button"
              onClick={() => {
                if (isSpectator || self?.ready || isBannedByOther) return;
                SFX.click();
                onBanCrop(crop.id);
              }}
              disabled={isSpectator || self?.ready || isBannedByOther}
              className="farm-crop-card pixel-btn text-left"
              data-active={active ? "true" : undefined}
              title={`แบน ${crop.name}`}
              style={
                isBannedByOther
                  ? { opacity: 0.4, filter: "grayscale(100%)", cursor: "not-allowed" }
                  : undefined
              }
            >
              <span className="farm-crop-icon">
                <Icon size={26} />
              </span>
              <span className="farm-crop-body">
                <span className="farm-crop-name">{crop.name}</span>
                {isBannedByOther && (
                  <span className="font-pixel text-[7px] text-[#ff6b6b] block">ALREADY BANNED</span>
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
              SFX.click();
              onReady();
            }}
            disabled={self.ready}
            className="pixel-btn lobby-ready-btn w-full max-w-xs"
            data-accent={self.ready ? undefined : "true"}
          >
            <span className="font-pixel text-[12px]">
              {self.ready ? "READY (ยืนยันแล้ว)" : "ยืนยันการแบน (Confirm Ban)"}
            </span>
          </button>
        </div>
      )}

      <div className="pixel-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {state.players.map((player) => (
            <span
              key={player.id}
              className="pixel-chip font-pixel text-[8px]"
              data-gold={player.ready ? "true" : undefined}
            >
              {player.name}:{" "}
              {player.bannedCrop ? `แบน ${CROPS[player.bannedCrop].name}` : "ยังไม่เลือก"}
              {player.ready ? " [READY]" : " [เลือกอยู่]"}
            </span>
          ))}
        </div>
        <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
          เมื่อกดยืนยันครบทั้งสองฝั่ง เวลาจะลดเหลือ 5 วินาที
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

  const toggleCrop = (id: CropId) => {
    if (isSpectator || isLocked || !self) return;
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
            {isLocked ? "LOCKED CROPS" : "CROP SELECTION"}
          </span>
          <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
            {isLocked ? "เตรียมเริ่มเกม" : `${mm}:${ss}`}
          </span>
        </div>
        <h2 className="font-pixel lobby-title">เลือกผัก 4 อย่าง</h2>
        <p className="lobby-subtitle">
          {isLocked
            ? "ล็อกผักแล้ว · เตรียมตัว 3, 2, 1"
            : `เลือกของตัวเอง ${selected.length}/${SELECTED_CROP_COUNT} แล้วกด READY`}
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
                      PLAYER {idx + 1}: {player.name}
                    </span>
                    <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
                      {player.ready ? "READY (LOCKED)" : "PICKING"}
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
                disabled={isSpectator || isLocked || banned}
                className="farm-crop-card pixel-btn text-left"
                data-active={active ? "true" : undefined}
                title={`${crop.name} · ซื้อ ${crop.seedCost} · ขาย ${crop.sellPrice}`}
              >
                <span className="farm-crop-icon">
                  <Icon size={26} />
                </span>
                <span className="farm-crop-body">
                  <span className="farm-crop-name">{crop.name}</span>
                  {banned && <span className="font-pixel text-[7px] text-[#ff6b6b]">BANNED</span>}
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
              {player.name}: {player.selectedCrops.length}/{SELECTED_CROP_COUNT}{" "}
              {player.ready ? "READY" : "PICKING"}
            </span>
          ))}
        </div>
        {!isSpectator && !isLocked && (
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
            <span className="font-pixel text-[12px]">{self?.ready ? "UNREADY" : "READY"}</span>
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
        TARGET {settings.targetCoins}
      </span>
      <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
        TIME {Math.round(settings.durationMs / 60000)} MIN
      </span>
      <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
        SLOTS {settings.maxPlayers}
      </span>
      {isHost ? (
        <button
          onClick={() => {
            SFX.click();
            onOpenSettings();
          }}
          className="pixel-btn px-3 py-2"
        >
          <span className="font-pixel text-[8px]">SETTINGS</span>
        </button>
      ) : (
        <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">HOST SETTINGS</span>
      )}
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
}: {
  player?: PublicPlayer;
  label: string;
  side?: "left" | "right";
  hostId?: string;
  canKick?: boolean;
  onKick?: (playerId: string) => void;
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
        <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">{label}</span>
        <div className="flex items-center gap-2">
          {player?.id === hostId && (
            <span className="font-pixel text-[7px] text-[var(--gold)]">HOST</span>
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
      <div className="lobby-player-name font-pixel">{player?.name ?? "OPEN SLOT"}</div>
      <div className="lobby-player-meta font-pixel" data-ready={ready ? "true" : undefined}>
        {player ? (ready ? "LOCKED IN" : "WAITING") : "INVITE FRIEND"}
      </div>
      {canKick && player && (
        <button
          onClick={() => {
            SFX.click();
            onKick?.(player.id);
          }}
          className="pixel-btn mt-3 px-3 py-2"
          data-accent="true"
        >
          <span className="font-pixel text-[8px]">KICK</span>
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
              HOST SETTINGS
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
            <span className="font-pixel text-[10px]">CLOSE</span>
          </button>
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
          <SettingField label="TARGET" helper="เหรียญที่ต้องทำให้ถึงก่อน" value={draft.targetCoins}>
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
          <SettingField label="SLOTS" helper="ตอนนี้ล็อก 2 คน" value={draft.maxPlayers}>
            <input
              className="pixel-chip w-full font-pixel text-[16px] bg-[#24132f] text-[#fff3c4] px-4 py-3 opacity-80"
              type="number"
              min={2}
              max={2}
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
            <span className="font-pixel text-[11px]">CANCEL</span>
          </button>
          <button
            onClick={() => {
              SFX.click();
              onSave(draft);
            }}
            className="pixel-btn px-5 py-4"
            data-accent="true"
          >
            <span className="font-pixel text-[11px]">SAVE SETTINGS</span>
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
}: {
  players: PublicPlayer[];
  state: PublicMatchState;
  isHost: boolean;
  onClaimSlot: () => void;
  onForceStart: () => void;
  onOpenSettings: () => void;
}) {
  const slotsFull = players.length >= state.settings.maxPlayers;
  return (
    <section className="lobby-stage relative z-10 w-full max-w-5xl">
      <div className="lobby-title-card pixel-panel">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-pixel text-[8px] tracking-[3px] text-[var(--muted-foreground)]">
            REFEREE VIEW
          </span>
          {isHost && (
            <span className="pixel-chip font-pixel text-[8px]" data-gold="true">
              HOST
            </span>
          )}
        </div>
        <h2 className="font-pixel lobby-title">WATCH MODE</h2>
        <p className="lobby-subtitle">เริ่มเป็นผู้ชมก่อน · กดเข้า slot เมื่อต้องการลงแข่ง</p>
      </div>

      <RoomSettingsSummary
        settings={state.settings}
        isHost={isHost}
        onOpenSettings={onOpenSettings}
      />

      <div className="lobby-versus-grid">
        <PlayerCard player={players[0]} label="PLAYER 1" side="left" hostId={state.hostId} />
        <div className="lobby-vs-core" aria-hidden>
          <span>VS</span>
        </div>
        <PlayerCard player={players[1]} label="PLAYER 2" side="right" hostId={state.hostId} />
      </div>

      <div className="lobby-ready-row">
        <div className="lobby-ruleline" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => {
              SFX.epicSlot();
              onClaimSlot();
            }}
            className="pixel-btn lobby-ready-btn"
            data-accent={!slotsFull ? "true" : undefined}
            disabled={slotsFull}
          >
            <span className="font-pixel text-[12px]">
              {slotsFull ? "PLAYER SLOTS FULL" : "ENTER PLAYER SLOT"}
            </span>
          </button>
          {isHost && slotsFull && (
            <button
              onClick={() => {
                SFX.click();
                onForceStart();
              }}
              className="pixel-btn lobby-ready-btn"
              data-accent="true"
            >
              <span className="font-pixel text-[12px]">START</span>
              <span className="font-pixel text-[8px] opacity-70">HOST</span>
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
        {n > 0 ? n : "GO!"}
      </div>
      {isHost && n > 0 && (
        <button
          onClick={() => {
            SFX.click();
            onCancel();
          }}
          className="pixel-btn pointer-events-auto"
        >
          <span className="font-pixel text-[10px]">CANCEL COUNTDOWN</span>
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
}: {
  player: PublicPlayer;
  events: { id: number; ev: ServerEvent }[];
  actionFlash: number;
  acting: boolean;
  predictedDir?: Direction | null;
  isSelf?: boolean;
}) {
  return (
    <PhaserField
      player={player}
      events={events}
      acting={acting}
      predictedDir={predictedDir}
      isSelf={isSelf}
    />
  );
}

function SpectatorMatchView({
  players,
  events,
}: {
  players: PublicPlayer[];
  events: { id: number; ev: ServerEvent }[];
}) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-3">
      <div className="pixel-panel flex items-center gap-4 px-4 py-3">
        <span className="font-pixel text-[10px] text-[var(--gold)]">REFEREE VIEW</span>
        <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
          {players.length}/2 PLAYERS
        </span>
      </div>
      <div className="flex flex-col xl:flex-row items-center gap-4">
        {players.map((player, i) => (
          <div key={player.id} className="flex flex-col items-center gap-2">
            <OpponentStatusCard player={player} label={`PLAYER ${i + 1}`} />
            <SelfField
              player={player}
              events={events.filter((e) => e.ev.playerId === player.id)}
              actionFlash={0}
              acting={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function OpponentStatusCard({
  player,
  label = "OPPONENT",
}: {
  player: PublicPlayer;
  label?: string;
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
        <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">{label}</div>
        <div className="font-pixel text-[12px]">{player.name}</div>
      </div>
      <div className="mx-1 h-8 w-1" style={{ background: "#1a0f1f" }} />
      <div className="flex flex-col gap-1">
        <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">COINS</div>
        <div className="font-pixel text-[12px] text-[var(--gold)]">{player.coins}</div>
      </div>
      <div
        className="font-pixel text-[8px]"
        style={{ color: player.connected ? "#86efac" : "#f87171" }}
      >
        {player.connected ? "ONLINE" : "OFFLINE"}
      </div>
    </div>
  );
}

function OpponentField({ player }: { player: PublicPlayer }) {
  return <OpponentStatusCard player={player} />;
}

function Toolbar({
  self,
  send,
  marketPrices,
}: {
  self: PublicPlayer;
  send: (msg: Parameters<ReturnType<typeof useMatch>["send"]>[0]) => void;
  marketPrices?: Record<CropId, number>;
}) {
  const cropPool = selectedCropPool(self.selectedCrops);

  return (
    <div className="farm-toolbar relative z-10 w-full max-w-5xl pixel-panel">
      <div className="farm-toolbar-section farm-toolbar-tools">
        <span className="farm-toolbar-label">TOOLS</span>
        <div className="farm-tool-grid">
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
        <span className="farm-toolbar-label">CROPS</span>
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
        <span className="font-pixel text-[10px]">USE</span>
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

function EndOverlay({
  winnerId,
  reason,
  selfId,
  players,
  recap,
  onRematch,
  self,
  spectator = false,
}: {
  winnerId?: string;
  reason?: "race" | "timeout" | "forfeit" | "kick";
  selfId: string | null;
  players: PublicPlayer[];
  recap?: MatchRecap;
  onRematch: () => void;
  self?: PublicPlayer;
  spectator?: boolean;
}) {
  const won = winnerId && winnerId === selfId;
  const tied = !winnerId;
  const reasonText =
    reason === "race"
      ? "FIRST TO 500"
      : reason === "timeout"
        ? "TIME UP"
        : reason === "kick"
          ? "KICKED"
          : "DISCONNECTED";
  const sortedPlayers = [...players].sort((a, b) => b.coins - a.coins);
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center"
      style={{ background: "rgba(10,5,15,0.85)" }}
    >
      <div className="pixel-panel p-8 flex flex-col items-center gap-5 min-w-[360px]">
        <div
          className="font-pixel text-[32px]"
          style={{
            color: tied ? "#f4e4c1" : won ? "#ffd24a" : "#ff6b6b",
            textShadow: "3px 3px 0 #1a0f1f",
          }}
        >
          {spectator
            ? tied
              ? "DRAW"
              : "MATCH END"
            : tied
              ? "DRAW"
              : won
                ? "YOU WIN!"
                : "YOU LOSE"}
        </div>
        <div className="font-pixel text-[10px] text-[var(--muted-foreground)]">{reasonText}</div>
        <div className="flex flex-col gap-2 w-full">
          {sortedPlayers.map((p) => {
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
                    <span>HARVEST {stat.harvests}</span>
                    <span>EARNED {stat.coinsEarned}</span>
                    <span>TOP {stat.topCrop ? CROPS[stat.topCrop].name : "-"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {recap && (
          <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">
            TIME LEFT {Math.ceil(recap.timeRemainingMs / 1000)}s
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
            disabled={self?.ready}
          >
            <span className="font-pixel text-[12px]">
              {self?.ready ? "READY — WAITING" : "REMATCH"}
            </span>
          </button>
        )}
        <a
          href="/lobby"
          onClick={() => SFX.click()}
          className="font-pixel text-[9px] text-[var(--muted-foreground)] opacity-70 hover:opacity-100"
        >
          ออกจากห้อง
        </a>
      </div>
    </div>
  );
}
