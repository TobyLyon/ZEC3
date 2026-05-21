import { loadConfig } from "./config.js";
import { USDC_MINT, WSOL_MINT } from "./constants.js";
import { syncEngineData } from "./dashboard-data.js";
import { executeFlashPerpsLong } from "./flash-perps.js";
import { getJupiterQuote } from "./jupiter.js";
import { appendLedger } from "./ledger.js";
import { createConnection } from "./solana.js";
import { loadSolanaKeypair } from "./wallet.js";
import type { RunLedger } from "./types.js";

const DEFAULT_RESERVE_LAMPORTS = 50_000_000n;

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function solToLamports(value: string): bigint {
  const [whole, fractional = ""] = value.trim().split(".");
  const fractionalPadded = fractional.padEnd(9, "0").slice(0, 9);
  return BigInt(whole || "0") * 1_000_000_000n + BigInt(fractionalPadded || "0");
}

function capInputLamports(inputLamports: bigint, quotedCollateralUsdc: number, maxCollateralUsdc: number): bigint {
  if (quotedCollateralUsdc <= 0 || quotedCollateralUsdc <= maxCollateralUsdc) return inputLamports;
  const scaled = Number(inputLamports) * (maxCollateralUsdc / quotedCollateralUsdc);
  return BigInt(Math.max(0, Math.floor(scaled)));
}

async function main(): Promise<void> {
  const confirmLive = hasFlag("--confirm-live-long");
  const dryRun = hasFlag("--dry-run") || !confirmLive;
  const config = loadConfig(dryRun ? ["node", "flash-long-cli", "--dry-run"] : process.argv);
  const signer = loadSolanaKeypair({
    keypairPath: config.CREATOR_KEYPAIR_PATH,
    privateKeyBase58: config.CREATOR_PRIVATE_KEY_BASE58
  });
  const connection = createConnection(config.SOLANA_RPC_URL, config.COMMITMENT);
  const balanceLamports = BigInt(await connection.getBalance(signer.publicKey, config.COMMITMENT));
  const reserveLamports = argValue("--reserve-sol")
    ? solToLamports(argValue("--reserve-sol")!)
    : DEFAULT_RESERVE_LAMPORTS;

  if (balanceLamports <= reserveLamports) {
    throw new Error(`Creator wallet balance ${balanceLamports} leaves no room after reserve ${reserveLamports}.`);
  }

  const requestedLamports = argValue("--sol")
    ? solToLamports(argValue("--sol")!)
    : balanceLamports - reserveLamports;

  if (requestedLamports <= 0n || requestedLamports > balanceLamports - reserveLamports) {
    throw new Error("Requested SOL amount is invalid or exceeds wallet balance after reserve.");
  }

  const quote = await getJupiterQuote({
    inputMint: WSOL_MINT,
    outputMint: USDC_MINT,
    amount: requestedLamports,
    slippageBps: config.JUPITER_SLIPPAGE_BPS
  });
  const quotedCollateralUsdc = Number(quote.outAmount) / 1_000_000;
  const cappedCollateralUsdc = Math.min(quotedCollateralUsdc, config.FLASH_LONG_MAX_ORDER_USDC);
  const inputLamports = capInputLamports(requestedLamports, quotedCollateralUsdc, cappedCollateralUsdc);

  if (inputLamports <= 0n) {
    throw new Error("Computed Flash long input is zero.");
  }

  const flashLong = await executeFlashPerpsLong({
    connection,
    signer,
    market: config.FLASH_PERPS_MARKET,
    pool: config.FLASH_POOL,
    apiUrl: config.FLASH_API_URL,
    inputTokenSymbol: config.FLASH_INPUT_TOKEN_SYMBOL,
    slippagePercentage: config.FLASH_SLIPPAGE_PERCENTAGE,
    enabled: config.FLASH_PERPS_ENABLED,
    dryRun,
    inputLamports,
    quotedNotionalUsdc: quotedCollateralUsdc,
    cappedNotionalUsdc: cappedCollateralUsdc,
    leverage: config.FLASH_LONG_LEVERAGE,
    takeProfit: config.FLASH_TAKE_PROFIT_PRICE,
    stopLoss: config.FLASH_STOP_LOSS_PRICE,
    commitment: config.COMMITMENT
  });

  const ledger: RunLedger = {
    at: new Date().toISOString(),
    dryRun,
    creator: signer.publicKey.toBase58(),
    projectTokenMint: config.PROJECT_TOKEN_MINT || "TBA",
    allocations: {
      solZecLamports: "0",
      flashLongLamports: inputLamports.toString(),
      holderAirdropLamports: "0",
      retainedLamports: (balanceLamports - inputLamports).toString()
    },
    flashLong
  };

  await appendLedger(config.LEDGER_PATH, ledger);
  await syncEngineData({
    ledgerPath: config.LEDGER_PATH,
    snapshotPath: config.HOLDER_SNAPSHOT_PATH,
    outputPath: config.PUBLIC_ENGINE_DATA_PATH,
    projectTokenMint: config.PROJECT_TOKEN_MINT,
    dryRun
  });

  console.log(JSON.stringify({
    ok: true,
    live: !dryRun,
    creator: signer.publicKey.toBase58(),
    balanceLamports: balanceLamports.toString(),
    reserveLamports: reserveLamports.toString(),
    inputLamports: inputLamports.toString(),
    quotedCollateralUsdc,
    cappedCollateralUsdc,
    flashLong
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
