# Session Type: Migration

Use this session type for refactoring existing code, replacing implementations, or major architectural changes.

---

## When to Use

- Replacing existing functionality with new implementation
- Major refactoring efforts
- Framework/library migrations
- Architectural restructuring
- Consolidating duplicate code

**Related**: If the work involves porting from an external open-source repo (not refactoring your own code), use `repo-port.md` instead. Repo-port adds a UI/UX analysis layer that migration doesn't require.

---

## Session File Header

```markdown
**Session Type**: Migration
**Status**: `PENDING`
**Scope**: [What's being migrated]
**Risk Level**: High / Medium / Low
```

---

## Critical Rule

**No unmapped features allowed.**

Every function, class, and behavior in the old code must be explicitly accounted for in the new implementation or marked as intentionally removed (with user confirmation).

---

## Pre-Migration Requirements

### Step 1: Feature Inventory

Before ANY implementation, create complete inventory:

```markdown
## Feature Inventory

### Files Being Replaced

| Old File        | Functions/Classes                | Status     |
| --------------- | -------------------------------- | ---------- |
| `old/module.py` | `func_a()`, `func_b()`, `ClassX` | Not mapped |
| `old/utils.py`  | `helper_1()`, `helper_2()`       | Not mapped |

### Feature Mapping

| Old Feature  | New Location    | Task # | Notes                  |
| ------------ | --------------- | ------ | ---------------------- |
| `func_a()`   | `new/module.py` | Task 3 | Signature unchanged    |
| `func_b()`   | `new/module.py` | Task 3 | Return type changed    |
| `ClassX`     | `new/models.py` | Task 4 | Split into two classes |
| `helper_1()` | REMOVED         | -      | User confirmed removal |
```

### Step 2: Verification Gate

Before proceeding to implementation:

- [ ] All old files listed
- [ ] All functions/classes identified
- [ ] Every feature has Task # OR explicit "REMOVED"
- [ ] User confirmed any removals
- [ ] No "Not mapped" status remaining

**If any checkbox unchecked: STOP. Complete inventory first.**

---

## "Out of Scope" Clarification

**CRITICAL**: "Out of Scope" has precise meaning:

| Phrase                       | Meaning                 | Needs Task?            |
| ---------------------------- | ----------------------- | ---------------------- |
| "Out of Scope: Changes to X" | X migrates AS-IS        | YES                    |
| "Out of Scope: Feature X"    | X intentionally REMOVED | NO (needs user OK)     |
| "Out of Scope: New features" | No NEW features added   | Existing features: YES |

**When in doubt, ASK**:

```
"The old code has [feature]. Should we:
A) Migrate it as-is (needs task)
B) Intentionally remove it (truly out of scope)
C) Improve it (new feature, needs task)"
```

---

## Migration Workflow

### Phase 1: Inventory & Mapping

1. List all files being replaced
2. Identify all functions/classes
3. Map each to new location or mark REMOVED
4. Get user confirmation on removals
5. Pass verification gate

### Phase 2: Task Creation

Create tasks that explicitly reference old code:

```markdown
- [ ] Task 3: Migrate module functions
  - Old: `old/module.py` (func_a, func_b)
  - New: `new/module.py`
  - Changes: [list any behavioral changes]
  - Test: Verify same inputs produce same outputs
```

### Phase 3: Implementation

For EACH task:

1. **Read the old code completely**
2. **Create checklist** of behaviors from old code
3. **Implement** with checklist visible
4. **Verify each behavior** exists in new code
5. **Test with same inputs** - outputs must match

### Phase 4: Feature Parity Check

Before marking session complete:

1. Run new code
2. Compare behavior with old code (if available)
3. Check Feature Inventory - all mapped?
4. Verify no "Not mapped" items remain

---

## Session Tracking

```markdown
### Migration Progress

**Inventory Status**: Complete / In Progress
**Features Mapped**: X / Y
**Features Removed**: Z (user confirmed)

**Task Progress**:

- [x] Task 1 - [Component] - Parity verified
- [ ] Task 2 - [Component] - In progress

**Parity Checks**:

- [x] func_a: Old output matches new
- [x] func_b: Old output matches new
- [ ] ClassX: Pending verification
```

---

## Red Flags - Stop Migration

If you notice ANY of these, STOP and report:

- Feature Inventory section missing
- Old file has functions not in any task
- "Out of Scope" items that should be migrated
- Tests pass but functionality missing vs old code
- "Not mapped" status on any feature

---

## Quality Checklist

Before marking migration session complete:

- [ ] Feature Inventory 100% complete
- [ ] All features mapped to tasks OR confirmed removed
- [ ] All tasks implemented
- [ ] Feature parity verified (same inputs = same outputs)
- [ ] No "Not mapped" items remaining
- [ ] All tests pass
- [ ] Session documents full migration journey
