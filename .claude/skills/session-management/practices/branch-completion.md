# Practice: Branch Completion

This practice defines the structured workflow for finishing work on a branch.

---

## Core Principle

**Never proceed with failing tests.**

Before any branch completion action, all tests must pass. No exceptions.

---

## Pre-Completion Requirements

Before considering branch completion:

- [ ] All tests pass
- [ ] No lint errors
- [ ] Build succeeds
- [ ] Session tasks complete
- [ ] Code reviewed (if applicable)

**If any checkbox unchecked: Fix first, then proceed.**

---

## Four Completion Options

When work is ready to complete, choose one:

### Option 1: Merge Locally

**When**: Ready to integrate, no PR required

```bash
# Ensure on feature branch
git checkout feature-branch

# Verify tests pass
cd services/backend && uv run pytest tests/

# Switch to base and merge
git checkout main
git merge feature-branch

# Delete feature branch
git branch -d feature-branch
```

**Session update**:

```markdown
**Branch Completion**: Merged locally to main
**Action**: `git merge feature-branch` into main
**Branch deleted**: Yes
```

### Option 2: Push and Create PR

**When**: Need review before merge, team workflow

```bash
# Push branch
git push -u origin feature-branch

# Create PR
gh pr create --title "Feature: X" --body "Description..."
```

**Session update**:

```markdown
**Branch Completion**: PR created
**PR URL**: [link]
**Status**: Awaiting review
```

### Option 3: Preserve Branch

**When**: Work incomplete but need to context-switch

```bash
# Commit current state
git add .
git commit -m "WIP: [description of state]"

# Push to remote for safety
git push -u origin feature-branch
```

**Session update**:

```markdown
**Branch Completion**: Preserved for later
**Branch**: feature-branch
**State**: [description of what's done/remaining]
**Resume instructions**: [what to do when returning]
```

### Option 4: Discard Work

**When**: Approach failed, starting over

```bash
# Switch away from branch
git checkout main

# Delete local branch
git branch -D feature-branch

# Delete remote if pushed
git push origin --delete feature-branch
```

**Session update**:

```markdown
**Branch Completion**: Discarded
**Reason**: [why work was abandoned]
**Learnings**: [what was learned for future attempts]
```

---

## Decision Tree

```
Is work complete?
├─ NO → Option 3 (Preserve) or Option 4 (Discard)
└─ YES → Do tests pass?
    ├─ NO → Fix tests first
    └─ YES → Is PR required?
        ├─ YES → Option 2 (Create PR)
        └─ NO → Option 1 (Merge locally)
```

---

## Safety Checks

### Before Merging

```bash
# Verify on correct branch
git branch

# Check nothing uncommitted
git status

# Run full test suite
cd services/backend && uv run pytest tests/

# Verify lint and security gates
cd services/backend && uv run ruff check .
cd services/backend && uv run bandit -r . -c pyproject.toml
```

### Before Discarding

```bash
# Check for uncommitted work
git status

# Review what will be lost
git log main..feature-branch

# Confirm with user if significant work
```

---

## Integration with Session Types

### Development Sessions

- Typically Option 1 (merge) or Option 2 (PR)
- Preserve if user needs to pause

### Debugging Sessions

- Option 1 after fix verified
- Option 3 if debugging incomplete

### Migration Sessions

- Usually Option 2 (PR for review)
- Never Option 4 without explicit user confirmation

### TDD Sessions

- Option 1 or 2 after all tests green
- Option 3 if cycle incomplete

---

## Session File Update

Always update session file with completion status:

```markdown
## Session Completion

**Status**: `COMPLETE` / `PRESERVED` / `DISCARDED`
**Branch Action**: [which option taken]
**Final State**: [description]

### Completion Checklist

- [x] All tests pass
- [x] Build succeeds
- [x] Branch action completed
- [x] Session file updated
```

---

## Quick Reference

| Situation           | Option   | Commands                              |
| ------------------- | -------- | ------------------------------------- |
| Ready, no PR needed | Merge    | `checkout main`, `merge`, `branch -d` |
| Ready, need review  | PR       | `push -u`, `gh pr create`             |
| Incomplete, pause   | Preserve | `commit WIP`, `push -u`               |
| Failed approach     | Discard  | `checkout main`, `branch -D`          |

**Always verify tests pass before Options 1 or 2.**
