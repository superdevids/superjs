import { SSEHandler } from '../http/sse-handler.js'

export interface RequestLogEntry {
  method: string
  path: string
  status: number
  duration: number
  authType: string
  queryCount: number
  timestamp: number
}

export class SseLogger {
  private sseHandler = new SSEHandler()
  private recent: RequestLogEntry[] = []
  private maxEntries = 100

  track(entry: RequestLogEntry): void {
    this.recent.push(entry)
    if (this.recent.length > this.maxEntries) {
      this.recent.shift()
    }
    this.sseHandler.broadcast('request', entry)
  }

  getRecent(): RequestLogEntry[] {
    return [...this.recent]
  }

  getSseHandler(): SSEHandler {
    return this.sseHandler
  }

  clear(): void {
    this.recent = []
  }
}
