export interface WalletBalance {
  gasToken: string
  gasBalance: number
  gasValueUsd: number
  idleBalances: { token: string; amount: number; valueUsd: number; priceUnknown?: boolean }[]
  totalIdleUsd: number // excludes gas reserve
}

export interface BotState {
  lastRebalanceAt: string | null
  lastCompoundAt: string | null
  totalRebalances: number
  totalFeesCollectedA: number // raw base units converted to human
  totalFeesCollectedB: number
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
  rewardLabel?: string // override display (e.g. "1.23 IKA + 0.45 USDC")
  rewardDetails?: { token: string; amount: number; valueUsd: number }[]
  compoundPending: number
  compoundThreshold: number
  triggerDistancePct: number
  botState: BotState | null
  feesApr: number
  rewardsApr: number
  lastUpdated: number
  error?: string
  stale?: boolean
}

export interface PoolPerformance {
  poolName: string
  initialInvestment: number
  startPrice: number       // price of tokenA at start (in tokenB/USD)
  currentPrice: number
  hodlValueUsd: number     // what 50/50 hold would be worth now
  lpValueUsd: number       // position + pending fees + pending rewards
  outperformanceUsd: number
  outperformancePct: number
  totalFeesEarnedUsd: number  // cumulative (collected + pending)
  totalRebalances: number
  netProfitUsd: number     // lpValue - initialInvestment
  netProfitPct: number
  daysRunning: number
  realizedApr: number      // annualized net profit %
}

export interface PoolGroup {
  protocol: string
  chain: 'sui' | 'aptos'
  chainColor: string
  walletBalance: WalletBalance | null
  pools: PoolData[]
}

export interface AllWallets {
  sui: WalletBalance | null
  aptos: WalletBalance | null
}
