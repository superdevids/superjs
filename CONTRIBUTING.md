# Contributing to superjs-core

## Setup Development

```bash
cd packages/core
npm install
npx tsup
npx vitest run
```

## Adding a New Function

1. Add the function in the appropriate module under `packages/core/src/<module>/`
2. Export it from the module's `index.ts`
3. Add comprehensive tests in `packages/core/tests/`
4. Run `npx vitest run` to verify (757 tests)
5. Run `npx tsup` to confirm build succeeds
6. Update `SUMMARY.md` with the new function
7. Update `README.md` module table

## Modules Available

| Module | Location |
|--------|----------|
| core | `src/core/` |
| math | `src/math/` |
| date | `src/date/` |
| collection | `src/collection/` |
| string | `src/string/` |
| async | `src/async/` |
| io | `src/io/` |
| type | `src/type/` |
| crypto | `src/crypto/` |
| path | `src/path/` |
| validation | `src/validation/` |
| error | `src/error/` |
| logger | `src/logger/` |
| dep-exray | `src/dep-exray/` |

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add deepMerge function
fix(math): correct floating point rounding
docs: update README with new API examples
```

## Pull Request Process

1. Create a branch from `master` with a descriptive name
2. Ensure `npx tsup && npx vitest run` passes
3. Open a PR against `master` with clear title and description
