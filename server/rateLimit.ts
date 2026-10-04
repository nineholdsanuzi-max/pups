/**
 * PUPS: stop one visitor (or everyone together) from running up the Claude bill.
 * Uses Redis when it is connected; otherwise a per-server-instance memory count,
 * which is weaker because Vercel runs several instances.
 */
import { hasRedis, redis } from "./redis";

const memory = new Map<string, { count: number; resetAt: number }>();

/** True if this call is within `limit` calls per `windowSeconds` for `key`. */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (hasRedis) {
    try {
      const count = await redis<number>("INCR", `pups:rl:${key}`);
      if (count === 1) await redis("EXPIRE", `pups:rl:${key}`, windowSeconds);
      return count <= limit;
    } catch {
      return true; // if Redis is down, don't lock every visitor out of the chat
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** The visitor's address as Vercel reports it. */
export function visitor(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 60);
}
