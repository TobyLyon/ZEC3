import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AirdropDryRunPlan,
  AirdropDryRunRecipient,
  HolderSnapshot,
  HolderSnapshotHolder
} from "./types.js";

const BIRDEYE_HOLDER_DISTRIBUTION_URL = "https://public-api.birdeye.so/holder/v1/distribution";
const BIRDEYE_PAGE_LIMIT = 50;
const BIRDEYE_MAX_TOP_HOLDERS = 10_000;
const LAMPORTS_PER_SOL = 1_000_000_000;

type JsonRecord = Record<string, unknown>;

export type SnapshotOptions = {
  tokenMint: string;
  apiKey: string;
  minBalanceUi: number;
  excludedWallets: string[];
  topHolders?: number;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function firstString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function extractHolderItems(payload: unknown): unknown[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const candidates = [
    data?.items,
    data?.holders,
    data?.holder_list,
    data?.holderList,
    data?.list,
    root?.items
  ];
  const found = candidates.find(Array.isArray);
  return Array.isArray(found) ? found : [];
}

function normalizeHolder(item: unknown, index: number): HolderSnapshotHolder | null {
  const record = asRecord(item);
  if (!record) return null;

  const owner = firstString(record, [
    "owner",
    "wallet",
    "wallet_address",
    "address",
    "holder",
    "token_account_owner"
  ]);
  if (!owner) return null;

  const balanceRaw = firstString(record, [
    "balance_raw",
    "balanceRaw",
    "raw_amount",
    "rawAmount",
    "amount_raw",
    "amountRaw"
  ]);

  const balanceUi =
    firstNumber(record, ["ui_amount", "uiAmount", "balance_ui", "balanceUi", "amount", "balance"]) ?? 0;

  const supplyPercent = firstNumber(record, [
    "supply_percent",
    "supplyPercent",
    "percent",
    "percentage",
    "share"
  ]);

  return {
    owner,
    balanceRaw,
    balanceUi,
    supplyPercent,
    sourceRank: index + 1
  };
}

function mergeAndFilterHolders(
  holders: HolderSnapshotHolder[],
  minBalanceUi: number,
  excludedWallets: string[]
): HolderSnapshotHolder[] {
  const excluded = new Set(excludedWallets.map((wallet) => wallet.toLowerCase()));
  const byOwner = new Map<string, HolderSnapshotHolder>();

  for (const holder of holders) {
    const key = holder.owner.toLowerCase();
    if (excluded.has(key)) continue;
    if (holder.balanceUi < minBalanceUi) continue;

    const existing = byOwner.get(key);
    if (!existing) {
      byOwner.set(key, holder);
      continue;
    }

    existing.balanceUi += holder.balanceUi;
    if (existing.supplyPercent !== undefined || holder.supplyPercent !== undefined) {
      existing.supplyPercent = (existing.supplyPercent ?? 0) + (holder.supplyPercent ?? 0);
    }
    if (existing.balanceRaw && holder.balanceRaw && /^\d+$/.test(existing.balanceRaw) && /^\d+$/.test(holder.balanceRaw)) {
      existing.balanceRaw = (BigInt(existing.balanceRaw) + BigInt(holder.balanceRaw)).toString();
    } else {
      existing.balanceRaw = existing.balanceRaw ?? holder.balanceRaw;
    }
  }

  return [...byOwner.values()].sort((a, b) => b.balanceUi - a.balanceUi);
}

export async function fetchBirdeyeHolderSnapshot(options: SnapshotOptions): Promise<HolderSnapshot> {
  if (options.tokenMint.length < 32) {
    throw new Error("Set PROJECT_TOKEN_MINT before fetching a holder snapshot.");
  }
  if (!options.apiKey) {
    throw new Error("Set BIRDEYE_API_KEY before fetching a holder snapshot.");
  }

  const topHolders = Math.min(options.topHolders ?? BIRDEYE_MAX_TOP_HOLDERS, BIRDEYE_MAX_TOP_HOLDERS);
  const fetched: HolderSnapshotHolder[] = [];

  for (let offset = 0; offset < topHolders; offset += BIRDEYE_PAGE_LIMIT) {
    const limit = Math.min(BIRDEYE_PAGE_LIMIT, topHolders - offset);
    const url = new URL(BIRDEYE_HOLDER_DISTRIBUTION_URL);
    url.searchParams.set("token_address", options.tokenMint);
    url.searchParams.set("address_type", "wallet");
    url.searchParams.set("mode", "top");
    url.searchParams.set("top_n", topHolders.toString());
    url.searchParams.set("include_list", "true");
    url.searchParams.set("offset", offset.toString());
    url.searchParams.set("limit", limit.toString());

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
        "x-api-key": options.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Birdeye holder snapshot failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const items = extractHolderItems(payload);
    if (items.length === 0) break;

    for (const item of items) {
      const holder = normalizeHolder(item, fetched.length);
      if (holder) fetched.push(holder);
    }

    if (items.length < limit) break;
  }

  const holders = mergeAndFilterHolders(fetched, options.minBalanceUi, options.excludedWallets);
  const totalBalanceUi = holders.reduce((sum, holder) => sum + holder.balanceUi, 0);

  return {
    version: 1,
    tokenMint: options.tokenMint,
    source: "birdeye",
    createdAt: new Date().toISOString(),
    minBalanceUi: options.minBalanceUi,
    excludedWallets: options.excludedWallets,
    totalFetched: fetched.length,
    totalEligible: holders.length,
    totalBalanceUi,
    holders
  };
}

export async function readHolderSnapshot(path: string): Promise<HolderSnapshot> {
  return JSON.parse(await readFile(path, "utf8")) as HolderSnapshot;
}

export async function writeHolderSnapshot(path: string, snapshot: HolderSnapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function allocateWithRawWeights(snapshot: HolderSnapshot, amountLamports: bigint): AirdropDryRunRecipient[] | null {
  if (!snapshot.holders.every((holder) => holder.balanceRaw && /^\d+$/.test(holder.balanceRaw))) return null;

  const totalRaw = snapshot.holders.reduce((sum, holder) => sum + BigInt(holder.balanceRaw!), 0n);
  if (totalRaw <= 0n) return null;

  return snapshot.holders.map((holder) => {
    const lamports = (amountLamports * BigInt(holder.balanceRaw!)) / totalRaw;
    return {
      owner: holder.owner,
      balanceUi: holder.balanceUi,
      lamports: lamports.toString(),
      sol: Number(lamports) / LAMPORTS_PER_SOL,
      sharePct: Number((BigInt(holder.balanceRaw!) * 1_000_000n) / totalRaw) / 10_000
    };
  });
}

function allocateWithUiWeights(snapshot: HolderSnapshot, amountLamports: bigint): AirdropDryRunRecipient[] {
  const totalUi = snapshot.holders.reduce((sum, holder) => sum + holder.balanceUi, 0);
  if (totalUi <= 0) return [];

  return snapshot.holders.map((holder) => {
    const share = holder.balanceUi / totalUi;
    const lamports = BigInt(Math.floor(Number(amountLamports) * share));
    return {
      owner: holder.owner,
      balanceUi: holder.balanceUi,
      lamports: lamports.toString(),
      sol: Number(lamports) / LAMPORTS_PER_SOL,
      sharePct: share * 100
    };
  });
}

export function buildAirdropDryRunPlan(snapshot: HolderSnapshot, amountLamports: bigint): AirdropDryRunPlan {
  if (amountLamports <= 0n) {
    throw new Error("Airdrop dry-run amount must be greater than zero lamports.");
  }

  const recipients = allocateWithRawWeights(snapshot, amountLamports) ?? allocateWithUiWeights(snapshot, amountLamports);
  const assigned = recipients.reduce((sum, recipient) => sum + BigInt(recipient.lamports), 0n);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tokenMint: snapshot.tokenMint,
    snapshotCreatedAt: snapshot.createdAt,
    inputLamports: amountLamports.toString(),
    totalAssignedLamports: assigned.toString(),
    remainderLamports: (amountLamports - assigned).toString(),
    recipientCount: recipients.length,
    recipients
  };
}

export async function readAirdropDryRunPlan(path: string): Promise<AirdropDryRunPlan> {
  return JSON.parse(await readFile(path, "utf8")) as AirdropDryRunPlan;
}

export async function writeAirdropDryRunPlan(path: string, plan: AirdropDryRunPlan): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}
