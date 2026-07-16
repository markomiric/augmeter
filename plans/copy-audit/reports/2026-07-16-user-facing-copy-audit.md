# Augmeter User-Facing Copy Audit and Improvement Plan

Conducted: 2026-07-16 09:34 CEST<br>
Scope: current working tree on `perf/audit-batch-1`<br>
Mode: review and planning only; no application code changed

## Contents

1. [Executive summary](#executive-summary)
2. [Scope and method](#scope-and-method)
3. [Copy contract](#copy-contract)
4. [Prioritized findings](#prioritized-findings)
5. [Recommended copy](#recommended-copy)
6. [Implementation plan](#implementation-plan)
7. [Verification](#verification)
8. [Sources](#sources)
9. [Unresolved questions](#unresolved-questions)

## Executive summary

Augmeter has a useful, differentiated product: one VS Code surface for live Augment credits and local activity from Claude Code, Codex, and GitHub Copilot. The copy does not yet preserve that distinction consistently. The word `usage` currently covers live quota data, local activity counts, personal targets, provider limits, health diagnostics, and export data. This makes the product sound broader than it is and makes several dashboard and alert claims harder to trust.

The first priority is truth, not polish. Marketplace copy says "every AI coding assistant" although four assistants are supported. Signed-out copy says users need to sign in for "real usage data" although Claude, Codex, and Copilot data is real and collected without Augment authentication. Settings describe `auto` density as adaptive even though it renders like compact mode, `showPercentInStatusBar` is not consumed by the status-bar renderer, and `both` renders the same value as `used`. `budget.monthlyTarget` is compared with current Augment cycle usage, not month-scoped usage. These are product-contract issues and must be resolved before broader rewriting.

After that, simplify the experience around two clear concepts:

- **Augment credits**: live balance, plan cycle, pace, renewal, and optional personal target.
- **Assistant activity**: local messages, prompts, or requests. These are activity signals, not official provider quotas unless Copilot API data is explicitly labeled as official.

The strongest conversion rewrite is: **"Track Augment credits and local Claude Code, Codex, and GitHub Copilot activity from one VS Code status-bar meter."** It is specific, verifiable, and explains the value without "every," "rich," "smart," "real," or other low-information qualifiers.

## Scope and method

### Repository coverage

- 43 production TypeScript files reviewed.
- 35 unit and integration test files inspected where they define or assert visible behavior.
- 39 contributed settings and 10 contributed commands reviewed in `package.json`.
- All notification, progress, Quick Pick, input, status-bar, tooltip, accessibility, dashboard, export, diagnostics, and provider-health strings inventoried.
- Marketplace metadata, `README.md`, `SECURITY.md`, and the current uncommitted copy changes reviewed.
- Existing user changes were treated as read-only input.

### Evaluation criteria

Each string was evaluated for:

1. **Clarity**: names the object, unit, state, and consequence.
2. **Trust**: accurately describes the source and limits of the data.
3. **Actionability**: gives a specific next step when one is needed.
4. **Conversion**: leads with a concrete user outcome, not an implementation detail.
5. **Consistency**: uses one term for one concept across every surface.
6. **Brevity**: removes words that do not change meaning or help a decision.

### External grounding

Brave Search was used to locate current official VS Code UX guidance and current plain-language UI guidance. Context7 was used to query the current Visual Studio Code Extension API documentation. Relevant guidance:

- VS Code notifications should be brief, limited in frequency, and include a recovery action when one exists.
- Status-bar item names should be short but descriptive.
- Quick Pick `label`, `description`, and `detail` have distinct information hierarchy roles.
- UI copy should use consistent terms, specific verbs, plain language, and as few words as possible without losing meaning.

## Copy contract

### Voice

Calm, factual, compact, and technically credible. Prefer contractions in conversational messages. Do not use hype, blame the user, or expose internal nouns when a user goal is available.

### Canonical vocabulary

| Use                              | Meaning                                          | Avoid                                        |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| **Augment credits**              | Live Augment quota and balance                   | real usage, provider usage, generic usage    |
| **Assistant activity**           | Umbrella for local non-quota counts              | cross-provider usage, rollups                |
| **messages**                     | Claude Code activity unit                        | usage                                        |
| **prompts**                      | Codex activity unit                              | messages, usage                              |
| **requests**                     | GitHub Copilot activity unit                     | messages unless the API contract requires it |
| **limit**                        | An official provider-enforced limit              | target                                       |
| **target**                       | A user-configured planning value                 | limit, budget unless money is involved       |
| **connect / disconnect Augment** | Let Augmeter read Augment credits                | generic sign in / sign out                   |
| **updated**                      | When displayed data was refreshed                | generated, checked at                        |
| **local**                        | Read from files or VS Code state on this machine | local-first without explanation              |

### Message pattern

For errors and empty states:

> What happened. What the user can do next.

For alerts:

> Specific object + threshold or estimate + unit. Specific action.

For success:

> Completed action + object. Avoid a popup when the changed UI already confirms success.

## Prioritized findings

### P0: correct the product contract

| ID  | Finding                                                                                                                                                               | Evidence                                                                                                   | Required decision                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| C01 | Marketplace and README overclaim coverage with "every AI coding assistant" and "all your AI coding assistants."                                                       | `package.json:4`, `README.md:8`, `README.md:16`                                                            | Name the four supported assistants. Do not imply universal support.                                                         |
| C02 | `usage` conflates live Augment quota data with local activity signals.                                                                                                | `README.md:18-35`, `src/ui/usage-dashboard.ts:499-529`, `src/ui/status-bar-logic.ts:230-275`               | Split all surfaces into **Augment credits** and **Assistant activity**.                                                     |
| C03 | Signed-out copy says authentication is required for "real usage data," and provider tooltip lines are hidden unless Augment has real data.                            | `src/ui/status-bar-logic.ts:230-231`, `src/ui/status-bar.ts:236-247`, `src/ui/status-bar.ts:340-359`       | Show local activity independently of Augment connection state. Replace "real usage" everywhere.                             |
| C04 | Three settings promise behavior the renderer does not provide: `auto` is not adaptive, `showPercentInStatusBar` is unused, and `both` equals `used`.                  | `package.json:204-242`, `src/ui/status-bar-logic.ts:17-57`, `src/ui/status-bar.ts:100-113`                 | Implement the promised behavior or remove the options with a backward-compatible migration. Copy alone cannot fix this.     |
| C05 | `budget.monthlyTarget` is compared with current cycle usage, not month-scoped usage.                                                                                  | `package.json:324-328`, `src/features/usage/usage-tracker.ts:170-184`                                      | Rename it to a cycle target or calculate actual calendar-month usage. Use the same scope in tooltip, dashboard, and export. |
| C06 | Command names hide their scope. "Copy Usage Summary" and CSV history contain Augment data, while the JSON bundle contains Augment, provider, health, and config data. | `package.json:109-125`, `src/commands/usage-commands.ts:107-137`, `src/commands/usage-commands.ts:207-319` | Rename commands to match the exported content, or expand their payloads to match their current names.                       |
| C07 | The critical alert CTA says "View Usage" but runs a refresh command.                                                                                                  | `src/features/usage/usage-tracker.ts:420-429`                                                              | Open the dashboard, or rename the button to "Refresh." Prefer "Open dashboard" for all threshold alerts.                    |
| C08 | Provider targets can be described as monthly projections, but the dashboard labels them generically as risk and can present local counts like quota risk.             | `src/providers/provider-usage-service.ts:267-324`, `src/ui/usage-dashboard.ts:238-272`                     | Label them as **target pace**, show the calculation basis, and never imply a provider-enforced quota.                       |

### P1: improve clarity, trust, and actionability

1. **Lead with the verified value proposition.** The current Marketplace description is long and still fails to explain that three sources are local activity rather than quota. Rewrite `package.json:3-4` and `README.md:1-35` together.
2. **Consolidate Augment connection commands.** `Sign In`, `Open Website and Sign In`, and internal `smartSignIn` represent one user goal. Keep one palette command: **Connect Augment**. Keep implementation-specific paths inside the flow.
3. **Make the fallback trust model visible at the moment of choice.** The cookie Quick Pick and prompt explain mechanics but not why the cookie is needed, where it is stored, or how long clipboard watching lasts. State those facts in the flow.
4. **Rewrite the dashboard around decisions.** It currently prioritizes plan/debug metadata, generic `Unknown` values, raw provider health, target-risk labels, and snapshots. Prioritize balance, time left, renewal, trends, and local activity. Move diagnostic details to exports or Output.
5. **Replace raw health messages with user states.** "Scanned 74 files," `state.vscdb`, and "No health data yet" are implementation details. Convert provider status and error codes into concise, action-oriented states.
6. **Make errors operation-specific.** "An unexpected error occurred" and "Failed to execute action" are dead ends. Preserve the operation name and offer retry, settings, logs, or issue reporting when relevant.
7. **Rewrite settings around outcomes.** Many descriptions restate the setting name, expose internal terms such as polling and snapshots, or omit privacy and source implications.
8. **Consolidate shared provider copy.** Provider names and units are duplicated and already differ across status bar, dashboard, and alert code. Share only provider display names, units, and state-to-message mapping. Do not build a general copy framework.

### P2: remove low-value and inconsistent copy

- Replace `day(s)` and `file(s)` with correct singular/plural forms.
- Replace generic `Unknown` with a specific absence, or hide the row when it adds no value.
- Use sentence case for UI labels and imperative verbs for actions.
- Use **Updated** for data freshness. Reserve **Generated** for exported files.
- Remove "Recent Snapshot History" unless user research shows that raw readings help a decision. Trends already summarize the same data.
- Remove repeated `Augmeter Usage Dashboard` from both the editor tab and page heading. Use **Usage overview** in the page.
- Change **Open Issue** to **Report issue**.
- Do not show a success checkmark for an error or empty state.

## Recommended copy

### Marketplace metadata

**Display name**

> Augmeter: AI Usage Meter

**Description**

> Track Augment credits and local Claude Code, Codex, and GitHub Copilot activity from one VS Code status-bar meter.

This is shorter, names supported products, and separates credits from activity.

### README opening

Replace the opening feature paragraph and duplicated feature list with:

> Track Augment credits and local activity from Claude Code, Codex, and GitHub Copilot without leaving VS Code.
>
> - **Augment:** live credits, remaining balance, renewal, and pace.
> - **Claude Code:** local message counts from session logs.
> - **Codex:** local prompt counts from session logs.
> - **GitHub Copilot:** local request counts, or official premium-request usage when you enable the GitHub API.
>
> Local activity counts are not provider quotas. Your Claude Code, Codex, and local Copilot data stays on this machine. Augmeter contacts Augment for credit data and contacts GitHub only when Copilot API tracking is enabled.

Follow with one primary screenshot and one CTA: **Install from the VS Code Marketplace**.

Remove or revise these claims:

- "every AI coding assistant"
- "all your AI coding assistants"
- "zero sign-in steps" to **no additional Augment sign-in when Auggie is already connected**
- "need no setup" to **need no separate account sign-in; local files, Workspace Trust, and `sqlite3` availability determine what can be read**
- "local-first" unless immediately explained as above

### Command Palette

| Current                    | Recommended                                             |
| -------------------------- | ------------------------------------------------------- |
| Refresh Usage              | Refresh usage data                                      |
| Open Settings              | Open settings                                           |
| Sign In                    | Connect Augment                                         |
| Sign Out                   | Disconnect Augment                                      |
| Open Website and Sign In   | Remove from palette; keep as an internal flow if needed |
| Copy Usage Summary         | Copy Augment credit summary                             |
| Open Usage Dashboard       | Open usage overview                                     |
| Export Usage History (CSV) | Export Augment credit history (CSV)                     |
| Export Usage Bundle (JSON) | Export all usage data (JSON)                            |
| Run Diagnostics            | Copy diagnostics                                        |

If copy-summary is expanded to include every assistant, keep **Copy usage summary** and remove the Augment-only `hasRealData` gate.

### Connect Augment flow

**Quick Pick title**

> Connect Augment

**Placeholder**

> Choose how Augmeter should read your Augment credits

**Options**

| Label                        | Description                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| Use Auggie CLI (recommended) | Uses your existing Auggie sign-in. Augmeter does not read CLI credentials. |
| Paste a session cookie       | Stored in VS Code SecretStorage and used only for Augment requests.        |

**Progress**

- `Waiting for Auggie sign-in`
- `Checking your Augment connection...`
- `Loading Augment credits...`

**Completion and failure**

- `Augment connected`
- `Augment disconnected. Auggie remains signed in.`
- `Augmeter couldn't detect an Auggie sign-in. Try again or use a session cookie.`

**Cookie input**

- Title: `Paste your Augment session cookie`
- Prompt: `In app.augmentcode.com, copy the value of the _session cookie. Augmeter stores it in VS Code SecretStorage.`
- Placeholder: `Paste the _session value`
- Clipboard progress: `Copy the _session value. Augmeter watches the clipboard only during this sign-in step.`

**Validation**

- Empty: `Paste the _session cookie value.`
- Cookie name: `Paste the cookie value, not _session.`
- Placeholder: `This looks like an example, not your cookie value.`
- Too short: `The cookie value looks incomplete. Copy the full value and try again.`
- Invalid characters: `The cookie value contains unsupported characters. Copy it again without editing it.`

### Status bar and tooltip

**Disconnected**

> **Augment credits not connected**
>
> Local assistant activity is still available in the usage overview.
>
> Click to connect Augment | Open usage overview

Do not hide provider activity behind `hasRealData`. If local provider data exists, show it even when Augment is disconnected.

**Loading**

> Refreshing credits and assistant activity...

**Connected tooltip structure**

> **Augment credits**<br>
> Pro plan<br>
> 2,400 of 4,000 credits used (60%)<br>
> 1,600 credits left<br>
> Pace: about 120 credits per hour<br>
> At this pace: about 13 hours left, around Jul 17<br>
> Renews Jul 30
>
> **Assistant activity**<br>
> Claude Code: 12 messages in 5 hours, 90 in 7 days<br>
> Codex: 5 prompts in 5 hours, 20 in 7 days<br>
> Copilot: 118 local requests recorded
>
> Updated 09:34

Use compact numerals only where space requires them. Include the unit at least once per line. Change the accessibility label to:

> Augment credits: 2,400 of 4,000 used, 1,600 left, 60 percent.

### Usage overview

Use this information hierarchy:

1. **Usage overview** and one `Updated` timestamp.
2. **Augment credits** with used, limit, remaining, renewal, and pace in one coherent group.
3. **Credit trends** with explicit units. If history is insufficient, show one empty state instead of three `Not enough data` cards.
4. **Assistant activity** with a trust note: `Local activity is not an official provider quota unless labeled otherwise.`
5. Optional **Target pace** only when a target is configured.

Remove from the default dashboard:

- `Status: connected`
- `No health data yet`
- `Scanned N files`
- `Risk: No target signal`
- raw `Updated` text on every provider card when one section timestamp is enough
- `Recent Snapshot History` unless validated as useful
- `Monthly Target: Disabled` and the raw setting key
- repeated `Unknown` values

**Augment card**

> **Augment credits**<br>
> 2,400 of 4,000 credits used<br>
> 1,600 left | Renews Jul 30<br>
> At this pace, credits may run out in 3 days, around Jul 19

**Assistant section note**

> Counts below show local activity, not official provider quotas. Copilot API data is labeled when enabled.

**Provider cards**

- Claude Code: `42 messages in 5 hours` and `310 in 7 days`
- Codex: `18 prompts in 5 hours` and `104 in 7 days`
- Copilot local: `118 local requests recorded by VS Code`
- Copilot API: `47 of 300 premium requests used`
- Trend: `Up 12 prompts from the previous 7 days`
- Target: `Projected at 82% of your monthly target`

**Empty and restricted states**

- Augment disconnected: `Connect Augment to see live credits. Local assistant activity appears below.`
- Refresh failed: `Couldn't refresh Augment credits. Showing the last update from 09:28.`
- Untrusted workspace: `Local activity is off because this workspace is not trusted. Trust the workspace to enable it.`
- Claude path missing: `No Claude Code data found at the configured path. Check the path in Augmeter settings.`
- No Claude logs: `No Claude Code activity recorded yet.`
- Codex path missing: `No Codex data found at the configured path. Check the path in Augmeter settings.`
- Copilot database missing: `Copilot activity is unavailable. Install sqlite3 or enable GitHub API tracking.`
- No target: hide the target row instead of showing `No target signal`.

### Notifications, alerts, and exports

| Current pattern                                          | Recommended pattern                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Extension initialization failed. Please restart VS Code. | Augmeter couldn't start. Reload the VS Code window. If it still fails, open Output > Augmeter.               |
| An unexpected error occurred. Please try again.          | Preserve the operation: `Couldn't refresh Augment credits. Try again.`                                       |
| Failed to execute action. Please try again.              | Preserve the button action: `Couldn't open settings. Try again.`                                             |
| Network error occurred. Please check your connection.    | Couldn't reach Augment. Check your connection, then retry.                                                   |
| No usage data yet - sign in first, shown as success      | Use an info state with action: `Connect Augment before copying a credit summary.` Button: `Connect Augment`. |
| No usage history available yet.                          | No Augment credit history to export yet. Connect Augment, then refresh.                                      |
| Usage history exported (N rows)                          | Exported N credit readings to `<filename>`.                                                                  |
| Usage bundle exported                                    | Exported all usage data to `<filename>`.                                                                     |
| Diagnostics copied to clipboard.                         | Diagnostics copied. Paste them into a GitHub issue. Button: `Report issue`.                                  |
| Augmeter: 95% of credits used. Only N remaining.         | Augment has used 95% of this cycle's credits. N credits remain. Button: `Open usage overview`.               |
| Credits may run out in ~1 day(s).                        | At the current pace, Augment credits may run out in about 1 day.                                             |
| 75% of configured target reached                         | Claude Code is projected at 75% of your monthly activity target.                                             |

Do not send informational threshold notifications for multiple overlapping color and provider thresholds unless each message changes a decision. Respect attention by keeping alerts opt-in, deduplicated per cycle, and action-linked.

### Settings

| Setting group                                             | Recommendation                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                                                 | `Collect and display Augment credits and enabled assistant activity.`                                                                                                                                                                                                  |
| `refreshInterval`                                         | `Refresh credits and assistant activity at this interval while VS Code is focused (1-300 seconds).`                                                                                                                                                                    |
| `backgroundMultiplier`                                    | `Refresh less often while VS Code is in the background. For example, 5 turns a 60-second interval into 5 minutes. Use 1 for no slowdown.`                                                                                                                              |
| `clickAction`                                             | `Choose what happens when you click the status-bar meter.` Enum descriptions: `Refresh all usage data`, `Open the Augment website`, `Open Augmeter settings`.                                                                                                          |
| `displayMode`                                             | Resolve the `both` duplication first. Keep only modes with distinct output and give each an enum description with an example.                                                                                                                                          |
| `statusBarDensity`                                        | Implement real adaptive behavior or remove `auto`. Then use `Show text only, or an icon with text.`                                                                                                                                                                    |
| `statusBarIcon`                                           | `Choose the icon shown in Detailed mode.`                                                                                                                                                                                                                              |
| `showPercentInStatusBar`                                  | Remove until implemented. If implemented: `Add percent used to non-percentage status-bar modes.`                                                                                                                                                                       |
| `colorScheme`                                             | Replace display labels with `Earlier warnings`, `Balanced`, and `Later warnings`. Description: `Choose how early the status-bar color changes as Augment credits are used.`                                                                                            |
| `colorThresholds`                                         | `Set custom color thresholds by percent of Augment credits used.` Document normalization or validation in the editor.                                                                                                                                                  |
| `enhancedReadability`                                     | `Use colored backgrounds as well as text so status changes are easier to spot.`                                                                                                                                                                                        |
| `autoDetectHighContrast`                                  | `Match status colors to VS Code high-contrast themes.`                                                                                                                                                                                                                 |
| `logLevel`                                                | Keep: `Log detail shown in Output > Augmeter.`                                                                                                                                                                                                                         |
| `showInStatusBar`                                         | `Show the Augmeter meter in the VS Code status bar.`                                                                                                                                                                                                                   |
| `history.retentionDays`                                   | `Keep local Augment credit history for trends and CSV exports (7-90 days).`                                                                                                                                                                                            |
| `alerts.warningPercent`, `highPercent`, `criticalPercent` | Use one pattern: `Notify when Augment credit use reaches this percentage.` Add the severity to the setting title, not every description.                                                                                                                               |
| `alerts.runOutDays`                                       | `Warn when Augment credits may run out within this many days. Use 0 to turn off this alert.`                                                                                                                                                                           |
| `budget.monthlyTarget`                                    | Do not rewrite until scope is fixed. Preferred migration: `budget.cycleTarget` with `Set a personal credit target for the current Augment billing cycle. Use 0 to turn off target tracking.`                                                                           |
| `providers.enabled`                                       | `Read local activity from enabled assistants and include it in the tooltip, usage overview, and exports. Local reading is off in untrusted workspaces.`                                                                                                                |
| `providers.enabledIds`                                    | `Choose which assistants appear in activity tracking.` Do not include Augment here if this setting does not control Augment credit collection.                                                                                                                         |
| `providers.targets`                                       | `Set optional monthly activity targets by assistant. Values use messages for Claude Code, prompts for Codex, and requests for Copilot.` Show the example in Markdown, not one long sentence.                                                                           |
| `providers.alerts`                                        | `Override activity-target alerts by assistant.` Keep the schema example in Markdown and label it Advanced.                                                                                                                                                             |
| Claude, Codex, and Copilot path overrides                 | Use one pattern: `Override the local <source> path. Leave blank to use <default>.` Explain that local scanning is disabled in untrusted workspaces once at the group level.                                                                                            |
| `providers.copilot.api.enabled`                           | `Read official Copilot premium-request usage from GitHub. Uses the token environment variable below and falls back to local VS Code counts if unavailable.`                                                                                                            |
| Copilot API username                                      | `GitHub username whose Copilot premium-request usage Augmeter should read.`                                                                                                                                                                                            |
| Copilot token environment variable                        | `Name of the environment variable containing the GitHub token. Augmeter reads the token at runtime and does not store it.`                                                                                                                                             |
| Copilot API base URL                                      | `GitHub API base URL. Keep the default for github.com.` Do not claim enterprise support unless verified.                                                                                                                                                               |
| Copilot API timeout                                       | `Stop a GitHub usage request after this many milliseconds.` Mark Advanced.                                                                                                                                                                                             |
| `apiBaseUrl`                                              | `Advanced: Augment API base URL. Change only for a known Augment environment.` Remove vague `staging/tenant` language unless supported.                                                                                                                                |
| `dataSource`                                              | `Choose how Augmeter reads Augment credits.` Enum descriptions should state fallback behavior and credential handling.                                                                                                                                                 |
| `auggieCli.path`                                          | `Override the Auggie CLI path. Augmeter runs this binary to read credit usage, so choose only a trusted installation. Leave blank to detect it automatically.`                                                                                                         |
| `sessionTracking.enabled`                                 | `Experimental: show today's Augment prompts and sessions from local Augment logs.`                                                                                                                                                                                     |
| `sessionTracking.path`                                    | `Override the local Augment sessions path. Leave blank to use ~/.augment/sessions.`                                                                                                                                                                                    |
| `smartSignIn.quickWatchMs`, `websiteWatchMs`              | Hide under Advanced or remove from the public Settings UI. They are implementation timings, not normal user goals. If retained, use `Clipboard watch time before opening Augment` and `Clipboard watch time after opening Augment` with seconds, not raw milliseconds. |

### Documentation and security

Restructure the user section of `README.md` to:

1. Value proposition and supported data-source table.
2. Primary screenshot.
3. Install CTA.
4. Two-step getting started: local activity appears automatically where available; connect Augment for live credits.
5. Clear data-source and privacy boundaries.
6. Commands and common settings only.
7. Troubleshooting by visible state.
8. Contributor and release content after the user documentation.

Remove the full 39-setting duplicate table. It will drift from `package.json`. Keep five common examples and direct users to **Preferences: Open Settings (UI)** for the authoritative list.

In privacy copy, replace `Session cookie stored in VS Code Secrets (encrypted)` with `Session cookie stored in VS Code SecretStorage` unless the exact platform encryption guarantee is documented. Replace `zero runtime dependencies and runs no third-party code` with `Augmeter ships with zero runtime dependencies. It can run the Auggie and sqlite3 binaries already installed on your machine.` The current next sentence can retain the safe invocation details.

## Implementation plan

### Phase 0: resolve truth and scope

**Files:** `package.json`, `src/ui/status-bar-logic.ts`, `src/ui/status-bar.ts`, `src/features/usage/usage-tracker.ts`, `src/providers/provider-usage-service.ts`, relevant tests.

1. Decide whether Augment targets are calendar-month or billing-cycle targets.
2. Decide whether `displayMode=both`, `statusBarDensity=auto`, and `showPercentInStatusBar` will be implemented or removed.
3. Ensure local assistant activity is visible without an Augment connection.
4. Align alert CTA behavior with its label.
5. Define export scope for summary, CSV, and JSON commands.

**Acceptance:** no visible label promises behavior or data that the code does not provide.

### Phase 1: rewrite acquisition and onboarding

**Files:** `package.json`, `README.md`, `src/commands/auth-commands.ts`, `src/core/auth/cookie-prompt.ts`, `src/core/auth/clipboard-cookie-watcher.ts`, `src/core/auth/cookie.ts`.

1. Replace Marketplace title and description.
2. Rewrite the first half of README around the two-part data model.
3. Consolidate connection commands.
4. Add source and storage trust copy to the CLI/cookie choice.
5. Simplify validation messages and progress labels.

**Acceptance:** a new user can answer what Augmeter reads, from where, whether it is an official quota, and what connecting Augment changes.

### Phase 2: rewrite in-product decision surfaces

**Files:** `src/ui/usage-dashboard.ts`, `src/ui/status-bar-logic.ts`, `src/ui/status-bar.ts`, `src/features/usage/usage-tracker.ts`, `src/providers/provider-usage-service.ts`, provider adapters, command formatters.

1. Rebuild the dashboard hierarchy without changing its visual system unnecessarily.
2. Separate Augment credits from assistant activity in heading and microcopy.
3. Replace raw provider-health strings with a small state-to-copy mapping.
4. Make units, data source, and target basis explicit.
5. Remove repeated low-value metadata and diagnostic text.
6. Fix singular/plural formatting.

**Acceptance:** each number has a unit and source context; each empty/error state has one likely next action; no local activity is described as an official quota.

### Phase 3: settings, exports, and support

**Files:** `package.json`, `src/commands/usage-commands.ts`, `src/commands/usage-command-formatters.ts`, `src/core/errors/augmeter-error.ts`, `src/core/notifications/user-notification-service.ts`, `README.md`, `SECURITY.md`.

1. Rewrite all settings using the matrix above.
2. Mark implementation-level settings Advanced or remove them from normal UX.
3. Rename export and diagnostics commands by output.
4. Pass operation-specific user messages through the error layer.
5. Replace duplicate README settings with common examples.

**Acceptance:** settings explain outcomes and privacy implications; export names match file contents; no generic error is shown where a concrete operation is known.

### Phase 4: consistency and validation

1. Share provider display names, units, pluralization, and state-message mapping in one small UI copy module.
2. Add table-driven tests for connected, disconnected, loading, untrusted, missing-path, no-history, target, alert, and singular/plural states.
3. Render the dashboard in light, dark, and high-contrast themes.
4. Test Command Palette search terms after command renames.
5. Package the extension and inspect Marketplace metadata and README rendering.

**Acceptance:** one term maps to one concept across Marketplace, README, settings, commands, tooltips, dashboard, alerts, exports, diagnostics, and accessibility labels.

## Verification

For implementation, run:

```sh
npm run format:check
npm run lint
npm run compile
npm run test:cov
npm run test:integration
npm run package
```

Add focused content checks for:

- no `real usage` phrase
- no `day(s)` or `file(s)`
- no bare `Unknown` in the dashboard
- no `Risk: No target signal`
- no command name whose output scope differs from its payload
- no provider target described as a provider limit
- no local activity hidden solely because Augment is disconnected

Measure outcomes without adding telemetry by default. Use Marketplace conversion, issue volume by onboarding/error topic, and opt-in user interviews. If telemetry is later added, make it explicit and privacy-preserving.

## Sources

- [VS Code Extension UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [VS Code Notifications Guidelines](https://code.visualstudio.com/api/ux-guidelines/notifications)
- [VS Code Quick Picks Guidelines](https://code.visualstudio.com/api/ux-guidelines/quick-picks)
- [VS Code Status Bar Guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar)
- [VS Code Settings Guidelines](https://code.visualstudio.com/api/ux-guidelines/settings)
- [VS Code Extension API reference](https://code.visualstudio.com/api/references/vscode-api)
- [Microsoft recommendations for UI content](https://learn.microsoft.com/en-us/power-platform/well-architected/experience-optimization/user-interface-content)
- [GOV.UK writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces)

Brave Search was used for source discovery. Context7 libraries `/websites/code_visualstudio_api` and `/microsoft/vscode-docs` were used to query current VS Code API and UX guidance.

## Unresolved questions

1. Should personal Augment targets follow the Augment billing cycle or a calendar month?
2. Should **Copy usage summary** become a true multi-assistant summary, or remain Augment-only with a narrower name?
3. Is the JSON bundle intended for users, support, or both? The name and privacy preflight should follow that audience.
4. Should local Copilot cumulative counts be shown as a total only, or normalized into a time window before target comparisons?
5. Should status-bar text represent Augment credits only, with assistant activity in the tooltip, or rotate/summarize multiple assistants?
6. Is `sqlite3` a supported user requirement for local Copilot tracking? If yes, it must appear in Requirements and the Copilot empty state.
