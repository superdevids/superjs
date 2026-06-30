#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { execSync } from 'node:child_process'

const RESET = '\x1b[0m'
const c = (code: string) => (s: string) => `${code}${s}${RESET}`
const colors = {
  red: c('\x1b[31m'),
  green: c('\x1b[32m'),
  yellow: c('\x1b[33m'),
  blue: c('\x1b[34m'),
  magenta: c('\x1b[35m'),
  cyan: c('\x1b[36m'),
  gray: c('\x1b[90m'),
  white: c('\x1b[37m'),
  bold: c('\x1b[1m'),
  dim: c('\x1b[2m'),
}

const TEMPLATES = ['blank', 'fullstack', 'api-only', 'saas', 'realtime', 'blog', 'minimal', 'ecommerce'] as const
type Template = typeof TEMPLATES[number]
const FEATURES = ['Auth', 'Database', 'Queue', 'WebSocket', 'Email', 'Cache', 'Admin', 'AI'] as const
type Feature = typeof FEATURES[number]
const DB_DIALECTS = ['mysql', 'postgresql', 'sqlite'] as const
type DbDialect = typeof DB_DIALECTS[number]
const DEPLOY_TARGETS = ['node', 'docker', 'vercel', 'railway', 'fly.io'] as const
type DeployTarget = typeof DEPLOY_TARGETS[number]

const TEMPLATE_DESCRIPTIONS: Record<Template, string> = {
  blank: 'Minimal API with in-memory CRUD',
  fullstack: 'Full stack with server + client VDOM',
  'api-only': 'Lean API-only scaffold',
  saas: 'SaaS with teams, billing, roles, and subscriptions',
  realtime: 'Realtime app with WebSocket and SSE',
  blog: 'Blog with posts, categories, comments, and tags',
  minimal: 'Single-file entry point, zero boilerplate',
  ecommerce: 'Ecommerce with products, cart, checkout, and orders',
}

function toPascalCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => (c ?? '').toUpperCase()).replace(/^(.)/, c => c.toUpperCase())
}

function isTTY(): boolean {
  return process.stdout.isTTY && process.stdin.isTTY
}

function ask(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function askConfirm(query: string, defaultVal = true): Promise<boolean> {
  const hint = defaultVal ? 'Y/n' : 'y/N'
  return ask(`  ${colors.yellow('?')} ${query} ${colors.dim(`(${hint})`)} `).then(a => {
    if (!a) return defaultVal
    return a.toLowerCase() === 'y' || a.toLowerCase() === 'yes'
  })
}

function select<T extends string>(prompt: string, options: readonly T[], defaultVal?: T): Promise<T> {
  console.log(`\n  ${colors.bold(prompt)}`)
  options.forEach((opt, i) => {
    const marker = opt === defaultVal ? colors.green('❯') : ' '
    const label = opt === defaultVal ? colors.cyan(opt) : colors.dim(opt)
    console.log(`  ${marker} ${label}`)
  })
  console.log()
  return ask(`  ${colors.yellow('→')} Choose ${colors.dim(`[${defaultVal ?? options[0]}]`)}: `)
    .then(a => a || defaultVal || options[0])
    .then(a => {
      const match = options.find(o => o.toLowerCase() === a.toLowerCase())
      return match ?? defaultVal ?? options[0]
    })
}

function parseArgs(): {
  name: string
  template?: string
  features?: string[]
  db?: string
  deploy?: string
  help?: boolean
} {
  const args = process.argv.slice(2)
  const result: ReturnType<typeof parseArgs> = { name: '', help: false }
  const flags: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg.startsWith('--template=')) {
      result.template = arg.split('=')[1]
    } else if (arg === '--template' && args[i + 1] && !args[i + 1].startsWith('--')) {
      result.template = args[++i]
    } else if (arg.startsWith('--features=')) {
      result.features = arg.split('=')[1].split(',').map(f => f.trim()).filter(Boolean)
    } else if (arg === '--features' && args[i + 1] && !args[i + 1].startsWith('--')) {
      result.features = args[++i].split(',').map(f => f.trim()).filter(Boolean)
    } else if (arg.startsWith('--db=')) {
      result.db = arg.split('=')[1]
    } else if (arg === '--db' && args[i + 1] && !args[i + 1].startsWith('--')) {
      result.db = args[++i]
    } else if (arg.startsWith('--deploy=')) {
      result.deploy = arg.split('=')[1]
    } else if (arg === '--deploy' && args[i + 1] && !args[i + 1].startsWith('--')) {
      result.deploy = args[++i]
    } else if (!arg.startsWith('--')) {
      if (!result.name) result.name = arg
      else flags.push(arg)
    }
  }
  return result
}

function showHelp(): void {
  console.log(`\n  ${colors.bold('@speex/create')} ${colors.cyan('v2.1.0')}`)
  console.log(`  ${colors.dim('Create a new SpeexJS project with zero configuration')}`)
  console.log()
  console.log(`  ${colors.bold('Usage:')}`)
  console.log(`    npx ${colors.cyan('@speex/create')} ${colors.dim('[project-name]')}`)
  console.log(`    npx ${colors.cyan('create-speexjs')} ${colors.dim('[project-name]')}`)
  console.log()
  console.log(`  ${colors.bold('Options:')}`)
  console.log(`    --template <name>     ${colors.dim('Project template (blank, fullstack, api-only, saas, realtime, blog, minimal, ecommerce)')}`)
  console.log(`    --features <list>     ${colors.dim('Comma-separated features (Auth,Database,Queue,WebSocket,Email,Cache,Admin,AI)')}`)
  console.log(`    --db <dialect>        ${colors.dim('Database dialect (mysql, postgresql, sqlite)')}`)
  console.log(`    --deploy <target>     ${colors.dim('Deployment target (node, docker, vercel, railway, fly.io)')}`)
  console.log(`    --help, -h            ${colors.dim('Show this help message')}`)
  console.log()
  console.log(`  ${colors.bold('Examples:')}`)
  console.log(`    npx @speex/create my-app`)
  console.log(`    npx @speex/create my-app --template saas --features Auth,Database,Email`)
  console.log(`    npx @speex/create my-app --template api-only --db postgresql --deploy railway`)
  console.log()
}

// ---------------------------------------------------------------------------
// File generation helpers
// ---------------------------------------------------------------------------

function generatePackageJson(name: string, template: Template, features: Feature[], dbDialect: DbDialect): string {
  const scripts: Record<string, string> = {
    dev: 'speexjs serve',
    build: 'speexjs build',
    start: 'node dist/index.js',
    lint: 'tsc --noEmit',
  }

  if (features.includes('Database')) {
    scripts['migrate'] = 'speexjs migrate'
    scripts['db:seed'] = 'speexjs db:seed'
  }

  return JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts,
    dependencies: { speexjs: 'latest' },
    devDependencies: { '@types/node': '^26.0.1', tsx: '^4.19.0', typescript: '^5.7.0' },
  }, null, 2)
}

function generateTsconfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      declaration: true,
      sourceMap: true,
      esModuleInterop: true,
      isolatedModules: true,
      resolveJsonModule: true,
      outDir: './dist',
      rootDir: './src',
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'dist'],
  }, null, 2)
}

function generateSpeexjsConfig(template: Template, features: Feature[], dbDialect: DbDialect, deploy: DeployTarget): string {
  const featureFlags = features.map(f => {
    const key = f.charAt(0).toLowerCase() + f.slice(1)
    return `    ${key}: true`
  }).join(',\n')

  const dbConfig = features.includes('Database')
    ? `\n  database: {\n    dialect: '${dbDialect}',\n    url: process.env.DATABASE_URL ?? '${dbDialect === 'sqlite' ? './data/db.sqlite' : `${dbDialect}://localhost:5432/${name}`}',\n  },`
    : ''

  const emailConfig = features.includes('Email')
    ? `\n  mail: {\n    driver: process.env.MAIL_DRIVER ?? 'smtp',\n    from: process.env.MAIL_FROM ?? 'noreply@example.com',\n  },`
    : ''

  const cacheConfig = features.includes('Cache')
    ? `\n  cache: {\n    driver: process.env.CACHE_DRIVER ?? 'memory',\n    prefix: '${name}:',\n  },`
    : ''

  const wsConfig = features.includes('WebSocket')
    ? `\n  websocket: {\n    path: '/ws',\n    maxConnections: 1000,\n  },`
    : ''

  const queueConfig = features.includes('Queue')
    ? `\n  queue: {\n    driver: process.env.QUEUE_DRIVER ?? 'sync',\n    concurrency: 3,\n  },`
    : ''

  return `import { defineConfig } from 'speexjs/config'

export default defineConfig({
  name: '${name}',
  port: Number(process.env.PORT ?? 3000),
  env: process.env.NODE_ENV ?? 'development',
  template: '${template}',
  deploy: '${deploy}',${dbConfig}${emailConfig}${cacheConfig}${wsConfig}${queueConfig}
  features: {
${featureFlags},
  },
})
`
}

function generateEnvExample(name: string, template: Template, features: Feature[], dbDialect: DbDialect): string {
  const lines: string[] = [
    '# Server',
    'PORT=3000',
    'NODE_ENV=development',
    'HOST=localhost',
    '',
    '# Auth (change in production!)',
    'APP_KEY=your-base64-32-byte-key-here',
    'SESSION_SECRET=change-this-in-production',
  ]

  if (features.includes('Database')) {
    const defaultUrl = dbDialect === 'sqlite' ? `./data/${name}.sqlite` : `${dbDialect}://localhost:5432/${name}`
    lines.push('', '# Database', `DATABASE_URL=${defaultUrl}`)
  }

  if (features.includes('Email')) {
    lines.push('', '# Mail', 'MAIL_DRIVER=smtp', 'MAIL_FROM=noreply@example.com', 'SMTP_HOST=smtp.example.com', 'SMTP_PORT=587', 'SMTP_USER=', 'SMTP_PASS=')
  }

  if (features.includes('Cache')) {
    lines.push('', '# Cache', 'CACHE_DRIVER=memory', 'REDIS_URL=redis://localhost:6379')
  }

  if (features.includes('Queue')) {
    lines.push('', '# Queue', 'QUEUE_DRIVER=sync')
  }

  return lines.join('\n') + '\n'
}

function generateEnv(name: string, features: Feature[], dbDialect: DbDialect): string {
  const lines: string[] = [
    'PORT=3000',
    'NODE_ENV=development',
    'HOST=localhost',
    'APP_KEY=dev-app-key-change-in-production',
    'SESSION_SECRET=dev-secret-change-in-production',
  ]

  if (features.includes('Database')) {
    const defaultUrl = dbDialect === 'sqlite' ? `./data/${name}.sqlite` : `${dbDialect}://localhost:5432/${name}`
    lines.push(`DATABASE_URL=${defaultUrl}`)
  }

  return lines.join('\n') + '\n'
}

const GITIGNORE = `node_modules/
dist/
.env
*.log
`

function generateBootstrap(template: Template, features: Feature[]): string {
  const imports: string[] = ["import { speexjs } from 'speexjs/server'"]
  const middleware: string[] = []
  const appBody: string[] = []

  if (features.includes('Auth')) {
    imports.push("import { sessionGuard } from 'speexjs/server/auth'")
    middleware.push('app.use(sessionGuard())')
  }

  if (features.includes('Database')) {
    imports.push("import { useDatabase } from 'speexjs/server/database'")
    appBody.push("await useDatabase()")
  }

  if (features.includes('Admin')) {
    imports.push("import { adminPanel } from 'speexjs/server/admin'")
  }

  const controllerImport = template === 'api-only'
    ? "import { HealthController } from './controllers/HomeController.js'"
    : "import { HomeController } from './controllers/HomeController.js'"

  imports.push(controllerImport)

  let lines = imports.join('\n') + '\n\n'
  lines += `const app = speexjs()\n`
  lines += `const PORT = Number(process.env.PORT) || 3000\n\n`

  if (middleware.length) {
    lines += middleware.join('\n') + '\n\n'
  }

  if (appBody.length) {
    lines += appBody.join('\n') + '\n\n'
  }

  if (features.includes('Admin')) {
    lines += `app.use(adminPanel({ prefix: '/admin' }))\n\n`
  }

  const controllerName = template === 'api-only' ? 'HealthController' : 'HomeController'
  lines += `app.controller(${controllerName})\n\n`

  if (features.includes('WebSocket')) {
    lines += `import { websocket } from 'speexjs/server/websocket'\n`
    lines += `app.use(websocket({ path: '/ws' }))\n\n`
  }

  lines += `export { app }\n`
  return lines
}

function generateRoutes(template: Template, features: Feature[]): string {
  const lines: string[] = []

  if (template === 'fullstack') {
    lines.push(`import type { RouteContext } from 'speexjs/server/router'`)
    lines.push(``)
    lines.push(`export function registerRoutes(app: any): void {`)
    lines.push(`  app.get('/', async ({ response }: RouteContext) => {`)
    lines.push(`    return response.html(\``)
    lines.push(`      <!DOCTYPE html>`)
    lines.push(`      <html lang="en">`)
    lines.push(`      <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>SpeexJS</title></head>`)
    lines.push(`      <body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh">`)
    lines.push(`        <div style="text-align:center"><h1 style="background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent">SpeexJS</h1><p style="color:#94a3b8">Fullstack TypeScript Framework</p></div>`)
    lines.push(`      </body>`)
    lines.push(`      </html>\`)`)
    lines.push(`  })`)
    lines.push(`}`)
  } else {
    lines.push(`import type { RouteContext } from 'speexjs/server/router'`)
    lines.push(``)
    lines.push(`export function registerRoutes(app: any): void {`)
    lines.push(`  app.get('/api/health', async ({ response }: RouteContext) => {`)
    lines.push(`    return response.json({`)
    lines.push(`      status: 'ok',`)
    lines.push(`      timestamp: new Date().toISOString(),`)
    lines.push(`      uptime: process.uptime(),`)
    lines.push(`    })`)
    lines.push(`  })`)
    lines.push(`}`)
  }

  return lines.join('\n') + '\n'
}

function generateHomeController(template: Template): string {
  const controllerName = template === 'api-only' ? 'HealthController' : 'HomeController'

  if (template === 'api-only') {
    return `import { Controller, get } from 'speexjs/server'

export class ${controllerName} extends Controller {
  @get('/health')
  async check({ response }: any) {
    return response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  }
}
`
  }

  return `import { Controller, get } from 'speexjs/server'

export class ${controllerName} extends Controller {
  @get('/')
  async index({ response }: any) {
    return response.html('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>SpeexJS</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,\\'Segoe UI\\',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.container{padding:2rem}h1{font-size:2.5rem;margin-bottom:1rem;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#94a3b8}</style></head><body><div class="container"><h1>SpeexJS</h1><p>Fullstack TypeScript Framework</p></div></body></html>')
  }
}
`
}

function generateAuthScaffold(): Record<string, string> {
  return {
    'src/auth/UserModel.ts': `import { Model } from 'speexjs/server/database'

export class User extends Model {
  static table = 'users'

  id!: number
  name!: string
  email!: string
  password!: string
  createdAt!: Date
  updatedAt!: Date
}
`,
    'src/auth/AuthController.ts': `import { Controller, get, post } from 'speexjs/server'

export class AuthController extends Controller {
  @post('/auth/login')
  async login({ request, response }: any) {
    const { email, password } = await request.body()
    // TODO: implement login logic
    return response.json({ message: 'Login endpoint' })
  }

  @post('/auth/register')
  async register({ request, response }: any) {
    const body = await request.body()
    // TODO: implement registration logic
    return response.json({ message: 'Register endpoint' })
  }

  @get('/auth/me')
  async me({ response }: any) {
    // TODO: return current user
    return response.json({ message: 'Not implemented' })
  }
}
`,
    'src/auth/migrations/001_create_users_table.ts': `import type { Migration } from 'speexjs/server/database'

export const up: Migration = async (db) => {
  await db.schema.createTable('users', (table) => {
    table.increments('id')
    table.string('name').notNullable()
    table.string('email').unique().notNullable()
    table.string('password').notNullable()
    table.timestamp('createdAt').defaultTo(db.fn.now())
    table.timestamp('updatedAt').defaultTo(db.fn.now())
  })
}

export const down: Migration = async (db) => {
  await db.schema.dropTable('users')
}
`,
  }
}

function generateDatabaseScaffold(dialect: DbDialect): Record<string, string> {
  return {
    'src/models/User.ts': `import { Model } from 'speexjs/server/database'

export class User extends Model {
  static table = 'users'

  id!: number
  name!: string
  email!: string
  createdAt!: Date
  updatedAt!: Date
}
`,
    'src/database/migrations/001_create_users_table.ts': `import type { Migration } from 'speexjs/server/database'

export const up: Migration = async (db) => {
  await db.schema.createTable('users', (table) => {
    table.increments('id')
    table.string('name').notNullable()
    table.string('email').unique().notNullable()
    table.timestamp('createdAt').defaultTo(db.fn.now())
    table.timestamp('updatedAt').defaultTo(db.fn.now())
  })
}

export const down: Migration = async (db) => {
  await db.schema.dropTable('users')
}
`,
  }
}

function generateQueueScaffold(): Record<string, string> {
  return {
    'src/jobs/SendEmailJob.ts': `import { Job } from 'speexjs/server/queue'

export class SendEmailJob extends Job {
  async handle(payload: { to: string; subject: string; body: string }): Promise<void> {
    // TODO: implement email sending
    console.log(\`Sending email to \${payload.to}: \${payload.subject}\`)
  }
}
`,
  }
}

function generateWebSocketScaffold(): Record<string, string> {
  return {
    'src/websocket/chat.ts': `import type { WebSocketContext } from 'speexjs/server/websocket'

export function handleConnection(ctx: WebSocketContext): void {
  console.log('WebSocket client connected')

  ctx.on('message', (data: string) => {
    const message = JSON.parse(data)
    console.log('Received:', message)

    ctx.send(JSON.stringify({ type: 'echo', data: message }))
  })

  ctx.on('close', () => {
    console.log('WebSocket client disconnected')
  })
}
`,
  }
}

function generateReadme(name: string, template: Template): string {
  return `# ${toPascalCase(name)}

> Generated with SpeexJS ${template} template

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Available Commands

| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start development server |
| \`npm run build\` | Build for production |
| \`npm start\` | Start production server |
| \`npm run lint\` | Type-check the project |

## Learn More

- [SpeexJS Documentation](https://speexjs.dev/docs)
- [Getting Started Guide](https://speexjs.dev/docs/getting-started)

`
}

function generateEditorconfig(): string {
  return `root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
`
}

// ---------------------------------------------------------------------------
// Main wizard & project generation
// ---------------------------------------------------------------------------

async function interactiveWizard(defaultName: string): Promise<{
  projectName: string
  template: Template
  features: Feature[]
  dbDialect: DbDialect
  deploy: DeployTarget
}> {
  console.log(`\n  ${colors.bold('Welcome to')} ${colors.green('SpeexJS')}${colors.bold('!')}`)
  console.log(`  ${colors.dim('Let\'s create a new project.')}\n`)

  const projectName = await ask(`  ${colors.yellow('?')} Project name ${colors.dim(`[${defaultName}]`)}: `) || defaultName

  console.log(`\n  ${colors.bold('Select a template:')}\n`)
  for (const t of TEMPLATES) {
    const desc = TEMPLATE_DESCRIPTIONS[t] ?? ''
    console.log(`    ${colors.cyan(t.padEnd(16))} ${colors.dim(desc)}`)
  }
  console.log()
  const templateAnswer = await ask(`  ${colors.yellow('→')} Template ${colors.dim('[fullstack]')}: `)
  const template = (TEMPLATES.find(t => t.toLowerCase() === templateAnswer.toLowerCase()) || 'fullstack') as Template

  console.log(`\n  ${colors.bold('Select features:')} ${colors.dim('(comma-separated, leave empty for none)')}\n`)
  for (const f of FEATURES) {
    console.log(`    ${colors.cyan(f)}`)
  }
  console.log()
  const featuresAnswer = await ask(`  ${colors.yellow('→')} Features ${colors.dim('[Auth,Database]')}: `)
  const features = featuresAnswer
    ? featuresAnswer.split(',').map(f => f.trim()).filter(Boolean)
        .filter(f => FEATURES.includes(f as Feature)) as Feature[]
    : ['Auth' as Feature, 'Database' as Feature]

  let dbDialect: DbDialect = 'postgresql'
  if (features.includes('Database')) {
    dbDialect = await select('Select database dialect:', DB_DIALECTS, 'postgresql')
  }

  const deploy = await select('Select deployment target:', DEPLOY_TARGETS, 'node')

  return { projectName, template, features, dbDialect, deploy }
}

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  const defaultName = args.name || 'my-speexjs-app'

  let projectName: string
  let template: Template
  let features: Feature[]
  let dbDialect: DbDialect
  let deploy: DeployTarget

  const hasFlags = args.template || args.features || args.db || args.deploy

  if (!isTTY() || hasFlags) {
    // Non-interactive mode
    if (!args.name) {
      console.error(colors.red('Error: Project name is required in non-interactive mode.'))
      console.log(`  ${colors.dim('Usage: npx @speex/create <project-name> [options]')}`)
      process.exit(1)
    }
    projectName = args.name
    template = (args.template as Template) || 'fullstack'
    if (!TEMPLATES.includes(template)) {
      console.error(colors.red(`Unknown template '${template}'. Available: ${TEMPLATES.join(', ')}`))
      process.exit(1)
    }
    features = args.features?.filter(f => FEATURES.includes(f as Feature)) as Feature[] || ['Auth', 'Database']
    dbDialect = (args.db as DbDialect) || 'postgresql'
    if (!DB_DIALECTS.includes(dbDialect)) {
      console.error(colors.red(`Unknown database dialect '${dbDialect}'. Available: ${DB_DIALECTS.join(', ')}`))
      process.exit(1)
    }
    deploy = (args.deploy as DeployTarget) || 'node'
    if (!DEPLOY_TARGETS.includes(deploy)) {
      console.error(colors.red(`Unknown deploy target '${deploy}'. Available: ${DEPLOY_TARGETS.join(', ')}`))
      process.exit(1)
    }
  } else {
    // Interactive mode
    const wizard = await interactiveWizard(defaultName)
    projectName = wizard.projectName
    template = wizard.template
    features = wizard.features
    dbDialect = wizard.dbDialect
    deploy = wizard.deploy
  }

  const targetDir = resolve(process.cwd(), projectName)

  if (existsSync(targetDir)) {
    console.error(colors.red(`\n  Error: Directory '${projectName}' already exists!`))
    process.exit(1)
  }

  console.log(`\n  ${colors.cyan('→')} Creating project ${colors.bold(projectName)}...`)

  // Define directory structure
  const dirs: string[] = [
    'src',
    'src/controllers',
    'src/routes',
  ]

  if (features.includes('Auth')) {
    dirs.push('src/auth', 'src/auth/migrations')
  }
  if (features.includes('Database')) {
    dirs.push('src/models', 'src/database', 'src/database/migrations')
  }
  if (features.includes('Queue')) {
    dirs.push('src/jobs')
  }
  if (features.includes('WebSocket')) {
    dirs.push('src/websocket')
  }

  // Create directories
  for (const dir of dirs) {
    mkdirSync(resolve(targetDir, dir), { recursive: true })
  }

  // Define files
  const files: Record<string, string> = {
    'package.json': generatePackageJson(projectName, template, features, dbDialect),
    'tsconfig.json': generateTsconfig(),
    'speexjs.config.ts': generateSpeexjsConfig(template, features, dbDialect, deploy),
    '.env.example': generateEnvExample(projectName, template, features, dbDialect),
    '.env': generateEnv(projectName, features, dbDialect),
    '.gitignore': GITIGNORE,
    '.editorconfig': generateEditorconfig(),
    'README.md': generateReadme(projectName, template),
    'src/bootstrap.ts': generateBootstrap(template, features),
    'src/routes/index.ts': generateRoutes(template, features),
    'src/controllers/HomeController.ts': generateHomeController(template),
  }

  // Add auth scaffold
  if (features.includes('Auth')) {
    Object.assign(files, generateAuthScaffold())
  }

  // Add database scaffold
  if (features.includes('Database')) {
    Object.assign(files, generateDatabaseScaffold(dbDialect))
  }

  // Add queue scaffold
  if (features.includes('Queue')) {
    Object.assign(files, generateQueueScaffold())
  }

  // Add websocket scaffold
  if (features.includes('WebSocket')) {
    Object.assign(files, generateWebSocketScaffold())
  }

  // Write all files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = resolve(targetDir, filePath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
  }

  console.log(`  ${colors.green('✔')} Project structure created`)

  // npm install
  console.log(`  ${colors.cyan('→')} Installing dependencies...`)
  try {
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' })
  } catch {
    console.log(`  ${colors.yellow('!')} Dependency install skipped. Run 'npm install' manually.`)
  }

  // Git init
  try {
    execSync('git init', { cwd: targetDir, stdio: 'ignore' })
  } catch {
    // git not available
  }

  // Success message
  const projectClass = toPascalCase(projectName)
  const pad = (s: string, n: number) => s.padEnd(n)
  const labelW = 12
  const valW = 36

  console.log()
  console.log(`  ${colors.bold('╔══════════════════════════════════════════╗')}`)
  console.log(`  ${colors.bold('║')}         ${colors.green('SpeexJS')} ${colors.cyan('🚀')} ${colors.bold('Project Created')}          ${colors.bold('║')}`)
  console.log(`  ${colors.bold('╠══════════════════════════════════════════╣')}`)
  console.log(`  ${colors.bold('║')}  ${colors.dim(pad('Name:', labelW))}${colors.white(pad(projectClass, valW))}${colors.bold('║')}`)
  console.log(`  ${colors.bold('║')}  ${colors.dim(pad('Template:', labelW))}${colors.cyan(pad(template, valW))}${colors.bold('║')}`)
  console.log(`  ${colors.bold('║')}  ${colors.dim(pad('Features:', labelW))}${colors.white(pad(features.length ? features.join(', ') : '(none)', valW))}${colors.bold('║')}`)
  console.log(`  ${colors.bold('║')}  ${colors.dim(pad('Deploy:', labelW))}${colors.cyan(pad(deploy, valW))}${colors.bold('║')}`)
  console.log(`  ${colors.bold('║')}  ${colors.dim(pad('Dir:', labelW))}${colors.white(pad(targetDir, valW))}${colors.bold('║')}`)
  console.log(`  ${colors.bold('╚══════════════════════════════════════════╝')}`)
  console.log()
  console.log(`  ${colors.green('✔')} Project ${colors.bold(projectName)} created successfully!`)
  console.log()
  console.log(`  ${colors.bold('Next steps:')}`)
  console.log(`    ${colors.cyan('$')} cd ${projectName}`)
  console.log(`    ${colors.cyan('$')} npm run dev`)
  console.log()
  console.log(`  ${colors.dim('Docs:')} ${colors.cyan('https://speexjs.dev/docs')}`)
  console.log()
}

main().catch(err => {
  console.error(`\n  ${colors.red(err.message)}`)
  process.exit(1)
})
