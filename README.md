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
- `BIRDEYE_API_KEY`: used by the holder snapshot command after launch.
- `HOLDER_EXCLUDED_WALLETS`: treasury, team, LP, burn, and other wallets that should not receive holder rewards.

## Important Operating Notes

- Jupiter is now the venue for both spot ZEC routing and the planned ZEC long leg. The current runner records the long sizing and cap in the ledger; wire a dedicated Jupiter perps execution adapter before running that leg live.
- Holder airdrops are dry-run first. The holder snapshot command writes `HOLDER_SNAPSHOT_PATH`, and the dry-run command writes a proportional distribution plan to `AIRDROP_DRY_RUN_PATH`.
- Pump fee collection uses the official `@pump-fun/pump-sdk`.

## Holder Snapshot Pipeline

After the ZEC3 token launches and `PROJECT_TOKEN_MINT` is known:

```bash
npm run holders:snapshot
npm run holders:dry-run
npm run dashboard:sync
```

The snapshot pipeline pulls wallet-level holders from Birdeye, normalizes duplicate owners, removes configured exclusions, applies the minimum balance rule, and stores an immutable local JSON artifact. The dry-run then allocates the configured lamport amount across eligible holders without sending funds. Keep `AIRDROP_DRY_RUN=true` until the holder snapshot, exclusions, and generated distribution totals have been reviewed.

`npm run dashboard:sync` converts the local runner ledger and holder snapshot into `public/runtime/engine.json`, which the site reads as its live dashboard artifact.

## Commands

```bash
npm run dry-run   # simulate one pass
npm run once      # execute one pass if DRY_RUN=false
npm run daemon    # repeat forever every INTERVAL_MS
npm run holders:snapshot # fetch and write the holder snapshot after launch
npm run holders:dry-run  # generate the proportional holder airdrop plan
npm run dashboard:sync   # publish local runtime artifacts for the frontend
npm run readiness # print launch readiness checks without exposing secrets
npm run check     # TypeScript check
npm run smoke     # check, build, then readiness report
```
