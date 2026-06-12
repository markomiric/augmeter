---
name: polar-billing
description: "Polar.sh billing integration for this repo: signed webhook handling, webhook-id idempotency, subscription status mapping, checkout creation, and SSM secret resolution. Use when working on app/routers/billing.py, BillingStore, subscription state, Polar webhooks/checkout, or billing tests. Not for other payment providers."
---

# Polar Billing

Repo-specific knowledge for the Polar integration. Verified against the live implementation (`services/backend/app/routers/billing.py`, `app/db/stores.py`, `app/secrets.py`) and Polar's documentation.

## Architecture

- `POST /api/v1/billing/webhook` — public route (bypasses the Cognito authorizer like `/health`). Trust comes from `polar_sdk.webhooks.validate_event` (Standard Webhooks signature + replay window). CloudFront forwards the `webhook-id` / `webhook-timestamp` / `webhook-signature` headers (whitelisted in `infrastructure/application-edge.yml`).
- `POST /api/v1/billing/checkout` — authenticated. Creates a Polar checkout tagged with the caller's Cognito `sub` as `external_customer_id`, which is how the webhook maps back to `UserStore` with no extra lookup table.
- Subscription state lives on the user profile item (`subscription_status`, `subscription_plan`, `polar_customer_id`, `subscription_updated_at`); app enum is `none/active/past_due/canceled`.

## Sharp edges (each one bit us once)

1. **Event discriminator is `TYPE`, not `type`.** The generated payload models expose the discriminator as the `TYPE` field with serialization alias `"type"`. `getattr(event, "type")` returns nothing on real SDK events. Use `_event_type()` in `billing.py` (reads `TYPE`, falls back to `type` for fakes). A characterization test pins this with `WebhookSubscriptionUpdatedPayload.model_construct()`.
2. **`subscription.updated` is Polar's documented catch-all.** Never derive status from the event name when the payload carries one: `_target_status()` prefers `event.data.status` (Polar values: `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`) and falls back to the event-name map. Handled event set: `subscription.created/updated/active/canceled/uncanceled/revoked/past_due`.
3. **Idempotency marker AFTER success.** `BillingStore.was_recorded(webhook_id)` is checked early (duplicate → `{"status":"replayed"}`); `try_record_webhook(webhook_id)` (conditional PutItem, `PK=WEBHOOK#polar`, `SK=ID#<id>`, `ttl` +30 days) runs only after processing succeeds. A 5xx therefore leaves no marker and Polar's retry is fully reprocessed. Concurrent duplicates are safe because the profile update is an idempotent overwrite.
4. **Secrets resolve at runtime, never deploy time.** `app/secrets.py` reads `POLAR_WEBHOOK_SECRET_PARAM` / `POLAR_ACCESS_TOKEN_PARAM` (SSM SecureString names) at runtime, with `POLAR_WEBHOOK_SECRET` / `POLAR_ACCESS_TOKEN` env overrides for local/tests. Never use `${ssm:...}` in `serverless.yml` for these — that bakes the secret into the CFN template and Lambda env. A missing parameter resolves to `None` → graceful 503; other SSM errors propagate.
5. **Pin client-supplied `success_url`.** It is a post-payment redirect target: `_is_allowed_success_url()` requires it to sit on a configured `ALLOWED_ORIGINS` origin (dev wildcard stays open). Off-origin → 400.
6. **Polar secret encoding is non-standard.** Polar signs with the full secret string, not the base64-decoded form the Standard Webhooks spec implies. Always use `polar_sdk.webhooks.validate_event`; never hand-roll verification. `validate_event` can also raise `ValueError` on malformed signature headers — map it to 401 alongside `WebhookVerificationError`.

## Configuration

| Variable                                                  | Kind              | Purpose                                                            |
| --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| `POLAR_WEBHOOK_SECRET_PARAM` / `POLAR_ACCESS_TOKEN_PARAM` | env (SSM names)   | Runtime secret resolution; set in `serverless.yml`                 |
| `POLAR_WEBHOOK_SECRET` / `POLAR_ACCESS_TOKEN`             | env (values)      | Local/test overrides only; never commit                            |
| `POLAR_PRODUCT_ID`                                        | env / CI repo var | Checkout product; unset → checkout 503 (no frontend gating either) |
| `POLAR_CHECKOUT_SUCCESS_URL`                              | env / CI repo var | Server-side default redirect (trusted as-is)                       |

Provisioning (Polar dashboard, SSM put-parameter, webhook endpoint events) is in `docs/runbooks/production-release.md`; secret rotation in `docs/runbooks/key-rotation.md`.

## Frontend

- `src/routes/billing.tsx` (AuthGate-wrapped): status display + checkout redirect; a 503 from checkout renders the "not configured" panel instead of an error toast — branch on `error instanceof ApiError && error.status === 503`.
- `src/hooks/use-subscription.ts`: derives `isActive`/`isPastDue`/`isCanceled`/`isUnknown` from the `/users/me` profile. Use `isUnknown` to avoid paywall flashes while loading.

## Testing patterns

- Stub `app.routers.billing.validate_event` via monkeypatch to exercise dispatch/idempotency without Polar's HMAC; build fake events with a `TYPE` attribute (mirrors the SDK).
- Use the existing `POLAR_SECRET` constant in `tests/conftest.py` for signature-path tests (`_polar_headers` builds valid Standard Webhooks headers); never add new hardcoded secret literals (Bandit B105).
- Required regression coverage when touching the webhook: idempotent replay, retry-after-StoreError applies (no marker on 5xx), payload-status-over-event-name mapping, SDK `TYPE` discriminator characterization.
- Checkout: patch `sys.modules["polar_sdk"]` with a fake `Polar` class (lazy import in the route makes this clean); assert `external_customer_id == sub`.

## Verification

```bash
cd services/backend
uv run pytest tests/ -k "billing or polar or subscription"
uv run pytest tests/            # full suite before completion claims
```
