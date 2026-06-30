export interface QueryEntry {
  sql: string
  bindings?: unknown[]
  duration: number
  timestamp: number
}

export interface NPlusOneAlert {
  pattern: string
  count: number
  sampleSql: string
  lastSeen: number
}

export interface QueryInspectorStats {
  total: number
  slowCount: number
  avgDuration: number
  nPlusOneCount: number
}

export class QueryInspector {
  private queries: QueryEntry[] = []
  private maxQueries = 500
  private patternCounts = new Map<string, { count: number; sampleSql: string; lastSeen: number }>()

  track(sql: string, duration: number, bindings?: unknown[]): void {
    const entry: QueryEntry = { sql, bindings, duration, timestamp: Date.now() }
    this.queries.push(entry)
    if (this.queries.length > this.maxQueries) {
      this.queries.shift()
    }

    const normalized = sql.replace(/\?/g, '?').replace(/'[^']*'/g, '?').replace(/\b\d+\b/g, 'N').replace(/\s+/g, ' ').trim()
    const existing = this.patternCounts.get(normalized)
    if (existing) {
      existing.count++
      existing.lastSeen = Date.now()
    } else {
      this.patternCounts.set(normalized, { count: 1, sampleSql: sql, lastSeen: Date.now() })
    }
  }

  getRecentQueries(limit = 100): QueryEntry[] {
    return this.queries.slice(-limit).reverse()
  }

  getSlowQueries(threshold = 100): QueryEntry[] {
    return this.queries.filter(q => q.duration > threshold)
  }

  getNPlusOneAlerts(threshold = 5): NPlusOneAlert[] {
    const alerts: NPlusOneAlert[] = []
    for (const [pattern, info] of Array.from(this.patternCounts)) {
      if (info.count > threshold) {
        alerts.push({ pattern, count: info.count, sampleSql: info.sampleSql, lastSeen: info.lastSeen })
      }
    }
    return alerts.sort((a, b) => b.count - a.count)
  }

  clear(): void {
    this.queries = []
    this.patternCounts.clear()
  }

  getStats(): QueryInspectorStats {
    const total = this.queries.length
    const slow = this.getSlowQueries()
    const avg = total > 0 ? this.queries.reduce((s, q) => s + q.duration, 0) / total : 0
    return {
      total,
      slowCount: slow.length,
      avgDuration: Math.round(avg),
      nPlusOneCount: this.getNPlusOneAlerts().length,
    }
  }

  getAllEntries(): QueryEntry[] {
    return [...this.queries]
  }
}
