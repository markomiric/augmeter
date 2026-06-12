# Session Type: Debugging

Use this session type for fixing bugs, investigating failures, and systematic problem resolution.

---

## When to Use

- Fixing reported bugs
- Investigating test failures
- Diagnosing unexpected behavior
- Performance issues
- Production incidents

---

## Session File Header

```markdown
**Session Type**: Debugging
**Status**: `PENDING`
**Symptom**: [What's failing/broken]
**Severity**: Critical / High / Medium / Low
```

---

## Iron Law

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST**

Do not propose or implement fixes until you understand WHY the bug exists. Guessing wastes time and often introduces new bugs.

---

## Four-Phase Methodology

### Phase 1: Root Cause Investigation

**Required before ANY fix attempt:**

1. **Read error messages completely**
   - Full stack traces
   - Line numbers
   - Error codes
   - Surrounding context

2. **Reproduce consistently**
   - Document exact steps
   - If not reproducible, gather more data
   - Note conditions (environment, timing, data)

3. **Check recent changes**

   ```bash
   git diff HEAD~5
   git log --oneline -10
   ```

   - New dependencies?
   - Config changes?
   - Related code modifications?

4. **Instrument if needed**
   - Add logging at boundaries
   - Trace data flow
   - Identify failing layer (see Defense-in-Depth below)

**Output**: Clear statement of root cause

---

## Defense-in-Depth Layer Analysis

When tracing bugs, identify which layer failed. Bugs often occur because validation exists at one layer but not others.

**The Four Layers:**

| Layer                        | Purpose                                              | Check For                                                     |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| **1. Entry Point**           | Reject invalid input at API/function boundaries      | Missing type checks, empty string validation, path existence  |
| **2. Business Logic**        | Ensure data makes semantic sense for operation       | Edge cases, invalid state combinations, assumption violations |
| **3. Environment Guards**    | Prevent dangerous operations in wrong context        | Test vs production paths, directory safety, permission checks |
| **4. Debug Instrumentation** | Capture context for forensics when other layers fail | Missing logs at boundaries, insufficient error context        |

**Layer Tracing Protocol:**

1. Where did invalid data **originate**?
2. What **checkpoints** did it pass through?
3. Which layer **should have** caught it but didn't?
4. What other code paths **bypass** the existing validation?

**Key Insight**: Different code paths often bypass entry validation. Mocks in tests can circumvent business logic. A bug at layer 3 often means layers 1-2 have gaps.

### Phase 2: Pattern Analysis

1. **Find working examples**
   - Similar code that works
   - Reference implementations
   - Documentation examples

2. **Compare thoroughly**
   - Line by line comparison
   - Include "small" differences
   - Check assumptions

3. **Identify ALL differences**
   - Not just obvious ones
   - Environment, config, dependencies
   - Timing, ordering, state

**Output**: List of differences between working and broken

### Phase 3: Hypothesis & Testing

1. **Form specific hypothesis**
   - "X is root cause because Y"
   - Not "maybe it's X"

2. **Test with minimal change**
   - ONE variable at a time
   - Smallest possible modification
   - Isolate the fix

3. **Verify result**
   - Worked? Proceed to Phase 4
   - Failed? New hypothesis, return to step 1

**Output**: Confirmed hypothesis or elimination

### Phase 4: Implementation

1. **Write test case FIRST**
   - Reproduces the bug
   - Fails before fix
   - Passes after fix

2. **Implement single fix**
   - ONE focused change
   - No bundled "improvements"
   - Address root cause only

3. **Verify completely**
   - New test passes
   - Existing tests pass
   - No regressions

**Output**: Fix with passing tests

---

## Escalation Rule

**After 3+ failed fix attempts:**

Stop trying fixes. The problem is likely architectural.

1. Document what was tried
2. List what each attempt revealed
3. Question the approach/pattern
4. Escalate to user or specialist

---

## Red Flags - Stop Immediately

If you catch yourself thinking:

- "Quick fix for now"
- "Just try X"
- "Skip the test"
- "Probably X"
- "Don't fully understand but might work"

**STOP**. Return to Phase 1.

---

## Session Tracking

Update session file after each phase:

```markdown
### Debugging Progress

**Phase 1 - Investigation**:

- Error: [exact message]
- Reproduction: [steps]
- Recent changes: [relevant commits]
- Root cause hypothesis: [statement]

**Phase 2 - Analysis**:

- Working example: [file:line]
- Key differences: [list]

**Phase 3 - Testing**:

- Hypothesis 1: [result]
- Hypothesis 2: [result]

**Phase 4 - Fix**:

- Test added: [file]
- Fix applied: [file:line]
- Verification: [command output]
```

---

## Quality Checklist

Before marking debugging session complete:

- [ ] Root cause identified and documented
- [ ] Regression test added
- [ ] Fix addresses root cause (not symptoms)
- [ ] All tests pass
- [ ] No new issues introduced
- [ ] Session file documents the journey
