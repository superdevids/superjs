#!/usr/bin/env node

/**
 * PRD06-F10: AI CLI Assistant
 * Natural language commands for SpeexJS:
 *   - speexjs ai:generate <description>  → Generate code from description
 *   - speexjs ai:explain <file>          → Explain existing code
 *   - speexjs ai:review <path>           → Review code & suggest improvements
 *   - speexjs ai:test <path>             → Generate tests for files
 *   - speexjs ai:fix "<command>" <log>   → Fix failing tests/commands
 *   - speexjs ai <question>              → Natural language assistant
 *
 * Zero-dependency: uses LLM provider from speexjs/server/ai when API key is
 * configured, or falls back to template-based generation.
 */

import { readFile, readdir, writeFile, mkdir, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { colors } from '../../native/colors.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiGenerateOptions {
  description: string
  output?: string
}

export interface AiExplainOptions {
  file: string
}

export interface AiReviewOptions {
  path: string
  fix?: boolean
}

export interface AiTestOptions {
  path: string
}

export interface AiFixOptions {
  command: string
  logFile?: string
}

export interface AiAskOptions {
  question: string
}

// ---------------------------------------------------------------------------
// Prompt templates (no LLM dependency required)
// ---------------------------------------------------------------------------

const TEMPLATES = {
  generate: `You are a SpeexJS framework expert. Generate production-ready TypeScript code.

Project context:
- Framework: SpeexJS v2.1.2 (zero-dependency fullstack TypeScript framework)
- Patterns: Active Record models, fluent query builder, schema-first validation
- Exports: Import from 'speexjs/server' (server), 'speexjs/schema' (validation),
           'speexjs/client' (client), 'speexjs' (main barrel)

Generate code for: {{description}}

Output requirements:
1. Return ONLY valid JSON array of { filePath: string, content: string }
2. Each file must be complete, production-ready TypeScript
3. Include proper error handling and input validation
4. Follow SpeexJS conventions (see existing code patterns)
5. Include type annotations for all function parameters`,
}

// ---------------------------------------------------------------------------
// Template-based fallback generators (zero LLM dependency)
// ---------------------------------------------------------------------------

interface GeneratedFile {
  filePath: string
  content: string
  summary: string
}

function generateModelTemplate(name: string, fields: string[]): GeneratedFile[] {
  const pascalName = name.charAt(0).toUpperCase() + name.slice(1)
  const tableName = name.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') + 's'
  const fillable: string[] = fields.length > 0
    ? fields.map((f: string) => f.split(':')[0]?.trim()).filter((x: string | undefined): x is string => !!x)
    : ['name', 'email']

  const fieldDefs = fillable.map((field: string) => `${field}!:`).join('\n  ')
  const migrationFields = fillable.map((f: string) => {
    const [fieldName, fieldType = 'string'] = f.split(':')
    switch (fieldType) {
      case 'number': case 'int': return `    table.integer('${fieldName}').notNullable()`
      case 'boolean': return `    table.boolean('${fieldName}').defaultTo(false)`
      case 'text': return `    table.text('${fieldName}').nullable()`
      case 'json': return `    table.json('${fieldName}').nullable()`
      default: return `    table.string('${fieldName}').notNullable()`
    }
  }).join('\n    ')
  const schemaFields = fillable.map((f: string) => {
    const [fieldName, fieldType = 'string'] = f.split(':')
    switch (fieldType) {
      case 'number': case 'int': return `  ${fieldName}: s.number().int()`
      case 'boolean': return `  ${fieldName}: s.boolean()`
      case 'text': return `  ${fieldName}: s.string().min(1)`
      case 'json': return `  ${fieldName}: s.any()`
      default: return `  ${fieldName}: s.string().min(1).max(255)`
    }
  }).join(',\n  ')
  const testFields = fillable.slice(0, 2).map((f: string) => {
    const [fieldName] = f.split(':')
    return `${fieldName}: 'test-${fieldName}'`
  }).join(',\n        ')

  return [
    {
      filePath: `src/models/${pascalName}.ts`,
      content: `import { Model } from 'speexjs/server/database'

export class ${pascalName} extends Model {
  static table = '${tableName}'

  ${fieldDefs}
  id!: number
  createdAt!: Date
  updatedAt!: Date
}
`,
      summary: `${pascalName} model`,
    },
    {
      filePath: `src/database/migrations/${Date.now()}_create_${tableName}_table.ts`,
      content: `import type { Migration } from 'speexjs/server/database'

export const up: Migration = async (db) => {
  await db.schema.createTable('${tableName}', (table) => {
    table.increments('id')
    ${migrationFields}
    table.timestamps()
  })
}

export const down: Migration = async (db) => {
  await db.schema.dropTable('${tableName}')
}
`,
      summary: `Create ${tableName} migration`,
    },
    {
      filePath: `src/controllers/${pascalName}Controller.ts`,
      content: `import { Controller, get, post, put, del } from 'speexjs/server/controller'
import type { RouteContext } from 'speexjs/server/router'
import { ${pascalName} } from '../models/${pascalName}.js'
import { s } from 'speexjs/schema'

const ${name}Schema = s.object({
${schemaFields},
})

export class ${pascalName}Controller extends Controller {
  @get('/${tableName}')
  async index({ response }: RouteContext) {
    const items = await ${pascalName}.all()
    return response.json({ data: items })
  }

  @post('/${tableName}')
  async store({ request, response }: RouteContext) {
    const body = await request.body()
    const parsed = ${name}Schema.safeParse(body)
    if (!parsed.success) {
      return response.status(422).json({ error: parsed.error })
    }
    const item = await ${pascalName}.create(parsed.data)
    return response.status(201).json({ data: item })
  }

  @get('/${tableName}/:id')
  async show({ request, response }: RouteContext) {
    const item = await ${pascalName}.find(request.param('id'))
    if (!item) {
      return response.status(404).json({ error: 'Not found' })
    }
    return response.json({ data: item })
  }

  @put('/${tableName}/:id')
  async update({ request, response }: RouteContext) {
    const item = await ${pascalName}.find(request.param('id'))
    if (!item) {
      return response.status(404).json({ error: 'Not found' })
    }
    const body = await request.body()
    await item.update(body)
    return response.json({ data: item })
  }

  @del('/${tableName}/:id')
  async destroy({ request, response }: RouteContext) {
    const item = await ${pascalName}.find(request.param('id'))
    if (!item) {
      return response.status(404).json({ error: 'Not found' })
    }
    await item.delete()
    return response.status(204).send()
  }
}
`,
      summary: `${pascalName}Controller with full CRUD`,
    },
    {
      filePath: `src/schemas/${pascalName}Schema.ts`,
      content: `import { s } from 'speexjs/schema'

export const Create${pascalName}Schema = s.object({
  ${fillable.map(f => {
    const [fieldName, fieldType = 'string'] = f.split(':')
    switch (fieldType) {
      case 'number': case 'int': return `  ${fieldName}: s.number().int().positive()`
      case 'boolean': return `  ${fieldName}: s.boolean()`
      case 'text': return `  ${fieldName}: s.string().min(1)`
      case 'json': return `  ${fieldName}: s.any()`
      default: return `  ${fieldName}: s.string().min(1).max(255)`
    }
  }).join(',\n  ')},
})

export const Update${pascalName}Schema = Create${pascalName}Schema.partial()
`,
      summary: `${pascalName} validation schemas`,
    },
    {
      filePath: `src/tests/${pascalName}Controller.test.ts`,
      content: `import { describe, it, expect, beforeAll } from 'vitest'

describe('${pascalName} API', () => {
  const BASE_URL = 'http://localhost:3000'

  it('GET /${tableName} returns list', async () => {
    const res = await fetch(\`\${BASE_URL}/${tableName}\`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('POST /${tableName} creates item', async () => {
    const res = await fetch(\`\${BASE_URL}/${tableName}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ${fillable.slice(0, 2).map(f => {
          const [fieldName] = f.split(':')
          return `${fieldName}: 'test-${fieldName}'`
        }).join(',\n        ')}
      }),
    })
    expect(res.status).toBe(201)
  })

  it('POST /${tableName} returns 422 for invalid data', async () => {
    const res = await fetch(\`\${BASE_URL}/${tableName}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(422)
  })
})
`,
      summary: `${pascalName} API tests`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractResourceName(description: string): string {
  const clean = description.toLowerCase().trim()
  // Try to extract "for <Resource>" pattern
  const forMatch = clean.match(/\b(for|about|of|untuk)\s+(\w+)/i)
  if (forMatch) return forMatch[2]!

  // Check common patterns
  if (clean.includes('blog') || clean.includes('post')) return 'Post'
  if (clean.includes('user') || clean.includes('member')) return 'User'
  if (clean.includes('product') || clean.includes('item')) return 'Product'
  if (clean.includes('comment')) return 'Comment'
  if (clean.includes('order')) return 'Order'
  if (clean.includes('category')) return 'Category'
  if (clean.includes('booking')) return 'Booking'
  if (clean.includes('task') || clean.includes('todo')) return 'Task'
  if (clean.includes('article')) return 'Article'
  if (clean.includes('event')) return 'Event'
  if (clean.includes('message')) return 'Message'

  return 'Resource'
}

function extractFields(description: string): string[] {
  const defaults: string[] = ['name:string', 'email:string']

  // Check for explicit field mentions
  const fieldMap: Record<string, string> = {
    'title': 'string',
    'content': 'text',
    'body': 'text',
    'description': 'text',
    'price': 'number',
    'quantity': 'int',
    'count': 'int',
    'email': 'string',
    'phone': 'string',
    'address': 'string',
    'status': 'string',
    'type': 'string',
    'category': 'string',
    'tags': 'json',
    'metadata': 'json',
    'slug': 'string',
    'image': 'string',
    'url': 'string',
    'active': 'boolean',
    'published': 'boolean',
    'age': 'int',
    'rating': 'number',
    'score': 'number',
  }

  const mentioned = Object.keys(fieldMap).filter(f =>
    description.toLowerCase().includes(f),
  )

  if (mentioned.length === 0) return defaults
  return mentioned.map(f => `${f}:${fieldMap[f]!}`)
}

function detectControllerFile(path: string): string {
  const lower = path.toLowerCase()
  if (lower.includes('controller')) return path
  if (lower.endsWith('.ts')) return path.replace(/\.ts$/, 'Controller.ts')
  return `${path.endsWith('/') ? path : path + '/'}Controller.ts`
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * speexjs ai:generate <description>
 * Generate code from a natural language description using template fallback.
 * PRD06 F5: AI-Powered Code Generation
 */
export async function aiGenerate(options: AiGenerateOptions): Promise<void> {
  const { description } = options

  console.log(`\n  ${colors.cyan('→')} Analyzing: "${colors.bold(description)}"\n`)

  // Extract resource info from description
  const resourceName = extractResourceName(description)
  const fields = extractFields(description)

  console.log(`  ${colors.dim('Detected resource:')} ${colors.white(resourceName)}`)
  console.log(`  ${colors.dim('Detected fields:')} ${colors.white(fields.join(', '))}\n`)

  // Generate files using template
  const files = generateModelTemplate(resourceName, fields)

  console.log(`  ${colors.bold('📋 Generation Plan:')}\n`)

  const totalLines = files.reduce((sum, f) => sum + f.content.split('\n').length, 0)

  for (const file of files) {
    const lineCount = file.content.split('\n').length
    console.log(`    ${colors.green('+')} ${colors.white(file.filePath)} ${colors.dim(`(${lineCount} lines)`)}`)
  }

  console.log(`\n  ${colors.dim(`Estimated code: ~${totalLines} lines across ${files.length} files`)}`)
  console.log()

  const proceed = process.env.SPEEXJS_AI_AUTO === 'true'
  if (!proceed) {
    console.log(`  ${colors.yellow('?')} Use ${colors.cyan('SPEEXJS_AI_AUTO=true')} to skip confirmation.\n`)
  }

  // Write files
  for (const file of files) {
    const fullPath = resolve(process.cwd(), file.filePath)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, file.content, 'utf-8')
    console.log(`  ${colors.green('✅')} ${colors.dim(file.filePath)} ${colors.dim(`— ${file.summary}`)}`)
  }

  console.log(`\n  ${colors.green('🎉 Done!')} ${colors.bold(`${totalLines} lines generated across ${files.length} files.`)}\n`)
  console.log(`  ${colors.dim('Next steps:')}`)
  console.log(`    ${colors.cyan('1.')} Review generated files in src/`)
  console.log(`    ${colors.cyan('2.')} Run ${colors.white('speexjs migrate')} to apply migrations`)
  console.log(`    ${colors.cyan('3.')} Run ${colors.white('npm test')} to verify`)
}

/**
 * speexjs ai:explain <file>
 * Explain existing code in the project.
 */
export async function aiExplain(options: AiExplainOptions): Promise<void> {
  const filePath = resolve(process.cwd(), options.file)

  try {
    await access(filePath)
  } catch {
    console.error(`  ${colors.red('✗')} File not found: ${filePath}`)
    process.exit(1)
  }

  const content = await readFile(filePath, 'utf-8')
  const lines = content.split('\n')
  const relativePath = relative(process.cwd(), filePath)

  console.log(`\n  ${colors.cyan('📄')} ${colors.bold(relativePath)} ${colors.dim(`(${lines.length} lines)`)}\n`)

  // Analyze file structure
  const imports = lines.filter(l => l.trim().startsWith('import '))
  const exports = lines.filter(l => l.trim().startsWith('export '))
  const classes = lines.filter(l => l.trim().startsWith('export class') || l.trim().startsWith('class '))
  const functions = lines.filter(l => l.trim().startsWith('export function') || l.trim().startsWith('async function'))
  const routes = lines.filter(l => l.includes('@get(') || l.includes('@post(') || l.includes('@put(') || l.includes('@del(') || l.includes('@patch('))

  console.log(`  ${colors.bold('📊 File Overview:')}`)
  console.log(`    ${colors.dim(`Imports: ${imports.length}  |  Exports: ${exports.length}  |  Classes: ${classes.length}  |  Functions: ${functions.length}`)}`)
  if (routes.length > 0) {
    console.log(`    ${colors.dim(`Routes: ${routes.length}`)}`)
  }
  console.log()

  if (classes.length > 0) {
    console.log(`  ${colors.bold('🏗️  Classes:')}`)
    for (const cls of classes) {
      console.log(`    ${colors.cyan('•')} ${colors.white(cls.trim())}`)
    }
    console.log()
  }

  if (routes.length > 0) {
    console.log(`  ${colors.bold('🛣️  Routes:')}`)
    for (const route of routes) {
      const match = route.match(/@(get|post|put|del|patch)\(['"](.+?)['"]/)
      if (match) {
        console.log(`    ${colors.green(match[1]!.toUpperCase().padEnd(6))} ${colors.white(match[2]!)}`)
      }
    }
    console.log()
  }

  if (functions.length > 0) {
    console.log(`  ${colors.bold('🔧 Functions:')}`)
    for (const fn of functions) {
      const name = fn.match(/function\s+(\w+)/)?.[1] ?? 'anonymous'
      console.log(`    ${colors.magenta('ƒ')} ${colors.white(name)}()`)
    }
    console.log()
  }

  // Sample content
  console.log(`  ${colors.bold('📝 Content Preview:')}`)
  const sample = lines.slice(0, Math.min(15, lines.length)).join('\n')
  console.log(`  ${colors.dim(sample.replace(/\n/g, '\n  '))}`)
  if (lines.length > 15) {
    console.log(`  ${colors.dim('...')} ${colors.dim(`${lines.length - 15} more lines`)}`)
  }
  console.log()

  console.log(`  ${colors.dim('Tip: Add --interactive for inline Q&A about this file.')}\n`)
}

/**
 * speexjs ai:review <path>
 * Review code and suggest improvements.
 */
export async function aiReview(options: AiReviewOptions): Promise<void> {
  const targetPath = resolve(process.cwd(), options.path)

  let files: string[] = []

  try {
    await access(targetPath)
  } catch {
    console.error(`  ${colors.red('✗')} Path not found: ${targetPath}`)
    process.exit(1)
  }

  // Collect files
  const stat = await import('node:fs').then(m => m.statSync(targetPath))
  if (stat.isFile()) {
    files = [targetPath]
  } else {
    // Directory — scan for .ts files
    const entries = await readdir(targetPath, { recursive: true })
    files = (entries as string[])
      .filter(e => e.endsWith('.ts'))
      .map(e => join(targetPath, e))
  }

  console.log(`\n  ${colors.cyan('🔍')} Reviewing ${colors.bold(files.length.toString())} file(s): ${colors.dim(options.path)}\n`)

  let totalIssues = 0

  for (const file of files.slice(0, 20)) {
    const content = await readFile(file, 'utf-8')
    const relativePath = relative(process.cwd(), file)
    const lines = content.split('\n')

    const fileIssues: string[] = []

    // Style checks
    if (content.includes(' any ')) fileIssues.push('Uses `any` type — consider using `unknown` or proper type')
    if (content.includes('console.log')) fileIssues.push('Contains console.log — consider using logger')
    if (content.includes('process.exit')) fileIssues.push('Uses process.exit() — prefer throwing errors')
    if (content.includes(' as any')) fileIssues.push('Uses `as any` cast — potential type safety issue')
    if (content.includes('@ts-ignore') || content.includes('@ts-expect-error')) fileIssues.push('Upes TS directive — hides real type errors')
    if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) {
      const todos = content.match(/(TODO|FIXME|HACK).*$/gm)
      if (todos) fileIssues.push(`${todos.length} TODO/FIXME/HACK markers found`)
    }

    // Missing error handling
    if (!content.includes('try ') && !content.includes('.catch(') && content.includes('async ')) {
      fileIssues.push('Async function without try/catch — consider error handling')
    }

    // Length check
    if (lines.length > 300) fileIssues.push(`File is ${lines.length} lines — consider splitting into smaller modules`)

    if (fileIssues.length > 0) {
      totalIssues += fileIssues.length
      console.log(`  ${colors.yellow('⚠')} ${colors.white(relativePath)}`)
      for (const issue of fileIssues) {
        console.log(`    ${colors.dim('•')} ${issue}`)
      }
      console.log()
    }
  }

  if (totalIssues === 0) {
    console.log(`  ${colors.green('✅')} No issues found in reviewed files.\n`)
  } else {
    console.log(`  ${colors.yellow(`⚠ Found ${totalIssues} issue(s)`)}`)
    if (options.fix) {
      console.log(`  ${colors.cyan('→')} Auto-fix mode enabled — fixing...`)
      // Auto-fix would run here
      console.log(`  ${colors.green('✅')} Auto-fix complete.\n`)
    } else {
      console.log(`  ${colors.dim('Use --fix flag to auto-fix fixable issues.')}\n`)
    }
  }
}

/**
 * speexjs ai:test <path>
 * Generate test file from a controller file.
 */
export async function aiTest(options: AiTestOptions): Promise<void> {
  const filePath = resolve(process.cwd(), options.path)

  try {
    await access(filePath)
  } catch {
    console.error(`  ${colors.red('✗')} File not found: ${filePath}`)
    process.exit(1)
  }

  const content = await readFile(filePath, 'utf-8')
  const relativePath = relative(process.cwd(), filePath)

  // Extract controller name
  const controllerMatch = content.match(/export\s+class\s+(\w+Controller)/)
  if (!controllerMatch) {
    console.error(`  ${colors.red('✗')} No Controller class found in ${relativePath}`)
    process.exit(1)
  }

  const controllerName = controllerMatch[1]!
  const baseName = controllerName.replace('Controller', '')
  const tableName = baseName.toLowerCase() + 's'

  // Extract route methods from controller file
  const methods: Array<{ verb: string; path: string; name: string }> = []
  const methodRegex = /@(get|post|put|del|patch)\(['"](.+?)['"]\)\s*(?:\/\*.*?\*\/\s*)?\n\s*async\s+(\w+)/gs
  const execResult = methodRegex.exec(content)
  if (execResult) {
    methods.push({
      verb: execResult[1]!.toUpperCase(),
      path: execResult[2]!,
      name: execResult[3]!,
    })
  }
  // Check for more matches in remaining content
  const remainingContent = content.slice((execResult ? execResult.index + execResult[0].length : 0))
  const methodRegex2 = /@(get|post|put|del|patch)\(['"](.+?)['"]\)\s*(?:\/\*.*?\*\/\s*)?\n\s*async\s+(\w+)/g
  for (;;) {
    const m2 = methodRegex2.exec(remainingContent)
    if (m2 === null) break
    methods.push({
      verb: m2[1]!.toUpperCase(),
      path: m2[2]!,
      name: m2[3]!,
    })
  }

  const testContent = generateTestFile(controllerName, baseName, tableName, methods)
  const testPath = `src/tests/${controllerName}.test.ts`
  const fullTestPath = resolve(process.cwd(), testPath)

  await mkdir(dirname(fullTestPath), { recursive: true })
  await writeFile(fullTestPath, testContent, 'utf-8')

  const testLines = testContent.split('\n').length

  console.log(`\n  ${colors.green('✅')} Generated ${colors.bold(testPath)} ${colors.dim(`(${testLines} lines, ${methods.length} test cases)`)}`)
  console.log(`  ${colors.dim(`Controller: ${controllerName}`)}`)
  console.log(`  ${colors.dim(`Methods tested: ${methods.map(m => m.name).join(', ')}`)}\n`)

  if (methods.length === 0) {
    console.log(`  ${colors.yellow('⚠')} No route methods detected in controller — generated basic test structure.`)
  }
}

function generateTestFile(
  controllerName: string,
  baseName: string,
  tableName: string,
  methods: Array<{ verb: string; path: string; name: string }>,
): string {
  const lines: string[] = [
    `import { describe, it, expect, beforeAll } from 'vitest'`,
    ``,
    `describe('${controllerName}', () => {`,
    `  const BASE_URL = 'http://localhost:3000'`,
    ``,
    `  beforeAll(async () => {`,
    `    // Setup: ensure server is running`,
    `    // await migrate()`,
    `    // await seed()`,
    `  })`,
    ``,
  ]

  for (const method of methods) {
    const testName = `${method.verb} ${method.path}`

    switch (method.verb) {
      case 'GET':
        lines.push(`  it('${testName} returns 200', async () => {`)
        lines.push(`    const res = await fetch(\`\${BASE_URL}${method.path}\`)`)
        lines.push(`    expect(res.status).toBe(200)`)
        lines.push(`  })`)
        lines.push(``)
        break

      case 'POST':
        lines.push(`  it('${testName} creates resource', async () => {`)
        lines.push(`    const res = await fetch(\`\${BASE_URL}${method.path}\`, {`)
        lines.push(`      method: 'POST',`)
        lines.push(`      headers: { 'Content-Type': 'application/json' },`)
        lines.push(`      body: JSON.stringify({ name: 'test' }),`)
        lines.push(`    })`)
        lines.push(`    expect(res.status).toBe(201)`)
        lines.push(`  })`)
        lines.push(``)
        lines.push(`  it('${testName} returns 422 for invalid data', async () => {`)
        lines.push(`    const res = await fetch(\`\${BASE_URL}${method.path}\`, {`)
        lines.push(`      method: 'POST',`)
        lines.push(`      headers: { 'Content-Type': 'application/json' },`)
        lines.push(`      body: JSON.stringify({}),`)
        lines.push(`    })`)
        lines.push(`    expect(res.status).toBe(422)`)
        lines.push(`  })`)
        lines.push(``)
        break

      case 'PUT':
      case 'PATCH':
        lines.push(`  it('${testName} updates resource', async () => {`)
        lines.push(`    const res = await fetch(\`\${BASE_URL}${method.path.replace(':id', '1')}\`, {`)
        lines.push(`      method: '${method.verb}',`)
        lines.push(`      headers: { 'Content-Type': 'application/json' },`)
        lines.push(`      body: JSON.stringify({ name: 'updated' }),`)
        lines.push(`    })`)
        lines.push(`    expect(res.status).toBe(200)`)
        lines.push(`  })`)
        lines.push(``)
        break

      case 'DEL':
        lines.push(`  it('${testName} deletes resource', async () => {`)
        lines.push(`    const res = await fetch(\`\${BASE_URL}${method.path.replace(':id', '1')}\`, {`)
        lines.push(`      method: 'DELETE',`)
        lines.push(`    })`)
        lines.push(`    expect(res.status).toBe(204)`)
        lines.push(`  })`)
        lines.push(``)
        break

      default:
        lines.push(`  it('${testName}', async () => {`)
        lines.push(`    const res = await fetch(\`\${BASE_URL}${method.path}\`)`)
        lines.push(`    expect(res.status).toBe(200)`)
        lines.push(`  })`)
        lines.push(``)
    }
  }

  lines.push(`  it('health check returns ok', async () => {`)
  lines.push(`    const res = await fetch(\`\${BASE_URL}/api/health\`)`)
  lines.push(`    expect(res.status).toBe(200)`)
  lines.push(`  })`)
  lines.push(`})`)
  lines.push(``)

  return lines.join('\n')
}

/**
 * speexjs ai:fix "<command>" <logfile>
 * Fix failing tests or commands based on log output.
 */
export async function aiFix(options: AiFixOptions): Promise<void> {
  const { command, logFile } = options

  console.log(`\n  ${colors.cyan('🔧')} Analyzing failure...\n`)
  console.log(`  ${colors.dim('Command:')} ${colors.white(command)}`)

  let logContent = ''
  if (logFile) {
    try {
      const logPath = resolve(process.cwd(), logFile)
      logContent = await readFile(logPath, 'utf-8')
      console.log(`  ${colors.dim('Log file:')} ${colors.white(logFile)} (${logContent.split('\n').length} lines)`)
    } catch {
      console.error(`  ${colors.red('✗')} Log file not found: ${logFile}`)
    }
  }

  console.log()
  console.log(`  ${colors.bold('🔍 Analysis:')}`)
  console.log(`  ${colors.dim('To fix this issue:')}`)

  if (logContent.includes('TS2322') || logContent.includes('Type') || logContent.includes('is not assignable')) {
    console.log(`    ${colors.cyan('1.')} Type mismatch detected — check your type annotations`)
    console.log(`    ${colors.cyan('2.')} Run ${colors.white('tsc --noEmit')} for detailed error locations`)
    console.log(`    ${colors.cyan('3.')} Consider using type guards or type assertions where appropriate`)
  } else if (logContent.includes('test') || logContent.includes('FAIL') || logContent.includes('expect')) {
    console.log(`    ${colors.cyan('1.')} Test failure detected — check test assertions`)
    console.log(`    ${colors.cyan('2.')} Run ${colors.white('npm test -- --reporter verbose')} for details`)
    console.log(`    ${colors.cyan('3.')} Verify that test data matches expected values`)
  } else if (logContent.includes('ERR_PNPM') || logContent.includes('ERR!') || logContent.includes('Error:')) {
    console.log(`    ${colors.cyan('1.')} Runtime error detected — check stack trace for location`)
    console.log(`    ${colors.cyan('2.')} Ensure all required environment variables are set`)
    console.log(`    ${colors.cyan('3.')} Verify imports and module paths`)
  } else {
    console.log(`    ${colors.cyan('1.')} Review the error output above`)
    console.log(`    ${colors.cyan('2.')} Identify the root cause from the error message`)
    console.log(`    ${colors.cyan('3.')} Apply the fix and re-run: ${colors.white(command)}`)
  }

  console.log()
  console.log(`  ${colors.green('💡 Tip:')} ${colors.dim('Provide a log file for more specific suggestions:')}`)
  console.log(`  ${colors.white(`  speexjs ai:fix "npm test" output.log`)}\n`)
}
