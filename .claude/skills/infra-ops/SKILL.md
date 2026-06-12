---
name: infra-ops
description: Infrastructure operations for this repo, centered on AWS Lambda/API Gateway, Serverless Framework, DynamoDB, Cognito, GitHub Actions, uv, npm ci, and deployment quality gates.
---

# Infrastructure Operations

Use this skill for deployment, CI, environment, AWS resource, and operational work.

## Active Defaults

The active infrastructure for this repo is:

- AWS Lambda behind API Gateway with X-Ray active tracing (`tracing: { lambda: true, apiGateway: true }`)
- Serverless Framework v4 from `services/backend`
- DynamoDB table resources in `services/backend/resources/dynamodb.yml` (PITR enabled)
- Cognito resources in `services/backend/resources/cognito.yml`
- Bedrock Knowledge Base and S3 Vectors resources in `services/backend/resources/bedrock.yml`
- CloudWatch alarms, SNS alarm topic, and API Gateway usage plan throttle in `services/backend/resources/monitoring.yml`
- CloudFront/S3/API Gateway edge stack in `infrastructure/application-edge.yml`
- GitHub Actions workflows in `.github/workflows/backend.yml`, `.github/workflows/frontend.yml`, `.github/workflows/infrastructure.yml`, and `.github/workflows/security.yml`
- Python dependency and quality tooling through `uv`
- npm only for Serverless Framework commands
- Supply chain: Dependabot (`.github/dependabot.yml`) and gitleaks (`.github/workflows/security.yml`)

Do not assume Cloudflare Workers, Fly.io, EAS, Coolify, VPS, Docker, or Drizzle migrations unless the user explicitly asks for that infrastructure.

## Read First

1. `.claude/rules/repo-primer.md`
2. `services/backend/serverless.yml`
3. `services/backend/resources/cognito.yml`
4. `services/backend/resources/dynamodb.yml`
5. `services/backend/resources/bedrock.yml`
6. `services/backend/resources/monitoring.yml`
7. `infrastructure/application-edge.yml` for CloudFront/domain/API proxy changes
8. `.github/workflows/backend.yml`, `.github/workflows/frontend.yml`, and `.github/workflows/infrastructure.yml`
9. `.github/dependabot.yml` and `.github/workflows/security.yml` for supply-chain changes

## Rules

- Keep deployment changes environment-driven and stage-aware.
- Keep secrets in GitHub secrets or deployment environment configuration; do not commit `.env` files or credentials.
- Review IAM/resource changes together with `serverless.yml` and the CloudFormation resource files.
- Lambda IAM is least-privilege: `Query`, `GetItem`, `PutItem`, `UpdateItem` on the DynamoDB table and GS1 index; `xray:PutTraceSegments` and `xray:PutTelemetryRecords`; `ssm:GetParameter(s)` scoped to the project's `polar/*` parameter path. Do not add `Scan`, `DeleteItem`, or `DescribeTable` unless an access pattern explicitly requires them.
- The deploy (CI) IAM user uses the scoped policy committed at `services/backend/iam/deploy-policy.json`; review it together with any new resource type.
- Bedrock permissions are scoped to model invoke and Knowledge Base retrieve/generate. Keep model IDs, inference profiles, and KB ARNs in sync with `serverless.yml` and `resources/bedrock.yml`.
- The Polar webhook is public by design and protected by signature verification in application code. CloudFront must forward `webhook-id`, `webhook-timestamp`, and `webhook-signature`.
- DynamoDB PITR is enabled; do not disable it.
- X-Ray active tracing is enabled for Lambda and API Gateway. The `@tracer.capture_lambda_handler` decorator in `app/main.py` depends on the IAM grants in `serverless.yml`; keep them in sync.
- API Gateway usage plan throttle (burst 200/rate 100) is defined in `monitoring.yml`. Adjust after load testing; do not remove without a replacement.
- SNS alarm/budget email subscriptions are created by CI repo variables (`ALARM_NOTIFICATION_EMAIL`, `BUDGET_NOTIFICATION_EMAIL`) but require a one-time inbox confirmation after first deploy.
- AWS/Bedrock alarms require the `ModelId` dimension (metrics are per-model); the dimension default in `monitoring.yml` must track `BEDROCK_MODEL_ID` and the Bedrock IAM resource ARNs.
- All deploy jobs target stage `production` under the `production` GitHub Environment; `APP_ENVIRONMENT` is deliberately NOT at workflow scope in `backend.yml` (the test job imports `app.main`, which requires `ALLOWED_ORIGINS` outside development).
- Step-level `if:` must gate on the `env` context, not `secrets.*` (surface secrets as job env first).
- Deploy jobs in `backend.yml` and `frontend.yml` gate on `github.ref == 'refs/heads/main' && github.actor != 'dependabot[bot]'`. Do not widen these conditions without understanding the secrets-access implications.
- Preserve CI quality gates unless the task explicitly changes the release process.
- Use `uv export --frozen --no-dev --no-editable --no-hashes -o requirements.txt` only as a deploy artifact step.
- Use `npm ci` and `npx serverless ...` from `services/backend` for Serverless operations.
- Do not use `npm test`; backend tests run through pytest.

## Verification

For infrastructure-only changes, inspect config and run the narrow checks that apply. For backend deploy changes, prefer:

```bash
cd services/backend
uv run pytest tests/
uv run ruff format . --check
uv run ruff check .
uv run mypy app
uv run bandit -r . -c pyproject.toml
npm ci
ALLOWED_ORIGINS='https://www.supio.app' npx serverless package --stage production
```

Inspect the synthesized template at `.serverless/cloudformation-template-update-stack.json` for resource-level assertions (alarm dimensions, retain policies, env var names).

Or use the root quality gate:

```bash
just check-backend
```

Only run real deploy commands when the user explicitly asks for deployment and credentials are available.
