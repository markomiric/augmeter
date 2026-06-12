# ClaudeFast Hooks Guide

This guide documents the project hooks currently wired in `.claude/settings.json`.

## Active Hooks

| Hook                                              | Event                    | Purpose                                                                  |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ | ----------------------------------- |
| `SkillActivationHook/skill-activation-prompt.mjs` | `UserPromptSubmit`       | Recommends skills and agents from registry rules, skipping missing files |
| `FormatterHook/formatter.mjs`                     | `PostToolUse` for `Write | Edit`                                                                    | Formats supported files after edits |
| `ContextRecoveryHook/conv-backup.mjs`             | `PreCompact`             | Writes a recovery backup before compaction                               |
| `LibraryHook/library-sync.mjs`                    | `Stop`                   | Synchronizes library-managed files                                       |
| `Validators/validate-agentic-registry.mjs`        | `Stop`                   | Validates skill and agent registry consistency                           |
| `ContextRecoveryHook/statusline-monitor.mjs`      | `statusLine`             | Displays context and backup status                                       |

## Validators

| Validator                       | Purpose                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `validate-agentic-registry.mjs` | Ensures registered skills and agents exist and Skill permissions are present      |
| `validate-new-file.mjs`         | Ensures a command created a new file in a target directory                        |
| `validate-file-contains.mjs`    | Ensures a generated file includes required sections                               |
| `biome-validator.mjs`           | Optional JS/TS/JSON/CSS validation helper; only relevant where Biome is installed |

## Registry Validation

Run manually from the repo root:

```bash
node "$CLAUDE_PROJECT_DIR/.claude/hooks/Validators/validate-agentic-registry.mjs"
```

Expected success:

```json
{ "result": "continue", "message": "Agent and skill registries match filesystem entries." }
```

## Skill Activation Enforcement

`skill-activation-prompt.mjs` supports three rule enforcement values:

- `suggest`: print a recommendation and continue.
- `warn`: reserved for non-blocking warnings.
- `block`: print a required action to stderr and exit with code 2.

Rules should use `block` sparingly, only when skipping the skill or agent would likely produce invalid work.

## Maintenance Checklist

When adding a skill:

1. Create `.claude/skills/<name>/SKILL.md`.
2. Register it in `.claude/skills/skill-rules.json`.
3. Add `Skill(<name>)` to `.claude/settings.json`.
4. Run the registry validator.

When adding an agent:

1. Create `.claude/agents/<name>.md`.
2. Include `description`, `tools`, and `model` frontmatter.
3. Register it in `.claude/agents/agent-rules.json`.
4. Run the registry validator.
