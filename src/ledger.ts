import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RunLedger } from "./types.js";

export async function appendLedger(path: string, ledger: RunLedger): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(ledger)}\n`, "utf8");
}
