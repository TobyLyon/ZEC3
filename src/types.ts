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

export type HolderSnapshotSource = "birdeye" | "manual";

export type HolderSnapshotHolder = {
  owner: string;
  balanceRaw?: string;
  balanceUi: number;
  supplyPercent?: number;
  sourceRank: number;
};

export type HolderSnapshot = {
  version: 1;
  tokenMint: string;
  source: HolderSnapshotSource;
  createdAt: string;
  minBalanceUi: number;
  excludedWallets: string[];
  totalFetched: number;
  totalEligible: number;
  totalBalanceUi: number;
  holders: HolderSnapshotHolder[];
};

export type AirdropDryRunRecipient = {
  owner: string;
  balanceUi: number;
  lamports: string;
  sol: number;
  sharePct: number;
};

export type AirdropDryRunPlan = {
  version: 1;
  createdAt: string;
  tokenMint: string;
  snapshotCreatedAt: string;
  inputLamports: string;
  totalAssignedLamports: string;
  remainderLamports: string;
  recipientCount: number;
  recipients: AirdropDryRunRecipient[];
};
