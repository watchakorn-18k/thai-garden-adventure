import { applyAction, movePos, tickGrowth } from "../../../src/lib/game-logic";
import {
  COLS,
  CROPS,
  makeEmptyField,
  ROWS,
  type CropId,
  type Direction,
  type Tile,
  type Tool,
} from "../../../src/lib/game-types";
import {
  clientMsg,
  COUNTDOWN_MS,
  MATCH_DURATION_MS,
  TARGET_COINS,
  type PublicMatchState,
  type PublicPlayer,
  type ServerEvent,
  type ServerMsg,
} from "../../../src/lib/match-protocol";

interface PlayerState {
  id: string;
  name: string;
  coins: number;
  pos: { x: number; y: number };
  dir: Direction;
  tool: Tool;
  seedChoice: CropId;
  tiles: Tile[][];
  ready: boolean;
  connected: boolean;
  lastMoveAt: number;
  lastActionAt: number;
}

const MOVE_COOLDOWN_MS = 100;
const ACTION_COOLDOWN_MS = 180;
const SNAPSHOT_INTERVAL_MS = 200;
const GROWTH_INTERVAL_MS = 500;

export class MatchRoom implements DurableObject {
  private code = "";
  private status: PublicMatchState["status"] = "lobby";
  private countdownEndsAt?: number;
  private startedAt?: number;
  private endsAt?: number;
  private winnerId?: string;
  private players = new Map<string, PlayerState>();
  private wsToPlayer = new WeakMap<WebSocket, string>();
  private pendingEvents: ServerEvent[] = [];
  private snapshotTimer?: ReturnType<typeof setInterval>;
  private growthTimer?: ReturnType<typeof setInterval>;

  constructor(
    private ctx: DurableObjectState,
    _env: unknown,
  ) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as { playerId?: string } | null;
      if (att?.playerId) this.wsToPlayer.set(ws, att.playerId);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const code = url.searchParams.get("code") ?? "";
      this.code = code;
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let parsed;
    try {
      parsed = clientMsg.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const msg = parsed.data;

    if (msg.t === "join") {
      this.handleJoin(ws, msg.code, msg.name);
      return;
    }

    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    const now = Date.now();

    if (msg.t === "ready") {
      if (this.status !== "lobby") return;
      player.ready = true;
      this.maybeStartCountdown();
      this.broadcastSnapshot();
      return;
    }

    if (msg.t === "rematch") {
      if (this.status !== "ended") return;
      player.ready = true;
      const allReady = [...this.players.values()].every((p) => p.ready);
      if (this.players.size === 2 && allReady) this.resetForRematch();
      this.broadcastSnapshot();
      return;
    }

    if (this.status !== "playing") return;

    if (msg.t === "tool") {
      player.tool = msg.tool;
      return;
    }
    if (msg.t === "seed") {
      player.seedChoice = msg.id;
      player.tool = "seed";
      return;
    }
    if (msg.t === "move") {
      if (now - player.lastMoveAt < MOVE_COOLDOWN_MS) return;
      player.lastMoveAt = now;
      player.dir = msg.dir;
      player.pos = movePos(player.pos, msg.dir);
      return;
    }
    if (msg.t === "action") {
      if (now - player.lastActionAt < ACTION_COOLDOWN_MS) return;
      player.lastActionAt = now;
      const result = applyAction({
        tiles: player.tiles,
        coins: player.coins,
        pos: player.pos,
        dir: player.dir,
        tool: player.tool,
        seedChoice: player.seedChoice,
        now,
      });
      player.tiles = result.tiles;
      player.coins = result.coins;
      for (const ev of result.events) {
        this.pendingEvents.push({ ...ev, playerId });
      }
      if (player.coins >= TARGET_COINS) this.endMatch(playerId, "race");
      return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const pid = this.wsToPlayer.get(ws);
    if (!pid) return;
    const p = this.players.get(pid);
    if (p) p.connected = false;
    this.wsToPlayer.delete(ws);
    this.broadcastSnapshot();
    if (this.status === "playing" && [...this.players.values()].every((q) => !q.connected)) {
      this.endMatch(undefined, "forfeit");
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    return this.webSocketClose(ws);
  }

  private handleJoin(ws: WebSocket, code: string, name: string): void {
    this.code = code;

    let playerId: string | undefined;
    const att = ws.deserializeAttachment() as { playerId?: string } | null;
    if (att?.playerId && this.players.has(att.playerId)) {
      playerId = att.playerId;
      const existing = this.players.get(playerId)!;
      existing.connected = true;
      existing.name = name;
    } else if (this.players.size < 2) {
      playerId = crypto.randomUUID();
      const startX = this.players.size === 0 ? 3 : 8;
      this.players.set(playerId, {
        id: playerId,
        name,
        coins: 50,
        pos: { x: startX, y: 4 },
        dir: "down",
        tool: "hoe",
        seedChoice: "chili",
        tiles: makeEmptyField(),
        ready: false,
        connected: true,
        lastMoveAt: 0,
        lastActionAt: 0,
      });
    } else {
      this.sendTo(ws, { t: "error", code: "room_full", message: "Room is full" });
      try {
        ws.close(1000, "room_full");
      } catch {
        /* noop */
      }
      return;
    }

    ws.serializeAttachment({ playerId });
    this.wsToPlayer.set(ws, playerId);
    this.sendTo(ws, { t: "welcome", playerId, state: this.publicState() });
    this.broadcastSnapshot();
  }

  private maybeStartCountdown(): void {
    if (this.status !== "lobby") return;
    if (this.players.size !== 2) return;
    if (![...this.players.values()].every((p) => p.ready)) return;
    this.status = "countdown";
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    setTimeout(() => this.startPlaying(), COUNTDOWN_MS);
  }

  private startPlaying(): void {
    if (this.status !== "countdown") return;
    const now = Date.now();
    this.status = "playing";
    this.startedAt = now;
    this.endsAt = now + MATCH_DURATION_MS;
    this.countdownEndsAt = undefined;
    for (const p of this.players.values()) {
      p.coins = 50;
      p.tiles = makeEmptyField();
      p.tool = "hoe";
      p.seedChoice = "chili";
      p.dir = "down";
      p.pos = { x: p.pos.x, y: 4 };
      p.lastMoveAt = 0;
      p.lastActionAt = 0;
    }
    this.snapshotTimer = setInterval(() => this.tickSnapshot(), SNAPSHOT_INTERVAL_MS);
    this.growthTimer = setInterval(() => this.tickGrowthAll(), GROWTH_INTERVAL_MS);
    this.broadcastSnapshot();
  }

  private tickSnapshot(): void {
    if (this.status !== "playing") return;
    if (this.endsAt && Date.now() >= this.endsAt) {
      let best: PlayerState | undefined;
      for (const p of this.players.values()) {
        if (!best || p.coins > best.coins) best = p;
      }
      this.endMatch(best?.id, "timeout");
      return;
    }
    this.broadcastSnapshot();
    if (this.pendingEvents.length) {
      this.broadcast({ t: "events", events: this.pendingEvents });
      this.pendingEvents = [];
    }
  }

  private tickGrowthAll(): void {
    if (this.status !== "playing") return;
    const now = Date.now();
    for (const p of this.players.values()) {
      const res = tickGrowth(p.tiles, now);
      if (res.changed) p.tiles = res.tiles;
    }
  }

  private endMatch(winnerId: string | undefined, reason: "race" | "timeout" | "forfeit"): void {
    if (this.status === "ended") return;
    this.status = "ended";
    this.winnerId = winnerId;
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
    if (this.growthTimer) {
      clearInterval(this.growthTimer);
      this.growthTimer = undefined;
    }
    for (const p of this.players.values()) p.ready = false;
    this.broadcast({ t: "end", winnerId, reason });
    this.broadcastSnapshot();
  }

  private resetForRematch(): void {
    this.status = "lobby";
    this.winnerId = undefined;
    this.startedAt = undefined;
    this.endsAt = undefined;
    for (const p of this.players.values()) {
      p.ready = false;
      p.coins = 50;
      p.tiles = makeEmptyField();
    }
    this.maybeStartCountdown();
  }

  private publicState(): PublicMatchState {
    const players: PublicPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      pos: p.pos,
      dir: p.dir,
      tool: p.tool,
      seedChoice: p.seedChoice,
      tiles: p.tiles,
      ready: p.ready,
      connected: p.connected,
    }));
    return {
      code: this.code,
      status: this.status,
      countdownEndsAt: this.countdownEndsAt,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      winnerId: this.winnerId,
      players,
    };
  }

  private broadcastSnapshot(): void {
    this.broadcast({ t: "snapshot", state: this.publicState() });
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* noop */
      }
    }
  }

  private sendTo(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* noop */
    }
  }
}

// keep static field constants alive for tree-shake protection
void [COLS, ROWS, CROPS];
