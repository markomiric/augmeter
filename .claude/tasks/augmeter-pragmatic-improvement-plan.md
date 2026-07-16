# Plan: Augmeter Pragmatic Improvement Plan

## Task Description

Audit the `augmeter` VS Code extension against current industry best practices and produce a focused, safe, step-by-step improvement plan covering code quality, structure, architecture, security, testing/DX, performance, dependencies, CI/CD, and docs. The project is pre-production, so behavior-preserving refactors and build/CI modernization are in scope.

**Honest baseline (measured during this audit, 2026-07-03):** the repo is already in strong shape. 210 unit tests pass; `knip` reports **zero** dead code/exports; **zero** TODO/FIXME/HACK markers; the only `any` usages (6) are the justified variadic signatures in `SecureLogger`; strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), zero runtime deps, Husky + lint-staged, SBOM, CodeQL, and coverage gates already exist. This plan therefore does **not** propose a rewrite. It is a short, high-signal list ordered by value/risk. The single real code-quality issue is duplication across the JSONL provider adapters; everything else is incremental DX/CI/build polish.

**Session Type**: Development (with an inline Review/audit discovery phase already completed; the flagship task is a behavior-preserving refactor, so refactoring-safety rules apply: characterize with tests, refactor, prove tests still pass).

## Objective

Ship a small set of behavior-preserving improvements that measurably reduce maintenance cost and close real gaps, without adding abstraction the codebase does not need:

1. Eliminate the ~250 lines of duplicated JSONL-scanning logic shared by the Claude/Codex adapters.
2. Land the already-written config numeric-coercion extraction (currently untracked) with a test.
3. Raise test coverage on the refactored code and nudge coverage gates toward measured reality.
4. Catch platform-specific regressions with a cross-platform CI matrix (the extension has per-OS path logic).
5. Optional modernization: esbuild bundling for faster activation / smaller `.vsix`.
6. Document the subprocess trust model and add dependency-update automation.

## Problem Statement

The codebase is healthy, but four concrete issues remain:

- **Duplication (maintainability):** `jscpd` finds the largest real clones between `claude-provider-adapter.ts` and `codex-provider-adapter.ts` (61L, 63L, 44L, 33L, 22L, plus several 12–18L blocks) — the JSONL incremental file-scan + timestamp-rollup engine is copy-pasted. A bug fix in one adapter must be hand-mirrored to the other. This is the one place the code will bite future work.
- **Uncommitted refactor:** `src/core/config/config-value-utils.ts` (`toRoundedNumber`) is already written and wired into all five config domain modules, but is untracked — an in-flight change that needs finishing (commit + a unit test).
- **CI blind spot (correctness):** the extension has OS-specific behavior — Copilot `state.vscdb` path resolution branches on `win32`/`darwin`/`linux` (`copilot-provider-adapter.ts:343-352`) and the Auggie CLI has Windows `.cmd`/`.bat` handling (`auggie-cli-source.ts:259`) — yet CI runs on `ubuntu-latest` only. Path bugs on macOS/Windows ship undetected.
- **Coverage headroom:** measured ~51.7% lines. `usage-tracker.ts` (39% lines / 32% functions) and `auth-commands.ts` (47%) carry the untested orchestration surface; the refactor is the natural moment to add characterization tests.

## Solution Approach

Do the refactor first, backed by tests, then layer in CI/build/docs. The provider adapters already share a home for helpers (`src/providers/local-file-utils.ts`) and a clean `ProviderAdapter` interface, so extraction is low-risk:

- Extract the shared JSONL incremental-scan + rollup engine (directory scan, per-file `getStats`, incremental `readChunk`/line-split, retention cutoff, timestamp rollup, result caching/projection) into one parameterized module. Each adapter injects only what differs: the per-line predicate + timestamp extractor (Claude keys on `"type":"user"`; Codex differs). Copilot stays on its own SQLite path but can reuse the shared rollup/projection helper (its 31L clone with Codex).
- Characterize before refactoring: the existing adapter unit tests (`claude`/`codex`/`copilot-provider-adapter.unit.test.ts`) are the baseline. Add tests for the extracted helper, run before and after, require identical behavior.
- Everything else (CI matrix, esbuild, dependabot, security doc) is additive and independently revertible.

Guardrails: zero new **runtime** dependencies (architectural rule); esbuild/dependabot are dev-only and optional; `tsc --noEmit` stays the type-check gate if esbuild lands (bundlers do not type-check).

## Relevant Files

Use these files to complete the task:

- `src/providers/adapters/claude-provider-adapter.ts` (335L) — source of the shared JSONL-scan engine to extract; keep only Claude-specific predicate/timestamp logic.
- `src/providers/adapters/codex-provider-adapter.ts` (337L) — near-duplicate of Claude's scan engine; migrate to the shared helper.
- `src/providers/adapters/copilot-provider-adapter.ts` (541L) — SQLite source (execFiles `sqlite3`); reuse shared rollup/projection only; primary subject of the security doc and the per-OS path tests.
- `src/providers/local-file-utils.ts` — existing shared-helper home; likely destination (or sibling `jsonl-session-scanner.ts`) for the extracted engine.
- `src/providers/provider-adapter.ts` — `ProviderAdapter` interface + result/context types; do not change the contract.
- `src/core/config/config-value-utils.ts` (untracked) — the `toRoundedNumber` helper to commit + test.
- `src/core/config/{alert,provider,smart-sign-in,status-bar}-config.ts` — already import the helper; no change, just verify after commit.
- `src/services/auggie-cli-source.ts` — second `execFile` site (Auggie CLI, Windows `.cmd` handling); subject of the security doc + Windows CI.
- `.github/workflows/ci.yml` — add the OS matrix + conditional xvfb.
- `vitest.config.ts` — coverage thresholds to nudge up after new tests land.
- `package.json` — build scripts (esbuild option), `.vscodeignore` interplay.
- `README.md` / `CHANGELOG.md` — security/trust-model note + changelog entry.

### New Files

- `src/providers/adapters/jsonl-session-scanner.ts` (or additions to `local-file-utils.ts`) — the extracted shared JSONL incremental-scan + rollup engine, parameterized by per-provider predicate + timestamp extractor.
- `src/unit/providers/jsonl-session-scanner.unit.test.ts` — direct unit tests for the extracted engine (incremental read across appended chunks, retention cutoff, malformed-line skip, trailing-fragment flush).
- `src/unit/config/config-value-utils.unit.test.ts` — tests for `toRoundedNumber` (finite → rounds, non-finite/NaN/string/undefined → fallback).
- `.github/dependabot.yml` — weekly `npm` (devDeps) + `github-actions` update PRs.
- `esbuild.js` (only if Task 5 / esbuild is approved) — Node-platform bundle config, `external: ['vscode']`, sourcemaps, `--minify` on package.
- `SECURITY.md` **or** a README "Security & trust model" section — subprocess trust model (`sqlite3`, `auggie`), SecretStorage usage, untrusted-workspace restrictions.

## Implementation Phases

### Phase 1: Foundation

Land the in-flight config extraction (commit + test) so the tree is clean, then write characterization tests that pin current adapter behavior. This establishes the green baseline the refactor must preserve.

### Phase 2: Core Implementation

Extract the shared JSONL-scan/rollup engine; migrate Claude and Codex adapters onto it; reuse the rollup/projection helper in Copilot. Add direct unit tests for the extracted engine. Prove the pre-existing adapter tests still pass unchanged.

### Phase 3: Integration & Polish

Cross-platform CI matrix, coverage-gate bump, optional esbuild bundling, dependabot, and the security/trust-model doc. Each is independent and individually revertible. Final validation gate.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members.
  - Your role is to direct, validate, and keep the team on track via the Task\* tools.
- Take note of the session id of each team member. This is how you'll reference them.

### Team Members

- Specialist
  - Name: `refactor-lead`
  - Role: Adapter de-duplication refactor + config-util commit (Phases 1–2 code)
  - Agent Type: general-purpose
  - Resume: true
  - Spawn Description: `general-purpose - augmeter provider-adapter dedup and config-util landing`
- Specialist
  - Name: `dx-eng`
  - Role: CI matrix, optional esbuild bundling, dependabot, coverage-gate bump (Phase 3 infra)
  - Agent Type: general-purpose
  - Resume: true
  - Spawn Description: `general-purpose - augmeter CI/build/deps modernization`
- Specialist
  - Name: `sec-review`
  - Role: Review the two `execFile` subprocess sites + secret handling; author the trust-model doc content
  - Agent Type: security-auditor
  - Resume: true
  - Spawn Description: `security-auditor - augmeter subprocess and secret trust-model review`
- Specialist
  - Name: `docs-eng`
  - Role: Security/trust-model doc, README section, CHANGELOG entry
  - Agent Type: docs-automation-specialist
  - Resume: true
  - Spawn Description: `docs-automation-specialist - augmeter security and changelog docs`
- Quality Engineer (Validator)
  - Name: `validator`
  - Role: Author characterization + new unit tests, run all quality gates, validate acceptance criteria (read-only review mode for validation)
  - Agent Type: quality-engineer
  - Resume: false

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Land config numeric-coercion extraction

- **Task ID**: `commit-config-util`
- **Depends On**: none
- **Assigned To**: refactor-lead
- **Agent Type**: general-purpose
- **Parallel**: true
- Verify `src/core/config/config-value-utils.ts` (`toRoundedNumber`) is imported and used by `alert-config.ts`, `provider-config.ts`, `smart-sign-in-config.ts`, `status-bar-config.ts` (it already is).
- Confirm no config module still carries a local copy of the round-with-fallback logic; if any does, replace it with the shared import.
- Do not change behavior; this is a completion + hygiene task.

### 2. Add config-value-utils unit test

- **Task ID**: `test-config-util`
- **Depends On**: `commit-config-util`
- **Assigned To**: validator
- **Agent Type**: quality-engineer
- **Parallel**: false
- Create `src/unit/config/config-value-utils.unit.test.ts`: finite number rounds; `NaN`/`Infinity`/string/`undefined`/`null`/object → fallback.
- Run `npm test`; confirm green.

### 3. Characterize current adapter behavior (baseline)

- **Task ID**: `characterize-adapters`
- **Depends On**: none
- **Assigned To**: validator
- **Agent Type**: quality-engineer
- **Parallel**: true
- Confirm existing `claude`/`codex`/`copilot-provider-adapter.unit.test.ts` cover: message/timestamp rollup, retention cutoff, incremental append reads. Add missing cases so the JSONL-scan behavior is pinned before extraction (incremental read across two appends, malformed/partial trailing line, empty dir, custom path override).
- Record the exact pre-refactor test output as the baseline in the task notes.

### 4. Extract shared JSONL-scan/rollup engine

- **Task ID**: `extract-scanner`
- **Depends On**: `characterize-adapters`
- **Assigned To**: refactor-lead
- **Agent Type**: general-purpose
- **Parallel**: false
- Create `src/providers/adapters/jsonl-session-scanner.ts` (or extend `local-file-utils.ts`) holding the shared engine: directory scan, `getStats`, incremental `readChunk` + line-split, trailing-fragment flush, retention cutoff, timestamp rollup, and result caching/projection.
- Parameterize by injected `linePredicate` + `extractTimestamp` (and any provider-specific window like Claude's 5-hour vs weekly buckets). Keep the `ProviderAdapter` interface unchanged.
- Migrate `claude-provider-adapter.ts` and `codex-provider-adapter.ts` to use it; each retains only its provider-specific predicate/extractor.
- Reuse the shared rollup/projection helper in `copilot-provider-adapter.ts` (its SQLite read path stays; only the post-read rollup/projection is shared).
- Run `npm run compile && npm test`; the baseline adapter tests from Task 3 must pass unchanged.

### 5. Unit-test the extracted engine

- **Task ID**: `test-scanner`
- **Depends On**: `extract-scanner`
- **Assigned To**: validator
- **Agent Type**: quality-engineer
- **Parallel**: false
- Create `src/unit/providers/jsonl-session-scanner.unit.test.ts` exercising the engine directly (incremental chunk reads, retention boundary, malformed-line skip, trailing fragment across chunk boundary).
- Re-run `jscpd` (`npm run analyze:jscpd`); confirm the large claude↔codex clones are gone and duplication % dropped.

### 6. Cross-platform CI matrix

- **Task ID**: `ci-matrix`
- **Depends On**: none
- **Assigned To**: dx-eng
- **Agent Type**: general-purpose
- **Parallel**: true
- Update `.github/workflows/ci.yml`: add `strategy.matrix.os: [ubuntu-latest, macos-latest, windows-latest]`, `runs-on: ${{ matrix.os }}`.
- Run unit tests + compile on all three OSes. Gate xvfb + integration tests to Linux only (`if: runner.os == 'Linux'`), matching MS guidance; run `npm test` directly on macOS/Windows.
- Keep `package`/`sbom`/artifact-upload steps on `ubuntu-latest` only (guard with `if: matrix.os == 'ubuntu-latest'`) to avoid triple-packaging.
- Verify the workflow parses (`actionlint` if available) and that per-OS path logic (Copilot `state.vscdb`, Auggie `.cmd`) is exercised by the unit suite.

### 7. Subprocess + secret trust-model review

- **Task ID**: `security-review`
- **Depends On**: none
- **Assigned To**: sec-review
- **Agent Type**: security-auditor
- **Parallel**: true
- Review both `execFile` sites (`copilot-provider-adapter.ts` → `sqlite3`; `auggie-cli-source.ts` → `auggie`): confirm arg-array invocation (no shell string), no untrusted interpolation into args, user-configurable binary paths are gated behind the existing untrusted-workspace restrictions and clearly warned.
- Confirm secrets flow only through `SecureSecretsManager`/SecretStorage and never reach logs (`SecureLogger` redaction).
- Produce a short findings note + the exact trust-model wording for docs-eng. Report only; do not modify code.

### 8. Security & trust-model documentation

- **Task ID**: `security-docs`
- **Depends On**: `security-review`
- **Assigned To**: docs-eng
- **Agent Type**: docs-automation-specialist
- **Parallel**: false
- Add a `SECURITY.md` or README "Security & trust model" section: subprocess trust model (`sqlite3`, `auggie`, custom-path warning), SecretStorage usage, untrusted-workspace config restrictions, zero-runtime-dep posture.
- Add a `CHANGELOG.md` entry for this improvement batch (adapter dedup, CI matrix, docs).

### 9. Dependency-update automation

- **Task ID**: `dependabot`
- **Depends On**: none
- **Assigned To**: dx-eng
- **Agent Type**: general-purpose
- **Parallel**: true
- Add `.github/dependabot.yml`: weekly `npm` (devDependencies) and `github-actions` update PRs, grouped, with a sane open-PR limit. (Runtime deps are zero, so scope is devDeps + actions.)

### 10. (Optional) esbuild bundling

- **Task ID**: `esbuild-bundle`
- **Depends On**: `extract-scanner`
- **Assigned To**: dx-eng
- **Agent Type**: general-purpose
- **Parallel**: false
- ONLY if the user approves this optional item (see Notes for the tradeoff). Add `esbuild.js` (Node platform, `external: ['vscode']`, `format: 'cjs'`, sourcemaps, `--minify` for package). Point `main` at the bundle; keep `tsc --noEmit` as the type-check gate; update `.vscodeignore` and the `compile`/`watch`/`vscode:prepublish` scripts.
- Verify `npm run package` produces a working `.vsix`; smoke-test activation in an Extension Development Host.

### 11. Raise coverage gates

- **Task ID**: `bump-coverage`
- **Depends On**: `test-scanner`, `test-config-util`, `characterize-adapters`
- **Assigned To**: validator
- **Agent Type**: quality-engineer
- **Parallel**: false
- Re-measure coverage (`npm run test:cov`). Nudge `vitest.config.ts` thresholds up to ~5 points below the new measured values (matching the existing gate policy). Update the dated comment in `vitest.config.ts`.

### 12. Final validation

- **Task ID**: `validate-all`
- **Depends On**: `commit-config-util`, `test-config-util`, `characterize-adapters`, `extract-scanner`, `test-scanner`, `ci-matrix`, `security-review`, `security-docs`, `dependabot`, `bump-coverage`
- **Assigned To**: validator
- **Agent Type**: quality-engineer
- **Parallel**: false
- Run the full local quality chain (`just check` or the individual gates below).
- Verify acceptance criteria met; confirm `jscpd` duplication dropped and no behavior changed.
- Operate in validation mode: inspect and report only, do not modify files.

## Quality Gates

Apply these gates during execution:

| Gate                | Validation                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- |
| **Implementation**  | `npm run compile` clean; `npm test` green after each code task                     |
| **Integration**     | `ProviderAdapter` contract unchanged; adapter baseline tests pass post-refactor    |
| **Quality**         | `jscpd` duplication reduced; coverage ≥ new gates; `knip` still zero dead code     |
| **User Acceptance** | User approves scope (esbuild opt-in); behavior preserved                           |
| **Verification**    | Evidence before claims — paste command output, do not assert green without running |

## Acceptance Criteria

- `config-value-utils.ts` committed and covered by a passing unit test; no config module carries a duplicate rounding helper.
- Claude and Codex adapters share one JSONL-scan/rollup engine; `jscpd` no longer reports the 40L+ claude↔codex clones; overall duplication % drops from ~4%.
- Extracted engine has direct unit tests; all pre-existing adapter tests pass unchanged (behavior preserved).
- CI runs unit tests on ubuntu + macOS + windows; integration/xvfb gated to Linux; packaging runs once.
- `knip` reports zero dead code; `npm run compile`, `npm run lint`, `npm run format:check` all clean.
- Security/trust-model doc exists; CHANGELOG updated; `.github/dependabot.yml` present.
- Coverage gates raised to ~5 points below new measured values.
- (If approved) esbuild bundle produces a working `.vsix` that activates cleanly.

## Validation Commands

Execute these commands to validate the task is complete:

- `npm run compile` — TypeScript builds without errors
- `npm run lint` — ESLint clean
- `npm run format:check` — Prettier clean
- `npm run test:cov` — unit tests pass and meet (raised) coverage gates
- `npm run analyze:knip` — zero dead code/exports
- `npm run analyze:jscpd` — duplication reduced vs baseline (~4% → lower); claude↔codex clones gone
- `npm run test:integration` — extension-host tests pass (Linux/xvfb)
- `npm run package` — produces a `.vsix` (and validates esbuild bundle if Task 10 done)
- `just check` — full local quality gate chain

## Notes

- **This is a healthy codebase.** The plan is deliberately short. Do not add abstraction the code does not need: the shared scanner exists to kill real duplication, not to introduce a plugin framework. Copilot's SQLite path is genuinely different — do not force it under the JSONL engine.
- **esbuild tradeoff (Task 10, optional):** MS-recommended for activation speed + smaller `.vsix`. But this extension is **not** web-compatible (uses `node:child_process`/`node:fs`), so the web-extension benefit does not apply — the win is a single-file load and a smaller package, against added build complexity (a new devDep + `esbuild.js` + `.vscodeignore` upkeep) and losing per-file source maps in stack traces unless configured. Recommend, but gate on user opt-in; the other 11 tasks stand alone without it.
- **Coverage reality:** `status-bar.ts` (0% unit) is a thin VS Code lifecycle wrapper — its logic lives in the well-tested pure `status-bar-logic.ts`; leave it to integration tests rather than chasing unit coverage there. Focus new tests on `usage-tracker.ts` orchestration and the extracted scanner.
- **Not workflow-worthy:** execution is a bounded set of ~12 mostly-independent tasks (0–1 workflow signals fire). Route to `/build` with parallel isolated sub-agents, not `/workflow-build`.
- **Explicitly out of scope (rejected as over-engineering):** splitting large files for size alone (`usage-tracker.ts`, `usage-dashboard.ts` are cohesive), adding runtime deps, introducing a DI container, or generalizing the adapter registry beyond current needs.
  </content>
  </invoke>
