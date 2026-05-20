import pumpSdk from "@pump-fun/pump-sdk";
import { Commitment, Connection, Keypair } from "@solana/web3.js";
import { sendInstructions } from "./solana.js";

const { OnlinePumpSdk } = pumpSdk;

export class PumpFees {
  private readonly sdk: InstanceType<typeof OnlinePumpSdk>;

  constructor(
    private readonly connection: Connection,
    private readonly creator: Keypair,
    private readonly commitment: Commitment,
    private readonly dryRun: boolean
  ) {
    this.sdk = new OnlinePumpSdk(connection);
  }

  async getCreatorFeeLamports(): Promise<bigint> {
    const balance = await this.sdk.getCreatorVaultBalanceBothPrograms(this.creator.publicKey);
    return BigInt(balance.toString());
  }

  async collect(): Promise<{ signature?: string }> {
    const instructions = await this.sdk.collectCoinCreatorFeeInstructions(
      this.creator.publicKey,
      this.creator.publicKey
    );

    if (instructions.length === 0 || this.dryRun) {
      return {};
    }

    const signature = await sendInstructions({
      connection: this.connection,
      payer: this.creator,
      instructions,
      commitment: this.commitment
    });

    return { signature };
  }
}
