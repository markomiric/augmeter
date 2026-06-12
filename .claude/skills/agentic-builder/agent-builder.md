# Agent Builder

Build Claude Code sub-agents -- specialized markdown files that Claude auto-delegates tasks to.

## What a Sub-Agent Is

A sub-agent is a `.md` file in `.claude/agents/` (project) or `~/.claude/agents/` (global). It has YAML frontmatter defining its identity and a markdown body that becomes its system prompt. When Claude encounters a task matching the agent's description, it spawns the agent as an isolated subprocess with its own context window, tools, and instructions.

Sub-agents are not skills. They don't share the main conversation's context. They get spawned, do their job, and return a result. This isolation is their strength -- they can run in parallel, they can't accidentally pollute the main conversation, and they can be given a restricted tool set for safety.

## When to Create an Agent vs a Skill

Create an **agent** when:

- The task is focused and delegatable ("review this code", "analyze these logs", "generate a test suite")
- You want Claude to auto-delegate without user intervention
- The task benefits from isolated context (no bleed from the main conversation)
- You need parallel execution (multiple agents running simultaneously)
- The specialist needs a restricted tool set

Create a **skill** instead when:

- The task needs bundled scripts, templates, or reference docs
- You want iterative improvement with eval loops
- The capability should enhance the main conversation (not run separately)
- The workflow is complex and multi-stage

## The Agent Creation Process

### Step 1: Understand the Intent

Ask or infer:

1. **What should this agent do?** Get a clear, specific purpose. "Review code" is too vague. "Review TypeScript code for performance anti-patterns, focusing on unnecessary re-renders, missing memoization, and N+1 query patterns" is useful.

2. **When should Claude delegate to it?** The description field drives automatic delegation. Think about the exact phrases and contexts where this agent should activate.

3. **What tools does it need?** Start minimal. A code reviewer needs `Read, Grep, Glob`. A fixer needs `Read, Edit, Bash`. A researcher needs `Read, WebFetch, Grep`. Only add tools the agent actually requires -- every extra tool is a potential distraction.

4. **What model?** Default to `sonnet` for most tasks. Use `opus` for deep reasoning, complex analysis, or tasks where quality matters more than speed. Use `haiku` for simple, fast tasks like formatting or basic extraction.

5. **Project or global?** Project agents (`.claude/agents/`) are team-shared and specific to a codebase. Global agents (`~/.claude/agents/`) are personal and available everywhere.

### Step 2: Draft the Agent File

The file format:

```markdown
---
name: <kebab-case-name>
description: <action-oriented description of when to use this agent>
tools: <Tool1>, <Tool2>, <Tool3>
model: sonnet
---

# Purpose

You are a <specific role definition>.

## Instructions

When invoked, follow these steps:

1. <First action>
2. <Second action>
3. <Third action>

## Gotchas

- <Edge case or common mistake to avoid>
- <Non-obvious behavior to watch for>

## Output Format

<What the agent should return when done>
```

### Step 3: Write Each Section Well

#### The Name

- Kebab-case, descriptive, concise: `code-reviewer`, `test-generator`, `log-analyzer`
- Avoid generic names like `helper` or `assistant`
- The name should hint at what the agent does even without reading the description

#### The Description

This is the most important field. Claude reads all agent descriptions to decide where to delegate. Write it like a job posting -- specific about what the agent handles and when to use it.

**Bad descriptions:**

- `"Helps with code"` -- too vague, will either never trigger or trigger for everything
- `"A useful agent for various tasks"` -- tells Claude nothing about when to delegate

**Good descriptions:**

- `"Reviews pull request diffs for security vulnerabilities, focusing on injection attacks, authentication bypasses, and sensitive data exposure. Use proactively when the user asks for a security review, code audit, or mentions OWASP."`
- `"Generates comprehensive test suites for TypeScript functions. Specialist for when the user asks to write tests, add test coverage, or mentions testing a specific module."`

Tips:

- Start with what the agent does, then when to use it
- Include trigger phrases: "Use when...", "Specialist for...", "Use proactively when..."
- Be specific enough that Claude can distinguish this agent from similar ones
- Lean slightly "pushy" -- Claude tends to under-delegate, so a slightly aggressive description helps

#### The Tools List

Available tools: `Bash`, `Read`, `Write`, `Edit`, `MultiEdit`, `WebFetch`, `Glob`, `Grep`, `LS`, `Task` (for spawning sub-sub-agents), and any MCP tools in the format `mcp__<server>__<tool>`.

If you omit the `tools` field entirely, the agent inherits all parent tools. This is fine for general-purpose agents but bad for specialists -- explicit tool lists prevent the agent from going off-script.

Common patterns:

| Agent Type          | Typical Tools                             |
| ------------------- | ----------------------------------------- |
| Read-only analyst   | `Read, Grep, Glob, LS`                    |
| Code reviewer       | `Read, Grep, Glob`                        |
| Code fixer          | `Read, Edit, MultiEdit, Bash, Grep, Glob` |
| Researcher          | `Read, WebFetch, Grep, Glob`              |
| Generator           | `Write, Read, Bash`                       |
| Full-access builder | (omit field -- inherit all)               |

#### The System Prompt (Body)

Write it like you're briefing a specialist on their first day. They're smart but they don't know your specific context.

**Structure that works:**

1. **Purpose** -- One paragraph defining who this agent is and what it does. Use "You are a..." framing.
2. **Instructions** -- Numbered steps the agent follows when invoked. Be specific about the sequence of actions.
3. **Gotchas** -- Edge cases, common mistakes, things that look right but aren't. This section prevents the agent from making the same mistakes you've already learned from.
4. **Output format** -- What the agent should return. A structured report? A list of findings? A modified file? Define it so the parent agent knows what to expect.

**Writing principles:**

- **Expert voice, not docs voice.** "Check the error array even on 200 responses -- the API lies" beats "It is recommended to verify the error array in API responses."
- **Explain the why.** "Use `--depth 1` for clones because full history adds 30s and the agent only needs HEAD" beats "Always use `--depth 1`."
- **Anti-patterns matter.** If there's a common way to do the task wrong, name it. "Don't grep for the function name and assume the first match is the definition -- it's usually an import."
- **Be opinionated.** The agent should have a clear approach, not weigh options. "Start with the test file, not the implementation -- if the tests don't tell you what the function should do, the tests are the problem" is better than "Consider starting with either the test file or the implementation."

#### The Color (Optional)

Pick from: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`. This colors the agent's icon in the UI. Not critical, but helps visual identification when multiple agents are running.

Suggested conventions:

- **Red**: destructive or security-focused agents
- **Green**: generators, builders
- **Blue**: analyzers, reviewers
- **Yellow**: warning/audit agents
- **Cyan**: research, exploration
- **Purple**: creative, content-focused

### Step 4: Place the File

```bash
# Project agent (shared with team via git)
write .claude/agents/<agent-name>.md

# Global agent (personal, available in all projects)
write ~/.claude/agents/<agent-name>.md
```

### Step 5: Validate

After creating the agent, do a quick sanity check:

1. **Description test**: Would you, as Claude, know when to delegate to this agent based on the description alone?
2. **Tools test**: Can the agent accomplish its task with only the listed tools? Is there a tool it doesn't need?
3. **Instruction test**: If you followed the instructions literally, would you produce the right output?
4. **Gotchas test**: What's the most likely way this agent fails? Is that covered?

If any check fails, revise before committing.

## Examples

### Minimal Agent (code reviewer)

```markdown
---
name: code-reviewer
description: Reviews code changes for bugs, style issues, and potential improvements. Use when the user asks for a code review, wants feedback on their changes, or mentions reviewing a PR.
tools: Read, Grep, Glob
model: sonnet
color: blue
---

# Purpose

You are a senior code reviewer. Your job is to find real issues -- bugs, security holes, performance problems, and maintainability concerns. Skip nitpicks about style unless they hurt readability.

## Instructions

1. Read the files or diff provided
2. Identify issues in priority order: bugs > security > performance > maintainability > style
3. For each issue, explain what's wrong and suggest a fix
4. If the code is solid, say so -- don't manufacture feedback

## Output Format

Return a structured review with issues grouped by severity.
```

### Research Agent (with web access)

```markdown
---
name: tech-researcher
description: Researches technologies, libraries, and best practices using web sources. Use when the user asks to evaluate a library, compare frameworks, or needs current documentation on a tool.
tools: Read, WebFetch, Grep, Glob
model: sonnet
color: cyan
---

# Purpose

You are a technology researcher who evaluates tools and practices by consulting primary sources -- official docs, GitHub repos, and authoritative blog posts.

## Instructions

1. Identify what needs to be researched
2. Fetch official documentation and recent release notes
3. Check GitHub for stars, recent activity, open issues
4. Synthesize findings into a recommendation with trade-offs
5. Cite your sources

## Gotchas

- Always check the "last updated" date on docs -- stale docs for active projects usually mean the docs lag behind the code
- Star count is vanity; check open issues and response time for health
- "Best practice" blog posts older than 12 months may describe outdated patterns
```

## Common Mistakes

1. **Overpowered tool lists** -- Giving every agent `Bash, Write, Edit` when it only needs `Read, Grep`. More tools means more ways to go off-script.

2. **Vague descriptions** -- Claude can't delegate effectively if the description is generic. Be specific about what triggers this agent.

3. **No output format** -- Without a defined output structure, the agent rambles or returns results in an unpredictable format the parent can't parse.

4. **Monster system prompts** -- Agents get their own context window, but that doesn't mean you should fill it. Keep the system prompt focused. If you need 500+ lines, it's probably a skill, not an agent.

5. **Missing gotchas** -- The whole point of a specialist is that it knows the pitfalls. An agent without gotchas is just a generic prompt with a name.

6. **Wrong model choice** -- Using `opus` for simple extraction wastes tokens and time. Using `haiku` for nuanced analysis produces garbage. Match the model to the cognitive demand.

## Updating Existing Agents

When asked to improve an existing agent:

1. Read the current agent file
2. Ask what's not working (or infer from conversation context)
3. Revise the specific section that needs improvement
4. Test by asking Claude to delegate a task to the agent
5. Iterate based on results

The most common fixes: tightening the description (too many false triggers or too few), adding gotchas (agent keeps making the same mistake), and restricting tools (agent doing things it shouldn't).
