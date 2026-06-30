# SpeexJS — Project Summary

## Current Version: v2.1.3

**Fullstack TypeScript Framework — Zero dependencies. 555+ features. PRD01-PRD05 100% aligned. PRD06 8/10 implemented. PRD07 Governance implemented. PRD08 Audit pipeline active.**

## Documentation
| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Quick start, features, CLI reference |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Source layout, request lifecycle, design decisions |
| [CHANGELOG.md](./CHANGELOG.md) | Version history and release notes |
| [ROADMAP.md](./ROADMAP.md) | Current and planned releases |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guidelines |
| [SECURITY.md](./SECURITY.md) | Security policies |
| [TESTING.md](./TESTING.md) | Testing guide |
| [PUBLISH.md](./PUBLISH.md) | Publishing instructions |
| [SUPPORT.md](./SUPPORT.md) | Support resources |

## PRD Documents
| Document | Description | Alignment |
|----------|-------------|-----------|
| [PRD01.md](./docs/PRD01.md) | Full Feature Taxonomy (222+ features) | ✅ 100% |
| [PRD02.md](./docs/PRD02.md) | No-Effort Framework (F1-F15) | ✅ 100% |
| [PRD03.md](./docs/PRD03.md) | Scale, Intelligence & Ecosystem (F16-F30) | ✅ 100% |
| [PRD04.md](./docs/PRD04.md) | Production Hardening (N1-N10) | ✅ 100% |
| [PRD05.md](./docs/PRD05.md) | v3.x Vision — ALL 10 FEATURES IMPLEMENTED | ✅ 100% |
| [PRD06.md](./docs/PRD06.md) | AI-Native Platform (8/10 features) | 🚧 F8-F9 pending |
| [PRD07.md](./docs/PRD07.md) | Documentation Integrity & Governance | ✅ Implemented |
| [PRD08.md](./docs/PRD08.md) | Red-Team Security Audit | 🚧 In pipeline |

## Guides
| Guide | Description |
|-------|-------------|
| [Getting Started](./docs/GUIDE_GETTING_STARTED.md) | Quick start guide |
| [CLI Reference](./docs/GUIDE_CLI.md) | CLI command documentation |
| [API Reference](./docs/GUIDE_API_REFERENCE.md) | API documentation |
| [Auth Guide](./docs/GUIDE_AUTH.md) | Authentication & authorization (incl. SSO v2.0) |
| [Database Guide](./docs/GUIDE_DATABASE.md) | Database ORM & query builder (incl. v2.0) |

## Stats
- **555+ features** across 20+ categories
- **~2,400 tests** (2,357 passing, 18 skipped) with 97.1% coverage
- **50+ CLI commands** (49 wired¹) — new: `ai:generate`, `ai:explain`, `ai:review`, `ai:test`, `ai:fix`, `tinker`, `make:webhook`, `migrate:status`, `generate`
- **56+ subpath exports**
- **0 TypeScript errors** (strict mode)
- **0 known bugs** (reported)
- **Zero runtime dependencies**
- **PRD08 security.txt** added
¹ "Wired" = command is registered in the CLI registry and has implementation. Non-wired commands are scaffolded but need full implementation.
