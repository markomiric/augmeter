---
name: docs-automation
description: Documentation automation guidance for README updates, AGENTS/CLAUDE guidance, API references, generated docs, markdown link hygiene, doc drift checks, and docs tied to env vars, routes, bindings, or public contracts.
---

# Docs Automation

Use when code changes require documentation updates or when creating maintainable technical docs.

## Rules

- Use relative Markdown links in repo docs.
- Update docs when env vars, AWS resources, routes, public contracts, commands, or deployment flows change.
- Keep `AGENTS.md` concise and deterministic; deep runtime detail belongs in workspace docs.
- Do not document unrelated code "while here".
- Prefer generated or script-backed docs only when they reduce drift.
- Include verification commands for generated docs and link checks when available.

## Useful Targets

- Root onboarding: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- Agent-facing repo context: `.claude/rules/repo-primer.md`, `.claude/skills/`, `.claude/agents/`, `.claude/commands/`.
- Engineering standards: `docs/engineering-standards.md`, `docs/operations.md`, `docs/ai.md`, `docs/adr/`.
- Backend: `services/backend/README.md` if added, API docs, deployment notes.
- CI/deploy: `.github/workflows/backend.yml`, `services/backend/serverless.yml`, `services/backend/resources/`.
- Agentic framework: `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`.

## Handoff

Report:

- Docs changed.
- Code or config change they track.
- Link/generation checks run.
- Known stale docs left untouched and why.
