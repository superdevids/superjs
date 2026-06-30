import { readFileSync, existsSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colors } from '../../native/colors.js'

interface SdkEndpoint {
  method: string
  path: string
  methodName: string
  returnType: string
  params: string[]
}

interface SdkDiff {
  breaking: SdkChange[]
  added: SdkChange[]
  removed: SdkChange[]
  unchanged: number
}

interface SdkChange {
  endpoint: string
  description: string
}

export async function sdkDiff(options: { old?: string; new?: string }): Promise<void> {
  const sdkPath = options.new || resolve(process.cwd(), 'sdk', 'client.ts')
  const oldSdkPath = options.old || resolve(process.cwd(), 'sdk', 'client.old.ts')

  if (!existsSync(sdkPath)) {
    console.error(`  ${colors.red('✗')} SDK not found at ${sdkPath}`)
    console.log(`  ${colors.dim('  Generate SDK first: speexjs generate:sdk')}`)
    process.exit(1)
  }

  if (!existsSync(oldSdkPath)) {
    console.log(`  ${colors.yellow('ℹ')} No previous SDK version found. Saving current as baseline...`)
    copyFileSync(sdkPath, oldSdkPath)
    console.log(`  ${colors.green('✅')} Baseline saved to ${oldSdkPath}`)
    return
  }

  const currentContent = readFileSync(sdkPath, 'utf-8')
  const oldContent = readFileSync(oldSdkPath, 'utf-8')

  const currentEndpoints = parseEndpoints(currentContent)
  const oldEndpoints = parseEndpoints(oldContent)

  const diff = computeDiff(oldEndpoints, currentEndpoints)

  console.log(`\n  ${colors.bold('🔄 SDK Evolution Report')}`)
  console.log(`  ${colors.dim('─'.repeat(60))}`)
  console.log()

  if (diff.breaking.length > 0) {
    console.log(`  ${colors.red(`⚠ ${diff.breaking.length} BREAKING CHANGE(S):`)}`)
    for (const change of diff.breaking) {
      console.log(`  ${colors.red('  ✗')} ${change.endpoint}`)
      console.log(`    ${colors.dim(change.description)}`)
    }
    console.log()
  }

  if (diff.added.length > 0) {
    console.log(`  ${colors.green(`✓ ${diff.added.length} NEW ENDPOINT(S):`)}`)
    for (const change of diff.added) {
      console.log(`  ${colors.green('  +')} ${change.endpoint}`)
      console.log(`    ${colors.dim(change.description)}`)
    }
    console.log()
  }

  if (diff.removed.length > 0) {
    console.log(`  ${colors.yellow(`- ${diff.removed.length} REMOVED ENDPOINT(S):`)}`)
    for (const change of diff.removed) {
      console.log(`  ${colors.yellow('  -')} ${change.endpoint}`)
    }
    console.log()
  }

  console.log(`  ${colors.dim(`  ${diff.unchanged} endpoints unchanged`)}`)
  console.log()

  if (diff.breaking.length > 0) {
    console.log(`  ${colors.yellow('💡 Recommendation: Publish new SDK major version (v2 → v3)')}`)
  }
}

function parseEndpoints(content: string): SdkEndpoint[] {
  const endpoints: SdkEndpoint[] = []

  const groupMatches = content.matchAll(/(\w+)\s*=\s*\{([^}]+)\}/gs)
  for (const match of groupMatches) {
    const group = match[1]!
    const body = match[2]!

    const methodMatches = body.matchAll(/(\w+):\s*(?:\(([^)]*)\))?\s*=>\s*this\.(\w+)<([^>]+)>\(([^)]+)\)/g)
    for (const mm of methodMatches) {
      endpoints.push({
        method: mm[3]!.toUpperCase(),
        path: mm[5]!,
        methodName: `${group}.${mm[1]!}`,
        returnType: mm[4]!,
        params: (mm[2] || '').split(',').map(p => p.trim()).filter(Boolean),
      })
    }
  }

  return endpoints
}

function computeDiff(oldEndpoints: SdkEndpoint[], newEndpoints: SdkEndpoint[]): SdkDiff {
  const diff: SdkDiff = { breaking: [], added: [], removed: [], unchanged: 0 }

  const oldMap = new Map(oldEndpoints.map(e => [e.methodName, e]))
  const newMap = new Map(newEndpoints.map(e => [e.methodName, e]))

  for (const [name, old] of oldMap) {
    const current = newMap.get(name)
    if (!current) {
      diff.removed.push({
        endpoint: name,
        description: `"${name}" was removed`,
      })
    } else if (current.returnType !== old.returnType) {
      diff.breaking.push({
        endpoint: name,
        description: `"${name}" return type changed: "${old.returnType}" → "${current.returnType}"`,
      })
    } else {
      diff.unchanged++
    }
  }

  for (const [name, current] of newMap) {
    if (!oldMap.has(name)) {
      diff.added.push({
        endpoint: name,
        description: `"${name}" endpoint added: ${current.method} ${current.path}`,
      })
    }
  }

  return diff
}
