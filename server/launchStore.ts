/**
 * PUPS: where launch board entries are kept.
 * Redis when it is connected (see server/redis.ts), otherwise memory.
 */
import { hasRedis, redis } from "./redis";

export interface StoredLaunch {
  /** The entry exactly as the page sent it (the page cleans it again before showing it). */
  entry: Record<string, unknown>;
  /** True when a confirmed pump.fun create transaction for entry.mint was found on-chain. */
  verified: boolean;
  savedAt: number;
}

export interface LaunchStore {
  list(limit: number): Promise<StoredLaunch[]>;
  add(launch: StoredLaunch): Promise<void>;
  hasMint(mint: string): Promise<boolean>;
}

const memory: StoredLaunch[] = [];
const KEY = "pups:launches";
const MINTS = "pups:mints";

export const store: LaunchStore = {
  async list(limit) {
    if (!hasRedis) return memory.slice(-limit).reverse();
    const rows = await redis<string[]>("LRANGE", KEY, 0, limit - 1);
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row) as StoredLaunch];
      } catch {
        return [];
      }
    });
  },
  async add(launch) {
    if (!hasRedis) {
      memory.push(launch);
      return;
    }
    await redis("LPUSH", KEY, JSON.stringify(launch));
    await redis("LTRIM", KEY, 0, 999);
    if (typeof launch.entry.mint === "string") await redis("SADD", MINTS, launch.entry.mint);
  },
  async hasMint(mint) {
    if (!hasRedis) return memory.some((l) => l.entry.mint === mint);
    return (await redis<number>("SISMEMBER", MINTS, mint)) === 1;
  },
};

/**
 * Names are written by visitors and shown to everyone.
 * Set BLOCKED_WORDS in the server environment to a comma-separated list
 * (e.g. "word1,word2"). A name containing any of them is refused.
 * With nothing set, every non-empty name is accepted.
 */
export function isNameAllowed(name: string): boolean {
  const clean = name.trim().toLowerCase();
  if (!clean) return false;
  const blocked = (process.env.BLOCKED_WORDS ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const squashed = clean.replace(/[^a-z0-9]/g, "");
  return !blocked.some((w) => clean.includes(w) || squashed.includes(w.replace(/[^a-z0-9]/g, "")));
}
