import { applyAction, tickGrowth, updateComboAndGetBonus } from "../../../src/lib/game-logic";
import {
  CARGO_TTL_MS,
  COLS,
  CROPS,
  MARKET_TILE_POS,
  makeEmptyField,
  ROWS,
  SELLER_BASKET_CAPACITY,
  type Cargo,
  type CropId,
  type Direction,
  type MatchTeam,
  type PlayerRole,
  type SellerPuzzleChoice,
  type TeamId,
  type Tile,
  type Tool,
} from "../../../src/lib/game-types";
import {
  clientMsg,
  COUNTDOWN_MS,
  CROP_BAN_MS,
  CROP_SELECTION_MS,
  DEFAULT_ROOM_SETTINGS,
  DEFAULT_SELECTED_CROPS,
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
  teamId?: TeamId;
  role?: PlayerRole;
  carryingCargo?: Cargo;
  cargoStack?: Cargo[];
  pos: { x: number; y: number };
  dir: Direction;
  tool: Tool;
  seedChoice: CropId;
  selectedCrops: CropId[];
  bannedCrop?: CropId;
  tiles: Tile[][];
  ready: boolean;
  connected: boolean;
  disconnectedAt?: number;
  stats: PublicPlayerStats;
  inputDir?: Direction;
  lastMovementAt: number;
  lastActionAt: number;
  combo: number;
  lastHarvestAt: number;
  comboCrops: CropId[];
  isBot?: boolean;
  botSeedRotation?: number;
  botNextActAt?: number;
}

interface StoredRoomState {
  code: string;
  status: PublicMatchState["status"];
  countdownEndsAt?: number;
  banEndsAt?: number;
  selectionEndsAt?: number;
  startedAt?: number;
  endsAt?: number;
  winnerId?: string;
  winnerTeamId?: TeamId;
  endedReason?: "race" | "timeout" | "forfeit" | "kick";
  recap?: MatchRecap;
  hostId?: string;
  hostSessionId?: string;
  settings?: RoomSettings;
  players: Omit<
    PlayerState,
    "connected" | "inputDir" | "lastMovementAt" | "lastActionAt" | "botNextActAt"
  >[];
  teams?: MatchTeam[];
  fieldCargo?: Cargo[];
  marketPrices?: Record<CropId, number>;
  banTurnPlayerId?: string;
  roomClosesAt?: number;
}

const MOVE_SPEED_TILES_PER_SECOND = 5.8;
const ACTION_COOLDOWN_MS = 80;
const SNAPSHOT_INTERVAL_MS = 50;
const GROWTH_INTERVAL_MS = 500;
const PERSIST_INTERVAL_MS = 1000;
const RECONNECT_GRACE_MS = 30_000;
const ROOM_CLOSE_MS = 60_000;
const MAX_SPECTATORS = 10;
const BOT_TICK_MS = 150;
const BOT_NAMES = ["บอทมะลิ", "บอทข้าวหอม", "บอทตะวัน", "บอทใบเตย", "บอทมะนาว"];
const BOT_COSMETICS: PlayerCosmetics = { hat: "#8bc967", shirt: "#4cc2ee", pants: "#4a2f5c" };

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
  private banEndsAt?: number;
  private selectionEndsAt?: number;
  private startedAt?: number;
  private endsAt?: number;
  private winnerId?: string;
  private winnerTeamId?: TeamId;
  private endedReason?: "race" | "timeout" | "forfeit" | "kick";
  private recap?: MatchRecap;
  private hostId?: string;
  private hostSessionId?: string;
  private settings: RoomSettings = DEFAULT_ROOM_SETTINGS;
  private players = new Map<string, PlayerState>();
  private teams: MatchTeam[] = [];
  private fieldCargo: Cargo[] = [];
  private marketPrices: Record<CropId, number> = makeMarketPrices();
  private banTurnPlayerId?: string;
  private roomClosesAt?: number;
  private initialized?: Promise<void>;
  private wsToPlayer = new WeakMap<WebSocket, string>();
  private wsToRole = new WeakMap<WebSocket, MatchRole>();
  private pendingEvents: ServerEvent[] = [];
  private dirty = false;
  private lastPersistAt = 0;
  private lastPriceUpdateAt = 0;
  private snapshotTimer?: ReturnType<typeof setInterval>;
  private growthTimer?: ReturnType<typeof setInterval>;
  private phaseTimer?: ReturnType<typeof setTimeout>;
  private botTimer?: ReturnType<typeof setInterval>;
  private botPlans = new Map<string, BotPlan>();

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

  private requiresCropSelection(player: PlayerState): boolean {
    return !(this.settings.mode === "2v2" && player.role === "seller");
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();
    const url = new URL(request.url);
    if (url.pathname === "/joinable") {
      // Matchmaker asks this before pairing a player in: a room is joinable
      // only while still in the lobby with an open player slot.
      const joinable = this.status === "lobby" && this.players.size < this.settings.maxPlayers;
      return Response.json({
        joinable,
        status: this.status,
        players: this.players.size,
        maxPlayers: this.settings.maxPlayers,
      });
    }
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

    if (msg.t === "start") {
      if (!this.isHostSocket(ws) || this.status !== "lobby") return;
      if (this.players.size !== this.settings.maxPlayers) return;
      for (const p of this.players.values()) p.ready = true;
      this.maybeStartCountdown();
      this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (msg.t === "add_bot") {
      this.addBot(ws);
      return;
    }

    if (msg.t === "remove_bot") {
      this.removeBot(ws, msg.playerId);
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
      if (this.status === "lobby") {
        if (this.isHostSocket(ws) && this.players.size === this.settings.maxPlayers) {
          for (const p of this.players.values()) p.ready = true;
        } else {
          player.ready = !player.ready;
        }
        this.maybeStartCountdown();
        this.persist();
        this.broadcastSnapshot();
        return;
      }
      if (this.status === "crop_ban") {
        if (player.id !== this.banTurnPlayerId) return;
        if (!player.bannedCrop) return;
        if (player.ready) return;

        const alreadyBanned = [...this.players.values()].some(
          (p) => p.id !== player.id && p.ready && p.bannedCrop === player.bannedCrop,
        );
        if (alreadyBanned) {
          this.sendTo(ws, {
            t: "error",
            code: "crop_already_banned",
            message: "ผักชนิดนี้ถูกแบนไปแล้วโดยผู้เล่นอีกคน กรุณาเลือกผักชนิดอื่น",
          });
          return;
        }

        this.commitBanTurnReady(player);

        this.persist();
        this.broadcastSnapshot();
        return;
      }
      if (this.status === "crop_selection") {
        if (
          this.requiresCropSelection(player) &&
          normalizeSelectedCrops(player.selectedCrops, this.bannedCropIds()).length !==
            DEFAULT_SELECTED_CROPS.length
        )
          return;
        player.ready = !player.ready;
        this.maybeStartPrepareCountdown();
        this.persist();
        this.broadcastSnapshot();
        return;
      }
      return;
    }

    if (msg.t === "rematch") {
      if (this.status !== "ended") return;
      player.ready = true;
      this.markBotsReady();
      // Auto-ready disconnected players — they can't click the button themselves
      for (const p of this.players.values()) {
        if (!p.connected && !p.isBot) p.ready = true;
      }
      const allReady = [...this.players.values()].every((p) => p.ready);
      if (this.players.size === this.settings.maxPlayers && allReady) this.resetForRematch();
      this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (msg.t === "ban_crop") {
      if (this.status !== "crop_ban") return;
      if (player.id !== this.banTurnPlayerId) return;
      if (player.ready) return;

      const alreadyBanned = [...this.players.values()].some(
        (p) => p.id !== player.id && p.ready && p.bannedCrop === msg.id,
      );
      if (alreadyBanned) {
        this.sendTo(ws, {
          t: "error",
          code: "crop_already_banned",
          message: "ผักชนิดนี้ถูกแบนไปแล้วโดยผู้เล่นอีกคน กรุณาเลือกผักชนิดอื่น",
        });
        return;
      }

      player.bannedCrop = msg.id;
      this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (msg.t === "select_crops") {
      if (this.status !== "crop_selection") return;
      const selected = normalizeSelectedCrops(msg.ids, this.bannedCropIds());
      if (selected.length > DEFAULT_SELECTED_CROPS.length) return;
      player.selectedCrops = selected;
      player.seedChoice = selected[0] ?? firstAllowedCrop(this.bannedCropIds());
      player.ready = false;
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
      if (!isSelectedCrop(msg.id, player.selectedCrops)) return;
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
    if (msg.t === "pick_up") {
      if (now - player.lastActionAt < ACTION_COOLDOWN_MS) return;
      this.advanceMovement(now);
      if (msg.pos) player.pos = clampPos(msg.pos);
      this.pickUpCargo(player, now);
      return;
    }
    if (msg.t === "sell_cargo") {
      if (now - player.lastActionAt < ACTION_COOLDOWN_MS) return;
      this.advanceMovement(now);
      if (msg.pos) player.pos = clampPos(msg.pos);
      this.sellCargo(player, now);
      return;
    }
    if (msg.t === "seller_puzzle_sell") {
      if (now - player.lastActionAt < ACTION_COOLDOWN_MS) return;
      this.advanceMovement(now);
      if (msg.pos) player.pos = clampPos(msg.pos);
      this.sellCargo(player, now, msg.choice);
      return;
    }
    if (msg.t === "action") {
      if (now - player.lastActionAt < ACTION_COOLDOWN_MS) return;
      this.advanceMovement(now);
      if (msg.pos) player.pos = clampPos(msg.pos);
      if (msg.dir) player.dir = msg.dir;
      if (this.settings.mode === "2v2" && player.role === "seller") {
        if (playerCargoCount(player) < SELLER_BASKET_CAPACITY) this.pickUpCargo(player, now);
      } else {
        this.resolvePlayerAction(player, now);
      }
      return;
    }
  }

  private resolvePlayerAction(player: PlayerState, now: number): void {
    if (this.settings.mode === "2v2") {
      this.resolveTeamPlayerAction(player, now);
      return;
    }
    const playerId = player.id;
    player.lastActionAt = now;
    if (player.tool === "seed" && !isSelectedCrop(player.seedChoice, player.selectedCrops)) {
      player.seedChoice = normalizeSelectedCrops(player.selectedCrops, this.bannedCropIds())[0];
    }
    const result = applyAction({
      tiles: player.tiles,
      coins: player.coins,
      pos: player.pos,
      dir: player.dir,
      tool: player.tool,
      seedChoice: player.seedChoice,
      marketPrices: this.marketPrices,
      now,
    });
    player.tiles = result.tiles;
    player.coins = result.coins;
    let coinsBonus = 0;
    for (const ev of result.events) {
      if (ev.kind === "harvest") {
        player.stats.harvests += 1;
        player.stats.cropHarvests[ev.cropId] += 1;
        if (ev.reward > 0) {
          const { bonus, nextState } = updateComboAndGetBonus(
            {
              combo: player.combo,
              lastHarvestAt: player.lastHarvestAt,
              crops: player.comboCrops,
            },
            ev.cropId,
            ev.reward,
            now,
            0.2,
          );
          player.combo = nextState.combo;
          player.lastHarvestAt = nextState.lastHarvestAt;
          player.comboCrops = nextState.crops;
          coinsBonus += bonus;
          ev.reward += bonus;

          // Update dynamic market prices
          const basePrice = CROPS[ev.cropId].sellPrice;
          const currentPrice = this.marketPrices[ev.cropId];
          const safeCurrentPrice =
            typeof currentPrice === "number" && Number.isFinite(currentPrice)
              ? currentPrice
              : basePrice;
          this.marketPrices[ev.cropId] = Math.max(
            basePrice * 0.5,
            safeCurrentPrice - basePrice * 0.1,
          );
          for (const cId of Object.keys(this.marketPrices) as CropId[]) {
            if (cId !== ev.cropId) {
              const otherBase = CROPS[cId].sellPrice;
              const otherCurrent = this.marketPrices[cId];
              const safeOtherCurrent =
                typeof otherCurrent === "number" && Number.isFinite(otherCurrent)
                  ? otherCurrent
                  : otherBase;
              this.marketPrices[cId] = Math.min(
                otherBase * 1.2,
                safeOtherCurrent + otherBase * 0.03,
              );
            }
          }
        } else {
          player.combo = 0;
          player.lastHarvestAt = now;
          player.comboCrops = [];
        }
        player.stats.coinsEarned += ev.reward;
      }
      this.pendingEvents.push({ ...ev, playerId });
    }
    player.coins += coinsBonus;
    if (player.coins >= this.settings.targetCoins) this.endMatch(playerId, "race");
    else {
      this.persist();
      this.broadcastSnapshot();
    }
    if (this.pendingEvents.length) {
      this.broadcast({ t: "events", events: this.pendingEvents });
      this.pendingEvents = [];
    }
  }

  private resolveTeamPlayerAction(player: PlayerState, now: number): void {
    player.lastActionAt = now;
    if (player.role !== "farmer") return;
    const team = player.teamId ? this.teams.find((t) => t.id === player.teamId) : undefined;
    if (!team) return;
    if (player.tool === "seed" && !isSelectedCrop(player.seedChoice, player.selectedCrops)) {
      player.seedChoice = normalizeSelectedCrops(player.selectedCrops, this.bannedCropIds())[0];
    }
    const result = applyAction({
      tiles: player.tiles,
      coins: team.coins,
      pos: player.pos,
      dir: player.dir,
      tool: player.tool,
      seedChoice: player.seedChoice,
      marketPrices: this.marketPrices,
      harvestCreditsCoins: false,
      now,
    });
    player.tiles = result.tiles;
    team.coins = result.coins;
    const changed = result.events.length > 0;
    for (const teammate of this.players.values()) {
      if (teammate.teamId === player.teamId && teammate.id !== player.id) {
        teammate.tiles = player.tiles;
      }
    }
    for (const ev of result.events) {
      if (ev.kind === "harvest") {
        player.stats.harvests += 1;
        player.stats.cropHarvests[ev.cropId] += 1;
        const cargoId = crypto.randomUUID();
        const cargo: Cargo = {
          id: cargoId,
          cropId: ev.cropId,
          position: { x: ev.x, y: ev.y },
          ownerPlayerId: player.id,
          teamId: team.id,
          baseReward: ev.reward,
          createdAt: now,
        };
        this.fieldCargo.push(cargo);
        this.pendingEvents.push({ kind: "cargo_created", playerId: player.id, cargo });
        this.updateMarketAfterHarvest(ev.cropId);
      } else {
        this.pendingEvents.push({ ...ev, playerId: player.id });
      }
    }
    this.mirrorTeamCoinsToPlayers();
    this.checkTeamRaceWin();
    if (this.status !== "ended") {
      if (changed) this.persist();
      this.broadcastSnapshot();
    }
    this.flushEvents();
  }

  private pickUpCargo(player: PlayerState, now: number): void {
    player.lastActionAt = now;
    if (this.settings.mode !== "2v2" || player.role !== "seller" || !player.teamId) return;
    const stack = playerCargoStack(player);
    if (stack.length >= SELLER_BASKET_CAPACITY) return;
    const idx = this.fieldCargo.findIndex(
      (cargo) =>
        cargo.teamId === player.teamId &&
        Math.hypot(cargo.position.x - player.pos.x, cargo.position.y - player.pos.y) <= 1.5,
    );
    if (idx < 0) return;
    const [cargo] = this.fieldCargo.splice(idx, 1);
    stack.push(cargo);
    player.cargoStack = stack;
    player.carryingCargo = stack[stack.length - 1];
    this.pendingEvents.push({ kind: "cargo_picked_up", playerId: player.id, cargoId: cargo.id });
    this.persist();
    this.broadcastSnapshot();
    this.flushEvents();
  }

  private sellCargo(player: PlayerState, now: number, puzzleChoice?: SellerPuzzleChoice): void {
    player.lastActionAt = now;
    if (this.settings.mode !== "2v2" || player.role !== "seller" || !player.teamId) return;
    const stack = playerCargoStack(player);
    if (stack.length === 0) return;
    if (Math.hypot(MARKET_TILE_POS.x - player.pos.x, MARKET_TILE_POS.y - player.pos.y) > 1.5)
      return;
    const team = this.teams.find((t) => t.id === player.teamId);
    if (!team) return;

    // Sell one cargo (top of stack) per call
    const cargo = stack.shift()!;
    if (stack.length === 0) {
      player.cargoStack = [];
      player.carryingCargo = undefined;
    } else {
      player.cargoStack = stack;
      player.carryingCargo = stack[stack.length - 1];
    }

    const distance = Math.hypot(
      cargo.position.x - MARKET_TILE_POS.x,
      cargo.position.y - MARKET_TILE_POS.y,
    );
    const baseReward = Math.round(cargo.baseReward * (1 + 0.1 * distance));
    const correct = puzzleChoice !== undefined && puzzleChoice === cargo.cropId;
    const reward =
      puzzleChoice === undefined
        ? baseReward
        : correct
          ? Math.round(baseReward * 1.25)
          : Math.round(baseReward * 0.9);
    const bonus = reward - baseReward;

    team.coins += reward;
    player.stats.coinsEarned += reward;
    this.mirrorTeamCoinsToPlayers();
    this.pendingEvents.push({
      kind: "cargo_sold",
      playerId: player.id,
      teamId: team.id,
      cargoId: cargo.id,
      reward,
      distance,
      puzzleChoice,
      puzzleCorrect: puzzleChoice === undefined ? undefined : correct,
      bonus: puzzleChoice === undefined ? undefined : bonus,
      count: 1,
      cargoIds: [cargo.id],
      totalReward: reward,
    });
    this.checkTeamRaceWin();
    if (this.status !== "ended") {
      this.persist();
      this.broadcastSnapshot();
    }
    this.flushEvents();
  }

  private flushEvents(): void {
    if (!this.pendingEvents.length) return;
    this.broadcast({ t: "events", events: this.pendingEvents });
    this.pendingEvents = [];
  }

  private updateMarketAfterHarvest(cropId: CropId): void {
    const basePrice = CROPS[cropId].sellPrice;
    const currentPrice = this.marketPrices[cropId];
    const safeCurrentPrice =
      typeof currentPrice === "number" && Number.isFinite(currentPrice) ? currentPrice : basePrice;
    this.marketPrices[cropId] = Math.max(basePrice * 0.5, safeCurrentPrice - basePrice * 0.1);
    for (const cId of Object.keys(this.marketPrices) as CropId[]) {
      if (cId === cropId) continue;
      const otherBase = CROPS[cId].sellPrice;
      const otherCurrent = this.marketPrices[cId];
      const safeOtherCurrent =
        typeof otherCurrent === "number" && Number.isFinite(otherCurrent)
          ? otherCurrent
          : otherBase;
      this.marketPrices[cId] = Math.min(otherBase * 1.2, safeOtherCurrent + otherBase * 0.03);
    }
  }

  private syncTeamsAndRoles(resetCoins = false): void {
    if (this.settings.mode !== "2v2") {
      this.teams = [];
      this.fieldCargo = [];
      for (const player of this.players.values()) {
        player.teamId = undefined;
        player.role = undefined;
        clearPlayerCargo(player);
      }
      return;
    }

    const players = [...this.players.values()];
    const existingCoins = new Map(this.teams.map((team) => [team.id, team.coins]));
    this.teams = [
      {
        id: "A",
        name: "Team A",
        playerIds: players.slice(0, 2).map((p) => p.id),
        coins: resetCoins ? 50 : (existingCoins.get("A") ?? 50),
      },
      {
        id: "B",
        name: "Team B",
        playerIds: players.slice(2, 4).map((p) => p.id),
        coins: resetCoins ? 50 : (existingCoins.get("B") ?? 50),
      },
    ];
    for (const [idx, player] of players.entries()) {
      player.teamId = idx < 2 ? "A" : "B";
      player.role = idx % 2 === 0 ? "farmer" : "seller";
      if (player.role !== "seller") clearPlayerCargo(player);
    }
    this.mirrorTeamCoinsToPlayers();
  }

  private mirrorTeamCoinsToPlayers(): void {
    if (this.settings.mode !== "2v2") return;
    for (const player of this.players.values()) {
      const team = player.teamId ? this.teams.find((t) => t.id === player.teamId) : undefined;
      if (team) player.coins = team.coins;
    }
  }

  private checkTeamRaceWin(): void {
    if (this.settings.mode !== "2v2") return;
    const winner = this.teams.find((team) => team.coins >= this.settings.targetCoins);
    if (winner) this.endMatchTeam(winner.id, "race");
  }

  private spawnPosForSlot(slot: number): { x: number; y: number } {
    if (this.settings.mode !== "2v2") return { x: slot === 0 ? 3 : 8, y: 4 };
    const spots = [
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 8, y: 3 },
      { x: 9, y: 4 },
    ];
    return spots[slot] ?? { x: 6, y: 4 };
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
    if (isPreGamePhase(this.status)) {
      this.status = "lobby";
      this.countdownEndsAt = undefined;
      this.banEndsAt = undefined;
      this.selectionEndsAt = undefined;
      this.clearBotTimer();
      for (const player of this.players.values()) {
        player.ready = false;
        player.bannedCrop = undefined;
        player.botNextActAt = undefined;
      }
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
      this.startCropBan();
      return;
    }
    if (this.status === "crop_ban" && this.banEndsAt && now >= this.banEndsAt) {
      this.handleBanTimerExpiry();
      return;
    }
    if (this.status === "crop_selection" && this.selectionEndsAt && now >= this.selectionEndsAt) {
      this.startPrepareCountdown();
      return;
    }
    if (
      this.status === "prepare_countdown" &&
      this.countdownEndsAt &&
      now >= this.countdownEndsAt
    ) {
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
    if (this.status === "ended" && this.roomClosesAt && now >= this.roomClosesAt) {
      this.closeRoom();
      return;
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
    this.banEndsAt = stored.banEndsAt;
    this.selectionEndsAt = stored.selectionEndsAt;
    this.startedAt = stored.startedAt;
    this.endsAt = stored.endsAt;
    this.winnerId = stored.winnerId;
    this.winnerTeamId = stored.winnerTeamId;
    this.endedReason = stored.endedReason;
    this.recap = stored.recap;
    this.hostId = stored.hostId;
    this.hostSessionId = stored.hostSessionId;
    this.settings = roomSettingsSchema.catch(DEFAULT_ROOM_SETTINGS).parse(stored.settings);
    this.banTurnPlayerId = stored.banTurnPlayerId;
    this.roomClosesAt = stored.roomClosesAt;
    this.players = new Map(
      stored.players.map((p) => [
        p.id,
        {
          ...p,
          connected: Boolean(p.isBot),
          disconnectedAt: undefined,
          selectedCrops: normalizeSelectedCrops(
            p.selectedCrops,
            effectiveBannedCrops(stored.players),
          ),
          bannedCrop: isCropId(p.bannedCrop) ? p.bannedCrop : undefined,
          seedChoice: isSelectedCrop(p.seedChoice, p.selectedCrops)
            ? p.seedChoice
            : normalizeSelectedCrops(p.selectedCrops, effectiveBannedCrops(stored.players))[0],
          stats: normalizeStats(p.stats),
          inputDir: undefined,
          lastMovementAt: Date.now(),
          lastActionAt: 0,
          combo: p.combo ?? 0,
          lastHarvestAt: p.lastHarvestAt ?? 0,
          comboCrops: p.comboCrops ?? [],
          botNextActAt: undefined,
        },
      ]),
    );
    this.teams = normalizeTeams(stored.teams);
    this.fieldCargo = normalizeCargo(stored.fieldCargo);
    this.marketPrices = normalizeMarketPrices(stored.marketPrices);
    if (this.settings.mode === "2v2") this.syncTeamsAndRoles(false);
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
    if (
      this.status === "crop_ban" ||
      this.status === "crop_selection" ||
      this.status === "playing"
    ) {
      this.ensureBotTimer();
    }
    this.scheduleAlarm();
  }

  private persist(): void {
    const players = [...this.players.values()].map(
      ({
        connected: _connected,
        inputDir: _inputDir,
        lastMovementAt: _lastMovementAt,
        lastActionAt: _lastActionAt,
        botNextActAt: _botNextActAt,
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
        banEndsAt: this.banEndsAt,
        selectionEndsAt: this.selectionEndsAt,
        startedAt: this.startedAt,
        endsAt: this.endsAt,
        winnerId: this.winnerId,
        winnerTeamId: this.winnerTeamId,
        endedReason: this.endedReason,
        recap: this.recap,
        hostId: this.hostId,
        hostSessionId: this.hostSessionId,
        settings: this.settings,
        players,
        teams: this.teams,
        fieldCargo: this.fieldCargo,
        marketPrices: this.marketPrices,
        banTurnPlayerId: this.banTurnPlayerId,
        roomClosesAt: this.roomClosesAt,
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
      this.status === "countdown" || this.status === "prepare_countdown"
        ? this.countdownEndsAt
        : this.status === "crop_ban"
          ? this.banEndsAt
          : this.status === "crop_selection"
            ? this.selectionEndsAt
            : this.status === "playing"
              ? minDefined(
                  this.endsAt,
                  Number.isFinite(reconnectDeadline) ? reconnectDeadline : undefined,
                )
              : this.status === "ended"
                ? this.roomClosesAt
                : undefined;
    if (time) this.ctx.waitUntil(this.ctx.storage.setAlarm(time));
  }

  private dropDisconnectedWaitingPlayers(): void {
    if (this.status === "playing" || this.status === "ended") return;
    for (const [id, player] of this.players) {
      if (!player.connected) this.players.delete(id);
    }
    this.syncTeamsAndRoles();
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
    this.syncTeamsAndRoles();
    for (const player of this.players.values()) player.ready = false;
    this.persist();
    this.broadcastSnapshot();
  }

  private addBot(ws: WebSocket): void {
    if (!this.canEditRoom(ws) || this.status !== "lobby") {
      this.sendTo(ws, { t: "error", code: "host_only", message: "HOST เท่านั้นที่เพิ่มบอทได้" });
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
    const playerId = crypto.randomUUID();
    const sessionId = `bot:${crypto.randomUUID()}`;
    const spawn = this.spawnPosForSlot(this.players.size);
    const used = new Set([...this.players.values()].filter((p) => p.isBot).map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? "บอท";
    this.players.set(playerId, {
      id: playerId,
      sessionId,
      name,
      cosmetics: BOT_COSMETICS,
      coins: 50,
      pos: spawn,
      dir: "down",
      tool: "hoe",
      seedChoice: DEFAULT_SELECTED_CROPS[0],
      selectedCrops: fillSelectedCrops(),
      bannedCrop: undefined,
      tiles: makeEmptyField(),
      ready: false,
      connected: true,
      disconnectedAt: undefined,
      stats: emptyStats(),
      inputDir: undefined,
      lastMovementAt: Date.now(),
      lastActionAt: 0,
      combo: 0,
      lastHarvestAt: 0,
      comboCrops: [],
      isBot: true,
      botSeedRotation: 0,
    });
    this.syncTeamsAndRoles();
    for (const p of this.players.values()) p.ready = false;
    this.persist();
    this.broadcastSnapshot();
  }

  private removeBot(ws: WebSocket, targetId: string): void {
    if (!this.canEditRoom(ws) || this.status !== "lobby") {
      this.sendTo(ws, { t: "error", code: "host_only", message: "HOST เท่านั้นที่ลบบอทได้" });
      return;
    }
    const target = this.players.get(targetId);
    if (!target || !target.isBot) {
      this.sendTo(ws, { t: "error", code: "missing_bot", message: "ไม่พบบอทนี้" });
      return;
    }
    this.players.delete(targetId);
    this.syncTeamsAndRoles();
    for (const p of this.players.values()) p.ready = false;
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
    this.syncTeamsAndRoles();
    for (const p of this.players.values()) p.ready = false;
    this.persist();
    this.broadcastSnapshot();
  }

  private claimPlayerSlot(ws: WebSocket): void {
    if (this.wsToRole.get(ws) === "player") {
      this.sendTo(ws, { t: "error", code: "already_player", message: "คุณอยู่ในช่องผู้เล่นแล้ว" });
      return;
    }
    if (isMatchActiveOrStarting(this.status)) {
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
    const spawn = this.spawnPosForSlot(this.players.size);
    const cosmetics = cosmeticsSchema.parse(att?.cosmetics ?? DEFAULT_COSMETICS);
    if (!this.hostSessionId) this.hostSessionId = sessionId;
    if (this.hostSessionId === sessionId) this.hostId = playerId;
    this.players.set(playerId, {
      id: playerId,
      sessionId,
      name: att?.name ?? "Player",
      cosmetics,
      coins: 50,
      pos: spawn,
      dir: "down",
      tool: "hoe",
      seedChoice: DEFAULT_SELECTED_CROPS[0],
      selectedCrops: fillSelectedCrops(),
      bannedCrop: undefined,
      tiles: makeEmptyField(),
      ready: false,
      connected: true,
      disconnectedAt: undefined,
      stats: emptyStats(),
      inputDir: undefined,
      lastMovementAt: Date.now(),
      lastActionAt: 0,
      combo: 0,
      lastHarvestAt: 0,
      comboCrops: [],
    });
    this.syncTeamsAndRoles();
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
      state: this.getFilteredState("player", playerId),
    });
    this.persist();
    this.broadcastSnapshot();
  }

  private leavePlayerSlot(ws: WebSocket): void {
    if (isMatchActiveOrStarting(this.status)) {
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
    this.syncTeamsAndRoles();
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
      state: this.getFilteredState("spectator", spectatorId),
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
      let claimedHost = false;
      if (!this.hostSessionId) {
        this.hostSessionId = spectatorSessionId;
        claimedHost = true;
      }
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
        state: this.getFilteredState(role, spectatorId),
      });
      // Persist so a spectator-host's claim survives DO hibernation/reload.
      if (claimedHost) this.persist();
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
      const spawn = this.spawnPosForSlot(this.players.size);
      if (!this.hostSessionId) this.hostSessionId = sessionId;
      if (this.hostSessionId === sessionId) this.hostId = playerId;
      this.players.set(playerId, {
        id: playerId,
        sessionId,
        name,
        cosmetics: cosmeticsSchema.parse(cosmetics),
        coins: 50,
        pos: spawn,
        dir: "down",
        tool: "hoe",
        seedChoice: DEFAULT_SELECTED_CROPS[0],
        selectedCrops: fillSelectedCrops(),
        bannedCrop: undefined,
        tiles: makeEmptyField(),
        ready: false,
        connected: true,
        disconnectedAt: undefined,
        stats: emptyStats(),
        inputDir: undefined,
        lastMovementAt: Date.now(),
        lastActionAt: 0,
        combo: 0,
        lastHarvestAt: 0,
        comboCrops: [],
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

    this.syncTeamsAndRoles();
    ws.serializeAttachment({ playerId, sessionId, role });
    this.wsToPlayer.set(ws, playerId);
    this.wsToRole.set(ws, role);
    this.sendTo(ws, {
      t: "welcome",
      playerId,
      sessionId,
      role,
      host: this.hostSessionId === sessionId,
      state: this.getFilteredState(role, playerId),
    });
    this.persist();
    this.broadcastSnapshot();
  }

  private cancelCountdown(ws: WebSocket): void {
    if (!this.isHostSocket(ws) || !isPreGamePhase(this.status)) return;
    this.status = "lobby";
    this.countdownEndsAt = undefined;
    this.banEndsAt = undefined;
    this.selectionEndsAt = undefined;
    this.clearBotTimer();
    for (const player of this.players.values()) {
      player.ready = false;
      player.bannedCrop = undefined;
      player.botNextActAt = undefined;
    }
    this.persist();
    this.broadcastSnapshot();
  }

  private markBotsReady(): void {
    for (const p of this.players.values()) if (p.isBot) p.ready = true;
  }

  private maybeStartCountdown(): void {
    if (this.status !== "lobby") return;
    this.markBotsReady();
    if (this.players.size !== this.settings.maxPlayers) return;
    if (![...this.players.values()].every((p) => p.ready)) return;
    this.status = "countdown";
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.scheduleAlarm();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => this.startCropBan(), COUNTDOWN_MS);
  }

  private startCropBan(): void {
    if (this.status !== "countdown") return;
    this.status = "crop_ban";
    this.countdownEndsAt = undefined;
    this.banEndsAt = Date.now() + CROP_BAN_MS;
    for (const p of this.players.values()) {
      p.ready = false;
      p.bannedCrop = undefined;
      p.selectedCrops = [];
      p.seedChoice = DEFAULT_SELECTED_CROPS[0];
    }

    const pList = [...this.players.values()];
    if (pList.length > 0) {
      const randIdx = Math.floor(Math.random() * pList.length);
      this.banTurnPlayerId = pList[randIdx].id;
    } else {
      this.banTurnPlayerId = undefined;
    }

    for (const p of this.players.values()) p.botNextActAt = undefined;
    this.botPlans.clear();
    this.ensureBotTimer();
    this.scheduleAlarm();
    this.persist();
    this.broadcastSnapshot();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => this.handleBanTimerExpiry(), CROP_BAN_MS);
  }

  private commitBanTurnReady(player: PlayerState): void {
    player.ready = true;
    for (const p of this.players.values()) {
      if (p.id !== player.id && !p.ready && p.bannedCrop === player.bannedCrop) {
        p.bannedCrop = undefined;
      }
    }
    const nextPlayer = this.nextUnreadyBanPlayer(player.id);
    if (nextPlayer) {
      this.banTurnPlayerId = nextPlayer.id;
      this.banEndsAt = Date.now() + CROP_BAN_MS;
      this.scheduleAlarm();
      if (this.phaseTimer) clearTimeout(this.phaseTimer);
      this.phaseTimer = setTimeout(() => this.handleBanTimerExpiry(), CROP_BAN_MS);
    } else {
      this.maybeFastForwardCropBan();
    }
  }

  private nextUnreadyBanPlayer(afterPlayerId: string): PlayerState | undefined {
    const players = [...this.players.values()];
    if (!players.length) return undefined;
    const start = Math.max(
      0,
      players.findIndex((p) => p.id === afterPlayerId),
    );
    for (let i = 1; i <= players.length; i++) {
      const player = players[(start + i) % players.length];
      if (!player.ready) return player;
    }
    return undefined;
  }

  private maybeFastForwardCropBan(): void {
    if (this.status !== "crop_ban") return;
    if (this.players.size !== this.settings.maxPlayers) return;
    const allReady = [...this.players.values()].every((p) => p.bannedCrop && p.ready);
    if (!allReady) return;
    const now = Date.now();
    if (this.banEndsAt && this.banEndsAt - now > 5000) {
      this.banEndsAt = now + 5000;
      this.scheduleAlarm();
      if (this.phaseTimer) clearTimeout(this.phaseTimer);
      this.phaseTimer = setTimeout(() => this.startCropSelection(), 5000);
    }
  }

  private handleBanTimerExpiry(): void {
    if (this.status !== "crop_ban") return;
    const activePlayer = this.banTurnPlayerId ? this.players.get(this.banTurnPlayerId) : undefined;
    if (activePlayer && !activePlayer.ready) {
      if (!activePlayer.bannedCrop) {
        const bannedAlready = [...this.players.values()]
          .filter((p) => p.ready && p.bannedCrop)
          .map((p) => p.bannedCrop!);
        const allowed = (Object.keys(CROPS) as CropId[]).filter(
          (id) => !bannedAlready.includes(id),
        );
        const randIdx = Math.floor(Math.random() * allowed.length);
        activePlayer.bannedCrop = allowed[randIdx];
      }
      activePlayer.ready = true;

      for (const p of this.players.values()) {
        if (p.id !== activePlayer.id && !p.ready && p.bannedCrop === activePlayer.bannedCrop) {
          p.bannedCrop = undefined;
        }
      }

      const nextPlayer = this.nextUnreadyBanPlayer(activePlayer.id);
      if (nextPlayer) {
        this.banTurnPlayerId = nextPlayer.id;
        this.banEndsAt = Date.now() + CROP_BAN_MS;
        this.scheduleAlarm();
        if (this.phaseTimer) clearTimeout(this.phaseTimer);
        this.phaseTimer = setTimeout(() => this.handleBanTimerExpiry(), CROP_BAN_MS);
        this.persist();
        this.broadcastSnapshot();
        return;
      }
    }
    this.startCropSelection();
  }

  private startCropSelection(): void {
    if (this.status !== "crop_ban") return;
    this.status = "crop_selection";
    this.banEndsAt = undefined;
    this.selectionEndsAt = Date.now() + CROP_SELECTION_MS;
    const banned = this.bannedCropIds();
    for (const p of this.players.values()) {
      p.ready = false;
      p.selectedCrops = [];
      p.seedChoice = firstAllowedCrop(banned);
      p.botNextActAt = undefined;
    }
    this.ensureBotTimer();
    this.scheduleAlarm();
    this.persist();
    this.broadcastSnapshot();
  }

  private maybeStartPrepareCountdown(): void {
    if (this.status !== "crop_selection") return;
    if (this.players.size !== this.settings.maxPlayers) return;
    if (
      ![...this.players.values()].every(
        (p) =>
          p.ready &&
          (!this.requiresCropSelection(p) ||
            normalizeSelectedCrops(p.selectedCrops, this.bannedCropIds()).length ===
              DEFAULT_SELECTED_CROPS.length),
      )
    )
      return;
    this.startPrepareCountdown();
  }

  private startPrepareCountdown(): void {
    if (this.status !== "crop_selection") return;
    this.status = "prepare_countdown";
    this.selectionEndsAt = undefined;
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    for (const p of this.players.values()) {
      p.selectedCrops = fillSelectedCrops(p.selectedCrops, this.bannedCropIds());
      p.ready = false;
    }
    this.scheduleAlarm();
    this.persist();
    this.broadcastSnapshot();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => this.startPlaying(), COUNTDOWN_MS);
  }

  private startPlaying(): void {
    if (this.status !== "prepare_countdown") return;
    const now = Date.now();
    this.status = "playing";
    this.startedAt = now;
    this.endsAt = now + this.settings.durationMs;
    this.countdownEndsAt = undefined;
    this.banEndsAt = undefined;
    this.selectionEndsAt = undefined;
    this.marketPrices = makeMarketPrices();
    this.lastPriceUpdateAt = now;
    this.fieldCargo = [];
    this.syncTeamsAndRoles(true);
    for (const [idx, p] of [...this.players.values()].entries()) {
      p.coins =
        this.settings.mode === "2v2" && p.teamId
          ? (this.teams.find((team) => team.id === p.teamId)?.coins ?? 50)
          : 50;
      p.tiles = makeEmptyField();
      p.tool = "hoe";
      p.selectedCrops = fillSelectedCrops(p.selectedCrops, this.bannedCropIds());
      p.seedChoice = p.selectedCrops[0];
      p.dir = "down";
      p.pos = this.spawnPosForSlot(idx);
      p.disconnectedAt = undefined;
      p.stats = emptyStats();
      p.inputDir = undefined;
      p.lastMovementAt = now;
      p.lastActionAt = 0;
      p.combo = 0;
      p.lastHarvestAt = 0;
      p.comboCrops = [];
      p.botSeedRotation = 0;
      p.botNextActAt = undefined;
    }
    this.botPlans.clear();
    this.startTimers();
    this.ensureBotTimer();
    this.scheduleAlarm();
    this.persist();
    this.broadcastSnapshot();
  }

  private startTimers(): void {
    this.snapshotTimer ??= setInterval(() => this.tickSnapshot(), SNAPSHOT_INTERVAL_MS);
    this.growthTimer ??= setInterval(() => this.tickGrowthAll(), GROWTH_INTERVAL_MS);
  }

  private hasBots(): boolean {
    return [...this.players.values()].some((p) => p.isBot);
  }

  private ensureBotTimer(): void {
    if (!this.hasBots()) return;
    this.botTimer ??= setInterval(() => this.botTick(), BOT_TICK_MS);
  }

  private clearBotTimer(): void {
    if (this.botTimer) {
      clearInterval(this.botTimer);
      this.botTimer = undefined;
    }
    this.botPlans.clear();
  }

  // ---- Bot AI ------------------------------------------------------------

  private botTick(): void {
    if (!this.hasBots()) {
      this.clearBotTimer();
      return;
    }
    const now = Date.now();
    if (this.status === "crop_ban") this.botBanTick(now);
    else if (this.status === "crop_selection") this.botSelectionTick(now);
    else if (this.status === "playing") this.botFarmTick(now);
  }

  private botBanTick(now: number): void {
    const bot = this.banTurnPlayerId ? this.players.get(this.banTurnPlayerId) : undefined;
    if (!bot || !bot.isBot || bot.ready) return;
    if (bot.botNextActAt === undefined) {
      bot.botNextActAt = now + randInt(800, 1800);
      return;
    }
    if (now < bot.botNextActAt) return;
    bot.botNextActAt = undefined;
    const taken = [...this.players.values()]
      .filter((p) => p.id !== bot.id && p.ready && p.bannedCrop)
      .map((p) => p.bannedCrop!);
    const allowed = (Object.keys(CROPS) as CropId[]).filter((id) => !taken.includes(id));
    // Medium: ban a strong crop to deny the rival (top by sell price).
    const pick = [...allowed].sort((a, b) => CROPS[b].sellPrice - CROPS[a].sellPrice);
    bot.bannedCrop = pick[randInt(0, Math.min(2, pick.length - 1))] ?? allowed[0];
    this.commitBanTurnReady(bot);
    this.persist();
    this.broadcastSnapshot();
  }

  private botSelectionTick(now: number): void {
    let changed = false;
    for (const bot of this.players.values()) {
      if (!bot.isBot || bot.ready) continue;
      if (bot.botNextActAt === undefined) {
        bot.botNextActAt = now + randInt(1200, 2600);
        continue;
      }
      if (now < bot.botNextActAt) continue;
      bot.botNextActAt = undefined;
      bot.selectedCrops = pickBotCrops(this.bannedCropIds());
      bot.seedChoice = bot.selectedCrops[0];
      bot.ready = true;
      changed = true;
    }
    if (changed) {
      this.maybeStartPrepareCountdown();
      this.persist();
      this.broadcastSnapshot();
    }
  }

  private botFarmTick(now: number): void {
    let moved = false;
    for (const bot of this.players.values()) {
      if (!bot.isBot) continue;
      // 2v2 sellers run cargo logistics instead of farming.
      if (this.settings.mode === "2v2" && bot.role === "seller") {
        if (this.botSellerStep(bot, now)) moved = true;
        continue;
      }
      let plan = this.botPlans.get(bot.id);
      if (!plan || !isPlanValid(bot, plan)) {
        const next = chooseBotPlan(bot);
        if (!next) {
          this.botPlans.delete(bot.id);
          continue;
        }
        plan = next;
        this.botPlans.set(bot.id, plan);
      }
      const step = (BOT_TICK_MS / 1000) * MOVE_SPEED_TILES_PER_SECOND;
      const dx = plan.sx - bot.pos.x;
      const dy = plan.sy - bot.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.18) {
        bot.pos.x += Math.max(-step, Math.min(step, dx));
        bot.pos.y += Math.max(-step, Math.min(step, dy));
        bot.dir =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        moved = true;
        continue;
      }
      // Arrived: snap, face target, perform the planned action.
      bot.pos = { x: plan.sx, y: plan.sy };
      bot.dir = plan.dir;
      bot.tool = plan.tool;
      if (plan.tool === "seed") bot.seedChoice = plan.seed;
      this.botPlans.delete(bot.id);
      bot.botSeedRotation = (bot.botSeedRotation ?? 0) + (plan.tool === "seed" ? 1 : 0);
      this.resolvePlayerAction(bot, now);
    }
    if (moved) this.dirty = true;
  }

  /**
   * Seller-bot logistics for 2v2: carry cargo to the market and sell it,
   * otherwise hunt down the nearest team cargo crate and pick it up.
   * Returns true if the bot moved this tick (so the caller marks state dirty).
   */
  private botSellerStep(bot: PlayerState, now: number): boolean {
    const step = (BOT_TICK_MS / 1000) * MOVE_SPEED_TILES_PER_SECOND;
    const stackCount = playerCargoCount(bot);

    // Decide target: market when basket full or no cargo left to collect, else nearest team cargo.
    let target: { x: number; y: number } | undefined;
    const hasTeamCargo = this.fieldCargo.some((c) => c.teamId === bot.teamId);
    if (stackCount > 0 && (stackCount >= SELLER_BASKET_CAPACITY || !hasTeamCargo)) {
      target = MARKET_TILE_POS;
    } else {
      let best: Cargo | undefined;
      let bestDist = Infinity;
      for (const cargo of this.fieldCargo) {
        if (cargo.teamId !== bot.teamId) continue;
        const d = Math.hypot(cargo.position.x - bot.pos.x, cargo.position.y - bot.pos.y);
        if (d < bestDist) {
          best = cargo;
          bestDist = d;
        }
      }
      if (best) {
        target = best.position;
      } else if (stackCount > 0) {
        target = MARKET_TILE_POS;
      }
    }
    if (!target) return false;

    const dx = target.x - bot.pos.x;
    const dy = target.y - bot.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.0) {
      bot.pos.x += Math.max(-step, Math.min(step, dx));
      bot.pos.y += Math.max(-step, Math.min(step, dy));
      bot.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      return true;
    }

    // Within reach: act.
    if (now - bot.lastActionAt < ACTION_COOLDOWN_MS) return false;
    const atMarket =
      Math.hypot(MARKET_TILE_POS.x - bot.pos.x, MARKET_TILE_POS.y - bot.pos.y) <= 1.5;
    if (atMarket && stackCount > 0) {
      // Sell one cargo per tick: bot always matches the right customer (its crop)
      const stack = playerCargoStack(bot);
      this.sellCargo(bot, now, stack[0].cropId);
    } else if (stackCount < SELLER_BASKET_CAPACITY) {
      this.pickUpCargo(bot, now);
    }
    return false;
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
      if (this.settings.mode === "2v2" && p.role === "seller") continue;
      const res = tickGrowth(p.tiles, now);
      if (res.changed) {
        p.tiles = res.tiles;
        changed = true;
        if (this.settings.mode === "2v2") {
          for (const teammate of this.players.values()) {
            if (teammate.teamId === p.teamId && teammate.id !== p.id) teammate.tiles = p.tiles;
          }
        }
      }
    }
    const freshCargo = this.fieldCargo.filter((cargo) => now - cargo.createdAt <= CARGO_TTL_MS);
    if (freshCargo.length !== this.fieldCargo.length) {
      for (const cargo of this.fieldCargo) {
        if (now - cargo.createdAt > CARGO_TTL_MS) {
          this.pendingEvents.push({
            kind: "cargo_spoiled",
            playerId: cargo.ownerPlayerId,
            cargoId: cargo.id,
            x: cargo.position.x,
            y: cargo.position.y,
          });
        }
      }
      this.fieldCargo = freshCargo;
      changed = true;
    }

    // Market price recovery runs every 1 second
    if (now - this.lastPriceUpdateAt >= 1000) {
      this.lastPriceUpdateAt = now;
      let pricesChanged = false;
      for (const cId of Object.keys(this.marketPrices) as CropId[]) {
        const base = CROPS[cId].sellPrice;
        const current = this.marketPrices[cId];
        if (!Number.isFinite(current)) {
          // Heal corrupted NaN/Infinity price back to base
          this.marketPrices[cId] = base;
          pricesChanged = true;
        } else if (current < base) {
          this.marketPrices[cId] = Math.min(base, current + base * 0.005);
          pricesChanged = true;
        } else if (current > base) {
          this.marketPrices[cId] = Math.max(base, current - base * 0.005);
          pricesChanged = true;
        }
      }
      if (pricesChanged) this.dirty = true;
    } else if (changed) {
      this.dirty = true;
    }
  }

  private endByTimeout(): void {
    if (this.settings.mode === "2v2") {
      const bestCoins = Math.max(...this.teams.map((team) => team.coins));
      const winners = this.teams.filter((team) => team.coins === bestCoins);
      this.endMatchTeam(winners.length === 1 ? winners[0].id : undefined, "timeout");
      return;
    }
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
    if (this.settings.mode === "2v2") {
      const expiredTeams = new Set(expired.map((p) => p.teamId).filter(Boolean));
      for (const teamId of expiredTeams) {
        const teamPlayers = [...this.players.values()].filter((p) => p.teamId === teamId);
        if (teamPlayers.length && teamPlayers.every((p) => !p.connected)) {
          this.endMatchTeam(teamId === "A" ? "B" : "A", "forfeit");
          return true;
        }
      }
      return false;
    }
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

  private endMatchTeam(
    winnerTeamId: TeamId | undefined,
    reason: "race" | "timeout" | "forfeit" | "kick",
  ): void {
    if (this.status === "ended") return;
    this.winnerTeamId = winnerTeamId;
    this.endMatch(undefined, reason);
  }

  private endMatch(
    winnerId: string | undefined,
    reason: "race" | "timeout" | "forfeit" | "kick",
  ): void {
    if (this.status === "ended") return;
    this.status = "ended";
    this.winnerId = winnerId;
    if (this.settings.mode !== "2v2") this.winnerTeamId = undefined;
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
    this.clearBotTimer();
    for (const p of this.players.values()) p.ready = false;
    this.roomClosesAt = Date.now() + ROOM_CLOSE_MS;
    this.persist();
    this.broadcast({ t: "end", winnerId, reason });
    this.broadcastSnapshot();
    this.scheduleAlarm();
  }

  private closeRoom(): void {
    this.broadcast({ t: "room_closed" });
    for (const [id, player] of this.players) {
      if (player.connected) {
        for (const ws of this.ctx.getWebSockets()) {
          if (this.wsToPlayer.get(ws) === id) {
            try {
              ws.close(1000, "room closed");
            } catch {
              /* already closed */
            }
          }
        }
      }
      this.players.delete(id);
    }
    this.roomClosesAt = undefined;
    void this.ctx.storage.deleteAll();
  }

  private resetForRematch(): void {
    this.status = "lobby";
    this.winnerId = undefined;
    this.winnerTeamId = undefined;
    this.endedReason = undefined;
    this.recap = undefined;
    this.startedAt = undefined;
    this.endsAt = undefined;
    this.countdownEndsAt = undefined;
    this.banEndsAt = undefined;
    this.selectionEndsAt = undefined;
    this.banTurnPlayerId = undefined;
    this.roomClosesAt = undefined;
    this.marketPrices = makeMarketPrices();
    this.lastPriceUpdateAt = 0;
    this.fieldCargo = [];
    this.syncTeamsAndRoles(true);
    for (const p of this.players.values()) {
      p.ready = false;
      p.coins = 50;
      p.tiles = makeEmptyField();
      p.combo = 0;
      p.lastHarvestAt = 0;
      p.comboCrops = [];
      p.bannedCrop = undefined;
      p.selectedCrops = fillSelectedCrops();
      p.seedChoice = p.selectedCrops[0];
    }
    this.persist();
    this.maybeStartCountdown();
  }

  private bannedCropIds(): CropId[] {
    return effectiveBannedCrops([...this.players.values()]);
  }

  private publicState(): PublicMatchState {
    const players: PublicPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      teamId: p.teamId,
      role: p.role,
      carryingCargo: p.carryingCargo,
      cargoStack: p.cargoStack && p.cargoStack.length > 0 ? p.cargoStack : undefined,
      pos: p.pos,
      dir: p.dir,
      tool: p.tool,
      seedChoice: p.seedChoice,
      selectedCrops: p.selectedCrops,
      bannedCrop: p.bannedCrop,
      tiles: p.tiles,
      ready: p.ready,
      connected: p.connected,
      isBot: p.isBot,
      cosmetics: cosmeticsSchema.parse(p.cosmetics ?? DEFAULT_COSMETICS),
      stats: p.stats,
      inputDir: p.inputDir,
    }));
    return {
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      settings: this.settings,
      countdownEndsAt: this.countdownEndsAt,
      banEndsAt: this.banEndsAt,
      selectionEndsAt: this.selectionEndsAt,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      winnerId: this.winnerId,
      winnerTeamId: this.winnerTeamId,
      endedReason: this.endedReason,
      recap: this.recap,
      players,
      teams: this.settings.mode === "2v2" ? this.teams : undefined,
      fieldCargo: this.settings.mode === "2v2" ? this.fieldCargo : undefined,
      marketPrices: this.marketPrices,
      banTurnPlayerId: this.banTurnPlayerId,
      spectatorCount: this.spectatorCount(),
      roomClosesAt: this.roomClosesAt,
    };
  }

  private getFilteredState(
    role: MatchRole,
    playerId?: string,
    baseState: PublicMatchState = this.publicState(),
  ): PublicMatchState {
    if (role === "spectator") {
      return baseState;
    }
    return {
      ...baseState,
      players: baseState.players.map((p) => {
        if (p.id === playerId) return p;
        const opponent = { ...p };
        if (baseState.status === "crop_ban") {
          if (!opponent.ready) {
            opponent.bannedCrop = undefined;
          }
        } else if (baseState.status === "crop_selection") {
          opponent.selectedCrops = [];
          opponent.seedChoice = firstAllowedCrop(this.bannedCropIds());
        }
        return opponent;
      }),
    };
  }

  private broadcastSnapshot(): void {
    const baseState = this.publicState();
    const spectatorData = JSON.stringify({ t: "snapshot", state: baseState } satisfies ServerMsg);
    const playerSnapshots = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      const role = this.wsToRole.get(ws) ?? "player";
      const playerId = this.wsToPlayer.get(ws);
      if (role === "spectator") {
        this.sendSerializedTo(ws, spectatorData);
        continue;
      }
      const cacheKey = playerId ?? "";
      let data = playerSnapshots.get(cacheKey);
      if (!data) {
        const filteredState = this.getFilteredState(role, playerId, baseState);
        data = JSON.stringify({ t: "snapshot", state: filteredState } satisfies ServerMsg);
        playerSnapshots.set(cacheKey, data);
      }
      this.sendSerializedTo(ws, data);
    }
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

  private sendSerializedTo(ws: WebSocket, data: string): void {
    try {
      ws.send(data);
    } catch {
      /* noop */
    }
  }
}

interface BotPlan {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  dir: Direction;
  tool: Tool;
  seed: CropId;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickBotCrops(banned: readonly CropId[]): CropId[] {
  const allowed = (Object.keys(CROPS) as CropId[]).filter((id) => !banned.includes(id));
  // Medium skill: favour crops with the best coins-per-second efficiency.
  allowed.sort(
    (a, b) => CROPS[b].sellPrice / CROPS[b].growTime - CROPS[a].sellPrice / CROPS[a].growTime,
  );
  return allowed.slice(0, DEFAULT_SELECTED_CROPS.length);
}

function chooseBotSeed(selected: CropId[], coins: number, rotation: number): CropId | undefined {
  const n = selected.length;
  if (n === 0) return undefined;
  for (let i = 0; i < n; i++) {
    const c = selected[(rotation + i) % n];
    if (coins >= CROPS[c].seedCost) return c;
  }
  return undefined;
}

// What single action advances this tile, or null if it should be left alone.
function tileNeeds(
  tile: Tile,
  selected: CropId[],
  coins: number,
  rotation: number,
): { tool: Tool; seed?: CropId } | null {
  if (tile.crop) {
    if (tile.crop.stage >= 2) return { tool: "hoe" }; // harvest (tool ignored when ripe/withered)
    if (tile.type !== "watered") return { tool: "watering_can" }; // water growing crop
    return null; // growing on watered soil — wait
  }
  if (tile.type === "grass") return { tool: "hoe" }; // till
  const seed = chooseBotSeed(selected, coins, rotation); // tilled/watered empty → plant
  if (!seed) return null;
  return { tool: "seed", seed };
}

function tilePriority(tile: Tile, tool: Tool): number {
  if (tile.crop) {
    if (tile.crop.stage === 2) return 0; // ripe harvest = income now
    if (tile.crop.stage === 3) return 4; // withered = clear later
    return 1; // water growing crop
  }
  return tool === "hoe" ? 3 : 2; // till vs plant
}

function neighborStand(
  tx: number,
  ty: number,
  bot: { pos: { x: number; y: number } },
): { sx: number; sy: number; dir: Direction } {
  const cands = (
    [
      { sx: tx, sy: ty + 1, dir: "up" },
      { sx: tx, sy: ty - 1, dir: "down" },
      { sx: tx + 1, sy: ty, dir: "left" },
      { sx: tx - 1, sy: ty, dir: "right" },
    ] as { sx: number; sy: number; dir: Direction }[]
  ).filter((c) => c.sx >= 0 && c.sx < COLS && c.sy >= 0 && c.sy < ROWS);
  cands.sort(
    (a, b) =>
      Math.hypot(a.sx - bot.pos.x, a.sy - bot.pos.y) -
      Math.hypot(b.sx - bot.pos.x, b.sy - bot.pos.y),
  );
  return cands[0];
}

function chooseBotPlan(bot: {
  pos: { x: number; y: number };
  coins: number;
  selectedCrops: CropId[];
  botSeedRotation?: number;
  tiles: Tile[][];
}): BotPlan | null {
  const rotation = bot.botSeedRotation ?? 0;
  let best: { x: number; y: number; tool: Tool; seed?: CropId } | null = null;
  let bestPri = 99;
  let bestDist = Infinity;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = bot.tiles[y][x];
      const needs = tileNeeds(tile, bot.selectedCrops, bot.coins, rotation);
      if (!needs) continue;
      const pri = tilePriority(tile, needs.tool);
      const d = Math.hypot(x - bot.pos.x, y - bot.pos.y);
      if (pri < bestPri || (pri === bestPri && d < bestDist)) {
        best = { x, y, tool: needs.tool, seed: needs.seed };
        bestPri = pri;
        bestDist = d;
      }
    }
  }
  if (!best) return null;
  const stand = neighborStand(best.x, best.y, bot);
  return {
    tx: best.x,
    ty: best.y,
    sx: stand.sx,
    sy: stand.sy,
    dir: stand.dir,
    tool: best.tool,
    seed: best.seed ?? bot.selectedCrops[0],
  };
}

function isPlanValid(
  bot: { coins: number; selectedCrops: CropId[]; botSeedRotation?: number; tiles: Tile[][] },
  plan: BotPlan,
): boolean {
  const tile = bot.tiles[plan.ty]?.[plan.tx];
  if (!tile) return false;
  const needs = tileNeeds(tile, bot.selectedCrops, bot.coins, bot.botSeedRotation ?? 0);
  return Boolean(needs) && needs!.tool === plan.tool;
}

function emptyStats(): PublicPlayerStats {
  return {
    harvests: 0,
    coinsEarned: 0,
    cropHarvests: Object.fromEntries(
      (Object.keys(CROPS) as CropId[]).map((id) => [id, 0]),
    ) as Record<CropId, number>,
  };
}

function topCrop(crops: Record<CropId, number>): CropId | undefined {
  let best: CropId | undefined;
  for (const id of Object.keys(crops) as CropId[]) {
    if (!best || crops[id] > crops[best]) best = id;
  }
  return best && crops[best] > 0 ? best : undefined;
}

function normalizeStats(raw?: Partial<PublicPlayerStats>): PublicPlayerStats {
  const stats = emptyStats();
  if (!raw) return stats;
  if (typeof raw.harvests === "number" && Number.isFinite(raw.harvests)) {
    stats.harvests = raw.harvests;
  }
  if (typeof raw.coinsEarned === "number" && Number.isFinite(raw.coinsEarned)) {
    stats.coinsEarned = raw.coinsEarned;
  }
  for (const id of Object.keys(stats.cropHarvests) as CropId[]) {
    const count = raw.cropHarvests?.[id];
    if (typeof count === "number" && Number.isFinite(count)) stats.cropHarvests[id] = count;
  }
  return stats;
}

function makeMarketPrices(): Record<CropId, number> {
  return Object.fromEntries(
    (Object.keys(CROPS) as CropId[]).map((id) => [id, CROPS[id].sellPrice]),
  ) as Record<CropId, number>;
}

function normalizeMarketPrices(raw?: Partial<Record<CropId, number>>): Record<CropId, number> {
  const fallback = makeMarketPrices();
  if (!raw) return fallback;
  for (const id of Object.keys(fallback) as CropId[]) {
    const price = raw[id];
    if (typeof price === "number" && Number.isFinite(price)) fallback[id] = price;
  }
  return fallback;
}

function normalizeTeams(raw?: MatchTeam[]): MatchTeam[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((team) => (team.id === "A" || team.id === "B") && Number.isFinite(team.coins))
    .map((team) => ({
      id: team.id,
      name: team.name || `Team ${team.id}`,
      playerIds: Array.isArray(team.playerIds) ? team.playerIds.filter(Boolean) : [],
      coins: team.coins,
    }));
}

function normalizeCargo(raw?: Cargo[]): Cargo[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (cargo) =>
      cargo &&
      isCropId(cargo.cropId) &&
      (cargo.teamId === "A" || cargo.teamId === "B") &&
      typeof cargo.id === "string" &&
      typeof cargo.ownerPlayerId === "string" &&
      typeof cargo.baseReward === "number" &&
      Number.isFinite(cargo.baseReward) &&
      typeof cargo.createdAt === "number" &&
      Number.isFinite(cargo.createdAt) &&
      typeof cargo.position?.x === "number" &&
      typeof cargo.position?.y === "number",
  );
}

function isCropId(id: unknown): id is CropId {
  return typeof id === "string" && id in CROPS;
}

function playerCargoStack(player: PlayerState): Cargo[] {
  if (!player.cargoStack || player.cargoStack.length === 0) {
    if (player.carryingCargo) {
      player.cargoStack = [player.carryingCargo];
      player.carryingCargo = undefined;
    } else {
      player.cargoStack = [];
    }
  }
  return player.cargoStack;
}

function playerCargoCount(player: PlayerState): number {
  return playerCargoStack(player).length;
}

function clearPlayerCargo(player: PlayerState): void {
  player.carryingCargo = undefined;
  player.cargoStack = [];
}

function effectiveBannedCrops(players: Array<{ bannedCrop?: CropId }>): CropId[] {
  const banned: CropId[] = [];
  for (const player of players) {
    if (isCropId(player.bannedCrop) && !banned.includes(player.bannedCrop)) {
      banned.push(player.bannedCrop);
    }
  }
  return banned;
}

function normalizeSelectedCrops(raw?: readonly CropId[], banned: readonly CropId[] = []): CropId[] {
  const selected: CropId[] = [];
  for (const id of raw ?? []) {
    if (id in CROPS && !banned.includes(id) && !selected.includes(id)) selected.push(id);
    if (selected.length === DEFAULT_SELECTED_CROPS.length) break;
  }
  return selected;
}

function fillSelectedCrops(raw?: readonly CropId[], banned: readonly CropId[] = []): CropId[] {
  const selected = normalizeSelectedCrops(raw, banned);
  const allowed = (Object.keys(CROPS) as CropId[]).filter((id) => !banned.includes(id));
  const shuffled = allowed
    .map((id) => ({ id, rank: crypto.getRandomValues(new Uint32Array(1))[0] }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.id);
  for (const id of shuffled) {
    if (!selected.includes(id)) selected.push(id);
    if (selected.length === DEFAULT_SELECTED_CROPS.length) return selected;
  }
  return selected;
}

function firstAllowedCrop(banned: readonly CropId[] = []): CropId {
  return (
    (Object.keys(CROPS) as CropId[]).find((id) => !banned.includes(id)) ?? DEFAULT_SELECTED_CROPS[0]
  );
}

function isSelectedCrop(id: CropId, selected?: CropId[]): boolean {
  return normalizeSelectedCrops(selected).includes(id);
}

function isPreGamePhase(status: PublicMatchState["status"]): boolean {
  return (
    status === "countdown" ||
    status === "crop_ban" ||
    status === "crop_selection" ||
    status === "prepare_countdown"
  );
}

function isMatchActiveOrStarting(status: PublicMatchState["status"]): boolean {
  return isPreGamePhase(status) || status === "playing";
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
