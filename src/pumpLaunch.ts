/**
 * PUPS: launch a coin on pump.fun from the browser.
 *
 * The user's wallet signs and pays. This code never sees a private key.
 * Built against @pump-fun/pump-sdk 2.0.0 (create_v2, SOL-quoted).
 */
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk";

/** One launch style per cat. The Stray has none: it revives coins that already exist. */
export type LaunchStyle = "flash" | "slowBurn" | "certified" | "stealth" | "standard";

/**
 * What each cat can actually enforce on pump.fun.
 *
 * pump.fun has no vesting, no max-buy limit and no liquidity lock setting:
 * every coin gets the same bonding curve, and mint authority is already
 * revoked. The one launch-time lever is the size of the dev's first buy,
 * so that is what the pups control.
 *
 * `holderReward` is pump.fun's own option that pays a coin's creator fees to
 * its holders instead of the creator, permanently. Every PUPS launch sets it:
 * a coin launched with a pup gives its fees back to the people holding it,
 * and whoever launches it earns no creator fees from it.
 */
export const CAT_RULES: Record<
  LaunchStyle,
  { label: string; buyerLabel: string; maxDevBuySol: number; holderReward: boolean }
> = {
  flash:     { label: "Flash launch",           buyerLabel: "Short-lived by design",          maxDevBuySol: 0.5,  holderReward: true },
  slowBurn:  { label: "Slow burn launch",       buyerLabel: "Built to hold",                  maxDevBuySol: 1,    holderReward: true },
  certified: { label: "Fully disclosed launch", buyerLabel: "Fully disclosed launch",         maxDevBuySol: 0.25, holderReward: true },
  stealth:   { label: "Stealth launch",         buyerLabel: "Found, not shilled",             maxDevBuySol: 0,    holderReward: true },
  standard:  { label: "Standard launch",        buyerLabel: "A few days, reviewed in public", maxDevBuySol: 1,    holderReward: true },
};

/** The part of a wallet this code needs. Phantom, Solflare and wallet-adapter wallets all fit. */
export interface WalletLike {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
}

export interface LaunchInput {
  name: string;
  symbol: string;
  /** The metadata JSON link returned by /api/metadata. */
  metadataUri: string;
  style: LaunchStyle;
  /** SOL the creator spends on the first buy. 0 creates the coin without buying. */
  devBuySol?: number;
  /** Optional priority fee, in micro-lamports per compute unit. */
  priorityMicroLamports?: number;
}

export interface LaunchResult {
  mint: string;
  signature: string;
  pumpUrl: string;
}

export class LaunchError extends Error {}

export async function launchOnPump(
  connection: Connection,
  wallet: WalletLike,
  input: LaunchInput,
): Promise<LaunchResult> {
  const user = wallet.publicKey;
  if (!user) throw new LaunchError("Connect a wallet to launch.");

  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();
  if (!name || name.length > 32) throw new LaunchError("The coin name must be 1 to 32 characters.");
  if (!symbol || symbol.length > 10) throw new LaunchError("The ticker must be 1 to 10 characters.");
  if (!/^https?:\/\//.test(input.metadataUri)) throw new LaunchError("Upload the coin's image and description before launching.");

  const rules = CAT_RULES[input.style];
  const devBuySol = input.devBuySol ?? 0;
  if (devBuySol < 0 || devBuySol > rules.maxDevBuySol) {
    throw new LaunchError(`A ${rules.label} allows a first buy of at most ${rules.maxDevBuySol} SOL.`);
  }

  // Every coin is a new mint. The mint keypair signs once, here, and is then thrown away.
  const mint = Keypair.generate();

  const base = {
    mint: mint.publicKey,
    name,
    symbol,
    uri: input.metadataUri,
    creator: user,
    user,
    mayhemMode: false,
    holderReward: rules.holderReward,
  };

  const online = new OnlinePumpSdk(connection);
  const global = await online.fetchGlobal();
  if (rules.holderReward && !global.isHolderRewardEnabled) {
    // pump.fun controls this switch. Fail before the wallet is asked to sign,
    // so a coin never launches with fees going somewhere other than promised.
    throw new LaunchError("pump.fun has holder-reward coins switched off right now, so this coin can't launch with its fees going to holders. Try again later.");
  }

  let pumpIxs: TransactionInstruction[];
  if (devBuySol > 0) {
    const feeConfig = await online.fetchFeeConfig();
    const solAmount = new BN(Math.round(devBuySol * LAMPORTS_PER_SOL));
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null, // the curve doesn't exist yet
      amount: solAmount,
      quoteMint: NATIVE_MINT,
    });
    pumpIxs = await PUMP_SDK.createV2AndBuyInstructions({ ...base, global, amount, solAmount });
  } else {
    pumpIxs = [await PUMP_SDK.createV2Instruction(base)];
  }

  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ...(input.priorityMicroLamports
      ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: input.priorityMicroLamports })]
      : []),
    ...pumpIxs,
  ];

  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: user,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  // The wallet signs first, then the mint. Wallets that add their own
  // safety instructions need to sign before any other signer does.
  const signed = await wallet.signTransaction(tx);
  signed.sign([mint]);

  const signature = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
  const result = await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) {
    throw new LaunchError(`The launch transaction failed on-chain: ${JSON.stringify(result.value.err)}`);
  }

  const address = mint.publicKey.toBase58();
  return { mint: address, signature, pumpUrl: `https://pump.fun/coin/${address}` };
}

/**
 * Upload the coin's image and description, then launch. Recording the launch on the
 * PUPS board is done by src/live.ts, which sends the signature for the server to verify.
 * `/api/metadata` is your own server route (see api/ and README).
 */
export async function launchWithCat(
  connection: Connection,
  wallet: WalletLike,
  plan: {
    name: string;
    symbol: string;
    narrative: string;
    image: Blob;
    style: LaunchStyle;
    devBuySol?: number;
    /** Optional X (Twitter) link chosen by the launcher. The website is always PUPS and is set on the server. */
    twitter?: string;
    cat: { name: string; breed: string; traits: Record<string, string> };
  },
): Promise<LaunchResult> {
  const rules = CAT_RULES[plan.style];
  const form = new FormData();
  form.append("file", plan.image, "logo.png");
  form.append("name", plan.name);
  form.append("symbol", plan.symbol);
  // The buyer label goes into the coin's own description, so it shows on pump.fun too.
  form.append(
    "description",
    `${plan.narrative}\n\n${rules.label}: ${rules.buyerLabel}. Creator fees go to holders. Launched with ${plan.cat.name} the ${plan.cat.breed} on PUPS.`,
  );
  if (plan.twitter) form.append("twitter", plan.twitter);
  const metaRes = await fetch("/api/metadata", { method: "POST", body: form });
  if (!metaRes.ok) {
    const problem = (await metaRes.json().catch(() => ({}))) as { error?: string };
    throw new LaunchError(problem.error ?? "The image and description could not be uploaded. Try again.");
  }
  const { metadataUri } = (await metaRes.json()) as { metadataUri: string };

  const result = await launchOnPump(connection, wallet, {
    name: plan.name,
    symbol: plan.symbol,
    metadataUri,
    style: plan.style,
    devBuySol: plan.devBuySol,
  });

  return result;
}
