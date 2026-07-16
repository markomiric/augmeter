# Plan: Performance Audit and Optimization

## Task Description

Run a comprehensive, multi-dimensional performance audit across the `augmeter` VS Code extension and apply the highest-impact optimizations. Coverage spans every load-bearing surface of the extension: activation cost on `onStartupFinished`, the `UsageTracker` polling loop and listeners in `runtime-coordinator`, status-bar refresh cost in `src/ui/`, local provider telemetry I/O in `src/providers/adapters/*`, the `AugmentApiClient` HTTP retry/cache path, memory and disposable hygiene across the bootstrap graph, the shipped `.vsix` payload (tsc output + `.vscodeignore`), Vitest + `@vscode/test-cli` runtime, and CI wall-clock in `.github/workflows/ci.yml`.

The audit must be **evidence-backed** (line-anchored citations, before/after measurements where feasible), **adversarially verified** (each finding must survive an independent skeptic pass before reaching the fix queue), and **unbounded in discovery scope** (loop until two consecutive empty rounds rather than capping at a fixed number of issues). The audit also draws on external sources the user explicitly named — `brave-search` for VS Code extension perf best practices, `context7` for current `vscode` API + Node.js + Vitest docs, and `auggie` (`mcp__auggie__codebase-retrieval`) for cross-file semantic retrieval inside the repo.

Confirmed findings then fan out into isolated optimization agents, each working in a git worktree to avoid parallel mutation conflicts, with the existing quality gates (`just check`, `npm run test:cov`, `npm run test:integration`, `npm run package`) as the regression backstop.

**Session Type**: Review (with a Development tail for the optimizations the audit confirms)

## Objective

Produce a ranked, evidence-backed list of performance findings across activation, polling, I/O, HTTP, memory, bundle, and CI dimensions; then land the confirmed top-N optimizations on `main` with all quality gates green and measurable (or argued) improvements over baseline.

## Problem Statement

`augmeter` has grown to ~1.6k lines across the four hottest files (`usage-tracker.ts` 548, `runtime-coordinator.ts` 354, `status-bar.ts` 368, `augment-api-client.ts` 343) plus three local provider adapters that touch the user's disk on every refresh. The extension activates on `onStartupFinished` — every millisecond there is felt by every user. There is no current systematic baseline for:

- How long activation takes from `activate()` to first status-bar render
- How much CPU the polling loop costs at the default interval (and how that scales with all three providers enabled)
- Whether retry/backoff in `AugmentApiClient` masks slow paths
- Whether listener and `Disposable` cleanup is complete (a leaked listener compounds across reloads)
- Whether the shipped `.vsix` carries any payload it does not need
- Whether CI is doing redundant work (e.g. coverage and integration both compiling)

A single-context audit risks **goal drift** (each new finding crowds out the prior list), **agentic laziness** (declaring "audit done" at 8 issues when 14 exist), and **self-preferential bias** (Claude accepting its own thinly-evidenced findings). Those are exactly the failure modes a dynamic workflow exists to fix.

## Solution Approach

A dynamic workflow harness (`/workflow-build`) composing four patterns:

1. **Fan-out-and-synthesize** — one auditor agent per perf dimension, each with a clean context window and a tight prompt. Three external-research agents (brave-search, context7, auggie) feed the audit phase. A final synthesizer barrier ranks the deduped, verified findings.
2. **Loop-until-dry** — after the first audit pass, a _completeness critic_ asks "which dimension was skipped, which claim is unverified, which file was not read." Surfaced gaps are queued for another audit pass. Stop when **K=2** consecutive rounds surface zero new findings (not a fixed pass count). All bounded coverage is `log()`-ed.
3. **Adversarial verification** — every surviving candidate is graded by **N=3** independent skeptics whose prompts default to `refuted=true`. A finding survives only when **at least 2 of 3 uphold it**. This is the explicit counter to self-preferential bias.
4. **Generate-and-filter** — confirmed findings are deduped (file + line + dimension key) before optimization, then ranked by (impact × confidence) / effort. Only the top-N within the token budget proceed to the optimization phase.

Optimization agents run with `isolation: 'worktree'` because they mutate files in parallel; each is paired with a validation step that runs the project's own gates (`npm run lint`, `npm run compile`, `npm run test:cov`, `npm run test:integration`, `npm run package`) inside that worktree. A final synthesis agent prepares the merge sequence (which worktrees land first, which conflict, what to discard).

This shape is workflow-worthy because the discovery space is unknown-size, the verification is adversarial, the work fans out cleanly per dimension, and cross-context contamination between findings is exactly the bias the harness eliminates.

## Workflow Harness

> Emitted because the task fires 4 of 6 workflow-worthy signals (massively parallel fan-out across dimensions, adversarial verification, unknown-size discovery, cross-context-contamination risk). Consumed by `/workflow-build`, which translates this section into a JavaScript harness and runs it via the Workflow tool. Grounded in `.claude/skills/session-management/practices/workflow-patterns.md`.

### Chosen Pattern(s)

Composite: **fan-out** across dimensions and research sources → **loop-until-dry** for missed coverage (K=2) → barrier dedup → **adversarial verification** (N=3 skeptics per finding, majority-refute kills) → **generate-and-filter** ranking → fan-out **optimization** in worktrees → pipeline validation per worktree → final synthesis. The audit phase is parallel-barrier (synthesize needs all findings to dedup); the verification + optimization + validation tail is `pipeline()` so each surviving finding flows downstream without waiting for siblings.

### Meta

- name: `perf-audit-and-optimize`
- description: Multi-dimension performance audit of the augmeter VS Code extension with adversarially-verified findings and worktree-isolated optimizations.
- phases: `["research", "audit", "completeness-loop", "verify", "synthesize", "optimize", "validate", "merge-plan"]`

### Agent Roles

- Role: `brave-perf-researcher`
  - Phase: `research`
  - Prompt: "Use brave_web_search and brave_summarizer to gather current best practices for VS Code extension performance: activation cost, status-bar polling, subprocess/file I/O, disposable hygiene, bundle size, marketplace size limits, and CI cost on `xvfb-run` with `@vscode/test-cli`. Prefer official VS Code docs, Microsoft engineering blog, and the `vscode-extension-samples` repo. Return a structured catalog of recommendations with source URLs and applicability notes. Do NOT speculate."
  - Schema: `RESEARCH_NOTES_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `context7-api-researcher`
  - Phase: `research`
  - Prompt: "Use mcp**context7**resolve-library-id and mcp**context7**query-docs to fetch current documentation for: vscode (extension API, StatusBarItem, SecretStorage, Disposable, FileSystemWatcher), node:fs/promises, node:fetch (Node 20 undici), vitest performance options, and @vscode/test-cli. Return a structured digest of API patterns relevant to activation cost, polling cadence, and disposable cleanup. Cite the exact API names and any deprecations."
  - Schema: `RESEARCH_NOTES_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `auggie-codebase-cartographer`
  - Phase: `research`
  - Prompt: "Use mcp**auggie**codebase-retrieval to map the hot paths in this repo: the activation chain from `src/extension.ts` through `src/bootstrap/extension-bootstrap.ts` and `src/bootstrap/runtime-coordinator.ts`; the polling cycle in `src/features/usage/usage-tracker.ts`; HTTP path in `src/services/augment-api-client.ts`; provider adapters in `src/providers/adapters/*`; status-bar in `src/ui/status-bar.ts` and `src/ui/status-bar-logic.ts`. For each hot path, return the call chain, the disposables created, the timers/listeners registered, and any synchronous file/process operations. Also list every `setInterval`, `setTimeout`, and `fs.readFileSync` in `src/`."
  - Schema: `CODEBASE_MAP_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `codestats-graph-mapper`
  - Phase: `research`
  - Prompt: "Run `codestats impact --changed --json`, `codestats communities --coupling --json`, `codestats flows --json`, and `codestats cycles --json` from the repo root. Summarize: top-10 hotspots by centrality, any cycles, any dead code, and the modules with the largest blast radius. Return structured data; do not edit files."
  - Schema: `CODEBASE_MAP_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `activation-auditor`
  - Phase: `audit`
  - Prompt: "Audit activation cost end-to-end. Read `src/extension.ts`, `src/bootstrap/extension-bootstrap.ts`, `src/bootstrap/runtime-coordinator.ts`. The extension activates on `onStartupFinished` — every ms is felt by every user. Look for: synchronous I/O during activation, eager construction of all services, unnecessary `await` chains that could parallelize, modules that could lazy-load behind first command/poll, missing `extensionMode === Test` gates. Use the research-phase outputs (best practices, codebase map) as context. Return findings as `FINDING[]` with file:line citations and severity. Default to fewer-but-stronger findings; if a claim has no concrete file:line, do NOT emit it."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `polling-auditor`
  - Phase: `audit`
  - Prompt: "Audit the polling loop in `src/features/usage/usage-tracker.ts` (548 lines) and how `runtime-coordinator.ts` drives it. Look for: poll cadence not adapting to focus/blur, redundant work each tick, race conditions between configuration changes and the active tick, listeners that re-register on every config change, exponential growth in retry windows that could starve, missing backoff jitter, timers not cleared on dispose. Cross-reference `ConfigManager` config sources to see whether changes invalidate caches correctly."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `io-auditor`
  - Phase: `audit`
  - Prompt: "Audit local file and subprocess I/O in `src/providers/adapters/claude-provider-adapter.ts`, `src/providers/adapters/codex-provider-adapter.ts`, `src/providers/adapters/copilot-provider-adapter.ts`, `src/providers/local-file-utils.ts`, and `src/services/auggie-cli-source.ts`. Look for: `readFileSync` on hot paths, repeated stat/read of the same file per tick, unbounded directory walks, missing file size caps, subprocess spawn cost, missing watcher debounce, lack of caching keyed on mtime. Cite file:line for each finding."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `http-auditor`
  - Phase: `audit`
  - Prompt: "Audit `src/services/augment-api-client.ts` (343 lines), `src/core/http/`, and `src/services/augment-detector.ts`. Look for: retry storms that mask root-cause slowness, missing per-request timeouts, missing AbortController plumbing, cache TTLs that revalidate too aggressively or never invalidate on config change, redundant header construction, deserializing bodies you do not use, missing 304/ETag handling if the server supports it. Cross-reference research-phase notes on Node 20 undici."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `memory-auditor`
  - Phase: `audit`
  - Prompt: "Audit memory and disposable hygiene. Read every file that registers a Disposable, EventEmitter listener, timer, or watcher. Map each registration to its dispose path. Look for: listeners added in constructors but disposed conditionally, timers not cleared on dispose, `onDidChangeConfiguration` handlers that re-allocate without releasing prior state, closures that retain large objects (e.g. full provider snapshots) beyond their useful life, status-bar tooltip strings rebuilt on every paint. Use the codestats centrality data to focus on the highest-coupling nodes."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `bundle-auditor`
  - Phase: `audit`
  - Prompt: "Audit the shipped `.vsix` payload. Read `package.json`, `tsconfig.json`, `.vscodeignore`, `knip.jsonc`. Run `npm run package` if needed to inspect the produced `.vsix`. Look for: source maps shipped to users, dev-only modules included, test artifacts leaking, unused exports keepable by knip, redundant `out/test/**` paths, the icon size, the `images/` directory size. Note: this extension has zero runtime dependencies — verify and flag any drift. Return findings with concrete byte-size estimates where possible."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `ci-auditor`
  - Phase: `audit`
  - Prompt: "Audit CI wall-clock and cost. Read `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `package.json` scripts, `vitest.config.ts`, `.vscode-test.mjs`, `justfile`. Look for: duplicated compile steps between `test:cov` and `test:integration`, missing actions/cache for `~/.npm` and `node_modules`, sequential steps that could parallelize across jobs, `xvfb` running for jobs that do not need it, `npm install` instead of `npm ci`, `npm audit` failing on transitive issues that could be allowlisted. Report wall-clock implications, not just diffs."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `ui-render-auditor`
  - Phase: `audit`
  - Prompt: "Audit `src/ui/status-bar.ts` (368 lines), `src/ui/status-bar-logic.ts`, `src/ui/usage-dashboard.ts`, `src/commands/usage-command-formatters.ts`. Look for: tooltip MarkdownString rebuilt every poll when nothing changed, `StatusBarItem.text` set to identical values causing redundant repaints, dashboard QuickPick items computed eagerly when most users never open it, formatters that JSON.stringify large objects per render. Verify `status-bar-logic.ts` remains pure (no `vscode` value imports) per the repo-primer constraint."
  - Schema: `FINDING_LIST_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `completeness-critic`
  - Phase: `completeness-loop`
  - Prompt: "Given the full set of confirmed findings so far (passed as `args.findings`) and the codebase map (`args.codebaseMap`), what perf dimension was skipped, what claim is unverified, which hot path was not read, which file in `src/` has zero findings against it that should be scrutinized? Return a list of MISSED dimensions with a concrete audit prompt for each. Return an empty list if coverage is complete. Be skeptical: if you cannot name a specific file or symbol, return empty."
  - Schema: `MISSED_DIMENSIONS_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `skeptic` (×3 per finding)
  - Phase: `verify`
  - Prompt: "Adversarially verify this performance finding (passed as `args.finding`). Default to refuted=true unless you can independently confirm: (a) the cited file:line actually does what the finding claims, (b) the perf impact is real on the augmeter codebase (not just generally true), (c) the proposed fix does not regress correctness or simplicity. Read the file. Run `rg`/`grep` to check assumptions. Return `{refuted: boolean, confidence: number 0-1, reasoning: string}`. A finding survives if at least 2 of 3 skeptics return refuted=false."
  - Schema: `VERDICT_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `synthesizer`
  - Phase: `synthesize`
  - Prompt: "Given the upheld findings (passed as `args.upheldFindings`), dedupe by (file + line + dimension key), rank by (impact × confidence) / effort, and return a ranked list with: id, dimension, file, line, summary, recommended fix sketch, estimated effort (S/M/L), confidence (0-1), impact (low/medium/high). Cap the top-N within budget.remaining() at ~80k tokens per planned optimizer agent (so N = min(findings, floor(budget.remaining()/80000) - validation reserve)). Log() how many findings were dropped from the top-N and why."
  - Schema: `RANKED_FINDINGS_SCHEMA`
  - Model: inherit
  - Isolation: none

- Role: `optimizer` (one per top-N finding)
  - Phase: `optimize`
  - Prompt: "Implement the recommended fix for this finding (passed as `args.finding`). Work in this worktree only. Constraints from CLAUDE.md and repo-primer.md apply absolutely: zero new runtime dependencies, strict TypeScript, no `console` outside `SecureLogger`, `status-bar-logic.ts` must remain pure, never log secrets. Run `npm run lint` and `npm run compile` before declaring done. Return a structured `OPTIMIZATION_RESULT` with files_changed, before/after evidence (commands run + outputs), and any concerns."
  - Schema: `OPTIMIZATION_RESULT_SCHEMA`
  - Model: inherit
  - Isolation: `worktree` — REQUIRED because optimizers mutate files in parallel and would otherwise conflict on the same paths (usage-tracker.ts, status-bar.ts, etc. are touched by multiple dimensions).

- Role: `validator` (one per optimizer)
  - Phase: `validate`
  - Prompt: "Validate the optimization (passed as `args.optimizationResult`) inside its worktree. Run, in order: `npm run lint`, `npm run format:check`, `npm run compile`, `npm run test:cov`, `npm run test:integration`, `npm run package`. Capture exit code and last 40 lines of output per command. Verify acceptance criteria: tests pass, coverage gates hold, .vsix builds, no new console output. Return `{verified: boolean, command_results: [...], regressions: [...], notes: string}`. Do NOT modify files — this is read-only validation."
  - Schema: `VALIDATION_RESULT_SCHEMA`
  - Model: inherit
  - Isolation: none (validator runs inside the optimizer's worktree path read-only)

- Role: `merge-planner`
  - Phase: `merge-plan`
  - Prompt: "Given the validated optimizations (passed as `args.validated`), produce a recommended merge sequence: which worktrees land first, which two touch the same file and need rebasing, which should be combined into one PR vs split, which should be discarded (validator regressed). Return a structured merge plan with the actual git commands per step. Do NOT execute the merges."
  - Schema: `MERGE_PLAN_SCHEMA`
  - Model: inherit
  - Isolation: none

### Structured Output Schemas

- Schema "RESEARCH_NOTES_SCHEMA":

```json
{
  "type": "object",
  "required": ["source", "notes"],
  "properties": {
    "source": { "type": "string", "enum": ["brave-search", "context7", "auggie", "codestats"] },
    "notes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["topic", "summary", "applies_to"],
        "properties": {
          "topic": { "type": "string" },
          "summary": { "type": "string" },
          "applies_to": { "type": "array", "items": { "type": "string" } },
          "url": { "type": "string" },
          "api_or_pattern": { "type": "string" }
        }
      }
    }
  }
}
```

- Schema "CODEBASE_MAP_SCHEMA":

```json
{
  "type": "object",
  "required": ["hot_paths"],
  "properties": {
    "hot_paths": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "files", "disposables", "timers_or_listeners", "sync_io"],
        "properties": {
          "name": { "type": "string" },
          "files": { "type": "array", "items": { "type": "string" } },
          "disposables": { "type": "array", "items": { "type": "string" } },
          "timers_or_listeners": { "type": "array", "items": { "type": "string" } },
          "sync_io": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "hotspots": { "type": "array", "items": { "type": "object" } },
    "cycles": { "type": "array", "items": { "type": "string" } },
    "dead_code": { "type": "array", "items": { "type": "string" } }
  }
}
```

- Schema "FINDING_LIST_SCHEMA":

```json
{
  "type": "object",
  "required": ["dimension", "findings"],
  "properties": {
    "dimension": { "type": "string" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "title",
          "file",
          "line",
          "description",
          "severity",
          "estimated_impact",
          "estimated_effort",
          "evidence",
          "proposed_fix"
        ],
        "properties": {
          "title": { "type": "string" },
          "file": { "type": "string" },
          "line": { "type": "integer" },
          "description": { "type": "string" },
          "severity": { "type": "string", "enum": ["critical", "important", "minor"] },
          "estimated_impact": { "type": "string", "enum": ["low", "medium", "high"] },
          "estimated_effort": { "type": "string", "enum": ["S", "M", "L"] },
          "evidence": { "type": "string" },
          "proposed_fix": { "type": "string" }
        }
      }
    }
  }
}
```

- Schema "MISSED_DIMENSIONS_SCHEMA":

```json
{
  "type": "object",
  "required": ["missed"],
  "properties": {
    "missed": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["dimension", "rationale", "audit_prompt"],
        "properties": {
          "dimension": { "type": "string" },
          "rationale": { "type": "string" },
          "audit_prompt": { "type": "string" }
        }
      }
    }
  }
}
```

- Schema "VERDICT_SCHEMA":

```json
{
  "type": "object",
  "required": ["refuted", "confidence", "reasoning"],
  "properties": {
    "refuted": { "type": "boolean" },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "reasoning": { "type": "string" }
  }
}
```

- Schema "RANKED_FINDINGS_SCHEMA":

```json
{
  "type": "object",
  "required": ["ranked", "dropped"],
  "properties": {
    "ranked": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "rank",
          "dimension",
          "file",
          "line",
          "summary",
          "recommended_fix",
          "effort",
          "impact",
          "confidence"
        ],
        "properties": {
          "id": { "type": "string" },
          "rank": { "type": "integer" },
          "dimension": { "type": "string" },
          "file": { "type": "string" },
          "line": { "type": "integer" },
          "summary": { "type": "string" },
          "recommended_fix": { "type": "string" },
          "effort": { "type": "string", "enum": ["S", "M", "L"] },
          "impact": { "type": "string", "enum": ["low", "medium", "high"] },
          "confidence": { "type": "number" }
        }
      }
    },
    "dropped": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "reason"],
        "properties": { "id": { "type": "string" }, "reason": { "type": "string" } }
      }
    }
  }
}
```

- Schema "OPTIMIZATION_RESULT_SCHEMA":

```json
{
  "type": "object",
  "required": ["finding_id", "files_changed", "before", "after", "notes"],
  "properties": {
    "finding_id": { "type": "string" },
    "files_changed": { "type": "array", "items": { "type": "string" } },
    "before": { "type": "string" },
    "after": { "type": "string" },
    "notes": { "type": "string" },
    "worktree_path": { "type": "string" }
  }
}
```

- Schema "VALIDATION_RESULT_SCHEMA":

```json
{
  "type": "object",
  "required": ["verified", "command_results", "regressions"],
  "properties": {
    "verified": { "type": "boolean" },
    "command_results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["command", "exit_code", "tail"],
        "properties": {
          "command": { "type": "string" },
          "exit_code": { "type": "integer" },
          "tail": { "type": "string" }
        }
      }
    },
    "regressions": { "type": "array", "items": { "type": "string" } },
    "notes": { "type": "string" }
  }
}
```

- Schema "MERGE_PLAN_SCHEMA":

```json
{
  "type": "object",
  "required": ["sequence", "discarded"],
  "properties": {
    "sequence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["order", "finding_id", "worktree_path", "git_commands", "rationale"],
        "properties": {
          "order": { "type": "integer" },
          "finding_id": { "type": "string" },
          "worktree_path": { "type": "string" },
          "git_commands": { "type": "array", "items": { "type": "string" } },
          "rationale": { "type": "string" }
        }
      }
    },
    "discarded": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["finding_id", "reason"],
        "properties": { "finding_id": { "type": "string" }, "reason": { "type": "string" } }
      }
    }
  }
}
```

### Token Budget

- total: **400000** (400k tokens cap for the full audit + optimization run; this is a "comprehensive" request and the user explicitly asked for breadth — sized to allow ~10 dimension audits, ~3 research agents, up to 3 completeness loops, 3 skeptics per surviving finding, and ~5 worktree-isolated optimizers with validation).
- enforcement: The harness checks `budget.remaining()` (a) before each completeness-loop round (skip if `< 60_000`), (b) before fanning out the optimizer phase (cap top-N at `floor((budget.remaining() - 50_000 validation reserve) / 80_000)`), and (c) before launching the merge-planner (skip and `log()` if `< 20_000`). When the cap is hit mid-run, `log()` what was dropped and emit a partial result rather than a silent truncation.

### Worktree Usage

- `optimizer` role only — REQUIRED. Multiple optimizers may touch the same file (e.g. usage-tracker.ts is targeted by both polling and memory dimensions). Without per-agent worktrees they would race on the same paths. All other roles are read-only and never request a worktree.
- The `validator` role runs inside the optimizer's worktree path read-only; it does not request its own isolation.

### Stop Condition

- Audit/discovery: **K = 2** consecutive `completeness-loop` rounds that return zero new dimensions or zero net-new findings (after dedup against the surviving set). State of K is tracked in a counter and reset to 0 the moment a round surfaces ≥1 new finding.
- Optimization: bounded by the `top-N` computed at synthesize time from `budget.remaining()`. Not loop-until-dry — the audit's job is to be exhaustive, the optimization phase's job is to maximize impact within budget.

### Verification / Adversarial Sub-Structure

- **N = 3 skeptics per finding**, run as `pipeline()` (each surviving finding flows into verify the moment its dimension's audit completes — no barrier-wait for siblings).
- Each skeptic is prompted to **default to `refuted=true`** unless it can independently confirm the cited file:line, the impact-on-augmeter, and the absence of regression risk. This refutation-framed prompt is the explicit counter to self-preferential bias documented in workflow-patterns.md.
- A finding survives only when **at least 2 of 3 skeptics return `refuted=false`**. Ties (1 uphold, 1 refute, 1 null) → refuted. Each skeptic spawn is in a fresh context (no shared anchoring across the three).
- `validator` (different role) is the regression-side verification: it does not judge whether the finding was real, it judges whether the _fix_ broke anything.

### Dropped-Coverage Logging

The harness `log()`s, with counts and reasons:

- Every research source that returned zero applicable notes
- Every audit dimension that returned zero findings (could be "clean" — flag explicitly so the synthesizer does not silently assume coverage)
- Every completeness-loop round (counter + new finding count)
- Every finding refuted (with the majority reasoning, one line)
- Every finding dropped from top-N in synthesize (with budget-remaining at that point)
- Every validator regression that discards a worktree
- Every worktree that the merge-planner orders discarded and why

No silent caps. The user reads `/workflows` live progress and the final return; both must accurately report what was and was not covered.

## Relevant Files

Use these files to complete the task:

**Activation chain (every ms cost is amplified across all users):**

- `src/extension.ts` — `activate()` entry, 1 line of work + delegation
- `src/bootstrap/extension-bootstrap.ts` — DI wiring, eager construction
- `src/bootstrap/runtime-coordinator.ts` (354 lines) — auth state, polling loop driver, config/focus/secret listeners

**Polling + tracker hot path:**

- `src/features/usage/usage-tracker.ts` (548 lines) — largest file; orchestration
- `src/features/usage/usage-tracker-helpers.ts` — alerts, projections

**HTTP + API:**

- `src/services/augment-api-client.ts` (343 lines) — retry/backoff/caching
- `src/services/augment-detector.ts`, `src/services/session-reader.ts`, `src/services/usage-parsing.ts`
- `src/services/auggie-cli-source.ts` — subprocess source
- `src/core/http/` — fetch wrapper

**Local provider telemetry (disk-bound):**

- `src/providers/provider-adapter.ts`, `src/providers/provider-registry.ts`, `src/providers/provider-usage-service.ts`, `src/providers/local-file-utils.ts`
- `src/providers/adapters/claude-provider-adapter.ts`
- `src/providers/adapters/codex-provider-adapter.ts`
- `src/providers/adapters/copilot-provider-adapter.ts`

**UI:**

- `src/ui/status-bar.ts` (368 lines) — lifecycle + repaint
- `src/ui/status-bar-logic.ts` — pure logic (must stay pure per repo-primer)
- `src/ui/usage-dashboard.ts` — QuickPick
- `src/commands/usage-command-formatters.ts`

**Cross-cutting infrastructure:**

- `src/core/config/*` — ConfigManager + domain modules; subscribed everywhere
- `src/core/storage/*` — StorageManager + provider state
- `src/core/auth/*` — clipboard watcher (timer!), SecureSecretsManager
- `src/core/logging/`, `src/core/notifications/`, `src/core/errors/`, `src/core/types/`

**Package + build:**

- `package.json` — scripts, activationEvents, contributes
- `tsconfig.json` — strict, target ES2022, outDir `out/`
- `.vscodeignore` — already excludes `src/`, source maps, tests, configs
- `knip.jsonc` — dead-code rules; `@vscode/test-electron` is the documented gotcha
- `eslint.config.mjs`, `.prettierrc.json`, `vitest.config.ts`, `.vscode-test.mjs`

**CI:**

- `.github/workflows/ci.yml` — full gate chain (audit → format → lint → compile → test:cov → integration → package → SBOM)
- `.github/workflows/codeql.yml`, `.github/workflows/release.yml`
- `justfile` — local quality gate chain

### New Files

None expected. All work is in-place modifications. Each optimizer agent works in its own git worktree, so workspace files multiply transiently but the merge sequence collapses back to `main`.

## Implementation Phases

### Phase 1: Foundation (research + codebase map)

Three parallel research agents (`brave-perf-researcher`, `context7-api-researcher`, `auggie-codebase-cartographer`) plus `codestats-graph-mapper` run as a barrier. Their structured outputs become `args` for every downstream audit agent — auditors do not re-derive the codebase map or re-fetch docs.

### Phase 2: Core Implementation (audit → loop-until-dry → verify → synthesize → optimize → validate)

- **Audit fan-out**: 8 dimension auditors in `parallel()` (activation, polling, io, http, memory, bundle, ci, ui-render). Each emits a `FINDING_LIST`.
- **Completeness loop**: `completeness-critic` runs after the fan-out; any returned `missed` dimensions become new audit prompts. Loop until **K=2** empty rounds.
- **Barrier dedup**: all surviving findings deduped by (file + line + dimension key) — this is the canonical legitimate barrier exception from workflow-patterns.md.
- **Adversarial verify**: each deduped finding pipelines into 3 parallel skeptics; majority-refute kills.
- **Synthesize**: rank upheld findings; pick top-N within budget.
- **Optimize**: top-N in parallel, each in its own worktree (`isolation: 'worktree'` because they mutate files concurrently).
- **Validate**: per-optimization pipeline stage runs `lint → format:check → compile → test:cov → test:integration → package` and returns a structured verdict.

### Phase 3: Integration & Polish (merge plan + human approval)

- **Merge-planner**: orders the validated worktrees, identifies path conflicts, recommends combine-vs-split, names discards.
- The workflow returns: `{rankedFindings, optimizations, validations, mergePlan, droppedLog}`.
- The user reviews the return, picks which fixes to land (likely all green ones), then a follow-up `/build` or direct merge applies the merge-planner's recommended git commands. The workflow does NOT auto-push to `main`.

## Team Orchestration

- This plan is workflow-worthy. Execution is by `/workflow-build`, which materializes the harness above into a real JavaScript script and runs it via the `Workflow` tool.
- The "team members" listed below describe the **roles inside the harness** plus the **post-workflow human-approval and merge-application step**. They are NOT spawned as standalone `Task()` agents during the workflow itself — the harness owns spawning.
- A `quality-engineer` sub-agent is spawned _outside the workflow_, after the user picks which fixes to land, to do a final cross-cutting review of the merged result.

### Team Members

- Specialist (orchestrator)
  - Name: `perf-workflow-driver`
  - Role: Author/run the JS harness described in `## Workflow Harness`, monitor `/workflows`, surface the structured return to the user for selection
  - Agent Type: general-purpose
  - Resume: true
  - Spawn Description: `General Purpose - augmeter performance audit and optimization driver`
- Specialist (merge applier, AFTER workflow returns + user picks)
  - Name: `perf-merge-applier`
  - Role: Apply the `merge-planner`'s git commands for the worktrees the user approves; resolve any conflicts; create a single PR (or PR-per-fix per the merge plan)
  - Agent Type: general-purpose
  - Resume: true
  - Spawn Description: `General Purpose - augmeter performance optimization merge applier`
- Quality Engineer (Validator, AFTER merge)
  - Name: `perf-final-validator`
  - Role: Re-run the full `just check` chain on the merged branch; validate acceptance criteria below in read-only inspection mode; report pass/fail
  - Agent Type: quality-engineer
  - Resume: false

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Author Workflow Harness Script

- **Task ID**: `author-harness`
- **Depends On**: none
- **Assigned To**: perf-workflow-driver
- **Agent Type**: general-purpose
- **Parallel**: false
- Translate the `## Workflow Harness` section above into a JavaScript file (workflow scripts are JS, NOT TypeScript).
- Begin with the pure-literal `export const meta = {...}` block; phases array must mirror the one above exactly.
- Implement: `parallel()` for the research phase (barrier — downstream needs all four sources), `parallel()` for the initial audit fan-out (barrier — completeness-critic needs the full set), `pipeline()` from deduped-finding → 3-skeptic verify → enqueue-if-upheld, `parallel()` for synthesize (single agent — degenerate), `parallel()` for optimizers (each with `isolation: 'worktree'`), pipeline per-optimizer for validate.
- Implement the K=2 loop counter for completeness.
- Implement budget gates at the three checkpoints in `### Token Budget`.
- Implement `log()` calls per `### Dropped-Coverage Logging`.

### 2. Dry-Run Harness on a Subset

- **Task ID**: `dry-run-harness`
- **Depends On**: `author-harness`
- **Assigned To**: perf-workflow-driver
- **Agent Type**: general-purpose
- **Parallel**: false
- Run the harness with a limited scope (e.g. `args = {dimensions: ['activation', 'polling'], maxOptimizations: 1}`) to validate the script before committing the full budget.
- Verify: meta literal parses, every schema validates against a sample object, worktrees are created and torn down, no banned globals (`Date.now`, `Math.random`, `new Date()`).
- Capture any harness bugs and patch in `author-harness` before the full run.

### 3. Execute Full Workflow

- **Task ID**: `execute-workflow`
- **Depends On**: `dry-run-harness`
- **Assigned To**: perf-workflow-driver
- **Agent Type**: general-purpose
- **Parallel**: false
- Invoke `/workflow-build` (or call `Workflow({scriptPath, args})` directly) with the full budget (400k).
- Stream progress via `/workflows`; do NOT interrupt unless a hard failure surfaces.
- Capture the structured return: ranked findings, optimizations, validations, merge plan, dropped-coverage log.

### 4. Present Findings + Optimizations to User

- **Task ID**: `present-results`
- **Depends On**: `execute-workflow`
- **Assigned To**: perf-workflow-driver
- **Agent Type**: general-purpose
- **Parallel**: false
- Format the ranked findings as a concise table: rank, dimension, file:line, summary, effort, impact, validator-verdict.
- Highlight any optimizer that the validator marked unverified — the user must decide whether to discard or fix.
- Surface the dropped-coverage log so the user knows what the workflow did NOT cover.
- Ask the user to pick which optimizations to land (default: all green-validated; explicit opt-in for any unverified).

### 5. Apply Approved Optimizations

- **Task ID**: `apply-merges`
- **Depends On**: `present-results`
- **Assigned To**: perf-merge-applier
- **Agent Type**: general-purpose
- **Parallel**: false
- Execute the `merge-planner`'s git commands for the approved worktrees only.
- Resolve any conflicts manually (the merge plan flagged them in advance).
- Produce either a single PR or N PRs per the merge plan's `sequence[].rationale`.
- Do NOT push to main directly; open PR(s) for review.

### 6. Final Validation on Merged Branch

- **Task ID**: `validate-merged`
- **Depends On**: `apply-merges`
- **Assigned To**: perf-final-validator
- **Agent Type**: quality-engineer
- **Parallel**: false
- Operate in validation mode: read-only inspection, do not modify files.
- Run `just check` (full gate chain), `npm run test:all`, `npm run package`.
- Verify each acceptance criterion below is met.
- Spot-check 3 random merged worktree diffs to confirm the optimizer's `before/after` evidence matches what actually landed.
- Report pass/fail with command outputs; if fail, surface back to `perf-merge-applier` for fix.

### 7. Archive Plan + Update Memory

- **Task ID**: `archive-and-memorize`
- **Depends On**: `validate-merged`
- **Assigned To**: perf-workflow-driver
- **Agent Type**: general-purpose
- **Parallel**: false
- Move this plan file to `.claude/tasks/archive/`.
- If the workflow surfaced any reusable patterns (e.g. a perf-audit harness shape worth keeping), update or create a project-level memory note in `memory/`.
- If any finding revealed a CLAUDE.md / repo-primer convention worth promoting (e.g. "always check `extensionMode === Test` in activation"), prompt the user to update the docs.

## Quality Gates

Apply these gates during execution:

| Gate                | Validation                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implementation**  | Each optimizer's worktree passes `npm run lint`, `npm run compile`, and (for behaviour-changing fixes) `npm run test:cov`. No new runtime dependencies. `status-bar-logic.ts` remains pure. No `console` outside `SecureLogger`. No secrets in logs.                                                                               |
| **Integration**     | `npm run test:integration` (extension-host tests via `@vscode/test-cli`) passes for every merged worktree. Cross-worktree path conflicts identified by `merge-planner` are resolved.                                                                                                                                               |
| **Quality**         | Unit + integration coverage thresholds (configured in `vitest.config.ts` and `package.json#scripts.test:cov`) hold. `npm run analyze:knip` does not regress dead-code count. `npm run package` produces a `.vsix` no larger than baseline + 1KB unless explicitly justified.                                                       |
| **User Acceptance** | User reviews the ranked findings + validations and explicitly picks which optimizations to land. Unverified optimizations require explicit opt-in. Dropped-coverage log presented and acknowledged.                                                                                                                                |
| **Verification**    | Evidence before claims — every finding cites file:line, every optimization records before/after command output, every validation captures exit codes + 40-line tails. Adversarial verification (N=3 skeptics, majority-refute kills) is the structural guarantee; do NOT report a finding as "real" without recording its verdict. |

## Acceptance Criteria

- A structured workflow return that contains: ranked findings (each with file:line + evidence + skeptic verdicts), per-finding optimization result (with before/after command output), per-optimization validation result (with command exit codes + tails), and a merge plan.
- Adversarial verification ran with N=3 skeptics per finding and majority-refute logic was applied; no upheld finding has fewer than 2 of 3 skeptics returning `refuted=false`.
- Completeness loop ran until K=2 consecutive empty rounds OR the budget gate fired (and the gate firing was `log()`ed with remaining budget).
- All bounded coverage and dropped items are present in the dropped-coverage log; no silent caps.
- The full local quality gate chain (`just check`) passes on the post-merge branch.
- `npm run package` produces a `.vsix` that installs cleanly into a clean VS Code profile and shows the status bar within ~500ms of `onStartupFinished` (measured by manual stopwatch or a `SecureLogger` debug ms log added during the audit if missing).
- Zero new runtime dependencies. `status-bar-logic.ts` still has no `vscode` value imports. No `console` outside `SecureLogger`. Coverage thresholds in `vitest.config.ts` still pass.
- The plan file is moved to `.claude/tasks/archive/` after `validate-merged` reports green.

## Validation Commands

Execute these commands to validate the task is complete:

- `npm run lint` — ESLint v9 flat config, type-checked rules
- `npm run format:check` — Prettier
- `npm run compile` — `tsc` clean build to `out/`
- `npm run test` — Vitest unit tests (`src/unit/**/*.unit.test.ts`)
- `npm run test:cov` — unit tests + coverage gates
- `npm run test:integration` — extension-host tests (`@vscode/test-cli`, requires `xvfb-run` on Linux CI; local run uses `npm run compile-tests` first)
- `npm run test:all` — coverage + integration
- `npm run package` — `vsce package` → `.vsix`; inspect with `unzip -l augmeter-*.vsix | wc -l` and `du -sh augmeter-*.vsix` and compare to baseline captured before the audit
- `npm run analyze:knip` — dead-code; must not regress
- `just check` — full local quality gate chain (runs the above in the documented order)
- (Optional, post-merge) install the produced `.vsix` into a clean VS Code profile and stopwatch first status-bar paint after `onStartupFinished` to confirm activation-cost wins are real

## Notes

- The user explicitly named three external sources: **brave-search**, **auggie**, **context7**. The workflow has a dedicated agent role per source in the research phase. If any of these tools is unavailable at runtime (notably MCP servers in headless mode), the harness `log()`s the miss and continues — it does NOT silently skip.
- The codestats data set is the cheapest way to find structural perf issues (hotspots, cycles, dead code) and is treated as a first-class research source alongside the three named tools.
- The repo has **zero runtime dependencies** — this is an architectural decision. The audit must flag any "add a dep to fix this" suggestion as out-of-scope; the optimizer is forbidden from introducing one without an explicit follow-up plan that names the trade-off.
- The repo-primer's `@vscode/test-electron` gotcha (looks unused but `@vscode/test-cli` imports it at runtime) must be respected by `bundle-auditor` and any `knip`-related finding. The plan should not produce a finding that removes it.
- The `out/` directory is gitignored build output and must never be edited by any optimizer. The integration tests compile from TS source via `npm run compile-tests`.
- Activation is `onStartupFinished` — the lowest-priority activation event. The audit should still treat activation cost as user-visible because the status bar is what the user is waiting for; the event name is about _when VS Code lets us start_, not about whether the user cares about our speed once we do.
- The harness must NOT use `Date.now()`, `Math.random()`, or `new Date()` (they throw and break resume). Timestamps used inside the workflow must come from `args`; randomness for skeptic prompt variation comes from the agent index, not RNG.
- If the workflow is interrupted (user kills, network issue), `/workflow-build` supports resume via `resumeFromRunId` — the longest unchanged prefix returns cached results. This is why the harness is deterministic and free of those banned globals.
- The user is `marko` (marko.miric@protonmail.com). The default branch is `main`. Per CLAUDE.md, the merge-applier must NOT push to `main` directly; PRs only.
