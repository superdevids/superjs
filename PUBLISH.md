# Publishing

Guide to publishing **SpeexJS** to npm.

## Prerequisites

```bash
npm login
npm whoami        # verify you are logged in
```

## Step-by-Step

```bash
# 1. Build all targets
npm run build:all

# 2. Run tests
npm test

# 3. Type check
npm run typecheck

# 4. Bump version
npm version major -m "feat: bump to v%s"
npm version minor -m "feat: bump to v%s"
npm version patch -m "fix: bump to v%s"

# 5. Verify package contents
npm pack --dry-run

# 6. Publish
npm publish
```

## Versioning

| Command | Effect | Example |
|---------|--------|---------|
| `npm version major` | Breaking change | 2.x.x → 3.0.0 |
| `npm version minor` | New feature (backward-compatible) | 3.0.x → 3.1.0 |
| `npm version patch` | Bug fix | 3.0.0 → 3.0.1 |

## Dist Tags

```bash
npm publish                    # latest
npm publish --tag beta         # speexjs@beta
npm publish --tag alpha        # speexjs@alpha
```

## Package Contents

The package includes only the `dist/` directory:
- ESM modules with tree-shaking
- Full TypeScript declarations (.d.ts)
- Source maps for debugging
- No source TypeScript files
- No test files
- No documentation files (available on GitHub)

## Troubleshooting

| Error | Solution |
|-------|----------|
| `403 Forbidden` | Check npm access & login |
| `402 Payment Required` | Set up 2FA on npm account |
| `Package name exists` | Bump version number |
| Build error | Fix TypeScript errors (`npm run typecheck`) |
| Test failure | Fix tests (`npm test`) |

## Rollback

Use deprecate instead of unpublish (unless within 72 hours):

```bash
npm deprecate speexjs@3.0.0 "Critical bug. Upgrade to 3.0.1"
```

For the unpublish case (within 72 hours):

```bash
npm unpublish speexjs@3.0.0
```

## CI/CD Publishing

The project uses GitHub Actions for automated publishing. See `.github/workflows/ci.yml` for details.

## Related Packages

| Package | Description |
|---------|-------------|
| `@speex/create` | Project scaffolding via `npx @speex/create` |
| `speexjs` | Main framework package |
