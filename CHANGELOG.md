# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [1.1.0] - 2026-07-16

### Added

- Local activity tracking for Claude Code, Codex, and GitHub Copilot, with source-specific labels and timestamps.
- Assistant usage dashboard, CSV/JSON exports, and diagnostics covering local activity and connected Augment data.
- Automatic Augment connection through Auggie CLI, including a guided `auggie login` terminal flow when needed.
- Optional official GitHub Copilot premium-request usage through `GITHUB_TOKEN`.
- `SECURITY.md` documenting subprocess, secret-storage, and untrusted-workspace behavior.
- Cross-platform CI and Dependabot coverage for dependencies and GitHub Actions.

### Changed

- Reframed the extension as **Augmeter: Assistant Usage**, with local assistant activity first and optional Augment credit data clearly separated.
- Simplified the status bar to one consistent credit summary and reduced settings to supported, actionable controls.
- Reworked commands, dashboard copy, tooltips, empty states, exports, and diagnostics around explicit data sources and user actions.
- Shared incremental JSONL scanning between Claude Code and Codex for lower repeated-read overhead.
- Updated README and usage-data documentation with current UI screenshots and source-by-source metric definitions.

### Fixed

- Claude Code activity excludes tool-result and metadata records; Claude Code and Codex totals exclude agent/subagent sessions.
- Balance-only Auggie CLI responses no longer appear as `0 used` or produce unsupported percentage and trend calculations.
- Renewal cards no longer derive a misleading countdown from date-only data.
- Provider snapshot retention and JSONL stream completion are deterministic.
- Packaging and clean scripts work across supported operating systems; the `.vsix` no longer ships development or agent files and is approximately 130 KB.

### Removed

- Experimental Augment session tracking, provider targets and alerts, redundant status-bar customization, and unused internal wrappers and tooling.

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
