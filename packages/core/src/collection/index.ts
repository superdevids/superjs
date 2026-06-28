/**
 * Groups an array of items by a key extracted from each item.
 *
 * @example groupBy([{ type: 'a' }, { type: 'b' }, { type: 'a' }], x => x.type)
 *          // => { a: [{ type: 'a' }, { type: 'a' }], b: [{ type: 'b' }] }
 */
export function groupBy<T, K extends string | number | symbol>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>
  for (const item of items) {
    const key = keyFn(item)
    if (!result[key]) result[key] = []
    result[key]!.push(item)
  }
  return result
}

/**
 * Creates an object keyed by the result of keyFn for each item.
 *
 * @example keyBy([{ id: 1, name: 'a' }, { id: 2, name: 'b' }], x => x.id)
 *          // => { 1: { id: 1, name: 'a' }, 2: { id: 2, name: 'b' } }
 */
export function keyBy<T, K extends string | number | symbol>(items: T[], keyFn: (item: T) => K): Record<K, T> {
  const result = {} as Record<K, T>
  for (const item of items) {
    const key = keyFn(item)
    result[key] = item
  }
  return result
}

/**
 * Returns a copy of the object with the specified keys omitted.
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj } as T
  for (const key of keys) {
    delete result[key]
  }
  return result as Omit<T, K>
}

/**
 * Returns a copy of the object with only the specified keys.
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * Extracts a property value from each item in an array.
 */
export function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map(item => item[key])
}

/**
 * Randomizes array order in-place using the Fisher-Yates algorithm.
 */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = result[i]!
    result[i] = result[j]!
    result[j] = temp
  }
  return result
}

/**
 * Returns a random element from the array, or undefined if empty.
 */
export function sample<T>(items: T[]): T | undefined {
  return items.length > 0 ? items[Math.floor(Math.random() * items.length)] : undefined
}

/**
 * Returns an array of `size` random elements (without duplicates).
 */
export function sampleSize<T>(items: T[], size: number): T[] {
  if (size <= 0 || items.length === 0) return []
  const pool = shuffle(items)
  return pool.slice(0, Math.min(size, items.length))
}

/**
 * Splits an array into chunks of the specified size.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) return []
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

/**
 * Returns a sorted copy of the array using the provided criteria functions.
 * Earlier criteria take precedence.
 */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1
  return String(a) < String(b) ? -1 : 1
}

export function sortBy<T>(items: T[], ...criteria: Array<(item: T) => unknown>): T[] {
  return [...items].sort((a, b) => {
    for (const criterion of criteria) {
      const cmp = compareValues(criterion(a), criterion(b))
      if (cmp !== 0) return cmp
    }
    return 0
  })
}

/**
 * Returns a sorted copy of the array by a single key and direction.
 */
export function orderBy<T>(items: T[], key: (item: T) => unknown, direction: SortDirection = 'asc'): T[] {
  return [...items].sort((a, b) => {
    const cmp = compareValues(key(a), key(b))
    return direction === 'asc' ? cmp : -cmp
  })
}

/**
 * Returns unique elements based on the result of keyFn.
 */
export function uniqueBy<T>(items: T[], keyFn: (item: T) => unknown): T[] {
  const seen = new Set<unknown>()
  return items.filter(item => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Flattens an array of arrays one level.
 */
export function flatten<T>(items: T[][]): T[] {
  const result: T[] = []
  for (const sub of items) {
    for (const item of sub) {
      result.push(item)
    }
  }
  return result
}

/**
 * Returns an array with unique primitive values.
 */
export function uniq<T>(items: T[]): T[] {
  return [...new Set(items)]
}

/**
 * Returns the first element, or undefined if empty.
 */
export function first<T>(items: T[]): T | undefined {
  return items[0]
}

/**
 * Returns the last element, or undefined if empty.
 */
export function last<T>(items: T[]): T | undefined {
  return items[items.length - 1]
}

/**
 * Checks if a value is empty.
 * Works for arrays, objects, strings, Map, and Set.
 */
export function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.length === 0
  if (value instanceof Map || value instanceof Set) return value.size === 0
  if (value !== null && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0
  return false
}

export type SortDirection = 'asc' | 'desc'

export function topoSort<T extends { id: string; dependencies?: string[] }>(items: T[]): T[] {
  const adj = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const itemMap = new Map<string, T>()

  for (const item of items) {
    itemMap.set(item.id, item)
    if (!adj.has(item.id)) adj.set(item.id, [])
    if (!inDegree.has(item.id)) inDegree.set(item.id, 0)
  }

  for (const item of items) {
    if (item.dependencies) {
      for (const depId of item.dependencies) {
        adj.get(depId)?.push(item.id)
        inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1)
      }
    }
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const neighbor of adj.get(id) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  if (sorted.length !== items.length) {
    throw new Error('Circular dependency detected')
  }

  return sorted.map(id => itemMap.get(id)!)
}

export function slidingWindows<T>(items: T[], size: number, step: number = 1): T[][] {
  if (size <= 0 || items.length === 0 || step <= 0) return []
  const result: T[][] = []
  for (let i = 0; i + size <= items.length; i += step) {
    result.push(items.slice(i, i + size))
  }
  return result
}

export function tumblingWindows<T>(items: T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) return []
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

/**
 * Gets a nested value from an object using a dot-separated path.
 *
 * @example deepGet({ a: { b: 2 } }, 'a.b') // 2
 * @example deepGet({ a: { b: 2 } }, 'a.c') // undefined
 */
export function deepGet<T = unknown>(obj: unknown, path: string, default_?: T): T | undefined {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined) return default_
    if (typeof current !== 'object') return default_
    const curObj = current as Record<string, unknown>
    if (!(key in curObj)) return default_
    current = curObj[key]
  }
  return (current as T) ?? default_
}

/**
 * Sets a nested value in an object using a dot-separated path.
 * Creates intermediate objects/arrays as needed.
 *
 * @example deepSet({ a: { b: 2 } }, 'a.b', 3) // { a: { b: 3 } }
 * @example deepSet({}, 'a.b.c', 1) // { a: { b: { c: 1 } } }
 */
export function deepSet<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.')
  const result = { ...obj } as Record<string, unknown>
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!
    const next = current[key]
    if (next === null || next === undefined || typeof next !== 'object') {
      const isArray = /^\d+$/.test(keys[i + 1]!)
      current[key] = isArray ? [] : {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]!] = value
  return result as T
}

/**
 * Splits an array into two groups: those that pass the predicate and those that don't.
 *
 * @example partition([1, 2, 3, 4, 5], n => n % 2 === 0)
 *          // => [[2, 4], [1, 3, 5]]
 */
export function partition<T>(items: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = []
  const fail: T[] = []
  for (const item of items) {
    if (predicate(item)) pass.push(item)
    else fail.push(item)
  }
  return [pass, fail]
}

/**
 * Removes all falsy values from an array (false, null, 0, '', undefined, NaN).
 *
 * @example compact([0, 1, false, 2, '', 3, null, undefined, NaN])
 *          // => [1, 2, 3]
 */
export function compact<T>(items: (T | false | null | 0 | '' | undefined)[]): T[] {
  return items.filter(Boolean) as T[]
}

/**
 * Returns elements in array A that are not in array B (uses SameValueZero).
 *
 * @example difference([1, 2, 3, 4], [2, 4])
 *          // => [1, 3]
 */
export function difference<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b)
  return a.filter(item => !setB.has(item))
}

/**
 * Returns elements present in all given arrays (uses SameValueZero).
 *
 * @example intersection([1, 2, 3], [2, 3, 4])
 *          // => [2, 3]
 */
export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b)
  return a.filter(item => setB.has(item))
}

/**
 * Returns unique elements from all given arrays.
 *
 * @example union([1, 2], [2, 3], [3, 4])
 *          // => [1, 2, 3, 4]
 */
export function union<T>(...arrays: T[][]): T[] {
  const set = new Set<T>()
  for (const arr of arrays) {
    for (const item of arr) {
      set.add(item)
    }
  }
  return [...set]
}

/**
 * Merges arrays element-wise into tuples, stopping at the shortest array.
 *
 * @example zip(['a', 'b', 'c'], [1, 2])
 *          // => [['a', 1], ['b', 2]]
 */
export function zip<T, U>(a: T[], b: U[]): [T, U][]
export function zip<T, U, V>(a: T[], b: U[], c: V[]): [T, U, V][]
export function zip<T>(...arrays: T[][]): T[][] {
  if (arrays.length === 0) return []
  const minLen = Math.min(...arrays.map(a => a.length))
  const result: T[][] = []
  for (let i = 0; i < minLen; i++) {
    const tuple: T[] = []
    for (const arr of arrays) {
      tuple.push(arr[i]!)
    }
    result.push(tuple)
  }
  return result
}

/**
 * Inverse of zip: splits an array of tuples back into individual arrays.
 *
 * @example unzip([['a', 1], ['b', 2]])
 *          // => [['a', 'b'], [1, 2]]
 */
export function unzip<T>(paired: T[][]): T[][] {
  if (paired.length === 0) return []
  const tupleLen = paired.reduce((max, t) => Math.max(max, t.length), 0)
  const result: T[][] = Array.from({ length: tupleLen }, () => [])
  for (const tuple of paired) {
    for (let i = 0; i < tupleLen; i++) {
      result[i]!.push(tuple[i] as T)
    }
  }
  return result
}

/**
 * Counts occurrences of each key produced by the key function.
 *
 * @example countBy([1, 2, 3, 4, 5], n => n % 2 === 0 ? 'even' : 'odd')
 *          // => { odd: 3, even: 2 }
 */
export function countBy<T, K extends string | number | symbol>(items: T[], keyFn: (item: T) => K): Record<K, number> {
  const result = {} as Record<K, number>
  for (const item of items) {
    const key = keyFn(item)
    result[key] = (result[key] ?? 0) + 1
  }
  return result
}

/**
 * Returns the element with the maximum value by the key function.
 *
 * @example maxBy([{ name: 'a', score: 10 }, { name: 'b', score: 20 }], x => x.score)
 *          // => { name: 'b', score: 20 }
 */
export function maxBy<T>(items: T[], keyFn: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined
  let maxItem = items[0]!
  let maxVal = keyFn(maxItem)
  for (let i = 1; i < items.length; i++) {
    const val = keyFn(items[i]!)
    if (val > maxVal) {
      maxVal = val
      maxItem = items[i]!
    }
  }
  return maxItem
}

/**
 * Returns the element with the minimum value by the key function.
 *
 * @example minBy([{ name: 'a', score: 10 }, { name: 'b', score: 20 }], x => x.score)
 *          // => { name: 'a', score: 10 }
 */
export function minBy<T>(items: T[], keyFn: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined
  let minItem = items[0]!
  let minVal = keyFn(minItem)
  for (let i = 1; i < items.length; i++) {
    const val = keyFn(items[i]!)
    if (val < minVal) {
      minVal = val
      minItem = items[i]!
    }
  }
  return minItem
}

/**
 * Returns the sum of values produced by the key function.
 *
 * @example sumBy([{ n: 1 }, { n: 2 }, { n: 3 }], x => x.n)
 *          // => 6
 */
export function sumBy<T>(items: T[], keyFn: (item: T) => number): number {
  let total = 0
  for (const item of items) {
    total += keyFn(item)
  }
  return total
}

/**
 * Returns the index of the first element satisfying the predicate, or -1.
 *
 * @example findIndex([1, 3, 5, 8, 10], n => n % 2 === 0)
 *          // => 3
 */
export function findIndex<T>(items: T[], predicate: (item: T) => boolean, fromIndex: number = 0): number {
  for (let i = fromIndex; i < items.length; i++) {
    if (predicate(items[i]!)) return i
  }
  return -1
}

/**
 * Finds the last element satisfying the predicate.
 *
 * @example findLast([1, 2, 3, 4, 5], n => n % 2 === 0)
 *          // => 4
 */
export function findLast<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i]!)) return items[i]
  }
  return undefined
}

/**
 * Drops the first n elements from the array.
 *
 * @example drop([1, 2, 3, 4, 5], 2)
 *          // => [3, 4, 5]
 */
export function drop<T>(items: T[], n: number = 1): T[] {
  return items.slice(Math.max(0, n))
}

/**
 * Drops the last n elements from the array.
 *
 * @example dropRight([1, 2, 3, 4, 5], 2)
 *          // => [1, 2, 3]
 */
export function dropRight<T>(items: T[], n: number = 1): T[] {
  return items.slice(0, Math.max(0, items.length - n))
}

/**
 * Takes the first n elements from the array.
 *
 * @example take([1, 2, 3, 4, 5], 2)
 *          // => [1, 2]
 */
export function take<T>(items: T[], n: number = 1): T[] {
  return items.slice(0, Math.max(0, n))
}

/**
 * Takes the last n elements from the array.
 *
 * @example takeRight([1, 2, 3, 4, 5], 2)
 *          // => [4, 5]
 */
export function takeRight<T>(items: T[], n: number = 1): T[] {
  return items.slice(Math.max(0, items.length - n))
}

/**
 * Removes specified values from the array (uses SameValueZero).
 *
 * @example without([1, 2, 1, 3, 1, 4], 1, 3)
 *          // => [2, 4]
 */
export function without<T>(items: T[], ...values: T[]): T[] {
  const exclude = new Set(values)
  return items.filter(item => !exclude.has(item))
}

/**
 * Gets the element at the given index. Supports negative indexing.
 *
 * @example nth([1, 2, 3], 1)   // => 2
 * @example nth([1, 2, 3], -1)  // => 3
 */
export function nth<T>(items: T[], index: number): T | undefined {
  return index < 0 ? items[items.length + index] : items[index]
}
