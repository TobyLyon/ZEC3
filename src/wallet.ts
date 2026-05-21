import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

export function loadSolanaKeypair(options: {
  keypairPath?: string;
  privateKeyBase58?: string;
}): Keypair {
  if (options.keypairPath) {
    const raw = readFileSync(options.keypairPath, "utf8");
    const bytes = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }

  if (options.privateKeyBase58) {
    return Keypair.fromSecretKey(bs58.decode(options.privateKeyBase58));
  }

  throw new Error("Set CREATOR_KEYPAIR_PATH or CREATOR_PRIVATE_KEY_BASE58.");
}
