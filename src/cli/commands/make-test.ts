import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colors } from '../../native/colors.js'

interface ControllerMethod {
  httpMethod: string
  route: string
  methodName: string
}

function toPascalCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c: string) => (c ?? '').toUpperCase()).replace(/^(.)/, (c: string) => c.toUpperCase())
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase()
}

function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c: string) => (c ?? '').toUpperCase()).replace(/^(.)/, (c: string) => c.toLowerCase())
}

function parseControllerFile(controllerName: string): ControllerMethod[] {
  const kebab = toKebabCase(controllerName)
  const controllerPath = resolve(process.cwd(), 'src/server/controllers', `${kebab}.controller.ts`)

  if (!existsSync(controllerPath)) {
    return []
  }

  const content = readFileSync(controllerPath, 'utf-8')
  const methods: ControllerMethod[] = []
  const decoratorRegex = /@(get|post|put|del)\('([^']*)'\)\s*\n\s*async\s+(\w+)/g
  let match: RegExpExecArray | null
  while ((match = decoratorRegex.exec(content)) !== null) {
    methods.push({
      httpMethod: match[1]!,
      route: match[2]!,
      methodName: match[3]!,
    })
  }

  return methods
}

function generateTestCases(controllerName: string, methods: ControllerMethod[]): string {
  const className = toPascalCase(controllerName)
  const kebab = toKebabCase(controllerName)

  const defaultMethods: ControllerMethod[] = [
    { httpMethod: 'get', route: `/${kebab}`, methodName: 'index' },
    { httpMethod: 'get', route: `/${kebab}/:id`, methodName: 'show' },
    { httpMethod: 'post', route: `/${kebab}`, methodName: 'store' },
    { httpMethod: 'put', route: `/${kebab}/:id`, methodName: 'update' },
    { httpMethod: 'del', route: `/${kebab}/:id`, methodName: 'destroy' },
  ]

  const discovered = methods.length > 0 ? methods : defaultMethods

  const testBlocks = discovered
    .map((m) => {
      const upperMethod = m.httpMethod.toUpperCase()
      const resolvedRoute = m.route.includes(':id') ? m.route.replace(':id', '1') : m.route
      const nonExistentRoute = m.route.includes(':id') ? m.route.replace(':id', '99999') : m.route

      const tests: string[] = []

      if (m.methodName === 'index') {
        tests.push(`
    it('returns paginated response', async () => {
      const res = await testRequest(app).get('${resolvedRoute}')
      expect(res.status).toBe(200)
      const body = res.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })`)
      } else if (m.methodName === 'show') {
        tests.push(`
    it('returns a single item', async () => {
      const res = await testRequest(app).get('${resolvedRoute}')
      expect(res.status).toBe(200)
      const body = res.json()
      expect(body).toHaveProperty('data')
    })
    it('returns 404 for non-existent item', async () => {
      const res = await testRequest(app).get('${nonExistentRoute}')
      expect(res.status).toBe(404)
    })`)
      } else if (m.methodName === 'store') {
        tests.push(`
    it('validates required input', async () => {
      const res = await actingAs(app).post('${resolvedRoute}').send({})
      expect(res.status).toBe(422)
    })
    it('creates a new record', async () => {
      const res = await actingAs(app).post('${resolvedRoute}').send({ name: 'Test ${className}' })
      expect(res.status).toBe(201)
      const body = res.json()
      expect(body.data).toHaveProperty('id')
    })`)
      } else if (m.methodName === 'update') {
        tests.push(`
    it('validates update input', async () => {
      const res = await actingAs(app).put('${resolvedRoute}').send({ name: '' })
      expect(res.status).toBe(422)
    })
    it('updates an existing record', async () => {
      const res = await actingAs(app).put('${resolvedRoute}').send({ name: 'Updated' })
      expect(res.status).toBe(200)
    })`)
      } else if (m.methodName === 'destroy') {
        tests.push(`
    it('deletes a record', async () => {
      const res = await actingAs(app).delete('${resolvedRoute}')
      expect(res.status).toBe(200)
    })
    it('returns 404 for non-existent record', async () => {
      const res = await actingAs(app).delete('${nonExistentRoute}')
      expect(res.status).toBe(404)
    })`)
      } else {
        tests.push(`
    it('responds successfully', async () => {
      const verb = ${m.httpMethod === 'del' ? "'delete'" : `'${m.httpMethod}'`}
      const res = await testRequest(app)[verb]('${resolvedRoute}')
      expect(res.status).toBeGreaterThanOrEqual(200)
      expect(res.status).toBeLessThan(500)
    })`)
      }

      return `  describe('${upperMethod} ${m.route}', () => {${tests.join('\n')}
  })`
    })
    .join('\n\n')

  return `import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { createTestApp, testRequest, refreshDatabase, actingAs } from 'speexjs/server/testing/bootstrap'
import { createSqliteMemory } from 'speexjs/server/testing/database'

let app: ReturnType<typeof createTestApp>

beforeAll(async () => {
  app = createTestApp({ database: await createSqliteMemory() })
  await app.listen(0)
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await refreshDatabase()
})

describe('${className}', () => {

${testBlocks}

})
`
}

export function makeTest(name: string): void {
  const cleanName = name.endsWith('Controller') ? name.slice(0, -10) : name
  const className = toPascalCase(cleanName)
  const fileName = `${toKebabCase(cleanName)}.test.ts`
  const targetDir = resolve(process.cwd(), 'tests')
  const fullPath = resolve(targetDir, fileName)

  if (existsSync(fullPath)) {
    console.error(colors.red(`File ${fileName} already exists!`))
    process.exit(1)
  }

  mkdirSync(targetDir, { recursive: true })

  const methods = parseControllerFile(cleanName)

  if (methods.length > 0) {
    console.log(`  ${colors.cyan('→')} Discovered ${methods.length} methods in ${className}Controller`)
  } else {
    console.log(`  ${colors.cyan('→')} Generating default CRUD tests for ${className}`)
  }

  const content = generateTestCases(cleanName, methods)

  writeFileSync(fullPath, content, 'utf-8')
  console.log(`  ${colors.green('✅')} Test ${colors.bold(fileName)} created`)
  console.log(`  ${colors.dim('   Run: bun test tests/' + fileName)}`)
}
