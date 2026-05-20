import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { JUPITER_QUOTE_URL, JUPITER_SWAP_URL } from "./constants.js";
import { sendSignedVersionedTransaction } from "./solana.js";
import type { Connection } from "@solana/web3.js";

type JupiterQuote = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  priceImpactPct: string;
  routePlan: unknown[];
};

export async function getJupiterQuote(options: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
}): Promise<JupiterQuote> {
  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set("inputMint", options.inputMint);
  url.searchParams.set("outputMint", options.outputMint);
  url.searchParams.set("amount", options.amount.toString());
  url.searchParams.set("slippageBps", options.slippageBps.toString());

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Jupiter quote failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as JupiterQuote;
}

export async function swapWithJupiter(options: {
  connection: Connection;
  signer: Keypair;
  quote: JupiterQuote;
  dryRun: boolean;
}): Promise<{ signature?: string; outputAmount: bigint; priceImpactPct: string }> {
  if (options.dryRun) {
    return {
      outputAmount: BigInt(options.quote.outAmount),
      priceImpactPct: options.quote.priceImpactPct
    };
  }

  const response = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: options.quote,
      userPublicKey: options.signer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto"
    })
  });

  if (!response.ok) {
    throw new Error(`Jupiter swap failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { swapTransaction: string };
  const tx = VersionedTransaction.deserialize(Buffer.from(data.swapTransaction, "base64"));
  tx.sign([options.signer]);
  const signature = await sendSignedVersionedTransaction(options.connection, tx);

  return {
    signature,
    outputAmount: BigInt(options.quote.outAmount),
    priceImpactPct: options.quote.priceImpactPct
  };
}
