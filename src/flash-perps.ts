export type FlashPerpsLongResult = {
  venue: "Flash Trade";
  market: string;
  pool: string;
  inputLamports: string;
  quotedNotionalUsdc: number;
  cappedNotionalUsdc: number;
  leverage: number;
  status: "dry-run" | "disabled" | "requires-sdk-adapter";
  note: string;
};

export function normalizeFlashMarket(value: string): string {
  return value.trim().toUpperCase() || "ZEC";
}

export function planFlashPerpsLong(options: {
  market: string;
  pool: string;
  enabled: boolean;
  dryRun: boolean;
  inputLamports: bigint;
  quotedNotionalUsdc: number;
  cappedNotionalUsdc: number;
  leverage: number;
}): FlashPerpsLongResult {
  const market = normalizeFlashMarket(options.market);

  if (options.dryRun) {
    return {
      venue: "Flash Trade",
      market,
      pool: options.pool,
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
      inputLamports: options.inputLamports.toString(),
      quotedNotionalUsdc: options.quotedNotionalUsdc,
      cappedNotionalUsdc: options.cappedNotionalUsdc,
      leverage: options.leverage,
      status: "disabled",
      note: "Set FLASH_PERPS_ENABLED=true only after the Flash SDK adapter is reviewed and collateral routing is confirmed."
    };
  }

  return {
    venue: "Flash Trade",
    market,
    pool: options.pool,
    inputLamports: options.inputLamports.toString(),
    quotedNotionalUsdc: options.quotedNotionalUsdc,
    cappedNotionalUsdc: options.cappedNotionalUsdc,
    leverage: options.leverage,
    status: "requires-sdk-adapter",
    note: "Flash is selected for the ZEC long leg; live order execution requires wiring the flash-sdk open-position flow with the selected pool and collateral route."
  };
}
