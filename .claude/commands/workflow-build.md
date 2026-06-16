---
description: Execute a workflow-worthy plan by emitting and running a dynamic-workflow JavaScript harness
argument-hint: [path-to-plan]
model: opus
disallowed-tools: EnterPlanMode
---

# Workflow Build

Execute the plan at `PATH_TO_PLAN` as a dynamic workflow. Unlike `/build` (isolated
sub-agents) and `/team-build` (collaborative Agent Teams), `/workflow-build` translates
the plan's `## Workflow Harness` section into a custom JavaScript harness and runs it
via the `Workflow` tool. Use it for workflow-worthy tasks: massively parallel fan-out,
adversarial verification, unknown-size discovery, or large-scale ranking.

## Foundation

`/workflow-build` is a self-contained execution command sharing the core pipeline
contract: read the plan, honor its session-type protocol, run validation, report
results. It diverges in mechanism: control flow lives in code (a deterministic
JavaScript harness), and models live inside each `agent()` call. It consumes the same
plan format produced by `/team-plan`, specifically the optional `## Workflow Harness`
section.

## Variables

PATH_TO_PLAN: $ARGUMENTS

## Prerequisites

Dynamic workflows ship enabled by default on all paid plans (research preview, Claude
Code v2.1.154+). There is no positive enable env var. On Pro, they may need turning on
from the Dynamic workflows row in `/config`. They are unavailable only if explicitly
disabled, via the `/config` toggle, `"disableWorkflows": true` in
`~/.claude/settings.json`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. If the Workflow tool is
unavailable, STOP and offer `/build` as a fallback.

## Workflow

### Phase 1: Plan Ingestion

1. If no `PATH_TO_PLAN` is provided, STOP and ask the user (AskUserQuestion).
2. Read the FULL plan at `PATH_TO_PLAN`.
3. Locate the `## Workflow Harness` section. If it is absent, STOP: the plan is not
   workflow-worthy. Tell the user and recommend `/build` or `/team-build`.
4. Extract the harness fields: Chosen Pattern(s), Meta, Agent Roles, Structured Output
   Schemas, Token Budget, Worktree Usage, Stop Condition, Verification sub-structure,
   Dropped-Coverage Logging.

### Phase 2: Harness Synthesis

Translate the declarative section into a real workflow JavaScript file. Apply the
emission best-practice checklist from
`.claude/skills/session-management/practices/workflow-patterns.md`:

1. Open with a pure-literal `export const meta = { name, description, phases }` taken
   from the Meta field. No variables or function calls inside the literal.
2. Map each Agent Role to an `agent(prompt, opts)` call. Attach `opts.schema` for
   structured returns. Omit `model` unless the role justified a pin. Set
   `isolation: 'worktree'` only for roles flagged for parallel file mutation.
3. Choose the orchestration shape from Chosen Pattern(s):
   - Multi-stage independent work -> `pipeline(items, stage1, stage2, ...)`.
   - A genuine barrier (dedup/merge across the full set, cross-item comparison,
     early-exit on zero) -> `parallel(thunks)` at that boundary only.
   - Unknown size -> a loop spawning finders until the Stop Condition (K consecutive
     empty rounds).
4. Insert `budget.remaining()` checks before expensive fan-out rounds, enforcing Token
   Budget.
5. `log()` every dropped or capped item per Dropped-Coverage Logging.
6. Apply `.filter(Boolean)` to all `parallel()` results and skippable `agent()` results.
7. Never emit `Date.now()`, `Math.random()`, or `new Date()`.

Save the harness to `~/.claude/workflows/<meta.name>.js` (or the project's configured
workflows directory).

### Phase 3: Execution

1. Run the harness via the `Workflow` tool, passing any `args` the plan specifies.
2. Stream progress: report each phase as it begins (`phase()` titles) and surface
   `log()` output, especially dropped-coverage logs.
3. On a skipped agent (`null` result), confirm the `.filter(Boolean)` handled it; do
   not treat a skip as a failure.

### Phase 4: Validation and Report

1. Run the plan's Validation Commands.
2. Verify the harness output against the plan's Acceptance Criteria.
3. Present the Report.

## Report

After the workflow completes, present:

```
## Workflow Build Report

**Plan**: [plan filename]
**Harness**: [meta.name] ([chosen pattern(s)])
**Mode**: Dynamic Workflow (deterministic JS orchestration via the Workflow tool)

### Phases Executed

- [phase title]: [agents spawned, structured outputs collected]

### Coverage

- Total units processed: [N]
- Dropped/capped (with reason): [from log() output]

### Results

- [synthesized output summary]

### Validation Results

- `[command]`: [PASS/FAIL] [details]

When you're ready, you can commit with:
/git-commits
```
