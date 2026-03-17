// CLMM math utilities

const Q64 = 2n ** 64n

// Convert sqrt_price (Q64.64 fixed point) to actual price
export function sqrtPriceX64ToPrice(sqrtPriceX64: bigint, decimalsA: number, decimalsB: number): number {
  const sqrtPrice = Number(sqrtPriceX64) / Number(Q64)
  const price = sqrtPrice * sqrtPrice
  // Adjust for decimal difference: price is in tokenB/tokenA raw units
  const decimalAdjust = Math.pow(10, decimalsA - decimalsB)
  return price * decimalAdjust
}

// Convert tick to price
export function tickToPrice(tick: number, decimalsA: number, decimalsB: number): number {
  const price = Math.pow(1.0001, tick)
  const decimalAdjust = Math.pow(10, decimalsA - decimalsB)
  return price * decimalAdjust
}

// Convert tick to sqrt_price (as number, not bigint)
export function tickToSqrtPrice(tick: number): number {
  return Math.pow(1.0001, tick / 2)
}

// Decode Sui I32 (stored as u32 bits)
export function decodeI32(bits: number): number {
  if (bits >= 2 ** 31) {
    return bits - 2 ** 32
  }
  return bits
}

// Decode Aptos I64 (stored as u64 string bits)
export function decodeI64(bitsStr: string): number {
  const bits = BigInt(bitsStr)
  if (bits >= 2n ** 63n) {
    return Number(bits - 2n ** 64n)
  }
  return Number(bits)
}

// Calculate position amounts from liquidity and tick range
export function calculatePositionAmounts(
  liquidity: number,
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
  decimalsA: number,
  decimalsB: number,
): { amountA: number; amountB: number } {
  const sqrtPriceCurrent = tickToSqrtPrice(tickCurrent)
  const sqrtPriceLower = tickToSqrtPrice(tickLower)
  const sqrtPriceUpper = tickToSqrtPrice(tickUpper)

  let amountA = 0
  let amountB = 0

  if (tickCurrent < tickLower) {
    // All token A
    amountA = liquidity * (1 / sqrtPriceLower - 1 / sqrtPriceUpper)
  } else if (tickCurrent >= tickUpper) {
    // All token B
    amountB = liquidity * (sqrtPriceUpper - sqrtPriceLower)
  } else {
    // Mixed
    amountA = liquidity * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper)
    amountB = liquidity * (sqrtPriceCurrent - sqrtPriceLower)
  }

  return {
    amountA: amountA / Math.pow(10, decimalsA),
    amountB: amountB / Math.pow(10, decimalsB),
  }
}

// Price-based trigger distance: how far current price is from range center (0-100%)
export function calcTriggerDistancePct(tickCurrent: number, tickLower: number, tickUpper: number): number {
  const priceCurrent = 1.0001 ** tickCurrent
  const priceLower = 1.0001 ** tickLower
  const priceUpper = 1.0001 ** tickUpper
  const priceCenter = (priceLower + priceUpper) / 2
  const halfRange = (priceUpper - priceLower) / 2
  if (halfRange <= 0) return 0
  const distFromCenter = Math.abs(priceCurrent - priceCenter)
  return Math.min((distFromCenter / halfRange) * 100, 100)
}
