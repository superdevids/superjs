import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colors } from '../../native/colors.js'
import { makeController } from './make-controller.js'
import { makeModel } from './make-model.js'
import { makeMigration } from './make-migration.js'

function toPascalCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c: string) => (c ?? '').toUpperCase()).replace(/^(.)/, (c: string) => c.toUpperCase())
}

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase()
}

function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c: string) => (c ?? '').toUpperCase()).replace(/^(.)/, (c: string) => c.toLowerCase())
}

function toPlural(str: string): string {
  if (str.endsWith('s')) return str
  if (str.endsWith('y')) return str.slice(0, -1) + 'ies'
  if (str.endsWith('ch') || str.endsWith('sh') || str.endsWith('x') || str.endsWith('z')) return str + 'es'
  return str + 's'
}

interface SchemaField {
  name: string
  baseType: string
  modifiers: string[]
  optional: boolean
  chainCall: string
}

function parseSchemaFile(schemaName: string): SchemaField[] {
  const modelName = schemaName.endsWith('Schema') ? schemaName.slice(0, -6) : schemaName
  const fileName = toKebabCase(modelName)
  const schemaPath = resolve(process.cwd(), 'src/schemas', `${fileName}.schema.ts`)

  if (!existsSync(schemaPath)) {
    console.error(colors.red(`Schema file not found: ${schemaPath}`))
    console.log(`  ${colors.cyan('Expected schema file:')} src/schemas/${fileName}.schema.ts`)
    process.exit(1)
  }

  const content = readFileSync(schemaPath, 'utf-8')
  const lines = content.split('\n')

  const schemaVarName = `${toPascalCase(modelName)}Schema`
  let inSchema = false
  let braceDepth = 0
  const fields: SchemaField[] = []

  const fieldRegex = /^\s+(\w+):\s*(.*?)(,)?\s*$/

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.includes(`export const ${schemaVarName} = schema.object({`)) {
      inSchema = true
      braceDepth = 1
      continue
    }

    if (inSchema) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++
        if (ch === '}') braceDepth--
      }

      if (braceDepth <= 0) break

      if (trimmed === '' || trimmed.startsWith('//')) continue

      const match = trimmed.match(fieldRegex)
      if (!match) continue

      const name = match[1]!
      const valuePart = match[2]!

      const schemaMatch = valuePart.match(/schema\.(\w+)/)
      if (!schemaMatch) continue

      const baseType = schemaMatch[1]!
      const modifiers: string[] = []
      const methodRegex = /\.(\w+)(\([^)]*\))?/g
      let m
      while ((m = methodRegex.exec(valuePart)) !== null) {
        modifiers.push(m[1]!)
      }

      const optional = modifiers.includes('optional') || valuePart.includes('.optional()')
      const chainCall = valuePart

      fields.push({ name, baseType, modifiers, optional, chainCall })
    }
  }

  return fields
}

function mapSchemaTypeToMigration(field: SchemaField): { colType: string; extras: string } {
  if (field.baseType === 'string') {
    if (field.modifiers.some((m) => m === 'datetime' || m === 'date')) return { colType: 'timestamp', extras: '' }
    if (field.modifiers.includes('text')) return { colType: 'text', extras: '' }
    return { colType: 'string', extras: '' }
  }
  if (field.baseType === 'number') {
    if (field.modifiers.includes('int')) return { colType: 'integer', extras: '' }
    return { colType: 'float', extras: '' }
  }
  if (field.baseType === 'boolean') return { colType: 'boolean', extras: '' }
  return { colType: 'string', extras: '' }
}

function schemaTypeToTs(field: SchemaField): string {
  if (field.baseType === 'string') return 'string'
  if (field.baseType === 'number') return 'number'
  if (field.baseType === 'boolean') return 'boolean'
  return 'string'
}

function generateMigration(name: string, fields: SchemaField[]): string {
  const tableName = toPlural(toSnakeCase(name))
  const lines: string[] = []
  lines.push(`import { SchemaBuilder } from 'speexjs/server/database'`)
  lines.push('')
  lines.push(`export async function up(schema: SchemaBuilder): Promise<void> {`)
  lines.push(`  schema.createTable('${tableName}', (table) => {`)
  lines.push(`    table.increments('id')`)
  for (const field of fields) {
    if (field.name === 'id') continue
    const { colType, extras } = mapSchemaTypeToMigration(field)
    const nullable = field.optional || field.name === 'updatedAt' || field.name === 'createdAt' ? '.nullable()' : '.notNullable()'
    lines.push(`    table.${colType}('${field.name}')${nullable}${extras}`)
  }
  lines.push(`    table.timestamps()`)
  lines.push(`  })`)
  lines.push(`}`)
  lines.push('')
  lines.push(`export async function down(schema: SchemaBuilder): Promise<void> {`)
  lines.push(`  schema.dropTable('${tableName}')`)
  lines.push(`}`)
  lines.push('')
  return lines.join('\n')
}

function generateModel(name: string, fields: SchemaField[]): string {
  const className = toPascalCase(name)
  const tableName = toPlural(toSnakeCase(name))
  const lines: string[] = []
  const fieldLines = fields.filter((f) => f.name !== 'id' && f.name !== 'createdAt' && f.name !== 'updatedAt')

  lines.push(`import { Model } from 'speexjs/server/database'`)
  lines.push('')
  lines.push(`export interface ${className}Fields {`)
  lines.push(`  id: number`)
  for (const f of fieldLines) {
    lines.push(`  ${f.name}${f.optional || f.name === 'updatedAt' ? '?' : ''}: ${schemaTypeToTs(f)}`)
  }
  lines.push(`  createdAt: Date`)
  lines.push(`  updatedAt: Date`)
  lines.push(`}`)
  lines.push('')
  lines.push(`export class ${className} extends Model {`)
  lines.push(`  static table = '${tableName}'`)
  lines.push('')
  lines.push(`  id!: number`)
  for (const f of fieldLines) {
    lines.push(`  ${f.name}!: ${schemaTypeToTs(f)}`)
  }
  lines.push(`  createdAt!: Date`)
  lines.push(`  updatedAt!: Date`)
  lines.push('')
  lines.push(`  static scopes = {`)
  lines.push(`    recent: (query: any) => query.orderBy('createdAt', 'desc').limit(10),`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push('')
  return lines.join('\n')
}

function generateController(name: string, fields: SchemaField[]): string {
  const className = `${toPascalCase(name)}Controller`
  const modelName = toPascalCase(name)
  const varName = toCamelCase(name)
  const kebab = toKebabCase(name)
  const plural = toKebabCase(toPlural(name))
  const fieldLines = fields.filter((f) => f.name !== 'id' && f.name !== 'createdAt' && f.name !== 'updatedAt')

  const lines: string[] = []
  lines.push(`import { Controller, get, post, put, del } from 'speexjs/server'`)
  lines.push(`import type { RouteContext } from 'speexjs/server/router'`)
  lines.push(`import { ${modelName} } from '#models/${kebab}.model'`)
  lines.push(`import { schema } from 'speexjs/schema'`)
  lines.push('')
  lines.push(`const create${modelName}Schema = schema.object({`)
  for (const f of fieldLines) {
    if (f.optional) {
      lines.push(`  ${f.name}: schema.${f.baseType}().optional(),`)
    } else {
      lines.push(`  ${f.name}: schema.${f.baseType}(),`)
    }
  }
  lines.push(`})`)
  lines.push('')
  lines.push(`const update${modelName}Schema = schema.object({`)
  for (const f of fieldLines) {
    lines.push(`  ${f.name}: schema.${f.baseType}().optional(),`)
  }
  lines.push(`})`)
  lines.push('')
  lines.push(`export class ${className} extends Controller {`)
  lines.push(`  @get('/${plural}')`)
  lines.push(`  async index({ response }: RouteContext) {`)
  lines.push(`    const ${varName}s = await ${modelName}.query().orderBy('createdAt', 'desc')`)
  lines.push(`    return response.json({ data: ${varName}s })`)
  lines.push(`  }`)
  lines.push('')
  lines.push(`  @get('/${plural}/:id')`)
  lines.push(`  async show({ response, params }: RouteContext) {`)
  lines.push(`    const ${varName} = await ${modelName}.query().where('id', Number(params.id)).first()`)
  lines.push(`    if (!${varName}) {`)
  lines.push(`      return response.status(404).json({ message: '${modelName} not found' })`)
  lines.push(`    }`)
  lines.push(`    return response.json({ data: ${varName} })`)
  lines.push(`  }`)
  lines.push('')
  lines.push(`  @post('/${plural}')`)
  lines.push(`  async store({ request, response }: RouteContext) {`)
  lines.push(`    const body = await request.body()`)
  lines.push(`    const parsed = create${modelName}Schema.safeParse(body)`)
  lines.push(`    if (!parsed.success) {`)
  lines.push(`      return response.status(422).json({ errors: parsed.error })`)
  lines.push(`    }`)
  lines.push(`    const ${varName} = await ${modelName}.query().insert(parsed.data)`)
  lines.push(`    return response.status(201).json({ data: ${varName} })`)
  lines.push(`  }`)
  lines.push('')
  lines.push(`  @put('/${plural}/:id')`)
  lines.push(`  async update({ request, response, params }: RouteContext) {`)
  lines.push(`    const body = await request.body()`)
  lines.push(`    const parsed = update${modelName}Schema.safeParse(body)`)
  lines.push(`    if (!parsed.success) {`)
  lines.push(`      return response.status(422).json({ errors: parsed.error })`)
  lines.push(`    }`)
  lines.push(`    const ${varName} = await ${modelName}.query().where('id', Number(params.id)).update(parsed.data)`)
  lines.push(`    if (!${varName}) {`)
  lines.push(`      return response.status(404).json({ message: '${modelName} not found' })`)
  lines.push(`    }`)
  lines.push(`    return response.json({ data: ${varName} })`)
  lines.push(`  }`)
  lines.push('')
  lines.push(`  @del('/${plural}/:id')`)
  lines.push(`  async destroy({ response, params }: RouteContext) {`)
  lines.push(`    const deleted = await ${modelName}.query().where('id', Number(params.id)).delete()`)
  lines.push(`    if (!deleted) {`)
  lines.push(`      return response.status(404).json({ message: '${modelName} not found' })`)
  lines.push(`    }`)
  lines.push(`    return response.json({ message: '${modelName} deleted successfully' })`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push('')
  lines.push(`export const ${varName}Controller = ${className}`)
  lines.push('')
  return lines.join('\n')
}

function generateRoutes(name: string): string {
  const className = `${toPascalCase(name)}Controller`
  const path = toKebabCase(toPlural(name))

  const lines: string[] = []
  lines.push(`import { Router } from 'speexjs/server/router'`)
  lines.push(`import { ${className} } from '#controllers/${toKebabCase(name)}.controller'`)
  lines.push('')
  lines.push(`const router = new Router()`)
  lines.push('')
  lines.push(`router.get('/${path}', ${className}, 'index')`)
  lines.push(`router.get('/${path}/:id', ${className}, 'show')`)
  lines.push(`router.post('/${path}', ${className}, 'store')`)
  lines.push(`router.put('/${path}/:id', ${className}, 'update')`)
  lines.push(`router.delete('/${path}/:id', ${className}, 'destroy')`)
  lines.push('')
  lines.push(`export default router`)
  lines.push('')
  return lines.join('\n')
}

function generateTest(name: string): string {
  const className = toPascalCase(name)
  const varName = toCamelCase(name)
  const kebab = toKebabCase(name)
  const plural = toKebabCase(toPlural(name))

  return `import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { createTestApp, testRequest, refreshDatabase, actingAs } from 'speexjs/server/testing/bootstrap'
import { createSqliteMemory } from 'speexjs/server/testing/database'

let app: ReturnType<typeof createTestApp>
let auth: ReturnType<typeof actingAs>

beforeAll(async () => {
  app = createTestApp({ database: await createSqliteMemory() })
  auth = actingAs({ id: 1, role: 'admin' })
  await app.listen(0)
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await refreshDatabase()
})

describe('${className} API', () => {
  describe('GET /${plural}', () => {
    it('returns paginated list of ${varName}s', async () => {
      const res = await testRequest(app).get('/${plural}')
      expect(res.status).toBe(200)
      const body = res.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })
  })

  describe('GET /${plural}/:id', () => {
    it('returns a single ${varName}', async () => {
      const res = await testRequest(app).get('/${plural}/1')
      expect(res.status).toBe(200)
      const body = res.json()
      expect(body).toHaveProperty('data')
    })

    it('returns 404 for non-existent ${varName}', async () => {
      const res = await testRequest(app).get('/${plural}/99999')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /${plural}', () => {
    it('validates required fields', async () => {
      const res = await auth.post('/${plural}').send({})
      expect(res.status).toBe(422)
    })

    it('creates a new ${varName}', async () => {
      const res = await auth.post('/${plural}').send({ name: 'Test ${className}' })
      expect(res.status).toBe(201)
      const body = res.json()
      expect(body.data).toHaveProperty('id')
    })
  })

  describe('PUT /${plural}/:id', () => {
    it('validates update payload', async () => {
      const res = await auth.put('/${plural}/1').send({ name: '' })
      expect(res.status).toBe(422)
    })

    it('updates an existing ${varName}', async () => {
      const res = await auth.put('/${plural}/1').send({ name: 'Updated ${className}' })
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /${plural}/:id', () => {
    it('deletes an existing ${varName}', async () => {
      const res = await auth.delete('/${plural}/1')
      expect(res.status).toBe(200)
    })

    it('returns 404 for non-existent ${varName}', async () => {
      const res = await auth.delete('/${plural}/99999')
      expect(res.status).toBe(404)
    })
  })
})
`
}

export async function makeResource(name: string, schemaName?: string): Promise<void> {
  if (!schemaName) {
    console.log(`  ${colors.cyan('→')} Generating resource: ${name}...`)
    makeController(name)
    makeModel(name)
    makeMigration(`create_${toSnakeCase(name)}_table`)
    console.log(`  ${colors.green('✓')} Resource ${name} created: controller + model + migration`)
    return
  }

  console.log(`  ${colors.cyan('→')} Generating resource from schema: ${schemaName}...`)
  const fields = parseSchemaFile(schemaName)
  console.log(`  ${colors.cyan('→')} Found ${fields.length} fields in schema`)

  const cwd = process.cwd()
  const kebab = toKebabCase(name)
  const modelName = toPascalCase(name)
  const tableName = toPlural(toSnakeCase(name))

  const migrationsDir = resolve(cwd, 'src/database/migrations')
  const modelsDir = resolve(cwd, 'src/models')
  const controllersDir = resolve(cwd, 'src/server/controllers')
  const routesDir = resolve(cwd, 'src/routes')
  const testsDir = resolve(cwd, 'tests')

  const files: Array<{ path: string; content: string; label: string }> = [
    {
      path: resolve(migrationsDir, `${Date.now()}_create_${tableName}_table.ts`),
      content: generateMigration(name, fields),
      label: `Migration: create_${tableName}_table`,
    },
    {
      path: resolve(modelsDir, `${kebab}.model.ts`),
      content: generateModel(name, fields),
      label: `Model: ${modelName}`,
    },
    {
      path: resolve(controllersDir, `${kebab}.controller.ts`),
      content: generateController(name, fields),
      label: `Controller: ${modelName}Controller`,
    },
    {
      path: resolve(routesDir, `${kebab}.ts`),
      content: generateRoutes(name),
      label: `Routes: ${kebab}`,
    },
    {
      path: resolve(testsDir, `${kebab}.test.ts`),
      content: generateTest(name),
      label: `Test: ${kebab}.test.ts`,
    },
  ]

  for (const file of files) {
    mkdirSync(resolve(file.path, '..'), { recursive: true })
    if (existsSync(file.path)) {
      console.log(`  ${colors.yellow('⚠')} Skipped (exists): ${file.label}`)
      continue
    }
    writeFileSync(file.path, file.content, 'utf-8')
    console.log(`  ${colors.green('✓')} Created: ${file.label}`)
  }

  console.log()
  console.log(`  ${colors.green('✅')} Resource ${modelName} generated from ${schemaName} schema!`)
  console.log(`  ${colors.cyan('→')} Register routes: import '${kebab}' from '#routes/${kebab}'`)
  console.log(`  ${colors.cyan('→')} Run migrations: speexjs migrate`)
  console.log()
}
