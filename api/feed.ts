/**
 * GET /api/feed?mint=<contract address>&since=<unix ms>
 * Everything that happened to a coin since `since`, oldest first. See server/coinFeed.ts.
 * The page polls this for each coin a pup is following.
 */
import { fetchCoinEvents, FeedNotConfiguredError } from "../server/coinFeed";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const mint = params.get("mint") ?? "";
  const since = Number(params.get("since") ?? "0");
  if (!ADDRESS.test(mint) || !Number.isFinite(since) || since < 0) {
    return Response.json({ error: "Send a contract address and a since time." }, { status: 400 });
  }
  try {
    const events = await fetchCoinEvents(mint, since);
    return Response.json(events.sort((a, b) => a.ts - b.ts).slice(-50));
  } catch (err) {
    if (err instanceof FeedNotConfiguredError) {
      return Response.json({ error: "The live coin feed is not set up on this server yet." }, { status: 501 });
    }
    return Response.json({ error: "The trade source did not answer." }, { status: 502 });
  }
}
