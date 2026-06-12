# Session Type: Test-Driven Development

Use this session type when strict TDD discipline is required or requested.

---

## When to Use

- User explicitly requests TDD
- Building critical business logic
- Creating APIs with complex behavior
- Bug fixes requiring regression tests
- High-reliability requirements

---

## Session File Header

```markdown
**Session Type**: TDD
**Status**: `PENDING`
**Coverage Target**: [percentage or "all new code"]
```

---

## Core Protocol

**No production code without a preceding failing test.** This is non-negotiable.

For the full TDD protocol -- RED-GREEN-REFACTOR cycle, anti-pattern detection (mock madness, brittle tests, false positives), condition-based waiting, and flaky test prevention -- see the `quality-engineer` agent definition. The quality-engineer agent is the authoritative source for TDD mechanics and testing best practices.

This session type file covers only the session-level workflow and rules.

---

## Violations Requiring Code Deletion

If any of these occur, DELETE the code and start over:

1. **Production code written before test** -- the test must exist and fail first
2. **Test retrofitted to existing code** -- delete both, start fresh
3. **"I'll add tests later"** -- delete production code, write test first
4. **Multiple features added in one GREEN** -- revert to last green, split into separate cycles
5. **Test written to pass (not to fail first)** -- TDD's value comes from the RED phase

---

## Session Tracking

```markdown
### TDD Progress

**Cycle Count**: X complete cycles

**Current Cycle**:

- RED: [test name] - Failed as expected
- GREEN: [implementation] - Passes
- REFACTOR: [changes made]

**Coverage**: X% (target: Y%)

**Tests Written**:

- [x] test_feature_a_scenario_1
- [x] test_feature_a_scenario_2
- [ ] test_feature_b_scenario_1 (in progress)
```

---

## Quality Checklist

Before marking TDD session complete:

- [ ] Every feature has at least one test
- [ ] Saw each test fail before implementing
- [ ] Each test failed for expected reason
- [ ] Wrote minimal code to pass
- [ ] All tests pass
- [ ] No anti-patterns present
- [ ] Coverage target met
- [ ] Session documents RED-GREEN-REFACTOR cycles
