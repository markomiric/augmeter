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
            node "$CLAUDE_PROJECT_DIR/.claude/hooks/Validators/validate-new-file.mjs"
            --directory "$CLAUDE_PROJECT_DIR/.claude/tasks"
            --extension .md
        - type: command
          command: >-
            node "$CLAUDE_PROJECT_DIR/.claude/hooks/Validators/validate-file-contains.mjs"
            --directory "$CLAUDE_PROJECT_DIR/.claude/tasks"
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
- Read `.claude/rules/repo-primer.md` before selecting agents, skills, files, or validation commands.
- Determine the task type (chore|feature|refactor|fix|enhancement) and complexity (simple|medium|complex)
- Think hard about the best approach to implement the requested functionality or solve the problem
- Understand the codebase directly without subagents to understand existing patterns and architecture
- Follow the Plan Format below to create a comprehensive implementation plan
- Include all required sections and conditional sections based on task type and complexity
- Generate a descriptive, kebab-case filename based on the main topic of the plan
- Save the complete implementation plan to `PLAN_OUTPUT_DIRECTORY/<descriptive-name>.md`
- Ensure the plan is detailed enough that another developer could follow it to implement the solution
- Include code examples or pseudo-code where appropriate to clarify complex concepts
- Consider edge cases, error handling, and scalability concerns
- Understand your role as the team lead. Refer to the `Team Orchestration` section for more details.
- After determining the session type, read the corresponding protocol file from `.claude/skills/session-management/session-types/`. Apply session-type-specific rules to the plan (e.g., migration plans must include a Feature Inventory, repo-port plans must include Source UI/UX Reference, debugging plans must document root cause hypothesis).
- Treat the saved plan as the primary source of truth for `/build` and `/team-build`. `session-current.md` is optional and must not be required for execution.

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

#### Resume Pattern

Store the agentId to continue an agent's work with preserved context:

```typescript
// First deployment - agent works on initial task
Task({
  description: "Build user service",
  prompt: "Create the user service with CRUD operations...",
  subagent_type: "general-purpose",
});
// Returns: agentId: "abc123"

// Later - resume SAME agent with full context preserved
Task({
  description: "Continue user service",
  prompt: "Now add input validation to the endpoints you created...",
  subagent_type: "general-purpose",
  resume: "abc123", // Continues with previous context
});
```

When to resume vs start fresh:

- **Resume**: Continuing related work, agent needs prior context
- **Fresh**: Unrelated task, clean slate preferred

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
6. **Resume agents** with `Task` + `resume` for follow-up work
7. **Mark complete** with `TaskUpdate` + `status: "completed"`

## Workflow

IMPORTANT: **PLANNING ONLY** - Do not execute, build, or deploy. Output is a plan document.

1. Analyze Requirements - Parse the USER_PROMPT to understand the core problem and desired outcome. Determine the session type by checking the user's request against the Session Type Detection table in `.claude/skills/session-management/SKILL.md`. Read the matching session type file (e.g., `session-types/debugging.md` for bug fixes, `session-types/repo-port.md` for porting from existing repos). The session type determines which protocols apply and whether special plan sections are required.
2. Understand Codebase - Without subagents, directly understand existing patterns, architecture, and relevant files. **Recommended for large refactors, migrations, or codebase restructuring:** If not already provided in the USER_PROMPT, run the `codestats` skill to generate dependency graph data (blast radius, hotspot scores, dead code, centrality metrics). Use this data to inform the Relevant Files section, task ordering, and risk assessment in the plan. Key commands: `codestats impact --changed --json` (what breaks), `codestats communities --coupling --json` (module boundaries), `codestats flows --json` (critical paths), `codestats cycles --json` (circular deps to break first). **For repo-port sessions (porting from an existing repository):** When the session type is "Repo Port" (user references a source repo with "port from", "rebuild", "based on", or a GitHub URL), analyze the source repo across TWO layers: (1) Data/API layer -- endpoints, schemas, data flows (standard), and (2) UI/UX layer -- page layouts, interaction flows, component patterns, visual design tricks (frequently missed). Read the source repo's actual component files, not just API/data files. Document both layers in the plan's "Source UI/UX Reference" section. See `session-types/repo-port.md` for the full Source Analysis Phase protocol.
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

**Session Type**: <session type from detection table: Development | Debugging | Migration | Repo Port | Review | TDD | Research | Growth>

## Objective

<clearly state what will be accomplished when this plan is complete>

<if task_type is feature or complexity is medium/complex, include these sections:>

## Problem Statement

<clearly define the specific problem or opportunity this task addresses>

## Solution Approach

<describe the proposed solution approach and how it addresses the objective>
</if>

<if session type is Repo Port:>

## Source UI/UX Reference

> MANDATORY for repo-port sessions. Documents the source app's visual and interaction
> patterns that frontend agents MUST follow. Without this, frontend agents default to
> generic DataTable/Sheet patterns.

### Layout Patterns

<describe page layouts from the source: panel splits, stacking, responsive behavior.
Be specific: "Keywords page uses two-panel flex split (table left, SERP + trend chart right)"
not "Keywords page shows data in a table">

### Interaction Flows

<describe cause-and-effect on user actions: "Clicking a keyword row highlights it and
updates BOTH the stats bar and the right panel">

### Component Patterns

<describe reusable UI patterns that differ from defaults: tabbed cards, inline panels,
circular score badges, search history, filter panels, export dropdowns>

### Source Files to Read

<list specific source component files frontend agents must read before building.
Format: file path -> what to learn from it>

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

Available default specialist agents for this repo: `backend-engineer`, `database-platform-engineer`, `ci-release-engineer`, `docs-automation-specialist`, `security-auditor`, `performance-optimizer`, `quality-engineer`, `debugger-detective`, `deep-researcher`, `code-simplifier`, `visual-explainer`, `general-purpose`

Out-of-stack work such as frontend, mobile, growth, SEO, payment, Cloudflare, Postgres, or Drizzle requires explicit user scope and current docs research before selecting any non-default specialist.

- Specialist
  - Name: <unique name for this specialist - this allows you and other team members to reference THIS specialist by name. Take note there may be multiple specialists, the name makes them unique.>
  - Role: <the single role and focus of this specialist>
  - Agent Type: <the subagent type matching the specialist's domain from the available list above, or GENERAL_PURPOSE_AGENT for cross-domain work>
  - Resume: <default true. This lets the agent continue working with the same context. Pass false if you want to start fresh with a new context.>
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
- Example: `cd services/backend && uv run pytest tests/` - Run backend tests
- Example: `cd services/backend && uv run ruff format . --check` - Verify formatting
- Example: `cd services/backend && uv run ruff check .` - Run lint
- Example: `cd services/backend && uv run bandit -r . -c pyproject.toml` - Run security scan

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
