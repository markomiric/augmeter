# Session Type: Research

Use this session type for investigation, exploration, and information gathering before implementation.

---

## When to Use

- Exploring unfamiliar codebase
- Investigating how a feature works
- Gathering requirements before development
- Technology evaluation
- Understanding existing patterns

---

## Session File Header

```markdown
**Session Type**: Research
**Status**: `PENDING`
**Question**: [What are we trying to understand?]
**Scope**: [Boundaries of investigation]
```

---

## Core Principle

**No implementation until research is complete.**

Research sessions produce understanding and documentation, not code. If implementation is needed, transition to a Development session.

---

## Knowledge Hierarchy

Search for information in this priority order:

### Priority 1: Internal Sources (Check First)

1. **Relevant skills** - Load skills that may contain answers
2. **Session history** - Check `.claude/tasks/` for related work
3. **Codebase patterns** - Search existing implementations

```bash
# Search codebase for patterns
rg "pattern_name" --type ts
```

### Priority 2: Project Context

1. **Code examples** - Find similar implementations in project
2. **Documentation** - README, docs/, inline comments
3. **Configuration** - package.json, tsconfig, etc.

### Priority 3: External Sources (Only When Internal Insufficient)

1. **Official documentation** - Library/framework docs
2. **GitHub issues** - Known problems and solutions
3. **Web search** - Community solutions

**Rule**: Exhaust internal sources before going external. Project-specific patterns are more relevant than generic solutions.

---

## Research Workflow

### Phase 1: Define the Question

Be specific about what you're investigating:

```markdown
**Primary Question**: How does authentication work in this codebase?

**Sub-Questions**:

1. Where is auth middleware defined?
2. How are tokens validated?
3. What happens on auth failure?
4. How do protected routes use auth?
```

### Phase 2: Systematic Search

For each question, search systematically:

1. **Grep for keywords**

   ```bash
   rg "authenticate" --type ts
   rg "middleware" --type ts
   rg "token" --type ts
   ```

2. **Read identified files completely**
   - Don't skim
   - Understand the full context
   - Note integration points

3. **Trace call chains**
   - Where is this called from?
   - What does this call?
   - What's the data flow?

### Phase 3: Document Findings

Structure findings clearly:

````markdown
### Finding: [Topic]

**Location**: `file/path.ts:line`

**How it works**:
[Explanation in your own words]

**Key code**:

```typescript
// Relevant snippet
```
````

**Integration points**:

- Called by: [list]
- Calls: [list]

**Questions remaining**:

- [Any gaps in understanding]

````

### Phase 4: Synthesize

After gathering findings:

1. **Summarize** - High-level understanding
2. **Diagram** - If complex, create visual representation
3. **Identify patterns** - What conventions exist?
4. **Note gaps** - What couldn't be answered?

---

## Session Tracking

```markdown
### Research Progress

**Questions**:
- [x] Question 1 - Answered
- [x] Question 2 - Answered
- [ ] Question 3 - In progress

### Findings

#### [Topic 1]
**Summary**: [1-2 sentences]
**Key files**: `file1.ts`, `file2.ts`
**Pattern identified**: [description]

#### [Topic 2]
**Summary**: [1-2 sentences]
**Key files**: `file3.ts`
**Pattern identified**: [description]

### Synthesis

**Overall understanding**: [paragraph summary]

**Key patterns**:
1. [Pattern 1]
2. [Pattern 2]

**Gaps remaining**:
- [What couldn't be determined]

### Recommendations

**Next steps**:
- [What should happen based on research]
````

---

## Transition Rules

### Research Complete - Ready for Development

When research answers all questions:

1. Document findings in session
2. Create Development session for implementation
3. Reference research session in new session

### Research Incomplete - Need More Information

If questions can't be answered:

1. Document what was found
2. List specific remaining questions
3. Ask user for additional context or direction

---

## Quality Checklist

Before marking research session complete:

- [ ] Primary question answered
- [ ] Sub-questions addressed
- [ ] Findings documented with file locations
- [ ] Patterns identified
- [ ] Gaps acknowledged
- [ ] Recommendations provided
- [ ] No implementation attempted
