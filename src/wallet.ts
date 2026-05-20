import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

export function loadSolanaKeypair(options: {
  keypairPath?: string;
  privateKeyBase58?: string;
}): Keypair {
  if (options.privateKeyBase58) {
    return Keypair.fromSecretKey(bs58.decode(options.privateKeyBase58));
  }

  if (!options.keypairPath) {
    throw new Error("Missing keypair path.");
  }

  const raw = readFileSync(options.keypairPath, "utf8");
  const bytes = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}
