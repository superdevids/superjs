import { randomBytes, createHash } from 'node:crypto'

interface MagicLinkEntry {
  email: string
  expiresAt: number
  used: boolean
}

interface TokenStore {
  get(token: string): MagicLinkEntry | undefined
  set(token: string, entry: MagicLinkEntry): void
  delete(token: string): void
}

class MemoryTokenStore implements TokenStore {
  private store = new Map<string, MagicLinkEntry>()

  get(token: string): MagicLinkEntry | undefined {
    return this.store.get(token)
  }

  set(token: string, entry: MagicLinkEntry): void {
    this.store.set(token, entry)
  }

  delete(token: string): void {
    this.store.delete(token)
  }
}

export class MagicLinkAuth {
  private ttl: number
  private store: TokenStore

  constructor(options?: { ttl?: number; store?: TokenStore }) {
    this.ttl = options?.ttl ?? 900000
    this.store = options?.store ?? new MemoryTokenStore()
  }

  async send(email: string): Promise<string> {
    const token = this.generateToken()
    const entry: MagicLinkEntry = {
      email,
      expiresAt: Date.now() + this.ttl,
      used: false,
    }
    this.store.set(token, entry)
    return token
  }

  async verify(token: string): Promise<{ email: string; valid: boolean }> {
    const entry = this.store.get(token)
    if (!entry) return { email: '', valid: false }
    if (entry.used) return { email: '', valid: false }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(token)
      return { email: '', valid: false }
    }

    entry.used = true
    this.store.set(token, entry)

    return { email: entry.email, valid: true }
  }

  private generateToken(): string {
    return randomBytes(32).toString('base64url')
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
