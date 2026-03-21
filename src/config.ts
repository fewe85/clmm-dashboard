export const POOL_NAME = 'APT/USDC'
export const CHAIN = 'Aptos'
export const DEX = 'Thala Finance'
export const INVESTED = 101
export const RANGE_PERCENT = 2.1
export const BOT_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'
export const PETRA_WALLET = '0x469f005fa97b1dd229ace5a677955611a11e24d88a178770d5f9948b8c2eb211'
export const BOT_START = '2026-03-10T17:11:59.000Z'
export const REFRESH_INTERVAL = 120_000 // 2 min

// Range optimization parameters (measured via CoinGecko 365d, 2026-03-18)
export const SIGMA_DAILY = 0.047 // APT daily volatility
export const ESTIMATED_C = 0.002 // estimated swap cost per rebalance
export const F_EFF_DAILY = 0.00337 // effective daily fee (pool fee/365 + 50% × reward APR)
export const EST_SWAP_COST_PER_REBALANCE = 0.03 // ~$0.03 per rebalance (Thala 0.05% × ~$50)
