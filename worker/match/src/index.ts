import { Redis } from "@upstash/redis/cloudflare";
import { MatchRoom } from "./match-do";
import { Matchmaker } from "./matchmaker-do";
import { ROOM_CODE_RE } from "../../../src/lib/match-protocol";

export { MatchRoom, Matchmaker };

export interface Env {
  MATCH_ROOM: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

interface ScoreboardEntry {
  userId?: string;
  playerId: string;
  name: string;
  coins: number;
  score: number;
  mode: "1v1" | "2v2";
  teamId?: string;
  role?: string;
  rankScore: number;
  matchCode: string;
  endedAt: number;
  durationMs: number;
  timeRemainingMs: number;
  endedReason?: string;
  winner: boolean;
}

function redisFromEnv(env: Env): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

async function fetchScoreboard(url: URL, env: Env): Promise<Response> {
  const mode = url.searchParams.get("mode") === "2v2" ? "2v2" : "1v1";
  const limitParam = Number(url.searchParams.get("limit") ?? 10);
  const limit = Math.max(
    1,
    Math.min(50, Number.isFinite(limitParam) ? Math.floor(limitParam) : 10),
  );
  const redis = redisFromEnv(env);
  if (!redis) return Response.json({ entries: [] }, { headers: CORS });

  try {
    const ids = await redis.zrange<string[]>(`tg:scoreboard:${mode}`, 0, limit - 1, { rev: true });
    const rawEntries = await Promise.all(
      ids.map((id) => redis.get<ScoreboardEntry>(`tg:scoreboard:${id}`)),
    );
    const entries = rawEntries
      .map((entry, idx) => (entry ? { rank: idx + 1, ...entry } : null))
      .filter((entry): entry is ScoreboardEntry & { rank: number } => Boolean(entry));
    return Response.json(
      { entries },
      { headers: { ...CORS, "cache-control": "public, max-age=10" } },
    );
  } catch (err) {
    console.error("scoreboard read failed", err);
    return Response.json({ entries: [] }, { status: 500, headers: CORS });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/room\/([A-Z0-9]{6})\/ws$/);
    if (m) {
      const code = m[1];
      if (!ROOM_CODE_RE.test(code)) return new Response("bad code", { status: 400, headers: CORS });
      const id = env.MATCH_ROOM.idFromName(code);
      const stub = env.MATCH_ROOM.get(id);
      const forward = new Request(`https://room/ws?code=${code}`, request);
      return stub.fetch(forward);
    }

    if (url.pathname === "/matchmake" && request.method === "POST") {
      const id = env.MATCHMAKER.idFromName("global");
      const stub = env.MATCHMAKER.get(id);
      const res = await stub.fetch("https://matchmaker/pair", { method: "POST" });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }

    if (url.pathname === "/rooms" && request.method === "GET") {
      const id = env.MATCHMAKER.idFromName("global");
      const stub = env.MATCHMAKER.get(id);
      const res = await stub.fetch("https://matchmaker/rooms");
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }

    if (url.pathname === "/scoreboard" && request.method === "GET") {
      return fetchScoreboard(url, env);
    }

    if (url.pathname === "/health") {
      return new Response("ok", { headers: CORS });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
