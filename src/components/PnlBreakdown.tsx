import type { BotState, PoolData } from '../types'

interface Props {
  pool: PoolData
  botState: BotState | null
  totalHarvested: number
  estSwapCost?: number
}

function formatUsd(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1) return `$${abs.toFixed(2)}`
  if (abs >= 0.01) return `$${abs.toFixed(4)}`
  return `$${abs.toFixed(6)}`
}

export function PnlBreakdown({ pool, botState, totalHarvested, estSwapCost = 0.03 }: Props) {
  if (!botState || !pool) return null

  const tokenAPrice = pool.currentPrice || (pool.tokenA === 'APT' ? 0.96 : 0.12)

  // Fees earned from on-chain position
  const feesUsd = pool.feesA * tokenAPrice + pool.feesB

  // Rewards = total harvested
  const rewardsUsd = totalHarvested

  // IL calculation — derive entry state for hodl comparison
  let entryA = 0
  let entryUsdc = 0
  let ilUsd = 0
  let ilPct = 0
  let hasIlData = false

  // Try ownedRaw first (post-rebalance state)
  const ownedA = botState.ownedAptRaw / 1e8
  const ownedUsdc = botState.ownedUsdcRaw / 1e6
  const ownedTotalValue = ownedA * tokenAPrice + ownedUsdc

  if (ownedTotalValue > pool.invested * 0.5) {
    // ownedRaw represents actual position entry (post-rebalance amounts)
    entryA = ownedA
    entryUsdc = ownedUsdc
    hasIlData = true
  } else if (botState.centerPrice > 0 && pool.invested > 0) {
    // ownedRaw is wallet remnants — compute entry from invested + centerPrice (50/50 split)
    entryUsdc = pool.invested / 2
    entryA = (pool.invested / 2) / botState.centerPrice
    hasIlData = true
  }

  if (hasIlData) {
    const hodlValue = entryA * tokenAPrice + entryUsdc
    const positionValue = pool.amountA * tokenAPrice + pool.amountB
    ilUsd = positionValue - hodlValue
    ilPct = hodlValue > 0 ? (ilUsd / hodlValue) * 100 : 0
  }

  // Swap costs (estimated)
  const totalRebalances = botState.totalRebalances || 0
  const swapCosts = totalRebalances * estSwapCost

  // Net P&L
  const netPnl = feesUsd + rewardsUsd + ilUsd - swapCosts

  const rows: { label: string; value: number; suffix?: string; alwaysShow?: boolean }[] = [
    { label: 'Fees earned', value: feesUsd, alwaysShow: true },
    { label: 'Rewards earned', value: rewardsUsd, alwaysShow: true },
    ...(hasIlData ? [{ label: `IL seit letztem Reb.`, value: ilUsd, suffix: ` (${ilPct >= 0 ? '+' : ''}${ilPct.toFixed(2)}%)` }] : []),
    { label: 'Swap Costs (geschätzt)', value: -swapCosts, alwaysShow: true },
  ]

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
        P&L Breakdown
      </h3>

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
            <span
              className="mono font-medium"
              style={{ color: r.value >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
            >
              {r.value >= 0 ? '+' : '-'}{formatUsd(r.value)}{r.suffix || ''}
            </span>
          </div>
        ))}

        <div
          className="flex justify-between text-xs pt-2 mt-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Net P&L</span>
          <span
            className="mono font-semibold"
            style={{ color: netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {netPnl >= 0 ? '+' : '-'}{formatUsd(netPnl)}
          </span>
        </div>
      </div>

      {!hasIlData && (
        <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          IL: keine Entry-Daten in state.json
        </div>
      )}
    </div>
  )
}
