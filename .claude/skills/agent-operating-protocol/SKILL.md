---
name: agent-operating-protocol
description: Shared operating contract for Claude agents in this repo. Use before agent execution, prompt maintenance, team orchestration, or validation work to apply Think Hard, Skill-First, scoped tool use, handoff, and evidence-before-completion rules without duplicating boilerplate in every agent.
---

# Agent Operating Protocol

Use this skill as the shared preamble for `.claude/agents/*`.

## Think Hard

Apply deeper analysis when the task affects architecture, data contracts, security, production behavior, or multiple agents.

Use this sequence:

1. Identify the user goal and success criteria.
2. Read the nearest repo guidance before edits.
3. Map affected files and ownership boundaries.
4. Choose the smallest maintainable change.
5. Verify with fresh command output before any completion claim.

## Skill-First

Before execution tools, check and load the relevant domain skills:

- Workflow or multi-agent work: `session-management`, `sub-agent-invocation`.
- Current backend: `fastapi-aws`.
- Infrastructure/deploy: `infra-ops`.
- Data access: `fastapi-aws` for DynamoDB, `ConversationStore`, and `UserStore`.
- Out-of-stack frontend, mobile, Cloudflare, Postgres, payment, analytics, or growth work: use `documentation-research` first and do not assume a local specialized skill exists.
- Tests and verification: `testing-advanced`, `session-management`.
- Docs: `docs-automation`, `documentation-research`.

Load only skills that directly affect the task. Prefer progressive disclosure: read `SKILL.md` first, then referenced files only when needed.

## Tool Discipline

- Prefer read-only tools for investigation agents.
- Give edit-capable agents explicit file ownership.
- Do not parallelize agents that modify the same files.
- Use MCP tools only when their server is the authoritative source for the task.
- Treat tool outputs as evidence, not assumptions.

## Model Assignment

- Use Opus for high-judgment orchestration, root-cause debugging, security review, and strategic growth/content work.
- Use Sonnet for focused implementation, CI, data-platform, quality, performance, docs, visualization, and platform specialists.
- Override upward only when the task is unusually critical, ambiguous, or failure-prone.

## Handoff Contract

Every agent handoff should include:

- Files changed or inspected.
- Contracts produced or consumed.
- Assumptions and open risks.
- Verification commands and outcomes.
- Clear next owner when follow-up work remains.

## Completion Gate

Do not claim success until verification was run after the final edit. If verification is skipped, say exactly why.
