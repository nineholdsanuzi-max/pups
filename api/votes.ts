/**
 * GET  /api/votes   -> { week, now: {launchId: count}, prev: {launchId: count} }
 * POST /api/votes   body: { entryId, week, address, signature }
 *
 * Golden Bone voting. One vote per wallet per week. The wallet proves it
 * is voting by signing a plain message (no transaction, no fee):
 *   "PUPS Golden Bone vote\nlaunch: <entryId>\nweek: <week>"
 *
 * One wallet, one vote does not stop one person using many wallets. Set
 * LITTER_MIN_PUPS in the server environment to require a PUPS balance and fill in
 * `holdsEnoughPaws` below, which is NOT IMPLEMENTED.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";

/** Minimum PUPS a wallet must hold for its vote to count. Set LITTER_MIN_PUPS on the server. 0 lets any wallet vote. */
const LITTER_MIN_PUPS = Number(process.env.LITTER_MIN_PUPS ?? 0);
import { previousWeekKey, votes, weekKey } from "../server/voteStore";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function holdsEnoughPaws(address: string): Promise<boolean> {
  if (LITTER_MIN_PUPS <= 0) return true;
  // NOT IMPLEMENTED: read this wallet's PUPS balance with SOLANA_RPC_URL and compare it to LITTER_MIN_PUPS.
  void address;
  return false;
}

export async function GET(): Promise<Response> {
  const week = weekKey();
  const [now, prev] = await Promise.all([votes.tally(week), votes.tally(previousWeekKey())]);
  return Response.json({ week, now, prev });
}

export async function POST(req: Request): Promise<Response> {
  let body: { entryId?: unknown; week?: unknown; address?: unknown; signature?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Send JSON with entryId, week, address and signature." }, { status: 400 });
  }
  const { entryId, week, address, signature } = body;
  if (typeof entryId !== "string" || !entryId || entryId.length > 80 || typeof address !== "string" || !ADDRESS.test(address)) {
    return Response.json({ error: "Send the launch and the voting wallet." }, { status: 400 });
  }
  if (week !== weekKey()) {
    return Response.json({ error: "That vote is for a week that has closed. Try again." }, { status: 409 });
  }
  if (!Array.isArray(signature) || signature.length !== 64 || !signature.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return Response.json({ error: "The vote has no valid wallet signature." }, { status: 400 });
  }

  const message = new TextEncoder().encode(`PUPS Golden Bone vote\nlaunch: ${entryId}\nweek: ${week}`);
  let valid = false;
  try {
    valid = ed25519.verify(Uint8Array.from(signature as number[]), message, new PublicKey(address).toBytes());
  } catch {
    valid = false;
  }
  if (!valid) return Response.json({ error: "The wallet signature does not match this vote." }, { status: 401 });

  if (!(await holdsEnoughPaws(address))) {
    return Response.json({ error: "This wallet doesn't hold enough PUPS to vote." }, { status: 403 });
  }
  if (!(await votes.cast(week, address, entryId))) {
    return Response.json({ error: "This wallet has already voted this week." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
