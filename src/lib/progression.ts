export type ProgressAwardSource =
  | "single_manual"
  | "single_idle"
  | "multiplayer_1v1"
  | "multiplayer_2v2"
  | "bot_match";

export interface ProgressAward {
  awardId: string;
  source: ProgressAwardSource;
  mode: "single" | "1v1" | "2v2";
  exp: number;
  reason: string;
  basis?: {
    coinsEarned?: number;
    harvests?: number;
    won?: boolean;
    durationMs?: number;
    humanOpponentCount?: number;
    botCount?: number;
  };
}

export interface PlayerProgress {
  level: number;
  exp: number;
  totalExp: number;
  updatedAt: number;
  awardsClaimed: Record<string, number>;
}

export interface AppliedProgressAward {
  progress: PlayerProgress;
  applied: boolean;
  leveledUp: boolean;
  previousLevel: number;
}

export const DEFAULT_PROGRESS: PlayerProgress = {
  level: 1,
  exp: 0,
  totalExp: 0,
  updatedAt: 0,
  awardsClaimed: {},
};

const LEVEL_TITLES = [
  { min: 1, title: "มือใหม่ปลูกผัก" },
  { min: 10, title: "ชาวสวนฝึกหัด" },
  { min: 25, title: "นักเก็บเกี่ยว" },
  { min: 50, title: "ชาวสวนชำนาญ" },
  { min: 75, title: "มือโปรตลาดเช้า" },
  { min: 100, title: "ครูสวนหมู่บ้าน" },
  { min: 125, title: "นักวางแผนไร่" },
  { min: 150, title: "เจ้าของสวนทอง" },
  { min: 175, title: "ผู้คุมฤดูกาล" },
  { min: 200, title: "ปราชญ์ดินน้ำ" },
  { min: 225, title: "ตำนานตลาดน้ำ" },
  { min: 250, title: "เซียนผักรุ่งอรุณ" },
  { min: 275, title: "นายสวนแห่งแสง" },
  { min: 300, title: "ผู้พิทักษ์ไร่ไทย" },
  { min: 325, title: "จักรพรรดิเก็บเกี่ยว" },
  { min: 350, title: "มหาเซียนสวน" },
  { min: 375, title: "เทพไร่พระอาทิตย์" },
  { min: 400, title: "ผู้ครองสวนสวรรค์" },
  { min: 450, title: "ตำนานสวนทองคำ" },
  { min: 500, title: "ปรมาจารย์สวนไทย" },
] as const;

export function levelTitle(level: number): string {
  const safeLevel = Math.max(1, Math.floor(level));
  let current: string = LEVEL_TITLES[0].title;
  for (const tier of LEVEL_TITLES) {
    if (safeLevel >= tier.min) current = tier.title;
    else break;
  }
  return current;
}

export function expForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.floor(80 + safeLevel * safeLevel * 34 + safeLevel * 26);
}

export function calculateLevel(totalExp: number): { level: number; exp: number; next: number } {
  let remaining = Math.max(0, Math.floor(totalExp));
  let level = 1;
  while (remaining >= expForLevel(level)) {
    remaining -= expForLevel(level);
    level += 1;
  }
  return { level, exp: remaining, next: expForLevel(level) };
}

export function normalizeProgress(input: unknown): PlayerProgress {
  if (!input || typeof input !== "object") return { ...DEFAULT_PROGRESS, awardsClaimed: {} };
  const raw = input as Partial<PlayerProgress>;
  const totalExp = finiteNonNegativeInt(raw.totalExp) ?? 0;
  const levelState = calculateLevel(totalExp);
  const awardsClaimed: Record<string, number> = {};
  if (raw.awardsClaimed && typeof raw.awardsClaimed === "object") {
    for (const [key, value] of Object.entries(raw.awardsClaimed)) {
      if (typeof key === "string" && typeof value === "number" && Number.isFinite(value)) {
        awardsClaimed[key] = value;
      }
    }
  }
  return {
    level: levelState.level,
    exp: levelState.exp,
    totalExp,
    updatedAt: finiteNonNegativeInt(raw.updatedAt) ?? 0,
    awardsClaimed,
  };
}

export function applyAwardToProgress(
  progress: PlayerProgress,
  award: ProgressAward,
  now = Date.now(),
): AppliedProgressAward {
  const current = normalizeProgress(progress);
  if (!award.awardId || current.awardsClaimed[award.awardId]) {
    return { progress: current, applied: false, leveledUp: false, previousLevel: current.level };
  }
  const exp = Math.max(0, Math.floor(award.exp));
  const previousLevel = current.level;
  const totalExp = current.totalExp + exp;
  const levelState = calculateLevel(totalExp);
  const next: PlayerProgress = {
    level: levelState.level,
    exp: levelState.exp,
    totalExp,
    updatedAt: now,
    awardsClaimed: {
      ...current.awardsClaimed,
      [award.awardId]: now,
    },
  };
  return {
    progress: next,
    applied: exp > 0,
    leveledUp: next.level > previousLevel,
    previousLevel,
  };
}

export function createSinglePlayerHarvestAward(input: {
  cropId: string;
  reward: number;
  total: number;
  at: number;
  idle: boolean;
  sequence: number;
}): ProgressAward {
  const reward = Math.max(0, Math.floor(input.total || input.reward));
  const source: ProgressAwardSource = input.idle ? "single_idle" : "single_manual";
  const multiplier = input.idle ? 0.08 : 0.55;
  const exp = Math.max(
    input.idle ? 1 : 3,
    Math.min(input.idle ? 4 : 28, Math.ceil(reward * multiplier)),
  );
  return {
    awardId: `single:${source}:${input.at}:${input.sequence}:${input.cropId}:${reward}`,
    source,
    mode: "single",
    exp,
    reason: input.idle ? "บอทช่วยเก็บเกี่ยว" : "เก็บเกี่ยวด้วยตัวเอง",
    basis: { coinsEarned: reward, harvests: 1 },
  };
}

export function createMultiplayerProgressAward(input: {
  roomCode: string;
  playerId: string;
  userId?: string;
  mode: "1v1" | "2v2";
  endedAt: number;
  durationMs: number;
  coinsEarned: number;
  harvests: number;
  won: boolean;
  humanOpponentCount: number;
  botCount: number;
  endedReason?: "race" | "timeout" | "forfeit" | "kick";
}): ProgressAward | undefined {
  const coinsEarned = Math.max(0, Math.floor(input.coinsEarned));
  const harvests = Math.max(0, Math.floor(input.harvests));
  if (coinsEarned <= 0 && harvests <= 0) return undefined;

  const humanMatch = input.humanOpponentCount > 0;
  const source: ProgressAwardSource = humanMatch
    ? input.mode === "2v2"
      ? "multiplayer_2v2"
      : "multiplayer_1v1"
    : "bot_match";
  const multiplier =
    source === "multiplayer_2v2" ? 1.25 : source === "multiplayer_1v1" ? 1.05 : 0.12;
  const winBonus = input.won && humanMatch ? 20 : 0;
  const actionBase = Math.ceil(coinsEarned * multiplier + harvests * (humanMatch ? 2 : 0.3));
  const durationCap = Math.max(
    8,
    Math.ceil((Math.max(30_000, input.durationMs) / 60_000) * (humanMatch ? 70 : 10)),
  );
  const forfeitFactor = input.endedReason === "forfeit" || input.endedReason === "kick" ? 0.4 : 1;
  const raw = Math.ceil((actionBase + winBonus) * forfeitFactor);
  const exp = Math.max(source === "bot_match" ? 2 : 8, Math.min(durationCap, raw));

  return {
    awardId: `match:${input.roomCode}:${input.endedAt}:${input.userId ?? input.playerId}:${input.mode}:${coinsEarned}:${harvests}`,
    source,
    mode: input.mode,
    exp,
    reason:
      source === "multiplayer_2v2"
        ? "แข่ง 2v2"
        : source === "multiplayer_1v1"
          ? "แข่ง 1v1"
          : "เล่นกับบอท/idle",
    basis: {
      coinsEarned,
      harvests,
      won: input.won,
      durationMs: input.durationMs,
      humanOpponentCount: input.humanOpponentCount,
      botCount: input.botCount,
    },
  };
}

function finiteNonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined;
}
