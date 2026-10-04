/**
 * PUPS: live numbers for the scour dashboard, from DexScreener (see server/dex.ts).
 *
 * What is live: price, market cap, liquidity, 24h volume, 24h change, age, buys and sells.
 * What is not: holder counts, top-wallet shares and the creator's share. DexScreener
 * doesn't publish them, so the page keeps its sample values for those and says so.
 * To add them, fill in the optional fields below from a holder-data provider.
 */
import { CoinNotFoundError, dexSnapshot } from "./dex";

export interface CoinData {
  ticker?: string;
  marketCap?: number;      // USD
  price?: number;          // USD
  liquidity?: number;      // USD
  volume24h?: number;      // USD
  change24hPct?: number;   // e.g. -12.5
  ageHours?: number;
  holders?: number;
  top10Pct?: number;       // share of supply held by the top 10 wallets
  devPct?: number;         // share of supply held by the creator
  buys24h?: number;
  sells24h?: number;
}

export class NotConfiguredError extends Error {}
export { CoinNotFoundError };

export async function fetchCoinData(address: string): Promise<CoinData> {
  const s = await dexSnapshot(address);
  return {
    ticker: s.ticker,
    marketCap: s.marketCap,
    price: s.priceUsd,
    liquidity: s.liquidityUsd,
    volume24h: s.volume24hUsd,
    change24hPct: s.change24hPct,
    ageHours: s.createdAt ? Math.max(1, Math.round((Date.now() - s.createdAt) / 3_600_000)) : undefined,
    buys24h: s.buys24h,
    sells24h: s.sells24h,
  };
}
