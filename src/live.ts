/**
 * PUPS: connects the page to the real services.
 *
 * Bundle this file and load it on public/index.html. It sets window.PAWS_LIVE
 * with only the adapters switched on in config.ts, then tells the page.
 * An adapter that is missing leaves that part of the page in demo mode.
 */
import { DEV_BUY_SOL, ENABLED, LITTER_SHARE_PCT, PUBLIC_RPC_URL, SITE_URL, STYLE_BY_KEY, VEST } from "./config";
import { connectWallet, signWithWallet } from "./wallet";
import { loadWeb3 } from "./web3";

/** What the page passes to launch(). */
interface PagePlan {
  name: string;
  symbol: string;
  narrative: string;
  styleKey: string;
  styleName: string;
  buyerLabel: string;
  image: Blob | null;
  /** Optional X (Twitter) link, already normalised by the page to https://x.com/... */
  twitter?: string;
  cat: { name: string; breed: string; traits: Record<string, string> };
}

/** What the page passes to saveLaunch(): one launch board entry. */
type BoardEntry = Record<string, unknown> & { mint?: string };

/** What launch() gives back to the page. */
interface LaunchOutcome {
  mint: string;
  /** The launch transaction, so the page can link to it as proof. */
  signature: string;
  /** The vesting transaction, when the first buy was vested. */
  vestSignature?: string;
  /** The public vesting lock, when the first buy was vested. */
  vestEscrow?: string;
  /** Why vesting didn't happen, when it was supposed to. The coin is live either way. */
  vestError?: string;
}

interface PawsLive {
  /** Follows a launched coin. Calls onEvent for each thing that happens; returns a function that stops. */
  watch?(mint: string, onEvent: (event: unknown) => void): () => void;
  /** Connects the visitor's wallet and returns its address, for the System panel. */
  connect?(): Promise<string>;
  scour?(address: string): Promise<unknown>;
  launch?(plan: PagePlan): Promise<LaunchOutcome>;
  /** True when launches vest the creator's first buy, so the page can say so. */
  vesting?: boolean;
  /** Golden Bone: this week's and last week's vote counts, by launch id. */
  votes?(): Promise<{ now: Record<string, number>; prev: Record<string, number> }>;
  /** Golden Bone: cast this wallet's one vote for the week. */
  vote?(entryId: string): Promise<void>;
  /** Golden Bone: the prize as a percent of PUPS creator fees. 0 hides the number. */
  litterPct?: number;
  /** The site's address, shown on coin pages as each coin's website. Empty when none is set. */
  site?: string;
  ask?(input: unknown): Promise<string>;
  listLaunches?(): Promise<unknown[]>;
  saveLaunch?(entry: BoardEntry): Promise<{ verified: boolean; hidden: boolean }>;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return (await res.json()) as T;
}

// Signatures of launches made in this visit, so the server can verify them before listing.
const signatures = new Map<string, string>();

const live: PawsLive = {};

if (ENABLED.scour) {
  live.scour = (address) => fetch(`/api/coin?address=${encodeURIComponent(address)}`).then((r) => json(r));
}

if (ENABLED.launch) {
  live.connect = async () => {
    const wallet = await connectWallet();
    return wallet.publicKey ? wallet.publicKey.toBase58() : "";
  };
  live.launch = async (plan) => {
    const style = STYLE_BY_KEY[plan.styleKey];
    if (!style) throw new Error("This cat doesn't launch new coins.");
    if (!plan.image) throw new Error("The coin needs a logo before it can launch.");
    if (!PUBLIC_RPC_URL) throw new Error("PUBLIC_RPC_URL is not set in src/config.ts.");
    // The Solana and pump.fun code is large, so it is only downloaded when someone launches.
    const [{ Connection, PublicKey }, { launchWithCat }] = await Promise.all([loadWeb3(), import("./pumpLaunch")]);
    const wallet = await connectWallet();
    const connection = new Connection(PUBLIC_RPC_URL, "confirmed");
    const result = await launchWithCat(connection, wallet, {
      name: plan.name,
      symbol: plan.symbol,
      narrative: plan.narrative,
      image: plan.image,
      style,
      devBuySol: DEV_BUY_SOL[style],
      twitter: plan.twitter || undefined,
      cat: plan.cat,
    });
    signatures.set(result.mint, result.signature);
    const outcome: LaunchOutcome = { mint: result.mint, signature: result.signature };
    const schedule = VEST[style];
    if (ENABLED.vesting && schedule && DEV_BUY_SOL[style] > 0) {
      // The coin is already live. If vesting fails or the visitor declines the second approval,
      // the page is told so it never claims the tokens are vested.
      try {
        const { vestFirstBuy } = await import("./vesting");
        const vest = await vestFirstBuy(connection, wallet, new PublicKey(result.mint), schedule);
        outcome.vestEscrow = vest.escrow;
        outcome.vestSignature = vest.signature;
      } catch (err) {
        outcome.vestError = err instanceof Error ? err.message : "The first buy was not vested.";
      }
    }
    return outcome;
  };
}

if (ENABLED.watch) {
  live.watch = (mint, onEvent) => {
    let since = Date.now();
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const events = await fetch(`/api/feed?mint=${encodeURIComponent(mint)}&since=${since}`).then((r) => json<{ ts: number }[]>(r));
        for (const event of events) {
          since = Math.max(since, event.ts + 1);
          onEvent(event);
        }
      } catch {
        // A failed poll is skipped; the next one picks up from the same moment.
      }
    };
    const timer = setInterval(poll, 5000);
    void poll();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  };
}

if (ENABLED.ask) {
  live.ask = (input) =>
    fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    })
      .then((r) => json<{ text: string }>(r))
      .then((j) => j.text);
}

if (ENABLED.board) {
  live.listLaunches = () => fetch("/api/launches").then((r) => json<unknown[]>(r));
  live.saveLaunch = async (entry) => {
    const signature = entry.mint ? signatures.get(entry.mint) : undefined;
    const res = await fetch("/api/launches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry, signature }),
    });
    if (!res.ok) {
      // Pass the server's own reason to the page, so the launcher can see why.
      const problem = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(problem.error ?? `the server answered ${res.status}`);
    }
    const saved = (await res.json().catch(() => ({}))) as { verified?: boolean; hidden?: boolean };
    return { verified: saved.verified === true, hidden: saved.hidden === true };
  };
}

if (ENABLED.litter) {
  live.votes = () => fetch("/api/votes").then((r) => json(r));
  live.vote = async (entryId) => {
    // The wallet signs a plain message naming the launch and the week. No transaction, no fee.
    const week = await fetch("/api/votes").then((r) => json<{ week: string }>(r)).then((j) => j.week);
    const message = `PUPS Golden Bone vote\nlaunch: ${entryId}\nweek: ${week}`;
    const signed = await signWithWallet(message);
    const res = await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, week, address: signed.address, signature: signed.signature }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "The vote was not accepted.");
    }
  };
}
live.litterPct = LITTER_SHARE_PCT;
live.site = SITE_URL;

live.vesting = ENABLED.launch && ENABLED.vesting;

(window as unknown as { PAWS_LIVE: PawsLive }).PAWS_LIVE = live;
window.dispatchEvent(new Event("paws-live-ready"));
