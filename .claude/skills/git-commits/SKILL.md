---
name: git-commits
description: Git protocol for explicit commit, branch, push, and status requests. Use conventional commits, preserve unrelated work, validate before committing, and never run destructive git commands without permission.
---

# Git Protocol

Use this skill when the user asks for git work: status, staging, commit messages, commits, branches, pushes, merges, or release handoff.

Do not commit merely because implementation work is complete. Commit only when the user asks, or when a command/plan explicitly requires a commit and the user has approved that workflow.

## Commit Workflow

1. **Inspect status first.** Run `git status --short` and identify unrelated or user-owned changes.
2. **Review scope.** Use `git diff -- <path>` and `git diff --cached -- <path>` for files that will be staged.
3. **Validate.** Run the narrow project commands that match the changed files. Use existing evidence only if it is fresh and after the final edit.
4. **Stage intentionally.** Stage only files that belong to the requested change. Do not sweep in unrelated untracked files.
5. **Commit.** Use a conventional commit subject under 50 characters. Add a body with concise bullets for non-trivial changes.
6. **Report.** Give the commit hash, files included, and validation commands/outcomes.

## Message Format

Subject:

```text
<type>: <short imperative summary>
```

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`, `ci`.

Examples:

```text
feat: add conversation export
fix: preserve Cognito subject keys
docs: refresh Claude skill guidance
```

For a non-trivial commit body:

```text
feat: add conversation export

- Add owner-scoped export route and schemas
- Cover conversation/message pagination
- Regenerate OpenAPI and frontend client
```

## Multi-Commit Strategy

Use one commit for one logical change. Split commits when changes are independently reviewable, for example:

- backend behavior and tests
- generated API/client artifacts
- documentation-only updates
- infrastructure configuration

Do not split just to look busy; each commit should make sense alone.

## Safety Rules

Never do without explicit permission:

- `git push`
- `git push --force`
- `git reset --hard`
- `git clean -fd`
- `git checkout -- <path>`
- `git restore <path>` on files with user changes
- amend or rebase published commits
- modify git config

Always:

- preserve unrelated working-tree changes
- read files before staging if they contain mixed authorship
- use non-interactive git commands
- report validation commands exactly
- say when validation was skipped and why

## Branch Notes

This repo may be on `main` during local work. Do not create branches, push, or change branch strategy unless the user asks. If the user asks for a branch name, prefer lowercase kebab-case with a short purpose, such as `feature/conversation-export`.
