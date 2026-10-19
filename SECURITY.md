# Security

## Security & trust model

Augmeter ships with **zero runtime package dependencies**. Its extension code uses the VS Code API and the Node.js standard library.

The extension can use one binary already installed on your machine:

- **`auggie`** is the official Augment CLI. Augmeter runs it only when Augment credit tracking (legacy) is on (`augmeter.augment.enabled`, off by default and application-scoped, so a workspace cannot turn it on). Background credit reads run `auggie account status` through Node's `execFile` with an argument array. Augmeter never reads or stores CLI credentials. If you explicitly choose the CLI sign-in option, Augmeter opens a VS Code terminal and runs `auggie login` there so you can complete Augment's sign-in flow.

While Augment credit tracking is off, Augmeter starts no `auggie` process and sends no request to Augment.

Custom binary and log paths (`auggieCli.path`, `providers.claude.path`, and `providers.codex.path`) are user-controlled. Settings that a repository could otherwise override are disabled in **untrusted workspaces** through VS Code Workspace Trust. `auggieCli.path` is application-scoped, so a workspace cannot point Augmeter at an executable. All local session-file reading and the GitHub Copilot API request are disabled in untrusted workspaces.

An Augment session cookie is stored only in VS Code **SecretStorage**, never in settings or extension data files, and is redacted from logs. Clipboard monitoring runs only during the cookie connection flow. If you enable GitHub Copilot API tracking (`augmeter.providers.copilot.api.enabled`), Augmeter sends `GET` requests to `https://api.github.com/users/{username}/settings/billing/ai_credit/usage`, and to `.../billing/premium_request/usage` when the first returns HTTP 404 or no usage items. The token is read from the `GITHUB_TOKEN` environment variable and sent only in the `Authorization: Bearer` header of those requests to `api.github.com`. Augmeter does not log, persist, or export that token; diagnostics and exports record only whether it is present.

The dashboard uses a nonce-protected local script to preserve focus and display updates. It cannot load local resources or remote scripts. Messages can invoke only a fixed allowlist of Augmeter commands without caller-supplied arguments; arbitrary VS Code commands and command URIs remain disabled. Provider text is HTML-escaped.

Copied diagnostics redact configured filesystem paths and GitHub usernames and omit raw provider messages and snapshot details. Explicit JSON exports retain usage and configuration data for the user to inspect locally.

## Reporting a vulnerability

Use [GitHub private security advisories](https://github.com/markomiric/augmeter/security/advisories/new) to report vulnerabilities privately. Do not open a public issue until a fix is ready. For general bugs and feature requests, use [GitHub Issues](https://github.com/markomiric/augmeter/issues).
