# CLMM Dashboard

## Known Fixes

### TURBOS Rewards missing from APR calculation (2026-03-14)
- **Bug:** IKA/USDC and SUI/USDC Dashboard APR was massively too low (170% vs 821%, 100% vs 347%)
- **Root Cause:** TURBOS reward emissions were not counted in either pool. `suiUsdc.ts` skipped TURBOS reward slots, `ika.ts` ignored the TURBOS slot entirely.
- **Fix:** Added TURBOS/SUI price pool lookup and TURBOS reward slot processing in both `src/services/ika.ts` and `src/services/suiUsdc.ts`.
