/**
 * POST /api/metadata
 *
 * Takes the coin's image, name, ticker and description and returns a
 * metadata link for the create transaction. Runs on your server because
 * the upload endpoint does not accept calls from other sites' browsers.
 *
 * Written as a standard Request -> Response handler (Next.js route handler,
 * Cloudflare Worker, Bun, Deno).
 *
 * UNVERIFIED: https://pump.fun/api/ipfs is the upload endpoint pump.fun's own
 * site uses and most third-party launchers call, but it is not a documented
 * public API and I could not test it. If it rejects you, swap `upload()` for
 * any IPFS pinning service: the launch only needs a public link to a JSON
 * file shaped { name, symbol, description, image }.
 */
/** Every coin launched through PUPS carries this website. It is set here, on the server, so a visitor cannot change it. */
const WEBSITE = "https://www.pupscompanions.com/";
/** The launcher may add one X (Twitter) link of their own. */
const X_LINK = /^https:\/\/x\.com\/[A-Za-z0-9_\/?=&.-]{1,180}$/;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

async function upload(form: FormData): Promise<string> {
  const res = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Metadata upload failed with status ${res.status}`);
  const data = (await res.json()) as { metadataUri?: string };
  if (!data.metadataUri) throw new Error("Metadata upload returned no link");
  return data.metadataUri;
}

export async function POST(req: Request): Promise<Response> {
  const input = await req.formData();
  const file = input.get("file");
  const name = String(input.get("name") ?? "").trim();
  const symbol = String(input.get("symbol") ?? "").trim().toUpperCase();
  const description = String(input.get("description") ?? "").trim().slice(0, 1000);
  const twitter = String(input.get("twitter") ?? "").trim();
  if (twitter && !X_LINK.test(twitter)) {
    return Response.json({ error: "The X link must look like https://x.com/yourname." }, { status: 400 });
  }

  if (!(file instanceof File) || !IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Send a PNG, JPEG, GIF or WebP image under 4 MB." }, { status: 400 });
  }
  if (!name || name.length > 32 || !symbol || symbol.length > 10) {
    return Response.json({ error: "Name must be 1 to 32 characters and ticker 1 to 10." }, { status: 400 });
  }

  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("symbol", symbol);
  form.append("description", description);
  form.append("showName", "true");
  form.append("website", WEBSITE); // always PUPS, on every launch; anything the browser sent for this is ignored
  if (twitter) form.append("twitter", twitter);

  try {
    return Response.json({ metadataUri: await upload(form) });
  } catch {
    return Response.json({ error: "The upload service did not accept the coin's image and description." }, { status: 502 });
  }
}
