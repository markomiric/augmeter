---
name: testing-advanced
description: Advanced testing guidance for this repo. Use for pytest, FastAPI TestClient, moto-backed DynamoDB tests, contract tests, flaky-test triage, mocks, fixtures, Ruff/Bandit gates, and validation strategy.
---

# Testing Advanced

Use when behavior changes or verification risk is non-trivial.

## Rules

- Test behavior and contracts, not implementation trivia.
- Prefer focused tests near the changed feature.
- Add integration tests when data/API contracts change.
- For FastAPI routes, test request/response behavior, dependency overrides, auth boundaries, and error status codes.
- For DynamoDB behavior, use existing moto/local fixtures and assert access patterns through `UserStore`, `ConversationStore`, and `BillingStore` (see the `moto-test-fixtures` skill for fixture scaffolding; billing-specific patterns in the `polar-billing` skill).
- Avoid mock-heavy tests that only prove mocks are wired together.
- For bug fixes, include a regression test that fails on the original symptom when practical.
- Cover the happy path thoroughly, then each error status once (401, 404, 422, ...). Do not re-test Pydantic/framework validation; trust the framework and test the behavior your code adds.
- Build test data with factory helpers (e.g. `make_token(sub=..., email=...)`, `Conversation.create(...)`, `Message.create(...)`) so a model change touches one place instead of every test.
- Assert observable outcomes on both sides: the return value/response AND the resulting store/table state, so a "succeeds but writes nothing" bug can't pass.
- Mock Bedrock through `get_bedrock_client` dependency overrides or the existing fake/test seams. Do not call real Bedrock from unit or PR tests.

## Anti-patterns

- Do not test private methods or assert internal calls/queries. Assert behavior, not implementation.
- Do not change tests during a pure refactor. If requirements are unchanged, the existing tests should still pass; rewriting them defeats their purpose.
- Do not mock your own store code or over-mock. Use the real moto-backed `ConversationStore`/`UserStore`; reserve mocks for true external boundaries such as Bedrock.
- Do not chase 100% coverage as a goal. Prioritize tests that would catch a real regression.

## Patterns to adopt when the need arises

These are not current repo conventions; reach for them only when a test actually needs them, and prefer the small code change over patching globals.

- **Providers for dynamic values.** The repo currently calls `models._utcnow()` and uses `uuid.uuid4()` when creating conversations/messages. When a test needs deterministic time/IDs, inject a provider seam rather than monkeypatching globals. Do it when needed, not preemptively.
- **Snapshot testing.** For large, stable response bodies, `syrupy` is the standard pytest snapshot plugin. It needs deterministic output (fixed time/ID providers) and a `syrupy` dev dependency. Use it for response/document shapes, not for scalar or business-logic assertions.
- **External HTTP integrations.** There are none today. When one is added, mock at the HTTP boundary with `respx` (httpx) or `responses`, use `create_autospec` for protocol mocks, and define custom exceptions (e.g. `ExternalAPIUnavailable`) instead of leaking library errors; log before raising.

## Frontend Testing

The frontend uses Vitest + Testing Library + MSW for component and hook tests.

- Test files live under `src/` as `*.test.tsx` alongside the code they test.
- MSW intercepts fetch at the network boundary using handlers in `src/test/msw/handlers.ts`. Tests exercise real hook/component logic without a running API.
- `src/test/setup.ts` wires jest-dom matchers and the MSW server lifecycle (start before all, reset after each, stop after all).
- `src/test/utils.tsx` provides shared render helpers with providers.
- Vitest config is in `services/frontend/vitest.config.ts`; it uses jsdom and the `@` alias matching `vite.config.ts`.
- Run from `services/frontend`: `npm run test` (single run) or `npm run test:watch` (watch mode).
- Exclude `src/lib/api/generated/` from test discovery; generated files are not tested directly.
- Use MSW to simulate RFC 9457 error responses when testing `ApiError` handling in components.

## Verification Matrix

- Backend behavior: `uv run pytest tests/` (must pass `--cov-fail-under=90`).
- Backend types: `uv run mypy app`.
- Formatting: `uv run ruff format . --check`.
- Linting: `uv run ruff check .`.
- Security scan: `uv run bandit -r . -c pyproject.toml`.
- Frontend component/hook tests: `npm run test` from `services/frontend`.
- Frontend types: `npm run typecheck` from `services/frontend`.
- Frontend lint: `npm run lint` from `services/frontend`.
- Full gate: `just check` from repo root.
- Deploy-impacting change: inspect `.github/workflows/backend.yml` and `services/backend/serverless.yml`; package/deploy only when explicitly requested.

Always report exact commands and outcomes.
