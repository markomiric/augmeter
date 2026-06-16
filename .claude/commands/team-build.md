---
description: Execute an implementation plan using collaborative Agent Teams with peer-to-peer coordination
argument-hint: [path-to-plan]
model: opus
disallowed-tools: EnterPlanMode
---

# Team Build

Execute the plan at `PATH_TO_PLAN` using Claude Code's Agent Teams feature. Unlike `/build` (isolated sub-agents), `/team-build` spawns a coordinated team where agents communicate directly, share a task list, and collaborate in real-time.

## Foundation

`/team-build` is a self-contained execution command. It shares the same core principles as `/build` -- read the plan, follow Team Orchestration, execute Step by Step Tasks respecting dependencies, run Validation Commands, and report results -- but operates independently with no dependency on `/build`. The execution mechanism is different: where `/build` uses isolated sub-agents via the Task tool (hub-and-spoke), `/team-build` uses Agent Teams where teammates communicate peer-to-peer through a shared task list and messaging. Both commands consume the same plan format produced by `/team-plan`.

## Variables

PATH_TO_PLAN: $ARGUMENTS

## Prerequisites

Agent Teams must be enabled via the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable. This flag may be set several ways: persisted in `~/.claude/settings.json` under `env`, exported in the shell, or injected at launch (e.g. `just teams` / `just cc`). The AUTHORITATIVE check is the live process environment of the running session, NOT any single config file:

- bash: `echo "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-UNSET}"`
- PowerShell: `$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`

A value of `1` means enabled. Do NOT conclude it is disabled because the key is absent from `settings.json` -- a launcher may have injected it into the process env without writing it there. Only if the live env check returns empty/unset: STOP and instruct the user to enable it (add to `settings.json` `env` and restart, or relaunch via `just teams`).

## Workflow

### Phase 1: Plan Ingestion

1. If no `PATH_TO_PLAN` is provided, STOP and ask the user to provide it.
2. Read the plan at `PATH_TO_PLAN`.
3. Extract from the plan:
   - **Team Members**: Names, roles, agent types from `## Team Orchestration > ### Team Members`
   - **Task Graph**: All tasks from `## Step by Step Tasks` with their `Depends On` fields
   - **Acceptance Criteria**: From `## Acceptance Criteria`
   - **Validation Commands**: From `## Validation Commands`

### Phase 2: Contract Chain Analysis

Analyze the task dependency graph to determine spawning order. The goal: no agent starts work until it has the contracts (schemas, interfaces, API specs) it depends on.

**Build the Contract Chain:**

1. **Identify Waves** -- group tasks by dependency depth:
   - **Wave 1 (Foundation)**: Tasks with `Depends On: none` -- these are upstream, spawn first
   - **Wave 2+**: Tasks whose dependencies are all satisfied by prior waves
   - **Final Wave**: Validation tasks that depend on everything else

2. **Identify Contracts** -- for each wave boundary, determine what the completing wave produces that the next wave needs:
   - Database agent completes --> produces schema contract (table definitions, types, relationships)
   - Backend agent completes --> produces API contract (endpoints, request/response shapes, auth requirements)
   - Any agent that creates shared types, interfaces, or configuration --> that output is a contract

3. **Identify Parallel Opportunities** within each wave:
   - Tasks in the same wave with no mutual dependencies run simultaneously
   - Tasks marked `Parallel: true` with all dependencies satisfied run simultaneously
   - NEVER parallelize tasks that modify the same files

**Example Contract Chain:**

```
Plan Tasks:
  Task 1: Setup database schema       -> Depends On: none
  Task 2: Build API endpoints          -> Depends On: Task 1
  Task 3: Build frontend components    -> Depends On: Task 2
  Task 4: Write integration tests      -> Depends On: Task 1, Task 2, Task 3

Derived Contract Chain:
  Wave 1: [database-agent]     -> produces schema contract
  Wave 2: [api-agent]          -> consumes schema, produces API contract
  Wave 3: [frontend-agent]     -> consumes API contract
  Final:  [quality-engineer]   -> validates everything
```

If two tasks at the same depth don't share file ownership:

```
  Wave 2: [api-agent] + [frontend-agent] in parallel
          (only if frontend doesn't depend on API contract)
```

### Phase 3: Team Formation

Create the agent team based on the plan's Team Members section.

**Team Formation Rules:**

1. **Explicit team size** -- state the exact number of teammates. Do not let it be inferred.
2. **Named teammates** -- use the names from the plan (e.g., "builder-api", "builder-frontend"). Generic names like "Agent 1" lead to confusion.
3. **Single responsibility** -- each teammate gets ONE clear focus area. Do not give a teammate tasks across unrelated domains.
4. **File ownership boundaries** -- assign each teammate exclusive ownership of specific files/directories. No two teammates should modify the same file. State this explicitly in each teammate's prompt.
5. **Full context per teammate** -- every teammate receives:
   - The complete plan OR their relevant sections
   - Their specific task assignments from the task list
   - Upstream contracts they depend on (actual content, not references to "what the other agent did")
   - What contracts they must produce for downstream agents
   - Their file ownership boundaries

**Team Sizing Guidelines:**

| Teammates | Use Case                                                         |
| --------- | ---------------------------------------------------------------- |
| 2         | Simple frontend + backend split, or implementation + validation  |
| 3         | Frontend + backend + database/infrastructure                     |
| 4         | Add dedicated test/validation agent to a 3-agent team            |
| 5         | Only for genuinely independent workstreams with clear boundaries |

Do not exceed the number of team members defined in the plan unless you have a strong reason and communicate it.

### Phase 4: Contract-First Execution

Execute in waves. This is the critical pattern that prevents wasted work.

**Wave 1 -- Foundation:**

1. Spawn upstream teammate(s) with no dependencies. **Every teammate's prompt must instruct them to read the full plan file at `PATH_TO_PLAN` as their first action.** Do not summarize or excerpt the plan for them -- they read it themselves, in full.
2. They work on foundational tasks: schemas, shared types, interfaces, configuration
3. **Wait for their contracts.** Do not proceed to Wave 2 until:
   - The upstream teammate marks their foundation task as complete
   - The upstream teammate has messaged you with the contract details
   - You have verified the contract is concrete (actual schemas/types, not placeholders)

**Contract Delivery:**
When an upstream teammate completes foundational work, they must:

- Mark their task complete in the shared task list
- Message the lead with the concrete output: the actual schema definitions, type interfaces, API specs, or configuration that downstream agents need
- This message IS the contract

**Wave 2+ -- Parallel Execution:**

1. Once you receive contracts from Wave 1, spawn downstream teammates
2. **Inject contracts directly into each downstream teammate's prompt** -- paste the actual schema/interface/spec, do not tell them to "go read what the other agent did"
3. Downstream teammates work in parallel on their assigned tasks
4. Teammates message each other directly when:
   - They change an interface another teammate depends on
   - They're blocked and need input from another teammate
   - They discover a contract mismatch or integration issue

**Final Wave -- Validation:**

1. After all implementation teammates complete their work, spawn the quality engineer
2. Quality engineer validates against the plan's Acceptance Criteria
3. Quality engineer runs all Validation Commands from the plan
4. Quality engineer reports PASS or FAIL per criterion
5. If FAIL: identify which teammate's work needs correction, message them or spawn a fix agent

### Phase 5: Monitoring

While the team works:

- Watch the shared task list for stalled or stuck tasks
- If a teammate is blocked for more than a reasonable period, intervene with guidance
- If teammates report contract mismatches, mediate by clarifying the correct interface
- If a teammate finishes early, check if they can assist with remaining work

**Communication Protocol (instruct all teammates):**

- **Message when**: you change an interface, type, or schema another teammate depends on
- **Message when**: you are blocked and need input from another teammate
- **Message when**: your task is complete so downstream work can begin
- **Message format**: Keep it concise -- what changed, what it affects, what action is needed
- **Do not message for**: routine progress updates, minor internal decisions

### Phase 6: Shutdown and Cleanup

1. Verify all tasks in the shared task list show as complete
2. Run all Validation Commands from the plan and capture results
3. Shut down all teammates
4. Clean up the team
5. Present the Report

## Team Lead Role

You are the **team lead**. Your job is orchestration, not implementation.

**DO:**

- Create the team and define the contract chain
- Assign tasks with clear context and file boundaries
- Deliver contracts between waves (paste actual content)
- Monitor the shared task list and steer the team
- Validate final results against acceptance criteria
- Make final integration fixes if trivial (missing imports, typos)

**DO NOT:**

- Write feature code directly -- that's what teammates are for
- Bypass the team to "just do it faster"
- Spawn teammates without clear contracts from upstream
- Let teammates work on overlapping files

## Teammate Prompt Template

When spawning each teammate, provide this structure:

```
You are [NAME], the [ROLE] on this team.

MANDATORY FIRST STEP: Read the full plan file at [PATH_TO_PLAN] before doing anything else. The plan contains critical architectural decisions, patterns, and conventions that you must follow. Do not skip sections -- read the entire document, then begin your assigned work.

YOUR TASKS:
[List specific tasks from the shared task list assigned to this teammate]

FILES YOU OWN (only modify these):
[Explicit list of files/directories this teammate may touch]

UPSTREAM CONTRACTS (your inputs):
[Paste the actual schemas, interfaces, API specs from upstream agents]
[If Wave 1 agent: "None -- you are producing the foundation"]

CONTRACTS YOU MUST PRODUCE (your outputs):
[What downstream teammates need from you]
[Be specific: "Produce the database schema with table definitions and TypeScript types"]
[If final wave: "None -- you are consuming, not producing"]

COORDINATION:
- Message the lead when your contract is ready
- Message [OTHER_TEAMMATE] directly if you change [SPECIFIC_INTERFACE]
- Mark your task complete in the shared task list when done
```

**CRITICAL: Every teammate reads the full plan.** Do not paste "relevant sections" -- instruct each teammate to read the entire plan file themselves. The plan contains project-wide architectural decisions (caching strategy, naming conventions, data flow patterns) that no individual task description fully captures. Teammates who skip the plan will default to their own assumptions, causing drift from the intended architecture.

## Handling Failures

**If a teammate fails or produces incorrect work:**

1. Do not restart the entire team
2. Identify the specific failure from the quality engineer's report
3. Message the responsible teammate with the fix requirements, or spawn a targeted fix agent
4. Re-run only the affected validation commands

**If a contract mismatch is discovered mid-execution:**

1. Pause downstream teammates that depend on the incorrect contract
2. Correct the contract with the upstream teammate
3. Deliver the corrected contract to downstream teammates
4. Resume downstream work

**If Agent Teams is not available or fails to initialize:**
Fall back to `/build` (sub-agent execution). Inform the user: "Agent Teams unavailable. Falling back to /build with sub-agent execution."

## Report

After all work completes, present:

```
## Team Build Report

**Plan**: [plan filename]
**Team**: [number] teammates, [number] waves
**Mode**: Agent Teams (collaborative, contract-first)

### Contract Chain Execution
- Wave 1: [agent names] -- produced [contract descriptions]
- Wave 2: [agent names] -- consumed [contracts], produced [contracts]
- Wave N: [agent names] -- final validation

### Task Results

| Task | Teammate | Status | Notes |
|------|----------|--------|-------|
| [task name] | [agent name] | PASS/FAIL | [brief note] |

### Validation Results
- `[command]`: [PASS/FAIL] [details]

### Coordination Notes
- [Any contract deliveries, mid-execution adjustments, or rework that occurred]

When you're ready, you can commit with:
/git-commits
```
