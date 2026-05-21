import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import type { HolderSnapshot, RunLedger } from "./types.js";

type RuntimeStage = {
  label: string;
  status: "ready" | "active" | "queued" | "done";
  amount: string;
  subtext: string;
};

type RuntimeLedgerItem = {
  time: string;
  action: string;
  value: string;
  hash: string;
  chain: string;
};

type RuntimePosition = {
  id: string;
  asset: string;
  side: "long" | "short";
  status: "open" | "closed" | "pending";
  entryPrice: number;
  size: number;
  sizeUnit: string;
  notional: number;
  leverage: string;
  entryTime: string;
  stopLoss: number | null;
  takeProfit: number | null;
  source: string;
};

function formatSol(lamports?: string): string {
  if (!lamports) return "0 SOL";
  const sol = Number(BigInt(lamports)) / 1_000_000_000;
  if (sol === 0) return "0 SOL";
  if (sol < 0.001) return `${sol.toFixed(6)} SOL`;
  return `${sol.toFixed(4)} SOL`;
}

function shortHash(hash?: string): string {
  if (!hash) return "dry-run";
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readLedger(path: string): Promise<RunLedger[]> {
  if (!(await pathExists(path))) return [];
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunLedger);
}

async function readSnapshot(path: string): Promise<HolderSnapshot | null> {
  if (!(await pathExists(path))) return null;
  return JSON.parse(await readFile(path, "utf8")) as HolderSnapshot;
}

function ledgerRows(runs: RunLedger[]): RuntimeLedgerItem[] {
  const rows: RuntimeLedgerItem[] = [];

  for (const run of runs.slice(-10).reverse()) {
    const time = new Date(run.at).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    if (run.claim) {
      rows.push({
        time,
        action: run.dryRun ? "Fee claim dry-run" : "Claimed fees",
        value: formatSol(run.claim.claimedLamports),
        hash: shortHash(run.claim.signatureV1 ?? run.claim.signatureV2),
        chain: "Solana"
      });
    }
    if (run.solZec && typeof run.solZec === "object") {
      const result = run.solZec as { signature?: string; outputAmount?: string | bigint };
      rows.push({
        time,
        action: run.dryRun ? "ZEC swap dry-run" : "Bought ZEC",
        value: result.outputAmount ? String(result.outputAmount) : "quoted",
        hash: shortHash(result.signature),
        chain: "Jupiter"
      });
    }
    const longPlan = run.flashLong;
    if (longPlan && typeof longPlan === "object") {
      const result = longPlan as { status?: string; signature?: string; cappedNotionalUsdc?: number; venue?: string };
      rows.push({
        time,
        action: "ZEC long plan",
        value: result.cappedNotionalUsdc ? `$${result.cappedNotionalUsdc.toFixed(2)}` : "queued",
        hash: result.signature ? shortHash(result.signature) : result.status ?? "pending",
        chain: result.venue?.includes("Flash") ? "Flash" : "ZEC3"
      });
    }
    if (run.flashProfitPull && typeof run.flashProfitPull === "object") {
      const result = run.flashProfitPull as {
        status?: string;
        signature?: string;
        positionMultiple?: number;
        triggerMultiple?: number;
        venue?: string;
      };
      rows.push({
        time,
        action: "Profit pull",
        value: result.positionMultiple
          ? `${result.positionMultiple.toFixed(2)}x`
          : result.triggerMultiple
            ? `${result.triggerMultiple.toFixed(2)}x trigger`
            : "checked",
        hash: result.signature ? shortHash(result.signature) : result.status ?? "checked",
        chain: result.venue?.includes("Flash") ? "Flash" : "ZEC3"
      });
    }
    if (run.holderAirdrop && typeof run.holderAirdrop === "object") {
      const result = run.holderAirdrop as { inputLamports?: string; status?: string };
      rows.push({
        time,
        action: "Holder reserve",
        value: formatSol(result.inputLamports),
        hash: result.status ?? "reserved",
        chain: "ZEC3"
      });
    }
  }

  return rows.slice(0, 20);
}

function runtimePositions(runs: RunLedger[]): RuntimePosition[] {
  const latestWithLong = [...runs].reverse().find((run) => run.flashLong);
  const longPlan = latestWithLong?.flashLong;
  if (!latestWithLong || !longPlan || typeof longPlan !== "object") return [];

  const long = longPlan as {
    cappedNotionalUsdc?: number;
    leverage?: number;
    status?: string;
    venue?: string;
  };

  return [{
    id: `zec-long-${latestWithLong.at}`,
    asset: "ZEC",
    side: "long",
    status: "pending",
    entryPrice: 0,
    size: long.cappedNotionalUsdc ?? 0,
    sizeUnit: "USD",
    notional: long.cappedNotionalUsdc ?? 0,
    leverage: `${long.leverage ?? 1}x`,
    entryTime: latestWithLong.at,
    stopLoss: null,
    takeProfit: null,
    source: long.venue ? `${long.venue}: ${long.status ?? "planned"}` : long.status ?? "planned"
  }];
}

function runtimeStages(latest: RunLedger | undefined, snapshot: HolderSnapshot | null, positions: RuntimePosition[]): RuntimeStage[] {
  const claimed = latest?.claim?.claimedLamports;
  const airdrop = latest?.holderAirdrop as { inputLamports?: string; status?: string } | undefined;
  const long = latest?.flashLong as
    | { status?: string; cappedNotionalUsdc?: number; venue?: string }
    | undefined;
  const latestPosition = positions.at(0);
  const longAmount = long?.cappedNotionalUsdc
    ? `$${long.cappedNotionalUsdc.toFixed(2)}`
    : latestPosition
      ? `$${latestPosition.notional.toFixed(2)}`
      : "Planned";
  const longSubtext = long?.venue
    ? `${long.venue}: ${long.status ?? "planned"}`
    : latestPosition?.source ?? "Perps execution gated";

  return [
    {
      label: "Claim Fees",
      status: latest?.claim ? "done" : "ready",
      amount: latest?.claim ? formatSol(claimed) : "Not run",
      subtext: latest?.dryRun ? "Dry-run only" : "Pump creator vault"
    },
    {
      label: "Buy ZEC",
      status: latest?.solZec ? "done" : "queued",
      amount: latest?.solZec ? "Quoted" : "Waiting",
      subtext: "Jupiter spot route"
    },
    {
      label: "ZEC Long",
      status: long || latestPosition ? "active" : "queued",
      amount: longAmount,
      subtext: longSubtext
    },
    {
      label: "Profit Reserve",
      status: airdrop ? "done" : "queued",
      amount: formatSol(airdrop?.inputLamports),
      subtext: airdrop?.status ?? "No realized PnL yet"
    },
    {
      label: "Airdrop",
      status: snapshot ? "ready" : "queued",
      amount: snapshot ? `${snapshot.totalEligible} holders` : "No snapshot",
      subtext: snapshot ? "Dry-run ready" : "Fetch holder snapshot"
    }
  ];
}

function totalAirdropReserveLamports(runs: RunLedger[]): string {
  let total = 0n;
  for (const run of runs) {
    if (run.holderAirdrop && typeof run.holderAirdrop === "object") {
      const lamports = (run.holderAirdrop as { inputLamports?: string }).inputLamports;
      if (lamports) total += BigInt(lamports);
    }
  }
  return total.toString();
}

export async function syncEngineData(options: {
  ledgerPath: string;
  snapshotPath: string;
  outputPath: string;
  projectTokenMint: string;
  dryRun: boolean;
}): Promise<{ ledgerRows: number; positions: number; holderSnapshot: boolean }> {
  const runs = await readLedger(options.ledgerPath);
  const snapshot = await readSnapshot(options.snapshotPath);
  const latest = runs.at(-1);

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: options.dryRun ? "dry-run" : "live",
    projectTokenMint: options.projectTokenMint || "TBA",
    ledger: ledgerRows(runs),
    positions: runtimePositions(runs),
    stages: runtimeStages(latest, snapshot, runtimePositions(runs)),
    holderSnapshot: snapshot
      ? {
          source: snapshot.source,
          createdAt: snapshot.createdAt,
          totalEligible: snapshot.totalEligible,
          totalBalanceUi: snapshot.totalBalanceUi
        }
      : null,
    airdropReserveLamports: totalAirdropReserveLamports(runs)
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    ledgerRows: payload.ledger.length,
    positions: payload.positions.length,
    holderSnapshot: Boolean(payload.holderSnapshot)
  };
}

async function main(): Promise<void> {
  const config = loadConfig(["node", "dashboard-data", "--dry-run"]);
  const stats = await syncEngineData({
    ledgerPath: config.LEDGER_PATH,
    snapshotPath: config.HOLDER_SNAPSHOT_PATH,
    outputPath: config.PUBLIC_ENGINE_DATA_PATH,
    projectTokenMint: config.PROJECT_TOKEN_MINT,
    dryRun: config.DRY_RUN
  });
  console.log(JSON.stringify({ ok: true, path: config.PUBLIC_ENGINE_DATA_PATH, ...stats }, null, 2));
}

function isDirectRun(): boolean {
  return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
