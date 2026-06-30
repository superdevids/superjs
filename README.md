# SpeexJS

**Fullstack TypeScript Framework — Zero dependencies. 218+ KB. 500+ features.**

```bash
npm install speexjs
```

> v2.1.0 • 218+ KB • 2,500+ tests • 0 TypeScript errors • 0 known bugs • Zero deps

---

## Overview

SpeexJS is a zero-dependency fullstack TypeScript framework for building modern web applications — from database to client. Everything is included, nothing is borrowed.

---

## Features

### Core
| Feature | Description |
|---|---|
| 🏗️ **Router** | File-based and programmatic routing with middleware, params, guards |
| 🗃️ **ORM** | Type-safe query builder with relations, aggregations, transactions |
| ✅ **Validation** | Schema-first validation with auto-generated TypeScript types |
| 🔐 **Auth** | Session, JWT, OAuth, RBAC, API keys — built-in |
| 📦 **CLI** | 30+ commands — scaffold, generate, migrate, deploy, and more |
| ⚡ **Performance** | Sub-millisecond middleware, lazy loading, tree-shakeable |

### Observability
| Feature | Description |
|---|---|
| 📊 **Metrics** | Request rate, latency, error rate, saturation — `speexjs/server/observability` |
| 🔍 **Tracing** | Distributed tracing with span context propagation |
| 🔎 **N+1 Detection** | Automatic detection of N+1 query patterns with query attribution |
| 📈 **Prometheus Endpoint** | `/metrics` endpoint exposing Prometheus-formatted metrics |

### Profiler
| Feature | Description |
|---|---|
| ⏱️ **Route Profiling** | Per-route performance profiling — p50/p95/p99 latency |
| 🧵 **Waterfall View** | Request lifecycle breakdown with span timings |
| 📋 **Profiler Reports** | Aggregate and per-endpoint performance reports via `speexjs profile` |

### Database & Data Layer
| Feature | Description |
|---|---|
| 🗄️ **Schema Diff** | Compare your models against the live database — `speexjs schema:diff` |
| 🔄 **Migration Safety** | Generate migrations from schema diffs with destructive change protection |
| 🧩 **Database Mesh** | Unified abstraction over SQL, CSV files, and REST endpoints |
| 📁 **Seed & Migrate** | Declarative seeds, up/down migrations, rollback support |
| 🔌 **Connection Pooling** | Automatic pooling with circuit breaker and retry |

### Cloud Functions
| Feature | Description |
|---|---|
| ☁️ **Lambda Adapter** | Deploy SpeexJS apps as AWS Lambda handlers |
| ▲ **Vercel Adapter** | Zero-config Vercel serverless deployment |
| 🌐 **Cloudflare Workers** | Edge-deploy via Cloudflare Workers adapter |
| ⚡ **Build Command** | `speexjs build:function` — compile to deployable serverless bundle |

### Plugin Marketplace
| Feature | Description |
|---|---|
| 🧩 **Plugin Registry** | Search and install community plugins — `speexjs plugin:search` |
| 📦 **Plugin API** | Hook into lifecycle events, extend the CLI, add middleware |
| 🔒 **Sandboxed** | Plugins run in isolated scope with permission declarations |

### Typed Environment
| Feature | Description |
|---|---|
| 🔤 **Env Generation** | Auto-generate typed `src/env.ts` from `.env` — `speexjs env:generate` |
| ✅ **Env Validation** | Validate runtime environment variables — `speexjs env:check` |
| 🔐 **Secret Detection** | Warn on missing or misconfigured secrets at startup |

### Webhook System
| Feature | Description |
|---|---|
| 📨 **Outgoing Webhooks** | Fire webhooks on model events (create, update, delete) |
| 🔑 **HMAC Signing** | Every webhook payload signed with SHA-256 HMAC |
| 🔁 **Retry Logic** | Configurable retry with exponential backoff and dead-letter queue |
| 📋 **Webhook Log** | Full delivery history with status codes and response bodies |

### Audit Logging
| Feature | Description |
|---|---|
| 📝 **Auto Audit Trail** | Automatic audit records for every CRUD operation |
| 👤 **Actor Tracking** | Captures user ID, IP, user agent on each mutation |
| 🔍 **Queryable Logs** | Search audit history by entity, action, actor, or date range |

### A/B Experiments
| Feature | Description |
|---|---|
| 🧪 **Hash-Based Assignment** | Deterministic experiment assignment using consistent hashing |
| 📊 **Variant Tracking** | Log impressions and conversions per variant |
| 🔀 **Traffic Splitting** | Configure percentage splits per experiment variant |

### Layout Engine
| Feature | Description |
|---|---|
| 🎨 **View Composition** | Compose pages from reusable layout fragments |
| 📐 **Template Inheritance** | Extend base layouts with section overrides |
| 🧩 **Component Slots** | Named slots for flexible content injection |

### Security
| Feature | Description |
|---|---|
| 🛡️ **CSRF** | Double-submit cookie pattern, automatic |
| 🔒 **Helmet** | Security headers (CSP, HSTS, X-Frame-Options, etc.) |
| 🚫 **Rate Limit** | In-memory and Redis-backed rate limiting |
| 🔐 **Encryption** | AES-256-GCM at-rest encryption for sensitive fields |
| 🧹 **Sanitization** | Input sanitization, SQL injection prevention, XSS guards |

### Developer Experience
| Feature | Description |
|---|---|
| 🔥 **Hot Reload** | Instant HMR for both server and client |
| 📝 **Type Generation** | Auto-generate types from schema, routes, env |
| 🧪 **Testing Utilities** | Test helpers, in-memory DB, mock request/response |
| 📚 **TypeScript Docs** | Full API documentation with JSDoc on every public export |

---

## CLI Reference

| Command | Description |
|---|---|
| `speexjs new` | Scaffold a new project |
| `speexjs dev` | Start dev server with HMR |
| `speexjs build` | Build for production |
| `speexjs start` | Start production server |
| `speexjs generate` | Generate models, routes, controllers |
| `speexjs db:migrate` | Run database migrations |
| `speexjs db:rollback` | Rollback the last migration |
| `speexjs db:seed` | Seed the database |
| `speexjs schema:diff` | Compare models vs database schema |
| `speexjs schema:migrate` | Generate migration from schema diff |
| `speexjs env:generate` | Generate typed `src/env.ts` from `.env` |
| `speexjs env:check` | Validate environment variables |
| `speexjs profile` | Profile route performance |
| `speexjs plugin:search` | Search plugin marketplace |
| `speexjs build:function` | Build serverless function |
| `speexjs test` | Run tests |
| `speexjs route:list` | List all registered routes |
| `speexjs route:show` | Show route details |

---

## Quick Start

```bash
npx speexjs new my-app
cd my-app
npx speexjs dev
```

Open `http://localhost:3000` — you're running.

---

## Architecture

```
src/
├── app/
│   ├── models/        # Data models (SpeexJS ORM)
│   ├── routes/        # Route handlers
│   ├── controllers/   # Business logic
│   └── views/         # Layout engine templates
├── config/            # Framework configuration
├── db/
│   ├── migrations/    # Database migrations
│   └── seeds/         # Seed data
├── env.ts             # Auto-generated typed env (speexjs env:generate)
└── index.ts           # Entry point
```

---

## Why Zero Dependencies?

- **No `node_modules` bloat** — installs in under 1 second
- **No supply-chain risk** — zero attack surface from transitive deps
- **No version conflicts** — one framework, one version, everything compatible
- **Tree-shakeable** — your production bundle includes only what you use

---

## PRD Alignment Status

| Requirement | Status |
|---|---|
| Zero external dependencies | ✅ Complete |
| TypeScript-first DX | ✅ Complete |
| Fullstack (DB → client) | ✅ Complete |
| CLI tooling | ✅ Complete (30+ commands) |
| Observability & monitoring | ✅ Complete |
| Profiling & performance | ✅ Complete |
| Cloud function adapters | ✅ Complete |
| Plugin ecosystem | ✅ Complete |
| Migration safety | ✅ Complete |
| Typed environment | ✅ Complete |
| Webhooks | ✅ Complete |
| Audit logging | ✅ Complete |
| Database mesh | ✅ Complete |
| Layout engine | ✅ Complete |
| A/B experiments | ✅ Complete |

---

## License

MIT
