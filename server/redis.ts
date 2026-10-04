/**
 * PUPS: a tiny client for Upstash Redis over its REST API.
 *
 * Add "Upstash for Redis" to the project from Vercel's Storage tab and the
 * environment variables below are filled in for you. Without them, every
 * store in server/ falls back to memory, which is lost on each restart.
 */
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";

export const hasRedis = Boolean(url && token);

/** Runs one Redis command, e.g. redis("LPUSH", "key", "value"). */
export async function redis<T = unknown>(...command: (string | number)[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`the database refused "${command[0]}": ${body.error ?? `status ${res.status}`}`);
  return body.result as T;
}
