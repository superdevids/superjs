import type { Queue } from './index.js'

export class QueueMonitor {
  private stats = { processed: 0, failed: 0, pending: 0 }

  attach(queue: Queue): void {
    // Wrap queue's push to track stats
    const originalPush = (queue as any).push.bind(queue)
    ;(queue as any).push = (name: string, payload: unknown) => {
      this.stats.pending++
      originalPush(name, payload)
    }
  }

  getStats() { return { ...this.stats } }

  getHtml(): string {
    return `<html><body><h1>Queue Monitor</h1>
<p>Processed: ${this.stats.processed}</p>
<p>Failed: ${this.stats.failed}</p>
<p>Pending: ${this.stats.pending}</p></body></html>`
  }
}
