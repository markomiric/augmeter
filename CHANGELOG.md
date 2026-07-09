# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added

- Automatic sign-in via the Auggie CLI: when `auggie` is installed and logged in, usage appears with no cookie or manual steps (`auggie account status` is parsed; credentials are never read). New settings: `augmeter.dataSource` (`auto`/`auggie-cli`/`cookie`) and `augmeter.auggieCli.path`.
- Sign-in flow offers a one-click terminal `auggie login` when the CLI is installed but signed out
- Diagnostics now report the data-source mode and Auggie CLI detection/auth state
- `SECURITY.md` documenting the subprocess trust model (`sqlite3`, `auggie` CLI), SecretStorage secret handling, and untrusted-workspace restrictions
- Dependabot configuration for automated weekly devDependency and GitHub Actions update PRs

### Changed

- Shared JSONL incremental-scan engine extracted from Claude and Codex provider adapters; each adapter now injects only its provider-specific predicate and timestamp extractor (internal refactor, no behavior change)
- CI matrix extended to ubuntu, macOS, and Windows; integration tests remain Linux-only (xvfb); packaging runs once on Ubuntu

### Fixed

- Provider snapshot retention now honors the injected clock, making pruning deterministic
- The `.vsix` no longer ships development/agent files (package size cut from 1.82 MB to ~131 KB)

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
