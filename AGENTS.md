# Augmeter agent guide

## Project contract

Augmeter is a TypeScript VS Code UI extension that shows Augment credits beside
local Claude Code, Codex, and GitHub Copilot activity.

- Support VS Code `>=1.104.0` and development Node.js `>=20.18.0`.
- Use npm and compile strict TypeScript with NodeNext semantics to `out/`.
- Keep zero runtime package dependencies unless a change clearly requires one.

## Product boundaries

- Label every value by source and time window. Local activity is an approximate
  signal, never official provider quota usage.
- Treat balance-only Auggie CLI data as balance-only. Do not infer consumption,
  percentages, pace, targets, or trends that the source does not provide.
- Claude Code and Codex activity count human user turns according to their
  adapters; exclude tool results, metadata, and agent or subagent sessions.
- Keep cumulative local Copilot counts distinct from GitHub API premium-request
  usage.

## Architecture

- `src/extension.ts`: activation and deactivation.
- `src/bootstrap/`: dependency wiring and runtime lifecycle.
- `src/providers/`: provider adapters and normalized activity snapshots.
- `src/services/`: Augment API, Auggie CLI, and response parsing.
- `src/core/`: configuration, authentication, storage, errors, and logging.
- `src/features/usage/`: polling, retention, rates, projections, and alerts.
- `src/commands/` and `src/ui/`: commands, exports, status bar, and dashboard.

Read settings through `ConfigManager`, persisted state through `StorageManager`,
and sensitive logging through `SecureLogger`.

## Security invariants

- Store session cookies only in VS Code `SecretStorage`; never log credentials,
  cookies, or tokens.
- Disable local provider file and database reads in untrusted workspaces.
- Keep SQLite access fixed and read-only. Execute subprocesses with argument
  arrays rather than interpolated shell commands.
- Dispose subscriptions, timers, and polling state with the extension lifecycle.

## Verification and evidence

- `just check` is the default local source gate.
- Run `npm run test:packaged` when changing activation, the extension manifest,
  packaging, shipped contents, or extension-host boundaries.
- Run `npm run analyze:knip` when changing dependencies or exports.
- Run `npm audit --omit=dev --audit-level=high` when dependencies change.
- For documentation-only changes, run `git diff --check`.
- Report source checks, packaged-VSIX checks, Marketplace publication, and live
  provider behavior as separate proof boundaries.

Update `README.md`, `docs/usage-data.md`, `SECURITY.md`, and `CHANGELOG.md` when
their user-facing behavior, data semantics, security model, or release record
changes.
