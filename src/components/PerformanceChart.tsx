import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

const STORAGE_KEY = 'fleet_treasury_snapshots'
const SNAPSHOT_INTERVAL = 3600_000 // 1 hour

export interface TreasurySnapshot {
  t: number        // timestamp ms
  pos: number      // CLMM position value
  wallets: number  // bot + petra wallet totals
  echelon: number  // echelon net value
  total: number    // sum of all
}

function loadSnapshots(): TreasurySnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveSnapshots(snaps: TreasurySnapshot[]) {
  try {
    // Keep max 720 snapshots (30 days at hourly)
    const trimmed = snaps.slice(-720)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch { /* storage full */ }
}

/** Call this from the hook on each refresh to record hourly snapshots */
export function recordTreasurySnapshot(pos: number, wallets: number, echelon: number): TreasurySnapshot[] {
  const snaps = loadSnapshots()
  const now = Date.now()
  const last = snaps.length > 0 ? snaps[snaps.length - 1].t : 0

  if (now - last >= SNAPSHOT_INTERVAL) {
    const snap: TreasurySnapshot = { t: now, pos, wallets, echelon, total: pos + wallets + echelon }
    snaps.push(snap)
    saveSnapshots(snaps)
  }

  return snaps
}

interface Props {
  currentTotal: number
  currentPos: number
  currentWallets: number
  currentEchelon: number
  snapshots: TreasurySnapshot[]
}

type TimeWindow = '24h' | '7d' | '30d' | 'all'

const WINDOWS: { key: TimeWindow; label: string; ms: number }[] = [
  { key: '24h', label: '24h', ms: 86400_000 },
  { key: '7d', label: '7d', ms: 7 * 86400_000 },
  { key: '30d', label: '30d', ms: 30 * 86400_000 },
  { key: 'all', label: 'All', ms: Infinity },
]

export function PerformanceChart({ currentTotal, currentPos, currentWallets, currentEchelon, snapshots }: Props) {
  const [window, setWindow] = useState<TimeWindow>('all')
  const [now, setNow] = useState(Date.now())

  // Update "now" every minute for live point
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const chartData = useMemo(() => {
    const cutoff = window === 'all' ? 0 : now - WINDOWS.find(w => w.key === window)!.ms
    const filtered = snapshots.filter(s => s.t >= cutoff)

    // Add current live point
    const points = [
      ...filtered.map(s => ({
        time: s.t,
        label: fmtDate(new Date(s.t)),
        total: s.total,
        pos: s.pos,
        wallets: s.wallets,
        echelon: s.echelon,
      })),
      {
        time: now,
        label: fmtDate(new Date(now)),
        total: currentTotal,
        pos: currentPos,
        wallets: currentWallets,
        echelon: currentEchelon,
      },
    ]

    return points
  }, [snapshots, window, now, currentTotal, currentPos, currentWallets, currentEchelon])

  const values = chartData.map(d => d.total)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const padding = Math.max((maxVal - minVal) * 0.1, 5)

  // 24h change
  const oldest24h = chartData.find(d => d.time >= now - 86400_000)
  const change24h = oldest24h ? currentTotal - oldest24h.total : 0
  const changePct24h = oldest24h && oldest24h.total > 0 ? (change24h / oldest24h.total) * 100 : 0

  // Total change (from first snapshot)
  const first = chartData.length > 1 ? chartData[0] : null
  const changeAll = first ? currentTotal - first.total : 0

  const isUp = currentTotal >= (first?.total ?? currentTotal)

  return (
    <div className="card-glow rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-sm font-bold neon-value" style={{ color: 'var(--lavender)' }}>
            💰 FLEET TREASURY
          </h3>
          <div className="hud-label mt-0.5" style={{ fontSize: '8px', color: '#8892b0' }}>
            (Position + Wallets + Lending)
          </div>
        </div>

        {/* Time window buttons */}
        <div className="flex gap-1">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => setWindow(w.key)}
              className="text-xs px-2 py-0.5 rounded cursor-pointer"
              style={{
                color: window === w.key ? '#00ff88' : 'var(--text-muted)',
                border: window === w.key ? '1px solid #00ff88' : '1px solid #2a2a3a',
                boxShadow: window === w.key ? '0 0 6px rgba(0,255,136,0.2)' : 'none',
                background: 'transparent',
                transition: 'all 0.2s',
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length <= 2 && (
        <div className="text-xs mb-1 hud-label" style={{ fontSize: '8px', color: '#8892b0' }}>
          Recording hourly snapshots — chart fills over time
        </div>
      )}

      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="treasuryGradUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c77dff" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#c77dff" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="treasuryGradDown" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ff2a6d" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ff2a6d" stopOpacity={0} />
              </linearGradient>
              <filter id="treasuryGlow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="1 6" stroke="var(--border)" strokeOpacity={0.4} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#8892b0', fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#8892b0', fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${Number(v).toFixed(0)}`}
              width={50}
              domain={[minVal - padding, maxVal + padding]}
            />
            <Tooltip
              contentStyle={{
                background: '#0d0d22',
                border: '1px solid #2a2a3a',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'JetBrains Mono',
              }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(val) => [`$${Number(val).toFixed(2)}`, 'Fleet Value']}
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Fleet Value"
              stroke={isUp ? '#c77dff' : '#ff2a6d'}
              strokeWidth={2}
              fill={isUp ? 'url(#treasuryGradUp)' : 'url(#treasuryGradDown)'}
              filter="url(#treasuryGlow)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom stats */}
      <div className="flex flex-wrap items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid #2a2a3a' }}>
        <Stat label="FLEET VALUE" value={`$${currentTotal.toFixed(2)}`} positive={true} />
        <Sep />
        <Stat
          label="24H"
          value={`${change24h >= 0 ? '+' : ''}$${Math.abs(change24h).toFixed(2)} (${changePct24h >= 0 ? '+' : ''}${changePct24h.toFixed(1)}%)`}
          positive={change24h >= 0}
        />
        {first && (
          <>
            <Sep />
            <Stat
              label="TOTAL"
              value={`${changeAll >= 0 ? '+' : ''}$${Math.abs(changeAll).toFixed(2)}`}
              positive={changeAll >= 0}
            />
          </>
        )}
        <Breakdown pos={currentPos} wallets={currentWallets} echelon={currentEchelon} />
      </div>
    </div>
  )
}

function Breakdown({ pos, wallets, echelon }: { pos: number; wallets: number; echelon: number }) {
  return (
    <div className="flex items-center gap-2 ml-auto">
      <span className="mono" style={{ fontSize: '8px', color: '#00ff88' }}>POS ${pos.toFixed(0)}</span>
      <span className="mono" style={{ fontSize: '8px', color: '#7eb8ff' }}>WAL ${wallets.toFixed(0)}</span>
      <span className="mono" style={{ fontSize: '8px', color: '#77FBFD' }}>ECH ${echelon.toFixed(0)}</span>
    </div>
  )
}

function Stat({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="hud-label" style={{ fontSize: '8px', color: '#b0b8cc' }}>{label}</span>
      <span className="mono text-xs font-semibold" style={{ color: positive ? '#c77dff' : '#ff2a6d' }}>
        {value}
      </span>
    </div>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: '#2a2a3a' }} />
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
