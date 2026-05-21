import "dotenv/config";
import { access } from "node:fs/promises";
import { parseWalletList } from "./config.js";

type Check = {
  id: string;
  label: string;
  status: "ready" | "blocked" | "warning";
  detail: string;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function hasMint(value: string): boolean {
  return value.length >= 32;
}

function allocationTotal(): number {
  const flashLongBps = Number(env("FLASH_LONG_BPS") || 0);
  return Number(env("SOL_ZEC_BPS") || 0) + flashLongBps + Number(env("HOLDER_AIRDROP_BPS") || 0);
}

async function main(): Promise<void> {
  const holderSnapshotPath = env("HOLDER_SNAPSHOT_PATH") || "./data/holders-snapshot.json";
  const ledgerPath = env("LEDGER_PATH") || "./data/runs.jsonl";
  const publicEngineDataPath = env("PUBLIC_ENGINE_DATA_PATH") || "./public/runtime/engine.json";
  const tokenMint = env("PROJECT_TOKEN_MINT");
  const publicCa = env("VITE_ZEC3_CONTRACT_ADDRESS");
  const excludedWallets = parseWalletList(env("HOLDER_EXCLUDED_WALLETS"));
  const totalBps = allocationTotal();

  const checks: Check[] = [
    {
      id: "token-mint",
      label: "Project token mint",
      status: hasMint(tokenMint) ? "ready" : "blocked",
      detail: hasMint(tokenMint) ? "PROJECT_TOKEN_MINT is set." : "Set PROJECT_TOKEN_MINT after ZEC3 launches."
    },
    {
      id: "public-contract-address",
      label: "Public contract address",
      status: hasMint(publicCa) ? "ready" : "blocked",
      detail: hasMint(publicCa) ? "VITE_ZEC3_CONTRACT_ADDRESS is set." : "Set VITE_ZEC3_CONTRACT_ADDRESS for the site."
    },
    {
      id: "signer",
      label: "Creator signer",
      status: env("CREATOR_KEYPAIR_PATH") || env("CREATOR_PRIVATE_KEY_BASE58") ? "ready" : "blocked",
      detail: "One creator signer source must be configured before fee collection."
    },
    {
      id: "rpc",
      label: "Solana RPC",
      status: env("SOLANA_RPC_URL").startsWith("http") ? "ready" : "blocked",
      detail: env("SOLANA_RPC_URL").startsWith("http") ? "RPC URL is configured." : "Set SOLANA_RPC_URL."
    },
    {
      id: "allocations",
      label: "Allocation limits",
      status: totalBps <= 10_000 ? "ready" : "blocked",
      detail: `Configured allocation total is ${totalBps} bps.`
    },
    {
      id: "birdeye",
      label: "Holder data provider",
      status: env("BIRDEYE_API_KEY") ? "ready" : "warning",
      detail: env("BIRDEYE_API_KEY") ? "Birdeye API key is present." : "Add BIRDEYE_API_KEY before fetching holder snapshots."
    },
    {
      id: "flash-perps",
      label: "Flash Trade",
      status: env("FLASH_PERPS_ENABLED") === "true" ? "warning" : "warning",
      detail:
        env("FLASH_PERPS_ENABLED") === "true"
          ? `Flash routing selected for ${env("FLASH_PERPS_MARKET") || "ZEC"} through ${env("FLASH_POOL") || "Crypto.1"}; confirm collateral routing before live orders.`
          : "Flash perps execution is disabled; spot ZEC routing remains available."
    },
    {
      id: "exclusions",
      label: "Holder exclusions",
      status: excludedWallets.length > 0 ? "ready" : "warning",
      detail: excludedWallets.length > 0 ? `${excludedWallets.length} excluded wallet(s) configured.` : "Add LP, treasury, team, and burn wallets before airdrops."
    },
    {
      id: "holder-snapshot",
      label: "Holder snapshot artifact",
      status: (await exists(holderSnapshotPath)) ? "ready" : "blocked",
      detail: (await exists(holderSnapshotPath)) ? holderSnapshotPath : "Run npm run holders:snapshot after launch."
    },
    {
      id: "ledger",
      label: "Engine ledger artifact",
      status: (await exists(ledgerPath)) ? "ready" : "warning",
      detail: (await exists(ledgerPath)) ? ledgerPath : "No run ledger exists yet. This is expected before the first dry-run."
    },
    {
      id: "dashboard-data",
      label: "Dashboard runtime data",
      status: (await exists(publicEngineDataPath)) ? "ready" : "warning",
      detail: (await exists(publicEngineDataPath)) ? publicEngineDataPath : "Run npm run dashboard:sync after dry-runs."
    }
  ];

  const summary = {
    ready: checks.filter((check) => check.status === "ready").length,
    warnings: checks.filter((check) => check.status === "warning").length,
    blocked: checks.filter((check) => check.status === "blocked").length,
    checks
  };

  console.log(JSON.stringify(summary, null, 2));

  if (process.argv.includes("--strict") && summary.blocked > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
