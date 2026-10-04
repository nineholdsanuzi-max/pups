/**
 * PUPS: what happened to a launched coin since a given moment.
 *
 * This is what lets a pup follow a coin while it is live. It works by taking a
 * DexScreener snapshot of the coin (at most every 15 seconds), comparing it
 * with the previous one, and turning the differences into events: new buys and
 * sells, sharp moves in market cap, market-cap milestones, and quiet spells.
 *
 * It does not see individual trades, wallets, holder counts or the bonding
 * curve. Those need a trade-level data source; add events of the types below
 * from one and the page will handle them.
 */
import { CoinNotFoundError, dexSnapshot } from "./dex";
import { hasRedis, redis } from "./redis";

export type FeedEventType =
  | "buy" | "sell" | "whale_buy" | "whale_sell" | "join"
  | "holders" | "curve" | "mentions" | "quiet" | "copycat" | "milestone" | "surge" | "drop";

export interface FeedEvent {
  type: FeedEventType;
  /** One plain sentence. */
  text: string;
  /** Unix milliseconds. */
  ts: number;
  /** True for events the pup should react to. */
  big?: boolean;
  /** The milestone number for "holders", "curve" and "milestone". */
  n?: number;
  /** Any of the coin's current numbers that are known. */
  stats?: { mcap?: number; holders?: number; curve?: number; buys?: number; sells?: number; vol?: number; mentions?: number };
}

export class FeedNotConfiguredError extends Error {}

interface Last {
  at: number;
  buys: number;
  sells: number;
  mcap: number;
  quiet: boolean;
  idle: number;
}

const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000];
const REFRESH_MS = 15_000;
const memLast = new Map<string, Last>();
const memEvents = new Map<string, FeedEvent[]>();

const usd = (n: number): string => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

async function getLast(mint: string): Promise<Last | null> {
  if (!hasRedis) return memLast.get(mint) ?? null;
  const raw = await redis<string | null>("GET", `pups:snap:${mint}`);
  try {
    return raw ? (JSON.parse(raw) as Last) : null;
  } catch {
    return null;
  }
}

async function setLast(mint: string, last: Last): Promise<void> {
  if (!hasRedis) {
    memLast.set(mint, last);
    return;
  }
  await redis("SET", `pups:snap:${mint}`, JSON.stringify(last), "EX", 86_400 * 7);
}

async function pushEvents(mint: string, events: FeedEvent[]): Promise<void> {
  if (events.length === 0) return;
  if (!hasRedis) {
    memEvents.set(mint, [...(memEvents.get(mint) ?? []), ...events].slice(-100));
    return;
  }
  await redis("RPUSH", `pups:feed:${mint}`, ...events.map((e) => JSON.stringify(e)));
  await redis("LTRIM", `pups:feed:${mint}`, -100, -1);
  await redis("EXPIRE", `pups:feed:${mint}`, 86_400 * 7);
}

async function readEvents(mint: string): Promise<FeedEvent[]> {
  if (!hasRedis) return memEvents.get(mint) ?? [];
  const rows = await redis<string[]>("LRANGE", `pups:feed:${mint}`, 0, -1);
  return rows.flatMap((r) => {
    try {
      return [JSON.parse(r) as FeedEvent];
    } catch {
      return [];
    }
  });
}

/** Takes a fresh snapshot if the last one is old enough, and records what changed. */
async function refresh(mint: string): Promise<void> {
  const last = await getLast(mint);
  const now = Date.now();
  if (last && now - last.at < REFRESH_MS) return;

  let snap;
  try {
    snap = await dexSnapshot(mint, 0);
  } catch (err) {
    if (err instanceof CoinNotFoundError) return; // not listed yet: nothing to report
    throw err;
  }
  const stats = { mcap: snap.marketCap, buys: snap.buys24h, sells: snap.sells24h, vol: snap.volume24hSol || undefined };
  const events: FeedEvent[] = [];
  const next: Last = { at: now, buys: snap.buys24h, sells: snap.sells24h, mcap: snap.marketCap, quiet: last?.quiet ?? false, idle: last?.idle ?? 0 };

  if (!last) {
    events.push({ type: "join", text: `Now tracking this coin. Market cap ${usd(snap.marketCap)}`, ts: now, stats });
  } else {
    const buys = snap.buys24h - last.buys;
    const sells = snap.sells24h - last.sells;
    if (buys > 0) events.push({ type: "buy", text: buys === 1 ? "1 new buy" : `${buys} new buys`, ts: now, stats });
    if (sells > 0) events.push({ type: "sell", text: sells === 1 ? "1 new sell" : `${sells} new sells`, ts: now, stats });

    if (last.mcap > 0 && snap.marketCap > 0) {
      const pct = ((snap.marketCap - last.mcap) / last.mcap) * 100;
      if (pct >= 10) events.push({ type: "surge", text: `Market cap jumped ${Math.round(pct)}% to ${usd(snap.marketCap)}`, ts: now, big: true, stats });
      if (pct <= -10) events.push({ type: "drop", text: `Market cap fell ${Math.round(-pct)}% to ${usd(snap.marketCap)}`, ts: now, big: true, stats });
      for (const m of MILESTONES) {
        if (last.mcap < m && snap.marketCap >= m) events.push({ type: "milestone", text: `Market cap passed ${usd(m)}`, ts: now, big: true, n: m, stats });
      }
    }

    if (snap.trades5m === 0) {
      next.idle = last.idle + 1;
      if (next.idle >= 2 && !last.quiet) {
        events.push({ type: "quiet", text: "No trades in the last few minutes", ts: now, big: true, stats });
        next.quiet = true;
      }
    } else {
      next.idle = 0;
      next.quiet = false;
    }
  }

  await setLast(mint, next);
  await pushEvents(mint, events);
}

export async function fetchCoinEvents(mint: string, sinceMs: number): Promise<FeedEvent[]> {
  await refresh(mint);
  return (await readEvents(mint)).filter((e) => e.ts > sinceMs);
}
