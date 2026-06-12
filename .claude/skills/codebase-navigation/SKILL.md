---
name: codebase-navigation
description: Current codebase structure, agent map, task files, and efficient navigation tips for the augmeter VS Code extension.
---

# Codebase Navigation

Use this skill before broad exploration, plan creation, or agent routing.

## Stack Source Of Truth

Read `.claude/rules/repo-primer.md` first. It describes the active stack:

- TypeScript VS Code extension (`augmeter`): Augment usage/credits in the status bar plus Claude/Codex/Copilot local telemetry rollups
- Strict TypeScript (ES2022, NodeNext), plain `tsc` build to `out/`, zero runtime dependencies
- ESLint v9 flat config + Prettier; Husky + lint-staged pre-commit
- Vitest unit tests (`src/unit/**/*.unit.test.ts`, VS Code API mocked in `test-setup/vitest-setup.ts`)
- `@vscode/test-cli` extension-host integration tests (`src/test/suite/*.test.ts`, configured by `.vscode-test.mjs`)
- CI through `.github/workflows/ci.yml` (audit, lint, compile, coverage gates, integration, package, SBOM)

Do not assume any web backend, FastAPI, AWS, DynamoDB, React, or `services/` directories unless a task explicitly adds that stack.

## Current Runtime Files

```text
src/
├── extension.ts                       # activate()/deactivate() entry point
├── bootstrap/
│   ├── extension-bootstrap.ts         # DI + initialization orchestrator
│   └── runtime-coordinator.ts         # Auth state, polling loop, config/focus/secret listeners
├── commands/
│   ├── auth-commands.ts               # Sign in/out, smart sign-in, clipboard cookie flow
│   ├── usage-commands.ts              # Refresh, export, diagnostics, dashboard commands
│   └── usage-command-formatters.ts    # CSV/JSON/diagnostics text formatting
├── core/
│   ├── auth/                          # Cookie utils, clipboard watcher, SecureSecretsManager
│   ├── config/                        # ConfigManager + alert/provider/smart-sign-in/status-bar config modules
│   ├── errors/                        # AugmeterError + error handler
│   ├── http/                          # Fetch wrapper + exponential-backoff retry
│   ├── logging/                       # SecureLogger (only file allowed console)
│   ├── notifications/                 # UserNotificationService
│   ├── storage/                       # StorageManager (globalState), provider storage state
│   └── types/                         # Augment API + provider usage types
├── features/usage/
│   ├── usage-tracker.ts               # Polling orchestration: API + local providers
│   └── usage-tracker-helpers.ts       # Alerts, projections, session activity parsing
├── providers/
│   ├── provider-adapter.ts            # Adapter interface
│   ├── provider-registry.ts           # Trust-aware adapter registry
│   ├── provider-usage-service.ts      # Aggregation + provider alert logic
│   ├── local-file-utils.ts            # Local log/file reading helpers
│   └── adapters/                      # claude-/codex-/copilot-provider-adapter.ts
├── services/
│   ├── augment-api-client.ts          # HTTP + retry + caching + auth for the Augment API
│   ├── augment-detector.ts            # API client/config factory
│   ├── session-reader.ts              # Augment session file parsing
│   └── usage-parsing.ts               # Usage payload parsing
├── ui/
│   ├── status-bar.ts                  # Status bar item lifecycle + click handling
│   ├── status-bar-logic.ts            # Pure display/color/tooltip logic (no vscode value imports)
│   └── usage-dashboard.ts             # Quick-pick dashboard
├── test/suite/                        # Extension-host integration tests (*.test.ts)
└── unit/                              # Vitest unit tests (*.unit.test.ts)
```

Other key files:

- `package.json`: extension manifest (`contributes` commands/configuration), scripts, devDependencies
- `.vscode-test.mjs`: integration test runner config; `tsconfig.test.json` compiles the suite
- `vitest.config.ts` + `test-setup/vitest-setup.ts`: unit test runner + VS Code API mock
- `knip.jsonc`: dead-code analyzer config (`npm run analyze:knip`)
- `eslint.config.mjs`, `.prettierrc.json`, `.husky/`: lint/format/hooks
- `justfile`: Claude launchers + `just check` quality gate chain
- `CLAUDE.md`: Central AI workflow rules; `.claude/settings.json`: hooks, permissions, skills
- `.claude/tasks/`: plan and session artifacts
- `.github/workflows/`: `ci.yml`, `codeql.yml`, `release.yml`

## Agent Map

Use current agent files only:

- `master-orchestrator`: complex planning and task enrichment
- `quality-engineer`: test strategy, validation gates, read-only implementation review
- `debugger-detective`: root-cause debugging
- `performance-optimizer`: activation time, polling cost, package size
- `security-auditor`: secret handling, cookie/token hygiene, dependency risk
- `deep-researcher`: external docs and best practices, Context7-first for library docs
- `docs-automation-specialist`: README, CHANGELOG, docs drift
- `code-simplifier`: focused simplification and refactoring
- `visual-explainer`: diagrams and self-contained HTML summaries
- `session-librarian`: task/session artifact organization

Out-of-stack agents may exist in `.claude/agents/` (backend/database/frontend specialists from the starter template). Use them only after the user explicitly introduces that domain.

## Task Files

Plan files in `.claude/tasks/` are the primary handoff artifact. `session-current.md` is optional and may not exist.

When a command or agent receives a plan path, use that file as source of truth. If no plan path exists, inspect `.claude/tasks/` and ask for clarification only when multiple active plans conflict.

## Navigation Commands

Prefer exact searches for known strings:

```bash
rg -n "StatusBarManager|UsageTracker|AugmentApiClient|ProviderRegistry|StorageManager" src
rg --files src .claude .github
```

For semantic code understanding, use Auggie/codebase retrieval when available, then confirm exact references with `rg`.
