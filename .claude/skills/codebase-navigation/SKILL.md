---
name: codebase-navigation
description: Current codebase structure, agent map, task files, and efficient navigation tips for supio.
---

# Codebase Navigation

Use this skill before broad exploration, plan creation, or agent routing.

## Stack Source Of Truth

Read `.claude/rules/repo-primer.md` first. It describes the active app stack:

- FastAPI backend in `services/backend` (Powertools observability, RFC 9457 errors, paginated lists)
- AWS Lambda/API Gateway through Serverless Framework v4 (X-Ray tracing, least-privilege IAM, usage plan throttle, CloudWatch alarms)
- DynamoDB resources and boto3 persistence through `UserStore`/`ConversationStore`/`BillingStore` (PITR enabled, TTL on webhook idempotency items)
- Polar billing: signed webhook + checkout (`app/routers/billing.py`, `app/secrets.py`; see the `polar-billing` skill)
- Cognito resources and API Gateway authorizer
- Amazon Bedrock chat, tool-use, and Knowledge Base RAG through `services/backend/app/ai/`
- Python tooling through `uv`; quality gates through pytest (≥90% coverage), Ruff, mypy, and Bandit
- CI/deploy through `.github/workflows/backend.yml` and `.github/workflows/frontend.yml`
- React 19 + Vite frontend with generated typed client (`@hey-api/openapi-ts`), Zod validation, Biome, Vitest+MSW
- Supply chain: Dependabot (pip/npm/actions), gitleaks secret scan

Do not assume `apps/web`, Hono, Better Auth, Drizzle/Neon, Cloudflare Workers, Expo, or FastMCP unless a task explicitly adds that stack.

## Current Runtime Files

```text
services/backend/
├── app/
│   ├── main.py              # FastAPI app, Powertools, CorrelationIdMiddleware, RFC 9457 handlers, CORS, Mangum handler
│   ├── models.py            # Domain model (User + SubscriptionStatus, Conversation, Message)
│   ├── schemas.py           # Pydantic schemas: users, AI chat/RAG/agent, conversations, checkout
│   ├── config.py            # Environment-driven app config
│   ├── secrets.py           # Runtime SSM SecureString resolution (Polar secrets), env override
│   ├── dependencies.py      # FastAPI dependencies: stores, Bedrock client, identity/user/admin auth
│   ├── ai/
│   │   ├── bedrock.py       # Bedrock Converse, tool use, retrieve/retrieve_and_generate, AI exceptions
│   │   ├── tools.py         # Agent tool schema + search_knowledge_base executor
│   │   └── fake.py          # Test-only fake Bedrock client for local E2E
│   ├── db/
│   │   └── stores.py        # UserStore/ConversationStore/BillingStore; Page[T], StoreError, cursor helpers
│   └── routers/
│       ├── health.py        # GET /api/v1/health
│       ├── users.py         # GET /api/v1/users/me
│       ├── ai.py            # POST chat/rag/agent; list conversations/messages
│       ├── billing.py       # Polar webhook (signed, idempotent, status mapping) + POST checkout
│       └── admin.py         # User roster, role changes, user conversation listing
├── tests/                   # pytest suite (≥90% coverage)
├── scripts/
│   ├── export_openapi.py    # Dumps openapi.json; re-run after route/schema changes
│   └── ingest_knowledge_base.py  # Uploads seed/ docs to the KB data bucket + starts ingestion
├── seed/                    # Sample knowledge-base corpus
├── iam/
│   └── deploy-policy.json   # Scoped least-privilege policy for the CI deploy user
├── openapi.json             # Committed OpenAPI schema; source of truth for frontend generated client
├── create_dynamodb_locally.py  # Local DynamoDB table bootstrap
├── pyproject.toml           # dependencies, Ruff, Bandit, mypy config
├── serverless.yml           # Lambda/API Gateway; X-Ray tracing, Powertools env vars, tightened IAM
└── resources/
    ├── cognito.yml          # Cognito user pool/client (DeletionPolicy: Retain)
    ├── dynamodb.yml         # DynamoDB table + GS1 (PITR, TTL attr `ttl`, prod deletion protection)
    ├── bedrock.yml          # Knowledge Base + S3 Vectors resources for RAG
    └── monitoring.yml       # Alarms (Lambda/APIGW/DynamoDB/Bedrock), SNS topic + email subs, usage plan, budget
```

Frontend key files (additions since last nav update):

```text
services/frontend/src/
├── lib/
│   ├── api.ts                       # @hey-api client wrapper; ApiError; Zod validation
│   ├── api/
│   │   ├── generated/               # Committed generated client (types, sdk, zod, client/)
│   │   └── adapters.ts              # Envelope adapter for { results, next_cursor } list responses
│   └── error-message.ts             # friendlyError() for RFC 9457 error display
├── components/
│   ├── ai/                          # Chat thread, composer, sidebar, mode switcher, message UI
│   ├── error-state.tsx              # Inline error/empty state
│   └── route-error.tsx              # Per-route error boundary
├── hooks/
│   ├── use-ai.ts                    # TanStack Query hooks for chat/RAG/agent/conversations/messages
│   ├── use-admin.ts                 # Admin user/conversation hooks
│   ├── use-current-user.ts          # Caller profile + isAdmin (role lives in DynamoDB, not the token)
│   └── use-subscription.ts          # Subscription state derived from the profile
├── routes/
│   ├── chat.tsx                     # AI chat, RAG, and agent tab UI (AuthGate)
│   ├── billing.tsx                  # Subscription status + Polar checkout (AuthGate)
│   └── admin.tsx                    # User/admin conversation management (AuthGate)
└── test/
    ├── msw/
    │   ├── handlers.ts              # MSW request handlers
    │   └── server.ts                # MSW server setup
    ├── setup.ts                     # Vitest global setup (jest-dom, MSW lifecycle)
    └── utils.tsx                    # Shared render helpers
services/frontend/
├── biome.json                       # Biome lint/format config
├── openapi-ts.config.ts             # @hey-api/openapi-ts codegen config
└── vitest.config.ts                 # Vitest config (jsdom, @ alias, MSW setup)
```

Other key files:

- `CLAUDE.md`: Central AI workflow rules
- `.claude/settings.json`: hooks, permissions, and skills
- `.claude/tasks/`: plan and session artifacts
- `.claude/commands/team-plan.md`: planning command
- `.claude/commands/build.md`: plan-file implementation command
- `.claude/commands/team-build.md`: multi-agent build command
- `.github/workflows/backend.yml`: backend CI and deploy
- `.github/workflows/frontend.yml`: frontend CI and deploy (includes generated-client drift check)
- `.github/workflows/infrastructure.yml`: manual global edge stack deploy (CloudFront/Route 53)
- `.github/workflows/security.yml`: gitleaks secret scan
- `.github/dependabot.yml`: weekly dependency updates
- `docs/runbooks/`: production-release, incident-response, key-rotation runbooks
- `docs/release-evidence/`: AC-to-command evidence bundle for releases
- `justfile`: `just check` / `just check-backend` / `just check-frontend` / `just audit` / `just sbom` / `just release-evidence`

## Agent Map

Use current agent files only:

- `master-orchestrator`: complex planning and task enrichment
- `backend-engineer`: FastAPI, Lambda/API Gateway, Cognito/JWT, DynamoDB, Serverless
- `database-platform-engineer`: DynamoDB PK/SK/GS1 access patterns and `ConversationStore`/`UserStore`
- `ci-release-engineer`: GitHub Actions, uv, pytest, Ruff, Bandit, npm ci, Serverless
- `security-auditor`: Cognito/API Gateway auth, JWT claims, IAM, CORS, secrets, OWASP
- `quality-engineer`: pytest, FastAPI TestClient, moto, quality gates
- `debugger-detective`: root-cause debugging
- `performance-optimizer`: Lambda/API latency, cold starts, DynamoDB queries, package size
- `deep-researcher`: external docs and best practices, Context7-first for library docs
- `docs-automation-specialist`: README, API docs, changelogs, docs drift
- `code-simplifier`: focused simplification and refactoring
- `visual-explainer`: diagrams and self-contained HTML summaries
- `session-librarian`: task/session artifact organization

Out-of-stack agents may exist in `.claude/agents/`, but they are not part of the default repo workflow. Use them only after the user explicitly introduces that domain and current documentation has been checked.

## Task Files

Plan files in `.claude/tasks/` are the primary handoff artifact. `session-current.md` is optional and may not exist.

When a command or agent receives a plan path, use that file as source of truth. If no plan path exists, inspect `.claude/tasks/` and ask for clarification only when multiple active plans conflict.

## Navigation Commands

Prefer exact searches for known strings:

```bash
rg -n "ConversationStore|UserStore|Bedrock|FastAPI|serverless|Cognito|DynamoDB" services/backend .claude
rg --files services/backend .claude .github
```

For semantic code understanding, use Auggie/codebase retrieval when available, then confirm exact references with `rg`.
