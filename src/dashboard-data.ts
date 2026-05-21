import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
        hash: shortHash(run.claim.signature),
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
    if (run.jupiterLong && typeof run.jupiterLong === "object") {
      const result = run.jupiterLong as { status?: string; cappedNotionalUsdc?: number };
      rows.push({
        time,
        action: "ZEC long plan",
        value: result.cappedNotionalUsdc ? `$${result.cappedNotionalUsdc.toFixed(2)}` : "queued",
        hash: result.status ?? "pending",
        chain: "Jupiter"
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
  const latestWithLong = [...runs].reverse().find((run) => run.jupiterLong);
  if (!latestWithLong?.jupiterLong || typeof latestWithLong.jupiterLong !== "object") return [];

  const long = latestWithLong.jupiterLong as {
    cappedNotionalUsdc?: number;
    leverage?: number;
    status?: string;
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
    source: long.status ?? "planned"
  }];
}

function runtimeStages(latest: RunLedger | undefined, snapshot: HolderSnapshot | null): RuntimeStage[] {
  const claimed = latest?.claim?.claimedLamports;
  const airdrop = latest?.holderAirdrop as { inputLamports?: string; status?: string } | undefined;
  const long = latest?.jupiterLong as { status?: string; cappedNotionalUsdc?: number } | undefined;

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
      status: long ? "active" : "queued",
      amount: long?.cappedNotionalUsdc ? `$${long.cappedNotionalUsdc.toFixed(2)}` : "Planned",
      subtext: long?.status ?? "Perps execution gated"
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

async function main(): Promise<void> {
  const config = loadConfig(["node", "dashboard-data", "--dry-run"]);
  const runs = await readLedger(config.LEDGER_PATH);
  const snapshot = await readSnapshot(config.HOLDER_SNAPSHOT_PATH);
  const latest = runs.at(-1);

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: config.DRY_RUN ? "dry-run" : "live",
    projectTokenMint: config.PROJECT_TOKEN_MINT || "TBA",
    ledger: ledgerRows(runs),
    positions: runtimePositions(runs),
    stages: runtimeStages(latest, snapshot),
    holderSnapshot: snapshot
      ? {
          source: snapshot.source,
          createdAt: snapshot.createdAt,
          totalEligible: snapshot.totalEligible,
          totalBalanceUi: snapshot.totalBalanceUi
        }
      : null,
    airdropReserveLamports:
      latest?.holderAirdrop && typeof latest.holderAirdrop === "object"
        ? (latest.holderAirdrop as { inputLamports?: string }).inputLamports ?? "0"
        : "0"
  };

  await mkdir(dirname(config.PUBLIC_ENGINE_DATA_PATH), { recursive: true });
  await writeFile(config.PUBLIC_ENGINE_DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    path: config.PUBLIC_ENGINE_DATA_PATH,
    ledgerRows: payload.ledger.length,
    positions: payload.positions.length,
    holderSnapshot: Boolean(payload.holderSnapshot)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
