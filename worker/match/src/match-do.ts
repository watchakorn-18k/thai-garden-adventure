import { applyAction, tickGrowth } from "../../../src/lib/game-logic";
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
  DEFAULT_ROOM_SETTINGS,
  roomSettingsSchema,
  cosmeticsSchema,
  type PublicMatchState,
  type MatchRole,
  type MatchRecap,
  type PublicPlayer,
  type PublicPlayerStats,
  type RoomSettings,
  type ServerEvent,
  type ServerMsg,
} from "../../../src/lib/match-protocol";
import { DEFAULT_COSMETICS, type PlayerCosmetics } from "../../../src/lib/player-cosmetics";

interface PlayerState {
  id: string;
  sessionId: string;
  name: string;
  cosmetics: PlayerCosmetics;
  coins: number;
  pos: { x: number; y: number };
  dir: Direction;
  tool: Tool;
  seedChoice: CropId;
  tiles: Tile[][];
  ready: boolean;
  connected: boolean;
  disconnectedAt?: number;
  stats: PublicPlayerStats;
  inputDir?: Direction;
  lastMovementAt: number;
  lastActionAt: number;
}

interface StoredRoomState {
  code: string;
  status: PublicMatchState["status"];
  countdownEndsAt?: number;
  startedAt?: number;
  endsAt?: number;
  winnerId?: string;
  endedReason?: "race" | "timeout" | "forfeit" | "kick";
  recap?: MatchRecap;
  hostId?: string;
  hostSessionId?: string;
  settings?: RoomSettings;
  players: Omit<PlayerState, "connected" | "inputDir" | "lastMovementAt" | "lastActionAt">[];
}

const MOVE_SPEED_TILES_PER_SECOND = 5.8;
const ACTION_COOLDOWN_MS = 80;
const SNAPSHOT_INTERVAL_MS = 50;
const GROWTH_INTERVAL_MS = 500;
const PERSIST_INTERVAL_MS = 1000;
const RECONNECT_GRACE_MS = 30_000;
const MAX_SPECTATORS = 5;

interface SocketAttachment {
  playerId?: string;
  sessionId?: string;
  role?: MatchRole;
  name?: string;
  cosmetics?: PlayerCosmetics;
}

export class MatchRoom implements DurableObject {
  private code = "";
  private status: PublicMatchState["status"] = "lobby";
  private countdownEndsAt?: number;
  private startedAt?: number;
  private endsAt?: number;
  private winnerId?: string;
  private endedReason?: "race" | "timeout" | "forfeit" | "kick";
  private recap?: MatchRecap;
  private hostId?: string;
  private hostSessionId?: string;
  private settings: RoomSettings = DEFAULT_ROOM_SETTINGS;
  private players = new Map<string, PlayerState>();
  private initialized?: Promise<void>;
  private wsToPlayer = new WeakMap<WebSocket, string>();
  private wsToRole = new WeakMap<WebSocket, MatchRole>();
  private pendingEvents: ServerEvent[] = [];
  private dirty = false;
  private lastPersistAt = 0;
  private snapshotTimer?: ReturnType<typeof setInterval>;
  private growthTimer?: ReturnType<typeof setInterval>;

  constructor(
    private ctx: DurableObjectState,
    _env: unknown,
  ) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (att?.playerId) this.wsToPlayer.set(ws, att.playerId);
      this.wsToRole.set(ws, att?.role ?? "player");
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();
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
    await this.ensureInitialized();
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
      this.handleJoin(ws, msg.code, msg.name, msg.sessionId, msg.role ?? "player", msg.cosmetics);
      return;
    }

    if (msg.t === "claim_slot") {
      this.claimPlayerSlot(ws);
      return;
    }

    if (msg.t === "leave_slot") {
      this.leavePlayerSlot(ws);
      return;
    }

    if (msg.t === "cancel_countdown") {
      this.cancelCountdown(ws);
      return;
    }

    if (msg.t === "settings") {
      this.updateSettings(ws, msg.settings);
      return;
    }

    if (this.wsToRole.get(ws) !== "player") return;
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    const now = Date.now();

    if (msg.t === "cosmetics") {
      player.cosmetics = cosmeticsSchema.parse(msg.cosmetics);
      this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (msg.t === "kick") {
      if (!this.canEditRoom(ws)) {
        this.sendTo(ws, {
          t: "error",
          code: "host_only",
          message: "HOST เท่านั้นที่เตะผู้เล่นได้",
        });
        return;
      }
      this.kickPlayer(ws, playerId, msg.playerId);
      return;
    }

    if (msg.t === "ready") {
      if (this.status !== "lobby") return;
      player.ready = !player.ready;
      this.maybeStartCountdown();
      this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (msg.t === "rematch") {
      if (this.status !== "ended") return;
      player.ready = true;
      const allReady = [...this.players.values()].every((p) => p.ready);
      if (this.players.size === this.settings.maxPlayers && allReady) this.resetForRematch();
      this.persist();
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
      this.advanceMovement(now);
      player.inputDir = msg.dir;
      player.dir = msg.dir;
      if (msg.pos) player.pos = clampPos(msg.pos);
      player.lastMovementAt = now;
      this.dirty = true;
      this.broadcastSnapshot();
      return;
    }
    if (msg.t === "move_stop") {
      player.inputDir = undefined;
      player.lastMovementAt = now;
      this.dirty = true;
      this.broadcastSnapshot();
      return;
    }
    if (msg.t === "action") {
      if (now - player.lastActionAt < ACTION_COOLDOWN_MS) return;
      this.advanceMovement(now);
      if (msg.pos) player.pos = clampPos(msg.pos);
      if (msg.dir) player.dir = msg.dir;
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
        if (ev.kind === "harvest") {
          player.stats.harvests += 1;
          player.stats.coinsEarned += ev.reward;
          player.stats.cropHarvests[ev.cropId] += 1;
        }
        this.pendingEvents.push({ ...ev, playerId });
      }
      if (player.coins >= this.settings.targetCoins) this.endMatch(playerId, "race");
      else {
        this.persist();
        this.broadcastSnapshot();
      }
      if (this.pendingEvents.length) {
        this.broadcast({ t: "events", events: this.pendingEvents });
        this.pendingEvents = [];
      }
      return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.ensureInitialized();
    if (this.wsToRole.get(ws) === "spectator") {
      this.wsToRole.delete(ws);
      this.wsToPlayer.delete(ws);
      return;
    }
    const pid = this.wsToPlayer.get(ws);
    if (!pid) return;
    const p = this.players.get(pid);
    if (p) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
    this.wsToPlayer.delete(ws);
    this.wsToRole.delete(ws);
    if (this.status === "playing") {
      this.scheduleAlarm();
      this.persist();
      this.broadcastSnapshot();
      return;
    }
    if (this.status === "countdown") {
      this.status = "lobby";
      this.countdownEndsAt = undefined;
      for (const player of this.players.values()) player.ready = false;
    }
    this.dropDisconnectedWaitingPlayers();
    this.persist();
    this.broadcastSnapshot();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    return this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    await this.ensureInitialized();
    const now = Date.now();
    if (this.status === "countdown" && this.countdownEndsAt && now >= this.countdownEndsAt) {
      this.startPlaying();
      return;
    }
    if (this.status === "playing") {
      if (this.endsAt && now >= this.endsAt) {
        this.endByTimeout();
        return;
      }
      if (this.checkReconnectForfeit(now)) return;
    }
    this.scheduleAlarm();
  }

  private async ensureInitialized(): Promise<void> {
    this.initialized ??= this.loadStoredState();
    await this.initialized;
  }

  private async loadStoredState(): Promise<void> {
    const stored = await this.ctx.storage.get<StoredRoomState>("room");
    if (!stored) return;
    this.code = stored.code;
    this.status = stored.status;
    this.countdownEndsAt = stored.countdownEndsAt;
    this.startedAt = stored.startedAt;
    this.endsAt = stored.endsAt;
    this.winnerId = stored.winnerId;
    this.endedReason = stored.endedReason;
    this.recap = stored.recap;
    this.hostId = stored.hostId;
    this.hostSessionId = stored.hostSessionId;
    this.settings = roomSettingsSchema.catch(DEFAULT_ROOM_SETTINGS).parse(stored.settings);
    this.players = new Map(
      stored.players.map((p) => [
        p.id,
        {
          ...p,
          connected: false,
          disconnectedAt: undefined,
          stats: p.stats ?? emptyStats(),
          inputDir: undefined,
          lastMovementAt: Date.now(),
          lastActionAt: 0,
        },
      ]),
    );
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      this.wsToRole.set(ws, att?.role ?? "player");
      if (att?.playerId && (att.role ?? "player") === "player") {
        this.wsToPlayer.set(ws, att.playerId);
        const player = this.players.get(att.playerId);
        if (player) player.connected = true;
      }
    }
    if (this.status === "playing") this.startTimers();
    this.scheduleAlarm();
  }

  private persist(): void {
    const players = [...this.players.values()].map(
      ({
        connected: _connected,
        inputDir: _inputDir,
        lastMovementAt: _lastMovementAt,
        lastActionAt: _lastActionAt,
        ...p
      }) => p,
    );
    this.lastPersistAt = Date.now();
    this.dirty = false;
    this.ctx.waitUntil(
      this.ctx.storage.put("room", {
        code: this.code,
        status: this.status,
        countdownEndsAt: this.countdownEndsAt,
        startedAt: this.startedAt,
        endsAt: this.endsAt,
        winnerId: this.winnerId,
        endedReason: this.endedReason,
        recap: this.recap,
        hostId: this.hostId,
        hostSessionId: this.hostSessionId,
        settings: this.settings,
        players,
      } satisfies StoredRoomState),
    );
  }

  private persistDirty(now = Date.now()): void {
    if (!this.dirty) return;
    if (now - this.lastPersistAt < PERSIST_INTERVAL_MS) return;
    this.persist();
  }

  private advanceMovement(now = Date.now()): void {
    let changed = false;
    for (const p of this.players.values()) {
      const elapsed = Math.min(120, Math.max(0, now - p.lastMovementAt));
      p.lastMovementAt = now;
      if (!p.inputDir || elapsed === 0) continue;
      const step = (elapsed / 1000) * MOVE_SPEED_TILES_PER_SECOND;
      if (p.inputDir === "up") p.pos.y = Math.max(0, p.pos.y - step);
      if (p.inputDir === "down") p.pos.y = Math.min(ROWS - 1, p.pos.y + step);
      if (p.inputDir === "left") p.pos.x = Math.max(0, p.pos.x - step);
      if (p.inputDir === "right") p.pos.x = Math.min(COLS - 1, p.pos.x + step);
      changed = true;
    }
    if (changed) this.dirty = true;
  }

  private scheduleAlarm(): void {
    const reconnectDeadline =
      this.status === "playing"
        ? Math.min(
            ...[...this.players.values()]
              .filter((p) => !p.connected && p.disconnectedAt)
              .map((p) => p.disconnectedAt! + RECONNECT_GRACE_MS),
          )
        : undefined;
    const time =
      this.status === "countdown"
        ? this.countdownEndsAt
        : this.status === "playing"
          ? minDefined(
              this.endsAt,
              Number.isFinite(reconnectDeadline) ? reconnectDeadline : undefined,
            )
          : undefined;
    if (time) this.ctx.waitUntil(this.ctx.storage.setAlarm(time));
  }

  private dropDisconnectedWaitingPlayers(): void {
    if (this.status === "playing") return;
    for (const [id, player] of this.players) {
      if (!player.connected) this.players.delete(id);
    }
    this.ensureHost();
  }

  private ensureHost(): void {
    if (this.hostId && this.players.has(this.hostId)) return;
    const hostPlayer = [...this.players.values()].find((p) => p.sessionId === this.hostSessionId);
    this.hostId = hostPlayer?.id;
  }

  private isHostSocket(ws: WebSocket): boolean {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    return Boolean(this.hostSessionId && att?.sessionId === this.hostSessionId);
  }

  private canEditRoom(ws: WebSocket): boolean {
    return this.isHostSocket(ws) && (this.status === "lobby" || this.status === "ended");
  }

  private kickPlayer(ws: WebSocket, hostId: string, targetId: string): void {
    if (targetId === hostId) {
      this.sendTo(ws, { t: "error", code: "invalid_kick", message: "เตะตัวเองไม่ได้" });
      return;
    }
    const target = this.players.get(targetId);
    if (!target) {
      this.sendTo(ws, { t: "error", code: "missing_player", message: "ไม่พบผู้เล่นนี้" });
      return;
    }
    this.players.delete(targetId);
    for (const socket of this.ctx.getWebSockets()) {
      if (this.wsToPlayer.get(socket) !== targetId) continue;
      this.sendTo(socket, { t: "error", code: "kicked", message: "คุณถูกเตะออกจากห้อง" });
      this.wsToPlayer.delete(socket);
      this.wsToRole.delete(socket);
      try {
        socket.close(1000, "kicked");
      } catch {
        /* noop */
      }
    }
    this.ensureHost();
    for (const player of this.players.values()) player.ready = false;
    this.persist();
    this.broadcastSnapshot();
  }

  private spectatorCount(): number {
    return this.ctx.getWebSockets().filter((socket) => this.wsToRole.get(socket) === "spectator")
      .length;
  }

  private updateSettings(ws: WebSocket, rawSettings: RoomSettings): void {
    if (!this.canEditRoom(ws)) {
      this.sendTo(ws, {
        t: "error",
        code: "host_only",
        message: "HOST เท่านั้นที่ตั้งค่าห้องได้",
      });
      return;
    }
    const settings = roomSettingsSchema.safeParse(rawSettings);
    if (!settings.success) {
      this.sendTo(ws, { t: "error", code: "invalid_settings", message: "ตั้งค่าห้องไม่ถูกต้อง" });
      return;
    }
    this.settings = settings.data;
    for (const p of this.players.values()) p.ready = false;
    this.persist();
    this.broadcastSnapshot();
  }

  private claimPlayerSlot(ws: WebSocket): void {
    if (this.wsToRole.get(ws) === "player") {
      this.sendTo(ws, { t: "error", code: "already_player", message: "คุณอยู่ในช่องผู้เล่นแล้ว" });
      return;
    }
    if (this.status === "countdown" || this.status === "playing") {
      this.sendTo(ws, {
        t: "error",
        code: "match_active",
        message: "การแข่งขันเริ่มแล้ว รอรอบถัดไป",
      });
      return;
    }
    if (this.players.size >= this.settings.maxPlayers) {
      this.sendTo(ws, { t: "error", code: "room_full", message: "ช่องผู้เล่นเต็มแล้ว" });
      return;
    }
    if ([...this.players.values()].some((p) => p.ready)) {
      this.sendTo(ws, { t: "error", code: "ready_locked", message: "มีผู้เล่นกด READY แล้ว" });
      return;
    }

    const att = ws.deserializeAttachment() as SocketAttachment | null;
    const playerId = crypto.randomUUID();
    const sessionId = att?.sessionId ?? crypto.randomUUID();
    const startX = this.players.size === 0 ? 3 : 8;
    const cosmetics = cosmeticsSchema.parse(att?.cosmetics ?? DEFAULT_COSMETICS);
    if (!this.hostSessionId) this.hostSessionId = sessionId;
    if (this.hostSessionId === sessionId) this.hostId = playerId;
    this.players.set(playerId, {
      id: playerId,
      sessionId,
      name: att?.name ?? "Player",
      cosmetics,
      coins: 50,
      pos: { x: startX, y: 4 },
      dir: "down",
      tool: "hoe",
      seedChoice: "chili",
      tiles: makeEmptyField(),
      ready: false,
      connected: true,
      disconnectedAt: undefined,
      stats: emptyStats(),
      inputDir: undefined,
      lastMovementAt: Date.now(),
      lastActionAt: 0,
    });
    ws.serializeAttachment({
      playerId,
      sessionId,
      role: "player",
      name: att?.name,
      cosmetics,
    } satisfies SocketAttachment);
    this.wsToPlayer.set(ws, playerId);
    this.wsToRole.set(ws, "player");
    this.sendTo(ws, {
      t: "welcome",
      playerId,
      sessionId,
      role: "player",
      host: this.hostSessionId === sessionId,
      state: this.publicState(),
    });
    this.persist();
    this.broadcastSnapshot();
  }

  private leavePlayerSlot(ws: WebSocket): void {
    if (this.status === "countdown" || this.status === "playing") {
      this.sendTo(ws, {
        t: "error",
        code: "match_active",
        message: "การแข่งขันเริ่มแล้ว ออกจาก slot ไม่ได้",
      });
      return;
    }
    if (this.wsToRole.get(ws) !== "player") return;
    if ([...this.players.values()].some((p) => p.ready)) {
      this.sendTo(ws, { t: "error", code: "ready_locked", message: "มีผู้เล่นกด READY แล้ว" });
      return;
    }
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    const spectatorId = crypto.randomUUID();
    const spectatorSessionId = player?.sessionId ?? crypto.randomUUID();
    const name = player?.name ?? "Player";
    const cosmetics = cosmeticsSchema.parse(player?.cosmetics ?? DEFAULT_COSMETICS);
    this.players.delete(playerId);
    this.wsToPlayer.set(ws, spectatorId);
    this.wsToRole.set(ws, "spectator");
    ws.serializeAttachment({
      playerId: spectatorId,
      sessionId: spectatorSessionId,
      role: "spectator",
      name,
      cosmetics,
    } satisfies SocketAttachment);
    this.ensureHost();
    for (const p of this.players.values()) p.ready = false;
    this.sendTo(ws, {
      t: "welcome",
      playerId: spectatorId,
      sessionId: spectatorSessionId,
      role: "spectator",
      host: this.hostSessionId === spectatorSessionId,
      state: this.publicState(),
    });
    this.persist();
    this.broadcastSnapshot();
  }

  private handleJoin(
    ws: WebSocket,
    code: string,
    name: string,
    sessionId?: string,
    role: MatchRole = "player",
    cosmetics: PlayerCosmetics = DEFAULT_COSMETICS,
  ): void {
    this.code = code;
    this.dropDisconnectedWaitingPlayers();

    if (role === "spectator") {
      if (this.spectatorCount() >= MAX_SPECTATORS) {
        this.sendTo(ws, {
          t: "error",
          code: "spectator_full",
          message: "Spectator slots are full",
        });
        try {
          ws.close(1000, "spectator_full");
        } catch {
          /* noop */
        }
        return;
      }
      const spectatorId = crypto.randomUUID();
      const spectatorSessionId = sessionId ?? crypto.randomUUID();
      if (!this.hostSessionId) this.hostSessionId = spectatorSessionId;
      const spectatorCosmetics = cosmeticsSchema.parse(cosmetics);
      ws.serializeAttachment({
        playerId: spectatorId,
        sessionId: spectatorSessionId,
        role,
        name,
        cosmetics: spectatorCosmetics,
      } satisfies SocketAttachment);
      this.wsToPlayer.set(ws, spectatorId);
      this.wsToRole.set(ws, role);
      this.sendTo(ws, {
        t: "welcome",
        playerId: spectatorId,
        sessionId: spectatorSessionId,
        role,
        host: this.hostSessionId === spectatorSessionId,
        state: this.publicState(),
      });
      this.broadcastSnapshot();
      return;
    }

    let playerId: string | undefined;
    const att = ws.deserializeAttachment() as {
      playerId?: string;
      sessionId?: string;
      role?: MatchRole;
    } | null;
    if (att?.playerId && this.players.has(att.playerId)) {
      playerId = att.playerId;
    } else if (sessionId) {
      playerId = [...this.players.values()].find((p) => p.sessionId === sessionId)?.id;
    }

    if (playerId) {
      const existing = this.players.get(playerId)!;
      existing.connected = true;
      existing.disconnectedAt = undefined;
      existing.name = name;
      existing.cosmetics = cosmeticsSchema.parse(cosmetics);
      existing.inputDir = undefined;
      existing.lastMovementAt = Date.now();
      existing.lastActionAt = 0;
      sessionId = existing.sessionId;
    } else if (this.players.size < this.settings.maxPlayers) {
      playerId = crypto.randomUUID();
      sessionId = crypto.randomUUID();
      const startX = this.players.size === 0 ? 3 : 8;
      if (!this.hostSessionId) this.hostSessionId = sessionId;
      if (this.hostSessionId === sessionId) this.hostId = playerId;
      this.players.set(playerId, {
        id: playerId,
        sessionId,
        name,
        cosmetics: cosmeticsSchema.parse(cosmetics),
        coins: 50,
        pos: { x: startX, y: 4 },
        dir: "down",
        tool: "hoe",
        seedChoice: "chili",
        tiles: makeEmptyField(),
        ready: false,
        connected: true,
        disconnectedAt: undefined,
        stats: emptyStats(),
        inputDir: undefined,
        lastMovementAt: Date.now(),
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

    ws.serializeAttachment({ playerId, sessionId, role });
    this.wsToPlayer.set(ws, playerId);
    this.wsToRole.set(ws, role);
    this.sendTo(ws, {
      t: "welcome",
      playerId,
      sessionId,
      role,
      host: this.hostSessionId === sessionId,
      state: this.publicState(),
    });
    this.persist();
    this.broadcastSnapshot();
  }

  private cancelCountdown(ws: WebSocket): void {
    if (!this.isHostSocket(ws) || this.status !== "countdown") return;
    this.status = "lobby";
    this.countdownEndsAt = undefined;
    for (const player of this.players.values()) player.ready = false;
    this.persist();
    this.broadcastSnapshot();
  }

  private maybeStartCountdown(): void {
    if (this.status !== "lobby") return;
    if (this.players.size !== this.settings.maxPlayers) return;
    if (![...this.players.values()].every((p) => p.ready)) return;
    this.status = "countdown";
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.scheduleAlarm();
    setTimeout(() => this.startPlaying(), COUNTDOWN_MS);
  }

  private startPlaying(): void {
    if (this.status !== "countdown") return;
    const now = Date.now();
    this.status = "playing";
    this.startedAt = now;
    this.endsAt = now + this.settings.durationMs;
    this.countdownEndsAt = undefined;
    for (const p of this.players.values()) {
      p.coins = 50;
      p.tiles = makeEmptyField();
      p.tool = "hoe";
      p.seedChoice = "chili";
      p.dir = "down";
      p.pos = { x: Math.round(p.pos.x), y: 4 };
      p.disconnectedAt = undefined;
      p.stats = emptyStats();
      p.inputDir = undefined;
      p.lastMovementAt = now;
      p.lastActionAt = 0;
    }
    this.startTimers();
    this.scheduleAlarm();
    this.persist();
    this.broadcastSnapshot();
  }

  private startTimers(): void {
    this.snapshotTimer ??= setInterval(() => this.tickSnapshot(), SNAPSHOT_INTERVAL_MS);
    this.growthTimer ??= setInterval(() => this.tickGrowthAll(), GROWTH_INTERVAL_MS);
  }

  private tickSnapshot(): void {
    if (this.status !== "playing") return;
    const now = Date.now();
    if (this.endsAt && now >= this.endsAt) {
      this.endByTimeout();
      return;
    }
    this.advanceMovement(now);
    this.broadcastSnapshot();
    this.persistDirty(now);
    if (this.pendingEvents.length) {
      this.broadcast({ t: "events", events: this.pendingEvents });
      this.pendingEvents = [];
    }
  }

  private tickGrowthAll(): void {
    if (this.status !== "playing") return;
    const now = Date.now();
    let changed = false;
    for (const p of this.players.values()) {
      const res = tickGrowth(p.tiles, now);
      if (res.changed) {
        p.tiles = res.tiles;
        changed = true;
      }
    }
    if (changed) this.dirty = true;
  }

  private endByTimeout(): void {
    const players = [...this.players.values()];
    const bestCoins = Math.max(...players.map((p) => p.coins));
    const winners = players.filter((p) => p.coins === bestCoins);
    this.endMatch(winners.length === 1 ? winners[0].id : undefined, "timeout");
  }

  private checkReconnectForfeit(now: number): boolean {
    const expired = [...this.players.values()].filter(
      (p) => !p.connected && p.disconnectedAt && now - p.disconnectedAt >= RECONNECT_GRACE_MS,
    );
    if (!expired.length) return false;
    const connected = [...this.players.values()].filter((p) => p.connected);
    this.endMatch(connected.length === 1 ? connected[0].id : undefined, "forfeit");
    return true;
  }

  private buildRecap(endedAt: number): MatchRecap {
    const durationMs = this.startedAt ? endedAt - this.startedAt : 0;
    return {
      endedAt,
      durationMs,
      timeRemainingMs: this.endsAt ? Math.max(0, this.endsAt - endedAt) : 0,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        coins: p.coins,
        harvests: p.stats.harvests,
        topCrop: topCrop(p.stats.cropHarvests),
        coinsEarned: p.stats.coinsEarned,
      })),
    };
  }

  private endMatch(
    winnerId: string | undefined,
    reason: "race" | "timeout" | "forfeit" | "kick",
  ): void {
    if (this.status === "ended") return;
    this.status = "ended";
    this.winnerId = winnerId;
    this.endedReason = reason;
    this.recap = this.buildRecap(Date.now());
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
    if (this.growthTimer) {
      clearInterval(this.growthTimer);
      this.growthTimer = undefined;
    }
    for (const p of this.players.values()) p.ready = false;
    this.persist();
    this.broadcast({ t: "end", winnerId, reason });
    this.broadcastSnapshot();
  }

  private resetForRematch(): void {
    this.status = "lobby";
    this.winnerId = undefined;
    this.endedReason = undefined;
    this.recap = undefined;
    this.startedAt = undefined;
    this.endsAt = undefined;
    for (const p of this.players.values()) {
      p.ready = false;
      p.coins = 50;
      p.tiles = makeEmptyField();
    }
    this.persist();
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
      cosmetics: cosmeticsSchema.parse(p.cosmetics ?? DEFAULT_COSMETICS),
      stats: p.stats,
    }));
    return {
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      settings: this.settings,
      countdownEndsAt: this.countdownEndsAt,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      winnerId: this.winnerId,
      endedReason: this.endedReason,
      recap: this.recap,
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

function emptyStats(): PublicPlayerStats {
  return {
    harvests: 0,
    coinsEarned: 0,
    cropHarvests: {
      chili: 0,
      rice: 0,
      morning_glory: 0,
      eggplant: 0,
    },
  };
}

function topCrop(crops: Record<CropId, number>): CropId | undefined {
  let best: CropId | undefined;
  for (const id of Object.keys(crops) as CropId[]) {
    if (!best || crops[id] > crops[best]) best = id;
  }
  return best && crops[best] > 0 ? best : undefined;
}

function minDefined(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function clampPos(pos: { x: number; y: number }): { x: number; y: number } {
  const x = Number.isFinite(pos.x) ? pos.x : 0;
  const y = Number.isFinite(pos.y) ? pos.y : 0;
  return {
    x: Math.max(0, Math.min(COLS - 1, x)),
    y: Math.max(0, Math.min(ROWS - 1, y)),
  };
}

// keep static field constants alive for tree-shake protection
void [COLS, ROWS, CROPS];
