import type { QueryRunner } from './types.js'

export interface BatchOptions {
  chunkSize?: number
  transaction?: boolean
  onProgress?: (completed: number, total: number) => void
}

export interface QueryAnalysis {
  sql: string
  explain: any
  timing: number
  warnings: string[]
  rowCount: number
}

export async function rawQuery<T = any>(
  connection: QueryRunner,
  sql: string,
  params?: any[],
): Promise<T[]> {
  if (!connection || typeof connection.raw !== 'function') {
    throw new Error('Invalid database connection provided to rawQuery')
  }
  const result = await connection.raw(sql, params ?? [])
  return (result.rows ?? []) as T[]
}

export async function* streamQuery<T = any>(
  connection: QueryRunner,
  sql: string,
  params?: any[],
  options?: { chunkSize?: number },
): AsyncIterableIterator<T> {
  if (!connection || typeof connection.raw !== 'function') {
    throw new Error('Invalid database connection provided to streamQuery')
  }

  const chunkSize = options?.chunkSize ?? 1000
  if (chunkSize < 1) {
    throw new Error('chunkSize must be >= 1')
  }

  let offset = 0

  while (true) {
    const pageSql = `SELECT * FROM (${sql}) AS _stream_qv2 LIMIT ${chunkSize} OFFSET ${offset}`
    const result = await connection.raw(pageSql, params ?? [])
    const rows = result.rows ?? []

    for (const row of rows) {
      yield row as T
    }

    if (rows.length < chunkSize) break
    offset += chunkSize
  }
}

export async function analyzeQuery(
  connection: QueryRunner,
  sql: string,
  params?: any[],
): Promise<QueryAnalysis> {
  if (!connection || typeof connection.raw !== 'function') {
    throw new Error('Invalid database connection provided to analyzeQuery')
  }

  const driver = connection.getDriver()
  const warnings: string[] = []

  let explainResult: any
  if (driver === 'mysql') {
    const result = await connection.raw(`EXPLAIN ${sql}`, params ?? [])
    explainResult = result.rows
  } else if (driver === 'postgresql') {
    const result = await connection.raw(`EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ${sql}`, params ?? [])
    explainResult = result.rows
  } else {
    const result = await connection.raw(`EXPLAIN QUERY PLAN ${sql}`, params ?? [])
    explainResult = result.rows
  }

  if (driver === 'mysql' && Array.isArray(explainResult)) {
    for (const row of explainResult) {
      const accessType = (row.type ?? row.access_type ?? '').toLowerCase()
      const extra = (row.Extra ?? row.extra ?? '').toLowerCase()
      const tbl = row.table ?? 'unknown'

      if (accessType === 'all') {
        warnings.push(`Full table scan on \`${tbl}\` — consider adding an index`)
      }
      if (accessType === 'index') {
        warnings.push(`Full index scan on \`${tbl}\` — consider narrowing the index`)
      }
      if (extra.includes('using filesort')) {
        warnings.push(`Using filesort on \`${tbl}\` — add an index for the ORDER BY clause`)
      }
      if (extra.includes('using temporary')) {
        warnings.push(`Using temporary table on \`${tbl}\` — optimize the query or add indexes`)
      }
      if (row.possible_keys == null) {
        warnings.push(`No usable keys for \`${tbl}\` — query may be slow on large datasets`)
      }
    }
  } else if (driver === 'postgresql' && Array.isArray(explainResult)) {
    const extractPgWarnings = (plan: any, path = ''): void => {
      if (!plan || typeof plan !== 'object') return
      const nodeType = (plan['Node Type'] ?? '').toLowerCase()
      const relName = plan['Relation Name'] ?? plan['Index Name'] ?? path || 'unknown'

      if (nodeType === 'sequential scan') {
        warnings.push(`Sequential scan on \`${relName}\` — consider adding an index`)
      }
      if (nodeType === 'sort' || plan['Sort Key']) {
        warnings.push(`Sort operation on \`${relName}\` — consider adding an index for the ORDER BY`)
      }
      if (nodeType === 'hash join' && !plan['Hash Cond']) {
        warnings.push(`Hash join on \`${relName}\` without hash condition — may be inefficient`)
      }

      if (Array.isArray(plan['Plans'])) {
        for (const sub of plan['Plans']) {
          extractPgWarnings(sub, relName)
        }
      }
    }

    for (const row of explainResult) {
      let planObj = row
      if (typeof row === 'string') {
        try { planObj = JSON.parse(row) } catch { continue }
      }
      if (planObj?.[0]?.Plan) {
        extractPgWarnings(planObj[0].Plan)
      } else if (planObj?.Plan) {
        extractPgWarnings(planObj.Plan)
      }
    }
  } else if (Array.isArray(explainResult)) {
    for (const row of explainResult) {
      const detail = ((row.detail ?? row.description ?? '') as string).toLowerCase()
      if (detail.includes('scan')) {
        warnings.push(`Scan detected: ${row.detail ?? row.description}`)
      }
    }
  }

  const start = performance.now()
  const result = await connection.raw(sql, params ?? [])
  const timing = performance.now() - start

  return {
    sql,
    explain: explainResult,
    timing: Math.round(timing * 100) / 100,
    warnings,
    rowCount: (result.rows ?? []).length,
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export async function batchInsert<T extends Record<string, any>>(
  connection: QueryRunner,
  table: string,
  rows: T[],
  options?: BatchOptions,
): Promise<{ inserted: number; errors: Error[] }> {
  if (!connection || typeof connection.raw !== 'function') {
    throw new Error('Invalid database connection provided to batchInsert')
  }

  const chunkSize = options?.chunkSize ?? 500
  const useTransaction = options?.transaction !== false
  const onProgress = options?.onProgress
  const errors: Error[] = []
  let inserted = 0

  if (rows.length === 0) return { inserted: 0, errors: [] }

  const dialect = connection.getDialect()
  const wrapId = (c: string) => dialect.wrapIdentifier(c)
  const tableRef = wrapId(table)
  const cols = Object.keys(rows[0]!)
  const chunks = chunkArray(rows, chunkSize)

  const executeChunk = async (chunk: T[]): Promise<void> => {
    const bindings: any[] = []
    const placeholders = chunk.map((row) => {
      const vals = cols.map((col) => {
        bindings.push(row[col])
        return dialect.makeParameter(bindings.length - 1)
      })
      return `(${vals.join(', ')})`
    })
    const sql = `INSERT INTO ${tableRef} (${cols.map(wrapId).join(', ')}) VALUES ${placeholders.join(', ')}`
    await connection.raw(sql, bindings)
  }

  if (useTransaction) {
    const trx = connection as any
    if (typeof trx.transaction === 'function') {
      await trx.transaction(async (trxConn: QueryRunner) => {
        for (let i = 0; i < chunks.length; i++) {
          try {
            await executeChunk(chunks[i]!)
            inserted += chunks[i]!.length
          } catch (err) {
            errors.push(err instanceof Error ? err : new Error(String(err)))
          }
          onProgress?.(inserted, rows.length)
        }
      })
    } else {
      for (let i = 0; i < chunks.length; i++) {
        try {
          await executeChunk(chunks[i]!)
          inserted += chunks[i]!.length
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)))
        }
        onProgress?.(inserted, rows.length)
      }
    }
  } else {
    for (let i = 0; i < chunks.length; i++) {
      try {
        await executeChunk(chunks[i]!)
        inserted += chunks[i]!.length
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)))
      }
      onProgress?.(inserted, rows.length)
    }
  }

  return { inserted, errors }
}

export async function batchUpdate<T extends Record<string, any>>(
  connection: QueryRunner,
  table: string,
  rows: T[],
  keyField: string,
  options?: BatchOptions,
): Promise<{ updated: number; errors: Error[] }> {
  if (!connection || typeof connection.raw !== 'function') {
    throw new Error('Invalid database connection provided to batchUpdate')
  }

  const chunkSize = options?.chunkSize ?? 500
  const useTransaction = options?.transaction !== false
  const onProgress = options?.onProgress
  const errors: Error[] = []
  let updated = 0

  if (rows.length === 0) return { updated: 0, errors: [] }

  const dialect = connection.getDialect()
  const wrapId = (c: string) => dialect.wrapIdentifier(c)
  const tableRef = wrapId(table)
  const chunks = chunkArray(rows, chunkSize)

  const cols = Object.keys(rows[0]!).filter((k) => k !== keyField)
  if (cols.length === 0) {
    throw new Error('No columns to update besides the key field')
  }

  const executeChunk = async (chunk: T[]): Promise<number> => {
    let count = 0
    for (const row of chunk) {
      if (row[keyField] == null) {
        errors.push(new Error(`Row missing key field "${keyField}"`))
        continue
      }
      const bindings: any[] = []
      const setClauses = cols.map((col) => {
        bindings.push(row[col])
        return `${wrapId(col)} = ${dialect.makeParameter(bindings.length - 1)}`
      })
      bindings.push(row[keyField])
      const sql = `UPDATE ${tableRef} SET ${setClauses.join(', ')} WHERE ${wrapId(keyField)} = ${dialect.makeParameter(bindings.length - 1)}`
      await connection.raw(sql, bindings)
      count++
    }
    return count
  }

  if (useTransaction) {
    const trx = connection as any
    if (typeof trx.transaction === 'function') {
      await trx.transaction(async (trxConn: QueryRunner) => {
        for (let i = 0; i < chunks.length; i++) {
          try {
            const count = await executeChunk(chunks[i]!)
            updated += count
          } catch (err) {
            errors.push(err instanceof Error ? err : new Error(String(err)))
          }
          onProgress?.(updated, rows.length)
        }
      })
    } else {
      for (let i = 0; i < chunks.length; i++) {
        try {
          const count = await executeChunk(chunks[i]!)
          updated += count
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)))
        }
        onProgress?.(updated, rows.length)
      }
    }
  } else {
    for (let i = 0; i < chunks.length; i++) {
      try {
        const count = await executeChunk(chunks[i]!)
        updated += count
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)))
      }
      onProgress?.(updated, rows.length)
    }
  }

  return { updated, errors }
}
