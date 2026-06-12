# Command Builder

Build Claude Code slash workflows. Prefer a skill folder when the workflow benefits from automatic triggering, references, scripts, examples, or assets. Use `.claude/commands/` for existing/legacy prompt templates that need argument interpolation or command-specific hooks.

## What a Command Is

A command is a `.md` file in `.claude/commands/` (project) or `~/.claude/commands/` (global). It has YAML frontmatter defining metadata and a markdown body that becomes a prompt template. Users invoke it by typing `/command-name` in the chat. The body supports variable interpolation via `$ARGUMENTS` or positional `$1`, `$2`, etc.

Current Claude Code also slash-invokes skills: `.claude/skills/deploy/SKILL.md` creates `/deploy`, and if a skill and command share the same name, the skill takes precedence. Existing `.claude/commands/` files keep working; do not migrate them just for novelty.

Commands are fundamentally different from skills and agents:

| Aspect           | Command                              | Skill                                           | Agent                             |
| ---------------- | ------------------------------------ | ----------------------------------------------- | --------------------------------- |
| **Triggered by** | User types `/name`                   | Model auto-detects; user can type `/skill-name` | Model auto-delegates              |
| **Variables**    | `$ARGUMENTS`, `$1`, `$2`             | None                                            | None                              |
| **Context**      | Runs in main conversation            | Enhances main conversation                      | Spawns isolated subprocess        |
| **Hooks**        | Can attach Stop/PreToolUse hooks     | Plain skill no; plugin skill can bundle hooks   | No hooks                          |
| **Best for**     | Repeatable workflows with user input | Domain knowledge, bundled resources             | Focused delegation, parallel work |

## When to Create a Command

Create a command when:

- The user explicitly triggers it (not auto-detected)
- It needs user input each time (arguments)
- It's a repeatable workflow with the same structure but different inputs
- It needs validation hooks to enforce output quality
- It orchestrates other tools or agents with a known pattern
- The repo already has a `.claude/commands/` workflow and you are maintaining it

Don't create a command when:

- The task should trigger automatically based on context (use a skill)
- The task needs isolated execution (use an agent)
- The workflow needs supporting references, examples, scripts, or assets (use a skill)
- There's no repeatable pattern to templatize

## The Command Creation Process

### Step 1: Understand the Intent

Ask or infer:

1. **What does the user do repeatedly?** Commands templatize repetitive workflows. "Every time I finish a feature, I run tests, commit, and create a PR" is a command. "Help me understand this code" is not (that's a skill).

2. **What varies each time?** These become arguments. A blog post creator needs the topic. A plan executor needs the plan path. A deploy command needs the environment name.

3. **What stays the same?** These become the body. The workflow steps, output format, validation rules, and orchestration logic are fixed.

4. **Does it need guardrails?** Commands that produce artifacts (plans, files, reports) benefit from Stop hooks that validate the output before the command completes.

5. **Should it override the model?** Heavy reasoning tasks (planning, architecture) might need `model: opus`. Simple tasks work fine with the default.

### Step 2: Draft the Command File

The complete format:

```markdown
---
description: What this command does (shown in autocomplete)
argument-hint: [what the user should provide]
model: opus # Optional: override model
allowed-tools: Read, Grep # Optional: restrict tools
disallowed-tools: Task, Edit # Optional: block specific tools
hooks: # Optional: validation hooks
  Stop:
    - hooks:
        - type: command
          command: >-
            node "$CLAUDE_PROJECT_DIR/.claude/hooks/Validators/validate-new-file.mjs"
            --directory "$CLAUDE_PROJECT_DIR/.claude/tasks"
            --extension .md
---

# Command Name

One-line description of what this command does and how it works.

## Variables

VARIABLE_NAME: $ARGUMENTS

# Or positional:

FIRST_ARG: $1
SECOND_ARG: $2 - (Optional) Description of what this is

## Instructions

- If no required variable is provided, STOP and ask the user.
- <Clear instructions for what to do>

## Workflow

1. <First step>
2. <Second step>
3. <Third step>

## Report

<Output format template>
```

### Step 3: Write Each Section Well

#### The Frontmatter

**description** (required): Shows in autocomplete when the user types `/`. Keep it under 100 characters. Should be immediately clear what the command does.

```yaml
# Good
description: Creates a detailed implementation plan and saves it to .claude/tasks/
description: Execute an implementation plan from a spec file

# Bad
description: A helpful command  # too vague
description: This command takes a user prompt and then analyzes it to create a comprehensive engineering specification document with team orchestration capabilities  # too long
```

**argument-hint** (recommended): Shows after the command name as a hint for what to type. Use brackets for required args, describe optional ones.

```yaml
argument-hint: [path-to-plan]
argument-hint: [user prompt] [orchestration prompt]
argument-hint: [url-to-review]
```

**model** (optional): Override the model for this command. Use `opus` for complex reasoning tasks (planning, architecture, orchestration). Omit for default model.

**allowed-tools / disallowed-tools** (optional): Restrict or block tools. Planning commands should typically disallow `Task` (prevent premature execution). Read-only commands should allow only `Read, Grep, Glob`.

**hooks** (optional): Attach lifecycle hooks. Most useful is `Stop` -- validates the command's output before it completes. If validation fails, the command reruns to fix the issue.

```yaml
hooks:
  Stop:
    - hooks:
        - type: command
          command: >-
            node "$CLAUDE_PROJECT_DIR/.claude/hooks/Validators/validate-file-contains.mjs"
            --directory "$CLAUDE_PROJECT_DIR/.claude/tasks"
            --extension .md
            --contains "## Acceptance Criteria"
            --contains "## Step by Step Tasks"
```

#### Variables

Use `$ARGUMENTS` for a single argument or `$1`, `$2`, `$3` for positional arguments. Always:

- Name the variable clearly (USER_PROMPT, PATH_TO_PLAN, TARGET_ENV)
- Mark optional arguments with `(Optional)` and a description
- Define default values for directory paths and other constants
- Include a guard clause: "If no X provided, STOP and ask"

```markdown
## Variables

USER_PROMPT: $1
ORCHESTRATION_PROMPT: $2 - (Optional) Guidance for team assembly
PLAN_OUTPUT_DIRECTORY: `.claude/tasks/`
```

#### Instructions vs Workflow

**Instructions** -- the rules, constraints, and principles. "What to do and what not to do."

```markdown
## Instructions

- **PLANNING ONLY**: Do NOT build, write code, or deploy agents.
- Carefully analyze the user's requirements
- Think deeply about the best approach
- Include code examples where appropriate
- Consider edge cases, error handling, and scalability
```

**Workflow** -- the numbered sequence of actions. "In what order."

```markdown
## Workflow

1. Analyze Requirements - Parse the USER_PROMPT
2. Understand Codebase - Read relevant files
3. Design Solution - Develop technical approach
4. Generate Filename - Create a descriptive kebab-case name
5. Save Plan - Write to PLAN_OUTPUT_DIRECTORY
6. Report - Summarize key components
```

Some commands merge these into one section. That's fine for simple commands. For complex ones (50+ lines of instructions), separate them.

#### The Report Section

Every command should define its output format. This is what the user sees when the command completes. Template it so the output is consistent across invocations.

```markdown
## Report

After completion, present:

File: PLAN_OUTPUT_DIRECTORY/<filename>.md
Topic: <brief description>
Key Components:

- <main component 1>
- <main component 2>

When you're ready, run:
/build <path to plan>
```

Reports that reference follow-up commands (`/build`, `/git-commits`) create natural workflow chains.

#### Templates and Placeholders

For commands that generate structured output (plans, specs, reports), include the full template in the command body. Use `<placeholder>` notation for content the model fills in:

```markdown
## Plan Format

# Plan: <task name>

## Task Description

<describe the task in detail>

## Objective

<clearly state what will be accomplished>

## Step by Step Tasks

### 1. <First Task Name>

- **Task ID**: <unique-id>
- **Depends On**: <dependencies or "none">
- **Assigned To**: <team member>
```

This pattern is powerful because it gives the model an exact structure to follow. The model fills in the `<placeholders>` with real content while preserving the structural skeleton. Include notes about conditional sections:

```markdown
<if complexity is medium/complex, include this section:>

## Implementation Phases

### Phase 1: Foundation

<describe foundational work>
</if>
```

### Step 4: Place the File

```bash
# Project command (shared with team via git)
write .claude/commands/<command-name>.md

# Global command (personal, available in all projects)
write ~/.claude/commands/<command-name>.md
```

### Step 5: Test

After creating the command:

1. Type `/` and verify the command appears with its description
2. Run it with test arguments
3. Check the output matches the expected format
4. If hooks are attached, verify they catch invalid output

## Anatomy of Real Commands

### Simple Command (~25 lines): `/build`

The simplest useful pattern. Takes a path, reads a plan, executes it, reports results. No model override, no hooks, no complex orchestration. Just "read this and do it."

Key pattern: **gateway command** -- it delegates everything to the plan document itself. The command is just a launcher.

### Medium Command (~100 lines): `/blog`

A workflow command with multiple steps, conditional logic, and a specific output format. Typically:

- 2-3 variables
- Research/interview phase
- Execution phase
- Validation checklist
- Defined report format

### Complex Command (~400 lines): `/team-plan`

A full orchestration command. Key patterns:

- `model: opus` for heavy reasoning
- `disallowed-tools: Task, EnterPlanMode` to prevent premature execution
- Stop hooks validating required sections exist
- Extensive documentation of tools available to the model (TaskCreate, TaskUpdate, etc.)
- Detailed template with conditional sections
- Team member definitions and assignment patterns
- Chains to `/build` or `/team-build` as the next step

### Pipeline Pattern

Commands work best as chains:

```
/team-plan "build auth system"
  -> produces .claude/tasks/auth-system.md

/build .claude/tasks/auth-system.md
  -> executes the plan with isolated sub-agents

/team-build .claude/tasks/auth-system.md
  -> executes with collaborative Agent Teams
```

Each command does one thing. The plan document is the contract between them.

## Command Design Patterns

### The Planner

Generates a structured plan without executing. Disallows execution tools. Validates output sections via hooks. Chains to an executor command.

```yaml
disallowed-tools: Task, EnterPlanMode
hooks:
  Stop:
    - hooks:
        - type: command
          command: >-
            node "$CLAUDE_PROJECT_DIR/.claude/hooks/Validators/validate-file-contains.mjs"
            --contains "## Step by Step Tasks"
```

### The Executor

Takes a plan path and executes it. Minimal own logic -- defers to the plan's instructions. Reports results.

```yaml
description: Execute an implementation plan from a spec file
argument-hint: [path-to-plan]
```

### The Orchestrator

Manages a team of agents. Documents all available tools (Task, TaskCreate, TaskUpdate). Defines team formation rules, wave execution, and contract delivery patterns.

### The Workflow

A multi-step process with a defined sequence. Good for recurring tasks like blog writing, code review, deployment, or release management.

### The Gateway

A one-line command that just chains to something else:

```markdown
---
description: Quick commit with auto-generated message
---

Run /git-commits with smart defaults.
```

## Common Mistakes

1. **Putting execution logic in a planning command** -- If the command generates a plan, it should NEVER also execute it. Separate planning from execution.

2. **No argument validation** -- Always check if required arguments are provided. "If no PATH_TO_PLAN is provided, STOP and ask."

3. **Vague descriptions** -- The description shows in autocomplete. "Does stuff" doesn't help. "Creates an implementation plan and saves to .claude/tasks/" does.

4. **Missing report section** -- Without a defined output format, the command's results are inconsistent across invocations.

5. **Overstuffed commands** -- If a command exceeds 500 lines, split it into a pipeline. The plan format template alone can be 100+ lines -- that's fine because it's structural, not instructional.

6. **No workflow chain** -- A planning command that doesn't tell the user what to run next is a dead end. Always include the follow-up: "Run `/build <path>` to execute."

## Gotchas

- `$ARGUMENTS` captures everything after the command name as a single string. `$1`, `$2` split on spaces. If an argument might contain spaces (like a user prompt), use `$1` and quote it.
- `argument-hint` is display-only -- it doesn't enforce anything. You still need guard clauses in the body.
- `model` in frontmatter overrides the session model for this command only. The user's model selection returns after the command completes.
- `allowed-tools` and `disallowed-tools` are mutually exclusive in practice. Use one or the other.
- Hook commands must be non-interactive. They receive JSON on stdin and must exit 0 (pass) or 2 (fail, triggers retry).
- Commands in `.claude/commands/` are project-scoped. Commands in `~/.claude/commands/` are global. If both exist with the same name, the project one wins.
- Nested directories work: `.claude/commands/deploy/staging.md` becomes `/deploy:staging`.
