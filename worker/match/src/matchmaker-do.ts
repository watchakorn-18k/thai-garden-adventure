import { makeRoomCode } from "../../../src/lib/match-protocol";

interface PendingState {
  code: string;
  createdAt: number;
}

interface MatchmakerEnv {
  MATCH_ROOM: DurableObjectNamespace;
}

// A pending room older than this is treated as abandoned (first player gave up),
// so the next quick-match request opens a fresh room instead of pairing into it.
const PENDING_TTL_MS = 60_000;

// Singleton DO that pairs quick-match requests into a shared room. It only hands
// out a waiting room after confirming with the real MatchRoom that the room is
// still joinable (in lobby, with an open slot); otherwise it opens a fresh room.
export class Matchmaker implements DurableObject {
  private pending?: PendingState;
  private loaded?: Promise<void>;

  constructor(
    private ctx: DurableObjectState,
    private env: MatchmakerEnv,
  ) {}

  private async ensureLoaded(): Promise<void> {
    this.loaded ??= this.ctx.storage.get<PendingState>("pending").then((p) => {
      this.pending = p ?? undefined;
    });
    await this.loaded;
  }

  // Ask the real room whether a quick-match player can still join it.
  private async isRoomJoinable(code: string): Promise<boolean> {
    try {
      const id = this.env.MATCH_ROOM.idFromName(code);
      const stub = this.env.MATCH_ROOM.get(id);
      const res = await stub.fetch("https://room/joinable");
      if (!res.ok) return false;
      const data = (await res.json()) as { joinable?: boolean };
      return data.joinable === true;
    } catch {
      return false;
    }
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

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);
    if (url.pathname !== "/pair") return new Response("Not found", { status: 404 });

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
