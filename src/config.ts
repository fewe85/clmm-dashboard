// ─── Global ──────────────────────────────────────────────────────────────────
export const CHAIN = 'Aptos'
export const DEX = 'Thala Finance'
export const BOT_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'
export const PETRA_WALLET = '0x469f005fa97b1dd229ace5a677955611a11e24d88a178770d5f9948b8c2eb211'
export const REFRESH_INTERVAL = 30_000 // 30 sec — fast refresh for live APR

// ─── ELON/USDC Pool (single pool since 2026-04-02 migration) ────────────────
// APT/USDC pool closed, all capital migrated to ELON/USDC
export const ELON_POOL_NAME = 'MINE: [ELON/USDC]'
export const ELON_INVESTED = 637  // 370 initial + 63 (04-04 AM) + 22 + 131 + 56 + 12 + 68 (04-04 PM) via Echelon borrow
export const ELON_BOT_START = '2026-04-02T12:00:00.000Z'  // Migration reset

// ─── Totals ──────────────────────────────────────────────────────────────────
export const INITIAL_CAPITAL = ELON_INVESTED
