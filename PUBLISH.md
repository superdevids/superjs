# Publishing Guide

## Prerequisites

```bash
npm login
```

## Publish superjs-core

```bash
cd packages/core

# 1. Build
npx tsup

# 2. Test (757 tests)
npx vitest run

# 3. Bump version
npm version patch
# or: npm version minor
# or: npm version major

# 4. Build again after version bump
npx tsup

# 5. Publish
npm publish

# 6. Commit and push
cd ../..
git add -A
git commit -m "chore: bump to v$(node -p \"require('./packages/core/package.json').version\")"
git push origin master
```

## Checklist Pre-Publish

- [ ] `npx tsup` — build sukses
- [ ] `npx vitest run` — 757 tests pass
- [ ] `npm login` — sudah login
- [ ] Changelog sudah diupdate
- [ ] README sudah sesuai
- [ ] Git commit — semua perubahan ter-commit
