---
name: moto-test-fixtures
description: "Use when adding tests that need to mock AWS services. Produces Moto-based pytest fixtures that mirror the project's real infrastructure (DynamoDB tables, S3 buckets, SQS queues, SNS topics, Cognito user pools). Triggers include add a test for this store, scaffold the moto fixture, and mock DynamoDB in the tests. Not for live AWS integration tests -- moto is in-memory."
---

# Moto Test Fixture Scaffolder

You write pytest fixtures that use [Moto](https://docs.getmoto.org/en/latest/) to mock AWS services in-memory. Your goal is that the test setup **mirrors the real infrastructure** -- the fixture creates tables, buckets, queues with the same key schemas and configuration as production, so tests catch mismatches before they reach staging.

This is the fixture-scaffolding companion to the broader `testing-advanced` skill: use `testing-advanced` for overall test strategy/coverage, and this skill when you specifically need to stand up a Moto fixture that matches the IaC.

## Process

1. **Detect the existing test layout.** Check:
   - Is there a `conftest.py` with shared fixtures, or a single test module that defines fixtures at the top? Add to the existing structure rather than duplicating. (This repo uses a `services/backend/tests/` package with shared fixtures in `tests/conftest.py` and domain test modules alongside.)
   - Pytest version and style (`pytest` fixtures vs plain `setup/teardown`).
   - Moto version (0.x-4.x are per-service decorators; **5.x is `@mock_aws` / `mock_aws()` for everything**).
   - Test client style (FastAPI `TestClient`, async `httpx.AsyncClient`, plain pytest).
   - Whether fixtures use `yield` (context-managed resources) or `return`.

2. **Detect the real AWS resources.** From the project's IaC (_serverless.yml_, CloudFormation, Terraform, CDK), extract:
   - Table definitions: name, key schema (PK, SK, types), GSIs with their keys and projection type, billing mode.
   - Bucket definitions: name, versioning, encryption, public access config.
   - Queue definitions: name, FIFO or standard, visibility timeout, DLQ.
   - Topic definitions: name, subscriptions.
   - User pools: name, attributes, Lambda triggers (skip the triggers in tests).

   The fixture must replicate all of this. A test that creates a DynamoDB table with only a PK will pass even if the production table requires a PK+SK -- that's a silent bug you must avoid.

3. **Pick the right Moto decorator.** For Moto 5.x, use `@mock_aws` (or `with mock_aws():`) everywhere -- it mocks all services in one decorator. For older versions, use the per-service decorator (`@mock_dynamodb`, `@mock_s3`). Detect the version from `pyproject.toml` / `requirements.txt`.

4. **Choose a fixture scope.** Default to **function scope** -- each test gets a fresh mocked environment. Only use `module` or `session` scope if the setup is genuinely expensive (usually it isn't with Moto), and only after you've verified that tests don't leak state into each other.

5. **Structure the fixture.** The pattern is:
   - Enter the mock context.
   - Create the resource with the exact production config.
   - Patch any env vars / config the application reads (`AWS_REGION`, `TABLE_NAME`, `BUCKET_NAME`) via `monkeypatch`, **or** inject the resource into the app through its own seam (see step 6).
   - Yield the resource, or the identifier the app needs (e.g. the table name).
   - (Teardown is automatic when the mock context exits.)

6. **Wire in the application.** The application's boto3 calls need to hit the mock. Two clean approaches:
   - **Dependency injection (preferred when available).** If the app exposes a seam -- e.g. FastAPI dependencies like `get_user_store` or `get_conversation_store` (from `app.dependencies`) -- override it to return an object bound to the mocked resource. This is how this repo wires tests; it's cleaner than env patching because it avoids import-time ordering problems.
   - **Environment patching (fallback).** If the app constructs boto3 clients from env/config with no seam, set the env vars before the app imports/reads them. `@mock_aws` patches the boto3 session globally, so an unconfigured client hits the mock. If the app passes a custom `endpoint_url` (e.g. DynamoDB Local for dev), the fixture must **not** pass that endpoint; use the default. Match the app's region.

7. **Provide helpers.** In addition to the base fixture, offer:
   - A **factory/helper fixture** for test data (e.g. `make_token(sub="sub-1", email="user@example.com")`, `Conversation.create(...)`, or `Message.create(...)`).
   - A **seeded fixture** that pre-populates the resource with a standard dataset, useful for list/query tests.

8. **Write assertions that hit the resource.** After the system-under-test makes a call, the test should verify both the return value and the mocked resource state (e.g. `table.scan()["Count"] == 1`). Double-sided assertions catch subtle bugs (the function returns success but wrote nothing).

## Heuristics

- **Mirror production exactly.** The key schema, GSI projection type, and billing mode must match. If production has `BillingMode: PAY_PER_REQUEST`, the fixture must too -- Moto behaves differently for provisioned vs on-demand in edge cases.
- **Region matters.** Some Moto services behave differently in different regions. Pin the region in both the fixture (`AWS_DEFAULT_REGION`) and the boto3 calls; use the project's real region (this repo: `eu-west-1`).
- **Env vars before imports.** If the application reads `TABLE_NAME` at import time (not at call time), you must set the env var **before** the application module is imported -- or, better, use a dependency seam so import order doesn't matter.
- **Function scope by default.** Moto is cheap; test isolation is precious. Don't optimize for speed unless your tests are actually slow.
- **One fixture per resource, one combined fixture for convenience.** Expose `dynamodb_table`, `s3_bucket`, `sqs_queue` as individual fixtures, plus a combined `aws_env` fixture that pulls them in when a test needs more than one.
- **Install the Moto extras you mock.** Moto's service backends are gated behind extras (e.g. `moto[dynamodb]`, `moto[s3]`). If you scaffold an S3 fixture in a repo that only depends on `moto[dynamodb]`, add the extra first or the mock won't load.
- **Test the error paths.** Use Moto's state to simulate error conditions -- delete an item, then assert the app returns 404. Don't monkeypatch boto3 to raise an exception; use the real (mocked) service to produce realistic errors.

## Common mistakes to flag

- Creating a table with only a partition key when production has a partition + sort key. Tests pass, prod fails with `ValidationException: The number of conditions on the keys is invalid`.
- Forgetting to define GSIs in the fixture. Queries on the GSI raise `ResourceNotFoundException` in tests but pass in prod (or vice versa).
- Not setting `AWS_DEFAULT_REGION`. boto3 may refuse to create a client, or Moto may mock a different region than the app uses.
- Using a fixture that returns a client instead of wiring the app's own boto3 call to the mock. Then a test that imports boto3 directly creates a real (or differently-mocked) client. Prefer a dependency seam, or patch the environment so the application's own call gets the mock.
- Session-scoped fixtures that mutate state. One test populates data, the next test relies on it without realizing -- brittle.
- Mocking only what's under test. If the function makes two AWS calls (DynamoDB + SQS), mock both. Half-mocked tests make real calls and fail in CI.
- Asserting on mock internals. Tests should assert on the mocked service's state (`table.scan()`), not on boto3 method call arguments via `unittest.mock`. The former tests behavior; the latter tests implementation.

## Worked example: DynamoDB single-table fixture

This mirrors the fixture style already in `services/backend/tests/conftest.py`. The fixture yields the **table name** (a string), and the app is wired via FastAPI `dependency_overrides`.

```python
import boto3
import jwt
import pytest
import uuid
from moto import mock_aws

from app.main import app
from app.dependencies import get_conversation_store, get_user_store
from app.models import Conversation
from app.db.stores import ConversationStore, UserStore

TABLE_NAME = "test-table"


@pytest.fixture
def aws_credentials(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-west-1")


@pytest.fixture
def dynamodb_table(aws_credentials):
    with mock_aws():
        client = boto3.client("dynamodb", region_name="eu-west-1")
        client.create_table(
            TableName=TABLE_NAME,
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GS1PK", "AttributeType": "S"},
                {"AttributeName": "GS1SK", "AttributeType": "S"},
            ],
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GS1",
                    "KeySchema": [
                        {"AttributeName": "GS1PK", "KeyType": "HASH"},
                        {"AttributeName": "GS1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
        )
        yield TABLE_NAME


@pytest.fixture
def user_store(dynamodb_table):
    return UserStore(table_name=dynamodb_table)


@pytest.fixture
def conversation_store(dynamodb_table):
    return ConversationStore(table_name=dynamodb_table)


@pytest.fixture
def client(user_store, conversation_store):
    app.dependency_overrides[get_user_store] = lambda: user_store
    app.dependency_overrides[get_conversation_store] = lambda: conversation_store
    from starlette.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_user_store, None)
    app.dependency_overrides.pop(get_conversation_store, None)


def make_token(sub: str, email: str = "user@example.com") -> str:
    return jwt.encode({"sub": sub, "email": email}, "test-secret-with-at-least-32-bytes", algorithm="HS256")
```

A test using it:

```python
def test_list_conversations_returns_only_owner_items(client, conversation_store):
    conversation_store.create_conversation(Conversation.create(uuid.uuid4(), "sub-a", "Owned"))
    conversation_store.create_conversation(Conversation.create(uuid.uuid4(), "sub-b", "Other"))

    response = client.get(
        "/api/v1/ai/conversations",
        headers={"Authorization": f"Bearer {make_token('sub-a')}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [item["title"] for item in payload["results"]] == ["Owned"]
```

## This repo's conventions (supio)

The canonical fixtures already live in `services/backend/tests/conftest.py`. Match them rather than inventing a new style:

- **Moto 5.x.** `moto[dynamodb]>=5.2.1` is the dev dependency, so use the unified `mock_aws` (imported as `from moto import mock_aws`) as a context manager. Only the `dynamodb` extra is installed -- scaffolding an S3/SQS/SNS fixture requires adding the matching extra (e.g. `moto[s3]`) to `pyproject.toml` first.
- **`tests/` package.** Shared fixtures live in `tests/conftest.py`; domain tests in `tests/test_*.py` files. Add new fixtures to `conftest.py` and new tests to the appropriate domain module.
- **`aws_credentials` fixture** sets dummy creds plus region: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SECURITY_TOKEN`, `AWS_SESSION_TOKEN`, and `AWS_DEFAULT_REGION=eu-west-1`. Reuse it; don't re-invent credential setup.
- **`dynamodb_table` yields the table-name string**, not the table resource, and the test table is named `"test-table"`. Construct stores with `UserStore(table_name=dynamodb_table)` and `ConversationStore(table_name=dynamodb_table)`. No `wait_until_exists()` call is needed -- Moto creates synchronously.
- **App wiring is dependency injection, not env patching.** Override `get_user_store` and `get_conversation_store`, then create `TestClient(app)`; pop overrides on teardown. Override `get_bedrock_client` separately when an endpoint calls Bedrock.
- **Schema must match the real table** (`services/backend/resources/dynamodb.yml`): `PK`/`SK`, GSI `GS1` with `GS1PK`/`GS1SK`, projection `ALL`, `PAY_PER_REQUEST`, and PITR in IaC. Items use entity-prefixed keys (`USER#<sub>`, `CONVMETA#<id>`, `CONVMSG#<id>#<ts>#<msg_id>`); the fixture only declares key attributes -- stores write the prefixed values.
- **Auth in tests is a signed JWT with `sub` and `email`, not a mocked Cognito pool.** Don't use `cognito:username` as a key. Endpoint tests pass the token in the `Authorization` header and rely on `get_current_identity()` extracting `sub` and display-only `email`.
- **Run with uv:** `uv run pytest tests/` from `services/backend`.

## Output format

Always output, in order:

1. **Detected layout** -- one paragraph (pytest version, Moto version, existing conftest/test module, region convention).
2. **Fixture(s)** -- the full Python code, ready to paste into the test module (or `conftest.py` if one exists).
3. **Example test** -- one short test that demonstrates how to use the fixture.
4. **Notes** -- any assumptions about the application code (e.g. "this assumes the app exposes `get_user_store`/`get_conversation_store` dependencies; if it constructs stores internally, patch env/config instead").
