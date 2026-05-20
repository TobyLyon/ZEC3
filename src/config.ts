import "dotenv/config";
import { z } from "zod";

const boolFromString = z
  .string()
  .optional()
  .transform((value) => value === "true");

const intFromString = z.coerce.number().int().nonnegative();
const numberFromString = z.coerce.number().nonnegative();

const envSchema = z.object({
  CREATOR_KEYPAIR_PATH: z.string().optional(),
  CREATOR_PRIVATE_KEY_BASE58: z.string().optional(),
  SOLANA_RPC_URL: z.string().url(),
  COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  PROJECT_TOKEN_MINT: z.string().min(32),
  ZEC_SOL_MINT: z.string().min(32),
  SOL_ZEC_BPS: intFromString.max(10_000),
  JUPITER_LONG_BPS: intFromString.max(10_000),
  HOLDER_AIRDROP_BPS: intFromString.max(10_000),
  MIN_CLAIMED_LAMPORTS: z.coerce.bigint().nonnegative(),
  JUPITER_SLIPPAGE_BPS: intFromString.max(10_000),
  JUPITER_LONG_LEVERAGE: intFromString.min(1).max(10),
  JUPITER_LONG_MAX_ORDER_USDC: numberFromString,
  DRY_RUN: boolFromString,
  INTERVAL_MS: intFromString.min(30_000),
  LEDGER_PATH: z.string().min(1)
});

export type AppConfig = z.infer<typeof envSchema> & {
  allocationTotalBps: number;
};

export function loadConfig(argv = process.argv): AppConfig {
  const parsed = envSchema.parse(process.env);
  const cliDryRun = argv.includes("--dry-run");
  const dryRun = cliDryRun || parsed.DRY_RUN;
  const allocationTotalBps =
    parsed.SOL_ZEC_BPS + parsed.JUPITER_LONG_BPS + parsed.HOLDER_AIRDROP_BPS;

  if (allocationTotalBps > 10_000) {
    throw new Error(`Allocation BPS total is ${allocationTotalBps}; it must be <= 10000.`);
  }

  if (!parsed.CREATOR_KEYPAIR_PATH && !parsed.CREATOR_PRIVATE_KEY_BASE58) {
    throw new Error("Set CREATOR_KEYPAIR_PATH or CREATOR_PRIVATE_KEY_BASE58.");
  }

  return {
    ...parsed,
    DRY_RUN: dryRun,
    allocationTotalBps
  };
}

export function isOnce(argv = process.argv): boolean {
  return argv.includes("--once") || argv.includes("--dry-run");
}
