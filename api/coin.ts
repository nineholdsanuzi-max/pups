/**
 * GET /api/coin?address=<contract address>
 * Returns live numbers for the page's scour dashboard. See server/coinProvider.ts.
 */
import { CoinNotFoundError, fetchCoinData, NotConfiguredError } from "../server/coinProvider";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: Request): Promise<Response> {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!ADDRESS.test(address)) {
    return Response.json({ error: "Send a Solana contract address." }, { status: 400 });
  }
  try {
    return Response.json(await fetchCoinData(address));
  } catch (err) {
    if (err instanceof CoinNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof NotConfiguredError) {
      return Response.json({ error: "Live coin data is not set up on this server yet." }, { status: 501 });
    }
    return Response.json({ error: "The market-data provider did not answer." }, { status: 502 });
  }
}
