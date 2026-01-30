# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

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
