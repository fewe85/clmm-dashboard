# CLMM Dashboard

Real-time monitoring dashboard for two CLMM liquidity bot positions:

- **DEEP/USDC** on Turbos Finance (Sui Mainnet)
- **APT/USDC** on Thala Finance (Aptos Mainnet)

Static site — no backend, no secrets, only public RPC calls.

## Features

- Two pool panels side-by-side (stacked on mobile)
- Current price, position range with visual range bar
- In-Range / Out-of-Range status indicator
- Position value, pending fees, pending rewards in USD
- Compound progress bar
- Portfolio overview (total value, daily fee estimate)
- Auto-refresh every 60 seconds
- Dark theme, mobile-first design

## Development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Update `homepage` in `package.json` with your GitHub username
2. Update `base` in `vite.config.ts` if your repo name differs

```bash
npm run deploy
```

This builds the project and publishes the `dist/` folder to the `gh-pages` branch.

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Recharts (available for future charts)
- Direct on-chain RPC calls (no indexers, no external APIs)
