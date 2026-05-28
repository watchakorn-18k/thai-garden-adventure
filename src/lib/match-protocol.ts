import { z } from "zod";
import type { CropId, Direction, Tile, Tool } from "./game-types";

export const ROOM_CODE_LEN = 6;
export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

export const TARGET_COINS = 500;
export const MATCH_DURATION_MS = 5 * 60 * 1000;
export const COUNTDOWN_MS = 3000;

const directionSchema = z.enum(["up", "down", "left", "right"]);
const toolSchema = z.enum(["hoe", "watering_can", "seed"]);
const cropIdSchema = z.enum(["chili", "rice", "morning_glory", "eggplant"]);

export const clientMsg = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("join"),
    code: z.string().regex(ROOM_CODE_RE),
    name: z.string().min(1).max(16),
    sessionId: z.string().optional(),
  }),
  z.object({ t: z.literal("ready") }),
  z.object({ t: z.literal("move"), dir: directionSchema }),
  z.object({ t: z.literal("action") }),
  z.object({ t: z.literal("tool"), tool: toolSchema }),
  z.object({ t: z.literal("seed"), id: cropIdSchema }),
  z.object({ t: z.literal("rematch") }),
]);
export type ClientMsg = z.infer<typeof clientMsg>;

export type MatchStatus = "lobby" | "countdown" | "playing" | "ended";

export interface PublicPlayer {
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
}

export interface PublicMatchState {
  code: string;
  status: MatchStatus;
  countdownEndsAt?: number;
  startedAt?: number;
  endsAt?: number;
  winnerId?: string;
  endedReason?: "race" | "timeout" | "forfeit";
  players: PublicPlayer[];
}

export type ServerEvent =
  | { kind: "till"; playerId: string; x: number; y: number }
  | { kind: "water"; playerId: string; x: number; y: number }
  | { kind: "plant"; playerId: string; x: number; y: number; cropId: CropId }
  | { kind: "harvest"; playerId: string; x: number; y: number; cropId: CropId; reward: number }
  | { kind: "insufficient_funds"; playerId: string; x: number; y: number };

export type ServerMsg =
  | { t: "welcome"; playerId: string; sessionId: string; state: PublicMatchState }
  | { t: "snapshot"; state: PublicMatchState }
  | { t: "events"; events: ServerEvent[] }
  | { t: "end"; winnerId?: string; reason: "race" | "timeout" | "forfeit" }
  | { t: "error"; code: string; message: string };

export function makeRoomCode(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ROOM_CODE_LEN; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
