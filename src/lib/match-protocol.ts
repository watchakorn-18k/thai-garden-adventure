import { z } from "zod";
import type { CropId, Direction, Tile, Tool } from "./game-types";
import { DEFAULT_COSMETICS, type PlayerCosmetics } from "./player-cosmetics";

export const ROOM_CODE_LEN = 6;
export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

export const TARGET_COINS = 500;
export const MATCH_DURATION_MS = 5 * 60 * 1000;
export const COUNTDOWN_MS = 3000;

export const ROOM_SETTING_LIMITS = {
  targetCoins: { min: 200, max: 1500 },
  durationMs: { min: 2 * 60 * 1000, max: 10 * 60 * 1000 },
  maxPlayers: { min: 2, max: 2 },
} as const;

const directionSchema = z.enum(["up", "down", "left", "right"]);
const toolSchema = z.enum(["hoe", "watering_can", "seed"]);
const cropIdSchema = z.enum(["chili", "rice", "morning_glory", "eggplant"]);
const matchRoleSchema = z.enum(["player", "spectator"]);
const roomStageSchema = z.enum(["classic", "water", "festival"]);
export const roomSettingsSchema = z.object({
  stage: roomStageSchema,
  targetCoins: z
    .number()
    .int()
    .min(ROOM_SETTING_LIMITS.targetCoins.min)
    .max(ROOM_SETTING_LIMITS.targetCoins.max),
  durationMs: z
    .number()
    .int()
    .min(ROOM_SETTING_LIMITS.durationMs.min)
    .max(ROOM_SETTING_LIMITS.durationMs.max),
  maxPlayers: z
    .number()
    .int()
    .min(ROOM_SETTING_LIMITS.maxPlayers.min)
    .max(ROOM_SETTING_LIMITS.maxPlayers.max),
});
export type RoomStage = z.infer<typeof roomStageSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export const DEFAULT_ROOM_SETTINGS = {
  stage: "classic",
  targetCoins: TARGET_COINS,
  durationMs: MATCH_DURATION_MS,
  maxPlayers: 2,
} satisfies RoomSettings;
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const cosmeticsSchema = z.object({
  hat: hexColorSchema.default(DEFAULT_COSMETICS.hat),
  shirt: hexColorSchema.default(DEFAULT_COSMETICS.shirt),
  pants: hexColorSchema.default(DEFAULT_COSMETICS.pants),
});

export type MatchRole = z.infer<typeof matchRoleSchema>;

export const clientMsg = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("join"),
    code: z.string().regex(ROOM_CODE_RE),
    name: z.string().min(1).max(16),
    sessionId: z.string().optional(),
    role: matchRoleSchema.optional(),
    cosmetics: cosmeticsSchema.optional(),
  }),
  z.object({ t: z.literal("ready") }),
  z.object({ t: z.literal("move"), dir: directionSchema }),
  z.object({ t: z.literal("action") }),
  z.object({ t: z.literal("tool"), tool: toolSchema }),
  z.object({ t: z.literal("seed"), id: cropIdSchema }),
  z.object({ t: z.literal("cosmetics"), cosmetics: cosmeticsSchema }),
  z.object({ t: z.literal("claim_slot") }),
  z.object({ t: z.literal("leave_slot") }),
  z.object({ t: z.literal("settings"), settings: roomSettingsSchema }),
  z.object({ t: z.literal("kick"), playerId: z.string().min(1) }),
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
  cosmetics: PlayerCosmetics;
}

export interface PublicMatchState {
  code: string;
  status: MatchStatus;
  hostId?: string;
  settings: RoomSettings;
  countdownEndsAt?: number;
  startedAt?: number;
  endsAt?: number;
  winnerId?: string;
  endedReason?: "race" | "timeout" | "forfeit" | "kick";
  players: PublicPlayer[];
}

export type ServerEvent =
  | { kind: "till"; playerId: string; x: number; y: number }
  | { kind: "water"; playerId: string; x: number; y: number }
  | { kind: "plant"; playerId: string; x: number; y: number; cropId: CropId }
  | { kind: "harvest"; playerId: string; x: number; y: number; cropId: CropId; reward: number }
  | { kind: "insufficient_funds"; playerId: string; x: number; y: number };

export type ServerMsg =
  | {
      t: "welcome";
      playerId: string;
      sessionId: string;
      role: MatchRole;
      host: boolean;
      state: PublicMatchState;
    }
  | { t: "snapshot"; state: PublicMatchState }
  | { t: "events"; events: ServerEvent[] }
  | { t: "end"; winnerId?: string; reason: "race" | "timeout" | "forfeit" | "kick" }
  | { t: "error"; code: string; message: string };

export function makeRoomCode(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ROOM_CODE_LEN; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
