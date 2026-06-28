# superjs-core

> **Zero-dependency JavaScript toolkit — Standard Library + Dependency Scanner + 🇮🇩 Indonesia Validation**

```bash
npm install superjs-core
```

Satu package untuk semua kebutuhan JavaScript: utility functions, async helpers, crypto, path manipulation, typed errors, structured logging, **plus** dependency health scanner dan validasi data Indonesia (NIK, NPWP, Phone).

---

## Modules Overview

| Module | Fungsi Unggulan |
|--------|----------------|
| **core** | deepClone, deepMerge, debounce, throttle, memoize, retry, once |
| **math** | add/sub/mul/div (safe), median, stddev, percentile, correlation, formatCurrency |
| **date** | formatDate, parseDate, timeAgo, Duration, timezone helpers (WIB/WITA/WIT) |
| **collection** | sortBy, groupBy, shuffle, topoSort, slidingWindows, chunk |
| **string** | camelCase, uuid, nanoid, slugify, levenshtein, terbilang, formatRupiah, maskString |
| **async** | sleep, parallelMap, Queue, Semaphore, memoizeAsync, retryAsync |
| **io** | parseCsv, stringifyCsv, safeJsonParse, env, envInt, envBool |
| **type** | 20+ type guards (isString, isNil, assertDefined, getType) |
| **crypto** | hash, base64, generateToken, generateOTP, constantTimeEqual |
| **path** | join, resolve, basename, dirname, extname, normalize |
| **validation** | isNIK, isNPWP, isPhone("id"), isEmail, isURL |
| **error** | createError (typed + HTTP status), TypedError, MultiError |
| **logger** | Logger class, child loggers, console/JSON/file transports |
| **dep-exray** | scanProject, generateReport, analyzeUsage, CLI: `npx dep-exray .` |

---

## Contoh Cepat

```typescript
import { deepClone, debounce } from "superjs-core"
import { formatDate, timeAgo } from "superjs-core/date"
import { groupBy, topoSort } from "superjs-core/collection"
import { sleep, parallelMap, Queue } from "superjs-core/async"
import { uuid, maskString, terbilang, formatRupiah } from "superjs-core/string"
import { generateToken } from "superjs-core/crypto"
import { isNIK, isNPWP, isPhone } from "superjs-core/validation"
import { createError, MultiError } from "superjs-core/error"
import { Logger } from "superjs-core/logger"
import { median, stddev, formatCurrency } from "superjs-core/math"
import { scanProject } from "superjs-core/dep-exray"

// Deep clone dengan circular reference
const cloned = deepClone({ a: 1, b: { c: new Date() } })

// Safe math (0.1 + 0.2 = 0.3)
console.log(add(0.1, 0.2)) // 0.3

// Date formatting
console.log(formatDate(new Date(), "DD/MM/YYYY")) // "28/06/2026"
console.log(timeAgo(new Date(Date.now() - 5000))) // "5 detik yang lalu"

// Priority queue
const queue = new Queue({ concurrency: 2 })
await queue.add(() => fetch("/api/data"))

// Validation Indonesia
isNIK("3201010203940001") // true
isNPWP("12.345.678.9-012.344") // true
isPhone("08123456789") // true

// Indonesian locale
terbilang(1500000) // "satu juta lima ratus ribu"
formatRupiah(1500000) // "Rp1.500.000"
maskString("08123456789") // "081*****789"

// Statistics
median([1, 2, 3, 4, 5]) // 3
percentile([1, 2, 3, 4, 5], 90) // 4.6
formatCurrency(1500000, { locale: "id-ID", currency: "IDR" }) // "Rp 1.500.000"

// Typed errors
throw createError("VALIDATION_ERROR", "Email required", { details: { field: "email" } })

// Logger
const log = new Logger({ level: "info", name: "app" })
log.info("Server started", { port: 3000 })

// Dependency scanning
const report = await scanProject({ path: "./my-project" })
console.log(report.totalEstimatedSize)

---

## dep-exray — Dependency Health Scanner (built-in)

**Scan project untuk nemuin dependency bloated, gak kepake, atau punya CVE.**

```bash
npx dep-exray .
npx dep-exray /path/to/project --json --verbose
```

### Features
- Deteksi replacement: lodash → superjs-core, moment → superjs-core/date, uuid → native crypto.randomUUID()
- Estimasi ukuran dependency dalam MB/KB
- CVE detection dari known database
- JSON output untuk CI/CD integration
- Usage analyzer — deteksi apakah dependency beneran dipake

---

## Quick Start

```bash
git clone <repo-url> superjs
cd superjs/packages/core
npm install
npx tsup           # Build
npx vitest run     # Test (757 tests)
npx dep-exray .    # Scan project
```

---

## Test Stats

| File | Tests |
|------|-------|
| 17 test files | **757** passing |

---

## Project Structure

```
packages/core/
├── src/
│   ├── core/          # deepClone, debounce, retry, once
│   ├── math/          # add, median, stddev, formatCurrency
│   ├── date/          # formatDate, timeAgo, Duration, timezone
│   ├── collection/    # groupBy, topoSort, slidingWindows
│   ├── string/        # camelCase, terbilang, formatRupiah
│   ├── async/         # sleep, Queue, Semaphore, memoizeAsync
│   ├── io/            # parseCsv, safeJsonParse, env
│   ├── type/          # 20+ type guards
│   ├── crypto/        # hash, generateToken, base64
│   ├── path/          # join, resolve, basename
│   ├── validation/    # isNIK, isNPWP, isPhone, isEmail, isURL
│   ├── error/         # createError, TypedError, MultiError
│   ├── logger/        # Logger, transports
│   └── dep-exray/     # Dependency scanner
├── tests/             # 757 tests
├── dist/              # Built output
├── tsup.config.ts
├── vitest.config.ts
├── biome.json
└── package.json
```

---

## Roadmap

Lihat [ROADMAP.md](./ROADMAP.md) untuk detail lengkap.

### Priority
- **P0 ✅** validation, error, logger modules
- **P1 ✅** async (Queue, Semaphore), math (stats), string (terbilang), collection (topoSort), date (timeAgo)
- **P2** core (pipe/compose, Result type), signal module, crypto (AES-GCM)
- **P3** ml, color modules

---

## License

MIT
