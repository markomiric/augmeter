# Understanding assistant usage data

Augmeter combines local coding-assistant activity with usage reported by connected providers. The cards use different labels because the sources measure different things.

![Assistant Usage dashboard with illustrative local and provider-reported data](../images/tooltip.png)

_Rendered from the current dashboard with illustrative values. No local history, account data, or credentials are shown._

## Reading the dashboard

- **From local session history** means Augmeter counted local Claude Code or Codex user turns.
- **From VS Code on this device** means Augmeter read a cumulative local Copilot counter without a reliable time range.
- **Reported by GitHub** means GitHub supplied Copilot premium-request usage for the current billing period.
- **Official balance and cycle data from Augment** appears only when the connected source supplies those values.

Use **Refresh** to collect the latest enabled sources, **Settings** to choose sources, and **Exports and support** for occasional actions. If a refresh fails, the source status appears beside any retained values. Missing data is never treated as zero usage or an invented quota.

## What each number means

| Card           | Value                                                                 | Source                                                      | Important limitations                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code    | User turns in rolling 5-hour and 7-day windows                        | JSONL files under `~/.claude/projects`                      | Excludes tool results, metadata, and `subagents` directories. This is an activity signal, not an Anthropic quota.                                                           |
| Codex          | User turns in rolling 5-hour and 7-day windows                        | JSONL files under `~/.codex/sessions`                       | Counts root `event_msg` / `user_message` records and excludes sessions marked as subagents. This is an activity signal, not an OpenAI quota.                                |
| GitHub Copilot | Cumulative local requests, or premium requests for the billing period | VS Code's `state.vscdb`, or the GitHub API when enabled     | The local counter has no reliable time window. GitHub-reported usage is labeled separately and requires `GITHUB_TOKEN`.                                                     |
| Augment        | Remaining credits, monthly allowance, plan, and renewal date          | `auggie account status`, or the Augment API when configured | Current Auggie CLI output does not report exact cycle consumption. Augmeter therefore withholds percent used, pace, target progress, and trends for balance-only responses. |

## Why Augment may show more remaining than the monthly allowance

Rollover credits can make the remaining balance larger than the monthly allowance. These are separate values:

- **Remaining credits** is the exact balance reported by Auggie.
- **Monthly allowance** is the plan's regular monthly allocation.
- **Cycle usage** is shown only when the source reports enough information to calculate it reliably.

Augmeter does not infer `0 used` from a balance-only response. It also shows the renewal date without deriving a day countdown because Auggie provides a calendar date, not an exact renewal time.

## Freshness

Each card's **Updated** timestamp is when Augmeter last collected that source. It is not the time the dashboard webview happened to open, and it does not imply that a provider event occurred at that exact moment.

Background collection can reuse local assistant results for up to five minutes. Manual **Refresh** bypasses this cache. A disconnected optional Augment account does not make a successful local refresh fail.

Credit trends are changes between saved readings inside each labeled window, not guaranteed full-window totals. Partial history can cover less than the labeled period. Adjacent weekly snapshots are not compared as if they represented separate weeks.

## Status tooltip

The tooltip uses the same definitions as the dashboard: Claude Code and Codex are local user turns, local Copilot counts have no known time window, GitHub-reported Copilot usage is labeled separately, and balance-only Augment data never produces an invented percentage or pace.

## Verification paths

The production counting logic lives in:

- [`claude-provider-adapter.ts`](../src/providers/adapters/claude-provider-adapter.ts)
- [`codex-provider-adapter.ts`](../src/providers/adapters/codex-provider-adapter.ts)
- [`copilot-provider-adapter.ts`](../src/providers/adapters/copilot-provider-adapter.ts)
- [`auggie-cli-source.ts`](../src/services/auggie-cli-source.ts)
- [`usage-dashboard.ts`](../src/ui/usage-dashboard.ts)

Regression coverage for these semantics lives in the corresponding files under [`src/unit`](../src/unit).
