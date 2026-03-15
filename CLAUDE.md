# CLMM Dashboard

## Known Fixes

### APR too low for new pools without bot state (2026-03-14)
- **Bug:** IKA/USDC showed 178% vs Turbos UI 821% (4.6x), SUI/USDC showed 101% vs 347% (3.4x). DEEP/WAL were correct.
- **Root Cause:** When bot state API returns null (no `openedAt`), APR calculation fell back to hardcoded `BOT_START` (midnight March 13). But positions were created much later — the time denominator was inflated, making APR appear too low.
- **Fix:** Fetch actual position creation timestamp from on-chain (`previousTransaction` → `sui_getTransactionBlock` → `timestampMs`). Use `positionOpenedAt` as fallback instead of hardcoded bot start.
- **Also:** Reverted incorrect TURBOS reward processing for IKA/USDC and SUI/USDC — these pools have no TURBOS emissions. Removed fake $0.000000 TURBOS entries from reward display.
