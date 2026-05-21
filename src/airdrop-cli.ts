import { loadConfig } from "./config.js";
import { syncEngineData } from "./dashboard-data.js";
import { executeAirdropPlan } from "./airdrop.js";
import { readAirdropDryRunPlan } from "./holders.js";
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

  if (liveSend && BigInt(balance) <= assignedLamports) {
    throw new Error(`Signer balance ${balance} lamports is not enough for ${assignedLamports} lamports plus fees.`);
  }

  const result = await executeAirdropPlan({
    connection,
    payer: signer,
    plan,
    commitment: config.COMMITMENT,
    dryRun: !liveSend
  });

  const ledger: RunLedger = {
    at: new Date().toISOString(),
    dryRun: !liveSend,
    creator: signer.publicKey.toBase58(),
    projectTokenMint: plan.tokenMint,
    holderAirdrop: {
      source: "holder-airdrop-plan",
      status: liveSend ? "sent" : "dry-run",
      inputLamports: plan.inputLamports,
      totalAssignedLamports: plan.totalAssignedLamports,
      totalSentLamports: result.totalSentLamports,
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
    ...result
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
