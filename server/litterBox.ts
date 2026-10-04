/**
 * PUPS: Golden Bone, the weekly prize.
 *
 * `pickWinner` works. Paying the winner is NOT IMPLEMENTED, on purpose:
 * it means sending SOL from the wallet that holds PUPS's creator fees, and
 * whatever holds that key can drain it. Options, safest first:
 *   1. Pay by hand each Monday from your own wallet, using pickWinner's answer.
 *   2. Run a separate script on a machine you control, with the key kept off this web server.
 * Do not put that key in this server's environment unless you accept that a
 * break-in here empties the prize wallet.
 */
import { previousWeekKey, votes } from "./voteStore";

export interface Winner {
  week: string;
  /** The winning launch's id on the board. For real launches this is its contract address. */
  entryId: string;
  votes: number;
  /** True when two or more launches tied on votes. The first one found is returned; decide your own tie rule. */
  tied: boolean;
}

/** The most-voted launch of the week that just ended, or null if nobody voted. */
export async function pickWinner(week: string = previousWeekKey()): Promise<Winner | null> {
  const tally = await votes.tally(week);
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const [entryId, count] = ranked[0];
  return { week, entryId, votes: count, tied: ranked.length > 1 && ranked[1][1] === count };
}

export class PayoutNotConfiguredError extends Error {}

/**
 * Work out who to pay and how much, then pay them.
 * The launcher's wallet is the fee payer of the winning launch's transaction
 * (stored with the board entry as `sig`); look it up on-chain rather than trusting the page.
 */
export async function payWinner(winner: Winner): Promise<never> {
  void winner;
  throw new PayoutNotConfiguredError("Golden Bone payouts are not set up. See the note at the top of server/litterBox.ts.");
}
