// Shared Aptos RPC layer with endpoint rotation, caching, and sessionStorage persistence

const RPC_ENDPOINTS = [
  'https://api.mainnet.aptoslabs.com/v1',
  'https://fullnode.mainnet.aptoslabs.com/v1',
  'https://mainnet.aptoslabs.com/v1',
]

const INDEXER_ENDPOINTS = [
  'https://api.mainnet.aptoslabs.com/v1/graphql',
  'https://indexer.mainnet.aptoslabs.com/v1/graphql',
]

// In-memory cache: key → { data, timestamp }
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 150_000 // 150s — longer than 120s refresh interval to avoid gaps

let rpcIndex = 0
let indexerIndex = 0

// Restore cache from sessionStorage on load
const STORAGE_KEY = 'aptos_rpc_cache'
try {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (stored) {
    const entries = JSON.parse(stored) as [string, { data: unknown; ts: number }][]
    for (const [key, val] of entries) {
      cache.set(key, val)
    }
  }
} catch { /* ignore parse errors */ }

function persistCache(): void {
  try {
    // Only persist entries less than 10 min old
    const entries: [string, { data: unknown; ts: number }][] = []
    const cutoff = Date.now() - 600_000
    for (const [key, val] of cache.entries()) {
      if (val.ts > cutoff) entries.push([key, val])
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch { /* storage full or unavailable */ }
}

function nextRpc(): string {
  const url = RPC_ENDPOINTS[rpcIndex % RPC_ENDPOINTS.length]
  rpcIndex++
  return url
}

function nextIndexer(): string {
  const url = INDEXER_ENDPOINTS[indexerIndex % INDEXER_ENDPOINTS.length]
  indexerIndex++
  return url
}

function getCached(key: string): unknown | null {
  const entry = cache.get(key)
  if (!entry) return null
  return entry.data
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() })
  persistCache()
}

function isFresh(key: string): boolean {
  const entry = cache.get(key)
  if (!entry) return false
  return Date.now() - entry.ts < CACHE_TTL
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export async function aptosGet(path: string): Promise<unknown> {
  const cacheKey = `GET:${path}`

  // Return fresh cache immediately
  if (isFresh(cacheKey)) return getCached(cacheKey)!

  // Try each endpoint with delay between retries
  let lastErr: Error | null = null
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    if (i > 0) await delay(300)
    const base = nextRpc()
    try {
      const res = await fetch(`${base}${path}`)
      if (res.status === 429) {
        console.warn(`Aptos GET 429 from ${base}`)
        continue
      }
      if (!res.ok) throw new Error(`Aptos API error: ${res.status}`)
      const data = await res.json()
      setCache(cacheKey, data)
      return data
    } catch (err) {
      lastErr = err as Error
      console.warn(`Aptos GET failed on ${base}:`, (err as Error).message)
    }
  }

  // All endpoints failed — return stale cache if available
  const stale = getCached(cacheKey)
  if (stale) {
    console.warn(`All Aptos RPCs failed for GET ${path}, using stale cache`)
    return stale
  }
  throw lastErr ?? new Error('All Aptos RPC endpoints failed')
}

export async function aptosView(func: string, typeArgs: string[], args: string[]): Promise<unknown[]> {
  const cacheKey = `VIEW:${func}:${JSON.stringify(args)}`

  if (isFresh(cacheKey)) return getCached(cacheKey) as unknown[]

  const body = JSON.stringify({ function: func, type_arguments: typeArgs, arguments: args })

  let lastErr: Error | null = null
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    if (i > 0) await delay(300)
    const base = nextRpc()
    try {
      const res = await fetch(`${base}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.status === 429) {
        console.warn(`Aptos VIEW 429 from ${base}`)
        continue
      }
      if (!res.ok) throw new Error(`Aptos view error: ${res.status}`)
      const data = await res.json()
      setCache(cacheKey, data)
      return data
    } catch (err) {
      lastErr = err as Error
      console.warn(`Aptos VIEW failed on ${base}:`, (err as Error).message)
    }
  }

  const stale = getCached(cacheKey)
  if (stale) {
    console.warn(`All Aptos RPCs failed for VIEW ${func}, using stale cache`)
    return stale as unknown[]
  }
  throw lastErr ?? new Error('All Aptos RPC endpoints failed')
}

export async function aptosIndexer(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const cacheKey = `INDEXER:${JSON.stringify(variables)}`

  if (isFresh(cacheKey)) return getCached(cacheKey)!

  const body = JSON.stringify({ query, variables })

  let lastErr: Error | null = null
  for (let i = 0; i < INDEXER_ENDPOINTS.length; i++) {
    if (i > 0) await delay(300)
    const url = nextIndexer()
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.status === 429) {
        console.warn(`Aptos Indexer 429 from ${url}`)
        continue
      }
      if (!res.ok) throw new Error(`Aptos indexer error: ${res.status}`)
      const data = await res.json()
      setCache(cacheKey, data)
      return data
    } catch (err) {
      lastErr = err as Error
      console.warn(`Aptos Indexer failed on ${url}:`, (err as Error).message)
    }
  }

  const stale = getCached(cacheKey)
  if (stale) {
    console.warn(`All Aptos Indexers failed, using stale cache`)
    return stale
  }
  throw lastErr ?? new Error('All Aptos Indexer endpoints failed')
}
