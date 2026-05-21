# ZEC3 Fee Engine

Automates the creator-fee loop:

1. collect Pump.fun creator fees,
2. buy wrapped ZEC on Solana,
3. plan capped ZEC perpetual exposure through Flash Trade,
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

- Jupiter remains the venue for spot ZEC routing and SOL-to-USDC quote sizing. Flash Trade is selected for the ZEC perpetual exposure leg because its public docs list ZEC among supported assets and its TypeScript SDK is published for protocol integration. Live Flash orders should only be enabled after the SDK adapter and collateral route are reviewed.
- Flash Trade live orders use the public transaction-builder API. When `FLASH_PERPS_ENABLED=true` and `DRY_RUN=false`, the runner requests an open-position transaction, signs it with the creator wallet, submits it to Solana, and records the signature.
- Holder airdrops are dry-run first. The holder snapshot command writes `HOLDER_SNAPSHOT_PATH`, and the dry-run command writes a proportional distribution plan to `AIRDROP_DRY_RUN_PATH`. Live sends require `DRY_RUN=false`, `AIRDROP_DRY_RUN=false`, and `--confirm-live-airdrop`.
- Pump fee collection uses the official `@pump-fun/pump-sdk`.
- Pump V2 creator-fee collection can return wrapped SOL; the runner now closes the creator wSOL ATA after V2 collection to unwrap back to SOL.
- The runner syncs `public/runtime/engine.json` after every recorded run so the dashboard can show fresh local activity without a separate manual sync step.
- Use Node 20.19.0 or newer. Vite and newer Solana packages warn on older Node 20 builds.

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
npm run airdrop:send -- --dry-run # simulate sending the generated airdrop plan
npm run airdrop:send -- --confirm-live-airdrop # live send, requires live env flags
npm run dashboard:sync   # publish local runtime artifacts for the frontend
npm run readiness # print launch readiness checks without exposing secrets
npm run check     # TypeScript check
npm run smoke     # check, build, then readiness report
```
