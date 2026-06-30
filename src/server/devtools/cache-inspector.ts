import type { Cache } from '../cache/index.js'

export interface CacheKeyInfo {
  key: string
  estimatedSize: number
  estimatedSizeFormatted: string
  ttlRemaining: number
  expired: boolean
}

export interface CacheInspectorStats {
  hits: number
  misses: number
  keys: number
  size: string
  hitRate: number
}

export class CacheInspector {
  private cache: Cache | null = null
  private perKeyHits = new Map<string, number>()

  setCache(cache: Cache): void {
    this.cache = cache
  }

  getCache(): Cache | null {
    return this.cache
  }

  async getKeys(): Promise<CacheKeyInfo[]> {
    const cache = this.cache
    if (!cache) return []

    const entries = cache.getEntries()
    return entries.map(e => {
      const remaining = e.expiresAt - Date.now()
      const size = new TextEncoder().encode(JSON.stringify(e.value)).length
      return {
        key: e.key,
        estimatedSize: size,
        estimatedSizeFormatted: formatBytes(size),
        ttlRemaining: remaining,
        expired: remaining <= 0,
      }
    }).sort((a, b) => b.estimatedSize - a.estimatedSize)
  }

  async clearKey(key: string): Promise<boolean> {
    const cache = this.cache
    if (!cache) return false
    return cache.delete(key)
  }

  async clearAll(): Promise<void> {
    const cache = this.cache
    if (!cache) return
    await cache.clear()
    this.perKeyHits.clear()
  }

  recordHit(key: string): void {
    this.perKeyHits.set(key, (this.perKeyHits.get(key) || 0) + 1)
  }

  getPerKeyHits(): Map<string, number> {
    return new Map(this.perKeyHits)
  }

  getStats(): CacheInspectorStats {
    const cache = this.cache
    if (!cache) {
      return { hits: 0, misses: 0, keys: 0, size: '0 B', hitRate: 0 }
    }
    const s = cache.stats()
    const total = s.hits + s.misses
    return {
      hits: s.hits,
      misses: s.misses,
      keys: s.keys,
      size: s.size,
      hitRate: total > 0 ? Math.round((s.hits / total) * 100) : 0,
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}
