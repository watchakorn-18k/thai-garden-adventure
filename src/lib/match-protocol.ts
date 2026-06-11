import { z } from "zod";
import type {
  Cargo,
  CropId,
  Direction,
  MarketOrder,
  MatchMode,
  MatchTeam,
  PlayerRole,
  SellerPuzzleChoice,
  TeamId,
  Tile,
  Tool,
} from "./game-types";
import { DEFAULT_COSMETICS, type PlayerCosmetics } from "./player-cosmetics";
import type { ProgressAward } from "./progression";

export const ROOM_CODE_LEN = 6;
export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

export const TARGET_COINS = 500;
export const TWO_V_TWO_TARGET_COINS = 800;
export const MATCH_DURATION_MS = 5 * 60 * 1000;
export const COUNTDOWN_MS = 3000;
export const CROP_BAN_MS = 30 * 1000;
export const CROP_SELECTION_MS = 90 * 1000;
export const SELECTED_CROP_COUNT = 4;
export const DEFAULT_SELECTED_CROPS = [
  "chili",
  "rice",
  "morning_glory",
  "eggplant",
] as const satisfies readonly CropId[];

export const ROOM_SETTING_LIMITS = {
  targetCoins: { min: 200, max: 10000 },
  durationMs: { min: 2 * 60 * 1000, max: 10 * 60 * 1000 },
  maxPlayers: { min: 2, max: 4 },
} as const;

const directionSchema = z.enum(["up", "down", "left", "right"]);
const toolSchema = z.enum(["hoe", "watering_can", "seed"]);
const cropIdSchema = z.enum([
  "chili",
  "rice",
  "morning_glory",
  "eggplant",
  "mango",
  "lemongrass",
  "papaya",
  "basil",
]);
const matchRoleSchema = z.enum(["player", "spectator"]);
const playerRoleSchema = z.enum(["farmer", "seller"]);
const teamIdSchema = z.enum(["A", "B"]);
const sellerPuzzleChoiceSchema = cropIdSchema;
const matchModeSchema = z.enum(["1v1", "2v2"]);
const roomStageSchema = z.enum(["classic", "water", "festival"]);
export const roomSettingsSchema = z.object({
  mode: matchModeSchema.default("1v1"),
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
export type MatchModeSetting = z.infer<typeof matchModeSchema>;
export type RoomStage = z.infer<typeof roomStageSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export const DEFAULT_ROOM_SETTINGS = {
  mode: "1v1",
  stage: "classic",
  targetCoins: TARGET_COINS,
  durationMs: MATCH_DURATION_MS,
  maxPlayers: 2,
} satisfies RoomSettings;
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const hatShapeSchema = z.enum(["straw", "wide", "crown", "leaf", "halo"]);
const shirtStyleSchema = z.enum(["plain", "overalls", "sash", "jacket", "champion"]);
const auraEffectSchema = z.enum(["none", "gold", "spark", "rainbow"]);
const toolSkinSchema = z.enum(["basic", "golden", "aqua", "starlight"]);
const shoeTrailSchema = z.enum(["none", "fire", "lightning"]);
export const cosmeticsSchema = z.object({
  hat: hexColorSchema.default(DEFAULT_COSMETICS.hat),
  shirt: hexColorSchema.default(DEFAULT_COSMETICS.shirt),
  pants: hexColorSchema.default(DEFAULT_COSMETICS.pants),
  shoe: hexColorSchema.default(DEFAULT_COSMETICS.shoe),
  hatShape: hatShapeSchema.default(DEFAULT_COSMETICS.hatShape),
  shirtStyle: shirtStyleSchema.default(DEFAULT_COSMETICS.shirtStyle),
  aura: auraEffectSchema.default(DEFAULT_COSMETICS.aura),
  shoeTrail: shoeTrailSchema.default(DEFAULT_COSMETICS.shoeTrail),
  hoeSkin: toolSkinSchema.default(DEFAULT_COSMETICS.hoeSkin),
  wateringCanSkin: toolSkinSchema.default(DEFAULT_COSMETICS.wateringCanSkin),
  basketSkin: toolSkinSchema.default(DEFAULT_COSMETICS.basketSkin),
});

export type MatchRole = z.infer<typeof matchRoleSchema>;

export const clientMsg = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("join"),
    code: z.string().regex(ROOM_CODE_RE),
    name: z.string().min(1).max(16),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    level: z.number().int().min(1).max(999).optional(),
    role: matchRoleSchema.optional(),
    cosmetics: cosmeticsSchema.optional(),
  }),
  z.object({ t: z.literal("ready") }),
  z.object({
    t: z.literal("move"),
    dir: directionSchema,
    pos: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  z.object({ t: z.literal("move_stop") }),
  z.object({
    t: z.literal("action"),
    pos: z.object({ x: z.number(), y: z.number() }).optional(),
    dir: directionSchema.optional(),
  }),
  z.object({
    t: z.literal("pick_up"),
    pos: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  z.object({
    t: z.literal("sell_cargo"),
    pos: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  z.object({
    t: z.literal("seller_puzzle_sell"),
    choice: sellerPuzzleChoiceSchema,
    pos: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  z.object({
    t: z.literal("seller_clear_bug"),
    x: z.number().int(),
    y: z.number().int(),
  }),
  z.object({ t: z.literal("swap_role"), targetTeammateId: z.string().min(1) }),
  z.object({ t: z.literal("tool"), tool: toolSchema }),
  z.object({ t: z.literal("seed"), id: cropIdSchema }),
  z.object({ t: z.literal("ban_crop"), id: cropIdSchema }),
  z.object({
    t: z.literal("select_crops"),
    ids: z.array(cropIdSchema).max(SELECTED_CROP_COUNT),
  }),
  z.object({ t: z.literal("cosmetics"), cosmetics: cosmeticsSchema }),
  z.object({ t: z.literal("claim_slot") }),
  z.object({ t: z.literal("leave_slot") }),
  z.object({ t: z.literal("choose_team_role"), teamId: teamIdSchema, role: playerRoleSchema }),
  z.object({ t: z.literal("cancel_countdown") }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("settings"), settings: roomSettingsSchema }),
  z.object({ t: z.literal("kick"), playerId: z.string().min(1) }),
  z.object({ t: z.literal("add_bot") }),
  z.object({ t: z.literal("remove_bot"), playerId: z.string().min(1) }),
  z.object({ t: z.literal("rematch") }),
]);
export type ClientMsg = z.infer<typeof clientMsg>;

export type MatchStatus =
  | "lobby"
  | "countdown"
  | "crop_ban"
  | "crop_selection"
  | "prepare_countdown"
  | "playing"
  | "ended";

export interface LobbyRoomSummary {
  code: string;
  status: MatchStatus;
  players: number;
  maxPlayers: number;
  mode: MatchModeSetting;
  stage: RoomStage;
  joinable: boolean;
  updatedAt: number;
}

export interface LobbyRoomsResponse {
  rooms: LobbyRoomSummary[];
}

export interface PublicPlayerStats {
  harvests: number;
  cropHarvests: Record<CropId, number>;
  coinsEarned: number;
}

export interface PublicPlayer {
  id: string;
  userId?: string;
  name: string;
  level?: number;
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
  isBot?: boolean;
  cosmetics: PlayerCosmetics;
  stats: PublicPlayerStats;
  inputDir?: Direction;
}

export interface MatchRecap {
  endedAt: number;
  durationMs: number;
  timeRemainingMs: number;
  players: Array<{
    id: string;
    userId?: string;
    name: string;
    coins: number;
    harvests: number;
    topCrop?: CropId;
    coinsEarned: number;
    expAward?: ProgressAward;
  }>;
}

export interface PublicMatchState {
  code: string;
  status: MatchStatus;
  hostId?: string;
  settings: RoomSettings;
  countdownEndsAt?: number;
  banEndsAt?: number;
  selectionEndsAt?: number;
  startedAt?: number;
  endsAt?: number;
  winnerId?: string;
  winnerTeamId?: TeamId;
  endedReason?: "race" | "timeout" | "forfeit" | "kick";
  recap?: MatchRecap;
  players: PublicPlayer[];
  teams?: MatchTeam[];
  fieldCargo?: Cargo[];
  marketPrices?: Record<CropId, number>;
  marketOrder?: MarketOrder;
  banTurnPlayerId?: string;
  spectatorCount?: number;
  roomClosesAt?: number;
}

export type ServerEvent =
  | { kind: "till"; playerId: string; x: number; y: number }
  | { kind: "water"; playerId: string; x: number; y: number }
  | { kind: "plant"; playerId: string; x: number; y: number; cropId: CropId }
  | { kind: "harvest"; playerId: string; x: number; y: number; cropId: CropId; reward: number }
  | { kind: "insufficient_funds"; playerId: string; x: number; y: number }
  | { kind: "cargo_created"; playerId: string; cargo: Cargo }
  | { kind: "cargo_picked_up"; playerId: string; cargoId: string }
  | {
      kind: "cargo_sold";
      playerId: string;
      teamId: TeamId;
      cargoId: string;
      reward: number;
      distance: number;
      puzzleChoice?: SellerPuzzleChoice;
      puzzleCorrect?: boolean;
      bonus?: number;
      marketRushBonus?: number;
      marketRushMultiplier?: number;
      marketRushCropId?: CropId;
      count?: number;
      cargoIds?: string[];
      totalReward?: number;
    }
  | { kind: "cargo_spoiled"; playerId: string; cargoId: string; x: number; y: number }
  | { kind: "bug_found"; playerId: string; x: number; y: number }
  | { kind: "bug_cleared"; playerId: string; x: number; y: number; reward: number }
  | { kind: "role_swapped"; playerId: string; playerId1: string; playerId2: string };

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
  | { t: "room_closed" }
  | { t: "error"; code: string; message: string };

export function makeRoomCode(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ROOM_CODE_LEN; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
