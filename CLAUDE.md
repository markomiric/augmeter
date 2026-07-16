# Augmeter repository guide

Augmeter is a TypeScript VS Code extension that reports Augment credits and local activity from Claude Code, Codex, and GitHub Copilot.

## Stack

- Node.js 20+, TypeScript, npm
- Plain `tsc` build to `out/`
- Vitest unit tests and VS Code extension-host integration tests
- ESLint and Prettier
- No runtime dependencies

## Commands

```bash
npm run format:check
npm run lint
npm run compile
npm run test:cov
npm run test:integration
npm run package
```

Run `just check` for the complete local CI-equivalent gate.

## Structure

- `src/bootstrap/`: extension wiring and runtime coordination
- `src/commands/`: commands, exports, and diagnostics
- `src/core/`: configuration, auth, storage, logging, and shared types
- `src/features/usage/`: Augment usage polling and projections
- `src/providers/`: Claude Code, Codex, and Copilot activity adapters
- `src/ui/`: status bar and assistant usage dashboard
- `src/unit/`: Vitest tests
- `src/test/suite/`: extension-host integration tests

## Conventions

- Keep provider activity clearly labeled by source and time window.
- Treat local activity as approximate; do not present it as official quota usage.
- Keep secrets in VS Code SecretStorage and never log tokens or cookies.
- Read settings through `ConfigManager` and persisted state through `StorageManager`.
- Preserve strict TypeScript and zero runtime dependencies.
- Update README and CHANGELOG when user-facing behavior changes.
