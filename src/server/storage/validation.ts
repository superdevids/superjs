export interface FileValidationOptions {
  accept?: string[]
  maxSize?: string
  minSize?: string
  sanitize?: boolean
  maxFiles?: number
}

export class FileValidator {
  private options: Required<FileValidationOptions>

  constructor(options?: FileValidationOptions) {
    this.options = {
      accept: options?.accept ?? [],
      maxSize: options?.maxSize ?? '100MB',
      minSize: options?.minSize ?? '1B',
      sanitize: options?.sanitize ?? true,
      maxFiles: options?.maxFiles ?? 1,
    }
  }

  validate(file: { name: string; size: number; type: string }): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (this.options.accept.length > 0 && !this.options.accept.includes(file.type)) {
      errors.push(`File type "${file.type}" is not accepted. Accepted: ${this.options.accept.join(', ')}`)
    }

    const maxBytes = this.parseSize(this.options.maxSize)
    const minBytes = this.parseSize(this.options.minSize)
    if (file.size > maxBytes) {
      errors.push(`File size ${file.size} bytes exceeds maximum ${this.options.maxSize}`)
    }
    if (file.size < minBytes) {
      errors.push(`File size ${file.size} bytes is below minimum ${this.options.minSize}`)
    }

    return { valid: errors.length === 0, errors }
  }

  sanitizeFilename(name: string): string {
    if (!this.options.sanitize) return name
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.\./g, '')
      .replace(/\/+/g, '_')
      .replace(/\\+/g, '_')
      .toLowerCase()
  }

  private parseSize(size: string): number {
    const match = size.match(/^(\d+)\s*(B|KB|MB|GB|TB)?$/i)
    if (!match) return 0
    const value = parseInt(match[1]!, 10)
    const unit = (match[2] || 'B').toUpperCase()
    const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 }
    return value * (multipliers[unit] ?? 1)
  }
}
