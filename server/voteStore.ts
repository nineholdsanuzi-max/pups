/**
 * PUPS: where Golden Bone votes are kept.
 * Redis when it is connected (see server/redis.ts), otherwise memory.
 */
import { hasRedis, redis } from "./redis";

export interface VoteStore {
  /** Records one vote. Returns false if this wallet has already voted in this week. */
  cast(week: string, address: string, entryId: string): Promise<boolean>;
  /** Vote counts for a week, by launch id. */
  tally(week: string): Promise<Record<string, number>>;
}

const byWeek = new Map<string, Map<string, string>>(); // week -> wallet -> launch id

export const votes: VoteStore = {
  async cast(week, address, entryId) {
    if (hasRedis) return (await redis<number>("HSETNX", `pups:votes:${week}`, address, entryId)) === 1;
    const w = byWeek.get(week) ?? new Map<string, string>();
    byWeek.set(week, w);
    if (w.has(address)) return false;
    w.set(address, entryId);
    return true;
  },
  async tally(week) {
    const ids = hasRedis
      ? await redis<string[]>("HVALS", `pups:votes:${week}`)
      : Array.from((byWeek.get(week) ?? new Map<string, string>()).values());
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = (out[id] ?? 0) + 1;
    return out;
  },
};

const WEEK_MS = 7 * 86_400_000;

/** The week a moment falls in, as "w<unix ms of Monday 00:00 UTC>". The page uses the same rule. */
export function weekKey(at: number = Date.now()): string {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7;
  return "w" + Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export function previousWeekKey(at: number = Date.now()): string {
  return weekKey(at - WEEK_MS);
}
