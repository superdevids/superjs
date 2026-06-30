import type { Queue } from './index.js'

export interface JobRecord {
  id: string
  name: string
  status: 'waiting' | 'running' | 'completed' | 'failed'
  queue: string
  payload: unknown
  error?: string
  attempts: number
  maxAttempts: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  nextRetryAt?: string
}

export interface QueueStats {
  queueName: string
  waiting: number
  running: number
  completed: number
  failed: number
  throughput: number
}

export class QueueMonitor {
  private jobs: JobRecord[] = []
  private maxJobs = 1000
  private stats: Map<string, QueueStats> = new Map()
  private eventListeners: Map<string, Array<(...args: unknown[]) => void>> = new Map()

  attach(queue: Queue, queueName: string = 'default'): void {
    if (!this.stats.has(queueName)) {
      this.stats.set(queueName, {
        queueName,
        waiting: 0,
        running: 0,
        completed: 0,
        failed: 0,
        throughput: 0,
      })
    }

    queue.on('pending', (job?: { id?: string; name?: string; payload?: unknown }) => {
      const stats = this.stats.get(queueName)!
      stats.waiting++
      
      this.addJob({
        id: job?.id || crypto.randomUUID(),
        name: job?.name || 'Job',
        status: 'waiting',
        queue: queueName,
        payload: job?.payload,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
      })
      this.emit('change', { queueName, stats: this.getQueueStats(queueName) })
    })

    queue.on('processed', (job?: { id?: string; name?: string }) => {
      const stats = this.stats.get(queueName)!
      stats.waiting = Math.max(0, stats.waiting - 1)
      stats.completed++
      stats.throughput++
      
      this.updateJob(job?.id, { status: 'completed', completedAt: new Date().toISOString() })
      this.emit('change', { queueName, stats: this.getQueueStats(queueName) })
    })

    queue.on('failed', (job?: { id?: string; name?: string; error?: string; attempts?: number }) => {
      const stats = this.stats.get(queueName)!
      stats.waiting = Math.max(0, stats.waiting - 1)
      stats.failed++
      
      this.updateJob(job?.id, {
        status: 'failed',
        error: job?.error || 'Unknown error',
        attempts: job?.attempts || 1,
        completedAt: new Date().toISOString(),
      })
      this.emit('change', { queueName, stats: this.getQueueStats(queueName) })
    })
  }

  private addJob(record: JobRecord): void {
    this.jobs.push(record)
    if (this.jobs.length > this.maxJobs) {
      this.jobs.shift()
    }
  }

  private updateJob(id: string | undefined, updates: Partial<JobRecord>): void {
    if (!id) return
    const job = this.jobs.find((j) => j.id === id)
    if (job) {
      Object.assign(job, updates)
    }
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  private emit(event: string, ...args: unknown[]): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const listener of listeners) {
        listener(...args)
      }
    }
  }

  getJobs(filters?: { queue?: string; status?: string; limit?: number }): JobRecord[] {
    let result = [...this.jobs]
    if (filters?.queue) {
      result = result.filter((j) => j.queue === filters.queue)
    }
    if (filters?.status) {
      result = result.filter((j) => j.status === filters.status)
    }
    if (filters?.limit) {
      result = result.slice(-filters.limit)
    }
    return result.reverse()
  }

  getQueueStats(queueName?: string): QueueStats[] {
    if (queueName) {
      const s = this.stats.get(queueName)
      return s ? [s] : []
    }
    return Array.from(this.stats.values())
  }

  retryJob(jobId: string): boolean {
    const job = this.jobs.find((j) => j.id === jobId)
    if (job && job.status === 'failed') {
      job.status = 'waiting'
      job.attempts = 0
      job.error = undefined
      job.completedAt = undefined
      job.startedAt = undefined
      return true
    }
    return false
  }

  retryAllFailed(queueName?: string): number {
    let count = 0
    for (const job of this.jobs) {
      if (job.status === 'failed' && (!queueName || job.queue === queueName)) {
        job.status = 'waiting'
        job.attempts = 0
        job.error = undefined
        job.completedAt = undefined
        count++
      }
    }
    return count
  }

  clearJobs(queueName?: string): number {
    if (queueName) {
      const before = this.jobs.length
      this.jobs = this.jobs.filter((j) => j.queue !== queueName)
      return before - this.jobs.length
    }
    const count = this.jobs.length
    this.jobs = []
    return count
  }

  getStats(): { processed: number; failed: number; pending: number; queues: number } {
    const allStats = this.getQueueStats()
    return {
      processed: allStats.reduce((a, s) => a + s.completed, 0),
      failed: allStats.reduce((a, s) => a + s.failed, 0),
      pending: allStats.reduce((a, s) => a + s.waiting + s.running, 0),
      queues: allStats.length,
    }
  }

  getDashboardHtml(): string {
    const s = this.getStats()
    const queues = this.getQueueStats()
    const recentJobs = this.getJobs({ limit: 20 })

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Queue Dashboard — SpeexJS</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f1117; color: #e1e4e8; padding: 2rem;
  }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #f0f6fc; }
  h1 span { font-size: 0.875rem; color: #8b949e; font-weight: normal; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem;
  }
  .card .value { font-size: 2rem; font-weight: 700; }
  .card .label { font-size: 0.8rem; color: #8b949e; margin-top: 0.25rem; }
  .card.processed .value { color: #3fb950; }
  .card.failed .value { color: #f85149; }
  .card.pending .value { color: #d29922; }
  .card.queues .value { color: #58a6ff; }
  h2 { font-size: 1.1rem; margin-bottom: 1rem; color: #f0f6fc; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #8b949e; padding: 0.5rem; border-bottom: 1px solid #21262d; }
  td { padding: 0.5rem; border-bottom: 1px solid #21262d; font-size: 0.875rem; }
  .badge {
    display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600;
  }
  .badge.completed { background: rgba(63,185,80,0.15); color: #3fb950; }
  .badge.failed { background: rgba(248,81,73,0.15); color: #f85149; }
  .badge.running { background: rgba(56,139,253,0.15); color: #58a6ff; }
  .badge.waiting { background: rgba(210,153,34,0.15); color: #d29922; }
  .btn {
    display: inline-block; padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.75rem;
    background: #21262d; color: #e1e4e8; border: 1px solid #30363d; cursor: pointer; text-decoration: none;
  }
  .btn:hover { background: #30363d; }
  .btn.danger { color: #f85149; border-color: #f85149; }
  .btn.danger:hover { background: rgba(248,81,73,0.15); }
  .actions { display: flex; gap: 0.5rem; }
  .empty { color: #8b949e; text-align: center; padding: 3rem; }
  .json-preview { font-family: monospace; font-size: 0.75rem; color: #8b949e; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
<div class="container">
  <h1>Queue Dashboard <span>— SpeexJS Job Management</span></h1>

  <div class="grid">
    <div class="card processed">
      <div class="value">${s.processed}</div>
      <div class="label">Processed Jobs</div>
    </div>
    <div class="card failed">
      <div class="value">${s.failed}</div>
      <div class="label">Failed Jobs</div>
    </div>
    <div class="card pending">
      <div class="value">${s.pending}</div>
      <div class="label">Pending / Running</div>
    </div>
    <div class="card queues">
      <div class="value">${s.queues}</div>
      <div class="label">Active Queues</div>
    </div>
  </div>

  <h2>Queues</h2>
  <table>
    <thead>
      <tr>
        <th>Queue</th>
        <th>Waiting</th>
        <th>Running</th>
        <th>Completed</th>
        <th>Failed</th>
        <th>Throughput</th>
      </tr>
    </thead>
    <tbody>
      ${queues.length === 0 ? '<tr><td colspan="6" class="empty">No queues active</td></tr>' : queues.map(q => `
      <tr>
        <td><strong>${q.queueName}</strong></td>
        <td>${q.waiting}</td>
        <td>${q.running}</td>
        <td>${q.completed}</td>
        <td>${q.failed}</td>
        <td>${q.throughput} jobs/min</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h2>Recent Jobs</h2>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Name</th>
        <th>Queue</th>
        <th>Attempts</th>
        <th>Payload</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>
      ${recentJobs.length === 0 ? '<tr><td colspan="6" class="empty">No jobs processed yet</td></tr>' : recentJobs.map(j => `
      <tr>
        <td><span class="badge ${j.status}">${j.status}</span></td>
        <td>${j.name}</td>
        <td>${j.queue}</td>
        <td>${j.attempts}/${j.maxAttempts}${j.error ? '<br><span style="font-size:0.75rem;color:#f85149">' + j.error.slice(0, 50) + '</span>' : ''}</td>
        <td><div class="json-preview" title='${JSON.stringify(j.payload || {})}'>${JSON.stringify(j.payload || {}).slice(0, 50)}${JSON.stringify(j.payload || {}).length > 50 ? '...' : ''}</div></td>
        <td style="font-size:0.75rem;color:#8b949e">${new Date(j.createdAt).toLocaleString()}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div style="display:flex;gap:1rem;margin-top:1rem">
    <form method="POST" action="/_speex/queue/retry-all" style="display:inline">
      <button class="btn" type="submit">Retry All Failed</button>
    </form>
    <form method="POST" action="/_speex/queue/clear" style="display:inline">
      <button class="btn danger" type="submit">Clear All Jobs</button>
    </form>
  </div>
</div>
</body>
</html>`
  }
}
