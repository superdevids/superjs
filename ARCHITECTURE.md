# Architecture — SpeexJS Monorepo

> **Last Updated:** 2026-06-29 · **Monorepo Version:** 0.8.2

---

## Table of Contents

1. [Monorepo Overview](#1-monorepo-overview)
2. [Package Relationships](#2-package-relationships)
3. [Shared Tooling](#3-shared-tooling)
4. [Development Workflow](#4-development-workflow)
5. [CI/CD Pipeline](#5-cicd-pipeline)

---

## 1. Monorepo Overview

```
speexjs/                          ← pnpm workspace root
├── packages/                     ← Published npm packages
│   ├── speexjs/                  → Fullstack web framework
│   │   └── ARCHITECTURE.md       → Detailed architecture
│   └── speexkit/                 → Zero-dep utility toolkit
│       └── ARCHITECTURE.md       → Detailed architecture
├── extensions/                   → Editor extensions
│   └── speexray/         → VS Code dependency scanner
├── .github/                      → CI/CD, issue templates
├── *.md                          → Root documentation
└── pnpm-workspace.yaml           → Workspace definition
```

Both packages are **independently versioned** and share only tooling configuration. Neither depends on the other at runtime.

---

## 2. Package Relationships

```
                    ┌─────────────────────┐
                    │   speexjs-monorepo   │
                    │   (pnpm workspace)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │   speexjs    │  │   speexkit   │  │vscode-dep-   │
     │  Web FW      │  │  Toolkit     │  │exray (VSCODE)│
     │  v1.6.1      │  │  v1.4.12     │  │  v0.1.0      │
     │  300+ ft     │  │  400+ fns    │  │  Dependency  │
     │  1990 tests  │  │  1477 tests  │  │  Scanner UI  │
     └──────┬───────┘  └──────────────┘  └──────────────┘
            │
            │ (dev dependency: tsx)
            ▼
     ┌──────────────┐
     │   Node.js    │
     │  (≥ 18.0.0)  │
     └──────────────┘
```

**Key principle:** Each package is fully independent. They share only:
- **Biome** config (linting + formatting)
- **TypeScript** base config (`tsconfig.base.json`)
- **pnpm** workspace management

---

## 3. Shared Tooling

| Tool | Config | Purpose | Package |
|------|--------|---------|---------|
| **pnpm** | `pnpm-workspace.yaml` | Workspace management | Root |
| **TypeScript** | `tsconfig.base.json` | Strict base config | Root |
| **Biome** | `biome.json` | Lint + format (2 spaces, single quotes) | Root |
| **tsup** | `tsup.config.ts` | Build bundler (esbuild) | Per package |
| **Vitest** | `vitest.config.ts` | Test runner | Per package |

### Version Alignment

Packages evolve independently:

| Package | Version | Status | Tests | CI |
|---------|---------|--------|-------|----|
| speexjs | 1.6.1 | ✅ Production | 1,990 | ✅ |
| speexkit | 1.4.12 | ✅ Production | 1,477 | ✅ |
| speexray | 0.1.0 | ⚠️ Alpha | — | — |

---

## 4. Development Workflow

```bash
# Clone & install
git clone https://github.com/superdevids/speexjs.git
cd speexjs
pnpm install

# Work on speexjs
cd packages/speexjs
npm run build          # Build
npm test               # Run tests
npm run dev            # Watch mode

# Work on speexkit
cd packages/speexkit
npm run build
npm test
npm run dev            # Watch mode

# Full monorepo commands (from root)
pnpm -r build          # Build all packages
pnpm -r test           # Test all packages
```

---

## 5. CI/CD Pipeline

```
                    .github/workflows/
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      speexjs CI                  speexkit CI
    ┌──────────────┐          ┌──────────────┐
    │ npm install   │          │ npm install   │
    │ npm run lint  │          │ npm run lint  │
    │ npm run build │          │ npm run build │
    │ npm test      │          │ npm test      │
    │ npm run bench │          │              │
    └──────┬───────┘          └──────┬───────┘
           │                         │
           └──────────┬──────────────┘
                      ▼
             GitHub Actions
             (matrix: ubuntu, windows, macos)
```

---

## Package Architecture Details

For in-depth architecture documentation of each package:

| Package | Architecture Doc | Focus |
|---------|-----------------|-------|
| **speexjs** | [`packages/speexjs/ARCHITECTURE.md`](./packages/speexjs/ARCHITECTURE.md) | Module map, request lifecycle, server engine, routing, middleware, database ORM, auth, schema, client-side VDOM/signals, CLI, build config, testing strategy, ADRs |
| **speexkit** | [`packages/speexkit/ARCHITECTURE.md`](./packages/speexkit/ARCHITECTURE.md) | All 19 modules, NDArray internals, ML module design, dep-exray CLI, module independence principle, bundle optimization, ADRs |
