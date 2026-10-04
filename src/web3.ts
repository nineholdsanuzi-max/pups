/**
 * Loads the Solana library only when it is needed.
 * The bundler can hand this library back wrapped inside a `default` field,
 * so both shapes are handled here, once, instead of at every call site.
 */
type Web3 = typeof import("@solana/web3.js");

export async function loadWeb3(): Promise<Web3> {
  const mod = (await import("@solana/web3.js")) as Web3 & { default?: Web3 };
  const lib = typeof mod.Connection === "function" ? mod : mod.default;
  if (!lib || typeof lib.Connection !== "function") throw new Error("The Solana library did not load. Reload the page and try again.");
  return lib;
}
