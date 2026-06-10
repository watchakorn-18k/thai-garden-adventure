import {
  makeRoomCode,
  ROOM_CODE_RE,
  type LobbyRoomSummary,
  type MatchModeSetting,
  type MatchStatus,
  type RoomStage,
} from "../../../src/lib/match-protocol";

interface PendingState {
  code: string;
  createdAt: number;
}

interface JoinableState {
  joinable: boolean;
  status: MatchStatus;
  players: number;
  maxPlayers: number;
  mode: MatchModeSetting;
  stage: RoomStage;
}

interface MatchmakerEnv {
  MATCH_ROOM: DurableObjectNamespace;
}

// A pending room older than this is treated as abandoned (first player gave up),
// so the next quick-match request opens a fresh room instead of pairing into it.
const PENDING_TTL_MS = 60_000;
const ROOM_LIST_TTL_MS = 90_000;
const ROOM_LIST_LIMIT = 20;

// Singleton DO that pairs quick-match requests into a shared room and keeps a
// small registry of open rooms for the lobby board.
export class Matchmaker implements DurableObject {
  private pending?: PendingState;
  private rooms: Record<string, LobbyRoomSummary> = {};
  private loaded?: Promise<void>;

  constructor(
    private ctx: DurableObjectState,
    private env: MatchmakerEnv,
  ) {}

  private async ensureLoaded(): Promise<void> {
    this.loaded ??= Promise.all([
      this.ctx.storage.get<PendingState>("pending"),
      this.ctx.storage.get<Record<string, LobbyRoomSummary>>("rooms"),
    ]).then(([pending, rooms]) => {
      this.pending = pending ?? undefined;
      this.rooms = rooms ?? {};
    });
    await this.loaded;
  }

  private async roomJoinableState(code: string): Promise<JoinableState | undefined> {
    try {
      const id = this.env.MATCH_ROOM.idFromName(code);
      const stub = this.env.MATCH_ROOM.get(id);
      const res = await stub.fetch("https://room/joinable");
      if (!res.ok) return undefined;
      const data = (await res.json()) as Partial<JoinableState>;
      if (typeof data.joinable !== "boolean") return undefined;
      if (!isMatchStatus(data.status)) return undefined;
      const players = data.players;
      const maxPlayers = data.maxPlayers;
      if (typeof players !== "number" || typeof maxPlayers !== "number") return undefined;
      if (!Number.isFinite(players) || !Number.isFinite(maxPlayers)) return undefined;
      if (data.mode !== "1v1" && data.mode !== "2v2") return undefined;
      if (!isRoomStage(data.stage)) return undefined;
      return {
        joinable: data.joinable,
        status: data.status,
        players: Math.max(0, Math.floor(players)),
        maxPlayers: Math.max(0, Math.floor(maxPlayers)),
        mode: data.mode,
        stage: data.stage,
      };
    } catch {
      return undefined;
    }
  }

  // Ask the real room whether a quick-match player can still join it.
  private async isRoomJoinable(code: string): Promise<boolean> {
    const state = await this.roomJoinableState(code);
    return state?.joinable === true;
  }

  private async clearPending(): Promise<void> {
    this.pending = undefined;
    await this.ctx.storage.delete("pending");
  }

  private async openFreshRoom(now: number): Promise<string> {
    const code = makeRoomCode();
    this.pending = { code, createdAt: now };
    await this.ctx.storage.put("pending", this.pending);
    return code;
  }

  private async persistRooms(): Promise<void> {
    await this.ctx.storage.put("rooms", this.rooms);
  }

  private async upsertRoom(request: Request): Promise<Response> {
    let summary: LobbyRoomSummary;
    try {
      summary = (await request.json()) as LobbyRoomSummary;
    } catch {
      return new Response("bad json", { status: 400 });
    }
    if (!isLobbyRoomSummary(summary)) return new Response("bad room", { status: 400 });
    if (summary.joinable && summary.players > 0) {
      this.rooms[summary.code] = summary;
    } else {
      delete this.rooms[summary.code];
    }
    await this.persistRooms();
    return Response.json({ ok: true });
  }

  private async listRooms(): Promise<Response> {
    const now = Date.now();
    const entries = Object.values(this.rooms).filter(
      (room) => now - room.updatedAt <= ROOM_LIST_TTL_MS,
    );
    const fresh: Record<string, LobbyRoomSummary> = {};
    const rooms: LobbyRoomSummary[] = [];

    for (const room of entries) {
      const live = await this.roomJoinableState(room.code);
      if (!live?.joinable || live.players <= 0) continue;
      const summary = { ...room, ...live, updatedAt: now };
      fresh[summary.code] = summary;
      rooms.push(summary);
    }

    this.rooms = fresh;
    await this.persistRooms();

    rooms.sort((a, b) => {
      const aFill = a.maxPlayers > 0 ? a.players / a.maxPlayers : 0;
      const bFill = b.maxPlayers > 0 ? b.players / b.maxPlayers : 0;
      return bFill - aFill || b.updatedAt - a.updatedAt;
    });

    return Response.json({ rooms: rooms.slice(0, ROOM_LIST_LIMIT) });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);

    if (url.pathname === "/rooms" && request.method === "GET") return this.listRooms();
    if (url.pathname === "/rooms/upsert" && request.method === "POST")
      return this.upsertRoom(request);
    if (url.pathname !== "/pair" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    const now = Date.now();

    // Reuse the waiting room only if it is recent AND the room itself confirms
    // an open slot. Either check failing means we open a fresh room instead.
    if (this.pending && now - this.pending.createdAt < PENDING_TTL_MS) {
      const code = this.pending.code;
      if (await this.isRoomJoinable(code)) {
        await this.clearPending();
        return Response.json({ code });
      }
      await this.clearPending();
    }

    const code = await this.openFreshRoom(now);
    return Response.json({ code });
  }
}

function isMatchStatus(status: unknown): status is MatchStatus {
  return (
    status === "lobby" ||
    status === "countdown" ||
    status === "crop_ban" ||
    status === "crop_selection" ||
    status === "prepare_countdown" ||
    status === "playing" ||
    status === "ended"
  );
}

function isRoomStage(stage: unknown): stage is RoomStage {
  return stage === "classic" || stage === "water" || stage === "festival";
}

function isLobbyRoomSummary(summary: Partial<LobbyRoomSummary>): summary is LobbyRoomSummary {
  return (
    ROOM_CODE_RE.test(summary.code ?? "") &&
    isMatchStatus(summary.status) &&
    typeof summary.players === "number" &&
    Number.isFinite(summary.players) &&
    typeof summary.maxPlayers === "number" &&
    Number.isFinite(summary.maxPlayers) &&
    (summary.mode === "1v1" || summary.mode === "2v2") &&
    isRoomStage(summary.stage) &&
    typeof summary.joinable === "boolean" &&
    typeof summary.updatedAt === "number" &&
    Number.isFinite(summary.updatedAt)
  );
}
