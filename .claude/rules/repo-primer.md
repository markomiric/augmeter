# Repo Primer: supio

Last compacted: 2026-06-10

## Purpose

`supio` is a SaaS application (FastAPI backend + Vite/React frontend) deployed at `www.supio.app`. The product surface is AI chat, multi-turn conversation history, agentic tool use, RAG through Amazon Bedrock, and Polar subscription billing.

Keep this file as a compact orientation memory. Put detailed procedures in `README.md`, `ARCHITECTURE.md`, `docs/engineering-standards.md`, `docs/operations.md`, `docs/ai.md`, `docs/runbooks/`, `docs/adr/`, or the relevant `.claude/skills/*/SKILL.md`.

## Repo Shape

- Backend: `services/backend`
  - FastAPI via Mangum on Lambda/API Gateway.
  - Cognito API Gateway authorizer in deploys.
  - DynamoDB single-table persistence.
  - Bedrock chat/RAG/agent integration.
  - Polar billing (signed webhook + checkout).
- Frontend: `services/frontend`
  - React 19, Vite, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind v4.
  - Amplify UI `<Authenticator>` for Cognito SRP auth.
  - Generated `@hey-api` client from backend `openapi.json`.
- Global edge: `infrastructure/application-edge.yml`
  - CloudFront serves the SPA from private S3 and proxies `/api/*` to API Gateway.
  - Production API calls should be same-origin relative paths.
- Agent/dev assets: `.claude/`, `CLAUDE.md`, `justfile`, PDFs. These are not production runtime code.

## Runtime Surface

Backend routers live in `services/backend/app/routers/` and are wired in `services/backend/app/main.py`.

Public routes:

- `GET /api/v1/health`: unauthenticated health check, returns `{"message":"OK"}`.
- `POST /api/v1/billing/webhook`: unauthenticated Polar webhook. Signature validation via `polar-sdk` `validate_event`, webhook-id idempotency through `BillingStore`, subscription events mapped onto the user profile. Returns 503 until the SSM webhook secret exists.

Authenticated user/admin routes:

- `GET /api/v1/users/me`: caller profile including subscription state.
- `POST /api/v1/billing/checkout`: creates a Polar checkout session tagged with the caller's Cognito `sub` as `external_customer_id`; client-supplied `success_url` is origin-pinned to `ALLOWED_ORIGINS`. 503 until Polar token + product are configured.
- `GET /api/v1/admin/users`: ADMIN only user roster.
- `PATCH /api/v1/admin/users/{user_id}/role`: ADMIN only role changes; rejects self-role-change.
- `GET /api/v1/admin/users/{user_id}/conversations`: ADMIN only conversation listing for a selected user.

AI routes under `/api/v1/ai`:

- `POST /chat`: Bedrock Converse chat, persists user and assistant messages.
- `GET /conversations`: owner-scoped conversation list, most-recently-active first.
- `GET /conversations/{id}/messages`: owner-scoped message history.
- `POST /agent`: Converse tool-use loop with a `search_knowledge_base` tool. Paid: requires an active subscription (402 otherwise; ADMIN bypasses) via `require_active_subscription`.
- `POST /rag`: Bedrock Knowledge Base `retrieve_and_generate`. Paid: same subscription gate as `/agent`.

AI errors map through global handlers in `app/main.py`: not configured -> 503, throttled -> 429, provider/service failure -> 502. No response streaming is implemented because the current Lambda/API Gateway REST + Mangum transport is not streaming-oriented.

Frontend routes live in `services/frontend/src/routes/`:

- `index.tsx`: redirects to `/chat`.
- `chat.tsx`: chat, RAG, and agent UI (wrapped in `AuthGate`).
- `billing.tsx`: subscription status + Polar checkout (wrapped in `AuthGate`).
- `admin.tsx`: user, role, and conversation administration (wrapped in `AuthGate`).
- `__root.tsx`: app shell.

Auth UI is isolated in `services/frontend/src/components/auth/` (`auth-gate.tsx` holds the aws-amplify-core auth context; the Amplify `<Authenticator>` lives in `login-panel.tsx`, lazy-loaded so its bundle/CSS load only for signed-out visitors). API token attachment and RFC 9457 error parsing live in `services/frontend/src/lib/api.ts` (status-discriminated `ApiError`). AI hooks live in `src/hooks/use-ai.ts`; subscription state in `src/hooks/use-subscription.ts`.

## Core Files

- Backend app wiring: `services/backend/app/main.py`
- Backend dependencies/auth: `services/backend/app/dependencies.py`
- Backend schemas/models: `services/backend/app/schemas.py`, `services/backend/app/models.py`
- Backend stores: `services/backend/app/db/stores.py` (`UserStore`, `ConversationStore`, `BillingStore`)
- Backend secret resolution: `services/backend/app/secrets.py` (runtime SSM with env override)
- Backend routers: `services/backend/app/routers/` (`health`, `users`, `admin`, `ai`, `billing`)
- Bedrock code: `services/backend/app/ai/`
- Backend config: `services/backend/app/config.py`
- Backend tests: `services/backend/tests/` (package; `conftest.py` holds shared fixtures)
- OpenAPI export: `services/backend/scripts/export_openapi.py`
- KB ingestion: `services/backend/scripts/ingest_knowledge_base.py`
- Backend deploy: `services/backend/serverless.yml`, `services/backend/resources/`
- Deploy IAM policy (review artifact): `services/backend/iam/deploy-policy.json`
- Frontend bootstrap: `services/frontend/src/main.tsx`
- Frontend routes: `services/frontend/src/routes/`
- Frontend API wrapper: `services/frontend/src/lib/api.ts`
- Frontend generated client: `services/frontend/src/lib/api/generated/`
- Frontend tests/MSW: `services/frontend/src/test/`
- Frontend deploy: `services/frontend/serverless.yml`
- Edge/domain: `infrastructure/application-edge.yml`, `.github/workflows/infrastructure.yml`
- Workflows: `.github/workflows/backend.yml`, `frontend.yml`, `frontend-e2e.yml`, `security.yml`, `destroy.yml`
- Runbooks: `docs/runbooks/production-release.md`, `incident-response.md`, `key-rotation.md`
- Release evidence: `docs/release-evidence/`
- Docs: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/`

## Local Commands

From repo root:

```bash
just dev
just seed
just dev-down
just check
just check-backend
just check-frontend
just audit
just sbom
just release-evidence
```

Backend commands from `services/backend`:

```bash
uv sync --frozen
uv run uvicorn app.main:app --reload
uv run pytest tests/
uv run pytest tests/ --cov=app --cov-report=xml
uv run ruff format . --check
uv run ruff check .
uv run mypy app
uv run bandit -r . -c pyproject.toml
uv run python scripts/export_openapi.py
cd services/backend && uvx pre-commit run --all-files
```

Frontend commands from `services/frontend`:

```bash
npm ci
npm run dev
npm run build
npm run lint
npm run format
npm run typecheck
npm run test
npm run generate:api
npm run e2e
```

Local DynamoDB:

```bash
docker compose up -d dynamodb-local
TABLE_NAME=supio-development-backend-application-table DYNAMODB_URL=http://localhost:9999 uv run python create_dynamodb_locally.py
```

`services/backend/package.json` exists only to pin the Serverless Framework CLI for deploys; run backend tests with `uv run pytest tests/`, not npm.

## Data And Resource Contracts

- DynamoDB table: `supio-${stage}-backend-application-table` (deploy stage `production`; local/dev uses `development`).
- Single-table keys:
  - User profile: `PK=USER#<sub>`, `SK=PROFILE` (includes `subscription_status`, `subscription_plan`, `polar_customer_id`, `subscription_updated_at`).
  - Conversation header: `PK=USER#<sub>`, `SK=CONVMETA#<conversation_id>`.
  - Conversation message: `PK=USER#<sub>`, `SK=CONVMSG#<conversation_id>#<created_at_iso>#<message_id>`.
  - Webhook idempotency: `PK=WEBHOOK#polar`, `SK=ID#<webhook_id>`, `ttl` (unix seconds, 30 days). The table's TTL attribute is `ttl`; only these items set it.
  - User roster index: `GS1PK=USER`, `GS1SK=<created_at_iso>`.
  - Conversation recency index: `GS1PK=USER#<sub>#CONV`, `GS1SK=<updated_at_iso>`.
- Use Cognito `sub` as the immutable owner key. Never key data by `email` or `cognito:username`.
- App roles are stored in DynamoDB as `MEMBER`/`ADMIN`; do not use Cognito groups for app authorization.
- Subscription status enum: `none`/`active`/`past_due`/`canceled` (`SubscriptionStatus` in `app/models.py`). Polar payload status is authoritative; event-name mapping is the fallback.
- Physical resource names and CloudFormation logical IDs are deploy contracts. Do not rename them without an explicit migration plan.
- Cognito User Pool has `DeletionPolicy: Retain` (losing the pool orphans every `USER#<sub>` row). DynamoDB deletion protection is active only when stage is `production`.
- Frontend buckets are private and served through CloudFront OAC.
- CloudFront must keep API errors intact; avoid distribution-wide SPA fallback rules that rewrite `/api/*`.
- Backend API errors should be RFC 9457 `application/problem+json` from global exception handlers.
- List endpoints use optional `limit` and opaque `cursor`; stores return `Page[T]`.

## Environment Rules

- `APP_ENVIRONMENT`: defaults to `development`; the deploy stage sets it. Deliberately NOT at workflow scope in `backend.yml` (the test job imports `app.main`, which requires `ALLOWED_ORIGINS` outside development).
- `TABLE_NAME`: required. Serverless, `just dev`, tests, and OpenAPI export set it explicitly.
- `DYNAMODB_URL`: optional local DynamoDB endpoint.
- `ALLOWED_ORIGINS`: comma-separated origins. Development can default to wildcard; non-development missing value fails fast. Also pins client-supplied checkout `success_url`.
- `VITE_*`: frontend config validated in `services/frontend/src/lib/env.ts`. Production builds REQUIRE `VITE_USER_POOL_ID`/`VITE_USER_POOL_CLIENT_ID` (hard error otherwise); CI injects them from backend CloudFormation exports; the Playwright harness supplies documented dummies.
- `VITE_API_BASE_URL`: leave unset for deployed builds so API calls are same-origin through CloudFront; set to `http://localhost:8000` for local backend.
- `POLAR_WEBHOOK_SECRET` / `POLAR_ACCESS_TOKEN`: direct env overrides for local dev/tests. Never commit them.
- `POLAR_WEBHOOK_SECRET_PARAM` / `POLAR_ACCESS_TOKEN_PARAM`: SSM SecureString parameter NAMES, resolved at runtime by `app/secrets.py`. A missing parameter resolves to `None` (graceful 503), other SSM errors propagate.
- `POLAR_PRODUCT_ID` / `POLAR_CHECKOUT_SUCCESS_URL`: non-secret checkout config (repo variables in CI).
- `BEDROCK_MODEL_ID`: Converse model id; default is the EU Claude Haiku 4.5 inference profile. Empty value makes chat/agent return 503. Changing it requires updating the IAM resource ARNs AND the Bedrock alarm `ModelId` dimensions in lockstep.
- `BEDROCK_REGION`: optional Bedrock region override.
- `KNOWLEDGE_BASE_ID`: Bedrock Knowledge Base id. Injected from `resources/bedrock.yml` in deploys; unset makes RAG return 503.
- `BEDROCK_FAKE`: test-only E2E seam, double-gated against production. Never set in production.
- `ALARM_NOTIFICATION_EMAIL` / `BUDGET_NOTIFICATION_EMAIL` / `BUDGET_LIMIT_USD` / `API_LATENCY_P95_MS_THRESHOLD`: observability/cost wiring passed from CI repo variables into `resources/monitoring.yml`.
- `E2E_COGNITO_USERNAME` / `E2E_COGNITO_PASSWORD` (secrets) + `E2E_COGNITO_CLIENT_ID` (variable): enable the deployed live-auth + real-Bedrock smoke; the step skips when unset.
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: GitHub Actions deploy credentials. Rotate per `docs/runbooks/key-rotation.md`.
- Do not commit secrets or new local `.env` files. `.env.example` files are tracked intentionally.

## Development Conventions

- Keep changes small and reversible.
- Backend follows FastAPI "Bigger Applications" style: `app/main.py`, `app/routers/`, `app/dependencies.py`, `app/models.py`, `app/schemas.py`, `app/config.py`, `app/db/stores.py`.
- Add a router module under `app/routers/` for new backend domains.
- Keep persistence behind `UserStore`, `ConversationStore`, and `BillingStore`.
- Preserve owner isolation for all conversation reads/writes.
- Add or update pytest coverage in `services/backend/tests/` for backend behavior changes.
- Use uv for backend dependencies. Do not hand-edit `uv.lock`.
- Use npm for frontend work and Serverless tooling.
- Backend validation uses Ruff, mypy, Bandit, pytest, and coverage.
- Frontend validation uses Biome, TypeScript, Vitest/MSW, Playwright, and Vite build.
- Frontend UI changes should follow existing React + shadcn/ui patterns.
- Add shadcn primitives under `services/frontend/src/components/ui/`.
- Keep Amplify auth isolated in `components/auth/`; authenticated pages wrap their content in `<AuthGate>`.
- Generated API client is committed. After backend route/schema changes, run backend OpenAPI export and frontend client generation and commit both.
- Never log tokens, Authorization headers, raw JWT claims, webhook secrets, or AWS credentials.
- Avoid `AdminGetUser` in hot paths; it can mark Cognito users as monthly active users. Prefer app-owned user state and cached/list APIs.

## CI And Deploy

All deploy jobs target stage `production` and run under the `production` GitHub Environment (protection rules documented in `docs/runbooks/production-release.md`).

- `backend.yml`: tests (≥90% coverage), Ruff/mypy/Bandit, pip-audit (hard gate) + SBOM artifact, deploy, `/health` + 401 smoke, then a live-auth + real-Bedrock smoke (Cognito USER*PASSWORD_AUTH via a CI-only app client; gated on the `E2E_COGNITO*\*` secrets being present).
- `frontend.yml`: `check` job (lint, test, build, npm audit hard gate, SBOM) gates the deploy; then generated-client drift check, E2E-seam bundle guard, deploy, S3 sync, and CloudFront smoke that HARD-FAILS if the edge stack export is missing.
- `frontend-e2e.yml`: local full-stack Playwright with DynamoDB Local; no AWS secrets.
- `infrastructure.yml`: manual global edge stack deploy; requires the `APP_DOMAIN` repo variable (no fallback).
- `security.yml`: gitleaks.
- `destroy.yml`: manual teardown (Cognito pool and retained resources survive by policy).

Deploy credentials are long-lived keys in GitHub Actions secrets (risk-accepted; rotation in `docs/runbooks/key-rotation.md`; scoped policy in `services/backend/iam/deploy-policy.json`). Release procedure lives in `docs/runbooks/production-release.md`.

## Gotchas

- `allow_origins` is computed when `app/main.py` imports — and that import fails outside development without `ALLOWED_ORIGINS` (this is why `backend.yml` keeps `APP_ENVIRONMENT` out of workflow scope).
- API Gateway/Cognito returns `401 {"message":"Unauthorized"}` before FastAPI for protected deployed routes; this does not use RFC 9457.
- Polar SDK payload models expose the event discriminator as the `TYPE` field (serialization alias `"type"`); `getattr(event, "type")` returns nothing on real events. Use `_event_type()` in `app/routers/billing.py`.
- Webhook idempotency markers are written only AFTER successful processing, so a 5xx leaves no marker and Polar's retry is reprocessed (see the `polar-billing` skill).
- `subscription.updated` is Polar's documented catch-all event: derive status from `event.data.status`, not the event name.
- In this user pool, `cognito:username` is an opaque UUID/sub-like value, not a human-readable email.
- Changing key prefixes, index names, `UserRole` values, `SK=PROFILE`, logical IDs, or physical names can hide or replace deployed data.
- `serverless.yml` excludes tests, lockfiles, node modules, caches, and generated requirements from the Lambda package.
- Root `.claude/tasks/` files may be old planning artifacts. Do not treat them as current product requirements unless the user references them.
- `.codex/environments/environment.toml` is autogenerated.
- `POST /api/v1/billing/webhook` returning 503 is expected until the SSM webhook-secret parameter exists.
- AWS/Bedrock alarms require the `ModelId` dimension; without it they never fire. The dimension default in `resources/monitoring.yml` must track `BEDROCK_MODEL_ID`.
- `BodySizeLimitMiddleware` is defense in depth; API Gateway and Lambda have their own payload limits.
- CloudFront deep-link SPA routing is handled by a viewer-request function on the S3 behavior only.
- The global edge stack is manual and depends on us-east-1 ACM plus registrar nameservers pointing at Route 53.
- Dependabot PRs validate but do not deploy; merging to `main` triggers normal deploys.
- SNS alarm/budget email subscriptions are created by CI vars but still need a one-time inbox confirmation.
- Playwright's preview server is a production Vite build: it needs the dummy `VITE_USER_POOL_*` values set in `playwright.config.ts` to pass the env guard.

## First Places To Look

- Backend route work: `services/backend/app/routers/`, `services/backend/app/main.py`
- Backend auth: `services/backend/app/dependencies.py`
- Backend persistence: `services/backend/app/db/stores.py`
- Billing: `services/backend/app/routers/billing.py`, `app/secrets.py`, `.claude/skills/polar-billing/`
- Backend tests: `services/backend/tests/`
- Backend deploy/resources: `services/backend/serverless.yml`, `services/backend/resources/`
- AI/RAG: `services/backend/app/ai/`, `services/backend/app/routers/ai.py`, `docs/ai.md`
- Frontend routes/app: `services/frontend/src/routes/`, `services/frontend/src/main.tsx`
- Frontend auth/API: `services/frontend/src/components/auth/auth-gate.tsx`, `services/frontend/src/lib/amplify.ts`, `services/frontend/src/lib/api.ts`
- Frontend generated client: `services/frontend/src/lib/api/generated/`
- Frontend E2E: `services/frontend/playwright.config.ts`, `services/frontend/e2e/`
- Edge/domain: `infrastructure/application-edge.yml`
- Operations/runbooks: `docs/operations.md`, `docs/runbooks/`
- Engineering standards: `docs/engineering-standards.md`
- Agent workflow: `CLAUDE.md`, `.claude/settings.json`, `.claude/skills/`

## Known Gaps

- Global edge deploy is manual (`infrastructure.yml` via workflow_dispatch).
- CloudFront invalidation is not part of frontend deploy; short TTL handles normal rollout latency.
- The deployed live-auth smoke requires manual provisioning (CI-only Cognito app client + test user) before it activates; it skips silently until then.
- SNS email subscriptions require one-time inbox confirmation after first deploy.
- No CloudFront 5xx alarm (CloudFront metrics live only in us-east-1, outside both regional stacks) — observability backlog.
- GitHub OIDC for Actions deferred (risk-accepted long-lived keys + rotation runbook instead).
- AWS cost-allocation tags must be activated in Billing to appear in Cost Explorer.
- Task 18 of the production-readiness plan (trigger production CI run + capture release evidence) awaits the user-action gates in `docs/runbooks/production-release.md`.
