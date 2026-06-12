---
name: sub-agent-invocation
description: "Coordination and delegation protocols for sub-agent specialist assignments"
---

# Central AI Delegation Protocol

Load this skill before invoking ANY sub-agent (master-orchestrator, specialists, validators).

---

## Constitutional Invocation Requirements

Every sub-agent prompt **MUST** include four components:

### 1. Complete Context (Be Detailed)

- Project goal and current state
- Why this work is needed now
- How this task fits into broader objectives
- Dependencies on other work or prior decisions

### 2. Explicit Instructions (Be Clear)

- Specific task requirements with clear scope
- Expected deliverables and exact format
- Success criteria and validation requirements

### 3. Context References (Point to Sources)

- Repo primer: "Read .claude/rules/repo-primer.md for the active stack"
- Plan/session files: "Read the active plan file in .claude/tasks/ for full context. If session-current.md exists, use it as additional context."
- Skills: "Load [relevant] skill for patterns and workflows"
- Related implementations: Point to similar existing code

### 4. Performance Directives (Demand Excellence)

- Always include: "Think hard and analyze deeply before proceeding"
- Specify thoroughness level: "comprehensive analysis" or "quick validation"

---

## Invocation Template

```
"USER'S ORIGINAL REQUEST: [verbatim user prompt - MANDATORY]

[COMPREHENSIVE CONTEXT]
- Project: [overall goal and current state]
- Background: [why this matters, how it fits]
- Dependencies: [what this builds on or integrates with]

TASK ASSIGNMENT:
[Detailed, specific requirements with clear scope and boundaries]

CONTEXT REFERENCES:
- Session: [path and what to extract]
- Skills: [relevant skills to load]
- Examples: [similar existing implementations]

Think hard and provide [thoroughness level] analysis/implementation.

DELIVERABLES:
[Exact format, success criteria, validation requirements]"
```

**Sub-Agent Context Principle**: Sub-agents have temporary windows—maximize their context collection. Over-collection is safe; under-collection causes failures.

---

## Common Invocation Failures

| Bad                   | Good                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| "Fix authentication"  | "Fix OAuth redirect loop where successful login redirects to /login instead of /dashboard"                         |
| "Add tests"           | "Add tests for user profile editing (session Phase 2) covering avatar upload, validation, error handling"          |
| "Implement feature X" | "Implement feature X following the active plan file, integrating with Z API, and preserving the repo-primer stack" |

---

## Routing Decision

| Scenario                                           | Approach                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Multi-phase feature, 5+ files, architectural       | Auto-invoke `/team-plan` → user approval → `/build`                                                  |
| Cross-domain integration, agents need coordination | `/team-plan` → user approval → `/team-build` (Agent Teams)                                           |
| Simple file edit, pattern search, single-component | Direct sub-agent delegation                                                                          |
| Ambiguous scope, needs planning                    | Gather context → `/team-plan` → user approval → `/build`                                             |
| Clear scope, bounded execution                     | Direct delegation                                                                                    |
| High-reliability task, production changes          | `/team-plan` with Specialist + Quality Engineer validation                                           |
| Research/exploration only                          | Direct Explore agent or deep-researcher                                                              |
| Porting from existing repo with UI to replicate    | Repo-port session -> Source Analysis -> `/team-plan` with UX Reference -> `/build` with UX injection |

**`/build` vs `/team-build` Decision:**

- `/build`: Tasks are independent, sub-agents don't need to communicate, cost-sensitive (1x tokens)
- `/team-build`: Agents need peer-to-peer coordination, cross-domain interfaces, contract-first spawning (2-4x tokens)

---

## Auto-Invocation Protocol

Central AI auto-invokes `/team-plan` + `/build` (or `/team-build`) for complex work. This is the standard operating procedure for all non-trivial implementation.

### Decision Criteria

**Auto-invoke `/team-plan` immediately when:**

- Request involves 5+ files or multiple domains
- Request is clearly multi-phase (e.g., "build feature with X, Y, Z")
- Request involves architectural or structural changes
- User explicitly asks for team coordination or a plan

**Gather info first, then invoke when:**

- Request is vague but potentially complex
- Request needs clarification about scope or approach
- Request touches unfamiliar areas of the codebase

**Don't invoke (direct execution) when:**

- Single file fix, typo, config change
- Clear, bounded task for a single specialist
- Research/exploration only (no implementation)

### Invocation Syntax

**Step 1 - Plan:**

```
Skill({ skill: "team-plan", args: "<comprehensive prompt with all context>" })
```

**Step 2 - Pause:**
Present the plan summary to the user. Wait for approval ("go", `/build`, `/team-build`, or feedback).

**Step 3 - Execute (after user approval):**

For isolated sub-agent execution (default):

```
Skill({ skill: "build", args: ".claude/tasks/<plan-file>.md" })
```

For collaborative Agent Teams execution (when agents need peer-to-peer coordination):

```
Skill({ skill: "team-build", args: ".claude/tasks/<plan-file>.md" })
```

Use `/team-build` when the plan involves cross-domain integration where agents need to share contracts (schemas, API specs, interfaces) and coordinate in real-time. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

### Prompt Composition for Auto-Invocation

When composing the prompt for `/team-plan`, Central AI should include:

1. **User's verbatim request** - Always include the original words
2. **Clarifications gathered** - Any answers from `AskUserQuestion`
3. **Codebase context** - Relevant patterns, files, and architecture discovered
4. **Constraints and preferences** - User-expressed boundaries
5. **Orchestration guidance** (optional) - Hints for team composition or parallel/sequential structure

**Example auto-invocation:**

```
Skill({
  skill: "team-plan",
  args: "Add a conversation export endpoint to the FastAPI backend. User wants owner-scoped conversation metadata plus messages. Relevant files are services/backend/app/routers/ai.py, app/schemas.py, app/db/stores.py, services/backend/openapi.json, and tests/. Use backend-engineer for implementation, database-platform-engineer for DynamoDB access-pattern review, and quality-engineer for validation."
})
```

---

## Repo-Port Context Injection

When in a repo-port session (porting from an existing repository), every frontend agent deployment must include source UI/UX context automatically.

### Detection

A session is repo-port when:

- User referenced a GitHub URL as the source
- User said "port from", "rebuild", "based on", "inspired by" + repo reference
- The plan contains a "Source UI/UX Reference" section

### What to Inject

For every frontend-specialist or UI-building agent prompt, prepend:

1. The "Source UI/UX Reference" section from the plan (layouts, interactions, components)
2. Explicit instruction to read source component files before building
3. Reminder: match source UX patterns, not default DataTable/Sheet patterns

### Template Addition

When composing prompts for frontend agents in repo-port sessions, add after standard context:

```
SOURCE CONTEXT:
- Source Repo: [URL]
- Layout Patterns: [from plan's Source UI/UX Reference]
- Source Files to Read: [list from plan]
- CRITICAL: Read source files listed above before building. Match source layout patterns.
```

This supplements the standard invocation template with source-specific UX context that prevents agents from defaulting to generic patterns.

---

## Coordination Patterns

### Parallel Execution

Invoke multiple agents using multiple Task tool calls in **ONE message**.

| Pattern                 | Agents                               | Use Case                        |
| ----------------------- | ------------------------------------ | ------------------------------- |
| **Domain Parallel**     | frontend + backend + database        | Independent feature development |
| **Validation Parallel** | security + performance + quality     | Comprehensive validation        |
| **Debug Parallel**      | debugger-detective + deep-researcher | Complex issue investigation     |

**Use parallel dispatch when ALL conditions met:**

- 3+ unrelated issues or independent domains
- No shared state between tasks
- Clear boundaries with no file overlap

**Use serial dispatch when ANY condition present:**

- Interconnected failures (one fix may resolve others)
- Shared state or same files (risk of merge conflicts)
- Sequential dependencies (B depends on A completing)
- Unclear scope (need to understand before fixing)

**Parallel Agent Output Rule:**
When dispatching agents in parallel, instruct them to write their work to files (edits, creations) rather than returning lengthy responses in the terminal. All work is version controlled, so file-based output is preferred. This prevents context bloat from multiple agents returning verbose terminal output simultaneously.

### Specialist + Quality Engineer Validation

The high-reliability pattern: specialist agents build, quality-engineer validates. Use when incorrect output has high cost.

**Specialist agents serve as builders.** Use the appropriate specialist for the domain: `backend-engineer`, `database-platform-engineer`, `ci-release-engineer`, `docs-automation-specialist`, `debugger-detective`, `security-auditor`, `performance-optimizer`, `quality-engineer`, `code-simplifier`, `visual-explainer`, or `general-purpose` for cross-domain work. Out-of-stack frontend, mobile, growth, SEO, payment, Cloudflare, Postgres, or Drizzle work should start with `documentation-research` and explicit user scope before any specialist routing. Each specialist focuses on ONE task and reports completion via TaskUpdate.

**Quality engineer serves as validator.** When dispatched in validation mode, the quality-engineer inspects completed work without modifying files and produces a structured pass/fail report.

**Validation prompt template:**

```
"You are operating in VALIDATION MODE. Verify the completed work against acceptance criteria.

TASK TO VALIDATE: [task description and acceptance criteria]
SPECIALIST'S WORK: [files to inspect, expected changes]

WORKFLOW:
1. Read the task requirements and acceptance criteria
2. Inspect all files the specialist changed
3. Run validation commands (tests, type checks, compilation)
4. Report PASS or FAIL with specific evidence using the Validation Report format

CONSTRAINT: Do NOT modify any files. Inspect and report only. If issues are found, report them for the specialist to fix."
```

**Dependency pattern for specialist/validation chains:**

```
TaskCreate: "Build feature X"       -> Task #1 (assigned to specialist)
TaskCreate: "Validate feature X"    -> Task #2 (assigned to quality-engineer)
TaskUpdate: Task #2 addBlockedBy: ["1"]  // Validation waits for build

// Multiple specialists can run in parallel:
TaskCreate: "Build component A"     -> Task #1 (frontend-specialist)
TaskCreate: "Build component B"     -> Task #2 (backend-engineer)
TaskCreate: "Validate all"          -> Task #3 (quality-engineer), addBlockedBy: ["1", "2"]
```

### Resume Pattern

Store agent IDs to continue work with preserved context:

```
// First deployment
Task({ prompt: "Build X...", subagent_type: "general-purpose" })
// Returns: agentId "abc123"

// Later - resume with full prior context
Task({ prompt: "Now add tests...", resume: "abc123" })
```

Use **resume** when: continuing related work, agent needs prior context.
Use **fresh** when: unrelated task, clean slate preferred.

### Sequential Dependencies

| Chain                             | Reasoning                                   |
| --------------------------------- | ------------------------------------------- |
| Data model/storage → API → Client | Data structure must exist before interfaces |
| Core → Enhancement                | Foundation before optimization              |
| Build → Validate → Integrate      | Build, verify, then connect                 |
| Research → Planning → Execution   | Understand, plan, implement                 |

---

## Agent Routing Reference

| Domain                 | Agent                      | Handles                                                    |
| ---------------------- | -------------------------- | ---------------------------------------------------------- |
| **Frontend**           | frontend-specialist        | Future web UI, state, forms, responsive design             |
| **Backend**            | backend-engineer           | FastAPI, Lambda/API Gateway, Cognito/JWT, DynamoDB         |
| **Database**           | database-platform-engineer | DynamoDB PK/SK, GS1, ConversationStore/UserStore contracts |
| **CI/Release**         | ci-release-engineer        | GitHub Actions, uv, npm ci, Serverless deploy              |
| **Testing/Validation** | quality-engineer           | pytest, FastAPI TestClient, moto, quality gates            |
| **Security**           | security-auditor           | Cognito/JWT, IAM, CORS, authorization, secrets             |
| **Performance**        | performance-optimizer      | Lambda/API latency, DynamoDB, cold starts                  |
