# Changelog

## [0.3.6] - 2026-06-28

### Changed
- 757 total tests (from 484) — added brutal audit suite with 273 edge-case tests
- SUMMARY.md created — full feature documentation for all 16 modules

### Fixed
- 6 bugs found during brutal audit (test expectations, imports, edge cases)
- All prototype pollution, ReDoS, crypto tests verified

## [0.3.5] - 2026-06-28

### Added (P1 Expansion)
- **async**: Queue (priority task queue), Semaphore, memoizeAsync (stale-while-revalidate)
- **math**: median, stddev, sampleStddev, percentile, correlation, formatCurrency
- **string**: levenshtein, fuzzyMatch, maskString (PDPA compliance), terbilang (angka→kata), formatRupiah
- **collection**: topoSort (Kahn's algorithm), slidingWindows, tumblingWindows
- **date**: timeAgo (id/en), timeRemaining, Duration, formatDuration, toTimezone, formatInTimezone, WIB/WITA/WIT constants

## [0.3.4] - 2026-06-28

### Added (P0 Modules)
- **validation**: isNIK, isNPWP, isPhone, isEmail, isURL — Indonesia-specific validations
- **error**: createError, TypedError (10 codes with HTTP status), MultiError, collectErrors
- **logger**: Logger class, child loggers, console/JSON/file transports, buffered transport
- 16 modules total, 484 tests passing

## [0.3.3] - 2026-06-28

### Fixed
- `round(1.005, 2)` floating-point bug
- `parseDate('29/02/2023')` not throwing for invalid leap year
- Added `sideEffects: false` for proper tree-shaking

## [0.3.2] - 2026-06-28

### Added
- Biome linter + formatter config
- CI workflow with matrix testing (Node 18, 20, 22)
- SECURITY.md for vulnerability disclosure
- CHANGELOG.md with full version history

### Fixed
- Cross-platform `clean` script
- GitHub Actions: dep-exray-scan uses superjs-core
- Removed misleading "zero-dependency" keyword

## [0.3.0] - 2026-06-27

### Changed
- Merged `superjs-dep-exray` into `superjs-core` as built-in module
- Single package: `npm install superjs-core` gets everything
- 7 deprecated npm packages removed/unpublished

### Added
- `dep-exray` module: scanProject, analyzeUsage, generateReport, KNOWN_MAPPINGS, KNOWN_CVES
- CLI: `npx dep-exray .`

## [0.2.0] - 2026-06-27

### Added
- crypto module: hash, randomHex, base64, generateToken, generateOTP
- path module: join, resolve, basename, dirname, extname

## [0.1.0] - 2026-06-27

### Added
- Initial release
- core, math, date, collection, string, async, io, type modules
- 100+ utility functions
- Full TypeScript strict mode
