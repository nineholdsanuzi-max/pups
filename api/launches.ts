/**
 * GET  /api/launches             -> the launch board, newest first
 * POST /api/launches             body: { entry, signature? }
 *
 * An entry with a contract address is only marked verified if the signature is a
 * confirmed transaction that involves both that mint and the pump.fun program.
 * Entries without one are stored as unverified plans; decide in the GET handler
 * whether your board shows those.
 */
import { isNameAllowed, store } from "../server/launchStore";
import { allow, visitor } from "../server/rateLimit";

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_ENTRY_CHARS = 8_000;

async function isRealPumpLaunch(mint: string, signature: string): Promise<boolean> {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return false;
  // Loaded here, not at the top, so a problem with the Solana library can't take the whole board down.
  const { Connection } = await import("@solana/web3.js");
  const connection = new Connection(rpc, "confirmed");
  // A transaction that was confirmed a second ago is not always readable yet, so try a few times.
  let tx = null;
  for (let attempt = 0; attempt < 5 && !tx; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  }
  if (!tx || tx.meta?.err) return false;
  const keys = tx.transaction.message
    .getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
    .keySegments()
    .flat()
    .map((k) => k.toBase58());
  return keys.includes(mint) && keys.includes(PUMP_PROGRAM);
}

/** Turns any crash into a readable answer, so the page can show the real reason instead of a bare "500". */
function failure(where: string, err: unknown): Response {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`PUPS board: ${where} failed`, err);
  return Response.json({ error: `${where} failed: ${reason}`.slice(0, 300) }, { status: 500 });
}

export async function GET(): Promise<Response> {
  try {
    return await listBoard();
  } catch (err) {
    return failure("reading the board", err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    return await saveToBoard(req);
  } catch (err) {
    return failure("saving to the board", err);
  }
}

async function listBoard(): Promise<Response> {
  const launches = await store.list(80);
  // By default the board shows plans as well as real launches; a plan has no contract address,
  // so its coin page says "Not deployed". Set BOARD_VERIFIED_ONLY=1 to list only coins proven on-chain.
  const verifiedOnly = ["1", "true"].includes(String(process.env.BOARD_VERIFIED_ONLY ?? "").toLowerCase());
  return Response.json(launches.filter((l) => l.verified || !verifiedOnly).map((l) => l.entry));
}

async function saveToBoard(req: Request): Promise<Response> {
  // A real launch costs the launcher money, so it limits itself. This cap is here to stop plan spam.
  const perHour = Number(process.env.BOARD_POSTS_PER_HOUR ?? 30);
  if (!(await allow(`post:${visitor(req)}`, perHour, 3600))) {
    return Response.json({ error: `the limit is ${perHour} board posts an hour from one visitor; try again later` }, { status: 429 });
  }
  let body: { entry?: unknown; signature?: unknown };
  try {
    body = (await req.json()) as { entry?: unknown; signature?: unknown };
  } catch {
    return Response.json({ error: "Send JSON with an entry." }, { status: 400 });
  }
  const entry = body.entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry) || JSON.stringify(entry).length > MAX_ENTRY_CHARS) {
    return Response.json({ error: "Send one launch board entry." }, { status: 400 });
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.name !== "string" || typeof e.catName !== "string" || !isNameAllowed(e.name) || !isNameAllowed(e.catName)) {
    return Response.json({ error: "That coin or cat name can't be shown on the board." }, { status: 422 });
  }

  let verified = false;
  if (typeof e.mint === "string" && ADDRESS.test(e.mint) && typeof body.signature === "string") {
    let already = false;
    try {
      already = await store.hasMint(e.mint);
    } catch (err) {
      console.error("PUPS board: could not check for a duplicate", err);
    }
    if (already) return Response.json({ error: "That coin is already on the board." }, { status: 409 });
    try {
      verified = await isRealPumpLaunch(e.mint, body.signature);
      if (verified) e.sig = body.signature; // shown on the coin page as proof of launch
    } catch (err) {
      // Usually the RPC refusing the server: a missing SOLANA_RPC_URL, or a key locked to a website domain.
      console.error("PUPS board: could not check a launch on-chain", err);
      verified = false;
    }
  } else {
    delete e.mint; // an address nobody proved is not shown as a contract address
    delete e.sig;
    delete e.vest;
    delete e.vestSig;
  }

  e.ts = Date.now();
  delete e.sample;
  delete e.local;
  try {
    await store.add({ entry: e, verified, savedAt: Date.now() });
  } catch (err) {
    console.error("PUPS board: could not save a launch", err);
    return Response.json({ error: `the board's database did not accept the entry: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) }, { status: 500 });
  }
  // "hidden" tells the page the entry was stored but will not be listed, so it can say so instead of failing silently.
  const verifiedOnly = ["1", "true"].includes(String(process.env.BOARD_VERIFIED_ONLY ?? "").toLowerCase());
  return Response.json({ ok: true, verified, hidden: verifiedOnly && !verified });
}
