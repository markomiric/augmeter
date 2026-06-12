---
name: agentic-builder
description: "Create and iteratively improve Claude Code skills, sub-agents, and slash commands. Use when users want to create a skill from scratch, build a new sub-agent, create a slash command, update or optimize an existing skill/agent/command, run evals to test a skill, benchmark skill performance, or optimize a skill's description for better triggering accuracy. Covers all three Claude Code primitives: skills (SKILL.md with eval loops), agents (sub-agent .md files with frontmatter), and commands (slash command .md files with arguments). Use this proactively whenever someone says make a skill, create an agent, build a sub-agent, make a command, create a slash command, turn this into a skill, or I want to automate X."
---

# Agentic Builder

Build skills, agents, and commands for Claude Code. Three modes, one entry point.

## Routing

Determine which mode the user needs, then read the corresponding file before proceeding.

### Skill Creation -> Read `skill-builder.md`

The user wants a **skill** when they say things like:

- "Create a skill for X"
- "Turn this workflow into a skill"
- "I want to capture this process"
- "Build a reusable capability for..."
- They need something with an eval/improvement loop
- They want bundled scripts, references, or templates
- The output is a `SKILL.md` + supporting folder structure

Skills are model-invoked capabilities. They trigger automatically based on their description when a user's request matches. Skills can bundle scripts, reference docs, examples, and assets.

### Agent Creation -> Read `agent-builder.md`

The user wants an **agent** when they say things like:

- "Create a sub-agent for X"
- "Build an agent that handles..."
- "I need a specialist for..."
- "Make a delegated agent"
- They want something Claude auto-delegates to
- They need a focused specialist with limited tools
- The output is a single `.md` file in `.claude/agents/`

Agents are specialized sub-processes. Claude delegates tasks to them based on their description. Each agent has its own system prompt, tool access, and model selection.

### Command / Slash Workflow Creation -> Read `command-builder.md`

The user wants a **command** when they say things like:

- "Create a slash command for X"
- "Make a /deploy command"
- "I want to type /X and have it do Y"
- "Build a repeatable workflow I can trigger"
- They need user input (arguments) each time
- They want validation hooks on the output
- The output is a `.md` file in `.claude/commands/`

Commands are user-invoked prompt templates. Claude Code also treats skills as slash-invocable workflows: a skill folder creates `/skill-name`, and a skill takes precedence if a command has the same name. Existing `.claude/commands/*.md` files still work, especially for legacy workflow prompts with `$ARGUMENTS` and hooks.

### Key Differences

| Aspect                | Skill                                            | Agent                                     | Command                                         |
| --------------------- | ------------------------------------------------ | ----------------------------------------- | ----------------------------------------------- |
| **File**              | `SKILL.md` in a folder                           | Single `.md` in `.claude/agents/`         | Single `.md` in `.claude/commands/`             |
| **Invocation**        | Model auto-detects; user can type `/skill-name`  | Model auto-delegates based on description | User types `/name`                              |
| **Variables**         | Usually none                                     | None                                      | `$ARGUMENTS`, `$1`, `$2`                        |
| **Tools**             | Inherits all (or restricted via `allowed-tools`) | Explicit tool list in frontmatter         | Can allow or disallow specific tools            |
| **Hooks**             | Plain skills no; plugin skills can bundle hooks  | No                                        | Yes (Stop, PreToolUse)                          |
| **Bundled resources** | Scripts, references, examples, assets            | None (self-contained)                     | None (self-contained)                           |
| **Context**           | Shares main conversation                         | Gets own isolated context window          | Runs in main conversation                       |
| **Best for**          | Domain knowledge, eval loops, complex workflows  | Focused delegation, parallel execution    | Repeatable workflows with user input, pipelines |

### When It's Unclear

If the user says something ambiguous like "automate X" or "help me with X every time":

- If the task needs bundled resources, scripts, or iterative improvement -> **skill**
- If the task is a focused specialist that Claude should delegate to -> **agent**
- If the task is a repeatable workflow the user triggers with input each time and no bundled resources -> **command**
- If the task is a repeatable workflow that benefits from references, scripts, examples, or automatic triggering -> **skill**
- If still unclear, ask: "Do you want this as a skill (auto-triggered capability), a sub-agent (delegated specialist), or a slash command (user-triggered workflow with arguments)?"

## Supporting Resources

These are shared across all three modes:

```
agentic-builder/
├── SKILL.md              # This file (router)
├── skill-builder.md      # Skill creation workflow
├── agent-builder.md      # Agent creation workflow
├── command-builder.md    # Command/slash command creation workflow
├── agents/               # Eval sub-agents (used by skill-builder)
│   ├── grader.md         # Evaluates assertions against outputs
│   ├── comparator.md     # Blind A/B comparison
│   └── analyzer.md       # Post-hoc analysis of why winner won
├── eval-viewer/          # HTML viewer for eval results
│   ├── generate_review.py
│   └── viewer.html
├── references/
│   └── schemas.md        # JSON schemas for evals, grading, benchmarks
├── scripts/              # Automation scripts for eval pipeline
│   ├── run_eval.py
│   ├── run_loop.py
│   ├── aggregate_benchmark.py
│   ├── generate_report.py
│   ├── improve_description.py
│   ├── package_skill.py
│   ├── quick_validate.py
│   └── utils.py
└── assets/
    └── eval_review.html  # Template for description optimization review
```
