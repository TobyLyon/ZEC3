import { loadConfig, parseWalletList } from "./config.js";
import { createConnection } from "./solana.js";
import {
  buildAirdropDryRunPlan,
  fetchBirdeyeHolderSnapshot,
  fetchRpcHolderSnapshot,
  readHolderSnapshot,
  writeAirdropDryRunPlan,
  writeHolderSnapshot
} from "./holders.js";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function snapshot(): Promise<void> {
  const config = loadConfig(["node", "holders-cli", "--dry-run"]);
  const topHoldersArg = readArg("top");
  const baseOptions = {
    tokenMint: config.PROJECT_TOKEN_MINT,
    minBalanceUi: config.HOLDER_SNAPSHOT_MIN_BALANCE,
    excludedWallets: parseWalletList(config.HOLDER_EXCLUDED_WALLETS)
  };
  let holderSnapshot;

  if (config.HOLDER_SNAPSHOT_PROVIDER === "birdeye") {
    try {
      holderSnapshot = await fetchBirdeyeHolderSnapshot({
        ...baseOptions,
        apiKey: config.BIRDEYE_API_KEY ?? "",
        topHolders: topHoldersArg ? Number(topHoldersArg) : undefined
      });
    } catch (error) {
      console.warn(`Birdeye snapshot unavailable, falling back to Solana RPC: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!holderSnapshot) {
    holderSnapshot = await fetchRpcHolderSnapshot({
      ...baseOptions,
      connection: createConnection(config.SOLANA_RPC_URL, config.COMMITMENT)
    });
  }

  await writeHolderSnapshot(config.HOLDER_SNAPSHOT_PATH, holderSnapshot);
  console.log(JSON.stringify({
    ok: true,
    path: config.HOLDER_SNAPSHOT_PATH,
    source: holderSnapshot.source,
    totalFetched: holderSnapshot.totalFetched,
    totalEligible: holderSnapshot.totalEligible,
    totalBalanceUi: holderSnapshot.totalBalanceUi
  }, null, 2));
}

async function dryRun(): Promise<void> {
  const config = loadConfig(["node", "holders-cli", "--dry-run"]);
  const amountArg = readArg("amount-lamports");
  const amountLamports = amountArg ? BigInt(amountArg) : config.AIRDROP_DRY_RUN_LAMPORTS;
  const holderSnapshot = await readHolderSnapshot(config.HOLDER_SNAPSHOT_PATH);
  const plan = buildAirdropDryRunPlan(holderSnapshot, amountLamports);
  await writeAirdropDryRunPlan(config.AIRDROP_DRY_RUN_PATH, plan);
  console.log(JSON.stringify({
    ok: true,
    path: config.AIRDROP_DRY_RUN_PATH,
    snapshotPath: config.HOLDER_SNAPSHOT_PATH,
    inputLamports: plan.inputLamports,
    totalAssignedLamports: plan.totalAssignedLamports,
    remainderLamports: plan.remainderLamports,
    recipientCount: plan.recipientCount
  }, null, 2));
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "snapshot";
  if (command === "snapshot") {
    await snapshot();
    return;
  }
  if (command === "dry-run") {
    await dryRun();
    return;
  }
  throw new Error(`Unknown holder command "${command}". Use "snapshot" or "dry-run".`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
