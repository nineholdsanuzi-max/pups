/**
 * PUPS: market numbers for a coin, from DexScreener's free public API (no key).
 * Results are remembered for a few seconds so many visitors looking at the
 * same coin don't each cause a request.
 */
export interface DexSnapshot {
  ticker: string;
  priceUsd: number;
  marketCap: number;
  liquidityUsd: number;
  volume24hUsd: number;
  /** 24h volume converted to SOL, when the pair is quoted in SOL. */
  volume24hSol: number;
  change24hPct: number;
  createdAt: number;
  buys24h: number;
  sells24h: number;
  trades5m: number;
}

export class CoinNotFoundError extends Error {}

interface DexPair {
  baseToken?: { symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  priceNative?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  pairCreatedAt?: number;
  txns?: { m5?: { buys?: number; sells?: number }; h24?: { buys?: number; sells?: number } };
}

const cache = new Map<string, { at: number; snap: DexSnapshot }>();
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function dexSnapshot(mint: string, maxAgeMs = 8000): Promise<DexSnapshot> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.snap;

  const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`DexScreener answered ${res.status}`);
  const pairs = (await res.json()) as DexPair[];
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new CoinNotFoundError("No market data for that address yet. New coins can take a minute to appear.");
  }
  // The pair with the most liquidity is the one people are actually trading.
  const pair = pairs.slice().sort((a, b) => num(b.liquidity?.usd) - num(a.liquidity?.usd))[0];
  const priceUsd = num(pair.priceUsd);
  const priceNative = num(pair.priceNative);
  const solUsd = pair.quoteToken?.symbol === "SOL" && priceNative > 0 ? priceUsd / priceNative : 0;
  const snap: DexSnapshot = {
    ticker: String(pair.baseToken?.symbol ?? "").slice(0, 12),
    priceUsd,
    marketCap: num(pair.marketCap) || num(pair.fdv),
    liquidityUsd: num(pair.liquidity?.usd),
    volume24hUsd: num(pair.volume?.h24),
    volume24hSol: solUsd > 0 ? num(pair.volume?.h24) / solUsd : 0,
    change24hPct: num(pair.priceChange?.h24),
    createdAt: num(pair.pairCreatedAt),
    buys24h: num(pair.txns?.h24?.buys),
    sells24h: num(pair.txns?.h24?.sells),
    trades5m: num(pair.txns?.m5?.buys) + num(pair.txns?.m5?.sells),
  };
  cache.set(mint, { at: Date.now(), snap });
  return snap;
}
