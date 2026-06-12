---
name: fastapi-aws
description: Use for this repo's FastAPI backend on AWS Lambda/API Gateway with Serverless Framework, DynamoDB, Cognito/JWT auth, Powertools observability, uv, pytest, Ruff, mypy, and Bandit.
---

# FastAPI AWS Backend

Use this skill for backend, API, auth, database, deployment, and CI work in this repo.

## Read First

1. `CLAUDE.md`
2. `.claude/rules/repo-primer.md`
3. The active plan file in `.claude/tasks/`, when one is provided
4. The files directly touched by the task

Treat `.claude/rules/repo-primer.md` as the stack source of truth. Do not assume task CRUD, Hono, Cloudflare Workers, Better Auth, Drizzle, Neon, or `apps/web` unless the current task explicitly adds them.

## Current Runtime

- App: `services/backend/app/main.py` (Powertools Logger/Tracer/Metrics, `CorrelationIdMiddleware`, RFC 9457 exception handlers)
- Domain model: `services/backend/app/models.py` (`User` with `SubscriptionStatus`, `Conversation`, `Message`)
- API schemas: `services/backend/app/schemas.py` (`UserList`, `ConversationList`, and `MessageList` include `next_cursor`; use `.from_page()`)
- Persistence boundary: `services/backend/app/db/stores.py` (`UserStore`, `ConversationStore`, `BillingStore`; `Page[T]`, `StoreError`, `InvalidCursorError`, cursor helpers)
- Secret resolution: `services/backend/app/secrets.py` (runtime SSM SecureString fetch with direct env override; missing parameter resolves to `None` for graceful 503)
- FastAPI dependencies: `services/backend/app/dependencies.py` (`get_user_store`, `get_conversation_store`, `get_bedrock_client`, auth deps)
- AI runtime: `services/backend/app/ai/` (`BedrockClient`, Converse, RAG, tool-use executor, fake E2E client)
- Route handlers: `services/backend/app/routers/` (`health.py`, `users.py`, `admin.py`, `ai.py`, `billing.py`)
- Environment config: `services/backend/app/config.py`
- Deployment: `services/backend/serverless.yml` (X-Ray tracing, Powertools env vars, least-privilege IAM, Bedrock env)
- AWS resources: `services/backend/resources/cognito.yml`, `services/backend/resources/dynamodb.yml` (PITR), `services/backend/resources/bedrock.yml`, `services/backend/resources/monitoring.yml`
- OpenAPI schema: `services/backend/openapi.json` (committed; regenerate with `uv run python scripts/export_openapi.py`)
- Tests: `services/backend/tests/` (package; `conftest.py` holds shared fixtures)
- Python tooling: `services/backend/pyproject.toml` (mypy config, boto3-stubs)
- CI/deploy: `.github/workflows/backend.yml`

## Implementation Rules

- Keep FastAPI route handlers thin: validate input, call domain/store code, return schema models.
- Keep DynamoDB access behind `UserStore`, `ConversationStore`, and `BillingStore`; do not spread boto3 calls through route handlers.
- Billing work (Polar webhook/checkout/subscription state) follows the `polar-billing` skill: TYPE discriminator, payload-status mapping, idempotency marker only after successful processing.
- Preserve the existing PK/SK and GS1 access patterns unless the task explicitly changes the data model.
- Use Pydantic schemas for request/response contracts.
- Error responses must use RFC 9457 `application/problem+json`. Register new exception types as global handlers in `app/main.py` using `_problem_response()`.
- List endpoints paginate via `limit`/`cursor` query params. Store methods return `Page[T]`; route handlers call `.from_page()` to build `UserList`, `ConversationList`, or `MessageList` with `next_cursor`.
- Use Powertools Logger/Tracer/Metrics for structured observability. Never log tokens, claims, or secrets.
- Keep Lambda/API Gateway constraints in mind: bounded work, explicit timeouts, small packages, and environment-driven configuration.
- Bedrock chat/agent/RAG code must degrade through existing exceptions: `AINotConfiguredError` -> 503, `AIThrottledError` -> 429, `AIServiceError` -> 502.
- Do not add streaming responses without changing the transport design; API Gateway REST + Mangum is not the current streaming surface.
- Do not add new infrastructure, dependencies, or abstractions unless the task requires them.
- Do not hand-edit `uv.lock` unless dependencies changed through uv.
- When routes or schemas change, re-export `openapi.json` with `uv run python scripts/export_openapi.py`; if the frontend consumes the route, also regenerate the typed client with `npm run generate:api` from `services/frontend`.

## Auth And Security

- API Gateway Cognito authorizer is part of the deployed security boundary.
- Local JWT decoding in app code is for extracting `sub` and `email` after gateway authorization. Do not expand it into a custom trust boundary without verifying signatures.
- Key owner-scoped data by Cognito `sub`, never by email or `cognito:username`.
- Validate authorization at the object-owner/access-pattern level, not just at route entry. Conversation reads/writes must remain owner-scoped.
- Do not log tokens, Authorization headers, Cognito claims wholesale, secrets, or raw credentials.
- Keep CORS changes explicit. `ALLOWED_ORIGINS` is required outside development.

## Verification

Run verification from `services/backend` unless the task says otherwise:

```bash
uv run pytest tests/
uv run ruff format . --check
uv run ruff check .
uv run mypy app
uv run bandit -r . -c pyproject.toml
uv run python scripts/export_openapi.py   # after route/schema changes
```

For deploy-related changes, also inspect `.github/workflows/backend.yml` and `serverless.yml` together. Use npm only for Serverless Framework commands in `services/backend`; `npm test` is currently a placeholder and should not be used as the backend test command.
