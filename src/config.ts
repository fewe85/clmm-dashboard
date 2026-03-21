// ─── Global ──────────────────────────────────────────────────────────────────
export const CHAIN = 'Aptos'
export const DEX = 'Thala Finance'
export const BOT_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'
export const PETRA_WALLET = '0x469f005fa97b1dd229ace5a677955611a11e24d88a178770d5f9948b8c2eb211'
export const REFRESH_INTERVAL = 120_000 // 2 min

// ─── APT/USDC Pool ──────────────────────────────────────────────────────────
export const APT_POOL_NAME = 'APT/USDC'
export const APT_INVESTED = 101
export const APT_RANGE_PERCENT = 2.1
export const APT_BOT_START = '2026-03-10T17:11:59.000Z'
export const APT_SIGMA_DAILY = 0.047
export const APT_ESTIMATED_C = 0.002
export const APT_F_EFF_DAILY = 0.00337
export const APT_EST_SWAP_COST_PER_REBALANCE = 0.03

// ─── ELON/USDC Pool ─────────────────────────────────────────────────────────
export const ELON_POOL_NAME = 'ELON/USDC'
export const ELON_INVESTED = 100
export const ELON_RANGE_PERCENT = 2.5
export const ELON_BOT_START = '2026-03-21T20:14:31.234Z'
export const ELON_SIGMA_DAILY = 0.08
export const ELON_ESTIMATED_C = 0.004
export const ELON_F_EFF_DAILY = 0.0022
export const ELON_EST_SWAP_COST_PER_REBALANCE = 0.03

// ─── Totals ──────────────────────────────────────────────────────────────────
export const INITIAL_CAPITAL = APT_INVESTED + ELON_INVESTED // 201

// Legacy aliases (components that still use them)
export const POOL_NAME = APT_POOL_NAME
export const INVESTED = APT_INVESTED
export const RANGE_PERCENT = APT_RANGE_PERCENT
export const BOT_START = APT_BOT_START
export const SIGMA_DAILY = APT_SIGMA_DAILY
export const ESTIMATED_C = APT_ESTIMATED_C
export const F_EFF_DAILY = APT_F_EFF_DAILY
export const EST_SWAP_COST_PER_REBALANCE = APT_EST_SWAP_COST_PER_REBALANCE
