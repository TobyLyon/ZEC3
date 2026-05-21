import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RunLedger } from "./types.js";

function stringifyLedger(ledger: RunLedger): string {
  return JSON.stringify(ledger, (_key, value) => (
    typeof value === "bigint" ? value.toString() : value
  ));
}

export async function appendLedger(path: string, ledger: RunLedger): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${stringifyLedger(ledger)}\n`, "utf8");
}
