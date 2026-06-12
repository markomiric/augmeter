# Practice: Verification Before Completion

This practice applies to ALL session types. Use it before making any completion claim.

---

## Core Rule

**Evidence before claims, always.**

Never claim something is done, working, passing, or fixed without executing a verification command and showing the output.

---

## Verification Gate Protocol

Before ANY status claim (completed, passing, working, fixed):

### Step 1: Identify

What command proves this claim?

| Claim                  | Verification Command                                          |
| ---------------------- | ------------------------------------------------------------- |
| "Tests pass"           | `cd services/backend && uv run pytest tests/`                 |
| "Formatting is clean"  | `cd services/backend && uv run ruff format . --check`         |
| "No lint errors"       | `cd services/backend && uv run ruff check .`                  |
| "Security scan passes" | `cd services/backend && uv run bandit -r . -c pyproject.toml` |
| "Server starts"        | Start server, show output                                     |
| "Bug is fixed"         | Run reproducer, show it works                                 |
| "Feature works"        | Execute feature, show result                                  |

### Step 2: Execute

Run the command NOW.

- Not from memory
- Not from previous run
- Fresh execution in current state

### Step 3: Read

Check the complete output:

- Exit code (0 = success)
- Full output text
- Any warnings or errors
- Counts (X tests passed, 0 failed)

### Step 4: Verify

Does the output actually confirm your claim?

- "All tests pass" requires seeing "X passed, 0 failed"
- "Build succeeds" requires exit code 0
- "No errors" requires clean output

### Step 5: Claim with Evidence

State your claim WITH output:

```markdown
All 47 tests pass:
```

cd services/backend && uv run pytest tests/
47 passed in 3.2s

```

```

---

## Red Flag Phrases

**Never use these without evidence:**

| Red Flag               | Problem                        |
| ---------------------- | ------------------------------ |
| "should pass now"      | Assumption, not verification   |
| "probably works"       | Hedging without proof          |
| "seems to be working"  | Vague, unverified              |
| "I believe it's fixed" | Belief is not evidence         |
| "looks correct"        | Visual inspection insufficient |
| "I'm confident"        | Confidence is not verification |

**If you catch yourself using these, STOP and run the verification command.**

---

## Stop Signals

Run verification immediately when you're about to:

- Mark a task complete
- Claim tests pass
- Say something is fixed
- Commit code
- Move to next task
- Express satisfaction ("Great!", "Done!")

---

## Correct vs Incorrect

### Incorrect (No Evidence)

```markdown
I've fixed the bug. The tests should pass now.
```

**Problem**: "should" is not evidence.

### Correct (With Evidence)

````markdown
Bug fixed. Verification:

```bash
cd services/backend && uv run pytest tests/
2 passed in 0.24s
```
````

```

---

## Integration with Session Types

### Development Sessions
- Verify after each task batch (3 tasks)
- Verify before marking session complete

### Debugging Sessions
- Verify reproducer before fix
- Verify fix resolves issue
- Verify no regressions

### Migration Sessions
- Verify feature parity
- Verify old behavior preserved
- Verify all tests pass

### TDD Sessions
- Verify RED (test fails)
- Verify GREEN (test passes)
- Verify no regressions

### Review Sessions
- Verify issues reported match code
- Verify suggested fixes work

---

## Quick Reference

```

Before claiming X:

1. What proves X? → [command]
2. Run [command] NOW
3. Read full output
4. Output confirms X?
5. State X + show output

No output = No claim

```

```
