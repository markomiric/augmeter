---
description: Execute an implementation plan from a spec file
argument-hint: [path-to-plan]
---

# Build

Follow the `Workflow` to implement the `PATH_TO_PLAN` then `Report` the completed work.

## Variables

PATH_TO_PLAN: $ARGUMENTS

## Workflow

- If no `PATH_TO_PLAN` is provided, STOP immediately and ask the user to provide it (AskUserQuestion).
- Read and execute the plan at `PATH_TO_PLAN`. Think hard about the plan and implement it into the codebase.
- Follow the Team Orchestration section if present - use Task tools to coordinate team members.
- Follow the Step by Step Tasks in order, respecting dependencies.
- Use the Validation Commands to verify your work.

### Mandatory Plan Reading for Sub-Agents

**Every sub-agent you spawn MUST read the full plan file before starting any work.** This is non-negotiable.

When deploying a sub-agent via the Task tool, always include this instruction at the top of the prompt:

```
MANDATORY FIRST STEP: Read the full plan file at [PATH_TO_PLAN] before doing anything else. The plan contains critical architectural decisions, patterns, and conventions that you must follow. Do not skip sections -- read the entire document, then begin your assigned work.
```

**Why this matters:** The plan contains project-wide decisions (caching strategy, naming conventions, architectural patterns) that individual task descriptions may not repeat. Sub-agents that skip the plan will default to their own assumptions, causing drift from the intended architecture. Reading the full plan ensures every agent works from the same source of truth.

### Verification Before Completion

**Evidence before claims, always.** Before marking any task complete or claiming work is done:

1. Identify the verification command (build, test, lint, run)
2. Execute it NOW (not from memory, not from a previous run)
3. Read the complete output (exit code, errors, warnings)
4. Only claim completion when output confirms the claim

Red flag phrases that require immediate verification: "should pass now", "probably works", "seems to be working", "I believe it's fixed". If you catch yourself or a sub-agent using these, STOP and run the verification command.

See `.claude/skills/session-management/practices/verification.md` for the full protocol.

## Report

- Present the `## Report` section of the plan with actual results filled in.
