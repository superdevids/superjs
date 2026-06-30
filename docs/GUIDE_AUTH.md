# Authentication & Authorization Guide

SpeexJS provides a complete auth stack: **SessionGuard** (cookie-based), **TokenGuard** (bearer tokens), **Sanctum** (SPA token auth), **Socialite** (OAuth), **Gate** (authorization), and **RBAC** (role-based access control).

---

## AuthManager

Central auth orchestrator. Manages multiple guard instances and resolves the active guard.

```typescript
import { AuthManager, SessionGuard, TokenGuard } from 'speexjs/server/auth'

const auth = new AuthManager()

// Register guards
auth.guard('web', new SessionGuard({ ... }))
auth.guard('api', new TokenGuard({ ... }))
auth.defaultGuard('web')

// Access
const webGuard = auth.guard('web')     // Get by name
const defaultGuard = auth.guard()       // Get default

// Config
auth.setLoginPath('/login')
auth.getLoginPath()                     // '/login'
auth.hasGuard('web')                    // true
auth.removeGuard('old_guard')
```

---

## SessionGuard

Cookie-based authentication with **AES-256-GCM** encrypted session cookies.

### Configuration

```typescript
import { SessionGuard } from 'speexjs/server/auth'

const guard = new SessionGuard({
  cookieName: 'myapp_session',
  lifetime: 120,           // Session lifetime in minutes
  identifier: 'email',     // Field used for credential lookup
  password: 'password',    // Field name for password
  encryptionKey: process.env.APP_KEY,  // AES-256-GCM key
  provider: {
    findById: async (id) => db.table('users').find(id),
    findByCredential: async (field, value) => {
      return db.table('users').where(field, value).first()
    },
  },
})
```

### Session Context

SessionGuard needs access to request/response for cookie read/write:

```typescript
import { session } from 'speexjs'

// Middleware sets context automatically
app.use(session({ secret: process.env.APP_KEY }))

// Or set manually per-request:
app.get('/login', (ctx) => {
  guard.setContext(ctx.request, ctx.response)
  // Now guard can read/write cookies
})
```

### Methods

```typescript
await guard.setContext(req, res)              // Bind request/response
await guard.attempt({ email, password })       // Login with credentials → boolean
await guard.login(userId, remember?)           // Login by ID
await guard.loginUser(user)                    // Login with user object
await guard.logout()                           // Clear session
await guard.user()                             // Get authenticated user → AuthUser | null
await guard.check()                            // Is authenticated? → boolean
await guard.guest()                            // Is guest? → boolean
await guard.id()                               // Get user ID → string | number | null
await guard.set(key, value)                    // Store in session
await guard.get(key)                           // Read from session
```

### Example: Login Route

```typescript
app.post('/login', async (ctx) => {
  const { email, password } = await ctx.request.json()
  const guard = new SessionGuard({
    provider: userProvider,
  })
  guard.setContext(ctx.request, ctx.response)

  const success = await guard.attempt({ email, password })
  if (!success) {
    return ctx.response.status(401).json({ error: 'Invalid credentials' })
  }

  ctx.response.json({ user: await guard.user() })
})
```

### UserProvider Interface

```typescript
interface UserProvider {
  findById(id: string | number): Promise<AuthUser | null>
  findByCredential(field: string, value: string): Promise<AuthUser | null>
}

interface AuthUser {
  id: string | number
  [key: string]: unknown
}
```

---

## TokenGuard

Bearer token authentication with **HMAC-SHA256** token hashing.

### Configuration

```typescript
import { TokenGuard } from 'speexjs/server/auth'

const guard = new TokenGuard({
  tokenLength: 64,
  hashTokens: true,
  tokenName: 'api-token',
  secret: process.env.APP_KEY,  // HMAC signing key
  provider: {
    create: async (userId, tokenHash, name, abilities) => {
      await db.table('personal_access_tokens').insert({
        user_id: userId,
        token: tokenHash,
        name,
        abilities: JSON.stringify(abilities),
      })
    },
    find: async (tokenHash) => {
      const row = await db.table('personal_access_tokens')
        .where('token', tokenHash).first()
      if (!row) return null
      return {
        userId: row.user_id,
        abilities: JSON.parse(row.abilities || '[]'),
      }
    },
    delete: async (tokenHash) => {
      await db.table('personal_access_tokens')
        .where('token', tokenHash).delete()
    },
    deleteAllForUser: async (userId) => {
      await db.table('personal_access_tokens')
        .where('user_id', userId).delete()
    },
  },
  userLookup: {
    findById: async (id) => db.table('users').find(id),
  },
})
```

### Methods

```typescript
const token = await guard.createToken(userId, 'web-app', ['read', 'write'])
// Returns plaintext token (save this — it won't be stored in plaintext)

await guard.validate(token)          // boolean
await guard.user(token)              // AuthUser | null
await guard.abilities(token)         // string[]
await guard.can(token, 'write')      // boolean
await guard.revokeToken(token)
await guard.revokeAllTokens(userId)
```

### Auth Middleware (Bearer Token)

```typescript
// The auth middleware resolves the current user from the Authorization header
import { auth } from 'speexjs'

app.get('/api/user', auth('api'), async (ctx) => {
  const user = (ctx as any).user
  ctx.response.json({ data: user })
})
```

---

## Sanctum

Simple SPA token authentication with HMAC-SHA256 hashing. Designed for first-party single-page applications using CSRF protection.

```typescript
import { Sanctum } from 'speexjs/server/auth'

const sanctum = new Sanctum(process.env.APP_KEY)

// Create token
const token = sanctum.createToken('user-1', ['*'], 86400000)
// Format: spx_<random_hex>

// Verify
const record = sanctum.verifyToken(token)
if (record) {
  console.log(record.userId, record.abilities)
}

// Check ability
const can = sanctum.can(token, 'posts:create')

// Revoke
sanctum.revokeToken(token)

// Refresh
const newToken = sanctum.refreshToken(token)

// CSRF token
const csrf = sanctum.generateCsrfToken()
```

---

## Socialite

OAuth2 authentication with built-in **GitHub** and **Google** providers.

### Setup

```typescript
import { Socialite } from 'speexjs/server/auth'

const socialite = new Socialite()

// Register GitHub
socialite.registerGitHub(
  process.env.GITHUB_CLIENT_ID!,
  process.env.GITHUB_CLIENT_SECRET!,
  'http://localhost:3000/auth/github/callback',
)

// Register Google
socialite.registerGoogle(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  'http://localhost:3000/auth/google/callback',
)
```

### Routes

```typescript
// Redirect to provider
app.get('/auth/github', (ctx) => {
  const state = socialite.generateState()
  const provider = socialite.provider('github')
  ctx.response.redirect(provider.authorizeUrl(state))
})

// Handle callback
app.get('/auth/github/callback', async (ctx) => {
  const code = ctx.query.code as string
  const state = ctx.query.state as string

  if (!socialite.validateState(state)) {
    return ctx.response.status(400).json({ error: 'Invalid state' })
  }

  const provider = socialite.provider('github')
  const tokens = await provider.exchangeCode(code)
  const githubUser = await provider.getUser(tokens.accessToken)

  // Find or create local user
  let user = await db.table('users').where('github_id', githubUser.id).first()
  if (!user) {
    const id = await db.table('users').insert({
      github_id: githubUser.id,
      name: githubUser.name,
      email: githubUser.email,
      avatar: githubUser.avatar,
    })
    user = await db.table('users').find(id)
  }

  // Login the user
  const guard = new SessionGuard({ provider: userProvider })
  guard.setContext(ctx.request, ctx.response)
  await guard.login(user.id)

  ctx.response.redirect('/dashboard')
})
```

### Custom OAuth2 Provider

```typescript
import { OAuth2Client } from 'speexjs/server/auth'

const client = new OAuth2Client()
client.register('gitlab', {
  authorizeUrl: (state) => `https://gitlab.com/oauth/authorize?state=${state}`,
  exchangeCode: async (code) => {
    const res = await fetch('https://gitlab.com/oauth/token', { ... })
    return res.json()
  },
  getUser: async (token) => {
    const res = await fetch('https://gitlab.com/api/v4/user', { ... })
    return res.json()
  },
})
```

---

## Gate (Authorization)

Policy-based authorization with ability checks, before/after hooks.

```typescript
import { Gate, authorize } from 'speexjs/server/gate'

const gate = new Gate()

// Define abilities
gate.define('update-post', async (user, post) => {
  return user.id === post.user_id
})

gate.define('delete-post', async (user, post) => {
  const isOwner = user.id === post.user_id
  const isAdmin = user.role === 'admin'
  return isOwner || isAdmin
})
```

### Policy Classes

```typescript
gate.policy('posts', {
  view: async (user, post) => true,
  create: async (user) => user.is_active,
  update: async (user, post) => user.id === post.user_id,
  delete: async (user, post) => user.id === post.user_id || user.role === 'admin',
})
```

### Checking Authorization

```typescript
const allowed = await gate.allows('update-post', currentUser, post)
const denied = await gate.denies('delete-post', currentUser, post)

// Require authorization (throws AuthorizationError)
await gate.authorize('update-post', currentUser, post)

// Check multiple
const canAny = await gate.any(['view-post', 'view-draft'], user, post)
const canAll = await gate.all(['view-post', 'edit-post'], user, post)

// Get all abilities for a user
const abilities = await gate.abilitiesFor(user)
```

### Before / After Hooks

```typescript
// Before — grants all if returns true, denies all if false, skips if null
gate.before((user, ability) => {
  if (user.role === 'super-admin') return true  // Bypass all checks
  if (user.is_banned) return false               // Deny everything
  return null                                     // Normal check
})

// After — audit log
gate.after((user, ability, result) => {
  console.log(`[AUDIT] User ${user.id} ${ability}: ${result}`)
})
```

### Gate Middleware

```typescript
import { authorize } from 'speexjs/server/gate'

// Protect a route
app.post('/posts/:id', authorize('update-post', async (ctx) => {
  const post = await Post.find(ctx.params.id)
  return post
}), async (ctx) => {
  // ... create post
})
```

---

## RBAC (Role-Based Access Control)

Role-based permission checking with caching and middleware.

```typescript
import {
  hasPermission,
  hasRole,
  requirePermission,
  requireRole,
  setRBACProvider,
  flattenPermissions,
  canAccessResource,
} from 'speexjs/server/rbac'
```

### Role & Permission Types

```typescript
interface Role {
  id: string
  name: string
  label: string
  description: string | null
  isSystem: boolean
  permissions: Permission[]
  createdAt: Date
  updatedAt: Date
}

interface RBACUser {
  id: string
  roles: string[]
  permissions: string[]
}

interface CheckOptions {
  requireAll?: boolean
}
```

### Provider Setup

```typescript
import { setRBACProvider } from 'speexjs/server/rbac'

setRBACProvider({
  getUserPermissions: (ctx) => {
    const user = (ctx as any).user
    return user?.permissions ?? []
  },
  getUserRoles: (ctx) => {
    const user = (ctx as any).user
    return user?.roles ?? []
  },
})
```

### Helper Functions

```typescript
const userPermissions = ['users:read', 'users:write', 'posts:read']

hasPermission(userPermissions, 'users:read')             // true
hasPermission(userPermissions, ['users:read', 'users:delete'], { requireAll: true }) // false (no delete)
flattenPermissions(roles)                                 // all unique permissions across roles
canAccessResource(userPermissions, 'posts:edit', post.user_id, currentUser.id) // own or perm
```

### RBAC Middleware

```typescript
import { requirePermission, requireRole } from 'speexjs/server/rbac'

app.get('/admin/users', requirePermission('users:read'), listUsers)
app.post('/admin/users', requirePermission('users:write'), createUser)
app.delete('/admin/users/:id', requirePermission('users:delete'), deleteUser)

app.get('/admin/reports', requireRole('admin'), reports)
app.get('/moderator', requireRole(['admin', 'moderator']), moderate)
```

### RBAC Cache

```typescript
import { invalidateUserCache, invalidateAllCache } from 'speexjs/server/rbac'

// Invalidate when roles/permissions change
await invalidateUserCache('user-123')
await invalidateAllCache()
```

---

## Auth Middleware

### protectRoute()

```typescript
import { auth } from 'speexjs'

// Require authentication
app.get('/dashboard', auth(), dashboardHandler)

// Specific guard
app.get('/api/data', auth('api'), apiHandler)
```

### guestMiddleware

```typescript
import { guestMiddleware } from 'speexjs/server/auth'

// Only allow guests (redirects authenticated users)
app.get('/login', guestMiddleware(), loginPage)
app.get('/register', guestMiddleware(), registerPage)
```

---

## Additional Security Features

### Password Verification

```typescript
import { hashPassword, verifyPassword } from 'speexjs/native/hashing'

const hashed = hashPassword('user-password')
const match = verifyPassword('user-password', hashed) // true
```

### TOTP / 2FA

```typescript
// Time-based One-Time Password support
// Available in speexjs/server/auth
```

### Email Verification

```typescript
// Built-in email verification flow
// Generates signed URLs, resend support
```

### Password Confirmation

```typescript
// Require password re-entry for sensitive actions
// Time-limited confirmation sessions
```

### Account Lockout

```typescript
// Configurable lockout after failed attempts
// Automatic unlock after timeout
```

---

## SAML 2.0 SSO

Configure SAML2 identity provider authentication via `SamlGuard`.

### Setup

```typescript
import { SamlGuard } from 'speexjs/server/auth/saml-guard'

const samlGuard = new SamlGuard({
  entryPoint: 'https://idp.example.com/sso',
  issuer: 'https://myapp.com',
  certificate: fs.readFileSync('idp.crt', 'utf-8'),
  provider: {
    findById: async (id) => User.find(id),
    findByCredential: async (field, value) =>
      User.where(field, value).first(),
  },
})
```

### Routes

```typescript
// Redirect to IdP
app.get('/auth/saml2/login', async (ctx) => {
  const url = await samlGuard.generateLoginUrl()
  ctx.response.redirect(url)
})

// Handle ACS callback
app.post('/auth/saml2/callback', async (ctx) => {
  const body = await ctx.request.formData()
  const user = await samlGuard.handleCallback(body.SAMLResponse)
  await guard.login(user.id)
  ctx.response.redirect('/dashboard')
})
```

**Required environment variables:**

| Variable | Description |
|---|---|
| `SAML_ENTRY_POINT` | IdP SSO URL |
| `SAML_ISSUER` | Your application entity ID |
| `SAML_CERT_PATH` | Path to IdP X.509 certificate |

---

## OpenID Connect

Configure OIDC authentication via `OidcGuard` with Google, Microsoft, Okta, or any compliant provider.

### Setup

```typescript
import { OidcGuard } from 'speexjs/server/auth/oidc-guard'

const oidcGuard = new OidcGuard({
  issuer: 'https://accounts.google.com',
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: 'http://localhost:3000/auth/callback',
  provider: userProvider,
})
```

### Routes

```typescript
// Redirect to provider
app.get('/auth/oidc/login', async (ctx) => {
  const url = await oidcGuard.generateAuthUrl({ scope: 'openid profile email' })
  ctx.response.redirect(url)
})

// Handle callback
app.get('/auth/oidc/callback', async (ctx) => {
  const code = ctx.query.code as string
  const user = await oidcGuard.handleCallback(code)
  await guard.login(user.id)
  ctx.response.redirect('/dashboard')
})
```

### Provider-Specific Configuration

```typescript
// Microsoft
new OidcGuard({
  issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
  clientId: process.env.MS_CLIENT_ID,
  clientSecret: process.env.MS_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/auth/callback',
})

// Okta
new OidcGuard({
  issuer: 'https://{domain}.okta.com',
  clientId: process.env.OKTA_CLIENT_ID,
  clientSecret: process.env.OKTA_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/auth/callback',
})
```

**Required environment variables:**

| Variable | Description |
|---|---|
| `OIDC_ISSUER` | OpenID Connect issuer URL |
| `OIDC_CLIENT_ID` | Client ID from provider |
| `OIDC_CLIENT_SECRET` | Client secret from provider |
| `OIDC_REDIRECT_URI` | Callback URL |

---

## Magic Link (Passwordless)

Implement passwordless login via email magic links using `MagicLinkAuth`.

### Setup

```typescript
import { MagicLinkAuth } from 'speexjs/server/auth/magic-link'

const magicLink = new MagicLinkAuth({
  secret: process.env.APP_KEY!,
  expiresIn: 900, // 15 minutes
  provider: userProvider,
})
```

### Request Magic Link

```typescript
app.post('/auth/magic-link', async (ctx) => {
  const { email } = await ctx.request.json()

  const user = await User.where('email', email).first()
  if (!user) {
    return ctx.response.status(404).json({ error: 'User not found' })
  }

  const token = await magicLink.generateToken(user.id)

  // Send email with link: /auth/magic-link/verify?token=${token}
  await sendEmail(email, 'Your login link', `/auth/magic-link/verify?token=${token}`)

  ctx.response.json({ message: 'Check your email for the login link' })
})
```

### Verify Token

```typescript
app.get('/auth/magic-link/verify', async (ctx) => {
  const token = ctx.query.token as string

  try {
    const userId = await magicLink.consumeToken(token)
    await guard.login(userId)
    ctx.response.redirect('/dashboard')
  } catch (err) {
    ctx.response.status(400).json({ error: 'Invalid or expired token' })
  }
})
```

---

## WebAuthn / Passkeys

Register and authenticate using platform biometrics (Touch ID, Windows Hello, Face ID) via `WebAuthn`.

### Setup

```typescript
import { WebAuthn } from 'speexjs/server/auth/webauthn'

const webauthn = new WebAuthn({
  rpName: 'My App',
  rpId: 'localhost', // Use your domain in production
  provider: userProvider,
})
```

### Registration

```typescript
// Start registration
app.post('/auth/webauthn/register/begin', auth(), async (ctx) => {
  const user = (ctx as any).user
  const options = await webauthn.beginRegistration(user.id)
  ctx.response.json(options) // Pass to navigator.credentials.create()
})

// Complete registration
app.post('/auth/webauthn/register/complete', auth(), async (ctx) => {
  const user = (ctx as any).user
  const credential = await ctx.request.json()
  const verified = await webauthn.completeRegistration(user.id, credential)
  ctx.response.json({ verified })
})
```

### Authentication

```typescript
// Start login
app.post('/auth/webauthn/login/begin', async (ctx) => {
  const { email } = await ctx.request.json()
  const user = await User.where('email', email).first()
  if (!user) return ctx.response.status(404).json({ error: 'User not found' })

  const options = await webauthn.beginAuthentication(user.id)
  ctx.response.json(options) // Pass to navigator.credentials.get()
})

// Complete login
app.post('/auth/webauthn/login/complete', async (ctx) => {
  const assertion = await ctx.request.json()
  const user = await webauthn.completeAuthentication(assertion)
  await guard.login(user.id)
  ctx.response.json({ user })
})
```

---

## Session Management

List, inspect, and revoke active user sessions using `SessionManager`.

### Setup

```typescript
import { SessionManager } from 'speexjs/server/auth/session-manager'

const sessions = new SessionManager({
  store: db, // Uses the database connection
})
```

### List Sessions

```typescript
app.get('/auth/sessions', auth(), async (ctx) => {
  const user = (ctx as any).user
  const userSessions = await sessions.listForUser(user.id)

  ctx.response.json({
    data: userSessions.map(s => ({
      id: s.id,
      ip: s.ip_address,
      userAgent: s.user_agent,
      lastActive: s.last_active_at,
      isCurrent: s.id === ctx.request.cookie('session_id'),
    })),
  })
})
```

### Revoke Sessions

```typescript
// Revoke a single session
app.delete('/auth/sessions/:id', auth(), async (ctx) => {
  await sessions.revoke(ctx.params.id)
  ctx.response.json({ revoked: true })
})

// Revoke all other sessions
app.post('/auth/sessions/revoke-others', auth(), async (ctx) => {
  const currentSessionId = ctx.request.cookie('session_id')
  const user = (ctx as any).user
  const allSessions = await sessions.listForUser(user.id)

  for (const session of allSessions) {
    if (session.id !== currentSessionId) {
      await sessions.revoke(session.id)
    }
  }

  ctx.response.json({ revoked: true })
})

// Revoke all sessions (forces re-login)
app.post('/auth/sessions/revoke-all', auth(), async (ctx) => {
  const user = (ctx as any).user
  await sessions.revokeAllForUser(user.id)
  await guard.logout()
  ctx.response.json({ message: 'All sessions revoked' })
})
```

---

## Full Auth Example

```typescript
import {
  speexjs,
  session,
  cors,
  SessionGuard,
  AuthManager,
  Gate,
  setRBACProvider,
  requirePermission,
} from 'speexjs'

async function bootstrap() {
  const app = speexjs()
  const db = new DatabaseConnection({ driver: 'sqlite', database: 'app.sqlite' })
  await db.connect()
  app.container.instance('db', db)

  // Global middleware
  app.use(cors({ credentials: true }))
  app.use(session({ secret: process.env.APP_KEY! }))

  // Auth setup
  const auth = new AuthManager()
  const guard = new SessionGuard({
    encryptionKey: process.env.APP_KEY!,
    provider: {
      findById: async (id) => db.table('users').find(id),
      findByCredential: async (field, value) =>
        db.table('users').where(field, value).first(),
    },
  })
  auth.guard('web', guard)
  auth.defaultGuard('web')
  app.container.instance('auth', auth)

  // Gate setup
  const gate = new Gate()
  gate.define('manage-users', (user) => user.role === 'admin')
  gate.define('view-reports', (user) => ['admin', 'analyst'].includes(user.role))
  app.container.instance('gate', gate)

  // RBAC provider
  setRBACProvider({
    getUserPermissions: (ctx) => {
      const user = (ctx as any).user
      return user?.permissions ?? []
    },
    getUserRoles: (ctx) => {
      const user = (ctx as any).user
      return user?.roles ?? []
    },
  })

  // Routes
  app.post('/login', async (ctx) => {
    const { email, password } = await ctx.request.json()
    guard.setContext(ctx.request, ctx.response)
    const ok = await guard.attempt({ email, password })
    if (!ok) return ctx.response.status(401).json({ error: 'Invalid credentials' })
    ctx.response.json({ user: await guard.user() })
  })

  app.post('/logout', auth(), async (ctx) => {
    guard.setContext(ctx.request, ctx.response)
    await guard.logout()
    ctx.response.json({ ok: true })
  })

  app.get('/me', auth(), async (ctx) => {
    ctx.response.json({ user: (ctx as any).user })
  })

  app.get('/admin/users', auth(), requirePermission('users:read'), async (ctx) => {
    const users = await db.table('users').get()
    ctx.response.json({ data: users })
  })

  app.listen(3000)
}
```
