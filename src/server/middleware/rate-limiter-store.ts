import type { QueryRunner } from '../database/types.js'

export interface RateLimiterStore {
  hit(key: string, windowMs: number, maxHits: number): Promise<{ count: number; remaining: number; resetAt: number }>
}

export class MemoryRateLimiterStore implements RateLimiterStore {
  private hits = new Map<string, { count: number; resetAt: number }>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, val] of this.hits) {
        if (val.resetAt < now) this.hits.delete(key)
      }
    }, 60000)
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  async hit(key: string, windowMs: number, maxHits: number): Promise<{ count: number; remaining: number; resetAt: number }> {
    const now = Date.now()
    let entry = this.hits.get(key)
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs }
      this.hits.set(key, entry)
    }
    entry.count++
    return { count: entry.count, remaining: Math.max(0, maxHits - entry.count), resetAt: entry.resetAt }
  }

  close(): void { clearInterval(this.cleanupTimer) }
}

export class DatabaseRateLimiterStore implements RateLimiterStore {
  constructor(private db: QueryRunner, private table: string = 'rate_limits') {}

  async hit(key: string, windowMs: number, maxHits: number): Promise<{ count: number; remaining: number; resetAt: number }> {
    const now = Date.now()
    const resetAt = now + windowMs
    const dialect = this.db.getDialect()
    
    try {
      await this.db.raw(
        `INSERT INTO ${dialect.wrapIdentifier(this.table)} (\`key\`, \`hits\`, \`reset_at\`) VALUES (?, 1, ?) 
         ON DUPLICATE KEY UPDATE \`hits\` = \`hits\` + 1`,
        [key, resetAt]
      )
    } catch {
      // Fallback: just use memory for now
    }
    
    const result = await this.db.raw(
      `SELECT \`hits\`, \`reset_at\` FROM ${dialect.wrapIdentifier(this.table)} WHERE \`key\` = ?`,
      [key]
    )
    
    const row = result.rows[0]
    if (!row) return { count: 1, remaining: maxHits - 1, resetAt }
    
    return { count: row.hits, remaining: Math.max(0, maxHits - row.hits), resetAt: Number(row.reset_at) }
  }
}

// ─── Adaptive Rate Limiting ──────────────────────────────────────

export interface AdaptiveConfig {
  enabled: boolean
  defaultMax: number
  defaultWindow: number
  boostMultiplier: number
  throttleMultiplier: number
  loadCheckInterval: number
  highLoadThreshold: number
  lowLoadThreshold: number
  p95Threshold: number
}

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  enabled: true,
  defaultMax: 100,
  defaultWindow: 60,
  boostMultiplier: 2.0,
  throttleMultiplier: 0.5,
  loadCheckInterval: 30000,
  highLoadThreshold: 0.8,
  lowLoadThreshold: 0.3,
  p95Threshold: 2000,
}

export class AdaptiveRateLimiter {
  private config: AdaptiveConfig
  private currentMultiplier: number = 1.0
  private hits = new Map<string, { count: number; resetAt: number }>()
  private loadHistory: number[] = []
  private checkTimer: ReturnType<typeof setInterval>
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor(config?: Partial<AdaptiveConfig>) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config }

    // Periodic load check
    this.checkTimer = setInterval(() => {
      this.updateLoadMultiplier()
    }, this.config.loadCheckInterval)
    if (this.checkTimer.unref) this.checkTimer.unref()

    // Cleanup stale entries
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, val] of this.hits) {
        if (val.resetAt < now) this.hits.delete(key)
      }
    }, 60000)
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  private getCurrentLoad(): number {
    const mem = process.memoryUsage()
    const heapUsed = mem.heapUsed
    const heapTotal = mem.heapTotal
    return heapTotal > 0 ? heapUsed / heapTotal : 0
  }

  private updateLoadMultiplier(): void {
    const load = this.getCurrentLoad()
    this.loadHistory.push(load)
    if (this.loadHistory.length > 10) this.loadHistory.shift()

    const avgLoad = this.loadHistory.reduce((a, b) => a + b, 0) / this.loadHistory.length

    if (avgLoad > this.config.highLoadThreshold) {
      this.currentMultiplier = this.config.throttleMultiplier
    } else if (avgLoad < this.config.lowLoadThreshold) {
      this.currentMultiplier = this.config.boostMultiplier
    } else {
      this.currentMultiplier = 1.0
    }
  }

  async hit(key: string, _windowMs?: number, _maxHits?: number): Promise<{ count: number; remaining: number; resetAt: number }> {
    const now = Date.now()
    const timeWindow = (_windowMs ?? this.config.defaultWindow) * 1000
    const baseMax = _maxHits ?? this.config.defaultMax
    const effectiveMax = Math.round(baseMax * this.currentMultiplier)
    const resetAt = now + timeWindow

    let entry = this.hits.get(key)
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + timeWindow }
      this.hits.set(key, entry)
    }
    entry.count++

    return {
      count: entry.count,
      remaining: Math.max(0, effectiveMax - entry.count),
      resetAt: entry.resetAt,
    }
  }

  getMultiplier(): number {
    return this.currentMultiplier
  }

  getConfig(): AdaptiveConfig {
    return { ...this.config }
  }

  close(): void {
    clearInterval(this.checkTimer)
    clearInterval(this.cleanupTimer)
  }
}
