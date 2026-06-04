import { useEffect, useRef, useState } from "react";
import type {
  ClientMsg,
  MatchRole,
  PublicMatchState,
  ServerEvent,
  ServerMsg,
} from "./match-protocol";
import type { PlayerCosmetics } from "./player-cosmetics";

export type ConnStatus = "connecting" | "open" | "closed";

interface MatchError {
  code: string;
  message: string;
}

interface UseMatchOpts {
  code: string;
  name: string;
  enabled?: boolean;
  role?: MatchRole;
  cosmetics?: PlayerCosmetics;
  onEvents?: (events: ServerEvent[]) => void;
  onEnd?: (winnerId: string | undefined, reason: string) => void;
}

const RECONNECT_DELAYS = [400, 800, 1600, 3200, 5000];

function wsBaseUrl(): string {
  if (typeof window === "undefined") return "ws://127.0.0.1:8787";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const isLocal =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocal) return "ws://127.0.0.1:8787";
  return `${proto}//${window.location.host}`;
}

function sessionKey(code: string): string {
  return `tg.match.${code}.sessionId`;
}

function readSessionId(code: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return sessionStorage.getItem(sessionKey(code)) ?? undefined;
}

function writeSessionId(code: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(sessionKey(code), sessionId);
}

function clearSessionId(code: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(sessionKey(code));
}

export function useMatch({
  code,
  name,
  enabled = true,
  role = "player",
  cosmetics,
  onEvents,
  onEnd,
}: UseMatchOpts) {
  const [state, setState] = useState<PublicMatchState | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [matchRole, setMatchRole] = useState<MatchRole>(role);
  const [status, setStatus] = useState<ConnStatus>("closed");
  const [lastError, setLastError] = useState<MatchError | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const sentJoinRef = useRef(false);
  const onEventsRef = useRef(onEvents);
  const onEndRef = useRef(onEnd);
  const cosmeticsRef = useRef(cosmetics);

  useEffect(() => {
    onEventsRef.current = onEvents;
    onEndRef.current = onEnd;
    cosmeticsRef.current = cosmetics;
  }, [onEvents, onEnd, cosmetics]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let blockedReconnect = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const url = `${wsBaseUrl()}/room/${code}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      sentJoinRef.current = false;

      ws.addEventListener("open", () => {
        if (cancelled) return;
        attemptRef.current = 0;
        setStatus("open");
        const msg: ClientMsg = {
          t: "join",
          code,
          name,
          role,
          cosmetics: cosmeticsRef.current,
          sessionId: readSessionId(code),
        };
        ws.send(JSON.stringify(msg));
        sentJoinRef.current = true;
      });

      ws.addEventListener("message", (e) => {
        if (typeof e.data !== "string") return;
        let parsed: ServerMsg;
        try {
          parsed = JSON.parse(e.data) as ServerMsg;
        } catch {
          return;
        }
        if (parsed.t === "welcome") {
          writeSessionId(code, parsed.sessionId);
          setLastError(null);
          setSelfId(parsed.playerId);
          setSessionId(parsed.sessionId);
          setIsHost(parsed.host);
          setMatchRole(parsed.role);
          setState(parsed.state);
        } else if (parsed.t === "snapshot") {
          setState(parsed.state);
        } else if (parsed.t === "events") {
          onEventsRef.current?.(parsed.events);
        } else if (parsed.t === "end") {
          onEndRef.current?.(parsed.winnerId, parsed.reason);
        } else if (parsed.t === "error") {
          setLastError({ code: parsed.code, message: parsed.message });
          if (parsed.code === "kicked") {
            blockedReconnect = true;
            clearSessionId(code);
            try {
              ws.close(1000, "kicked");
            } catch {
              /* noop */
            }
          }
        }
      });

      ws.addEventListener("close", () => {
        if (cancelled) return;
        setStatus("closed");
        wsRef.current = null;
        if (blockedReconnect) return;
        const delay = RECONNECT_DELAYS[Math.min(attemptRef.current, RECONNECT_DELAYS.length - 1)];
        attemptRef.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      });

      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      });
    };

    const connectTimer = setTimeout(connect, 0);
    return () => {
      cancelled = true;
      clearTimeout(connectTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws)
        try {
          ws.close();
        } catch {
          /* noop */
        }
    };
  }, [code, name, enabled, role]);

  const send = (msg: ClientMsg) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* noop */
    }
  };

  return { state, selfId, sessionId, isHost, role: matchRole, status, lastError, send };
}
