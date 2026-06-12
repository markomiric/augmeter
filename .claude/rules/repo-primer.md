# Repo Primer: augmeter

Last updated: 2026-06-12

## Purpose

`augmeter` is a VS Code extension (publisher `kamacode`) that shows Augment credits/usage in the status bar, with multi-provider local usage rollups (Claude Code, Codex, GitHub Copilot), alert thresholds, a quick-pick usage dashboard, CSV/JSON history export, and diagnostics commands.

Keep this file as a compact orientation memory. Detailed user docs live in `README.md`; release notes in `CHANGELOG.md`.

## Stack

- TypeScript, strict mode (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), target ES2022, NodeNext modules.
- Zero runtime dependencies; only the VS Code API (`engines.vscode ^1.104.0`, Node >= 20).
- Plain `tsc` build to `out/` (no bundler); `main: ./out/extension.js`; activation on `onStartupFinished`.
- ESLint v9 flat config (`eslint.config.mjs`) with type-checked rules + Prettier; Husky + lint-staged pre-commit (eslint --fix, prettier).
- Unit tests: Vitest (`src/unit/**/*.unit.test.ts`, node env, VS Code API mocked in `test-setup/vitest-setup.ts`).
- Integration tests: `@vscode/test-cli` extension host (`src/test/suite/*.test.ts`, mocha tdd UI, configured by `.vscode-test.mjs`, compiled via `tsconfig.test.json`).

## Repo Shape

- `src/extension.ts`: entry point — `activate()` creates `ExtensionBootstrap` and delegates.
- `src/bootstrap/`: `extension-bootstrap.ts` (DI + initialization), `runtime-coordinator.ts` (auth state, polling loop, config/focus/secret listeners).
- `src/commands/`: `auth-commands.ts` (sign in/out, smart sign-in), `usage-commands.ts` (refresh, export, diagnostics, dashboard), `usage-command-formatters.ts`.
- `src/core/`: cross-cutting infrastructure
  - `auth/`: cookie utils, clipboard cookie watcher, `SecureSecretsManager` (VS Code SecretStorage).
  - `config/`: `ConfigManager` plus domain modules (`alert-config`, `provider-config`, `smart-sign-in-config`, `status-bar-config`).
  - `errors/`, `http/` (fetch wrapper + retry), `logging/` (`SecureLogger`), `notifications/`, `storage/` (`StorageManager`, provider storage state), `types/`.
- `src/features/usage/`: `UsageTracker` polling orchestration + helpers (alerts, projections).
- `src/providers/`: `ProviderAdapter` interface, registry, aggregation service, and `adapters/` for Claude/Codex/Copilot local telemetry.
- `src/services/`: `AugmentApiClient` (HTTP + retry + caching), `AugmentDetector`, session/usage parsing.
- `src/ui/`: `status-bar.ts` (item lifecycle), `status-bar-logic.ts` (pure display/color/tooltip logic), `usage-dashboard.ts`.
- `src/test/suite/`: extension-host integration tests. `src/unit/`: Vitest unit tests.

## Commands

From repo root:

```bash
npm run compile          # clean + tsc build
npm run watch            # incremental build
npm run lint             # eslint src
npm run format:check     # prettier check
npm run test             # vitest unit tests
npm run test:cov         # unit tests + coverage gates
npm run test:integration # compile-tests + vscode-test (extension host)
npm run test:all         # coverage + integration
npm run package          # vsce package -> .vsix
npm run analyze:knip     # dead code (configured in knip.jsonc)
just check               # full local quality gate chain
```

## Conventions

- Kebab-case filenames; exported class/function names match the file's role.
- Keep `package.json` `contributes` (commands, configuration) in sync with command registration in `src/bootstrap/` + `src/commands/`.
- Persistence goes through `StorageManager`; settings reads through `ConfigManager` and the domain config modules; secrets only through `SecureSecretsManager`.
- Never log cookies, tokens, or secrets — use `SecureLogger` (the only file allowed `console`).
- Keep `src/ui/status-bar-logic.ts` pure (no `vscode` value imports) so it stays unit-testable.
- Services accept an injected `now: Date` where timing matters — thread it through (retention pruning bugs came from mixing `Date.now()` with injected clocks).
- Test naming: unit = `src/unit/**/*.unit.test.ts` (Vitest); integration = `src/test/suite/*.test.ts` (extension host). Vitest's include only matches `*.unit.test.ts`.
- No runtime dependencies — adding one is an architectural decision, not a convenience.

## CI

- `.github/workflows/ci.yml`: npm audit → format:check → lint → compile → unit tests with coverage gates → integration tests (xvfb) → package → SBOM artifact.
- `.github/workflows/codeql.yml`: CodeQL scanning. `.github/workflows/release.yml`: marketplace release flow (needs `VSCE_PAT`).

## Gotchas

- `@vscode/test-electron` looks unused to depcheck/knip but `@vscode/test-cli` imports it at runtime without declaring it; the explicit devDependency must stay (ignored in `knip.jsonc`).
- Integration tests run COMPILED js (`out/test/**/*.test.js`); run `npm run compile-tests` (the `test:integration` script does) after editing them.
- The pre-commit hook auto-fixes/formats staged files; a commit can therefore produce slightly different content than what was staged.
- Unit tests import `vscode` — it resolves to the mock in `test-setup/vitest-setup.ts`, not the real API. Extend the mock there when new API surface is used.
- `out/` is gitignored build output; never edit it.

## First Places To Look

- Activation/wiring: `src/extension.ts`, `src/bootstrap/extension-bootstrap.ts`, `src/bootstrap/runtime-coordinator.ts`
- Status bar behavior: `src/ui/status-bar.ts`, `src/ui/status-bar-logic.ts`
- Augment API/auth: `src/services/augment-api-client.ts`, `src/core/auth/`
- Local provider telemetry: `src/providers/`
- Settings surface: `package.json` `contributes.configuration` + `src/core/config/`
- Quality gates: `package.json` scripts, `.github/workflows/ci.yml`, `vitest.config.ts`, `.vscode-test.mjs`
