import { loadConfig, isOnce } from "./config.js";
import { USDC_MINT, WSOL_MINT } from "./constants.js";
import { syncEngineData } from "./dashboard-data.js";
import { getJupiterQuote, swapWithJupiter } from "./jupiter.js";
import { appendLedger } from "./ledger.js";
import { allocateLamports } from "./math.js";
import { executeFlashPerpsLong, executeFlashProfitPull } from "./flash-perps.js";
import { PumpFees } from "./pump.js";
import { createConnection } from "./solana.js";
import { loadSolanaKeypair } from "./wallet.js";
import type { AppConfig } from "./config.js";
import type { RunLedger } from "./types.js";

async function appendLedgerAndSync(config: AppConfig, ledger: RunLedger): Promise<void> {
  await appendLedger(config.LEDGER_PATH, ledger);
  await syncEngineData({
    ledgerPath: config.LEDGER_PATH,
    snapshotPath: config.HOLDER_SNAPSHOT_PATH,
    outputPath: config.PUBLIC_ENGINE_DATA_PATH,
    projectTokenMint: config.PROJECT_TOKEN_MINT,
    dryRun: config.DRY_RUN
  });
}

function capInputLamports(inputLamports: bigint, quotedNotionalUsdc: number, cappedNotionalUsdc: number): bigint {
  if (quotedNotionalUsdc <= 0 || cappedNotionalUsdc >= quotedNotionalUsdc) return inputLamports;
  const scaled = Number(inputLamports) * (cappedNotionalUsdc / quotedNotionalUsdc);
  return BigInt(Math.max(0, Math.floor(scaled)));
}

async function runOnce(config = loadConfig()): Promise<void> {
  const creator = loadSolanaKeypair({
    keypairPath: config.CREATOR_KEYPAIR_PATH,
    privateKeyBase58: config.CREATOR_PRIVATE_KEY_BASE58
  });
  const connection = createConnection(config.SOLANA_RPC_URL, config.COMMITMENT);
  const pump = new PumpFees(connection, creator, config.COMMITMENT, config.DRY_RUN);

  const ledger: RunLedger = {
    at: new Date().toISOString(),
    dryRun: config.DRY_RUN,
    creator: creator.publicKey.toBase58(),
    projectTokenMint: config.PROJECT_TOKEN_MINT || "TBA"
  };

  const before = await pump.getCreatorFeeLamports();
  const collectResult = await pump.collect();
  const after = config.DRY_RUN ? before : await pump.getCreatorFeeLamports();
  const claimed = config.DRY_RUN ? before : before - after;

  ledger.claim = {
    beforeLamports: before.toString(),
    afterLamports: after.toString(),
    claimedLamports: claimed.toString(),
    signatureV1: collectResult.signatureV1,
    signatureV2: collectResult.signatureV2,
    unwrapSignature: collectResult.unwrapSignature
  };

  if (config.FLASH_PROFIT_PULL_MULTIPLE > 1) {
    ledger.flashProfitPull = await executeFlashProfitPull({
      connection,
      signer: creator,
      market: config.FLASH_PERPS_MARKET,
      apiUrl: config.FLASH_API_URL,
      enabled: config.FLASH_PERPS_ENABLED,
      dryRun: config.DRY_RUN,
      triggerMultiple: config.FLASH_PROFIT_PULL_MULTIPLE,
      withdrawTokenSymbol: config.FLASH_PROFIT_WITHDRAW_TOKEN_SYMBOL,
      slippagePercentage: config.FLASH_SLIPPAGE_PERCENTAGE,
      commitment: config.COMMITMENT
    });
  }

  if (claimed < config.MIN_CLAIMED_LAMPORTS) {
    ledger.skippedReason = `claimed ${claimed} lamports is below MIN_CLAIMED_LAMPORTS`;
    await appendLedgerAndSync(config, ledger);
    console.log(JSON.stringify(ledger, null, 2));
    return;
  }

  const solZecLamports = allocateLamports(claimed, config.SOL_ZEC_BPS);
  const flashLongLamports = allocateLamports(claimed, config.FLASH_LONG_BPS);
  const holderAirdropLamports = allocateLamports(claimed, config.HOLDER_AIRDROP_BPS);
  const retainedLamports = claimed - solZecLamports - flashLongLamports - holderAirdropLamports;

  ledger.allocations = {
    solZecLamports: solZecLamports.toString(),
    flashLongLamports: flashLongLamports.toString(),
    holderAirdropLamports: holderAirdropLamports.toString(),
    retainedLamports: retainedLamports.toString()
  };

  if (solZecLamports > 0n) {
    const zecQuote = await getJupiterQuote({
      inputMint: WSOL_MINT,
      outputMint: config.ZEC_SOL_MINT,
      amount: solZecLamports,
      slippageBps: config.JUPITER_SLIPPAGE_BPS
    });
    ledger.solZec = await swapWithJupiter({
      connection,
      signer: creator,
      quote: zecQuote,
      dryRun: config.DRY_RUN
    });
  }

  if (flashLongLamports > 0n) {
    const solUsdcQuote = await getJupiterQuote({
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
      amount: flashLongLamports,
      slippageBps: config.JUPITER_SLIPPAGE_BPS
    });
    const quotedNotionalUsdc = Number(solUsdcQuote.outAmount) / 1_000_000;
    const cappedNotionalUsdc = Math.min(quotedNotionalUsdc, config.FLASH_LONG_MAX_ORDER_USDC);
    const cappedInputLamports = capInputLamports(flashLongLamports, quotedNotionalUsdc, cappedNotionalUsdc);

    ledger.flashLong = await executeFlashPerpsLong({
      connection,
      signer: creator,
      market: config.FLASH_PERPS_MARKET,
      pool: config.FLASH_POOL,
      apiUrl: config.FLASH_API_URL,
      inputTokenSymbol: config.FLASH_INPUT_TOKEN_SYMBOL,
      slippagePercentage: config.FLASH_SLIPPAGE_PERCENTAGE,
      enabled: config.FLASH_PERPS_ENABLED,
      dryRun: config.DRY_RUN,
      inputLamports: cappedInputLamports,
      quotedNotionalUsdc,
      cappedNotionalUsdc,
      leverage: config.FLASH_LONG_LEVERAGE,
      takeProfit: config.FLASH_TAKE_PROFIT_PRICE,
      stopLoss: config.FLASH_STOP_LOSS_PRICE,
      commitment: config.COMMITMENT
    });
  }

  if (holderAirdropLamports > 0n) {
    ledger.holderAirdrop = {
      inputLamports: holderAirdropLamports.toString(),
      source: "realized-long-profit-reserve",
      recipients: "project-token-holders",
      status: config.DRY_RUN ? "dry-run" : "reserved"
    };
  }

  await appendLedgerAndSync(config, ledger);
  console.log(JSON.stringify(ledger, null, 2));
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (isOnce()) {
    await runOnce(config);
    return;
  }

  for (;;) {
    try {
      await runOnce(config);
    } catch (error) {
      console.error(error);
    }
    await new Promise((resolve) => setTimeout(resolve, config.INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
