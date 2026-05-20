import { loadConfig, isOnce } from "./config.js";
import { USDC_MINT, WSOL_MINT } from "./constants.js";
import { getJupiterQuote, swapWithJupiter } from "./jupiter.js";
import { appendLedger } from "./ledger.js";
import { allocateLamports } from "./math.js";
import { PumpFees } from "./pump.js";
import { createConnection } from "./solana.js";
import { loadSolanaKeypair } from "./wallet.js";
import type { RunLedger } from "./types.js";

async function runOnce(): Promise<void> {
  const config = loadConfig();
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
    projectTokenMint: config.PROJECT_TOKEN_MINT
  };

  const before = await pump.getCreatorFeeLamports();
  const collectResult = await pump.collect();
  const after = config.DRY_RUN ? before : await pump.getCreatorFeeLamports();
  const claimed = config.DRY_RUN ? before : before - after;

  ledger.claim = {
    beforeLamports: before.toString(),
    afterLamports: after.toString(),
    claimedLamports: claimed.toString(),
    signature: collectResult.signature
  };

  if (claimed < config.MIN_CLAIMED_LAMPORTS) {
    ledger.skippedReason = `claimed ${claimed} lamports is below MIN_CLAIMED_LAMPORTS`;
    await appendLedger(config.LEDGER_PATH, ledger);
    console.log(JSON.stringify(ledger, null, 2));
    return;
  }

  const solZecLamports = allocateLamports(claimed, config.SOL_ZEC_BPS);
  const jupiterLongLamports = allocateLamports(claimed, config.JUPITER_LONG_BPS);
  const holderAirdropLamports = allocateLamports(claimed, config.HOLDER_AIRDROP_BPS);
  const retainedLamports = claimed - solZecLamports - jupiterLongLamports - holderAirdropLamports;

  ledger.allocations = {
    solZecLamports: solZecLamports.toString(),
    jupiterLongLamports: jupiterLongLamports.toString(),
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

  if (jupiterLongLamports > 0n) {
    const solUsdcQuote = await getJupiterQuote({
      inputMint: WSOL_MINT,
      outputMint: USDC_MINT,
      amount: jupiterLongLamports,
      slippageBps: config.JUPITER_SLIPPAGE_BPS
    });
    const quotedNotionalUsdc = Number(solUsdcQuote.outAmount) / 1_000_000;
    const cappedNotionalUsdc = Math.min(quotedNotionalUsdc, config.JUPITER_LONG_MAX_ORDER_USDC);

    ledger.jupiterLong = {
      venue: "Jupiter",
      inputLamports: jupiterLongLamports.toString(),
      quotedNotionalUsdc,
      cappedNotionalUsdc,
      leverage: config.JUPITER_LONG_LEVERAGE,
      status: config.DRY_RUN ? "dry-run" : "pending-jupiter-perps-adapter"
    };
  }

  if (holderAirdropLamports > 0n) {
    ledger.holderAirdrop = {
      inputLamports: holderAirdropLamports.toString(),
      source: "realized-long-profit-reserve",
      recipients: "project-token-holders",
      status: config.DRY_RUN ? "dry-run" : "reserved"
    };
  }

  await appendLedger(config.LEDGER_PATH, ledger);
  console.log(JSON.stringify(ledger, null, 2));
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (isOnce()) {
    await runOnce();
    return;
  }

  for (;;) {
    try {
      await runOnce();
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
