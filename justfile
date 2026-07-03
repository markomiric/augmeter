# ClaudeFast Command Runner
# Install just: brew install just / scoop install just / cargo install just
# Then run: just <command>

# Windows compatibility
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# Show available commands
default:
    @just --list
# ─── Launch Claude Code ───────────────────────

# Examples:
#   just cc
#   just cc team-plan
# Start Claude interactively (optionally with a slash command)
[unix]
cc *CMD:
    #!/usr/bin/env sh
    set -eu
    cmd='{{ CMD }}'
    if [ ! -t 0 ]; then
      printf 'Error: just cc launches interactive Claude and requires a TTY.\n' >&2
      printf 'Run it from a terminal, or use: just cc-run "prompt"\n' >&2
      exit 1
    fi
    if [ -z "$cmd" ]; then
      exec claude
    fi
    command_file=".claude/commands/$cmd.md"
    if [ -f "$command_file" ]; then
      exec claude --init "/$cmd"
    fi
    printf 'Error: %s not found\n\n' "$command_file" >&2
    printf 'Available commands:\n' >&2
    for file in .claude/commands/*.md; do
      [ -e "$file" ] || continue
      name=${file##*/}
      printf '  %s\n' "${name%.md}" >&2
    done
    exit 1

[windows]
cc *CMD:
    @if ([Console]::IsInputRedirected) { Write-Error "just cc launches interactive Claude and requires a TTY. Use: just cc-run ""prompt"""; exit 1 }; if ("{{ CMD }}" -eq "") { claude } elseif (Test-Path ".claude/commands/{{ CMD }}.md") { claude --init "/{{ CMD }}" } else { Write-Host "Error: .claude/commands/{{ CMD }}.md not found"; Write-Host ""; Write-Host "Available commands:"; Get-ChildItem ".claude/commands/*.md" | ForEach-Object { $_.BaseName }; exit 1 }

# Examples:
#   just cc-run "Summarize this repo"
# git diff | just cc-run "Review this diff"
# Run Claude non-interactively through print mode
[positional-arguments]
[unix]
cc-run *PROMPT:
    #!/usr/bin/env sh
    set -eu
    if [ "$#" -eq 0 ]; then
      printf 'Error: just cc-run requires a prompt.\n' >&2
      printf 'Examples:\n' >&2
      printf '  just cc-run "Summarize this repo"\n' >&2
      printf '  git diff | just cc-run "Review this diff"\n' >&2
      exit 1
    fi
    exec claude -p "$*"

[positional-arguments]
[windows]
cc-run *PROMPT:
    @$prompt = ($args -join " "); if ($prompt -eq "") { Write-Error "just cc-run requires a prompt."; exit 1 }; claude -p $prompt
# Examples:
#   just team
#   just team team-plan
# Start Claude interactively with Agent Teams enabled
[unix]
team *CMD:
    #!/usr/bin/env sh
    set -eu
    export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
    cmd='{{ CMD }}'
    if [ ! -t 0 ]; then
      printf 'Error: just team launches interactive Claude with Agent Teams and requires a TTY.\n' >&2
      printf 'Run it from a terminal, or use: just team-run "prompt"\n' >&2
      exit 1
    fi
    if [ -z "$cmd" ]; then
      exec claude
    fi
    command_file=".claude/commands/$cmd.md"
    if [ -f "$command_file" ]; then
      exec claude --init "/$cmd"
    fi
    printf 'Error: %s not found\n\n' "$command_file" >&2
    printf 'Available commands:\n' >&2
    for file in .claude/commands/*.md; do
      [ -e "$file" ] || continue
      name=${file##*/}
      printf '  %s\n' "${name%.md}" >&2
    done
    exit 1

[windows]
team *CMD:
    @$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"; if ([Console]::IsInputRedirected) { Write-Error "just team launches interactive Claude with Agent Teams and requires a TTY. Use: just team-run ""prompt"""; exit 1 }; if ("{{ CMD }}" -eq "") { claude } elseif (Test-Path ".claude/commands/{{ CMD }}.md") { claude --init "/{{ CMD }}" } else { Write-Host "Error: .claude/commands/{{ CMD }}.md not found"; exit 1 }

# Examples:
#   just team-run "Plan the next implementation step"
# git diff | just team-run "Review this diff"
# Run Claude non-interactively with Agent Teams enabled
[positional-arguments]
[unix]
team-run *PROMPT:
    #!/usr/bin/env sh
    set -eu
    export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
    if [ "$#" -eq 0 ]; then
      printf 'Error: just team-run requires a prompt.\n' >&2
      printf 'Examples:\n' >&2
      printf '  just team-run "Plan the next implementation step"\n' >&2
      printf '  git diff | just team-run "Review this diff"\n' >&2
      exit 1
    fi
    exec claude -p "$*"

[positional-arguments]
[windows]
team-run *PROMPT:
    @$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"; $prompt = ($args -join " "); if ($prompt -eq "") { Write-Error "just team-run requires a prompt."; exit 1 }; claude -p $prompt
# ─── Utilities ────────────────────────────────

# Check Claude MCP server health
[unix]
mcp-check:
    @claude mcp list

[windows]
mcp-check:
    @claude mcp list

# List available slash commands
[unix]
commands:
    #!/usr/bin/env sh
    set -eu
    printf 'Available commands:\n'
    for file in .claude/commands/*.md; do
      [ -e "$file" ] || continue
      name=${file##*/}
      printf '  %s\n' "${name%.md}"
    done

[windows]
commands:
    @Write-Host "Available commands:"; Get-ChildItem ".claude/commands/*.md" | ForEach-Object { Write-Host "  $($_.BaseName)" }
# ─── Quality gates ────────────────────────────
# Full local quality gate chain: format, lint, compile, unit tests with
# coverage thresholds, then extension-host integration tests.
#
# Usage:
#   just check      # run everything CI runs (minus audit/SBOM)
#   just test       # unit tests only
#   just audit      # npm audit (high+)

check:
    npm run format:check
    npm run lint
    npm run compile
    npm run test:cov
    npm run test:integration

# Run the unit test suite
test:
    npm run test

# Dependency vulnerability scan (matches the CI audit gate)
audit:
    npm audit --omit=dev --audit-level=high

# ─── Build & analysis ─────────────────────────

# Package the extension into a .vsix
package:
    npm run package

# Remove build output and packaged artifacts
clean:
    npm run clean

# Dead code, unused exports/deps, and duplication reports
analyze:
    npm run analyze:knip
    npm run analyze:jscpd
