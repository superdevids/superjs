import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

// ─── Types ─────────────────────────────────────────────────────

export interface JobPayload {
  [key: string]: unknown
}

export interface JobOptions {
  delay?: string | number       // '1h', '30m', or timestamp ms
  attempts?: number
  backoff?: 'fixed' | 'exponential'
  maxDelay?: string
  priority?: number             // 1 (highest) to 10 (lowest)
  singleton?: boolean           // Only one instance of this job in queue
  timeout?: number              // Job timeout in ms
}

export interface JobDefinition {
  name: string
  handle: (payload: JobPayload) => Promise<void>
  options?: JobOptions
}

export interface JobInstance {
  id: string
  name: string
  payload: JobPayload
  options: Required<JobOptions>
  status: 'waiting' | 'delayed' | 'running' | 'completed' | 'failed'
  attempts: number
  maxAttempts: number
  error?: string
  createdAt: number
  scheduledAt?: number
  startedAt?: number
  completedAt?: number
  chain?: JobChainStep[]
}

export interface JobChainStep {
  name: string
  payload: JobPayload
  options?: JobOptions
}

// ─── Queue Class ───────────────────────────────────────────────

export class Queue extends EventEmitter {
  private jobs: Map<string, JobDefinition> = new Map()
  private instances: Map<string, JobInstance> = new Map()
  private waiting: string[] = []          // FIFO queue
  private delayed: string[] = []          // Delayed jobs
  private running: Set<string> = new Set()
  private failed: string[] = []           // Dead letter queue
  private concurrency: number
  private activeCount = 0
  private processing = false
  private maxFailedJobs = 1000
  private delayedTimer: ReturnType<typeof setInterval> | null = null

  constructor(concurrency: number = 3) {
    super()
    this.concurrency = concurrency

    // Process delayed jobs
    this.delayedTimer = setInterval(() => {
      this.processDelayedJobs()
    }, 5000)
    if (this.delayedTimer.unref) this.delayedTimer.unref()
  }

  // ─── Job Registration ───────────────────────────────────────

  register(name: string, handle: (payload: JobPayload) => Promise<void>, options?: JobOptions): this {
    this.jobs.set(name, { name, handle, options })
    return this
  }

  // ─── Dispatch ────────────────────────────────────────────────

  async dispatch(name: string, payload: JobPayload = {}, options: JobOptions = {}): Promise<string> {
    const def = this.jobs.get(name)
    if (!def) throw new Error(`Job "${name}" is not registered`)

    const id = randomUUID()
    const mergedOptions: Required<JobOptions> = {
      delay: options.delay ?? def.options?.delay ?? 0,
      attempts: options.attempts ?? def.options?.attempts ?? 3,
      backoff: options.backoff ?? def.options?.backoff ?? 'exponential',
      maxDelay: options.maxDelay ?? def.options?.maxDelay ?? '1h',
      priority: options.priority ?? def.options?.priority ?? 5,
      singleton: options.singleton ?? def.options?.singleton ?? false,
      timeout: options.timeout ?? def.options?.timeout ?? 30000,
    }

    // Singleton check
    if (mergedOptions.singleton) {
      const existing = Array.from(this.instances.values())
        .find((j) => j.name === name && (j.status === 'waiting' || j.status === 'delayed' || j.status === 'running'))
      if (existing) return existing.id
    }

    const now = Date.now()
    let scheduledAt: number | undefined
    let status: 'waiting' | 'delayed' = 'waiting'

    if (mergedOptions.delay) {
      if (typeof mergedOptions.delay === 'string') {
        // Parse duration string like '1h', '30m', '2026-01-01T00:00:00Z'
        if (/^\d{4}/.test(mergedOptions.delay)) {
          scheduledAt = new Date(mergedOptions.delay).getTime()
        } else {
          scheduledAt = now + parseDuration(mergedOptions.delay)
        }
      } else {
        scheduledAt = now + mergedOptions.delay
      }
      status = 'delayed'
    }

    const instance: JobInstance = {
      id,
      name,
      payload,
      options: mergedOptions,
      status,
      attempts: 0,
      maxAttempts: mergedOptions.attempts,
      createdAt: now,
      scheduledAt,
    }

    this.instances.set(id, instance)

    if (status === 'delayed') {
      this.delayed.push(id)
    } else {
      this.waiting.push(id)
    }

    this.emit('pending', instance)
    this.processQueue()
    return id
  }

  // ─── Job Chaining ────────────────────────────────────────────

  chain(firstJob: { name: string; payload?: JobPayload; options?: JobOptions }) {
    const steps: JobChainStep[] = [{
      name: firstJob.name,
      payload: firstJob.payload ?? {},
      options: firstJob.options,
    }]

    const chainable = {
      then: (name: string, payload?: JobPayload, options?: JobOptions) => {
        steps.push({ name, payload: payload ?? {}, options })
        return chainable
      },
      dispatch: async (): Promise<string[]> => {
        const ids: string[] = []
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!
          const id = await this.dispatch(step.name, step.payload, step.options)
          ids.push(id)

          // Store chain reference for the first job
          if (i === 0) {
            const instance = this.instances.get(id)
            if (instance) {
              instance.chain = steps.slice(1)
            }
          }
        }
        return ids
      },
    }

    return chainable
  }

  // ─── Queue Processing ────────────────────────────────────────

  private processQueue(): void {
    if (this.processing) return
    this.processing = true

    const processNext = () => {
      while (this.activeCount < this.concurrency && this.waiting.length > 0) {
        // Priority sorting: sort waiting jobs by priority
        this.waiting.sort((a, b) => {
          const ja = this.instances.get(a)
          const jb = this.instances.get(b)
          return (ja?.options.priority ?? 5) - (jb?.options.priority ?? 5)
        })

        const id = this.waiting.shift()!
        const instance = this.instances.get(id)
        if (!instance) continue

        this.activeCount++
        this.running.add(id)
        instance.status = 'running'
        instance.startedAt = Date.now()
        this.emit('processed', instance)

        const def = this.jobs.get(instance.name)
        if (!def) {
          instance.status = 'failed'
          instance.error = `Job "${instance.name}" not found`
          this.failed.push(id)
          if (this.failed.length > this.maxFailedJobs) this.failed.shift()
          this.emit('failed', instance)
          this.activeCount--
          this.running.delete(id)
          continue
        }

        // Run with timeout
        const timeout = instance.options.timeout
        const handlePromise = def.handle(instance.payload)
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error(`Job "${instance.name}" timed out after ${timeout}ms`)), timeout)
        })

        Promise.race([handlePromise, timeoutPromise])
          .then(() => {
            instance.status = 'completed'
            instance.completedAt = Date.now()
            this.running.delete(id)
            this.emit('completed', instance)

            // Process chain if exists
            if (instance.chain && instance.chain.length > 0) {
              const nextStep = instance.chain.shift()!
              this.dispatch(nextStep.name, nextStep.payload, nextStep.options)
                .catch((err) => this.emit('failed', { ...instance, error: err.message }))
            }
          })
          .catch((err: Error) => {
            instance.attempts++
            instance.error = err.message

            // Retry logic with backoff
            if (instance.attempts < instance.maxAttempts) {
              const delay = instance.options.backoff === 'exponential'
                ? Math.min(1000 * Math.pow(2, instance.attempts - 1), parseDuration(instance.options.maxDelay))
                : 5000 // fixed backoff

              instance.status = 'delayed'
              instance.scheduledAt = Date.now() + delay
              this.delayed.push(id)
              this.emit('retrying', { ...instance, nextRetryAt: new Date(instance.scheduledAt).toISOString() })
            } else {
              instance.status = 'failed'
              this.failed.push(id)
              if (this.failed.length > this.maxFailedJobs) this.failed.shift()
              this.emit('failed', instance)
            }

            this.running.delete(id)
          })
          .finally(() => {
            this.activeCount--
            processNext()
          })
      }

      if (this.activeCount === 0 && this.waiting.length === 0) {
        this.processing = false
        this.emit('drain')
      }
    }

    processNext()
  }

  // ─── Delayed Jobs ────────────────────────────────────────────

  private processDelayedJobs(): void {
    const now = Date.now()
    const ready: string[] = []

    for (const id of this.delayed) {
      const instance = this.instances.get(id)
      if (instance && instance.scheduledAt && instance.scheduledAt <= now) {
        ready.push(id)
      }
    }

    for (const id of ready) {
      this.delayed = this.delayed.filter((did) => did !== id)
      const instance = this.instances.get(id)
      if (instance) {
        instance.status = 'waiting'
        instance.scheduledAt = undefined
        this.waiting.push(id)
      }
    }

    if (ready.length > 0) {
      this.processQueue()
    }
  }

  // ─── Dead Letter Queue Management ────────────────────────────

  getDeadLetterJobs(): JobInstance[] {
    return this.failed
      .map((id) => this.instances.get(id))
      .filter((j): j is JobInstance => j !== undefined)
      .slice(-50) // Last 50
  }

  async retryJob(jobId: string): Promise<boolean> {
    const instance = this.instances.get(jobId)
    if (!instance || instance.status !== 'failed') return false

    instance.status = 'waiting'
    instance.attempts = 0
    instance.error = undefined
    instance.completedAt = undefined
    instance.startedAt = undefined
    this.failed = this.failed.filter((id) => id !== jobId)
    this.waiting.push(jobId)
    this.processQueue()
    return true
  }

  async retryAllFailed(): Promise<number> {
    const failedIds = [...this.failed]
    let count = 0
    for (const id of failedIds) {
      if (await this.retryJob(id)) count++
    }
    return count
  }

  async clearDeadLetter(): Promise<number> {
    const count = this.failed.length
    for (const id of this.failed) {
      this.instances.delete(id)
    }
    this.failed = []
    return count
  }

  // ─── Status & Stats ──────────────────────────────────────────

  getStatus(): { waiting: number; delayed: number; running: number; completed: number; failed: number; total: number } {
    let completed = 0
    let failedCount = 0
    for (const [, instance] of this.instances) {
      if (instance.status === 'completed') completed++
      if (instance.status === 'failed') failedCount++
    }
    return {
      waiting: this.waiting.length,
      delayed: this.delayed.length,
      running: this.running.size,
      completed,
      failed: failedCount,
      total: this.instances.size,
    }
  }

  getJob(id: string): JobInstance | undefined {
    return this.instances.get(id)
  }

  listJobs(status?: JobInstance['status']): JobInstance[] {
    const all = Array.from(this.instances.values())
    return status ? all.filter((j) => j.status === status) : all
  }

  // ─── Cleanup ─────────────────────────────────────────────────

  async close(): Promise<void> {
    if (this.delayedTimer) clearInterval(this.delayedTimer)
    // Wait for running jobs to finish
    while (this.activeCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    this.removeAllListeners()
  }
}

// ─── Helpers ───────────────────────────────────────────────────

export function parseDuration(str: string): number {
  const match = str.match(/^(\d+)\s*(ms|s|m|h|d)?$/)
  if (!match) return 0
  const value = parseInt(match[1]!, 10)
  const unit = match[2] || 'ms'
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  }
  return value * (multipliers[unit] ?? 1)
}

// ─── Job Base Class ────────────────────────────────────────────

export abstract class Job {
  abstract name: string
  abstract handle(payload: JobPayload): Promise<void>
  retry: { maxAttempts: number; backoff: 'fixed' | 'exponential'; maxDelay: string } = {
    maxAttempts: 3,
    backoff: 'exponential',
    maxDelay: '1h',
  }
}
