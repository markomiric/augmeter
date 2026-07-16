# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added

- Automatic Augment connection through Auggie CLI when `auggie` is installed and already signed in. Augmeter reads `auggie account status` without reading CLI credentials. New settings: `augmeter.dataSource` (`auto`/`auggie-cli`/`cookie`) and `augmeter.auggieCli.path`.
- The Augment connection flow can open a terminal for `auggie login` when the CLI is installed but signed out
- Diagnostics now report the data-source mode and Auggie CLI detection/auth state
- `SECURITY.md` documenting the subprocess trust model (`sqlite3`, `auggie` CLI), SecretStorage secret handling, and untrusted-workspace restrictions
- Dependabot configuration for automated weekly devDependency and GitHub Actions update PRs

### Changed

- Reframed the product around Claude Code, Codex, and GitHub Copilot activity alongside optional Augment credit data. The overview now leads with assistant activity and labels local versus official usage.
- Renamed the extension display name to **Augmeter: Assistant Usage** so the Marketplace and Settings no longer imply an Augment-only product.
- Reworked status-bar, connection, dashboard, settings, alerts, exports, diagnostics, empty states, and errors around consistent, action-specific language.
- Renamed user commands to describe their exact scope, including **Connect Augment**, **Open Assistant Usage**, **Export Augment Credit History**, and **Export All Usage Data**.
- Grouped settings by Assistant activity, Augment credits, Status bar, and General while preserving all existing setting keys.
- Status-bar `both`, `auto`, and `showPercentInStatusBar` options now match their settings descriptions.
- Renamed `augmeter.budget.monthlyTarget` to `augmeter.budget.cycleTarget` to match its billing-cycle scope. Existing values remain supported during migration.
- Shared JSONL incremental-scan engine extracted from Claude and Codex provider adapters; each adapter now injects only its provider-specific predicate and timestamp extractor (internal refactor, no behavior change)
- CI matrix extended to ubuntu, macOS, and Windows; integration tests remain Linux-only (xvfb); packaging runs once on Ubuntu
- Assistant cards now label Claude Code and Codex values as local user turns, show source timestamps, explain counting rules, and identify the local Copilot value as a cumulative counter without a reliable time window.
- README and usage-data documentation now include fresh Extension Development Host screenshots and source-by-source metric definitions.

### Fixed

- Provider snapshot retention now honors the injected clock, making pruning deterministic
- The `.vsix` no longer ships development dependencies or agent files (package size reduced to about 143 KB)
- Claude Code activity no longer counts tool-result or metadata records, and Claude Code/Codex activity no longer includes agent/subagent sessions.
- Balance-only Auggie CLI responses no longer appear as `0 used`; Augmeter shows the reported balance and monthly allowance while withholding unsupported percentage, pace, target, and trend calculations.
- Renewal cards no longer derive a potentially misleading day countdown from a date-only Auggie response.

## [1.0.3] - 2026-01-30

### Fixed

- Fix extension failing to activate when installed from marketplace (`undici` was not bundled in the `.vsix`; replaced with Node.js built-in `fetch`)

## [1.0.2] - 2026-01-30

### Fixed

- Fix duplicate "Augmeter:" prefix in command palette titles
- Fix integration test failures (missing mock methods, MarkdownString tooltip handling, stale assertions)

## [1.0.1] - 2026-01-30

### Added

- Session activity tracking (experimental): read local Augment session files to count prompts and sessions per day
- Enhanced status bar tooltip with progress bar, subscription info, renewal date, and usage rate
- Usage rate calculation and projected days remaining
- Configurable smart sign-in with clipboard watching
- Automated VS Code Marketplace publishing via GitHub Actions
- Release documentation in README

### Changed

- Improved usage parsing to support both community and standard billing cycle fields
- Bumped CI actions: `actions/checkout` v6, `actions/setup-node` v6, `actions/upload-artifact` v6, `github/codeql-action` v4

## [1.0.0] - 2025-09-17

### Added

- Initial stable release of the Augmeter VS Code extension
- Status bar usage display with color thresholds and accessibility options
- Click-to-refresh, jittered polling, focus-based refresh
- Cookie-based sign-in with secure storage (VS Code Secrets) and redacted logging
- Commands: Refresh Usage, Open Settings, Sign In, Sign Out
