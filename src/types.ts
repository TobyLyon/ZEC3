export type SignatureResult = {
  signature: string;
};

export type TradeResult = SignatureResult & {
  inputLamports: bigint;
  outputAmount?: bigint;
};

export type RunLedger = {
  at: string;
  dryRun: boolean;
  creator: string;
  projectTokenMint: string;
  claim?: {
    beforeLamports: string;
    afterLamports: string;
    claimedLamports: string;
    signature?: string;
  };
  allocations?: {
    solZecLamports: string;
    jupiterLongLamports: string;
    holderAirdropLamports: string;
    retainedLamports: string;
  };
  solZec?: unknown;
  jupiterLong?: unknown;
  holderAirdrop?: unknown;
  skippedReason?: string;
};
