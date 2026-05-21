import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "./config.js";
import { syncEngineData } from "./dashboard-data.js";
import { executeAirdropPlan } from "./airdrop.js";
import { WSOL_MINT } from "./constants.js";
import { readAirdropDryRunPlan } from "./holders.js";
import { getJupiterQuote, swapWithJupiter } from "./jupiter.js";
import { appendLedger } from "./ledger.js";
import { createConnection } from "./solana.js";
import { loadSolanaKeypair } from "./wallet.js";
import type { RunLedger } from "./types.js";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const cliDryRun = hasFlag("--dry-run");
  const confirmLive = hasFlag("--confirm-live-airdrop");
  const config = loadConfig(cliDryRun ? ["node", "airdrop-cli", "--dry-run"] : process.argv);
  const liveSend = !cliDryRun && !config.DRY_RUN && !config.AIRDROP_DRY_RUN;

  if (liveSend && !confirmLive) {
    throw new Error("Live airdrop requires --confirm-live-airdrop.");
  }

  const plan = await readAirdropDryRunPlan(config.AIRDROP_DRY_RUN_PATH);
  if (config.PROJECT_TOKEN_MINT && plan.tokenMint !== config.PROJECT_TOKEN_MINT) {
    throw new Error(`Airdrop plan token mint ${plan.tokenMint} does not match PROJECT_TOKEN_MINT.`);
  }
  if (!config.PROJECT_TOKEN_MINT && liveSend) {
    throw new Error("Set PROJECT_TOKEN_MINT before live airdrop execution.");
  }

  const signer = loadSolanaKeypair({
    keypairPath: config.CREATOR_KEYPAIR_PATH,
    privateKeyBase58: config.CREATOR_PRIVATE_KEY_BASE58
  });
  const connection = createConnection(config.SOLANA_RPC_URL, config.COMMITMENT);
  const assignedLamports = BigInt(plan.totalAssignedLamports);
  const balance = await connection.getBalance(signer.publicKey, config.COMMITMENT);
  const distributeZec = config.AIRDROP_DISTRIBUTION_ASSET === "ZEC";

  if (liveSend && BigInt(balance) <= assignedLamports) {
    throw new Error(`Signer balance ${balance} lamports is not enough for ${assignedLamports} lamports plus fees.`);
  }

  let zecDistribution:
    | {
        mint: PublicKey;
        amountRaw: bigint;
        swap?: { signature?: string; outputAmount: bigint; priceImpactPct: string };
      }
    | undefined;

  if (distributeZec) {
    const mint = new PublicKey(config.AIRDROP_DISTRIBUTION_TOKEN_MINT);
    const quote = await getJupiterQuote({
      inputMint: WSOL_MINT,
      outputMint: mint.toBase58(),
      amount: assignedLamports,
      slippageBps: config.JUPITER_SLIPPAGE_BPS
    });
    const swap = await swapWithJupiter({
      connection,
      signer,
      quote,
      dryRun: !liveSend
    });
    zecDistribution = {
      mint,
      amountRaw: swap.outputAmount,
      swap
    };
  }

  const result = await executeAirdropPlan({
    connection,
    payer: signer,
    plan,
    commitment: config.COMMITMENT,
    dryRun: !liveSend,
    distribution: zecDistribution
      ? {
          asset: "SPL_TOKEN",
          mint: zecDistribution.mint,
          amountRaw: zecDistribution.amountRaw
        }
      : { asset: "SOL" }
  });

  const ledger: RunLedger = {
    at: new Date().toISOString(),
    dryRun: !liveSend,
    creator: signer.publicKey.toBase58(),
    projectTokenMint: plan.tokenMint,
    holderAirdrop: {
      source: "holder-airdrop-plan",
      status: liveSend ? "sent" : "dry-run",
      distributionAsset: distributeZec ? "ZEC" : "SOL",
      distributionMint: zecDistribution?.mint.toBase58(),
      inputLamports: plan.inputLamports,
      totalAssignedLamports: plan.totalAssignedLamports,
      zecSwap: zecDistribution?.swap
        ? {
            signature: zecDistribution.swap.signature,
            outputAmount: zecDistribution.swap.outputAmount.toString(),
            priceImpactPct: zecDistribution.swap.priceImpactPct
          }
        : undefined,
      totalSentLamports: result.totalSentLamports,
      totalSentTokenAmount: result.totalSentTokenAmount,
      remainderLamports: plan.remainderLamports,
      recipientCount: plan.recipientCount,
      skippedRecipients: result.skippedRecipients,
      batches: result.batches
    }
  };

  await appendLedger(config.LEDGER_PATH, ledger);
  await syncEngineData({
    ledgerPath: config.LEDGER_PATH,
    snapshotPath: config.HOLDER_SNAPSHOT_PATH,
    outputPath: config.PUBLIC_ENGINE_DATA_PATH,
    projectTokenMint: config.PROJECT_TOKEN_MINT,
    dryRun: config.DRY_RUN
  });

  console.log(JSON.stringify({
    ok: true,
    live: liveSend,
    payer: signer.publicKey.toBase58(),
    planPath: config.AIRDROP_DRY_RUN_PATH,
    distributionAsset: distributeZec ? "ZEC" : "SOL",
    distributionMint: zecDistribution?.mint.toBase58(),
    ...result
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
