/**
 * PUPS: what is switched on.
 *
 * You never edit this file to go live. Every value comes from an environment
 * variable on your host (Vercel: Settings, Environment Variables), read when
 * the site is built. Change a variable, redeploy, and the site changes.
 *
 *   PUPS_ASK=1        cat chat, narratives, post packs and debates written by Claude
 *   PUPS_BOARD=1      shared launch board
 *   PUPS_LITTER=1     Golden Bone votes counted on your server
 *   PUPS_LAUNCH=1     real pump.fun launches from the visitor's wallet
 *   PUPS_VESTING=1    lock the creator's first buy after launch
 *   PUPS_SCOUR=1      live coin numbers          (needs server/coinProvider.ts)
 *   PUPS_WATCH=1      live feed for the Live desk (needs server/coinFeed.ts)
 *
 *   PUPS_PUBLIC_RPC_URL   Solana RPC address the browser uses to send launches
 *   PUPS_LITTER_PCT       Golden Bone prize, percent of PUPS creator fees
 *
 * Anything left unset is off, and that part of the site runs as the demo.
 */
import type { LaunchStyle } from "./pumpLaunch";
import type { VestSchedule } from "./vesting";

declare const __PAWS_FLAGS__: { scour: boolean; launch: boolean; ask: boolean; board: boolean; watch: boolean; litter: boolean; vesting: boolean };
declare const __PUBLIC_RPC_URL__: string;
declare const __LITTER_SHARE_PCT__: number;
declare const __SITE_URL__: string;

export const ENABLED = __PAWS_FLAGS__;

/** The browser sees this address, so restrict the key to your domain in your RPC provider's dashboard. */
export const PUBLIC_RPC_URL = __PUBLIC_RPC_URL__;

/** 0 means "not decided yet": the page then says "a share" instead of a number. */
export const LITTER_SHARE_PCT = __LITTER_SHARE_PCT__;

/** The site's own address (SITE_URL on the host). Attached as the website of every coin launched here; empty attaches none. */
export const SITE_URL = __SITE_URL__;

/** The page names launch styles by the pup's ability; the launch code names them by what they do. */
export const STYLE_BY_KEY: Record<string, LaunchStyle> = {
  dip: "flash",
  diamond: "slowBurn",
  inspect: "certified",
  tail: "stealth",
  swing: "standard",
};

/**
 * Which launch styles vest the creator's first buy, and on what schedule.
 * null means that style doesn't vest. Vesting asks the wallet for a second approval after the launch.
 */
export const VEST: Record<LaunchStyle, VestSchedule | null> = {
  flash: null,
  slowBurn: { cliffDays: 30, vestDays: 180, periods: 180 },
  certified: null,
  stealth: null,
  standard: null,
};

/** First-buy size per style, in SOL. Must stay at or under CAT_RULES[style].maxDevBuySol. 0 creates the coin without buying. */
export const DEV_BUY_SOL: Record<LaunchStyle, number> = {
  flash: 0,
  slowBurn: 0,
  certified: 0,
  stealth: 0,
  standard: 0,
};
