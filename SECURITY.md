# Security

## Security & trust model

Augmeter has **zero runtime dependencies** -- it uses only the VS Code API and the Node.js standard library, so no third-party package code runs in your editor.

The extension may execute two external binaries, always via Node's `execFile` with an **argument array (never a shell command string)**, so file paths and arguments cannot be interpreted as shell commands:

- **`sqlite3`** -- resolved from your `PATH` -- to read GitHub Copilot request counters from VS Code's local `state.vscdb`. The SQL is a fixed, read-only `SELECT` with no interpolated input.
- **`auggie`** -- the official Augment CLI -- run as `auggie account status` to read Augment usage without a session cookie. Augmeter never reads or stores the CLI's credentials.

Custom binary/database paths (`auggieCli.path`, `providers.copilot.stateDbPath`, `providers.claude.path`, `providers.codex.path`) are user-controlled. The path settings that a repository could otherwise override are disabled in **untrusted workspaces** (VS Code Workspace Trust), and `auggieCli.path` is application-scoped so it can only ever be set in your own user settings -- a workspace can never point Augmeter at an untrusted executable. In an untrusted workspace, all local provider/session file scanning is disabled.

Your Augment session cookie is stored only in VS Code **SecretStorage** (the OS keychain), never in settings or files, and is redacted from all logs. If you enable Copilot GitHub-API tracking, the token is read from an environment variable you name and sent only to your configured GitHub API host; it is never written to logs or persisted by the extension.

## Reporting a vulnerability

Please use [GitHub private security advisories](https://github.com/markomiric/augmeter/security/advisories/new) to report security vulnerabilities privately -- do not open a public issue until the fix is ready. For general bugs and feature requests, use [GitHub Issues](https://github.com/markomiric/augmeter/issues).
