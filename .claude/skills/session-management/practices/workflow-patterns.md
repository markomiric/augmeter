# Practice: Dynamic Workflow Patterns

A dynamic workflow is a custom JavaScript harness Claude writes for one specific
task and runs via the `Workflow` tool (enabled by default on paid plans, Claude Code
v2.1.154+; disable with `CLAUDE_CODE_DISABLE_WORKFLOWS=1`).
Use a workflow when a task's shape is data-dependent or adversarial rather than a
fixed sequence of named agents. This practice documents the six patterns and the
harness primitives that express them.

## Why workflows exist (the three failure modes)

A single context window degrades on long, parallel, or adversarial tasks:

- **Agentic laziness**: Claude stops before finishing and declares partial work done
  (addressing 20 of 50 review items).
- **Self-preferential bias**: Claude prefers its own outputs when asked to verify or
  judge them.
- **Goal drift**: fidelity to the original objective decays across many turns,
  especially after compaction drops edge-case and "do not do X" constraints.

The fix is structural: orchestrate separate Claudes, each with its own clean context
window and one focused goal.

## The six patterns

1. **Classify-and-act**: a classifier agent decides the task type, then routes to
   different downstream agents or behaviors. Or a classifier at the end shapes the
   output.
2. **Fan-out-and-synthesize**: split into many small steps, run an agent per step,
   then synthesize. The synthesize step is a BARRIER (it waits for all fan-out
   agents, then merges their structured outputs). Best when steps are many or each
   benefits from a clean context window so they do not cross-contaminate.
3. **Adversarial verification**: for each spawned agent, run a separate agent to
   adversarially verify its output against a rubric. Canonical shape: N skeptics per
   finding, each prompted to refute; kill the finding if a majority refute.
4. **Generate-and-filter**: generate many candidates, filter by rubric or
   verification, dedupe duplicates, return only the highest-quality survivors.
5. **Tournament**: instead of dividing the work, agents compete on it. Spawn N agents
   that each attempt the same task differently; a judge compares results pairwise
   until a winner emerges (comparative judgment beats absolute scoring).
6. **Loop-until-done**: for unknown-size work, keep spawning agents until a stop
   condition is met (no new findings, no more errors) rather than a fixed pass count.
   Canonical stop: K consecutive empty rounds (loop-until-dry).

## The harness primitives (authoritative API)

Workflow scripts are plain JavaScript (NOT TypeScript), beginning with a pure-literal
`export const meta = { name, description, phases }` (no variables, no function calls
in the literal).

- `agent(prompt, opts?)` -> spawns a subagent; returns its final text, or a validated
  object when `opts.schema` (a JSON Schema) is passed (forces a `StructuredOutput`
  tool call, retries on mismatch). Returns `null` if the user skips it, so
  `.filter(Boolean)`. `opts`: `label`, `phase`, `schema`, `model`,
  `isolation: 'worktree'`, `agentType`.
- `pipeline(items, stage1, stage2, ...)` -> runs each item through all stages
  independently with NO barrier between stages (item A can be in stage 3 while item B
  is still in stage 1). This is the DEFAULT for multi-stage work. Each stage callback
  receives `(prevResult, originalItem, index)`.
- `parallel(thunks)` -> runs tasks concurrently; this IS a barrier (it awaits all). A
  failed thunk resolves to `null` (never rejects), so `.filter(Boolean)`.
- `log(message)`, `phase(title)`, and globals `args`, `budget { total, spent(),
remaining() }`, and `workflow(nameOrRef, args)` for one-level nested invocation.

## Hard constraints

- Default to `pipeline()`. Only use a barrier (`parallel` between stages) when stage N
  genuinely needs ALL of stage N-1 (dedup/merge across the full set, early-exit on
  zero, cross-item comparison). Dedup-before-verify is the canonical barrier exception.
- Concurrency is capped at `min(16, cores - 2)`; lifetime cap is 1000 agents.
- `isolation: 'worktree'` is expensive (~200-500ms plus disk). Use it ONLY when agents
  mutate files in parallel.
- Default to OMITTING `model` (inherit the main-loop model). Override only when highly
  confident.
- `Date.now()`, `Math.random()`, and `new Date()` THROW (they break resume). Stamp
  timestamps after the workflow returns, or pass them via `args`. Resume returns cached
  results for the same script plus the same args.
- No silent caps: `log()` what was dropped whenever coverage is bounded.

## When to reach for a workflow

The workflow-worthy decision (whether a task should run as a dynamic workflow at all)
is made by the planner using the Workflow-Worthy Checklist in
`.claude/commands/team-plan.md`. Load this file only once that checklist says a workflow
is warranted: it covers the six patterns above and the emission rules below for
authoring the harness.

## Emission best-practice checklist

When authoring a `## Workflow Harness` plan section, follow these rules:

- [ ] **Pipeline by default.** Use `pipeline()` for multi-stage work. Only insert a
      barrier (`parallel` between stages) when stage N genuinely needs ALL of stage N-1:
      dedup/merge across the full set, early-exit on zero, or cross-item comparison.
- [ ] **Dedup-before-verify is the barrier exception.** If the harness dedupes a
      candidate set before verifying, that dedup is a legitimate barrier; place a `parallel`
      collection there and pipeline the rest.
- [ ] **Adversarial verify with N skeptics.** For verification or judging, spawn N
      independent skeptics per finding, each prompted to refute, and kill the finding when a
      majority refute. Comparative or refutation-framed judgment beats absolute self-scoring
      (counters self-preferential bias).
- [ ] **Use `schema` for structured returns.** Any agent whose output is consumed
      programmatically (counts, booleans, ranked lists, verdicts) returns via `opts.schema`
      so the result is a validated object, not free text to re-parse.
- [ ] **Set an explicit budget cap.** Define `budget.total` ("use Nk tokens") and check
      `budget.remaining()` before expensive fan-out rounds. Workflows use significantly more
      tokens; an unbounded harness is a defect.
- [ ] **Worktree only for parallel file mutation.** Set `isolation: 'worktree'`
      exclusively when agents write files concurrently. It costs ~200-500ms plus disk;
      read-only or single-writer agents never use it.
- [ ] **`log()` everything dropped.** When coverage is bounded (capped fan-out, filtered
      candidates, skipped items), `log()` the count and reason. No silent caps.
- [ ] **Loop-until-dry with a K-consecutive-empty stop.** For unknown-size discovery,
      loop spawning finders until K consecutive rounds surface zero new findings (not a fixed
      pass count). State K.
- [ ] **Inherit the main-loop model by default.** Omit `model` unless there is a
      specific, justified reason to pin a different one.
- [ ] **No banned globals.** Never emit `Date.now()`, `Math.random()`, or `new Date()`
      (they throw and break resume). Pass timestamps or seeds via `args`; stamp time after
      the workflow returns.
- [ ] **Filter null results.** Apply `.filter(Boolean)` to every `parallel()` result and
      to any `agent()` result that may be skipped.
- [ ] **Respect the caps.** Keep fan-out within `min(16, cores - 2)` concurrency and the
      1000-agent lifetime cap; if the candidate set is larger, batch and `log()` the batching.
