export interface ImageProcessingOptions {
  resize?: { width: number; height: number; fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside' }
  format?: 'jpeg' | 'png' | 'webp' | 'avif'
  quality?: number
  grayscale?: boolean
  rotate?: number
  flip?: boolean
  flop?: boolean
}

export class ImageProcessor {
  private sharpAvailable: boolean = false

  constructor() {
    try {
      require.resolve('sharp')
      this.sharpAvailable = true
    } catch {
      // sharp not available
    }
  }

  async process(input: Buffer | string, options: ImageProcessingOptions): Promise<Buffer> {
    if (this.sharpAvailable) {
      return this.processWithSharp(input, options)
    }
    return this.processBasic(input, options)
  }

  private async processWithSharp(input: Buffer | string, options: ImageProcessingOptions): Promise<Buffer> {
    const sharp = require('sharp')
    let pipeline = sharp(input)

    if (options.resize) {
      pipeline = pipeline.resize(options.resize.width, options.resize.height, {
        fit: options.resize.fit ?? 'cover',
        withoutEnlargement: true,
      })
    }

    if (options.grayscale) pipeline = pipeline.grayscale()
    if (options.rotate) pipeline = pipeline.rotate(options.rotate)
    if (options.flip) pipeline = pipeline.flip()
    if (options.flop) pipeline = pipeline.flop()

    if (options.format) {
      pipeline = pipeline.toFormat(options.format, { quality: options.quality ?? 80 })
    }

    return pipeline.toBuffer()
  }

  private async processBasic(input: Buffer | string, _options: ImageProcessingOptions): Promise<Buffer> {
    const buf = typeof input === 'string' ? Buffer.from(input) : input
    console.warn('[ImageProcessor] sharp not available. Install sharp for full image processing.')
    return buf
  }

  async createThumbnail(input: Buffer | string, width: number, height: number): Promise<Buffer> {
    return this.process(input, { resize: { width, height, fit: 'cover' }, quality: 70 })
  }
}
