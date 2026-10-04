# PUPS site

**Start with `GO-LIVE.md`.** It walks through getting the site online step by step, with no code editing.

This folder is the PUPS page plus everything it needs to do the real thing: Claude-written chat, a shared launch board, Golden Bone voting, real pump.fun launches, vesting, and the seams for live coin data.

**Every live feature is switched off until you set its environment variable on your host.** With nothing set, the site behaves exactly like the demo: nothing sends a transaction, spends money or stores anything. The switches are listed at the top of `src/config.ts` and in `.env.example`.

## Layout

```
public/index.html      the PUPS page (same file as the demo)
src/config.ts          reads the switches from environment variables; vesting schedule and first-buy sizes
build.mjs              builds the browser code (run by Vercel)
src/live.ts            connects the page to the pieces below
src/wallet.ts          connects the visitor's wallet
src/pumpLaunch.ts      builds and sends the pump.fun create transaction
src/vesting.ts         locks the creator's first buy on a vesting schedule
api/metadata.ts        uploads the coin's logo and description
api/coin.ts            live numbers for a contract address
api/ask.ts             the pup's chat and writing, through Claude
api/launches.ts        the shared launch board, with on-chain verification
api/votes.ts           Golden Bone votes, one per wallet per week
server/voteStore.ts    where votes are kept                   (Redis, or memory without it)
server/redis.ts        the database connection (Upstash Redis)
server/rateLimit.ts    limits on chat and posting
server/litterBox.ts    picks the weekly winner; paying it is  (not implemented)
api/feed.ts            what happened to a launched coin since a given moment
server/dex.ts          market numbers from DexScreener's free public data
server/coinFeed.ts     turns changes in those numbers into events for the Live desk
server/coinProvider.ts live numbers for the scour dashboard
server/launchStore.ts  where board entries are kept           (Redis, or memory without it)
```

The `api/` files are standard `Request -> Response` handlers. They drop into Next.js route handlers, Cloudflare Workers, Bun or Deno.

## How the page and this code meet

The page looks for `window.PAWS_LIVE`. `src/live.ts` sets it, with one adapter per flag that is on:

| Adapter | Flag | Page behaviour with it | Without it |
|---|---|---|---|
| `scour(address)` | `scour` | Dashboard shows live price, holders, trades | Sample numbers |
| `launch(plan)` | `launch` | "Launch on pump.fun" sends a real transaction | Button is disabled |
| `ask(input)` | `ask` | Chat, narratives, post packs, debates written by Claude | Template text |
| `listLaunches()` / `saveLaunch(entry)` | `board` | Shared launch board | Board saved on the visitor's device |
| `votes()` / `vote(id)` | `litter` | Golden Bone votes are signed by the wallet and counted on your server | One vote per browser, counted on that device |
| `watch(mint, onEvent)` | `watch` | The Live desk follows the coin's real trades, holders and milestones | Simulated activity, labelled as simulated |

The page sends `launch()` the coin's name, ticker, narrative, the pup's launch style, the coin's picture as a PNG and the pup. It expects `{ mint, signature }` back, plus `vestEscrow` and `vestSignature` when the first buy was vested.

## Proof of launch

After a real launch the page shows a "Proof of launch" panel: the contract address, the launch transaction and, when vesting ran, the lock and its transaction. Each has a copy button and a link to Solscan, plus a link to the coin on pump.fun. The same proof appears on the coin page and is saved with the launch board entry. The server only keeps a contract address and transaction on the board after confirming the transaction on-chain.

The `connect()` adapter lets the page's System panel connect the visitor's wallet and show its address before they launch.

## Switching things on

See `GO-LIVE.md`. Each switch is an environment variable (`PUPS_ASK`, `PUPS_BOARD`, `PUPS_LITTER`, `PUPS_LAUNCH`, `PUPS_VESTING`, `PUPS_SCOUR`, `PUPS_WATCH`) set to `1`, followed by a redeploy.

## Creator fees go to holders

Every coin launched through PUPS is created as a pump.fun holder-reward coin (`holderReward: true` for every style in `CAT_RULES`). Its creator fees are paid to its holders by pump.fun, not to whoever launched it, and that can never be changed for that coin.

- The launcher earns no creator fees from their coin. The page says so before they launch.
- pump.fun has a switch for this feature. The launch code checks it first and refuses to launch if it is off, so a coin never goes out with fees going somewhere other than promised. I could not check from here whether the switch is on today.
- pump.fun does the paying out to holders. There is nothing for you to run.

## Golden Bone

Each week, the launch with the most votes wins a share of PUPS's own creator fees.

- **Source of the prize:** PUPS's own coin. Coins launched through PUPS give their fees to their holders, so they can't fund it. If PUPS itself were created as a holder-reward coin, there would be no creator fees left for the prize, so decide that before creating PUPS.
- **The share:** set `PUPS_LITTER_PCT` on your host. Unset, the page says "a share" instead of a number.
- **Voting:** one vote per wallet per week, proved by a signed message (no transaction, no fee). Weeks run Monday 00:00 UTC to Monday 00:00 UTC.
- **Many wallets:** one person can make many wallets. the `LITTER_MIN_PUPS` environment variable plus `holdsEnoughPaws` in `api/votes.ts` (not implemented) is the place to require a PUPS balance.
- **Paying the winner:** `pickWinner()` in `server/litterBox.ts` works. Sending the prize is not implemented on purpose; the file explains the safe ways to do it.

Paying a prize from the coin's fees can carry legal obligations in some countries. Get that checked before you announce it.

## Wallets

Visitors connect their own wallet (Phantom, Solflare or Backpack). PUPS never holds a key and the pups do not have wallets of their own. Every launch and every vesting lock is approved in the visitor's wallet.

## Vesting

pump.fun has no vesting, so `src/vesting.ts` runs straight after a launch and moves the creator's first buy into a public lock (the Jupiter Lock program, through `@meteora-ag/met-lock-sdk`).

- The default schedule for the Holder is a 30 day cliff, then equal daily releases over 180 days.
- The lock cannot be cancelled and its recipient cannot be changed.
- It is a second wallet approval. If the visitor declines it, or it fails, the coin is still live and the page says the first buy was not vested.
- It only locks the launching wallet's own tokens.
- The lock's address is saved with the launch and shown on the coin page.

## What is and isn't done

Done and type-checked against `@pump-fun/pump-sdk` 2.0.0:

- The page's live seams. I ran the page with fake adapters and confirmed it calls each one and shows the result.
- The pump.fun create instruction (built offline; it targets the pump program).
- The wallet, launch, chat, coin and board routes.

Not implemented, on purpose, because they need your choices:

- Holder counts, individual wallets and the bonding curve for live coins. DexScreener doesn't publish them.
- Name filtering is only as good as the `BLOCKED_WORDS` list you set.
- Golden Bone payouts, and the PUPS balance check for voters.

Never run for real:

- Sending a launch transaction, the first-buy path and wallet signing.
- `src/vesting.ts`. It type-checks against the lock SDK, which supports pump.fun's token type, but no lock has been created with it.
- `api/metadata.ts`. Its upload address (`https://pump.fun/api/ipfs`) is not a documented public API. If it refuses, swap in any IPFS pinning service.
- `api/ask.ts` against the Claude API, `api/launches.ts` against a real RPC, and the DexScreener lookups against the real service (tested here with a stand-in reply).

## Things the page does that stay device-only

Pups, levels, badges, streaks, the wardrobe, chat logs and report cards live in the visitor's browser. Accounts, so they follow someone between devices, are not part of this structure.

## What pump.fun can't do for the pups

Every pump.fun coin gets the same bonding curve. There is no vesting, no max-buy limit and no liquidity setting. The pups control the size of the first buy and the buyer label written into the coin's description. The Holder's first buy can be vested through the separate lock above. A buy limit for other buyers is not enforceable there, and the Stray's takeovers go through pump.fun's own process.
