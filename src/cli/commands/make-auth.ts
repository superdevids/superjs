import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colors } from '../../native/colors.js'

type GuardType = 'session' | 'token' | 'sanctum' | 'all'

interface AuthOptions {
  guard: GuardType
  views: boolean
  api: boolean
  oauth: string[]
  twoFactor: boolean
  verifyEmail: boolean
  resetPassword: boolean
  admin: boolean
}

function toPascalCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c: string) => (c ?? '').toUpperCase()).replace(/^(.)/, (c: string) => c.toUpperCase())
}

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

function timestamp(): string {
  return `${Date.now()}`
}

const GUARD_LIST: GuardType[] = ['session', 'token', 'sanctum']

function getGuards(guard: GuardType): GuardType[] {
  return guard === 'all' ? GUARD_LIST : [guard]
}

function generateUserModel(guard: string, opts: AuthOptions): string {
  const oauthFields = opts.oauth.length > 0 ? `\n  static oauth = ['${opts.oauth.join("', '")}']\n` : ''
  const twoFactorFields = opts.twoFactor ? `\n  static twoFactor = true\n` : ''

  return `import { Model } from 'speexjs/server/database'

export class User extends Model {
  static table = 'users'

  static hidden = ['password'${opts.twoFactor ? ", 'two_factor_secret'" : ''}]

  static guard: '${guard}' = '${guard}'

  static casts = {
    email_verified_at: 'datetime',
    created_at: 'datetime',
    updated_at: 'datetime',
  }
${oauthFields}${twoFactorFields}
  hasMany(related: string, foreignKey: string, localKey: string) {
    return super.hasMany(related, foreignKey, localKey)
  }

  belongsTo(related: string, foreignKey: string, ownerKey: string) {
    return super.belongsTo(related, foreignKey, ownerKey)
  }
}
`
}

function generateUserMigration(opts: AuthOptions): string {
  const oauthColumns = opts.oauth.length > 0
    ? `    table.string('provider').nullable()
    table.string('provider_id').nullable()
    table.text('avatar_url').nullable()
`
    : ''
  const twoFactorColumns = opts.twoFactor
    ? `    table.text('two_factor_secret').nullable()
    table.text('two_factor_recovery_codes').nullable()
`
    : ''
  const verifyColumns = opts.verifyEmail
    ? `    table.timestamp('email_verified_at').nullable()
`
    : ''

  return `import { SchemaBuilder } from 'speexjs/server/database'

export async function up(schema: SchemaBuilder): Promise<void> {
  schema.createTable('users', (table) => {
    table.increments('id')
    table.string('name').notNullable()
    table.string('email').unique().notNullable()
    table.string('password').notNullable()
${verifyColumns}${oauthColumns}${twoFactorColumns}    table.string('remember_token').nullable()
    table.timestamps()
  })
}

export async function down(schema: SchemaBuilder): Promise<void> {
  schema.dropTable('users')
}
`
}

function generatePasswordResetMigration(): string {
  return `import { SchemaBuilder } from 'speexjs/server/database'

export async function up(schema: SchemaBuilder): Promise<void> {
  schema.createTable('password_resets', (table) => {
    table.string('email').index()
    table.string('token')
    table.timestamp('created_at').nullable()
  })
}

export async function down(schema: SchemaBuilder): Promise<void> {
  schema.dropTable('password_resets')
}
`
}

function generateSessionMigration(): string {
  return `import { SchemaBuilder } from 'speexjs/server/database'

export async function up(schema: SchemaBuilder): Promise<void> {
  schema.createTable('sessions', (table) => {
    table.string('id').primary()
    table.integer('user_id').nullable().index()
    table.string('ip_address', 45).nullable()
    table.text('user_agent').nullable()
    table.text('payload')
    table.integer('last_activity').index()
  })
}

export async function down(schema: SchemaBuilder): Promise<void> {
  schema.dropTable('sessions')
}
`
}

function generateOAuthMigration(): string {
  return `import { SchemaBuilder } from 'speexjs/server/database'

export async function up(schema: SchemaBuilder): Promise<void> {
  schema.createTable('oauth_providers', (table) => {
    table.increments('id')
    table.integer('user_id').unsigned().references('id').on('users').onDelete('cascade')
    table.string('provider').notNullable()
    table.string('provider_id').notNullable()
    table.text('access_token').nullable()
    table.text('refresh_token').nullable()
    table.timestamp('expires_at').nullable()
    table.timestamps()
    table.unique(['provider', 'provider_id'])
  })
}

export async function down(schema: SchemaBuilder): Promise<void> {
  schema.dropTable('oauth_providers')
}
`
}

function generateTwoFactorMigration(): string {
  return `import { SchemaBuilder } from 'speexjs/server/database'

export async function up(schema: SchemaBuilder): Promise<void> {
  schema.createTable('two_factor_authentications', (table) => {
    table.increments('id')
    table.integer('user_id').unsigned().references('id').on('users').onDelete('cascade')
    table.string('secret').notNullable()
    table.boolean('enabled').defaultTo(false)
    table.timestamps()
  })
}

export async function down(schema: SchemaBuilder): Promise<void> {
  schema.dropTable('two_factor_authentications')
}
`
}

function generateAuthController(guard: string, opts: AuthOptions): string {
  const tokenImport = guard === 'token' ? "import { generateToken } from 'speexjs/server/auth'\n" : ''
  const loginLogic =
    guard === 'session'
      ? `    const token = crypto.randomUUID()
    ctx.session.set('auth_token', token)
    ctx.session.set('user_id', user.id)`
      : guard === 'sanctum'
        ? `    const token = user.createToken('auth-token')`
        : `    const token = generateToken(user.id)`

  const twoFactorLogic = opts.twoFactor
    ? `\n    // Check 2FA
    if (user.two_factor_enabled) {
      const code = body.totp_code
      if (!code) {
        return response.status(200).json({
          requiresTwoFactor: true,
          message: 'Two-factor authentication code required',
        })
      }
    }`
    : ''

  const oauthEndpoints = opts.oauth.length > 0
    ? `
  @get('/auth/oauth/:provider')
  async oauthRedirect({ response, params }: RouteContext) {
    const provider = params.provider
    const allowed = ['${opts.oauth.join("', '")}']
    if (!allowed.includes(provider)) {
      return response.status(400).json({ error: 'INVALID_PROVIDER', message: 'Unsupported OAuth provider' })
    }
    const redirectUri = \`\${Bun.env.APP_URL}/auth/oauth/\${provider}/callback\`
    let authUrl = ''
    if (provider === 'google') {
      authUrl = \`https://accounts.google.com/o/oauth2/v2/auth?client_id=\${Bun.env.GOOGLE_CLIENT_ID}&redirect_uri=\${redirectUri}&response_type=code&scope=email%20profile\`
    } else if (provider === 'github') {
      authUrl = \`https://github.com/login/oauth/authorize?client_id=\${Bun.env.GITHUB_CLIENT_ID}&redirect_uri=\${redirectUri}&scope=user:email\`
    } else if (provider === 'discord') {
      authUrl = \`https://discord.com/api/oauth2/authorize?client_id=\${Bun.env.DISCORD_CLIENT_ID}&redirect_uri=\${redirectUri}&response_type=code&scope=identify%20email\`
    }
    return response.json({ url: authUrl })
  }

  @get('/auth/oauth/:provider/callback')
  async oauthCallback({ request, response, params }: RouteContext) {
    const provider = params.provider
    const code = request.query('code')
    if (!code) {
      return response.status(400).json({ error: 'MISSING_CODE', message: 'Authorization code is required' })
    }
    // Exchange code for token and fetch user profile
    // In production, make HTTP request to provider's token endpoint
    return response.json({ provider, message: 'OAuth callback received' })
  }`
    : ''

  const twoFactorEndpoints = opts.twoFactor
    ? `
  @post('/auth/2fa/enable')
  async enableTwoFactor({ request, response, ctx }: RouteContext) {
    const body = await request.body()
    // Generate TOTP secret and QR code URL
    const secret = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    return response.json({
      secret,
      qrUrl: \`otpauth://totp/SpeexJS:\${ctx.auth?.email}?secret=\${secret}&issuer=SpeexJS\`,
    })
  }

  @post('/auth/2fa/verify')
  async verifyTwoFactor({ request, response, ctx }: RouteContext) {
    const body = await request.body()
    if (!body.totp_code) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: 'TOTP code is required' })
    }
    // Verify TOTP code against user's secret
    return response.json({ verified: true })
  }

  @post('/auth/2fa/disable')
  async disableTwoFactor({ request, response, ctx }: RouteContext) {
    return response.json({ message: 'Two-factor authentication disabled' })
  }`
    : ''

  const verifyEndpoints = opts.verifyEmail
    ? `
  @post('/auth/email/verify')
  async sendVerificationEmail({ response, ctx }: RouteContext) {
    // Generate verification token and send email
    return response.json({ message: 'Verification email sent' })
  }

  @get('/auth/email/verify/:token')
  async verifyEmail({ response, params }: RouteContext) {
    const token = params.token
    if (!token) {
      return response.status(400).json({ error: 'INVALID_TOKEN', message: 'Verification token is required' })
    }
    return response.json({ message: 'Email verified successfully' })
  }`
    : ''

  return `import { Controller, get, post } from 'speexjs/server'
import type { RouteContext } from 'speexjs/server/router'
import { schema } from 'speexjs/schema'
import { User } from '../models/user.model.js'
${tokenImport}
const RegisterSchema = schema.object({
  name: schema.string().min(3).max(100),
  email: schema.string().email(),
  password: schema.string().min(8).max(128),
})

const LoginSchema = schema.object({
  email: schema.string().email(),
  password: schema.string().min(1),
})

export class AuthController extends Controller {
  @post('/auth/register')
  async register({ request, response }: RouteContext) {
    const body = await request.body()
    const result = RegisterSchema.safeParse(body)
    if (!result.success) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: result.error })
    }

    const existing = await User.where('email', result.data.email).first()
    if (existing) {
      return response.status(409).json({ error: 'EMAIL_TAKEN', message: 'Email already registered' })
    }

    const hashedPassword = await Bun.password.hash(result.data.password)
    const user = await User.create({
      name: result.data.name,
      email: result.data.email,
      password: hashedPassword,
    })

    return response.status(201).json({ data: { id: user.id, name: user.name, email: user.email } })
  }

  @post('/auth/login')
  async login({ request, response, ctx }: RouteContext) {
    const body = await request.body()
    const result = LoginSchema.safeParse(body)
    if (!result.success) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: result.error })
    }

    const user = await User.where('email', result.data.email).first()
    if (!user) {
      return response.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
    }

    const valid = await Bun.password.verify(result.data.password, user.password)
    if (!valid) {
      return response.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
    }
${twoFactorLogic}
${loginLogic}

    return response.json({ data: { id: user.id, name: user.name, email: user.email }, token })
  }

  @post('/auth/logout')
  async logout({ response, ctx }: RouteContext) {
${guard === 'session' ? `    ctx.session.destroy()` : `    ctx.auth = null`}
    return response.json({ message: 'Logged out successfully' })
  }

  @get('/auth/profile')
  async profile({ response, ctx }: RouteContext) {
${
  guard === 'session'
    ? `    const userId = ctx.session.get('user_id')
    if (!userId) {
      return response.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' })
    }
    const user = await User.find(userId)`
    : `    if (!ctx.auth) {
      return response.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' })
    }
    const user = ctx.auth`
}
    if (!user) {
      return response.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' })
    }

    return response.json({ data: { id: user.id, name: user.name, email: user.email } })
  }

  @post('/auth/forgot-password')
  async forgotPassword({ request, response }: RouteContext) {
    const body = await request.body()
    const email = body?.email
    if (!email) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: 'Email is required' })
    }

    const user = await User.where('email', email).first()
    if (user) {
      console.log('Password reset requested for:', email)
    }

    return response.json({ message: 'If the email exists, a reset link has been sent' })
  }

  @post('/auth/reset-password')
  async resetPassword({ request, response }: RouteContext) {
    const body = await request.body()
    if (!body.token || !body.password) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: 'Token and password are required' })
    }
    if (body.password.length < 8) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' })
    }

    return response.json({ message: 'Password reset successfully' })
  }
${oauthEndpoints}${twoFactorEndpoints}${verifyEndpoints}
}

export const authController = AuthController
`
}

function generateOAuthController(provider: string): string {
  const capitalProvider = toPascalCase(provider)

  return `import { Controller, get } from 'speexjs/server'
import type { RouteContext } from 'speexjs/server/router'
import { User } from '#models/user.model'

export class ${capitalProvider}OAuthController extends Controller {
  @get('/auth/oauth/${provider}')
  redirect({ response }: RouteContext) {
    const redirectUri = \`\${Bun.env.APP_URL}/auth/oauth/${provider}/callback\`
    let authUrl = ''
    if ('${provider}' === 'google') {
      authUrl = \`https://accounts.google.com/o/oauth2/v2/auth?\`
        + \`client_id=\${Bun.env.GOOGLE_CLIENT_ID}&\`
        + \`redirect_uri=\${redirectUri}&\`
        + \`response_type=code&\`
        + \`scope=openid%20email%20profile\`
    } else if ('${provider}' === 'github') {
      authUrl = \`https://github.com/login/oauth/authorize?\`
        + \`client_id=\${Bun.env.GITHUB_CLIENT_ID}&\`
        + \`redirect_uri=\${redirectUri}&\`
        + \`scope=user:email\`
    } else if ('${provider}' === 'discord') {
      authUrl = \`https://discord.com/api/oauth2/authorize?\`
        + \`client_id=\${Bun.env.DISCORD_CLIENT_ID}&\`
        + \`redirect_uri=\${redirectUri}&\`
        + \`response_type=code&\`
        + \`scope=identify%20email\`
    }
    return response.redirect(authUrl)
  }

  @get('/auth/oauth/${provider}/callback')
  async callback({ request, response }: RouteContext) {
    const code = request.query('code')
    if (!code) {
      return response.status(400).json({ error: 'MISSING_CODE', message: 'Authorization code is required' })
    }

    // Exchange authorization code for access token
    // const tokenResponse = await fetch(tokenUrl, { method: 'POST', body: ... })
    // const profile = await fetch(profileUrl, { headers: { Authorization: \`Bearer \${accessToken}\` } })

    // Find or create user by provider + provider_id
    // const user = await User.query()
    //   .where('provider', '${provider}')
    //   .where('provider_id', profile.id)
    //   .first()

    return response.json({ message: '${capitalProvider} OAuth callback handled' })
  }
}
`
}

function generateTwoFactorController(): string {
  return `import { Controller, get, post } from 'speexjs/server'
import type { RouteContext } from 'speexjs/server/router'

export class TwoFactorController extends Controller {
  @post('/auth/2fa/enable')
  async enable({ request, response }: RouteContext) {
    const body = await request.body()
    const secret = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
    return response.json({
      secret,
      qrCode: \`otpauth://totp/SpeexJS:\${body.email}?secret=\${secret}&issuer=SpeexJS\`,
    })
  }

  @post('/auth/2fa/verify')
  async verify({ request, response }: RouteContext) {
    const body = await request.body()
    if (!body.user_id || !body.totp_code) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: 'user_id and totp_code are required' })
    }
    // Verify TOTP using speexjs/server/auth verifyTotp utility
    return response.json({ verified: true })
  }

  @post('/auth/2fa/disable')
  async disable({ request, response }: RouteContext) {
    const body = await request.body()
    if (!body.user_id) {
      return response.status(422).json({ error: 'VALIDATION_ERROR', message: 'user_id is required' })
    }
    return response.json({ message: 'Two-factor authentication disabled' })
  }

  @get('/auth/2fa/recovery-codes')
  async recoveryCodes({ response }: RouteContext) {
    const codes = Array.from({ length: 8 }, () =>
      crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
    )
    return response.json({ codes })
  }
}
`
}

function generateVerifyEmailController(): string {
  return `import { Controller, get, post } from 'speexjs/server'
import type { RouteContext } from 'speexjs/server/router'
import { User } from '#models/user.model'

export class VerifyEmailController extends Controller {
  @post('/auth/email/verify/send')
  async sendVerification({ response, ctx }: RouteContext) {
    if (!ctx.auth?.id) {
      return response.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' })
    }

    const token = crypto.randomUUID()
    // Store token and send email with verification link
    // await EmailService.send({ to: user.email, template: 'verify-email', data: { token } })

    return response.json({ message: 'Verification email sent' })
  }

  @get('/auth/email/verify/:token')
  async verify({ response, params }: RouteContext) {
    const { token } = params
    if (!token) {
      return response.status(400).json({ error: 'INVALID_TOKEN', message: 'Verification token is required' })
    }

    // Verify token and mark email as verified
    // const user = await User.where('email_verification_token', token).first()
    // if (!user) return response.status(400).json({ error: 'INVALID_TOKEN' })
    // await user.update({ email_verified_at: new Date(), email_verification_token: null })

    return response.json({ message: 'Email verified successfully' })
  }
}
`
}

function generateAdminMiddleware(): string {
  return `import type { RouteContext } from 'speexjs/server/router'

export function admin() {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    if (!ctx.auth) {
      ctx.response.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' })
      return
    }

    const user = ctx.auth
    if (user.role !== 'admin') {
      ctx.response.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' })
      return
    }

    await next()
  }
}
`
}

function generateAdminController(): string {
  return `import { Controller, get, post, put, del } from 'speexjs/server'
import type { RouteContext } from 'speexjs/server/router'
import { schema } from 'speexjs/schema'
import { User } from '#models/user.model'

const UpdateUserSchema = schema.object({
  name: schema.string().min(1).max(255).optional(),
  email: schema.string().email().optional(),
  role: schema.string().optional(),
})

export class AdminUserController extends Controller {
  @get('/admin/users')
  async index({ response }: RouteContext) {
    const users = await User.query().orderBy('createdAt', 'desc')
    return response.json({ data: users })
  }

  @get('/admin/users/:id')
  async show({ response, params }: RouteContext) {
    const user = await User.find(Number(params.id))
    if (!user) {
      return response.status(404).json({ error: 'NOT_FOUND', message: 'User not found' })
    }
    return response.json({ data: user })
  }

  @put('/admin/users/:id')
  async update({ request, response, params }: RouteContext) {
    const body = await request.body()
    const parsed = UpdateUserSchema.safeParse(body)
    if (!parsed.success) {
      return response.status(422).json({ errors: parsed.error })
    }

    const user = await User.find(Number(params.id))
    if (!user) {
      return response.status(404).json({ error: 'NOT_FOUND', message: 'User not found' })
    }

    await user.update(parsed.data)
    return response.json({ data: user })
  }

  @del('/admin/users/:id')
  async destroy({ response, params }: RouteContext) {
    const user = await User.find(Number(params.id))
    if (!user) {
      return response.status(404).json({ error: 'NOT_FOUND', message: 'User not found' })
    }

    await user.delete()
    return response.json({ message: 'User deleted successfully' })
  }
}

export const adminUserController = AdminUserController
`
}

function generateAuthRoutes(opts: AuthOptions): string {
  const oauthImports = opts.oauth
    .map((p) => {
      const cp = toPascalCase(p)
      return `import { ${cp}OAuthController } from './controllers/${p}.oauth.controller.js'`
    })
    .join('\n')

  const twoFactorImport = opts.twoFactor
    ? `import { TwoFactorController } from './controllers/two-factor.controller.js'`
    : ''
  const verifyImport = opts.verifyEmail
    ? `import { VerifyEmailController } from './controllers/verify-email.controller.js'`
    : ''
  const adminImport = opts.admin
    ? `import { AdminUserController } from './controllers/admin-user.controller.js'`
    : ''

  const extraImports = [oauthImports, twoFactorImport, verifyImport, adminImport].filter(Boolean).join('\n')

  const oauthRoutes = opts.oauth
    .map((p) => {
      const cp = toPascalCase(p)
      return `  app.get('/auth/oauth/${p}', '${cp}OAuthController.redirect')
  app.get('/auth/oauth/${p}/callback', '${cp}OAuthController.callback')`
    })
    .join('\n')

  const twoFactorRoutes = opts.twoFactor
    ? `
  // 2FA routes
  app.post('/auth/2fa/enable', auth(), 'TwoFactorController.enable')
  app.post('/auth/2fa/verify', 'TwoFactorController.verify')
  app.post('/auth/2fa/disable', auth(), 'TwoFactorController.disable')
  app.get('/auth/2fa/recovery-codes', auth(), 'TwoFactorController.recoveryCodes')`
    : ''

  const verifyRoutes = opts.verifyEmail
    ? `
  // Email verification routes
  app.post('/auth/email/verify/send', auth(), 'VerifyEmailController.sendVerification')
  app.get('/auth/email/verify/:token', 'VerifyEmailController.verify')`
    : ''

  const adminRoutes = opts.admin
    ? `
  // Admin routes
  app.get('/admin/users', admin(), 'AdminUserController.index')
  app.get('/admin/users/:id', admin(), 'AdminUserController.show')
  app.put('/admin/users/:id', admin(), 'AdminUserController.update')
  app.delete('/admin/users/:id', admin(), 'AdminUserController.destroy')`
    : ''

  return `import { AuthController } from './controllers/auth.controller.js'
import { auth } from './middleware/auth.middleware.js'
${extraImports ? `${extraImports}\n` : ''}${opts.admin ? "import { admin } from './middleware/admin.middleware.js'\n" : ''}
export function authRoutes(app: any) {
  app.controller(AuthController)

  // Public routes
  app.post('/auth/register', 'AuthController.register')
  app.post('/auth/login', 'AuthController.login')
  app.post('/auth/forgot-password', 'AuthController.forgotPassword')
  app.post('/auth/reset-password', 'AuthController.resetPassword')

  // Protected routes
  app.post('/auth/logout', auth(), 'AuthController.logout')
  app.get('/auth/profile', auth(), 'AuthController.profile')
${oauthRoutes ? `\n  // OAuth routes\n${oauthRoutes}` : ''}${twoFactorRoutes}${verifyRoutes}${adminRoutes}
}
`
}

function generateAuthMiddleware(guard: string): string {
  if (guard === 'session') {
    return `import type { RouteContext } from 'speexjs/server/router'

export function auth() {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    const userId = ctx.session?.get('user_id')
    if (!userId) {
      ctx.response.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' })
      return
    }
    await next()
  }
}

export function guest() {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    const userId = ctx.session?.get('user_id')
    if (userId) {
      ctx.response.status(302).redirect('/')
      return
    }
    await next()
  }
}
`
  }

  if (guard === 'sanctum') {
    return `import type { RouteContext } from 'speexjs/server/router'

export function auth() {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    const header = ctx.request.headers.get('authorization')
    if (!header || !header.startsWith('Bearer ')) {
      ctx.response.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' })
      return
    }
    await next()
  }
}

export function guest() {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    const header = ctx.request.headers.get('authorization')
    if (header && header.startsWith('Bearer ')) {
      ctx.response.status(302).redirect('/')
      return
    }
    await next()
  }
}
`
  }

  return `import type { RouteContext } from 'speexjs/server/router'
import { verifyToken } from 'speexjs/server/auth'

export function auth() {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    const header = ctx.request.headers.get('authorization')
    if (!header || !header.startsWith('Bearer ')) {
      ctx.response.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' })
      return
    }

    const token = header.slice(7)
    const payload = verifyToken(token)
    if (!payload) {
      ctx.response.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' })
      return
    }

    ctx.auth = payload
    await next()
  }
}

export function guest() {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    const header = ctx.request.headers.get('authorization')
    if (header && header.startsWith('Bearer ')) {
      ctx.response.status(302).redirect('/')
      return
    }
    await next()
  }
}
`
}

function generateSessionGuard(): string {
  return `import type { RouteContext } from 'speexjs/server/router'

export function session(options?: Record<string, unknown>) {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    if (ctx.session && ctx.session.get('auth_token')) {
      ctx.auth = { authenticated: true }
    }
    await next()
  }
}
`
}

function generateLoginView(): string {
  return `import type { VNode } from 'speexjs/client/vdom'

interface LoginPageProps {
  error?: string
  title?: string
}

export function LoginPage({ error, title }: LoginPageProps): VNode {
  return {
    type: 'element',
    tag: 'div',
    props: { style: 'display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;font-family:sans-serif' },
    children: [
      {
        type: 'element',
        tag: 'div',
        props: { style: 'background:#1e293b;padding:2rem;border-radius:8px;width:100%;max-width:400px' },
        children: [
          { type: 'element', tag: 'h1', props: { style: 'color:#e2e8f0;margin-bottom:1.5rem;text-align:center' }, children: [{ type: 'text', text: title ?? 'Sign In' }] },
          ...(error ? [{ type: 'element', tag: 'p', props: { style: 'color:#ef4444;margin-bottom:1rem;text-align:center' }, children: [{ type: 'text', text: error }] }] : []),
          {
            type: 'element',
            tag: 'form',
            props: { method: 'POST', action: '/auth/login', style: 'display:flex;flex-direction:column;gap:1rem' },
            children: [
              {
                type: 'element', tag: 'input',
                props: { type: 'email', name: 'email', placeholder: 'Email', required: true,
                  style: 'padding:0.75rem;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem' },
                children: [],
              },
              {
                type: 'element', tag: 'input',
                props: { type: 'password', name: 'password', placeholder: 'Password', required: true,
                  style: 'padding:0.75rem;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem' },
                children: [],
              },
              {
                type: 'element', tag: 'button',
                props: { type: 'submit',
                  style: 'padding:0.75rem;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:1rem;cursor:pointer;font-weight:500' },
                children: [{ type: 'text', text: 'Sign In' }],
              },
            ],
          },
          {
            type: 'element', tag: 'p', props: { style: 'margin-top:1rem;text-align:center;color:#94a3b8;font-size:0.875rem' },
            children: [
              { type: 'text', text: "Don't have an account? " },
              { type: 'element', tag: 'a', props: { href: '/register', style: 'color:#60a5fa;text-decoration:none' }, children: [{ type: 'text', text: 'Register' }] },
            ],
          },
        ],
      },
    ],
  }
}
`
}

function generateRegisterView(): string {
  return `import type { VNode } from 'speexjs/client/vdom'

interface RegisterPageProps {
  error?: string
  title?: string
}

export function RegisterPage({ error, title }: RegisterPageProps): VNode {
  return {
    type: 'element',
    tag: 'div',
    props: { style: 'display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;font-family:sans-serif' },
    children: [
      {
        type: 'element',
        tag: 'div',
        props: { style: 'background:#1e293b;padding:2rem;border-radius:8px;width:100%;max-width:400px' },
        children: [
          { type: 'element', tag: 'h1', props: { style: 'color:#e2e8f0;margin-bottom:1.5rem;text-align:center' }, children: [{ type: 'text', text: title ?? 'Create Account' }] },
          ...(error ? [{ type: 'element', tag: 'p', props: { style: 'color:#ef4444;margin-bottom:1rem;text-align:center' }, children: [{ type: 'text', text: error }] }] : []),
          {
            type: 'element',
            tag: 'form',
            props: { method: 'POST', action: '/auth/register', style: 'display:flex;flex-direction:column;gap:1rem' },
            children: [
              {
                type: 'element', tag: 'input',
                props: { type: 'text', name: 'name', placeholder: 'Name', required: true,
                  style: 'padding:0.75rem;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem' },
                children: [],
              },
              {
                type: 'element', tag: 'input',
                props: { type: 'email', name: 'email', placeholder: 'Email', required: true,
                  style: 'padding:0.75rem;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem' },
                children: [],
              },
              {
                type: 'element', tag: 'input',
                props: { type: 'password', name: 'password', placeholder: 'Password', required: true,
                  style: 'padding:0.75rem;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem' },
                children: [],
              },
              {
                type: 'element', tag: 'button',
                props: { type: 'submit',
                  style: 'padding:0.75rem;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:1rem;cursor:pointer;font-weight:500' },
                children: [{ type: 'text', text: 'Register' }],
              },
            ],
          },
          {
            type: 'element', tag: 'p', props: { style: 'margin-top:1rem;text-align:center;color:#94a3b8;font-size:0.875rem' },
            children: [
              { type: 'text', text: 'Already have an account? ' },
              { type: 'element', tag: 'a', props: { href: '/login', style: 'color:#60a5fa;text-decoration:none' }, children: [{ type: 'text', text: 'Sign in' }] },
            ],
          },
        ],
      },
    ],
  }
}
`

}

export async function makeAuth(options?: Partial<AuthOptions>): Promise<void> {
  const opts: AuthOptions = {
    guard: options?.guard ?? 'session',
    views: options?.views ?? true,
    api: options?.api ?? false,
    oauth: options?.oauth ?? [],
    twoFactor: options?.twoFactor ?? false,
    verifyEmail: options?.verifyEmail ?? false,
    resetPassword: options?.resetPassword ?? true,
    admin: options?.admin ?? false,
  }

  const guardLabel = opts.guard === 'all' ? 'session, token, sanctum' : opts.guard
  const extras: string[] = []
  if (opts.oauth.length > 0) extras.push(`oauth:${opts.oauth.join(',')}`)
  if (opts.twoFactor) extras.push('2fa')
  if (opts.verifyEmail) extras.push('verify-email')
  if (opts.admin) extras.push('admin')
  const extrasLabel = extras.length > 0 ? ` + ${extras.join(', ')}` : ''

  console.log(`  ${colors.cyan('→')} Generating auth scaffold (guard: ${guardLabel}${extrasLabel})...`)
  console.log()

  const baseDir = resolve(process.cwd())
  const guards = getGuards(opts.guard)

  // ── Shared: Models ──
  const modelsDir = resolve(baseDir, 'src/models')
  mkdirSync(modelsDir, { recursive: true })
  const userModelPath = resolve(modelsDir, 'user.model.ts')
  if (!existsSync(userModelPath)) {
    writeFileSync(userModelPath, generateUserModel(opts.guard === 'all' ? 'session' : opts.guard, opts), 'utf-8')
    console.log(`  ${colors.green('✅')} Model ${colors.bold('User')} created at ${colors.cyan('src/models/user.model.ts')}`)
  } else {
    console.log(`  ${colors.yellow('⚠')} Model ${colors.bold('User')} already exists — skipped`)
  }

  // ── Shared: Migrations ──
  const migrationsDir = resolve(baseDir, 'src/database/migrations')
  mkdirSync(migrationsDir, { recursive: true })

  const userMigrationPath = resolve(migrationsDir, `${timestamp()}_create_users_table.ts`)
  writeFileSync(userMigrationPath, generateUserMigration(opts), 'utf-8')
  console.log(`  ${colors.green('✅')} Migration ${colors.bold('create_users_table')} created`)

  if (opts.resetPassword) {
    const resetMigrationPath = resolve(migrationsDir, `${Number(timestamp()) + 1}_create_password_resets_table.ts`)
    writeFileSync(resetMigrationPath, generatePasswordResetMigration(), 'utf-8')
    console.log(`  ${colors.green('✅')} Migration ${colors.bold('create_password_resets_table')} created`)
  }

  if (opts.oauth.length > 0) {
    const oauthMigrationPath = resolve(migrationsDir, `${Number(timestamp()) + 3}_create_oauth_providers_table.ts`)
    writeFileSync(oauthMigrationPath, generateOAuthMigration(), 'utf-8')
    console.log(`  ${colors.green('✅')} Migration ${colors.bold('create_oauth_providers_table')} created`)
  }

  if (opts.twoFactor) {
    const twoFactorMigrationPath = resolve(migrationsDir, `${Number(timestamp()) + 4}_create_two_factor_authentications_table.ts`)
    writeFileSync(twoFactorMigrationPath, generateTwoFactorMigration(), 'utf-8')
    console.log(`  ${colors.green('✅')} Migration ${colors.bold('create_two_factor_authentications_table')} created`)
  }

  // ── Per-guard Controllers, Middleware, Guards ──
  for (const g of guards) {
    const suffix = guards.length > 1 ? `.${g}` : ''

    const controllersDir = resolve(baseDir, 'src/server/controllers')
    mkdirSync(controllersDir, { recursive: true })
    const controllerPath = resolve(controllersDir, `auth${suffix}.controller.ts`)
    if (!existsSync(controllerPath)) {
      writeFileSync(controllerPath, generateAuthController(g, opts), 'utf-8')
      console.log(`  ${colors.green('✅')} Controller ${colors.bold(`Auth${suffix}Controller`)} created`)
    } else {
      console.log(`  ${colors.yellow('⚠')} Controller ${colors.bold(`Auth${suffix}Controller`)} already exists — skipped`)
    }

    const middlewareDir = resolve(baseDir, 'src/server/middleware')
    mkdirSync(middlewareDir, { recursive: true })
    const middlewarePath = resolve(middlewareDir, `auth${suffix}.middleware.ts`)
    if (!existsSync(middlewarePath)) {
      writeFileSync(middlewarePath, generateAuthMiddleware(g), 'utf-8')
      console.log(`  ${colors.green('✅')} Middleware ${colors.bold(`auth${suffix}`)} created`)
    } else {
      console.log(`  ${colors.yellow('⚠')} Middleware ${colors.bold(`auth${suffix}`)} already exists — skipped`)
    }

    if (g === 'session') {
      const gateDir = resolve(baseDir, 'src/server/gate')
      mkdirSync(gateDir, { recursive: true })
      const gatePath = resolve(gateDir, `session${suffix}.guard.ts`)
      if (!existsSync(gatePath)) {
        writeFileSync(gatePath, generateSessionGuard(), 'utf-8')
        console.log(`  ${colors.green('✅')} Session guard created`)
      } else {
        console.log(`  ${colors.yellow('⚠')} Session guard already exists — skipped`)
      }
    }
  }

  // ── OAuth Controllers ──
  if (opts.oauth.length > 0) {
    const controllersDir = resolve(baseDir, 'src/server/controllers')
    for (const provider of opts.oauth) {
      const oauthPath = resolve(controllersDir, `${provider}.oauth.controller.ts`)
      if (!existsSync(oauthPath)) {
        writeFileSync(oauthPath, generateOAuthController(provider), 'utf-8')
        console.log(`  ${colors.green('✅')} OAuth controller ${colors.bold(toPascalCase(provider))} created`)
      } else {
        console.log(`  ${colors.yellow('⚠')} OAuth controller ${colors.bold(toPascalCase(provider))} already exists — skipped`)
      }
    }
  }

  // ── 2FA Controller ──
  if (opts.twoFactor) {
    const controllersDir = resolve(baseDir, 'src/server/controllers')
    const tfaPath = resolve(controllersDir, 'two-factor.controller.ts')
    if (!existsSync(tfaPath)) {
      writeFileSync(tfaPath, generateTwoFactorController(), 'utf-8')
      console.log(`  ${colors.green('✅')} Controller ${colors.bold('TwoFactorController')} created`)
    } else {
      console.log(`  ${colors.yellow('⚠')} Controller ${colors.bold('TwoFactorController')} already exists — skipped`)
    }
  }

  // ── Email Verification Controller ──
  if (opts.verifyEmail) {
    const controllersDir = resolve(baseDir, 'src/server/controllers')
    const verifyPath = resolve(controllersDir, 'verify-email.controller.ts')
    if (!existsSync(verifyPath)) {
      writeFileSync(verifyPath, generateVerifyEmailController(), 'utf-8')
      console.log(`  ${colors.green('✅')} Controller ${colors.bold('VerifyEmailController')} created`)
    } else {
      console.log(`  ${colors.yellow('⚠')} Controller ${colors.bold('VerifyEmailController')} already exists — skipped`)
    }
  }

  // ── Admin ──
  if (opts.admin) {
    const middlewareDir = resolve(baseDir, 'src/server/middleware')
    const adminMiddlewarePath = resolve(middlewareDir, 'admin.middleware.ts')
    if (!existsSync(adminMiddlewarePath)) {
      writeFileSync(adminMiddlewarePath, generateAdminMiddleware(), 'utf-8')
      console.log(`  ${colors.green('✅')} Middleware ${colors.bold('admin')} created`)
    } else {
      console.log(`  ${colors.yellow('⚠')} Middleware ${colors.bold('admin')} already exists — skipped`)
    }

    const controllersDir = resolve(baseDir, 'src/server/controllers')
    const adminControllerPath = resolve(controllersDir, 'admin-user.controller.ts')
    if (!existsSync(adminControllerPath)) {
      writeFileSync(adminControllerPath, generateAdminController(), 'utf-8')
      console.log(`  ${colors.green('✅')} Controller ${colors.bold('AdminUserController')} created`)
    } else {
      console.log(`  ${colors.yellow('⚠')} Controller ${colors.bold('AdminUserController')} already exists — skipped`)
    }
  }

  // ── Routes ──
  const routesDir = resolve(baseDir, 'src/routes')
  mkdirSync(routesDir, { recursive: true })
  const routesPath = resolve(routesDir, 'auth.ts')
  writeFileSync(routesPath, generateAuthRoutes(opts), 'utf-8')
  console.log(`  ${colors.green('✅')} Auth routes created at ${colors.cyan('src/routes/auth.ts')}`)

  // ── Views (TSX) ──
  if (opts.views) {
    const viewsDir = resolve(baseDir, 'src/client/pages/auth')
    mkdirSync(viewsDir, { recursive: true })

    const loginViewPath = resolve(viewsDir, 'login.tsx')
    writeFileSync(loginViewPath, generateLoginView(), 'utf-8')
    console.log(`  ${colors.green('✅')} Login view created at ${colors.cyan('src/client/pages/auth/login.tsx')}`)

    const registerViewPath = resolve(viewsDir, 'register.tsx')
    writeFileSync(registerViewPath, generateRegisterView(), 'utf-8')
    console.log(`  ${colors.green('✅')} Register view created at ${colors.cyan('src/client/pages/auth/register.tsx')}`)
  }

  console.log()
  console.log(`  ${colors.bold('Auth scaffold complete!')}`)
  console.log()
  console.log(`  ${colors.dim('Next steps:')}`)
  console.log(`  ${colors.cyan('1.')} Import and register authRoutes in your app:`)
  console.log(`     ${colors.dim("import { authRoutes } from './routes/auth.js'")}`)
  console.log(`     ${colors.dim('authRoutes(app)')}`)
  console.log(`  ${colors.cyan('2.')} Run migrations: ${colors.bold('speexjs migrate')}`)
  console.log(`  ${colors.cyan('3.')} Protect routes by adding the auth middleware`)
  console.log(`     ${colors.dim("router.get('/dashboard', auth(), dashboardHandler)")}`)
  if (opts.oauth.length > 0) {
    console.log(`  ${colors.cyan('4.')} Set OAuth environment variables in .env:`)
    for (const p of opts.oauth) {
      console.log(`     ${colors.dim(`${p.toUpperCase()}_CLIENT_ID=...`)}`)
      console.log(`     ${colors.dim(`${p.toUpperCase()}_CLIENT_SECRET=...`)}`)
    }
  }
  console.log()
}
