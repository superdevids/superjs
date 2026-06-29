import { randomBytes } from 'node:crypto'

export class Sanctum {
  private tokens = new Map<string, { userId: string; abilities: string[] }>()
  private csrfTokens = new Map<string, string>()

  generateCsrfToken(): string {
    const token = randomBytes(32).toString('hex')
    this.csrfTokens.set(token, Date.now().toString())
    return token
  }

  createToken(userId: string, abilities: string[] = ['*']): string {
    const token = `spx_${randomBytes(40).toString('hex')}`
    this.tokens.set(token, { userId, abilities })
    return token
  }

  verifyToken(token: string): { userId: string; abilities: string[] } | null {
    return this.tokens.get(token) ?? null
  }

  revokeToken(token: string): void {
    this.tokens.delete(token)
  }

  can(token: string, ability: string): boolean {
    const record = this.tokens.get(token)
    if (!record) return false
    if (record.abilities.includes('*')) return true
    return record.abilities.includes(ability)
  }
}
