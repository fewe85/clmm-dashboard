export interface WalletBalance {
  label: string
  address: string
  balances: { token: string; amount: number; valueUsd: number; priceUnknown?: boolean }[]
  totalUsd: number
}

export interface BotState {
  lastRebalanceAt: string | null
  lastCompoundAt: string | null
  lastHarvestAt: string | null
  lastIdleDeployAt: string | null
  totalRebalances: number
  totalFeesCollectedA: number
  totalFeesCollectedB: number
  harvestEntries: { token: string; amount: number }[]
  ownedAptRaw: number
  ownedUsdcRaw: number
}

export interface HarvestEntry {
  token: string
  amount: number
  valueUsd: number
}

export interface PoolData {
  name: string
  chain: 'aptos'
  protocol: string
  tokenA: string
  tokenB: string
  decimalsA: number
  decimalsB: number
  currentPrice: number
  tickCurrent: number
  tickLower: number
  tickUpper: number
  priceLower: number
  priceUpper: number
  inRange: boolean
  positionValueUsd: number
  amountA: number
  amountB: number
  pendingFeesUsd: number
  feesA: number
  feesB: number
  pendingRewardsUsd: number
  rewardToken: string
  rewardAmount: number
  compoundPending: number
  compoundThreshold: number
  harvestedUsd: number
  harvestDetails: HarvestEntry[]
  triggerDistancePct: number
  botState: BotState | null
  feesApr: number
  rewardsApr: number
  invested: number
  netProfit: number
  lastCollectAt?: string
  positionOpenedAt?: string
  priceHistory?: number[]
  lastUpdated: number
  error?: string
  stale?: boolean
}

export interface RebalanceMetric {
  timestamp: string
  position_value_usd: number
  total_cost_usd?: number
  range_delta_pct?: number
  minutes_since_last?: number
}
