import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint
} from "@solana/spl-token";
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

const SOL_BATCH_SIZE = 15;
const TOKEN_BATCH_SIZE = 5;

export type AirdropBatchResult = {
  batchIndex: number;
  recipientCount: number;
  lamportsSent: string;
  tokenAmountSent?: string;
  signature: string;
};

export type AirdropExecutionResult = {
  totalSentLamports: string;
  totalSentTokenAmount?: string;
  tokenMint?: string;
  batchCount: number;
  skippedRecipients: number;
  batches: AirdropBatchResult[];
};

export type AirdropDistribution =
  | { asset: "SOL" }
  | {
      asset: "SPL_TOKEN";
      mint: PublicKey;
      amountRaw: bigint;
      decimals?: number;
    };

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function allocateTokenAmount(plan: AirdropDryRunPlan, recipientLamports: bigint, tokenAmountRaw: bigint): bigint {
  const totalAssignedLamports = BigInt(plan.totalAssignedLamports);
  if (totalAssignedLamports <= 0n) return 0n;
  return (tokenAmountRaw * recipientLamports) / totalAssignedLamports;
}

async function executeTokenAirdropPlan(options: {
  connection: Connection;
  payer: Keypair;
  plan: AirdropDryRunPlan;
  commitment: Commitment;
  dryRun: boolean;
  mint: PublicKey;
  amountRaw: bigint;
  decimals?: number;
}): Promise<AirdropExecutionResult> {
  const { connection, payer, plan, commitment, dryRun, mint, amountRaw } = options;
  const decimals = options.decimals ?? (await getMint(connection, mint, commitment)).decimals;
  const batches = chunkArray(plan.recipients, TOKEN_BATCH_SIZE);
  const sourceAta = getAssociatedTokenAddressSync(mint, payer.publicKey);
  const results: AirdropBatchResult[] = [];
  let totalSent = 0n;
  let skipped = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const tx = new Transaction();
    let batchTokenAmount = 0n;
    let batchRecipients = 0;

    for (const recipient of batch) {
      const recipientLamports = BigInt(recipient.lamports);
      const tokenAmount = allocateTokenAmount(plan, recipientLamports, amountRaw);
      if (tokenAmount === 0n) {
        skipped++;
        continue;
      }

      const owner = new PublicKey(recipient.owner);
      const destinationAta = getAssociatedTokenAddressSync(mint, owner);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          destinationAta,
          owner,
          mint
        ),
        createTransferCheckedInstruction(
          sourceAta,
          mint,
          destinationAta,
          payer.publicKey,
          tokenAmount,
          decimals
        )
      );
      batchTokenAmount += tokenAmount;
      batchRecipients++;
    }

    if (tx.instructions.length === 0) continue;

    if (dryRun) {
      results.push({
        batchIndex: i,
        recipientCount: batchRecipients,
        lamportsSent: "0",
        tokenAmountSent: batchTokenAmount.toString(),
        signature: "dry-run"
      });
      totalSent += batchTokenAmount;
      continue;
    }

    const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment });
    results.push({
      batchIndex: i,
      recipientCount: batchRecipients,
      lamportsSent: "0",
      tokenAmountSent: batchTokenAmount.toString(),
      signature
    });
    totalSent += batchTokenAmount;
  }

  return {
    totalSentLamports: "0",
    totalSentTokenAmount: totalSent.toString(),
    tokenMint: mint.toBase58(),
    batchCount: results.length,
    skippedRecipients: skipped,
    batches: results
  };
}

export async function executeAirdropPlan(options: {
  connection: Connection;
  payer: Keypair;
  plan: AirdropDryRunPlan;
  commitment: Commitment;
  dryRun: boolean;
  distribution?: AirdropDistribution;
}): Promise<AirdropExecutionResult> {
  const { connection, payer, plan, commitment, dryRun, distribution = { asset: "SOL" } } = options;

  if (distribution.asset === "SPL_TOKEN") {
    return executeTokenAirdropPlan({
      connection,
      payer,
      plan,
      commitment,
      dryRun,
      mint: distribution.mint,
      amountRaw: distribution.amountRaw,
      decimals: distribution.decimals
    });
  }

  const batches = chunkArray(plan.recipients, SOL_BATCH_SIZE);
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
