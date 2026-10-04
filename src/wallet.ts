/**
 * PUPS: find and connect the visitor's Solana wallet.
 * Works with wallets that inject a provider (Phantom, Solflare, Backpack).
 * Swap this file for @solana/wallet-adapter if you want a wallet picker.
 */
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { WalletLike } from "./pumpLaunch";
import { loadWeb3 } from "./web3";

interface InjectedProvider {
  publicKey: { toBase58(): string } | null;
  connect(): Promise<unknown>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signMessage?(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
}

function injected(): InjectedProvider | null {
  const w = window as unknown as {
    phantom?: { solana?: InjectedProvider };
    solflare?: InjectedProvider;
    backpack?: InjectedProvider;
  };
  return w.phantom?.solana ?? w.solflare ?? w.backpack ?? null;
}

export class NoWalletError extends Error {}

/**
 * Asks the wallet to sign a plain message (no transaction, no fee). Used to prove
 * a vote comes from the wallet it claims to. Returns the address and the signature.
 */
export async function signWithWallet(message: string): Promise<{ address: string; signature: number[] }> {
  const provider = injected();
  if (!provider || !provider.signMessage) throw new NoWalletError("This wallet can't sign messages, which voting needs.");
  await provider.connect();
  if (!provider.publicKey) throw new NoWalletError("The wallet did not share an address.");
  const out = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  const signature = out instanceof Uint8Array ? out : out.signature;
  return { address: provider.publicKey.toBase58(), signature: Array.from(signature) };
}

/** Asks the wallet to connect (the wallet shows its own prompt) and returns what the launch code needs. */
export async function connectWallet(): Promise<WalletLike> {
  const provider = injected();
  if (!provider) throw new NoWalletError("No Solana wallet found. Install Phantom or Solflare to launch.");
  await provider.connect();
  if (!provider.publicKey) throw new NoWalletError("The wallet did not share an address.");
  const { PublicKey } = await loadWeb3();
  const publicKey = new PublicKey(provider.publicKey.toBase58());
  return {
    publicKey,
    signTransaction: (tx) => provider.signTransaction(tx),
  };
}
