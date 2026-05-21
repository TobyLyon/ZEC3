import pumpSdk from "@pump-fun/pump-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Commitment, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { WSOL_MINT } from "./constants.js";
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

  async collect(): Promise<{ signatureV1?: string; signatureV2?: string }> {
    const wsolMint = new PublicKey(WSOL_MINT);

    const [v1Instructions, v2Instructions] = await Promise.all([
      this.sdk.collectCoinCreatorFeeInstructions(
        this.creator.publicKey,
        this.creator.publicKey
      ),
      this.sdk.collectCoinCreatorFeeV2Instructions(
        this.creator.publicKey,
        wsolMint,
        TOKEN_PROGRAM_ID,
        this.creator.publicKey
      )
    ]);

    const hasV1 = v1Instructions.length > 0;
    const hasV2 = v2Instructions.length > 0;

    if ((!hasV1 && !hasV2) || this.dryRun) {
      return {};
    }

    let signatureV1: string | undefined;
    let signatureV2: string | undefined;

    if (hasV1) {
      signatureV1 = await sendInstructions({
        connection: this.connection,
        payer: this.creator,
        instructions: v1Instructions,
        commitment: this.commitment
      });
    }

    if (hasV2) {
      signatureV2 = await sendInstructions({
        connection: this.connection,
        payer: this.creator,
        instructions: v2Instructions,
        commitment: this.commitment
      });
    }

    return { signatureV1, signatureV2 };
  }
}
