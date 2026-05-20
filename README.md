# ZEC3 Fee Engine

Automates the creator-fee loop:

1. collect Pump.fun creator fees,
2. buy wrapped ZEC on Solana,
3. size a ZEC long through Jupiter,
4. reserve realized long profits for token-holder airdrops.

The implementation is dry-run first. Set `DRY_RUN=false` only after the wallet, token mint, RPC, and trade caps are configured.

## Setup

```bash
npm install
cp .env.example .env
npm run dry-run
```

Required configuration:

- `PROJECT_TOKEN_MINT`: the Pump.fun token mint.
- `CREATOR_KEYPAIR_PATH` or `CREATOR_PRIVATE_KEY_BASE58`: the Solana creator wallet that can claim Pump creator fees.

## Important Operating Notes

- Jupiter is now the venue for both spot ZEC routing and the planned ZEC long leg. The current runner records the long sizing and cap in the ledger; wire a dedicated Jupiter perps execution adapter before running that leg live.
- Holder airdrops are represented as a reserve ledger leg. Add a holder snapshot and distribution adapter before sending live airdrops.
- Pump fee collection uses the official `@pump-fun/pump-sdk`.

## Commands

```bash
npm run dry-run   # simulate one pass
npm run once      # execute one pass if DRY_RUN=false
npm run daemon    # repeat forever every INTERVAL_MS
npm run check     # TypeScript check
```
