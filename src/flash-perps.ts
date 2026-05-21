import {
  Transaction,
  VersionedTransaction,
  type Commitment,
  type Connection,
  type Keypair
} from "@solana/web3.js";

export type FlashPerpsLongResult = {
  venue: "Flash Trade";
  market: string;
  pool: string;
  inputTokenSymbol: string;
  inputAmountUi: string;
  inputLamports: string;
  quotedNotionalUsdc: number;
  cappedNotionalUsdc: number;
  leverage: number;
  status: "dry-run" | "disabled" | "submitted";
  signature?: string;
  newEntryPrice?: string | null;
  newLiquidationPrice?: string | null;
  outputAmountUi?: string | null;
  note: string;
};

type FlashOpenPositionResponse = {
  err?: string | null;
  transactionBase64?: string | null;
  oldLeverage?: string | null;
  newLeverage?: string | null;
  oldEntryPrice?: string | null;
  newEntryPrice?: string | null;
  oldLiquidationPrice?: string | null;
  newLiquidationPrice?: string | null;
  entryFee?: string | null;
  availableLiquidity?: string | null;
  youPayUsdUi?: string | null;
  youRecieveUsdUi?: string | null;
  outputAmountUi?: string | null;
};

type FlashClosePositionResponse = {
  err?: string | null;
  transactionBase64?: string | null;
  receiveTokenSymbol?: string | null;
  receiveTokenAmountUi?: string | null;
  receiveTokenAmountUsdUi?: string | null;
  markPrice?: string | null;
  entryPrice?: string | null;
  existingSize?: string | null;
  newSize?: string | null;
  settledPnl?: string | null;
  fees?: string | null;
};

type FlashPositionRecord = Record<string, unknown>;

export type FlashProfitPullResult = {
  venue: "Flash Trade";
  market: string;
  triggerMultiple: number;
  status: "dry-run" | "disabled" | "no-position" | "below-trigger" | "submitted";
  positionKey?: string;
  positionMultiple?: number;
  inputUsdUi?: string;
  withdrawTokenSymbol?: string;
  signature?: string;
  receiveTokenAmountUi?: string | null;
  settledPnl?: string | null;
  note: string;
};

export function normalizeFlashMarket(value: string): string {
  return value.trim().toUpperCase() || "ZEC";
}

function formatSolAmount(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fractional = lamports % 1_000_000_000n;
  const fractionalText = fractional.toString().padStart(9, "0").replace(/0+$/, "");
  return fractionalText ? `${whole}.${fractionalText}` : whole.toString();
}

function deserializeTransaction(base64: string): Transaction | VersionedTransaction {
  const raw = Buffer.from(base64, "base64");
  try {
    return VersionedTransaction.deserialize(raw);
  } catch {
    return Transaction.from(raw);
  }
}

async function signAndSendFlashTransaction(options: {
  connection: Connection;
  signer: Keypair;
  transactionBase64: string;
  commitment: Commitment;
}): Promise<string> {
  const transaction = deserializeTransaction(options.transactionBase64);

  if (transaction instanceof VersionedTransaction) {
    transaction.sign([options.signer]);
  } else {
    transaction.partialSign(options.signer);
  }

  const signature = await options.connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: options.commitment
  });
  await options.connection.confirmTransaction(signature, options.commitment);
  return signature;
}

function asRecord(value: unknown): FlashPositionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as FlashPositionRecord;
}

function getString(record: FlashPositionRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function getNumber(record: FlashPositionRecord, keys: string[]): number | undefined {
  const raw = getString(record, keys);
  if (!raw) return undefined;
  const normalized = raw.replace(/[$,%]/g, "").replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function getPositionRows(payload: unknown): FlashPositionRecord[] {
  if (Array.isArray(payload)) return payload.flatMap((item) => asRecord(item) ? [asRecord(item)!] : []);
  const record = asRecord(payload);
  if (!record) return [];
  const positions = record.positions ?? record.data ?? record.items;
  if (Array.isArray(positions)) return positions.flatMap((item) => asRecord(item) ? [asRecord(item)!] : []);
  return [];
}

function positionMatches(record: FlashPositionRecord, market: string): boolean {
  const target = market.toUpperCase();
  const symbol = getString(record, [
    "targetTokenSymbol",
    "outputTokenSymbol",
    "marketSymbol",
    "tokenSymbol",
    "symbol",
    "asset"
  ])?.toUpperCase();
  const side = getString(record, ["side", "tradeType", "positionSide"])?.toUpperCase();
  const active = getString(record, ["status", "state"])?.toUpperCase();

  if (symbol && symbol !== target) return false;
  if (side && !side.includes("LONG")) return false;
  if (active && ["CLOSED", "INACTIVE", "ZERO"].includes(active)) return false;
  return true;
}

function getPositionKey(record: FlashPositionRecord): string | undefined {
  return getString(record, ["positionKey", "positionPubkey", "positionPubKey", "pubkey", "publicKey", "key", "address"]);
}

function getPositionSizeUsd(record: FlashPositionRecord): number | undefined {
  return getNumber(record, ["sizeUsdUi", "sizeUsd", "inputUsdUi", "positionSizeUsd", "notionalUsd", "notional"]);
}

function getPositionMultiple(record: FlashPositionRecord): number | undefined {
  const explicit = getNumber(record, ["multiple", "profitMultiple", "returnMultiple"]);
  if (explicit !== undefined) return explicit;

  const pnlPercentage = getNumber(record, ["pnlPercentage", "roiPercentage", "roi", "pnlPercent"]);
  if (pnlPercentage !== undefined) return 1 + pnlPercentage / 100;

  const pnlUsd = getNumber(record, ["pnlUsdUi", "pnlUsd", "unrealizedPnlUsd", "unrealizedPnl", "profitUsdUi"]);
  const collateralUsd = getNumber(record, [
    "collateralUsdUi",
    "collateralUsd",
    "remainingCollateralUsd",
    "currentCollateralUsd",
    "initialCollateralUsd",
    "collateral"
  ]);
  if (pnlUsd !== undefined && collateralUsd && collateralUsd > 0) {
    return (collateralUsd + pnlUsd) / collateralUsd;
  }

  const currentValueUsd = getNumber(record, ["currentValueUsd", "valueUsd", "equityUsd", "receiveTokenAmountUsdUi"]);
  if (currentValueUsd !== undefined && collateralUsd && collateralUsd > 0) {
    return currentValueUsd / collateralUsd;
  }

  return undefined;
}

function selectProfitPullPosition(positions: FlashPositionRecord[], market: string, triggerMultiple: number): {
  record: FlashPositionRecord;
  key: string;
  multiple: number;
  sizeUsd: number;
} | null {
  let selected: { record: FlashPositionRecord; key: string; multiple: number; sizeUsd: number } | null = null;

  for (const record of positions) {
    if (!positionMatches(record, market)) continue;
    const key = getPositionKey(record);
    const multiple = getPositionMultiple(record);
    const sizeUsd = getPositionSizeUsd(record);
    if (!key || multiple === undefined || !sizeUsd || sizeUsd <= 0) continue;
    if (multiple < triggerMultiple) continue;
    if (!selected || multiple > selected.multiple) {
      selected = { record, key, multiple, sizeUsd };
    }
  }

  return selected;
}

export async function executeFlashProfitPull(options: {
  connection: Connection;
  signer: Keypair;
  market: string;
  apiUrl: string;
  enabled: boolean;
  dryRun: boolean;
  triggerMultiple: number;
  withdrawTokenSymbol: string;
  slippagePercentage: string;
  commitment: Commitment;
}): Promise<FlashProfitPullResult> {
  const market = normalizeFlashMarket(options.market);
  const withdrawTokenSymbol = options.withdrawTokenSymbol.trim().toUpperCase() || "USDC";

  if (options.dryRun) {
    return {
      venue: "Flash Trade",
      market,
      triggerMultiple: options.triggerMultiple,
      status: "dry-run",
      withdrawTokenSymbol,
      note: "Profit pull check skipped in dry-run mode."
    };
  }

  if (!options.enabled) {
    return {
      venue: "Flash Trade",
      market,
      triggerMultiple: options.triggerMultiple,
      status: "disabled",
      withdrawTokenSymbol,
      note: "Flash profit pull disabled because Flash perps execution is disabled."
    };
  }

  const apiUrl = options.apiUrl.replace(/\/$/, "");
  const owner = options.signer.publicKey.toBase58();
  const positionsResponse = await fetch(`${apiUrl}/positions/owner/${owner}?includePnlInLeverageDisplay=true`, {
    headers: { Accept: "application/json" }
  });

  if (!positionsResponse.ok) {
    throw new Error(`Flash positions lookup failed: ${positionsResponse.status} ${await positionsResponse.text()}`);
  }

  const positions = getPositionRows(await positionsResponse.json());
  const selected = selectProfitPullPosition(positions, market, options.triggerMultiple);

  if (!selected) {
    return {
      venue: "Flash Trade",
      market,
      triggerMultiple: options.triggerMultiple,
      status: positions.some((position) => positionMatches(position, market)) ? "below-trigger" : "no-position",
      withdrawTokenSymbol,
      note: "No Flash ZEC long met the configured profit-pull multiple."
    };
  }

  const inputUsdUi = selected.sizeUsd.toFixed(2);
  const closeResponse = await fetch(`${apiUrl}/transaction-builder/close-position`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      positionKey: selected.key,
      inputUsdUi,
      withdrawTokenSymbol,
      owner,
      slippagePercentage: options.slippagePercentage
    })
  });

  if (!closeResponse.ok) {
    throw new Error(`Flash close-position builder failed: ${closeResponse.status} ${await closeResponse.text()}`);
  }

  const built = (await closeResponse.json()) as FlashClosePositionResponse;
  if (built.err) {
    throw new Error(`Flash close-position builder error: ${built.err}`);
  }
  if (!built.transactionBase64) {
    throw new Error("Flash close-position builder did not return transactionBase64.");
  }

  const signature = await signAndSendFlashTransaction({
    connection: options.connection,
    signer: options.signer,
    transactionBase64: built.transactionBase64,
    commitment: options.commitment
  });

  return {
    venue: "Flash Trade",
    market,
    triggerMultiple: options.triggerMultiple,
    status: "submitted",
    positionKey: selected.key,
    positionMultiple: selected.multiple,
    inputUsdUi,
    withdrawTokenSymbol,
    signature,
    receiveTokenAmountUi: built.receiveTokenAmountUi ?? null,
    settledPnl: built.settledPnl ?? null,
    note: "Flash profit-pull threshold met; close-position transaction signed and submitted."
  };
}

export async function executeFlashPerpsLong(options: {
  connection: Connection;
  signer: Keypair;
  market: string;
  pool: string;
  apiUrl: string;
  inputTokenSymbol: string;
  slippagePercentage: string;
  enabled: boolean;
  dryRun: boolean;
  inputLamports: bigint;
  quotedNotionalUsdc: number;
  cappedNotionalUsdc: number;
  leverage: number;
  takeProfit?: string;
  stopLoss?: string;
  commitment: Commitment;
}): Promise<FlashPerpsLongResult> {
  const market = normalizeFlashMarket(options.market);
  const inputTokenSymbol = options.inputTokenSymbol.trim().toUpperCase() || "SOL";
  const inputAmountUi = inputTokenSymbol === "SOL"
    ? formatSolAmount(options.inputLamports)
    : options.cappedNotionalUsdc.toFixed(6);

  if (options.dryRun) {
    return {
      venue: "Flash Trade",
      market,
      pool: options.pool,
      inputTokenSymbol,
      inputAmountUi,
      inputLamports: options.inputLamports.toString(),
      quotedNotionalUsdc: options.quotedNotionalUsdc,
      cappedNotionalUsdc: options.cappedNotionalUsdc,
      leverage: options.leverage,
      status: "dry-run",
      note: "Flash ZEC perpetual exposure planned only; no position request submitted."
    };
  }

  if (!options.enabled) {
    return {
      venue: "Flash Trade",
      market,
      pool: options.pool,
      inputTokenSymbol,
      inputAmountUi,
      inputLamports: options.inputLamports.toString(),
      quotedNotionalUsdc: options.quotedNotionalUsdc,
      cappedNotionalUsdc: options.cappedNotionalUsdc,
      leverage: options.leverage,
      status: "disabled",
      note: "Set FLASH_PERPS_ENABLED=true only after Flash transaction-builder routing and collateral checks are confirmed."
    };
  }

  const body: Record<string, unknown> = {
    inputTokenSymbol,
    outputTokenSymbol: market,
    inputAmountUi,
    leverage: options.leverage,
    tradeType: "LONG",
    orderType: "MARKET",
    owner: options.signer.publicKey.toBase58(),
    slippagePercentage: options.slippagePercentage
  };

  if (options.takeProfit) body.takeProfit = options.takeProfit;
  if (options.stopLoss) body.stopLoss = options.stopLoss;

  const response = await fetch(`${options.apiUrl.replace(/\/$/, "")}/transaction-builder/open-position`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Flash open-position builder failed: ${response.status} ${await response.text()}`);
  }

  const built = (await response.json()) as FlashOpenPositionResponse;
  if (built.err) {
    throw new Error(`Flash open-position builder error: ${built.err}`);
  }
  if (!built.transactionBase64) {
    throw new Error("Flash open-position builder did not return transactionBase64.");
  }

  const signature = await signAndSendFlashTransaction({
    connection: options.connection,
    signer: options.signer,
    transactionBase64: built.transactionBase64,
    commitment: options.commitment
  });

  return {
    venue: "Flash Trade",
    market,
    pool: options.pool,
    inputTokenSymbol,
    inputAmountUi,
    inputLamports: options.inputLamports.toString(),
    quotedNotionalUsdc: options.quotedNotionalUsdc,
    cappedNotionalUsdc: options.cappedNotionalUsdc,
    leverage: options.leverage,
    status: "submitted",
    signature,
    newEntryPrice: built.newEntryPrice ?? null,
    newLiquidationPrice: built.newLiquidationPrice ?? null,
    outputAmountUi: built.outputAmountUi ?? null,
    note: "Flash transaction-builder returned, signed, and submitted the ZEC long transaction."
  };
}
