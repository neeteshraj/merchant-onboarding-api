# ADR-0004: Signed, idempotent KYB provider webhook

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Real KYB vendors often finish checks asynchronously and report back via an HTTP callback. That endpoint is public, the vendor retries on any non-2xx response, and duplicates and out-of-order deliveries are normal.

## Decision

- **Endpoint.** `POST /webhooks/kyb` is `@Public()` (no JWT) and protected by `KybWebhookSignatureGuard`.
- **Signature format.** The `x-kyb-signature` header is `t=<unix seconds>,v1=<hex HMAC-SHA256("<t>.<raw body>")>`:
  - It is computed over the **raw bytes** (`rawBody: true`), never re-serialized JSON.
  - The timestamp is signed, and requests outside `KYB_WEBHOOK_TOLERANCE_SECONDS` are refused, which bounds replays.
  - Multiple `v1` values are accepted, so the shared secret can be rotated.
  - Comparison is constant-time.
- **Order of checks.** The guard runs before validation, so unauthenticated callers get 401 and learn nothing about the schema.
- **Exactly-once per event.** `webhook_events` has `UNIQUE (provider, event_id)`. The service runs `INSERT … ON CONFLICT DO NOTHING RETURNING id` and applies the result **in the same transaction**:
  - Already seen → `200 { status: 'duplicate' }`.
  - Applying fails → the transaction rolls back, the event is not recorded, and the vendor's retry is processed.
  - Concurrent duplicates block on the unique index until the first commits, then become `duplicate`.
- **Shared write path.** Results go through `RiskReviewService.recordResult` / `markFailed` (ADR-0003). A callback for a stale version, or for a review the worker already settled, returns `200 { status: 'ignored' }`. It is still 2xx, so the vendor stops retrying.

## Consequences

- The worker and the webhook can race safely. The e2e suite holds the worker's provider call open, delivers the webhook, then releases the worker and asserts only the webhook's result is stored.
- The secret is a single shared value; per-vendor secrets would need a provider field in the signature lookup.
- The stored payload is redacted, so ops can inspect deliveries without seeing personal data.
