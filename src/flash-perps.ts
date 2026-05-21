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
