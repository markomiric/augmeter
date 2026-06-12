---
name: session-management
description: "Session type detection and protocol reference for implementation tasks"
---

# Session Management

Session type protocols and cross-cutting practices for Claude Fast development work.

**Note:** The planning pipeline (`/team-plan` + `/build`) is the standard operating procedure for non-trivial work. `/team-plan` incorporates session type detection automatically as part of its workflow. This skill provides the detailed session type protocols that `/team-plan` references during planning.

Plan files in `.claude/tasks/` are the primary handoff artifact. `session-current.md` is optional and may not exist, so commands and agents should not require it when an explicit plan file is available.

---

## Session Type Detection

Identify the session type early -- it determines which protocol file to load and what the plan must include.

| Type            | Detection Triggers                                                      | Protocol File                  | Key Rule                                      |
| --------------- | ----------------------------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| **Development** | Building features, implementing plans, standard coding                  | `session-types/development.md` | Design-first, batch execution                 |
| **Debugging**   | Fixing bugs, investigating failures, diagnosing issues                  | `session-types/debugging.md`   | Root cause before fix (iron law)              |
| **Migration**   | Refactoring, replacing implementations, architectural changes           | `session-types/migration.md`   | Feature inventory required                    |
| **Repo Port**   | "port from", "rebuild", "based on" + repo URL, implementing from source | `session-types/repo-port.md`   | Source code IS the design spec (data + UI/UX) |
| **Review**      | Code review, PR review, pre-merge validation                            | `session-types/review.md`      | Technical rigor, no performative agreement    |
| **TDD**         | User requests TDD, critical business logic, high-reliability            | `session-types/tdd.md`         | RED-GREEN-REFACTOR cycle                      |
| **Research**    | Investigation, exploration, technology evaluation                       | `session-types/research.md`    | No implementation until complete              |
| **Growth**      | Marketing, product validation, content campaigns                        | `session-types/growth.md`      | Foundation before execution                   |

When /team-plan runs, it reads this table and loads the matching session type file for protocol-specific guidance. The session type determines whether special plan sections are required (e.g., "Source UI/UX Reference" for repo-port, "Feature Inventory" for migration).

---

## Session Lifecycle

```
PENDING -> IN_PROGRESS -> COMPLETE -> VERIFIED
```

- **PENDING**: Session created, work not started
- **IN_PROGRESS**: Active work underway
- **COMPLETE**: All tasks done, awaiting verification
- **VERIFIED**: Verification passed, ready to archive

Update status as work progresses in the active plan or session file. Mark tasks `[x]` immediately upon completion.

---

## Cross-Cutting Practices

These apply to ALL session types:

| Practice              | Purpose                           | File                             |
| --------------------- | --------------------------------- | -------------------------------- |
| **Verification**      | Evidence before completion claims | `practices/verification.md`      |
| **Branch Completion** | Finishing work on branches        | `practices/branch-completion.md` |

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
│   ├── repo-port.md            # Porting from existing repositories
│   ├── review.md               # Code review sessions
│   ├── tdd.md                  # Test-driven development sessions
│   ├── research.md             # Investigation sessions
│   └── growth.md               # Growth/marketing sessions
└── practices/
    ├── verification.md         # Evidence-before-completion protocol
    └── branch-completion.md    # Branch finishing workflow
```
