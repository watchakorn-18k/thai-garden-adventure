import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PixelFarmer from "./PixelFarmer";
import PixelCrop from "./PixelCrop";
import {
  ChiliIcon,
  CoinIcon,
  EggplantIcon,
  HoeIcon,
  MorningGloryIcon,
  RiceIcon,
  SeedIcon,
  WaterCanIcon,
} from "./PixelIcons";
import { COLS, CROPS, ROWS, type CropId, type Direction, type Tool } from "@/lib/game-types";
import { movePos } from "@/lib/game-logic";
import { useMatch } from "@/lib/match-client";
import {
  MATCH_DURATION_MS,
  TARGET_COINS,
  type PublicPlayer,
  type ServerEvent,
} from "@/lib/match-protocol";

const TILE_SELF = 56;
const MOVE_REPEAT_MS = 70;

const CROP_ICONS: Record<CropId, React.ComponentType<{ size?: number }>> = {
  chili: ChiliIcon,
  rice: RiceIcon,
  morning_glory: MorningGloryIcon,
  eggplant: EggplantIcon,
};

interface Props {
  code: string;
}

export default function MultiplayerGame({ code }: Props) {
  const name = useMemo(() => {
    if (typeof window === "undefined") return "Player";
    return localStorage.getItem("tg.name")?.trim() || "Player";
  }, []);

  const [events, setEvents] = useState<{ id: number; ev: ServerEvent }[]>([]);
  const evIdRef = useRef(0);
  const { state, selfId, status, lastError, send } = useMatch({
    code,
    name,
    onEvents: (batch) => {
      setEvents((prev) => {
        const next = [...prev];
        for (const ev of batch) {
          const id = ++evIdRef.current;
          next.push({ id, ev });
          setTimeout(() => setEvents((p) => p.filter((q) => q.id !== id)), 950);
        }
        return next;
      });
    },
  });

  const keys = useRef<Set<string>>(new Set());
  const lastSentDir = useRef<{ dir: Direction; at: number } | null>(null);
  const selfRef = useRef<PublicPlayer | undefined>(undefined);
  const statusRef = useRef<string | undefined>(undefined);
  const [predictedMove, setPredictedMove] = useState<{
    playerId: string;
    pos: { x: number; y: number };
    dir: Direction;
  } | null>(null);
  const [actionFlash, setActionFlash] = useState(0);

  const self = state?.players.find((p) => p.id === selfId);
  const opp = state?.players.find((p) => p.id !== selfId);
  const renderSelf = self
    ? predictedMove?.playerId === self.id
      ? { ...self, pos: predictedMove.pos, dir: predictedMove.dir }
      : self
    : undefined;

  useEffect(() => {
    selfRef.current = self;
    statusRef.current = state?.status;
  }, [self, state?.status]);

  const sendMove = useCallback(
    (dir: Direction) => {
      const currentSelf = selfRef.current;
      if (!currentSelf || statusRef.current !== "playing") return;
      setPredictedMove((current) => ({
        playerId: currentSelf.id,
        pos: movePos(current?.playerId === currentSelf.id ? current.pos : currentSelf.pos, dir),
        dir,
      }));
      send({ t: "move", dir });
    },
    [send],
  );

  const sendAction = useCallback(() => {
    if (statusRef.current !== "playing") return;
    setActionFlash((n) => n + 1);
    send({ t: "action" });
  }, [send]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      const dir = keyToDir(k);
      if (dir && !e.repeat) {
        lastSentDir.current = { dir, at: Date.now() };
        sendMove(dir);
      }
      if (k === " " || k === "enter") sendAction();
      if (k === "1") send({ t: "tool", tool: "hoe" });
      if (k === "2") send({ t: "tool", tool: "watering_can" });
      if (k === "3") send({ t: "tool", tool: "seed" });
    };
    const onUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [send, sendAction, sendMove]);

  useEffect(() => {
    if (state?.status !== "playing") return;
    const i = setInterval(() => {
      const k = keys.current;
      const dir = keysToDir(k);
      if (!dir) {
        lastSentDir.current = null;
        return;
      }
      const now = Date.now();
      const last = lastSentDir.current;
      if (last && last.dir === dir && now - last.at < MOVE_REPEAT_MS) return;
      lastSentDir.current = { dir, at: now };
      sendMove(dir);
    }, 60);
    return () => clearInterval(i);
  }, [state?.status, sendMove]);

  useEffect(() => {
    if (!self || !predictedMove || predictedMove.playerId !== self.id) return;
    if (self.pos.x === predictedMove.pos.x && self.pos.y === predictedMove.pos.y) {
      setPredictedMove(null);
    }
  }, [self, predictedMove]);

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

      <MatchHUD code={code} self={self} opp={opp} state={state} status={status} />

      {state.status === "lobby" && (
        <LobbyView self={self} opp={opp} onReady={() => send({ t: "ready" })} />
      )}

      {state.status === "countdown" && state.countdownEndsAt && (
        <CountdownView endsAt={state.countdownEndsAt} />
      )}

      {(state.status === "playing" || state.status === "ended") && self && (
        <div className="relative z-10 flex flex-col items-center gap-3">
          {opp &&
            (state.status === "playing" ? (
              <OpponentStatusCard player={opp} />
            ) : (
              <OpponentField player={opp} />
            ))}
          <SelfField
            player={renderSelf ?? self}
            events={events.filter((e) => e.ev.playerId === self.id)}
            actionFlash={actionFlash}
          />
        </div>
      )}

      {state.status === "ended" && (
        <EndOverlay
          winnerId={state.winnerId}
          reason={state.endedReason}
          selfId={selfId}
          players={state.players}
          onRematch={() => send({ t: "rematch" })}
          self={self}
        />
      )}

      {state.status === "playing" && self && <Toolbar self={self} send={send} />}
      {state.status === "playing" && self && (
        <MobileControls sendMove={sendMove} sendAction={sendAction} />
      )}
      {status !== "open" && (
        <ConnectionBanner text={lastError?.message ?? "กำลังเชื่อมต่อใหม่..."} />
      )}
      {lastError && status === "open" && <ConnectionBanner text={lastError.message} />}

      <MultiplayerControlsGuide />
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
            <GuideAction keys="R" label="READY" sub="เริ่มรอบใหม่ใน lobby" />
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

function keyToDir(k: string): Direction | null {
  if (k === "w" || k === "arrowup") return "up";
  if (k === "s" || k === "arrowdown") return "down";
  if (k === "a" || k === "arrowleft") return "left";
  if (k === "d" || k === "arrowright") return "right";
  return null;
}

function keysToDir(keys: Set<string>): Direction | null {
  return keyToDir(
    keys.has("w") || keys.has("arrowup")
      ? "w"
      : keys.has("s") || keys.has("arrowdown")
        ? "s"
        : keys.has("a") || keys.has("arrowleft")
          ? "a"
          : keys.has("d") || keys.has("arrowright")
            ? "d"
            : "",
  );
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
  status,
}: {
  code: string;
  self?: PublicPlayer;
  opp?: PublicPlayer;
  state: { status: string; endsAt?: number };
  status: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state.status !== "playing") return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [state.status]);
  const copyRoom = async () => {
    try {
      const text = typeof window !== "undefined" ? window.location.href : code;
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 1200);
  };
  const remaining = state.endsAt ? Math.max(0, state.endsAt - now) : MATCH_DURATION_MS;
  const mm = Math.floor(remaining / 60000)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <header className="relative z-10 w-full max-w-5xl flex items-center justify-between gap-4 px-6 py-3 pixel-panel">
      <button
        onClick={copyRoom}
        className="flex items-center gap-3 text-left"
        title="Copy room link"
      >
        <span className="font-pixel text-[10px] text-[var(--muted-foreground)]">ROOM</span>
        <span className="font-pixel text-[18px] text-[var(--gold)] tracking-[4px]">{code}</span>
        <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">
          {copied === "ok" ? "COPIED" : copied === "fail" ? "COPY FAIL" : "COPY"}
        </span>
      </button>

      <div className="flex items-center gap-4 flex-1 px-6">
        <PlayerBar player={self} side="left" />
        <span className="font-pixel text-[12px] text-[var(--muted-foreground)]">VS</span>
        <PlayerBar player={opp} side="right" />
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="font-pixel text-[16px] text-[var(--gold)]">
          {mm}:{ss}
        </div>
        <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">
          {status !== "open" ? "RECONNECTING" : state.status.toUpperCase()}
        </div>
      </div>
    </header>
  );
}

function PlayerBar({ player, side }: { player?: PublicPlayer; side: "left" | "right" }) {
  const pct = player ? Math.min(100, (player.coins / TARGET_COINS) * 100) : 0;
  return (
    <div className={`flex-1 flex flex-col gap-1 ${side === "right" ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-2">
        <span className="font-pixel text-[10px]">{player?.name ?? "WAITING..."}</span>
        {player && (
          <span className="font-pixel text-[10px] text-[var(--gold)] flex items-center gap-1">
            <CoinIcon size={12} />
            {player.coins}/{TARGET_COINS}
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
  onReady,
}: {
  self?: PublicPlayer;
  opp?: PublicPlayer;
  onReady: () => void;
}) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-6 mt-12">
      <div className="font-pixel text-[14px] text-[var(--muted-foreground)]">
        {opp ? "ผู้เล่นพร้อม ?" : "รอผู้เล่นอีกคน..."}
      </div>
      <div className="flex items-center gap-8">
        <PlayerCard player={self} label="YOU" />
        <span className="font-pixel text-[20px] text-[var(--gold)]">VS</span>
        <PlayerCard player={opp} label="OPPONENT" />
      </div>
      <button
        onClick={onReady}
        className="pixel-btn"
        data-accent={self?.ready ? undefined : "true"}
        disabled={self?.ready}
      >
        <span className="font-pixel text-[12px]">{self?.ready ? "พร้อมแล้ว ✓" : "READY"}</span>
      </button>
    </div>
  );
}

function PlayerCard({ player, label }: { player?: PublicPlayer; label: string }) {
  return (
    <div className="pixel-panel p-4 flex flex-col items-center gap-2 min-w-[160px]">
      <span className="font-pixel text-[8px] text-[var(--muted-foreground)]">{label}</span>
      <span className="font-pixel text-[14px]">{player?.name ?? "..."}</span>
      <span
        className="font-pixel text-[9px]"
        style={{ color: player?.ready ? "#ffd24a" : "#7d6a5a" }}
      >
        {player?.ready ? "READY" : "WAITING"}
      </span>
    </div>
  );
}

function CountdownView({ endsAt }: { endsAt: number }) {
  const [n, setN] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const i = setInterval(() => setN(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 100);
    return () => clearInterval(i);
  }, [endsAt]);
  return (
    <div className="relative z-10 flex flex-col items-center gap-4 mt-16">
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
    </div>
  );
}

function SelfField({
  player,
  events,
  actionFlash,
}: {
  player: PublicPlayer;
  events: { id: number; ev: ServerEvent }[];
  actionFlash: number;
}) {
  return (
    <div
      className="relative field-frame scanlines"
      style={{ width: COLS * TILE_SELF, height: ROWS * TILE_SELF }}
    >
      {player.tiles.map((row, y) =>
        row.map((c, x) => {
          const cls =
            c.type === "grass"
              ? "tile-grass"
              : c.type === "watered"
                ? "tile-watered"
                : "tile-tilled";
          return (
            <div
              key={`${x}-${y}`}
              className={`absolute tile-edge ${cls}`}
              style={{
                left: x * TILE_SELF,
                top: y * TILE_SELF,
                width: TILE_SELF,
                height: TILE_SELF,
              }}
            >
              {c.crop && (
                <div className="absolute inset-1">
                  <PixelCrop id={c.crop.id} stage={c.crop.stage} />
                </div>
              )}
            </div>
          );
        }),
      )}

      {/* facing marker */}
      {(() => {
        let { x, y } = player.pos;
        if (player.dir === "up") y -= 1;
        else if (player.dir === "down") y += 1;
        else if (player.dir === "left") x -= 1;
        else if (player.dir === "right") x += 1;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
        return (
          <div
            className="absolute facing-marker pointer-events-none"
            style={{ left: x * TILE_SELF, top: y * TILE_SELF, width: TILE_SELF, height: TILE_SELF }}
          />
        );
      })()}

      <div
        className="absolute z-10"
        style={{
          transform: `translate3d(${player.pos.x * TILE_SELF}px, ${player.pos.y * TILE_SELF - 10}px, 0)`,
          width: TILE_SELF,
          height: TILE_SELF,
          transition: "transform 35ms linear",
        }}
      >
        <div
          key={actionFlash}
          style={{ animation: actionFlash ? "grow 120ms ease-out" : undefined }}
        >
          <PixelFarmer
            direction={player.dir}
            walking={false}
            walkFrame={0}
            acting={actionFlash > 0}
            tool={player.tool}
          />
        </div>
      </div>

      <MatchArenaAmbience />

      {events.map(({ id, ev }) => {
        if (ev.kind === "insufficient_funds") return null;
        const text =
          ev.kind === "harvest"
            ? `+${ev.reward}`
            : ev.kind === "till"
              ? "ขุด"
              : ev.kind === "water"
                ? "รดน้ำ"
                : ev.kind === "plant"
                  ? CROPS[ev.cropId].name
                  : "";
        const color = ev.kind === "harvest" ? "#ffd24a" : "#f4e4c1";
        return (
          <div
            key={id}
            className="absolute pointer-events-none font-pixel z-20"
            style={{
              left: ev.x * TILE_SELF + TILE_SELF / 2 - 24,
              top: ev.y * TILE_SELF,
              width: 48,
              textAlign: "center",
              fontSize: 10,
              color,
              textShadow: "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000",
              animation: "float-up 0.95s ease-out forwards",
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}

function MatchArenaAmbience() {
  return (
    <>
      <div className="absolute inset-0 pointer-events-none z-20">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={`sp-${i}`}
            className="match-sparkle"
            style={{
              left: `${6 + ((i * 19) % 88)}%`,
              top: `${8 + ((i * 31) % 78)}%`,
              animationDelay: `${i * 0.45}s`,
            }}
          />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={`leaf-${i}`}
            className="match-leaf"
            style={{
              left: `${-10 + i * 18}%`,
              top: `${10 + ((i * 29) % 70)}%`,
              animationDelay: `${i * 1.2}s`,
              background: i % 2 ? "#8bc967" : "#ffd24a",
            }}
          />
        ))}
      </div>

      <div className="absolute -left-13.5 bottom-9.5 pointer-events-none z-20 match-chicken-side">
        <MiniChicken />
      </div>
      <div className="absolute -right-15.5 top-22 pointer-events-none z-20 match-dog-side">
        <MiniDog />
      </div>

      <div className="absolute -left-13 top-10.5 pointer-events-none z-20 match-crowd-card">
        <span className="speech-dot">.</span><span className="speech-dot" style={{ animationDelay: "0.2s" }}>.</span><span className="speech-dot" style={{ animationDelay: "0.4s" }}>.</span>
      </div>
      <div className="absolute -right-18 bottom-23 pointer-events-none z-20 match-crowd-card match-crowd-card-pink">
        GO!
      </div>
    </>
  );
}

function MiniChicken() {
  return (
    <svg viewBox="0 0 16 16" width="34" height="34" shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }}>
      <rect x="5" y="5" width="7" height="6" fill="#f4e4c1" />
      <rect x="4" y="6" width="1" height="4" fill="#f4e4c1" />
      <rect x="12" y="7" width="2" height="2" fill="#f4e4c1" />
      <rect x="8" y="3" width="2" height="2" fill="#d94e6a" />
      <rect x="12" y="6" width="1" height="1" fill="#1a0f1f" />
      <rect x="14" y="8" width="2" height="1" fill="#e8a23a" />
      <rect x="6" y="11" width="1" height="2" fill="#e8a23a" />
      <rect x="10" y="11" width="1" height="2" fill="#e8a23a" />
    </svg>
  );
}

function MiniDog() {
  return (
    <svg viewBox="0 0 18 14" width="44" height="34" shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }}>
      <rect x="4" y="5" width="9" height="5" fill="#8b5a2b" />
      <rect x="12" y="4" width="4" height="4" fill="#a36d36" />
      <rect x="13" y="3" width="2" height="2" fill="#6b3a1c" />
      <rect x="15" y="5" width="2" height="1" fill="#1a0f1f" />
      <rect x="2" y="4" width="2" height="1" fill="#8b5a2b" />
      <rect x="5" y="10" width="2" height="3" fill="#5a2f17" />
      <rect x="10" y="10" width="2" height="3" fill="#5a2f17" />
    </svg>
  );
}

function OpponentStatusCard({ player }: { player: PublicPlayer }) {
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
        <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">OPPONENT</div>
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
}: {
  self: PublicPlayer;
  send: (msg: Parameters<ReturnType<typeof useMatch>["send"]>[0]) => void;
}) {
  return (
    <div className="relative z-10 w-full max-w-5xl flex flex-wrap items-center justify-center gap-3 px-6 py-3 pixel-panel">
      <div className="flex items-center gap-2">
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
            onClick={() => send({ t: "tool", tool: t.id })}
            className="pixel-btn flex items-center gap-2"
            data-active={self.tool === t.id}
          >
            <t.Icon size={18} />
            <span>{t.label}</span>
            <span className="opacity-60 ml-1">[{t.key}]</span>
          </button>
        ))}
      </div>
      <div className="mx-2 self-stretch" style={{ width: 4, background: "#1a0f1f" }} />
      <div className="flex items-center gap-2">
        {Object.values(CROPS).map((c) => {
          const Icon = CROP_ICONS[c.id];
          const active = self.seedChoice === c.id && self.tool === "seed";
          return (
            <button
              key={c.id}
              onClick={() => send({ t: "seed", id: c.id })}
              className="pixel-btn flex items-center gap-2"
              data-active={active}
              style={{ fontSize: 9 }}
            >
              <Icon size={16} />
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
  );
}

function MobileControls({
  sendMove,
  sendAction,
}: {
  sendMove: (dir: Direction) => void;
  sendAction: () => void;
}) {
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (repeatRef.current) clearInterval(repeatRef.current);
    repeatRef.current = null;
  };
  const startMove = (dir: Direction) => {
    stop();
    sendMove(dir);
    repeatRef.current = setInterval(() => sendMove(dir), MOVE_REPEAT_MS);
  };
  useEffect(() => stop, []);

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
  onRematch,
  self,
}: {
  winnerId?: string;
  reason?: "race" | "timeout" | "forfeit";
  selfId: string | null;
  players: PublicPlayer[];
  onRematch: () => void;
  self?: PublicPlayer;
}) {
  const won = winnerId && winnerId === selfId;
  const tied = !winnerId;
  const reasonText =
    reason === "race" ? "FIRST TO 500" : reason === "timeout" ? "TIME UP" : "DISCONNECTED";
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
          {tied ? "DRAW" : won ? "YOU WIN!" : "YOU LOSE"}
        </div>
        <div className="font-pixel text-[10px] text-[var(--muted-foreground)]">{reasonText}</div>
        <div className="flex flex-col gap-2 w-full">
          {sortedPlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 font-pixel text-[10px]"
            >
              <span>
                {p.name}
                {p.id === selfId ? " (YOU)" : ""}
              </span>
              <span className="text-[var(--gold)] flex items-center gap-1">
                <CoinIcon size={12} />
                {p.coins}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={onRematch}
          className="pixel-btn"
          data-accent={!self?.ready ? "true" : undefined}
          disabled={self?.ready}
        >
          <span className="font-pixel text-[12px]">
            {self?.ready ? "READY — WAITING" : "REMATCH"}
          </span>
        </button>
        <a
          href="/lobby"
          className="font-pixel text-[9px] text-[var(--muted-foreground)] opacity-70 hover:opacity-100"
        >
          ออกจากห้อง
        </a>
      </div>
    </div>
  );
}
