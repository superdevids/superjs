export interface SessionInfo {
  id: string
  userId: string
  device?: string
  ip?: string
  lastActive: Date
  createdAt: Date
  userAgent?: string
}

export interface SessionRecord {
  id: string
  userId: string
  session: Omit<SessionInfo, 'id' | 'userId'>
  expiresAt: number
}

export interface SessionStore {
  findById(id: string): Promise<SessionRecord | null>
  findByUser(userId: string): Promise<SessionRecord[]>
  update(id: string, data: Partial<SessionRecord>): Promise<void>
  delete(id: string): Promise<void>
  deleteMany(userId: string, excludeId?: string): Promise<number>
}

class MemorySessionStoreImpl implements SessionStore {
  private sessions = new Map<string, SessionRecord>()

  async findById(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null
  }

  async findByUser(userId: string): Promise<SessionRecord[]> {
    const results: SessionRecord[] = []
    for (const record of this.sessions.values()) {
      if (record.userId === userId) results.push(record)
    }
    return results
  }

  async update(id: string, data: Partial<SessionRecord>): Promise<void> {
    const existing = this.sessions.get(id)
    if (existing) this.sessions.set(id, { ...existing, ...data })
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id)
  }

  async deleteMany(userId: string, excludeId?: string): Promise<number> {
    let count = 0
    for (const [id, record] of this.sessions) {
      if (record.userId === userId && id !== excludeId) {
        this.sessions.delete(id)
        count++
      }
    }
    return count
  }
}

export class SessionManager {
  private store: SessionStore

  constructor(store?: SessionStore) {
    this.store = store ?? new MemorySessionStoreImpl()
  }

  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const records = await this.store.findByUser(userId)
    const now = Date.now()
    return records
      .filter((r) => r.expiresAt > now)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        ...r.session,
      }))
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    const record = await this.store.findById(sessionId)
    if (!record) return false
    await this.store.delete(sessionId)
    return true
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    return this.store.deleteMany(userId, currentSessionId)
  }

  async touchSession(
    sessionId: string,
    data: Partial<Pick<SessionInfo, 'device' | 'ip' | 'userAgent'>>,
  ): Promise<void> {
    const record = await this.store.findById(sessionId)
    if (!record) return

    await this.store.update(sessionId, {
      session: {
        ...record.session,
        ...data,
        lastActive: new Date(),
      },
    })
  }
}
