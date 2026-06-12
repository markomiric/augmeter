# Session Type: Code Review

Use this session type for reviewing code - whether your own work, others' PRs, or pre-merge validation.

---

## When to Use

- Reviewing pull requests
- Pre-merge validation
- Post-implementation quality check
- Reviewing agent-generated code
- Audit of existing code

---

## Session File Header

```markdown
**Session Type**: Review
**Status**: `PENDING`
**Target**: [PR #, branch, or file paths]
**Review Type**: Self / Peer / Audit
```

---

## Core Principle

**Technical rigor over performative agreement.**

Reviews exist to catch problems, not to make people feel good. Be direct, specific, and constructive.

---

## Receiving Code Review

### Forbidden Responses

Never say:

- "You're absolutely right!"
- "Great point!"
- "Thanks for catching that!"
- Excessive gratitude or agreement

**Why**: These phrases often precede implementing changes without understanding them. They signal performative compliance, not genuine engagement.

### Required Process

1. **Read complete feedback**
   - Don't skim
   - Understand each point fully

2. **Verify against actual code**
   - Don't assume reviewer is correct
   - Check the code yourself
   - Reviewer may have misread

3. **Ask before assuming**
   - If feedback is unclear, ask
   - Don't guess what they meant
   - Get clarification BEFORE implementing

4. **Actions speak**
   - Just fix issues
   - Don't over-explain or apologize
   - Code changes > words

### Response Template

```markdown
Regarding [specific feedback]:

- Verified: [what you checked]
- Understanding: [your interpretation]
- Action: [what you'll do / why you disagree]
```

---

## Requesting Code Review

### When to Request

- After completing major feature
- Before merging to main
- After significant refactoring
- When uncertain about approach

### Required Information

Provide ALL of the following:

```markdown
## Review Request

**What was built**: [1-2 sentence summary]
**Specs/Requirements**: [link or description]
**Commits**: [hash range or list]
**Files changed**: [key files to focus on]
**Specific concerns**: [areas you're uncertain about]
**Testing done**: [what you verified]
```

### Severity Levels

When reporting issues found:

| Severity      | Meaning                                              | Action                        |
| ------------- | ---------------------------------------------------- | ----------------------------- |
| **Critical**  | Blocks functionality, security issue, data loss risk | Fix immediately, blocks merge |
| **Important** | Incorrect behavior, missing edge case, poor pattern  | Fix before merge              |
| **Minor**     | Style, naming, minor improvements                    | Can defer, low risk           |

---

## Review Checklist

When reviewing code, check:

### Correctness

- [ ] Logic handles edge cases
- [ ] Error paths covered
- [ ] Algorithms correct
- [ ] Types accurate

### Architecture

- [ ] Follows project patterns
- [ ] No unnecessary coupling
- [ ] Single responsibility
- [ ] Appropriate abstraction level

### Security

- [ ] Input validation present
- [ ] No SQL/command injection
- [ ] Auth/authz checked
- [ ] Sensitive data handled properly

### Performance

- [ ] No N+1 queries
- [ ] No memory leaks
- [ ] Efficient algorithms
- [ ] Appropriate caching

### Maintainability

- [ ] Clear naming
- [ ] Complex logic documented
- [ ] Tests present and meaningful
- [ ] No dead code

---

## Review Output Format

```markdown
## Code Review: [Target]

**Overall**: Approve / Request Changes / Needs Discussion

### Critical Issues

- [File:line] - [Issue description] - [Suggested fix]

### Important Issues

- [File:line] - [Issue description] - [Suggested fix]

### Minor Issues

- [File:line] - [Issue description]

### Positive Notes

- [What was done well]

### Questions

- [Clarifications needed]
```

---

## Session Tracking

```markdown
### Review Progress

**Files Reviewed**: X / Y
**Issues Found**: Critical: A, Important: B, Minor: C

**Review Notes**:

- `file1.ts`: [summary of findings]
- `file2.ts`: [summary of findings]

**Status**: Approved / Changes Requested / Blocked
```

---

## Quality Checklist

Before marking review session complete:

- [ ] All files in scope reviewed
- [ ] Checklist items verified
- [ ] Issues categorized by severity
- [ ] Clear action items provided
- [ ] Session documents findings
