import { MatchRoom } from "./match-do";
import { Matchmaker } from "./matchmaker-do";
import { ROOM_CODE_RE } from "../../../src/lib/match-protocol";

export { MatchRoom, Matchmaker };

interface Env {
  MATCH_ROOM: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

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

    if (url.pathname === "/health") {
      return new Response("ok", { headers: CORS });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
