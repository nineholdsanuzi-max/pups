# Getting PUPS live

Same steps as PAWS, in a separate repository and a separate Vercel project, so the two sites never share settings or data.

I built this, ran the build and type checks, and ran the page through its full flow here. The launch and board code is the same code PAWS runs, with the fixes made along the way. I have not seen it deployed.

## 1. Put it online (10 minutes)

1. On GitHub, click **+**, **New repository**, name it `pups`, choose **Private**, **Create repository**.
2. Click **uploading an existing file**.
3. On your computer, right-click `pups-site.zip` and choose **Extract All**. Open the extracted `pups-site` folder and drag everything inside it onto the GitHub page. Click **Commit changes**.
4. On Vercel, click **Add New, Project**, import `pups`, and click **Deploy** without changing anything.

You now have PUPS on a `vercel.app` address, running as the demo.

## 2. Add the settings (15 minutes)

In the new project, open **Environment Variables** and add these. You can reuse your Claude key and your Helius keys from PAWS.

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Claude key |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |
| `PUPS_ASK` | `1` |
| `SOLANA_RPC_URL` | full Helius RPC address, from a key with **no** domain restriction |
| `PUPS_PUBLIC_RPC_URL` | full Helius RPC address (this one may be restricted to your domain) |
| `PUPS_LAUNCH` | `1` |
| `PUPS_SCOUR` | `1` |
| `PUPS_WATCH` | `1` |
| `PUPS_BOARD` | `1` |
| `PUPS_LITTER` | `1` |

An RPC address is the whole line starting with `https://`, not just the key.

## 3. Add its own database (5 minutes)

**Storage**, **Create Database**, **Upstash for Redis**, free plan, connect it to the `pups` project. Use a new database, not the PAWS one.

## 4. Redeploy and check

**Deployments**, three dots on the top row, **Redeploy**. Then open the site, go to a pup's room, and click the green **System** icon. Every line except Wallet and Vesting should read as connected.

## 5. Domain and website

1. **Domains**, **Add**, and follow what Vercel shows.
2. Add one more setting, then redeploy:

| Key | Value |
|---|---|
| `SITE_URL` | your site's address, e.g. `https://www.yourdomain.com/` |

With `SITE_URL` set, every coin launched from PUPS carries that website, and visitors can add an X link but not a different website. Without it, launches carry no website.

3. In Helius, add the new domain to the restricted key's allowed list.

## 6. Test a launch

From a fresh wallet with about 0.05 SOL: adopt a pup, build a launch, press **Launch on pump.fun**. Check the two links under "Proof of launch", then check the launch board from a second browser.

If the board refuses a launch, the message under the buttons gives the reason. Send it to me.

## Things to know

- The PAWS and PUPS sites are separate: separate boards, votes and adopted companions.
- Every launch sends the coin's creator fees to its holders and makes no first buy.
- Optional settings: `PUPS_LITTER_PCT` (the Golden Bone prize percentage), `BLOCKED_WORDS`, `BOARD_VERIFIED_ONLY`, `BOARD_POSTS_PER_HOUR`, `ASK_DAILY_CAP`.
- The weekly Golden Bone prize is paid by hand. Holder counts, wallets and the bonding curve are not tracked on live coins.
- The prize and running a launchpad can carry legal obligations where you or your users are. I'm not a lawyer.
