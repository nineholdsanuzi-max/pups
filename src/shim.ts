/** The Solana libraries expect a couple of Node globals to exist in the browser. */
import { Buffer } from "buffer";
export { Buffer };
export const process = { env: {} as Record<string, string | undefined>, browser: true, version: "", versions: {} as Record<string, string>, nextTick: (fn: () => void) => { setTimeout(fn, 0); } };
