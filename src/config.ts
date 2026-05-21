import "dotenv/config";
import { z } from "zod";

const boolFromString = z
  .string()
  .optional()
  .transform((value) => value === "true");

const boolDefaultTrueFromString = z
  .string()
  .optional()
  .transform((value) => value !== "false");

const intFromString = z.coerce.number().int().nonnegative();
const numberFromString = z.coerce.number().nonnegative();
const optionalIntFromString = z
  .preprocess((value) => (value === "" || value === undefined ? undefined : value), z.coerce.number().int().nonnegative().optional());
const optionalNumberFromString = z
  .preprocess((value) => (value === "" || value === undefined ? undefined : value), z.coerce.number().nonnegative().optional());

const envSchema = z.object({
  CREATOR_KEYPAIR_PATH: z.string().optional(),
  CREATOR_PRIVATE_KEY_BASE58: z.string().optional(),
  SOLANA_RPC_URL: z.string().url(),
  COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  PROJECT_TOKEN_MINT: z.string().default(""),
  ZEC_SOL_MINT: z.string().min(32),
  SOL_ZEC_BPS: intFromString.max(10_000),
  FLASH_LONG_BPS: optionalIntFromString,
  HOLDER_AIRDROP_BPS: intFromString.max(10_000),
  MIN_CLAIMED_LAMPORTS: z.coerce.bigint().nonnegative(),
  JUPITER_SLIPPAGE_BPS: intFromString.max(10_000),
  FLASH_LONG_LEVERAGE: optionalIntFromString,
  FLASH_LONG_MAX_ORDER_USDC: optionalNumberFromString,
  FLASH_PERPS_ENABLED: boolFromString,
  FLASH_PERPS_MARKET: z.string().default("ZEC"),
  FLASH_POOL: z.string().default("Crypto.1"),
  FLASH_API_URL: z.string().url().default("https://flashapi.trade"),
  FLASH_INPUT_TOKEN_SYMBOL: z.string().default("SOL"),
  FLASH_SLIPPAGE_PERCENTAGE: z.string().default("0.8"),
  FLASH_TAKE_PROFIT_PRICE: z.string().optional(),
  FLASH_STOP_LOSS_PRICE: z.string().optional(),
  FLASH_PROFIT_PULL_MULTIPLE: numberFromString.default(1.5),
  FLASH_PROFIT_WITHDRAW_TOKEN_SYMBOL: z.string().default("ZEC"),
  DRY_RUN: boolFromString,
  INTERVAL_MS: intFromString.min(30_000),
  LEDGER_PATH: z.string().min(1),
  BIRDEYE_API_KEY: z.string().optional(),
  HOLDER_SNAPSHOT_PROVIDER: z.enum(["birdeye", "manual"]).default("birdeye"),
  HOLDER_SNAPSHOT_MIN_BALANCE: numberFromString.default(0),
  HOLDER_EXCLUDED_WALLETS: z.string().default(""),
  HOLDER_SNAPSHOT_PATH: z.string().default("./data/holders-snapshot.json"),
  AIRDROP_DRY_RUN: boolDefaultTrueFromString,
  AIRDROP_DRY_RUN_LAMPORTS: z.coerce.bigint().nonnegative().default(0n),
  AIRDROP_DRY_RUN_PATH: z.string().default("./data/airdrop-dry-run.json"),
  AIRDROP_DISTRIBUTION_ASSET: z.enum(["ZEC", "SOL"]).default("ZEC"),
  AIRDROP_DISTRIBUTION_TOKEN_MINT: z.string().optional(),
  PUBLIC_ENGINE_DATA_PATH: z.string().default("./public/runtime/engine.json")
});

export type AppConfig = z.infer<typeof envSchema> & {
  allocationTotalBps: number;
  FLASH_LONG_BPS: number;
  FLASH_LONG_LEVERAGE: number;
  FLASH_LONG_MAX_ORDER_USDC: number;
  FLASH_PERPS_MARKET: string;
  AIRDROP_DISTRIBUTION_TOKEN_MINT: string;
};

export function loadConfig(argv = process.argv): AppConfig {
  const parsed = envSchema.parse(process.env);
  const cliDryRun = argv.includes("--dry-run");
  const dryRun = cliDryRun || parsed.DRY_RUN;
  const flashLongBps = parsed.FLASH_LONG_BPS ?? 0;
  const flashLongLeverage = parsed.FLASH_LONG_LEVERAGE ?? 1;
  const flashLongMaxOrderUsdc = parsed.FLASH_LONG_MAX_ORDER_USDC ?? 250;
  const allocationTotalBps =
    parsed.SOL_ZEC_BPS + flashLongBps + parsed.HOLDER_AIRDROP_BPS;

  if (allocationTotalBps > 10_000) {
    throw new Error(`Allocation BPS total is ${allocationTotalBps}; it must be <= 10000.`);
  }

  if (!dryRun && parsed.PROJECT_TOKEN_MINT.length < 32) {
    throw new Error("Set PROJECT_TOKEN_MINT before running live.");
  }

  if (!parsed.CREATOR_KEYPAIR_PATH && !parsed.CREATOR_PRIVATE_KEY_BASE58) {
    throw new Error("Set CREATOR_KEYPAIR_PATH or CREATOR_PRIVATE_KEY_BASE58.");
  }

  return {
    ...parsed,
    DRY_RUN: dryRun,
    FLASH_LONG_BPS: flashLongBps,
    FLASH_LONG_LEVERAGE: Math.min(Math.max(flashLongLeverage, 1), 10),
    FLASH_LONG_MAX_ORDER_USDC: flashLongMaxOrderUsdc,
    AIRDROP_DISTRIBUTION_TOKEN_MINT: parsed.AIRDROP_DISTRIBUTION_TOKEN_MINT || parsed.ZEC_SOL_MINT,
    allocationTotalBps
  };
}

export function isOnce(argv = process.argv): boolean {
  return argv.includes("--once") || argv.includes("--dry-run");
}

export function parseWalletList(value: string): string[] {
  return value
    .split(/[,\n\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
