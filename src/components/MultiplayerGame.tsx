import { useEffect, useMemo, useRef, useState } from "react";
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
import { useMatch } from "@/lib/match-client";
import {
  MATCH_DURATION_MS,
  TARGET_COINS,
  type PublicPlayer,
  type ServerEvent,
} from "@/lib/match-protocol";

const TILE_SELF = 56;
const TILE_OPP = 28;
const MOVE_REPEAT_MS = 130;

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
  const { state, selfId, status, send } = useMatch({
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

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (k === " " || k === "enter") send({ t: "action" });
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
  }, [send]);

  useEffect(() => {
    if (state?.status !== "playing") return;
    const i = setInterval(() => {
      const k = keys.current;
      let dir: Direction | null = null;
      if (k.has("w") || k.has("arrowup")) dir = "up";
      else if (k.has("s") || k.has("arrowdown")) dir = "down";
      else if (k.has("a") || k.has("arrowleft")) dir = "left";
      else if (k.has("d") || k.has("arrowright")) dir = "right";
      if (!dir) {
        lastSentDir.current = null;
        return;
      }
      const now = Date.now();
      const last = lastSentDir.current;
      if (last && last.dir === dir && now - last.at < MOVE_REPEAT_MS) return;
      lastSentDir.current = { dir, at: now };
      send({ t: "move", dir });
    }, 60);
    return () => clearInterval(i);
  }, [state?.status, send]);

  const self = state?.players.find((p) => p.id === selfId);
  const opp = state?.players.find((p) => p.id !== selfId);

  if (status === "connecting" || !state) {
    return <CenterMsg main="กำลังเชื่อมต่อ..." sub={`ROOM ${code}`} />;
  }
  if (status === "closed") {
    return <CenterMsg main="หลุดการเชื่อมต่อ" sub="กำลังลองใหม่..." />;
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-start p-6 gap-4 overflow-hidden">
      <div className="sky-stars" />

      <MatchHUD code={code} self={self} opp={opp} state={state} />

      {state.status === "lobby" && (
        <LobbyView self={self} opp={opp} onReady={() => send({ t: "ready" })} />
      )}

      {state.status === "countdown" && state.countdownEndsAt && (
        <CountdownView endsAt={state.countdownEndsAt} />
      )}

      {(state.status === "playing" || state.status === "ended") && self && (
        <div className="relative z-10 flex flex-col items-center gap-3">
          {opp && <OpponentField player={opp} />}
          <SelfField player={self} events={events.filter((e) => e.ev.playerId === self.id)} />
        </div>
      )}

      {state.status === "ended" && (
        <EndOverlay
          winnerId={state.winnerId}
          selfId={selfId}
          players={state.players}
          onRematch={() => send({ t: "rematch" })}
          self={self}
        />
      )}

      {state.status === "playing" && self && <Toolbar self={self} send={send} />}

      <div className="relative z-10 font-pixel text-[9px] text-[var(--muted-foreground)] text-center">
        <span className="pixel-chip mr-2">WASD / ↑↓←→</span>MOVE
        <span className="pixel-chip mx-2">SPACE</span>USE
        <span className="pixel-chip mx-2">1·2·3</span>TOOL
      </div>
    </div>
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

function MatchHUD({
  code,
  self,
  opp,
  state,
}: {
  code: string;
  self?: PublicPlayer;
  opp?: PublicPlayer;
  state: { status: string; endsAt?: number };
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.status !== "playing") return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [state.status]);
  const remaining = state.endsAt ? Math.max(0, state.endsAt - now) : MATCH_DURATION_MS;
  const mm = Math.floor(remaining / 60000)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <header className="relative z-10 w-full max-w-5xl flex items-center justify-between gap-4 px-6 py-3 pixel-panel">
      <div className="flex items-center gap-3">
        <span className="font-pixel text-[10px] text-[var(--muted-foreground)]">ROOM</span>
        <span className="font-pixel text-[18px] text-[var(--gold)] tracking-[4px]">{code}</span>
      </div>

      <div className="flex items-center gap-4 flex-1 px-6">
        <PlayerBar player={self} side="left" />
        <span className="font-pixel text-[12px] text-[var(--muted-foreground)]">VS</span>
        <PlayerBar player={opp} side="right" />
      </div>

      <div className="font-pixel text-[16px] text-[var(--gold)]">
        {mm}:{ss}
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
            DC
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
}: {
  player: PublicPlayer;
  events: { id: number; ev: ServerEvent }[];
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
          transition: "transform 80ms linear",
        }}
      >
        <PixelFarmer
          direction={player.dir}
          walking={false}
          walkFrame={0}
          acting={false}
          tool={player.tool}
        />
      </div>

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

function OpponentField({ player }: { player: PublicPlayer }) {
  return (
    <div className="flex flex-col items-center gap-1 opacity-80">
      <div className="font-pixel text-[8px] text-[var(--muted-foreground)]">
        {player.name}'s FIELD
      </div>
      <div
        className="relative field-frame"
        style={{ width: COLS * TILE_OPP, height: ROWS * TILE_OPP }}
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
                style={{ left: x * TILE_OPP, top: y * TILE_OPP, width: TILE_OPP, height: TILE_OPP }}
              >
                {c.crop && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div style={{ transform: `scale(0.5)` }}>
                      <PixelCrop id={c.crop.id} stage={c.crop.stage} />
                    </div>
                  </div>
                )}
              </div>
            );
          }),
        )}
        <div
          className="absolute"
          style={{
            left: player.pos.x * TILE_OPP,
            top: player.pos.y * TILE_OPP - 4,
            width: TILE_OPP,
            height: TILE_OPP,
            transition: "left 80ms linear, top 80ms linear",
          }}
        >
          <div style={{ transform: "scale(0.5)", transformOrigin: "0 0" }}>
            <PixelFarmer
              direction={player.dir}
              walking={false}
              walkFrame={0}
              acting={false}
              tool={player.tool}
            />
          </div>
        </div>
      </div>
    </div>
  );
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

function EndOverlay({
  winnerId,
  selfId,
  players,
  onRematch,
  self,
}: {
  winnerId?: string;
  selfId: string | null;
  players: PublicPlayer[];
  onRematch: () => void;
  self?: PublicPlayer;
}) {
  const won = winnerId && winnerId === selfId;
  const tied = !winnerId;
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
        <div className="flex flex-col gap-2 w-full">
          {players.map((p) => (
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
          <span className="font-pixel text-[12px]">{self?.ready ? "รอคู่แข่ง..." : "REMATCH"}</span>
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
