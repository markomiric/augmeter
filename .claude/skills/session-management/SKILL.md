---
name: session-management
description: "Session type detection and protocol reference for implementation tasks"
---

# Session Management

Session type protocols and cross-cutting practices for Claude Fast development work.

**Note:** The planning pipeline (/team-plan + /build) is the standard operating procedure for non-trivial work. /team-plan incorporates session type detection automatically as part of its workflow. This skill provides the detailed session type protocols that /team-plan references during planning.

---

## Session Type Detection

Identify the session type early -- it determines which protocol file to load and what the plan must include.

| Type            | Detection Triggers                                            | Protocol File                  | Key Rule                                   |
| --------------- | ------------------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| **Development** | Building features, implementing plans, standard coding        | `session-types/development.md` | Design-first, batch execution              |
| **Debugging**   | Fixing bugs, investigating failures, diagnosing issues        | `session-types/debugging.md`   | Root cause before fix (iron law)           |
| **Migration**   | Refactoring, replacing implementations, architectural changes | `session-types/migration.md`   | Feature inventory required                 |
| **Review**      | Code review, PR review, pre-merge validation                  | `session-types/review.md`      | Technical rigor, no performative agreement |
| **TDD**         | User requests TDD, critical business logic, high-reliability  | `session-types/tdd.md`         | RED-GREEN-REFACTOR cycle                   |
| **Research**    | Investigation, exploration, technology evaluation             | `session-types/research.md`    | No implementation until complete           |

When /team-plan runs, it reads this table and loads the matching session type file for protocol-specific guidance. The session type determines whether special plan sections are required (e.g., "Feature Inventory" for migration).

### Cross-Cutting Signal: Workflow-Worthy Tasks

Independent of session type, a task may warrant execution as a dynamic workflow (a
custom JavaScript harness run via the `Workflow` tool) rather than `/build` or
`/team-build`. This is a cross-cutting signal, not a session type: a Debugging,
Research, Migration, or Review session can each emit a workflow while keeping its own
protocol. Apply the workflow-worthy checklist in `.claude/commands/team-plan.md`; if
two or more signals fire (massively parallel, adversarial/verification-heavy,
unknown-size discovery, large-scale sort/rank, high cross-context-contamination risk,
"do not stop until X"), `/team-plan` should emit a `## Workflow Harness` section and
recommend `/workflow-build`. See `practices/workflow-patterns.md` for the six patterns
and the harness primitives.

---

## Session Lifecycle

```
PENDING -> IN_PROGRESS -> COMPLETE -> VERIFIED
```

- **PENDING**: Session created, work not started
- **IN_PROGRESS**: Active work underway
- **COMPLETE**: All tasks done, awaiting verification
- **VERIFIED**: Verification passed, ready to archive

Update status as work progresses. Mark tasks `[x]` immediately upon completion.

---

## Cross-Cutting Practices

These apply to ALL session types:

| Practice              | Purpose                                            | File                             |
| --------------------- | -------------------------------------------------- | -------------------------------- |
| **Verification**      | Evidence before completion claims                  | `practices/verification.md`      |
| **Branch Completion** | Finishing work on branches                         | `practices/branch-completion.md` |
| **Workflow Patterns** | Six dynamic-workflow patterns + harness primitives | `practices/workflow-patterns.md` |

For parallel vs sequential agent dispatch rules, see the `sub-agent-invocation` skill.

---

## Directory Structure

```
session-management/
├── SKILL.md                    # This file -- session type detection + references
├── session-types/
│   ├── development.md          # Feature development sessions
│   ├── debugging.md            # Bug fixing sessions
│   ├── migration.md            # Refactoring/migration sessions
│   ├── review.md               # Code review sessions
│   ├── tdd.md                  # Test-driven development sessions
│   └── research.md             # Investigation sessions
└── practices/
    ├── verification.md         # Evidence-before-completion protocol
    ├── branch-completion.md    # Branch finishing workflow
    └── workflow-patterns.md    # Dynamic-workflow patterns + harness primitives
```
