/**
 * PUPS: vest the creator's first buy.
 *
 * pump.fun has no vesting, so this runs straight after a launch: it moves the
 * tokens the creator just bought into a public lock (the Jupiter Lock program,
 * through Meteora's SDK). Nothing unlocks before the cliff, and the rest is
 * released in equal steps afterwards. The lock cannot be cancelled and the
 * recipient cannot be changed, by anyone.
 *
 * It only locks what the connected wallet holds of this coin. It cannot lock
 * other buyers' tokens. It needs its own wallet approval after the launch.
 */
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import { CancelMode, LockClient, UpdateRecipientMode, deriveEscrow } from "@meteora-ag/met-lock-sdk";
import type { WalletLike } from "./pumpLaunch";

export interface VestSchedule {
  /** Days before anything unlocks. */
  cliffDays: number;
  /** Days over which the tokens are released after the cliff. */
  vestDays: number;
  /** How many equal releases happen over vestDays. */
  periods: number;
}

export interface VestResult {
  /** The public lock account. Anyone can look it up to check the schedule. */
  escrow: string;
  signature: string;
  /** Raw token amount locked (smallest units). */
  amount: string;
}

export class VestError extends Error {}

export async function vestFirstBuy(
  connection: Connection,
  wallet: WalletLike,
  mint: PublicKey,
  schedule: VestSchedule,
): Promise<VestResult> {
  const user = wallet.publicKey;
  if (!user) throw new VestError("Connect a wallet to vest tokens.");
  if (schedule.periods < 1 || schedule.vestDays <= 0 || schedule.cliffDays < 0) {
    throw new VestError("The vesting schedule is not valid.");
  }

  // pump.fun creates Token-2022 coins, but read the owner so an older coin still works.
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo) throw new VestError("The coin isn't visible on-chain yet. Try again in a moment.");
  const tokenProgram = mintInfo.owner;

  const account = getAssociatedTokenAddressSync(mint, user, false, tokenProgram);
  let amount: BN;
  try {
    amount = new BN((await connection.getTokenAccountBalance(account, "confirmed")).value.amount);
  } catch {
    throw new VestError("This wallet holds none of this coin, so there is nothing to vest.");
  }
  if (amount.isZero()) throw new VestError("This wallet holds none of this coin, so there is nothing to vest.");

  const slot = await connection.getSlot("confirmed");
  const now = (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  const periods = new BN(schedule.periods);
  const amountPerPeriod = amount.div(periods);
  // Whatever doesn't divide evenly unlocks at the cliff, so the lock holds the exact balance.
  const cliffUnlockAmount = amount.sub(amountPerPeriod.mul(periods));
  const frequency = new BN(Math.max(1, Math.floor((schedule.vestDays * 86_400) / schedule.periods)));

  const base = Keypair.generate();
  const client = new LockClient(connection, "confirmed");
  const tx: Transaction = await client.createVestingEscrowV2({
    base: base.publicKey,
    sender: user,
    isSenderMultiSig: false,
    payer: user,
    tokenMint: mint,
    vestingStartTime: new BN(now),
    cliffTime: new BN(now + Math.round(schedule.cliffDays * 86_400)),
    frequency,
    cliffUnlockAmount,
    amountPerPeriod,
    numberOfPeriod: periods,
    recipient: user,
    updateRecipientMode: UpdateRecipientMode.NONE,
    cancelMode: CancelMode.NONE,
    tokenProgram,
  });

  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = user;
  tx.recentBlockhash = latest.blockhash;

  // The wallet signs first, then the one-time base key (same order as the launch).
  const signed = await wallet.signTransaction(tx);
  signed.partialSign(base);

  const signature = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
  const result = await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) throw new VestError(`The vesting transaction failed on-chain: ${JSON.stringify(result.value.err)}`);

  return { escrow: deriveEscrow(base.publicKey).toBase58(), signature, amount: amount.toString() };
}
