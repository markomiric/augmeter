# Security

## Security & trust model

Augmeter ships with **zero runtime package dependencies**. Its extension code uses the VS Code API and the Node.js standard library.

The extension can use two binaries already installed on your machine:

- **`sqlite3`** is resolved from your `PATH` and reads GitHub Copilot request counters from VS Code's local `state.vscdb`. The query is a fixed, read-only `SELECT` with no interpolated input.
- **`auggie`** is the official Augment CLI. Background credit reads run `auggie account status` through Node's `execFile` with an argument array. Augmeter never reads or stores CLI credentials. If you explicitly choose the CLI sign-in option, Augmeter opens a VS Code terminal and runs `auggie login` there so you can complete Augment's sign-in flow.

Custom binary, database, and log paths (`auggieCli.path`, `providers.copilot.stateDbPath`, `providers.claude.path`, and `providers.codex.path`) are user-controlled. Settings that a repository could otherwise override are disabled in **untrusted workspaces** through VS Code Workspace Trust. `auggieCli.path` is application-scoped, so a workspace cannot point Augmeter at an executable. All local provider and session-file reading is disabled in untrusted workspaces.

An Augment session cookie is stored only in VS Code **SecretStorage**, never in settings or extension data files, and is redacted from logs. Clipboard monitoring runs only during the cookie connection flow. If you enable GitHub Copilot API tracking, the token is read from the `GITHUB_TOKEN` environment variable and sent only to GitHub's API. Augmeter does not log or persist that token.

The dashboard uses a nonce-protected local script to preserve focus and display updates. It cannot load local resources or remote scripts. Messages can invoke only a fixed allowlist of Augmeter commands without caller-supplied arguments; arbitrary VS Code commands and command URIs remain disabled. Provider text is HTML-escaped.

Copied diagnostics redact configured filesystem paths and GitHub usernames and omit raw provider messages and snapshot details. Explicit JSON exports retain usage and configuration data for the user to inspect locally.

## Reporting a vulnerability

Use [GitHub private security advisories](https://github.com/markomiric/augmeter/security/advisories/new) to report vulnerabilities privately. Do not open a public issue until a fix is ready. For general bugs and feature requests, use [GitHub Issues](https://github.com/markomiric/augmeter/issues).
