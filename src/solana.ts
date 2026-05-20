import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction
} from "@solana/web3.js";

export function createConnection(rpcUrl: string, commitment: Commitment): Connection {
  return new Connection(rpcUrl, commitment);
}

export async function sendSignedVersionedTransaction(
  connection: Connection,
  tx: VersionedTransaction
): Promise<string> {
  const signature = await connection.sendTransaction(tx, {
    maxRetries: 5,
    skipPreflight: false
  });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function sendInstructions(options: {
  connection: Connection;
  payer: Keypair;
  instructions: Parameters<Transaction["add"]>;
  commitment: Commitment;
}): Promise<string> {
  const transaction = new Transaction().add(...options.instructions);
  return sendAndConfirmTransaction(options.connection, transaction, [options.payer], {
    commitment: options.commitment
  });
}

export function publicKey(value: string): PublicKey {
  return new PublicKey(value);
}
