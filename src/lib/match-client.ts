import { useEffect, useRef, useState } from "react";
import type { ClientMsg, PublicMatchState, ServerEvent, ServerMsg } from "./match-protocol";

export type ConnStatus = "connecting" | "open" | "closed";

interface MatchError {
  code: string;
  message: string;
}

interface UseMatchOpts {
  code: string;
  name: string;
  enabled?: boolean;
  onEvents?: (events: ServerEvent[]) => void;
  onEnd?: (winnerId: string | undefined, reason: string) => void;
}

const RECONNECT_DELAYS = [400, 800, 1600, 3200, 5000];

function wsBaseUrl(): string {
  const env = import.meta.env.VITE_MATCH_WS_URL as string | undefined;
  if (env) return env.replace(/\/$/, "");
  if (typeof window === "undefined") return "ws://localhost:8787";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:8787`;
}

function sessionKey(code: string): string {
  return `tg.match.${code}.sessionId`;
}

function readSessionId(code: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(sessionKey(code)) ?? undefined;
}

function writeSessionId(code: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(sessionKey(code), sessionId);
}

export function useMatch({ code, name, enabled = true, onEvents, onEnd }: UseMatchOpts) {
  const [state, setState] = useState<PublicMatchState | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnStatus>("closed");
  const [lastError, setLastError] = useState<MatchError | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const sentJoinRef = useRef(false);
  const onEventsRef = useRef(onEvents);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onEventsRef.current = onEvents;
    onEndRef.current = onEnd;
  }, [onEvents, onEnd]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
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
        const msg: ClientMsg = { t: "join", code, name };
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
          setSelfId(parsed.playerId);
          setState(parsed.state);
        } else if (parsed.t === "snapshot") {
          setState(parsed.state);
        } else if (parsed.t === "events") {
          onEventsRef.current?.(parsed.events);
        } else if (parsed.t === "end") {
          onEndRef.current?.(parsed.winnerId, parsed.reason);
        }
      });

      ws.addEventListener("close", () => {
        if (cancelled) return;
        setStatus("closed");
        wsRef.current = null;
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

    connect();
    return () => {
      cancelled = true;
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
  }, [code, name, enabled]);

  const send = (msg: ClientMsg) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* noop */
    }
  };

  return { state, selfId, status, send };
}
