# ClaudeFast Command Runner
# Install just: brew install just / scoop install just / cargo install just
# Then run: just <command>

# Windows compatibility
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# Local development settings (DynamoDB Local + table name)
backend_table := "supio-development-backend-application-table"
dynamodb_url := "http://localhost:9999"

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
# ─── Backend ──────────────────────────────────

# Run the backend test suite with concise, agent-friendly output
[unix]
test:
    @cd services/backend && uv run pytest tests/ -q -p no:warnings --tb=short

[windows]
test:
    @cd services/backend; uv run pytest tests/ -q -p no:warnings --tb=short

# ─── Quality gate ─────────────────────────────
# Run all backend quality gates + frontend build in one shot.
# Phase 3 will extend this recipe with frontend lint/test scripts
# (Biome, Vitest) once those tools are added to services/frontend.
#
# Usage:
#   just check          # run everything
#   just check-backend  # backend only
[unix]
check-backend:
    #!/usr/bin/env sh
    set -eu
    cd services/backend
    echo "==> uv sync"
    uv sync --frozen
    echo "==> pytest"
    uv run pytest tests/ -q -p no:warnings --tb=short
    echo "==> ruff format"
    uv run ruff format . --check
    echo "==> ruff lint"
    uv run ruff check .
    echo "==> mypy"
    uv run mypy app
    echo "==> bandit"
    uv run bandit -r . -c pyproject.toml

[windows]
check-backend:
    @cd services/backend; uv sync --frozen; uv run pytest tests/ -q -p no:warnings --tb=short; uv run ruff format . --check; uv run ruff check .; uv run mypy app; uv run bandit -r . -c pyproject.toml

[unix]
check-frontend:
    #!/usr/bin/env sh
    set -eu
    cd services/frontend
    echo "==> npm ci"
    npm ci
    echo "==> lint (biome)"
    npm run lint
    echo "==> typecheck (tsc)"
    npm run typecheck
    echo "==> test (vitest)"
    npm run test
    echo "==> build (vite + tsc)"
    npm run build

[windows]
check-frontend:
    @cd services/frontend; npm ci; npm run lint; npm run typecheck; npm run test; npm run build

[unix]
check: check-backend check-frontend

[windows]
check: check-backend check-frontend

# ─── Supply-chain audit (local, on-demand) ────
# Dependency vulnerability scanning. Intentionally NOT wired into CI so the
# starter default adds no scheduled jobs; run these before releasing a fork.
#
# Usage:
#   just audit            # backend + frontend
#   just audit-backend    # pip-audit against exported requirements
#   just audit-frontend   # npm audit (high+)
#   just sbom             # optional local CycloneDX SBOMs (gitignored)

# Audits the resolved runtime environment (project prod deps + pip-audit's own
# deps). We audit the env rather than `pip-audit -r <file>` on purpose: the
# requirements form makes pip-audit build an isolated venv via ensurepip, which
# is brittle across Python installs; the env form is portable.
[unix]
audit-backend:
    @cd services/backend && uv run --no-dev --with pip-audit pip-audit

[windows]
audit-backend:
    @cd services/backend; uv run --no-dev --with pip-audit pip-audit

[unix]
audit-frontend:
    @cd services/frontend && npm audit --audit-level=high

[windows]
audit-frontend:
    @cd services/frontend; npm audit --audit-level=high

[unix]
audit: audit-backend audit-frontend

[windows]
audit: audit-backend audit-frontend

# Optional: generate CycloneDX SBOMs locally into ./sbom/ (gitignored). Useful
# for a release artifact; not committed and not run in CI.
[unix]
sbom:
    #!/usr/bin/env sh
    set -eu
    mkdir -p sbom
    cd services/backend
    req="$(mktemp)"
    trap 'rm -f "$req"' EXIT
    uv export --frozen --no-dev --no-hashes -o "$req"
    uvx --from cyclonedx-bom cyclonedx-py requirements "$req" -o ../../sbom/backend.cdx.json
    cd ../frontend
    npx --yes @cyclonedx/cyclonedx-npm --output-file ../../sbom/frontend.cdx.json
    echo "Wrote sbom/backend.cdx.json and sbom/frontend.cdx.json"

[windows]
sbom:
    @New-Item -ItemType Directory -Force sbom | Out-Null; cd services/backend; uv export --frozen --no-dev --no-hashes -o requirements-sbom.txt; uvx --from cyclonedx-bom cyclonedx-py requirements requirements-sbom.txt -o ../../sbom/backend.cdx.json; Remove-Item -ErrorAction SilentlyContinue requirements-sbom.txt; cd ../frontend; npx --yes @cyclonedx/cyclonedx-npm --output-file ../../sbom/frontend.cdx.json

# ─── Release evidence ─────────────────────────
# Run the offline subset of the release evidence bundle (just check + audit +
# sbom + OpenAPI export drift gate) and write a Markdown stub for the
# release bundle at docs/release-evidence/<date>-supio-release.md.
# Deployed evidence (production CI run + smoke transcripts) is appended by the
# release engineer after running gh workflow run.
[unix]
release-evidence:
    #!/usr/bin/env sh
    set -eu
    out="docs/release-evidence/$(date -u +%Y-%m-%d)-supio-release-local.md"
    mkdir -p docs/release-evidence
    just check
    just audit
    just sbom
    cd services/backend
    uv run python scripts/export_openapi.py
    if ! git diff --exit-code -- openapi.json; then
      echo "openapi.json is stale; commit before producing release evidence" >&2
      exit 1
    fi
    cd ../..
    {
      echo "# supio Release Evidence (local subset)"
      echo
      echo "Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo
      echo "## Offline gates"
      echo "- \`just check\` passed (backend pytest + ruff + mypy + bandit; frontend lint + typecheck + vitest + build)"
      echo "- \`just audit\` passed (pip-audit + npm audit)"
      echo "- \`just sbom\` produced sbom/backend.cdx.json + sbom/frontend.cdx.json"
      echo "- OpenAPI export matches committed services/backend/openapi.json"
      echo
      echo "## Deployed evidence (to be filled by the release engineer)"
      echo "- gh run URL for backend.yml (production):"
      echo "- gh run URL for frontend.yml (production):"
      echo "- gh run URL for infrastructure.yml (production):"
      echo "- Live-auth + real-Bedrock smoke transcript:"
    } > "$out"
    echo "Wrote $out"

# ─── Local development ────────────────────────
# One-command local stack: DynamoDB Local + backend (uvicorn) + frontend (vite).
#
# Usage:
#   just dev        # boot everything; Ctrl-C stops backend + frontend
#   just seed       # just DynamoDB Local + create the table (idempotent)
#   just dev-down   # stop DynamoDB Local

# Boot DynamoDB Local and create the application table (idempotent).
[unix]
seed:
    #!/usr/bin/env sh
    set -eu
    cd services/backend
    docker compose up -d dynamodb-local
    # Wait for DynamoDB Local to accept connections before creating the table.
    for _ in $(seq 1 30); do
      nc -z 127.0.0.1 9999 >/dev/null 2>&1 && break
      sleep 1
    done
    # boto3 needs a region and credentials even for DynamoDB Local (it still
    # signs requests); DynamoDB Local ignores the values. Without these a fresh
    # machine with no ~/.aws config hits NoRegionError / NoCredentialsError.
    AWS_DEFAULT_REGION=eu-west-1 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
      TABLE_NAME={{ backend_table }} DYNAMODB_URL={{ dynamodb_url }} \
      uv run python create_dynamodb_locally.py
    echo "DynamoDB Local ready; table {{ backend_table }} present."

[windows]
seed:
    @cd services/backend; docker compose up -d dynamodb-local; Start-Sleep -Seconds 4; $env:AWS_DEFAULT_REGION="eu-west-1"; $env:AWS_ACCESS_KEY_ID="local"; $env:AWS_SECRET_ACCESS_KEY="local"; $env:TABLE_NAME="{{ backend_table }}"; $env:DYNAMODB_URL="{{ dynamodb_url }}"; uv run python create_dynamodb_locally.py

# Run the whole stack. Backend runs in the background and is stopped when the
# recipe exits; the frontend (vite) runs in the foreground.
[unix]
dev: seed
    #!/usr/bin/env sh
    set -eu
    ( cd services/backend \
        && AWS_DEFAULT_REGION=eu-west-1 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
           TABLE_NAME={{ backend_table }} DYNAMODB_URL={{ dynamodb_url }} \
           APP_ENVIRONMENT=development ALLOWED_ORIGINS='*' \
           uv run uvicorn app.main:app --reload --port 8000 ) &
    backend_pid=$!
    trap 'kill "$backend_pid" 2>/dev/null || true' EXIT INT TERM
    cd services/frontend && VITE_API_BASE_URL=http://localhost:8000 npm run dev

[windows]
dev: seed
    @Start-Process powershell -ArgumentList '-NoExit','-Command',"cd services/backend; $env:AWS_DEFAULT_REGION='eu-west-1'; $env:AWS_ACCESS_KEY_ID='local'; $env:AWS_SECRET_ACCESS_KEY='local'; $env:TABLE_NAME='{{ backend_table }}'; $env:DYNAMODB_URL='{{ dynamodb_url }}'; $env:APP_ENVIRONMENT='development'; $env:ALLOWED_ORIGINS='*'; uv run uvicorn app.main:app --reload --port 8000"; cd services/frontend; $env:VITE_API_BASE_URL='http://localhost:8000'; npm run dev

# Stop DynamoDB Local.
[unix]
dev-down:
    @cd services/backend && docker compose down

[windows]
dev-down:
    @cd services/backend; docker compose down
