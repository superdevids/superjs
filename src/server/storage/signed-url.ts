import { createHmac } from 'node:crypto'

export interface SignedUrlOptions {
  expiresIn?: string
  method?: string
  ip?: string
}

export class SignedUrlGenerator {
  private secret: string
  private baseUrl: string

  constructor(secret: string, baseUrl: string = '') {
    this.secret = secret
    this.baseUrl = baseUrl
  }

  generate(path: string, options?: SignedUrlOptions): string {
    const expires = options?.expiresIn ? Date.now() + this.parseDuration(options.expiresIn) : Date.now() + 3600000
    const method = options?.method ?? 'GET'

    const data = `${method}:${path}:${expires}:${options?.ip ?? ''}`
    const signature = createHmac('sha256', this.secret).update(data).digest('hex')

    const params = new URLSearchParams({
      expires: String(expires),
      signature,
    })

    if (options?.ip) params.set('ip', options.ip)

    return `${this.baseUrl}${path}?${params.toString()}`
  }

  verify(url: string, method: string = 'GET', ip?: string): boolean {
    try {
      const parsed = new URL(url)
      const expires = parseInt(parsed.searchParams.get('expires') || '0', 10)
      const signature = parsed.searchParams.get('signature') || ''
      const path = parsed.pathname

      if (Date.now() > expires) return false

      const data = `${method}:${path}:${expires}:${ip ?? ''}`
      const expected = createHmac('sha256', this.secret).update(data).digest('hex')

      return signature === expected
    } catch {
      return false
    }
  }

  private parseDuration(str: string): number {
    const match = str.match(/^(\d+)\s*(ms|s|m|h|d)?$/)
    if (!match) return 0
    const value = parseInt(match[1]!, 10)
    const unit = match[2] || 'ms'
    const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }
    return value * (multipliers[unit] ?? 1)
  }
}
