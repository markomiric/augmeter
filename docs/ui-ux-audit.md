# UI/UX audit and improvement plan

Date: 2026-09-07. Scope: the complete Augmeter extension, including its dashboard,
status bar and tooltip, Command Palette, connection prompts, native settings,
notifications, exports, provider collection, and extension lifecycle.

## Platform and evidence

Augmeter is a desktop VS Code UI extension. Narrow editor panes, window zoom,
keyboard use, and light/dark/high-contrast themes are the relevant responsive
surfaces. There is no separate mobile screen or browser-hosted extension build.

Research used Brave Search, Context7 (`/websites/code_visualstudio_api`), and
codebase retrieval. The implementation follows [VS Code webview guidance](https://code.visualstudio.com/api/ux-guidelines/webviews),
[webview state and messaging](https://code.visualstudio.com/api/extension-guides/webview),
[status bar conventions](https://code.visualstudio.com/api/ux-guidelines/status-bar),
and WCAG guidance on [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow),
[target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
and [visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).

The baseline was opened in a real VS Code 1.104.1 extension host with a disposable
profile. The first-run restricted-workspace journey confirmed the native trust
boundary, dashboard heading structure, and missing dashboard recovery actions.
Automated extension-host checks and rendered checks are recorded separately below.

## Prioritized implementation plan

| Priority | Finding and user impact                                                                                                                                                 | Improvement                                                                                                                                                                                | Owning surface                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| P1       | Provider cards replace health information with cached counts; an unavailable source can look healthy. Augment failure health is omitted entirely.                       | Keep source health and recovery guidance visible beside retained values, distinguish unavailable from disconnected.                                                                        | `src/ui/usage-dashboard.ts`                      |
| P1       | The dashboard is a dead end: connection and refresh instructions name commands without offering actions.                                                                | Add direct Refresh, Settings, Connect, and secondary export/support actions using native controls and a fixed command allowlist.                                                           | Dashboard and usage commands                     |
| P1       | Assigning `webview.html` on every data change resets the document, disclosure state, and keyboard context. Timestamp-only changes are skipped, leaving freshness stale. | Update content by message, preserve disclosure state, focus and scroll, and include all displayed data in change detection.                                                                | Dashboard and usage commands                     |
| P2       | Empty/error sentences receive the same large bold treatment as usage metrics. Source text is tiny and uppercase; the VS Code font preference is ignored.                | Separate metric/state styles, use VS Code font and color tokens, consistent spacing, readable source labels, visible focus, and minimum target sizes.                                      | Dashboard CSS                                    |
| P2       | A previous weekly snapshot is presented as the previous seven-day period; those snapshots can be only minutes apart.                                                    | Remove the unsupported comparison rather than invent historical semantics.                                                                                                                 | Dashboard provider summary                       |
| P2       | Repeated introductory copy competes with the values.                                                                                                                    | Keep one short source explanation and place methodology and occasional actions behind native disclosures.                                                                                  | Dashboard structure                              |
| P1       | Connecting always reports success even when credit loading fails; CLI-only errors and disconnect failures can be silent.                                                | Distinguish a saved connection from failed credit loading and unrelated local failures, provide Retry, report disconnect results, and make clipboard cancellation close the shared prompt. | Connection commands and clipboard watcher        |
| P1       | Missing source quotas fall back to 1,000 credits, manufacturing a limit and derived percentages.                                                                        | Keep usage-only data, explicitly label a missing limit, and omit unsupported remaining, percentage, and depletion claims.                                                                  | API parser, tracker, summary, status bar         |
| P1       | A late request can restore a disconnected or superseded connection.                                                                                                     | Invalidate API/CLI requests when credentials or sources change; ignore obsolete responses.                                                                                                 | API/CLI sources and runtime                      |
| P1       | A transient local scan failure replaces recorded counts with an empty result; unreadable directories are swallowed.                                                     | Retain previous values with failure health and propagate directory read failures. Continue clearing disabled, restricted, or missing sources.                                              | Provider service and file traversal              |
| P1       | Copy Diagnostics includes local paths, account usernames, and arbitrary provider details.                                                                               | Redact identifying configuration and omit raw source messages/details from support diagnostics. Preserve intentional full-data JSON export.                                                | Diagnostic formatter                             |
| P2       | Repeated manual/background requests perform duplicate work; pausing can leave an in-flight poll scheduling another timer.                                               | Share an active refresh, prevent paused collection/rescheduling, and retain the last displayed values with a paused notice.                                                                | Usage tracker and commands                       |
| P2       | Granting workspace trust requires another refresh before counts appear.                                                                                                 | Trigger collection when VS Code grants trust.                                                                                                                                              | Runtime lifecycle                                |
| P2       | The interactive status-bar item overrides its native role with a status announcement role; stale health is missing.                                                     | Preserve its native interactive role and explicit accessible label, reset loading actions, and include current source health in the tooltip.                                               | Status bar                                       |
| P2       | Empty assistant selection silently restores defaults; conflicting thresholds can exceed 100%.                                                                           | Respect an empty selection and keep warning/high/critical ordered at or below 100%.                                                                                                        | Configuration and settings manifest              |
| P2       | Settings opens a broad search with unrelated matches; sub-day run-out copy rounds up to a day; five-minute local cache behavior is undocumented.                        | Open the exact extension filter, use hours for short projections, and explain cache freshness/manual bypass.                                                                               | Commands, notifications, settings, documentation |
| P2       | Persistence exceptions are logged but can still yield a successful refresh result.                                                                                      | Propagate failed writes to the coordinator so refresh health and feedback report failure.                                                                                                  | Usage tracker                                    |

Implement in that order, then run focused regressions, the full source gate,
packaged VSIX acceptance, and actual keyboard/pointer journeys in VS Code.
Preserve all valuable commands, official-versus-local labeling, balance-only CLI
semantics, secure storage, and workspace trust.

The dashboard remains one screen. Native Settings, Command Palette, save dialogs,
input validation, buttons, disclosures, and the status bar remain the shared
platform components. Existing provider copy helpers and metric-card styles are
reused; spacing and border tokens are consolidated in the dashboard. No UI
framework, runtime dependency, additional navigation layer, or mobile-specific
screen was added.

## Codebase coverage

The review followed the complete production path: activation and bootstrap;
configuration, authentication, secrets, storage, logging, and notifications;
Augment API/CLI parsing; Claude/Codex JSONL collection; local/API Copilot
collection; polling, rates, projections, and alerts; all command handlers; the
status bar, tooltip, and dashboard. The manifest, shipped images, documentation,
build scripts, unit tests, and source/packaged extension-host tests were checked
against those journeys.

Preserved functionality includes all nine contributed commands, all assistant
sources, credit history and export formats, source/window labels, billing-cycle
targets, notifications, background polling, secure cookie storage, and workspace
trust restrictions. The deprecated monthly-target setting remains compatible
with existing user configuration.

## Executed user journeys

Native checks used macOS and VS Code 1.104.1 with a disposable profile, a generated
workspace, synthetic Claude/Codex JSONL logs, and a loopback Augment API fixture.
The connection string was synthetic; no live provider account was used.

| Surface / journey                                                           | Observed result                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First run in an untrusted workspace → open Assistant usage                  | Local reads restricted; source guidance and native trust boundary visible.                                                                                                                                    |
| Grant trust → collect local activity                                        | Synthetic Claude/Codex counts and missing-Copilot guidance displayed. Immediate trust-trigger behavior also has a focused runtime regression.                                                                 |
| Dashboard → Connect → invalid cookie → valid fixture cookie                 | Native validation rejected the short input; connection loaded the expected 420/1,000 credits and 580 remaining. External browser launch was canceled; the loopback fixture supplied connection data.          |
| Connected → API 503 → Refresh → recovery                                    | Prior readings retained with failure health; expanded methodology remained open; recovery showed 460 used and 540 remaining and cleared stale health.                                                         |
| Exports and support → CSV / JSON save                                       | Both native save dialogs produced parseable files matching the synthetic readings. JSON contains usage, providers, and configuration; CSV contained the expected history records.                             |
| Start JSON export → Cancel                                                  | Returned to the originating dashboard control without a new export.                                                                                                                                           |
| Copy credit summary                                                         | Clipboard contained 460/1,000, 540 remaining, and a sub-day projection expressed in hours.                                                                                                                    |
| Copy diagnostics                                                            | Clipboard contained the expected diagnostic payload without configured fixture paths or a cookie field. Redaction of account usernames and raw details is covered by focused tests.                           |
| Settings                                                                    | The command opened `@ext:kamacode.augmeter` with 24 settings; baseline broad search returned 27 including unrelated settings. Native labels, checkboxes, path inputs, and assistant selection were inspected. |
| Disable collection → return to dashboard → run Refresh from Command Palette | Paused notice and disabled Refresh visible; last readings preserved; Command Palette reported how to re-enable collection. Re-enabling restored controls and collection.                                      |
| Disconnect → local dashboard                                                | Visible success feedback; Augment metrics removed, local activity retained, Connect available, and focus returned to Refresh when the disconnect control disappeared.                                         |
| Status bar and accessibility tree                                           | Interactive item exposed as a button with a credit summary label; native meter exposed its label and percentage.                                                                                              |

## Rendered accessibility and responsive checks

The production HTML renderer is exercised in real Chromium at 320, 520, 800, and
1,280 CSS pixels with VS Code Dark Modern, Light Modern, High Contrast Black, and
High Contrast Light theme tokens. States cover connected, disconnected, empty,
restricted, paused, unavailable with retained values, balance-only CLI, and
official Copilot API usage. The native app does not ship a mobile version;
narrow-pane reflow and text enlargement are the applicable cross-size checks.

The matrix checks horizontal overflow and visible control target sizes. Axe runs
WCAG A/AA rules through 2.2 on the narrowest and widest cases. Keyboard checks
exercise Tab, Enter, visible focus, disclosures, refresh busy/completion feedback,
and focus/scroll/disclosure retention after data updates. Text size is doubled at
320px. These checks supplement the native accessibility tree; they do not replace
a full VoiceOver/NVDA reading session or establish blanket WCAG conformance.

Final result: **144 layout/state cases and 72 axe audits passed**, with no reported
WCAG-rule violations, horizontal overflow, undersized visible controls, or page
errors in the tested matrix. Keyboard navigation, refresh busy/completion states,
focus/disclosure/scroll preservation, and doubled text size passed. The ninth
state covers known usage without a reported quota. Final screenshots were
visually reviewed, including both high-contrast themes and the narrow error view.

The first high-contrast fixture used incomplete theme JSON defaults. It was
replaced with resolved colors captured from the real VS Code theme stylesheet;
the complete matrix was rerun with those values. `images/tooltip.png` now shows
the production dashboard with illustrative data.

## Final verification

All implementation items in the prioritized table are complete. Review also
caught updates dropped while a webview is hidden: the dashboard now refreshes
when made visible and does not cache an undelivered message as displayed.

| Command / check                                                | Final outcome                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run format`                                               | Passed.                                                                                                                                                                                                      |
| `just check`                                                   | Passed: Prettier, ESLint, TypeScript, 233 unit tests across 24 files, and 46 native VS Code integration tests. Overall unit coverage: 64.4% statements, 76.38% branches. This is not complete path coverage. |
| `npm run test:packaged`                                        | Passed: 45 archive entries, 231,527-byte VSIX, isolated installation, activation from the installed directory, and two packaged extension-host tests including the connection lifecycle.                     |
| `npm run analyze:knip`                                         | Passed, no unused files or issues. Updated its test-entry glob to recognize the existing packaged startup test, which had been incorrectly reported as unused.                                               |
| `node /private/tmp/augmeter-rendered-check.cjs --public-image` | Passed: 144 cases, 72 axe audits, keyboard/focus/scroll/text enlargement, no page errors; regenerated the public synthetic screenshot.                                                                       |
| `git diff --check`                                             | Passed.                                                                                                                                                                                                      |

The first source-gate attempt exposed a real secret-notification race during
sign-in and Settings contamination between integration tests. The race and test
cleanup were corrected, and the full gate passed in a fresh disposable profile.
The first packaged attempt hit a native VS Code CLI abort after listing the
extension; a full retry passed without weakening the package checks.

Local evidence is under `report/ui-ux/` (gitignored and excluded from the VSIX):
`just-check.log`, `packaged-check.log`, `knip.log`, `rendered-results.json`, theme
screenshots, sanitized copied diagnostics, the synthetic summary, and a copy of
the rendering harness and theme tokens. The native CSV/JSON exports were parsed
and checked against the fixture data in the disposable test directory.

## Perceived performance and remaining limits

Refresh requests share work; dashboard updates preserve the document and user
context; initial storage reads run together; identical displayed data skips
rendering; pausing stops future polling without erasing the visible readings.
Local scanner caching remains in place and is now explained in Settings.

A warm 100-sample CPU check of the production HTML renderer with 5,000 synthetic
readings measured a **6.745 ms median and 22.886 ms p95** on this machine. This
measures rendering computation only, not provider I/O, webview painting, or an
end-to-end latency improvement. No additional rendering framework or worker was
justified by that result.

- Provider requests retain the existing 30-second attempt timeout and retry policy.
  Manual refresh has busy feedback but no user cancellation; request cancellation
  remains a lower-priority follow-up if slow-network testing warrants it.
- Native user journeys were tested on macOS with VS Code 1.104.1. Windows/Linux,
  current stable VS Code, a full VoiceOver/NVDA reading session, and physical
  mobile devices were not exercised. Augmeter does not ship a mobile UI.
- Provider data was synthetic. Live Augment authentication, real Auggie login,
  real GitHub billing access, and Marketplace publication were not verified or
  changed. The packaged artifact and local source are the completed proof scope.
