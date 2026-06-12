# ClaudeFast Hooks Guide

ClaudeFast uses project hooks to keep the workflow skill-first and registry-safe.

## Active Hooks

- `UserPromptSubmit`: runs `SkillActivationHook/skill-activation-prompt.mjs`.
- `Stop`: runs `LibraryHook/library-sync.mjs` and `Validators/validate-agentic-registry.mjs`.
- `PostToolUse`: runs `FormatterHook/formatter.mjs` after `Write` or `Edit`.
- `PreCompact`: runs `ContextRecoveryHook/conv-backup.mjs`.
- `statusLine`: runs `ContextRecoveryHook/statusline-monitor.mjs`.

See `.claude/settings.json` for the exact hook wiring.

## Skill Activation Hook

The prompt-submit hook reads:

- `.claude/skills/skill-rules.json`
- `.claude/agents/agent-rules.json`
- `.claude/skills/*/SKILL.md`
- `.claude/agents/*.md`

It recommends only skills and agents that are present on disk. This prevents stale registry entries from triggering missing resources.

## Matching

The hook supports:

- Keyword matching: case-insensitive substring checks.
- Intent matching: regex patterns for flexible phrasing.
- Session de-duplication: recommendations already shown in the same session are suppressed.
- Priority grouping: `critical`, `high`, `medium`, `low`.

## Enforcement

Each rule can set `enforcement`:

- `suggest`: print a recommendation and continue.
- `warn`: reserved for non-blocking warnings.
- `block`: print required skills or agents to stderr and exit with code 2.

Most current repo rules use `suggest`. Use `block` only for hard guardrails where continuing without the skill or agent would likely produce invalid work.

## Registry Validation

`validate-agentic-registry.mjs` runs on Stop and verifies:

- Every skill in `skill-rules.json` has `.claude/skills/<name>/SKILL.md`.
- Every skill folder has a registry entry.
- Every registered skill has `Skill(<name>)` permission in `.claude/settings.json`.
- Every agent in `agent-rules.json` has `.claude/agents/<name>.md`.
- Every agent file has a registry entry.

Run manually:

```bash
node "$CLAUDE_PROJECT_DIR/.claude/hooks/Validators/validate-agentic-registry.mjs"
```

Expected success:

```json
{ "result": "continue", "message": "Agent and skill registries match filesystem entries." }
```

## Adding A Skill

1. Create `.claude/skills/<name>/SKILL.md`.
2. Add a matching entry to `.claude/skills/skill-rules.json`.
3. Add `Skill(<name>)` to `.claude/settings.json`.
4. Run the registry validator.

## Adding An Agent

1. Create `.claude/agents/<name>.md`.
2. Include explicit `description`, `tools`, and `model` frontmatter.
3. Add a matching entry to `.claude/agents/agent-rules.json`.
4. Run the registry validator.
