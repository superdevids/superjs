interface AttemptEntry {
  count: number
  lockedUntil: number
}

export interface LockoutStore {
  get(key: string): AttemptEntry | undefined
  set(key: string, value: AttemptEntry): void
  delete(key: string): void
}

class MapStore implements LockoutStore {
  private store = new Map<string, AttemptEntry>()
  get(key: string): AttemptEntry | undefined {
    return this.store.get(key)
  }
  set(key: string, value: AttemptEntry): void {
    this.store.set(key, value)
  }
  delete(key: string): void {
    this.store.delete(key)
  }
}

export interface LockoutConfig {
  maxAttempts?: number
  lockoutDurationMs?: number
  backoffEnabled?: boolean
  global?: boolean
  store?: LockoutStore
}

export class AccountLockout {
  private attempts: LockoutStore
  private maxAttempts = 5
  private lockoutDuration = 900000
  private backoffEnabled = true
  private global = false

  constructor(config?: LockoutConfig) {
    this.attempts = config?.store ?? new MapStore()
    if (config?.maxAttempts !== undefined) this.maxAttempts = config.maxAttempts
    if (config?.lockoutDurationMs !== undefined) this.lockoutDuration = config.lockoutDurationMs
    if (config?.backoffEnabled !== undefined) this.backoffEnabled = config.backoffEnabled
    if (config?.global !== undefined) this.global = config.global
  }

  recordAttempt(identifier: string): void {
    const key = this.global ? '__global__' : identifier
    const entry = this.attempts.get(key) ?? { count: 0, lockedUntil: 0 }
    entry.count++
    if (entry.count >= this.maxAttempts) {
      const duration = this.backoffEnabled
        ? this.lockoutDuration * Math.pow(2, entry.count - this.maxAttempts)
        : this.lockoutDuration
      entry.lockedUntil = Date.now() + duration
    }
    this.attempts.set(key, entry)
  }

  isLocked(identifier: string): boolean {
    const key = this.global ? '__global__' : identifier
    const entry = this.attempts.get(key)
    if (!entry) return false
    if (entry.lockedUntil < Date.now()) {
      this.attempts.delete(key)
      return false
    }
    return true
  }

  clear(identifier: string): void {
    const key = this.global ? '__global__' : identifier
    this.attempts.delete(key)
  }

  remainingAttempts(identifier: string): number {
    const key = this.global ? '__global__' : identifier
    const entry = this.attempts.get(key)
    return entry ? Math.max(0, this.maxAttempts - entry.count) : this.maxAttempts
  }

  getBackoffMultiplier(identifier: string): number {
    const key = this.global ? '__global__' : identifier
    const entry = this.attempts.get(key)
    if (!entry || entry.count < this.maxAttempts) return 1
    return Math.pow(2, entry.count - this.maxAttempts)
  }
}
