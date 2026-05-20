export function allocateLamports(total: bigint, bps: number): bigint {
  return (total * BigInt(bps)) / 10_000n;
}

export function lamportsToSolNumber(lamports: bigint): number {
  return Number(lamports) / 1_000_000_000;
}

export function decimalString(value: number, digits = 6): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return value.toFixed(digits).replace(/\.?0+$/, "");
}
