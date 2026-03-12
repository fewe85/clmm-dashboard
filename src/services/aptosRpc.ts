// Shared Aptos RPC layer with endpoint rotation and response caching

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
const CACHE_TTL = 90_000 // 90s — reuse across refresh cycles

let rpcIndex = 0
let indexerIndex = 0

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
  // Return cached data regardless of age — caller decides freshness
  return entry.data
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() })
}

function isFresh(key: string): boolean {
  const entry = cache.get(key)
  if (!entry) return false
  return Date.now() - entry.ts < CACHE_TTL
}

export async function aptosGet(path: string): Promise<unknown> {
  const cacheKey = `GET:${path}`

  // Return fresh cache immediately
  if (isFresh(cacheKey)) return getCached(cacheKey)!

  // Try each endpoint
  let lastErr: Error | null = null
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
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
