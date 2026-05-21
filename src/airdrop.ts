import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import type { AirdropDryRunPlan } from "./types.js";

const BATCH_SIZE = 15;

export type AirdropBatchResult = {
  batchIndex: number;
  recipientCount: number;
  lamportsSent: string;
  signature: string;
};

export type AirdropExecutionResult = {
  totalSentLamports: string;
  batchCount: number;
  skippedRecipients: number;
  batches: AirdropBatchResult[];
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function executeAirdropPlan(options: {
  connection: Connection;
  payer: Keypair;
  plan: AirdropDryRunPlan;
  commitment: Commitment;
  dryRun: boolean;
}): Promise<AirdropExecutionResult> {
  const { connection, payer, plan, commitment, dryRun } = options;
  const batches = chunkArray(plan.recipients, BATCH_SIZE);
  const results: AirdropBatchResult[] = [];
  let totalSent = 0n;
  let skipped = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const tx = new Transaction();
    let batchLamports = 0n;
    let batchRecipients = 0;

    for (const recipient of batch) {
      const lamports = BigInt(recipient.lamports);
      if (lamports === 0n) {
        skipped++;
        continue;
      }
      if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
        console.warn(`[airdrop] recipient ${recipient.owner} lamports ${lamports} exceeds safe integer, skipping`);
        skipped++;
        continue;
      }
      tx.add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: new PublicKey(recipient.owner),
          lamports: Number(lamports)
        })
      );
      batchLamports += lamports;
      batchRecipients++;
    }

    if (tx.instructions.length === 0) continue;

    if (dryRun) {
      results.push({
        batchIndex: i,
        recipientCount: batchRecipients,
        lamportsSent: batchLamports.toString(),
        signature: "dry-run"
      });
      totalSent += batchLamports;
      continue;
    }

    const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment });
    results.push({
      batchIndex: i,
      recipientCount: batchRecipients,
      lamportsSent: batchLamports.toString(),
      signature
    });
    totalSent += batchLamports;
  }

  return {
    totalSentLamports: totalSent.toString(),
    batchCount: results.length,
    skippedRecipients: skipped,
    batches: results
  };
}
