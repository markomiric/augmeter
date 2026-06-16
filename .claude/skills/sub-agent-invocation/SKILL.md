---
name: sub-agent-invocation
description: "Coordination and delegation protocols for sub-agent specialist assignments"
---

# Central AI Delegation Protocol

Load this skill before invoking ANY sub-agent (master-orchestrator, specialists, validators).

---

## Constitutional Invocation Requirements

Every sub-agent prompt **MUST** include four components:

### 1. Complete Context (Be Detailed)

- Project goal and current state
- Why this work is needed now
- How this task fits into broader objectives
- Dependencies on other work or prior decisions

### 2. Explicit Instructions (Be Clear)

- Specific task requirements with clear scope
- Expected deliverables and exact format
- Success criteria and validation requirements

### 3. Context References (Point to Sources)

- Session files: "Read .claude/tasks/session-current.md for full context"
- Skills: "Load [relevant] skill for patterns and workflows"
- Related implementations: Point to similar existing code

### 4. Performance Directives (Demand Excellence)

- Always include: "Think hard and analyze deeply before proceeding"
- Specify thoroughness level: "comprehensive analysis" or "quick validation"

---

## Invocation Template

```
"USER'S ORIGINAL REQUEST: [verbatim user prompt - MANDATORY]

[COMPREHENSIVE CONTEXT]
- Project: [overall goal and current state]
- Background: [why this matters, how it fits]
- Dependencies: [what this builds on or integrates with]

TASK ASSIGNMENT:
[Detailed, specific requirements with clear scope and boundaries]

CONTEXT REFERENCES:
- Session: [path and what to extract]
- Skills: [relevant skills to load]
- Examples: [similar existing implementations]

Think hard and provide [thoroughness level] analysis/implementation.

DELIVERABLES:
[Exact format, success criteria, validation requirements]"
```

**Sub-Agent Context Principle (tiered)**: Central AI conserves; persistent sub-agents maximize; throwaway sub-agents absorb the noise. Persistent sub-agents (T1, resumable via SendMessage) maximize context collection - read all relevant files, load skills, gather examples. Maximal collection was originally a guarantee against non-resumability; resumability now protects that investment: the context is never lost, and every resume reuses the same compute. They keep their maximized window high-signal by delegating noisy collection (wide greps, web sweeps, log dives, bulk doc scans) to their own throwaway sub-agents (one-shot scouts and T2+ nested children), which burn disposable windows and return only distilled verdicts. Over-collection is safe in throwaway windows; under-collection causes failures.

---

## Common Invocation Failures

| Bad                   | Good                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| "Fix authentication"  | "Fix OAuth redirect loop where successful login redirects to /login instead of /dashboard"                      |
| "Add tests"           | "Add tests for user profile editing (session Phase 2) covering avatar upload, validation, error handling"       |
| "Implement feature X" | "Implement feature X following patterns from Y, integrating with Z API, referencing session-current.md Phase 3" |

---

## Routing Decision

| Scenario                                                                                                  | Approach                                                              |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Multi-phase feature, 5+ files, architectural                                                              | Auto-invoke `/team-plan` → user approval → `/build`                   |
| Cross-domain integration, agents need coordination                                                        | `/team-plan` → user approval → `/team-build` (Agent Teams)            |
| Workflow-worthy (2+ signals: fan-out, adversarial verification, unknown-size discovery, large-scale rank) | `/team-plan` → user approval → `/workflow-build` (dynamic JS harness) |
| Simple file edit, pattern search, single-component                                                        | Direct sub-agent delegation                                           |
| Ambiguous scope, needs planning                                                                           | Gather context → `/team-plan` → user approval → `/build`              |
| Clear scope, bounded execution                                                                            | Direct delegation                                                     |
| High-reliability task, production changes                                                                 | `/team-plan` with Specialist + Quality Engineer validation            |
| Research/exploration only                                                                                 | Direct Explore agent or deep-researcher                               |

**`/build` vs `/team-build` vs `/workflow-build` Decision:**

Decision rule (apply in order):

1. Run the workflow-worthy checklist in `.claude/commands/team-plan.md`. If two or more signals fire (massively parallel fan-out, adversarial/verification-heavy, unknown-size discovery, large-scale sort/rank, high cross-context-contamination risk, "do not stop until X"), choose `/workflow-build`.
2. Otherwise, if agents need peer-to-peer coordination on shared contracts (schemas, API specs, interfaces) and cross-domain integration, choose `/team-build`.
3. Otherwise, choose `/build`.

- `/build`: Tasks are independent, sub-agents don't need to communicate, cost-sensitive (1x tokens)
- `/team-build`: Agents need peer-to-peer coordination, cross-domain interfaces, contract-first spawning (2-4x tokens)
- `/workflow-build`: Data-dependent or adversarial shape a fixed agent graph cannot express; a deterministic JavaScript harness orchestrates one agent per unit, plus N skeptics/judges (high, data-dependent tokens; the Workflow tool is on by default on paid plans, Claude Code v2.1.154+)

| Dimension                | `/build`                                                                    | `/team-build`                                                                                              | `/workflow-build`                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **When to use**          | Independent, isolated tasks; research-heavy or focused work; cost-sensitive | Cross-domain integration where agents share contracts (schema, API, interface) and coordinate in real time | Workflow-worthy tasks: massively parallel fan-out, adversarial verification, unknown-size discovery, large-scale sort/rank, high cross-context-contamination risk, "do not stop until X" |
| **Execution model**      | Hub-and-spoke: lead spawns isolated sub-agents via the Task tool            | Agent Teams: peer-to-peer teammates on a shared task list, contract-first waves                            | Deterministic JS harness run via the Workflow tool; control flow in code, models inside each `agent()`                                                                                   |
| **Orchestration author** | The lead (Claude) coordinates turn by turn                                  | The lead defines a contract chain; teammates self-coordinate                                               | A JavaScript file (`agent()` / `pipeline()` / `parallel()`) is the orchestrator                                                                                                          |
| **Communication style**  | None between sub-agents (isolated)                                          | Peer-to-peer messaging plus shared task list                                                               | None between agents by design (isolated contexts); structure comes from the harness                                                                                                      |
| **Agent model**          | Per-task (Opus for critical, Sonnet/Haiku for simple)                       | Per-teammate, named roles                                                                                  | Inherit main-loop model by default; override only when justified                                                                                                                         |
| **Isolation**            | Sub-agent context isolation                                                 | Teammate context plus optional file-ownership boundaries                                                   | Per-agent clean context; `isolation: 'worktree'` only for parallel file mutation                                                                                                         |
| **Token cost**           | 1x                                                                          | 2-4x                                                                                                       | High and data-dependent (one agent per unit, plus N skeptics/judges); set an explicit `budget`                                                                                           |
| **Determinism**          | LLM-orchestrated                                                            | LLM-orchestrated                                                                                           | Deterministic (code-orchestrated); resumable on same script plus same args                                                                                                               |
| **Scale ceiling**        | Practical handful of sub-agents                                             | Up to ~5 teammates                                                                                         | `min(16, cores - 2)` concurrency, 1000-agent lifetime cap                                                                                                                                |
| **Prerequisite**         | None                                                                        | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`                                                                   | None (on by default on paid plans, v2.1.154+; disable with `CLAUDE_CODE_DISABLE_WORKFLOWS=1`)                                                                                            |
| **Fallback**             | n/a (the default)                                                           | Falls back to `/build` if Agent Teams unavailable                                                          | Falls back to `/build` or `/team-build` if the Workflow tool is unavailable or the plan has no `## Workflow Harness`                                                                     |

---

## Auto-Invocation Protocol

Central AI auto-invokes `/team-plan` + `/build` (or `/team-build`) for complex work. This is the standard operating procedure for all non-trivial implementation.

### Decision Criteria

**Auto-invoke `/team-plan` immediately when:**

- Request involves 5+ files or multiple domains
- Request is clearly multi-phase (e.g., "build feature with X, Y, Z")
- Request involves architectural or structural changes
- User explicitly asks for team coordination or a plan

**Gather info first, then invoke when:**

- Request is vague but potentially complex
- Request needs clarification about scope or approach
- Request touches unfamiliar areas of the codebase

**Don't invoke (direct execution) when:**

- Single file fix, typo, config change
- Clear, bounded task for a single specialist
- Research/exploration only (no implementation)

### Invocation Syntax

**Step 1 - Plan:**

```
Skill({ skill: "team-plan", args: "<comprehensive prompt with all context>" })
```

**Step 2 - Pause:**
Present the plan summary to the user. Wait for approval ("go", `/build`, `/team-build`, or feedback).

**Step 3 - Execute (after user approval):**

For isolated sub-agent execution (default):

```
Skill({ skill: "build", args: ".claude/tasks/<plan-file>.md" })
```

For collaborative Agent Teams execution (when agents need peer-to-peer coordination):

```
Skill({ skill: "team-build", args: ".claude/tasks/<plan-file>.md" })
```

Use `/team-build` when the plan involves cross-domain integration where agents need to share contracts (schemas, API specs, interfaces) and coordinate in real-time. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

### Prompt Composition for Auto-Invocation

When composing the prompt for `/team-plan`, Central AI should include:

1. **User's verbatim request** - Always include the original words
2. **Clarifications gathered** - Any answers from `AskUserQuestion`
3. **Codebase context** - Relevant patterns, files, and architecture discovered
4. **Constraints and preferences** - User-expressed boundaries
5. **Orchestration guidance** (optional) - Hints for team composition or parallel/sequential structure

**Example auto-invocation:**

```
Skill({
  skill: "team-plan",
  args: "Add a new local-provider adapter for Gemini CLI usage. User wants: a ClaudeProviderAdapter-style adapter under src/providers/adapters/, registered in provider-registry.ts, with a pure parser and Vitest unit tests mirroring the existing adapter tests. Follow the patterns in src/providers/adapters/codex-provider-adapter.ts and its unit test. Validate with quality-engineer."
})
```

---

## Coordination Patterns

### Parallel Execution

Invoke multiple agents using multiple Task tool calls in **ONE message**.

| Pattern                 | Agents                                  | Use Case                        |
| ----------------------- | --------------------------------------- | ------------------------------- |
| **Domain Parallel**     | multiple general-purpose (one per unit) | Independent feature development |
| **Validation Parallel** | security + performance + quality        | Comprehensive validation        |
| **Debug Parallel**      | debugger-detective + deep-researcher    | Complex issue investigation     |

**Use parallel dispatch when ALL conditions met:**

- 3+ unrelated issues or independent domains
- No shared state between tasks
- Clear boundaries with no file overlap

**Use serial dispatch when ANY condition present:**

- Interconnected failures (one fix may resolve others)
- Shared state or same files (risk of merge conflicts)
- Sequential dependencies (B depends on A completing)
- Unclear scope (need to understand before fixing)

**Parallel Agent Output Rule:**
When dispatching agents in parallel, instruct them to write their work to files (edits, creations) rather than returning lengthy responses in the terminal. All work is version controlled, so file-based output is preferred. This prevents context bloat from multiple agents returning verbose terminal output simultaneously.

### Specialist + Quality Engineer Validation

The high-reliability pattern: specialist agents build, quality-engineer validates. Use when incorrect output has high cost.

**Specialist agents serve as builders.** Use the appropriate specialist for the domain: `security-auditor`, `performance-optimizer`, `code-simplifier`, `docs-automation-specialist`, or `general-purpose` for TypeScript/VS Code implementation work (no built-in TS specialist; brief it fully). Each specialist focuses on ONE task and reports completion via TaskUpdate.

**Quality engineer serves as validator.** When dispatched in validation mode, the quality-engineer inspects completed work without modifying files and produces a structured pass/fail report.

**Validation prompt template:**

```
"You are operating in VALIDATION MODE. Verify the completed work against acceptance criteria.

TASK TO VALIDATE: [task description and acceptance criteria]
SPECIALIST'S WORK: [files to inspect, expected changes]

WORKFLOW:
1. Read the task requirements and acceptance criteria
2. Inspect all files the specialist changed
3. Run validation commands (tests, type checks, compilation)
4. Report PASS or FAIL with specific evidence using the Validation Report format

CONSTRAINT: Do NOT modify any files. Inspect and report only. If issues are found, report them for the specialist to fix."
```

**Dependency pattern for specialist/validation chains:**

```
TaskCreate: "Build feature X"       -> Task #1 (assigned to specialist)
TaskCreate: "Validate feature X"    -> Task #2 (assigned to quality-engineer)
TaskUpdate: Task #2 addBlockedBy: ["1"]  // Validation waits for build

// Multiple specialists can run in parallel:
TaskCreate: "Build provider adapter A"  -> Task #1 (general-purpose)
TaskCreate: "Build provider adapter B"  -> Task #2 (general-purpose)
TaskCreate: "Validate all"              -> Task #3 (quality-engineer), addBlockedBy: ["1", "2"]
```

### Resume Pattern (SendMessage, v2.1.77+)

A completed sub-agent is not gone. Its context can be resumed.

```
// Spawn once, with durable naming
Agent({
  subagent_type: "general-purpose",
  name: "impl-provider-adapters",
  description: "General Purpose - provider adapter implementation",
  prompt: "<first task, fully specific>"
})
// Result ends with: agentId: aXXXX (use SendMessage with to: '...' to continue)

// Every follow-up in the same domain
SendMessage({ to: "<agentId>", summary: "next iteration", message: "<self-contained task>" })
```

The old Task-tool `resume` parameter was removed in v2.1.77 and fails today. A new `Agent` call always starts fresh; SendMessage to the agentId is the resume mechanism. Names address RUNNING agents; agentIds resume COMPLETED ones.

**How delivery works:**

- **Running agent**: the message is queued for delivery at its next tool round.
- **Completed agent**: it auto-resumes in the background with its full transcript rehydrated, then re-reports once when finished.

**Prerequisite and fallback:**

SendMessage requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (the gate is deliberate; GitHub issue #42737 was closed "not planned"). Without the flag, fall back to fresh spawns with fully self-contained prompts - operating rule 3 below makes this cheap.

**Two-layer persistence:**

- **Ephemeral handle**: the harness's agentId-to-agent resume mapping. It dies across summarization boundaries and session gaps; treat a warm agent as perishable.
- **Durable transcript**: every sub-agent run is written to `~/.claude/projects/<project>/<session>/agent-<id>.jsonl` and kept for `cleanupPeriodDays` (default 30 days; raise it if you rely on rehydration).
- **Rehydration fallback**: on "no transcript to resume", spawn a fresh agent and point it at the predecessor's `agent-<id>.jsonl` to grep specific prior decisions (do not ingest the whole file).

**Compaction caveat:**

If an agent auto-compacted during a prior run, resume rehydrates the post-compaction summary, not full history. High-signal windows compact later or never - a core reason persistent sub-agents delegate noise downward instead of ingesting it.

**Operating rules:**

1. One warm persistent sub-agent per domain per session; name it at spawn (see Sub-Agent Naming Convention below).
2. Spawn #1 is the context investment: deep durable-context gathering, amortized across every resume.
3. Every resume prompt is self-contained (repo/branch state, constraints, acceptance criteria) so a dead handle boots a replacement at near-zero loss.
4. Resume promptly and batch follow-ups; when iterating fast, resume inside the 5-minute prompt-cache window (materially cheaper). Every resume replays the whole transcript (field data: 199k to 324k tokens across 8 rounds).
5. Retire near ~300k tokens: finish the thread and boot a successor with a handoff summary.
6. Durable state on disk always (commits, reports, task files) - the agent's memory must survive the agent.
7. Domain change = fresh agent. Same-domain iteration = resume. One-shot work needing parent context = fork (default-on since v2.1.161: parent-context inheritance plus cache warmth, no identity continuity).

### Sub-Agent Naming Convention

`description` is the label rendered in the user's terminal and `name` is the SendMessage handle; both are frozen at spawn. With resumable agents, one label covers many sequential tasks, so labels must describe the durable mission, never the first task.

1. **`description` = `<Agent Type> - <durable mission>`**: agent type spelled out, matching `subagent_type` (Frontend Specialist, Backend Engineer, Quality Engineer, Explore, Deep Researcher, ...); after the plain hyphen (never an em dash), the agent's session-long domain. Good: `landing page UI`, `upload pipeline`, `blog migration`, `UI iteration work`. Bad: anything naming the first concrete task (`fix F logos`, `add favicon`).
2. **`name` = kebab-case mirror** of the same two parts, type-prefixed so SendMessage routing reads clearly in logs: `frontend-landing-ui`, `backend-upload`, `qa-validation`, `explore-fb-recon`.
3. **Per-task specificity lives ONLY in prompts** and resume messages; description/name cannot change per round.
4. **Test before spawning**: "will this label still be true on resume #8?" If not, generalize it.

### Nested Subagents

Sub-agents can spawn their own sub-agents (v2.1.172; depth cap 5, server-enforced, no config knob). Their role: throwaway T2+ sub-agents that absorb noisy collection (wide greps, web sweeps, log dives) in disposable windows and return only distilled verdicts upward, keeping their parent's context high-value. Children of a completed agent are NOT resumable from the main thread - depth 2+ is structurally throwaway. Token cost compounds with depth: nest for isolation, never for parallelism.

### Warm Sub-Agent Iteration Loop

The flagship iteration pattern: user reviews on localhost -> feedback lands in the main thread -> Central AI relays it via SendMessage to the warm persistent sub-agent for the domain (full prior context: every file touched, every decision made) -> the sub-agent executes, spawning throwaway T2 scouts for noisy lookups -> reports -> repeat. Central AI never executes domain work and never bloats; the persistent sub-agent never re-discovers the codebase. Field data: cold builds run 12-40 min; warm iterations run 4-7 min.

### Sequential Dependencies

| Chain                           | Reasoning                                   |
| ------------------------------- | ------------------------------------------- |
| Schema → API → Frontend         | Data structure must exist before interfaces |
| Core → Enhancement              | Foundation before optimization              |
| Build → Validate → Integrate    | Build, verify, then connect                 |
| Research → Planning → Execution | Understand, plan, implement                 |

---

## Agent Routing Reference

| Domain                 | Agent                      | Handles                                                                 |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------- |
| **Implementation**     | general-purpose            | TypeScript/VS Code extension code (no built-in specialist; brief fully) |
| **Testing/Validation** | quality-engineer           | Vitest, @vscode/test-cli, coverage, ESLint/Prettier, task validation    |
| **Security**           | security-auditor           | Secret/token handling, subprocess safety, dependency risk, OWASP        |
| **Performance**        | performance-optimizer      | Activation time, polling cost, .vsix size, memory/dispose hygiene       |
| **Debugging**          | debugger-detective         | Root-cause analysis, runtime/test failures, regressions                 |
| **Refactoring**        | code-simplifier            | Clarity, dead-code removal, consistency                                 |
| **Docs**               | docs-automation-specialist | README/CHANGELOG/TypeDoc sync, drift checks                             |
| **Research**           | deep-researcher            | External docs, best-practice comparison, library verification           |
