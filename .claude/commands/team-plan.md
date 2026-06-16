---
description: Creates a concise engineering implementation plan with team orchestration and saves it to .claude/tasks directory
argument-hint: [user prompt] [orchestration prompt]
model: opus
disallowed-tools: Task, EnterPlanMode
hooks:
  Stop:
    - hooks:
        - type: command
          command: >-
            node .claude/hooks/Validators/validate-new-file.mjs
            --directory .claude/tasks
            --extension .md
        - type: command
          command: >-
            node .claude/hooks/Validators/validate-file-contains.mjs
            --directory .claude/tasks
            --extension .md
            --contains "## Task Description"
            --contains "## Objective"
            --contains "## Relevant Files"
            --contains "## Step by Step Tasks"
            --contains "## Acceptance Criteria"
            --contains "## Team Orchestration"
            --contains "### Team Members"
---

# Team Plan

Create a detailed implementation plan based on the user's requirements provided through the `USER_PROMPT` variable. Analyze the request, think through the implementation approach, and save a comprehensive specification document to `PLAN_OUTPUT_DIRECTORY/<name-of-plan>.md` that can be used as a blueprint for actual development work. Follow the `Instructions` and work through the `Workflow` to create the plan.

## Variables

USER_PROMPT: $1
ORCHESTRATION_PROMPT: $2 - (Optional) Guidance for team assembly, task structure, and execution strategy
PLAN_OUTPUT_DIRECTORY: `.claude/tasks/`
TEAM_MEMBERS: `.claude/agents/*.md`
GENERAL_PURPOSE_AGENT: `general-purpose`

## Instructions

- **PLANNING ONLY**: Do NOT build, write code, or deploy agents. Your only output is a plan document saved to `PLAN_OUTPUT_DIRECTORY`.
- If no `USER_PROMPT` is provided, stop and ask the user to provide it.
- If `ORCHESTRATION_PROMPT` is provided, use it to guide team composition, task granularity, dependency structure, and parallel/sequential decisions.
- Carefully analyze the user's requirements provided in the USER_PROMPT variable
- Determine the task type (chore|feature|refactor|fix|enhancement) and complexity (simple|medium|complex)
- Think deeply (ultrathink) about the best approach to implement the requested functionality or solve the problem
- Understand the codebase directly without subagents to understand existing patterns and architecture
- Follow the Plan Format below to create a comprehensive implementation plan
- Include all required sections and conditional sections based on task type and complexity
- Generate a descriptive, kebab-case filename based on the main topic of the plan
- Save the complete implementation plan to `PLAN_OUTPUT_DIRECTORY/<descriptive-name>.md`
- Ensure the plan is detailed enough that another developer could follow it to implement the solution
- Include code examples or pseudo-code where appropriate to clarify complex concepts
- Consider edge cases, error handling, and scalability concerns
- Understand your role as the team lead. Refer to the `Team Orchestration` section for more details.
- After determining the session type, read the corresponding protocol file from `.claude/skills/session-management/session-types/`. Apply session-type-specific rules to the plan (e.g., migration plans must include a Feature Inventory, debugging plans must document root cause hypothesis).
- After determining the session type, ALSO apply the Workflow-Worthy Checklist below to decide the execution mode. If two or more signals fire, the task is workflow-worthy: read `.claude/skills/session-management/practices/workflow-patterns.md` for the six patterns and emission rules, emit a `## Workflow Harness` section (template below) choosing the pattern(s) that fit, and recommend `/workflow-build` in the Report instead of `/build` or `/team-build`. If fewer than two fire, do not load the patterns file; route to `/build` or `/team-build` as usual. The session type is still recorded; the workflow is the execution primitive, not a replacement for the protocol.

### Workflow-Worthy Checklist

Apply this during Step 1, alongside session-type detection. Reading this checklist is enough to decide the execution mode; you do not need any other file to make the call. A task is workflow-worthy when its work is data-dependent, adversarial, or unbounded in a way a fixed agent graph cannot express. Two or more boxes checked points to a dynamic workflow rather than `/build` or `/team-build`:

- [ ] **Massively parallel / fan-out**: the task decomposes into many small independent units (per-claim, per-file, per-row, per-rule) where each unit benefits from its own clean context window.
- [ ] **Adversarial or verification-heavy**: the task asks Claude to verify, judge, grade, or rank its own or others' output, where self-preferential bias is a real risk and N independent skeptics or judges would raise reliability.
- [ ] **Unknown-size discovery**: the amount of work is not known in advance (find ALL bugs, ALL recurring corrections, ALL broken links) and a fixed pass count would either stop early or waste compute.
- [ ] **Large-scale sort or rank**: ordering more rows or candidates than fit reliably in one prompt (1000+ rows), where a single sort prompt degrades and a tournament or bucket-rank-then-merge is more reliable.
- [ ] **High cross-context-contamination risk**: running the units in one context would let them bleed into each other (one finding biasing the next, one hypothesis anchoring the rest).
- [ ] **"Do not stop until X" goal**: the success criterion is a hard completion bar (no new findings, zero errors in logs) rather than a fixed deliverable.

If zero or one box is checked, route to `/build` or `/team-build` as usual. The token cost of a workflow is real (workflows use significantly more tokens), so the bar is deliberately set at two or more.

### Team Orchestration

As the team lead, you have access to powerful tools for coordinating work across multiple agents. You NEVER write code directly - you orchestrate team members using these tools.

#### Task Management Tools

**TaskCreate** - Create tasks in the shared task list:

```typescript
TaskCreate({
  subject: "Implement user authentication",
  description:
    "Create login/logout endpoints with JWT tokens. See .claude/tasks/auth-plan.md for details.",
  activeForm: "Implementing authentication", // Shows in UI spinner when in_progress
});
// Returns: taskId (e.g., "1")
```

**TaskUpdate** - Update task status, assignment, or dependencies:

```typescript
TaskUpdate({
  taskId: "1",
  status: "in_progress", // pending -> in_progress -> completed
  owner: "builder-auth", // Assign to specific team member
});
```

**TaskList** - View all tasks and their status:

```typescript
TaskList({});
// Returns: Array of tasks with id, subject, status, owner, blockedBy
```

**TaskGet** - Get full details of a specific task:

```typescript
TaskGet({ taskId: "1" });
// Returns: Full task including description
```

#### Task Dependencies

Use `addBlockedBy` to create sequential dependencies - blocked tasks cannot start until dependencies complete:

```typescript
// Task 2 depends on Task 1
TaskUpdate({
  taskId: "2",
  addBlockedBy: ["1"], // Task 2 blocked until Task 1 completes
});

// Task 3 depends on both Task 1 and Task 2
TaskUpdate({
  taskId: "3",
  addBlockedBy: ["1", "2"],
});
```

Dependency chain example:

```
Task 1: Setup foundation     -> no dependencies
Task 2: Implement feature    -> blockedBy: ["1"]
Task 3: Write tests          -> blockedBy: ["2"]
Task 4: Final validation     -> blockedBy: ["1", "2", "3"]
```

#### Owner Assignment

Assign tasks to specific team members for clear accountability:

```typescript
// Assign task to a specific builder
TaskUpdate({
  taskId: "1",
  owner: "builder-api",
});

// Team members check for their assignments
TaskList({}); // Filter by owner to find assigned work
```

#### Agent Deployment with Task Tool

**Task** - Deploy an agent to do work:

```typescript
Task({
  description: "Implement auth endpoints",
  prompt: "Implement the authentication endpoints as specified in Task 1...",
  subagent_type: "general-purpose",
  model: "opus", // or "sonnet" for simpler work, "haiku" for trivial
  run_in_background: false, // true for parallel execution
});
// Returns: agentId (e.g., "a1b2c3")
```

#### Resume Pattern (SendMessage)

A completed agent's context can be resumed. The spawn result ends with its agentId; route follow-up work there instead of fresh spawns:

```typescript
// First deployment - agent works on initial task
Task({
  description: "General Purpose - user service",
  prompt: "Create the user service with CRUD operations...",
  subagent_type: "general-purpose",
});
// Result ends with: agentId: "aXXXX" (use SendMessage with to: '...' to continue)

// Later - resume the SAME agent with full context preserved
SendMessage({
  to: "aXXXX",
  summary: "add validation",
  message: "Now add input validation to the endpoints you created...",
});
```

The old Task-tool `resume` parameter was removed in Claude Code v2.1.77 and fails today. See the `sub-agent-invocation` skill's Resume Pattern for the full mechanics (delivery behavior, the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` prerequisite and fresh-spawn fallback, persistence layers, compaction caveat, operating rules).

When to resume vs start fresh:

- **Resume**: Continuing related work in the same domain, agent needs prior context
- **Fresh**: Unrelated task, clean slate preferred
- **Fork**: One-shot work that needs parent context (parent-context inheritance plus cache warmth, no identity continuity)

#### Parallel Execution

Run multiple agents simultaneously with `run_in_background: true`:

```typescript
// Launch multiple agents in parallel
Task({
  description: "Build API endpoints",
  prompt: "...",
  subagent_type: "general-purpose",
  run_in_background: true,
});
// Returns immediately with agentId and output_file path

Task({
  description: "Build frontend components",
  prompt: "...",
  subagent_type: "general-purpose",
  run_in_background: true,
});
// Both agents now working simultaneously

// Check on progress
TaskOutput({
  task_id: "agentId",
  block: false, // non-blocking check
  timeout: 5000,
});

// Wait for completion
TaskOutput({
  task_id: "agentId",
  block: true, // blocks until done
  timeout: 300000,
});
```

#### Orchestration Workflow

1. **Create tasks** with `TaskCreate` for each step in the plan
2. **Set dependencies** with `TaskUpdate` + `addBlockedBy`
3. **Assign owners** with `TaskUpdate` + `owner`
4. **Deploy agents** with `Task` to execute assigned work
5. **Monitor progress** with `TaskList` and `TaskOutput`
6. **Resume agents** with `SendMessage` to their agentId for follow-up work
7. **Mark complete** with `TaskUpdate` + `status: "completed"`

## Workflow

IMPORTANT: **PLANNING ONLY** - Do not execute, build, or deploy. Output is a plan document.

1. Analyze Requirements - Parse the USER_PROMPT to understand the core problem and desired outcome. Determine the session type by checking the user's request against the Session Type Detection table in `.claude/skills/session-management/SKILL.md`. Read the matching session type file (e.g., `session-types/debugging.md` for bug fixes, `session-types/migration.md` for refactors or porting code in). The session type determines which protocols apply and whether special plan sections are required.
2. Understand Codebase - Without subagents, directly understand existing patterns, architecture, and relevant files. **Recommended for large refactors, migrations, or codebase restructuring:** If not already provided in the USER_PROMPT, run the `codestats` skill to generate dependency graph data (blast radius, hotspot scores, dead code, centrality metrics). Use this data to inform the Relevant Files section, task ordering, and risk assessment in the plan. Key commands: `codestats impact --changed --json` (what breaks), `codestats communities --coupling --json` (module boundaries), `codestats flows --json` (critical paths), `codestats cycles --json` (circular deps to break first).
3. Design Solution - Develop technical approach including architecture decisions and implementation strategy
4. Define Team Members - Use `ORCHESTRATION_PROMPT` (if provided) to guide team composition. Identify specialist agents from `.claude/agents/*.md` or use `general-purpose`. For validation tasks, always assign to `quality-engineer`. Document in plan.
5. Define Step by Step Tasks - Use `ORCHESTRATION_PROMPT` (if provided) to guide task granularity and parallel/sequential structure. Write out tasks with IDs, dependencies, assignments. Document in plan.
6. Generate Filename - Create a descriptive kebab-case filename based on the plan's main topic
7. Save Plan - Write the plan to `PLAN_OUTPUT_DIRECTORY/<filename>.md`
8. Save & Report - Follow the `Report` section to write the plan to `PLAN_OUTPUT_DIRECTORY/<filename>.md` and provide a summary of key components

## Plan Format

- IMPORTANT: Replace <requested content> with the requested content. It's been templated for you to replace. Consider it a micro prompt to replace the requested content.
- IMPORTANT: Anything that's NOT in <requested content> should be written EXACTLY as it appears in the format below.
- IMPORTANT: Follow this EXACT format when creating implementation plans:

```md
# Plan: <task name>

## Task Description

<describe the task in detail based on the prompt>

**Session Type**: <session type from detection table: Development | Debugging | Migration | Review | TDD | Research>

## Objective

<clearly state what will be accomplished when this plan is complete>

<if task_type is feature or complexity is medium/complex, include these sections:>

## Problem Statement

<clearly define the specific problem or opportunity this task addresses>

## Solution Approach

<describe the proposed solution approach and how it addresses the objective>
</if>

<if the task is workflow-worthy (two or more signals from the workflow-worthy checklist):>

## Workflow Harness

> Emitted only when the task is workflow-worthy. Consumed by `/workflow-build`, which
> translates this section into a real JavaScript harness and runs it via the Workflow
> tool. Ground every field in practices/workflow-patterns.md.

### Chosen Pattern(s)

<one or more of: classify-and-act, fan-out-and-synthesize, adversarial-verification,
generate-and-filter, tournament, loop-until-done. State the composite shape in one
sentence, e.g. "fan-out one verifier per claim (pipeline), then adversarial second
pass, then synthesize (barrier)".>

### Meta

- name: <kebab-case workflow name>
- description: <one sentence describing what the harness does>
- phases: <ordered list of phase titles, e.g. ["extract", "verify", "refute", "synthesize"]>

### Agent Roles

<one entry per distinct agent role in the harness>
- Role: <name, e.g. "claim-extractor">
  - Phase: <which phase it runs in>
  - Prompt: <the actual prompt text the agent receives>
  - Schema: <reference to a schema in the Structured Output Schemas block, or "none (returns text)">
  - Model: <"inherit" (default) or a named model with a one-line justification>
  - Isolation: <"none" (default) or "worktree" with justification (parallel file mutation only)>

### Structured Output Schemas

<one JSON Schema object per structured return, named so Agent Roles can reference them>

- Schema "<name>": <the JSON Schema object>

### Token Budget

- total: <integer cap, e.g. 200000 ("use Nk tokens")>
- enforcement: <where the harness checks budget.remaining() and what it does at the cap>

### Worktree Usage

<"none" if no agent mutates files, OR list which roles use isolation:'worktree' and why>

### Stop Condition

<required for loop-until-done; "n/a" otherwise. State the exact condition, e.g.
"stop after K=2 consecutive rounds that surface zero new findings">

### Verification / Adversarial Sub-Structure

<if the harness verifies or judges, describe it: N skeptics per finding prompted to
refute, majority kills; OR perspective-diverse verifiers each with a distinct lens; OR
a judge panel scoring N independent attempts. Name N.>

### Dropped-Coverage Logging

<what the harness log()s when coverage is bounded or items are dropped (no silent caps)>

</if>

## Relevant Files

Use these files to complete the task:

<list files relevant to the task with bullet points explaining why. Include new files to be created under an h3 'New Files' section if needed>

<if complexity is medium/complex, include this section:>

## Implementation Phases

### Phase 1: Foundation

<describe any foundational work needed>

### Phase 2: Core Implementation

<describe the main implementation work>

### Phase 3: Integration & Polish

<describe integration, testing, and final touches>
</if>

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to the building, validating, testing, deploying, and other tasks.
  - This is critical. Your job is to act as a high level director of the team, not a builder.
  - Your role is to validate all work is going well and make sure the team is on track to complete the plan.
  - You'll orchestrate this by using the Task\* Tools to manage coordination between the team members.
  - Communication is paramount. You'll use the Task\* Tools to communicate with the team members and ensure they're on track to complete the plan.
- Take note of the session id of each team member. This is how you'll reference them.

### Team Members

<list the team members you'll use to execute the plan. Use specialist agents for building and quality-engineer for validation.>

Available specialist agents: `quality-engineer`, `security-auditor`, `performance-optimizer`, `debugger-detective`, `code-simplifier`, `docs-automation-specialist`, `deep-researcher`, `general-purpose` (use `general-purpose` for TypeScript/VS Code implementation work, briefed fully)

- Specialist
  - Name: <unique name for this specialist - this allows you and other team members to reference THIS specialist by name. Take note there may be multiple specialists, the name makes them unique.>
  - Role: <the single role and focus of this specialist>
  - Agent Type: <the subagent type matching the specialist's domain from the available list above, or GENERAL_PURPOSE_AGENT for cross-domain work>
  - Resume: <default true. Follow-up work routes to this agent via SendMessage to its agentId, preserving its context. Pass false to always spawn fresh.>
  - Spawn Description: <required naming convention: spawn `description` = `<Agent Type> - <durable mission>` (plain hyphen) with `name` as its kebab-case mirror; never name the first concrete task>
- Quality Engineer (Validator)
  - Name: <unique name, e.g., "validator" or "quality-check">
  - Role: Validate completed work against acceptance criteria (read-only inspection mode)
  - Agent Type: quality-engineer
  - Resume: false
- <continue with additional team members as needed in the same format as above>

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

<list step by step tasks as h3 headers. Start with foundational work, then core implementation, then validation.>

### 1. <First Task Name>

- **Task ID**: <unique kebab-case identifier, e.g., "setup-database">
- **Depends On**: <Task ID(s) this depends on, or "none" if no dependencies>
- **Assigned To**: <team member name from Team Members section>
- **Agent Type**: <subagent from TEAM_MEMBERS file or GENERAL_PURPOSE_AGENT if you want to use a general-purpose agent>
- **Parallel**: <true if can run alongside other tasks, false if must be sequential>
- <specific action to complete>
- <specific action to complete>

### 2. <Second Task Name>

- **Task ID**: <unique-id>
- **Depends On**: <previous Task ID, e.g., "setup-database">
- **Assigned To**: <team member name>
- **Agent Type**: <subagent type from TEAM_MEMBERS file or GENERAL_PURPOSE_AGENT if you want to use a general-purpose agent>
- **Parallel**: <true/false>
- <specific action>
- <specific action>

### 3. <Continue Pattern>

### N. <Final Validation Task>

- **Task ID**: validate-all
- **Depends On**: <all previous Task IDs>
- **Assigned To**: <quality engineer validator team member>
- **Agent Type**: quality-engineer
- **Parallel**: false
- Run all validation commands
- Verify acceptance criteria met
- Operate in validation mode: inspect and report only, do not modify files

<continue with additional tasks as needed. Agent types must be from the available specialist list or general-purpose.>

## Quality Gates

Apply these gates during execution:

| Gate                | Validation                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| **Implementation**  | Code compiles, basic functionality works, local testing done                        |
| **Integration**     | API contracts validated, cross-component compatibility                              |
| **Quality**         | Tests passing, performance benchmarks met                                           |
| **User Acceptance** | User approves, business requirements met                                            |
| **Verification**    | Evidence before claims -- run commands, show output (see practices/verification.md) |

## Acceptance Criteria

<list specific, measurable criteria that must be met for the task to be considered complete>

## Validation Commands

Execute these commands to validate the task is complete:

<list specific commands to validate the work. Be precise about what to run>
- Example: `pnpm build` - Verify the project builds without errors
- Example: `pnpm test` - Run the test suite

## Notes

<optional additional context, considerations, or dependencies>
```

## Report

After creating and saving the implementation plan, provide a concise report with the following format:

```
Implementation Plan Created

File: PLAN_OUTPUT_DIRECTORY/<filename>.md
Topic: <brief description of what the plan covers>
Key Components:
- <main component 1>
- <main component 2>
- <main component 3>

Team Task List:
- <list of tasks, and owner (concise)>

Team members:
- <list of team members and their roles (concise)>

When you're ready, you can execute the plan in a new agent by running:
/build <replace with path to plan>
```

If the task is workflow-worthy (the plan contains a `## Workflow Harness` section), recommend `/workflow-build <path to plan>` instead of `/build`, and name the chosen pattern(s).
