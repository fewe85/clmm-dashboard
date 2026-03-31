# CLMM Dashboard

Real-time monitoring dashboard for concentrated liquidity bot positions on **Thala Finance** (Aptos Mainnet).

## Pools

| Pool | Fee Tier | Strategy |
|------|----------|----------|
| **APT/USDC** | 0.05% (5 bps) | Tight range, low slippage, high concentration |
| **ELON/USDC** | 0.3% (30 bps) | Wider range, high APR from thAPT rewards |

Both pools are managed by automated CLMM bots that rebalance positions, harvest fees + thAPT rewards, and transfer earnings to a separate wallet.

## Features

- **Portfolio Overview** — total value, CLMM vs HODL performance, daily earnings estimate, harvest countdown timer
- **Per-Pool Cards** — price, position range with visual bar, in-range status, APR breakdown (fees + rewards)
- **P&L Breakdown** — fees, rewards, harvested, IL, swap costs, gas costs, net P&L
- **CLMM vs HODL** — accurate comparison using `priceAtReset` baseline (no double-counting)
- **Range Optimization** — live formula output with three constraints:
  - `δ* Formel` = `4 × c_p75 × σ² / f_eff` (75th percentile slippage)
  - `δ* Reb-Cap` = `σ / √N_max` (max 12 rebalances/day)
  - `δ* Tick-Min` = minimum viable tick count
  - `δ* Risk-Adj.` = 1.5× safety multiplier on the binding constraint
- **Harvest Timer** — real countdown to next harvest check (synced with bot poll cycle)
- **Performance Chart** — net profit and vs HODL over time (from earnings snapshots)
- **Wallet Balances** — bot wallet + harvest wallet with live token prices
- Auto-refresh every 3 minutes, dark theme

## Architecture

Static site — no backend, no secrets. All data comes from:
- Aptos fullnode RPC (pool state, position info, pending fees/rewards)
- Bot state JSON files (written by bots to `dist/api/bot-state/`)
- CoinGecko API (24h price changes)

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
npx gh-pages -d dist
```

Bots also write state to `dist/api/bot-state/` on every poll cycle, keeping the dashboard data fresh.

## Tech Stack

- Vite + React + TypeScript
- Recharts (performance charts)
- Direct on-chain Aptos RPC calls
