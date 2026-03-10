export interface WalletBalance {
  gasToken: string
  gasBalance: number
  gasValueUsd: number
  idleBalances: { token: string; amount: number; valueUsd: number }[]
  totalIdleUsd: number // excludes gas reserve
}

export interface BotState {
  lastRebalanceAt: string | null
  lastCompoundAt: string | null
}

export interface PoolData {
  name: string
  chain: 'sui' | 'aptos'
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
  triggerDistancePct: number
  walletBalance: WalletBalance | null
  botState: BotState | null
  feesApr: number
  rewardsApr: number
  lastUpdated: number
  error?: string
}
