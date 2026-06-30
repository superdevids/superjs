# Contributing

Thank you for considering contributing to **SpeexJS**!

## Bug Reports & Feature Requests

- Report bugs via [GitHub Issues](https://github.com/superdevids/speexjs/issues)
- Use the available templates
- Include SpeexJS version, Node.js version, OS, and reproduction code

## Pull Requests

1. Fork & clone the repo
2. Create a branch: `feat/name` or `fix/name`
3. Follow the coding standards
4. Write tests and ensure all pass (`npm test`)
5. Use [Conventional Commits](https://www.conventionalcommits.org/)
6. Push and open a PR against the `main` branch

## Development Setup

```bash
git clone https://github.com/superdevids/speexjs.git
cd speexjs
npm install
npm run build
npm test
```

## Coding Standards

- **TypeScript**: Strict mode, no `any`, no `@ts-ignore`
- **Formatting**: Follow existing code style
- **Tests**: Every feature must include tests (Vitest)
- **Docs**: Update relevant .md files and JSDoc comments
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)

## Project Structure

```
src/
├── cli/           # CLI commands (35+)
├── client/        # Client-side VDOM, Signals, Router
├── native/        # Zero-dep utilities (crypto, logger, colors)
├── rpc/           # Type-safe RPC
├── schema/        # Validation (29+ types)
└── server/        # Server framework
    ├── auth/      # Auth guards (Session, Token, Sanctum, Socialite, OAuth, SAML2, OIDC)
    ├── database/  # Query Builder, ORM, Migrations
    ├── devtools/  # DevTools Dashboard
    ├── queue/     # Queue system
    ├── search/    # Full-text search engine
    ├── storage/   # File storage, image processing, signed URLs
    ├── router/    # Router, versioning, deprecation
    └── ...
```

## Testing

```bash
npm test                 # Run all tests
npm run test:coverage    # Run with coverage report
npm run typecheck        # TypeScript type checking
```

## Documentation

Update these files when adding features:
- `README.md` — Feature tables and CLI reference
- `CHANGELOG.md` — Version history
- `docs/PRD*.md` — Product requirement alignment
- `docs/GUIDE_*.md` — User guides
